import { GOODS_ROWS, Goods } from '../tex';
import { MeshBuilder } from './builder';
import { Opening, slab, wall, weathering } from './buildkit';
import { Pose, at, box, face, lathe, move, pipe, stand, turn } from './kit';
import { CHAIR, ChairOpts, Machine, Setting, bench, chair, counter, dineSet, machine, mat, menuBoard, register, stool, table } from './props';

const PR = (c: string): string => `prop/${c}`;
const [CHROME, STEEL, BLACK, WHITE] = [PR('chrome'), PR('steel'), PR('plastic-black'), PR('laminate-white')];

/** What a shop sells, which is what its room is fitted for. */
export type Trade =
  | 'market' | 'liquor' | 'pharmacy' | 'discount' | 'hardware' | 'autoparts' | 'smoke' | 'phones' | 'convenience'
  | 'bakery' | 'donuts' | 'cafe' | 'pizza' | 'tacos' | 'burgers' | 'noodles' | 'bar'
  | 'laundromat' | 'barber' | 'nails' | 'tattoo' | 'dental' | 'gym'
  | 'books' | 'records' | 'thrift' | 'pawn' | 'furniture' | 'flowers' | 'checks' | 'bail' | 'cleaners'
  | 'hall-discount' | 'hall-market' | 'hall-hardware' | 'hall-furniture' | 'garage';
/** The trade behind each fascia sign. */
export const TRADES: Record<string, Trade> = {
  liquor: 'liquor', laundromat: 'laundromat', donuts: 'donuts', market: 'market', pharmacy: 'pharmacy', bakery: 'bakery', 'pawn-shop': 'pawn', 'checks-cashed': 'checks', 'bail-bonds': 'bail', 'nails-and-spa': 'nails',
  flowers: 'flowers', 'cafe-luna': 'cafe', tattoo: 'tattoo', bar: 'bar', records: 'records', 'barber-shop': 'barber', 'used-books': 'books', pizza: 'pizza', 'tacos-el-rey': 'tacos', burgers: 'burgers', 'discount-99': 'discount',
  hardware: 'hardware', 'dry-cleaners': 'cleaners', 'thrift-store': 'thrift', 'cell-phones': 'phones', 'smoke-shop': 'smoke', 'auto-parts': 'autoparts', furniture: 'furniture', gym: 'gym', dental: 'dental', 'noodle-house': 'noodles',
};
/** Floor and walls of each trade's room. */
const ROOM: Record<Trade, [string, string]> = {
  market: ['floor-lino-speckle', 'wall-plain-white'], liquor: ['floor-tile-grey', 'wall-plain-cream'], pharmacy: ['floor-tile-cream', 'wall-plain-white'], discount: ['floor-lino-speckle', 'wall-plain-yellow'], hardware: ['floor-concrete', 'wall-plain-grey'],
  autoparts: ['floor-concrete', 'wall-plain-white'], smoke: ['floor-check-bw', 'wall-plain-dark'], phones: ['floor-carpet-grey', 'wall-plain-white'], convenience: ['floor-tile-cream', 'wall-plain-white'],
  bakery: ['floor-tile-terracotta', 'wall-plain-cream'], donuts: ['floor-check-bw', 'wall-pink-chrome'], cafe: ['floor-wood', 'wall-plain-sage'], pizza: ['floor-check-red', 'wall-green-white'], tacos: ['floor-tile-terracotta', 'wall-yellow-wood'],
  burgers: ['floor-check-red', 'wall-cream-red'], noodles: ['floor-wood', 'wall-orange-brown'], bar: ['floor-wood', 'wall-plain-dark'],
  laundromat: ['floor-tile-beige', 'wall-plain-blue'], barber: ['floor-check-bw', 'wall-white-tile'], nails: ['floor-tile-cream', 'wall-plain-pink'], tattoo: ['floor-check-bw', 'wall-grey-black'], dental: ['floor-carpet-blue', 'wall-plain-white'], gym: ['floor-rubber', 'wall-plain-grey'],
  books: ['floor-wood', 'wall-plain-cream'], records: ['floor-concrete', 'wall-grey-black'], thrift: ['floor-lino-speckle', 'wall-plain-sage'], pawn: ['floor-carpet-red', 'wall-plain-cream'], furniture: ['floor-carpet-grey', 'wall-plain-white'], flowers: ['floor-tile-quarry', 'wall-plain-sage'],
  checks: ['floor-tile-grey', 'wall-plain-yellow'], bail: ['floor-carpet-green', 'wall-plain-cream'], cleaners: ['floor-tile-beige', 'wall-plain-blue'],
  'hall-discount': ['floor-lino-speckle', 'wall-plain-white'], 'hall-market': ['floor-lino-speckle', 'wall-plain-white'], 'hall-hardware': ['floor-concrete', 'wall-plain-grey'], 'hall-furniture': ['floor-carpet-grey', 'wall-plain-white'], garage: ['floor-concrete', 'wall-plain-grey'],
};

/** One shop's room: `x` is its middle and `z` the inside of its front wall; it runs back to z - d. */
export interface Bay { x: number; y: number; z: number; w: number; d: number; h: number; door: number; trade: Trade; n: number }
/** How far the inside of a wall stands from its outside. */
export const T_BAY = 0.14;

/** The room as part of the building: the walls with the same glass in the front, the floor, the ceiling and its lights. */
export function bayShell(b: MeshBuilder, r: Bay, holes: Opening[]): void {
  const [x0, x1, zb] = [r.x - r.w / 2, r.x + r.w / 2, r.z - r.d];
  const [floor, lining] = ROOM[r.trade];
  weathering(b, 0, r.n);
  // `holes` are given along the street front, from the left end of the room as the street sees it.
  wall(b, PR(lining), turn(stand([x1, r.y, r.z]), 180), r.w, r.h, holes.map((o) => ({ ...o, x: r.w - o.x - o.w, depth: 0.03 })));
  wall(b, PR(lining), stand([x0, r.y, zb]), r.w, r.h);
  wall(b, PR(lining), turn(stand([x0, r.y, r.z]), 90), r.d, r.h);
  wall(b, PR(lining), turn(stand([x1, r.y, zb]), -90), r.d, r.h);
  slab(b, PR(floor), r.y + 0.012, x0, zb, x1, r.z);
  const c = r.y + r.h;
  b.quad('prop/ceiling', [x0, c, zb], [x1, c, zb], [x1, c, r.z], [x0, c, r.z], [[x0, zb], [x1, zb], [x1, r.z], [x0, r.z]]);
  const [nx, nz] = [Math.max(1, Math.round(r.w / 2.6)), Math.max(2, Math.round(r.d / 2.6))];
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const [x, z] = [x0 + ((i + 0.5) * r.w) / nx, zb + ((k + 0.5) * r.d) / nz];
      b.quad('prop/light', [x - 0.6, c - 0.012, z - 0.3], [x + 0.6, c - 0.012, z - 0.3], [x + 0.6, c - 0.012, z + 0.3], [x - 0.6, c - 0.012, z + 0.3], [[0, 0], [0.6, 0], [0.6, 0.6], [0, 0.6]]);
    }
}

