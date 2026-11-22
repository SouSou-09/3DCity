import { MeshBuilder, V3 } from './builder';
import { Pose, at, box, pipe } from './kit';

/** Half the distance between rail centres (standard gauge), and the heights of the track's layers above the formation. */
export const G = 0.7525;
export const BED = 0.42;
export const TIE = 0.45;
export const FOOT = 0.462;
export const TOP = 0.634;

/** Centre line of a track on the ground plane: position [x, z] and unit heading at distance s. */
export interface Curve {
  (s: number): { p: [number, number]; t: [number, number] };
  /** Longest piece that still looks smooth. */
  step: number;
}
const curve = (fn: (s: number) => { p: [number, number]; t: [number, number] }, step: number): Curve => Object.assign(fn, { step });

export const line: Curve = curve((s) => ({ p: [0, s], t: [0, 1] }), 1e6);
/** Circular curve; a positive radius bends towards +x. */
export const bend = (R: number): Curve =>
  curve((s) => {
    const a = s / R;
    return { p: [R * (1 - Math.cos(a)), R * Math.sin(a)], t: [Math.sin(a), Math.cos(a)] };
  }, Math.min(2.4, Math.abs(R) * 0.02));
/** Sideways shift of dx over len, straight at both ends. */
export const shift = (len: number, dx: number): Curve =>
  curve((s) => {
    const q = Math.min(1, Math.max(0, s / len));
    const k = (dx * 6 * q * (1 - q)) / len;
    const h = Math.hypot(k, 1);
    return { p: [dx * q * q * (3 - 2 * q), s], t: [k / h, 1 / h] };
  }, 1.5);
/** The same curve moved sideways by d, keeping the parameter of the original. */
export const beside = (c: Curve, d: number): Curve =>
  curve((s) => {
    const { p, t } = c(s);
    return { p: [p[0] + t[1] * d, p[1] - t[0] * d], t };
  }, c.step);

export interface Way {
  b: MeshBuilder;
  f: Pose;
  c: Curve;
  /** Height of the formation at distance s, for a way that climbs and falls (a route laid over terrain). */
  lift?: (s: number) => number;
}
export const way = (b: MeshBuilder, f: Pose, c: Curve = line): Way => ({ b, f, c });
export const sideWay = (w: Way, d: number): Way => ({ ...w, c: beside(w.c, d) });

export function pt(w: Way, lat: number, y: number, s: number): V3 {
  const { p, t } = w.c(s);
  return at(w.f, p[0] + t[1] * lat, w.lift ? y + w.lift(s) : y, p[1] - t[0] * lat);
}
/** Pose on the track: x across, z along. */
export function poseAt(w: Way, s: number, lat = 0, y = 0): Pose {
  const { t } = w.c(s);
  const f = w.f;
  const mix = (a: number, c: number): V3 => [f.x[0] * a + f.z[0] * c, f.x[1] * a + f.z[1] * c, f.x[2] * a + f.z[2] * c];
  return { o: pt(w, lat, y, s), x: mix(t[1], -t[0]), y: f.y, z: mix(t[0], t[1]) };
}

export function cuts(s0: number, s1: number, step: number): number[] {
  const n = Math.max(1, Math.ceil((s1 - s0) / step - 1e-6));
  return Array.from({ length: n + 1 }, (_, i) => s0 + ((s1 - s0) * i) / n);
}

export type Prof = [number, number][];
export interface SweepOpts {
  step?: number;
  /** 'along': u runs along the track and v across the profile. 'across': the other way round. */
  uv?: 'along' | 'across';
  layer?: number;
  /** Texture coordinate (metres) at each profile point; defaults to the distance along the profile. */
  c?: number[];
  c0?: number;
  /** Runs the along coordinate backwards (text read from the other side). */
  flip?: boolean;
}

/**
 * Extrudes a cross-section (lateral, height) along the way. Listed clockwise seen looking along the
 * track with +lateral to the right: left to right for surfaces facing up, top to bottom on the right.
 */
