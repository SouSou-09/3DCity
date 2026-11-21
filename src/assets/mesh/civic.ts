import { Rand, WINDOW_SIZES, textureSpec } from '../tex';
import { MeshBuilder } from './builder';
import { roofPlant } from './blocks';
import { Opening, flatRoof, pq, pt, rail, row, sides, sign, slab, stoop, wall, weatherBySeed } from './buildkit';
import { RoofKind, roofOn, sillFor } from './houses';
import { Pose, at, box, face, lathe, move, stand, tilt, turn } from './kit';
import { V3 } from './builder';
import { addModel } from './registry';

const T = (c: string): string => `trim/paint-${c}`;
const W = (c: string): string => `wall/${c}`;
const WIN = (c: string): string => `window/${c}`;
const R = (c: string): string => `roof/${c}`;

export interface WingOpts {
  cx?: number;
  cz?: number;
  /** Height of the ground the wing stands on. */
  y?: number;
  w: number;
  d: number;
  floors: number;
  fh?: number;
  wall: string;
  trim: string;
  win: string;
  /** Gap between windows; a wide gap gives the blank piers of a school or a hall. */
  gap?: number;
  roof?: RoofKind;
  roofMat?: string;
  rise?: number;
  parapet?: number;
  /** Doors by side (0 front, 1 right, 2 back, 3 left) and offset from the middle of that side. */
  doors?: { side: number; x?: number; tex: string; w?: number; h?: number }[];
  /** Sides left without windows. */
  blank?: number[];
  dress?: Partial<Opening>;
  plant?: number;
}
/** One rectangular part of a public building: walls with rows of windows, doors and a roof. Returns the height of the wall tops. */
export function wing(b: MeshBuilder, rnd: Rand, o: WingOpts): number {
  const [cx, cz, y0, fh] = [o.cx ?? 0, o.cz ?? 0, o.y ?? 0, o.fh ?? 3.6];
  const flat = (o.roof ?? 'flat') === 'flat';
  const par = flat ? o.parapet ?? 0.8 : 0;
  const top = y0 + o.floors * fh;
  const size = WINDOW_SIZES[o.win];
  const ww = size?.w ?? textureSpec(o.win).meters[0];
  const dress = o.dress ?? { sill: o.trim, depth: 0.12 };
  sides(cx, cz, o.w, o.d, y0).forEach((s, k) => {
    const holes: Opening[] = [];
    const doors = (o.doors ?? []).filter((q) => q.side === k).map((q) => {
      const [dw, dh] = [q.w ?? textureSpec(q.tex).meters[0], q.h ?? textureSpec(q.tex).meters[1]];
      return { x: s.w / 2 + (q.x ?? 0) - dw / 2, y: 0.03, w: dw, h: dh, tex: q.tex, depth: 0.18, frame: o.trim };
    });
    holes.push(...doors);
    if (!o.blank?.includes(k)) for (let i = 0; i < o.floors; i++) {
      const wins = row(s.w, o.win, { ...dress, y: i * fh + sillFor(o.win, fh), pitch: ww + (o.gap ?? 1.3), margin: 1.2, pick: () => rnd.int(0, 3) });
      holes.push(...wins.filter((q) => i > 0 || !doors.some((dr) => q.x < dr.x + dr.w + 0.5 && q.x + q.w > dr.x - 0.5)));
    }
    wall(b, o.wall, s.f, s.w, o.floors * fh + par, holes);
  });
  if (flat) {
    flatRoof(b, cx, cz, o.w, o.d, top, { mat: o.roofMat ?? 'roof/flat-gravel', parapet: par, inner: o.wall, coping: o.trim });
    roofPlant(b, rnd, cx, cz, o.w - 2, o.d - 2, top, o.plant ?? 1, { wall: o.wall, big: o.w * o.d > 500 });
  } else roofOn(b, cx, cz, top, o.w, o.d, { roof: o.roofMat ?? 'roof/shingle-charcoal', kind: o.roof!, rise: o.rise ?? Math.min(o.w, o.d) * 0.22, trim: o.trim, wall: o.wall });
  return top;
}

/** Classical porch: a row of columns carrying an entablature and a pediment. Pose at the wall on the ground, centred, facing out. */
export function portico(b: MeshBuilder, f: Pose, w: number, depth: number, h: number, n: number, o: { col: string; stone: string; roof: string; base?: number; flat?: boolean }): { frieze: Pose; scale: number } {
  const base = o.base ?? 0;
  if (base > 0) box(b, o.stone, f, [0, base / 2, depth / 2], [w / 2 + 0.3, base / 2, depth / 2 + 0.2], 'y');
  const r = Math.max(0.22, h * 0.055);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * (w - 2 * r - 0.4);
    lathe(b, o.col, move(f, x, base, depth - r - 0.2), [[r * 1.3, 0], [r * 1.3, 0.15], [r, 0.28], [r * 0.86, h - 0.3], [r * 1.15, h - 0.16], [r * 1.25, h]], 14);
  }
  const eh = h * 0.13;
  box(b, o.stone, f, [0, base + h + eh / 2, depth / 2], [w / 2, eh / 2, depth / 2]);
  box(b, o.stone, f, [0, base + h + eh + 0.07, depth / 2], [w / 2 + 0.25, 0.07, depth / 2 + 0.25]);
  const y0 = base + h + eh + 0.14;
  const out = { frieze: move(f, 0, base + h + eh / 2, depth + 0.01), scale: Math.min((eh * 0.8) / 0.9, (w * 0.7) / 4.8) };
  if (o.flat) return out;
  const [rise, zf, hw] = [w * 0.15, depth + 0.1, w / 2 + 0.1];
  pt(b, o.stone, f, [[-hw, y0, zf], [hw, y0, zf], [0, y0 + rise, zf]], [[0, 0], [2 * hw, 0], [hw, rise]]);
  const run = Math.hypot(hw + 0.2, rise);
  pq(b, o.roof, f, [[-hw - 0.2, y0, zf + 0.2], [0, y0 + rise + 0.06, zf + 0.2], [0, y0 + rise + 0.06, 0], [-hw - 0.2, y0, 0]], [[0, 0], [run, 0], [run, zf], [0, zf]]);
  pq(b, o.roof, f, [[0, y0 + rise + 0.06, zf + 0.2], [hw + 0.2, y0, zf + 0.2], [hw + 0.2, y0, 0], [0, y0 + rise + 0.06, 0]], [[0, 0], [run, 0], [run, zf], [0, zf]]);
  return out;
}

/** Square tower with a clock on each face under a pyramid roof. Pose at the centre of its base. */
export function clockTower(b: MeshBuilder, f: Pose, w: number, h: number, o: { wall: string; trim: string; roof: string; clock?: string; spire?: number; belfry?: boolean }): void {
  const base: [number, number] = [f.o[0], f.o[2]];
  for (const s of sides(base[0], base[1], w, w, f.o[1])) wall(b, o.wall, s.f, s.w, h, o.belfry ? [{ x: w / 2 - 0.5, y: h - 3.6, w: 1, h: 1.9, tex: 'window/louver-white', depth: 0.2, sill: o.trim }] : []);
  box(b, o.trim, f, [0, h + 0.1, 0], [w / 2 + 0.2, 0.12, w / 2 + 0.2]);
  if (o.clock) for (let k = 0; k < 4; k++) face(b, o.clock, turn(f, k * 90), [0, h - 1.3, w / 2 + 0.03], 1.8, 1.8);
  const sp = o.spire ?? w * 0.9;
  lathe(b, o.roof, turn(move(f, 0, h + 0.22, 0), 45), [[(w / 2 + 0.15) * Math.SQRT2, 0], [0.04, sp]], 4);
  b.tube('structure/steel-black', at(f, 0, h + sp, 0), at(f, 0, h + sp + 1.2, 0), 0.03, 5);
}

