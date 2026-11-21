import { Heap } from '../core/heap';
import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { SegmentIndex, pointAt } from '../core/geom';
import { Vec2, clamp, dist } from '../core/vec2';
import { DistrictType, Districts, districtAt } from './districts';
import { Rail } from './rail';
import { RoadEdge, RoadGraph } from './roadGraph';
import { rowWidth } from './roadSections';
import { STATION_HALF, Station } from './stations';
import { RoadClass } from './streamlines';
import { Terrain, gradient, heightAt, inBounds, riverBankAt, seaDistAt, waterDistAt } from './terrain';

/**
 * Land use and lots. Every stretch of street frontage is scored for each use from its surroundings
 * (terrain, the road it faces, how easily the rest of the city is reached, how far the station is),
 * then cut into lots sized for the chosen use. See docs/placement-plan.md §5 and §6.
 */
export type LandUse = 'R1' | 'R2' | 'R3' | 'C1' | 'C2' | 'C3' | 'C4' | 'O1' | 'O2' | 'I1' | 'I2' | 'PK' | 'CV' | 'OS';
export const LAND_USES: LandUse[] = ['R1', 'R2', 'R3', 'C1', 'C2', 'C3', 'C4', 'O1', 'O2', 'I1', 'I2', 'PK', 'CV', 'OS'];

/** What decided a lot's use; kept so the choice can be inspected and tested. */
export interface Site {
  type: DistrictType;
  /** Class and right-of-way width of the road the lot faces. */
  road: RoadClass;
  roadWidth: number;
  /** Fall across the lot, metres, and steepest gradient. */
  relief: number;
  slope: number;
  /** Walking distance to the nearest station along streets, metres. */
  station: number;
  /** Driving time to the nearest freeway ramp and to the city centre, seconds. */
  ramp: number;
  centre: number;
  /** 0–1: how well connected the frontage is (road class, ramp, centre, station). */
  access: number;
  /** Distance to the sea, a river bank, the nearest freeway or track, the nearest park edge, metres. */
  sea: number;
  river: number;
  nuisance: number;
  park: number;
  /** Distance to the nearest junction of two arterials, metres. */
  majorJunction: number;
}

export interface Lot {
  id: number;
  use: LandUse;
  /** Outline: the frontage (following the street), then the rear corners. */
  poly: Vec2[];
  /** Number of leading points of `poly` on the frontage. */
  front: number;
  /** Street the lot faces, and which side of it (1 = left of the edge's direction). */
  edge: number;
  side: 1 | -1;
  /** Position of the frontage along the edge, metres. */
  s0: number;
  s1: number;
  width: number;
  depth: number;
  area: number;
  corner: boolean;
  floors: number;
  site: Site;
}

export interface LandUsePlan {
  lots: Lot[];
  /** Raster of lot ids + 1 (0 = no lot), `cell` metres per sample, `n` samples per side. */
  grid: Int32Array;
  cell: number;
  n: number;
  /** Per graph node: walking distance to a station (m), driving time to a ramp and to the centre (s). */
  stationDist: Float64Array;
  rampTime: Float64Array;
  centreTime: Float64Array;
  /** Square metres per use. */
  area: Record<LandUse, number>;
  count: Record<LandUse, number>;
}

const G = 3;
const INSET = 2.5;
const FREE = 0;
const OBSTACLE = 1;
const STREET = 2;
const LANE = 3;
const TAKEN = 4;

/** Share of each use per district, percent (placement plan §5.2). */
const SHARE: Record<DistrictType, Partial<Record<LandUse, number>>> = {
  downtown: { R3: 12, C1: 3, C2: 15, O1: 10, O2: 40, PK: 8, CV: 6, OS: 6 },
  midtown: { R2: 12, R3: 20, C1: 8, C2: 20, C3: 4, C4: 2, O1: 16, O2: 6, PK: 5, CV: 4, OS: 3 },
  oldtown: { R1: 5, R2: 30, R3: 3, C1: 15, C2: 30, O1: 5, I1: 2, PK: 2, CV: 5, OS: 3 },
  residential: { R1: 52, R2: 22, R3: 3, C1: 5, C2: 4, C3: 4, C4: 1, O1: 1, PK: 1, CV: 4, OS: 3 },
  suburb: { R1: 74, R2: 5, C1: 3, C3: 5, C4: 4, O1: 1, CV: 4, OS: 4 },
  hills: { R1: 40, R2: 2, C1: 1, CV: 1, OS: 6 },
  beach: { R1: 25, R2: 22, R3: 10, C1: 14, C2: 12, C3: 5, O2: 4, PK: 4, CV: 1, OS: 3 },
  industrial: { C1: 2, C3: 6, C4: 2, O1: 4, I1: 48, I2: 22, PK: 6, OS: 10 },
};

