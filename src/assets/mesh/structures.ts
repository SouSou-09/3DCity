import { Frame, MeshBuilder, Path, V3, arc, frameAt, helix, hump, pathLength, placePath, slicePath, straight, sweep, through, v3 } from './builder';
import { highway, street } from './presets';
import { addModel, litter } from './registry';
import { Section, layout, sweepSection } from './section';

const UP: V3 = [0, 1, 0];
const hz = (v: V3): V3 => v3.norm([v[0], 0, v[2]]);
export const lift = (path: Path, h: number): Path => placePath(path, [0, h, 0], 0);
const widthOf = (sec: Section): number => layout(sec).outer[1] - layout(sec).outer[0];

export type PierKind = 'wall' | 'column' | 'columns' | 'hammerhead' | 'portal' | 'steel' | 'stone';
export interface PierOpts {
  kind: PierKind;
  /** Deck width and structural depth. */
  w: number;
  depth: number;
  ground?: number;
  tex?: string;
  /** Clear span between the legs of a portal frame. */
  span?: number;
}

/** Bridge pier under the deck at frame f, standing on the ground. */
export function pier(b: MeshBuilder, f: Frame, o: PierOpts): void {
  const ax = hz(f.r);
  const az = hz(f.t);
  const tex = o.tex ?? 'structure/pier-formwork';
  const g = o.ground ?? 0;
  const top = f.p[1] - o.depth;
  const h = top - g;
  if (h < 0.5) return;
  const at = (x: number, y: number, z = 0): V3 => [f.p[0] + ax[0] * x + az[0] * z, y, f.p[2] + ax[2] * x + az[2] * z];
  const box = (x: number, y0: number, y1: number, hw: number, hd: number, t = tex): void => b.box(t, at(x, (y0 + y1) / 2), [hw, (y1 - y0) / 2, hd], ax, UP, az);
  if (o.kind === 'wall') box(0, g, top, o.w * 0.36, 0.6);
  else if (o.kind === 'stone') box(0, g, top, o.w * 0.5, 1.2, o.tex ?? 'structure/stone-ashlar');
  else if (o.kind === 'column') {
    const cap = Math.min(1.4, h * 0.3);
    box(0, top - cap, top, o.w * 0.3, 1);
    b.tube(tex, at(0, g), at(0, top - cap), Math.min(1.1, o.w * 0.12), 14);
  } else if (o.kind === 'columns') {
    const n = o.w > 20 ? 3 : 2;
    const span = o.w * 0.6;
    const cap = Math.min(1.2, h * 0.3);
    box(0, top - cap, top, o.w * 0.4, 0.8);
    for (let i = 0; i < n; i++) b.tube(tex, at(-span / 2 + (span * i) / (n - 1), g), at(-span / 2 + (span * i) / (n - 1), top - cap), 0.65, 12);
  } else if (o.kind === 'hammerhead') {
    const hw = Math.max(0.9, o.w * 0.1);
    const W = o.w * 0.42;
    const ch = Math.min(2.2, h * 0.4);
    const d = 0.8;
    box(0, g, top - ch, hw, d);
    box(0, top - 0.5, top, W, d);
    const y0 = top - ch;
    const y1 = top - 0.5;
    for (const sz of [1, -1]) b.quadFacing(tex, at(-hw, y0, sz * d), at(hw, y0, sz * d), at(W, y1, sz * d), at(-W, y1, sz * d), v3.scale(az, sz), [[-hw, 0], [hw, 0], [W, y1 - y0], [-W, y1 - y0]]);
    for (const sx of [1, -1]) b.quadFacing(tex, at(sx * hw, y0, -d), at(sx * hw, y0, d), at(sx * W, y1, d), at(sx * W, y1, -d), v3.add(v3.scale(ax, sx), [0, -1, 0]), [[0, 0], [2 * d, 0], [2 * d, y1 - y0], [0, y1 - y0]]);
  } else if (o.kind === 'portal') {
    const span = o.span ?? o.w + 3;
    const beam = Math.min(1.6, h * 0.3);
    box(0, top - beam, top, span / 2 + 0.7, 0.75);
    for (const sx of [1, -1]) box((sx * span) / 2, g, top - beam, 0.7, 0.75);
  } else {
    const t = o.tex ?? 'structure/steel-grey';
    const x = o.w * 0.3;
    box(0, top - 0.7, top, o.w * 0.4, 0.3, t);
    for (const sx of [1, -1]) box(sx * x, g, top - 0.7, 0.28, 0.28, t);
    const tiers = Math.max(1, Math.round((h - 0.7) / 5));
    for (let k = 0; k < tiers; k++) {
      const y0 = g + ((h - 0.7) * k) / tiers + 0.3;
      const y1 = g + ((h - 0.7) * (k + 1)) / tiers - 0.3;
      b.beam(t, at(-x, y0), at(x, y1), 0.14, 0.14, az);
      b.beam(t, at(x, y0), at(-x, y1), 0.14, 0.14, az);
      b.beam(t, at(-x, y1), at(x, y1), 0.18, 0.18, az);
    }
  }
}

export function piers(b: MeshBuilder, path: Path, spacing: number, o: PierOpts, s0 = spacing / 2, s1 = pathLength(path) - spacing / 2): void {
  const n = Math.max(1, Math.round((s1 - s0) / spacing));
  for (let i = 0; i <= n; i++) pier(b, frameAt(path, s0 + ((s1 - s0) * i) / n), o);
}

/** End wall with wing walls; `facing` = +1 at the far end of the bridge, -1 at its start. */
export function abutment(b: MeshBuilder, f: Frame, w: number, depth: number, facing: 1 | -1, tex = 'structure/wall-smooth', ground = 0): void {
  const ax = hz(f.r);
  const az = v3.scale(hz(f.t), facing);
  const top = f.p[1];
  if (top - ground < 0.5) return;
  const at = (x: number, y: number, z: number): V3 => [f.p[0] + ax[0] * x + az[0] * z, y, f.p[2] + ax[2] * x + az[2] * z];
  b.box(tex, at(0, (ground + top - depth) / 2, 0.6), [w / 2 + 0.3, (top - depth - ground) / 2, 0.6], ax, UP, az);
  for (const sx of [1, -1]) b.box(tex, at(sx * (w / 2 + 0.05), (ground + top + 0.3) / 2, 3.4), [0.3, (top + 0.3 - ground) / 2, 3.4], ax, UP, az);
}

