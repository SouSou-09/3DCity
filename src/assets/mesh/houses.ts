import { Rand, WINDOW_SIZES, textureSpec } from '../tex';
import { MeshBuilder } from './builder';
import { chimney, dormer, flatRoof, mansard, Opening, pitched, porch, shed, sides, stoop, wall, weatherBySeed } from './buildkit';
import { box, face, stand } from './kit';
import { addModel } from './registry';

export type RoofKind = 'gable' | 'gable-front' | 'hip' | 'flat' | 'shed' | 'mansard';
export interface RoofOpts {
  roof: string;
  kind: RoofKind;
  rise: number;
  over?: number;
  trim: string;
  /** Wall material for gable ends and parapets. */
  wall: string;
}
/** Puts a roof of the given kind on a box whose wall tops are at `y`. */
export function roofOn(b: MeshBuilder, cx: number, cz: number, y: number, w: number, d: number, o: RoofOpts): void {
  const p = { mat: o.roof, rise: o.rise, fascia: o.trim, ...(o.over === undefined ? {} : { over: o.over }) };
  if (o.kind === 'gable') pitched(b, stand([cx, y, cz]), w, d, { ...p, gable: o.wall });
  else if (o.kind === 'gable-front') pitched(b, stand([cx, y, cz], 90), d, w, { ...p, gable: o.wall });
  else if (o.kind === 'hip') w >= d ? pitched(b, stand([cx, y, cz]), w, d, { ...p, hip: true }) : pitched(b, stand([cx, y, cz], 90), d, w, { ...p, hip: true });
  else if (o.kind === 'shed') shed(b, stand([cx, y, cz]), w, d, { ...p, wall: o.wall });
  else if (o.kind === 'mansard') mansard(b, stand([cx, y, cz]), w, d, { mat: o.roof, top: 'roof/flat-bitumen', h: o.rise, inset: o.rise * 0.45, curb: o.trim });
  else {
    for (const s of sides(cx, cz, w, d, y)) wall(b, o.wall, s.f, s.w, 0.45, [], 0, y);
    flatRoof(b, cx, cz, w, d, y, { mat: o.roof, parapet: 0.45, coping: o.trim, thick: 0.2 });
  }
}

/** Sill height that suits a window of this kind in a storey `fh` high. */
export const sillFor = (tex: string, fh: number): number => {
  const h = WINDOW_SIZES[tex]?.h ?? textureSpec(tex).meters[1];
  return h > 1.9 ? 0.04 : Math.max(0.25, Math.min(0.9, fh - 0.4 - h));
};
/** Up to `max` openings spread evenly over [x0, x1], each showing a random variant of the atlas. */
export function spread(rnd: Rand, x0: number, x1: number, tex: string, y: number, extra: Partial<Opening> = {}, max = 9, gap = 0.9): Opening[] {
  const size = WINDOW_SIZES[tex];
  const w = extra.w ?? size?.w ?? textureSpec(tex).meters[0];
  const h = extra.h ?? size?.h ?? textureSpec(tex).meters[1];
  const n = Math.max(0, Math.min(max, Math.floor((x1 - x0 + gap) / (w + gap))));
  const out: Opening[] = [];
  for (let i = 0; i < n; i++) out.push({ depth: 0.07, ...extra, tex, x: x0 + ((x1 - x0) * (i + 0.5)) / n - w / 2, y, w, h, v: rnd.int(0, 7) });
  return out;
}

export interface HouseOpts {
  seed: number;
  w: number;
  d: number;
  floors: number;
  fh?: number;
  /** Height of the ground floor above the ground. */
  base?: number;
  wall: string;
  upper?: string;
  trim: string;
  found?: string;
  roof: string;
  kind: RoofKind;
  rise: number;
  over?: number;
  win: string;
  /** Larger window for the living room, left of the door. */
  winBig?: string;
  door: string;
  /** Door position across the front, -1..1. */
  doorX?: number;
  dress?: 'frame' | 'sill';
  porch?: 'entry' | 'full';
  porchRoof?: string;
  post?: string;
  rail?: string;
  garage?: { door: string; w: number; d?: number; back?: number; side?: 1 | -1; integral?: boolean };
  chimney?: string;
  dormers?: number;
  /** Louvre or window texture in the gable. */
  attic?: string;
  maxWin?: number;
}

