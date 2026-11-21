import { MeshBuilder, V3 } from './builder';
import { Pose, at, box, catenary, disc, face, footing, lathe, move, pipe, plate, roll, stand, tilt, turn } from './kit';
import { addModel } from './registry';
import { Lamp, PoleOpts, cabinet, fitting, luminaire, pole } from './signals';

const ZINC = 'structure/steel-galvanized';
const BLACK = 'structure/steel-black';
const CABLE = 'furniture/cable';
const O = stand();
const F = (id: string): string => `furniture/${id}`;
const P = (id: string): string => `signal/pole-${id}`;

// --- Shared shapes. ---

/** Rectangle seen from both sides. */
function both(b: MeshBuilder, front: string, f: Pose, c: V3, w: number, h: number, back = front): void {
  face(b, front, f, c, w, h);
  face(b, back, turn(f, 180), [-c[0], c[1], -c[2]], w, h);
}
/** Sphere (or, with `flat` below 1, an ellipsoid) centred `cy` above the pose. */
function ball(b: MeshBuilder, material: string, f: Pose, cy: number, r: number, sides = 12, flat = 1, from = 0, to = 1): void {
  const profile: [number, number][] = [];
  const n = 8;
  for (let i = Math.round(from * n); i <= Math.round(to * n); i++) profile.push([Math.max(0, r * Math.sin((i / n) * Math.PI)), cy - r * flat * Math.cos((i / n) * Math.PI)]);
  lathe(b, material, f, profile, sides);
}
/** Closed hoop of radius R around the up axis at height y. */
function hoop(b: MeshBuilder, material: string, f: Pose, y: number, R: number, r: number, sides = 16): void {
  const pts: V3[] = [];
  for (let i = 0; i <= sides; i++) pts.push(at(f, R * Math.cos((i / sides) * Math.PI * 2), y, R * Math.sin((i / sides) * Math.PI * 2)));
  pipe(b, material, pts, r, 6, false);
}
const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
/** Triangles filling a simple counter-clockwise polygon (ear clipping, so concave outlines stay inside their edges). */
function triangulate(o: [number, number][]): [number, number, number][] {
  const idx = o.map((_, i) => i);
  const out: [number, number, number][] = [];
  const cross = (a: number, b: number, c: number): number => (o[b][0] - o[a][0]) * (o[c][1] - o[a][1]) - (o[b][1] - o[a][1]) * (o[c][0] - o[a][0]);
  while (idx.length > 3) {
    let ear = -1;
    for (let i = 0; i < idx.length && ear < 0; i++) {
      const [a, b, c] = [idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]];
      if (cross(a, b, c) <= 1e-12) continue;
      if (!idx.some((p) => p !== a && p !== b && p !== c && cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0)) ear = i;
    }
    // Only collinear or reflex corners left: drop one so that the loop always ends.
    if (ear < 0) ear = 1;
    else out.push([idx[(ear + idx.length - 1) % idx.length], idx[ear], idx[(ear + 1) % idx.length]]);
    idx.splice(ear, 1);
  }
  out.push([idx[0], idx[1], idx[2]]);
  return out;
}
/** Prism: a closed outline of [z, y] points swept along x from x0 to x1. The end caps map the outline's bounding box in metres, so a face texture of that size fits. */
export function prism(b: MeshBuilder, material: string, f: Pose, outline: [number, number][], x0: number, x1: number, caps = material, capsEnd = caps): void {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [p, q] = [outline[i], outline[(i + 1) % outline.length]];
    area += p[0] * q[1] - q[0] * p[1];
  }
  const o = area < 0 ? [...outline].reverse() : outline;
  const n = o.length;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const [p, q] = [o[i], o[(i + 1) % n]];
    const run = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (run < 1e-6) continue;
    b.quad(material, at(f, x0, p[1], p[0]), at(f, x1, p[1], p[0]), at(f, x1, q[1], q[0]), at(f, x0, q[1], q[0]), [[0, v], [x1 - x0, v], [x1 - x0, v + run], [0, v + run]]);
    v += run;
  }
  const zs = o.map((p) => p[0]);
  const ys = o.map((p) => p[1]);
  const [z0, y0, z1] = [Math.min(...zs), Math.min(...ys), Math.max(...zs)];
  for (const tri of triangulate(o)) {
    const [p, q, r] = tri.map((i) => o[i]);
    const uv = (c: [number, number]): [number, number] => [c[0] - z0, c[1] - y0];
    const vu = (c: [number, number]): [number, number] => [z1 - c[0], c[1] - y0];
    b.tri(caps, at(f, x0, p[1], p[0]), at(f, x0, q[1], q[0]), at(f, x0, r[1], r[0]), [uv(p), uv(q), uv(r)]);
    b.tri(capsEnd, at(f, x1, p[1], p[0]), at(f, x1, r[1], r[0]), at(f, x1, q[1], q[0]), [vu(p), vu(r), vu(q)]);
  }
}
/** Board lying along x. Its wide face looks up, or to the front when `upright`; the wood grain runs lengthwise. */
function board(b: MeshBuilder, material: string, f: Pose, c: V3, len: number, wide: number, thick: number, upright = false): void {
  if (upright) box(b, material, { o: f.o, x: f.y, y: f.x, z: neg(f.z) }, [c[1], c[0], -c[2]], [wide / 2, len / 2, thick / 2]);
  else box(b, material, { o: f.o, x: f.z, y: f.y, z: neg(f.x) }, [c[2], c[1], -c[0]], [wide / 2, thick / 2, len / 2]);
}
/** Quarter-round sweep from `from`, leaving along +x and arriving going up (or the reverse with `over`). */
function sweep(f: Pose, from: V3, dx: number, dy: number, over = false, n = 8): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((i / n) * Math.PI) / 2;
    pts.push(over ? at(f, from[0] + dx * (1 - Math.cos(a)), from[1] + dy * Math.sin(a), from[2]) : at(f, from[0] + dx * Math.sin(a), from[1] + dy * (1 - Math.cos(a)), from[2]));
  }
  return pts;
}

// --- Street lights. ---

/** Banner between two rods on the side of a pole. `side` 1 hangs it on +x. */
function banner(b: MeshBuilder, f: Pose, y: number, id: string, side: number, tex: string): void {
  for (const yy of [y - 0.02, y + 1.82]) b.tube(tex, at(f, side * 0.04, yy, 0), at(f, side * 0.92, yy, 0), 0.014, 6, 0.014, true);
  both(b, F(`banner-${id}`), f, [side * 0.52, y + 0.9, 0], 0.75, 1.8);
}
/** Hanging flower basket on a scroll bracket. */
function basket(b: MeshBuilder, f: Pose, y: number, side: number, tex: string, flowers: string): void {
  pipe(b, tex, sweep(f, [side * 0.05, y, 0], side * 0.55, 0.25), 0.012, 6);
  const g = move(f, side * 0.6, y - 0.2, 0);
  for (let i = 0; i < 3; i++) b.tube(tex, at(g, 0, 0.45, 0), at(g, 0.2 * Math.cos(i * 2.1), 0, 0.2 * Math.sin(i * 2.1)), 0.004, 4);
  lathe(b, F('coat-brown'), g, [[0, -0.14], [0.12, -0.12], [0.2, -0.02], [0.21, 0]], 10);
  ball(b, F(flowers), g, 0.04, 0.3, 10, 0.7, 0.35, 1);
}
type Top = 'globe' | 'acorn' | 'lantern' | 'disc';
/** Post-top lamp standing on the pose. */
function topFitting(b: MeshBuilder, f: Pose, kind: Top, on: boolean, tex: string): void {
  if (kind === 'globe') {
    lathe(b, tex, f, [[0.05, 0], [0.09, 0.04], [0.09, 0.07], [0.07, 0.09]], 10);
    ball(b, F(on ? 'globe-on' : 'globe-off'), f, 0.3, 0.23, 14);
  } else if (kind === 'acorn') {
    lathe(b, tex, f, [[0.05, 0], [0.1, 0.06], [0.11, 0.1]], 10);
    lathe(b, F(on ? 'acorn-on' : 'acorn-off'), f, [[0.1, 0.1], [0.2, 0.22], [0.235, 0.38], [0.2, 0.56], [0.12, 0.68]], 14);
    lathe(b, tex, f, [[0.13, 0.68], [0.14, 0.72], [0.06, 0.8], [0.025, 0.88], [0.04, 0.91], [0, 0.95]], 10);
  } else if (kind === 'lantern') {
    const g = turn(f, 45);
    lathe(b, tex, g, [[0.05, 0], [0.13, 0.05], [0.13, 0.08]], 4);
    lathe(b, F(on ? 'lantern-on' : 'acorn-off'), g, [[0.12, 0.08], [0.22, 0.52]], 4);
    lathe(b, tex, g, [[0.27, 0.52], [0.25, 0.56], [0.07, 0.74], [0.04, 0.8], [0, 0.86]], 4);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      b.tube(tex, at(g, 0.125 * Math.cos(a), 0.08, 0.125 * Math.sin(a)), at(g, 0.225 * Math.cos(a), 0.52, 0.225 * Math.sin(a)), 0.012, 4);
    }
  } else {
    lathe(b, tex, f, [[0.045, 0], [0.045, 0.3], [0.4, 0.33], [0.4, 0.37], [0, 0.43]], 16);
    disc(b, on ? F('led-strip-on') : 'signal/lamp-led-off', { o: at(f, 0, 0.325, 0), x: f.x, y: f.z, z: [-f.y[0], -f.y[1], -f.y[2]] }, [0, 0, 0], 0.36, 16, 0.24);
  }
}
interface PostTopOpts {
  h: number;
  tex: string;
  top: Top;
  on?: boolean;
  base?: PoleOpts['base'];
  /** Side arms each carrying a lamp. */
  arms?: number;
  /** Keeps a lamp on the pole top as well as on the arms. */
  centre?: boolean;
  banners?: string[];
  baskets?: string;
  r0?: number;
}
function postTop(b: MeshBuilder, f: Pose, o: PostTopOpts): void {
  const r0 = o.r0 ?? 0.065;
  const on = o.on !== false;
  const arms = o.arms ?? 0;
  pole(b, f, { h: o.h, r0, r1: r0 * 0.78, tex: o.tex, base: o.base ?? 'cast', cap: 'none' });
  if (!arms || o.centre) topFitting(b, move(f, 0, o.h, 0), o.top, on, o.tex);
  else lathe(b, o.tex, f, [[r0 * 0.78, o.h], [r0 * 1.2, o.h + 0.05], [r0 * 0.5, o.h + 0.16], [0, o.h + 0.3]], 10);
  for (let k = 0; k < arms; k++) {
    const g = turn(f, (k * 360) / arms);
    const y = o.h - (o.centre ? 0.75 : 0.45);
    pipe(b, o.tex, sweep(g, [r0 * 0.6, y, 0], 0.5, 0.3), 0.022, 6);
    pipe(b, o.tex, sweep(g, [r0 * 0.6, y - 0.28, 0], 0.32, 0.3, true), 0.012, 6);
    topFitting(b, move(g, 0.5 + r0 * 0.6, y + 0.3, 0), o.top, on, o.tex);
  }
  (o.banners ?? []).forEach((id, i) => banner(b, turn(f, arms ? 90 : 0), o.h - 2.6, id, i ? -1 : 1, o.tex));
  if (o.baskets) for (const s of [1, -1]) basket(b, turn(f, arms ? 90 : 0), o.h - 1.2, s, o.tex, o.baskets);
}
interface LightOpts {
  h: number;
  tex: string;
  lamp: Lamp;
  /** Reach of each arm. */
  arm?: number;
  arms?: number;
  base?: PoleOpts['base'];
  rise?: number;
  sides?: number;
  r0?: number;
  /** The pole itself bends over the road. */
  davit?: boolean;
  banners?: string[];
  /** Second, lower lamp over the sidewalk. */
  ped?: boolean;
  lean?: number;
}
function streetLight(b: MeshBuilder, f0: Pose, o: LightOpts): void {
  const f = o.lean ? roll(f0, o.lean) : f0;
  const r0 = o.r0 ?? 0.11;
  const n = o.arms ?? 1;
  const arm = o.arm ?? 2.4;
  if (o.davit) {
    const bend = Math.min(1.6, arm);
    pole(b, f, { h: o.h - bend, r0, r1: r0 * 0.62, tex: o.tex, base: o.base, sides: o.sides, cap: n > 1 ? 'dome' : 'none' });
    for (let k = 0; k < n; k++) {
      const g = turn(f, k * 180);
      const pts = sweep(g, [0, o.h - bend, 0], -bend, bend, true, 10);
      pts.push(at(g, -arm, o.h, 0));
      pipe(b, o.tex, pts, (q) => r0 * (0.62 - 0.22 * q), 8);
      fitting(b, move(g, -arm, o.h, 0), o.lamp, o.tex);
    }
  } else {
    pole(b, f, { h: o.h, r0, r1: r0 * 0.55, tex: o.tex, base: o.base, sides: o.sides });
    for (let k = 0; k < n; k++) luminaire(b, turn(move(f, 0, o.h - 0.25, 0), (k * 360) / n), arm, o.lamp, o.tex, o.rise ?? 0.5);
  }
  (o.banners ?? []).forEach((id, i) => banner(b, f, 4, id, i ? -1 : 1, o.tex));
  if (o.ped) luminaire(b, turn(move(f, 0, 4.4, 0), 180), 0.9, 'led-on', o.tex, 0.25);
}
/** Mast with a cross bar of floodlights. */
function floodMast(b: MeshBuilder, f: Pose, h: number, heads: number, tex: string): void {
  pole(b, f, { h, r0: 0.16, r1: 0.09, tex, base: 'plate' });
  const w = heads * 0.42;
  box(b, tex, f, [0, h - 0.2, 0], [w / 2, 0.04, 0.04]);
  for (let i = 0; i < heads; i++) {
    const g = tilt(move(f, (i - (heads - 1) / 2) * 0.42, h - 0.02, 0.06), 38);
    box(b, 'signal/housing-black', g, [0, 0, 0], [0.18, 0.14, 0.06], 'z');
    face(b, 'signal/lamp-led-on', g, [0, 0, 0.06], 0.36, 0.28);
    b.tube(tex, at(f, (i - (heads - 1) / 2) * 0.42, h - 0.2, 0), g.o, 0.015, 5);
  }
}

// --- Utility poles. ---

