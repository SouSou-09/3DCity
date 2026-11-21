import { textureSpec } from '../tex';

export type V3 = [number, number, number];
export const v3 = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s],
  /** a + b * s */
  mad: (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: V3): number => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const UP: V3 = [0, 1, 0];

export interface MeshPart {
  /** Texture id from the texture registry. */
  material: string;
  /** Draw order for decals lying on a surface: 0 = surface, higher = on top. */
  layer: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export interface ModelData {
  parts: MeshPart[];
  min: V3;
  max: V3;
  triangles: number;
}

/** Collects triangles per material. UVs are given in metres and divided by the texture's size. */
export class MeshBuilder {
  private parts = new Map<string, MeshPart & { mw: number; mh: number }>();

  part(material: string, layer = 0): MeshPart & { mw: number; mh: number } {
    const key = `${material}#${layer}`;
    let p = this.parts.get(key);
    if (!p) {
      const spec = textureSpec(material);
      p = { material, layer, positions: [], normals: [], uvs: [], indices: [], mw: spec.meters[0], mh: spec.meters[1] };
      this.parts.set(key, p);
    }
    return p;
  }

  /** Quad a-b-c-d, counter-clockwise seen from the front. uv in metres, or null for a planar guess. */
  quad(material: string, a: V3, b: V3, c: V3, d: V3, uv?: [number, number][] | null, layer = 0, normal?: V3 | V3[]): void {
    const p = this.part(material, layer);
    const n = normal ?? v3.norm(v3.cross(v3.sub(b, a), v3.sub(d, a)));
    const base = p.positions.length / 3;
    const pts = [a, b, c, d];
    let uvs = uv;
    if (!uvs) {
      const e1 = v3.norm(v3.sub(b, a));
      const fn = Array.isArray(n[0]) ? (n as V3[])[0] : (n as V3);
      const e2 = v3.cross(fn, e1);
      uvs = pts.map((q) => [v3.dot(v3.sub(q, a), e1), v3.dot(v3.sub(q, a), e2)] as [number, number]);
    }
    for (let i = 0; i < 4; i++) {
      p.positions.push(pts[i][0], pts[i][1], pts[i][2]);
      const ni = Array.isArray(n[0]) ? (n as V3[])[i] : (n as V3);
      p.normals.push(ni[0], ni[1], ni[2]);
      p.uvs.push(uvs[i][0] / p.mw, uvs[i][1] / p.mh);
    }
    p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(material: string, a: V3, b: V3, c: V3, uv: [number, number][], layer = 0): void {
    const p = this.part(material, layer);
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    const base = p.positions.length / 3;
    [a, b, c].forEach((q, i) => {
      p.positions.push(q[0], q[1], q[2]);
      p.normals.push(n[0], n[1], n[2]);
      p.uvs.push(uv[i][0] / p.mw, uv[i][1] / p.mh);
    });
    p.indices.push(base, base + 1, base + 2);
  }

  /** Triangle on a roughly horizontal surface, wound so that it faces up. UVs are planar (x, -z). */
  triUp(material: string, a: V3, b: V3, c: V3, layer = 0): void {
    const up = v3.cross(v3.sub(b, a), v3.sub(c, a))[1] >= 0;
    const [p, q] = up ? [b, c] : [c, b];
    this.tri(material, a, p, q, [[a[0], -a[2]], [p[0], -p[2]], [q[0], -q[2]]], layer);
  }

  /** Quad on a roughly horizontal surface, facing up, with planar UVs unless given. */
  quadUp(material: string, a: V3, b: V3, c: V3, d: V3, layer = 0, uv?: [number, number][]): void {
    const up = v3.cross(v3.sub(b, a), v3.sub(d, a))[1] >= 0;
    const pts = up ? [a, b, c, d] : [d, c, b, a];
    const uvs = uv ? (up ? uv : [uv[3], uv[2], uv[1], uv[0]]) : pts.map((q) => [q[0], -q[2]] as [number, number]);
    this.quad(material, pts[0], pts[1], pts[2], pts[3], uvs, layer, [0, 1, 0]);
  }

  /** Quad wound so that it faces towards `toward` (a direction). */
  quadFacing(material: string, a: V3, b: V3, c: V3, d: V3, toward: V3, uv: [number, number][], layer = 0): void {
    const front = v3.dot(v3.cross(v3.sub(b, a), v3.sub(d, a)), toward) >= 0;
    if (front) this.quad(material, a, b, c, d, uv, layer);
    else this.quad(material, b, a, d, c, [uv[1], uv[0], uv[3], uv[2]], layer);
  }

  /** Horizontal polygon at height y as a fan around `centre`; ring and centre are (x, z). */
  fan(material: string, centre: [number, number], ring: [number, number][], y: number, layer = 0, closed = true): void {
    const n = ring.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      this.triUp(material, [centre[0], y, centre[1]], [a[0], y, a[1]], [b[0], y, b[1]], layer);
    }
  }

