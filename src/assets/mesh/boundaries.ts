import { MeshBuilder, V3 } from './builder';
import { rail as railing, sheet } from './buildkit';
import { Pose, at, box, catenary, lathe, move, pipe, plate, roll, stand, tilt, turn } from './kit';
import { addModel } from './registry';

export const S = (id: string): string => `site/${id}`;
const ZINC = 'structure/steel-galvanized';
const RUSTY = 'structure/steel-galvanized-rusty';
const BLACK = 'structure/steel-black';
const WOOD = 'signal/pole-wood';
const GREYWOOD = 'signal/pole-wood-grey';
const CONC = 'structure/wall-smooth';
const OLDCONC = 'structure/wall-old';
const CAP = S('wall-cap');

/** Evenly spaced stations from 0 to len, about `gap` apart. */
export function spaced(len: number, gap: number): number[] {
  const n = Math.max(1, Math.round(len / gap));
  return Array.from({ length: n + 1 }, (_, i) => (len * i) / n);
}

/** A line to build along: pose at distance s, x pointing along the line. */
export interface Run {
  at: (s: number) => Pose;
  step: number;
}
export const along = (f: Pose): Run => ({ at: (s) => move(f, s, 0, 0), step: 1e6 });
/** Arc of radius R bending towards +z (R > 0) or -z. */
export const bendRun = (f: Pose, R: number): Run => ({
  at: (s) => turn(move(f, Math.sin(s / R) * R, 0, (1 - Math.cos(s / R)) * R), (-s / R) * (180 / Math.PI)),
  step: Math.max(0.5, Math.abs(R) * 0.06),
});

export interface ExtrudeOpts {
  step?: number;
  /** Also draws the back, for thin sheets. */
  both?: boolean;
  /** Texture coordinate at each profile point; defaults to the distance along the profile. */
  v?: number[];
  /** Moves the profile by [dz, dy] depending on s. */
  shift?: (s: number) => [number, number];
  closed?: boolean;
  /** Material of flat end caps (closed profiles that can be seen from their centre). */
  caps?: string;
}
/**
 * Extrudes a (z, y) profile along a run. The surface faces to the right of the listing direction
 * seen with z to the right and y up: bottom to top faces +z, +z to -z faces up; closed profiles
 * are listed counter-clockwise.
 */
export function extrude(b: MeshBuilder, mat: string, run: Run, s0: number, s1: number, prof: [number, number][], o: ExtrudeOpts = {}): void {
  const p = o.closed ? [...prof, prof[0]] : prof;
  const n = Math.max(1, Math.ceil((s1 - s0) / (o.step ?? run.step) - 1e-6));
  const pt = (s: number, i: number): V3 => {
    const [dz, dy] = o.shift ? o.shift(s) : [0, 0];
    return at(run.at(s), 0, p[i][1] + dy, p[i][0] + dz);
  };
  const v: number[] = o.v ? (o.closed ? [...o.v, o.v[0]] : o.v) : [];
  if (!o.v) {
    let d = 0;
    for (let i = 0; i < p.length; i++) {
      if (i > 0) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      v.push(d);
    }
  }
  for (let j = 0; j < n; j++) {
    const [a, c] = [s0 + ((s1 - s0) * j) / n, s0 + ((s1 - s0) * (j + 1)) / n];
    for (let i = 0; i + 1 < p.length; i++) {
      const [A, B, C, D] = [pt(a, i), pt(c, i), pt(c, i + 1), pt(a, i + 1)];
      const uv: [number, number][] = [[a, v[i]], [c, v[i]], [c, v[i + 1]], [a, v[i + 1]]];
      b.quad(mat, A, B, C, D, uv);
      if (o.both) b.quad(mat, B, A, D, C, [uv[1], uv[0], uv[3], uv[2]]);
    }
  }
  if (o.caps) {
    const cz = prof.reduce((t, q) => t + q[0], 0) / prof.length;
    const cy = prof.reduce((t, q) => t + q[1], 0) / prof.length;
    for (const [s, dir] of [[s0, -1], [s1, 1]] as const) {
      const [dz, dy] = o.shift ? o.shift(s) : [0, 0];
      const f = run.at(s);
      const c = at(f, 0, cy + dy, cz + dz);
      for (let i = 0; i + 1 < p.length; i++) {
        const [q0, q1] = dir < 0 ? [i, i + 1] : [i + 1, i];
        b.tri(o.caps, c, pt(s, q0), pt(s, q1), [[cz, cy], p[q0], p[q1]]);
      }
    }
  }
}

/** Two-sided panel of a fence texture from x0 to x1 standing on y0. `vh` is the texture height it shows (defaults to the whole texture). */
export function panel(b: MeshBuilder, tex: string, f: Pose, x0: number, x1: number, y0: number, h: number, z = 0, vh?: number): void {
  const mh = vh ?? b.part(tex).mh;
  sheet(b, tex, at(f, x0, y0, z), at(f, x1, y0, z), at(f, x1, y0 + h, z), at(f, x0, y0 + h, z), [[x0, 0], [x1, 0], [x1, mh], [x0, mh]]);
}
/** Panel of a texture that tiles both ways (mesh, netting, screens). */
export const mesh = (b: MeshBuilder, tex: string, f: Pose, x0: number, x1: number, y0: number, h: number, z = 0): void => panel(b, tex, f, x0, x1, y0, h, z, h);

export type PostCap = 'flat' | 'pyramid' | 'ball' | 'none';
export function sqPost(b: MeshBuilder, mat: string, f: Pose, x: number, h: number, r: number, z = 0, cap: PostCap = 'none'): void {
  box(b, mat, f, [x, h / 2, z], [r, h / 2, r], 'Y');
  const g = move(f, x, h, z);
  if (cap === 'flat') box(b, mat, g, [0, 0.015, 0], [r * 1.25, 0.015, r * 1.25]);
  if (cap === 'pyramid') lathe(b, mat, turn(g, 45), [[r * 1.75, 0], [r * 1.75, 0.02], [0, 0.02 + r * 0.9]], 4);
  if (cap === 'ball') lathe(b, mat, g, [[r * 0.5, 0], [r * 0.5, 0.02], [r * 1.05, 0.02 + r * 0.6], [r * 1.05, 0.02 + r * 1.2], [0, 0.02 + r * 2.1]], 10);
}
export function roundPost(b: MeshBuilder, mat: string, f: Pose, x: number, h: number, r: number, z = 0, y0 = 0): void {
  b.tube(mat, at(f, x, y0, z), at(f, x, h, z), r, 8, r, true);
}
/** Small signs fixed along a fence at height y. */
export function signsOn(b: MeshBuilder, f: Pose, len: number, signs: string[] | undefined, y: number, z = 0.035): void {
  (signs ?? []).forEach((t, i, all) => plate(b, t, f, [(len * (i + 0.5)) / all.length + 0.45, y, z]));
}

interface Common {
  signs?: string[];
}

// --- Timber and vinyl fences. ---
export interface BoardOpts extends Common {
  post?: string;
  gap?: number;
  lattice?: string;
  capRail?: boolean;
  lean?: number;
}
export function boardFence(b: MeshBuilder, f0: Pose, len: number, tex: string, o: BoardOpts = {}): void {
  const f = o.lean ? tilt(f0, o.lean) : f0;
  const h = b.part(tex).mh;
  const post = o.post ?? WOOD;
  const top = h + (o.lattice ? 0.42 : 0);
  for (const x of spaced(len, o.gap ?? 2.4)) sqPost(b, post, f, x, top + 0.03, 0.045, -0.066, o.lattice ? 'flat' : 'none');
  for (const y of h > 1.4 ? [0.28, h / 2, h - 0.26] : [0.25, h - 0.25]) box(b, post, f, [len / 2, y, -0.021], [len / 2, 0.045, 0.019]);
  panel(b, tex, f, 0, len, 0, h);
  if (o.lattice) {
    mesh(b, o.lattice, f, 0, len, h + 0.02, 0.36, -0.03);
    box(b, post, f, [len / 2, top, -0.03], [len / 2, 0.02, 0.03]);
    box(b, post, f, [len / 2, h + 0.01, -0.03], [len / 2, 0.012, 0.03]);
  }
  if (o.capRail) box(b, post, f, [len / 2, h + 0.02, -0.02], [len / 2, 0.02, 0.07]);
  signsOn(b, f, len, o.signs, h * 0.72, 0.012);
}
export function picketFence(b: MeshBuilder, f: Pose, len: number, tex: string, post: string, o: Common & { gap?: number } = {}): void {
  const h = b.part(tex).mh;
  for (const x of spaced(len, o.gap ?? 2.4)) sqPost(b, post, f, x, h + 0.1, 0.05, 0, 'pyramid');
  for (const y of [0.22, h - 0.28]) box(b, post, f, [len / 2, y, 0.02], [len / 2, 0.035, 0.012]);
  panel(b, tex, f, 0, len, 0.03, h, 0.036);
  signsOn(b, f, len, o.signs, h * 0.6, 0.05);
}
export function vinylFence(b: MeshBuilder, f: Pose, len: number, tex: string, post: string, o: Common & { lattice?: string } = {}): void {
  const h = b.part(tex).mh;
  const top = h + (o.lattice ? 0.4 : 0);
  for (const x of spaced(len, 2.4)) sqPost(b, post, f, x, top + 0.1, 0.065, 0, 'pyramid');
  for (const y of [0.06, h + 0.02]) box(b, post, f, [len / 2, y, 0], [len / 2, 0.045, 0.028]);
  panel(b, tex, f, 0, len, 0.08, h - 0.08, 0);
  if (o.lattice) {
    mesh(b, o.lattice, f, 0, len, h + 0.06, 0.32);
    box(b, post, f, [len / 2, top + 0.02, 0], [len / 2, 0.03, 0.028]);
  }
  signsOn(b, f, len, o.signs, h * 0.7, 0.012);
}
export function ranchFence(b: MeshBuilder, f: Pose, len: number, tex: string, post: string): void {
  const h = b.part(tex).mh;
  for (const x of spaced(len, 2.4)) sqPost(b, post, f, x, h + 0.1, 0.06, -0.075, 'flat');
  panel(b, tex, f, 0, len, 0.02, h);
}