/** Vertical walls or grassed slopes from the edges of a road on fill down to the ground. */
export function fill(b: MeshBuilder, path: Path, x0: number, x1: number, kind: 'wall' | 'slope', tex: string, ground = 0): void {
  for (let i = 0; i + 1 < path.length; i++) {
    const [f0, f1] = [path[i], path[i + 1]];
    for (const [x, sx] of [[x0, -1], [x1, 1]] as const) {
      const a = v3.mad(f0.p, f0.r, x);
      const c = v3.mad(f1.p, f1.r, x);
      const [ha, hc] = [a[1] - ground, c[1] - ground];
      if (ha < 0.02 && hc < 0.02) continue;
      const run = kind === 'slope' ? 1.6 : 0;
      const foot = (p: V3, r: V3, h: number): V3 => [p[0] + hz(r)[0] * sx * run * h, ground, p[2] + hz(r)[2] * sx * run * h];
      const out = v3.add(v3.scale(hz(f0.r), sx), [0, kind === 'slope' ? 1 : 0, 0]);
      b.quadFacing(tex, foot(a, f0.r, ha), foot(c, f1.r, hc), c, a, out, [[f0.s, 0], [f1.s, 0], [f1.s, hc * (1 + run)], [f0.s, ha * (1 + run)]]);
    }
  }
}

/** Longitudinal girders under a slab. */
function girders(b: MeshBuilder, path: Path, w: number, n: number, depth: number, tex: string, top = -0.5): void {
  const strips = [];
  for (let i = 0; i < n; i++) {
    const x = -w * 0.38 + (w * 0.76 * i) / Math.max(1, n - 1);
    strips.push({ material: tex, pts: [[x + 0.3, top], [x + 0.3, -depth + 0.06], [x + 0.03, -depth + 0.1], [x + 0.03, top]] as [number, number][], uv: 'along' as const });
    strips.push({ material: tex, pts: [[x + 0.3, -depth + 0.06], [x + 0.3, -depth], [x - 0.3, -depth], [x - 0.3, -depth + 0.06]] as [number, number][], uv: 'along' as const });
    strips.push({ material: tex, pts: [[x - 0.03, top], [x - 0.03, -depth + 0.1], [x - 0.3, -depth + 0.06]] as [number, number][], uv: 'along' as const });
  }
  sweep(b, path, strips);
}

interface GirderOpts { L: number; H: number; spans: number; pier: PierKind; pierTex?: string; camber?: number; depth?: number; steel?: string; abutTex?: string; seed?: number }
/** Beam bridge: concrete box girder, or a slab on steel plate girders. */
function girderBridge(b: MeshBuilder, sec: Section, o: GirderOpts): void {
  const path = lift(o.camber ? hump(o.L, o.camber) : straight(o.L, 12), o.H);
  const w = widthOf(sec);
  const depth = o.depth ?? 1.5;
  sweepSection(b, path, sec, { body: 'deck', deckDepth: o.steel ? 0.55 : depth });
  if (o.steel) girders(b, path, w, Math.max(2, Math.round(w / 3)), depth, o.steel);
  litter(b, path, sec, o.seed ?? 1, 0.5);
  for (let i = 1; i < o.spans; i++) pier(b, frameAt(path, (o.L * i) / o.spans), { kind: o.pier, w, depth, tex: o.pierTex });
  abutment(b, path[0], w, depth, -1, o.abutTex);
  abutment(b, path[path.length - 1], w, depth, 1, o.abutTex);
}

interface ArchOpts { L: number; H: number; spans: number; tex: string; ring?: string; pierW?: number; flat?: number }
/** Masonry viaduct: solid spandrels over round or segmental arches. */
function archBridge(b: MeshBuilder, sec: Section, o: ArchOpts): void {
  const path = lift(straight(o.L, 1), o.H);
  const lay = layout(sec);
  sweepSection(b, path, sec, { body: 'none' });
  const [x0, x1] = lay.outer;
  const yTop = o.H + lay.outerY[0];
  const pw = o.pierW ?? 2.2;
  const span = (o.L - pw * o.spans) / o.spans;
  const crown = o.H - 0.9;
  const rise = Math.min(span / 2, crown) * (o.flat ?? 1);
  const P = (x: number, y: number, s: number): V3 => [x, y, -s];
  const side = (s0: number, s1: number, y0: number, y1: number): void => {
    for (const [x, sx] of [[x0, -1], [x1, 1]] as const) b.quadFacing(o.tex, P(x, y0, s0), P(x, y1, s1), P(x, yTop, s1), P(x, yTop, s0), [sx, 0, 0], [[s0, y0], [s1, y1], [s1, yTop], [s0, yTop]]);
  };
  const ring = o.ring ?? o.tex;
  for (let k = 0; k < o.spans; k++) {
    const a = pw / 2 + k * (span + pw);
    const mid = a + span / 2;
    side(a - pw / 2, a, 0, 0);
    side(a + span, a + span + pw / 2, 0, 0);
    const y = (s: number): number => crown - rise + rise * Math.sqrt(Math.max(0, 1 - ((s - mid) / (span / 2)) ** 2));
    // Pier faces below the springing.
    for (const s of [a, a + span]) b.quadFacing(o.tex, P(x0, 0, s), P(x1, 0, s), P(x1, crown - rise, s), P(x0, crown - rise, s), [0, 0, s < mid ? -1 : 1], [[x0, 0], [x1, 0], [x1, crown - rise], [x0, crown - rise]]);
    const n = 20;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      // Even steps in angle keep the haunches smooth.
      const s0 = mid - (span / 2) * Math.cos((Math.PI * i) / n);
      const s1 = mid - (span / 2) * Math.cos((Math.PI * (i + 1)) / n);
      side(s0, s1, y(s0), y(s1));
      const len = Math.hypot(s1 - s0, y(s1) - y(s0));
      b.quadFacing(ring, P(x0, y(s0), s0), P(x1, y(s0), s0), P(x1, y(s1), s1), P(x0, y(s1), s1), [0, -(crown - rise * 0.5), -(mid - (s0 + s1) / 2)], [[x0, acc], [x1, acc], [x1, acc + len], [x0, acc + len]]);
      acc += len;
    }
  }
  b.box(o.tex, P(0, 0.15, o.L / 2), [(x1 - x0) / 2 + 0.25, 0.15, o.L / 2 + 0.2]);
  // String course and parapets.
  for (const [x, sx] of [[x0, -1], [x1, 1]] as const) {
    b.box(ring, P(x + sx * 0.06, yTop - 0.15, o.L / 2), [0.1, 0.15, o.L / 2]);
    b.box(o.tex, P(x - sx * 0.2, yTop + 0.5, o.L / 2), [0.2, 0.5, o.L / 2]);
  }
}

