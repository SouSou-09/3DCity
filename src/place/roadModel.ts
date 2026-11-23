import { Frame, MeshBuilder, ModelData, Path, V3, frameAt, offset, pathLength, slicePath } from '../assets/mesh/builder';
import { Arm, Control, armReach, junction } from '../assets/mesh/junction';
import { plainTex } from '../assets/mesh/presets';
import { Bay, Section, layout, reversed, sweepSection } from '../assets/mesh/section';
import { pointSeg, resample } from '../core/geom';
import { Vec2, clamp, mix, smoothstep } from '../core/vec2';
import { City } from '../gen/city';
import { NodePlane, RoadLevels, freewayRun, roadLevels } from '../gen/roadHeights';
import { RoadClass } from '../gen/streamlines';
import { STATION_HALF } from '../gen/stations';
import { heightAt } from '../gen/terrain';
import { TOP as RAIL_TOP } from '../assets/mesh/railkit';
import { RailProfile, railProfile } from './railProfile';
import { HIGHWAY_DECK, RAMP_DECK, sectionFor, surface } from './roadSections3d';

const TILE = 800;
/** Junction arms point at their road this far out at most, so that roads which swing together later still part cleanly. */
const AIM = 28;
/** Longest edge that two overlapping junctions may swallow to become one. */
const MERGE_MAX = 60;
/** Smallest angle between two neighbouring arms of a junction. */
const MIN_GAP = (34 * Math.PI) / 180;
/** How far a freeway that leaves the map sticks out past its edge before it is cut off. */
/** Length of the curve that brings a road from its junction arm back onto its own line, per metre between the two; and its longest. */
const SWING = 7;
const SWING_MAX = 45;
/** Least share of its centre line's step that a road's edge must still advance through a curve (see advance()). */
const ROOM = 0.25;
export const EDGE_STUB = 30;
/** How far below a freeway's surface a ramp or branch lies while it is still within the freeway's width. */
const UNDER = 0.1;
const RANK: Record<RoadClass, number> = { highway: 4, arterial: 3, collector: 2, ramp: 2, local: 1, alley: 0, path: 0 };

export interface JunctionArm {
  edge: number;
  end: 0 | 1;
  /** Direction away from the junction centre. */
  dir: Vec2;
  /** Distance from the centre at which the edge's own road starts. */
  reach: number;
  /** How traffic coming in on this arm is held, whether it has a crosswalk, and the length of the approach that carries them. */
  control: Control;
  crosswalk: boolean;
  approach: number;
}
export interface Junction {
  nodes: number[];
  x: number;
  y: number;
  plane: NodePlane;
  arms: JunctionArm[];
  signal: boolean;
}
export interface RoadModel {
  tiles: ModelData[];
  /** Terrain heights (same grid as the terrain) with the ground graded to the roads. */
  ground: Float32Array;
  levels: RoadLevels;
  junctions: Junction[];
  /** Centre line of each edge's road as built ([x, height, y]); null where a junction swallowed the edge. */
  lines: (V3[] | null)[];
  /** The railway's final levels and its level crossings; the ground is graded to its formation. */
  rail: RailProfile;
  /** Cross slope (rise per metre to the right) at each point of `lines`. */
  cross: (number[] | null)[];
  /** Cross-section of each edge as built, in the edge's direction. */
  sections: Section[];
  /** Bus bays cut into the kerb of the main roads. */
  bays: BusBay[];
  /** Where a freeway is cut off outside the map. */
  cuts: { x: number; y: number; h: number; edge: number }[];
  /** stats.folds: roads whose edges fold back over themselves somewhere along a curve too tight for their width. */
  stats: { junctions: number; signals: number; swallowed: number; folds: number; piers: number; triangles: number };
}

/** A bus bay; distances are along the edge's line in `lines`, measured on the map. */
export interface BusBay {
  edge: number;
  /** 1: on the right of the edge's direction, for traffic that runs along it; -1: on the left, for traffic against it. */
  side: 1 | -1;
  from: number;
  to: number;
  /** Where the front of the bus stands. */
  head: number;
  /** How far the kerb steps back, and how far the pavement widens away from the road to make up for it. */
  depth: number;
  bulge: number;
  /** Lengths of the tapers after `from` and before `to`. */
  taper: [number, number];
}
/** Bus bay: tapers in and out, the straight kerb between them, and how far the kerb steps back. */
const BAY = { enter: 14, stand: 15, leave: 9, depth: 3, front: 1.5 };
/** Districts whose buildings stand back from the street, so that the pavement can widen behind a bay. */
const BAY_TYPES = new Set(['residential', 'suburb', 'industrial', 'hills', 'beach']);
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

interface Seg {
  ax: number; ay: number; ah: number; ac: number;
  bx: number; by: number; bh: number; bc: number;
  half: number;
  /** Railway formation: it shapes the ground only where no road does. */
  rail?: boolean;
}

const norm2 = (x: number, y: number): Vec2 => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/** First point, walking along pts, that is at least r from m; null if the line never gets that far. */
function chordPoint(pts: Vec2[], m: Vec2, r: number): { p: Vec2; i: number } | null {
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(pts[i].x - m.x, pts[i].y - m.y) < r) continue;
    if (i === 0) return { p: pts[0], i: 0 };
    let lo = 0;
    let hi = 1;
    const a = pts[i - 1];
    const b = pts[i];
    for (let k = 0; k < 14; k++) {
      const q = (lo + hi) / 2;
      if (Math.hypot(mix(a.x, b.x, q) - m.x, mix(a.y, b.y, q) - m.y) < r) lo = q;
      else hi = q;
    }
    return { p: { x: mix(a.x, b.x, hi), y: mix(a.y, b.y, hi) }, i };
  }
  return null;
}

/** Douglas-Peucker on points with extra coordinates; returns the kept indices. */
function thin(pts: number[][], tol: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = pts[i0];
    const b = pts[i1];
    const d = b.map((v, k) => v - a[k]);
    const l2 = d.reduce((s, v) => s + v * v, 0) || 1;
    let worst = tol;
    let at = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const p = pts[i];
      const q = clamp(p.reduce((s, v, k) => s + (v - a[k]) * d[k], 0) / l2, 0, 1);
      const e = Math.sqrt(p.reduce((s, v, k) => s + (v - a[k] - d[k] * q) ** 2, 0));
      if (e > worst) {
        worst = e;
        at = i;
      }
    }
    if (at >= 0) {
      keep[at] = 1;
      stack.push([i0, at], [at, i1]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}

/** Sweep frames with a vertical up axis and a cross slope (rise per metre to the right) at each point. */
function frames(pts: V3[], cross: number[], t0?: Vec2, t1?: Vec2): Path {
  const out: Path = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[2] - a[2];
    const run = Math.hypot(tx, tz) || 1;
    const slope = (b[1] - a[1]) / run;
    if (i === 0 && t0) [tx, tz] = [t0.x, t0.y];
    if (i === pts.length - 1 && t1) [tx, tz] = [t1.x, t1.y];
    const h = Math.hypot(tx, tz) || 1;
    const l = Math.hypot(1, slope);
    out.push({ p: pts[i], t: [tx / h / l, slope / l, tz / h / l], r: [-tz / h, cross[i], tx / h], u: [0, 1, 0], s });
  }
  return out;
}

