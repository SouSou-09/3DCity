import { Rand, textureSpec } from '../tex';
import { MeshBuilder } from './builder';
import { acUnit, antenna, awning, balcony, barrel, billboard, blade, chimney, duct, flatRoof, Opening, sawtooth, sides, sign, skylight, stoop, vent, wall, waterTank, weatherBySeed } from './buildkit';
import { block, roofPlant } from './blocks';
import { RoofOpts, roofOn, spread } from './houses';
import { box, face, lathe, pipe, stand } from './kit';
import { addModel } from './registry';

const W = (c: string): string => `wall/${c}`;
const T = (c: string): string => `trim/paint-${c}`;
const D = (c: string): string => `door/${c}`;
const WIN = (c: string): string => `window/${c}`;

/** Four walls of a box, front first, each with its own openings. */
function shell(b: MeshBuilder, cx: number, cz: number, w: number, d: number, h: number, mat: string, holes: Opening[][] = [], y = 0): void {
  sides(cx, cz, w, d, y).forEach((s, i) => wall(b, mat, s.f, s.w, h, holes[i] ?? [], 0, y));
}
/** Door-sized openings, scaled to `w` wide, spread along a wall. */
const doors = (rnd: Rand, x0: number, x1: number, tex: string | string[], y: number, n: number, w?: number, extra: Partial<Opening> = {}): Opening[] => {
  const list = Array.isArray(tex) ? tex : [tex];
  const [mw, mh] = textureSpec(list[0]).meters;
  const k = (w ?? mw) / mw;
  return spread(rnd, x0, x1, list[0], y, { w: mw * k, h: mh * k, depth: 0.12, ...extra }, n, 0.6).map((q) => ({ ...q, tex: rnd.pick(list) }));
};
/** A long strip window, as one opening. */
const band = (x0: number, x1: number, y: number, tex: string, v = 0): Opening => ({ x: x0, y, w: x1 - x0, h: textureSpec(tex).meters[1], tex, v, depth: 0.1 });

interface WarehouseOpts {
  seed: number;
  w: number;
  d: number;
  h: number;
  wall: string;
  trim: string;
  dock: string[];
  docks: number;
  /** Width of the office corner with strip windows; 0 for none. */
  office?: number;
  roof: RoofOpts['kind'] | 'sawtooth' | 'barrel';
  roofMat: string;
  rise?: number;
  glass?: string;
  stripe?: string;
  stack?: number;
  windows?: string;
  shutters?: string[];
}
function warehouse(b: MeshBuilder, o: WarehouseOpts): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const { w, d, h } = o;
  const off = o.office ?? 0;
  const front: Opening[] = [];
  const dockY = o.shutters ? 0.05 : 1.2;
  if (off > 0) {
    front.push({ x: 1, y: 0.05, w: 1.8, h: 2.15, tex: D('glass-double-aluminium'), depth: 0.15 }, band(3.4, off - 0.6, 0.9, WIN('band-aluminium'), 1));
    if (h > 7) front.push(band(1, off - 0.6, 4.3, WIN('band-aluminium'), 3));
    awning(b, stand([-w / 2 + 1.9, 2.4, d / 2]), 2.6, 1.2, 0.12, o.trim, true, 0.12);
  }
  front.push(...(o.shutters ? doors(rnd, off + 1, w - 1, o.shutters, dockY, o.docks, 3.6) : doors(rnd, off + 1, w - 1, o.dock, dockY, o.docks)));
  const sideHoles = (len: number): Opening[] => (o.windows ? [band(1.5, len - 1.5, h - textureSpec(o.windows).meters[1] - 1, o.windows, rnd.int(0, 3))] : []);
  const back: Opening[] = [{ x: 2, y: 0.05, w: 0.9, h: 2.1, tex: D('steel-grey'), depth: 0.08 }, ...(o.windows ? sideHoles(w) : [])];
  shell(b, 0, 0, w, d, h, o.wall, [front, [{ x: d - 3, y: 0.05, w: 0.9, h: 2.1, tex: D(rnd.pick(['steel-blue', 'steel-grey-tagged', 'steel-beige'])), depth: 0.08 }, ...sideHoles(d - 4)], back, sideHoles(d)]);
  if (!o.shutters) for (const q of front.filter((p) => p.y > 1)) {
    // Dock bumpers and a canopy over each door.
    for (const s of [-1, 1]) box(b, T('black'), stand([-w / 2 + q.x + q.w / 2 + s * (q.w / 2 - 0.15), 0, d / 2]), [0, 0.95, 0.06], [0.1, 0.22, 0.06]);
    box(b, o.trim, stand([-w / 2 + q.x + q.w / 2, 0, d / 2]), [0, q.y + q.h + 0.3, 0.5], [q.w / 2 + 0.3, 0.05, 0.5]);
  }
  if (o.stripe) for (const s of sides(0, 0, w, d, h - 1.4)) box(b, o.stripe, s.f, [s.w / 2, 0, 0.01], [s.w / 2 + 0.01, 0.35, 0.012]);
  const rise = o.rise ?? w * 0.08;
  if (o.roof === 'sawtooth') sawtooth(b, stand([0, h, 0]), w, d, { mat: o.roofMat, glass: o.glass ?? WIN('steel-wide-black'), wall: o.wall, n: Math.max(2, Math.round(d / 8)), rise: 2.6 });
  else if (o.roof === 'barrel') barrel(b, stand([0, h, 0], 90), d, w, { mat: o.roofMat, end: o.wall, rise });
  else if (o.roof === 'flat') {
    for (const s of sides(0, 0, w, d, h)) wall(b, o.wall, s.f, s.w, 0.8, [], 0, h);
    flatRoof(b, 0, 0, w, d, h, { mat: o.roofMat, parapet: 0.8, inner: o.wall, coping: o.trim });
    const [nx, nz] = [Math.floor(w / 9), Math.floor(d / 9)];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const p = stand([(i - (nx - 1) / 2) * 9, h, (j - (nz - 1) / 2) * 9]);
      if ((i + j) % 2 === 0) skylight(b, p, 1.2, 2.4, rnd.chance(0.3));
      else if (rnd.chance(0.5)) acUnit(b, p, rnd.int(1, 2));
      else if (rnd.chance(0.5)) vent(b, p, rnd.int(0, 2), 1.4);
    }
  } else {
    roofOn(b, 0, 0, h, w, d, { roof: o.roofMat, kind: o.roof, rise, trim: o.trim, wall: o.wall, over: 0.25 });
    for (let i = 0; i < Math.floor(d / 8); i++) vent(b, stand([0, h + rise - 0.1, -d / 2 + 4 + i * 8]), 1, 1.6);
  }
  if (o.stack) {
    const [x, z, r] = [w / 2 + 2.4, -d / 2 + 3, 1.1];
    lathe(b, W('brick-red-common'), stand([x, 0, z]), [[r * 1.25, 0], [r * 1.25, 1.2], [r, 1.5], [r * 0.62, o.stack - 0.6], [r * 0.7, o.stack - 0.4], [r * 0.7, o.stack], [r * 0.45, o.stack]], 12);
    box(b, W('brick-red-common'), stand([w / 2 + 1, 0, z]), [0, 1.2, 0], [1.2, 1.2, 1]);
  }
}

