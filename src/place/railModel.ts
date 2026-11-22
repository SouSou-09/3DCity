// The registry comes first: the kit modules below register their models with it as they load.
import '../assets/mesh/registry';
import { MeshBuilder, ModelData, V3 } from '../assets/mesh/builder';
import { box, move, stand, turn } from '../assets/mesh/kit';
import { BED, Curve, G, STYLES, TOP, TrackStyle, Way, bed, poseAt, pt, rail, sideWay, stain, sweep, turnout } from '../assets/mesh/railkit';
import { tvm } from '../assets/mesh/railparts';
import { layout } from '../assets/mesh/section';
import { EDGE, HIGH, LOW, canopy, footbridge, furnish, platform, podium, stairs, stationHouse } from '../assets/mesh/stations';
import { bufferStop, viaduct } from '../assets/mesh/tracks';
import { pointSeg } from '../core/geom';
import { Vec2, clamp } from '../core/vec2';
import { City } from '../gen/city';
import { districtAt } from '../gen/districts';
import { isWater } from '../gen/terrain';
import { LevelCrossing, RailTrack, roadAt, trackAt } from './railProfile';
import { RoadModel } from './roadModel';

const TILE = 800;
/** Length of the instanced runs of sleepers and of a fence panel. */
const LADDER = 10;
const PANEL = 12;
/** How much wider the deck of a viaduct is on the side a branch leaves on, metres. */
const TURNOUT_DECK = 4;
/** Track centres of a double and a single line. */
const LATS: Record<number, number[]> = { 1: [0], 2: [-2, 2] };

export type RailItemKind = 'ties' | 'fence' | 'gate' | 'sign' | 'portal' | 'signal';
/** A catalogue model standing on or beside the railway. */
export interface RailItem {
  model: string;
  kind: RailItemKind;
  x: number;
  y: number;
  h: number;
  /** The model's +x axis points along (cos yaw, sin yaw) on the map, its +z axis along (-sin yaw, cos yaw). */
  yaw: number;
  /** Rise per metre along the model's +z and +x axes, for things that follow the grade of the track. */
  slopeZ?: number;
  slopeX?: number;
  line: number;
  /** Index into RailModel.crossings of the crossing it belongs to. */
  crossing?: number;
}

export interface BuiltStation {
  id: number;
  kind: 'central' | 'elevated' | 'commuter';
  x: number;
  y: number;
  /** Extent of the platforms along the line. */
  s0: number;
  s1: number;
  /** Height of the platform tops. */
  h: number;
  /** Side of the track (+1 / -1 lateral) the station building stands on. */
  side: 1 | -1;
  platforms: number;
  /** False where roads on both sides leave no room for a station building. */
  house: boolean;
}

export interface RailModel {
  tiles: ModelData[];
  items: RailItem[];
  crossings: LevelCrossing[];
  /** Surfaces of each crossing, by its index in `crossings`. */
  looks: CrossingLook[];
  stations: BuiltStation[];
  /** Metres of track (centre line) on each kind of structure. */
  stats: { ground: number; elevated: number; bridge: number; tunnel: number; piers: number; buffers: number; turnouts: number; triangles: number };
  /** Roads that cross track on the ground without a crossing of their own (see RailProfile.unbuilt). */
  unbuilt: number;
}

type SegKind = 'ground' | 'elevated' | 'bridge' | 'tunnel';
const facing = (d: Vec2): number => Math.atan2(-d.x, d.y);
const hash = (n: number): number => {
  const v = Math.sin(n * 91.7 + 13.3) * 43758.5453;
  return v - Math.floor(v);
};

/** Smooth curve through the points of a line, parameterised by the distance along its polyline. */
function routeCurve(tr: RailTrack): Curve {
  const { pts, s } = tr;
  const n = pts.length;
  const tan = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const l = s[Math.min(n - 1, i + 1)] - s[Math.max(0, i - 1)] || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const fn = (d: number): { p: [number, number]; t: [number, number] } => {
    let lo = 0;
    let hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    const l = s[lo + 1] - s[lo] || 1;
    const q = (d - s[lo]) / l;
    const [a, b, ta, tb] = [pts[lo], pts[lo + 1], tan[lo], tan[lo + 1]];
    const q2 = q * q;
    const q3 = q2 * q;
    const [h00, h10, h01, h11] = [2 * q3 - 3 * q2 + 1, q3 - 2 * q2 + q, -2 * q3 + 3 * q2, q3 - q2];
    const [d00, d10, d01, d11] = [6 * q2 - 6 * q, 3 * q2 - 4 * q + 1, -6 * q2 + 6 * q, 3 * q2 - 2 * q];
    const px = h00 * a.x + h10 * l * ta.x + h01 * b.x + h11 * l * tb.x;
    const py = h00 * a.y + h10 * l * ta.y + h01 * b.y + h11 * l * tb.y;
    const tx = d00 * a.x + d10 * l * ta.x + d01 * b.x + d11 * l * tb.x;
    const ty = d00 * a.y + d10 * l * ta.y + d01 * b.y + d11 * l * tb.y;
    const tl = Math.hypot(tx, ty) || 1;
    return { p: [px, py], t: [tx / tl, ty / tl] };
  };
  return Object.assign(fn, { step: 5 });
}

