import { SignShape, signOutline, signShape } from '../tex';
import { MeshBuilder, V3, v3 } from './builder';

/** Placement of a part: origin and right / up / facing unit vectors. */
export interface Pose {
  o: V3;
  x: V3;
  y: V3;
  z: V3;
}
const rad = (deg: number): number => (deg * Math.PI) / 180;
const mix = (a: V3, b: V3, ca: number, cb: number): V3 => [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb];

/** Pose standing at o and facing +z, turned by `yaw` degrees (counter-clockwise seen from above). */
export const stand = (o: V3 = [0, 0, 0], yaw = 0): Pose => turn({ o, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, yaw);
export const at = (f: Pose, x: number, y: number, z: number): V3 => v3.mad(v3.mad(v3.mad(f.o, f.x, x), f.y, y), f.z, z);
export const move = (f: Pose, x: number, y: number, z: number): Pose => ({ ...f, o: at(f, x, y, z) });
/** Turns around the up axis. */
export function turn(f: Pose, deg: number): Pose {
  const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return { o: f.o, x: mix(f.x, f.z, c, -s), y: f.y, z: mix(f.z, f.x, c, s) };
}
/** Leans around the right axis; positive tips the top towards the viewer. */
export function tilt(f: Pose, deg: number): Pose {
  const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return { o: f.o, x: f.x, y: mix(f.y, f.z, c, s), z: mix(f.z, f.y, c, -s) };
}
/** Rotates around the facing axis, counter-clockwise seen from the front. */
export function roll(f: Pose, deg: number): Pose {
  const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return { o: f.o, x: mix(f.x, f.y, c, s), y: mix(f.y, f.x, c, -s), z: f.z };
}

/** Box given by its centre and half sizes in the pose's axes. */
export function box(b: MeshBuilder, material: string, f: Pose, c: V3, half: V3, skip = ''): void {
  b.box(material, at(f, c[0], c[1], c[2]), half, f.x, f.y, f.z, skip);
}

/** Flat rectangle facing +z showing the whole texture once (or `uv` metres of it). */
export function face(b: MeshBuilder, material: string, f: Pose, c: V3, w: number, h: number, uv?: [number, number, number, number]): void {
  const p = b.part(material);
  const [u0, v0, u1, v1] = uv ?? [0, 0, p.mw, p.mh];
  const q = (sx: number, sy: number): V3 => at(f, c[0] + (sx * w) / 2, c[1] + (sy * h) / 2, c[2]);
  b.quad(material, q(-1, -1), q(1, -1), q(1, 1), q(-1, 1), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
}

/** Disc facing +z. `texR` is the radius in the texture that the rim maps to (the texture is centred on the disc). */
export function disc(b: MeshBuilder, material: string, f: Pose, c: V3, r: number, sides = 20, texR = r): void {
  const p = b.part(material);
  const k = texR / r;
  const pt = (i: number): [V3, [number, number]] => {
    const a = (i / sides) * Math.PI * 2;
    const [x, y] = [Math.cos(a) * r, Math.sin(a) * r];
    return [at(f, c[0] + x, c[1] + y, c[2]), [p.mw / 2 + x * k, p.mh / 2 + y * k]];
  };
  const centre = at(f, c[0], c[1], c[2]);
  for (let i = 0; i < sides; i++) {
    const [a, ua] = pt(i);
    const [d, ud] = pt(i + 1);
    b.tri(material, centre, a, d, [[p.mw / 2, p.mh / 2], ua, ud]);
  }
}

/**
 * Part of a cylinder wall around the facing axis, from angle a0 to a1 (degrees, 0 = right, 90 = up),
 * starting at c and reaching `len(angle)` forward. Two-sided: `inner` is the material seen from the axis.
 */
export function shroud(b: MeshBuilder, outer: string, inner: string, f: Pose, c: V3, r: number, a0: number, a1: number, len: (deg: number) => number, segs = 12, flare = 1): void {
  const ring = (i: number): { n: V3; p0: V3; p1: V3; u: number; l: number } => {
    const deg = a0 + ((a1 - a0) * i) / segs;
    const [cx, cy] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
    const l = len(deg);
    return {
      n: v3.add(v3.scale(f.x, cx), v3.scale(f.y, cy)),
      p0: at(f, c[0] + cx * r, c[1] + cy * r, c[2]),
      p1: at(f, c[0] + cx * r * flare, c[1] + cy * r * flare, c[2] + l),
      u: rad(deg) * r,
      l,
    };
  };
  for (let i = 0; i < segs; i++) {
    const [s, e] = [ring(i), ring(i + 1)];
    const uv: [number, number][] = [[s.u, 0], [e.u, 0], [e.u, e.l], [s.u, s.l]];
    b.quad(outer, s.p0, e.p0, e.p1, s.p1, uv, 0, [s.n, e.n, e.n, s.n]);
    const [ns, ne] = [v3.scale(s.n, -1), v3.scale(e.n, -1)];
    b.quad(inner, e.p0, s.p0, s.p1, e.p1, [uv[1], uv[0], uv[3], uv[2]], 0, [ne, ns, ns, ne]);
  }
}

/** Surface of revolution around the up axis. Profile points are [radius, height], listed bottom to top. */
export function lathe(b: MeshBuilder, material: string, f: Pose, profile: [number, number][], sides = 12, squash = 1): void {
  const dir = (i: number): V3 => {
    const a = (i / sides) * Math.PI * 2;
    return v3.add(v3.scale(f.x, Math.cos(a)), v3.scale(f.z, -Math.sin(a) * squash));
  };
  let v = 0;
  for (let k = 0; k + 1 < profile.length; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    const run = Math.hypot(r1 - r0, y1 - y0);
    if (run < 1e-6) continue;
    const [nr, ny] = [(y1 - y0) / run, -(r1 - r0) / run];
    for (let i = 0; i < sides; i++) {
      const [d0, d1] = [dir(i), dir(i + 1)];
      const p = (d: V3, r: number, y: number): V3 => v3.mad(v3.mad(f.o, d, r), f.y, y);
      const n = (d: V3): V3 => v3.norm(v3.add(v3.scale(d, nr), v3.scale(f.y, ny)));
      const rm = Math.max(r0, r1);
      const [u0, u1] = [(i / sides) * Math.PI * 2 * rm, ((i + 1) / sides) * Math.PI * 2 * rm];
      const uv: [number, number][] = [[u0, v], [u1, v], [u1, v + run], [u0, v + run]];
      if (r0 < 1e-6) b.tri(material, p(d0, 0, y0), p(d1, r1, y1), p(d0, r1, y1), [uv[0], uv[2], uv[3]]);
      else if (r1 < 1e-6) b.tri(material, p(d0, r0, y0), p(d1, r0, y0), p(d0, 0, y1), [uv[0], uv[1], uv[3]]);
      else b.quad(material, p(d0, r0, y0), p(d1, r0, y0), p(d1, r1, y1), p(d0, r1, y1), uv, 0, [n(d0), n(d1), n(d1), n(d0)]);
    }
    v += run;
  }
}

/** Round bar through a list of points, with smooth bends. `r` may vary with the fraction along the bar. */
export function pipe(b: MeshBuilder, material: string, pts: V3[], r: number | ((q: number) => number), sides = 8, caps = true): void {
  const n = pts.length;
  const radius = (i: number): number => (typeof r === 'number' ? r : r(i / (n - 1)));
  const tangent = (i: number): V3 => v3.norm(v3.sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
  let t = tangent(0);
  let ax = v3.norm(v3.cross(Math.abs(t[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], t));
  const rings: { p: V3; n: V3 }[][] = [];
  let s = 0;
  const dist: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) s += v3.len(v3.sub(pts[i], pts[i - 1]));
    dist.push(s);
    t = tangent(i);
    // Carry the previous side vector along so the bar does not twist.
    ax = v3.norm(v3.sub(ax, v3.scale(t, v3.dot(ax, t))));
    const ay = v3.cross(t, ax);
    const ring: { p: V3; n: V3 }[] = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const d = v3.add(v3.scale(ax, Math.cos(a)), v3.scale(ay, Math.sin(a)));
      ring.push({ p: v3.mad(pts[i], d, radius(i)), n: d });
    }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < n; i++) {
    for (let k = 0; k < sides; k++) {
      const [a, d, e, g] = [rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]];
      const [u0, u1] = [(k / sides) * Math.PI * 2 * radius(i), ((k + 1) / sides) * Math.PI * 2 * radius(i)];
      b.quad(material, a.p, d.p, e.p, g.p, [[u0, dist[i]], [u1, dist[i]], [u1, dist[i + 1]], [u0, dist[i + 1]]], 0, [a.n, d.n, e.n, g.n]);
    }
  }
  if (caps) {
    for (let k = 0; k < sides; k++) {
      const rr = radius(n - 1);
      b.tri(material, pts[n - 1], rings[n - 1][k].p, rings[n - 1][k + 1].p, [[0, 0], [rr, 0], [rr, rr]]);
      b.tri(material, pts[0], rings[0][k + 1].p, rings[0][k].p, [[0, 0], [radius(0), 0], [radius(0), radius(0)]]);
    }
  }
}

