import { VEHICLE_PARTS, VehiclePart } from '../tex';
import { MeshBuilder, V3 } from './builder';

const PAINT = 'vehicle/paint';
const GLASS = 'vehicle/glass';
const PARTS = 'vehicle/parts';
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * A car stands on the ground at the origin with its nose towards +x. Its body is one paint, near white,
 * that is tinted where the car is put; lamps, wheels, grille and plates come from one sheet of parts.
 */
export interface CarSpec {
  len: number;
  wid: number;
  hgt: number;
  clear?: number;
  wheelR: number;
  wheelW?: number;
  /** Rear and front axle, from the middle of the car. */
  axles: [number, number];
  /** Height of the top of the body at the tail, under the rear window, under the windscreen and at the nose. */
  tail: number;
  deck: number;
  cowl: number;
  nose: number;
  /** The cabin: foot of the rear window, back and front of the roof, foot of the windscreen. */
  cabin: [number, number, number, number];
  /** How far the roof is narrower than the body on each side. */
  tumble?: number;
  /** Pillars between the side windows. */
  pillars?: number[];
  /** Side windows behind this are sheet metal, and so is the back. */
  blind?: number;
  /** Door joints. */
  doors?: number[];
  wheel: 'alloy' | 'steel' | 'cap' | 'truck';
  head: VehiclePart;
  rear: VehiclePart;
  grille?: VehiclePart;
  plate?: 'plate-white' | 'plate-yellow';
  paint?: string;
  /** Bumpers of black plastic rather than the body's colour. */
  plastic?: boolean;
  /** A dark open bed behind the cabin, to this far from the tail. */
  bed?: boolean;
  /** Rails on the roof. */
  rails?: boolean;
  extra?: (b: MeshBuilder, s: CarSpec) => void;
}

const region = (part: VehiclePart, inset = 0.006): [number, number][] => {
  const [x0, y0, x1, y1] = VEHICLE_PARTS[part];
  return [[x0 + inset, y0 + inset], [x1 - inset, y0 + inset], [x1 - inset, y1 - inset], [x0 + inset, y1 - inset]];
};
const DIRS: Record<string, V3> = { front: [1, 0, 0], back: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0], left: [0, 0, -1], right: [0, 0, 1] };
type Dir = keyof typeof DIRS;
/** Quad in one paint with its texture laid flat across the way it faces. */
function skin(b: MeshBuilder, mat: string, p: [V3, V3, V3, V3], dir: Dir | V3): void {
  const d = typeof dir === 'string' ? DIRS[dir] : dir;
  const ax = Math.abs(d[1]) >= Math.abs(d[0]) && Math.abs(d[1]) >= Math.abs(d[2]) ? [0, 2] : Math.abs(d[2]) >= Math.abs(d[0]) ? [0, 1] : [2, 1];
  b.quadFacing(mat, p[0], p[1], p[2], p[3], d, p.map((q) => [q[ax[0]], q[ax[1]]] as [number, number]));
}
/** Quad showing one of the parts: bottom left, bottom right, top right, top left as it is looked at. */
function part(b: MeshBuilder, name: VehiclePart, p: [V3, V3, V3, V3], dir: Dir | V3): void {
  b.quadFacing(PARTS, p[0], p[1], p[2], p[3], typeof dir === 'string' ? DIRS[dir] : dir, region(name));
}
/** Upright rectangle of a part on the front (+1) or back (-1) of the car, centred at (x, y, z). */
function endPart(b: MeshBuilder, name: VehiclePart, end: number, x: number, y: number, z: number, w: number, h: number, flip = false): void {
  // Seen from outside the car, left to right runs towards -z at the front and +z at the back.
  const s = (flip ? -1 : 1) * end;
  part(b, name, [[x, y - h / 2, z + (s * w) / 2], [x, y - h / 2, z - (s * w) / 2], [x, y + h / 2, z - (s * w) / 2], [x, y + h / 2, z + (s * w) / 2]], end > 0 ? 'front' : 'back');
}
/** Upright rectangle of a part on the right (+1) or left (-1) side. */
function sidePart(b: MeshBuilder, name: VehiclePart, side: number, x: number, y: number, z: number, w: number, h: number): void {
  part(b, name, [[x - (side * w) / 2, y - h / 2, z], [x + (side * w) / 2, y - h / 2, z], [x + (side * w) / 2, y + h / 2, z], [x - (side * w) / 2, y + h / 2, z]], side > 0 ? 'right' : 'left');
}
/** Box in a plain part of the sheet. */
export function block(b: MeshBuilder, name: VehiclePart, c: V3, half: V3, skip = ''): void {
  const P = (sx: number, sy: number, sz: number): V3 => [c[0] + sx * half[0], c[1] + sy * half[1], c[2] + sz * half[2]];
  if (!skip.includes('f')) part(b, name, [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)], 'front');
  if (!skip.includes('b')) part(b, name, [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)], 'back');
  if (!skip.includes('r')) part(b, name, [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], 'right');
  if (!skip.includes('l')) part(b, name, [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)], 'left');
  if (!skip.includes('u')) part(b, name, [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], 'up');
  if (!skip.includes('d')) part(b, name, [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], 'down');
}
/** Box in a tiling paint. */
export function shell(b: MeshBuilder, mat: string, c: V3, half: V3, skip = ''): void {
  const P = (sx: number, sy: number, sz: number): V3 => [c[0] + sx * half[0], c[1] + sy * half[1], c[2] + sz * half[2]];
  if (!skip.includes('f')) skin(b, mat, [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)], 'front');
  if (!skip.includes('b')) skin(b, mat, [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)], 'back');
  if (!skip.includes('r')) skin(b, mat, [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], 'right');
  if (!skip.includes('l')) skin(b, mat, [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)], 'left');
  if (!skip.includes('u')) skin(b, mat, [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], 'up');
}

