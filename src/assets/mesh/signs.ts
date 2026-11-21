import { TEXTURES, signShape } from '../tex';
import { MeshBuilder, V3 } from './builder';
import { Pose, at, box, disc, face, footing, lathe, move, pipe, plate, roll, stand, tilt, turn } from './kit';
import { addModel } from './registry';
import { pole } from './signals';

const ZINC = 'structure/steel-galvanized';
const BLACK = 'signal/housing-black';
const PAD = 'concrete/walk-square';
const O = stand();
const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);

// --- Posts. ---
export type PostKind = 'u' | 'square' | 'rusty' | 'round' | 'wood' | 'black' | 'green';
const POST_JP: Record<PostKind, string> = { u: 'U形鋼柱', square: '穴あき角柱', rusty: '錆びた角柱', round: '丸パイプ柱', wood: '木柱', black: '黒い装飾柱', green: '緑の装飾柱' };

/** Sign post standing on the pose; returns the distance from its axis to its front face. */
export function post(b: MeshBuilder, f: Pose, kind: PostKind, h: number): number {
  if (kind === 'u') {
    // Flanged channel, open to the back.
    box(b, 'sign/post-green', f, [0, h / 2, 0.012], [0.022, h / 2, 0.002]);
    for (const sx of [-1, 1]) {
      box(b, 'sign/post-green', f, [sx * 0.022, h / 2, 0], [0.002, h / 2, 0.014]);
      box(b, 'sign/post-green', f, [sx * 0.031, h / 2, -0.013], [0.01, h / 2, 0.002]);
    }
    return 0.014;
  }
  if (kind === 'square' || kind === 'rusty') {
    const tex = kind === 'rusty' ? 'sign/post-perforated-rusty' : 'sign/post-perforated';
    box(b, tex, f, [0, h / 2, 0], [0.025, h / 2, 0.025]);
    box(b, ZINC, f, [0, 0.06, 0], [0.029, 0.06, 0.029]);
    return 0.025;
  }
  if (kind === 'wood') {
    box(b, 'sign/post-wood', f, [0, h / 2, 0], [0.045, h / 2, 0.045]);
    return 0.045;
  }
  if (kind === 'round') {
    pole(b, f, { h, r0: 0.03, tex: ZINC, base: 'buried', sides: 8 });
    return 0.03;
  }
  const r0 = kind === 'black' ? 0.04 : 0.045;
  pole(b, f, { h, r0, tex: kind === 'black' ? 'signal/pole-black' : 'signal/pole-green', base: kind === 'black' ? 'cast' : 'fluted', cap: 'ball' });
  return r0;
}

// --- Signs stacked on one post. ---
export interface Item {
  id: string;
  /** Turned around the post, degrees. */
  yaw?: number;
  /** Space above this row. */
  gap?: number;
  /** Sign on the back of the post. */
  rear?: string;
  /** Depth the right-hand edge is bent back by. */
  bend?: number;
  /** Crooked on its bolts, degrees. */
  crooked?: number;
}
type Row = string | Item | (string | Item)[];
export interface PostOpts {
  kind?: PostKind;
  /** Height of the lowest sign's bottom edge. */
  clear?: number;
  items: Row[];
  /** Whole assembly leaning sideways / forwards, degrees. */
  lean?: number;
  pitch?: number;
  /** Post sticking out above the top sign. */
  above?: number;
}
const backOf = (id: string): string => (id.endsWith('-old') ? 'sign/back-aluminium-old' : 'sign/back-aluminium');
const bendOf = (w: number, k?: number): ((x: number, y: number) => number) | undefined => (k ? (x, y) => -k * Math.max(0, x / w + 0.15) ** 1.5 * (1 + (0.4 * y) / w) : undefined);

function signAt(b: MeshBuilder, g: Pose, it: Item, z: number): void {
  const id = `sign/${it.id}`;
  const w = b.part(id).mw;
  plate(b, id, it.crooked ? roll(g, it.crooked) : g, [0, 0, z], { back: backOf(it.id), warp: bendOf(w, it.bend) });
  if (it.rear) plate(b, `sign/${it.rear}`, turn(g, 180), [0, 0, z], { back: backOf(it.rear) });
}

/** Signs listed top to bottom on a single post. Returns the pose of the post and the height of its top. */
export function signPost(b: MeshBuilder, f0: Pose, o: PostOpts): [Pose, number] {
  const kind = o.kind ?? 'square';
  const f = roll(tilt(f0, o.pitch ?? 0), o.lean ?? 0);
  const rows = o.items.map((r) => (Array.isArray(r) ? r : [r]).map((i) => (typeof i === 'string' ? { id: i } : i)));
  const size = (i: Item): [number, number] => [b.part(`sign/${i.id}`).mw, b.part(`sign/${i.id}`).mh];
  const heights = rows.map((r) => Math.max(...r.map((i) => size(i)[1])));
  const gaps = rows.map((r, k) => (k === 0 ? 0 : (r[0].gap ?? 0.025)));
  const top = (o.clear ?? 2.1) + sum(heights) + sum(gaps);
  const flat = signShape(`sign/${rows[0][0].id}`) === 'rect';
  const h = top + (o.above ?? (flat ? 0.04 : -0.1 * heights[0]));
  const front = post(b, f, kind, h);
  const spaced = kind === 'round' || kind === 'black' || kind === 'green' || rows.some((r) => r.length > 1);
  const z = front + (spaced ? 0.014 : 0.001);
  let y = top;
  rows.forEach((row, k) => {
    y -= gaps[k];
    const cy = y - heights[k] / 2;
    const widths = row.map((i) => size(i)[0]);
    const width = sum(widths) + 0.04 * (row.length - 1);
    if (spaced) for (const dy of heights[k] > 0.5 ? [-0.3, 0.3] : [0]) box(b, ZINC, f, [0, cy + dy * heights[k], front + 0.006], [row.length > 1 ? width / 2 - 0.1 : 0.05, 0.02, 0.007]);
    let x = -width / 2;
    row.forEach((it, i) => {
      signAt(b, turn(move(f, x + widths[i] / 2, cy, 0), it.yaw ?? 0), it, z);
      x += widths[i] + 0.04;
    });
    y -= heights[k];
  });
  return [f, h];
}

/** Double-sided street-name blades on top of a post, alternately crossed. */
export function blades(b: MeshBuilder, f: Pose, y: number, ids: string[], o: { parallel?: boolean; yaw?: number } = {}): void {
  ids.forEach((name, k) => {
    const id = `sign/street-${name}`;
    const h = b.part(id).mh;
    const y0 = y + k * (h + 0.035);
    box(b, ZINC, f, [0, y0 + 0.0175, 0], [0.028, 0.0175, 0.028]);
    const g = turn(move(f, 0, y0 + 0.035 + h / 2, 0), (o.yaw ?? 0) + (k % 2 && !o.parallel ? 90 : 0));
    plate(b, id, g, [0, 0, 0.003], { back: backOf(name) });
    plate(b, id, turn(g, 180), [0, 0, 0.003], { back: backOf(name) });
  });
}
/** Double-sided sign hung from a bracket on the side of a pole. */
function flag(b: MeshBuilder, f: Pose, y: number, name: string, r: number, side = 1): void {
  const id = `sign/${name}`;
  const p = b.part(id);
  const g = move(f, side * (r + 0.05 + p.mw / 2), y, 0);
  for (const dy of [-1, 1]) box(b, ZINC, f, [side * (r + 0.04), y + dy * (p.mh / 2 - 0.03), 0], [0.045, 0.012, 0.012]);
  plate(b, id, g, [0, 0, 0.003], { back: backOf(name) });
  plate(b, id, turn(g, 180), [0, 0, 0.003], { back: backOf(name) });
}

// --- Wide signs on two or more posts. ---
interface WideOpts {
  id: string;
  kind?: PostKind;
  clear?: number;
  /** Fraction of the width between the posts. */
  spread?: number;
  under?: string;
  rear?: string;
  lean?: number;
}
function wide(b: MeshBuilder, f0: Pose, o: WideOpts): void {
  const f = roll(f0, o.lean ?? 0);
  const id = `sign/${o.id}`;
  const [w, h] = [b.part(id).mw, b.part(id).mh];
  const kind = o.kind ?? 'square';
  const uh = o.under ? b.part(`sign/${o.under}`).mh + 0.03 : 0;
  const clear = (o.clear ?? 1.5) + uh;
  let front = 0;
  for (const sx of [-1, 1]) front = post(b, move(f, (sx * w * (o.spread ?? 0.6)) / 2, 0, 0), kind, clear + h + 0.03);
  const z = front + 0.015;
  for (const dy of [-0.3, 0.3]) box(b, ZINC, f, [0, clear + h / 2 + dy * h, front + 0.007], [w / 2 - 0.04, 0.02, 0.007]);
  plate(b, id, f, [0, clear + h / 2, z], { back: backOf(o.id) });
  if (o.rear) plate(b, `sign/${o.rear}`, turn(f, 180), [0, clear + h / 2, front + 0.002], { back: backOf(o.rear) });
  if (o.under) {
    box(b, ZINC, f, [0, clear - uh / 2, front + 0.007], [w * 0.32, 0.02, 0.007]);
    plate(b, `sign/${o.under}`, f, [0, clear - uh / 2, z]);
  }
}