/** Pin insulator standing on the pose. */
function insulator(b: MeshBuilder, f: Pose, tex = F('ceramic-brown')): void {
  b.tube(ZINC, f.o, at(f, 0, 0.06, 0), 0.01, 5);
  lathe(b, tex, f, [[0.028, 0.05], [0.055, 0.07], [0.04, 0.1], [0.06, 0.13], [0.035, 0.17], [0, 0.19]], 8);
}
/** Pole-mounted transformer hung on the pose's +z side of a pole of radius r. */
function can(b: MeshBuilder, f: Pose, r: number, tex: string): void {
  const g = move(f, 0, 0, r + 0.3);
  box(b, ZINC, f, [0, 0.45, r + 0.02], [0.06, 0.3, 0.04]);
  lathe(b, tex, g, [[0, 0], [0.26, 0.03], [0.28, 0.1], [0.28, 0.82], [0.2, 0.9], [0, 0.92]], 14);
  for (const x of [-0.1, 0.1]) {
    lathe(b, F('ceramic-grey'), move(g, x, 0.9, 0), [[0.03, 0], [0.05, 0.04], [0.03, 0.08], [0.05, 0.12], [0.03, 0.16], [0.045, 0.2], [0.015, 0.26], [0, 0.27]], 8);
  }
  for (let i = -1; i <= 1; i++) lathe(b, F('ceramic-brown'), roll(move(g, 0.27, 0.62, i * 0.1), -90), [[0.02, 0], [0.03, 0.03], [0.02, 0.06], [0, 0.07]], 6);
}
interface UtilOpts {
  h?: number;
  tex?: string;
  r0?: number;
  /** Crossarms, counted down from the top. */
  arms?: number;
  armLen?: number;
  /** Steel arms instead of timber. */
  steel?: boolean;
  /** Insulator on the very top of the pole. */
  pin?: boolean;
  cans?: number;
  canTex?: string;
  /** Stay wire down to a ground anchor on +x. */
  guy?: boolean;
  light?: Lamp;
  /** Telephone cable bracket, splice case and terminal box. */
  comm?: boolean;
  /** Conduit running down the pole with a meter. */
  riser?: boolean;
  lean?: number;
  yaw?: number;
}
interface Taps {
  power: V3[];
  low: V3[];
  comm: V3[];
}
function utilPole(b: MeshBuilder, f0: Pose, o: UtilOpts = {}): Taps {
  const f = o.lean ? roll(f0, o.lean) : f0;
  const h = o.h ?? 11;
  const r0 = o.r0 ?? 0.16;
  const tex = o.tex ?? P('wood');
  const rAt = (y: number): number => r0 * (1 - 0.4 * (y / h));
  const taps: Taps = { power: [], low: [], comm: [] };
  pole(b, f, { h, r0, r1: r0 * 0.6, tex, base: tex.includes('wood') ? 'buried' : 'plate', cap: 'flat', sides: 10 });
  if (o.pin) {
    insulator(b, move(f, 0, h, 0));
    taps.power.push(at(f, 0, h + 0.19, 0));
  }
  const arms = o.arms ?? 1;
  const len = o.armLen ?? 2.4;
  for (let k = 0; k < arms; k++) {
    const y = h - 0.35 - k * 1.1;
    const z = rAt(y) + 0.05;
    if (o.steel) box(b, ZINC, f, [0, y, z], [len / 2, 0.04, 0.04]);
    else board(b, F('crossarm'), f, [0, y, z], len, 0.1, 0.12);
    for (const s of [-1, 1]) b.tube(ZINC, at(f, s * len * 0.3, y - 0.05, z), at(f, 0, y - 0.6, z - 0.04), 0.012, 5);
    const n = k === 0 && o.pin ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const x = (n === 2 ? [-0.42, 0.42] : [-0.46, -0.2, 0.2, 0.46])[i] * len;
      insulator(b, move(f, x, y + (o.steel ? 0.04 : 0.06), z), k === 0 ? F('ceramic-brown') : F('ceramic-grey'));
      (k === 0 ? taps.power : taps.low).push(at(f, x, y + 0.24, z));
    }
  }
  const yCan = h - 1.2 - arms * 1.1;
  const cans = o.cans ?? 0;
  for (let i = 0; i < cans; i++) {
    const g = turn(move(f, 0, yCan - 0.9, 0), cans === 1 ? 0 : (i - (cans - 1) / 2) * 110);
    can(b, g, rAt(yCan), o.canTex ?? F('coat-can-grey'));
    // Fused cutout feeding the transformer from the lowest arm.
    lathe(b, F('ceramic-grey'), tilt(move(g, 0, 1.35, rAt(yCan) + 0.16), 25), [[0.02, 0], [0.035, 0.05], [0.02, 0.1], [0.035, 0.15], [0.02, 0.2], [0, 0.22]], 6);
    b.tube(CABLE, at(g, 0.1, 1.17, rAt(yCan) + 0.3), at(g, 0, 1.35, rAt(yCan) + 0.16), 0.006, 4);
  }
  if (o.light) luminaire(b, move(f, -rAt(yCan - 1.6) * 0.5, yCan - 1.6, 0), 1.8, o.light, ZINC, 0.4);
  if (o.comm) {
    const y = h * 0.56;
    box(b, ZINC, f, [0, y, rAt(y) + 0.03], [0.04, 0.06, 0.03]);
    taps.comm.push(at(f, 0, y, rAt(y) + 0.08), at(f, 0, y - 0.45, rAt(y) + 0.08));
    box(b, P('grey'), f, [rAt(y) + 0.07, y - 0.9, 0], [0.07, 0.17, 0.11]);
    lathe(b, 'signal/housing-black', roll(move(f, -0.45, y - 0.1, rAt(y) + 0.1), -90), [[0, 0], [0.07, 0.03], [0.07, 0.87], [0, 0.9]], 8);
  }
  if (o.riser) {
    const z = rAt(1.5) + 0.03;
    b.tube(ZINC, at(f, 0.05, 0, z), at(f, 0.05, h * 0.68, rAt(h * 0.68) + 0.03), 0.03, 6);
    box(b, ZINC, f, [0.05, 1.2, z + 0.01], [0.05, 1.2, 0.035], 'Z');
    box(b, P('grey'), f, [-0.14, 1.55, z + 0.06], [0.125, 0.175, 0.06], 'z');
    face(b, F('meter-box'), f, [-0.14, 1.55, z + 0.12], 0.25, 0.35);
  }
  if (o.guy) {
    const top = at(f, rAt(h - 1.4), h - 1.4, 0);
    const foot = at(f0, h * 0.42, 0, 0);
    b.tube(ZINC, top, foot, 0.008, 5);
    const q = 2.6 / Math.hypot(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]);
    b.tube('structure/steel-yellow', foot, [foot[0] + (top[0] - foot[0]) * q, foot[1] + (top[1] - foot[1]) * q, foot[2] + (top[2] - foot[2]) * q], 0.028, 6, 0.028, true);
  }
  return taps;
}
/** Steel pole carrying three phases on davit arms with suspension insulators. */
function steelLine(b: MeshBuilder, f: Pose, h: number): Taps {
  const taps: Taps = { power: [], low: [], comm: [] };
  pole(b, f, { h, r0: 0.3, r1: 0.14, tex: P('galvanized'), base: 'plate', sides: 12 });
  for (let k = 0; k < 3; k++) {
    const s = k % 2 ? -1 : 1;
    const y = h - 0.5 - k * 1.6;
    pipe(b, P('galvanized'), [at(f, s * 0.15, y - 0.5, 0), at(f, s * 1.0, y - 0.05, 0), at(f, s * 1.9, y, 0)], (q) => 0.07 - 0.03 * q, 8);
    const profile: [number, number][] = [];
    for (let i = 0; i < 6; i++) profile.push([0.03, -0.14 * i - 0.14], [0.085, -0.14 * i - 0.09], [0.03, -0.14 * i - 0.06]);
    lathe(b, F('ceramic-grey'), move(f, s * 1.9, y, 0), profile.reverse(), 8);
    taps.power.push(at(f, s * 1.9, y - 0.98, 0));
  }
  return taps;
}
/** Cables between matching attachment points of neighbouring poles. */
function string(b: MeshBuilder, a: Taps, c: Taps, sag: number): void {
  for (const key of ['power', 'low', 'comm'] as const) {
    a[key].forEach((p, i) => {
      if (c[key][i]) pipe(b, CABLE, catenary(p, c[key][i], key === 'comm' ? sag * 1.3 : sag, 10), key === 'comm' ? (i ? 0.012 : 0.022) : 0.008, 5, false);
    });
  }
}
/** Row of utility poles along x joined by their wires. */
function line(b: MeshBuilder, n: number, gap: number, o: (i: number) => UtilOpts): void {
  let last: Taps | null = null;
  for (let i = 0; i < n; i++) {
    const t = utilPole(b, stand([(i - (n - 1) / 2) * gap, 0, 0], 90), o(i));
    if (last) string(b, last, t, gap * 0.035);
    last = t;
  }
}

// --- Benches. ---

/** Flat panel with its own front and back faces and a rim. */
function panel(b: MeshBuilder, front: string, back: string, rim: string, f: Pose, c: V3, w: number, h: number, t: number): void {
  box(b, rim, f, c, [w / 2, h / 2, t], 'zZ');
  face(b, front, f, [c[0], c[1], c[2] + t], w, h);
  face(b, back, turn(f, 180), [-c[0], c[1], -c[2] + t], w, h);
}
/** Rectangle on the side of the pose at x, facing outwards. */
function sideFace(b: MeshBuilder, material: string, f: Pose, x: number, cy: number, cz: number, w: number, h: number): void {
  const s = Math.sign(x);
  const g: Pose = { o: f.o, x: [-s * f.z[0], -s * f.z[1], -s * f.z[2]], y: f.y, z: [s * f.x[0], s * f.x[1], s * f.x[2]] };
  face(b, material, g, [-s * cz, cy, Math.abs(x)], w, h);
}
/** Outline of a box with a rounded top: flat from y0 to y1, then an arch `rise` high. */
function arch(z0: number, z1: number, y0: number, y1: number, rise: number, n = 8): [number, number][] {
  const pts: [number, number][] = [[z0, y0], [z1, y0]];
  for (let i = 0; i <= n; i++) pts.push([(z0 + z1) / 2 + ((z1 - z0) / 2) * Math.cos((i / n) * Math.PI), y1 + rise * Math.sin((i / n) * Math.PI)]);
  return pts;
}
interface BenchOpts {
  kind: 'park' | 'flat' | 'metal' | 'concrete' | 'ad';
  len?: number;
  /** Slat finish; concrete benches get a timber top when set. */
  slats?: string;
  frame?: string;
  /** Armrests: 0, 2 (ends) or 3. */
  arms?: number;
  back?: boolean;
  ad?: string;
  sheet?: string;
  conc?: string;
}
function bench(b: MeshBuilder, f: Pose, o: BenchOpts): void {
  const len = o.kind === 'ad' ? 1.9 : (o.len ?? 1.8);
  const frame = o.frame ?? P('black');
  const slats = F(`slats-${o.slats ?? 'new'}`);
  const conc = o.conc ?? 'concrete/walk-plain';
  const back = o.back ?? (o.kind === 'park' || o.kind === 'metal');
  const n = len > 2.1 ? 3 : 2;
  const arms = o.arms ?? 2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * (len - 0.24);
    const p = (z: number, y: number): V3 => at(f, x, y, z);
    if (o.kind === 'park' || o.kind === 'metal') {
      pipe(b, frame, [p(0.27, 0), p(0.22, 0.41), p(-0.2, 0.41), ...(back ? [p(-0.3, 0.88)] : [])], 0.02, 6);
      pipe(b, frame, [p(-0.2, 0.41), p(-0.3, 0)], 0.02, 6);
      const arm = arms === 3 || (arms === 2 && (i === 0 || i === n - 1));
      if (arm && back) pipe(b, frame, [p(-0.25, 0.66), p(0.2, 0.66), p(0.25, 0.6), p(0.22, 0.41)], 0.016, 6);
      else if (arm) pipe(b, frame, [p(-0.2, 0.41), p(-0.2, 0.63), p(0.22, 0.63), p(0.22, 0.41)], 0.016, 6);
    } else if (o.kind === 'flat') {
      for (const z of [-0.17, 0.17]) box(b, frame, f, [x, 0.2, z], [0.02, 0.2, 0.02]);
      box(b, frame, f, [x, 0.415, 0], [0.02, 0.015, 0.21]);
    } else if (o.kind === 'concrete') {
      box(b, conc, f, [x, 0.2, 0], [0.07, 0.2, 0.2], 'Y');
    } else {
      prism(b, conc, f, [[-0.3, 0], [0.27, 0], [0.27, 0.4], [-0.18, 0.43], [-0.29, 0.92], [-0.36, 0.92]], x - 0.05, x + 0.05);
    }
  }
  if (o.kind === 'metal') {
    const sheet = F(o.sheet ?? 'perforated-black');
    box(b, sheet, f, [0, 0.435, 0.01], [len / 2, 0.006, 0.22]);
    if (back) box(b, sheet, tilt(move(f, 0, 0.47, -0.2), -12), [0, 0.21, 0], [len / 2, 0.19, 0.006]);
    const rails: [number, number][] = [[0.435, 0.235], [0.435, -0.21]];
    if (back) rails.push([0.88, -0.3]);
    for (const [y, z] of rails) b.tube(frame, at(f, -len / 2, y, z), at(f, len / 2, y, z), 0.018, 6, 0.018, true);
    return;
  }
  if (o.kind === 'concrete') box(b, conc, f, [0, 0.45, 0], [len / 2, 0.05, 0.24]);
  if (o.kind !== 'concrete' || o.slats) {
    const y = o.kind === 'concrete' ? 0.516 : 0.445;
    for (let i = 0; i < 5; i++) board(b, slats, f, [0, y, -0.18 + i * 0.1], len, 0.085, 0.03);
  }
  if (back && o.kind === 'park') for (let i = 0; i < 3; i++) board(b, slats, f, [0, 0.6 + i * 0.105, -0.208 - i * 0.0225], len, 0.085, 0.028, true);
  if (o.kind === 'ad') panel(b, F(`bench-ad-${o.ad ?? 'blank'}`), F(`bench-ad-${o.ad ?? 'blank'}`), F('coat-cream'), tilt(move(f, 0, 0.47, -0.19), -12), [0, 0.22, 0], 1.8, 0.5, 0.012);
}
function picnic(b: MeshBuilder, f: Pose, slats: string, frame: string, len = 1.8): void {
  for (let i = 0; i < 7; i++) board(b, slats, f, [0, 0.74, -0.33 + i * 0.11], len, 0.1, 0.035);
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) board(b, slats, f, [0, 0.44, s * (0.62 + i * 0.12)], len, 0.11, 0.035);
  for (const x of [-len / 2 + 0.3, len / 2 - 0.3]) {
    for (const s of [-1, 1]) b.tube(frame, at(f, x, 0, s * 0.72), at(f, x, 0.72, s * -0.2), 0.028, 6, 0.028, true);
    b.tube(frame, at(f, x, 0.41, -0.76), at(f, x, 0.41, 0.76), 0.025, 6, 0.025, true);
    b.tube(frame, at(f, x, 0.71, -0.36), at(f, x, 0.71, 0.36), 0.025, 6, 0.025, true);
  }
}

// --- Bins. ---

