import { MeshBuilder, V3 } from './builder';
import { Pose, at, box, catenary, lathe, move, pipe, plate, stand, turn } from './kit';
import { addModel } from './registry';
import { FOOT, G, Prof, STYLES, StyleName, TIE, TOP, TrackStyle, Way, bed, bend, branchOffset, cap, cuts, poseAt, pt, rail, rails, shift, sideWay, sleepers, stain, sweep, track, turnout, way } from './railkit';

const STEEL = 'structure/steel-galvanized';

/** Several parallel tracks sharing one ballast bed. `lats` are their centres. */
export function tracks(w: Way, s0: number, s1: number, lats: number[], st: TrackStyle | TrackStyle[], o: { bed?: boolean; pad?: number } = {}): void {
  const style = (i: number): TrackStyle => (Array.isArray(st) ? st[i % st.length] : st);
  const pad = o.pad ?? 1.75;
  if (o.bed ?? true) bed(w, s0, s1, { mat: style(0).ballast, l: -Math.min(...lats) + pad, r: Math.max(...lats) + pad });
  lats.forEach((d, i) => {
    const side = sideWay(w, d);
    stain(side, s0, s1, style(i).stain);
    rails(side, s0, s1, style(i));
  });
}

/** Electrified third rail on insulators with a cover board, beside the running rail on the given side. */
export function thirdRail(w: Way, s0: number, s1: number, side: 1 | -1): void {
  const x = side * (G + 0.4);
  const prof = (x0: number, x1: number, y0: number, y1: number): Prof => [[x0, y0], [x0, y1], [x1, y1], [x1, y0]];
  sweep(w, 'rail/conductor-rail', s0 + 0.4, s1 - 0.4, prof(x - 0.04, x + 0.04, TIE + 0.1, TIE + 0.2));
  sweep(w, 'furniture/enamel-yellow-old', s0 + 0.4, s1 - 0.4, [...prof(x - 0.11, x + 0.11, TIE + 0.28, TIE + 0.305), [x - 0.11, TIE + 0.28]]);
  for (const s of cuts(s0 + 0.9, s1 - 0.9, 2.6)) {
    const f = poseAt(w, s);
    box(w.b, 'furniture/ceramic-brown', f, [x, TIE + 0.05, 0], [0.05, 0.05, 0.06], 'Y');
    box(w.b, 'rail/steel-dark', f, [x + side * 0.1, TIE + 0.15, 0], [0.012, 0.15, 0.03], 'Y');
    box(w.b, 'rail/steel-dark', f, [x + side * 0.05, TIE + 0.27, 0], [0.06, 0.01, 0.03]);
  }
  for (const [s, dir] of [[s0 + 0.4, -1], [s1 - 0.4, 1]] as [number, 1 | -1][]) cap(w, 'rail/conductor-rail', s, prof(x - 0.04, x + 0.04, TIE + 0.1, TIE + 0.2), dir);
}

const WIRE_Y = 5.3 + TOP;
const insulator = (b: MeshBuilder, a: V3, c: V3): void => {
  const d: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const l = Math.hypot(...d);
  const q = (k: number): V3 => [a[0] + (d[0] * k) / l, a[1] + (d[1] * k) / l, a[2] + (d[2] * k) / l];
  for (let i = 0; i < 4; i++) pipe(b, 'furniture/ceramic-brown', [q(0.08 + i * 0.08), q(0.13 + i * 0.08)], 0.055, 8);
};

/** One arm of overhead line equipment reaching from x0 (on a mast or drop tube) to the wires above a track at lat. */
function cantilever(w: Way, s: number, x0: number, lat: number): void {
  const f = poseAt(w, s);
  const top = at(f, x0, WIRE_Y + 1.75, 0);
  const low = at(f, x0, WIRE_Y + 0.35, 0);
  const mess = at(f, lat, WIRE_Y + 1.3, 0);
  const k = 0.55;
  const mid: V3 = [low[0] + (mess[0] - low[0]) * k, low[1] + (mess[1] - low[1]) * k, low[2] + (mess[2] - low[2]) * k];
  const dir = Math.sign(lat - x0) || 1;
  const reg = at(f, lat + dir * 0.9, WIRE_Y + 0.28, 0);
  pipe(w.b, STEEL, [top, mess], 0.024, 6);
  pipe(w.b, STEEL, [low, mess], 0.028, 6);
  pipe(w.b, STEEL, [at(f, x0, WIRE_Y + 0.28, 0), reg], 0.02, 6);
  pipe(w.b, STEEL, [reg, at(f, lat + dir * 0.9, mid[1] + 0.25, 0)], 0.012, 5);
  pipe(w.b, STEEL, [reg, at(f, lat, WIRE_Y + 0.02, 0)], 0.012, 5);
  insulator(w.b, top, mess);
  insulator(w.b, low, mess);
  insulator(w.b, at(f, x0, WIRE_Y + 0.28, 0), reg);
}