/** Flagpole with a made-up flag. Pose at its foot. */
export function flag(b: MeshBuilder, f: Pose, h = 9, cloth = 'trim/awning-navy'): void {
  lathe(b, 'structure/wall-smooth', f, [[0.3, 0], [0.3, 0.25]], 10);
  b.tube('trim/paint-aluminium', at(f, 0, 0.25, 0), at(f, 0, h, 0), 0.06, 8, 0.035);
  lathe(b, 'trim/paint-bronze', move(f, 0, h, 0), [[0.01, 0], [0.09, 0.08], [0.01, 0.17]], 8);
  for (const s of [1, -1]) pq(b, cloth, f, s > 0 ? [[0.07, h - 1.3, 0], [2.0, h - 1.4, 0.12], [2.0, h - 0.2, 0.12], [0.07, h - 0.1, 0]] : [[2.0, h - 1.4, 0.12], [0.07, h - 1.3, 0], [0.07, h - 0.1, 0], [2.0, h - 0.2, 0.12]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/** Name board over an entrance. Pose at the wall, centred, at the height of the board's middle. */
const nameBoard = (b: MeshBuilder, f: Pose, tex: string, scale = 1): void => sign(b, f, 4.8 * scale, 0.9 * scale, tex, 0.1, 'trim/paint-bronze');

// --- Schools: classroom wings around a taller hall or gym. ---
interface SchoolOpts { seed: number; wall: string; trim: string; win: string; floors: number; wings: number; gym: boolean; sign: string; roof?: RoofKind; roofMat?: string; tower?: boolean }
function school(b: MeshBuilder, o: SchoolOpts): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.wall);
  const fh = 3.7;
  const [mw, md] = [26, 13];
  const roof = o.roof ? { roof: o.roof, roofMat: o.roofMat ?? 'roof/shingle-brown', rise: 2.6 } : {};
  // Entrance block in the middle, classroom wings to each side and behind.
  const top = wing(b, rnd, { w: mw, d: md, floors: o.floors, fh, wall: o.wall, trim: o.trim, win: o.win, gap: 0.5, doors: [{ side: 0, tex: 'door/glass-double-aluminium' }, { side: 0, x: -2.1, tex: 'door/glass-double-aluminium' }, { side: 0, x: 2.1, tex: 'door/glass-double-aluminium' }], ...roof });
  box(b, o.trim, stand([0, 0, md / 2]), [0, 3.2, 1.6], [4.2, 0.12, 1.7]);
  for (const x of [-3.9, 3.9]) box(b, o.trim, stand([x, 0, md / 2 + 3.1]), [0, 1.55, 0], [0.14, 1.55, 0.14]);
  nameBoard(b, stand([0, Math.min(top - 0.7, 4.2), md / 2]), o.sign, 1.2);
  for (let k = 0; k < o.wings; k++) {
    const s = k % 2 ? 1 : -1;
    const back = k >= 2;
    const [w, d] = back ? [11, 30] : [34, 11];
    wing(b, rnd, { cx: back ? s * (mw / 2 - 5.5) : s * (mw / 2 + w / 2), cz: back ? -md / 2 - d / 2 : -1, w, d, floors: Math.max(1, o.floors - (back ? 1 : 0)), fh, wall: o.wall, trim: o.trim, win: o.win, gap: 0.5, doors: [{ side: back ? 2 : s > 0 ? 1 : 3, tex: 'door/steel-double-blue' }], ...roof });
  }
  if (o.gym) {
    const [gx, gz] = [o.wings > 1 ? 0 : mw / 2 + 12, o.wings > 1 ? -md / 2 - 14 - (o.wings > 2 ? 30 : 0) : -md / 2 - 13];
    wing(b, rnd, { cx: gx, cz: gz, w: 24, d: 34, floors: 1, fh: 9, wall: o.wall, trim: o.trim, win: 'window/band-clerestory', gap: 0.2, blank: [0], doors: [{ side: 1, tex: 'door/steel-double-grey' }, { side: 3, tex: 'door/steel-double-grey' }], roofMat: 'roof/flat-membrane-grey', plant: 2 });
    nameBoard(b, stand([gx + 12, 6.5, gz], 90), 'trim/sign-gymnasium', 1.3);
  }
  if (o.tower) clockTower(b, stand([mw / 2 - 3, top, 0]), 4.5, 7, { wall: o.wall, trim: o.trim, roof: o.roofMat ?? 'roof/seam-copper', clock: 'trim/clock-cream' });
  flag(b, stand([-9, 0, md / 2 + 6]), 9, 'trim/awning-navy');
  // Letter board by the path.
  for (const x of [-1.3, 1.3]) box(b, 'wall/brick-red', stand([8 + x, 0, md / 2 + 7]), [0, 0.9, 0], [0.2, 0.9, 0.2]);
  for (const yaw of [0, 180]) face(b, 'trim/marquee-school', stand([8, 0, md / 2 + 7], yaw), [0, 1.15, 0.06], 2.3, 0.92);
  box(b, 'trim/paint-charcoal', stand([8, 0, md / 2 + 7]), [0, 1.15, 0], [1.2, 0.5, 0.05]);
}

// --- Fire stations: apparatus bays beside a two-storey house, with a hose tower. ---
interface FireOpts { seed: number; wall: string; trim: string; win: string; bays: number; door: string; floors: number; tower: boolean; roof?: RoofKind; roofMat?: string; sign?: string }
function fireStation(b: MeshBuilder, o: FireOpts): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.wall);
  const bw = o.bays * 5.2 + 1;
  const bayH = 5.6;
  const doors = Array.from({ length: o.bays }, (_, i) => ({ side: 0, x: (i - (o.bays - 1) / 2) * 5.2, tex: o.door }));
  const roof = o.roof ? { roof: o.roof, roofMat: o.roofMat ?? 'roof/seam-red', rise: 2.2 } : {};
  wing(b, rnd, { cx: -bw / 2, w: bw, d: 20, floors: 1, fh: bayH, wall: o.wall, trim: o.trim, win: 'window/band-clerestory', blank: [0], doors: [...doors, ...doors.map((q) => ({ ...q, side: 2 }))], plant: 1, ...roof });
  const hw = 10;
  const top = wing(b, rnd, { cx: hw / 2, w: hw, d: 20, floors: o.floors, fh: 3.4, wall: o.wall, trim: o.trim, win: o.win, doors: [{ side: 0, tex: 'door/glass-red' }], ...roof });
  nameBoard(b, stand([-bw / 2, bayH - 0.55, 10]), o.sign ?? 'trim/sign-fire-station', Math.min(1.5, bw / 6));
  slab(b, 'concrete/driveway', 0.02, -bw, 10, 0, 22);
  if (o.tower) {
    const f = stand([hw - 2.2, 0, -7.5]);
    for (const s of sides(f.o[0], f.o[2], 3.6, 3.6, top)) wall(b, o.wall, s.f, s.w, 6.5, [{ x: 1.3, y: 4.2, w: 1, h: 1.9, tex: 'window/louver-white', depth: 0.15, sill: o.trim }]);
    lathe(b, o.roofMat ?? 'roof/seam-red', turn(move(f, 0, top + 6.5, 0), 45), [[2.75, 0], [0.05, 2.2]], 4);
  }
  flag(b, stand([hw + 2, 0, 13]), 8, 'trim/awning-red');
  // Warning beacon and a row of bollards protecting the door jambs.
  for (let i = 0; i <= o.bays; i++) lathe(b, 'trim/paint-yellow', stand([-bw / 2 + (i - o.bays / 2) * 5.2, 0, 10.6]), [[0.11, 0], [0.11, 1.05], [0.02, 1.1]], 8);
}

// --- Halls with a flat front: police, post office, library, clinic, community centre. ---
interface HallOpts { seed: number; w: number; d: number; floors: number; fh?: number; wall: string; trim: string; win: string; gap?: number; door: string; sign: string; steps?: number; portico?: number; col?: string; roof?: RoofKind; roofMat?: string; annex?: boolean; flagAt?: number; emblem?: string; canopy?: boolean }
function hall(b: MeshBuilder, o: HallOpts): number {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.wall);
  const fh = o.fh ?? 4;
  const lift = o.steps ?? 0;
  const roof = o.roof ? { roof: o.roof, roofMat: o.roofMat ?? 'roof/slate-grey', rise: Math.min(o.w, o.d) * 0.18 } : {};
  if (lift > 0) box(b, o.wall, stand(), [0, lift / 2, 0], [o.w / 2 + 0.05, lift / 2, o.d / 2 + 0.05], 'yY');
  const top = wing(b, rnd, { y: lift, w: o.w, d: o.d, floors: o.floors, fh, wall: o.wall, trim: o.trim, win: o.win, ...(o.gap === undefined ? {} : { gap: o.gap }), doors: [{ side: 0, tex: o.door }, { side: 2, x: o.w / 2 - 2.5, tex: 'door/steel-grey' }], plant: 2, ...roof });
  const front = stand([0, 0, o.d / 2]);
  if (o.portico) {
    const ph = Math.min(top - lift - 1.2, o.floors * fh * 0.82);
    const pw = o.portico * 2.6 + 1.5;
    stoop(b, move(front, 0, 0, 4.2), pw + 1, lift, { mat: 'structure/stone-ashlar', landing: 0.3 });
    const pc = portico(b, move(front, 0, 0, 0), pw, 4.2, ph, o.portico, { col: o.col ?? 'wall/stone-limestone', stone: o.col ?? 'wall/stone-limestone', roof: o.roofMat ?? 'roof/slate-grey', base: lift });
    nameBoard(b, pc.frieze, o.sign, pc.scale);
  } else {
    if (lift > 0) stoop(b, front, 5, lift, { mat: 'structure/wall-smooth', rail: 'trim/rail-black', landing: 1.6 });
    if (o.canopy) {
      box(b, o.trim, front, [0, lift + 3.5, 1.8], [3.6, 0.14, 1.9]);
      for (const x of [-3.3, 3.3]) box(b, o.trim, front, [x, (lift + 3.4) / 2, 3.4], [0.12, (lift + 3.4) / 2, 0.12]);
    }
    nameBoard(b, move(front, 0, Math.min(top - 0.8, lift + (o.canopy ? 4.6 : 4.3)), 0), o.sign, Math.min(1.4, o.w / 7));
  }
  if (o.emblem) face(b, o.emblem, front, [o.w / 2 - 2, lift + 3.2, 0.04], 1.4, 1.4);
  if (o.annex) wing(b, rnd, { cx: o.w / 2 + 6, cz: -2, w: 12, d: o.d - 6, floors: 1, fh: 4.2, wall: o.wall, trim: o.trim, win: o.win, blank: [3], doors: [{ side: 0, tex: 'door/garage-wide-grey' }], plant: 1 });
  if (o.flagAt !== undefined) flag(b, stand([o.flagAt, 0, o.d / 2 + 5]), 9);
  return top;
}

/** Latin cross. Pose at its foot. */
function cross(b: MeshBuilder, f: Pose, h: number, mat = 'trim/paint-bronze'): void {
  box(b, mat, f, [0, h / 2, 0], [h * 0.06, h / 2, h * 0.06]);
  box(b, mat, f, [0, h * 0.68, 0], [h * 0.3, h * 0.06, h * 0.06]);
}
/** Round drum under a dome, with an optional lantern. Pose at the centre of its base. */
export function dome(b: MeshBuilder, f: Pose, r: number, o: { drum: string; roof: string; drumH: number; lantern?: boolean; glass?: string }): void {
  lathe(b, o.drum, f, [[r, 0], [r, o.drumH], [r + 0.25, o.drumH + 0.05], [r + 0.25, o.drumH + 0.35]], 20);
  if (o.glass) for (let k = 0; k < 10; k++) face(b, o.glass, turn(f, k * 36 + 18), [0, o.drumH * 0.55, r * Math.cos(Math.PI / 20) + 0.03], Math.min(1.2, r * 0.3), Math.min(3.6, o.drumH * 0.8));
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) prof.push([Math.max(o.lantern ? 0.75 : 0.03, r * Math.cos((i / 8) * Math.PI / 2)), o.drumH + 0.35 + r * Math.sin((i / 8) * Math.PI / 2)]);
  lathe(b, o.roof, f, prof, 20);
  if (o.lantern) {
    lathe(b, o.drum, move(f, 0, o.drumH + 0.3 + r, 0), [[0.75, 0], [0.75, 1.7], [1, 1.8], [1, 2]], 8);
    lathe(b, o.roof, move(f, 0, o.drumH + 2.3 + r, 0), [[1, 0], [0.5, 0.9], [0.03, 1.2]], 8);
    b.tube('trim/paint-bronze', at(f, 0, o.drumH + 3.5 + r, 0), at(f, 0, o.drumH + 5 + r, 0), 0.04, 5);
  }
}