  /** Box with the given centre, axes (unit vectors) and half sizes. */
  box(material: string, c: V3, half: V3, ax: V3 = [1, 0, 0], ay: V3 = [0, 1, 0], az: V3 = [0, 0, 1], skip = ''): void {
    const corner = (sx: number, sy: number, sz: number): V3 => v3.mad(v3.mad(v3.mad(c, ax, sx * half[0]), ay, sy * half[1]), az, sz * half[2]);
    const [w, h, d] = [half[0] * 2, half[1] * 2, half[2] * 2];
    const face = (name: string, a: V3, b: V3, cc: V3, dd: V3, fw: number, fh: number) => {
      if (!skip.includes(name)) this.quad(material, a, b, cc, dd, [[0, 0], [fw, 0], [fw, fh], [0, fh]]);
    };
    face('z', corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1), w, h);
    face('Z', corner(1, -1, -1), corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1), w, h);
    face('x', corner(1, -1, 1), corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), d, h);
    face('X', corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1), d, h);
    face('y', corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1), corner(-1, 1, -1), w, d);
    face('Y', corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1), w, d);
  }

  /** Rectangular member from a to b, w wide (sideways) and h deep (towards `up`). */
  beam(material: string, a: V3, b: V3, w: number, h: number, up: V3 = UP): void {
    const az = v3.norm(v3.sub(b, a));
    let ax = v3.cross(up, az);
    if (v3.len(ax) < 1e-4) ax = [1, 0, 0];
    ax = v3.norm(ax);
    const ay = v3.cross(az, ax);
    this.box(material, v3.lerp(a, b, 0.5), [w / 2, h / 2, v3.len(v3.sub(b, a)) / 2], ax, ay, az);
  }

  /** Round member from a to b; r1 lets it taper. */
  tube(material: string, a: V3, b: V3, r: number, sides = 8, r1 = r, caps = false): void {
    const az = v3.norm(v3.sub(b, a));
    let ax = v3.cross(Math.abs(az[1]) > 0.99 ? [1, 0, 0] : UP, az);
    ax = v3.norm(ax);
    const ay = v3.cross(az, ax);
    const L = v3.len(v3.sub(b, a));
    const dir = (i: number): V3 => {
      const t = (i / sides) * Math.PI * 2;
      return v3.add(v3.scale(ax, Math.cos(t)), v3.scale(ay, Math.sin(t)));
    };
    for (let i = 0; i < sides; i++) {
      const d0 = dir(i);
      const d1 = dir(i + 1);
      const u0 = (i / sides) * Math.PI * 2 * r;
      const u1 = ((i + 1) / sides) * Math.PI * 2 * r;
      this.quad(material, v3.mad(a, d0, r), v3.mad(a, d1, r), v3.mad(b, d1, r1), v3.mad(b, d0, r1), [[u0, 0], [u1, 0], [u1, L], [u0, L]], 0, [d0, d1, d1, d0]);
      if (caps) {
        this.tri(material, b, v3.mad(b, d0, r1), v3.mad(b, d1, r1), [[0, 0], [r1, 0], [r1, r1]]);
        this.tri(material, a, v3.mad(a, d1, r), v3.mad(a, d0, r), [[0, 0], [r, 0], [r, r]]);
      }
    }
  }

  build(): ModelData {
    const parts: MeshPart[] = [];
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    for (const p of this.parts.values()) {
      if (!p.indices.length) continue;
      parts.push({ material: p.material, layer: p.layer, positions: p.positions, normals: p.normals, uvs: p.uvs, indices: p.indices });
      triangles += p.indices.length / 3;
      for (let i = 0; i < p.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], p.positions[i + k]);
          max[k] = Math.max(max[k], p.positions[i + k]);
        }
      }
    }
    parts.sort((a, b) => a.layer - b.layer || (a.material < b.material ? -1 : 1));
    return { parts, min, max, triangles };
  }
}