/** Points of a cable hanging between two supports with `sag` metres of dip. */
export function catenary(a: V3, c: V3, sag: number, n = 12): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const q = i / n;
    const p = v3.lerp(a, c, q);
    out.push([p[0], p[1] - sag * 4 * q * (1 - q), p[2]]);
  }
  return out;
}

export interface PlateOpts {
  /** Back of the blank. */
  back?: string;
  thick?: number;
  /** Depth offset per point of the blank (metres from its centre), for bent or dished signs. */
  warp?: (x: number, y: number) => number;
  /** Overrides the size given by the texture. */
  size?: [number, number];
  shape?: SignShape;
}
/** Sign blank cut to the outline its face texture was drawn on, centred on c and facing +z. Returns its size. */
export function plate(b: MeshBuilder, material: string, f: Pose, c: V3, o: PlateOpts = {}): [number, number] {
  const p = b.part(material);
  const [w, h] = o.size ?? [p.mw, p.mh];
  const back = o.back ?? 'sign/back-aluminium';
  const t = o.thick ?? 0.004;
  const outline = signOutline(o.shape ?? signShape(material), w, h);
  const z = (x: number, y: number): number => (o.warp ? o.warp(x, y) : 0);
  const P = (x: number, y: number, dz: number): V3 => at(f, c[0] + x - w / 2, c[1] + y - h / 2, c[2] + z(x - w / 2, y - h / 2) + dz);
  const uv = (x: number, y: number): [number, number] => [(x / w) * p.mw, (y / h) * p.mh];
  const mid: [number, number] = [w / 2, h * (o.shape === 'yield' || signShape(material) === 'yield' ? 0.62 : 0.5)];
  const n = outline.length;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % n];
    b.tri(material, P(mid[0], mid[1], 0), P(ax, ay, 0), P(bx, by, 0), [uv(mid[0], mid[1]), uv(ax, ay), uv(bx, by)]);
    b.tri(back, P(mid[0], mid[1], -t), P(bx, by, -t), P(ax, ay, -t), [[w - mid[0], mid[1]], [w - bx, by], [w - ax, ay]]);
    const len = Math.hypot(bx - ax, by - ay);
    b.quad(back, P(bx, by, 0), P(ax, ay, 0), P(ax, ay, -t), P(bx, by, -t), [[run + len, t], [run, t], [run, 0], [run + len, 0]]);
    run += len;
  }
  return [w, h];
}

