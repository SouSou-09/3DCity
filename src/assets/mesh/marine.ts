import { MeshBuilder, V3 } from './builder';
import { S, pedRail, spaced, tubeRail } from './boundaries';
import { bench, postTop } from './furniture';
import { Pose, at, box, face, lathe, move, pipe, plate, turn } from './kit';

// Waterfront models stand with the water surface at y = 0 and the sea bed at y = -2.
const BLACK = 'structure/steel-black';
const CONC = 'structure/wall-smooth';
const WALK = 'concrete/walk-plain';
const rad = (deg: number): number => (deg * Math.PI) / 180;
export const hash = (i: number, seed: number): number => {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Closed cylinder (or cone frustum) standing on c. */
export function cyl(b: MeshBuilder, mat: string, f: Pose, c: V3, r: number, h: number, sides = 12, r1 = r): void {
  lathe(b, mat, move(f, c[0], c[1], c[2]), [[0, 0], [r, 0], [r1, h], [0, h]], sides);
}
/** Sphere (or the band of it between two latitudes) centred on c; sy squashes it. */
export function ball(b: MeshBuilder, mat: string, f: Pose, c: V3, r: number, sides = 10, lo = -90, hi = 90, sy = 1): void {
  const n = Math.max(2, Math.round((hi - lo) / 22.5));
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(lo + ((hi - lo) * i) / n);
    prof.push([Math.max(0, Math.cos(a)) * r, Math.sin(a) * r * sy]);
  }
  lathe(b, mat, move(f, c[0], c[1], c[2]), prof, sides);
}
/** Ring of round section lying flat around the pose's up axis. */
export function torus(b: MeshBuilder, mat: string, f: Pose, c: V3, R: number, r: number, sides = 14, n = 8): void {
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(-90 + (360 * i) / n);
    prof.push([R + Math.cos(a) * r, Math.sin(a) * r]);
  }
  lathe(b, mat, move(f, c[0], c[1], c[2]), prof, sides);
}
/** Faceted rock: a sphere with every vertex pushed in or out. */
export function boulder(b: MeshBuilder, tex: string, f: Pose, c: V3, r: V3, seed: number, n = 5): void {
  const m = n * 2;
  const P = (i: number, j: number): V3 => {
    const jj = j % m;
    const [phi, th] = [(i / n - 0.5) * Math.PI, (jj / m) * Math.PI * 2];
    const k = i === 0 || i === n ? 0.85 : 0.7 + 0.5 * hash(i * 17 + jj, seed);
    return at(f, c[0] + Math.cos(phi) * Math.cos(th) * r[0] * k, c[1] + Math.sin(phi) * r[1] * k, c[2] + Math.cos(phi) * Math.sin(th) * r[2] * k);
  };
  const [ru, rv] = [(r[0] + r[2]) * Math.PI, r[1] * Math.PI];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const uv: [number, number][] = [[(j / m) * ru, (i / n) * rv], [(j / m) * ru, ((i + 1) / n) * rv], [((j + 1) / m) * ru, ((i + 1) / n) * rv], [((j + 1) / m) * ru, (i / n) * rv]];
      if (i === 0) b.tri(tex, P(i, j), P(i + 1, j), P(i + 1, j + 1), [uv[0], uv[1], uv[2]]);
      else if (i === n - 1) b.tri(tex, P(i, j), P(i + 1, j), P(i, j + 1), [uv[0], uv[1], uv[3]]);
      else b.quad(tex, P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), uv);
    }
  }
}
/** Scatter of boulders inside a rectangle. */
export function rocks(b: MeshBuilder, tex: string, f: Pose, x0: number, x1: number, z0: number, z1: number, count: number, size: number, seed: number, y = 0): void {
  for (let i = 0; i < count; i++) {
    const s = size * (0.55 + hash(i * 3, seed) * 0.9);
    boulder(b, tex, f, [x0 + (x1 - x0) * hash(i * 3 + 1, seed), y + s * 0.25, z0 + (z1 - z0) * hash(i * 3 + 2, seed)], [s, s * 0.7, s * (0.7 + hash(i * 5, seed) * 0.5)], seed + i);
  }
}

export interface MoundOpts {
  step?: number;
  jit?: number;
  seed?: number;
  /** Length over which the far end (and the near end, unless taper0 is given) closes down to a rounded head. */
  taper?: number;
  taper0?: number;
}
/**
 * Mound of dumped rock along +x. The (z, y) profile is listed from the +z toe over the crest to the -z toe;
 * every vertex is jittered so that the surface reads as separate stones.
 */
