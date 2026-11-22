import { MeshBuilder, ModelData } from '../assets/mesh/builder';
import { layout, roadWidth } from '../assets/mesh/section';
import { catmullRom, polyLength, pointAt, resample, simplify } from '../core/geom';
import { Heap } from '../core/heap';
import { Vec2 } from '../core/vec2';
import { DistrictType, districtAt } from '../gen/districts';
import { FREE, PARK, SITE_CELL, Site, SiteItem, SiteKind, bbox, clearance, facing, hash, pick } from './site';

const C = SITE_CELL;
export type ParkTier = 'central' | 'district' | 'neighbourhood' | 'pocket';

export interface ParkEntrance {
  x: number;
  y: number;
  /** Unit vector into the park. */
  nx: number;
  ny: number;
  edge: number;
  main: boolean;
  /** Half width of the opening in the fence. */
  gap: number;
  /** Where the footpath to the entrance leaves the street, for a park that no street runs along. */
  from?: Vec2;
}
export interface ParkPath {
  pts: Vec2[];
  w: number;
  kind: 'main' | 'loop' | 'link';
}
export interface ParkFeature {
  type: string;
  x: number;
  y: number;
  yaw: number;
  /** Half extents along the feature's own axes. */
  hx: number;
  hz: number;
}
/** One piece of a park: the part of its circle that a road, the railway or the water does not cut off from the rest. */
export interface ParkPlan {
  park: number;
  tier: ParkTier;
  type: DistrictType;
  area: number;
  centre: Vec2;
  entrances: ParkEntrance[];
  paths: ParkPath[];
  features: ParkFeature[];
  /** Lawns kept free of trees. */
  lawns: { x: number; y: number; r: number }[];
  /** Fence along the streets, if any. */
  fence: string | null;
  /** Things that children play on, with the radius each needs to itself. */
  play: { x: number; y: number; r: number; model: string }[];
  /** Grass worn to earth, where people stand about and play. */
  worn: { x: number; y: number; r: number }[];
  /** Lines walked into the grass, off the paths. */
  trails: Vec2[][];
}

/** Shrubs and grasses under the trees of a grove. */
const UNDER: Record<string, string[]> = {
  beach: ['plant/shrub-hibiscus-red', 'plant/shrub-hibiscus-pink', 'plant/shrub-plumbago', 'plant/grass-fountain', 'plant/shrub-bougainvillea'],
  hills: ['plant/shrub-dry', 'plant/grass-fescue', 'plant/grass-tuft-dry', 'plant/shrub-broadleaf'],
  default: ['plant/shrub-broadleaf', 'plant/shrub-camellia', 'plant/shrub-box-light', 'plant/grass-fountain', 'plant/grass-patch', 'plant/shrub-box'],
};
/** Beds beside the main walks. */
const BEDS = ['plant/flower-strip', 'plant/flower-strip-red', 'plant/flower-lavender-row', 'plant/flower-bed-round', 'plant/grass-fountain-row', 'plant/hedge-low'];

// What a cell of a park holds.
const OUT = 0;
const LAWN = 1;
const SOLID = 2;
const PATH = 3;
const APRON = 4;
const OPEN = 6;

interface Sample { x: number; y: number; nx: number; ny: number; tx: number; ty: number; edge: number; side: number; s: number; width: number }
interface Rect { x: number; y: number; yaw: number; hx: number; hz: number }

const TREES: Record<string, string[]> = {
  beach: ['plant/palm-queen', 'plant/street-ficus', 'plant/street-jacaranda', 'plant/palm-date', 'plant/street-tabebuia'],
  hills: ['plant/street-oak', 'plant/street-eucalyptus', 'plant/street-olive', 'plant/street-oak-old'],
  downtown: ['plant/street-plane', 'plant/street-elm', 'plant/street-oak', 'plant/street-maple', 'plant/street-cherry'],
  oldtown: ['plant/street-plane-large', 'plant/street-elm', 'plant/street-oak-old', 'plant/street-magnolia'],
  industrial: ['plant/street-eucalyptus', 'plant/street-sparse', 'plant/street-poplar', 'plant/street-oak'],
  default: ['plant/street-oak', 'plant/street-maple', 'plant/street-plane', 'plant/street-spring', 'plant/street-birch', 'plant/street-jacaranda'],
};
const BENCHES: Record<ParkTier, string[]> = {
  central: ['furniture/bench-park-green', 'furniture/bench-park-dark-long'],
  district: ['furniture/bench-park', 'furniture/bench-park-green'],
  neighbourhood: ['furniture/bench-park-weathered', 'furniture/bench-park', 'furniture/bench-metal'],
  pocket: ['furniture/bench-park-weathered', 'furniture/bench-flat-weathered', 'furniture/bench-metal-mesh'],
};
const LIGHTS: Record<ParkTier, string> = { central: 'furniture/light-acorn-green', district: 'furniture/light-globe-green', neighbourhood: 'furniture/light-globe', pocket: 'furniture/light-lantern' };
const BINS: Record<ParkTier, string> = { central: 'furniture/bin-hood-green', district: 'furniture/bin-mesh-green', neighbourhood: 'furniture/bin-mesh', pocket: 'furniture/bin-drum' };
const SURFACES = ['site/safety-rubber-red', 'site/safety-rubber-green', 'site/safety-rubber-blue', 'site/woodchips'];
const PLAY: Record<string, string[]> = {
  big: ['park/play-structure-big', 'park/swing-4', 'park/slide-yellow', 'park/climb-dome-big', 'park/roundabout', 'park/seesaw', 'park/monkey-bars-long', 'park/sandbox-round', 'park/spring-rider-red', 'park/spring-rider-blue', 'park/spring-rider-yellow'],
  medium: ['park/play-structure', 'park/swing-2', 'park/slide-steel', 'park/climb-dome', 'park/seesaw', 'park/sandbox', 'park/spring-rider-green', 'park/spring-rider-red'],
  wood: ['park/play-structure-wood', 'park/swing-2', 'park/seesaw-wood', 'park/monkey-bars', 'park/sandbox', 'park/spring-rider-yellow', 'park/spring-rider-blue'],
  old: ['park/swing-old', 'park/slide-steel', 'park/roundabout-old', 'park/seesaw-wood', 'park/monkey-bars', 'park/sandbox'],
  small: ['park/swing-toddler', 'park/slide-small', 'park/sandbox', 'park/spring-rider-red', 'park/spring-rider-blue'],
  tiny: ['park/spring-rider-green', 'park/spring-rider-yellow', 'park/sandbox'],
};
const FLAT = /sandbox/;
/** Radius a piece of play equipment needs to itself: its own reach plus the room to fall or swing. */
export function playRadius(model: string): number {
  const { min, max } = bbox(model);
  const r = Math.hypot(max[0] - min[0], max[2] - min[2]) / 2;
  return FLAT.test(model) ? r * 0.75 + 0.3 : r + (/swing/.test(model) ? 1.3 : 0.9);
}

/** Smooth value noise in [0, 1]. */
function noise(seed: number, x: number, y: number, scale: number): number {
  const [fx, fy] = [x / scale, y / scale];
  const [i, j] = [Math.floor(fx), Math.floor(fy)];
  const [u, v] = [fx - i, fy - j];
  const [su, sv] = [u * u * (3 - 2 * u), v * v * (3 - 2 * v)];
  const a = hash(seed, i, j);
  const b = hash(seed, i + 1, j);
  const c = hash(seed, i, j + 1);
  const d = hash(seed, i + 1, j + 1);
  return a + (b - a) * su + (c + (d - c) * su - (a + (b - a) * su)) * sv;
}

/**
 * Lays out the parks: each park's circle, less the roads and whatever else cuts into it, gets entrances from the
 * streets around it, the things its size calls for (playgrounds, courts, a fountain, shelters), paths between them,
 * benches, lights, trees and a fence along the streets.
 */