function wheel(b: MeshBuilder, kind: CarSpec['wheel'], x: number, r: number, zIn: number, zOut: number): void {
  const side = Math.sign(zOut);
  const N = 12;
  const [u0, v0, u1, v1] = VEHICLE_PARTS[`wheel-${kind}`];
  const [uc, vc, ur] = [(u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) / 2 - 0.004];
  const tread = region('rubber');
  for (let i = 0; i < N; i++) {
    const [a0, a1] = [(i / N) * Math.PI * 2, ((i + 1) / N) * Math.PI * 2];
    const P = (a: number, z: number, k = 1): V3 => [x + Math.cos(a) * r * k, r + Math.sin(a) * r * k, z];
    const out: V3 = [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0];
    b.quadFacing(PARTS, P(a0, zIn), P(a0, zOut), P(a1, zOut), P(a1, zIn), out, tread);
    // The face, turned so that it reads the same on both sides of the car.
    const uv = (a: number): [number, number] => [uc + Math.cos(a) * ur * side, vc + Math.sin(a) * ur];
    const tri: [V3, V3, V3] = side > 0 ? [[x, r, zOut], P(a0, zOut), P(a1, zOut)] : [[x, r, zOut], P(a1, zOut), P(a0, zOut)];
    b.tri(PARTS, tri[0], tri[1], tri[2], side > 0 ? [[uc, vc], uv(a0), uv(a1)] : [[uc, vc], uv(a1), uv(a0)]);
  }
}

