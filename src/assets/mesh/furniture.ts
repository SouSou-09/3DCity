import { MeshBuilder, V3 } from './builder';
import { Pose, at, box, catenary, disc, face, footing, lathe, move, pipe, roll, stand, tilt, turn } from './kit';
import { addModel } from './registry';
import { Lamp, PoleOpts, fitting, luminaire, pole } from './signals';

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
/** Prism: a closed outline of [z, y] points swept along x from x0 to x1, with end caps. */
export function prism(b: MeshBuilder, material: string, f: Pose, outline: [number, number][], x0: number, x1: number, caps = material): void {
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
  const [z0, y0] = [Math.min(...zs), Math.min(...ys)];
  const [cz, cy] = [zs.reduce((a, c) => a + c, 0) / n, ys.reduce((a, c) => a + c, 0) / n];
  for (let i = 0; i < n; i++) {
    const [p, q] = [o[i], o[(i + 1) % n]];
    const uv = (z: number, y: number): [number, number] => [z - z0, y - y0];
    b.tri(caps, at(f, x0, cy, cz), at(f, x0, p[1], p[0]), at(f, x0, q[1], q[0]), [uv(cz, cy), uv(p[0], p[1]), uv(q[0], q[1])]);
    b.tri(caps, at(f, x1, cy, cz), at(f, x1, q[1], q[0]), at(f, x1, p[1], p[0]), [uv(cz, cy), uv(q[0], q[1]), uv(p[0], p[1])]);
  }
}
/** Board lying along x. Its wide face looks up, or to the front when `upright`; the wood grain runs lengthwise. */
function board(b: MeshBuilder, material: string, f: Pose, c: V3, len: number, wide: number, thick: number, upright = false): void {
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
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
  lathe(b, F('coat-brown'), g, [[0, -0.2], [0.12, -0.17], [0.21, -0.02], [0.22, 0]], 10);
  ball(b, F(flowers), g, 0.02, 0.24, 10, 0.75, 0.4, 1);
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
}
