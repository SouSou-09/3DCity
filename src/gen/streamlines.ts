import { Rng } from '../core/rng';
import { SegmentIndex, pointSeg, polyLength, segSeg } from '../core/geom';
import { Vec2 } from '../core/vec2';
import { RAIL_CLEARANCE, RailIndex } from './rail';
import { TensorField, fieldAngle } from './tensorField';
import { Terrain, heightAt, inBounds, isWater, riverBankAt, seaDistAt, waterDistAt } from './terrain';

export type RoadClass = 'highway' | 'ramp' | 'arterial' | 'collector' | 'local';
export const CLASS_RANK: Record<RoadClass, number> = { local: 1, collector: 2, arterial: 3, ramp: 4, highway: 5 };
export const isStreet = (c: RoadClass) => c === 'arterial' || c === 'collector' || c === 'local';

/** Why a traced line stopped; decides whether the end is later extended to the next road. */
export type EndReason = 'bounds' | 'water' | 'barrier' | 'near' | 'length' | 'cross' | 'steep' | 'fixed';

export interface RoadLine {
  points: Vec2[];
  cls: RoadClass;
  /** 0 = along the field, 1 = across it, -1 = not field-aligned. */
  family: number;
  ends: [EndReason, EndReason];
}

export interface PassOptions {
  cls: RoadClass;
  /** Target spacing between neighbouring streets of the same family. */
  sep: (x: number, y: number, family: number) => number;
  /** A line stops when it gets closer than testRatio * sep to a same-family line. */
  testRatio: number;
  step: number;
  minLength: number;
  maxLength: (x: number, y: number) => number;
  canBridge: boolean;
  maxGrade: number;
  /** Probability of ending at a bigger road instead of crossing it. */
  crossStop: (x: number, y: number) => number;
  /** Probability of leaving an end that ran out of length unconnected (cul-de-sac). */
  deadEnd: (x: number, y: number) => number;
  seeds: { p: Vec2; family: number }[];
  randomTries: number;
}

class SampleHash {
  private cells = new Map<number, number[]>();

  constructor(private readonly cell: number) {}

  add(x: number, y: number): void {
    const k = (Math.floor(x / this.cell) + 4096) * 8192 + Math.floor(y / this.cell) + 4096;
    let arr = this.cells.get(k);
    if (!arr) this.cells.set(k, (arr = []));
    arr.push(x, y);
  }

  free(x: number, y: number, d: number): boolean {
    const c = this.cell;
    const x0 = Math.floor((x - d) / c);
    const x1 = Math.floor((x + d) / c);
    const y0 = Math.floor((y - d) / c);
    const y1 = Math.floor((y + d) / c);
    const d2 = d * d;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get((cx + 4096) * 8192 + cy + 4096);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 2) {
          const dx = arr[i] - x;
          const dy = arr[i + 1] - y;
          if (dx * dx + dy * dy < d2) return false;
        }
      }
    }
    return true;
  }
}

interface OwnSample {
  x: number;
  y: number;
  s: number;
}

/** Distance from the river bank within which a road may already be on a bridge approach. */
export const BRIDGE_APPROACH = 32;
const FREEWAY_CLEARANCE = 24;
const RAMP_CLEARANCE = 11;
const RAIL_SIDE = 46;

/**
 * Grows the street network by tracing streamlines through the tensor field
 * (after Chen et al., "Interactive Procedural Street Modeling"), one road class at a time.
 */
/** Minimum distance between two bridges. */
export const BRIDGE_SPACING = 170;

/** Midpoints of the parts of a line that are over water. */
export function waterCrossings(t: Terrain, pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i < pts.length; i++) {
    const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
    if (isWater(t, m.x, m.y)) out.push(m);
  }
  return out;
}

export class RoadBuilder {
  readonly lines: RoadLine[] = [];
  private readonly bridges: Vec2[] = [];
  private readonly segs = new SegmentIndex(60);
  private readonly barriers = new SegmentIndex(60);

  private rail: RailIndex | null = null;
  /** Track samples per street family, so that streets parallel to the railway keep a row of lots away from it. */
  private readonly railSide = [new SampleHash(40), new SampleHash(40)];

  constructor(
    readonly terrain: Terrain,
    readonly field: TensorField,
  ) {}

