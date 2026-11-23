import { MeshBuilder } from './builder';
import { Opening, sides, slab, wall, weathering } from './buildkit';
import { at, box, face, move, stand, turn } from './kit';
import { PROP_PARTS } from '../tex';
import { CHAIR, Machine, Setting, booth, counter, dineSet, highChair, machine, mat, menuBoard, pendant, stool, trayBin, wetFloor } from './props';

/** How a restaurant is fitted out inside. */
export interface Inside {
  /** `deep`: a counter across the back with the kitchen behind a wall. `diner`: one long room with a counter and stools along the back. */
  plan: 'deep' | 'diner';
  /** Colour of the frames of the glazing. */
  frame: string;
  floor: string;
  wall: string;
  counter: string;
  counterTop: string;
  menu: string;
  vinyl: string;
  top: string;
  chair: string;
  stool: string;
  lamp: ['cone' | 'dome' | 'globe' | 'drum', string];
  set: Setting;
  posters: string[];
  machines: Machine[];
  bin: string;
  /** Along the walls: 0 booths both sides, 1 booths and a bar at the window, 2 small tables. */
  seating: 0 | 1 | 2;
}
export interface Room { seed: number; w: number; d: number; h: number; lift: number; dw: number; in: Inside }

/** Thickness of the walls, as the room sees them. */
export const T_IN = 0.14;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** The measures every part of the room is set out from. */
export function roomPlan(r: Room): { X: number; zf: number; zk: number; ceil: number; cw: number; zc: number } {
  const deep = r.in.plan === 'deep';
  const X = r.w / 2 - T_IN;
  const zk = deep ? -r.d / 2 + clamp(r.d * 0.3, 3.6, 5.2) : -r.d / 2 + T_IN;
  return { X, zf: r.d / 2 - T_IN, zk, ceil: r.lift + Math.min(2.9, r.h - r.lift - 0.2), cw: deep ? clamp(r.w - 4.6, 3.2, 6.6) : 2 * X - 4.8, zc: zk + (deep ? 2.05 : 1.98) };
}

/** The room itself, as part of the building: its walls with the same windows in them, the floor, the ceiling and its lights. */
export function roomShell(b: MeshBuilder, r: Room, holes: Opening[][]): void {
  const p = roomPlan(r);
  const H = p.ceil - r.lift;
  weathering(b, 0, r.seed);
  sides(0, 0, r.w, r.d, r.lift).forEach((s, i) => {
    if (i === 2 && r.in.plan === 'deep') return;
    const hs = (holes[i] ?? []).filter((o) => o.tex.startsWith('prop/glass') || (i === 0 && o.tex.startsWith('door/'))).map((o): Opening => ({ x: s.w - o.x - o.w, y: o.y - r.lift, w: o.w, h: o.h, tex: o.tex, v: 0, depth: 0.03 }));
    wall(b, r.in.wall, turn(move(s.f, s.w, 0, -T_IN), 180), s.w, H, hs);
  });
  if (r.in.plan === 'deep') {
    wall(b, r.in.wall, stand([-p.X, r.lift, p.zk]), 2 * p.X, H);
    face(b, 'door/steel-brown', stand([-(p.cw / 2 + p.X) / 2, r.lift, p.zk + 0.02]), [0, 1.05, 0], 0.9, 2.1);
  } else for (const sx of [-1, 1]) face(b, sx < 0 ? 'door/steel-brown' : 'door/steel-grey', stand([sx * (p.X - 0.9), r.lift, p.zk + 0.02]), [0, 1.05, 0], 0.9, 2.1);
  slab(b, r.in.floor, r.lift + 0.012, -p.X, p.zk, p.X, p.zf);
  b.quad('prop/ceiling', [-p.X, p.ceil, p.zk], [p.X, p.ceil, p.zk], [p.X, p.ceil, p.zf], [-p.X, p.ceil, p.zf], [[-p.X, p.zk], [p.X, p.zk], [p.X, p.zf], [-p.X, p.zf]]);
  const [nx, nz] = [Math.max(2, Math.round((2 * p.X) / 2.6)), Math.max(2, Math.round((p.zf - p.zk) / 2.6))];
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const [x, z] = [-p.X + ((i + 0.5) * 2 * p.X) / nx, p.zk + ((k + 0.5) * (p.zf - p.zk)) / nz];
      b.quad('prop/light', [x - 0.6, p.ceil - 0.012, z - 0.3], [x + 0.6, p.ceil - 0.012, z - 0.3], [x + 0.6, p.ceil - 0.012, z + 0.3], [x - 0.6, p.ceil - 0.012, z + 0.3], [[0, 0], [0.6, 0], [0.6, 0.6], [0, 0.6]]);
    }
}

/** A poster in its frame on the wall behind `f`. */
function poster(b: MeshBuilder, f: ReturnType<typeof stand>, tex: string): void {
  box(b, 'prop/plastic-black', f, [0, 0, 0.008], [0.33, 0.48, 0.008]);
  face(b, tex, f, [0, 0, 0.018], 0.6, 0.9);
}

