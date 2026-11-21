import { Rand, WINDOW_SIZES, textureSpec } from '../tex';
import { MeshBuilder } from './builder';
import { roofPlant } from './blocks';
import { Opening, flatRoof, pq, pt, row, sides, sign, slab, stoop, wall, weatherBySeed } from './buildkit';
import { RoofKind, roofOn, sillFor } from './houses';
import { Pose, at, box, face, lathe, move, stand, turn } from './kit';
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
export function portico(b: MeshBuilder, f: Pose, w: number, depth: number, h: number, n: number, o: { col: string; stone: string; roof: string; base?: number; flat?: boolean }): void {
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
  if (o.flat) return;
  const [rise, zf, hw] = [w * 0.15, depth + 0.1, w / 2 + 0.1];
  pt(b, o.stone, f, [[-hw, y0, zf], [hw, y0, zf], [0, y0 + rise, zf]], [[0, 0], [2 * hw, 0], [hw, rise]]);
  const run = Math.hypot(hw + 0.2, rise);
  pq(b, o.roof, f, [[-hw - 0.2, y0, zf + 0.2], [0, y0 + rise + 0.06, zf + 0.2], [0, y0 + rise + 0.06, 0], [-hw - 0.2, y0, 0]], [[0, 0], [run, 0], [run, zf], [0, zf]]);
  pq(b, o.roof, f, [[0, y0 + rise + 0.06, zf + 0.2], [hw + 0.2, y0, zf + 0.2], [hw + 0.2, y0, 0], [0, y0 + rise + 0.06, 0]], [[0, 0], [run, 0], [run, zf], [0, zf]]);
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
    portico(b, move(front, 0, 0, 0), pw, 4.2, ph, o.portico, { col: o.col ?? 'wall/stone-limestone', stone: o.col ?? 'wall/stone-limestone', roof: o.roofMat ?? 'roof/slate-grey', base: lift });
    nameBoard(b, move(front, 0, lift + 4.6, 0), o.sign, Math.min(1.3, pw / 6));
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
}
