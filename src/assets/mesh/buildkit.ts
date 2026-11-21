import { SHOP_BAYS, WINDOW_SIZES, textureSpec } from '../tex';
import { MeshBuilder, V3 } from './builder';
import { Pose, at, box, face, lathe, move, stand, tilt, turn } from './kit';

/** Quad given in the pose's own coordinates. */
export function pq(b: MeshBuilder, material: string, f: Pose, pts: V3[], uv?: [number, number][] | null, layer = 0): void {
  const [p0, p1, p2, p3] = pts.map((p) => at(f, p[0], p[1], p[2]));
  b.quad(material, p0, p1, p2, p3, uv, layer);
}
/** Triangle given in the pose's own coordinates. */
export function pt(b: MeshBuilder, material: string, f: Pose, pts: V3[], uv: [number, number][]): void {
  b.tri(material, at(f, pts[0][0], pts[0][1], pts[0][2]), at(f, pts[1][0], pts[1][1], pts[1][2]), at(f, pts[2][0], pts[2][1], pts[2][2]), uv);
}
/** A sheet seen from both sides, for cut-out materials that are drawn single sided. */
export function sheet(b: MeshBuilder, material: string, a: V3, c: V3, d: V3, e: V3, uv: [number, number][]): void {
  b.quad(material, a, c, d, e, uv);
  b.quad(material, c, a, e, d, [uv[1], uv[0], uv[3], uv[2]]);
}

// --- Walls with openings. ---
export interface Opening {
  /** Left edge along the wall and bottom edge above the wall's base. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Window, door or shopfront texture that fills the hole. */
  tex: string;
  /** Which variant of a window atlas, or which bay of a shopfront, to show. */
  v?: number;
  /** How far the glass sits behind the wall face. */
  depth?: number;
  sill?: string;
  head?: string;
  /** Flat trim around the opening. */
  frame?: string;
  reveal?: string;
}

/** The part of `tex` that an opening of this size shows, in metres. */
function fillUV(o: Opening): [number, number, number, number] {
  const spec = textureSpec(o.tex);
  const size = WINDOW_SIZES[o.tex];
  const shop = SHOP_BAYS[o.tex];
  const v = o.v ?? 0;
  if (shop) return [v * shop.bay, 0, v * shop.bay + o.w, shop.h];
  if (size && spec.tile === 'x') return [v * size.w, 0, v * size.w + o.w, size.h];
  if (size) return [(v % size.n) * size.w, 0, ((v % size.n) + 1) * size.w, size.h];
  if (spec.tile === 'xy') return [v * 0.37, 0, v * 0.37 + o.w, o.h];
  if (spec.tile === 'x') return [v, 0, v + o.w, spec.meters[1]];
  return [0, 0, spec.meters[0], spec.meters[1]];
}

// --- Weathering. Every wall gets stains, dirt at its foot and streaks below its sills, laid over the material. ---
interface Weather { age: number; seed: number; n: number }
const WEATHER = new WeakMap<MeshBuilder, Weather>();
/** How neglected the building being built is, from 0 (just finished) to 1. Walls built before this is called are moderately dirty. */
export function weathering(b: MeshBuilder, age: number, seed = 1): void {
  WEATHER.set(b, { age, seed, n: 0 });
}
/** Weathering that differs from one building to the next: `seed` decides how long since it was last cleaned, and worn materials add to it. */
export function weatherBySeed(b: MeshBuilder, seed: number, ...materials: (string | undefined)[]): void {
  const r = Math.abs(Math.sin(seed * 91.7 + 3.1) * 43758.5453) % 1;
  const worn = materials.some((m) => m && /old|sooty|peeling|dirty|rust|worn|weathered|stained|faded/.test(m));
  weathering(b, Math.min(1, 0.22 + r * 0.6 + (worn ? 0.25 : 0)), seed);
}
const weatherOf = (b: MeshBuilder): Weather => {
  let w = WEATHER.get(b);
  if (!w) WEATHER.set(b, (w = { age: 0.55, seed: 1, n: 0 }));
  return w;
};
const DARK = /charcoal|black|dark|navy|sooty|tinted|bronze|brutal/;
/** Which strength of overlay suits this material: pale dust on dark walls, only a film on glass. */
function soilFor(wt: Weather, material: string, boost = 0): string {
  if (DARK.test(material)) return 'pale';
  const a = wt.age + boost - (material.startsWith('window/') ? 0.3 : 0);
  return a > 0.75 ? 'heavy' : a > 0.4 ? 'mid' : 'light';
}
const pick = (wt: Weather, n: number): number => 1 + (Math.floor(Math.abs(Math.sin(wt.seed * 12.9898 + ++wt.n * 78.233) * 43758.5453)) % n);

/** The solid parts of a `w` by `h` panel around `hs`, as rectangles. */
function solids(w: number, h: number, hs: Opening[], emit: (x0: number, y0: number, x1: number, y1: number) => void): void {
  const cuts = (vals: number[]): number[] => [...vals].sort((p, q) => p - q).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 1e-5);
  const xs = cuts([0, w, ...hs.flatMap((o) => [o.x, o.x + o.w])]);
  const ys = cuts([0, h, ...hs.flatMap((o) => [o.y, o.y + o.h])]);
  for (let j = 0; j + 1 < ys.length; j++) {
    const [y0, y1] = [ys[j], ys[j + 1]];
    const cy = (y0 + y1) / 2;
    let start = -1;
    for (let i = 0; i + 1 < xs.length; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const hole = hs.some((o) => cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h);
      if (!hole && start < 0) start = xs[i];
      const end = hole ? xs[i] : i + 2 === xs.length ? xs[i + 1] : -1;
      if (start >= 0 && end >= 0) {
        if (end > start) emit(start, y0, end, y1);
        start = -1;
      }
    }
  }
}

