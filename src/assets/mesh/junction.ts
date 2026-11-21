import { MeshBuilder, Path, V3, placePath, straight } from './builder';
import { Layout, Section, Side, crossBand, layout, stamp, sweepSection } from './section';

type P2 = [number, number];
const add = (a: P2, b: P2, s = 1): P2 => [a[0] + b[0] * s, a[1] + b[1] * s];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export type Control = 'signal' | 'stop' | 'yield' | 'none';

export interface Arm {
  /** Heading in degrees, counter-clockwise seen from above; 0 points towards -z. */
  angle: number;
  section: Section;
  control?: Control;
  /** Crosswalk decal id without the wear suffix, or null. */
  crosswalk?: string | null;
  /** Length of the approach built with the junction. */
  length?: number;
  arrows?: boolean;
}

interface ArmGeo {
  arm: Arm;
  d: P2;
  r: P2;
  lay: Layout;
  hl: number;
  hr: number;
  /** Width and height of the pavement band on each side. */
  wl: number;
  wr: number;
  yl: number;
  yr: number;
  L: number;
  yaw: number;
}

function geo(arm: Arm): ArmGeo {
  const yaw = (arm.angle * Math.PI) / 180;
  const d: P2 = [-Math.sin(yaw), -Math.cos(yaw)];
  const lay = layout(arm.section);
  return { arm, d, r: [-d[1], d[0]], lay, hl: -lay.road[0], hr: lay.road[1], wl: lay.road[0] - lay.outer[0], wr: lay.outer[1] - lay.road[1], yl: lay.outerY[0], yr: lay.outerY[1], L: 3, yaw };
}
const leftEdge = (g: ArmGeo, t: number, extra = 0): P2 => add(add([0, 0], g.r, -(g.hl + extra)), g.d, t);
const rightEdge = (g: ArmGeo, t: number, extra = 0): P2 => add(add([0, 0], g.r, g.hr + extra), g.d, t);

/** Where the left edge of arm a (pushed out by ea) meets the right edge of arm b (pushed out by eb). */
function meet(a: ArmGeo, b: ArmGeo, ea = 0, eb = 0): { t: number; u: number } | null {
  const det = a.d[0] * -b.d[1] + b.d[0] * a.d[1];
  if (Math.abs(det) < 0.03) return null;
  const p = leftEdge(a, 0, ea);
  const q = rightEdge(b, 0, eb);
  const rx = q[0] - p[0];
  const ry = q[1] - p[1];
  return { t: (rx * -b.d[1] + b.d[0] * ry) / det, u: (a.d[0] * ry - a.d[1] * rx) / det };
}

/** Offsets a polyline to its right-hand side... by widths that may vary; mitred, with a limit. */
function offsetLine(pts: P2[], w: (k: number) => number, side: 1 | -1): P2[] {
  return pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const n0 = norm([p[0] - a[0], p[1] - a[1]]);
    const n1 = norm([b[0] - p[0], b[1] - p[1]]);
    const t = norm([n0[0] + n1[0], n0[1] + n1[1]]);
    const c = Math.max(0.5, Math.abs(n0[0] * n1[0] + n0[1] * n1[1]) < 1e-9 && k > 0 && k < pts.length - 1 ? 0.707 : Math.sqrt((1 + n0[0] * n1[0] + n0[1] * n1[1]) / 2) || 1);
    return [p[0] - side * t[1] * (w(k) / c), p[1] + side * t[0] * (w(k) / c)] as P2;
  });
}
function norm(v: P2): P2 {
  const l = Math.hypot(v[0], v[1]);
  return l < 1e-9 ? [0, 0] : [v[0] / l, v[1] / l];
}

const sideTex = (s: Side): string => s.walk?.tex ?? s.verge?.tex ?? s.ground?.tex ?? 'concrete/walk-plain';

