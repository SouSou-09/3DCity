import { MeshBuilder, V3 } from './builder';
import { S, panel } from './boundaries';
import { container, canopy, flagPole, hut } from './boats';
import { sheet } from './buildkit';
import { Pose, at, box, lathe, move, plate, tilt, turn } from './kit';
import { cyl, guard, hash, ladder, timberRail } from './marine';

const DARK = 'trim/paint-charcoal';
const GLASS = 'window/curtain-blue-dark';
/** Lattice boom between two points: four chords and zig-zag bracing. */
export function lattice(b: MeshBuilder, mat: string, p0: V3, p1: V3, w0: number, w1: number, up: V3, bays = 10): void {
  const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const L = Math.hypot(...d);
  const t: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const dot = up[0] * t[0] + up[1] * t[1] + up[2] * t[2];
  let n: V3 = [up[0] - t[0] * dot, up[1] - t[1] * dot, up[2] - t[2] * dot];
  const nl = Math.hypot(...n);
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const s: V3 = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
  const P = (q: number, i: number): V3 => {
    const w = (w0 + (w1 - w0) * q) / 2;
    const [a, c] = [[1, 1], [1, -1], [-1, -1], [-1, 1]][i % 4];
    return [p0[0] + d[0] * q + (n[0] * a + s[0] * c) * w, p0[1] + d[1] * q + (n[1] * a + s[1] * c) * w, p0[2] + d[2] * q + (n[2] * a + s[2] * c) * w];
  };
  const r = Math.max(0.03, Math.max(w0, w1) * 0.05);
  for (let i = 0; i < 4; i++) {
    b.tube(mat, P(0, i), P(1, i), r, 5);
    for (let k = 0; k < bays; k++) {
      b.tube(mat, P(k / bays, i), P((k + 1) / bays, i + 1), r * 0.55, 4);
      if (k % 2 === 0) b.tube(mat, P(k / bays, i), P(k / bays, i + 1), r * 0.55, 4);
    }
  }
}
/** Rail bogie (or a rubber tyre set) under a crane leg, running along x. */
function bogie(b: MeshBuilder, f: Pose, c: V3, len: number, tyres: boolean): void {
  box(b, DARK, f, [c[0], c[1] + (tyres ? 1.3 : 0.75), c[2]], [len / 2, tyres ? 0.3 : 0.35, 0.45]);
  const n = tyres ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const x = c[0] - len / 2 + (len * (i + 0.5)) / n;
    const r = tyres ? 0.8 : 0.32;
    for (const sz of tyres ? [-0.5, 0.5] : [0]) lathe(b, tyres ? 'furniture/tire' : 'structure/steel-grey-rusty', { ...move(f, x, c[1] + r, c[2] + sz), y: f.z, z: f.y }, [[0, -0.22], [r * 0.8, -0.22], [r, -0.15], [r, 0.15], [r * 0.8, 0.22], [0, 0.22]], 12);
  }
}
/** Spreader hanging from four cables, optionally holding a container. */
function spreader(b: MeshBuilder, f: Pose, c: V3, top: number, load?: string): void {
  box(b, 'trim/paint-yellow', f, [c[0], c[1], c[2]], [3.03, 0.15, 0.6]);
  for (const sx of [-1, 1]) {
    box(b, 'trim/paint-yellow', f, [c[0] + sx * 2.95, c[1], c[2]], [0.12, 0.18, 1.22]);
    for (const sz of [-1, 1]) b.tube('furniture/cable', at(f, c[0] + sx * 1.6, c[1] + 0.15, c[2] + sz * 0.5), at(f, c[0] + sx * 1.2, top, c[2] + sz * 0.6), 0.03, 4);
  }
  if (load) container(b, move(f, c[0], c[1] - 0.18 - 2.61, c[2]), load, 1);
}
export interface StsOpts {
  tex: string;
  /** Boom raised to clear ships. */
  raised?: boolean;
  load?: string;
  s?: number;
  house?: string;
}
/** Ship-to-shore container gantry crane. Rails run along x; the boom reaches over the water at +z. */
export function stsCrane(b: MeshBuilder, f0: Pose, o: StsOpts): void {
  const s = o.s ?? 1;
  const f: Pose = { o: f0.o, x: [f0.x[0] * s, f0.x[1] * s, f0.x[2] * s], y: [f0.y[0] * s, f0.y[1] * s, f0.y[2] * s], z: [f0.z[0] * s, f0.z[1] * s, f0.z[2] * s] };
  const m = o.tex;
  const [hx, hz, H] = [9, 10, 30];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(b, m, f, [sx * hx, (H + 1.4) / 2, sz * hz], [0.65, (H - 1.4) / 2, 0.65]);
    bogie(b, f, [sx * hx, 0, sz * hz], 5, false);
  }
  for (const sz of [-1, 1]) {
    box(b, m, f, [0, 2.2, sz * hz], [hx, 0.5, 0.5]);
    box(b, m, f, [0, H, sz * hz], [hx + 0.65, 0.8, 0.7]);
  }
  for (const sx of [-1, 1]) {
    box(b, m, f, [sx * hx, 14, 0], [0.5, 0.6, hz]);
    b.beam(m, at(f, sx * hx, 14.6, -hz + 0.6), at(f, sx * hx, H - 0.8, 0), 0.6, 0.6);
    b.beam(m, at(f, sx * hx, 14.6, hz - 0.6), at(f, sx * hx, H - 0.8, 0), 0.6, 0.6);
    box(b, m, f, [sx * hx, H, 0], [0.5, 0.6, hz]);
  }
  // Trolley girders: back reach, portal span, and the hinged boom.
  const [gx, gy] = [3.2, H + 1.6];
  for (const sx of [-1, 1]) box(b, m, f, [sx * gx, gy, -5], [0.5, 0.9, 15.7]);
  const hinge: V3 = [0, gy, hz + 0.7];
  const blen = 32;
  const ang = o.raised ? (78 * Math.PI) / 180 : 0;
  const B = (x: number, dy: number, q: number): V3 => at(f, x, hinge[1] + Math.sin(ang) * q + Math.cos(ang) * dy, hinge[2] + Math.cos(ang) * q - Math.sin(ang) * dy);
  for (const sx of [-1, 1]) b.beam(m, B(sx * gx, 0, 0), B(sx * gx, 0, blen), 1, 1.8, at({ ...f, o: [0, 0, 0] }, 0, Math.cos(ang), -Math.sin(ang)));
  for (const q of [0.5, blen * 0.5, blen - 0.5]) b.beam(m, B(-gx, 0, q), B(gx, 0, q), 0.6, 0.8, at({ ...f, o: [0, 0, 0] }, 0, Math.cos(ang), -Math.sin(ang)));
  // A-frame and stays.
  const apex = (sx: number): V3 => at(f, sx * gx, H + 17, hz - 3);
  for (const sx of [-1, 1]) {
    b.beam(m, at(f, sx * gx, H + 0.8, hz), apex(sx), 0.6, 0.8);
    b.beam(m, at(f, sx * gx, H + 0.8, -hz), apex(sx), 0.5, 0.6);
    for (const q of [0.45, 0.95]) b.tube(m, apex(sx), B(sx * gx, 0.9, blen * q), 0.14, 6);
    b.tube(m, apex(sx), at(f, sx * gx, gy + 0.9, -20), 0.14, 6);
  }
  b.beam(m, apex(-1), apex(1), 0.6, 0.6);
  b.beam(m, at(f, -gx, H + 9, hz - 1.4), at(f, gx, H + 9, hz - 1.4), 0.4, 0.4);
  // Machinery house, trolley, cab, spreader.
  box(b, o.house ?? 'trim/paint-white', f, [0, gy + 3, -9], [3.6, 2.1, 5.5]);
  box(b, DARK, f, [0, gy + 5.15, -9], [3.8, 0.06, 5.7]);
  plate(b, 'site/sign-tower-number', turn(move(f, 0, gy + 3, -9), 90), [0, 0, 3.62], { size: [2.2, 2.2] });
  const tz = o.raised ? 2 : 22;
  box(b, DARK, f, [0, gy - 1.2, tz], [gx + 0.4, 0.3, 2]);
  box(b, 'trim/paint-white', f, [2, gy - 2.8, tz + 2.6], [1, 1.2, 1.2]);
  box(b, GLASS, f, [2, gy - 3, tz + 3.81], [0.9, 0.8, 0.01]);
  box(b, GLASS, f, [2, gy - 4.01, tz + 2.9], [0.8, 0.01, 0.8]);
  spreader(b, f, [0, o.raised ? gy - 6 : 16, tz], gy - 1.5, o.load);
  // Access stair tower on one leg and boom walkway rails.
  for (let y = 3; y < H - 1; y += 4.5) {
    box(b, 'trim/grate-black', f, [hx + 1.3, y, -hz], [0.7, 0.04, 1]);
    b.beam(m, at(f, hx + 1.3, y - 4.4 + 0.1 * 0, -hz - 0.8), at(f, hx + 1.3, y, -hz + 0.8), 0.6, 0.08);
  }
  for (const y of [3, H - 2]) ladder(b, turn(move(f, -hx, 0, -hz - 0.68), 180), [0, 0, 0], y, y + 6, 'trim/paint-yellow', 0.5);
}
/** Yard gantry crane on rubber tyres (or rails), spanning stacked containers along x. */
export function rtgCrane(b: MeshBuilder, f: Pose, o: { tex: string; span?: number; h?: number; rail?: boolean; load?: string }): void {
  const [sp, H, hz] = [(o.span ?? 23) / 2, o.h ?? 18, 5];
  const m = o.tex;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(b, m, f, [sx * sp, (H + 2) / 2, sz * hz], [0.4, (H - 2) / 2, 0.45]);
      bogie(b, turn(move(f, sx * sp, 0, sz * hz), -90), [0, 0, 0], 3.2, !o.rail);
    }
    box(b, m, f, [sx * sp, 2.3, 0], [0.4, 0.45, hz + 1.6]);
    box(b, m, f, [sx * sp, H * 0.62, 0], [0.3, 0.35, hz]);
    box(b, m, f, [sx * sp, H, 0], [0.45, 0.5, hz + 0.45]);
    box(b, 'trim/paint-white', f, [sx * (sp + 0.9), 3.6, 0], [0.5, 0.9, 1.6]);
  }
  for (const sz of [-1, 1]) box(b, m, f, [0, H + 0.2, sz * 2.4], [sp + 0.45, 0.7, 0.45]);
  const tx = -sp * 0.35;
  box(b, DARK, f, [tx, H + 1.1, 0], [2.2, 0.25, 3]);
  box(b, 'trim/paint-white', f, [tx, H + 2, 0], [1.6, 0.7, 1.8]);
  box(b, 'trim/paint-white', f, [tx + 1.2, H - 1.6, 3.4], [1, 1.1, 1]);
  box(b, GLASS, f, [tx + 1.2, H - 1.8, 4.41], [0.9, 0.75, 0.01]);
  spreader(b, turn(move(f, tx, 0, 0), 90), [0, o.load ? H - 6 : H - 4, 0], H + 0.9, o.load);
  ladder(b, turn(move(f, sp + 0.45, 0, hz), 90), [0, 0, 0], 2.8, H - 1, 'trim/paint-yellow', 0.5);
}
/** Harbour portal crane with a slewing house and a luffing lattice jib reaching towards +z. */
export function jibCrane(b: MeshBuilder, f: Pose, o: { tex: string; h?: number; jib?: number; ang?: number; slew?: number; grab?: boolean; house?: string }): void {
  const m = o.tex;
  const H = o.h ?? 12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.beam(m, at(f, sx * 4, 1.4, sz * 4), at(f, sx * 1.6, H, sz * 1.6), 0.7, 0.7);
    bogie(b, f, [sx * 4, 0, sz * 4], 3, false);
  }
  for (const sz of [-1, 1]) box(b, m, f, [0, 1.9, sz * 4], [4, 0.4, 0.4]);
  for (const sx of [-1, 1]) box(b, m, f, [sx * 3, H * 0.45, 0], [0.3, 0.3, 3]);
  box(b, m, f, [0, H, 0], [2.4, 0.4, 2.4]);
  cyl(b, DARK, f, [0, H + 0.4, 0], 2, 0.5, 16);
  const g = turn(move(f, 0, H + 0.9, 0), o.slew ?? 0);
  box(b, o.house ?? m, g, [0, 1.6, -1.5], [2, 1.6, 3.2], 'Y');
  box(b, DARK, g, [0, 3.25, -1.5], [2.15, 0.06, 3.35]);
  box(b, 'trim/paint-white', g, [1.3, 1.5, 2.4], [0.8, 1.1, 0.8]);
  box(b, GLASS, g, [1.3, 1.8, 3.21], [0.7, 0.6, 0.01]);
  box(b, 'structure/wall-old', g, [0, 1, -5], [1.6, 0.9, 0.5]);
  const [L, a] = [o.jib ?? 26, ((o.ang ?? 55) * Math.PI) / 180];
  const tip = at(g, 0, 2 + Math.sin(a) * L, 1.6 + Math.cos(a) * L);
  lattice(b, m, at(g, 0, 2, 1.6), tip, 1.8, 0.6, g.z, 12);
  const mast = at(g, 0, 9, -2);
  for (const sx of [-1, 1]) {
    b.beam(m, at(g, sx * 1.2, 3.2, 0.5), mast, 0.3, 0.3);
    b.beam(m, at(g, sx * 1.2, 3.2, -4), mast, 0.25, 0.25);
  }
  b.tube('furniture/cable', mast, tip, 0.03, 4);
  b.tube('furniture/cable', mast, at(g, 0, 2 + Math.sin(a) * L * 0.6, 1.6 + Math.cos(a) * L * 0.6), 0.03, 4);
  const hookY = H * 0.75;
  const hk: V3 = [tip[0], f.o[1] + hookY, tip[2]];
  b.tube('furniture/cable', tip, hk, 0.025, 4);
  if (o.grab) {
    const gg: Pose = { ...f, o: hk };
    for (const sx of [-1, 1]) sheet(b, DARK, at(gg, 0, 0, -0.8), at(gg, 0, 0, 0.8), at(gg, sx * 1.3, -1.6, 0.8), at(gg, sx * 1.3, -1.6, -0.8), [[0, 0], [1.6, 0], [1.6, 2], [0, 2]]);
    box(b, DARK, gg, [0, 0, 0], [0.25, 0.25, 0.9]);
  } else {
    const gg: Pose = { ...f, o: hk };
    box(b, 'trim/paint-yellow', gg, [0, 0, 0], [0.3, 0.4, 0.15]);
    lathe(b, DARK, move(gg, 0, -0.9, 0), [[0.05, 0.5], [0.2, 0.3], [0.2, 0.1], [0, 0]], 8);
  }
}