export function mound(b: MeshBuilder, tex: string, f: Pose, len: number, prof: [number, number][], o: MoundOpts = {}): void {
  const pts: [number, number][] = [prof[0]];
  for (let i = 1; i < prof.length; i++) {
    const [p, q] = [prof[i], prof[i - 1]];
    const n = Math.max(1, Math.round(Math.hypot(p[0] - q[0], p[1] - q[1]) / 1.1));
    for (let k = 1; k <= n; k++) pts.push([q[0] + ((p[0] - q[0]) * k) / n, q[1] + ((p[1] - q[1]) * k) / n]);
  }
  const base = Math.min(...prof.map((p) => p[1]));
  const xs = spaced(len, o.step ?? 1.2);
  const [jit, seed] = [o.jit ?? 0.28, o.seed ?? 1];
  const d: number[] = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const [t0, t1] = [o.taper0 ?? 0, o.taper ?? 0];
  const V = (i: number, k: number): V3 => {
    const s = xs[i];
    let e = 1;
    if (t0 > 0) e = Math.min(e, s / t0);
    if (t1 > 0) e = Math.min(e, (len - s) / t1);
    e = Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e)));
    const edge = k === 0 || k === pts.length - 1;
    const j = (n: number): number => (e > 0 ? (hash(i * 53 + k * 7 + n, seed) - 0.5) * 2 * jit : 0);
    return at(f, s + j(1), base + (pts[k][1] - base) * e + (edge ? 0 : j(2) * 0.7), pts[k][0] * e + j(3));
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let k = 0; k + 1 < pts.length; k++) {
      b.quad(tex, V(i, k), V(i + 1, k), V(i + 1, k + 1), V(i, k + 1), [[xs[i], d[k]], [xs[i + 1], d[k]], [xs[i + 1], d[k + 1]], [xs[i], d[k + 1]]]);
    }
  }
}
/** Concrete tetrapod armour unit. */
export function tetrapod(b: MeshBuilder, mat: string, f: Pose, c: V3, size: number, seed: number): void {
  const g = turn(move(f, c[0], c[1], c[2]), hash(1, seed) * 360);
  const k = hash(2, seed) * 0.5;
  const dirs: V3[] = [[k, 1, 0], [0.943, -0.333 + k, 0], [-0.471, -0.333, 0.816], [-0.471, -0.333, -0.816]];
  for (const d of dirs) b.tube(mat, g.o, at(g, d[0] * size, d[1] * size, d[2] * size), size * 0.3, 7, size * 0.2, true);
}