export function sweep(w: Way, mat: string, s0: number, s1: number, prof: Prof | ((s: number) => Prof), o: SweepOpts = {}): void {
  if (s1 - s0 < 1e-6) return;
  const ss = cuts(s0, s1, o.step ?? w.c.step);
  const get = typeof prof === 'function' ? prof : () => prof;
  const along = (o.uv ?? 'along') === 'along';
  let pa = get(ss[0]);
  for (let j = 0; j < ss.length - 1; j++) {
    const pb = get(ss[j + 1]);
    let run = o.c0 ?? 0;
    const [a0, a1] = o.flip ? [-ss[j], -ss[j + 1]] : [ss[j], ss[j + 1]];
    for (let i = 0; i < pa.length - 1; i++) {
      const len = Math.hypot(pa[i + 1][0] - pa[i][0], pa[i + 1][1] - pa[i][1]);
      const c0 = o.c ? o.c[i] : run;
      const c1 = o.c ? o.c[i + 1] : run + len;
      run += len;
      const A = pt(w, pa[i][0], pa[i][1], ss[j]);
      const B = pt(w, pa[i + 1][0], pa[i + 1][1], ss[j]);
      const C = pt(w, pb[i + 1][0], pb[i + 1][1], ss[j + 1]);
      const D = pt(w, pb[i][0], pb[i][1], ss[j + 1]);
      const uv: [number, number][] = along ? [[a0, c0], [a1, c0], [a1, c1], [a0, c1]] : [[c0, a0], [c0, a1], [c1, a1], [c1, a0]];
      w.b.quad(mat, A, D, C, B, uv, o.layer ?? 0);
    }
    pa = pb;
  }
}

/** Flat polygon closing a swept section at s, facing backwards (dir -1) or forwards (dir 1). Convex profiles only. */
export function cap(w: Way, mat: string, s: number, prof: Prof, dir: 1 | -1): void {
  const p = prof.map(([x, y]) => pt(w, x, y, s));
  for (let i = 1; i < p.length - 1; i += 2) {
    const q = [p[0], p[i], p[i + 1], p[Math.min(i + 2, p.length - 1)]];
    const uv = [prof[0], prof[i], prof[i + 1], prof[Math.min(i + 2, prof.length - 1)]].map(([x, y]) => [x, y] as [number, number]);
    if (dir < 0) w.b.quad(mat, q[0], q[1], q[2], q[3], uv);
    else w.b.quad(mat, q[3], q[2], q[1], q[0], [uv[3], uv[2], uv[1], uv[0]]);
  }
}

export interface RailOpts {
  head?: string;
  side?: string;
  step?: number;
  /** Centre of the rail when it is not a constant distance from the centre line. */
  lat?: (s: number) => number;
  /** Scales the width (switch blades planed down to a point). */
  thin?: (s: number) => number;
  y?: number;
  caps?: boolean;
}

const RAIL_L: Prof = [[-0.07, 0], [-0.07, 0.012], [-0.01, 0.03], [-0.01, 0.125], [-0.035, 0.135], [-0.035, 0.172]];
const RAIL_R: Prof = RAIL_L.map(([x, y]) => [-x, y] as [number, number]).reverse();

/** One running rail with its centre d from the centre line. */
export function rail(w: Way, s0: number, s1: number, d: number, o: RailOpts = {}): void {
  const y = o.y ?? FOOT;
  const lat = o.lat ?? (() => d);
  const thin = o.thin ?? (() => 1);
  const side = o.side ?? 'rail/steel-rust';
  const step = o.step ?? (o.lat || o.thin ? Math.min(1, w.c.step) : w.c.step);
  const place = (p: Prof) => (s: number): Prof => p.map(([x, h]) => [lat(s) + x * thin(s), y + h] as [number, number]);
  sweep(w, side, s0, s1, place(RAIL_L), { step });
  sweep(w, side, s0, s1, place(RAIL_R), { step });
  sweep(w, o.head ?? 'rail/head-bright', s0, s1, place([[-0.035, 0.172], [0.035, 0.172]]), { step, c: [0.001, 0.071] });
  if (o.caps ?? true)
    for (const [s, dir] of [[s0, -1], [s1, 1]] as [number, 1 | -1][]) {
      const k = thin(s);
      const c = lat(s);
      for (const [x0, x1, h0, h1] of [[-0.07, 0.07, 0, 0.02], [-0.01, 0.01, 0.02, 0.13], [-0.035, 0.035, 0.13, 0.172]])
        cap(w, side, s, [[c + x0 * k, y + h0], [c + x0 * k, y + h1], [c + x1 * k, y + h1], [c + x1 * k, y + h0]], dir);
    }
}