/** Half-cylinder hut of corrugated iron standing straight on the ground. */
function quonset(b: MeshBuilder, o: { seed: number; w: number; d: number; mat: string; end: string; door: string }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  box(b, 'structure/wall-smooth', stand(), [0, 0.12, 0], [o.w / 2 + 0.1, 0.12, o.d / 2 + 0.1]);
  barrel(b, stand([0, 0.24, 0], 90), o.d, o.w, { mat: o.mat, end: o.end, rise: o.w / 2, segs: 16 });
  const dw = Math.min(3.6, o.w * 0.4);
  face(b, o.door, stand([0, 0, o.d / 2 + 0.04]), [0, 0.24 + dw / 2, 0], dw, dw);
  box(b, T('charcoal'), stand([0, 0, o.d / 2 + 0.03]), [0, 0.24 + dw + 0.06, 0], [dw / 2 + 0.08, 0.06, 0.04]);
  face(b, D('steel-grey'), stand([dw / 2 + 1, 0, o.d / 2 + 0.04]), [0, 0.24 + 1.05, 0], 0.9, 2.1);
  for (let i = 0; i < 2; i++) vent(b, stand([0, 0.2 + o.w / 2, (i - 0.5) * o.d * 0.5]), 1, 1.2);
  if (rnd.chance(0.5)) face(b, WIN('steel-wide-black'), stand([0, 0, o.d / 2 + 0.04]), [0, 0.24 + dw + 1.0, 0], Math.min(3, o.w * 0.3), 0.9, [0, 0, 3, 1.4]);
}

/** Rows of roll-up doors along both long sides. */
function storage(b: MeshBuilder, o: { seed: number; n: number; wall: string; trim: string; doors: string[]; roof: string; floors: number }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const [w, d, fh] = [o.n * 3.2 + 0.8, 9, 3];
  const h = fh * o.floors;
  const rowOf = (y: number): Opening[] => Array.from({ length: o.n }, (_, i) => ({ x: 0.8 + i * 3.2, y, w: 2.4, h: 2.4, tex: rnd.pick(o.doors), depth: 0.1, frame: o.trim }));
  const up: Opening[] = o.floors > 1 ? [band(1, w - 1, fh + 0.9, WIN('band-clerestory'), 1)] : [];
  shell(b, 0, 0, w, d, h, o.wall, [[...rowOf(0.05), ...up], [], [...rowOf(0.05), ...up], [{ x: d / 2 - 0.9, y: 0.05, w: 1.8, h: 2.1, tex: D('steel-double-grey'), depth: 0.1 }]]);
  for (const s of sides(0, 0, w, d, h - 0.5)) box(b, o.trim, s.f, [s.w / 2, 0, 0.01], [s.w / 2 + 0.01, 0.3, 0.012]);
  roofOn(b, 0, 0, h, w, d, { roof: o.roof, kind: o.floors > 1 ? 'flat' : 'gable', rise: 0.7, trim: o.trim, wall: o.wall, over: 0.5 });
}

/** Storage tanks and silos on a concrete pad. */
function tanks(b: MeshBuilder, o: { seed: number; n: number; r: number; h: number; mat: string; cone?: boolean; legs?: boolean }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const pitch = o.r * 2 + 0.8;
  box(b, 'structure/wall-smooth', stand(), [0, 0.1, 0], [(o.n * pitch) / 2 + 0.6, 0.1, o.r + 1]);
  for (let i = 0; i < o.n; i++) {
    const x = (i - (o.n - 1) / 2) * pitch;
    const y0 = o.legs ? 2.6 : 0.2;
    const r = o.r;
    const prof: [number, number][] = o.legs ? [[0.25, y0 - 1.6], [r, y0], [r, y0 + o.h], [r * 0.2, y0 + o.h + r * 0.5], [0, y0 + o.h + r * 0.5]] : o.cone ? [[r, y0], [r, y0 + o.h], [0, y0 + o.h + r * 0.35]] : [[r, y0], [r, y0 + o.h], [r * 0.96, y0 + o.h + 0.12], [0, y0 + o.h + 0.3]];
    lathe(b, o.mat, stand([x, 0, 0]), prof, 20);
    if (o.legs) for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) * (Math.PI / 2);
      pipe(b, T('galvanized'), [[x + Math.cos(a) * r * 0.9, 0.2, Math.sin(a) * r * 0.9], [x + Math.cos(a) * r * 0.9, y0 + 0.4, Math.sin(a) * r * 0.9]], 0.09, 6);
    }
    // Ladder with hoops, and a rail round the top.
    const top = y0 + o.h;
    for (const s of [-0.22, 0.22]) pipe(b, T('galvanized'), [[x + s, 0.2, r + 0.12], [x + s, top + 1, r + 0.12]], 0.025, 5, false);
    for (let yy = 0.6; yy < top + 0.9; yy += 0.45) b.beam(T('galvanized'), [x - 0.22, yy, r + 0.12], [x + 0.22, yy, r + 0.12], 0.03, 0.03);
    if (i + 1 < o.n) pipe(b, T(rnd.pick(['galvanized', 'yellow', 'rust'])), [[x + r * 0.7, top + 0.2, 0], [x + r * 0.7, top + 0.9, 0], [x + pitch - r * 0.7, top + 0.9, 0], [x + pitch - r * 0.7, top + 0.2, 0]], 0.1, 8);
  }
}

