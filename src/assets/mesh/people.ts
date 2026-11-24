import { BOTTOMS, BottomId, Gear, HAIRS, HEADS, Hair, HeadId, ShoeId, TOPS, TopId, gearCell, hairThick, shoeCell } from '../tex';
import { table } from '../tex/people';
import { MeshBuilder, V3, v3 } from './builder';

// A person faces +z and stands on y = 0; +x is the person's left. Bones run down their frame's -y; a frame's columns are its left, up and front.
type M3 = [V3, V3, V3];
const app = (m: M3, v: V3): V3 => [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2], m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2], m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]];
const mm = (a: M3, b: M3): M3 => [app(a, b[0]), app(a, b[1]), app(a, b[2])];
const rx = (t: number): M3 => [[1, 0, 0], [0, Math.cos(t), Math.sin(t)], [0, -Math.sin(t), Math.cos(t)]];
const ry = (t: number): M3 => [[Math.cos(t), 0, -Math.sin(t)], [0, 1, 0], [Math.sin(t), 0, Math.cos(t)]];
const rz = (t: number): M3 => [[Math.cos(t), Math.sin(t), 0], [-Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
const at = (o: V3, m: M3, v: V3): V3 => v3.add(o, app(m, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const pw = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
/** u0, v0, u1, v1 as shares of a texture. */
type Rect = readonly [number, number, number, number];

/**
 * A smooth skin over rows of points: grid[i][j] with every row the same length. `us` and `vs` place the columns and rows in `rect`.
 * A closed row repeats its first point at its end, so that the texture can wrap.
 */
function skin(b: MeshBuilder, material: string, grid: V3[][], us: number[], vs: number[], rect: Rect, closed = true): void {
  const p = b.part(material);
  const base = p.positions.length / 3;
  const R = grid.length;
  const N = grid[0].length;
  const mid = grid.map((row) => v3.scale(row.reduce((a, q) => v3.add(a, q), [0, 0, 0] as V3), 1 / N));
  const ns: V3[] = [];
  let out = 0;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < N; j++) {
      const ja = closed ? (j === 0 ? N - 2 : j - 1) : Math.max(0, j - 1);
      const jb = closed ? (j === N - 1 ? 1 : j + 1) : Math.min(N - 1, j + 1);
      const du = v3.sub(grid[i][jb], grid[i][ja]);
      const dv = v3.sub(grid[Math.min(R - 1, i + 1)][j], grid[Math.max(0, i - 1)][j]);
      let n = v3.cross(du, dv);
      if (v3.len(n) < 1e-12) {
        // The point of a closed end looks along the skin's axis.
        const other = mid[i === 0 ? Math.min(R - 1, 1) : i - 1];
        n = v3.sub(mid[i], other);
        if (v3.len(n) < 1e-12) n = [0, 1, 0];
        n = v3.norm(n);
        ns.push(n);
        continue;
      }
      n = v3.norm(n);
      out += v3.dot(n, v3.sub(grid[i][j], mid[i]));
      ns.push(n);
    }
  }
  const flip = out < 0;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < N; j++) {
      const q = grid[i][j];
      const n = ns[i * N + j];
      const cap = v3.len(v3.cross(v3.sub(grid[i][Math.min(N - 1, j + 1)], grid[i][Math.max(0, j - 1)]), [1, 1, 1])) < 1e-12 && v3.len(v3.sub(grid[i][0], grid[i][N >> 1])) < 1e-9;
      const s = flip && !cap ? -1 : 1;
      p.positions.push(q[0], q[1], q[2]);
      p.normals.push(n[0] * s, n[1] * s, n[2] * s);
      p.uvs.push(lerp(rect[0], rect[2], us[j]), lerp(rect[1], rect[3], vs[i]));
    }
  }
  const same = (a: number, c: number) => v3.len(v3.sub(grid[(a / N) | 0][a % N], grid[(c / N) | 0][c % N])) < 1e-9;
  for (let i = 0; i + 1 < R; i++) {
    for (let j = 0; j + 1 < N; j++) {
      const [a, c, d, e] = [i * N + j, i * N + j + 1, (i + 1) * N + j + 1, (i + 1) * N + j];
      for (const [t0, t1, t2] of [[a, c, d], [a, d, e]]) {
        if (same(t0, t1) || same(t1, t2) || same(t0, t2)) continue;
        if (flip) p.indices.push(base + t0, base + t2, base + t1);
        else p.indices.push(base + t0, base + t1, base + t2);
      }
    }
  }
}
const steps = (n: number): number[] => Array.from({ length: n + 1 }, (_, i) => i / n);

/** A ring around c in the plane of the frame's left and front: it starts at the back and passes the person's right, the front, and the left. */
function ring(c: V3, m: M3, wx: number, wf: number, wb: number, n: number, e = 1): V3[] {
  const out: V3[] = [];
  for (let j = 0; j <= n; j++) {
    const phi = ((j % n) / n) * Math.PI * 2;
    const cs = -Math.cos(phi);
    out.push(at(c, m, [-wx * pw(Math.sin(phi), e), 0, (cs > 0 ? wf : wb) * pw(cs, e)]));
  }
  return out;
}
interface Station {
  c: V3;
  m: M3;
  /** Radius, and how much deeper than wide. */
  r: number;
  q: number;
  s: number;
}
/** Stations down two bones that meet at a hinge about their shared left axis. s runs 0..1 down the first and 1..2 down the second; below 0 it rounds off the top. */
function limb(p0: V3, ma: M3, la: number, mb: M3, lb: number, rad: (s: number) => number, ss: number[]): Station[] {
  const half = Math.acos(clamp(v3.dot(ma[1], mb[1]), -1, 1)) / 2;
  const y = v3.norm(v3.add(ma[1], mb[1]));
  const mj: M3 = [ma[0], y, v3.cross(ma[0], y)];
  const p1 = v3.mad(p0, ma[1], -la);
  const gap = rad(1) * Math.tan(Math.min(half, 1.2)) * 0.95;
  const out: Station[] = [];
  for (const s of ss) {
    if (s < 0) {
      const r0 = rad(0);
      out.push({ c: v3.mad(p0, ma[1], -s * r0 * 0.62), m: ma, r: r0 * Math.sqrt(Math.max(0, 1 - s * s)), q: 1, s });
    } else if (s < 1) {
      if ((1 - s) * la < gap && s > 0) continue;
      out.push({ c: v3.mad(p0, ma[1], -la * s), m: ma, r: rad(s), q: 1, s });
    } else if (s === 1) out.push({ c: p1, m: mj, r: rad(1), q: Math.min(1.7, 1 / Math.cos(half)), s });
    else {
      if ((s - 1) * lb < gap && s < 2) continue;
      out.push({ c: v3.mad(p1, mb[1], -lb * (s - 1)), m: mb, r: rad(s), q: 1, s });
    }
  }
  return out;
}
function tubeOf(b: MeshBuilder, material: string, st: Station[], n: number, rect: Rect, vOf: (s: number) => number, ends = ''): void {
  const grid = st.map((q) => ring(q.c, q.m, q.r, q.r * q.q, q.r * q.q, n));
  const vs = st.map((q) => vOf(q.s));
  if (ends.includes('a')) {
    grid.unshift(grid[0].map(() => st[0].c));
    vs.unshift(vs[0]);
  }
  if (ends.includes('b')) {
    grid.push(grid[0].map(() => st[st.length - 1].c));
    vs.push(vs[vs.length - 1]);
  }
  skin(b, material, grid, steps(n), vs, rect);
}
/** A box in a frame, every face showing the same patch (or `front` on its +z face). */
function crate(b: MeshBuilder, material: string, rect: Rect, c: V3, m: M3, half: V3, front?: Rect): void {
  const spec = b.part(material);
  const faces: [V3, V3, V3][] = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
  faces.forEach(([n, u, w], i) => {
    const r = i === 0 && front ? front : rect;
    const corner = (su: number, sw: number): V3 => at(c, m, [0, 1, 2].map((k) => (n[k] + u[k] * su + w[k] * sw) * half[k]) as V3);
    const uv = (su: number, sw: number): [number, number] => [lerp(r[0], r[2], (su + 1) / 2) * spec.mw, lerp(r[1], r[3], (sw + 1) / 2) * spec.mh];
    b.quad(material, corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), [uv(-1, -1), uv(1, -1), uv(1, 1), uv(-1, 1)], 0, v3.norm(app(m, n)));
  });
}
/** A strap or a stick along a line of points. */
function strap(b: MeshBuilder, material: string, rect: Rect, pts: V3[], w: number, t: number, side: V3 = [1, 0, 0], n = 4): void {
  const grid = pts.map((q, i) => {
    const y = v3.norm(v3.sub(pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, i + 1)]));
    let x = v3.sub(side, v3.scale(y, v3.dot(side, y)));
    if (v3.len(x) < 1e-6) x = [0, 0, 1];
    x = v3.norm(x);
    return ring(q, [x, y, v3.cross(x, y)], w / 2, t / 2, t / 2, n, n === 4 ? 0.3 : 1);
  });
  grid.unshift(grid[0].map(() => pts[0]));
  grid.push(grid[0].map(() => pts[pts.length - 1]));
  skin(b, material, grid, steps(n), steps(grid.length - 1), rect);
}