export function house(b: MeshBuilder, o: HouseOpts): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.wall, o.upper);
  const { w, d, floors } = o;
  const fh = o.fh ?? 2.75;
  const integral = o.garage?.integral ?? false;
  const base = integral ? 0.12 : o.base ?? 0.45;
  const top = base + fh * floors;
  const dressing: Partial<Opening> = o.dress === 'sill' ? { sill: o.trim, depth: 0.12 } : { frame: o.trim, depth: 0.05 };
  const S = sides(0, 0, w, d);
  const [dw, dh] = textureSpec(o.door).meters;
  const maxW = o.maxWin ?? 3;
  const g = o.garage;
  const gside = g?.side ?? 1;
  let dx = w / 2 + (o.doorX ?? 0) * (w / 2 - dw / 2 - 0.9);
  if (g && integral) {
    // Keep the entrance clear of a garage door cut into the same wall.
    const clear = 0.5 + textureSpec(g.door).meters[0] + 0.4 + dw / 2;
    dx = gside > 0 ? Math.min(dx, w - clear) : Math.max(dx, clear);
  }
  for (let i = 0; i < floors; i++) {
    const y0 = i === 0 ? 0 : base + i * fh;
    const h = i === 0 ? base + fh : fh;
    const lift = i === 0 ? base : 0;
    const mat = i === 0 ? o.wall : o.upper ?? o.wall;
    const sill = lift + sillFor(o.win, fh);
    // Front: door, living room window, bedrooms.
    const front: Opening[] = [];
    if (i === 0) {
      front.push({ x: dx - dw / 2, y: base, w: dw, h: dh, tex: o.door, depth: 0.1, frame: o.trim });
      let [l0, l1, r0, r1] = [0.5, dx - dw / 2 - 0.5, dx + dw / 2 + 0.5, w - 0.5];
      if (g && integral) {
        const [gw, gh] = textureSpec(g.door).meters;
        const gx = gside > 0 ? w - 0.5 - gw : 0.5;
        front.push({ x: gx, y: 0.02, w: gw, h: gh, tex: g.door, depth: 0.12, frame: o.trim });
        if (gside > 0) r1 = gx - 0.5;
        else l0 = gx + gw + 0.5;
      }
      const big = o.winBig ?? o.win;
      front.push(...spread(rnd, l0, l1, big, lift + sillFor(big, fh), dressing, o.winBig ? 1 : maxW));
      front.push(...spread(rnd, r0, r1, o.win, sill, dressing, maxW));
    } else front.push(...spread(rnd, 0.5, w - 0.5, o.win, sill, dressing, maxW * 2 + 1));
    wall(b, mat, S[0].f, w, h, front.map((q) => ({ ...q, y: q.y })), 0, y0);
    const lay = (s: number): Opening[] => spread(rnd, 0.8, s - 0.8, o.win, sill, dressing, Math.max(1, Math.floor(s / 4)));
    const shared = (k: number): boolean => !!g && !integral && i === 0 && ((gside > 0 && k === 1) || (gside < 0 && k === 3));
    for (const k of [1, 3]) wall(b, mat, { ...S[k].f, o: [S[k].f.o[0], y0, S[k].f.o[2]] }, d, h, shared(k) ? [] : lay(d), 0, y0);
    const back = lay(w);
    if (i === 0 && back.length > 1) back[0] = { x: back[0].x, y: base, w: 0.9, h: 2.1, tex: 'door/front-white-2', depth: 0.08, frame: o.trim };
    wall(b, mat, { ...S[2].f, o: [S[2].f.o[0], y0, S[2].f.o[2]] }, w, h, back, 0, y0);
    if (i > 0) S[0].f = { ...S[0].f };
    S[0].f = { ...S[0].f, o: [S[0].f.o[0], base + (i + 1) * fh, S[0].f.o[2]] };
  }
  // Plinth, where no garage door cuts through it.
  if (!integral && base > 0.2) {
    const m = o.found ?? 'structure/wall-old';
    for (const sz of [1, -1]) b.box(m, [0, base / 2 - 0.03, (sz * d) / 2], [w / 2 + 0.03, base / 2 - 0.03, 0.03]);
    for (const sx of [1, -1]) b.box(m, [(sx * w) / 2, base / 2 - 0.03, 0], [0.03, base / 2 - 0.03, d / 2 + 0.03]);
  }
  const gableWall = o.upper ?? o.wall;
  roofOn(b, 0, 0, top, w, d, { roof: o.roof, kind: o.kind, rise: o.rise, trim: o.trim, wall: gableWall, ...(o.over === undefined ? {} : { over: o.over }) });
  if (o.attic && (o.kind === 'gable' || o.kind === 'gable-front')) {
    const size = WINDOW_SIZES[o.attic];
    const [aw, ah] = size ? [size.w, size.h] : [0.6, 0.6];
    const k = Math.min(1, (o.rise * 0.45) / ah);
    const fs = o.kind === 'gable' ? [stand([w / 2 + 0.006, top + o.rise * 0.32, 0], 90), stand([-w / 2 - 0.006, top + o.rise * 0.32, 0], 270)] : [stand([0, top + o.rise * 0.32, d / 2 + 0.006]), stand([0, top + o.rise * 0.32, -d / 2 - 0.006], 180)];
    for (const f of fs) {
      box(b, o.trim, f, [0, 0, 0], [(aw * k) / 2 + 0.06, (ah * k) / 2 + 0.06, 0.012], 'Z');
      face(b, o.attic, f, [0, 0, 0.016], aw * k, ah * k, size ? [0, 0, size.w, size.h] : undefined);
    }
  }
  // Entrance.
  const doorPose = stand([dx - w / 2, 0, d / 2]);
  const post = o.post ?? o.trim;
  if (o.porch) {
    const full = o.porch === 'full';
    const pw = full ? w - 0.3 : dw + 1.5;
    const pd = full ? 2.1 : 1.5;
    const px = full ? 0 : dx - w / 2;
    porch(b, stand([px, 0, d / 2]), pw, pd, base + 2.5, {
      roof: o.porchRoof ?? o.roof, post, posts: full ? Math.max(3, Math.round(pw / 3) + 1) : 2, floor: 'paving/boardwalk-grey', floorH: base, thick: full ? 0.22 : 0.14,
      ...(o.rail ? { rail: o.rail, gap: [dx - w / 2 - px - 0.8, dx - w / 2 - px + 0.8] as [number, number] } : {}),
    });
    stoop(b, stand([dx - w / 2, 0, d / 2 + pd]), 1.6, base, { landing: 0.29 });
  } else if (base > 0.15) stoop(b, doorPose, dw + 0.7, base, { landing: 0.9, ...(o.rail && base > 0.5 ? { rail: o.rail } : {}) });
  // Attached garage with a lower roof of the same kind.
  if (g && !integral) {
    const gd = g.d ?? 6.2;
    const gh = 2.7;
    const gx = gside * (w / 2 + g.w / 2);
    const gz = d / 2 - (g.back ?? 0.8) - gd / 2;
    const G = sides(gx, gz, g.w, gd);
    const [gw, gdh] = textureSpec(g.door).meters;
    wall(b, o.wall, G[0].f, g.w, gh, [{ x: g.w / 2 - gw / 2, y: 0.02, w: gw, h: gdh, tex: g.door, depth: 0.12, frame: o.trim }]);
    const outer = gside > 0 ? 1 : 3;
    wall(b, o.wall, G[outer].f, gd, gh, spread(rnd, 1, gd - 1, o.win, sillFor(o.win, fh), dressing, 1));
    wall(b, o.wall, G[2].f, g.w, gh);
    roofOn(b, gx, gz, gh, g.w, gd, { roof: o.roof, kind: o.kind === 'mansard' ? 'flat' : o.kind, rise: o.kind === 'gable-front' ? (o.rise * g.w) / w : (o.rise * gd) / d, trim: o.trim, wall: o.wall, ...(o.over === undefined ? {} : { over: o.over }) });
  }
  if (o.chimney) {
    if (o.kind === 'gable') chimney(b, stand([-w / 2 - 0.32, 0, 0], 90), 1.1, 0.6, top + o.rise + 0.7, o.chimney, 2);
    else chimney(b, stand([w * 0.22, top, -d * 0.12]), 0.8, 0.6, o.rise + 0.6, o.chimney, 1);
  }
  if (o.dormers && o.kind === 'gable') {
    const slope = o.rise / (d / 2);
    for (let i = 0; i < o.dormers; i++) {
      const x = (i - (o.dormers - 1) / 2) * (w / (o.dormers + 0.4));
      dormer(b, stand([x, top + slope * 0.9, d / 2 - 0.9]), 1.5, 1.45, slope, { wall: gableWall, roof: o.roof, window: 'window/sash-white', v: i, fascia: o.trim });
    }
  }
}