interface SteelOpts { L: number; H: number; tex: string; seed?: number }
const steelMember = (b: MeshBuilder, tex: string, a: V3, c: V3, w = 0.4, h = 0.4, up: V3 = [1, 0, 0]): void => b.beam(tex, a, c, w, h, up);
function deckOnAbutments(b: MeshBuilder, sec: Section, o: { L: number; H: number; seed?: number }, depth: number, camber = 0, abut = true): { path: Path; w: number } {
  const path = lift(camber ? hump(o.L, camber) : straight(o.L, 16), o.H);
  const w = widthOf(sec);
  sweepSection(b, path, sec, { body: 'deck', deckDepth: depth });
  litter(b, path, sec, o.seed ?? 2, 0.5);
  if (abut) {
    abutment(b, path[0], w, depth, -1);
    abutment(b, path[path.length - 1], w, depth, 1);
  }
  return { path, w };
}

/** Through or pony truss; `curve` raises the top chord towards mid-span (camelback). */
function trussBridge(b: MeshBuilder, sec: Section, o: SteelOpts & { height: number; pratt?: boolean; curve?: number }): void {
  const { w } = deckOnAbutments(b, sec, o, 1);
  const n = Math.max(4, Math.round(o.L / 7 / 2) * 2);
  const x = w / 2 + 0.35;
  const through_ = o.height > 5.5;
  const top = (i: number): number => o.H + 0.3 + o.height * (1 - (o.curve ?? 0) * (2 * (i / n) - 1) ** 2);
  for (const sx of [1, -1]) {
    const lo = (i: number): V3 => [sx * x, o.H + 0.3, -(o.L * i) / n];
    const hi = (i: number): V3 => [sx * x, top(i), -(o.L * i) / n];
    steelMember(b, o.tex, lo(0), lo(n), 0.5, 0.6);
    for (let i = 1; i < n - 1; i++) steelMember(b, o.tex, hi(i), hi(i + 1), 0.5, 0.5);
    steelMember(b, o.tex, lo(0), hi(1), 0.5, 0.5);
    steelMember(b, o.tex, lo(n), hi(n - 1), 0.5, 0.5);
    for (let i = 1; i < n; i++) {
      steelMember(b, o.tex, lo(i), hi(i), 0.3, 0.3);
      if (i === n - 1) continue;
      const leanToCentre = o.pratt ? i < n / 2 : i % 2 === 1;
      if (leanToCentre) steelMember(b, o.tex, hi(i), lo(i + 1), 0.25, 0.3);
      else steelMember(b, o.tex, lo(i), hi(i + 1), 0.25, 0.3);
    }
  }
  if (through_) {
    for (let i = 1; i < n; i++) {
      steelMember(b, o.tex, [-x, top(i), -(o.L * i) / n], [x, top(i), -(o.L * i) / n], 0.3, 0.4, [0, 0, 1]);
      if (i < n - 1) steelMember(b, o.tex, [i % 2 ? -x : x, top(i), -(o.L * i) / n], [i % 2 ? x : -x, top(i + 1), -(o.L * (i + 1)) / n], 0.15, 0.15, UP);
    }
  }
}

/** Tied (bowstring) arch above the deck with hangers. */
function tiedArch(b: MeshBuilder, sec: Section, o: SteelOpts & { rise: number; hangers?: 'vertical' | 'network' }): void {
  const { w } = deckOnAbutments(b, sec, o, 1.2);
  const x = w / 2 + 0.4;
  const n = 24;
  const at = (q: number, sx: number): V3 => [sx * x * (1 - 0.0 * q), o.H + 0.2 + o.rise * 4 * q * (1 - q), -o.L * q];
  for (const sx of [1, -1]) {
    for (let i = 0; i < n; i++) steelMember(b, o.tex, at(i / n, sx), at((i + 1) / n, sx), 0.9, 1.1);
    const hn = Math.round(o.L / 5);
    for (let i = 1; i < hn; i++) {
      const q = i / hn;
      const q2 = o.hangers === 'network' ? Math.min(0.98, Math.max(0.02, q + (i % 2 ? 0.09 : -0.09))) : q;
      b.tube('structure/steel-galvanized', [sx * x, o.H + 0.2, -o.L * q2], at(q, sx), 0.05, 5);
    }
  }
  for (let i = 3; i <= n - 3; i += 3) {
    const p = at(i / n, 1);
    if (p[1] - o.H < 6) continue;
    steelMember(b, o.tex, at(i / n, -1), p, 0.5, 0.5, [0, 0, 1]);
  }
}

