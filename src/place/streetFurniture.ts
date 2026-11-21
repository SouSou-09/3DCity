import { V3 } from '../assets/mesh/builder';
import { Layout, layout, reversed } from '../assets/mesh/section';
import { Vec2 } from '../core/vec2';
import { City } from '../gen/city';
import { DistrictType } from '../gen/districts';
import { RoadClass } from '../gen/streamlines';
import { Junction, JunctionArm, RoadModel } from './roadModel';

export type FurnitureKind = 'signal' | 'ped' | 'cabinet' | 'stop' | 'street' | 'speed' | 'light';

/** One catalogue model standing in the city. */
export interface Placed {
  model: string;
  kind: FurnitureKind;
  /** Map position and height of the model's origin. */
  x: number;
  y: number;
  h: number;
  /** The model's +x axis points along (cos yaw, sin yaw) on the map, its +z axis along (-sin yaw, cos yaw). */
  yaw: number;
  /** Junction (index into the road model's junctions) or edge it belongs to. */
  junction?: number;
  edge?: number;
  /** Junction arm it serves. */
  arm?: number;
}

export interface StreetFurniture {
  items: Placed[];
  stats: Record<FurnitureKind, number>;
}

/** Signal masts by the length of their arm. */
const MASTS: [number, string][] = [
  [6, 'signal/mast-6-one'],
  [8, 'signal/mast-8-two'],
  [9, 'signal/mast-9-two-street'],
  [11, 'signal/mast-11-left'],
  [12, 'signal/mast-12-doghouse'],
  [14, 'signal/mast-14-fya'],
  [17, 'signal/mast-17-four'],
];
const CABINETS = ['signal/cabinet-aluminium', 'signal/cabinet-green', 'signal/cabinet-tagged', 'signal/cabinet-large', 'signal/cabinet-with-meter', 'signal/cabinet-battery'];

/** Street light per district: on arterials, collectors and local streets (null: only what the junctions bring). */
const LIGHTS: Record<string, [string, string, string | null]> = {
  downtown: ['furniture/light-led-11', 'furniture/light-led-9', 'furniture/light-disc'],
  midtown: ['furniture/light-cobra-10', 'furniture/light-led-9', 'furniture/light-cobra-8'],
  oldtown: ['furniture/light-acorn', 'furniture/light-lantern', 'furniture/light-globe'],
  residential: ['furniture/light-cobra-10', 'furniture/light-cobra-8', 'furniture/light-cobra-8'],
  suburb: ['furniture/light-cobra-10', 'furniture/light-davit', null],
  hills: ['furniture/light-cobra-8', 'furniture/light-cobra-8', null],
  beach: ['furniture/light-globe-twin', 'furniture/light-globe', 'furniture/light-acorn'],
  industrial: ['furniture/light-cobra-12-long', 'furniture/light-cobra-10', 'furniture/light-cobra-concrete'],
};
/** The tired version of a light, for the odd one along a street. */
const TIRED: [string, string][] = [
  ['light-cobra', 'furniture/light-cobra-rusty'],
  ['light-led', 'furniture/light-led-off'],
  ['light-globe', 'furniture/light-globe-off'],
  ['light-acorn', 'furniture/light-acorn-off'],
  ['light-lantern', 'furniture/light-lantern-off'],
  ['light-disc', 'furniture/light-disc-off'],
];
/** Lights on a post top shine less far than those on an arm over the road. */
const isPostTop = (id: string): boolean => /light-(globe|acorn|lantern|disc)/.test(id);

const SPEED: Record<string, string> = { arterial: 'sign/speed-40', collector: 'sign/speed-30', local: 'sign/speed-25' };

