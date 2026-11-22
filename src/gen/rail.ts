import { Heap } from '../core/heap';
import { Rng } from '../core/rng';
import { SegmentIndex, pointSeg, polyLength, resample, segSeg } from '../core/geom';
import { Vec2, angleDiff, clamp, dist } from '../core/vec2';
import { DistrictType, Districts, districtAt } from './districts';
import type { RoadGraph } from './roadGraph';
import { Terrain, gradient, heightAt, hillAt, isWater, riverBankAt, seaDistAt } from './terrain';

export type RailStructure = 'ground' | 'elevated' | 'bridge' | 'tunnel';

export interface RailLine {
  kind: 'main' | 'freight';
  tracks: number;
  /** Centre line, one point every RAIL_STEP metres. */
  points: Vec2[];
  /** What carries the track at each point. */
  structure: RailStructure[];
  /** Height of the rails at each point, metres. */
  level: number[];
  /** Whether a local street may cross here (a level crossing, or under a viaduct). Bigger streets always cross. */
  crossable: boolean[];
  length: number;
}

export interface Rail {
  lines: RailLine[];
}

export const RAIL_STEP = 10;
/** Tightest curve of the main line / the freight branch, metres. */
export const RAIL_MIN_RADIUS = { main: 300, freight: 160 };
export const RAIL_MAX_GRADE = 0.03;
/** Streets keep this far from tracks they do not cross. */
export const RAIL_CLEARANCE = 16;
const VIADUCT_HEIGHT = 7.5;
const GRID = 40;

/** How much the railway avoids each kind of district; it prefers the seams between them. */
const DISTRICT_COST: Record<DistrictType, number> = {
  downtown: 2.6,
  midtown: 1.8,
  oldtown: 3.2,
  residential: 1.7,
  suburb: 1.3,
  hills: 2.4,
  industrial: 0.8,
  beach: 3,
};

const DIRS: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const TURN_COST = 2.2;

interface Grid {
  n: number;
  cost: Float32Array;
}

function buildCost(t: Terrain, districts: Districts, highways: Vec2[][]): Grid {
  const n = Math.round(t.size / GRID);
  const cost = new Float32Array(n * n);
  const hw = new SegmentIndex(120);
  highways.forEach((pts, i) => hw.addLine(i, pts));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * GRID;
      const y = (j + 0.5) * GRID;
      const sd = seaDistAt(t, x, y);
      if (sd < 40) {
        cost[j * n + i] = Infinity;
        continue;
      }
      const d = districtAt(t, districts, x, y);
      let c = DISTRICT_COST[d.type];
      // Tracks tend to run where one district ends and the next begins.
      for (const [ox, oy] of [[70, 0], [-70, 0], [0, 70], [0, -70]]) {
        if (districtAt(t, districts, x + ox, y + oy).id !== d.id) {
          c *= 0.6;
          break;
        }
      }
      const hill = hillAt(t, x, y);
      c *= 1 + 5 * hill * hill + (hill > 0.55 ? 2 : 0);
      const g = gradient(t, t.height, x, y, 24);
      c *= 1 + 12 * Math.max(0, Math.hypot(g.x, g.y) - 0.02);
      const rb = riverBankAt(t, x, y);
      if (rb < 0) c = 9;
      else if (rb < 60) c *= 1.5;
      if (sd < 140) c *= 2.2;
      if (districts.parks.some((p) => dist(p.center, { x, y }) < p.radius + 25)) c *= 5;
      const hd = hw.nearest(x, y, 140);
      if (hd < 45) c *= 2.2;
      else if (hd > 60 && hd < 140) c *= 0.65;
      if (i < 2 || j < 2 || i > n - 3 || j > n - 3) c *= 2.5;
      cost[j * n + i] = c;
    }
  }
  return { n, cost };
}

