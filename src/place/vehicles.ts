import { CAR_SIZE } from '../assets/mesh/vehicles';
import { hash } from './site';
import { City } from '../gen/city';
import { DistrictType } from '../gen/districts';
import { LandUse } from '../gen/landuse';
import { Buildings, DriveMouth } from './buildings';
import { StreetFurniture } from './streetFurniture';

/** A parked car: a catalogue model in its own colour. */
export interface Vehicle {
  model: string;
  kind: 'car';
  x: number;
  y: number;
  h: number;
  /** The model's +x axis, its nose, points along (cos yaw, sin yaw). */
  yaw: number;
  slopeX?: number;
  /** Colour of the body. */
  tint: number;
  where: 'stall' | 'drive' | 'kerb';
}
export interface Vehicles {
  items: Vehicle[];
  /** Cars by where they stand and by model, and how many places there were. */
  stats: { stall: number; drive: number; kerb: number; stalls: number; drives: number; kerbs: number; models: Record<string, number> };
}

/** Body colours and how common each is: most cars are white, black, grey or silver. */
const COLOURS: [number, number][] = [
  [0xf2f2f0, 20], [0xdfe0e2, 6], [0x0c0c0e, 15], [0x1e1f22, 6], [0xa9adb2, 13], [0x6b6f75, 10], [0x44474c, 6],
  [0x7c1418, 5], [0xa3221c, 3], [0x1b2f5c, 5], [0x2a55a0, 3], [0x5f7f9c, 2], [0x1f3d2c, 2], [0x4a5a3a, 1.5],
  [0x5a3a22, 1.5], [0xb7a78a, 2.5], [0xd9cfb4, 1.5], [0xc98a1c, 0.8], [0xd4c020, 0.6], [0xd1551c, 0.7], [0x3a8f8a, 0.6], [0x6a2a5a, 0.4],
];
/** Colours the working vans and trucks come in. */
const WORK_COLOURS = [0xf2f2f0, 0xf2f2f0, 0xf2f2f0, 0xe4e4e0, 0xa9adb2, 0x1b2f5c, 0x7c1418, 0xd9cfb4, 0x2a55a0];
const TRUCKS = ['truck-box-white', 'truck-box-aluminium', 'truck-box-express', 'truck-box-mart', 'truck-box-movers', 'truck-box-logistics', 'truck-box-rental'];

type Mix = [string, number][];
/** What is driven where: weights of the models by the kind of place. */
const MIXES: Record<'centre' | 'homes' | 'suburb' | 'hills' | 'old' | 'beach' | 'work' | 'shops', Mix> = {
  centre: [['sedan', 18], ['sedan-large', 10], ['hatch', 12], ['compact', 12], ['suv', 12], ['suv-large', 4], ['coupe', 5], ['wagon', 5], ['minivan', 5], ['kei', 6], ['taxi', 6], ['van', 3], ['sedan-old', 1], ['police', 0.12]],
  shops: [['sedan', 14], ['hatch', 12], ['compact', 13], ['suv', 14], ['suv-large', 5], ['minivan', 10], ['kei', 9], ['kei-box', 4], ['wagon', 6], ['pickup', 4], ['van', 3], ['van-windows', 2], ['sedan-old', 3], ['coupe', 2]],
  homes: [['sedan', 14], ['hatch', 13], ['compact', 14], ['suv', 12], ['minivan', 10], ['kei', 12], ['kei-box', 5], ['wagon', 6], ['sedan-old', 4], ['pickup', 3], ['coupe', 2], ['van-windows', 2], ['suv-large', 3]],
  suburb: [['suv', 17], ['suv-large', 9], ['minivan', 13], ['sedan', 14], ['pickup', 10], ['hatch', 8], ['compact', 6], ['wagon', 7], ['sedan-large', 5], ['kei', 4], ['coupe', 3], ['sedan-old', 3], ['pickup-single', 2]],
  hills: [['suv', 16], ['suv-large', 14], ['sedan-large', 16], ['coupe', 12], ['sedan', 12], ['wagon', 8], ['minivan', 6], ['hatch', 8], ['pickup', 5]],
  old: [['compact', 16], ['kei', 14], ['hatch', 13], ['sedan', 12], ['sedan-old', 10], ['kei-box', 6], ['wagon', 5], ['suv', 6], ['minivan', 5], ['van', 4], ['kei-truck', 4], ['taxi', 2]],
  beach: [['suv', 14], ['compact', 12], ['hatch', 12], ['coupe', 8], ['pickup', 10], ['sedan', 10], ['minivan', 8], ['van-windows', 6], ['kei', 6], ['wagon', 6], ['sedan-old', 5], ['suv-large', 4]],
  work: [['pickup', 13], ['pickup-single', 9], ['van', 14], ['kei-truck', 8], ['sedan', 11], ['sedan-old', 9], ['compact', 9], ['hatch', 8], ['suv', 7], ['kei', 6], ['kei-box', 4], ['van-windows', 3]],
};
const mixOf = (type: DistrictType, use?: LandUse): Mix => {
  if (use && use.startsWith('I')) return MIXES.work;
  if (type === 'industrial') return MIXES.work;
  if (type === 'downtown' || type === 'midtown') return use && use.startsWith('C') ? MIXES.shops : MIXES.centre;
  if (use && use.startsWith('C')) return MIXES.shops;
  if (type === 'suburb') return MIXES.suburb;
  if (type === 'hills') return MIXES.hills;
  if (type === 'oldtown') return MIXES.old;
  if (type === 'beach') return MIXES.beach;
  return MIXES.homes;
};
const weighted = <T>(list: [T, number][], r: number): T => {
  let sum = 0;
  for (const [, w] of list) sum += w;
  let v = r * sum;
  for (const [it, w] of list) if ((v -= w) < 0) return it;
  return list[list.length - 1][0];
};

