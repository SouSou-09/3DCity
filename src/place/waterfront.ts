import { MeshBuilder, ModelData, V3 } from '../assets/mesh/builder';
import { pointAt, polyLength, resample } from '../core/geom';
import { Vec2 } from '../core/vec2';
import { DistrictType, districtAt } from '../gen/districts';
import { hillAt, riverBankAt, seaDistAt } from '../gen/terrain';
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
  piers: { x: number; y: number; yaw: number; length: number; model: string; public: boolean }[];
  towers: Vec2[];
  lighthouse: Vec2 | null;
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
  const out: Waterfront = { coasts: [], reaches: [], tiles: [], sand: new Float32Array(t.n * t.n), paved: new Float32Array(t.n * t.n), piers: [], towers: [], lighthouse: null };

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
    out.piers.push({ x: p.x, y: p.y, yaw: out2sea(st), length: len, model, public: isPublic });
    return true;
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
      // One pleasure pier on the longest beach, on a ramp of boardwalk up from the sand.
      if (resort && pier('waterfront/pier-boardwalk-wide', mid, 6, WATER_Y - 0.6, true, 1.6)) {
        const deck = WATER_Y - 0.6 + 2.2;
        // The ramp comes down to the sand short of whatever street or lot backs the beach.
        let back = 10;
        while (back < 30 && site.all(P(mid, 0, back + 2).x, P(mid, 0, back + 2).y, 4.5, FREE, USED)) back += 2;
        const [a, c] = [P(mid, 0, 6), P(mid, 0, back)];
        const g = site.heightAt(c.x, c.y) + 0.1;
        const corner = (p: Vec2, sd: number, h: number): V3 => [p.x + mid.ny * sd * 4, h, p.y - mid.nx * sd * 4];
        b.quadUp('paving/boardwalk', corner(a, -1, deck), corner(a, 1, deck), corner(c, 1, g), corner(c, -1, g), 0, [[0, 0], [8, 0], [8, back - 6], [0, back - 6]]);
        for (const sd of [-1, 1]) b.quadFacing('paving/boardwalk', corner(a, sd, deck), corner(c, sd, g), corner(c, sd, g - 1.5), corner(a, sd, deck - 2.5), [mid.ny * sd, 0, -mid.nx * sd], [[0, 0], [back - 6, 0], [back - 6, 1.5], [0, 2.5]]);
        for (let d = 6; d <= back; d += 2) site.stampDisc(P(mid, 0, d).x, P(mid, 0, d).y, 5, USED, FREE);
      }
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
      if (r.length >= 240) pier(rnd(56, r.from) < 0.5 ? 'waterfront/pier-concrete' : 'waterfront/pier-concrete-wide', mid, 0, top - 2.2, true);
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
      if (r.length >= 400) pier(rnd(80, r.from) < 0.5 ? 'waterfront/pier-fishing' : 'waterfront/pier-timber-lamps', mid, 3, WATER_Y - 1, true);
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
      out.piers.push({ x: p.x, y: p.y, yaw: out2sea(st), length: 36, model: 'waterfront/marina-slips', public: false });
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
  const total = polyLength(t.river);
  for (const side of [1, -1]) {
    let run: Vec2[] = [];
    let runType: DistrictType | null = null;
    const flush = (): void => {
      if (run.length >= 4 && runType) {
        const model = runType === 'oldtown' ? 'boundary/iron-hoop' : runType === 'residential' ? 'boundary/tube-rail-2' : 'boundary/ped-rail-black';
        site.panels(model, 'fence', run);
      }
      run = [];
      runType = null;
    };
    for (let s = 4, k = 0; s < total; s += 6, k++) {
      const { p, tan } = pointAt(t.river, s);
      const [mx, my] = [-tan.y * side, tan.x * side];
      let w = -1;
      for (let d = 0; d <= 90; d += 1)
        if (bank(p.x + mx * d, p.y + my * d) >= 0.4) {
          w = d;
          break;
        }
      const q = (d: number): Vec2 => ({ x: p.x + mx * (w + d), y: p.y + my * (w + d) });
      if (w < 3 || !inMap(q(0), 16) || sea(q(0).x, q(0).y) < 30 || !site.all(q(5).x, q(5).y, 9, FREE, LOT, USED, WATER)) {
        flush();
        continue;
      }
      const type = districtAt(t, city.districts, q(20).x, q(20).y).type;
      const town = type === 'downtown' || type === 'midtown' || type === 'oldtown' || type === 'residential';
      const yaw = facing({ x: -mx, y: -my });
      if (town) {
        const last = run[run.length - 1];
        // A rail does not jump a bend of the river or the mouth of a stream.
        if (runType !== type || !free(q(1.6).x, q(1.6).y, 0.5) || (last && Math.hypot(last.x - q(1.6).x, last.y - q(1.6).y) > 9)) flush();
        if (free(q(1.6).x, q(1.6).y, 0.5)) {
          runType = type;
          run.push(q(1.6));
        }
        if (k % 8 === 3) drop('furniture/bench-park', 'bench', q(3.6), yaw, 1.2);
        if (k % 20 === 9) drop('waterfront/lifering-post', 'feature', q(2.6), yaw, 0.5);
        continue;
      }
      flush();
      const u = rnd(100, side, k);
      if (type === 'industrial') {
        if (k % 3 === 0) site.put('waterfront/rocks-wet', 'rock', q(-1.5).x, q(-1.5).y, u * 6.3, { h: WATER_Y - 0.1, afloat: true });
        continue;
      }
      if (u < 0.4) drop(u < 0.25 ? 'plant/grass-fountain' : 'plant/grass-patch', 'plant', q(0.8 + u * 4), u * 40, 0.8);
      else if (u < 0.5) site.put('waterfront/rocks-mossy', 'rock', q(-1).x, q(-1).y, u * 60, { h: WATER_Y - 0.15, scale: 0.8, afloat: true });
      else if (u > 0.985) drop(pick(['waterfront/boat-canoe-red', 'waterfront/boat-canoe-green', 'waterfront/boat-kayak-yellow'], rnd(101, k)), 'boat', q(3), yaw + 1.2, 2.4, { lift: 0.1 });
      else if (u > 0.965 && w > 9 && bank(p.x + mx * (w - 9), p.y + my * (w - 9)) < -5) {
        const root = q(0.5);
        if (!out.piers.some((o) => Math.hypot(o.x - root.x, o.y - root.y) < 200)) {
          site.set('waterfront/dock-float-timber', 'pier', root.x, root.y, WATER_Y, along({ x: -mx, y: -my }), { afloat: true });
          out.piers.push({ x: root.x, y: root.y, yaw: along({ x: -mx, y: -my }), length: 12, model: 'waterfront/dock-float-timber', public: false });
        }
      }
    }
    flush();
  }
  void n;
  void walled;
  void RAIL;
  void ROAD;
  out.tiles.push(b.build());
  return out;
}
