import { MeshBuilder, V3 } from './builder';
import { sheet } from './buildkit';
import { Pose, box, disc, face, move, pipe, plate, roll, stand, tilt, turn, at } from './kit';
import { FOOT, STYLES, rail, track, way } from './railkit';
import { addModel } from './registry';
import { cabinet, head, pole } from './signals';
import { mast, portal, wires } from './tracks';

const R = (id: string): string => `rail/${id}`;
const ZINC = 'structure/steel-galvanized';
const GREY = 'signal/pole-grey';
const DARK = 'trim/paint-charcoal';
const O = stand();

export interface BoardOpts {
  t?: number;
  rim?: string;
  /** Texture of the back; null leaves the back of the cabinet plain. */
  back?: string | null;
  size?: [number, number];
}
/** Sign cabinet centred on c, showing `tex` in front and behind. Returns its size. */
export function board(b: MeshBuilder, f: Pose, tex: string, c: V3, o: BoardOpts = {}): [number, number] {
  const p = b.part(tex);
  const [w, h] = o.size ?? [p.mw, p.mh];
  const t = o.t ?? 0.06;
  box(b, o.rim ?? DARK, f, c, [w / 2 + 0.025, h / 2 + 0.025, t / 2]);
  face(b, tex, f, [c[0], c[1], c[2] + t / 2 + 0.003], w, h);
  if (o.back !== null) face(b, o.back ?? tex, turn(f, 180), [-c[0], c[1], -c[2] + t / 2 + 0.003], w, h);
  return [w, h];
}

/** Sign cabinet on one or two posts; `y` is the height of its centre. */
export function postSign(b: MeshBuilder, f: Pose, tex: string, o: BoardOpts & { y?: number; posts?: 1 | 2; post?: string } = {}): void {
  const p = b.part(tex);
  const [w, h] = o.size ?? [p.mw, p.mh];
  const y = o.y ?? 2.1;
  const post = o.post ?? GREY;
  if ((o.posts ?? 2) === 2) for (const sx of [-1, 1]) box(b, post, f, [sx * (w / 2 + 0.065), (y + h / 2 + 0.06) / 2, 0], [0.035, (y + h / 2 + 0.06) / 2, 0.035], 'Y');
  else box(b, post, f, [0, (y - h / 2) / 2, 0], [0.045, (y - h / 2) / 2, 0.045], 'Y');
  board(b, f, tex, [0, y, 0], o);
}

/** Sign cabinet hung on two rods from a soffit at height `top`; `y` is the height of its centre. */
export function hung(b: MeshBuilder, f: Pose, tex: string, top: number, y: number, o: BoardOpts = {}): void {
  const [w, h] = board(b, f, tex, [0, y, 0], o);
  for (const sx of [-1, 1]) box(b, DARK, f, [sx * w * 0.36, (top + y + h / 2) / 2, 0], [0.012, (top - y - h / 2) / 2, 0.012], 'yY');
}

const TVM_SIDE = { blue: 'structure/steel-blue', red: 'structure/steel-red', steel: 'furniture/coat-stainless', off: 'structure/steel-grey' };
export type TvmKind = keyof typeof TVM_SIDE;
/** Ticket vending machine facing +z. */
export function tvm(b: MeshBuilder, f: Pose, kind: TvmKind): void {
  const side = TVM_SIDE[kind];
  box(b, DARK, f, [0, 0.04, 0], [0.43, 0.04, 0.28], 'Y');
  box(b, side, f, [0, 1.005, 0], [0.45, 0.925, 0.3], 'Y');
  face(b, R(`tvm-${kind}`), f, [0, 1.005, 0.303], 0.9, 1.85);
  box(b, side, f, [0, 1.95, 0.07], [0.47, 0.02, 0.4]);
}

export function validator(b: MeshBuilder, f: Pose, tex = 'structure/steel-yellow'): void {
  box(b, GREY, f, [0, 0.5, 0], [0.04, 0.5, 0.04], 'Y');
  box(b, GREY, f, [0, 0.01, 0], [0.1, 0.01, 0.1], 'Y');
  const g = tilt(move(f, 0, 1.12, 0.02), -28);
  box(b, tex, g, [0, 0, 0], [0.15, 0.22, 0.045]);
  face(b, R('validator'), g, [0, 0, 0.048], 0.26, 0.4);
}

/** Row of fare gates; passengers walk along z. */
export function fareGates(b: MeshBuilder, f: Pose, lanes: number, o: { wide?: boolean; open?: boolean } = {}): number {
  const gaps = Array.from({ length: lanes }, (_, i) => (o.wide && i === lanes - 1 ? 0.95 : 0.58));
  const total = gaps.reduce((a, g) => a + g + 0.3, 0.3);
  let x = -total / 2 + 0.15;
  for (let i = 0; i <= lanes; i++) {
    box(b, 'furniture/coat-stainless', f, [x, 0.5, 0], [0.15, 0.5, 0.7], 'Y');
    for (const yaw of [90, -90]) face(b, R('gate-side'), turn(move(f, x, 0, 0), yaw), [0, 0.5, 0.152], 1.4, 1);
    const P = (dx: number, z: number): V3 => at(f, x + dx, 1.002, z);
    b.quad(R('gate-top'), P(-0.15, 0.7), P(0.15, 0.7), P(0.15, -0.7), P(-0.15, -0.7), [[0, 0], [0, 0.3], [1.4, 0.3], [1.4, 0]]);
    if (i < lanes) {
      const g = gaps[i];
      for (const s of [-1, 1]) {
        const hinge = move(f, x + 0.15 + (s < 0 ? 0 : g), 0, 0);
        const leaf = turn(hinge, o.open ? -s * 80 : 0);
        const c: V3 = [(-s * g) / 4, 0.62, 0];
        face(b, R('gate-flap'), leaf, c, g / 2 - 0.01, 0.45);
        face(b, R('gate-flap'), turn(leaf, 180), [-c[0], c[1], 0], g / 2 - 0.01, 0.45);
      }
      x += g + 0.3;
    }
  }
  return total;
}

