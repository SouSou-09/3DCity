import { Heap } from '../core/heap';
import { Rng } from '../core/rng';
import { SegmentIndex, pointSeg, polyLength, resample, segSeg, simplify } from '../core/geom';
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
  /** Whether a street may cross here (a level crossing, or under a viaduct). Arterial roads always cross: over them the main line is on a viaduct. */
  crossable: boolean[];
  length: number;
}

export interface Rail {
  lines: RailLine[];
  /** Where a main street crosses the tracks on the level: no other street joins it close to the gates. */
  gates: Vec2[];
}

export const RAIL_STEP = 10;
/** Tightest curve of the main line / the freight branch, metres. */
export const RAIL_MIN_RADIUS = { main: 300, freight: 160 };
/** The curves that the lines are laid out with where there is room. */
const RAIL_CURVE = { main: 480, freight: 220 };
export const RAIL_MAX_GRADE = 0.03;
/** Streets keep this far from tracks they do not cross. */
export const RAIL_CLEARANCE = 16;
/** No street runs along track on the ground closer than this: room for a row of lots, and for cars to wait at a crossing. */
export const RAIL_SIDE = 45;
/** Ground above the rails at a tunnel mouth, the least that the deepest part of a tunnel lies under, and its shortest length in points. */
const PORTAL_COVER = 9;
const TUNNEL_COVER = 12;
const TUNNEL_MIN = 8;
/** Furthest above or below the ground that track can be for a local street to cross it on the level. */
const CROSSING_REACH = 2;
const VIADUCT_HEIGHT = 7.5;
/** Level crossings: the length of track that streets may cross at one, and the track between two of them, metres. */
const CROSSING_WINDOW = 50;
const CROSSING_GAP = { main: [260, 420], freight: [150, 260] };
/** A viaduct does not come down between two places that need it if they are closer than this, metres. */
const VIADUCT_GAP = 650;
/** Least track between two level crossings, and between two of main streets, metres. */
const CROSSING_APART = 150;
const GATED_APART = 280;
/** No smaller street joins a main one this close to its level crossing: the queue at the gates needs the room. */
export const GATE_CLEAR = 55;
/** Fewest points of a branch worth building, and how many before a main street it ends if it cannot cross it. */
const BRANCH_MIN = 30;
const BRANCH_SHORT = 6;
/** Within this distance of the centre of downtown the main line has no level crossing on a main street. */
const INNER_RADIUS = 1300;
/** A level crossing of a main street is no further than this from square, radians, and this far from its junctions, metres. */
const MAX_SKEW = 0.6;
const JUNCTION_CLEAR = 70;
/** Track is lifted this far to both sides of a main street that it passes over. */
const VIADUCT_REACH = 90;
/** Longest freight branch, metres: a spur to works that the main line passes, not a second line across town. */
const FREIGHT_MAX = 1500;
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
const TURN_COST = 4;

interface Grid {
  n: number;
  cost: Float32Array;
  /** Cells of industrial land. */
  works: Uint8Array;
  /** The freeways. */
  hw: SegmentIndex;
}

function buildCost(t: Terrain, districts: Districts, highways: Vec2[][]): Grid {
  const n = Math.round(t.size / GRID);
  const cost = new Float32Array(n * n);
  const works = new Uint8Array(n * n);
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
      if (d.type === 'industrial') works[j * n + i] = 1;
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
      // The shore belongs to the beach and the promenade; only the port has track near the water.
      const port = d.type === 'industrial';
      if (sd < 110) c *= port ? 1.6 : 4;
      else if (sd < 230) c *= port ? 1 : 1.8;
      if (districts.parks.some((p) => dist(p.center, { x, y }) < p.radius + 40)) c *= 8;
      // A freeway is crossed once, quickly and squarely, and never followed: its ramps need the land beside it.
      const hd = hw.nearest(x, y, 280);
      if (hd < 130) c *= 4.5;
      else if (hd < 280) c *= 1.7;
      if (i < 2 || j < 2 || i > n - 3 || j > n - 3) c *= 2.5;
      cost[j * n + i] = c;
    }
  }
  return { n, cost, works, hw };
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