/** Builds a car from its measures. */
export function car(b: MeshBuilder, s: CarSpec): void {
  const paint = s.paint ?? PAINT;
  const [L, hw, H] = [s.len / 2, s.wid / 2, s.hgt];
  const clear = s.clear ?? 0.17;
  const [c0, c1, c2, c3] = s.cabin;
  // --- The body below the windows, lofted along the car. ---
  const tops: [number, number][] = [[-L, s.tail - 0.05], [-L + 0.14, s.tail], [c0, s.deck], [c3, s.cowl], [L - 0.22, s.nose], [L, s.nose - 0.07]];
  const top = (x: number): number => {
    for (let i = 1; i < tops.length; i++) if (x <= tops[i][0] + 1e-9) return lerp(tops[i - 1][1], tops[i][1], (x - tops[i - 1][0]) / Math.max(1e-6, tops[i][0] - tops[i - 1][0]));
    return tops[tops.length - 1][1];
  };
  const xs = [...new Set([-L, -L + 0.14, -L + 0.4, c0, c3, L - 0.45, L - 0.22, L].map((x) => Math.round(Math.max(-L, Math.min(L, x)) * 1000) / 1000))].sort((a, c) => a - c);
  const width = (x: number): number => hw - 0.11 * Math.max(0, 1 - (L - Math.abs(x)) / 0.4) ** 2;
  const low = (x: number): number => clear + 0.1 * Math.max(0, 1 - (L - Math.abs(x)) / 0.4);
  /** Outline of half a cross-section, bottom to top: (y, z). */
  const ring = (x: number): [number, number][] => {
    const [yb, yt, w] = [low(x), top(x), width(x)];
    return [[yb, w - 0.06], [yb + 0.12, w], [yt - 0.09, w], [yt, w - 0.05]];
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    const [xa, xb] = [xs[i], xs[i + 1]];
    const [ra, rb] = [ring(xa), ring(xb)];
    for (const sd of [1, -1]) {
      for (let k = 0; k + 1 < ra.length; k++)
        skin(b, paint, [[xa, ra[k][0], sd * ra[k][1]], [xb, rb[k][0], sd * rb[k][1]], [xb, rb[k + 1][0], sd * rb[k + 1][1]], [xa, ra[k + 1][0], sd * ra[k + 1][1]]], sd > 0 ? 'right' : 'left');
    }
    const [ta, tb] = [ra[3], rb[3]];
    // Under the cabin there is nothing to see of the top.
    if (xb <= c0 + 1e-6 || xa >= c3 - 1e-6) skin(b, paint, [[xa, ta[0], ta[1]], [xb, tb[0], tb[1]], [xb, tb[0], -tb[1]], [xa, ta[0], -ta[1]]], 'up');
  }
  for (const end of [1, -1]) {
    const r = ring(end * L);
    for (let k = 0; k + 1 < r.length; k++) skin(b, paint, [[end * L, r[k][0], r[k][1]], [end * L, r[k][0], -r[k][1]], [end * L, r[k + 1][0], -r[k + 1][1]], [end * L, r[k + 1][0], r[k + 1][1]]], end > 0 ? 'front' : 'back');
  }
  // Its shadow on the road.
  b.quad('vehicle/shadow', [-L - 0.22, 0.012, hw + 0.22], [L + 0.22, 0.012, hw + 0.22], [L + 0.22, 0.012, -hw - 0.22], [-L - 0.22, 0.012, -hw - 0.22], [[0, 0], [1, 0], [1, 1], [0, 1]], 1, [0, 1, 0]);
  // The dark underneath.
  part(b, 'dark', [[-L + 0.1, clear + 0.02, -hw + 0.08], [L - 0.1, clear + 0.02, -hw + 0.08], [L - 0.1, clear + 0.02, hw - 0.08], [-L + 0.1, clear + 0.02, hw - 0.08]], 'down');

  // --- The cabin. ---
  const [y0, y3] = [top(c0), top(c3)];
  const hb = hw - 0.05;
  const hr = hw - (s.tumble ?? 0.14);
  if (c3 - c0 > 0.3) {
    const base = (x: number): number => lerp(y0, y3, (x - c0) / (c3 - c0));
    const rearX = (t: number): number => lerp(c0, c1, t);
    const frontX = (t: number): number => lerp(c3, c2, t);
    const S = (x: number, t: number, sd: number, proud = 0): V3 => [x, lerp(base(x), H, t), sd * (lerp(hb, hr, t) + proud)];
    for (const sd of [1, -1]) {
      const dir: V3 = [0, 0.25, sd];
      skin(b, paint, [S(c0, 0, sd), S(c3, 0, sd), S(c2, 1, sd), S(c1, 1, sd)], dir);
      const cuts = [-Infinity, ...(s.pillars ?? []), Infinity];
      for (let i = 0; i + 1 < cuts.length; i++) {
        const [A, B] = [cuts[i], cuts[i + 1]];
        if (s.blind !== undefined && (Number.isFinite(A) ? A : c0) < s.blind - 0.01) continue;
        const xa = (t: number): number => (Number.isFinite(A) ? A + 0.035 : rearX(t) + 0.075);
        const xb = (t: number): number => (Number.isFinite(B) ? B - 0.035 : frontX(t) - 0.075);
        const [t0, t1] = [0.08, 0.9];
        if (xb(t1) - xa(t1) < 0.08) continue;
        skin(b, GLASS, [S(xa(t0), t0, sd, 0.006), S(xb(t0), t0, sd, 0.006), S(xb(t1), t1, sd, 0.006), S(xa(t1), t1, sd, 0.006)], dir);
      }
    }
    // Windscreen, rear window and roof.
    const pane = (xa: number, ya: number, xb: number, dirX: number, glass: boolean): void => {
      const P = (t: number, z: number, proud = 0): V3 => [lerp(xa, xb, t) + dirX * proud, lerp(ya, H, t) + proud, z];
      skin(b, paint, [P(0, hb), P(0, -hb), P(1, -hr), P(1, hr)], [dirX, 0.6, 0]);
      if (glass) skin(b, GLASS, [P(0.06, hb - 0.07, 0.006), P(0.06, -hb + 0.07, 0.006), P(0.94, -hr + 0.06, 0.006), P(0.94, hr - 0.06, 0.006)], [dirX, 0.6, 0]);
    };
    pane(c3, y3, c2, 1, true);
    pane(c0, y0, c1, -1, s.blind === undefined);
    skin(b, paint, [[c1, H, hr], [c2, H, hr], [c2, H, -hr], [c1, H, -hr]], 'up');
    if (s.rails) for (const sd of [1, -1]) block(b, 'black', [(c1 + c2) / 2, H + 0.035, sd * (hr - 0.08)], [(c2 - c1) / 2 - 0.15, 0.025, 0.02], 'd');
    // Mirrors.
    for (const sd of [1, -1]) shell(b, paint, [c3 - 0.12, y3 + 0.05, sd * (hw + 0.07)], [0.045, 0.055, 0.085]);
  }
  if (s.bed) part(b, 'dark', [[-L + 0.12, s.tail + 0.003, hw - 0.14], [c0 - 0.1, s.tail + 0.003, hw - 0.14], [c0 - 0.1, s.tail + 0.003, -hw + 0.14], [-L + 0.12, s.tail + 0.003, -hw + 0.14]], 'up');

  // --- Wheels in their arches. ---
  const ww = s.wheelW ?? 0.21;
  for (const ax of s.axles)
    for (const sd of [1, -1]) {
      const z = sd * (hw + 0.004);
      const ra = s.wheelR + 0.07;
      const [u0, v0, u1, v1] = VEHICLE_PARTS.dark;
      const uv: [number, number][] = [[u0, v0], [u1, v0], [(u0 + u1) / 2, v1]];
      for (let i = 0; i < 8; i++) {
        const [a0, a1] = [(i / 8) * Math.PI, ((i + 1) / 8) * Math.PI];
        const P = (a: number): V3 => [ax + Math.cos(a) * ra, Math.max(low(ax), s.wheelR + Math.sin(a) * ra), z];
        const lowP = (a: number): V3 => [ax + Math.cos(a) * ra, low(ax), z];
        if (sd > 0) {
          b.tri(PARTS, [ax, s.wheelR, z], P(a0), P(a1), uv);
          if (i === 0 || i === 7) b.tri(PARTS, [ax, s.wheelR, z], i === 0 ? lowP(0) : P(Math.PI), i === 0 ? P(0) : lowP(Math.PI), uv);
        } else {
          b.tri(PARTS, [ax, s.wheelR, z], P(a1), P(a0), uv);
          if (i === 0 || i === 7) b.tri(PARTS, [ax, s.wheelR, z], i === 0 ? P(0) : lowP(Math.PI), i === 0 ? lowP(0) : P(Math.PI), uv);
        }
      }
      wheel(b, s.wheel, ax, s.wheelR, sd * (hw - ww), sd * (hw + 0.012));
    }

  // --- Ends: bumpers, lamps, grille and plates. ---
  for (const end of [1, -1]) {
    const x = end * L;
    const [yb, yt, w] = [low(x), top(x), width(x)];
    const bumper: V3 = [x + end * 0.02, yb + 0.12, 0];
    if (s.plastic) block(b, 'black', bumper, [0.06, 0.12, w + 0.015], 'd');
    else shell(b, paint, bumper, [0.06, 0.12, w + 0.015]);
    const name = end > 0 ? s.head : s.rear;
    const [rx0, ry0, rx1, ry1] = VEHICLE_PARTS[name];
    const aspect = (rx1 - rx0) / (ry1 - ry0);
    const lh = Math.min(yt - yb - 0.31, name.includes('slim') || name.includes('bar') ? 0.11 : name === 'tail-tall' ? 0.34 : 0.17);
    const lw = Math.min(w * 0.62, Math.max(lh * aspect * (name === 'tail-tall' ? 1.6 : 1.25), name === 'head-round' ? 0 : name === 'tail-tall' ? 0 : 0.44));
    const ly = yt - 0.07 - lh / 2;
    for (const sd of [1, -1]) endPart(b, name, end, x + end * 0.004, ly, sd * (w - 0.03 - lw / 2), lw, lh, sd * end < 0);
    const plate = s.plate ?? 'plate-white';
    if (end > 0) {
      if (s.grille) {
        const gw = 2 * (w - 0.08 - lw);
        if (gw > 0.3) endPart(b, s.grille, 1, x + 0.004, ly - 0.01, 0, gw, Math.min(0.2, lh + 0.04));
      }
      endPart(b, 'grille-bars', 1, x + 0.082, yb + 0.07, 0, w * 1.1, 0.08);
      endPart(b, plate, 1, x + 0.083, yb + 0.17, 0, 0.33, 0.165);
    } else {
      endPart(b, plate, -1, x - (ly - 0.3 > yb + 0.22 ? 0.004 : 0.083), ly - 0.3 > yb + 0.22 ? ly - 0.16 : yb + 0.15, 0, 0.33, 0.165);
    }
  }
  // --- Door joints and handles. ---
  const doors = s.doors ?? [];
  for (const sd of [1, -1]) {
    doors.forEach((x, i) => {
      const yt = top(x);
      sidePart(b, 'dark', sd, x, (low(x) + 0.14 + yt - 0.09) / 2, sd * (hw + 0.003), 0.014, yt - 0.09 - low(x) - 0.14);
      if (i > 0) sidePart(b, s.plastic ? 'black' : 'chrome', sd, x - 0.13, yt - 0.17, sd * (hw + 0.004), 0.13, 0.03);
    });
    // Side repeaters.
    sidePart(b, 'indicator', sd, s.axles[1] + s.wheelR + 0.16, top(s.axles[1]) - 0.2, sd * (hw + 0.004), 0.07, 0.03);
  }
  s.extra?.(b, s);
}