/** Bridge pier under the deck at frame f: a cap beam on round columns, or a wall for narrow decks. */
function pier(b: MeshBuilder, f: Frame, w: number, depth: number, ground: number): void {
  const top = f.p[1] - depth;
  if (top - ground < 0.5) return;
  const l = Math.hypot(f.r[0], f.r[2]) || 1;
  const ax: V3 = [f.r[0] / l, 0, f.r[2] / l];
  const az: V3 = [-ax[2], 0, ax[0]];
  const at = (x: number, y: number): V3 => [f.p[0] + ax[0] * x, y, f.p[2] + ax[2] * x];
  const tex = 'structure/pier-formwork';
  if (w < 14) {
    b.box(tex, at(0, (ground + top) / 2), [w * 0.36, (top - ground) / 2, 0.6], ax, [0, 1, 0], az);
    return;
  }
  const cap = Math.min(1.2, (top - ground) * 0.3);
  b.box(tex, at(0, top - cap / 2), [w * 0.4, cap / 2, 0.8], ax, [0, 1, 0], az);
  const n = w > 20 ? 3 : 2;
  const spread = w * 0.6;
  for (let i = 0; i < n; i++) b.tube(tex, at(-spread / 2 + (spread * i) / (n - 1), ground), at(-spread / 2 + (spread * i) / (n - 1), top - cap), 0.65, 12);
}

/** Copies a model built around the origin on a level plane onto a tilted plane at (x, y). */
function place(into: MeshBuilder, from: MeshBuilder, x: number, y: number, pl: NodePlane): void {
  for (const p of from.build().parts) {
    const t = into.part(p.material, p.layer);
    const base = t.positions.length / 3;
    for (let i = 0; i < p.positions.length; i += 3) {
      const px = p.positions[i];
      const pz = p.positions[i + 2];
      t.positions.push(px + x, p.positions[i + 1] + pl.h + pl.gx * px + pl.gy * pz, pz + y);
      const ny = p.normals[i + 1];
      const nx = p.normals[i] - pl.gx * ny;
      const nz = p.normals[i + 2] - pl.gy * ny;
      const l = Math.hypot(nx, ny, nz) || 1;
      t.normals.push(nx / l, ny / l, nz / l);
    }
    for (const v of p.uvs) t.uvs.push(v);
    for (const v of p.indices) t.indices.push(v + base);
  }
}

const variant = (sec: Section, noLeft: boolean, noRight: boolean, noMedian: boolean): Section => ({
  ...sec,
  left: noLeft ? { ...sec.left, edge: 'none' } : sec.left,
  right: noRight ? { ...sec.right, edge: 'none' } : sec.right,
  lanes: noMedian ? sec.lanes.map((l) => (l.kind === 'median' ? { ...l, median: 'painted' as const } : l)) : sec.lanes,
});

