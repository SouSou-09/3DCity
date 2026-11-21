import { MeshBuilder, V3 } from './builder';
import { S, chainlink, masonry } from './boundaries';
import { hut } from './boats';
import { sheet } from './buildkit';
import { Pose, at, box, lathe, layX, layZ, move, pipe, plate, stand, tilt, turn } from './kit';
import { ball, cyl, hash, ladder, ringRail, torus } from './marine';
import { pad } from './parks';
import { lattice } from './port';
import { addModel } from './registry';

const ZINC = 'trim/paint-galvanized';
const CONC = 'concrete/walk-plain';
const P = (c: string): string => `trim/paint-${c}`;

/** One copy of a marking texture lying on the ground, centred on the pose, its top towards -z. */
export function decal(b: MeshBuilder, tex: string, f: Pose, y = 0.03): void {
  const p = b.part(tex);
  pad(b, tex, f, p.mw, p.mh, y, true);
}

/** Row of parking stalls along x on an asphalt apron; cars nose in towards -z. */
export function stalls(b: MeshBuilder, f: Pose, n: number, o: { asphalt?: string; worn?: boolean; stops?: string | null; special?: Record<number, string>; aisle?: number } = {}): void {
  const w = n * 2.6;
  const aisle = o.aisle ?? 3;
  pad(b, o.asphalt ?? 'asphalt/plain-used-clean', move(f, 0, 0, aisle / 2), w + 0.6, 5.4 + aisle, 0.01);
  for (let i = 0; i < n; i++) {
    const g = move(f, -w / 2 + 1.3 + i * 2.6, 0, 0);
    decal(b, `symbol/parking-stall-white-${o.worn ? 'worn' : 'new'}`, g);
    const sp = o.special?.[i];
    if (sp) decal(b, sp, move(g, 0, 0, 0.6), 0.04);
    if (o.stops !== null) wheelStop(b, move(g, 0, 0, -2.2), o.stops ?? CONC);
  }
}
export function wheelStop(b: MeshBuilder, f: Pose, mat: string): void {
  lathe(b, mat, { ...move(f, -0.9, 0.0, 0), y: f.x, x: f.z, z: f.y }, [[0, 0], [0.11, 0], [0.11, 1.8], [0, 1.8]], 4, 0.8);
  box(b, mat, f, [0, 0.03, 0], [0.9, 0.03, 0.1], 'y');
}
/** EV charging post; `fast` gives the big cabinet type. */
export function charger(b: MeshBuilder, f: Pose, o: { fast?: boolean; body?: string; accent?: string } = {}): void {
  const body = o.body ?? P('white');
  const [w, h, d] = o.fast ? [0.7, 2, 0.45] : [0.3, 1.45, 0.22];
  box(b, CONC, f, [0, 0.05, 0], [w / 2 + 0.1, 0.05, d / 2 + 0.1], 'y');
  box(b, body, f, [0, 0.1 + h / 2, 0], [w / 2, h / 2, d / 2], 'y');
  box(b, o.accent ?? P('green'), f, [0, 0.1 + h - 0.12, d / 2 + 0.003], [w / 2, 0.1, 0.003]);
  box(b, 'window/band-black', f, [0, 0.1 + h * 0.68, d / 2 + 0.004], [w * 0.32, h * 0.09, 0.003]);
  // Holstered plug and its cable looping down.
  box(b, P('black'), f, [w / 2 + 0.03, 0.1 + h * 0.55, 0], [0.03, 0.09, 0.05]);
  pipe(b, 'furniture/cable', [at(f, w / 2 + 0.05, 0.1 + h * 0.5, 0), at(f, w / 2 + 0.2, 0.35, 0.05), at(f, w / 2 + 0.05, 0.25, 0.1), at(f, w / 2, 0.5, 0.05)], 0.014, 5);
}
/** Cantilever carport along x: posts at the back, a tilted roof covering 5.4 m. */
export function carport(b: MeshBuilder, f: Pose, n: number, o: { frame?: string; roof?: string; double?: boolean } = {}): void {
  const frame = o.frame ?? 'structure/steel-white';
  const w = n * 2.6;
  const cols = Math.max(2, Math.round(w / 5.2) + 1);
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + 0.3 + ((w - 0.6) * i) / (cols - 1);
    box(b, frame, f, [x, 1.35, 0], [0.09, 1.35, 0.09], 'y');
    for (const sz of o.double ? [-1, 1] : [1]) b.beam(frame, at(f, x, 2.7, 0), at(f, x, 2.35, sz * 5.2), 0.1, 0.22);
  }
  for (const sz of o.double ? [-1, 1] : [1]) {
    sheet(b, o.roof ?? 'roof/corrugated-galvanized', at(f, -w / 2, 2.83, -sz * 0.3), at(f, w / 2, 2.83, -sz * 0.3), at(f, w / 2, 2.46, sz * 5.3), at(f, -w / 2, 2.46, sz * 5.3), [[0, 0], [w, 0], [w, 5.6], [0, 5.6]]);
    for (const z of [1.5, 3.3, 5.1]) b.beam(frame, at(f, -w / 2, 2.72 - z * 0.067, sz * z), at(f, w / 2, 2.72 - z * 0.067, sz * z), 0.06, 0.1);
  }
}
/** Attendant's booth with windows on all sides. */
export function booth(b: MeshBuilder, f: Pose, o: { wall?: string; roof?: string; w?: number; d?: number; flat?: boolean } = {}): void {
  const [w, d] = [o.w ?? 1.6, o.d ?? 2.2];
  box(b, CONC, f, [0, 0.08, 0], [w / 2 + 0.25, 0.08, d / 2 + 0.6], 'y');
  const g = move(f, 0, 0.16, 0);
  hut(b, g, w, d, 2.3, { wall: o.wall ?? 'wall/siding-white', roof: o.roof ?? 'roof/seam-grey', rise: o.flat ? 0 : 0.35, over: 0.35 });
  for (const sx of [-1, 1]) box(b, 'window/band-black', g, [sx * (w / 2 + 0.006), 1.55, 0], [0.005, 0.5, d / 2 - 0.3]);
  for (const sz of [-1, 1]) box(b, 'window/band-black', g, [0, 1.55, sz * (d / 2 + 0.006)], [w / 2 - 0.25, 0.5, 0.005]);
  box(b, P('yellow'), g, [0, 0.35, d / 2 + 0.45], [0.06, 0.5, 0.06]);
  box(b, P('yellow'), g, [0, 0.35, -d / 2 - 0.45], [0.06, 0.5, 0.06]);
}

