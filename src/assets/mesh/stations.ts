import { MeshBuilder, V3, v3 } from './builder';
import { Opening, flatRoof, pitched, rail as railing, row, sheet, sides, wall, weatherBySeed } from './buildkit';
import { bench, bin, postTop, shelter } from './furniture';
import { Pose, at, box, face, move, stand, turn } from './kit';
import { Prof, STYLES, StyleName, TOP, TrackStyle, Way, cap, poseAt, pt, sideWay, sweep, way } from './railkit';
import { board, fareGates, fence, hung, hungClock, postSign, tvm, validator } from './railparts';
import { addModel } from './registry';
import { bufferStop, thirdRail, tracks, tram, viaduct } from './tracks';
import { WINDOW_SIZES } from '../tex';

const R = (id: string): string => `rail/${id}`;
const O = stand();

/** Builder that places everything built through it at the pose `f`. */
export function placed(b: MeshBuilder, f: Pose): MeshBuilder {
  const m = Object.create(b) as MeshBuilder;
  const P = (p: V3): V3 => at(f, p[0], p[1], p[2]);
  const N = (n: V3): V3 => v3.sub(at(f, n[0], n[1], n[2]), f.o);
  m.quad = (mat, a, c, d, e, uv, layer, normal) => b.quad(mat, P(a), P(c), P(d), P(e), uv, layer, normal ? (Array.isArray(normal[0]) ? (normal as V3[]).map(N) : N(normal as V3)) : undefined);
  m.tri = (mat, a, c, d, uv, layer) => b.tri(mat, P(a), P(c), P(d), uv, layer);
  return m;
}

/** Height of a platform top above the ground: level with the car floor, or a low kerb beside the rail. */
export const HIGH = TOP + 1.1;
export const LOW = TOP + 0.2;

export interface PlatOpts {
  h?: number;
  top?: string;
  edge?: string;
  face?: string;
  /** Which long sides (x0, x1) face a track. */
  track?: [boolean, boolean];
  /** How each end (s0, s1) is closed. */
  ends?: ['wall' | 'ramp' | 'none', 'wall' | 'ramp' | 'none'];
  /** Railing along the sides that do not face a track. */
  rail?: string | null;
}
/** Platform between lateral positions x0 and x1 of the way. */
export function platform(w: Way, s0: number, s1: number, x0: number, x1: number, o: PlatOpts = {}): void {
  const h = o.h ?? HIGH;
  const top = o.top ?? 'concrete/walk-square-dirty';
  const edge = o.edge ?? R('edge-line-yellow');
  const faceTex = o.face ?? R('platform-face-concrete');
  const tr = o.track ?? [true, false];
  const fh = b_h(faceTex);
  const [e0, e1] = [tr[0] ? 0.5 : 0, tr[1] ? 0.5 : 0];
  sweep(w, top, s0, s1, [[x0 + e0, h], [x1 - e1, h]], { c: [x0 + e0, x1 - e1] });
  if (tr[0]) sweep(w, edge, s0, s1, [[x0, h], [x0 + 0.5, h]], { c: [0.5, 0], flip: true });
  if (tr[1]) sweep(w, edge, s0, s1, [[x1 - 0.5, h], [x1, h]], { c: [0, 0.5] });
  // Coping overhangs the face on the track side.
  const lip = (x: number, s: number, on: boolean): void => {
    const d = on ? 0.1 : 0;
    if (on) sweep(w, 'concrete/walk-plain', s0, s1, s < 0 ? [[x + d, h - 0.1], [x, h - 0.1], [x, h]] : [[x, h], [x, h - 0.1], [x - d, h - 0.1]]);
    const [a, c] = [h - (on ? 0.1 : 0), 0];
    sweep(w, faceTex, s0, s1, s < 0 ? [[x + d, c], [x + d, a]] : [[x - d, a], [x - d, c]], { c: s < 0 ? [fh - Math.min(fh, a), fh] : [fh, fh - Math.min(fh, a)], flip: s < 0 });
  };
  lip(x0, -1, tr[0]);
  lip(x1, 1, tr[1]);
  const ends = o.ends ?? ['wall', 'wall'];
  const body: Prof = [[x0 + (tr[0] ? 0.1 : 0), 0], [x0 + (tr[0] ? 0.1 : 0), h], [x1 - (tr[1] ? 0.1 : 0), h], [x1 - (tr[1] ? 0.1 : 0), 0]];
  ([[s0, -1], [s1, 1]] as [number, 1 | -1][]).forEach(([s, dir], i) => {
    if (ends[i] === 'wall') cap(w, faceTex, s, body, dir);
    else if (ends[i] === 'ramp') {
      const L = Math.max(2.5, h * 7);
      const [a, c] = [s, s + dir * L];
      const q = (x: number, y: number, ss: number): V3 => pt(w, x, y, ss);
      const [xa, xb] = [x0 + (tr[0] ? 0.1 : 0), x1 - (tr[1] ? 0.1 : 0)];
      w.b.quadUp(top, q(xa, h, a), q(xb, h, a), q(xb, 0, c), q(xa, 0, c), 0, [[xa, a], [xb, a], [xb, c], [xa, c]]);
      for (const x of [xa, xb]) w.b.quadFacing(faceTex, q(x, 0, a), q(x, 0, c), q(x, 0.001, c), q(x, h, a), v3.sub(q(x * 2 - (xa + xb) / 2, 0, a), q((xa + xb) / 2, 0, a)), [[a, fh - h], [c, fh - h], [c, fh - h], [a, fh]]);
    }
  });
  const rl = o.rail === undefined ? 'trim/rail-black' : o.rail;
  if (rl) {
    if (!tr[0]) railing(w.b, rl, pt(w, x0 + 0.06, h, s0), pt(w, x0 + 0.06, h, s1));
    if (!tr[1]) railing(w.b, rl, pt(w, x1 - 0.06, h, s0), pt(w, x1 - 0.06, h, s1));
    ends.forEach((e, i) => {
      if (e === 'wall') railing(w.b, rl, pt(w, x0 + (tr[0] ? 0.9 : 0.06), h, i ? s1 - 0.06 : s0 + 0.06), pt(w, x1 - (tr[1] ? 0.9 : 0.06), h, i ? s1 - 0.06 : s0 + 0.06));
    });
  }
}
const b_h = (tex: string): number => (tex.includes('brick') ? 1.275 : tex.includes('block') ? 1.2 : 1.3);

