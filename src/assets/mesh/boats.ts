import { MeshBuilder, V3 } from './builder';
import { S, spaced } from './boundaries';
import { sheet } from './buildkit';
import { Pose, at, box, face, lathe, move, pipe, plate, roll, tilt, turn } from './kit';
import { ball, cyl, hash, ladder, torus } from './marine';

const ALU = 'trim/paint-aluminium';
const WHITE = 'trim/paint-white';

export interface HutOpts {
  wall: string;
  roof: string;
  /** Ridge height above the eaves; 0 gives a flat roof. */
  rise?: number;
  over?: number;
  door?: string;
  /** Window texture and how many metres of it to show per window. */
  win?: string;
  winU?: number;
  wins?: number;
  trim?: string;
  sign?: string;
}
/** Small rectangular building centred on the pose with its door on the +z side and the ridge along x. */
export function hut(b: MeshBuilder, f: Pose, w: number, d: number, h: number, o: HutOpts): void {
  box(b, o.wall, f, [0, h / 2, 0], [w / 2, h / 2, d / 2], 'yY');
  const [rise, ov] = [o.rise ?? 0.8, o.over ?? 0.3];
  const trim = o.trim ?? WHITE;
  if (rise > 0) {
    const [ex, ez] = [w / 2 + ov, d / 2 + ov];
    const drop = (rise * ov) / (d / 2);
    for (const sz of [-1, 1]) {
      sheet(b, o.roof, at(f, -ex * sz, h - drop, ez * sz), at(f, ex * sz, h - drop, ez * sz), at(f, ex * sz, h + rise, 0), at(f, -ex * sz, h + rise, 0), [[0, 0], [2 * ex, 0], [2 * ex, Math.hypot(ez, rise + drop)], [0, Math.hypot(ez, rise + drop)]]);
      box(b, trim, f, [0, h - drop - 0.02, sz * ez], [ex, 0.07, 0.02]);
    }
    for (const sx of [-1, 1]) {
      const P = (z: number, y: number): V3 => at(f, (sx * w) / 2, y, z);
      b.tri(o.wall, P((-sx * d) / 2, h), P((sx * d) / 2, h), P(0, h + rise), [[0, 0], [d, 0], [d / 2, rise]]);
    }
  } else {
    box(b, trim, f, [0, h + 0.06, 0], [w / 2 + ov, 0.06, d / 2 + ov]);
    b.quadUp(o.roof, at(f, -w / 2 - ov, h + 0.125, d / 2 + ov), at(f, w / 2 + ov, h + 0.125, d / 2 + ov), at(f, w / 2 + ov, h + 0.125, -d / 2 - ov), at(f, -w / 2 - ov, h + 0.125, -d / 2 - ov));
  }
  const wins = o.wins ?? 1;
  const dx = o.door ? -w / 2 + 0.75 : -9;
  if (o.door) face(b, o.door, f, [dx, 1.05, d / 2 + 0.012], 0.9, 2.1);
  if (o.win) {
    const u = o.winU ?? 1.2;
    const mh = b.part(o.win).mh;
    const x0 = o.door ? dx + 0.75 : -w / 2 + 0.3;
    for (let i = 0; i < wins; i++) {
      const x = x0 + ((w / 2 - 0.3 - x0) * (i + 0.5)) / wins;
      face(b, o.win, f, [x, Math.min(h - 0.25 - mh * 0.4, 1.5), d / 2 + 0.012], u * 0.8, mh * 0.8, [0, 0, u, mh]);
    }
    face(b, o.win, turn(f, 90), [0, Math.min(h - 0.25 - mh * 0.4, 1.5), w / 2 + 0.012], u * 0.8, mh * 0.8, [0, 0, u, mh]);
  }
  if (o.sign) plate(b, o.sign, f, [0, h + (rise > 0 ? 0.05 : 0.5), d / 2 + ov + 0.03]);
}

