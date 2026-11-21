import { Rand, SHOP_BAYS, WINDOW_SIZES, textureSpec } from '../tex';
import { MeshBuilder } from './builder';
import { Opening, acUnit, antenna, awning, balcony, billboard, blade, bulkhead, dish, duct, fireEscape, flatRoof, sides, sign, skylight, stoop, vent, wall, waterTank } from './buildkit';
import { sillFor, spread } from './houses';
import { box, stand } from './kit';
import { addModel } from './registry';

/** Scatters plant over a flat roof: `amount` 0..3, on a coarse grid so that units never overlap. */
export function roofPlant(b: MeshBuilder, rnd: Rand, cx: number, cz: number, w: number, d: number, y: number, amount: number, o: { wall?: string; tank?: boolean; big?: boolean } = {}): void {
  if (amount <= 0) return;
  const cell = o.big ? 6.5 : 3.6;
  const [nx, nz] = [Math.max(1, Math.floor((w - 1.5) / cell)), Math.max(1, Math.floor((d - 1.5) / cell))];
  const slots: [number, number][] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) slots.push([cx + (i - (nx - 1) / 2) * cell, cz + (j - (nz - 1) / 2) * cell]);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = rnd.int(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const n = Math.min(slots.length, Math.max(1, Math.round(slots.length * amount * 0.22)));
  slots.slice(0, n).forEach(([x, z], i) => {
    const f = stand([x + rnd.range(-0.3, 0.3), y, z + rnd.range(-0.3, 0.3)], rnd.pick([0, 90, 180, 270]));
    const k = i === 0 ? 0 : i === 1 && o.tank ? 1 : rnd.int(2, 9);
    if (k === 0) bulkhead(b, f, 2.6, 3.2, 2.5, o.wall ?? 'wall/block-grey', rnd.pick(['door/steel-grey', 'door/steel-brown', 'door/steel-rust']));
    else if (k === 1) waterTank(b, f, 1.5, 2.8, 2.6, rnd.chance(0.5) ? 'trim/tank-staves' : 'trim/tank-staves-grey');
    else if (k <= 4) acUnit(b, f, o.big ? rnd.int(1, 2) : rnd.int(0, 1), rnd.chance(0.3));
    else if (k === 5) for (let q = 0; q < 3; q++) vent(b, stand([x + q * 0.9 - 0.9, y, z]), rnd.int(0, 2));
    else if (k === 6) skylight(b, f, 1.2, 1.2, rnd.chance(0.5));
    else if (k === 7) dish(b, f, rnd.range(0.4, 0.7));
    else if (k === 8) duct(b, f, Math.min(3, cell - 0.6));
    else antenna(b, f, rnd.int(0, 1), rnd.range(2.5, 4.5));
  });
}

export interface BlockOpts {
  seed: number;
  w: number;
  d: number;
  floors: number;
  fh?: number;
  /** Ground storey height. */
  gh?: number;
  wall: string;
  /** Side and back walls, where they differ from the street front. */
  side?: string;
  trim: string;
  win: string;
  dress?: 'sill' | 'frame' | 'head';
  /** Shopfront texture, with fascia signs and awnings; or leave out for a residential ground floor. */
  shop?: string;
  signs?: string[];
  awning?: string;
  /** Material of the ground storey when it differs from the floors above. */
  base?: string;
  door?: string;
  roof?: string;
  parapet?: number;
  cornice?: boolean;
  fire?: boolean;
  /** Railing texture: gives every upper window a balcony. */
  balcony?: string;
  solidBalcony?: boolean;
  sideWin?: number;
  plant?: number;
  tank?: boolean;
  blade?: string;
  billboard?: string;
  /** Raises the ground floor and adds steps to the door. */
  stoop?: number;
  maxWin?: number;
}