/** Outline of a tunnel mouth, from the right springing over the crown to the left one. */
function mouth(w: number, h: number, kind: 'arch' | 'box' | 'horseshoe', W: number, H: number): [V3, V3][] {
  const r = w / 2;
  const s = kind === 'box' ? h : Math.max(0, h - r);
  const angs: number[] = [];
  for (let i = 0; i <= 20; i++) angs.push((i / 20) * Math.PI);
  const corner = Math.atan2(H, W / 2);
  angs.push(corner, Math.PI - corner);
  if (kind === 'box') angs.push(Math.atan2(h, r), Math.PI - Math.atan2(h, r));
  else if (s > 0) angs.push(Math.atan2(s, r), Math.PI - Math.atan2(s, r));
  angs.sort((a, c) => a - c);
  return angs.map((a) => {
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    const side = Math.abs(c) < 1e-6 ? 1e9 : r / Math.abs(c);
    let t: number;
    if (kind === 'box') t = Math.min(side, sn < 1e-6 ? 1e9 : h / sn);
    else if (side * sn <= s) t = side;
    else t = s * sn + Math.sqrt(Math.max(0, r * r - s * s * c * c));
    if (kind === 'horseshoe') t *= 1 + 0.1 * Math.sin(a) * Math.sin(a) * (1 - Math.abs(c));
    const to = Math.min(Math.abs(c) < 1e-6 ? 1e9 : W / 2 / Math.abs(c), sn < 1e-6 ? 1e9 : H / sn);
    return [[c * t, sn * t, 0], [c * to, sn * to, 0]] as [V3, V3];
  });
}
export interface PortalOpts {
  w: number;
  h: number;
  kind?: 'arch' | 'box' | 'horseshoe';
  face: string;
  /** Headwall size. */
  W?: number;
  H?: number;
  depth?: number;
  lining?: string;
  floor?: string | null;
  cap?: string | null;
  ring?: string | null;
  /** Offsets of further bores of the same size. */
  bores?: number[];
  wings?: number;
  sign?: string | null;
  lights?: boolean;
}
/** Tunnel portal: a headwall facing +z pierced by one or more bores that run back along -z. */
export function portal(b: MeshBuilder, f: Pose, o: PortalOpts): void {
  const kind = o.kind ?? 'arch';
  const bores = o.bores ?? [0];
  const span = Math.max(...bores) - Math.min(...bores);
  const Wb = o.w + 2.4;
  const [W, H, D] = [o.W ?? span + Wb, o.H ?? o.h + 2.2, o.depth ?? 8];
  const lining = o.lining ?? S('tunnel-lining');
  const x0 = -W / 2 + (Math.max(...bores) + Math.min(...bores)) / 2;
  bores.forEach((bx, k) => {
    // Each bore owns a strip of the headwall bounded by its neighbours.
    const lo = k === 0 ? x0 : (bores[k - 1] + bx) / 2;
    const hi = k === bores.length - 1 ? x0 + W : (bx + bores[k + 1]) / 2;
    const half = Math.min(bx - lo, hi - bx);
    const m = mouth(o.w, o.h, kind, half * 2, H);
    const g = move(f, bx, 0, 0);
    for (let i = 0; i + 1 < m.length; i++) {
      const [[a, qa], [c, qc]] = [m[i], m[i + 1]];
      b.quadFacing(o.face, at(g, ...a), at(g, ...qa), at(g, ...qc), at(g, ...c), f.z, [[bx + a[0], a[1]], [bx + qa[0], qa[1]], [bx + qc[0], qc[1]], [bx + c[0], c[1]]]);
      const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, -D / 2];
      const inw = at({ ...f, o: [0, 0, 0] }, -mid[0], o.h / 2 - mid[1], 0);
      b.quadFacing(lining, at(g, a[0], a[1], 0), at(g, c[0], c[1], 0), at(g, c[0], c[1], -D), at(g, a[0], a[1], -D), inw, [[i * 0.9, 0], [(i + 1) * 0.9, 0], [(i + 1) * 0.9, D], [i * 0.9, D]]);
      b.tri(S('tunnel-dark'), at(g, 0, 0, -D), at(g, a[0], a[1], -D), at(g, c[0], c[1], -D), [[0, 0], [1, 0], [1, 1]]);
      if (o.ring) b.quadFacing(o.ring, at(g, a[0], a[1], 0.12), at(g, a[0] * 1.07, a[1] * 1.07 + 0.01, 0.12), at(g, c[0] * 1.07, c[1] * 1.07 + 0.01, 0.12), at(g, c[0], c[1], 0.12), f.z, [[i * 0.5, 0], [i * 0.5, 0.5], [i * 0.5 + 0.5, 0.5], [i * 0.5 + 0.5, 0]]);
    }
    // Filler strips where the bore's square is narrower than its share of the wall.
    for (const [xa, xb] of [[lo, bx - half], [bx + half, hi]]) {
      if (xb - xa > 0.01) b.quadFacing(o.face, at(f, xa, 0, 0), at(f, xb, 0, 0), at(f, xb, H, 0), at(f, xa, H, 0), f.z, [[xa, 0], [xb, 0], [xb, H], [xa, H]]);
    }
    if (o.floor !== null) pad(b, o.floor ?? 'asphalt/plain-used-clean', move(g, 0, 0, -D / 2 + 1), o.w, D + 2, 0.02);
    if (o.lights) for (let z = -1.5; z > -D; z -= 3) box(b, S('lantern-glass-lit'), g, [0, o.h - 0.12, z], [0.5, 0.04, 0.12]);
  });
  // The rest of the box behind the face.
  const xc = x0 + W / 2;
  for (const sx of [-1, 1]) box(b, o.face, f, [xc + sx * (W / 2 - 0.2), H / 2, -D / 2], [0.2, H / 2, D / 2], 'yZ');
  box(b, o.face, f, [xc, H - 0.2, -D / 2], [W / 2 - 0.4, 0.2, D / 2], 'xXZ');
  if (o.cap !== null) box(b, o.cap ?? S('wall-cap'), f, [xc, H + 0.12, -0.15], [W / 2 + 0.15, 0.12, 0.45]);
  if (o.wings) for (const sx of [-1, 1]) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const [q0, q1] = [i / n, (i + 1) / n];
      const X = (q: number): number => xc + sx * (W / 2 + q * o.wings!);
      const Z = (q: number): number => q * o.wings! * 0.45;
      const Y = (q: number): number => H * (1 - q * 0.8);
      sheet(b, o.face, at(f, X(q0), 0, Z(q0)), at(f, X(q1), 0, Z(q1)), at(f, X(q1), Y(q1), Z(q1)), at(f, X(q0), Y(q0), Z(q0)), [[X(q0), 0], [X(q1), 0], [X(q1), Y(q1)], [X(q0), Y(q0)]]);
      b.beam(o.cap ?? S('wall-cap'), at(f, X(q0), Y(q0) + 0.08, Z(q0)), at(f, X(q1), Y(q1) + 0.08, Z(q1)), 0.45, 0.16);
    }
  }
  if (o.sign) plate(b, o.sign, f, [xc, o.h + (H - o.h) / 2 + 0.1, 0.06]);
}