/** Pose on the deck at (x, z) whose x axis points towards (x1, z1), and the distance between them. */
export function aim(f: Pose, y: number, x0: number, z0: number, x1: number, z1: number): [Pose, number] {
  return [turn(move(f, x0, y, z0), (Math.atan2(-(z1 - z0), x1 - x0) * 180) / Math.PI), Math.hypot(x1 - x0, z1 - z0)];
}
export type RailKind = 'timber' | 'pipe' | 'cable' | 'iron' | 'white' | 'none';
/** Timber post-and-rail guard. */
export function timberRail(b: MeshBuilder, f: Pose, len: number, mat: string, o: { h?: number; gap?: number; mids?: number } = {}): void {
  const h = o.h ?? 1.05;
  const mids = o.mids ?? 2;
  for (const x of spaced(len, o.gap ?? 1.8)) box(b, mat, f, [x, h / 2 - 0.12, 0], [0.05, h / 2 + 0.12, 0.05]);
  box(b, mat, f, [len / 2, h + 0.025, 0], [len / 2 + 0.08, 0.025, 0.09]);
  for (let i = 1; i <= mids; i++) box(b, mat, f, [len / 2, (h * i) / (mids + 1), 0.07], [len / 2, 0.045, 0.02]);
}
/** Guard rail of the given kind from (x0, z0) to (x1, z1) on a deck at height y. */
export function guard(b: MeshBuilder, f: Pose, kind: RailKind, y: number, x0: number, z0: number, x1: number, z1: number, mat?: string): void {
  if (kind === 'none') return;
  const [g, len] = aim(f, y, x0, z0, x1, z1);
  if (kind === 'timber') timberRail(b, g, len, mat ?? 'signal/pole-wood-grey');
  else if (kind === 'pipe') tubeRail(b, g, len, mat ?? 'trim/paint-galvanized', [0.55, 1.05], { r: 0.03 });
  else if (kind === 'cable') pedRail(b, g, len, 'trim/rail-cable', mat ?? 'trim/paint-aluminium');
  else if (kind === 'white') pedRail(b, g, len, 'trim/rail-white', mat ?? 'trim/paint-white');
  else pedRail(b, g, len, 'trim/rail-black', mat ?? BLACK);
}
/** Ladder facing +z from y0 up to y1 (side rails rise a little higher as grab handles). */
export function ladder(b: MeshBuilder, f: Pose, c: V3, y0: number, y1: number, mat = 'trim/paint-galvanized', w = 0.42): void {
  for (const sx of [-1, 1]) b.tube(mat, at(f, c[0] + (sx * w) / 2, y0, c[2]), at(f, c[0] + (sx * w) / 2, y1 + 0.9, c[2]), 0.022, 6, 0.022, true);
  for (let y = y0 + 0.15; y < y1 + 0.05; y += 0.3) b.tube(mat, at(f, c[0] - w / 2, y, c[2]), at(f, c[0] + w / 2, y, c[2]), 0.014, 5);
}
/** Mooring cleat with its horns along x. */
export function cleat(b: MeshBuilder, f: Pose, c: V3, size = 0.3, mat = 'trim/paint-galvanized'): void {
  box(b, mat, f, [c[0], c[1] + size * 0.04, c[2]], [size * 0.42, size * 0.04, size * 0.14], 'Y');
  for (const sx of [-1, 1]) box(b, mat, f, [c[0] + sx * size * 0.18, c[1] + size * 0.16, c[2]], [size * 0.05, size * 0.1, size * 0.07], 'Y');
  pipe(b, mat, [at(f, c[0] - size * 0.5, c[1] + size * 0.24, c[2]), at(f, c[0] - size * 0.2, c[1] + size * 0.3, c[2]), at(f, c[0] + size * 0.2, c[1] + size * 0.3, c[2]), at(f, c[0] + size * 0.5, c[1] + size * 0.24, c[2])], (q) => size * (0.05 + 0.05 * Math.sin(q * Math.PI)), 6);
}
/** Mooring bollard standing on c. */
export function bollard(b: MeshBuilder, f: Pose, c: V3, kind: 'single' | 'tee' | 'double' | 'horn', mat = BLACK, s = 1): void {
  const g = move(f, c[0], c[1], c[2]);
  box(b, mat, g, [0, 0.02 * s, 0], [(kind === 'double' ? 0.55 : 0.32) * s, 0.02 * s, 0.32 * s], 'Y');
  const post = (x: number, h: number, lean = 0): void =>
    lathe(b, mat, move(g, x, 0.04 * s, 0), [[0.2 * s, 0], [0.15 * s, 0.06 * s], [0.14 * s, h * 0.72], [0.22 * s, h * 0.8 + lean], [0.22 * s, h * 0.93], [0.12 * s, h], [0, h]], 12);
  if (kind === 'single') post(0, 0.55 * s);
  if (kind === 'horn') {
    post(0, 0.45 * s);
    pipe(b, mat, [at(g, -0.38 * s, 0.5 * s, 0), at(g, -0.15 * s, 0.4 * s, 0), at(g, 0.15 * s, 0.4 * s, 0), at(g, 0.38 * s, 0.5 * s, 0)], 0.075 * s, 8);
  }
  if (kind === 'tee') {
    lathe(b, mat, move(g, 0, 0.04 * s, 0), [[0.2 * s, 0], [0.13 * s, 0.08 * s], [0.13 * s, 0.42 * s]], 12);
    b.tube(mat, at(g, -0.36 * s, 0.5 * s, 0), at(g, 0.36 * s, 0.5 * s, 0), 0.1 * s, 10, 0.1 * s, true);
  }
  if (kind === 'double') {
    for (const sx of [-1, 1]) post(sx * 0.3 * s, 0.5 * s);
    b.tube(mat, at(g, -0.5 * s, 0.3 * s, 0), at(g, 0.5 * s, 0.3 * s, 0), 0.05 * s, 8, 0.05 * s, true);
  }
}

