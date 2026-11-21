import { Rng } from '../core/rng';
import { SegmentIndex, pointAt, pointSeg, polyLength, resample, segSeg, simplify, subPath } from '../core/geom';
import { Vec2, angleDiff, dist } from '../core/vec2';
import { Districts, districtAt } from './districts';
import { BRIDGE_APPROACH, BRIDGE_SPACING, CLASS_RANK, RoadClass, RoadLine, isStreet, waterCrossings } from './streamlines';
import { Terrain, heightAt, isWater, riverBankAt, seaDistAt, waterDistAt } from './terrain';

export interface RoadNode {
  id: number;
  x: number;
  y: number;
  /** Ids of connected edges. */
  edges: number[];
}

export interface RoadEdge {
  id: number;
  a: number;
  b: number;
  cls: RoadClass;
  /** Centre line from node a to node b. */
  points: Vec2[];
  length: number;
  /** Crosses water. */
  bridge: boolean;
  district: number;
}

/** Place where a freeway or ramp passes over/under a street without connecting to it. */
export interface Crossing {
  x: number;
  y: number;
  highway: number;
  street: number;
}

export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
  crossings: Crossing[];
}

const MERGE_RADIUS = 6;
const SNAP_DIST = 2.5;
const MIN_EDGE = 22;
const MIN_DEAD_END = 35;
const MAX_DEAD_END = 130;
const ACUTE = (28 * Math.PI) / 180;

interface TmpNode {
  x: number;
  y: number;
  edges: Set<number>;
  alive: boolean;
}

interface TmpEdge {
  a: number;
  b: number;
  cls: RoadClass;
  pts: Vec2[];
  len: number;
  alive: boolean;
  bridge?: boolean;
}

class Builder {
  nodes: TmpNode[] = [];
  edges: TmpEdge[] = [];
  private hash = new Map<number, number[]>();

  nodeAt(x: number, y: number): number {
    const c = MERGE_RADIUS;
    const cx = Math.floor(x / c);
    const cy = Math.floor(y / c);
    let best = -1;
    let bestD = MERGE_RADIUS;
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        const arr = this.hash.get((i + 4096) * 8192 + j + 4096);
        if (!arr) continue;
        for (const id of arr) {
          const d = Math.hypot(this.nodes[id].x - x, this.nodes[id].y - y);
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      }
    }
    if (best >= 0) return best;
    const id = this.nodes.length;
    this.nodes.push({ x, y, edges: new Set(), alive: true });
    const k = (cx + 4096) * 8192 + cy + 4096;
    const arr = this.hash.get(k);
    if (arr) arr.push(id);
    else this.hash.set(k, [id]);
    return id;
  }

  addEdge(a: number, b: number, cls: RoadClass, pts: Vec2[]): number {
    const id = this.edges.length;
    this.edges.push({ a, b, cls, pts, len: polyLength(pts), alive: true });
    this.nodes[a].edges.add(id);
    this.nodes[b].edges.add(id);
    return id;
  }

  removeEdge(id: number): void {
    const e = this.edges[id];
    if (!e.alive) return;
    e.alive = false;
    this.nodes[e.a].edges.delete(id);
    this.nodes[e.b].edges.delete(id);
  }

  degree(n: number): number {
    let d = 0;
    for (const e of this.nodes[n].edges) d += this.edges[e].a === this.edges[e].b ? 2 : 1;
    return d;
  }

  /** Direction in which edge e leaves node n. */
  angleFrom(e: number, n: number): number {
    const ed = this.edges[e];
    const fromA = ed.a === n;
    const pts = ed.pts;
    const o = fromA ? pts[0] : pts[pts.length - 1];
    const q = fromA ? pointAt(pts, Math.min(12, ed.len)).p : pointAt(pts, Math.max(0, ed.len - 12)).p;
    return Math.atan2(q.y - o.y, q.x - o.x);
  }
}