/** A point on a road centre line with its local axes. */
export interface Frame {
  p: V3;
  /** Forward, right and up unit vectors. */
  t: V3;
  r: V3;
  u: V3;
  /** Distance along the path in metres. */
  s: number;
}
export type Path = Frame[];

/** Samples a centre line. `bank` tilts the road around its axis (radians, + = right side down). */
export function makePath(at: (q: number) => V3, n: number, bank?: (q: number) => number): Path {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) pts.push(at(i / n));
  const out: Path = [];
  let s = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) s += v3.len(v3.sub(pts[i], pts[i - 1]));
    const e = 1e-4;
    const q = i / n;
    const t = v3.norm(v3.sub(at(Math.min(1, q + e)), at(Math.max(0, q - e))));
    let r = v3.norm(v3.cross(t, UP));
    let u = v3.cross(r, t);
    const b = bank ? bank(q) : 0;
    if (b) {
      const c = Math.cos(b);
      const sn = Math.sin(b);
      const r2 = v3.sub(v3.scale(r, c), v3.scale(u, sn));
      u = v3.add(v3.scale(u, c), v3.scale(r, sn));
      r = r2;
    }
    out.push({ p: pts[i], t, r, u, s });
  }
  return out;
}

export const pathLength = (p: Path): number => p[p.length - 1].s;

/** Frame at distance s (clamped), interpolated. */
export function frameAt(path: Path, s: number): Frame {
  if (s <= 0) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (path[i].s >= s) {
      const a = path[i - 1];
      const b = path[i];
      const k = (s - a.s) / (b.s - a.s || 1);
      return { p: v3.lerp(a.p, b.p, k), t: v3.norm(v3.lerp(a.t, b.t, k)), r: v3.norm(v3.lerp(a.r, b.r, k)), u: v3.norm(v3.lerp(a.u, b.u, k)), s };
    }
  }
  return path[path.length - 1];
}

/** The part of a path between two distances, keeping the original samples in between. */
export function slicePath(path: Path, s0: number, s1: number): Path {
  const out: Path = [frameAt(path, s0)];
  for (const f of path) if (f.s > s0 + 1e-3 && f.s < s1 - 1e-3) out.push(f);
  out.push(frameAt(path, s1));
  return out;
}

/** Point at sideways offset x and height y relative to a frame. */
export const offset = (f: Frame, x: number, y: number): V3 => v3.mad(v3.mad(f.p, f.r, x), f.u, y);

export interface Strip {
  material: string;
  layer?: number;
  /** Cross-section polyline (x to the right, y up), listed left to right for upward-facing surfaces. */
  pts: [number, number][];
  /**
   * 'tile': u across in metres, v along the path. 'along': u along the path, v across (kerbs, walls).
   */
  uv: 'tile' | 'along';
  /** Cross coordinate in metres per point; defaults to the distance along the polyline. */
  c?: number[];
  /** Along-coordinate runs 0..texture height over this range instead of tiling (symbols). */
  fitTo?: [number, number];
  /** Turns the texture by 180 degrees (lanes running against the path). */
  flip?: boolean;
}

/** Extrudes cross-section strips along a path. */
export function sweep(b: MeshBuilder, path: Path, strips: Strip[]): void {
  for (const st of strips) {
    const part = b.part(st.material, st.layer ?? 0);
    const lift = (st.layer ?? 0) * 0.006;
    let acc = 0;
    for (let i = 0; i + 1 < st.pts.length; i++) {
      const [x0, y0] = st.pts[i];
      const [x1, y1] = st.pts[i + 1];
      const segLen = Math.hypot(x1 - x0, y1 - y0);
      const c0 = st.c ? st.c[i] : acc;
      const c1 = st.c ? st.c[i + 1] : acc + segLen;
      acc += segLen;
      if (segLen < 1e-6) continue;
      const nx = -(y1 - y0) / segLen;
      const ny = (x1 - x0) / segLen;
      for (let j = 0; j + 1 < path.length; j++) {
        const f0 = path[j];
        const f1 = path[j + 1];
        const along = (f: Frame): number => (st.fitTo ? ((f.s - st.fitTo[0]) / (st.fitTo[1] - st.fitTo[0])) * part.mh : f.s);
        const uv = (c: number, f: Frame): [number, number] => {
          if (st.uv === 'along') return [f.s, c];
          return st.flip ? [part.mw - c, st.fitTo ? part.mh - along(f) : -along(f)] : [c, along(f)];
        };
        const nrm = (f: Frame): V3 => v3.add(v3.scale(f.r, nx), v3.scale(f.u, ny));
        b.quad(
          st.material,
          offset(f0, x0, y0 + lift),
          offset(f0, x1, y1 + lift),
          offset(f1, x1, y1 + lift),
          offset(f1, x0, y0 + lift),
          [uv(c0, f0), uv(c1, f0), uv(c1, f1), uv(c0, f1)],
          st.layer ?? 0,
          [nrm(f0), nrm(f0), nrm(f1), nrm(f1)],
        );
      }
    }
  }
}