/** Stains over the whole panel, a dirty foot where it meets the ground and streaks under each sill. */
function weatherWall(b: MeshBuilder, material: string, f: Pose, w: number, h: number, hs: Opening[], v0: number): void {
  const wt = weatherOf(b);
  if (wt.age <= 0.05 || textureSpec(material).decal) return;
  const kind = soilFor(wt, material);
  const rect = (tex: string, layer: number, x0: number, y0: number, x1: number, y1: number, uv: [number, number, number, number]): void =>
    pq(b, tex, f, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]], layer);
  // Big walls get the pattern enlarged, so a tower does not show it repeating.
  const k = h > 24 ? 3 : 1;
  const [ou, ov] = [pick(wt, 97) * 0.83, pick(wt, 89) * 0.61];
  const stain = `trim/stain-${kind}-${pick(wt, 3)}`;
  solids(w, h, hs, (x0, y0, x1, y1) => rect(stain, 1, x0, y0, x1, y1, [ou + x0 / k, ov + (v0 + y0) / k, ou + x1 / k, ov + (v0 + y1) / k]));
  if (Math.abs(at(f, 0, 0, 0)[1]) < 0.3 && h > 0.8) {
    const foot = Math.min(h, 1.2);
    const tex = `trim/splash-${kind === 'pale' ? 'pale' : soilFor(wt, material, 0.15)}-${pick(wt, 3)}`;
    solids(w, foot, hs.filter((o) => o.y < foot).map((o) => ({ ...o, h: Math.min(o.h, foot - o.y) })), (x0, y0, x1, y1) => rect(tex, 2, x0, y0, x1, y1, [ou + x0, y0, ou + x1, y1]));
  }
  for (const o of hs) {
    if (o.y < 0.35 || o.tex.startsWith('door/')) continue;
    // Stop at whatever opening lies below, so that no streak hangs in front of it.
    let floor = Math.max(0, o.y - 1.5);
    for (const q of hs) if (q !== o && q.y + q.h <= o.y + 1e-6 && q.x < o.x + o.w + 0.1 && q.x + q.w > o.x - 0.1) floor = Math.max(floor, q.y + q.h + 0.12);
    const top = o.y - (o.sill ? 0.07 : 0);
    if (top - floor < 0.25) continue;
    rect(`trim/drip-${kind}-${pick(wt, 2)}`, 2, Math.max(0, o.x - 0.1), floor, Math.min(w, o.x + o.w + 0.1), top, [0, 1.6 - (top - floor), 1.6, 1.6]);
  }
}

/** Wall panel `w` by `h` with its lower left corner at the pose, facing +z, pierced by `holes`. */
export function wall(b: MeshBuilder, material: string, f: Pose, w: number, h: number, holes: Opening[] = [], u0 = 0, v0 = 0): void {
  if (w <= 0.001 || h <= 0.001) return;
  const hs = holes.filter((o) => o.x >= -1e-6 && o.y >= -1e-6 && o.x + o.w <= w + 1e-6 && o.y + o.h <= h + 1e-6);
  solids(w, h, hs, (x0, y0, x1, y1) => pq(b, material, f, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], [[u0 + x0, v0 + y0], [u0 + x1, v0 + y0], [u0 + x1, v0 + y1], [u0 + x0, v0 + y1]]));
  weatherWall(b, material, f, w, h, hs, v0);
  for (const o of hs) {
    const d = o.depth ?? 0.12;
    const rm = o.reveal ?? o.frame ?? material;
    const [x0, x1, y0, y1] = [o.x, o.x + o.w, o.y, o.y + o.h];
    pq(b, rm, f, [[x0, y0, 0], [x0, y0, -d], [x0, y1, -d], [x0, y1, 0]]);
    pq(b, rm, f, [[x1, y0, -d], [x1, y0, 0], [x1, y1, 0], [x1, y1, -d]]);
    pq(b, rm, f, [[x0, y1, -d], [x1, y1, -d], [x1, y1, 0], [x0, y1, 0]]);
    if (!o.sill) pq(b, rm, f, [[x0, y0, 0], [x1, y0, 0], [x1, y0, -d], [x0, y0, -d]]);
    face(b, o.tex, move(f, 0, 0, -d), [(x0 + x1) / 2, (y0 + y1) / 2, 0], o.w, o.h, fillUV(o));
    if (o.sill) box(b, o.sill, f, [(x0 + x1) / 2, y0 - 0.03, (0.06 - d) / 2], [o.w / 2 + 0.07, 0.035, (0.06 + d) / 2]);
    if (o.head) box(b, o.head, f, [(x0 + x1) / 2, y1 + 0.08, 0.01], [o.w / 2 + 0.1, 0.085, 0.035]);
    if (o.frame) {
      const t = 0.09;
      const top = o.head ? y1 : y1 + t;
      for (const x of [x0 - t / 2, x1 + t / 2]) box(b, o.frame, f, [x, (y0 + top) / 2, 0.012], [t / 2, (top - y0) / 2, 0.012], 'Z');
      if (!o.head) box(b, o.frame, f, [(x0 + x1) / 2, y1 + t / 2, 0.012], [o.w / 2, t / 2, 0.012], 'Z');
    }
  }
}

export interface RowOpts extends Partial<Opening> {
  /** Sill height above the wall's base. */
  y: number;
  n?: number;
  pitch?: number;
  margin?: number;
  /** Returns the atlas variant for the i-th opening, or -1 to leave that bay blank. */
  pick?: (i: number) => number;
}
/** Evenly spaced openings centred on a wall `width` long. Sizes default to the window atlas cell. */
export function row(width: number, tex: string, o: RowOpts): Opening[] {
  const size = WINDOW_SIZES[tex];
  const w = o.w ?? size?.w ?? textureSpec(tex).meters[0];
  const h = o.h ?? size?.h ?? textureSpec(tex).meters[1];
  const margin = o.margin ?? 0.6;
  const pitch = o.pitch ?? (o.n ? (width - 2 * margin - w) / Math.max(1, o.n - 1) : w + 1.2);
  const n = o.n ?? Math.max(0, Math.floor((width - 2 * margin - w) / pitch) + 1);
  const out: Opening[] = [];
  const { y, n: _n, pitch: _p, margin: _m, pick, ...rest } = o;
  for (let i = 0; i < n; i++) {
    const v = pick ? pick(i) : i;
    if (v < 0) continue;
    out.push({ ...rest, tex, x: width / 2 + (i - (n - 1) / 2) * pitch - w / 2, y, w, h, v });
  }
  return out;
}

export interface Side {
  f: Pose;
  w: number;
}
/** The four faces of a box footprint: front (+z), right (+x), back, left. Each pose sits at the face's lower left corner. */
export function sides(cx: number, cz: number, w: number, d: number, y = 0): [Side, Side, Side, Side] {
  return [
    { f: stand([cx - w / 2, y, cz + d / 2], 0), w },
    { f: stand([cx + w / 2, y, cz + d / 2], 90), w: d },
    { f: stand([cx + w / 2, y, cz - d / 2], 180), w },
    { f: stand([cx - w / 2, y, cz - d / 2], 270), w: d },
  ];
}
/** Faces of a convex footprint listed counter-clockwise seen from above, as (x, z) pairs. */
export function polySides(pts: [number, number][], y = 0): Side[] {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const yaw = (Math.atan2(-(q[1] - p[1]), q[0] - p[0]) * 180) / Math.PI;
    return { f: stand([p[0], y, p[1]], yaw), w: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
}

/** Horizontal rectangle facing up. */
export function slab(b: MeshBuilder, material: string, y: number, x0: number, z0: number, x1: number, z1: number, layer = 0): void {
  b.quad(material, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]], layer);
}