export type CanopyKind = 'flat' | 'butterfly' | 'gable' | 'shed' | 'vault' | 'heritage';
export interface CanopyOpts {
  kind: CanopyKind;
  /** Height of the platform top, and of the eaves above it. */
  y: number;
  clear?: number;
  half: number;
  roof?: string;
  steel?: string;
  /** For 'shed': the side (-1 or 1) of the low eave, where the posts stand. */
  side?: 1 | -1;
  gap?: number;
}
/** Platform canopy centred on lateral position xc; returns the height of its soffit above the ground at the centre. */
export function canopy(w: Way, s0: number, s1: number, xc: number, o: CanopyOpts): number {
  const b = w.b;
  const E = o.y + (o.clear ?? 3.3);
  const hw = o.half;
  const steel = o.steel ?? 'structure/steel-grey';
  const side = o.side ?? -1;
  const prof: Prof = (
    o.kind === 'flat' ? [[-hw, E + 0.25], [hw, E + 0.25]]
    : o.kind === 'butterfly' ? [[-hw, E + 0.75], [0, E + 0.1], [hw, E + 0.75]]
    : o.kind === 'shed' ? [[-hw, side < 0 ? E : E + 0.9], [hw, side < 0 ? E + 0.9 : E]]
    : o.kind === 'vault' ? Array.from({ length: 9 }, (_, i) => [-hw * Math.cos((i * Math.PI) / 8), E + hw * 0.55 * Math.sin((i * Math.PI) / 8)] as [number, number])
    : [[-hw, E], [0, E + hw * (o.kind === 'heritage' ? 0.42 : 0.3)], [hw, E]]
  ).map(([x, y]) => [x + xc, y] as [number, number]);
  const roof = o.roof ?? { flat: 'roof/flat-membrane-dirty', butterfly: 'roof/seam-grey', gable: 'roof/corrugated-galvanized', shed: 'roof/seam-galvanized', vault: 'roof/seam-white', heritage: 'roof/slate-grey' }[o.kind];
  const t = o.kind === 'flat' ? 0.3 : 0.1;
  const under = prof.map(([x, y]) => [x, y - t] as [number, number]).reverse();
  sweep(w, roof, s0, s1, prof, { uv: 'across' });
  sweep(w, o.kind === 'heritage' ? 'furniture/slats-dark' : o.kind === 'flat' ? 'trim/paint-white-old' : 'structure/deck-underside', s0, s1, under, { uv: 'across' });
  const [L, Rr] = [prof[0], prof[prof.length - 1]];
  sweep(w, steel, s0, s1, [[L[0], L[1] - t], L]);
  sweep(w, steel, s0, s1, [Rr, [Rr[0], Rr[1] - t]]);
  for (const [s, dir] of [[s0, -1], [s1, 1]] as [number, number][]) {
    for (let i = 0; i < prof.length - 1; i++) {
      const [p, q] = [prof[i], prof[i + 1]];
      b.quadFacing(steel, pt(w, p[0], p[1] - t, s), pt(w, q[0], q[1] - t, s), pt(w, q[0], q[1], s), pt(w, p[0], p[1], s), v3.sub(pt(w, 0, 0, s + dir), pt(w, 0, 0, s)), [[p[0], 0], [q[0], 0], [q[0], t], [p[0], t]]);
    }
  }
  if (o.kind === 'heritage') {
    // Sawtooth timber valance below both eaves.
    for (const e of [L, Rr]) sheet(b, 'trim/lattice-white', pt(w, e[0], e[1] - t - 0.45, s0), pt(w, e[0], e[1] - t - 0.45, s1), pt(w, e[0], e[1] - t, s1), pt(w, e[0], e[1] - t, s0), [[0, 0], [s1 - s0, 0], [s1 - s0, 0.45], [0, 0.45]]);
  }
  const yAt = (x: number): number => {
    for (let i = 0; i < prof.length - 1; i++) if (x >= prof[i][0] - 1e-6 && x <= prof[i + 1][0] + 1e-6) return prof[i][1] + ((prof[i + 1][1] - prof[i][1]) * (x - prof[i][0])) / (prof[i + 1][0] - prof[i][0]) - t;
    return E;
  };
  const twin = o.kind === 'gable' || o.kind === 'heritage' || o.kind === 'vault';
  const cols = twin ? [xc - hw + 0.7, xc + hw - 0.7] : o.kind === 'shed' ? [xc + side * (hw - 0.5)] : [xc];
  const n = Math.max(1, Math.round((s1 - s0 - 2) / (o.gap ?? 6)));
  for (let i = 0; i <= n; i++) {
    const s = s0 + 1 + ((s1 - s0 - 2) * i) / n;
    const f = poseAt(w, s);
    for (const x of cols) {
      const top = yAt(x);
      if (o.kind === 'heritage') {
        b.tube('signal/pole-green', at(f, x, o.y, 0), at(f, x, top, 0), 0.075, 10, 0.06);
        b.tube('signal/pole-green', at(f, x, o.y, 0), at(f, x, o.y + 0.5, 0), 0.11, 10, 0.09, true);
        for (const sx of [-1, 1]) b.beam('signal/pole-green', at(f, x, top - 0.7, 0), at(f, x + sx * 0.7, yAt(Math.min(xc + hw, Math.max(xc - hw, x + sx * 0.7))) - 0.02, 0), 0.04, 0.06);
      } else box(b, steel, f, [x, (o.y + top) / 2, 0], [0.09, (top - o.y) / 2, 0.09], 'yY');
    }
    // Rafter under the roof at each bay.
    for (let k = 0; k < prof.length - 1; k++) {
      const [p, q] = [prof[k], prof[k + 1]];
      b.beam(steel, at(f, p[0], p[1] - t - 0.09, 0), at(f, q[0], q[1] - t - 0.09, 0), 0.1, 0.18);
    }
    if (twin && o.kind !== 'vault') b.beam(steel, at(f, cols[0], E - 0.15, 0), at(f, cols[1], E - 0.15, 0), 0.08, 0.12);
  }
  if (o.kind !== 'flat') for (const x of cols) b.beam(steel, pt(w, x, yAt(x) - 0.25, s0 + 1), pt(w, x, yAt(x) - 0.25, s1 - 1), 0.1, 0.16);
  return yAt(xc + (o.kind === 'shed' ? 0 : 0)) - 0.1;
}

/** Flight of stairs climbing along +z from the pose; returns the length of its run. */
export function stairs(b: MeshBuilder, f: Pose, rise: number, wdt: number, o: { tread?: string; steel?: string; rail?: string | null; solid?: boolean } = {}): number {
  const tread = o.tread ?? 'concrete/walk-plain';
  const steel = o.steel ?? 'structure/steel-grey';
  const n = Math.max(1, Math.round(rise / 0.17));
  const [r, g] = [rise / n, 0.29];
  const mid = n > 18 ? Math.ceil(n / 2) : -1;
  let z = 0;
  const P = (x: number, y: number, zz: number): V3 => at(f, x, y, zz);
  const hw = wdt / 2;
  const flights: [number, number, number, number][] = [];
  let [fz, fy] = [0, 0];
  for (let i = 0; i < n; i++) {
    const y = (i + 1) * r;
    b.quad(tread, P(hw, y - r, z), P(-hw, y - r, z), P(-hw, y, z), P(hw, y, z), [[0, 0], [wdt, 0], [wdt, r], [0, r]]);
    const run = i === mid ? 1.5 : g;
    b.quad(tread, P(hw, y, z), P(-hw, y, z), P(-hw, y, z + run), P(hw, y, z + run), [[0, 0], [wdt, 0], [wdt, run], [0, run]]);
    if (i === mid) {
      flights.push([fz, fy, z, y]);
      flights.push([z, y, z + run, y]);
      [fz, fy] = [z + run, y];
    }
    z += run;
  }
  flights.push([fz, fy, z - g, rise]);
  for (const [z0, y0, z1, y1] of flights) {
    for (const sx of [-1, 1]) {
      const x = sx * (hw + 0.03);
      if (o.solid) b.quadFacing(tread, P(x, 0, z0), P(x, 0, z1 + (y1 === y0 ? 0 : g)), P(x, y1, z1 + (y1 === y0 ? 0 : g)), P(x, y0, z0), v3.sub(P(sx, 0, 0), P(0, 0, 0)), [[z0, 0], [z1, 0], [z1, y1], [z0, y0]]);
      else b.beam(steel, P(x, y0 - 0.12, z0), P(x, y1 - 0.12, z1 + (y1 === y0 ? 0 : g)), 0.06, 0.3);
      if (o.rail !== null) railing(b, o.rail ?? 'trim/rail-black', P(sx * hw, y0 + (y1 === y0 ? 0 : r), z0), P(sx * hw, y1, z1 + (y1 === y0 ? 0 : 0)), 1.0);
    }
    if (!o.solid) b.quad('structure/deck-underside', P(-hw, y0 - 0.2, z0), P(hw, y0 - 0.2, z0), P(hw, y1 - 0.2, z1 + (y1 === y0 ? 0 : g)), P(-hw, y1 - 0.2, z1 + (y1 === y0 ? 0 : g)));
  }
  if (mid >= 0 && !o.solid) {
    const [z0, y0] = [flights[1][0], flights[1][1]];
    for (const sx of [-1, 1]) box(b, steel, f, [sx * (hw - 0.1), (y0 - 0.2) / 2, z0 + 0.75], [0.07, (y0 - 0.2) / 2, 0.07], 'yY');
  }
  return z - g;
}