/** Overhead line mast beside the track, with a cantilever for each listed track. */
export function mast(w: Way, s: number, x: number, lats: number[], o: { mat?: string; lamp?: boolean } = {}): void {
  const f = poseAt(w, s);
  const mat = o.mat ?? STEEL;
  const h = WIRE_Y + 2.3;
  box(w.b, 'structure/pier-formwork', f, [x, 0.3, 0], [0.32, 0.3, 0.32], 'Y');
  for (const sx of [-1, 1]) box(w.b, mat, f, [x + sx * 0.1, 0.6 + h / 2, 0], [0.012, h / 2, 0.11]);
  box(w.b, mat, f, [x, 0.6 + h / 2, 0], [0.1, h / 2, 0.008]);
  box(w.b, 'rail/signal-plate', f, [x - Math.sign(x) * 0.115, 2.2, 0], [0.004, 0.09, 0.15]);
  for (const lat of lats) cantilever(w, s, x - Math.sign(x - lat) * 0.12, lat);
}

/** Portal spanning all tracks, carrying one cantilever per track from drop tubes. */
export function portal(w: Way, s: number, x0: number, x1: number, lats: number[]): void {
  const f = poseAt(w, s);
  const h = WIRE_Y + 3;
  for (const x of [x0, x1]) {
    box(w.b, 'structure/pier-formwork', f, [x, 0.3, 0], [0.35, 0.3, 0.35], 'Y');
    for (const sx of [-1, 1]) box(w.b, STEEL, f, [x + sx * 0.11, 0.6 + h / 2, 0], [0.012, h / 2, 0.12]);
    box(w.b, STEEL, f, [x, 0.6 + h / 2, 0], [0.1, h / 2, 0.008]);
  }
  const y = 0.6 + h;
  for (const [dy, dz] of [[0, -0.2], [0, 0.2], [-0.55, -0.2], [-0.55, 0.2]]) pipe(w.b, STEEL, [at(f, x0, y + dy, dz), at(f, x1, y + dy, dz)], 0.035, 6);
  const n = Math.max(2, Math.round((x1 - x0) / 0.9));
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n;
    const c = x0 + ((x1 - x0) * (i + 1)) / n;
    for (const dz of [-0.2, 0.2]) pipe(w.b, STEEL, [at(f, a, y - (i % 2 ? 0 : 0.55), dz), at(f, c, y - (i % 2 ? 0.55 : 0), dz)], 0.016, 5, false);
  }
  for (const lat of lats) {
    const x = lat - 1.5;
    box(w.b, STEEL, f, [x, y - 0.55 - 1.05, 0], [0.05, 1.05, 0.05]);
    cantilever(w, s, x + 0.06, lat);
  }
}

/** Contact wire, messenger wire and droppers above a track, hung from supports at the given distances. */
export function wires(w: Way, s0: number, s1: number, lat: number, supports: number[]): void {
  const span = supports.length > 1 ? supports[1] - supports[0] : s1 - s0;
  const sag = (s: number): number => {
    const near = supports.reduce((m, q) => Math.min(m, Math.abs(s - q)), 1e9);
    const u = Math.min(1, near / (span / 2));
    return WIRE_Y + 0.4 + 0.9 * (1 - u) ** 2;
  };
  const ss = cuts(s0, s1, Math.min(2, w.c.step));
  pipe(w.b, 'furniture/cable', ss.map((s) => pt(w, lat, WIRE_Y, s)), 0.011, 5, false);
  pipe(w.b, 'furniture/cable', ss.map((s) => pt(w, lat, sag(s), s)), 0.009, 5, false);
  for (const s of cuts(s0 + 1.5, s1 - 1.5, 4.5)) pipe(w.b, 'furniture/cable', [pt(w, lat, WIRE_Y, s), pt(w, lat, sag(s), s)], 0.005, 4, false);
}

export type BufferKind = 'timber' | 'steel' | 'concrete' | 'mound';