/** Everything that stands in the room: the counter, the kitchen line, the seats and what is left on the tables. */
export function furnish(b: MeshBuilder, r: Room): void {
  const p = roomPlan(r);
  const s = r.in;
  const F = stand([0, r.lift + 0.012, 0]);
  const H = p.ceil - r.lift - 0.012;
  const n = r.seed;
  const lamp = (x: number, z: number): void => pendant(b, move(F, x, H, z), `prop/plastic-${s.lamp[1]}`, s.lamp[0], 0.55);
  const seats = CHAIR[s.chair];
  const set4 = (x: number, z: number, k: number): void => {
    if (k % 5 === 0) dineSet(b, turn(move(F, x, 0, z), (k % 3) * 30), { table: { top: s.top, kind: 'round', w: 0.75, set: s.set === 'tray' ? 'tray' : 'coffee' }, chair: seats, seats: 2 + (k % 2), n: k });
    else dineSet(b, move(F, x, 0, z), { table: { top: s.top, kind: 'pedestal', w: 1.2, d: 0.75, set: k % 4 === 1 ? 'condiments' : s.set }, chair: seats, seats: 4, n: k });
  };
  const set2 = (x: number, z: number, k: number, yaw = 0): void => dineSet(b, turn(move(F, x, 0, z), yaw), { table: { top: s.top, kind: k % 2 ? 'pedestal' : 'legs', set: k % 3 === 0 ? 'condiments' : s.set }, chair: seats, seats: 2, n: k });
  // The line of machines against the back, and the menu above it.
  const line = (x0: number, x1: number, z: number, kinds: Machine[]): void => {
    let x = x0;
    for (let i = 0; i < 12; i++) {
      const kind = kinds[i % kinds.length];
      const wd = kind === 'fryer' || kind === 'oven' ? 0.8 : kind === 'coffee' ? 0.9 : 1.2;
      if (x + wd > x1) break;
      machine(b, move(F, x + wd / 2, 0, z + 0.37), kind);
      x += wd + 0.04;
    }
  };
  const ends = (x0: number, x1: number): void => {
    // The counter turns back to the wall at both ends and shuts the staff in.
    for (const x of [x0 + 0.33, x1 - 0.33]) {
      const len = p.zc - 0.33 - p.zk;
      box(b, s.counter, turn(move(F, x, 0, p.zk + len / 2), x < 0 ? -90 : 90), [0, 0.525, 0], [len / 2, 0.525, 0.33], 'yY');
      box(b, s.counterTop, F, [x, 1.07, p.zk + len / 2], [0.36, 0.02, len / 2]);
    }
  };
  mat(b, move(F, 0, 0, p.zf - 0.75), n % 2 ? 'prop/mat-rubber' : 'prop/mat-welcome');
  if (s.plan === 'deep') {
    const hw = p.cw / 2;
    line(-hw + 0.7, hw - 0.7, p.zk, s.machines);
    const boards = p.cw > 6.2 ? 2 : 1;
    const bw = Math.min(3.2, (p.cw - 0.3) / boards);
    for (let i = 0; i < boards; i++) menuBoard(b, move(F, (i - (boards - 1) / 2) * (bw + 0.1), 2.03, p.zk), s.menu, bw);
    counter(b, move(F, 0, 0, p.zc), p.cw, s.counter, s.counterTop, p.cw > 4.6 ? 3 : 2, n);
    ends(-hw, hw);
    // Beside the counter: the bins on one side, the way to the toilets on the other.
    const side = (p.X + hw) / 2;
    trayBin(b, move(F, side, 0, p.zk + 0.3), s.bin, n, p.X - hw > 1.6 ? 2 : 1);
    poster(b, move(F, side, 1.75, p.zk), s.posters[0]);
    if (p.X - hw > 2.1) poster(b, move(F, -side - 0.95, 1.5, p.zk), s.posters[1 % s.posters.length]);
    if (n % 2) wetFloor(b, turn(move(F, -side + 0.2, 0, p.zk + 1.3), 25));
    highChair(b, turn(move(F, -p.X + 0.4, 0, p.zk + 0.4), 20));
    if (n % 3 === 0) highChair(b, turn(move(F, -p.X + 0.95, 0, p.zk + 0.4), -10), 'prop/wood-walnut');
    // Along the walls.
    const back = p.zc + 0.6;
    const wallSeat = (sx: number, kind: 0 | 1 | 2): number => {
      if (kind === 0) {
        for (let z = p.zf - 1.2, i = 0; z - 1.05 > back; z -= 2.12, i++) {
          booth(b, move(F, sx * (p.X - 0.6), 0, z), { mat: s.vinyl, top: s.top, set: (i + n) % 4 === 0 ? 'condiments' : s.set, n: n + i * 3 + (sx > 0 ? 1 : 0) });
          lamp(sx * (p.X - 0.6), z);
        }
        return 1.2;
      }
      if (kind === 1) {
        // A bar at the window with stools.
        const [z0, z1] = [back + 0.2, p.zf - 0.5];
        box(b, s.top, F, [sx * (p.X - 0.22), 1.03, (z0 + z1) / 2], [0.2, 0.02, (z1 - z0) / 2]);
        for (let z = z0 + 0.4, i = 0; z < z1 - 0.2; z += 0.68, i++) {
          if ((i + n) % 7 !== 3) stool(b, turn(move(F, sx * (p.X - 0.62 - ((i * 5 + n) % 3) * 0.04), 0, z), i * 40), { mat: s.stool, kind: 'pedestal' });
          if (i % 4 === 1) box(b, 'prop/steel', F, [sx * (p.X - 0.08), 0.5, z + 0.34], [0.02, 0.52, 0.02]);
        }
        return 0.95;
      }
      for (let z = p.zf - 1.3, i = 0; z - 0.8 > back; z -= 1.95, i++) set2(sx * (p.X - 0.4), z, n + i * 2 + (sx > 0 ? 1 : 0));
      return 0.8;
    };
    const used = [wallSeat(1, s.seating === 2 ? 2 : 0), wallSeat(-1, s.seating)];
    // Down the middle, clear of the way from the door to the counter.
    const z0 = p.zc + 0.4 + 1.7;
    [1, -1].forEach((sx, q) => {
      const [xin, xout] = [0.95, p.X - used[q] - 0.85];
      const room = xout - xin;
      const cols = room >= 3.5 ? [xin + 0.65, xout - 0.65] : room >= 1.4 ? [(xin + xout) / 2] : room >= 0.75 ? [(xin + xout) / 2] : [];
      cols.forEach((x, c) => {
        for (let z = p.zf - 1.35 - (c % 2) * 0.4, i = 0; z - 0.9 > z0; z -= 2.4, i++) {
          const k = n + i * 3 + c * 5 + q * 7;
          if (room >= 1.4) set4(sx * x, z, k);
          else set2(sx * x, z, k);
        }
      });
    });
    return;
  }
  // The diner: machines along the back wall, the counter and its stools, booths under the front windows.
  const [x0, x1] = [-p.X + 2.4, p.X - 2.4];
  line(x0 + 0.5, x1 - 0.5, p.zk, s.machines);
  const boards = Math.max(1, Math.floor((x1 - x0 - 2.6) / 3.4));
  for (let i = 0; i < boards; i++) menuBoard(b, move(F, (i - (boards - 1) / 2) * 3.4, 1.98, p.zk), s.menu, 3.2 * Math.min(1, (H - 2.0) / 0.82));
  counter(b, move(F, 0, 0, p.zc), x1 - x0, s.counter, s.counterTop, 1, n);
  ends(x0, x1);
  for (let x = x0 + 0.55, i = 0; x < x1 - 0.3; x += 0.72, i++) stool(b, turn(move(F, x, 0, p.zc + 0.62), i * 50), { mat: s.stool, kind: 'pedestal' });
  // What the counter is laid with: a place here and there, and the sauces.
  for (let x = x0 + 1.6, i = 0; x < x1 - 0.8; x += 2.16, i++) {
    const c = move(F, x, 1.092, p.zc + 0.12);
    box(b, 'prop/steel', c, [0, 0.06, -0.2], [0.06, 0.06, 0.035]);
    face(b, 'prop/parts', { o: at(c, (i % 2 ? -0.4 : 0.4), 0.004, 0), x: c.x, y: [-c.z[0], -c.z[1], -c.z[2]], z: c.y }, [0, 0, 0], 0.27, 0.27, PLATE[(i + n) % PLATE.length]);
  }
  for (const sx of [-1, 1])
    for (let x = r.dw / 2 + 0.75 + 1.05, i = 0; x + 1.05 < p.X - 0.05; x += 2.12, i++) {
      booth(b, turn(move(F, sx * x, 0, p.zf - 0.6), 90), { mat: s.vinyl, top: s.top, set: (i + n) % 3 === 0 ? 'condiments' : s.set, n: n + i * 3 + (sx > 0 ? 2 : 0) });
      lamp(sx * x, p.zf - 0.6);
    }
  // At the two ends of the room, by the side windows.
  set2(-p.X + 1.15, p.zk + 1.7, n + 1, 90);
  if (s.seating !== 2) set2(p.X - 1.15, p.zk + 1.7, n + 2, 90);
  else highChair(b, turn(move(F, p.X - 0.5, 0, p.zk + 1.4), -70));
  poster(b, move(F, -p.X + 2.0, 1.6, p.zk), s.posters[0]);
  poster(b, move(F, p.X - 2.0, 1.6, p.zk), s.posters[1 % s.posters.length]);
}
const PLATE = (['plate-pancake', 'plate-breakfast', 'plate-empty', 'plate-donut'] as const).map((k) => { const q = PROP_PARTS[k]; return [q[0], q[1], q[2], q[3]] as [number, number, number, number]; });