export interface HouseOpts {
  seed: number;
  w: number;
  d: number;
  h?: number;
  wall: string;
  trim?: string;
  win: string;
  door?: string;
  roof: 'hip' | 'gable' | 'flat';
  roofMat: string;
  over?: number;
  /** Entrance sign over the doors on both long sides. */
  sign?: string;
  name?: string;
  clock?: boolean;
  /** Clerestory band below a flat roof. */
  band?: string;
}
/** Station building centred on the pose; its long sides face +z (platform) and -z (street). */
export function stationHouse(b0: MeshBuilder, f: Pose, o: HouseOpts): void {
  const b = placed(b0, f);
  weatherBySeed(b, o.seed, o.wall);
  const h = o.h ?? 4.2;
  const trim = o.trim ?? 'trim/paint-white-old';
  const door = o.door ?? 'door/glass-double-aluminium';
  const [dw, dh] = door.includes('lobby') ? [3.6, 2.7] : door.includes('double') ? [1.8, 2.15] : [0.95, 2.15];
  const ws = WINDOW_SIZES[o.win];
  const par = o.roof === 'flat' ? 0.7 : 0;
  sides(0, 0, o.w, o.d).forEach((s, i) => {
    const holes: Opening[] = [];
    const long = i % 2 === 0;
    if (long) holes.push({ x: s.w / 2 - dw / 2, y: 0, w: dw, h: dh, tex: door, depth: 0.2, frame: trim });
    const wins = row(s.w, o.win, { y: 1.0, sill: trim, head: trim, depth: 0.14, pitch: ws.w + 1.1, margin: 0.9 });
    for (const q of wins) if (!long || q.x + q.w < s.w / 2 - dw / 2 - 0.5 || q.x > s.w / 2 + dw / 2 + 0.5) holes.push(q);
    if (o.band && long) holes.push({ x: 0.6, y: h - 1.3, w: s.w - 1.2, h: 0.8, tex: o.band, depth: 0.1 });
    wall(b, o.wall, s.f, s.w, h + par, holes);
    box(b, 'concrete/walk-plain', s.f, [s.w / 2, 0.12, 0.03], [s.w / 2 + 0.03, 0.12, 0.03], 'YZ');
    if (long && o.sign) {
      const [sw, sh] = o.sign.includes('station') ? [6, 0.7] : o.sign.includes('depot') ? [4, 0.5] : [3, 0.5];
      box(b, 'trim/paint-charcoal', s.f, [s.w / 2, dh + 0.75, 0.05], [sw / 2 + 0.05, sh / 2 + 0.05, 0.05]);
      face(b, o.sign, s.f, [s.w / 2, dh + 0.75, 0.103], sw, sh);
    }
    if (i === 0 && o.name) board(b, s.f, o.name, [Math.min(s.w - 1.8, s.w / 2 + dw / 2 + 2), 2.75, 0.06], { back: null, t: 0.05 });
    if (i === 2 && o.clock) {
      box(b, 'trim/paint-charcoal', s.f, [s.w / 2, h - 0.2 + (o.roof === 'gable' ? 0.3 : 0), 0.06], [0.42, 0.42, 0.06]);
      face(b, 'furniture/clock', s.f, [s.w / 2, h - 0.2 + (o.roof === 'gable' ? 0.3 : 0), 0.122], 0.7, 0.7);
    }
  });
  if (o.roof === 'flat') flatRoof(b, 0, 0, o.w, o.d, h, { mat: o.roofMat, parapet: par, outer: o.wall });
  else pitched(b, stand([0, h, 0]), o.w, o.d, { mat: o.roofMat, rise: o.d * (o.roof === 'hip' ? 0.22 : 0.3), over: o.over ?? 1.2, fascia: trim, soffit: trim, ...(o.roof === 'hip' ? { hip: true } : { gable: o.wall }) });
}

export interface BridgeOpts {
  /** Lateral positions of the two stair towers and height of the deck above the ground. */
  x0: number;
  x1: number;
  h?: number;
  w?: number;
  /** Height of the ground the stairs land on at each end, and the way (+1 / -1 along z) each flight descends. */
  foot: [number, number];
  dir?: [1 | -1, 1 | -1];
  kind: 'open' | 'truss' | 'closed' | 'concrete';
  steel?: string;
  lift?: boolean;
}
/** Footbridge across the tracks at the pose, with a stair down at each end. */
export function footbridge(b: MeshBuilder, f: Pose, o: BridgeOpts): void {
  const h = o.h ?? 6.6;
  const hw = (o.w ?? 2.4) / 2;
  const steel = o.steel ?? 'structure/steel-green';
  const [x0, x1] = [o.x0 - hw, o.x1 + hw];
  const closed = o.kind === 'closed';
  box(b, o.kind === 'concrete' ? 'structure/wall-smooth' : steel, f, [(x0 + x1) / 2, h - 0.2, 0], [(x1 - x0) / 2, 0.2, hw + 0.05]);
  box(b, 'concrete/walk-plain', f, [(x0 + x1) / 2, h + 0.005, 0], [(x1 - x0) / 2, 0.005, hw], 'Y');
  const dir = o.dir ?? [1, -1];
  [o.x0, o.x1].forEach((x, i) => {
    for (const dz of [-hw + 0.1, hw - 0.1]) for (const dx of [-hw + 0.1, hw - 0.1]) box(b, o.kind === 'concrete' ? 'structure/pier-formwork' : steel, f, [x + dx, (h - 0.4 + o.foot[i]) / 2, dz], [0.1, (h - 0.4 - o.foot[i]) / 2, 0.1], 'yY');
    const g = turn(move(f, x, o.foot[i], dir[i] * (hw + stairsRun(h - o.foot[i]))), dir[i] > 0 ? 180 : 0);
    stairs(b, g, h - o.foot[i], hw * 2 - 0.3, { steel, tread: o.kind === 'concrete' ? 'concrete/walk-plain' : 'concrete/walk-dark', solid: o.kind === 'concrete' });
    if (o.lift && i === 0) {
      const lf = move(f, x - (i ? -1 : 1) * 0 , o.foot[i], -dir[i] * (hw + 1.1));
      box(b, 'window/curtain-clear', lf, [0, (h - o.foot[i] + 2.6) / 2, 0], [1.0, (h - o.foot[i] + 2.6) / 2, 1.0], 'Y');
      box(b, steel, lf, [0, h - o.foot[i] + 2.65, 0], [1.08, 0.08, 1.08]);
      face(b, R('way-elevator'), turn(lf, dir[i] > 0 ? 180 : 0), [0, 2.5, 1.02], 1.6, 0.36);
    }
  });
  const P = (x: number, y: number, z: number): V3 => at(f, x, y, z);
  for (const sz of [-1, 1]) {
    const z = sz * hw;
    // The side is open where a stair joins the deck.
    const gaps = [o.x0, o.x1].filter((_, i) => dir[i] === sz).map((x) => [x - hw + 0.15, x + hw - 0.15]);
    let from = x0;
    const runs: [number, number][] = [];
    for (const [a, c] of gaps.sort((p, q) => p[0] - q[0])) {
      if (a > from) runs.push([from, a]);
      from = c;
    }
    if (from < x1) runs.push([from, x1]);
    for (const [a, c] of runs) {
      if (closed) {
        const wf = sz > 0 ? stand(P(a, h, z), 0) : stand(P(c, h, z), 180);
        const g: Pose = { o: wf.o, x: v3.sub(at(f, sz, 0, 0), f.o), y: f.y, z: v3.sub(at(f, 0, 0, sz), f.o) };
        wall(b, 'wall/metal-panel-white', g, c - a, 2.6, c - a > 3 ? [{ x: 0.4, y: 1.0, w: c - a - 0.8, h: 1.1, tex: 'window/band-aluminium', depth: 0.05 }] : []);
      } else if (o.kind === 'concrete') {
        box(b, 'structure/wall-smooth', f, [(a + c) / 2, h + 0.55, z], [(c - a) / 2, 0.55, 0.08]);
        sheet(b, 'trim/chainlink', P(a, h + 1.1, z), P(c, h + 1.1, z), P(c, h + 2.3, z), P(a, h + 2.3, z), [[0, 0], [c - a, 0], [c - a, 1.2], [0, 1.2]]);
      } else {
        railing(b, 'trim/rail-black', P(a, h, z), P(c, h, z), 1.1);
        if (o.kind === 'truss') {
          box(b, steel, f, [(a + c) / 2, h + 2.5, z], [(c - a) / 2, 0.07, 0.07]);
          const n = Math.max(1, Math.round((c - a) / 2.4));
          for (let k = 0; k <= n; k++) {
            const x = a + ((c - a) * k) / n;
            box(b, steel, f, [x, h + 1.25, z], [0.05, 1.25, 0.05], 'yY');
            if (k < n) b.beam(steel, P(k % 2 ? x : x + (c - a) / n, h, z), P(k % 2 ? x + (c - a) / n : x, h + 2.5, z), 0.05, 0.05);
          }
        }
      }
    }
  }
  for (const x of [x0, x1]) {
    if (closed) box(b, 'wall/metal-panel-white', f, [x, h + 1.3, 0], [0.04, 1.3, hw]);
    else if (o.kind === 'concrete') box(b, 'structure/wall-smooth', f, [x, h + 0.55, 0], [0.08, 0.55, hw]);
    else railing(b, 'trim/rail-black', P(x, h, -hw), P(x, h, hw), 1.1);
  }
  if (closed) box(b, 'roof/seam-grey', f, [(x0 + x1) / 2, h + 2.66, 0], [(x1 - x0) / 2 + 0.2, 0.06, hw + 0.25]);
}
const stairsRun = (rise: number): number => {
  const n = Math.max(1, Math.round(rise / 0.17));
  return (n - 1) * 0.29 + (n > 18 ? 1.21 : 0);
};