/** Buffer stop at the end of a track that arrives from smaller s. */
export function bufferStop(w: Way, s: number, kind: BufferKind): void {
  const f = poseAt(w, s);
  const b = w.b;
  const stripes = (y: number, z: number, hw = 1.2): void => {
    b.quad('rail/buffer-stripes', at(f, hw, y - 0.15, z), at(f, -hw, y - 0.15, z), at(f, -hw, y + 0.15, z), at(f, hw, y + 0.15, z), [[0, 0], [hw * 2, 0], [hw * 2, 0.3], [0, 0.3]]);
  };
  const y = TOP + 1.0;
  if (kind === 'timber') {
    for (const x of [-G, G]) {
      box(b, 'rail/sleeper-wood', f, [x, (y + 0.2) / 2, 0.14], [0.13, (y + 0.2) / 2, 0.13], 'Y');
      b.beam('rail/sleeper-wood', at(f, x, y - 0.1, 0.25), at(f, x, 0.1, 1.9), 0.2, 0.2);
    }
    box(b, 'rail/sleeper-wood-old', f, [0, y, -0.12], [1.3, 0.16, 0.13]);
    stripes(y, -0.255);
  } else if (kind === 'steel') {
    for (const x of [-G, G]) {
      b.beam('rail/steel-rust', at(f, x, FOOT, -1.7), at(f, x, y, 0), 0.07, 0.15);
      b.beam('rail/steel-rust', at(f, x, FOOT, 1.3), at(f, x, y, 0), 0.07, 0.15);
      b.beam('rail/steel-rust', at(f, x, FOOT + 0.45, -0.95), at(f, x, FOOT + 0.45, 0.72), 0.07, 0.12);
    }
    box(b, 'structure/steel-red-rusty', f, [0, y, -0.1], [1.25, 0.14, 0.07]);
    stripes(y, -0.175);
    for (const x of [-0.88, 0.88]) lathe(b, 'rail/steel-cast', turn(move(f, x, y, -0.17), 180), [[0.06, 0], [0.06, 0.12], [0.17, 0.13], [0.17, 0.17], [0, 0.17]].map(([r, h]) => [r, h] as [number, number]), 12);
    pipe(b, 'rail/steel-dark', [at(f, 0, y + 0.14, -0.1), at(f, 0, y + 0.5, -0.1)], 0.02, 6);
    box(b, 'signal/lens-red-off', f, [0, y + 0.58, -0.1], [0.09, 0.09, 0.05]);
  } else if (kind === 'concrete') {
    box(b, 'structure/wall-old', f, [0, (y + 0.3) / 2, 0.55], [1.45, (y + 0.3) / 2, 0.55], 'Y');
    for (const x of [-0.88, 0.88]) box(b, 'rail/xing-rubber', f, [x, y, -0.06], [0.2, 0.2, 0.06]);
    stripes(y - 0.45, -0.005, 1.2);
  } else {
    const hill = move(f, 0, 0, 2.2);
    lathe(b, 'ground/dirt', hill, [[3, 0], [2.3, 0.75], [1.3, 1.35], [0.5, 1.6], [0, 1.65]], 12, 0.8);
    pipe(b, 'signal/pole-galvanized', [at(f, 0, 0.3, 0.1), at(f, 0, 2, 0.1)], 0.03, 6);
    plate(b, 'rail/end-of-track', turn(move(f, 0, 1.75, 0.06), 180), [0, 0, 0]);
  }
}

/** Ballastless track: rails on concrete blocks set in a slab. */
export function slabTrack(w: Way, s0: number, s1: number, head = 'rail/head-bright'): void {
  const prof: Prof = [[-1.4, 0], [-1.4, 0.385], [1.4, 0.385], [1.4, 0]];
  sweep(w, 'concrete/road-smooth-cracked', s0, s1, prof, { uv: 'across' });
  cap(w, 'concrete/road-smooth-cracked', s0, prof, -1);
  cap(w, 'concrete/road-smooth-cracked', s1, prof, 1);
  sweep(w, 'rail/bed-stain-light', s0, s1, [[-1.39, 0.389], [1.39, 0.389]], { uv: 'across', layer: 1, c: [0.3, 3.1], step: Math.min(w.c.step, 6) });
  for (const x of [-G, G]) sleepers(w, s0, s1, { mat: 'rail/sleeper-concrete', spacing: 0.65, w: 0.3, ext: () => [x - 0.36, x + 0.36], fasten: 'clip' });
  for (const d of [-G, G]) rail(w, s0, s1, d, { head, side: 'rail/steel-rust' });
}

export interface TramOpts {
  pave: string;
  /** Different paving between the rails. */
  inner?: string;
  w?: number;
  rail?: string;
  /** Rails standing proud of a lawn instead of flush with paving. */
  lawn?: boolean;
}

/** Street-running track: grooved rails flush with the paving. */
export function tram(w: Way, s0: number, s1: number, o: TramOpts): void {
  const hw = (o.w ?? 3.2) / 2;
  const step = Math.min(w.c.step, 4);
  sweep(w, o.pave, s0, s1, [[-hw, 0], [hw, 0]], { uv: 'across', c: [0, hw * 2], step });
  if (o.inner) sweep(w, o.inner, s0, s1, [[-G + 0.09, 0.003], [G - 0.09, 0.003]], { uv: 'across', layer: 1, step });
  if (o.lawn) {
    for (const d of [-G, G]) rail(w, s0, s1, d, { y: -0.125, head: 'rail/head-dull', side: 'rail/steel-rust', caps: false });
    for (const d of [-G, G]) sweep(w, 'concrete/gutter', s0, s1, [[d - 0.2, 0.006], [d + 0.2, 0.006]], { uv: 'across', layer: 1, step });
  } else {
    for (const d of [-G, G]) sweep(w, o.rail ?? 'rail/tram-rail', s0, s1, [[d - 0.09, 0.006], [d + 0.09, 0.006]], { layer: 2, c: [0, 0.18], step });
  }
}

/** Trolley poles either side with a span wire, and a contact wire above each track. */
export function tramWires(w: Way, s0: number, s1: number, lats: number[], at_: number[], x0: number, x1: number, mat = 'signal/pole-green'): void {
  for (const s of at_) {
    const f = poseAt(w, s);
    for (const x of [x0, x1]) {
      lathe(w.b, mat, move(f, x, 0, 0), [[0.16, 0], [0.16, 0.5], [0.11, 0.6], [0.09, 7.6], [0.05, 7.7], [0, 7.75]], 10);
    }
    pipe(w.b, 'furniture/cable', catenary(at(f, x0, 7.3, 0), at(f, x1, 7.3, 0), 0.5, 10), 0.008, 5, false);
    for (const lat of lats) {
      const u = (lat - x0) / (x1 - x0);
      const y = 7.3 - 0.5 * 4 * u * (1 - u);
      pipe(w.b, 'furniture/cable', [at(f, lat, y, 0), at(f, lat, 5.85, 0)], 0.005, 4, false);
    }
  }
  for (const lat of lats) pipe(w.b, 'furniture/cable', cuts(s0, s1, Math.min(2, w.c.step)).map((s) => pt(w, lat, 5.85, s)), 0.009, 5, false);
}