// --- Iron and steel fences. ---
export interface IronOpts extends Common {
  /** Masonry piers instead of iron posts. */
  pier?: string;
  /** Low wall below the railing. */
  base?: string;
  baseH?: number;
  gap?: number;
  post?: string;
  finial?: PostCap;
}
export function ironFence(b: MeshBuilder, f: Pose, len: number, tex: string, o: IronOpts = {}): void {
  const h = b.part(tex).mh;
  const y0 = o.base ? o.baseH ?? 0.55 : 0;
  const post = o.post ?? BLACK;
  if (o.base) {
    box(b, o.base, f, [len / 2, y0 / 2, 0], [len / 2, y0 / 2, 0.15], 'Y');
    box(b, CAP, f, [len / 2, y0 + 0.025, 0], [len / 2, 0.035, 0.19]);
    y0 > 0 && panel(b, tex, f, 0, len, y0 + 0.06, h);
  } else panel(b, tex, f, 0, len, 0.02, h);
  for (const x of spaced(len, o.gap ?? (o.pier ? 3 : 2.4))) {
    if (o.pier) {
      const ph = y0 + h + 0.22;
      box(b, o.pier, f, [x, ph / 2, 0], [0.23, ph / 2, 0.23], 'Y');
      box(b, CAP, f, [x, ph + 0.04, 0], [0.28, 0.04, 0.28]);
      lathe(b, CAP, turn(move(f, x, ph + 0.08, 0), 45), [[0.3, 0], [0, 0.14]], 4);
    } else sqPost(b, post, f, x, y0 + h + 0.12, 0.03, 0, o.finial ?? 'ball');
  }
  signsOn(b, f, len, o.signs, y0 + h * 0.6, 0.03);
}
export function barsFence(b: MeshBuilder, f: Pose, len: number, tex: string, post: string, o: Common & { razor?: boolean } = {}): void {
  const h = b.part(tex).mh;
  for (const x of spaced(len, 2.5)) sqPost(b, post, f, x, h + 0.05, 0.04, -0.045, 'flat');
  panel(b, tex, f, 0, len, 0.04, h);
  if (o.razor) razor(b, f, 0, len, h + 0.02);
  signsOn(b, f, len, o.signs, 1.45, 0.02);
}
/** Coil of razor wire lying on top of a fence or wall. */
export function razor(b: MeshBuilder, f: Pose, x0: number, x1: number, y: number): void {
  const t = S('wire-razor');
  panel(b, t, f, x0, x1, y, 0.45);
  for (const a of [-55, 55]) {
    const g = tilt(move(f, 0, y + 0.225, 0), a);
    panel(b, t, g, x0 + 0.33, x1 + 0.33, -0.225, 0.45);
  }
}
export function weldFence(b: MeshBuilder, f: Pose, len: number, tex: string, mat: string, o: Common & { h?: number; barbed?: boolean; lean?: number } = {}): void {
  const h = o.h ?? 1.8;
  const xs = spaced(len, 2.5);
  for (const x of xs) {
    box(b, mat, f, [x, (h + 0.06) / 2, -0.03], [0.03, (h + 0.06) / 2, 0.02], 'Y');
    box(b, mat, f, [x, h + 0.07, -0.03], [0.036, 0.012, 0.026]);
  }
  mesh(b, tex, f, 0, len, 0.05, h - 0.05);
  for (const y of [0.05, h]) pipe(b, mat, [at(f, 0, y, 0), at(f, len, y, 0)], 0.006, 4, false);
  if (o.barbed) barbed(b, f, xs, h + 0.05, mat, 1);
  signsOn(b, f, len, o.signs, h * 0.7, 0.012);
}
/** Outrigger arms carrying three strands of barbed wire; `arms` 2 gives a V. */
export function barbed(b: MeshBuilder, f: Pose, xs: number[], y: number, mat: string, arms: 1 | 2, z = 0): void {
  for (const dir of arms === 2 ? [1, -1] : [1]) {
    for (const x of xs) b.tube(mat, at(f, x, y, z), at(f, x, y + 0.36, z + dir * 0.32), 0.016, 6, 0.016, true);
    for (let i = 0; i < 3; i++) {
      const q = 0.25 + i * 0.36;
      panel(b, S('wire-barbed'), move(f, i * 0.31, y + 0.36 * q - 0.15, z + dir * 0.32 * q), xs[0], xs[xs.length - 1], 0, 0.3);
    }
  }
}

export interface ChainOpts extends Common {
  h?: number;
  mat?: string;
  /** Privacy slats woven through the mesh. */
  slats?: string;
  /** Windscreen fabric tied to the mesh. */
  screen?: string;
  barbed?: 1 | 2;
  razor?: boolean;
  topRail?: boolean;
  gap?: number;
}
export function chainlink(b: MeshBuilder, f: Pose, len: number, o: ChainOpts = {}): void {
  const h = o.h ?? 1.8;
  const mat = o.mat ?? ZINC;
  const r = h > 2.6 ? 0.045 : 0.03;
  const xs = spaced(len, o.gap ?? 3);
  xs.forEach((x, i) => {
    const end = i === 0 || i === xs.length - 1;
    roundPost(b, mat, f, x, h + 0.08, end ? r * 1.3 : r);
    lathe(b, mat, move(f, x, h + 0.08, 0), [[(end ? r * 1.3 : r) + 0.006, 0], [0, 0.035]], 8);
  });
  if (o.topRail !== false) b.tube(mat, at(f, 0, h, 0), at(f, len, h, 0), 0.021, 6);
  if (h > 2.6) b.tube(mat, at(f, 0, h / 2, 0), at(f, len, h / 2, 0), 0.021, 6);
  pipe(b, mat, [at(f, 0, 0.07, 0.03), at(f, len, 0.07, 0.03)], 0.004, 4, false);
  mesh(b, o.slats ?? 'trim/chainlink', f, 0, len, 0.04, h - 0.04, r);
  if (o.screen) mesh(b, o.screen, f, 0.05, len - 0.05, 0.12, h - 0.3, r + 0.012);
  if (o.barbed) barbed(b, f, xs, h + 0.08, mat, o.barbed);
  if (o.razor) razor(b, f, 0, len, h + 0.05);
  signsOn(b, f, len, o.signs, h * 0.68, r + 0.03);
}

// --- Construction and temporary. ---
export function hoarding(b: MeshBuilder, f: Pose, len: number, tex: string, o: Common & { strip?: boolean; back?: string } = {}): void {
  const p = b.part(tex);
  const h = p.mh;
  const back = o.back ?? 'wall/plywood-tan';
  b.quad(tex, at(f, 0, 0, 0), at(f, len, 0, 0), at(f, len, h, 0), at(f, 0, h, 0), [[0, 0], [len, 0], [len, h], [0, h]]);
  b.quad(back, at(f, len, 0, -0.018), at(f, 0, 0, -0.018), at(f, 0, h, -0.018), at(f, len, h, -0.018), [[0, 0], [len, 0], [len, h], [0, h]]);
  box(b, back, f, [len / 2, h + 0.004, -0.009], [len / 2, 0.004, 0.009]);
  for (const x of spaced(len, 2.44)) {
    sqPost(b, WOOD, f, x, h, 0.045, -0.065);
    b.beam(WOOD, at(f, x, h * 0.72, -0.11), at(f, x, 0.02, -1.25), 0.045, 0.09);
    box(b, WOOD, f, [x, 0.03, -1.25], [0.06, 0.03, 0.25]);
  }
  for (const y of [0.3, h - 0.3]) box(b, WOOD, f, [len / 2, y, -0.04], [len / 2, 0.045, 0.02]);
  if (o.strip) for (const x of spaced(len, 2.44).slice(0, -1)) plate(b, S('sign-post-no-bills'), f, [x + 1.22, h - 0.18, 0.006]);
  signsOn(b, f, len, o.signs, 1.55, 0.008);
}
/** Free-standing mesh panels on concrete feet. */
export function tempFence(b: MeshBuilder, f: Pose, len: number, o: { w?: number; screen?: string; askew?: number; mat?: string; signs?: string[] } = {}): void {
  const w = o.w ?? 3.5;
  const n = Math.max(1, Math.round(len / w));
  const mat = o.mat ?? ZINC;
  let g = f;
  for (let i = 0; i < n; i++) {
    const a = o.askew && i === Math.floor(n / 2) ? o.askew : o.askew && i === Math.floor(n / 2) + 1 ? -o.askew : 0;
    g = turn(g, a);
    const P = (x: number, y: number): V3 => at(g, x, y, 0);
    pipe(b, mat, [P(0.03, 0.12), P(0.03, 2.0), P(w - 0.03, 2.0), P(w - 0.03, 0.12)], 0.019, 6);
    b.tube(mat, P(0.03, 0.28), P(w - 0.03, 0.28), 0.014, 6);
    b.tube(mat, P(w / 2, 0.28), P(w / 2, 2.0), 0.012, 6);
    mesh(b, S('mesh-weld-galvanized'), g, 0.03, w - 0.03, 0.28, 1.72);
    if (o.screen) mesh(b, o.screen, g, 0.06, w - 0.06, 0.32, 1.62, 0.012);
    box(b, OLDCONC, g, [0, 0.06, 0], [0.11, 0.06, 0.3]);
    if (i === n - 1) box(b, OLDCONC, g, [w, 0.06, 0], [0.11, 0.06, 0.3]);
    if (o.signs?.[i]) plate(b, o.signs[i], g, [w / 2 + 0.6, 1.3, 0.03]);
    g = move(g, w, 0, 0);
  }
}

// --- Masonry walls. ---
export interface WallOpts extends Common {
  h?: number;
  t?: number;
  cap?: string | null;
  /** Piers of this material every `gap` metres. */
  pier?: string;
  gap?: number;
  /** Clay tile ridge instead of a flat coping. */
  ridge?: string;
  razor?: boolean;
  /** Railing texture standing on top. */
  top?: string;
}
export function masonry(b: MeshBuilder, f: Pose, len: number, tex: string, o: WallOpts = {}): void {
  const h = o.h ?? 1.8;
  const t = (o.t ?? 0.2) / 2;
  box(b, tex, f, [len / 2, h / 2, 0], [len / 2, h / 2, t], 'Y');
  let top = h;
  if (o.ridge) {
    extrude(b, o.ridge, along(f), -0.03, len + 0.03, [[t + 0.08, h], [0, h + 0.14], [-t - 0.08, h]], { caps: o.ridge, closed: true });
    top = h + 0.14;
  } else if (o.cap !== null) {
    box(b, o.cap ?? CAP, f, [len / 2, h + 0.03, 0], [len / 2 + 0.02, 0.03, t + 0.035]);
    top = h + 0.06;
  }
  if (o.pier) {
    for (const x of spaced(len, o.gap ?? 3)) {
      const ph = top + 0.2 + (o.top ? b.part(o.top).mh : 0);
      box(b, o.pier, f, [x, ph / 2, 0], [t + 0.09, ph / 2, t + 0.09], 'Y');
      box(b, o.cap ?? CAP, f, [x, ph + 0.035, 0], [t + 0.14, 0.035, t + 0.14]);
    }
  }
  if (o.top) panel(b, o.top, f, 0, len, top, b.part(o.top).mh);
  if (o.razor) razor(b, f, 0, len, top);
  signsOn(b, f, len, o.signs, Math.min(1.5, h * 0.7), t + 0.008);
}
/** Dry-stone wall: wider at the foot, with a row of stones on edge along the top. */
export function dryStone(b: MeshBuilder, f: Pose, len: number, tex: string, h = 1.1, cope = S('wall-cobble')): void {
  extrude(b, tex, along(f), 0, len, [[0.34, 0], [0.2, h], [-0.2, h], [-0.34, 0]], { caps: tex });
  for (let x = 0.12, i = 0; x < len - 0.1; x += 0.24, i++) {
    const k = 0.7 + ((i * 37) % 10) / 22;
    box(b, cope, roll(move(f, x, h + 0.09 * k, 0), ((i * 53) % 13) - 6), [0, 0, 0], [0.1, 0.1 * k + 0.02, 0.2]);
  }
}
/** Precast concrete posts with slotted-in panels. */
export function panelWall(b: MeshBuilder, f: Pose, len: number, tex: string, o: { h?: number; post?: string; rows?: number } = {}): void {
  const h = o.h ?? 1.8;
  const rows = o.rows ?? 4;
  const post = o.post ?? OLDCONC;
  const xs = spaced(len, 2.4);
  for (const x of xs) sqPost(b, post, f, x, h + 0.12, 0.075, 0, 'pyramid');
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let r = 0; r < rows; r++) {
      const [y0, y1] = [(h * r) / rows + 0.01, (h * (r + 1)) / rows - 0.01];
      box(b, tex, f, [(xs[i] + xs[i + 1]) / 2, (y0 + y1) / 2, ((r + i) % 2) * 0.004], [(xs[i + 1] - xs[i]) / 2 - 0.07, (y1 - y0) / 2, 0.025]);
    }
  }
}