/** Cheapest path over the grid that never turns more than 45 degrees per cell. Returns cell indices from start to goal. */
function route(grid: Grid, start: number, startDirs: number[], goal: (cell: number) => boolean, extra?: (cell: number) => number): number[] | null {
  const { n, cost } = grid;
  const best = new Float64Array(n * n * 8).fill(Infinity);
  const prev = new Int32Array(n * n * 8).fill(-1);
  const heap = new Heap();
  for (const d of startDirs) {
    best[start * 8 + d] = 0;
    heap.push(0, start * 8 + d);
  }
  while (heap.size) {
    const [k, state] = heap.pop();
    if (k > best[state]) continue;
    const cell = state >> 3;
    const dir = state & 7;
    if (cell !== start && goal(cell)) {
      const out: number[] = [];
      for (let s = state; s >= 0; s = prev[s]) out.push(s >> 3);
      return out.reverse();
    }
    const i = cell % n;
    const j = (cell - i) / n;
    for (let turn = -1; turn <= 1; turn++) {
      const nd = (dir + turn + 8) & 7;
      const ni = i + DIRS[nd][0];
      const nj = j + DIRS[nd][1];
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nc = nj * n + ni;
      if (cost[nc] === Infinity) continue;
      const step = 0.5 * (cost[cell] + cost[nc]) * (nd & 1 ? Math.SQRT2 : 1) + (turn ? TURN_COST : 0) + (extra ? extra(nc) : 0);
      const ns = nc * 8 + nd;
      if (k + step < best[ns]) {
        best[ns] = k + step;
        prev[ns] = state;
        heap.push(k + step, ns);
      }
    }
  }
  return null;
}

const cellPoint = (n: number, cell: number): Vec2 => ({ x: ((cell % n) + 0.5) * GRID, y: (Math.floor(cell / n) + 0.5) * GRID });

/** Rounds a polyline until no curve is tighter than `radius`; the first `pin` points and the last one stay put. */
function relax(pts: Vec2[], radius: number, pin = 1): Vec2[] {
  let cur = resample(pts, RAIL_STEP);
  const limit = (RAIL_STEP / radius) * 0.9;
  for (let round = 0; round < 240; round++) {
    let worst = 0;
    for (let i = 2; i < cur.length; i++) {
      const a1 = Math.atan2(cur[i - 1].y - cur[i - 2].y, cur[i - 1].x - cur[i - 2].x);
      const a2 = Math.atan2(cur[i].y - cur[i - 1].y, cur[i].x - cur[i - 1].x);
      worst = Math.max(worst, angleDiff(a1, a2));
    }
    if (worst <= limit) break;
    for (let k = 0; k < 12; k++) {
      const next = cur.slice();
      for (let i = pin; i + 1 < cur.length; i++) {
        next[i] = { x: 0.25 * cur[i - 1].x + 0.5 * cur[i].x + 0.25 * cur[i + 1].x, y: 0.25 * cur[i - 1].y + 0.5 * cur[i].y + 0.25 * cur[i + 1].y };
      }
      cur = next;
    }
    cur = resample(cur, RAIL_STEP);
  }
  return cur;
}

/** Sharpest change of heading per RAIL_STEP, radians. */
export function sharpestRailTurn(pts: Vec2[]): number {
  let worst = 0;
  for (let i = 2; i < pts.length; i++) {
    // The last segment can be a short remainder of the resampling.
    if (dist(pts[i], pts[i - 1]) < 0.5 * RAIL_STEP) continue;
    const a1 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
    const a2 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    worst = Math.max(worst, angleDiff(a1, a2));
  }
  return worst;
}

function valid(t: Terrain, pts: Vec2[]): boolean {
  let wet = 0;
  for (const p of pts) {
    if (seaDistAt(t, p.x, p.y) < 15) return false;
    // Rivers are bridged, but not lengthwise.
    wet = isWater(t, p.x, p.y) ? wet + 1 : 0;
    if (wet > 22) return false;
  }
  return true;
}