/** Rolled steel I-section post with a breakaway base on a concrete stub. */
function ibeam(b: MeshBuilder, f: Pose, h: number, s = 0.2): void {
  box(b, PAD, f, [0, 0.04, 0], [s * 1.3, 0.04, s * 1.3], 'Y');
  box(b, ZINC, f, [0, 0.1, 0], [s * 0.75, 0.02, s * 0.75]);
  box(b, ZINC, f, [0, h / 2 + 0.06, 0], [0.005, h / 2 - 0.06, s / 2]);
  for (const sz of [-1, 1]) box(b, ZINC, f, [0, h / 2 + 0.06, (sz * s) / 2], [s * 0.4, h / 2 - 0.06, 0.007]);
}
/** Extruded guide-sign panel with its exit tab and stiffeners; `c` is the panel centre. Returns its size. */
function panel(b: MeshBuilder, f: Pose, c: V3, id: string, tab?: string, tabSide = 1): [number, number] {
  const [w, h] = plate(b, `sign/${id}`, f, c, { thick: 0.025, back: backOf(id) });
  for (const dy of [-0.36, 0, 0.36]) box(b, ZINC, f, [c[0], c[1] + dy * h, c[2] - 0.045], [w / 2 - 0.03, 0.03, 0.02]);
  if (tab) {
    const tw = b.part(`sign/${tab}`).mw;
    const th = b.part(`sign/${tab}`).mh;
    const tx = c[0] + tabSide * (w / 2 - tw / 2);
    plate(b, `sign/${tab}`, f, [tx, c[1] + h / 2 + th / 2, c[2]], { thick: 0.025 });
    for (const sx of [-0.3, 0.3]) box(b, ZINC, f, [tx + sx * tw, c[1] + h / 2 + th / 2 - 0.25, c[2] - 0.045], [0.025, th / 2 + 0.2, 0.02]);
  }
  return [w, h];
}
function guideGround(b: MeshBuilder, f: Pose, o: { id: string; clear?: number; tab?: string; tabSide?: number; posts?: number; size?: number }): void {
  const id = `sign/${o.id}`;
  const [w, h] = [b.part(id).mw, b.part(id).mh];
  const clear = o.clear ?? 2.1;
  const s = o.size ?? 0.2;
  const n = o.posts ?? 2;
  for (let i = 0; i < n; i++) ibeam(b, move(f, n === 1 ? 0 : (i / (n - 1) - 0.5) * w * 0.62, 0, 0), clear + h - 0.1, s);
  panel(b, f, [0, clear + h / 2, s / 2 + 0.075], o.id, o.tab, o.tabSide);
}

// --- Overhead sign structures. ---
/** Four-chord box truss along the pose's x axis. */
function truss(b: MeshBuilder, tex: string, f: Pose, x0: number, x1: number, y: number, hgt: number, dep: number): void {
  const n = Math.max(2, Math.round((x1 - x0) / (hgt * 1.05)));
  const P = (i: number, top: number, front: number): V3 => at(f, x0 + ((x1 - x0) * i) / n, y + top * hgt, (front - 0.5) * dep);
  for (const top of [0, 1]) for (const front of [0, 1]) b.tube(tex, P(0, top, front), P(n, top, front), 0.055, 8, 0.055, true);
  for (let i = 0; i <= n; i++) {
    for (const front of [0, 1]) b.tube(tex, P(i, 0, front), P(i, 1, front), 0.028, 6);
    for (const top of [0, 1]) b.tube(tex, P(i, top, 0), P(i, top, 1), 0.028, 6);
    if (i === n) break;
    const up = i % 2;
    for (const front of [0, 1]) b.tube(tex, P(i, up, front), P(i + 1, 1 - up, front), 0.024, 6);
    for (const top of [0, 1]) b.tube(tex, P(i, top, up), P(i + 1, top, 1 - up), 0.02, 6);
  }
}
/** Column of a sign bridge: a round shaft, or two laced legs. */
function column(b: MeshBuilder, tex: string, f: Pose, h: number, kind: 'round' | 'laced', dep: number): void {
  if (kind === 'round') {
    pole(b, f, { h, r0: 0.24, r1: 0.2, tex, base: 'plate', cap: 'flat', sides: 14 });
    return;
  }
  for (const sz of [-1, 1]) {
    const g = move(f, 0, 0, (sz * dep) / 2);
    box(b, PAD, g, [0, 0.06, 0], [0.3, 0.06, 0.3], 'Y');
    box(b, tex, g, [0, 0.135, 0], [0.2, 0.015, 0.2]);
    b.tube(tex, at(g, 0, 0.15, 0), at(g, 0, h, 0), 0.1, 10, 0.1, true);
  }
  const n = Math.round(h / (dep * 1.1));
  for (let i = 0; i < n; i++) {
    const [ya, yb] = [0.3 + ((h - 0.4) * i) / n, 0.3 + ((h - 0.4) * (i + 1)) / n];
    const s = i % 2 ? 1 : -1;
    b.tube(tex, at(f, 0, ya, (s * dep) / 2), at(f, 0, yb, (-s * dep) / 2), 0.03, 6);
    b.tube(tex, at(f, 0, yb, -dep / 2), at(f, 0, yb, dep / 2), 0.03, 6);
  }
}
interface Board {
  id: string;
  /** Centre along the beam. */
  x: number;
  tab?: string;
  tabSide?: number;
  /** Lamps on arms below the panel. */
  lit?: boolean;
  /** Facing the other way. */
  rear?: boolean;
}
interface GantryOpts {
  kind: 'bridge' | 'cantilever' | 'butterfly' | 'tube-bridge' | 'tube-arm';
  /** Beam length. */
  span: number;
  boards: Board[];
  /** Clearance under the lowest panel. */
  clear?: number;
  tex?: string;
  columns?: 'round' | 'laced';
  walkway?: boolean;
}
function gantry(b: MeshBuilder, f: Pose, o: GantryOpts): void {
  const tex = o.tex ?? ZINC;
  const clear = o.clear ?? 5.4;
  const tallest = Math.max(...o.boards.map((p) => b.part(`sign/${p.id}`).mh));
  const cy = clear + tallest / 2;
  const tube = o.kind === 'tube-bridge' || o.kind === 'tube-arm';
  const [hgt, dep] = tube ? [0, 0] : o.kind === 'bridge' ? [1.5, 1.1] : [1.3, 0.9];
  let zf: number;
  if (tube) {
    const r = o.kind === 'tube-bridge' ? 0.22 : 0.19;
    const R = 1.4;
    const bend = (x: number, dir: number): V3[] => Array.from({ length: 9 }, (_, i) => at(f, x + dir * R * (1 - Math.cos((i * Math.PI) / 16)), cy - R + R * Math.sin((i * Math.PI) / 16), 0));
    if (o.kind === 'tube-bridge') {
      for (const sx of [-1, 1]) footing(b, tex, move(f, (sx * o.span) / 2, 0, 0), r * 1.9);
      pipe(b, tex, [at(f, -o.span / 2, 0.03, 0), ...bend(-o.span / 2, 1), ...bend(o.span / 2, -1).reverse(), at(f, o.span / 2, 0.03, 0)], r, 12);
    } else {
      footing(b, tex, f, r * 2.1);
      pipe(b, tex, [at(f, 0, 0.03, 0), ...bend(0, -1), at(f, -o.span * 0.6, cy + 0.05, 0), at(f, -o.span, cy + 0.1, 0)], (q) => r * (1.15 - 0.5 * q), 12);
    }
    zf = r + 0.1;
  } else {
    const yb = cy - hgt / 2;
    const cols = o.columns ?? (o.kind === 'bridge' ? 'laced' : 'round');
    const xs = o.kind === 'bridge' ? [-o.span / 2, o.span / 2] : [0];
    const [x0, x1] = o.kind === 'bridge' ? [-o.span / 2, o.span / 2] : o.kind === 'butterfly' ? [-o.span / 2, o.span / 2] : [-o.span, 0.5];
    for (const x of xs) column(b, tex, move(f, x, 0, 0), yb + hgt + (cols === 'round' ? 0.15 : 0), cols, dep);
    truss(b, tex, f, x0, x1, yb, hgt, dep);
    if (o.walkway) {
      box(b, tex, f, [(x0 + x1) / 2, yb - 0.03, dep / 2 + 0.75], [(x1 - x0) / 2 - 0.6, 0.02, 0.3]);
      for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.6) {
        b.tube(tex, at(f, x, yb, dep / 2), at(f, x, yb - 0.04, dep / 2 + 1.05), 0.025, 6);
        b.tube(tex, at(f, x, yb - 0.04, dep / 2 + 1.05), at(f, x, yb + 1.0, dep / 2 + 1.05), 0.02, 6);
      }
      b.tube(tex, at(f, x0 + 0.8, yb + 1.0, dep / 2 + 1.05), at(f, x1 - 0.6, yb + 1.0, dep / 2 + 1.05), 0.02, 6);
    }
    zf = dep / 2 + 0.11;
  }
  for (const p of o.boards) {
    const g = p.rear ? turn(f, 180) : f;
    const x = p.rear ? -p.x : p.x;
    const [w, h] = panel(b, g, [x, cy, zf], p.id, p.tab, p.tabSide);
    for (const sx of [-0.32, 0.32]) box(b, tex, g, [x + sx * w, cy, zf - 0.07], [0.035, Math.max(h / 2, hgt / 2) + 0.08, 0.035]);
    if (p.lit) {
      const n = Math.max(2, Math.round(w / 1.5));
      for (let i = 0; i < n; i++) {
        const lx = x + ((i + 0.5) / n - 0.5) * w;
        b.tube(tex, at(g, lx, cy - h / 2 - 0.12, zf - 0.05), at(g, lx, cy - h / 2 - 0.12, zf + 1.0), 0.02, 6);
        const lamp = tilt(move(g, lx, cy - h / 2 - 0.06, zf + 1.0), 35);
        box(b, 'signal/housing-grey', lamp, [0, 0, 0], [0.22, 0.07, 0.11]);
        face(b, 'signal/lamp-glass-off', turn(lamp, 180), [0, 0, 0.111], 0.36, 0.1);
      }
    }
  }
}

