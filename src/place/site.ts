// The registry comes first: the kit modules register their models with it as they load.
import { MODELS } from '../assets/mesh/registry';
import { MeshBuilder, V3 } from '../assets/mesh/builder';
import { layout, reversed } from '../assets/mesh/section';
import { pointAt, polyLength } from '../core/geom';
import { Vec2 } from '../core/vec2';
import { City } from '../gen/city';
import { waterDistAt } from '../gen/terrain';
import { RoadModel } from './roadModel';

/** Side of a cell of the raster of what occupies the ground, metres. */
export const SITE_CELL = 2;
export const FREE = 0;
export const ROAD = 1;
export const RAIL = 2;
export const WATER = 3;
export const LOT = 4;
export const PARK = 5;
export const USED = 6;

export type SiteKind =
  | 'play' | 'sport' | 'pavilion' | 'feature' | 'bench' | 'light' | 'bin' | 'sign' | 'tree' | 'plant' | 'table'
  | 'fence' | 'gate' | 'guardrail' | 'wall'
  | 'beach' | 'pier' | 'seawall' | 'port' | 'rock' | 'buoy' | 'lighthouse' | 'boat' | 'dock'
  | 'building' | 'parking' | 'yard' | 'roof'
  /** Small things in and in front of the shops, shown only from near by. */
  | 'prop';
export const SITE_KINDS: SiteKind[] = [
  'play', 'sport', 'pavilion', 'feature', 'bench', 'light', 'bin', 'sign', 'tree', 'plant', 'table',
  'fence', 'gate', 'guardrail', 'wall', 'beach', 'pier', 'seawall', 'port', 'rock', 'buoy', 'lighthouse', 'boat', 'dock', 'building', 'parking', 'yard', 'roof', 'prop',
];

/** One model standing somewhere off the roads. */
export interface SiteItem {
  model: string;
  kind: SiteKind;
  x: number;
  y: number;
  h: number;
  /** Turns the model's +x axis to (cos, sin) on the map. */
  yaw: number;
  scale?: number;
  /** Scale along the model's x axis: fence panels are stretched to fit the run they stand in. */
  stretch?: number;
  /** Rise per metre along the model's x and z axes, so that it follows the ground. */
  slopeX?: number;
  slopeZ?: number;
  /** Index of the park it belongs to. */
  park?: number;
  /** Stands in the water on purpose (piers, buoys, boats). */
  afloat?: boolean;
}

export function hash(...v: number[]): number {
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

export const pick = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];
/** Yaw that turns a model's front (+z) towards `d`. */
export const facing = (d: Vec2): number => Math.atan2(-d.x, d.y);
/** Yaw that turns a model's +x axis along `d`. */
export const along = (d: Vec2): number => Math.atan2(d.y, d.x);

const boxes = new Map<string, { min: V3; max: V3 }>();
/** Bounding box of a catalogue model. */
export function bbox(id: string): { min: V3; max: V3 } {
  let b = boxes.get(id);
  if (!b) {
    const spec = MODELS.find((m) => m.id === id);
    if (!spec) throw new Error(`no model ${id}`);
    const { min, max } = spec.build();
    boxes.set(id, (b = { min, max }));
  }
  return b;
}

/**
 * What the open-space placement shares: a raster of the ground that is already taken (roads with their pavements,
 * the railway, water, building lots), the graded ground heights, and the list of things placed.
 */
export class Site {
  readonly n: number;
  readonly grid: Uint8Array;
  /** Ground heights on the terrain grid; the waterfront reshapes them along quays. */
  readonly ground: Float32Array;
  readonly items: SiteItem[] = [];
  readonly seed: number;