function splitLines(lines: RoadLine[], g: Builder): void {
  const polys = lines.map((l) => ({ pts: simplify(l.points, 0.35), cls: l.cls }));
  const index = new SegmentIndex(50);
  polys.forEach((p, i) => index.addLine(i, p.pts));
  const splits: { seg: number; t: number; x: number; y: number }[][] = polys.map(() => []);

  polys.forEach((p, li) => {
    if (!isStreet(p.cls)) return;
    for (let si = 0; si + 1 < p.pts.length; si++) {
      const a = p.pts[si];
      const b = p.pts[si + 1];
      index.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (r) => {
        if (r.line < li || (r.line === li && r.seg <= si + 1)) return;
        if (!isStreet(polys[r.line].cls)) return;
        const h = segSeg(a, b, r.a, r.b);
        if (!h) return;
        splits[li].push({ seg: si, t: h.t, x: h.x, y: h.y });
        splits[r.line].push({ seg: r.seg, t: h.u, x: h.x, y: h.y });
      });
    }
  });

  // Line ends that touch other lines become junctions on those lines.
  polys.forEach((p, li) => {
    for (const end of [0, p.pts.length - 1]) {
      const e = p.pts[end];
      const hits = new Map<number, { seg: number; t: number; x: number; y: number; d: number }>();
      index.query(e.x - SNAP_DIST, e.y - SNAP_DIST, e.x + SNAP_DIST, e.y + SNAP_DIST, (r) => {
        if (r.line === li) return;
        if (isStreet(p.cls) && !isStreet(polys[r.line].cls)) return;
        const ps = pointSeg(e.x, e.y, r.a, r.b);
        const prev = hits.get(r.line);
        if (ps.d < SNAP_DIST && (!prev || ps.d < prev.d)) hits.set(r.line, { seg: r.seg, t: ps.t, x: ps.x, y: ps.y, d: ps.d });
      });
      // Snap onto the strongest road; the others get a cut that merges into the same node.
      let best = -1;
      for (const [line, h] of hits) {
        splits[line].push({ seg: h.seg, t: h.t, x: h.x, y: h.y });
        if (best < 0 || CLASS_RANK[polys[line].cls] > CLASS_RANK[polys[best].cls]) best = line;
      }
      if (best >= 0) {
        const h = hits.get(best)!;
        p.pts[end] = { x: h.x, y: h.y };
      }
    }
  });

  polys.forEach((p, li) => {
    const cuts = splits[li].sort((u, v) => u.seg - v.seg || u.t - v.t);
    let piece: Vec2[] = [p.pts[0]];
    let ci = 0;
    const flush = (end: Vec2) => {
      piece.push(end);
      const a = g.nodeAt(piece[0].x, piece[0].y);
      const b = g.nodeAt(end.x, end.y);
      const pts = piece.slice();
      pts[0] = { x: g.nodes[a].x, y: g.nodes[a].y };
      pts[pts.length - 1] = { x: g.nodes[b].x, y: g.nodes[b].y };
      const len = polyLength(pts);
      if (len > 0.5 && !(a === b && len < 60)) g.addEdge(a, b, p.cls, pts);
      piece = [end];
    };
    for (let si = 0; si + 1 < p.pts.length; si++) {
      while (ci < cuts.length && cuts[ci].seg === si) {
        flush({ x: cuts[ci].x, y: cuts[ci].y });
        ci++;
      }
      if (si + 2 < p.pts.length) piece.push(p.pts[si + 1]);
    }
    flush(p.pts[p.pts.length - 1]);
  });
}

function orient(e: TmpEdge, from: number): Vec2[] {
  return e.a === from ? e.pts : e.pts.slice().reverse();
}

/** Joins the two edges of every pass-through node into one edge. */
function mergeChains(g: Builder): void {
  for (let n = 0; n < g.nodes.length; n++) {
    const node = g.nodes[n];
    if (!node.alive || node.edges.size !== 2) continue;
    const [e1, e2] = [...node.edges];
    const a = g.edges[e1];
    const b = g.edges[e2];
    if (a.cls !== b.cls || a.a === a.b || b.a === b.b) continue;
    const start = a.a === n ? a.b : a.a;
    const end = b.a === n ? b.b : b.a;
    const pts = [...orient(a, start), ...orient(b, n).slice(1)];
    g.removeEdge(e1);
    g.removeEdge(e2);
    node.alive = false;
    g.addEdge(start, end, a.cls, pts);
  }
}

interface Ctx {
  t: Terrain;
  districts: Districts;
  rng: Rng;
  keepDeadEnd: Map<number, boolean>;
  bridges: Vec2[];
}

function nearEdge(t: Terrain, x: number, y: number): boolean {
  return x < 12 || y < 12 || x > t.size - 12 || y > t.size - 12;
}