// --- Churches: a nave under a steep roof, coloured glass down the sides, and a tower. ---
interface SteepleOpts { wall: string; trim: string; roof: string; spire: number; door?: string; glass?: string; cap?: 'spire' | 'dome' | 'flat' | 'octagon'; clock?: string }
function steeple(b: MeshBuilder, cx: number, cz: number, tw: number, th: number, o: SteepleOpts): void {
  sides(cx, cz, tw, tw, 0).forEach((s, k) => {
    const holes: Opening[] = [{ x: tw / 2 - 0.5, y: th - 3, w: 1, h: 1.9, tex: 'window/louver-white', depth: 0.2, sill: o.trim }];
    if (k === 0 && o.door) holes.push({ x: tw / 2 - 1.1, y: 0.03, w: 2.2, h: 3, tex: o.door, depth: 0.25, frame: o.trim });
    if (k === 0 && o.glass && th > 11) holes.push({ x: tw / 2 - 0.6, y: 4, w: 1.2, h: 3.6, tex: o.glass, depth: 0.15 });
    wall(b, o.wall, s.f, s.w, th, holes);
  });
  const f = stand([cx, 0, cz]);
  box(b, o.trim, f, [0, th + 0.1, 0], [tw / 2 + 0.2, 0.12, tw / 2 + 0.2]);
  if (o.clock) for (let k = 0; k < 4; k++) face(b, o.clock, turn(f, k * 90), [0, th - 4.4, tw / 2 + 0.03], Math.min(1.8, tw - 0.8), Math.min(1.8, tw - 0.8));
  const cap = o.cap ?? 'spire';
  let top = th + 0.22;
  if (cap === 'spire') { lathe(b, o.roof, turn(move(f, 0, top, 0), 45), [[(tw / 2 + 0.15) * Math.SQRT2, 0], [0.04, o.spire]], 4); top += o.spire; }
  else if (cap === 'octagon') {
    lathe(b, o.wall, turn(move(f, 0, top, 0), 22.5), [[tw * 0.42, 0], [tw * 0.42, 2.2], [tw * 0.5, 2.3]], 8);
    lathe(b, o.roof, turn(move(f, 0, top + 2.3, 0), 22.5), [[tw * 0.5, 0], [0.04, o.spire]], 8);
    top += 2.3 + o.spire;
  } else if (cap === 'dome') { dome(b, move(f, 0, top, 0), tw * 0.42, { drum: o.wall, roof: o.roof, drumH: 0.6 }); top += 0.95 + tw * 0.42; }
  else { for (const s of sides(cx, cz, tw, tw, top)) wall(b, o.wall, s.f, s.w, 0.9); top += 0.9; }
  cross(b, move(f, 0, top - 0.05, 0), cap === 'flat' ? 2.4 : 1.6);
}
interface ChurchOpts { seed: number; w: number; len: number; h: number; wall: string; trim: string; roof: string; glass: string; door: string; rose?: string; rise?: number; tower?: 'corner' | 'centre' | 'twin' | 'none'; tw?: number; th?: number; spire?: number; cap?: SteepleOpts['cap']; transept?: boolean; apse?: boolean; buttress?: boolean; gable?: string; sign?: boolean }
function church(b: MeshBuilder, o: ChurchOpts): void {
  weatherBySeed(b, o.seed, o.wall);
  const { w, len, h } = o;
  const rise = o.rise ?? w * 0.55;
  const gh = Math.min(3.6, h - 1.5);
  const tower = o.tower ?? 'corner';
  const glassRow = (width: number, pitch = 3.4): Opening[] => {
    const n = Math.max(1, Math.floor((width - 2) / pitch));
    return Array.from({ length: n }, (_, i) => ({ x: width / 2 + (i - (n - 1) / 2) * pitch - 0.6 * (gh / 3.6), y: 1.1, w: 1.2 * (gh / 3.6), h: gh, tex: o.glass, depth: 0.15 }));
  };
  sides(0, 0, w, len, 0).forEach((s, k) => {
    const holes: Opening[] = [];
    if (k === 0) {
      if (tower !== 'centre') holes.push({ x: w / 2 - 1.1, y: 0.03, w: 2.2, h: 3, tex: o.door, depth: 0.25, frame: o.trim });
      if (o.rose && h >= 6.8) holes.push({ x: w / 2 - 1.3, y: 3.8, w: 2.6, h: 2.6, tex: o.rose, depth: 0.15 });
      else if (tower !== 'centre') for (const x of [-w / 4 - 0.4, w / 4 + 0.4]) if (w > 9) holes.push({ x: w / 2 + x - 0.6 * (gh / 3.6), y: 1.1, w: 1.2 * (gh / 3.6), h: gh, tex: o.glass, depth: 0.15 });
    } else if (k === 2) { if (!o.apse) holes.push(...glassRow(s.w, 2.6).slice(0, 3)); }
    else holes.push(...glassRow(s.w));
    wall(b, o.wall, s.f, s.w, h, holes);
  });
  roofOn(b, 0, 0, h, w, len, { roof: o.roof, kind: 'gable-front', rise, trim: o.trim, wall: o.gable ?? o.wall, over: 0.35 });
  if (o.rose && h < 6.8 && tower !== 'centre') face(b, o.rose, stand([0, 0, len / 2]), [0, h + rise * 0.22, 0.04], Math.min(2.6, w * 0.3), Math.min(2.6, w * 0.3));
  cross(b, stand([0, h + rise, -len / 2 + 0.3]), 1.4);
  if (o.buttress) {
    const n = Math.max(1, Math.floor((len - 2) / 3.4));
    for (let i = 0; i <= n; i++) for (const sx of [-1, 1]) {
      const z = (i - n / 2) * 3.4;
      box(b, o.wall, stand([sx * (w / 2 + 0.35), 0, z]), [0, h * 0.36, 0], [0.35, h * 0.36, 0.3], 'y');
      box(b, o.trim, stand([sx * (w / 2 + 0.35), 0, z]), [0, h * 0.72 + 0.06, 0], [0.4, 0.06, 0.35]);
    }
  }
  if (o.transept) {
    const [tw, td] = [w + 12, w * 0.8];
    const cz = -len * 0.18;
    sides(0, cz, tw, td, 0).forEach((s, k) => wall(b, o.wall, s.f, s.w, h, k % 2 ? glassRow(s.w, 2.4).slice(0, 2) : []));
    roofOn(b, 0, cz, h, tw, td, { roof: o.roof, kind: 'gable', rise: td * 0.55, trim: o.trim, wall: o.wall, over: 0.35 });
  }
  if (o.apse) {
    const [aw, ad] = [w * 0.62, 4];
    sides(0, -len / 2 - ad / 2, aw, ad, 0).forEach((s, k) => wall(b, o.wall, s.f, s.w, h * 0.72, k === 0 ? [] : glassRow(s.w, 2.2).map((q) => ({ ...q, h: Math.min(q.h, h * 0.72 - 1.6) }))));
    roofOn(b, 0, -len / 2 - ad / 2, h * 0.72, aw, ad, { roof: o.roof, kind: 'hip', rise: 1.8, trim: o.trim, wall: o.wall });
  }
  const tw = o.tw ?? Math.max(3.4, w * 0.36);
  const th = o.th ?? h + rise + 3;
  const st = { wall: o.wall, trim: o.trim, roof: o.roof, spire: o.spire ?? tw * 2.2, glass: o.glass, ...(o.cap ? { cap: o.cap } : {}) };
  if (tower === 'corner') steeple(b, -(w / 2 + tw / 2 - 0.3), len / 2 - tw / 2, tw, th, st);
  else if (tower === 'centre') steeple(b, 0, len / 2 + tw / 2 - 0.4, tw, th, { ...st, door: o.door });
  else if (tower === 'twin') for (const sx of [-1, 1]) steeple(b, sx * (w / 2 + tw / 2 - 0.6), len / 2 - tw / 2 + 0.6, tw, th, st);
  const dz = len / 2 + (tower === 'centre' ? tw - 0.4 : 0);
  stoop(b, stand([0, 0, dz]), 4, 0.45, { mat: 'structure/stone-ashlar', landing: 1.2 });
  if (o.sign) for (const x of [-1.3, 1.3]) box(b, o.wall, stand([w / 2 + 3 + x, 0, dz + 5]), [0, 0.8, 0], [0.18, 0.8, 0.18]);
  if (o.sign) for (const yaw of [0, 180]) sign(b, stand([w / 2 + 3, 1.05, dz + 5], yaw), 2.4, 0.45, 'trim/sign-chapel', 0.08, 'trim/paint-white');
}

// --- Hospitals: a ward slab on a wide podium, a glazed lobby and an ambulance bay. ---
interface HospitalOpts { seed: number; w: number; floors: number; podium: number; wall: string; trim: string; win: string; lobby: string; heli: boolean; er: boolean; cross?: boolean }
/** Drive-through canopy on four posts with lettering on its fascia. Pose at the wall, centred. */
export function ambulanceBay(b: MeshBuilder, f: Pose, w: number, depth: number, h: number, o: { trim: string; sign: string; side?: string }): void {
  box(b, 'trim/paint-white', f, [0, h + 0.3, depth / 2], [w / 2, 0.3, depth / 2]);
  for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) for (const z of [depth * 0.35, depth - 0.4]) box(b, o.trim, f, [x, h / 2, z], [0.18, h / 2, 0.18]);
  box(b, 'trim/paint-red', f, [0, h + 0.3, depth + 0.02], [w / 2 + 0.02, 0.32, 0.03]);
  sign(b, move(f, 0, h + 0.3, depth + 0.05), 3.2, 0.6, o.sign, 0.04, 'trim/paint-red');
  if (o.side) for (const s of [-1, 1]) sign(b, turn(move(f, s * (w / 2 + 0.02), h + 0.3, depth / 2), s * 90), 3.2, 0.6, o.side, 0.04, 'trim/paint-white');
}
/** Raised landing deck. Pose at the centre of the roof it stands on. */
export function helipad(b: MeshBuilder, f: Pose, lift = 2.2): void {
  for (const x of [-4.5, 4.5]) for (const z of [-4.5, 4.5]) box(b, 'structure/steel-grey', f, [x, lift / 2, z], [0.2, lift / 2, 0.2]);
  box(b, 'structure/wall-smooth', f, [0, lift, 0], [6.6, 0.15, 6.6]);
  pq(b, 'trim/helipad', f, [[-6, lift + 0.16, 6], [6, lift + 0.16, 6], [6, lift + 0.16, -6], [-6, lift + 0.16, -6]], [[0, 0], [12, 0], [12, 12], [0, 12]], 1);
  rail(b, 'trim/rail-cable', at(f, -6.6, lift + 0.15, -6.6), at(f, 6.6, lift + 0.15, -6.6), 0.5);
  box(b, 'structure/steel-grey', f, [7.4, lift - 0.1, 0], [0.8, 0.05, 0.6]);
}
function hospital(b: MeshBuilder, o: HospitalOpts): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.wall);
  const [pw, pd] = [o.w + 22, 32];
  const ptop = wing(b, rnd, { w: pw, d: pd, floors: o.podium, fh: 4.3, wall: o.wall, trim: o.trim, win: o.win, gap: 0.6, doors: [{ side: 2, x: 6, tex: 'door/steel-double-grey' }, { side: 1, tex: 'door/glass-double-aluminium' }], plant: 2 });
  const top = wing(b, rnd, { cx: 3, cz: -5, y: ptop, w: o.w, d: 17, floors: o.floors, fh: 3.8, wall: o.wall, trim: o.trim, win: o.win, gap: 0.5, plant: 3 });
  // Glazed lobby pushed out of the podium, under a canopy.
  const lx = -pw / 2 + 12;
  const lf = stand([lx, 0, pd / 2]);
  sides(lx, pd / 2 + 2.5, 14, 5, 0).forEach((s, k) => { if (k !== 2) wall(b, o.lobby, s.f, s.w, 4.8, k === 0 ? [{ x: 5.2, y: 0.03, w: 3.6, h: 2.7, tex: 'door/lobby-aluminium', depth: 0.1 }] : []); });
  box(b, o.trim, lf, [0, 4.95, 2.6], [7.3, 0.15, 2.8]);
  box(b, o.trim, lf, [0, 3.6, 8.2], [5, 0.14, 3.2]);
  for (const x of [-4.6, 4.6]) box(b, o.trim, lf, [x, 1.75, 10.9], [0.16, 1.75, 0.16]);
  nameBoard(b, move(lf, 0, Math.min(ptop - 0.6, 6.2), 5.02), 'trim/sign-hospital', 1.5);
  for (const yaw of [0, 90]) face(b, 'trim/sign-h', stand([3 + (yaw ? o.w / 2 : -o.w / 2 + 2.6), top - 2.4, -5 + (yaw ? -6 : 8.5)], yaw), [0, 0, 0.05], 3.2, 3.2);
  if (o.cross) face(b, 'trim/sign-cross-red', stand([3 + o.w / 2 - 2.6, top - 2.4, 3.5]), [0, 0, 0.05], 2.6, 2.6);
  if (o.er) {
    const ex = pw / 2 + 9;
    wing(b, rnd, { cx: ex, cz: 2, w: 18, d: 24, floors: 1, fh: 4.6, wall: o.wall, trim: o.trim, win: o.win, gap: 0.6, blank: [3], doors: [{ side: 0, tex: 'door/glass-double-red' }], plant: 2 });
    ambulanceBay(b, stand([ex, 0, 14]), 12, 8, 3.9, { trim: o.trim, sign: 'trim/sign-emergency', side: 'trim/sign-ambulance-only' });
    slab(b, 'concrete/driveway', 0.02, ex - 8, 14, ex + 8, 26);
  }
  if (o.heli) helipad(b, stand([3 - o.w / 2 + 9, top + 0.8, -5]));
  flag(b, stand([lx - 10, 0, pd / 2 + 8]));
}