// --- Work-zone devices. ---
/** Surface of revolution wrapped once by the whole texture. */
function wrap(b: MeshBuilder, material: string, f: Pose, profile: [number, number][], sides = 16): void {
  const p = b.part(material);
  const lens = profile.slice(1).map(([r, y], i) => Math.hypot(r - profile[i][0], y - profile[i][1]));
  const total = sum(lens);
  let v = 0;
  for (let k = 0; k + 1 < profile.length; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    if (lens[k] < 1e-6) continue;
    const [nr, ny] = [(y1 - y0) / lens[k], -(r1 - r0) / lens[k]];
    const [v0, v1] = [(v / total) * p.mh, ((v + lens[k]) / total) * p.mh];
    for (let i = 0; i < sides; i++) {
      const dir = (j: number): V3 => {
        const a = (j / sides) * Math.PI * 2;
        return [f.x[0] * Math.cos(a) - f.z[0] * Math.sin(a), f.x[1] * Math.cos(a) - f.z[1] * Math.sin(a), f.x[2] * Math.cos(a) - f.z[2] * Math.sin(a)];
      };
      const [d0, d1] = [dir(i), dir(i + 1)];
      const pt = (d: V3, r: number, y: number): V3 => [f.o[0] + d[0] * r + f.y[0] * y, f.o[1] + d[1] * r + f.y[1] * y, f.o[2] + d[2] * r + f.y[2] * y];
      const nm = (d: V3): V3 => {
        const n: V3 = [d[0] * nr + f.y[0] * ny, d[1] * nr + f.y[1] * ny, d[2] * nr + f.y[2] * ny];
        const l = Math.hypot(n[0], n[1], n[2]);
        return [n[0] / l, n[1] / l, n[2] / l];
      };
      const [u0, u1] = [(i / sides) * p.mw, ((i + 1) / sides) * p.mw];
      if (r1 < 1e-6) b.tri(material, pt(d0, r0, y0), pt(d1, r0, y0), pt(d0, 0, y1), [[u0, v0], [u1, v0], [u0, v1]]);
      else if (r0 < 1e-6) b.tri(material, pt(d0, 0, y0), pt(d1, r1, y1), pt(d0, r1, y1), [[u0, v0], [u1, v1], [u0, v1]]);
      else b.quad(material, pt(d0, r0, y0), pt(d1, r0, y0), pt(d1, r1, y1), pt(d0, r1, y1), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], 0, [nm(d0), nm(d1), nm(d1), nm(d0)]);
    }
    v += lens[k];
  }
}
export function cone(b: MeshBuilder, f: Pose, tex = 'cone', h = 0.7): void {
  const k = h / 0.7;
  box(b, BLACK, f, [0, 0.015, 0], [0.19 * k, 0.015, 0.19 * k]);
  wrap(b, `sign/${tex}`, f, [[0.14 * k, 0.03], [0.03 * k, h]], 14);
  lathe(b, `sign/${tex}`, f, [[0.03 * k, h], [0.018 * k, h], [0, h - 0.01]], 14);
}
export function drum(b: MeshBuilder, f: Pose, light = false): void {
  lathe(b, BLACK, f, [[0.3, 0], [0.33, 0.03], [0.33, 0.09], [0.29, 0.12], [0.26, 0.12]], 16);
  wrap(b, 'sign/drum', f, [[0.27, 0.05], [0.265, 0.3], [0.275, 0.31], [0.26, 0.5], [0.27, 0.51], [0.25, 0.72], [0.26, 0.73], [0.235, 0.94], [0.22, 0.97]], 18);
  lathe(b, 'sign/drum', f, [[0.22, 0.97], [0.12, 0.985], [0, 0.985]], 18);
  box(b, 'sign/drum', f, [0, 1.0, 0], [0.09, 0.02, 0.018]);
  if (light) beaconLight(b, move(f, 0, 1.02, 0));
}
/** Battery warning light as clipped on barricades and drums. */
function beaconLight(b: MeshBuilder, f: Pose, on = true): void {
  box(b, 'signal/housing-yellow', f, [0, 0.06, 0], [0.06, 0.06, 0.035]);
  lathe(b, 'signal/housing-yellow', tilt(move(f, 0, 0.2, -0.04), 90), [[0.095, 0], [0.095, 0.08]], 14);
  for (const g of [f, turn(f, 180)]) disc(b, `signal/lens-yellow-${on ? 'on' : 'off'}`, g, [0, 0.2, 0.041], 0.09, 14, 0.146);
}
function tubeMarker(b: MeshBuilder, f: Pose): void {
  lathe(b, BLACK, f, [[0.1, 0], [0.1, 0.03], [0.055, 0.05]], 12);
  wrap(b, 'sign/tube-orange', f, [[0.04, 0.03], [0.04, 0.93]], 10);
  lathe(b, 'sign/tube-orange', f, [[0.04, 0.93], [0.05, 0.94], [0.05, 0.96], [0, 0.97]], 10);
}
function delineator(b: MeshBuilder, f: Pose): void {
  for (const g of [f, turn(f, 180)]) face(b, 'sign/delineator', g, [0, 0.6, 0.004], 0.1, 1.2);
  box(b, BLACK, f, [0, 0.02, 0], [0.07, 0.02, 0.04]);
}
/** Striped rail seen from both sides. */
function rail(b: MeshBuilder, f: Pose, c: V3, w: number, colour: 'orange' | 'red' | 'hazard', h = 0.2, t = 0.012): void {
  box(b, ZINC, f, c, [w / 2 - 0.002, h / 2 - 0.002, t]);
  face(b, `sign/stripes-${colour}-l`, f, [c[0], c[1], c[2] + t + 0.001], w, h, [0, 0, w, 0.2]);
  face(b, `sign/stripes-${colour}-r`, turn(f, 180), [-c[0], c[1], -c[2] + t + 0.001], w, h, [0, 0, w, 0.2]);
}
interface BarricadeOpts {
  w?: number;
  rails?: number;
  colour?: 'orange' | 'red';
  sign?: string;
  lights?: boolean;
  /** Posts set in the ground instead of skids. */
  fixed?: boolean;
  h?: number;
}
/** Type III barricade: striped rails on two uprights. */
function barricade(b: MeshBuilder, f: Pose, o: BarricadeOpts = {}): void {
  const w = o.w ?? 1.8;
  const n = o.rails ?? 3;
  const h = o.h ?? 1.55;
  const tex = o.fixed ? 'sign/post-wood' : 'sign/post-perforated';
  const half = o.fixed ? 0.045 : 0.025;
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.3);
    box(b, tex, f, [x, h / 2, 0], [half, h / 2, half]);
    if (!o.fixed) {
      box(b, 'sign/post-perforated', f, [x, 0.025, 0], [0.025, 0.025, 0.75]);
      for (const sz of [-1, 1]) b.tube(ZINC, at(f, x, 0.05, sz * 0.45), at(f, x, 0.5, sz * 0.03), 0.012, 6);
    }
    if (o.lights) beaconLight(b, move(f, x, h, 0), sx < 0);
  }
  for (let i = 0; i < n; i++) rail(b, f, [0, h - 0.1 - i * 0.5, half + 0.013], w, o.colour ?? 'orange');
  if (o.sign) plate(b, `sign/${o.sign}`, f, [0, h - 0.35, half + 0.03], { back: backOf(o.sign) });
}
/** Folding A-frame barricade with one or two rails (Type I / II), or moulded plastic. */
function aFrame(b: MeshBuilder, f: Pose, o: { w?: number; rails?: number; sign?: string; plastic?: boolean; light?: boolean; colour?: 'orange' | 'hazard' } = {}): void {
  const w = o.w ?? 0.75;
  const h = 1.05;
  for (const sz of [-1, 1]) {
    const g = tilt(move(turn(f, sz < 0 ? 180 : 0), 0, 0, 0.3), -15.5);
    const leg = o.plastic ? 'sign/tube-orange' : ZINC;
    for (const sx of [-1, 1]) box(b, leg, g, [sx * (w / 2 - 0.02), h / 2, 0], [o.plastic ? 0.035 : 0.02, h / 2, o.plastic ? 0.02 : 0.02]);
    for (let i = 0; i < (o.rails ?? 1); i++) {
      const y = h - 0.12 - i * 0.5;
      box(b, ZINC, g, [0, y, 0.021], [w / 2, 0.098, 0.006]);
      face(b, `sign/stripes-${o.colour ?? 'orange'}-${sz < 0 ? 'r' : 'l'}`, g, [0, y, 0.028], w, 0.2, [0, 0, w, 0.2]);
    }
    if (o.sign && sz > 0) plate(b, `sign/${o.sign}`, g, [0, h - 0.12 - (o.rails ?? 1) * 0.5 + 0.12, 0.03]);
  }
  if (o.light) beaconLight(b, move(f, w / 2 - 0.08, h * 0.96, 0));
}
/** Wooden sawhorse with a striped plank. */
function sawhorse(b: MeshBuilder, f: Pose, w = 2.4): void {
  rail(b, f, [0, 0.95, 0], w, 'hazard', 0.2, 0.02);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = tilt(move(turn(f, sz < 0 ? 180 : 0), sx * sz * (w / 2 - 0.25), 0, 0.31), -18);
      box(b, 'sign/post-wood', g, [0, 0.47, 0], [0.045, 0.47, 0.02]);
    }
    box(b, 'sign/post-wood', f, [sx * (w / 2 - 0.25), 0.4, 0], [0.02, 0.045, 0.2]);
  }
}
/** Portable stand holding a roll-up work-zone sign. */
function workStand(b: MeshBuilder, f: Pose, o: { id: string; kind?: 'x' | 'tripod' | 'easel'; flags?: boolean; clear?: number; light?: boolean }): void {
  const id = `sign/${o.id}`;
  const h = b.part(id).mh;
  const clear = o.clear ?? 0.45;
  const kind = o.kind ?? 'x';
  const top = clear + h;
  if (kind === 'x') {
    for (const a of [38, 142, 218, 322]) {
      const g = turn(f, a);
      b.tube(ZINC, at(g, 0, 0.16, 0), at(g, 0, 0.03, 0.95), 0.016, 6, 0.016, true);
      box(b, BLACK, g, [0, 0.015, 0.95], [0.03, 0.015, 0.05]);
    }
    lathe(b, ZINC, move(f, 0, 0.14, 0), [[0.03, 0], [0.03, 0.1], [0.045, 0.1], [0.045, 0.3], [0.03, 0.3]], 8);
    box(b, ZINC, f, [0, (0.44 + top) / 2, 0], [0.016, (top - 0.44) / 2, 0.016]);
  } else if (kind === 'tripod') {
    for (const a of [0, 125, 235]) {
      const g = turn(f, a + 180);
      b.tube(ZINC, at(f, 0, top - 0.25, -0.02), at(g, 0, 0, a === 0 ? 0.95 : 0.7), 0.018, 6, 0.018, true);
    }
  } else {
    for (const sx of [-1, 1]) {
      b.tube('sign/post-wood', at(f, sx * 0.3, top - 0.1, -0.02), at(f, sx * 0.42, 0, 0.1), 0.022, 6, 0.022, true);
      b.tube('sign/post-wood', at(f, sx * 0.3, top - 0.1, -0.02), at(f, sx * 0.42, 0, -0.75), 0.022, 6, 0.022, true);
    }
    box(b, 'sign/post-wood', f, [0, clear * 0.6, 0.06], [0.44, 0.03, 0.012]);
  }
  plate(b, id, f, [0, clear + h / 2, 0.02], { back: 'sign/cone', thick: 0.003 });
  if (signShape(id) === 'diamond') for (const [dx, dy] of [[0.47, 0], [0, 0.47]]) box(b, ZINC, f, [0, clear + h / 2, 0.008], [Math.max(0.012, dx * h), Math.max(0.012, dy * h), 0.006]);
  if (o.flags) {
    for (const s of [-1, 1]) {
      const g = roll(move(f, 0, top - 0.02, 0.005), -s * 32);
      b.tube(ZINC, g.o, at(g, 0, 0.75, 0), 0.008, 5);
      for (const side of [g, turn(g, 180)]) face(b, 'sign/tube-orange', side, [s * (side === g ? -0.2 : 0.2), 0.55, 0], 0.4, 0.4, [0, 0, 0.2, 0.4]);
    }
  }
  if (o.light) beaconLight(b, move(f, 0, top + 0.02, -0.03));
}
/** Vertical striped panel on a rubber base. */
function verticalPanel(b: MeshBuilder, f: Pose, left: boolean): void {
  box(b, BLACK, f, [0, 0.03, 0], [0.2, 0.03, 0.3]);
  box(b, 'sign/tube-orange', f, [0, 0.5, 0], [0.03, 0.47, 0.015]);
  box(b, ZINC, f, [0, 0.78, 0], [0.1, 0.3, 0.008]);
  face(b, `sign/stripes-orange-${left ? 'l' : 'r'}`, f, [0, 0.78, 0.0095], 0.2, 0.6, [0, 0, 0.2, 0.6]);
  face(b, `sign/stripes-orange-${left ? 'r' : 'l'}`, turn(f, 180), [0, 0.78, 0.0095], 0.2, 0.6, [0, 0, 0.2, 0.6]);
}
/** Trailer-mounted flashing arrow board. */
function arrowBoard(b: MeshBuilder, f: Pose, mode: 'left' | 'right' | 'double' | 'caution' | 'off', cy = 2.9): void {
  const Y = 'signal/housing-yellow';
  // Trailer.
  box(b, Y, f, [0, 0.5, 0], [0.9, 0.05, 0.45]);
  box(b, Y, f, [1.5, 0.5, 0], [0.6, 0.04, 0.04]);
  lathe(b, ZINC, move(f, 2.05, 0.5, 0), [[0.05, -0.02], [0.05, 0.08], [0, 0.08]], 8);
  b.tube(ZINC, at(f, 1.7, 0.02, 0), at(f, 1.7, 0.5, 0), 0.025, 6, 0.025, true);
  for (const sz of [-1, 1]) {
    const wheel: Pose = { o: at(f, -0.1, 0.33, sz * 0.52), x: f.x, y: sz > 0 ? f.z : [-f.z[0], -f.z[1], -f.z[2]], z: sz > 0 ? [-f.y[0], -f.y[1], -f.y[2]] : f.y };
    lathe(b, BLACK, wheel, [[0, 0], [0.2, 0], [0.33, 0.03], [0.33, 0.17], [0.2, 0.2], [0, 0.2]], 16);
    lathe(b, ZINC, wheel, [[0, 0.2], [0.17, 0.2], [0.17, 0.205], [0, 0.205]], 12);
    box(b, Y, f, [-0.1, 0.72, sz * 0.62], [0.42, 0.015, 0.13]);
    for (const sx of [-1, 1]) b.tube(ZINC, at(f, sx * 0.8, 0.02, sz * 0.4), at(f, sx * 0.8, 0.46, sz * 0.4), 0.022, 6, 0.022, true);
  }
  box(b, 'signal/cabinet-side', f, [0.35, 0.8, 0], [0.4, 0.25, 0.35]);
  box(b, Y, f, [-0.45, (0.55 + cy) / 2, -0.1], [0.05, (cy - 0.55) / 2, 0.05]);
  // Board.
  const g = move(turn(f, 90), 0, cy, 0.45);
  box(b, BLACK, g, [0, 0, 0], [1.22, 0.62, 0.05]);
  const lamps: [number, number, boolean][] = [];
  const lit = (x: number, y: number, on: boolean): number => lamps.push([x, y, on]);
  const dir = mode === 'left' ? -1 : 1;
  for (let i = -2; i <= 2; i++) lit(i * 0.33 * dir - 0.12 * dir, 0, mode === 'left' || mode === 'right' || mode === 'double');
  for (const s of mode === 'double' ? [-1, 1] : [dir]) {
    lit(s * 1.02, 0, mode !== 'caution' && mode !== 'off');
    for (const k of [1, 2]) for (const sy of [-1, 1]) lit(s * (1.02 - k * 0.22), sy * k * 0.22, mode !== 'caution' && mode !== 'off');
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) lit(sx * 1.08, sy * 0.48, mode === 'caution');
  for (const [x, y, on] of lamps) {
    disc(b, `signal/lens-yellow-${on ? 'on' : 'off'}`, g, [x, y, 0.052], 0.062, 12, 0.146);
    box(b, BLACK, g, [x, y + 0.07, 0.09], [0.07, 0.004, 0.04]);
  }
  const sun = tilt(move(g, 0, 0.66, -0.02), -70);
  for (const sx of [-1, 1]) face(b, 'signal/solar-panel', sun, [sx * 0.47, 0.25, 0], 0.936, 0.468, [0, 0, 0.936, 0.468]);
  box(b, ZINC, sun, [0, 0.25, -0.012], [0.95, 0.245, 0.01]);
}