export interface HullOpts {
  len: number;
  beam: number;
  free: number;
  draft: number;
  /** Extra height of the sheer at the bow. */
  sheer?: number;
  /** Fraction of the length (from the stern) where the bow starts to narrow. */
  bowQ?: number;
  /** Width of the transom as a share of the beam. */
  transom?: number;
  rake?: number;
  side: string;
  bottom?: string;
  /** Deck finish, or null for an open boat lined with `inside`. */
  deck?: string | null;
  inside?: string;
  rub?: string | null;
}
export interface Hull {
  x: (q: number) => number;
  hb: (q: number) => number;
  sheer: (q: number) => number;
}
/** Lofted boat hull centred on the pose, bow towards +x, floating with its waterline at y = 0. */
export function hull(b: MeshBuilder, f: Pose, o: HullOpts): Hull {
  const n = 12;
  const [bowQ, tr, rake] = [o.bowQ ?? 0.45, o.transom ?? 0.8, o.rake ?? o.len * 0.06];
  const hb = (q: number): number => (o.beam / 2) * (q <= bowQ ? tr + (1 - tr) * (q / bowQ) ** 0.7 : 1 - ((q - bowQ) / (1 - bowQ)) ** 2.2);
  const sheer = (q: number): number => o.free + (o.sheer ?? 0) * q * q;
  const kd = (q: number): number => o.draft * (1 - 0.8 * Math.max(0, (q - 0.6) / 0.4) ** 2);
  const X = (q: number, lvl = 1): number => -o.len / 2 + o.len * q - rake * (1 - lvl) * q ** 3;
  const sec = (q: number): [number, number, number][] => {
    const w = hb(q);
    return [[X(q, 0), -kd(q), 0], [X(q, 0.3), -kd(q) * 0.55, w * 0.7], [X(q, 0.6), 0, w * 0.93], [X(q, 1), sheer(q), w]];
  };
  const bottom = o.bottom ?? S('hull-antifoul');
  const P = (p: [number, number, number], sz: number): V3 => at(f, p[0], p[1], p[2] * sz);
  const rails: V3[][] = [[], []];
  for (let i = 0; i < n; i++) {
    const [a, c] = [sec(i / n), sec((i + 1) / n)];
    for (const sz of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const mat = k < 2 ? bottom : o.side;
        const q = [P(a[k], sz), P(c[k], sz), P(c[k + 1], sz), P(a[k + 1], sz)];
        const uv: [number, number][] = [[a[k][0], k * 0.5], [c[k][0], k * 0.5], [c[k + 1][0], k * 0.5 + 0.5], [a[k + 1][0], k * 0.5 + 0.5]];
        if (sz > 0) b.quad(mat, q[0], q[1], q[2], q[3], uv);
        else b.quad(mat, q[1], q[0], q[3], q[2], [uv[1], uv[0], uv[3], uv[2]]);
        if (o.deck === null && k > 0) {
          const inner = o.inside ?? WHITE;
          if (sz > 0) b.quad(inner, q[1], q[0], q[3], q[2], [uv[1], uv[0], uv[3], uv[2]]);
          else b.quad(inner, q[0], q[1], q[2], q[3], uv);
        }
      }
      rails[sz > 0 ? 0 : 1].push(P(a[3], sz));
      if (i === n - 1) rails[sz > 0 ? 0 : 1].push(P(c[3], sz));
    }
    if (o.deck === null) b.quadUp(o.inside ?? WHITE, P(a[1], -1), P(a[1], 1), P(c[1], 1), P(c[1], -1));
    else if (o.deck) b.quadUp(o.deck, P(a[3], -1), P(a[3], 1), P(c[3], 1), P(c[3], -1));
  }
  const t = sec(0);
  for (let k = 0; k < 3; k++) {
    const mat = k < 2 ? bottom : o.side;
    b.quadFacing(mat, P(t[k], -1), P(t[k], 1), P(t[k + 1], 1), P(t[k + 1], -1), [-f.x[0], -f.x[1], -f.x[2]], [[-t[k][2], t[k][1]], [t[k][2], t[k][1]], [t[k + 1][2], t[k + 1][1]], [-t[k + 1][2], t[k + 1][1]]]);
    if (o.deck === null && k > 0) b.quadFacing(o.inside ?? WHITE, P(t[k], -1), P(t[k], 1), P(t[k + 1], 1), P(t[k + 1], -1), f.x, [[-t[k][2], t[k][1]], [t[k][2], t[k][1]], [t[k + 1][2], t[k + 1][1]], [-t[k + 1][2], t[k + 1][1]]]);
  }
  if (o.rub !== null) for (const r of rails) pipe(b, o.rub ?? 'furniture/tire', r, Math.max(0.02, o.beam * 0.012), 5);
  return { x: (q) => X(q), hb, sheer };
}
/** Outboard motor hung on the transom at the pose (which faces the stern). */
export function outboard(b: MeshBuilder, f: Pose, s = 1, cowl = 'trim/paint-charcoal'): void {
  box(b, cowl, f, [-0.22 * s, 0.25 * s, 0], [0.22 * s, 0.2 * s, 0.16 * s]);
  box(b, 'trim/paint-grey', f, [-0.2 * s, -0.3 * s, 0], [0.07 * s, 0.4 * s, 0.05 * s]);
  box(b, 'trim/paint-grey', f, [-0.26 * s, -0.66 * s, 0], [0.16 * s, 0.035 * s, 0.03 * s]);
}
export type BoatKind = 'dinghy' | 'skiff' | 'sail' | 'cruiser' | 'trawler' | 'rib' | 'kayak' | 'canoe';
export interface BoatOpts {
  kind: BoatKind;
  side?: string;
  inside?: string;
  deck?: string;
  /** Canvas for sail covers, biminis and tarps. */
  canvas?: string;
  tarp?: boolean;
  s?: number;
}
/** Boat floating at the pose, bow towards +x. */
export function boat(b: MeshBuilder, f: Pose, o: BoatOpts): void {
  const s = o.s ?? 1;
  const side = o.side ?? S('hull-white');
  const glass = 'window/curtain-blue-dark';
  if (o.kind === 'dinghy' || o.kind === 'canoe') {
    const c = o.kind === 'canoe';
    const h = hull(b, f, c ? { len: 4.8, beam: 0.9, free: 0.32, draft: 0.1, sheer: 0.12, bowQ: 0.5, transom: 0.02, side, bottom: side, deck: null, inside: o.inside } : { len: 3.2 * s, beam: 1.35 * s, free: 0.42, draft: 0.14, sheer: 0.12, side, deck: o.tarp ? (o.canvas ?? S('tarp-blue')) : null, inside: o.inside });
    if (!o.tarp) for (const q of c ? [0.25, 0.5, 0.75] : [0.12, 0.45, 0.72]) box(b, o.deck ?? S('deck-teak'), f, [h.x(q), h.sheer(q) - 0.1, 0], [0.11, 0.015, h.hb(q) * 0.97]);
    if (!c && !o.tarp) for (const sz of [-1, 1]) b.tube('signal/pole-wood', at(f, h.x(0.2), 0.36, sz * 0.2), at(f, h.x(0.9), 0.42, sz * 0.32), 0.02, 5, 0.035, true);
    return;
  }
  if (o.kind === 'kayak') {
    const h = hull(b, f, { len: 4.3, beam: 0.62, free: 0.22, draft: 0.08, sheer: 0.05, bowQ: 0.5, transom: 0.02, side, bottom: side, deck: side, rub: null });
    torus(b, 'furniture/tire', f, [h.x(0.45), 0.235, 0], 0.22, 0.025, 10, 4);
    cyl(b, 'trim/paint-black', f, [h.x(0.45), 0.2, 0], 0.2, 0.03, 10);
    return;
  }
  if (o.kind === 'skiff') {
    const h = hull(b, f, { len: 4.8 * s, beam: 1.85 * s, free: 0.55, draft: 0.2, sheer: 0.18, side, deck: o.tarp ? (o.canvas ?? S('tarp-grey')) : null, inside: o.inside ?? S('hull-aluminium') });
    outboard(b, move(f, h.x(0), 0.5, 0), 1.1);
    if (o.tarp) return;
    box(b, WHITE, f, [h.x(0.5), 0.35, 0], [0.3, 0.4, 0.35]);
    box(b, glass, f, [h.x(0.5) + 0.28, 0.92, 0], [0.01, 0.2, 0.33]);
    for (const q of [0.14, 0.78]) box(b, o.deck ?? S('deck-teak'), f, [h.x(q), 0.3, 0], [0.2, 0.02, h.hb(q) * 0.95]);
    return;
  }
  if (o.kind === 'rib') {
    const h = hull(b, f, { len: 5.2, beam: 1.6, free: 0.3, draft: 0.25, sheer: 0.1, side: S('hull-white'), deck: 'trim/paint-grey', rub: null });
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) pts.push(at(f, h.x(i / 12), h.sheer(i / 12) + 0.12, h.hb(i / 12) + 0.1));
    for (let i = 11; i >= 0; i--) pts.push(at(f, h.x(i / 12), h.sheer(i / 12) + 0.12, -h.hb(i / 12) - 0.1));
    pipe(b, side, pts, 0.24, 8);
    box(b, WHITE, f, [0, 0.75, 0], [0.3, 0.4, 0.3]);
    box(b, 'furniture/bag-black', f, [-0.75, 0.6, 0], [0.25, 0.25, 0.3]);
    outboard(b, move(f, h.x(0), 0.55, 0), 1.3);
    return;
  }
  if (o.kind === 'sail') {
    const L = 8.6 * s;
    const h = hull(b, f, { len: L, beam: 2.8 * s, free: 0.95 * s, draft: 0.45, sheer: 0.25, bowQ: 0.4, transom: 0.6, rake: L * 0.12, side, deck: o.deck ?? WHITE, rub: 'trim/paint-brown' });
    box(b, S('hull-antifoul'), f, [-0.2, -1, 0], [0.8 * s, 0.75, 0.07]);
    box(b, S('hull-antifoul'), f, [h.x(0.04), -0.5, 0], [0.18, 0.5, 0.03]);
    box(b, WHITE, f, [0.5 * s, 1.2 * s, 0], [1.9 * s, 0.25 * s, 0.85 * s], 'Y');
    for (const sz of [-1, 1]) box(b, glass, f, [0.5 * s, 1.22 * s, sz * 0.855 * s], [1.3 * s, 0.09, 0.005]);
    const [mx, top] = [1.1 * s, 12 * s];
    b.tube(ALU, at(f, mx, 1.4 * s, 0), at(f, mx, top, 0), 0.075, 8, 0.05, true);
    b.tube(ALU, at(f, mx, 2.3 * s, 0), at(f, mx - 3.6 * s, 2.3 * s, 0), 0.05, 8, 0.05, true);
    b.tube(o.canvas ?? S('canvas-white'), at(f, mx - 0.1, 2.48 * s, 0), at(f, mx - 3.5 * s, 2.44 * s, 0), 0.16, 8, 0.1, true);
    b.tube(ALU, at(f, mx, top * 0.6, -1.1 * s), at(f, mx, top * 0.6, 1.1 * s), 0.02, 5);
    for (const p of [at(f, h.x(1), h.sheer(1), 0), at(f, h.x(0), h.sheer(0), 0)]) b.tube(ALU, at(f, mx, top - 0.1, 0), p, 0.008, 4);
    for (const sz of [-1, 1]) {
      b.tube(ALU, at(f, mx, top * 0.6, sz * 1.1 * s), at(f, mx - 0.2, h.sheer(0.5), sz * h.hb(0.55)), 0.008, 4);
      b.tube(ALU, at(f, mx, top - 0.1, 0), at(f, mx, top * 0.6, sz * 1.1 * s), 0.008, 4);
      const posts = [0.05, 0.25, 0.45, 0.65, 0.85].map((q) => [at(f, h.x(q), h.sheer(q), sz * h.hb(q) * 0.96), at(f, h.x(q), h.sheer(q) + 0.6, sz * h.hb(q) * 0.96)] as [V3, V3]);
      posts.forEach(([a, c], i) => {
        b.tube(ALU, a, c, 0.012, 5);
        if (i) b.tube(ALU, posts[i - 1][1], c, 0.006, 4);
      });
    }
    pipe(b, ALU, [at(f, h.x(0.85), h.sheer(0.85) + 0.6, h.hb(0.85) * 0.96), at(f, h.x(1) - 0.1, h.sheer(1) + 0.65, 0), at(f, h.x(0.85), h.sheer(0.85) + 0.6, -h.hb(0.85) * 0.96)], 0.014, 5);
    lathe(b, ALU, { ...move(f, h.x(0.12), h.sheer(0.1) + 0.85, 0), y: f.x, x: f.y }, [[0, -0.02], [0.4, -0.02], [0.4, 0.02], [0, 0.02]], 12);
    return;
  }
  if (o.kind === 'cruiser') {
    const L = 9.5 * s;
    const h = hull(b, f, { len: L, beam: 3.2 * s, free: 1.15 * s, draft: 0.45, sheer: 0.35, bowQ: 0.5, transom: 0.9, rake: L * 0.1, side, deck: o.deck ?? WHITE, rub: 'trim/paint-aluminium' });
    box(b, WHITE, f, [0.2 * s, 1.75 * s, 0], [2.3 * s, 0.6 * s, 1.25 * s], 'Y');
    for (const sz of [-1, 1]) box(b, glass, f, [0.3 * s, 1.85 * s, sz * 1.255 * s], [1.9 * s, 0.25 * s, 0.005]);
    box(b, glass, tilt(turn(move(f, 2.5 * s, 1.85 * s, 0), -90), -20), [0, 0, 0.02], [1.1 * s, 0.3 * s, 0.005]);
    box(b, WHITE, f, [-0.3 * s, 2.55 * s, 0], [1.3 * s, 0.22 * s, 1.1 * s], 'Y');
    box(b, glass, f, [1.02 * s, 2.95 * s, 0], [0.01, 0.2 * s, 0.95 * s]);
    const cv = o.canvas ?? S('canvas-white');
    box(b, cv, f, [-0.5 * s, 3.9 * s, 0], [1.1 * s, 0.02, 1.05 * s]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tube(ALU, at(f, (-0.5 + sx * 1) * s, 2.77 * s, sz * s), at(f, (-0.5 + sx * 1) * s, 3.88 * s, sz * s), 0.015, 5);
    for (const sz of [-1, 1]) {
      const pts = [0.5, 0.65, 0.8, 0.95].map((q) => at(f, h.x(q), h.sheer(q) + 0.55, sz * h.hb(q) * 0.94));
      pipe(b, ALU, [...pts, at(f, h.x(1) - 0.15, h.sheer(1) + 0.6, 0)], 0.015, 5);
      [0.5, 0.65, 0.8, 0.95].forEach((q, i) => b.tube(ALU, at(f, h.x(q), h.sheer(q), sz * h.hb(q) * 0.94), pts[i], 0.012, 5));
    }
    box(b, S('deck-teak'), f, [h.x(0) - 0.3, 0.25, 0], [0.3, 0.03, 1.2 * s]);
    return;
  }
  // Trawler: high bow, wheelhouse forward, working deck aft with a mast, boom and net drum.
  const L = 13 * s;
  const h = hull(b, f, { len: L, beam: 4.2 * s, free: 1.3 * s, draft: 0.9, sheer: 1.1, bowQ: 0.5, transom: 0.85, rake: L * 0.08, side, deck: o.deck ?? S('deck-wet'), rub: 'furniture/tire' });
  for (const sz of [-1, 1]) {
    const pts = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((q) => [at(f, h.x(q), h.sheer(q), sz * h.hb(q) * 0.99), at(f, h.x(q), h.sheer(q) + 0.55, sz * h.hb(q) * 0.99)] as [V3, V3]);
    for (let i = 1; i < pts.length; i++) sheet(b, side, pts[i - 1][0], pts[i][0], pts[i][1], pts[i - 1][1], [[0, 0], [2, 0], [2, 0.55], [0, 0.55]]);
    for (const q of [0.25, 0.42]) torus(b, 'furniture/tire', { ...move(f, h.x(q), 0.7, sz * (h.hb(q) + 0.12)), y: f.z, z: f.y }, [0, 0, 0], 0.26, 0.11, 10, 6);
  }
  const wx = h.x(0.68);
  box(b, WHITE, f, [wx, h.sheer(0.68) + 1.15, 0], [1.6 * s, 1.15, 1.35 * s], 'Y');
  box(b, 'trim/paint-grey', f, [wx, h.sheer(0.68) + 2.34, 0], [1.75 * s, 0.04, 1.5 * s]);
  for (const sz of [-1, 1]) box(b, glass, f, [wx + 0.2, h.sheer(0.68) + 1.65, sz * 1.355 * s], [1.1 * s, 0.3, 0.005]);
  box(b, glass, f, [wx + 1.605 * s, h.sheer(0.68) + 1.65, 0], [0.005, 0.3, 1.15 * s]);
  const my = h.sheer(0.68) + 2.38;
  b.tube('trim/paint-white-old', at(f, wx - 0.8, my, 0), at(f, wx - 0.8, my + 4.2, 0), 0.09, 8, 0.06, true);
  b.tube('trim/paint-white-old', at(f, wx - 0.8, my + 0.5, 0), at(f, h.x(0.12), my + 2.6, 0), 0.06, 6, 0.045, true);
  b.tube('furniture/cable', at(f, wx - 0.8, my + 4.1, 0), at(f, h.x(0.12), my + 2.6, 0), 0.01, 4);
  b.tube('furniture/cable', at(f, h.x(0.12), my + 2.6, 0), at(f, h.x(0.12), h.sheer(0.1) + 0.9, 0), 0.01, 4);
  lathe(b, 'trim/paint-white-old', move(f, wx + 0.5, my, 0.5), [[0.25, 0], [0.25, 0.12], [0, 0.4]], 10);
  const dx = h.x(0.16);
  for (const sz of [-1, 1]) box(b, 'structure/steel-grey-rusty', f, [dx, h.sheer(0.16) + 0.5, sz * 1.05 * s], [0.08, 0.5, 0.06]);
  lathe(b, S('net-fishing'), { ...move(f, dx, h.sheer(0.16) + 0.75, 0), y: f.z, z: f.y, x: f.x }, [[0, -s], [0.55, -s], [0.55, s], [0, s]], 10);
  for (let i = 0; i < 4; i++) box(b, S(i % 2 ? 'plastic-blue' : 'plastic-orange'), f, [h.x(0.36) + (i % 2) * 0.75, h.sheer(0.36) + 0.16 + Math.floor(i / 2) * 0.32, 0.6 * s], [0.33, 0.15, 0.23]);
  for (let i = 0; i < 3; i++) ball(b, S(i % 2 ? 'buoy-red' : 'buoy-orange'), f, [h.x(0.3) + i * 0.4, h.sheer(0.3) + 0.25, -0.9 * s], 0.22, 8);
}

