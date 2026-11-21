import { Rand } from '../tex';
import { MeshBuilder, V3, v3 } from './builder';
import { Pose, at, box, lathe, move, pipe, stand } from './kit';
import { addModel } from './registry';

const T = (id: string): string => `plant/${id}`;
const STEM = 'furniture/enamel-green';
const GOLDEN = 2.39996;

/** Unit vector at right angles to d, turned `a` radians around it. */
function perp(d: V3, a: number): V3 {
  const x = v3.norm(v3.cross(Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0], d));
  const y = v3.cross(d, x);
  return v3.add(v3.scale(x, Math.cos(a)), v3.scale(y, Math.sin(a)));
}
/** Direction in the pose's axes. */
const dirOf = (f: Pose, x: number, y: number, z: number): V3 => v3.norm(v3.add(v3.add(v3.scale(f.x, x), v3.scale(f.y, y)), v3.scale(f.z, z)));
/**
 * Cut-out card showing its whole texture. `p` is the bottom centre (where the twig or stem enters the picture),
 * or the middle of the card when `centred`; `up` is the way the picture's top points.
 */
export function card(b: MeshBuilder, tex: string, p: V3, up: V3, side: V3, w: number, h: number, centred = false): void {
  const u = v3.norm(up);
  const s = v3.norm(v3.sub(side, v3.scale(u, v3.dot(side, u))));
  const o = centred ? v3.mad(p, u, -h / 2) : p;
  const [a, c] = [v3.mad(o, s, -w / 2), v3.mad(o, s, w / 2)];
  const part = b.part(tex);
  b.quad(tex, a, c, v3.mad(c, u, h), v3.mad(a, u, h), [[0, 0], [part.mw, 0], [part.mw, part.mh], [0, part.mh]]);
}
/** Flower head facing along `normal`. */
function head(b: MeshBuilder, tex: string, p: V3, normal: V3, scale: number, rnd: Rand): void {
  const n = v3.norm(normal);
  const up = perp(n, rnd.next() * 6.283);
  const size = b.part(tex).mw * scale;
  card(b, tex, p, up, v3.cross(n, up), size, size, true);
}

// --- Trees. ---

export interface TreeOpts {
  seed: number;
  h: number;
  /** Trunk radius above the root flare. */
  r: number;
  bark: string;
  /** Leaf card; null for a bare tree. */
  leaf: string | null;
  /** Second card mixed in (blossom among the leaves) and its share. */
  leaf2?: string;
  mix?: number;
  /** Height of the lowest limbs as a share of the tree's height. */
  clear?: number;
  /** Angle between a limb and its parent, in degrees. */
  spread?: number;
  /** How strongly limbs turn up (positive) or hang (negative). */
  lift?: number;
  /** The trunk runs to the top with side branches all the way up, instead of dividing into limbs. */
  leader?: boolean;
  /** Reach of the side branches of a tree with a leader, as a share of its height. */
  width?: number;
  limbs?: number;
  /** Branching depth: twigs with leaves are this many steps from the trunk. */
  levels?: number;
  /** Size of a leaf card, and cards per twig. */
  card?: number;
  cards?: number;
  /** Twigs and leaf cards hang down. */
  weep?: boolean;
}
export function tree(b: MeshBuilder, f: Pose, o: TreeOpts): void {
  const rnd = new Rand(o.seed);
  const levels = o.levels ?? 3;
  const size = o.card ?? Math.max(0.6, Math.min(1.1, o.h * 0.09));
  const lift = o.lift ?? 0.3;
  const spread = ((o.spread ?? 45) * Math.PI) / 180;
  const centre = at(f, 0, o.h * 0.6, 0);
  const jit = (k: number): number => (rnd.next() - 0.5) * k;
  const leafAt = (p: V3, dir: V3): void => {
    if (!o.leaf) return;
    const out = v3.norm(v3.sub(p, centre));
    const up: V3 = o.weep ? v3.norm([out[0] * 0.3 + jit(0.5), -1, out[2] * 0.3 + jit(0.5)]) : v3.norm([dir[0] * 0.5 + out[0] * 0.6 + jit(0.9), dir[1] * 0.5 + out[1] * 0.6 + 0.3 + jit(0.6), dir[2] * 0.5 + out[2] * 0.6 + jit(0.9)]);
    const tex = T(o.leaf2 && rnd.chance(o.mix ?? 0.5) ? o.leaf2 : o.leaf);
    const a = rnd.next() * Math.PI;
    const s = size * (0.8 + rnd.next() * 0.4);
    card(b, tex, p, up, perp(up, a), s, s);
    card(b, tex, p, up, perp(up, a + 1.5708), s, s);
  };
  const grow = (p0: V3, dir: V3, len: number, r: number, level: number): void => {
    const n = level === 0 ? 5 : 3;
    const pts: V3[] = [p0];
    let d = dir;
    for (let i = 1; i <= n; i++) {
      const wander = level === 0 ? 0.07 : 0.3;
      d = v3.norm([d[0] + jit(wander), d[1] + (level === 0 ? 0 : (o.weep && level === levels ? -0.6 : lift * 0.3)) + jit(wander * 0.6), d[2] + jit(wander)]);
      pts.push(v3.mad(pts[i - 1], d, len / n));
    }
    const twig = level >= levels;
    const r1 = twig ? r * 0.3 : r * 0.62;
    const radius = level === 0 ? (q: number): number => r * (1 - 0.38 * q) * (1 + 0.75 * Math.exp((-q * len) / 0.3)) : (q: number): number => r + (r1 - r) * q;
    pipe(b, o.bark, pts, radius, level === 0 ? 10 : level === 1 ? 7 : twig ? 4 : 5, twig);
    const pointAt = (t: number): [V3, V3] => {
      const x = Math.min(0.999, Math.max(0, t)) * n;
      const i = Math.floor(x);
      return [v3.lerp(pts[i], pts[i + 1], x - i), v3.norm(v3.sub(pts[i + 1], pts[i]))];
    };
    if (twig) {
      const k = o.cards ?? 3;
      for (let i = 0; i < k; i++) {
        const [q, dd] = pointAt(0.3 + 0.7 * (i / Math.max(1, k - 1)));
        leafAt(q, dd);
      }
      return;
    }
    const whole = level === 0 && o.leader;
    const t0 = whole ? (o.clear ?? 0.3) / 0.94 : 0.35;
    const kids = whole ? Math.round(o.h * 1.5) : level === 0 ? (o.limbs ?? 4) : level === 1 ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      let t = t0 + (1 - t0) * ((i + 0.3 + rnd.next() * 0.5) / kids);
      let theta = spread * (0.8 + rnd.next() * 0.45);
      let reach = len * (0.58 + rnd.next() * 0.16) * (1 - 0.25 * t);
      let phi = rnd.next() * 6.283;
      let next = level + 1;
      if (whole) {
        reach = o.h * (o.width ?? 0.32) * (1 - 0.72 * ((t - t0) / (1 - t0))) * (0.85 + rnd.next() * 0.3);
        phi = i * GOLDEN + jit(0.5);
        next = Math.min(levels, Math.max(1, levels - 1));
      } else if (level === 0) {
        t = 0.84 + 0.16 * (i / Math.max(1, kids - 1));
        reach = (o.h - len) * (0.62 + rnd.next() * 0.2);
        phi = (i / kids) * 6.283 + jit(0.7);
      }
      const [q, dd] = pointAt(t);
      const cd = v3.add(v3.scale(dd, Math.cos(theta)), v3.scale(perp(dd, phi), Math.sin(theta)));
      grow(q, v3.norm([cd[0], cd[1] + lift * 0.5, cd[2]]), reach, Math.max(0.012, radius(t) * (level === 0 && !whole ? 0.6 : 0.5)), next);
    }
    // The limb carries on as a thinner shoot.
    if (level > 0 || whole) grow(pts[n], d, len * (whole ? 0.12 : 0.5), Math.max(0.01, r1 * 0.9), whole ? levels : level + 1);
  };
  const trunk = o.leader ? o.h * 0.94 : Math.max(0.6, o.h * (o.clear ?? 0.3));
  grow(f.o, dirOf(f, jit(0.06), 1, jit(0.06)), trunk, o.r, 0);
}