  constructor(readonly city: City, readonly roads: RoadModel) {
    const t = city.terrain;
    this.seed = city.config.seed;
    this.ground = new Float32Array(roads.ground);
    const n = (this.n = Math.ceil(t.size / SITE_CELL));
    const grid = (this.grid = new Uint8Array(n * n));
    const land = city.land;
    for (let j = 0; j < n; j++) {
      const y = (j + 0.5) * SITE_CELL;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * SITE_CELL;
        if (waterDistAt(t, x, y) < 0.5) grid[j * n + i] = WATER;
        else {
          const [li, lj] = [Math.floor(x / land.cell), Math.floor(y / land.cell)];
          // Lots left as open space are open ground like the rest.
          const lot = li >= 0 && lj >= 0 && li < land.n && lj < land.n ? land.grid[lj * land.n + li] : 0;
          if (lot > 0 && land.lots[lot - 1]?.use !== 'OS') grid[j * n + i] = LOT;
        }
      }
    }
    const M = 0.6;
    city.graph.edges.forEach((e) => {
      const line = roads.lines[e.id];
      if (!line) return;
      const lay = layout(roads.sections[e.id]);
      for (let i = 1; i < line.length; i++) this.stampBand(line[i - 1][0], line[i - 1][2], line[i][0], line[i][2], lay.outer[0] - M, lay.outer[1] + M, ROAD, 0.5);
    });
    for (const j of roads.junctions) {
      let r = 0;
      for (const a of j.arms) {
        if (!roads.lines[a.edge] || !Number.isFinite(a.reach)) continue;
        const lay = layout(a.end === 0 ? roads.sections[a.edge] : reversed(roads.sections[a.edge]));
        r = Math.max(r, -lay.outer[0], lay.outer[1]);
        this.stampBand(j.x, j.y, j.x + a.dir.x * (a.reach + 0.5), j.y + a.dir.y * (a.reach + 0.5), lay.outer[0] - M, lay.outer[1] + M, ROAD, 0);
      }
      this.stampDisc(j.x, j.y, (j.roundabout ? j.roundabout.radius + 3.5 : r) + M, ROAD);
    }
    for (const bay of roads.bays) {
      const line = roads.lines[bay.edge]!;
      const lay = layout(roads.sections[bay.edge]);
      let d = 0;
      for (let i = 1; i < line.length && d < bay.to; i++) {
        const [a, b] = [line[i - 1], line[i]];
        d += Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (d < bay.from) continue;
        if (bay.side > 0) this.stampBand(a[0], a[2], b[0], b[2], 0, lay.outer[1] + bay.depth + M, ROAD, 0.5);
        else this.stampBand(a[0], a[2], b[0], b[2], lay.outer[0] - bay.depth - M, 0, ROAD, 0.5);
      }
    }
    for (const tr of roads.rail.lines) {
      const w = tr.tracks * 2 + 5.6;
      for (let i = 1; i < tr.pts.length; i++) {
        if (tr.structure[i] === 'tunnel' && tr.structure[i - 1] === 'tunnel') continue;
        this.stampBand(tr.pts[i - 1].x, tr.pts[i - 1].y, tr.pts[i].x, tr.pts[i].y, -w, w, RAIL, 1);
      }
    }
    for (const s of city.stations) {
      const [dx, dy] = [Math.cos(s.angle), Math.sin(s.angle)];
      this.stampBand(s.x - dx * 110, s.y - dy * 110, s.x + dx * 110, s.y + dy * 110, -30, 30, RAIL, 0);
    }
  }

  /** Marks the cells within [l, r] across the segment a→b (r to the right of its direction as the road sections see it). */
  stampBand(ax: number, ay: number, bx: number, by: number, l: number, r: number, code: number, cap = 0, only = -1): void {
    const [vx, vy] = [bx - ax, by - ay];
    const len = Math.hypot(vx, vy);
    if (len < 1e-6) return;
    const reach = Math.max(Math.abs(l), Math.abs(r)) + cap + SITE_CELL;
    const n = this.n;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / SITE_CELL));
    const i1 = Math.min(n - 1, Math.floor((Math.max(ax, bx) + reach) / SITE_CELL));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach) / SITE_CELL));
    const j1 = Math.min(n - 1, Math.floor((Math.max(ay, by) + reach) / SITE_CELL));
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * SITE_CELL - ay;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * SITE_CELL - ax;
        const u = (x * vx + y * vy) / len;
        if (u < -cap || u > len + cap) continue;
        const off = (x * -vy + y * vx) / len;
        if (off < l || off > r) continue;
        const k = j * n + i;
        if (only < 0 || this.grid[k] === only) this.grid[k] = code;
      }
    }
  }

  stampDisc(cx: number, cy: number, r: number, code: number, only = -1): void {
    const n = this.n;
    const i0 = Math.max(0, Math.floor((cx - r) / SITE_CELL));
    const i1 = Math.min(n - 1, Math.floor((cx + r) / SITE_CELL));
    const j0 = Math.max(0, Math.floor((cy - r) / SITE_CELL));
    const j1 = Math.min(n - 1, Math.floor((cy + r) / SITE_CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (Math.hypot((i + 0.5) * SITE_CELL - cx, (j + 0.5) * SITE_CELL - cy) > r) continue;
        const k = j * n + i;
        if (only < 0 || this.grid[k] === only) this.grid[k] = code;
      }
  }

  /** What occupies the ground at a point; outside the map counts as a road. */
  at(x: number, y: number): number {
    const [i, j] = [Math.floor(x / SITE_CELL), Math.floor(y / SITE_CELL)];
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return ROAD;
    return this.grid[j * this.n + i];
  }

  /** Whether every cell within r of a point holds one of the given codes. */
  all(x: number, y: number, r: number, ...codes: number[]): boolean {
    // Samples a cell apart through the point itself, and on the rim of the circle along both axes.
    const n = Math.ceil(r / SITE_CELL);
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++) {
        const [dx, dy] = [Math.max(-r, Math.min(r, i * SITE_CELL)), Math.max(-r, Math.min(r, j * SITE_CELL))];
        if (dx * dx + dy * dy > r * r + 1e-6) continue;
        if (!codes.includes(this.at(x + dx, y + dy))) return false;
      }
    return true;
  }

  /** Gives the ground of the given lots (by index) back as open ground. */
  release(lots: number[]): void {
    if (!lots.length) return;
    const land = this.city.land;
    const gone = new Set(lots);
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        if (this.grid[j * this.n + i] !== LOT) continue;
        const [li, lj] = [Math.floor(((i + 0.5) * SITE_CELL) / land.cell), Math.floor(((j + 0.5) * SITE_CELL) / land.cell)];
        if (gone.has(land.grid[lj * land.n + li] - 1)) this.grid[j * this.n + i] = FREE;
      }
  }

  /** Height of the ground as it is drawn: the terrain mesh has two flat triangles to a cell, split from (i + 1, j) to (i, j + 1). */
  heightAt(x: number, y: number): number {
    const t = this.city.terrain;
    const n = t.n;
    const fx = Math.max(0, Math.min(n - 1.001, x / t.cell));
    const fy = Math.max(0, Math.min(n - 1.001, y / t.cell));
    const [i, j] = [Math.floor(fx), Math.floor(fy)];
    const [u, v] = [fx - i, fy - j];
    const k = j * n + i;
    const g = this.ground;
    return u + v <= 1 ? g[k] + u * (g[k + 1] - g[k]) + v * (g[k + n] - g[k]) : g[k + n + 1] + (1 - u) * (g[k + n] - g[k + n + 1]) + (1 - v) * (g[k + 1] - g[k + n + 1]);
  }

  /** Map position of a point given in a model's own axes for a model whose origin is at (x, y). */
  static local(x: number, y: number, yaw: number, mx: number, mz: number): Vec2 {
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    return { x: x + c * mx - s * mz, y: y + s * mx + c * mz };
  }

  /** Stands a model with the middle of its bounding box at (cx, cy), on the ground there. */
  put(model: string, kind: SiteKind, cx: number, cy: number, yaw: number, o: Partial<SiteItem> & { lift?: number } = {}): SiteItem {
    const { min, max } = bbox(model);
    const k = o.scale ?? 1;
    const p = Site.local(cx, cy, yaw, (-(min[0] + max[0]) / 2) * k * (o.stretch ?? 1), (-(min[2] + max[2]) / 2) * k);
    const { lift, ...rest } = o;
    const it: SiteItem = { model, kind, x: p.x, y: p.y, h: (o.h ?? this.heightAt(cx, cy)) + (lift ?? 0), yaw, ...rest };
    if (o.h !== undefined) it.h = o.h + (lift ?? 0);
    this.items.push(it);
    return it;
  }

  /** Stands a model with its origin at (x, y) and height h. */
  set(model: string, kind: SiteKind, x: number, y: number, h: number, yaw: number, o: Partial<SiteItem> = {}): SiteItem {
    const it: SiteItem = { model, kind, x, y, h, yaw, ...o };
    this.items.push(it);
    return it;
  }

  /**
   * Stands 12 m fence panels along a line, each stretched to fit and sheared to the ground between its ends
   * (or level at `level`). Returns how many it stood.
   */
  panels(model: string, kind: SiteKind, pts: Vec2[], o: Partial<SiteItem> = {}, level?: number): number {
    const len = polyLength(pts);
    if (len < 1.5) return 0;
    const n = Math.max(1, Math.round(len / 12));
    for (let i = 0; i < n; i++) {
      const [p, q] = [pointAt(pts, (len * i) / n).p, pointAt(pts, (len * (i + 1)) / n).p];
      const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const [h0, h1] = level === undefined ? [this.heightAt(p.x, p.y), this.heightAt(q.x, q.y)] : [level, level];
      this.set(model, kind, (p.x + q.x) / 2, (p.y + q.y) / 2, (h0 + h1) / 2, Math.atan2(q.y - p.y, q.x - p.x), { stretch: l / 12, slopeX: (h1 - h0) / l, ...o });
    }
    return n;
  }

  /**
   * Stands a wide, flat model (a court, a shelter) on sloping ground: sheared to the plane through the ground under it
   * and lifted until no part of the ground shows through.
   */
  lay(model: string, kind: SiteKind, cx: number, cy: number, yaw: number, o: Partial<SiteItem> = {}): SiteItem {
    const { min, max } = bbox(model);
    const k = o.scale ?? 1;
    const [hx, hz] = [((max[0] - min[0]) / 2) * k, ((max[2] - min[2]) / 2) * k];
    const fit = this.plane(cx, cy, yaw, hx, hz);
    const it = this.put(model, kind, cx, cy, yaw, o);
    it.slopeX = fit.gx * k;
    it.slopeZ = fit.gz * k;
    // The plane passes through the middle of the box; the origin may be elsewhere.
    const [ox, oz] = [(-(min[0] + max[0]) / 2) * k, (-(min[2] + max[2]) / 2) * k];
    it.h = fit.h + fit.gx * ox + fit.gz * oz + fit.over + 0.03;
    return it;
  }

  /** Least-squares plane through the ground under a rectangle, in the rectangle's axes, and how far the ground rises above it. */
  plane(cx: number, cy: number, yaw: number, hx: number, hz: number): { h: number; gx: number; gz: number; over: number; resid: number } {
    const pts: [number, number, number][] = [];
    const [nx, nz] = [Math.max(1, Math.ceil(hx / 3)), Math.max(1, Math.ceil(hz / 3))];
    for (let a = -nx; a <= nx; a++)
      for (let c = -nz; c <= nz; c++) {
        const [mx, mz] = [(a / nx) * hx, (c / nz) * hz];
        const p = Site.local(cx, cy, yaw, mx, mz);
        pts.push([mx, mz, this.heightAt(p.x, p.y)]);
      }
    let [sxx, szz, sxh, szh, sh] = [0, 0, 0, 0, 0];
    for (const [x, z, h] of pts) {
      sxx += x * x;
      szz += z * z;
      sxh += x * h;
      szh += z * h;
      sh += h;
    }
    const h = sh / pts.length;
    const [gx, gz] = [sxx > 0 ? sxh / sxx : 0, szz > 0 ? szh / szz : 0];
    let [over, resid] = [0, 0];
    for (const [x, z, hh] of pts) {
      const d = hh - (h + gx * x + gz * z);
      over = Math.max(over, d);
      resid = Math.max(resid, Math.abs(d));
    }
    return { h, gx, gz, over, resid };
  }

  /** Lays a surface over the ground under a rectangle (2 m squares that follow the terrain). */
  drape(b: MeshBuilder, tex: string, cx: number, cy: number, yaw: number, hx: number, hz: number, lift = 0.05, inside?: (mx: number, mz: number) => boolean): void {
    const [nx, nz] = [Math.max(1, Math.round(hx / 1.5)), Math.max(1, Math.round(hz / 1.5))];
    const at = (a: number, c: number): V3 => {
      const [mx, mz] = [(a / nx) * hx, (c / nz) * hz];
      const p = Site.local(cx, cy, yaw, mx, mz);
      return [p.x, this.heightAt(p.x, p.y) + lift, p.y];
    };
    for (let a = -nx; a < nx; a++)
      for (let c = -nz; c < nz; c++) {
        if (inside && !inside(((a + 0.5) / nx) * hx, ((c + 0.5) / nz) * hz)) continue;
        const [u0, u1, v0, v1] = [(a / nx) * hx, ((a + 1) / nx) * hx, (c / nz) * hz, ((c + 1) / nz) * hz];
        b.quadUp(tex, at(a, c), at(a + 1, c), at(a + 1, c + 1), at(a, c + 1), 0, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
  }

  /** Lays one copy of a mark (a worn patch, fallen leaves) over the ground, or over `surface` where something is laid above the ground, stretched to the rectangle. */
  decal(b: MeshBuilder, tex: string, cx: number, cy: number, yaw: number, hx: number, hz: number, lift = 0.04, surface?: (x: number, y: number) => number): void {
    const { mw, mh } = b.part(tex);
    const [nx, nz] = [Math.max(1, Math.round(hx / 1.5)), Math.max(1, Math.round(hz / 1.5))];
    const at = (a: number, c: number): V3 => {
      const p = Site.local(cx, cy, yaw, (a / nx) * hx, (c / nz) * hz);
      return [p.x, (surface ? surface(p.x, p.y) : this.heightAt(p.x, p.y)) + lift, p.y];
    };
    const uv = (a: number, c: number): [number, number] => [((a / nx + 1) / 2) * mw, ((c / nz + 1) / 2) * mh];
    for (let a = -nx; a < nx; a++)
      for (let c = -nz; c < nz; c++) b.quadUp(tex, at(a, c), at(a + 1, c), at(a + 1, c + 1), at(a, c + 1), 0, [uv(a, c), uv(a + 1, c), uv(a + 1, c + 1), uv(a, c + 1)]);
  }

  /** Lays a ribbon of paving along a line on the map. */
  ribbon(b: MeshBuilder, tex: string, pts: Vec2[], w: number, lift = 0.05): void {
    let s = 0;
    let prev: [V3, V3, number] | null = null;
    for (let i = 0; i < pts.length; i++) {
      const [a, c] = [pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, i + 1)]];
      const l = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const [nx, ny] = [-(c.y - a.y) / l, (c.x - a.x) / l];
      if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const side = (k: number): V3 => {
        const [x, y] = [pts[i].x + nx * k, pts[i].y + ny * k];
        return [x, this.heightAt(x, y) + lift, y];
      };
      const cur: [V3, V3, number] = [side(-w / 2), side(w / 2), s];
      if (prev) b.quadUp(tex, prev[0], prev[1], cur[1], cur[0], 0, [[0, prev[2]], [w, prev[2]], [w, cur[2]], [0, cur[2]]]);
      prev = cur;
    }
  }
}