/** Earth bank carrying the formation at height h; returns the way on top. */
export function embankment(w: Way, s0: number, s1: number, h: number, half: number, grass = 'ground/grass-patchy'): Way {
  const prof: Prof = [[-half - 1.8 * h, 0], [-half, h], [half, h], [half + 1.8 * h, 0]];
  sweep(w, grass, s0, s1, [prof[0], prof[1]], { uv: 'across', step: Math.min(w.c.step, 4) });
  sweep(w, 'ground/gravel-dirt', s0, s1, [prof[1], prof[2]], { uv: 'across', step: Math.min(w.c.step, 4) });
  sweep(w, grass, s0, s1, [prof[2], prof[3]], { uv: 'across', step: Math.min(w.c.step, 4) });
  cap(w, 'ground/dirt', s0, prof, -1);
  cap(w, 'ground/dirt', s1, prof, 1);
  return { ...w, f: move(w.f, 0, h, 0) };
}

/** Concrete viaduct deck with a ballast trough at height h on piers; returns the way on top. */
export function viaduct(w: Way, s0: number, s1: number, h: number, half: number, piers: number[], o: { wall?: string; pier?: string } = {}): Way {
  const wall = o.wall ?? 'structure/wall-smooth';
  const shell: Prof = [[-half + 0.9, h - 1.5], [-half, h - 0.4], [-half, h + 0.95], [-half + 0.2, h + 0.95], [-half + 0.2, h + 0.02], [half - 0.2, h + 0.02], [half - 0.2, h + 0.95], [half, h + 0.95], [half, h - 0.4], [half - 0.9, h - 1.5]];
  sweep(w, wall, s0, s1, shell);
  sweep(w, 'structure/deck-underside', s0, s1, [[half - 0.9, h - 1.5], [-half + 0.9, h - 1.5]], { uv: 'across' });
  for (const [s, dir] of [[s0, -1], [s1, 1]] as [number, 1 | -1][]) {
    cap(w, wall, s, [[-half + 0.9, h - 1.5], [-half, h - 0.4], [-half, h + 0.02], [half, h + 0.02], [half, h - 0.4], [half - 0.9, h - 1.5]], dir);
    for (const sx of [-1, 1]) cap(w, wall, s, sx < 0 ? [[-half, h], [-half, h + 0.95], [-half + 0.2, h + 0.95], [-half + 0.2, h]] : [[half - 0.2, h], [half - 0.2, h + 0.95], [half, h + 0.95], [half, h]], dir);
  }
  for (const s of piers) {
    const f = poseAt(w, s);
    box(w.b, o.pier ?? 'structure/pier-formwork', f, [0, (h - 2.2) / 2, 0], [half * 0.42, (h - 2.2) / 2, 0.75], 'Y');
    box(w.b, o.pier ?? 'structure/pier-formwork', f, [0, h - 1.85, 0], [half - 1, 0.35, 0.95]);
  }
  return { ...w, f: move(w.f, 0, h, 0) };
}