// --- Catalogue. ---
const TEX_LABEL = new Map(TEXTURES.map((t) => [t.id, t.label]));
const jp = (id: string): string => TEX_LABEL.get(`sign/${id}`) ?? id;
const ids = (rows: Row[]): string[] => rows.flatMap((r) => (Array.isArray(r) ? r : [r])).map((i) => (typeof i === 'string' ? i : i.id));

export function addSigns(): void {
  const add = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('sign', id, label, fn);
  /** One post; the label is put together from the sign faces. */
  const single = (id: string, o: PostOpts, note = ''): void => {
    const names = ids(o.items);
    const label = `${jp(names[0])}${names.length > 1 ? ` +${names.length - 1}枚` : ''} ・${POST_JP[o.kind ?? 'square']}${note ? ` ・${note}` : ''}`;
    add(id, label, (b) => void signPost(b, O, o));
  };

  // Regulatory signs.
  single('stop', { items: ['stop'] });
  single('stop-all-way', { kind: 'u', items: ['stop', 'plaque-all-way'] });
  single('stop-4-way-wood', { kind: 'wood', clear: 1.5, items: ['stop', 'plaque-4-way'] });
  single('stop-old-leaning', { kind: 'rusty', items: [{ id: 'stop-old', crooked: -5 }], lean: 6, pitch: -3 }, '傾き');
  single('stop-bent', { kind: 'u', items: [{ id: 'stop', bend: 0.2 }] }, '折れ曲がり');
  single('stop-one-way', { kind: 'round', items: ['one-way-left', 'stop'] });
  single('stop-black-pole', { kind: 'black', items: ['stop', 'plaque-all-way'] });
  add('stop-street-names', '一時停止+街路名板(交差2枚)', (b) => {
    const [f, h] = signPost(b, O, { kind: 'square', items: ['stop'], above: 0.25 });
    blades(b, f, h, ['main-st', '3rd-st']);
  });
  add('stop-street-names-old', '一時停止+街路名板・古い', (b) => {
    const [f, h] = signPost(b, O, { kind: 'rusty', items: [{ id: 'stop-old', crooked: 3 }], above: 0.2, lean: -3 });
    blades(b, f, h, ['mission-st-old', 'main-st-old'], { yaw: 12 });
  });
  single('yield', { kind: 'u', items: ['yield'] });
  single('yield-old', { kind: 'round', items: ['yield-old'], lean: 2 });
  single('do-not-enter', { items: ['do-not-enter'] });
  single('do-not-enter-wrong-way', { kind: 'u', items: ['do-not-enter', 'wrong-way'] });
  single('do-not-enter-old', { kind: 'rusty', items: [{ id: 'do-not-enter-old', bend: 0.1 }], pitch: 4 });
  single('wrong-way', { kind: 'u', clear: 1.5, items: ['wrong-way'] });
  single('one-way-left', { items: ['one-way-left'] });
  single('one-way-right', { kind: 'u', items: ['one-way-right'] });
  single('one-way-old', { kind: 'rusty', items: [{ id: 'one-way-left-old', crooked: 4 }] });
  single('one-way-both-sides', { kind: 'round', items: [{ id: 'one-way-left', rear: 'one-way-right' }] }, '両面');
  single('one-way-no-entry', { kind: 'square', items: ['one-way-right', 'do-not-enter'] });
  const SPEEDS: [string, PostOpts][] = [
    ['25', { kind: 'u', items: ['speed-25'] }],
    ['30', { kind: 'square', items: ['speed-30'] }],
    ['35', { kind: 'round', items: ['speed-35'] }],
    ['40', { kind: 'square', clear: 1.5, items: ['speed-40'] }],
    ['45', { kind: 'wood', clear: 1.5, items: ['speed-45'] }],
    ['55', { kind: 'u', clear: 1.5, items: ['speed-55'] }],
    ['65', { kind: 'square', clear: 1.5, items: ['speed-65', 'truck-route'] }],
    ['25-old', { kind: 'rusty', items: [{ id: 'speed-25-old', crooked: -3 }], lean: 4 }],
    ['35-old-bent', { kind: 'u', items: [{ id: 'speed-35-old', bend: 0.16 }] }],
    ['35-photo', { kind: 'square', items: ['speed-35', 'photo-enforced'] }],
    ['school', { kind: 'square', items: ['speed-school-25', 'plaque-when-flashing'] }],
    ['25-black-pole', { kind: 'black', items: ['speed-25'] }],
  ];
  for (const [id, o] of SPEEDS) single(`speed-${id}`, o);
  const PARKING: [string, PostOpts][] = [
    ['no-parking', { kind: 'u', items: ['no-parking-any-time'] }],
    ['no-parking-old', { kind: 'rusty', items: [{ id: 'no-parking-any-time-old', crooked: 6 }], lean: -3 }],
    ['no-stopping-tow', { kind: 'square', items: ['no-stopping', 'tow-away'] }],
    ['2hr', { kind: 'u', items: ['parking-2hr'] }],
    ['2hr-cleaning', { kind: 'square', items: ['parking-2hr', 'street-cleaning'] }],
    ['30min', { kind: 'round', items: ['parking-30min'] }],
    ['loading', { kind: 'square', items: ['loading-zone', 'tow-away'] }],
    ['permit-stack', { kind: 'u', items: ['permit-parking', 'street-cleaning', 'tow-away'] }],
    ['stack-4', { kind: 'square', clear: 1.9, items: ['no-stopping', 'parking-2hr-old', 'street-cleaning', 'permit-parking'] }],
    ['disabled', { kind: 'square', clear: 1.5, items: ['parking-disabled', 'tow-away'] }],
    ['ev', { kind: 'round', clear: 1.5, items: ['ev-charging'] }],
    ['symbol', { kind: 'u', items: ['no-parking-symbol'] }],
    ['symbol-old', { kind: 'rusty', items: [{ id: 'no-parking-symbol-old', bend: 0.12 }] }],
    ['angled', { kind: 'round', items: [{ id: 'no-stopping', yaw: 40 }, { id: 'parking-2hr', yaw: 40 }] }],
    ['two-way', { kind: 'round', items: [{ id: 'parking-2hr', yaw: 90, rear: 'no-parking-any-time' }, { id: 'street-cleaning', yaw: 90, rear: 'street-cleaning' }] }],
    ['black-pole', { kind: 'black', items: ['parking-30min', 'loading-zone'] }],
  ];
  for (const [id, o] of PARKING) single(`parking-${id}`, o);
  const RULES: [string, PostOpts][] = [
    ['no-left-turn', { kind: 'u', items: ['no-left-turn'] }],
    ['no-left-turn-old', { kind: 'rusty', items: ['no-left-turn-old'], lean: 3 }],
    ['no-right-turn', { kind: 'square', items: ['no-right-turn'] }],
    ['no-u-turn', { kind: 'round', items: ['no-u-turn'] }],
    ['no-left-no-u', { kind: 'square', items: ['no-left-turn', 'no-u-turn'] }],
    ['no-trucks', { kind: 'u', items: ['no-trucks', 'weight-limit'] }],
    ['no-pedestrians', { kind: 'square', clear: 1.5, items: ['no-pedestrians'] }],
    ['no-ped-bikes', { kind: 'u', clear: 1.5, items: ['no-pedestrians', 'no-bikes'] }],
    ['lane-left-only', { kind: 'square', items: ['lane-left-only'] }],
    ['lane-straight-left', { kind: 'u', items: ['lane-straight-left'] }],
    ['lane-right-only', { kind: 'round', items: ['lane-right-only'] }],
    ['lane-straight-right', { kind: 'square', items: ['lane-straight-right'] }],
    ['lane-straight-only', { kind: 'u', items: ['lane-straight-only'] }],
    ['keep-right', { kind: 'square', clear: 1.2, items: ['keep-right'] }],
    ['keep-right-marker', { kind: 'u', clear: 0.9, items: ['keep-right', 'object-marker-left'] }],
    ['no-turn-on-red', { kind: 'square', items: ['no-turn-on-red'] }],
    ['left-yield-green', { kind: 'u', items: ['left-yield-green'] }],
    ['stop-here-on-red', { kind: 'square', clear: 1.5, items: ['stop-here-on-red'] }],
    ['bike-lane', { kind: 'u', items: ['bike-lane'] }],
    ['bike-lane-no-parking', { kind: 'square', items: ['bike-lane', 'no-parking-symbol'] }],
    ['weight-limit', { kind: 'wood', clear: 1.5, items: ['weight-limit'] }],
    ['right-lane-must-turn', { kind: 'square', items: ['right-lane-must-turn'] }],
    ['do-not-block', { kind: 'u', items: ['do-not-block'] }],
    ['no-thru-traffic', { kind: 'wood', clear: 1.5, items: ['no-thru-traffic'] }],
    ['truck-route', { kind: 'round', items: ['truck-route', 'plaque-arrow-left'] }],
    ['left-on-green-arrow', { kind: 'square', items: ['left-on-green-arrow'] }],
    ['dead-end-rect', { kind: 'u', items: ['dead-end-rect'] }],
    ['no-outlet-rect', { kind: 'square', items: ['no-outlet-rect'] }],
    ['private-road', { kind: 'wood', clear: 1.4, items: ['private-road', 'no-thru-traffic'] }],
  ];
  for (const [id, o] of RULES) single(`rule-${id}`, o);

  // Warning signs, on a rotation of posts.
  const WARN: [string, string?, Partial<PostOpts>?][] = [
    ['curve-left', 'advisory-25'], ['turn-left', 'advisory-15'], ['winding-left'], ['side-road-left'], ['merge-left'], ['lane-ends-left'],
    ['curve-right'], ['curve-right-old', undefined, { lean: 5 }], ['turn-right'], ['winding-right', 'advisory-35'], ['side-road-right'], ['merge-right'], ['lane-ends-right'],
    ['crossroad'], ['crossroad-old', undefined, { pitch: -4 }], ['t-junction'], ['signal-ahead'], ['signal-ahead-old'], ['stop-ahead'], ['yield-ahead'], ['divided'], ['two-way'],
    ['pedestrian', 'plaque-diagonal-arrow'], ['pedestrian-old'], ['pedestrian-lime', 'plaque-ahead'], ['bicycle'], ['truck-crossing'], ['roundabout', 'advisory-15'],
    ['dip'], ['bump'], ['dead-end'], ['dead-end-old', undefined, { lean: -6 }], ['slow'], ['slow-old'], ['road-narrows'], ['pavement-ends'], ['no-outlet'], ['low-clearance'],
    ['speed-hump', 'advisory-15'], ['signal-ahead-text'], ['cross-traffic'], ['fire-station'], ['school', 'plaque-ahead'], ['school-old'], ['rr-advance'], ['rr-advance-old', undefined, { lean: 3 }],
  ];
  const ROTA: PostKind[] = ['square', 'u', 'round', 'wood', 'u', 'square'];
  WARN.forEach(([id, plaque, extra], i) => {
    const old = id.endsWith('-old');
    const kind = old ? 'rusty' : ROTA[i % ROTA.length];
    single(`warn-${id}`, { kind, clear: kind === 'wood' ? 1.5 : 2.1, items: plaque ? [id, { id: plaque, gap: -0.12 }] : [old ? { id, crooked: (i % 3) * 3 - 3 } : id], ...extra });
  });
  single('warn-school-crossing', { kind: 'square', items: ['school', 'plaque-diagonal-arrow'] });
  single('warn-school-zone', { kind: 'u', items: ['school', 'plaque-school', 'speed-school-25'] });
  single('warn-bent-curve', { kind: 'u', items: [{ id: 'curve-left', bend: 0.3 }] }, '折れ曲がり');
  single('warn-stop-ahead-black', { kind: 'black', items: ['stop-ahead'] });
  single('warn-pedestrian-both-sides', { kind: 'round', items: [{ id: 'pedestrian-lime', rear: 'pedestrian-lime' }, { id: 'plaque-diagonal-arrow', gap: -0.12 }] }, '両面');

  // Curve and hazard markers.
  single('marker-chevron-left', { kind: 'u', clear: 1.2, items: ['chevron-left'] });
  single('marker-chevron-right', { kind: 'square', clear: 1.2, items: ['chevron-right'] });
  single('marker-chevron-old', { kind: 'rusty', clear: 1.2, items: [{ id: 'chevron-left-old', bend: 0.1 }], lean: 5 });
  single('marker-object-left', { kind: 'u', clear: 0.9, items: ['object-marker-left'] });
  single('marker-object-right', { kind: 'u', clear: 0.9, items: ['object-marker-right'] });
  single('marker-mile', { kind: 'u', clear: 1.2, items: ['guide-mile-marker'] });
  add('marker-chevron-row', 'カーブ誘導 シェブロン5本', (b) => {
    for (let i = 0; i < 5; i++) {
      const a = -24 + i * 12;
      const r = 28;
      signPost(b, stand([Math.sin((a * Math.PI) / 180) * r, 0, (Math.cos((a * Math.PI) / 180) - 1) * r], a), { kind: 'u', clear: 1.2, items: ['chevron-right'] });
    }
  });
  add('marker-large-arrow-left', '大型矢印(左)・2本柱', (b) => wide(b, O, { id: 'large-arrow-left', kind: 'u', clear: 1.3 }));
  add('marker-large-arrow-right', '大型矢印(右)・木柱', (b) => wide(b, O, { id: 'large-arrow-right', kind: 'wood', clear: 1.3 }));
  add('marker-large-arrow-both', '大型矢印 両面・T字路突き当たり', (b) => wide(b, O, { id: 'large-arrow-left', kind: 'square', clear: 1.3, rear: 'large-arrow-right', under: 'plaque-arrow-left' }));
  add('marker-road-end', '道路終点 赤白バリケード+行き止まり', (b) => {
    barricade(b, O, { w: 3, rails: 3, colour: 'red', fixed: true, h: 1.45 });
    plate(b, 'sign/dead-end-rect', O, [0, 1.75, 0.06]);
    box(b, 'sign/post-wood', O, [0, 1.6, 0], [0.045, 0.4, 0.045]);
  });
  add('marker-delineator', '視線誘導標 樹脂ポスト', (b) => delineator(b, O));
  add('marker-delineator-row', '視線誘導標 5本', (b) => {
    for (let i = 0; i < 5; i++) delineator(b, tilt(stand([i * 2 - 4, 0, 0]), i === 3 ? -14 : 0));
  });

  // Street-name posts.
  const NAMES: [string, string, PostKind, string[], { parallel?: boolean; yaw?: number; lean?: number }?][] = [
    ['two', '街路名板 交差2枚', 'square', ['ocean-ave', 'palm-ave']],
    ['two-u', '街路名板 交差2枚', 'u', ['vista-dr', 'canyon-rd']],
    ['four', '街路名板 4枚重ね', 'round', ['market-st', '12th-ave', 'market-st', '12th-ave']],
    ['single', '街路名板 1枚', 'u', ['alder-way']],
    ['old-leaning', '街路名板 古い・傾き', 'rusty', ['mission-st-old', 'main-st-old'], { yaw: -8, lean: 6 }],
    ['wood', '街路名板 木柱', 'wood', ['pier-9', 'bay-st']],
    ['black-pole', '街路名板 黒い装飾柱', 'black', ['grand-ave', 'harbor-blvd']],
    ['green-pole', '街路名板 緑の装飾柱', 'green', ['bay-st', 'market-st']],
    ['parallel', '街路名板 同方向2枚', 'square', ['3rd-st', 'mission-st'], { parallel: true }],
  ];
  for (const [id, label, kind, names, o] of NAMES) {
    add(`street-${id}`, `${label} ・${POST_JP[kind]}`, (b) => {
      const f = roll(O, o?.lean ?? 0);
      const h = kind === 'black' || kind === 'green' ? 3.2 : 2.9;
      post(b, f, kind, h);
      blades(b, f, h + (kind === 'black' ? 0.1 : kind === 'green' ? 0.12 : 0), names, o);
    });
  }
  add('street-one-way', '街路名板+一方通行', (b) => {
    const [f, h] = signPost(b, O, { kind: 'square', clear: 2.3, items: ['one-way-right'], above: 0.25 });
    blades(b, f, h, ['12th-ave', 'grand-ave']);
  });
  add('street-dead-end', '街路名板+行き止まり', (b) => {
    const [f, h] = signPost(b, O, { kind: 'u', clear: 2.2, items: ['dead-end-rect'], above: 0.2 });
    blades(b, f, h, ['alder-way', 'canyon-rd']);
  });
  add('street-flag', '街路名板 柱の側面に張り出し', (b) => {
    pole(b, O, { h: 3.4, r0: 0.06, tex: 'signal/pole-bronze', base: 'cast', cap: 'ball' });
    flag(b, O, 3.05, 'street-harbor-blvd', 0.06);
    flag(b, turn(O, 90), 2.8, 'street-pier-9', 0.06);
  });

  // Route markers.
  const ROUTES: [string, string, PostOpts][] = [
    ['interstate-jct', '州間高速 5 JCT', { kind: 'square', clear: 1.8, items: ['plaque-jct', 'route-interstate-5'] }],
    ['interstate-north', '州間高速 5 北行き 直進', { kind: 'u', clear: 1.8, items: ['plaque-north', 'route-interstate-5', 'plaque-arrow-up'] }],
    ['interstate-405-to', '州間高速 405 方面 右', { kind: 'square', clear: 1.8, items: ['plaque-to', 'route-interstate-405', 'plaque-arrow-right'] }],
    ['interstate-10-east', '州間高速 10 東行き 左', { kind: 'round', clear: 1.8, items: ['plaque-east', 'route-interstate-10', 'plaque-arrow-left'] }],
    ['us-101-south', '国道 101 南行き', { kind: 'u', clear: 1.8, items: ['plaque-south', 'route-us-101'] }],
    ['us-101-old', '国道 101・古い', { kind: 'rusty', clear: 1.8, items: ['plaque-north', { id: 'route-us-101-old', crooked: -4 }], lean: 3 }],
    ['us-66', '国道 66 西行き 斜め右', { kind: 'wood', clear: 1.6, items: ['plaque-west', 'route-us-66', 'plaque-arrow-up-right'] }],
    ['state-1', '州道 1 北行き', { kind: 'u', clear: 1.8, items: ['plaque-north', 'route-state-1', 'plaque-arrow-up-left'] }],
    ['state-73', '州道 73', { kind: 'square', clear: 1.8, items: ['route-state-73'] }],
    ['pair', '2路線並列 国道101・州道1', { kind: 'square', clear: 1.8, items: [['plaque-north', 'plaque-south'], ['route-us-101', 'route-state-1'], ['plaque-arrow-left', 'plaque-arrow-right']] }],
    ['triple', '3路線並列', { kind: 'round', clear: 1.8, items: [['plaque-jct', 'plaque-jct', 'plaque-jct'], ['route-interstate-5', 'route-us-101', 'route-state-73']] }],
    ['interstate-old', '州間高速 5・古い', { kind: 'rusty', clear: 1.8, items: ['plaque-south', 'route-interstate-5-old', 'plaque-arrow-right'] }],
    ['freeway-entrance', '高速入口 州間高速 5 北行き', { kind: 'square', clear: 1.5, items: ['guide-freeway-entrance', 'route-interstate-5', 'plaque-north', 'plaque-arrow-up-left'] }],
    ['freeway-entrance-old', '高速入口・古い', { kind: 'rusty', clear: 1.5, items: ['guide-freeway-entrance-old', 'route-us-101-old', 'plaque-south'], lean: -2 }],
  ];
  for (const [id, label, o] of ROUTES) add(`route-${id}`, `${label} ・${POST_JP[o.kind ?? 'square']}`, (b) => void signPost(b, O, o));

  // Guide and service signs.
  single('guide-bike-route', { kind: 'u', items: ['guide-bike-route', 'plaque-arrow-up'] });
  single('guide-hospital', { kind: 'square', items: ['service-hospital', 'plaque-arrow-right'] });
  single('guide-hospital-old', { kind: 'rusty', items: ['service-hospital-old', 'plaque-arrow-left'] });
  single('guide-parking', { kind: 'round', items: ['service-parking', 'plaque-arrow-left'] });
  single('guide-end-road-work', { kind: 'u', clear: 1.5, items: ['work-end-road-work'] });
  const WIDE: [string, string, WideOpts][] = [
    ['city-limit', '2本柱', { id: 'guide-city-limit', kind: 'u' }],
    ['park', '木柱2本', { id: 'guide-park', kind: 'wood', clear: 1.2 }],
    ['beach', '2本柱', { id: 'guide-beach', kind: 'square', clear: 1.8 }],
    ['downtown', '2本柱', { id: 'guide-downtown-arrow', kind: 'u', clear: 2.1 }],
    ['distance', '2本柱', { id: 'guide-distance', kind: 'square', clear: 1.5 }],
    ['street-exit', '2本柱', { id: 'guide-street-exit', kind: 'square', clear: 2.1 }],
    ['next-exits', '2本柱', { id: 'guide-next-exits', kind: 'u', clear: 1.5 }],
    ['rest-area', '2本柱', { id: 'service-rest-area', kind: 'square', clear: 1.5 }],
    ['gas-food', '2本柱', { id: 'service-gas-food', kind: 'wood', clear: 1.5 }],
    ['gore', '分岐点', { id: 'guide-gore', kind: 'square', clear: 1.2, spread: 0.7 }],
    ['gore-old', '分岐点・傾き', { id: 'guide-gore-old', kind: 'rusty', clear: 1.2, spread: 0.7, lean: 4 }],
    ['road-closed-fixed', '2本柱', { id: 'work-road-closed-old', kind: 'wood', clear: 1.2 }],
    ['detour', '2本柱', { id: 'work-detour-left', kind: 'u', clear: 1.5 }],
  ];
  for (const [id, note, o] of WIDE) add(`guide-${id}`, `${jp(o.id)} ・${note}`, (b) => wide(b, O, o));
  add('guide-ground-exit-1-mile', '高速案内 出口1マイル ・H形鋼柱', (b) => guideGround(b, O, { id: 'guide-exit-1-mile', tab: 'guide-tab-24' }));
  add('guide-ground-exit-right', '高速案内 出口 ・H形鋼柱', (b) => guideGround(b, O, { id: 'guide-exit-right', tab: 'guide-tab-12a' }));
  add('guide-ground-through-old', '高速案内 直進・古い ・H形鋼柱3本', (b) => guideGround(b, O, { id: 'guide-through-old', posts: 3, clear: 1.8 }));
  add('guide-ground-split', '高速案内 分岐 ・H形鋼柱3本', (b) => guideGround(b, O, { id: 'guide-split', posts: 3, size: 0.25, tab: 'guide-tab-left', tabSide: -1 }));
  add('guide-ground-distance', '距離案内 ・H形鋼柱', (b) => guideGround(b, O, { id: 'guide-distance', size: 0.15, clear: 1.8 }));

  // Overhead structures.
  const GANTRIES: [string, string, GantryOpts][] = [
    ['bridge-2', '門型トラス 16m 2面', { kind: 'bridge', span: 16, boards: [{ id: 'guide-through', x: -3.6 }, { id: 'guide-exit-only', x: 4.3, tab: 'guide-tab-24' }] }],
    ['bridge-3', '門型トラス 22m 3面+点検歩廊・照明', { kind: 'bridge', span: 22, walkway: true, boards: [{ id: 'guide-split', x: -6.5, tab: 'guide-tab-left', tabSide: -1, lit: true }, { id: 'guide-through', x: -0.6, lit: true }, { id: 'guide-exit-only', x: 6.6, tab: 'guide-tab-12a', lit: true }] }],
    ['bridge-both-ways', '門型トラス 26m 両方向', { kind: 'bridge', span: 26, columns: 'round', boards: [{ id: 'guide-through', x: -8 }, { id: 'guide-exit-right', x: -3, tab: 'guide-tab-7' }, { id: 'guide-through-old', x: -6, rear: true }, { id: 'guide-exit-1-mile', x: -0.5, rear: true, tab: 'guide-tab-24' }] }],
    ['bridge-old', '門型トラス 14m 古い案内板', { kind: 'bridge', span: 14, tex: 'structure/steel-galvanized-rusty', boards: [{ id: 'guide-through-old', x: 0, lit: true }] }],
    ['bridge-green', '門型トラス 18m 緑塗装', { kind: 'bridge', span: 18, tex: 'structure/steel-green', boards: [{ id: 'guide-exit-1-mile', x: -4, tab: 'guide-tab-7' }, { id: 'guide-next-exits', x: 2 }, { id: 'guide-street-exit', x: 6 }] }],
    ['cantilever-exit', '片持ちトラス 出口', { kind: 'cantilever', span: 6.5, boards: [{ id: 'guide-exit-right', x: -3.6, tab: 'guide-tab-24' }] }],
    ['cantilever-exit-only', '片持ちトラス 出口専用・照明', { kind: 'cantilever', span: 7, boards: [{ id: 'guide-exit-only', x: -4, tab: 'guide-tab-12a', lit: true }], walkway: true }],
    ['cantilever-long', '片持ちトラス 11m 2面', { kind: 'cantilever', span: 11, boards: [{ id: 'guide-through', x: -8 }, { id: 'guide-street-exit', x: -3.2 }] }],
    ['butterfly', '中央柱 両持ちトラス', { kind: 'butterfly', span: 12, boards: [{ id: 'guide-exit-1-mile', x: -3.4, tab: 'guide-tab-7', tabSide: -1 }, { id: 'guide-exit-right', x: 3.3, tab: 'guide-tab-24' }] }],
    ['butterfly-both-ways', '中央柱 両面トラス', { kind: 'butterfly', span: 9, tex: 'structure/steel-grey', boards: [{ id: 'guide-distance', x: -2.4 }, { id: 'guide-next-exits', x: 2.2, rear: true }] }],
    ['tube-bridge', '門型 単管 15m', { kind: 'tube-bridge', span: 15, boards: [{ id: 'guide-through', x: -3 }, { id: 'guide-exit-right', x: 3.2, tab: 'guide-tab-7' }] }],
    ['tube-bridge-lanes', '門型 単管 12m 車線指定', { kind: 'tube-bridge', span: 12, clear: 5.6, tex: 'signal/pole-black', boards: [{ id: 'lane-left-only', x: -3.6 }, { id: 'lane-straight-only', x: 0 }, { id: 'lane-right-only', x: 3.6 }] }],
    ['tube-arm', '片持ち 単管 出口', { kind: 'tube-arm', span: 6, boards: [{ id: 'guide-exit-right', x: -3.8, tab: 'guide-tab-12a' }] }],
    ['tube-arm-street', '片持ち 単管 街路出口', { kind: 'tube-arm', span: 5, tex: 'signal/pole-bronze', boards: [{ id: 'guide-street-exit', x: -3 }] }],
    ['tube-arm-lanes', '片持ち 単管 車線指定2枚', { kind: 'tube-arm', span: 7, clear: 5.6, boards: [{ id: 'lane-straight-left', x: -5.6 }, { id: 'lane-right-only', x: -2.4 }] }],
    ['tube-arm-low-clearance', '片持ち 単管 高さ制限', { kind: 'tube-arm', span: 4.5, clear: 4.6, tex: 'structure/steel-yellow', boards: [{ id: 'low-clearance', x: -2.8 }] }],
  ];
  for (const [id, label, o] of GANTRIES) add(`overhead-${id}`, `頭上標識 ${label}`, (b) => gantry(b, O, o));

  // Transit stops.
  single('bus-stop', { kind: 'square', items: ['bus-stop-blue', 'bus-route-plate'] });
  single('bus-stop-no-parking', { kind: 'u', items: ['bus-stop-blue', 'bus-stop-no-parking'] });
  single('bus-stop-old', { kind: 'rusty', items: [{ id: 'bus-stop-blue-old', crooked: 3 }], lean: -3 });
  single('bus-stop-taxi', { kind: 'round', items: ['taxi-stand', 'no-parking-any-time'] });
  add('bus-stop-flag', 'バス停 張り出し両面+時刻表ケース', (b) => {
    pole(b, O, { h: 3, r0: 0.045, tex: 'signal/pole-grey', base: 'plate' });
    flag(b, O, 2.6, 'bus-stop-blue', 0.045);
    flag(b, O, 2.05, 'bus-route-plate', 0.045);
    box(b, 'signal/cabinet-side', O, [0, 1.35, 0.075], [0.16, 0.24, 0.02]);
    face(b, 'sign/bus-route-plate', O, [0, 1.35, 0.096], 0.26, 0.4);
  });
  add('bus-stop-lollipop', 'バス停 丸板・黒い装飾柱', (b) => {
    pole(b, O, { h: 2.75, r0: 0.04, tex: 'signal/pole-black', base: 'cast', cap: 'none' });
    for (const g of [O, turn(O, 180)]) plate(b, 'sign/bus-stop-round', g, [0, 2.95, 0.008]);
    lathe(b, 'signal/pole-black', tilt(move(O, 0, 2.95, -0.007), 90), [[0.24, 0], [0.24, 0.014]], 20);
    flag(b, O, 2.3, 'bus-route-plate', 0.04, -1);
  });
  add('bus-stop-taxi-flag', 'タクシー乗り場 張り出し両面', (b) => {
    pole(b, O, { h: 2.9, r0: 0.045, tex: 'signal/pole-green', base: 'cast', cap: 'ball' });
    flag(b, O, 2.5, 'taxi-stand', 0.045);
  });

  // Work zones.
  const WORK: [string, 'x' | 'tripod' | 'easel', boolean, boolean][] = [
    ['road-work-ahead', 'x', true, false], ['road-work-ahead-old', 'easel', false, false], ['detour-ahead', 'x', false, false], ['right-lane-closed', 'x', true, true],
    ['left-lane-closed', 'tripod', false, false], ['one-lane-road', 'x', true, false], ['prepared-to-stop', 'tripod', true, false], ['flagger-ahead', 'x', true, false],
    ['utility-work', 'easel', false, true], ['road-closed-ahead', 'x', false, true], ['uneven-lanes', 'tripod', false, false],
  ];
  const STAND_JP = { x: 'X脚スタンド', tripod: '三脚', easel: '木製イーゼル' };
  for (const [id, kind, flags, light] of WORK) {
    add(`work-${id}`, `${jp(`work-${id}`)} ・${STAND_JP[kind]}${flags ? '・旗つき' : ''}${light ? '・警告灯' : ''}`, (b) => workStand(b, O, { id: `work-${id}`, kind, flags, light }));
  }
  single('work-post-road-work', { kind: 'u', clear: 1.5, items: ['work-road-work-ahead'] }, '仮設');
  single('work-post-detour', { kind: 'wood', clear: 1.5, items: ['work-detour-ahead', { id: 'plaque-arrow-right', gap: -0.14 }] }, '仮設');
  add('work-barricade-3', 'バリケード III型 1.8m', (b) => barricade(b, O));
  add('work-barricade-3-lights', 'バリケード III型 警告灯つき', (b) => barricade(b, O, { w: 2.4, lights: true }));
  add('work-barricade-3-wide', 'バリケード III型 3.6m', (b) => barricade(b, O, { w: 3.6 }));
  add('work-barricade-road-closed', 'バリケード+通行止め', (b) => barricade(b, O, { w: 2.4, sign: 'work-road-closed', lights: true }));
  add('work-barricade-road-closed-thru', 'バリケード+通り抜け不可', (b) => barricade(b, O, { w: 3, sign: 'work-road-closed-thru' }));
  add('work-barricade-detour', 'バリケード+迂回矢印', (b) => barricade(b, O, { w: 2.4, sign: 'work-detour-right' }));
  add('work-barricade-road-closed-old', 'バリケード+通行止め・古い', (b) => barricade(b, tilt(O, 3), { w: 2.4, sign: 'work-road-closed-old', colour: 'red' }));
  add('work-barricade-2', 'バリケード II型(2段)', (b) => aFrame(b, O, { rails: 2 }));
  add('work-barricade-1', 'バリケード I型(1段)', (b) => aFrame(b, O, { rails: 1, light: true }));
  add('work-barricade-1-wide', 'バリケード I型 1.2m', (b) => aFrame(b, O, { rails: 1, w: 1.2 }));
  add('work-barricade-plastic', '樹脂製Aフレーム', (b) => aFrame(b, O, { rails: 2, plastic: true, light: true }));
  add('work-sidewalk-closed', '歩道閉鎖 Aフレーム', (b) => aFrame(b, O, { rails: 1, sign: 'work-sidewalk-closed', w: 0.9 }));
  add('work-sidewalk-use-other', '歩道閉鎖 反対側へ', (b) => aFrame(b, O, { rails: 1, plastic: true, sign: 'work-sidewalk-use-other', w: 0.9 }));
  add('work-sawhorse', '木製馬 黄黒縞', (b) => sawhorse(b, O));
  add('work-sawhorse-short', '木製馬 1.5m+警告灯', (b) => {
    sawhorse(b, O, 1.5);
    beaconLight(b, move(O, 0.5, 1.05, 0));
  });
  add('work-cone', 'カラーコーン 70cm', (b) => cone(b, O));
  add('work-cone-dirty', 'カラーコーン 汚れ', (b) => cone(b, O, 'cone-dirty'));
  add('work-cone-lime', 'カラーコーン 黄緑', (b) => cone(b, O, 'cone-lime'));
  add('work-cone-small', 'カラーコーン 45cm', (b) => cone(b, O, 'cone', 0.45));
  add('work-cone-tall', 'カラーコーン 90cm', (b) => cone(b, O, 'cone', 0.9));
  add('work-cone-fallen', 'カラーコーン 倒れ', (b) => cone(b, tilt(move(turn(O, 25), 0, 0.19, 0), 82), 'cone-dirty'));
  add('work-cone-stack', 'カラーコーン 5個重ね', (b) => {
    for (let i = 0; i < 5; i++) cone(b, move(O, 0, i * 0.085, 0), i === 2 ? 'cone-dirty' : 'cone');
  });
  add('work-cone-row', 'カラーコーン 6個の列', (b) => {
    for (let i = 0; i < 6; i++) cone(b, turn(stand([i * 3 - 7.5, 0, i * 0.6 - 1.5]), i * 37), i === 4 ? 'cone-dirty' : 'cone');
  });
  add('work-drum', '工事用ドラム', (b) => drum(b, O));
  add('work-drum-light', '工事用ドラム 警告灯つき', (b) => drum(b, O, true));
  add('work-drum-row', '工事用ドラム 4個の列', (b) => {
    for (let i = 0; i < 4; i++) drum(b, turn(stand([i * 2.5 - 3.75, 0, 0]), i * 80), i % 2 === 0);
  });
  add('work-tube', 'ポストコーン', (b) => tubeMarker(b, O));
  add('work-tube-row', 'ポストコーン 6本の列', (b) => {
    for (let i = 0; i < 6; i++) tubeMarker(b, tilt(stand([i * 1.5 - 3.75, 0, 0]), i === 2 ? 9 : 0));
  });
  add('work-vertical-panel', '縦型パネル', (b) => verticalPanel(b, O, true));
  add('work-vertical-panel-row', '縦型パネル 4枚の列', (b) => {
    for (let i = 0; i < 4; i++) verticalPanel(b, stand([i * 2 - 3, 0, i * 0.5 - 0.75]), false);
  });
  add('work-arrow-board-right', '矢印板トレーラー 右', (b) => arrowBoard(b, O, 'right'));
  add('work-arrow-board-left', '矢印板トレーラー 左', (b) => arrowBoard(b, O, 'left', 2.6));
  add('work-arrow-board-double', '矢印板トレーラー 両矢印', (b) => arrowBoard(b, O, 'double'));
  add('work-arrow-board-caution', '矢印板トレーラー 四隅点滅', (b) => arrowBoard(b, O, 'caution'));
  add('work-arrow-board-stowed', '矢印板トレーラー 格納', (b) => arrowBoard(b, O, 'off', 1.75));
  add('work-lane-closure', '車線規制セット 標識+矢印板+コーン', (b) => {
    workStand(b, stand([4.5, 0, 9]), { id: 'work-right-lane-closed', flags: true });
    arrowBoard(b, stand([2.2, 0, 0], -90), 'left');
    for (let i = 0; i < 7; i++) cone(b, stand([3.6 - i * 0.55, 0, 7 - i * 1.6]));
    for (let i = 0; i < 3; i++) drum(b, stand([0.2, 0, -4 - i * 2.5]), i === 0);
  });
}