// --- Poses. Angles in radians. ---
interface Arm {
  /** Swing of the upper arm forward, and out to the side. */
  flex?: number;
  abd?: number;
  /** Turn of the upper arm that carries a bent forearm across the body. */
  twist?: number;
  elbow?: number;
  /** Turn of the hand about the forearm, bend of the wrist towards the palm, curl of the fingers. */
  turn?: number;
  wrist?: number;
  curl?: number;
}
interface Leg {
  flex?: number;
  abd?: number;
  knee?: number;
  /** Pitch of the foot, toes down; flat on the ground if left out. */
  foot?: number;
}
export interface Pose {
  label: string;
  /** Lean of the chest forward, its turn to the left, tilt of the hips forward. */
  lean?: number;
  twist?: number;
  tilt?: number;
  /** Nod and turn of the head. */
  head?: [number, number];
  l?: Arm;
  r?: Arm;
  ll?: Leg;
  rl?: Leg;
}
export const POSES = {
  stand: { label: '立つ', l: { flex: 0.04, abd: 0.1, elbow: 0.2 }, r: { flex: -0.02, abd: 0.1, elbow: 0.16 }, ll: { abd: 0.05 }, rl: { abd: 0.05, flex: 0.03 } },
  relaxed: { label: '片足に体重をかけて立つ', twist: 0.08, head: [0.02, -0.2], l: { flex: 0.08, abd: 0.12, elbow: 0.3 }, r: { flex: -0.05, abd: 0.14, elbow: 0.2 }, ll: { abd: 0.02 }, rl: { abd: 0.12, flex: 0.14, knee: 0.22 } },
  hips: { label: '腰に手を当てて立つ', l: { flex: -0.25, abd: 0.75, twist: 1.1, elbow: 1.65, curl: 1 }, r: { flex: -0.25, abd: 0.75, twist: 1.1, elbow: 1.65, curl: 1 }, ll: { abd: 0.1 }, rl: { abd: 0.1 } },
  pockets: { label: 'ポケットに手を入れて立つ', lean: -0.03, l: { flex: -0.1, abd: 0.22, twist: 0.5, elbow: 0.6, curl: 1.2 }, r: { flex: -0.1, abd: 0.22, twist: 0.5, elbow: 0.6, curl: 1.2 }, ll: { abd: 0.06 }, rl: { abd: 0.07, flex: 0.05 } },
  phone: { label: 'スマートフォンを見る', lean: 0.04, head: [0.38, 0], l: { flex: 0.02, abd: 0.1, elbow: 0.2 }, r: { flex: 0.3, abd: 0.08, twist: 0.5, elbow: 1.75, turn: 1.3, curl: 0.35 }, ll: { abd: 0.05 }, rl: { abd: 0.06 } },
  call: { label: '電話で話す', head: [0.03, 0.25], l: { flex: 0.02, abd: 0.1, elbow: 0.25 }, r: { flex: 1.2, abd: 0.3, elbow: 2.44, turn: 0.1, curl: 0.5 }, ll: { abd: 0.05 }, rl: { abd: 0.08, flex: 0.06, knee: 0.1 } },
  walk: { label: '歩く', lean: 0.05, twist: -0.1, l: { flex: -0.34, abd: 0.08, elbow: 0.3 }, r: { flex: 0.36, abd: 0.08, elbow: 0.5 }, ll: { flex: 0.44, knee: 0.1, foot: -0.28 }, rl: { flex: -0.3, knee: 0.3, foot: 0.52 } },
  stride: { label: '歩く (反対の足)', lean: 0.05, twist: 0.1, l: { flex: 0.36, abd: 0.08, elbow: 0.5 }, r: { flex: -0.34, abd: 0.08, elbow: 0.3 }, ll: { flex: -0.3, knee: 0.3, foot: 0.52 }, rl: { flex: 0.44, knee: 0.1, foot: -0.28 } },
  step: { label: '歩く (足をそろえる途中)', lean: 0.04, l: { flex: 0.1, abd: 0.08, elbow: 0.35 }, r: { flex: -0.08, abd: 0.08, elbow: 0.3 }, ll: { flex: 0.02, knee: 0.04 }, rl: { flex: 0.32, knee: 0.95, foot: 0.5 } },
  carry: { label: '片手に荷物を持って歩く', lean: 0.05, twist: -0.08, l: { flex: -0.3, abd: 0.08, elbow: 0.3 }, r: { flex: 0.06, abd: 0.12, elbow: 0.12, curl: 1.4 }, ll: { flex: 0.42, knee: 0.1, foot: -0.28 }, rl: { flex: -0.3, knee: 0.3, foot: 0.52 } },
  cup: { label: '飲み物を持って歩く', lean: 0.04, twist: 0.08, l: { flex: 0.25, abd: 0.1, twist: 0.3, elbow: 1.55, turn: 0.2, curl: 1.3 }, r: { flex: -0.3, abd: 0.08, elbow: 0.3 }, ll: { flex: -0.28, knee: 0.3, foot: 0.5 }, rl: { flex: 0.42, knee: 0.1, foot: -0.28 } },
  run: { label: '走る', lean: 0.22, twist: -0.2, head: [-0.12, 0], l: { flex: -0.75, abd: 0.12, elbow: 1.6, curl: 1.2 }, r: { flex: 0.7, abd: 0.1, twist: 0.3, elbow: 1.7, curl: 1.2 }, ll: { flex: 1.0, knee: 1.25, foot: 0.2 }, rl: { flex: -0.5, knee: 0.5, foot: 0.75 } },
  hold: { label: '両手で箱を抱える', lean: -0.04, l: { flex: 0.3, abd: 0.16, twist: 0.25, elbow: 1.35, turn: 0.4, curl: 0.9 }, r: { flex: 0.3, abd: 0.16, twist: 0.25, elbow: 1.35, turn: 0.4, curl: 0.9 }, ll: { abd: 0.07 }, rl: { abd: 0.07 } },
  wave: { label: '手を振る', head: [-0.05, 0.1], l: { flex: 0.03, abd: 0.1, elbow: 0.2 }, r: { flex: 0.1, abd: 1.3, twist: -1.5, elbow: 1.8, curl: 0.1 }, ll: { abd: 0.05 }, rl: { abd: 0.06 } },
  point: { label: '指をさす', twist: 0.15, head: [-0.03, 0.3], l: { flex: 1.35, abd: 0.25, elbow: 0.12, curl: 0.2 }, r: { flex: -0.02, abd: 0.1, elbow: 0.2 }, ll: { abd: 0.06 }, rl: { abd: 0.06 } },
  cane: { label: '杖をついて歩く', lean: 0.2, head: [-0.14, 0], l: { flex: -0.12, abd: 0.08, elbow: 0.3 }, r: { flex: 0.3, abd: 0.14, elbow: 0.55, curl: 1.4 }, ll: { flex: 0.22, knee: 0.14, foot: -0.12 }, rl: { flex: -0.14, knee: 0.22, foot: 0.25 } },
  lean: { label: '壁にもたれる', lean: -0.1, tilt: -0.08, head: [0.12, 0.25], l: { flex: -0.12, abd: 0.2, twist: 0.5, elbow: 0.6, curl: 1.2 }, r: { flex: -0.12, abd: 0.2, twist: 0.5, elbow: 0.6, curl: 1.2 }, ll: { flex: 0.2, abd: 0.05, knee: 0.1 }, rl: { flex: 0.75, abd: 0.08, knee: 1.75, foot: 0.85 } },
  sit: { label: '座る', lean: 0.02, tilt: -0.1, l: { flex: 0.42, abd: 0.12, twist: 0.3, elbow: 0.95, turn: -1.2, curl: 0.5 }, r: { flex: 0.42, abd: 0.12, twist: 0.3, elbow: 0.95, turn: -1.2, curl: 0.5 }, ll: { flex: 1.47, abd: 0.1, knee: 1.5 }, rl: { flex: 1.47, abd: 0.1, knee: 1.5 } },
  'sit-phone': { label: '座ってスマートフォンを見る', lean: 0.2, tilt: -0.1, head: [0.35, 0], l: { flex: 0.5, abd: 0.12, twist: 0.3, elbow: 1.0, turn: -1.2, curl: 0.5 }, r: { flex: 0.45, abd: 0.08, twist: 0.5, elbow: 1.75, turn: 1.3, curl: 0.35 }, ll: { flex: 1.45, abd: 0.14, knee: 1.5 }, rl: { flex: 1.45, abd: 0.14, knee: 1.5 } },
  'sit-cup': { label: '座って飲み物を持つ', lean: -0.06, tilt: -0.12, head: [0, -0.25], l: { flex: 0.35, abd: 0.1, twist: 0.3, elbow: 1.5, turn: 0.2, curl: 1.3 }, r: { flex: 0.42, abd: 0.12, twist: 0.3, elbow: 0.95, turn: -1.2, curl: 0.5 }, ll: { flex: 1.5, abd: 0.06, knee: 1.35 }, rl: { flex: 1.42, abd: 0.08, knee: 1.75 } },
  'sit-read': { label: '座って新聞を読む', lean: 0.06, tilt: -0.12, head: [0.3, 0], l: { flex: 0.5, abd: 0.4, elbow: 1.45, turn: 0.6, curl: 1.2 }, r: { flex: 0.5, abd: 0.4, elbow: 1.45, turn: 0.6, curl: 1.2 }, ll: { flex: 1.47, abd: 0.12, knee: 1.5 }, rl: { flex: 1.47, abd: 0.12, knee: 1.5 } },
  drive: { label: '運転する', lean: -0.22, tilt: -0.2, head: [0.2, 0], l: { flex: 0.55, abd: 0.2, twist: 0.15, elbow: 0.7, turn: 0.6, curl: 1.4 }, r: { flex: 0.55, abd: 0.2, twist: 0.15, elbow: 0.7, turn: 0.6, curl: 1.4 }, ll: { flex: 1.2, abd: 0.12, knee: 0.95, foot: 0.25 }, rl: { flex: 1.15, abd: 0.1, knee: 0.75, foot: 0.45 } },
  ride: { label: '助手席や後部座席に座る', lean: -0.22, tilt: -0.2, head: [0.2, -0.15], l: { flex: 0.15, abd: 0.1, twist: 0.4, elbow: 0.95, turn: -1.2, curl: 0.5 }, r: { flex: 0.15, abd: 0.1, twist: 0.4, elbow: 0.95, turn: -1.2, curl: 0.5 }, ll: { flex: 1.25, abd: 0.08, knee: 1.05, foot: 0.1 }, rl: { flex: 1.25, abd: 0.08, knee: 1.05, foot: 0.1 } },
} as const satisfies Record<string, Pose>;
export type PoseId = keyof typeof POSES;

