import { MeshBuilder, V3 } from './builder';
import { S, chainlink, panel } from './boundaries';
import { canopy, flagPole, hut } from './boats';
import { sheet } from './buildkit';
import { bench } from './furniture';
import { Pose, at, box, lathe, move, pipe, plate, stand, tilt, turn } from './kit';
import { ball, boulder, cyl, hash, ringRail, torus } from './marine';
import { addModel } from './registry';

const ZINC = 'trim/paint-galvanized';
const WOOD = 'signal/pole-wood';
/** Flat pad showing one whole copy of a texture, centred on the pose. */
export function pad(b: MeshBuilder, tex: string, f: Pose, w: number, d: number, y = 0.01, whole = false): void {
  const p = b.part(tex);
  const uv: [number, number][] = whole ? [[0, 0], [p.mw, 0], [p.mw, p.mh], [0, p.mh]] : [[0, 0], [w, 0], [w, d], [0, d]];
  b.quadUp(tex, at(f, -w / 2, y, d / 2), at(f, w / 2, y, d / 2), at(f, w / 2, y, -d / 2), at(f, -w / 2, y, -d / 2), 0, uv);
}
const tubeP = (b: MeshBuilder, mat: string, f: Pose, a: V3, c: V3, r: number): void => b.tube(mat, at(f, ...a), at(f, ...c), r, 6, r, true);