/** Concrete arch below the deck with spandrel columns. */
function deckArch(b: MeshBuilder, sec: Section, o: { L: number; H: number; tex: string; ribs?: number; seed?: number }): void {
  const { w } = deckOnAbutments(b, sec, o, 1, 0, false);
  const inset = o.L * 0.12;
  const half = o.L / 2 - inset;
  const crown = o.H - 1.9;
  const y = (s: number): number => crown * (1 - ((s - o.L / 2) / half) ** 2);
  const ribs = o.ribs ?? 2;
  const xs = Array.from({ length: ribs }, (_, i) => (ribs === 1 ? 0 : -w * 0.3 + (w * 0.6 * i) / (ribs - 1)));
  const rw = ribs === 1 ? w * 0.6 : 1.3;
  const n = 22;
  for (const x of xs) for (let i = 0; i < n; i++) {
    const s0 = inset + (2 * half * i) / n;
    const s1 = inset + (2 * half * (i + 1)) / n;
    b.beam(o.tex, [x, y(s0), -s0], [x, y(s1), -s1], rw, 1.3);
  }
  const cols = Math.round(o.L / 7);
  for (let i = 0; i <= cols; i++) {
    const s = (o.L * i) / cols;
    const base = s <= inset || s >= o.L - inset ? 0 : y(s) + 0.3;
    if (o.H - 1 - base < 0.6) continue;
    const ends = i === 0 || i === cols;
    for (const x of ends ? [0] : xs) b.box(o.tex, [x, (base + o.H - 1) / 2, -s], [ends ? w * 0.45 : ribs === 1 ? w * 0.25 : 0.35, (o.H - 1 - base) / 2, ends ? 0.6 : 0.35]);
  }
}

/** Suspension bridge: towers, parabolic main cables, hangers and anchor blocks. */
function suspension(b: MeshBuilder, sec: Section, o: { main: number; side: number; H: number; tower: number; tex: string; towerTex?: string; seed?: number }): void {
  const L = o.main + o.side * 2;
  const { w } = deckOnAbutments(b, sec, { L, H: o.H, seed: o.seed }, 1.8, 0, false);
  const x = w / 2 + 0.9;
  const tt = o.towerTex ?? o.tex;
  const topY = o.H + o.tower;
  for (const s of [o.side, o.side + o.main]) {
    for (const sx of [1, -1]) b.box(tt, [sx * x, topY / 2, -s], [0.9, topY / 2, 1.3]);
    for (const yy of [o.H - 2.6, o.H + o.tower * 0.5, topY - 1.2]) b.box(tt, [0, yy, -s], [x - 0.9, 0.8, 1]);
    b.box('structure/pier-formwork', [0, 0.6, -s], [x + 2, 0.6, 3]);
  }
  for (const s of [0, L]) b.box('structure/wall-smooth', [0, (o.H + 1) / 2, -s + (s === 0 ? 3 : -3)], [x + 1.2, (o.H + 1) / 2, 3]);
  const sag = topY - (o.H + 2.2);
  const cy = (s: number): number => {
    if (s < o.side) return o.H + 1 + (o.tower - 1) * (s / o.side) ** 1.6;
    if (s > o.side + o.main) return o.H + 1 + (o.tower - 1) * ((L - s) / o.side) ** 1.6;
    const q = (s - o.side) / o.main;
    return topY - sag * 4 * q * (1 - q);
  };
  const step = 4;
  for (const sx of [1, -1]) {
    for (let s = 0; s < L - 1e-6; s += step) {
      const s1 = Math.min(L, s + step);
      b.tube(o.tex, [sx * x, cy(s), -s], [sx * x, cy(s1), -s1], 0.28, 7);
    }
    for (let s = 8; s < L - 4; s += 8) if (Math.abs(s - o.side) > 3 && Math.abs(s - o.side - o.main) > 3 && cy(s) - o.H > 1.2) b.tube('structure/steel-galvanized', [sx * x, o.H + 0.2, -s], [sx * x, cy(s), -s], 0.05, 4);
    b.box(o.tex, [sx * x, o.H - 0.6, -L / 2], [0.25, 1.1, L / 2]);
  }
}

/** Cable-stayed bridge with H, A or single-mast pylons. */
function cableStayed(b: MeshBuilder, sec: Section, o: { L: number; H: number; pylons: number[]; tower: number; shape: 'H' | 'A' | 'mast'; harp?: boolean; reach: number; tex?: string; seed?: number }): void {
  const { w } = deckOnAbutments(b, sec, o, 1.6, 0, false);
  const tex = o.tex ?? 'structure/wall-smooth';
  const x = w / 2 + 0.8;
  const topY = o.H + o.tower;
  for (const f of o.pylons) {
    const s = o.L * f;
    if (o.shape === 'mast') b.box(tex, [0, topY / 2, -s], [0.9, topY / 2, 1.4]);
    else {
      for (const sx of [1, -1]) {
        if (o.shape === 'H') b.box(tex, [sx * x, topY / 2, -s], [0.8, topY / 2, 1.3]);
        else {
          b.beam(tex, [sx * (x + 2), 0, -s], [sx * x, o.H, -s], 1.8, 2.4, [0, 0, 1]);
          b.beam(tex, [sx * x, o.H, -s], [sx * 0.7, topY, -s], 1.6, 2.2, [0, 0, 1]);
        }
      }
      b.box(tex, [0, o.H - 2.4, -s], [x, 0.8, 1.1]);
      if (o.shape === 'H') b.box(tex, [0, o.H + o.tower * 0.62, -s], [x - 0.8, 0.7, 0.9]);
    }
    b.box('structure/pier-formwork', [0, 0.5, -s], [x + 2.5, 0.5, 3]);
    const stays = Math.floor(o.reach / 8);
    for (let k = 1; k <= stays; k++) for (const dir of [1, -1]) {
      const sd = s + dir * k * 8;
      if (sd < 1 || sd > o.L - 1) continue;
      const hy = o.harp ? o.H + o.tower * (0.35 + (0.6 * k) / stays) : topY - 1 - (k / stays) * o.tower * 0.25;
      for (const sx of o.shape === 'mast' ? [0] : [1, -1]) {
        const tx = o.shape === 'A' ? sx * (0.7 + (x - 0.7) * (1 - (hy - o.H) / o.tower)) : sx * x;
        b.tube('structure/steel-white', [sx * (o.shape === 'mast' ? 0 : x - 0.5), o.H + 0.25, -sd], [tx, hy, -s], 0.09, 5);
      }
    }
  }
  abutment(b, { p: [0, o.H, 0], t: [0, 0, -1], r: [1, 0, 0], u: UP, s: 0 }, w, 1.6, -1);
  abutment(b, { p: [0, o.H, -o.L], t: [0, 0, -1], r: [1, 0, 0], u: UP, s: o.L }, w, 1.6, 1);
}