/** A box body with lettered sides behind a cab: from x0 to x1, floor to top. */
export function boxBody(b: MeshBuilder, tex: string, x0: number, x1: number, y0: number, y1: number, hw: number): void {
  const p = b.part(tex);
  for (const sd of [1, -1]) {
    const pts: [V3, V3, V3, V3] = sd > 0 ? [[x0, y0, hw], [x1, y0, hw], [x1, y1, hw], [x0, y1, hw]] : [[x1, y0, -hw], [x0, y0, -hw], [x0, y1, -hw], [x1, y1, -hw]];
    b.quad(tex, pts[0], pts[1], pts[2], pts[3], [[0, 0], [p.mw, 0], [p.mw, p.mh], [0, p.mh]]);
  }
  // Front, top and the doors at the back show the plain end of the sheet.
  const plain: [number, number][] = [[0.04, 0.9], [0.44, 0.9], [0.44, 1.9], [0.04, 1.9]];
  b.quadFacing(tex, [x1, y0, hw], [x1, y0, -hw], [x1, y1, -hw], [x1, y1, hw], [1, 0, 0], plain);
  b.quadFacing(tex, [x0, y0, -hw], [x0, y0, hw], [x0, y1, hw], [x0, y1, -hw], [-1, 0, 0], plain);
  b.quadFacing(tex, [x0, y1, hw], [x1, y1, hw], [x1, y1, -hw], [x0, y1, -hw], [0, 1, 0], plain);
  b.quadFacing(tex, [x0, y0, -hw], [x1, y0, -hw], [x1, y0, hw], [x0, y0, hw], [0, -1, 0], plain);
  // Door joint, hinges and the bar that locks them.
  part(b, 'dark', [[x0 - 0.004, y0 + 0.05, 0.008], [x0 - 0.004, y0 + 0.05, -0.008], [x0 - 0.004, y1 - 0.05, -0.008], [x0 - 0.004, y1 - 0.05, 0.008]], 'back');
  for (const sd of [1, -1]) block(b, 'chrome', [x0 - 0.02, (y0 + y1) / 2, sd * 0.16], [0.015, (y1 - y0) / 2 - 0.08, 0.015], 'ud');
  block(b, 'black', [x0 - 0.04, y0 - 0.12, 0], [0.05, 0.05, hw], '');
}