/** Distance of every set cell of a mask from the nearest clear one, in cells (chamfer 3-4, exact enough for clearances). */
export function clearance(mask: Uint8Array, w: number, h: number, want = 1): Float32Array {
  const d = new Float32Array(w * h);
  const BIG = 1e6;
  for (let k = 0; k < w * h; k++) d[k] = mask[k] === want ? BIG : 0;
  const [A, B] = [1, Math.SQRT2];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!d[k]) continue;
      let v = d[k];
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) v = Math.min(v, 1);
      if (i > 0) v = Math.min(v, d[k - 1] + A);
      if (j > 0) {
        v = Math.min(v, d[k - w] + A);
        if (i > 0) v = Math.min(v, d[k - w - 1] + B);
        if (i < w - 1) v = Math.min(v, d[k - w + 1] + B);
      }
      d[k] = v;
    }
  for (let j = h - 1; j >= 0; j--)
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (!d[k]) continue;
      let v = d[k];
      if (i < w - 1) v = Math.min(v, d[k + 1] + A);
      if (j < h - 1) {
        v = Math.min(v, d[k + w] + A);
        if (i < w - 1) v = Math.min(v, d[k + w + 1] + B);
        if (i > 0) v = Math.min(v, d[k + w - 1] + B);
      }
      d[k] = v;
    }
  return d;
}