export interface TieOpts {
  mat: string;
  spacing?: number;
  len?: number;
  w?: number;
  /** Ends of each sleeper (left, right) when they are not the standard length; null leaves one out. */
  ext?: (s: number) => [number, number] | null;
  /** Rail centres that get a fastening on every sleeper. */
  rails?: (s: number) => number[];
  fasten?: 'plate' | 'clip' | 'none';
  /** Slight random skew and shift, for neglected track. */
  loose?: number;
  top?: number;
}

const hash = (n: number): number => {
  const v = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return v - Math.floor(v);
};

export function sleepers(w: Way, s0: number, s1: number, o: TieOpts): void {
  const sp = o.spacing ?? 0.6;
  const wd = (o.w ?? 0.23) / 2;
  const top = o.top ?? TIE;
  const n = Math.max(1, Math.round((s1 - s0) / sp));
  const pitch = (s1 - s0) / n;
  for (let i = 0; i < n; i++) {
    const s = s0 + pitch * (i + 0.5);
    const e = o.ext ? o.ext(s) : ([-(o.len ?? 2.6) / 2, (o.len ?? 2.6) / 2] as [number, number]);
    if (!e) continue;
    const r = hash(i + s0 * 3.7);
    const f0 = poseAt(w, s + (o.loose ? (r - 0.5) * o.loose * 0.2 : 0));
    const sk = o.loose ? (hash(i * 3.1 + 7) - 0.5) * o.loose * 0.12 : 0;
    const f: Pose = sk ? { ...f0, x: [f0.x[0] + f0.z[0] * sk, f0.x[1], f0.x[2] + f0.z[2] * sk], z: [f0.z[0] - f0.x[0] * sk, f0.z[1], f0.z[2] - f0.x[2] * sk] } : f0;
    const [l, rr] = e;
    const v0 = Math.floor(r * 4) * 0.26 + 0.015;
    const u0 = hash(i * 1.7 + 3) * 0.05;
    w.b.quad(o.mat, at(f, l, top, wd), at(f, rr, top, wd), at(f, rr, top, -wd), at(f, l, top, -wd), [[u0, v0], [u0 + rr - l, v0], [u0 + rr - l, v0 + wd * 2], [u0, v0 + wd * 2]]);
    box(w.b, o.mat, f, [(l + rr) / 2, top - 0.06, 0], [(rr - l) / 2, 0.06, wd], 'yY');
    const fast = o.fasten ?? 'plate';
    if (fast === 'none') continue;
    for (const x of o.rails ? o.rails(s) : [-G, G]) {
      if (x < l + 0.1 || x > rr - 0.1) continue;
      if (fast === 'plate') {
        box(w.b, 'rail/steel-dark', f, [x, top + 0.006, 0], [0.1, 0.006, 0.09], 'Y');
      } else {
        for (const sx of [-1, 1]) box(w.b, 'rail/steel-dark', f, [x + sx * 0.1, top + 0.016, 0], [0.028, 0.016, 0.045], 'Y');
      }
    }
  }
}

type Num = number | ((s: number) => number);
const num = (v: Num, s: number): number => (typeof v === 'number' ? v : v(s));

export interface BedOpts {
  mat: string;
  l?: Num;
  r?: Num;
  slope?: number;
  top?: number;
  step?: number;
  caps?: boolean;
}

/** Ballast shoulder: flat between -l and r, falling to the formation at the given slope. */
export function bed(w: Way, s0: number, s1: number, o: BedOpts): void {
  const top = o.top ?? BED;
  const k = o.slope ?? 1.5;
  const l = o.l ?? 1.75;
  const r = o.r ?? 1.75;
  const prof = (s: number): Prof => [[-num(l, s) - k * top, 0], [-num(l, s), top], [num(r, s), top], [num(r, s) + k * top, 0]];
  const vary = typeof l !== 'number' || typeof r !== 'number';
  sweep(w, o.mat, s0, s1, prof, { uv: 'across', step: o.step ?? (vary ? Math.min(1.5, w.c.step) : w.c.step) });
  if (o.caps ?? true) {
    cap(w, o.mat, s0, prof(s0), -1);
    cap(w, o.mat, s1, prof(s1), 1);
  }
}