export interface PierOpts {
  w?: number;
  deckY?: number;
  deck?: string;
  timber?: string;
  pile?: string;
  pr?: number;
  bay?: number;
  rail?: RailKind;
  railMat?: string;
  /** Spacing of lamp posts, alternating sides. */
  lamps?: number;
  lampTex?: string;
  lampTop?: 'globe' | 'acorn' | 'lantern' | 'disc';
  benches?: number;
  brace?: boolean;
  /** Concrete trestle: round piles, cap beams and a slab with kerbs. */
  conc?: boolean;
  /** Head platform at the far end: [length, width]. */
  head?: [number, number];
  /** Taller fender piles along both sides. */
  fenders?: boolean;
  ladder?: boolean;
  cleats?: boolean;
  signs?: string[];
  /** Leaves out deck boards and leans piles. */
  derelict?: boolean;
}
/** Deck rectangle from x0 to x1 with its piles, cap beams and stringers. */
export function trestle(b: MeshBuilder, f: Pose, x0: number, x1: number, w: number, o: PierOpts = {}): void {
  const D = o.deckY ?? 2.2;
  const pile = o.pile ?? S(o.conc ? 'pile-concrete' : 'pile-wood');
  const pr = o.pr ?? (o.conc ? 0.25 : 0.15);
  const beam = o.timber ?? (o.conc ? CONC : 'signal/pole-wood');
  const [capH, strH, deckT] = o.conc ? [0.5, 0, 0.3] : [0.3, 0.2, 0.07];
  const capTop = D - deckT - strH;
  const zs = w > 5.5 ? [-(w / 2 - 0.4), 0, w / 2 - 0.4] : [-(w / 2 - 0.4), w / 2 - 0.4];
  const [cx, hx] = [(x0 + x1) / 2, (x1 - x0) / 2];
  spaced(x1 - x0 - 0.6, o.bay ?? 3).forEach((s, i) => {
    const x = x0 + 0.3 + s;
    zs.forEach((z, k) => {
      const lean = o.derelict ? (hash(i * 7 + k, 5) - 0.5) * 0.5 : 0;
      lathe(b, pile, { ...move(f, x + lean, -2, z), y: at({ ...f, o: [0, 0, 0] }, -lean / 4.5, 1, 0) }, [[pr, 0], [pr, capTop - capH + 2]], 8);
    });
    box(b, beam, f, [x, capTop - capH / 2, 0], [o.conc ? 0.3 : 0.15, capH / 2, w / 2 - 0.05]);
    if (o.brace && !o.conc && zs.length === 2) {
      b.beam(beam, at(f, x + 0.17, 0.4, zs[0]), at(f, x + 0.17, capTop - capH - 0.1, zs[1]), 0.05, 0.18);
      b.beam(beam, at(f, x - 0.17, 0.4, zs[1]), at(f, x - 0.17, capTop - capH - 0.1, zs[0]), 0.05, 0.18);
    }
  });
  if (strH > 0) for (const z of spaced(w - 0.3, 1.1)) box(b, beam, f, [cx, capTop + strH / 2, z - w / 2 + 0.15], [hx, strH / 2, 0.05]);
  const deck = o.deck ?? (o.conc ? WALK : S('deck-grey'));
  if (o.derelict) {
    for (const s of spaced(x1 - x0 - 0.3, 0.3)) if (hash(Math.round(s * 10), 9) > 0.22) box(b, deck, f, [x0 + 0.15 + s, D - deckT / 2, 0], [0.14, deckT / 2, w / 2]);
  } else box(b, deck, f, [cx, D - deckT / 2, 0], [hx, deckT / 2, w / 2]);
  if (o.conc) for (const sz of [-1, 1]) box(b, WALK, f, [cx, D + 0.09, sz * (w / 2 - 0.1)], [hx, 0.09, 0.1], 'Y');
}
/** Pier running out along +x from x = 0, centred on z = 0. */
export function pier(b: MeshBuilder, f: Pose, len: number, o: PierOpts = {}): void {
  const [w, D] = [o.w ?? 3, o.deckY ?? 2.2];
  const rail = o.rail ?? 'timber';
  const e = w / 2 - (o.conc ? 0.1 : 0.07);
  trestle(b, f, 0, len, w, o);
  const G = (x0: number, z0: number, x1: number, z1: number): void => guard(b, f, rail, D + (o.conc ? 0.18 : 0), x0, z0, x1, z1, o.railMat);
  if (o.head) {
    const [hl, hw] = o.head;
    const g = move(f, len, 0, 0);
    trestle(b, turn(move(g, hl / 2, 0, hw / 2), 90), 0, hw, hl, o);
    const he = hw / 2 - 0.07;
    G(0, e, len, e);
    G(len, e, len, he);
    G(len, he, len + hl - 0.07, he);
    G(len + hl - 0.07, he, len + hl - 0.07, -he);
    G(len + hl - 0.07, -he, len, -he);
    G(len, -he, len, -e);
    G(len, -e, 0, -e);
  } else {
    G(0, e, len - 0.07, e);
    G(len - 0.07, e, len - 0.07, -e);
    G(len - 0.07, -e, 0, -e);
  }
  if (o.lamps) {
    spaced(len - 3, o.lamps).forEach((s, i) => postTop(b, move(f, 1.5 + s, D, (i % 2 ? -1 : 1) * (e - 0.22)), { h: 3.2, tex: o.lampTex ?? 'signal/pole-black', top: o.lampTop ?? 'lantern' }));
  }
  for (let i = 0; i < (o.benches ?? 0); i++) {
    const x = (len * (i + 1)) / ((o.benches ?? 0) + 1) + 1.2;
    bench(b, turn(move(f, x, D, (i % 2 ? 1 : -1) * (e - 0.45)), i % 2 ? 180 : 0), { kind: 'park', slats: 'weathered' });
  }
  if (o.fenders) {
    for (const s of spaced(len - 2, 6)) for (const sz of [-1, 1]) {
      lathe(b, o.pile ?? S('pile-wood'), move(f, 1 + s, -2, sz * (w / 2 + 0.2)), [[0.17, 0], [0.17, D + 2.9], [0, D + 2.95]], 8);
      lathe(b, 'trim/paint-white', move(f, 1 + s, D + 0.75, sz * (w / 2 + 0.2)), [[0.185, 0], [0.185, 0.2], [0, 0.32]], 8);
    }
  }
  if (o.ladder) ladder(b, turn(move(f, len * 0.7, 0, -w / 2 - 0.06), 180), [0, 0, 0], -0.9, D);
  if (o.cleats) for (const s of spaced(len - 3, 4.5)) for (const sz of [-1, 1]) cleat(b, f, [1.5 + s, D, sz * (e - 0.12)], 0.32);
  (o.signs ?? []).forEach((t, i) => {
    const g = move(f, 0.25, D, (i % 2 ? -1 : 1) * (e - 0.2) * (rail === 'none' ? 1 : 0.6));
    b.tube('trim/paint-galvanized', at(g, 0, 0, 0), at(g, 0, 2.1, 0), 0.03, 6, 0.03, true);
    plate(b, t, turn(g, -90), [0, 1.75, 0.035]);
  });
}