/** Kerb and pavement band between a kerb line and the line behind it. */
function band(b: MeshBuilder, curb: P2[], back: P2[], y: number, curbTex: string | undefined, tex: string, roadSide: (k: number) => P2): void {
  const inset = curb.map((c, k) => {
    const dir = norm([back[k][0] - c[0], back[k][1] - c[1]]);
    return add(c, dir, Math.min(0.15, dist(c, back[k])));
  });
  let s = 0;
  for (let k = 0; k + 1 < curb.length; k++) {
    const len = dist(curb[k], curb[k + 1]);
    if (len < 1e-4) continue;
    const P = (p: P2, h: number): V3 => [p[0], h, p[1]];
    if (curbTex && y > 0) {
      const toward = roadSide(k);
      b.quadFacing(curbTex, P(curb[k], 0), P(curb[k + 1], 0), P(curb[k + 1], y), P(curb[k], y), [toward[0], 0, toward[1]], [[s, 0], [s + len, 0], [s + len, 0.25], [s, 0.25]]);
      b.quadUp(curbTex, P(curb[k], y), P(curb[k + 1], y), P(inset[k + 1], y), P(inset[k], y), 0, [[s, 0.25], [s + len, 0.25], [s + len, 0.5], [s, 0.5]]);
      b.quadUp(tex, P(inset[k], y), P(inset[k + 1], y), P(back[k + 1], y), P(back[k], y));
    } else b.quadUp(tex, P(curb[k], y), P(curb[k + 1], y), P(back[k + 1], y), P(back[k], y));
    // Earth below the outer edge.
    b.quadFacing('ground/dirt', P(back[k], -0.4), P(back[k + 1], -0.4), P(back[k + 1], y), P(back[k], y), [-roadSide(k)[0], 0, -roadSide(k)[1]], [[s, 0], [s + len, 0], [s + len, y + 0.4], [s, y + 0.4]]);
    s += len;
  }
}

/** Approach road of one arm with its crosswalk, stop line and arrows. */
function approach(b: MeshBuilder, g: ArmGeo, paint: string): Path {
  const len = g.arm.length ?? 14;
  const path = placePath(straight(len, 1), [g.d[0] * g.L, 0, g.d[1] * g.L], g.yaw);
  const sec = g.arm.section;
  const lanes = g.lay.lanes;
  const x0 = lanes[0].x0;
  const x1 = lanes[lanes.length - 1].x1;
  const inbound = lanes.filter((l) => l.lane.dir === -1 && l.lane.kind !== 'parking');
  const control = g.arm.control ?? 'none';
  let s = 0.4;
  if (g.arm.crosswalk) {
    const id = `${g.arm.crosswalk}-${paint}`;
    const depth = b.part(id, 2).mh;
    crossBand(b, path, id, s, s + depth, x0 + 0.1, x1 - 0.1);
    s += depth + 0.9;
  }
  if (inbound.length && control !== 'none') {
    const ix0 = inbound[0].x0;
    const ix1 = inbound[inbound.length - 1].x1;
    const id = control === 'yield' ? `crosswalk/yield-teeth-${paint}` : `crosswalk/stop-line-${paint}`;
    const depth = b.part(id, 2).mh;
    crossBand(b, path, id, s, s + depth, ix0 + 0.1, ix1 - 0.05);
    s += depth + 0.5;
    const drive = inbound.filter((l) => l.lane.kind === 'drive' || l.lane.kind === 'bus');
    const sym = paint === 'faded' ? 'worn' : paint;
    if (control === 'stop' && drive.length) stamp(b, path, `symbol/text-stop-${sym}`, s + 1, (drive[0].x0 + drive[drive.length - 1].x1) / 2, { flip: true, width: Math.min(2.4, drive[0].x1 - drive[0].x0 - 0.4) });
    else if (g.arm.arrows && drive.length > 1) {
      drive.forEach((l, i) => {
        // Seen by the driver, the lane next to the centre line is the leftmost.
        const kind = i === drive.length - 1 ? 'arrow-left' : i === 0 ? 'arrow-straight-right' : 'arrow-straight';
        stamp(b, path, `symbol/${kind}-${sym}`, s + 2, (l.x0 + l.x1) / 2, { flip: true });
      });
    }
  }
  sweepSection(b, path, sec, { caps: [false, true], linesFrom: Math.min(len - 1, s), noSymbols: true });
  return path;
}