/** Two-wheel boat trailer under a boat at the pose; the tongue points towards +x. */
export function trailer(b: MeshBuilder, f: Pose, len: number, w = 1.9): void {
  const st = 'trim/paint-galvanized';
  for (const sz of [-1, 1]) {
    b.beam(st, at(f, -len / 2, 0.42, (sz * w) / 2 * 0.75), at(f, len * 0.25, 0.42, (sz * w) / 2 * 0.75), 0.07, 0.1);
    b.beam(st, at(f, len * 0.25, 0.42, (sz * w) / 2 * 0.75), at(f, len / 2 + 0.6, 0.42, 0), 0.07, 0.1);
    b.beam('trim/paint-charcoal', at(f, -len * 0.4, 0.62, sz * 0.35), at(f, len * 0.2, 0.56, sz * 0.35), 0.12, 0.08);
    lathe(b, 'furniture/tire', { ...move(f, -len * 0.12, 0.31, (sz * w) / 2), y: f.z, z: f.y }, [[0, -0.1], [0.24, -0.1], [0.31, -0.07], [0.31, 0.07], [0.24, 0.1], [0, 0.1]], 12);
    box(b, st, f, [-len * 0.12, 0.66, (sz * w) / 2], [0.38, 0.015, 0.14]);
  }
  for (const x of [-len / 2, -len * 0.12, len * 0.25]) b.beam(st, at(f, x, 0.42, -w / 2 * 0.8), at(f, x, 0.42, (w / 2) * 0.8), 0.07, 0.1);
  b.tube(st, at(f, len / 2 + 0.1, 0.42, 0), at(f, len / 2 + 0.1, 1.25, 0), 0.03, 6, 0.03, true);
  b.tube(st, at(f, len / 2 + 0.35, 0.02, 0), at(f, len / 2 + 0.35, 0.42, 0), 0.025, 6);
}