export interface SubwayOpts {
  w?: number;
  depth?: number;
  wall?: string;
  guard: 'rail' | 'wall' | 'glass' | 'kiosk';
  sign?: string;
  logo?: string;
  roof?: boolean;
  steel?: string;
}
/** Stair down to a subway: entered at the pose walking along +z. The stair well is below y = 0. */
export function subwayEntrance(b: MeshBuilder, f: Pose, o: SubwayOpts): void {
  const hw = (o.w ?? 3) / 2;
  const D = o.depth ?? 3.74;
  const tile = o.wall ?? 'wall/tile-white';
  const steel = o.steel ?? 'structure/steel-green';
  const run = stairsRun(D);
  const L = run + 2.4;
  const down = turn(move(f, 0, -D, run), 180);
  stairs(b, down, D, hw * 2, { rail: null, solid: true, tread: 'concrete/walk-dark' });
  const P = (x: number, y: number, z: number): V3 => at(f, x, y, z);
  b.quad('concrete/walk-dark', P(hw, -D, run), P(-hw, -D, run), P(-hw, -D, L), P(hw, -D, L), [[0, 0], [hw * 2, 0], [hw * 2, L - run], [0, L - run]]);
  for (const sx of [-1, 1]) b.quadFacing(tile, P(sx * hw, -D, 0), P(sx * hw, -D, L), P(sx * hw, 0, L), P(sx * hw, 0, 0), v3.sub(P(-sx, 0, 0), P(0, 0, 0)), [[0, 0], [L, 0], [L, D], [0, D]]);
  b.quad('trim/paint-black', P(hw, -D, L), P(-hw, -D, L), P(-hw, -D + 2.5, L), P(hw, -D + 2.5, L));
  b.quad(tile, P(hw, -D + 2.5, L), P(-hw, -D + 2.5, L), P(-hw, 0, L), P(hw, 0, L), [[0, 2.5], [hw * 2, 2.5], [hw * 2, D], [0, D]]);
  face(b, R('way-trains'), turn(move(f, 0, 0, L), 180), [0, -D + 2.9, 0.01], 1.6, 0.36);
  // Shell that hides the well from outside when the model stands on its own.
  box(b, 'structure/wall-smooth', f, [0, -D / 2 - 0.15, L / 2], [hw + 0.25, D / 2 + 0.15, L / 2 + 0.25], 'y');
  // Sidewalk around the opening.
  const m = 1.8;
  for (const [x0, x1, z0, z1] of [[-hw - m, -hw, -m, L + m], [hw, hw + m, -m, L + m], [-hw, hw, -m, 0], [-hw, hw, L, L + m]]) b.quadUp('concrete/walk-square-dirty', P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1), 0, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  const curb = 'stone'.length ? 'wall/stone-granite-grey' : '';
  const sidesOf: [V3, V3][] = [[P(-hw - 0.12, 0, 0), P(-hw - 0.12, 0, L + 0.12)], [P(hw + 0.12, 0, 0), P(hw + 0.12, 0, L + 0.12)], [P(-hw - 0.12, 0, L + 0.12), P(hw + 0.12, 0, L + 0.12)]];
  const H = o.guard === 'kiosk' ? 2.9 : o.guard === 'wall' ? 1.05 : 0.2;
  box(b, o.guard === 'kiosk' ? 'wall/tile-green' : curb, f, [-hw - 0.12, H / 2, L / 2 + 0.06], [0.12, H / 2, L / 2 + 0.06], 'Y');
  box(b, o.guard === 'kiosk' ? 'wall/tile-green' : curb, f, [hw + 0.12, H / 2, L / 2 + 0.06], [0.12, H / 2, L / 2 + 0.06], 'Y');
  box(b, o.guard === 'kiosk' ? 'wall/tile-green' : curb, f, [0, H / 2, L + 0.12], [hw, H / 2, 0.12], 'Y');
  if (o.guard === 'rail') for (const [a, c] of sidesOf) railing(b, 'trim/rail-green', [a[0], a[1] + 0.2, a[2]], [c[0], c[1] + 0.2, c[2]], 0.95);
  if (o.guard === 'glass') for (const [a, c] of sidesOf) {
    const len = v3.len(v3.sub(c, a));
    sheet(b, 'furniture/shelter-glass', [a[0], a[1] + 0.2, a[2]], [c[0], c[1] + 0.2, c[2]], [c[0], c[1] + 1.3, c[2]], [a[0], a[1] + 1.3, a[2]], [[0, 0.4], [len, 0.4], [len, 1.5], [0, 1.5]]);
    b.tube('furniture/coat-stainless', [a[0], a[1] + 1.3, a[2]], [c[0], c[1] + 1.3, c[2]], 0.025, 6);
  }
  if (o.roof || o.guard === 'kiosk') {
    const y = o.guard === 'kiosk' ? 2.9 : 2.7;
    if (o.guard !== 'kiosk') for (const sx of [-1, 1]) for (const z of [0.1, L / 2, L]) box(b, steel, f, [sx * (hw + 0.12), (y + 0.2) / 2, z], [0.05, (y - 0.2) / 2, 0.05], 'yY');
    if (o.guard === 'kiosk') box(b, 'roof/seam-green', f, [0, y + 0.08, L / 2], [hw + 0.5, 0.08, L / 2 + 0.6]);
    else {
      box(b, steel, f, [0, y, L / 2], [hw + 0.25, 0.04, L / 2 + 0.2]);
      sheet(b, 'furniture/shelter-glass', P(hw + 0.4, y + 0.06, -0.3), P(-hw - 0.4, y + 0.06, -0.3), P(-hw - 0.4, y + 0.06, L + 0.4), P(hw + 0.4, y + 0.06, L + 0.4), [[0, 0], [hw * 2 + 0.8, 0], [hw * 2 + 0.8, L + 0.7], [0, L + 0.7]]);
    }
  }
  if (o.sign) {
    const y = o.guard === 'kiosk' ? 2.55 : 2.75;
    if (!o.roof && o.guard !== 'kiosk') for (const sx of [-1, 1]) box(b, steel, f, [sx * (hw + 0.12), y / 2 + 0.2, 0.05], [0.05, y / 2 + 0.1, 0.05], 'Y');
    board(b, turn(move(f, 0, 0, 0.02), 180), o.sign, [0, y, 0], { size: [Math.min(3, hw * 2), 0.5], t: 0.08, rim: steel });
  }
  if (o.logo) {
    b.tube(steel, P(hw + 0.6, 0, -0.4), P(hw + 0.6, 3.4, -0.4), 0.05, 8, 0.05, true);
    board(b, move(f, hw + 0.6, 0, -0.4), o.logo, [0, 3.85, 0], { t: 0.1, rim: steel });
  }
}