// --- Bodies. Lengths are shares of the body's height without the head's extra size; widths are metres on a 1.78 m body. ---
/** Rows up the trunk: height above the hips, half width, depth to the front and to the back. */
const TRUNK = {
  m: [[-0.055, 0.07, 0.05, 0.05], [-0.035, 0.15, 0.095, 0.1], [0, 0.172, 0.105, 0.122], [0.045, 0.165, 0.105, 0.112], [0.09, 0.148, 0.1, 0.095], [0.14, 0.152, 0.105, 0.098], [0.2, 0.162, 0.122, 0.108], [0.25, 0.17, 0.118, 0.11], [0.285, 0.176, 0.095, 0.1], [0.31, 0.128, 0.07, 0.085], [0.33, 0.066, 0.055, 0.066]],
  f: [[-0.055, 0.07, 0.05, 0.05], [-0.035, 0.155, 0.092, 0.105], [0, 0.178, 0.1, 0.125], [0.045, 0.165, 0.098, 0.11], [0.09, 0.124, 0.088, 0.085], [0.14, 0.13, 0.1, 0.088], [0.2, 0.142, 0.132, 0.098], [0.25, 0.148, 0.108, 0.098], [0.285, 0.152, 0.085, 0.09], [0.31, 0.11, 0.064, 0.076], [0.33, 0.056, 0.048, 0.056]],
} as const;
const LEN = { thigh: 0.245, shin: 0.235, ankle: 0.04, upper: 0.165, fore: 0.145, hand: 0.105, foot: 0.152, shoulder: 0.26, neck: 0.325 };
const ARM: [number, number][] = [[0, 0.05], [0.5, 0.046], [0.9, 0.04], [1, 0.04], [1.2, 0.042], [1.6, 0.034], [2, 0.027]];
const LEGS: [number, number][] = [[0, 0.088], [0.3, 0.083], [0.8, 0.061], [1, 0.057], [1.3, 0.058], [1.7, 0.043], [2, 0.037]];

// Head, in head heights: y from the chin (0) to the crown (1), z forward.
const HEAD_W: [number, number][] = [[0, 0.07], [0.04, 0.145], [0.12, 0.22], [0.25, 0.28], [0.4, 0.318], [0.55, 0.335], [0.7, 0.335], [0.85, 0.29], [0.95, 0.19], [1, 0]];
const HEAD_F: [number, number][] = [[0, 0.3], [0.05, 0.36], [0.12, 0.385], [0.19, 0.375], [0.225, 0.395], [0.3, 0.385], [0.34, 0.4], [0.5, 0.385], [0.6, 0.41], [0.75, 0.42], [0.9, 0.33], [0.97, 0.2], [1, 0]];
/** The front without the lips, the chin and the brow, which only show near the middle of the face. */
const HEAD_F0: [number, number][] = [[0, 0.29], [0.05, 0.345], [0.12, 0.37], [0.2, 0.378], [0.3, 0.383], [0.4, 0.386], [0.5, 0.388], [0.6, 0.405], [0.75, 0.42], [0.9, 0.33], [0.97, 0.2], [1, 0]];
const HEAD_B: [number, number][] = [[0, 0.15], [0.05, 0], [0.12, -0.15], [0.25, -0.3], [0.4, -0.42], [0.55, -0.46], [0.7, -0.45], [0.85, -0.37], [0.95, -0.22], [1, 0]];
const NOSE: [number, number][] = [[0.3, 0], [0.335, 0.05], [0.37, 0.105], [0.42, 0.08], [0.5, 0.035], [0.56, 0.012], [0.62, 0]];
const HEAD_DU = [0, 0.012, 0.026, 0.045, 0.065, 0.085, 0.11, 0.14, 0.175, 0.21, 0.235, 0.255, 0.272, 0.295, 0.33, 0.37, 0.41, 0.455, 0.5];
const HEAD_US = [...HEAD_DU.slice().reverse().map((d) => 0.5 - d), ...HEAD_DU.slice(1).map((d) => 0.5 + d)];
const HEAD_TS = [0, 0.03, 0.07, 0.12, 0.17, 0.2, 0.225, 0.25, 0.285, 0.315, 0.34, 0.37, 0.41, 0.45, 0.5, 0.55, 0.6, 0.66, 0.73, 0.8, 0.87, 0.93, 0.97, 1];
/** Where the neck meets the skull. */
const PIVOT: V3 = [0, 0.22, -0.08];
function headPt(u: number, t: number, hair: Hair, jaw: number): V3 {
  const du = u - 0.5 - Math.floor(u);
  const ad = Math.abs(du);
  const phi = u * Math.PI * 2;
  const w = table(HEAD_W, t) * lerp(jaw, 1, sstep(0.05, 0.4, t));
  const zf0 = table(HEAD_F0, t);
  const zf = zf0 + (table(HEAD_F, t) - zf0) * Math.exp(-((ad / 0.075) ** 2));
  const zb = table(HEAD_B, t);
  const mid = lerp(zb, zf, 0.45);
  const cs = -Math.cos(phi);
  const sn = Math.sin(phi);
  let x = -w * pw(sn, 0.92);
  let z = cs > 0 ? mid + (zf - mid) * cs ** 0.75 : mid - (mid - zb) * (-cs) ** 0.9;
  // Nose, the hollows of the eyes, lips.
  z += table(NOSE, t) * Math.exp(-((ad / (t < 0.42 ? 0.027 : 0.015)) ** 2));
  z -= 0.022 * Math.exp(-(((ad - 0.065) / 0.035) ** 2 + ((t - 0.5) / 0.05) ** 2));
  z += 0.012 * Math.exp(-((ad / 0.05) ** 2 + ((t - 0.225) / 0.03) ** 2));
  if (!('ears' in hair && hair.ears)) {
    const ear = 0.06 * Math.exp(-(((ad - 0.262) / 0.017) ** 2)) * sstep(0.34, 0.4, t) * sstep(0.62, 0.54, t);
    x -= Math.sign(sn) * ear;
    z -= ear * 0.3;
  }
  const k = hairThick(hair, ad * 2, t);
  if (k > 0) {
    const d = v3.norm([x, (t - 0.5) * 0.9, z + 0.03]);
    x += d[0] * k;
    z += d[2] * k;
    return [x, t + d[1] * k, z];
  }
  return [x, t, z];
}

export type Carry = 'phone' | 'cup' | 'backpack' | 'briefcase' | 'handbag' | 'tote' | 'shopping' | 'paperbag' | 'box' | 'cane' | 'paper' | 'satchel';
export interface Person {
  label: string;
  sex: 'm' | 'f';
  /** Metres. */
  height: number;
  /** 1 is average; below is slim, above is heavy. */
  girth?: number;
  head: HeadId;
  top: TopId;
  bottom: BottomId;
  shoes: ShoeId;
  pose: PoseId;
  hat?: readonly ['cap' | 'hard' | 'beanie', Gear];
  carry?: readonly Carry[];
  /** Shirt worn inside the trousers; sleeves pushed up to the elbow. */
  tucked?: boolean;
  rolled?: boolean;
}
const SKIN_LIMB: Rect = [0.03, 0.03, 0.47, 0.97];
const SKIN_HAND: Rect = [0.505, 0.01, 0.995, 0.99];
const cellRect = (c: [number, number, number, number], meters: readonly [number, number]): Rect => [c[0] / meters[0], c[1] / meters[1], c[2] / meters[0], c[3] / meters[1]];
const gear = (g: Gear): Rect => cellRect(gearCell(g), [1, 1]);