function finish(t: Terrain, districts: Districts, kind: 'main' | 'freight', points: Vec2[], rng: Rng, startLevel?: number): RailLine {
  const n = points.length;
  const ground = points.map((p) => heightAt(t, p.x, p.y));
  const wet = points.map((p) => isWater(t, p.x, p.y));
  // Rail level: follows the ground, lifted onto a viaduct through the dense districts, spans water bank to bank.
  const target: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const type = districtAt(t, districts, points[i].x, points[i].y).type;
    const lift = kind === 'main' && (type === 'downtown' || type === 'midtown' || type === 'oldtown') ? VIADUCT_HEIGHT : 0;
    target[i] = wet[i] ? NaN : ground[i] + lift;
  }
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(target[i])) continue;
    let a = i - 1;
    let b = i;
    while (b < n && Number.isNaN(target[b])) b++;
    const va = a >= 0 ? target[a] : b < n ? target[b] : 3;
    const vb = b < n ? target[b] : va;
    for (let k = i; k < b; k++) target[k] = Math.max(2.5, va + ((vb - va) * (k - a)) / (b - a));
    i = b;
  }
  if (startLevel !== undefined) target[0] = startLevel;
  // Limit the grade from both ends, then round the profile off; neither step can steepen it again.
  const limit = RAIL_MAX_GRADE * 0.95 * RAIL_STEP;
  const fwd = target.slice();
  for (let i = 1; i < n; i++) fwd[i] = clamp(fwd[i], fwd[i - 1] - limit, fwd[i - 1] + limit);
  let level = fwd;
  if (startLevel === undefined) {
    const back = target.slice();
    for (let i = n - 2; i >= 0; i--) back[i] = clamp(back[i], back[i + 1] - limit, back[i + 1] + limit);
    level = fwd.map((v, i) => 0.5 * (v + back[i]));
  }
  for (let k = 0; k < 150; k++) {
    const next = level.slice();
    for (let i = 1; i + 1 < n; i++) next[i] = 0.25 * level[i - 1] + 0.5 * level[i] + 0.25 * level[i + 1];
    level = next;
  }
  const structure: RailStructure[] = points.map((_, i) => {
    if (wet[i]) return 'bridge';
    const d = level[i] - ground[i];
    return d > 3.5 ? 'elevated' : d < -7 ? 'tunnel' : 'ground';
  });
  // Bridges start on the bank, and very short viaducts, tunnels and gaps between them are not worth building.
  for (let i = 0; i < n; i++) {
    if (!wet[i]) continue;
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) structure[k] = 'bridge';
  }
  for (let i = 0; i < n; ) {
    let j = i;
    while (j < n && structure[j] === structure[i]) j++;
    if (structure[i] !== 'bridge' && j - i < 8 && (i > 0 || j < n)) {
      const before = i > 0 ? structure[i - 1] : structure[j];
      const after = j < n ? structure[j] : before;
      const fill = before === 'bridge' ? (after === 'bridge' ? 'elevated' : after) : before;
      for (let k = i; k < j; k++) structure[k] = fill;
    }
    i = j;
  }
  // Where the tracks are on the ground, most local streets end at the fence; a share get a level crossing.
  const open = kind === 'main' ? 0.4 : 0.65;
  const zone = Math.round(130 / RAIL_STEP);
  const zones: boolean[] = [];
  const crossable = structure.map((s, i) => {
    if (s !== 'ground') return true;
    const z = Math.floor(i / zone);
    while (zones.length <= z) zones.push(rng.chance(open));
    return zones[z];
  });
  return { kind, tracks: kind === 'main' ? 2 : 1, points, structure, level, crossable, length: polyLength(points) };
}

