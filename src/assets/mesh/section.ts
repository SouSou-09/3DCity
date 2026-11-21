import { Frame, MeshBuilder, Path, Strip, endCap, frameAt, offset, pathLength, slicePath, sweep, v3 } from './builder';

export type LaneKind = 'drive' | 'bus' | 'bike' | 'parking' | 'turn' | 'shoulder' | 'median';
export type MedianKind = 'raised' | 'planted' | 'barrier' | 'painted' | 'pavers' | 'guardrail';
export type EdgeKind = 'none' | 'barrier' | 'parapet' | 'guardrail' | 'railing' | 'fence' | 'wall' | 'bollards' | 'cable';

export interface Lane {
  kind: LaneKind;
  w: number;
  /** 1 = travels along the path, -1 = against it, 0 = neither. */
  dir: 1 | -1 | 0;
  /** Surface texture; defaults to the section's asphalt. */
  tex?: string;
  median?: MedianKind;
  /** Line decal stretched over the lane width (parking ticks, buffers; id without the wear suffix). */
  overlay?: string;
  /** Symbol decals painted in the lane (ids without the wear suffix). */
  symbols?: string[];
}

export interface Side {
  /** Concrete gutter pan between the lanes and the kerb. */
  gutter?: boolean;
  /** Kerb texture id; leave out for no kerb. */
  curb?: string;
  curbH?: number;
  /** Rolled (sloped) kerb instead of a vertical one. */
  rolled?: boolean;
  verge?: { w: number; tex: string };
  walk?: { w: number; tex: string };
  /** Unpaved strip level with the road (when there is no kerb). */
  ground?: { w: number; tex: string };
  edge?: EdgeKind;
  /** Texture for metal edge elements. */
  edgeTex?: string;
  /** Tactile strip along the kerb (bus stops, platforms). */
  tactile?: string;
}

export interface Section {
  lanes: Lane[];
  /** Line decal per lane boundary (lanes.length + 1 entries, ids without the wear suffix). */
  lines: (string | null)[];
  left: Side;
  right: Side;
  asphalt: string;
  /** Paint condition: suffix of the decal ids. */
  paint: 'new' | 'worn' | 'faded';
}

export interface Layout {
  /** Left and right edge of each lane. */
  lanes: { x0: number; x1: number; lane: Lane }[];
  /** Kerb-to-kerb half width (lanes plus gutters). */
  road: [number, number];
  /** Outer edges including pavements. */
  outer: [number, number];
  /** Height of the outer edges above the road. */
  outerY: [number, number];
}

const CURB_W = 0.15;
const GUTTER_W = 0.4;
export const sideWidth = (s: Side): number => (s.gutter ? GUTTER_W : 0) + (s.curb ? CURB_W : 0) + (s.verge?.w ?? 0) + (s.walk?.w ?? 0) + (s.ground?.w ?? 0);
export const roadWidth = (sec: Section): number => sec.lanes.reduce((a, l) => a + l.w, 0);

export function layout(sec: Section): Layout {
  const w = roadWidth(sec);
  let x = -w / 2;
  const lanes = sec.lanes.map((lane) => {
    const x0 = x;
    x += lane.w;
    return { x0, x1: x, lane };
  });
  const gl = sec.left.gutter ? GUTTER_W : 0;
  const gr = sec.right.gutter ? GUTTER_W : 0;
  return {
    lanes,
    road: [-w / 2 - gl, w / 2 + gr],
    outer: [-w / 2 - sideWidth(sec.left), w / 2 + sideWidth(sec.right)],
    outerY: [sec.left.curb ? (sec.left.curbH ?? 0.15) : 0, sec.right.curb ? (sec.right.curbH ?? 0.15) : 0],
  };
}

const isLaneTex = (id: string) => id.includes('/lane-') || id.includes('/coat-');

/** Jersey barrier outline, base centred on x = 0. */
const JERSEY: [number, number][] = [[-0.3, 0], [-0.3, 0.08], [-0.17, 0.3], [-0.1, 0.81], [0.1, 0.81], [0.17, 0.3], [0.3, 0.08], [0.3, 0]];