const DARK = 'furniture/bag-black';
const CORNERS: [number, number][] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
/** Heap of litter rising out of an opening of radius r at height y. */
function rubbish(b: MeshBuilder, f: Pose, y: number, r: number): void {
  ball(b, F('litter'), f, y, r, 10, 0.6, 0.5, 1);
}
/** Tied refuse sack sitting on the ground. */
function sack(b: MeshBuilder, f: Pose, r = 0.26): void {
  ball(b, DARK, f, r * 0.78, r, 14, 0.78);
  lathe(b, DARK, f, [[0.03, r * 1.5], [0.012, r * 1.57], [0.05, r * 1.7]], 6);
}
type BinKind = 'mesh' | 'post' | 'drum' | 'concrete' | 'hood' | 'dome' | 'solar' | 'slat';
interface BinOpts {
  kind: BinKind;
  tex: string;
  /** Lid, hood or trim material. */
  lid?: string;
  label?: string;
  full?: boolean;
}
function bin(b: MeshBuilder, f: Pose, o: BinOpts): void {
  const lid = o.lid ?? BLACK;
  const label = (y: number, z: number, s = 0.3): void => {
    if (o.label) face(b, F(`label-${o.label}`), f, [0, y, z], s, s);
  };
  if (o.kind === 'mesh' || o.kind === 'post') {
    const post = o.kind === 'post';
    const g = post ? move(f, 0, 0.52, 0.2) : f;
    const [r0, r1, h] = post ? [0.13, 0.17, 0.5] : [0.21, 0.27, 0.85];
    if (post) {
      pole(b, f, { h: 1.1, r0: 0.03, tex: lid, base: 'plate', cap: 'ball' });
      for (const y of [0.62, 0.95]) box(b, lid, f, [0, y, 0.04], [0.02, 0.015, 0.04]);
    }
    lathe(b, o.tex, g, [[0, 0.04], [r0, 0.04], [r1, h]], 14);
    lathe(b, DARK, g, [[0, h * 0.45], [r1 - 0.012, h - 0.01]], 14);
    hoop(b, lid, g, h, r1, 0.014);
    hoop(b, lid, g, 0.04, r0, 0.012);
    if (o.full) rubbish(b, g, h - 0.02, r1 - 0.02);
  } else if (o.kind === 'drum') {
    lathe(b, o.tex, f, [[0, 0], [0.28, 0], [0.29, 0.02], [0.29, 0.28], [0.3, 0.3], [0.29, 0.32], [0.29, 0.58], [0.3, 0.6], [0.29, 0.62], [0.29, 0.86], [0.295, 0.88], [0.28, 0.88]], 16);
    lathe(b, DARK, f, [[0, 0.45], [0.28, 0.87]], 16);
    if (o.full) rubbish(b, f, 0.86, 0.27);
  } else if (o.kind === 'concrete') {
    lathe(b, o.tex, f, [[0.3, 0], [0.33, 0.05], [0.33, 0.8], [0.31, 0.84]], 16);
    lathe(b, lid, f, [[0.32, 0.84], [0.31, 0.9], [0.14, 1.0], [0.14, 1.02], [0.12, 1.02]], 16);
    lathe(b, DARK, f, [[0, 0.9], [0.12, 1.02]], 12);
    if (o.full) rubbish(b, f, 1.0, 0.13);
  } else if (o.kind === 'hood') {
    box(b, o.tex, f, [0, 0.45, 0], [0.27, 0.4, 0.27]);
    for (const [sx, sz] of CORNERS) box(b, lid, f, [sx * 0.255, 0.5, sz * 0.255], [0.02, 0.5, 0.02]);
    box(b, lid, f, [0, 1.03, 0], [0.3, 0.03, 0.3]);
    box(b, lid, f, [0, 1.075, 0], [0.2, 0.015, 0.2], 'Y');
    box(b, DARK, f, [0, 0.856, 0], [0.25, 0.005, 0.25], 'Y');
    label(0.5, 0.272);
    if (o.full) rubbish(b, f, 0.86, 0.22);
  } else if (o.kind === 'dome') {
    lathe(b, o.tex, f, [[0.24, 0], [0.27, 0.04], [0.28, 0.08], [0.28, 0.8]], 16);
    ball(b, o.lid ?? o.tex, f, 0.8, 0.28, 16, 0.75, 0.5, 1);
    box(b, DARK, f, [0, 0.9, 0.2], [0.11, 0.06, 0.05]);
    label(0.5, 0.284, 0.2);
    if (o.full) rubbish(b, move(f, 0, 0, 0.23), 0.9, 0.1);
  } else if (o.kind === 'solar') {
    box(b, o.tex, f, [0, 0.62, 0], [0.32, 0.58, 0.33]);
    for (const sx of [-1, 1]) box(b, BLACK, f, [sx * 0.26, 0.02, 0], [0.04, 0.02, 0.3]);
    face(b, 'signal/solar-panel', { o: at(f, 0, 1.202, 0), x: f.x, y: neg(f.z), z: f.y }, [0, 0, 0], 0.56, 0.56);
    box(b, BLACK, f, [0, 0.98, 0.34], [0.24, 0.035, 0.02]);
    box(b, lid, f, [0, 0.86, 0.335], [0.27, 0.1, 0.008]);
    label(0.5, 0.332);
  } else {
    box(b, o.tex, f, [0, 0.46, 0], [0.26, 0.4, 0.26], 'Yy');
    for (const [sx, sz] of CORNERS) box(b, lid, f, [sx * 0.265, 0.45, sz * 0.265], [0.02, 0.45, 0.02]);
    box(b, lid, f, [0, 0.88, 0], [0.29, 0.02, 0.29], 'Y');
    box(b, DARK, f, [0, 0.9, 0], [0.2, 0.004, 0.2], 'Y');
    if (o.full) rubbish(b, f, 0.9, 0.18);
  }
}
/** Wheeled household refuse cart. */
function cart(b: MeshBuilder, f: Pose, tex: string, lid = tex): void {
  prism(b, tex, f, [[-0.26, 0.1], [0.2, 0.1], [0.27, 0.95], [-0.3, 0.95]], -0.26, 0.26);
  prism(b, lid, f, [[-0.34, 0.95], [0.3, 0.95], [0.3, 1.0], [-0.34, 1.03]], -0.29, 0.29);
  for (const s of [-1, 1]) lathe(b, F('tire'), roll(move(f, s * 0.27, 0.12, -0.24), -90), [[0, -0.03], [0.12, -0.03], [0.12, 0.03], [0, 0.03]], 12);
  b.tube(lid, at(f, -0.24, 1.0, -0.37), at(f, 0.24, 1.0, -0.37), 0.015, 6, 0.015, true);
}
function dumpster(b: MeshBuilder, f: Pose, tex: string, open = false): void {
  prism(b, tex, f, [[-0.75, 0.16], [0.72, 0.16], [0.9, 1.08], [-0.75, 1.36]], -1, 1);
  for (const s of [-1, 1]) {
    if (open && s === 1) {
      prism(b, F('litter'), f, [[-0.72, 1.36], [0.87, 1.085], [0.87, 1.13], [-0.72, 1.41]], 0.03, 0.97);
      box(b, BLACK, f, [0.5, 0.92, -0.78], [0.5, 0.44, 0.02]);
    } else prism(b, BLACK, f, [[-0.78, 1.37], [0.94, 1.09], [0.94, 1.13], [-0.78, 1.41]], s === 1 ? 0.02 : -1.02, s === 1 ? 1.02 : -0.02);
  }
  for (const s of [-1, 1]) box(b, tex, f, [s * 1.06, 0.8, 0.05], [0.06, 0.07, 0.45]);
  box(b, tex, f, [0, 1.06, 0.92], [1.0, 0.03, 0.03]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(b, BLACK, roll(move(f, sx * 0.85 - 0.03, 0.08, sz * 0.6), -90), [[0, 0], [0.08, 0], [0.08, 0.06], [0, 0.06]], 8);
}

// --- Hydrants. ---

interface HydrantOpts {
  body: string;
  /** Bonnet and nozzle cap colour. */
  cap?: string;
  /** Wet-barrel pattern: squat, each outlet with its own valve. */
  wet?: boolean;
  /** Guard posts around it. */
  posts?: number;
  lean?: number;
}
function hydrant(b: MeshBuilder, f0: Pose, o: HydrantOpts): void {
  const f = o.lean ? roll(f0, o.lean) : f0;
  const body = F(`enamel-${o.body}`);
  const cap = F(`enamel-${o.cap ?? o.body}`);
  const nozzle = (g: Pose, r: number, from: number, len: number): void => {
    lathe(b, body, g, [[r, from], [r, from + len]], 10);
    lathe(b, cap, g, [[r * 1.3, from + len], [r * 1.3, from + len + 0.045], [r * 0.6, from + len + 0.055], [r * 0.6, from + len + 0.085], [0, from + len + 0.085]], 8);
  };
  const stem: [number, number][] = [[0.035, 0.09], [0.035, 0.15], [0.02, 0.15], [0.02, 0.19], [0, 0.19]];
  lathe(b, body, f, [[0.17, 0], [0.17, 0.035], [0.105, 0.05]], 12);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    b.tube(ZINC, at(f, 0.14 * Math.cos(a), 0.035, 0.14 * Math.sin(a)), at(f, 0.14 * Math.cos(a), 0.06, 0.14 * Math.sin(a)), 0.012, 6, 0.012, true);
  }
  if (o.wet) {
    lathe(b, body, f, [[0.105, 0.05], [0.105, 0.44], [0.125, 0.46], [0.125, 0.5], [0.1, 0.55], [0.055, 0.6], [0, 0.615]], 12);
    nozzle(tilt(move(f, 0, 0.3, 0), 90), 0.07, 0.08, 0.08);
    nozzle(roll(move(f, 0, 0.42, 0), -90), 0.05, 0.08, 0.07);
    lathe(b, cap, tilt(move(f, 0, 0.3, 0), -90), stem, 5);
    lathe(b, cap, roll(move(f, 0, 0.42, 0), 90), stem, 5);
  } else {
    lathe(b, body, f, [[0.105, 0.05], [0.095, 0.42], [0.13, 0.44], [0.13, 0.47], [0.11, 0.5], [0.115, 0.66], [0.135, 0.68], [0.135, 0.71]], 12);
    lathe(b, cap, f, [[0.135, 0.71], [0.125, 0.76], [0.07, 0.84], [0.035, 0.86]], 12);
    lathe(b, cap, f, [[0.03, 0.86], [0.03, 0.91], [0, 0.91]], 5);
    nozzle(tilt(move(f, 0, 0.58, 0), 90), 0.075, 0.08, 0.08);
    for (const s of [-1, 1]) nozzle(roll(move(f, 0, 0.58, 0), s * 90), 0.052, 0.08, 0.07);
  }
  const spots: [number, number][] = [[-0.8, 0.55], [0.8, 0.55], [-0.8, -0.55], [0.8, -0.55]];
  for (let i = 0; i < (o.posts ?? 0); i++) bollard(b, move(f0, spots[i][0], 0, spots[i][1]), { kind: 'pipe', band: 'bollard-band' });
}

// --- Mailboxes. ---

function mailbox(b: MeshBuilder, f0: Pose, o: { old?: boolean; tagged?: boolean; lean?: number } = {}): void {
  const f = o.lean ? roll(f0, o.lean) : f0;
  const body = F(o.old ? 'coat-mail-blue-old' : 'coat-mail-blue');
  for (const [sx, sz] of CORNERS) box(b, body, f, [sx * 0.2, 0.14, sz * 0.2], [0.025, 0.14, 0.025]);
  prism(b, body, f, arch(-0.27, 0.27, 0.28, 1.03, 0.25), -0.25, 0.25);
  face(b, F('mail-front'), f, [0, 0.655, 0.271], 0.5, 0.75);
  for (const s of [-1, 1]) sideFace(b, F(o.tagged && s === 1 ? 'mail-side-tagged' : 'mail-side'), f, s * 0.251, 0.655, 0, 0.5, 0.75);
  box(b, body, f, [0, 1.12, 0.25], [0.2, 0.012, 0.035]);
}
function relayBox(b: MeshBuilder, f: Pose): void {
  pole(b, f, { h: 0.5, r0: 0.07, tex: F('coat-relay-green'), base: 'plate', cap: 'none' });
  box(b, F('coat-relay-green'), f, [0, 0.95, 0], [0.3, 0.45, 0.24]);
  face(b, F('relay-front'), f, [0, 0.95, 0.241], 0.6, 0.9);
}
/** Kerbside letter box on a post; its door faces +z. */
function curbBox(b: MeshBuilder, f0: Pose, tex: string, o: { lean?: number; post?: string; flagUp?: boolean } = {}): void {
  const f = o.lean ? roll(f0, o.lean) : f0;
  pole(b, f, { h: 1.0, r0: 0.05, tex: o.post ?? P('wood'), base: 'buried', cap: 'flat', sides: 4 });
  box(b, o.post ?? P('wood'), f, [0, 1.02, 0.1], [0.06, 0.02, 0.26]);
  prism(b, tex, { o: at(f, 0, 1.04, 0.1), x: f.z, y: f.y, z: neg(f.x) }, arch(-0.085, 0.085, 0, 0.12, 0.085, 6), -0.24, 0.24);
  const g = o.flagUp ? move(f, 0.09, 1.12, 0.2) : tilt(move(f, 0.09, 1.12, 0.2), 90);
  box(b, 'structure/steel-red', g, [0, 0.09, 0], [0.003, 0.09, 0.008]);
  box(b, 'structure/steel-red', g, [0, 0.16, 0.03], [0.003, 0.03, 0.035]);
}

// --- Parking meters. ---

function meterHead(b: MeshBuilder, f: Pose, front: string, body: string): void {
  lathe(b, body, f, [[0.03, 0], [0.045, 0.04], [0.045, 0.07]], 8);
  const outline: [number, number][] = [[-0.08, 0], [0.08, 0], [0.08, 0.2]];
  for (let i = 1; i < 6; i++) outline.push([0.08 * Math.cos((i / 6) * Math.PI), 0.2 + 0.06 * Math.sin((i / 6) * Math.PI)]);
  outline.push([-0.08, 0.2]);
  prism(b, body, { o: at(f, 0, 0.07, 0), x: neg(f.z), y: f.y, z: f.x }, outline, -0.05, 0.05, front, F('meter-back'));
}
interface MeterOpts {
  face?: string;
  twin?: boolean;
  lean?: number;
  /** Bike hitch ring on the post. */
  hitch?: boolean;
  /** Out of service: the head is bagged. */
  bagged?: boolean;
  tex?: string;
}
function parkingMeter(b: MeshBuilder, f0: Pose, o: MeterOpts = {}): void {
  const f = o.lean ? roll(f0, o.lean) : f0;
  const tex = o.tex ?? P('grey');
  pole(b, f, { h: 1.05, r0: 0.03, tex, base: 'plate', cap: 'none' });
  if (o.twin) box(b, tex, f, [0, 1.06, 0], [0.13, 0.02, 0.025]);
  for (const x of o.twin ? [-0.11, 0.11] : [0]) {
    const g = move(f, x, o.twin ? 1.07 : 1.05, 0);
    if (o.bagged) box(b, DARK, g, [0, 0.17, 0], [0.095, 0.17, 0.065]);
    else meterHead(b, g, F(`meter-${o.face ?? 'dial'}`), tex);
  }
  if (o.hitch) {
    const pts: V3[] = [];
    for (let i = 0; i <= 16; i++) pts.push(at(f, 0.2 * Math.cos((i / 16) * Math.PI * 2), 0.72 + 0.2 * Math.sin((i / 16) * Math.PI * 2), 0));
    pipe(b, BLACK, pts, 0.016, 6, false);
  }
}
function payStation(b: MeshBuilder, f: Pose, kind: 'grey' | 'green' | 'off', solar = false): void {
  const tex = kind === 'green' ? P('green') : P('grey');
  footing(b, tex, f, 0.16);
  box(b, tex, f, [0, 0.3, 0], [0.1, 0.27, 0.08]);
  box(b, tex, f, [0, 1.02, 0], [0.2, 0.45, 0.14]);
  face(b, F(`paystation-${kind}`), f, [0, 1.02, 0.141], 0.4, 0.9);
  box(b, tex, f, [0, 1.49, 0.02], [0.22, 0.02, 0.18]);
  if (solar) {
    b.tube(tex, at(f, 0, 1.5, -0.08), at(f, 0, 2.1, -0.08), 0.02, 6);
    const g = tilt(move(f, 0, 2.12, -0.08), -58);
    box(b, tex, g, [0, 0, 0], [0.25, 0.25, 0.012], 'z');
    face(b, 'signal/solar-panel', g, [0, 0, 0.012], 0.5, 0.5);
  }
}

// --- Bollards. ---

