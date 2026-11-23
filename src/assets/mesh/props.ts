import { PROP_PARTS, PropPart } from '../tex';
import { MeshBuilder, V3 } from './builder';
import { Pose, at, box, face, lathe, move, pipe, stand, turn } from './kit';

const P = (c: string): string => `prop/plastic-${c}`;
const CHROME = 'prop/chrome';
const STEEL = 'prop/steel';
const PARTS = 'prop/parts';
const BLACK = P('black');
/** A pose whose face lies flat, looking up: x along `f.x`, y towards the back, z up. */
const flat = (f: Pose): Pose => ({ o: f.o, x: f.x, y: [-f.z[0], -f.z[1], -f.z[2]], z: f.y });
/** One of the small things of the sheet, upright and facing `f.z`. */
function part(b: MeshBuilder, f: Pose, k: PropPart, c: V3, w: number, h: number): void {
  const r = PROP_PARTS[k];
  face(b, PARTS, f, c, w, h, [r[0], r[1], r[2], r[3]]);
}
/** The same lying on a table at height y. */
function lay(b: MeshBuilder, f: Pose, k: PropPart, x: number, y: number, z: number, w: number, d: number, yaw = 0): void {
  part(b, flat(turn(move(f, x, y, z), yaw)), k, [0, 0, 0], w, d);
}
const leg = (b: MeshBuilder, mat: string, f: Pose, x: number, z: number, h: number, r = 0.014, x1 = x, z1 = z): void => pipe(b, mat, [at(f, x, 0, z), at(f, x1, h, z1)], r, 5, false);

// --- Chairs and stools. ---
export interface ChairOpts { kind: 'shell' | 'bistro' | 'wood' | 'pad' | 'stack'; mat: string; frame?: string }
export function chair(b: MeshBuilder, f: Pose, o: ChairOpts): void {
  const fr = o.frame ?? CHROME;
  const [sw, sh] = [0.21, 0.45];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(b, fr, f, sx * (sw - 0.02), sz * 0.19, sh, 0.013, sx * (sw - 0.05), sz * 0.16);
  if (o.kind === 'shell' || o.kind === 'stack') {
    // A moulded seat that curves up into its back.
    const pts: [number, number][] = [[0.21, 0.44], [0.05, 0.43], [-0.14, 0.45], [-0.2, 0.52], [-0.23, 0.68], [-0.24, 0.82]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [p, q] = [pts[i], pts[i + 1]];
      b.quad(o.mat, at(f, -sw, p[1], p[0]), at(f, sw, p[1], p[0]), at(f, sw, q[1], q[0]), at(f, -sw, q[1], q[0]));
    }
    if (o.kind === 'stack') for (let k = 1; k < 4; k++) for (let i = 0; i + 1 < pts.length; i++) {
      const [p, q] = [pts[i], pts[i + 1]];
      b.quad(o.mat, at(f, -sw, p[1] + k * 0.07, p[0] + k * 0.012), at(f, sw, p[1] + k * 0.07, p[0] + k * 0.012), at(f, sw, q[1] + k * 0.07, q[0] + k * 0.012), at(f, -sw, q[1] + k * 0.07, q[0] + k * 0.012));
    }
    return;
  }
  const seat = o.kind === 'wood' ? o.mat : o.kind === 'pad' ? o.mat : fr;
  box(b, seat, f, [0, sh + 0.02, 0], [sw, o.kind === 'pad' ? 0.035 : 0.015, 0.2]);
  for (const sx of [-1, 1]) leg(b, o.kind === 'wood' ? o.mat : fr, f, sx * (sw - 0.02), -0.19, 0.86, o.kind === 'wood' ? 0.018 : 0.013, sx * (sw - 0.02), -0.23);
  if (o.kind === 'bistro') for (let i = -2; i <= 2; i++) leg(b, fr, move(f, 0, 0.47, 0), i * 0.07, -0.2, 0.38, 0.007, i * 0.07, -0.23);
  else box(b, o.mat, f, [0, 0.72, -0.22], [sw, o.kind === 'pad' ? 0.12 : 0.07, 0.014]);
  if (o.kind === 'bistro') pipe(b, fr, [at(f, -sw + 0.02, 0.86, -0.23), at(f, sw - 0.02, 0.86, -0.23)], 0.013, 6);
}
export function stool(b: MeshBuilder, f: Pose, o: { mat: string; kind: 'pedestal' | 'legs' | 'low'; h?: number }): void {
  const h = o.h ?? (o.kind === 'low' ? 0.45 : 0.75);
  if (o.kind === 'pedestal') {
    lathe(b, CHROME, f, [[0.2, 0], [0.2, 0.015], [0.035, 0.05], [0.03, h - 0.08], [0.1, h - 0.06]], 12);
    lathe(b, CHROME, move(f, 0, 0.22, 0), [[0.03, 0], [0.15, 0.005], [0.15, 0.02], [0.03, 0.025]], 12);
  } else for (let i = 0; i < 4; i++) leg(b, o.kind === 'legs' ? 'prop/wood-walnut' : CHROME, f, Math.cos(i * 1.571 + 0.785) * 0.2, Math.sin(i * 1.571 + 0.785) * 0.2, h - 0.04, 0.016, Math.cos(i * 1.571 + 0.785) * 0.12, Math.sin(i * 1.571 + 0.785) * 0.12);
  lathe(b, o.mat, move(f, 0, h - 0.06, 0), [[0.001, 0], [0.17, 0], [0.18, 0.03], [0.17, 0.06], [0.001, 0.065]], 14);
}

