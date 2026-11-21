import { MeshBuilder, V3 } from './builder';
import { addModel } from './registry';
import { Pose, at, box, catenary, disc, face, footing, lathe, move, pipe, plate, roll, shroud, stand, tilt, turn } from './kit';

export type Paint = 'yellow' | 'black' | 'green' | 'grey' | 'yellow-old' | 'black-old';
const paintTex = (p: Paint): string => `signal/housing-${p}`;
const BLACK = 'signal/housing-black';
const ZINC = 'structure/steel-galvanized';

export interface HeadOpts {
  /** Lens textures without the `signal/` prefix, top to bottom (left to right when horizontal). */
  lenses: string[];
  paint?: Paint;
  horizontal?: boolean;
  visor?: 'tunnel' | 'cutaway' | 'cap' | 'none';
  back?: 'none' | 'plain' | 'border';
  /** Lens diameter: 0.3 (12 inch) or 0.2 (8 inch). */
  size?: number;
}
const DEPTH = 0.2;
const pitchOf = (o: HeadOpts): number => (o.size ?? 0.3) * 1.17;
/** Width and height of a head's body. */
export function headSize(o: HeadOpts): [number, number] {
  const s = pitchOf(o);
  return o.horizontal ? [s * o.lenses.length, s] : [s, s * o.lenses.length];
}

/** One signal section: housing, door bezel, lens and visor, centred on the pose. */
function section(b: MeshBuilder, f: Pose, lens: string, o: HeadOpts): void {
  const size = o.size ?? 0.3;
  const s = pitchOf(o);
  const paint = paintTex(o.paint ?? 'yellow');
  box(b, paint, f, [0, 0, 0], [s / 2 - 0.003, s / 2 - 0.003, DEPTH / 2]);
  const r = size / 2;
  shroud(b, paint, BLACK, f, [0, 0, DEPTH / 2], r + 0.012, 0, 360, () => 0.014, 16);
  disc(b, `signal/${lens}`, f, [0, 0, DEPTH / 2 + 0.006], r, 20, 0.146);
  const L = size * 0.8;
  const v = o.visor ?? 'tunnel';
  if (v === 'tunnel') shroud(b, paint, BLACK, f, [0, 0, DEPTH / 2 + 0.01], r + 0.01, -55, 235, () => L, 14);
  else if (v === 'cutaway') shroud(b, paint, BLACK, f, [0, 0, DEPTH / 2 + 0.01], r + 0.01, -30, 210, (d) => L * (0.3 + 0.7 * Math.max(0, Math.sin((d * Math.PI) / 180)) ** 0.7), 14);
  else if (v === 'cap') shroud(b, paint, BLACK, f, [0, 0, DEPTH / 2 + 0.01], r + 0.01, 15, 165, () => L * 0.8, 10);
}

/** Backplate behind a group of sections; (w, h) is the body it surrounds. */
function backplate(b: MeshBuilder, f: Pose, w: number, h: number, kind: 'plain' | 'border', margin = 0.13): void {
  const [W, H] = [w + margin * 2, h + margin * 2];
  box(b, BLACK, f, [0, 0, 0.03], [W / 2, H / 2, 0.003]);
  if (kind === 'border') {
    const t = 0.05;
    const z = 0.0345;
    const Y = 'signal/reflective-yellow';
    face(b, Y, f, [0, H / 2 - t / 2, z], W, t, [0, 0, W, t]);
    face(b, Y, f, [0, -H / 2 + t / 2, z], W, t, [0, 0, W, t]);
    face(b, Y, f, [-W / 2 + t / 2, 0, z], t, H - t * 2, [0, 0, t, H - t * 2]);
    face(b, Y, f, [W / 2 - t / 2, 0, z], t, H - t * 2, [0, 0, t, H - t * 2]);
  }
}

/** Signal head centred on the pose and facing +z. */
export function head(b: MeshBuilder, f: Pose, o: HeadOpts): void {
  const s = pitchOf(o);
  const n = o.lenses.length;
  o.lenses.forEach((lens, i) => {
    const k = (n - 1) / 2 - i;
    section(b, o.horizontal ? move(f, -k * s, 0, 0) : move(f, 0, k * s, 0), lens, o);
  });
  const [w, h] = headSize(o);
  if (o.back && o.back !== 'none') backplate(b, f, w, h, o.back);
}

/** Five-section cluster: red on top, two columns of two below. Lenses: [top, left-upper, left-lower, right-upper, right-lower]. */
export function doghouse(b: MeshBuilder, f: Pose, o: HeadOpts): void {
  const s = pitchOf(o);
  const pos: [number, number][] = [[0, s], [-s / 2, 0], [-s / 2, -s], [s / 2, 0], [s / 2, -s]];
  o.lenses.forEach((lens, i) => section(b, move(f, pos[i][0], pos[i][1], 0), lens, o));
  if (o.back && o.back !== 'none') {
    const m = 0.11;
    box(b, BLACK, f, [0, s, 0.03], [s / 2 + m, s / 2 + m, 0.003]);
    box(b, BLACK, f, [0, -s / 2, 0.03], [s + m, s + m, 0.003]);
    if (o.back === 'border') {
      const Y = 'signal/reflective-yellow';
      const t = 0.05;
      const z = 0.0345;
      const bar = (x: number, y: number, w: number, h: number): void => face(b, Y, f, [x, y, z], w, h, [0, 0, w, h]);
      bar(0, s * 1.5 + m - t / 2, s + m * 2, t);
      bar(0, -s * 1.5 - m + t / 2, s * 2 + m * 2, t);
      for (const sx of [-1, 1]) {
        bar(sx * (s + m - t / 2), -s / 2, t, s * 2 + m * 2 - t * 2);
        bar(sx * (s / 2 + m - t / 2), s + m / 2, t, s + m - t);
        bar(sx * (s * 0.75 + m - t / 2), s / 2 + m - t / 2, s / 2 - t, t);
      }
    }
  }
}

// --- Lens sets. ---
type Lit = 'r' | 'y' | 'g' | 'off';
const kindOf = (glass?: boolean): string => (glass ? 'glass' : 'lens');
/** Red / yellow / green ball lenses with one of them lit. */
export const balls = (lit: Lit, glass?: boolean): string[] =>
  (['red', 'yellow', 'green'] as const).map((c) => `${kindOf(glass)}-${c}-${c[0] === lit ? 'on' : 'off'}`);
const arrows = (lit: Lit, dir: 'left' | 'right'): string[] => (['red', 'yellow', 'green'] as const).map((c) => (c[0] === lit ? `arrow-${c}-${dir}` : 'lens-off'));

// --- Poles. ---
export interface PoleOpts {
  h: number;
  r0: number;
  r1?: number;
  tex: string;
  base?: 'plate' | 'cast' | 'pedestal' | 'buried' | 'fluted';
  sides?: number;
  cap?: 'dome' | 'flat' | 'ball' | 'none';
}
export function pole(b: MeshBuilder, f: Pose, o: PoleOpts): void {
  const r1 = o.r1 ?? o.r0;
  const sides = o.sides ?? 10;
  const base = o.base ?? 'plate';
  let y0 = 0;
  if (base === 'plate') {
    footing(b, o.tex, f, o.r0 * 1.9);
    y0 = 0.03;
  } else if (base === 'cast') {
    footing(b, o.tex, f, o.r0 * 2.1, { bolts: false, thick: 0.02 });
    lathe(b, o.tex, f, [[o.r0 * 2.3, 0.02], [o.r0 * 2.3, 0.1], [o.r0 * 1.8, 0.14], [o.r0 * 1.65, 0.5], [o.r0 * 1.2, 0.6], [o.r0, 0.64]], sides);
    y0 = 0.64;
  } else if (base === 'fluted') {
    footing(b, o.tex, f, o.r0 * 2.6, { bolts: false, thick: 0.02 });
    lathe(b, o.tex, f, [[o.r0 * 2.6, 0.02], [o.r0 * 2.6, 0.12], [o.r0 * 2.1, 0.2], [o.r0 * 2.2, 0.28], [o.r0 * 1.7, 0.36], [o.r0 * 1.5, 0.9], [o.r0 * 1.8, 0.96], [o.r0 * 1.8, 1.02], [o.r0, 1.1]], 8);
    y0 = 1.1;
  } else if (base === 'pedestal') {
    footing(b, 'concrete/walk-square', f, 0, { concrete: o.r0 * 4.5, bolts: false, thick: 0 });
    box(b, o.tex, f, [0, 0.19, 0], [o.r0 * 2.6, 0.19, o.r0 * 2.6], 'Y');
    lathe(b, o.tex, f, [[o.r0 * 1.7, 0.38], [o.r0 * 1.7, 0.42], [o.r0, 0.46]], sides);
    y0 = 0.42;
  }
  const profile: [number, number][] = [[o.r0, y0], [r1, o.h]];
  const cap = o.cap ?? 'dome';
  if (cap === 'dome') profile.push([r1 * 0.8, o.h + r1 * 0.35], [0, o.h + r1 * 0.5]);
  else if (cap === 'flat') profile.push([0, o.h]);
  else if (cap === 'ball') profile.push([r1 * 0.5, o.h + 0.02], [r1 * 1.1, o.h + r1 * 0.9], [r1 * 1.1, o.h + r1 * 1.5], [0, o.h + r1 * 2.4]);
  lathe(b, o.tex, f, profile, sides);
}