export interface SweepOpts {
  /** What is under the surface: a slab of earth, a bridge deck, or nothing. */
  body?: 'ground' | 'deck' | 'none';
  /** Structural depth of the deck below the road surface. */
  deckDepth?: number;
  deckTex?: string;
  /** Close the ends of the body. */
  caps?: boolean | [boolean, boolean];
  /** Lane lines and symbols only from this distance on (after a crosswalk). */
  linesFrom?: number;
  linesTo?: number;
  /** Leave out the left or right side (where another piece attaches). */
  noLeft?: boolean;
  noRight?: boolean;
  /** No symbols in the lanes. */
  noSymbols?: boolean;
}

function sideStrips(side: Side, x: number, dir: 1 | -1, strips: Strip[], top: [number, number][]): { x: number; y: number } {
  // Works outwards from the lane edge; dir = +1 for the right side.
  const P = (a: [number, number], b: [number, number]): [number, number][] => (dir === 1 ? [a, b] : [b, a]);
  let y = 0;
  if (side.gutter) {
    strips.push({ material: 'concrete/gutter', pts: P([x, 0], [x + dir * GUTTER_W, 0]), uv: 'along', c: dir === 1 ? [0, GUTTER_W] : [GUTTER_W, 0] });
    x += dir * GUTTER_W;
    top.push([x, 0]);
  }
  if (side.curb) {
    const h = side.curbH ?? 0.15;
    const run = side.rolled ? 0.3 : 0.02;
    const pts: [number, number][] = [[x, 0], [x + dir * run, h], [x + dir * Math.max(CURB_W, run + 0.05), h]];
    strips.push({ material: side.curb, pts: dir === 1 ? pts : [...pts].reverse(), uv: 'along', c: dir === 1 ? [0, 0.25, 0.5] : [0.5, 0.25, 0] });
    top.push([x + dir * run, h]);
    x += dir * Math.max(CURB_W, run + 0.05);
    y = h;
    top.push([x, y]);
  }
  for (const band of [side.ground, side.verge, side.walk]) {
    if (!band) continue;
    strips.push({ material: band.tex, pts: P([x, y], [x + dir * band.w, y]), uv: 'tile', c: dir === 1 ? [0, band.w] : [band.w, 0] });
    if (band === side.walk && side.tactile) {
      const tx = x + dir * 0.1;
      strips.push({ material: side.tactile, layer: 1, pts: P([tx, y], [tx + dir * 0.6, y]), uv: 'tile', c: dir === 1 ? [0, 0.6] : [0.6, 0] });
    }
    x += dir * band.w;
    top.push([x, y]);
  }
  return { x, y };
}

/** The same road seen from its other end: traffic directions flip and the sides swap. */
export function reversed(sec: Section): Section {
  const flip = (d: Lane['dir']): Lane['dir'] => (d === 1 ? -1 : d === -1 ? 1 : 0);
  return { ...sec, lanes: [...sec.lanes].reverse().map((l) => ({ ...l, dir: flip(l.dir) })), lines: [...sec.lines].reverse(), left: sec.right, right: sec.left };
}

/** Posts or other repeated items along a path at sideways offset x. */
export function along(path: Path, spacing: number, fn: (f: Frame, i: number) => void, inset = spacing / 2): void {
  const s0 = path[0].s;
  const L = pathLength(path) - s0;
  const n = Math.max(1, Math.round((L - inset * 2) / spacing));
  for (let i = 0; i <= n; i++) fn(frameAt(path, s0 + inset + ((L - inset * 2) * i) / n), i);
}