export interface DockOpts {
  deck?: string;
  /** Guide piles: material and the side(s) they stand on. */
  pile?: string;
  pileSide?: 1 | -1 | 0;
  cleats?: boolean;
  w?: number;
}
/** Floating dock along +x, riding 0.45 m above the water, held by guide piles. */
export function floatDock(b: MeshBuilder, f: Pose, len: number, o: DockOpts = {}): void {
  const w = o.w ?? 2.4;
  box(b, S('float-concrete'), f, [len / 2, 0.02, 0], [len / 2, 0.4, w / 2], 'yY');
  box(b, o.deck ?? S('deck-composite'), f, [len / 2, 0.435, 0], [len / 2, 0.015, w / 2 + 0.02], 'Y');
  for (const sz of [-1, 1]) box(b, 'furniture/tire', f, [len / 2, 0.33, sz * (w / 2 + 0.02)], [len / 2, 0.05, 0.025], 'Y');
  if (o.pileSide !== 0) {
    const mat = o.pile ?? S('pile-steel');
    for (const s of spaced(len - 1.2, 9)) {
      const g = move(f, 0.6 + s, -2, (o.pileSide ?? 1) * (w / 2 + 0.24));
      lathe(b, mat, g, [[0.16, 0], [0.16, 5.2]], 8);
      lathe(b, 'trim/paint-white', move(g, 0, 5.2, 0), [[0.17, 0], [0.17, 0.05], [0, 0.4]], 8);
      for (const y of [2.3, 2.42]) torus(b, 'trim/paint-galvanized', g, [0, y, 0], 0.22, 0.03, 10, 4);
    }
  }
  if (o.cleats !== false) for (const s of spaced(len - 1.6, 3.2)) for (const sz of [-1, 1]) cleat(b, f, [0.8 + s, 0.45, sz * (w / 2 - 0.14)], 0.26);
}
/** Aluminium truss gangway from a quay edge at height `drop` down to a float; it runs along +x. */
export function gangway(b: MeshBuilder, f: Pose, len: number, drop: number, w = 1.1): void {
  const mat = 'trim/paint-aluminium';
  const P = (x: number, y: number, z: number): V3 => at(f, x, drop - (drop - 0.5) * (x / len) + y, z);
  b.quadUp('trim/grate-black', P(0, 0, -w / 2), P(len, 0, -w / 2), P(len, 0, w / 2), P(0, 0, w / 2));
  for (const sz of [-1, 1]) {
    const z = (sz * w) / 2;
    b.tube(mat, P(0, 0, z), P(len, 0, z), 0.035, 6, 0.035, true);
    const xs = spaced(len, 1.2);
    pipe(b, mat, [P(0, 0, z), P(0.25, 1.05, z), P(len - 0.25, 1.05, z), P(len, 0, z)], 0.03, 6);
    b.tube(mat, P(0.2, 0.55, z), P(len - 0.2, 0.55, z), 0.018, 5);
    for (let i = 1; i + 1 < xs.length; i++) {
      b.tube(mat, P(xs[i], 0, z), P(xs[i], 1.05, z), 0.02, 5);
      if (i > 1) b.tube(mat, P(xs[i - 1], 0, z), P(xs[i], 1.05, z), 0.014, 5);
    }
  }
  for (const sz of [-1, 1]) lathe(b, 'furniture/tire', turn({ ...move(f, len - 0.1, 0.56, (sz * (w + 0.1)) / 2), y: f.z, z: f.y }, 0), [[0, -0.03], [0.1, -0.03], [0.1, 0.03], [0, 0.03]], 10);
}