/** Filling station: canopy over pump islands, with a kiosk behind. */
function gasStation(b: MeshBuilder, o: { seed: number; canopy: string; islands: number; kiosk: string; trim: string; sign: string; shop: string; pump: string }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const [cw, cd, ch] = [o.islands * 7 + 3, 9, 5.2];
  const cz = 9;
  box(b, T('white'), stand(), [0, ch + 0.45, cz], [cw / 2, 0.45, cd / 2]);
  for (const s of sides(0, cz, cw + 0.02, cd + 0.02, ch)) face(b, o.canopy, s.f, [s.w / 2, 0.45, 0], s.w, 0.9, [0, 0, s.w, 0.9]);
  box(b, T('white'), stand(), [0, ch - 0.02, cz], [cw / 2 - 0.3, 0.02, cd / 2 - 0.3]);
  for (let i = 0; i < o.islands; i++) {
    const x = (i - (o.islands - 1) / 2) * 7;
    box(b, 'structure/wall-smooth', stand(), [x, 0.1, cz], [0.6, 0.1, 3]);
    box(b, T('white'), stand(), [x, ch / 2, cz], [0.22, ch / 2, 0.22]);
    for (const s of [-1.5, 1.5]) {
      box(b, T('white'), stand(), [x, 0.95, cz + s], [0.28, 0.75, 0.45]);
      box(b, o.pump, stand(), [x, 1.85, cz + s], [0.3, 0.16, 0.48]);
      box(b, T('black'), stand(), [x, 1.3, cz + s], [0.29, 0.22, 0.3]);
      for (const q of [-1, 1]) box(b, T('yellow'), stand(), [x, 0.5, cz + s * 1.75 + q * 0.0], [0.07, 0.5, 0.07]);
    }
    box(b, T('black'), stand(), [x, 0.6, cz - 2.7], [0.25, 0.4, 0.2]);
  }
  // Kiosk.
  const [kw, kd, kh] = [Math.max(10, cw * 0.7), 7, 3.9];
  const kz = -1;
  const sb = 2;
  const n = Math.floor((kw - 3) / sb);
  shell(b, 0, kz, kw, kd, kh, o.kiosk, [[{ x: 0.6, y: 0.05, w: n * sb, h: 3, tex: o.shop, v: rnd.int(0, 3), depth: 0.1 }, { x: kw - 1.6, y: 0.05, w: 0.95, h: 2.15, tex: D('glass-aluminium'), depth: 0.1 }], [], [{ x: 1, y: 0.05, w: 0.9, h: 2.1, tex: D('steel-grey'), depth: 0.08 }], []]);
  for (const s of sides(0, kz, kw, kd, kh)) wall(b, o.kiosk, s.f, s.w, 0.6, [], 0, kh);
  flatRoof(b, 0, kz, kw, kd, kh, { mat: 'roof/flat-membrane-dirty', parapet: 0.6, inner: o.kiosk, coping: o.trim });
  sign(b, stand([0, kh - 0.25, kz + kd / 2]), 4.8, 0.9, o.sign);
  acUnit(b, stand([kw / 4, kh, kz]), 1);
  // Price sign on a pole.
  const px = cw / 2 + 2;
  box(b, T('white'), stand(), [px, 3.2, cz + 5], [0.15, 3.2, 0.15]);
  box(b, o.pump, stand(), [px, 7.2, cz + 5], [1.3, 0.9, 0.18]);
  box(b, T('black'), stand(), [px, 5.6, cz + 5], [1.1, 0.6, 0.14]);
}