/** Flat metal signs stacked on a post beside the track. `y` is the top of the upper sign. */
export function trackSign(b: MeshBuilder, f: Pose, texs: string[], o: { y?: number; post?: string; lean?: number; r?: number } = {}): void {
  const g = o.lean ? roll(f, o.lean) : f;
  let y = o.y ?? 2.2;
  const r = o.r ?? 0.03;
  box(b, o.post ?? ZINC, g, [0, y / 2, 0], [r, y / 2, r], 'Y');
  for (const t of texs) {
    const p = b.part(t);
    plate(b, t, g, [0, y - p.mh / 2 - 0.03, r + 0.006]);
    y -= p.mh + 0.04;
  }
}

export type FenceKind = 'chainlink' | 'chainlink-barbed' | 'palisade' | 'concrete' | 'timber' | 'railing';
/** Lineside fence along x, starting at the pose. */
export function fence(b: MeshBuilder, f: Pose, len: number, kind: FenceKind, o: { signs?: string[]; mat?: string } = {}): void {
  const P = (x: number, y: number, z = 0): V3 => at(f, x, y, z);
  const posts = (gap: number, h: number, r: number, mat: string, sq = false): number[] => {
    const n = Math.max(1, Math.round(len / gap));
    const xs = Array.from({ length: n + 1 }, (_, i) => (len * i) / n);
    for (const x of xs) {
      if (sq) box(b, mat, f, [x, h / 2, 0], [r, h / 2, r], 'Y');
      else b.tube(mat, P(x, 0), P(x, h), r, 8, r, true);
    }
    return xs;
  };
  let top = 1.8;
  if (kind === 'chainlink' || kind === 'chainlink-barbed') {
    const mat = o.mat ?? ZINC;
    const xs = posts(3, 1.95, 0.03, mat);
    b.tube(mat, P(0, 1.85), P(len, 1.85), 0.021, 6);
    sheet(b, 'trim/chainlink', P(0, 0.04), P(len, 0.04), P(len, 1.85), P(0, 1.85), [[0, 0], [len, 0], [len, 1.81], [0, 1.81]]);
    pipe(b, mat, [P(0, 0.06), P(len, 0.06)], 0.004, 4, false);
    if (kind === 'chainlink-barbed') {
      for (const x of xs) b.tube(mat, P(x, 1.95), P(x, 2.3, 0.3), 0.018, 6);
      for (let i = 0; i < 3; i++) pipe(b, 'structure/steel-galvanized-rusty', xs.map((x, j) => P(x, 2.0 + i * 0.13 + (j % 2) * 0.006, 0.05 + i * 0.11)), 0.005, 4, false);
    }
  } else if (kind === 'palisade') {
    const mat = o.mat ?? 'structure/steel-green';
    top = 2.1;
    posts(2.75, 2.1, 0.05, mat, true);
    for (const y of [0.35, 1.75]) box(b, mat, f, [len / 2, y, -0.03], [len / 2, 0.025, 0.02]);
    const n = Math.round(len / 0.15);
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * len) / n;
      box(b, mat, f, [x, 1.07, 0.005], [0.035, 1.0, 0.012], 'Y');
      b.tri(mat, P(x - 0.035, 2.07, 0.017), P(x + 0.035, 2.07, 0.017), P(x, 2.19, 0.017), [[0, 0], [0.07, 0], [0.035, 0.12]]);
      b.tri(mat, P(x + 0.035, 2.07, -0.007), P(x - 0.035, 2.07, -0.007), P(x, 2.19, -0.007), [[0, 0], [0.07, 0], [0.035, 0.12]]);
    }
  } else if (kind === 'concrete') {
    const mat = o.mat ?? 'structure/wall-old';
    top = 1.9;
    const xs = posts(2, 2.0, 0.075, 'concrete/walk-plain', true);
    for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < 6; k++) box(b, mat, f, [(xs[i] + xs[i + 1]) / 2, 0.16 + k * 0.31, 0], [(xs[i + 1] - xs[i]) / 2 - 0.07, 0.15, 0.025]);
  } else if (kind === 'timber') {
    const mat = o.mat ?? 'furniture/slats-weathered';
    top = 1.15;
    posts(2.4, 1.25, 0.06, mat, true);
    for (const y of [0.35, 0.72, 1.08]) box(b, mat, f, [len / 2, y, 0.075], [len / 2 + 0.1, 0.06, 0.018]);
  } else {
    const mat = o.mat ?? 'trim/rail-black';
    top = 1.05;
    posts(2.2, 1.08, 0.025, 'trim/paint-black', true);
    sheet(b, mat, P(0, 0), P(len, 0), P(len, 1.05), P(0, 1.05), [[0, 0], [len, 0], [len, 1.05], [0, 1.05]]);
  }
  (o.signs ?? []).forEach((t, i, all) => {
    const p = b.part(t);
    plate(b, t, f, [(len * (i + 0.5)) / all.length + 0.4, Math.min(top - p.mh / 2 - 0.15, 1.45), 0.04]);
  });
}