/** Removes stubs; a share of longer ones survive as cul-de-sacs. */
function pruneDeadEnds(g: Builder, ctx: Ctx): void {
  const queue: number[] = [];
  g.nodes.forEach((n, i) => {
    if (n.alive && n.edges.size === 1) queue.push(i);
  });
  while (queue.length) {
    const n = queue.pop()!;
    const node = g.nodes[n];
    if (!node.alive || node.edges.size !== 1) continue;
    const eid = [...node.edges][0];
    const e = g.edges[eid];
    if (e.a === e.b || nearEdge(ctx.t, node.x, node.y)) continue;
    let keep = false;
    if ((e.cls === 'local' || e.cls === 'collector') && e.len >= MIN_DEAD_END) {
      let decided = ctx.keepDeadEnd.get(n);
      if (decided === undefined) {
        let p = districtAt(ctx.t, ctx.districts, node.x, node.y).style.culDeSac;
        // Streets that run down to the waterfront usually just end there.
        if (waterDistAt(ctx.t, node.x, node.y) < 40) p = Math.max(p, 0.6);
        decided = ctx.rng.chance(p);
        ctx.keepDeadEnd.set(n, decided);
      }
      keep = decided;
    }
    if (keep) {
      if (e.cls === 'collector' && e.len < 220) e.cls = 'local';
      if (e.cls === 'local' && e.len > MAX_DEAD_END) {
        // Shorten over-long dead ends.
        const target = ctx.rng.range(65, 115);
        const pts = orient(e, e.a === n ? e.b : e.a);
        const out: Vec2[] = [pts[0]];
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          const l = dist(pts[i - 1], pts[i]);
          if (acc + l >= target) {
            const k = (target - acc) / l;
            out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k });
            break;
          }
          out.push(pts[i]);
          acc += l;
        }
        const end = out[out.length - 1];
        node.x = end.x;
        node.y = end.y;
        const other = e.a === n ? e.b : e.a;
        e.a = other;
        e.b = n;
        e.pts = out;
        e.len = polyLength(out);
      }
      continue;
    }
    const other = e.a === n ? e.b : e.a;
    g.removeEdge(eid);
    node.alive = false;
    if (g.nodes[other].edges.size === 1) queue.push(other);
  }
}

/** Splits edge `id` at point p on segment `seg`; returns the node at p (an end node if p is close to it). */
function splitEdge(g: Builder, id: number, seg: number, p: Vec2): number {
  const e = g.edges[id];
  let s = dist(e.pts[seg], p);
  for (let i = 0; i < seg; i++) s += dist(e.pts[i], e.pts[i + 1]);
  if (s < MIN_EDGE) return e.a;
  if (e.len - s < MIN_EDGE) return e.b;
  const n = g.nodes.length;
  g.nodes.push({ x: p.x, y: p.y, edges: new Set(), alive: true });
  g.removeEdge(id);
  g.addEdge(e.a, n, e.cls, [...e.pts.slice(0, seg + 1), { x: p.x, y: p.y }]);
  g.addEdge(n, e.b, e.cls, [{ x: p.x, y: p.y }, ...e.pts.slice(seg + 1)]);
  return n;
}

/** Whether a new straight street from a to b can be built; reports if it needs a bridge. */
function buildable(g: Builder, ctx: Ctx, a: Vec2, b: Vec2, cls: RoadClass, ignore: Set<number>): { ok: boolean; water: boolean } {
  const t = ctx.t;
  const d = dist(a, b);
  let water = false;
  let h = heightAt(t, a.x, a.y);
  for (let s = 5; s < d; s += 5) {
    const x = a.x + ((b.x - a.x) * s) / d;
    const y = a.y + ((b.y - a.y) * s) / d;
    if (seaDistAt(t, x, y) < 12) return { ok: false, water };
    const bank = riverBankAt(t, x, y);
    if (bank < 0) {
      if (ctx.bridges.some((q) => Math.hypot(q.x - x, q.y - y) < BRIDGE_SPACING)) return { ok: false, water };
      water = true;
    }
    const nh = heightAt(t, x, y);
    if (bank > BRIDGE_APPROACH && Math.abs(nh - h) / 5 > 0.22) return { ok: false, water };
    h = nh;
  }
  if (water && cls === 'local') return { ok: false, water };
  for (let k = 0; k < g.edges.length; k++) {
    const e = g.edges[k];
    if (!e.alive || ignore.has(k)) continue;
    // Bigger streets pass over or under the freeway; everything else must not be crossed.
    if (!isStreet(e.cls) && cls !== 'local') continue;
    for (let i = 1; i < e.pts.length; i++) if (segSeg(a, b, e.pts[i - 1], e.pts[i])) return { ok: false, water };
  }
  return { ok: true, water };
}