/** Flat end face of a swept solid: the area between an upper outline and a lower one (same x order). */
export function endCap(b: MeshBuilder, material: string, f: Frame, top: [number, number][], bottom: (x: number) => number, facingForward: boolean): void {
  for (let i = 0; i + 1 < top.length; i++) {
    const [x0, y0] = top[i];
    const [x1, y1] = top[i + 1];
    if (x1 - x0 < 1e-6) continue;
    const a = offset(f, x0, bottom(x0));
    const bb = offset(f, x1, bottom(x1));
    const c = offset(f, x1, y1);
    const d = offset(f, x0, y0);
    const uv: [number, number][] = [[x0, bottom(x0)], [x1, bottom(x1)], [x1, y1], [x0, y0]];
    if (facingForward) b.quad(material, bb, a, d, c, [uv[1], uv[0], uv[3], uv[2]]);
    else b.quad(material, a, bb, c, d, uv);
  }
}

// --- Centre line shapes. Roads start at the origin heading towards -z. ---

export const straight = (length: number, n = 1): Path => makePath((q) => [0, 0, -q * length], n);

/** Constant grade with rounded ends: rises `rise` metres over `length`. */
export function grade(length: number, rise: number, n = 24): Path {
  return makePath((q) => {
    const e = 0.18;
    // Integral of a trapezoid: slope ramps up, holds, ramps down.
    const k = 1 / (1 - e);
    const y = q < e ? (k * q * q) / (2 * e) : q > 1 - e ? 1 - (k * (1 - q) * (1 - q)) / (2 * e) : k * (q - e / 2);
    return [0, y * rise, -q * length];
  }, n);
}

/** Up and over (height > 0) or down and up. */
export const hump = (length: number, height: number, n = 28): Path => makePath((q) => [0, height * Math.sin(Math.PI * q) ** 2, -q * length], n);

/** Circular curve to the left (angle > 0) or right, optionally climbing and banked. */
export function arc(radius: number, angle: number, rise = 0, bank = 0, n = Math.max(8, Math.ceil(Math.abs(angle) / 0.08))): Path {
  const sg = Math.sign(angle) || 1;
  return makePath(
    (q) => {
      const a = Math.abs(angle) * q;
      return [-sg * radius * (1 - Math.cos(a)), rise * q, -radius * Math.sin(a)];
    },
    n,
    bank ? () => -sg * bank : undefined,
  );
}

/** Sideways shift of `shift` metres over `length` (lane change shape). */
export const sCurve = (length: number, shift: number, rise = 0, n = 28): Path => makePath((q) => [shift * (q * q * (3 - 2 * q)), rise * q, -q * length], n);

/** Climbing spiral. */
export const helix = (radius: number, turns: number, rise: number, bank = 0.04, n = Math.ceil(turns * 48)): Path =>
  makePath(
    (q) => {
      const a = turns * Math.PI * 2 * q;
      return [-radius * (1 - Math.cos(a)), rise * q, -radius * Math.sin(a)];
    },
    n,
    () => -bank,
  );

/** Path through arbitrary points (Catmull-Rom). */
export function through(pts: V3[], n = pts.length * 10): Path {
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  return makePath((q) => {
    const x = q * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(x));
    const t = x - i;
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const out: V3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
    return out;
  }, n);
}

/** Moves and turns a path: rotate by `yaw` around the vertical axis, then translate. */
export function placePath(path: Path, origin: V3, yaw: number): Path {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const rot = (v: V3): V3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  return path.map((f) => ({ p: v3.add(rot(f.p), origin), t: rot(f.t), r: rot(f.r), u: rot(f.u), s: f.s }));
}