// --- Roofs. ---
export interface FlatRoofOpts {
  mat: string;
  /** Parapet height above the roof; the walls must already reach y + parapet. */
  parapet?: number;
  inner?: string;
  coping?: string;
  thick?: number;
  /** Material of the outside of the parapet, which decides how its rain streaks are tinted. */
  outer?: string;
}
export function flatRoof(b: MeshBuilder, cx: number, cz: number, w: number, d: number, y: number, o: FlatRoofOpts): void {
  const p = o.parapet ?? 0;
  const t = p > 0 ? o.thick ?? 0.25 : 0;
  slab(b, o.mat, y, cx - w / 2 + t, cz - d / 2 + t, cx + w / 2 - t, cz + d / 2 - t);
  const wt = weatherOf(b);
  if (wt.age > 0.2) slab(b, `trim/pond-${pick(wt, 3)}`, y, cx - w / 2 + t, cz - d / 2 + t, cx + w / 2 - t, cz + d / 2 - t, 1);
  if (p <= 0) return;
  if (wt.age > 0.3) {
    // Rain carries the dirt on the coping down the face of the parapet.
    const [drop, kind] = [Math.min(2, p + 0.45), soilFor(wt, o.outer ?? o.inner ?? '')];
    for (const s of sides(cx, cz, w, d, y + p - drop)) {
      const u = pick(wt, 50) * 0.7;
      pq(b, `trim/runoff-${kind}-${pick(wt, 2)}`, s.f, [[0, 0, 0], [s.w, 0, 0], [s.w, drop, 0], [0, drop, 0]], [[u, 2 - drop], [u + s.w, 2 - drop], [u + s.w, 2], [u, 2]], 3);
    }
  }
  const inner = o.inner ?? 'structure/wall-old';
  for (const s of sides(cx, cz, w - 2 * t, d - 2 * t, y)) pq(b, inner, s.f, [[s.w, 0, 0], [0, 0, 0], [0, p, 0], [s.w, p, 0]], [[0, 0], [s.w, 0], [s.w, p], [0, p]]);
  const c = o.coping ?? 'trim/paint-grey';
  const [hw, ht, e] = [t / 2 + 0.03, 0.035, 0.03];
  for (const sz of [-1, 1]) b.box(c, [cx, y + p + ht, cz + sz * (d / 2 - t / 2)], [w / 2 + e, ht, hw]);
  for (const sx of [-1, 1]) b.box(c, [cx + sx * (w / 2 - t / 2), y + p + ht, cz], [hw, ht, d / 2 - t - e], [1, 0, 0], [0, 1, 0], [0, 0, 1], 'zZ');
}

export interface PitchOpts {
  mat: string;
  rise: number;
  /** Overhang at the eaves and at the gable ends. */
  over?: number;
  fascia?: string;
  /** Wall material that closes the gable triangles; omit for a hipped roof. */
  gable?: string;
  hip?: boolean;
  soffit?: string;
}
/**
 * Gabled or hipped roof. The pose sits at the centre of the wall tops with the ridge along its x axis;
 * `len` runs along the ridge and `span` across it.
 */
export function pitched(b: MeshBuilder, f: Pose, len: number, span: number, o: PitchOpts): void {
  const over = o.over ?? 0.4;
  const slope = o.rise / (span / 2);
  const sz = span / 2 + over;
  const lx = len / 2 + over;
  const ye = -over * slope;
  const yr = o.rise;
  const run = Math.hypot(sz, yr - ye);
  const hip = o.hip ? Math.min(sz, lx) : 0;
  const fascia = o.fascia ?? 'trim/paint-white';
  for (const s of [1, -1]) {
    pq(b, o.mat, f, [[-lx * s, ye, sz * s], [lx * s, ye, sz * s], [(lx - hip) * s, yr, 0], [-(lx - hip) * s, yr, 0]], [[-lx, 0], [lx, 0], [lx - hip, run], [-lx + hip, run]]);
    box(b, fascia, f, [0, ye - 0.07, s * (sz - 0.015)], [lx, 0.09, 0.02]);
    pq(b, o.soffit ?? fascia, f, [[-lx * s, ye - 0.01, span / 2 * s], [lx * s, ye - 0.01, span / 2 * s], [lx * s, ye - 0.01, sz * s], [-lx * s, ye - 0.01, sz * s]]);
    if (hip > 0) {
      pt(b, o.mat, f, [[lx * s, ye, sz * s], [lx * s, ye, -sz * s], [(lx - hip) * s, yr, 0]], [[-sz, 0], [sz, 0], [0, Math.hypot(hip, yr - ye)]]);
      box(b, fascia, f, [s * (lx - 0.015), ye - 0.07, 0], [0.02, 0.09, sz]);
      pq(b, o.soffit ?? fascia, f, [[len / 2 * s, ye - 0.01, -sz * s], [len / 2 * s, ye - 0.01, sz * s], [lx * s, ye - 0.01, sz * s], [lx * s, ye - 0.01, -sz * s]]);
    } else {
      if (o.gable) pt(b, o.gable, f, [[(len / 2) * s, 0, (span / 2) * s], [(len / 2) * s, 0, (-span / 2) * s], [(len / 2) * s, o.rise, 0]], [[0, 0], [span, 0], [span / 2, o.rise]]);
      for (const t of [1, -1]) b.beam(fascia, at(f, s * (lx - 0.02), ye - 0.08, t * sz), at(f, s * (lx - 0.02), yr - 0.08, 0), 0.04, 0.18);
    }
  }
  if (lx - hip > 0.05) box(b, o.mat, f, [0, yr + 0.01, 0], [lx - hip, 0.035, 0.1]);
}