/** Barrier, railing, fence... standing at offset x, height y. `dir` points away from the road. */
export function edgeElement(b: MeshBuilder, path: Path, kind: EdgeKind, x: number, y: number, dir: 1 | -1, tex = 'structure/steel-galvanized'): void {
  const side = (pts: [number, number][]): [number, number][] => (dir === 1 ? pts : pts.map(([px, py]) => [-px, py] as [number, number]).reverse());
  const at = (pts: [number, number][]): [number, number][] => side(pts).map(([px, py]) => [x + px, y + py]);
  if (kind === 'barrier') {
    sweep(b, path, [{ material: 'structure/barrier', pts: at(JERSEY.map(([px, py]) => [px - 0.3, py])), uv: 'along' }]);
  } else if (kind === 'parapet') {
    sweep(b, path, [{ material: 'structure/barrier', pts: at([[-0.3, 0], [-0.3, 0.95], [-0.05, 0.95], [-0.05, -0.2]]), uv: 'along' }]);
  } else if (kind === 'wall') {
    sweep(b, path, [{ material: 'structure/wall-smooth', pts: at([[-0.35, 0], [-0.35, 2.6], [0, 2.6], [0, -0.3]]), uv: 'along' }]);
  } else if (kind === 'guardrail') {
    // W-beam on steel posts.
    const cx = x - dir * 0.25;
    const w: [number, number][] = [[0, 0.5], [0.04, 0.56], [0, 0.62], [0.04, 0.68], [0, 0.74], [0.04, 0.8], [0, 0.86]];
    const face = w.map(([px, py]) => [cx - dir * (0.06 + px), y + py] as [number, number]);
    sweep(b, path, [{ material: tex, pts: dir === 1 ? [...face].reverse() : face, uv: 'along' }, { material: tex, pts: dir === 1 ? face : [...face].reverse(), uv: 'along' }]);
    along(path, 2, (f) => b.box('structure/steel-galvanized', offset(f, cx, y + 0.4), [0.04, 0.45, 0.06], f.r, f.u, f.t, 'Y'));
  } else if (kind === 'railing' || kind === 'fence') {
    const h = kind === 'fence' ? 1.8 : 1.1;
    const cx = x - dir * 0.12;
    const rails = kind === 'fence' ? [0.1, h] : [0.12, h * 0.55, h];
    for (const ry of rails) sweep(b, path, [{ material: tex, pts: [[cx - 0.03, y + ry - 0.03], [cx - 0.03, y + ry + 0.03], [cx + 0.03, y + ry + 0.03], [cx + 0.03, y + ry - 0.03], [cx - 0.03, y + ry - 0.03]], uv: 'along' }]);
    along(path, kind === 'fence' ? 2.5 : 1.8, (f) => b.box(tex, offset(f, cx, y + h / 2), [0.035, h / 2, 0.035], f.r, f.u, f.t, 'Y'));
    // Pickets (railing) or mesh panel stand-ins (fence).
    along(path, kind === 'fence' ? 0.25 : 0.15, (f) => b.box(tex, offset(f, cx, y + (rails[0] + h) / 2), [0.008, (h - rails[0]) / 2, 0.008], f.r, f.u, f.t, 'yY'), 0.1);
  } else if (kind === 'bollards') {
    along(path, 1.6, (f) => {
      b.tube(tex, offset(f, x - dir * 0.3, y), offset(f, x - dir * 0.3, y + 0.9), 0.07, 8);
      b.tube(tex, offset(f, x - dir * 0.3, y + 0.9), offset(f, x - dir * 0.3, y + 0.96), 0.07, 8, 0.02);
    });
  } else if (kind === 'cable') {
    const cx = x - dir * 0.2;
    for (const ry of [0.45, 0.6, 0.75]) sweep(b, path, [{ material: tex, pts: [[cx - 0.012, y + ry], [cx, y + ry + 0.012], [cx + 0.012, y + ry], [cx, y + ry - 0.012], [cx - 0.012, y + ry]], uv: 'along' }]);
    along(path, 3, (f) => b.box(tex, offset(f, cx, y + 0.42), [0.03, 0.42, 0.03], f.r, f.u, f.t, 'Y'));
  }
}