// --- Seats of government and learning: steps, a row of columns, wings, and a dome or tower over the middle. ---
interface GrandOpts { seed: number; w: number; d: number; floors: number; fh?: number; wall: string; trim: string; win: string; gap?: number; door: string; sign: string; steps: number; cols: number; crown?: 'dome' | 'tower' | 'cupola' | 'none'; wings?: number; wingFloors?: number; roofMat: string; col?: string; clock?: string; roof?: RoofKind; towerH?: number; flags?: number }
function grand(b: MeshBuilder, o: GrandOpts): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.wall);
  const fh = o.fh ?? 4.6;
  const crown = o.crown ?? 'none';
  const roof = o.roof ? { roof: o.roof, roofMat: o.roofMat, rise: Math.min(o.w, o.d) * 0.16 } : { parapet: 1.1 };
  const ww = o.wings ?? 0;
  box(b, o.wall, stand(), [0, o.steps / 2, ww ? -1 : 0], [o.w / 2 + ww + 0.1, o.steps / 2, o.d / 2 + 0.1], 'yY');
  const top = wing(b, rnd, { y: o.steps, w: o.w, d: o.d, floors: o.floors, fh, wall: o.wall, trim: o.trim, win: o.win, gap: o.gap ?? 1.6, doors: [{ side: 0, tex: o.door }, { side: 0, x: -3.4, tex: o.door }, { side: 0, x: 3.4, tex: o.door }], plant: crown === 'none' ? 2 : 0, ...roof });
  for (const sx of ww ? [-1, 1] : []) wing(b, rnd, { cx: sx * (o.w / 2 + ww / 2), cz: -1, y: o.steps, w: ww, d: o.d - 5, floors: o.wingFloors ?? Math.max(1, o.floors - 1), fh, wall: o.wall, trim: o.trim, win: o.win, gap: o.gap ?? 1.6, blank: [sx > 0 ? 3 : 1], plant: 1, ...roof });
  const front = stand([0, 0, o.d / 2]);
  const pw = o.cols * 2.7 + 1.2;
  const col = o.col ?? o.wall;
  stoop(b, move(front, 0, 0, 4.4), pw + 1.5, o.steps, { mat: 'structure/stone-ashlar', landing: 0.3 });
  const pc = portico(b, front, pw, 4.4, Math.min(top - o.steps - 1.3, o.floors * fh * 0.86), o.cols, { col, stone: col, roof: o.roofMat, base: o.steps });
  nameBoard(b, pc.frieze, o.sign, pc.scale);
  const ridge = top + (o.roof ? Math.min(o.w, o.d) * 0.16 * 0.55 : 0);
  if (crown === 'dome') {
    const r = Math.min(o.w, o.d) * 0.26;
    box(b, o.wall, stand([0, top, 0]), [0, (ridge - top + 1.6) / 2, 0], [r + 1.2, (ridge - top + 1.6) / 2, r + 1.2], 'y');
    dome(b, stand([0, ridge + 1.6, 0]), r, { drum: col, roof: o.roofMat, drumH: 4.2, lantern: true, glass: 'window/louver-white' });
  } else if (crown === 'tower') steeple(b, 0, 0, 6.5, top + (o.towerH ?? 14), { wall: o.wall, trim: o.trim, roof: o.roofMat, spire: 6, cap: 'octagon', ...(o.clock ? { clock: o.clock } : {}) });
  else if (crown === 'cupola') {
    lathe(b, 'trim/paint-white', turn(stand([0, ridge - 0.6, 0]), 22.5), [[1.9, 0], [1.9, 3.4], [2.3, 3.5], [2.3, 3.7]], 8);
    lathe(b, o.roofMat, turn(stand([0, ridge + 3.1, 0]), 22.5), [[2.3, 0], [1.2, 1.5], [0.04, 3.4]], 8);
    for (let k = 0; k < 8; k++) face(b, 'window/louver-white', turn(stand([0, ridge - 0.6, 0]), k * 45), [0, 1.9, 1.9 * Math.cos(Math.PI / 8) + 0.03], 0.9, 1.8);
  }
  for (let i = 0; i < (o.flags ?? 2); i++) flag(b, stand([(i % 2 ? 1 : -1) * (pw / 2 + 3 + Math.floor(i / 2) * 3), 0, o.d / 2 + 9]), 10, i % 2 ? 'trim/awning-burgundy' : 'trim/awning-navy');
}

// --- Stadiums: a ring of raked seats round a field. ---
interface BowlOpts { rx: number; rz: number; depth: number; h: number; a0?: number; a1?: number; seats: string; wall: string; roofed?: [number, number][]; n?: number }
const superEllipse = (rx: number, rz: number, deg: number): [number, number] => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return [rx * Math.sign(c) * Math.sqrt(Math.abs(c)), rz * Math.sign(s) * Math.sqrt(Math.abs(s))];
};
/** Raked stand following a rounded rectangle from angle a0 to a1, with a wall behind and optional roof. */
export function bowl(b: MeshBuilder, f: Pose, o: BowlOpts): void {
  const [a0, a1] = [o.a0 ?? 0, o.a1 ?? 360];
  const n = Math.max(4, Math.round(((o.n ?? 72) * (a1 - a0)) / 360));
  const L = Math.hypot(o.depth, o.h - 1.2);
  const inn = (a: number, y: number): V3 => { const [x, z] = superEllipse(o.rx, o.rz, a); return [x, y, z]; };
  const out = (a: number, y: number, k = 1): V3 => { const [x, z] = superEllipse(o.rx + o.depth * k, o.rz + o.depth * k, a); return [x, y, z]; };
  let s = 0;
  for (let i = 0; i < n; i++) {
    const [p, q] = [a0 + ((a1 - a0) * i) / n, a0 + ((a1 - a0) * (i + 1)) / n];
    const [m0, m1] = [out(p, 0, 0.5), out(q, 0, 0.5)];
    const ds = Math.hypot(m1[0] - m0[0], m1[2] - m0[2]);
    pq(b, o.seats, f, [inn(p, 1.2), inn(q, 1.2), out(q, o.h), out(p, o.h)], [[s, 0], [s + ds, 0], [s + ds, L], [s, L]]);
    pq(b, o.wall, f, [inn(p, 0), inn(q, 0), inn(q, 1.2), inn(p, 1.2)], [[s, 0], [s + ds, 0], [s + ds, 1.2], [s, 1.2]]);
    pq(b, o.wall, f, [out(q, 0), out(p, 0), out(p, o.h + 1.1), out(q, o.h + 1.1)], [[s, 0], [s + ds, 0], [s + ds, o.h + 1.1], [s, o.h + 1.1]]);
    pq(b, o.wall, f, [out(p, o.h + 1.1), out(q, o.h + 1.1), out(q, o.h), out(p, o.h)], [[s, 0], [s + ds, 0], [s + ds, 1.1], [s, 1.1]]);
    const mid = (p + q) / 2;
    if (o.roofed?.some(([r0, r1]) => mid >= r0 && mid <= r1)) {
      const [ry, rin] = [o.h + 6, 0.25];
      pq(b, 'roof/seam-white', f, [out(p, ry - 1.5, rin), out(q, ry - 1.5, rin), out(q, ry, 1.02), out(p, ry, 1.02)], [[s, 0], [s + ds, 0], [s + ds, o.depth * 0.8], [s, o.depth * 0.8]]);
      pq(b, 'structure/steel-white', f, [out(q, ry - 1.56, rin), out(p, ry - 1.56, rin), out(p, ry - 0.06, 1.02), out(q, ry - 0.06, 1.02)], [[s, 0], [s + ds, 0], [s + ds, o.depth * 0.8], [s, o.depth * 0.8]]);
      if (i % 3 === 0) {
        b.tube('structure/steel-white', at(f, ...out(p, o.h + 1.1, 1)), at(f, ...out(p, ry, 1)), 0.22, 6);
        b.tube('structure/steel-white', at(f, ...out(p, ry, 1)), at(f, ...out(p, ry - 1.5, rin)), 0.14, 5);
      }
    }
    s += ds;
  }
  if (a1 - a0 < 359) for (const [a, flip] of [[a0, false], [a1, true]] as const) {
    const pts: V3[] = [inn(a, 0), out(a, 0), out(a, o.h + 1.1), inn(a, 1.2)];
    pq(b, o.wall, f, flip ? pts : [pts[1], pts[0], pts[3], pts[2]], flip ? [[0, 0], [o.depth, 0], [o.depth, o.h], [0, 1.2]] : [[o.depth, 0], [0, 0], [0, 1.2], [o.depth, o.h]]);
  }
}
/** Floodlight mast. Pose at its foot, the lamps face +z. */
export function floodlight(b: MeshBuilder, f: Pose, h: number): void {
  b.tube('structure/steel-galvanized', at(f, 0, 0, 0), at(f, 0, h, 0), 0.45, 8, 0.2);
  box(b, 'structure/steel-galvanized', tilt(move(f, 0, h, 0.3), 20), [0, 0, 0], [3, 1.6, 0.12]);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) face(b, 'trim/paint-white', tilt(move(f, 0, h, 0.3), 20), [(i - 2) * 1.1, (j - 1) * 0.95, 0.13], 0.8, 0.7);
}
interface StadiumOpts extends BowlOpts { field: string; fw: number; fd: number; diamond?: boolean; track?: boolean; lights?: number; board?: boolean; sign?: string; arcs?: [number, number][] }
function stadium(b: MeshBuilder, o: StadiumOpts): void {
  const f = stand();
  const [ox, oz] = [o.rx + o.depth, o.rz + o.depth];
  slab(b, 'concrete/driveway', 0.01, -ox - 4, -oz - 4, ox + 4, oz + 4);
  if (o.track) slab(b, 'site/track-red', 0.03, -o.rx + 1, -o.rz + 1, o.rx - 1, o.rz - 1, 1);
  else slab(b, 'ground/grass-mown', 0.03, -o.rx + 0.5, -o.rz + 0.5, o.rx - 0.5, o.rz - 0.5, 1);
  if (o.diamond) {
    // Infield: a dirt square on its corner with grass inside the base paths, home plate towards the stands.
    const hf = turn(stand([0, 0, -o.rz + 7]), -45);
    const sq = (m: string, lo: number, hi: number, y: number, layer: number): void => pq(b, m, hf, [[lo, y, hi], [hi, y, hi], [hi, y, lo], [lo, y, lo]], [[lo, lo], [hi, lo], [hi, hi], [lo, hi]], layer);
    sq('ground/dirt', -4, 34, 0.05, 2);
    sq('ground/grass-mown', 3, 25, 0.07, 3);
    for (const [x, z] of [[0, 0], [27.4, 0], [27.4, 27.4], [0, 27.4]]) box(b, 'trim/paint-white', hf, [x, 0.09, z], [0.2, 0.03, 0.2]);
    lathe(b, 'ground/dirt', move(hf, 13.7, 0.05, 13.7), [[2.7, 0], [0.8, 0.25], [0.02, 0.27]], 14);
  } else slab(b, o.field, 0.05, -o.fw / 2, -o.fd / 2, o.fw / 2, o.fd / 2, 2);
  for (const [a0, a1] of o.arcs ?? [[0, 360]]) bowl(b, f, { ...o, a0, a1 });
  for (let i = 0; i < (o.lights ?? 0); i++) {
    const [sx, sz] = [i % 2 ? 1 : -1, i % 4 < 2 ? 1 : -1];
    floodlight(b, turn(stand([sx * (ox + 2), 0, sz * (oz + 2)]), sx * sz > 0 ? (sx > 0 ? 225 : 45) : sx > 0 ? 315 : 135), o.h + 22);
  }
  if (o.board) {
    const bf = turn(stand([-ox - 0.5, 0, 0]), 90);
    for (const x of [-5, 5]) box(b, 'structure/steel-grey', bf, [x, (o.h + 4) / 2, 0], [0.3, (o.h + 4) / 2, 0.3]);
    box(b, 'trim/paint-charcoal', bf, [0, o.h + 8, 0], [8.3, 4.3, 0.3]);
    face(b, 'trim/scoreboard', bf, [0, o.h + 8, 0.32], 16, 8);
  }
  if (o.sign) for (const yaw of [0, 180]) nameBoard(b, stand([0, Math.min(o.h - 1, 6), (yaw ? -1 : 1) * (oz + 0.05)], yaw), o.sign, 2.2);
}
function arena(b: MeshBuilder, o: { seed: number; r: number; h: number; squash: number; wall: string; roof: string; glass: string; sign: string }): void {
  weatherBySeed(b, o.seed, o.wall);
  const f = stand();
  lathe(b, o.glass, f, [[o.r - 0.6, 0], [o.r - 0.6, 5.2]], 48, o.squash);
  lathe(b, o.wall, f, [[o.r, 5], [o.r + 1.6, 5.4], [o.r + 1.6, o.h], [o.r + 0.8, o.h + 0.4]], 48, o.squash);
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) prof.push([Math.max(0.05, (o.r + 0.8) * Math.cos((i / 8) * Math.PI / 2)), o.h + 0.4 + o.r * 0.28 * Math.sin((i / 8) * Math.PI / 2)]);
  lathe(b, o.roof, f, prof, 48, o.squash);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    box(b, o.wall, turn(stand([Math.sin(a) * (o.r - 0.3), 0, Math.cos(a) * (o.r - 0.3) * o.squash]), (a * 180) / Math.PI), [0, 2.6, 0], [0.4, 2.6, 0.5], 'y');
  }
  const front = stand([0, 0, (o.r + 1.6) * o.squash]);
  box(b, 'trim/paint-charcoal', front, [0, 5.3, 3], [9, 0.25, 3.4]);
  for (const x of [-8.2, 8.2]) box(b, 'trim/paint-charcoal', front, [x, 2.55, 6], [0.25, 2.55, 0.25]);
  nameBoard(b, move(front, 0, 7.6, 0.2), o.sign, 3);
  slab(b, 'concrete/driveway', 0.01, -o.r - 6, -o.r * o.squash - 6, o.r + 6, o.r * o.squash + 12);
}