interface Dim {
  w: [number, number];
  d: [number, number];
  /** Longest stretch of one use along a street before it is chosen again, metres. */
  run: number;
}
/** Frontage and depth per use (placement plan §6.3). */
const DIM: Record<LandUse, Dim> = {
  R1: { w: [12, 16], d: [28, 35], run: 260 },
  R2: { w: [15, 30], d: [28, 38], run: 180 },
  R3: { w: [30, 60], d: [35, 50], run: 160 },
  C1: { w: [6, 18], d: [20, 32], run: 150 },
  C2: { w: [6, 18], d: [20, 32], run: 170 },
  C3: { w: [35, 60], d: [35, 50], run: 70 },
  C4: { w: [80, 170], d: [70, 150], run: 180 },
  O1: { w: [25, 45], d: [30, 45], run: 120 },
  O2: { w: [32, 70], d: [30, 70], run: 150 },
  I1: { w: [40, 90], d: [50, 100], run: 260 },
  I2: { w: [80, 160], d: [80, 160], run: 260 },
  PK: { w: [18, 45], d: [20, 45], run: 45 },
  CV: { w: [40, 80], d: [40, 70], run: 80 },
  OS: { w: [12, 30], d: [20, 35], run: 40 },
};
const R1_DIM: Partial<Record<DistrictType, Dim>> = {
  suburb: { w: [17, 24], d: [30, 38], run: 300 },
  beach: { w: [8, 11], d: [20, 28], run: 200 },
  oldtown: { w: [8, 11], d: [20, 28], run: 150 },
  hills: { w: [25, 45], d: [30, 60], run: 400 },
};
const dimOf = (use: LandUse, type: DistrictType): Dim => (use === 'R1' ? R1_DIM[type] ?? DIM.R1 : DIM[use]);
/** Uses that may run through a block from one street to the next. */
const THROUGH: Partial<Record<LandUse, boolean>> = { C4: true, I2: true, O2: true, CV: true };

/** Shortest depth a use still works with, as a fraction of its smallest listed depth. */
const MIN_DEPTH = 0.72;
/** Metres per second by class, for driving times. */
const SPEED: Record<RoadClass, number> = { highway: 27, ramp: 15, arterial: 13, collector: 10, local: 7, alley: 3, path: 0 };
const FRONTAGE: RoadClass[] = ['arterial', 'collector', 'local', 'alley'];
const TRADE: LandUse[] = ['C1', 'C2', 'C3', 'C4', 'O1', 'O2'];

/**
 * Weight of every use on one frontage. The district gives the starting mix; the site moves it.
 * Exported so the rules can be tested one condition at a time.
 */