const walkway = (w: number, tex: string, edge: Section['left']['edge'], edgeTex?: string): Section => ({ lanes: [{ kind: 'shoulder', w, dir: 0, tex }], lines: [null, null], left: { edge, edgeTex }, right: { edge, edgeTex }, asphalt: tex, paint: 'worn' });
function stairs(b: MeshBuilder, tex: string, topP: V3, dir: V3, w: number, H: number): void {
  const n = Math.round(H / 0.17);
  const ax: V3 = [-dir[2], 0, dir[0]];
  for (let i = 0; i < n; i++) {
    const y = H - (H * (i + 1)) / n;
    const c = v3.mad(topP, dir, 0.15 + i * 0.3);
    b.box(tex, [c[0], y + H / n / 2 - 0.25, c[2]], [w / 2, H / n / 2 + 0.25, 0.15], ax, UP, dir);
  }
  for (const sx of [1, -1]) {
    const o = v3.scale(ax, (sx * w) / 2);
    b.beam('structure/steel-galvanized', v3.add(v3.add(topP, o), [0, 1, 0]), v3.add(v3.add(v3.mad(topP, dir, n * 0.3), o), [0, 1 - H, 0]), 0.06, 0.06);
    for (let i = 0; i <= n; i += 4) b.tube('structure/steel-galvanized', v3.add(v3.add(v3.mad(topP, dir, i * 0.3), o), [0, -(H * i) / n, 0]), v3.add(v3.add(v3.mad(topP, dir, i * 0.3), o), [0, 1 - (H * i) / n, 0]), 0.03, 5);
  }
}