/** A decal lying flat at (x, z), turned by yaw. */
export function flatDecal(b: MeshBuilder, material: string, x: number, z: number, yaw = 0, layer = 3): void {
  const p = b.part(material, layer);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const y = layer * 0.006;
  const at = (dx: number, dz: number): V3 => [x + dx * c + dz * s, y, z - dx * s + dz * c];
  const hw = p.mw / 2;
  const hh = p.mh / 2;
  b.quad(material, at(-hw, hh), at(hw, hh), at(hw, -hh), at(-hw, -hh), [[0, 0], [p.mw, 0], [p.mw, p.mh], [0, p.mh]], layer, [0, 1, 0]);
}

export interface JunctionOpts {
  arms: Arm[];
  /** Kerb radius at the corners. */
  radius?: number;
  /** Junction floor texture. */
  floor: string;
  paint?: Section['paint'];
  /** Decals scattered in the middle (manholes, stains): [id, x, z, yaw]. */
  decals?: [string, number, number, number][];
  /** Yellow box marking over the whole junction. */
  box?: boolean;
}

/** At-grade junction of any number of arms: floor, rounded kerb corners, pavements and approaches. */
export function junction(b: MeshBuilder, o: JunctionOpts): void {
  const arms = [...o.arms].sort((a, c) => a.angle - c.angle).map(geo);
  const n = arms.length;
  const R = o.radius ?? 4;
  const paint = o.paint ?? arms[0].arm.section.paint;
  interface Corner { c: { t: number; u: number } | null; r: number; T: number; theta: number }
  const corners: Corner[] = [];
  for (let i = 0; i < n; i++) {
    const a = arms[i];
    const c = arms[(i + 1) % n];
    let theta = c.yaw - a.yaw;
    if (theta <= 0) theta += Math.PI * 2;
    const m = n > 1 && theta < Math.PI - 0.06 ? meet(a, c) : null;
    if (m) {
      const r = Math.min(R, 10 * Math.tan(theta / 2));
      const T = r / Math.tan(theta / 2);
      corners.push({ c: m, r, T, theta });
      a.L = Math.max(a.L, m.t + T + 0.3);
      c.L = Math.max(c.L, m.u + T + 0.3);
    } else corners.push({ c: null, r: 0, T: 0, theta });
  }
  const ring: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = arms[i];
    const c = arms[(i + 1) % n];
    const k = corners[i];
    const curb: P2[] = [leftEdge(a, a.L)];
    let back: P2[];
    const wAt = (q: number) => a.wl + (c.wr - a.wl) * q;
    if (k.c) {
      const C = leftEdge(a, k.c.t);
      const bis = norm([a.d[0] + c.d[0], a.d[1] + c.d[1]]);
      const centre = add(C, bis, k.r / Math.sin(k.theta / 2));
      const p0 = leftEdge(a, k.c.t + k.T);
      const p1 = rightEdge(c, k.c.u + k.T);
      let a0 = Math.atan2(p0[1] - centre[1], p0[0] - centre[0]);
      let a1 = Math.atan2(p1[1] - centre[1], p1[0] - centre[0]);
      if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
      if (a0 - a1 > Math.PI) a1 += Math.PI * 2;
      const steps = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 0.2));
      const arcStart = curb.length;
      for (let s = 0; s <= steps; s++) {
        const q = a0 + ((a1 - a0) * s) / steps;
        curb.push([centre[0] + Math.cos(q) * k.r, centre[1] + Math.sin(q) * k.r]);
      }
      curb.push(rightEdge(c, c.L));
      const bc = meet(a, c, a.wl, c.wr) ?? k.c;
      const corner = leftEdge(a, bc.t, a.wl);
      back = curb.map((_, idx) => (idx < arcStart ? leftEdge(a, Math.max(a.L, bc.t), a.wl) : idx === curb.length - 1 ? rightEdge(c, Math.max(c.L, bc.u), c.wr) : corner));
      // The first and last points line up with the approach's outer edge.
      back[0] = leftEdge(a, a.L, a.wl);
      back[back.length - 1] = rightEdge(c, c.L, c.wr);
    } else {
      const p0 = leftEdge(a, a.L);
      const p1 = rightEdge(c, c.L);
      const h = dist(p0, p1) * 0.4;
      const straightOn = Math.abs(k.theta - Math.PI) < 0.07;
      const steps = straightOn ? 1 : 12;
      for (let s = 1; s <= steps; s++) {
        const q = s / steps;
        const m0 = 1 - q;
        const c1 = add(p0, a.d, -h);
        const c2 = add(p1, c.d, -h);
        curb.push([m0 ** 3 * p0[0] + 3 * m0 * m0 * q * c1[0] + 3 * m0 * q * q * c2[0] + q ** 3 * p1[0], m0 ** 3 * p0[1] + 3 * m0 * m0 * q * c1[1] + 3 * m0 * q * q * c2[1] + q ** 3 * p1[1]]);
      }
      back = offsetLine(curb, (idx) => wAt(idx / (curb.length - 1)), -1);
      back[0] = leftEdge(a, a.L, a.wl);
      back[back.length - 1] = rightEdge(c, c.L, c.wr);
    }
    const y = Math.max(a.yl, c.yr);
    const side = a.arm.section.left;
    if (a.wl > 0.01 || c.wr > 0.01) {
      band(b, curb, back, y, side.curb ?? c.arm.section.right.curb, sideTex(side.walk || side.ground ? side : c.arm.section.right), (idx) => {
        const mid: P2 = [(curb[idx][0] + curb[idx + 1][0]) / 2, (curb[idx][1] + curb[idx + 1][1]) / 2];
        return norm([mid[0] - (back[idx][0] + back[idx + 1][0]) / 2, mid[1] - (back[idx][1] + back[idx + 1][1]) / 2]);
      });
    }
    ring.push(rightEdge(a, a.L), ...curb);
  }
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  b.fan(o.floor, [cx, cz], ring, 0);
  b.fan('ground/dirt', [cx, cz], [...ring].reverse(), -0.4);
  if (o.box) {
    const id = `crosswalk/box-junction-${paint}`;
    const inner = ring.map((p) => [cx + (p[0] - cx) * 0.8, cz + (p[1] - cz) * 0.8] as P2);
    for (let i = 0; i < inner.length; i++) {
      const p = inner[i];
      const q = inner[(i + 1) % inner.length];
      b.triUp(id, [cx, 0.012, cz], [p[0], 0.012, p[1]], [q[0], 0.012, q[1]], 2);
    }
  }
  for (const [id, x, z, yaw] of o.decals ?? []) flatDecal(b, id, cx + x, cz + z, yaw);
  for (const g of arms) approach(b, g, paint);
}