export const CONTAINER_COLORS = ['red', 'blue', 'green', 'orange', 'grey', 'white', 'yellow', 'brown', 'teal', 'maroon'] as const;
/** ISO shipping container standing on the pose, long side along x, doors at +x. `units` is 1 (20 ft) or 2 (40 ft). */
export function container(b: MeshBuilder, f: Pose, color: string, units: 1 | 2 = 1, o: { open?: boolean; high?: boolean } = {}): void {
  const [L, W, H] = [6.06 * units, 2.44, o.high ? 2.9 : 2.59];
  const [sideT, doorT] = [S(`container-${color}`), S(`container-door-${color}`)];
  for (let u = 0; u < units; u++) {
    const cx = -L / 2 + 6.06 * (u + 0.5);
    for (const sz of [1, -1]) face(b, sideT, sz > 0 ? move(f, cx, 0, 0) : turn(move(f, cx, 0, 0), 180), [0, H / 2 + 0.02, W / 2], 6.06, H);
    b.quadUp(sideT, at(f, cx - 3.03, H + 0.02, W / 2), at(f, cx + 3.03, H + 0.02, W / 2), at(f, cx + 3.03, H + 0.02, -W / 2), at(f, cx - 3.03, H + 0.02, -W / 2), 0, [[0.3, 1.7], [5.7, 1.7], [5.7, 2.5], [0.3, 2.5]]);
  }
  face(b, sideT, turn(f, 90), [0, H / 2 + 0.02, L / 2], W, H, [0.2, 0, 2.64, 2.59]);
  if (o.open) {
    for (const sz of [-1, 1]) face(b, doorT, turn(move(f, L / 2, 0, (sz * W) / 2), -90 + sz * 100), [(sz * W) / 4, H / 2 + 0.02, 0], W / 2, H, sz < 0 ? [0, 0, 1.22, 2.59] : [1.22, 0, 2.44, 2.59]);
    for (const sz of [-1, 1]) face(b, 'trim/paint-charcoal', turn(move(f, L / 2, 0, (sz * W) / 2), -90 + sz * 100 + 180), [(-sz * W) / 4, H / 2 + 0.02, 0], W / 2, H);
    box(b, 'furniture/bag-black', f, [L / 2 - 1.5, H / 2, 0], [1.45, H / 2 - 0.1, W / 2 - 0.06], 'x');
    box(b, 'wall/plywood-tan', f, [L / 2 - 1.2, 0.5, 0.3], [0.6, 0.45, 0.5]);
  } else face(b, doorT, turn(f, -90), [0, H / 2 + 0.02, L / 2], W, H);
  box(b, 'trim/paint-charcoal', f, [0, 0.01, 0], [L / 2 - 0.02, 0.01, W / 2 - 0.02]);
}
/** Refrigeration unit on the -x end of a container. */
export function reeferUnit(b: MeshBuilder, f: Pose, L: number): void {
  box(b, 'trim/paint-white', f, [-L / 2 - 0.12, 1.3, 0], [0.12, 1.25, 1.18]);
  face(b, 'trim/ac-fan-grey', turn(move(f, -L / 2 - 0.245, 2, 0.5), 90), [0, 0, 0], 0.8, 0.8);
  face(b, 'trim/louver-grey', turn(move(f, -L / 2 - 0.245, 0.8, 0), 90), [0, 0, 0], 2, 1, [0, 0, 2, 1]);
}