type BollardKind = 'pipe' | 'fat' | 'cast' | 'steel' | 'dome' | 'sphere' | 'wood' | 'lit' | 'block';
interface BollardOpts {
  kind: BollardKind;
  tex?: string;
  band?: string;
  lean?: number;
  off?: boolean;
}
/** Returns the height at which a chain would be hung. */
function bollard(b: MeshBuilder, f0: Pose, o: BollardOpts): number {
  const f = o.lean ? roll(f0, o.lean) : f0;
  const tex = o.tex ?? F('enamel-yellow');
  const band = (r: number, y0: number, y1: number): void => {
    if (o.band) lathe(b, F(o.band), f, [[r, y0], [r, y1]], 12);
  };
  switch (o.kind) {
    case 'pipe':
      lathe(b, tex, f, [[0.057, 0], [0.057, 1.0], [0.045, 1.035], [0, 1.05]], 10);
      band(0.0585, 0.72, 0.92);
      return 0.9;
    case 'fat':
      lathe(b, tex, f, [[0.085, 0], [0.085, 1.0]], 12);
      lathe(b, 'concrete/walk-plain', f, [[0.08, 1.0], [0.06, 1.035], [0, 1.05]], 12);
      band(0.0865, 0.7, 0.9);
      return 0.9;
    case 'cast':
      lathe(b, tex, f, [[0.11, 0], [0.11, 0.08], [0.08, 0.12], [0.07, 0.6], [0.085, 0.63], [0.085, 0.67], [0.065, 0.7], [0.06, 0.82], [0.075, 0.85], [0.05, 0.9], [0.03, 0.92]], 10);
      ball(b, tex, f, 0.975, 0.06, 8);
      return 0.76;
    case 'steel':
      lathe(b, o.tex ?? F('coat-stainless'), f, [[0.07, 0], [0.07, 0.015], [0.05, 0.02], [0.05, 0.9], [0.045, 0.91], [0, 0.91]], 14);
      band(0.0515, 0.76, 0.84);
      return 0.8;
    case 'dome':
      ball(b, o.tex ?? 'concrete/walk-exposed', f, 0, 0.32, 14, 1, 0.5, 1);
      return 0.3;
    case 'sphere':
      lathe(b, o.tex ?? 'structure/wall-smooth', f, [[0.17, 0], [0.19, 0.05], [0.12, 0.07]], 14);
      ball(b, o.tex ?? 'structure/wall-smooth', f, 0.31, 0.27, 14);
      return 0.5;
    case 'wood':
      lathe(b, o.tex ?? P('wood'), f, [[0.09, 0], [0.09, 0.72], [0.065, 0.8], [0, 0.8]], 8);
      return 0.62;
    case 'lit': {
      const body = o.tex ?? P('black');
      lathe(b, body, f, [[0.08, 0], [0.08, 0.68]], 12);
      lathe(b, o.off ? 'signal/lamp-led-off' : F('led-strip-on'), f, [[0.072, 0.68], [0.072, 0.84]], 12);
      lathe(b, body, f, [[0.085, 0.84], [0.085, 0.88], [0, 0.92]], 12);
      return 0.6;
    }
    default:
      box(b, o.tex ?? 'concrete/walk-plain', f, [0, 0.36, 0], [0.13, 0.36, 0.13], 'Y');
      lathe(b, o.tex ?? 'concrete/walk-plain', turn(f, 45), [[0.184, 0.72], [0.12, 0.78], [0, 0.78]], 4);
      return 0.6;
  }
}
/** Bollards along x, optionally joined by chains, ropes or rails. */
function bollards(b: MeshBuilder, n: number, gap: number, o: (i: number) => BollardOpts, link?: 'chain' | 'rope' | 'rail'): void {
  let last: V3 | null = null;
  for (let i = 0; i < n; i++) {
    const f = stand([(i - (n - 1) / 2) * gap, 0, 0]);
    const top = at(f, 0, bollard(b, f, o(i)), 0);
    if (last && link) pipe(b, link === 'rope' ? F('coat-cream') : BLACK, catenary(last, top, link === 'rail' ? 0 : gap * 0.09, link === 'rail' ? 1 : 8), link === 'rail' ? 0.022 : 0.012, 5, false);
    last = top;
  }
}

// --- Bus shelters. ---

/** Rectangle in the plane x = `x`, facing along +x (dir 1) or -x (dir -1). */
function faceX(b: MeshBuilder, material: string, f: Pose, x: number, cy: number, cz: number, w: number, h: number, dir: number): void {
  if (dir > 0) face(b, material, { o: f.o, x: neg(f.z), y: f.y, z: f.x }, [-cz, cy, x], w, h);
  else face(b, material, { o: f.o, x: f.z, y: f.y, z: neg(f.x) }, [cz, cy, -x], w, h);
}
interface ShelterOpts {
  len?: number;
  roof?: 'flat' | 'barrel' | 'tilt';
  frame?: string;
  roofTex?: string;
  /** Glazing of the back and end walls; null leaves the frame open. */
  glass?: string | null;
  /** Posters of the advertising box at the +x end (outside, inside). */
  ads?: [string, string];
  bench?: string;
  map?: boolean;
  /** Bus stop flag on its own post beside the shelter. */
  sign?: boolean;
}
function shelter(b: MeshBuilder, f: Pose, o: ShelterOpts = {}): void {
  const len = o.len ?? 4;
  const frame = o.frame ?? P('black');
  const glass = o.glass === undefined ? F('shelter-glass') : o.glass && F(o.glass);
  const [zb, zf, x0, x1] = [-0.65, 0.55, -len / 2, len / 2];
  for (const x of [x0, x1]) for (const z of [zb, zf]) box(b, frame, f, [x, 1.2, z], [0.04, 1.2, 0.04]);
  const n = Math.max(1, Math.round(len / 1.3));
  for (let i = 0; i < n; i++) {
    const w = len / n;
    if (i) box(b, frame, f, [x0 + i * w, 1.2, zb], [0.025, 1.2, 0.025]);
    if (glass) both(b, glass, f, [x0 + (i + 0.5) * w, 1.225, zb], w - 0.07, 1.95);
  }
  for (const y of [0.22, 2.23]) box(b, frame, f, [0, y, zb], [len / 2, 0.03, 0.025]);
  // End wall on -x, advertising box (or a second end wall) on +x.
  for (const y of [0.22, 2.23]) box(b, frame, f, [x0, y, -0.05], [0.025, 0.03, 0.6]);
  if (glass) for (const d of [1, -1]) faceX(b, glass, f, x0, 1.225, -0.05, 1.1, 1.95, d);
  if (o.ads) {
    box(b, frame, f, [x1, 1.25, -0.05], [0.07, 0.95, 0.65]);
    faceX(b, F(`poster-${o.ads[0]}`), f, x1 + 0.072, 1.25, -0.05, 1.2, 1.75, 1);
    faceX(b, F(`poster-${o.ads[1]}`), f, x1 - 0.072, 1.25, -0.05, 1.2, 1.75, -1);
  } else {
    for (const y of [0.22, 2.23]) box(b, frame, f, [x1, y, -0.05], [0.025, 0.03, 0.6]);
    if (glass) for (const d of [1, -1]) faceX(b, glass, f, x1, 1.225, -0.05, 1.1, 1.95, d);
  }
  const roof = o.roofTex ?? frame;
  if (o.roof === 'barrel') prism(b, roof, f, arch(-0.9, 0.85, 2.4, 2.43, 0.32, 10), x0 - 0.15, x1 + 0.15);
  else if (o.roof === 'tilt') box(b, roof, tilt(move(f, 0, 2.47, 0), -7), [0, 0, 0], [len / 2 + 0.15, 0.035, 0.95]);
  else box(b, roof, f, [0, 2.45, -0.02], [len / 2 + 0.15, 0.045, 0.88]);
  face(b, 'signal/lamp-led-on', { o: at(f, 0, 2.395, -0.1), x: f.x, y: f.z, z: neg(f.y) }, [0, 0, 0], Math.min(1.2, len * 0.4), 0.12);
  if (o.bench) {
    const bl = len - (o.ads ? 1.0 : 0.5);
    const bx = o.ads ? -0.25 : 0;
    for (let i = 0; i < 3; i++) board(b, F(`slats-${o.bench}`), f, [bx, 0.47, -0.5 + i * 0.1], bl, 0.085, 0.03);
    for (const s of [-1, 1]) box(b, frame, f, [bx + s * (bl / 2 - 0.25), 0.23, -0.42], [0.02, 0.225, 0.14]);
  }
  if (o.map) panel(b, F('transit-map'), frame, frame, f, [x0 + 0.6, 1.4, zb + 0.05], 0.6, 0.9, 0.015);
  if (o.sign) {
    const g = move(f, x0 - 0.6, 0, 0.45);
    pole(b, g, { h: 2.7, r0: 0.03, tex: P('galvanized'), base: 'plate', cap: 'dome' });
    plate(b, 'sign/bus-stop-blue', move(g, 0, 2.35, 0.035), [0, 0, 0]);
  }
}

// --- Newspaper boxes. ---

function newsBox(b: MeshBuilder, f0: Pose, colour: string, o: { lean?: number; empty?: boolean; low?: boolean } = {}): void {
  const f = o.lean ? roll(f0, o.lean) : f0;
  const body = F(o.empty ? 'enamel-red-old' : `enamel-${colour}`);
  const front = F(o.empty ? 'news-empty' : `news-${colour}`);
  if (o.low) {
    box(b, body, f, [0, 0.5, 0], [0.225, 0.5, 0.2], 'Y');
    face(b, front, f, [0, 0.69, 0.201], 0.45, 0.6);
    prism(b, body, f, [[-0.2, 1.0], [0.2, 1.0], [0.2, 1.02], [-0.2, 1.1]], -0.225, 0.225);
  } else {
    box(b, body, f, [0, 0.012, 0], [0.2, 0.012, 0.19], 'Y');
    box(b, body, f, [0, 0.29, 0], [0.06, 0.27, 0.06]);
    box(b, body, f, [0, 0.855, 0], [0.225, 0.3, 0.2], 'z');
    face(b, front, f, [0, 0.855, 0.2], 0.45, 0.6);
    box(b, body, f, [0, 1.167, 0.005], [0.235, 0.012, 0.215]);
  }
}

// --- Bike racks and bicycles. ---

function ringXY(f: Pose, cx: number, cy: number, r: number, n = 20): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) pts.push(at(f, cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2), 0));
  return pts;
}
function foot(b: MeshBuilder, tex: string, f: Pose): void {
  lathe(b, tex, f, [[0.07, 0], [0.07, 0.01], [0.03, 0.014]], 10);
}
/** Inverted-U stand in the pose's x-y plane. */
function uRack(b: MeshBuilder, f: Pose, tex: string, w = 0.6, h = 0.85): void {
  const pts: V3[] = [at(f, -w / 2, 0, 0)];
  for (let i = 0; i <= 10; i++) pts.push(at(f, -(w / 2) * Math.cos((i / 10) * Math.PI), h - w / 2 + (w / 2) * Math.sin((i / 10) * Math.PI), 0));
  pts.push(at(f, w / 2, 0, 0));
  pipe(b, tex, pts, 0.025, 8);
  for (const s of [-1, 1]) foot(b, tex, move(f, (s * w) / 2, 0, 0));
}
function waveRack(b: MeshBuilder, f: Pose, tex: string, humps: number): void {
  const pts: V3[] = [];
  const len = humps * 0.5;
  for (let i = 0; i <= humps * 12; i++) pts.push(at(f, (i / (humps * 12)) * len - len / 2, 0.43 - 0.43 * Math.cos((i / 12) * Math.PI * 2), 0));
  pipe(b, tex, pts, 0.025, 8);
  for (let i = 0; i <= humps; i++) foot(b, tex, move(f, i * 0.5 - len / 2, 0, 0));
}
function gridRack(b: MeshBuilder, f: Pose, tex: string, len: number): void {
  for (const y of [0.12, 0.78]) b.tube(tex, at(f, -len / 2, y, 0), at(f, len / 2, y, 0), 0.02, 6, 0.02, true);
  for (const s of [-1, 1]) {
    b.tube(tex, at(f, (s * len) / 2, 0, 0), at(f, (s * len) / 2, 0.78, 0), 0.02, 6);
    b.tube(tex, at(f, (s * len) / 2, 0.02, -0.3), at(f, (s * len) / 2, 0.02, 0.3), 0.02, 6, 0.02, true);
  }
  for (let x = -len / 2 + 0.14; x < len / 2 - 0.05; x += 0.14) b.tube(tex, at(f, x, 0.12, 0), at(f, x, 0.78, 0), 0.008, 5);
}
function ringRack(b: MeshBuilder, f: Pose, tex: string): void {
  pole(b, f, { h: 0.95, r0: 0.035, tex, base: 'plate', cap: 'dome' });
  pipe(b, tex, ringXY(f, 0, 0.62, 0.22), 0.016, 6, false);
}
/** Bicycle standing in the pose's x-y plane, front wheel towards +x. */
function bicycle(b: MeshBuilder, f: Pose, tex: string, o: { noFront?: boolean; noSeat?: boolean } = {}): void {
  const R = 0.34;
  const RIM = 'structure/steel-grey';
  const wheel = (x: number): void => {
    pipe(b, F('tire'), ringXY(f, x, R, R - 0.018), 0.018, 6, false);
    pipe(b, RIM, ringXY(f, x, R, R - 0.04), 0.006, 4, false);
    for (let i = 0; i < 10; i++) b.tube(RIM, at(f, x, R, 0), at(f, x + (R - 0.04) * Math.cos(i * 0.628), R + (R - 0.04) * Math.sin(i * 0.628), 0), 0.002, 3);
  };
  wheel(-0.5);
  if (!o.noFront) wheel(0.5);
  const bar = (a: [number, number], c: [number, number], r = 0.014, z = 0): void => b.tube(tex, at(f, a[0], a[1], z), at(f, c[0], c[1], z), r, 6, r, true);
  const [bb, seat, headTop, headBot]: [number, number][] = [[-0.08, 0.29], [-0.18, 0.8], [0.32, 0.88], [0.36, 0.7]];
  bar(bb, seat);
  bar(seat, headTop);
  bar(bb, headBot, 0.016);
  bar(headBot, [0.31, 0.93], 0.018);
  for (const z of [-0.04, 0.04]) {
    bar(seat, [-0.5, R], 0.008, z);
    bar(bb, [-0.5, R], 0.009, z);
    bar(headBot, [0.5, R], 0.01, z);
  }
  bar(seat, [-0.2, 0.9], 0.01);
  if (!o.noSeat) box(b, BLACK, f, [-0.22, 0.92, 0], [0.12, 0.02, 0.06]);
  b.tube(RIM, at(f, 0.31, 0.93, 0), at(f, 0.3, 1.0, 0), 0.011, 6);
  b.tube(RIM, at(f, 0.3, 1.0, -0.27), at(f, 0.3, 1.0, 0.27), 0.011, 6, 0.011, true);
  for (const z of [-0.24, 0.24]) b.tube(BLACK, at(f, 0.3, 1.0, z - 0.05), at(f, 0.3, 1.0, z + 0.05), 0.016, 6, 0.016, true);
  b.tube(RIM, at(f, bb[0], bb[1], -0.08), at(f, bb[0], bb[1], 0.08), 0.012, 6, 0.012, true);
  lathe(b, RIM, tilt(move(f, bb[0], bb[1], 0.045), 90), [[0, 0], [0.09, 0], [0.09, 0.004], [0, 0.004]], 12);
  b.tube(RIM, at(f, bb[0], bb[1], 0.08), at(f, bb[0] + 0.12, bb[1] - 0.12, 0.08), 0.008, 5);
  b.tube(RIM, at(f, bb[0], bb[1], -0.08), at(f, bb[0] - 0.12, bb[1] + 0.12, -0.08), 0.008, 5);
  box(b, BLACK, f, [bb[0] + 0.12, bb[1] - 0.12, 0.12], [0.045, 0.01, 0.035]);
  box(b, BLACK, f, [bb[0] - 0.12, bb[1] + 0.12, -0.12], [0.045, 0.01, 0.035]);
}

// --- Planters and tree pits. ---

