import { Vec2, dist } from './vec2';

/** Intersection of segments ab and cd; t along ab, u along cd. */
export function segSeg(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { t: number; u: number; x: number; y: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: a.x + rx * t, y: a.y + ry * t };
}

export function pointSeg(px: number, py: number, a: Vec2, b: Vec2): { d: number; t: number; x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  return { d: Math.hypot(px - x, py - y), t, x, y };
}

export function polyLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Point and unit tangent at arc length s along a polyline (clamped). */
export function pointAt(pts: Vec2[], s: number): { p: Vec2; tan: Vec2; seg: number } {
  let acc = 0;
  let last = -1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    if (l < 1e-9) continue;
    last = i;
    if (s <= acc + l || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, (s - acc) / l));
      return {
        p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        tan: { x: (b.x - a.x) / l, y: (b.y - a.y) / l },
        seg: i - 1,
      };
    }
    acc += l;
  }
  // Past the end of a line whose last points coincide: the end of its last real segment.
  if (last > 0) {
    const a = pts[last - 1];
    const b = pts[last];
    const l = dist(a, b);
    return { p: { ...b }, tan: { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, seg: last - 1 };
  }
  return { p: { ...pts[0] }, tan: { x: 1, y: 0 }, seg: 0 };
}

/** Part of a polyline between arc lengths s0 and s1. */
export function subPath(pts: Vec2[], s0: number, s1: number): Vec2[] {
  const out: Vec2[] = [pointAt(pts, s0).p];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (acc > s0 + 1e-6 && acc < s1 - 1e-6) out.push(pts[i]);
  }
  out.push(pointAt(pts, s1).p);
  return out;
}

export function resample(pts: Vec2[], step: number): Vec2[] {
  const total = polyLength(pts);
  const n = Math.max(1, Math.round(total / step));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(pointAt(pts, (total * i) / n).p);
  return out;
}

/** Douglas-Peucker simplification. */
export function simplify(pts: Vec2[], tol: number): Vec2[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let best = -1;
    let bestD = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const d = pointSeg(pts[i].x, pts[i].y, pts[i0], pts[i1]).d;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i0, best], [best, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Centripetal-ish Catmull-Rom through the given points. */
export function catmullRom(pts: Vec2[], samplesPerSpan = 16): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < samplesPerSpan; k++) {
      const t = k / samplesPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push({ ...pts[n - 1] });
  return out;
}

export function cubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    const a = m * m * m;
    const b = 3 * m * m * t;
    const c = 3 * m * t * t;
    const d = t * t * t;
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y });
  }
  return out;
}

export interface SegRef {
  line: number;
  seg: number;
  a: Vec2;
  b: Vec2;
  stamp: number;
}

/** Uniform-grid index over line segments. */
export class SegmentIndex {
  private cells = new Map<number, SegRef[]>();
  private stamp = 0;

  constructor(private readonly cell: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 4096) * 8192 + (cy + 4096);
  }

  add(line: number, seg: number, a: Vec2, b: Vec2): void {
    const ref: SegRef = { line, seg, a, b, stamp: 0 };
    const c = this.cell;
    const x0 = Math.floor(Math.min(a.x, b.x) / c);
    const x1 = Math.floor(Math.max(a.x, b.x) / c);
    const y0 = Math.floor(Math.min(a.y, b.y) / c);
    const y1 = Math.floor(Math.max(a.y, b.y) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(ref);
      }
    }
  }

  addLine(line: number, pts: Vec2[], from = 0): void {
    for (let i = Math.max(1, from); i < pts.length; i++) this.add(line, i - 1, pts[i - 1], pts[i]);
  }

  query(minX: number, minY: number, maxX: number, maxY: number, cb: (ref: SegRef) => void): void {
    const c = this.cell;
    const stamp = ++this.stamp;
    const x0 = Math.floor(minX / c);
    const x1 = Math.floor(maxX / c);
    const y0 = Math.floor(minY / c);
    const y1 = Math.floor(maxY / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const ref of arr) {
          if (ref.stamp === stamp) continue;
          ref.stamp = stamp;
          cb(ref);
        }
      }
    }
  }

  /** Distance from a point to the nearest indexed segment within `radius` (Infinity if none). */
  nearest(x: number, y: number, radius: number): number {
    let best = Infinity;
    this.query(x - radius, y - radius, x + radius, y + radius, (r) => {
      const d = pointSeg(x, y, r.a, r.b).d;
      if (d < best) best = d;
    });
    return best <= radius ? best : Infinity;
  }
}