/** Steel plate-girder span with an open timber deck between masonry abutments. */
function girderBridge(b: MeshBuilder, st: TrackStyle, steel: string, stone: string, through: boolean): void {
  const h = 5.5;
  const L = 36;
  const a = 7;
  const w0 = way(b, stand([0, 0, -L / 2]));
  const up: Way = { ...w0, f: move(w0.f, 0, h, 0) };
  for (const [s0, s1] of [[0, a], [L - a, L]]) {
    box(b, stone, poseAt(w0, (s0 + s1) / 2), [0, h / 2, 0], [3.4, h / 2, a / 2], 'Y');
    box(b, 'structure/wall-old', poseAt(w0, (s0 + s1) / 2), [0, h + 0.02, 0], [3.5, 0.06, a / 2 + 0.06], 'Y');
    track(up, s0, s1, st);
  }
  const span = L - 2 * a;
  const mid = poseAt(up, L / 2);
  const gx = through ? 2.35 : 1.1;
  const depth = through ? 2.2 : 1.5;
  const gy = through ? TIE - 0.75 : TIE - 0.18 - depth;
  for (const sx of [-1, 1]) {
    box(b, steel, mid, [sx * gx, gy + depth / 2, 0], [0.012, depth / 2, span / 2 + 0.5]);
    for (const y of [gy, gy + depth]) box(b, steel, mid, [sx * gx, y, 0], [0.2, 0.025, span / 2 + 0.5]);
    for (let z = -span / 2; z <= span / 2 + 0.01; z += 1.83) box(b, steel, mid, [sx * gx, gy + depth / 2, z], [0.14, depth / 2, 0.012]);
  }
  if (through) {
    for (let z = -span / 2 + 0.9; z < span / 2; z += 1.83) box(b, steel, mid, [0, TIE - 0.42, z], [gx, 0.2, 0.1]);
    for (const x of [-G, G]) box(b, steel, mid, [x, TIE - 0.2, 0], [0.11, 0.02, span / 2]);
  } else {
    for (let z = -span / 2 + 0.9; z < span / 2; z += 3.66) for (const y of [gy + 0.2, gy + depth - 0.2]) box(b, steel, mid, [0, y, z], [gx, 0.05, 0.05]);
  }
  sleepers(up, a, L - a, { mat: 'rail/sleeper-wood-old', spacing: 0.42, len: through ? 3 : 3.2, fasten: 'plate', rails: () => [-G, G, -G + 0.32, G - 0.32] });
  for (const d of [-G, G]) rail(up, a - 0.01, L - a + 0.01, d, { head: st.head, side: st.side, caps: false });
  for (const d of [-G + 0.32, G - 0.32]) rail(up, a - 2.5, L - a + 2.5, d, { head: 'rail/head-rusty', side: 'rail/steel-orange', thin: () => 0.8 });
  if (!through) {
    // Maintenance walkway on brackets with a pipe railing.
    box(b, 'furniture/grid-galvanized', mid, [2.2, TIE - 0.06, 0], [0.5, 0.02, span / 2]);
    for (let z = -span / 2; z <= span / 2 + 0.01; z += 2.2) {
      pipe(b, STEEL, [at(mid, 2.65, TIE - 0.05, z), at(mid, 2.65, TIE + 1.05, z)], 0.02, 5);
      pipe(b, steel, [at(mid, gx, TIE - 0.3, z), at(mid, 2.7, TIE - 0.1, z)], 0.03, 5);
    }
    for (const y of [0.5, 1.05]) pipe(b, STEEL, [at(mid, 2.65, TIE + y, -span / 2), at(mid, 2.65, TIE + y, span / 2)], 0.018, 5);
  }
}

const S: Record<StyleName, TrackStyle> = STYLES;
const NAMES: Record<StyleName, string> = { wood: '木枕木', 'wood-new': '木枕木・新しい', 'wood-old': '木枕木・古い', concrete: 'PC枕木', 'concrete-stained': 'PC枕木・さび汚れ', steel: '鉄枕木', station: 'PC枕木・油じみ', siding: '側線', weedy: '雑草', disused: '廃線' };