/** Lattice transmission tower with cross-arms and insulator strings. */
export function pylon(b: MeshBuilder, f: Pose, h: number, o: { mat?: string; arms?: number; armW?: number; base?: number; tension?: boolean; earth?: boolean } = {}): void {
  const mat = o.mat ?? 'structure/steel-galvanized';
  const [arms, armW, base] = [o.arms ?? 3, o.armW ?? h * 0.22, o.base ?? h * 0.2];
  const waist = h * 0.55;
  lattice(b, mat, at(f, 0, 0, 0), at(f, 0, waist, 0), base, base * 0.3, f.x, 6);
  lattice(b, mat, at(f, 0, waist, 0), at(f, 0, h, 0), base * 0.3, base * 0.12, f.x, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, CONC, f, [(sx * base) / 2, 0.2, (sz * base) / 2], [0.4, 0.2, 0.4], 'y');
  for (let i = 0; i < arms; i++) {
    const y = h - 1 - (i * (h - waist - 1.5)) / Math.max(1, arms - 0.4);
    const aw = armW * (1 - (i === 1 ? -0.25 : 0) - (arms - 1 - i) * 0.0);
    for (const sx of [-1, 1]) {
      lattice(b, mat, at(f, 0, y, 0), at(f, sx * aw, y + 0.25, 0), base * 0.22, 0.12, f.y, 4);
      const tip = at(f, sx * aw, y + 0.2, 0);
      if (o.tension) for (const sz of [-1, 1]) b.tube('furniture/ceramic-brown', tip, at(f, sx * aw, y - 0.2, sz * 1.8), 0.09, 6);
      else b.tube('furniture/ceramic-brown', tip, at(f, sx * aw, y - 2, 0), 0.09, 6);
    }
  }
  if (o.earth !== false) b.tube(mat, at(f, 0, h, 0), at(f, 0, h + 1.5, 0), 0.05, 5, 0.02);
}
export function transformer(b: MeshBuilder, f: Pose, s = 1, body = P('grey')): void {
  box(b, CONC, f, [0, 0.15, 0], [2.4 * s, 0.15, 1.6 * s], 'y');
  box(b, body, f, [0, 0.3 + 1.2 * s, 0], [1.5 * s, 1.2 * s, 0.9 * s], 'y');
  for (const sz of [-1, 1]) for (let x = -1.3; x <= 1.31; x += 0.2) box(b, body, f, [x * s, 0.3 + 1.1 * s, sz * 1.2 * s], [0.03, 0.9 * s, 0.28 * s]);
  cyl(b, body, layX(move(f, -1.2 * s, 0.3 + 3.1 * s, -0.55 * s)), [0, 0, 0], 0.3 * s, 2.4 * s, 10);
  for (const sx of [-1, 1]) box(b, body, f, [sx * 0.8 * s, 0.3 + 2.6 * s, -0.55 * s], [0.05, 0.25 * s, 0.05]);
  for (let i = -1; i <= 1; i++) {
    lathe(b, 'furniture/ceramic-brown', move(f, i * 0.8 * s, 0.3 + 2.4 * s, 0.3 * s), [[0.1, 0], [0.16, 0.2], [0.08, 0.3], [0.16, 0.5], [0.08, 0.6], [0.16, 0.8], [0.06, 0.95], [0.03, 1.2]], 8);
    lathe(b, 'furniture/ceramic-grey', move(f, i * 0.5 * s, 0.3 + 2.4 * s, -0.45 * s), [[0.07, 0], [0.11, 0.15], [0.05, 0.25], [0.11, 0.4], [0.03, 0.55]], 8);
  }
  plate(b, S('sign-danger-voltage'), f, [0, 0.3 + 1.3 * s, 0.9 * s + 0.01], { size: [0.45, 0.32] });
}
/** Substation busbar gantry: two lattice columns and a beam with hanging insulators. */
export function gantry(b: MeshBuilder, f: Pose, w: number, h: number, mat = 'structure/steel-galvanized'): void {
  for (const sx of [-1, 1]) {
    lattice(b, mat, at(f, (sx * w) / 2, 0, 0), at(f, (sx * w) / 2, h, 0), 0.9, 0.5, f.x, 6);
    box(b, CONC, f, [(sx * w) / 2, 0.15, 0], [0.7, 0.15, 0.7], 'y');
  }
  lattice(b, mat, at(f, -w / 2, h - 0.3, 0), at(f, w / 2, h - 0.3, 0), 0.6, 0.6, f.y, Math.round(w / 1.2));
  for (let i = -1; i <= 1; i++) {
    const x = (i * w) / 3.4;
    b.tube('furniture/ceramic-brown', at(f, x, h - 0.6, 0), at(f, x, h - 2.1, 0), 0.08, 6);
    b.tube('furniture/cable', at(f, x, h - 2.1, 0), at(f, x, 3.2, 1.5), 0.02, 4);
  }
}
export function cellTower(b: MeshBuilder, f: Pose, h: number, kind: 'monopole' | 'lattice' | 'guyed' | 'palm', mat = ZINC): void {
  if (kind === 'lattice') lattice(b, 'structure/steel-galvanized', at(f, 0, 0, 0), at(f, 0, h, 0), h * 0.12, 1, f.x, Math.round(h / 3));
  else if (kind === 'guyed') {
    lattice(b, 'structure/steel-red', at(f, 0, 0, 0), at(f, 0, h, 0), 0.7, 0.7, f.x, Math.round(h / 1.5));
    for (let i = 0; i < 3; i++) for (const q of [0.45, 0.9]) {
      const a = (i / 3) * Math.PI * 2;
      b.tube('furniture/cable', at(f, 0, h * q, 0), at(f, Math.cos(a) * h * 0.5, 0, Math.sin(a) * h * 0.5), 0.012, 4);
      if (q < 0.5) box(b, CONC, f, [Math.cos(a) * h * 0.5, 0.15, Math.sin(a) * h * 0.5], [0.4, 0.15, 0.4], 'y');
    }
  } else b.tube(kind === 'palm' ? P('brown') : mat, at(f, 0, 0, 0), at(f, 0, h, 0), h * 0.016 + 0.2, 12, 0.22, true);
  cyl(b, CONC, f, [0, 0, 0], kind === 'lattice' ? 0.3 : 1, 0.25, 10);
  // Antenna sectors.
  const rings = kind === 'guyed' ? 1 : 2;
  for (let k = 0; k < rings; k++) {
    const y = h - 1.2 - k * 3.2;
    const rr = kind === 'lattice' ? 1.4 : 0.9;
    if (kind !== 'guyed') torus(b, mat, f, [0, y, 0], rr, 0.03, 12, 4);
    for (let i = 0; i < 3; i++) {
      const g = turn(move(f, 0, y, 0), i * 120 + k * 60);
      b.tube(mat, at(g, 0, 0, 0), at(g, 0, 0, rr), 0.03, 5);
      for (const sx of [-0.45, 0, 0.45]) box(b, P('white'), g, [sx, 0, rr + 0.08], [0.13, 1, 0.06]);
    }
  }
  for (let i = 0; i < 2; i++) {
    const g = turn(move(f, 0, h * (0.55 + i * 0.1), 0), 40 + i * 150);
    lathe(b, P('white'), layZ(move(g, 0, 0, kind === 'lattice' ? 0.8 : 0.35)), [[0, 0], [0.35, 0.08], [0.45, 0.3]], 10);
  }
  if (kind === 'palm') for (let i = 0; i < 14; i++) {
    const g = tilt(turn(move(f, 0, h - 0.3 - (i % 3) * 0.25, 0), i * 137.5), -25 + (i % 3) * 22);
    const p = b.part('plant/frond');
    sheet(b, 'plant/frond', at(g, -0.9, 0, 0.2), at(g, 0.9, 0, 0.2), at(g, 0.9, -0.5, 4.6), at(g, -0.9, -0.5, 4.6), [[0, 0], [p.mw, 0], [p.mw, p.mh], [0, p.mh]]);
  }
  hut(b, move(f, 3, 0, 0), 2.4, 3, 2.4, { wall: 'wall/block-beige', roof: 'roof/seam-grey', rise: 0, door: 'door/steel-grey' });
}
export function waterTower(b: MeshBuilder, f: Pose, kind: 'spheroid' | 'legged' | 'standpipe' | 'fluted' | 'wood', tank: string, h: number, o: { sign?: boolean; steel?: string } = {}): void {
  const steel = o.steel ?? tank;
  if (kind === 'spheroid') {
    lathe(b, tank, f, [[h * 0.14, 0], [h * 0.07, h * 0.12], [h * 0.06, h * 0.62], [h * 0.12, h * 0.7]], 16);
    ball(b, tank, f, [0, h * 0.82, 0], h * 0.26, 18, -90, 90, 0.72);
    if (o.sign) plate(b, S('sign-watertower-name'), f, [0, h * 0.82, h * 0.262], { warp: (x) => -(x * x) / (h * 0.5) });
  } else if (kind === 'fluted') {
    lathe(b, tank, f, [[h * 0.16, 0], [h * 0.14, h * 0.6], [h * 0.3, h * 0.72], [h * 0.3, h * 0.95], [0, h]], 20);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      b.tube(tank, at(f, Math.cos(a) * h * 0.165, 0, Math.sin(a) * h * 0.165), at(f, Math.cos(a) * h * 0.145, h * 0.6, Math.sin(a) * h * 0.145), 0.12, 5);
    }
    if (o.sign) plate(b, S('sign-watertower-name'), f, [0, h * 0.84, h * 0.302], { warp: (x) => -(x * x) / (h * 0.6) });
  } else if (kind === 'standpipe') {
    lathe(b, tank, f, [[h * 0.22, 0], [h * 0.22, h * 0.92], [0, h]], 20);
    ladder(b, f, [0, 0, h * 0.225], 0, h * 0.92);
    ringRail(b, ZINC, f, h * 0.92, h * 0.2, 1, 12);
    if (o.sign) plate(b, S('sign-watertower-name'), turn(f, 60), [0, h * 0.7, h * 0.222], { warp: (x) => -(x * x) / (h * 0.44) });
  } else {
    const wood = kind === 'wood';
    const [tr, th, ty] = wood ? [h * 0.2, h * 0.34, h * 0.56] : [h * 0.2, h * 0.24, h * 0.66];
    const legs = wood ? 4 : 6;
    for (let i = 0; i < legs; i++) {
      const a = (i / legs) * Math.PI * 2 + 0.4;
      const a2 = ((i + 1) / legs) * Math.PI * 2 + 0.4;
      const L = (q: number, aa: number): V3 => at(f, Math.cos(aa) * tr * (1.25 - q * 0.33), ty * q, Math.sin(aa) * tr * (1.25 - q * 0.33));
      b.tube(steel, L(0, a), L(1, a), wood ? 0.12 : 0.1, 6);
      box(b, CONC, f, [Math.cos(a) * tr * 1.25, 0.12, Math.sin(a) * tr * 1.25], [0.3, 0.12, 0.3], 'y');
      for (let k = 0; k < 3; k++) {
        b.tube(steel, L(k / 3, a), L((k + 1) / 3, a2), 0.03, 4);
        b.tube(steel, L((k + 1) / 3, a), L(k / 3, a2), 0.03, 4);
        b.tube(steel, L((k + 1) / 3, a), L((k + 1) / 3, a2), 0.045, 4);
      }
    }
    if (wood) {
      lathe(b, tank, move(f, 0, ty, 0), [[0, 0], [tr, 0], [tr * 0.96, th]], 16);
      for (const q of [0.12, 0.35, 0.6, 0.85]) torus(b, P('black'), f, [0, ty + th * q, 0], tr * (1 - q * 0.04) + 0.01, 0.015, 16, 4);
      lathe(b, 'roof/shake-cedar', move(f, 0, ty + th, 0), [[tr * 1.05, 0], [0, h - ty - th]], 16);
    } else {
      lathe(b, tank, move(f, 0, ty - th * 0.35, 0), [[0.4, 0], [tr * 0.7, th * 0.12], [tr, th * 0.35], [tr, th * 1.1], [tr * 0.6, th * 1.3], [0, h - ty + th * 0.35]], 16);
      b.tube(steel, at(f, 0, 0, 0), at(f, 0, ty - th * 0.35, 0), 0.4, 10);
      ringRail(b, steel, f, ty, tr + 0.5, 1, 14);
      lathe(b, steel, move(f, 0, ty - 0.04, 0), [[tr, 0], [tr + 0.55, 0], [tr + 0.55, 0.04], [tr, 0.04]], 16);
      if (o.sign) plate(b, S('sign-watertower-name'), f, [0, ty + th * 0.7, tr + 0.02], { warp: (x) => -(x * x) / (tr * 2) });
    }
    ladder(b, turn(f, 30), [0, 0, tr * 1.02], 0, ty + th * 0.5);
  }
}
/** Horizontal or vertical storage tank. */
export function tank(b: MeshBuilder, f: Pose, kind: 'h' | 'v', r: number, len: number, mat: string, o: { stair?: boolean; bund?: boolean } = {}): void {
  if (kind === 'h') {
    const g = layX(move(f, -len / 2, r + 0.5, 0));
    lathe(b, mat, g, [[0, -r * 0.35], [r * 0.6, -r * 0.27], [r, 0], [r, len], [r * 0.6, len + r * 0.27], [0, len + r * 0.35]], 14);
    for (const sx of [-1, 1]) box(b, CONC, f, [sx * len * 0.3, (r * 0.7 + 0.5) / 2, 0], [0.2, (r * 0.7 + 0.5) / 2, r * 0.85], 'y');
    cyl(b, mat, f, [0, 2 * r + 0.45, 0], 0.25, 0.3, 8);
  } else {
    lathe(b, mat, f, [[r, 0], [r, len], [0, len + r * 0.18]], 20);
    if (o.stair) {
      const n = Math.round(len / 0.25);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 1.1;
        const g = turn(move(f, 0, (i / n) * len, 0), (-a * 180) / Math.PI);
        box(b, ZINC, g, [r + 0.4, 0, 0], [0.4, 0.015, 0.15]);
        if (i % 3 === 0) b.tube(ZINC, at(g, r + 0.78, 0, 0), at(g, r + 0.78, 1, 0), 0.015, 4);
      }
      ringRail(b, ZINC, f, len, r - 0.1, 1, 16);
    }
  }
  if (o.bund) for (let i = 0; i < 4; i++) {
    const [hx, hz] = kind === 'h' ? [len / 2 + 1.5, r + 1.5] : [r + 2, r + 2];
    box(b, 'structure/wall-smooth', turn(f, i * 90), [0, 0.35, i % 2 ? hx : hz], [i % 2 ? hz : hx, 0.35, 0.1], 'y');
  }
}
/** Wind turbine with three blades. */
export function turbine(b: MeshBuilder, f: Pose, h: number, R: number, phase = 20): void {
  b.tube(P('white'), at(f, 0, 0, 0), at(f, 0, h, 0), h * 0.03 + 0.4, 14, h * 0.015 + 0.3, true);
  cyl(b, CONC, f, [0, 0, 0], h * 0.05 + 1, 0.3, 12);
  box(b, P('white'), f, [0, h + 0.6, -1], [0.9, 0.9, 2.6]);
  const hub = move(f, 0, h + 0.6, 2);
  lathe(b, P('white'), layZ(hub), [[0.9, -0.4], [0.8, 0.5], [0.4, 1.1], [0, 1.3]], 10);
  for (let i = 0; i < 3; i++) {
    const a = ((phase + i * 120) * Math.PI) / 180;
    const dir = (r: number, w: number): V3 => at(hub, Math.cos(a) * r - Math.sin(a) * w, Math.sin(a) * r + Math.cos(a) * w, 0.4);
    const n = 5;
    for (let k = 0; k < n; k++) {
      const [r0, r1] = [0.6 + ((R - 0.6) * k) / n, 0.6 + ((R - 0.6) * (k + 1)) / n];
      const W = (r: number): number => (r < R * 0.2 ? 0.5 + (r / (R * 0.2)) * R * 0.045 : R * 0.07 * (1 - ((r - R * 0.2) / (R * 0.8)) * 0.85));
      sheet(b, P('white'), dir(r0, -W(r0) * 0.35), dir(r1, -W(r1) * 0.35), dir(r1, W(r1) * 0.65), dir(r0, W(r0) * 0.65), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }
}
/** Tower crane: lattice mast, slewing jib and counter-jib. */
export function towerCrane(b: MeshBuilder, f: Pose, h: number, jib: number, mat: string, o: { luffing?: boolean; slew?: number } = {}): void {
  box(b, CONC, f, [0, 0.3, 0], [3, 0.3, 3], 'y');
  lattice(b, mat, at(f, 0, 0.6, 0), at(f, 0, h, 0), 1.8, 1.8, f.x, Math.round(h / 2.5));
  const g = turn(move(f, 0, h, 0), o.slew ?? 25);
  cyl(b, P('charcoal'), g, [0, 0, 0], 1.4, 0.5, 12);
  box(b, P('white'), g, [1.3, 1.5, 1.2], [0.7, 0.9, 0.7]);
  box(b, 'window/band-black', g, [1.3, 1.7, 1.91], [0.6, 0.5, 0.005]);
  const top = at(g, 0, o.luffing ? 6 : 8, 0);
  lattice(b, mat, at(g, 0, 0.5, 0), top, 1.6, 0.3, g.x, 4);
  const cj = jib * 0.3;
  lattice(b, mat, at(g, -1, 1.2, 0), at(g, -cj, 1.2, 0), 1.2, 1.2, g.y, 6);
  box(b, CONC, g, [-cj + 1.2, 0.4, 0], [1.4, 0.9, 0.9]);
  b.tube('furniture/cable', top, at(g, -cj, 1.8, 0), 0.03, 4);
  if (o.luffing) {
    const tip = at(g, jib * 0.75, jib * 0.62, 0);
    lattice(b, mat, at(g, 1, 1.2, 0), tip, 1.4, 0.5, g.y, 12);
    b.tube('furniture/cable', top, tip, 0.03, 4);
    b.tube('furniture/cable', tip, at(g, jib * 0.75, jib * 0.62 - h * 0.5, 0), 0.02, 4);
    box(b, P('yellow'), g, [jib * 0.75, jib * 0.62 - h * 0.5 - 0.4, 0], [0.25, 0.4, 0.15]);
  } else {
    lattice(b, mat, at(g, 1, 1.2, 0), at(g, jib, 1.2, 0), 1.3, 1, g.y, Math.round(jib / 2));
    for (const q of [0.45, 0.85]) b.tube('furniture/cable', top, at(g, jib * q, 1.9, 0), 0.03, 4);
    box(b, P('charcoal'), g, [jib * 0.6, 0.45, 0], [0.7, 0.15, 0.6]);
    for (const sz of [-0.2, 0.2]) b.tube('furniture/cable', at(g, jib * 0.6, 0.4, sz), at(g, jib * 0.6, -h * 0.55, sz * 0.3), 0.015, 4);
    box(b, P('yellow'), g, [jib * 0.6, -h * 0.55 - 0.4, 0], [0.25, 0.4, 0.15]);
  }
}
/** Tube-and-coupler scaffold against a wall on the -z side. */
export function scaffold(b: MeshBuilder, f: Pose, bays: number, lifts: number, o: { net?: string | null; mat?: string } = {}): void {
  const mat = o.mat ?? ZINC;
  const [bw, lh, d] = [2.4, 2, 1.2];
  for (let i = 0; i <= bays; i++) for (const z of [0, -d]) {
    b.tube(mat, at(f, i * bw, 0, z), at(f, i * bw, lifts * lh + 1.1, z), 0.025, 6);
    box(b, 'signal/pole-wood', f, [i * bw, 0.02, z], [0.12, 0.02, 0.12]);
  }
  for (let l = 1; l <= lifts; l++) {
    box(b, 'signal/pole-wood', f, [(bays * bw) / 2, l * lh, -d / 2], [(bays * bw) / 2, 0.025, d / 2 - 0.05]);
    for (const y of [0.5, 1]) b.tube(mat, at(f, 0, l * lh + y, 0), at(f, bays * bw, l * lh + y, 0), 0.02, 5);
    box(b, P('yellow'), f, [(bays * bw) / 2, l * lh + 0.1, 0.02], [(bays * bw) / 2, 0.075, 0.012]);
    for (let i = 0; i <= bays; i++) b.tube(mat, at(f, i * bw, l * lh - 0.05, 0), at(f, i * bw, l * lh - 0.05, -d), 0.02, 5);
    for (let i = 0; i < bays; i++) if ((i + l) % 2 === 0) b.tube(mat, at(f, i * bw, (l - 1) * lh, 0.03), at(f, (i + 1) * bw, l * lh, 0.03), 0.02, 5);
  }
  if (o.net) sheet(b, o.net, at(f, 0, lh, 0.06), at(f, bays * bw, lh, 0.06), at(f, bays * bw, lifts * lh + 1.1, 0.06), at(f, 0, lifts * lh + 1.1, 0.06), [[0, 0], [bays * bw, 0], [bays * bw, lifts * lh], [0, lifts * lh]]);
}
export function portaloo(b: MeshBuilder, f: Pose, body: string): void {
  box(b, P('charcoal'), f, [0, 0.06, 0], [0.6, 0.06, 0.62], 'y');
  box(b, body, f, [0, 1.17, 0], [0.56, 1.05, 0.58], 'y');
  box(b, P('white'), f, [0.03, 1.15, 0.585], [0.4, 0.95, 0.008]);
  lathe(b, P('white'), turn(move(f, 0, 2.22, 0), 45), [[0.8, 0], [0.55, 0.14], [0, 0.18]], 4);
  box(b, P('charcoal'), f, [0.36, 1.2, 0.6], [0.03, 0.08, 0.012]);
  b.tube(P('charcoal'), at(f, -0.35, 2.3, -0.35), at(f, -0.35, 2.6, -0.35), 0.04, 6, 0.04, true);
}
/** Conical stockpile of loose material. */
export function stockpile(b: MeshBuilder, f: Pose, tex: string, r: number, h: number, seed: number): void {
  const prof: [number, number][] = [[r, 0], [r * 0.75, h * 0.28], [r * 0.4, h * 0.72], [r * 0.12, h * 0.97], [0, h]];
  lathe(b, tex, turn(f, hash(1, seed) * 360), prof, 12, 0.8 + hash(2, seed) * 0.3);
}
/** Loading dock: raised platform with bumpers, doors and levellers along a wall on the -z side. */
export function loadingDock(b: MeshBuilder, f: Pose, doors: number, o: { wall?: string; door?: string; canopy?: boolean } = {}): void {
  const w = doors * 4.2 + 1;
  box(b, 'structure/wall-smooth', f, [0, 0.6, -1.5], [w / 2, 0.6, 1.5], 'y');
  box(b, o.wall ?? 'wall/metal-ribbed-grey', f, [0, 3.6, -3.15], [w / 2, 2.4, 0.15], 'y');
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + 2.6 + i * 4.2;
    box(b, o.door ?? 'door/dock-white', f, [x, 2.6, -2.99], [1.35, 1.4, 0.01]);
    box(b, P('yellow'), f, [x, 1.21, -0.9], [1.1, 0.01, 0.9]);
    for (const sx of [-1, 1]) box(b, P('black'), f, [x + sx * 1.5, 0.9, 0.06], [0.14, 0.25, 0.06]);
    box(b, S('stripes-yellow-black'), f, [x, 1.1, 0.012], [1.2, 0.08, 0.01]);
  }
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) box(b, CONC, f, [(sx * (w / 2 + 0.5)), 0.12 + k * 0.24 - 0.12 + 0.12, -0.3 - k * 0.3 - 1.2], [0.5, 0.12 + k * 0.12, 0.15], 'y');
  if (o.canopy) {
    sheet(b, 'roof/corrugated-galvanized', at(f, -w / 2, 4.5, -3), at(f, w / 2, 4.5, -3), at(f, w / 2, 4.1, 0.4), at(f, -w / 2, 4.1, 0.4), [[0, 0], [w, 0], [w, 3.4], [0, 3.4]]);
    for (let x = -w / 2 + 0.3; x <= w / 2; x += (w - 0.6) / doors) b.beam('structure/steel-grey', at(f, x, 4.42, -3), at(f, x, 4.04, 0.4), 0.08, 0.14);
  }
}
/** Pipe culvert or box culvert headwall facing +z. */
export function culvert(b: MeshBuilder, f: Pose, kind: 'pipe' | 'box' | 'twin', size: number, face = 'structure/wall-smooth'): void {
  const bores = kind === 'twin' ? [-size * 0.75, size * 0.75] : [0];
  portal(b, f, { w: size, h: kind === 'box' ? size * 0.7 : size * 0.9, kind: kind === 'box' ? 'box' : 'arch', face, bores, W: (kind === 'twin' ? size * 1.5 : 0) + size + 1.6, H: size + 0.7, depth: 3, lining: 'structure/wall-old', floor: S('water-pond'), cap: null, wings: size * 1.2 });
  box(b, CONC, f, [0, 0.03, size * 0.6], [size * 1.2 + (kind === 'twin' ? size * 0.75 : 0), 0.03, size * 0.6], 'y');
}