export interface SeawallOpts {
  /** Height of the promenade above the water. */
  top?: number;
  walk?: string;
  depth?: number;
  cap?: string;
  /** Rubber or tyre fenders on the face. */
  fenders?: 'tyre' | 'rubber';
  ladder?: boolean;
  /** Recurved wave-return lip. */
  lip?: boolean;
}
/** Vertical sea wall along +x facing the water at +z, with the promenade behind it. */
export function seawall(b: MeshBuilder, f: Pose, len: number, tex: string, o: SeawallOpts = {}): void {
  const top = o.top ?? 2.2;
  const depth = o.depth ?? 4;
  const mh = b.part(tex).mh;
  const v0 = 1.4 - 2;
  b.quad(tex, at(f, 0, -2, 0), at(f, len, -2, 0), at(f, len, top, 0), at(f, 0, top, 0), [[0, v0], [len, v0], [len, Math.min(mh, v0 + top + 2)], [0, Math.min(mh, v0 + top + 2)]]);
  const cap = o.cap ?? 'concrete/walk-plain';
  box(b, cap, f, [len / 2, top + 0.1, -0.2], [len / 2, 0.1, 0.3]);
  if (o.lip) for (const s of spaced(len, 1)) if (s < len) box(b, cap, tilt(move(f, s + 0.5, top + 0.1, 0.2), -35), [0, 0, 0], [0.5, 0.09, 0.22]);
  b.quadUp(o.walk ?? 'concrete/walk-square', at(f, 0, top, -0.5), at(f, len, top, -0.5), at(f, len, top, -depth), at(f, 0, top, -depth));
  for (const x of [0, len]) b.quadFacing('structure/wall-old', at(f, x, -2, 0), at(f, x, -2, -depth), at(f, x, top, -depth), at(f, x, top, 0), x ? f.x : [-f.x[0], -f.x[1], -f.x[2]], [[0, 0], [depth, 0], [depth, top + 2], [0, top + 2]]);
  if (o.fenders === 'tyre') for (const s of spaced(len - 2, 2.4)) {
    torus(b, 'furniture/tire', { ...move(f, 1 + s, 0.9 + hash(Math.round(s), 3) * 0.3, 0.13), y: f.z, z: f.y }, [0, 0, 0], 0.3, 0.12, 10, 6);
    b.tube('site/rope', at(f, 1 + s, 1.3, 0.1), at(f, 1 + s, top + 0.2, 0.02), 0.012, 4);
  }
  if (o.fenders === 'rubber') for (const s of spaced(len - 2, 3)) box(b, 'furniture/tire', f, [1 + s, 0.9, 0.1], [0.18, 0.9, 0.1], 'Z');
  if (o.ladder) ladder(b, f, [len * 0.7, 0, 0.07], -0.8, top + 0.2);
}