export interface TrackStyle {
  tie: string;
  ballast: string;
  head: string;
  side: string;
  stain?: string;
  fasten: 'plate' | 'clip' | 'none';
  spacing?: number;
  loose?: number;
  tieLen?: number;
}

export const STYLES = {
  wood: { tie: 'rail/sleeper-wood', ballast: 'rail/ballast-grey', head: 'rail/head-bright', side: 'rail/steel-rust', stain: 'rail/bed-stain-rust', fasten: 'plate' },
  'wood-new': { tie: 'rail/sleeper-wood-new', ballast: 'rail/ballast-granite', head: 'rail/head-bright', side: 'rail/steel-rust', stain: 'rail/bed-stain-light', fasten: 'plate' },
  'wood-old': { tie: 'rail/sleeper-wood-old', ballast: 'rail/ballast-brown', head: 'rail/head-dull', side: 'rail/steel-orange', stain: 'rail/bed-stain-mixed', fasten: 'plate', loose: 0.5 },
  concrete: { tie: 'rail/sleeper-concrete', ballast: 'rail/ballast-granite', head: 'rail/head-bright', side: 'rail/steel-rust', stain: 'rail/bed-stain-light', fasten: 'clip', spacing: 0.65 },
  'concrete-stained': { tie: 'rail/sleeper-concrete-stained', ballast: 'rail/ballast-brown', head: 'rail/head-bright', side: 'rail/steel-dark', stain: 'rail/bed-stain-mixed', fasten: 'clip', spacing: 0.65 },
  steel: { tie: 'rail/sleeper-steel', ballast: 'rail/ballast-basalt', head: 'rail/head-dull', side: 'rail/steel-rust', stain: 'rail/bed-stain-rust', fasten: 'clip', spacing: 0.7, tieLen: 2.4 },
  station: { tie: 'rail/sleeper-concrete-stained', ballast: 'rail/ballast-oily', head: 'rail/head-bright', side: 'rail/steel-dark', stain: 'rail/bed-stain-oil', fasten: 'clip', spacing: 0.65 },
  siding: { tie: 'rail/sleeper-wood-old', ballast: 'rail/ballast-cinder', head: 'rail/head-dull', side: 'rail/steel-dark', stain: 'rail/bed-stain-oil', fasten: 'plate', spacing: 0.7, loose: 0.6 },
  weedy: { tie: 'rail/sleeper-wood-old', ballast: 'rail/ballast-weedy', head: 'rail/head-dull', side: 'rail/steel-orange', fasten: 'plate', spacing: 0.7, loose: 0.8 },
  disused: { tie: 'rail/sleeper-wood-rotten', ballast: 'rail/ballast-overgrown', head: 'rail/head-rusty', side: 'rail/steel-orange', fasten: 'plate', spacing: 0.72, loose: 1.4 },
} satisfies Record<string, TrackStyle>;
export type StyleName = keyof typeof STYLES;

/** Rails, fastenings and sleepers without the ballast. */
export function rails(w: Way, s0: number, s1: number, st: TrackStyle): void {
  sleepers(w, s0, s1, { mat: st.tie, spacing: st.spacing, fasten: st.fasten, loose: st.loose, len: st.tieLen });
  for (const d of [-G, G]) rail(w, s0, s1, d, { head: st.head, side: st.side });
}

/** Rust and oil dropped between and beside the rails, laid over ballast and sleepers alike. */
export function stain(w: Way, s0: number, s1: number, mat: string | undefined, y = TIE + 0.004): void {
  if (mat) sweep(w, mat, s0, s1, [[-1.7, y], [1.7, y]], { uv: 'across', layer: 1, step: Math.min(w.c.step, 6) });
}

/** A complete ballasted track. */
export function track(w: Way, s0: number, s1: number, st: TrackStyle, o: { bed?: boolean } = {}): void {
  if (o.bed ?? true) bed(w, s0, s1, { mat: st.ballast });
  stain(w, s0, s1, st.stain);
  rails(w, s0, s1, st);
}