/** Cost of running along a polyline, sampled every 20 m; Infinity if it leaves the land the railway may use. */
function runCost(grid: Grid, pts: Vec2[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    const steps = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / 20));
    for (let k = 0; k < steps; k++) {
      const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * (k + 0.5)) / steps;
      const y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * (k + 0.5)) / steps;
      const [ci, cj] = [clamp(Math.floor(x / GRID), 0, grid.n - 1), clamp(Math.floor(y / GRID), 0, grid.n - 1)];
      sum += (grid.cost[cj * grid.n + ci] * dist(pts[i - 1], pts[i])) / steps / GRID;
    }
  }
  return sum;
}

/**
 * A railway is long straights joined by wide curves, not the staircase a grid search leaves: drop as many of the
 * path's corners as can go without taking it over much worse ground. The first `pin` points stay.
 */
function straighten(grid: Grid, pts: Vec2[], pin = 0): Vec2[] {
  const head = pts.slice(0, pin);
  const rest = pts.slice(Math.max(0, pin - 1));
  const base = runCost(grid, rest);
  for (const tol of [90, 65, 45, 28]) {
    const out = simplify(rest, tol);
    if (runCost(grid, out) <= base * 1.12) return [...head, ...out.slice(pin > 0 ? 1 : 0)];
  }
  return pts;
}

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

/** Where the main line runs on a viaduct whatever it crosses: through the dense districts. */
function denseRun(t: Terrain, districts: Districts, kind: 'main' | 'freight', points: Vec2[]): boolean[] {
  return points.map((p) => {
    const type = districtAt(t, districts, p.x, p.y).type;
    return kind === 'main' && (type === 'downtown' || type === 'midtown' || type === 'oldtown');
  });
}

/**
 * Works out the level and structure of a line. `lifted` marks the track that goes on a viaduct; `gated` lists the
 * points where a main street crosses on the level, which the crossings of smaller streets keep away from.
 */