// --- Tables and what stands on them. ---
export type Setting = 'none' | 'tray' | 'plates' | 'condiments' | 'pizza' | 'noodle' | 'coffee';
const TRAYS: PropPart[] = ['tray-burger', 'tray-chicken', 'tray-empty'];
const PLATES: PropPart[] = ['plate-pancake', 'plate-breakfast', 'plate-donut', 'plate-empty'];
const CUPS: PropPart[] = ['cup-red', 'cup-white', 'cup-blue'];
function cup(b: MeshBuilder, f: Pose, k: PropPart, x: number, y: number, z: number, s = 1): void {
  const r = PROP_PARTS[k];
  const pr = b.part(PARTS);
  void pr;
  for (let i = 0; i < 6; i++) {
    const [a0, a1] = [(i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2];
    const q = (a: number, top: number): V3 => at(f, x + Math.cos(a) * (0.03 + top * 0.012) * s, y + top * 0.12 * s, z + Math.sin(a) * (0.03 + top * 0.012) * s);
    b.quad(PARTS, q(a1, 0), q(a0, 0), q(a0, 1), q(a1, 1), [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]);
  }
  box(b, P('white'), f, [x, y + 0.122 * s, z], [0.03 * s, 0.003, 0.03 * s]);
}
function bottle(b: MeshBuilder, f: Pose, k: 'ketchup' | 'mustard', x: number, y: number, z: number): void {
  const r = PROP_PARTS[k];
  for (let i = 0; i < 4; i++) part(b, turn(move(f, x, y, z), i * 90), k, [0, 0.075, 0.022], 0.044, 0.15);
  void r;
  box(b, P(k === 'ketchup' ? 'white' : 'yellow'), f, [x, y + 0.165, z], [0.012, 0.018, 0.012]);
}
/** What is left on a table of w by d: `n` picks one arrangement of several. */
export function setting(b: MeshBuilder, f: Pose, y: number, w: number, d: number, kind: Setting, n: number): void {
  if (kind === 'none') return;
  const sx = Math.min(0.5, w / 2 - 0.2);
  const places: [number, number, number][] = d > 0.9 ? [[-sx, 0.22, 0], [sx, -0.22, 180], [sx, 0.22, 0], [-sx, -0.22, 180]] : w > 1 ? [[-sx, 0, 90], [sx, 0, -90]] : [[0, d / 4, 0], [0, -d / 4, 180]];
  const used = places.filter((_, i) => ((n >> i) & 1) === 0 || i === n % places.length);
  if (kind === 'condiments' || n % 3 === 0) {
    bottle(b, f, 'ketchup', -0.05, y, 0);
    bottle(b, f, 'mustard', 0.03, y, 0.03);
    box(b, STEEL, f, [0.04, y + 0.06, -0.07], [0.06, 0.06, 0.035]);
    part(b, move(f, 0.04, y, -0.07), 'napkins', [0, 0.06, 0.036], 0.12, 0.1);
  }
  if (kind === 'condiments') {
    part(b, turn(move(f, -0.16, y, -0.02), 20), 'menu-card', [0, 0.1, 0], 0.13, 0.2);
    part(b, turn(move(f, -0.16, y, -0.02), 200), 'menu-card', [0, 0.1, 0.002], 0.13, 0.2);
    return;
  }
  used.forEach(([x, z, yaw], i) => {
    const m = n + i * 5;
    if (kind === 'tray') lay(b, f, TRAYS[m % 3], x, y + 0.012, z, 0.4, 0.3, yaw);
    else if (kind === 'pizza') lay(b, f, m % 2 ? 'tray-pizza' : 'pizza-box', x, y + 0.012, z, 0.4, 0.3, yaw);
    else if (kind === 'noodle') {
      lay(b, f, 'tray-noodle', x, y + 0.012, z, 0.4, 0.3, yaw);
      // The pot of chopsticks goes round with the bowls.
      if (i === 0) box(b, 'prop/plastic-black', f, [0.14, y + 0.07, -0.05], [0.05, 0.07, 0.05]);
    }
    else {
      if (kind === 'plates') lay(b, f, 'placemat', x, y + 0.006, z, 0.4, 0.3, yaw);
      lay(b, f, kind === 'coffee' ? (m % 2 ? 'plate-donut' : 'plate-empty') : PLATES[m % 4], x, y + 0.012, z, kind === 'coffee' ? 0.2 : 0.27, kind === 'coffee' ? 0.2 : 0.27, yaw);
    }
    if (kind !== 'tray' || m % 2) cup(b, f, kind === 'coffee' || kind === 'plates' ? 'cup-white' : CUPS[m % 3], x + (yaw === 90 ? 0.05 : 0.17) * (i % 2 ? -1 : 1), y, z + (yaw === 90 || yaw === -90 ? 0.19 : 0.02), kind === 'coffee' || kind === 'plates' ? 0.7 : 1);
  });
}
export interface TableOpts { top: string; kind: 'pedestal' | 'legs' | 'round' | 'high'; w?: number; d?: number; edge?: string; set?: Setting; n?: number }
export function table(b: MeshBuilder, f: Pose, o: TableOpts): number {
  const h = o.kind === 'high' ? 1.05 : 0.74;
  const [w, d] = [o.w ?? (o.kind === 'round' || o.kind === 'high' ? 0.7 : 0.7), o.d ?? 0.7];
  if (o.kind === 'round' || o.kind === 'high') {
    lathe(b, o.edge ?? CHROME, f, [[0.24, 0], [0.24, 0.02], [0.04, 0.05], [0.035, h - 0.04], [0.12, h - 0.03]], 12);
    lathe(b, o.top, move(f, 0, h - 0.03, 0), [[0.001, 0], [w / 2, 0], [w / 2, 0.03], [0.001, 0.031]], 20);
  } else {
    if (o.kind === 'pedestal') for (const x of w > 1 ? [-w / 2 + 0.3, w / 2 - 0.3] : [0]) {
      box(b, o.edge ?? BLACK, f, [x, 0.015, 0], [0.04, 0.015, Math.min(0.28, d / 2 - 0.08)]);
      box(b, o.edge ?? BLACK, f, [x, 0.015, 0], [0.2, 0.015, 0.04]);
      leg(b, o.edge ?? BLACK, f, x, 0, h - 0.03, 0.03);
    }
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(b, o.edge ?? CHROME, f, sx * (w / 2 - 0.05), sz * (d / 2 - 0.05), h - 0.03, 0.018);
    box(b, o.edge ?? CHROME, f, [0, h - 0.02, 0], [w / 2, 0.012, d / 2]);
    box(b, o.top, f, [0, h - 0.004, 0], [w / 2 - 0.006, 0.006, d / 2 - 0.006], 'd');
  }
  if (o.set) setting(b, f, h + 0.002, w, d, o.set, o.n ?? 0);
  return h;
}
/** A bench with a padded back, `w` long, seen from its front (+z). */
export function bench(b: MeshBuilder, f: Pose, w: number, mat: string, base = 'prop/wood-walnut', back = 1.1): void {
  box(b, base, f, [0, 0.2, -0.02], [w / 2, 0.2, 0.25]);
  box(b, mat, f, [0, 0.44, 0.02], [w / 2, 0.045, 0.27]);
  box(b, mat, f, [0, 0.48 + (back - 0.48) / 2, -0.24], [w / 2, (back - 0.48) / 2, 0.06]);
  box(b, base, f, [0, back / 2, -0.315], [w / 2 + 0.01, back / 2 + 0.01, 0.015]);
}
/** A booth: two benches facing over a table. Its long axis is z; it is `w` wide. */
export function booth(b: MeshBuilder, f: Pose, o: { mat: string; top: string; w?: number; set?: Setting; n?: number; base?: string }): void {
  const w = o.w ?? 1.15;
  bench(b, turn(move(f, 0, 0, -0.72), 0), w, o.mat, o.base);
  bench(b, turn(move(f, 0, 0, 0.72), 180), w, o.mat, o.base);
  table(b, turn(f, 90), { top: o.top, kind: 'pedestal', w: 0.72, d: w - 0.05, set: o.set, n: o.n });
}
/** A table with chairs round it. */
export function dineSet(b: MeshBuilder, f: Pose, o: { table: TableOpts; chair: ChairOpts; seats: number; n?: number; stoolMat?: string }): void {
  const n = o.n ?? 0;
  const h = table(b, f, { ...o.table, n });
  const [w, d] = [o.table.w ?? 0.7, o.table.d ?? 0.7];
  const spots: [number, number, number][] = o.table.kind === 'round' || o.table.kind === 'high'
    ? Array.from({ length: o.seats }, (_, i): [number, number, number] => { const a = (i / o.seats) * Math.PI * 2 + n; return [Math.sin(a) * (w / 2 + 0.25), Math.cos(a) * (w / 2 + 0.25), (a * 180) / Math.PI + 180]; })
    : o.seats <= 2 ? [[0, d / 2 + 0.22, 180], [0, -d / 2 - 0.22, 0]] : [[-w / 4, d / 2 + 0.22, 180], [w / 4, d / 2 + 0.22, 180], [-w / 4, -d / 2 - 0.22, 0], [w / 4, -d / 2 - 0.22, 0]];
  spots.forEach(([x, z, yaw], i) => {
    // Chairs are left as people leave them: a little askew, one pulled out.
    const j = ((n * 7 + i * 13) % 9) - 4;
    const out = (n + i) % 5 === 0 ? 0.18 : 0;
    const p = turn(move(f, x * (1 + out), 0, z * (1 + out)), yaw + j * 4);
    if (h > 0.9) stool(b, p, { mat: o.stoolMat ?? o.chair.mat, kind: 'pedestal' });
    else chair(b, p, o.chair);
  });
}

// --- The counter and what is behind it. ---
export function register(b: MeshBuilder, f: Pose): void {
  box(b, BLACK, f, [0, 0.04, 0], [0.17, 0.04, 0.16]);
  pipe(b, BLACK, [at(f, 0, 0.08, 0), at(f, 0, 0.26, -0.02)], 0.02, 6);
  const scr = move(f, 0, 0.3, -0.02);
  box(b, BLACK, scr, [0, 0, 0], [0.16, 0.13, 0.012]);
  part(b, turn(scr, 180), 'register', [0, 0, 0.014], 0.3, 0.24);
  part(b, scr, 'push', [0, 0, 0.014], 0.26, 0.09);
}
/** A counter `w` long with its tills, seen by the customer from +z. */
export function counter(b: MeshBuilder, f: Pose, w: number, front: string, top: string, tills = 2, n = 0): void {
  box(b, front, f, [0, 0.525, 0], [w / 2, 0.525, 0.33], 'yY');
  box(b, top, f, [0, 1.07, 0.02], [w / 2 + 0.02, 0.02, 0.38]);
  for (let i = 0; i < tills; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / tills;
    register(b, move(f, x, 1.09, -0.08));
    if ((n + i) % 2 === 0) lay(b, f, 'tray-empty', x + 0.45, 1.1, 0.12, 0.4, 0.3);
    else { cup(b, f, 'cup-red', x + 0.4, 1.09, 0.1); box(b, STEEL, f, [x + 0.55, 1.15, 0.05], [0.05, 0.06, 0.05]); }
  }
}
export type Machine = 'dispenser' | 'fryer' | 'oven' | 'fridge' | 'coffee' | 'shelf';
/** Kitchen equipment standing against a wall behind it, front to +z. Returns its width. */
export function machine(b: MeshBuilder, f: Pose, kind: Machine): number {
  if (kind === 'dispenser') {
    box(b, STEEL, f, [0, 0.45, 0], [0.6, 0.45, 0.32]);
    box(b, STEEL, f, [0, 1.25, -0.08], [0.58, 0.35, 0.22]);
    part(b, f, 'dispenser', [0, 1.25, 0.145], 1.16, 0.7);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) cup(b, f, CUPS[i], -0.4 + i * 0.12, 0.9 + k * 0.012, 0.2, 0.9);
    return 1.2;
  }
  if (kind === 'fryer' || kind === 'oven') {
    box(b, STEEL, f, [0, 0.45, 0], [0.4, 0.45, 0.35]);
    part(b, f, kind, [0, 0.45, 0.352], 0.8, 0.9);
    if (kind === 'fryer') { box(b, BLACK, f, [0, 0.905, 0], [0.36, 0.006, 0.3]); for (const x of [-0.18, 0.18]) pipe(b, CHROME, [at(f, x, 0.92, 0.1), at(f, x, 1.1, 0.34)], 0.012, 6); }
    else { box(b, BLACK, f, [0, 0.91, 0], [0.38, 0.01, 0.32]); box(b, STEEL, f, [0, 2.0, 0], [0.45, 0.18, 0.4]); }
    return 0.8;
  }
  if (kind === 'fridge') {
    box(b, STEEL, f, [0, 0.95, 0], [0.6, 0.95, 0.35]);
    part(b, f, 'fridge', [-0.3, 0.95, 0.352], 0.6, 1.86);
    part(b, f, 'fridge', [0.3, 0.95, 0.352], 0.6, 1.86);
    return 1.2;
  }
  if (kind === 'coffee') {
    box(b, STEEL, f, [0, 0.45, 0], [0.45, 0.45, 0.32]);
    box(b, BLACK, f, [0, 1.15, -0.05], [0.33, 0.25, 0.22]);
    part(b, f, 'coffee', [0, 1.15, 0.172], 0.66, 0.5);
    for (let i = 0; i < 4; i++) cup(b, f, 'cup-white', -0.2 + i * 0.09, 1.4, -0.05, 0.6);
    return 0.9;
  }
  box(b, STEEL, f, [0, 0.45, 0], [0.6, 0.45, 0.3]);
  for (const y of [1.2, 1.5]) { box(b, STEEL, f, [0, y, -0.1], [0.6, 0.012, 0.18]); part(b, f, 'shelf', [0, y + 0.07, -0.02], 1.16, 0.12); }
  for (const x of [-0.58, 0.58]) leg(b, STEEL, move(f, 0, 0.9, 0), x, 0.06, 0.62, 0.012);
  return 1.2;
}
/** A lit menu board hung flat against the wall behind `f`. */
export function menuBoard(b: MeshBuilder, f: Pose, tex: string, w = 3.2): void {
  const h = (w * 0.8) / 3.2;
  box(b, BLACK, f, [0, h / 2, 0.03], [w / 2 + 0.03, h / 2 + 0.03, 0.03]);
  face(b, tex, f, [0, h / 2, 0.062], w, h);
}
/** The bin customers empty their trays into, with trays left on top. */
export function trayBin(b: MeshBuilder, f: Pose, mat: string, n = 0, doors = 1): void {
  const w = 0.55 * doors;
  box(b, mat, f, [0, 0.55, 0], [w / 2, 0.55, 0.28]);
  for (let i = 0; i < doors; i++) part(b, f, n % 2 ? 'push' : 'thanks', [-w / 2 + 0.275 + i * 0.55, 0.82, 0.282], 0.42, 0.14);
  box(b, STEEL, f, [0, 1.105, 0], [w / 2 + 0.01, 0.006, 0.29]);
  for (let k = 0; k < 1 + (n % 4); k++) lay(b, f, 'tray-empty', ((k * 7) % 3) * 0.01, 1.115 + k * 0.014, 0, 0.4, 0.3, k * 7);
}
export function highChair(b: MeshBuilder, f: Pose, mat = 'prop/wood-oak'): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(b, mat, f, sx * 0.24, sz * 0.24, 0.72, 0.016, sx * 0.16, sz * 0.16);
  box(b, mat, f, [0, 0.56, 0], [0.17, 0.012, 0.17]);
  box(b, mat, f, [0, 0.72, -0.17], [0.17, 0.14, 0.012]);
  box(b, mat, f, [0, 0.74, 0.2], [0.2, 0.01, 0.08]);
  for (const sx of [-1, 1]) box(b, mat, f, [sx * 0.165, 0.7, 0.02], [0.01, 0.02, 0.18]);
}
/** A lamp hanging from the ceiling at `f`, `drop` below it. */
export function pendant(b: MeshBuilder, f: Pose, mat: string, kind: 'cone' | 'dome' | 'globe' | 'drum', drop = 0.8): void {
  pipe(b, BLACK, [at(f, 0, 0, 0), at(f, 0, -drop, 0)], 0.006, 4, false);
  const s = move(f, 0, -drop - 0.22, 0);
  if (kind === 'globe') { lathe(b, 'prop/light', s, [[0.001, 0], [0.09, 0.03], [0.13, 0.11], [0.09, 0.19], [0.001, 0.22]], 10); return; }
  lathe(b, mat, s, kind === 'cone' ? [[0.2, 0], [0.03, 0.2], [0.02, 0.22]] : kind === 'dome' ? [[0.19, 0], [0.18, 0.08], [0.11, 0.17], [0.02, 0.22]] : [[0.16, 0], [0.16, 0.2], [0.001, 0.2]], 12);
  lathe(b, 'prop/light', move(s, 0, 0.02, 0), [[0.001, 0], [0.06, 0.01], [0.06, 0.07], [0.001, 0.08]], 8);
}