/** Deterministic value in [0, 1) from a few integers. */
function hash(...v: number[]): number {
  let h = 2166136261;
  for (const x of v) {
    h ^= Math.round(x) + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const right = (t: Vec2): Vec2 => ({ x: -t.y, y: t.x });
/** Yaw that turns a model's +x axis along `d`. */
const along = (d: Vec2): number => Math.atan2(d.y, d.x);
/** Yaw that turns a model's front (+z) towards `d`. */
const facing = (d: Vec2): number => Math.atan2(-d.x, d.y);

/**
 * Stands the signals, signs and street lights of the catalogue along the roads as built: masts and pedestrian heads
 * at signalled junctions, stop signs where a stop line is painted, street name signs, speed limits and lights.
 */
export function placeStreetFurniture(city: City, roads: RoadModel): StreetFurniture {
  const { graph, profiles } = city;
  const items: Placed[] = [];
  const stats: Record<FurnitureKind, number> = { signal: 0, ped: 0, cabinet: 0, stop: 0, street: 0, speed: 0, light: 0 };
  const seed = city.config.seed;

  // Poles keep clear of each other.
  const CELL = 4;
  const grid = new Map<number, Placed[]>();
  const key = (x: number, y: number): number => Math.floor(x / CELL) * 8192 + Math.floor(y / CELL);
  const free = (x: number, y: number, r: number): boolean => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const o of grid.get(key(x + dx * CELL, y + dy * CELL)) ?? []) if (Math.hypot(o.x - x, o.y - y) < r) return false;
    return true;
  };
  const put = (it: Placed, clear = 1.2): boolean => {
    if (!free(it.x, it.y, clear)) return false;
    items.push(it);
    stats[it.kind]++;
    const k = key(it.x, it.y);
    const cell = grid.get(k);
    if (cell) cell.push(it);
    else grid.set(k, [it]);
    return true;
  };

  /** Layout of an arm's road, looking away from the junction. */
  const armLay = (a: JunctionArm): Layout => layout(a.end === 0 ? roads.sections[a.edge] : reversed(roads.sections[a.edge]));
  /** Point of an arm `d` from the centre and `x` to the right of it (looking outward), standing on the pavement if there is one. */
  const armPoint = (j: Junction, a: JunctionArm, lay: Layout, d: number, x: number): { x: number; y: number; h: number } => {
    const r = right(a.dir);
    const px = j.x + a.dir.x * d + r.x * x;
    const py = j.y + a.dir.y * d + r.y * x;
    const raised = x > lay.road[1] ? lay.outerY[1] : x < lay.road[0] ? lay.outerY[0] : 0;
    return { x: px, y: py, h: j.plane.h + j.plane.gx * (px - j.x) + j.plane.gy * (py - j.y) + raised };
  };
  /** Distance behind the kerb for a pole: in the pavement where there is room, else just off the edge. */
  const behind = (w: number): number => (w >= 1.2 ? 0.7 : w + 0.4);

  roads.junctions.forEach((j, ji) => {
    const arms = j.arms.filter((a) => roads.lines[a.edge] && Number.isFinite(a.reach));
    if (arms.length < 3) return;
    const street = (a: JunctionArm): boolean => {
      const c = graph.edges[a.edge].cls;
      return c !== 'highway' && c !== 'ramp' && c !== 'path';
    };
    if (j.signal) {
      arms.forEach((a, ai) => {
        if (!street(a) && graph.edges[a.edge].cls !== 'ramp') return;
        const lay = armLay(a);
        const L = a.reach - a.approach;
        const wr = lay.outer[1] - lay.road[1];
        const wl = lay.road[0] - lay.outer[0];
        // Traffic leaving along this arm from the far side looks at a mast standing at the arm's right-hand corner.
        const opposite = arms.some((o) => o !== a && o.dir.x * a.dir.x + o.dir.y * a.dir.y < -0.64);
        if (opposite) {
          const need = lay.road[1] + behind(wr) + 0.5;
          const mast = MASTS.find(([len]) => len >= need) ?? MASTS[MASTS.length - 1];
          const p = armPoint(j, a, lay, L + 0.2, lay.road[1] + behind(wr));
          put({ model: mast[1], kind: 'signal', ...p, yaw: along(right(a.dir)), junction: ji, arm: ai }, 0.8);
        }
        if (a.control === 'signal' && !arms.some((o) => o !== a && o.dir.x * a.dir.x + o.dir.y * a.dir.y < -0.64)) {
          // Nothing straight ahead to hang a mast over: a post at the stop line instead.
          const p = armPoint(j, a, lay, a.reach - 0.6, lay.road[0] - behind(wl));
          put({ model: 'signal/post-top-ped', kind: 'signal', ...p, yaw: facing(a.dir), junction: ji, arm: ai }, 0.8);
        }
        if (a.crosswalk) {
          // A pedestrian head at each end of the crossing, looking across it.
          const r = right(a.dir);
          const pr = armPoint(j, a, lay, L + 2.2, lay.road[1] + behind(wr));
          const pl = armPoint(j, a, lay, L + 2.2, lay.road[0] - behind(wl));
          put({ model: 'signal/ped-pole', kind: 'ped', ...pr, yaw: facing({ x: -r.x, y: -r.y }), junction: ji, arm: ai }, 0.8);
          put({ model: 'signal/ped-pole', kind: 'ped', ...pl, yaw: facing(r), junction: ji, arm: ai }, 0.8);
        }
      });
      // The controller cabinet at the back of the widest pavement.
      let best: { a: JunctionArm; lay: Layout; w: number } | null = null;
      for (const a of arms) {
        const lay = armLay(a);
        const w = lay.road[0] - lay.outer[0];
        if (street(a) && w > (best?.w ?? 1.5)) best = { a, lay, w };
      }
      if (best) {
        const p = armPoint(j, best.a, best.lay, best.a.reach + 2.5, best.lay.outer[0] + 0.45);
        put({ model: CABINETS[Math.floor(hash(seed, ji, 11) * CABINETS.length)], kind: 'cabinet', ...p, yaw: facing(right(best.a.dir)), junction: ji }, 1);
      }
      return;
    }
    const stops = arms.filter((a) => a.control === 'stop');
    let named = false;
    arms.forEach((a, ai) => {
      if (a.control !== 'stop') return;
      const lay = armLay(a);
      const wl = lay.road[0] - lay.outer[0];
      const p = armPoint(j, a, lay, a.reach - 0.5, lay.road[0] - behind(wl));
      const roll = hash(seed, ji, ai, 3);
      let model = stops.length === arms.length ? 'sign/stop-all-way' : 'sign/stop';
      if (!named && roll < 0.5) {
        model = roll < 0.08 ? 'sign/stop-street-names-old' : 'sign/stop-street-names';
        named = true;
      } else if (roll > 0.97) model = 'sign/stop-old-leaning';
      else if (roll > 0.95) model = 'sign/stop-bent';
      put({ model, kind: 'stop', ...p, yaw: facing(a.dir), junction: ji, arm: ai }, 0.8);
      if (model.startsWith('sign/stop-street')) stats.street++;
    });
    if (!named) {
      // Street names on their own post at a corner.
      const a = arms.find(street);
      if (a) {
        const lay = armLay(a);
        const wr = lay.outer[1] - lay.road[1];
        const p = armPoint(j, a, lay, a.reach - a.approach + 0.3, lay.road[1] + behind(wr));
        const roll = hash(seed, ji, 5);
        const model = roll < 0.06 ? 'sign/street-old-leaning' : roll < 0.2 ? 'sign/street-two-u' : 'sign/street-two';
        put({ model, kind: 'street', ...p, yaw: along(a.dir), junction: ji }, 0.8);
      }
    }
  });

  // Along the roads.
  graph.edges.forEach((e) => {
    const line = roads.lines[e.id];
    const cross = roads.cross[e.id];
    if (!line || !cross || line.length < 2) return;
    const cls: RoadClass = e.cls;
    if (cls === 'alley' || cls === 'path') return;
    const lay = layout(roads.sections[e.id]);
    const p = profiles[e.id];
    const s = [0];
    for (let k = 1; k < line.length; k++) s.push(s[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][2] - line[k - 1][2]));
    const len = s[s.length - 1];
    /** Point at distance d along the road and x to its right, with the direction of the road there. */
    const at = (d: number, x: number): { x: number; y: number; h: number; t: Vec2 } => {
      let k = 1;
      while (k < line.length - 1 && s[k] < d) k++;
      const [a, b]: [V3, V3] = [line[k - 1], line[k]];
      const q = Math.min(1, Math.max(0, (d - s[k - 1]) / (s[k] - s[k - 1] || 1)));
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      const t = { x: (b[0] - a[0]) / l, y: (b[2] - a[2]) / l };
      const r = right(t);
      const raised = x > lay.road[1] ? lay.outerY[1] : x < lay.road[0] ? lay.outerY[0] : 0;
      const c = cross[k - 1] + (cross[k] - cross[k - 1]) * q;
      return { x: a[0] + (b[0] - a[0]) * q + r.x * x, y: a[2] + (b[2] - a[2]) * q + r.y * x, h: a[1] + (b[1] - a[1]) * q + c * x + raised, t };
    };
    const offR = lay.road[1] + behind(lay.outer[1] - lay.road[1]);
    const offL = lay.road[0] - behind(lay.road[0] - lay.outer[0]);

    if (cls === 'highway') {
      // Twin lights on the median barrier.
      for (let d = 30 + 60 * hash(seed, e.id, 1); d < len - 10; d += 60) {
        const q = at(d, 0);
        put({ model: 'furniture/light-cobra-twin', kind: 'light', x: q.x, y: q.y, h: q.h, yaw: along(right(q.t)), edge: e.id }, 6);
      }
      return;
    }
    if (cls === 'ramp') {
      for (let d = 25 + 30 * hash(seed, e.id, 1); d < len - 15; d += 55) {
        const q = at(d, lay.outer[1] - 0.15);
        put({ model: 'furniture/light-cobra-12-long', kind: 'light', x: q.x, y: q.y, h: q.h, yaw: along(right(q.t)), edge: e.id }, 6);
      }
      return;
    }

    const set = LIGHTS[p.type as DistrictType] ?? LIGHTS.residential;
    const base = cls === 'arterial' ? set[0] : cls === 'collector' ? set[1] : set[2];
    if (base && len > 24) {
      const post = isPostTop(base);
      const gap = (post ? 0.62 : 1) * (cls === 'arterial' ? 38 : cls === 'collector' ? 43 : 55);
      const both = cls !== 'local';
      const count = Math.max(1, Math.round((len - 12) / gap));
      const step = (len - 12) / count;
      const first = hash(seed, e.id, 2) < 0.5 ? 1 : -1;
      for (let k = 0; k < count; k++) {
        const d = 6 + step * (k + 0.5);
        // Staggered from side to side; a local street keeps to one side.
        const side = both ? (k % 2 ? first : -first) : first;
        const q = at(d, side > 0 ? offR : offL);
        const r = right(q.t);
        let model = base;
        if (hash(seed, e.id, k, 4) < 0.05) model = TIRED.find(([m]) => base.includes(m))?.[1] ?? base;
        put({ model, kind: 'light', x: q.x, y: q.y, h: q.h, yaw: along(side > 0 ? r : { x: -r.x, y: -r.y }), edge: e.id }, 2.5);
      }
    }

    // A speed limit a little way into the longer roads, for each direction.
    const limit = SPEED[cls];
    if (limit && len > (cls === 'local' ? 260 : 140) && (cls !== 'local' || hash(seed, e.id, 6) < 0.25)) {
      const model = p.type === 'downtown' && cls === 'arterial' ? 'sign/speed-35' : hash(seed, e.id, 7) < 0.06 && cls === 'local' ? 'sign/speed-25-old' : limit;
      const fwd = at(34, offR);
      put({ model, kind: 'speed', x: fwd.x, y: fwd.y, h: fwd.h, yaw: facing({ x: -fwd.t.x, y: -fwd.t.y }), edge: e.id }, 1.5);
      if (!p.oneWay) {
        const back = at(len - 34, offL);
        put({ model, kind: 'speed', x: back.x, y: back.y, h: back.h, yaw: facing(back.t), edge: e.id }, 1.5);
      }
    }
  });

  return { items, stats };
}