export function buildPerson(b: MeshBuilder, who: Person): void {
  const face = HEADS[who.head];
  const child = face.age < 0.15;
  const elder = face.age > 0.8;
  const pose: Pose = POSES[who.pose];
  const fem = who.sex === 'f';
  const g = who.girth ?? 1;
  // A child's head is large for the body, and the legs short.
  const hh = child ? 0.11 + 0.065 * who.height : 0.13 * who.height;
  const legs = child ? 0.95 : 1;
  const Hb = (who.height - hh) / (0.87 - (1 - legs) * 0.52);
  const k = Hb / 1.78;
  const thin = (fem ? 0.9 : 1) * (child ? 0.92 : 1) * g ** 0.6 * k;
  const skinMat = `person/skin-${face.tone + 1}`;
  const topSpec = TOPS[who.top];
  const botSpec = BOTTOMS[who.bottom];
  const topMat = `person/top-${who.top}`;
  const botMat = `person/bottom-${who.bottom}`;
  const kind = topSpec.kind;
  const skirt = botSpec.kind === 'skirt';
  const gown = kind === 'dress' || kind === 'coat';

  // --- Skeleton. ---
  const trunkRows = TRUNK[child ? 'm' : who.sex];
  const belly = (y: number) => 1 - clamp(Math.abs(y - 0.08) / 0.2);
  const prof = (y: number): [number, number, number] => {
    const row = (i: number) => table(trunkRows.map((r) => [r[0], r[i]] as const), y);
    const wide = 1 + (g - 1) * (0.35 + 0.75 * belly(y));
    const deep = 1 + (g - 1) * (0.3 + 1.9 * belly(y));
    const soft = child ? lerp(1, 0.93, belly(y)) : 1;
    return [row(1) * k * wide * (child ? 0.95 : 1) / soft, row(2) * k * deep * (elder && y > 0.15 ? 0.94 : 1), row(3) * k * (1 + (g - 1) * 0.6)];
  };
  const stoop = elder ? 0.14 : 0;
  const lean = (pose.lean ?? 0) + stoop;
  const Mp = rx(pose.tilt ?? 0);
  const bend = (y: number) => sstep(0.0, 0.27, y);
  const frameAt = (y: number): M3 => mm(Mp, mm(rx(lean * bend(y) + stoop * sstep(0.2, 0.33, y)), ry((pose.twist ?? 0) * bend(y))));
  const spine = (y: number): V3 => {
    if (y <= 0) return v3.scale(Mp[1], y * Hb);
    let p: V3 = [0, 0, 0];
    const n = Math.max(1, Math.ceil(y / 0.01));
    for (let i = 0; i < n; i++) p = v3.mad(p, frameAt(((i + 0.5) / n) * y)[1], (y / n) * Hb);
    return p;
  };
  const side = (s: number) => (s > 0 ? pose.l : pose.r) ?? {};
  const legOf = (s: number) => (s > 0 ? pose.ll : pose.rl) ?? {};
  const hipX = 0.085 * k * (fem ? 1.05 : 1) * (1 + (g - 1) * 0.5);
  const [Lt, Ls, aH, Lf] = [LEN.thigh * Hb * legs, LEN.shin * Hb * legs, LEN.ankle * Hb, LEN.foot * Hb * (fem ? 0.94 : 1)];
  const limbs = [1, -1].map((s) => {
    const leg = legOf(s);
    const hip = v3.scale(Mp[0], s * hipX);
    const Mt = mm(Mp, mm(rz(s * (leg.abd ?? 0.04)), rx(-(leg.flex ?? 0))));
    const knee = v3.mad(hip, Mt[1], -Lt);
    const Ms = mm(Mt, rx(leg.knee ?? 0));
    const ankle = v3.mad(knee, Ms[1], -Ls);
    let hd: V3 = [Ms[2][0], 0, Ms[2][2]];
    if (v3.len(hd) < 0.3) hd = [Mt[2][0] - Mt[1][0], 0, Mt[2][2] - Mt[1][2]];
    const Mfoot = mm(ry(Math.atan2(hd[0], hd[2]) + s * 0.12), rx(leg.foot ?? 0));
    const arm = side(s);
    const Mc = frameAt(LEN.shoulder);
    const shX = (fem ? 0.158 : 0.18) * k * (child ? 0.93 : 1) * (1 + (g - 1) * 0.35);
    const sh = v3.mad(spine(LEN.shoulder), Mc[0], s * shX);
    const Mu = mm(Mc, mm(rz(s * (arm.abd ?? 0.1)), mm(rx(-(arm.flex ?? 0)), ry(-s * (arm.twist ?? 0)))));
    const [Lu, Lo] = [LEN.upper * Hb, LEN.fore * Hb];
    const elbow = v3.mad(sh, Mu[1], -Lu);
    const Mo = mm(Mu, rx(-(arm.elbow ?? 0.15)));
    const wrist = v3.mad(elbow, Mo[1], -Lo);
    const Mh = mm(Mo, mm(ry(s * (arm.turn ?? 0)), rz(-s * (arm.wrist ?? 0))));
    return { s, hip, Mt, knee, Ms, ankle, Mfoot, sh, Mu, Mo, elbow, wrist, Mh, curl: arm.curl ?? 0.45 };
  });
  // Stand the lowest part of a sole on the ground.
  let low = Infinity;
  for (const L of limbs) for (const z of [-0.27, 0.45, 0.73]) low = Math.min(low, at(L.ankle, L.Mfoot, [0, -aH, z * Lf])[1]);
  const O: V3 = [0, -low, 0];
  const W = (p: V3): V3 => v3.add(p, O);

  // --- Legs, hips, shoes. ---
  const legRad = (s: number) => table(LEGS, s) * thin * (s < 1 ? 1 + (g - 1) * 0.5 : 1);
  const short = botSpec.kind === 'shorts' ? (botSpec.label.includes('ランニング') ? 0.42 : 0.62) : botSpec.kind === 'cargo' ? 0.9 : 0;
  const hemS = skirt ? 0 : short || 1.94;
  const ease = { jeans: 0.008, slacks: 0.015, chinos: 0.012, shorts: 0.016, cargo: 0.02, sweat: 0.02, leggings: 0.002, skirt: 0, work: 0.018 }[botSpec.kind];
  const straight = botSpec.kind === 'slacks' || botSpec.kind === 'chinos' || botSpec.kind === 'work' ? 0.064 * k : botSpec.kind === 'sweat' ? 0.058 * k : botSpec.kind === 'jeans' ? 0.054 * k : 0;
  const clothRad = (s: number) => Math.max(legRad(s) + ease, s > 0.9 ? straight * (botSpec.kind === 'sweat' && s > 1.85 ? 0.85 : 1) : 0) + (short && s > 0.3 ? 0.012 : 0);
  const LEG_S = [-0.9, -0.55, 0, 0.18, 0.4, 0.62, 0.8, 0.92, 1, 1.08, 1.22, 1.4, 1.6, 1.8, 1.94, 2];
  for (const L of limbs) {
    const st = (rad: (s: number) => number, from: number, to: number) => limb(W(L.hip), L.Mt, Lt, L.Ms, Ls, rad, [...LEG_S.filter((s) => s > from && s < to), from, to].sort((a, c) => a - c));
    if (hemS > 0) tubeOf(b, botMat, st(clothRad, -0.9, hemS), 12, [0.004, 0, 0.596, 1], (s) => 1 - clamp(s / hemS), 'a');
    if (hemS < 1.9) tubeOf(b, skinMat, st(legRad, hemS > 0 ? hemS - 0.06 : -0.9, 2), 10, SKIN_LIMB, (s) => s / 2, hemS > 0 ? '' : 'a');
    shoe(b, who.shoes, W(L.ankle), L.Mfoot, Lf, aH, k * (fem ? 0.92 : 1), hemS < 1.9 || botSpec.kind === 'leggings');
  }
  const NT = 22;
  const tucked = who.tucked || kind === 'uniform';
  const hipEase = tucked ? 0.008 : 0.001;
  const hipTop = 0.085;
  if (!skirt || gown) {
    const rows = [-0.055, -0.035, 0, 0.045, hipTop];
    const grid = rows.map((y) => {
      const [wx, wf, wb] = prof(y);
      return ring(W(spine(y)), Mp, wx + hipEase, wf + hipEase, wb + hipEase, NT, 0.85);
    });
    grid.unshift(grid[0].map(() => W(spine(-0.06))));
    if (!gown || !skirt) skin(b, botMat, grid, steps(NT), [0, 0, 0.14, 0.5, 0.82, 1], [0.624, 0.552, 0.996, 0.998]);
  }
  // What hangs around both legs: a skirt, or the lower part of a dress or a coat. `d` is metres down the legs from the hips.
  const around = (d: number, flare: number, extra: number): V3[] => {
    const q = limbs.map((L) => (d <= Lt ? { p: v3.mad(L.hip, L.Mt[1], -d), y: L.Mt[1] } : { p: v3.mad(L.knee, L.Ms[1], -(d - Lt)), y: L.Ms[1] }));
    const y = v3.norm(v3.add(q[0].y, q[1].y));
    const span = v3.sub(q[0].p, q[1].p);
    const x = v3.norm(v3.sub(span, v3.scale(y, v3.dot(span, y))));
    const r = legRad(clamp(d / Lt, 0, 1) + clamp((d - Lt) / Ls)) + extra + flare * d;
    const deep = (r * 1.04) / Math.sqrt(1 - (v3.len(span) / 2 / (v3.len(span) / 2 + r)) ** 2 * 0.8);
    return ring(W(v3.scale(v3.add(q[0].p, q[1].p), 0.5)), [x, y, v3.cross(x, y)], v3.len(span) / 2 + r, deep, deep * 1.04, NT, 0.9);
  };
  const drops = (len: number) => [0.07, 0.15, 0.24, 0.33, 0.42, 0.52, 0.62, 0.72].filter((d) => d * k < len - 0.03).map((d) => d * k).concat(len);
  if (skirt && !gown) {
    const style = { 'skirt-black': [0.4, 0, 0.004], 'skirt-plaid': [0.29, 0.3, 0.008], 'skirt-denim': [0.3, 0.08, 0.006], 'skirt-beige': [0.6, 0.2, 0.008] }[who.bottom as string] ?? [0.4, 0.1, 0.006];
    const len = style[0] * k;
    const top = [hipTop, 0.045, 0].map((y) => {
      const [wx, wf, wb] = prof(y);
      return ring(W(spine(y)), Mp, wx + 0.01, wf + 0.01, wb + 0.01, NT, 0.85);
    });
    const ds = drops(len);
    const total = hipTop * Hb + len;
    skin(b, botMat, [...top, ...ds.map((d) => around(d, style[1], style[2] + 0.004))], steps(NT), [1, 1 - (0.04 * Hb) / total, 1 - (hipTop * Hb) / total, ...ds.map((d) => 1 - (hipTop * Hb + d) / total)], [0.004, 0.004, 0.596, 0.996]);
  }

  // --- Trunk and what is worn on it. ---
  const thick = { tee: 0.006, tank: 0.004, polo: 0.007, shirt: 0.008, hoodie: 0.02, sweater: 0.016, suit: 0.02, jacket: who.top === 'jacket-puffer' ? 0.045 : 0.02, hivis: 0.014, uniform: 0.008, coat: 0.026, dress: 0.004, scrubs: 0.012, apron: 0.01 }[kind];
  const loose = tucked ? 0 : { tee: 0.93, tank: 0, polo: 0.94, shirt: 0.95, hoodie: 1, sweater: 0.98, suit: 0.99, jacket: 1, hivis: 1, uniform: 0, coat: 1.02, dress: 0, scrubs: 1, apron: 0.96 }[kind];
  const hemY = tucked ? 0.07 : { tee: -0.025, tank: -0.02, polo: -0.025, shirt: -0.03, hoodie: -0.035, sweater: -0.03, suit: -0.07, jacket: -0.02, hivis: -0.03, uniform: 0.07, coat: 0, dress: 0, scrubs: -0.045, apron: -0.03 }[kind];
  const drop = gown ? (kind === 'coat' ? (who.top === 'coat-rain' ? 0.36 : 0.47) : child ? 0.3 : who.top === 'dress-green' ? 0.5 : 0.36) * k : 0;
  const wear = (y: number): [number, number, number] => {
    const p = prof(y);
    if (!loose) return [p[0] + thick, p[1] + thick, p[2] + thick];
    const [a, c] = [prof(0), prof(0.22)];
    const t = clamp(y / 0.22);
    return [0, 1, 2].map((i) => Math.max(p[i] + (y < 0.1 ? 0.005 : 0), loose * lerp(a[i], c[i], t) * (y < 0.26 ? 1 : 0)) + thick) as [number, number, number];
  };
  const neckY = 0.33;
  const ys = [hemY, ...[-0.035, 0, 0.045, 0.09, 0.14, 0.2, 0.25, 0.285, 0.31].filter((y) => y > hemY + 0.012), neckY];
  const total = (neckY - hemY) * Hb + drop;
  const grid = ys.map((y) => {
    const [wx, wf, wb] = wear(y);
    return ring(W(spine(y)), frameAt(y), wx, wf, wb, NT, 0.85);
  });
  const vs = ys.map((y) => (drop + (y - hemY) * Hb) / total);
  if (gown) {
    const ds = drops(drop).reverse();
    const flare = kind === 'coat' ? 0.06 : who.top === 'dress-red' ? 0.1 : 0.22;
    grid.unshift(...ds.map((d) => around(d, flare, thick + 0.012)));
    vs.unshift(...ds.map((d) => (drop - d) / total));
  } else if (hemY < 0) {
    // The hem stands a little off the hips.
    grid[0] = (() => {
      const [wx, wf, wb] = wear(hemY);
      return ring(W(spine(hemY)), frameAt(hemY), wx + 0.004, wf + 0.004, wb + 0.004, NT, 0.85);
    })();
  }
  skin(b, topMat, grid, steps(NT), vs, [0.002, 0.004, 0.658, 0.996]);
  const spare: Rect = [0.895, 0.1, 0.985, 0.9];
  const Mn = frameAt(neckY);
  const neckR = (fem ? 0.047 : 0.058) * k * (child ? 0.85 : 1) * (1 + (g - 1) * 0.5);
  // --- Arms and hands. ---
  const armRad = (s: number) => table(ARM, s) * thin * (fem ? 0.94 : 1);
  const sleeveEase = { tee: 0.008, tank: 0, polo: 0.008, shirt: 0.01, hoodie: 0.018, sweater: 0.014, suit: 0.016, jacket: who.top === 'jacket-puffer' ? 0.036 : 0.016, hivis: 0.01, uniform: 0.009, coat: 0.02, dress: 0.006, scrubs: 0.012, apron: 0.01 }[kind];
  const sleeveS = kind === 'tank' ? 0 : kind === 'tee' || kind === 'polo' || kind === 'scrubs' || (kind === 'uniform' && who.rolled) ? 0.56 : kind === 'dress' ? 0.3 : who.rolled ? 0.86 : 1.95;
  const sleeveRad = (s: number) => armRad(s) + sleeveEase + (sleeveS < 1 && s > 0.2 ? 0.006 : 0) + (who.rolled && sleeveS > 0.8 && s > 0.7 ? 0.006 : 0);
  const ARM_S = [-0.9, -0.55, 0, 0.2, 0.42, 0.62, 0.8, 0.92, 1, 1.08, 1.22, 1.45, 1.7, 1.9, 2];
  const hands: { grip: V3; Mh: M3; palm: V3; s: number }[] = [];
  for (const L of limbs) {
    const st = (rad: (s: number) => number, from: number, to: number) => limb(W(L.sh), L.Mu, LEN.upper * Hb, L.Mo, LEN.fore * Hb, rad, [...ARM_S.filter((s) => s > from && s < to), from, to].sort((a, c) => a - c));
    if (sleeveS > 0) tubeOf(b, topMat, st(sleeveRad, -0.9, sleeveS), 10, [0.684, 0.004, 0.856, 0.996], (s) => 1 - clamp(s / sleeveS), 'a');
    if (sleeveS < 1.9) tubeOf(b, skinMat, st(armRad, sleeveS > 0 ? sleeveS - 0.08 : -0.9, 2), 10, SKIN_LIMB, (s) => s / 2, sleeveS > 0 ? '' : 'a');
    // The hand: flat, its back outwards, the fingers curling towards the palm at two joints.
    const { s, Mh } = L;
    const hl = LEN.hand * Hb;
    const hk = k * (fem ? 0.9 : 1) * (child ? 0.95 : 1);
    const wristP = W(L.wrist);
    const M1 = mm(Mh, rz(-s * L.curl * 0.55));
    const M2 = mm(M1, rz(-s * L.curl * 0.75));
    const knuckle = v3.mad(wristP, Mh[1], -hl * 0.47);
    const midJ = v3.mad(knuckle, M1[1], -hl * 0.25);
    const rows: [V3, M3, number, number, number][] = [
      [wristP, Mh, 0.02, 0.028, 0], [v3.mad(wristP, Mh[1], -hl * 0.16), Mh, 0.015, 0.04, 0.17], [knuckle, mm(Mh, rz(-s * L.curl * 0.27)), 0.013, 0.046, 0.5],
      [midJ, mm(M1, rz(-s * L.curl * 0.37)), 0.0105, 0.043, 0.74], [v3.mad(midJ, M2[1], -hl * 0.24), M2, 0.008, 0.037, 0.95], [v3.mad(midJ, M2[1], -hl * 0.28), M2, 0.004, 0.022, 1],
    ];
    const HN = 10;
    const hg = rows.map(([c, m, t, w]) => steps(HN).map((_, j) => {
      const phi = ((j % HN) / HN) * Math.PI * 2;
      return at(c, m, [s * t * hk * pw(Math.sin(phi), 0.6), 0, -w * hk * pw(Math.cos(phi), 0.8)]);
    }));
    hg.push(hg[0].map(() => rows[5][0]));
    skin(b, skinMat, hg, steps(HN), [...rows.map((r) => r[4]), 1], SKIN_HAND);
    const thumb = (palm: number, along: number, z: number): V3 => at(wristP, Mh, [-s * palm * hk, -along * hl, z * hk]);
    const open = 1 - clamp(L.curl / 1.4);
    strap(b, skinMat, SKIN_LIMB, [thumb(0.004, 0.1, 0.026), thumb(0.012, 0.3, 0.05 + 0.006 * open), thumb(0.024 + 0.012 * (1 - open), 0.52, 0.058 + 0.012 * open)], 0.024 * hk, 0.02 * hk, Mh[2], 6);
    hands.push({ grip: at(wristP, Mh, [-s * 0.03 * hk, -hl * 0.55, 0.004]), Mh, palm: v3.scale(Mh[0], -s), s });
  }
  const hand = (s: number) => hands.find((h) => h.s === s)!;

  // --- Neck and head. ---
  const headM = mm(Mn, mm(ry(pose.head?.[1] ?? 0), rx((pose.head?.[0] ?? 0) - stoop * 0.8)));
  const neckBase = W(spine(0.318));
  const neckTop = v3.mad(W(spine(neckY)), mm(Mn, rx(stoop * 0.6))[1], 0.045 * Hb);
  const Mk: M3 = (() => {
    const y = v3.norm(v3.add(Mn[1], headM[1]));
    const x = v3.norm(v3.sub(Mn[0], v3.scale(y, v3.dot(Mn[0], y))));
    return [x, y, v3.cross(x, y)];
  })();
  skin(b, skinMat, [ring(neckBase, Mn, neckR * 1.25, neckR * 1.05, neckR * 1.2, 12), ring(v3.lerp(neckBase, neckTop, 0.45), Mk, neckR, neckR, neckR, 12), ring(v3.mad(neckTop, headM[1], 0.03 * hh), headM, neckR * 0.98, neckR * 1.02, neckR, 12), ring(v3.mad(neckTop, headM[1], 0.22 * hh), headM, neckR * 0.9, neckR, neckR * 0.9, 12)], steps(12), [0, 0.3, 0.7, 1], SKIN_LIMB);
  const hair: Hair = who.hat && HAIRS[face.style].thick > 0.03 ? { ...HAIRS[face.style], thick: 0.022, crown: 0.022 } : HAIRS[face.style];
  const jaw = fem ? 0.92 : child ? 0.96 : 1;
  const headMat = `person/head-${who.head}`;
  const hp = (q: V3): V3 => at(neckTop, headM, v3.scale(v3.sub(q, PIVOT), hh));
  skin(b, headMat, HEAD_TS.map((t) => HEAD_US.map((u) => hp(headPt(u === 1 ? 0 : u, t, hair, jaw)))), HEAD_US, HEAD_TS, [0, 0, 1, 1]);
  // Hair that hangs: a curtain around the back from ear to ear, a tail, a knot.
  const style = HAIRS[face.style] as Hair;
  if (style.ears && style.thick < 0.1) {
    const long = style.tail === 'long';
    const us = steps(14).map((q) => lerp(-0.3, 0.3, q));
    const ts = long ? [0.36, 0.22, 0.08, -0.06, -0.2, -0.34, -0.46] : [0.36, 0.24, 0.12, 0.02, -0.04];
    const rows = ts.map((t) => us.map((u) => {
      const top = headPt((u + 1) % 1, 0.36, hair, jaw);
      const fall = clamp((0.36 - t) / 0.4);
      const far = clamp(-t / 0.46);
      return hp([top[0] * lerp(1, long ? 0.6 : 0.92, long ? far : fall) * (1 + 0.04 * fall), t, lerp(top[2], long ? -0.62 : top[2] - 0.02, long ? far ** 0.7 : fall) - 0.01]);
    }));
    skin(b, headMat, rows, us.map((u) => u), ts.map((t) => lerp(0.12, 0.36, (t - ts[ts.length - 1]) / (0.36 - ts[ts.length - 1]))), [0, 0, 1, 1], false);
  }
  const lock: Rect = [-0.07, 0.34, 0.07, 0.62];
  const tail = (pts: V3[], r: number[]): void => {
    const g2 = pts.map((q, i) => ring(hp(q), headM, r[i] * hh, r[i] * hh, r[i] * hh, 8));
    g2.unshift(g2[0].map(() => hp(pts[0])));
    g2.push(g2[0].map(() => hp(pts[pts.length - 1])));
    skin(b, headMat, g2, steps(8), steps(g2.length - 1), lock);
  };
  if (style.tail === 'pony') tail([[0, 0.74, -0.44], [0, 0.72, -0.56], [0, 0.56, -0.66], [0, 0.34, -0.66], [0, 0.12, -0.6], [0, -0.02, -0.57]], [0.05, 0.085, 0.09, 0.08, 0.06, 0.03]);
  if (style.tail === 'bun') tail([[0, 0.8, -0.4], [0, 0.82, -0.47], [0, 0.84, -0.56], [0, 0.86, -0.63]], [0.06, 0.12, 0.12, 0.06]);
  if (style.tail === 'twin') for (const s of [-1, 1]) tail([[s * 0.3, 0.5, -0.2], [s * 0.38, 0.42, -0.24], [s * 0.4, 0.2, -0.24], [s * 0.38, -0.02, -0.2]], [0.04, 0.075, 0.07, 0.03]);

  // --- Collars and hoods. ---
  if (kind === 'shirt' || kind === 'polo' || kind === 'suit' || kind === 'uniform' || kind === 'coat' || kind === 'hivis' || kind === 'apron' || (kind === 'jacket' && who.top !== 'jacket-puffer')) {
    const up = kind === 'coat' || kind === 'jacket' ? 0.05 : 0.034;
    const c0 = W(spine(neckY - 0.012));
    skin(b, topMat, [ring(c0, Mn, neckR * 1.5, neckR * 1.25, neckR * 1.45, 12), ring(v3.mad(c0, Mn[1], up * k), Mn, neckR * 1.22, neckR * 1.3, neckR * 1.22, 12)], steps(12), [0, 1], spare);
  }
  if (kind === 'hoodie' || who.top === 'coat-rain' || who.top === 'jacket-puffer') {
    const c0 = W(spine(neckY - 0.02));
    const rows: [number, number, number, number][] = [[0, -0.02, 0.11, 0.06], [0.03, -0.06, 0.115, 0.075], [0.065, -0.07, 0.09, 0.06], [0.085, -0.05, 0.05, 0.03]];
    const g2 = rows.map(([y, z, wx, wz]) => ring(at(c0, Mn, [0, y * k, z * k]), Mn, wx * k, wz * k, wz * k, 12));
    g2.unshift(g2[0].map(() => at(c0, Mn, [0, 0, -0.02 * k])));
    g2.push(g2[0].map(() => at(c0, Mn, [0, 0.09 * k, -0.045 * k])));
    skin(b, topMat, g2, steps(12), steps(g2.length - 1), spare);
  }

  // --- Hats. ---
  if (who.hat) {
    const [hat, cloth] = who.hat;
    const lift = hat === 'hard' ? 0.05 : 0.028;
    const from = hat === 'beanie' ? 0.62 : 0.7;
    const ts = [from, from + 0.07, 0.86, 0.93, 0.975, 1];
    const us = steps(20);
    const dome = (u: number, t: number, more = 0): V3 => {
      const q = headPt(u % 1, t, hair, jaw);
      const d = v3.norm([q[0], (t - 0.45) * (hat === 'hard' ? 1.2 : 0.8), q[2] + 0.03]);
      return v3.mad(q, d, lift + more);
    };
    skin(b, 'person/gear', ts.map((t) => us.map((u) => hp(dome(u, t)))), us, steps(ts.length - 1), gear(cloth));
    if (hat !== 'beanie') {
      // The brim: a peak at the front of a cap, all the way around a hard hat.
      const peak = (u: number): number => (hat === 'hard' ? 0.06 + 0.05 * sstep(0.3, 0.5, 1 - Math.abs(u - 0.5) * 2) : 0.3 * Math.max(0, Math.cos(((u - 0.5) / 0.17) * (Math.PI / 2))) ** 0.6);
      const bu = hat === 'hard' ? us : steps(10).map((q) => lerp(0.33, 0.67, q));
      const inner = bu.map((u) => hp(dome(u, from)));
      const outer = bu.map((u) => {
        const q = dome(u, from);
        const d = v3.norm([q[0], 0, q[2] + 0.03]);
        return hp(v3.add(v3.mad(q, hat === 'hard' ? d : [0, 0, 1], peak(u)), [0, -0.03, 0]));
      });
      const up = bu.map((_, j) => v3.mad(inner[j], headM[1], 0.012 * hh));
      skin(b, 'person/gear', [up, outer.map((q) => v3.mad(q, headM[1], 0.01 * hh)), outer, inner], bu, [0, 0.4, 0.45, 0.9], gear(cloth), hat === 'hard');
    }
  }

  // --- Things carried. ---
  const Mc = frameAt(0.2);
  const back = (y: number, z = 0): V3 => at(W(spine(y)), frameAt(y), [0, 0, -(wear(y)[2] + z)]);
  const shoulderTop = (s: number, z: number): V3 => at(W(spine(0.3)), frameAt(0.3), [s * (fem ? 0.1 : 0.115) * k, 0.012 * Hb, z]);
  const hang = (h: { grip: V3 }, dy: number): V3 => [h.grip[0], h.grip[1] - dy, h.grip[2]];
  const handles = (h: { grip: V3 }, top: V3, w: number, cloth: Gear, axis: V3 = [0, 0, 1]): void => {
    for (const s of [-1, 1]) strap(b, 'person/gear', gear(cloth), [v3.mad(top, axis, s * w), v3.lerp(v3.mad(top, axis, s * w), h.grip, 0.75), h.grip], 0.012, 0.006);
  };
  for (const item of who.carry ?? []) {
    const R = hand(-1);
    const Lh = hand(1);
    if (item === 'phone') {
      // A right-handed frame: the screen faces out of the palm, its top at the fingertips.
      const m: M3 = [v3.scale(v3.cross(R.Mh[1], R.palm), -1), v3.scale(R.Mh[1], -1), R.palm];
      crate(b, 'person/gear', [0.26, 0.26, 0.262, 0.262], v3.mad(v3.mad(R.grip, R.Mh[1], -0.02), R.palm, 0.018), m, [0.036, 0.075, 0.004], cellRect(gearCell('phone'), [1, 1]));
    } else if (item === 'cup') {
      const h = pose.l?.curl && pose.l.curl > 1 ? Lh : R;
      const c = v3.mad(h.grip, h.palm, 0.03);
      const up: V3 = [0, 1, 0];
      const x = v3.norm(v3.cross(up, h.palm));
      const m: M3 = [x, up, v3.cross(x, up)];
      const rows: [number, number][] = [[-0.06, 0.028], [0.05, 0.04], [0.055, 0.043], [0.066, 0.041]];
      const g2 = rows.map(([y, r]) => ring(v3.mad(c, up, y), m, r, r, r, 10));
      g2.unshift(g2[0].map(() => v3.mad(c, up, -0.06)));
      g2.push(g2[0].map(() => v3.mad(c, up, 0.066)));
      skin(b, 'person/gear', g2, steps(10), [0, 0, 0.8, 0.86, 1, 1], gear('cup'));
    } else if (item === 'backpack') {
      const cloth: Gear = child ? 'nylon-red' : who.sex === 'f' ? 'canvas' : 'nylon-black';
      const s2 = child ? 0.8 : 1;
      const rows: [number, number, number][] = [[0.07, 0.1, 0.05], [0.09, 0.135, 0.08], [0.16, 0.145, 0.09], [0.24, 0.14, 0.075], [0.29, 0.11, 0.045]];
      const g2 = rows.map(([y, w, d]) => ring(back(y, d * s2 * k), frameAt(y), w * s2 * k, d * s2 * k, d * s2 * k, 12, 0.6));
      g2.unshift(g2[0].map(() => back(rows[0][0], rows[0][2] * s2 * k)));
      g2.push(g2[0].map(() => back(0.29, 0.04 * k)));
      skin(b, 'person/gear', g2, steps(12), steps(g2.length - 1), gear(cloth));
      for (const s of [-1, 1]) {
        const front = (y: number, in2: number): V3 => at(W(spine(y)), frameAt(y), [s * in2 * k, 0, wear(y)[1] * 0.93 + 0.006]);
        strap(b, 'person/gear', gear(cloth), [back(0.29, 0.0), shoulderTop(s, -0.03 * k), shoulderTop(s, 0.035 * k), front(0.25, 0.118), front(0.19, 0.13), at(W(spine(0.12)), frameAt(0.12), [s * (wear(0.12)[0] + 0.004), 0, 0]), back(0.1, 0.01)].map((q, i) => (i === 0 || i === 6 ? v3.mad(q, Mc[0], s * 0.09 * k) : q)), 0.04 * k, 0.01, Mc[0]);
      }
    } else if (item === 'briefcase' || item === 'shopping' || item === 'paperbag' || item === 'tote') {
      const h = item === 'tote' ? Lh : R;
      const [cloth, half, dy]: [Gear, V3, number] = item === 'briefcase' ? ['leather-brown', [0.045, 0.15, 0.21], 0.2] : item === 'shopping' ? ['bag-white', [0.06, 0.17, 0.15], 0.3] : item === 'paperbag' ? ['kraft', [0.07, 0.19, 0.13], 0.3] : ['canvas', [0.05, 0.16, 0.17], 0.32];
      const c = hang(h, dy * k + 0.02);
      crate(b, 'person/gear', gear(cloth), c, ry(0), v3.scale(half, k) as V3);
      if (item === 'briefcase') strap(b, 'person/gear', gear('nylon-black'), [[c[0], c[1] + half[1] * k, c[2] - 0.05], [c[0], h.grip[1], c[2] - 0.045], [c[0], h.grip[1], c[2] + 0.045], [c[0], c[1] + half[1] * k, c[2] + 0.05]], 0.02, 0.012);
      else for (const s of [-1, 1]) handles(h, [c[0] + s * half[0] * k * 0.8, c[1] + half[1] * k, c[2]], 0.06, item === 'paperbag' ? 'kraft' : item === 'tote' ? 'canvas' : 'bag-white');
    } else if (item === 'handbag' || item === 'satchel') {
      // Slung from a shoulder to the opposite hip (a satchel), or hung from one shoulder under the arm (a handbag).
      const s = item === 'satchel' ? -1 : 1;
      const cloth: Gear = item === 'satchel' ? 'canvas' : 'leather-brown';
      const y0 = item === 'satchel' ? 0.0 : 0.07;
      const hipP = at(W(spine(y0)), frameAt(y0), [s * (wear(y0)[0] + (item === 'satchel' ? 0.05 : 0.075) * k), 0, item === 'satchel' ? -0.03 : 0.0]);
      crate(b, 'person/gear', gear(cloth), hipP, frameAt(y0), item === 'satchel' ? [0.045 * k, 0.12 * k, 0.17 * k] : [0.04 * k, 0.095 * k, 0.14 * k]);
      const top = v3.mad(hipP, frameAt(y0)[1], (item === 'satchel' ? 0.12 : 0.095) * k);
      const over = item === 'satchel' ? 1 : -1;
      const sh = shoulderTop(-s * over, 0);
      if (item === 'satchel') {
        // The strap lies on the chest and on the back, up to the other shoulder.
        const on = (y: number, turn: number): V3 => {
          const [wx, wf, wb] = wear(y);
          const cs = -Math.cos(turn * Math.PI * 2);
          return at(W(spine(y)), frameAt(y), [-(wx + 0.008) * pw(Math.sin(turn * Math.PI * 2), 0.85), 0, ((cs > 0 ? wf : wb) + 0.008) * pw(cs, 0.85)]);
        };
        const path = (to: number): V3[] => steps(6).map((q) => on(lerp(y0 + 0.05, 0.3, q), lerp(0.25, to, q ** 0.8)));
        strap(b, 'person/gear', gear(cloth), [v3.mad(top, Mc[2], 0.08 * k), ...path(0.66), v3.mad(sh, Mc[2], 0.03 * k), v3.mad(sh, Mc[2], -0.03 * k), ...path(-0.16).reverse(), v3.mad(top, Mc[2], -0.08 * k)], 0.035 * k, 0.008, Mc[0]);
      } else strap(b, 'person/gear', gear(cloth), [v3.mad(top, Mc[2], 0.08 * k), v3.mad(sh, Mc[2], 0.04 * k), v3.mad(sh, Mc[2], -0.04 * k), v3.mad(top, Mc[2], -0.08 * k)], 0.022 * k, 0.008, Mc[0]);
    } else if (item === 'box') {
      const c = v3.scale(v3.add(R.grip, Lh.grip), 0.5);
      crate(b, 'person/gear', gear('kraft'), [c[0], c[1] + 0.1 * k, c[2] + 0.02], rx(0), [Math.abs(Lh.grip[0] - R.grip[0]) / 2 - 0.012, 0.15 * k, 0.17 * k]);
    } else if (item === 'cane') {
      strap(b, 'person/gear', gear('wood'), [[R.grip[0] + 0.01, R.grip[1] + 0.035, R.grip[2] - 0.06], [R.grip[0], R.grip[1] + 0.04, R.grip[2]], [R.grip[0], R.grip[1] + 0.03, R.grip[2] + 0.05], [R.grip[0] - 0.01, 0.01, R.grip[2] + 0.17]], 0.024, 0.024, [1, 0, 0], 6);
    } else if (item === 'paper') {
      const c = v3.scale(v3.add(R.grip, Lh.grip), 0.5);
      const w = Math.max(0.27, Math.abs(Lh.grip[0] - R.grip[0]) / 2 + 0.02);
      for (const s of [-1, 1]) crate(b, 'person/gear', gear('paper'), [c[0] + (s * w) / 2, c[1] + 0.1, c[2] + 0.02 + 0.012 * 1], mm(ry(s * 0.22), rx(-0.5)), [w / 2, 0.18, 0.002]);
    }
  }
  // The soles, exactly on the ground.
  const parts = [headMat, skinMat, topMat, botMat, 'person/shoes', 'person/gear'].map((m) => b.part(m));
  let floor = Infinity;
  for (const part of parts) for (let i = 1; i < part.positions.length; i += 3) floor = Math.min(floor, part.positions[i]);
  for (const part of parts) for (let i = 1; i < part.positions.length; i += 3) part.positions[i] -= floor;
}