// --- At the shop door. ---
/** A folding board on the pavement, its faces to +z and -z. */
export function aBoard(b: MeshBuilder, f: Pose, tex: string, frame: string, kind: 'a' | 'easel' | 'stand' = 'a'): void {
  if (kind === 'stand') {
    box(b, frame, f, [0, 0.02, 0], [0.22, 0.02, 0.18]);
    leg(b, frame, f, 0, 0, 0.75, 0.02);
    for (const s of [0, 180]) face(b, tex, turn(move(f, 0, 0.75, 0), s), [0, 0.3, 0.013], 0.4, 0.6);
    box(b, frame, f, [0, 1.05, 0], [0.21, 0.31, 0.012]);
    return;
  }
  for (const s of kind === 'easel' ? [0] : [0, 180]) {
    const p = turn(f, s);
    const lean: Pose = { o: at(p, 0, 0, 0.26), x: p.x, y: [p.y[0] * 0.96 - p.z[0] * 0.27, p.y[1] * 0.96 - p.z[1] * 0.27, p.y[2] * 0.96 - p.z[2] * 0.27], z: [p.z[0] * 0.96 + p.y[0] * 0.27, p.z[1] * 0.96 + p.y[1] * 0.27, p.z[2] * 0.96 + p.y[2] * 0.27] };
    box(b, frame, lean, [0, 0.5, -0.012], [0.31, 0.5, 0.012]);
    face(b, tex, lean, [0, 0.53, 0.002], 0.6, 0.9);
  }
  if (kind === 'easel') leg(b, frame, f, 0, -0.3, 0.95, 0.015, 0, 0);
}
export function nobori(b: MeshBuilder, f: Pose, tex: string, base = 'structure/wall-smooth'): void {
  box(b, base, f, [0, 0.06, 0], [0.2, 0.06, 0.2]);
  pipe(b, P('white'), [at(f, 0, 0.12, 0), at(f, 0, 2.6, 0)], 0.012, 6);
  pipe(b, P('white'), [at(f, 0, 2.55, 0), at(f, 0.62, 2.55, 0)], 0.008, 4);
  for (const s of [1, -1]) b.quad(tex, at(f, s > 0 ? 0.02 : 0.62, 0.75, 0), at(f, s > 0 ? 0.62 : 0.02, 0.75, 0.05 * s), at(f, s > 0 ? 0.62 : 0.02, 2.55, 0), at(f, s > 0 ? 0.02 : 0.62, 2.55, 0));
}
/** Crates or cartons stacked `cols` wide and up to `rows` high, some askew. */
export function stack(b: MeshBuilder, f: Pose, tex: string[], cols: number, rows: number, n = 0, size: V3 = [0.5, 0.3, 0.36]): void {
  for (let c = 0; c < cols; c++) {
    const high = Math.max(1, rows - ((n + c * 3) % 3));
    for (let r = 0; r < high; r++) {
      const p = turn(move(f, (c - (cols - 1) / 2) * (size[0] + 0.03), r * size[1], ((n + r) % 3) * 0.015), (((n * 5 + c * 7 + r * 3) % 7) - 3) * 2.5);
      const t = tex[(n + c + r * 2) % tex.length];
      for (let s = 0; s < 4; s++) face(b, t, turn(move(p, 0, size[1] / 2, 0), s * 90), [0, 0, s % 2 ? size[0] / 2 : size[2] / 2], s % 2 ? size[2] : size[0], size[1]);
      const top = t.includes('carton') ? t : BLACK;
      b.quad(top, at(p, -size[0] / 2, size[1] - (top === BLACK ? 0.03 : 0), size[2] / 2), at(p, size[0] / 2, size[1] - (top === BLACK ? 0.03 : 0), size[2] / 2), at(p, size[0] / 2, size[1] - (top === BLACK ? 0.03 : 0), -size[2] / 2), at(p, -size[0] / 2, size[1] - (top === BLACK ? 0.03 : 0), -size[2] / 2), [[0.02, 0.02], [0.2, 0.02], [0.2, 0.15], [0.02, 0.15]]);
    }
  }
}
export function ashtray(b: MeshBuilder, f: Pose, kind: 'post' | 'bin' | 'sand'): void {
  if (kind === 'post') { lathe(b, BLACK, f, [[0.14, 0], [0.14, 0.02], [0.03, 0.04], [0.03, 0.85], [0.07, 0.87], [0.07, 0.98], [0.001, 0.98]], 10); return; }
  if (kind === 'bin') { lathe(b, STEEL, f, [[0.15, 0], [0.15, 0.62], [0.17, 0.63], [0.17, 0.68], [0.001, 0.68]], 12); lathe(b, BLACK, move(f, 0, 0.68, 0), [[0.001, 0], [0.1, 0], [0.1, 0.004], [0.001, 0.005]], 10); return; }
  lathe(b, 'structure/wall-smooth', f, [[0.16, 0], [0.2, 0.5], [0.19, 0.52], [0.17, 0.5], [0.001, 0.5]], 12);
}
export function wetFloor(b: MeshBuilder, f: Pose): void {
  for (const s of [0, 180]) {
    const p = turn(f, s);
    const lean: Pose = { o: at(p, 0, 0, 0.14), x: p.x, y: [p.y[0] * 0.97 - p.z[0] * 0.22, p.y[1] * 0.97 - p.z[1] * 0.22, p.y[2] * 0.97 - p.z[2] * 0.22], z: [p.z[0] * 0.97 + p.y[0] * 0.22, p.z[1] * 0.97 + p.y[1] * 0.22, p.z[2] * 0.97 + p.y[2] * 0.22] };
    part(b, lean, 'wet-floor', [0, 0.32, 0], 0.3, 0.64);
    box(b, P('yellow'), lean, [0, 0.32, -0.006], [0.15, 0.32, 0.005]);
  }
}
export function mat(b: MeshBuilder, f: Pose, tex: string): void {
  box(b, BLACK, f, [0, 0.006, 0], [0.46, 0.006, 0.31]);
  face(b, tex, flat(move(f, 0, 0.014, 0)), [0, 0, 0], 0.9, 0.6);
}
export function parasol(b: MeshBuilder, f: Pose, cloth: string, r = 1.2, square = false): void {
  lathe(b, 'structure/wall-smooth', f, [[0.22, 0], [0.22, 0.07], [0.04, 0.09]], 10);
  pipe(b, P('white'), [at(f, 0, 0.08, 0), at(f, 0, 2.45, 0)], 0.02, 6);
  const n = square ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const [a0, a1] = [(i / n) * Math.PI * 2 + (square ? 0.785 : 0), ((i + 1) / n) * Math.PI * 2 + (square ? 0.785 : 0)];
    const rr = square ? r * 1.25 : r;
    const [p0, p1, top] = [at(f, Math.cos(a0) * rr, 2.05, Math.sin(a0) * rr), at(f, Math.cos(a1) * rr, 2.05, Math.sin(a1) * rr), at(f, 0, 2.5, 0)];
    b.tri(cloth, p1, p0, top, [[0, 0], [1, 0], [0.5, 1]]);
    b.tri(cloth, p0, p1, top, [[1, 0], [0, 0], [0.5, 1]]);
    b.quad(cloth, [p1[0], p1[1] - 0.14, p1[2]], [p0[0], p0[1] - 0.14, p0[2]], p0, p1, [[0, 0], [1, 0], [1, 0.14], [0, 0.14]]);
    b.quad(cloth, [p0[0], p0[1] - 0.14, p0[2]], [p1[0], p1[1] - 0.14, p1[2]], p1, p0, [[1, 0], [0, 0], [0, 0.14], [1, 0.14]]);
  }
}
export function keg(b: MeshBuilder, f: Pose, mat = STEEL): void {
  lathe(b, mat, f, [[0.001, 0.02], [0.17, 0.02], [0.19, 0], [0.2, 0.03], [0.21, 0.15], [0.2, 0.3], [0.21, 0.45], [0.2, 0.57], [0.19, 0.6], [0.17, 0.58], [0.001, 0.58]], 12);
}
export function gasBottle(b: MeshBuilder, f: Pose, mat: string): void {
  lathe(b, mat, f, [[0.001, 0], [0.15, 0], [0.16, 0.03], [0.16, 0.95], [0.12, 1.08], [0.05, 1.12], [0.05, 1.2], [0.001, 1.2]], 12);
  lathe(b, mat, move(f, 0, 1.1, 0), [[0.09, 0], [0.09, 0.16], [0.08, 0.16], [0.08, 0]], 10);
}
export function mopBucket(b: MeshBuilder, f: Pose): void {
  lathe(b, P('yellow'), f, [[0.16, 0.06], [0.2, 0.4], [0.19, 0.4], [0.15, 0.08], [0.001, 0.08]], 4);
  pipe(b, 'prop/wood-pine', [at(f, 0.05, 0.1, 0.02), at(f, -0.2, 1.35, 0.25)], 0.014, 6);
  box(b, P('grey'), f, [0.06, 0.1, 0.02], [0.1, 0.03, 0.06]);
}