/** Builds every road, junction and freeway structure of the city as 3D models, tile by tile. */
export function buildRoadModel(city: City): RoadModel {
  const { graph, terrain: t } = city;
  const levels = roadLevels(graph, t, city.rail);
  const E = graph.edges.length;
  const secs = graph.edges.map((e) => sectionFor(e.cls, city.profiles[e.id], e.bridge));
  const lays = secs.map(layout);
  const half = lays.map((l) => Math.max(-l.outer[0], l.outer[1]));
  const isHw = graph.nodes.map((n) => n.edges.some((id) => graph.edges[id].cls === 'highway'));
  /** Edge centre line seen from one of its ends. */
  const rev = levels.edges.map((lv) => [...lv.pts].reverse());
  const out = (edge: number, end: 0 | 1): Vec2[] => (end === 0 ? levels.edges[edge].pts : rev[edge]);

  const builders = new Map<number, MeshBuilder>();
  const tile = (x: number, y: number): MeshBuilder => {
    const key = clamp(Math.floor(x / TILE), 0, 63) * 64 + clamp(Math.floor(y / TILE), 0, 63);
    let b = builders.get(key);
    if (!b) builders.set(key, (b = new MeshBuilder()));
    return b;
  };

  // --- Junctions. Nodes whose junctions would overlap are merged into one. ---
  const parent = graph.nodes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const swallowed = new Uint8Array(E);
  /** Edges too short for a full approach at both ends: no crosswalk or stop line there, tighter kerbs. */
  const tight = new Uint8Array(E);
  interface Cluster extends Junction { jarms: Arm[]; radius: number; floor: string }
  let clusters: Cluster[] = [];
  /** Junction arm of each edge end (index edge * 2 + end). */
  let armOf: (JunctionArm | null)[] = [];
  let clusterOf: (Cluster | null)[] = [];

  const settle = (c: Cluster): void => {
    const info = c.arms.map((a) => ({ e: graph.edges[a.edge], p: city.profiles[a.edge], sec: a.end === 0 ? secs[a.edge] : reversed(secs[a.edge]) }));
    const n = c.arms.length;
    const rank = info.map((i) => RANK[i.e.cls]);
    const top = Math.max(...rank);
    const tops = rank.filter((r) => r === top).length;
    c.signal = n >= 3 && top >= 3 && rank.filter((r) => r >= 2).length >= 3;
    const control: Control[] = [];
    const crosswalk: (string | null)[] = [];
    const approach: number[] = [];
    info.forEach(({ e, p }, i) => {
      const walk = p.walk > 0 && e.cls !== 'ramp' && rank[i] >= 1;
      if (n < 3 || rank[i] === 0) control.push('none');
      else if (c.signal) control.push('signal');
      else control.push(rank[i] < top || tops !== 2 ? 'stop' : 'none');
      const busy = p.trade > 0.3 || p.station || p.type === 'downtown' || p.type === 'midtown';
      crosswalk.push(n >= 3 && walk && (c.signal || (control[i] === 'stop' && busy)) ? 'crosswalk/zebra' : null);
      if (tight[e.id]) {
        crosswalk[i] = null;
        if (control[i] === 'stop') control[i] = 'none';
      }
      approach.push(tight[e.id] ? 0.4 : crosswalk[i] ? 7.6 : control[i] !== 'none' ? 2.6 : rank[i] === 0 ? 0.4 : 0.6);
    });
    c.arms.forEach((a, i) => {
      a.control = control[i];
      a.crosswalk = !!crosswalk[i];
      a.approach = approach[i];
    });
    c.radius = c.arms.some((a) => tight[a.edge]) ? 1.5 : top >= 3 ? 5 : top >= 2 ? 4 : top >= 1 ? 3 : 2;
    const arms = (): Arm[] =>
      c.arms.map((a, i) => ({
        angle: ((Math.atan2(-a.dir.x, -a.dir.y) * 180) / Math.PI + 360) % 360,
        section: info[i].sec,
        control: control[i],
        crosswalk: crosswalk[i],
        arrows: c.signal && info[i].p.lanes >= 2,
        length: 1,
      }));
    const aim = (i: number, r: number): boolean => {
      const a = c.arms[i];
      const pts = out(a.edge, a.end);
      const hit = chordPoint(pts, c, r);
      const p = hit ? hit.p : pts[pts.length - 1];
      if (Math.hypot(p.x - c.x, p.y - c.y) > 0.5) a.dir = norm2(p.x - c.x, p.y - c.y);
      return !!hit;
    };
    // Roads that leave side by side would need a very long junction: fan them out, the lesser road giving way.
    const spread = (): void => {
      const gapMin = Math.min(MIN_GAP, (Math.PI * 1.8) / n);
      const ang = c.arms.map((a) => Math.atan2(a.dir.y, a.dir.x));
      for (let it = 0; it < 8; it++) {
        const idx = ang.map((_, i) => i).sort((p, q) => ang[p] - ang[q]);
        let moved = false;
        for (let k = 0; k < n; k++) {
          const i = idx[k];
          const j = idx[(k + 1) % n];
          const gap = ang[j] - ang[i] + (k === n - 1 ? Math.PI * 2 : 0);
          if (i === j || gap >= gapMin) continue;
          const need = gapMin - gap + 0.01;
          const wi = rank[i] < rank[j] ? 1 : rank[i] > rank[j] ? 0 : 0.5;
          ang[i] -= need * wi;
          ang[j] += need * (1 - wi);
          moved = true;
        }
        if (!moved) break;
      }
      c.arms.forEach((a, i) => (a.dir = { x: Math.cos(ang[i]), y: Math.sin(ang[i]) }));
    };
    // Aim each arm at a point a little way out, past the member node it starts from.
    const start = c.arms.map((a) => {
      const p = out(a.edge, a.end)[0];
      return Math.hypot(p.x - c.x, p.y - c.y);
    });
    c.arms.forEach((a, i) => aim(i, start[i] + Math.min(12, 0.45 * graph.edges[a.edge].length)));
    spread();
    const first = armReach(arms(), c.radius);
    const target = first.map((l, i) => l + approach[i]);
    c.arms.forEach((a, i) => {
      if (!aim(i, Math.max(start[i] + 4, Math.min(target[i], AIM)))) a.reach = Infinity;
    });
    spread();
    const jarms = arms();
    const second = armReach(jarms, c.radius);
    c.arms.forEach((a, i) => {
      jarms[i].length = Math.max(0.4, target[i] - second[i]);
      if (a.reach !== Infinity) a.reach = second[i] + jarms[i].length!;
    });
    c.jarms = jarms;
    const lead = info[rank.indexOf(top)].p;
    c.floor = plainTex(...surface(lead));
  };

  /** End of a junction arm and the first point of the edge's line after it, far enough on to swing back onto the line. */
  const rejoin = (pts: Vec2[], c: Vec2, a: JunctionArm): { p: Vec2; i: number } | null => {
    const p = { x: c.x + a.dir.x * a.reach, y: c.y + a.dir.y * a.reach };
    const on = chordPoint(pts, c, a.reach);
    if (!on) return null;
    // On a road that curves away quickly, settle for a sharper swing rather than no road at all.
    const off = Math.hypot(on.p.x - p.x, on.p.y - p.y);
    const hit = chordPoint(pts, c, a.reach + 1.5 + 2.5 * off) ?? chordPoint(pts, c, a.reach + 1.5 + off) ?? chordPoint(pts, c, a.reach + 1.5);
    return hit ? { p, i: hit.i } : null;
  };

  /** Where an edge's own road starts and ends between its two junctions; null if they leave no room. */
  const span = (id: number): { i0: number; i1: number; p0: Vec2 | null; p1: Vec2 | null } | null => {
    const lv = levels.edges[id];
    const n = lv.pts.length;
    let i0 = 1;
    let i1 = n - 2;
    let p0: Vec2 | null = null;
    let p1: Vec2 | null = null;
    const a = armOf[id * 2];
    const b = armOf[id * 2 + 1];
    if (a) {
      const c = clusterOf[id * 2]!;
      const hit = a.reach === Infinity ? null : rejoin(lv.pts, c, a);
      if (!hit) return null;
      i0 = hit.i;
      p0 = hit.p;
    }
    if (b) {
      const c = clusterOf[id * 2 + 1]!;
      const hit = b.reach === Infinity ? null : rejoin(rev[id], c, b);
      if (!hit) return null;
      i1 = n - 1 - hit.i;
      p1 = hit.p;
    }
    if (i0 > i1) {
      // Nothing in between: the two approach ends must at least face each other.
      const q0 = p0 ?? lv.pts[0];
      const q1 = p1 ?? lv.pts[n - 1];
      const d = a ? a.dir : norm2(q1.x - q0.x, q1.y - q0.y);
      const e = b ? b.dir : { x: -d.x, y: -d.y };
      if ((q1.x - q0.x) * d.x + (q1.y - q0.y) * d.y < 1 || (q0.x - q1.x) * e.x + (q0.y - q1.y) * e.y < 1) return null;
      // ...and squarely enough that the road's edges do not cross over on the way from one to the other.
      const [lx, ly] = [q1.x - q0.x, q1.y - q0.y];
      if (a && b && Math.abs(lx * (-e.y - d.y) - ly * (-e.x - d.x)) * half[id] > (1 - ROOM) * (lx * lx + ly * ly)) return null;
    }
    return { i0, i1, p0, p1 };
  };

  for (let pass = 0; pass < 16; pass++) {
    const byRoot = new Map<number, Cluster>();
    graph.nodes.forEach((n, i) => {
      if (isHw[i]) return;
      const r = find(i);
      let c = byRoot.get(r);
      if (!c) byRoot.set(r, (c = { nodes: [], x: 0, y: 0, plane: { h: 0, gx: 0, gy: 0 }, arms: [], signal: false, jarms: [], radius: 4, floor: '' }));
      c.nodes.push(i);
      for (const id of n.edges) {
        if (swallowed[id]) continue;
        const e = graph.edges[id];
        if (e.a === i) c.arms.push({ edge: id, end: 0, dir: { x: 1, y: 0 }, reach: 0, control: 'none', crosswalk: false, approach: 0 });
        if (e.b === i) c.arms.push({ edge: id, end: 1, dir: { x: 1, y: 0 }, reach: 0, control: 'none', crosswalk: false, approach: 0 });
      }
    });
    clusters = [];
    armOf = new Array(E * 2).fill(null);
    clusterOf = new Array(E * 2).fill(null);
    for (const c of byRoot.values()) {
      // Dead ends and lone nodes get no junction.
      if (c.arms.length < 2) continue;
      for (const i of c.nodes) {
        c.x += graph.nodes[i].x / c.nodes.length;
        c.y += graph.nodes[i].y / c.nodes.length;
      }
      for (const i of c.nodes) {
        const n = graph.nodes[i];
        const p = levels.nodes[i];
        c.plane.h += (p.h + p.gx * (c.x - n.x) + p.gy * (c.y - n.y)) / c.nodes.length;
        c.plane.gx += p.gx / c.nodes.length;
        c.plane.gy += p.gy / c.nodes.length;
      }
      settle(c);
      clusters.push(c);
      for (const a of c.arms) {
        armOf[a.edge * 2 + a.end] = a;
        clusterOf[a.edge * 2 + a.end] = c;
      }
    }
    let changed = false;
    for (const e of graph.edges) {
      if (swallowed[e.id] || span(e.id)) continue;
      changed = true;
      if (!tight[e.id]) {
        tight[e.id] = 1;
        continue;
      }
      if (tight[e.id] === 1 && e.cls !== 'ramp') {
        // Still no room: squeeze the road itself down to two plain lanes.
        tight[e.id] = 2;
        const p = city.profiles[e.id];
        secs[e.id] = sectionFor(e.cls, { ...p, lanes: Math.min(p.lanes, 1), parking: 0, bike: false, bus: false, median: null, verge: 0, walk: Math.min(p.walk, 1.8) }, e.bridge);
        lays[e.id] = layout(secs[e.id]);
        half[e.id] = Math.max(-lays[e.id].outer[0], lays[e.id].outer[1]);
        continue;
      }
      swallowed[e.id] = 1;
      if (e.length <= MERGE_MAX && !isHw[e.a] && !isHw[e.b] && armOf[e.id * 2] && armOf[e.id * 2 + 1]) parent[find(e.a)] = find(e.b);
    }
    if (!changed) break;
  }

  const stats = { junctions: clusters.length, signals: clusters.filter((c) => c.signal).length, swallowed: swallowed.reduce((s, v) => s + v, 0), folds: 0, piers: 0, triangles: 0 };
  for (const c of clusters) {
    const tb = new MeshBuilder();
    junction(tb, { arms: c.jarms, radius: c.radius, floor: c.floor });
    place(tile(c.x, c.y), tb, c.x, c.y, c.plane);
  }

  // --- Freeway forks and ramp mouths: which edge leaves which, and where the barriers open. ---
  const hwAt = (n: number): number[] => graph.nodes[n].edges.filter((id) => graph.edges[id].cls === 'highway');
  /** Freeway edges at a fork that are not part of the straightest pair. */
  const branches = (n: number): number[] => {
    const hw = hwAt(n);
    if (hw.length < 3) return [];
    const dir = hw.map((id) => {
      const e = graph.edges[id];
      const pts = out(id, e.a === n ? 0 : 1);
      const p = pts[Math.min(pts.length - 1, 6)];
      return norm2(p.x - pts[0].x, p.y - pts[0].y);
    });
    let best = [0, 1];
    let low = Infinity;
    for (let i = 0; i < hw.length; i++) {
      for (let j = i + 1; j < hw.length; j++) {
        const d = dir[i].x * dir[j].x + dir[i].y * dir[j].y;
        if (d < low) {
          low = d;
          best = [i, j];
        }
      }
    }
    return hw.filter((_, i) => !best.includes(i));
  };
  /** Nearest point on a set of freeway edges: distance, deck height, edge, distance along it and side. */
  const nearest = (ids: number[], p: Vec2) => {
    let res = { d: Infinity, h: 0, edge: -1, s: 0, side: 1 as 1 | -1 };
    for (const id of ids) {
      const lv = levels.edges[id];
      for (let k = 0; k + 1 < lv.pts.length; k++) {
        const a = lv.pts[k];
        const b = lv.pts[k + 1];
        const h = pointSeg(p.x, p.y, a, b);
        if (h.d >= res.d) continue;
        const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        res = { d: h.d, h: mix(lv.h[k], lv.h[k + 1], h.t), edge: id, s: mix(lv.s[k], lv.s[k + 1], h.t), side: cr >= 0 ? 1 : -1 };
      }
    }
    return res;
  };
  /** Stretches of a freeway edge without its left / right barrier. */
  interface Gap { s0: number; s1: number; by: number }
  const open: { left: Gap[]; right: Gap[] }[] = graph.edges.map(() => ({ left: [], right: [] }));

  const crossingsOf = new Map<number, Vec2[]>();
  for (const c of graph.crossings) {
    if (!crossingsOf.has(c.highway)) crossingsOf.set(c.highway, []);
    crossingsOf.get(c.highway)!.push(c);
  }
  const railPts = city.rail.lines.flatMap((l) => resample(l.points, 5));
  const segs: Seg[] = [];
  const lines: (V3[] | null)[] = graph.edges.map(() => null);
  const crossOf: (number[] | null)[] = graph.edges.map(() => null);
  const cuts: RoadModel['cuts'] = [];
  const bays: BusBay[] = [];
  /** Head and direction of travel of each bay, to keep the stops of a street apart. */
  const bayStops: { x: number; y: number; t: Vec2 }[] = [];

  // --- Roads between the junctions. Ramps and branches first, so that the freeway knows its openings. ---
  const order = graph.edges.map((e) => e.id).sort((a, b) => Number(graph.edges[a].cls === 'highway') - Number(graph.edges[b].cls === 'highway') || a - b);
  const forks = new Map<number, number[]>();
  const isBranch = (id: number, n: number): boolean => {
    if (!forks.has(n)) forks.set(n, branches(n));
    return forks.get(n)!.includes(id);
  };
  const deferred: number[] = [];
  /** Piers and walls stand on the graded ground, so they are built once that is known. */
  const standing: (() => void)[] = [];
  let graded: Float32Array | null = null;
  const gAt = (f: Frame): number => groundAt(f.p[0], f.p[2]);
  const groundAt = (x: number, z: number): number => {
    if (!graded) return heightAt(t, x, z);
    const fx = clamp(x / t.cell, 0, t.n - 1.001);
    const fy = clamp(z / t.cell, 0, t.n - 1.001);
    const [i, j] = [Math.floor(fx), Math.floor(fy)];
    const [u, v] = [fx - i, fy - j];
    return mix(mix(graded[j * t.n + i], graded[j * t.n + i + 1], u), mix(graded[(j + 1) * t.n + i], graded[(j + 1) * t.n + i + 1], u), v);
  };
  const build = (id: number): void => {
    const e = graph.edges[id];
    const lv = levels.edges[id];
    const sec = secs[id];
    const sp = span(id);
    if (swallowed[id] || !sp) return;
    const n = lv.pts.length;
    const hp = 15.4;
    const hc = half[id];
    // Ends that leave a freeway: skip the part still inside the freeway's own lanes.
    const child = ([e.a, e.b] as const).map((node) => {
      if (!isHw[node] || (e.cls !== 'ramp' && !(e.cls === 'highway' && isBranch(id, node)))) return null;
      // A ramp runs beside the freeway for longer than the edge it leaves; a branch is measured against the carriageways it leaves.
      if (e.cls === 'ramp') return freewayRun(graph, node);
      return hwAt(node).filter((o) => o !== id && !isBranch(o, node));
    });
    let { i0, i1 } = sp;
    const near = lv.pts.map((p) => child.map((ids) => (ids && ids.length ? nearest(ids, p) : null)));
    if (child[0]) {
      i0 = 0;
      while (i0 < n - 2 && near[i0][0]!.d < hp - hc + 0.6) i0++;
    } else if (!sp.p0) i0 = 0;
    if (child[1]) {
      i1 = n - 1;
      while (i1 > i0 + 1 && near[i1][1]!.d < hp - hc + 0.6) i1--;
    } else if (!sp.p1) i1 = n - 1;

    // A ramp that is still beside the freeway where its street junction begins keeps at least a stub.
    if (child[0] && i0 > i1) i0 = Math.max(0, i1);
    if (child[1] && i1 < i0) i1 = Math.min(n - 1, i0);
    const a = armOf[id * 2];
    const b = armOf[id * 2 + 1];
    const ca = clusterOf[id * 2];
    const cb = clusterOf[id * 2 + 1];
    const q0 = sp.p0 ?? lv.pts[i0];
    const q1 = sp.p1 ?? lv.pts[i1];
    const room = Math.hypot(q1.x - q0.x, q1.y - q0.y);
    const pts: Vec2[] = [];
    const base: number[] = [];
    const tan: Vec2[] = [];
    const zone: number[] = [];
    const push = (p: Vec2, h: number, tg: Vec2, k: number): void => {
      pts.push(p);
      base.push(h);
      tan.push(tg);
      zone.push(k);
    };
    const tangentAt = (i: number): Vec2 => {
      const u = lv.pts[Math.max(0, i - 1)];
      const v = lv.pts[Math.min(n - 1, i + 1)];
      return norm2(v.x - u.x, v.y - u.y);
    };
    // A junction arm points straight out of the junction, which is rarely quite where the road's own line runs:
    // the road swings from one onto the other in a curve, the longer the further apart they are.
    let [j0, j1] = [i0, i1];
    const swing = (p: Vec2, dir: Vec2, from: number, step: 1 | -1, stop: number): number => {
      const q = lv.pts[from];
      const side = Math.abs((q.x - p.x) * -dir.y + (q.y - p.y) * dir.x);
      const run = clamp(SWING * side, 6, SWING_MAX);
      let j = from;
      while (j !== stop && Math.hypot(lv.pts[j].x - p.x, lv.pts[j].y - p.y) < run) j += step;
      return j;
    };
    type Step = [Vec2, number, Vec2, number];
    const flip = (v: Vec2): Vec2 => ({ x: -v.x, y: -v.y });
    /** How far the road's edges get from one cross-section to the next, as a share of the centre line's step: below zero they fold back over themselves. */
    const advance = (run: Step[]): number => {
      let worst = 1;
      for (let k = 0; k + 1 < run.length; k++) {
        const [p, , tp] = run[k];
        const [q, , tq] = run[k + 1];
        const [dx, dy] = [q.x - p.x, q.y - p.y];
        const l2 = dx * dx + dy * dy;
        if (l2 > 1e-6) worst = Math.min(worst, 1 - (Math.abs(dx * (tp.y - tq.y) + dy * (tq.x - tp.x)) * hc) / l2);
      }
      return worst;
    };
    /**
     * Curve from p (heading dir) to q (heading out), between the two ends, in the order the road runs.
     * Fanned, its cross-sections turn evenly from one end to the other instead of following the curve: the most room a wide road can have.
     */
    const curve = (p: Vec2, dir: Vec2, q: Vec2, out: Vec2, from: number, to: number, back: boolean, pull: number, fan: boolean): Step[] => {
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const count = Math.max(3, Math.ceil(len / 2.5));
      const m = len * pull;
      const add: Step[] = [];
      const turn = Math.atan2(dir.x * out.y - dir.y * out.x, dir.x * out.x + dir.y * out.y);
      for (let k = 1; k < count; k++) {
        const u = k / count;
        const [h00, h10, h01, h11] = [2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2];
        const [d00, d10, d01, d11] = [6 * u ** 2 - 6 * u, 3 * u ** 2 - 4 * u + 1, -6 * u ** 2 + 6 * u, 3 * u ** 2 - 2 * u];
        const pt = { x: h00 * p.x + h10 * m * dir.x + h01 * q.x + h11 * m * out.x, y: h00 * p.y + h10 * m * dir.y + h01 * q.y + h11 * m * out.y };
        const [cs, sn] = [Math.cos(turn * u), Math.sin(turn * u)];
        const tg = fan
          ? { x: dir.x * cs - dir.y * sn, y: dir.x * sn + dir.y * cs }
          : norm2(d00 * p.x + d10 * m * dir.x + d01 * q.x + d11 * m * out.x, d00 * p.y + d10 * m * dir.y + d01 * q.y + d11 * m * out.y);
        add.push([pt, mix(lv.h[from], lv.h[to], u), back ? flip(tg) : tg, Math.round(mix(from, to, u))]);
      }
      return back ? add.reverse() : add;
    };
    const SHAPES: [number, boolean][] = [[1, false], [0.6, false], [1, true], [0.6, true], [0.3, true]];
    /** The curve between two ends whose edges fold least, the plainest that will do; with the two ends themselves, in the order the road runs. */
    const fit = (p: Vec2, dir: Vec2, q: Vec2, out: Vec2, from: number, to: number, back: boolean): { run: Step[]; score: number } => {
      const ends: Step[] = [[p, lv.h[from], back ? flip(dir) : dir, from], [q, lv.h[to], back ? flip(out) : out, to]];
      if (back) ends.reverse();
      let best: { run: Step[]; score: number } | null = null;
      for (const [pull, fan] of SHAPES) {
        const run = [ends[0], ...curve(p, dir, q, out, from, to, back, pull, fan), ends[1]];
        const score = advance(run);
        if (!best || score > best.score + 0.02) best = { run, score };
        if (score >= ROOM) break;
      }
      return best!;
    };
    /** From a junction arm onto the road's own line: as far along it as the curve needs, up to stop. */
    const onto = (p: Vec2, dir: Vec2, from: number, step: 1 | -1, stop: number): { j: number; run: Step[] } => {
      const back = step < 0;
      let best: { j: number; run: Step[]; score: number } | null = null;
      for (let j = swing(p, dir, from, step, stop); ; j += step) {
        const tq = tangentAt(j);
        const got = fit(p, dir, lv.pts[j], back ? flip(tq) : tq, from, j, back);
        if (!best || got.score > best.score + 0.02) best = { j, ...got };
        if (got.score >= ROOM || j === stop) break;
      }
      return best!;
    };
    let lead: Step[] = [];
    let tail: Step[] = [];
    if (i0 <= i1) {
      const mid = (i0 + i1) >> 1;
      if (sp.p0) ({ j: j0, run: lead } = onto(sp.p0, a!.dir, i0, 1, mid));
      if (sp.p1) ({ j: j1, run: tail } = onto(sp.p1, b!.dir, i1, -1, Math.max(mid, j0)));
      // Each run ends on the point of the road's own line that it joins.
      if (sp.p0) lead.pop();
      if (sp.p1) tail.shift();
    } else if (sp.p0 && sp.p1) {
      // Two junctions with nothing in between: one curve from arm to arm.
      lead = fit(sp.p0, a!.dir, sp.p1, flip(b!.dir), Math.min(i0, n - 1), Math.max(i1, 0), false).run;
    } else if (sp.p0) lead = [[sp.p0, lv.h[Math.min(i0, n - 1)], a!.dir, Math.min(i0, n - 1)]];
    else if (sp.p1) tail = [[sp.p1, lv.h[Math.max(i1, 0)], flip(b!.dir), Math.max(i1, 0)]];
    for (const st of lead) push(...st);
    for (let i = j0; i <= j1; i++) push(lv.pts[i], lv.h[i], tangentAt(i), i);
    for (const st of tail) push(...st);
    if (pts.length < 2) return;
    if (advance(pts.map((p, k): Step => [p, 0, tan[k], 0])) < 0) stats.folds++;

    // A freeway that reaches the edge of the map carries on a little way and is cut off there.
    if (e.cls === 'highway') {
      ([[e.a, 0], [e.b, 1]] as const).forEach(([node, end]) => {
        const nd = graph.nodes[node];
        if (nd.degree !== 1 || Math.min(nd.x, nd.y, t.size - nd.x, t.size - nd.y) > 3) return;
        let tg = end === 0 ? { x: -tan[0].x, y: -tan[0].y } : tan[tan.length - 1];
        // A route that meets the edge of the map at a shallow angle still has to leave it.
        const outward = [{ x: -1, y: 0, d: nd.x }, { x: 1, y: 0, d: t.size - nd.x }, { x: 0, y: -1, d: nd.y }, { x: 0, y: 1, d: t.size - nd.y }].sort((p, q) => p.d - q.d)[0];
        if (tg.x * outward.x + tg.y * outward.y < 0.75) tg = norm2(tg.x + outward.x * 1.5, tg.y + outward.y * 1.5);
        const from = end === 0 ? pts[0] : pts[pts.length - 1];
        const h = end === 0 ? base[0] : base[base.length - 1];
        const p = { x: from.x + tg.x * EDGE_STUB, y: from.y + tg.y * EDGE_STUB };
        if (end === 0) {
          pts.unshift(p);
          base.unshift(h);
          tan.unshift(tan[0]);
          zone.unshift(-1);
        } else push(p, h, tg, -1);
        cuts.push({ x: p.x, y: p.y, h, edge: id });
      });
    }

    // The further a junction's plane is from the street's own level where they meet, the longer the easing between them.
    const ease = ([[a, ca, 0], [b, cb, base.length - 1]] as const).map(([arm, cl, k]) => {
      if (!arm || !cl) return 0;
      const ph = cl.plane.h + cl.plane.gx * (pts[k].x - cl.x) + cl.plane.gy * (pts[k].y - cl.y);
      return clamp(Math.max(20, Math.abs(ph - base[k]) / 0.05), 0.01, room * 0.5);
    });
    // Distance along the road from its start, for easing out of the junction at either end.
    const arc = [0];
    for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const end = arc[arc.length - 1];
    const hs: number[] = [];
    const cross: number[] = [];
    pts.forEach((p, k) => {
      let h = base[k];
      let c = 0;
      const rx = -tan[k].y;
      const ry = tan[k].x;
      // Still within the freeway's deck: just under it, so that the freeway's own lanes carry on and this road widens out from its edge.
      if (zone[k] >= 0) {
        near[zone[k]].forEach((nr) => {
          if (!nr) return;
          // A ramp's own level already follows the deck; a branching freeway is eased onto it.
          if (e.cls === 'ramp') h -= UNDER * (1 - smoothstep(hp + hc, hp + hc + 6, nr.d));
          else h = mix(nr.h - UNDER, h, smoothstep(hp + hc, hp + hc + 26, nr.d));
        });
      }
      for (const [arm, cl, along] of [[a, ca, arc[k] / ease[0]], [b, cb, (end - arc[k]) / ease[1]]] as const) {
        if (!arm || !cl) continue;
        const w = smoothstep(0, 1, along);
        const ph = cl.plane.h + cl.plane.gx * (p.x - cl.x) + cl.plane.gy * (p.y - cl.y);
        h = mix(ph, h, w);
        c = mix(cl.plane.gx * rx + cl.plane.gy * ry, c, w);
      }
      hs.push(h);
      cross.push(c);
    });

    // A bend seen from above shows its corners sooner than a change of grade does: the plan is kept two and a half times as closely as the heights.
    const plan = e.cls === 'highway' ? 1 : 2.5;
    const keep = thin(pts.map((p, k) => [p.x * plan, hs[k], p.y * plan, cross[k] * 8]), e.cls === 'highway' ? 0.06 : 0.1);
    const line: V3[] = keep.map((k) => [pts[k].x, hs[k], pts[k].y]);
    // The two carriageways that run through a freeway node meet on one line across it.
    const through = (node: number, end: 0 | 1): Vec2 | undefined => {
      if (e.cls !== 'highway' || isBranch(id, node)) return undefined;
      const pair = hwAt(node).filter((o) => !isBranch(o, node));
      if (pair.length !== 2 || zone[end === 0 ? 0 : zone.length - 1] !== (end === 0 ? 0 : n - 1)) return undefined;
      const [u, v] = pair.map((o) => {
        const q = out(o, graph.edges[o].a === node ? 0 : 1);
        return norm2(q[Math.min(2, q.length - 1)].x - q[0].x, q[Math.min(2, q.length - 1)].y - q[0].y);
      });
      const sgn = (pair[0] === id ? 1 : -1) * (end === 0 ? 1 : -1);
      return norm2((u.x - v.x) * sgn, (u.y - v.y) * sgn);
    };
    const path = frames(line, keep.map((k) => cross[k]), sp.p0 ? a!.dir : through(e.a, 0), sp.p1 ? { x: -b!.dir.x, y: -b!.dir.y } : through(e.b, 1));
    lines[id] = line;
    crossOf[id] = keep.map((k) => cross[k]);
    const L = pathLength(path);
    const b3 = tile(pts[pts.length >> 1].x, pts[pts.length >> 1].y);
    const crossings = crossingsOf.get(id) ?? [];
    const nearCrossing = (f: Frame, r: number): boolean => crossings.some((c) => Math.hypot(c.x - f.p[0], c.y - f.p[2]) < r);

    if (e.cls !== 'highway' && e.cls !== 'ramp') {
      // Bus bays on the main roads of the districts whose buildings stand back: just past the junction, in each direction.
      const cut: Bay[] = [];
      const prof = city.profiles[id];
      if (e.cls === 'arterial' && !e.bridge && BAY_TYPES.has(prof.type)) {
        // Distance on the map of each point of the line, beside the distance along the path.
        const flat = [0];
        for (let k = 1; k < line.length; k++) flat.push(flat[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][2] - line[k - 1][2]));
        const len = flat[flat.length - 1];
        const onPath = (d: number): number => {
          let k = 1;
          while (k < flat.length - 1 && flat[k] < d) k++;
          return mix(path[k - 1].s, path[k].s, clamp((d - flat[k - 1]) / (flat[k] - flat[k - 1] || 1), 0, 1));
        };
        const total = BAY.enter + BAY.stand + BAY.leave;
        for (const dir of [1, -1] as const) {
          if (dir < 0 && prof.oneWay) continue;
          const side = dir > 0 ? sec.right : sec.left;
          const lane = dir > 0 ? sec.lanes[sec.lanes.length - 1] : sec.lanes[0];
          // Where there is a parking or bus lane the bus stops in that; a bay takes its room from the pavement and the verge.
          if (lane.kind !== 'drive' || !side.curb || !side.walk || side.ground || (side.edge && side.edge !== 'none')) continue;
          const room = (side.verge?.w ?? 0) + side.walk.w;
          if (room < 2 || len < 6 + total + 26 || hash(city.config.seed, id, dir, 50) > len / 120) continue;
          for (let a = 6; a <= 30 && a + total + 26 <= len; a += 6) {
            const [from, to] = dir > 0 ? [a, a + total] : [len - a - total, len - a];
            const head = dir > 0 ? to - BAY.leave - BAY.front : from + BAY.leave + BAY.front;
            const fs = [0, 0.25, 0.5, 0.75, 1].map((q) => frameAt(path, onPath(mix(from, to, q))));
            // Straight and fairly level, clear of the freeway's piers and of the railway.
            if (fs.some((f) => f.t[0] * fs[0].t[0] + f.t[2] * fs[0].t[2] < 0.985 * Math.hypot(f.t[0], f.t[2]) * Math.hypot(fs[0].t[0], fs[0].t[2]) || Math.abs(f.t[1]) > 0.06)) continue;
            if (fs.some((f) => graph.crossings.some((c) => Math.hypot(c.x - f.p[0], c.y - f.p[2]) < 40) || railPts.some((r) => Math.hypot(r.x - f.p[0], r.y - f.p[2]) < 25))) continue;
            const hf = frameAt(path, onPath(head));
            const t = norm2(hf.t[0] * dir, hf.t[2] * dir);
            const spot = { x: hf.p[0], y: hf.p[2], t };
            // Stops for the same direction along the same street are a few minutes' walk apart.
            if (bayStops.some((o) => {
              const [dx, dy] = [spot.x - o.x, spot.y - o.y];
              const l = Math.hypot(dx, dy);
              return l < 30 || (l < 280 && o.t.x * t.x + o.t.y * t.y > 0.3 && Math.abs(dx * o.t.y - dy * o.t.x) < 60);
            })) break;
            // The pavement keeps the depth that the stop's shelter, bench or sign needs: it widens away from the road.
            const need = room >= 3.75 ? 3.8 : room >= 2.55 ? 2.6 : 2.05;
            const bulge = clamp(need - (room - BAY.depth), 0, 3);
            const taper: [number, number] = dir > 0 ? [BAY.enter, BAY.leave] : [BAY.leave, BAY.enter];
            bays.push({ edge: id, side: dir, from, to, head, depth: BAY.depth, bulge, taper });
            bayStops.push(spot);
            const [s0, s1] = [onPath(from), onPath(to)];
            const stretch = (s1 - s0) / (to - from);
            cut.push({ side: dir, from: s0, to: s1, depth: BAY.depth, bulge, taper: [taper[0] * stretch, taper[1] * stretch], curb: prof.age === 'fresh' ? 'curb/red' : 'curb/red-worn' });
            break;
          }
        }
      }
      sweepSection(b3, path, sec, { body: e.bridge ? 'deck' : 'sides', deckDepth: 1.2, caps: false, bays: cut });
      if (e.bridge) {
        const count = Math.floor(L / 26);
        for (let k = 1; k <= count; k++) {
          const f = frameAt(path, (L * k) / (count + 1));
          standing.push(() => {
            if (f.p[1] - gAt(f) < 2.5) return;
            pier(b3, f, half[id] * 2, 1.2, gAt(f) - 0.6);
            stats.piers++;
          });
        }
      } else {
        for (let k = 0; k + 1 < keep.length; k++) {
          const [u, v] = [keep[k], keep[k + 1]];
          segs.push({ ax: pts[u].x, ay: pts[u].y, ah: hs[u], ac: cross[u], bx: pts[v].x, by: pts[v].y, bh: hs[v], bc: cross[v], half: half[id] });
        }
      }
      return;
    }

    // Freeway or ramp: pieces between the places where a barrier opens or the median starts.
    const cutsAt = new Set<number>([0, L]);
    const sOf = (k: number): number => path[Math.max(0, keep.findIndex((i) => i >= k))]?.s ?? L;
    /** Per end: path distance where the median barrier may start and where the road is clear of the freeway. */
    const clear = child.map((ids, end) => {
      if (!ids) return null;
      let m = -1;
      let c = -1;
      const idx = pts.map((_, k) => k);
      if (end === 1) idx.reverse();
      for (const k of idx) {
        const nr = zone[k] >= 0 ? near[zone[k]][end] : null;
        if (!nr) continue;
        if (m < 0 && nr.d >= hp + 0.6) m = k;
        if (nr.d >= hp + hc) {
          c = k;
          break;
        }
        const o = open[nr.edge][nr.side === 1 ? 'right' : 'left'];
        if (!o.length || o[o.length - 1].by !== id * 2 + end) o.push({ s0: nr.s, s1: nr.s, by: id * 2 + end });
        const last = o[o.length - 1];
        last.s0 = Math.min(last.s0, nr.s - 2);
        last.s1 = Math.max(last.s1, nr.s + 2);
      }
      const side = (() => {
        const k = end === 0 ? 0 : pts.length - 1;
        const nr = zone[k] >= 0 ? near[zone[k]][end] : null;
        if (!nr) return 0;
        // Is the freeway to the right of this road's direction of travel?
        const o = levels.edges[nr.edge];
        const q = o.pts[clamp(Math.round((nr.s / (o.s[o.s.length - 1] || 1)) * (o.pts.length - 1)), 0, o.pts.length - 1)];
        return (q.x - pts[k].x) * -tan[k].y + (q.y - pts[k].y) * tan[k].x > 0 ? 1 : -1;
      })();
      const sm = m < 0 ? (end === 0 ? L : 0) : sOf(m);
      const sc = c < 0 ? (end === 0 ? L : 0) : sOf(c);
      cutsAt.add(sm).add(sc);
      return { sm, sc, side };
    });
    // Openings are measured along the edge's centre line; the path may start later or earlier than it.
    const first = zone.findIndex((z) => z >= 0);
    const shift = path[Math.max(0, keep.findIndex((i) => i >= first))].s - lv.s[zone[first]];
    const gaps = { left: open[id].left.map((g) => [g.s0 + shift, g.s1 + shift]), right: open[id].right.map((g) => [g.s0 + shift, g.s1 + shift]) };
    for (const o of [gaps.left, gaps.right]) for (const [s0, s1] of o) cutsAt.add(clamp(s0, 0, L)).add(clamp(s1, 0, L));
    // While this road is still coming out from under the freeway, its markings start lane by lane as they clear the freeway's edge.
    const distAt = (s: number, end: number): number => {
      let best = Infinity;
      let at = Infinity;
      keep.forEach((k, j) => {
        const nr = zone[k] >= 0 ? near[zone[k]][end] : null;
        if (nr && Math.abs(path[j].s - s) < at) [at, best] = [Math.abs(path[j].s - s), nr.d];
      });
      return best;
    };
    clear.forEach((c, end) => {
      if (!c) return;
      for (let s = end === 0 ? 0 : c.sc; s < (end === 0 ? c.sc : L); s += 8) cutsAt.add(s);
    });
    const marks = [...cutsAt].sort((x, y) => x - y).filter((s, i, arr) => i === 0 || s - arr[i - 1] > 0.5);
    if (marks[marks.length - 1] < L - 0.5) marks.push(L);
    else marks[marks.length - 1] = L;
    const deck = e.cls === 'highway' ? HIGHWAY_DECK : RAMP_DECK;
    for (let k = 0; k + 1 < marks.length; k++) {
      const mid = (marks[k] + marks[k + 1]) / 2;
      let noL = gaps.left.some(([s0, s1]) => mid > s0 && mid < s1);
      let noR = gaps.right.some(([s0, s1]) => mid > s0 && mid < s1);
      let noM = false;
      clear.forEach((c, end) => {
        if (!c) return;
        const inside = end === 0 ? mid < c.sc : mid > c.sc;
        if (inside && c.side === 1) noR = true;
        if (inside && c.side === -1) noL = true;
        if (end === 0 ? mid < c.sm : mid > c.sm) noM = true;
      });
      const startCap = k === 0 && zone[0] === -1;
      const endCap = k + 2 === marks.length && zone[zone.length - 1] === -1;
      let marksWhere: ((x0: number, x1: number) => boolean) | undefined;
      clear.forEach((c, end) => {
        if (!c || !c.side || !(end === 0 ? mid < c.sc : mid > c.sc)) return;
        const d = Math.min(distAt(marks[k], end), distAt(marks[k + 1], end));
        marksWhere = (x0, x1) => d - Math.max(x0 * c.side, x1 * c.side) > hp + 0.1;
      });
      sweepSection(b3, slicePath(path, marks[k], marks[k + 1]), variant(sec, noL, noR, noM), { body: 'deck', deckDepth: deck, caps: [startCap, endCap], marksWhere });
    }

    if (e.cls === 'highway') {
      for (let s = 15; s < L - 5; s += 30) {
        const f = frameAt(path, s);
        if (nearCrossing(f, 17) || railPts.some((p) => Math.hypot(p.x - f.p[0], p.y - f.p[2]) < 20)) continue;
        if (Math.min(f.p[0], f.p[2], t.size - f.p[0], t.size - f.p[2]) < 0) continue;
        standing.push(() => {
          const g = gAt(f);
          if (f.p[1] - g < 3) return;
          pier(b3, f, half[id] * 2, deck, g - 0.6);
          stats.piers++;
        });
      }
      return;
    }
    // Ramp: retaining walls under the deck where it is off the ground, earth where it has come down.
    const step = slicePath(path, 0, L);
    const fine: Frame[] = [];
    for (let s = 0; s < L; s += 4) fine.push(frameAt(step, s));
    fine.push(step[step.length - 1]);
    for (let k = 0; k + 1 < fine.length; k++) {
      const [f0, f1] = [fine[k], fine[k + 1]];
      const [g0, g1] = [gAt(f0), gAt(f1)];
      const inFreeway = clear.some((c, end) => c && (end === 0 ? f1.s < c.sc : f0.s > c.sc));
      if (f0.p[1] - g0 < 0.7 && f1.p[1] - g1 < 0.7 && !inFreeway) {
        segs.push({ ax: f0.p[0], ay: f0.p[2], ah: f0.p[1], ac: 0, bx: f1.p[0], by: f1.p[2], bh: f1.p[1], bc: 0, half: hc });
      }
      if (f0.p[1] - g0 < 0.6 || f1.p[1] - g1 < 0.6 || inFreeway || nearCrossing(f0, 15) || nearCrossing(f1, 15)) continue;
      // The deck spans the railway; no wall stands across the tracks.
      if (railPts.some((p) => Math.hypot(p.x - f0.p[0], p.y - f0.p[2]) < 10 || Math.hypot(p.x - f1.p[0], p.y - f1.p[2]) < 10)) continue;
      standing.push(() => {
        for (const sd of [1, -1] as const) {
          const x = sd * (hc - 0.15);
          const p0 = offset(f0, x, -0.3);
          const p1 = offset(f1, x, -0.3);
          const d0 = Math.max(0.1, p0[1] - groundAt(p0[0], p0[2]) + 1);
          const d1 = Math.max(0.1, p1[1] - groundAt(p1[0], p1[2]) + 1);
          b3.quadFacing('structure/wall-smooth', p0, p1, [p1[0], p1[1] - d1, p1[2]], [p0[0], p0[1] - d0, p0[2]], [f0.r[0] * sd, 0, f0.r[2] * sd], [[f0.s, 0], [f1.s, 0], [f1.s, d1], [f0.s, d0]]);
        }
      });
    }
  };
  for (const id of order) {
    const e = graph.edges[id];
    // The main carriageways wait until every ramp and branch has marked its opening.
    if (e.cls === 'highway' && !isBranch(id, e.a) && !isBranch(id, e.b)) deferred.push(id);
    else build(id);
  }
  for (const id of deferred) build(id);

  // Each junction arm, from the centre to where the edge's own road starts, lies in the junction's plane.
  for (const c of clusters) {
    for (const a of c.arms) {
      if (a.reach === Infinity) continue;
      const cross = c.plane.gx * -a.dir.y + c.plane.gy * a.dir.x;
      const bx = c.x + a.dir.x * a.reach;
      const by = c.y + a.dir.y * a.reach;
      segs.push({ ax: c.x, ay: c.y, ah: c.plane.h, ac: cross, bx, by, bh: c.plane.h + c.plane.gx * (bx - c.x) + c.plane.gy * (by - c.y), bc: cross, half: half[a.edge] });
    }
  }
  // The railway comes to the roads' level at its level crossings, and the ground is graded to its formation too.
  const rail = railProfile(city, lines, secs, clusters.map((c) => ({ x: c.x, y: c.y, plane: c.plane, reach: Math.max(6, ...c.arms.map((a) => (Number.isFinite(a.reach) ? a.reach : 0))),
      arms: c.arms.filter((a) => Number.isFinite(a.reach)).map((a) => {
        const lay = layout(secs[a.edge]);
        return { dir: a.dir, reach: a.reach, half: Math.max(-lay.outer[0], lay.outer[1]) };
      }) })));
  for (const tr of rail.lines) {
    const zones = city.stations.filter((st) => st.line === tr.line).map((st) => tr.s[st.index]);
    for (let i = 0; i + 1 < tr.pts.length; i++) {
      if (tr.structure[i] !== 'ground' || tr.structure[i + 1] !== 'ground') continue;
      const a = tr.pts[i];
      const b = tr.pts[i + 1];
      const station = zones.some((z) => Math.abs(z - tr.s[i]) < STATION_HALF);
      segs.push({ ax: a.x, ay: a.y, ah: tr.level[i] - RAIL_TOP, ac: 0, bx: b.x, by: b.y, bh: tr.level[i + 1] - RAIL_TOP, bc: 0, half: station ? 22 : tr.tracks > 1 ? 5.5 : 3.5, rail: true });
    }
  }
  const ground = (graded = gradeTerrain(city, segs));
  for (const fn of standing) fn();
  const tiles = [...builders.values()].map((b) => b.build());
  stats.triangles = tiles.reduce((s, m) => s + m.triangles, 0);
  return { tiles, ground, levels, junctions: clusters.map(({ nodes, x, y, plane, arms, signal }) => ({ nodes, x, y, plane, arms, signal })), lines, rail, cross: crossOf, sections: secs, bays, cuts, stats };
}