type Look = [wall: string, trim: string, roof: string, door: string, extra?: Partial<HouseOpts>];
const T = (c: string): string => `trim/paint-${c}`;
const W = (c: string): string => `wall/${c}`;
const R = (c: string): string => `roof/${c}`;
const WIN = (c: string): string => `window/${c}`;
const D = (c: string): string => `door/${c}`;

export function addHouses(): void {
  let seed = 4100;
  const add = (id: string, label: string, o: Omit<HouseOpts, 'seed'>): void => {
    const s = (seed += 13);
    addModel('house', id, label, (b) => house(b, { ...o, seed: s }));
  };
  const each = (prefix: string, label: string, looks: Look[], make: (i: number, l: Look) => Omit<HouseOpts, 'seed' | 'wall' | 'trim' | 'roof' | 'door'>): void =>
    looks.forEach((l, i) => add(`${prefix}-${i + 1}`, `${label} ${i + 1}`, { ...make(i, l), wall: W(l[0]), trim: T(l[1]), roof: R(l[2]), door: D(l[3]), ...(l[4] ?? {}) }));

  // Ranch: one long low storey with an attached garage.
  each('ranch', '平屋のランチハウス', [
    ['stucco-cream', 'white', 'shingle-brown', 'front-brown-1'], ['brick-buff', 'cream', 'shingle-charcoal', 'front-green-0', { dress: 'sill' }], ['siding-sage', 'white', 'shingle-grey', 'front-white-0'],
    ['stucco-peach', 'white', 'clay-terracotta', 'front-brown-4', { dress: 'sill' }], ['siding-blue', 'white', 'shingle-charcoal', 'front-red-1'], ['stucco-sand-old', 'brown-old', 'shingle-old', 'front-brown-1', { dress: 'sill' }],
    ['brick-red', 'white', 'shingle-grey', 'front-black-0', { dress: 'sill' }], ['siding-yellow', 'white', 'shingle-brown', 'front-blue-2'],
  ], (i) => ({
    w: 12 + (i % 3) * 2, d: 8 + (i % 2), floors: 1, kind: i % 2 ? 'gable' : 'hip', rise: 1.5 + (i % 3) * 0.2, over: 0.6,
    win: WIN(['slider-aluminium', 'casement-white', 'sash-wide-white', 'slider-bronze'][i % 4]), winBig: WIN(['picture-aluminium', 'picture-white', 'picture-white-grid', 'picture-bronze'][i % 4]), doorX: i % 2 ? 0.25 : -0.1,
    garage: { door: D(i % 3 === 0 ? 'garage-wide-white' : i % 3 === 1 ? 'garage-wide-cream' : 'garage-wide-brown'), w: 6, side: i % 2 ? -1 : 1, back: i % 3 === 0 ? -1.2 : 0.8 },
    ...(i % 3 === 1 ? { porch: 'entry' as const } : {}), ...(i % 4 === 1 ? { chimney: 'wall/brick-red' } : {}), base: 0.25,
  }));

  // Craftsman bungalow: front gable over a deep porch.
  each('bungalow', 'クラフツマン様式のバンガロー', [
    ['siding-green', 'cream', 'shingle-brown', 'front-brown-1'], ['shingle-cedar', 'white', 'shingle-charcoal', 'front-green-0'], ['siding-tan', 'brown', 'shingle-green', 'front-brown-4'],
    ['siding-grey', 'white', 'shingle-grey', 'front-red-1'], ['siding-brown', 'cream', 'shingle-red', 'front-yellow-1'], ['siding-white-peeling', 'white-old', 'shingle-old', 'front-brown-1'],
  ], (i, l) => ({
    w: 8.5 + (i % 3), d: 11 + (i % 2) * 2, floors: 1, base: 0.75, kind: 'gable-front', rise: 2.4 + (i % 2) * 0.5, over: 0.7,
    win: WIN(i % 2 ? 'sash-wide-white' : 'sash-cream-2over2'), winBig: WIN('casement-triple-white'), doorX: 0.45, porch: 'full', porchRoof: R(l[2]), rail: `trim/rail-${i % 2 ? 'white' : 'brown'}`,
    attic: i % 2 ? 'window/square-white' : 'trim/louver-white', ...(i % 3 === 0 ? { chimney: 'wall/brick-brown' } : {}),
  }));

  // Two-storey colonial: symmetrical, door in the middle.
  each('colonial', '2階建てコロニアル様式', [
    ['siding-white', 'white', 'shingle-charcoal', 'front-black-0'], ['brick-red', 'white', 'slate-grey', 'front-white-2', { dress: 'sill' }], ['siding-cream', 'white', 'shingle-brown', 'front-green-0'],
    ['brick-painted-white', 'charcoal', 'shingle-charcoal', 'front-red-3', { dress: 'sill' }], ['siding-blue', 'white', 'shingle-grey', 'front-white-0'], ['siding-vinyl-beige', 'white', 'shingle-tan', 'front-brown-1'],
  ], (i) => ({
    w: 11 + (i % 2) * 2, d: 8, floors: 2, base: 0.55, kind: i === 3 ? 'hip' : 'gable', rise: 2.4, over: 0.35, win: WIN(i % 2 ? 'sash-white' : 'sash-white-6over6'), doorX: 0, maxWin: 2,
    ...(i % 2 ? { porch: 'entry' as const } : {}), chimney: i % 2 ? 'wall/brick-red' : 'wall/brick-brown', ...(i % 3 === 2 ? { garage: { door: D('garage-wide-white'), w: 6.2, back: 1.5 } } : {}), attic: 'trim/louver-white', rail: 'trim/rail-black',
  }));

  // Spanish revival: white stucco under clay tiles.
  each('spanish', 'スパニッシュ様式', [
    ['stucco-white', 'brown', 'clay-terracotta', 'front-brown-4'], ['stucco-cream', 'brown', 'clay-mixed', 'front-brown-1'], ['stucco-peach', 'brown-old', 'clay-old', 'front-teal-4'],
    ['stucco-ochre', 'brown', 'clay-red', 'front-blue-4'], ['stucco-white-stained', 'brown-old', 'clay-old', 'front-brown-4'], ['stucco-salmon-old', 'white', 'clay-mixed', 'front-green-3'],
  ], (i) => ({
    w: 10 + (i % 3) * 2, d: 9, floors: 1 + (i % 2), base: 0.3, kind: i % 3 === 2 ? 'gable' : 'hip', rise: 1.3, over: 0.35, dress: 'sill',
    win: WIN(i % 2 ? 'arch-brown' : 'casement-brown'), winBig: WIN('arch-wide-brown'), doorX: i % 2 ? -0.4 : 0.3, maxWin: 2,
    ...(i % 2 === 0 ? { garage: { door: D('garage-brown'), w: 3.6, back: 2.5, side: -1 as const } } : {}), ...(i % 3 === 1 ? { chimney: 'wall/stucco-white' } : {}),
  }));

  // Modern: flat or single-pitch roofs, large glass, garage in the house.
  each('modern', 'モダン住宅', [
    ['stucco-white', 'charcoal', 'flat-membrane-white', 'front-yellow-3'], ['stucco-charcoal', 'black', 'flat-gravel', 'front-yellow-3'], ['wood-cedar', 'charcoal', 'seam-grey', 'front-red-3'],
    ['concrete-boards', 'black', 'flat-gravel-light', 'front-red-3'], ['metal-panel-charcoal', 'black', 'seam-galvanized', 'front-green-3'], ['stucco-grey', 'white', 'flat-membrane-grey', 'front-teal-4'],
  ], (i) => ({
    w: 11 + (i % 2) * 2, d: 9, floors: 2, fh: 3, kind: i % 3 === 2 ? 'shed' : 'flat', rise: 1.4, over: 0.5, dress: 'sill',
    upper: W(['wood-cedar', 'stucco-white', 'stucco-charcoal', 'wood-dark', 'wood-cedar', 'batten-charcoal'][i]), win: WIN(i % 2 ? 'tall-black' : 'picture-black'), winBig: WIN('patio-black-wide'), doorX: 0.1, maxWin: 2,
    garage: { door: D(i % 2 ? 'garage-flush-wood' : 'garage-modern-glass'), w: 5, integral: true, side: i % 2 ? -1 : 1 },
  }));

  // Victorian: tall, narrow, steep front gable and a porch.
  each('victorian', 'ヴィクトリア様式', [
    ['siding-yellow', 'white', 'shingle-charcoal', 'front-red-1'], ['siding-blue', 'cream', 'slate-grey', 'front-white-2'], ['siding-red', 'cream', 'shingle-grey', 'front-green-0'],
    ['siding-sage', 'white', 'slate-green', 'front-brown-1'], ['siding-blue-peeling', 'white-old', 'shingle-old', 'front-brown-1'], ['siding-cream', 'teal', 'shingle-blue', 'front-teal-2'],
  ], (i, l) => ({
    w: 7 + (i % 2), d: 12, floors: 2, fh: 3.1, base: 0.9, kind: 'gable-front', rise: 3.2, over: 0.45, upper: i % 2 ? W('shingle-grey') : W(l[0]),
    win: WIN(i % 2 ? 'sash-tall-white' : 'sash-tall-black'), doorX: 0.55, porch: i % 3 === 2 ? 'entry' : 'full', rail: 'trim/rail-white', attic: 'window/arch-white', maxWin: 2, chimney: 'wall/brick-red',
  }));

  // Cape Cod: one storey with dormers in a steep roof.
  each('cape', 'ケープコッド様式(屋根窓つき)', [
    ['shingle-cedar', 'white', 'shingle-charcoal', 'front-red-1'], ['shingle-grey', 'white', 'shake-grey', 'front-blue-2'], ['siding-white', 'green', 'shingle-grey', 'front-green-0'], ['siding-grey', 'white', 'shake-cedar', 'front-black-0'],
  ], (i) => ({ w: 10 + (i % 2) * 1.5, d: 7.5, floors: 1, base: 0.5, kind: 'gable', rise: 3.3, over: 0.25, win: WIN('sash-white-6over6'), doorX: 0, dormers: 2 + (i % 2), chimney: 'wall/brick-red', attic: 'window/sash-white', maxWin: 2 }));

  // Suburban two-storey with a garage wing.
  each('suburban', '郊外の2階建て', [
    ['siding-vinyl-beige', 'white', 'shingle-brown', 'front-brown-1'], ['siding-vinyl-grey', 'white', 'shingle-charcoal', 'front-red-3'], ['stucco-sand', 'white', 'tile-flat-brown', 'front-white-0', { dress: 'sill' }],
    ['siding-vinyl-white', 'charcoal', 'shingle-grey', 'front-blue-2'], ['stucco-beige-patched', 'cream', 'tile-flat-red', 'front-brown-1', { dress: 'sill' }], ['brick-brown', 'cream', 'shingle-tan', 'front-green-0', { dress: 'sill' }],
  ], (i) => ({
    w: 8.5 + (i % 2), d: 9.5, floors: 2, base: 0.3, kind: i % 2 ? 'hip' : 'gable-front', rise: 2 + (i % 2) * -0.4, over: 0.4, win: WIN(['casement-white', 'slider-white', 'sash-wide-white'][i % 3]), winBig: WIN('picture-white-grid'),
    doorX: i % 2 ? 0.5 : -0.5, maxWin: 2, garage: { door: D(['garage-wide-white', 'garage-wide-grey', 'garage-wide-cream'][i % 3]), w: 6, back: -1.5 + (i % 3), side: i % 2 ? -1 : 1 }, porch: 'entry', attic: 'trim/louver-white',
  }));

  // Small cottages and shotgun houses.
  each('cottage', '小さな平屋', [
    ['siding-white-peeling', 'white-old', 'shingle-old', 'front-brown-1'], ['siding-red', 'white', 'corrugated-galvanized', 'front-white-0'], ['stucco-mint', 'white', 'shingle-grey', 'front-yellow-1'],
    ['siding-tan', 'brown', 'corrugated-rusty', 'front-brown-4'], ['stucco-sky', 'white', 'shingle-charcoal', 'front-white-2'], ['plywood-tan', 'brown-old', 'flat-bitumen-patched', 'front-green-3'],
  ], (i) => ({
    w: 5.2 + (i % 3) * 0.8, d: 9 + (i % 2) * 3, floors: 1, base: 0.6, kind: i === 5 ? 'shed' : i % 2 ? 'gable-front' : 'hip', rise: 1.5, over: 0.4, win: WIN(i % 2 ? 'sash-white-old' : 'slider-aluminium-old'), doorX: i % 2 ? 0.6 : -0.6, maxWin: 1,
    ...(i % 2 ? { porch: 'full' as const, rail: 'trim/rail-white' } : {}), ...(i % 2 ? { attic: 'trim/louver-white' } : {}),
  }));

  // Manufactured homes.
  each('mobile', 'トレーラーハウス', [
    ['metal-ribbed-white', 'white', 'seam-white', 'steel-white'], ['siding-vinyl-beige', 'brown', 'seam-galvanized', 'steel-brown'], ['metal-ribbed-beige', 'white-old', 'seam-rusty', 'steel-beige'], ['siding-vinyl-grey', 'white', 'shingle-grey', 'front-white-0'],
  ], (i) => ({ w: 15 + (i % 2) * 3, d: 4.3, floors: 1, fh: 2.4, base: 0.75, kind: 'gable', rise: 0.45, over: 0.12, found: i % 2 ? 'wall/metal-ribbed-grey' : 'trim/lattice-white', win: WIN(i % 2 ? 'slider-aluminium-old' : 'slider-aluminium'), doorX: -0.3 + (i % 2) * 0.5, maxWin: 2, rail: 'trim/rail-brown' }));

  // Duplexes: two doors under one roof.
  each('duplex', '二世帯住宅', [
    ['stucco-sand', 'white', 'shingle-brown', 'front-brown-1'], ['brick-orange', 'white', 'shingle-charcoal', 'front-white-0', { dress: 'sill' }], ['siding-grey', 'white', 'shingle-grey', 'front-red-1'], ['stucco-pink', 'white', 'clay-terracotta', 'front-brown-4', { dress: 'sill' }],
  ], (i) => ({ w: 14, d: 9, floors: 1 + (i % 2), base: 0.4, kind: i % 2 ? 'gable' : 'hip', rise: 1.7, over: 0.45, win: WIN(i % 2 ? 'sash-wide-white' : 'slider-white'), doorX: -0.5, maxWin: 2, rail: 'trim/rail-black' }));
}