export function useWeights(site: Site, corner = false): Record<LandUse, number> {
  const w = {} as Record<LandUse, number>;
  for (const u of LAND_USES) w[u] = (SHARE[site.type][u] ?? 0) / 100;
  const mul = (uses: LandUse[], f: number) => uses.forEach((u) => (w[u] *= f));
  const urban = site.type !== 'industrial' && site.type !== 'hills';

  // Station area: flats over shops, apartment blocks and offices; houses give way.
  if (site.station < 250) {
    if (urban) {
      w.C2 += 0.1;
      w.R3 += 0.08;
      w.O1 += 0.05;
      w.C1 += 0.03;
    }
    mul(['C2'], 3.5);
    mul(['R3'], 3);
    mul(['O1'], 2.5);
    mul(['O2'], 2);
    mul(['C1', 'PK'], 1.5);
    mul(['R1'], 0.06);
    mul(['I1', 'C3', 'C4'], 0.3);
    mul(['I2'], 0.1);
  } else if (site.station < 500) {
    if (urban) w.R2 += 0.08;
    mul(['R2'], 2.5);
    mul(['R3', 'C2'], 1.5);
    mul(['R1'], 0.55);
  }

  // The road the lot faces. Trade wants a busy, wide road; houses want a quiet one.
  switch (site.road) {
    case 'arterial':
      mul(['C1', 'C2', 'C3'], 2.5);
      mul(['C4'], 2);
      mul(['R3'], 1.6);
      mul(['O1', 'O2'], 1.5);
      mul(['R2'], 1.3);
      mul(['R1'], 0.04);
      break;
    case 'collector':
      mul(['C1'], corner ? 3 : 0.8);
      mul(['C2', 'R3'], 1.2);
      mul(['R2'], 1.5);
      mul(['R1'], 0.6);
      mul(['C4'], 0.5);
      break;
    case 'local':
      mul(['C1'], corner ? 0.6 : 0.3);
      mul(['C2'], 0.5);
      mul(['C3', 'CV'], 0.15);
      mul(['C4'], 0);
      mul(['R1'], 1.3);
      break;
    default:
      // Lanes and yards: small houses, sheds and parking only.
      mul(['C1', 'C2', 'C3', 'C4', 'O1', 'O2', 'R3', 'CV', 'I2'], 0);
      break;
  }
  // Big buildings and lorries need width whatever the class says.
  if (site.roadWidth < 12) {
    mul(['O2', 'R3'], 0.25);
    mul(['I2', 'C4', 'C3'], 0.2);
    mul(['I1', 'O1'], 0.6);
  } else if (site.roadWidth >= 24) {
    mul(['O2', 'R3', 'C4'], 1.3);
  }

  // Ease of travel: the better connected, the more trade and the fewer detached houses.
  mul(TRADE, 0.55 + 1.1 * site.access);
  mul(['R1'], 1.35 - 0.7 * site.access);
  mul(['R3'], 0.8 + 0.5 * site.access);
  if (site.majorJunction < 120 && (site.type === 'suburb' || site.type === 'residential')) {
    w.C3 += 0.04;
    mul(['C3'], 6);
    mul(['C1', 'C4'], 2);
  }
  if (site.ramp < 45) {
    // Just off the freeway: petrol, fast food, motels, big-box stores, depots.
    if (site.road !== 'local' && site.road !== 'alley') w.C3 += 0.05;
    mul(['C3'], 5);
    mul(['C4'], 3);
    mul(['I1'], 1.5);
    mul(['R1'], 0.4);
  }
  // Towers stand in the middle of downtown; its edge is flats over shops.
  if (site.type === 'downtown') {
    mul(['O2'], clamp(1.9 - site.centre / 60, 0.25, 1.9));
    if (site.centre > 55) mul(['C2', 'R3'], 1.5);
  }

  // Water.
  if (site.type === 'beach' && site.sea < 150) {
    if (site.sea < 90) {
      mul(['C1', 'O2'], 2.5);
      mul(['R3'], 2);
      mul(['R2'], 1.5);
      mul(['R1'], 0.3);
    } else mul(['R1'], 1.5);
  }
  if (site.river < 60) {
    if (site.type === 'downtown' || site.type === 'midtown') {
      mul(['R3'], 2);
      mul(['O1'], 1.5);
    } else if (site.type === 'industrial') mul(['I1'], 1.3);
    else mul(['OS'], 4);
  }
  // Noise and fumes beside a freeway or the tracks.
  if (site.nuisance < 40) {
    w.I1 += urban ? 0.04 : 0;
    w.PK += 0.03;
    mul(['I1', 'PK'], 3);
    mul(['C3'], 2);
    mul(['R1'], 0.08);
    mul(['R2'], site.type === 'residential' ? 0.9 : 0.5);
    mul(['R3'], 0.4);
  }
  if (site.park < 40) {
    mul(['R3'], 2);
    mul(['R2'], 1.6);
    mul(['C1'], 1.5);
  }

  // Slopes: nothing but detached houses on anything steep, and nothing at all past what a house can take.
  const hill = site.type === 'hills';
  if (site.relief > 6 || (!hill && site.slope >= 0.12)) for (const u of LAND_USES) w[u] = 0;
  else if (site.relief > 3 || site.slope >= 0.08) for (const u of LAND_USES) if (u !== 'R1' || (site.relief > 3 && !hill)) w[u] = 0;
  return w;
}

