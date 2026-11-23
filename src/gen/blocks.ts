import { Heap } from '../core/heap';
import { Rng } from '../core/rng';
import { SegmentIndex, pointAt, pointSeg, polyLength, segSeg, simplify } from '../core/geom';
import { Vec2, angleDiff, clamp, dist, norm } from '../core/vec2';
import { DistrictType, Districts, districtAt } from './districts';
import { Rail } from './rail';
import { RoadEdge, RoadGraph } from './roadGraph';
import { RoadClass, isStreet } from './streamlines';
import { Terrain, gradient, heightAt, inBounds, onRiverStrip, waterDistAt } from './terrain';

/**
 * Roads added inside blocks that are too deep for their lots: service alleys, extra residential streets,
 * cul-de-sacs, and footpaths to the beach. They only split the streets they meet; the main network stays as it is.
 */
export interface InfillStats {
  alleys: number;
  streets: number;
  culDeSacs: number;
  paths: number;
}

const G = 6;
const STEP = 6;
const MAX_RUN = 320;
/** New junctions keep this far from existing ones, or snap onto them. */
const MIN_EDGE = 22;
const MIN_SIN = 0.6;
/** New roads keep this far from the middle of a roundabout. */
const ROUNDABOUT_CLEAR = 78;
const ROOM = (35 * Math.PI) / 180;

/** Depth of land behind the street (metres from the nearest street or obstacle) beyond which a block gets a road. */
export const INFILL_DEPTH: Record<DistrictType, number> = {
  downtown: 34,
  midtown: 42,
  oldtown: 34,
  residential: 44,
  suburb: 52,
  hills: Infinity,
  beach: 38,
  industrial: 95,
};

interface Plan {
  cls: RoadClass;
  /** `through`: runs along the middle of the block from street to street. `spur`: dead end from the nearest street. */
  form: 'through' | 'spur';
  /** Follow the sea-ward direction instead of the block. */
  seaward?: boolean;
  wobble?: number;
  bend?: number;
}

function planFor(type: DistrictType, depth: number, rng: Rng): Plan | null {
  switch (type) {
    case 'downtown':
    case 'midtown':
      return { cls: 'alley', form: 'through' };
    case 'oldtown':
      // Crooked lanes, some of which end in a yard.
      return { cls: 'alley', form: rng.chance(0.3) ? 'spur' : 'through', wobble: rng.range(2, 5) * rng.sign() };
    case 'residential':
      return depth > 58 ? { cls: 'local', form: 'through' } : { cls: 'alley', form: 'through' };
    case 'suburb':
      return depth > 85 ? { cls: 'local', form: 'through' } : { cls: 'local', form: 'spur', bend: rng.range(-0.14, 0.14) };
    case 'beach':
      return { cls: 'path', form: 'through', seaward: true };
    case 'industrial':
      return { cls: 'alley', form: 'spur' };
    default:
      return null;
  }
}

/** Exact Euclidean distance transform (Felzenszwalb & Huttenlocher); `f` holds 0 at seeds and a large value elsewhere. */
function distanceTransform(f: Float64Array, n: number): void {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const line = new Float64Array(n);
  const pass = (offset: number, stride: number) => {
    for (let i = 0; i < n; i++) line[i] = f[offset + i * stride];
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + line[v[k]];
    }
    for (let i = 0; i < n; i++) f[offset + i * stride] = d[i];
  };
  for (let x = 0; x < n; x++) pass(x, n);
  for (let y = 0; y < n; y++) pass(y * n, 1);
}

interface Trace {
  pts: Vec2[];
  end: 'hit' | 'wall' | 'none';
  /** Road hit: id under which it is indexed, and the segment. */
  root: number;
  a: Vec2;
  b: Vec2;
}

interface End {
  /** Existing node to join, or -1 to split `edge` at the end point. */
  node: number;
  edge: number;
}