/** Terrain with the ground under and beside every at-grade road brought to the road's level. */
function gradeTerrain(city: City, segs: Seg[]): Float32Array {
  const t = city.terrain;
  const { n, cell } = t;
  const out = Float32Array.from(t.height);
  const best = new Float32Array(n * n).fill(1e9);
  const level = new Float32Array(n * n);
  const byRail = new Uint8Array(n * n);
  const FULL = cell * 1.45;
  const FADE = FULL + 12;
  const each = (x0: number, y0: number, x1: number, y1: number, fn: (k: number, x: number, y: number) => void): void => {
    const i0 = Math.max(0, Math.ceil(x0 / cell));
    const i1 = Math.min(n - 1, Math.floor(x1 / cell));
    const j0 = Math.max(0, Math.ceil(y0 / cell));
    const j1 = Math.min(n - 1, Math.floor(y1 / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * n + i, i * cell, j * cell);
  };
  for (const s of segs) {
    const R = s.half + FADE;
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const l2 = dx * dx + dy * dy || 1;
    const l = Math.sqrt(l2);
    each(Math.min(s.ax, s.bx) - R, Math.min(s.ay, s.by) - R, Math.max(s.ax, s.bx) + R, Math.max(s.ay, s.by) + R, (k, x, y) => {
      const q = clamp(((x - s.ax) * dx + (y - s.ay) * dy) / l2, 0, 1);
      const px = s.ax + dx * q;
      const py = s.ay + dy * q;
      // Negative inside the road, so that where roads overlap the one whose middle is nearer wins.
      const d = Math.hypot(x - px, y - py) - s.half;
      if (d > FADE) return;
      // A road keeps the ground under and right beside it, however wide the railway's formation is there
      // (a street along a station).
      const mine = !s.rail && d <= FULL;
      const theirs = !byRail[k] && best[k] <= FULL;
      // Otherwise the nearer of the two shapes it.
      if (mine !== theirs ? theirs : d >= best[k]) return;
      byRail[k] = s.rail ? 1 : 0;
      // Signed distance to the right of the road, for its cross slope.
      const lat = clamp(((x - s.ax) * -dy + (y - s.ay) * dx) / l, -s.half - 3, s.half + 3);
      best[k] = d;
      level[k] = mix(s.ah, s.bh, q) + mix(s.ac, s.bc, q) * lat;
    });
  }
  for (let k = 0; k < n * n; k++) {
    if (best[k] > FADE || (out[k] < 0 && best[k] > 3)) continue;
    // Just under the road at its edges, and further under towards its middle, where a coarse grid would otherwise
    // show through a road that bends or changes grade within a cell or two.
    out[k] = mix(out[k], level[k] - 0.1 - 0.2 * smoothstep(0, 3, -best[k]), 1 - smoothstep(FULL, FADE, Math.max(0, best[k])));
  }
  return out;
}