/** Free-standing shop with glazing all round: fast food, diners and banks. */
function pavilion(b: MeshBuilder, o: { seed: number; w: number; d: number; h: number; wall: string; trim: string; win: string; door: string; roof: RoofOpts['kind']; roofMat: string; rise: number; sign?: string; pole?: string; stripe?: string; blade?: string; columns?: number; lift?: number; drive?: boolean }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const { w, d, h } = o;
  const lift = o.lift ?? 0;
  const wh = textureSpec(o.win).meters[1];
  const [dw, dh] = textureSpec(o.door).meters;
  const sill = lift + Math.min(1, h - lift - wh - 0.4);
  const front: Opening[] = [{ x: w / 2 - dw / 2, y: lift + 0.03, w: dw, h: dh, tex: o.door, depth: 0.15, frame: o.trim }];
  if (w / 2 - dw / 2 - 1.4 > 1.2) front.push(band(0.7, w / 2 - dw / 2 - 0.7, sill, o.win, 0), band(w / 2 + dw / 2 + 0.7, w - 0.7, sill, o.win, 2));
  shell(b, 0, 0, w, d, h, o.wall, [front, [band(0.8, d - 0.8, sill, o.win, 1)], [{ x: 1, y: lift + 0.03, w: 0.9, h: 2.1, tex: D('steel-brown'), depth: 0.08 }], [band(0.8, d * 0.6, sill, o.win, 3), ...(o.drive ? [{ x: d * 0.6 + 1, y: lift + 1, w: 1.2, h: 1.2, tex: WIN('slider-white'), depth: 0.1, sill: o.trim }] : [])]]);
  if (o.stripe) for (const s of sides(0, 0, w, d, h - 0.5)) box(b, o.stripe, s.f, [s.w / 2, 0, 0.02], [s.w / 2 + 0.02, 0.22, 0.03]);
  if (lift > 0.1) stoop(b, stand([0, 0, d / 2 + (o.columns ? 2.2 : 0)]), dw + (o.columns ? 6 : 1.2), lift, { landing: o.columns ? 0.4 : 1, mat: 'structure/wall-smooth' });
  if (o.columns) {
    // Portico: columns under a pediment.
    const pw = (o.columns - 1) * 1.9 + 1.4;
    box(b, 'structure/wall-smooth', stand(), [0, lift / 2, d / 2 + 1.1], [pw / 2, lift / 2, 1.1]);
    for (let i = 0; i < o.columns; i++) {
      const x = (i - (o.columns - 1) / 2) * 1.9;
      lathe(b, o.trim, stand([x, lift, d / 2 + 1.7]), [[0.36, 0], [0.36, 0.15], [0.27, 0.25], [0.23, h - lift - 0.35], [0.33, h - lift - 0.2], [0.33, h - lift]], 12);
    }
    box(b, o.trim, stand(), [0, h + 0.3, d / 2 + 1.1], [pw / 2 + 0.1, 0.3, 1.2]);
    b.tri(o.wall, [-pw / 2 - 0.1, h + 0.6, d / 2 + 2.3], [pw / 2 + 0.1, h + 0.6, d / 2 + 2.3], [0, h + 0.6 + pw * 0.16, d / 2 + 2.3], [[0, 0], [pw, 0], [pw / 2, pw * 0.16]]);
    b.quad(o.roofMat, [-pw / 2 - 0.1, h + 0.6, d / 2 + 2.3], [0, h + 0.6 + pw * 0.16, d / 2 + 2.3], [0, h + 0.6 + pw * 0.16, d / 2], [-pw / 2 - 0.1, h + 0.6, d / 2]);
    b.quad(o.roofMat, [0, h + 0.6 + pw * 0.16, d / 2 + 2.3], [pw / 2 + 0.1, h + 0.6, d / 2 + 2.3], [pw / 2 + 0.1, h + 0.6, d / 2], [0, h + 0.6 + pw * 0.16, d / 2]);
  }
  roofOn(b, 0, 0, h, w, d, { roof: o.roofMat, kind: o.roof, rise: o.rise, trim: o.trim, wall: o.wall, over: 0.5 });
  const top = h + (o.roof === 'flat' ? 0.45 : o.roof === 'mansard' ? o.rise : 0);
  if (o.roof === 'flat' || o.roof === 'mansard') {
    acUnit(b, stand([w / 5, o.roof === 'flat' ? h : top, -d / 5]), 1);
    vent(b, stand([-w / 5, o.roof === 'flat' ? h : top, -d / 4]), 2, 1.3);
    duct(b, stand([0, o.roof === 'flat' ? h : top, d / 6]), Math.min(3, w / 3));
  }
  if (o.sign) sign(b, stand([0, o.roof === 'mansard' ? h + o.rise * 0.5 : h - 0.15, d / 2 + (o.roof === 'mansard' ? 0.25 : 0)]), 4.8, 0.9, o.sign);
  if (o.blade) blade(b, stand([-w / 2 + 0.5, h - 0.4, d / 2]), o.blade);
  if (o.pole) billboard(b, stand([w / 2 + 3, 0, d / 2 + 2], rnd.range(-20, 20)), o.pole, 6.5, 0.45);
}