function mainLine(t: Terrain, districts: Districts, grid: Grid, rng: Rng): Vec2[] | null {
  const { n, cost } = grid;
  const S = t.size;
  const c = S / 2;
  const side = (cell: number): number => {
    const p = cellPoint(n, cell);
    const i = cell % n;
    const j = Math.floor(cell / n);
    if (i > 0 && j > 0 && i < n - 1 && j < n - 1) return 0;
    if (cost[cell] === Infinity || hillAt(t, p.x, p.y) > 0.45) return 0;
    const v = ((p.x - c) * t.along.x + (p.y - c) * t.along.y) / S;
    return v < -0.25 ? -1 : v > 0.25 ? 1 : 0;
  };
  // Pass the edge of downtown, where the central station will stand.
  const dt = districts.downtown.center;
  const vias: { cell: number; score: number }[] = [];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const r = rng.range(330, 520);
    const i = Math.floor((dt.x + Math.cos(a) * r) / GRID);
    const j = Math.floor((dt.y + Math.sin(a) * r) / GRID);
    if (i < 3 || j < 3 || i > n - 4 || j > n - 4) continue;
    const cell = j * n + i;
    if (cost[cell] === Infinity || cost[cell] >= 9) continue;
    vias.push({ cell, score: cost[cell] * rng.range(1, 1.5) });
  }
  vias.sort((a, b) => a.score - b.score);
  const edgePoint = (p: Vec2, q: Vec2): Vec2 => {
    // Continue the last step out to the map edge.
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    let k = Infinity;
    if (dx > 0) k = Math.min(k, (S - p.x) / dx);
    if (dx < 0) k = Math.min(k, -p.x / dx);
    if (dy > 0) k = Math.min(k, (S - p.y) / dy);
    if (dy < 0) k = Math.min(k, -p.y / dy);
    return { x: clamp(p.x + dx * k, 0, S), y: clamp(p.y + dy * k, 0, S) };
  };
  for (const via of vias.slice(0, 8)) {
    const p1 = route(grid, via.cell, [0, 1, 2, 3, 4, 5, 6, 7], (cell) => side(cell) === -1);
    if (!p1 || p1.length < 3) continue;
    const d1 = DIRS.findIndex(([dx, dy]) => dx === (p1[1] % n) - (p1[0] % n) && dy === Math.floor(p1[1] / n) - Math.floor(p1[0] / n));
    const used = new Set(p1);
    const p2 = route(grid, via.cell, [(d1 + 4) & 7], (cell) => side(cell) === 1, (cell) => (used.has(cell) ? 50 : 0));
    if (!p2 || p2.length < 3) continue;
    const cells = [...p1.reverse(), ...p2.slice(1)];
    const pts = cells.map((cell) => cellPoint(n, cell));
    pts.unshift(edgePoint(pts[0], pts[1]));
    pts.push(edgePoint(pts[pts.length - 1], pts[pts.length - 2]));
    const line = relax(pts, RAIL_MIN_RADIUS.main);
    if (valid(t, line)) return line;
  }
  return null;
}

function freightLine(t: Terrain, districts: Districts, grid: Grid, main: RailLine): Vec2[] | null {
  const { n, cost } = grid;
  const mainCells = new Map<number, number>();
  const margin = Math.round(350 / RAIL_STEP);
  main.points.forEach((p, i) => {
    if (i < margin || i > main.points.length - margin || main.structure[i] === 'tunnel' || main.structure[i] === 'bridge') return;
    const cell = Math.floor(p.y / GRID) * n + Math.floor(p.x / GRID);
    if (!mainCells.has(cell)) mainCells.set(cell, i);
  });
  const near = (p: Vec2): number => {
    let best = Infinity;
    for (let i = 0; i < main.points.length; i += 4) best = Math.min(best, dist(p, main.points[i]));
    return best;
  };
  // Serve the industrial district closest to the sea (the port) that the main line does not already reach.
  const targets = districts.list
    .filter((d) => d.type === 'industrial' && near(d.center) > 320)
    .sort((a, b) => seaDistAt(t, a.center.x, a.center.y) - seaDistAt(t, b.center.x, b.center.y));
  for (const target of targets.slice(0, 3)) {
    const start = Math.floor(target.center.y / GRID) * n + Math.floor(target.center.x / GRID);
    if (cost[start] === Infinity) continue;
    const path = route(grid, start, [0, 1, 2, 3, 4, 5, 6, 7], (cell) => mainCells.has(cell));
    if (!path || path.length < 8) continue;
    path.reverse();
    const at = mainCells.get(path[0])!;
    const out = path.slice(2).map((cell) => cellPoint(n, cell));
    // Leave the main line in the direction the branch is heading.
    const heading = { x: out[1].x - main.points[at].x, y: out[1].y - main.points[at].y };
    const tan = { x: main.points[at + 1].x - main.points[at - 1].x, y: main.points[at + 1].y - main.points[at - 1].y };
    const sense = heading.x * tan.x + heading.y * tan.y >= 0 ? 1 : -1;
    const lead: Vec2[] = [];
    for (let k = 30; k >= 0; k--) {
      const i = at - sense * k;
      if (i >= 0 && i < main.points.length) lead.push(main.points[i]);
    }
    const line = relax([...lead, ...out], RAIL_MIN_RADIUS.freight, lead.length);
    // Drop the part that still runs on the main line.
    let first = lead.length - 1;
    while (first + 1 < line.length && near(line[first + 1]) < 2.5) first++;
    const branch = line.slice(first);
    if (branch.length < 30 || !valid(t, branch)) continue;
    return branch;
  }
  return null;
}