// --- Retaining walls. ---
export interface RetainOpts {
  h?: number;
  /** Lean back per metre of height. */
  batter?: number;
  cap?: string | null;
  ground?: string;
  depth?: number;
  /** Heights of sections along the wall as fractions of h, for walls stepping down a slope. */
  steps?: number[];
}
export function retaining(b: MeshBuilder, f: Pose, len: number, tex: string, o: RetainOpts = {}): void {
  const H = o.h ?? 2.4;
  const depth = o.depth ?? 2.6;
  const ground = o.ground ?? 'ground/grass-patchy';
  const steps = o.steps ?? [1];
  const run = along(f);
  steps.forEach((k, i) => {
    const [x0, x1] = [(len * i) / steps.length, (len * (i + 1)) / steps.length];
    const h = H * k;
    const back = -(o.batter ?? 0) * h;
    extrude(b, tex, run, x0, x1, [[0, 0], [back, h]]);
    if (o.cap !== null) box(b, o.cap ?? CAP, f, [(x0 + x1) / 2, h + 0.03, back - 0.14], [(x1 - x0) / 2, 0.035, 0.19]);
    extrude(b, ground, run, x0, x1, [[back - 0.3, h - 0.04], [-depth, h + 0.1]]);
    const side: [number, number][] = [[0, 0], [back, h], [back - 0.3, h - 0.04], [-depth, h + 0.1], [-depth, 0]];
    const prev = i > 0 ? H * steps[i - 1] : 0;
    const next = i + 1 < steps.length ? H * steps[i + 1] : 0;
    for (const [x, dir, other] of [[x0, -1, prev], [x1, 1, next]] as const) {
      if (other >= h) continue;
      const g = move(f, x, 0, 0);
      const mat = i > 0 && dir < 0 || i + 1 < steps.length && dir > 0 ? tex : 'ground/dirt';
      for (let j = 1; j + 1 < side.length; j++) {
        const [q0, q1] = dir < 0 ? [j, j + 1] : [j + 1, j];
        b.tri(mat, at(g, 0, side[0][1], side[0][0]), at(g, 0, side[q0][1], side[q0][0]), at(g, 0, side[q1][1], side[q1][0]), [side[0], side[q0], side[q1]]);
      }
    }
    b.quad('ground/dirt', at(f, x1, 0, -depth), at(f, x0, 0, -depth), at(f, x0, h + 0.1, -depth), at(f, x1, h + 0.1, -depth), [[0, 0], [x1 - x0, 0], [x1 - x0, h], [0, h]]);
  });
}
/** Stacked stone-filled wire baskets, each course set back. */
export function gabions(b: MeshBuilder, f: Pose, len: number, tex: string, courses: number, setback = 0.45): void {
  for (let i = 0; i < courses; i++) {
    for (let x = 0; x < len - 0.01; x += 2) {
      const w = Math.min(2, len - x);
      box(b, tex, f, [x + w / 2, i + 0.5, -i * setback - 0.5 + ((x / 2 + i) % 2) * 0.012], [w / 2 - 0.006, 0.497, 0.5], i ? '' : 'Y');
    }
  }
  const [h, back] = [courses, -(courses - 1) * setback - 1];
  extrude(b, 'ground/grass-dry', along(f), 0, len, [[back, h - 0.05], [back - 1.8, h + 0.05]]);
}

// --- Noise barriers. ---
export interface NoiseOpts {
  h?: number;
  gap?: number;
  post?: string;
  /** Clear panels above the solid ones. */
  glass?: number;
  /** Top section leaning over the road. */
  crank?: number;
  jersey?: boolean;
  back?: string;
}
export const JERSEY: [number, number][] = [[0.305, 0], [0.305, 0.075], [0.125, 0.33], [0.075, 0.81], [-0.075, 0.81], [-0.125, 0.33], [-0.305, 0.075], [-0.305, 0]];
const jerseyV = (p: [number, number][]): number[] => p.map((q) => q[1]);
export function noiseWall(b: MeshBuilder, f: Pose, len: number, tex: string, o: NoiseOpts = {}): void {
  const h = o.h ?? 3;
  const post = o.post ?? ZINC;
  const y0 = o.jersey ? 0.81 : 0.12;
  if (o.jersey) extrude(b, 'structure/barrier-dirty', along(f), 0, len, JERSEY, { caps: 'structure/barrier-dirty', v: jerseyV(JERSEY) });
  else box(b, CONC, f, [len / 2, 0.06, 0], [len / 2, 0.06, 0.2]);
  const xs = spaced(len, o.gap ?? 4);
  const top = y0 + h + (o.glass ?? 0);
  for (const x of xs) {
    box(b, post, f, [x, (y0 + top + 0.05) / 2, 0], [0.012, (top + 0.05 - y0) / 2, 0.1]);
    for (const z of [-0.1, 0.1]) box(b, post, f, [x, (y0 + top + 0.05) / 2, z], [0.09, (top + 0.05 - y0) / 2, 0.012]);
    if (o.crank) {
      const g = tilt(move(f, x, top + 0.05, 0), 38);
      box(b, post, g, [0, o.crank / 2, 0], [0.08, o.crank / 2, 0.08]);
    }
  }
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i] + 0.02, xs[i + 1] - 0.02];
    for (let y = y0; y < y0 + h - 0.01; y += 3) {
      const ph = Math.min(3, y0 + h - y);
      b.quad(tex, at(f, x0, y, 0.06), at(f, x1, y, 0.06), at(f, x1, y + ph, 0.06), at(f, x0, y + ph, 0.06), [[x0, 0], [x1, 0], [x1, ph], [x0, ph]]);
      b.quad(o.back ?? tex, at(f, x1, y, -0.06), at(f, x0, y, -0.06), at(f, x0, y + ph, -0.06), at(f, x1, y + ph, -0.06), [[x0, 0], [x1, 0], [x1, ph], [x0, ph]]);
    }
    box(b, post, f, [(x0 + x1) / 2, y0 + h + 0.02, 0], [(x1 - x0) / 2, 0.02, 0.07]);
    if (o.glass) {
      panel(b, S('noise-glass'), f, x0, x1, y0 + h + 0.04, o.glass - 0.04, 0, o.glass);
      box(b, post, f, [(x0 + x1) / 2, top + 0.02, 0], [(x1 - x0) / 2, 0.025, 0.035]);
    }
    if (o.crank) {
      const g = tilt(move(f, 0, top + 0.05, 0), 38);
      panel(b, S('noise-glass'), g, x0, x1, 0, o.crank, 0, o.crank);
      box(b, post, g, [(x0 + x1) / 2, o.crank, 0], [(x1 - x0) / 2, 0.025, 0.035]);
    }
  }
}

// --- Road restraint. ---
const W_BEAM: [number, number][] = [[0, -0.156], [0.035, -0.135], [0.08, -0.105], [0.08, -0.065], [0.03, -0.03], [0.012, 0], [0.03, 0.03], [0.08, 0.065], [0.08, 0.105], [0.035, 0.135], [0, 0.156]];
const THRIE: [number, number][] = [[0, -0.253], [0.035, -0.232], [0.08, -0.202], [0.08, -0.162], [0.03, -0.127], [0.012, -0.097], [0.03, -0.067], [0.08, -0.02], [0.08, 0.02], [0.03, 0.067], [0.012, 0.097], [0.03, 0.127], [0.08, 0.162], [0.08, 0.202], [0.035, 0.232], [0, 0.253]];
export type RailEnd = 'none' | 'down' | 'flare' | 'head' | 'nose';
export interface GuardOpts {
  mat?: string;
  post?: 'steel' | 'wood';
  postMat?: string;
  thrie?: boolean;
  /** Beams on both sides of the posts (medians). */
  double?: boolean;
  ends?: [RailEnd, RailEnd];
  /** Dent of this depth in the middle, as left by a crash. */
  dent?: number;
  rub?: boolean;
  gap?: number;
}
export function guardrail(b: MeshBuilder, run: Run, len: number, o: GuardOpts = {}): void {
  const mat = o.mat ?? 'trim/paint-galvanized';
  const wood = (o.post ?? 'steel') === 'wood';
  const postMat = o.postMat ?? (wood ? GREYWOOD : mat);
  const prof = o.thrie ? THRIE : W_BEAM;
  const yc = o.thrie ? 0.56 : 0.55;
  const ends = o.ends ?? ['none', 'none'];
  const L = 3.8;
  const sm = (q: number): number => q * q * (3 - 2 * q);
  const shift = (s: number): [number, number] => {
    let [dz, dy] = [0, 0];
    for (const [e, d] of [[ends[0], s], [ends[1], len - s]] as const) {
      if (d >= L) continue;
      const q = 1 - d / L;
      if (e === 'down') dy -= (yc + 0.05) * sm(q);
      if (e === 'flare') dz -= 1.2 * q * q;
    }
    if (o.dent) dz -= o.dent * Math.exp(-(((s - len * 0.55) / 1.3) ** 2));
    return [dz, dy];
  };
  const moving = ends.some((e) => e === 'down' || e === 'flare') || !!o.dent;
  const step = moving ? 0.4 : undefined;
  extrude(b, mat, run, 0, len, prof.map(([z, y]) => [z, y + yc] as [number, number]), { both: true, shift, step });
  if (o.double) extrude(b, mat, run, 0, len, prof.map(([z, y]) => [-z - 0.5, y + yc] as [number, number]), { both: true, shift, step });
  if (o.rub) extrude(b, mat, run, 0, len, [[0.03, 0.2], [0.06, 0.24], [0.06, 0.3], [0.03, 0.34]], { both: true, shift, step });
  const gap = o.gap ?? 1.905;
  const n = Math.max(1, Math.round(len / gap));
  for (let i = 0; i <= n; i++) {
    const s = (len * i) / n;
    const [dz, dy] = shift(s);
    const top = yc + 0.19 + dy;
    if (top < 0.25) continue;
    const lean = o.dent ? -40 * Math.exp(-(((s - len * 0.55) / 1.3) ** 2)) : 0;
    const g = tilt(move(run.at(s), 0, 0, dz), lean);
    const [pw, pd] = wood ? [0.075, 0.1] : [0.05, 0.075];
    box(b, postMat, g, [0, top / 2, -0.15 - pd], [pw, top / 2, pd], 'Y');
    box(b, wood ? postMat : mat, g, [0, yc + dy, -0.075], [wood ? 0.075 : 0.05, o.thrie ? 0.27 : 0.18, 0.075]);
    if (o.double) box(b, wood ? postMat : mat, g, [0, yc + dy, -0.15 - pd * 2 - 0.075], [wood ? 0.075 : 0.05, o.thrie ? 0.27 : 0.18, 0.075]);
    if (i % 3 === 1 && !lean) plate(b, S('reflector-strip'), g, [0, yc + dy, 0.016], { size: [0.11, 0.045] });
  }
  for (const [e, s, dir] of [[ends[0], 0, -1], [ends[1], len, 1]] as const) {
    const g = move(run.at(s), 0, yc, 0);
    if (e === 'head') {
      const hf = turn(move(g, dir * 0.06, 0, 0.04), dir > 0 ? -90 : 90);
      box(b, mat, hf, [0, 0, -0.5], [0.09, 0.2, 0.5]);
      box(b, mat, hf, [0, 0, 0.03], [0.26, 0.26, 0.03]);
      plate(b, S('stripes-yellow-black'), hf, [0, 0, 0.064], { size: [0.5, 0.5] });
    }
    if (e === 'nose') {
      const pts: [number, number][] = [];
      for (let a = 0; a <= 180; a += 20) pts.push([-0.25 + 0.25 * Math.cos((a * Math.PI) / 180), dir * 0.25 * Math.sin((a * Math.PI) / 180)]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const P = (k: number, y: number): V3 => at(g, pts[k][1], y, pts[k][0]);
        sheet(b, mat, P(i, -0.156), P(i + 1, -0.156), P(i + 1, 0.156), P(i, 0.156), [[i * 0.09, 0], [i * 0.09 + 0.09, 0], [i * 0.09 + 0.09, 0.31], [i * 0.09, 0.31]]);
      }
    }
  }
}
/** Tensioned wire-rope barrier. */
export function cableBarrier(b: MeshBuilder, f: Pose, len: number, o: { ropes?: number; mat?: string; anchors?: boolean } = {}): void {
  const mat = o.mat ?? 'trim/paint-galvanized';
  const ropes = o.ropes ?? 4;
  const [a0, a1] = o.anchors === false ? [0, len] : [2.4, len - 2.4];
  const xs = spaced(a1 - a0, 3).map((x) => x + a0);
  for (const x of xs) {
    box(b, mat, f, [x, 0.5, 0], [0.02, 0.5, 0.04], 'Y');
    box(b, 'site/plastic-yellow', f, [x, 1.01, 0], [0.024, 0.012, 0.044]);
  }
  for (let i = 0; i < ropes; i++) {
    const y = 0.48 + (i * 0.46) / Math.max(1, ropes - 1);
    const z = i % 2 ? 0.045 : -0.045;
    const pts: V3[] = [at(f, a0, y, z), at(f, a1, y, z)];
    if (o.anchors !== false) {
      pts.unshift(at(f, 0.3, 0.12, z * 0.5));
      pts.push(at(f, len - 0.3, 0.12, z * 0.5));
    }
    for (let k = 0; k + 1 < pts.length; k++) b.tube(RUSTY, pts[k], pts[k + 1], 0.0095, 5);
  }
  if (o.anchors !== false) for (const x of [0.25, len - 0.25]) box(b, 'concrete/walk-plain', f, [x, 0.07, 0], [0.35, 0.07, 0.3], 'Y');
}
/** Concrete barrier of a given profile. `joints` > 0 cuts it into loose precast units. */
export function concreteBarrier(b: MeshBuilder, run: Run, len: number, o: { tex?: string; prof?: [number, number][]; unit?: number; taper?: boolean } = {}): void {
  const tex = o.tex ?? 'structure/barrier';
  const prof = o.prof ?? JERSEY;
  if (o.unit) {
    const n = Math.round(len / o.unit);
    for (let i = 0; i < n; i++) {
      const [s0, s1] = [(len * i) / n + 0.03, (len * (i + 1)) / n - 0.03];
      extrude(b, tex, run, s0, s1, prof, { caps: tex, v: jerseyV(prof) });
      for (const s of [s0 + 0.7, s1 - 0.7]) box(b, 'trim/paint-charcoal', run.at(s), [0, 0.05, 0], [0.15, 0.05, 0.307]);
      if (i) for (const y of [0.3, 0.55]) box(b, RUSTY, run.at(s0 - 0.03), [0, y, 0], [0.05, 0.012, 0.03]);
    }
  } else if (o.taper) {
    const k = (s: number): number => Math.min(1, 0.12 + s / 4);
    const m = Math.ceil(len / 0.5);
    for (let j = 0; j < m; j++) {
      const [s0, s1] = [(len * j) / m, (len * (j + 1)) / m];
      const [p0, p1] = [prof.map(([z, y]) => [z, y * k(s0)] as [number, number]), prof.map(([z, y]) => [z, y * k(s1)] as [number, number])];
      for (let i = 0; i + 1 < prof.length; i++) {
        const P = (s: number, p: [number, number][], q: number): V3 => at(run.at(s), 0, p[q][1], p[q][0]);
        b.quad(tex, P(s0, p0, i), P(s1, p1, i), P(s1, p1, i + 1), P(s0, p0, i + 1), [[s0, p0[i][1]], [s1, p1[i][1]], [s1, p1[i + 1][1]], [s0, p0[i + 1][1]]]);
      }
    }
    extrude(b, tex, run, 0, 0.001, prof.map(([z, y]) => [z, y * k(0)] as [number, number]), { caps: tex });
    extrude(b, tex, run, len - 0.001, len, prof, { caps: tex });
  } else extrude(b, tex, run, 0, len, prof, { caps: tex, v: jerseyV(prof) });
}
const F_SHAPE: [number, number][] = [[0.28, 0], [0.28, 0.075], [0.16, 0.255], [0.1, 0.81], [-0.1, 0.81], [-0.16, 0.255], [-0.28, 0.075], [-0.28, 0]];
const SLOPE: [number, number][] = [[0.3, 0], [0.11, 1.07], [-0.11, 1.07], [-0.3, 0]];
const TALL: [number, number][] = [[0.305, 0], [0.305, 0.075], [0.125, 0.33], [0.08, 1.37], [-0.08, 1.37], [-0.125, 0.33], [-0.305, 0.075], [-0.305, 0]];
const HALF: [number, number][] = [[0.305, 0], [0.305, 0.075], [0.125, 0.33], [0.075, 0.81], [-0.1, 0.81], [-0.1, 0]];