const EDGE = 1.62;
const st = (k: StyleName | StyleName[]): TrackStyle | TrackStyle[] => (Array.isArray(k) ? k.map((x) => STYLES[x] as TrackStyle) : (STYLES[k] as TrackStyle));

interface FurnishOpts {
  name: string;
  /** Benches face +x (1), -x (-1) or stand back to back (0). */
  face: 1 | -1 | 0;
  /** Height of a canopy soffit above the ground; signs hang from it. */
  soffit?: number;
  lamp?: 'globe' | 'acorn' | 'lantern' | 'disc';
  benchKind?: 'park' | 'flat' | 'metal' | 'concrete';
  n?: number;
  number?: number;
  clock?: boolean;
  pole?: string;
}
/** Benches, bins, name boards and lamps along the platform strip centred on lateral position x. */
function furnish(w: Way, s0: number, s1: number, x: number, h: number, o: FurnishOpts): void {
  const b = w.b;
  const n = o.n ?? Math.max(1, Math.round((s1 - s0) / 15));
  const yaws = o.face === 0 ? [90, -90] : [o.face > 0 ? 90 : -90];
  for (let i = 0; i < n; i++) {
    const s = s0 + ((i + 0.5) * (s1 - s0)) / n;
    for (const yaw of yaws) bench(b, move(turn(poseAt(w, s, x, h), yaw), 0, 0, o.face === 0 ? 0.42 : 0), { kind: o.benchKind ?? 'metal', slats: i % 2 ? 'weathered' : 'dark' });
    bin(b, turn(poseAt(w, s + 1.8, x, h), yaws[0]), i % 2 ? { kind: 'hood', tex: 'furniture/perforated-blue', lid: 'structure/steel-blue', label: 'recycle' } : { kind: 'hood', tex: 'furniture/slots-black', label: 'trash' });
    const g = turn(poseAt(w, s - 3.6, x, h), 90);
    if (o.soffit) hung(b, g, o.name, o.soffit - h, 2.72);
    else postSign(b, g, o.name, { y: 1.95, post: o.pole ?? 'signal/pole-grey' });
    if (o.soffit && o.number && i === 0) hung(b, turn(poseAt(w, s + 4.5, x, h), 180), R(`track-${o.number}`), o.soffit - h, 2.75);
    if (o.soffit && o.clock && i === n - 1) hungClock(b, turn(poseAt(w, s + 5, x, h), 90), o.soffit - h, 2.75);
    if (o.lamp) postTop(b, poseAt(w, s + 5.5, x, h), { h: 3.6, tex: o.pole ?? 'signal/pole-black', top: o.lamp, on: false });
  }
}

/** Pad that raises a building to platform level, with steps down to the street on its -z side. */
function podium(b: MeshBuilder, f: Pose, w: number, d: number, h: number, steps = 4): void {
  box(b, 'structure/wall-smooth', f, [0, h / 2, 0], [w / 2 + 0.6, h / 2, d / 2 + 0.6], 'Yy');
  const P = (x: number, z: number): V3 => at(f, x, h, z);
  b.quad('concrete/walk-square-dirty', P(-w / 2 - 0.6, d / 2 + 0.6), P(w / 2 + 0.6, d / 2 + 0.6), P(w / 2 + 0.6, -d / 2 - 0.6), P(-w / 2 - 0.6, -d / 2 - 0.6), [[0, 0], [w + 1.2, 0], [w + 1.2, d + 1.2], [0, d + 1.2]]);
  if (h > 0.3) stairs(b, move(f, 0, 0, -d / 2 - 0.6 - (Math.max(1, Math.round(h / 0.17)) - 1) * 0.29 - (Math.round(h / 0.17) > 18 ? 1.21 : 0)), h, steps, { solid: true });
}