export interface TowerOpts {
  wall: string;
  roof: string;
  trim?: string;
  /** Height of the deck above the sand. */
  h?: number;
  flag?: string;
  flat?: boolean;
  number?: boolean;
}
/** Lifeguard tower: a cabin on stilts with a front deck facing the sea at +z and a ramp behind. */
export function lifeguardTower(b: MeshBuilder, f: Pose, o: TowerOpts): void {
  const H = o.h ?? 2.2;
  const trim = o.trim ?? 'trim/paint-white';
  const wood = 'signal/pole-wood-grey';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.beam(wood, at(f, sx * 2.1, 0, sz * 2.2), at(f, sx * 1.7, H - 0.15, sz * 1.8), 0.16, 0.16);
    b.beam(wood, at(f, sx * 2.05, 0.3, sz * 2.15), at(f, sx * 1.7, H - 0.3, -sz * 1.2), 0.05, 0.14);
  }
  box(b, S('deck-grey'), f, [0, H - 0.07, 0.2], [2.1, 0.07, 2.4]);
  hut(b, move(f, 0, H, -0.6), 3, 2.6, 2.2, { wall: o.wall, roof: o.roof, rise: o.flat ? 0 : 0.7, over: 0.45, door: 'door/front-white-0', win: 'window/slider-aluminium', winU: 1.6, trim });
  guard(b, f, 'timber', H, -2.05, 0.7, -2.05, 2.55, wood);
  guard(b, f, 'timber', H, -2.05, 2.55, 2.05, 2.55, wood);
  guard(b, f, 'timber', H, 2.05, 2.55, 2.05, 0.7, wood);
  // Ramp down the back.
  const P = (x: number, q: number): V3 => at(f, x, H * (1 - q), -2.2 - q * 4.6);
  sheet(b, S('deck-grey'), P(-2, 0), P(-0.9, 0), P(-0.9, 1), P(-2, 1), [[0, 0], [1.1, 0], [1.1, 5], [0, 5]]);
  box(b, S('deck-grey'), f, [-1.45, H - 0.07, -2.05], [0.55, 0.07, 0.2]);
  for (const x of [-2, -0.9]) {
    b.beam(wood, [P(x, 0)[0], P(x, 0)[1] + 0.9, P(x, 0)[2]], [P(x, 1)[0], P(x, 1)[1] + 0.9, P(x, 1)[2]], 0.06, 0.08);
    for (const q of [0, 0.5, 1]) b.beam(wood, [P(x, q)[0], P(x, q)[1] - (q < 1 ? 0 : 0), P(x, q)[2]], [P(x, q)[0], P(x, q)[1] + 0.9, P(x, q)[2]], 0.07, 0.07);
    b.beam(wood, at(f, x, 0, -4.5), P(x, 0.5), 0.1, 0.1);
  }
  plate(b, S('sign-lifeguard'), f, [0, H + 2.2 + (o.flat ? 0.4 : 0.15), 0.75 + 0.45 + 0.03]);
  if (o.number !== false) plate(b, S('sign-tower-number'), turn(f, 90), [0.6, H + 1.3, 1.52]);
  if (o.flag) flagPole(b, move(f, 1.9, H, 2.4), 3.2, o.flag);
  plate(b, S('lifering'), f, [1, H + 1.2, 0.74], { size: [0.6, 0.6] });
}
/** Tall lifeguard chair. */
export function lifeguardChair(b: MeshBuilder, f: Pose, mat: string, shade?: string): void {
  for (const sx of [-1, 1]) {
    b.beam(mat, at(f, sx * 0.75, 0, 0.7), at(f, sx * 0.45, 1.8, 0.25), 0.07, 0.09);
    b.beam(mat, at(f, sx * 0.75, 0, -0.7), at(f, sx * 0.45, 2.6, -0.3), 0.07, 0.09);
    box(b, mat, f, [sx * 0.45, 2.1, 0], [0.03, 0.04, 0.3]);
  }
  for (let i = 0; i < 5; i++) box(b, mat, f, [0, 0.35 + i * 0.33, 0.7 - 0.11 * (i + 1)], [0.7 - i * 0.05, 0.03, 0.06]);
  box(b, mat, f, [0, 1.8, 0], [0.5, 0.03, 0.3]);
  box(b, mat, f, [0, 2.25, -0.3], [0.5, 0.3, 0.025]);
  if (shade) {
    b.tube('trim/paint-white', at(f, 0.5, 1.8, -0.3), at(f, 0.5, 3.7, -0.3), 0.02, 5);
    canopy(b, shade, f, [0.2, 3.5, -0.1], 1.1, 0.3, 8);
  }
}
/** Beach umbrella with its pole stuck in the sand, tilted a little. */
export function umbrella(b: MeshBuilder, f: Pose, tex: string, o: { r?: number; h?: number; lean?: number; thatch?: boolean } = {}): void {
  const g = tilt(f, o.lean ?? 8);
  const [r, h] = [o.r ?? 1.1, o.h ?? 2.1];
  b.tube(o.thatch ? 'signal/pole-wood' : 'trim/paint-white', at(g, 0, 0, 0), at(g, 0, h + 0.35, 0), o.thatch ? 0.06 : 0.018, 6);
  canopy(b, tex, g, [0, h, 0], r, o.thatch ? 0.8 : 0.35, o.thatch ? 12 : 8);
  if (o.thatch) canopy(b, tex, g, [0, h - 0.18, 0], r * 1.12, 0.5, 12);
}
/** Sun lounger. */
export function lounger(b: MeshBuilder, f: Pose, tex: string, frame = 'trim/paint-white'): void {
  box(b, tex, f, [0.25, 0.3, 0], [0.7, 0.03, 0.3]);
  box(b, tex, tilt(turn(move(f, -0.45, 0.3, 0), 90), -40), [0, 0.35, 0], [0.3, 0.35, 0.03]);
  for (const sx of [-0.3, 0.8]) for (const sz of [-1, 1]) box(b, frame, f, [sx, 0.14, sz * 0.27], [0.02, 0.14, 0.02]);
}
/** Beach volleyball court on a sand pad: posts, net and rope boundary. */
export function volleyball(b: MeshBuilder, f: Pose, o: { sand?: string; post?: string; net?: string } = {}): void {
  b.quadUp(o.sand ?? S('sand-prints'), at(f, -11, 0.01, 7), at(f, 11, 0.01, 7), at(f, 11, 0.01, -7), at(f, -11, 0.01, -7));
  for (const sz of [-1, 1]) {
    b.tube(o.post ?? 'signal/pole-wood', at(f, 0, 0, sz * 5), at(f, 0, 2.6, sz * 5), 0.07, 8, 0.07, true);
    box(b, S('rope-blue'), f, [0, 0.025, sz * 4], [8, 0.008, 0.025]);
  }
  for (const sx of [-1, 1]) box(b, S('rope-blue'), f, [sx * 8, 0.025, 0], [0.025, 0.008, 4]);
  panel(b, o.net ?? S('net-white'), turn(move(f, 0, 0, 5), 90), 0, 10, 1.43, 1);
  for (const y of [1.43, 2.43]) box(b, 'trim/paint-white', f, [0, y, 0], [0.012, 0.03, 5]);
}
/** Outdoor beach shower: a post with heads over a drained pad. */
export function shower(b: MeshBuilder, f: Pose, heads: number, mat = 'furniture/coat-stainless'): void {
  cyl(b, 'concrete/walk-plain', f, [0, 0, 0], 1.3, 0.06, 14);
  cyl(b, 'trim/grate-black', f, [0, 0.062, 0.6], 0.15, 0.004, 8);
  b.tube(mat, at(f, 0, 0, 0), at(f, 0, 2.3, 0), 0.06, 8, 0.06, true);
  for (let i = 0; i < heads; i++) {
    const g = turn(f, (360 / heads) * i);
    b.tube(mat, at(g, 0, 2.15, 0), at(g, 0, 2.2, 0.35), 0.018, 5);
    lathe(b, mat, { ...move(g, 0, 2.2, 0.35), y: [-f.y[0], -f.y[1], -f.y[2]] }, [[0.02, 0], [0.07, 0.06], [0, 0.06]], 8);
    cyl(b, DARK, { ...move(g, 0, 1.1, 0.06), y: g.z, z: g.y }, [0, 0, 0], 0.03, 0.03, 6);
  }
}
/** Boardwalk on short posts over sand, running along +x. */
export function boardwalk(b: MeshBuilder, f: Pose, len: number, w: number, o: { deck?: string; rail?: 'timber' | 'rope' | 'none'; y?: number; ramp?: boolean } = {}): void {
  const y = o.y ?? 0.45;
  const wood = 'signal/pole-wood-grey';
  box(b, o.deck ?? 'paving/boardwalk-grey', f, [len / 2, y - 0.04, 0], [len / 2, 0.04, w / 2]);
  for (let x = 0.4; x < len; x += 2.4) {
    box(b, wood, f, [x, y - 0.16, 0], [0.06, 0.08, w / 2 - 0.05]);
    for (const sz of [-1, 1]) box(b, wood, f, [x, (y - 0.24) / 2 - 0.2, sz * (w / 2 - 0.2)], [0.07, (y - 0.24) / 2 + 0.2, 0.07]);
  }
  if (o.rail === 'timber') for (const sz of [-1, 1]) timberRail(b, move(f, 0, y, sz * (w / 2 - 0.07)), len, wood, { h: 0.95, mids: 1 });
  if (o.rail === 'rope') for (const sz of [-1, 1]) {
    for (let x = 0; x <= len + 0.01; x += 3) {
      b.tube(wood, at(f, x, y - 0.3, sz * (w / 2 + 0.1)), at(f, x, y + 0.9, sz * (w / 2 + 0.1)), 0.07, 7, 0.07, true);
      if (x + 3 <= len + 0.01) for (let k = 0; k < 4; k++) b.tube(S('rope'), at(f, x + k * 0.75, y + 0.8 - Math.sin((k / 4) * Math.PI) * 0.22, sz * (w / 2 + 0.1)), at(f, x + (k + 1) * 0.75, y + 0.8 - Math.sin(((k + 1) / 4) * Math.PI) * 0.22, sz * (w / 2 + 0.1)), 0.02, 5);
    }
  }
  if (o.ramp) sheet(b, o.deck ?? 'paving/boardwalk-grey', at(f, len, y, w / 2), at(f, len, y, -w / 2), at(f, len + 2.5, 0, -w / 2), at(f, len + 2.5, 0, w / 2), [[0, 0], [w, 0], [w, 2.5], [0, 2.5]]);
}
/** Low dune or sand patch with a soft, uneven surface. */
export function dune(b: MeshBuilder, tex: string, f: Pose, rx: number, rz: number, h: number, seed: number): void {
  const [n, m] = [5, 14];
  const P = (i: number, j: number): V3 => {
    const q = i / n;
    const a = ((j % m) / m) * Math.PI * 2;
    const k = i === 0 ? 0 : 1 + (hash(i * 13 + (j % m), seed) - 0.5) * 0.18;
    return at(f, Math.cos(a) * rx * q * k, h * Math.cos((q * Math.PI) / 2) ** 1.5 * (i === n ? 0 : 0.85 + hash(i * 7 + (j % m), seed + 1) * 0.3), Math.sin(a) * rz * q * k);
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const uv = (a: V3): [number, number] => [a[0] - f.o[0], a[2] - f.o[2]];
    const [p0, p1, p2, p3] = [P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)];
    if (i === 0) b.tri(tex, p0, p2, p3, [uv(p0), uv(p2), uv(p3)]);
    else b.quad(tex, p0, p1, p2, p3, [uv(p0), uv(p1), uv(p2), uv(p3)]);
  }
}
/** Surfboard standing on its tail, leaning back against something. */
export function surfboard(b: MeshBuilder, f: Pose, tex: string, len = 1.9, lean = 12): void {
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) prof.push([Math.sin((i / 8) ** 0.8 * Math.PI) ** 0.6 * 0.27 * (i === 0 ? 0.4 : 1), (len * i) / 8]);
  prof[8] = [0, len];
  lathe(b, tex, tilt(f, -lean), prof, 10, 0.12);
}