/** Storeys: district base, then place (placement plan §7.3). */
function floorsFor(use: LandUse, site: Site, corner: boolean, rng: Rng): number {
  const near = site.station < 250;
  const bonus = (near ? rng.int(2, 7) : 0) + (site.park < 40 ? rng.int(1, 3) : 0) + (corner ? rng.int(0, 2) : 0);
  const main = site.road === 'arterial' ? 1.3 : 1;
  switch (use) {
    case 'R1':
      return site.type === 'suburb' || site.type === 'hills' ? (rng.chance(0.35) ? 2 : 1) : rng.chance(0.5) ? 2 : 1;
    case 'R2':
      return Math.min(6, rng.int(2, 5) + (near ? 1 : 0));
    case 'R3': {
      const base = site.type === 'downtown' ? rng.int(8, 22) : site.type === 'beach' && site.sea < 150 ? rng.int(4, 12) : rng.int(5, 10);
      return Math.min(site.type === 'downtown' ? 30 : 20, Math.round(base * main) + bonus);
    }
    case 'C1':
      return rng.chance(0.3) ? 2 : 1;
    case 'C2':
      return Math.min(site.type === 'oldtown' ? 6 : 12, rng.int(2, site.type === 'downtown' || site.type === 'midtown' ? 7 : 5) + bonus);
    case 'O1':
      return Math.min(12, rng.int(2, 7) + bonus);
    case 'O2': {
      if (site.type !== 'downtown') return Math.min(20, rng.int(6, 13) + bonus);
      const peak = Math.exp(-site.centre / 45);
      return Math.min(60, Math.round((6 + 8 * rng.next() + peak * rng.range(12, 34)) * main) + bonus);
    }
    case 'I2':
      return rng.chance(0.3) ? 2 : 1;
    case 'CV':
      return rng.int(1, 4);
    case 'PK':
      return (site.type === 'downtown' || site.type === 'midtown') && rng.chance(0.45) ? rng.int(3, 7) : 0;
    case 'OS':
      return 0;
    default:
      return 1;
  }
}

/** Shortest travel cost from the seed nodes to every node; `cost` gives an edge's cost or Infinity. */
function spread(graph: RoadGraph, seeds: number[], cost: (e: RoadEdge) => number): Float64Array {
  const out = new Float64Array(graph.nodes.length).fill(Infinity);
  const heap = new Heap();
  for (const s of seeds) {
    out[s] = 0;
    heap.push(0, s);
  }
  while (heap.size) {
    const [k, v] = heap.pop();
    if (k > out[v]) continue;
    for (const id of graph.nodes[v].edges) {
      const e = graph.edges[id];
      const c = k + cost(e);
      const o = e.a === v ? e.b : e.a;
      if (c < out[o]) {
        out[o] = c;
        heap.push(c, o);
      }
    }
  }
  return out;
}