type Shape = Omit<CarSpec, 'wheel' | 'head' | 'rear'> & Partial<Pick<CarSpec, 'wheel' | 'head' | 'rear'>>;
const sedan = (len: number, wid: number, hgt: number, o: Partial<CarSpec> = {}): Shape => {
  const L = len / 2;
  return {
    len, wid, hgt, wheelR: 0.32, axles: [-L + 0.95, L - 0.88], tail: hgt * 0.66, deck: hgt * 0.66, cowl: hgt * 0.64, nose: hgt * 0.5,
    cabin: [-L + 0.75, -L + 1.35, L - 2.05, L - 1.3], pillars: [-L + 1.45, -0.02], doors: [L - 1.25, -0.02, -L + 1.2], grille: 'grille-bars', ...o,
  };
};
const hatch = (len: number, wid: number, hgt: number, o: Partial<CarSpec> = {}): Shape => {
  const L = len / 2;
  return {
    len, wid, hgt, wheelR: 0.3, axles: [-L + 0.68, L - 0.8], tail: hgt * 0.62, deck: hgt * 0.62, cowl: hgt * 0.62, nose: hgt * 0.5,
    cabin: [-L + 0.06, -L + 0.42, L - 1.75, L - 1.1], pillars: [-L + 0.95, -0.05], doors: [L - 1.05, -0.05, -L + 1], grille: 'grille-mesh', rear: 'tail-tall', ...o,
  };
};
const WHITE = (o: Shape): CarSpec => ({ wheel: 'alloy', head: 'head-rect', rear: 'tail-rect', ...o });