// --- Mounting hardware. ---
/** Head mounted on the side of a pole with two pipe brackets; `side` is -1 (left of the pole) or 1. Returns the head pose. */
function sideMount(b: MeshBuilder, f: Pose, y: number, o: HeadOpts, side: number, reach = 0.36, twin = false): Pose {
  const [, h] = headSize(o);
  const hp = move(f, side * reach, y, 0);
  (twin ? doghouse : head)(b, hp, o);
  const top = twin ? pitchOf(o) * 1.5 : h / 2;
  const bottom = twin ? -pitchOf(o) * 1.5 : -h / 2;
  for (const [yy, d] of [[top, 0.07], [bottom, -0.07]]) {
    pipe(b, paintTex(o.paint ?? 'yellow'), [at(f, 0, y + yy + d, 0), at(f, side * (reach - 0.05), y + yy + d, 0), at(f, side * reach, y + yy + d * 0.6, 0), at(f, side * reach, y + yy, 0)], 0.025, 6);
  }
  return hp;
}
/** Head standing on top of a pole (post-top slip fitter). */
function topMount(b: MeshBuilder, f: Pose, y: number, o: HeadOpts): void {
  const [, h] = headSize(o);
  lathe(b, paintTex(o.paint ?? 'yellow'), move(f, 0, y, 0), [[0.07, 0], [0.07, 0.07], [0.03, 0.1], [0.03, 0.13]], 8);
  head(b, move(f, 0, y + 0.13 + h / 2, 0), o);
}
/** Head fixed in front of something round (a mast arm or pole) at the pose's origin, with a clamp bracket behind it. */
function clampMount(b: MeshBuilder, f: Pose, o: HeadOpts, armR: number, dy = 0, twin = false): void {
  const [, h] = headSize(o);
  const hz = armR + 0.09 + DEPTH / 2;
  const top = twin ? pitchOf(o) * 1.5 : h / 2;
  const bottom = twin ? -pitchOf(o) * 1.5 : -h / 2;
  (twin ? doghouse : head)(b, move(f, 0, dy, hz), o);
  pipe(b, ZINC, [at(f, 0, dy + top + 0.05, hz), at(f, 0, dy + top + 0.05, armR + 0.04), at(f, 0, dy + bottom - 0.05, armR + 0.04), at(f, 0, dy + bottom - 0.05, hz)], 0.02, 6);
  box(b, ZINC, f, [0, dy + top + 0.025, hz], [0.03, 0.025, 0.03]);
  box(b, ZINC, f, [0, dy + bottom - 0.025, hz], [0.03, 0.025, 0.03]);
  box(b, ZINC, f, [0, 0, 0], [0.05, armR + 0.012, armR + 0.012]);
}

export interface PedOpts {
  face: string | [string, string];
  paint?: Paint;
}
/** Pedestrian head centred on the pose; a pair of faces makes the older two-section type. */
export function pedHead(b: MeshBuilder, f: Pose, o: PedOpts): void {
  const paint = paintTex(o.paint ?? 'black');
  const faces = typeof o.face === 'string' ? [o.face] : o.face;
  const s = faces.length === 1 ? 0.46 : 0.34;
  faces.forEach((id, i) => {
    const g = move(f, 0, ((faces.length - 1) / 2 - i) * s, 0);
    box(b, paint, g, [0, 0, 0], [s / 2, s / 2, 0.085]);
    face(b, `signal/${id}`, g, [0, 0, 0.087], s - 0.05, s - 0.05);
    const v = 0.16;
    box(b, paint, g, [0, s / 2 - 0.006, 0.085 + v / 2], [s / 2, 0.004, v / 2]);
    for (const sx of [-1, 1]) box(b, paint, g, [sx * (s / 2 - 0.004), 0.02, 0.085 + v / 2], [0.004, s / 2 - 0.03, v / 2]);
  });
}
/** Pedestrian head on a pole, facing the pose's +z, with a clamshell bracket. */
function pedMount(b: MeshBuilder, f: Pose, y: number, r: number, o: PedOpts, side = 0): void {
  const n = typeof o.face === 'string' ? 1 : 2;
  const hh = n === 1 ? 0.23 : 0.34;
  if (side) {
    const g = move(f, side * (r + 0.3), y, 0);
    pedHead(b, g, o);
    for (const yy of [hh + 0.03, -hh - 0.03]) pipe(b, paintTex(o.paint ?? 'black'), [at(f, 0, y + yy, 0), at(f, side * (r + 0.3), y + yy, 0), at(f, side * (r + 0.3), y + yy - Math.sign(yy) * 0.03, 0)], 0.022, 6);
  } else {
    pedHead(b, move(f, 0, y, r + 0.13), o);
    box(b, paintTex(o.paint ?? 'black'), f, [0, y, r + 0.02], [0.06, hh * 0.8, 0.03]);
  }
}
/** Push button with its instruction plaque, on the side of a pole facing +z. */
function button(b: MeshBuilder, f: Pose, r: number, y = 1.07, sign = 'sign/ped-button'): void {
  box(b, 'signal/housing-yellow', f, [0, y, r + 0.03], [0.06, 0.1, 0.03]);
  face(b, 'signal/button', f, [0, y, r + 0.0615], 0.12, 0.2);
  if (sign) plate(b, sign, f, [0, y + 0.3, r + 0.012]);
}

export type Lamp = 'cobra' | 'cobra-on' | 'led' | 'led-on' | 'shoebox' | 'shoebox-on';
/** Street light fitting whose neck is at the pose's origin, reaching along -x and lighting downwards. */
function fitting(b: MeshBuilder, f: Pose, kind: Lamp, tex: string): void {
  const on = kind.endsWith('-on');
  const down: Pose = { o: f.o, x: f.x, y: f.z, z: [-f.y[0], -f.y[1], -f.y[2]] };
  if (kind.startsWith('cobra')) {
    const g: Pose = { o: f.o, x: [-f.z[0], -f.z[1], -f.z[2]], y: [-f.x[0], -f.x[1], -f.x[2]], z: f.y };
    lathe(b, 'signal/pole-grey', g, [[0.035, -0.05], [0.06, 0.08], [0.15, 0.36], [0.17, 0.58], [0.14, 0.74], [0, 0.78]], 12, 0.42);
    face(b, on ? 'signal/lamp-sodium-on' : 'signal/lamp-glass-off', move(down, -0.5, 0, 0.073), [0, 0, 0], 0.36, 0.2);
  } else if (kind.startsWith('led')) {
    box(b, 'signal/pole-grey', f, [-0.35, 0, 0], [0.33, 0.03, 0.15]);
    for (let i = 0; i < 5; i++) box(b, 'signal/pole-grey', f, [-0.2 - i * 0.09, 0.045, 0], [0.012, 0.018, 0.13]);
    face(b, on ? 'signal/lamp-led-on' : 'signal/lamp-led-off', move(down, -0.4, 0, 0.032), [0, 0, 0], 0.4, 0.22);
  } else {
    box(b, tex, f, [-0.4, 0, 0], [0.36, 0.07, 0.2]);
    face(b, on ? 'signal/lamp-led-on' : 'signal/lamp-glass-off', move(down, -0.4, 0, 0.072), [0, 0, 0], 0.6, 0.32);
  }
}
/** Street light arm from a pole top (pose origin) reaching `len` along -x. */
function luminaire(b: MeshBuilder, f: Pose, len: number, kind: Lamp, tex: string, rise = 0.5): void {
  const pts: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const q = i / 10;
    pts.push(at(f, -len * q, rise * Math.sin((q * Math.PI) / 2), 0));
  }
  pipe(b, tex, pts, 0.035, 8);
  fitting(b, move(f, -len, rise, 0), kind, tex);
}