/** True if a street leaving node n at `angle` would not squeeze in next to an existing one. */
function roomAt(g: Builder, n: number, angle: number, skip = -1): boolean {
  for (const k of g.nodes[n].edges) {
    if (k === skip || g.edges[k].a === g.edges[k].b) continue;
    if (angleDiff(g.angleFrom(k, n), angle) < 2 * ACUTE) return false;
  }
  return true;
}

/** Continues dead ends straight ahead to the next street, bridging the river if necessary. */
function extendDeadEnds(g: Builder, ctx: Ctx): number {
  let count = 0;
  const total = g.nodes.length;
  for (let n = 0; n < total; n++) {
    const node = g.nodes[n];
    if (!node.alive || node.edges.size !== 1 || nearEdge(ctx.t, node.x, node.y)) continue;
    const eid = [...node.edges][0];
    const e = g.edges[eid];
    if (!isStreet(e.cls) || e.a === e.b || e.len < MIN_DEAD_END) continue;
    const back = g.angleFrom(eid, n);
    const dir = { x: -Math.cos(back), y: -Math.sin(back) };
    const reach = e.cls === 'local' ? 120 : 300;
    const from = { x: node.x, y: node.y };
    const to = { x: node.x + dir.x * reach, y: node.y + dir.y * reach };
    let best: { edge: number; seg: number; p: Vec2; t: number } | null = null;
    for (let k = 0; k < g.edges.length; k++) {
      const o = g.edges[k];
      if (!o.alive || k === eid || !isStreet(o.cls) || o.a === o.b) continue;
      for (let i = 1; i < o.pts.length; i++) {
        const h = segSeg(from, to, o.pts[i - 1], o.pts[i]);
        if (!h || h.t * reach < 2 || (best && h.t >= best.t)) continue;
        best = { edge: k, seg: i - 1, p: { x: h.x, y: h.y }, t: h.t };
      }
    }
    if (!best) continue;
    const hit: { edge: number; seg: number; p: Vec2; t: number } = best;
    const target = g.edges[hit.edge];
    const sa = target.pts[hit.seg];
    const sb = target.pts[hit.seg + 1];
    const sin = Math.abs(dir.x * (sb.y - sa.y) - dir.y * (sb.x - sa.x)) / dist(sa, sb);
    if (sin < 0.55) continue;
    const check = buildable(g, ctx, from, hit.p, e.cls, new Set([eid, hit.edge]));
    if (!check.ok) continue;
    const other = e.a === n ? e.b : e.a;
    const end = splitEdge(g, hit.edge, hit.seg, hit.p);
    if (end === other || end === n) continue;
    const en = g.nodes[end];
    if (!roomAt(g, end, Math.atan2(node.y - en.y, node.x - en.x))) continue;
    const p = { x: en.x, y: en.y };
    if (check.water) ctx.bridges.push(...waterCrossings(ctx.t, resample([from, p], 6)));
    node.edges.delete(eid);
    node.alive = false;
    if (e.b === n) {
      e.pts.push(p);
      e.b = end;
    } else {
      e.pts.unshift(p);
      e.a = end;
    }
    e.len = polyLength(e.pts);
    en.edges.add(eid);
    count++;
  }
  return count;
}