export interface TurnoutOpts {
  /** Side the branch leaves on: 1 towards +x. */
  dir: 1 | -1;
  R?: number;
  /** Distance from the start to the switch toes. */
  toe?: number;
  len: number;
  /** Where the branch stops (crossovers hand over to the other turnout there). */
  divEnd?: number;
  style: TrackStyle;
  lever?: 'machine' | 'stand' | 'none';
  bed?: boolean;
  /** Ends of the long timbers when they also carry a neighbouring track; null leaves a timber out. */
  ties?: (s: number, own: [number, number]) => [number, number] | null;
  /** Other rails resting on the long timbers. */
  extraRails?: (s: number) => number[];
  /** False when something else lays the sleepers beyond the long timbers. */
  plainTies?: boolean;
}

/** Offset of the branch from the main line at s. */
export const branchOffset = (o: { R?: number; toe?: number }, s: number): number => {
  const q = Math.max(0, s - (o.toe ?? 3));
  return (q * q) / (2 * (o.R ?? 150));
};

/** Turnout on a straight main line starting at the pose, the branch curving away at radius R. */
export function turnout(b: MeshBuilder, f: Pose, o: TurnoutOpts): void {
  const m = o.dir;
  const st = o.style;
  const R = o.R ?? 150;
  const toe = o.toe ?? 3;
  const end = o.divEnd ?? o.len;
  const off = (s: number): number => branchOffset(o, s);
  // Mirrored turnouts are built in a mirrored pose, which also swaps the winding back.
  const w = way(b, m > 0 ? f : { ...f, x: [-f.x[0], -f.x[1], -f.x[2]] });
  // In a mirrored pose every quad is listed backwards so its faces still point outwards.
  const wr: Way = m < 0 ? { ...w, b: mirrorBuilder(b) } : w;
  const branch: Way = { b: wr.b, f: w.f, c: curve((s) => { const k = Math.max(0, s - toe) / R; const h = Math.hypot(k, 1); return { p: [off(s), s], t: [k / h, 1 / h] }; }, 1.2) };
  const frog = toe + Math.sqrt(2 * R * 2 * G);
  const split = toe + Math.sqrt(2 * R * 2.9);

  if (o.bed ?? true) bed(wr, 0, o.len, { mat: st.ballast, r: (s) => (s <= end ? off(s) : off(end)) + 1.75, step: 1.5 });
  stain(wr, 0, o.len, st.stain);
  if (st.stain) stain(branch, toe + 6, end, st.stain, TIE + 0.006);

  const sp = st.spacing ?? 0.6;
  const lever = o.lever ?? 'machine';
  const joint = Math.min(split, end);
  sleepers(wr, 0, joint, {
    mat: st.tie.includes('concrete') || st.tie.includes('steel') ? 'rail/sleeper-wood' : st.tie,
    spacing: sp,
    loose: st.loose,
    ext: (s) => {
      const own: [number, number] = [lever !== 'none' && Math.abs(s - toe + 0.3) < sp * 1.05 ? -2.5 : -1.3, off(s) + 1.3];
      return o.ties ? o.ties(s, own) : own;
    },
    rails: (s) => [...(off(s) < 0.2 ? [-G, G + off(s) / 2] : [-G, off(s) - G, G, off(s) + G]), ...(o.extraRails?.(s) ?? [])],
    fasten: 'plate',
  });
  if (joint < o.len && o.plainTies !== false) sleepers(wr, joint, o.len, { mat: st.tie, spacing: sp, fasten: st.fasten, loose: st.loose, len: st.tieLen });
  if (joint < end && o.plainTies !== false) sleepers(branch, joint, end, { mat: st.tie, spacing: sp, fasten: st.fasten, loose: st.loose, len: st.tieLen });

  const ro = { head: st.head, side: st.side };
  rail(wr, 0, o.len, -G, ro);
  rail(wr, 0, end, G, { ...ro, lat: (s) => G + off(s) });
  // Closed blade of the main route, planed to fit against the curved stock rail.
  const width = (s: number): number => Math.min(0.07, Math.max(0.012, off(s)));
  rail(wr, toe, o.len, G, { ...ro, lat: (s) => G - 0.035 + width(s) / 2, thin: (s) => width(s) / 0.07, step: 0.8 });
  // Open blade of the branch, held clear of the straight stock rail.
  const open = (s: number): number => 0.11 * Math.max(0, 1 - (s - toe) / 5.5);
  rail(wr, toe, end, 0, { ...ro, head: 'rail/head-dull', lat: (s) => off(s) - G + 0.035 - width(s) / 2 + open(s), thin: (s) => width(s) / 0.07, step: 0.8 });
  // Check rails opposite the crossing and the cast crossing itself.
  rail(wr, frog - 2.2, frog + 2.2, -G + 0.09, { head: 'rail/head-dull', side: st.side, thin: () => 0.55 });
  rail(wr, frog - 2.2, frog + 2.2, 0, { head: 'rail/head-dull', side: st.side, lat: (s) => off(s) + G - 0.09, thin: () => 0.55 });
  const ang = (frog - toe) / R / 2;
  const fp = poseAt({ ...wr, c: curve((q) => ({ p: [G + ang * (q - frog), q], t: [Math.sin(ang), Math.cos(ang)] }), 1) }, frog + 0.4);
  box(wr.b, 'rail/steel-cast', fp, [0, FOOT + 0.055, 0], [0.2, 0.055, 1.7], 'Y');
  for (let i = -2; i <= 2; i++) box(wr.b, 'rail/steel-cast', fp, [0, FOOT + 0.118, i * 0.7], [0.23, 0.008, 0.05], 'Y');

  // Stretcher bars between the blades and the drive from the lever.
  const z = toe + 0.3;
  for (const dz of [0, 1.3]) box(wr.b, 'rail/steel-dark', poseAt(wr, z + dz), [0, TIE + 0.05, 0], [G - 0.04, 0.012, 0.03]);
  if (lever !== 'none') {
    const p = poseAt(wr, toe - 0.3);
    box(wr.b, 'rail/steel-dark', p, [-1.35, TIE + 0.06, 0.3], [0.6, 0.012, 0.02]);
    if (lever === 'machine') {
      box(wr.b, 'rail/steel-cast', p, [-2.1, TIE + 0.13, 0], [0.26, 0.13, 0.5], 'Y');
      box(wr.b, 'furniture/enamel-black-old', p, [-2.1, TIE + 0.275, -0.1], [0.2, 0.015, 0.3], 'Y');
      pipe(b, 'furniture/cable', [at(p, -2.1, TIE + 0.1, -0.5), at(p, -2.1, TIE + 0.04, -0.8), at(p, -2.3, 0.3, -1.3)], 0.025, 6);
    } else {
      box(wr.b, 'rail/steel-cast', p, [-2.1, TIE + 0.05, 0], [0.2, 0.05, 0.3], 'Y');
      pipe(b, 'rail/steel-dark', [at(p, -2.1, TIE + 0.1, 0), at(p, -2.1, TIE + 1.25, 0)], 0.022, 6);
      const k = Math.SQRT1_2;
      const d: Pose = { ...p, o: at(p, -2.1, TIE + 1.25, 0), x: norm([p.x[0] + p.y[0], p.x[1] + p.y[1], p.x[2] + p.y[2]]), y: norm([p.y[0] - p.x[0], p.y[1] - p.x[1], p.y[2] - p.x[2]]) };
      box(wr.b, 'furniture/enamel-red-old', d, [0, 0, 0], [0.16 * k * 1.4, 0.16 * k * 1.4, 0.008]);
      box(wr.b, 'furniture/enamel-white', p, [-2.1, TIE + 0.8, 0], [0.008, 0.1, 0.1]);
      pipe(b, 'rail/steel-dark', [at(p, -2.1, TIE + 0.3, 0), at(p, -2.1, TIE + 0.45, 0.55)], 0.018, 6);
      box(wr.b, 'furniture/enamel-white', p, [-2.1, TIE + 0.47, 0.6], [0.03, 0.03, 0.07]);
    }
  }
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Builder view that reverses every quad, for geometry assembled in a mirrored pose. */
function mirrorBuilder(b: MeshBuilder): MeshBuilder {
  const m = Object.create(b) as MeshBuilder;
  m.quad = (material, a, bb, c, d, uv, layer, normal) => b.quad(material, d, c, bb, a, uv ? [uv[3], uv[2], uv[1], uv[0]] : uv, layer, normal);
  return m;
}