export function addStructures(): void {
  const st2 = (edgeTex = 'structure/steel-green', walk = 'concrete/walk-plain'): Section => street({ lanes: 1, laneW: 3.5, walk, walkW: 1.8, edge: 'railing', edgeTex, age: 'used', wear: 'cracked' });
  const st4 = (edgeTex = 'structure/steel-grey'): Section => street({ lanes: 2, walk: 'concrete/walk-plain', walkW: 2.2, edge: 'railing', edgeTex, age: 'used', wear: 'sealed' });
  const st4m = (): Section => street({ lanes: 2, median: 'barrier', walk: 'concrete/walk-plain', walkW: 2, edge: 'railing', edgeTex: 'structure/steel-white', age: 'used' });
  const hw = (lanes: number, edge: 'parapet' | 'barrier' | 'wall' = 'parapet', concrete = false): Section => highway({ lanes, edge, concrete, age: 'used', wear: 'sealed' });
  const ramp = (lanes = 1): Section => highway({ lanes, dual: false, shoulder: 1.8, edge: 'parapet', age: 'used' });
  const B = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('bridge', id, label, fn);
  const E = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('elevated', id, label, fn);

  B('girder-2lane', '桁橋 2車線 コンクリート箱桁・壁式橋脚', (b) => girderBridge(b, st2(), { L: 72, H: 8, spans: 3, pier: 'wall' }));
  B('girder-4lane', '桁橋 4車線 2本柱橋脚', (b) => girderBridge(b, st4(), { L: 90, H: 9, spans: 3, pier: 'columns', seed: 3 }));
  B('girder-4lane-camber', '桁橋 4車線 むくり付き・T型橋脚', (b) => girderBridge(b, st4m(), { L: 100, H: 8, spans: 4, pier: 'hammerhead', camber: 1.6, seed: 4 }));
  B('girder-short', '短い橋(水路・単径間)', (b) => girderBridge(b, st2('structure/steel-black', 'concrete/walk-square-dirty'), { L: 18, H: 3.5, spans: 1, pier: 'wall', depth: 1 }));
  B('girder-old-boards', '古い桁橋 板型枠の橋脚', (b) => girderBridge(b, street({ lanes: 1, laneW: 3.2, walk: 'concrete/walk-square-cracked', walkW: 1.4, edge: 'parapet', age: 'bleached', wear: 'broken' }), { L: 54, H: 7, spans: 3, pier: 'wall', pierTex: 'structure/pier-boards', abutTex: 'structure/wall-old', seed: 5 }));
  B('plate-girder-green', '鋼板桁橋 緑塗装', (b) => girderBridge(b, st2(), { L: 66, H: 8, spans: 2, pier: 'wall', steel: 'structure/steel-green', depth: 2.2 }));
  B('plate-girder-corten', '鋼板桁橋 耐候性鋼・4車線', (b) => girderBridge(b, st4('structure/steel-corten'), { L: 84, H: 9, spans: 3, pier: 'columns', steel: 'structure/steel-corten', depth: 2.4, seed: 6 }));
  B('plate-girder-rusty', '鋼板桁橋 錆びた灰色・鋼製橋脚', (b) => girderBridge(b, st2('structure/steel-grey-rusty', 'concrete/walk-square-cracked'), { L: 60, H: 9, spans: 3, pier: 'steel', pierTex: 'structure/steel-grey-rusty', steel: 'structure/steel-grey-rusty', depth: 1.9, seed: 7 }));
  B('highway-girder', '高速の桁橋 片側2車線', (b) => girderBridge(b, hw(2), { L: 120, H: 10, spans: 4, pier: 'hammerhead', depth: 2, seed: 8 }));
  B('stone-arch-3', '石造アーチ橋 3連', (b) => archBridge(b, street({ lanes: 1, laneW: 3.1, walk: 'paving/slabs-sandstone', walkW: 1.5, curb: 'curb/granite', age: 'worn' }), { L: 60, H: 10, spans: 3, tex: 'structure/stone-ashlar' }));
  B('stone-arch-1', '石造アーチ橋 単径間(扁平)', (b) => archBridge(b, street({ lanes: 1, laneW: 3, centre: null, walk: 'paving/setts-granite', walkW: 1.2, curb: 'curb/granite', age: 'worn' }), { L: 26, H: 5.5, spans: 1, tex: 'structure/stone-dark', flat: 0.8, pierW: 3 }));
  B('stone-arch-5', '石造アーチ橋 5連・4車線', (b) => archBridge(b, street({ lanes: 2, walk: 'paving/slabs-granite', walkW: 2.2, curb: 'curb/granite', age: 'used' }), { L: 110, H: 12, spans: 5, tex: 'structure/stone-ashlar', ring: 'structure/stone-dark' }));
  B('brick-arch', 'レンガアーチ橋 4連', (b) => archBridge(b, st2('structure/steel-black', 'paving/running-red'), { L: 64, H: 9, spans: 4, tex: 'structure/brick-red', ring: 'structure/brick-brown' }));
  B('deck-arch', 'コンクリート上路アーチ橋', (b) => deckArch(b, st2('structure/steel-white'), { L: 90, H: 20, tex: 'structure/wall-smooth' }));
  B('deck-arch-old', '上路アーチ橋 古い・単リブ', (b) => deckArch(b, street({ lanes: 1, laneW: 3.2, walk: 'concrete/walk-square-dirty', walkW: 1.5, edge: 'parapet', age: 'worn', wear: 'patched' }), { L: 64, H: 15, tex: 'structure/wall-old', ribs: 1, seed: 9 }));
  B('deck-arch-4lane', '上路アーチ橋 4車線・3リブ', (b) => deckArch(b, st4m(), { L: 120, H: 26, tex: 'structure/pier-formwork', ribs: 3, seed: 10 }));
  B('tied-arch-white', 'タイドアーチ橋 白', (b) => tiedArch(b, st2('structure/steel-white'), { L: 70, H: 7, tex: 'structure/steel-white', rise: 13 }));
  B('tied-arch-red', 'タイドアーチ橋 赤・4車線', (b) => tiedArch(b, st4('structure/steel-red'), { L: 100, H: 8, tex: 'structure/steel-red', rise: 19, seed: 11 }));
  B('tied-arch-network', 'ネットワークアーチ橋 青', (b) => tiedArch(b, st4m(), { L: 110, H: 8, tex: 'structure/steel-blue', rise: 18, hangers: 'network', seed: 12 }));
  B('truss-warren-green', 'ワーレントラス橋 緑', (b) => trussBridge(b, st2(), { L: 56, H: 7, tex: 'structure/steel-green', height: 7.5 }));
  B('truss-pratt-grey', 'プラットトラス橋 灰・4車線', (b) => trussBridge(b, st4(), { L: 84, H: 8, tex: 'structure/steel-grey', height: 9, pratt: true, seed: 13 }));
  B('truss-camelback-rusty', '曲弦トラス橋 錆', (b) => trussBridge(b, st2('structure/steel-red-rusty', 'concrete/walk-square-cracked'), { L: 70, H: 7, tex: 'structure/steel-red-rusty', height: 10, curve: 0.45, pratt: true, seed: 14 }));
  B('truss-pony', 'ポニートラス橋(低い)', (b) => trussBridge(b, street({ lanes: 1, laneW: 3.3, walk: null, curb: null, age: 'worn', wear: 'cracked' }), { L: 35, H: 5, tex: 'structure/steel-green-rusty', height: 3 }));
  B('truss-corten', 'ワーレントラス橋 耐候性鋼', (b) => trussBridge(b, st2('structure/steel-corten'), { L: 63, H: 7, tex: 'structure/steel-corten', height: 8, seed: 15 }));
  B('suspension-red', '吊り橋 赤・6車線', (b) => suspension(b, street({ lanes: 3, median: 'barrier', walk: 'concrete/walk-plain', walkW: 2.4, edge: 'railing', edgeTex: 'structure/steel-red', age: 'used' }), { main: 220, side: 70, H: 22, tower: 44, tex: 'structure/steel-red', seed: 16 }));
  B('suspension-grey', '吊り橋 灰・4車線 コンクリート塔', (b) => suspension(b, st4(), { main: 150, side: 50, H: 18, tower: 30, tex: 'structure/steel-grey', towerTex: 'structure/wall-smooth', seed: 17 }));
  B('suspension-small', '小さな吊り橋 2車線・緑', (b) => suspension(b, st2(), { main: 90, side: 28, H: 12, tower: 18, tex: 'structure/steel-green', towerTex: 'structure/stone-ashlar', seed: 18 }));
  B('cable-stayed-h', '斜張橋 H型主塔・ファン型', (b) => cableStayed(b, st4m(), { L: 220, H: 18, pylons: [0.3, 0.7], tower: 42, shape: 'H', reach: 60, seed: 19 }));
  B('cable-stayed-a', '斜張橋 A型主塔・1本', (b) => cableStayed(b, st4(), { L: 150, H: 15, pylons: [0.5], tower: 48, shape: 'A', reach: 70, seed: 20 }));
  B('cable-stayed-mast', '斜張橋 1本柱・ハープ型', (b) => cableStayed(b, st4m(), { L: 130, H: 14, pylons: [0.38], tower: 40, shape: 'mast', harp: true, reach: 72, seed: 21 }));
  B('footbridge-stairs', '歩道橋 階段付き(道路上)', (b) => {
    sweepSection(b, placePath(straight(30, 1), [-15, 0, 0], -Math.PI / 2), street({ lanes: 2, median: 'turn', age: 'used' }));
    const sec = walkway(2.4, 'concrete/walk-plain', 'fence', 'structure/steel-green');
    const path = lift(placePath(straight(30, 6), [0, 0, 15], 0), 5.6);
    sweepSection(b, path, sec, { body: 'deck', deckDepth: 0.7 });
    for (const s of [1.2, 28.8]) pier(b, frameAt(path, s), { kind: 'column', w: 2.4, depth: 0.7, tex: 'structure/wall-smooth' });
    stairs(b, 'concrete/walk-plain', [0, 5.6, 15], [0, 0, 1], 2.2, 5.6);
    stairs(b, 'concrete/walk-plain', [0, 5.6, -15], [0, 0, -1], 2.2, 5.6);
  });
  B('footbridge-truss', '歩道橋 鋼トラス', (b) => trussBridge(b, walkway(3, 'paving/boardwalk-grey', 'railing', 'structure/steel-blue'), { L: 42, H: 6, tex: 'structure/steel-blue', height: 2.8 }));
  B('footbridge-arch', '歩道橋 太鼓橋(石)', (b) => {
    const path = hump(22, 2.6);
    sweepSection(b, lift(path, 1.5), walkway(3, 'paving/setts-granite', 'none'), { body: 'deck', deckDepth: 0.8, deckTex: 'structure/stone-ashlar' });
    for (const sx of [1, -1]) sweep(b, lift(path, 1.5), [{ material: 'structure/stone-ashlar', pts: sx === 1 ? [[1.2, 0], [1.2, 0.9], [1.5, 0.9], [1.5, -0.2]] : [[-1.5, -0.2], [-1.5, 0.9], [-1.2, 0.9], [-1.2, 0]], uv: 'along' }]);
    for (const z of [0, -22]) b.box('structure/stone-ashlar', [0, 0.5, z], [1.8, 1, 1.2]);
  });
  B('footbridge-boardwalk', '歩道橋 木道(水辺)', (b) => {
    const path = lift(through([[0, 0, 0], [2, 0, -12], [-1, 0, -24], [0, 0, -36]], 24), 1.6);
    sweepSection(b, path, walkway(2.6, 'paving/boardwalk', 'cable'), { body: 'deck', deckDepth: 0.3, deckTex: 'paving/boardwalk-grey' });
    for (let s = 2; s < 36; s += 4) for (const sx of [1, -1]) {
      const f = frameAt(path, s);
      const p = v3.mad(f.p, f.r, sx * 1.1);
      b.tube('paving/boardwalk-grey', [p[0], 0, p[2]], [p[0], 1.4, p[2]], 0.12, 7);
    }
  });

  const viaduct = (b: MeshBuilder, path: Path, sec: Section, kind: PierKind, spacing: number, depth = 1.8, tex?: string, span?: number): void => {
    sweepSection(b, path, sec, { body: 'deck', deckDepth: depth });
    litter(b, path, sec, 30, 0.4);
    const w = widthOf(sec);
    const n = Math.max(1, Math.round(pathLength(path) / spacing));
    for (let i = 0; i < n; i++) pier(b, frameAt(path, (pathLength(path) * (i + 0.5)) / n), { kind, w, depth, tex, span });
  };
  E('viaduct-hammerhead', '高架高速 T型橋脚', (b) => viaduct(b, lift(straight(105, 14), 11), hw(2), 'hammerhead', 35));
  E('viaduct-columns', '高架高速 3本柱橋脚・片側3車線', (b) => viaduct(b, lift(straight(120, 14), 11), hw(3, 'barrier'), 'columns', 30));
  E('viaduct-wall', '高架高速 壁式橋脚・コンクリート舗装', (b) => viaduct(b, lift(straight(100, 14), 9), hw(2, 'parapet', true), 'wall', 25, 1.6, 'structure/pier-boards'));
  E('viaduct-portal', '高架高速 門型橋脚(下に道路)', (b) => {
    sweepSection(b, straight(100, 1), street({ lanes: 2, median: 'turn', age: 'worn', wear: 'patched' }));
    viaduct(b, lift(straight(100, 14), 12), hw(2), 'portal', 33, 1.8, undefined, 27);
  });
  E('viaduct-steel', '高架 鋼製橋脚・古い2車線', (b) => {
    const path = lift(straight(72, 12), 9);
    const sec = street({ lanes: 1, laneW: 3.5, walk: null, curb: null, edge: 'railing', edgeTex: 'structure/steel-green-rusty', age: 'bleached', wear: 'broken' });
    viaduct(b, path, sec, 'steel', 12, 0.55, 'structure/steel-green-rusty');
    girders(b, path, widthOf(sec), 3, 1.5, 'structure/steel-green-rusty');
  });
  E('viaduct-noise-wall', '高架高速 遮音壁付き', (b) => viaduct(b, lift(straight(100, 14), 11), hw(2, 'wall'), 'column', 25));
  E('viaduct-curve', '高架高速 カーブ(片勾配)', (b) => viaduct(b, lift(arc(140, 0.8, 0, 0.05), 11), hw(2), 'hammerhead', 32));
  E('viaduct-street', '高架の一般道 4車線', (b) => viaduct(b, lift(straight(90, 12), 8), st4m(), 'columns', 30, 1.5));
  E('viaduct-brick-arches', 'レンガアーチの高架(連続)', (b) => archBridge(b, st2('structure/steel-black'), { L: 96, H: 8.5, spans: 8, tex: 'structure/brick-red', ring: 'structure/brick-brown', pierW: 1.8 }));
  E('ramp-flyover', 'フライオーバーランプ(曲線で上る)', (b) => viaduct(b, placePath(arc(70, 1.5, 9, 0.05), [0, 2.5, 0], 0), ramp(), 'column', 26, 1.5));
  E('ramp-up', '高架への上りランプ(擁壁から橋脚へ)', (b) => {
    const path = through([[0, 0, 0], [0, 0.4, -15], [0, 4.5, -60], [0, 9.6, -110], [0, 10, -130]], 40);
    const sec = ramp();
    const w = widthOf(sec);
    const low = slicePath(path, 0, 62);
    sweepSection(b, low, sec, { body: 'none' });
    fill(b, low, -w / 2, w / 2, 'wall', 'structure/wall-smooth');
    const high = slicePath(path, 62, pathLength(path));
    sweepSection(b, high, sec, { body: 'deck', deckDepth: 1.5 });
    for (const s of [14, 38, 60]) pier(b, frameAt(high, s), { kind: 'column', w, depth: 1.5 });
  });
  E('ramp-embankment', '盛土の上りランプ(芝の法面)', (b) => {
    const path = through([[0, 0, 0], [0, 0.3, -15], [0, 3.6, -55], [0, 7, -95], [0, 7.2, -110]], 36);
    const sec = highway({ lanes: 1, dual: false, shoulder: 2, edge: 'guardrail', age: 'used' });
    const w = widthOf(sec);
    sweepSection(b, path, sec, { body: 'none' });
    fill(b, path, -w / 2, w / 2, 'slope', 'ground/grass-dry');
  });
  E('helix-ramp', 'らせんランプ(2回転)', (b) => {
    const sec = ramp();
    const w = widthOf(sec);
    const R = 16;
    const path = helix(R, 2, 14);
    sweepSection(b, path, sec, { body: 'deck', deckDepth: 0.9 });
    b.tube('structure/wall-smooth', [-R, -0.2, 0], [-R, 15.5, 0], R - w / 2 - 0.2, 28, R - w / 2 - 0.2, true);
  });
  E('helix-ramp-wide', 'らせんランプ 2車線(1.5回転)', (b) => {
    const sec = ramp(2);
    const w = widthOf(sec);
    const R = 22;
    sweepSection(b, helix(R, 1.5, 11), sec, { body: 'deck', deckDepth: 1 });
    b.tube('structure/pier-formwork', [-R, -0.2, 0], [-R, 12.5, 0], R - w / 2 - 0.2, 32, R - w / 2 - 0.2, true);
  });
  E('double-deck', '二層高架(上下2層)', (b) => {
    const sec = highway({ lanes: 3, dual: false, shoulder: 1.5, edge: 'parapet', age: 'worn', wear: 'sealed' });
    const w = widthOf(sec);
    for (const h of [9, 17]) {
      const path = lift(straight(96, 12), h);
      sweepSection(b, path, sec, { body: 'deck', deckDepth: 1.6 });
      litter(b, path, sec, h, 0.4);
    }
    for (let z = -12; z > -96; z -= 24) {
      for (const sx of [1, -1]) b.box('structure/pier-formwork', [sx * (w / 2 + 0.9), 7.7, z], [0.8, 7.7, 0.9]);
      for (const h of [9, 17]) b.box('structure/pier-formwork', [0, h - 1.6 - 0.8, z], [w / 2 + 1.7, 0.8, 0.9]);
    }
  });
  const overpass = (b: MeshBuilder, upper: Section, lower: Section, H: number, slopes: 'slope' | 'wall'): void => {
    const lw = widthOf(lower);
    const half = lw / 2 + 2;
    const run = H / 0.065;
    const path = through([[0, 0, half + run + 12], [0, 0.2, half + run], [0, H - 0.3, half + 6], [0, H, half], [0, H, -half], [0, H - 0.3, -half - 6], [0, 0.2, -half - run], [0, 0, -half - run - 12]], 80);
    const w = widthOf(upper);
    const L = pathLength(path);
    const s0 = L / 2 - half;
    const a = slicePath(path, 0, s0);
    const c = slicePath(path, L - s0, L);
    const mid = slicePath(path, s0, L - s0);
    for (const p of [a, c]) {
      sweepSection(b, p, upper, { body: 'none' });
      fill(b, p, -w / 2, w / 2, slopes, slopes === 'slope' ? 'ground/grass-dry' : 'structure/wall-smooth');
    }
    sweepSection(b, mid, upper, { body: 'deck', deckDepth: 1.3 });
    abutment(b, mid[0], w, 1.3, -1);
    abutment(b, mid[mid.length - 1], w, 1.3, 1);
    const ext = slopes === 'slope' ? w / 2 + H * 1.6 + 4 : w / 2 + 8;
    const lp = placePath(straight(ext * 2, 1), [-ext, 0, 0], -Math.PI / 2);
    sweepSection(b, lp, lower);
    litter(b, lp, lower, 44, 0.6);
  };
  E('overpass-street', '立体交差 一般道が一般道を越える(盛土)', (b) => overpass(b, street({ lanes: 1, laneW: 3.5, walk: 'concrete/walk-plain', walkW: 1.6, edge: 'railing', age: 'used' }), street({ lanes: 2, age: 'used', wear: 'cracked' }), 6.4, 'slope'));
  E('overpass-arterial-wall', '立体交差 幹線が幹線を越える(擁壁)', (b) => overpass(b, street({ lanes: 2, median: 'barrier', walk: null, curb: null, edge: 'parapet', age: 'used' }), street({ lanes: 2, median: 'turn', age: 'worn', wear: 'sealed' }), 6.6, 'wall'));
  E('overpass-highway', '立体交差 高速が一般道を越える', (b) => overpass(b, hw(2), street({ lanes: 2, median: 'planted', age: 'used' }), 7, 'slope'));
  E('underpass', 'アンダーパス(掘割で道路の下をくぐる)', (b) => {
    const sec = street({ lanes: 2, median: 'barrier', walk: null, curb: null, age: 'used', wear: 'sealed' });
    const w = widthOf(sec);
    const path = through([[0, 0, 0], [0, -0.2, -12], [0, -5.6, -70], [0, -6, -90], [0, -5.6, -110], [0, -0.2, -168], [0, 0, -180]], 72);
    sweepSection(b, path, sec, { body: 'none' });
    // Retaining walls rise from the sunken road to ground level.
    for (let i = 0; i + 1 < path.length; i++) for (const sx of [1, -1]) {
      const [f0, f1] = [path[i], path[i + 1]];
      const p = (f: Frame, y: number): V3 => [f.p[0] + (sx * w) / 2, y, f.p[2]];
      b.quadFacing('structure/wall-smooth', p(f0, f0.p[1]), p(f1, f1.p[1]), p(f1, 0.9), p(f0, 0.9), [-sx, 0, 0], [[f0.s, f0.p[1]], [f1.s, f1.p[1]], [f1.s, 0.9], [f0.s, 0.9]]);
    }
    const top = street({ lanes: 2, age: 'used', wear: 'cracked', edge: 'railing' });
    const tp = placePath(straight(50, 6), [-25, 0, -90], -Math.PI / 2);
    sweepSection(b, tp, top, { body: 'deck', deckDepth: 1.1 });
    litter(b, tp, top, 45, 0.6);
  });
}