export function block(b: MeshBuilder, o: BlockOpts): void {
  const rnd = new Rand(o.seed);
  const { w, d, floors } = o;
  const fh = o.fh ?? 3.1;
  const lift = o.stoop ?? 0;
  const gh = (o.gh ?? (o.shop ? 4.3 : fh)) + lift;
  const par = o.parapet ?? 0.9;
  const top = gh + (floors - 1) * fh;
  const S = sides(0, 0, w, d);
  const side = o.side ?? o.wall;
  const dress: Partial<Opening> = o.dress === 'frame' ? { frame: o.trim, depth: 0.06 } : o.dress === 'head' ? { sill: o.trim, head: o.trim, depth: 0.14 } : { sill: o.trim, depth: 0.14 };
  const win = WINDOW_SIZES[o.win];
  const maxWin = o.maxWin ?? Math.floor((w - 1) / (win.w + 1.0));
  // Ground storey.
  const ground: Opening[] = [];
  const door = o.door ?? 'door/glass-aluminium';
  const [dw, dh] = textureSpec(door).meters;
  if (o.shop) {
    const { bay, h } = SHOP_BAYS[o.shop];
    let x = 0.5;
    const end = floors > 1 ? w - 0.5 - dw - 0.6 : w - 0.5;
    let i = 0;
    while (end - x >= bay * 2) {
      const k = Math.min(rnd.int(2, 4), Math.floor((end - x) / bay));
      const sw = k * bay;
      ground.push({ x, y: 0.05, w: sw, h, tex: o.shop, v: rnd.int(0, 3), depth: 0.1, reveal: o.trim });
      const c = stand([x + sw / 2 - w / 2, 0, d / 2]);
      if (o.signs?.length) {
        const s = Math.min(1, (sw - 0.3) / 4.8, (gh - h - 0.3) / 0.9);
        sign(b, { ...c, o: [c.o[0], h + 0.15 + 0.45 * s + (o.awning ? 0.05 : 0), c.o[2]] }, 4.8 * s, 0.9 * s, o.signs[(i + rnd.int(0, 30)) % o.signs.length]);
      }
      if (o.awning && rnd.chance(0.75)) awning(b, { ...c, o: [c.o[0], h + 0.1, c.o[2]] }, sw + 0.1, 1.3, 0.75, o.awning, rnd.chance(0.6));
      x += sw + 0.5;
      i++;
    }
    if (floors > 1) ground.push({ x: w - 0.5 - dw, y: 0.05, w: dw, h: dh, tex: door, depth: 0.15 });
  } else {
    const dx = w / 2 - dw / 2;
    ground.push({ x: dx, y: lift + 0.02, w: dw, h: dh, tex: door, depth: 0.15, frame: o.trim });
    ground.push(...spread(rnd, 0.6, dx - 0.6, o.win, lift + sillFor(o.win, fh), dress, Math.floor(maxWin / 2)), ...spread(rnd, dx + dw + 0.6, w - 0.6, o.win, lift + sillFor(o.win, fh), dress, Math.floor(maxWin / 2)));
    if (lift > 0.2) stoop(b, stand([0, 0, d / 2]), dw + 1, lift, { landing: 1, rail: 'trim/rail-black', mat: 'structure/wall-smooth' });
  }
  wall(b, o.base ?? o.wall, S[0].f, w, gh, ground);
  const plain = (s: number, n: number, y: number): Opening[] => (n > 0 ? spread(rnd, 1, s - 1, o.win, y, { sill: o.trim, depth: 0.1 }, n) : []);
  const sideN = o.sideWin ?? 0;
  wall(b, side, S[1].f, d, gh, plain(d, sideN, lift + sillFor(o.win, fh)));
  wall(b, side, S[3].f, d, gh, plain(d, sideN, lift + sillFor(o.win, fh)));
  wall(b, side, S[2].f, w, gh, [{ x: 1, y: 0.05, w: 0.9, h: 2.1, tex: rnd.pick(['door/steel-grey', 'door/steel-grey-tagged', 'door/steel-brown', 'door/steel-beige']), depth: 0.08 }, ...(o.shop ? [] : plain(w - 2.5, Math.max(1, maxWin - 2), lift + sillFor(o.win, fh)).map((q) => ({ ...q, x: q.x + 2.5 })))]);
  // Upper storeys in one panel per side, so that the wall texture runs through.
  const upH = top - gh + par;
  const sill = sillFor(o.win, fh);
  const rows = (s: number, n: number, extra: Partial<Opening>): Opening[] => {
    const out: Opening[] = [];
    for (let i = 0; i + 1 < floors; i++) out.push(...spread(rnd, 0.6, s - 0.6, o.win, i * fh + sill, extra, n));
    return out;
  };
  const front = rows(w, maxWin, dress);
  wall(b, o.wall, { ...S[0].f, o: [S[0].f.o[0], gh, S[0].f.o[2]] }, w, upH, front, 0, gh);
  for (const k of [1, 3]) wall(b, side, { ...S[k].f, o: [S[k].f.o[0], gh, S[k].f.o[2]] }, d, upH, rows(d, sideN, { sill: o.trim, depth: 0.1 }), 0, gh);
  wall(b, side, { ...S[2].f, o: [S[2].f.o[0], gh, S[2].f.o[2]] }, w, upH, rows(w, Math.max(1, maxWin - 1), { sill: o.trim, depth: 0.1 }), 0, gh);
  if (floors > 1) box(b, o.trim, S[0].f, [w / 2, gh - 0.02, 0.04], [w / 2 + 0.05, 0.1, 0.07]);
  if (o.cornice) {
    box(b, o.trim, S[0].f, [w / 2, top + par - 0.45, 0.12], [w / 2 + 0.2, 0.09, 0.2]);
    box(b, o.trim, S[0].f, [w / 2, top + par - 0.2, 0.2], [w / 2 + 0.3, 0.17, 0.3]);
    box(b, o.trim, S[0].f, [w / 2, top + par - 0.75, 0.04], [w / 2 + 0.06, 0.07, 0.06]);
  }
  if (o.balcony) for (const q of front) balcony(b, stand([q.x + q.w / 2 - w / 2, gh + q.y - 0.02, d / 2]), q.w + 0.7, 1.15, { rail: o.balcony, ...(o.solidBalcony ? { solid: true } : {}) });
  if (o.fire && floors > 2) {
    const col = front.filter((q) => q.y < fh);
    const mid = col.length > 1 ? (col[Math.floor(col.length / 2) - 1].x + col[Math.floor(col.length / 2)].x + win.w) / 2 - w / 2 : 0;
    fireEscape(b, stand([mid, gh + sill - 0.1, d / 2]), floors - 1, fh, { w: Math.min(w - 1, win.w * 2 + 2.2), roof: fh - sill + par });
  }
  if (o.blade) blade(b, stand([-w / 2 + 0.6, gh + Math.min(upH - par - 0.3, textureSpec(o.blade).meters[1] + 0.8), d / 2]), o.blade);
  flatRoof(b, 0, 0, w, d, top, { mat: o.roof ?? 'roof/flat-bitumen', parapet: par, inner: side, coping: o.trim });
  roofPlant(b, rnd, 0, 0, w - 1, d - 1, top, o.plant ?? 1, { wall: side, ...(o.tank ? { tank: true } : {}) });
  if (o.billboard) billboard(b, stand([0, top + par, d / 2 - 1.2]), o.billboard, 1.2, Math.min(1, (w - 1) / 6));
}