/** Single slope rising from the pose's +z edge to its -z edge; the triangles and the tall back wall are closed with `wallMat`. */
export function shed(b: MeshBuilder, f: Pose, len: number, span: number, o: PitchOpts & { wall?: string }): void {
  const over = o.over ?? 0.3;
  const slope = o.rise / span;
  const [lx, z0, z1] = [len / 2 + over, span / 2 + over, -span / 2 - over];
  const [y0, y1] = [-over * slope, o.rise + over * slope];
  const run = Math.hypot(z0 - z1, y1 - y0);
  pq(b, o.mat, f, [[-lx, y0, z0], [lx, y0, z0], [lx, y1, z1], [-lx, y1, z1]], [[-lx, 0], [lx, 0], [lx, run], [-lx, run]]);
  const fascia = o.fascia ?? 'trim/paint-white';
  box(b, fascia, f, [0, y0 - 0.07, z0 - 0.015], [lx, 0.09, 0.02]);
  box(b, fascia, f, [0, y1 - 0.07, z1 + 0.015], [lx, 0.09, 0.02]);
  for (const s of [1, -1]) b.beam(fascia, at(f, s * (lx - 0.02), y0 - 0.08, z0), at(f, s * (lx - 0.02), y1 - 0.08, z1), 0.04, 0.18);
  if (o.wall) {
    pt(b, o.wall, f, [[len / 2, 0, span / 2], [len / 2, 0, -span / 2], [len / 2, o.rise, -span / 2]], [[0, 0], [span, 0], [span, o.rise]]);
    pt(b, o.wall, f, [[-len / 2, 0, -span / 2], [-len / 2, 0, span / 2], [-len / 2, o.rise, -span / 2]], [[0, 0], [span, 0], [0, o.rise]]);
    pq(b, o.wall, f, [[len / 2, 0, -span / 2], [-len / 2, 0, -span / 2], [-len / 2, o.rise, -span / 2], [len / 2, o.rise, -span / 2]], [[0, 0], [len, 0], [len, o.rise], [0, o.rise]]);
  }
}

/** Mansard: steep slopes on all four sides up to a flat top. Pose at the centre of the wall tops. */
export function mansard(b: MeshBuilder, f: Pose, w: number, d: number, o: { mat: string; top: string; h: number; inset: number; curb?: string }): void {
  const run = Math.hypot(o.h, o.inset);
  const [hw, hd] = [w / 2 + 0.15, d / 2 + 0.15];
  const [tw, td] = [w / 2 - o.inset, d / 2 - o.inset];
  for (const s of [1, -1]) {
    pq(b, o.mat, f, [[-hw * s, 0, hd * s], [hw * s, 0, hd * s], [tw * s, o.h, td * s], [-tw * s, o.h, td * s]], [[-hw, 0], [hw, 0], [tw, run], [-tw, run]]);
    pq(b, o.mat, f, [[hw * s, 0, hd * s], [hw * s, 0, -hd * s], [tw * s, o.h, -td * s], [tw * s, o.h, td * s]], [[-hd, 0], [hd, 0], [td, run], [-td, run]]);
    box(b, o.curb ?? 'trim/paint-grey', f, [0, -0.06, s * hd], [hw + 0.04, 0.07, 0.05]);
    box(b, o.curb ?? 'trim/paint-grey', f, [s * hw, -0.06, 0], [0.05, 0.07, hd + 0.04]);
    box(b, o.curb ?? 'trim/paint-grey', f, [0, o.h + 0.03, s * td], [tw + 0.05, 0.05, 0.05]);
    box(b, o.curb ?? 'trim/paint-grey', f, [s * tw, o.h + 0.03, 0], [0.05, 0.05, td + 0.05]);
  }
  pq(b, o.top, f, [[-tw, o.h, td], [tw, o.h, td], [tw, o.h, -td], [-tw, o.h, -td]], [[0, 0], [2 * tw, 0], [2 * tw, 2 * td], [0, 2 * td]]);
}

/** North-light factory roof: `n` teeth across the span, each a glazed upright and a long slope behind it. */
export function sawtooth(b: MeshBuilder, f: Pose, len: number, span: number, o: { mat: string; glass: string; wall: string; n: number; rise: number }): void {
  const t = span / o.n;
  const run = Math.hypot(t, o.rise);
  const gh = textureSpec(o.glass).meters[1];
  for (let i = 0; i < o.n; i++) {
    const zf = span / 2 - i * t;
    const zb = zf - t;
    pq(b, o.wall, f, [[-len / 2, 0, zf], [len / 2, 0, zf], [len / 2, o.rise, zf], [-len / 2, o.rise, zf]], [[0, 0], [len, 0], [len, o.rise], [0, o.rise]]);
    pq(b, o.glass, f, [[-len / 2 + 0.3, 0.25, zf + 0.02], [len / 2 - 0.3, 0.25, zf + 0.02], [len / 2 - 0.3, o.rise - 0.2, zf + 0.02], [-len / 2 + 0.3, o.rise - 0.2, zf + 0.02]], [[0, 0], [len - 0.6, 0], [len - 0.6, gh], [0, gh]]);
    pq(b, o.mat, f, [[-len / 2 - 0.1, o.rise + 0.02, zf + 0.1], [len / 2 + 0.1, o.rise + 0.02, zf + 0.1], [len / 2 + 0.1, 0, zb], [-len / 2 - 0.1, 0, zb]], [[0, run], [len, run], [len, 0], [0, 0]]);
    for (const s of [1, -1]) pt(b, o.wall, f, [[(s * len) / 2, 0, s > 0 ? zf : zb], [(s * len) / 2, 0, s > 0 ? zb : zf], [(s * len) / 2, o.rise, zf]], s > 0 ? [[0, 0], [t, 0], [0, o.rise]] : [[0, 0], [t, 0], [t, o.rise]]);
  }
}

/** Barrel vault across the span, closed at both ends with `end`. Pose at the centre of the springing line. */
export function barrel(b: MeshBuilder, f: Pose, len: number, span: number, o: { mat: string; end?: string; rise: number; segs?: number }): void {
  const n = o.segs ?? 14;
  const r = span / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    pts.push([Math.cos(a) * r, Math.sin(a) * o.rise]);
  }
  let v = 0;
  for (let i = 0; i < n; i++) {
    const [z0, y0] = pts[i];
    const [z1, y1] = pts[i + 1];
    const step = Math.hypot(z1 - z0, y1 - y0);
    pq(b, o.mat, f, [[-len / 2, y0, z0], [len / 2, y0, z0], [len / 2, y1, z1], [-len / 2, y1, z1]], [[0, v], [len, v], [len, v + step], [0, v + step]]);
    v += step;
    if (o.end) for (const s of [1, -1]) pt(b, o.end, f, [[(s * len) / 2, 0, 0], s > 0 ? [len / 2, y0, z0] : [-len / 2, y1, z1], s > 0 ? [len / 2, y1, z1] : [-len / 2, y0, z0]], s > 0 ? [[r, 0], [r - z0, y0], [r - z1, y1]] : [[r, 0], [r + z1, y1], [r + z0, y0]]);
  }
}