/** A shoe around the foot: its frame's front is the toe, and the ankle is `aH` above the sole. */
function shoe(b: MeshBuilder, id: ShoeId, ankle: V3, m: M3, len: number, aH: number, k: number, shaft: boolean): void {
  const cell = cellRect(shoeCell(id), [1, 0.5]);
  const boot = id.startsWith('boot');
  const L = len * 1.08;
  const w = 0.05 * k;
  const h = aH + (boot ? 0.05 : 0.028) * k;
  // Along the shoe: share of its length, width, height.
  const rows: [number, number, number][] = [[0.02, 0.5, 0.7], [0.1, 0.8, 0.95], [0.25, 0.9, 1], [0.42, 0.98, 0.86], [0.58, 1.04, 0.66], [0.74, 1.04, 0.5], [0.87, 0.9, 0.42], [0.96, 0.6, 0.32]];
  const N = 12;
  const at2 = (f: number, x: number, y: number): V3 => at(ankle, m, [x, y - aH, (f - 0.27) * L]);
  const grid = rows.map(([f, ww, hh]) => steps(N).map((_, j) => {
    const phi = ((j % N) / N) * Math.PI * 2;
    const c = Math.cos(phi);
    return at2(f, -w * ww * pw(Math.sin(phi), 0.7), (h * hh * (1 - (c > 0 ? c ** 0.35 : -((-c) ** 0.8)))) / 2);
  }));
  grid.unshift(grid[0].map(() => at2(0, 0, h * 0.3)));
  grid.push(grid[0].map(() => at2(1, 0, h * 0.14)));
  // Around a ring is up the cell; along the shoe is across it.
  const p0 = b.part('person/shoes').positions.length;
  skin(b, 'person/shoes', grid, steps(N), [0, ...rows.map((r) => r[0]), 1], [cell[0], cell[1], cell[2], cell[3]]);
  // Swap the texture's axes for the rows just added.
  const part = b.part('person/shoes');
  for (let i = p0 / 3; i < part.positions.length / 3; i++) {
    const u = (part.uvs[i * 2] - cell[0]) / (cell[2] - cell[0]);
    const v = (part.uvs[i * 2 + 1] - cell[1]) / (cell[3] - cell[1]);
    part.uvs[i * 2] = lerp(cell[0], cell[2], v);
    part.uvs[i * 2 + 1] = lerp(cell[1], cell[3], u);
  }
  if (boot && shaft) {
    const plain: Rect = [lerp(cell[0], cell[2], 0.2), lerp(cell[1], cell[3], 0.22), lerp(cell[0], cell[2], 0.33), lerp(cell[1], cell[3], 0.3)];
    skin(b, 'person/shoes', [0.02, 0.07, 0.12].map((y) => ring(at(ankle, m, [0, y * k - 0.01, -0.012 * k]), m, 0.05 * k, 0.056 * k, 0.05 * k, 10)), steps(10), [0, 0.5, 1], plain);
  }
}