/** Retail shed with a tall entrance feature and a long blank front. */
function bigBox(b: MeshBuilder, o: { seed: number; w: number; d: number; wall: string; trim: string; stripe: string; sign: string; feature: string }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const { w, d } = o;
  const h = 8.5;
  const [ew, eh, ed] = [16, 11, 3];
  shell(b, 0, 0, w, d, h, o.wall, [[], [{ x: d - 6, y: 1.2, w: 2.7, h: 3, tex: D('dock-grey'), depth: 0.12 }, { x: d - 10, y: 1.2, w: 2.7, h: 3, tex: D('dock-white'), depth: 0.12 }], [{ x: 3, y: 0.05, w: 1.8, h: 2.1, tex: D('steel-double-grey'), depth: 0.1 }], []]);
  for (const s of sides(0, 0, w, d, 5.6)) box(b, o.stripe, s.f, [s.w / 2, 0, 0.012], [s.w / 2 + 0.012, 0.45, 0.014]);
  for (const s of sides(0, 0, w, d, h)) wall(b, o.wall, s.f, s.w, 0.9, [], 0, h);
  flatRoof(b, 0, 0, w, d, h, { mat: 'roof/flat-membrane-white', parapet: 0.9, inner: o.wall, coping: o.trim });
  roofPlant(b, rnd, 0, 0, w - 6, d - 6, h, 1.4, { wall: o.wall, big: true });
  const ez = d / 2 + ed / 2;
  shell(b, 0, ez, ew, ed, eh, o.feature, [[{ x: 2, y: 0.05, w: 12, h: 4.8, tex: 'window/curtain-lobby', depth: 0.25, reveal: o.trim }]]);
  flatRoof(b, 0, ez, ew, ed, eh - 0.6, { mat: 'roof/flat-membrane-white', parapet: 0.6, inner: o.feature, coping: o.trim });
  sign(b, stand([0, 7.6, ez + ed / 2]), 12, 2.25, o.sign, 0.25);
  box(b, o.trim, stand(), [0, 5.05, ez + ed / 2 + 1.2], [7, 0.1, 1.2]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box(b, T('yellow'), stand(), [s * (2 + i * 2), 0.5, ez + ed / 2 + 2.8], [0.09, 0.5, 0.09]);
}

/** Two-storey apartment house with the flats raised over open parking. */
function dingbat(b: MeshBuilder, o: { seed: number; w: number; d: number; wall: string; trim: string; win: string; accent: string; rail: string }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const { w, d } = o;
  const [gh, fh] = [2.7, 2.9];
  const rear = d * 0.5;
  shell(b, 0, -d / 2 + rear / 2, w, rear, gh, o.wall, [[...doors(rnd, 1, w - 1, [D('front-brown-1'), D('front-white-2'), D('front-teal-2')], 0.03, 2)], [], [{ x: 1, y: 0.05, w: 0.9, h: 2.1, tex: D('steel-grey'), depth: 0.08 }], []]);
  box(b, T('white-old'), stand(), [0, gh - 0.1, d / 2 - (d - rear) / 2], [w / 2 - 0.02, 0.1, (d - rear) / 2]);
  for (let i = 0; i <= 3; i++) pipe(b, T('white'), [[-w / 2 + 0.25 + (i * (w - 0.5)) / 3, 0, d / 2 - 0.3], [-w / 2 + 0.25 + (i * (w - 0.5)) / 3, gh, d / 2 - 0.3]], 0.07, 8);
  const front = spread(rnd, 1, w - 1, o.win, 0.9, { sill: o.trim, depth: 0.1 }, 3);
  shell(b, 0, 0, w, d, fh + 0.5, o.wall, [front, spread(rnd, 1, d - 1, o.win, 0.9, { sill: o.trim, depth: 0.1 }, 3), spread(rnd, 1, w - 1, o.win, 0.9, { sill: o.trim, depth: 0.1 }, 2), [...spread(rnd, 4, d - 1, o.win, 0.9, { sill: o.trim, depth: 0.1 }, 2), { x: 1.5, y: 0.03, w: 0.9, h: 2.1, tex: D('front-white-2'), depth: 0.1 }]], gh);
  flatRoof(b, 0, 0, w, d, gh + fh, { mat: 'roof/flat-bitumen-silver', parapet: 0.5, inner: o.wall, coping: o.trim });
  // Period ornament on the street front: an accent panel with a starburst of rods.
  box(b, o.accent, stand(), [-w / 4, gh + fh * 0.55, d / 2 + 0.03], [w * 0.16, fh * 0.42, 0.03]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.beam(T('black'), [-w / 4, gh + fh * 0.55, d / 2 + 0.09], [-w / 4 + Math.cos(a) * 0.7, gh + fh * 0.55 + Math.sin(a) * 0.7, d / 2 + 0.09], 0.03, 0.03);
  }
  // Side stair to the upper flats.
  balcony(b, stand([-w / 2, gh - 0.02, -d / 2 + (d - 1.5) - 0.9], 270), 2, 1.1, { rail: o.rail });
  stoop(b, stand([-w / 2 - 0.55, 0, -d / 2 + d - 2.9 + 1.2]), 1, gh - 0.1, { landing: 0, rail: o.rail, mat: 'structure/wall-smooth' });
  roofPlant(b, rnd, 0, 0, w - 1, d - 1, gh + fh, 1, { wall: o.wall });
}

/** Two-storey range of rooms reached from an outside walkway. */
function motel(b: MeshBuilder, o: { seed: number; units: number; wall: string; trim: string; win: string; doors: string[]; rail: string; roof: RoofOpts['kind']; roofMat: string; blade?: string }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, (o as { wall?: string }).wall);
  const [uw, d, fh] = [3.8, 8, 2.9];
  const w = o.units * uw;
  const front: Opening[] = [];
  const size = textureSpec(o.win).meters;
  const ww = Math.min(1.8, size[0]);
  for (let f = 0; f < 2; f++) for (let i = 0; i < o.units; i++) {
    front.push({ x: i * uw + 0.5, y: f * fh + 0.03, w: 0.9, h: 2.1, tex: rnd.pick(o.doors), depth: 0.1, frame: o.trim });
    front.push(...spread(rnd, i * uw + 1.6, (i + 1) * uw - 0.2, o.win, f * fh + 0.9, { sill: o.trim, depth: 0.1 }, 1, 0.1));
  }
  void ww;
  const back: Opening[] = [];
  for (let f = 0; f < 2; f++) back.push(...spread(rnd, 1, w - 1, WIN('frosted-aluminium'), f * fh + 1.5, { depth: 0.08 }, o.units));
  shell(b, 0, 0, w, d, fh * 2, o.wall, [front, [], back, []]);
  // Walkway, posts and stairs at both ends.
  box(b, 'structure/wall-smooth', stand(), [0, fh - 0.09, d / 2 + 0.75], [w / 2, 0.09, 0.75]);
  for (let i = 0; i <= o.units; i++) pipe(b, o.trim, [[-w / 2 + i * uw + (i === 0 ? 0.1 : i === o.units ? -0.1 : 0), 0, d / 2 + 1.4], [-w / 2 + i * uw + (i === 0 ? 0.1 : i === o.units ? -0.1 : 0), fh * 2 - 0.1, d / 2 + 1.4]], 0.06, 8);
  balcony(b, stand([0, fh - 0.2, d / 2 + 0.35]), w - 0.1, 1.1, { rail: o.rail });
  stoop(b, stand([w / 2 + 0.6, 0, d / 2 + 1.5 - 0.0], 0), 1.1, fh - 0.15, { landing: 0, rail: o.rail, mat: 'structure/wall-smooth' });
  if (o.roof === 'flat') {
    for (const s of sides(0, 0, w, d, fh * 2)) wall(b, o.wall, s.f, s.w, 0.45, [], 0, fh * 2);
    flatRoof(b, 0, 0, w, d, fh * 2, { mat: o.roofMat, parapet: 0.45, inner: o.wall, coping: o.trim });
    box(b, o.trim, stand(), [0, fh * 2 - 0.08, d / 2 + 0.8], [w / 2, 0.08, 0.8]);
    for (let i = 0; i < o.units; i += 2) acUnit(b, stand([-w / 2 + (i + 0.5) * uw, fh * 2, 0]), 0, true);
  } else roofOn(b, 0, 0.8, fh * 2, w, d + 1.6, { roof: o.roofMat, kind: o.roof, rise: 1.5, trim: o.trim, wall: o.wall, over: 0.35 });
  if (o.blade) blade(b, stand([-w / 2 + 0.2, fh * 2 - 0.3, d / 2], 0), o.blade, 1.2);
}