// --- Palms. ---

export interface PalmOpts {
  seed: number;
  h: number;
  kind: 'fan' | 'pinnate' | 'date';
  r?: number;
  bark?: string;
  /** How far the top of the trunk ends up from the plumb line. */
  lean?: number;
  fronds?: number;
  frond?: string;
  /** Length of a frond (or width of a fan) in metres. */
  size?: number;
  /** How far the fronds arch over, 1 = a typical feather palm. */
  arch?: number;
  /** Fan palms: dead leaves hanging against the trunk below the crown, in metres of trunk. */
  skirt?: number;
  /** Share of old fronds that are dead. */
  dead?: number;
}
export function palm(b: MeshBuilder, f: Pose, o: PalmOpts): void {
  const rnd = new Rand(o.seed);
  const r = o.r ?? 0.2;
  const az = rnd.next() * 6.283;
  const lean = o.lean ?? 0;
  const pts: V3[] = [];
  for (let i = 0; i <= 8; i++) pts.push(at(f, Math.cos(az) * lean * (i / 8) ** 2, o.h * (i / 8), Math.sin(az) * lean * (i / 8) ** 2));
  pipe(b, o.bark ?? T(o.kind === 'date' ? 'bark-date' : 'bark-palm'), pts, (q) => r * (1 - 0.22 * q) * (1 + 0.45 * Math.exp((-q * o.h) / 0.5)), 10);
  const top = pts[8];
  const axis = v3.norm(v3.sub(pts[8], pts[7]));
  const down = v3.scale(f.y, -1);
  if (o.kind === 'date') lathe(b, T('bark-date'), { o: top, x: perp(axis, 0), y: axis, z: v3.cross(perp(axis, 0), axis) }, [[r * 0.8, -1.0], [r * 1.9, -0.35], [r * 1.7, 0.1], [r * 0.6, 0.45]], 10);
  const n = o.fronds ?? (o.kind === 'fan' ? 30 : 20);
  for (let i = 0; i < n; i++) {
    const age = i / (n - 1);
    const el = 1.3 - 2.0 * age + (rnd.next() - 0.5) * 0.2;
    const out = perp(axis, i * GOLDEN + rnd.next() * 0.3);
    const dir = v3.norm(v3.add(v3.scale(axis, Math.sin(el)), v3.scale(out, Math.cos(el))));
    const deadLeaf = age > 1 - (o.dead ?? 0);
    if (o.kind === 'fan') {
      const s = (o.size ?? 1.5) * (0.85 + rnd.next() * 0.3);
      const from = v3.mad(top, axis, -0.25 * age);
      const base = v3.mad(from, dir, 0.55 + rnd.next() * 0.35);
      b.tube(STEM, from, base, 0.018, 4);
      card(b, T(deadLeaf ? 'fan-dry' : 'fan'), base, v3.norm(v3.add(dir, v3.scale(down, 0.25 * age))), v3.cross(dir, axis), s, s);
    } else {
      const tex = T(deadLeaf ? 'frond-dry' : (o.frond ?? 'frond'));
      const part = b.part(tex);
      const len = (o.size ?? 3.4) * (0.85 + rnd.next() * 0.3) * (1 - 0.2 * (1 - age));
      const w = (part.mw / part.mh) * len * 1.15;
      const S = 6;
      let c = v3.mad(top, axis, -0.2 * age);
      let d = dir;
      const rows: [V3, V3, V3][] = [];
      for (let k = 0; k <= S; k++) {
        const sv = v3.norm(v3.cross(d, axis));
        const nrm = v3.cross(sv, d);
        const fold = w * 0.16;
        rows.push([v3.add(v3.mad(c, sv, -w / 2), v3.scale(nrm, fold)), c, v3.add(v3.mad(c, sv, w / 2), v3.scale(nrm, fold))]);
        d = v3.norm(v3.add(d, v3.scale(down, (o.arch ?? 1) * 0.42 * (0.4 + (k / S) * 1.2))));
        c = v3.mad(c, d, len / S);
      }
      for (let k = 0; k < S; k++) {
        const [v0, v1] = [(k / S) * part.mh, ((k + 1) / S) * part.mh];
        b.quad(tex, rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0], [[0, v0], [part.mw / 2, v0], [part.mw / 2, v1], [0, v1]]);
        b.quad(tex, rows[k][1], rows[k][2], rows[k + 1][2], rows[k + 1][1], [[part.mw / 2, v0], [part.mw, v0], [part.mw, v1], [part.mw / 2, v1]]);
      }
    }
  }
  const skirt = o.skirt ?? 0;
  for (let i = 0; i < skirt * 9; i++) {
    const y = 0.3 + (i / (skirt * 9)) * skirt;
    const out = perp(axis, i * GOLDEN);
    const s = 1.1 + rnd.next() * 0.4;
    card(b, T('fan-dry'), v3.add(v3.mad(top, axis, -y), v3.scale(out, r * 0.7)), v3.norm(v3.add(v3.scale(down, 1), v3.scale(out, 0.22 + rnd.next() * 0.2))), v3.cross(out, axis), s, s);
  }
}