/** Water-filled plastic barrier units, alternating colours. */
export function waterBarriers(b: MeshBuilder, f: Pose, len: number, colors: string[], o: { skew?: boolean } = {}): void {
  const n = Math.round(len / 2);
  const prof: [number, number][] = [[0.24, 0], [0.24, 0.12], [0.1, 0.42], [0.09, 0.9], [-0.09, 0.9], [-0.1, 0.42], [-0.24, 0.12], [-0.24, 0]];
  for (let i = 0; i < n; i++) {
    const c = colors[i % colors.length];
    const g = turn(move(f, i * 2 + 0.04, 0, o.skew ? (((i * 7) % 5) - 2) * 0.05 : 0), o.skew ? ((i * 11) % 7) - 3 : 0);
    extrude(b, c, along(g), 0, 1.92, prof, { caps: c, v: prof.map((q) => q[1]) });
    b.tube('trim/paint-charcoal', at(g, 0.5, 0.9, 0), at(g, 0.5, 0.93, 0), 0.06, 8, 0.06, true);
    for (const z of [-0.105, 0.105]) for (const x of [0.6, 1.32]) box(b, c, g, [x, 0.62, z], [0.3, 0.1, 0.012]);
  }
}

/** Posts joined by sagging chain or rope. */
export function postAndChain(b: MeshBuilder, f: Pose, len: number, o: { post: string; link: string; h?: number; r?: number; gap?: number; sag?: number; lr?: number; rows?: number; cap?: boolean }): void {
  const h = o.h ?? 0.9;
  const r = o.r ?? 0.05;
  const xs = spaced(len, o.gap ?? 2);
  for (const x of xs) {
    lathe(b, o.post, move(f, x, 0, 0), o.cap === false ? [[r, 0], [r, h], [0, h]] : [[r * 1.5, 0], [r * 1.5, 0.05], [r, 0.09], [r, h - 0.08], [r * 1.3, h - 0.06], [r * 1.3, h - 0.02], [r * 0.6, h + 0.02], [r * 0.9, h + 0.07], [0, h + 0.12]], 10);
  }
  for (let k = 0; k < (o.rows ?? 1); k++) {
    const y = h - 0.1 - k * 0.32;
    for (let i = 0; i + 1 < xs.length; i++) pipe(b, o.link, catenary(at(f, xs[i], y, 0), at(f, xs[i + 1], y, 0), o.sag ?? 0.16, 8), o.lr ?? 0.012, 5, false);
  }
}
/** Low timber rail keeping cars off grass. */
export function kneeRail(b: MeshBuilder, f: Pose, len: number, mat: string, o: { h?: number; diamond?: boolean; rails?: number } = {}): void {
  const h = o.h ?? 0.5;
  for (const x of spaced(len, 1.8)) sqPost(b, mat, f, x, h, 0.06);
  const rails = o.rails ?? 1;
  for (let i = 0; i < rails; i++) {
    const g = move(f, 0, h - 0.02 - i * 0.3, 0);
    if (o.diamond) box(b, mat, roll(turn(move(g, len / 2, 0, 0), 90), 45), [0, 0, 0], [0.05, 0.05, len / 2 + 0.1]);
    else box(b, mat, g, [len / 2, -0.03, rails > 1 ? 0.075 : 0], [len / 2 + 0.1, 0.07, rails > 1 ? 0.02 : 0.045]);
  }
}
/** Pedestrian guard rail using a railing texture between posts. */
export function pedRail(b: MeshBuilder, f: Pose, len: number, tex: string, post: string, o: { gap?: number; h?: number } = {}): void {
  const h = o.h ?? 1.05;
  for (const x of spaced(len, o.gap ?? 2)) sqPost(b, post, f, x, h + 0.03, 0.028, 0, 'flat');
  railing(b, tex, at(f, 0, 0, 0), at(f, len, 0, 0), h);
}
/** Bars of round tube on posts. */
export function tubeRail(b: MeshBuilder, f: Pose, len: number, mat: string, ys: number[], o: { gap?: number; r?: number; ends?: boolean } = {}): void {
  const r = o.r ?? 0.024;
  const top = Math.max(...ys);
  const xs = spaced(len, o.gap ?? 2);
  for (const x of xs) roundPost(b, mat, f, x, top, r * 1.15);
  for (const y of ys) {
    if (o.ends && y === top) pipe(b, mat, [at(f, 0, 0.02, 0), at(f, 0, top - 0.12, 0), at(f, 0.12, top, 0), at(f, len - 0.12, top, 0), at(f, len, top - 0.12, 0), at(f, len, 0.02, 0)], r, 8);
    else b.tube(mat, at(f, 0, y, 0), at(f, len, y, 0), r, 8, r, true);
  }
}

// --- Gates. ---
/** Framed leaf of a railing or mesh texture hinged at the pose, w wide. */
export function leaf(b: MeshBuilder, f: Pose, w: number, h: number, tex: string, mat: string, o: { tile?: boolean; brace?: boolean; y0?: number; r?: number } = {}): void {
  const y0 = o.y0 ?? 0.08;
  const r = o.r ?? 0.022;
  const P = (x: number, y: number): V3 => at(f, x, y, 0);
  pipe(b, mat, [P(r, y0), P(r, y0 + h), P(w - r, y0 + h), P(w - r, y0), P(r, y0)], r, 6);
  if (o.tile) mesh(b, tex, f, r, w - r, y0, h);
  else panel(b, tex, f, r, w - r, y0, h);
  if (o.brace) b.tube(mat, P(r, y0), P(w - r, y0 + h), r * 0.8, 6);
}
function boom(b: MeshBuilder, f: Pose, len: number, angle: number, o: { cab?: string; arm?: string; sign?: string } = {}): void {
  const cab = o.cab ?? 'structure/steel-yellow';
  box(b, OLDCONC, f, [0, 0.05, 0], [0.3, 0.05, 0.3], 'Y');
  box(b, cab, f, [0, 0.62, 0], [0.18, 0.52, 0.18], 'Y');
  box(b, 'trim/paint-charcoal', f, [0, 1.16, 0], [0.2, 0.02, 0.2]);
  const g = roll(move(f, 0.1, 0.95, 0.2), angle);
  box(b, 'trim/paint-charcoal', g, [0, 0, 0], [0.12, 0.09, 0.03]);
  const arm = o.arm ?? S('stripes-red-white');
  box(b, arm, g, [len / 2, 0, 0.045], [len / 2, 0.045, 0.014]);
  box(b, cab, g, [-0.3, 0, 0.045], [0.2, 0.07, 0.03]);
  if (o.sign) plate(b, o.sign, g, [len * 0.5, -0.32, 0.05]);
}