export type ArmKind = 'straight' | 'curved' | 'monotube' | 'truss' | 'guyed';
interface ArmOpts {
  len: number;
  h: number;
  kind?: ArmKind;
  tex: string;
  r?: number;
}
/** Mast arm from a pole at the pose reaching along -x. Returns the pose on the arm at a distance from the pole. */
function mastArm(b: MeshBuilder, f: Pose, o: ArmOpts): (d: number) => Pose {
  const kind = o.kind ?? 'straight';
  const r0 = o.r ?? 0.1;
  const rAt = (q: number): number => r0 * (1 - 0.5 * q);
  const yAt = (d: number): number => {
    const q = d / o.len;
    if (kind === 'curved') return o.h + 0.9 * Math.sin((Math.min(1, q * 1.6) * Math.PI) / 2);
    if (kind === 'monotube') return o.h;
    if (kind === 'truss') return o.h;
    return o.h + d * 0.035;
  };
  const pts: V3[] = [];
  const n = kind === 'curved' ? 16 : 6;
  for (let i = 0; i <= n; i++) pts.push(at(f, (-o.len * i) / n, yAt((o.len * i) / n), 0));
  if (kind === 'monotube') {
    const R = 1.2;
    const bend: V3[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = ((i / 8) * Math.PI) / 2;
      bend.push(at(f, -R * (1 - Math.cos(a)), o.h - R + R * Math.sin(a), 0));
    }
    pipe(b, o.tex, [...bend, ...pts.slice(2)], (q) => r0 * 1.25 * (1 - 0.55 * q), 10);
  } else {
    pipe(b, o.tex, pts, rAt, 10);
    box(b, o.tex, f, [-0.02, o.h, 0], [0.03, r0 * 1.7, r0 * 1.7]);
  }
  if (kind === 'truss') {
    const top: V3[] = [at(f, 0, o.h + 0.9, 0), at(f, -o.len * 0.92, o.h + 0.05, 0)];
    pipe(b, o.tex, top, 0.04, 6);
    for (let i = 1; i <= 5; i++) {
      const q = i / 6;
      const x = -o.len * 0.92 * q;
      pipe(b, o.tex, [at(f, x, o.h, 0), at(f, x, o.h + 0.9 - 0.85 * q, 0)], 0.022, 6, false);
      const x1 = -o.len * 0.92 * ((i - 1) / 6);
      pipe(b, o.tex, [at(f, x1, o.h + 0.9 - 0.85 * ((i - 1) / 6), 0), at(f, x, o.h, 0)], 0.018, 6, false);
    }
  }
  if (kind === 'guyed') pipe(b, ZINC, [at(f, 0, o.h + 1.5, 0), at(f, -o.len * 0.6, yAt(o.len * 0.6), 0)], 0.012, 6, false);
  return (d) => move(f, -d, yAt(d), 0);
}
const armR = (o: ArmOpts, d: number): number => (o.r ?? 0.1) * (o.kind === 'monotube' ? 1.25 * (1 - 0.55 * (d / o.len)) : 1 - 0.5 * (d / o.len));

/** Sign hung on a mast arm at pose `f` (on the arm axis). */
function armSign(b: MeshBuilder, f: Pose, r: number, sign: string, dy = 0): void {
  const [w] = plate(b, sign, f, [0, dy, r + 0.03]);
  for (const sx of [-1, 1]) box(b, ZINC, f, [sx * Math.min(0.5, w * 0.3), dy * 0.5, r + 0.012], [0.02, Math.abs(dy) * 0.5 + r + 0.02, 0.014]);
}

/** Lane-control head: a square LED face in a hooded box. */
function laneHead(b: MeshBuilder, f: Pose, tex: string): void {
  box(b, BLACK, f, [0, 0, 0], [0.26, 0.26, 0.1]);
  face(b, `signal/${tex}`, f, [0, 0, 0.102], 0.45, 0.45);
  box(b, BLACK, f, [0, 0.256, 0.2], [0.26, 0.004, 0.1]);
  for (const sx of [-1, 1]) box(b, BLACK, f, [sx * 0.256, 0.03, 0.2], [0.004, 0.23, 0.1]);
}

/** Controller cabinet standing on a concrete pad, door facing +z. */
export function cabinet(b: MeshBuilder, f: Pose, o: { w?: number; h?: number; d?: number; door: string; doors?: number; pad?: boolean; y?: number }): void {
  const [w, h, d] = [o.w ?? 0.75, o.h ?? 1.4, o.d ?? 0.6];
  const y = o.y ?? (o.pad === false ? 0 : 0.12);
  if (o.pad !== false && !o.y) box(b, 'concrete/walk-square', f, [0, 0.06, 0], [w / 2 + 0.12, 0.06, d / 2 + 0.12], 'Y');
  const SIDE = 'signal/cabinet-side';
  box(b, SIDE, f, [0, y + h / 2, 0], [w / 2, h / 2, d / 2], o.y ? '' : 'Y');
  box(b, SIDE, f, [0, y + h + 0.015, 0.01], [w / 2 + 0.02, 0.015, d / 2 + 0.03]);
  const n = o.doors ?? 1;
  for (let i = 0; i < n; i++) face(b, `signal/${o.door}`, f, [(-w / 2) + (w / n) * (i + 0.5), y + h / 2, d / 2 + 0.003], w / n - 0.01, h - 0.02);
  face(b, `signal/${o.door}`, turn(f, 180), [0, y + h / 2, d / 2 + 0.003], w - 0.01, h - 0.02);
}

// --- Whole installations. ---
export interface MastOpts {
  arm: number;
  kind?: ArmKind;
  tex?: string;
  paint?: Paint;
  /** Heads on the arm, listed from the tip towards the pole. */
  heads: (HeadOpts & { twin?: boolean })[];
  spacing?: number;
  /** Extra head on the pole itself. */
  poleHead?: HeadOpts & { twin?: boolean };
  /** Signs on the arm between the heads and the pole. */
  signs?: string[];
  street?: string;
  lamp?: Lamp;
  ped?: (PedOpts & { yaw: number })[];
  buttons?: number[];
  base?: PoleOpts['base'];
  /** Heads for the cross street on the back of the arm. */
  rear?: HeadOpts[];
}
export function mast(b: MeshBuilder, f: Pose, o: MastOpts): void {
  const tex = o.tex ?? 'signal/pole-galvanized';
  const armH = 6.1;
  const mono = o.kind === 'monotube';
  const top = o.lamp ? 9.2 : o.kind === 'truss' ? armH + 1 : o.kind === 'guyed' ? armH + 1.6 : mono ? armH - 1.2 : armH + 0.45;
  const r0 = 0.1 + o.arm * 0.008;
  pole(b, f, { h: top, r0, r1: mono && !o.lamp ? r0 * 0.9 : r0 * 0.62, tex, base: o.base ?? 'plate', cap: mono && !o.lamp ? 'none' : 'dome', sides: 12 });
  const arm: ArmOpts = { len: o.arm, h: armH, kind: o.kind, tex, r: 0.07 + o.arm * 0.004 };
  const on = mastArm(b, f, arm);
  const gap = o.spacing ?? 3.4;
  o.heads.forEach((h, i) => {
    const d = o.arm - 0.35 - i * gap;
    const paint = h.paint ?? o.paint;
    clampMount(b, on(d), { ...h, paint }, armR(arm, d), h.twin ? -0.1 : 0, h.twin);
  });
  (o.rear ?? []).forEach((h, i) => {
    const d = o.arm - 2 - i * gap;
    clampMount(b, turn(on(d), 180), { ...h, paint: h.paint ?? o.paint }, armR(arm, d));
  });
  let d = o.arm - 0.35 - (o.heads.length - 1) * gap - 1.3;
  for (const s of o.signs ?? []) {
    armSign(b, on(d), armR(arm, d), s);
    d -= 1.1;
  }
  if (o.street) armSign(b, on(Math.max(1.6, Math.min(d - 0.6, 2.4))), armR(arm, 2), o.street, -0.42);
  if (o.poleHead) sideMount(b, f, 3.6, { ...o.poleHead, paint: o.poleHead.paint ?? o.paint }, 1, r0 + 0.3, o.poleHead.twin);
  if (o.lamp) luminaire(b, move(f, 0, top - 0.1, 0), 2.6, o.lamp, tex);
  for (const p of o.ped ?? []) pedMount(b, turn(f, p.yaw), 2.75, r0 * 0.9, p);
  for (const yaw of o.buttons ?? []) button(b, turn(f, yaw), r0 * 0.97);
}