// --- Shrubs and hedges. ---

export interface ShrubOpts {
  seed: number;
  /** Radius and height of the whole bush. */
  r: number;
  h: number;
  leaf: string;
  /** Leaf card size. */
  card?: number;
  /** Leaf cards per square metre of surface, 1 = full. */
  dense?: number;
  flowers?: string[];
  /** Flower heads per leaf card. */
  bloom?: number;
  flowerScale?: number;
}
export function shrub(b: MeshBuilder, f: Pose, o: ShrubOpts): void {
  const rnd = new Rand(o.seed);
  const s = o.card ?? Math.min(0.4, Math.max(0.22, o.r * 0.7));
  const [rc, hc] = [Math.max(o.r * 0.4, o.r - s * 0.6), Math.max(o.h * 0.4, o.h - s * 0.6)];
  const prof: [number, number][] = [];
  for (let i = 0; i <= 6; i++) prof.push([Math.max(0, rc * 0.92 * Math.cos(-0.5 + (i / 6) * 2.07)), hc * 0.3 + hc * 0.66 * Math.sin(-0.5 + (i / 6) * 2.07)]);
  lathe(b, T('foliage-core'), f, [[rc * 0.3, 0], ...prof], 10);
  const n = Math.round(((7 * (o.r * o.r + 1.5 * o.r * o.h)) / (s * s)) * (o.dense ?? 1));
  const spot = (i: number): [V3, V3] => {
    const sy = -0.35 + 1.35 * Math.pow(rnd.next(), 0.75);
    const cy = Math.sqrt(Math.max(0, 1 - sy * sy));
    const a = i * GOLDEN + rnd.next() * 0.5;
    return [dirOf(f, cy * Math.cos(a), sy, cy * Math.sin(a)), at(f, cy * Math.cos(a) * rc, hc * 0.3 + sy * hc * 0.68, cy * Math.sin(a) * rc)];
  };
  for (let i = 0; i < n; i++) {
    const [nrm, p] = spot(i);
    const up = v3.norm([nrm[0] + (rnd.next() - 0.5) * 0.9, nrm[1] + 0.25 + (rnd.next() - 0.5) * 0.6, nrm[2] + (rnd.next() - 0.5) * 0.9]);
    card(b, T(o.leaf), v3.mad(p, up, -s * 0.2), up, perp(up, rnd.next() * 3.14), s, s);
  }
  const blooms = o.flowers ? Math.round(n * (o.bloom ?? 0.5)) : 0;
  for (let i = 0; i < blooms; i++) {
    const [nrm, p] = spot(i + 0.5);
    head(b, T(o.flowers![i % o.flowers!.length]), v3.mad(p, nrm, s * (0.45 + rnd.next() * 0.25)), v3.norm([nrm[0] + (rnd.next() - 0.5) * 0.5, nrm[1] + 0.3, nrm[2] + (rnd.next() - 0.5) * 0.5]), (o.flowerScale ?? 1) * (0.8 + rnd.next() * 0.4), rnd);
  }
}
export interface HedgeOpts {
  seed: number;
  len: number;
  w: number;
  h: number;
  leaf: string;
  card?: number;
  dense?: number;
  flowers?: string[];
}
/** Clipped hedge along x, standing on the pose. */
export function hedge(b: MeshBuilder, f: Pose, o: HedgeOpts): void {
  const rnd = new Rand(o.seed);
  const s = o.card ?? 0.3;
  const m = s * 0.35;
  box(b, T('foliage-core'), f, [0, (o.h - m) / 2, 0], [o.len / 2 - m, (o.h - m) / 2, o.w / 2 - m], 'Y');
  const faces: [V3, V3, V3, number, number][] = [
    [[0, 1, 0], [1, 0, 0], [0, 0, 1], o.len, o.w], [[0, 0, 1], [1, 0, 0], [0, 1, 0], o.len, o.h], [[0, 0, -1], [1, 0, 0], [0, 1, 0], o.len, o.h],
    [[1, 0, 0], [0, 0, 1], [0, 1, 0], o.w, o.h], [[-1, 0, 0], [0, 0, 1], [0, 1, 0], o.w, o.h],
  ];
  for (const [nl, ul, vl, a, c] of faces) {
    const count = Math.round(((a * c) / (s * s)) * 3.2 * (o.dense ?? 1));
    for (let i = 0; i < count; i++) {
      const [u, v] = [(rnd.next() - 0.5) * (a - m * 2), nl[1] ? (rnd.next() - 0.5) * (c - m * 2) : m + rnd.next() * (c - m * 2)];
      const centreY = nl[1] ? o.h - m : 0;
      const local: V3 = [ul[0] * u + vl[0] * v + nl[0] * (o.len / 2 - m), centreY + ul[1] * u + vl[1] * v, ul[2] * u + vl[2] * v + nl[2] * (o.w / 2 - m)];
      const p = at(f, local[0], local[1], local[2]);
      const up = dirOf(f, nl[0] * 0.75 + (rnd.next() - 0.5) * 1.2, nl[1] * 0.75 + 0.15 + (rnd.next() - 0.5) * 1.2, nl[2] * 0.75 + (rnd.next() - 0.5) * 1.2);
      card(b, T(o.leaf), v3.mad(p, up, -s * 0.3), up, perp(up, rnd.next() * 3.14), s, s);
      if (o.flowers && i % 4 === 0) head(b, T(o.flowers[(i / 4) % o.flowers.length]), v3.mad(p, dirOf(f, nl[0], nl[1], nl[2]), m * 1.05), dirOf(f, nl[0] + (rnd.next() - 0.5) * 0.4, nl[1] + 0.2, nl[2] + (rnd.next() - 0.5) * 0.4), 0.8 + rnd.next() * 0.4, rnd);
    }
  }
}