export const PEOPLE = {
  'office-man': { label: '会社員の男性 鞄を持って歩く', sex: 'm', height: 1.79, head: 'm-1', top: 'suit-navy', bottom: 'slacks-navy', shoes: 'leather-black', pose: 'carry', carry: ['briefcase'] },
  'office-man-call': { label: '会社員の男性 電話で話す', sex: 'm', height: 1.75, girth: 1.08, head: 'm-6', top: 'suit-grey', bottom: 'slacks-grey', shoes: 'leather-brown', pose: 'call', carry: ['phone'] },
  'office-woman': { label: '会社員の女性 鞄を肩にかけて立つ', sex: 'f', height: 1.66, head: 'f-4', top: 'blazer', bottom: 'skirt-black', shoes: 'flat', pose: 'relaxed', carry: ['handbag'] },
  'office-woman-walk': { label: '会社員の女性 コーヒーを持って歩く', sex: 'f', height: 1.7, head: 'f-1', top: 'shirt-white', bottom: 'slacks-grey', shoes: 'flat', pose: 'cup', carry: ['cup', 'handbag'], tucked: true },
  'manager': { label: '年配の会社員 立つ', sex: 'm', height: 1.74, girth: 1.18, head: 'm-8', top: 'suit-black', bottom: 'slacks-black', shoes: 'leather-black', pose: 'pockets' },
  'student-man': { label: '学生の男性 スマートフォンを見る', sex: 'm', height: 1.81, girth: 0.92, head: 'm-4', top: 'hoodie-grey', bottom: 'jeans-blue', shoes: 'sneaker-white', pose: 'phone', carry: ['phone', 'backpack'] },
  'student-woman': { label: '学生の女性 リュックを背負って歩く', sex: 'f', height: 1.64, girth: 0.94, head: 'f-3', top: 'tee-hoops', bottom: 'jeans-light', shoes: 'sneaker-white', pose: 'stride', carry: ['backpack'] },
  'teen': { label: '10代の男性 トラックジャケット', sex: 'm', height: 1.7, girth: 0.9, head: 'm-10', top: 'jacket-track', bottom: 'sweat-black', shoes: 'sneaker-black', pose: 'pockets' },
  'jogger-man': { label: 'ジョギングする男性', sex: 'm', height: 1.8, girth: 0.93, head: 'm-12', top: 'tank-black', bottom: 'shorts-black', shoes: 'runner', pose: 'run' },
  'jogger-woman': { label: 'ジョギングする女性', sex: 'f', height: 1.68, girth: 0.93, head: 'f-11', top: 'tank-pink', bottom: 'leggings', shoes: 'runner', pose: 'run' },
  'worker': { label: '作業員 腰に手を当てて立つ', sex: 'm', height: 1.77, girth: 1.08, head: 'm-2', top: 'hivis-yellow', bottom: 'work-navy', shoes: 'boot-tan', pose: 'hips', hat: ['hard', 'plastic-yellow'] },
  'worker-box': { label: '作業員 箱を運ぶ', sex: 'm', height: 1.83, girth: 1.12, head: 'm-7', top: 'hivis-orange', bottom: 'work-tan', shoes: 'boot-tan', pose: 'hold', hat: ['hard', 'plastic-white'], carry: ['box'] },
  'police-man': { label: '警察官の男性', sex: 'm', height: 1.84, girth: 1.05, head: 'm-11', top: 'police', bottom: 'police', shoes: 'boot-black', pose: 'hips', hat: ['cap', 'cap-navy'], rolled: true },
  'police-woman': { label: '警察官の女性', sex: 'f', height: 1.7, head: 'f-11', top: 'police', bottom: 'police', shoes: 'boot-black', pose: 'stand', hat: ['cap', 'cap-navy'] },
  'guard': { label: '警備員', sex: 'm', height: 1.78, girth: 1.2, head: 'm-13', top: 'guard', bottom: 'slacks-black', shoes: 'leather-black', pose: 'stand', hat: ['cap', 'cap-navy'], rolled: true },
  'courier': { label: '配達員 箱を運ぶ', sex: 'm', height: 1.76, head: 'm-3', top: 'courier', bottom: 'chinos-brown', shoes: 'boot-black', pose: 'hold', carry: ['box'], hat: ['cap', 'cap-red'], rolled: true },
  'elder-man': { label: '高齢の男性 杖をついて歩く', sex: 'm', height: 1.68, head: 'm-9', top: 'cardigan', bottom: 'chinos-khaki', shoes: 'leather-brown', pose: 'cane', carry: ['cane'] },
  'elder-woman': { label: '高齢の女性 買い物袋を持つ', sex: 'f', height: 1.55, girth: 1.1, head: 'f-6', top: 'coat-camel', bottom: 'skirt-beige', shoes: 'flat', pose: 'carry', carry: ['shopping'] },
  'elder-sit': { label: '高齢の男性 座って新聞を読む', sex: 'm', height: 1.7, girth: 1.1, head: 'm-5', top: 'sweater-green', bottom: 'slacks-grey', shoes: 'leather-brown', pose: 'sit-read', carry: ['paper'] },
  'heavy-man': { label: '太った男性 立つ', sex: 'm', height: 1.76, girth: 1.42, head: 'm-13', top: 'polo-green', bottom: 'chinos-olive', shoes: 'sneaker-black', pose: 'relaxed' },
  'heavy-woman': { label: '太った女性 トートバッグを持って歩く', sex: 'f', height: 1.62, girth: 1.36, head: 'f-10', top: 'dress-green', bottom: 'leggings', shoes: 'flat', pose: 'stride', carry: ['tote'] },
  'boy': { label: '男の子 リュックを背負って走る', sex: 'm', height: 1.3, head: 'boy-1', top: 'tee-yellow', bottom: 'shorts-navy', shoes: 'sneaker-white', pose: 'run', carry: ['backpack'] },
  'boy-stand': { label: '男の子 立つ', sex: 'm', height: 1.18, head: 'boy-2', top: 'tee-red', bottom: 'shorts-red', shoes: 'sneaker-black', pose: 'stand' },
  'girl': { label: '女の子 手を振る', sex: 'f', height: 1.24, head: 'girl-1', top: 'dress-floral', bottom: 'leggings', shoes: 'sneaker-white', pose: 'wave' },
  'girl-walk': { label: '女の子 歩く', sex: 'f', height: 1.36, head: 'girl-2', top: 'hoodie-maroon', bottom: 'skirt-plaid', shoes: 'sneaker-white', pose: 'walk' },
  'tourist': { label: '観光客 指をさす', sex: 'm', height: 1.76, girth: 1.15, head: 'm-8', top: 'shirt-check', bottom: 'cargo', shoes: 'sneaker-white', pose: 'point', hat: ['cap', 'cap-red'], carry: ['satchel'] },
  'woman-dress': { label: '赤いワンピースの女性 買い物袋を持って歩く', sex: 'f', height: 1.69, girth: 0.95, head: 'f-5', top: 'dress-red', bottom: 'leggings', shoes: 'flat', pose: 'carry', carry: ['shopping'] },
  'woman-floral': { label: '花柄のワンピースの女性 立つ', sex: 'f', height: 1.63, head: 'f-9', top: 'dress-floral', bottom: 'leggings', shoes: 'flat', pose: 'relaxed', carry: ['handbag'] },
  'woman-scarf': { label: 'スカーフの女性 歩く', sex: 'f', height: 1.62, head: 'f-8', top: 'coat-black', bottom: 'slacks-black', shoes: 'flat', pose: 'step', carry: ['tote'] },
  'woman-jeans': { label: 'デニムジャケットの女性 電話で話す', sex: 'f', height: 1.67, head: 'f-2', top: 'jacket-denim', bottom: 'jeans-black', shoes: 'sneaker-white', pose: 'call', carry: ['phone'] },
  'woman-sweater': { label: 'セーターの女性 立つ', sex: 'f', height: 1.72, head: 'f-7', top: 'sweater-cream', bottom: 'skirt-denim', shoes: 'boot-black', pose: 'stand' },
  'man-leather': { label: '革ジャケットの男性 壁にもたれる', sex: 'm', height: 1.82, head: 'm-11', top: 'jacket-leather', bottom: 'jeans-black', shoes: 'boot-black', pose: 'lean' },
  'man-tee': { label: 'Tシャツの男性 歩く', sex: 'm', height: 1.78, head: 'm-2', top: 'tee-black', bottom: 'jeans-dark', shoes: 'sneaker-black', pose: 'walk' },
  'man-shirt': { label: 'シャツの男性 歩く', sex: 'm', height: 1.73, head: 'm-13', top: 'shirt-stripe', bottom: 'chinos-khaki', shoes: 'leather-brown', pose: 'stride', tucked: true, rolled: true },
  'man-puffer': { label: 'ダウンジャケットの男性 立つ', sex: 'm', height: 1.75, head: 'm-12', top: 'jacket-puffer', bottom: 'jeans-blue', shoes: 'boot-tan', pose: 'pockets', hat: ['beanie', 'nylon-black'] },
  'man-rain': { label: 'レインコートの男性 歩く', sex: 'm', height: 1.8, head: 'm-6', top: 'coat-rain', bottom: 'jeans-dark', shoes: 'boot-black', pose: 'walk' },
  'clerk': { label: '店員 立つ', sex: 'f', height: 1.6, head: 'f-2', top: 'polo-red', bottom: 'chinos-khaki', shoes: 'sneaker-black', pose: 'stand', tucked: true },
  'cook': { label: '調理人 立つ', sex: 'm', height: 1.72, girth: 1.22, head: 'm-3', top: 'apron-white', bottom: 'slacks-black', shoes: 'sneaker-black', pose: 'hips', rolled: true },
  'barista': { label: 'カフェの店員 カップを持つ', sex: 'f', height: 1.65, head: 'f-9', top: 'apron-green', bottom: 'jeans-black', shoes: 'sneaker-black', pose: 'cup', carry: ['cup'], rolled: true },
  'nurse': { label: '看護師 歩く', sex: 'f', height: 1.64, head: 'f-7', top: 'scrubs-teal', bottom: 'scrubs-teal', shoes: 'sneaker-white', pose: 'walk' },
  'medic': { label: '医療従事者の男性 立つ', sex: 'm', height: 1.8, head: 'm-10', top: 'scrubs-blue', bottom: 'scrubs-blue', shoes: 'sneaker-white', pose: 'relaxed' },
  'sit-man': { label: '座る男性 スマートフォンを見る', sex: 'm', height: 1.8, head: 'm-1', top: 'shirt-denim', bottom: 'chinos-olive', shoes: 'sneaker-white', pose: 'sit-phone', carry: ['phone'], rolled: true },
  'sit-woman': { label: '座る女性 飲み物を持つ', sex: 'f', height: 1.66, head: 'f-1', top: 'tee-green', bottom: 'jeans-blue', shoes: 'sneaker-white', pose: 'sit-cup', carry: ['cup'] },
  'sit-heavy': { label: '座る太った男性', sex: 'm', height: 1.74, girth: 1.4, head: 'm-7', top: 'tee-grey', bottom: 'sweat-grey', shoes: 'sneaker-black', pose: 'sit' },
  'driver-man': { label: '運転する男性', sex: 'm', height: 1.78, head: 'm-2', top: 'shirt-blue', bottom: 'jeans-dark', shoes: 'sneaker-black', pose: 'drive' },
  'driver-woman': { label: '運転する女性', sex: 'f', height: 1.65, head: 'f-5', top: 'tee-white', bottom: 'jeans-blue', shoes: 'sneaker-white', pose: 'drive' },
  'passenger': { label: '車に乗る男性', sex: 'm', height: 1.76, head: 'm-4', top: 'polo-navy', bottom: 'chinos-khaki', shoes: 'sneaker-white', pose: 'ride' },
  'passenger-woman': { label: '車に乗る女性', sex: 'f', height: 1.63, head: 'f-10', top: 'cardigan', bottom: 'slacks-navy', shoes: 'flat', pose: 'ride' },
} as const satisfies Record<string, Person>;
export type PersonId = keyof typeof PEOPLE;

export function addPeople(add: (id: string, label: string, fn: (b: MeshBuilder) => void) => void): void {
  for (const [id, who] of Object.entries(PEOPLE)) add(id, `${who.label} (${POSES[who.pose].label})`, (b) => buildPerson(b, who));
}