export function placeParks(site: Site): { parks: ParkPlan[]; tiles: ModelData[] } {
  const { city, roads } = site;
  const seed = site.seed;
  const parks: ParkPlan[] = [];
  const tiles: ModelData[] = [];

  city.districts.parks.forEach((park, pi) => {
    const R = park.radius;
    const i0 = Math.floor((park.center.x - R) / C) - 1;
    const j0 = Math.floor((park.center.y - R) / C) - 1;
    const w = Math.ceil((2 * R) / C) + 3;
    const label = new Int32Array(w * w);
    const cx = (i: number): number => (i0 + i + 0.5) * C;
    const cy = (j: number): number => (j0 + j + 0.5) * C;
    for (let j = 0; j < w; j++)
      for (let i = 0; i < w; i++)
        if (Math.hypot(cx(i) - park.center.x, cy(j) - park.center.y) < R && site.at(cx(i), cy(j)) === FREE) label[j * w + i] = -1;
    // Pieces: connected parts of the circle.
    const pieces: number[][] = [];
    for (let k = 0; k < w * w; k++) {
      if (label[k] !== -1) continue;
      const cells = [k];
      label[k] = pieces.length + 1;
      for (let q = 0; q < cells.length; q++) {
        const c = cells[q];
        const [i, j] = [c % w, Math.floor(c / w)];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const [a, b] = [i + di, j + dj];
          if (a < 0 || b < 0 || a >= w || b >= w || label[b * w + a] !== -1) continue;
          label[b * w + a] = pieces.length + 1;
          cells.push(b * w + a);
        }
      }
      pieces.push(cells);
    }
    const b = new MeshBuilder();
    // The biggest piece is the park proper; what a road cuts off from it is laid out as a smaller park of its own.
    const biggest = pieces.reduce((a, c, i) => (c.length > pieces[a].length ? i : a), 0);
    pieces.forEach((cells, ci) => {
      if (cells.length * C * C < 400) return;
      const plan = layoutPiece(cells, ci, ci === biggest);
      if (plan) parks.push(plan);
    });
    tiles.push(b.build());

    function layoutPiece(cells: number[], ci: number, proper: boolean): ParkPlan | null {
      const occ = new Uint8Array(w * w);
      let [sx, sy] = [0, 0];
      for (const k of cells) {
        occ[k] = LAWN;
        sx += cx(k % w);
        sy += cy(Math.floor(k / w));
      }
      const clr0 = clearance(occ, w, w, LAWN);
      const area = cells.length * C * C;
      // The middle of the piece: its roomiest spot, so that a ring or a crescent still gets one inside itself.
      let mid = cells[0];
      for (const k of cells) if (clr0[k] > clr0[mid]) mid = k;
      const centre = { x: cx(mid % w), y: cy(Math.floor(mid / w)) };
      const centroid = { x: sx / cells.length, y: sy / cells.length };
      if (clr0[mid] * C < 5) return null;
      const type = districtAt(city.terrain, city.districts, centroid.x, centroid.y).type;
      const full: ParkTier = area >= 22000 && R >= 115 ? 'central' : area >= 6000 ? 'district' : area >= 1500 ? 'neighbourhood' : 'pocket';
      const tier: ParkTier = proper ? full : full === 'central' ? 'district' : full === 'district' ? 'neighbourhood' : full;
      const rnd = (...v: number[]): number => hash(seed, pi * 31 + ci, ...v);
      const cellOf = (x: number, y: number): number => {
        const [i, j] = [Math.floor(x / C) - i0, Math.floor(y / C) - j0];
        return i < 0 || j < 0 || i >= w || j >= w ? -1 : j * w + i;
      };
      const occAt = (x: number, y: number): number => {
        const k = cellOf(x, y);
        return k < 0 ? OUT : occ[k];
      };
      const plan: ParkPlan = { park: pi, tier, type, area, centre, entrances: [], paths: [], features: [], lawns: [], fence: null, play: [], worn: [], trails: [] };
      const put = (model: string, kind: SiteKind, x: number, y: number, yaw: number, o: Partial<SiteItem> & { lift?: number } = {}): SiteItem => site.put(model, kind, x, y, yaw, { park: pi, ...o });
      const local = (r: Rect, mx: number, mz: number): Vec2 => Site.local(r.x, r.y, r.yaw, mx, mz);
      /** Marks the cells under a rectangle (only those that are lawn, or apron when a solid thing lands on its own apron). */
      const stamp = (r: Rect, code: number, grow = 0, round = false): void => {
        const [hx, hz] = [r.hx + grow, r.hz + grow];
        for (let mx = -hx; mx <= hx + 1e-6; mx += 1)
          for (let mz = -hz; mz <= hz + 1e-6; mz += 1) {
            if (round && (mx * mx) / (hx * hx) + (mz * mz) / (hz * hz) > 1) continue;
            const p = local(r, mx, mz);
            const k = cellOf(p.x, p.y);
            if (k >= 0 && (occ[k] === LAWN || occ[k] === OPEN || (occ[k] === APRON && code === SOLID))) occ[k] = code;
          }
      };
      /** Whether a small thing may stand here: on the grass, clear of everything else. */
      const room = (x: number, y: number, r: number, okPath = false): boolean => {
        for (let dy = -r; dy <= r + 1e-6; dy += Math.max(0.5, Math.min(C, r)))
          for (let dx = -r; dx <= r + 1e-6; dx += Math.max(0.5, Math.min(C, r))) {
            const o = occAt(x + dx, y + dy);
            if (!(o === LAWN || o === OPEN || (okPath && (o === APRON || o === PATH)))) return false;
          }
        return true;
      };
      const small = (model: string, kind: SiteKind, x: number, y: number, yaw: number, r: number, okPath = false): boolean => {
        if (!room(x, y, r, okPath)) return false;
        put(model, kind, x, y, yaw);
        stamp({ x, y, yaw: 0, hx: r, hz: r }, SOLID);
        return true;
      };

      // --- Street frontage, entrances ---
      const samples: Sample[][] = [];
      city.graph.edges.forEach((e) => {
        const line = roads.lines[e.id];
        if (!line || !line.some((q) => Math.hypot(q[0] - park.center.x, q[2] - park.center.y) < R + 40)) return;
        const lay = layout(roads.sections[e.id]);
        const width = roadWidth(roads.sections[e.id]);
        const pts = line.map((q) => ({ x: q[0], y: q[2] }));
        const total = polyLength(pts);
        for (const side of [1, -1]) {
          const off = side > 0 ? lay.outer[1] : lay.outer[0];
          let run: Sample[] = [];
          for (let s = 0; s <= total; s += 2) {
            const { p, tan } = pointAt(pts, s);
            const [nx, ny] = [-tan.y * side, tan.x * side];
            const d = Math.abs(off);
            const inside = occAt(p.x + nx * (d + 2.4), p.y + ny * (d + 2.4)) === LAWN && occAt(p.x + nx * (d + 5), p.y + ny * (d + 5)) === LAWN;
            if (inside) run.push({ x: p.x + nx * (d + 0.9), y: p.y + ny * (d + 0.9), nx, ny, tx: tan.x, ty: tan.y, edge: e.id, side, s, width });
            else if (run.length) {
              samples.push(run);
              run = [];
            }
          }
          if (run.length) samples.push(run);
        }
      });
      const runs = samples.filter((r) => r.length >= 4);
      const want = { central: 6, district: 4, neighbourhood: 3, pocket: 2 }[tier];
      const apart = { central: 70, district: 50, neighbourhood: 34, pocket: 22 }[tier];
      const cands: Sample[] = [];
      for (const r of runs) {
        if (r.length < 12) cands.push(r[Math.floor(r.length / 2)]);
        else for (let i = 5; i < r.length - 5; i++) cands.push(r[i]);
      }
      const chosen: Sample[] = [];
      if (cands.length) {
        let best = cands[0];
        const score = (c: Sample): number => c.width * 3 - Math.hypot(c.x - centre.x, c.y - centre.y) * 0.1;
        for (const c of cands) if (score(c) > score(best)) best = c;
        chosen.push(best);
        while (chosen.length < want) {
          let [far, farD] = [null as Sample | null, apart];
          for (const c of cands) {
            const d = Math.min(...chosen.map((q) => Math.hypot(q.x - c.x, q.y - c.y)));
            if (d > farD) [far, farD] = [c, d];
          }
          if (!far) break;
          chosen.push(far);
        }
      }
      chosen.forEach((c, i) => plan.entrances.push({ x: c.x, y: c.y, nx: c.nx, ny: c.ny, edge: c.edge, main: i === 0, gap: i === 0 ? (tier === 'central' ? 6.3 : 3) : 2 }));
      if (!chosen.length) {
        // No street runs along the park: a footpath over open ground from the nearest street that has one.
        let best: { d: number; from: Vec2; to: Vec2; edge: number } | null = null;
        const rim = cells.filter((k) => clr0[k] <= 1.5);
        city.graph.edges.forEach((e) => {
          const line = roads.lines[e.id];
          if (!line || e.bridge || !line.some((q) => Math.hypot(q[0] - park.center.x, q[2] - park.center.y) < R + 220)) return;
          const lay = layout(roads.sections[e.id]);
          const pts = line.map((q) => ({ x: q[0], y: q[2] }));
          const total = polyLength(pts);
          for (let s = 6; s <= total - 6; s += 6) {
            const { p, tan } = pointAt(pts, s);
            for (const side of [1, -1]) {
              const d = Math.abs(side > 0 ? lay.outer[1] : lay.outer[0]) + 0.9;
              const from = { x: p.x - tan.y * side * d, y: p.y + tan.x * side * d };
              for (let i = 0; i < rim.length; i += 3) {
                const to = { x: cx(rim[i] % w), y: cy(Math.floor(rim[i] / w)) };
                const dist = Math.hypot(to.x - from.x, to.y - from.y);
                if (best && dist >= best.d) continue;
                // The way there must be open ground.
                let clear = true;
                for (let u = 2.5; clear && u < dist - 1; u += 1.5) clear = site.all(from.x + ((to.x - from.x) * u) / dist, from.y + ((to.y - from.y) * u) / dist, 1.2, FREE);
                if (clear) best = { d: dist, from, to, edge: e.id };
              }
            }
          }
        });
        if (best) {
          const { from, to, d, edge } = best as { d: number; from: Vec2; to: Vec2; edge: number };
          const [nx, ny] = [(to.x - from.x) / d, (to.y - from.y) / d];
          plan.entrances.push({ x: to.x, y: to.y, nx, ny, edge, main: true, gap: 3, from });
        }
      }

      // The ground just inside each entrance stays clear for the path that starts there.
      for (const e of plan.entrances) stamp({ x: e.x + e.nx * 2.5, y: e.y + e.ny * 2.5, yaw: 0, hx: tier === 'pocket' ? 2.5 : 3.5, hz: tier === 'pocket' ? 2.5 : 3.5 }, PATH, 0, true);

      // --- Siting ---
      const yaw0 = chosen.length ? Math.atan2(chosen[0].ty, chosen[0].tx) : rnd(1) * Math.PI;
      const entranceDist = (x: number, y: number): number => Math.min(1e9, ...plan.entrances.map((e) => Math.hypot(e.x - x, e.y - y)));
      /** Finds room for a rectangle with a margin around it; the best spot by `score` among those that fit. */
      const find = (hx: number, hz: number, margin: number, score: (x: number, y: number, clr: number) => number, o: { flat?: number; level?: number; yaws?: number[] } = {}): Rect | null => {
        const clr = clearance(occ, w, w, LAWN);
        const need = Math.min(hx, hz) + margin;
        const list: [number, number][] = [];
        for (let j = 1; j < w; j += 2)
          for (let i = 1; i < w; i += 2) {
            const k = j * w + i;
            if (clr[k] * C >= need) list.push([score(cx(i), cy(j), clr[k] * C), k]);
          }
        list.sort((a, c) => c[0] - a[0] || a[1] - c[1]);
        const yaws = o.yaws ?? [yaw0, yaw0 + Math.PI / 2];
        for (const [, k] of list.slice(0, 500)) {
          const [x, y] = [cx(k % w), cy(Math.floor(k / w))];
          for (const yaw of yaws) {
            const r: Rect = { x, y, yaw, hx, hz };
            let ok = true;
            for (let mx = -hx - margin; ok && mx <= hx + margin + 1e-6; mx += C)
              for (let mz = -hz - margin; mz <= hz + margin + 1e-6; mz += C) {
                const p = local(r, Math.min(mx, hx + margin), Math.min(mz, hz + margin));
                if (occAt(p.x, p.y) !== LAWN) {
                  ok = false;
                  break;
                }
              }
            if (!ok) continue;
            if (o.flat !== undefined || o.level !== undefined) {
              const fit = site.plane(x, y, yaw, hx, hz);
              if (o.flat !== undefined && fit.resid > o.flat) continue;
              if (o.level !== undefined && (Math.abs(fit.gx) * hx + Math.abs(fit.gz) * hz > o.level)) continue;
            }
            return r;
          }
        }
        return null;
      };
      /** Books a rectangle: solid inside, an apron of `margin` around it that only paths may use. */
      const book = (type: string, r: Rect, margin: number, round = false): Rect => {
        stamp(r, APRON, margin, round);
        stamp(r, SOLID, 0, round);
        plan.features.push({ type, ...r });
        return r;
      };
      /** A model inside a booked rectangle, on the plane fitted to the ground under the rectangle. */
      const onPlane = (r: Rect, fit: ReturnType<Site['plane']>, model: string, kind: SiteKind, mx: number, mz: number, turn = 0, lift = 0.03): SiteItem => {
        const p = local(r, mx, mz);
        const it = put(model, kind, p.x, p.y, r.yaw + turn, { h: fit.h + fit.gx * mx + fit.gz * mz + fit.over, lift });
        const [c, s] = [Math.cos(turn), Math.sin(turn)];
        it.slopeX = fit.gx * c + fit.gz * s;
        it.slopeZ = -fit.gx * s + fit.gz * c;
        // The height is that of the middle of the model's box; its origin may be elsewhere.
        const { min, max } = bbox(model);
        it.h -= it.slopeX * ((min[0] + max[0]) / 2) + it.slopeZ * ((min[2] + max[2]) / 2);
        return it;
      };
      /** Fence panels around a rectangle, stretched to fit, with an opening in the middle of its front (+z) side. */
      const fenceRect = (r: Rect, model: string, grow: number, gap: number): void => {
        const [hx, hz] = [r.hx + grow, r.hz + grow];
        const side = (ax: number, az: number, bx: number, bz: number): void => {
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 1.5) return;
          const n = Math.max(1, Math.round(len / 12));
          for (let i = 0; i < n; i++) {
            const [u0, u1] = [i / n, (i + 1) / n];
            const p = local(r, ax + (bx - ax) * u0, az + (bz - az) * u0);
            const q = local(r, ax + (bx - ax) * u1, az + (bz - az) * u1);
            const [h0, h1] = [site.heightAt(p.x, p.y), site.heightAt(q.x, q.y)];
            put(model, 'fence', (p.x + q.x) / 2, (p.y + q.y) / 2, Math.atan2(q.y - p.y, q.x - p.x), { h: (h0 + h1) / 2, stretch: len / n / 12, slopeX: (h1 - h0) / (len / n) });
          }
        };
        side(hx, hz, hx, -hz);
        side(hx, -hz, -hx, -hz);
        side(-hx, -hz, -hx, hz);
        side(-hx, hz, -gap / 2, hz);
        side(gap / 2, hz, hx, hz);
      };
      /** Turns a rectangle so that its front (+z) looks at a point. */
      const towards = (r: Rect, x: number, y: number): Rect => {
        const d = { x: x - r.x, y: y - r.y };
        let best = r.yaw;
        // An oblong only turns about: what stands on it is laid out for its own length and width.
        const step = Math.abs(r.hx - r.hz) < 1e-6 ? 1 : 2;
        for (let q = step; q < 4; q += step) {
          const yaw = r.yaw + (q * Math.PI) / 2;
          if (-Math.sin(yaw) * d.x + Math.cos(yaw) * d.y > -Math.sin(best) * d.x + Math.cos(best) * d.y) best = yaw;
        }
        return { ...r, yaw: best };
      };
      /** Where paths reach a feature: just outside the middle of its front. */
      const access: Vec2[] = [];
      const front = (r: Rect, margin: number): void => {
        access.push(local(r, 0, r.hz + margin - 0.5));
      };
      const benches = BENCHES[tier];
      const bench = (x: number, y: number, look: Vec2, k: number): boolean => small(pick(benches, rnd(70, k)), 'bench', x, y, facing(look), 1.1, true);

      const playground = (size: 'big' | 'medium' | 'small' | 'tiny', k: number): boolean => {
        const [hx, hz] = { big: [10, 8.5], medium: [8.5, 6], small: [6, 4.5], tiny: [4, 3.2] }[size];
        const near = (x: number, y: number, clr: number): number => -Math.abs(entranceDist(x, y) - (tier === 'pocket' ? 10 : 28)) + Math.min(clr, hz + 8) * 0.5 - (plan.features.some((f) => f.type === 'playground' && Math.hypot(f.x - x, f.y - y) < 90) ? 200 : 0);
        const found = find(hx, hz, 3.2, near, { flat: 0.6 });
        if (!found) return false;
        const r = book('playground', towards(found, centre.x, centre.y), 3.2);
        const old = size !== 'big' && (type === 'industrial' || rnd(40, k) < 0.2);
        const set = size === 'medium' ? (old ? 'old' : rnd(41, k) < 0.35 ? 'wood' : 'medium') : size === 'small' && old ? 'old' : size;
        const surface = old || set === 'wood' ? 'site/woodchips' : pick(SURFACES, rnd(42, k));
        site.drape(b, surface, r.x, r.y, r.yaw, r.hx, r.hz, 0.06);
        const placed: { x: number; z: number; r: number }[] = [];
        PLAY[set].forEach((model, m) => {
          const rad = playRadius(model);
          const inset = FLAT.test(model) ? rad : Math.max(rad - 0.9, 1.2);
          let best: [number, number] | null = null;
          let bestS = -1;
          for (let x = -r.hx + inset; x <= r.hx - inset + 1e-6; x += 0.5)
            for (let z = -r.hz + inset; z <= r.hz - inset + 1e-6; z += 0.5) {
              if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + rad)) continue;
              // Big things to the back, each as far into a corner as it goes, so that the rest keeps room.
              const s = hash(seed, pi, k, m, x * 2, z * 2) * 0.3 + (Math.abs(x) / r.hx + (m < 2 ? -z / r.hz : Math.abs(z) / r.hz)) * 0.5;
              if (s > bestS) [best, bestS] = [[x, z], s];
            }
          if (!best) return;
          placed.push({ x: best[0], z: best[1], r: rad });
          const p = local(r, best[0], best[1]);
          const turn = /swing|monkey|seesaw/.test(model) ? (rnd(43, k, m) < 0.5 ? 0 : Math.PI) : Math.floor(rnd(44, k, m) * 4) * (Math.PI / 2);
          put(model, 'play', p.x, p.y, r.yaw + turn, { lift: 0.07 });
          plan.play.push({ x: p.x, y: p.y, r: rad, model });
        });
        if (size !== 'tiny') fenceRect(r, type === 'industrial' || old ? 'boundary/chainlink-1200' : pick(['boundary/ped-rail-green', 'boundary/tube-rail-2', 'boundary/picket-white', 'boundary/weld-low'], rnd(45, k)), 0.6, 2.4);
        const gate = local(r, 1.9, r.hz + 1.2);
        put('park/playground-sign', 'sign', gate.x, gate.y, r.yaw + Math.PI, {});
        for (const [mx, t] of [[-r.hx * 0.55, 0], [r.hx * 0.55, 1]] as const) {
          const p = local(r, mx, r.hz + 1.9);
          bench(p.x, p.y, { x: r.x - p.x, y: r.y - p.y }, 300 + k * 4 + t);
        }
        const d = local(r, -r.hx - 1.8, r.hz * 0.4);
        small('furniture/misc-fountain', 'feature', d.x, d.y, r.yaw, 0.7, true);
        const g = local(r, 3.6, r.hz + 1.9);
        small(BINS[tier], 'bin', g.x, g.y, r.yaw, 0.6, true);
        front(r, 3.2);
        return true;
      };

      // --- What the park holds, biggest first ---
      const roomy = (x: number, y: number, clr: number): number => clr - Math.hypot(x - centre.x, y - centre.y) * 0.05;
      const edgy = (x: number, y: number, clr: number): number => -clr + rnd(50, x, y) * 3;
      const away = (x: number, y: number, clr: number): number => Math.min(clr, 30) + Math.min(60, Math.hypot(x - centre.x, y - centre.y)) * 0.3 + rnd(51, x, y) * 4;
      let hub: Vec2 | null = null;
      let hubR = 3;
      const plaza = (model: string, r: number, core: number, tex: string): boolean => {
        const found = find(r, r, 1.5, roomy, { flat: 0.8 });
        if (!found) return false;
        book('plaza', found, 1.5, true);
        // The paving stays open to paths; only the thing in the middle is solid.
        for (let mx = -r; mx <= r; mx += 1)
          for (let mz = -r; mz <= r; mz += 1) {
            const k = cellOf(found.x + mx, found.y + mz);
            if (k >= 0 && occ[k] === SOLID && Math.hypot(mx, mz) > core) occ[k] = APRON;
          }
        site.drape(b, tex, found.x, found.y, found.yaw, r, r, 0.07, (mx, mz) => Math.hypot(mx, mz) < r);
        const { max } = bbox(model);
        if (max[1] > 3.5 && max[0] > 3) site.lay(model, 'pavilion', found.x, found.y, found.yaw, { park: pi });
        else put(model, 'feature', found.x, found.y, found.yaw, { lift: 0.07 });
        const n = r > 9 ? 6 : r > 6 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const a = found.yaw + ((i + 0.5) / n) * Math.PI * 2;
          const p = { x: found.x + Math.cos(a) * (r - 1.3), y: found.y + Math.sin(a) * (r - 1.3) };
          put(pick(benches, rnd(71, i)), 'bench', p.x, p.y, facing({ x: found.x - p.x, y: found.y - p.y }), { lift: 0.07 });
          stamp({ x: p.x, y: p.y, yaw: 0, hx: 1.1, hz: 1.1 }, SOLID);
          if (r > 6 && i % 2 === 0) {
            const q = { x: found.x + Math.cos(a + Math.PI / n) * (r - 0.8), y: found.y + Math.sin(a + Math.PI / n) * (r - 0.8) };
            put(LIGHTS[tier], 'light', q.x, q.y, 0, { lift: 0.07 });
            stamp({ x: q.x, y: q.y, yaw: 0, hx: 0.6, hz: 0.6 }, SOLID);
          }
          if (r > 9) {
            const q = { x: found.x + Math.cos(a + Math.PI / n) * (r + 2.6), y: found.y + Math.sin(a + Math.PI / n) * (r + 2.6) };
            put('plant/flower-bed-round', 'plant', q.x, q.y, a, {});
          }
        }
        hub = { x: found.x, y: found.y };
        hubR = r;
        return true;
      };
      const court = (type: string, models: [string, number, number, number][], hx: number, hz: number, margin: number, score: typeof roomy, fence?: string): Rect | null => {
        const found = find(hx, hz, margin, score, { flat: 0.45 });
        if (!found) return null;
        const r = book(type, towards(found, centre.x, centre.y), margin);
        const fit = site.plane(r.x, r.y, r.yaw, r.hx, r.hz);
        for (const [model, mx, mz, turn] of models) onPlane(r, fit, model, 'sport', mx, mz, turn);
        if (fence) fenceRect(r, fence, 1, 3);
        front(r, margin);
        return r;
      };
      const soccer = (): boolean => {
        const r = court('soccer', [['park/soccer-field-end', 0, -14, 0], ['park/soccer-field-end', 0, 14, Math.PI]], 20, 28, 5, edgy);
        if (!r) return false;
        const fit = site.plane(r.x, r.y, r.yaw, r.hx, r.hz);
        for (const mz of [-9, 9]) onPlane(r, fit, 'park/bleachers-5', 'sport', -r.hx - 2.4, mz, -Math.PI / 2, 0.05);
        return true;
      };
      const baseball = (): boolean => {
        const found = find(24, 24, 3, edgy, { flat: 0.5 });
        if (!found) return false;
        const r = book('baseball', towards(found, centre.x, centre.y), 3);
        const fit = site.plane(r.x, r.y, r.yaw, r.hx, r.hz);
        const home: [number, number] = [-17, -17];
        site.drape(b, 'ground/dirt', r.x, r.y, r.yaw, r.hx, r.hz, 0.05, (mx, mz) => {
          const d = Math.hypot(mx - home[0], mz - home[1]);
          return (d < 29 && d > 19) || d < 4 || Math.abs(mx - home[0]) < 1.6 || Math.abs(mz - home[1]) < 1.6;
        });
        onPlane(r, fit, 'park/baseball-backstop', 'sport', home[0] - 3.4, home[1] - 3.4, -Math.PI * 0.75, 0.05);
        onPlane(r, fit, 'park/dugout', 'sport', home[0] + 12, -r.hz + 1.4, 0, 0.05);
        onPlane(r, fit, 'park/dugout', 'sport', -r.hx + 1.4, home[1] + 12, Math.PI / 2, 0.05);
        onPlane(r, fit, 'park/bleachers-3', 'sport', home[0] + 22, -r.hz + 1.6, 0, 0.05);
        front(r, 3);
        return true;
      };
      const tennis = (n: number): boolean => {
        const model = type === 'hills' || type === 'oldtown' ? 'park/tennis-clay' : 'park/tennis-court';
        return !!court('tennis', n === 2 ? [[model, -9.6, 0, 0], [model, 9.6, 0, 0]] : [[model, 0, 0, 0]], n === 2 ? 19 : 9.4, 18.6, 2.5, edgy);
      };
      const basketball = (full: boolean): boolean => {
        const worn = type === 'industrial' || rnd(52) < 0.3;
        const model = full ? 'park/basketball-full' : worn ? 'park/basketball-court-worn' : rnd(53) < 0.4 ? 'park/basketball-court-green' : 'park/basketball-court';
        return !!court('basketball', [[model, 0, 0, 0]], full ? 8 : 7.7, full ? 15.2 : 7.3, 3, edgy, 'boundary/chainlink-sports-3600');
      };
      const building = (type: string, model: string, score: typeof roomy, kind: SiteKind = 'pavilion', margin = 2.5): Rect | null => {
        const { min, max } = bbox(model);
        const found = find((max[0] - min[0]) / 2, (max[2] - min[2]) / 2, margin, score, { flat: 0.5 });
        if (!found) return null;
        const r = book(type, towards(found, hub?.x ?? centre.x, hub?.y ?? centre.y), margin);
        site.lay(model, kind, r.x, r.y, r.yaw, { park: pi });
        front(r, margin);
        return r;
      };
      const nearEntrance = (d: number) => (x: number, y: number, clr: number): number => -Math.abs(entranceDist(x, y) - d) + Math.min(clr, 12) * 0.3;
      const nearHub = (d: number) => (x: number, y: number): number => -Math.abs(Math.hypot(x - (hub?.x ?? centre.x), y - (hub?.y ?? centre.y)) - d) + rnd(54, x, y);
      const picnic = (big: boolean, k: number): boolean => {
        const found = find(big ? 10.5 : 7, big ? 7.5 : 6, 2, away, { flat: 0.6 });
        if (!found) return false;
        const r = book('picnic', towards(found, centre.x, centre.y), 2);
        site.lay(big ? 'park/picnic-shelter' : 'park/picnic-shelter-small', 'pavilion', r.x, r.y, r.yaw, { park: pi });
        const tables = ['park/picnic-table-wood', 'park/picnic-table-red', 'park/picnic-table-concrete', 'park/picnic-table-metal'];
        const [ox, oz] = big ? [8.4, 5.2] : [5.2, 4.2];
        [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].forEach(([mx, mz], i) => {
          const p = local(r, mx, mz);
          put(pick(tables, rnd(55, k)), 'table', p.x, p.y, r.yaw + (rnd(56, k, i) - 0.5) * 0.5, {});
        });
        for (const mx of big ? [-5.5, 5.5] : [0]) {
          const p = local(r, mx, r.hz - 0.6);
          put('park/grill', 'feature', p.x, p.y, r.yaw, {});
        }
        const p = local(r, r.hx - 0.7, 0);
        put(BINS[tier], 'bin', p.x, p.y, r.yaw, {});
        front(r, 2);
        return true;
      };
      const roseGarden = (): boolean => {
        const found = find(9, 9, 1.5, away, { flat: 0.6 });
        if (!found) return false;
        const r = book('garden', towards(found, centre.x, centre.y), 1.5);
        site.drape(b, 'ground/gravel-fine', r.x, r.y, r.yaw, 9, 9, 0.06, (mx, mz) => Math.abs(mx) < 1.3 || Math.abs(mz) < 1.3 || Math.abs(Math.hypot(mx, mz) - 6.3) < 1.1);
        site.lay('park/pergola-white', 'pavilion', r.x, r.y, r.yaw, { park: pi });
        const arch = local(r, 0, 8.6);
        put('park/trellis-arch', 'feature', arch.x, arch.y, r.yaw, { lift: 0.05 });
        const roses = ['plant/shrub-rose-pink', 'plant/shrub-rose-white', 'plant/shrub-rose-mixed'];
        for (let i = 0; i < 16; i++) {
          const a = ((i + 0.5) / 16) * Math.PI * 2;
          const rr = i % 2 ? 4.4 : 8.1;
          if (Math.abs(Math.cos(a) * rr) < 1.7 || Math.abs(Math.sin(a) * rr) < 1.7) continue;
          const p = local(r, Math.cos(a) * rr, Math.sin(a) * rr);
          put(roses[i % 3], 'plant', p.x, p.y, a, {});
        }
        for (const [mx, mz] of [[-7.4, -7.4], [7.4, -7.4], [-7.4, 7.4], [7.4, 7.4]]) {
          const p = local(r, mx, mz);
          put('plant/flower-bed-round', 'plant', p.x, p.y, r.yaw, {});
        }
        for (const s of [-1, 1]) {
          const p = local(r, s * 3.6, 0);
          put(benches[0], 'bench', p.x, p.y, facing({ x: r.x - p.x, y: r.y - p.y }), { lift: 0.06 });
        }
        front(r, 1.5);
        return true;
      };
      const dogRun = (): boolean => {
        const found = find(12, 8, 2.5, edgy, { flat: 0.7 });
        if (!found) return false;
        const r = book('dogrun', towards(found, centre.x, centre.y), 2.5);
        site.drape(b, 'ground/gravel-dirt', r.x, r.y, r.yaw, r.hx, r.hz, 0.05);
        fenceRect(r, 'boundary/chainlink-1200', 0.3, 1.6);
        [[-7, -3, 0.3], [0, 2.5, -0.2], [6.5, -2, 1.2]].forEach(([mx, mz, turn]) => {
          const p = local(r, mx, mz);
          put('park/dog-agility', 'feature', p.x, p.y, r.yaw + turn, { lift: 0.05 });
        });
        const p = local(r, -r.hx + 1.4, r.hz - 1.2);
        put(benches[0], 'bench', p.x, p.y, r.yaw - Math.PI / 2, { lift: 0.05 });
        const q = local(r, 2.4, r.hz + 1);
        put('park/park-sign-rules', 'sign', q.x, q.y, r.yaw + Math.PI, {});
        front(r, 2.5);
        return true;
      };
      const skate = (): boolean => {
        const found = find(11, 8, 2, edgy, { flat: 0.4 });
        if (!found) return false;
        const r = book('skate', towards(found, centre.x, centre.y), 2);
        const fit = site.plane(r.x, r.y, r.yaw, r.hx, r.hz);
        site.drape(b, 'concrete/walk-plain', r.x, r.y, r.yaw, r.hx, r.hz, fit.over + 0.04);
        onPlane(r, fit, 'park/skate-halfpipe', 'sport', -6.5, 0, Math.PI / 2, 0.08);
        onPlane(r, fit, 'park/skate-funbox', 'sport', 2, 1.5, 0, 0.08);
        onPlane(r, fit, 'park/skate-quarter', 'sport', 8.6, -3.6, Math.PI / 2, 0.08);
        onPlane(r, fit, 'park/skate-quarter-wood', 'sport', 3, -5.6, Math.PI, 0.08);
        front(r, 2);
        return true;
      };
      const gym = (): boolean => {
        const found = find(5, 3.6, 1.5, nearEntrance(45), { flat: 0.5 });
        if (!found) return false;
        const r = book('gym', towards(found, centre.x, centre.y), 1.5);
        site.drape(b, 'site/safety-rubber-green', r.x, r.y, r.yaw, r.hx, r.hz, 0.06);
        [['park/gym-pullup', -2.4, -1], ['park/gym-parallel', 2.6, -1.4], ['park/gym-parallel', 2.6, 1.2]].forEach(([model, mx, mz]) => {
          const p = local(r, mx as number, mz as number);
          put(model as string, 'sport', p.x, p.y, r.yaw, { lift: 0.07 });
        });
        front(r, 1.5);
        return true;
      };
      const pond = (): boolean => {
        const found = find(13.6, 9.2, 4, (x, y, clr) => -site.heightAt(x, y) * 2 + Math.min(clr, 25) * 0.3, { level: 0.5, flat: 0.4 });
        if (!found) return false;
        const r = book('pond', found, 4, true);
        const fit = site.plane(r.x, r.y, r.yaw, r.hx, r.hz);
        put('park/pond', 'feature', r.x, r.y, r.yaw, { scale: 2, h: fit.h + fit.over - 0.05 });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + rnd(57, i);
          const p = local(r, Math.cos(a) * 14.6, Math.sin(a) * 10.2);
          put(i % 3 ? 'plant/grass-fountain' : 'plant/grass-patch', 'plant', p.x, p.y, a, {});
        }
        for (const a of [0.6, 2.4, 4.4]) {
          const p = local(r, Math.cos(a) * 15.8, Math.sin(a) * 11.4);
          bench(p.x, p.y, { x: r.x - p.x, y: r.y - p.y }, 500 + Math.round(a * 10));
        }
        front(r, 4);
        return true;
      };
      const bandstand = (): boolean => {
        const r = building('bandstand', 'park/bandstand', roomy, 'pavilion', 3);
        if (!r) return false;
        const lawn = local(r, 0, r.hz + 20);
        if (occAt(lawn.x, lawn.y) === LAWN) {
          stamp({ x: lawn.x, y: lawn.y, yaw: 0, hx: 16, hz: 16 }, OPEN, 0, true);
          plan.lawns.push({ x: lawn.x, y: lawn.y, r: 16 });
        }
        return true;
      };
      const monument = (k: number): boolean => {
        const model = pick(['park/monument-obelisk', 'park/monument-figure', 'park/monument-column', 'park/monument-sphere', 'park/memorial-rock'], rnd(58, k));
        return plazaAt(model, 4.5, 1.6, 'concrete/walk-exposed');
      };
      const plazaAt = (model: string, r: number, core: number, tex: string): boolean => {
        const [keep, keepR] = [hub, hubR];
        const ok = plaza(model, r, core, tex);
        if (keep) {
          // A second plaza is a stop on the way, not the middle of the park.
          if (ok) access.push(hub!);
          hub = keep;
          hubR = keepR;
        }
        return ok;
      };

      if (tier === 'central') {
        plaza(rnd(60) < 0.7 ? 'park/fountain-large' : 'park/fountain', 11, 5.6, 'paving/slabs-sandstone');
        soccer();
        tennis(2);
        basketball(true);
        pond();
        bandstand();
        playground('big', 0);
        playground('medium', 1);
        building('restroom', 'park/restroom', nearEntrance(30));
        building('restroom', 'park/restroom', (x, y) => -Math.abs(entranceDist(x, y) - 35) - (plan.features.some((f) => f.type === 'restroom' && Math.hypot(f.x - x, f.y - y) < 120) ? 300 : 0));
        building('kiosk', 'park/kiosk', nearHub(19), 'pavilion', 1.5);
        if (rnd(61) < 0.5) building('carousel', 'park/carousel-small', nearHub(45), 'feature', 3);
        picnic(true, 0);
        picnic(false, 1);
        roseGarden();
        dogRun();
        gym();
        monument(0);
        if (area > 60000) {
          playground('medium', 2);
          picnic(true, 2);
          monument(1);
          skate();
        }
      } else if (tier === 'district') {
        plaza(rnd(60) < 0.5 ? 'park/gazebo' : 'park/fountain', 7, rnd(60) < 0.5 ? 3.6 : 3.5, 'concrete/walk-exposed');
        if (rnd(62) < 0.5) baseball() || soccer();
        else soccer() || baseball();
        basketball(area > 12000);
        tennis(1);
        playground(area > 12000 ? 'big' : 'medium', 0);
        building('restroom', 'park/restroom', nearEntrance(25));
        picnic(false, 0);
        if (type === 'downtown' || type === 'midtown' || rnd(63) < 0.4) skate();
        else dogRun();
        gym();
      } else if (tier === 'neighbourhood') {
        playground(area > 3200 ? 'medium' : 'small', 0);
        if (rnd(64) < 0.6) basketball(false);
        if (rnd(65) < 0.35) plaza('park/gazebo-hex', 4.5, 2.8, 'ground/gravel-fine');
        else if (rnd(65) < 0.55) plaza(pick(['park/monument-bust', 'park/memorial-rock', 'park/bird-bath'], rnd(66)), 3.5, 1.3, 'concrete/walk-exposed');
      } else {
        const what = rnd(67);
        if (what < 0.35) plaza(pick(['park/fountain-small', 'park/monument-bust', 'park/monument-sphere'], rnd(66)), 4.5, 2.1, 'concrete/walk-square');
        else if (what < 0.7) playground('tiny', 0);
        else {
          const found = find(4, 3, 1, roomy);
          if (found) {
            const r = book('chess', found, 1);
            site.drape(b, 'concrete/walk-square', r.x, r.y, r.yaw, r.hx, r.hz, 0.06);
            for (const mx of [-2.2, 2.2]) {
              const p = local(r, mx, 0);
              put('park/chess-table', 'table', p.x, p.y, r.yaw, { lift: 0.07 });
            }
            front(r, 1);
          }
        }
      }
      const middle: Vec2 = hub ?? (plan.features[0] ? access[0] : centre);

      // --- Paths ---
      const pass = (k: number): boolean => occ[k] === LAWN || occ[k] === PATH || occ[k] === APRON || occ[k] === OPEN;
      // As precise as the costs on the heap, or a live entry would look stale.
      const dist = new Float64Array(w * w);
      const from = new Int32Array(w * w);
      /** Cheapest way over the grass from a point to the first cell that `goal` accepts. */
      const route = (start: Vec2, goal: (k: number) => boolean, cost: (k: number) => number): Vec2[] | null => {
        let s = cellOf(start.x, start.y);
        if (s < 0 || !pass(s)) {
          // The nearest cell that can be walked on.
          let best = -1;
          for (let dj = -3; dj <= 3; dj++)
            for (let di = -3; di <= 3; di++) {
              const k = cellOf(start.x + di * C, start.y + dj * C);
              if (k >= 0 && pass(k) && (best < 0 || Math.hypot(di, dj) < Math.hypot((best % w) - (Math.floor(start.x / C) - i0), Math.floor(best / w) - (Math.floor(start.y / C) - j0)))) best = k;
            }
          if (best < 0) return null;
          s = best;
        }
        dist.fill(Infinity);
        const heap = new Heap();
        dist[s] = 0;
        from[s] = -1;
        heap.push(0, s);
        let end = -1;
        while (heap.size) {
          const [d, k] = heap.pop();
          if (d > dist[k]) continue;
          if (k !== s && goal(k)) {
            end = k;
            break;
          }
          const [i, j] = [k % w, Math.floor(k / w)];
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              if (!di && !dj) continue;
              const [a, c] = [i + di, j + dj];
              if (a < 0 || c < 0 || a >= w || c >= w) continue;
              const q = c * w + a;
              if (!pass(q) || (di && dj && (!pass(j * w + a) || !pass(c * w + i)))) continue;
              const nd = d + (di && dj ? Math.SQRT2 : 1) * cost(q);
              if (nd < dist[q]) {
                dist[q] = nd;
                from[q] = k;
                heap.push(nd, q);
              }
            }
        }
        if (end < 0) return null;
        const cellsOut: Vec2[] = [];
        for (let k = end; k >= 0; k = from[k]) cellsOut.push({ x: cx(k % w), y: cy(Math.floor(k / w)) });
        cellsOut.reverse();
        cellsOut[0] = pass(cellOf(start.x, start.y)) ? start : cellsOut[0];
        return cellsOut;
      };
      const widths = { central: [4, 3, 2.2], district: [3, 2.4, 1.8], neighbourhood: [2.2, 1.8, 1.5], pocket: [1.8, 1.5, 1.5] }[tier];
      const paving = {
        central: ['concrete/walk-exposed', 'ground/gravel-fine', 'ground/gravel-fine'],
        district: ['concrete/walk-plain', 'ground/gravel-fine', 'ground/gravel-fine'],
        neighbourhood: ['concrete/walk-square', 'concrete/walk-square', 'ground/gravel-fine'],
        pocket: ['concrete/walk-square', 'concrete/walk-square', 'concrete/walk-square'],
      }[tier];
      /** Cells a path really covers; the ground kept clear inside an entrance is `PATH` before any path is laid. */
      const laid = new Uint8Array(w * w);
      const addPath = (cellsIn: Vec2[] | null, kind: ParkPath['kind']): void => {
        if (!cellsIn || cellsIn.length < 2) return;
        const rank = kind === 'main' ? 0 : kind === 'loop' ? 1 : 2;
        const wd = widths[rank];
        const rough = simplify(cellsIn, 1.7);
        const pts = polyLength(rough) > 6 && rough.length > 2 ? resample(catmullRom(rough, 5), 2) : resample(rough, 2);
        for (const p of pts)
          for (let dy = -wd / 2 - 0.4; dy <= wd / 2 + 0.4; dy += 1)
            for (let dx = -wd / 2 - 0.4; dx <= wd / 2 + 0.4; dx += 1) {
              const k = cellOf(p.x + dx, p.y + dy);
              if (k < 0) continue;
              laid[k] = 1;
              if (occ[k] === LAWN || occ[k] === OPEN || occ[k] === APRON) occ[k] = PATH;
            }
        plan.paths.push({ pts, w: wd, kind });
        site.ribbon(b, paving[rank], pts, wd, 0.065 - rank * 0.008);
      };
      const walk = (k: number): number => 1 + (clr0[k] * C < 4 ? 3 : 0) + noise(seed + pi, cx(k % w), cy(Math.floor(k / w)), 26) * 1.2 - (occ[k] === PATH ? 0.7 : 0) + (occ[k] === OPEN ? 0.8 : 0);
      const atMiddle = (k: number): boolean => Math.hypot(cx(k % w) - middle.x, cy(Math.floor(k / w)) - middle.y) < Math.max(3, hubR - 1);
      const inside = (e: ParkEntrance): Vec2 => ({ x: e.x + e.nx * 2.2, y: e.y + e.ny * 2.2 });
      plan.entrances.forEach((e, i) => {
        // The gateway itself: from the back of the pavement to the first of the grass.
        const stub = [e.from ?? { x: e.x - e.nx * 1.4, y: e.y - e.ny * 1.4 }, inside(e)];
        const way = route(inside(e), i === 0 ? atMiddle : (k) => laid[k] === 1 || atMiddle(k), walk);
        addPath(way ? [stub[0], ...way] : stub, i === 0 ? 'main' : 'link');
      });
      if ((tier === 'central' || tier === 'district') && plan.entrances.length >= 3) {
        const ring = tier === 'central' ? 16 : 9;
        const order = [...plan.entrances].sort((a, c) => Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(c.y - centre.y, c.x - centre.x));
        order.forEach((e, i) => {
          const next = order[(i + 1) % order.length];
          const target = inside(next);
          const way = route(inside(e), (k) => Math.hypot(cx(k % w) - target.x, cy(Math.floor(k / w)) - target.y) < 3, (k) => 1 + Math.abs(clr0[k] * C - ring) * 0.3 + (occ[k] === OPEN ? 2 : 0));
          if (way && polyLength(way) < 700) addPath(way, 'loop');
        });
      }
      for (const a of access) addPath(route(a, (k) => laid[k] === 1, walk), 'link');

      // --- Along the paths: benches, lights, bins ---
      let count = 0;
      for (const path of plan.paths) {
        const total = polyLength(path.pts);
        const gap = tier === 'central' ? 30 : tier === 'district' ? 34 : 22;
        for (let s = 8 + rnd(72, count) * 8; s < total - 5; s += gap * (0.8 + rnd(73, count) * 0.4)) {
          count++;
          const { p, tan } = pointAt(path.pts, s);
          const sd = count % 2 ? 1 : -1;
          const [nx, ny] = [-tan.y * sd, tan.x * sd];
          const at = (d: number): Vec2 => ({ x: p.x + nx * d, y: p.y + ny * d });
          const seat = at(path.w / 2 + 1);
          if (bench(seat.x, seat.y, { x: -nx, y: -ny }, count) && count % 3 === 0) {
            const q = { x: seat.x + tan.x * 1.8, y: seat.y + tan.y * 1.8 };
            small(BINS[tier], 'bin', q.x, q.y, facing({ x: -nx, y: -ny }), 0.5, true);
          }
          if (path.kind !== 'link' || tier === 'neighbourhood') {
            const lamp = at(-(path.w / 2 + 0.7));
            small(LIGHTS[tier], 'light', lamp.x, lamp.y, 0, 0.5, true);
          }
          // Planting beside the main walks of the bigger parks.
          if (path.kind === 'main' && tier !== 'pocket' && count % 2 === 0) {
            const bed = at(-(path.w / 2 + 2.4));
            small(pick(BEDS, rnd(76, count)), 'plant', bed.x, bed.y, Math.atan2(tan.y, tan.x), 1.6);
          }
        }
      }
      plan.entrances.forEach((e, i) => {
        const [tx, ty] = [-e.ny, e.nx];
        const at = (a: number, d: number): Vec2 => ({ x: e.x + tx * a + e.nx * d, y: e.y + ty * a + e.ny * d });
        const sign = at(e.gap + 2.2, 1.6);
        small(i === 0 ? 'park/park-sign' : 'park/park-sign-rules', 'sign', sign.x, sign.y, facing({ x: -e.nx, y: -e.ny }), i === 0 ? 1.5 : 0.5, true);
        const bin = at(-e.gap - 1, 2.2);
        small(BINS[tier], 'bin', bin.x, bin.y, facing({ x: e.nx, y: e.ny }), 0.5, true);
        if (tier !== 'pocket') {
          const lamp = at(-e.gap - 1.2, 0.9);
          small(LIGHTS[tier], 'light', lamp.x, lamp.y, 0, 0.5, true);
        }
        if (i === 0 || tier === 'central')
          for (const sd of [-1, 1]) {
            const p = at(sd * (e.gap + 4.6), 2.4);
            small(pick(['plant/shrub-broadleaf', 'plant/shrub-camellia', 'plant/shrub-hibiscus-red'], rnd(74, i)), 'plant', p.x, p.y, rnd(75, i, sd) * 6, 1);
          }
      });

      // --- Lawns kept open, then trees over the rest ---
      if (tier === 'central' || tier === 'district') {
        for (let n = 0; n < (tier === 'central' ? 3 : 1); n++) {
          const clr = clearance(occ, w, w, LAWN);
          let best = -1;
          for (const k of cells) if (best < 0 || clr[k] > clr[best]) best = k;
          const r = Math.min(clr[best] * C - 2, tier === 'central' ? 30 : 18);
          if (r < 9) break;
          const [x, y] = [cx(best % w), cy(Math.floor(best / w))];
          stamp({ x, y, yaw: 0, hx: r, hz: r }, OPEN, 0, true);
          plan.lawns.push({ x, y, r });
        }
      }
      const palette = TREES[type] ?? TREES.default;
      const tclr = clearance(occ, w, w, LAWN);
      const G = 8;
      const dense = tier === 'central' || tier === 'district' ? 1 : 0.6;
      /** The tree of a grid square, if the square has one: where it stands, and whether in a grove or on the rim of the park. */
      const treeAt = (gx: number, gy: number): { x: number; y: number; grove: number; rim: boolean } | null => {
        const x = (gx + 0.2 + hash(seed, pi, gx, gy, 1) * 0.6) * G;
        const y = (gy + 0.2 + hash(seed, pi, gx, gy, 2) * 0.6) * G;
        const k = cellOf(x, y);
        if (k < 0 || occ[k] !== LAWN || tclr[k] * C < 2.6) return null;
        const grove = noise(seed * 7 + pi, x, y, 46);
        const rim = clr0[k] * C < 10;
        const p = rim ? 0.75 : (grove > 0.54 ? 0.95 : grove > 0.4 ? 0.5 : 0.18) * dense;
        return hash(seed, pi, gx, gy, 3) > p ? null : { x, y, grove, rim };
      };
      // Every tree of the grid is known before any is planted, so one added beside a tree can keep clear of the rest.
      const trunks = new Map<string, Vec2>();
      for (let gy = Math.floor(cy(0) / G); gy * G < cy(w); gy++)
        for (let gx = Math.floor(cx(0) / G); gx * G < cx(w); gx++) {
          const t = treeAt(gx, gy);
          if (t) trunks.set(`${gx},${gy}`, t);
        }
      const seconds: Vec2[] = [];
      for (let gy = Math.floor(cy(0) / G); gy * G < cy(w); gy++)
        for (let gx = Math.floor(cx(0) / G); gx * G < cx(w); gx++) {
          const tree = treeAt(gx, gy);
          if (!tree) continue;
          const { x, y, grove, rim } = tree;
          const kind = pick(palette, hash(seed, pi, Math.floor(x / 46), Math.floor(y / 46), rim ? 5 : 4) * 0.75 + hash(seed, pi, gx, gy, 6) * 0.25);
          put(kind, 'tree', x, y, hash(seed, pi, gx, gy, 7) * Math.PI * 2, { scale: 0.85 + hash(seed, pi, gx, gy, 8) * 0.4 });
          const h = (n: number): number => hash(seed, pi, gx, gy, n);
          // What has fallen from it lies under it.
          if (h(9) < 0.7) {
            const litter = /autumn/.test(kind) ? 'site/leaf-litter-autumn' : /cherry|jacaranda|tabebuia|magnolia|spring/.test(kind) ? 'site/petals-fallen' : 'site/leaf-litter';
            const lr = 2.2 + h(10) * 1.4;
            if (!/palm/.test(kind)) site.decal(b, litter, x, y, h(11) * 6.3, lr, lr, 0.045);
          }
          if (rim || grove <= 0.54) continue;
          // In a grove the trees stand in twos and threes, with shrubs under them.
          for (let q = 0; q < 2; q++) {
            if (h(12 + q) > 0.45) continue;
            const a = h(14 + q) * 6.3;
            const d = 3.2 + h(16 + q) * 1.6;
            const [tx, ty] = [x + Math.cos(a) * d, y + Math.sin(a) * d];
            const tk = cellOf(tx, ty);
            if (tk < 0 || occ[tk] !== LAWN || tclr[tk] * C < 2.6) continue;
            // Clear of the trees of the squares round about and of the other trees added to groves.
            let clash = seconds.some((t) => Math.hypot(t.x - tx, t.y - ty) < 2.4);
            for (let ny = gy - 1; ny <= gy + 1 && !clash; ny++)
              for (let nx = gx - 1; nx <= gx + 1 && !clash; nx++) {
                const t = trunks.get(`${nx},${ny}`);
                clash = !!t && (nx !== gx || ny !== gy) && Math.hypot(t.x - tx, t.y - ty) < 2.4;
              }
            if (clash) continue;
            seconds.push({ x: tx, y: ty });
            put(kind, 'tree', tx, ty, h(18 + q) * 6.3, { scale: 0.6 + h(20 + q) * 0.35 });
          }
          for (let q = 0; q < 3; q++) {
            if (h(22 + q) > 0.3) continue;
            const a = h(25 + q) * 6.3;
            const d = 1.6 + h(28 + q) * 2.2;
            small(pick(UNDER[type] ?? UNDER.default, h(31 + q)), 'plant', x + Math.cos(a) * d, y + Math.sin(a) * d, h(34 + q) * 6.3, 0.8);
          }
        }

      // --- Where the grass has given out: goal mouths, the middle of the open lawns, the lines people cut to them ---
      const worn = (x: number, y: number, r: number, yaw: number, surface?: (x: number, y: number) => number): void => {
        site.decal(b, 'site/lawn-worn', x, y, yaw, r, r * (0.7 + hash(seed, pi, Math.round(x), Math.round(y), 40) * 0.3), 0.04, surface);
        plan.worn.push({ x, y, r });
      };
      for (const f of plan.features)
        if (f.type === 'soccer') {
          // The pitch is turf laid on a plane above the ground: the goal mouths wear on the turf, not under it.
          const fit = site.plane(f.x, f.y, f.yaw, f.hx, f.hz);
          const [c, s] = [Math.cos(f.yaw), Math.sin(f.yaw)];
          const turf = (x: number, y: number): number => fit.h + fit.over + fit.gx * (c * (x - f.x) + s * (y - f.y)) + fit.gz * (c * (y - f.y) - s * (x - f.x)) + 0.05;
          for (const sd of [-1, 1]) {
            const p = Site.local(f.x, f.y, f.yaw, 0, sd * (f.hz - 3));
            worn(p.x, p.y, 3.2, f.yaw, turf);
          }
        }
      plan.lawns.forEach((lawn, li) => {
        for (let q = 0; q < 1 + Math.floor(lawn.r / 9); q++) {
          const [a, d] = [rnd(90, li, q) * 6.3, rnd(91, li, q) * lawn.r * 0.6];
          worn(lawn.x + Math.cos(a) * d, lawn.y + Math.sin(a) * d, 2 + rnd(92, li, q) * 2.2, rnd(93, li, q) * 6.3);
        }
        // The short cut from the nearest path to the middle of the lawn.
        let near: Vec2 | null = null;
        for (const path of plan.paths) for (const p of path.pts) if (!near || Math.hypot(p.x - lawn.x, p.y - lawn.y) < Math.hypot(near.x - lawn.x, near.y - lawn.y)) near = p;
        if (!near) return;
        const len = Math.hypot(near.x - lawn.x, near.y - lawn.y);
        if (len < 8 || len > 90) return;
        const pts: Vec2[] = [];
        const [ux, uy] = [(lawn.x - near.x) / len, (lawn.y - near.y) / len];
        for (let d = 0; d < len - lawn.r * 0.3; d += 2) {
          // It wanders a little, as feet do.
          const off = Math.sin(d / 9 + li) * 1.2 * Math.min(1, d / 6);
          const p = { x: near.x + ux * d - uy * off, y: near.y + uy * d + ux * off };
          const k = cellOf(p.x, p.y);
          if (k < 0 || (occ[k] !== LAWN && occ[k] !== OPEN && occ[k] !== PATH)) break;
          pts.push(p);
        }
        if (pts.length < 4) return;
        site.ribbon(b, 'site/lawn-trail', pts, 1.4, 0.045);
        plan.trails.push(pts);
      });

      // --- Fence along the streets ---
      const fence =
        tier === 'central' ? (type === 'beach' ? 'boundary/iron-white' : 'boundary/iron-spear')
        : tier === 'district' ? (rnd(80) < 0.6 ? 'boundary/tube-rail-2' : 'boundary/knee-rail')
        : tier === 'neighbourhood' ? pick(['', '', 'boundary/ped-rail-green', 'boundary/knee-rail', 'boundary/tube-rail-low'], rnd(80))
        : pick(['', '', 'boundary/bollard-chain', 'boundary/knee-rail-diamond'], rnd(80));
      plan.fence = fence || null;
      if (fence) {
        for (const run of runs) {
          // Stretches of the run between the openings.
          let part: Sample[] = [];
          const flush = (): void => {
            if (part.length >= 3) {
              const pts = part.map((q) => ({ x: q.x, y: q.y }));
              const len = polyLength(pts);
              const n = Math.max(1, Math.round(len / 12));
              for (let i = 0; i < n; i++) {
                const [p, q] = [pointAt(pts, (len * i) / n).p, pointAt(pts, (len * (i + 1)) / n).p];
                const l = Math.hypot(q.x - p.x, q.y - p.y);
                const [h0, h1] = [site.heightAt(p.x, p.y), site.heightAt(q.x, q.y)];
                put(fence, 'fence', (p.x + q.x) / 2, (p.y + q.y) / 2, Math.atan2(q.y - p.y, q.x - p.x), { h: (h0 + h1) / 2, stretch: l / 12, slopeX: (h1 - h0) / l });
              }
            }
            part = [];
          };
          for (const q of run) {
            if (plan.entrances.some((e) => Math.hypot(e.x - q.x, e.y - q.y) < e.gap + 0.4)) flush();
            else part.push(q);
          }
          flush();
        }
        const main = plan.entrances[0];
        if (main && tier === 'central') put('boundary/gate-iron-double', 'gate', main.x, main.y, facing({ x: -main.nx, y: -main.ny }), {});
      }
      for (const k of cells) site.grid[(j0 + Math.floor(k / w)) * site.n + i0 + (k % w)] = PARK;
      return plan;
    }
  });
  return { parks, tiles };
}