  setRail(rail: RailIndex): void {
    this.rail = rail;
    for (const line of rail.rail.lines) {
      for (let i = 0; i + 1 < line.points.length; i++) {
        if (line.structure[i] === 'tunnel') continue;
        const p = line.points[i];
        const q = line.points[i + 1];
        const c = Math.abs(Math.cos(fieldAngle(this.field, p.x, p.y, 0) - Math.atan2(q.y - p.y, q.x - p.x)));
        if (c > 0.85) this.railSide[0].add(p.x, p.y);
        else if (c < 0.53) this.railSide[1].add(p.x, p.y);
      }
    }
  }

  /** True if a street of this family would run closer beside the tracks than a lot is deep. */
  private besideRail(x: number, y: number, family: number, sep: number): boolean {
    return !this.railSide[family].free(x, y, Math.min(sep, RAIL_SIDE));
  }

  addLine(line: RoadLine): number {
    const id = this.lines.length;
    this.lines.push(line);
    this.segs.addLine(id, line.points);
    if (!isStreet(line.cls)) this.barriers.addLine(id, line.points);
    this.bridges.push(...waterCrossings(this.terrain, line.points));
    return id;
  }

  /** Freeways and ramps are grade separated: small streets cannot run through them. */
  blocked(x: number, y: number, cls: RoadClass, dx?: number, dy?: number): boolean {
    if (!isStreet(cls)) return false;
    if (this.rail?.blocks(x, y, cls === 'local', dx, dy)) return true;
    if (cls === 'arterial') return false;
    let hit = false;
    this.barriers.query(x - FREEWAY_CLEARANCE, y - FREEWAY_CLEARANCE, x + FREEWAY_CLEARANCE, y + FREEWAY_CLEARANCE, (r) => {
      if (hit) return;
      const other = this.lines[r.line].cls;
      if (other === 'highway' && cls !== 'local') return;
      const d = pointSeg(x, y, r.a, r.b).d;
      if (d < (other === 'highway' ? FREEWAY_CLEARANCE : RAMP_CLEARANCE)) hit = true;
    });
    return hit;
  }

  /** Far bank of a river crossing, or null if the water ahead is too wide to bridge. */
  findLanding(x: number, y: number, dx: number, dy: number): Vec2 | null {
    const t = this.terrain;
    for (let s = 5; s <= 170; s += 5) {
      const qx = x + dx * s;
      const qy = y + dy * s;
      if (!inBounds(t, qx, qy) || seaDistAt(t, qx, qy) < 25) return null;
      if (!isWater(t, qx, qy) && !isWater(t, qx + dx * 14, qy + dy * 14)) {
        const mx = x + (dx * s) / 2;
        const my = y + (dy * s) / 2;
        if (this.bridges.some((b) => Math.hypot(b.x - mx, b.y - my) < BRIDGE_SPACING)) return null;
        return { x: qx + dx * 7, y: qy + dy * 7 };
      }
    }
    return null;
  }

  private dir(x: number, y: number, family: number, px: number, py: number): Vec2 {
    const a = fieldAngle(this.field, x, y, family);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    return dx * px + dy * py < 0 ? { x: -dx, y: -dy } : { x: dx, y: dy };
  }