export function addWorks(): void {
  let seed = 11200;
  const next = (): number => (seed += 19);
  const add = <O extends { seed: number }>(cat: 'industrial' | 'shop' | 'apartment', id: string, label: string, fn: (b: MeshBuilder, o: O) => void, o: Omit<O, 'seed'>): void => {
    const s = next();
    addModel(cat, id, label, (b) => fn(b, { ...o, seed: s } as O));
  };

  const DOCKS = ['dock-white', 'dock-white-2', 'dock-grey', 'dock-blue', 'dock-green', 'dock-white-tagged', 'dock-orange', 'dock-rusty'].map(D);
  const SHUT = ['shutter-steel', 'shutter-steel-tagged', 'shutter-steel-rusty', 'shutter-white', 'shutter-grey', 'shutter-grey-tagged', 'shutter-green', 'shutter-blue', 'shutter-brown', 'shutter-red', 'shutter-black', 'shutter-yellow'].map(D);
  // Tilt-up distribution warehouses with dock doors.
  ([['concrete-tiltup', 'grey', 'blue', 48, 30, 8], ['concrete-white', 'white', 'red', 60, 36, 10], ['concrete-panel', 'charcoal', '', 36, 24, 5], ['metal-panel-white', 'aluminium', 'green', 54, 30, 9], ['concrete-panel-stained', 'grey', 'orange', 42, 28, 6], ['metal-ribbed-beige', 'brown', '', 40, 26, 6]] as [string, string, string, number, number, number][])
    .forEach(([wl, tr, st, w, d, n], i) => add('industrial', `warehouse-${i + 1}`, `物流倉庫(ドックつき) ${i + 1}`, warehouse, {
      w, d, h: 9 + (i % 2), wall: W(wl), trim: T(tr), dock: DOCKS.slice(i % 4, (i % 4) + 3), docks: n, office: 9 + (i % 3) * 2, roof: 'flat', roofMat: i % 2 ? 'roof/flat-membrane-dirty' : 'roof/flat-membrane-white', ...(st ? { stripe: T(st) } : {}),
    }));
  // Steel-clad sheds.
  ([['metal-corrugated-galvanized', 'galvanized', 'corrugated-galvanized', 16, 24], ['metal-corrugated-rusty', 'rust', 'corrugated-rusty', 12, 18], ['metal-corrugated-blue', 'white', 'seam-galvanized', 22, 30], ['metal-ribbed-grey', 'charcoal', 'seam-grey', 18, 36],
    ['metal-corrugated-green', 'white', 'seam-green', 14, 20], ['metal-ribbed-white', 'blue', 'seam-blue', 26, 34], ['metal-corrugated-red', 'white', 'seam-white', 12, 16], ['metal-ribbed-galvanized', 'galvanized', 'seam-rusty', 20, 26]] as [string, string, string, number, number][])
    .forEach(([wl, tr, rf, w, d], i) => add('industrial', `shed-${i + 1}`, `鉄板張りの工場・作業場 ${i + 1}`, warehouse, {
      w, d, h: 5 + (i % 3), wall: W(wl), trim: T(tr), dock: DOCKS, docks: 1 + (i % 3), shutters: SHUT.slice(i, i + 3), roof: 'gable-front', roofMat: `roof/${rf}`, rise: w * 0.12, ...(i % 2 ? { windows: WIN('steel-wide-black') } : {}), ...(i % 4 === 3 ? { office: 6 } : {}),
    }));
  // Brick factories with north-light roofs.
  ([['brick-red-common', 'steel-black', 'steel-wide-black', 30, 32, 26], ['brick-brown-common', 'steel-green', 'steel-wide-rusty', 24, 24, 0], ['brick-buff-sooty', 'steel-rusty', 'steel-wide-rusty', 36, 40, 32], ['brick-painted-white-peeling', 'steel-white', 'steel-wide-black', 20, 24, 0]] as [string, string, string, number, number, number][])
    .forEach(([wl, wn, gl, w, d, st], i) => add('industrial', `sawtooth-${i + 1}`, `のこぎり屋根のレンガ工場 ${i + 1}`, warehouse, {
      w, d, h: 6.5, wall: W(wl), trim: T('charcoal'), dock: DOCKS, docks: 2, shutters: [D('shutter-steel-rusty'), D('shutter-green'), D('shutter-brown')], roof: 'sawtooth', roofMat: i % 2 ? 'roof/corrugated-rusty' : 'roof/corrugated-galvanized', glass: WIN(gl), windows: WIN(wn), ...(st ? { stack: st } : {}),
    }));
  // Vaulted sheds and Quonset huts.
  ([['block-grey', 'seam-galvanized', 24, 30], ['brick-red-common', 'corrugated-rusty', 18, 26], ['concrete-panel', 'seam-white', 30, 40]] as [string, string, number, number][])
    .forEach(([wl, rf, w, d], i) => add('industrial', `vault-${i + 1}`, `かまぼこ屋根の倉庫 ${i + 1}`, warehouse, { w, d, h: 5, wall: W(wl), trim: T('grey'), dock: DOCKS, docks: 2, shutters: SHUT.slice(i * 2, i * 2 + 2), roof: 'barrel', roofMat: `roof/${rf}`, rise: w * 0.22, windows: WIN('steel-wide-black') }));
  ([['corrugated-galvanized', 'metal-corrugated-galvanized', 9, 16], ['corrugated-rusty', 'metal-corrugated-rusty', 7, 12], ['corrugated-galvanized', 'wood-dark', 12, 22]] as [string, string, number, number][])
    .forEach(([rf, en, w, d], i) => add('industrial', `quonset-${i + 1}`, `かまぼこ兵舎型の小屋 ${i + 1}`, quonset, { w, d, mat: `roof/${rf}`, end: W(en), door: SHUT[i * 3] }));
  // Multi-storey brick mills.
  ([['brick-red-common', 'steel-loft-black', 5, 24, 30], ['brick-brown-common', 'steel-loft-black', 4, 30, 22], ['brick-buff-sooty', 'steel-loft-black', 6, 20, 26], ['brick-painted-white-peeling', 'steel-loft-black', 3, 36, 24]] as [string, string, number, number, number][])
    .forEach(([wl, wn, fl, w, d], i) => add('industrial', `mill-${i + 1}`, `多層のレンガ工場(ロフト) ${i + 1}`, block, {
      w, d, floors: fl, fh: 3.9, gh: 4.4, wall: W(wl), trim: T('charcoal'), win: WIN(wn), dress: 'sill', door: D('steel-double-green'), sideWin: 4, plant: 2, tank: true, cornice: i % 2 === 0, fire: i % 2 === 1, roof: 'roof/flat-bitumen-patched',
    }));
  // Self storage.
  ([['metal-ribbed-beige', 'orange', 'seam-white', 8, 1], ['block-white', 'blue', 'seam-blue', 12, 1], ['metal-ribbed-white', 'red', 'flat-membrane-white', 10, 2], ['block-beige', 'green', 'seam-green', 6, 1]] as [string, string, string, number, number][])
    .forEach(([wl, tr, rf, n, fl], i) => add('industrial', `storage-${i + 1}`, `貸し倉庫 ${i + 1}`, storage, { n, wall: W(wl), trim: T(tr), doors: [SHUT[[9, 7, 9, 6][i]], SHUT[[9, 7, 3, 6][i]]], roof: `roof/${rf}`, floors: fl }));
  // Tanks and silos.
  ([['white', 3, 4.5, 9, false, false], ['galvanized', 4, 1.6, 9, true, true], ['rust', 2, 6, 8, false, false], ['white-old', 1, 9, 12, true, false], ['galvanized', 6, 1.3, 7, true, true], ['green', 3, 3, 6, false, false]] as [string, number, number, number, boolean, boolean][])
    .forEach(([c, n, r, h, cone, legs], i) => add('industrial', `tanks-${i + 1}`, `貯蔵タンク・サイロ ${i + 1}`, tanks, { n, r, h, mat: T(c), cone, legs }));

  // Filling stations.
  ([['red', 2, 'block-white', 'red', 'market', 'shop-aluminium'], ['green', 3, 'stucco-white', 'green', 'smoke-shop', 'shop-white'], ['blue', 4, 'metal-panel-white', 'blue', 'market', 'shop-blue'], ['red', 1, 'brick-painted-white', 'red', 'auto-parts', 'shop-old'], ['blue', 2, 'tile-white', 'blue', 'liquor', 'shop-low-aluminium'], ['green', 2, 'block-beige', 'green', 'donuts', 'shop-bronze']] as [string, number, string, string, string, string][])
    .forEach(([c, n, wl, tr, sg, sh], i) => add('shop', `gas-${i + 1}`, `ガソリンスタンド ${i + 1}`, gasStation, { canopy: `trim/canopy-${c}`, islands: n, kiosk: W(wl), trim: T(tr), sign: `trim/sign-${sg}`, shop: WIN(sh), pump: T(tr) }));
  // Fast food, diners and banks.
  const PAV: [string, string, Omit<Parameters<typeof pavilion>[1], 'seed'>][] = [
    ['fastfood-1', 'ファストフード店 1', { w: 11, d: 17, h: 3.4, wall: W('brick-red'), trim: T('white'), win: WIN('shop-low-aluminium'), door: D('glass-double-aluminium'), roof: 'mansard', roofMat: 'roof/seam-red', rise: 1.5, sign: 'trim/sign-burgers', pole: 'trim/billboard-burger', drive: true }],
    ['fastfood-2', 'ファストフード店 2', { w: 12, d: 15, h: 3.6, wall: W('stucco-yellow'), trim: T('red'), win: WIN('shop-low-black'), door: D('glass-double-red'), roof: 'flat', roofMat: 'roof/flat-membrane-dirty', rise: 0, sign: 'trim/sign-tacos-el-rey', stripe: T('red'), pole: 'trim/billboard-cola', drive: true }],
    ['fastfood-3', 'ファストフード店 3', { w: 10, d: 14, h: 3.4, wall: W('tile-white'), trim: T('orange'), win: WIN('shop-low-aluminium'), door: D('glass-aluminium'), roof: 'mansard', roofMat: 'roof/seam-blue', rise: 1.3, sign: 'trim/sign-donuts', drive: true }],
    ['fastfood-4', 'ファストフード店 4', { w: 13, d: 18, h: 3.8, wall: W('stucco-cream'), trim: T('brown'), win: WIN('shop-low-black'), door: D('glass-double-bronze'), roof: 'hip', roofMat: 'roof/clay-terracotta', rise: 1.6, sign: 'trim/sign-pizza', pole: 'trim/billboard-burger' }],
    ['fastfood-5', 'ファストフード店 5', { w: 9, d: 12, h: 3.4, wall: W('block-red'), trim: T('yellow'), win: WIN('shop-low-aluminium'), door: D('glass-red'), roof: 'shed', roofMat: 'roof/seam-white', rise: 1.4, sign: 'trim/sign-noodle-house', stripe: T('yellow') }],
    ['diner-1', 'ダイナー 1', { w: 16, d: 6, h: 3.3, wall: W('metal-panel-silver'), trim: T('red'), win: WIN('band-black'), door: D('glass-red'), roof: 'flat', roofMat: 'roof/flat-membrane-grey', rise: 0, stripe: T('red'), blade: 'trim/blade-diner', lift: 0.6, sign: 'trim/sign-cafe-luna' }],
    ['diner-2', 'ダイナー 2', { w: 18, d: 7, h: 3.3, wall: W('metal-panel-silver'), trim: T('teal'), win: WIN('band-white'), door: D('glass-aluminium'), roof: 'flat', roofMat: 'roof/flat-membrane-grey', rise: 0, stripe: T('teal'), blade: 'trim/blade-diner', lift: 0.6 }],
    ['diner-3', 'ダイナー 3', { w: 14, d: 6, h: 3.3, wall: W('tile-cream'), trim: T('green'), win: WIN('band-black'), door: D('glass-green'), roof: 'flat', roofMat: 'roof/flat-bitumen-silver', rise: 0, stripe: T('green'), lift: 0.5, sign: 'trim/sign-burgers', pole: 'trim/billboard-cola' }],
    ['bank-1', '銀行 1', { w: 16, d: 20, h: 8, wall: W('stone-limestone'), trim: T('cream'), win: WIN('band-tall-black'), door: D('glass-double-bronze'), roof: 'flat', roofMat: 'roof/flat-gravel', rise: 0, columns: 6, lift: 1.2 }],
    ['bank-2', '銀行 2', { w: 14, d: 18, h: 7, wall: W('stone-granite-grey'), trim: T('grey'), win: WIN('band-tall-aluminium'), door: D('glass-double-black'), roof: 'flat', roofMat: 'roof/flat-gravel', rise: 0, columns: 4, lift: 0.9 }],
    ['bank-3', '銀行 3', { w: 18, d: 14, h: 5, wall: W('brick-buff'), trim: T('white'), win: WIN('band-tall-black'), door: D('glass-double-aluminium'), roof: 'hip', roofMat: 'roof/seam-copper', rise: 2, columns: 4, lift: 0.6 }],
  ];
  PAV.forEach(([id, label, o]) => add('shop', id, label, pavilion, o));
  // Big-box stores.
  ([['concrete-tiltup', 'blue', 'discount-99', 'metal-panel-white', 70, 50], ['concrete-white', 'red', 'furniture', 'metal-panel-red', 60, 45], ['block-beige', 'green', 'hardware', 'metal-panel-green', 80, 54], ['concrete-panel', 'orange', 'market', 'metal-panel-orange', 54, 40]] as [string, string, string, string, number, number][])
    .forEach(([wl, st, sg, ft, w, d], i) => add('shop', `bigbox-${i + 1}`, `大型量販店 ${i + 1}`, bigBox, { w, d, wall: W(wl), trim: T('grey'), stripe: T(st), sign: `trim/sign-${sg}`, feature: W(ft) }));
  // Car repair shops: roll-up bays beside a small office.
  ([['block-white', 'blue', 16, 3], ['block-grey', 'red', 20, 4], ['metal-ribbed-white', 'charcoal', 14, 2], ['brick-painted-white', 'yellow', 24, 5], ['block-yellow', 'black', 12, 2]] as [string, string, number, number][])
    .forEach(([wl, tr, w, n], i) => add('shop', `garage-${i + 1}`, `自動車修理工場 ${i + 1}`, warehouse, {
      w, d: 12, h: 5, wall: W(wl), trim: T(tr), dock: DOCKS, docks: n, shutters: SHUT.slice(i * 2, i * 2 + 2), office: 5, roof: 'flat', roofMat: 'roof/flat-bitumen', stripe: T(tr),
    }));

  // Dingbats and motel-style walk-ups.
  ([['stucco-white', 'teal', 'slider-aluminium', 'teal', 'rail-black'], ['stucco-pink', 'white', 'slider-white', 'brown', 'rail-white'], ['stucco-sand', 'brown', 'slider-bronze', 'orange', 'rail-brown'], ['stucco-mint', 'white', 'louver-aluminium', 'yellow', 'rail-ornate']] as [string, string, string, string, string][])
    .forEach(([wl, tr, wn, ac, rl], i) => add('apartment', `dingbat-${i + 1}`, `1階が駐車場のアパート ${i + 1}`, dingbat, { w: 12 + (i % 2) * 3, d: 18 + (i % 3) * 2, wall: W(wl), trim: T(tr), win: WIN(wn), accent: T(ac), rail: `trim/${rl}` }));
  ([['stucco-cream', 'brown', 'slider-bronze', 'rail-brown', 'flat', 'flat-gravel', 6], ['stucco-white', 'teal', 'slider-aluminium', 'rail-white', 'hip', 'shingle-grey', 8], ['block-white', 'red', 'slider-white', 'rail-black', 'flat', 'flat-bitumen-silver', 10], ['stucco-peach', 'white', 'slider-white', 'rail-white', 'hip', 'clay-terracotta', 5]] as [string, string, string, string, RoofOpts['kind'], string, number][])
    .forEach(([wl, tr, wn, rl, rk, rf, n], i) => add('apartment', `motel-${i + 1}`, `外廊下のアパート・モーテル ${i + 1}`, motel, {
      units: n, wall: W(wl), trim: T(tr), win: WIN(wn), doors: [D('front-teal-2'), D('front-teal-4'), D('front-red-1'), D('front-white-2')].slice(i % 2, (i % 2) + 2), rail: `trim/${rl}`, roof: rk, roofMat: `roof/${rf}`, ...(i % 2 ? { blade: 'trim/blade-motel' } : { blade: 'trim/blade-apts' }),
    }));
  void [antenna, chimney, waterTank];
}