/** A-frame swing set along x. */
export function swings(b: MeshBuilder, f: Pose, seats: number, frame: string, o: { h?: number; toddler?: boolean; seat?: string } = {}): void {
  const h = o.h ?? 2.4;
  const w = seats * 1.1 + 0.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tubeP(b, frame, f, [(sx * w) / 2 + sx * 0.2, 0, sz * 1.1], [(sx * w) / 2, h, 0], 0.04);
  tubeP(b, frame, f, [-w / 2, h, 0], [w / 2, h, 0], 0.045);
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + 0.85 + i * 1.1;
    const sw = (hash(i, 3) - 0.5) * 0.7;
    for (const sx of [-0.22, 0.22]) b.tube('furniture/cable', at(f, x + sx, h, 0), at(f, x + sx, 0.5, sw), 0.008, 4);
    if (o.toddler) box(b, o.seat ?? 'trim/paint-black', f, [x, 0.42, sw], [0.2, 0.14, 0.17], 'y');
    else box(b, o.seat ?? 'trim/paint-black', f, [x, 0.48, sw], [0.25, 0.02, 0.09]);
  }
}
/** Slide: ladder up the back, platform, chute down along +z. */
export function slide(b: MeshBuilder, f: Pose, h: number, chute: string, frame: string, o: { wave?: boolean } = {}): void {
  for (const sx of [-1, 1]) {
    tubeP(b, frame, f, [sx * 0.3, 0, -1.2 - h * 0.35], [sx * 0.3, h + 0.8, -1.2], 0.025);
    tubeP(b, frame, f, [sx * 0.3, 0, -0.5], [sx * 0.3, h + 0.8, -0.5], 0.025);
    tubeP(b, frame, f, [sx * 0.3, h + 0.8, -1.2], [sx * 0.3, h + 0.8, -0.5], 0.025);
  }
  for (let y = 0.3; y < h; y += 0.3) tubeP(b, frame, f, [-0.3, y, -1.2 - (h - y) * 0.35 * (h / (h + 0.8))], [0.3, y, -1.2 - (h - y) * 0.35 * (h / (h + 0.8))], 0.018);
  box(b, frame, f, [0, h, -0.85], [0.3, 0.02, 0.36]);
  const L = h * 1.7;
  const n = 10;
  const Y = (q: number): number => h * (1 - q) ** 1.3 + 0.25 * q + (o.wave ? Math.sin(q * Math.PI * 2) * 0.12 * (1 - q) : 0);
  for (let i = 0; i < n; i++) {
    const [q0, q1] = [i / n, (i + 1) / n];
    const [z0, z1] = [-0.5 + q0 * L, -0.5 + q1 * L];
    sheet(b, chute, at(f, -0.25, Y(q0), z0), at(f, 0.25, Y(q0), z0), at(f, 0.25, Y(q1), z1), at(f, -0.25, Y(q1), z1), [[0, z0], [0.5, z0], [0.5, z1], [0, z1]]);
    for (const sx of [-1, 1]) sheet(b, chute, at(f, sx * 0.25, Y(q0), z0), at(f, sx * 0.25, Y(q1), z1), at(f, sx * 0.29, Y(q1) + 0.14, z1), at(f, sx * 0.29, Y(q0) + 0.14, z0), [[z0, 0], [z1, 0], [z1, 0.14], [z0, 0.14]]);
  }
  for (const sx of [-1, 1]) tubeP(b, frame, f, [sx * 0.2, 0, -0.5 + L * 0.55], [sx * 0.2, Y(0.55), -0.5 + L * 0.55], 0.02);
}
/** Play tower: a deck on four posts with a roof. */
function playTower(b: MeshBuilder, f: Pose, h: number, post: string, roof: string | null, deck = 'trim/paint-tan'): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, post, f, [sx * 0.7, (h + 1.9) / 2, sz * 0.7], [0.05, (h + 1.9) / 2, 0.05], 'Y');
  box(b, deck, f, [0, h - 0.03, 0], [0.75, 0.03, 0.75]);
  if (roof) canopy(b, roof, turn(f, 45), [0, h + 1.9, 0], 1.25, 0.7, 4);
}
export function playStructure(b: MeshBuilder, f: Pose, post: string, roof: string, chute: string, big = false): void {
  playTower(b, f, 1.5, post, roof);
  playTower(b, move(f, 3.6, 0, 0), big ? 2.1 : 1.5, post, big ? roof : null);
  // Bridge with rails between the towers.
  box(b, 'trim/paint-tan', f, [1.8, 1.47, 0], [1.1, 0.03, 0.45]);
  for (const sz of [-1, 1]) {
    tubeP(b, post, f, [0.7, 2.3, sz * 0.45], [2.9, 2.3 + (big ? 0.3 : 0), sz * 0.45], 0.02);
    for (let x = 1; x < 2.9; x += 0.25) b.tube(post, at(f, x, 1.5, sz * 0.45), at(f, x, 2.3, sz * 0.45), 0.01, 4);
  }
  slide(b, turn(move(f, 0, 0, 0.75 + 0.5), 0), 1.5, chute, post);
  // Climbing net and a fireman's pole.
  for (let i = 0; i <= 4; i++) {
    b.tube('site/rope', at(f, -0.7 - 1.2, 0, -0.6 + i * 0.3), at(f, -0.7, 1.5, -0.6 + i * 0.3), 0.012, 4);
    b.tube('site/rope', at(f, -0.7 - 1.2 * (1 - i / 4), (1.5 * i) / 4, -0.6), at(f, -0.7 - 1.2 * (1 - i / 4), (1.5 * i) / 4, 0.6), 0.012, 4);
  }
  pipe(b, post, [at(f, 4.3, big ? 3.2 : 2.6, 0), at(f, 4.9, big ? 3.2 : 2.6, 0), at(f, 4.9, 0, 0)], 0.022, 6);
  if (big) slide(b, turn(move(f, 3.6, 0, -1.25), 180), 2.1, chute, post, { wave: true });
}
export function seesaw(b: MeshBuilder, f: Pose, mat: string, plank: string): void {
  for (const sz of [-1, 1]) {
    tubeP(b, mat, f, [-0.25, 0, sz * 0.15], [0, 0.55, sz * 0.15], 0.025);
    tubeP(b, mat, f, [0.25, 0, sz * 0.15], [0, 0.55, sz * 0.15], 0.025);
  }
  const g = move({ ...f, x: at({ ...f, o: [0, 0, 0] }, 0.975, 0.22, 0), y: at({ ...f, o: [0, 0, 0] }, -0.22, 0.975, 0) }, 0, 0.6, 0);
  box(b, plank, g, [0, 0, 0], [1.6, 0.025, 0.11]);
  for (const sx of [-1, 1]) {
    pipe(b, mat, [at(g, sx * 1.1, 0.02, -0.1), at(g, sx * 1.1, 0.25, -0.1), at(g, sx * 1.1, 0.25, 0.1), at(g, sx * 1.1, 0.02, 0.1)], 0.012, 5);
  }
}
export function springRider(b: MeshBuilder, f: Pose, body: string): void {
  for (let i = 0; i < 5; i++) torus(b, 'trim/paint-black', f, [0, 0.06 + i * 0.07, 0], 0.09, 0.016, 8, 4);
  box(b, 'concrete/walk-plain', f, [0, 0.015, 0], [0.2, 0.015, 0.2]);
  box(b, body, f, [0, 0.55, 0], [0.38, 0.14, 0.09]);
  box(b, body, f, [0.36, 0.78, 0], [0.13, 0.13, 0.08]);
  box(b, body, f, [-0.4, 0.68, 0], [0.05, 0.1, 0.04]);
  tubeP(b, 'trim/paint-black', f, [0.2, 0.72, -0.2], [0.2, 0.72, 0.2], 0.014);
  tubeP(b, 'trim/paint-black', f, [0, 0.42, -0.2], [0, 0.42, 0.2], 0.014);
}
export function roundabout(b: MeshBuilder, f: Pose, deck: string, bar: string): void {
  cyl(b, deck, f, [0, 0.18, 0], 1.2, 0.05, 16);
  cyl(b, 'trim/paint-charcoal', f, [0, 0, 0], 0.25, 0.18, 10);
  for (let i = 0; i < 4; i++) {
    const g = turn(f, i * 90);
    pipe(b, bar, [at(g, 0, 0.23, 0), at(g, 0, 0.95, 0), at(g, 1.05, 0.95, 0), at(g, 1.05, 0.23, 0)], 0.018, 6);
  }
}
export function monkeyBars(b: MeshBuilder, f: Pose, mat: string, len = 3): void {
  for (const sz of [-1, 1]) {
    pipe(b, mat, [at(f, -0.3, 0, sz * 0.35), at(f, 0, 2.1, sz * 0.35), at(f, len, 2.1, sz * 0.35), at(f, len + 0.3, 0, sz * 0.35)], 0.025, 6);
  }
  for (let x = 0; x <= len + 0.01; x += 0.3) tubeP(b, mat, f, [x, 2.1, -0.35], [x, 2.1, 0.35], 0.016);
  for (const sx of [-0.12, len + 0.12]) for (let y = 0.4; y < 1.9; y += 0.4) tubeP(b, mat, f, [sx + (sx < 0 ? -1 : 1) * (0.18 - y * 0.085), y, -0.35], [sx + (sx < 0 ? -1 : 1) * (0.18 - y * 0.085), y, 0.35], 0.016);
}
/** Geodesic climbing dome. */
export function climbDome(b: MeshBuilder, f: Pose, mat: string, r = 1.6): void {
  const P = (i: number, j: number, n: number): V3 => {
    const phi = (i / 3) * (Math.PI / 2);
    const a = (j / n) * Math.PI * 2 + (i % 2) * (Math.PI / n);
    return at(f, Math.cos(phi) * Math.cos(a) * r, Math.sin(phi) * r, Math.cos(phi) * Math.sin(a) * r);
  };
  const n = 8;
  for (let i = 0; i < 3; i++) for (let j = 0; j < n; j++) {
    b.tube(mat, P(i, j, n), P(i, j + 1, n), 0.018, 5);
    if (i < 2) {
      b.tube(mat, P(i, j, n), P(i + 1, j, n), 0.018, 5);
      b.tube(mat, P(i, j, n), P(i + 1, j + (i % 2 ? 1 : -1), n), 0.018, 5);
    } else b.tube(mat, P(i, j, n), at(f, 0, r, 0), 0.018, 5);
  }
}
/** Basketball goal standing at the pose, backboard facing +z. */
export function hoop(b: MeshBuilder, f: Pose, o: { post?: string; board?: string; net?: boolean; h?: number } = {}): void {
  const post = o.post ?? 'trim/paint-black';
  const h = o.h ?? 3.05;
  pipe(b, post, [at(f, 0, 0, -1.2), at(f, 0, h - 0.4, -1.2), at(f, 0, h + 0.35, -0.1)], 0.07, 8);
  box(b, o.board ?? 'trim/paint-white', f, [0, h + 0.45, 0], [0.9, 0.53, 0.02]);
  box(b, 'trim/paint-red', f, [0, h + 0.2, 0.022], [0.3, 0.225, 0.003]);
  box(b, o.board ?? 'trim/paint-white', f, [0, h + 0.2, 0.024], [0.27, 0.195, 0.003]);
  torus(b, 'trim/paint-orange', f, [0, h, 0.38], 0.23, 0.012, 12, 4);
  box(b, 'trim/paint-orange', f, [0, h - 0.01, 0.09], [0.06, 0.012, 0.07]);
  if (o.net !== false) lathe(b, S('net-white'), move(f, 0, h - 0.42, 0.38), [[0.14, 0], [0.23, 0.42]], 10);
}
/** Net strung between two posts along x. */
export function netPosts(b: MeshBuilder, f: Pose, len: number, h: number, net: string, post: string, sag = 0.08): void {
  for (const sx of [-1, 1]) b.tube(post, at(f, (sx * len) / 2, 0, 0), at(f, (sx * len) / 2, h + 0.03, 0), 0.04, 8, 0.04, true);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const [x0, x1] = [-len / 2 + (len * i) / n, -len / 2 + (len * (i + 1)) / n];
    const [h0, h1] = [h - Math.sin((i / n) * Math.PI) * sag, h - Math.sin(((i + 1) / n) * Math.PI) * sag];
    sheet(b, net, at(f, x0, 0.05, 0), at(f, x1, 0.05, 0), at(f, x1, h1, 0), at(f, x0, h0, 0), [[x0, 0], [x1, 0], [x1, h1], [x0, h0]]);
    b.beam('trim/paint-white', at(f, x0, h0, 0), at(f, x1, h1, 0), 0.015, 0.05);
  }
}
/** Soccer or hockey goal, mouth facing +z. */
export function goal(b: MeshBuilder, f: Pose, w: number, h: number, d: number, mat = 'trim/paint-white', net = S('net-white')): void {
  for (const sx of [-1, 1]) {
    pipe(b, mat, [at(f, (sx * w) / 2, 0, 0), at(f, (sx * w) / 2, h, 0), at(f, (sx * w) / 2, h * 0.5, -d * 0.6), at(f, (sx * w) / 2, 0, -d), at(f, (sx * w) / 2, 0, 0)], 0.045, 6);
    sheet(b, net, at(f, (sx * w) / 2, 0, 0), at(f, (sx * w) / 2, 0, -d), at(f, (sx * w) / 2, h * 0.5, -d * 0.6), at(f, (sx * w) / 2, h, 0), [[0, 0], [d, 0], [d * 0.6, h * 0.5], [0, h]]);
  }
  b.tube(mat, at(f, -w / 2, h, 0), at(f, w / 2, h, 0), 0.045, 6);
  b.tube(mat, at(f, -w / 2, 0, -d), at(f, w / 2, 0, -d), 0.03, 6);
  sheet(b, net, at(f, -w / 2, h, 0), at(f, w / 2, h, 0), at(f, w / 2, h * 0.5, -d * 0.6), at(f, -w / 2, h * 0.5, -d * 0.6), [[0, 0], [w, 0], [w, h * 0.8], [0, h * 0.8]]);
  sheet(b, net, at(f, -w / 2, h * 0.5, -d * 0.6), at(f, w / 2, h * 0.5, -d * 0.6), at(f, w / 2, 0, -d), at(f, -w / 2, 0, -d), [[0, 0], [w, 0], [w, h * 0.6], [0, h * 0.6]]);
}
/** Bleachers: rows of plank seats on a stepped frame, facing +z. */
export function bleachers(b: MeshBuilder, f: Pose, len: number, rows: number, o: { seat?: string; frame?: string } = {}): void {
  const frame = o.frame ?? ZINC;
  for (let r = 0; r < rows; r++) {
    box(b, o.seat ?? 'trim/paint-aluminium', f, [0, 0.42 + r * 0.3, -r * 0.6], [len / 2, 0.02, 0.13]);
    box(b, o.seat ?? 'trim/paint-aluminium', f, [0, 0.14 + r * 0.3, -r * 0.6 + 0.32], [len / 2, 0.02, 0.13]);
  }
  for (let x = -len / 2 + 0.3; x <= len / 2 - 0.29; x += Math.max(1.2, (len - 0.6) / Math.round((len - 0.6) / 1.6))) {
    b.beam(frame, at(f, x, 0.1, 0.4), at(f, x, 0.1 + rows * 0.3, 0.4 - rows * 0.6), 0.04, 0.05);
    tubeP(b, frame, f, [x, 0, -(rows - 1) * 0.6 - 0.2], [x, rows * 0.3 + (rows > 3 ? 1.1 : 0.15), -(rows - 1) * 0.6 - 0.2], 0.022);
    tubeP(b, frame, f, [x, 0, 0.4], [x, 0.12, 0.4], 0.022);
    tubeP(b, frame, f, [x, 0.02, 0.4], [x, 0.02, -(rows - 1) * 0.6 - 0.2], 0.022);
  }
  if (rows > 3) for (const y of [0.6, 1.1]) tubeP(b, frame, f, [-len / 2 + 0.3, rows * 0.3 + y, -(rows - 1) * 0.6 - 0.2], [len / 2 - 0.3, rows * 0.3 + y, -(rows - 1) * 0.6 - 0.2], 0.02);
}
/** Curved skate ramp section rising towards -z: radius R up to height h, with a deck behind. */
export function quarterPipe(b: MeshBuilder, f: Pose, w: number, h: number, R: number, tex: string, side = 'wall/plywood-tan'): void {
  const a1 = Math.acos(1 - h / R);
  const n = 7;
  const P = (x: number, i: number): V3 => at(f, x, R * (1 - Math.cos((a1 * i) / n)), -R * Math.sin((a1 * i) / n));
  for (let i = 0; i < n; i++) {
    b.quad(tex, P(-w / 2, i), P(w / 2, i), P(w / 2, i + 1), P(-w / 2, i + 1), [[0, (R * a1 * i) / n], [w, (R * a1 * i) / n], [w, (R * a1 * (i + 1)) / n], [0, (R * a1 * (i + 1)) / n]]);
    for (const sx of [-1, 1]) {
      const [p0, p1] = [P((sx * w) / 2, i), P((sx * w) / 2, i + 1)];
      const [q0, q1] = [at(f, (sx * w) / 2, 0, -R * Math.sin((a1 * i) / n)), at(f, (sx * w) / 2, 0, -R * Math.sin((a1 * (i + 1)) / n))];
      b.quadFacing(side, q0, q1, p1, p0, [sx * f.x[0], sx * f.x[1], sx * f.x[2]], [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]);
    }
  }
  const z1 = -R * Math.sin(a1);
  box(b, side, f, [0, h / 2, z1 - 0.6], [w / 2, h / 2, 0.6], 'yY');
  b.quadUp(tex, at(f, -w / 2, h, z1), at(f, w / 2, h, z1), at(f, w / 2, h, z1 - 1.2), at(f, -w / 2, h, z1 - 1.2));
  b.tube('trim/paint-galvanized', at(f, -w / 2, h, z1), at(f, w / 2, h, z1), 0.03, 6);
}
/** Picnic table with attached benches. */
export function picnicTable(b: MeshBuilder, f: Pose, kind: 'wood' | 'concrete' | 'metal', mat: string): void {
  if (kind === 'concrete') {
    box(b, mat, f, [0, 0.72, 0], [1, 0.05, 0.4]);
    box(b, mat, f, [0, 0.34, 0], [0.7, 0.34, 0.1], 'Y');
    for (const sz of [-1, 1]) {
      box(b, mat, f, [0, 0.42, sz * 0.72], [1, 0.04, 0.15]);
      for (const sx of [-1, 1]) box(b, mat, f, [sx * 0.7, 0.19, sz * 0.72], [0.08, 0.19, 0.12], 'Y');
    }
    return;
  }
  const frame = kind === 'metal' ? 'trim/paint-black' : mat;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.beam(frame, at(f, sx * 0.7, 0, sz * 0.75), at(f, sx * 0.7, 0.72, sz * 0.25), 0.05, 0.09);
    b.beam(frame, at(f, sx * 0.7, 0.42, -0.85), at(f, sx * 0.7, 0.42, 0.85), 0.05, 0.09);
  }
  if (kind === 'metal') {
    box(b, mat, f, [0, 0.75, 0], [0.95, 0.02, 0.38]);
    for (const sz of [-1, 1]) box(b, mat, f, [0, 0.47, sz * 0.72], [0.95, 0.02, 0.14]);
  } else {
    for (let i = -2; i <= 2; i++) box(b, mat, f, [0, 0.75, i * 0.155], [0.95, 0.022, 0.07]);
    for (const sz of [-1, 1]) for (const k of [-1, 1]) box(b, mat, f, [0, 0.47, sz * 0.72 + k * 0.075], [0.95, 0.022, 0.068]);
  }
}
export function grill(b: MeshBuilder, f: Pose): void {
  b.tube('trim/paint-black', at(f, 0, 0, 0), at(f, 0, 0.8, 0), 0.04, 6);
  box(b, 'trim/paint-black', f, [0, 0.95, 0], [0.3, 0.15, 0.22], 'y');
  box(b, 'trim/grate-black', f, [0, 1.08, 0], [0.29, 0.005, 0.21]);
  cyl(b, 'concrete/walk-plain', f, [0, 0, 0], 0.25, 0.04, 8);
}
/** Open pavilion: posts carrying a hipped or pyramidal roof. `sides` = 4 gives a rectangle w x d; 6 or 8 a gazebo of radius w / 2. */
export function pavilion(b: MeshBuilder, f: Pose, w: number, d: number, h: number, o: { post: string; roof: string; sides?: number; rise?: number; rail?: boolean; floor?: string; cupola?: boolean }): void {
  const sides = o.sides ?? 4;
  const rise = o.rise ?? 1.4;
  if (o.floor) {
    if (sides === 4) box(b, o.floor, f, [0, 0.08, 0], [w / 2 + 0.3, 0.08, d / 2 + 0.3], 'Y');
    else cyl(b, o.floor, turn(f, 180 / sides), [0, 0, 0], w / 2 + 0.3, 0.3, sides);
  }
  const y0 = o.floor ? (sides === 4 ? 0.16 : 0.3) : 0;
  if (sides === 4) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, o.post, f, [(sx * w) / 2, y0 + h / 2, (sz * d) / 2], [0.09, h / 2, 0.09], 'Y');
    if (w > 7) for (const sz of [-1, 1]) box(b, o.post, f, [0, y0 + h / 2, (sz * d) / 2], [0.09, h / 2, 0.09], 'Y');
    const [ex, ez, rl] = [w / 2 + 0.6, d / 2 + 0.6, Math.max(0, (w - d) / 2)];
    const Y = y0 + h;
    box(b, o.post, f, [0, Y - 0.1, 0], [w / 2 + 0.1, 0.1, d / 2 + 0.1], 'yY');
    for (const sz of [-1, 1]) {
      sheet(b, o.roof, at(f, -sz * ex, Y, sz * ez), at(f, sz * ex, Y, sz * ez), at(f, sz * rl, Y + rise, 0), at(f, -sz * rl, Y + rise, 0), [[0, 0], [2 * ex, 0], [ex + rl, ez], [ex - rl, ez]]);
      sheet(b, o.roof, at(f, sz * ex, Y, sz * ez), at(f, sz * ex, Y, -sz * ez), at(f, sz * rl, Y + rise, 0), at(f, sz * rl, Y + rise, 0.001), [[0, 0], [2 * ez, 0], [ez, ex - rl], [ez, ex - rl]]);
    }
  } else {
    const R = w / 2;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      box(b, o.post, turn(move(f, Math.cos(a) * R, y0, Math.sin(a) * R), (-a * 180) / Math.PI), [0, h / 2, 0], [0.07, h / 2, 0.07], 'Y');
    }
    lathe(b, o.post, move(turn(f, 180 / sides), 0, y0 + h - 0.2, 0), [[R + 0.12, 0], [R + 0.12, 0.2]], sides);
    canopy(b, o.roof, f, [0, y0 + h, 0], R + 0.7, rise, sides);
    if (o.cupola) {
      lathe(b, o.post, move(f, 0, y0 + h + rise * 0.78, 0), [[R * 0.22, 0], [R * 0.22, 0.5]], sides);
      canopy(b, o.roof, f, [0, y0 + h + rise * 0.78 + 0.5, 0], R * 0.36, rise * 0.4, sides);
    }
    if (o.rail) ringRail(b, o.post, turn(f, 360 / sides), y0, R, 0.9, sides - 1);
  }
}
/** Tiered fountain in a round basin. */
export function fountain(b: MeshBuilder, f: Pose, stone: string, r: number, tiers: number, water = S('water-pool')): void {
  lathe(b, stone, f, [[r + 0.25, 0], [r + 0.25, 0.5], [r, 0.5], [r, 0.2], [0, 0.2]], 20);
  cyl(b, water, f, [0, 0.38, 0], r, 0.01, 20);
  let y = 0.2;
  for (let i = 0; i < tiers; i++) {
    const tr = r * (0.5 - i * 0.14);
    lathe(b, stone, move(f, 0, y, 0), [[0.22 - i * 0.04, 0], [0.16 - i * 0.03, 0.5], [0.16 - i * 0.03, 0.9], [tr, 1.15], [tr, 1.22], [tr - 0.08, 1.22], [0, 1.08]], 16);
    cyl(b, water, f, [0, y + 1.18, 0], tr - 0.08, 0.01, 16);
    y += 1.08;
  }
  lathe(b, stone, move(f, 0, y, 0), [[0.1, 0], [0.05, 0.3], [0.1, 0.4], [0, 0.55]], 10);
}
/** Plinth with something on it. */
export function monument(b: MeshBuilder, f: Pose, stone: string, kind: 'obelisk' | 'figure' | 'bust' | 'sphere' | 'column', metal = S('bronze')): void {
  if (kind === 'obelisk') {
    box(b, stone, f, [0, 0.3, 0], [1.1, 0.3, 1.1], 'Y');
    box(b, stone, f, [0, 1.1, 0], [0.7, 0.5, 0.7], 'Y');
    lathe(b, stone, turn(move(f, 0, 1.6, 0), 45), [[0.7, 0], [0.42, 7], [0, 7.7]], 4);
    plate(b, S('sign-plaque'), f, [0, 1.1, 0.71]);
    return;
  }
  const ph = kind === 'column' ? 0.6 : kind === 'bust' ? 1.3 : 1.6;
  box(b, stone, f, [0, 0.15, 0], [0.9, 0.15, 0.9], 'Y');
  box(b, stone, f, [0, 0.3 + ph / 2, 0], [0.55, ph / 2, 0.55], 'Y');
  box(b, stone, f, [0, 0.3 + ph + 0.06, 0], [0.65, 0.06, 0.65]);
  plate(b, S('sign-plaque'), f, [0, 0.3 + ph * 0.55, 0.56]);
  const g = move(f, 0, 0.42 + ph, 0);
  if (kind === 'sphere') {
    ball(b, metal, g, [0, 0.9, 0], 0.9, 16);
    torus(b, metal, tilt(move(g, 0, 0.9, 0), 25), [0, 0, 0], 1.15, 0.05, 20, 5);
  } else if (kind === 'bust') {
    lathe(b, metal, g, [[0.4, 0], [0.42, 0.25], [0.16, 0.45], [0.13, 0.55]], 10, 0.6);
    ball(b, metal, g, [0, 0.75, 0], 0.22, 10, -90, 90, 1.2);
  } else if (kind === 'column') {
    lathe(b, stone, g, [[0.5, 0], [0.5, 0.2], [0.36, 0.35], [0.32, 5], [0.5, 5.2], [0.5, 5.4], [0, 5.4]], 14);
    ball(b, metal, g, [0, 5.75, 0], 0.35, 10);
  } else {
    // Standing figure: legs, coat, arms, head.
    for (const sx of [-1, 1]) b.tube(metal, at(g, sx * 0.12, 0, 0), at(g, sx * 0.1, 0.95, 0), 0.1, 8, 0.12);
    lathe(b, metal, move(g, 0, 0.75, 0), [[0.3, 0], [0.24, 0.35], [0.27, 0.7], [0.12, 0.85]], 10, 0.65);
    b.tube(metal, at(g, -0.27, 1.5, 0), at(g, -0.34, 0.95, 0.05), 0.07, 7, 0.055, true);
    pipe(b, metal, [at(g, 0.27, 1.5, 0), at(g, 0.5, 1.45, 0.25), at(g, 0.62, 1.8, 0.4)], 0.06, 7);
    ball(b, metal, g, [0, 1.76, 0], 0.15, 10, -90, 90, 1.15);
  }
}
/** Ferris wheel with its axis along z. */
export function ferrisWheel(b: MeshBuilder, f: Pose, R: number, cars: number, o: { frame: string; rim: string; car: string[] }): void {
  const hubY = R + 2.5;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) b.beam(o.frame, at(f, sx * R * 0.55, 0.3, sz * 3), at(f, 0, hubY, sz * 1.4), 0.45, 0.45);
    b.beam(o.frame, at(f, -R * 0.3, hubY * 0.45, sz * 2.25), at(f, R * 0.3, hubY * 0.45, sz * 2.25), 0.3, 0.3);
    box(b, 'concrete/walk-plain', f, [0, 0.15, sz * 3], [R * 0.55 + 1, 0.15, 0.8], 'Y');
  }
  b.tube(o.frame, at(f, 0, hubY, -1.6), at(f, 0, hubY, 1.6), 0.4, 12, 0.4, true);
  const P = (i: number, r: number, z: number, n = cars): V3 => at(f, Math.cos((i / n) * Math.PI * 2 + 0.2) * r, hubY + Math.sin((i / n) * Math.PI * 2 + 0.2) * r, z);
  for (const z of [-0.9, 0.9]) {
    for (let i = 0; i < cars; i++) {
      b.tube(o.rim, P(i, R, z), P(i + 1, R, z), 0.07, 5);
      b.tube(o.rim, P(i, R * 0.6, z), P(i + 1, R * 0.6, z), 0.04, 4);
      b.tube(o.rim, P(i, 0.3, z * 0.6), P(i, R, z), 0.035, 4);
      b.tube(o.rim, P(i, R * 0.6, z), P(i + 1, R, z), 0.025, 4);
    }
  }
  for (let i = 0; i < cars; i++) {
    b.tube(o.rim, P(i, R, -0.9), P(i, R, 0.9), 0.04, 5);
    const c = P(i, R, 0);
    const g: Pose = { ...f, o: c };
    const col = o.car[i % o.car.length];
    for (const sz of [-1, 1]) b.tube(o.frame, at(g, 0, 0, sz * 0.7), at(g, 0, -0.5, sz * 0.7), 0.025, 4);
    lathe(b, col, move(g, 0, -1.9, 0), [[0, 0], [0.75, 0.05], [0.85, 0.7], [0.85, 0.75]], 8);
    lathe(b, col, move(g, 0, -0.75, 0), [[0.9, 0], [0.5, 0.25], [0, 0.3]], 8);
    for (let k = 0; k < 4; k++) b.tube(o.frame, at(g, Math.cos(k * 1.57 + 0.4) * 0.8, -1.15, Math.sin(k * 1.57 + 0.4) * 0.8), at(g, Math.cos(k * 1.57 + 0.4) * 0.8, -0.75, Math.sin(k * 1.57 + 0.4) * 0.8), 0.02, 4);
  }
  // Boarding platform and ticket booth.
  box(b, S('deck-grey'), f, [0, 0.35, 0], [3.5, 0.35, 1.3], 'Y');
  hut(b, turn(move(f, R * 0.55 + 2.2, 0, 4.2), 0), 1.8, 1.8, 2.3, { wall: 'wall/siding-red', roof: S('canvas-stripe-red'), rise: 0.6, over: 0.3, win: 'window/slider-aluminium', winU: 1.2 });
}
/** Carousel with a striped canopy and rows of horses on poles. */
export function carousel(b: MeshBuilder, f: Pose, R: number, o: { roof: string; trim: string; deck?: string; horses: string[] }): void {
  cyl(b, o.deck ?? 'trim/paint-red', f, [0, 0, 0], R, 0.35, 20);
  cyl(b, o.trim, f, [0, 0.35, 0], R * 0.28, 3, 12);
  lathe(b, o.trim, move(f, 0, 3.35, 0), [[R + 0.15, 0], [R + 0.15, 0.45]], 20);
  canopy(b, o.roof, f, [0, 3.8, 0], R + 0.15, 1.8, 20);
  ball(b, o.trim, f, [0, 5.75, 0], 0.22, 8);
  const n = Math.round(R * 2.4);
  for (let i = 0; i < n; i++) for (const [rr, ph] of [[R * 0.82, 0], [R * 0.55, 0.5]] as [number, number][]) {
    const a = ((i + ph) / n) * Math.PI * 2;
    const g = turn(move(f, Math.cos(a) * rr, 0.35, Math.sin(a) * rr), (-a * 180) / Math.PI - 90);
    const up = 0.75 + hash(i * 2 + ph * 2, 4) * 0.5;
    b.tube('trim/paint-yellow', at(g, 0, 0, 0), at(g, 0, 3, 0), 0.02, 5);
    const col = o.horses[(i + (ph ? 1 : 0)) % o.horses.length];
    box(b, col, g, [0, up, 0], [0.42, 0.14, 0.1]);
    box(b, col, tilt(turn(move(g, 0.42, up + 0.12, 0), 90), 30), [0, 0.2, 0], [0.08, 0.2, 0.07]);
    box(b, col, g, [0.58, up + 0.42, 0], [0.13, 0.07, 0.065]);
    for (const sx of [-0.3, 0.3]) for (const sz of [-1, 1]) box(b, col, g, [sx + (sx > 0 ? 0.08 : -0.06), up - 0.32, sz * 0.06], [0.03, 0.2, 0.03]);
    box(b, 'trim/paint-red', g, [-0.02, up + 0.15, 0], [0.14, 0.015, 0.105]);
  }
}