export interface RailSigOpts {
  h?: number;
  /** Lens textures of each head, top head first. */
  heads: string[][];
  ladder?: boolean;
  plate?: boolean;
  tex?: string;
}
/** Colour-light railway signal on a mast, facing +z. */
export function railSig(b: MeshBuilder, f: Pose, o: RailSigOpts): void {
  const h = o.h ?? 5;
  const tex = o.tex ?? GREY;
  pole(b, f, { h, r0: 0.075, tex, base: 'plate', cap: 'flat' });
  let y = h - 0.15;
  for (const lenses of o.heads) {
    const hh = lenses.length * 0.234;
    y -= hh / 2 + 0.22;
    box(b, tex, f, [0, y, 0.09], [0.03, 0.03, 0.09]);
    head(b, move(f, 0, y, 0.27), { lenses, paint: 'black', back: 'plain', visor: 'cap', size: 0.2 });
    y -= hh / 2 + 0.25;
  }
  if (o.plate ?? true) plate(b, R('signal-plate'), f, [0, y - 0.05, 0.085]);
  if (o.ladder) {
    const top = h - 0.4;
    for (const sx of [-1, 1]) box(b, ZINC, f, [sx * 0.2, top / 2, -0.32], [0.015, top / 2, 0.015], 'Y');
    for (let yy = 0.3; yy < top; yy += 0.3) box(b, ZINC, f, [0, yy, -0.32], [0.2, 0.01, 0.01], 'xX');
    box(b, 'trim/grate-black', f, [0, top - 1.5, -0.2], [0.35, 0.015, 0.14]);
    for (const yy of [top - 1.2, top]) box(b, ZINC, f, [0, yy, -0.18], [0.02, 0.012, 0.13]);
  }
}

/** Low shunting signal beside the rail. */
export function dwarfSig(b: MeshBuilder, f: Pose, lenses: string[]): void {
  box(b, 'concrete/walk-plain', f, [0, 0.05, 0], [0.22, 0.05, 0.22], 'Y');
  box(b, GREY, f, [0, 0.2, 0], [0.05, 0.1, 0.05], 'Y');
  head(b, move(f, 0, 0.3 + lenses.length * 0.117, 0.1), { lenses, paint: 'black', back: 'none', visor: 'cap', size: 0.2 });
}