// --- What shops are fitted with. Each stands against a wall behind it and faces +z, unless it says otherwise. ---
/** Rows of goods on a face `w` wide and up to `h` high, cut at a whole shelf. */
function goods(b: MeshBuilder, f: Pose, kind: Goods, w: number, h: number, n = 0): void {
  const ph = 2 / GOODS_ROWS[kind];
  const hh = Math.max(1, Math.floor((h + 1e-6) / ph)) * ph;
  const u = (((n * 37) % 100) / 100) * 2.4;
  face(b, PR(`goods-${kind}`), f, [0, hh / 2, 0], w, hh, [u, 0, u + w, hh]);
}
export function shelving(b: MeshBuilder, f: Pose, w: number, kind: Goods, o: { h?: number; d?: number; n?: number; body?: string } = {}): void {
  const [h, d] = [o.h ?? 2, o.d ?? 0.4];
  box(b, o.body ?? WHITE, f, [0, h / 2, d / 2], [w / 2, h / 2, d / 2], 'Y');
  goods(b, move(f, 0, 0.02, d + 0.004), kind, w - 0.04, h - 0.04, o.n);
}
/** Shelves standing free with goods on both faces, `len` long across the way it faces. */
export function gondola(b: MeshBuilder, f: Pose, len: number, kinds: Goods[], n = 0, h = 1.42): void {
  box(b, WHITE, f, [0, h / 2, 0], [len / 2, h / 2, 0.24], 'Y');
  goods(b, move(f, 0, 0.02, 0.244), kinds[n % kinds.length], len - 0.04, h - 0.04, n);
  goods(b, move(turn(f, 180), 0, 0.02, 0.244), kinds[(n + 1) % kinds.length], len - 0.04, h - 0.04, n + 3);
}
/** A glass case of goods with a top to serve over. */
export function showcase(b: MeshBuilder, f: Pose, w: number, kind: Goods, body = WHITE): void {
  box(b, body, f, [0, 0.6, 0], [w / 2, 0.6, 0.33], 'Y');
  const ph = 2 / GOODS_ROWS[kind];
  const rows = Math.max(1, Math.floor(0.95 / ph));
  face(b, PR(`goods-${kind}`), f, [0, 0.2 + (rows * ph) / 2, 0.334], w - 0.06, rows * ph, [0, 0, w - 0.06, rows * ph]);
  box(b, STEEL, f, [0, 1.21, 0], [w / 2 + 0.01, 0.012, 0.34]);
}
export function washers(b: MeshBuilder, f: Pose, count: number, dry = false): void {
  const [pw, h, d, tex] = dry ? [0.8, 1.9, 0.7, 'dryer'] : [0.7, 0.9, 0.62, 'washer'];
  const w = count * pw;
  box(b, dry ? STEEL : WHITE, f, [0, h / 2, d / 2], [w / 2, h / 2, d / 2], 'Y');
  face(b, PR(tex), f, [0, h / 2, d + 0.004], w, h, [0, 0, w, h]);
  if (!dry) for (let i = 0; i < count; i += 3) box(b, PR(['plastic-orange', 'plastic-blue', 'plastic-white'][(i / 3) % 3]), f, [-w / 2 + (i + 0.5) * pw, h + 0.13, d / 2], [0.09, 0.13, 0.06]);
}
const leg = (b: MeshBuilder, m: string, f: Pose, x: number, z: number, h: number, r = 0.014, y = 0): void => pipe(b, m, [at(f, x, y, z), at(f, x, y + h, z)], r, 5, false);
/** A barber's or dentist's chair on its pedestal. */
export function salonChair(b: MeshBuilder, f: Pose, m: string): void {
  lathe(b, CHROME, f, [[0.3, 0], [0.3, 0.03], [0.06, 0.08], [0.05, 0.42], [0.2, 0.45]], 12);
  box(b, m, f, [0, 0.52, 0], [0.26, 0.06, 0.26]);
  box(b, m, f, [0, 0.9, -0.26], [0.24, 0.33, 0.05]);
  box(b, m, f, [0, 1.3, -0.26], [0.13, 0.08, 0.045]);
  for (const sx of [-1, 1]) box(b, CHROME, f, [sx * 0.29, 0.72, -0.02], [0.025, 0.02, 0.2]);
  box(b, CHROME, f, [0, 0.2, 0.38], [0.18, 0.012, 0.08]);
}
/** A mirror on the wall with a shelf under it and the chair before it. */
export function station(b: MeshBuilder, f: Pose, m: string, n = 0): void {
  face(b, PR('mirror'), f, [0, 1.5, 0.02], 0.8, 1.2);
  box(b, PR('laminate-black'), f, [0, 0.86, 0.16], [0.48, 0.02, 0.16]);
  box(b, PR('laminate-black'), f, [0, 0.43, 0.14], [0.46, 0.41, 0.12], 'Y');
  for (let i = 0; i < 3; i++) box(b, PR(['plastic-teal', 'plastic-white', 'plastic-red'][(i + n) % 3]), f, [-0.3 + i * 0.13, 0.94, 0.14], [0.025, 0.06, 0.025]);
  salonChair(b, turn(move(f, ((n * 7) % 5) * 0.03 - 0.06, 0, 1.0), 180 + ((n * 13) % 7) * 6 - 18), m);
}
export function sofa(b: MeshBuilder, f: Pose, w: number, m: string): void {
  box(b, m, f, [0, 0.22, 0.02], [w / 2, 0.22, 0.42], 'Y');
  box(b, m, f, [0, 0.6, -0.3], [w / 2, 0.24, 0.12]);
  for (const sx of [-1, 1]) box(b, m, f, [sx * (w / 2 - 0.09), 0.5, 0.06], [0.09, 0.12, 0.38]);
}
export function bed(b: MeshBuilder, f: Pose, m: string): void {
  box(b, PR('wood-walnut'), f, [0, 0.16, 0], [0.8, 0.16, 1.02], 'Y');
  box(b, WHITE, f, [0, 0.42, 0.04], [0.76, 0.1, 0.96]);
  box(b, m, f, [0, 0.47, 0.3], [0.78, 0.06, 0.7]);
  box(b, PR('wood-walnut'), f, [0, 0.55, -1.0], [0.82, 0.55, 0.03]);
  for (const sx of [-1, 1]) box(b, WHITE, f, [sx * 0.38, 0.56, -0.7], [0.28, 0.05, 0.18]);
}
/** Clothes on a rail, `len` long across the way it faces. */
export function clothesRail(b: MeshBuilder, f: Pose, len: number, n = 0, h = 1.55): void {
  for (const sx of [-1, 1]) {
    leg(b, CHROME, f, sx * len / 2, 0, h, 0.016);
    box(b, CHROME, f, [sx * len / 2, 0.02, 0], [0.02, 0.02, 0.28]);
  }
  const u = ((n * 53) % 100) / 100 * 2.4;
  for (const g of [f, turn(f, 180)]) face(b, PR('goods-clothes'), g, [0, h - 0.58, 0.003], len, 1.2, [u, 0, u + len, 1.2]);
}
const flat = (f: Pose): Pose => ({ o: f.o, x: f.x, y: [-f.z[0], -f.z[1], -f.z[2]], z: f.y });
/** A bin of records or a table of things laid out flat, `w` long. */
export function bin(b: MeshBuilder, f: Pose, w: number, kind: Goods, body = PR('wood-pine'), d = 0.36, h = 0.82): void {
  box(b, body, f, [0, h / 2, 0], [w / 2, h / 2, d], 'Y');
  const ph = 2 / GOODS_ROWS[kind];
  const rows = Math.max(1, Math.floor((2 * d - 0.04) / ph));
  face(b, PR(`goods-${kind}`), flat(move(f, 0, h + 0.004, 0)), [0, 0, 0], w - 0.04, rows * ph, [0, 0.0, w - 0.04, rows * ph]);
}
/** Steps of buckets of flowers. */
export function flowerStand(b: MeshBuilder, f: Pose, w: number, n = 0): void {
  for (let k = 0; k < 3; k++) {
    box(b, PR('wood-pine'), f, [0, 0.12 + k * 0.14, 0.75 - k * 0.3], [w / 2, 0.12 + k * 0.14, 0.15], 'Y');
    const u = (((n + k) * 41) % 100) / 100 * 2.4;
    face(b, PR('goods-flowers'), f, [0, 0.24 + k * 0.28 + 0.45, 0.75 - k * 0.3], w - 0.1, 0.9, [u, 0, u + w - 0.1, 0.9]);
  }
}
/** A counter with a glass screen over it, as where money is handed across. */
export function wicket(b: MeshBuilder, f: Pose, w: number, front: string, top: string): void {
  box(b, front, f, [0, 0.525, 0], [w / 2, 0.525, 0.3], 'yY');
  box(b, top, f, [0, 1.07, 0.02], [w / 2 + 0.02, 0.02, 0.36]);
  for (const g of [f, turn(f, 180)]) face(b, PR('glass-aluminium-low'), g, [0, 1.84, 0.0], w, 1.5, [0, 0, w, 1.5]);
}
export function desk(b: MeshBuilder, f: Pose, w: number, m: string, seat: ChairOpts, n = 0): void {
  box(b, m, f, [0, 0.36, 0.3], [w / 2, 0.36, 0.015]);
  for (const sx of [-1, 1]) box(b, m, f, [sx * (w / 2 - 0.015), 0.36, 0], [0.015, 0.36, 0.3]);
  box(b, m, f, [0, 0.735, 0], [w / 2 + 0.02, 0.015, 0.34]);
  const s = turn(move(f, w * 0.12, 0.75, -0.08), 180);
  box(b, BLACK, s, [0, 0.01, 0], [0.1, 0.01, 0.08]);
  leg(b, BLACK, s, 0, 0, 0.12, 0.015);
  box(b, BLACK, s, [0, 0.28, 0.01], [0.25, 0.16, 0.012]);
  box(b, WHITE, f, [-w * 0.25, 0.76, 0.05], [0.11, 0.006 + (n % 3) * 0.006, 0.15]);
  chair(b, turn(move(f, w * 0.1, 0, -0.62), ((n * 5) % 7) * 6 - 18), seat);
}
export function plant(b: MeshBuilder, f: Pose, h = 1.3): void {
  lathe(b, PR('plastic-brown'), f, [[0.16, 0], [0.22, 0.4], [0.19, 0.4], [0.001, 0.38]], 10);
  lathe(b, PR('plastic-green'), move(f, 0, 0.38, 0), [[0.03, 0], [0.3, h * 0.3], [0.36, h * 0.5], [0.2, h * 0.68], [0.001, h * 0.72]], 7);
}
export function atm(b: MeshBuilder, f: Pose): void {
  box(b, PR('plastic-grey'), f, [0, 0.85, 0.22], [0.3, 0.85, 0.22], 'Y');
  face(b, PR('atm'), f, [0, 0.85, 0.444], 0.6, 1.7);
}
export function tv(b: MeshBuilder, f: Pose, w = 1.2): void {
  box(b, BLACK, f, [0, 0, 0.03], [w / 2 + 0.02, w * 0.3 + 0.02, 0.03]);
  face(b, PR('tv'), f, [0, 0, 0.062], w, w * 0.6);
}
/** Posts with a belt between them, along the points given. */
export function stanchions(b: MeshBuilder, f: Pose, pts: [number, number][], belt = PR('plastic-red')): void {
  pts.forEach(([x, z], i) => {
    lathe(b, CHROME, move(f, x, 0, z), [[0.16, 0], [0.16, 0.02], [0.025, 0.05], [0.025, 0.95], [0.04, 0.98], [0.001, 1.0]], 8);
    if (i) {
      const [px, pz] = pts[i - 1];
      const len = Math.hypot(x - px, z - pz);
      const g = turn(move(f, (x + px) / 2, 0.88, (z + pz) / 2), (Math.atan2(-(z - pz), x - px) * 180) / Math.PI);
      box(b, belt, g, [0, 0, 0], [len / 2, 0.025, 0.004]);
    }
  });
}
export function treadmill(b: MeshBuilder, f: Pose): void {
  box(b, BLACK, f, [0, 0.11, 0], [0.38, 0.05, 0.85]);
  box(b, PR('plastic-grey'), f, [0, 0.165, 0.05], [0.26, 0.006, 0.7]);
  for (const sx of [-1, 1]) pipe(b, PR('plastic-grey'), [at(f, sx * 0.36, 0.15, -0.6), at(f, sx * 0.36, 1.15, -0.8), at(f, sx * 0.36, 1.1, -0.3)], 0.025, 6);
  box(b, BLACK, f, [0, 1.25, -0.82], [0.36, 0.14, 0.04]);
}
export function weightBench(b: MeshBuilder, f: Pose, n = 0): void {
  box(b, PR('vinyl-black'), f, [0, 0.46, 0.1], [0.15, 0.04, 0.6]);
  for (const z of [-0.35, 0.55]) box(b, STEEL, f, [0, 0.21, z], [0.2, 0.21, 0.025]);
  for (const sx of [-1, 1]) leg(b, STEEL, f, sx * 0.5, -0.4, 1.05, 0.025);
  pipe(b, CHROME, [at(f, -0.95, 1.02, -0.4), at(f, 0.95, 1.02, -0.4)], 0.016, 6);
  for (const sx of [-1, 1]) for (let k = 0; k < 1 + (n % 3); k++) lathe(b, BLACK, { o: at(f, sx * (0.68 + k * 0.05), 1.02, -0.4), x: f.z, y: f.x, z: f.y }, [[0.001, -0.02], [0.2 - k * 0.03, -0.02], [0.2 - k * 0.03, 0.02], [0.001, 0.02]], 12);
}
export function dumbbells(b: MeshBuilder, f: Pose, w: number): void {
  for (const [y, z] of [[0.45, 0.32], [0.85, 0.16]]) {
    box(b, STEEL, f, [0, y, z], [w / 2, 0.015, 0.14]);
    for (let x = -w / 2 + 0.18; x < w / 2 - 0.1; x += 0.3) for (const sz of [-1, 1]) box(b, BLACK, f, [x, y + 0.07, z + sz * 0.09], [0.06 + (x + w) * 0.008, 0.055 + (x + w) * 0.006, 0.035]);
  }
  for (const sx of [-1, 1]) box(b, STEEL, f, [sx * (w / 2 - 0.02), 0.45, 0.22], [0.02, 0.45, 0.24], 'Y');
}
export function notice(b: MeshBuilder, f: Pose, tex: string): void {
  box(b, BLACK, f, [0, 0, 0.008], [0.33, 0.48, 0.008]);
  face(b, PR(tex), f, [0, 0, 0.018], 0.6, 0.9);
}