// --- Flowers and grass. ---

export interface BedOpts {
  seed: number;
  /** Radius of the planting; `rx` stretches it along x. */
  r: number;
  rx?: number;
  heads: string[];
  /** Stem height in the middle of the bed. */
  h?: number;
  count?: number;
  scale?: number;
  /** Foliage card along each stem instead of a rosette near the ground. */
  leaf?: string;
}
/** Planting of single-stemmed flowers: each has a stem, leaves and a head turned up and outwards. */
export function flowerBed(b: MeshBuilder, f: Pose, o: BedOpts): void {
  const rnd = new Rand(o.seed);
  const h = o.h ?? 0.28;
  const rx = o.rx ?? o.r;
  const n = o.count ?? Math.max(6, Math.round(48 * Math.PI * o.r * rx));
  for (let i = 0; i < n; i++) {
    const rad = Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN;
    const out = dirOf(f, Math.cos(a), 0, Math.sin(a));
    const base = at(f, Math.cos(a) * rad * rx * 0.9, 0, Math.sin(a) * rad * o.r * 0.9);
    const hh = h * (0.75 + rnd.next() * 0.45) * (1.12 - 0.35 * rad * rad);
    const top = v3.add(v3.mad(base, f.y, hh), v3.scale(out, hh * (0.1 + 0.45 * rad) * (0.6 + rnd.next() * 0.8)));
    b.tube(STEM, base, top, Math.max(0.003, hh * 0.012), 3);
    if (o.leaf) {
      const up = v3.norm(v3.add(v3.sub(top, base), v3.scale(out, hh * 0.3)));
      const s = b.part(T(o.leaf)).mw * Math.min(1.4, hh / 0.5);
      card(b, T(o.leaf), base, up, perp(up, rnd.next() * 3.14), s, s);
      card(b, T(o.leaf), v3.lerp(base, top, 0.35), up, perp(up, rnd.next() * 3.14), s, s);
    } else {
      const s = Math.min(0.3, 0.14 + hh * 0.45);
      card(b, T('whorl'), v3.lerp(base, top, 0.5), v3.norm(v3.add(out, v3.scale(f.y, 0.45 + rnd.next() * 0.4))), perp(f.y, a + 1.57 + (rnd.next() - 0.5)), s, s, true);
      card(b, T('whorl'), v3.lerp(base, top, 0.2), dirOf(f, Math.cos(a + 2), 0.25, Math.sin(a + 2)), perp(f.y, a + 0.4), s * 0.9, s * 0.9, true);
    }
    head(b, T(o.heads[Math.floor(rnd.next() * o.heads.length)]), top, v3.norm(v3.add(v3.add(v3.scale(f.y, 0.8), v3.scale(out, 0.2 + 0.75 * rad)), [(rnd.next() - 0.5) * 0.3, 0, (rnd.next() - 0.5) * 0.3])), (o.scale ?? 1) * (0.8 + rnd.next() * 0.45), rnd);
  }
}
export interface ClumpOpts {
  seed: number;
  r: number;
  rx?: number;
  cards: string[];
  count: number;
  scale?: number;
  /** How far the plants lean outwards, 0 = upright. */
  lean?: number;
}
/** Plants drawn from the side (tulips, grass tufts): each is a pair of crossed upright cards. */
export function clump(b: MeshBuilder, f: Pose, o: ClumpOpts): void {
  const rnd = new Rand(o.seed);
  for (let i = 0; i < o.count; i++) {
    const rad = o.count === 1 ? 0 : Math.sqrt((i + 0.5) / o.count);
    const a = i * GOLDEN;
    const tex = T(o.cards[Math.floor(rnd.next() * o.cards.length)]);
    const part = b.part(tex);
    const k = (o.scale ?? 1) * (0.8 + rnd.next() * 0.4);
    const up = dirOf(f, Math.cos(a) * rad * (o.lean ?? 0.25) + (rnd.next() - 0.5) * 0.15, 1, Math.sin(a) * rad * (o.lean ?? 0.25) + (rnd.next() - 0.5) * 0.15);
    const p = at(f, Math.cos(a) * rad * (o.rx ?? o.r), 0, Math.sin(a) * rad * o.r);
    const turnBy = rnd.next() * 3.14;
    for (let c = 0; c < 2; c++) card(b, tex, p, up, perp(up, turnBy + c * 1.5708), part.mw * k, part.mh * k);
  }
}