export function generateRail(t: Terrain, districts: Districts, highways: Vec2[][], rng: Rng): Rail {
  const grid = buildCost(t, districts, highways);
  const lines: RailLine[] = [];
  const mainPts = mainLine(t, districts, grid, rng.fork('main'));
  if (mainPts) {
    const main = finish(t, districts, 'main', mainPts, rng.fork('main-profile'));
    lines.push(main);
    const freightPts = freightLine(t, districts, grid, main);
    if (freightPts) {
      let at = 0;
      main.points.forEach((p, i) => {
        if (dist(p, freightPts[0]) < dist(main.points[at], freightPts[0])) at = i;
      });
      lines.push(finish(t, districts, 'freight', freightPts, rng.fork('freight-profile'), main.level[at]));
    }
  }
  return { lines };
}

export interface RailHit {
  d: number;
  line: number;
  /** Index of the point at the start of the nearest segment. */
  seg: number;
  /** Unit direction of the track there. */
  tan: Vec2;
}

/** Spatial lookup of the tracks, used to keep streets off them. */
export class RailIndex {
  private readonly index = new SegmentIndex(60);

  constructor(readonly rail: Rail) {
    rail.lines.forEach((l, i) => this.index.addLine(i, l.points));
  }

  nearest(x: number, y: number, radius: number): RailHit | null {
    let best: RailHit | null = null;
    this.index.query(x - radius, y - radius, x + radius, y + radius, (r) => {
      const d = pointSeg(x, y, r.a, r.b).d;
      if (d > radius || (best && d >= best.d)) return;
      const l = dist(r.a, r.b) || 1;
      best = { d, line: r.line, seg: r.seg, tan: { x: (r.b.x - r.a.x) / l, y: (r.b.y - r.a.y) / l } };
    });
    return best;
  }

  /**
   * True if a street may not be at (x, y): local streets stop at fenced track, and no street heading (dx, dy)
   * may run along the tracks inside their clearance. Tunnels block nothing.
   */
  blocks(x: number, y: number, local: boolean, dx?: number, dy?: number): boolean {
    const hit = this.nearest(x, y, RAIL_CLEARANCE);
    if (!hit) return false;
    const line = this.rail.lines[hit.line];
    if (line.structure[hit.seg] === 'tunnel') return false;
    if (dx !== undefined && dy !== undefined && Math.abs(dx * hit.tan.x + dy * hit.tan.y) > 0.8) return true;
    return local && !line.crossable[hit.seg];
  }

  /** Crossings of the segment a-b with track that is not in a tunnel. */
  crossings(a: Vec2, b: Vec2): { x: number; y: number; line: number; seg: number }[] {
    const out: { x: number; y: number; line: number; seg: number }[] = [];
    this.index.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (r) => {
      if (this.rail.lines[r.line].structure[r.seg] === 'tunnel') return;
      const h = segSeg(a, b, r.a, r.b);
      if (h) out.push({ x: h.x, y: h.y, line: r.line, seg: r.seg });
    });
    return out;
  }
}

export interface RailCrossing {
  x: number;
  y: number;
  /** Index into Rail.lines. */
  line: number;
  /** Road edge id. */
  edge: number;
  /** `level`: level crossing. `road-under`: the road passes below the tracks. `road-over`: the road passes above them. */
  kind: 'level' | 'road-under' | 'road-over';
}

/** Every place where a road crosses track that is not in a tunnel, and how the two pass each other. */
export function railCrossings(index: RailIndex, graph: RoadGraph): RailCrossing[] {
  const out: RailCrossing[] = [];
  for (const e of graph.edges) {
    for (let i = 1; i < e.points.length; i++) {
      for (const h of index.crossings(e.points[i - 1], e.points[i])) {
        const line = index.rail.lines[h.line];
        const structure = line.structure[h.seg];
        let kind: RailCrossing['kind'] = 'level';
        if (structure !== 'ground') kind = 'road-under';
        // Freeways pass above track on the ground; every street crosses it on the level.
        else if (e.cls === 'highway' || e.cls === 'ramp') kind = 'road-over';
        out.push({ x: h.x, y: h.y, line: h.line, edge: e.id, kind });
      }
    }
  }
  return out;
}