function finish(t: Terrain, kind: 'main' | 'freight', points: Vec2[], lifted: boolean[], rng: Rng, startLevel?: number, gated: number[] = []): RailLine {
  const n = points.length;
  const ground = points.map((p) => heightAt(t, p.x, p.y));
  const wet = points.map((p) => isWater(t, p.x, p.y));
  // Rail level: follows the ground, lifted onto a viaduct where `lifted` says so, spans water bank to bank.
  const target: number[] = new Array(n);
  for (let i = 0; i < n; i++) target[i] = wet[i] ? NaN : ground[i] + (lifted[i] ? VIADUCT_HEIGHT : 0);
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
  // A viaduct is at its full height over everything it is there to clear: its ramps lie outside that.
  const limit = RAIL_MAX_GRADE * 0.95 * RAIL_STEP;
  for (const dir of [1, -1]) {
    let carry = -Infinity;
    for (let i = dir > 0 ? 0 : n - 1; i >= 0 && i < n; i += dir) {
      carry = lifted[i] ? Math.max(target[i], carry - limit) : carry - limit;
      target[i] = Math.max(target[i], carry);
    }
  }
  if (startLevel !== undefined) target[0] = startLevel;
  // Limit the grade from both ends, then round the profile off; neither step can steepen it again.
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
  // A tunnel has a hill over it: its mouths stand where the ground is well above the rails, and what lies between
  // them must be long and deep enough to be worth boring. Anything less is an open cutting.
  for (let i = 0; i < n; ) {
    if (structure[i] !== 'tunnel') {
      i++;
      continue;
    }
    let j = i;
    while (j < n && structure[j] === 'tunnel') j++;
    let [a, b] = [i, j - 1];
    while (a <= b && a > 0 && ground[a] - level[a] < PORTAL_COVER) a++;
    while (b >= a && b < n - 1 && ground[b] - level[b] < PORTAL_COVER) b--;
    let deepest = 0;
    for (let k = a; k <= b; k++) deepest = Math.max(deepest, ground[k] - level[k]);
    const bored = b - a + 1 >= TUNNEL_MIN && deepest >= TUNNEL_COVER;
    for (let k = i; k < j; k++) if (!bored || k < a || k > b) structure[k] = 'ground';
    i = j;
  }
  // Bridges start on the bank, and very short viaducts, tunnels and gaps between them are not worth building.
  for (let i = 0; i < n; i++) {
    if (!wet[i]) continue;
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) structure[k] = 'bridge';
  }
  for (let i = 0; i < n; ) {
    let j = i;
    while (j < n && structure[j] === structure[i]) j++;
    if (structure[i] !== 'bridge' && structure[i] !== 'tunnel' && j - i < 8 && (i > 0 || j < n)) {
      const before = i > 0 ? structure[i - 1] : structure[j];
      const after = j < n ? structure[j] : before;
      const fill = before === 'bridge' ? (after === 'bridge' ? 'elevated' : after) : before;
      for (let k = i; k < j; k++) structure[k] = fill;
    }
    i = j;
  }
  // Where the tracks are on the ground, streets end at the fence. Level crossings are few and well apart: one short
  // window every few hundred metres, only where the rails lie at the level of the ground.
  const [gap0, gap1] = kind === 'main' ? CROSSING_GAP.main : CROSSING_GAP.freight;
  const crossable = structure.map((s) => s !== 'ground');
  for (let i = Math.round(rng.range(0.3, 1) * gap0 / RAIL_STEP); i < n; ) {
    const w = Math.round(CROSSING_WINDOW / RAIL_STEP);
    let ok = i + w < n;
    // Clear of the ramps of a viaduct: the rails have to be able to meet the street exactly.
    for (let k = i - 6; ok && k <= i + w + 6; k++) ok = k >= 0 && k < n && structure[k] === 'ground' && Math.abs(level[k] - ground[k]) <= CROSSING_REACH;
    const apart = Math.round(CROSSING_APART / RAIL_STEP);
    ok &&= !gated.some((g) => g > i - apart && g < i + w + apart);
    if (!ok) {
      i += 2;
      continue;
    }
    for (let k = i; k <= i + w; k++) crossable[k] = true;
    i += w + Math.round(rng.range(gap0, gap1) / RAIL_STEP);
  }
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
    for (const radius of [RAIL_CURVE.main, RAIL_MIN_RADIUS.main]) {
      const line = relax(straighten(grid, pts), radius);
      if (valid(t, line)) return line;
    }
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
    // A spur is short and keeps to the works it serves: every cell of other land costs it extra.
    const path = route(grid, start, [0, 1, 2, 3, 4, 5, 6, 7], (cell) => mainCells.has(cell), (cell) => (grid.works[cell] ? 0 : 2.5));
    if (!path || path.length < 8 || path.length * GRID > FREIGHT_MAX) continue;
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
    const line = relax(straighten(grid, [...lead, ...out], lead.length), RAIL_CURVE.freight, lead.length);
    // Drop the part that still runs on the main line.
    let first = lead.length - 1;
    while (first + 1 < line.length && near(line[first + 1]) < 2.5) first++;
    const branch = line.slice(first);
    // It ends in a yard back from the quay, not at the water's edge.
    while (branch.length > 1 && seaDistAt(t, branch[branch.length - 1].x, branch[branch.length - 1].y) < 90) branch.pop();
    if (branch.length < 30 || branch.length * RAIL_STEP > FREIGHT_MAX || !valid(t, branch)) continue;
    // A spur is not worth a bridge under or over a freeway and its ramps.
    if (branch.some((p) => grid.hw.nearest(p.x, p.y, 70) < 70)) continue;
    return branch;
  }
  return null;
}

export function generateRail(t: Terrain, districts: Districts, highways: Vec2[][], rng: Rng): Rail {
  const grid = buildCost(t, districts, highways);
  const lines: RailLine[] = [];
  const mainPts = mainLine(t, districts, grid, rng.fork('main'));
  if (mainPts) {
    const main = finish(t, 'main', mainPts, denseRun(t, districts, 'main', mainPts), rng.fork('main-profile'));
    lines.push(main);
    const freightPts = freightLine(t, districts, grid, main);
    if (freightPts) {
      let at = 0;
      main.points.forEach((p, i) => {
        if (dist(p, freightPts[0]) < dist(main.points[at], freightPts[0])) at = i;
      });
      const branch = finish(t, 'freight', freightPts, freightPts.map(() => false), rng.fork('freight-profile'), main.level[at]);
      if (endBranch(t, branch, branch.points.length - 1)) lines.push(branch);
    }
  }
  return { lines, gates: [] };
}