/** Lookup of every carriageway and junction, to keep piers, fences and signals off the roads. */
function roadCover(city: City, roads: RoadModel): (x: number, y: number, margin: number) => boolean {
  const CELL = 60;
  const grid = new Map<number, { ax: number; ay: number; bx: number; by: number; half: number }[]>();
  const put = (seg: { ax: number; ay: number; bx: number; by: number; half: number }): void => {
    const r = seg.half + 12;
    for (let j = Math.floor((Math.min(seg.ay, seg.by) - r) / CELL); j <= Math.floor((Math.max(seg.ay, seg.by) + r) / CELL); j++)
      for (let i = Math.floor((Math.min(seg.ax, seg.bx) - r) / CELL); i <= Math.floor((Math.max(seg.ax, seg.bx) + r) / CELL); i++) {
        const k = j * 4096 + i;
        const list = grid.get(k);
        if (list) list.push(seg);
        else grid.set(k, [seg]);
      }
  };
  roads.lines.forEach((line, id) => {
    if (!line) return;
    const cls = city.graph.edges[id].cls;
    // Freeways and ramps are up on a deck; only what stands on the ground matters here.
    if (cls === 'highway' || cls === 'ramp') return;
    const lay = layout(roads.sections[id]);
    const half = Math.max(-lay.outer[0], lay.outer[1]);
    for (let i = 1; i < line.length; i++) put({ ax: line[i - 1][0], ay: line[i - 1][2], bx: line[i][0], by: line[i][2], half });
  });
  for (const j of roads.junctions) {
    const r = Math.max(6, ...j.arms.map((a) => (Number.isFinite(a.reach) ? a.reach : 0)));
    put({ ax: j.x, ay: j.y, bx: j.x, by: j.y, half: r });
  }
  return (x, y, margin) => {
    const list = grid.get(Math.floor(y / CELL) * 4096 + Math.floor(x / CELL));
    if (!list) return false;
    for (const sg of list) {
      const dx = sg.bx - sg.ax;
      const dy = sg.by - sg.ay;
      const q = clamp(((x - sg.ax) * dx + (y - sg.ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      if (Math.hypot(x - sg.ax - dx * q, y - sg.ay - dy * q) < sg.half + margin) return true;
    }
    return false;
  };
}

const STATION_NAMES: [string, string][] = [['harbor', 'white'], ['old-town', 'green'], ['mesa-heights', 'black'], ['palm-ave', 'blue'], ['civic-center', 'white'], ['del-mar', 'green'], ['eastgate', 'white']];

/** Surfaces of one level crossing. */
export interface CrossingLook {
  /** Panels between and right beside the rails. */
  panel: string;
  /** Road surface between two tracks, and on the ramps up to the deck. */
  field: string;
  approach: string;
  /** Flangeway beside each rail, and the top of the rails. */
  flange: string;
  head: string;
}

const RANK: Record<string, number> = { arterial: 3, collector: 2, local: 1 };
type Weighted = [string, number][];
const pick = (list: Weighted, r: number): string => {
  let left = r * list.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of list) if ((left -= w) <= 0) return id;
  return list[list.length - 1][0];
};
const PANELS: Record<string, Weighted> = {
  arterial: [['concrete', 4], ['concrete-stained', 3], ['rubber', 3], ['rubber-worn', 2], ['concrete-cracked', 1], ['asphalt', 2]],
  collector: [['rubber', 3], ['rubber-worn', 3], ['rubber-grey', 2], ['concrete-stained', 2], ['timber-tarred', 2], ['asphalt', 2], ['concrete-cracked', 1]],
  local: [['timber', 3], ['timber-old', 3], ['timber-tarred', 2], ['timber-grey', 2], ['rubber-worn', 2], ['rubber-grey', 1], ['asphalt', 2], ['asphalt-broken', 2], ['steel-plate', 1]],
  alley: [['timber-old', 3], ['timber-grey', 3], ['asphalt-broken', 2], ['steel-rusty', 2], ['gravel', 2]],
  path: [['timber-grey', 3], ['timber-old', 2], ['gravel', 3], ['steel-plate', 1], ['rubber-grey', 1]],
};
/** What the road looks like at a crossing with these panels: new panels come with a new road, old ones with an old one. */
const ROADS: Record<string, Weighted> = {
  new: [['', 3], ['rail/xing-road-fresh', 3], ['rail/xing-road-used', 2], ['rail/xing-road-concrete', 1]],
  used: [['', 3], ['rail/xing-road-used', 3], ['rail/xing-road-rusty', 2], ['rail/xing-road-patched', 2], ['rail/xing-road-oily', 1]],
  old: [['', 2], ['rail/xing-road-cracked', 3], ['rail/xing-road-patched', 3], ['rail/xing-road-rusty', 2], ['rail/xing-road-oily', 1]],
};
const PANEL_AGE: Record<string, keyof typeof ROADS> = {
  concrete: 'new', rubber: 'new', timber: 'used', 'steel-plate': 'used', asphalt: 'used', 'concrete-stained': 'used', 'rubber-worn': 'used', 'timber-tarred': 'used', setts: 'used',
};

/**
 * Surfaces of a level crossing. Busier roads get heavier panels, the freight branch and back streets older ones, and
 * within that every crossing draws its own, so that no two in a row look the same.
 */
export function crossingLook(seed: number, c: { edge: number; line: number }, cls: string, line: 'main' | 'freight', district: string, asphalt: string): CrossingLook {
  const r = (k: number): number => hash(seed * 7 + c.edge * 131 + c.line * 17 + k);
  let list = PANELS[cls] ?? PANELS.local;
  // The branch is maintained less: nothing new on it. Old towns keep their setts.
  if (line === 'freight') list = [...list.filter(([id]) => PANEL_AGE[id] !== 'new'), ['steel-rusty', 2], ['timber-old', 2], ['asphalt-broken', 2]];
  if (district === 'oldtown' || district === 'beach') list = [...list, ['setts', district === 'oldtown' ? 6 : 2]];
  const id = pick(list, r(1));
  const age = PANEL_AGE[id] ?? 'old';
  const unpaved = id === 'gravel';
  const road = unpaved ? '' : pick(ROADS[age], r(2));
  // Between two tracks either the road carries on or the panels do.
  const field = unpaved || r(3) < 0.3 ? `rail/xing-${id}` : road || asphalt;
  const quiet = line === 'freight' || cls === 'alley' || cls === 'path';
  return {
    panel: `rail/xing-${id}`,
    field,
    approach: road || asphalt,
    flange: age === 'new' || (age === 'used' && r(4) < 0.4) ? 'rail/xing-flangeway-rubber' : 'rail/xing-flangeway',
    head: quiet ? (r(5) < 0.35 ? 'rail/head-rusty' : 'rail/head-dull') : r(5) < 0.25 ? 'rail/head-dull' : 'rail/head-bright',
  };
}

/** Tracks, viaducts, bridges, tunnel mouths, level crossings and stations along the generated railway. */
export function buildRailModel(city: City, roads: RoadModel): RailModel {
  const t = city.terrain;
  const profile = roads.rail;
  const items: RailItem[] = [];
  const stations: BuiltStation[] = [];
  const stats = { ground: 0, elevated: 0, bridge: 0, tunnel: 0, piers: 0, buffers: 0, turnouts: 0, triangles: 0 };
  const builders = new Map<number, MeshBuilder>();
  const tile = (x: number, y: number): MeshBuilder => {
    const key = clamp(Math.floor(x / TILE), 0, 63) * 64 + clamp(Math.floor(y / TILE), 0, 63);
    let b = builders.get(key);
    if (!b) builders.set(key, (b = new MeshBuilder()));
    return b;
  };
  const looks: CrossingLook[] = [];
  const onRoad = roadCover(city, roads);
  const groundAt = (x: number, y: number): number => {
    const fx = clamp(x / t.cell, 0, t.n - 1.001);
    const fy = clamp(y / t.cell, 0, t.n - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const [u, v] = [fx - i, fy - j];
    const g = roads.ground;
    const k = j * t.n + i;
    return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + t.n] * (1 - u) + g[k + t.n + 1] * u) * v;
  };

  /** Whether a point is on the ballast of a line other than `own` (where a branch leaves the main line). */
  const onOtherLine = (x: number, y: number, own: number): boolean =>
    profile.lines.some((o) => o.line !== own && o.pts.some((p, i) => o.structure[i] !== 'tunnel' && Math.hypot(p.x - x, p.y - y) < o.tracks * 2 + 9));

  profile.lines.forEach((tr) => {
    const n = tr.pts.length;
    const lats = LATS[tr.tracks] ?? LATS[1];
    const reach = Math.max(...lats) + 1.75 + 1.5 * BED;
    const curve = routeCurve(tr);
    const lift = (s: number): number => trackAt(tr, s).h - TOP;
    const wayOn = (b: MeshBuilder): Way => ({ b, f: stand(), c: curve, lift });
    const probe = wayOn(new MeshBuilder());
    const gradeAt = (s: number): number => (lift(Math.min(tr.s[n - 1], s + 2)) - lift(Math.max(0, s - 2))) / (Math.min(tr.s[n - 1], s + 2) - Math.max(0, s - 2) || 1);
    const style: TrackStyle = tr.kind === 'main' ? (hash(city.config.seed + 3) < 0.5 ? STYLES.concrete : STYLES['concrete-stained']) : STYLES['wood-old'];
    const ties = tr.kind === 'main' ? (style === STYLES.concrete ? 'track/ties-concrete' : 'track/ties-concrete-stained') : 'track/ties-wood-old';
    const mine = profile.crossings.map((c, id) => ({ c, id })).filter(({ c }) => c.line === tr.line);
    /** Half the length of track that a crossing's road covers. */
    const cover = (c: LevelCrossing): number => c.outer / (Math.abs(c.tan.x * c.dir.y - c.tan.y * c.dir.x) || 1) + 2;
    const bare = profile.unbuilt.filter((u) => u.line === tr.line);
    const through = profile.through.filter((x) => x.line === tr.line);
    const nearCrossing = (s: number, pad: number): boolean =>
      mine.some(({ c }) => Math.abs(c.s - s) < cover(c) + pad) || bare.some((u) => Math.abs(u.s - s) < 20 + pad) || through.some((x) => s > x.s0 - 2 - pad && s < x.s1 + 2 + pad);

    // --- Stations: where they fit between crossings and changes of structure. ---
    const wide = new Uint8Array(n);
    const plans: { st: (typeof city.stations)[number]; s0: number; s1: number }[] = [];
    const total = tr.s[n - 1];
    for (const st of city.stations) {
      if (st.line !== tr.line) continue;
      const kind = tr.structure[st.index];
      if (kind !== 'ground' && kind !== 'elevated') continue;
      const sc = tr.s[st.index];
      const want = st.kind === 'central' ? 180 : 140;
      // The longest stretch near the planned spot with one kind of structure and no road across it.
      const ok = (i: number): boolean => i >= 1 && i < n - 1 && tr.structure[i] === kind && !nearCrossing(tr.s[i], 14);
      let best: { i0: number; i1: number; score: number } | null = null;
      for (let i = 0; i < n; i++) {
        if (!ok(i) || Math.abs(tr.s[i] - sc) > 220) continue;
        let j = i;
        while (j + 1 < n && ok(j + 1) && tr.s[j + 1] - sc <= 220) j++;
        const len = Math.min(tr.s[j] - tr.s[i], want);
        if (len >= 60) {
          // Within the stretch, as near the planned spot as the platforms' length allows.
          let a = i;
          while (a < j && tr.s[j] - tr.s[a + 1] >= len && (tr.s[a] + tr.s[a] + len) / 2 < sc) a++;
          let b = a;
          while (b < j && tr.s[b] - tr.s[a] < len - 1e-6) b++;
          const score = len - 0.2 * Math.abs((tr.s[a] + tr.s[b]) / 2 - sc);
          if (!best || score > best.score) best = { i0: a, i1: b, score };
        }
        i = j;
      }
      if (!best || tr.s[best.i1] > total - 10) continue;
      plans.push({ st, s0: tr.s[best.i0], s1: tr.s[best.i1] });
      if (kind === 'elevated') for (let i = best.i0; i < best.i1; i++) wide[i] = 1;
    }
    const inStation = (s: number, pad: number): boolean => plans.some((p) => s > p.s0 - pad && s < p.s1 + pad);

    // --- Turnouts: where a branch leaves this line, the track on its side carries the points. ---
    const points: { lat: number; s0: number; s1: number }[] = [];
    for (const br of profile.lines) {
      if (br.line === tr.line || br.kind !== 'freight' || tr.kind !== 'main') continue;
      const [p0, p1] = [br.pts[0], br.pts[1]];
      let [sm, near] = [0, Infinity];
      for (let i = 0; i + 1 < n; i++) {
        const q = pointSeg(p0.x, p0.y, tr.pts[i], tr.pts[i + 1]);
        if (q.d < near) [near, sm] = [q.d, tr.s[i] + q.t * (tr.s[i + 1] - tr.s[i])];
      }
      if (near > 12) continue;
      const f = poseAt(probe, sm);
      const across = (p0.x - f.o[0]) * f.x[0] + (p0.y - f.o[2]) * f.x[2];
      const side = across >= 0 ? 1 : -1;
      const lat = side * Math.max(...lats);
      // The branch starts where the turnout ends: this far off the track it leaves, and turned this far from it.
      const y0 = Math.abs(across) - Math.abs(lat);
      const d = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
      const h = [(p1.x - p0.x) / d, (p1.y - p0.y) / d];
      const along = h[0] * f.z[0] + h[1] * f.z[2];
      const a = Math.atan2((h[0] * f.x[0] + h[1] * f.x[2]) * side, Math.abs(along));
      if (y0 < 1 || a < 0.05) continue;
      // The curve that leaves the track as a tangent and reaches that point at that angle (measured half a step on).
      const k = 0.5 * d * a + y0;
      const R = (k + Math.sqrt(Math.max(0, k * k - 0.25 * d * d * a * a))) / (a * a);
      const lead = a * R - d / 2;
      const toe = 3;
      const sense = along >= 0 ? 1 : -1;
      const from = sm - sense * (lead + toe);
      if (lead < 15 || lead > 80 || from < 0 || from > tr.s[n - 1]) continue;
      const [A, B] = [pt(probe, lat, 0, from), pt(probe, lat, 0, sm)];
      const l = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) || 1;
      const z: V3 = [(B[0] - A[0]) / l, (B[1] - A[1]) / l, (B[2] - A[2]) / l];
      const xl = Math.hypot(z[0], z[2]) || 1;
      const x: V3 = [z[2] / xl, 0, -z[0] / xl];
      const y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const dir = (x[0] * f.x[0] + x[2] * f.x[2]) * side >= 0 ? 1 : -1;
      turnout(tile(A[0], A[2]), { o: A, x, y, z }, { dir, len: lead + toe, R, toe, style, lever: 'machine' });
      const [s0, s1] = [Math.min(from, sm), Math.max(from, sm)];
      points.push({ lat, s0, s1 });
      // On a viaduct the deck is wider on the side the branch leaves on, as far as where it has its own.
      for (let i = 0; i < n - 1; i++) if (tr.structure[i] !== 'ground' && !wide[i] && tr.s[i + 1] > s0 - 5 && tr.s[i] < s1 + 15) wide[i] = side > 0 ? 2 : 3;
      stats.turnouts++;
    }
    /** The parts of s0..s1 where the track at `lat` is plain: not inside a turnout. */
    const plain = (lat: number, s0: number, s1: number): [number, number][] => {
      let runs: [number, number][] = [[s0, s1]];
      for (const p of points) {
        if (p.lat !== lat) continue;
        runs = runs.flatMap(([a, b]): [number, number][] => (b <= p.s0 || a >= p.s1 ? [[a, b]] : [[a, Math.min(b, p.s0)], [Math.max(a, p.s1), b]]));
      }
      return runs.filter(([a, b]) => b - a > 0.05);
    };

    // --- Track, structure by structure. ---
    const segKind = (i: number): SegKind => {
      const [a, b] = [tr.structure[i], tr.structure[i + 1]];
      return a === b ? a : a === 'tunnel' || b === 'tunnel' ? 'tunnel' : a === 'bridge' || b === 'bridge' ? 'bridge' : 'elevated';
    };
    const layTrack = (w: Way, s0: number, s1: number): void => {
      bed(w, s0, s1, { mat: style.ballast, l: -Math.min(...lats) + 1.75, r: Math.max(...lats) + 1.75, caps: false });
      for (const d of lats) {
        const side = sideWay(w, d);
        for (const [a, b] of plain(d, s0, s1)) {
          stain(side, a, b, style.stain);
          for (const g of [-G, G]) rail(side, a, b, g, { head: style.head, side: style.side, caps: false });
        }
      }
    };
    const pier = (b: MeshBuilder, s: number, half: number, mat: string): void => {
      let at = s;
      const free = (q: number): boolean => {
        const p = pt(probe, 0, 0, q);
        return !onRoad(p[0], p[2], half * 0.42 + 0.6);
      };
      if (!free(at)) {
        const alt = [4, -4, 8, -8].map((d) => s + d).find(free);
        if (alt === undefined) return;
        at = alt;
      }
      const f = poseAt(wayOn(b), at);
      const foot = Math.min(groundAt(f.o[0], f.o[2]), 0) - 0.6 - f.o[1];
      if (-2.2 - foot < 0.4) return;
      box(b, mat, f, [0, (foot - 2.2) / 2, 0], [half * 0.42, (-2.2 - foot) / 2, 0.75], 'Y');
      box(b, mat, f, [0, -1.85, 0], [half - 1, 0.35, 0.95]);
      stats.piers++;
    };
    for (let i = 0; i < n - 1; ) {
      const kind = segKind(i);
      const w0 = wide[i];
      let j = i;
      while (j < n - 1 && j - i < 10 && segKind(j) === kind && wide[j] === w0) j++;
      const [s0, s1] = [tr.s[i], tr.s[j]];
      const mid = tr.pts[(i + j) >> 1];
      const b = tile(mid.x, mid.y);
      const w = wayOn(b);
      stats[kind] += s1 - s0;
      if (kind === 'ground' || kind === 'tunnel') {
        // Formation: the shoulder of earth and gravel the ballast lies on, wide enough to meet the graded ground.
        if (kind === 'ground') sweep(w, 'ground/gravel-dirt', s0, s1, [[-reach - 2.6, -1], [-reach - 0.7, 0], [reach + 0.7, 0], [reach + 2.6, -1]], { uv: 'across' });
      } else {
        const plainHalf = tr.tracks > 1 ? 4.7 : 3;
        const half = w0 === 1 ? 9.4 : w0 ? plainHalf + TURNOUT_DECK / 2 : plainHalf;
        const steel = kind === 'bridge';
        viaduct(w0 > 1 ? sideWay(w, (w0 === 2 ? 1 : -1) * TURNOUT_DECK / 2) : w, s0, s1, 0, half, [], steel ? { wall: 'structure/steel-green-rusty' } : {});
        const first = i === 0 || segKind(i - 1) !== kind;
        const span = steel ? 24 : 20;
        for (let s = Math.ceil((s0 - (first ? span / 2 : 0)) / span) * span + (first ? span / 2 : 0); s < s1; s += span) if (s >= s0) pier(b, s, w0 === 1 ? 6.5 : plainHalf, steel ? 'structure/stone-ashlar' : 'structure/pier-formwork');
        // Abutments where the deck meets the embankment.
        for (const [s, other] of [[s0, i > 0 ? segKind(i - 1) : kind], [s1, j < n - 1 ? segKind(j) : kind]] as [number, SegKind][]) {
          if (other !== 'ground') continue;
          const f = poseAt(w, s);
          box(b, steel ? 'structure/stone-ashlar' : 'structure/wall-smooth', f, [0, -3, 0], [half + 0.4, 3, 0.9]);
        }
      }
      layTrack(w, s0, s1);
      i = j;
    }
    // The branch stops short of the map's edge, at a buffer.
    if (tr.kind === 'freight' && tr.structure[n - 1] === 'ground') {
      const end = tr.pts[n - 1];
      const w = wayOn(tile(end.x, end.y));
      const kinds = ['timber', 'steel', 'concrete', 'steel'] as const;
      for (const d of lats) bufferStop(sideWay(w, d), tr.s[n - 1] - 1.4, kinds[Math.floor(hash(city.config.seed * 3 + tr.line) * kinds.length)]);
      stats.buffers++;
    }
    // Sleepers: one run per structure, so that the ladders line up from end to end.
    for (let i = 0; i < n - 1; ) {
      const kind = segKind(i);
      let j = i;
      while (j < n - 1 && segKind(j) === kind) j++;
      if (kind !== 'tunnel' || j - i < 6) {
        const count = Math.max(1, Math.round((tr.s[j] - tr.s[i]) / LADDER));
        const step = (tr.s[j] - tr.s[i]) / count;
        for (let k = 0; k < count; k++) {
          const s = tr.s[i] + (k + 0.5) * step;
          const g = gradeAt(s);
          for (const d of lats) {
            if (points.some((p) => p.lat === d && s > p.s0 && s < p.s1)) continue;
            const f = poseAt(probe, s, d);
            items.push({ model: ties, kind: 'ties', x: f.o[0], y: f.o[2], h: f.o[1], yaw: facing({ x: f.z[0], y: f.z[2] }), slopeZ: g, line: tr.line });
          }
        }
      }
      // Tunnel mouths face outwards from both ends of a bore.
      if (kind === 'tunnel') {
        for (const [idx, sign] of [[i, -1], [j, 1]] as [number, number][]) {
          if (idx <= 0 || idx >= n - 1) continue;
          const f = poseAt(probe, tr.s[idx]);
          items.push({ model: tr.tracks > 1 ? 'infra/tunnel-portal-rail-double' : 'infra/tunnel-portal-rail', kind: 'portal', x: f.o[0], y: f.o[2], h: f.o[1], yaw: facing({ x: f.z[0] * sign, y: f.z[2] * sign }), line: tr.line });
        }
      }
      i = j;
    }

    // --- Fences along the open track on the ground. ---
    const fenceLat = reach + 2.2;
    for (let i = 0; i < n - 1; ) {
      let j = i;
      while (j < n - 1 && segKind(j) === segKind(i)) j++;
      if (segKind(i) === 'ground') {
        const count = Math.max(1, Math.ceil((tr.s[j] - tr.s[i]) / PANEL));
        const step = (tr.s[j] - tr.s[i]) / count;
        for (let k = 0; k < count; k++) {
          const s = tr.s[i] + (k + 0.5) * step;
          if (nearCrossing(s, PANEL / 2 + 1.5) || inStation(s, PANEL / 2 + 4)) continue;
          const type = districtAt(t, city.districts, trackAt(tr, s).p.x, trackAt(tr, s).p.y).type;
          const nearStation = plans.some((p) => s > p.s0 - 250 && s < p.s1 + 250);
          const model =
            nearStation ? 'railpart/fence-palisade'
            : type === 'residential' || type === 'suburb' || type === 'oldtown' ? 'railpart/fence-concrete'
            : type === 'industrial' ? (k % 6 === 2 ? 'railpart/fence-chainlink-signs' : 'railpart/fence-chainlink-barbed')
            : k % 6 === 2 ? 'railpart/fence-chainlink-signs' : 'railpart/fence-chainlink';
          for (const side of [-1, 1]) {
            const f = poseAt(probe, s, side * fenceLat);
            const [x, y] = [f.o[0], f.o[2]];
            if (isWater(t, x, y) || onRoad(x, y, 0.5) || onOtherLine(x, y, tr.line)) continue;
            // Panels stand on the ground beside the formation and follow the grade of the track.
            items.push({ model, kind: 'fence', x, y, h: f.o[1] - 0.6, yaw: Math.atan2(f.z[2], f.z[0]), slopeX: gradeAt(s), line: tr.line });
          }
        }
      }
      i = j;
    }

    // --- Level crossings. ---
    for (const { c, id } of mine) {
      const e = city.graph.edges[c.edge];
      const road = roads.lines[c.edge]!;
      const sec = roads.sections[c.edge];
      const b = tile(c.x, c.y);
      const T = c.tan;
      const N = { x: T.y, y: -T.x };
      const r = c.dir;
      const m = { x: -r.y, y: r.x };
      const [Nm, Tm, Nr] = [N.x * m.x + N.y * m.y, T.x * m.x + T.y * m.y, N.x * r.x + N.y * r.y];
      const top = c.h - 0.006;
      /** Corner on the track-parallel line at `lat`, where it meets the road edge on side e (-1 / 1). */
      const corner = (lat: number, e2: number, half = c.outer): V3 => {
        const tau = (e2 * half - lat * Nm) / Tm;
        return [c.x + N.x * lat + T.x * tau, top, c.y + N.y * lat + T.y * tau];
      };
      const up = (mat: string, p: V3[], layer: number): void => {
        const [a, q, d] = [p[0], p[1], p[2]];
        const cy = (q[2] - a[2]) * (d[0] - a[0]) - (q[0] - a[0]) * (d[2] - a[2]);
        const o = cy > 0 ? p : [p[1], p[0], p[3], p[2]];
        const uv = o.map((v) => [(v[0] - c.x) * T.x + (v[2] - c.y) * T.y, (v[0] - c.x) * N.x + (v[2] - c.y) * N.y] as [number, number]);
        b.quad(mat, o[0], o[1], o[2], o[3], uv, layer, [0, 1, 0]);
      };
      const strip = (mat: string, l0: number, l1: number, layer = 1): void => up(mat, [corner(l0, -1), corner(l0, 1), corner(l1, 1), corner(l1, -1)], layer);
      const look = crossingLook(city.config.seed, c, e.cls, tr.kind, districtAt(t, city.districts, c.x, c.y).type, sec.asphalt);
      looks[id] = look;
      const { panel } = look;
      /** A strip along the track that lies above or below the deck (rail heads, flangeways). */
      const band = (mat: string, l0: number, l1: number, dy: number): void => {
        const p = [corner(l0, -1), corner(l0, 1), corner(l1, 1), corner(l1, -1)].map((v) => [v[0], v[1] + dy, v[2]] as V3);
        up(mat, p, 1);
      };
      for (const d of lats) {
        strip(panel, d - G - 0.635, d - G - 0.045);
        strip(panel, d - G + 0.105, d + G - 0.105);
        strip(panel, d + G + 0.045, d + G + 0.635);
        for (const sg of [-1, 1]) {
          // The groove for the wheel flanges inside each rail, and the running surface the road traffic polishes or leaves to rust.
          band(look.flange, d + sg * G - sg * 0.105, d + sg * G - sg * 0.035, -0.04);
          band(look.head, d + sg * G - 0.036, d + sg * G + 0.036, 0.009);
        }
      }
      // Road surface between and beside the tracks, easing down to the road on both sides.
      for (let k = 0; k + 1 < lats.length; k++) strip(look.field, lats[k] + G + 0.635, lats[k + 1] - G - 0.635);
      const outer = Math.max(...lats) + G + 0.635;
      for (const sgn of [-1, 1]) {
        // The carriageway climbs onto the deck; the pavements are already at its level.
        const edge = roadAt(road, c.x + N.x * sgn * outer, c.y + N.y * sgn * outer);
        const ramp = Math.max(1.2 + c.table * 16, (c.h - edge.h) * 14);
        const far = (e2: number): V3 => {
          const p = corner(sgn * (outer + ramp), e2, c.half);
          return [p[0], roadAt(road, p[0], p[2]).h - 0.05, p[2]];
        };
        up(look.approach, [corner(sgn * outer, -1, c.half), corner(sgn * outer, 1, c.half), far(1), far(-1)], 1);
        if (c.outer > c.half + 0.3) for (const e2 of [-1, 1]) up(panel, [corner(sgn * outer, e2, c.half), corner(sgn * outer, e2), corner(sgn * (outer + 0.6), e2), corner(sgn * (outer + 0.6), e2, c.half)], 1);
      }
      // What guards the crossing: one unit on the right of each approach, facing the traffic.
      const guard = e.cls === 'arterial' ? 'signal/rail-cantilever-gate' : e.cls === 'collector' ? 'signal/rail-gate-up' : e.cls === 'local' ? 'signal/rail-flashers-both' : 'signal/rail-crossbuck';
      const lay = layout(sec);
      const paint = sec.paint;
      // Distance along the road from the middle of the crossing to clear of the outermost rail.
      const clear = (outer + Math.max(2.8, 1.6 + c.table * 16)) / Math.abs(Nr) + (c.half * Math.abs(T.x * r.x + T.y * r.y)) / Math.abs(Nr);
      for (const sgn of [-1, 1]) {
        // Traffic on this approach heads along `go` and keeps to its right-hand side.
        const go = { x: r.x * sgn, y: r.y * sgn };
        const right = { x: -go.y, y: go.x };
        const kerb = sgn > 0 ? lay.road[1] : -lay.road[0];
        /** Point `back` metres before the crossing and `off` to the right of the road's centre line, following the road. */
        const spot = (back: number, off: number): { x: number; y: number; h: number; d: number; dir: Vec2 } => {
          const at = roadAt(road, c.x - go.x * back, c.y - go.y * back);
          const k = -at.dir.y * right.x + at.dir.x * right.y >= 0 ? 1 : -1;
          return { x: at.p.x - at.dir.y * k * off, y: at.p.y + at.dir.x * k * off, h: at.h, d: at.d, dir: { x: at.dir.x * k, y: at.dir.y * k } };
        };
        const put = (model: string, kind: RailItemKind, back: number, off: number): void => {
          const p = spot(back, off);
          // Where the road ends at a junction before that, the post stands at its end, if that is clear of the rails.
          if (p.d > 14 || Math.abs((p.x - c.x) * N.x + (p.y - c.y) * N.y) < outer + 1.2 || isWater(t, p.x, p.y)) return;
          items.push({ model, kind, x: p.x, y: p.y, h: Math.max(p.h, groundAt(p.x, p.y)) + 0.1, yaw: facing({ x: -p.dir.x, y: -p.dir.y }), line: tr.line, crossing: id });
        };
        put(guard, 'gate', clear + 0.6, kerb + 0.9);
        if (e.cls !== 'alley' && e.cls !== 'path') put(hash(c.edge) < 0.3 ? 'sign/warn-rr-advance-old' : 'sign/warn-rr-advance', 'sign', clear + 55, kerb + 0.8);
        if (e.cls === 'alley' || e.cls === 'path') continue;
        // Stop line and the RXR symbol on the approach lanes, lying on the road.
        const onRoadAt = (back: number, off: number): V3 => {
          const p = spot(back, off);
          return [p.x, p.h + 0.012, p.y];
        };
        const lane0 = lay.lanes.length > 1 ? 0.15 : -kerb + 0.3;
        const stop = clear + 2.4;
        const mark = (mat: string, b0: number, b1: number, o0: number, o1: number): void => {
          const p = [onRoadAt(b1, o0), onRoadAt(b1, o1), onRoadAt(b0, o1), onRoadAt(b0, o0)];
          const cy = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]);
          const o = cy > 0 ? p : [p[1], p[0], p[3], p[2]];
          const uv: [number, number][] = cy > 0 ? [[0, 0], [o1 - o0, 0], [o1 - o0, b1 - b0], [0, b1 - b0]] : [[o1 - o0, 0], [0, 0], [0, b1 - b0], [o1 - o0, b1 - b0]];
          b.quad(mat, o[0], o[1], o[2], o[3], uv, 2, [0, 1, 0]);
        };
        if (spot(stop + 14, 0).d < 1) {
          mark(`crosswalk/stop-line-${paint}`, stop, stop + 0.6, lane0, kerb - 0.2);
          if (lay.lanes.length > 1) {
            const mid = (lane0 + kerb) / 2;
            mark(`symbol/railroad-x-${paint === 'faded' ? 'worn' : paint}`, stop + 7, stop + 13, mid - 1.2, mid + 1.2);
          }
        }
      }
    }

    // --- Track through a junction: set into its surface from one side to the other, as a tramway is. ---
    for (const th of through) {
      const j = roads.junctions[th.junction];
      const arms = j.arms.filter((a) => Number.isFinite(a.reach));
      const cls = arms.map((a) => city.graph.edges[a.edge].cls).sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0))[0] ?? 'local';
      const mid = trackAt(tr, (th.s0 + th.s1) / 2);
      const w = wayOn(tile(mid.p.x, mid.p.y));
      const look = crossingLook(city.config.seed, { edge: th.edge, line: tr.line }, cls, tr.kind, districtAt(t, city.districts, mid.p.x, mid.p.y).type, roads.sections[th.edge].asphalt);
      const y = TOP - 0.006;
      const lay = (mat: string, l0: number, l1: number, dy = 0): void => sweep(w, mat, th.s0, th.s1, [[l0, y + dy], [l1, y + dy]], { layer: 1, step: 2, c0: l0 });
      for (const d of lats) {
        lay(look.panel, d - G - 0.635, d - G - 0.045);
        lay(look.panel, d - G + 0.105, d + G - 0.105);
        lay(look.panel, d + G + 0.045, d + G + 0.635);
        for (const sg of [-1, 1]) {
          lay(look.flange, d + sg * G - (sg > 0 ? 0.105 : -0.035), d + sg * G - (sg > 0 ? 0.035 : -0.105), -0.04);
          lay(look.head, d + sg * G - 0.036, d + sg * G + 0.036, 0.015);
        }
      }
      for (let k = 0; k + 1 < lats.length; k++) lay(look.field, lats[k] + G + 0.635, lats[k + 1] - G - 0.635);
      // The junction's own surface is a plane; the deck eases down to it on both sides.
      const SKIRT = 2.6;
      const [lo, hi] = [Math.min(...lats) - G - 0.635, Math.max(...lats) + G + 0.635];
      const drop = (s: number, lat: number): number => {
        const p = pt(probe, lat, 0, s);
        return Math.max(0.02, trackAt(tr, s).h - (j.plane.h + j.plane.gx * (p[0] - j.x) + j.plane.gy * (p[2] - j.y)) + 0.04);
      };
      sweep(w, look.approach, th.s0, th.s1, (s) => [[lo - SKIRT, y - drop(s, lo - SKIRT)], [lo, y]], { layer: 1, step: 2 });
      sweep(w, look.approach, th.s0, th.s1, (s) => [[hi, y], [hi + SKIRT, y - drop(s, hi + SKIRT)]], { layer: 1, step: 2 });
      // Flashing lights face the traffic that comes in on each road, back from the junction's own signals.
      for (const a of arms) {
        if (cls === 'alley' || cls === 'path') break;
        const lane = layout(roads.sections[a.edge]);
        const kerb = Math.max(-lane.road[0], lane.road[1]);
        const [bx, by] = [j.x + a.dir.x * (a.reach + 5), j.y + a.dir.y * (a.reach + 5)];
        // Traffic heads for the centre; its right-hand side is where the post stands.
        const [x, yy] = [bx + a.dir.y * (kerb + 0.9), by - a.dir.x * (kerb + 0.9)];
        const clear = Math.min(...tr.pts.map((p) => Math.hypot(p.x - x, p.y - yy)));
        if (clear < hi + 2.5 || isWater(t, x, yy)) continue;
        items.push({ model: 'signal/rail-flashers-both', kind: 'gate', x, y: yy, h: groundAt(x, yy) + 0.1, yaw: facing(a.dir), line: tr.line });
      }
    }

    // --- Stations. ---
    for (const { st, s0, s1 } of plans) {
      const sc = (s0 + s1) / 2;
      const here = trackAt(tr, sc);
      const b = tile(here.p.x, here.p.y);
      const w = wayOn(b);
      const elevated = tr.structure[here.i] === 'elevated';
      const central = st.kind === 'central';
      const dt = city.districts.downtown.center;
      const mid = poseAt(w, sc);
      const old = !central && !elevated && st.id % 2 === 1;
      const h = old ? LOW : HIGH;
      const [name, colour] = central ? ['central', 'blue'] : STATION_NAMES[st.id % STATION_NAMES.length];
      const board = `rail/name-${name}-${colour}`;
      const outerX = central ? 9.4 : 8.4;
      const cs = central ? 0.36 : 0.24;
      const [c0, c1] = [sc - (s1 - s0) * cs, sc + (s1 - s0) * cs];
      // Station building on the side towards downtown, unless a road is in its way there; on a viaduct it stands on the ground below.
      const edge = elevated ? 9.4 + 4.6 : outerX + 0.6;
      const fits = (sd: number, at: number, hw: number, hd: number): boolean => {
        for (let ds = -hw / 2 - 1; ds <= hw / 2 + 1; ds += 3)
          for (let dl = edge - 0.5; dl <= edge + hd + 3.5; dl += 2) {
            const p = pt(probe, sd * dl, 0, at + ds);
            if (onRoad(p[0], p[2], 0.5) || isWater(t, p[0], p[2])) return false;
          }
        return true;
      };
      const towards: 1 | -1 = (dt.x - here.p.x) * mid.x[0] + (dt.y - here.p.y) * mid.x[2] >= 0 ? 1 : -1;
      // Where the building of its rank does not fit on either side anywhere along the platforms, a smaller one may.
      const sizes: [number, number, number][] = central ? [[34, 11, 7], [20, 8, 5.2]] : old ? [[20, 8, 5.2], [12, 6, 4.2]] : [[18, 7, 4.2], [12, 6, 4]];
      let found: { side: 1 | -1; at: number; size: [number, number, number] } | null = null;
      for (const size of sizes)
        for (const sd of [towards, -towards] as (1 | -1)[])
          for (const q of [-0.15, 0.15, -0.32, 0.32, 0]) {
            const at = sc + (s1 - s0) * q;
            if (!found && at - size[0] / 2 > s0 && at + size[0] / 2 < s1 && fits(sd, at, size[0], size[1])) found = { side: sd, at, size };
          }
      const house = found !== null;
      const side: 1 | -1 = found?.side ?? towards;
      const [hw, hd, hh] = found?.size ?? sizes[0];
      const houseS = found?.at ?? sc;
      for (const sx of [-1, 1] as const) {
        const [x0, x1] = sx > 0 ? [2 + EDGE, outerX] : [-outerX, -2 - EDGE];
        platform(w, s0 + 4, s1 - 4, x0, x1, {
          h,
          track: sx > 0 ? [true, false] : [false, true],
          ends: elevated ? ['wall', 'wall'] : ['ramp', 'ramp'],
          ...(old ? { top: 'concrete/walk-square', face: 'rail/platform-face-brick', edge: 'rail/edge-text-behind' } : central ? { top: 'paving/slabs-granite', edge: 'rail/edge-line-yellow' } : { edge: 'rail/edge-text-gap' }),
        });
        const xc = sx * (outerX + 2 + EDGE) * 0.5;
        const so = canopy(w, c0, c1, xc, central ? { kind: 'vault', y: h, half: 2.7, steel: 'structure/steel-white' } : old ? { kind: 'heritage', y: h, half: 2.4 } : { kind: st.id % 3 === 0 ? 'gable' : 'flat', y: h, half: 2.2 });
        furnish(w, c0 + 2, c1 - 2, sx * (outerX - 1.4), h, { name: board, face: sx > 0 ? -1 : 1, soffit: central ? so - 0.5 : so, number: sx > 0 ? 1 : 2, clock: sx === side });
      }
      if (house) {
        const at0 = poseAt(w, houseS, side * (edge + hd / 2));
        const base = elevated ? groundAt(at0.o[0], at0.o[2]) : at0.o[1];
        const hf = turn({ ...at0, o: [at0.o[0], base, at0.o[2]] }, -90 * side);
        const pad = elevated ? 0.2 : h;
        podium(b, hf, hw, hd, pad, 5);
        stationHouse(
          b,
          move(hf, 0, pad, 0),
          central || old ? { seed: 5 + st.id, w: hw, d: hd, h: hh, wall: 'wall/brick-red-common', trim: 'trim/paint-cream', win: 'window/arch-white', roof: 'gable', roofMat: 'roof/slate-grey', over: central ? 0.8 : 0.6, sign: 'rail/entrance-station', clock: true }
          : { seed: 11 + st.id, w: hw, d: hd, h: hh, wall: 'wall/siding-cream', trim: 'trim/paint-green', win: 'window/sash-tall-white', roof: 'hip', roofMat: 'roof/shingle-green', over: 2.2, sign: 'rail/entrance-depot', name: board, clock: true },
        );
      }
      if (elevated) {
        // Stairs from the street to each platform, outside the deck.
        for (const sx of [-1, 1]) {
          const top = poseAt(w, sc + 10, sx * (9.4 + 1.5), h);
          const foot = groundAt(top.o[0], top.o[2]);
          const rise = top.o[1] - foot;
          const steps = Math.max(1, Math.round(rise / 0.17));
          const run = (steps - 1) * 0.29 + (steps > 18 ? 1.21 : 0);
          const start = poseAt(w, sc + 10 - run, sx * (9.4 + 1.5), 0);
          stairs(b, { ...start, o: [start.o[0], foot, start.o[2]] }, rise, 2.4, { solid: false });
          box(b, 'structure/wall-smooth', top, [-sx * 1.3, -0.12, 1.3], [2.6, 0.12, 1.4]);
        }
      } else {
        if (house) tvm(b, turn(poseAt(w, sc + (s1 - s0) * 0.2, side * (outerX - 0.7), h), -90 * side), 'blue');
        // The footbridge is at the end away from the building, its stairs running on towards that end.
        const end = houseS < sc ? 1 : -1;
        footbridge(b, poseAt(w, end > 0 ? s1 - 26 : s0 + 26, 0, 0), { x0: -outerX - 1.4, x1: outerX + 1.4, foot: [0, 0], dir: [end, end], kind: central ? 'closed' : old ? 'truss' : 'open', steel: central ? 'structure/steel-grey' : 'structure/steel-green' });
      }
      stations.push({ id: st.id, kind: st.kind, x: here.p.x, y: here.p.y, s0, s1, h: mid.o[1] + h, side, platforms: 2, house });
      // Signals guard both ends of the station, each with its relay case.
      for (const [s, dir] of [[s0 - 35, 1], [s1 + 35, -1]] as [number, number][]) {
        if (s < 20 || s > total - 20 || tr.structure[trackAt(tr, s).i] !== 'ground' || nearCrossing(s, 6)) continue;
        const f = poseAt(probe, s, dir * (Math.max(...lats) + 2.7));
        if (onRoad(f.o[0], f.o[2], 1)) continue;
        const yaw = facing({ x: -f.z[0] * dir, y: -f.z[2] * dir });
        items.push({ model: central ? 'railpart/signal-double' : 'railpart/signal-3', kind: 'signal', x: f.o[0], y: f.o[2], h: f.o[1] + 0.3, yaw, line: tr.line });
        const g = poseAt(probe, s + dir * 3, dir * (Math.max(...lats) + 3.4));
        items.push({ model: st.id % 2 ? 'railpart/relay-case-tagged' : 'railpart/relay-case', kind: 'signal', x: g.o[0], y: g.o[2], h: g.o[1], yaw, line: tr.line });
      }
    }
    // Block signals on the open line, and a whistle post ahead of each crossing.
    if (tr.kind === 'main') {
      for (let s = 350; s < tr.s[n - 1] - 100; s += 700) {
        for (const dir of [1, -1]) {
          const at = s + (dir > 0 ? 0 : 40);
          if (tr.structure[trackAt(tr, at).i] !== 'ground' || nearCrossing(at, 8) || inStation(at, 60)) continue;
          const f = poseAt(probe, at, dir * (Math.max(...lats) + 2.7));
          if (onRoad(f.o[0], f.o[2], 1)) continue;
          items.push({ model: 'railpart/signal-3', kind: 'signal', x: f.o[0], y: f.o[2], h: f.o[1] + 0.3, yaw: facing({ x: -f.z[0] * dir, y: -f.z[2] * dir }), line: tr.line });
        }
      }
    }
    for (const { c } of mine) {
      for (const dir of [1, -1]) {
        const s = c.s - dir * 140;
        if (s < 10 || s > tr.s[n - 1] - 10 || tr.structure[trackAt(tr, s).i] !== 'ground' || nearCrossing(s, 4) || inStation(s, 4)) continue;
        const f = poseAt(probe, s, dir * (Math.max(...lats) + 2.4));
        if (onRoad(f.o[0], f.o[2], 1)) continue;
        items.push({ model: 'railpart/whistle', kind: 'sign', x: f.o[0], y: f.o[2], h: f.o[1], yaw: facing({ x: -f.z[0] * dir, y: -f.z[2] * dir }), line: tr.line });
      }
    }
  });

  const tiles = [...builders.values()].map((b) => b.build());
  stats.triangles = tiles.reduce((sum, m) => sum + m.triangles, 0);
  return { tiles, items, crossings: profile.crossings, looks, stations, stats, unbuilt: profile.unbuilt.length };
}