/** Signal bridge across the tracks at the listed centres. */
export function sigBridge(b: MeshBuilder, f: Pose, x0: number, x1: number, lats: number[], heads: string[][]): void {
  const H = 6.6;
  for (const x of [x0, x1]) {
    for (const dz of [-0.35, 0.35]) box(b, ZINC, f, [x, H / 2 + 0.5, dz], [0.06, H / 2 + 0.5, 0.06], 'Y');
    for (let y = 0.6; y < H; y += 1.2) {
      b.beam(ZINC, at(f, x, y, -0.35), at(f, x, y + 1.2, 0.35), 0.04, 0.04);
      b.beam(ZINC, at(f, x, y + 1.2, -0.35), at(f, x, y + 1.2, 0.35), 0.04, 0.04);
    }
    box(b, 'concrete/walk-plain', f, [x, 0.1, 0], [0.4, 0.1, 0.7], 'Y');
  }
  for (const dz of [-0.35, 0.35]) for (const y of [H, H + 0.9]) box(b, ZINC, f, [(x0 + x1) / 2, y, dz], [(x1 - x0) / 2, 0.05, 0.05]);
  box(b, 'trim/grate-black', f, [(x0 + x1) / 2, H + 0.06, 0], [(x1 - x0) / 2, 0.012, 0.35]);
  const n = Math.round((x1 - x0) / 1.2);
  for (let i = 0; i < n; i++) {
    const [a, c] = [x0 + ((x1 - x0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n];
    for (const dz of [-0.35, 0.35]) b.beam(ZINC, at(f, i % 2 ? a : c, H, dz), at(f, i % 2 ? c : a, H + 0.9, dz), 0.035, 0.035);
  }
  lats.forEach((x, i) => {
    box(b, ZINC, f, [x, H + 0.9 + 0.75, 0.42], [0.04, 0.75, 0.04]);
    let y = H + 0.9 + 1.5;
    for (const lenses of heads) {
      const hh = lenses.length * 0.234;
      head(b, move(f, x, y - hh / 2, 0.62), { lenses: i % 2 ? [...lenses].map((l) => (l.endsWith('-on') ? l.replace('-on', '-off') : l === 'lens-red-off' ? 'lens-red-on' : l)) : lenses, paint: 'black', back: 'plain', visor: 'cap', size: 0.2 });
      y -= hh + 0.5;
    }
  });
}

/** Hand-thrown switch stand with its target, or an electric point machine. */
export function switchStand(b: MeshBuilder, f: Pose, kind: 'tall' | 'low' | 'machine'): void {
  const cast = R('steel-cast');
  for (const dz of [-0.3, 0.3]) box(b, 'rail/sleeper-wood', f, [0, 0.09, dz], [0.75, 0.09, 0.12], 'Y');
  if (kind === 'machine') {
    box(b, cast, f, [0, 0.33, 0], [0.55, 0.15, 0.3]);
    box(b, cast, f, [0, 0.5, 0], [0.5, 0.02, 0.26]);
    box(b, cast, f, [0.32, 0.36, 0.33], [0.12, 0.09, 0.05]);
    pipe(b, R('steel-rust'), [at(f, -0.55, 0.3, 0.1), at(f, -1.5, 0.3, 0.1)], 0.02, 6);
    pipe(b, R('steel-rust'), [at(f, -0.55, 0.3, -0.1), at(f, -1.5, 0.3, -0.1)], 0.015, 6);
    return;
  }
  const h = kind === 'tall' ? 2.1 : 0.75;
  box(b, cast, f, [0, 0.24, 0], [0.2, 0.06, 0.24]);
  b.tube(cast, at(f, 0, 0.3, 0), at(f, 0, 0.55, 0), 0.11, 10, 0.06, true);
  b.tube(cast, at(f, 0, 0.5, 0), at(f, 0, h, 0), 0.025, 8, 0.025, true);
  pipe(b, cast, [at(f, 0, 0.42, 0), at(f, 0.1, 0.42, 0.5), at(f, 0.1, 0.36, 0.62)], 0.022, 6);
  b.tube('structure/steel-white', at(f, 0.1, 0.36, 0.56), at(f, 0.1, 0.36, 0.72), 0.03, 8, 0.03, true);
  const t = move(f, 0, h - 0.2, 0);
  for (const g of [t, turn(t, 180)]) disc(b, 'structure/steel-red', g, [0, 0, 0.012], kind === 'tall' ? 0.2 : 0.14, 14);
  for (const g of [turn(t, 90), turn(t, -90)]) face(b, 'structure/steel-green', g, [0, 0, 0.012], kind === 'tall' ? 0.34 : 0.24, 0.16);
  if (kind === 'tall') {
    box(b, 'trim/paint-black', f, [0, h + 0.1, 0], [0.07, 0.1, 0.07]);
    for (const yaw of [0, 180]) disc(b, 'signal/lens-red-off', turn(move(f, 0, h + 0.1, 0), yaw), [0, 0, 0.072], 0.05, 10);
    for (const yaw of [90, -90]) disc(b, 'signal/lens-green-off', turn(move(f, 0, h + 0.1, 0), yaw), [0, 0, 0.072], 0.05, 10);
  }
  pipe(b, R('steel-rust'), [at(f, -0.15, 0.22, 0), at(f, -1.5, 0.22, 0)], 0.018, 6);
}

/** Relay house: a walk-in equipment cabin beside the track. */
export function relayHouse(b: MeshBuilder, f: Pose, w = 2.4, d = 1.8, h = 2.4): void {
  const wall = 'wall/metal-ribbed-galvanized';
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(b, 'concrete/walk-plain', f, [(x * w) / 2.6, 0.15, (z * d) / 2.6], [0.15, 0.15, 0.15], 'Y');
  box(b, wall, f, [0, 0.3 + h / 2, 0], [w / 2, h / 2, d / 2]);
  box(b, 'roof/seam-galvanized', f, [0, 0.3 + h + 0.04, 0], [w / 2 + 0.12, 0.04, d / 2 + 0.12]);
  face(b, 'door/steel-grey', f, [-w / 4, 0.3 + 1.05, d / 2 + 0.004], 0.9, 2.1);
  face(b, 'trim/louver-grey', f, [w / 4, 0.3 + 1.7, d / 2 + 0.004], 0.6, 0.45);
  plate(b, R('warn-high-voltage'), f, [w / 4, 0.3 + 1.0, d / 2 + 0.008]);
  for (let i = 0; i < 3; i++) box(b, 'trim/grate-black', f, [-w / 4, 0.1 * (i + 1) - 0.02, d / 2 + 0.2 + i * -0.0 + (2 - i) * 0.28], [0.5, 0.012, 0.14]);
  box(b, 'trim/ac-fan-grey', f, [w / 2 + 0.2, 0.3 + 1.5, 0], [0.2, 0.3, 0.4]);
}

/** Spare sleepers stacked beside the track. */
export function sleeperStack(b: MeshBuilder, f: Pose, tex: string, layers: number, per = 5): void {
  let n = 7;
  const rnd = (): number => ((n = (n * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const h = tex.includes('concrete') ? 0.2 : 0.18;
  for (const z of [-0.8, 0.8]) box(b, 'rail/sleeper-wood-old', f, [0, 0.05, z], [per * 0.14, 0.05, 0.08], 'Y');
  for (let k = 0; k < layers; k++) {
    const m = k === layers - 1 ? per - 2 : per;
    for (let i = 0; i < m; i++) {
      const g = turn(move(f, (i - (per - 1) / 2) * 0.27 + rnd() * 0.01, 0.1 + k * (h + 0.005), rnd() * 0.06), 90 + rnd() * 2.5);
      box(b, tex, g, [0, h / 2, 0], [1.3, h / 2, 0.125]);
    }
  }
}

/** Concrete cable trough along z, with a few lids lifted. */
export function cableTrough(b: MeshBuilder, f: Pose, len: number, open: number[] = []): void {
  const conc = 'concrete/walk-plain';
  for (const sx of [-1, 1]) box(b, conc, f, [sx * 0.19, 0.08, len / 2], [0.03, 0.08, len / 2], 'Y');
  box(b, 'concrete/walk-dark', f, [0, 0.015, len / 2], [0.16, 0.015, len / 2], 'Y');
  const n = Math.round(len);
  for (let i = 0; i < n; i++) {
    const z = ((i + 0.5) * len) / n;
    if (open.includes(i)) {
      box(b, conc, turn(roll(move(f, 0.42, 0.1, z), 0), 0), [0, 0, 0], [0.19, 0.03, len / n / 2 - 0.006]);
      continue;
    }
    box(b, conc, f, [0, 0.175, z], [0.2, 0.025, len / n / 2 - 0.006]);
  }
  for (const [x, r] of [[-0.08, 0.025], [0.0, 0.03], [0.08, 0.02]]) pipe(b, 'furniture/cable', [at(f, x, 0.03 + r, 0), at(f, x, 0.03 + r, len)], r, 6, false);
}

/** Twin-faced clock hanging from a soffit at height `top`. */
export function hungClock(b: MeshBuilder, f: Pose, top: number, y: number, tex = 'furniture/clock'): void {
  const g = turn(f, 90);
  b.tube(DARK, at(g, 0, y, -0.07), at(g, 0, y, 0.07), 0.36, 20, 0.36);
  for (const k of [g, turn(g, 180)]) disc(b, tex, k, [0, y, 0.071], 0.36, 20, 0.34);
  box(b, DARK, f, [0, (top + y + 0.36) / 2, 0], [0.02, (top - y - 0.36) / 2, 0.02], 'yY');
}

export function addRailParts(): void {
  const A = (id: string, label: string, build: (b: MeshBuilder) => void): void => addModel('railpart', id, label, build);
  const NAMES: [string, string, string][] = [['central', 'blue', 'Central'], ['harbor', 'white', 'Harbor'], ['old-town', 'green', 'Old Town'], ['mesa-heights', 'black', 'Mesa Heights'], ['palm-ave', 'blue', 'Palm Ave'], ['civic-center', 'white', 'Civic Center'], ['del-mar', 'green', 'Del Mar'], ['eastgate', 'black', 'Eastgate']];
  NAMES.forEach(([id, style, name], i) => {
    const tex = R(`name-${id}-${style}`);
    if (i % 4 === 0) A(`name-${id}`, `駅名標 2本柱 ${name}`, (b) => postSign(b, O, tex, { y: 1.95 }));
    else if (i % 4 === 1) A(`name-${id}`, `駅名標 吊下げ ${name}`, (b) => hung(b, move(O, 0, -1.6, 0), tex, 4.2, 3.4));
    else if (i % 4 === 2) A(`name-${id}`, `駅名標 低い枠 ${name}`, (b) => postSign(b, O, tex, { y: 1.25, post: 'signal/pole-green', rim: 'structure/steel-green' }));
    else A(`name-${id}`, `駅名標 1本柱 ${name}`, (b) => postSign(b, O, tex, { y: 2.6, posts: 1, post: 'signal/pole-black' }));
  });
  A('track-numbers', 'のりば番号 吊下げ 1〜4', (b) => [1, 2, 3, 4].forEach((n, i) => hung(b, move(O, (i - 1.5) * 1.1, -1.8, 0), R(`track-${n}`), 4.2, 3.3)));
  for (const [id, jp] of [['exit', '出口'], ['tickets', 'きっぷ'], ['trains', 'のりば'], ['tracks-1-2', '1・2番線'], ['elevator', 'エレベーター'], ['downtown', '都心方面'], ['bus', 'バス']]) {
    A(`way-${id}`, `案内サイン 吊下げ ${jp}`, (b) => hung(b, move(O, 0, -1.8, 0), R(`way-${id}`), 4.2, 3.2));
  }
  A('way-stack', '案内サイン 柱 3段', (b) => {
    box(b, DARK, O, [0, 1.5, 0], [0.06, 1.5, 0.06], 'Y');
    ['way-exit-left', 'way-tracks-3-4', 'way-restrooms', 'way-parking'].forEach((t, i) => board(b, O, R(t), [0.9, 2.75 - i * 0.42, 0], { t: 0.04 }));
  });
  for (const n of [1, 2, 3]) A(`departures-${n}`, `発車標 ${n === 1 ? '吊下げ' : n === 2 ? '2本柱' : '壁掛け'}`, (b) => {
    const tex = R(`departures-${n}`);
    if (n === 1) hung(b, move(O, 0, -1.6, 0), tex, 4.2, 3.2, { t: 0.14, rim: 'trim/paint-black' });
    else if (n === 2) postSign(b, O, tex, { y: 2.7, t: 0.14, rim: 'trim/paint-black', post: 'signal/pole-black' });
    else board(b, move(O, 0, -1.2, 0), tex, [0, 2.4, 0], { t: 0.1, back: null, rim: 'trim/paint-black' });
  });
  A('next-train', '次発案内 吊下げ', (b) => hung(b, move(O, 0, -2, 0), R('next-train'), 4.2, 3.2, { t: 0.1, rim: 'trim/paint-black' }));
  A('next-train-arriving', '次発案内 到着中 1本柱', (b) => postSign(b, O, R('next-train-arriving'), { y: 2.9, posts: 1, t: 0.1, rim: 'trim/paint-black', post: 'signal/pole-black' }));
  for (const k of ['blue', 'red', 'steel', 'off'] as TvmKind[]) A(`tvm-${k}`, `券売機 ${{ blue: '青', red: '赤', steel: 'ステンレス', off: '故障中' }[k]}`, (b) => tvm(b, O, k));
  A('tvm-row', '券売機 3台並び', (b) => (['blue', 'blue', 'off'] as TvmKind[]).forEach((k, i) => tvm(b, move(O, (i - 1) * 1.0, 0, 0), k)));
  A('tvm-wall', '券売機 壁埋込み 路線図つき', (b) => {
    box(b, 'wall/tile-white', O, [0, 1.4, -0.35], [2.6, 1.4, 0.1], 'Y');
    (['steel', 'steel'] as TvmKind[]).forEach((k, i) => tvm(b, move(O, -1.6 + i * 1.0, 0, 0), k));
    board(b, O, R('map-system-lit'), [1.2, 1.6, -0.22], { back: null, t: 0.05 });
    board(b, O, R('way-tickets'), [-1.1, 2.45, -0.22], { back: null, t: 0.05 });
  });
  A('validator', 'ICカード読取機', (b) => validator(b, O));
  A('validator-pair', 'ICカード読取機 2台 灰', (b) => [-0.5, 0.5].forEach((x) => validator(b, move(O, x, 0, 0), 'structure/steel-grey')));
  A('gates-3', '自動改札 3通路', (b) => void fareGates(b, O, 3));
  A('gates-5-wide', '自動改札 5通路 幅広1', (b) => void fareGates(b, O, 5, { wide: true }));
  A('gates-2-open', '自動改札 2通路 開', (b) => void fareGates(b, O, 2, { open: true }));
  A('gates-fenced', '自動改札 4通路 柵つき', (b) => {
    const w = fareGates(b, O, 4, { wide: true });
    for (const s of [-1, 1]) fence(b, move(O, s > 0 ? w / 2 : -w / 2 - 2.2, 0, 0), 2.2, 'railing');
    hung(b, move(O, 0, -1.4, 0), R('way-trains'), 4.2, 3.0);
  });
  A('map-stand', '路線図 スタンド', (b) => postSign(b, O, R('map-system'), { y: 1.5, post: 'signal/pole-black' }));
  A('map-lit', '路線図 内照式', (b) => postSign(b, O, R('map-system-lit'), { y: 1.5, t: 0.12, rim: 'structure/steel-grey' }));
  A('timetable', '時刻表 1本柱', (b) => postSign(b, O, R('timetable'), { y: 1.5, posts: 1 }));
  A('info-board', '時刻表と路線図の掲示板', (b) => {
    for (const sx of [-1, 1]) box(b, 'signal/pole-green', O, [sx * 1.05, 1.1, 0], [0.04, 1.1, 0.04], 'Y');
    box(b, 'structure/steel-green', O, [0, 1.5, 0], [1.02, 0.55, 0.03]);
    box(b, 'structure/steel-green', O, [0, 2.12, 0], [1.15, 0.03, 0.14]);
    face(b, R('map-system'), O, [-0.38, 1.5, 0.033], 1.2, 0.9);
    face(b, R('timetable'), O, [0.63, 1.5, 0.033], 0.6, 0.9);
    face(b, R('timetable'), turn(O, 180), [0.5, 1.5, 0.033], 0.6, 0.9);
  });
  for (const k of ['metro', 'rail', 'transit']) A(`totem-${k}`, `駅の目印 ${{ metro: 'メトロ 丸柱', rail: '鉄道 角柱', transit: 'トランジット 高い柱' }[k]}`, (b) => {
    const tex = R(`logo-${k}`);
    if (k === 'rail') {
      box(b, DARK, O, [0, 1.9, 0], [0.5, 1.9, 0.12], 'Y');
      for (const g of [O, turn(O, 180)]) {
        face(b, tex, g, [0, 3.25, 0.123], 0.9, 0.9);
        face(b, R('way-trains'), g, [0, 2.45, 0.123], 0.95, 0.214);
      }
    } else {
      const h = k === 'metro' ? 3.6 : 5.5;
      pole(b, O, { h, r0: 0.06, tex: k === 'metro' ? 'signal/pole-black' : GREY, base: 'plate', cap: 'flat' });
      board(b, O, tex, [0, h + 0.45, 0], { t: 0.1, rim: k === 'metro' ? 'trim/paint-black' : 'structure/steel-grey' });
    }
  });
  A('relay-case', '信号リレー箱', (b) => cabinet(b, O, { door: 'cabinet-aluminium' }));
  A('relay-case-double', '信号リレー箱 2扉', (b) => cabinet(b, O, { w: 1.5, h: 1.7, d: 0.7, door: 'cabinet-aluminium', doors: 2 }));
  A('relay-case-tagged', '信号リレー箱 落書き', (b) => cabinet(b, O, { w: 1.1, h: 1.5, door: 'cabinet-tagged' }));
  A('relay-house', '信号機器室', (b) => relayHouse(b, O));
  A('relay-house-large', '信号機器室 大', (b) => relayHouse(b, O, 4.2, 2.4, 2.7));
  for (const m of ['12', '47', '103']) A(`mile-${m}`, `距離標 ${m}`, (b) => trackSign(b, O, [R(`mile-${m}`)], { y: 1.5, post: m === '47' ? 'signal/pole-wood-grey' : 'concrete/walk-plain', r: 0.06 }));
  for (const s of ['15', '25', '40', '60', '79']) A(`speed-${s}`, `速度制限標 ${s}`, (b) => trackSign(b, O, [R(`speed-${s}`)], { y: 2.4 }));
  A('speed-pair', '速度制限標 2段', (b) => trackSign(b, O, [R('speed-60'), R('speed-40')], { y: 2.9, post: 'structure/steel-galvanized-rusty', lean: 2 }));
  A('whistle', '汽笛吹鳴標', (b) => trackSign(b, O, [R('whistle')], { y: 2.0, post: 'signal/pole-wood-grey', r: 0.05 }));
  A('yard-limit', '構内限界標', (b) => trackSign(b, O, [R('yard-limit')], { y: 2.2 }));
  A('end-of-track', '線路終端標', (b) => trackSign(b, O, [R('end-of-track')], { y: 1.6 }));
  A('stop-here', '停止位置目標', (b) => trackSign(b, O, [R('stop-here')], { y: 1.7 }));
  for (const [id, jp] of [['no-trespassing', '立入禁止'], ['tracks', '線路内立入禁止'], ['high-voltage', '高圧注意'], ['third-rail', '第三軌条注意'], ['look', '左右確認'], ['emergency', '非常通報'], ['old', '古い警告板']]) {
    A(`warn-${id}`, `警告標識 ${jp}`, (b) => trackSign(b, O, [R(`warn-${id}`)], { y: 1.9, lean: id === 'old' ? -6 : 0, post: id === 'old' ? 'structure/steel-galvanized-rusty' : ZINC }));
  }
  const FENCES: [string, string, FenceKind, { signs?: string[]; mat?: string }][] = [
    ['chainlink', '金網フェンス 12m', 'chainlink', {}],
    ['chainlink-signs', '金網フェンス 警告板つき', 'chainlink', { signs: [R('warn-no-trespassing'), R('warn-tracks')] }],
    ['chainlink-barbed', '金網フェンス 有刺鉄線', 'chainlink-barbed', { signs: [R('warn-high-voltage')], mat: 'structure/steel-galvanized-rusty' }],
    ['palisade', '鋼製柵 緑', 'palisade', {}],
    ['palisade-galvanized', '鋼製柵 亜鉛めっき 警告板つき', 'palisade', { mat: ZINC, signs: [R('warn-third-rail')] }],
    ['concrete', 'コンクリート板塀', 'concrete', {}],
    ['timber', '木柵', 'timber', {}],
    ['railing', 'ホーム柵', 'railing', {}],
  ];
  for (const [id, label, kind, o] of FENCES) A(`fence-${id}`, label, (b) => fence(b, stand([-6, 0, 0]), 12, kind, o));
  A('fence-gate', '金網フェンス 通用門', (b) => {
    fence(b, stand([-6, 0, 0]), 5, 'chainlink');
    fence(b, stand([1, 0, 0]), 5, 'chainlink', { signs: [R('warn-no-trespassing')] });
    for (const x of [-1, 1]) b.tube(ZINC, [x, 0, 0], [x, 2.1, 0], 0.04, 8, 0.04, true);
    const g = turn(stand([-1, 0, 0]), -25);
    for (const y of [0.1, 1.9]) b.tube(ZINC, at(g, 0, y, 0), at(g, 1.95, y, 0), 0.02, 6);
    b.tube(ZINC, at(g, 1.95, 0.1, 0), at(g, 1.95, 1.9, 0), 0.02, 6);
    sheet(b, 'trim/chainlink', at(g, 0, 0.1, 0), at(g, 1.95, 0.1, 0), at(g, 1.95, 1.9, 0), at(g, 0, 1.9, 0), [[0, 0], [1.95, 0], [1.95, 1.8], [0, 1.8]]);
  });
  const [RD, YL, GN] = ['lens-red-on', 'lens-yellow-off', 'lens-green-off'];
  A('signal-3', '色灯信号機 3灯', (b) => railSig(b, O, { heads: [['lens-green-on', YL, 'lens-red-off']] }));
  A('signal-3-ladder', '色灯信号機 3灯 はしごつき', (b) => railSig(b, O, { h: 5.6, heads: [[GN, YL, RD]], ladder: true }));
  A('signal-2', '色灯信号機 2灯', (b) => railSig(b, O, { h: 4.2, heads: [[GN, RD]] }));
  A('signal-double', '色灯信号機 2段', (b) => railSig(b, O, { h: 6.4, heads: [[GN, 'lens-yellow-on', 'lens-red-off'], [GN, YL, RD]], ladder: true, tex: 'signal/pole-galvanized' }));
  A('signal-old', '色灯信号機 さびた柱', (b) => railSig(b, O, { h: 5, heads: [[GN, YL, RD]], tex: 'signal/pole-rusty', ladder: true }));
  A('signal-dwarf', '入換信号機', (b) => dwarfSig(b, O, [GN, RD]));
  A('signal-dwarf-3', '入換信号機 3灯', (b) => dwarfSig(b, O, [GN, 'lens-yellow-on', 'lens-red-off']));
  A('signal-bridge', '信号橋 複線', (b) => sigBridge(b, O, -5.2, 5.2, [-2, 2], [[GN, YL, RD]]));
  A('signal-bridge-4', '信号橋 4線', (b) => sigBridge(b, O, -9.2, 9.2, [-6, -2, 2, 6], [[GN, YL, RD], [GN, RD]]));
  A('switch-stand', '転てつ器標識 高', (b) => switchStand(b, O, 'tall'));
  A('switch-stand-low', '転てつ器標識 低', (b) => switchStand(b, O, 'low'));
  A('switch-machine', '電気転てつ機', (b) => switchStand(b, O, 'machine'));
  A('mast', '架線柱 片持ち', (b) => mast(way(b, stand([0, 0, 0])), 0, -3.1, [0]));
  A('mast-rusty', '架線柱 さび 照明つき', (b) => mast(way(b, O), 0, -3.1, [0], { mat: 'structure/steel-green-rusty', lamp: true }));
  A('mast-portal', '架線門型柱 複線', (b) => portal(way(b, O), 0, -5.2, 5.2, [-2, 2]));
  A('mast-wired', '架線柱と架線 60m', (b) => {
    const w = way(b, stand([0, 0, -30]));
    for (const s of [5, 55]) mast(w, s, -3.1, [0]);
    wires(w, 0, 60, 0, [5, 55]);
  });
  A('sleepers-wood', '枕木の山 木', (b) => sleeperStack(b, O, 'rail/sleeper-wood-old', 4));
  A('sleepers-concrete', '枕木の山 PC', (b) => sleeperStack(b, O, 'rail/sleeper-concrete', 3, 6));
  A('sleepers-new', '枕木の山 新品', (b) => sleeperStack(b, O, 'rail/sleeper-wood-new', 5, 4));
  A('rails-spare', '予備レール', (b) => {
    for (const z of [1, 5, 9]) box(b, 'rail/sleeper-wood-old', O, [0, 0.07, z - 5], [0.6, 0.07, 0.11], 'Y');
    const w = way(b, stand([0, 0.14 - FOOT, -6]));
    [-0.36, -0.12, 0.12, 0.36].forEach((d, i) => rail(w, i * 0.15, 11.6 + i * 0.1, d, { head: 'rail/head-rusty', side: 'rail/steel-orange', caps: true }));
  });
  A('trough', 'ケーブルトラフ 12m', (b) => cableTrough(b, stand([0, 0, -6]), 12));
  A('trough-open', 'ケーブルトラフ 蓋外れ', (b) => cableTrough(b, stand([0, 0, -6]), 12, [3, 4, 8]));
  A('help-point', '非常通報装置', (b) => {
    box(b, 'structure/steel-blue', O, [0, 1.1, 0], [0.14, 1.1, 0.1], 'Y');
    box(b, 'structure/steel-yellow', O, [0, 1.35, 0.1], [0.11, 0.16, 0.012]);
    plate(b, R('warn-emergency'), O, [0, 1.85, 0.104], { size: [0.26, 0.195] });
    box(b, 'signal/lens-red-off', O, [0, 2.26, 0], [0.06, 0.06, 0.06]);
  });
  A('phone-box', '線路脇電話箱', (b) => {
    box(b, ZINC, O, [0, 0.6, 0], [0.035, 0.6, 0.035], 'Y');
    box(b, 'structure/steel-yellow', O, [0, 1.35, 0.03], [0.15, 0.2, 0.09]);
    box(b, 'structure/steel-yellow', O, [0, 1.56, 0.05], [0.17, 0.012, 0.13]);
    face(b, 'furniture/phone-sign', O, [0, 1.35, 0.122], 0.2, 0.2);
  });
  A('clock-hung', 'ホーム時計 吊下げ', (b) => hungClock(b, move(O, 0, -2, 0), 4.2, 3.2));
  A('clock-hung-old', 'ホーム時計 古い', (b) => hungClock(b, move(O, 0, -2, 0), 4.2, 3.2, 'furniture/clock-old'));
  A('track-panel', '線路 短尺 第三軌条 警告板', (b) => {
    const w = way(b, stand([0, 0, -5]));
    track(w, 0, 10, STYLES.concrete);
    trackSign(b, stand([2.6, 0.3, 0], -90), [R('warn-third-rail')], { y: 1.6 });
  });
}