export interface LightOpts {
  h: number;
  r0: number;
  r1: number;
  /** 20 = round, 8 = octagonal, 4 = square. */
  sides?: number;
  /** Tower finishes from the bottom up with their share of the height. */
  bands: [string, number][];
  base?: string | null;
  baseH?: number;
  trim?: string;
  roof?: string;
  roofKind?: 'dome' | 'cone';
  lit?: boolean;
  door?: string;
  windows?: number;
  /** Lantern room radius and glazing height. */
  lr?: number;
  lh?: number;
  /** A second, lower gallery around a watch room. */
  watch?: boolean;
}
/** Railing around a circular gallery. */
export function ringRail(b: MeshBuilder, mat: string, f: Pose, y: number, r: number, h = 1, posts = 12): void {
  const P = (i: number, yy: number): V3 => at(f, Math.cos((i / posts) * Math.PI * 2) * r, yy, Math.sin((i / posts) * Math.PI * 2) * r);
  for (let i = 0; i < posts; i++) {
    b.tube(mat, P(i, y), P(i, y + h), 0.02, 5);
    for (const q of [0.5, 1]) b.tube(mat, P(i, y + h * q), P(i + 1, y + h * q), q === 1 ? 0.022 : 0.012, 5);
  }
}
/** Lantern room with its murette, glazing, roof, vent ball and lightning rod, standing on the pose. */
export function lantern(b: MeshBuilder, f: Pose, o: { r: number; h: number; trim: string; roof: string; kind?: 'dome' | 'cone'; lit?: boolean; wall?: number }): number {
  const wallH = o.wall ?? 0.8;
  const n = Math.max(6, Math.round((2 * Math.PI * o.r) / 0.8));
  lathe(b, o.trim, f, [[o.r + 0.04, 0], [o.r + 0.04, wallH], [o.r - 0.02, wallH]], n);
  lathe(b, S(o.lit ? 'lantern-glass-lit' : 'lantern-glass'), move(f, 0, wallH, 0), [[o.r * (n / (2 * Math.PI * o.r / 0.8)), 0], [o.r * (n / (2 * Math.PI * o.r / 0.8)), o.h]], n);
  const y = wallH + o.h;
  lathe(b, o.roof, move(f, 0, y, 0), [[o.r + 0.02, -0.02], [o.r + 0.22, 0], [o.r + 0.2, 0.08]], n);
  if (o.kind === 'cone') lathe(b, o.roof, move(f, 0, y + 0.08, 0), [[o.r + 0.2, 0], [0.12, o.r * 0.95]], n);
  else ball(b, o.roof, f, [0, y + 0.08, 0], o.r + 0.2, n, 0, 78, 0.8);
  const top = y + 0.08 + (o.kind === 'cone' ? o.r * 0.95 : (o.r + 0.2) * 0.78);
  ball(b, o.roof, f, [0, top + 0.16, 0], 0.2, 8);
  b.tube(o.trim, at(f, 0, top + 0.3, 0), at(f, 0, top + 1.3, 0), 0.015, 5);
  return top + 1.3;
}
/** Masonry or iron lighthouse tower with a gallery and lantern room. */
export function lighthouse(b: MeshBuilder, f: Pose, o: LightOpts): void {
  const sides = o.sides ?? 20;
  const g0 = sides === 4 ? turn(f, 45) : sides === 8 ? turn(f, 22.5) : f;
  const k = sides < 12 ? 1 / Math.cos(Math.PI / sides) : 1;
  const trim = o.trim ?? BLACK;
  const bh = o.base === null ? 0 : (o.baseH ?? 1.2);
  if (bh > 0) lathe(b, o.base ?? 'structure/stone-ashlar', g0, [[(o.r0 + 0.7) * k, 0], [(o.r0 + 0.7) * k, bh - 0.2], [(o.r0 + 0.5) * k, bh], [0, bh]], sides);
  const total = o.bands.reduce((t, q) => t + q[1], 0);
  const rAt = (y: number): number => o.r0 + (o.r1 - o.r0) * (y / o.h);
  let y = 0;
  for (const [tex, share] of o.bands) {
    const y1 = y + (share / total) * o.h;
    lathe(b, tex, move(g0, 0, bh, 0), [[rAt(y) * k, y], [rAt(y1) * k, y1]], sides);
    y = y1;
  }
  const H = bh + o.h;
  const lr = o.lr ?? Math.min(o.r1 - 0.15, 1.5);
  const gallery = (yy: number, r: number, rr: number): void => {
    lathe(b, trim, move(g0, 0, yy, 0), [[r * k, -0.5], [rr * k, -0.1], [rr * k, 0], [0, 0]], sides);
    ringRail(b, trim, f, yy, rr - 0.06, 1, Math.max(10, Math.round(rr * 5)));
  };
  let top = H;
  if (o.watch) {
    gallery(H, o.r1, o.r1 + 1);
    lathe(b, o.bands[o.bands.length - 1][0], move(g0, 0, H, 0), [[(o.r1 - 0.1) * k, 0], [(o.r1 - 0.1) * k, 2.2]], sides);
    top = H + 2.2;
    gallery(top, o.r1 - 0.1, lr + 0.7);
  } else gallery(H, o.r1, Math.max(o.r1 + 0.8, lr + 0.8));
  lantern(b, move(f, 0, top, 0), { r: lr, h: o.lh ?? 1.6, trim, roof: o.roof ?? trim, kind: o.roofKind, lit: o.lit });
  // Door with a hood and steps, then windows climbing the tower on alternating sides.
  const door = o.door ?? 'door/front-green-3';
  const rz = (sides < 12 ? o.r0 : o.r0 * 0.99) + 0.02;
  box(b, trim, f, [0, bh + 1.1, rz - 0.1], [0.62, 1.15, 0.22], 'YZ');
  face(b, door, f, [0, bh + 1.05, rz + 0.125], 0.9, 2.1);
  if (bh > 0) for (let i = 0; i < 4; i++) box(b, 'concrete/walk-plain', f, [0, bh - (i + 0.5) * (bh / 4), rz + 0.9 + i * 0.3], [0.8, bh / 8, 0.15 + (3 - i) * 0 + 0.3], 'Y');
  for (let i = 0; i < (o.windows ?? 0); i++) {
    const wy = 4 + ((o.h - 7) * i) / Math.max(1, (o.windows ?? 1) - 1);
    const g = turn(f, i % 2 ? 110 : -70 + i * 15);
    const r = rAt(wy) * (sides < 12 ? 1 : 0.99) + 0.01;
    box(b, trim, g, [0, bh + wy, r - 0.12], [0.36, 0.55, 0.2], 'Z');
    face(b, 'window/square-white', g, [0, bh + wy, r + 0.085], 0.5, 0.8, [0.05, 0, 0.75, 0.8]);
  }
}
/** Open steel tower: legs, bracing and a central stair tube carrying a lantern. */
export function skeletonLight(b: MeshBuilder, f: Pose, o: { h: number; s0: number; s1: number; mat: string; tube?: string; legs?: number; lit?: boolean; roof?: string; levels?: number }): void {
  const legs = o.legs ?? 4;
  const levels = o.levels ?? Math.round(o.h / 4.5);
  const P = (i: number, y: number): V3 => {
    const a = ((i + 0.5) / legs) * Math.PI * 2;
    const s = o.s0 + (o.s1 - o.s0) * (y / o.h);
    return at(f, Math.cos(a) * s, y + 0.3, Math.sin(a) * s);
  };
  for (let i = 0; i < legs; i++) {
    box(b, 'concrete/walk-plain', f, [P(i, 0)[0] - f.o[0], 0.15, P(i, 0)[2] - f.o[2]], [0.45, 0.15, 0.45], 'Y');
    b.tube(o.mat, P(i, 0), P(i, o.h), 0.12, 8, 0.09);
    for (let l = 0; l < levels; l++) {
      const [y0, y1] = [(o.h * l) / levels, (o.h * (l + 1)) / levels];
      b.tube(o.mat, P(i, y1), P(i + 1, y1), 0.05, 6);
      b.tube(o.mat, P(i, y0), P(i + 1, y1), 0.025, 5);
      b.tube(o.mat, P(i + 1, y0), P(i, y1), 0.025, 5);
    }
  }
  if (o.tube) lathe(b, o.tube, move(f, 0, 0.3, 0), [[0.75, 0], [0.75, o.h]], 12);
  const H = o.h + 0.3;
  const gr = o.s1 + 0.9;
  lathe(b, o.mat, move(f, 0, H, 0), [[o.s1 * 0.6, -0.25], [gr, -0.08], [gr, 0], [0, 0]], 12);
  ringRail(b, o.mat, f, H, gr - 0.06, 1, 12);
  lantern(b, move(f, 0, H, 0), { r: Math.min(1.3, o.s1 * 0.75), h: 1.5, trim: o.mat, roof: o.roof ?? o.mat, kind: 'cone', lit: o.lit });
}
/** Small light on a column: harbour entrance and breakwater-head beacons. */
export function beacon(b: MeshBuilder, f: Pose, o: { h: number; r?: number; bands: string[]; lens?: string; base?: boolean; rail?: boolean; solar?: boolean }): void {
  const r = o.r ?? 0.45;
  const y0 = o.base === false ? 0 : 0.6;
  if (y0) cyl(b, 'concrete/walk-plain', f, [0, 0, 0], r + 0.9, y0, 12);
  o.bands.forEach((tex, i) => lathe(b, tex, move(f, 0, y0 + (o.h * i) / o.bands.length, 0), [[r, 0], [r * 0.96, o.h / o.bands.length]], 12));
  const H = y0 + o.h;
  if (o.rail !== false) {
    lathe(b, o.bands[o.bands.length - 1], move(f, 0, H, 0), [[r, -0.2], [r + 0.55, -0.05], [r + 0.55, 0], [0, 0]], 12);
    ringRail(b, 'trim/paint-galvanized', f, H, r + 0.5, 0.9, 8);
    ladder(b, f, [0, 0, r + 0.04], y0 + 0.2, H - 0.9, 'trim/paint-galvanized', 0.4);
  }
  cyl(b, 'trim/paint-charcoal', f, [0, H, 0], 0.2, 0.25, 10);
  lathe(b, o.lens ?? S('lens-fresnel'), move(f, 0, H + 0.25, 0), [[0.19, 0], [0.19, 0.5]], 12);
  lathe(b, 'trim/paint-charcoal', move(f, 0, H + 0.75, 0), [[0.21, 0], [0.24, 0.03], [0, 0.2]], 10);
  if (o.solar) {
    b.tube('trim/paint-galvanized', at(f, 0.3, H, 0), at(f, 0.55, H + 0.7, 0), 0.02, 5);
    box(b, 'roof/flat-bitumen', { ...move(f, 0.6, H + 0.75, 0), y: at({ ...f, o: [0, 0, 0] }, 0.5, 0.85, 0) }, [0, 0, 0], [0.3, 0.015, 0.25]);
  }
}