export interface SpanOpts {
  width: number;
  poles: 'wood' | 'steel' | 'concrete';
  heads: (HeadOpts & { x: number; yaw?: number; twin?: boolean })[];
  tether?: boolean;
  signs?: { id: string; x: number }[];
  lamp?: Lamp;
}
/** Heads hung from a cable between two strain poles standing on the x axis. */
export function span(b: MeshBuilder, f: Pose, o: SpanOpts): void {
  const half = o.width / 2;
  const tex = o.poles === 'wood' ? 'signal/pole-wood' : o.poles === 'steel' ? 'signal/pole-galvanized' : 'signal/pole-concrete';
  const [r0, h] = o.poles === 'wood' ? [0.16, 9] : o.poles === 'steel' ? [0.19, 8.6] : [0.2, 8.6];
  const yWire = 7.9;
  const BLK = 'signal/housing-black';
  for (const sx of [-1, 1]) {
    const p = move(f, sx * half, 0, 0);
    pole(b, p, { h, r0, r1: r0 * 0.62, tex, base: o.poles === 'steel' ? 'plate' : 'buried', cap: o.poles === 'wood' ? 'flat' : 'dome', sides: 12 });
    if (o.poles === 'wood') {
      pipe(b, ZINC, [at(p, 0, yWire + 0.2, 0), at(p, sx * 3.2, 0, 0)], 0.008, 5, false);
      pipe(b, 'signal/housing-yellow', [at(p, sx * 3.2, 0, 0), at(p, sx * 2.35, 2.1, 0)], 0.022, 6, false);
    }
  }
  const sag = o.width * 0.035;
  const wire = catenary(at(f, -half, yWire, 0), at(f, half, yWire, 0), sag, 16);
  pipe(b, ZINC, wire, 0.008, 5, false);
  const wireY = (x: number): number => {
    const q = (x + half) / o.width;
    return yWire - sag * 4 * q * (1 - q);
  };
  let low = Infinity;
  for (const hd of o.heads) {
    const [, hh] = headSize(hd);
    const tall = hd.twin ? pitchOf(hd) * 3 : hh;
    const yTop = wireY(hd.x) - 0.28;
    const g = turn(move(f, hd.x, yTop - (hd.twin ? pitchOf(hd) * 1.5 + pitchOf(hd) : tall / 2), 0), hd.yaw ?? 0);
    const centre = hd.twin ? move(g, 0, pitchOf(hd), 0) : g;
    (hd.twin ? doghouse : head)(b, hd.twin ? move(g, 0, pitchOf(hd) * 0.5, 0) : centre, hd);
    pipe(b, BLK, [at(f, hd.x, wireY(hd.x) + 0.02, 0), at(f, hd.x, yTop, 0)], 0.018, 6, false);
    box(b, ZINC, f, [hd.x, wireY(hd.x), 0], [0.05, 0.03, 0.03]);
    low = Math.min(low, yTop - tall);
  }
  for (const s of o.signs ?? []) {
    const y = wireY(s.x);
    const [w, hh] = plate(b, s.id, f, [s.x, y - 0.12 - b.part(s.id).mh / 2, 0]);
    for (const sx of [-1, 1]) pipe(b, ZINC, [at(f, s.x + sx * w * 0.35, y, 0), at(f, s.x + sx * w * 0.35, y - 0.14, 0)], 0.008, 4, false);
    low = Math.min(low, y - 0.12 - hh);
  }
  if (o.tether) {
    const y = low - 0.08;
    pipe(b, ZINC, [at(f, -half, y + 0.25, 0), ...o.heads.map((hd) => at(f, hd.x, y, 0)).sort((p, q) => p[0] - q[0]), at(f, half, y + 0.25, 0)], 0.005, 4, false);
    for (const hd of o.heads) pipe(b, BLK, [at(f, hd.x, y, 0), at(f, hd.x, y + 0.1, 0)], 0.012, 5, false);
  }
  if (o.lamp) luminaire(b, turn(move(f, half, h - 0.15, 0), 0), 2.4, o.lamp, 'signal/pole-galvanized');
}

/** Pair of railway flashers on a crossarm, facing +z. */
function flashers(b: MeshBuilder, f: Pose, lit: [boolean, boolean], glass = true): void {
  pipe(b, 'signal/pole-grey', [at(f, -0.5, 0, 0.06), at(f, 0.5, 0, 0.06)], 0.03, 6);
  [-0.38, 0.38].forEach((x, i) => {
    const g = move(f, x, 0, 0.1);
    lathe(b, BLACK, { o: g.o, x: g.x, y: g.z, z: [-g.y[0], -g.y[1], -g.y[2]] }, [[0, -0.02], [0.28, -0.02], [0.28, 0], [0.19, 0.01], [0.17, 0.1], [0, 0.1]], 18);
    box(b, BLACK, g, [0, 0, 0.02], [0.17, 0.17, 0.07]);
    disc(b, `signal/${glass ? 'glass' : 'lens'}-red-${lit[i] ? 'on' : 'off'}`, g, [0, 0, 0.102], 0.15, 20, 0.146);
    shroud(b, BLACK, BLACK, g, [0, 0, 0.1], 0.16, -20, 200, (d) => 0.3 * (0.35 + 0.65 * Math.max(0, Math.sin((d * Math.PI) / 180))), 12);
  });
}
export interface RailOpts {
  gate?: 'down' | 'up' | 'half';
  gateLen?: number;
  lit?: [boolean, boolean];
  tracks?: boolean;
  bell?: boolean;
  both?: boolean;
  cantilever?: number;
  tex?: string;
  crossbuck?: boolean;
}
/** Railway crossing signal: crossbuck, flashers, bell and gate. */
export function railSignal(b: MeshBuilder, f: Pose, o: RailOpts): void {
  const tex = o.tex ?? 'signal/pole-grey';
  const r = 0.065;
  const h = o.cantilever ? 7 : 4.6;
  pole(b, f, { h, r0: o.cantilever ? 0.14 : r, r1: o.cantilever ? 0.11 : r, tex, base: 'cast', cap: o.bell ? 'none' : 'dome' });
  const pr = o.cantilever ? 0.13 : r;
  if (o.crossbuck !== false) {
    plate(b, 'sign/rr-crossbuck-railroad', roll(move(f, 0, 3.9, pr + 0.02), -45), [0, 0, 0]);
    plate(b, 'sign/rr-crossbuck-crossing', roll(move(f, 0, 3.9, pr + 0.03), 45), [0, 0, 0]);
    if (o.tracks) plate(b, 'sign/rr-tracks', f, [0, 3.2, pr + 0.02]);
  }
  const lit = o.lit ?? [true, false];
  flashers(b, move(f, 0, 2.5, pr), lit);
  if (o.both) flashers(b, turn(move(f, 0, 2.5, -pr), 180), lit);
  if (o.bell) {
    lathe(b, 'signal/pole-grey', move(f, 0, h, 0), [[r, 0], [r * 0.6, 0.04], [0.17, 0.06], [0.16, 0.14], [0.1, 0.22], [0, 0.25]], 14);
  }
  if (o.cantilever) {
    const L = o.cantilever;
    for (const y of [6.2, 6.8]) pipe(b, tex, [at(f, 0, y, 0), at(f, -L, y, 0)], 0.05, 8);
    for (let i = 0; i <= Math.round(L / 0.8); i++) {
      const x = (-L * i) / Math.round(L / 0.8);
      pipe(b, tex, [at(f, x, 6.2, 0), at(f, x, 6.8, 0)], 0.02, 5, false);
      if (i > 0) pipe(b, tex, [at(f, x + L / Math.round(L / 0.8), i % 2 ? 6.2 : 6.8, 0), at(f, x, i % 2 ? 6.8 : 6.2, 0)], 0.016, 5, false);
    }
    for (const x of [-L + 0.6, -L + 3.9]) {
      if (x > -1) continue;
      pipe(b, tex, [at(f, x, 6.2, 0), at(f, x, 5.75, 0)], 0.03, 6);
      flashers(b, move(f, x, 5.75, 0), [lit[1], lit[0]]);
    }
  }
  if (o.gate) {
    const len = o.gateLen ?? 7.5;
    const ang = o.gate === 'down' ? 0 : o.gate === 'up' ? 84 : 40;
    box(b, tex, f, [0, 1.15, -0.02], [0.2, 0.3, 0.19]);
    const pivot = roll(move(f, 0, 1.25, 0), -ang);
    for (const z of [-0.24, 0.24]) {
      box(b, tex, pivot, [0.35, 0, z], [0.6, 0.05, 0.012]);
      box(b, tex, pivot, [0.82, 0, z], [0.14, 0.2, 0.03]);
    }
    const a = at(pivot, -0.2, 0, 0.24);
    const e = at(pivot, -len, 0, 0.24);
    b.beam('sign/gate-arm', a, e, 0.02, 0.11, pivot.y);
    b.beam(tex, at(pivot, 0.2, 0, 0.24), a, 0.03, 0.12, pivot.y);
    for (const q of [0.35, 0.68, 0.99]) {
      const g = move(pivot, -len * q, 0.1, 0.24);
      box(b, BLACK, g, [0, 0, 0], [0.05, 0.05, 0.04]);
      disc(b, `signal/lens-red-${o.gate === 'up' ? 'off' : 'on'}`, g, [0, 0, 0.042], 0.045, 10, 0.146);
    }
  }
}