/** Mound of foliage growing out of a container top of radius r at height y. */
function plant(b: MeshBuilder, f: Pose, y: number, r: number, tex: string, flat = 0.7): void {
  ball(b, F(tex), f, y, r, 12, flat, 0.45, 1);
}
type PlanterKind = 'bowl' | 'box' | 'pot' | 'trough' | 'wood' | 'tall' | 'barrel';
interface PlanterOpts {
  kind: PlanterKind;
  tex?: string;
  plant?: string;
  /** Scale of a pot. */
  size?: number;
}
function planter(b: MeshBuilder, f: Pose, o: PlanterOpts): void {
  const green = o.plant ?? 'shrub';
  const SOIL = 'ground/mulch';
  const up: Pose = { o: f.o, x: f.x, y: neg(f.z), z: f.y };
  if (o.kind === 'bowl') {
    lathe(b, o.tex ?? 'concrete/walk-exposed', f, [[0.42, 0], [0.45, 0.05], [0.58, 0.42], [0.6, 0.48], [0.56, 0.5]], 16);
    lathe(b, SOIL, f, [[0, 0.47], [0.56, 0.49]], 16);
    plant(b, f, 0.48, 0.5, green, 0.6);
  } else if (o.kind === 'box') {
    box(b, o.tex ?? 'structure/wall-smooth', f, [0, 0.3, 0], [0.45, 0.3, 0.45], 'Y');
    face(b, SOIL, up, [0, 0, 0.602], 0.8, 0.8);
    plant(b, f, 0.6, 0.42, green);
  } else if (o.kind === 'pot') {
    const s = o.size ?? 1;
    lathe(b, o.tex ?? F('terracotta'), f, [[0.16 * s, 0], [0.17 * s, 0.02 * s], [0.24 * s, 0.36 * s], [0.27 * s, 0.38 * s], [0.27 * s, 0.44 * s], [0.24 * s, 0.44 * s]], 14);
    lathe(b, SOIL, f, [[0, 0.41 * s], [0.24 * s, 0.42 * s]], 14);
    plant(b, f, 0.42 * s, 0.27 * s, green, 0.9);
  } else if (o.kind === 'trough') {
    box(b, o.tex ?? 'structure/wall-smooth', f, [0, 0.275, 0], [1.0, 0.275, 0.27], 'Y');
    face(b, SOIL, up, [0, 0, 0.552], 1.9, 0.44);
    if (green.startsWith('shrub')) box(b, F(green), f, [0, 0.83, 0], [0.93, 0.28, 0.2], 'Y');
    else for (let i = 0; i < 4; i++) plant(b, move(f, -0.69 + i * 0.46, 0, 0), 0.55, 0.24, green, 0.8);
  } else if (o.kind === 'wood') {
    box(b, o.tex ?? F('slats-new'), f, [0, 0.31, 0], [0.4, 0.29, 0.4], 'Yy');
    for (const [sx, sz] of CORNERS) box(b, P('black'), f, [sx * 0.405, 0.31, sz * 0.405], [0.02, 0.31, 0.02]);
    face(b, SOIL, up, [0, 0, 0.58], 0.8, 0.8);
    plant(b, f, 0.58, 0.38, green);
  } else if (o.kind === 'tall') {
    lathe(b, o.tex ?? 'structure/steel-corten', turn(f, 45), [[0.26, 0], [0.42, 0.9], [0.39, 0.9], [0.39, 0.86]], 4);
    face(b, SOIL, up, [0, 0, 0.87], 0.55, 0.55);
    plant(b, f, 0.87, 0.3, green, 1.1);
  } else {
    lathe(b, o.tex ?? F('slats-dark'), f, [[0.27, 0], [0.33, 0.2], [0.345, 0.4], [0.34, 0.42], [0.31, 0.42]], 16);
    for (const [y, r] of [[0.08, 0.3], [0.32, 0.345]]) lathe(b, BLACK, f, [[r, y], [r + 0.012, y + 0.035]], 16);
    lathe(b, SOIL, f, [[0, 0.39], [0.31, 0.4]], 16);
    plant(b, f, 0.4, 0.33, green, 0.8);
  }
}
/** Tree pit: grate (or mulch) flush with the walk, with an optional guard and young tree. */
function treePit(b: MeshBuilder, f: Pose, o: { grate?: 'round' | 'square'; guard?: string; tree?: boolean; stakes?: boolean }): void {
  const up: Pose = { o: f.o, x: f.x, y: neg(f.z), z: f.y };
  if (o.grate) {
    box(b, 'structure/steel-black', f, [0, 0.006, 0], [0.62, 0.006, 0.62], 'Yy');
    face(b, F(`grate-${o.grate}`), up, [0, 0, 0.0125], 1.2, 1.2);
  } else {
    for (const s of [-1, 1]) {
      box(b, 'structure/brick-red', f, [0, 0.04, s * 0.66], [0.71, 0.04, 0.05], 'Y');
      box(b, 'structure/brick-red', f, [s * 0.66, 0.04, 0], [0.05, 0.04, 0.61], 'Y');
    }
    face(b, 'ground/mulch', up, [0, 0, 0.03], 1.22, 1.22);
  }
  if (o.tree) {
    lathe(b, P('wood-grey'), f, [[0.06, 0], [0.045, 1.2], [0.035, 2.6], [0, 3.2]], 8);
    ball(b, F('shrub'), f, 3.2, 0.8, 12, 1.1);
    ball(b, F('shrub'), move(f, 0.38, 0, 0.2), 3.55, 0.55, 10);
    ball(b, F('shrub'), move(f, -0.32, 0, -0.26), 3.45, 0.6, 10, 0.9);
    for (const a of [0.4, 2.3, 4.4]) pipe(b, P('wood-grey'), [at(f, 0, 2.5, 0), at(f, 0.5 * Math.cos(a), 3.1, 0.5 * Math.sin(a))], 0.018, 5);
  }
  if (o.stakes) {
    for (const s of [-1, 1]) {
      lathe(b, F('slats-new'), move(f, s * 0.35, 0, 0), [[0.03, 0], [0.03, 1.5], [0, 1.5]], 6);
      b.tube(BLACK, at(f, s * 0.35, 1.35, 0), at(f, 0, 1.3, 0), 0.008, 4);
    }
  }
  if (o.guard) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pipe(b, o.guard, [at(f, 0.28 * Math.cos(a), 0, 0.28 * Math.sin(a)), at(f, 0.28 * Math.cos(a), 1.35, 0.28 * Math.sin(a)), at(f, 0.36 * Math.cos(a), 1.6, 0.36 * Math.sin(a))], 0.009, 5);
    }
    for (const y of [0.25, 0.8, 1.35]) hoop(b, o.guard, f, y, 0.28, 0.012);
  }
}

// --- Phones, utilities and advertising. ---

function fountain(b: MeshBuilder, f: Pose, kind: 'pedestal' | 'arm' | 'dual', tex: string): void {
  const bowl = (g: Pose): void => {
    lathe(b, F('coat-stainless'), g, [[0.1, -0.08], [0.2, 0], [0.18, 0], [0.05, -0.05], [0, -0.05]], 14);
    pipe(b, F('coat-stainless'), [at(g, 0.13, 0, 0), at(g, 0.13, 0.06, 0), at(g, 0.07, 0.07, 0)], 0.012, 6);
  };
  if (kind === 'pedestal') {
    lathe(b, tex, f, [[0.2, 0], [0.16, 0.05], [0.14, 0.78], [0.2, 0.84]], 14);
    bowl(move(f, 0, 0.92, 0));
  } else {
    box(b, tex, f, [0, 0.5, -0.1], [0.15, 0.5, 0.08], 'Y');
    box(b, tex, f, [0, 0.82, 0.1], [0.08, 0.05, 0.14]);
    bowl(move(f, 0, 0.92, 0.26));
    if (kind === 'dual') {
      box(b, tex, f, [0.4, 0.4, -0.1], [0.12, 0.4, 0.08], 'Y');
      box(b, tex, f, [0.4, 0.62, 0.1], [0.07, 0.05, 0.14]);
      bowl(move(f, 0.4, 0.72, 0.26));
    }
  }
}
/** Pay phone in a hooded enclosure on a pedestal. */
function payphone(b: MeshBuilder, f: Pose, front: string, tex: string): void {
  pole(b, f, { h: 1.05, r0: 0.05, tex, base: 'plate', cap: 'none' });
  box(b, tex, f, [0, 1.45, -0.09], [0.24, 0.4, 0.015]);
  for (const s of [-1, 1]) box(b, tex, f, [s * 0.225, 1.45, 0.03], [0.015, 0.4, 0.12]);
  box(b, tex, f, [0, 1.86, 0.04], [0.26, 0.015, 0.15]);
  box(b, tex, f, [0, 1.06, 0.03], [0.24, 0.015, 0.12]);
  box(b, 'signal/housing-black', f, [0, 1.42, -0.03], [0.15, 0.25, 0.045], 'z');
  face(b, F(front), f, [0, 1.42, 0.016], 0.3, 0.5);
  panel(b, F('phone-sign'), F('phone-sign'), tex, f, [0, 1.97, 0.04], 0.5, 0.15, 0.02);
}
function phoneBooth(b: MeshBuilder, f: Pose, tex: string, glass: string): void {
  for (const [sx, sz] of CORNERS) box(b, tex, f, [sx * 0.43, 1.1, sz * 0.43], [0.025, 1.1, 0.025]);
  box(b, tex, f, [0, 2.26, 0], [0.48, 0.06, 0.48]);
  box(b, 'concrete/walk-plain', f, [0, 0.02, 0], [0.47, 0.02, 0.47], 'Y');
  for (const d of [1, -1]) {
    faceX(b, F(glass), f, 0.43, 1.12, 0, 0.82, 2.1, d);
    faceX(b, F(glass), f, -0.43, 1.12, 0, 0.82, 2.1, d);
  }
  both(b, F(glass), f, [0, 1.12, -0.43], 0.82, 2.1);
  for (let k = 0; k < 4; k++) face(b, F('phone-sign'), turn(f, k * 90), [0, 2.26, 0.481], 0.6, 0.11);
  box(b, 'signal/housing-black', f, [0, 1.35, -0.36], [0.15, 0.25, 0.045], 'z');
  face(b, F('payphone'), f, [0, 1.35, -0.314], 0.3, 0.5);
  box(b, tex, f, [0, 1.0, -0.3], [0.3, 0.012, 0.1]);
}
function callBox(b: MeshBuilder, f: Pose, tex: string): void {
  pole(b, f, { h: 1.25, r0: 0.05, tex, base: 'cast', cap: 'none' });
  box(b, tex, f, [0, 1.5, 0], [0.15, 0.25, 0.09], 'z');
  face(b, F('callbox'), f, [0, 1.5, 0.09], 0.3, 0.5);
  lathe(b, tex, f, [[0.16, 1.75], [0.12, 1.8], [0.05, 1.83]], 4);
  ball(b, F('led-strip-on'), f, 1.87, 0.05, 8);
}
function padTransformer(b: MeshBuilder, f: Pose, front: string, posts = 0): void {
  box(b, 'concrete/walk-square', f, [0, 0.05, 0], [0.78, 0.05, 0.68], 'Y');
  box(b, F('coat-transformer-green'), f, [0, 0.6, 0], [0.6, 0.5, 0.5], 'zY');
  face(b, F(front), f, [0, 0.6, 0.5], 1.2, 1.0);
  box(b, F('coat-transformer-green'), f, [0, 1.11, 0.02], [0.63, 0.012, 0.55]);
  for (let i = 0; i < 9; i++) box(b, F('coat-transformer-green'), f, [-0.48 + i * 0.12, 0.6, -0.56], [0.008, 0.38, 0.06]);
  for (let i = 0; i < posts; i++) bollard(b, move(f, (i - (posts - 1) / 2) * 1.1, 0, 1.0), { kind: 'pipe', band: 'bollard-band' });
}
/** Backflow preventer: a loop of pipe out of the ground with two gate valves. */
function backflow(b: MeshBuilder, f: Pose, tex: string, cage = false): void {
  const r = 0.05;
  pipe(b, tex, [at(f, -0.5, 0, 0), at(f, -0.5, 0.42, 0), at(f, -0.42, 0.5, 0), at(f, 0.42, 0.5, 0), at(f, 0.5, 0.42, 0), at(f, 0.5, 0, 0)], r, 10);
  lathe(b, tex, roll(move(f, -0.14, 0.5, 0), -90), [[r, 0], [0.085, 0.02], [0.085, 0.26], [r, 0.28]], 10);
  for (const x of [-0.3, 0.3]) {
    lathe(b, tex, move(f, x, 0.5, 0), [[0.07, -0.06], [0.07, 0.06], [0.03, 0.1], [0.012, 0.11], [0.012, 0.24]], 8);
    hoop(b, 'structure/steel-red', move(f, x, 0, 0), 0.74, 0.07, 0.009, 12);
    b.tube('structure/steel-red', at(f, x - 0.07, 0.74, 0), at(f, x + 0.07, 0.74, 0), 0.006, 4);
  }
  for (const x of [-0.5, 0.5]) lathe(b, tex, move(f, x, 0, 0), [[0.09, 0], [0.09, 0.02], [r, 0.03]], 10);
  if (cage) box(b, F('grid-galvanized'), f, [0, 0.45, 0], [0.75, 0.45, 0.28], 'Y');
}
/** Free-standing illuminated poster case on two legs. */
function adPanel(b: MeshBuilder, f: Pose, front: string, back: string, tex: string): void {
  for (const s of [-1, 1]) box(b, tex, f, [s * 0.45, 0.3, 0], [0.04, 0.3, 0.04]);
  box(b, tex, f, [0, 1.55, 0], [0.66, 0.95, 0.08], 'zZ');
  box(b, tex, f, [0, 1.55, 0], [0.66, 0.95, 0.08], 'xXyY');
  face(b, F(`poster-${front}`), f, [0, 1.55, 0.081], 1.2, 1.75);
  face(b, F(`poster-${back}`), turn(f, 180), [0, 1.55, 0.081], 1.2, 1.75);
  for (const z of [0.0805, -0.0805]) {
    for (const s of [-1, 1]) {
      box(b, tex, f, [s * 0.63, 1.55, z], [0.03, 0.95, 0.001]);
      box(b, tex, f, [0, 1.55 + s * 0.9125, z], [0.66, 0.0375, 0.001]);
    }
  }
}
/** Three-sided advertising kiosk. */
function adKiosk(b: MeshBuilder, f: Pose, posters: string[], tex: string): void {
  lathe(b, tex, turn(f, 90), [[0.74, 0], [0.74, 0.38], [0.7, 0.4]], 3);
  lathe(b, tex, turn(f, 90), [[0.7, 2.2], [0.78, 2.24], [0.78, 2.32], [0.3, 2.5], [0, 2.52]], 3);
  for (let k = 0; k < 3; k++) {
    const g = turn(f, k * 120);
    face(b, F(`poster-${posters[k]}`), g, [0, 1.3, 0.349], 1.2, 1.8);
    b.tube(tex, at(g, 0.6, 0.4, 0.3465), at(g, 0.6, 2.2, 0.3465), 0.025, 6);
  }
}
function streetClock(b: MeshBuilder, f: Pose, tex: string, faceTex: string, twin = false): void {
  pole(b, f, { h: 3.3, r0: 0.075, r1: 0.055, tex, base: 'fluted', cap: 'none' });
  const g = move(f, 0, 3.75, 0);
  lathe(b, tex, f, [[0.055, 3.3], [0.09, 3.34], [0.05, 3.38]], 10);
  lathe(b, tex, tilt(move(g, 0, 0, -0.1), 90), [[0.4, 0], [0.42, 0.02], [0.42, 0.18], [0.4, 0.2]], 24);
  disc(b, F(faceTex), g, [0, 0, 0.101], 0.39, 24, 0.33);
  disc(b, F(faceTex), turn(g, 180), [0, 0, 0.101], 0.39, 24, 0.33);
  lathe(b, tex, move(g, 0, 0.42, 0), [[0.05, 0], [0.07, 0.04], [0.02, 0.1], [0.035, 0.14], [0, 0.2]], 8);
  if (twin) for (const s of [-1, 1]) pipe(b, tex, sweep(f, [s * 0.05, 2.7, 0], s * 0.35, 0.3), 0.015, 6);
}
/** Concrete wheel stop for a parking bay. */
function wheelStop(b: MeshBuilder, f: Pose, tex: string): void {
  prism(b, tex, f, [[-0.09, 0], [0.09, 0], [0.06, 0.1], [-0.06, 0.1]], -0.9, 0.9);
  for (const x of [-0.6, 0.6]) b.tube(ZINC, at(f, x, 0.1, 0), at(f, x, 0.105, 0), 0.012, 6, 0.012, true);
}