export interface RoundaboutOpts {
  arms: Arm[];
  /** Outer radius of the circulating road. */
  radius: number;
  /** Width of the circulating road; 0 or radius = no island (turning circle). */
  ring: number;
  island?: string;
  /** Width of the paved truck apron around the island. */
  apron?: number;
  apronTex?: string;
  floor: string;
  /** Radius of the kerb where an arm meets the circle. */
  entryRadius?: number;
  paint?: Section['paint'];
  walk?: { w: number; tex: string; curb: string };
}

/** Roundabout, mini roundabout or cul-de-sac bulb. */
export function roundabout(b: MeshBuilder, o: RoundaboutOpts): void {
  const arms = [...o.arms].sort((a, c) => a.angle - c.angle).map(geo);
  const n = arms.length;
  const R = o.radius;
  const paint = o.paint ?? arms[0].arm.section.paint;
  const on = (phi: number, r = R): P2 => [-Math.sin(phi) * r, -Math.cos(phi) * r];
  const rin = R - o.ring;
  const seg = 48;
  const joins: { a: ArmGeo; c: ArmGeo; curb: P2[]; back: P2[] }[] = [];
  // Circulating road.
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const [p0, p1] = [on(a0, Math.max(0, rin)), on(a1, Math.max(0, rin))];
    const [q0, q1] = [on(a0), on(a1)];
    if (rin > 0.01) b.quadUp(o.floor, [p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [q1[0], 0, q1[1]], [q0[0], 0, q0[1]]);
    else b.triUp(o.floor, [0, 0, 0], [q0[0], 0, q0[1]], [q1[0], 0, q1[1]]);
    if (rin > 0.5) {
      const ap = o.apron ?? 0;
      const rc = rin - ap;
      if (ap > 0) {
        const [s0, s1] = [on(a0, rc), on(a1, rc)];
        b.quadUp(o.apronTex ?? 'paving/setts-granite', [s0[0], 0.06, s0[1]], [s1[0], 0.06, s1[1]], [p1[0], 0.02, p1[1]], [p0[0], 0.02, p0[1]]);
        b.quadFacing('curb/plain', [p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [p1[0], 0.02, p1[1]], [p0[0], 0.02, p0[1]], [p0[0], 0, p0[1]], [[a0 * rin, 0], [a1 * rin, 0], [a1 * rin, 0.05], [a0 * rin, 0.05]]);
      }
      const base = ap > 0 ? 0.06 : 0;
      const [c0, c1] = [on(a0, rc), on(a1, rc)];
      const [i0, i1] = [on(a0, rc - 0.15), on(a1, rc - 0.15)];
      b.quadFacing('curb/plain', [c0[0], base, c0[1]], [c1[0], base, c1[1]], [c1[0], base + 0.15, c1[1]], [c0[0], base + 0.15, c0[1]], [c0[0], 0, c0[1]], [[a0 * rc, 0], [a1 * rc, 0], [a1 * rc, 0.25], [a0 * rc, 0.25]]);
      b.quadUp('curb/plain', [c0[0], base + 0.15, c0[1]], [c1[0], base + 0.15, c1[1]], [i1[0], base + 0.15, i1[1]], [i0[0], base + 0.15, i0[1]], 0, [[a0 * rc, 0.25], [a1 * rc, 0.25], [a1 * rc, 0.5], [a0 * rc, 0.5]]);
      // Slightly mounded island.
      b.triUp(o.island ?? 'ground/grass-lush', [0, base + 0.15 + Math.min(0.6, rc * 0.08), 0], [i0[0], base + 0.15, i0[1]], [i1[0], base + 0.15, i1[1]]);
    }
  }
  // Each arm edge joins the circle through a fillet: tangent to the edge line and to the circle.
  const rf = o.entryRadius ?? Math.min(4, R * 0.35);
  interface Fillet { pts: P2[]; t: number; phi: number }
  const fillet = (g: ArmGeo, left: boolean): Fillet => {
    const h = left ? g.hl : g.hr;
    const sgn = left ? -1 : 1;
    const t = Math.sqrt(Math.max(0.01, (R + rf) ** 2 - (h + rf) ** 2));
    const centre = add(add([0, 0], g.d, t), g.r, sgn * (h + rf));
    const onLine = add(add([0, 0], g.d, t), g.r, sgn * h);
    const cl = Math.hypot(centre[0], centre[1]);
    const onCircle: P2 = [(centre[0] / cl) * R, (centre[1] / cl) * R];
    let a0 = Math.atan2(onLine[1] - centre[1], onLine[0] - centre[0]);
    let a1 = Math.atan2(onCircle[1] - centre[1], onCircle[0] - centre[0]);
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    if (a0 - a1 > Math.PI) a1 += Math.PI * 2;
    const pts: P2[] = [];
    for (let k = 0; k <= 6; k++) {
      const q = a0 + ((a1 - a0) * k) / 6;
      pts.push([centre[0] + Math.cos(q) * rf, centre[1] + Math.sin(q) * rf]);
    }
    // Heading angle (same convention as arm angles) of the point where the fillet meets the circle.
    return { pts, t, phi: Math.atan2(-onCircle[0], -onCircle[1]) };
  };
  const fl = arms.map((g) => fillet(g, true));
  const fr = arms.map((g) => fillet(g, false));
  arms.forEach((g, i) => (g.L = Math.max(fl[i].t, fr[i].t) + 0.5));
  for (let i = 0; i < n; i++) {
    const a = arms[i];
    const c = arms[(i + 1) % n];
    // Floor of the mouth: between the approach, both fillets and the circle.
    let m0 = fl[i].phi;
    let m1 = fr[i].phi;
    while (m0 < m1) m0 += Math.PI * 2;
    while (m0 - m1 > Math.PI * 2) m0 -= Math.PI * 2;
    const mouth: P2[] = [rightEdge(a, a.L), leftEdge(a, a.L), ...fl[i].pts];
    for (let k = 1; k < 8; k++) mouth.push(on(m0 + ((m1 - m0) * k) / 8));
    mouth.push(...[...fr[i].pts].reverse());
    b.fan(o.floor, add([0, 0], a.d, R + 0.4 * (a.L - R)), mouth, 0);
    b.fan('ground/dirt', add([0, 0], a.d, R + 0.4 * (a.L - R)), [...mouth].reverse(), -0.4);
    // Outer kerb and pavement from this arm round to the next.
    const w = o.walk?.w ?? Math.max(a.wl, c.wr);
    const e0 = fl[i].phi;
    let e1 = fr[(i + 1) % n].phi;
    while (e1 <= e0) e1 += Math.PI * 2;
    while (e1 - e0 > Math.PI * 2) e1 -= Math.PI * 2;
    // The back of the pavement follows a larger circle and meets the arms' outer edges at a corner.
    const Rb = R + w;
    const ta = Math.sqrt(Math.max(0.01, Rb * Rb - (a.hl + a.wl) ** 2));
    const tc = Math.sqrt(Math.max(0.01, Rb * Rb - (c.hr + c.wr) ** 2));
    a.L = Math.max(a.L, ta + 0.3);
    c.L = Math.max(c.L, tc + 0.3);
    const cornerA = leftEdge(a, ta, a.wl);
    const cornerC = rightEdge(c, tc, c.wr);
    const b0 = Math.atan2(-cornerA[0], -cornerA[1]);
    let b1 = Math.atan2(-cornerC[0], -cornerC[1]);
    while (b1 <= b0) b1 += Math.PI * 2;
    while (b1 - b0 > Math.PI * 2) b1 -= Math.PI * 2;
    const curb: P2[] = [];
    const back: P2[] = [];
    for (const p of fl[i].pts) {
      curb.push(p);
      back.push(cornerA);
    }
    const steps = Math.max(4, Math.ceil((e1 - e0) / 0.12));
    for (let k = 1; k < steps; k++) {
      curb.push(on(e0 + ((e1 - e0) * k) / steps));
      back.push(on(b0 + ((b1 - b0) * k) / steps, Rb));
    }
    for (const p of [...fr[(i + 1) % n].pts].reverse()) {
      curb.push(p);
      back.push(cornerC);
    }
    joins.push({ a, c, curb, back });
  }
  for (const j of joins) {
    const { a, c } = j;
    const curb = [leftEdge(a, a.L), ...j.curb, rightEdge(c, c.L)];
    const back = [leftEdge(a, a.L, a.wl), ...j.back, rightEdge(c, c.L, c.wr)];
    const side = a.arm.section.left;
    band(b, curb, back, Math.max(a.yl, c.yr), o.walk?.curb ?? side.curb, o.walk?.tex ?? sideTex(side), (k) => {
      const mid: P2 = [(curb[k][0] + curb[k + 1][0]) / 2, (curb[k][1] + curb[k + 1][1]) / 2];
      return norm([mid[0] - (back[k][0] + back[k + 1][0]) / 2, mid[1] - (back[k][1] + back[k + 1][1]) / 2]);
    });
  }
  for (const g of arms) approach(b, g, paint);
}