// --- Cemeteries. ---
const STONE = ['wall/stone-granite-grey', 'wall/stone-granite-black', 'wall/stone-limestone', 'wall/stone-brownstone', 'wall/stone-marble-white', 'wall/stone-limestone-sooty'];
/** One grave marker. Pose at the middle of its foot, the inscription faces +z. */
export function grave(b: MeshBuilder, f: Pose, kind: number, stone: number): void {
  const m = STONE[stone % STONE.length];
  const epi = `trim/epitaph-${(stone % 4) + 1}`;
  if (kind === 0) {
    box(b, m, f, [0, 0.08, 0], [0.5, 0.08, 0.2], 'y');
    box(b, m, f, [0, 0.6, 0], [0.4, 0.45, 0.09]);
    face(b, epi, f, [0, 0.62, 0.095], 0.62, 0.8);
  } else if (kind === 1) {
    box(b, m, f, [0, 0.42, 0], [0.34, 0.42, 0.08], 'y');
    box(b, m, f, [0, 0.9, 0], [0.24, 0.07, 0.08]);
    box(b, m, f, [0, 1.0, 0], [0.12, 0.04, 0.08]);
    face(b, epi, f, [0, 0.45, 0.085], 0.56, 0.72);
  } else if (kind === 2) {
    box(b, m, f, [0, 0.2, 0], [0.4, 0.2, 0.3], 'y');
    cross(b, move(f, 0, 0.4, 0), 1.5, m);
    face(b, epi, f, [0, 0.21, 0.305], 0.3, 0.38);
  } else if (kind === 3) {
    box(b, m, f, [0, 0.3, 0], [0.45, 0.3, 0.45], 'y');
    lathe(b, m, turn(move(f, 0, 0.6, 0), 45), [[0.42, 0], [0.26, 2.3], [0.02, 2.75]], 4);
    face(b, epi, f, [0, 0.31, 0.455], 0.42, 0.54);
  } else if (kind === 4) {
    box(b, m, tilt(f, -8), [0, 0.1, 0.9], [0.45, 0.07, 0.95]);
    box(b, m, f, [0, 0.35, 0], [0.45, 0.35, 0.12], 'y');
    face(b, epi, f, [0, 0.36, 0.125], 0.5, 0.64);
  } else {
    box(b, m, f, [0, 0.5, 0], [0.32, 0.5, 0.32], 'y');
    box(b, m, f, [0, 1.04, 0], [0.38, 0.04, 0.38]);
    lathe(b, m, move(f, 0, 1.08, 0), [[0.1, 0], [0.08, 0.12], [0.24, 0.3], [0.26, 0.5], [0.12, 0.66], [0.16, 0.72], [0.02, 0.8]], 10);
    face(b, epi, f, [0, 0.52, 0.325], 0.5, 0.64);
  }
}
function graveRow(b: MeshBuilder, seed: number, n: number, rows: number, old: boolean): void {
  const rnd = new Rand(seed);
  slab(b, old ? 'ground/grass-patchy' : 'ground/grass-mown', 0, -n * 0.9 - 1, -rows * 1.5 - 0.5, n * 0.9 + 1, rows * 1.5 + 0.5);
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
    if (rnd.next() < 0.12) continue;
    const f = turn(stand([(i - (n - 1) / 2) * 1.8 + rnd.range(-0.15, 0.15), 0, (j - (rows - 1) / 2) * 3 + rnd.range(-0.1, 0.1)]), rnd.range(-6, 6));
    grave(b, old ? tilt(f, rnd.range(-9, 9)) : f, old ? rnd.int(0, 5) : rnd.int(0, 1) * (rnd.next() < 0.7 ? 0 : 4), rnd.int(0, 5));
  }
}
function mausoleum(b: MeshBuilder, seed: number, stone: string, w: number, d: number, cols: number): void {
  const rnd = new Rand(seed);
  weatherBySeed(b, seed, stone);
  box(b, stone, stand(), [0, 0.25, 0.6], [w / 2 + 0.4, 0.25, d / 2 + 1.2], 'y');
  sides(0, 0, w, d, 0.5).forEach((s, k) => wall(b, stone, s.f, s.w, 3.4, k === 0 ? [{ x: w / 2 - 0.55, y: 0.02, w: 1.1, h: 2.3, tex: 'door/civic-bronze', depth: 0.2 }] : k === 2 ? [] : [{ x: s.w / 2 - 0.3, y: 1.2, w: 0.6, h: 1.4, tex: 'window/stained-amber-limestone', depth: 0.12 }]));
  portico(b, stand([0, 0, d / 2]), w + 0.4, 1.7, 3.1, cols, { col: stone, stone, roof: 'roof/slate-grey', base: 0.5 });
  roofOn(b, 0, 0, 3.9, w + 0.3, d + 0.3, { roof: 'roof/slate-grey', kind: 'gable-front', rise: (w + 0.4) * 0.15, trim: stone, wall: stone, over: 0.1 });
  if (rnd.next() < 0.5) cross(b, stand([0, 3.9 + (w + 0.4) * 0.15, d / 2 + 1.5]), 0.9, stone);
}