const T = (c: string): string => `trim/paint-${c}`;
const W = (c: string): string => `wall/${c}`;
const WIN = (c: string): string => `window/${c}`;
const SIGN = (...n: string[]): string[] => n.map((s) => `trim/sign-${s}`);

export function addBlocks(): void {
  let seed = 7300;
  const next = (): number => (seed += 17);
  const apt = (id: string, label: string, o: Omit<BlockOpts, 'seed'>): void => {
    const s = next();
    addModel('apartment', id, label, (b) => block(b, { ...o, seed: s }));
  };
  const shop = (id: string, label: string, o: Omit<BlockOpts, 'seed'>): void => {
    const s = next();
    addModel('shop', id, label, (b) => block(b, { ...o, seed: s }));
  };

  // Brick walk-ups with fire escapes.
  const WALKUP: [string, string, string, string][] = [['brick-red', 'brick-red-common', 'cream', 'sash-white'], ['brick-brown', 'brick-brown-common', 'white', 'sash-brown'], ['brick-buff', 'brick-buff-sooty', 'brown', 'sash-green'], ['brick-red-sooty', 'brick-red-common', 'grey', 'sash-white-old'],
    ['brick-painted-cream', 'brick-painted-cream', 'charcoal', 'sash-black'], ['brick-dark', 'brick-brown-common', 'white', 'sash-white-6over6'], ['brick-orange', 'brick-red-common', 'white', 'sash-cream-2over2'], ['brick-painted-white-peeling', 'brick-red-common', 'white-old', 'sash-brown-old']];
  WALKUP.forEach(([wl, sd, tr, wn], i) => apt(`walkup-${i + 1}`, `レンガのアパート(非常階段つき) ${i + 1}`, {
    w: 9 + (i % 3) * 3, d: 16 + (i % 2) * 4, floors: 3 + (i % 4), wall: W(wl), side: W(sd), trim: T(tr), win: WIN(wn), dress: 'head', cornice: true, fire: true, stoop: i % 2 ? 0.9 : 0.5,
    door: `door/front-${['green-0', 'brown-1', 'black-0', 'red-1'][i % 4]}`, sideWin: i % 2, plant: 1, tank: i % 3 === 0, roof: i % 2 ? 'roof/flat-bitumen-patched' : 'roof/flat-bitumen-silver',
  }));
  // Brownstones and row houses.
  const ROW: [string, string, string][] = [['stone-brownstone', 'brown', 'sash-tall-black'], ['stone-limestone', 'cream', 'sash-tall-white'], ['brick-red', 'white', 'sash-tall-white'], ['brick-painted-blue', 'white', 'sash-tall-white'], ['brick-painted-grey', 'black', 'sash-tall-black'], ['stone-sandstone', 'tan', 'arch-brown']];
  ROW.forEach(([wl, tr, wn], i) => apt(`rowhouse-${i + 1}`, `連棟の町屋(ブラウンストーン) ${i + 1}`, {
    w: 6 + (i % 2), d: 13, floors: 3 + (i % 2), fh: 3.4, wall: W(wl), side: W('brick-red-common'), trim: T(tr), win: WIN(wn), dress: 'head', cornice: true, stoop: 1.5, door: `door/front-${['black-2', 'green-0', 'red-1', 'white-2', 'yellow-1', 'brown-1'][i]}`, maxWin: 3, plant: 1, parapet: 0.6,
  }));
  // Stucco blocks with balconies.
  const BALC: [string, string, string, string][] = [['stucco-white', 'grey', 'patio-aluminium', 'rail-white'], ['stucco-peach', 'white', 'patio-white', 'rail-black'], ['stucco-sand', 'brown', 'patio-bronze', 'rail-brown'], ['stucco-teal', 'white', 'patio-white', 'rail-cable'],
    ['concrete-panel', 'grey', 'patio-aluminium', 'rail-cable-black'], ['stucco-grey', 'charcoal', 'french-white', 'rail-ornate'], ['stucco-cream-lace', 'green', 'french-brown', 'rail-green'], ['metal-panel-white', 'charcoal', 'patio-bronze', 'rail-cable']];
  BALC.forEach(([wl, tr, wn, rl], i) => apt(`balcony-${i + 1}`, `バルコニーつき集合住宅 ${i + 1}`, {
    w: 14 + (i % 3) * 5, d: 13, floors: 3 + (i % 5), fh: 3, wall: W(wl), trim: T(tr), win: WIN(wn), balcony: i === 4 ? W('concrete-panel') : `trim/${rl}`, solidBalcony: i === 4, door: i % 2 ? 'door/glass-double-aluminium' : 'door/glass-double-bronze',
    sideWin: 2, plant: 2, parapet: 0.5, roof: i % 2 ? 'roof/flat-gravel' : 'roof/flat-membrane-dirty',
  }));

  // Single-storey shops.
  const SHOP1: [string, string, string, string, string[]][] = [
    ['brick-red', 'cream', 'shop-aluminium', 'awning-red', SIGN('liquor', 'laundromat', 'donuts')], ['stucco-cream', 'brown', 'shop-bronze', 'awning-green', SIGN('market', 'pharmacy', 'bakery')], ['block-white', 'grey', 'shop-old', '', SIGN('pawn-shop', 'checks-cashed', 'bail-bonds')],
    ['stucco-pink', 'white', 'shop-white', 'awning-stripe-red', SIGN('nails-and-spa', 'flowers', 'cafe-luna')], ['brick-painted-black', 'black', 'shop-black', '', SIGN('tattoo', 'bar', 'records')], ['tile-green', 'cream', 'shop-green', 'awning-stripe-green', SIGN('barber-shop', 'used-books', 'pizza')],
    ['stucco-yellow', 'white', 'shop-red', 'awning-yellow', SIGN('tacos-el-rey', 'burgers', 'discount-99')], ['concrete-panel-stained', 'grey', 'shop-vacant', '', SIGN('for-lease')], ['brick-buff', 'brown', 'shop-brick-kick', 'awning-navy', SIGN('hardware', 'dry-cleaners', 'thrift-store')],
    ['block-blue', 'white', 'shop-blue', '', SIGN('cell-phones', 'smoke-shop', 'auto-parts')], ['stucco-white-stained', 'white-old', 'shop-vacant-brown', 'awning-faded', SIGN('for-lease', 'furniture')], ['metal-panel-silver', 'charcoal', 'shop-low-black', '', SIGN('gym', 'dental', 'noodle-house')],
  ];
  SHOP1.forEach(([wl, tr, sh, aw, sg], i) => shop(`store-${i + 1}`, `平屋の商店 ${i + 1}`, {
    w: 7 + (i % 4) * 4.5, d: 12 + (i % 3) * 3, floors: 1, gh: 4.6 + (i % 2) * 0.5, wall: W(wl), side: W(i % 2 ? 'block-grey' : 'brick-red-common'), trim: T(tr), win: WIN('sash-white'), shop: WIN(sh), signs: sg, ...(aw ? { awning: `trim/${aw}` } : {}),
    parapet: 0.7, plant: 2, ...(i % 4 === 2 ? { billboard: `trim/billboard-${['cola', 'injury', 'radio'][(i >> 2) % 3]}` } : {}),
  }));
  // Shops with flats or offices above.
  const MIXED: [string, string, string, string, string, string[]][] = [
    ['brick-red', 'cream', 'sash-white', 'shop-green', 'awning-green', SIGN('cafe-luna', 'used-books')], ['brick-brown', 'white', 'sash-brown', 'shop-old', 'awning-burgundy', SIGN('pawn-shop', 'liquor')], ['stucco-cream', 'brown', 'casement-brown', 'shop-bronze', 'awning-tan', SIGN('bakery', 'flowers')],
    ['brick-buff-sooty', 'grey', 'sash-white-old', 'shop-aluminium', '', SIGN('checks-cashed', 'laundromat')], ['stone-limestone', 'grey', 'sash-tall-black', 'shop-black', 'awning-black', SIGN('records', 'bar')], ['brick-painted-white', 'charcoal', 'sash-black', 'shop-white', 'awning-stripe-black', SIGN('barber-shop', 'nails-and-spa')],
    ['tile-cream', 'green', 'casement-white', 'shop-aluminium-tile', 'awning-stripe-green', SIGN('market', 'pharmacy')], ['brick-multi', 'white', 'sash-white-6over6', 'shop-red', 'awning-red', SIGN('pizza', 'hardware')], ['stucco-terracotta', 'cream', 'arch-brown', 'shop-brick-kick', '', SIGN('tacos-el-rey', 'noodle-house')],
    ['brick-dark', 'black', 'steel-loft-black', 'shop-black', '', SIGN('gym', 'tattoo')], ['stucco-mint', 'white', 'slider-white', 'shop-blue', 'awning-teal', SIGN('dry-cleaners', 'dental')], ['brick-red-flemish', 'white', 'sash-wide-white', 'shop-vacant', 'awning-faded', SIGN('for-lease', 'thrift-store')],
    ['concrete-panel', 'grey', 'office-aluminium', 'shop-low-aluminium', '', SIGN('cell-phones', 'discount-99')], ['brick-orange', 'cream', 'sash-green', 'shop-green', 'awning-stripe-yellow', SIGN('donuts', 'burgers')],
  ];
  MIXED.forEach(([wl, tr, wn, sh, aw, sg], i) => shop(`mixed-${i + 1}`, `店舗つき${2 + (i % 4)}階建て ${i + 1}`, {
    w: 7.5 + (i % 3) * 5, d: 15, floors: 2 + (i % 4), wall: W(wl), side: W(i % 2 ? 'brick-brown-common' : 'brick-red-common'), trim: T(tr), win: WIN(wn), dress: i % 3 === 2 ? 'sill' : 'head', shop: WIN(sh), signs: sg, ...(aw ? { awning: `trim/${aw}` } : {}),
    cornice: i % 3 !== 2, fire: i % 2 === 0, plant: 2, tank: i % 5 === 0, sideWin: i % 2, door: i % 2 ? 'door/steel-green' : 'door/glass-black',
    ...(i % 4 === 1 ? { blade: `trim/blade-${['hotel', 'loans', 'bar', 'pawn'][(i >> 2) % 4]}` } : {}), ...(i % 6 === 3 ? { billboard: 'trim/billboard-movie' } : {}),
  }));
}