  private crossing(ax: number, ay: number, bx: number, by: number, rank: number): Vec2 | null {
    let best: Vec2 | null = null;
    let bestT = 2;
    const a = { x: ax, y: ay };
    const b = { x: bx, y: by };
    this.segs.query(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), (r) => {
      const cls = this.lines[r.line].cls;
      if (!isStreet(cls) || CLASS_RANK[cls] <= rank) return;
      const h = segSeg(a, b, r.a, r.b);
      if (h && h.t < bestT) {
        bestT = h.t;
        best = { x: h.x, y: h.y };
      }
    });
    return best;
  }

  private trace(
    seed: Vec2,
    family: number,
    sign: number,
    opt: PassOptions,
    hash: SampleHash,
    own: OwnSample[],
    maxLen: number,
    rng: Rng,
  ): { pts: Vec2[]; reason: EndReason } {
    const t = this.terrain;
    const step = opt.step;
    const rank = CLASS_RANK[opt.cls];
    const pts: Vec2[] = [];
    let x = seed.x;
    let y = seed.y;
    const a0 = fieldAngle(this.field, x, y, family);
    let dx = Math.cos(a0) * sign;
    let dy = Math.sin(a0) * sign;
    let h = heightAt(t, x, y);
    let s = 0;
    for (;;) {
      const d1 = this.dir(x, y, family, dx, dy);
      const d2 = this.dir(x + (d1.x * step) / 2, y + (d1.y * step) / 2, family, d1.x, d1.y);
      const d3 = this.dir(x + (d2.x * step) / 2, y + (d2.y * step) / 2, family, d2.x, d2.y);
      const d4 = this.dir(x + d3.x * step, y + d3.y * step, family, d3.x, d3.y);
      let ndx = d1.x + 2 * d2.x + 2 * d3.x + d4.x;
      let ndy = d1.y + 2 * d2.y + 2 * d3.y + d4.y;
      const l = Math.hypot(ndx, ndy);
      if (l < 1e-6) return { pts, reason: 'length' };
      ndx /= l;
      ndy /= l;
      // The field has no usable direction near its singular points.
      if (ndx * dx + ndy * dy < 0.6) return { pts, reason: 'length' };
      const nx = x + ndx * step;
      const ny = y + ndy * step;
      if (!inBounds(t, nx, ny)) {
        pts.push({ x: nx, y: ny });
        return { pts, reason: 'bounds' };
      }
      if (isWater(t, nx, ny)) {
        const landing = opt.canBridge && seaDistAt(t, nx, ny) > 40 ? this.findLanding(nx, ny, ndx, ndy) : null;
        if (!landing) return { pts, reason: 'water' };
        s += Math.hypot(landing.x - x, landing.y - y);
        pts.push(landing);
        own.push({ x: landing.x, y: landing.y, s: s * sign });
        x = landing.x;
        y = landing.y;
        dx = ndx;
        dy = ndy;
        h = heightAt(t, x, y);
        continue;
      }
      const nh = heightAt(t, nx, ny);
      // Bridges span the river valley, so its banks do not count as a slope.
      const approach = opt.canBridge && riverBankAt(t, nx, ny) < BRIDGE_APPROACH;
      if (!approach && Math.abs(nh - h) / step > opt.maxGrade) return { pts, reason: 'steep' };
      if (this.blocked(nx, ny, opt.cls, ndx, ndy)) {
        pts.push({ x: nx, y: ny });
        return { pts, reason: 'barrier' };
      }
      const hit = this.crossing(x, y, nx, ny, rank);
      if (hit && rng.chance(opt.crossStop(nx, ny))) {
        pts.push(hit);
        return { pts, reason: 'cross' };
      }
      const dtest = opt.testRatio * opt.sep(nx, ny, family);
      if (!hash.free(nx, ny, dtest) || this.besideRail(nx, ny, family, dtest)) return { pts, reason: 'near' };
      const cs = (s + step) * sign;
      const d2test = dtest * dtest;
      for (const o of own) {
        if (Math.abs(o.s - cs) > 3 * dtest && (o.x - nx) ** 2 + (o.y - ny) ** 2 < d2test) return { pts, reason: 'near' };
      }
      pts.push({ x: nx, y: ny });
      own.push({ x: nx, y: ny, s: cs });
      x = nx;
      y = ny;
      dx = ndx;
      dy = ndy;
      h = nh;
      s += step;
      if (s >= maxLen) return { pts, reason: 'length' };
    }
  }

  private seedOk(p: Vec2, family: number, opt: PassOptions, hash: SampleHash): boolean {
    const t = this.terrain;
    if (!inBounds(t, p.x, p.y, 2) || waterDistAt(t, p.x, p.y) < 8) return false;
    if (opt.cls === 'local' ? this.blocked(p.x, p.y, 'local') : this.barriers.nearest(p.x, p.y, 45) < 45) return false;
    if (this.rail?.nearest(p.x, p.y, 2 * RAIL_CLEARANCE) || this.besideRail(p.x, p.y, family, opt.sep(p.x, p.y, family))) return false;
    return hash.free(p.x, p.y, opt.sep(p.x, p.y, family));
  }

  /** Traces streets of one class until the field is filled at the requested spacing. */
  runPass(opt: PassOptions, rng: Rng): number[] {
    const t = this.terrain;
    const hashes = [new SampleHash(40), new SampleHash(40)];
    const cand: Vec2[][] = [[], []];
    const ptr = [0, 0];
    const register = (line: RoadLine) => {
      if (line.family < 0) return;
      for (const p of line.points) {
        hashes[line.family].add(p.x, p.y);
        cand[1 - line.family].push(p);
      }
    };
    for (const line of this.lines) register(line);

    const added: number[] = [];
    const integrate = (seed: Vec2, family: number): boolean => {
      const own: OwnSample[] = [{ x: seed.x, y: seed.y, s: 0 }];
      const maxLen = opt.maxLength(seed.x, seed.y);
      const split = rng.range(0.3, 0.7);
      const fwd = this.trace(seed, family, 1, opt, hashes[family], own, maxLen * split, rng);
      const bwd = this.trace(seed, family, -1, opt, hashes[family], own, maxLen * (1 - split), rng);
      const points = [...bwd.pts.reverse(), seed, ...fwd.pts];
      if (points.length < 2 || polyLength(points) < opt.minLength) return false;
      const line: RoadLine = { points, cls: opt.cls, family, ends: [bwd.reason, fwd.reason] };
      added.push(this.addLine(line));
      register(line);
      return true;
    };

    for (const s of opt.seeds) {
      if (this.seedOk(s.p, s.family, opt, hashes[s.family])) integrate(s.p, s.family);
    }

    let randomBudget = opt.randomTries * 12;
    const nextSeed = (family: number): Vec2 | null => {
      const list = cand[family];
      while (ptr[family] < list.length) {
        const p = list[ptr[family]++];
        if (this.seedOk(p, family, opt, hashes[family])) return p;
      }
      for (let i = 0; i < opt.randomTries && randomBudget > 0; i++, randomBudget--) {
        const p = { x: rng.range(0, t.size), y: rng.range(0, t.size) };
        if (this.seedOk(p, family, opt, hashes[family])) return p;
      }
      return null;
    };

    const alive = [true, true];
    let family = 0;
    while (alive[0] || alive[1]) {
      if (alive[family]) {
        const seed = nextSeed(family);
        if (!seed) alive[family] = false;
        else if (integrate(seed, family)) alive[1 - family] = true;
      }
      family = 1 - family;
    }

    this.joinEnds(
      added,
      (p, line) => 1.35 * opt.sep(p.x, p.y, 1 - line.family),
      (p) => opt.deadEnd(p.x, p.y),
      rng,
    );
    return added;
  }

  /** First road hit by a ray from p, if the way there is clear. */
  rayHit(p: Vec2, dir: Vec2, maxExt: number, self: number, cls: RoadClass): Vec2 | null {
    const t = this.terrain;
    const q = { x: p.x + dir.x * maxExt, y: p.y + dir.y * maxExt };
    let bestT = 2;
    let grazeT = 2;
    let best: Vec2 | null = null;
    this.segs.query(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y), (r) => {
      if (!isStreet(this.lines[r.line].cls)) return;
      const h = segSeg(p, q, r.a, r.b);
      if (!h || h.t >= bestT) return;
      if (r.line === self && h.t * maxExt < 20) return;
      const sx = r.b.x - r.a.x;
      const sy = r.b.y - r.a.y;
      const sin = Math.abs(dir.x * sy - dir.y * sx) / Math.hypot(sx, sy);
      if (sin < 0.5) {
        // Meeting a street at a shallow angle makes a sliver, and passing through it is not an option either.
        grazeT = Math.min(grazeT, h.t);
        return;
      }
      bestT = h.t;
      best = { x: h.x, y: h.y };
    });
    if (!best || grazeT < bestT) return null;
    const hit: Vec2 = best;
    const d = bestT * maxExt;
    for (let s = 4; s < d; s += 4) {
      const x = p.x + dir.x * s;
      const y = p.y + dir.y * s;
      if (isWater(t, x, y) || this.blocked(x, y, cls, dir.x, dir.y)) return null;
    }
    return hit;
  }

  /** Extends loose ends straight ahead to the next road so they form T-junctions. */
  joinEnds(ids: number[], maxExt: (p: Vec2, line: RoadLine) => number, skip: (p: Vec2) => number, rng: Rng): void {
    for (const id of ids) {
      const line = this.lines[id];
      for (let e = 0; e < 2; e++) {
        const reason = line.ends[e];
        if (reason !== 'near' && reason !== 'length') continue;
        const pts = line.points;
        if (pts.length < 2) continue;
        const p = e ? pts[pts.length - 1] : pts[0];
        const prev = e ? pts[pts.length - 2] : pts[1];
        const l = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (l < 1e-6) continue;
        if (reason === 'length' && rng.chance(skip(p))) continue;
        const dir = { x: (p.x - prev.x) / l, y: (p.y - prev.y) / l };
        const hit = this.rayHit(p, dir, maxExt(p, line), id, line.cls);
        if (!hit) continue;
        if (e) pts.push(hit);
        else pts.unshift(hit);
        this.segs.add(id, -1, p, hit);
        if (!isStreet(line.cls)) this.barriers.add(id, -1, p, hit);
        line.ends[e] = 'fixed';
      }
    }
  }
}