// --- Catalogue. ---
const O = stand();
const PAINT_JP: Record<Paint, string> = { yellow: '黄', black: '黒', green: '深緑', grey: '灰', 'yellow-old': '黄・色あせ', 'black-old': '黒・色あせ' };
const LIT_JP: Record<Lit, string> = { r: '赤', y: '黄', g: '青', off: '消灯' };
const FYA = ['arrow-red-left', 'lens-off', 'arrow-yellow-left', 'lens-off'];
const DOG_G = ['lens-red-off', 'lens-off', 'arrow-green-left', 'lens-yellow-off', 'lens-green-on'];
const DOG_R = ['lens-red-on', 'lens-off', 'lens-off', 'lens-yellow-off', 'lens-green-off'];
const DOG_RIGHT = ['lens-red-on', 'lens-yellow-off', 'lens-green-off', 'lens-off', 'arrow-green-right'];
const pedestal = (b: MeshBuilder, f: Pose, h: number, tex = 'signal/pole-grey', base: PoleOpts['base'] = 'pedestal'): void => pole(b, f, { h, r0: 0.057, tex, base });

export function addSignals(): void {
  const sig = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('signal', id, label, fn);

  // Bare heads.
  for (const lit of ['r', 'y', 'g', 'off'] as Lit[]) {
    sig(`head-3-${lit}`, `灯器 縦3灯 ${LIT_JP[lit]}`, (b) => head(b, O, { lenses: balls(lit), back: 'plain' }));
    sig(`head-3-horizontal-${lit}`, `灯器 横3灯 ${LIT_JP[lit]}`, (b) => head(b, O, { lenses: balls(lit), horizontal: true, back: 'border', paint: 'black' }));
  }
  for (const paint of ['yellow', 'black', 'green', 'grey', 'yellow-old', 'black-old'] as Paint[]) {
    sig(`head-3-paint-${paint}`, `灯器 縦3灯 筐体${PAINT_JP[paint]}`, (b) => head(b, O, { lenses: balls('g'), paint, visor: 'cutaway' }));
  }
  sig('head-3-visor-cap', '灯器 縦3灯 短い庇', (b) => head(b, O, { lenses: balls('y'), visor: 'cap', paint: 'black' }));
  sig('head-3-visor-none', '灯器 縦3灯 庇なし', (b) => head(b, O, { lenses: balls('r'), visor: 'none', paint: 'green' }));
  sig('head-3-border', '灯器 縦3灯 反射縁つき背面板', (b) => head(b, O, { lenses: balls('r'), paint: 'black', back: 'border' }));
  sig('head-3-glass', '灯器 縦3灯 電球式レンズ', (b) => head(b, O, { lenses: balls('r', true), paint: 'yellow-old', visor: 'cutaway' }));
  sig('head-3-glass-green', '灯器 縦3灯 電球式 青', (b) => head(b, O, { lenses: balls('g', true), paint: 'black-old', visor: 'tunnel', back: 'plain' }));
  sig('head-3-small', '灯器 縦3灯 小型(8インチ)', (b) => head(b, O, { lenses: balls('g'), size: 0.2, paint: 'green' }));
  sig('head-3-mixed', '灯器 縦3灯 赤だけ大型', (b) => {
    head(b, move(O, 0, 0.3, 0), { lenses: ['lens-red-on'] });
    head(b, move(O, 0, -0.11, 0), { lenses: ['lens-yellow-off', 'lens-green-off'], size: 0.2 });
  });
  for (const dir of ['left', 'right'] as const) {
    sig(`head-3-arrow-${dir}-g`, `灯器 矢印3灯(${dir === 'left' ? '左' : '右'}) 青`, (b) => head(b, O, { lenses: arrows('g', dir), back: 'border', paint: 'black' }));
    sig(`head-3-arrow-${dir}-r`, `灯器 矢印3灯(${dir === 'left' ? '左' : '右'}) 赤`, (b) => head(b, O, { lenses: arrows('r', dir), back: 'plain' }));
    sig(`head-4-${dir}`, `灯器 縦4灯 ${dir === 'left' ? '左' : '右'}矢印つき`, (b) => head(b, O, { lenses: [...balls('r'), `arrow-green-${dir}`], back: 'plain' }));
  }
  sig('head-4-fya', '灯器 縦4灯 黄点滅矢印', (b) => head(b, O, { lenses: FYA, back: 'border', paint: 'black' }));
  sig('head-4-horizontal', '灯器 横4灯 左矢印つき', (b) => head(b, O, { lenses: ['arrow-green-left', ...balls('r')], horizontal: true, back: 'plain' }));
  sig('head-5-vertical', '灯器 縦5灯', (b) => head(b, O, { lenses: [...balls('g'), 'lens-off', 'arrow-green-left'], back: 'plain' }));
  sig('head-5-horizontal', '灯器 横5灯', (b) => head(b, O, { lenses: [...balls('r'), 'arrow-yellow-right', 'lens-off'], horizontal: true, back: 'border', paint: 'black' }));
  sig('head-doghouse', '灯器 5灯ドッグハウス型', (b) => doghouse(b, O, { lenses: DOG_G, back: 'plain' }));
  sig('head-doghouse-border', '灯器 ドッグハウス型 反射縁', (b) => doghouse(b, O, { lenses: DOG_R, back: 'border', paint: 'black' }));
  sig('head-doghouse-right', '灯器 ドッグハウス型 右矢印', (b) => doghouse(b, O, { lenses: DOG_RIGHT, paint: 'green', visor: 'cutaway' }));
  sig('head-bike', '灯器 自転車用', (b) => head(b, O, { lenses: ['bike-red', 'lens-off', 'lens-off'], size: 0.2, paint: 'black', back: 'plain' }));
  sig('head-bike-green', '灯器 自転車用 青', (b) => head(b, O, { lenses: ['lens-off', 'lens-off', 'bike-green'], paint: 'black' }));
  sig('head-beacon-yellow', '点滅灯 黄 1灯', (b) => head(b, O, { lenses: ['lens-yellow-on'] }));
  sig('head-beacon-red', '点滅灯 赤 1灯', (b) => head(b, O, { lenses: ['lens-red-on'], paint: 'black', back: 'plain' }));
  sig('head-lane-x', '車線制御灯 赤×', (b) => laneHead(b, O, 'lane-x-red'));
  sig('head-lane-arrow', '車線制御灯 青↓', (b) => laneHead(b, O, 'lane-arrow-green'));
  const PEDS: [string, string, PedOpts][] = [
    ['hand', '手', { face: 'ped-hand' }], ['walk', '歩行者', { face: 'ped-walk' }], ['off', '消灯', { face: 'ped-off' }], ['count-18', '手+残り18秒', { face: 'ped-hand-count-18' }],
    ['count-4', '手+残り4秒', { face: 'ped-hand-count-4', paint: 'yellow' }], ['walk-count', '歩行者+残り24秒', { face: 'ped-walk-count-24', paint: 'green' }],
    ['text-dont-walk', '旧式2段 DONT WALK', { face: ['ped-text-dont-walk', 'ped-off'], paint: 'yellow-old' }], ['text-walk', '旧式2段 WALK', { face: ['ped-off', 'ped-text-walk'], paint: 'black-old' }],
  ];
  for (const [id, jp, o] of PEDS) sig(`head-ped-${id}`, `歩行者灯器 ${jp}`, (b) => pedHead(b, O, o));

  // Signals on short poles.
  sig('post-top', '柱上 縦3灯', (b) => {
    pedestal(b, O, 3.1);
    topMount(b, O, 3.1, { lenses: balls('r'), back: 'plain' });
  });
  sig('post-top-ped', '柱上 縦3灯+歩行者灯・押しボタン', (b) => {
    pedestal(b, O, 3.1, 'signal/pole-black');
    topMount(b, O, 3.1, { lenses: balls('g'), paint: 'black', back: 'border' });
    pedMount(b, turn(O, 90), 2.4, 0.057, { face: 'ped-hand-count-9' });
    button(b, turn(O, 90), 0.057);
  });
  sig('post-side-two', '柱 側面2方向', (b) => {
    pedestal(b, O, 4.3);
    sideMount(b, O, 3.6, { lenses: balls('r') }, -1);
    sideMount(b, turn(O, 90), 3.6, { lenses: balls('g') }, 1);
  });
  sig('post-side-four', '柱 4方向', (b) => {
    pedestal(b, O, 4.4, 'signal/pole-green', 'cast');
    for (let k = 0; k < 4; k++) sideMount(b, turn(O, k * 90), 3.7, { lenses: balls(k % 2 ? 'g' : 'r'), paint: 'green', visor: 'cutaway' }, 1);
  });
  sig('post-doghouse', '柱 ドッグハウス型', (b) => {
    pedestal(b, O, 4.6, 'signal/pole-galvanized', 'plate');
    sideMount(b, O, 3.8, { lenses: DOG_G, back: 'plain' }, -1, 0.62, true);
  });
  sig('post-fluted-glass', '装飾柱 電球式灯器', (b) => {
    pole(b, O, { h: 3.4, r0: 0.075, tex: 'signal/pole-green', base: 'fluted', cap: 'none' });
    topMount(b, O, 3.4, { lenses: balls('y', true), paint: 'green', visor: 'cutaway' });
    pedMount(b, turn(O, -90), 2.5, 0.075, { face: ['ped-text-dont-walk', 'ped-off'], paint: 'green' });
  });
  sig('post-small-heads', '柱 小型灯器+歩行者灯2方向', (b) => {
    pedestal(b, O, 3.2, 'signal/pole-bronze', 'cast');
    topMount(b, O, 3.2, { lenses: balls('r'), size: 0.2, paint: 'black' });
    pedMount(b, O, 2.4, 0.057, { face: 'ped-walk' });
    pedMount(b, turn(O, 90), 2.4, 0.057, { face: 'ped-hand' });
    button(b, O, 0.057);
    button(b, turn(O, 90), 0.057);
  });
  sig('post-bike', '柱 自転車用信号', (b) => {
    pedestal(b, O, 3, 'signal/pole-black');
    topMount(b, O, 3, { lenses: ['lens-off', 'lens-off', 'bike-green'], size: 0.2, paint: 'black' });
    plate(b, 'sign/bike-lane', O, [0, 2.4, 0.07]);
  });
  sig('post-ramp-meter', 'ランプメーター', (b) => {
    pedestal(b, O, 3.4);
    topMount(b, O, 3.4, { lenses: ['lens-red-on', 'lens-green-off'], back: 'plain' });
    sideMount(b, O, 1.5, { lenses: ['lens-red-on', 'lens-green-off'], size: 0.2 }, -1, 0.3);
    plate(b, 'sign/ramp-one-car', O, [0, 2.6, 0.07]);
  });
  sig('post-old-rusty', '柱 古い・錆', (b) => {
    pedestal(b, tilt(O, 2), 4.2, 'signal/pole-rusty', 'plate');
    sideMount(b, tilt(O, 2), 3.5, { lenses: balls('off', true), paint: 'yellow-old', visor: 'cutaway' }, -1);
  });

  // Pedestrian poles.
  sig('ped-pole', '歩行者灯柱', (b) => {
    pedestal(b, O, 2.9);
    pedMount(b, O, 2.5, 0.057, { face: 'ped-hand' });
    button(b, O, 0.057);
  });
  sig('ped-pole-two-way', '歩行者灯柱 2方向', (b) => {
    pedestal(b, O, 3, 'signal/pole-black', 'cast');
    pedMount(b, O, 2.5, 0.057, { face: 'ped-walk-count-24' }, -1);
    pedMount(b, turn(O, 90), 2.5, 0.057, { face: 'ped-hand' }, 1);
    button(b, O, 0.057);
    button(b, turn(O, 90), 0.057);
  });
  sig('ped-pole-old', '歩行者灯柱 旧式2段', (b) => {
    pedestal(b, O, 3.1, 'signal/pole-green', 'cast');
    pedMount(b, O, 2.6, 0.057, { face: ['ped-off', 'ped-text-walk'], paint: 'green' });
  });
  sig('ped-button-post', '押しボタン柱', (b) => {
    pole(b, O, { h: 1.25, r0: 0.05, tex: 'signal/pole-grey', base: 'plate' });
    button(b, O, 0.05);
  });
  sig('ped-button-post-bollard', '押しボタン柱 太柱', (b) => {
    pole(b, O, { h: 1.15, r0: 0.09, tex: 'signal/housing-yellow', base: 'buried', cap: 'flat' });
    button(b, O, 0.09, 0.95, '');
  });

  // Mast arms.
  const through = (lit: Lit, o: Partial<HeadOpts> = {}): HeadOpts => ({ lenses: balls(lit), back: 'plain', ...o });
  const MASTS: [string, string, MastOpts][] = [
    ['6-one', 'アーム6m 1灯器', { arm: 6, heads: [through('r')] }],
    ['8-two', 'アーム8m 2灯器+柱側灯器', { arm: 8, heads: [through('g'), through('g')], poleHead: through('g', { back: 'none' }) }],
    ['9-two-street', 'アーム9m 2灯器+街路名+街路灯', { arm: 9, heads: [through('r'), through('r')], street: 'sign/street-arm-main-st', lamp: 'cobra' }],
    ['11-left', 'アーム11m 左折矢印つき3灯器', { arm: 11, heads: [{ lenses: [...balls('r'), 'arrow-green-left'], back: 'plain' }, through('r'), through('r')], signs: ['sign/left-turn-signal'], lamp: 'cobra-on', street: 'sign/street-arm-ocean-ave' }],
    ['12-doghouse', 'アーム12m ドッグハウス+2灯器', { arm: 12, paint: 'black', tex: 'signal/pole-black', heads: [{ lenses: DOG_G, back: 'border', twin: true }, through('g', { back: 'border' }), through('g', { back: 'border' })], signs: ['sign/left-yield-green'], ped: [{ face: 'ped-hand', yaw: 90 }], buttons: [90] }],
    ['14-fya', 'アーム14m 黄点滅矢印+3灯器', { arm: 14, paint: 'black', heads: [{ lenses: FYA, back: 'border' }, through('r', { back: 'border' }), through('r', { back: 'border' }), through('r', { back: 'border' })], lamp: 'led', street: 'sign/street-arm-harbor-blvd' }],
    ['17-four', 'アーム17m 4灯器', { arm: 17, heads: [{ lenses: arrows('r', 'left'), back: 'plain' }, through('g'), through('g'), through('g')], signs: ['sign/lane-left-only'], lamp: 'cobra', poleHead: through('g') }],
    ['7-curved', '曲線アーム7m', { arm: 7, kind: 'curved', tex: 'signal/pole-green', paint: 'green', heads: [through('g', { back: 'none', visor: 'cutaway' })], base: 'cast' }],
    ['10-curved-two', '曲線アーム10m 2灯器', { arm: 10, kind: 'curved', tex: 'signal/pole-bronze', paint: 'black', heads: [through('r'), through('r')], base: 'cast', ped: [{ face: 'ped-walk', yaw: 0 }], buttons: [0] }],
    ['9-monotube', '一体曲げ柱 9m', { arm: 9, kind: 'monotube', tex: 'signal/pole-grey', paint: 'black', heads: [through('y', { back: 'border' }), through('y', { back: 'border' })] }],
    ['13-monotube', '一体曲げ柱 13m 横型灯器', { arm: 13, kind: 'monotube', tex: 'signal/pole-black', paint: 'black', heads: [0, 1, 2].map(() => through('r', { horizontal: true, back: 'border' })), signs: ['sign/no-turn-on-red'] }],
    ['8-truss', 'トラスアーム 8m', { arm: 8, kind: 'truss', tex: 'signal/pole-rusty', paint: 'yellow-old', heads: [{ lenses: balls('r', true), visor: 'cutaway' }, { lenses: balls('r', true), visor: 'cutaway' }] }],
    ['7-guyed', '吊り材つきアーム 7m', { arm: 7, kind: 'guyed', tex: 'signal/pole-galvanized', heads: [{ lenses: balls('g', true), paint: 'yellow-old' }], poleHead: { lenses: balls('g', true), paint: 'yellow-old' } }],
    ['10-horizontal', 'アーム10m 横型灯器', { arm: 10, tex: 'signal/pole-bronze', paint: 'black', heads: [through('g', { horizontal: true }), { lenses: ['arrow-green-left', ...balls('g')], horizontal: true, back: 'plain' }], lamp: 'shoebox', street: 'sign/street-arm-mission-st' }],
    ['9-rear', 'アーム9m 両面灯器', { arm: 9, heads: [through('r'), through('r')], rear: [through('g')], ped: [{ face: 'ped-hand-count-18', yaw: 0 }, { face: 'ped-walk', yaw: -90 }], buttons: [0, -90] }],
    ['12-full', 'アーム12m 全部入り', { arm: 12, tex: 'signal/pole-green', paint: 'green', heads: [{ lenses: DOG_R, twin: true, back: 'plain' }, through('r'), through('r')], signs: ['sign/no-u-turn', 'sign/lane-straight-right'], street: 'sign/street-arm-3rd-st', lamp: 'led-on', poleHead: through('r', { back: 'none' }), ped: [{ face: 'ped-hand-count-4', yaw: 0 }, { face: 'ped-hand', yaw: 90 }], buttons: [0, 90] }],
    ['8-small', 'アーム8m 小型灯器', { arm: 8, heads: [through('g', { size: 0.2 }), through('g', { size: 0.2 })], spacing: 3, tex: 'signal/pole-rusty', paint: 'yellow-old' }],
    ['6-beacon', 'アーム6m 赤点滅灯', { arm: 6, heads: [{ lenses: ['lens-red-on'], back: 'plain' }], signs: ['sign/stop'] }],
    ['11-hawk', 'アーム11m 歩行者横断用(HAWK)', { arm: 11, paint: 'black', heads: [0, 1].map(() => ({ lenses: ['lens-red-on', 'lens-red-off', 'lens-off', 'lens-yellow-off', 'lens-off'], twin: true, back: 'border' as const })), spacing: 4, signs: ['sign/crosswalk-stop-on-red'], ped: [{ face: 'ped-walk-count-24', yaw: 90 }], buttons: [90] }],
    ['9-bike', 'アーム9m 自転車用灯器つき', { arm: 9, paint: 'black', heads: [through('g', { back: 'border' }), { lenses: ['lens-off', 'lens-off', 'bike-green'], back: 'border' }], signs: ['sign/bike-lane'] }],
  ];
  for (const [id, jp, o] of MASTS) sig(`mast-${id}`, `信号柱 ${jp}`, (b) => mast(b, O, o));
  sig('mast-twin-arms', '信号柱 直角2本アーム', (b) => {
    mast(b, O, { arm: 9, heads: [through('r'), through('r')], lamp: 'cobra', street: 'sign/street-arm-main-st' });
    const on = mastArm(b, turn(O, 90), { len: 7, h: 6.1, tex: 'signal/pole-galvanized', r: 0.098 });
    clampMount(b, on(6.65), through('g'), 0.06);
    clampMount(b, on(3.2), through('g'), 0.08);
  });

  // Span wire.
  const hang = (x: number, lit: Lit, o: Partial<HeadOpts> = {}, yaw = 0): SpanOpts['heads'][number] => ({ lenses: balls(lit), x, yaw, visor: 'cutaway', ...o });
  const SPANS: [string, string, SpanOpts][] = [
    ['wood-two', '木柱 2灯器', { width: 14, poles: 'wood', heads: [hang(-2, 'r'), hang(2, 'r')] }],
    ['wood-three-tether', '木柱 3灯器+振れ止め線', { width: 18, poles: 'wood', tether: true, heads: [hang(-4.5, 'g', { lenses: [...balls('g'), 'arrow-green-left'] }), hang(-0.8, 'g'), hang(2.9, 'g')], signs: [{ id: 'sign/street-arm-main-st', x: 6.2 }] }],
    ['wood-old', '木柱 電球式・色あせ', { width: 12, poles: 'wood', heads: [hang(-1.5, 'y', { lenses: balls('y', true), paint: 'yellow-old' }), hang(1.5, 'y', { lenses: balls('y', true), paint: 'yellow-old' })], lamp: 'cobra' }],
    ['steel-three', '鋼管柱 3灯器+背面板', { width: 20, poles: 'steel', tether: true, heads: [hang(-5, 'r', { back: 'border', paint: 'black' }), hang(-1.3, 'r', { back: 'border', paint: 'black' }), hang(2.4, 'r', { back: 'border', paint: 'black' })], signs: [{ id: 'sign/no-turn-on-red', x: 5.6 }] }],
    ['steel-four-way', '鋼管柱 4方向灯器', { width: 16, poles: 'steel', heads: [hang(-0.25, 'r'), hang(0.25, 'r', {}, 180), hang(0, 'g', {}, 90), hang(0, 'g', {}, -90)].map((h, i) => ({ ...h, x: [-2.2, -1.6, 1.6, 2.2][i] })), tether: true }],
    ['steel-doghouse', '鋼管柱 ドッグハウス+2灯器', { width: 19, poles: 'steel', heads: [{ lenses: DOG_G, x: -4.6, twin: true, back: 'plain' }, hang(-0.8, 'g', { back: 'plain' }), hang(2.9, 'g', { back: 'plain' })], lamp: 'led' }],
    ['concrete-two', 'コンクリート柱 2灯器', { width: 15, poles: 'concrete', heads: [hang(-2, 'g', { paint: 'green' }), hang(1.7, 'g', { paint: 'green' })], tether: true }],
    ['concrete-horizontal', 'コンクリート柱 横型灯器', { width: 17, poles: 'concrete', heads: [hang(-3.5, 'r', { horizontal: true, paint: 'black', back: 'plain' }), hang(0.5, 'r', { horizontal: true, paint: 'black', back: 'plain' })] }],
    ['beacon-yellow', '吊り下げ 黄点滅灯', { width: 12, poles: 'wood', heads: [{ lenses: ['lens-yellow-on'], x: 0 }, { lenses: ['lens-red-on'], x: 0.42, yaw: 90 }] }],
    ['beacon-four-way', '吊り下げ 4方向点滅灯', { width: 14, poles: 'steel', heads: [0, 90, 180, 270].map((yaw) => ({ lenses: [yaw % 180 ? 'lens-red-on' : 'lens-yellow-on'], x: Math.sin((yaw * Math.PI) / 180) * 0.2 + (yaw === 0 ? -0.2 : yaw === 180 ? 0.2 : 0), yaw })) }],
    ['lane-control', '吊り下げ 車線制御灯', { width: 16, poles: 'steel', tether: true, heads: [], signs: [] }],
  ];
  for (const [id, jp, o] of SPANS) {
    sig(`span-${id}`, `吊り線式 ${jp}`, (b) => {
      span(b, O, o);
      if (id === 'lane-control') ['lane-x-red', 'lane-arrow-green', 'lane-arrow-green', 'lane-x-yellow'].forEach((t, i) => {
        const x = -5.4 + i * 3.6;
        const y = 7.9 - 16 * 0.035 * 4 * ((x + 8) / 16) * (1 - (x + 8) / 16);
        pipe(b, BLACK, [at(O, x, y, 0), at(O, x, y - 0.3, 0)], 0.018, 6, false);
        laneHead(b, move(O, x, y - 0.3 - 0.26, 0), t);
      });
    });
  }

  // Warning beacons.
  const solar = (b: MeshBuilder, f: Pose, y: number): void => {
    const g = tilt(move(f, 0, y + 0.12, 0), -55);
    box(b, 'signal/pole-grey', g, [0, 0, -0.012], [0.25, 0.25, 0.01]);
    face(b, 'signal/solar-panel', g, [0, 0, 0], 0.468, 0.468);
    box(b, 'signal/cabinet-side', f, [0, y - 0.35, -0.16], [0.14, 0.18, 0.1]);
  };
  sig('beacon-school', '通学路 点滅灯つき標識', (b) => {
    pedestal(b, O, 4.4);
    plate(b, 'sign/school', O, [0, 2.85, 0.07]);
    plate(b, 'sign/plaque-when-flashing', O, [0, 2.25, 0.07]);
    head(b, move(O, 0, 3.6, 0.1), { lenses: ['lens-yellow-on'], size: 0.2, visor: 'cap' });
    head(b, move(O, 0, 1.85, 0.1), { lenses: ['lens-yellow-off'], size: 0.2, visor: 'cap' });
    solar(b, O, 4.4);
  });
  sig('beacon-school-speed', '通学路 制限速度+点滅灯', (b) => {
    pedestal(b, O, 4.6, 'signal/pole-galvanized', 'plate');
    plate(b, 'sign/speed-school-25', O, [0, 2.9, 0.07]);
    for (const sx of [-1, 1]) head(b, move(O, sx * 0.2, 3.65, 0.1), { lenses: ['lens-yellow-on'], size: 0.2, visor: 'cap', paint: 'black' });
    solar(b, O, 4.6);
  });
  sig('beacon-rrfb', '横断歩道 点滅灯バー(RRFB)', (b) => {
    pedestal(b, O, 3.9);
    plate(b, 'sign/pedestrian-lime', O, [0, 2.95, 0.07]);
    box(b, BLACK, O, [0, 2.3, 0.085], [0.3, 0.07, 0.03]);
    for (const sx of [-1, 1]) face(b, sx < 0 ? 'signal/rrfb-on' : 'signal/rrfb-off', O, [sx * 0.15, 2.3, 0.117], 0.18, 0.08);
    plate(b, 'sign/plaque-diagonal-arrow', O, [0, 2.02, 0.07]);
    button(b, turn(O, -90), 0.057);
    solar(b, O, 3.9);
  });
  sig('beacon-stop', '一時停止 赤点滅灯つき', (b) => {
    pedestal(b, O, 3.3, 'signal/pole-galvanized', 'plate');
    plate(b, 'sign/stop', O, [0, 2.5, 0.07]);
    topMount(b, O, 3.3, { lenses: ['lens-red-on'], size: 0.2, visor: 'cap' });
  });
  sig('beacon-warning', '警戒標識 黄点滅灯つき', (b) => {
    pedestal(b, O, 3.5, 'signal/pole-galvanized', 'plate');
    plate(b, 'sign/signal-ahead', O, [0, 2.55, 0.07]);
    topMount(b, O, 3.5, { lenses: ['lens-yellow-on'], visor: 'cap' });
  });
  sig('beacon-fire-station', '消防署前 信号', (b) => mast(b, O, { arm: 8, heads: [{ lenses: ['lens-red-off', 'lens-yellow-on', 'lens-yellow-off'], back: 'plain' }, { lenses: ['lens-red-off', 'lens-yellow-on', 'lens-yellow-off'], back: 'plain' }], signs: ['sign/fire-station'] }));

  // Railway crossings.
  const RAILS: [string, string, RailOpts][] = [
    ['crossbuck', '踏切 警標のみ', { crossbuck: true, lit: [false, false], tracks: true }],
    ['flashers', '踏切 警報灯', { lit: [true, false], bell: true, tracks: true }],
    ['flashers-both', '踏切 両面警報灯', { lit: [false, true], bell: true, both: true }],
    ['gate-down', '踏切 遮断機 降下', { gate: 'down', lit: [true, false], bell: true, tracks: true }],
    ['gate-up', '踏切 遮断機 上昇', { gate: 'up', lit: [false, false], bell: true }],
    ['gate-half', '踏切 遮断機 動作中', { gate: 'half', lit: [false, true], bell: true, both: true, gateLen: 6 }],
    ['gate-long', '踏切 遮断機 長尺 10m', { gate: 'down', gateLen: 10, lit: [true, false], bell: true, tracks: true, tex: 'signal/pole-galvanized' }],
    ['cantilever', '踏切 片持ち式警報灯', { cantilever: 7.5, lit: [true, false], tracks: true }],
    ['cantilever-gate', '踏切 片持ち式+遮断機', { cantilever: 9, gate: 'down', gateLen: 8, lit: [false, true], bell: false, tracks: true }],
  ];
  for (const [id, jp, o] of RAILS) sig(`rail-${id}`, jp, (b) => railSignal(b, O, o));

  // Controller cabinets.
  sig('cabinet-aluminium', '制御機 アルミ', (b) => cabinet(b, O, { door: 'cabinet-aluminium' }));
  sig('cabinet-green', '制御機 緑塗装', (b) => cabinet(b, O, { door: 'cabinet-green', w: 0.75, h: 1.25 }));
  sig('cabinet-tagged', '制御機 落書きあり', (b) => cabinet(b, O, { door: 'cabinet-tagged', h: 1.5 }));
  sig('cabinet-large', '制御機 大型・両開き', (b) => cabinet(b, O, { door: 'cabinet-aluminium', w: 1.4, h: 1.7, d: 0.75, doors: 2 }));
  sig('cabinet-beige-low', '制御機 低型・ベージュ', (b) => cabinet(b, O, { door: 'cabinet-beige', w: 0.9, h: 0.95, d: 0.5 }));
  sig('cabinet-with-meter', '制御機+電力量計の箱', (b) => {
    cabinet(b, O, { door: 'cabinet-aluminium' });
    cabinet(b, move(O, 1.05, 0, 0), { door: 'cabinet-beige', w: 0.45, h: 1.15, d: 0.4 });
  });
  sig('cabinet-pole-mounted', '制御機 柱取付け', (b) => {
    pole(b, O, { h: 3.2, r0: 0.11, tex: 'signal/pole-wood', base: 'buried', cap: 'flat' });
    cabinet(b, move(O, 0, 0, 0.31), { door: 'cabinet-green', w: 0.5, h: 0.8, d: 0.35, y: 1.2 });
  });
  sig('cabinet-battery', '制御機+予備電源箱', (b) => {
    cabinet(b, O, { door: 'cabinet-tagged', w: 0.8, h: 1.45 });
    cabinet(b, move(O, -0.68, 0, 0), { door: 'cabinet-aluminium', w: 0.5, h: 1, d: 0.5, pad: false });
  });
}
