import { MeshBuilder, ModelData, V3 } from '../assets/mesh/builder';
import { pointAt, pointSeg, polyLength, resample } from '../core/geom';
import { Vec2 } from '../core/vec2';
import { DistrictType, districtAt } from '../gen/districts';
import { layout } from '../assets/mesh/section';
import { CLASS_RANK, isStreet } from '../gen/streamlines';
import { BERM_HEIGHT, BERM_WIDTH, RIVER_RESERVE, hillAt, riverBankAt, seaDistAt } from '../gen/terrain';
import { FREE, LOT, RAIL, ROAD, USED, WATER, Site, SiteItem, SiteKind, along, facing, hash, pick } from './site';

/** Height of the water surface as drawn. */
export const WATER_Y = -0.4;
export type ShoreKind = 'beach' | 'port' | 'urban' | 'rocky' | 'natural' | 'mouth';

/** A point of the sea shore, every 4 m. Stations run with the sea on their left: the next one lies towards (ny, -nx). */
export interface ShoreStation {
  x: number;
  y: number;
  /** Unit vector out to sea. */
  nx: number;
  ny: number;
  kind: ShoreKind;
  type: DistrictType;
}
/** A stretch of shore of one kind. */
export interface Reach {
  kind: ShoreKind;
  coast: number;
  from: number;
  to: number;
  length: number;
  /** Height of the quay or promenade behind the sea wall, for the stretches that have one. */
  top?: number;
  wall?: string;
}
export interface Waterfront {
  coasts: ShoreStation[][];
  reaches: Reach[];
  tiles: ModelData[];
  /** How sandy the ground is, 0..1 on the terrain grid. */
  sand: Float32Array;
  /** How much of the ground is the paving of a port yard, 0..1 on the terrain grid. */
  paved: Float32Array;
  /** `street` is the road edge whose line a pier carries on out to sea, if it stands at the end of one. */
  piers: { x: number; y: number; yaw: number; length: number; model: string; public: boolean; street: number | null }[];
  towers: Vec2[];
  lighthouse: Vec2 | null;
  /** Lots (by index) that lie on the sand of a beach. They are left open: no building, yard or fence goes on them. */
  sandLots: number[];
  /**
   * Where a street runs along the back of a beach: the outer edge of its pavement, the level of the walk laid beside it,
   * the line of the low wall above the sand and the places where a ramp goes down through it.
   */
  fronts: { edge: number; side: number; kerb: Vec2[]; top: number[]; wall: Vec2[]; steps: Vec2[] }[];
  /** Marks laid on the sand: the tide line, wheel tracks, footprints. `kind` is the texture. */
  marks: { kind: string; pts: Vec2[] }[];
  /** The walks along the walled banks of the river: the middle line of each, its level and its width. */
  walks: { style: 'city' | 'old' | 'home' | 'works'; pts: Vec2[]; top: number; width: number }[];
  /** Where a way up from a river walk reaches the street. */
  walkWays: Vec2[];
  /** 1 on the terrain grid where the river bank is made ground: the wall, the berm and the embankment. */
  banks: Float32Array;
}