export function addPlants(): void {
  const O = stand();
  const add = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('plant', id, label, fn);
  let seed = 100;

  const TREES: [string, string, Omit<TreeOpts, 'seed'>][] = [
    ['ficus-small', '街路樹 イチジク属 6m', { h: 6, r: 0.11, bark: T('bark-smooth'), leaf: 'leaf-ovate', clear: 0.38, cards: 4 }],
    ['ficus', '街路樹 イチジク属 9m', { h: 9, r: 0.2, bark: T('bark-smooth'), leaf: 'leaf-ovate', clear: 0.32, cards: 4 }],
    ['ficus-large', '街路樹 イチジク属 13m', { h: 13, r: 0.36, bark: T('bark-smooth'), leaf: 'leaf-ovate', clear: 0.27, spread: 52, limbs: 5, cards: 4 }],
    ['oak', '広葉樹 ナラ 10m', { h: 10, r: 0.3, bark: T('bark-oak'), leaf: 'leaf-oak', clear: 0.26, spread: 58, lift: 0.15, limbs: 5 }],
    ['oak-old', '広葉樹 ナラ 老木 14m', { h: 14, r: 0.5, bark: T('bark-oak-moss'), leaf: 'leaf-oak', clear: 0.22, spread: 62, lift: 0.1, limbs: 5, cards: 4 }],
    ['plane', '街路樹 プラタナス 11m', { h: 11, r: 0.27, bark: T('bark-plane'), leaf: 'leaf-maple', clear: 0.34, spread: 42, cards: 4 }],
    ['plane-large', '街路樹 プラタナス 16m', { h: 16, r: 0.42, bark: T('bark-plane'), leaf: 'leaf-maple', clear: 0.3, spread: 46, limbs: 5, cards: 4 }],
    ['plane-autumn', '街路樹 プラタナス 紅葉', { h: 11, r: 0.26, bark: T('bark-plane'), leaf: 'leaf-maple-autumn', clear: 0.34, spread: 42 }],
    ['maple-autumn', '広葉樹 カエデ 紅葉 7m', { h: 7, r: 0.15, bark: T('bark-young'), leaf: 'leaf-maple-autumn', clear: 0.3, spread: 50, cards: 4 }],
    ['maple', '広葉樹 カエデ 7m', { h: 7, r: 0.15, bark: T('bark-young'), leaf: 'leaf-maple', clear: 0.3, spread: 50, cards: 4 }],
    ['elm', '街路樹 ニレ つぼ形 12m', { h: 12, r: 0.28, bark: T('bark-oak'), leaf: 'leaf-ovate', clear: 0.36, spread: 30, lift: 0.5 }],
    ['elm-autumn', '街路樹 ニレ 黄葉', { h: 11, r: 0.26, bark: T('bark-oak'), leaf: 'leaf-ovate-autumn', clear: 0.36, spread: 32, lift: 0.5 }],
    ['spring', '広葉樹 若葉 8m', { h: 8, r: 0.17, bark: T('bark-young'), leaf: 'leaf-ovate-light', clear: 0.33 }],
    ['eucalyptus', 'ユーカリ 14m', { h: 14, r: 0.26, bark: T('bark-eucalyptus'), leaf: 'leaf-lance', clear: 0.42, spread: 34, lift: 0.4, limbs: 3, weep: true }],
    ['eucalyptus-large', 'ユーカリ 20m', { h: 20, r: 0.42, bark: T('bark-eucalyptus'), leaf: 'leaf-lance', clear: 0.4, spread: 36, lift: 0.4, weep: true, cards: 4 }],
    ['olive', 'オリーブ 5m', { h: 5, r: 0.2, bark: T('bark-oak-moss'), leaf: 'leaf-lance', clear: 0.24, spread: 55, lift: 0.2, card: 0.55, cards: 4 }],
    ['birch', 'シラカバ 9m', { h: 9, r: 0.1, bark: T('bark-birch'), leaf: 'leaf-ovate-light', leader: true, clear: 0.3, width: 0.22, spread: 55, lift: 0.1, levels: 2, card: 0.6, cards: 3, weep: true }],
    ['poplar', 'ポプラ 円柱形 15m', { h: 15, r: 0.2, bark: T('bark-young'), leaf: 'leaf-ovate', leader: true, clear: 0.12, width: 0.1, spread: 28, lift: 0.9, levels: 2, card: 0.7, cards: 3 }],
    ['jacaranda', 'ジャカランダ 花盛り 9m', { h: 9, r: 0.2, bark: T('bark-young'), leaf: 'blossom-jacaranda', leaf2: 'leaf-lance', mix: 0.15, clear: 0.3, spread: 55, lift: 0.2, cards: 4 }],
    ['jacaranda-large', 'ジャカランダ 花盛り 12m', { h: 12, r: 0.3, bark: T('bark-young'), leaf: 'blossom-jacaranda', leaf2: 'leaf-lance', mix: 0.25, clear: 0.28, spread: 58, lift: 0.2, limbs: 5, cards: 4 }],
    ['cherry', 'サクラ 花盛り 6m', { h: 6, r: 0.15, bark: T('bark-smooth'), leaf: 'blossom-pink', clear: 0.28, spread: 58, lift: 0.2, card: 0.7, cards: 4 }],
    ['pear', 'ナシ 白い花 7m', { h: 7, r: 0.14, bark: T('bark-young'), leaf: 'blossom-white', leaf2: 'leaf-ovate-light', mix: 0.2, clear: 0.3, spread: 36, lift: 0.5, card: 0.7, cards: 4 }],
    ['tabebuia', 'タベブイア 黄色い花 7m', { h: 7, r: 0.14, bark: T('bark-young'), leaf: 'blossom-yellow', clear: 0.34, spread: 48, card: 0.7, cards: 4 }],
    ['magnolia', 'モクレン 葉と白い花 6m', { h: 6, r: 0.15, bark: T('bark-smooth'), leaf: 'leaf-ovate', leaf2: 'blossom-white', mix: 0.35, clear: 0.25, spread: 48, card: 0.65, cards: 4 }],
    ['bougainvillea', 'ブーゲンビリア 立ち木 4m', { h: 4, r: 0.09, bark: T('bark-young'), leaf: 'blossom-bougainvillea', clear: 0.3, spread: 60, lift: 0.1, card: 0.6, cards: 4, weep: true }],
    ['sapling', '若木 3.5m', { h: 3.5, r: 0.035, bark: T('bark-young'), leaf: 'leaf-ovate-light', clear: 0.45, levels: 2, card: 0.5, cards: 3 }],
    ['sparse', '弱った木 葉がまばら 8m', { h: 8, r: 0.18, bark: T('bark-dead'), leaf: 'leaf-dry', clear: 0.33, cards: 2 }],
    ['bare', '落葉した木 10m', { h: 10, r: 0.24, bark: T('bark-oak'), leaf: null, clear: 0.3, levels: 4 }],
    ['bare-plane', '落葉したプラタナス 12m', { h: 12, r: 0.3, bark: T('bark-plane'), leaf: null, clear: 0.33, spread: 42, levels: 4 }],
    ['dead', '枯れ木 7m', { h: 7, r: 0.2, bark: T('bark-dead'), leaf: null, clear: 0.35, limbs: 3, levels: 2 }],
  ];
  for (const [id, label, o] of TREES) {
    const s = seed++;
    add(`tree-${id}`, label, (b) => tree(b, O, { ...o, seed: s }));
  }

  const PALMS: [string, string, Omit<PalmOpts, 'seed'>][] = [
    ['fan', 'ワシントンヤシ 12m', { h: 12, kind: 'fan', r: 0.19, skirt: 1.5 }],
    ['fan-tall', 'ワシントンヤシ 20m', { h: 20, kind: 'fan', r: 0.2, skirt: 1.2, lean: 1.2 }],
    ['fan-very-tall', 'ワシントンヤシ 27m 傾き', { h: 27, kind: 'fan', r: 0.21, skirt: 0.8, lean: 2.6, fronds: 26 }],
    ['fan-skirt', 'ワシントンヤシ 枯れ葉のスカート 9m', { h: 9, kind: 'fan', r: 0.24, skirt: 4.5 }],
    ['fan-short', 'ワシントンヤシ 若木 4m', { h: 4, kind: 'fan', r: 0.26, fronds: 24, bark: T('bark-date') }],
    ['queen', 'クイーンヤシ 9m', { h: 9, kind: 'pinnate', r: 0.15, bark: T('bark-palm-grey'), arch: 1.2 }],
    ['queen-tall', 'クイーンヤシ 13m', { h: 13, kind: 'pinnate', r: 0.16, bark: T('bark-palm-grey'), arch: 1.2, lean: 0.8, dead: 0.15 }],
    ['coconut', 'ココヤシ 傾き 11m', { h: 11, kind: 'pinnate', r: 0.17, lean: 3.2, frond: 'frond-droop', size: 4.2, arch: 1.4 }],
    ['date', 'カナリーヤシ 8m', { h: 8, kind: 'date', r: 0.36, frond: 'frond-date', fronds: 34, size: 4.4, arch: 0.8 }],
    ['date-short', 'カナリーヤシ 若木 3m', { h: 3, kind: 'date', r: 0.4, frond: 'frond-date', fronds: 30, size: 3.8, arch: 0.8 }],
    ['date-tall', 'ナツメヤシ 14m', { h: 14, kind: 'date', r: 0.25, frond: 'frond-date', fronds: 26, size: 3.6, arch: 0.9, dead: 0.2 }],
  ];
  for (const [id, label, o] of PALMS) {
    const s = seed++;
    add(`palm-${id}`, label, (b) => palm(b, O, { ...o, seed: s }));
  }
  add('palm-group', 'ワシントンヤシ 3本', (b) => {
    palm(b, stand([-2.2, 0, 0.4]), { seed: 51, h: 16, kind: 'fan', skirt: 1.2, lean: 1 });
    palm(b, stand([0.3, 0, -0.5]), { seed: 52, h: 21, kind: 'fan', skirt: 1, lean: 1.5 });
    palm(b, stand([2.4, 0, 0.6]), { seed: 53, h: 12, kind: 'fan', skirt: 2 });
  });

  const SHRUBS: [string, string, Omit<ShrubOpts, 'seed'>][] = [
    ['box', '低木 ツゲ 丸刈り 0.6m', { r: 0.4, h: 0.6, leaf: 'leaf-small', card: 0.26, dense: 1.3 }],
    ['box-large', '低木 ツゲ 丸刈り 1.2m', { r: 0.75, h: 1.2, leaf: 'leaf-small', card: 0.3, dense: 1.3 }],
    ['box-light', '低木 若葉 0.8m', { r: 0.5, h: 0.8, leaf: 'leaf-small-light', card: 0.28, dense: 1.2 }],
    ['dry', '低木 枯れ気味', { r: 0.5, h: 0.7, leaf: 'leaf-small-dry', card: 0.3, dense: 0.7 }],
    ['broadleaf', '低木 広葉 1.5m', { r: 0.9, h: 1.5, leaf: 'leaf-shrub', card: 0.42 }],
    ['camellia', '低木 ツバキ 赤い花', { r: 0.8, h: 1.6, leaf: 'leaf-shrub', card: 0.4, flowers: ['flower-rose-red'], bloom: 0.35 }],
    ['hibiscus-red', '低木 ハイビスカス 赤', { r: 0.8, h: 1.4, leaf: 'leaf-shrub', card: 0.4, flowers: ['flower-hibiscus-red'], bloom: 0.3 }],
    ['hibiscus-pink', '低木 ハイビスカス 桃', { r: 0.7, h: 1.2, leaf: 'leaf-shrub', card: 0.4, flowers: ['flower-hibiscus-pink'], bloom: 0.3 }],
    ['hibiscus-yellow', '低木 ハイビスカス 黄', { r: 0.7, h: 1.3, leaf: 'leaf-shrub', card: 0.4, flowers: ['flower-hibiscus-yellow'], bloom: 0.3 }],
    ['rose-pink', '低木 バラ 桃', { r: 0.5, h: 0.9, leaf: 'leaf-shrub', card: 0.32, flowers: ['flower-rose-pink'], bloom: 0.45 }],
    ['rose-white', '低木 バラ 白', { r: 0.5, h: 0.9, leaf: 'leaf-shrub', card: 0.32, flowers: ['flower-rose-white'], bloom: 0.45 }],
    ['rose-mixed', '低木 バラ 赤と黄', { r: 0.6, h: 1.0, leaf: 'leaf-shrub', card: 0.32, flowers: ['flower-rose-red', 'flower-rose-yellow'], bloom: 0.45 }],
    ['plumbago', '低木 プルンバゴ 青い花', { r: 0.8, h: 1.0, leaf: 'leaf-small-light', card: 0.3, flowers: ['flower-five-blue'], bloom: 0.6 }],
    ['bougainvillea', '低木 ブーゲンビリア', { r: 1.1, h: 1.6, leaf: 'blossom-bougainvillea', card: 0.55, dense: 1.2 }],
  ];
  for (const [id, label, o] of SHRUBS) {
    const s = seed++;
    add(`shrub-${id}`, label, (b) => shrub(b, O, { ...o, seed: s }));
  }
  const HEDGES: [string, string, Omit<HedgeOpts, 'seed'>][] = [
    ['low', '生垣 低い 2m', { len: 2, w: 0.5, h: 0.6, leaf: 'leaf-small' }],
    ['tall', '生垣 高い 3m', { len: 3, w: 0.7, h: 1.6, leaf: 'leaf-small' }],
    ['light', '生垣 若葉 3m', { len: 3, w: 0.6, h: 1.0, leaf: 'leaf-small-light' }],
    ['dry', '生垣 枯れ気味・すき間', { len: 3, w: 0.6, h: 0.9, leaf: 'leaf-small-dry', dense: 0.55 }],
    ['hibiscus', '生垣 ハイビスカス', { len: 3, w: 0.8, h: 1.3, leaf: 'leaf-shrub', card: 0.4, flowers: ['flower-hibiscus-red', 'flower-hibiscus-pink'] }],
    ['broadleaf', '生垣 広葉 4m', { len: 4, w: 0.8, h: 1.2, leaf: 'leaf-shrub', card: 0.4 }],
  ];
  for (const [id, label, o] of HEDGES) {
    const s = seed++;
    add(`hedge-${id}`, label, (b) => hedge(b, O, { ...o, seed: s }));
  }

  const BEDS: [string, string, Omit<BedOpts, 'seed'>][] = [
    ['geranium', '花 ゼラニウム 赤', { r: 0.35, heads: ['flower-five-red'] }],
    ['petunia', '花 ペチュニア 紫と赤紫', { r: 0.4, heads: ['flower-five-purple', 'flower-five-magenta', 'flower-five-white'], h: 0.22, scale: 1.1 }],
    ['vinca', '花 ビンカ 白', { r: 0.35, heads: ['flower-five-white'], h: 0.24 }],
    ['marigold', '花 マリーゴールド', { r: 0.35, heads: ['flower-marigold-orange', 'flower-marigold-yellow'], h: 0.26 }],
    ['daisy', '花 デイジー 白', { r: 0.4, heads: ['flower-daisy-white'], h: 0.38 }],
    ['daisy-mixed', '花 デイジー 白・黄・桃', { r: 0.5, heads: ['flower-daisy-white', 'flower-daisy-yellow', 'flower-daisy-pink'], h: 0.38 }],
    ['aster', '花 アスター 紫', { r: 0.4, heads: ['flower-daisy-purple'], h: 0.42 }],
    ['rose', '花 バラ 混色', { r: 0.5, heads: ['flower-rose-red', 'flower-rose-pink', 'flower-rose-yellow', 'flower-rose-white'], h: 0.55, leaf: 'leaf-shrub', count: 22 }],
    ['sunflower', '花 ヒマワリ', { r: 0.5, heads: ['flower-sunflower'], h: 1.5, leaf: 'leaf-shrub', count: 9 }],
    ['strip', '花壇 帯状 3m 混植', { r: 0.4, rx: 1.5, heads: ['flower-marigold-yellow', 'flower-five-red', 'flower-daisy-white', 'flower-five-purple'], h: 0.3 }],
    ['strip-red', '花壇 帯状 3m 赤', { r: 0.35, rx: 1.5, heads: ['flower-five-red', 'flower-rose-red'], h: 0.3 }],
  ];
  for (const [id, label, o] of BEDS) {
    const s = seed++;
    add(`flower-${id}`, label, (b) => flowerBed(b, O, { ...o, seed: s }));
  }
  const CLUMPS: [string, string, Omit<ClumpOpts, 'seed'>][] = [
    ['flower-tulip-red', '花 チューリップ 赤', { r: 0.3, cards: ['stem-tulip-red'], count: 14 }],
    ['flower-tulip-mixed', '花 チューリップ 混色', { r: 0.4, cards: ['stem-tulip-red', 'stem-tulip-yellow', 'stem-tulip-pink'], count: 22 }],
    ['flower-iris', '花 アイリス 紫', { r: 0.3, cards: ['stem-iris'], count: 9 }],
    ['flower-lavender', '花 ラベンダー', { r: 0.3, cards: ['stem-lavender'], count: 9, lean: 0.5 }],
    ['flower-lavender-row', '花 ラベンダー 3mの列', { r: 0.3, rx: 1.5, cards: ['stem-lavender'], count: 34, lean: 0.4 }],
    ['grass-tuft', '草の株', { r: 0.12, cards: ['grass-tuft'], count: 3, lean: 0.6 }],
    ['grass-tuft-dry', '草の株 枯れ', { r: 0.12, cards: ['grass-tuft-dry'], count: 3, lean: 0.6 }],
    ['grass-patch', '草むら 2m', { r: 1, cards: ['grass-tuft', 'grass-tuft', 'grass-tuft-dry'], count: 40, lean: 0.3 }],
    ['grass-fescue', '青緑の草 5株', { r: 0.5, cards: ['grass-tuft-blue'], count: 5, scale: 1.2, lean: 0.2 }],
    ['grass-fountain', '観賞用の草 穂つき', { r: 0.15, cards: ['grass-fountain'], count: 3, lean: 0.5 }],
    ['grass-fountain-row', '観賞用の草 3mの列', { r: 0.3, rx: 1.5, cards: ['grass-fountain'], count: 7, lean: 0.3 }],
  ];
  for (const [id, label, o] of CLUMPS) {
    const s = seed++;
    add(id, label, (b) => clump(b, O, { ...o, seed: s }));
  }
  add('flower-bed-round', '花壇 円形 低木+花', (b) => {
    shrub(b, O, { seed: 71, r: 0.45, h: 0.8, leaf: 'leaf-small', card: 0.28, dense: 1.3 });
    for (let i = 0; i < 6; i++) flowerBed(b, move(stand([0, 0, 0], i * 60), 0.85, 0, 0), { seed: 72 + i, r: 0.3, heads: [i % 2 ? 'flower-marigold-yellow' : 'flower-five-red'], h: 0.24 });
  });
}