function components(g: Builder): { comp: Int32Array; sizes: number[] } {
  const comp = new Int32Array(g.nodes.length).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < g.nodes.length; s++) {
    if (!g.nodes[s].alive || comp[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [s];
    comp[s] = id;
    while (stack.length) {
      const n = stack.pop()!;
      for (const k of g.nodes[n].edges) {
        const e = g.edges[k];
        size += e.len;
        const o = e.a === n ? e.b : e.a;
        if (comp[o] < 0) {
          comp[o] = id;
          stack.push(o);
        }
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

const MAX_LINK = 420;

/** Ties cut-off pieces of the network (across the river, behind the freeway) to the main network. */
function connectComponents(g: Builder, ctx: Ctx): void {
  for (let round = 0; round < 12; round++) {
    const { comp, sizes } = components(g);
    if (sizes.length < 2) return;
    const main = sizes.indexOf(Math.max(...sizes));
    const streetNode = (i: number) => {
      const n = g.nodes[i];
      if (!n.alive || n.edges.size === 0) return false;
      for (const k of n.edges) if (!isStreet(g.edges[k].cls)) return false;
      return true;
    };
    const mainNodes: number[] = [];
    const rest = new Map<number, number[]>();
    for (let i = 0; i < g.nodes.length; i++) {
      if (!streetNode(i)) continue;
      if (comp[i] === main) mainNodes.push(i);
      else if (sizes[comp[i]] >= 2 * 150) {
        const list = rest.get(comp[i]);
        if (list) list.push(i);
        else rest.set(comp[i], [i]);
      }
    }
    let linked = false;
    for (const list of rest.values()) {
      const pairs: { a: number; b: number; score: number }[] = [];
      for (const a of list) {
        for (const b of mainNodes) {
          const d = Math.hypot(g.nodes[a].x - g.nodes[b].x, g.nodes[a].y - g.nodes[b].y);
          if (d < 30 || d > MAX_LINK) continue;
          // Prefer continuing loose ends.
          const loose = (g.nodes[a].edges.size === 1 ? 0.7 : 1) * (g.nodes[b].edges.size === 1 ? 0.7 : 1);
          pairs.push({ a, b, score: d * loose });
        }
      }
      pairs.sort((p, q) => p.score - q.score);
      for (const pair of pairs.slice(0, 60)) {
        const na = g.nodes[pair.a];
        const nb = g.nodes[pair.b];
        const angle = Math.atan2(nb.y - na.y, nb.x - na.x);
        if (!roomAt(g, pair.a, angle) || !roomAt(g, pair.b, angle + Math.PI)) continue;
        const strongest = Math.max(...[...na.edges, ...nb.edges].map((k) => CLASS_RANK[g.edges[k].cls]));
        const cls: RoadClass = strongest > CLASS_RANK.local ? 'collector' : 'local';
        const pa = { x: na.x, y: na.y };
        const pb = { x: nb.x, y: nb.y };
        const ignore = new Set([...na.edges, ...nb.edges]);
        let check = buildable(g, ctx, pa, pb, cls, ignore);
        if (!check.ok && cls === 'local') check = buildable(g, ctx, pa, pb, 'collector', ignore);
        if (!check.ok) continue;
        if (check.water) ctx.bridges.push(...waterCrossings(ctx.t, resample([pa, pb], 6)));
        g.addEdge(pair.a, pair.b, check.water ? 'collector' : cls, [pa, pb]);
        linked = true;
        break;
      }
      if (linked) break;
    }
    if (!linked) return;
  }
}

const ABUTMENT = 10;

/** Cuts the spans over water out of each road so that every bridge is an edge of its own. */
function splitBridges(g: Builder, t: Terrain): void {
  const count = g.edges.length;
  for (let id = 0; id < count; id++) {
    const e = g.edges[id];
    if (!e.alive) continue;
    const spans: [number, number][] = [];
    let start = -1;
    for (let s = 0; s <= e.len; s += 3) {
      const p = pointAt(e.pts, s).p;
      const wet = isWater(t, p.x, p.y);
      if (wet && start < 0) start = s;
      if (start >= 0 && (!wet || s + 3 > e.len)) {
        const a = Math.max(0, start - ABUTMENT);
        const b = Math.min(e.len, (wet ? e.len : s) + ABUTMENT);
        const last = spans[spans.length - 1];
        if (last && a - last[1] < MIN_EDGE) last[1] = b;
        else spans.push([a, b]);
        start = -1;
      }
    }
    if (!spans.length) continue;
    if (spans[0][0] < MIN_EDGE) spans[0][0] = 0;
    const tail = spans[spans.length - 1];
    if (e.len - tail[1] < MIN_EDGE) tail[1] = e.len;
    if (spans.length === 1 && spans[0][0] === 0 && spans[0][1] === e.len) {
      e.bridge = true;
      continue;
    }
    if (e.a === e.b) continue;
    g.removeEdge(id);
    let node = e.a;
    let at = 0;
    const piece = (to: number, bridge: boolean) => {
      if (to - at < 1e-6) return;
      const pts = subPath(e.pts, at, to);
      let next = e.b;
      if (to < e.len) {
        next = g.nodes.length;
        const p = pts[pts.length - 1];
        g.nodes.push({ x: p.x, y: p.y, edges: new Set(), alive: true });
      }
      g.edges[g.addEdge(node, next, e.cls, pts)].bridge = bridge;
      node = next;
      at = to;
    };
    for (const [a, b] of spans) {
      piece(a, false);
      piece(b, true);
    }
    piece(e.len, false);
  }
}

/** Removes the weaker of two roads that leave a junction at a very sharp angle. */
function fixAcuteJunctions(g: Builder): number {
  let removed = 0;
  for (let n = 0; n < g.nodes.length; n++) {
    const node = g.nodes[n];
    if (!node.alive) continue;
    for (let guard = 0; guard < 6 && node.edges.size >= 3; guard++) {
      const out = [...node.edges].filter((e) => g.edges[e].a !== g.edges[e].b).map((e) => ({ e, a: g.angleFrom(e, n) }));
      let victim = -1;
      for (let i = 0; i < out.length && victim < 0; i++) {
        for (let j = i + 1; j < out.length; j++) {
          if (angleDiff(out[i].a, out[j].a) >= ACUTE) continue;
          const ei = g.edges[out[i].e];
          const ej = g.edges[out[j].e];
          if (!isStreet(ei.cls) || !isStreet(ej.cls)) continue;
          const ri = CLASS_RANK[ei.cls];
          const rj = CLASS_RANK[ej.cls];
          victim = ri < rj || (ri === rj && ei.len < ej.len) ? out[i].e : out[j].e;
          break;
        }
      }
      if (victim < 0) break;
      g.removeEdge(victim);
      removed++;
    }
  }
  return removed;
}

/** Collapses very short edges so that near-coincident junctions become one intersection. */
function contractShortEdges(g: Builder): number {
  let count = 0;
  for (let id = 0; id < g.edges.length; id++) {
    const e = g.edges[id];
    if (!e.alive || !isStreet(e.cls) || e.len >= MIN_EDGE || e.a === e.b) continue;
    if (g.nodes[e.a].edges.size < 2 || g.nodes[e.b].edges.size < 2) continue;
    const fixed = (n: number) => [...g.nodes[n].edges].some((k) => !isStreet(g.edges[k].cls));
    const fa = fixed(e.a);
    const fb = fixed(e.b);
    if (fa && fb) continue;
    const keep = fb ? e.b : e.a;
    const drop = fb ? e.a : e.b;
    const kn = g.nodes[keep];
    const dn = g.nodes[drop];
    if (!fa && !fb) {
      kn.x = (kn.x + dn.x) / 2;
      kn.y = (kn.y + dn.y) / 2;
    }
    g.removeEdge(id);
    for (const k of [...dn.edges]) {
      const o = g.edges[k];
      dn.edges.delete(k);
      if (o.a === drop) o.a = keep;
      if (o.b === drop) o.b = keep;
      kn.edges.add(k);
    }
    dn.alive = false;
    for (const k of [...kn.edges]) {
      const o = g.edges[k];
      if (o.a === keep) o.pts[0] = { x: kn.x, y: kn.y };
      if (o.b === keep) o.pts[o.pts.length - 1] = { x: kn.x, y: kn.y };
      o.len = polyLength(o.pts);
      if (o.a === o.b && o.len < 60) g.removeEdge(k);
    }
    count++;
  }
  return count;
}

/** Drops the shorter of two near-identical edges between the same pair of nodes. */
function removeDuplicates(g: Builder): void {
  const seen = new Map<string, number>();
  for (let id = 0; id < g.edges.length; id++) {
    const e = g.edges[id];
    if (!e.alive || e.a === e.b) continue;
    const key = e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
    const prev = seen.get(key);
    if (prev === undefined) {
      seen.set(key, id);
      continue;
    }
    const p = g.edges[prev];
    if (Math.abs(p.len - e.len) > 0.35 * Math.max(p.len, e.len)) continue;
    const loser = CLASS_RANK[p.cls] < CLASS_RANK[e.cls] || (p.cls === e.cls && p.len > e.len) ? prev : id;
    g.removeEdge(loser);
    if (loser === prev) seen.set(key, id);
  }
}

/** True if a and b stay connected through nearby streets without edge `skip`. */
function locallyConnected(g: Builder, a: number, b: number, skip: number, limit = 80): boolean {
  const seen = new Set<number>([a]);
  const queue = [a];
  while (queue.length && seen.size < limit) {
    const n = queue.shift()!;
    for (const k of g.nodes[n].edges) {
      if (k === skip) continue;
      const e = g.edges[k];
      const o = e.a === n ? e.b : e.a;
      if (o === b) return true;
      if (!seen.has(o)) {
        seen.add(o);
        queue.push(o);
      }
    }
  }
  return false;
}

function keepLargestComponent(g: Builder): void {
  const { comp, sizes } = components(g);
  const best = sizes.indexOf(Math.max(...sizes));
  g.nodes.forEach((n, i) => {
    if (!n.alive || comp[i] === best) return;
    for (const k of [...n.edges]) g.removeEdge(k);
    n.alive = false;
  });
}

export function buildRoadGraph(lines: RoadLine[], t: Terrain, districts: Districts, rng: Rng): RoadGraph {
  const g = new Builder();
  splitLines(lines, g);
  const ctx: Ctx = { t, districts, rng, keepDeadEnd: new Map(), bridges: lines.flatMap((l) => waterCrossings(t, l.points)) };
  const tidy = () => {
    pruneDeadEnds(g, ctx);
    mergeChains(g);
    pruneDeadEnds(g, ctx);
  };

  removeDuplicates(g);
  mergeChains(g);
  extendDeadEnds(g, ctx);
  connectComponents(g, ctx);
  tidy();
  for (let i = 0; i < 4; i++) {
    const changed = contractShortEdges(g) + fixAcuteJunctions(g);
    removeDuplicates(g);
    tidy();
    if (!changed) break;
  }

  // Parks swallow the small streets inside them.
  for (let id = 0; id < g.edges.length; id++) {
    const e = g.edges[id];
    if (!e.alive || e.cls === 'arterial' || !isStreet(e.cls)) continue;
    const m = pointAt(e.pts, e.len / 2).p;
    if (districts.parks.some((p) => dist(p.center, m) < p.radius)) g.removeEdge(id);
  }
  // Break up the grid: delete some local segments so blocks merge and streets stop lining up.
  const count = g.edges.length;
  for (let id = 0; id < count; id++) {
    const e = g.edges[id];
    if (!e.alive || e.cls !== 'local' || e.a === e.b) continue;
    if (g.nodes[e.a].edges.size < 3 || g.nodes[e.b].edges.size < 3) continue;
    const m = pointAt(e.pts, e.len / 2).p;
    if (!rng.chance(districtAt(t, districts, m.x, m.y).style.breakProb)) continue;
    if (locallyConnected(g, e.a, e.b, id)) g.removeEdge(id);
  }
  tidy();
  for (let i = 0; i < 3; i++) {
    const changed = contractShortEdges(g) + fixAcuteJunctions(g);
    removeDuplicates(g);
    tidy();
    if (!changed) break;
  }
  keepLargestComponent(g);
  mergeChains(g);
  splitBridges(g, t);

  // Compact into the final graph.
  const nodeId = new Int32Array(g.nodes.length).fill(-1);
  const nodes: RoadNode[] = [];
  g.nodes.forEach((n, i) => {
    if (!n.alive || n.edges.size === 0) return;
    nodeId[i] = nodes.length;
    nodes.push({ id: nodes.length, x: n.x, y: n.y, edges: [] });
  });
  const edges: RoadEdge[] = [];
  for (const e of g.edges) {
    if (!e.alive) continue;
    const id = edges.length;
    const m = pointAt(e.pts, e.len / 2).p;
    edges.push({ id, a: nodeId[e.a], b: nodeId[e.b], cls: e.cls, points: e.pts, length: e.len, bridge: !!e.bridge, district: districtAt(t, districts, m.x, m.y).id });
    nodes[nodeId[e.a]].edges.push(id);
    if (e.b !== e.a) nodes[nodeId[e.b]].edges.push(id);
  }

  // Grade-separated crossings between freeways/ramps and streets.
  const crossings: Crossing[] = [];
  const index = new SegmentIndex(60);
  edges.forEach((e) => {
    if (isStreet(e.cls)) index.addLine(e.id, e.points);
  });
  for (const e of edges) {
    if (isStreet(e.cls)) continue;
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1];
      const b = e.points[i];
      index.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (r) => {
        const s = edges[r.line];
        if (s.a === e.a || s.a === e.b || s.b === e.a || s.b === e.b) return;
        const h = segSeg(a, b, r.a, r.b);
        if (h) crossings.push({ x: h.x, y: h.y, highway: e.id, street: r.line });
      });
    }
  }
  return { nodes, edges, crossings };
}