/**
 * Ends the branch at or before point `end`, in a yard on open ground: not inside a hill, in a cutting or up on a
 * viaduct. False if that leaves too little of it to be worth building.
 */
function endBranch(t: Terrain, branch: RailLine, end: number): boolean {
  const open = (i: number): boolean => {
    const p = branch.points[i];
    return branch.structure[i] === 'ground' && Math.abs(branch.level[i] - heightAt(t, p.x, p.y)) <= 1.5;
  };
  while (end > 0 && !(open(end) && open(Math.max(0, end - 2)) && open(Math.max(0, end - 4)))) end--;
  if (end < BRANCH_MIN) return false;
  if (end < branch.points.length - 1) {
    branch.points.length = branch.structure.length = branch.level.length = branch.crossable.length = end + 1;
    branch.length = polyLength(branch.points);
  }
  return true;
}

export interface RailHit {
  d: number;
  line: number;
  /** Index of the point at the start of the nearest segment. */
  seg: number;
  /** Unit direction of the track there. */
  tan: Vec2;
}

/**
 * Settles how the lines meet the main streets, once those are known. Trains on the main line are frequent: in and
 * around the centre it passes over every main street on a viaduct, and stays up as long as the next one is near.
 * Further out a main street may cross on the level, behind gates, where the crossing is a simple one. The branch
 * has no viaducts: it ends before a main street that it cannot cross simply. Called before the smaller streets
 * are traced, which then end at the tracks, cross in the gaps left for them or pass under the viaduct.
 */