/** Square base plate with anchor bolts on a round concrete footing; the pole stands on y = 0 of the pose. */
export function footing(b: MeshBuilder, material: string, f: Pose, half: number, o: { concrete?: number; bolts?: boolean; thick?: number } = {}): void {
  const t = o.thick ?? 0.03;
  const pad = o.concrete ?? half * 1.5;
  if (pad > 0) lathe(b, 'concrete/walk-square', f, [[pad, -0.25], [pad, -0.02], [pad - 0.02, 0], [0, 0]], 14);
  box(b, material, f, [0, t / 2, 0], [half, t / 2, half], 'Y');
  if (o.bolts !== false) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      const [x, z] = [sx * half * 0.78, sz * half * 0.78];
      b.tube('structure/steel-galvanized', at(f, x, t, z), at(f, x, t + 0.05, z), 0.018, 6, 0.018, true);
    }
  }
}

const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
/** Right-handed pose whose y axis lies along the given pose's x axis, for lathing horizontal shapes. */
export const layX = (f: Pose): Pose => ({ o: f.o, x: f.y, y: f.x, z: neg(f.z) });
/** Right-handed pose whose y axis lies along the given pose's z axis. */
export const layZ = (f: Pose): Pose => ({ o: f.o, x: f.x, y: f.z, z: neg(f.y) });