export function addBoundaries(): void {
  const A = (id: string, label: string, fn: (b: MeshBuilder, f: Pose) => void): void => addModel('boundary', id, label, (b) => fn(b, stand([-6, 0, 0])));
  const L = 12;

  // Board fences.
  const BOARDS: [string, string, string, BoardOpts][] = [
    ['cedar', '板塀 シダー(ドッグイヤー)', 'fence-board-cedar', {}],
    ['weathered', '板塀 風化して灰色', 'fence-board-weathered', { post: GREYWOOD, lean: -4 }],
    ['redwood', '板塀 レッドウッド 笠木つき', 'fence-board-redwood', { capRail: true }],
    ['brown', '板塀 茶色の塗装', 'fence-board-brown', { post: 'trim/paint-brown-old' }],
    ['white', '板塀 白塗り 格子つき', 'fence-board-white', { post: 'trim/paint-white-old', lattice: 'trim/lattice-white' }],
    ['green', '板塀 緑の塗装', 'fence-board-green', { post: 'trim/paint-green', signs: [S('sign-beware-dog')] }],
    ['low', '板塀 低い(1.2m)', 'fence-board-low', {}],
    ['cedar-lattice', '板塀 シダー 格子つき', 'fence-board-cedar', { lattice: 'trim/lattice-brown', gap: 1.8 }],
    ['weathered-signs', '板塀 風化 警告板つき', 'fence-board-weathered', { post: GREYWOOD, signs: [S('sign-private'), S('sign-keep-out')] }],
  ];
  for (const [id, label, tex, o] of BOARDS) A(`board-${id}`, label, (b, f) => boardFence(b, f, L, S(tex), o));
  const PICKETS: [string, string, string][] = [['white', '白', 'trim/paint-white'], ['peeling', '塗装はがれ', 'trim/paint-white-old'], ['natural', '無塗装', WOOD], ['grey', '風化', GREYWOOD]];
  for (const [id, label, post] of PICKETS) A(`picket-${id}`, `ピケットフェンス ${label}`, (b, f) => picketFence(b, f, L, S(`fence-picket-${id}`), post));
  A('picket-for-sale', 'ピケットフェンス 売り家の看板', (b, f) => {
    picketFence(b, f, L, S('fence-picket-white'), 'trim/paint-white', { gap: 2 });
    const g = move(f, 4, 0, 1.2);
    sqPost(b, 'trim/paint-white', g, 0, 1.7, 0.045, 0, 'flat');
    box(b, 'trim/paint-white', g, [0.5, 1.6, 0], [0.55, 0.04, 0.04]);
    plate(b, S('sign-for-sale'), g, [0.55, 1.2, 0], { back: S('sign-for-sale') });
  });
  A('vinyl-white', '樹脂フェンス 白', (b, f) => vinylFence(b, f, L, S('fence-vinyl-white'), 'trim/paint-white'));
  A('vinyl-tan', '樹脂フェンス ベージュ 格子つき', (b, f) => vinylFence(b, f, L, S('fence-vinyl-tan'), 'trim/paint-tan', { lattice: 'trim/lattice-white' }));
  A('ranch-white', '牧場柵 白', (b, f) => ranchFence(b, f, L, S('fence-ranch-white'), 'trim/paint-white-old'));
  A('ranch-brown', '牧場柵 茶', (b, f) => ranchFence(b, f, L, S('fence-ranch-brown'), 'trim/paint-brown-old'));

  // Iron.
  const IRON: [string, string, string, IronOpts][] = [
    ['spear', '鉄柵 槍先', 'fence-iron-spear', {}],
    ['spear-rusty', '鉄柵 槍先 さび', 'fence-iron-spear-rusty', { post: 'trim/paint-rust', finial: 'pyramid' }],
    ['flat', '鉄柵 フラットトップ', 'fence-iron-flat', { finial: 'flat' }],
    ['hoop', '鉄柵 フープトップ', 'fence-iron-hoop', { finial: 'ball', gap: 2 }],
    ['green', '鉄柵 緑(公園)', 'fence-iron-green', { post: 'structure/steel-green', signs: [S('sign-park-rules')] }],
    ['white', '鉄柵 白', 'fence-iron-white', { post: 'structure/steel-white', finial: 'flat' }],
    ['spear-brick-piers', '鉄柵 レンガの門柱', 'fence-iron-spear', { pier: 'wall/brick-red' }],
    ['spear-brick-base', '鉄柵 レンガの腰壁と門柱', 'fence-iron-spear', { pier: 'wall/brick-brown', base: 'wall/brick-brown' }],
    ['flat-stone-base', '鉄柵 石の腰壁', 'fence-iron-flat', { pier: 'wall/stone-limestone', base: 'wall/stone-limestone', baseH: 0.7 }],
    ['hoop-stucco-base', '鉄柵 スタッコの腰壁', 'fence-iron-hoop', { pier: 'wall/stucco-cream', base: 'wall/stucco-cream', baseH: 0.8, gap: 2.4 }],
    ['white-block-base', '鉄柵 白 ブロックの腰壁', 'fence-iron-white', { base: 'wall/block-white', baseH: 0.6, post: 'structure/steel-white', finial: 'flat' }],
    ['spear-fieldstone', '鉄柵 自然石の腰壁と門柱', 'fence-iron-spear-rusty', { pier: S('wall-fieldstone'), base: S('wall-fieldstone'), baseH: 0.6, gap: 4 }],
  ];
  for (const [id, label, tex, o] of IRON) A(`iron-${id}`, label, (b, f) => ironFence(b, f, L, S(tex), o));
  A('bars-galvanized', '防犯柵 亜鉛めっき 2.4m', (b, f) => barsFence(b, f, L, S('fence-bars-galvanized'), ZINC, { signs: [S('sign-cctv')] }));
  A('bars-black', '防犯柵 黒 2.4m', (b, f) => barsFence(b, f, L, S('fence-bars-black'), BLACK));
  A('bars-razor', '防犯柵 かみそり鉄線つき', (b, f) => barsFence(b, f, L, S('fence-bars-galvanized'), RUSTY, { razor: true, signs: [S('sign-keep-out'), S('sign-danger-voltage')] }));
  A('weld-green', '溶接金網フェンス 緑 1.8m', (b, f) => weldFence(b, f, L, S('mesh-weld-green'), 'structure/steel-green'));
  A('weld-black', '溶接金網フェンス 黒 2.4m', (b, f) => weldFence(b, f, L, S('mesh-weld-black'), BLACK, { h: 2.4, signs: [S('sign-private')] }));
  A('weld-galvanized-barbed', '溶接金網フェンス 有刺鉄線つき', (b, f) => weldFence(b, f, L, S('mesh-weld-galvanized'), ZINC, { h: 2.1, barbed: true }));
  A('weld-low', '溶接金網フェンス 低い(1.2m)', (b, f) => weldFence(b, f, L, S('mesh-weld-green'), 'structure/steel-green', { h: 1.2 }));

  // Chain link.
  const CHAIN: [string, string, ChainOpts][] = [
    ['1200', '金網フェンス 1.2m', { h: 1.2 }],
    ['1800', '金網フェンス 1.8m', {}],
    ['2400', '金網フェンス 2.4m 警告板', { h: 2.4, signs: [S('sign-private')] }],
    ['rusty', '金網フェンス さび', { mat: RUSTY, topRail: false, signs: [S('sign-keep-out')] }],
    ['black', '金網フェンス 黒塗装', { mat: BLACK, h: 1.5 }],
    ['green', '金網フェンス 緑塗装(公園)', { mat: 'structure/steel-green', h: 1.5 }],
    ['barbed', '金網フェンス 有刺鉄線', { h: 2.1, barbed: 1, signs: [S('sign-cctv')] }],
    ['barbed-v', '金網フェンス 有刺鉄線 V字', { h: 2.4, barbed: 2, mat: RUSTY }],
    ['razor', '金網フェンス かみそり鉄線', { h: 2.4, razor: true, signs: [S('sign-danger-voltage'), S('sign-keep-out')] }],
    ['slats-green', '金網フェンス 目隠しスラット 緑', { slats: S('chainlink-slats-green') }],
    ['slats-brown', '金網フェンス 目隠しスラット 茶', { slats: S('chainlink-slats-brown'), h: 2.1 }],
    ['slats-white', '金網フェンス 目隠しスラット 白', { slats: S('chainlink-slats-white'), mat: 'structure/steel-white' }],
    ['slats-grey-barbed', '金網フェンス スラット 灰 有刺鉄線', { slats: S('chainlink-slats-grey'), h: 2.4, barbed: 1 }],
    ['screen-green', '金網フェンス 防風ネット 緑', { screen: S('screen-green'), h: 2.4 }],
    ['screen-black', '金網フェンス 防風ネット 黒', { screen: S('screen-black'), h: 1.8, mat: BLACK }],
    ['screen-tan', '金網フェンス 防風ネット ベージュ(工事)', { screen: S('screen-tan'), h: 1.8, signs: [S('sign-construction')] }],
    ['screen-blue', '金網フェンス ブルーシート', { screen: S('tarp-blue'), h: 1.8, mat: RUSTY }],
    ['sports-3600', '金網フェンス 運動場 3.6m', { h: 3.6, mat: 'structure/steel-green' }],
    ['sports-5000', '金網フェンス 運動場 5m 防風ネット', { h: 5, gap: 4, screen: S('screen-green') }],
  ];
  for (const [id, label, o] of CHAIN) A(`chainlink-${id}`, label, (b, f) => chainlink(b, f, L, o));

  // Construction.
  A('hoarding-plywood', '仮囲い 合板', (b, f) => hoarding(b, f, L, S('hoarding-plywood'), { signs: [S('sign-construction')] }));
  A('hoarding-blue', '仮囲い 青 貼り紙禁止', (b, f) => hoarding(b, f, L, S('hoarding-blue'), { strip: true }));
  A('hoarding-green', '仮囲い 緑 工事看板つき', (b, f) => hoarding(b, f, L, S('hoarding-green'), { strip: true, signs: [S('sign-construction'), S('sign-cctv')] }));
  A('hoarding-shed', '仮囲い 歩道の防護屋根', (b, f) => {
    hoarding(b, move(f, 0, 0, -2.1), L, S('hoarding-green'), { strip: true });
    for (const x of spaced(L, 3)) {
      for (const z of [-1.9, 0]) roundPost(b, ZINC, f, x, 2.7, 0.03, z);
      b.tube(ZINC, at(f, x, 2.62, -1.9), at(f, x, 2.62, 0), 0.03, 6);
      b.tube(ZINC, at(f, x, 0.3, -1.9), at(f, x, 0.3, 0), 0.024, 6);
    }
    for (const x of spaced(L, 3).slice(0, -1)) {
      b.tube(ZINC, at(f, x, 0.35, 0), at(f, x + 3, 2.55, 0), 0.02, 6);
      b.tube(ZINC, at(f, x + 3, 0.35, 0), at(f, x, 2.55, 0), 0.02, 6);
    }
    box(b, 'wall/plywood-tan', f, [L / 2, 2.72, -0.95], [L / 2 + 0.1, 0.03, 1.25]);
    for (const z of [0.28, -2.18]) {
      const g = move(f, 0, 2.75, z);
      b.quad(S('hoarding-green'), at(g, 0, 0, 0.012), at(g, L, 0, 0.012), at(g, L, 1.2, 0.012), at(g, 0, 1.2, 0.012), [[0, 1.2], [L, 1.2], [L, 2.4], [0, 2.4]]);
      b.quad('wall/plywood-tan', at(g, L, 0, 0), at(g, 0, 0, 0), at(g, 0, 1.2, 0), at(g, L, 1.2, 0), [[0, 0], [L, 0], [L, 1.2], [0, 1.2]]);
    }
    plate(b, S('sign-construction'), f, [L / 2, 3.35, 0.3]);
  });
  A('temp-panels', '仮設フェンス', (b, f) => tempFence(b, move(f, 0.75, 0, 0), L));
  A('temp-panels-screen', '仮設フェンス 目隠しネット', (b, f) => tempFence(b, move(f, 0.75, 0, 0), L, { screen: S('screen-green'), signs: ['', S('sign-construction')] }));
  A('temp-panels-askew', '仮設フェンス ずれて隙間あり', (b, f) => tempFence(b, move(f, 0.75, 0, 0), L, { askew: 16, mat: RUSTY, signs: [S('sign-keep-out')] }));
  A('temp-panels-event', '仮設フェンス 低いパネル(イベント)', (b, f) => {
    for (let i = 0; i < 5; i++) {
      const g = move(f, i * 2.4 + 0.05, 0, 0);
      pipe(b, ZINC, [at(g, 0, 0.05, 0), at(g, 0, 1.1, 0), at(g, 2.3, 1.1, 0), at(g, 2.3, 0.05, 0)], 0.019, 6);
      b.tube(ZINC, at(g, 0, 0.2, 0), at(g, 2.3, 0.2, 0), 0.016, 6);
      for (let x = 0.14; x < 2.25; x += 0.115) b.tube(ZINC, at(g, x, 0.2, 0), at(g, x, 1.1, 0), 0.007, 4);
      for (const x of [0.25, 2.05]) box(b, ZINC, g, [x, 0.02, 0], [0.025, 0.02, 0.28]);
    }
  });

  // Walls.
  const WALLS: [string, string, string, WallOpts][] = [
    ['brick-red', 'レンガ塀 赤', 'wall/brick-red', { pier: 'wall/brick-red' }],
    ['brick-brown-low', 'レンガ塀 茶 低い', 'wall/brick-brown', { h: 0.9, t: 0.24 }],
    ['brick-painted', 'レンガ塀 白塗装', 'wall/brick-painted-white-peeling', { h: 1.5 }],
    ['brick-sooty-razor', 'レンガ塀 すす汚れ かみそり鉄線', 'wall/brick-red-sooty', { h: 2.4, razor: true, signs: [S('sign-keep-out')] }],
    ['brick-iron-top', 'レンガ塀 上に鉄柵', 'wall/brick-buff', { h: 1.0, pier: 'wall/brick-buff', top: S('fence-iron-flat'), t: 0.24 }],
    ['block-grey', 'ブロック塀 灰', 'wall/block-grey', { cap: OLDCONC }],
    ['block-split', 'ブロック塀 割り肌 門柱つき', 'wall/block-split', { pier: 'wall/block-split', gap: 4 }],
    ['block-white', 'ブロック塀 白塗装', 'wall/block-white', { h: 1.5, cap: 'trim/paint-white-old' }],
    ['block-beige-tall', 'ブロック塀 ベージュ 高い(工場)', 'wall/block-beige', { h: 3, signs: [S('sign-private'), S('sign-cctv')] }],
    ['stucco-white-tile', 'スタッコ塀 白 瓦の笠木', 'wall/stucco-white-stained', { ridge: 'roof/clay-terracotta', t: 0.3 }],
    ['stucco-sand-tile', 'スタッコ塀 砂色 瓦の笠木と門柱', 'wall/stucco-sand-old', { ridge: 'roof/clay-terracotta', t: 0.3, h: 1.5, pier: 'wall/stucco-sand-old', gap: 4 }],
    ['stucco-peach', 'スタッコ塀 ピーチ', 'wall/stucco-peach', { h: 1.6, t: 0.25, cap: 'wall/stucco-peach' }],
    ['stucco-grey', 'スタッコ塀 灰 補修跡', 'wall/stucco-grey-patched', { h: 2, t: 0.22 }],
    ['concrete', 'コンクリート塀', CONC, { h: 2, cap: null, t: 0.25 }],
    ['concrete-old', 'コンクリート塀 古い 有刺鉄線', OLDCONC, { h: 2.2, cap: null, t: 0.25, razor: true }],
    ['fieldstone', '自然石の塀', S('wall-fieldstone'), { h: 1.2, t: 0.4 }],
    ['ashlar', '切石の塀 砂岩', S('wall-ashlar-tan'), { h: 1.5, t: 0.4, pier: S('wall-ashlar-tan'), gap: 4 }],
    ['flagstone', '板石積みの塀', S('wall-flagstone'), { h: 1.0, t: 0.45, cap: S('wall-flagstone') }],
    ['cobble', '玉石積みの塀', S('wall-cobble'), { h: 0.9, t: 0.5, cap: OLDCONC }],
    ['limestone-iron-top', '石塀 上に鉄柵', 'wall/stone-limestone-sooty', { h: 1.2, t: 0.4, top: S('fence-iron-spear'), pier: 'wall/stone-limestone-sooty', gap: 3.6 }],
  ];
  for (const [id, label, tex, o] of WALLS) A(`wall-${id}`, label, (b, f) => masonry(b, f, L, tex, o));
  A('wall-drystone', '空積みの石垣', (b, f) => dryStone(b, f, L, S('wall-rubble')));
  A('wall-drystone-mossy', '空積みの石垣 苔', (b, f) => dryStone(b, f, L, S('wall-rubble-mossy'), 0.9, S('wall-rubble-mossy')));
  A('wall-precast', 'コンクリート板塀', (b, f) => panelWall(b, f, L, OLDCONC));
  A('wall-precast-timber', 'コンクリート柱と枕木の塀', (b, f) => panelWall(b, f, L, S('timber-crib'), { h: 1.5, rows: 5 }));

  // Retaining walls.
  const RET: [string, string, string, RetainOpts][] = [
    ['concrete', '擁壁 コンクリート 3m', 'retaining-concrete', { h: 3, cap: null }],
    ['concrete-stained', '擁壁 コンクリート 雨だれ', 'retaining-concrete-stained', { h: 2.4, cap: null, ground: 'ground/grass-dry' }],
    ['concrete-stepped', '擁壁 コンクリート 段々に下がる', 'retaining-concrete', { h: 3, cap: null, steps: [1, 0.72, 0.45, 0.2] }],
    ['shotcrete', '擁壁 吹付けコンクリート', 'retaining-shotcrete', { h: 3, batter: 0.28, cap: null, ground: 'ground/grass-dry' }],
    ['segmental-tan', '擁壁 化粧ブロック ベージュ', 'wall-segmental-tan', { h: 1.2, batter: 0.1 }],
    ['segmental-grey', '擁壁 化粧ブロック 灰 2.4m', 'wall-segmental-grey', { h: 2.4, batter: 0.12 }],
    ['segmental-red-stepped', '擁壁 化粧ブロック 赤 段々', 'wall-segmental-red', { h: 1.8, batter: 0.1, steps: [1, 0.67, 0.33] }],
    ['timber-crib', '擁壁 木製', 'timber-crib', { h: 1.5, cap: null, batter: 0.05 }],
    ['timber-log', '擁壁 丸太', 'timber-log', { h: 1.2, cap: null }],
    ['rubble', '擁壁 石積み', 'wall-rubble', { h: 2, batter: 0.2, cap: null }],
    ['rubble-mossy', '擁壁 石積み 苔', 'wall-rubble-mossy', { h: 1.4, batter: 0.15, cap: null, ground: 'ground/grass-lush' }],
    ['fieldstone', '擁壁 自然石', 'wall-fieldstone', { h: 1.2 }],
    ['ashlar', '擁壁 切石', 'wall-ashlar-tan', { h: 2.4, batter: 0.06 }],
    ['cobble', '擁壁 玉石', 'wall-cobble', { h: 1, batter: 0.1, cap: OLDCONC }],
  ];
  for (const [id, label, tex, o] of RET) A(`retaining-${id}`, label, (b, f) => retaining(b, f, L, S(tex), o));
  A('retaining-soldier-pile', '擁壁 親杭横矢板', (b, f) => {
    retaining(b, f, L, S('timber-crib'), { h: 2.8, cap: null, ground: 'ground/dirt' });
    for (const x of spaced(L, 2.4)) {
      box(b, 'structure/steel-corten', f, [x, 1.5, 0.06], [0.1, 1.5, 0.008]);
      box(b, 'structure/steel-corten', f, [x, 1.5, -0.03], [0.008, 1.5, 0.09]);
    }
  });
  A('retaining-anchored', '擁壁 吹付け アンカー付き', (b, f) => {
    retaining(b, f, L, S('retaining-shotcrete'), { h: 3.6, batter: 0.2, cap: null, ground: 'ground/grass-dry' });
    for (let x = 1.5; x < L; x += 3) for (const y of [1, 2.4]) {
      const g = tilt(move(f, x, y, -0.2 * y), -11.3);
      box(b, CONC, g, [0, 0, 0.04], [0.3, 0.3, 0.05]);
      box(b, RUSTY, g, [0, 0, 0.1], [0.1, 0.1, 0.012]);
      b.tube(RUSTY, at(g, 0, 0, 0.11), at(g, 0, 0, 0.2), 0.03, 6, 0.03, true);
    }
  });
  A('retaining-terraced', '擁壁 二段 植栽帯つき', (b, f) => {
    retaining(b, f, L, S('wall-segmental-tan'), { h: 1.2, batter: 0.1, depth: 1.5, ground: 'ground/mulch' });
    retaining(b, move(f, 0, 1.2, -1.5), L, S('wall-segmental-tan'), { h: 1.2, batter: 0.1, ground: 'ground/grass-mown' });
  });
  A('retaining-with-fence', '擁壁 上に金網フェンス', (b, f) => {
    retaining(b, f, L, S('retaining-concrete-stained'), { h: 2.4, cap: null });
    chainlink(b, move(f, 0, 2.4, -0.12), L, { h: 1.2 });
  });
  A('retaining-with-rail', '擁壁 切石 上に手すり', (b, f) => {
    retaining(b, f, L, S('wall-ashlar-tan'), { h: 1.8, ground: 'concrete/walk-square' });
    pedRail(b, move(f, 0, 1.86, -0.14), L, 'trim/rail-black', BLACK);
  });
  A('gabion-1', 'じゃかご 1段 花崗岩', (b, f) => gabions(b, f, L, S('gabion-granite'), 1));
  A('gabion-2', 'じゃかご 2段 砂岩', (b, f) => gabions(b, f, L, S('gabion-sandstone'), 2));
  A('gabion-3', 'じゃかご 3段 暗色', (b, f) => gabions(b, f, L, S('gabion-dark'), 3));

  // Noise barriers.
  const NOISE: [string, string, string, NoiseOpts][] = [
    ['fluted', '遮音壁 コンクリート 3m', 'noise-fluted', {}],
    ['fluted-tan', '遮音壁 コンクリート ベージュ 4.5m', 'noise-fluted-tan', { h: 4.5, post: OLDCONC }],
    ['absorptive', '遮音壁 吸音パネル', 'noise-absorptive', { h: 3 }],
    ['absorptive-green', '遮音壁 吸音パネル 緑 透明板つき', 'noise-absorptive-green', { h: 2, glass: 1.5, post: 'structure/steel-green' }],
    ['absorptive-crank', '遮音壁 吸音パネル 上部が張り出す', 'noise-absorptive', { h: 3, crank: 1.4 }],
    ['fluted-jersey', '遮音壁 防護柵の上', 'noise-fluted', { h: 2.4, jersey: true }],
    ['glass-jersey', '遮音壁 透明板 防護柵の上(橋)', 'noise-absorptive', { h: 0.5, glass: 2, jersey: true, gap: 2 }],
    ['fluted-brick-back', '遮音壁 住宅側がレンガ模様', 'noise-fluted-tan', { h: 3.6, back: 'wall/brick-brown', post: OLDCONC }],
  ];
  for (const [id, label, tex, o] of NOISE) A(`noise-${id}`, label, (b, f) => noiseWall(b, f, L, S(tex), o));

  // Guardrails.
  const GUARD: [string, string, GuardOpts][] = [
    ['w-steel', 'ガードレール 鋼製支柱', {}],
    ['w-wood', 'ガードレール 木製支柱', { post: 'wood' }],
    ['w-rusty', 'ガードレール さび', { mat: RUSTY, post: 'wood', postMat: WOOD }],
    ['w-corten', 'ガードレール 耐候性鋼', { mat: 'structure/steel-corten', post: 'wood', postMat: WOOD }],
    ['w-white', 'ガードレール 白塗装', { mat: 'structure/steel-white' }],
    ['w-down-ends', 'ガードレール 端部を地中に下げる', { ends: ['down', 'down'] }],
    ['w-flare-head', 'ガードレール 端部フレアと衝撃吸収ヘッド', { ends: ['head', 'flare'], post: 'wood' }],
    ['w-nose', 'ガードレール 丸い端部', { ends: ['nose', 'nose'], gap: 2 }],
    ['w-median', 'ガードレール 両面(中央分離帯)', { double: true, ends: ['nose', 'none'] }],
    ['w-damaged', 'ガードレール 衝突で変形', { dent: 0.5, post: 'wood', mat: RUSTY }],
    ['w-rub', 'ガードレール 下段レールつき', { rub: true }],
    ['thrie', 'ガードレール 3山', { thrie: true }],
    ['thrie-median', 'ガードレール 3山 両面', { thrie: true, double: true, post: 'wood' }],
  ];
  for (const [id, label, o] of GUARD) A(`guardrail-${id}`, label, (b, f) => guardrail(b, along(f), L, o));
  A('guardrail-curve', 'ガードレール カーブ R25', (b, f) => guardrail(b, bendRun(move(f, 0, 0, -0.7), 25), L, {}));
  A('guardrail-curve-tight', 'ガードレール 急カーブ R10 反射板', (b, f) => {
    const run = bendRun(move(f, 1, 0, 2.5), -10);
    guardrail(b, run, L, { post: 'wood', gap: 1.3 });
    for (let s = 1; s < L; s += 2.5) {
      const g = run.at(s);
      sqPost(b, ZINC, g, 0, 1.5, 0.02, -0.5);
      plate(b, S('stripes-yellow-black'), g, [0, 1.25, -0.47], { size: [0.3, 0.45] });
    }
  });
  A('guardrail-box-beam', 'ガードレール 角形鋼管', (b, f) => {
    for (const x of spaced(L, 1.8)) box(b, 'structure/steel-corten', f, [x, 0.3, -0.1], [0.04, 0.3, 0.03], 'Y');
    box(b, 'structure/steel-corten', f, [L / 2, 0.61, 0], [L / 2 + 0.2, 0.075, 0.075]);
  });
  A('guardrail-timber', 'ガードレール 木製(公園道路)', (b, f) => {
    for (const x of spaced(L, 2.4)) box(b, WOOD, f, [x, 0.36, -0.2], [0.1, 0.36, 0.125], 'Y');
    box(b, WOOD, f, [L / 2, 0.5, 0], [L / 2 + 0.15, 0.125, 0.075]);
    box(b, RUSTY, f, [L / 2, 0.5, -0.079], [L / 2 + 0.15, 0.1, 0.004]);
  });
  A('guardrail-pipe', 'ガードパイプ 白', (b, f) => tubeRail(b, f, L, 'structure/steel-white', [0.8, 0.55, 0.3], { r: 0.03 }));
  A('cable-barrier', 'ワイヤロープ防護柵 4本', (b, f) => cableBarrier(b, f, L));
  A('cable-barrier-3', 'ワイヤロープ防護柵 3本 さび', (b, f) => cableBarrier(b, f, L, { ropes: 3, mat: RUSTY, anchors: false }));

  // Concrete and plastic barriers.
  A('barrier-jersey', 'コンクリート防護柵 ジャージー型', (b, f) => concreteBarrier(b, along(f), L));
  A('barrier-jersey-dirty', 'コンクリート防護柵 汚れ', (b, f) => concreteBarrier(b, along(f), L, { tex: 'structure/barrier-dirty' }));
  A('barrier-f-shape', 'コンクリート防護柵 F型', (b, f) => concreteBarrier(b, along(f), L, { prof: F_SHAPE }));
  A('barrier-single-slope', 'コンクリート防護柵 単スロープ 高い', (b, f) => concreteBarrier(b, along(f), L, { prof: SLOPE }));
  A('barrier-tall', 'コンクリート防護柵 背の高い中央分離帯', (b, f) => concreteBarrier(b, along(f), L, { prof: TALL, tex: 'structure/barrier-dirty' }));
  A('barrier-half', 'コンクリート防護柵 片面(橋の端)', (b, f) => concreteBarrier(b, along(f), L, { prof: HALF }));
  A('barrier-precast', 'コンクリート防護柵 仮設ユニット 3m', (b, f) => concreteBarrier(b, along(f), L, { unit: 3, tex: 'structure/barrier-dirty' }));
  A('barrier-precast-short', 'コンクリート防護柵 仮設ユニット 2m', (b, f) => concreteBarrier(b, along(f), L, { unit: 2 }));
  A('barrier-taper', 'コンクリート防護柵 端部のすりつけ', (b, f) => concreteBarrier(b, along(f), L, { taper: true }));
  A('barrier-curve', 'コンクリート防護柵 カーブ R20', (b, f) => concreteBarrier(b, bendRun(move(f, 0, 0, -0.9), 20), L));
  A('barrier-fence', 'コンクリート防護柵 上に金網', (b, f) => {
    concreteBarrier(b, along(f), L, { tex: 'structure/barrier-dirty' });
    chainlink(b, move(f, 0, 0.81, 0), L, { h: 1.8, gap: 2.4 });
  });
  A('barrier-glare', 'コンクリート防護柵 眩光防止板', (b, f) => {
    concreteBarrier(b, along(f), L);
    for (let x = 0.3; x < L; x += 0.6) box(b, 'structure/steel-green', turn(move(f, x, 0.81, 0), 22), [0, 0.3, 0], [0.11, 0.3, 0.008]);
  });
  A('barrier-water-orange', '樹脂製バリア 橙と白', (b, f) => waterBarriers(b, f, L, [S('plastic-orange'), 'trim/paint-white-old']));
  A('barrier-water-red', '樹脂製バリア 赤 ずれあり', (b, f) => waterBarriers(b, f, L, [S('plastic-red'), S('plastic-red'), 'trim/paint-white-old'], { skew: true }));
  A('barrier-water-yellow', '樹脂製バリア 黄', (b, f) => waterBarriers(b, f, L, [S('plastic-yellow')]));
  A('crash-barrels', '衝撃緩衝用の砂樽', (b) => {
    const rows = [1, 1, 2, 2, 3, 3];
    rows.forEach((n, i) => {
      for (let k = 0; k < n; k++) {
        const g = stand([-3 + i * 1.0, 0, (k - (n - 1) / 2) * 0.95]);
        lathe(b, S('plastic-yellow'), g, [[0.42, 0], [0.45, 0.1], [0.45, 0.85], [0.42, 0.9]], 14);
        lathe(b, 'trim/paint-charcoal', g, [[0.44, 0.9], [0.44, 0.95], [0, 0.98]], 14);
      }
    });
    concreteBarrier(b, along(stand([3.2, 0, 0])), 3);
    plate(b, S('stripes-yellow-black'), turn(stand([-3.55, 0.5, 0]), 90), [0, 0, 0], { size: [0.6, 0.6] });
  });

  // Light barriers.
  A('bollard-chain', '車止めと鎖', (b, f) => postAndChain(b, f, L, { post: BLACK, link: BLACK }));
  A('bollard-chain-double', '車止めと鎖 2段(広場)', (b, f) => postAndChain(b, f, L, { post: S('bronze-dark'), link: S('bronze-dark'), rows: 2, h: 1.0, gap: 2.4 }));
  A('post-rope', '木杭とロープ', (b, f) => postAndChain(b, f, L, { post: WOOD, link: S('rope'), h: 1.0, r: 0.07, lr: 0.02, gap: 2.4, sag: 0.25, cap: false }));
  A('post-rope-blue', '木杭と青ロープ 2段(桟橋)', (b, f) => postAndChain(b, f, L, { post: GREYWOOD, link: S('rope-blue'), h: 1.1, r: 0.08, lr: 0.016, gap: 3, sag: 0.2, rows: 2, cap: false }));
  A('knee-rail', '木製ニーレール', (b, f) => kneeRail(b, f, L, WOOD));
  A('knee-rail-diamond', '木製ニーレール 菱形', (b, f) => kneeRail(b, f, L, GREYWOOD, { diamond: true, h: 0.45 }));
  A('knee-rail-double', '木製 2段レール', (b, f) => kneeRail(b, f, L, 'trim/paint-brown-old', { rails: 2, h: 0.9 }));
  const PED: [string, string, string, string][] = [['black', '黒', 'trim/rail-black', BLACK], ['green', '緑', 'trim/rail-green', 'structure/steel-green'], ['white', '白', 'trim/rail-white', 'structure/steel-white'], ['ornate', '装飾', 'trim/rail-ornate', BLACK], ['cable', 'ワイヤー', 'trim/rail-cable', ZINC]];
  for (const [id, label, tex, post] of PED) A(`ped-rail-${id}`, `歩行者用防護柵 ${label}`, (b, f) => pedRail(b, f, L, tex, post));
  A('tube-rail-2', 'パイプ柵 2段 亜鉛めっき', (b, f) => tubeRail(b, f, L, ZINC, [1.05, 0.55], { ends: true }));
  A('tube-rail-3', 'パイプ柵 3段 黄', (b, f) => tubeRail(b, f, L, 'structure/steel-yellow', [1.1, 0.75, 0.4], { gap: 1.5 }));
  A('tube-rail-low', 'パイプ柵 低い 緑(植栽帯)', (b, f) => tubeRail(b, f, L, 'structure/steel-green', [0.45], { ends: true, gap: 1.5, r: 0.02 }));
  A('delineators', '視線誘導ポール', (b, f) => {
    box(b, 'trim/paint-charcoal', f, [L / 2, 0.03, 0], [L / 2, 0.03, 0.12]);
    for (let x = 0.5; x < L; x += 1) {
      const g = tilt(move(f, x, 0.06, 0), ((x * 7) % 3 === 0 ? 14 : 0));
      lathe(b, S('plastic-orange'), g, [[0.04, 0], [0.04, 0.8], [0, 0.8]], 8);
      lathe(b, 'furniture/bollard-reflector', g, [[0.042, 0.55], [0.042, 0.72]], 8);
    }
  });
  A('sand-fence', '砂よけの木柵(砂浜)', (b, f) => {
    for (const x of spaced(L, 3)) roundPost(b, GREYWOOD, tilt(move(f, x, 0, -0.04), ((x * 5) % 7) - 3), 0, 1.35, 0.035);
    panel(b, S('fence-picket-grey'), tilt(f, -5), 0, L, 0.05, 1.15);
    extrude(b, S('sand-dry'), along(f), 0, L, [[1.2, 0], [0.1, 0.22], [-0.9, 0]]);
  });

  // Gates.
  A('gate-iron-double', '門 鉄の両開き レンガ門柱', (b, f) => {
    for (const [x0, x1] of [[0, 3.6], [8.4, 12]]) ironFence(b, move(f, x0, 0, 0), x1 - x0, S('fence-iron-spear'), { pier: 'wall/brick-red', gap: 3.6 });
    leaf(b, turn(move(f, 3.85, 0, 0), -28), 2.1, 1.5, S('fence-iron-spear'), BLACK);
    leaf(b, turn(move(f, 8.15, 0, 0), 180 + 62), 2.1, 1.5, S('fence-iron-spear'), BLACK);
  });
  A('gate-iron-closed', '門 鉄の両開き 閉 私有地', (b, f) => {
    for (const [x0, x1] of [[0, 3.6], [8.4, 12]]) ironFence(b, move(f, x0, 0, 0), x1 - x0, S('fence-iron-flat'), { pier: 'wall/stone-limestone', gap: 3.6, base: 'wall/stone-limestone' });
    leaf(b, move(f, 3.85, 0, 0), 2.14, 1.75, S('fence-iron-spear'), BLACK);
    leaf(b, turn(move(f, 8.15, 0, 0), 180), 2.14, 1.75, S('fence-iron-spear'), BLACK);
    plate(b, S('sign-private'), f, [4.9, 1.2, 0.03]);
    box(b, 'furniture/coat-stainless', f, [3.2, 1.2, 0.5], [0.09, 0.14, 0.05]);
    sqPost(b, BLACK, f, 3.2, 1.1, 0.03, 0.46);
  });
  A('gate-iron-ped', '門 鉄の片開き(歩行者)', (b, f) => {
    ironFence(b, f, 5.4, S('fence-iron-hoop'), { gap: 2.7 });
    ironFence(b, move(f, 6.6, 0, 0), 5.4, S('fence-iron-hoop'), { gap: 2.7 });
    leaf(b, turn(move(f, 5.45, 0, 0), -40), 1.1, 1.05, S('fence-iron-hoop'), BLACK, { y0: 0.06 });
  });
  A('gate-chainlink-swing', '門 金網 両開き 鎖で施錠', (b, f) => {
    chainlink(b, f, 3, { h: 2.1, signs: [S('sign-private')] });
    chainlink(b, move(f, 9, 0, 0), 3, { h: 2.1 });
    for (const x of [3, 9]) roundPost(b, ZINC, f, x, 2.3, 0.05);
    leaf(b, move(f, 3.06, 0, 0), 2.92, 1.95, 'trim/chainlink', ZINC, { tile: true, brace: true });
    leaf(b, turn(move(f, 8.94, 0, 0), 180), 2.92, 1.95, 'trim/chainlink', ZINC, { tile: true, brace: true });
    pipe(b, RUSTY, catenary(at(f, 5.9, 1.15, 0.03), at(f, 6.1, 1.15, 0.03), 0.22, 6), 0.012, 5, false);
    plate(b, S('sign-no-parking-gate'), f, [7.4, 1.4, 0.03]);
  });
  A('gate-chainlink-open', '門 金網 両開き 開', (b, f) => {
    chainlink(b, f, 3, { h: 2.1, barbed: 1 });
    chainlink(b, move(f, 9, 0, 0), 3, { h: 2.1, barbed: 1 });
    for (const x of [3, 9]) roundPost(b, ZINC, f, x, 2.3, 0.05);
    leaf(b, turn(move(f, 3.06, 0, 0), 95), 2.92, 1.95, 'trim/chainlink', ZINC, { tile: true, brace: true });
    leaf(b, turn(move(f, 8.94, 0, 0), 180 - 80), 2.92, 1.95, 'trim/chainlink', ZINC, { tile: true, brace: true });
  });
  A('gate-chainlink-sliding', '門 金網 引き戸(工場)', (b, f) => {
    chainlink(b, f, 3, { h: 2.4, barbed: 1, signs: [S('sign-cctv')] });
    chainlink(b, move(f, 9, 0, 0), 3, { h: 2.4, barbed: 1 });
    for (const x of [3, 9, 11.2]) for (const z of [-0.1, -0.3]) roundPost(b, ZINC, f, x, 2.6, 0.045, z);
    const g = move(f, 5.2, 0.1, -0.2);
    leaf(b, g, 6.6, 2.1, 'trim/chainlink', ZINC, { tile: true, y0: 0.05, r: 0.03 });
    for (const x of [2.2, 4.4]) b.tube(ZINC, at(g, x, 0.05, 0), at(g, x, 2.15, 0), 0.024, 6);
    b.tube(ZINC, at(g, 0, 0.05, 0), at(g, 2.2, 2.15, 0), 0.02, 6);
    box(b, RUSTY, f, [7.2, 0.03, -0.2], [4.4, 0.03, 0.04]);
    for (const x of [5.6, 11.3]) lathe(b, 'trim/paint-charcoal', roll(turn(move(f, x, 0.11, -0.2), 0), 0), [[0.05, -0.02], [0.05, 0.02]], 10);
    plate(b, S('sign-no-parking-gate'), g, [1.2, 1.5, 0.04]);
  });
  A('gate-farm', '門 牧場のパイプゲート', (b, f) => {
    ranchFence(b, f, 4.2, S('fence-ranch-brown'), 'trim/paint-brown-old');
    ranchFence(b, move(f, 7.8, 0, 0), 4.2, S('fence-ranch-brown'), 'trim/paint-brown-old');
    for (const x of [4.2, 7.8]) roundPost(b, WOOD, f, x, 1.6, 0.1);
    const g = turn(move(f, 4.32, 0, 0), -18);
    for (let i = 0; i < 5; i++) b.tube(ZINC, at(g, 0, 0.2 + i * 0.25, 0), at(g, 3.4, 0.2 + i * 0.25, 0), 0.02, 6, 0.02, true);
    for (const x of [0, 1.7, 3.4]) b.tube(ZINC, at(g, x, 0.2, 0), at(g, x, 1.2, 0), 0.022, 6, 0.022, true);
    b.tube(ZINC, at(g, 0, 0.2, 0), at(g, 1.7, 1.2, 0), 0.016, 6);
    b.tube(ZINC, at(g, 3.4, 0.2, 0), at(g, 1.7, 1.2, 0), 0.016, 6);
    plate(b, S('sign-private'), g, [1.7, 0.85, 0.03]);
  });
  A('gate-picket-arbor', '門 ピケットフェンスとアーチ', (b, f) => {
    picketFence(b, f, 5.4, S('fence-picket-white'), 'trim/paint-white', { gap: 2.7 });
    picketFence(b, move(f, 6.6, 0, 0), 5.4, S('fence-picket-white'), 'trim/paint-white', { gap: 2.7 });
    for (const x of [5.4, 6.6]) for (const z of [-0.3, 0.3]) sqPost(b, 'trim/paint-white', f, x, 2.1, 0.045, z);
    for (const z of [-0.3, 0.3]) {
      const pts: V3[] = [];
      for (let a = 0; a <= 180; a += 15) pts.push(at(f, 6 - 0.6 * Math.cos((a * Math.PI) / 180), 2.1 + 0.45 * Math.sin((a * Math.PI) / 180), z));
      pipe(b, 'trim/paint-white', pts, 0.035, 6);
    }
    for (let a = 15; a < 180; a += 25) b.tube('trim/paint-white', at(f, 6 - 0.6 * Math.cos((a * Math.PI) / 180), 2.1 + 0.45 * Math.sin((a * Math.PI) / 180), -0.36), at(f, 6 - 0.6 * Math.cos((a * Math.PI) / 180), 2.1 + 0.45 * Math.sin((a * Math.PI) / 180), 0.36), 0.018, 5, 0.018, true);
    for (const x of [5.4, 6.6]) mesh(b, 'trim/lattice-white', turn(move(f, x, 0, 0.3), 90), 0, 0.6, 0.1, 1.9);
    panel(b, S('fence-picket-white'), turn(move(f, 5.47, 0.05, 0.03), -50), 0, 1.06, 0, 1);
  });
  A('gate-board', '門 板塀の片開き戸', (b, f) => {
    boardFence(b, f, 4.8, S('fence-board-cedar'), { gap: 2.4 });
    boardFence(b, move(f, 5.9, 0, 0), 6.1, S('fence-board-cedar'), { gap: 2.03 });
    const g = turn(move(f, 4.84, 0.05, 0), -22);
    panel(b, S('fence-board-cedar'), g, 0, 1.02, 0, 1.8);
    for (const y of [0.3, 1.5]) box(b, WOOD, g, [0.51, y, -0.021], [0.5, 0.045, 0.019]);
    b.beam(WOOD, at(g, 0.05, 0.34, -0.021), at(g, 0.97, 1.46, -0.021), 0.038, 0.09, g.z);
    box(b, BLACK, g, [0.95, 1.0, 0.02], [0.05, 0.03, 0.015]);
  });
  A('gate-hoarding', '門 仮囲いの出入口', (b, f) => {
    hoarding(b, f, 3.66, S('hoarding-blue'), { strip: true });
    hoarding(b, move(f, 8.54, 0, 0), 3.46, S('hoarding-blue'), { signs: [S('sign-construction')] });
    for (const [x, a] of [[3.7, 75], [8.5, 180 - 60]] as const) {
      const g = turn(move(f, x, 0.08, 0), a);
      b.quad(S('hoarding-blue'), at(g, 0, 0, 0.02), at(g, 2.4, 0, 0.02), at(g, 2.4, 2.3, 0.02), at(g, 0, 2.3, 0.02), [[0, 0], [2.4, 0], [2.4, 2.3], [0, 2.3]]);
      b.quad('wall/plywood-tan', at(g, 2.4, 0, -0.02), at(g, 0, 0, -0.02), at(g, 0, 2.3, -0.02), at(g, 2.4, 2.3, -0.02), [[0, 0], [2.4, 0], [2.4, 2.3], [0, 2.3]]);
      pipe(b, RUSTY, [at(g, 0, 0, 0), at(g, 0, 2.3, 0), at(g, 2.4, 2.3, 0), at(g, 2.4, 0, 0), at(g, 0, 0, 0)], 0.024, 6);
    }
    for (const x of [3.68, 8.52]) sqPost(b, RUSTY, f, x, 2.6, 0.05);
  });
  A('gate-boom-down', '遮断バー 下', (b, f) => boom(b, move(f, 3.5, 0, 0), 4.2, 0));
  A('gate-boom-up', '遮断バー 上', (b, f) => boom(b, move(f, 3.5, 0, 0), 4.2, 82, { cab: 'structure/steel-white' }));
  A('gate-boom-pair', '遮断バー 入口と出口 料金機つき', (b, f) => {
    box(b, 'concrete/walk-plain', f, [6, 0.08, 0], [0.7, 0.08, 2.2]);
    box(b, 'structure/steel-yellow', f, [6, 0.2, 2.2], [0.72, 0.2, 0.06]);
    boom(b, turn(move(f, 6.3, 0.16, 1.2), 0), 3.4, 0);
    boom(b, turn(move(f, 5.7, 0.16, -1.2), 180), 3.4, 80);
    for (const [x, z, a] of [[6.75, -0.6, 90], [5.25, 0.6, -90]] as const) {
      const g = turn(move(f, 6, 0.16, z), a);
      void x;
      box(b, 'structure/steel-yellow', g, [0, 0.6, 0.45], [0.2, 0.6, 0.15], 'Y');
      plate(b, S('sign-ticket-machine'), g, [0, 0.6, 0.603]);
    }
    const p = move(f, 6, 0.16, 0);
    sqPost(b, ZINC, p, 0, 3.1, 0.04);
    plate(b, S('sign-parking-rates'), p, [0, 2.4, 0.05], { back: S('sign-parking-rates') });
    plate(b, S('sign-parking-full'), p, [0, 3.2, 0.05], { back: S('sign-parking-full') });
  });
  A('gate-pipe-swing', '門 黄色のパイプゲート(公園・林道)', (b, f) => {
    for (const x of [3.4, 8.6]) roundPost(b, 'structure/steel-yellow', f, x, 1.2, 0.07);
    const g = move(f, 3.4, 0, 0);
    pipe(b, 'structure/steel-yellow', [at(g, 0, 1.05, 0), at(g, 5.1, 1.05, 0), at(g, 5.1, 0.55, 0), at(g, 0, 0.35, 0)], 0.04, 8);
    b.tube('structure/steel-yellow', at(g, 2.5, 0.45, 0), at(g, 2.5, 1.05, 0), 0.03, 6);
    plate(b, S('stripes-red-white'), g, [2.6, 0.8, 0.045], { size: [1.2, 0.3] });
    plate(b, S('sign-no-parking-gate'), g, [4.2, 0.8, 0.045]);
    for (const [x0, x1] of [[0.4, 3.0], [9.0, 11.6]]) for (let x = x0; x <= x1; x += 1.3) roundPost(b, WOOD, f, x, 0.75, 0.09);
  });
  A('gate-height-bar', '高さ制限バー', (b, f) => {
    for (const x of [2.6, 9.4]) {
      roundPost(b, 'structure/steel-yellow', f, x, 3.2, 0.07);
      lathe(b, S('stripes-yellow-black'), move(f, x, 0, 0), [[0.075, 0.2], [0.075, 1.1]], 10);
    }
    b.tube('structure/steel-yellow', at(f, 2.6, 3.15, 0), at(f, 9.4, 3.15, 0), 0.05, 8);
    for (const x of [3.6, 8.4]) pipe(b, RUSTY, [at(f, x, 3.1, 0), at(f, x, 2.72, 0)], 0.008, 4, false);
    box(b, 'structure/steel-yellow', f, [6, 2.6, 0], [2.6, 0.12, 0.03]);
    plate(b, S('sign-clearance'), f, [6, 2.6, 0.034], { size: [4.8, 0.2] });
  });
  A('gate-turnstile', '回転式ゲート 全高', (b, f) => {
    chainlink(b, f, 5.2, { h: 2.4 });
    chainlink(b, move(f, 6.8, 0, 0), 5.2, { h: 2.4 });
    const g = move(f, 6, 0, 0);
    for (const x of [-0.78, 0.78]) for (const z of [-0.75, 0.75]) sqPost(b, ZINC, g, x, 2.3, 0.03, z);
    box(b, ZINC, g, [0, 2.33, 0], [0.82, 0.03, 0.8]);
    roundPost(b, ZINC, g, 0, 2.3, 0.045);
    for (const a of [20, 140, 260]) panel(b, S('fence-bars-galvanized'), turn(move(g, 0, 0.1, 0), a), 0.05, 0.72, 0, 2.1);
    panel(b, S('fence-bars-galvanized'), turn(move(g, -0.78, 0.1, 0), 90), -0.75, 0.75, 0, 2.2);
    panel(b, S('fence-bars-galvanized'), turn(move(g, 0.78, 0.1, 0.75), 90), 0, 0.75, 0, 2.2);
  });
}