export function addCivic(): void {
  let seed = 9100;
  const next = (): number => (seed += 13);
  const civic = (id: string, label: string, fn: (b: MeshBuilder, seed: number) => void): void => {
    const s = next();
    addModel('civic', id, label, (b) => fn(b, s));
  };

  const SCHOOLS: [string, string, Omit<SchoolOpts, 'seed'>][] = [
    ['school-elementary-1', '小学校 平屋・レンガ', { wall: W('brick-red'), trim: T('cream'), win: WIN('casement-triple-white'), floors: 1, wings: 2, gym: false, sign: 'trim/sign-elementary-school', roof: 'hip', roofMat: R('shingle-brown') }],
    ['school-elementary-2', '小学校 平屋・しっくい', { wall: W('stucco-cream'), trim: T('teal'), win: WIN('slider-wide-aluminium'), floors: 1, wings: 3, gym: false, sign: 'trim/sign-elementary-school' }],
    ['school-elementary-3', '小学校 2階建て・ブロック', { wall: W('block-beige'), trim: T('blue'), win: WIN('band-white'), floors: 2, wings: 2, gym: true, sign: 'trim/sign-elementary-school' }],
    ['school-middle-1', '中学校 2階建て・コンクリート', { wall: W('concrete-panel'), trim: T('blue'), win: WIN('band-aluminium'), floors: 2, wings: 2, gym: true, sign: 'trim/sign-middle-school' }],
    ['school-middle-2', '中学校 2階建て・黄レンガ', { wall: W('brick-buff'), trim: T('green'), win: WIN('steel-white'), floors: 2, wings: 4, gym: true, sign: 'trim/sign-middle-school' }],
    ['school-high-1', '高校 3階建て・時計塔', { wall: W('brick-red-flemish'), trim: T('white'), win: WIN('sash-wide-white'), floors: 3, wings: 4, gym: true, sign: 'trim/sign-high-school', tower: true }],
    ['school-high-2', '高校 2階建て・モダン', { wall: W('metal-panel-white'), trim: T('charcoal'), win: WIN('band-tall-aluminium'), floors: 2, wings: 3, gym: true, sign: 'trim/sign-high-school' }],
    ['school-high-old', '高校 古いレンガ・すすけ', { wall: W('brick-red-sooty'), trim: T('white-old'), win: WIN('sash-white-old'), floors: 3, wings: 2, gym: true, sign: 'trim/sign-high-school', tower: true, roofMat: R('seam-green') }],
  ];
  for (const [id, label, o] of SCHOOLS) civic(id, label, (b, s) => school(b, { ...o, seed: s }));

  const FIRE: [string, string, Omit<FireOpts, 'seed'>][] = [
    ['fire-brick-2', '消防署 レンガ・2台', { wall: W('brick-red'), trim: T('white'), win: WIN('sash-white'), bays: 2, door: 'door/bay-red', floors: 2, tower: true }],
    ['fire-brick-3', '消防署 レンガ・3台', { wall: W('brick-brown'), trim: T('cream'), win: WIN('sash-cream-2over2'), bays: 3, door: 'door/bay-white', floors: 2, tower: true }],
    ['fire-modern-3', '消防署 モダン・3台', { wall: W('block-split'), trim: T('red'), win: WIN('band-aluminium'), bays: 3, door: 'door/bay-red', floors: 2, tower: false }],
    ['fire-modern-4', '消防署 金属パネル・4台', { wall: W('metal-panel-silver'), trim: T('charcoal'), win: WIN('band-black'), bays: 4, door: 'door/bay-grey', floors: 2, tower: true, roofMat: R('seam-grey') }],
    ['fire-stucco-2', '消防署 スパニッシュ・2台', { wall: W('stucco-white'), trim: T('brown'), win: WIN('arch-brown'), bays: 2, door: 'door/bay-green', floors: 2, tower: true, roof: 'hip', roofMat: R('clay-terracotta') }],
    ['fire-rural-1', '消防分署 平屋・1台', { wall: W('metal-ribbed-beige'), trim: T('red'), win: WIN('slider-aluminium'), bays: 1, door: 'door/bay-white', floors: 1, tower: false, roof: 'gable', roofMat: R('seam-red') }],
  ];
  for (const [id, label, o] of FIRE) civic(id, label, (b, s) => fireStation(b, { ...o, seed: s }));

  const HALLS: [string, string, Omit<HallOpts, 'seed'>][] = [
    ['police-brutal', '警察署 コンクリート', { w: 28, d: 20, floors: 3, wall: W('concrete-formwork'), trim: T('charcoal'), win: WIN('band-black'), door: 'door/lobby-black', sign: 'trim/sign-police', steps: 0.6, annex: true, flagAt: -11, canopy: true }],
    ['police-brick', '警察署 レンガ・古い', { w: 22, d: 18, floors: 2, wall: W('brick-brown'), trim: T('cream'), win: WIN('sash-white-barred'), door: 'door/civic-oak', sign: 'trim/sign-police', steps: 1.1, annex: true, flagAt: -9 }],
    ['police-modern', '警察署 モダン', { w: 32, d: 18, floors: 2, wall: W('metal-panel-charcoal'), trim: T('aluminium'), win: WIN('band-tall-aluminium'), door: 'door/lobby-aluminium', sign: 'trim/sign-police', annex: true, flagAt: -13, canopy: true }],
    ['police-substation', '交番ほどの分署', { w: 12, d: 10, floors: 1, wall: W('block-blue'), trim: T('white'), win: WIN('slider-aluminium-barred'), door: 'door/glass-aluminium', sign: 'trim/sign-police', flagAt: -5 }],
    ['sheriff', '保安官事務所', { w: 18, d: 14, floors: 1, wall: W('stucco-sand'), trim: T('brown'), win: WIN('casement-brown'), door: 'door/glass-bronze', sign: 'trim/sign-sheriff', roof: 'hip', roofMat: R('clay-terracotta'), annex: true, flagAt: -8 }],
    ['post-office-deco', '郵便局 石造り', { w: 26, d: 18, floors: 2, fh: 4.6, wall: W('stone-limestone'), trim: T('bronze'), win: WIN('tall-black'), gap: 1.6, door: 'door/civic-bronze', sign: 'trim/sign-post-office', steps: 1.2, flagAt: -11 }],
    ['post-office-brick', '郵便局 レンガ', { w: 20, d: 16, floors: 1, fh: 5, wall: W('brick-red'), trim: T('white'), win: WIN('arch-white'), door: 'door/glass-double-white', sign: 'trim/sign-post-office', steps: 0.6, roof: 'hip', annex: true, flagAt: -9 }],
    ['post-office-modern', '郵便局 ブロック・平屋', { w: 24, d: 16, floors: 1, fh: 4.4, wall: W('block-white'), trim: T('blue'), win: WIN('picture-aluminium'), door: 'door/glass-double-aluminium', sign: 'trim/sign-post-office', annex: true, flagAt: -10, canopy: true }],
    ['library-classical', '図書館 列柱', { w: 30, d: 22, floors: 2, fh: 4.8, wall: W('stone-limestone'), trim: T('grey'), win: WIN('sash-tall-white'), gap: 1.8, door: 'door/civic-oak', sign: 'trim/sign-public-library', steps: 1.8, portico: 4, roof: 'hip', roofMat: R('seam-copper') }],
    ['library-brick', '図書館 レンガ・アーチ窓', { w: 24, d: 18, floors: 2, fh: 4.2, wall: W('brick-red-flemish'), trim: T('cream'), win: WIN('arch-wide-brown'), door: 'door/civic-green', sign: 'trim/sign-public-library', steps: 1.2, roof: 'hip', roofMat: R('slate-green') }],
    ['library-modern', '図書館 ガラスとコンクリート', { w: 34, d: 24, floors: 2, fh: 4.5, wall: W('concrete-white'), trim: T('charcoal'), win: WIN('band-tall-black'), gap: 0.1, door: 'door/lobby-black', sign: 'trim/sign-public-library', canopy: true }],
    ['library-branch', '図書館の分館 平屋', { w: 20, d: 14, floors: 1, fh: 4.2, wall: W('brick-buff'), trim: T('green'), win: WIN('picture-white-grid'), door: 'door/glass-double-green', sign: 'trim/sign-public-library', roof: 'gable', roofMat: R('shingle-green') }],
    ['clinic-1', '診療所 平屋', { w: 22, d: 16, floors: 1, wall: W('stucco-white'), trim: T('teal'), win: WIN('slider-wide-aluminium'), door: 'door/glass-double-aluminium', sign: 'trim/sign-medical-clinic', canopy: true, emblem: 'trim/sign-cross-red' }],
    ['clinic-2', '診療所 2階建て', { w: 20, d: 16, floors: 2, fh: 3.6, wall: W('brick-painted-white'), trim: T('blue'), win: WIN('office-aluminium'), door: 'door/glass-double-white', sign: 'trim/sign-medical-clinic', canopy: true, emblem: 'trim/sign-cross-red' }],
    ['clinic-3', '診療所 タイル張り', { w: 26, d: 18, floors: 2, fh: 3.6, wall: W('tile-cream'), trim: T('green'), win: WIN('band-aluminium-green'), door: 'door/glass-double-green', sign: 'trim/sign-medical-clinic', canopy: true, emblem: 'trim/sign-cross-red' }],
    ['community-1', '公民館 切妻', { w: 26, d: 16, floors: 1, fh: 5, wall: W('siding-sage'), trim: T('white'), win: WIN('picture-white-grid'), door: 'door/glass-double-white', sign: 'trim/sign-community-center', roof: 'gable', roofMat: R('shingle-charcoal'), flagAt: -11 }],
    ['community-2', '公民館 ブロック', { w: 30, d: 20, floors: 1, fh: 5.4, wall: W('block-yellow'), trim: T('green'), win: WIN('band-clerestory'), gap: 0.3, door: 'door/glass-double-green', sign: 'trim/sign-community-center', canopy: true, flagAt: -13 }],
    ['community-3', '公民館 2階建て・しっくい', { w: 24, d: 18, floors: 2, wall: W('stucco-peach'), trim: T('brown'), win: WIN('casement-triple-brown'), door: 'door/glass-double-bronze', sign: 'trim/sign-community-center', roof: 'hip', roofMat: R('clay-mixed'), flagAt: -10 }],
  ];
  for (const [id, label, o] of HALLS) civic(id, label, (b, s) => { hall(b, { ...o, seed: s }); });

  const CHURCHES: [string, string, Omit<ChurchOpts, 'seed'>][] = [
    ['church-gothic-stone', '教会 石造りゴシック・角塔', { w: 12, len: 30, h: 9, wall: W('stone-limestone'), trim: T('grey'), roof: R('slate-grey'), glass: WIN('stained-jewel-limestone'), door: 'door/church-oak', rose: WIN('rose-limestone'), tower: 'corner', th: 24, buttress: true, apse: true, sign: true }],
    ['church-gothic-brick', '教会 レンガ・中央塔', { w: 11, len: 26, h: 8, wall: W('brick-red'), trim: T('cream'), roof: R('slate-green'), glass: WIN('stained-jewel-brick'), door: 'door/church-red', rose: WIN('rose-brick'), tower: 'centre', th: 20, buttress: true, sign: true }],
    ['church-cathedral', '大聖堂 双塔・翼廊', { w: 18, len: 52, h: 14, wall: W('stone-sandstone'), trim: T('grey'), roof: R('seam-copper'), glass: WIN('stained-ruby-limestone'), door: 'door/church-oak', rose: WIN('rose-limestone'), tower: 'twin', tw: 6.5, th: 32, spire: 14, transept: true, apse: true, buttress: true }],
    ['church-white-steeple', '教会 白い下見板・尖塔', { w: 9, len: 20, h: 6, wall: W('siding-white'), trim: T('white'), roof: R('shingle-charcoal'), glass: WIN('stained-sea-white'), door: 'door/church-dark', tower: 'centre', tw: 3.4, th: 13, spire: 9, cap: 'octagon', rise: 4, sign: true }],
    ['church-mission', '教会 スパニッシュ・ミッション', { w: 11, len: 24, h: 7, wall: W('stucco-white'), trim: T('brown'), roof: R('clay-terracotta'), glass: WIN('stained-ruby-white'), door: 'door/church-oak', rose: WIN('rose-white'), tower: 'corner', tw: 4.2, th: 14, cap: 'dome', rise: 3.2 }],
    ['church-mission-twin', '教会 ミッション・双塔', { w: 13, len: 30, h: 8, wall: W('stucco-cream'), trim: T('brown'), roof: R('clay-mixed'), glass: WIN('stained-sea-white'), door: 'door/church-dark', rose: WIN('rose-white'), tower: 'twin', tw: 4.4, th: 15, cap: 'dome', rise: 3.6, transept: true }],
    ['church-brick-old', '教会 すすけたレンガ', { w: 10, len: 22, h: 7.5, wall: W('brick-red-sooty'), trim: T('white-old'), roof: R('slate-grey'), glass: WIN('stained-sea-brick'), door: 'door/church-dark', rose: WIN('rose-brick'), tower: 'corner', th: 17, cap: 'flat' }],
    ['church-aframe', '教会 モダン・Aフレーム', { w: 14, len: 24, h: 2.6, wall: W('brick-buff'), trim: T('charcoal'), roof: R('shingle-charcoal'), glass: WIN('stained-amber-brick'), door: 'door/civic-oak', tower: 'none', rise: 12, gable: WIN('curtain-vertical-bronze'), sign: true }],
    ['church-chapel-wood', '礼拝堂 板張り・小さい', { w: 6.5, len: 11, h: 4.2, wall: W('siding-cream'), trim: T('white'), roof: R('shingle-brown'), glass: WIN('stained-amber-limestone'), door: 'door/church-red', tower: 'centre', tw: 2.6, th: 8, spire: 4, rise: 3, sign: true }],
    ['church-chapel-stone', '礼拝堂 石造り・小さい', { w: 7, len: 13, h: 5, wall: W('stone-limestone-rusticated'), trim: T('grey'), roof: R('slate-grey'), glass: WIN('stained-jewel-limestone'), door: 'door/church-oak', rose: WIN('rose-limestone'), tower: 'none', rise: 4.2, buttress: true }],
  ];
  for (const [id, label, o] of CHURCHES) civic(id, label, (b, s) => church(b, { ...o, seed: s }));

  const HOSPITALS: [string, string, Omit<HospitalOpts, 'seed'>][] = [
    ['hospital-general', '総合病院 8階・ヘリポート', { w: 44, floors: 8, podium: 2, wall: W('concrete-panel'), trim: T('white'), win: WIN('band-aluminium'), lobby: WIN('curtain-lobby'), heli: true, er: true }],
    ['hospital-modern', '総合病院 金属パネル・10階', { w: 50, floors: 10, podium: 2, wall: W('metal-panel-white'), trim: T('teal'), win: WIN('band-tall-aluminium'), lobby: WIN('curtain-lobby'), heli: true, er: true, cross: true }],
    ['hospital-brick', '病院 古いレンガ・5階', { w: 38, floors: 5, podium: 1, wall: W('brick-buff'), trim: T('cream'), win: WIN('sash-wide-white'), lobby: WIN('curtain-lobby-black'), heli: false, er: true, cross: true }],
    ['hospital-small', '地域病院 3階', { w: 30, floors: 3, podium: 1, wall: W('stucco-cream'), trim: T('blue'), win: WIN('band-white'), lobby: WIN('curtain-lobby'), heli: false, er: true }],
    ['hospital-ward', '病棟のみ 6階', { w: 40, floors: 6, podium: 1, wall: W('tile-cream'), trim: T('green'), win: WIN('band-aluminium-green'), lobby: WIN('curtain-lobby'), heli: true, er: false }],
  ];
  for (const [id, label, o] of HOSPITALS) civic(id, label, (b, s) => hospital(b, { ...o, seed: s }));

  const GRAND: [string, string, Omit<GrandOpts, 'seed'>][] = [
    ['city-hall-dome', '市役所 列柱とドーム', { w: 30, d: 24, floors: 3, wall: W('stone-limestone'), trim: T('grey'), win: WIN('sash-tall-white'), door: 'door/civic-bronze', sign: 'trim/sign-city-hall', steps: 2.4, cols: 6, crown: 'dome', wings: 18, roofMat: R('seam-copper'), flags: 4 }],
    ['city-hall-tower', '市役所 時計塔', { w: 26, d: 22, floors: 3, wall: W('stone-sandstone'), trim: T('bronze'), win: WIN('tall-black'), door: 'door/civic-bronze', sign: 'trim/sign-city-hall', steps: 1.8, cols: 4, crown: 'tower', wings: 16, roofMat: R('seam-copper'), clock: 'trim/clock-cream', towerH: 18 }],
    ['city-hall-brick', '市役所 レンガ・キューポラ', { w: 24, d: 18, floors: 2, fh: 4.2, wall: W('brick-red-flemish'), trim: T('white'), win: WIN('sash-white'), gap: 1.3, door: 'door/civic-oak', sign: 'trim/sign-city-hall', steps: 1.2, cols: 4, crown: 'cupola', wings: 10, roofMat: R('slate-grey'), roof: 'hip', col: W('stone-marble-white') }],
    ['city-hall-old', '市役所 すすけた石造り', { w: 28, d: 22, floors: 3, wall: W('stone-limestone-sooty'), trim: T('grey'), win: WIN('sash-white-old'), door: 'door/civic-green', sign: 'trim/sign-city-hall', steps: 2, cols: 6, crown: 'tower', roofMat: R('slate-green'), clock: 'trim/clock-black', towerH: 12 }],
    ['courthouse-classical', '裁判所 列柱', { w: 36, d: 24, floors: 3, wall: W('stone-granite-grey'), trim: T('grey'), win: WIN('sash-tall-white'), door: 'door/civic-bronze', sign: 'trim/sign-courthouse', steps: 3, cols: 8, crown: 'none', roofMat: R('slate-grey') }],
    ['courthouse-dome', '裁判所 ドーム', { w: 28, d: 28, floors: 3, wall: W('stone-limestone-rusticated'), trim: T('grey'), win: WIN('arch-white'), door: 'door/civic-oak', sign: 'trim/sign-courthouse', steps: 2.6, cols: 6, crown: 'dome', wings: 14, wingFloors: 2, roofMat: R('seam-green') }],
    ['courthouse-brick', '裁判所 レンガ・郡庁舎', { w: 22, d: 20, floors: 2, wall: W('brick-brown'), trim: T('cream'), win: WIN('arch-wide-brown'), door: 'door/civic-oak', sign: 'trim/sign-courthouse', steps: 1.6, cols: 4, crown: 'tower', roofMat: R('seam-red'), roof: 'hip', clock: 'trim/clock-white', towerH: 10, col: W('stone-limestone') }],
    ['museum-classical', '美術館 列柱', { w: 40, d: 26, floors: 2, fh: 6, wall: W('stone-marble-white'), trim: T('grey'), win: WIN('band-clerestory'), gap: 4, door: 'door/civic-bronze', sign: 'trim/sign-museum-of-art', steps: 2.8, cols: 8, crown: 'none', wings: 16, wingFloors: 1, roofMat: R('seam-copper') }],
    ['museum-dome', '美術館 ドーム', { w: 26, d: 26, floors: 2, fh: 5.6, wall: W('stone-travertine'), trim: T('bronze'), win: WIN('band-clerestory'), gap: 3, door: 'door/civic-bronze', sign: 'trim/sign-museum-of-art', steps: 2, cols: 4, crown: 'dome', wings: 20, wingFloors: 1, roofMat: R('seam-galvanized') }],
    ['university-hall-tower', '大学本館 時計塔', { w: 28, d: 20, floors: 3, fh: 4.2, wall: W('brick-red-flemish'), trim: T('white'), win: WIN('sash-wide-white'), gap: 1.2, door: 'door/civic-oak', sign: 'trim/sign-university-hall', steps: 1.6, cols: 4, crown: 'tower', wings: 26, roofMat: R('slate-grey'), clock: 'trim/clock-cream', towerH: 16, col: W('stone-limestone') }],
    ['university-hall-cupola', '大学本館 キューポラ', { w: 24, d: 18, floors: 3, fh: 4, wall: W('brick-buff'), trim: T('white'), win: WIN('sash-white'), gap: 1.2, door: 'door/civic-green', sign: 'trim/sign-university-hall', steps: 1.4, cols: 6, crown: 'cupola', wings: 22, roofMat: R('slate-green'), roof: 'hip', col: W('stone-marble-white') }],
    ['university-library', '大学図書館 ドーム', { w: 30, d: 30, floors: 3, fh: 4.4, wall: W('stone-sandstone-rusticated'), trim: T('grey'), win: WIN('arch-white'), door: 'door/civic-bronze', sign: 'trim/sign-public-library', steps: 3.2, cols: 8, crown: 'dome', roofMat: R('seam-copper') }],
  ];
  for (const [id, label, o] of GRAND) civic(id, label, (b, s) => grand(b, { ...o, seed: s }));
  const MODERN: [string, string, Omit<HallOpts, 'seed'>][] = [
    ['city-hall-modern', '市役所 モダン・5階', { w: 40, d: 24, floors: 5, fh: 3.9, wall: W('concrete-white'), trim: T('charcoal'), win: WIN('band-tall-black'), gap: 0.2, door: 'door/lobby-black', sign: 'trim/sign-city-hall', steps: 0.9, canopy: true, flagAt: -16 }],
    ['courthouse-modern', '裁判所 コンクリート', { w: 36, d: 26, floors: 4, fh: 4.2, wall: W('concrete-fluted'), trim: T('bronze'), win: WIN('band-bronze'), gap: 0.8, door: 'door/lobby-bronze', sign: 'trim/sign-courthouse', steps: 1.5, canopy: true, flagAt: -15 }],
    ['museum-modern', '美術館 モダン・窓の少ない箱', { w: 38, d: 28, floors: 2, fh: 6.5, wall: W('concrete-boards'), trim: T('charcoal'), win: WIN('band-clerestory'), gap: 5, door: 'door/lobby-black', sign: 'trim/sign-museum-of-art', steps: 0.6, canopy: true }],
    ['university-lab', '大学 研究棟', { w: 44, d: 22, floors: 4, fh: 4, wall: W('metal-panel-silver'), trim: T('charcoal'), win: WIN('band-tall-aluminium'), gap: 0.2, door: 'door/lobby-aluminium', sign: 'trim/sign-university-hall', canopy: true, annex: true }],
    ['university-dorm', '大学 学生寮', { w: 46, d: 15, floors: 4, fh: 3.2, wall: W('brick-red'), trim: T('white'), win: WIN('sash-white'), gap: 1.1, door: 'door/glass-double-white', sign: 'trim/sign-university-hall', steps: 0.6, roof: 'hip', roofMat: R('shingle-charcoal') }],
  ];
  for (const [id, label, o] of MODERN) civic(id, label, (b, s) => { hall(b, { ...o, seed: s }); });

  const side = (d: number): [number, number][] => [[45 + d, 135 - d], [225 + d, 315 - d]];
  const STADIUMS: [string, string, StadiumOpts][] = [
    ['stadium-football', '競技場 フットボール・全周スタンド', { rx: 66, rz: 42, depth: 34, h: 22, seats: 'trim/seats-blue', wall: W('concrete-panel'), field: 'site/turf-lines', fw: 110, fd: 49, roofed: side(0), lights: 4, board: true, sign: 'trim/sign-stadium' }],
    ['stadium-soccer', '競技場 サッカー・屋根つき', { rx: 62, rz: 42, depth: 24, h: 16, seats: 'trim/seats-red', wall: W('concrete-white'), field: 'site/turf-lines', fw: 104, fd: 68, roofed: [[0, 360]], lights: 4, sign: 'trim/sign-stadium' }],
    ['stadium-athletics', '陸上競技場 トラックつき', { rx: 88, rz: 52, depth: 18, h: 11, seats: 'trim/seats-green', wall: W('concrete-exposed'), field: 'ground/grass-mown', fw: 104, fd: 68, track: true, roofed: side(8), lights: 4, board: true, sign: 'trim/sign-stadium' }],
    ['stadium-old', '競技場 古いコンクリート', { rx: 62, rz: 40, depth: 22, h: 13, seats: 'trim/seats-grey-old', wall: W('concrete-panel-stained'), field: 'ground/grass-patchy', fw: 100, fd: 60, lights: 4, board: true }],
    ['stadium-two-stands', '競技場 両側スタンド', { rx: 60, rz: 40, depth: 16, h: 10, seats: 'trim/seats-orange', wall: W('concrete-panel'), field: 'site/turf-lines', fw: 104, fd: 64, arcs: side(4), roofed: [[225, 315]], lights: 4, board: true }],
    ['stadium-school', '学校の競技場 片側スタンド', { rx: 58, rz: 38, depth: 9, h: 6, seats: 'trim/seats-grey-old', wall: W('block-grey'), field: 'site/turf-lines', fw: 100, fd: 52, track: true, arcs: [[232, 308]], lights: 4, board: true }],
    ['stadium-ballpark', '野球場 内野スタンド', { rx: 62, rz: 62, depth: 22, h: 14, seats: 'trim/seats-green', wall: W('brick-red'), field: 'ground/grass-mown', fw: 30, fd: 30, diamond: true, arcs: [[150, 390]], roofed: [[200, 340]], lights: 4, board: true, sign: 'trim/sign-stadium' }],
  ];
  for (const [id, label, o] of STADIUMS) civic(id, label, (b, s) => { weatherBySeed(b, s, o.wall); stadium(b, o); });
  const ARENAS: [string, string, { r: number; h: number; squash: number; wall: string; roof: string; glass: string }][] = [
    ['arena-round', 'アリーナ 円形ドーム', { r: 46, h: 15, squash: 1, wall: W('concrete-white'), roof: R('seam-white'), glass: WIN('curtain-lobby') }],
    ['arena-oval', 'アリーナ 楕円・金属屋根', { r: 54, h: 17, squash: 0.74, wall: W('metal-panel-charcoal'), roof: R('seam-galvanized'), glass: WIN('curtain-lobby-black') }],
    ['arena-small', '市民体育館 円形', { r: 28, h: 10, squash: 1, wall: W('concrete-ribbed'), roof: R('seam-green'), glass: WIN('curtain-lobby') }],
  ];
  for (const [id, label, o] of ARENAS) civic(id, label, (b, s) => arena(b, { ...o, seed: s, sign: 'trim/sign-arena' }));

  // Cemeteries: single markers, rows, tombs and a gate.
  const KINDS = ['板石', '段つき', '十字架', 'オベリスク', '寝石つき', '骨つぼ台'];
  KINDS.forEach((k, i) => civic(`grave-${i + 1}`, `墓石 ${k}`, (b) => grave(b, stand(), i, i)));
  for (let i = 0; i < 3; i++) civic(`grave-old-${i + 1}`, `墓石 傾いた古いもの ${i + 1}`, (b) => grave(b, tilt(turn(stand(), i * 7 - 6), [7, -10, 5][i]), [1, 3, 0][i], 5 - i));
  civic('graves-row', '墓地 1列', (b, s) => graveRow(b, s, 8, 1, false));
  civic('graves-lawn', '墓地 芝生の区画', (b, s) => graveRow(b, s, 10, 4, false));
  civic('graves-old', '墓地 古い区画', (b, s) => graveRow(b, s, 9, 4, true));
  civic('graves-family', '墓地 柵で囲った家族墓', (b, s) => {
    graveRow(b, s, 3, 1, true);
    grave(b, stand([0, 0, -1.2]), 3, 2);
    const c: V3[] = [[-3.4, 0, -2], [3.4, 0, -2], [3.4, 0, 2], [-3.4, 0, 2]];
    for (let i = 0; i < 4; i++) rail(b, 'trim/rail-ornate', c[i], c[(i + 1) % 4], 0.9);
  });
  civic('mausoleum-1', '霊廟 石灰岩', (b, s) => mausoleum(b, s, W('stone-limestone'), 3.4, 4.2, 2));
  civic('mausoleum-2', '霊廟 黒御影・大', (b, s) => mausoleum(b, s, W('stone-granite-grey'), 5, 6, 4));
  civic('mausoleum-3', '霊廟 すすけた石', (b, s) => mausoleum(b, s, W('stone-limestone-sooty'), 3, 3.6, 2));
  civic('cemetery-gate', '墓地の門', (b) => {
    for (const x of [-2.6, 2.6]) {
      box(b, W('stone-limestone-rusticated'), stand([x, 0, 0]), [0, 1.6, 0], [0.45, 1.6, 0.45], 'y');
      box(b, T('grey'), stand([x, 0, 0]), [0, 3.28, 0], [0.55, 0.08, 0.55]);
      rail(b, 'trim/rail-ornate', [x, 0, 0], [x * 3.2, 0, 0], 1.6);
    }
    const arch: V3[] = [];
    for (let i = 0; i <= 12; i++) arch.push([-2.6 + (5.2 * i) / 12, 3.36 + Math.sin((i / 12) * Math.PI) * 1.1, 0]);
    for (let i = 0; i < 12; i++) b.tube('structure/steel-black', arch[i], arch[i + 1], 0.05, 5);
    cross(b, stand([0, 4.46, 0]), 0.8, 'structure/steel-black');
  });
  civic('columbarium', '納骨壁', (b, s) => {
    weatherBySeed(b, s, W('stone-granite-grey'));
    box(b, W('stone-granite-grey'), stand(), [0, 1.2, 0], [4, 1.2, 0.35], 'y');
    box(b, T('grey'), stand(), [0, 2.46, 0], [4.15, 0.06, 0.45]);
    for (const yaw of [0, 180]) for (let i = 0; i < 10; i++) for (let j = 0; j < 4; j++) face(b, `trim/epitaph-${((i * 3 + j) % 4) + 1}`, stand([0, 0, 0], yaw), [(i - 4.5) * 0.76, 0.42 + j * 0.52, 0.36], 0.7, 0.46);
  });

  // Parts that can be put on other buildings.
  civic('part-portico-4', '部品 列柱の玄関 4本', (b) => portico(b, stand(), 12, 4.4, 8, 4, { col: W('stone-limestone'), stone: W('stone-limestone'), roof: R('slate-grey'), base: 1.2 }));
  civic('part-portico-6', '部品 列柱の玄関 6本・大理石', (b) => portico(b, stand(), 17.4, 4.4, 10, 6, { col: W('stone-marble-white'), stone: W('stone-marble-white'), roof: R('seam-copper'), base: 1.8 }));
  civic('part-portico-flat', '部品 列柱の玄関 平らな上部', (b) => portico(b, stand(), 12, 3.6, 6.5, 4, { col: W('stone-sandstone'), stone: W('stone-sandstone'), roof: R('slate-grey'), base: 0.6, flat: true }));
  civic('part-clock-tower-brick', '部品 時計塔 レンガ', (b) => clockTower(b, stand(), 4.5, 16, { wall: W('brick-red'), trim: T('white'), roof: R('seam-copper'), clock: 'trim/clock-cream', belfry: true }));
  civic('part-clock-tower-stone', '部品 時計塔 石造り', (b) => steeple(b, 0, 0, 6, 26, { wall: W('stone-limestone'), trim: T('grey'), roof: R('slate-grey'), spire: 7, cap: 'octagon', clock: 'trim/clock-black' }));
  civic('part-bell-tower', '部品 鐘楼 ミッション', (b) => steeple(b, 0, 0, 4.2, 14, { wall: W('stucco-white'), trim: T('brown'), roof: R('clay-terracotta'), spire: 0, cap: 'dome' }));
  civic('part-steeple', '部品 尖塔 白', (b) => steeple(b, 0, 0, 3.4, 12, { wall: W('siding-white'), trim: T('white'), roof: R('shingle-charcoal'), spire: 9, cap: 'octagon' }));
  civic('part-dome-copper', '部品 ドーム 緑青', (b) => dome(b, stand(), 7, { drum: W('stone-limestone'), roof: R('seam-copper'), drumH: 4.2, lantern: true, glass: 'window/louver-white' }));
  civic('part-dome-grey', '部品 ドーム 亜鉛', (b) => dome(b, stand(), 5, { drum: W('stone-granite-grey'), roof: R('seam-galvanized'), drumH: 3, lantern: false }));
  civic('part-helipad', '部品 屋上ヘリポート', (b) => helipad(b, stand()));
  civic('part-ambulance-bay', '部品 救急車寄せ', (b) => ambulanceBay(b, stand(), 12, 8, 3.9, { trim: T('white'), sign: 'trim/sign-emergency', side: 'trim/sign-ambulance-only' }));
  civic('part-flagpole', '部品 旗竿', (b) => flag(b, stand(), 10));
  civic('part-flagpoles-3', '部品 旗竿 3本', (b) => ['trim/awning-navy', 'trim/awning-burgundy', 'trim/awning-green'].forEach((c, i) => flag(b, stand([(i - 1) * 3, 0, 0]), i === 1 ? 11 : 9.5, c)));
  civic('part-floodlight', '部品 競技場の照明塔', (b) => floodlight(b, stand(), 36));
  civic('part-scoreboard', '部品 得点板', (b) => {
    for (const x of [-5, 5]) box(b, 'structure/steel-grey', stand(), [x, 3, 0], [0.3, 3, 0.3]);
    box(b, T('charcoal'), stand(), [0, 10, 0], [8.3, 4.3, 0.3]);
    face(b, 'trim/scoreboard', stand(), [0, 10, 0.32], 16, 8);
  });
  civic('part-stand-small', '部品 屋根つきスタンド', (b) => bowl(b, stand(), { rx: 40, rz: 20, depth: 10, h: 7, a0: 240, a1: 300, seats: 'trim/seats-blue', wall: W('concrete-panel'), roofed: [[240, 300]] }));
}