export type BuoyKind = 'nun' | 'can' | 'pillar' | 'ball' | 'spar' | 'barrel';
/** Floating navigation or mooring buoy; the pose is on the water surface. */
export function buoy(b: MeshBuilder, f: Pose, kind: BuoyKind, tex: string, o: { light?: string; band?: string; lean?: number } = {}): void {
  const g = o.lean ? tilt(f, o.lean) : f;
  if (kind === 'nun') lathe(b, tex, g, [[0, -0.7], [0.5, -0.6], [0.55, 0.35], [0.22, 1.35], [0, 1.4]], 12);
  if (kind === 'can') lathe(b, tex, g, [[0, -0.7], [0.5, -0.6], [0.5, 1.05], [0.44, 1.12], [0, 1.12]], 12);
  if (kind === 'barrel') lathe(b, tex, g, [[0, -0.3], [0.28, -0.3], [0.34, 0.1], [0.28, 0.5], [0, 0.5]], 10);
  if (kind === 'spar') {
    lathe(b, tex, g, [[0, -1], [0.16, -1], [0.16, 2.2], [0, 2.25]], 8);
    for (const a of [45, -45]) box(b, tex, roll(move(g, 0, 2.6, 0), a), [0, 0, 0], [0.3, 0.035, 0.02]);
  }
  if (kind === 'ball') {
    ball(b, tex, g, [0, 0.12, 0], 0.4, 12);
    if (o.band) lathe(b, o.band, move(g, 0, 0.07, 0), [[0.405, 0], [0.405, 0.1]], 12);
    torus(b, 'trim/paint-galvanized', { ...move(g, 0, 0.56, 0), y: f.z, z: f.y }, [0, 0, 0], 0.06, 0.012, 8, 4);
  }
  if (kind === 'pillar') {
    lathe(b, tex, g, [[0, -0.6], [1, -0.5], [1.1, 0.25], [0.9, 0.45], [0, 0.5]], 14);
    for (let i = 0; i < 4; i++) {
      const [c, s] = [Math.cos((i / 4) * Math.PI * 2 + 0.78), Math.sin((i / 4) * Math.PI * 2 + 0.78)];
      const [c1, s1] = [Math.cos(((i + 1) / 4) * Math.PI * 2 + 0.78), Math.sin(((i + 1) / 4) * Math.PI * 2 + 0.78)];
      b.tube(tex, at(g, c * 0.7, 0.45, s * 0.7), at(g, c * 0.3, 3, s * 0.3), 0.035, 6);
      for (const [y, r] of [[1.3, 0.57], [2.15, 0.43], [3, 0.3]]) b.tube(tex, at(g, c * r, y, s * r), at(g, c1 * r, y, s1 * r), 0.022, 5);
      b.tube(tex, at(g, c * 0.7, 0.45, s * 0.7), at(g, c1 * 0.57, 1.3, s1 * 0.57), 0.015, 4);
    }
    cyl(b, tex, g, [0, 3, 0], 0.32, 0.06, 10);
    lathe(b, o.light ?? S('beacon-red'), move(g, 0, 3.06, 0), [[0.11, 0], [0.11, 0.26], [0, 0.34]], 10);
    plate(b, 'site/sign-tower-number', g, [0, 1.75, 0.52], { size: [0.4, 0.4] });
  }
}