/** Builds a road along a path from its cross-section. Returns the lane layout for placing extras. */
export function sweepSection(b: MeshBuilder, path: Path, sec: Section, opts: SweepOpts = {}): Layout {
  const lay = layout(sec);
  const strips: Strip[] = [];
  const top: [number, number][] = [];
  const L = pathLength(path);
  const from = opts.linesFrom ?? 0;
  const to = opts.linesTo ?? L;
  const marks: Strip[] = [];
  const edges: (() => void)[] = [];

  // Left side, built outwards then reversed so that the outline runs left to right.
  const leftTop: [number, number][] = [];
  let lo = { x: lay.lanes[0].x0, y: 0 };
  if (!opts.noLeft) lo = sideStrips(sec.left, lay.lanes[0].x0, -1, strips, leftTop);
  top.push(...leftTop.reverse(), [lay.lanes[0].x0, 0]);

  for (const { x0, x1, lane } of lay.lanes) {
    const tex = lane.tex ?? sec.asphalt;
    const w = x1 - x0;
    if (lane.kind === 'median' && (lane.median === 'raised' || lane.median === 'planted')) {
      const h = 0.15;
      strips.push({ material: 'curb/plain', pts: [[x0, 0], [x0 + 0.02, h], [x0 + CURB_W, h]], uv: 'along', c: [0, 0.25, 0.5] });
      strips.push({ material: lane.median === 'planted' ? (lane.tex ?? 'ground/grass-lush') : (lane.tex ?? 'concrete/walk-plain'), pts: [[x0 + CURB_W, h], [x1 - CURB_W, h]], uv: 'tile' });
      strips.push({ material: 'curb/plain', pts: [[x1 - CURB_W, h], [x1 - 0.02, h], [x1, 0]], uv: 'along', c: [0.5, 0.25, 0] });
      top.push([x0 + 0.02, h], [x1 - 0.02, h], [x1, 0]);
      continue;
    }
    const fit = isLaneTex(tex);
    const texW = fit ? 3.5 : w;
    strips.push({ material: tex, pts: [[x0, 0], [x1, 0]], uv: 'tile', c: fit ? [0, texW] : [x0, x1], flip: fit && lane.dir === -1 });
    top.push([x1, 0]);
    const cx = (x0 + x1) / 2;
    if (lane.kind === 'median') {
      if (lane.median === 'painted') marks.push({ material: `line/median-hatch-yellow-${sec.paint}`, layer: 2, pts: [[x0, 0], [x1, 0]], uv: 'tile', c: [0, 1.8] });
      else if (lane.median === 'barrier') edges.push(() => sweep(b, path, [{ material: 'structure/barrier', pts: JERSEY.map(([px, py]) => [cx + px, py] as [number, number]), uv: 'along' }]));
      else if (lane.median === 'guardrail') {
        edges.push(() => edgeElement(b, path, 'guardrail', cx + 0.2, 0, 1));
        edges.push(() => edgeElement(b, path, 'guardrail', cx - 0.2, 0, -1));
      }
    }
    if (lane.kind === 'turn' && lane.dir === 0) marks.push({ material: `line/turn-lane-yellow-${sec.paint}`, layer: 2, pts: [[cx - 1.8, 0], [cx + 1.8, 0]], uv: 'tile', c: [0, 3.6] });
    if (lane.overlay) marks.push({ material: `${lane.overlay}-${sec.paint}`, layer: 2, pts: [[x0, 0], [x1, 0]], uv: 'tile', c: lane.dir === -1 ? [b.part(`${lane.overlay}-${sec.paint}`, 2).mw, 0] : [0, b.part(`${lane.overlay}-${sec.paint}`, 2).mw] });
    if (lane.symbols && !opts.noSymbols) {
      // Symbols repeat along the lane, facing the direction of travel.
      const spacing = 24;
      let k = 0;
      for (let s = from + 3; s + 6 < to; s += spacing) {
        const id = `${lane.symbols[k++ % lane.symbols.length]}-${sec.paint === 'faded' ? 'worn' : sec.paint}`;
        const part = b.part(id, 3);
        const sw = Math.min(part.mw, w - 0.3);
        const len = part.mh * (sw / part.mw);
        marks.push({ material: id, layer: 3, pts: [[cx - sw / 2, 0], [cx + sw / 2, 0]], uv: 'tile', c: [0, part.mw], fitTo: lane.dir === -1 ? [s, s + len] : [s, s + len], flip: lane.dir === -1 });
      }
    }
  }
  let ro = { x: lay.lanes[lay.lanes.length - 1].x1, y: 0 };
  if (!opts.noRight) ro = sideStrips(sec.right, ro.x, 1, strips, top);

  sweep(b, path, strips);

  // Lane lines.
  const linePath = from > 0 || to < L ? slicePath(path, from, to) : path;
  sec.lines.forEach((id, i) => {
    if (!id) return;
    const x = i < lay.lanes.length ? lay.lanes[i].x0 : lay.lanes[i - 1].x1;
    const mat = `${id}-${sec.paint}`;
    const w = b.part(mat, 2).mw;
    // Edge lines sit just inside the carriageway.
    const cx = i === 0 ? x + w * 0.5 - 0.05 : i === lay.lanes.length ? x - w * 0.5 + 0.05 : x;
    sweep(b, linePath, [{ material: mat, layer: 2, pts: [[cx - w / 2, 0], [cx + w / 2, 0]], uv: 'tile', c: [0, w] }]);
  });
  for (const m of marks) {
    if (m.fitTo) sweep(b, slicePath(path, m.fitTo[0], m.fitTo[1]), [m]);
    else sweep(b, linePath, [m]);
  }
  for (const e of edges) e();
  if (!opts.noLeft && sec.left.edge && sec.left.edge !== 'none') edgeElement(b, path, sec.left.edge, lo.x, lo.y, -1, sec.left.edgeTex);
  if (!opts.noRight && sec.right.edge && sec.right.edge !== 'none') edgeElement(b, path, sec.right.edge, ro.x, ro.y, 1, sec.right.edgeTex);

  // Body under the surface.
  const body = opts.body ?? 'ground';
  if (body !== 'none') {
    const xl = top[0][0];
    const xr = top[top.length - 1][0];
    const yl = top[0][1];
    const yr = top[top.length - 1][1];
    const caps = Array.isArray(opts.caps) ? opts.caps : [opts.caps ?? true, opts.caps ?? true];
    if (body === 'ground') {
      const d = 0.4;
      sweep(b, path, [
        { material: 'ground/dirt', pts: [[xl, -d], [xl, yl]], uv: 'along' },
        { material: 'ground/dirt', pts: [[xr, yr], [xr, -d]], uv: 'along' },
        { material: 'ground/dirt', pts: [[xr, -d], [xl, -d]], uv: 'tile' },
      ]);
      if (caps[0]) endCap(b, 'ground/dirt', path[0], top, () => -d, false);
      if (caps[1]) endCap(b, 'ground/dirt', path[path.length - 1], top, () => -d, true);
    } else {
      const tex = opts.deckTex ?? 'structure/deck-underside';
      const d = opts.deckDepth ?? 1.4;
      const fascia = 0.35;
      const over = Math.min(1.6, (xr - xl) * 0.18);
      // Slab edge, cantilever, then the girder box.
      const under: [number, number][] = [[xr, yr], [xr, -fascia], [xr - over, -fascia - 0.15], [xr - over - 0.4, -d], [xl + over + 0.4, -d], [xl + over, -fascia - 0.15], [xl, -fascia], [xl, yl]];
      sweep(b, path, [{ material: tex, pts: under, uv: 'along' }]);
      const bottom = (x: number): number => {
        for (let i = 1; i + 1 < under.length; i++) {
          const [ax, ay] = under[i + 1];
          const [bx, by] = under[i];
          if (x >= ax - 1e-9 && x <= bx + 1e-9) return bx - ax < 1e-9 ? Math.min(ay, by) : ay + ((by - ay) * (x - ax)) / (bx - ax);
        }
        return -d;
      };
      // Outline points at the breaks of the underside keep the cap watertight.
      const capTop: [number, number][] = [];
      const breaks = [xl + over, xl + over + 0.4, xr - over - 0.4, xr - over];
      for (let i = 0; i + 1 < top.length; i++) {
        capTop.push(top[i]);
        const [x0, y0] = top[i];
        const [x1, y1] = top[i + 1];
        for (const bx of breaks) if (bx > x0 + 1e-6 && bx < x1 - 1e-6) capTop.push([bx, y0 + ((y1 - y0) * (bx - x0)) / (x1 - x0)]);
      }
      capTop.push(top[top.length - 1]);
      capTop.sort((p, q) => p[0] - q[0]);
      if (caps[0]) endCap(b, tex, path[0], capTop, bottom, false);
      if (caps[1]) endCap(b, tex, path[path.length - 1], capTop, bottom, true);
    }
  }
  return lay;
}