export function addInfillRoads(graph: RoadGraph, t: Terrain, districts: Districts, rail: Rail, rng: Rng): InfillStats {
  const stats: InfillStats = { alleys: 0, streets: 0, culDeSacs: 0, paths: 0 };
  const { nodes, edges } = graph;
  const n = Math.ceil(t.size / G);
  const wall = new Uint8Array(n * n);
  const f = new Float64Array(n * n).fill(1e12);
  const cellOf = (x: number, y: number) => clamp(Math.floor(y / G), 0, n - 1) * n + clamp(Math.floor(x / G), 0, n - 1);
  const stamp = (x: number, y: number, r: number, isWall: boolean) => {
    const k = Math.ceil(r / G);
    const ci = Math.floor(x / G);
    const cj = Math.floor(y / G);
    for (let j = cj - k; j <= cj + k; j++) {
      for (let i = ci - k; i <= ci + k; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        if (Math.hypot((i + 0.5) * G - x, (j + 0.5) * G - y) > r + G * 0.5) continue;
        f[j * n + i] = 0;
        if (isWall) wall[j * n + i] = 1;
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

  // Obstacles: water, the map edge, cliffs, parks, the freeway and the railway.
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * G;
      const y = (j + 0.5) * G;
      let blocked = !inBounds(t, x, y, 12) || waterDistAt(t, x, y) < 8 || onRiverStrip(t, x, y);
      if (!blocked) {
        const g = gradient(t, t.height, x, y, 8);
        blocked = Math.hypot(g.x, g.y) > 0.3;
      }
      if (blocked) {
        wall[j * n + i] = 1;
        f[j * n + i] = 0;
      }
    }
  }
  for (const p of districts.parks) stamp(p.center.x, p.center.y, p.radius + 6, true);
  for (const line of rail.lines) {
    line.points.forEach((p, i) => {
      if (line.structure[i] !== 'tunnel') stamp(p.x, p.y, 18, true);
    });
  }
  const index = new SegmentIndex(60);
  /** Pieces that an indexed road has been split into. */
  const pieces = new Map<number, number[]>();
  for (const e of edges) {
    if (isStreet(e.cls)) {
      along(e.points, 3, (x, y) => stamp(x, y, 0, false));
      index.addLine(e.id, e.points);
      pieces.set(e.id, [e.id]);
    } else {
      const r = e.cls === 'highway' ? 22 : 14;
      along(e.points, 5, (x, y) => stamp(x, y, r, true));
    }
  }
  distanceTransform(f, n);
  const depth = new Float32Array(n * n);
  for (let i = 0; i < depth.length; i++) depth[i] = Math.sqrt(f[i]) * G;

  const depthAt = (x: number, y: number): number => {
    const fx = clamp(x / G - 0.5, 0, n - 1.001);
    const fy = clamp(y / G - 0.5, 0, n - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = j * n + i;
    return (depth[k] * (1 - u) + depth[k + 1] * u) * (1 - v) + (depth[k + n] * (1 - u) + depth[k + n + 1] * u) * v;
  };
  // 0: not looked up yet; Infinity: never gets a road.
  const limit = new Float32Array(n * n);
  const limitOf = (c: number): number => {
    if (limit[c] === 0) limit[c] = INFILL_DEPTH[districtAt(t, districts, ((c % n) + 0.5) * G, (Math.floor(c / n) + 0.5) * G).type];
    return limit[c];
  };
  const minLimit = Math.min(...Object.values(INFILL_DEPTH));

  const heap = new Heap();
  const scan = (i0: number, j0: number, i1: number, j1: number) => {
    for (let j = Math.max(1, j0); j <= Math.min(n - 2, j1); j++) {
      for (let i = Math.max(1, i0); i <= Math.min(n - 2, i1); i++) {
        const c = j * n + i;
        const d = depth[c];
        if (d <= minLimit || d <= limitOf(c)) continue;
        let peak = true;
        for (let k = 0; k < 8 && peak; k++) {
          const o = c + [-n - 1, -n, -n + 1, -1, 1, n - 1, n, n + 1][k];
          if (depth[o] > d && limitOf(o) !== Infinity) peak = false;
        }
        if (peak) heap.push(-d / limit[c], c);
      }
    }
  };
  const suppress = (p: Vec2, r: number) => {
    const k = Math.ceil(r / G);
    const ci = Math.floor(p.x / G);
    const cj = Math.floor(p.y / G);
    for (let j = Math.max(0, cj - k); j <= Math.min(n - 1, cj + k); j++) {
      for (let i = Math.max(0, ci - k); i <= Math.min(n - 1, ci + k); i++) {
        if (Math.hypot(i - ci, j - cj) * G <= r) limit[j * n + i] = Infinity;
      }
    }
    scan(ci - k - 1, cj - k - 1, ci + k + 1, cj + k + 1);
  };

  /** Walks from p until it meets a road or an obstacle; `ridge` > 0 keeps it in the middle of the block. */
  const trace = (p: Vec2, dir: Vec2, ridge: number): Trace => {
    const pts: Vec2[] = [p];
    let q = p;
    let d = dir;
    let h = heightAt(t, p.x, p.y);
    for (let s = STEP; s <= MAX_RUN; s += STEP) {
      if (ridge > 0 && depthAt(q.x, q.y) > 0.55 * ridge) {
        const lx = -d.y;
        const ly = d.x;
        const fwd = { x: q.x + d.x * STEP, y: q.y + d.y * STEP };
        const turn = clamp(((depthAt(fwd.x + lx * 5, fwd.y + ly * 5) - depthAt(fwd.x - lx * 5, fwd.y - ly * 5)) / 10) * 0.25, -0.04, 0.04);
        d = { x: d.x * Math.cos(turn) - d.y * Math.sin(turn), y: d.x * Math.sin(turn) + d.y * Math.cos(turn) };
      }
      const nq = { x: q.x + d.x * STEP, y: q.y + d.y * STEP };
      let bestT = 2;
      let hit: Trace | null = null;
      index.query(Math.min(q.x, nq.x), Math.min(q.y, nq.y), Math.max(q.x, nq.x), Math.max(q.y, nq.y), (r) => {
        const x = segSeg(q, nq, r.a, r.b);
        if (!x || x.t >= bestT) return;
        bestT = x.t;
        hit = { pts: [...pts, { x: x.x, y: x.y }], end: 'hit', root: r.line, a: r.a, b: r.b };
      });
      if (hit) return hit;
      const nh = heightAt(t, nq.x, nq.y);
      if (wall[cellOf(nq.x, nq.y)] || Math.abs(nh - h) / STEP > 0.2) return { pts, end: 'wall', root: -1, a: p, b: p };
      h = nh;
      pts.push(nq);
      q = nq;
    }
    return { pts, end: 'none', root: -1, a: p, b: p };
  };

  const leave = (e: RoadEdge, node: number): number => {
    const pts = e.a === node ? e.points : e.points.slice().reverse();
    let i = 1;
    while (i < pts.length - 1 && dist(pts[i], pts[0]) < 12) i++;
    return Math.atan2(pts[i].y - pts[0].y, pts[i].x - pts[0].x);
  };
  /** Piece of an indexed road, and the segment of it, that passes through p. */
  const locate = (root: number, p: Vec2): { edge: RoadEdge; seg: number; s: number } => {
    let best = { edge: edges[root], seg: 0, s: 0 };
    let bestD = Infinity;
    for (const id of pieces.get(root)!) {
      const e = edges[id];
      let run = 0;
      for (let i = 1; i < e.points.length; i++) {
        const l = dist(e.points[i - 1], e.points[i]);
        const ps = pointSeg(p.x, p.y, e.points[i - 1], e.points[i]);
        if (ps.d < bestD) {
          bestD = ps.d;
          best = { edge: e, seg: i - 1, s: run + ps.t * l };
        }
        run += l;
      }
    }
    return best;
  };
  /** How a road arriving at the end of `tr` joins the road it hit, or null if that would make a bad junction. */
  const junction = (tr: Trace): End | null => {
    const end = tr.pts[tr.pts.length - 1];
    const prev = tr.pts[tr.pts.length - 2];
    const din = norm({ x: end.x - prev.x, y: end.y - prev.y });
    const ds = norm({ x: tr.b.x - tr.a.x, y: tr.b.y - tr.a.y });
    if (Math.abs(din.x * ds.y - din.y * ds.x) < MIN_SIN) return null;
    const at = locate(tr.root, end);
    const e = at.edge;
    if (e.bridge) return null;
    const node = at.s < MIN_EDGE ? e.a : e.length - at.s < MIN_EDGE ? e.b : -1;
    if (node < 0) return { node: -1, edge: e.id };
    // Joining an existing junction: there must be room between its arms.
    const nd = nodes[node];
    const back = tr.pts.length > 2 ? tr.pts[tr.pts.length - 3] : prev;
    const arm = Math.atan2(back.y - nd.y, back.x - nd.x);
    if (dist(back, nd) < 8) return null;
    for (const k of nd.edges) if (edges[k].a !== edges[k].b && angleDiff(leave(edges[k], node), arm) < ROOM) return null;
    return { node, edge: e.id };
  };

  const hubs = nodes.filter((n) => n.roundabout);
  const newNode = (p: Vec2): number => {
    nodes.push({ id: nodes.length, x: p.x, y: p.y, edges: [], degree: 0 });
    return nodes.length - 1;
  };
  const attach = (node: number, edge: number) => {
    nodes[node].edges.push(edge);
    nodes[node].degree++;
  };
  const split = (root: number, p: Vec2): number => {
    const at = locate(root, p);
    const e = at.edge;
    const node = newNode(p);
    const tail: Vec2[] = [{ x: p.x, y: p.y }, ...e.points.slice(at.seg + 1)];
    const second: RoadEdge = { ...e, id: edges.length, a: node, points: tail, length: polyLength(tail) };
    edges.push(second);
    pieces.get(root)!.push(second.id);
    // The far end now belongs to the second piece.
    const far = nodes[e.b];
    if (e.a === e.b) far.edges.push(second.id);
    else far.edges[far.edges.indexOf(e.id)] = second.id;
    e.points = [...e.points.slice(0, at.seg + 1), { x: p.x, y: p.y }];
    e.length = polyLength(e.points);
    e.b = node;
    attach(node, e.id);
    attach(node, second.id);
    return node;
  };

  /** True if the new road stays clear of obstacles and of every road except where it joins them. */
  const clear = (pts: Vec2[], joined: [boolean, boolean]): boolean => {
    const first = pts[0];
    const last = pts[pts.length - 1];
    // Nothing joins a street on its way into a roundabout.
    if (hubs.length && pts.some((p) => hubs.some((h) => dist(h, p) < ROUNDABOUT_CLEAR))) return false;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (i < pts.length - 1 && wall[cellOf(b.x, b.y)]) return false;
      let ok = true;
      index.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (r) => {
        const x = segSeg(a, b, r.a, r.b);
        if (!x) return;
        if (joined[0] && Math.hypot(x.x - first.x, x.y - first.y) < 2) return;
        if (joined[1] && Math.hypot(x.x - last.x, x.y - last.y) < 2) return;
        ok = false;
      });
      if (!ok) return false;
    }
    // Away from its ends it must not squeeze along another road.
    let run = 0;
    const total = polyLength(pts);
    for (let i = 1; i < pts.length - 1; i++) {
      run += dist(pts[i - 1], pts[i]);
      if (run > 26 && total - run > 26 && depthAt(pts[i].x, pts[i].y) < 13) return false;
    }
    return true;
  };

  /** Checks the finished shape of the new road against the arms of the junction it makes at end k. */
  const armsOk = (pts: Vec2[], k: 0 | 1, tr: Trace, join: End): boolean => {
    const own = k ? pts.slice().reverse() : pts;
    const from = join.node >= 0 ? nodes[join.node] : own[0];
    let i = 1;
    while (i < own.length - 1 && dist(own[i], from) < 12) i++;
    const arm = Math.atan2(own[i].y - from.y, own[i].x - from.x);
    if (join.node >= 0) {
      for (const id of nodes[join.node].edges) if (edges[id].a !== edges[id].b && angleDiff(leave(edges[id], join.node), arm) < ROOM) return false;
      return true;
    }
    const at = locate(tr.root, from);
    for (const s of [at.s - 12, at.s + 12]) {
      const q = pointAt(at.edge.points, clamp(s, 0, at.edge.length)).p;
      if (angleDiff(Math.atan2(q.y - from.y, q.x - from.x), arm) < ROOM) return false;
    }
    return true;
  };

  const commit = (pts: Vec2[], ends: [Trace | null, Trace | null], joins: [End | null, End | null], plan: Plan): void => {
    const endNode = (k: 0 | 1): number => {
      const p = k ? pts[pts.length - 1] : pts[0];
      const j = joins[k];
      if (!j) return newNode(p);
      if (j.node >= 0) return j.node;
      return split(ends[k]!.root, p);
    };
    const a = endNode(0);
    const b = endNode(1);
    pts[0] = { x: nodes[a].x, y: nodes[a].y };
    pts[pts.length - 1] = { x: nodes[b].x, y: nodes[b].y };
    const mid = pts[Math.floor(pts.length / 2)];
    const id = edges.length;
    edges.push({ id, a, b, cls: plan.cls, points: pts, length: polyLength(pts), bridge: false, district: districtAt(t, districts, mid.x, mid.y).id, infill: true });
    attach(a, id);
    attach(b, id);
    index.addLine(id, pts);
    pieces.set(id, [id]);
    if (plan.cls === 'alley') stats.alleys++;
    else if (plan.cls === 'path') stats.paths++;
    else if (!joins[0] || !joins[1]) stats.culDeSacs++;
    else stats.streets++;

    // Land beside the new road is no longer deep.
    const R = 200;
    const chord = simplify(pts, 0.5);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of chord) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    const i0 = Math.max(0, Math.floor((x0 - R) / G));
    const i1 = Math.min(n - 1, Math.floor((x1 + R) / G));
    const j0 = Math.max(0, Math.floor((y0 - R) / G));
    const j1 = Math.min(n - 1, Math.floor((y1 + R) / G));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * n + i;
        if (depth[c] < 4) continue;
        let d = depth[c];
        for (let k = 1; k < chord.length; k++) d = Math.min(d, pointSeg((i + 0.5) * G, (j + 0.5) * G, chord[k - 1], chord[k]).d);
        depth[c] = d;
      }
    }
    scan(i0, j0, i1, j1);
  };

  /** Shifts the inner points sideways: a slow wave for crooked lanes, a one-sided curve for cul-de-sacs. */
  const shape = (pts: Vec2[], plan: Plan): Vec2[] => {
    if (!plan.wobble && !plan.bend) return pts;
    const total = polyLength(pts);
    const waves = Math.max(1, Math.round(total / 90));
    let run = 0;
    return pts.map((p, i) => {
      if (i === 0) return p;
      run += dist(pts[i - 1], p);
      if (i === pts.length - 1 && !plan.bend) return p;
      const q = pts[i - 1];
      const d = norm({ x: p.x - q.x, y: p.y - q.y });
      const u = run / total;
      const off = plan.bend ? plan.bend * total * u * u : plan.wobble! * Math.sin(Math.PI * waves * u) * Math.min(1, depthAt(p.x, p.y) / 25);
      return { x: p.x - d.y * off, y: p.y + d.x * off };
    });
  };

  const build = (p: Vec2, D: number, plan: Plan, type: DistrictType): boolean => {
    // Nearest street: the new road runs along it or branches off it.
    let near: { d: number; x: number; y: number } | null = null;
    for (const r of [D + 12, 2.5 * D + 30]) {
      index.query(p.x - r, p.y - r, p.x + r, p.y + r, (ref) => {
        const ps = pointSeg(p.x, p.y, ref.a, ref.b);
        if (ps.d <= r && (!near || ps.d < near.d)) near = { d: ps.d, x: ps.x, y: ps.y };
      });
      if (near) break;
    }
    if (!near) return false;
    const q: { d: number; x: number; y: number } = near;
    if (q.d < 8) return false;
    const out = { x: (p.x - q.x) / q.d, y: (p.y - q.y) / q.d };
    const rot = (v: Vec2, a: number): Vec2 => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
    const TRIES = [0, 0.26, -0.26, 0.52, -0.52];

    if (plan.form === 'spur') {
      for (const a of TRIES) {
        const back = trace(p, rot({ x: -out.x, y: -out.y }, a), 0);
        if (back.end !== 'hit') continue;
        const join = junction(back);
        if (!join) continue;
        // Run past the deepest point while there is room for the turning circle and a row of lots.
        const ahead = trace(p, out, 0);
        const room = polyLength(ahead.pts) - (ahead.end === 'hit' ? 34 : 16);
        const ext = clamp(Math.min(0.45 * D, room), 0, 60);
        const stem = back.pts.slice().reverse();
        if (ext > STEP) stem.push({ x: p.x + out.x * ext, y: p.y + out.y * ext });
        const pts = shape(stem, plan);
        const len = polyLength(pts);
        if (len < 36 || len > 190 || !clear(pts, [true, false]) || !armsOk(pts, 0, back, join)) continue;
        commit(pts, [back, null], [join, null], plan);
        return true;
      }
      return false;
    }

    let axis = { x: -out.y, y: out.x };
    if (plan.seaward) {
      const g = gradient(t, t.seaDist, p.x, p.y, 20);
      if (Math.hypot(g.x, g.y) > 1e-3) axis = norm(g);
    }
    const ridge = plan.seaward ? 0 : D;
    const side = (dir: Vec2): { tr: Trace; join: End | null } => {
      let fallback: Trace | null = null;
      for (const a of TRIES) {
        const tr = trace(p, rot(dir, a), ridge);
        if (tr.end === 'hit') {
          const join = junction(tr);
          if (join) return { tr, join };
        } else if (!fallback) fallback = tr;
      }
      // No street to join on this side: stop short of the obstacle, or at the deepest point.
      const tr: Trace = fallback ?? { pts: [p], end: 'none', root: -1, a: p, b: p };
      const keep = tr.end === 'wall' ? tr.pts.length - (plan.cls === 'path' ? 0 : 2) : Math.min(tr.pts.length, 1 + Math.round((0.4 * D) / STEP));
      return { tr: { ...tr, pts: tr.pts.slice(0, Math.max(1, keep)) }, join: null };
    };
    let s1 = side(axis);
    let s2 = side({ x: -axis.x, y: -axis.y });
    // A block that is far too long is cut across instead.
    const style = districtAt(t, districts, p.x, p.y).style;
    if (!plan.seaward && s1.join && s2.join && polyLength(s1.tr.pts) + polyLength(s2.tr.pts) > 2.6 * style.sepB) {
      const c1 = side(out);
      const c2 = side({ x: -out.x, y: -out.y });
      if (c1.join && c2.join) {
        s1 = c1;
        s2 = c2;
      }
    }
    if (!s1.join && !s2.join) return false;
    if (s1.join && s2.join && s1.join.node >= 0 && s1.join.node === s2.join.node) return false;
    let pts = [...s1.tr.pts.slice().reverse(), ...s2.tr.pts.slice(1)];
    // Following the middle of the block leaves small kinks; round them off.
    for (let k = 0; k < 6; k++) {
      pts = pts.map((q, i) => (i === 0 || i === pts.length - 1 ? q : { x: 0.25 * pts[i - 1].x + 0.5 * q.x + 0.25 * pts[i + 1].x, y: 0.25 * pts[i - 1].y + 0.5 * q.y + 0.25 * pts[i + 1].y }));
    }
    pts = shape(pts, plan);
    if (pts.length < 3 || polyLength(pts) < (type === 'industrial' ? 60 : 32)) return false;
    if (!clear(pts, [!!s1.join, !!s2.join])) return false;
    if ((s1.join && !armsOk(pts, 0, s1.tr, s1.join)) || (s2.join && !armsOk(pts, 1, s2.tr, s2.join))) return false;
    commit(pts, [s1.tr, s2.tr], [s1.join, s2.join], plan);
    return true;
  };

  scan(1, 1, n - 2, n - 2);
  const seen = new Uint8Array(n * n);
  for (let guard = 0; guard < 200000 && heap.size; guard++) {
    const [key, c] = heap.pop();
    if (limit[c] === Infinity || Math.abs(depth[c] / limit[c] + key) > 1e-6) continue;
    // The middle of the deepest part of the block.
    const floor = 0.9 * depth[c];
    const stack = [c];
    const region: number[] = [];
    seen[c] = 1;
    while (stack.length && region.length < 2500) {
      const k = stack.pop()!;
      region.push(k);
      for (const o of [k - 1, k + 1, k - n, k + n]) {
        if (o < 0 || o >= n * n || seen[o] || depth[o] < floor || limitOf(o) === Infinity) continue;
        seen[o] = 1;
        stack.push(o);
      }
    }
    for (const k of stack) seen[k] = 0;
    let sx = 0;
    let sy = 0;
    for (const k of region) {
      seen[k] = 0;
      sx += k % n;
      sy += Math.floor(k / n);
    }
    sx /= region.length;
    sy /= region.length;
    let centre = c;
    let bestD = Infinity;
    for (const k of region) {
      const d = Math.hypot((k % n) - sx, Math.floor(k / n) - sy);
      if (d < bestD) {
        bestD = d;
        centre = k;
      }
    }
    const p = { x: ((centre % n) + 0.5) * G, y: (Math.floor(centre / n) + 0.5) * G };
    const D = depth[centre];
    const type = districtAt(t, districts, p.x, p.y).type;
    const plan = D > INFILL_DEPTH[type] ? planFor(type, D, rng) : null;
    if (!plan || !build(p, D, plan, type)) suppress(p, Math.max(12, 0.5 * D));
  }

  // Freeway crossings recorded on a street that has since been split belong to one of its pieces.
  for (const x of graph.crossings) {
    const parts = pieces.get(x.street);
    if (parts && parts.length > 1) x.street = locate(x.street, x).edge.id;
  }
  return stats;
}