// --- Things hung on walls. The pose sits on the wall face, facing out. ---
/** Fabric awning hanging from the pose (top centre). `closed` adds the triangular side panels. */
export function awning(b: MeshBuilder, f: Pose, w: number, proj: number, drop: number, material: string, closed = true, valance = 0.22): void {
  const run = Math.hypot(proj, drop);
  pq(b, material, f, [[-w / 2, -drop, proj], [w / 2, -drop, proj], [w / 2, 0, 0.02], [-w / 2, 0, 0.02]], [[0, 0], [w, 0], [w, run], [0, run]]);
  pq(b, material, f, [[-w / 2, -drop - valance, proj], [w / 2, -drop - valance, proj], [w / 2, -drop, proj], [-w / 2, -drop, proj]], [[0, 0], [w, 0], [w, valance], [0, valance]]);
  for (const s of [1, -1]) {
    if (closed) pt(b, material, f, [[(s * w) / 2, -drop, 0.02], [(s * w) / 2, -drop, proj], [(s * w) / 2, 0, 0.02]], [[0, 0], [proj, 0], [0, drop]]);
    else b.tube('structure/steel-galvanized', at(f, s * (w / 2 - 0.03), -drop - 0.02, 0.02), at(f, s * (w / 2 - 0.03), -drop - 0.02, proj), 0.012, 5);
  }
}

/** Box sign with artwork on its front. Pose at the centre of its back. */
export function sign(b: MeshBuilder, f: Pose, w: number, h: number, tex: string, thick = 0.14, cabinet = 'trim/paint-charcoal'): void {
  box(b, cabinet, f, [0, 0, thick / 2], [w / 2 + 0.03, h / 2 + 0.03, thick / 2]);
  face(b, tex, f, [0, 0, thick + 0.004], w, h);
}

/** Blade sign sticking out from the wall, readable from both directions. Pose at the wall, level with the sign's top. */
export function blade(b: MeshBuilder, f: Pose, tex: string, scale = 1, gap = 0.25): void {
  const [mw, mh] = textureSpec(tex).meters;
  const [w, h] = [mw * scale, mh * scale];
  const c: V3 = [0, -h / 2, gap + w / 2];
  box(b, 'trim/paint-black', f, c, [0.07, h / 2 + 0.03, w / 2 + 0.03]);
  face(b, tex, turn(move(f, 0.074, c[1], c[2]), 90), [0, 0, 0], w, h);
  face(b, tex, turn(move(f, -0.074, c[1], c[2]), -90), [0, 0, 0], w, h);
  for (const y of [-0.12, -h + 0.12]) b.tube('structure/steel-black', at(f, 0, y, 0), at(f, 0, y, gap), 0.02, 6);
}

/** Railing from a to c, `h` tall, using a cut-out railing texture. */
export function rail(b: MeshBuilder, tex: string, a: V3, c: V3, h = 1.05): void {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const mh = textureSpec(tex).meters[1];
  sheet(b, tex, a, c, [c[0], c[1] + h, c[2]], [a[0], a[1] + h, a[2]], [[0, 0], [len, 0], [len, mh], [0, mh]]);
}

export interface BalconyOpts {
  slab?: string;
  /** Cut-out railing texture, or a wall material for a solid upstand when `solid` is set. */
  rail: string;
  solid?: boolean;
  h?: number;
}
/** Balcony slab with a guard on three sides. Pose at the wall, centred, at floor level. */
export function balcony(b: MeshBuilder, f: Pose, w: number, depth: number, o: BalconyOpts): void {
  box(b, o.slab ?? 'structure/wall-smooth', f, [0, -0.09, depth / 2], [w / 2, 0.09, depth / 2]);
  const h = o.h ?? 1.05;
  const c: V3[] = [[-w / 2 + 0.03, 0, 0], [-w / 2 + 0.03, 0, depth - 0.03], [w / 2 - 0.03, 0, depth - 0.03], [w / 2 - 0.03, 0, 0]];
  for (let i = 0; i < 3; i++) {
    const [p, q] = [c[i], c[i + 1]];
    if (o.solid) box(b, o.rail, f, [(p[0] + q[0]) / 2, h / 2, (p[2] + q[2]) / 2], i === 1 ? [w / 2, h / 2, 0.05] : [0.05, h / 2, depth / 2 - 0.05]);
    else rail(b, o.rail, at(f, p[0], p[1], p[2]), at(f, q[0], q[1], q[2]), h);
  }
}

/** Steel fire escape: a landing per storey joined by stairs, with a drop ladder at the bottom. Pose at the wall, centred, at the lowest landing. */
export function fireEscape(b: MeshBuilder, f: Pose, floors: number, floorH: number, o: { w?: number; depth?: number; steel?: string; rail?: string; grate?: string; roof?: number } = {}): void {
  const [w, d] = [o.w ?? 3.4, o.depth ?? 1.1];
  const steel = o.steel ?? 'structure/steel-black';
  const railTex = o.rail ?? 'trim/rail-black';
  const grate = o.grate ?? 'trim/grate-black';
  for (let i = 0; i < floors; i++) {
    const y = i * floorH;
    sheet(b, grate, at(f, -w / 2, y, d), at(f, w / 2, y, d), at(f, w / 2, y, 0), at(f, -w / 2, y, 0), [[0, 0], [w, 0], [w, d], [0, d]]);
    box(b, steel, f, [0, y - 0.04, d], [w / 2, 0.05, 0.02]);
    for (const s of [1, -1]) {
      box(b, steel, f, [(s * w) / 2, y - 0.04, d / 2], [0.02, 0.05, d / 2]);
      rail(b, railTex, at(f, (s * w) / 2, y, 0), at(f, (s * w) / 2, y, d));
      // Bracket back to the wall.
      b.beam(steel, at(f, s * (w / 2 - 0.05), y - 0.08, d - 0.05), at(f, s * (w / 2 - 0.05), y - 0.75, 0), 0.03, 0.03);
    }
    rail(b, railTex, at(f, -w / 2, y, d), at(f, w / 2, y, d));
    if (i + 1 < floors) {
      // Stair up to the next landing, alternating direction.
      const s = i % 2 ? -1 : 1;
      const [xa, xb] = [-s * (w / 2 - 0.5), s * (w / 2 - 0.9)];
      for (const z of [0.12, 0.62]) b.beam(steel, at(f, xa, y, z), at(f, xb, y + floorH, z), 0.03, 0.14);
      const n = Math.round(floorH / 0.24);
      for (let k = 1; k < n; k++) box(b, steel, f, [xa + ((xb - xa) * k) / n, y + (floorH * k) / n, 0.37], [0.1, 0.012, 0.25]);
    }
  }
  // Drop ladder, and a gooseneck ladder up to the roof.
  const ladder = (x: number, y0: number, y1: number, z: number): void => {
    for (const s of [-0.2, 0.2]) b.beam(steel, at(f, x + s, y0, z), at(f, x + s, y1, z), 0.025, 0.025);
    for (let y = y0 + 0.2; y < y1; y += 0.3) box(b, steel, f, [x, y, z], [0.2, 0.01, 0.012]);
  };
  ladder(w / 2 - 0.35, -floorH * 0.55, 1.0, d + 0.04);
  if (o.roof) ladder(-w / 2 + 0.35, (floors - 1) * floorH, (floors - 1) * floorH + o.roof + 0.9, 0.12);
}