/** A decal band across the road between two distances (crosswalks, stop lines). */
export function crossBand(b: MeshBuilder, path: Path, material: string, s0: number, s1: number, x0: number, x1: number, layer = 2): void {
  const part = b.part(material, layer);
  // Whole number of repeats so that stripes are not cut at the kerb.
  const reps = Math.max(1, Math.round((x1 - x0) / part.mw));
  sweep(b, slicePath(path, s0, s1), [{ material, layer, pts: [[x0, 0], [x1, 0]], uv: 'tile', c: [0, reps * part.mw], fitTo: [s0, s1] }]);
}

/** A single decal lying on the road, centred at sideways offset x, starting at distance s. */
export function stamp(b: MeshBuilder, path: Path, material: string, s: number, x: number, opts: { width?: number; flip?: boolean; layer?: number; y?: number } = {}): void {
  const layer = opts.layer ?? 3;
  const part = b.part(material, layer);
  const w = opts.width ?? part.mw;
  const len = part.mh * (w / part.mw);
  const y = opts.y ?? 0;
  sweep(b, slicePath(path, s, s + len), [{ material, layer, pts: [[x - w / 2, y], [x + w / 2, y]], uv: 'tile', c: [0, part.mw], fitTo: [s, s + len], flip: opts.flip }]);
}

export { v3 };