/** Umbrella canopy: a shallow cone seen from above and below. */
export function canopy(b: MeshBuilder, tex: string, f: Pose, c: V3, r: number, rise: number, sides = 8): void {
  const P = (i: number): V3 => at(f, c[0] + Math.cos((i / sides) * Math.PI * 2) * r, c[1], c[2] + Math.sin((i / sides) * Math.PI * 2) * r);
  const apex = at(f, c[0], c[1] + rise, c[2]);
  const arc = (2 * Math.PI * r) / sides;
  for (let i = 0; i < sides; i++) {
    b.tri(tex, apex, P(i + 1), P(i), [[arc / 2, r], [arc, 0], [0, 0]]);
    b.tri(tex, apex, P(i), P(i + 1), [[arc / 2, r], [0, 0], [arc, 0]]);
  }
}
/** Flag on a pole. */
export function flagPole(b: MeshBuilder, f: Pose, h: number, flag: string, mat = 'trim/paint-white'): void {
  b.tube(mat, at(f, 0, 0, 0), at(f, 0, h, 0), 0.03, 6, 0.02, true);
  ball(b, mat, f, [0, h + 0.04, 0], 0.045, 6);
  plate(b, flag, f, [0.47, h - 0.35, 0], { back: flag, warp: (x) => Math.sin(x * 7) * 0.05 });
}