/** Steps up to a door. Pose at the wall on the ground, centred on the door; `rise` is the height of the door sill. */
export function stoop(b: MeshBuilder, f: Pose, w: number, rise: number, o: { mat?: string; rail?: string; landing?: number } = {}): void {
  const n = Math.max(1, Math.round(rise / 0.17));
  const [sh, tread, land] = [rise / n, 0.29, o.landing ?? 1.0];
  const mat = o.mat ?? 'concrete/walk-plain';
  for (let k = 0; k < n; k++) {
    const h = rise - k * sh;
    const [z0, z1] = [k === 0 ? 0 : land + (k - 1) * tread, land + k * tread];
    box(b, mat, f, [0, h / 2, (z0 + z1) / 2], [w / 2, h / 2, (z1 - z0) / 2], 'Y');
  }
  if (o.rail) for (const s of [1, -1]) {
    rail(b, o.rail, at(f, (s * (w - 0.08)) / 2, rise, 0), at(f, (s * (w - 0.08)) / 2, rise, land), 0.95);
    rail(b, o.rail, at(f, (s * (w - 0.08)) / 2, rise, land), at(f, (s * (w - 0.08)) / 2, sh, land + (n - 1) * tread), 0.95);
  }
}

/** Brick or stucco chimney with a cap and flue pots. Pose at the centre of its base. */
export function chimney(b: MeshBuilder, f: Pose, w: number, d: number, h: number, material: string, pots = 1): void {
  box(b, material, f, [0, h / 2, 0], [w / 2, h / 2, d / 2], 'Y');
  box(b, 'structure/wall-old', f, [0, h + 0.05, 0], [w / 2 + 0.06, 0.05, d / 2 + 0.06]);
  for (let i = 0; i < pots; i++) {
    const x = pots === 1 ? 0 : (i / (pots - 1) - 0.5) * (w - 0.4);
    lathe(b, 'wall/tile-terracotta', move(f, x, h + 0.1, 0), [[0.11, 0], [0.09, 0.3], [0.11, 0.34]], 8);
  }
}

/** Gabled dormer on a roof slope. Pose at the foot of its front face, facing down the slope; `slope` is the roof's rise over run. */
export function dormer(b: MeshBuilder, f: Pose, w: number, h: number, slope: number, o: { wall: string; roof: string; window: string; v?: number; fascia?: string }): void {
  const back = h / slope;
  const rise = w * 0.32;
  const size = WINDOW_SIZES[o.window];
  const k = Math.min(1, (w - 0.3) / size.w, (h - 0.25) / size.h);
  wall(b, o.wall, move(f, -w / 2, 0, 0), w, h, [{ x: (w - size.w * k) / 2, y: (h - size.h * k) / 2, w: size.w * k, h: size.h * k, tex: o.window, v: o.v ?? 0, depth: 0.06, frame: o.fascia ?? 'trim/paint-white' }]);
  pt(b, o.wall, f, [[-w / 2, h, 0], [w / 2, h, 0], [0, h + rise, 0]], [[0, 0], [w, 0], [w / 2, rise]]);
  const [e, ov] = [w / 2 + 0.12, 0.18];
  const run = Math.hypot(e, rise * (e / (w / 2)));
  const ye = h - rise * (0.12 / (w / 2));
  for (const s of [1, -1]) {
    pt(b, o.wall, f, [[(s * w) / 2, 0, 0], [(s * w) / 2, h, -back], [(s * w) / 2, h, 0]], [[0, 0], [back, h], [0, h]]);
    pq(b, o.roof, f, [[s * e, ye, ov], [0, h + rise, ov], [0, h + rise, -(h + rise) / slope], [s * e, ye, -ye / slope]], s > 0 ? [[0, 0], [0, run], [(h + rise) / slope + ov, run], [ye / slope + ov, 0]] : [[0, 0], [0, run], [-(h + rise) / slope - ov, run], [-ye / slope - ov, 0]]);
    b.beam(o.fascia ?? 'trim/paint-white', at(f, s * e, ye - 0.06, ov - 0.02), at(f, 0, h + rise - 0.06, ov - 0.02), 0.03, 0.12);
  }
}

/** Open porch or carport roof on posts. Pose at the wall on the floor, centred. */
export function porch(b: MeshBuilder, f: Pose, w: number, depth: number, h: number, o: { roof: string; post?: string; posts?: number; drop?: number; floor?: string; floorH?: number; rail?: string; thick?: number; gap?: [number, number] }): void {
  const post = o.post ?? 'trim/paint-white';
  const drop = o.drop ?? 0.35;
  const t = o.thick ?? 0.16;
  const fh = o.floorH ?? 0;
  if (o.floor && fh > 0) box(b, o.floor, f, [0, fh / 2, depth / 2], [w / 2, fh / 2, depth / 2], 'Y');
  const run = Math.hypot(depth + 0.3, drop);
  pq(b, o.roof, f, [[-w / 2 - 0.2, h, depth + 0.3], [w / 2 + 0.2, h, depth + 0.3], [w / 2 + 0.2, h + drop, 0], [-w / 2 - 0.2, h + drop, 0]], [[0, 0], [w + 0.4, 0], [w + 0.4, run], [0, run]]);
  box(b, post, f, [0, h - 0.11, depth - t / 2], [w / 2 + 0.1, 0.1, t / 2 + 0.01]);
  box(b, post, f, [0, h - 0.02, depth + 0.28], [w / 2 + 0.2, 0.07, 0.02]);
  pq(b, post, f, [[-w / 2 - 0.2, h - 0.01, 0], [w / 2 + 0.2, h - 0.01, 0], [w / 2 + 0.2, h - 0.01, depth + 0.3], [-w / 2 - 0.2, h - 0.01, depth + 0.3]]);
  const n = o.posts ?? 2;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(n === 1 ? 0 : (i / (n - 1) - 0.5) * (w - t));
  for (const x of xs) {
    box(b, post, f, [x, (fh + h - 0.2) / 2, depth - t / 2], [t / 2, (h - 0.2 - fh) / 2, t / 2]);
    box(b, post, f, [x, fh + 0.1, depth - t / 2], [t / 2 + 0.03, 0.1, t / 2 + 0.03]);
  }
  if (o.rail) {
    const [g0, g1] = o.gap ?? [0, 0];
    const z = depth - t / 2;
    for (const [x0, x1] of [[-w / 2 + t / 2, g0], [g1, w / 2 - t / 2]]) if (x1 - x0 > 0.3) rail(b, o.rail, at(f, x0, fh, z), at(f, x1, fh, z), 0.9);
    for (const s of [1, -1]) rail(b, o.rail, at(f, (s * (w - t)) / 2, fh, 0), at(f, (s * (w - t)) / 2, fh, z), 0.9);
  }
}