export function planLandUse(graph: RoadGraph, t: Terrain, districts: Districts, rail: Rail, stations: Station[], rng: Rng): LandUsePlan {
  const { nodes, edges } = graph;
  const n = Math.ceil(t.size / G);
  const kind = new Uint8Array(n * n);
  const grid = new Int32Array(n * n);
  const typeOf = (x: number, y: number) => districtAt(t, districts, x, y).type;
  const stamp = (x: number, y: number, r: number, k: number) => {
    const q = Math.ceil(r / G) + 1;
    const ci = Math.floor(x / G);
    const cj = Math.floor(y / G);
    for (let j = Math.max(0, cj - q); j <= Math.min(n - 1, cj + q); j++) {
      for (let i = Math.max(0, ci - q); i <= Math.min(n - 1, ci + q); i++) {
        if (Math.hypot((i + 0.5) * G - x, (j + 0.5) * G - y) > r) continue;
        const c = j * n + i;
        // Obstacles win over streets, streets over lanes.
        if (kind[c] === FREE || k < kind[c]) kind[c] = k;
      }
    }
  };
  const along = (pts: Vec2[], step: number, cb: (x: number, y: number) => void) => {
    for (let i = 1; i < pts.length; i++) {
      const l = dist(pts[i - 1], pts[i]);
      const m = Math.max(1, Math.ceil(l / step));
      for (let k = i === 1 ? 0 : 1; k <= m; k++) cb(pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / m, pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / m);
    }
  };

  // Land nothing is built on: water and its bank, the map edge, parks, tracks, the freeway, station sites.
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * G;
      const y = (j + 0.5) * G;
      if (!inBounds(t, x, y, 4) || waterDistAt(t, x, y) < 6) kind[j * n + i] = OBSTACLE;
    }
  }
  for (const p of districts.parks) stamp(p.center.x, p.center.y, p.radius, OBSTACLE);
  const nuisance = new SegmentIndex(80);
  rail.lines.forEach((line, li) => {
    const half = line.kind === 'main' ? 9 : 6;
    for (let i = 0; i < line.points.length; i++) {
      if (line.structure[i] === 'tunnel') continue;
      const p = line.points[i];
      stamp(p.x, p.y, half, OBSTACLE);
      if (i > 0 && line.structure[i - 1] !== 'tunnel') {
        const q = line.points[i - 1];
        stamp((p.x + q.x) / 2, (p.y + q.y) / 2, half, OBSTACLE);
        nuisance.add(-1 - li, i - 1, q, p);
      }
    }
  });
  for (const s of stations) {
    const c = Math.cos(s.angle);
    const sn = Math.sin(s.angle);
    for (let a = -STATION_HALF; a <= STATION_HALF; a += G) for (let b = -27; b <= 27; b += G) stamp(s.x + c * a - sn * b, s.y + sn * a + c * b, G, OBSTACLE);
  }
  const widthOf = new Float64Array(edges.length);
  for (const e of edges) {
    const mid = e.points[e.points.length >> 1];
    const row = rowWidth(e.cls, typeOf(mid.x, mid.y));
    widthOf[e.id] = row;
    if (e.cls === 'highway' || e.cls === 'ramp') {
      along(e.points, 2, (x, y) => stamp(x, y, row / 2 + (e.cls === 'highway' ? 8 : 4), OBSTACLE));
      nuisance.addLine(e.id, e.points);
    } else {
      const k = e.cls === 'alley' || e.cls === 'path' ? LANE : STREET;
      along(e.points, 1.5, (x, y) => stamp(x, y, row / 2, k));
    }
  }

  // Travel: walking to a station, driving to a ramp and to the centre.
  const nearestNode = (p: Vec2, ok: (id: number) => boolean): number => {
    let best = -1;
    let bd = Infinity;
    for (const nd of nodes) {
      const d = Math.hypot(nd.x - p.x, nd.y - p.y);
      if (d < bd && ok(nd.id)) {
        bd = d;
        best = nd.id;
      }
    }
    return best;
  };
  const walkable = (id: number) => nodes[id].edges.some((k) => edges[k].cls !== 'highway' && edges[k].cls !== 'ramp');
  const drivable = (id: number) => nodes[id].edges.some((k) => edges[k].cls === 'arterial' || edges[k].cls === 'collector' || edges[k].cls === 'local');
  const walk = (e: RoadEdge) => (e.cls === 'highway' || e.cls === 'ramp' ? Infinity : e.length);
  const drive = (e: RoadEdge) => (SPEED[e.cls] ? e.length / SPEED[e.cls] : Infinity);
  // A station has an entrance on each side of the tracks.
  const stationDist = new Float64Array(nodes.length).fill(Infinity);
  for (const s of stations) {
    const nx = -Math.sin(s.angle);
    const ny = Math.cos(s.angle);
    for (const side of [1, -1]) {
      const door = { x: s.x + nx * side * 30, y: s.y + ny * side * 30 };
      const seeds = nodes.filter((nd) => walkable(nd.id) && Math.hypot(nd.x - door.x, nd.y - door.y) < 170 && (nd.x - s.x) * nx * side + (nd.y - s.y) * ny * side > 0);
      if (!seeds.length) continue;
      seeds.sort((a, b) => dist(a, door) - dist(b, door));
      const first = seeds[0];
      const d0 = dist(first, door);
      const d = spread(graph, [first.id], walk);
      for (let i = 0; i < d.length; i++) stationDist[i] = Math.min(stationDist[i], d[i] + d0);
    }
  }
  const rampNodes = nodes.filter((nd) => nd.edges.some((k) => edges[k].cls === 'ramp') && drivable(nd.id)).map((nd) => nd.id);
  const rampTime = spread(graph, rampNodes, (e) => (e.cls === 'highway' || e.cls === 'ramp' ? Infinity : drive(e)));
  const centreNode = nearestNode(districts.downtown.center, drivable);
  const centreTime = centreNode < 0 ? new Float64Array(nodes.length).fill(Infinity) : spread(graph, [centreNode], drive);
  const majors = nodes.filter((nd) => nd.edges.filter((k) => edges[k].cls === 'arterial').length >= 3);
  const majorIndex = new Map<number, Vec2[]>();
  for (const m of majors) {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const key = (Math.floor(m.y / 120) + dj) * 4096 + Math.floor(m.x / 120) + di;
        const list = majorIndex.get(key);
        if (list) list.push(m);
        else majorIndex.set(key, [m]);
      }
    }
  }

  const noise = new Noise2D(rng.fork('mix'));
  // Running totals per district type. A use that is ahead of its share is held back and one that is behind is pushed,
  // so the site rules decide where a use goes while the district keeps its overall mix.
  const given = {} as Record<DistrictType, { total: number; by: Partial<Record<LandUse, number>> }>;
  const balance = (type: DistrictType, u: LandUse): number => {
    const share = (SHARE[type][u] ?? 0) / 100;
    if (share <= 0) return 1;
    const g = (given[type] ??= { total: 0, by: {} });
    const prior = 15000;
    const ratio = ((g.by[u] ?? 0) + prior * share) / (share * (g.total + prior));
    return clamp(ratio ** -1.6, 0.12, 5);
  };
  const lots: Lot[] = [];
  const at = (x: number, y: number): number => {
    const i = Math.floor(x / G);
    const j = Math.floor(y / G);
    return i < 0 || j < 0 || i >= n || j >= n ? OBSTACLE : kind[j * n + i];
  };

  /** Free depth behind the frontage at one point: metres until something else starts. */
  const probe = (p: Vec2, nx: number, ny: number, row: number, limit: number, through = false): number => {
    for (let d = G; d <= limit; d += G) {
      const k = at(p.x + nx * (row + d), p.y + ny * (row + d));
      if (k === FREE) continue;
      // Share the block with the lots that will face the street behind; back onto lanes and everything else.
      return k === STREET && !through ? (d - G) / 2 : d - G;
    }
    return limit;
  };
  const siteAt = (e: RoadEdge, s: number, c: Vec2, corners: Vec2[]): Site => {
    const type = typeOf(c.x, c.y);
    let lo = Infinity;
    let hi = -Infinity;
    let slope = 0;
    for (const p of [c, ...corners]) {
      const h = heightAt(t, p.x, p.y);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      const g = gradient(t, t.height, p.x, p.y, 12);
      slope = Math.max(slope, Math.hypot(g.x, g.y));
    }
    const via = (arr: Float64Array, per: number) => Math.min(arr[e.a] + s / per, arr[e.b] + (e.length - s) / per);
    const station = via(stationDist, 1) + 12;
    const ramp = via(rampTime, SPEED[e.cls] || 3);
    const centre = via(centreTime, SPEED[e.cls] || 3);
    let park = Infinity;
    for (const p of districts.parks) park = Math.min(park, dist(p.center, c) - p.radius);
    let majorJunction = Infinity;
    for (const m of majorIndex.get(Math.floor(c.y / 120) * 4096 + Math.floor(c.x / 120)) ?? []) majorJunction = Math.min(majorJunction, dist(m, c));
    const roadWidth = widthOf[e.id];
    const access = clamp(
      0.3 * Math.exp(-centre / 150) + 0.25 * Math.exp(-ramp / 60) + 0.25 * Math.exp(-station / 350) + 0.2 * clamp((roadWidth - 8) / 22, 0, 1),
      0,
      1,
    );
    return {
      type,
      road: e.cls,
      roadWidth,
      relief: hi - lo,
      slope,
      station,
      ramp,
      centre,
      access,
      sea: seaDistAt(t, c.x, c.y),
      river: riverBankAt(t, c.x, c.y),
      nuisance: nuisance.nearest(c.x, c.y, 80),
      park,
      majorJunction,
    };
  };

  const order = edges.filter((e) => FRONTAGE.includes(e.cls) && !e.bridge && e.length > 10);
  order.sort((a, b) => FRONTAGE.indexOf(a.cls) - FRONTAGE.indexOf(b.cls) || b.length - a.length || a.id - b.id);
  for (const e of order) {
    const row = widthOf[e.id] / 2;
    for (const side of [1, -1] as const) {
      const r = rng.fork(`lot${e.id}:${side}`);
      const frame = (s: number) => {
        const q = pointAt(e.points, clamp(s, 0, e.length));
        const nx = -q.tan.y * side;
        const ny = q.tan.x * side;
        return { p: q.p, nx, ny };
      };
      const frontFree = (s: number) => {
        const f = frame(s);
        return at(f.p.x + f.nx * (row + 2), f.p.y + f.ny * (row + 2)) === FREE;
      };
      let s = 0;
      let run: LandUse | null = null;
      let runLeft = 0;
      let lastW = 0;
      while (s < e.length - 5) {
        if (!frontFree(s)) {
          s += G;
          run = null;
          continue;
        }
        // Clear frontage ahead.
        let clear = 0;
        while (s + clear < e.length && clear < 190 && frontFree(s + clear + G)) clear += G;
        clear = Math.min(clear + G, e.length - s);
        if (clear < 6) {
          s += clear + G;
          continue;
        }
        const startsAtCorner = s < 30 && nodes[e.a].degree >= 3;
        const f0 = frame(s);
        const fm = frame(s + Math.min(clear, 16) / 2);
        // Look just inside the side line: the line itself is shared with the neighbour.
        const fi = frame(s + INSET);
        const room = Math.min(probe(fi.p, fi.nx, fi.ny, row, 165), probe(fm.p, fm.nx, fm.ny, row, 165));
        const roomThrough = Math.min(probe(fi.p, fi.nx, fi.ny, row, 165, true), probe(fm.p, fm.nx, fm.ny, row, 165, true));
        if (room < 12) {
          s += 6;
          run = null;
          continue;
        }
        const depth0 = Math.min(room, 30);
        const centre = { x: fm.p.x + fm.nx * (row + depth0 / 2), y: fm.p.y + fm.ny * (row + depth0 / 2) };
        const rear = (f: { p: Vec2; nx: number; ny: number }, d: number): Vec2 => ({ x: f.p.x + f.nx * (row + d), y: f.p.y + f.ny * (row + d) });
        const f1 = frame(s + Math.min(clear, 16));
        const site = siteAt(e, s, centre, [rear(f0, 0), rear(f1, 0), rear(f0, depth0), rear(f1, depth0)]);
        const endsAtCorner = clear >= e.length - s - 1 && e.length - s < 70 && nodes[e.b].degree >= 3;
        const corner = startsAtCorner || (endsAtCorner && clear < 40);
        const w = useWeights(site, corner);
        // A use needs enough frontage and depth here.
        let total = 0;
        let top = 0;
        let wanted = 0;
        let fits = 0;
        for (const u of LAND_USES) {
          const dim = dimOf(u, site.type);
          wanted += w[u];
          if (clear < dim.w[0] * 0.85 || (THROUGH[u] ? roomThrough : room) < dim.d[0] * MIN_DEPTH) w[u] = 0;
          else if (w[u] > 0) {
            fits += w[u];
            w[u] *= (0.45 + 1.1 * clamp(0.5 + 0.9 * noise.fbm(centre.x / 260 + LAND_USES.indexOf(u) * 31.7, centre.y / 260, 2), 0, 1)) * balance(site.type, u);
          }
          total += w[u];
          top = Math.max(top, w[u]);
        }
        // A scrap that suits almost nothing the place calls for stays a back yard.
        if (total <= 0 || fits < 0.35 * wanted) {
          s += 6;
          run = null;
          continue;
        }
        if (!run || runLeft <= 0 || w[run] < 0.3 * top) {
          let pick = r.next() * total;
          run = 'OS';
          for (const u of LAND_USES) {
            pick -= w[u];
            if (pick < 0) {
              run = u;
              break;
            }
          }
          runLeft = dimOf(run, site.type).run * r.range(0.6, 1.2);
        }
        const use: LandUse = run;
        const dim = dimOf(use, site.type);
        // Frontage: never the same as the neighbour; corners are wider; the tail of a block is shared out.
        let width = r.range(dim.w[0], dim.w[1]);
        if (Math.abs(width - lastW) < 0.5) width += 0.9;
        if (corner) width *= r.range(1.2, 1.5);
        width = Math.min(width, clear);
        const rest = clear - width;
        if (rest < dim.w[0] * 0.85) width = rest + width <= dim.w[1] * 1.5 ? clear : clear / 2;
        const avail = THROUGH[use] ? roomThrough : room;
        let depth = Math.min(avail, r.range(dim.d[0], dim.d[1]));
        // A strip too thin to use on its own goes to this lot.
        if (avail - depth < 12 && avail <= dim.d[1] * 1.3) depth = avail;
        // The far end and the middle must have the room too.
        const fe = frame(s + width);
        const fc = frame(s + width / 2);
        const fo = frame(s + width - INSET);
        depth = Math.min(depth, probe(fo.p, fo.nx, fo.ny, row, depth + G, THROUGH[use]), probe(fc.p, fc.nx, fc.ny, row, depth + G, THROUGH[use]));
        let made = false;
        for (let attempt = 0; attempt < 3 && depth >= dim.d[0] * MIN_DEPTH; attempt++, depth *= 0.8) {
          const poly: Vec2[] = [];
          const m = Math.max(1, Math.ceil(width / 14));
          for (let k = 0; k <= m; k++) poly.push(rear(frame(s + (width * k) / m), 0));
          const front = poly.length;
          const a = rear(f0, depth);
          const b = rear(fe, depth);
          // Inside of a bend: the side lines converge. Too pinched to use.
          if (dist(a, b) < 0.4 * width) continue;
          poly.push(b, a);
          const cells = raster(poly, n);
          let bad = 0;
          let other = 0;
          for (const c of cells) {
            if (kind[c] === TAKEN) other++;
            else if (kind[c] !== FREE) bad++;
          }
          if (cells.length < 6 || bad > 0.03 * cells.length || other > 0.1 * cells.length) continue;
          const id = lots.length;
          let area = 0;
          for (const c of cells) {
            if (kind[c] !== FREE) continue;
            kind[c] = TAKEN;
            grid[c] = id + 1;
            area += G * G;
          }
          const final = siteAt(e, s + width / 2, { x: fc.p.x + fc.nx * (row + depth / 2), y: fc.p.y + fc.ny * (row + depth / 2) }, [poly[0], poly[front - 1], a, b]);
          // The whole lot may be steeper than the first look said.
          const check = useWeights(final, corner);
          if (check[use] <= 0 && w[use] > 0 && (final.relief > 3 || final.slope >= 0.08)) {
            for (const c of cells) {
              if (grid[c] === id + 1) {
                grid[c] = 0;
                kind[c] = FREE;
              }
            }
            continue;
          }
          lots.push({ id, use, poly, front, edge: e.id, side, s0: s, s1: s + width, width, depth, area, corner, floors: floorsFor(use, final, corner, r), site: final });
          const g = (given[final.type] ??= { total: 0, by: {} });
          g.total += area;
          g.by[use] = (g.by[use] ?? 0) + area;
          made = true;
          break;
        }
        if (made) {
          s += width;
          runLeft -= width;
          lastW = width;
        } else {
          s += 6;
          run = null;
        }
      }
    }
  }

  const area = {} as Record<LandUse, number>;
  const count = {} as Record<LandUse, number>;
  for (const u of LAND_USES) area[u] = count[u] = 0;
  for (const l of lots) {
    area[l.use] += l.area;
    count[l.use]++;
  }
  return { lots, grid, cell: G, n, stationDist, rampTime, centreTime, area, count };
}

/** Indices of the grid cells whose centres lie inside the polygon. */
function raster(poly: Vec2[], n: number): number[] {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const out: number[] = [];
  const xs: number[] = [];
  for (let j = Math.max(0, Math.floor(y0 / G)); j <= Math.min(n - 1, Math.floor(y1 / G)); j++) {
    const y = (j + 0.5) * G;
    xs.length = 0;
    for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
      const a = poly[m];
      const b = poly[k];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / G - 0.5));
      const i1 = Math.min(n - 1, Math.floor(xs[k + 1] / G - 0.5));
      for (let i = i0; i <= i1; i++) out.push(j * n + i);
    }
  }
  return out;
}