export function addParks(): void {
  const A = (id: string, label: string, fn: (b: MeshBuilder, f: Pose) => void): void => addModel('park', id, label, (b) => fn(b, stand()));
  const COL = ['red', 'blue', 'yellow', 'green', 'orange'];
  const P = (c: string): string => `trim/paint-${c}`;

  // Playground.
  A('swing-2', 'ブランコ 2人用 青', (b, f) => swings(b, f, 2, P('blue')));
  A('swing-4', 'ブランコ 4人用 緑', (b, f) => swings(b, f, 4, P('green'), { h: 2.7 }));
  A('swing-toddler', 'ブランコ 幼児用 赤', (b, f) => swings(b, f, 2, P('red'), { h: 2, toddler: true, seat: P('yellow') }));
  A('swing-old', 'ブランコ 古い さび', (b, f) => swings(b, f, 3, 'structure/steel-galvanized-rusty', { seat: 'signal/pole-wood-grey' }));
  A('slide-steel', 'すべり台 ステンレス', (b, f) => slide(b, f, 1.8, 'furniture/coat-stainless', P('blue')));
  A('slide-yellow', 'すべり台 黄 波形', (b, f) => slide(b, f, 2.2, S('plastic-yellow'), P('red'), { wave: true }));
  A('slide-small', 'すべり台 幼児用 緑', (b, f) => slide(b, f, 1.1, S('plastic-green'), P('yellow')));
  A('play-structure', '複合遊具 小', (b, f) => playStructure(b, f, P('blue'), S('plastic-red'), S('plastic-yellow')));
  A('play-structure-big', '複合遊具 大 すべり台2本', (b, f) => playStructure(b, f, P('green'), S('plastic-yellow'), S('plastic-blue'), true));
  A('play-structure-wood', '複合遊具 木製', (b, f) => playStructure(b, f, WOOD, 'roof/shake-cedar', 'furniture/coat-stainless'));
  A('seesaw', 'シーソー', (b, f) => seesaw(b, f, P('red'), P('yellow')));
  A('seesaw-wood', 'シーソー 木製', (b, f) => seesaw(b, f, ZINC, WOOD));
  COL.slice(0, 4).forEach((c, i) => A(`spring-rider-${c}`, `スプリング遊具 ${['赤', '青', '黄', '緑'][i]}`, (b, f) => springRider(b, f, S(`plastic-${c}`))));
  A('roundabout', '回転遊具', (b, f) => roundabout(b, f, P('red'), P('yellow')));
  A('roundabout-old', '回転遊具 古い', (b, f) => roundabout(b, f, 'signal/pole-wood-grey', 'structure/steel-galvanized-rusty'));
  A('monkey-bars', 'うんてい', (b, f) => monkeyBars(b, f, P('red')));
  A('monkey-bars-long', 'うんてい 長い 青', (b, f) => monkeyBars(b, f, P('blue'), 4.5));
  A('climb-dome', 'ジャングルドーム', (b, f) => climbDome(b, f, P('orange')));
  A('climb-dome-big', 'ジャングルドーム 大 緑', (b, f) => climbDome(b, f, P('green'), 2.2));
  A('sandbox', '砂場 木枠', (b, f) => {
    pad(b, S('sand-prints'), f, 3.6, 3.6, 0.12);
    for (let i = 0; i < 4; i++) box(b, WOOD, turn(f, i * 90), [0, 0.11, 1.9], [2, 0.11, 0.1], 'Y');
  });
  A('sandbox-round', '砂場 丸 コンクリート縁', (b, f) => {
    cyl(b, S('sand-dry'), f, [0, 0, 0], 2.4, 0.15, 16);
    lathe(b, 'concrete/walk-plain', f, [[2.7, 0], [2.7, 0.3], [2.4, 0.3], [2.4, 0.1]], 16);
  });
  (['safety-rubber-red', 'safety-rubber-green', 'safety-rubber-blue', 'woodchips'] as const).forEach((t, i) => A(`surface-${t.replace('safety-', '')}`, `遊び場の床 ${['ゴム赤', 'ゴム緑', 'ゴム青', 'ウッドチップ'][i]}`, (b, f) => {
    pad(b, S(t), f, 8 + i, 8, 0.03);
    for (let k = 0; k < 4; k++) box(b, i === 3 ? WOOD : 'concrete/walk-plain', turn(f, k * 90), [0, 0.05, k % 2 ? (8 + i) / 2 + 0.08 : 4.08], [k % 2 ? 4.16 : (8 + i) / 2 + 0.16, 0.05, 0.08], 'Y');
  }));
  A('playground-sign', '遊び場の対象年齢標識', (b, f) => {
    b.tube(ZINC, at(f, 0, 0, 0), at(f, 0, 1.9, 0), 0.03, 6, 0.03, true);
    plate(b, S('sign-playground-age'), f, [0, 1.55, 0.035]);
  });

  // Sports.
  A('hoop', 'バスケットゴール', (b, f) => hoop(b, f));
  A('hoop-old', 'バスケットゴール 古い ネットなし', (b, f) => hoop(b, f, { post: 'structure/steel-galvanized-rusty', board: 'trim/paint-white-old', net: false }));
  A('hoop-low', 'バスケットゴール 子供用', (b, f) => hoop(b, f, { post: P('blue'), h: 2.4 }));
  (['court-basketball', 'court-basketball-green', 'court-basketball-worn'] as const).forEach((t, i) => A(`basketball-${['court', 'court-green', 'court-worn'][i]}`, `バスケットコート ${['赤', '緑', '古い'][i]}`, (b, f) => {
    pad(b, S(t), f, 15.24, 14.33, 0.02, true);
    hoop(b, turn(move(f, 0, 0, -14.33 / 2 + 1.2), 0), i === 2 ? { post: 'structure/steel-galvanized-rusty', net: false } : {});
    if (i === 1) chainlink(b, move(f, -7.62, 0, -7.17), 15.24, { h: 3 });
  }));
  A('basketball-full', 'バスケットコート 全面 フェンスつき', (b, f) => {
    for (const s of [0, 180]) {
      pad(b, S('court-basketball'), turn(move(f, 0, 0, s ? 7.165 : -7.165), s), 15.24, 14.33, 0.02, true);
      hoop(b, turn(move(f, 0, 0, s ? 14.33 - 1.2 : -14.33 + 1.2), s));
    }
    for (const s of [0, 180]) chainlink(b, turn(move(f, s ? 7.8 : -7.8, 0, s ? 15 : -15), s), 15.6, { h: 3 });
  });
  (['court-tennis', 'court-tennis-clay'] as const).forEach((t, i) => A(`tennis-${i ? 'clay' : 'court'}`, `テニスコート ${i ? 'クレー' : 'ハード'}`, (b, f) => {
    pad(b, S(t), f, 18.29, 18.29 * 2, 0.02, false);
    netPosts(b, f, 12.8, 1.07, S('net-white'), i ? P('green') : P('black'));
    for (const s of [0, 180]) chainlink(b, turn(move(f, s ? 9.2 : -9.2, 0, s ? 18.3 : -18.3), s), 18.4, { h: 3.6, screen: i ? undefined : S('screen-green') });
  }));
  A('tennis-net', 'テニスネット', (b, f) => netPosts(b, f, 12.8, 1.07, S('net-white'), P('green')));
  A('soccer-goal', 'サッカーゴール', (b, f) => goal(b, f, 7.32, 2.44, 2));
  A('soccer-goal-small', 'サッカーゴール 少年用', (b, f) => goal(b, f, 5, 2, 1.5, P('yellow')));
  A('hockey-goal', 'ホッケーゴール 赤', (b, f) => goal(b, f, 1.83, 1.22, 0.9, P('red')));
  A('soccer-field-end', 'サッカー場 ゴール側の半面', (b, f) => {
    pad(b, S('turf-lines'), f, 40, 28, 0.02);
    goal(b, turn(move(f, 0, 0, -13), 0), 7.32, 2.44, 2);
    for (const sx of [-1, 1]) flagPole(b, move(f, sx * 19.5, 0, -13.5), 1.5, S('flag-yellow'), P('white'));
  });
  A('baseball-backstop', '野球のバックネット', (b, f) => {
    for (let i = -2; i <= 2; i++) {
      const g = turn(move(f, Math.sin(i * 0.5) * 8, 0, 8 - Math.cos(i * 0.5) * 8), -i * 28.6);
      chainlink(b, move(g, -2.1, 0, 0), 4.2, { h: 5 });
    }
    pad(b, 'ground/dirt', move(f, 0, 0, 6), 12, 12, 0.02);
    box(b, 'trim/paint-white', f, [0, 0.03, 5], [0.22, 0.01, 0.22]);
  });
  A('dugout', 'ダグアウト ベンチと屋根', (b, f) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tube(ZINC, at(f, sx * 3, 0, sz * 0.9), at(f, sx * 3, sz > 0 ? 2.5 : 2.2, sz * 0.9), 0.035, 6);
    sheet(b, 'roof/corrugated-galvanized', at(f, -3.3, 2.55, 1.2), at(f, 3.3, 2.55, 1.2), at(f, 3.3, 2.2, -1.2), at(f, -3.3, 2.2, -1.2), [[0, 0], [6.6, 0], [6.6, 2.4], [0, 2.4]]);
    chainlink(b, move(f, -3, 0, -0.9), 6, { h: 2.2 });
    bench(b, move(f, -1.5, 0, -0.3), { kind: 'flat', len: 2.8 });
    bench(b, move(f, 1.5, 0, -0.3), { kind: 'flat', len: 2.8 });
  });
  A('bleachers-3', '観覧席 3段', (b, f) => bleachers(b, f, 4.6, 3));
  A('bleachers-5', '観覧席 5段 手すりつき', (b, f) => bleachers(b, f, 6.4, 5));
  A('bleachers-wood', '観覧席 木製 4段', (b, f) => bleachers(b, f, 5, 4, { seat: 'signal/pole-wood-grey', frame: 'structure/steel-galvanized-rusty' }));
  A('track-straight', '陸上トラック 直線 4レーン 20m', (b, f) => {
    pad(b, S('track-red'), turn(f, 90), 4.88, 20, 0.02);
    for (const sz of [-1, 1]) box(b, 'trim/paint-aluminium', f, [0, 0.03, sz * 2.47], [10, 0.03, 0.03], 'Y');
  });
  A('skate-quarter', 'スケートパーク クォーターパイプ', (b, f) => quarterPipe(b, f, 3.6, 1.5, 2.2, 'concrete/walk-plain', 'structure/wall-smooth'));
  A('skate-quarter-wood', 'スケートパーク 木製ランプ', (b, f) => quarterPipe(b, f, 2.4, 1.1, 1.9, 'wall/plywood-tan'));
  A('skate-halfpipe', 'スケートパーク ミニハーフパイプ', (b, f) => {
    quarterPipe(b, move(f, 0, 0, -1.5), 4.8, 1.4, 2.2, 'wall/plywood-tan');
    quarterPipe(b, turn(move(f, 0, 0, 1.5), 180), 4.8, 1.4, 2.2, 'wall/plywood-tan');
    pad(b, 'wall/plywood-tan', f, 4.8, 3, 0.02);
  });
  A('skate-funbox', 'スケートパーク ファンボックスとレール', (b, f) => {
    box(b, 'structure/wall-smooth', f, [0, 0.25, 0], [1.5, 0.25, 1], 'Y');
    for (const sx of [-1, 1]) {
      b.quad('concrete/walk-plain', at(f, sx * 1.5, 0.5, sx * 1), at(f, sx * 1.5, 0.5, -sx * 1), at(f, sx * 3.3, 0, -sx * 1), at(f, sx * 3.3, 0, sx * 1), [[0, 0], [2, 0], [2, 1.9], [0, 1.9]]);
      for (const sz of [-1, 1]) b.tri('structure/wall-smooth', at(f, sx * 1.5, 0, sz * 1), at(f, sx * 3.3, 0, sz * 1), at(f, sx * 1.5, 0.5, sz * 1), [[0, 0], [1.8, 0], [0, 0.5]]);
      for (const sz of [-1, 1]) b.tri('structure/wall-smooth', at(f, sx * 3.3, 0, sz * 1), at(f, sx * 1.5, 0, sz * 1), at(f, sx * 1.5, 0.5, sz * 1), [[1.8, 0], [0, 0], [0, 0.5]]);
    }
    pipe(b, ZINC, [at(f, -1.8, 0, 2), at(f, -1.8, 0.45, 2), at(f, 1.8, 0.45, 2), at(f, 1.8, 0, 2)], 0.03, 6);
  });
  A('gym-pullup', '健康遊具 鉄棒 3段', (b, f) => {
    [1.2, 1.7, 2.2].forEach((h, i) => {
      b.tube(P('green'), at(f, i * 1.3, 0, 0), at(f, i * 1.3, h + 0.1, 0), 0.04, 8, 0.04, true);
      b.tube(ZINC, at(f, i * 1.3, h, 0), at(f, i * 1.3 + 1.3, h, 0), 0.018, 6);
    });
    b.tube(P('green'), at(f, 3.9, 0, 0), at(f, 3.9, 2.3, 0), 0.04, 8, 0.04, true);
  });
  A('gym-parallel', '健康遊具 平行棒', (b, f) => {
    for (const sz of [-1, 1]) pipe(b, P('blue'), [at(f, -1, 0, sz * 0.28), at(f, -1, 1.2, sz * 0.28), at(f, 1, 1.2, sz * 0.28), at(f, 1, 0, sz * 0.28)], 0.022, 6);
  });

  // Park structures.
  A('gazebo', 'あずまや 八角 白', (b, f) => pavilion(b, f, 5, 5, 2.6, { post: P('white'), roof: 'roof/shingle-green', sides: 8, rise: 1.8, rail: true, floor: S('deck-grey'), cupola: true }));
  A('gazebo-hex', 'あずまや 六角 木', (b, f) => pavilion(b, f, 4, 4, 2.4, { post: WOOD, roof: 'roof/shake-cedar', sides: 6, rise: 1.6, floor: 'concrete/walk-plain' }));
  A('bandstand', '野外音楽堂 八角 大', (b, f) => pavilion(b, f, 9, 9, 3.6, { post: P('green'), roof: 'roof/seam-copper', sides: 8, rise: 2.8, rail: true, floor: 'structure/stone-ashlar', cupola: true }));
  A('picnic-shelter', 'ピクニックシェルター', (b, f) => {
    pavilion(b, f, 8, 5, 2.7, { post: WOOD, roof: 'roof/seam-green', rise: 1.3, floor: 'concrete/walk-plain' });
    for (const x of [-2, 2]) picnicTable(b, move(f, x, 0.16, 0), 'wood', 'furniture/slats-weathered');
  });
  A('picnic-shelter-small', 'ピクニックシェルター 小 赤屋根', (b, f) => {
    pavilion(b, f, 4, 4, 2.5, { post: P('brown'), roof: 'roof/seam-red', rise: 1.1 });
    picnicTable(b, f, 'metal', P('green'));
  });
  A('pergola', 'パーゴラ 木製', (b, f) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) box(b, WOOD, f, [sx * 1.3, 1.25, sz * 2.4], [0.07, 1.25, 0.07], 'Y');
    for (const sx of [-1, 1]) box(b, WOOD, f, [sx * 1.3, 2.56, 0], [0.05, 0.09, 3]);
    for (let z = -2.8; z <= 2.81; z += 0.4) box(b, WOOD, f, [0, 2.7, z], [1.8, 0.07, 0.025]);
  });
  A('pergola-white', 'パーゴラ 白 ベンチつき', (b, f) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(b, P('white'), move(f, sx * 1.2, 0, sz * 1.6), [[0.12, 0], [0.1, 2.4], [0.14, 2.5]], 10);
    for (const sx of [-1, 1]) box(b, P('white'), f, [sx * 1.2, 2.58, 0], [0.05, 0.08, 2.1]);
    for (let z = -1.9; z <= 1.91; z += 0.38) box(b, P('white'), f, [0, 2.7, z], [1.7, 0.06, 0.025]);
    bench(b, move(f, 0, 0, 0), { kind: 'park', slats: 'green' });
  });
  A('picnic-table-wood', 'ピクニックテーブル 木', (b, f) => picnicTable(b, f, 'wood', 'furniture/slats-weathered'));
  A('picnic-table-red', 'ピクニックテーブル 木 赤茶', (b, f) => picnicTable(b, f, 'wood', 'furniture/slats-red'));
  A('picnic-table-concrete', 'ピクニックテーブル コンクリート', (b, f) => picnicTable(b, f, 'concrete', 'concrete/walk-plain'));
  A('picnic-table-metal', 'ピクニックテーブル 金属 緑', (b, f) => picnicTable(b, f, 'metal', 'furniture/perforated-blue'));
  A('grill', 'バーベキューグリル 柱つき', (b, f) => grill(b, f));
  A('chess-table', 'チェス盤つきテーブル', (b, f) => {
    box(b, 'concrete/walk-plain', f, [0, 0.74, 0], [0.45, 0.04, 0.45]);
    cyl(b, 'concrete/walk-plain', f, [0, 0, 0], 0.15, 0.7, 8);
    for (let i = 0; i < 16; i++) if ((i + Math.floor(i / 4)) % 2) box(b, 'trim/paint-charcoal', f, [-0.225 + (i % 4) * 0.15, 0.781, -0.225 + Math.floor(i / 4) * 0.15], [0.075, 0.002, 0.075]);
    for (const sx of [-1, 1]) cyl(b, 'concrete/walk-plain', f, [sx * 0.85, 0, 0], 0.2, 0.45, 8);
  });
  A('fountain', '噴水 2段 石', (b, f) => fountain(b, f, 'structure/stone-ashlar', 3, 2));
  A('fountain-large', '噴水 3段 大', (b, f) => fountain(b, f, 'wall/stone-limestone', 5, 3));
  A('fountain-small', '噴水 小 1段', (b, f) => fountain(b, f, 'wall/stone-granite-grey', 1.6, 1, S('water-pond')));
  A('fountain-modern', '噴水 現代的 四角い水盤', (b, f) => {
    box(b, 'wall/stone-granite-black', f, [0, 0.2, 0], [3.2, 0.2, 3.2], 'Y');
    pad(b, S('water-pool'), f, 5.8, 5.8, 0.405);
    for (let i = 0; i < 9; i++) cyl(b, 'furniture/coat-stainless', f, [-1.6 + (i % 3) * 1.6, 0.4, -1.6 + Math.floor(i / 3) * 1.6], 0.06, 0.12, 8);
    box(b, 'wall/stone-granite-black', f, [0, 1.2, 0], [0.5, 0.8, 0.5]);
  });
  (['obelisk', 'figure', 'bust', 'sphere', 'column'] as const).forEach((k, i) => A(`monument-${k}`, `記念碑 ${['オベリスク', '立像', '胸像', '球のオブジェ', '記念柱'][i]}`, (b, f) => monument(b, f, i % 2 ? 'wall/stone-granite-grey' : 'wall/stone-limestone', k, i === 3 ? 'furniture/coat-stainless' : S(i % 2 ? 'bronze' : 'bronze-dark'))));
  A('memorial-rock', '記念の石と銘板', (b, f) => {
    boulder(b, S('rock-granite'), f, [0, 0.45, 0], [1, 0.8, 0.6], 91, 6);
    plate(b, S('sign-plaque'), tilt(f, -12), [0, 0.75, 0.52]);
  });
  A('park-sign', '公園の入口看板 石の台', (b, f) => {
    box(b, S('wall-fieldstone'), f, [0, 0.3, 0], [1.6, 0.3, 0.3], 'Y');
    for (const sx of [-1, 1]) box(b, WOOD, f, [sx * 1.3, 1, 0], [0.08, 0.7, 0.08]);
    plate(b, S('sign-park-name'), f, [0, 1.2, 0.05], { back: S('sign-park-name') });
  });
  A('park-sign-rules', '公園の利用規則標識', (b, f) => {
    b.tube(P('green'), at(f, 0, 0, 0), at(f, 0, 2.1, 0), 0.03, 6, 0.03, true);
    plate(b, S('sign-park-rules'), f, [0, 1.6, 0.035]);
  });
  A('pond', '池 石の縁', (b, f) => {
    lathe(b, S('water-pond'), move(f, 0, 0.05, 0), [[0, 0], [6, 0]], 18, 0.65);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      boulder(b, S(i % 3 ? 'rock-granite' : 'rock-mossy'), f, [Math.cos(a) * 6.1, 0.1, Math.sin(a) * 6.1 * 0.65], [0.5 + hash(i, 5) * 0.4, 0.3, 0.4 + hash(i, 6) * 0.3], 100 + i, 4);
    }
  });
  A('footbridge-arch', '園路の太鼓橋 木製', (b, f) => {
    const n = 10;
    const Y = (q: number): number => Math.sin(q * Math.PI) * 0.9;
    for (let i = 0; i < n; i++) {
      const [x0, x1] = [-3 + (6 * i) / n, -3 + (6 * (i + 1)) / n];
      sheet(b, 'paving/boardwalk', at(f, x0, Y(i / n) + 0.1, 0.8), at(f, x1, Y((i + 1) / n) + 0.1, 0.8), at(f, x1, Y((i + 1) / n) + 0.1, -0.8), at(f, x0, Y(i / n) + 0.1, -0.8), [[x0, 0], [x1, 0], [x1, 1.6], [x0, 1.6]]);
      for (const sz of [-1, 1]) {
        b.beam(P('red'), at(f, x0, Y(i / n) + 1, sz * 0.8), at(f, x1, Y((i + 1) / n) + 1, sz * 0.8), 0.06, 0.08);
        b.beam(P('red'), at(f, x0, Y(i / n), sz * 0.8), at(f, x1, Y((i + 1) / n), sz * 0.8), 0.08, 0.2);
        b.tube(P('red'), at(f, x0, Y(i / n), sz * 0.8), at(f, x0, Y(i / n) + 1, sz * 0.8), 0.03, 5);
      }
    }
    for (const sz of [-1, 1]) b.tube(P('red'), at(f, 3, 0, sz * 0.8), at(f, 3, 1, sz * 0.8), 0.03, 5);
  });
  A('trellis-arch', 'バラのアーチ 白', (b, f) => {
    for (const sz of [-1, 1]) {
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) pts.push(at(f, -Math.cos((i / 8) * Math.PI) * 0.8, 1.7 + Math.sin((i / 8) * Math.PI) * 0.7, sz * 0.25));
      pipe(b, P('white'), [at(f, -0.8, 0, sz * 0.25), ...pts, at(f, 0.8, 0, sz * 0.25)], 0.02, 5);
    }
    for (const sx of [-1, 1]) panel(b, 'trim/lattice-white', turn(move(f, sx * 0.8, 0, 0.25), 90), 0, 0.5, 0, 1.7);
  });
  A('bird-bath', 'バードバス', (b, f) => {
    lathe(b, 'structure/wall-smooth', f, [[0.25, 0], [0.2, 0.08], [0.08, 0.2], [0.07, 0.7], [0.4, 0.85], [0.42, 0.9], [0.36, 0.9], [0, 0.82]], 12);
    cyl(b, S('water-pond'), f, [0, 0.87, 0], 0.36, 0.005, 12);
  });
  A('restroom', '公園のトイレ', (b, f) => {
    hut(b, f, 7, 4.5, 2.8, { wall: 'wall/block-beige', roof: 'roof/seam-green', rise: 1.1, over: 0.6, door: 'door/steel-green' });
    box(b, 'door/steel-green', f, [2.75, 1.05, 2.26], [0.45, 1.05, 0.01]);
    for (const x of [-1, 1]) box(b, 'trim/louver-grey', f, [x * 0.8, 2.3, 2.26], [0.5, 0.2, 0.01]);
    box(b, 'wall/block-beige', f, [0, 1.1, 3], [0.1, 1.1, 0.75]);
  });
  A('kiosk', '公園の売店', (b, f) => {
    hut(b, f, 3.6, 3, 2.5, { wall: 'wall/siding-green', roof: S('canvas-stripe-yellow'), rise: 0.8, over: 0.7 });
    box(b, 'window/band-black', f, [0, 1.55, 1.51], [1.3, 0.5, 0.01]);
    box(b, P('white'), f, [0, 1.02, 1.7], [1.45, 0.03, 0.2]);
  });
  A('dog-agility', 'ドッグラン 障害物セット', (b, f) => {
    for (const sx of [-1, 1]) b.tube(P('blue'), at(f, sx * 0.6, 0, 0), at(f, sx * 0.6, 0.9, 0), 0.03, 6, 0.03, true);
    for (const y of [0.3, 0.6]) b.tube(P('yellow'), at(f, -0.6, y, 0), at(f, 0.6, y, 0), 0.02, 6);
    torus(b, P('red'), { ...move(f, 2.5, 0.9, 0), y: f.x, x: f.y }, [0, 0, 0], 0.4, 0.04, 14, 5);
    for (const sz of [-1, 1]) b.tube(P('blue'), at(f, 2.5, 0, sz * 0.48), at(f, 2.5, 1.3, sz * 0.48), 0.03, 6, 0.03, true);
    b.tube(P('blue'), at(f, 2.5, 1.3, -0.48), at(f, 2.5, 1.3, 0.48), 0.03, 6);
    sheet(b, P('yellow'), at(f, -2.6, 0, 0.3), at(f, -2.6, 0, -0.3), at(f, -1.9, 0.7, -0.3), at(f, -1.9, 0.7, 0.3), [[0, 0], [0.6, 0], [0.6, 1], [0, 1]]);
    sheet(b, P('blue'), at(f, -1.9, 0.7, 0.3), at(f, -1.9, 0.7, -0.3), at(f, -1.2, 0, -0.3), at(f, -1.2, 0, 0.3), [[0, 0], [0.6, 0], [0.6, 1], [0, 1]]);
  });
  A('flagpole', '掲揚ポール 10m', (b, f) => {
    cyl(b, 'structure/stone-ashlar', f, [0, 0, 0], 0.6, 0.3, 12);
    b.tube('trim/paint-aluminium', at(f, 0, 0.3, 0), at(f, 0, 10, 0), 0.07, 8, 0.04, true);
    ball(b, 'trim/paint-yellow', f, [0, 10.07, 0], 0.09, 8);
    plate(b, S('flag-green'), f, [0.75, 9.3, 0], { size: [1.5, 1], back: S('flag-green'), warp: (x) => Math.sin(x * 5) * 0.08 });
  });

  // Fairground.
  A('ferris-wheel', '観覧車 直径30m', (b, f) => ferrisWheel(b, f, 15, 16, { frame: 'structure/steel-white', rim: P('white'), car: COL.map((c) => S(`plastic-${c}`)) }));
  A('ferris-wheel-small', '観覧車 小 直径16m', (b, f) => ferrisWheel(b, f, 8, 10, { frame: 'structure/steel-blue', rim: P('yellow'), car: [S('plastic-red'), S('plastic-yellow')] }));
  A('ferris-wheel-large', '観覧車 大 直径44m', (b, f) => ferrisWheel(b, f, 22, 24, { frame: 'structure/steel-white', rim: P('red'), car: [P('white')] }));
  A('carousel', 'メリーゴーラウンド', (b, f) => carousel(b, f, 5, { roof: S('canvas-stripe-red'), trim: P('cream'), horses: [P('white'), P('brown'), P('black'), P('tan')] }));
  A('carousel-small', 'メリーゴーラウンド 小 青', (b, f) => carousel(b, f, 3.2, { roof: S('canvas-stripe-blue'), trim: P('white'), deck: P('blue'), horses: [P('white'), P('pink'), P('yellow')] }));
}