export function addInfra(): void {
  const A = (id: string, label: string, fn: (b: MeshBuilder, f: Pose) => void): void => addModel('infra', id, label, (b) => fn(b, stand()));

  // Parking.
  A('parking-row-5', '駐車場 5台 車止めつき', (b, f) => stalls(b, f, 5));
  A('parking-row-10', '駐車場 10台 かすれた線', (b, f) => stalls(b, f, 10, { asphalt: 'asphalt/plain-worn-cracked', worn: true }));
  A('parking-row-double', '駐車場 向かい合わせ 8台×2', (b, f) => {
    stalls(b, move(f, 0, 0, 2.7), 8, { aisle: 0, stops: null });
    stalls(b, turn(move(f, 0, 0, -2.7), 180), 8, { aisle: 0, stops: null });
  });
  A('parking-accessible', '駐車場 車いす用2台と通路', (b, f) => {
    stalls(b, f, 3, { special: { 0: 'symbol/handicap-new', 2: 'symbol/handicap-new' }, stops: 'trim/paint-blue' });
    decal(b, 'symbol/parking-stall-hatched-new', f, 0.045);
    for (const x of [-2.6, 2.6]) {
      b.tube(ZINC, at(f, x, 0, -3), at(f, x, 2.1, -3), 0.03, 6, 0.03, true);
      box(b, P('blue'), f, [x, 1.8, -2.96], [0.15, 0.22, 0.005]);
    }
  });
  A('parking-ev', '駐車場 EV充電4台', (b, f) => {
    stalls(b, f, 4, { special: { 0: 'symbol/ev-charge-new', 1: 'symbol/ev-charge-new', 2: 'symbol/ev-charge-new', 3: 'symbol/ev-charge-new' }, stops: null });
    for (const x of [-2.6, 2.6]) charger(b, move(f, x, 0, -3.1));
  });
  A('parking-carport', '駐車場 片持ち屋根 6台', (b, f) => {
    stalls(b, move(f, 0, 0, 2.9), 6, { stops: null });
    carport(b, f, 6);
  });
  A('carport-double', 'カーポート 両側 8台', (b, f) => carport(b, f, 4, { double: true, frame: 'structure/steel-grey' }));
  A('carport-fabric', 'カーポート 布屋根 4台', (b, f) => carport(b, f, 4, { roof: S('canvas-white'), frame: 'structure/steel-blue' }));
  A('wheel-stop', '車止めブロック コンクリート', (b, f) => wheelStop(b, f, CONC));
  A('wheel-stop-yellow', '車止めブロック 黄', (b, f) => wheelStop(b, f, P('yellow')));
  A('wheel-stop-rubber', '車止めブロック ゴム 黒黄', (b, f) => wheelStop(b, f, S('stripes-yellow-black')));
  A('speed-bump', 'スピードバンプ ゴム', (b, f) => {
    lathe(b, S('stripes-yellow-black'), { ...move(f, -1.8, 0, 0), y: f.x, x: f.z, z: f.y }, [[0, 0], [0.2, 0], [0.2, 3.6], [0, 3.6]], 8, 0.3);
  });
  A('ev-charger', 'EV充電器', (b, f) => charger(b, f));
  A('ev-charger-blue', 'EV充電器 青', (b, f) => charger(b, f, { body: P('charcoal'), accent: P('blue') }));
  A('ev-charger-fast', 'EV急速充電器', (b, f) => charger(b, f, { fast: true }));
  A('ev-charger-fast-red', 'EV急速充電器 赤白', (b, f) => charger(b, f, { fast: true, accent: P('red') }));
  A('parking-booth', '駐車場の料金所', (b, f) => booth(b, f));
  A('parking-booth-flat', '駐車場の料金所 陸屋根 黄', (b, f) => booth(b, f, { wall: 'wall/metal-ribbed-grey', flat: true, w: 1.4, d: 1.8 }));
  A('guard-booth', '守衛所', (b, f) => booth(b, f, { wall: 'wall/block-beige', roof: 'roof/seam-green', w: 2.6, d: 3 }));
  A('ticket-machine', '駐車券発行機', (b, f) => {
    box(b, CONC, f, [0, 0.08, 0], [0.4, 0.08, 0.4], 'y');
    box(b, P('yellow'), f, [0, 0.76, 0], [0.22, 0.6, 0.2], 'y');
    plate(b, S('sign-ticket-machine'), f, [0, 1, 0.205], { size: [0.36, 0.45] });
  });
  A('parking-sign-rates', '駐車料金の看板', (b, f) => {
    for (const sx of [-1, 1]) b.tube(ZINC, at(f, sx * 0.55, 0, 0), at(f, sx * 0.55, 2.6, 0), 0.035, 6, 0.035, true);
    plate(b, S('sign-parking-rates'), f, [0, 1.9, 0.04]);
  });
  A('parking-sign-full', '満車表示の看板', (b, f) => {
    b.tube(P('blue'), at(f, 0, 0, 0), at(f, 0, 3.4, 0), 0.07, 8, 0.07, true);
    plate(b, S('sign-parking-full'), f, [0, 2.8, 0.08], { back: S('sign-parking-full') });
  });
  A('cart-corral', 'カート置き場', (b, f) => {
    for (const sz of [-1, 1]) {
      pipe(b, ZINC, [at(f, -2.5, 0, sz * 0.7), at(f, -2.5, 1, sz * 0.7), at(f, 2.5, 1, sz * 0.7), at(f, 2.5, 0, sz * 0.7)], 0.025, 6);
      b.tube(ZINC, at(f, -2.5, 0.5, sz * 0.7), at(f, 2.5, 0.5, sz * 0.7), 0.02, 5);
      b.tube(ZINC, at(f, 0, 0, sz * 0.7), at(f, 0, 1, sz * 0.7), 0.025, 6);
    }
    b.tube(ZINC, at(f, -2.5, 1, -0.7), at(f, -2.5, 1, 0.7), 0.025, 6);
    box(b, P('green'), f, [-2.5, 1.5, 0], [0.02, 0.3, 0.5]);
    for (const sz of [-1, 1]) b.tube(ZINC, at(f, -2.5, 1, sz * 0.6), at(f, -2.5, 1.8, sz * 0.6), 0.02, 5);
  });

  // Tunnel portals.
  A('tunnel-portal', 'トンネル坑口 2車線 コンクリート', (b, f) => portal(b, f, { w: 9, h: 6.5, face: S('retaining-concrete'), wings: 7, sign: S('sign-tunnel-name'), lights: true }));
  A('tunnel-portal-stained', 'トンネル坑口 2車線 汚れ 馬蹄形', (b, f) => portal(b, f, { w: 9, h: 6.8, kind: 'horseshoe', face: S('retaining-concrete-stained'), wings: 5, ring: 'structure/wall-old', lights: true }));
  A('tunnel-portal-stone', 'トンネル坑口 石積み アーチ', (b, f) => portal(b, f, { w: 7, h: 5.6, face: 'structure/stone-ashlar', ring: 'structure/stone-dark', lining: 'structure/stone-dark', wings: 6, H: 8.5 }));
  A('tunnel-portal-brick', 'トンネル坑口 レンガ 1車線', (b, f) => portal(b, f, { w: 5, h: 4.8, face: 'structure/brick-red', ring: 'structure/stone-ashlar', lining: 'structure/brick-brown', wings: 4, sign: S('sign-clearance') }));
  A('tunnel-portal-box', 'トンネル坑口 箱形 3車線', (b, f) => portal(b, f, { w: 13, h: 5.2, kind: 'box', face: S('retaining-concrete'), lining: S('tunnel-tile'), sign: S('sign-clearance'), lights: true }));
  A('tunnel-portal-twin', 'トンネル坑口 2連 高速道路', (b, f) => portal(b, f, { w: 10, h: 6.8, face: S('retaining-concrete'), bores: [-7, 7], wings: 8, sign: S('sign-tunnel-name'), lights: true }));
  A('tunnel-portal-twin-box', 'トンネル坑口 2連 箱形 タイル', (b, f) => portal(b, f, { w: 9, h: 5, kind: 'box', face: S('retaining-concrete-stained'), bores: [-5.2, 5.2], lining: S('tunnel-tile'), lights: true }));
  A('tunnel-portal-shotcrete', 'トンネル坑口 吹付け斜面', (b, f) => portal(b, f, { w: 9, h: 6.5, face: S('retaining-shotcrete'), ring: S('retaining-concrete'), W: 22, H: 11, cap: null }));
  A('tunnel-portal-rail', '鉄道トンネル坑口 単線', (b, f) => portal(b, f, { w: 5, h: 6, kind: 'horseshoe', face: 'structure/stone-ashlar', ring: 'structure/brick-red', lining: 'structure/brick-brown', floor: 'rail/ballast-grey', wings: 4 }));
  A('tunnel-portal-rail-double', '鉄道トンネル坑口 複線', (b, f) => portal(b, f, { w: 9.5, h: 6.6, face: S('retaining-concrete-stained'), floor: 'rail/ballast-grey', wings: 6 }));
  A('underpass-ped', '歩行者用地下道の入口', (b, f) => portal(b, f, { w: 3, h: 2.6, kind: 'box', face: 'structure/wall-smooth', lining: S('tunnel-tile'), floor: CONC, depth: 6, H: 3.6, W: 6, lights: true }));
  A('underpass-road', '道路のアンダーパス 箱形 1車線', (b, f) => portal(b, f, { w: 5.5, h: 3.9, kind: 'box', face: 'structure/wall-old', lining: 'structure/wall-old', depth: 10, sign: S('sign-clearance'), wings: 5 }));

  // Drainage.
  A('culvert-pipe', '排水管の吐口 丸管', (b, f) => culvert(b, f, 'pipe', 1.2));
  A('culvert-pipe-large', '排水管の吐口 大口径', (b, f) => culvert(b, f, 'pipe', 2.4, S('retaining-concrete-stained')));
  A('culvert-twin', '排水管の吐口 2連', (b, f) => culvert(b, f, 'twin', 1.5));
  A('culvert-box', 'ボックスカルバート', (b, f) => culvert(b, f, 'box', 3, S('retaining-concrete')));
  A('drain-channel', '排水路 コンクリート 台形 10m', (b, f) => {
    for (const sz of [-1, 1]) sheet(b, S('retaining-concrete-stained'), at(f, -5, 0, sz * 3), at(f, 5, 0, sz * 3), at(f, 5, -1.6, sz * 1.2), at(f, -5, -1.6, sz * 1.2), [[0, 0], [10, 0], [10, 2.4], [0, 2.4]]);
    pad(b, S('retaining-concrete-stained'), move(f, 0, -1.6, 0), 10, 2.4, 0);
    pad(b, S('water-pond'), move(f, 0, -1.55, 0), 10, 1, 0);
  });

  // Power.
  A('pylon', '送電鉄塔 30m', (b, f) => pylon(b, f, 30));
  A('pylon-tall', '送電鉄塔 45m 腕金4段', (b, f) => pylon(b, f, 45, { arms: 4 }));
  A('pylon-tension', '送電鉄塔 耐張型 25m', (b, f) => pylon(b, f, 25, { tension: true, base: 7 }));
  A('pylon-small', '送電鉄塔 小 18m 腕金2段', (b, f) => pylon(b, f, 18, { arms: 2, earth: false }));
  A('pylon-red-white', '送電鉄塔 赤白 40m', (b, f) => pylon(b, f, 40, { mat: 'structure/steel-red' }));
  A('pylon-monopole', '送電柱 鋼管 22m', (b, f) => {
    b.tube(ZINC, at(f, 0, 0, 0), at(f, 0, 22, 0), 0.5, 12, 0.22, true);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
      b.beam(ZINC, at(f, 0, 20.5 - i * 2.6, 0), at(f, sx * 2.6, 20.8 - i * 2.6, 0), 0.12, 0.2);
      b.tube('furniture/ceramic-grey', at(f, sx * 2.6, 20.8 - i * 2.6, 0), at(f, sx * 2.6, 19.4 - i * 2.6, 0), 0.08, 6);
    }
  });
  A('transformer', '変電所の変圧器', (b, f) => transformer(b, f));
  A('transformer-large', '変電所の変圧器 大 緑', (b, f) => transformer(b, f, 1.5, P('green')));
  A('substation-gantry', '変電所の門形鉄構', (b, f) => gantry(b, f, 10, 9));
  A('substation', '変電所 フェンスつき一式', (b, f) => {
    pad(b, 'ground/gravel', f, 22, 16, 0.02);
    transformer(b, move(f, -4, 0, 1));
    transformer(b, move(f, 4, 0, 1));
    gantry(b, move(f, 0, 0, -4.5), 16, 9);
    hut(b, move(f, 8, 0, -5), 3, 4, 2.6, { wall: 'wall/block-beige', roof: 'roof/seam-grey', rise: 0, door: 'door/steel-grey' });
    for (let i = 0; i < 4; i++) {
      chainlink(b, turn(move(f, [-11, 11, 11, -11][i], 0, [8, 8, -8, -8][i]), [0, 90, 180, 270][i]), i % 2 ? 16 : 22, { h: 2.4, barbed: 1 });
    }
    plate(b, S('sign-danger-voltage'), f, [0, 1.4, 8.03]);
  });

  // Telecom.
  A('cell-tower', '携帯基地局 鋼管柱 30m', (b, f) => cellTower(b, f, 30, 'monopole'));
  A('cell-tower-lattice', '携帯基地局 鉄塔 40m', (b, f) => cellTower(b, f, 40, 'lattice'));
  A('cell-tower-palm', '携帯基地局 擬木(ヤシ) 22m', (b, f) => cellTower(b, f, 22, 'palm'));
  A('radio-mast', '無線塔 支線式 赤 60m', (b, f) => cellTower(b, f, 60, 'guyed'));
  A('satellite-dish', 'パラボラアンテナ 大 直径5m', (b, f) => {
    cyl(b, CONC, f, [0, 0, 0], 1.2, 0.3, 10);
    b.tube(P('white'), at(f, 0, 0.3, 0), at(f, 0, 3, 0), 0.25, 10);
    const g = tilt(move(f, 0, 3.2, 0), 50);
    lathe(b, P('white'), g, [[0, 0], [1, 0.12], [1.9, 0.5], [2.5, 0.95]], 18);
    for (let i = 0; i < 3; i++) b.tube(ZINC, at(g, Math.cos(i * 2.09) * 2.3, 0.8, Math.sin(i * 2.09) * 2.3), at(g, 0, 2.4, 0), 0.025, 5);
    cyl(b, P('grey'), g, [0, 2.3, 0], 0.15, 0.4, 8);
  });

  // Water and fuel.
  A('water-tower', '給水塔 球形 白 35m', (b, f) => waterTower(b, f, 'spheroid', S('tank-white'), 35, { sign: true }));
  A('water-tower-blue', '給水塔 球形 青 28m', (b, f) => waterTower(b, f, 'spheroid', S('tank-blue'), 28));
  A('water-tower-legged', '給水塔 脚つき 緑 30m', (b, f) => waterTower(b, f, 'legged', S('tank-green'), 30, { sign: true, steel: 'structure/steel-green' }));
  A('water-tower-rusty', '給水塔 脚つき さび 24m', (b, f) => waterTower(b, f, 'legged', S('tank-rusty'), 24, { steel: 'structure/steel-grey-rusty' }));
  A('water-tower-fluted', '給水塔 縦溝つき柱 40m', (b, f) => waterTower(b, f, 'fluted', S('tank-white'), 40, { sign: true }));
  A('water-tower-standpipe', '配水タンク 円筒 20m', (b, f) => waterTower(b, f, 'standpipe', S('tank-blue'), 20, { sign: true }));
  A('water-tower-wood', '給水塔 木の樽形 14m', (b, f) => waterTower(b, f, 'wood', 'signal/pole-wood', 14, { steel: 'structure/steel-black' }));
  A('tank-horizontal', '横置きタンク 白', (b, f) => tank(b, f, 'h', 1.2, 6, S('tank-white')));
  A('tank-propane', 'プロパンタンク 大 防液堤つき', (b, f) => tank(b, f, 'h', 1.6, 10, S('tank-white'), { bund: true }));
  A('tank-diesel', '燃料タンク 横置き 緑', (b, f) => tank(b, f, 'h', 0.9, 3.5, S('tank-green'), { bund: true }));
  A('tank-vertical', '縦置きタンク らせん階段つき 白', (b, f) => tank(b, f, 'v', 6, 10, S('tank-white'), { stair: true }));
  A('tank-vertical-rusty', '縦置きタンク さび', (b, f) => tank(b, f, 'v', 4, 7, S('tank-rusty'), { stair: true, bund: true }));
  A('tank-vertical-small', '縦置きタンク 小 青', (b, f) => tank(b, f, 'v', 1.5, 4.5, S('tank-blue')));
  A('wind-turbine', '風力発電機 60m', (b, f) => turbine(b, f, 60, 35));
  A('wind-turbine-small', '風力発電機 小 25m', (b, f) => turbine(b, f, 25, 13, 75));
  A('pump-station', 'ポンプ場の建屋', (b, f) => {
    hut(b, f, 5, 4, 3, { wall: 'structure/brick-red', roof: 'roof/seam-grey', rise: 0.9, door: 'door/steel-grey' });
    pipe(b, P('blue'), [at(f, 2.5, 0.6, 0), at(f, 3.6, 0.6, 0), at(f, 3.6, 0, 0)], 0.2, 8);
    torus(b, P('red'), layZ(move(f, 3.2, 0.95, 0)), [0, 0, 0], 0.2, 0.025, 10, 4);
  });

  // Construction sites.
  A('tower-crane', 'タワークレーン 40m 黄', (b, f) => towerCrane(b, f, 40, 45, 'structure/steel-yellow'));
  A('tower-crane-red', 'タワークレーン 55m 赤', (b, f) => towerCrane(b, f, 55, 55, 'structure/steel-red', { slew: -60 }));
  A('tower-crane-luffing', 'タワークレーン 起伏式 45m 白', (b, f) => towerCrane(b, f, 45, 40, 'structure/steel-white', { luffing: true, slew: 100 }));
  A('scaffold', '足場 3スパン 3層', (b, f) => scaffold(b, f, 3, 3));
  A('scaffold-net', '足場 5スパン 5層 緑ネット', (b, f) => scaffold(b, f, 5, 5, { net: S('screen-green') }));
  A('scaffold-blue', '足場 4スパン 4層 青シート', (b, f) => scaffold(b, f, 4, 4, { net: S('tarp-blue') }));
  (['blue', 'green', 'grey', 'orange'] as const).forEach((c, i) => A(`portaloo-${c}`, `仮設トイレ ${['青', '緑', '灰', '橙'][i]}`, (b, f) => portaloo(b, f, P(c))));
  A('portaloo-row', '仮設トイレ 4基並び', (b, f) => ['blue', 'blue', 'green', 'blue'].forEach((c, i) => portaloo(b, move(f, -2 + i * 1.3, 0, 0), P(c))));
  (['ground/gravel', 'site/sand-dry', 'ground/dirt', 'site/mud'] as const).forEach((t, i) => A(`stockpile-${['gravel', 'sand', 'dirt', 'mud'][i]}`, `資材の山 ${['砕石', '砂', '土', '泥'][i]}`, (b, f) => {
    stockpile(b, f, t, 3 + i * 0.6, 1.8 + i * 0.3, 20 + i);
    if (i < 2) stockpile(b, move(f, 3.2, 0, 1), t, 1.8, 1, 30 + i);
  }));
  A('pipe-stack', 'コンクリート管の山', (b, f) => {
    [[-1.3, 0.6], [0, 0.6], [1.3, 0.6], [-0.65, 1.7], [0.65, 1.7]].forEach(([z, y]) => {
      const g = layX(move(f, -1.5, y, z));
      lathe(b, CONC, g, [[0.48, 0], [0.6, 0], [0.6, 3], [0.48, 3], [0.48, 0]], 14);
    });
    for (const sx of [-1, 1]) box(b, 'signal/pole-wood', f, [sx, 0.04, 0], [0.06, 0.04, 2]);
  });
  A('cable-reel', 'ケーブルドラム 木製', (b, f) => {
    const g = layZ(move(f, 0, 0.9, -0.5));
    for (const y of [0, 0.94]) cyl(b, 'wall/plywood-tan', g, [0, y, 0], 0.9, 0.06, 16);
    cyl(b, P('black'), g, [0, 0.06, 0], 0.5, 0.88, 14);
  });
  A('cable-reel-flat', 'ケーブルドラム 横倒し オレンジ管', (b, f) => {
    for (const y of [0, 0.74]) cyl(b, 'signal/pole-wood-grey', f, [0, y, 0], 1.1, 0.06, 16);
    cyl(b, P('orange'), f, [0, 0.06, 0], 0.7, 0.68, 14);
  });
  A('pallet-stack', 'パレットの山', (b, f) => {
    for (let k = 0; k < 7; k++) {
      const g = turn(move(f, (hash(k, 7) - 0.5) * 0.08, k * 0.15, 0), (hash(k, 8) - 0.5) * 8);
      for (const z of [-0.5, 0, 0.5]) box(b, 'wall/plywood-tan', g, [0, 0.06, z], [0.6, 0.045, 0.05]);
      for (let x = -0.52; x <= 0.53; x += 0.26) box(b, 'wall/plywood-tan', g, [x, 0.127, 0], [0.05, 0.011, 0.5]);
    }
  });

  // Service yards.
  A('loading-dock-2', '搬入口 2扉', (b, f) => loadingDock(b, f, 2));
  A('loading-dock-4', '搬入口 4扉 ひさしつき', (b, f) => loadingDock(b, f, 4, { canopy: true, wall: 'wall/metal-ribbed-blue' }));
  A('dumpster-enclosure', 'ゴミ置き場 ブロック塀と扉', (b, f) => {
    pad(b, CONC, f, 5, 3.4, 0.02);
    masonry(b, move(f, -2.5, 0, -1.7), 5, 'wall/block-beige', { h: 1.9 });
    for (const sx of [-1, 1]) masonry(b, turn(move(f, sx * 2.5, 0, sx * 1.7), sx * 90 + 180), 3.4, 'wall/block-beige', { h: 1.9 });
    for (const sx of [-1, 1]) {
      const g = turn(move(f, sx * 2.4, 0, 1.7), sx > 0 ? 200 : -20);
      box(b, S('fence-board-brown'), g, [1.15, 0.95, 0], [1.15, 0.85, 0.025]);
    }
    box(b, P('green'), f, [-0.9, 0.7, -0.5], [0.95, 0.6, 0.7], 'y');
    box(b, P('black'), f, [-0.9, 1.32, -0.5], [0.97, 0.03, 0.72]);
    box(b, P('blue'), f, [1.2, 0.6, -0.6], [0.8, 0.5, 0.6], 'y');
    box(b, P('black'), f, [1.2, 1.12, -0.6], [0.82, 0.03, 0.62]);
  });
  A('gas-meter-bank', 'ガスメーター 6連', (b, f) => {
    b.tube(P('yellow'), at(f, -1.2, 0, 0), at(f, -1.2, 1.3, 0), 0.03, 6);
    b.tube(P('yellow'), at(f, -1.2, 1.3, 0), at(f, 1.2, 1.3, 0), 0.03, 6);
    for (let i = 0; i < 6; i++) {
      const x = -1 + i * 0.4;
      box(b, P('grey'), f, [x, 0.85, 0.1], [0.14, 0.17, 0.09]);
      b.tube(P('grey'), at(f, x - 0.08, 1.02, 0.1), at(f, x - 0.08, 1.3, 0), 0.015, 5);
      b.tube(P('grey'), at(f, x + 0.08, 1.02, 0.1), at(f, x + 0.08, 1.5, -0.05), 0.015, 5);
    }
  });
}