/** The cars, vans and trucks of the catalogue, by id. */
export const CARS: [string, string, CarSpec][] = [
  ['kei', '軽自動車 ハイト', WHITE(hatch(3.4, 1.48, 1.64, { wheelR: 0.27, wheel: 'cap', head: 'head-rect', plate: 'plate-yellow', tumble: 0.08, nose: 0.86, cowl: 0.98, tail: 0.98, deck: 0.98, cabin: [-1.66, -1.5, 0.75, 1.2], axles: [-1.17, 1.2], pillars: [-0.95, -0.1], doors: [1.2, -0.1, -0.95] }))],
  ['kei-box', '軽自動車 ワンボックス', WHITE(hatch(3.4, 1.48, 1.86, { wheelR: 0.27, wheel: 'steel', head: 'head-round', plate: 'plate-yellow', tumble: 0.06, nose: 0.98, cowl: 1.04, tail: 1.02, deck: 1.02, cabin: [-1.67, -1.6, 1.1, 1.52], axles: [-1.15, 1.18], pillars: [-0.9, 0.15], doors: [1.5, 0.15, -0.9], plastic: true }))],
  ['compact', 'コンパクトカー', WHITE(hatch(3.95, 1.7, 1.5, { wheel: 'cap' }))],
  ['hatch', 'ハッチバック', WHITE(hatch(4.3, 1.78, 1.46, { head: 'head-slim', rear: 'tail-rect', wheelR: 0.32 }))],
  ['sedan', 'セダン', WHITE(sedan(4.6, 1.8, 1.45))],
  ['sedan-large', '大型セダン', WHITE(sedan(4.98, 1.87, 1.47, { head: 'head-twin', rear: 'tail-bar', grille: 'grille-chrome', wheelR: 0.34 }))],
  ['sedan-old', '古いセダン', WHITE(sedan(4.5, 1.7, 1.39, { head: 'head-round', rear: 'tail-rect', grille: 'grille-chrome', wheel: 'cap', tumble: 0.1, nose: 0.82, cowl: 0.9, tail: 0.88, deck: 0.9, cabin: [-1.25, -0.85, 0.55, 0.9], paint: 'vehicle/paint-worn' }))],
  ['coupe', 'クーペ', WHITE(sedan(4.45, 1.84, 1.3, { head: 'head-slim', rear: 'tail-bar', grille: 'grille-mesh', wheelR: 0.34, tumble: 0.2, nose: 0.62, cowl: 0.84, deck: 0.88, tail: 0.86, cabin: [-1.75, -0.75, 0.2, 1.0], pillars: [-0.55], doors: [1.0, -0.4] }))],
  ['wagon', 'ステーションワゴン', WHITE(hatch(4.72, 1.8, 1.48, { wheelR: 0.32, head: 'head-slim', rear: 'tail-rect', grille: 'grille-bars', rails: true, nose: 0.76, cowl: 0.94, tail: 0.94, deck: 0.94, cabin: [-2.3, -1.95, 0.35, 1.1], axles: [-1.42, 1.45], pillars: [-1.35, -0.3], doors: [1.15, 0.2, -0.75] }))],
  ['suv', 'SUV', WHITE(hatch(4.6, 1.86, 1.7, { wheelR: 0.37, clear: 0.24, head: 'head-rect', rear: 'tail-tall', grille: 'grille-chrome', rails: true, plastic: true, nose: 0.98, cowl: 1.1, tail: 1.08, deck: 1.08, cabin: [-2.24, -1.95, 0.25, 0.95], axles: [-1.38, 1.4], pillars: [-1.3, -0.25], doors: [1.0, 0.1, -0.85] }))],
  ['suv-large', '大型SUV', WHITE(hatch(5.05, 1.98, 1.88, { wheelR: 0.4, wheelW: 0.26, clear: 0.26, head: 'head-twin', rear: 'tail-tall', grille: 'grille-chrome', rails: true, tumble: 0.1, nose: 1.1, cowl: 1.2, tail: 1.18, deck: 1.18, cabin: [-2.48, -2.3, 0.4, 0.95], axles: [-1.5, 1.6], pillars: [-1.45, -0.3], doors: [1.0, 0.1, -0.9] }))],
  ['minivan', 'ミニバン', WHITE(hatch(4.8, 1.85, 1.82, { wheelR: 0.33, head: 'head-slim', rear: 'tail-tall', grille: 'grille-chrome', tumble: 0.09, nose: 0.92, cowl: 1.06, tail: 1.04, deck: 1.04, cabin: [-2.37, -2.25, 1.0, 1.75], axles: [-1.5, 1.5], pillars: [-1.3, 0.05], doors: [1.6, 0.6, -0.75] }))],
  ['pickup', 'ピックアップトラック', WHITE(sedan(5.4, 1.96, 1.82, { wheelR: 0.4, wheelW: 0.26, clear: 0.27, head: 'head-rect', rear: 'tail-tall', grille: 'grille-chrome', wheel: 'steel', tumble: 0.09, nose: 1.08, cowl: 1.16, tail: 1.14, deck: 1.14, cabin: [-0.75, -0.6, 0.55, 1.05], axles: [-1.65, 1.75], pillars: [-0.05], doors: [1.1, -0.05, -0.7], bed: true }))],
  ['pickup-single', 'ピックアップ シングルキャブ', WHITE(sedan(5.1, 1.9, 1.76, { wheelR: 0.38, clear: 0.25, head: 'head-round', rear: 'tail-tall', grille: 'grille-bars', wheel: 'steel', plastic: true, paint: 'vehicle/paint-worn', tumble: 0.08, nose: 1.02, cowl: 1.1, tail: 1.06, deck: 1.06, cabin: [-0.1, 0.05, 0.75, 1.2], axles: [-1.55, 1.65], pillars: [], doors: [1.25, 0.0], bed: true }))],
  ['van', '商用バン', WHITE(hatch(5.2, 1.94, 2.2, { wheelR: 0.35, clear: 0.2, head: 'head-rect', rear: 'tail-tall', grille: 'grille-bars', wheel: 'steel', plastic: true, tumble: 0.05, nose: 1.02, cowl: 1.22, tail: 1.2, deck: 1.2, cabin: [-2.58, -2.52, 1.35, 1.95], axles: [-1.55, 1.6], pillars: [0.55], blind: 0.5, doors: [1.9, 0.55, -0.9] }))],
  ['van-windows', 'ワゴン車', WHITE(hatch(5.2, 1.94, 2.1, { wheelR: 0.35, clear: 0.2, head: 'head-rect', rear: 'tail-tall', grille: 'grille-bars', wheel: 'cap', tumble: 0.05, nose: 1.02, cowl: 1.2, tail: 1.18, deck: 1.18, cabin: [-2.58, -2.5, 1.35, 1.95], axles: [-1.55, 1.6], pillars: [-1.2, -0.3, 0.55], doors: [1.9, 0.55, -0.9] }))],
  ['kei-truck', '軽トラック', WHITE(sedan(3.4, 1.48, 1.78, { wheelR: 0.27, wheel: 'steel', head: 'head-round', rear: 'tail-rect', grille: undefined, plate: 'plate-yellow', plastic: true, tumble: 0.05, nose: 0.86, cowl: 0.96, tail: 0.86, deck: 0.86, cabin: [0.28, 0.33, 1.2, 1.62], axles: [-0.85, 1.05], pillars: [], doors: [1.6, 0.4], bed: true }))],
];