/** Everything that stands in a shop's room. */
export function fitBay(b: MeshBuilder, r: Bay): void {
  const F = stand([r.x, r.y + 0.012, r.z]);
  const [W, D, n, t] = [r.w / 2, r.d, r.n, r.trade];
  const back = (x: number, z = -D): Pose => move(F, x, 0, z);
  const side = (s: number, z: number, off = 0): Pose => turn(move(F, s * (W - off), 0, z), s > 0 ? -90 : 90);
  // The door is to one side or in the middle; the till goes to the other side.
  const ds = r.door < -0.4 ? -1 : r.door > 0.4 ? 1 : 0;
  const cs = ds !== 0 ? -ds : n % 2 ? 1 : -1;
  const wide = r.w >= 5.4;
  const way = (x: number, z: number, m = 0.9): boolean => Math.abs(x - r.door) < m && z > -2.4;
  mat(b, move(F, r.door, 0, -0.75), n % 2 ? 'prop/mat-rubber' : 'prop/mat-welcome');
  const chairs = (f: Pose, k: number, o: ChairOpts, pitch = 0.56): void => {
    for (let i = 0; i < k; i++) chair(b, move(f, (i - (k - 1) / 2) * pitch, 0, 0.3), o);
  };
  /** Shelves round the walls, a till by the door or at the back, and rows of shelves down the room. */
  const store = (o: { walls: Goods[]; mid: Goods[] | null; back: Goods; behind: Goods; counter: string; top: string; h?: number }): void => {
    const cool = o.back === 'cooler';
    shelving(b, back(0), r.w - 0.1, o.back, { n, d: cool ? 0.6 : 0.4, ...(cool ? { body: STEEL } : {}) });
    const zb = -D + (cool ? 0.6 : 0.4);
    let z0 = -0.5;
    if (wide) {
      counter(b, side(cs, -2.3, 1.2), 2.4, PR(o.counter), PR(o.top), 1, n);
      shelving(b, side(cs, -2.3), 2.8, o.behind, { d: 0.3, n: n + 1 });
      z0 = -3.9;
      if (z0 - zb > 1) shelving(b, side(cs, (z0 + zb) / 2), z0 - zb, o.walls[0], { n: n + 2 });
      shelving(b, side(-cs, (-0.5 + zb) / 2), -0.5 - zb, o.walls[1 % o.walls.length], { n: n + 3 });
    } else {
      const cw = Math.max(1.4, r.w - 1.7);
      counter(b, back(-cs * (W - 0.15 - cw / 2) , zb - 1.35), cw, PR(o.counter), PR(o.top), 1, n);
      for (const s of [-1, 1]) if (-0.5 - (zb - 2.4) > 1) shelving(b, side(s, (-0.5 + zb - 2.4) / 2), -0.5 - (zb - 2.4), o.walls[(s + 1) / 2 % o.walls.length], { n: n + 2 + s });
    }
    if (!o.mid) return;
    const span = r.w - 3.0;
    const m = span < 0 ? 0 : Math.floor(span / 1.5) + 1;
    const ze = (wide ? zb : zb - 2.4) - 1.2;
    for (let i = 0; i < m; i++) {
      const x = m === 1 ? 0 : -span / 2 + (i * span) / (m - 1);
      const zs = wide && x * cs > W - 3.1 ? -4.3 : way(x, -1.6, 1.2) ? -2.6 : -1.5;
      if (zs - ze > 1.2) gondola(b, turn(move(F, x, 0, (zs + ze) / 2), 90), zs - ze, o.mid, n + i, o.h ?? 1.42);
    }
  };
  /** A counter across the back with the kitchen behind it, and tables in front. */
  const eatery = (o: { counter: string; top: string; menu: string; machines: Machine[]; chair: string; table: string; set: Setting; show?: Goods }): void => {
    const zc = -D + 2.2;
    const cw = r.w - 1.5;
    const cx = -cs * 0.6;
    let x = cx - cw / 2 + 0.7;
    for (let i = 0; i < 8; i++) {
      const kind = o.machines[i % o.machines.length];
      const wd = kind === 'fryer' || kind === 'oven' ? 0.8 : kind === 'coffee' ? 0.9 : 1.2;
      if (x + wd > cx + cw / 2 - 0.3) break;
      machine(b, back(x + wd / 2, -D + 0.37), kind);
      x += wd + 0.04;
    }
    menuBoard(b, move(back(cx), 0, 2.0, 0), PR(o.menu), Math.min(3.2, cw - 0.4));
    const sw = o.show ? Math.min(1.8, cw * 0.45) : 0;
    counter(b, back(cx + (cs * sw) / 2, zc), cw - sw, PR(o.counter), PR(o.top), cw - sw > 3.6 ? 2 : 1, n);
    if (o.show) showcase(b, back(cx - (cs * (cw - sw)) / 2, zc), sw, o.show, PR(o.counter));
    const seat = CHAIR[o.chair];
    for (const s of [-1, 1])
      for (let z = -1.25, i = 0; z - 0.8 > zc + 1.0; z -= 1.85, i++) {
        if (way(s * (W - 0.55), z, 1.0)) continue;
        dineSet(b, move(F, s * (W - 0.5), 0, z), { table: { top: PR(o.table), kind: i % 2 ? 'pedestal' : 'legs', set: (i + n) % 3 === 0 ? 'condiments' : o.set }, chair: seat, seats: 2, n: n + i * 2 + (s > 0 ? 1 : 0) });
      }
    if (r.w >= 5.6) for (let z = -2.9, i = 0; z - 0.9 > zc + 1.2; z -= 2.3, i++) dineSet(b, move(F, r.door > 0.4 ? -0.5 : r.door < -0.4 ? 0.5 : (i % 2 ? 0.9 : -0.9), 0, z), { table: { top: PR(o.table), kind: 'pedestal', w: 1.2, d: 0.75, set: o.set }, chair: seat, seats: 4, n: n + i * 3 });
  };
  const waiting = (s: number, z: number, k: number, o: ChairOpts): void => chairs(side(s, z), k, o);
  switch (t) {
    case 'market': return store({ walls: ['grocery', 'snacks'], mid: ['grocery', 'cans', 'snacks'], back: 'cooler', behind: 'tobacco', counter: 'counter-green', top: 'laminate-white' });
    case 'convenience': return store({ walls: ['snacks', 'magazines'], mid: ['snacks', 'cans', 'grocery'], back: 'cooler', behind: 'tobacco', counter: 'counter-red', top: 'laminate-white' });
    case 'liquor': return store({ walls: ['bottles', 'bottles'], mid: ['bottles', 'cans'], back: 'cooler', behind: 'bottles', counter: 'counter-wood', top: 'laminate-black' });
    case 'pharmacy': return store({ walls: ['pharmacy', 'pharmacy'], mid: ['pharmacy', 'snacks'], back: 'pharmacy', behind: 'pharmacy', counter: 'counter-teal', top: 'laminate-white' });
    case 'discount': return store({ walls: ['discount', 'cans'], mid: ['discount', 'snacks', 'discount'], back: 'discount', behind: 'tobacco', counter: 'counter-yellow', top: 'laminate-white' });
    case 'hardware': return store({ walls: ['tools', 'paint'], mid: ['parts', 'paint', 'tools'], back: 'tools', behind: 'tools', counter: 'counter-wood', top: 'steel', h: 1.6 });
    case 'autoparts': return store({ walls: ['parts', 'tyres'], mid: ['parts', 'paint'], back: 'tyres', behind: 'parts', counter: 'counter-steel', top: 'laminate-black', h: 1.6 });
    case 'smoke': return store({ walls: ['tobacco', 'bottles'], mid: null, back: 'tobacco', behind: 'tobacco', counter: 'counter-black', top: 'laminate-black' });
    case 'phones': {
      store({ walls: ['phones', 'phones'], mid: null, back: 'phones', behind: 'phones', counter: 'counter-black', top: 'laminate-white' });
      for (let z = -2.8, i = 0; z > -D + 2.2; z -= 2.2, i++) {
        const f = move(F, wide ? -cs * 0.6 : 0, 0, z);
        table(b, f, { top: WHITE, kind: 'legs', w: 1.5, d: 0.7 });
        for (let k = 0; k < 5; k++) box(b, k % 2 ? BLACK : WHITE, f, [-0.56 + k * 0.28, 0.79, ((k * 3 + i) % 3) * 0.12 - 0.12], [0.04, 0.05, 0.02]);
      }
      notice(b, move(side(-cs, -1.2), 0, 2.45, 0.01), 'notice-phone');
      return;
    }
    case 'bakery': return eatery({ counter: 'counter-wood', top: 'laminate-cream', menu: 'menu-coffee', machines: ['oven', 'shelf', 'coffee', 'oven'], chair: 'wood-oak', table: 'wood-oak', set: 'coffee', show: 'pastry' });
    case 'donuts': return eatery({ counter: 'counter-teal', top: 'laminate-white', menu: 'menu-donut', machines: ['coffee', 'shelf', 'fryer', 'coffee'], chair: 'bistro-chrome', table: 'laminate-white', set: 'coffee', show: 'pastry' });
    case 'cafe': return eatery({ counter: 'counter-black', top: 'wood-walnut', menu: 'menu-coffee', machines: ['coffee', 'fridge', 'shelf', 'coffee'], chair: 'wood-walnut', table: 'wood-walnut', set: 'coffee', show: 'pastry' });
    case 'pizza': return eatery({ counter: 'counter-wood', top: 'laminate-cream', menu: 'menu-pizza', machines: ['oven', 'oven', 'shelf', 'dispenser', 'fridge'], chair: 'wood-oak', table: 'wood-oak', set: 'pizza' });
    case 'tacos': return eatery({ counter: 'counter-yellow', top: 'steel', menu: 'menu-taco', machines: ['shelf', 'fryer', 'dispenser', 'fridge'], chair: 'shell-yellow', table: 'laminate-cream', set: 'tray' });
    case 'burgers': return eatery({ counter: 'counter-red', top: 'laminate-white', menu: 'menu-burger', machines: ['dispenser', 'fryer', 'fryer', 'shelf', 'coffee'], chair: 'shell-red', table: 'laminate-white', set: 'tray' });
    case 'noodles': return eatery({ counter: 'counter-black', top: 'wood-walnut', menu: 'menu-noodle', machines: ['shelf', 'fridge', 'dispenser', 'shelf'], chair: 'wood-walnut', table: 'wood-walnut', set: 'noodle' });
    case 'bar': {
      // The bar down one side with the bottles behind it, high tables down the other.
      const [z0, z1] = [-1.6, -D + 1.0];
      const len = z0 - z1;
      counter(b, side(cs, (z0 + z1) / 2, 1.15), len, PR('counter-wood'), PR('wood-walnut'), 1, n);
      shelving(b, side(cs, (z0 + z1) / 2), len, 'bottles', { d: 0.3, n });
      for (let z = z0 - 0.4, i = 0; z > z1 + 0.3; z -= 0.72, i++) if ((i + n) % 6 !== 4) stool(b, turn(move(F, cs * (W - 1.95), 0, z), i * 50), { mat: PR('vinyl-red'), kind: 'pedestal' });
      for (let z = -1.5, i = 0; z > -D + 1.2; z -= 1.9, i++) if (!way(-cs * (W - 0.7), z, 1.0)) dineSet(b, move(F, -cs * (W - 0.75), 0, z), { table: { top: PR('wood-walnut'), kind: 'high', set: 'none' }, chair: CHAIR['wood-walnut'], seats: 2 + (i % 2), n: n + i, stoolMat: PR('vinyl-black') });
      tv(b, move(back(-cs * 0.8), 0, 2.2, 0.01));
      return;
    }
    case 'laundromat': {
      const zb = -D + 0.3;
      washers(b, side(cs, (-0.8 + zb) / 2), Math.floor((-0.8 - zb) / 0.7));
      washers(b, side(-cs, (-2.6 + zb) / 2), Math.floor((-2.6 - zb) / 0.8), true);
      for (let z = -3.2, i = 0; z > -D + 1.6; z -= 2.6, i++) {
        const f = turn(move(F, cs * (wide ? -0.3 : -0.1), 0, z), 90);
        table(b, f, { top: PR('laminate-white'), kind: 'legs', w: 1.7, d: Math.min(0.8, r.w - 3.4) });
        box(b, PR(['plastic-blue', 'plastic-white', 'plastic-orange'][(i + n) % 3]), f, [0.3 - i * 0.5, 0.86, 0], [0.26, 0.11, 0.18], 'Y');
      }
      bench(b, side(-cs, -1.4, 0.32), 1.8, PR('vinyl-teal'), PR('plastic-grey'), 0.9);
      machine(b, back(cs * (W - 1.5), -D + 0.37), 'fridge');
      notice(b, move(back(-cs * 0.4), 0, 1.7, 0.01), 'notice-sale');
      return;
    }
    case 'barber': case 'nails': case 'tattoo': {
      const vinyl = PR(t === 'barber' ? 'vinyl-red' : t === 'nails' ? 'vinyl-cream' : 'vinyl-black');
      const k = Math.max(2, Math.min(5, Math.floor((D - 2.6) / 1.7)));
      for (let i = 0; i < k; i++) station(b, side(cs, -2.0 - i * 1.7), vinyl, n + i);
      if (t === 'nails') for (let i = 0; i < k; i++) dineSet(b, turn(move(F, -cs * (W - 1.3), 0, -3.6 - i * 1.6), 90), { table: { top: WHITE, kind: 'legs', w: 0.9, d: 0.5, set: 'none' }, chair: CHAIR['pad-teal'], seats: 2, n: n + i });
      else {
        bench(b, side(-cs, -4.0, 0.32), Math.min(2.6, D - 5), vinyl, PR('wood-walnut'), 0.95);
        for (let i = 0; i < 3; i++) notice(b, move(side(-cs, -2.2 - i * 0.9), 0, 1.75, 0.01), t === 'barber' ? 'notice-hair' : 'notice-flash');
      }
      desk(b, turn(move(F, -cs * (W - 1.0), 0, -1.7), cs > 0 ? 90 : -90), 1.3, PR(t === 'tattoo' ? 'laminate-black' : 'wood-oak'), CHAIR['pad-black'], n);
      plant(b, move(F, cs * (W - 0.45), 0, -0.6));
      return;
    }
    case 'dental': case 'bail': case 'checks': {
      // A front room to wait in, and the rest behind a wall or a screen.
      const zc = Math.max(-D + 1.6, -4.4);
      if (t === 'checks') {
        wicket(b, back(-cs * 0.5, zc), r.w - 1.2, PR('counter-steel'), PR('laminate-grey'));
        atm(b, side(-cs, -1.6));
        stanchions(b, F, [[-cs * 1.2 - 0.9, zc + 1.2], [-cs * 1.2 + 0.9, zc + 1.2], [-cs * 1.2 + 0.9, zc + 2.2]]);
        for (let i = 0; i < 2; i++) desk(b, back((i - 0.5) * Math.min(2.4, r.w - 2), zc - 1.6), 1.3, PR('laminate-grey'), CHAIR['pad-black'], n + i);
      } else {
        desk(b, back(-cs * (W - 1.4), zc + 0.5), 1.8, PR(t === 'dental' ? 'laminate-white' : 'wood-walnut'), CHAIR['pad-black'], n);
        box(b, PR(ROOM[t][1]), F, [cs * 0.55, 1.2, zc - 0.4], [W - 0.55, 1.2, 0.05]);
        if (t === 'bail') for (let i = 0; i < 2; i++) desk(b, turn(move(F, cs * (W - 1.0), 0, zc - 1.8 - i * 2), cs > 0 ? -90 : 90), 1.4, PR('wood-walnut'), CHAIR['pad-black'], n + 1 + i);
        else salonChair(b, turn(move(F, cs * 0.6, 0, zc - 2.2), 180), PR('vinyl-teal'));
      }
      waiting(cs, -1.9, Math.max(2, Math.min(4, Math.floor((-0.6 - zc - 0.8) / 0.56))), CHAIR[t === 'dental' ? 'pad-teal' : 'shell-yellow']);
      plant(b, move(F, -cs * (W - 0.45), 0, -0.6));
      for (let i = 0; i < 2; i++) notice(b, move(side(cs, -1.4 - i * 1.0), 0, 1.85, 0.01), t === 'dental' ? 'notice-smile' : t === 'bail' ? 'notice-bail' : 'notice-rates');
      return;
    }
    case 'gym': {
      const k = Math.max(1, Math.floor((r.w - 1.4) / 1.1));
      for (let i = 0; i < k; i++) if (!way(-W + 1.1 + i * 1.1, -1.5, 0.8)) treadmill(b, turn(move(F, -W + 1.1 + i * 1.1, 0, -1.6), 180));
      for (let z = -1.2; z > -D + 0.6; z -= 0.8) face(b, PR('mirror'), side(cs, z), [0, 1.3, 0.02], 0.8, 1.2);
      for (let z = -4.4, i = 0; z > -D + 1.4; z -= 2.1, i++) weightBench(b, turn(move(F, cs * (W - 1.9), 0, z), cs > 0 ? -90 : 90), n + i);
      dumbbells(b, side(-cs, Math.max(-D + 1.6, -5.2)), Math.min(2.4, D - 4));
      tv(b, move(back(0), 0, 2.2, 0.01));
      notice(b, move(side(-cs, -2.2), 0, 1.8, 0.01), 'notice-fit');
      desk(b, turn(move(F, -cs * (W - 0.9), 0, -3.4), cs > 0 ? 90 : -90), 1.2, PR('laminate-black'), CHAIR['pad-black'], n);
      return;
    }
    case 'books': return store({ walls: ['books', 'books'], mid: ['books', 'magazines'], back: 'books', behind: 'books', counter: 'counter-wood', top: 'wood-oak', h: 1.66 });
    case 'records': {
      store({ walls: ['records', 'records'], mid: null, back: 'records', behind: 'records', counter: 'counter-black', top: 'laminate-black' });
      const span = r.w - 3.2;
      const m = span < 0 ? 1 : Math.floor(span / 1.6) + 1;
      for (let i = 0; i < m; i++) {
        const x = m === 1 ? (wide ? -cs * 0.4 : 0) : -span / 2 + (i * span) / (m - 1);
        const [zs, ze] = [wide && x * cs > W - 3.1 ? -4.3 : -2.7, -D + (wide ? 1.6 : 4.0)];
        if (zs - ze > 1.2) bin(b, turn(move(F, x, 0, (zs + ze) / 2), 90), zs - ze, 'records');
      }
      return;
    }
    case 'thrift': case 'cleaners': {
      if (t === 'thrift') store({ walls: ['fold', 'fold'], mid: null, back: 'fold', behind: 'electronics', counter: 'counter-green', top: 'laminate-cream' });
      else {
        counter(b, back(-cs * 0.5, -2.9), r.w - 1.3, PR('counter-teal'), PR('laminate-white'), 1, n);
        waiting(cs, -1.5, 2, CHAIR['shell-yellow']);
        notice(b, move(side(-cs, -1.5), 0, 1.8, 0.01), 'notice-sale');
      }
      // Rails of clothes across the room.
      const [zs, ze] = t === 'thrift' ? [wide ? -4.4 : -2.8, -D + (wide ? 1.4 : 3.6)] : [-4.2, -D + 0.6];
      const len = Math.max(1.2, r.w - (t === 'thrift' ? 2.6 : 1.0));
      for (let z = zs, i = 0; z > ze; z -= t === 'thrift' ? 1.5 : 0.9, i++) clothesRail(b, move(F, 0, 0, z), len, n + i, t === 'thrift' ? 1.55 : 1.9);
      return;
    }
    case 'pawn': {
      shelving(b, back(0), r.w - 0.1, 'electronics', { n });
      shelving(b, side(cs, (-0.6 - D + 0.4) / 2), D - 1.0, 'electronics', { n: n + 1, d: 0.35 });
      const len = Math.min(D - 3.2, 5);
      showcase(b, side(-cs, -1.4 - len / 2, 1.3), len, 'jewel', PR('wood-walnut'));
      showcase(b, back(-cs * (W - 2.2) , -1.4 - len - 0.33), 1.8, 'jewel', PR('wood-walnut'));
      register(b, turn(move(F, -cs * (W - 1.3), 1.23, -2.0), cs > 0 ? 90 : -90));
      notice(b, move(side(-cs, -2.4), 0, 1.9, 0.01), 'notice-rates');
      return;
    }
    case 'furniture': {
      const M = ['vinyl-brown', 'vinyl-cream', 'vinyl-teal', 'vinyl-green', 'vinyl-black', 'vinyl-red'];
      for (let z = -1.7, i = 0; z > -D + 1.2; z -= 2.5, i++) {
        const s = i % 2 ? cs : -cs;
        sofa(b, side(s, z, 0.45), 1.9, PR(M[(n + i) % M.length]));
        table(b, move(F, s * (W - 1.75), 0, z), { top: PR(i % 2 ? 'wood-walnut' : 'wood-oak'), kind: 'legs', w: 0.6, d: 1.0 });
        if (r.w > 5) { sofa(b, turn(move(F, s * (W - 2.9), 0, z), s > 0 ? 90 : -90), 0.95, PR(M[(n + i + 2) % M.length])); bed(b, side(-s, z - 0.3, 1.05), PR(M[(n + i + 3) % M.length])); }
        else if (i % 2 === 0) dineSet(b, move(F, -s * (W - 1.1), 0, z - 1.2), { table: { top: PR('wood-oak'), kind: 'legs', w: 0.9, d: 0.9, set: 'none' }, chair: CHAIR['wood-oak'], seats: 2, n: n + i });
      }
      desk(b, back(-cs * (W - 1.2), -D + 0.9), 1.4, PR('wood-walnut'), CHAIR['pad-black'], n);
      return;
    }
    case 'hall-discount': case 'hall-market': case 'hall-hardware': case 'hall-furniture': {
      // A hall: tills on both sides of the way in, shelves round the walls, and long rows of shelves, or rooms set out to show furniture.
      const kinds: Goods[] = t === 'hall-discount' ? ['discount', 'snacks', 'cans', 'fold'] : t === 'hall-market' ? ['grocery', 'cans', 'snacks', 'bottles'] : t === 'hall-hardware' ? ['tools', 'paint', 'parts'] : ['fold', 'electronics'];
      const tills = t === 'hall-furniture' ? 1 : 5;
      for (const s of [-1, 1]) for (let x = 4.4, i = 0; x < W - 1.5 && i < tills; x += 2.3, i++) counter(b, turn(move(F, s * x, 0, -3.6), s > 0 ? -90 : 90), 2.2, PR(i % 2 ? 'counter-steel' : 'counter-red'), PR('laminate-black'), 1, n + i);
      shelving(b, back(0), r.w - 0.1, t === 'hall-market' ? 'cooler' : kinds[0], { n, d: t === 'hall-market' ? 0.6 : 0.4, ...(t === 'hall-market' ? { body: STEEL } : {}) });
      for (const s of [-1, 1]) shelving(b, side(s, (-1 - D + 0.7) / 2), D - 1.7, kinds[(s + 1) / 2], { n: n + s });
      if (t !== 'hall-furniture') {
        for (let x = -W + 2.2, i = 0; x < W - 2; x += 2.5, i++) gondola(b, turn(move(F, x, 0, (-6.4 - D + 1.8) / 2), 90), D - 8.2, kinds, n + i, 1.8);
        return;
      }
      const M = ['vinyl-brown', 'vinyl-cream', 'vinyl-teal', 'vinyl-green', 'vinyl-black', 'vinyl-red'];
      for (let z = -6.5, j = 0; z > -D + 2.5; z -= 3.6, j++)
        for (let x = -W + 3, i = 0; x < W - 2.5; x += 4.6, i++) {
          const f = move(F, x, 0, z);
          const k = (i + j * 2 + n) % 3;
          if (k === 0) { sofa(b, f, 1.9, PR(M[(i + j + n) % M.length])); table(b, move(f, 0, 0, 1.2), { top: PR('wood-walnut'), kind: 'legs', w: 1.0, d: 0.6 }); sofa(b, turn(move(f, 1.7, 0, 1.0), -90), 0.95, PR(M[(i + j + n + 2) % M.length])); }
          else if (k === 1) bed(b, turn(f, 180), PR(M[(i * 3 + j + n) % M.length]));
          else dineSet(b, f, { table: { top: PR('wood-oak'), kind: 'legs', w: 1.5, d: 0.9, set: 'none' }, chair: CHAIR['wood-oak'], seats: 4, n: n + i });
        }
      return;
    }
    case 'garage': {
      // A workshop: lifts on the floor, benches and tool chests along the back, tyres and drums in the corners.
      for (let x = -W + 2.6, i = 0; x < W - 1.8; x += 4.4, i++) {
        const f = move(F, x, 0, -4.6);
        for (const sx of [-1, 1]) {
          box(b, PR(i % 2 ? 'plastic-blue' : 'plastic-red'), f, [sx * 1.5, 1.35, 0], [0.11, 1.35, 0.14], 'Y');
          for (const sz of [-1, 1]) box(b, STEEL, f, [sx * 0.95, 0.16, sz * 0.5], [0.5, 0.03, 0.05]);
        }
      }
      for (let x = -W + 1.2, i = 0; x < W - 1; i++) {
        if (i % 3 === 1) { box(b, PR('plastic-red'), back(x + 0.45), [0, 0.5, 0.25], [0.45, 0.5, 0.25], 'Y'); face(b, PR('toolchest'), back(x + 0.45), [0, 0.5, 0.504], 0.9, 1); x += 1.1; }
        else { const len = Math.min(2.6, W - 1 - x); if (len < 1) break; shelving(b, back(x + len / 2), len, i % 3 ? 'parts' : 'tools', { d: 0.5, n: n + i }); x += len + 0.2; }
      }
      shelving(b, side(cs, -D + 3.2), Math.min(3.6, D - 4), 'tyres', { d: 0.5, n });
      for (let i = 0; i < 3; i++) for (let k = 0; k < 2 + ((i + n) % 3); k++) lathe(b, BLACK, move(F, -cs * (W - 0.5), k * 0.23, -D + 0.6 + i * 0.75), [[0.2, 0], [0.33, 0.03], [0.33, 0.2], [0.2, 0.23]], 12);
      for (let i = 0; i < 3; i++) lathe(b, PR(['plastic-blue', 'plastic-red', 'plastic-green'][(i + n) % 3]), move(F, -cs * (W - 0.45 - (i % 2) * 0.62), 0, -1.2 - Math.floor(i / 2) * 0.62), [[0.001, 0], [0.29, 0], [0.29, 0.88], [0.001, 0.88]], 12);
      box(b, PR('plastic-orange'), move(F, cs * (W - 1.2), 0, -2.2), [0, 0.3, 0], [0.45, 0.3, 0.25], 'Y');
      return;
    }
    case 'flowers': {
      const zb = -D + 0.6;
      shelving(b, back(0), r.w - 0.1, 'cooler', { n, d: 0.6, body: STEEL });
      for (const s of [-1, 1]) {
        const [z0, z1] = [s === cs ? -3.4 : -0.6, zb - 0.4];
        if (z0 - z1 > 1.2) flowerStand(b, side(s, (z0 + z1) / 2), z0 - z1, n + s);
      }
      counter(b, side(cs, -2.0, 1.15), 1.8, PR('counter-wood'), PR('wood-oak'), 1, n);
      if (r.w > 5) for (let z = -3.2; z > zb - 1.6; z -= 2.2) { flowerStand(b, turn(move(F, -cs * 0.3, 0, z), 90), 1.6, n + 5); }
      return;
    }
  }
}