export function separateGrades(rail: Rail, t: Terrain, districts: Districts, arterials: Vec2[][], highways: Vec2[][], rng: Rng): void {
  const li = rail.lines.findIndex((l) => l.kind === 'main');
  if (li < 0) return;
  const main = rail.lines[li];
  const n = main.points.length;
  type Hit = { seg: number; line: number; skew: number; x: number; y: number };
  const hits = (track: Vec2[], lines: Vec2[][]): Hit[] => {
    const index = new SegmentIndex(60);
    index.addLine(0, track);
    const out: Hit[] = [];
    lines.forEach((pts, line) => {
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        index.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (r) => {
          const hit = segSeg(a, b, r.a, r.b);
          if (!hit) return;
          const turn = angleDiff(Math.atan2(b.y - a.y, b.x - a.x), Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x));
          out.push({ seg: r.seg, line, skew: Math.abs(Math.PI / 2 - Math.min(turn, Math.PI - turn)), x: hit.x, y: hit.y });
        });
      }
    });
    return out.sort((p, q) => p.seg - q.seg);
  };
  const roads = new SegmentIndex(80);
  arterials.forEach((pts, i) => roads.addLine(i, pts));
  /** Another main street meets the one of this crossing close to the tracks. */
  const atJunction = (c: Hit): boolean => {
    let found = false;
    roads.query(c.x - JUNCTION_CLEAR, c.y - JUNCTION_CLEAR, c.x + JUNCTION_CLEAR, c.y + JUNCTION_CLEAR, (r) => {
      if (r.line !== c.line && pointSeg(c.x, c.y, r.a, r.b).d < JUNCTION_CLEAR) found = true;
    });
    return found;
  };
  const lifted = denseRun(t, districts, 'main', main.points);
  const reach = Math.round(VIADUCT_REACH / RAIL_STEP);
  const lift = (seg: number) => {
    for (let k = Math.max(0, seg - reach); k <= Math.min(n - 1, seg + 1 + reach); k++) lifted[k] = true;
  };
  // In and around the centre every main street is passed over. Further out they are fewer and quieter, and the
  // line stays on the ground with a gated level crossing - but only a simple one: square to the street, clear of
  // its junctions and of the next crossing.
  const centre = districts.downtown.center;
  const over = hits(main.points, arterials);
  const apart = Math.round(GATED_APART / RAIL_STEP);
  for (const c of over) {
    const simple = c.skew < MAX_SKEW && !atJunction(c) && !over.some((o) => o !== c && Math.abs(o.seg - c.seg) < apart);
    if (dist(main.points[c.seg], centre) <= INNER_RADIUS || !simple) lift(c.seg);
  }
  // Stay up between two viaducts that are close; under a freeway the line comes down sooner, so that the freeway
  // does not have to climb over it. A main street that would cross on a viaduct's ramp is passed over as well.
  const under = hits(main.points, highways);
  const ramp = Math.round(VIADUCT_HEIGHT / RAIL_MAX_GRADE / RAIL_STEP) + 8;
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i < n; ) {
      if (lifted[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && !lifted[j]) j++;
      const limit = under.some((c) => c.seg >= i - 1 && c.seg <= j) ? 0.65 * VIADUCT_GAP : VIADUCT_GAP;
      if (i > 0 && j < n && (j - i) * RAIL_STEP < limit) for (let k = i; k < j; k++) lifted[k] = true;
      i = j;
    }
    for (const c of over) {
      if (lifted[c.seg]) continue;
      let near = false;
      for (let k = Math.max(0, c.seg - ramp); k <= Math.min(n - 1, c.seg + ramp); k++) near ||= lifted[k];
      if (near) {
        lift(c.seg);
        again = true;
      }
    }
  }
  const gated = over.filter((c) => !lifted[c.seg]);
  Object.assign(main, finish(t, 'main', main.points, lifted, rng.fork('main-profile'), undefined, gated.map((c) => c.seg)));
  rail.gates = gated.map((c) => ({ x: c.x, y: c.y }));
  for (const branch of rail.lines.filter((l) => l.kind === 'freight')) {
    let at = 0;
    main.points.forEach((p, i) => {
      if (dist(p, branch.points[0]) < dist(main.points[at], branch.points[0])) at = i;
    });
    if (Math.abs(main.level[at] - branch.level[0]) > 0.05) Object.assign(branch, finish(t, 'freight', branch.points, branch.points.map(() => false), rng.fork('freight-profile'), main.level[at]));
    // Under the ramp down from the main line's viaduct a street passes below.
    const across = hits(branch.points, arterials).filter((c) => branch.structure[c.seg] === 'ground');
    const close = Math.round(CROSSING_APART / RAIL_STEP);
    const bad = across.find((c, k) => c.skew >= MAX_SKEW || atJunction(c) || (k > 0 && c.seg - across[k - 1].seg < close));
    const end = bad ? bad.seg - BRANCH_SHORT : branch.points.length - 1;
    if (endBranch(t, branch, end)) rail.gates.push(...across.filter((c) => c.seg < branch.points.length - 1).map((c) => ({ x: c.x, y: c.y })));
    else rail.lines.splice(rail.lines.indexOf(branch), 1);
  }
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
   * True if a street may not be at (x, y): streets other than the main ones (`minor`) stop at fenced track, and no
   * street heading (dx, dy) may run along the tracks inside their clearance. Tunnels block nothing.
   */
  blocks(x: number, y: number, minor: boolean, dx?: number, dy?: number): boolean {
    // Beside track on the ground the land backs onto the fence: a street along it would meet every street that
    // crosses within a few metres of the level crossing.
    const side = dx !== undefined && dy !== undefined ? this.nearest(x, y, RAIL_SIDE) : null;
    if (side && this.rail.lines[side.line].structure[side.seg] === 'ground' && Math.abs(dx! * side.tan.x + dy! * side.tan.y) > 0.8) return true;
    if (minor && this.rail.gates.some((g) => Math.abs(g.x - x) < GATE_CLEAR && Math.hypot(g.x - x, g.y - y) < GATE_CLEAR)) return true;
    const hit = this.nearest(x, y, RAIL_CLEARANCE);
    if (!hit) return false;
    const line = this.rail.lines[hit.line];
    if (line.structure[hit.seg] === 'tunnel') return false;
    if (dx !== undefined && dy !== undefined && Math.abs(dx * hit.tan.x + dy * hit.tan.y) > 0.8) return true;
    return minor && !line.crossable[hit.seg];
  }

  /** True if (x, y) is on main-line track that lies on the ground, where no main street may cross. */
  atGrade(x: number, y: number): boolean {
    const hit = this.nearest(x, y, RAIL_CLEARANCE);
    return !!hit && this.rail.lines[hit.line].kind === 'main' && this.rail.lines[hit.line].structure[hit.seg] === 'ground';
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