/** Share of the marked spaces of a lot that are taken in the day, by its use. */
const FULL: Partial<Record<LandUse, number>> = { R1: 0.5, R2: 0.45, R3: 0.4, C1: 0.5, C2: 0.55, C3: 0.6, C4: 0.5, O1: 0.75, O2: 0.8, I1: 0.6, I2: 0.55 };
/** Share of the kerb that is taken. */
const KERB: Record<DistrictType, number> = { downtown: 0.82, midtown: 0.72, oldtown: 0.7, residential: 0.45, suburb: 0.14, hills: 0.1, industrial: 0.3, beach: 0.6 };
/** Share of the house drives with a car on them in the day. */
const DRIVE: Record<DistrictType, number> = { downtown: 0.5, midtown: 0.5, oldtown: 0.5, residential: 0.5, suburb: 0.6, hills: 0.55, industrial: 0.5, beach: 0.5 };

/** Parks cars in the marked spaces, on the drives of the houses and along the kerb. */
export function placeVehicles(city: City, buildings: Buildings, furniture: StreetFurniture): Vehicles {
  const seed = city.config.seed;
  const lots = city.land.lots;
  const items: Vehicle[] = [];
  const stats: Vehicles['stats'] = { stall: 0, drive: 0, kerb: 0, stalls: 0, drives: 0, kerbs: 0, models: {} };
  // No two cars in one place: where spaces of two streets or two rows meet, the second car stays away.
  const CELL = 16;
  const placed = new Map<number, Vehicle[]>();
  const cellOf = (x: number, y: number): number => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
  const free = (v: Vehicle): boolean => {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) for (const o of placed.get(cellOf(v.x + i * CELL, v.y + j * CELL)) ?? []) if (carsOverlap(v, o, 0.25)) return false;
    return true;
  };
  // Nobody parks at the kerb across the mouth of a drive, whether or not a car stands on the drive.
  const mouths = new Map<number, DriveMouth[]>();
  for (const m of buildings.mouths) {
    const k = Math.floor(m.x / CELL) * 4096 + Math.floor(m.y / CELL);
    mouths.set(k, [...(mouths.get(k) ?? []), m]);
  }
  const overMouth = (x: number, y: number, yaw: number, len: number): boolean => {
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const m of mouths.get((Math.floor(x / CELL) + i) * 4096 + Math.floor(y / CELL) + j) ?? []) {
          const [dx, dy] = [m.x - x, m.y - y];
          // The mouth lies over the pavement on the car's kerb side, and the car reaches into its width.
          const lat = -dx * s + dy * c;
          if (lat > -1 && lat < 9 && Math.abs(dx * c + dy * s) < m.w / 2 + len / 2 - 0.3) return true;
        }
    return false;
  };
  const park = (where: Vehicle['where'], mix: Mix, x: number, y: number, h: number, yaw: number, slope: number, room: number, ...key: number[]): void => {
    let id = weighted(mix, hash(seed, 9001, ...key));
    // What is too long for the place gives way to something shorter.
    for (let k = 0; CAR_SIZE.get(`vehicle/${id}`)!.len > room && k < 6; k++) id = weighted(mix, hash(seed, 9002, k, ...key));
    if (CAR_SIZE.get(`vehicle/${id}`)!.len > room) id = 'compact';
    const work = id === 'van' || id === 'kei-truck' || id === 'pickup-single' || id === 'kei-box';
    const tint = id === 'taxi' ? 0xe0b010 : id === 'police' ? 0xf4f4f2 : id.startsWith('truck') ? 0xf0f0ee : work ? WORK_COLOURS[Math.floor(hash(seed, 9003, ...key) * WORK_COLOURS.length)] : weighted(COLOURS, hash(seed, 9003, ...key));
    // Nobody parks to the centimetre.
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    const along = (hash(seed, 9004, ...key) - 0.5) * (where === 'kerb' ? 0.7 : 0.5);
    // The place at the kerb is set out for a car 2.1 m wide against the kerb: what is wider stands further out, not over the pavement.
    const across = (hash(seed, 9005, ...key) - 0.5) * (where === 'kerb' ? 0.16 : 0.3) - (where === 'kerb' ? Math.max(0, (CAR_SIZE.get(`vehicle/${id}`)!.wid - 2.1) / 2) : 0);
    const model = `vehicle/${id}`;
    const v: Vehicle = { model, kind: 'car', x: x + c * along - s * across, y: y + s * along + c * across, h, yaw: yaw + (hash(seed, 9006, ...key) - 0.5) * 0.05, ...(Math.abs(slope) > 0.004 ? { slopeX: slope } : {}), tint, where };
    if (where === 'kerb' && overMouth(v.x, v.y, v.yaw, CAR_SIZE.get(model)!.len)) return;
    if (!free(v)) return;
    items.push(v);
    placed.set(cellOf(v.x, v.y), [...(placed.get(cellOf(v.x, v.y)) ?? []), v]);
    stats[where]++;
    stats.models[model] = (stats.models[model] ?? 0) + 1;
  };

  // --- Marked spaces and drives. ---
  const police = new Set(buildings.list.filter((b) => b.model.startsWith('civic/police')).map((b) => b.lot));
  // How full a car park is differs from lot to lot, and cars gather near the building rather than spread evenly.
  buildings.spots.forEach((sp, i) => {
    const lot = lots[sp.lot];
    const type = lot.site.type;
    if (sp.kind === 'drive') {
      stats.drives++;
      if (hash(seed, 9010, sp.lot) < DRIVE[type]) park('drive', mixOf(type, lot.use), sp.x, sp.y, sp.h, sp.yaw + (hash(seed, 9011, sp.lot) < 0.25 ? Math.PI : 0), 0, 5.3, sp.lot, 1);
      return;
    }
    stats.stalls++;
    const full = (FULL[lot.use] ?? 0.5) * (0.6 + 0.8 * hash(seed, 9012, sp.lot));
    if (police.has(sp.lot) && hash(seed, 9015, i) < 0.55) {
      park('stall', [['police', 1]], sp.x, sp.y, sp.h, sp.yaw + Math.PI, 0, 5.25, i, 4);
      return;
    }
    if (hash(seed, 9013, i) >= full) return;
    // Most drive in forwards.
    park('stall', mixOf(type, lot.use), sp.x, sp.y, sp.h, sp.yaw + (hash(seed, 9014, i) < 0.22 ? Math.PI : 0), 0, 5.25, i, 2);
  });

  // --- Along the kerb. ---
  const hydrants = furniture.items.filter((it) => it.kind === 'hydrant');
  const grid = new Map<number, { x: number; y: number }[]>();
  for (const hy of hydrants) {
    const k = Math.floor(hy.x / CELL) * 4096 + Math.floor(hy.y / CELL);
    grid.set(k, [...(grid.get(k) ?? []), hy]);
  }
  const near = (x: number, y: number, r: number): boolean => {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) for (const p of grid.get((Math.floor(x / CELL) + i) * 4096 + Math.floor(y / CELL) + j) ?? []) if (Math.hypot(p.x - x, p.y - y) < r) return true;
    return false;
  };
  furniture.kerb.forEach((k, i) => {
    stats.kerbs++;
    // No stopping by a hydrant.
    if (near(k.x, k.y, 4.2)) return;
    // Some streets are fuller than others.
    const full = KERB[k.type] * (0.55 + 0.9 * hash(seed, 9020, k.edge, k.side));
    if (hash(seed, 9021, i) >= full) return;
    const mix: Mix = k.type === 'industrial' || (hash(seed, 9022, i) < (k.type === 'downtown' || k.type === 'midtown' ? 0.05 : k.cls === 'local' ? 0.008 : 0.03)) ? [...mixOf(k.type), ...TRUCKS.map((t) => [t, k.type === 'industrial' ? 4 : 40] as [string, number])] : mixOf(k.type);
    park('kerb', mix, k.x, k.y, k.h + 0.01, k.yaw, k.slope, mix.length > 20 ? 7.2 : 5.9, i, 3);
  });
  return { items, stats };
}

/** Whether two cars stand in each other, with `margin` taken off the room each is given. */
export function carsOverlap(a: Vehicle, b: Vehicle, margin = 0): boolean {
  const [ra, rb] = [CAR_SIZE.get(a.model)!, CAR_SIZE.get(b.model)!];
  if (Math.hypot(a.x - b.x, a.y - b.y) > (ra.len + rb.len) / 2 + 1) return false;
  for (const [p, q, rp, rq] of [[a, b, ra, rb], [b, a, rb, ra]] as const) {
    const [c, s] = [Math.cos(p.yaw), Math.sin(p.yaw)];
    const [cq, sq] = [Math.cos(q.yaw), Math.sin(q.yaw)];
    const [dx, dy] = [q.x - p.x, q.y - p.y];
    const reach = (ux: number, uy: number): number => (Math.abs(ux * cq + uy * sq) * (rq.len - margin)) / 2 + (Math.abs(-ux * sq + uy * cq) * (rq.wid - margin)) / 2;
    if (Math.abs(dx * c + dy * s) > (rp.len - margin) / 2 + reach(c, s)) return false;
    if (Math.abs(-dx * s + dy * c) > (rp.wid - margin) / 2 + reach(-s, c)) return false;
  }
  return true;
}