// --- Roof plant. Poses sit on the roof at the centre of each unit's base. ---
const UP = (f: Pose): Pose => tilt(f, -90);
/** Condenser, packaged rooftop unit or chiller, by size 0..2. */
export function acUnit(b: MeshBuilder, f: Pose, size = 0, beige = false): void {
  const paint = beige ? 'trim/paint-tan' : 'trim/paint-grey';
  const fan = beige ? 'trim/ac-fan-beige' : 'trim/ac-fan-grey';
  const [w, h, d, fans] = ([[0.85, 0.8, 0.85, 1], [2.3, 1.25, 1.4, 2], [5.2, 2.1, 2.2, 5]] as const)[size];
  const base = size === 0 ? 0.1 : 0.2;
  for (const s of [1, -1]) box(b, 'structure/steel-galvanized', f, [0, base / 2, s * (d / 2 - 0.1)], [w / 2, base / 2, 0.05]);
  box(b, paint, f, [0, base + h / 2, 0], [w / 2, h / 2, d / 2]);
  const fw = size === 2 ? w : size === 1 ? w * 0.6 : w;
  const x0 = -w / 2;
  for (let i = 0; i < fans; i++) face(b, fan, UP(move(f, x0 + ((i + 0.5) * fw) / fans, base + h + 0.004, 0)), [0, 0, 0], Math.min(fw / fans, d) * 0.92, Math.min(fw / fans, d) * 0.92);
  // Coil faces on the long sides, a louvred intake on one end.
  for (const [yaw, len] of [[0, fw], [180, fw]] as const) pq(b, 'trim/coil-fins', turn(move(f, x0 + fw / 2, base, 0), yaw), [[-len / 2 + 0.05, 0.08, d / 2 + 0.004], [len / 2 - 0.05, 0.08, d / 2 + 0.004], [len / 2 - 0.05, h - 0.1, d / 2 + 0.004], [-len / 2 + 0.05, h - 0.1, d / 2 + 0.004]], [[0, 0], [len, 0], [len, h], [0, h]]);
  if (size === 1) {
    pq(b, 'trim/louver-grey', turn(move(f, 0, base, 0), 90), [[-d / 2 + 0.1, 0.15, w / 2 + 0.004], [d / 2 - 0.1, 0.15, w / 2 + 0.004], [d / 2 - 0.1, h - 0.15, w / 2 + 0.004], [-d / 2 + 0.1, h - 0.15, w / 2 + 0.004]], [[0, 0], [d, 0], [d, h], [0, h]]);
    box(b, 'trim/duct', f, [w / 2 - 0.5, base + h * 0.35, -d / 2 - 0.35], [0.3, 0.25, 0.35]);
  }
}
/** Mushroom or turbine vent, or a plain flue. */
export function vent(b: MeshBuilder, f: Pose, kind = 0, scale = 1): void {
  const m = 'structure/steel-galvanized';
  const s = scale;
  if (kind === 0) lathe(b, m, f, [[0.12 * s, 0], [0.12 * s, 0.35 * s], [0.3 * s, 0.4 * s], [0.3 * s, 0.46 * s], [0.02, 0.6 * s]], 10);
  else if (kind === 1) lathe(b, m, f, [[0.13 * s, 0], [0.13 * s, 0.3 * s], [0.2 * s, 0.36 * s], [0.27 * s, 0.5 * s], [0.2 * s, 0.66 * s], [0.02, 0.72 * s]], 12);
  else {
    lathe(b, m, f, [[0.09 * s, 0], [0.09 * s, 1.1 * s]], 8);
    lathe(b, m, f, [[0.16 * s, 1.14 * s], [0.02, 1.26 * s]], 8);
  }
}
/** Wooden roof tank on a steel stand. */
export function waterTank(b: MeshBuilder, f: Pose, r = 1.5, h = 3, legs = 2.4, staves = 'trim/tank-staves'): void {
  const steel = 'structure/steel-black';
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    b.beam(steel, at(f, sx * r * 0.75, 0, sz * r * 0.75), at(f, sx * r * 0.65, legs, sz * r * 0.65), 0.1, 0.1);
    b.beam(steel, at(f, sx * r * 0.75, 0.1, sz * r * 0.75), at(f, sz * r * 0.68, legs - 0.2, -sx * r * 0.68), 0.05, 0.05);
  }
  box(b, steel, f, [0, legs + 0.06, 0], [r * 0.95, 0.06, r * 0.95]);
  lathe(b, staves, move(f, 0, legs + 0.12, 0), [[r, 0], [r * 0.97, h]], 18);
  for (let i = 0; i < 6; i++) lathe(b, steel, move(f, 0, legs + 0.3 + (i * (h - 0.5)) / 5, 0), [[r * 1.012, 0], [r * 1.012, 0.035]], 18);
  lathe(b, 'roof/shake-grey', move(f, 0, legs + 0.12 + h, 0), [[r * 1.08, -0.05], [0.05, r * 0.55]], 18);
  for (const s of [-0.18, 0.18]) b.beam(steel, at(f, s, 0, r * 1.02), at(f, s, legs + h, r * 1.02), 0.025, 0.025);
  for (let y = 0.3; y < legs + h; y += 0.3) box(b, steel, f, [0, y, r * 1.02], [0.18, 0.012, 0.012]);
}
/** Stair or lift penthouse with a door. */
export function bulkhead(b: MeshBuilder, f: Pose, w: number, d: number, h: number, wallMat: string, door = 'door/steel-grey', roof = 'roof/flat-bitumen'): void {
  const ss = [move(f, -w / 2, 0, d / 2), turn(move(f, w / 2, 0, d / 2), 90), turn(move(f, w / 2, 0, -d / 2), 180), turn(move(f, -w / 2, 0, -d / 2), 270)];
  ss.forEach((s, i) => wall(b, wallMat, s, i % 2 ? d : w, h, i === 0 && door ? [{ x: w / 2 - 0.45, y: 0.1, w: 0.9, h: 2.1, tex: door, depth: 0.06 }] : []));
  box(b, roof, f, [0, h + 0.05, 0], [w / 2 + 0.08, 0.06, d / 2 + 0.08]);
}
/** Satellite dish on a short mast. */
export function dish(b: MeshBuilder, f: Pose, r = 0.45, mast = 0.8): void {
  const steel = 'structure/steel-galvanized';
  b.tube(steel, at(f, 0, 0, 0), at(f, 0, mast, 0), 0.03, 6);
  const g = tilt(move(f, 0, mast, 0.05), 55);
  lathe(b, 'trim/paint-white', g, [[0.03, 0], [r * 0.5, r * 0.07], [r * 0.85, r * 0.2], [r, r * 0.3]], 14);
  b.tube(steel, at(g, 0, 0, 0), at(g, 0, r * 0.75, 0), 0.012, 4);
  box(b, 'trim/paint-grey', g, [0, r * 0.78, 0], [0.04, 0.05, 0.04]);
}
/** Aerial: whip, TV yagi or a lattice mast with panels. */
export function antenna(b: MeshBuilder, f: Pose, kind = 0, h = 4): void {
  const steel = 'structure/steel-galvanized';
  if (kind === 0) {
    b.tube(steel, at(f, 0, 0, 0), at(f, 0, h, 0), 0.025, 5, 0.008);
  } else if (kind === 1) {
    b.tube(steel, at(f, 0, 0, 0), at(f, 0, h, 0), 0.02, 5);
    b.tube(steel, at(f, -0.6, h - 0.15, 0), at(f, 0.6, h - 0.15, 0), 0.012, 4);
    for (let i = 0; i < 7; i++) b.tube(steel, at(f, -0.55 + i * 0.18, h - 0.15, -0.3 + i * 0.02), at(f, -0.55 + i * 0.18, h - 0.15, 0.3 - i * 0.02), 0.006, 3);
  } else {
    const s = 0.35;
    const c: [number, number][] = [[s, s], [s, -s], [-s, -s], [-s, s]];
    c.forEach(([x, z], i) => {
      b.tube('structure/steel-red', at(f, x, 0, z), at(f, x * 0.4, h, z * 0.4), 0.03, 5);
      const [nx, nz] = c[(i + 1) % 4];
      for (let y = 0; y < h - 0.5; y += 1) {
        const [k0, k1] = [1 - (0.6 * y) / h, 1 - (0.6 * (y + 1)) / h];
        b.tube('structure/steel-white', at(f, x * k0, y, z * k0), at(f, nx * k1, y + 1, nz * k1), 0.014, 4);
      }
    });
    for (let i = 0; i < 3; i++) box(b, 'trim/paint-white', turn(move(f, 0, h - 0.9, 0), i * 120), [0, 0, 0.45], [0.12, 0.7, 0.05]);
    b.tube(steel, at(f, 0, h, 0), at(f, 0, h + 1.6, 0), 0.02, 5, 0.006);
  }
}
/** Billboard on a steel frame, lit from below. Pose at the centre of the frame's base; the board faces +z. */
export function billboard(b: MeshBuilder, f: Pose, tex: string, legs = 1.6, scale = 1): void {
  const [mw, mh] = textureSpec(tex).meters;
  const [w, h] = [mw * scale, mh * scale];
  const steel = 'structure/steel-grey';
  const n = Math.max(2, Math.round(w / 2.5));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * (w - 0.6);
    b.beam(steel, at(f, x, 0, 0), at(f, x, legs + h, 0), 0.12, 0.12);
    b.beam(steel, at(f, x, 0, -1.4), at(f, x, legs + h * 0.7, -0.05), 0.08, 0.08);
    b.beam(steel, at(f, x, 0.05, -1.4), at(f, x, 0.05, 0), 0.08, 0.08);
  }
  box(b, 'trim/paint-charcoal', f, [0, legs + h / 2, 0.1], [w / 2 + 0.08, h / 2 + 0.08, 0.04]);
  face(b, tex, f, [0, legs + h / 2, 0.145], w, h);
  sheet(b, 'trim/grate-black', at(f, -w / 2, legs - 0.05, 0.9), at(f, w / 2, legs - 0.05, 0.9), at(f, w / 2, legs - 0.05, 0.15), at(f, -w / 2, legs - 0.05, 0.15), [[0, 0], [w, 0], [w, 0.75], [0, 0.75]]);
  for (let i = 0; i < n + 1; i++) {
    const x = (i / n - 0.5) * (w - 0.8);
    b.tube(steel, at(f, x, legs - 0.05, 0.15), at(f, x, legs - 0.2, 1.2), 0.02, 4);
    box(b, 'trim/paint-black', f, [x, legs - 0.16, 1.25], [0.14, 0.05, 0.08]);
  }
}
/** Rows of tilted solar panels covering `w` by `d`. Pose at the centre. */
export function solar(b: MeshBuilder, f: Pose, w: number, d: number): void {
  const pitch = 1.9;
  const rows = Math.max(1, Math.floor(d / pitch));
  for (let i = 0; i < rows; i++) {
    const z = (i - (rows - 1) / 2) * pitch;
    const g = tilt(move(f, 0, 0.75, z), -62);
    box(b, 'structure/steel-galvanized', g, [0, 0, -0.02], [w / 2, 0.82, 0.015]);
    pq(b, 'signal/solar-panel', g, [[-w / 2 + 0.02, -0.8, 0], [w / 2 - 0.02, -0.8, 0], [w / 2 - 0.02, 0.8, 0], [-w / 2 + 0.02, 0.8, 0]], [[0, 0], [w, 0], [w, 1.6], [0, 1.6]]);
    for (let x = -w / 2 + 0.3; x <= w / 2 - 0.29; x += Math.max(1.2, (w - 0.6) / Math.max(1, Math.round(w / 2)))) {
      b.tube('structure/steel-galvanized', at(f, x, 0, z - 0.3), at(f, x, 1.05, z - 0.3), 0.02, 4);
      b.tube('structure/steel-galvanized', at(f, x, 0, z + 0.55), at(f, x, 0.35, z + 0.55), 0.02, 4);
    }
  }
}
/** Skylight on a curb. */
export function skylight(b: MeshBuilder, f: Pose, w = 1.2, d = 1.2, dome = false): void {
  box(b, 'trim/paint-grey', f, [0, 0.12, 0], [w / 2, 0.12, d / 2], 'yY');
  face(b, dome ? 'trim/skylight-dome' : 'trim/skylight', UP(move(f, 0, 0.24, 0)), [0, 0, 0], w, d);
}
/** Run of rectangular duct along the pose's x axis, on sleepers. */
export function duct(b: MeshBuilder, f: Pose, len: number, w = 0.6, h = 0.45): void {
  box(b, 'trim/duct', f, [0, 0.3 + h / 2, 0], [len / 2, h / 2, w / 2]);
  for (let x = -len / 2 + 0.4; x < len / 2; x += 1.6) box(b, 'structure/wall-old', f, [x, 0.15, 0], [0.1, 0.15, w / 2 + 0.1]);
}