const WALL_TOP: Record<string, number> = { 'waterfront/seawall-concrete': 2.2, 'waterfront/seawall-concrete-old': 2.2, 'waterfront/seawall-stone': 2.2, 'waterfront/seawall-sheetpile': 1.6, 'waterfront/seawall-quay': 2.6 };
const smooth = (a: number, b: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * Fits out the shore: finds the shore line, decides what each stretch of it is from the district behind it and the
 * lie of the land, builds quays and promenades where the town meets the water, and furnishes beaches, the port,
 * rocky and open shores and the river banks.
 */
export function placeWaterfront(site: Site): Waterfront {
  const { city } = site;
  const t = city.terrain;
  const size = t.size;
  const seed = site.seed;
  const rnd = (...v: number[]): number => hash(seed, 9001, ...v);
  const sea = (x: number, y: number): number => seaDistAt(t, x, y);
  const b = new MeshBuilder();
  const out: Waterfront = { coasts: [], reaches: [], tiles: [], sand: new Float32Array(t.n * t.n), paved: new Float32Array(t.n * t.n), piers: [], towers: [], lighthouse: null, marks: [], fronts: [], sandLots: [], walks: [], walkWays: [], banks: new Float32Array(t.n * t.n) };

  // --- The shore line: for each line across the coast, where the sea ends ---
  const at = (u: number, v: number): Vec2 => ({ x: size / 2 + t.along.x * u + t.inland.x * v, y: size / 2 + t.along.y * u + t.inland.y * v });
  const inMap = (p: Vec2, m: number): boolean => p.x > m && p.y > m && p.x < size - m && p.y < size - m;
  const lines: Vec2[][] = [];
  let cur: Vec2[] = [];
  for (let u = -size; u <= size; u += 4) {
    let hit: Vec2 | null = null;
    let prev: number | null = null;
    for (let v = -size; v <= size && !hit; v += 4) {
      const p = at(u, v);
      if (!inMap(p, 20)) {
        prev = null;
        continue;
      }
      const d = sea(p.x, p.y);
      if (prev !== null && prev < 0 && d >= 0) hit = at(u, v - 4 + (4 * -prev) / (d - prev));
      prev = d;
    }
    const last = cur[cur.length - 1];
    if (hit && (!last || Math.hypot(hit.x - last.x, hit.y - last.y) < 40)) cur.push(hit);
    else {
      if (cur.length) lines.push(cur);
      cur = hit ? [hit] : [];
    }
  }
  if (cur.length) lines.push(cur);

  const P = (st: ShoreStation, a: number, d: number): Vec2 => ({ x: st.x + st.ny * a - st.nx * d, y: st.y - st.nx * a - st.ny * d });
  const roadless = (st: ShoreStation, depth: number): boolean => {
    for (let d = 2; d <= depth; d += 2) {
      const c = site.at(P(st, 0, d).x, P(st, 0, d).y);
      if (c !== FREE && c !== LOT && c !== WATER) return false;
    }
    return true;
  };
  /** Whether the ground a quay would cover lies low enough for one. */
  const low = (st: ShoreStation, depth: number): boolean => {
    for (let d = 4; d <= depth; d += 4) if (site.heightAt(P(st, 0, d).x, P(st, 0, d).y) > 1.5) return false;
    return true;
  };
  const DECK = { port: 24, urban: 14 };
  for (const line of lines) {
    if (polyLength(line) < 160) continue;
    let pts = line;
    for (let pass = 0; pass < 2; pass++) pts = pts.map((_, i) => {
      const w = pts.slice(Math.max(0, i - 2), i + 3);
      return { x: w.reduce((s, q) => s + q.x, 0) / w.length, y: w.reduce((s, q) => s + q.y, 0) / w.length };
    });
    pts = resample(pts, 4);
    let stations: ShoreStation[] = pts.map((p) => {
      const [gx, gy] = [sea(p.x + 4, p.y) - sea(p.x - 4, p.y), sea(p.x, p.y + 4) - sea(p.x, p.y - 4)];
      const l = Math.hypot(gx, gy) || 1;
      return { x: p.x, y: p.y, nx: -gx / l, ny: -gy / l, kind: 'natural' as ShoreKind, type: 'suburb' as DistrictType };
    });
    let turn = 0;
    for (let i = 1; i < stations.length; i++) turn += (stations[i].x - stations[i - 1].x) * stations[i].ny - (stations[i].y - stations[i - 1].y) * stations[i].nx;
    if (turn < 0) stations = stations.reverse();
    for (const st of stations) {
      const back = P(st, 0, 40);
      st.type = districtAt(t, city.districts, back.x, back.y).type;
      const near = P(st, 0, 10);
      const rise = site.heightAt(P(st, 0, 30).x, P(st, 0, 30).y);
      if (riverBankAt(t, st.x, st.y) < 16 || riverBankAt(t, near.x, near.y) < 10) st.kind = 'mouth';
      else if (rise > 4.5 || hillAt(t, back.x, back.y) > 0.45 || st.type === 'hills') st.kind = 'rocky';
      else if (st.type === 'industrial') st.kind = roadless(st, DECK.port + 4) && low(st, DECK.port) ? 'port' : 'natural';
      else if (st.type === 'beach') st.kind = 'beach';
      else if (st.type === 'suburb') st.kind = 'natural';
      else st.kind = roadless(st, DECK.urban + 4) && low(st, DECK.urban) ? 'urban' : 'natural';
    }
    // Short stretches take after the longer neighbour; a quay or promenade needs some length to be worth building.
    const runs = (): [number, number][] => {
      const list: [number, number][] = [];
      for (let i = 0; i < stations.length; ) {
        let j = i;
        while (j + 1 < stations.length && stations[j + 1].kind === stations[i].kind) j++;
        list.push([i, j]);
        i = j + 1;
      }
      return list;
    };
    for (let pass = 0; pass < 6; pass++) {
      const list = runs();
      let changed = false;
      list.forEach(([i, j], k) => {
        const kind = stations[i].kind;
        const min = kind === 'port' || kind === 'urban' ? 30 : kind === 'mouth' ? 0 : 15;
        if (j - i + 1 >= min || list.length < 2) return;
        const [prev, next] = [list[k - 1], list[k + 1]];
        const from = !next || (prev && prev[1] - prev[0] >= next[1] - next[0]) ? prev : next;
        let to = stations[from[0]].kind;
        if (to === 'port' || to === 'urban' || to === 'mouth') to = 'natural';
        if (to === kind) return;
        for (let q = i; q <= j; q++) stations[q].kind = to;
        changed = true;
      });
      if (!changed) break;
    }
    const coast = out.coasts.length;
    out.coasts.push(stations);
    for (const [i, j] of runs()) out.reaches.push({ kind: stations[i].kind, coast, from: i, to: j, length: (j - i) * 4 });
  }

  // --- Quays and promenades: a wall on the shore line, the ground behind it made up to its top, the water in front deepened ---
  const walled: { st: ShoreStation; reach: Reach }[] = [];
  for (const r of out.reaches) {
    if (r.kind !== 'port' && r.kind !== 'urban') continue;
    const stations = out.coasts[r.coast];
    const depth = DECK[r.kind];
    const pieces = Math.floor((r.to - r.from) / 4);
    for (let i = r.from + pieces * 4 + 1; i <= r.to; i++) stations[i].kind = 'natural';
    r.to = r.from + pieces * 4;
    r.length = pieces * 16;
    // The top clears the highest ground it has to cover.
    let top = r.kind === 'port' ? 0.9 : 0.6;
    for (let i = r.from; i <= r.to; i++) for (let d = 4; d <= depth; d += 4) top = Math.max(top, site.heightAt(P(stations[i], 0, d).x, P(stations[i], 0, d).y) + 0.05);
    r.top = top;
    const first = stations[r.from].type;
    r.wall = r.kind === 'port' ? 'waterfront/seawall-quay'
      : first === 'oldtown' ? 'waterfront/seawall-stone'
      : pick(['waterfront/seawall-concrete', 'waterfront/seawall-stone', 'waterfront/seawall-concrete', 'waterfront/seawall-concrete-old'], rnd(1, r.from));
    for (let i = r.from; i <= r.to; i++) walled.push({ st: stations[i], reach: r });
    for (let m = 0; m < pieces; m++) {
      const [p, q] = [stations[r.from + m * 4], stations[r.from + m * 4 + 4]];
      site.set(r.wall, 'seawall', p.x, p.y, top - WALL_TOP[r.wall], Math.atan2(q.y - p.y, q.x - p.x), { stretch: Math.hypot(q.x - p.x, q.y - p.y) / 16, afloat: true });
    }
    // The deck: paving from the wall back, with a kerb wall down to the ground behind it.
    const paving = r.kind === 'port' ? 'concrete/walk-plain' : r.wall === 'waterfront/seawall-stone' ? 'paving/setts-granite' : 'concrete/walk-exposed';
    const y = top - 0.02;
    const edge = (i: number, d: number, h = y): V3 => [P(stations[i], 0, d).x, h, P(stations[i], 0, d).y];
    for (let i = r.from; i < r.to; i++) {
      const [s0, s1] = [(i - r.from) * 4, (i - r.from + 1) * 4];
      b.quadUp(paving, edge(i, -0.2), edge(i + 1, -0.2), edge(i + 1, depth), edge(i, depth), 0, [[0, s0], [0, s1], [depth, s1], [depth, s0]]);
      const st = stations[i];
      b.quadFacing('site/seawall-concrete', edge(i, depth), edge(i + 1, depth), edge(i + 1, depth, y - 2.5), edge(i, depth, y - 2.5), [-st.nx, 0, -st.ny], [[s0, 0], [s1, 0], [s1, 2.5], [s0, 2.5]]);
    }
    for (const [i, sign] of [[r.from, -1], [r.to, 1]] as const) {
      const st = stations[i];
      b.quadFacing('site/seawall-concrete', edge(i, -0.2), edge(i, depth), edge(i, depth, y - 3), edge(i, -0.2, y - 3), [st.ny * sign, 0, -st.nx * sign], [[0, 0], [depth, 0], [depth, 3], [0, 3]]);
    }
    for (let i = r.from; i <= r.to; i++) for (let d = 0; d <= depth; d += 2) site.stampDisc(P(stations[i], 0, d).x, P(stations[i], 0, d).y, 2.6, USED, FREE);
  }
  // Every station by where it is, to find the one nearest a point.
  const BIN = 64;
  const bins = new Map<number, { st: ShoreStation; reach: Reach }[]>();
  for (const r of out.reaches)
    for (let i = r.from; i <= r.to; i++) {
      const st = out.coasts[r.coast][i];
      const key = Math.floor(st.x / BIN) * 4096 + Math.floor(st.y / BIN);
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key)!.push({ st, reach: r });
    }
  const nearest = (x: number, y: number, max: number): { st: ShoreStation; reach: Reach } | null => {
    let [best, bd] = [null as { st: ShoreStation; reach: Reach } | null, max];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++)
        for (const e of bins.get((Math.floor(x / BIN) + di) * 4096 + Math.floor(y / BIN) + dj) ?? []) {
          const d = Math.hypot(e.st.x - x, e.st.y - y);
          if (d < bd) [best, bd] = [e, d];
        }
    return best;
  };
  for (let j = 0; j < t.n; j++)
    for (let i = 0; i < t.n; i++) {
      const k = j * t.n + i;
      const sd = t.seaDist[k];
      const [x, y] = [i * t.cell, j * t.cell];
      const near = sd > -64 && sd < 64 ? nearest(x, y, 64) : null;
      const kind = near?.reach.kind;
      out.sand[k] = !near ? 1 - smooth(18, 34, sd) : kind === 'beach' ? 1 - smooth(26, 44, sd) : kind === 'natural' || kind === 'mouth' ? 1 - smooth(5, 13, sd) : 0;
      out.paved[k] = kind === 'port' ? 1 - smooth(34, 60, sd) : 0;
      const top = near?.reach.top;
      if (top === undefined || Math.hypot(near!.st.x - x, near!.st.y - y) > 34) continue;
      if (sd < 4) site.ground[k] = Math.min(site.ground[k], -3.5);
      else if (sd <= DECK[kind as 'port' | 'urban'] + 4 && site.all(x, y, 16, FREE, LOT, USED, WATER)) site.ground[k] = Math.max(site.ground[k], top);
    }

  // --- Furnishing ---
  const free = (x: number, y: number, r: number): boolean => site.all(x, y, r, FREE);
  /** Stands something on open ground and takes the ground for it. */
  const drop = (model: string, kind: SiteKind, p: Vec2, yaw: number, r: number, o: Partial<SiteItem> & { lift?: number } = {}): SiteItem | null => {
    if (!free(p.x, p.y, r)) return null;
    site.stampDisc(p.x, p.y, r, USED, FREE);
    return site.put(model, kind, p.x, p.y, yaw, o);
  };
  const onDeck = (model: string, kind: SiteKind, p: Vec2, yaw: number, top: number, o: Partial<SiteItem> = {}): SiteItem => site.put(model, kind, p.x, p.y, yaw, { h: top, ...o });
  const afloat = (model: string, kind: SiteKind, p: Vec2, yaw: number, o: Partial<SiteItem> = {}): SiteItem => site.put(model, kind, p.x, p.y, yaw, { h: WATER_Y, afloat: true, ...o });
  const out2sea = (st: ShoreStation): number => along({ x: st.nx, y: st.ny });
  const alongShore = (st: ShoreStation): number => facing({ x: st.nx, y: st.ny });
  /** A pier out from the shore; public ones keep 600 m from each other, the rest 90 m from any other. */
  const pier = (model: string, st: ShoreStation, root: number, h: number, isPublic: boolean, stretch = 1): boolean => {
    const p = P(st, 0, root);
    if (out.piers.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < (isPublic && q.public ? 600 : 90))) return false;
    const len = (model.includes('fishing') ? 38 : /wide|concrete$|lamps/.test(model) ? 30 : /narrow/.test(model) ? 18 : /derelict/.test(model) ? 20 : /float/.test(model) ? 12 : 24) * stretch;
    if (sea(st.x + st.nx * (len - root), st.y + st.ny * (len - root)) > -8) return false;
    site.set(model, 'pier', p.x, p.y, h, out2sea(st), { afloat: true, stretch: stretch === 1 ? undefined : stretch });
    out.piers.push({ x: p.x, y: p.y, yaw: out2sea(st), length: len, model, public: isPublic, street: (st as StreetEnd).street ?? null });
    return true;
  };

  // --- Streets that run down to the shore: a public pier carries the line of one straight on out to sea ---
  /** Where the line of a street, carried on past its last junction, meets the shore: a station there that looks out along the street. */
  interface StreetEnd extends ShoreStation {
    street: number;
    node: number;
    /** From the junction to the shore, and from the junction to the far edge of the road it meets, along the line of the street. */
    gap: number;
    kerb: number;
    rank: number;
  }
  const heads: StreetEnd[] = [];
  for (const node of city.graph.nodes) {
    const d0 = sea(node.x, node.y);
    if (!(d0 > 4 && d0 < 90)) continue;
    const arms = node.edges.map((id) => {
      const e = city.graph.edges[id];
      const pts = e.a === node.id ? e.points : [...e.points].reverse();
      // The way the street runs over its last stretch into the junction.
      const far = pointAt(pts, Math.min(30, polyLength(pts))).p;
      const len = Math.hypot(node.x - far.x, node.y - far.y) || 1;
      const lay = site.roads.sections[id] ? layout(site.roads.sections[id]) : null;
      return { e, x: (node.x - far.x) / len, y: (node.y - far.y) / len, len, half: lay ? Math.max(-lay.outer[0], lay.outer[1]) : 0 };
    });
    for (const arm of arms) {
      if (!isStreet(arm.e.cls) || arm.e.bridge || arm.len < 20) continue;
      // Nothing goes on ahead: the street ends here, or at the road along the shore.
      if (arms.some((o) => o !== arm && -(o.x * arm.x + o.y * arm.y) > 0.72)) continue;
      let left = false;
      for (let d = 2; d <= 90; d += 1) {
        const [x, y] = [node.x + arm.x * d, node.y + arm.y * d];
        if (sea(x, y) <= 0) {
          if (!left) break;
          const type = districtAt(t, city.districts, x, y).type;
          // The road along the shore lies across the line of the street: its far edge is where a walk to the pier starts.
          let kerb = 0;
          for (const o of arms) if (o !== arm) kerb = Math.max(kerb, o.half / Math.max(0.5, Math.abs(o.x * arm.y - o.y * arm.x)));
          heads.push({ x, y, nx: arm.x, ny: arm.y, kind: 'natural', type, street: arm.e.id, node: node.id, gap: d, kerb, rank: CLASS_RANK[arm.e.cls] });
          break;
        }
        const c = site.at(x, y);
        if (c === ROAD && !left) continue;
        if (c !== FREE && c !== USED) break;
        left = true;
      }
    }
  }
  /** The street ends that come down to a reach, best first: a main street, square to the shore, near the middle of the reach. */
  const ashore = (r: Reach): StreetEnd[] => {
    const stations = out.coasts[r.coast];
    const found: { h: StreetEnd; v: number }[] = [];
    for (const h of heads) {
      let [best, at] = [8, -1];
      for (let i = r.from + 2; i <= r.to - 2; i++) {
        const d = Math.hypot(stations[i].x - h.x, stations[i].y - h.y);
        if (d < best) [best, at] = [d, i];
      }
      if (at < 0) continue;
      const square = h.nx * stations[at].nx + h.ny * stations[at].ny;
      if (square < 0.8) continue;
      found.push({ h, v: h.rank * 40 - h.gap * 0.5 - (1 - square) * 250 - (Math.abs(at - (r.from + r.to) / 2) * 4) * 0.1 });
    }
    return found.sort((a, c) => c.v - a.v || a.h.street - c.h.street).map((f) => f.h);
  };
  // --- Lots laid out on the sand of a beach are given back to it: nothing is built between the street and the water there ---
  city.land.lots.forEach((lot, id) => {
    if (lot.use === 'OS') return;
    const c = { x: 0, y: 0 };
    for (const q of lot.poly) [c.x, c.y] = [c.x + q.x / lot.poly.length, c.y + q.y / lot.poly.length];
    const to = sea(c.x, c.y) < 46 ? nearest(c.x, c.y, 90) : null;
    if (to?.reach.kind !== 'beach') return;
    // Only on the beach's own side of the street: a lot across the road from the sand is an ordinary one.
    const far = Math.hypot(to.st.x - c.x, to.st.y - c.y);
    for (let d = 0; d < far; d += 2) if (site.at(c.x + ((to.st.x - c.x) * d) / far, c.y + ((to.st.y - c.y) * d) / far) === ROAD) return;
    out.sandLots.push(id);
  });
  site.release(out.sandLots);

  // --- The back of a beach along a street: a walk, a strip of palms and a low wall, the sand a step below, and ways down to it ---
  const WALK = 2.6;
  const BED = 1.7;
  const WALL = 0.35;
  const DROP = 0.9;
  interface FrontPost { p: Vec2; n: Vec2; top: number; s: number }
  const fronts: { edge: number; side: number; posts: FrontPost[]; nodes: [number, number] }[] = [];
  const paving = city.graph.edges.map((e) => {
    const line = site.roads.lines[e.id];
    if (!line) return null;
    const lay = layout(site.roads.sections[e.id]);
    return { pts: line.map((q) => ({ x: q[0], y: q[2] })), half: Math.max(-lay.outer[0], lay.outer[1]) };
  });
  /** Whether the pavement of one of the given streets covers a point. The ground taken for a junction is rounder than what is paved. */
  const paved = (x: number, y: number, edges: number[]): boolean =>
    edges.some((id) => {
      const pv = paving[id];
      if (!pv) return false;
      for (let i = 0; i + 1 < pv.pts.length; i++) if (pointSeg(x, y, pv.pts[i], pv.pts[i + 1]).d < pv.half + 0.8) return true;
      return false;
    });
  city.graph.edges.forEach((e) => {
    const line = site.roads.lines[e.id];
    if (!line || !isStreet(e.cls) || e.bridge) return;
    const pts = line.map((q) => ({ x: q[0], y: q[2] }));
    const total = polyLength(pts);
    const mid = pointAt(pts, total / 2).p;
    if (Math.abs(sea(mid.x, mid.y)) > 120 + total / 2) return;
    const lay = layout(site.roads.sections[e.id]);
    const others = [e.a, e.b].flatMap((n) => city.graph.nodes[n].edges.filter((id) => id !== e.id));
    const open = (q: Vec2): boolean => site.at(q.x, q.y) === FREE || (site.at(q.x, q.y) === ROAD && Math.min(Math.hypot(q.x - pts[0].x, q.y - pts[0].y), Math.hypot(q.x - pts[pts.length - 1].x, q.y - pts[pts.length - 1].y)) < 40 && !paved(q.x, q.y, others));
    for (const side of [1, -1]) {
      const off = Math.abs(side > 0 ? lay.outer[1] : lay.outer[0]);
      const kerb = side > 0 ? lay.outerY[1] : lay.outerY[0];
      let run: FrontPost[] = [];
      const flush = (): void => {
        // A run that reaches the end of its street may go on round the junction there.
        if (run.length >= 4) fronts.push({ edge: e.id, side, posts: run, nodes: [run[0].s < 1 ? e.a : -1, run[run.length - 1].s > total - 1 ? e.b : -1] });
        run = [];
      };
      const step = total / Math.max(1, Math.round(total / 2));
      for (let d = 0; d <= total + 0.01; d += step) {
        const { p, tan, seg } = pointAt(pts, d);
        const n = { x: -tan.y * side, y: tan.x * side };
        const at = (o: number): Vec2 => ({ x: p.x + n.x * (off + o), y: p.y + n.y * (off + o) });
        const near = nearest(at(1).x, at(1).y, 90);
        const segLen = Math.hypot(pts[seg + 1].x - pts[seg].x, pts[seg + 1].y - pts[seg].y) || 1;
        const u = Math.hypot(p.x - pts[seg].x, p.y - pts[seg].y) / segLen;
        const top = line[seg][1] + (line[seg + 1][1] - line[seg][1]) * u + kerb;
        // The far side of the road is open sand that faces the sea, with room for the strip and beach beyond it.
        const ok = near?.reach.kind === 'beach' && n.x * near.st.nx + n.y * near.st.ny > 0.35 && top > WATER_Y + 1 &&
          [0.6, 2, 4, 6, 8].every((o) => open(at(o))) && site.heightAt(at(9).x, at(9).y) > WATER_Y + 0.6;
        if (ok) run.push({ p: at(0), n, top, s: d });
        else flush();
      }
      flush();
    }
  });
  // Runs on the two sides of a junction that the street passes straight through are one front, carried along the far side of the junction.
  for (let again = true; again; ) {
    again = false;
    search: for (const f of fronts)
      for (const g of fronts) {
        if (f === g) continue;
        const node = f.nodes.find((n) => n >= 0 && g.nodes.includes(n));
        if (node === undefined) continue;
        if (f.nodes[1] !== node) [f.posts, f.nodes] = [f.posts.reverse(), [f.nodes[1], f.nodes[0]]];
        if (g.nodes[0] !== node) [g.posts, g.nodes] = [g.posts.reverse(), [g.nodes[1], g.nodes[0]]];
        const [q, r] = [f.posts[f.posts.length - 1], g.posts[0]];
        const span = Math.hypot(r.p.x - q.p.x, r.p.y - q.p.y);
        const arms = city.graph.nodes[node].edges;
        const across: FrontPost[] = [];
        let clear = span < 90 && q.n.x * r.n.x + q.n.y * r.n.y > 0.5;
        for (let k = 1, m = Math.max(1, Math.round(span / 2)); k < m && clear; k++) {
          const u = k / m;
          const nl = Math.hypot(q.n.x + (r.n.x - q.n.x) * u, q.n.y + (r.n.y - q.n.y) * u) || 1;
          const post = { p: { x: q.p.x + (r.p.x - q.p.x) * u, y: q.p.y + (r.p.y - q.p.y) * u }, n: { x: (q.n.x + (r.n.x - q.n.x) * u) / nl, y: (q.n.y + (r.n.y - q.n.y) * u) / nl }, top: q.top + (r.top - q.top) * u, s: 0 };
          clear = [0.8, 2, 4, 6, 8].every((o) => {
            const [x, y] = [post.p.x + post.n.x * o, post.p.y + post.n.y * o];
            return (site.at(x, y) === FREE || site.at(x, y) === ROAD) && !paved(x, y, arms);
          });
          across.push(post);
        }
        f.nodes[1] = g.nodes[0] = -1;
        if (clear) {
          f.posts.push(...across, ...g.posts);
          f.nodes[1] = g.nodes[1];
          fronts.splice(fronts.indexOf(g), 1);
        }
        again = true;
        break search;
      }
  }
  // A front that comes to a junction alone goes on along its far side as far as the sand is open.
  for (const f of fronts)
    for (const end of [0, 1]) {
      const node = f.nodes[end];
      if (node < 0) continue;
      const arms = city.graph.nodes[node].edges;
      const [q, prev] = end ? [f.posts[f.posts.length - 1], f.posts[f.posts.length - 2]] : [f.posts[0], f.posts[1]];
      const l = Math.hypot(q.p.x - prev.p.x, q.p.y - prev.p.y) || 1;
      const [dx, dy] = [(q.p.x - prev.p.x) / l, (q.p.y - prev.p.y) / l];
      for (let d = 2; d <= 46; d += 2) {
        const post = { p: { x: q.p.x + dx * d, y: q.p.y + dy * d }, n: q.n, top: q.top, s: 0 };
        const clear = [0.8, 2, 4, 6, 8].every((o) => {
          const [x, y] = [post.p.x + q.n.x * o, post.p.y + q.n.y * o];
          return (site.at(x, y) === FREE || site.at(x, y) === ROAD) && !paved(x, y, arms);
        });
        if (!clear || Math.abs(site.heightAt(post.p.x, post.p.y) - q.top) > 0.6) break;
        if (end) f.posts.push(post);
        else f.posts.unshift(post);
      }
    }
  for (let k = fronts.length - 1; k >= 0; k--) if (fronts[k].posts.length < 9) fronts.splice(k, 1);
  // On the outside of a bend the posts spread apart; fill in so the strip stays evenly sampled.
  for (const f of fronts)
    for (let i = f.posts.length - 1; i > 0; i--) {
      const [a, b] = [f.posts[i - 1], f.posts[i]];
      if (Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y) <= 3) continue;
      const nl = Math.hypot(a.n.x + b.n.x, a.n.y + b.n.y) || 1;
      f.posts.splice(i, 0, { p: { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2 }, n: { x: (a.n.x + b.n.x) / nl, y: (a.n.y + b.n.y) / nl }, top: (a.top + b.top) / 2, s: 0 });
    }
  for (const f of fronts) f.posts.forEach((q, i) => (q.s = i ? f.posts[i - 1].s + Math.hypot(q.p.x - f.posts[i - 1].p.x, q.p.y - f.posts[i - 1].p.y) : 0));
  // The sand beyond the wall lies lower than the street, easing back to the street's own level at the ends of the wall.
  for (const f of fronts)
    f.posts.forEach((q, i) => {
      const ease = smooth(0, 5, Math.min(i, f.posts.length - 1 - i));
      for (let d = WALK + BED + 2; d <= 34; d += 4) {
        const [x, y] = [q.p.x + q.n.x * d, q.p.y + q.n.y * d];
        const [ci, cj] = [Math.round(x / t.cell), Math.round(y / t.cell)];
        if (ci < 0 || cj < 0 || ci >= t.n || cj >= t.n || !site.all(ci * t.cell, cj * t.cell, 6, FREE, USED, WATER)) continue;
        const k = cj * t.n + ci;
        site.ground[k] = Math.min(site.ground[k], Math.max(q.top - DROP * ease * smooth(0, 6, d - WALK - BED), WATER_Y + 0.45));
      }
    });
  for (const f of fronts) {
    const palms = ['plant/palm-coconut', 'plant/palm-date', 'plant/palm-fan', 'plant/palm-queen'];
    const palm = pick(palms, rnd(120, f.edge));
    const under = ['plant/shrub-hibiscus-red', 'plant/shrub-hibiscus-pink', 'plant/grass-fountain', 'plant/shrub-plumbago', 'plant/grass-fescue'];
    const at = (q: FrontPost, o: number, h = q.top): V3 => [q.p.x + q.n.x * o, h, q.p.y + q.n.y * o];
    /** A way through the wall: where a street's line runs on to the beach, and every 40 m or so besides. */
    const way = (q: FrontPost, i: number): boolean =>
      heads.some((h) => {
        const [dx, dy] = [q.p.x - h.x, q.p.y - h.y];
        return Math.abs(dx * h.ny - dy * h.nx) < 3.2 && Math.hypot(dx, dy) < h.gap + 10;
      }) || (i > 4 && i < f.posts.length - 5 && Math.floor((q.s + rnd(121, f.edge) * 40) / 2) % 22 < 2);
    const wall: Vec2[] = [];
    const steps: Vec2[] = [];
    for (let i = 0; i + 1 < f.posts.length; i++) {
      const [q, r] = [f.posts[i], f.posts[i + 1]];
      const [s0, s1] = [q.s, r.s];
      const uv = (a: number, c: number): [number, number][] => [[a, s0], [c, s0], [c, s1], [a, s1]];
      b.quadUp('paving/slabs-sandstone', at(q, -0.05, q.top + 0.015), at(q, WALK, q.top + 0.015), at(r, WALK, r.top + 0.015), at(r, -0.05, r.top + 0.015), 0, uv(0, WALK));
      const open = way(q, i) && way(r, i + 1);
      if (open) {
        // A ramp of boards from the walk down on to the sand.
        const foot = (x: FrontPost): V3 => at(x, WALK + BED + WALL + 5, site.heightAt(x.p.x + x.n.x * (WALK + BED + WALL + 5), x.p.y + x.n.y * (WALK + BED + WALL + 5)) + 0.1);
        b.quadUp('paving/boardwalk', at(q, WALK), foot(q), foot(r), at(r, WALK), 0, [[0, s0], [7, s0], [7, s1], [0, s1]]);
        if (!way(f.posts[Math.max(0, i - 1)], i - 1)) steps.push({ x: q.p.x + q.n.x * (WALK + BED), y: q.p.y + q.n.y * (WALK + BED) });
      } else {
        b.quadUp('ground/mulch', at(q, WALK), at(q, WALK + BED), at(r, WALK + BED), at(r, WALK), 0, uv(0, BED));
        const [w0, w1] = [WALK + BED, WALK + BED + WALL];
        const cap = (x: FrontPost, o: number): V3 => at(x, o, x.top + 0.45);
        b.quadUp('site/retaining-concrete', cap(q, w0), cap(q, w1), cap(r, w1), cap(r, w0), 0, uv(0, WALL));
        b.quadFacing('site/retaining-concrete', cap(q, w0), cap(r, w0), at(r, w0), at(q, w0), [-q.n.x, 0, -q.n.y], [[s0, 0], [s1, 0], [s1, 0.45], [s0, 0.45]]);
        b.quadFacing('site/retaining-concrete', cap(q, w1), cap(r, w1), at(r, w1, r.top - 2.4), at(q, w1, q.top - 2.4), [q.n.x, 0, q.n.y], [[s0, 0], [s1, 0], [s1, 2.85], [s0, 2.85]]);
        // The wall is closed off where a way through begins or the run ends.
        for (const [x, o, edge] of [[q, r, i === 0 || way(f.posts[i - 1], i - 1)], [r, q, i + 2 === f.posts.length || way(f.posts[i + 2], i + 2)]] as const)
          if (edge) {
            b.quadFacing('site/retaining-concrete', cap(x, WALK), cap(x, w1), at(x, w1, x.top - 2.4), at(x, WALK, x.top - 2.4), [x.p.x - o.p.x, 0, x.p.y - o.p.y], [[0, 0], [BED + WALL, 0], [BED + WALL, 2.85], [0, 2.85]]);
          }
        wall.push({ x: q.p.x + q.n.x * w0, y: q.p.y + q.n.y * w0 });
        // Palms down the bed, a bench between them here and there, low planting under them.
        const yaw = facing(q.n);
        const slot = Math.round(q.s / 2);
        const bed = at(q, WALK + BED / 2);
        // Round a junction the bed is left bare: sight lines, and the ground there is the junction's.
        if (site.at(bed[0], bed[2]) === ROAD) {
          // No more than the bare bed.
        } else if (slot % 5 === 0) {
          if (rnd(122, f.edge, slot) < 0.22) site.put(pick(['furniture/bench-flat', 'furniture/bench-park', 'furniture/bench-flat-dark-long'], rnd(123, f.edge)), 'bench', bed[0], bed[2], yaw, { h: q.top });
          else site.put(rnd(124, f.edge, slot) < 0.8 ? palm : pick(palms, rnd(125, f.edge, slot)), 'tree', bed[0], bed[2], rnd(126, f.edge, slot) * 6.3, { h: q.top, scale: 0.85 + rnd(127, f.edge, slot) * 0.3 });
        } else if (rnd(128, f.edge, slot) < 0.55) site.put(pick(under, rnd(129, f.edge, slot)), 'plant', bed[0], bed[2], rnd(130, f.edge, slot) * 6.3, { h: q.top, scale: 0.7 + rnd(131, f.edge, slot) * 0.4 });
      }
      // A ramp reaches further out over the sand than the bed and wall do; nothing is set down on its boards.
      for (const o of open ? [1.2, 3.4, 5.6, 7.8] : [1.2, 3.4]) site.stampDisc(q.p.x + q.n.x * o, q.p.y + q.n.y * o, 2.2, USED, FREE);
    }
    out.fronts.push({ edge: f.edge, side: f.side, kerb: f.posts.map((q) => q.p), top: f.posts.map((q) => q.top), wall, steps });
  }

  /** A public pier on the line of a street if one comes down to the reach, else in the middle of it. Returns the station it stands at. */
  const publicPier = (model: string, r: Reach, mid: ShoreStation, root: number, h: number, stretch = 1): ShoreStation | null => {
    for (const st of [...ashore(r), mid]) {
      // The shore line is the mean one; on a flat beach the water's edge lies well out from it. The pier starts from the water.
      let wet = 0;
      while (wet > -40 && site.heightAt(P(st, 0, wet).x, P(st, 0, wet).y) > WATER_Y + 0.25) wet -= 1;
      const from = { ...st, x: P(st, 0, wet).x, y: P(st, 0, wet).y, ...('gap' in st ? { gap: (st as StreetEnd).gap - wet } : {}) };
      if (pier(model, from, root, h, true, stretch)) return from;
    }
    return null;
  };

  // The lighthouse: on the point that stands furthest out to sea from the shore either side of it.
  {
    const cands: { st: ShoreStation; r: Reach; v: number }[] = [];
    for (const r of out.reaches) {
      if (r.kind === 'port' || r.kind === 'mouth') continue;
      const stations = out.coasts[r.coast];
      const v = (i: number): number => -(stations[i].x * t.inland.x + stations[i].y * t.inland.y);
      for (let i = r.from + 4; i <= r.to - 4; i += 3) {
        let [sum, n] = [0, 0];
        for (let q = Math.max(0, i - 75); q <= Math.min(stations.length - 1, i + 75); q += 5) {
          sum += v(q);
          n++;
        }
        cands.push({ st: stations[i], r, v: v(i) - sum / n + (r.kind === 'rocky' ? 12 : 0) });
      }
    }
    cands.sort((a, c) => c.v - a.v);
    for (const { st, r } of cands) {
      const p = P(st, 0, r.top !== undefined ? 8 : 13);
      const model = r.kind === 'rocky' ? pick(['waterfront/lighthouse-stone', 'waterfront/lighthouse-white', 'waterfront/lighthouse-black-white'], rnd(2))
        : pick(['waterfront/lighthouse-red-white', 'waterfront/lighthouse-white', 'waterfront/lighthouse-octagonal', 'waterfront/lighthouse-white-red-top', 'waterfront/lighthouse-brick'], rnd(2));
      if (r.top !== undefined) onDeck(model, 'lighthouse', p, alongShore(st) + Math.PI, r.top);
      else if (!drop(model, 'lighthouse', p, alongShore(st) + Math.PI, 6.5)) continue;
      out.lighthouse = p;
      break;
    }
  }

  const ROCKS = ['granite', 'sandstone', 'basalt', 'mossy', 'wet'];
  let n = 0;
  for (const r of out.reaches) {
    const stations = out.coasts[r.coast];
    const every = (metres: number, start: number, fn: (st: ShoreStation, i: number) => void): void => {
      for (let i = r.from + Math.round(start / 4); i <= r.to - 2; i += Math.max(1, Math.round(metres / 4))) fn(stations[i], i);
    };
    const mid = stations[Math.floor((r.from + r.to) / 2)];
    const rock = pick(ROCKS, rnd(3, r.from));
    /** The station nearest station i (within 40 m) and the depth of beach behind it where a circle of open ground is to be had. */
    const seek = (i: number, depths: number[], rad: number): { st: ShoreStation; d: number } | null => {
      for (let k = 0; k <= 10; k++)
        for (const q of k ? [i + k, i - k] : [i]) {
          if (q < r.from || q > r.to) continue;
          for (const d of depths) if (free(P(stations[q], 0, d).x, P(stations[q], 0, d).y, rad)) return { st: stations[q], d };
        }
      return null;
    };
    // The ends of a wall run into rocks.
    if (r.top !== undefined)
      for (const [i, s] of [[r.from, -1], [r.to, 1]] as const)
        for (let q = 0; q < 3; q++) {
          const p = P(stations[i], s * (2 + q * 4), -2 + q * 3);
          site.put(`waterfront/rocks-${rock}`, 'rock', p.x, p.y, rnd(4, i, q) * 6.3, { h: WATER_Y - 0.1 + q * 0.3, scale: 1.5, afloat: true });
        }
    if (r.kind === 'beach') {
      const resort = r.length > 500;
      // One pleasure pier on a long beach, straight out from the street that comes down to it, on a ramp of boardwalk up from the sand.
      // It goes in first: the rest of the beach is laid out round it.
      const at = resort ? publicPier('waterfront/pier-boardwalk-wide', r, mid, 6, WATER_Y - 0.6, 1.6) : null;
      if (at) {
        const deck = WATER_Y - 0.6 + 2.2;
        const open = (d: number): boolean => site.all(P(at, 0, d).x, P(at, 0, d).y, 4.5, FREE, USED);
        // The boardwalk runs back over the sand to whatever street or lot backs the beach.
        let back = 10;
        while (back < 96 && open(back + 2)) back += 2;
        const foot = Math.min(back, 16);
        const [a, c] = [P(at, 0, 6), P(at, 0, foot)];
        const g = site.heightAt(c.x, c.y) + 0.1;
        const corner = (p: Vec2, sd: number, h: number): V3 => [p.x + at.ny * sd * 4, h, p.y - at.nx * sd * 4];
        b.quadUp('paving/boardwalk', corner(a, -1, deck), corner(a, 1, deck), corner(c, 1, g), corner(c, -1, g), 0, [[0, 0], [8, 0], [8, foot - 6], [0, foot - 6]]);
        for (const sd of [-1, 1]) b.quadFacing('paving/boardwalk', corner(a, sd, deck), corner(c, sd, g), corner(c, sd, g - 1.5), corner(a, sd, deck - 2.5), [at.ny * sd, 0, -at.nx * sd], [[0, 0], [foot - 6, 0], [foot - 6, 1.5], [0, 2.5]]);
        if (back > foot) {
          const pts: Vec2[] = [];
          for (let d = foot; d <= back + 1; d += 2) pts.push(P(at, 0, d));
          site.ribbon(b, 'paving/boardwalk', pts, 8, 0.1);
        }
        for (let d = 6; d <= back; d += 2) site.stampDisc(P(at, 0, d).x, P(at, 0, d).y, 5, USED, FREE);
        // Where the full width has no room, a narrower walk goes on to the edge of the street.
        let end = back + 1;
        while (end < 110 && site.all(P(at, 0, end + 1).x, P(at, 0, end + 1).y, 1, FREE, USED)) end += 1;
        // The ground taken for a junction is rounder than its pavement: the walk goes on to the kerb itself.
        const street = at as Partial<StreetEnd>;
        if (street.gap !== undefined && street.gap - street.kerb! - end < 14) end = Math.max(end, street.gap - street.kerb! - 0.4);
        if (end > back + 2) {
          const pts: Vec2[] = [];
          for (let d = back; d < end; d += 1) pts.push(P(at, 0, d));
          pts.push(P(at, 0, end));
          site.ribbon(b, 'paving/boardwalk', pts, 4, 0.11);
          for (const p of pts) site.stampDisc(p.x, p.y, 2.5, USED, FREE);
        }
      }
      every(220, 110, (at0, i) => {
        const found = seek(i, [15, 12, 18, 10], 4);
        if (!found) return;
        const st = found.st;
        const p = P(st, 0, found.d);
        void at0;
        if (!drop(pick(['waterfront/lifeguard-tower-blue', 'waterfront/lifeguard-tower-white', 'waterfront/lifeguard-tower-yellow', 'waterfront/lifeguard-tower-red'], rnd(5, r.from)), 'beach', p, alongShore(st), 4)) return;
        out.towers.push(p);
        drop(pick(['waterfront/beach-flag-green', 'waterfront/beach-flag-yellow', 'waterfront/beach-flag-red'], rnd(6, i)), 'beach', P(st, 5, 11), alongShore(st), 0.6);
        drop('waterfront/beach-sign-rip', 'sign', P(st, -6, 20), alongShore(st), 0.6);
        // The swimming area in front of the tower, roped off.
        for (let a = -60; a < 60; a += 24) {
          const q = P(st, a, -42);
          if (sea(q.x, q.y) < -20) site.set('waterfront/buoy-swim-line', 'buoy', q.x, q.y, WATER_Y, alongShore(st), { afloat: true });
        }
      });
      every(360, 200, (st) => {
        const p = P(st, 0, 5);
        site.set('waterfront/groyne-rock', 'rock', p.x, p.y, WATER_Y + 0.25, out2sea(st), { afloat: true });
      });
      every(resort ? 26 : 44, 14, (st, i) => {
        if (rnd(7, i) < 0.35) return;
        const count = 1 + Math.floor(rnd(8, i) * (resort ? 5 : 3));
        const kinds = ['waterfront/umbrella-stripe-blue', 'waterfront/umbrella-stripe-yellow', 'waterfront/umbrella-stripe-red', 'waterfront/umbrella-white', 'waterfront/umbrella-red', 'waterfront/umbrella-thatch'];
        const own = pick(kinds, rnd(9, Math.floor(i / 20)));
        for (let q = 0; q < count; q++) {
          const p = P(st, (rnd(10, i, q) - 0.5) * 16, 9 + rnd(11, i, q) * 11);
          if (!drop(rnd(12, i, q) < 0.7 ? own : pick(kinds, rnd(13, i, q)), 'beach', p, rnd(14, i, q) * 6.3, 1.5)) continue;
          for (const sd of [-1, 1]) {
            if (rnd(15, i, q, sd) < 0.3) continue;
            const l = { x: p.x + st.ny * sd * 1.5, y: p.y - st.nx * sd * 1.5 };
            site.put('waterfront/lounger', 'beach', l.x, l.y, out2sea(st) + (rnd(16, i, q, sd) - 0.5) * 0.3, {});
          }
        }
      });
      every(520, 300, (st, i) => {
        if (free(P(st, -6, 22).x, P(st, -6, 22).y, 6) && free(P(st, 6, 22).x, P(st, 6, 22).y, 6)) {
          site.stampDisc(P(st, -6, 22).x, P(st, -6, 22).y, 7.5, USED, FREE);
          site.stampDisc(P(st, 6, 22).x, P(st, 6, 22).y, 7.5, USED, FREE);
          site.put(rnd(17, i) < 0.7 ? 'waterfront/volleyball' : 'waterfront/volleyball-old', 'beach', P(st, 0, 22).x, P(st, 0, 22).y, alongShore(st), {});
        }
      });
      every(310, 150, (_, i) => {
        const found = seek(i, [17, 13, 10], 4.5);
        if (found) for (const a of [-3, 3]) drop('waterfront/fire-pit', 'beach', P(found.st, a, found.d), 0, 1.4);
      });
      // Ways down to the sand: a boardwalk from the back of the beach, with a shower and the rules at its foot.
      every(170, 60, (st, i) => {
        let top = 0;
        for (let d = 26; d <= 70; d += 2) {
          const c = site.at(P(st, 0, d).x, P(st, 0, d).y);
          if (c !== FREE) break;
          top = d;
        }
        if (top < 26) return;
        const pts = [];
        for (let d = 13; d <= top; d += 3) pts.push(P(st, 0, d));
        site.ribbon(b, 'paving/boardwalk', pts, 2.6, 0.12);
        for (const p of pts) site.stampDisc(p.x, p.y, 2, USED, FREE);
        drop(rnd(18, i) < 0.5 ? 'waterfront/shower-quad' : 'waterfront/shower-single', 'beach', P(st, 4.5, 24), alongShore(st), 1.4);
        drop('waterfront/beach-sign-rules', 'sign', P(st, -2.6, 22), alongShore(st), 0.7);
        drop('furniture/bin-drum', 'bin', P(st, -2.6, 25), alongShore(st), 0.6);
        if (resort && rnd(19, i) < 0.6) drop('waterfront/surfboard-rack', 'beach', P(st, -6, 27), alongShore(st), 2);
      });
      // Dunes along the back of the beach, with sand fence between some of them.
      every(24, 10, (st, i) => {
        const u = rnd(20, i);
        if (u < 0.3) return;
        const p = P(st, (rnd(21, i) - 0.5) * 8, 31 + rnd(22, i) * 7);
        if (u > 0.55) drop(pick(['waterfront/dune-dry', 'waterfront/dune-white', 'waterfront/dune-ripples', 'waterfront/dune-wrack'], rnd(23, i)), 'beach', p, alongShore(st) + (rnd(24, i) - 0.5), 6);
        else if (free(p.x, p.y, 5)) site.panels('boundary/sand-fence', 'fence', [P(st, -6, 29), P(st, 6, 29)]);
      });
      if (resort) every(240, 90, (st, i) => {
        const p = P(st, 0, 42);
        if (free(P(st, -5, 42).x, P(st, -5, 42).y, 3) && free(P(st, 5, 42).x, P(st, 5, 42).y, 3)) {
          site.stampDisc(P(st, -4, 42).x, P(st, -4, 42).y, 4, USED, FREE);
          site.stampDisc(P(st, 4, 42).x, P(st, 4, 42).y, 4, USED, FREE);
          site.put('waterfront/beach-huts-row', 'beach', p.x, p.y, alongShore(st), {});
        } else if (rnd(25, i) < 0.5) drop('waterfront/beach-cabana', 'beach', P(st, 0, 26), alongShore(st), 2.4);
      });
      // --- A beach in use: the line the tide left, wheel tracks, footprints, and what lies about on the sand ---
      /** How far up the beach from a station the sand stands this high above the water. */
      const upTo = (st: ShoreStation, above: number): number => {
        for (let d = -8; d <= 40; d += 0.5) if (site.heightAt(P(st, 0, d).x, P(st, 0, d).y) >= WATER_Y + above) return d;
        return 40;
      };
      const sand = (p: Vec2): boolean => site.at(p.x, p.y) === FREE || site.at(p.x, p.y) === USED;
      /** Lays a mark along the beach at a depth that follows the stations, in the stretches `keep` allows and the sand is open. */
      const lay = (tex: string, w: number, depth: (st: ShoreStation, i: number) => number, keep: (i: number) => boolean): void => {
        let pts: Vec2[] = [];
        const flush = (): void => {
          if (pts.length >= 4) {
            site.ribbon(b, tex, pts, w, 0.06);
            out.marks.push({ kind: tex, pts });
          }
          pts = [];
        };
        let d = depth(stations[r.from], r.from);
        for (let i = r.from; i < r.to; i++) {
          // Eased from station to station, so the line bends rather than jumps.
          d += (depth(stations[i], i) - d) * 0.35;
          for (const u of [0, 0.5]) {
            const [a, c] = [P(stations[i], 0, d), P(stations[i + 1], 0, d)];
            const p = { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u };
            // Round a point of the shore the stations fan apart: the line breaks rather than leaps.
            if (pts.length && Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) > 5) flush();
            if (keep(i) && d < 26 && sand(p) && sea(p.x, p.y) > -6) pts.push(p);
            else flush();
          }
        }
        flush();
      };
      // Weed in broken lengths where the last high water turned; wheel tracks of the patrol along the dry sand.
      lay('site/sand-weed', 2, (st, i) => upTo(st, 0.95) + (rnd(40, Math.floor(i / 3)) - 0.5) * 1.6, (i) => rnd(41, Math.floor(i / 7)) < 0.62);
      if (r.length > 200) lay('site/sand-tyres', 2.6, (st) => upTo(st, 1.1) + 5.5, (i) => rnd(42, Math.floor(i / 40)) < 0.8);
      // Footprints from every way down to the water, and round the lifeguards' towers.
      every(170, 60, (st) => {
        const pts: Vec2[] = [];
        for (let d = upTo(st, 0.35); d <= 14 && sand(P(st, 0, d)); d += 2) pts.push(P(st, 0, d));
        if (pts.length < 3) return;
        site.ribbon(b, 'site/sand-trail', pts, 2.4, 0.07);
        out.marks.push({ kind: 'site/sand-trail', pts });
      });
      every(resort ? 7 : 11, 5, (st, i) => {
        const u = rnd(43, i);
        const tide = upTo(st, 0.95);
        const yaw = alongShore(st) + (rnd(44, i) - 0.5) * 1.2;
        const a = (rnd(45, i) - 0.5) * 6;
        if (u < 0.16) drop(pick(['waterfront/driftwood-log', 'waterfront/driftwood-branch', 'waterfront/driftwood-branch', 'waterfront/driftwood-pile'], rnd(46, i)), 'beach', P(st, a, tide + rnd(47, i) * 3), yaw, 1.3);
        else if (u < 0.28) drop('waterfront/seaweed-heap', 'beach', P(st, a, tide + (rnd(47, i) - 0.5)), yaw, 1.2);
        else if (u < 0.36) drop('waterfront/sandcastle', 'beach', P(st, a, upTo(st, 0.6) + 1 + rnd(47, i) * 2), rnd(48, i) * 6.3, 1.2);
        else if (u < (resort ? 0.72 : 0.56)) {
          const kinds = ['waterfront/beach-towel-blue', 'waterfront/beach-towel-red', 'waterfront/beach-towel-yellow', 'waterfront/beach-towel-set', 'waterfront/beach-towel-set'];
          drop(pick(kinds, rnd(46, i)), 'beach', P(st, a, tide + 3 + rnd(47, i) * 12), out2sea(st) + (rnd(48, i) - 0.5) * 0.9, 1.3);
        }
      });
      // Marram on the dunes and the back of the beach, in clumps.
      every(6, 3, (st, i) => {
        if (rnd(50, i) < 0.35) return;
        const c = P(st, (rnd(51, i) - 0.5) * 6, 27 + rnd(52, i) * 14);
        for (let q = 0; q < 2 + Math.floor(rnd(53, i) * 4); q++) {
          const p = { x: c.x + (rnd(54, i, q) - 0.5) * 3.4, y: c.y + (rnd(55, i, q) - 0.5) * 3.4 };
          if (site.at(p.x, p.y) !== FREE || sea(p.x, p.y) < 14) continue;
          site.put(pick(['plant/grass-fescue', 'plant/grass-tuft-dry', 'plant/grass-tuft-dry', 'plant/grass-fountain'], rnd(56, i, q)), 'plant', p.x, p.y, rnd(57, i, q) * 6.3, { scale: 0.8 + rnd(58, i, q) * 0.7 });
        }
      });
    } else if (r.kind === 'port') {
      const top = r.top!;
      every(18, 4, (st, i) => onDeck(pick(['waterfront/bollard-tee', 'waterfront/bollard-horn', 'waterfront/bollard-double'], rnd(30, r.from)), 'port', P(st, 0, 0.9), alongShore(st), top, i % 3 ? {} : {}));
      every(64, 30, (st) => onDeck('furniture/light-flood-6', 'light', P(st, 0, 21.5), alongShore(st), top));
      const crane = pick(['waterfront/crane-sts-red', 'waterfront/crane-sts-blue', 'waterfront/crane-sts-yellow', 'waterfront/crane-sts-white'], rnd(31, r.from));
      let cranes = 0;
      every(76, 44, (st, i) => {
        if (cranes >= 5 || r.to - i < 8) return;
        cranes++;
        site.set(rnd(32, i) < 0.8 ? crane : 'waterfront/crane-sts-yellow', 'port', st.x, st.y, top + 1.4, alongShore(st), {});
      });
      // Boxes waiting on the quay, and the stacks of the yard behind it.
      every(14, 8, (st, i) => {
        if (rnd(33, i) < 0.45) return;
        const colours = ['red', 'blue', 'green', 'orange', 'grey', 'white', 'yellow', 'brown', 'teal', 'maroon'];
        onDeck(rnd(34, i) < 0.25 ? 'waterfront/container-stack-3' : `waterfront/container-20-${pick(colours, rnd(35, i))}`, 'port', P(st, 0, 13 + rnd(36, i) * 6), alongShore(st) + (rnd(37, i) < 0.8 ? 0 : Math.PI / 2), top);
      });
      for (const d of [36, 52, 68])
        every(28, 16, (st, i) => {
          const model = pick(['waterfront/container-stack-yard', 'waterfront/container-stack-row', 'waterfront/container-stack-yard-40', 'waterfront/container-stack-small'], rnd(38, i, d));
          const p = P(st, 0, d);
          if (!free(P(st, -8, d).x, P(st, -8, d).y, 6.5) || !free(P(st, 8, d).x, P(st, 8, d).y, 6.5)) return;
          site.stampDisc(P(st, -7, d).x, P(st, -7, d).y, 8, USED, FREE);
          site.stampDisc(P(st, 7, d).x, P(st, 7, d).y, 8, USED, FREE);
          site.lay(model, 'port', p.x, p.y, alongShore(st), {});
          if (rnd(39, i, d) < 0.12) site.lay(rnd(40, i) < 0.5 ? 'waterfront/crane-rtg-yellow' : 'waterfront/crane-rtg-red', 'port', p.x, p.y, alongShore(st), {});
        });
      every(90, 60, (st, i) => {
        const p = P(st, 0, -4.2);
        afloat(pick(['waterfront/boat-trawler-blue', 'waterfront/boat-trawler-red', 'waterfront/boat-trawler-green'], rnd(41, i)), 'boat', p, alongShore(st) + (rnd(42, i) < 0.5 ? 0 : Math.PI));
      });
      // A breakwater off the quay, with lights at its heads and the channel marked past each.
      if (r.length >= 200) {
        const len = Math.min(5, Math.floor(r.length / 60));
        const c = P(mid, 0, -120);
        if (sea(c.x, c.y) < -70) {
          const yaw = alongShore(mid);
          for (let q = 0; q < len; q++) {
            const p = P(mid, (q - len / 2) * 30, -120);
            if (sea(p.x, p.y) < -50) site.set(q % 2 ? 'waterfront/breakwater' : 'waterfront/breakwater-walk', 'seawall', p.x, p.y, WATER_Y, yaw, { afloat: true });
          }
          for (const [sd, colour] of [[-1, 'red'], [1, 'green']] as const) {
            const h = P(mid, sd * (len / 2) * 30 + sd * 4, -120);
            site.put(`waterfront/beacon-${colour}`, 'port', h.x, h.y, 0, { h: WATER_Y + 2.4, afloat: true });
            const q = P(mid, sd * ((len / 2) * 30 + 38), -128);
            if (sea(q.x, q.y) < -40) afloat(`waterfront/buoy-pillar-${colour}`, 'buoy', q, 0);
          }
        }
      }
    } else if (r.kind === 'urban') {
      const top = r.top!;
      const benches = pick([['furniture/bench-park-green'], ['furniture/bench-flat', 'furniture/bench-flat-dark-long'], ['furniture/bench-park']], rnd(50, r.from));
      const lamp = pick(['furniture/light-acorn', 'furniture/light-lantern', 'furniture/light-globe'], rnd(51, r.from));
      const tree = stations[r.from].type === 'downtown' ? 'plant/street-plane' : pick(['plant/palm-queen', 'plant/street-ficus', 'plant/street-elm'], rnd(52, r.from));
      every(26, 9, (st, i) => onDeck(pick(benches, rnd(53, i)), 'bench', P(st, 0, 5.4), alongShore(st), top));
      every(30, 22, (st) => onDeck(lamp, 'light', P(st, 0, 4.6), alongShore(st), top));
      every(104, 40, (st) => onDeck('waterfront/lifering-post', 'feature', P(st, 0, 1.2), alongShore(st), top));
      every(78, 30, (st) => onDeck('furniture/bin-hood-green', 'bin', P(st, 2, 5.4), alongShore(st), top));
      every(14, 6, (st, i) => onDeck(tree, 'tree', P(st, 0, 10.5), rnd(54, i) * 6.3, top, { scale: 0.9 + rnd(55, i) * 0.25 }));
      if (r.length >= 240) publicPier(rnd(56, r.from) < 0.5 ? 'waterfront/pier-concrete' : 'waterfront/pier-concrete-wide', r, mid, 0, top - 2.2);
    } else if (r.kind === 'rocky') {
      every(9, 2, (st, i) => {
        if (rnd(60, i) < 0.2) return;
        const big = rnd(61, i) < 0.1;
        const p = P(st, (rnd(62, i) - 0.5) * 6, -3 + rnd(63, i) * 8);
        const c = site.at(p.x, p.y);
        if (c !== FREE && c !== WATER) return;
        site.put(big ? 'waterfront/rock-outcrop' : rnd(64, i) < 0.75 ? `waterfront/rocks-${rock}` : `waterfront/rock-${rock}`, 'rock', p.x, p.y, rnd(65, i) * 6.3, { h: Math.max(WATER_Y, site.heightAt(p.x, p.y)) - (big ? 0.6 : 0.15), scale: big ? 1 : 1 + rnd(66, i) * 0.9, afloat: true });
      });
    } else if (r.kind === 'natural') {
      every(30, 8, (st, i) => {
        if (rnd(70, i) < 0.5) return;
        const p = P(st, 0, -1 + rnd(71, i) * 5);
        if (site.at(p.x, p.y) === FREE || site.at(p.x, p.y) === WATER) site.put(`waterfront/rocks-${rock}`, 'rock', p.x, p.y, rnd(72, i) * 6.3, { h: Math.max(WATER_Y, site.heightAt(p.x, p.y)) - 0.15, scale: 0.8 + rnd(73, i) * 0.6, afloat: true });
      });
      every(11, 3, (st, i) => {
        if (rnd(74, i) < 0.55) return;
        drop(rnd(75, i) < 0.6 ? 'plant/grass-fountain' : 'plant/grass-patch', 'plant', P(st, 0, 9 + rnd(76, i) * 9), rnd(77, i) * 6.3, 0.9);
      });
      // Private docks where houses back onto the water; now and then a pier nobody keeps up.
      every(130, 40, (st, i) => {
        let homes = false;
        for (let d = 14; d <= 60 && !homes; d += 4) homes = site.at(P(st, 0, d).x, P(st, 0, d).y) === LOT;
        const u = rnd(78, i);
        if (homes && st.type !== 'industrial' && u < 0.75) {
          const model = u < 0.3 ? 'waterfront/dock-float-timber' : u < 0.5 ? 'waterfront/dock-float' : u < 0.65 ? 'waterfront/pier-timber-narrow' : 'waterfront/pier-moorings';
          if (!pier(model, st, 2, /float/.test(model) ? WATER_Y : WATER_Y - (model.includes('narrow') ? 0.5 : 1.2), false)) return;
          const q = P(st, 2.8, -8);
          afloat(pick(['waterfront/boat-dinghy-white', 'waterfront/boat-skiff-aluminium', 'waterfront/boat-dinghy-blue', 'waterfront/boat-skiff-white', 'waterfront/boat-rib-grey'], rnd(79, i)), 'boat', q, out2sea(st));
        } else if (u > 0.93) pier('waterfront/pier-derelict', st, 2, WATER_Y - 1.4, false);
      });
      if (r.length >= 400) publicPier(rnd(80, r.from) < 0.5 ? 'waterfront/pier-fishing' : 'waterfront/pier-timber-lamps', r, mid, 3, WATER_Y - 1);
    }
    n++;
  }

  // --- A marina and a fishing harbour, each on an open or walled stretch away from the port and the beach ---
  const spot = (score: (st: ShoreStation, r: Reach, i: number) => number): { st: ShoreStation; r: Reach; i: number } | null => {
    let [best, bs] = [null as { st: ShoreStation; r: Reach; i: number } | null, -Infinity];
    for (const r of out.reaches) {
      if (r.kind !== 'natural' && r.kind !== 'urban') continue;
      const stations = out.coasts[r.coast];
      for (let i = r.from + 14; i <= r.to - 14; i += 4) {
        const st = stations[i];
        if (out.piers.some((q) => Math.hypot(q.x - st.x, q.y - st.y) < 120) || sea(st.x + st.nx * 50, st.y + st.ny * 50) > -30) continue;
        const s = score(st, r, i);
        if (s > bs) [best, bs] = [{ st, r, i }, s];
      }
    }
    return best;
  };
  const marina = spot((st, r) => (r.kind === 'urban' ? 200 : 0) + (st.type === 'residential' || st.type === 'midtown' ? 100 : 0) + rnd(90, st.x, st.y) * 50);
  if (marina) {
    const { st, r } = marina;
    const h = r.top ?? Math.max(0.3, site.heightAt(P(st, 0, 6).x, P(st, 0, 6).y));
    for (const a of [-34, 0, 34]) {
      const p = P(st, a, r.top !== undefined ? -1.2 : 1);
      site.set('waterfront/marina-slips', 'dock', p.x, p.y, WATER_Y, out2sea(st), { afloat: true });
      out.piers.push({ x: p.x, y: p.y, yaw: out2sea(st), length: 36, model: 'waterfront/marina-slips', public: false, street: null });
      const g = P(st, a + 3, 2.5);
      if (r.top !== undefined) onDeck('waterfront/dock-box', 'dock', g, alongShore(st), h);
      else drop('waterfront/dock-box', 'dock', g, alongShore(st), 0.9);
    }
    const office = P(st, 58, r.top !== undefined ? 8 : 16);
    if (r.top !== undefined) onDeck('waterfront/harbor-office', 'dock', office, alongShore(st) + Math.PI, h);
    else drop('waterfront/harbor-office', 'dock', office, alongShore(st) + Math.PI, 6);
    for (let q = 0; q < 4; q++) {
      const p = P(st, -62 - q * 5, 14);
      drop(q % 2 ? 'waterfront/boat-on-trailer' : 'waterfront/boat-on-stands', 'boat', p, out2sea(st), 2.6);
    }
    drop('waterfront/kayak-rack', 'dock', P(st, 50, 22), alongShore(st), 2.2);
    // Boats on moorings off the slips.
    for (let q = 0; q < 7; q++) {
      const p = P(st, -70 + q * 23 + rnd(91, q) * 8, -62 - rnd(92, q) * 34);
      if (sea(p.x, p.y) > -40) continue;
      afloat(pick(['waterfront/boat-sail-white', 'waterfront/boat-sail-blue', 'waterfront/boat-cruiser-white', 'waterfront/boat-sail-red', 'waterfront/boat-skiff-white'], rnd(93, q)), 'boat', p, rnd(94, q) * 6.3);
      afloat('waterfront/buoy-mooring-white', 'buoy', { x: p.x + 5, y: p.y + 2 }, 0);
    }
  }
  const harbour = spot((st, r) => (r.kind === 'natural' ? 100 : 0) - Math.min(600, Math.abs(riverBankAt(t, st.x, st.y))) * 0.3 + rnd(95, st.x, st.y) * 30 - (marina && Math.hypot(marina.st.x - st.x, marina.st.y - st.y) < 300 ? 1e4 : 0));
  if (harbour) {
    const { st, r } = harbour;
    const h = r.top ?? undefined;
    if (pier(r.top !== undefined ? 'waterfront/pier-concrete-head' : 'waterfront/pier-timber', st, r.top !== undefined ? 0 : 3, r.top !== undefined ? r.top - 2.2 : WATER_Y - 1, false)) {
      const yaw = alongShore(st);
      const land = (model: string, kind: SiteKind, a: number, d: number, turn = 0, rad = 1.6): void => {
        const p = P(st, a, d);
        if (h !== undefined) onDeck(model, kind, p, yaw + turn, h);
        else drop(model, kind, p, yaw + turn, rad);
      };
      land('waterfront/bait-shop', 'dock', 10, h !== undefined ? 9 : 15, Math.PI, 4);
      land('waterfront/fish-crates', 'dock', -4, 7);
      land('waterfront/lobster-traps', 'dock', -8, 8, 0.3, 2);
      land('waterfront/net-pile', 'dock', 4.5, 6.5);
      land('waterfront/net-drying', 'dock', -18, 11, 0, 4.5);
      land('waterfront/fish-table', 'dock', 3, 9.5);
      for (const [a, d, k] of [[5.5, -14, 0], [-5.5, -18, 1], [26, -30, 2]] as const)
        afloat(pick(['waterfront/boat-trawler-red', 'waterfront/boat-trawler-blue', 'waterfront/boat-trawler-green'], rnd(96, k)), 'boat', P(st, a, d), out2sea(st) + (k === 2 ? 1 : 0));
    }
  }
  // Lights either side of the river mouth.
  for (const r of out.reaches) {
    if (r.kind !== 'mouth') continue;
    const stations = out.coasts[r.coast];
    for (const [i, colour] of [[r.from - 2, 'red'], [r.to + 2, 'green']] as const) {
      const st = stations[i];
      if (st) drop(`waterfront/beacon-${colour}`, 'port', P(st, 0, 4), 0, 1.6);
    }
  }

  // --- River banks ---
  const bank = (x: number, y: number): number => riverBankAt(t, x, y);
  /** Where the bank is on the line across the water at each step along it, per side; null where there is none to be found. */
  const banksides: { line: Vec2[]; side: number; total: number; at: ({ x: number; y: number; mx: number; my: number; w: number } | null)[] }[] = [];
  [t.river, ...t.streams].forEach((line, li) => {
    const total = polyLength(line);
    for (const side of [1, -1]) {
      const at: (typeof banksides)[number]['at'] = [];
      for (let s = 2; s < total; s += 4) {
        const { p, tan } = pointAt(line, s);
        const [mx, my] = [-tan.y * side, tan.x * side];
        let w = -1;
        let prev = bank(p.x, p.y);
        for (let d = 1; d <= (li ? 20 : 90) && prev < 0; d += 1) {
          const v = bank(p.x + mx * d, p.y + my * d);
          if (v >= 0) w = d - 1 + -prev / (v - prev);
          prev = v;
        }
        at.push(w < 2 ? null : { x: p.x + mx * w, y: p.y + my * w, mx, my, w });
      }
      banksides.push({ line, side, total, at });
    }
  });
  // A town's river runs between walls, with a walk along the top of each and a planted verge behind it.
  type Style = 'city' | 'old' | 'home' | 'works';
  const STYLE: Record<DistrictType, Style | null> = { downtown: 'city', midtown: 'city', oldtown: 'old', residential: 'home', beach: 'home', suburb: 'home', industrial: 'works', hills: null };
  const TOP = BERM_HEIGHT + 0.06;
  const COPE = 0.14;
  const runs: { style: Style; pts: Vec2[] }[] = [];
  for (const l of banksides) {
    let cur = null as { style: Style; pts: Vec2[] } | null;
    const flush = (): void => {
      if (cur && polyLength(cur.pts) >= 36) runs.push(cur);
      cur = null;
    };
    for (const st of l.at) {
      const q = (d: number): Vec2 => ({ x: st!.x + st!.mx * d, y: st!.y + st!.my * d });
      // The bank is this water's own, clear of the sea and of the mouth of another stream.
      const style = st && inMap(q(0), 30) && sea(st.x, st.y) > 46 && Math.abs(bank(q(4).x, q(4).y) - 4) < 1.2 && Math.abs(bank(q(10).x, q(10).y) - 10) < 2.5 ? STYLE[districtAt(t, city.districts, q(30).x, q(30).y).type] : null;
      const last: Vec2 | undefined = cur?.pts[cur.pts.length - 1];
      if (!style || (last && Math.hypot(last.x - st!.x, last.y - st!.y) > 8)) flush();
      if (!style) continue;
      if (cur && cur.style !== style) {
        // The walk goes on in the next district's manner.
        flush();
        cur = { style, pts: last ? [last] : [] };
      }
      cur ??= { style, pts: [] };
      cur.pts.push({ x: st!.x, y: st!.y });
    }
    flush();
  }
  interface BankSt extends Vec2 {
    /** Unit vector away from the water. */
    nx: number;
    ny: number;
    s: number;
  }
  const WBIN = 32;
  const walk = new Map<number, BankSt[]>();
  const walks: { style: Style; st: BankSt[] }[] = runs.map((run) => {
    const pts = resample(run.pts, 4);
    const st = pts.map((p, i) => {
      const [a, c] = [pts[Math.max(0, i - 2)], pts[Math.min(pts.length - 1, i + 2)]];
      const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      let [nx, ny] = [-(c.y - a.y) / len, (c.x - a.x) / len];
      if (bank(p.x + nx * 4, p.y + ny * 4) < bank(p.x - nx * 4, p.y - ny * 4)) [nx, ny] = [-nx, -ny];
      return { x: p.x, y: p.y, nx, ny, s: i * 4 };
    });
    for (const p of st) {
      const key = Math.floor(p.x / WBIN) * 4096 + Math.floor(p.y / WBIN);
      if (!walk.has(key)) walk.set(key, []);
      walk.get(key)!.push(p);
    }
    return { style: run.style, st };
  });
  const walkNear = (x: number, y: number, max: number): boolean => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const p of walk.get((Math.floor(x / WBIN) + di) * 4096 + Math.floor(y / WBIN) + dj) ?? []) if (Math.hypot(p.x - x, p.y - y) < max) return true;
    return false;
  };
  // The bed is dug out before the wall and the berm behind it is cut level; grass grows on the embankment.
  for (let j = 0; j < t.n; j++)
    for (let i = 0; i < t.n; i++) {
      const k = j * t.n + i;
      const v = t.riverBank[k];
      if (v > RIVER_RESERVE + 8 || v < -14 || !walkNear(i * t.cell, j * t.cell, 30)) continue;
      out.banks[k] = 1;
      if (v < 3.5) site.ground[k] = Math.min(site.ground[k], -3.5);
      else if (v < BERM_WIDTH) site.ground[k] = Math.min(site.ground[k], BERM_HEIGHT);
    }
  const WALKS: Record<Style, { width: number; paving: string[]; wall: string; rail: string[]; lamp: string[]; bench: string[]; tree: string[] }> = {
    city: { width: 5, paving: ['paving/slabs-granite', 'concrete/walk-exposed', 'paving/herringbone-grey'], wall: 'site/seawall-concrete', rail: ['boundary/ped-rail-black', 'boundary/ped-rail-cable'], lamp: ['furniture/light-acorn', 'furniture/light-globe'], bench: ['furniture/bench-flat', 'furniture/bench-metal-steel', 'furniture/bench-concrete-wood'], tree: ['plant/tree-plane', 'plant/tree-elm', 'plant/tree-cherry'] },
    old: { width: 4, paving: ['paving/setts-granite', 'paving/setts-large-tan'], wall: 'wall/stone-granite-grey', rail: ['boundary/ped-rail-ornate'], lamp: ['furniture/light-lantern', 'furniture/light-lantern-bronze'], bench: ['furniture/bench-park', 'furniture/bench-park-weathered'], tree: ['plant/tree-plane-large', 'plant/tree-cherry'] },
    home: { width: 3.6, paving: ['concrete/walk-plain', 'asphalt/plain-worn-sealed', 'concrete/walk-long', 'paving/running-red'], wall: 'site/seawall-concrete', rail: ['boundary/tube-rail-2', 'boundary/ped-rail-green', 'boundary/ped-rail-white'], lamp: ['furniture/light-led-ped', 'furniture/light-disc'], bench: ['furniture/bench-park-green', 'furniture/bench-park', 'furniture/bench-metal-mesh', 'furniture/bench-park-weathered'], tree: ['plant/tree-cherry', 'plant/tree-cherry', 'plant/tree-maple', 'plant/tree-birch', 'plant/tree-spring'] },
    works: { width: 3, paving: ['concrete/road-smooth-cracked'], wall: 'site/seawall-concrete', rail: ['boundary/tube-rail-3'], lamp: [], bench: [], tree: [] },
  };
  /**
   * A way up from the walk to the street: flat slabs where the ground is level and steps where it climbs, each tread
   * on the highest ground under it. `side` is the width of a landing at the top, towards the pavement beside it.
   */
  const climb = (from: Vec2, dx: number, dy: number, len: number, tex: string, h0: number, turn = 0): void => {
    const W = 0.9;
    const at = (s: number, a: number, h: number): V3 => [from.x + dx * s - dy * a, h, from.y + dy * s + dx * a];
    const treads: { s0: number; s1: number; h: number }[] = [];
    for (let s = 0; s < len - 0.01; s += 0.36) {
      const s1 = Math.min(len, s + 0.36);
      let h = h0;
      for (const a of [-W, 0, W]) for (const u of [s, s1]) h = Math.max(h, site.heightAt(from.x + dx * u - dy * a, from.y + dy * u + dx * a) + 0.04);
      const last = treads[treads.length - 1];
      if (last && Math.abs(last.h - h) < 0.03) {
        last.s1 = s1;
        last.h = Math.max(last.h, h);
      } else treads.push({ s0: s, s1, h });
    }
    let prev = h0;
    for (const { s0, s1, h } of treads) {
      b.quadUp(tex, at(s0, -W, h), at(s1, -W, h), at(s1, W, h), at(s0, W, h), 0, [[0, s0], [0, s1], [2 * W, s1], [2 * W, s0]]);
      if (Math.abs(h - prev) > 0.005) {
        const [lo, hi] = [Math.min(h, prev), Math.max(h, prev)];
        b.quadFacing('curb/plain', at(s0, -W, hi), at(s0, W, hi), at(s0, W, lo), at(s0, -W, lo), h > prev ? [-dx, 0, -dy] : [dx, 0, dy], [[0, 0], [2 * W, 0], [2 * W, hi - lo], [0, hi - lo]]);
      }
      for (const a of [-W, W]) b.quadFacing('curb/plain', at(s0, a, h), at(s1, a, h), at(s1, a, h - 0.4), at(s0, a, h - 0.4), [-dy * a, 0, dx * a], [[s0, 0], [s1, 0], [s1, 0.4], [s0, 0.4]]);
      prev = h;
    }
    const end = { x: from.x + dx * len, y: from.y + dy * len };
    if (turn) {
      // A landing across to the pavement.
      const [x0, x1] = [Math.min(0, turn) - W, Math.max(0, turn) + W];
      b.quadUp(tex, at(len, x0, prev), at(len + 2 * W, x0, prev), at(len + 2 * W, x1, prev), at(len, x1, prev), 0, [[x0, 0], [x0, 2 * W], [x1, 2 * W], [x1, 0]]);
      for (const a of [x0, x1]) b.quadFacing('curb/plain', at(len, a, prev), at(len + 2 * W, a, prev), at(len + 2 * W, a, prev - 0.5), at(len, a, prev - 0.5), [-dy * a, 0, dx * a], [[0, 0], [2 * W, 0], [2 * W, 0.5], [0, 0.5]]);
      b.quadFacing('curb/plain', at(len + 2 * W, x0, prev), at(len + 2 * W, x1, prev), at(len + 2 * W, x1, prev - 0.5), at(len + 2 * W, x0, prev - 0.5), [dx, 0, dy], [[x0, 0], [x1, 0], [x1, 0.5], [x0, 0.5]]);
    }
    site.stampBand(from.x, from.y, end.x + dx * (turn ? 2 * W : 0), end.y + dy * (turn ? 2 * W : 0), -W - 0.6, W + 0.6, USED, 0, FREE);
    // A hand rail where it climbs.
    const steep = treads.filter((s) => s.s1 - s.s0 < 1.2);
    if (steep.length > 3) {
      const [u0, u1] = [steep[0].s0, steep[steep.length - 1].s1];
      const side = turn > 0 ? -W - 0.08 : W + 0.08;
      site.panels('boundary/tube-rail-2', 'fence', [{ x: at(u0, side, 0)[0], y: at(u0, side, 0)[2] }, { x: at(u1, side, 0)[0], y: at(u1, side, 0)[2] }]);
    }
  };
  walks.forEach(({ style, st }, wi) => {
    const W = WALKS[style];
    const n = st.length;
    const [paving, rail] = [pick(W.paving, rnd(110, wi)), pick(W.rail, rnd(111, wi))];
    const e = (i: number, d: number, h = TOP): V3 => [st[i].x + st[i].nx * d, h, st[i].y + st[i].ny * d];
    const q = (i: number, d: number, a = 0): Vec2 => ({ x: st[i].x + st[i].nx * d - st[i].ny * a, y: st[i].y + st[i].ny * d + st[i].nx * a });
    const out2 = (i: number): V3 => [-st[i].nx, 0, -st[i].ny];
    for (let i = 0; i + 1 < n; i++) {
      const [s0, s1] = [st[i].s, st[i + 1].s];
      // The wall with its coping, the walk, and a kerb at the back of it.
      b.quadFacing(W.wall, e(i, -0.2, TOP + COPE), e(i + 1, -0.2, TOP + COPE), e(i + 1, -0.2, -1.5), e(i, -0.2, -1.5), out2(i), [[s0, 0], [s1, 0], [s1, TOP + COPE + 1.5], [s0, TOP + COPE + 1.5]]);
      b.quadUp('curb/granite', e(i, -0.2, TOP + COPE), e(i + 1, -0.2, TOP + COPE), e(i + 1, 0.4, TOP + COPE), e(i, 0.4, TOP + COPE), 0, [[0, s0], [0, s1], [0.6, s1], [0.6, s0]]);
      b.quadFacing('curb/granite', e(i, 0.4, TOP + COPE), e(i + 1, 0.4, TOP + COPE), e(i + 1, 0.4), e(i, 0.4), [st[i].nx, 0, st[i].ny], [[s0, 0], [s1, 0], [s1, COPE], [s0, COPE]]);
      b.quadUp(paving, e(i, 0.4), e(i + 1, 0.4), e(i + 1, W.width), e(i, W.width), 0, [[0.4, s0], [0.4, s1], [W.width, s1], [W.width, s0]]);
      b.quadFacing('curb/plain', e(i, W.width), e(i + 1, W.width), e(i + 1, W.width, TOP - 0.5), e(i, W.width, TOP - 0.5), [st[i].nx, 0, st[i].ny], [[s0, 0], [s1, 0], [s1, 0.5], [s0, 0.5]]);
    }
    for (const [i, sign] of [[0, -1], [n - 1, 1]] as const) {
      b.quadFacing(W.wall, e(i, -0.2), e(i, W.width), e(i, W.width, -1.5), e(i, -0.2, -1.5), [st[i].ny * sign, 0, -st[i].nx * sign], [[0, 0], [W.width + 0.2, 0], [W.width + 0.2, TOP + 1.5], [0, TOP + 1.5]]);
      b.quadFacing(W.wall, e(i, -0.2), e(i, W.width), e(i, W.width, -1.5), e(i, -0.2, -1.5), [-st[i].ny * sign, 0, st[i].nx * sign], [[0, 0], [W.width + 0.2, 0], [W.width + 0.2, TOP + 1.5], [0, TOP + 1.5]]);
    }
    site.panels(rail, 'fence', st.map((_, i) => q(i, 0.1)), {}, TOP + COPE);
    out.walks.push({ style, pts: st.map((_, i) => q(i, W.width / 2)), top: TOP, width: W.width });
    for (let i = 0; i < n; i++) for (let d = 0; d <= W.width; d += 2) site.stampDisc(q(i, d).x, q(i, d).y, 2.2, USED, FREE);
    if (style === 'works') return;
    // Ways up to the street: straight back from the walk to the first pavement, or up beside a bridge to the pavement that leads on to it.
    const ways: { i: number; len: number; turn: number }[] = [];
    for (let i = 2; i < n - 2; i++) {
      let found: { len: number; turn: number } | null = null;
      for (let d = W.width; d <= 52 && !found; d += 1) {
        const p = q(i, d);
        const c = site.at(p.x, p.y);
        if (c === ROAD) {
          if (bank(p.x, p.y) >= BERM_WIDTH + 3) found = { len: d - W.width + 0.9, turn: 0 };
          break;
        }
        if (c !== FREE && c !== USED) break;
        if (bank(p.x, p.y) < RIVER_RESERVE - 3) continue;
        for (const a of [-3.4, 3.4]) {
          const r = q(i, d, a);
          if (site.at(r.x, r.y) === ROAD && site.at(q(i, d, a / 2).x, q(i, d, a / 2).y) !== ROAD && Math.abs(site.heightAt(r.x, r.y) - site.heightAt(p.x, p.y)) < 0.5) found = { len: d - W.width - 0.9, turn: a > 0 ? 2.6 : -2.6 };
        }
      }
      if (found) ways.push({ i, ...found });
    }
    const taken: number[] = [];
    for (const w of [...ways.filter((w) => w.turn), ...ways.filter((w) => !w.turn).sort((a, c) => a.len - c.len)]) {
      if (taken.some((i) => Math.abs(i - w.i) * 4 < (w.turn ? 30 : 110))) continue;
      taken.push(w.i);
      climb(q(w.i, W.width), st[w.i].nx, st[w.i].ny, w.len, paving, TOP, w.turn);
      out.walkWays.push(q(w.i, W.width + w.len));
    }
    // Lamps and benches at the back of the walk; trees and low planting on the verge behind it.
    const [lamp, bench, tree] = [pick(W.lamp, rnd(112, wi)), pick(W.bench, rnd(113, wi)), pick(W.tree, rnd(114, wi))];
    const clear = (i: number): boolean => !taken.some((k) => Math.abs(k - i) < 1) && site.at(q(i, 1).x, q(i, 1).y) !== ROAD && site.at(q(i, 1).x, q(i, 1).y) !== RAIL;
    const yaw = (i: number): number => facing({ x: -st[i].nx, y: -st[i].ny });
    for (let i = 3; i < n - 2; i++) {
      if (!clear(i)) continue;
      if (i % 7 === 3) onDeck(lamp, 'light', q(i, W.width - 0.45), yaw(i), TOP);
      else if (i % 9 === 5 && rnd(115, wi, i) < 0.8) onDeck(bench, 'bench', q(i, W.width - 0.6), yaw(i), TOP);
      else if (i % 27 === 13) onDeck('furniture/bin-hood-green', 'bin', q(i, W.width - 0.5), yaw(i), TOP);
      else if (i % 30 === 20) onDeck('waterfront/lifering-post', 'feature', q(i, 0.9), yaw(i), TOP);
    }
    for (let i = 1; i < n - 1; i++) {
      const u = rnd(116, wi, i);
      if (i % 3 === 1 && u < 0.82) drop(u < 0.07 ? 'plant/tree-sapling' : tree, 'tree', q(i, W.width + 2.4 + (rnd(117, wi, i) - 0.5)), u * 60, 1.3, { scale: 0.8 + rnd(118, wi, i) * 0.35 });
      else if (u < 0.35) drop(pick(['plant/shrub-box', 'plant/grass-fountain', 'plant/grass-patch', 'plant/grass-patch'], rnd(119, wi, i)), 'plant', q(i, W.width + 1 + rnd(117, wi, i) * 2.5), u * 60, 0.7);
    }
  });
  // Elsewhere the banks are left as they are: rocks and reeds, a canoe pulled up here and there.
  for (const l of banksides) {
    const { side } = l;
    l.at.forEach((st, k) => {
      if (!st) return;
      const { mx, my, w } = st;
      const q = (d: number): Vec2 => ({ x: st.x + mx * d, y: st.y + my * d });
      if (!inMap(q(0), 16) || sea(q(0).x, q(0).y) < 30 || walkNear(st.x, st.y, 9) || !site.all(q(5).x, q(5).y, 9, FREE, LOT, USED, WATER)) return;
      const type = districtAt(t, city.districts, q(20).x, q(20).y).type;
      const yaw = facing({ x: -mx, y: -my });
      const u = rnd(100, side, k, st.x);
      if (type === 'industrial') {
        if (k % 4 === 0) site.put('waterfront/rocks-wet', 'rock', q(-1.5).x, q(-1.5).y, u * 6.3, { h: WATER_Y - 0.1, afloat: true });
        return;
      }
      if (u < 0.3) drop(u < 0.18 ? 'plant/grass-fountain' : 'plant/grass-patch', 'plant', q(0.8 + u * 8), u * 40, 0.8);
      else if (u < 0.38) site.put('waterfront/rocks-mossy', 'rock', q(-1).x, q(-1).y, u * 60, { h: WATER_Y - 0.15, scale: 0.8, afloat: true });
      else if (u > 0.99) drop(pick(['waterfront/boat-canoe-red', 'waterfront/boat-canoe-green', 'waterfront/boat-kayak-yellow'], rnd(101, k)), 'boat', q(3), yaw + 1.2, 2.4, { lift: 0.1 });
      else if (u > 0.975 && w > 9 && bank(q(-9).x, q(-9).y) < -5) {
        const root = q(0.5);
        if (!out.piers.some((o) => Math.hypot(o.x - root.x, o.y - root.y) < 200)) {
          site.set('waterfront/dock-float-timber', 'pier', root.x, root.y, WATER_Y, along({ x: -mx, y: -my }), { afloat: true });
          out.piers.push({ x: root.x, y: root.y, yaw: along({ x: -mx, y: -my }), length: 12, model: 'waterfront/dock-float-timber', public: false, street: null });
        }
      }
    });
  }
  void n;
  void walled;
  void RAIL;
  void ROAD;
  out.tiles.push(b.build());
  return out;
}
