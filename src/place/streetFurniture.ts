import { V3 } from '../assets/mesh/builder';
import { Layout, layout, reversed } from '../assets/mesh/section';
import { Vec2 } from '../core/vec2';
import { City } from '../gen/city';
import { DistrictType } from '../gen/districts';
import { RailIndex } from '../gen/rail';
import { isWater } from '../gen/terrain';
import { RoadClass } from '../gen/streamlines';
import { Junction, JunctionArm, RoadModel } from './roadModel';

export type FurnitureKind = 'signal' | 'ped' | 'cabinet' | 'stop' | 'street' | 'speed' | 'light' | 'oneway' | 'warning' | 'guide';

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
  /** Junction (index into the road model's junctions) it belongs to, if any, and the edge it stands beside. */
  junction?: number;
  edge?: number;
  /** Junction arm it serves (index into the junction's arms). */
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
  const stats: Record<FurnitureKind, number> = { signal: 0, ped: 0, cabinet: 0, stop: 0, street: 0, speed: 0, light: 0, oneway: 0, warning: 0, guide: 0 };
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
  // Carriageways as built, so that nothing ends up in a lane of the road next door.
  type Seg = { ax: number; ay: number; ah: number; bx: number; by: number; bh: number; l: number; r: number; edge: number };
  const LANE = 40;
  const lanes = new Map<number, Seg[]>();
  const laneKey = (x: number, y: number): number => Math.floor(x / LANE) * 8192 + Math.floor(y / LANE);
  const addSeg = (sg: Seg): void => {
    const n = Math.max(1, Math.ceil(Math.hypot(sg.bx - sg.ax, sg.by - sg.ay) / (LANE / 2)));
    let last = NaN;
    for (let k = 0; k <= n; k++) {
      const kk = laneKey(sg.ax + ((sg.bx - sg.ax) * k) / n, sg.ay + ((sg.by - sg.ay) * k) / n);
      if (kk === last) continue;
      last = kk;
      const cell = lanes.get(kk);
      if (cell) cell.push(sg);
      else lanes.set(kk, [sg]);
    }
  };
  graph.edges.forEach((e) => {
    const line = roads.lines[e.id];
    if (!line || e.cls === 'path') return;
    const lay = layout(roads.sections[e.id]);
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      addSeg({ ax: a[0], ay: a[2], ah: a[1], bx: b[0], by: b[2], bh: b[1], l: lay.road[0], r: lay.road[1], edge: e.id });
    }
  });
  for (const j of roads.junctions) {
    for (const a of j.arms) {
      if (!roads.lines[a.edge] || !Number.isFinite(a.reach) || graph.edges[a.edge].cls === 'path') continue;
      // The arm's approach, between the corner and the start of the road itself.
      const lay = layout(a.end === 0 ? roads.sections[a.edge] : reversed(roads.sections[a.edge]));
      const d0 = Math.max(0, a.reach - a.approach - 1);
      const at = (d: number): [number, number, number] => {
        const [x, y] = [j.x + a.dir.x * d, j.y + a.dir.y * d];
        return [x, y, j.plane.h + j.plane.gx * (x - j.x) + j.plane.gy * (y - j.y)];
      };
      const [p, q] = [at(d0), at(a.reach)];
      addSeg({ ax: p[0], ay: p[1], ah: p[2], bx: q[0], by: q[1], bh: q[2], l: lay.road[0], r: lay.road[1], edge: a.edge });
    }
  }
  /** Whether a point lies in the carriageway of a road at its own level (other than `own`). */
  const inLane = (x: number, y: number, h: number, own?: number): boolean => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const sg of lanes.get(laneKey(x + dx * LANE, y + dy * LANE)) ?? []) {
          if (sg.edge === own) continue;
          const [vx, vy] = [sg.bx - sg.ax, sg.by - sg.ay];
          const l = Math.hypot(vx, vy) || 1;
          const u = ((x - sg.ax) * vx + (y - sg.ay) * vy) / (l * l);
          if (u < 0 || u > 1 || Math.abs(sg.ah + (sg.bh - sg.ah) * u - h) > 2.5) continue;
          const off = ((x - sg.ax) * -vy + (y - sg.ay) * vx) / l;
          if (off > sg.l - 0.3 && off < sg.r + 0.3) return true;
        }
    return false;
  };

  /** Whether a point lies on the railway's ballast at the level of the rails. */
  const railIndex = new RailIndex(city.rail);
  const onTrack = (x: number, y: number, h: number): boolean => {
    const hit = railIndex.nearest(x, y, 8);
    if (!hit) return false;
    const tr = roads.rail.lines[hit.line];
    return hit.d < tr.tracks * 2 + 2.8 && Math.abs(tr.level[hit.seg] - h) < 3;
  };

  const put = (it: Placed, clear = 1.2, own?: number): boolean => {
    if (!free(it.x, it.y, clear) || inLane(it.x, it.y, it.h, own) || onTrack(it.x, it.y, it.h)) return false;
    if (isWater(city.terrain, it.x, it.y) && !(it.edge !== undefined && graph.edges[it.edge].bridge)) return false;
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

  /** Walks a road as built: its length and the point `d` along it and `x` to its right, with the road's direction there. */
  const track = (id: number): { len: number; lay: Layout; at: (d: number, x: number) => { x: number; y: number; h: number; t: Vec2 } } | null => {
    const line = roads.lines[id];
    const cross = roads.cross[id];
    if (!line || !cross || line.length < 2) return null;
    const lay = layout(roads.sections[id]);
    const s = [0];
    for (let k = 1; k < line.length; k++) s.push(s[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][2] - line[k - 1][2]));
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
    return { len: s[s.length - 1], lay, at };
  };
  const rev = (t: Vec2): Vec2 => ({ x: -t.x, y: -t.y });
  const isStreet = (id: number): boolean => {
    const c = graph.edges[id].cls;
    return c !== 'highway' && c !== 'ramp' && c !== 'path';
  };

  /**
   * Whether a ramp carries traffic off the freeway. Traffic keeps right, so a ramp that leaves the freeway's
   * right-hand side (seen along the carriageway it peels away from) is an exit and one on the left an entrance.
   * Also gives the freeway edge upstream of the fork and the fork's node.
   */
  type Ramp = { exit: boolean; node: number; upstream: number | null; t: Vec2 };
  const ramps = new Map<number, Ramp | null>();
  const rampInfo = (id: number): Ramp | null => {
    let r = ramps.get(id);
    if (r === undefined) ramps.set(id, (r = rampOf(id)));
    return r;
  };
  const rampOf = (id: number): Ramp | null => {
    const e = graph.edges[id];
    for (const node of [e.a, e.b]) {
      const hw = graph.nodes[node].edges.filter((o) => graph.edges[o].cls === 'highway');
      if (!hw.length) continue;
      const leave = (o: number): Vec2 => {
        const ed = graph.edges[o];
        const pts = ed.a === node ? ed.points : [...ed.points].reverse();
        const q = pts[Math.min(pts.length - 1, 3)];
        const l = Math.hypot(q.x - pts[0].x, q.y - pts[0].y) || 1;
        return { x: (q.x - pts[0].x) / l, y: (q.y - pts[0].y) / l };
      };
      const r = leave(id);
      // The freeway edge the ramp runs alongside, and the one it came from.
      let ahead = hw[0];
      for (const o of hw) if (leave(o).x * r.x + leave(o).y * r.y > leave(ahead).x * r.x + leave(ahead).y * r.y) ahead = o;
      const t = leave(ahead);
      const exit = right(t).x * r.x + right(t).y * r.y > 0;
      let upstream: number | null = null;
      for (const o of hw) if (o !== ahead && (upstream === null || leave(o).x * t.x + leave(o).y * t.y < leave(upstream).x * t.x + leave(upstream).y * t.y)) upstream = o;
      return { exit, node, upstream, t };
    }
    return null;
  };

  /** Whether traffic can come into the junction along this arm. */
  const arrives = (a: JunctionArm): boolean => {
    const c = graph.edges[a.edge].cls;
    if (c === 'ramp') return rampInfo(a.edge)?.exit ?? true;
    return !(c === 'local' && profiles[a.edge].oneWay && a.end === 0);
  };

  roads.junctions.forEach((j, ji) => {
    // Where a ramp meets the streets: keep drivers out of an exit, and show the way onto an entrance.
    const mouth = j.arms.filter((a) => graph.edges[a.edge].cls === 'ramp' && roads.lines[a.edge] && Number.isFinite(a.reach));
    if (mouth.length && j.arms.some((a) => isStreet(a.edge))) {
      mouth.forEach((a) => {
        const ai = j.arms.indexOf(a);
        const info = rampInfo(a.edge);
        if (!info || j.nodes.includes(info.node)) return;
        const lay = armLay(a);
        const d = a.reach + 1.5;
        const back = rev(a.dir);
        if (info.exit) {
          put({ model: 'sign/do-not-enter-wrong-way', kind: 'oneway', ...armPoint(j, a, lay, d, lay.outer[1] + 0.9), yaw: facing(back), junction: ji, arm: ai, edge: a.edge }, 0.8);
          put({ model: 'sign/do-not-enter', kind: 'oneway', ...armPoint(j, a, lay, d, lay.outer[0] - 0.9), yaw: facing(back), junction: ji, arm: ai, edge: a.edge }, 0.8);
        } else {
          const model = hash(seed, ji, ai, 8) < 0.2 ? 'sign/route-freeway-entrance-old' : 'sign/route-freeway-entrance';
          put({ model, kind: 'guide', ...armPoint(j, a, lay, d, lay.outer[1] + 0.9), yaw: facing(back), junction: ji, arm: ai, edge: a.edge }, 0.8);
        }
      });
    }
    const arms = j.arms.filter((a) => roads.lines[a.edge] && Number.isFinite(a.reach));
    if (arms.length < 3) return;
    const street = (a: JunctionArm): boolean => {
      const c = graph.edges[a.edge].cls;
      return c !== 'highway' && c !== 'ramp' && c !== 'path';
    };
    if (j.signal) {
      arms.forEach((a) => {
        const ai = j.arms.indexOf(a);
        if (!street(a) && graph.edges[a.edge].cls !== 'ramp') return;
        const lay = armLay(a);
        const L = a.reach - a.approach;
        const wr = lay.outer[1] - lay.road[1];
        const wl = lay.road[0] - lay.outer[0];
        if (a.control === 'signal' && arrives(a)) {
          // Drivers coming in look across the junction at a mast on the far right-hand corner, its arm over their lanes.
          let far: JunctionArm | null = null;
          let dot = -0.64;
          for (const o of arms) {
            const v = o.dir.x * a.dir.x + o.dir.y * a.dir.y;
            if (o !== a && v < dot) [far, dot] = [o, v];
          }
          let hung = false;
          if (far) {
            const fl = armLay(far);
            const fw = fl.outer[1] - fl.road[1];
            const need = fl.road[1] + behind(fw) + 0.5;
            const mast = MASTS.find(([len]) => len >= need) ?? MASTS[MASTS.length - 1];
            const p = armPoint(j, far, fl, far.reach - far.approach + 0.2, fl.road[1] + behind(fw));
            hung = put({ model: mast[1], kind: 'signal', ...p, yaw: along(right(far.dir)), junction: ji, arm: ai, edge: far.edge }, 0.8);
          }
          if (!hung) {
            // Nothing straight ahead to hang a mast over: a post at the stop line instead, wherever one fits.
            const spots: [number, number][] = [
              [a.reach - 0.6, lay.road[0] - behind(wl)],
              [a.reach + 2.5, lay.road[0] - behind(wl)],
              [a.reach - 0.6, lay.road[1] + behind(wr)],
              [a.reach + 2.5, lay.road[1] + behind(wr)],
              [a.reach + 6, lay.road[0] - behind(wl)],
              [a.reach + 6, lay.road[1] + behind(wr)],
            ];
            spots.some(([d, x]) => put({ model: 'signal/post-top-ped', kind: 'signal', ...armPoint(j, a, lay, d, x), yaw: facing(a.dir), junction: ji, arm: ai, edge: a.edge }, 0.8));
          }
        }
        if (a.crosswalk) {
          // A pedestrian head at each end of the crossing, looking across it.
          const r = right(a.dir);
          const pr = armPoint(j, a, lay, L + 2.2, lay.road[1] + behind(wr));
          const pl = armPoint(j, a, lay, L + 2.2, lay.road[0] - behind(wl));
          put({ model: 'signal/ped-pole', kind: 'ped', ...pr, yaw: facing({ x: -r.x, y: -r.y }), junction: ji, arm: ai, edge: a.edge }, 0.8);
          put({ model: 'signal/ped-pole', kind: 'ped', ...pl, yaw: facing(r), junction: ji, arm: ai, edge: a.edge }, 0.8);
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
        put({ model: CABINETS[Math.floor(hash(seed, ji, 11) * CABINETS.length)], kind: 'cabinet', ...p, yaw: facing(right(best.a.dir)), junction: ji, edge: best.a.edge }, 1);
      }
      return;
    }
    const stops = arms.filter((a) => a.control === 'stop');
    let named = false;
    arms.forEach((a) => {
      const ai = j.arms.indexOf(a);
      if (a.control !== 'stop' || !arrives(a)) return;
      const lay = armLay(a);
      const wl = lay.road[0] - lay.outer[0];
      const wr = lay.outer[1] - lay.road[1];
      const roll = hash(seed, ji, ai, 3);
      let model = stops.length === arms.length ? 'sign/stop-all-way' : 'sign/stop';
      if (!named && roll < 0.5) {
        model = roll < 0.08 ? 'sign/stop-street-names-old' : 'sign/stop-street-names';
        named = true;
      } else if (roll > 0.97) model = 'sign/stop-old-leaning';
      else if (roll > 0.95) model = 'sign/stop-bent';
      // On the driver's right at the stop line; further back or across the road where that corner is taken.
      const spots: [number, number][] = [
        [a.reach - 0.5, lay.road[0] - behind(wl)],
        [a.reach + 2, lay.road[0] - behind(wl)],
        [a.reach + 5, lay.road[0] - behind(wl)],
        [a.reach - 0.5, lay.road[1] + behind(wr)],
        [a.reach + 3, lay.road[1] + behind(wr)],
      ];
      const stood = spots.some(([d, x]) => put({ model, kind: 'stop', ...armPoint(j, a, lay, d, x), yaw: facing(a.dir), junction: ji, arm: ai, edge: a.edge }, 0.8));
      if (!stood) named = model.startsWith('sign/stop-street') ? false : named;
      else if (model.startsWith('sign/stop-street')) stats.street++;
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
        put({ model, kind: 'street', ...p, yaw: along(a.dir), junction: ji, edge: a.edge }, 0.8);
      }
    }
    // One light at a corner, on the left of the busiest road's arm.
    let lead: JunctionArm | null = null;
    const RANK: Record<string, number> = { arterial: 3, collector: 2, local: 1 };
    for (const a of arms) if (isStreet(a.edge) && (RANK[graph.edges[a.edge].cls] ?? 0) > (lead ? RANK[graph.edges[lead.edge].cls] ?? 0 : 0)) lead = a;
    if (lead) {
      const lay = armLay(lead);
      const pr = profiles[lead.edge];
      const set = LIGHTS[pr.type as DistrictType] ?? LIGHTS.residential;
      const model = set[graph.edges[lead.edge].cls === 'arterial' ? 0 : 1];
      const p = armPoint(j, lead, lay, lead.reach - lead.approach + 0.3, lay.road[0] - behind(lay.road[0] - lay.outer[0]));
      put({ model, kind: 'light', ...p, yaw: along(rev(right(lead.dir))), junction: ji, edge: lead.edge }, 1.5);
    }
  });

  // One-way streets: arrows for the cross traffic where the street starts, and no entry where it ends.
  roads.junctions.forEach((j, ji) => {
    if (j.arms.length < 3) return;
    j.arms.forEach((a, ai) => {
      const e = graph.edges[a.edge];
      if (e.cls !== 'local' || !profiles[a.edge].oneWay || !roads.lines[a.edge] || !Number.isFinite(a.reach)) return;
      const lay = armLay(a);
      const L = a.reach - a.approach;
      const [wl, wr] = [lay.road[0] - lay.outer[0], lay.outer[1] - lay.road[1]];
      if (a.end === 0) {
        const r = right(a.dir);
        put({ model: 'sign/one-way-right', kind: 'oneway', ...armPoint(j, a, lay, L + 0.6, lay.road[1] + behind(wr)), yaw: facing(r), junction: ji, arm: ai, edge: a.edge }, 0.7);
        put({ model: 'sign/one-way-left', kind: 'oneway', ...armPoint(j, a, lay, L + 0.6, lay.road[0] - behind(wl)), yaw: facing(rev(r)), junction: ji, arm: ai, edge: a.edge }, 0.7);
      } else {
        put({ model: 'sign/do-not-enter', kind: 'oneway', ...armPoint(j, a, lay, a.reach + 1, lay.road[1] + behind(wr)), yaw: facing(rev(a.dir)), junction: ji, arm: ai, edge: a.edge }, 0.7);
      }
    });
  });

  const signalAt = new Set<number>();
  for (const j of roads.junctions) if (j.signal) for (const n of j.nodes) signalAt.add(n);

  // Along the roads.
  graph.edges.forEach((e) => {
    const cls: RoadClass = e.cls;
    if (cls === 'alley' || cls === 'path') return;
    const tr = track(e.id);
    if (!tr) return;
    const { len, lay, at } = tr;
    const p = profiles[e.id];
    const offR = lay.road[1] + behind(lay.outer[1] - lay.road[1]);
    const offL = lay.road[0] - behind(lay.road[0] - lay.outer[0]);

    if (cls === 'highway') {
      // Twin lights on the median barrier.
      for (let d = 30 + 60 * hash(seed, e.id, 1); d < len - 10; d += 60) {
        const q = at(d, 0);
        put({ model: 'furniture/light-cobra-twin', kind: 'light', x: q.x, y: q.y, h: q.h, yaw: along(right(q.t)), edge: e.id }, 6, e.id);
      }
      if (len > 260 && hash(seed, e.id, 9) < 0.4) {
        const fwd = at(len * 0.3, lay.outer[1] - 0.15);
        put({ model: 'sign/speed-65', kind: 'speed', x: fwd.x, y: fwd.y, h: fwd.h, yaw: facing(rev(fwd.t)), edge: e.id }, 1.5, e.id);
        const back = at(len * 0.7, lay.outer[0] + 0.15);
        put({ model: 'sign/speed-65', kind: 'speed', x: back.x, y: back.y, h: back.h, yaw: facing(back.t), edge: e.id }, 1.5, e.id);
      }
      return;
    }
    if (cls === 'ramp') {
      for (let d = 25 + 30 * hash(seed, e.id, 1); d < len - 15; d += 55) {
        const q = at(d, lay.outer[1] - 0.15);
        put({ model: 'furniture/light-cobra-12-long', kind: 'light', x: q.x, y: q.y, h: q.h, yaw: along(right(q.t)), edge: e.id }, 6, e.id);
      }
      const info = rampInfo(e.id);
      if (info?.exit) {
        // The exit sign where the ramp has parted from the freeway, and a board over the freeway before the fork.
        const from = info.node === e.a;
        const d = Math.min(len * 0.5, 70);
        const g = at(from ? d : len - d, from ? lay.outer[0] + 0.2 : lay.outer[1] - 0.2);
        const dir = from ? g.t : rev(g.t);
        put({ model: hash(seed, e.id, 10) < 0.25 ? 'sign/guide-gore-old' : 'sign/guide-gore', kind: 'guide', x: g.x, y: g.y, h: g.h, yaw: facing(rev(dir)), edge: e.id }, 1.5, e.id);
        const up = info.upstream === null ? null : track(info.upstream);
        if (up && info.upstream !== null) {
          const ends = graph.edges[info.upstream].b === info.node;
          const back = Math.min(up.len * 0.6, 160);
          // Traffic towards the fork runs with the edge if the edge ends there; the board stands on its right-hand barrier.
          const q = up.at(ends ? up.len - back : back, ends ? up.lay.outer[1] - 0.3 : up.lay.outer[0] + 0.3);
          const t = ends ? q.t : rev(q.t);
          put({ model: hash(seed, e.id, 12) < 0.5 ? 'sign/overhead-cantilever-exit' : 'sign/overhead-tube-arm', kind: 'guide', x: q.x, y: q.y, h: q.h, yaw: along(right(t)), edge: info.upstream }, 6, info.upstream);
        }
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

    // No way through: said at the mouth of a street that ends blind.
    if (cls === 'local' && len > 45) {
      const [da, db] = [graph.nodes[e.a].degree, graph.nodes[e.b].degree];
      if ((da === 1) !== (db === 1)) {
        const q = db === 1 ? at(9, offR) : at(len - 9, offL);
        const model = hash(seed, e.id, 13) < 0.15 ? 'sign/warn-dead-end-old' : 'sign/warn-dead-end';
        put({ model, kind: 'warning', x: q.x, y: q.y, h: q.h, yaw: facing(db === 1 ? rev(q.t) : q.t), edge: e.id }, 1.5);
      }
    }
    // Signals ahead, on the long fast runs into them.
    if (cls === 'arterial' && len > 220) {
      for (const end of [0, 1] as const) {
        if (end === 0 && p.oneWay) continue;
        const node = end === 0 ? e.a : e.b;
        if (!signalAt.has(node)) continue;
        const q = end === 1 ? at(len - 95, offR) : at(95, offL);
        put({ model: hash(seed, e.id, end, 14) < 0.15 ? 'sign/warn-signal-ahead-old' : 'sign/warn-signal-ahead', kind: 'warning', x: q.x, y: q.y, h: q.h, yaw: facing(end === 1 ? rev(q.t) : q.t), edge: e.id }, 1.5);
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