/** A cab with a box body behind it. */
const truck = (len: number, wid: number, hgt: number, box: string, o: Partial<CarSpec> = {}): CarSpec => {
  const L = len / 2;
  const cab = 1.75;
  return {
    len, wid: wid - 0.2, hgt: Math.min(hgt - 0.5, 2.3), clear: 0.32, wheelR: 0.4, wheelW: 0.3, wheel: 'truck', head: 'head-rect', rear: 'tail-rect', grille: 'grille-bars', plastic: true,
    axles: [-L + len * 0.27, L - 1.05], tail: 0.86, deck: 0.86, cowl: 1.25, nose: 1.12, tumble: 0.06,
    cabin: [L - cab, L - cab + 0.04, L - 0.5, L - 0.06], pillars: [], doors: [L - 0.12, L - cab + 0.15],
    extra: (b) => boxBody(b, box, -L + 0.02, L - cab - 0.12, 0.98, hgt, wid / 2),
    ...o,
  };
};
const TAXI: CarSpec = {
  ...WHITE(sedan(4.7, 1.8, 1.47, { wheel: 'cap', grille: 'grille-chrome' })),
  extra: (b, s) => {
    const y = s.hgt + 0.09;
    shell(b, 'vehicle/livery-taxi', [-0.1, y, 0], [0.09, 0.08, 0.3]);
    for (const end of [1, -1]) endPart(b, 'taxi-sign', end, -0.1 + end * 0.094, y, 0, 0.56, 0.15);
    // The chequered band along the doors.
    const p = b.part('vehicle/livery-taxi');
    for (const sd of [1, -1]) {
      const [x0, x1, z] = [-1.1, 1.05, sd * (s.wid / 2 + 0.004)];
      const pts: [V3, V3, V3, V3] = sd > 0 ? [[x0, 0.62, z], [x1, 0.62, z], [x1, 0.72, z], [x0, 0.72, z]] : [[x1, 0.62, z], [x0, 0.62, z], [x0, 0.72, z], [x1, 0.72, z]];
      b.quad('vehicle/livery-taxi', pts[0], pts[1], pts[2], pts[3], [[0, 0], [(x1 - x0) * 2, 0], [(x1 - x0) * 2, p.mh / 2], [0, p.mh / 2]]);
    }
  },
};
const POLICE: CarSpec = {
  ...WHITE(sedan(4.9, 1.86, 1.48, { wheel: 'steel', head: 'head-twin', grille: 'grille-mesh', wheelR: 0.34 })),
  extra: (b, s) => {
    block(b, 'black', [-0.15, s.hgt + 0.03, 0], [0.12, 0.03, 0.55], 'd');
    for (const end of [1, -1]) endPart(b, 'lightbar', end, -0.15 + end * 0.11, s.hgt + 0.11, 0, 1.05, 0.1);
    part(b, 'lightbar', [[-0.26, s.hgt + 0.16, 0.525], [-0.04, s.hgt + 0.16, 0.525], [-0.04, s.hgt + 0.16, -0.525], [-0.26, s.hgt + 0.16, -0.525]], 'up');
    for (const sd of [1, -1]) block(b, 'lightbar', [-0.15, s.hgt + 0.11, sd * 0.526], [0.11, 0.05, 0.001], 'udfb' + (sd > 0 ? 'l' : 'r'));
    // White doors with the word on them.
    const p = b.part('vehicle/livery-police');
    for (const sd of [1, -1]) {
      const [x0, x1, z] = [-1.2, 1.15, sd * (s.wid / 2 + 0.0035)];
      const pts: [V3, V3, V3, V3] = sd > 0 ? [[x0, 0.31, z], [x1, 0.31, z], [x1, 0.86, z], [x0, 0.86, z]] : [[x1, 0.31, z], [x0, 0.31, z], [x0, 0.86, z], [x1, 0.86, z]];
      b.quad('vehicle/livery-police', pts[0], pts[1], pts[2], pts[3], [[0, 0], [p.mw, 0], [p.mw, p.mh], [0, p.mh]]);
    }
  },
};
CARS.push(
  ['taxi', 'タクシー', TAXI],
  ['police', 'パトカー', POLICE],
  ['truck-box-white', '箱トラック 白', truck(6.2, 2.2, 3.0, 'vehicle/box-white')],
  ['truck-box-aluminium', '箱トラック アルミ', truck(6.6, 2.3, 3.1, 'vehicle/box-aluminium', { head: 'head-round' })],
  ['truck-box-express', '宅配トラック', truck(5.6, 2.1, 2.8, 'vehicle/box-express')],
  ['truck-box-mart', '食品配送トラック', truck(6.2, 2.2, 3.0, 'vehicle/box-mart')],
  ['truck-box-movers', '引越トラック', truck(6.8, 2.3, 3.2, 'vehicle/box-movers')],
  ['truck-box-logistics', '物流トラック', truck(6.6, 2.3, 3.1, 'vehicle/box-logistics', { head: 'head-twin' })],
  ['truck-box-rental', 'レンタルトラック', truck(5.4, 2.05, 2.7, 'vehicle/box-rental', { wheel: 'steel' })],
);

/** Length and width of each car on the ground. */
export const CAR_SIZE = new Map(
  CARS.map(([id, , s]) => {
    const box = id.startsWith('truck');
    return [`vehicle/${id}`, { len: s.len + 0.16, wid: s.wid + 0.3 + (box ? 0.2 : 0), hgt: box ? s.hgt + 0.7 : s.hgt }];
  }),
);

export function addVehicles(add: (id: string, label: string, fn: (b: MeshBuilder) => void) => void): void {
  for (const [id, label, spec] of CARS) add(id, label, (b) => car(b, spec));
}