export function addStations(): void {
  const S = (id: string, label: string, build: (b: MeshBuilder) => void): void => addModel('station', id, label, build);
  const start = (b: MeshBuilder, L: number): Way => way(b, stand([0, 0, -L / 2]));
  const N = (id: string, style = 'blue'): string => R(`name-${id}-${style}`);

  // --- Whole stations. ---
  S('halt-timber', '無人駅 木造ホームと待合所', (b) => {
    const w = start(b, 40);
    tracks(w, 0, 40, [0], st('wood-old'));
    platform(w, 9, 31, EDGE, 4.6, { h: LOW, top: 'paving/boardwalk-grey', edge: R('edge-plain'), face: R('platform-face-timber'), ends: ['ramp', 'ramp'], rail: 'trim/rail-brown' });
    shelter(b, turn(poseAt(w, 17, 3.7, LOW), -90), { len: 2.6, bench: 'weathered', frame: 'signal/pole-green', glass: null });
    postSign(b, turn(poseAt(w, 25, 3.9, LOW), 90), N('eastgate', 'white'), { y: 1.9, post: 'signal/pole-wood-grey' });
    postTop(b, poseAt(w, 22, 4.1, LOW), { h: 3.4, tex: 'signal/pole-green', top: 'lantern', on: false });
  });
  S('halt-concrete', '無人駅 コンクリートホームと上屋', (b) => {
    const w = start(b, 50);
    tracks(w, 0, 50, [0], st('concrete-stained'));
    platform(w, 8, 42, EDGE, 5.2, { h: LOW, face: R('platform-face-block'), edge: R('edge-line-yellow-worn'), ends: ['ramp', 'ramp'], rail: null });
    const so = canopy(w, 18, 32, 3.9, { kind: 'shed', y: LOW, half: 1.9, side: 1 });
    furnish(w, 18, 32, 4.3, LOW, { name: N('palm-ave'), face: -1, soffit: so, n: 1 });
    tvm(b, turn(poseAt(w, 30.5, 4.6, LOW), -90), 'blue');
    validator(b, turn(poseAt(w, 12, 4.6, LOW), -90));
    fence(b, turn(poseAt(w, 42, 5.3, 0), 90), 34, 'chainlink', { signs: [R('warn-tracks')] });
  });
  S('depot', '地方駅 木造駅舎と低いホーム', (b) => {
    const w = start(b, 60);
    tracks(w, 0, 60, [0], st('wood'));
    platform(w, 5, 55, EDGE, 6.2, { h: LOW, top: 'paving/running-red', edge: R('edge-line-white'), face: R('platform-face-brick'), ends: ['ramp', 'ramp'], rail: null });
    const hf = turn(stand([11.2, 0, 0]), -90);
    podium(b, hf, 18, 7, LOW, 5);
    stationHouse(b, move(hf, 0, LOW, 0), { seed: 11, w: 18, d: 7, h: 4, wall: 'wall/siding-cream', trim: 'trim/paint-green', win: 'window/sash-tall-white', roof: 'hip', roofMat: 'roof/shingle-green', over: 2.2, sign: R('entrance-depot'), name: N('old-town', 'green'), clock: true });
    furnish(w, 6, 54, 5.2, LOW, { name: N('old-town', 'green'), face: -1, lamp: 'acorn', benchKind: 'park', pole: 'signal/pole-green', n: 3 });
  });
  S('twin-brick', '複線の駅 レンガ駅舎・跨線橋・上屋', (b) => {
    const w = start(b, 70);
    tracks(w, 0, 70, [-2, 2], st('concrete'));
    const o: PlatOpts = { h: LOW, top: 'concrete/walk-square', face: R('platform-face-brick'), edge: R('edge-text-behind'), ends: ['ramp', 'ramp'], rail: null };
    platform(w, 8, 62, 2 + EDGE, 8.4, o);
    platform(w, 8, 62, -8.4, -2 - EDGE, { ...o, track: [false, true] });
    const hf = turn(stand([13.6, 0, -8]), -90);
    podium(b, hf, 20, 8, LOW, 5);
    stationHouse(b, move(hf, 0, LOW, 0), { seed: 5, w: 20, d: 8, h: 5.2, wall: 'wall/brick-red-common', trim: 'trim/paint-cream', win: 'window/arch-white', roof: 'gable', roofMat: 'roof/slate-grey', over: 0.6, sign: R('entrance-station'), clock: true });
    const so = canopy(w, 12, 40, 6.1, { kind: 'heritage', y: LOW, half: 2.6 });
    furnish(w, 12, 40, 6.6, LOW, { name: N('central'), face: -1, soffit: so, number: 1, clock: true });
    shelter(b, turn(poseAt(w, 24, -7.3, LOW), 90), { len: 5.4, bench: 'dark', frame: 'signal/pole-green' });
    furnish(w, 10, 40, -7, LOW, { name: N('central'), face: 1, lamp: 'globe', n: 2, pole: 'signal/pole-green' });
    footbridge(b, poseAt(w, 47, 0, 0), { x0: -6.6, x1: 6.6, foot: [LOW, LOW], dir: [1, 1], kind: 'truss' });
    fence(b, turn(poseAt(w, 62, -8.5, 0), 90), 54, 'palisade');
  });
  S('commuter-high', '通勤駅 高いホーム・平屋根の上屋', (b) => {
    const w = start(b, 80);
    tracks(w, 0, 80, [-2, 2], st('concrete'));
    for (const s of [-1, 1] as const) {
      const [x0, x1] = s > 0 ? [2 + EDGE, 7.4] : [-7.4, -2 - EDGE];
      platform(w, 14, 74, x0, x1, { track: s > 0 ? [true, false] : [false, true], ends: ['ramp', 'wall'], edge: R('edge-text-gap') });
      const xc = s * 5.2;
      const so = canopy(w, 30, 62, xc, { kind: 'flat', y: HIGH, half: 2.2 });
      furnish(w, 30, 62, s * 5.9, HIGH, { name: N('civic-center', 'white'), face: s > 0 ? -1 : 1, soffit: so, number: s > 0 ? 1 : 2 });
      tvm(b, turn(poseAt(w, 20, s * 6.6, HIGH), -90 * s), s > 0 ? 'red' : 'off');
      validator(b, turn(poseAt(w, 17, s * 6.6, HIGH), -90 * s));
      postTop(b, poseAt(w, 68, s * 6.6, HIGH), { h: 4, tex: 'signal/pole-grey', top: 'disc', on: false });
    }
    footbridge(b, poseAt(w, 22, 0, 0), { x0: -9.2, x1: 9.2, foot: [0, 0], dir: [-1, -1], kind: 'open', steel: 'structure/steel-grey' });
  });
  S('island-low', '島式ホームの駅 バタフライ屋根', (b) => {
    const w = start(b, 70);
    tracks(w, 0, 70, [-4.2, 4.2], st(['wood', 'concrete']));
    platform(w, 10, 60, -4.2 + EDGE, 4.2 - EDGE, { h: LOW, track: [true, true], ends: ['ramp', 'ramp'], top: 'paving/herringbone-grey', edge: R('edge-line-yellow') });
    const so = canopy(w, 22, 48, 0, { kind: 'butterfly', y: LOW, half: 2.9, steel: 'structure/steel-blue' });
    furnish(w, 22, 48, 0, LOW, { name: N('harbor', 'white'), face: 0, soffit: so, number: 2, clock: true });
    for (const s of [14, 56]) postTop(b, poseAt(w, s, 0, LOW), { h: 3.6, tex: 'signal/pole-black', top: 'globe', on: false, arms: 2 });
    validator(b, poseAt(w, 12.5, 0, LOW));
    postSign(b, turn(poseAt(w, 9.6, 0, 0.5), 0), R('warn-look'), { y: 1.2, posts: 1, back: null });
  });
  S('island-high', '島式ホームの駅 高いホーム・屋根つき跨線橋', (b) => {
    const w = start(b, 80);
    tracks(w, 0, 80, [-4.4, 4.4], st('concrete'));
    for (const d of [-4.4, 4.4]) thirdRail(sideWay(w, d), 0, 80, d < 0 ? -1 : 1);
    platform(w, 10, 72, -4.4 + EDGE, 4.4 - EDGE, { track: [true, true], ends: ['wall', 'wall'], top: 'concrete/walk-small', edge: R('edge-text-gap') });
    const so = canopy(w, 30, 70, 0, { kind: 'gable', y: HIGH, half: 3.1, roof: 'roof/seam-blue' });
    furnish(w, 31, 69, 0, HIGH, { name: N('mesa-heights', 'black'), face: 0, soffit: so, number: 1, clock: true });
    footbridge(b, poseAt(w, 15, 0, 0), { x0: 0, x1: 10.4, foot: [HIGH, 0], dir: [1, -1], kind: 'closed', lift: false, steel: 'structure/steel-grey' });
    tvm(b, turn(stand(pt(w, 12.6, 0, 15)), -90), 'steel');
    fence(b, turn(poseAt(w, 80, 7.6, 0), 90), 80, 'chainlink-barbed', { signs: [R('warn-third-rail'), R('warn-no-trespassing')] });
  });
  S('metro-surface', '地上のメトロ駅 かまぼこ屋根・改札', (b) => {
    const w = start(b, 70);
    tracks(w, 0, 70, [-2, 2], st('station'));
    for (const s of [-1, 1] as const) {
      const [x0, x1] = s > 0 ? [2 + EDGE, 8] : [-8, -2 - EDGE];
      platform(w, 12, 66, x0, x1, { track: s > 0 ? [true, false] : [false, true], ends: ['ramp', 'wall'], top: 'paving/slabs-granite', edge: R('edge-line-yellow'), face: R('platform-face-concrete') });
      const so = canopy(w, 22, 64, s * 5.8, { kind: 'vault', y: HIGH, half: 2.3, steel: 'structure/steel-white' });
      furnish(w, 26, 62, s * 6.6, HIGH, { name: N('del-mar', 'green'), face: s > 0 ? -1 : 1, soffit: so - 0.5, number: s > 0 ? 1 : 2 });
      fareGates(b, poseAt(w, 16.5, s * 5.9, HIGH), 3);
      tvm(b, turn(stand(pt(w, s * 9, 0, 6)), -90 * s), 'blue');
      hung(b, turn(poseAt(w, 23, s * 5.8, HIGH), 180), R('departures-1'), so - HIGH - 0.5, 2.8, { t: 0.14, rim: 'trim/paint-black' });
    }
    postSign(b, turn(stand(pt(w, 10.5, 0, 3)), 180), R('logo-metro'), { y: 4, posts: 1, t: 0.1, post: 'signal/pole-black' });
  });
  S('terminal', '終着駅 4線・頭端ホーム・駅舎', (b) => {
    const L = 84;
    const w = start(b, L);
    const lats = [-9, -5, 5, 9];
    tracks(w, 0, 62, lats, st('station'), { pad: 1.9 });
    lats.forEach((d, i) => bufferStop(sideWay(w, d), 60.5, i % 2 ? 'concrete' : 'steel'));
    const o: PlatOpts = { top: 'concrete/walk-square', edge: R('edge-line-yellow'), ends: ['ramp', 'none'], rail: null };
    platform(w, 14, 62, -5 + EDGE, 5 - EDGE, { ...o, track: [true, true] });
    platform(w, 14, 62, 9 + EDGE, 14.5, { ...o, track: [true, false] });
    platform(w, 14, 62, -14.5, -9 - EDGE, { ...o, track: [false, true] });
    platform(w, 62, 70, -14.5, 14.5, { top: 'paving/slabs-granite', track: [false, false], ends: ['wall', 'none'], rail: null });
    const so = canopy(w, 24, 61.5, 0, { kind: 'gable', y: HIGH, half: 3.6, roof: 'roof/seam-green' });
    furnish(w, 26, 60, 0, HIGH, { name: N('central'), face: 0, soffit: so, number: 2, clock: true });
    for (const s of [-1, 1] as const) {
      const so2 = canopy(w, 24, 61.5, s * 12.6, { kind: 'shed', y: HIGH, half: 2, side: s });
      furnish(w, 26, 60, s * 13.4, HIGH, { name: N('central'), face: s > 0 ? -1 : 1, soffit: so2, number: s > 0 ? 4 : 1 });
      fence(b, turn(poseAt(w, 62, s * 14.6, 0), 90), 62, 'concrete');
    }
    const gw = fareGates(b, turn(poseAt(w, 64.5, 0, HIGH), 0), 6, { wide: true });
    for (const s of [-1, 1]) railing(b, 'trim/rail-black', pt(w, (s * gw) / 2, HIGH, 64.5), pt(w, s * 14.4, HIGH, 64.5));
    for (const x of [-11, -9.9]) tvm(b, turn(poseAt(w, 69, x, HIGH), 180), 'blue');
    hung(b, turn(poseAt(w, 63.5, 0, HIGH), 180), R('departures-2'), 4, 3.1, { t: 0.14, rim: 'trim/paint-black' });
    box(b, 'structure/steel-grey', poseAt(w, 63.5, 0, HIGH), [0, 4.05, 0], [3, 0.06, 0.06]);
    for (const x of [-3, 3]) box(b, 'structure/steel-grey', poseAt(w, 63.5, 0, HIGH), [x, 2.05, 0], [0.06, 2.05, 0.06], 'Y');
    const hf = turn(poseAt(w, 76.5, 0, 0), 180);
    podium(b, hf, 32, 12, HIGH, 8);
    stationHouse(b, move(hf, 0, HIGH, 0), { seed: 3, w: 32, d: 12, h: 8, wall: 'wall/stone-limestone', trim: 'trim/paint-bronze', win: 'window/arch-wide-brown', door: 'door/lobby-bronze', roof: 'flat', roofMat: 'roof/flat-gravel', sign: R('entrance-station'), clock: true, band: 'window/band-clerestory' });
  });
  S('tram-stop', '路面電車の停留所 相対式ホーム', (b) => {
    const w = start(b, 40);
    for (const d of [-1.6, 1.6]) tram(sideWay(w, d), 0, 40, { pave: 'asphalt/plain-used-sealed', inner: 'paving/setts-granite' });
    for (const s of [-1, 1] as const) {
      const [x0, x1] = s > 0 ? [3.05, 5.8] : [-5.8, -3.05];
      platform(w, 6, 34, x0, x1, { h: 0.3, track: s > 0 ? [true, false] : [false, true], ends: ['ramp', 'ramp'], rail: null, top: 'paving/basket-grey', edge: R('edge-line-white'), face: R('platform-face-concrete') });
      shelter(b, turn(poseAt(w, 20, s * 4.9, 0.3), -90 * s), { len: 5.4, bench: 'plastic', map: true, frame: 'signal/pole-grey' });
      validator(b, turn(poseAt(w, 13.5, s * 5.2, 0.3), -90 * s));
      postSign(b, turn(poseAt(w, 27, s * 5.2, 0.3), 90), N('palm-ave'), { y: 2.3, posts: 1 });
      railing(b, 'trim/rail-cable', pt(w, s * 5.74, 0.3, 8), pt(w, s * 5.74, 0.3, 32), 1.05);
    }
    tvm(b, turn(poseAt(w, 11, 5.1, 0.3), -90), 'red');
  });
  S('tram-island', '路面電車の停留所 島式ホームと屋根', (b) => {
    const w = start(b, 40);
    for (const d of [-3.1, 3.1]) tram(sideWay(w, d), 0, 40, { pave: 'concrete/road-tined', w: 3.4 });
    platform(w, 6, 34, -1.65, 1.65, { h: 0.3, track: [true, true], ends: ['ramp', 'ramp'], top: 'paving/herringbone-tan', edge: R('edge-line-yellow') });
    const so = canopy(w, 12, 28, 0, { kind: 'butterfly', y: 0.3, clear: 2.9, half: 1.9, steel: 'structure/steel-red', gap: 5 });
    furnish(w, 12, 28, 0, 0.3, { name: N('eastgate', 'black'), face: 0, soffit: so, n: 1 });
    validator(b, poseAt(w, 9, 0, 0.3));
    postSign(b, poseAt(w, 31, 0, 0.3), R('map-system'), { y: 1.5, post: 'signal/pole-black' });
  });
  for (const [id, jp, kind, wallTex] of [['elevated', '高架駅 平屋根', 'flat', 'structure/wall-smooth'], ['elevated-old', '高架駅 古い高架・片流れ屋根', 'shed', 'structure/wall-old']] as [string, string, CanopyKind, string][]) {
    S(id, jp, (b) => {
      const w = start(b, 70);
      const H = 7;
      const up = viaduct(w, 0, 70, H, 8.4, [8, 26, 44, 62], { wall: wallTex });
      tracks(up, 0, 70, [-2, 2], st(kind === 'flat' ? 'station' : 'concrete-stained'), { bed: false });
      for (const s of [-1, 1] as const) {
        const [x0, x1] = s > 0 ? [2 + EDGE, 8.15] : [-8.15, -2 - EDGE];
        platform(up, 6, 64, x0, x1, { track: s > 0 ? [true, false] : [false, true], ends: ['wall', 'wall'], rail: null, face: R('platform-face-block') });
        const so = canopy(up, 12, 58, s * 6, { kind, y: HIGH, half: 2.35, side: s });
        furnish(up, 14, 56, s * 6.9, HIGH, { name: N(kind === 'flat' ? 'civic-center' : 'harbor'), face: s > 0 ? -1 : 1, soffit: so, number: s > 0 ? 1 : 2 });
        // Stair tower beside the viaduct, joined to the platform by a landing over the parapet.
        const top = H + HIGH;
        const xs = s * 9.8;
        const foot = stand(pt(w, xs, 0, 35 - 1.3 - (Math.round(top / 0.17) - 1) * 0.29 - 1.21));
        stairs(b, foot, top, 2.2, { steel: 'structure/steel-green' });
        box(b, 'structure/steel-green', stand(pt(w, s * 9.55, top - 0.12, 35)), [0, 0, 0], [1.45, 0.12, 1.3]);
        box(b, 'concrete/walk-dark', stand(pt(w, s * 9.55, top + 0.005, 35)), [0, 0, 0], [1.45, 0.005, 1.3], 'Y');
        for (const dz of [-1.2, 1.2]) box(b, 'structure/steel-green', stand(pt(w, s * 10.6, 0, 35 + dz)), [0, (top - 0.24) / 2, 0], [0.1, (top - 0.24) / 2, 0.1], 'yY');
        railing(b, 'trim/rail-black', pt(w, s * 8.2, top, 36.3), pt(w, s * 11, top, 36.3));
        railing(b, 'trim/rail-black', pt(w, s * 11, top, 36.3), pt(w, s * 11, top, 33.7));
        railing(b, 'trim/rail-black', pt(up, s * 8.1, HIGH, 6), pt(up, s * 8.1, HIGH, 33.7));
        railing(b, 'trim/rail-black', pt(up, s * 8.1, HIGH, 36.3), pt(up, s * 8.1, HIGH, 64));
        for (const e of [6.06, 63.94]) railing(b, 'trim/rail-black', pt(up, s * (2 + EDGE + 0.9), HIGH, e), pt(up, s * 8.1, HIGH, e));
        tvm(b, turn(stand(pt(w, s * 9.8, 0, 38)), 180), 'blue');
      }
      postSign(b, stand(pt(w, 12.5, 0, 42)), R('logo-transit'), { y: 4, posts: 1, t: 0.1 });
    });
  }

  // --- Station buildings on their own. ---
  const HOUSES: [string, string, HouseOpts][] = [
    ['house-depot', '駅舎 木造 寄棟屋根', { seed: 21, w: 16, d: 7, h: 4, wall: 'wall/siding-yellow', trim: 'trim/paint-brown', win: 'window/sash-tall-white', roof: 'hip', roofMat: 'roof/shingle-brown', over: 2.2, sign: R('entrance-depot'), name: N('eastgate', 'white'), clock: true }],
    ['house-brick', '駅舎 レンガ 切妻屋根', { seed: 22, w: 22, d: 9, h: 5.4, wall: 'wall/brick-red-sooty', trim: 'trim/paint-cream', win: 'window/arch-white', roof: 'gable', roofMat: 'roof/slate-grey', over: 0.6, sign: R('entrance-station'), clock: true }],
    ['house-mission', '駅舎 スタッコ 瓦屋根', { seed: 23, w: 20, d: 8, h: 4.6, wall: 'wall/stucco-cream', trim: 'trim/paint-brown', win: 'window/arch-brown', door: 'door/glass-double-bronze', roof: 'hip', roofMat: 'roof/clay-terracotta', over: 1.6, sign: R('entrance-depot'), name: N('del-mar', 'green') }],
    ['house-modern', '駅舎 モダン 陸屋根と高窓', { seed: 24, w: 24, d: 10, h: 5.4, wall: 'wall/concrete-panel-stained', trim: 'trim/paint-aluminium', win: 'window/picture-aluminium', door: 'door/lobby-aluminium', roof: 'flat', roofMat: 'roof/flat-membrane-dirty', sign: R('entrance-station'), band: 'window/band-clerestory' }],
    ['house-block', '駅舎 小さなブロック造', { seed: 25, w: 9, d: 5, h: 3.2, wall: 'wall/block-beige', trim: 'trim/paint-grey', win: 'window/slider-aluminium-barred', door: 'door/glass-aluminium', roof: 'flat', roofMat: 'roof/flat-bitumen-patched', sign: R('entrance-metro') }],
    ['house-stone', '駅舎 石造 大きな窓', { seed: 26, w: 28, d: 12, h: 9, wall: 'wall/stone-limestone-sooty', trim: 'trim/paint-bronze', win: 'window/arch-wide-brown', door: 'door/lobby-bronze', roof: 'flat', roofMat: 'roof/flat-gravel', sign: R('entrance-station'), clock: true, band: 'window/band-clerestory' }],
  ];
  for (const [id, label, o] of HOUSES) S(id, label, (b) => stationHouse(b, O, o));

  // --- Footbridges. ---
  const BRIDGES: [string, string, BridgeOpts['kind'], string][] = [['open', '跨線橋 手すりのみ', 'open', 'structure/steel-green'], ['truss', '跨線橋 トラス', 'truss', 'structure/steel-green-rusty'], ['closed', '跨線橋 屋根と壁つき', 'closed', 'structure/steel-grey'], ['concrete', '跨線橋 コンクリートと金網', 'concrete', 'structure/steel-grey']];
  for (const [id, label, kind, steel] of BRIDGES) S(`footbridge-${id}`, label, (b) => footbridge(b, O, { x0: -6.5, x1: 6.5, foot: [0, 0], dir: [1, -1], kind, steel }));
  S('footbridge-lift', '跨線橋 エレベーターつき 4線', (b) => footbridge(b, O, { x0: -10.5, x1: 10.5, foot: [0, 0], dir: [1, 1], kind: 'closed', lift: true, steel: 'structure/steel-blue' }));
  S('footbridge-tracks', '跨線橋と複線', (b) => {
    const w = start(b, 30);
    tracks(w, 0, 30, [-2, 2], st('wood'));
    footbridge(b, O, { x0: -6.5, x1: 6.5, foot: [0, 0], dir: [1, -1], kind: 'truss' });
  });

  // --- Subway entrances. ---
  const SUBS: [string, string, SubwayOpts][] = [
    ['rail', '地下鉄入口 鉄柵', { guard: 'rail', sign: R('entrance-subway'), logo: R('logo-metro') }],
    ['wall', '地下鉄入口 石の腰壁', { guard: 'wall', sign: R('entrance-metro') }],
    ['glass', '地下鉄入口 ガラスの囲いと屋根', { guard: 'glass', roof: true, sign: R('entrance-metro'), steel: 'structure/steel-grey', logo: R('logo-metro') }],
    ['glass-open', '地下鉄入口 ガラスの囲い', { guard: 'glass', logo: R('logo-transit'), steel: 'structure/steel-grey', wall: 'wall/tile-cream' }],
    ['kiosk', '地下鉄入口 タイル張りの上屋', { guard: 'kiosk', sign: R('entrance-subway'), wall: 'wall/tile-green' }],
    ['narrow', '地下鉄入口 狭い 屋根つき', { guard: 'rail', roof: true, w: 2, sign: R('entrance-subway'), wall: 'wall/tile-mosaic' }],
    ['wide', '地下鉄入口 幅広', { guard: 'wall', w: 5, sign: R('entrance-metro'), logo: R('logo-metro'), wall: 'wall/tile-blue' }],
  ];
  for (const [id, label, o] of SUBS) S(`subway-${id}`, label, (b) => subwayEntrance(b, stand([0, 0, -4]), o));

  // --- Platform and canopy sections. ---
  const FACES = ['concrete', 'brick', 'block', 'timber'];
  FACES.forEach((fc, i) => {
    const jp = { concrete: 'コンクリート', brick: 'レンガ', block: 'ブロック', timber: '木造' }[fc];
    const top = ['concrete/walk-square-dirty', 'paving/running-red', 'concrete/walk-small', 'paving/boardwalk-grey'][i];
    const edge = R(['edge-line-yellow', 'edge-line-white', 'edge-text-worn', 'edge-plain'][i]);
    S(`platform-low-${fc}`, `ホーム 低 ${jp} 20m`, (b) => platform(way(b, stand([-3, 0, -10])), 0, 20, EDGE, EDGE + 4, { h: LOW, top, edge, face: R(`platform-face-${fc}`), rail: fc === 'timber' ? 'trim/rail-brown' : 'trim/rail-black' }));
    if (fc !== 'timber') S(`platform-high-${fc}`, `ホーム 高 ${jp} 20m`, (b) => platform(way(b, stand([-3, 0, -10])), 0, 20, EDGE, EDGE + 4, { top, edge: R(['edge-text-gap', 'edge-granite', 'edge-line-yellow-worn'][i]), face: R(`platform-face-${fc}`) }));
  });
  S('platform-island-low', '島式ホーム 低 スロープつき', (b) => platform(way(b, stand([0, 0, -10])), 0, 20, -2.6, 2.6, { h: LOW, track: [true, true], ends: ['ramp', 'ramp'] }));
  S('platform-island-high', '島式ホーム 高 スロープつき', (b) => platform(way(b, stand([0, 0, -16])), 12, 32, -2.6, 2.6, { track: [true, true], ends: ['ramp', 'wall'], edge: R('edge-text-gap') }));
  S('platform-track', 'ホームと線路 高', (b) => {
    const w = start(b, 24);
    tracks(w, 0, 24, [0], st('station'));
    platform(w, 0, 24, EDGE, EDGE + 4, { ends: ['none', 'none'] });
  });
  const CANOPIES: [CanopyKind, string, number][] = [['flat', '平屋根', 2.4], ['butterfly', 'バタフライ', 3], ['gable', '切妻 波板', 3], ['shed', '片流れ', 2.2], ['vault', 'かまぼこ', 2.6], ['heritage', '鋳鉄柱と飾り板', 2.8]];
  for (const [kind, jp, half] of CANOPIES) S(`canopy-${kind}`, `ホーム上屋 ${jp} 18m`, (b) => {
    const w = way(b, stand([0, 0, -9]));
    platform(w, 0, 18, -half - 0.6, half + 0.6, { h: LOW, track: [kind !== 'shed', true], ends: ['none', 'none'], rail: null });
    const so = canopy(w, 0, 18, 0, { kind, y: LOW, half });
    hung(b, turn(poseAt(w, 9, kind === 'shed' ? 0.6 : 0, LOW), 90), N('harbor'), so - LOW, 2.7);
  });
}