export function addFurniture(): void {
  const add = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('furniture', id, label, fn);

  // Street lights on arms.
  const LIGHTS: [string, string, LightOpts][] = [
    ['cobra-8', '街灯 ナトリウム灯 8m', { h: 8, arm: 1.8, lamp: 'cobra-on', tex: P('galvanized') }],
    ['cobra-10', '街灯 ナトリウム灯 10m', { h: 10, lamp: 'cobra-on', tex: P('galvanized') }],
    ['cobra-12-long', '街灯 ナトリウム灯 12m 長腕', { h: 12, arm: 3.6, rise: 0.9, lamp: 'cobra-on', tex: P('galvanized'), r0: 0.13 }],
    ['cobra-off', '街灯 ナトリウム灯 消灯', { h: 9, lamp: 'cobra', tex: P('grey') }],
    ['cobra-twin', '街灯 ナトリウム灯 両腕', { h: 10, arms: 2, lamp: 'cobra-on', tex: P('galvanized') }],
    ['cobra-concrete', '街灯 ナトリウム灯 コンクリート柱', { h: 9, lamp: 'cobra-on', tex: P('concrete'), r0: 0.14, base: 'buried' }],
    ['cobra-green', '街灯 ナトリウム灯 緑塗装', { h: 9, lamp: 'cobra-on', tex: P('green'), base: 'cast' }],
    ['cobra-rusty', '街灯 ナトリウム灯 錆・傾き', { h: 8.5, arm: 1.8, lamp: 'cobra', tex: P('rusty'), lean: 3 }],
    ['cobra-banner', '街灯 ナトリウム灯+旗', { h: 10, lamp: 'cobra-on', tex: P('galvanized'), banners: ['festival'] }],
    ['led-9', '街灯 LED 9m', { h: 9, arm: 1.8, rise: 0.3, lamp: 'led-on', tex: P('grey') }],
    ['led-11', '街灯 LED 11m', { h: 11, arm: 2.8, rise: 0.3, lamp: 'led-on', tex: P('grey') }],
    ['led-off', '街灯 LED 消灯', { h: 9, arm: 1.8, rise: 0.3, lamp: 'led', tex: P('galvanized') }],
    ['led-twin', '街灯 LED 両腕', { h: 10, arm: 2, arms: 2, rise: 0.3, lamp: 'led-on', tex: P('grey') }],
    ['led-short', '街灯 LED 短腕', { h: 7, arm: 0.7, rise: 0.15, lamp: 'led-on', tex: P('black') }],
    ['led-black', '街灯 LED 黒塗装', { h: 9, arm: 1.8, rise: 0.3, lamp: 'led-on', tex: P('black'), base: 'cast' }],
    ['led-banners', '街灯 LED+旗2枚', { h: 10, arm: 2.2, rise: 0.3, lamp: 'led-on', tex: P('grey'), banners: ['downtown', 'arts'] }],
    ['led-ped', '街灯 LED+歩道灯', { h: 10, arm: 2.4, rise: 0.3, lamp: 'led-on', tex: P('bronze'), ped: true }],
    ['led-ped-banner', '街灯 LED+歩道灯+旗', { h: 10, arm: 2.4, rise: 0.3, lamp: 'led-on', tex: P('green'), ped: true, banners: ['beach'], base: 'cast' }],
    ['davit', '街灯 一体曲げ柱', { h: 9, arm: 2, davit: true, lamp: 'led-on', tex: P('galvanized') }],
    ['davit-twin', '街灯 一体曲げ柱 両腕', { h: 10, arm: 2, arms: 2, davit: true, lamp: 'led-on', tex: P('grey') }],
    ['davit-cobra', '街灯 一体曲げ柱 ナトリウム灯', { h: 9.5, arm: 2.6, davit: true, lamp: 'cobra-on', tex: P('bronze') }],
    ['shoebox', '街灯 角形 1灯', { h: 7.5, arm: 0.6, rise: 0, lamp: 'shoebox-on', tex: P('bronze'), sides: 4, r0: 0.09 }],
    ['shoebox-twin', '街灯 角形 2灯', { h: 8, arm: 0.6, rise: 0, arms: 2, lamp: 'shoebox-on', tex: P('bronze'), sides: 4, r0: 0.09 }],
    ['shoebox-quad', '駐車場灯 角形 4灯', { h: 9, arm: 0.6, rise: 0, arms: 4, lamp: 'shoebox-on', tex: P('black'), sides: 4, r0: 0.1, base: 'pedestal' }],
    ['shoebox-off', '街灯 角形 消灯', { h: 7.5, arm: 0.6, rise: 0, arms: 2, lamp: 'shoebox', tex: P('black'), sides: 4, r0: 0.09 }],
  ];
  for (const [id, label, o] of LIGHTS) add(`light-${id}`, label, (b) => streetLight(b, O, o));
  add('light-flood-4', '投光器マスト 4灯', (b) => floodMast(b, O, 12, 4, P('galvanized')));
  add('light-flood-6', '投光器マスト 6灯', (b) => floodMast(b, O, 15, 6, P('grey')));

  // Post-top lamps.
  const TOPS: [string, string, PostTopOpts][] = [
    ['globe', '柱頭灯 グローブ', { h: 3.4, tex: P('black'), top: 'globe' }],
    ['globe-green', '柱頭灯 グローブ 緑', { h: 3.4, tex: P('green'), top: 'globe', base: 'fluted' }],
    ['globe-off', '柱頭灯 グローブ 消灯', { h: 3.4, tex: P('black'), top: 'globe', on: false }],
    ['globe-twin', '柱頭灯 グローブ 2灯', { h: 3.8, tex: P('black'), top: 'globe', arms: 2 }],
    ['globe-three', '柱頭灯 グローブ 3灯', { h: 4, tex: P('green'), top: 'globe', arms: 2, centre: true, base: 'fluted' }],
    ['globe-five', '柱頭灯 グローブ 5灯', { h: 4.2, tex: P('black'), top: 'globe', arms: 4, centre: true, base: 'fluted', r0: 0.08 }],
    ['acorn', '柱頭灯 どんぐり形', { h: 3.8, tex: P('black'), top: 'acorn', base: 'fluted' }],
    ['acorn-green', '柱頭灯 どんぐり形 緑', { h: 3.8, tex: P('green'), top: 'acorn', base: 'fluted' }],
    ['acorn-off', '柱頭灯 どんぐり形 消灯', { h: 3.8, tex: P('bronze'), top: 'acorn', on: false }],
    ['acorn-twin', '柱頭灯 どんぐり形 2灯', { h: 4.2, tex: P('black'), top: 'acorn', arms: 2, base: 'fluted', r0: 0.075 }],
    ['acorn-banner', '柱頭灯 どんぐり形+旗', { h: 4.6, tex: P('black'), top: 'acorn', base: 'fluted', banners: ['market'], r0: 0.075 }],
    ['acorn-banners', '柱頭灯 どんぐり形+旗2枚', { h: 4.6, tex: P('green'), top: 'acorn', base: 'fluted', banners: ['festival', 'beach'], r0: 0.075 }],
    ['acorn-baskets', '柱頭灯 どんぐり形+花かご', { h: 4, tex: P('black'), top: 'acorn', base: 'fluted', baskets: 'flowers-red' }],
    ['lantern', '柱頭灯 ランタン', { h: 3.2, tex: P('black'), top: 'lantern' }],
    ['lantern-bronze', '柱頭灯 ランタン ブロンズ', { h: 3.2, tex: P('bronze'), top: 'lantern', base: 'fluted' }],
    ['lantern-twin', '柱頭灯 ランタン 2灯', { h: 3.6, tex: P('black'), top: 'lantern', arms: 2, base: 'fluted' }],
    ['lantern-baskets', '柱頭灯 ランタン+花かご', { h: 3.6, tex: P('green'), top: 'lantern', base: 'fluted', baskets: 'flowers-purple' }],
    ['lantern-off', '柱頭灯 ランタン 消灯', { h: 3.2, tex: P('rusty'), top: 'lantern', on: false }],
    ['disc', '柱頭灯 円盤LED', { h: 4, tex: P('grey'), top: 'disc', base: 'plate' }],
    ['disc-black', '柱頭灯 円盤LED 黒', { h: 4.4, tex: P('black'), top: 'disc', base: 'plate' }],
    ['disc-off', '柱頭灯 円盤LED 消灯', { h: 4, tex: P('galvanized'), top: 'disc', base: 'plate', on: false }],
  ];
  for (const [id, label, o] of TOPS) add(`light-${id}`, label, (b) => postTop(b, O, o));

  // Utility poles.
  const POLES: [string, string, UtilOpts][] = [
    ['wood', '電柱 木柱 腕木1段', { pin: true }],
    ['wood-2arm', '電柱 木柱 腕木2段', { arms: 2, h: 12 }],
    ['wood-3arm', '電柱 木柱 腕木3段', { arms: 3, h: 13.5, r0: 0.18 }],
    ['wood-bare', '電柱 木柱 腕木なし', { arms: 0, pin: true, h: 9, comm: true }],
    ['wood-transformer', '電柱 変圧器1台', { pin: true, cans: 1, riser: true }],
    ['wood-transformer-2', '電柱 変圧器2台', { arms: 2, cans: 2, h: 12 }],
    ['wood-transformer-3', '電柱 変圧器3台', { arms: 2, cans: 3, h: 12.5, r0: 0.18, comm: true }],
    ['wood-transformer-old', '電柱 変圧器・錆・傾き', { pin: true, cans: 1, canTex: F('coat-can-grey-old'), tex: P('wood-grey'), lean: 3, comm: true }],
    ['wood-light', '電柱 街灯つき', { pin: true, light: 'cobra-on', comm: true }],
    ['wood-light-transformer', '電柱 街灯+変圧器', { arms: 2, h: 12, cans: 1, light: 'led-on', comm: true, riser: true }],
    ['wood-guy', '電柱 支線つき', { arms: 2, guy: true, h: 11.5 }],
    ['wood-comm', '電柱 通信線・端子箱', { pin: true, comm: true, riser: true }],
    ['wood-grey', '電柱 古い木柱', { arms: 2, tex: P('wood-grey'), h: 10.5, lean: -2 }],
    ['wood-short', '引込柱 メーターつき', { arms: 0, pin: true, h: 6.5, r0: 0.12, riser: true }],
    ['concrete', '電柱 コンクリート柱', { tex: P('concrete'), steel: true, pin: true, h: 11 }],
    ['concrete-transformer', '電柱 コンクリート柱+変圧器', { tex: P('concrete'), steel: true, arms: 2, cans: 1, h: 12, comm: true }],
    ['steel', '電柱 鋼管柱', { tex: P('galvanized'), steel: true, arms: 2, h: 12, r0: 0.15 }],
  ];
  for (const [id, label, o] of POLES) add(`pole-${id}`, label, (b) => void utilPole(b, O, o));
  add('pole-steel-line', '送電用鋼管柱 3相', (b) => void steelLine(b, O, 16));
  add('pole-span-2', '電柱2本+電線 30m', (b) => line(b, 2, 30, () => ({ pin: true, comm: true })));
  add('pole-span-3', '電柱3本+電線 変圧器・街灯', (b) => line(b, 3, 28, (i) => ({ arms: 2, h: 12, comm: true, cans: i === 1 ? 1 : 0, light: i === 0 ? 'cobra-on' : undefined })));
  add('pole-span-guy', '電柱2本+電線 終端支線', (b) => line(b, 2, 26, (i) => ({ arms: 2, h: 11.5, guy: i === 1, yaw: 0 })));
  add('pole-span-steel', '送電用鋼管柱2本+電線 45m', (b) => {
    const a = steelLine(b, stand([-22.5, 0, 0], 90), 16);
    string(b, a, steelLine(b, stand([22.5, 0, 0], 90), 16), 1.6);
  });

  // Benches.
  const BENCHES: [string, string, BenchOpts][] = [
    ['park', 'ベンチ 木板+鋳鉄脚', { kind: 'park' }],
    ['park-weathered', 'ベンチ 風化した木板', { kind: 'park', slats: 'weathered', frame: P('rusty') }],
    ['park-green', 'ベンチ 緑塗装 1.5m', { kind: 'park', slats: 'green', frame: P('green'), len: 1.5 }],
    ['park-dark-long', 'ベンチ 濃色 2.4m 肘掛け3本', { kind: 'park', slats: 'dark', frame: P('bronze'), len: 2.4, arms: 3 }],
    ['park-red-short', 'ベンチ 赤茶 1.2m', { kind: 'park', slats: 'red', len: 1.2 }],
    ['park-plastic', 'ベンチ 再生樹脂', { kind: 'park', slats: 'plastic', frame: P('grey') }],
    ['park-no-arms', 'ベンチ 肘掛けなし', { kind: 'park', arms: 0, frame: P('galvanized') }],
    ['park-backless', 'ベンチ 背なし・肘掛けつき', { kind: 'park', back: false, slats: 'dark' }],
    ['flat', 'ベンチ 背なし 木板', { kind: 'flat', frame: P('galvanized') }],
    ['flat-dark-long', 'ベンチ 背なし 濃色 2.4m', { kind: 'flat', slats: 'dark', len: 2.4 }],
    ['flat-plastic', 'ベンチ 背なし 再生樹脂 1.5m', { kind: 'flat', slats: 'plastic', frame: P('grey'), len: 1.5 }],
    ['flat-weathered', 'ベンチ 背なし 風化', { kind: 'flat', slats: 'weathered', frame: P('rusty') }],
    ['metal', 'ベンチ パンチングメタル 黒', { kind: 'metal' }],
    ['metal-steel', 'ベンチ パンチングメタル ステンレス', { kind: 'metal', sheet: 'perforated-steel', frame: P('galvanized') }],
    ['metal-blue', 'ベンチ パンチングメタル 青 1.5m', { kind: 'metal', sheet: 'perforated-blue', frame: 'structure/steel-blue', len: 1.5 }],
    ['metal-mesh', 'ベンチ エキスパンドメタル 緑', { kind: 'metal', sheet: 'mesh-green', frame: P('green'), arms: 3, len: 2.4 }],
    ['metal-backless', 'ベンチ パンチングメタル 背なし', { kind: 'metal', sheet: 'perforated-steel', frame: P('grey'), back: false, arms: 0 }],
    ['concrete', 'ベンチ コンクリート', { kind: 'concrete' }],
    ['concrete-exposed', 'ベンチ 洗い出しコンクリート 2.4m', { kind: 'concrete', conc: 'concrete/walk-exposed', len: 2.4 }],
    ['concrete-wood', 'ベンチ コンクリート+木板', { kind: 'concrete', slats: 'new' }],
    ['concrete-wood-old', 'ベンチ コンクリート+風化した木板 2.4m', { kind: 'concrete', slats: 'weathered', conc: 'concrete/walk-dark', len: 2.4 }],
  ];
  for (const [id, label, o] of BENCHES) add(`bench-${id}`, label, (b) => bench(b, O, o));
  for (const [ad, name] of [['lawyer', '弁護士'], ['realtor', '不動産'], ['dentist', '歯科'], ['bail', '保釈保証'], ['blank', '空き枠・落書き']]) {
    add(`bench-ad-${ad}`, `バス停ベンチ 広告 ${name}`, (b) => bench(b, O, { kind: 'ad', ad, slats: ad === 'blank' ? 'weathered' : 'green' }));
  }
  add('bench-picnic', 'ピクニックテーブル', (b) => picnic(b, O, F('slats-new'), P('galvanized')));
  add('bench-picnic-weathered', 'ピクニックテーブル 風化', (b) => picnic(b, O, F('slats-weathered'), P('rusty')));
  add('bench-picnic-green', 'ピクニックテーブル 緑塗装 2.4m', (b) => picnic(b, O, F('slats-green'), P('green'), 2.4));

  // Bins.
  const BINS: [string, string, BinOpts][] = [
    ['mesh', 'ゴミ箱 金網 黒', { kind: 'mesh', tex: F('mesh-black') }],
    ['mesh-green', 'ゴミ箱 金網 緑', { kind: 'mesh', tex: F('mesh-green'), lid: P('green') }],
    ['mesh-galvanized', 'ゴミ箱 金網 亜鉛めっき', { kind: 'mesh', tex: F('mesh-galvanized'), lid: ZINC }],
    ['mesh-full', 'ゴミ箱 金網 あふれ', { kind: 'mesh', tex: F('mesh-black'), full: true }],
    ['post', 'ゴミかご 柱つき', { kind: 'post', tex: F('mesh-black') }],
    ['post-galvanized', 'ゴミかご 柱つき 亜鉛めっき', { kind: 'post', tex: F('grid-galvanized'), lid: ZINC }],
    ['drum', 'ドラム缶のゴミ箱 緑', { kind: 'drum', tex: F('coat-bin-green-old') }],
    ['drum-blue', 'ドラム缶のゴミ箱 青', { kind: 'drum', tex: 'structure/steel-blue' }],
    ['drum-full', 'ドラム缶のゴミ箱 錆・あふれ', { kind: 'drum', tex: F('coat-dumpster-blue'), full: true }],
    ['concrete', 'ゴミ箱 洗い出しコンクリート', { kind: 'concrete', tex: 'concrete/walk-exposed' }],
    ['concrete-green', 'ゴミ箱 コンクリート 緑の蓋', { kind: 'concrete', tex: 'concrete/walk-plain', lid: F('coat-bin-green') }],
    ['concrete-full', 'ゴミ箱 洗い出しコンクリート あふれ', { kind: 'concrete', tex: 'concrete/walk-exposed', lid: F('coat-brown'), full: true }],
    ['hood', 'ゴミ箱 屋根つき 黒', { kind: 'hood', tex: F('slots-black'), label: 'trash' }],
    ['hood-green', 'ゴミ箱 屋根つき 緑', { kind: 'hood', tex: F('slots-green'), lid: P('green'), label: 'litter' }],
    ['hood-full', 'ゴミ箱 屋根つき あふれ', { kind: 'hood', tex: F('perforated-black'), label: 'trash', full: true }],
    ['dome', 'ゴミ箱 丸屋根 濃緑', { kind: 'dome', tex: F('coat-bin-green'), label: 'litter' }],
    ['dome-burgundy', 'ゴミ箱 丸屋根 えんじ', { kind: 'dome', tex: F('coat-burgundy'), label: 'trash' }],
    ['dome-teal', 'ゴミ箱 丸屋根 青緑', { kind: 'dome', tex: F('coat-teal'), lid: F('coat-stainless') }],
    ['dome-old', 'ゴミ箱 丸屋根 錆・あふれ', { kind: 'dome', tex: F('coat-bin-green-old'), label: 'litter', full: true }],
    ['solar', 'ソーラー圧縮ゴミ箱 緑', { kind: 'solar', tex: F('coat-bin-green'), label: 'trash' }],
    ['solar-blue', 'ソーラー圧縮ゴミ箱 資源用', { kind: 'solar', tex: 'structure/steel-blue', label: 'recycle' }],
    ['slat', 'ゴミ箱 木板', { kind: 'slat', tex: F('slats-new') }],
    ['slat-weathered', 'ゴミ箱 風化した木板 あふれ', { kind: 'slat', tex: F('slats-weathered'), lid: P('rusty'), full: true }],
  ];
  for (const [id, label, o] of BINS) add(`bin-${id}`, label, (b) => bin(b, O, o));
  add('bin-mesh-bags', 'ゴミ箱 金網+ゴミ袋', (b) => {
    bin(b, O, { kind: 'mesh', tex: F('mesh-green'), lid: P('green'), full: true });
    sack(b, stand([0.5, 0, 0.1]));
    sack(b, stand([0.35, 0, -0.4]), 0.22);
  });
  add('bin-pair', '分別ゴミ箱 2連', (b) => {
    bin(b, stand([-0.32, 0, 0]), { kind: 'hood', tex: F('slots-black'), label: 'trash' });
    bin(b, stand([0.32, 0, 0]), { kind: 'hood', tex: F('perforated-blue'), lid: 'structure/steel-blue', label: 'recycle' });
  });
  add('bin-triple', '分別ゴミ箱 3連', (b) => {
    bin(b, stand([-0.64, 0, 0]), { kind: 'hood', tex: F('slots-black'), label: 'landfill' });
    bin(b, stand([0, 0, 0]), { kind: 'hood', tex: F('perforated-blue'), lid: 'structure/steel-blue', label: 'recycle' });
    bin(b, stand([0.64, 0, 0]), { kind: 'hood', tex: F('slots-green'), lid: P('green'), label: 'cans' });
  });
  add('bin-solar-pair', 'ソーラー圧縮ゴミ箱 2連', (b) => {
    bin(b, stand([-0.34, 0, 0]), { kind: 'solar', tex: P('grey'), label: 'landfill' });
    bin(b, stand([0.34, 0, 0]), { kind: 'solar', tex: 'structure/steel-blue', label: 'recycle' });
  });
  add('bin-cart-green', '家庭用ゴミカート 緑', (b) => cart(b, O, F('coat-bin-green')));
  add('bin-cart-blue', '家庭用ゴミカート 青', (b) => cart(b, O, 'structure/steel-blue'));
  add('bin-cart-black', '家庭用ゴミカート 黒', (b) => cart(b, O, BLACK));
  add('bin-cart-trio', '家庭用ゴミカート 3台', (b) => {
    cart(b, stand([-0.7, 0, 0], 4), BLACK);
    cart(b, stand([0, 0, 0.05], -6), 'structure/steel-blue');
    cart(b, stand([0.72, 0, -0.03], 3), F('coat-bin-green'), F('coat-brown'));
  });
  add('bin-dumpster', '大型ゴミ箱 青・錆', (b) => dumpster(b, O, F('coat-dumpster-blue')));
  add('bin-dumpster-green', '大型ゴミ箱 緑', (b) => dumpster(b, O, F('coat-bin-green-old')));
  add('bin-dumpster-open', '大型ゴミ箱 蓋あき', (b) => dumpster(b, O, F('coat-dumpster-blue'), true));
  add('bin-dumpster-bags', '大型ゴミ箱+ゴミ袋', (b) => {
    dumpster(b, O, F('coat-bin-green-old'), true);
    sack(b, stand([1.45, 0, 0.3]));
    sack(b, stand([1.6, 0, -0.25]), 0.3);
    sack(b, stand([-1.4, 0, 0.5]), 0.22);
  });
  add('bin-bags', 'ゴミ袋の山 3個', (b) => {
    sack(b, stand([-0.25, 0, 0]));
    sack(b, stand([0.25, 0, 0.05]), 0.3);
    sack(b, stand([0.02, 0, 0.42]), 0.22);
  });
  add('bin-bags-5', 'ゴミ袋の山 5個', (b) => {
    [[-0.5, 0, 0.3], [0, 0.05, 0.26], [0.5, 0, 0.3], [-0.2, 0.45, 0.24], [0.3, 0.42, 0.2]].forEach(([x, z, r]) => sack(b, stand([x, 0, z]), r));
  });

  // Hydrants.
  const HYDRANTS: [string, string, HydrantOpts][] = [
    ['red', '消火栓 赤', { body: 'red' }],
    ['red-old', '消火栓 赤・剥がれ', { body: 'red-old' }],
    ['yellow', '消火栓 黄', { body: 'yellow' }],
    ['yellow-old', '消火栓 黄・剥がれ', { body: 'yellow-old' }],
    ['yellow-green', '消火栓 黄+緑の蓋', { body: 'yellow', cap: 'green' }],
    ['yellow-blue', '消火栓 黄+青の蓋', { body: 'yellow', cap: 'blue' }],
    ['white-red', '消火栓 白+赤の蓋', { body: 'white', cap: 'red' }],
    ['silver', '消火栓 銀', { body: 'silver' }],
    ['silver-orange', '消火栓 銀+橙の蓋', { body: 'silver', cap: 'orange' }],
    ['red-white', '消火栓 赤+白の蓋', { body: 'red', cap: 'white' }],
    ['black-old', '消火栓 黒・使用停止', { body: 'black-old' }],
    ['wet-yellow', '消火栓 湿式 黄', { body: 'yellow', wet: true }],
    ['wet-red', '消火栓 湿式 赤', { body: 'red', wet: true }],
    ['wet-white-blue', '消火栓 湿式 白+青の蓋', { body: 'white', cap: 'blue', wet: true }],
    ['wet-silver-old', '消火栓 湿式 銀・剥がれ', { body: 'silver-old', wet: true }],
    ['leaning', '消火栓 黄・傾き', { body: 'yellow-old', lean: 9 }],
    ['posts-2', '消火栓+防護柱2本', { body: 'red', posts: 2 }],
    ['posts-4', '消火栓+防護柱4本', { body: 'yellow', cap: 'green', posts: 4 }],
  ];
  for (const [id, label, o] of HYDRANTS) add(`hydrant-${id}`, label, (b) => hydrant(b, O, o));

  // Mailboxes.
  add('mail-box', '郵便ポスト 青', (b) => mailbox(b, O));
  add('mail-box-old', '郵便ポスト 古い', (b) => mailbox(b, O, { old: true }));
  add('mail-box-tagged', '郵便ポスト 落書き・傾き', (b) => mailbox(b, O, { old: true, tagged: true, lean: 3 }));
  add('mail-box-pair', '郵便ポスト 2連', (b) => {
    mailbox(b, stand([-0.3, 0, 0]));
    mailbox(b, stand([0.3, 0, 0]), { old: true });
  });
  add('mail-relay', '郵便中継箱', (b) => relayBox(b, O));
  add('mail-relay-pair', '郵便ポスト+中継箱', (b) => {
    mailbox(b, stand([-0.4, 0, 0]));
    relayBox(b, stand([0.4, 0, 0]));
  });
  add('mail-curb-black', '家庭用郵便受け 黒', (b) => curbBox(b, O, BLACK));
  add('mail-curb-white', '家庭用郵便受け 白・旗あげ', (b) => curbBox(b, O, 'structure/steel-white', { flagUp: true, post: 'structure/steel-white' }));
  add('mail-curb-galvanized', '家庭用郵便受け 亜鉛めっき・傾き', (b) => curbBox(b, O, ZINC, { lean: 7, post: P('wood-grey') }));
  add('mail-curb-row', '家庭用郵便受け 3連', (b) => {
    curbBox(b, stand([-0.5, 0, 0]), BLACK);
    curbBox(b, stand([0, 0, 0]), ZINC, { flagUp: true });
    curbBox(b, stand([0.5, 0, 0]), F('coat-relay-green'), { lean: -3 });
  });

  // Parking meters.
  const METERS: [string, string, MeterOpts][] = [
    ['dial', 'パーキングメーター 針式', {}],
    ['digital', 'パーキングメーター 液晶', { face: 'digital', tex: P('black') }],
    ['expired', 'パーキングメーター 時間切れ', { face: 'expired' }],
    ['old', 'パーキングメーター 古い・傾き', { face: 'old', lean: 5, tex: P('rusty') }],
    ['twin', 'パーキングメーター 2連', { twin: true }],
    ['twin-digital', 'パーキングメーター 2連 液晶', { twin: true, face: 'digital', tex: P('black') }],
    ['bagged', 'パーキングメーター 使用停止', { bagged: true }],
    ['hitch', 'パーキングメーター+駐輪リング', { hitch: true, face: 'digital' }],
  ];
  for (const [id, label, o] of METERS) add(`meter-${id}`, label, (b) => parkingMeter(b, O, o));
  add('meter-row', 'パーキングメーター 4本の列', (b) => {
    for (let i = 0; i < 4; i++) parkingMeter(b, stand([(i - 1.5) * 2.4, 0, 0]), { face: i === 2 ? 'expired' : 'dial', lean: i === 1 ? -2 : 0 });
  });
  add('meter-paystation', '駐車料金精算機 灰', (b) => payStation(b, O, 'grey'));
  add('meter-paystation-green', '駐車料金精算機 緑', (b) => payStation(b, O, 'green'));
  add('meter-paystation-solar', '駐車料金精算機 太陽電池つき', (b) => payStation(b, O, 'grey', true));
  add('meter-paystation-off', '駐車料金精算機 故障', (b) => payStation(b, O, 'off'));

  // Bollards.
  const BOLLARDS: [string, string, BollardOpts][] = [
    ['pipe', '車止め 鋼管 黄', { kind: 'pipe' }],
    ['pipe-band', '車止め 鋼管 黄+縞', { kind: 'pipe', band: 'bollard-band' }],
    ['pipe-old', '車止め 鋼管 黄・剥がれ・傾き', { kind: 'pipe', tex: F('enamel-yellow-old'), lean: 7 }],
    ['pipe-red', '車止め 鋼管 赤+反射帯', { kind: 'pipe', tex: F('enamel-red'), band: 'bollard-reflector' }],
    ['pipe-black', '車止め 鋼管 黒', { kind: 'pipe', tex: F('enamel-black') }],
    ['pipe-galvanized', '車止め 鋼管 亜鉛めっき', { kind: 'pipe', tex: ZINC }],
    ['fat', '車止め コンクリート充填 黄', { kind: 'fat' }],
    ['fat-old', '車止め コンクリート充填 剥がれ', { kind: 'fat', tex: F('enamel-yellow-old'), band: 'bollard-band' }],
    ['cast', '車止め 鋳鉄 黒', { kind: 'cast', tex: F('enamel-black') }],
    ['cast-green', '車止め 鋳鉄 緑', { kind: 'cast', tex: F('enamel-green') }],
    ['cast-old', '車止め 鋳鉄 剥がれ', { kind: 'cast', tex: F('enamel-black-old'), lean: -4 }],
    ['steel', '車止め ステンレス', { kind: 'steel' }],
    ['steel-band', '車止め ステンレス+反射帯', { kind: 'steel', band: 'bollard-reflector' }],
    ['dome', '車止め コンクリート半球', { kind: 'dome' }],
    ['sphere', '車止め コンクリート球', { kind: 'sphere' }],
    ['sphere-exposed', '車止め 洗い出しコンクリート球', { kind: 'sphere', tex: 'concrete/walk-exposed' }],
    ['block', '車止め コンクリート角柱', { kind: 'block' }],
    ['wood', '車止め 木杭', { kind: 'wood' }],
    ['lit', '照明つき車止め 黒', { kind: 'lit' }],
    ['lit-grey', '照明つき車止め 灰・消灯', { kind: 'lit', tex: P('grey'), off: true }],
  ];
  for (const [id, label, o] of BOLLARDS) add(`bollard-${id}`, label, (b) => void bollard(b, O, o));
  add('bollard-row-pipe', '車止め 鋼管4本の列', (b) => bollards(b, 4, 1.5, (i) => ({ kind: 'pipe', band: 'bollard-band', lean: i === 2 ? 5 : 0 })));
  add('bollard-row-chain', '車止め 鋳鉄+鎖 4本', (b) => bollards(b, 4, 2, () => ({ kind: 'cast', tex: F('enamel-black') }), 'chain'));
  add('bollard-row-steel', '車止め ステンレス5本の列', (b) => bollards(b, 5, 1.4, () => ({ kind: 'steel' })));
  add('bollard-row-rail', '車止め 鋼管+横棒', (b) => bollards(b, 3, 1.8, () => ({ kind: 'pipe', tex: ZINC }), 'rail'));
  add('bollard-row-sphere', '車止め コンクリート球3個', (b) => bollards(b, 3, 1.3, () => ({ kind: 'sphere' })));
  add('bollard-row-rope', '車止め 木杭+ロープ 4本', (b) => bollards(b, 4, 2, () => ({ kind: 'wood' }), 'rope'));
  add('bollard-row-lit', '照明つき車止め 3本の列', (b) => bollards(b, 3, 2.5, () => ({ kind: 'lit' })));

  // Bus shelters.
  const SHELTERS: [string, string, ShelterOpts][] = [
    ['flat', 'バス待合所 平屋根+広告', { ads: ['cola', 'airline'], bench: 'new', map: true }],
    ['flat-sign', 'バス待合所 平屋根+バス停標識', { ads: ['phone', 'bank'], bench: 'plastic', map: true, sign: true, frame: P('grey') }],
    ['flat-short', 'バス待合所 小型 2.6m', { len: 2.6, bench: 'new', frame: P('green') }],
    ['flat-long', 'バス待合所 大型 5.4m', { len: 5.4, ads: ['movie', 'radio'], bench: 'dark', map: true, frame: P('bronze') }],
    ['barrel', 'バス待合所 かまぼこ屋根', { roof: 'barrel', ads: ['burger', 'surf'], bench: 'green', frame: P('green'), roofTex: F('coat-cream') }],
    ['barrel-long', 'バス待合所 かまぼこ屋根 5.4m', { roof: 'barrel', len: 5.4, ads: ['airline', 'phone'], bench: 'new', map: true, roofTex: 'structure/steel-white' }],
    ['tilt', 'バス待合所 片流れ屋根', { roof: 'tilt', ads: ['bank', 'cola'], bench: 'plastic', frame: P('grey'), map: true }],
    ['tilt-open', 'バス待合所 片流れ屋根 壁なし', { roof: 'tilt', glass: null, bench: 'weathered', frame: P('galvanized'), len: 3.2 }],
    ['tagged', 'バス待合所 落書き・色あせ広告', { glass: 'shelter-glass-tagged', ads: ['cola-faded', 'movie-faded'], bench: 'weathered', frame: P('rusty') }],
    ['faded-barrel', 'バス待合所 かまぼこ屋根 古い', { roof: 'barrel', glass: 'shelter-glass-tagged', ads: ['burger-faded', 'airline-faded'], bench: 'weathered', frame: P('rusty'), roofTex: 'structure/steel-grey-rusty', sign: true }],
  ];
  for (const [id, label, o] of SHELTERS) add(`shelter-${id}`, label, (b) => shelter(b, O, o));

  // Newspaper boxes.
  const NEWS: [string, string][] = [['red', '赤'], ['blue', '青'], ['yellow', '黄'], ['green', '緑'], ['white', '白'], ['black', '黒'], ['orange', '橙']];
  for (const [c, name] of NEWS) add(`news-${c}`, `新聞販売箱 ${name}`, (b) => newsBox(b, O, c));
  add('news-empty', '新聞販売箱 空・落書き・傾き', (b) => newsBox(b, O, 'red', { empty: true, lean: 5 }));
  add('news-low-green', '無料紙の箱 緑', (b) => newsBox(b, O, 'green', { low: true }));
  add('news-low-orange', '無料紙の箱 橙', (b) => newsBox(b, O, 'orange', { low: true }));
  add('news-row-3', '新聞販売箱 3台の列', (b) => ['red', 'blue', 'yellow'].forEach((c, i) => newsBox(b, stand([(i - 1) * 0.5, 0, 0]), c)));
  add('news-row-5', '新聞販売箱 5台の列', (b) => {
    ['black', 'white', 'green', 'orange', 'blue'].forEach((c, i) => newsBox(b, stand([(i - 2) * 0.5, 0, i === 3 ? -0.04 : 0], i === 3 ? 6 : 0), c, { low: i === 2, empty: i === 4 }));
  });
  add('news-fallen', '新聞販売箱 倒れ', (b) => newsBox(b, roll(stand([0.5, 0.2, 0]), 90), 'yellow'));

  // Bike racks.
  const lean = (x: number, z: number, deg = -7, yaw = 0): Pose => tilt(stand([x, 0, z], yaw), deg);
  add('rack-u', '駐輪ラック 逆U字', (b) => uRack(b, O, P('grey')));
  add('rack-u-black', '駐輪ラック 逆U字 黒', (b) => uRack(b, O, P('black')));
  add('rack-u-green', '駐輪ラック 逆U字 緑・幅広', (b) => uRack(b, O, F('enamel-green'), 0.9, 0.8));
  add('rack-u-bike', '駐輪ラック 逆U字+自転車', (b) => {
    uRack(b, O, P('grey'));
    bicycle(b, lean(0, 0.13), 'structure/steel-red');
  });
  add('rack-u-row', '駐輪ラック 逆U字4基', (b) => {
    for (let i = 0; i < 4; i++) uRack(b, stand([(i - 1.5) * 0.9, 0, 0], 90), P('black'));
    for (const z of [-0.3, 0.3]) box(b, P('black'), O, [0, 0.006, z], [1.6, 0.006, 0.035], 'Y');
  });
  add('rack-u-row-bikes', '駐輪ラック 逆U字4基+自転車2台', (b) => {
    for (let i = 0; i < 4; i++) uRack(b, stand([(i - 1.5) * 0.9, 0, 0], 90), P('grey'));
    bicycle(b, lean(-1.22, 0, -6, 90), 'structure/steel-blue');
    bicycle(b, lean(0.6, 0.05, 6, 90), BLACK);
  });
  add('rack-wave', '駐輪ラック 波形 5山', (b) => waveRack(b, O, P('grey'), 5));
  add('rack-wave-blue', '駐輪ラック 波形 3山 青', (b) => waveRack(b, O, F('enamel-blue'), 3));
  add('rack-wave-bikes', '駐輪ラック 波形+自転車2台', (b) => {
    waveRack(b, O, P('black'), 5);
    bicycle(b, lean(-0.75, 0.1, -5, 90), 'structure/steel-green');
    bicycle(b, lean(0.25, -0.1, 5, 90), 'structure/steel-white');
  });
  add('rack-grid', '駐輪ラック くし形 2.4m', (b) => gridRack(b, O, P('galvanized'), 2.4));
  add('rack-grid-bikes', '駐輪ラック くし形+自転車3台', (b) => {
    gridRack(b, O, P('grey'), 3);
    bicycle(b, lean(-1, 0.45, -4, 90), 'structure/steel-red');
    bicycle(b, lean(0, 0.4, 3, 90), 'structure/steel-yellow');
    bicycle(b, lean(0.9, 0.5, -3, 90), 'structure/steel-blue');
  });
  add('rack-ring', '駐輪ラック 柱+リング', (b) => ringRack(b, O, P('black')));
  add('rack-ring-bike', '駐輪ラック 柱+リング+自転車', (b) => {
    ringRack(b, O, P('green'));
    bicycle(b, lean(0.1, 0.12), BLACK);
  });
  add('rack-u-abandoned', '駐輪ラック 放置自転車(前輪・サドルなし)', (b) => {
    uRack(b, O, P('rusty'));
    bicycle(b, lean(0, 0.12, -9), 'structure/steel-green-rusty', { noFront: true, noSeat: true });
  });
  add('rack-bike-red', '自転車 赤', (b) => bicycle(b, O, 'structure/steel-red'));
  add('rack-bike-blue', '自転車 青', (b) => bicycle(b, O, 'structure/steel-blue'));
  add('rack-bike-fallen', '自転車 倒れ', (b) => bicycle(b, tilt(stand([0, 0.06, 0.4]), -84), 'structure/steel-white'));

  // Planters and tree pits.
  const PLANTERS: [string, string, PlanterOpts][] = [
    ['bowl', 'プランター 洗い出し鉢+低木', { kind: 'bowl' }],
    ['bowl-flowers', 'プランター 洗い出し鉢+赤い花', { kind: 'bowl', plant: 'flowers-red' }],
    ['bowl-dry', 'プランター コンクリート鉢 枯れ気味', { kind: 'bowl', tex: 'structure/wall-smooth', plant: 'shrub-dry' }],
    ['box', 'プランター コンクリート角形+低木', { kind: 'box' }],
    ['box-flowers', 'プランター コンクリート角形+黄色い花', { kind: 'box', plant: 'flowers-yellow' }],
    ['box-exposed', 'プランター 洗い出し角形+紫の花', { kind: 'box', tex: 'concrete/walk-exposed', plant: 'flowers-purple' }],
    ['pot', '素焼き鉢+赤い花', { kind: 'pot', plant: 'flowers-red' }],
    ['pot-large', '素焼き鉢 大+低木', { kind: 'pot', size: 1.7 }],
    ['trough', 'プランター 長方形+生垣', { kind: 'trough' }],
    ['trough-flowers', 'プランター 長方形+花', { kind: 'trough', plant: 'flowers-purple', tex: 'concrete/walk-exposed' }],
    ['wood', 'プランター 木箱+黄色い花', { kind: 'wood', plant: 'flowers-yellow' }],
    ['wood-weathered', 'プランター 風化した木箱 枯れ気味', { kind: 'wood', tex: F('slats-weathered'), plant: 'shrub-dry' }],
    ['tall-corten', 'プランター 耐候性鋼+低木', { kind: 'tall' }],
    ['tall-black', 'プランター 黒い角錐+赤い花', { kind: 'tall', tex: P('black'), plant: 'flowers-red' }],
    ['barrel', 'プランター 樽+花', { kind: 'barrel', plant: 'flowers-yellow' }],
  ];
  for (const [id, label, o] of PLANTERS) add(`planter-${id}`, label, (b) => planter(b, O, o));
  add('planter-pot-trio', '素焼き鉢 3個', (b) => {
    planter(b, stand([-0.45, 0, 0]), { kind: 'pot', size: 1.3, plant: 'shrub' });
    planter(b, stand([0.2, 0, 0.15]), { kind: 'pot', plant: 'flowers-purple' });
    planter(b, stand([0.55, 0, -0.3]), { kind: 'pot', size: 0.75, plant: 'flowers-yellow' });
  });
  add('planter-grate-round', '樹木の根囲い 放射', (b) => treePit(b, O, { grate: 'round' }));
  add('planter-grate-square', '樹木の根囲い 角', (b) => treePit(b, O, { grate: 'square' }));
  add('planter-grate-guard', '樹木の根囲い+保護柵', (b) => treePit(b, O, { grate: 'round', guard: P('black') }));
  add('planter-grate-tree', '樹木の根囲い+若木+保護柵', (b) => treePit(b, O, { grate: 'square', guard: P('green'), tree: true }));
  add('planter-pit', '植樹ます マルチング+れんが縁', (b) => treePit(b, O, {}));
  add('planter-pit-tree', '植樹ます 若木+支柱', (b) => treePit(b, O, { tree: true, stakes: true }));

  // Phones, utilities and advertising.
  add('misc-fountain', '水飲み場 洗い出しコンクリート', (b) => fountain(b, O, 'pedestal', 'concrete/walk-exposed'));
  add('misc-fountain-green', '水飲み場 鋼製 緑', (b) => fountain(b, O, 'arm', F('coat-bin-green')));
  add('misc-fountain-dual', '水飲み場 高低2口', (b) => fountain(b, O, 'dual', F('coat-stainless')));
  add('misc-payphone', '公衆電話', (b) => payphone(b, O, 'payphone', P('grey')));
  add('misc-payphone-tagged', '公衆電話 落書き・壊れ', (b) => payphone(b, O, 'payphone-tagged', P('rusty')));
  add('misc-payphone-pair', '公衆電話 背中合わせ2台', (b) => {
    payphone(b, stand([0, 0, 0.12]), 'payphone', 'structure/steel-blue');
    payphone(b, stand([0, 0, -0.12], 180), 'payphone-tagged', 'structure/steel-blue');
  });
  add('misc-phone-booth', '電話ボックス', (b) => phoneBooth(b, O, P('grey'), 'shelter-glass'));
  add('misc-phone-booth-tagged', '電話ボックス 落書き', (b) => phoneBooth(b, O, P('rusty'), 'shelter-glass-tagged'));
  add('misc-callbox', '非常通報機 赤', (b) => callBox(b, O, F('enamel-red')));
  add('misc-callbox-old', '非常通報機 剥がれ', (b) => callBox(b, O, F('enamel-red-old')));
  add('misc-transformer', '地上変圧器', (b) => padTransformer(b, O, 'transformer-front'));
  add('misc-transformer-tagged', '地上変圧器 落書き', (b) => padTransformer(b, O, 'transformer-tagged'));
  add('misc-transformer-posts', '地上変圧器+防護柱', (b) => padTransformer(b, O, 'transformer-front', 3));
  add('misc-cabinet-telecom', '通信キャビネット ベージュ 2扉', (b) => cabinet(b, O, { w: 1.3, h: 1.2, d: 0.45, door: 'cabinet-beige', doors: 2 }));
  add('misc-cabinet-green', '配電キャビネット 緑', (b) => cabinet(b, O, { w: 0.7, h: 1.0, d: 0.4, door: 'cabinet-green' }));
  add('misc-cabinet-tall', '通信キャビネット アルミ 背高', (b) => cabinet(b, O, { w: 0.8, h: 1.75, d: 0.5, door: 'cabinet-aluminium' }));
  add('misc-cabinet-tagged', '通信キャビネット 落書き', (b) => cabinet(b, O, { w: 1.1, h: 1.3, d: 0.45, door: 'cabinet-tagged', doors: 2 }));
  add('misc-meter-pedestal', '電力量計の柱', (b) => {
    box(b, P('grey'), O, [0, 0.65, 0], [0.16, 0.65, 0.09], 'Y');
    face(b, F('meter-box'), O, [0, 1.05, 0.091], 0.25, 0.35);
  });
  add('misc-backflow', '逆流防止器 赤', (b) => backflow(b, O, F('enamel-red')));
  add('misc-backflow-green', '逆流防止器 緑', (b) => backflow(b, O, F('enamel-green')));
  add('misc-backflow-cage', '逆流防止器 保護かご', (b) => backflow(b, O, F('enamel-blue'), true));
  add('misc-ad-panel', '広告パネル 内照 飲料/携帯電話', (b) => adPanel(b, O, 'cola', 'phone', P('black')));
  add('misc-ad-panel-movie', '広告パネル 内照 映画/ラジオ局', (b) => adPanel(b, O, 'movie', 'radio', P('grey')));
  add('misc-ad-panel-bank', '広告パネル 内照 銀行/サーフ', (b) => adPanel(b, O, 'bank', 'surf', P('bronze')));
  add('misc-ad-panel-faded', '広告パネル 色あせ', (b) => adPanel(b, O, 'burger-faded', 'cola-faded', P('rusty')));
  add('misc-ad-kiosk', '広告塔 3面', (b) => adKiosk(b, O, ['airline', 'burger', 'radio'], P('green')));
  add('misc-ad-kiosk-black', '広告塔 3面 黒', (b) => adKiosk(b, O, ['movie', 'phone', 'surf'], P('black')));
  add('misc-clock', '街頭時計', (b) => streetClock(b, O, P('black'), 'clock'));
  add('misc-clock-green', '街頭時計 緑・飾り腕', (b) => streetClock(b, O, P('green'), 'clock', true));
  add('misc-clock-old', '街頭時計 古い', (b) => streetClock(b, O, P('rusty'), 'clock-old'));
  add('misc-wheel-stop', '車輪止め コンクリート', (b) => wheelStop(b, O, 'structure/wall-smooth'));
  add('misc-wheel-stop-yellow', '車輪止め 黄塗装', (b) => wheelStop(b, O, F('enamel-yellow-old')));
}