const CHAIRS: [string, string, ChairOpts][] = [
  ['shell-red', '樹脂シェル 赤', { kind: 'shell', mat: P('red') }], ['shell-yellow', '樹脂シェル 黄', { kind: 'shell', mat: P('yellow') }], ['shell-white', '樹脂シェル 白', { kind: 'shell', mat: P('white') }],
  ['shell-orange', '樹脂シェル 橙', { kind: 'shell', mat: P('orange') }], ['shell-teal', '樹脂シェル 青緑・黒脚', { kind: 'shell', mat: P('teal'), frame: BLACK }], ['shell-black', '樹脂シェル 黒', { kind: 'shell', mat: BLACK }],
  ['bistro-chrome', 'ビストロ 銀', { kind: 'bistro', mat: CHROME }], ['bistro-black', 'ビストロ 黒', { kind: 'bistro', mat: BLACK, frame: BLACK }], ['bistro-green', 'ビストロ 緑', { kind: 'bistro', mat: P('green'), frame: P('green') }],
  ['wood-oak', '木 オーク', { kind: 'wood', mat: 'prop/wood-oak', frame: 'prop/wood-oak' }], ['wood-walnut', '木 ウォルナット', { kind: 'wood', mat: 'prop/wood-walnut', frame: 'prop/wood-walnut' }],
  ['pad-red', 'ビニール座 赤', { kind: 'pad', mat: 'prop/vinyl-red' }], ['pad-teal', 'ビニール座 青緑', { kind: 'pad', mat: 'prop/vinyl-teal' }], ['pad-black', 'ビニール座 黒・黒脚', { kind: 'pad', mat: 'prop/vinyl-black', frame: BLACK }],
  ['stack-white', '重ねた椅子 白', { kind: 'stack', mat: P('white') }], ['stack-green', '重ねた椅子 緑', { kind: 'stack', mat: P('green') }],
];
export const CHAIR = Object.fromEntries(CHAIRS.map(([id, , o]) => [id, o])) as Record<string, ChairOpts>;
const SETS: [string, string, { table: TableOpts; chair: string; seats: number; shade?: string; square?: boolean }][] = [
  ['bistro-2', 'ビストロ 2席', { table: { top: 'prop/laminate-white', kind: 'round', w: 0.6 }, chair: 'bistro-chrome', seats: 2 }],
  ['bistro-3-black', 'ビストロ 3席・黒', { table: { top: 'prop/laminate-black', kind: 'round', edge: BLACK }, chair: 'bistro-black', seats: 3 }],
  ['bistro-2-green', 'ビストロ 2席・緑', { table: { top: P('green'), kind: 'round', w: 0.6, edge: P('green') }, chair: 'bistro-green', seats: 2 }],
  ['wood-4', '木 4席', { table: { top: 'prop/wood-oak', kind: 'legs', w: 1.2, d: 0.75, edge: 'prop/wood-oak' }, chair: 'wood-oak', seats: 4 }],
  ['wood-2', '木 2席', { table: { top: 'prop/wood-walnut', kind: 'legs', edge: 'prop/wood-walnut' }, chair: 'wood-walnut', seats: 2 }],
  ['plastic-4', '樹脂 4席', { table: { top: P('white'), kind: 'round', w: 0.9, edge: P('white') }, chair: 'shell-white', seats: 4 }],
  ['parasol-red', 'パラソルつき 赤', { table: { top: 'prop/laminate-white', kind: 'round', w: 0.9 }, chair: 'bistro-chrome', seats: 4, shade: 'trim/awning-red' }],
  ['parasol-green', 'パラソルつき 緑', { table: { top: 'prop/wood-oak', kind: 'round', w: 0.9, edge: BLACK }, chair: 'wood-oak', seats: 3, shade: 'trim/awning-green', square: true }],
  ['parasol-cream', 'パラソルつき 生成り', { table: { top: 'prop/laminate-grey', kind: 'round', w: 0.8, edge: BLACK }, chair: 'bistro-black', seats: 4, shade: 'trim/awning-tan', square: true }],
  ['parasol-blue', 'パラソルつき 青', { table: { top: P('white'), kind: 'round', w: 0.9, edge: P('white') }, chair: 'shell-white', seats: 4, shade: 'trim/awning-stripe-blue' }],
  ['high-2', '立ち飲みテーブル', { table: { top: 'prop/laminate-black', kind: 'high', w: 0.6 }, chair: 'pad-black', seats: 2 }],
];
const BOARD_IDS = ['coffee', 'lunch', 'open', 'sale', 'pizza', 'happy', 'donut', 'ramen', 'burger', 'barber', 'flowers', 'books'];
const SETTINGS: Setting[] = ['tray', 'plates', 'condiments', 'pizza', 'noodle', 'coffee'];