export function addTracks(): void {
  const T = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('track', id, label, fn);
  const L = 30;
  const start = (b: MeshBuilder, len = L): Way => way(b, stand([0, 0, -len / 2]));

  for (const k of Object.keys(S) as StyleName[]) T(`straight-${k}`, `直線 ${NAMES[k]}`, (b) => track(start(b), 0, L, S[k]));
  T('straight-short', '直線 短尺 10m', (b) => track(start(b, 10), 0, 10, S.wood));
  T('straight-third-rail', '直線 第三軌条', (b) => {
    track(start(b), 0, L, S['concrete-stained']);
    thirdRail(start(b), 0, L, 1);
  });
  T('straight-catenary', '直線 架線柱', (b) => {
    const w = start(b);
    track(w, 0, L, S.concrete);
    mast(w, L / 2, 3.1, [0]);
    wires(w, 0, L, 0, [L / 2]);
  });
  T('straight-catenary-wood', '直線 架線柱 木枕木', (b) => {
    const w = start(b);
    track(w, 0, L, S.wood);
    mast(w, L / 2, -3.1, [0], { mat: 'structure/steel-green-rusty' });
    wires(w, 0, L, 0, [L / 2]);
  });
  T('straight-slab', '直線 スラブ軌道', (b) => slabTrack(start(b), 0, L));
  T('straight-slab-third-rail', '直線 スラブ軌道 第三軌条', (b) => {
    slabTrack(start(b), 0, L);
    thirdRail(start(b), 0, L, -1);
  });

  const dbl = [-2, 2];
  for (const k of ['wood', 'concrete', 'concrete-stained', 'station'] as StyleName[]) T(`double-${k}`, `複線 ${NAMES[k]}`, (b) => tracks(start(b), 0, L, dbl, S[k]));
  T('double-mixed', '複線 本線と側線', (b) => tracks(start(b), 0, L, [-2.2, 2.2], [S.concrete, S.siding]));
  T('double-catenary', '複線 架線柱', (b) => {
    const w = start(b);
    tracks(w, 0, L, dbl, S.concrete);
    mast(w, L / 2, -5.1, [-2]);
    mast(w, L / 2, 5.1, [2]);
    for (const d of dbl) wires(w, 0, L, d, [L / 2]);
  });
  T('double-catenary-portal', '複線 門形架線柱', (b) => {
    const w = start(b);
    tracks(w, 0, L, dbl, S['concrete-stained']);
    portal(w, L / 2, -5.2, 5.2, dbl);
    for (const d of dbl) wires(w, 0, L, d, [L / 2]);
  });
  T('double-third-rail', '複線 第三軌条', (b) => {
    const w = start(b);
    tracks(w, 0, L, dbl, S.station);
    thirdRail(sideWay(w, -2), 0, L, -1);
    thirdRail(sideWay(w, 2), 0, L, 1);
  });
  T('double-slab', '複線 スラブ軌道', (b) => {
    for (const d of dbl) slabTrack(sideWay(start(b), d), 0, L);
  });
  T('triple', '3線', (b) => tracks(start(b), 0, L, [-4, 0, 4], [S.concrete, S.concrete, S.wood]));
  T('four-track', '複々線', (b) => tracks(start(b), 0, L, [-6, -2, 2, 6], [S.wood, S.concrete, S.concrete, S.wood]));
  T('four-track-portal', '複々線 門形架線柱', (b) => {
    const w = start(b);
    const lats = [-6, -2, 2, 6];
    tracks(w, 0, L, lats, S['concrete-stained']);
    portal(w, L / 2, -9.2, 9.2, lats);
    for (const d of lats) wires(w, 0, L, d, [L / 2]);
  });
  T('yard-5', 'ヤード 5線', (b) => tracks(start(b), 0, L, [-9, -4.5, 0, 4.5, 9], [S.siding, S.weedy, S.siding, S.wood, S.siding], { pad: 2.2 }));

  for (const [R, k] of [[150, 'wood'], [300, 'concrete'], [600, 'concrete']] as [number, StyleName][])
    for (const [side, jp, m] of [['l', '左', 1], ['r', '右', -1]] as [string, string, number][])
      T(`curve-${R}-${side}`, `曲線 半径${R}m ${jp} ${NAMES[k]}`, (b) => track(way(b, stand([0, 0, -L / 2]), bend(R * m)), 0, L, S[k]));
  T('curve-80-siding', '急曲線 半径80m 側線 脱線防止レール', (b) => {
    const w = way(b, stand([0, 0, -L / 2]), bend(80));
    track(w, 0, L, S.siding);
    rail(w, 0, L, G - 0.1, { head: 'rail/head-rusty', side: 'rail/steel-orange', thin: () => 0.6 });
  });
  T('curve-200-catenary', '曲線 半径200m 架線柱', (b) => {
    const w = way(b, stand([0, 0, -L / 2]), bend(200));
    track(w, 0, L, S.concrete);
    for (const s of [5, 25]) mast(w, s, -3.1, [0]);
    wires(w, 0, L, 0, [5, 25]);
  });
  for (const [side, jp, m] of [['l', '左', 1], ['r', '右', -1]] as [string, string, number][])
    T(`double-curve-300-${side}`, `複線の曲線 半径300m ${jp}`, (b) => tracks(way(b, stand([0, 0, -L / 2]), bend(300 * m)), 0, L, dbl, S.concrete));
  T('double-curve-catenary', '複線の曲線 架線柱', (b) => {
    const w = way(b, stand([0, 0, -L / 2]), bend(250));
    tracks(w, 0, L, dbl, S['concrete-stained']);
    for (const s of [5, 25]) {
      mast(w, s, -5.1, [-2]);
      mast(w, s, 5.1, [2]);
    }
    for (const d of dbl) wires(w, 0, L, d, [5, 25]);
  });
  T('s-curve', 'S字 4mずれ', (b) => track(way(b, stand([-2, 0, -20]), shift(40, 4)), 0, 40, S.wood));
  T('s-curve-double', '複線のS字', (b) => tracks(way(b, stand([-2, 0, -20]), shift(40, 4)), 0, 40, dbl, S.concrete));
  T('spread', '複線の間隔が広がる(島式ホーム手前)', (b) => {
    const w = start(b, 40);
    bed(w, 0, 40, { mat: S.concrete.ballast, l: 3.75, r: (s) => 3.75 + 5 * Math.min(1, Math.max(0, s / 40)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, s / 40))), step: 1.5 });
    for (const [x, c] of [[-2, undefined], [2, shift(40, 5)]] as [number, ReturnType<typeof shift> | undefined][]) {
      const side: Way = { b, f: move(w.f, x, 0, 0), c: c ?? w.c };
      stain(side, 0, 40, S.concrete.stain);
      rails(side, 0, 40, S.concrete);
    }
  });

  for (const [side, jp, dir] of [['l', '左', 1], ['r', '右', -1]] as [string, string, 1 | -1][]) {
    for (const k of ['wood', 'concrete', 'siding'] as StyleName[])
      for (const lever of ['machine', 'stand'] as const) {
        if (k === 'siding' && lever === 'machine') continue;
        T(`turnout-${side}-${k}-${lever}`, `分岐器 ${jp} ${NAMES[k]} ${lever === 'machine' ? '電気転てつ機' : '手動転換器'}`, (b) => turnout(b, stand([-dir * 2, 0, -19]), { dir, len: 38, style: S[k], lever, R: k === 'siding' ? 110 : 150 }));
      }
    T(`crossover-${side}`, `渡り線 ${jp}`, (b) => crossover(b, stand([-dir * 2, 0, -23]), dir, dir > 0 ? S.concrete : S['concrete-stained']));
    T(`crossover-${side}-wood`, `渡り線 ${jp} 木枕木`, (b) => crossover(b, stand([-dir * 2, 0, -23]), dir, dir > 0 ? S.wood : S['wood-old'], 'stand'));
    T(`siding-end-${side}`, `側線の分岐と車止め ${jp}`, (b) => {
      const f = stand([-dir * 2, 0, -24]);
      const o = { dir, len: 48, style: S.wood, lever: 'stand' as const, R: 110, divEnd: 3 + Math.sqrt(2 * 110 * 4) };
      turnout(b, f, o);
      const w = way(b, move(f, dir * 4, 0, 0));
      bed(w, o.divEnd - 0.01, 48, { mat: S.siding.ballast });
      stain(w, o.divEnd, 44, S.siding.stain);
      rails(w, o.divEnd, 44, S.siding);
      bufferStop(w, 44, dir > 0 ? 'timber' : 'steel');
    });
  }
  T('wye', '両開き分岐器', (b) => {
    const st = S.wood;
    const w = way(b, stand([0, 0, -18]));
    const off = (s: number): number => branchOffset({ R: 220, toe: 3 }, s);
    bed(w, 0, 36, { mat: st.ballast, l: (s) => off(s) + 1.75, r: (s) => off(s) + 1.75, step: 1.5 });
    const split = 3 + Math.sqrt(2 * 220 * 1.45);
    sleepers(w, 0, split, { mat: st.tie, ext: (s) => [-off(s) - 1.3, off(s) + 1.3], rails: (s) => (off(s) < 0.1 ? [-G, G] : [-G - off(s), G - off(s), -G + off(s), G + off(s)]) });
    for (const m of [-1, 1]) {
      const c = shiftBy((s) => m * off(s), (s) => (m * Math.max(0, s - 3)) / 220);
      const side: Way = { ...w, c };
      sleepers(side, split, 36, { mat: st.tie });
      stain(side, 6, 36, st.stain);
      rail(w, 0, 36, 0, { head: st.head, side: st.side, lat: (s) => m * (G + off(s)) });
      const width = (s: number): number => Math.min(0.07, Math.max(0.012, 2 * off(s)));
      const open = (s: number): number => (m > 0 ? 0.11 * Math.max(0, 1 - (s - 3) / 5.5) : 0);
      rail(w, 3, 36, 0, { head: st.head, side: st.side, lat: (s) => m * (off(s) - G + 0.035 - width(s) / 2 + open(s)) * 1, thin: (s) => width(s) / 0.07, step: 0.8 });
    }
    const frog = 3 + Math.sqrt(2 * 220 * G);
    box(b, 'rail/steel-cast', poseAt(w, frog + 0.3), [0, FOOT + 0.055, 0], [0.2, 0.055, 1.7], 'Y');
    for (const dz of [0, 1.3]) box(b, 'rail/steel-dark', poseAt(w, 3.3 + dz), [0, TIE + 0.05, 0], [G - 0.04, 0.012, 0.03]);
  });

  for (const k of ['timber', 'steel', 'concrete', 'mound'] as BufferKind[])
    T(`end-${k}`, `線路終端 ${{ timber: '木の車止め', steel: 'レール組みの車止め', concrete: 'コンクリートの車止め', mound: '盛土と終端標' }[k]}`, (b) => {
      const w = way(b, stand([0, 0, -9]));
      const st = k === 'mound' ? S.weedy : k === 'timber' ? S.siding : S.wood;
      bed(w, 0, 16, { mat: st.ballast });
      stain(w, 0, 12, st.stain);
      rails(w, 0, 12, st);
      bufferStop(w, 12, k);
    });

  const TRAM: [string, string, TramOpts][] = [
    ['asphalt', 'アスファルト', { pave: 'asphalt/plain-used-patched' }],
    ['asphalt-worn', 'アスファルト・古い', { pave: 'asphalt/plain-worn-cracked', rail: 'rail/tram-rail-rusty' }],
    ['concrete', 'コンクリート', { pave: 'concrete/road-tined-stained' }],
    ['setts', '石畳', { pave: 'paving/setts-granite' }],
    ['brick', 'レンガ敷き', { pave: 'paving/herringbone-charcoal', inner: 'paving/running-red' }],
    ['grass', '芝生軌道', { pave: 'ground/grass-mown', lawn: true }],
  ];
  for (const [id, jp, o] of TRAM) {
    T(`tram-${id}`, `路面軌道 ${jp}`, (b) => tram(start(b), 0, L, o));
    T(`tram-${id}-double`, `路面軌道 複線 ${jp}`, (b) => {
      for (const d of [-1.6, 1.6]) tram(sideWay(start(b), d), 0, L, o);
    });
  }
  T('tram-double-wires', '路面軌道 複線 架線', (b) => {
    const w = start(b);
    for (const d of [-1.6, 1.6]) tram(sideWay(w, d), 0, L, { pave: 'asphalt/plain-used-sealed' });
    tramWires(w, 0, L, [-1.6, 1.6], [3, 27], -4.2, 4.2);
  });
  T('tram-grass-wires', '芝生軌道 複線 架線', (b) => {
    const w = start(b);
    for (const d of [-1.6, 1.6]) tram(sideWay(w, d), 0, L, { pave: 'ground/grass-lush', lawn: true });
    tramWires(w, 0, L, [-1.6, 1.6], [15], -4.2, 4.2, 'signal/pole-black');
  });
  T('tram-curve', '路面軌道 曲線 半径25m', (b) => tram(way(b, stand([-4, 0, -12]), bend(25)), 0, 26, { pave: 'paving/setts-granite' }));
  T('tram-curve-double', '路面軌道 複線の曲線 半径30m', (b) => {
    const w = way(b, stand([-4, 0, -12]), bend(30));
    for (const d of [-1.6, 1.6]) tram(sideWay(w, d), 0, 26, { pave: 'asphalt/plain-used-patched' });
  });

  T('embankment', '築堤 単線', (b) => track(embankment(start(b), 0, L, 3, 3.2), 0, L, S.wood));
  T('embankment-double', '築堤 複線', (b) => tracks(embankment(start(b), 0, L, 4, 5.4), 0, L, dbl, S.concrete));
  T('embankment-dry', '築堤 枯れ草 廃線', (b) => track(embankment(start(b), 0, L, 2.5, 3.2, 'ground/grass-dry'), 0, L, S.disused));
  T('viaduct', '高架橋 単線', (b) => {
    const up = viaduct(start(b), 0, L, 7, 2.7, [7.5, 22.5]);
    bed(up, 0, L, { mat: S.concrete.ballast, l: 2.49, r: 2.49, slope: 0, caps: true });
    stain(up, 0, L, S.concrete.stain);
    rails(up, 0, L, S.concrete);
  });
  T('viaduct-double', '高架橋 複線', (b) => {
    const up = viaduct(start(b), 0, L, 7, 4.8, [7.5, 22.5]);
    tracks(up, 0, L, dbl, S['concrete-stained'], { bed: false });
    bed(up, 0, L, { mat: S.concrete.ballast, l: 4.59, r: 4.59, slope: 0 });
  });
  T('viaduct-double-catenary', '高架橋 複線 架線柱', (b) => {
    const w = start(b);
    const up = viaduct(w, 0, L, 7, 4.8, [7.5, 22.5], { wall: 'structure/wall-old' });
    tracks(up, 0, L, dbl, S.concrete, { bed: false });
    bed(up, 0, L, { mat: S.concrete.ballast, l: 4.59, r: 4.59, slope: 0 });
    portal(up, L / 2, -4.7, 4.7, dbl);
    for (const d of dbl) wires(up, 0, L, d, [L / 2]);
  });
  T('viaduct-slab', '高架橋 複線 スラブ軌道', (b) => {
    const up = viaduct(start(b), 0, L, 8, 4.8, [7.5, 22.5]);
    for (const d of dbl) slabTrack(sideWay(up, d), 0, L);
  });
  T('bridge-girder', '鉄橋 上路プレートガーダー', (b) => girderBridge(b, S.wood, 'structure/steel-green-rusty', 'structure/stone-ashlar', false));
  T('bridge-girder-through', '鉄橋 下路プレートガーダー', (b) => girderBridge(b, S['wood-old'], 'structure/steel-red-rusty', 'structure/stone-dark', true));
  T('bridge-girder-grey', '鉄橋 上路プレートガーダー 灰', (b) => girderBridge(b, S.concrete, 'structure/steel-grey-rusty', 'structure/wall-old', false));
}

const shiftBy = (x: (s: number) => number, slope: (s: number) => number) => {
  const fn = (s: number): { p: [number, number]; t: [number, number] } => {
    const k = slope(s);
    const h = Math.hypot(k, 1);
    return { p: [x(s), s], t: [k / h, 1 / h] };
  };
  return Object.assign(fn, { step: 1.2 });
};

/** Two turnouts facing each other joining parallel tracks 4 m apart. */
export function crossover(b: MeshBuilder, f: Pose, dir: 1 | -1, st: TrackStyle, lever: 'machine' | 'stand' = 'machine'): void {
  const R = 100;
  const toe = 3;
  const mid = toe + Math.sqrt(2 * R * 2);
  const meet = toe + Math.sqrt(2 * R * 1.4);
  const L = 2 * mid;
  const base = way(b, f);
  bed(base, 0, L, { mat: st.ballast, l: dir > 0 ? 1.75 : 5.75, r: dir > 0 ? 5.75 : 1.75 });
  const o = {
    dir, R, toe, len: L, divEnd: mid, style: st, lever, bed: false, plainTies: false,
    ties: (s: number, own: [number, number]): [number, number] | null => (s > mid ? null : s > meet ? [own[0], 5.3] : own),
    extraRails: () => [4 - G, 4 + G],
  };
  turnout(b, f, o);
  turnout(b, turn(move(f, dir * 4, 0, L), 180), o);
  const tie = { mat: st.tie, spacing: st.spacing, fasten: st.fasten, len: st.tieLen };
  sleepers(base, mid, L, { ...tie, ext: (s) => (L - s > meet ? null : [-1.3, 1.3]) });
  sleepers(way(b, move(f, dir * 4, 0, 0)), 0, mid, { ...tie, ext: (s) => (s > meet ? null : [-1.3, 1.3]) });
}