export function addProps(add: (id: string, label: string, fn: (b: MeshBuilder) => void) => void): void {
  const O = stand();
  for (const [id, label, o] of CHAIRS) add(`chair-${id}`, `椅子 ${label}`, (b) => chair(b, O, o));
  for (const [c, l] of [['red', '赤'], ['teal', '青緑'], ['black', '黒'], ['cream', 'クリーム']] as const) add(`stool-${c}`, `カウンター椅子 ${l}`, (b) => stool(b, O, { mat: `prop/vinyl-${c}`, kind: 'pedestal' }));
  add('stool-wood', '木のスツール', (b) => stool(b, O, { mat: 'prop/wood-oak', kind: 'legs' }));
  add('stool-low', '低いスツール', (b) => stool(b, O, { mat: 'prop/vinyl-orange', kind: 'low' }));
  const tops = ['laminate-white', 'laminate-grey', 'laminate-red', 'laminate-cream', 'laminate-teal', 'wood-oak'];
  tops.forEach((t, i) => add(`table-${t}`, `2人卓 ${t}`, (b) => { table(b, O, { top: `prop/${t}`, kind: i % 2 ? 'legs' : 'pedestal', set: SETTINGS[i % 6], n: i }); }));
  tops.slice(0, 4).forEach((t, i) => add(`table-4-${t}`, `4人卓 ${t}`, (b) => { table(b, O, { top: `prop/${t}`, kind: 'pedestal', w: 1.2, d: 0.75, set: SETTINGS[(i + 1) % 6], n: i + 3 }); }));
  add('table-round', '丸テーブル', (b) => { table(b, O, { top: 'prop/laminate-white', kind: 'round', set: 'coffee', n: 1 }); });
  add('table-high', '立ち席テーブル', (b) => { table(b, O, { top: 'prop/laminate-black', kind: 'high', set: 'condiments' }); });
  ['red', 'teal', 'brown', 'cream', 'black', 'orange', 'green'].forEach((c, i) => add(`booth-${c}`, `ボックス席 ${c}`, (b) => booth(b, O, { mat: `prop/vinyl-${c}`, top: `prop/${tops[i % 5]}`, set: SETTINGS[i % 6], n: i })));
  SETTINGS.forEach((s, i) => add(`setting-${s}`, `卓上 ${s}`, (b) => { box(b, 'prop/laminate-white', O, [0, -0.01, 0], [0.6, 0.01, 0.4]); setting(b, O, 0, 1.2, 0.8, s, i + 1); }));
  ['red', 'wood', 'steel', 'teal', 'yellow', 'green', 'black'].forEach((c, i) => add(`counter-${c}`, `注文カウンター ${c}`, (b) => counter(b, O, 3.6, `prop/counter-${c}`, i % 2 ? STEEL : 'prop/laminate-white', 2 + (i % 2), i)));
  for (const [k, l] of [['dispenser', 'ドリンク機'], ['fryer', 'フライヤー'], ['oven', 'オーブン'], ['fridge', '冷蔵庫'], ['coffee', 'コーヒーマシン'], ['shelf', '保温棚']] as const) add(`kitchen-${k}`, `厨房 ${l}`, (b) => { machine(b, O, k); });
  for (const m of ['burger', 'taco', 'donut', 'pizza', 'noodle', 'diner', 'coffee', 'chicken']) add(`menu-${m}`, `メニュー板 ${m}`, (b) => menuBoard(b, stand([0, 2.1, 0]), `prop/menu-${m}`));
  ['wood-walnut', 'plastic-red', 'steel', 'plastic-teal', 'wood-oak'].forEach((m, i) => add(`traybin-${m}`, `返却口つきゴミ箱 ${m}`, (b) => trayBin(b, O, `prop/${m}`, i, 1 + (i % 2))));
  add('highchair', '子ども椅子', (b) => highChair(b, O));
  add('highchair-walnut', '子ども椅子 濃色', (b) => highChair(b, O, 'prop/wood-walnut'));
  for (const [k, c] of [['cone', 'red'], ['dome', 'black'], ['globe', 'white'], ['drum', 'cream'], ['cone', 'green'], ['dome', 'yellow']] as const) add(`pendant-${k}-${c}`, `吊り照明 ${k} ${c}`, (b) => pendant(b, stand([0, 2.6, 0]), P(c), k));
  BOARD_IDS.forEach((id, i) => add(`board-${id}`, `立て看板 ${id}`, (b) => aBoard(b, O, `prop/board-${id}`, i % 3 === 0 ? 'prop/wood-oak' : i % 3 === 1 ? BLACK : P('white'), i % 5 === 3 ? 'easel' : i % 5 === 4 ? 'stand' : 'a')));
  for (const c of ['red', 'blue', 'yellow', 'green', 'orange', 'white']) add(`flag-${c}`, `のぼり旗 ${c}`, (b) => nobori(b, O, `prop/flag-${c}`));
  for (const [id, label, s] of SETS) add(`set-${id}`, `外の席 ${label}`, (b) => { dineSet(b, O, { table: { ...s.table, set: s.table.kind === 'high' ? 'none' : 'coffee' }, chair: CHAIR[s.chair], seats: s.seats, n: id.length }); if (s.shade) parasol(b, O, s.shade, 1.25, s.square); });
  const crates = ['yellow', 'red', 'green', 'blue', 'grey', 'black'].map((c) => `prop/crate-${c}`);
  crates.forEach((c, i) => add(`crates-${c.slice(11)}`, `通い箱の山 ${c.slice(11)}`, (b) => stack(b, O, [c, crates[(i + 4) % 6]], 1 + (i % 3), 2 + (i % 3), i)));
  add('crates-mixed', '通い箱の山 混在', (b) => stack(b, O, crates, 3, 4, 2));
  const cartons = ['plain', 'fragile', 'produce', 'tape'].map((c) => `prop/carton-${c}`);
  cartons.forEach((c, i) => add(`cartons-${c.slice(12)}`, `段ボールの山 ${c.slice(12)}`, (b) => stack(b, O, [c, cartons[(i + 1) % 4]], 1 + (i % 2), 2 + (i % 2), i + 1, [0.5, 0.4, 0.4])));
  for (const k of ['post', 'bin', 'sand'] as const) add(`ashtray-${k}`, `灰皿 ${k}`, (b) => ashtray(b, O, k));
  for (const m of ['welcome', 'rubber', 'red', 'green']) add(`mat-${m}`, `玄関マット ${m}`, (b) => mat(b, O, `prop/mat-${m}`));
  add('wet-floor', '清掃中の立て札', (b) => wetFloor(b, O));
  add('keg', 'ビール樽', (b) => keg(b, O));
  add('keg-pair', 'ビール樽 2本', (b) => { keg(b, stand([-0.22, 0, 0])); keg(b, stand([0.22, 0, 0.05])); keg(b, stand([0, 0.6, 0.02])); });
  add('gas-grey', 'ガスボンベ 灰', (b) => gasBottle(b, O, P('grey')));
  add('gas-pair', 'ガスボンベ 2本', (b) => { gasBottle(b, stand([-0.18, 0, 0]), P('grey')); gasBottle(b, stand([0.18, 0, 0]), P('orange')); });
  add('mop-bucket', 'モップとバケツ', (b) => mopBucket(b, O));
  for (const [c, sq] of [['red', false], ['green', true], ['tan', true], ['stripe-blue', false], ['yellow', false], ['stripe-red', false]] as const) add(`parasol-${c}`, `パラソル ${c}`, (b) => parasol(b, O, `trim/awning-${c}`, 1.25, sq));
}
