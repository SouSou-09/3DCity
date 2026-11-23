import { ironFence, masonry, mesh, panel } from '../assets/mesh/boundaries';
import { MeshBuilder, ModelData, V3 } from '../assets/mesh/builder';
import { HOUSE_PLANS } from '../assets/mesh/houses';
import { Pose, at as poseAt, box } from '../assets/mesh/kit';
import { MODELS } from '../assets/mesh/registry';
import { layout } from '../assets/mesh/section';
import { Vec2 } from '../core/vec2';
import { DistrictType } from '../gen/districts';
import { LandUse, Lot } from '../gen/landuse';
import { waterDistAt } from '../gen/terrain';
import { bbox, facing, FREE, hash, LOT, ROAD, Site, SITE_CELL, USED, WATER } from './site';
import { Waterfront } from './waterfront';

/** One building standing on a lot. */
export interface Building {
  lot: number;
  use: LandUse;
  model: string;
  /** Middle of its footprint on the map, and the half sizes of that footprint across and along its depth. */
  x: number;
  y: number;
  hx: number;
  hz: number;
  /** Turns the model's +x axis to (cos, sin) on the map; its front (+z) looks at the road. */
  yaw: number;
  /** Height of its ground floor, and the lowest and highest ground under it. */
  floor: number;
  ground: [number, number];
  /** Distance of its front from the lot's front line. */
  setback: number;
  /** The building the lot is for, rather than a shed or a second block behind it. */
  main: boolean;
  /** Stands wall to wall with its neighbours. */
  party: boolean;
  /** What a public building is: 'school', 'fire' and so on. */
  civic?: string;
}

export interface ParkSpot {
  x: number;
  y: number;
  h: number;
  yaw: number;
  lot: number;
  kind: 'stall' | 'drive';
}

export interface Buildings {
  list: Building[];
  tiles: ModelData[];
  /** Outline of each lot's plot, by lot: the lot with the open ground behind it that goes with it. Null for a lot that is left alone. */
  plots: (Vec2[] | null)[];
  /** Which lot (+1) each cell of the site grid behind the lots has gone to. */
  owner: Int32Array;
  /** Lots that should have a building and have none: nothing in the catalogue fits them. */
  vacant: number[];
  /** Industrial lots too small for a shed, laid out as open storage yards. */
  yards: number[];
  /** Metres of fence and wall built round house and shop lots. */
  fence: number;
  /** Each piece of that fence, end to end on the map: [ax, ay, bx, by]. */
  runs: [number, number, number, number][];
  /** Garden sheds and washing lines behind the houses. */
  sheds: number;
  /** Garages standing on their own at the head of a drive. */
  garages: number;
  /** Lengths of hedge along the side of a front garden. */
  hedges: number;
  lines: number;
  /** Paved terraces behind the houses. */
  patios: number;
  /**
   * Lots whose ground is not garden: [ox, oy, nx, ny, to], hard surface from the street to `to` metres into the lot
   * (measured from (ox, oy) along (nx, ny)), and whatever the use keeps as garden only behind that.
   */
  hard: Map<number, [number, number, number, number, number]>;
  /** Marked parking spaces. */
  stalls: number;
  /** Where a car may stand off the street: each marked space and the drives of the houses. `yaw` is the way a car driven in forwards faces. */
  spots: ParkSpot[];
  /** Buildings per use, and public buildings per kind. */
  count: Partial<Record<LandUse, number>>;
  civic: Record<string, number>;
}

/** A lot seen from its road: u runs along the front (left to right for someone looking in), v into the lot. */
interface Frame {
  lot: Lot;
  type: DistrictType;
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  w: number;
  /** Depth of the nearer rear corner, and where the front line is at its deepest (a road that bends into the lot). */
  d: number;
  v0: number;
  /** u of the rear corners. */
  ua: number;
  ub: number;
  /** Width of the strip between the lot and the back of the pavement. */
  gap: number;
  yaw: number;
  /** +1 where the model's +x runs along +u. */
  sx: 1 | -1;
  va: number;
  vb: number;
  /** Depth of the rear corners of the lot as it was laid out, before it took in the open ground behind it. */
  va0: number;
  vb0: number;
  /** Outline of the plot: the lot and the ground behind it that goes with it. */
  poly: Vec2[];
  /** Rectangles already taken on the lot, in (u, v), and those of them that are buildings. */
  taken: Rect[];
  solid: Rect[];
}

type Rect = [u0: number, u1: number, v0: number, v1: number];

const TILE = 800;
const PATIOS = ['concrete/walk-square', 'paving/running-red', 'paving/basket-tan', 'paving/slabs-sandstone', 'concrete/walk-exposed'];
const HAS = (id: string): boolean => MODELS.some((m) => m.id === id);
const BOARDS = ['coffee', 'lunch', 'open', 'sale', 'pizza', 'happy', 'donut', 'ramen', 'burger', 'barber', 'flowers', 'books'].filter((x) => HAS(`prop/board-${x}`));
const FLAGS = ['red', 'yellow', 'blue', 'green', 'orange', 'white'].filter((x) => HAS(`prop/flag-${x}`));
const CRATES = ['yellow', 'red', 'green', 'blue', 'grey', 'black'].filter((x) => HAS(`prop/crates-${x}`));
const CARTONS = MODELS.filter((m) => m.id.startsWith('prop/cartons-')).map((m) => m.id.slice(13));
const SETS = new Set(MODELS.filter((m) => m.id.startsWith('prop/set-')).map((m) => m.id.slice(9)));
/** The rooms that are fitted out, as models to stand inside their buildings. */
const FITTED = new Set(MODELS.filter((m) => m.id.startsWith('prop/interior-')).map((m) => m.id));
const STEP = 0.17;

/** Families of the catalogue with their models' footprints, looked up once. */
interface Shape {
  id: string;
  w: number;
  d: number;
  h: number;
}
const shapes = new Map<string, Shape[]>();
function family(prefix: string): Shape[] {
  let list = shapes.get(prefix);
  if (!list) {
    const numbered = new RegExp(`^${prefix}-\\d+$`);
    list = named(...MODELS.filter((m) => numbered.test(m.id)).map((m) => m.id));
    if (!list.length) throw new Error(`no models ${prefix}`);
    shapes.set(prefix, list);
  }
  return list;
}
function named(...ids: string[]): Shape[] {
  return ids.map((id) => {
    const { min, max } = bbox(id);
    return { id, w: max[0] - min[0], d: max[2] - min[2], h: max[1] };
  });
}

/** Buildings whose ground floor is open, so that the ground may not rise into it. */
const OPEN = /^(apartment\/dingbat|shop\/gas|office\/carpark|apartment\/motel|civic\/fire)/;

function inPoly(poly: Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function edgeDist(poly: Vec2[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[j], poly[i]];
    const [vx, vy] = [b.x - a.x, b.y - a.y];
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - vx * t, y - a.y - vy * t));
  }
  return best;
}

const ZINC = 'structure/steel-galvanized';
const SHED_WALLS = ['wall/siding-white-peeling', 'wall/siding-green', 'wall/siding-grey', 'wall/siding-red', 'wall/siding-cream', 'wall/metal-ribbed-galvanized', 'site/fence-board-weathered', 'site/fence-board-cedar'];
const GARAGE_ROOFS = ['roof/shingle-charcoal', 'roof/shingle-grey', 'roof/shingle-brown', 'roof/shingle-charcoal', 'roof/shingle-green', 'roof/shingle-red'];
const GARAGE_DOORS = ['door/garage-white', 'door/garage-white', 'door/garage-cream', 'door/garage-brown', 'door/garage-grey', 'door/garage-green', 'door/garage-charcoal'];
const SHED_ROOFS = ['roof/corrugated-galvanized', 'roof/corrugated-rusty', 'roof/corrugated-galvanized'];
const WASHING = ['trim/paint-white', 'trim/paint-white', 'trim/paint-white-old', 'trim/awning-navy', 'trim/awning-red', 'trim/awning-green', 'trim/paint-tan', 'trim/awning-burgundy'];
type FenceFn = (b: MeshBuilder, f: Pose, len: number) => void;
/** A fence as a run of its texture between plain posts: there are hundreds of kilometres of it, so each piece is a few triangles. */
const light = (tex: string, post: string, y0 = 0): FenceFn => (b, f, len) => {
  const h = b.part(tex).mh;
  panel(b, tex, f, 0, len, y0, h);
  const n = Math.max(1, Math.round(len / 6));
  for (let i = 0; i < n; i++) box(b, post, f, [(len * i) / n, (y0 + h + 0.04) / 2, -0.05], [0.045, (y0 + h + 0.04) / 2, 0.045], 'yY');
};
/** Chain link in the same few triangles: the mesh, square posts and a top rail. */
const wire = (h: number): FenceFn => (b, f, len) => {
  mesh(b, 'trim/chainlink', f, 0, len, 0.04, h - 0.04);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i < n; i++) box(b, ZINC, f, [(len * i) / n, (h + 0.06) / 2, 0], [0.028, (h + 0.06) / 2, 0.028], 'yY');
  box(b, ZINC, f, [len / 2, h, 0], [len / 2, 0.02, 0.02], 'xX');
};
/** Fences and walls between plots, built to the length of each run. */
const FENCES: Record<string, FenceFn> = {
  cedar: light('site/fence-board-cedar', 'signal/pole-wood'),
  weathered: light('site/fence-board-weathered', 'signal/pole-wood-grey'),
  redwood: light('site/fence-board-redwood', 'signal/pole-wood'),
  brown: light('site/fence-board-brown', 'trim/paint-brown-old'),
  white: light('site/fence-board-white', 'trim/paint-white-old'),
  vinyl: light('site/fence-vinyl-white', 'trim/paint-white', 0.05),
  vinylTan: light('site/fence-vinyl-tan', 'trim/paint-tan', 0.05),
  chain: wire(1.2),
  chainTall: wire(1.8),
  block: (b, f, l) => masonry(b, f, l, 'wall/block-grey', { cap: 'structure/wall-old' }),
  blockWhite: (b, f, l) => masonry(b, f, l, 'wall/block-white', { h: 1.5, cap: 'trim/paint-white-old' }),
  stucco: (b, f, l) => masonry(b, f, l, 'wall/stucco-white-stained', { ridge: 'roof/clay-terracotta', t: 0.3 }),
  stuccoPeach: (b, f, l) => masonry(b, f, l, 'wall/stucco-peach', { h: 1.6, t: 0.25, cap: 'wall/stucco-peach' }),
  brick: (b, f, l) => masonry(b, f, l, 'wall/brick-red'),
  // Low ones for the front of a plot.
  picket: light('site/fence-picket-white', 'trim/paint-white', 0.03),
  picketOld: light('site/fence-picket-peeling', 'trim/paint-white-old', 0.03),
  picketWood: light('site/fence-picket-natural', 'signal/pole-wood', 0.03),
  hoop: light('site/fence-iron-hoop', 'structure/steel-black', 0.03),
  iron: light('site/fence-iron-flat', 'structure/steel-black', 0.03),
  ironBrick: (b, f, l) => ironFence(b, f, l, 'site/fence-iron-spear', { pier: 'wall/brick-brown', base: 'wall/brick-brown' }),
  lowBlock: (b, f, l) => masonry(b, f, l, 'wall/block-white', { h: 0.9, cap: 'trim/paint-white-old' }),
  lowStucco: (b, f, l) => masonry(b, f, l, 'wall/stucco-cream', { h: 0.9, t: 0.25, cap: 'wall/stucco-cream' }),
  lowBrick: (b, f, l) => masonry(b, f, l, 'wall/brick-brown', { h: 0.8 }),
};
const BACK_FENCE: Record<DistrictType, string[]> = {
  suburb: ['cedar', 'cedar', 'redwood', 'vinyl', 'vinylTan', 'brown', 'weathered', 'block'],
  residential: ['cedar', 'weathered', 'weathered', 'chain', 'brown', 'redwood', 'white', 'block'],
  oldtown: ['weathered', 'chain', 'brick', 'block', 'brown'],
  beach: ['blockWhite', 'stucco', 'white', 'vinyl', 'weathered'],
  hills: ['stucco', 'stuccoPeach', 'redwood', 'block', 'cedar'],
  industrial: ['chain', 'chainTall', 'weathered'],
  midtown: ['weathered', 'chain', 'brick', 'block'],
  downtown: ['brick', 'chainTall', 'block'],
};
const FRONT_FENCE: Record<DistrictType, string[]> = {
  suburb: ['picket', 'lowBrick', 'hoop'],
  residential: ['picket', 'picketOld', 'picketWood', 'chain', 'hoop', 'lowBlock'],
  oldtown: ['iron', 'ironBrick', 'hoop', 'picketOld', 'lowBrick'],
  beach: ['lowBlock', 'lowStucco', 'picket', 'picketWood'],
  hills: ['lowStucco', 'ironBrick', 'lowBrick'],
  industrial: ['chain'],
  midtown: ['iron', 'hoop', 'lowBrick'],
  downtown: ['iron'],
};
/** How often a house plot has a fenced back yard and a fence along the street. */
const FENCED: Record<DistrictType, [back: number, front: number]> = {
  suburb: [0.85, 0.06], residential: [0.9, 0.28], oldtown: [0.8, 0.45], beach: [0.75, 0.35], hills: [0.4, 0.3], industrial: [0.6, 0.25], midtown: [0.8, 0.4], downtown: [0.6, 0.3],
};

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
/** How far the coping of a terraced house stands out past its side wall, m. */
const ROW_TRIM = 0.03;

interface Opt {
  stretch?: number;
  party?: boolean;
  /** How far the trim at each side may run into the neighbour's, where the side walls themselves touch. */
  lap?: number;
  main?: boolean;
  civic?: string;
  maxRelief?: number;
  /** u of the door, where it is known: the floor is level with the ground there. */
  doorU?: number;
  /** A point the floor must be level with, as a garage door is with its drive. */
  level?: [number, number];
}

export function placeBuildings(site: Site, shore: Waterfront): Buildings {
  const { city, roads } = site;
  const land = city.land;
  const seed = site.seed;
  const rnd = (...v: number[]): number => hash(seed, 7717, ...v);
  const out: Buildings = { list: [], tiles: [], plots: [], owner: new Int32Array(0), vacant: [], yards: [], fence: 0, runs: [], sheds: 0, garages: 0, hedges: 0, lines: 0, spots: [], hard: new Map(), patios: 0, stalls: 0, count: {}, civic: {} };
  const sand = new Set(shore.sandLots);
  const builders = new Map<string, MeshBuilder>();
  const tile = (x: number, y: number): MeshBuilder => {
    const k = `${Math.floor(x / TILE)},${Math.floor(y / TILE)}`;
    let b = builders.get(k);
    if (!b) builders.set(k, (b = new MeshBuilder()));
    return b;
  };

  // --- The lot as its road sees it ---
  const gapOf = (lot: Lot, x: number, y: number): number => {
    const line = roads.lines[lot.edge];
    if (!line) return 0;
    let [best, off] = [Infinity, 0];
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      const [vx, vy] = [b[0] - a[0], b[2] - a[2]];
      const l = Math.hypot(vx, vy) || 1;
      const t = clamp(((x - a[0]) * vx + (y - a[2]) * vy) / (l * l), 0, 1);
      const d = Math.hypot(x - a[0] - vx * t, y - a[2] - vy * t);
      if (d < best) [best, off] = [d, ((x - a[0]) * -vy + (y - a[2]) * vx) / l];
    }
    const lay = layout(roads.sections[lot.edge]);
    return best - (off > 0 ? lay.outer[1] : -lay.outer[0]);
  };
  const frameOf = (lot: Lot): Frame | null => {
    const nf = lot.front;
    if (nf < 2 || lot.poly.length < nf + 2) return null;
    const [f0, f1, b, a] = [lot.poly[0], lot.poly[nf - 1], lot.poly[nf], lot.poly[nf + 1]];
    const w = Math.hypot(f1.x - f0.x, f1.y - f0.y);
    if (w < 3) return null;
    const [tx, ty] = [(f1.x - f0.x) / w, (f1.y - f0.y) / w];
    const [ox, oy] = [(f0.x + f1.x) / 2, (f0.y + f1.y) / 2];
    let [nx, ny] = [-ty, tx];
    if (((a.x + b.x) / 2 - ox) * nx + ((a.y + b.y) / 2 - oy) * ny < 0) [nx, ny] = [-nx, -ny];
    const uv = (p: Vec2): [number, number] => [(p.x - ox) * tx + (p.y - oy) * ty, (p.x - ox) * nx + (p.y - oy) * ny];
    const [ua, va] = uv(a);
    const [ub, vb] = uv(b);
    if (va < 4 || vb < 4) return null;
    let v0 = 0;
    for (let i = 0; i < nf; i++) v0 = Math.max(v0, uv(lot.poly[i])[1]);
    const yaw = facing({ x: -nx, y: -ny });
    const ex = Site.local(0, 0, yaw, 1, 0);
    // A lot whose front line is on the pavement starts behind it.
    const gap = gapOf(lot, ox, oy);
    if (gap < 0) v0 = Math.max(v0, 0.2 - gap);
    return { lot, type: lot.site.type, ox, oy, tx, ty, nx, ny, w, d: Math.min(va, vb), v0, ua, ub, va, vb, va0: va, vb0: vb, poly: lot.poly, gap: clamp(gap, 0, 8), yaw, sx: ex.x * tx + ex.y * ty > 0 ? 1 : -1, taken: [], solid: [] };
  };
  /**
   * Open ground behind a lot goes with it: blocks are deeper than two rows of lots, and what is left in the middle is
   * back yards and service yards, not waste. A lot takes what lies straight behind it, half of it where another lot backs on to the same ground.
   */
  const owner = new Int32Array(site.n * site.n);
  const cellOf = (x: number, y: number): number => {
    const [i, j] = [Math.floor(x / SITE_CELL), Math.floor(y / SITE_CELL)];
    return i < 0 || j < 0 || i >= site.n || j >= site.n ? -1 : j * site.n + i;
  };
  const tn = city.terrain.n;
  /** The lot the land map gives a point to, -1 where it gives it to none. */
  const lotAt = (x: number, y: number): number => {
    const [i, j] = [Math.floor(x / land.cell), Math.floor(y / land.cell)];
    return i < 0 || j < 0 || i >= land.n || j >= land.n ? -1 : land.grid[j * land.n + i] - 1;
  };
  /**
   * A house plot on a slope is a platform cut into the hill and filled out from it, a step up or down from the next:
   * the vertices of the ground inside the plot come to the height of the ground where the house will front, as far
   * back as a bank of 5 m will take it. The ground beside the road is the road's and stays.
   */
  const terrace = (f: Frame): void => {
    const cell = city.terrain.cell;
    const xs = f.poly.map((p) => p.x);
    const ys = f.poly.map((p) => p.y);
    const v = Math.min(f.d - 6, Math.max(0, f.v0) + 9);
    const h = ground(f, 0, v);
    const nodes: number[] = [];
    let [lo, hi] = [Infinity, -Infinity];
    for (let j = Math.max(1, Math.ceil(Math.min(...ys) / cell)); j <= Math.min(tn - 2, Math.floor(Math.max(...ys) / cell)); j++)
      for (let i = Math.max(1, Math.ceil(Math.min(...xs) / cell)); i <= Math.min(tn - 2, Math.floor(Math.max(...xs) / cell)); i++) {
        const [x, y] = [i * cell, j * cell];
        const k = j * tn + i;
        if (!inPoly(f.poly, x, y)) continue;
        const id = lotAt(x, y);
        const c = cellOf(x, y);
        if (id >= 0 ? id !== f.lot.id : owner[c] !== f.lot.id + 1) continue;
        [lo, hi] = [Math.min(lo, site.ground[k]), Math.max(hi, site.ground[k])];
        if ((x - f.ox) * f.nx + (y - f.oy) * f.ny > v + 22 || Math.abs(site.ground[k] - h) > 5) continue;
        let clear = true;
        for (let dy = -cell; dy <= cell && clear; dy += SITE_CELL)
          for (let dx = -cell; dx <= cell; dx += SITE_CELL) {
            const q = cellOf(x + dx, y + dy);
            const code = q < 0 ? ROAD : site.grid[q];
            if (code !== FREE && code !== LOT) {
              clear = false;
              break;
            }
          }
        if (clear) nodes.push(k);
      }
    if (hi - lo < 1.5) return;
    for (const k of nodes) site.ground[k] = h;
  };
  const sandy = (x: number, y: number): boolean => shore.sand[clamp(Math.round(y / city.terrain.cell), 0, tn - 1) * tn + clamp(Math.round(x / city.terrain.cell), 0, tn - 1)] > 0.15;
  const extend = (f: Frame): void => {
    const rear = (c: number, k: number): Vec2 => at(f, f.ua + (f.ub - f.ua) * c, f.va + (f.vb - f.va) * c + k);
    // A back garden does not run on for ever: what lies deeper in the block than this is left as the wood or the common behind the fences.
    const most = f.lot.use === 'R1' || f.lot.use === 'R2' ? (f.type === 'suburb' || f.type === 'hills' ? 16 : 12) : 25;
    /** How far the ground behind one point of the rear line is free, and what ends it. */
    const march = (c: number): [number, number] => {
      const base = rear(c, 0);
      for (let k = 1; k <= most; k += 2) {
        const p = rear(c, k);
        const cell = cellOf(p.x, p.y);
        const code = cell < 0 ? ROAD : owner[cell] ? USED : site.at(p.x, p.y);
        if (code !== FREE || waterDistAt(city.terrain, p.x, p.y) < 8 || sandy(p.x, p.y) || Math.abs(site.heightAt(p.x, p.y) - site.heightAt(base.x, base.y)) > 0.6 + 0.13 * k) return [k - 1, code === FREE ? WATER : code];
      }
      return [most + 1, FREE];
    };
    // Half way to a lot that backs on to the same ground, all the way to ground already taken by one, and short of anything else.
    const reach = ([k, beyond]: [number, number]): number => (beyond === LOT ? k / 2 : beyond === FREE || beyond === USED ? k : k - 2);
    // The new rear line stays parallel to the old one: a garden that ran out to a point would look like a mistake.
    const ea = Math.min(reach(march(0.1)), reach(march(0.5)), reach(march(0.9)));
    const eb = ea;
    if (ea < 2.5) return;
    const [a, b] = [rear(0, 0), rear(1, 0)];
    const [a2, b2] = [rear(0, ea), rear(1, eb)];
    const quad = [a, b, b2, a2];
    const [x0, x1, y0, y1] = [Math.min(a.x, b.x, a2.x, b2.x), Math.max(a.x, b.x, a2.x, b2.x), Math.min(a.y, b.y, a2.y, b2.y), Math.max(a.y, b.y, a2.y, b2.y)];
    for (let y = Math.floor(y0 / SITE_CELL); y <= Math.floor(y1 / SITE_CELL); y++)
      for (let x = Math.floor(x0 / SITE_CELL); x <= Math.floor(x1 / SITE_CELL); x++) {
        const [px, py] = [(x + 0.5) * SITE_CELL, (y + 0.5) * SITE_CELL];
        const cell = cellOf(px, py);
        if (cell >= 0 && !owner[cell] && site.grid[cell] === FREE && inPoly(quad, px, py)) owner[cell] = f.lot.id + 1;
      }
    const nf = f.lot.front;
    f.poly = [...f.lot.poly.slice(0, nf + 1), b2, a2, ...f.lot.poly.slice(nf + 1)];
    f.va += ea;
    f.vb += eb;
    f.d = Math.min(f.va, f.vb);
  };
  const at = (f: Frame, u: number, v: number): Vec2 => ({ x: f.ox + f.tx * u + f.nx * v, y: f.oy + f.ty * u + f.ny * v });
  const left = (f: Frame, v: number): number => -f.w / 2 + ((f.ua + f.w / 2) * Math.min(v, f.va0)) / f.va0;
  const right = (f: Frame, v: number): number => f.w / 2 + ((f.ub - f.w / 2) * Math.min(v, f.vb0)) / f.vb0;
  /** The u range that is on the lot all the way from v0 to v1, `m` in from its sides. */
  const span = (f: Frame, v0: number, v1: number, m = 0): [number, number] => [Math.max(left(f, v0), left(f, v1)) + m, Math.min(right(f, v0), right(f, v1)) - m];
  const free = (f: Frame, u: number, v: number, r: number, list = f.taken): boolean => list.every(([u0, u1, v0, v1]) => u < u0 - r || u > u1 + r || v < v0 - r || v > v1 + r);
  const ground = (f: Frame, u: number, v: number): number => {
    const p = at(f, u, v);
    return site.heightAt(p.x, p.y);
  };

  // --- Standing a building ---
  /** What was on the ground before any building: the buildings themselves are kept apart by their outlines, not by the raster. */
  const before = site.grid.slice();
  const HASH = 48;
  const placed = new Map<number, Vec2[][]>();
  const footprint = (x: number, y: number, yaw: number, hx: number, hz: number): Vec2[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => Site.local(x, y, yaw, i * hx, j * hz));
  const overlaps = (a: Vec2[], b: Vec2[]): boolean => {
    for (const q of [a, b])
      for (let i = 0; i < 2; i++) {
        const [nx, ny] = [q[i + 1].y - q[i].y, q[i].x - q[i + 1].x];
        let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
        for (const p of a) {
          const d = p.x * nx + p.y * ny;
          a0 = Math.min(a0, d);
          a1 = Math.max(a1, d);
        }
        for (const p of b) {
          const d = p.x * nx + p.y * ny;
          b0 = Math.min(b0, d);
          b1 = Math.max(b1, d);
        }
        if (a1 <= b0 || b1 <= a0) return false;
      }
    return true;
  };
  const skirt = (f: Frame, r: Rect, top: number, low: number): void => {
    const c = at(f, (r[0] + r[1]) / 2, (r[2] + r[3]) / 2);
    const hy = (top - low) / 2 + 0.2;
    tile(c.x, c.y).box('structure/wall-smooth', [c.x, top - 0.02 - hy, c.y], [(r[1] - r[0]) / 2, hy, (r[3] - r[2]) / 2], [f.tx, 0, f.ty], [0, 1, 0], [-f.ty, 0, f.tx]);
  };
  /** Stands a model with the middle of its front at (uc, vf); null where the lot has no room for it or the ground is too steep. */
  const place = (f: Frame, model: string, uc: number, vf: number, o: Opt = {}): Building | null => {
    const { min, max } = bbox(model);
    const k = o.stretch ?? 1;
    const [hx, hz] = [((max[0] - min[0]) / 2) * k, (max[2] - min[2]) / 2];
    const vc = vf + hz;
    const lot = f.lot;
    const tol = o.party ? 1.1 : 0.5;
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [-1, 0], [1, 0], [0, -1]]) {
      const p = at(f, uc + a * hx, vc + c * hz);
      if (!inPoly(f.poly, p.x, p.y) && edgeDist(f.poly, p.x, p.y) > tol) return null;
    }
    const [mx, mz] = [Math.max(0.4, hx - (o.party ? 1 : 0.5)), Math.max(0.4, hz - 0.5)];
    const [nu, nv] = [Math.ceil(mx), Math.ceil(mz)];
    for (let i = -nu; i <= nu; i++)
      for (let j = -nv; j <= nv; j++) {
        const p = at(f, uc + (i / nu) * mx, vc + (j / nv) * mz);
        const cell = cellOf(p.x, p.y);
        const code = cell < 0 ? ROAD : before[cell];
        if (code === LOT) continue;
        // The rasters are coarser than the lot's outline: open ground inside it is the lot's, and so is the fringe of the margin kept round the road.
        if ((code !== FREE && code !== ROAD) || !inPoly(f.poly, p.x, p.y) || (code === ROAD && edgeDist(f.poly, p.x, p.y) > 2.5)) return null;
      }
    // Clear of every building already standing: walls that share a line may touch.
    const c = at(f, uc, vc);
    const mine = footprint(c.x, c.y, f.yaw, hx - (o.party ? 0.15 : (o.lap ?? 0)), hz);
    const reach = Math.hypot(hx, hz);
    for (let gy = Math.floor((c.y - reach) / HASH); gy <= Math.floor((c.y + reach) / HASH); gy++)
      for (let gx = Math.floor((c.x - reach) / HASH); gx <= Math.floor((c.x + reach) / HASH); gx++) for (const other of placed.get(gy * 4096 + gx) ?? []) if (overlaps(mine, other)) return null;
    let [g0, g1, gf] = [Infinity, -Infinity, -Infinity];
    const [gu, gv] = [Math.max(1, Math.ceil(hx / 1.5)), Math.max(1, Math.ceil(hz / 1.5))];
    for (let i = -gu; i <= gu; i++)
      for (let j = -gv; j <= gv; j++) {
        const g = ground(f, uc + (i / gu) * hx, vc + (j / gv) * hz);
        g0 = Math.min(g0, g);
        g1 = Math.max(g1, g);
        if (j === -gv) gf = Math.max(gf, g);
      }
    if (g1 - g0 > (o.maxRelief ?? (hx > 20 ? 4.5 : 3.5))) return null;
    // Level with the ground at the door; the ground may stand against the walls elsewhere, but not up to the windows.
    const door = ground(f, o.doorU ?? uc, vf);
    const floor = (OPEN.test(model) ? g1 : Math.max(door, gf - 0.35, Math.min(g1 - 0.9, door + 1.7))) + 0.04;
    if (o.level && floor - ground(f, o.level[0], o.level[1]) > 0.4) return null;
    // Where more of a slope is allowed under a house, it is to stand out from the hill on a wall, not to be dug in to its eaves.
    if ((o.maxRelief ?? 0) > 3.5 && g1 - floor > 1.5) return null;
    for (let gy = Math.floor((c.y - reach) / HASH); gy <= Math.floor((c.y + reach) / HASH); gy++)
      for (let gx = Math.floor((c.x - reach) / HASH); gx <= Math.floor((c.x + reach) / HASH); gx++) (placed.get(gy * 4096 + gx) ?? placed.set(gy * 4096 + gx, []).get(gy * 4096 + gx)!).push(mine);
    const stood = site.put(model, 'building', c.x, c.y, f.yaw, { h: floor, ...(k !== 1 ? { stretch: k } : {}) });
    // A restaurant that can be seen into has its room fitted out.
    const room = `prop/interior-${model.slice(model.indexOf('/') + 1)}`;
    if (FITTED.has(room)) site.set(room, 'prop', stood.x, stood.y, stood.h, f.yaw, k !== 1 ? { stretch: k } : {});
    // What a flat roof carries: air handlers and vents, more of them on a store or a works than on flats, and a water tank on the older blocks.
    const top = deck(model);
    if (top) {
      const [mx, mz] = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2];
      const share = /^(C|I)/.test(f.lot.use) ? 0.16 : 0.09;
      const want = Math.max(1, Math.min(14, Math.round(top.spots.length * share)));
      const put: Rect[] = [];
      for (let i = 0; i < want; i++) {
        const [sx, sz] = top.spots[Math.floor(rnd(f.lot.id, 700, i, uc) * top.spots.length)];
        // The bigger units are wider than a spot: each needs roof under the whole of it, clear of the units already standing.
        const room = (id: string, turn: number): Rect | null => {
          const { min: lo, max: hi } = bbox(id);
          const [px, pz] = [Math.max(-lo[0], hi[0]), Math.max(-lo[2], hi[2])];
          const [rx, rz] = turn % 2 ? [pz, px] : [px, pz];
          const r: Rect = [sx * k - rx, sx * k + rx, sz - rz, sz + rz];
          return top.fits(sx, sz, rx / k, rz) && !put.some((o) => o[0] < r[1] + 0.4 && o[1] > r[0] - 0.4 && o[2] < r[3] + 0.4 && o[3] > r[2] - 0.4) ? r : null;
        };
        const tank = i === 0 && max[1] > 11 && /^R|^O/.test(f.lot.use) && (f.type === 'oldtown' || f.type === 'midtown' || f.type === 'downtown') && rnd(f.lot.id, 701, uc) < 0.5;
        let part = tank ? `buildpart/water-tank-${1 + Math.floor(rnd(f.lot.id, 702) * 3)}` : rnd(f.lot.id, 703, i) < 0.62 ? ROOF_AC[Math.floor(rnd(f.lot.id, 704, i) * ROOF_AC.length)] : ROOF_SMALL[Math.floor(rnd(f.lot.id, 705, i) * ROOF_SMALL.length)];
        let turn = Math.floor(rnd(f.lot.id, 706, i) * 4);
        // Turned the other way if that is how it fits, and a small unit where a tank or a big one has no room.
        let r = room(part, turn) ?? room(part, ++turn);
        if (!r) r = room((part = ROOF_AC[0]), turn);
        if (!r) continue;
        put.push(r);
        const p = Site.local(c.x, c.y, f.yaw, (sx - mx) * k, sz - mz);
        site.set(part, 'roof', p.x, p.y, floor + top.y, f.yaw + turn * (Math.PI / 2));
      }
    }
    const [a, b] = [at(f, uc - Math.max(0.3, hx - 0.5), vc), at(f, uc + Math.max(0.3, hx - 0.5), vc)];
    site.stampBand(a.x, a.y, b.x, b.y, -Math.max(0.3, hz - 0.5), Math.max(0.3, hz - 0.5), USED);
    const rect: Rect = [uc - hx, uc + hx, vf, vf + 2 * hz];
    f.taken.push(rect);
    // A house stands on less than its bounding box: the drive runs up to a garage door set back from the front.
    const [cx, cz] = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2];
    const parts = HOUSE_PLANS.get(model)?.body.map(([x0, x1, z0, z1]): Rect => {
      const [a0, a1] = [uc + f.sx * (x0 - cx), uc + f.sx * (x1 - cx)];
      return [Math.min(a0, a1), Math.max(a0, a1), vc - (z1 - cz), vc - (z0 - cz)];
    });
    f.solid.push(...(parts ?? [rect]));
    if (floor - g0 > 0.12) {
      if (parts) for (const r of parts) skirt(f, r, floor, g0);
      else skirt(f, [uc - hx + 0.12, uc + hx - 0.12, vf + 0.12, vf + 2 * hz - 0.12], floor, g0);
    }
    const made: Building = { lot: lot.id, use: lot.use, model, x: c.x, y: c.y, hx, hz, yaw: f.yaw, floor, ground: [g0, g1], setback: vf, main: o.main ?? true, party: o.party ?? false, ...(o.civic ? { civic: o.civic } : {}) };
    out.list.push(made);
    return made;
  };
  /** A point of a model in the lot's (u, v), for a model standing with the middle of its front at (uc, vf). */
  const modelUV = (f: Frame, model: string, uc: number, vf: number, mx: number, mz: number): [number, number] => {
    const { min, max } = bbox(model);
    return [uc + f.sx * (mx - (min[0] + max[0]) / 2), vf + (max[2] - mz)];
  };

  // --- Surfaces ---
  /** The least height of a quad over the ground under it, whichever way it is cut into two triangles. */
  const cover = (A: V3, B: V3, C: V3, D: V3): number => {
    let least = Infinity;
    for (let q = 1; q < 4; q++)
      for (let r = 1; r < 4; r++) {
        const [s, t] = [q / 4, r / 4];
        const ac = s >= t ? A[1] + s * (B[1] - A[1]) + t * (C[1] - B[1]) : A[1] + t * (D[1] - A[1]) + s * (C[1] - D[1]);
        const bd = s + t <= 1 ? A[1] + s * (B[1] - A[1]) + t * (D[1] - A[1]) : C[1] + (1 - s) * (D[1] - C[1]) + (1 - t) * (B[1] - C[1]);
        const x = A[0] + s * (B[0] - A[0]) + t * (D[0] - A[0]) + s * t * (A[0] - B[0] + C[0] - D[0]);
        const z = A[2] + s * (B[2] - A[2]) + t * (D[2] - A[2]) + s * t * (A[2] - B[2] + C[2] - D[2]);
        least = Math.min(least, Math.min(ac, bd) - site.heightAt(x, z));
      }
    return least;
  };
  /** Lays paving over a rectangle of the lot, following the ground; not under the lot's buildings. */
  const pave = (f: Frame, tex: string, r: Rect, lift = 0.05, step = 2): void => {
    const [u0, u1, v0, v1] = r;
    if (u1 - u0 < 0.3 || v1 - v0 < 0.3) return;
    const c = at(f, (u0 + u1) / 2, (v0 + v1) / 2);
    const b = tile(c.x, c.y);
    const [nu, nv] = [Math.max(1, Math.round((u1 - u0) / step)), Math.max(1, Math.round((v1 - v0) / step))];
    const pt = (u: number, v: number): V3 => {
      const p = at(f, u, v);
      return [p.x, site.heightAt(p.x, p.y) + lift, p.y];
    };
    // A piece lies flat between its corners, and the ground between them may not: one that the ground would come
    // through, where it crosses a fold of the terrain, is laid as four smaller ones.
    const lay = (a0: number, a1: number, c0: number, c1: number, depth: number): void => {
      const [A, B, C, D] = [pt(a0, c0), pt(a1, c0), pt(a1, c1), pt(a0, c1)];
      if (depth < 3 && Math.max(a1 - a0, c1 - c0) > 0.8 && cover(A, B, C, D) < 0.02) {
        const [am, cm] = [(a0 + a1) / 2, (c0 + c1) / 2];
        // The piece beside this one may be laid whole: its straight side and the two halves that meet here part
        // at the middle, and an upright sliver closes what would open between them.
        const mids: [V3, V3, V3, [number, number][]][] = [
          [A, pt(am, c0), B, [[a0, c0], [am, c0], [a1, c0]]], [B, pt(a1, cm), C, [[a1, c0], [a1, cm], [a1, c1]]],
          [C, pt(am, c1), D, [[a1, c1], [am, c1], [a0, c1]]], [D, pt(a0, cm), A, [[a0, c1], [a0, cm], [a0, c0]]],
        ];
        for (const [P, M, Q, uv] of mids) {
          if (Math.abs(M[1] - (P[1] + Q[1]) / 2) < 0.004) continue;
          b.tri(tex, P, M, Q, uv);
          b.tri(tex, Q, M, P, [uv[2], uv[1], uv[0]]);
        }
        lay(a0, am, c0, cm, depth + 1);
        lay(am, a1, c0, cm, depth + 1);
        lay(a0, am, cm, c1, depth + 1);
        lay(am, a1, cm, c1, depth + 1);
        return;
      }
      b.quadUp(tex, A, B, C, D, 0, [[a0, c0], [a1, c0], [a1, c1], [a0, c1]]);
    };
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const [a0, a1, c0, c1] = [u0 + ((u1 - u0) * i) / nu, u0 + ((u1 - u0) * (i + 1)) / nu, v0 + ((v1 - v0) * j) / nv, v0 + ((v1 - v0) * (j + 1)) / nv];
        if (!free(f, (a0 + a1) / 2, (c0 + c1) / 2, -0.4, f.solid)) continue;
        lay(a0, a1, c0, c1, 0);
      }
  };

  /** The whole width of the lot laid with one surface from v0 to v1, in bands that follow its side lines; what stands on it and what is paved over it lie above. */
  const court = (f: Frame, tex: string, v0: number, v1: number, m = 0.25): void => {
    for (let v = v0; v < v1 - 0.3; ) {
      const w = Math.min(v1, v + (v < 0 ? -v : 4));
      const [lo, hi] = span(f, Math.max(0, v), Math.max(0, w), m);
      pave(f, tex, [lo, hi, v, w], 0.04, 4);
      v = w;
    }
  };
  /** The ground of the lot is yard, forecourt and car park as far in as `to`, and not grass. */
  const harden = (f: Frame, to = Infinity): void => {
    out.hard.set(f.lot.id, [f.ox, f.oy, f.nx, f.ny, to]);
  };
  const URBAN: Partial<Record<DistrictType, boolean>> = { downtown: true, midtown: true, oldtown: true };
  /** What a forecourt, a passage or a yard is laid with, by the lot: slabs and setts in the old streets, concrete elsewhere. */
  const COURTS = ['concrete/walk-square', 'concrete/walk-plain', 'paving/slabs-granite', 'concrete/walk-exposed', 'paving/running-grey', 'concrete/walk-square-cracked', 'paving/slabs-sandstone', 'concrete/walk-small', 'paving/slabs-dark', 'paving/basket-tan'];
  const courtTex = (lot: Lot, salt = 0): string => COURTS[Math.floor(rnd(lot.edge, lot.side, 360 + salt) * 0.5 * COURTS.length + rnd(lot.id, 361 + salt) * 0.5 * COURTS.length)];

  // --- Fences ---
  const fenced = new Map<number, Vec2[]>();
  const FC = 3;
  const fenceNear = (p: Vec2): boolean => {
    const [ci, cj] = [Math.floor(p.x / FC), Math.floor(p.y / FC)];
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) for (const q of fenced.get(j * 4096 + i) ?? []) if (Math.hypot(q.x - p.x, q.y - p.y) < 1.7) return true;
    return false;
  };
  /** A run of fence between two points of the map, in pieces that follow the ground; nothing where another fence already runs. */
  const fence = (style: string, p: Vec2, q: Vec2): void => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 0.7) return;
    // Long pieces where the ground between the ends is even, short ones where it rolls.
    const even = Math.abs(site.heightAt((p.x + q.x) / 2, (p.y + q.y) / 2) - (site.heightAt(p.x, p.y) + site.heightAt(q.x, q.y)) / 2) < 0.08;
    const n = Math.max(1, Math.ceil(len / (even ? 12 : 5)));
    const [dx, dy] = [(q.x - p.x) / len, (q.y - p.y) / len];
    const l = len / n;
    for (let k = 0; k < n; k++) {
      const a = { x: p.x + dx * l * k, y: p.y + dy * l * k };
      const probes = [0.2, 0.5, 0.8].map((t) => ({ x: a.x + dx * l * t, y: a.y + dy * l * t }));
      if (probes.filter(fenceNear).length >= 2) continue;
      const here = site.at(probes[1].x, probes[1].y);
      if (here !== LOT && here !== USED && here !== FREE) continue;
      const [h0, h1] = [site.heightAt(a.x, a.y), site.heightAt(a.x + dx * l, a.y + dy * l)];
      FENCES[style](tile(a.x, a.y), { o: [a.x, h0 - 0.03, a.y], x: [dx, (h1 - h0) / l, dy], y: [0, 1, 0], z: [-dy, 0, dx] }, l);
      out.fence += l;
      out.runs.push([a.x, a.y, a.x + dx * l, a.y + dy * l]);
      for (let s = 0; s <= l; s += 1.2) {
        const m = { x: a.x + dx * s, y: a.y + dy * s };
        const key = Math.floor(m.y / FC) * 4096 + Math.floor(m.x / FC);
        (fenced.get(key) ?? fenced.set(key, []).get(key)!).push(m);
      }
    }
  };

  // --- Choosing a model ---
  const recent = new Map<string, string[]>();
  const keyOf = (lot: Lot): string => `${lot.edge}:${lot.side}`;
  /** The candidates in the order to try them: random by weight, with what the neighbours along the street already have last. */
  const order = (cands: [Shape, number][], lot: Lot, salt: number): Shape[] => {
    const last = recent.get(keyOf(lot)) ?? [];
    return cands
      .filter(([, w]) => w > 0)
      .map(([s, w], i) => ({ s, k: Math.pow(rnd(lot.id, salt, i) + 1e-9, 1 / (w * (last.includes(s.id) ? 0.004 : 1))) }))
      .sort((a, b) => b.k - a.k)
      .map((x) => x.s);
  };
  const remember = (lot: Lot, id: string): void => {
    const k = keyOf(lot);
    const list = recent.get(k) ?? recent.set(k, []).get(k)!;
    list.push(id);
    if (list.length > 2) list.shift();
  };
  const mix = (list: [string, number, number][], fav?: string): [Shape, number][] => list.flatMap(([p, , w]) => family(p).map((s) => [s, w * (p === fav ? 3 : 1)] as [Shape, number]));
  /** How well a model's height suits the storeys the lot is zoned for. */
  const tall = (s: Shape, target: number, soft = 0.3): number => Math.exp(-Math.abs(s.h - target) / (soft * target + 1.5));

  // --- Plants and small things ---
  const TREES: Record<DistrictType, string[]> = {
    suburb: ['plant/street-oak', 'plant/street-maple', 'plant/street-birch', 'plant/street-spring', 'plant/street-magnolia', 'plant/street-pear', 'plant/street-cherry', 'plant/street-elm'],
    residential: ['plant/street-oak', 'plant/street-maple', 'plant/street-jacaranda', 'plant/street-magnolia', 'plant/street-cherry', 'plant/street-elm', 'plant/street-ficus-small', 'plant/street-sparse'],
    oldtown: ['plant/street-plane', 'plant/street-elm', 'plant/street-oak-old', 'plant/street-magnolia', 'plant/street-sparse'],
    beach: ['plant/palm-queen', 'plant/palm-date-short', 'plant/palm-fan-short', 'plant/street-ficus-small', 'plant/street-tabebuia', 'plant/street-bougainvillea'],
    hills: ['plant/street-oak', 'plant/street-eucalyptus', 'plant/street-olive', 'plant/street-oak-old', 'plant/street-jacaranda'],
    industrial: ['plant/street-sparse', 'plant/street-eucalyptus', 'plant/street-poplar'],
    midtown: ['plant/street-plane', 'plant/street-maple', 'plant/street-ficus', 'plant/street-pear'],
    downtown: ['plant/street-plane', 'plant/street-ficus', 'plant/street-pear', 'plant/street-elm'],
  };
  const BEDS = ['plant/flower-lavender', 'plant/grass-fountain', 'plant/flower-iris', 'plant/flower-tulip-mixed', 'plant/flower-geranium', 'plant/grass-fescue', 'plant/flower-tulip-red', 'plant/flower-lavender-row', 'plant/shrub-dry'];
  const SHRUBS = ['plant/shrub-box', 'plant/shrub-rose-pink', 'plant/shrub-rose-white', 'plant/shrub-hibiscus-pink'];
  /** Is the point on the lot, `m` in from its sides and its back, and clear of everything on it by `r`? */
  const open = (f: Frame, u: number, v: number, m: number, r: number): boolean => {
    if (v < Math.max(0, f.v0) + m || v > f.d - m || u < left(f, v) + m || u > right(f, v) - m || !free(f, u, v, r)) return false;
    const p = at(f, u, v);
    const code = site.at(p.x, p.y);
    return code === LOT || (code === FREE && inPoly(f.poly, p.x, p.y));
  };
  const tree = (f: Frame, u: number, v: number, salt: number, clear = 2.6, margin = 1.6): boolean => {
    if (!open(f, u, v, margin, 0.9) || !free(f, u, v, clear, f.solid)) return false;
    const p = at(f, u, v);
    // A trunk stands a little off the middle of its crown: not at the very edge of what a junction takes.
    if ([[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].some(([dx, dy]) => site.at(p.x + dx, p.y + dy) === ROAD)) return false;
    const list = TREES[f.type];
    site.put(list[Math.floor(rnd(f.lot.id, salt, 1) * list.length)], 'tree', p.x, p.y, rnd(f.lot.id, salt, 2) * 6.28, { scale: 0.8 + rnd(f.lot.id, salt, 3) ** 2 * 0.7 });
    f.taken.push([u - 0.5, u + 0.5, v - 0.5, v + 0.5]);
    return true;
  };
  const small = (f: Frame, model: string, kind: 'plant' | 'yard' | 'parking' | 'bin' | 'sign', u: number, v: number, turn = 0, r = 0.5): boolean => {
    if (!open(f, u, v, 0.4, 0.15)) return false;
    const p = at(f, u, v);
    // Not on a corner of the lot that pokes out into the carriageway.
    if (site.at(p.x + 1.5 * f.tx, p.y + 1.5 * f.ty) === ROAD && site.at(p.x - 1.5 * f.tx, p.y - 1.5 * f.ty) === ROAD) return false;
    site.put(model, kind, p.x, p.y, f.yaw + turn);
    f.taken.push([u - r, u + r, v - r, v + r]);
    return true;
  };
  const DUMPSTERS = ['furniture/bin-dumpster', 'furniture/bin-dumpster-green', 'furniture/bin-dumpster-open', 'furniture/bin-dumpster-bags'];
  /**
   * Stands something that takes room of its own (a refuse store, a stack of pallets, a container) where the lot is
   * clear of buildings. Nothing is marked or planted where it stands afterwards. `turn` is in quarter turns from facing the road.
   */
  const stand = (f: Frame, model: string, kind: 'yard' | 'bin', u: number, v: number, turn = 0): boolean => {
    const { min, max } = bbox(model);
    const [hx, hz] = [(max[0] - min[0]) / 2, (max[2] - min[2]) / 2];
    const [ru, rv] = turn % 2 ? [hz, hx] : [hx, hz];
    const r: Rect = [u - ru, u + ru, v - rv, v + rv];
    if (r[2] < Math.max(0, f.v0) + 0.2 || r[3] > f.d - 0.2) return false;
    const [lo, hi] = span(f, r[2], r[3], 0.2);
    if (r[0] < lo || r[1] > hi) return false;
    if (f.solid.some(([u0, u1, v0, v1]) => u0 < r[1] + 0.4 && u1 > r[0] - 0.4 && v0 < r[3] + 0.4 && v1 > r[2] - 0.4)) return false;
    for (const [a, b] of [[r[0], r[2]], [r[1], r[2]], [r[1], r[3]], [r[0], r[3]], [u, v]]) {
      const p = at(f, a, b);
      const code = site.at(p.x, p.y);
      if ((code !== LOT && code !== FREE) || !inPoly(f.poly, p.x, p.y)) return false;
    }
    const p = at(f, u, v);
    site.put(model, kind, p.x, p.y, f.yaw + (turn * Math.PI) / 2);
    f.solid.push(r);
    f.taken.push(r);
    return true;
  };
  /** A small thing at a shop, seen only from near by: on the lot or on the paved strip before it, clear of what stands there. */
  const prop = (f: Frame, model: string, u: number, v: number, yaw = 0): boolean => {
    const { min, max } = bbox(model);
    const [c, sn] = [Math.abs(Math.cos(yaw)), Math.abs(Math.sin(yaw))];
    const [hx, hz] = [(max[0] - min[0]) / 2, (max[2] - min[2]) / 2];
    const [ru, rv] = [hx * c + hz * sn, hx * sn + hz * c];
    const r: Rect = [u - ru, u + ru, v - rv, v + rv];
    if (r[2] < Math.min(0, 0.25 - f.gap) || r[3] > f.d - 0.2) return false;
    const [lo, hi] = span(f, Math.max(0, r[2]), Math.max(0.1, r[3]), 0.1);
    if (r[0] < lo || r[1] > hi) return false;
    if (f.solid.some(([u0, u1, v0, v1]) => u0 < r[1] + 0.12 && u1 > r[0] - 0.12 && v0 < r[3] + 0.12 && v1 > r[2] - 0.12)) return false;
    const q = at(f, u, v);
    if (v > 0 && !inPoly(f.poly, q.x, q.y)) return false;
    const code = site.at(q.x, q.y);
    if (code !== LOT && code !== FREE) return false;
    site.put(model, 'prop', q.x, q.y, f.yaw + yaw);
    f.solid.push(r);
    return true;
  };
  /** What a shop puts out before its door and leaves behind its back wall. `box` is the building, `door` where its door is (if known). */
  const dress = (f: Frame, b: Building, box: Rect, o: { door?: number; walk: number; back: boolean; patio?: Rect }): void => {
    const id = f.lot.id;
    const r = (a: number, i = 0): number => rnd(id, 900 + a, i, Math.round(box[0] * 7));
    const pick = <T,>(list: T[], a: number, i = 0): T => list[Math.floor(r(a, i) * list.length) % list.length];
    const food = /fastfood|diner/.test(b.model);
    const chain = Number(b.model.match(/(\d+)$/)?.[1] ?? 0) + (b.model.includes('diner') ? 3 : 0);
    const w = box[1] - box[0];
    const door = o.door ?? Number.NaN;
    const clear = (u: number): boolean => !(Math.abs(u - door) < 1.5);
    const vw = box[2] - 0.42;
    if (o.walk >= 0.8) {
      // The board on the pavement: beside the door where there is one, else a third of the way along.
      // What is chalked on it is what the shop sells: burgers, tacos, doughnuts, pizza and noodles at fastfood-1 to 5.
      const boards = food ? (b.model.includes('diner') ? ['coffee', 'lunch', 'open', 'happy'] : [['burger', 'lunch'], ['lunch', 'open'], ['donut', 'coffee'], ['pizza', 'happy'], ['ramen', 'lunch']][(chain + 4) % 5]) : BOARDS;
      if (r(1) < (food ? 0.8 : 0.45)) {
        const u = Number.isNaN(door) ? box[0] + w * (0.25 + 0.5 * r(2)) : door + (r(2) < 0.5 ? -1 : 1) * (1.7 + 0.6 * r(3));
        prop(f, `prop/board-${pick(boards, 4)}`, u, box[2] - Math.min(o.walk - 0.35, 0.7 + 0.5 * r(5)), (r(6) - 0.5) * 0.5 + (r(7) < 0.3 ? Math.PI / 2 : 0));
      }
      // Banners in a row at one end of the front.
      if (r(8) < (food ? 0.55 : 0.22)) {
        const col = food ? FLAGS[chain % FLAGS.length] : pick(FLAGS, 9);
        const n = 1 + Math.floor(r(10) * (food ? 3.4 : 2));
        const side = r(11) < 0.5 ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const u = (side < 0 ? box[0] + 0.5 : box[1] - 0.5) - side * i * 1.15;
          if (clear(u)) prop(f, `prop/flag-${r(12, i) < 0.8 ? col : pick(FLAGS, 13, i)}`, u, box[2] - Math.min(o.walk - 0.3, 1.25), (r(14, i) - 0.5) * 0.3);
        }
      }
      // Somewhere to put a cigarette out, against the wall.
      if (r(15) < (food ? 0.6 : 0.2)) {
        const u = Number.isNaN(door) ? box[0] + 0.5 + r(16) * (w - 1) : door + (r(16) < 0.5 ? -1 : 1) * (1.55 + 0.9 * r(17));
        prop(f, `prop/ashtray-${pick(['post', 'bin', 'sand'], 18)}`, u, vw);
      }
      // Goods waiting to go in, stood against the front wall.
      if (!food && r(19) < 0.3) {
        const u = box[0] + 0.7 + r(20) * (w - 1.4);
        if (clear(u)) prop(f, r(21) < 0.5 ? `prop/crates-${pick(CRATES, 22)}` : `prop/cartons-${pick(CARTONS, 22)}`, u, box[2] - 0.5, (r(23) - 0.5) * 0.2);
      }
      // A table or two on the pavement where it is wide enough.
      if (food && o.walk >= 2.3 && r(24) < 0.6) {
        const set = pick(['bistro-2', 'cafe-2', 'wood-2', 'high-2'].filter((x) => SETS.has(x)), 25);
        for (let i = 0, u = box[0] + 1.4; u < box[1] - 1.2 && i < 3; u += 2.6 + r(26, i), i++) if (clear(u) && Math.abs(u - door) > 2.6) prop(f, `prop/set-${set}`, u, box[2] - 1.05, (r(27, i) - 0.5) * 0.4);
      }
    }
    // Tables under parasols beside the building.
    if (o.patio) {
      const [a0, a1, c0, c1] = o.patio;
      const shade = pick(['parasol-red', 'parasol-green', 'parasol-cream', 'parasol-blue'], 30);
      const plain = pick(['plastic-4', 'wood-4', 'cafe-4', 'bistro-2'].filter((x) => SETS.has(x)), 31);
      let i = 0;
      for (let v = c0 + 1.7; v < c1 - 1.5; v += 3.3)
        for (let u = a0 + 1.7; u < a1 - 1.5; u += 3.3, i++) {
          if (r(32, i) < 0.12) continue;
          prop(f, `prop/set-${r(33, i) < 0.7 ? shade : plain}`, u + (r(34, i) - 0.5) * 0.5, v + (r(35, i) - 0.5) * 0.5, r(36, i) * Math.PI);
        }
    }
    // Behind the back wall: empties, deliveries, gas, the mop.
    if (o.back) {
      const back = food
        ? ['crates-mixed', `crates-${pick(CRATES, 40)}`, `cartons-${pick(CARTONS, 41)}`, 'keg-pair', 'gas-pair', 'gas-grey', 'mop-bucket', 'keg']
        : [`cartons-${pick(CARTONS, 41)}`, `cartons-${pick(CARTONS, 42)}`, `crates-${pick(CRATES, 40)}`, 'crates-mixed', 'mop-bucket'];
      const n = (food ? 2 : 0) + Math.floor(r(43) * 3);
      for (let i = 0; i < n; i++) {
        const m = `prop/${pick(back, 44, i)}`;
        const { min, max } = bbox(m);
        prop(f, m, box[0] + 0.8 + r(45, i) * (w - 1.6), box[3] + (max[2] - min[2]) / 2 + 0.08 + 0.25 * r(46, i), (r(47, i) - 0.5) * 0.24);
      }
    }
  };
  /** Where the refuse of a building waits for the lorry: a walled store on a big lot, a dumpster on a small one, in a back corner. */
  const refuse = (f: Frame, side: -1 | 1, big: boolean, back = f.d - 0.8): boolean => {
    const [L, R] = span(f, back - 5, back, 0.4);
    const model = DUMPSTERS[Math.floor(rnd(f.lot.id, 170) * DUMPSTERS.length)];
    for (const s of [side, -side]) {
      if (big && stand(f, 'infra/dumpster-enclosure', 'bin', s < 0 ? L + 3 : R - 3, back - 2.3)) return true;
      if (stand(f, model, 'bin', s < 0 ? L + 2.1 : R - 2.1, back - 1.1)) return true;
    }
    return false;
  };
  /** Steps down from a door whose foot is above the ground; returns how far they run towards the road. */
  const steps = (f: Frame, u: number, v: number, top: number, w: number): number => {
    const g = ground(f, u, v);
    const n = Math.ceil((top - g - 0.06) / STEP);
    if (n < 1 || n * 0.3 > v + f.gap - 0.4) return 0;
    for (let i = 0; i < n; i++) {
      const y = top - (i + 1) * STEP;
      const c = at(f, u, v - (i + 0.5) * 0.3);
      const low = ground(f, u, v - (i + 1) * 0.3) - 0.3;
      tile(c.x, c.y).box('structure/wall-smooth', [c.x, (y + low) / 2, c.y], [w / 2, (y - low) / 2, 0.15], [f.tx, 0, f.ty], [0, 1, 0], [-f.ty, 0, f.tx]);
    }
    return n * 0.3;
  };

  // --- Houses ---
  const HOUSES: Record<DistrictType, [string, number, number][]> = {
    suburb: [['house/ranch', 8, 3], ['house/suburban', 6, 4], ['house/colonial', 6, 2.5], ['house/modern', 6, 1], ['house/spanish', 6, 1.5], ['house/cape', 4, 1.2], ['house/duplex', 4, 0.4]],
    residential: [['house/bungalow', 6, 3], ['house/colonial', 6, 1.5], ['house/cape', 4, 2], ['house/victorian', 6, 1], ['house/spanish', 6, 2], ['house/cottage', 6, 0.5], ['house/suburban', 6, 1.5], ['house/ranch', 8, 0.8], ['house/duplex', 4, 0.6], ['house/modern', 6, 0.6]],
    oldtown: [['house/victorian', 6, 4], ['house/cottage', 6, 2.5], ['house/bungalow', 6, 2], ['apartment/rowhouse', 6, 2]],
    beach: [['house/cottage', 6, 2], ['house/spanish', 6, 2.5], ['house/modern', 6, 2], ['house/bungalow', 6, 2], ['house/cape', 4, 1], ['house/victorian', 6, 1.2]],
    hills: [['house/modern', 6, 3], ['house/spanish', 6, 3], ['house/ranch', 8, 2], ['house/colonial', 6, 1.5]],
    industrial: [['house/cottage', 6, 2], ['house/mobile', 4, 3], ['house/bungalow', 6, 1]],
    midtown: [['house/victorian', 6, 3], ['apartment/rowhouse', 6, 3], ['house/bungalow', 6, 1], ['house/duplex', 4, 1]],
    downtown: [['apartment/rowhouse', 6, 3], ['house/victorian', 6, 2]],
  };
  const ANY_HOUSE: [string, number, number][] = [['house/cottage', 6, 1], ['house/victorian', 6, 1], ['house/bungalow', 6, 1], ['house/cape', 4, 1], ['house/modern', 6, 1], ['house/spanish', 6, 1], ['house/colonial', 6, 1]];
  /** Front setback range, least side setback and least back yard of a house, by district. */
  const HOUSE_SET: Record<DistrictType, [number, number, number, number]> = {
    suburb: [5, 7.5, 1.6, 6], residential: [3, 5, 1.1, 5], oldtown: [1.2, 3, 0.7, 3], beach: [1.5, 3.5, 0.8, 3], hills: [5, 10, 3, 5], industrial: [3, 6, 1.2, 3], midtown: [2, 4, 0.8, 3], downtown: [1.2, 3, 0.7, 3],
  };
  const DRIVES = ['concrete/driveway', 'concrete/driveway', 'concrete/walk-plain', 'asphalt/plain-worn-cracked', 'asphalt/plain-bleached-cracked', 'concrete/road-smooth-cracked'];
  const WALKS = ['concrete/walk-plain', 'concrete/walk-small', 'concrete/walk-new', 'paving/running-red', 'paving/basket-tan', 'paving/slabs-sandstone', 'concrete/walk-square-cracked'];

  /** A fenced back yard and, on some plots, a low fence along the street, with openings where the path and the drive come in. */
  const yardFence = (f: Frame, house: Rect, startL: number, startR: number, gaps: [number, number][]): void => {
    const lot = f.lot;
    const [pb, pf] = FENCED[f.type];
    const m = 0.25;
    const side = (v: number, s: -1 | 1): Vec2 => at(f, (s < 0 ? left(f, v) + m : right(f, v) - m), v);
    const rearL = at(f, f.ua + m, f.va - m);
    const rearR = at(f, f.ub - m, f.vb - m);
    if (rnd(lot.id, 60) < pb) {
      const list = BACK_FENCE[f.type];
      const street = list[Math.floor(rnd(lot.edge, lot.side, 61) * list.length)];
      const style = rnd(lot.id, 62) < 0.55 ? street : list[Math.floor(rnd(lot.id, 63) * list.length)];
      fence(style, side(startL, -1), rearL);
      fence(style, rearL, rearR);
      fence(style, rearR, side(startR, 1));
      // Returns to the house, with a way through beside it.
      for (const s of [-1, 1] as const) {
        const v = s < 0 ? startL : startR;
        if (v < house[2] || v > house[3]) continue;
        const [e, h] = [s < 0 ? left(f, v) + m : right(f, v) - m, s < 0 ? house[0] : house[1]];
        const run = Math.abs(h - e);
        if (run < 0.9) continue;
        fence(style, at(f, e, v), at(f, run > 2.4 ? h + s : h, v));
      }
    }
    const vf = Math.max(0, f.v0) + 0.3;
    if (rnd(lot.id, 64) < pf && house[2] - vf > 2.2) {
      const list = FRONT_FENCE[f.type];
      const style = rnd(lot.id, 65) < 0.5 ? list[Math.floor(rnd(lot.edge, lot.side, 66) * list.length)] : list[Math.floor(rnd(lot.id, 67) * list.length)];
      let u = left(f, vf) + m;
      const end = right(f, vf) - m;
      for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
        if (g0 > u + 0.7) fence(style, at(f, u, vf), at(f, Math.min(g0, end), vf));
        u = Math.max(u, g1);
      }
      if (end > u + 0.7) fence(style, at(f, u, vf), at(f, end, vf));
      fence(style, side(vf, -1), side(Math.max(vf + 1, startL), -1));
      fence(style, side(vf, 1), side(Math.max(vf + 1, startR), 1));
    }
  };

  /** The flat roof of a model, if it has one: how high it lies, and where on it (model x, z) there is room to stand something. */
interface Deck {
  y: number;
  spots: [number, number][];
  /** Is there roof under the whole of a unit of these half sizes standing at (x, z), clear of what stands higher? */
  fits: (x: number, z: number, hx: number, hz: number) => boolean;
}
const decks = new Map<string, Deck | null>();
function deck(model: string): Deck | null {
  const known = decks.get(model);
  if (known !== undefined) return known;
  const { parts, min, max } = MODELS.find((m) => m.id === model)!.build();
  // Level faces looking up, by height: the roof is the widest of those in the upper part of the building.
  const levels = new Map<number, { area: number; tris: number[][] }>();
  const above: number[][] = [];
  for (const p of parts) {
    const P = p.positions;
    for (let i = 0; i < p.indices.length; i += 3) {
      const [a, b, c] = [p.indices[i] * 3, p.indices[i + 1] * 3, p.indices[i + 2] * 3];
      const t = [P[a], P[a + 2], P[b], P[b + 2], P[c], P[c + 2]];
      const [lo, hi] = [Math.min(P[a + 1], P[b + 1], P[c + 1]), Math.max(P[a + 1], P[b + 1], P[c + 1])];
      if (hi > max[1] * 0.5) above.push([...t, hi]);
      const area = ((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2;
      if (hi - lo > 0.02 || lo < Math.max(3, max[1] * 0.5) || Math.abs(area) < 0.5 || p.normals[a + 1] < 0.9) continue;
      const l = levels.get(Math.round(lo * 5)) ?? levels.set(Math.round(lo * 5), { area: 0, tris: [] }).get(Math.round(lo * 5))!;
      l.area += Math.abs(area);
      l.tris.push([...t, lo]);
    }
  }
  const best = [...levels.values()].sort((a, b) => b.area - a.area)[0];
  let out: Deck | null = null;
  if (best && best.area > Math.max(90, 0.45 * (max[0] - min[0]) * (max[2] - min[2]))) {
    const y = best.tris[0][6];
    const inTri = (t: number[], x: number, z: number): boolean => {
      const s = (i: number, j: number): number => (t[j] - t[i]) * (z - t[i + 1]) - (t[j + 1] - t[i + 1]) * (x - t[i]);
      const [d0, d1, d2] = [s(0, 2), s(2, 4), s(4, 0)];
      return (d0 >= 0 && d1 >= 0 && d2 >= 0) || (d0 <= 0 && d1 <= 0 && d2 <= 0);
    };
    const on = (x: number, z: number): boolean => best.tris.some((t) => inTri(t, x, z));
    // Whatever of the model stands higher than the roof (a parapet, a stair head, a sign) is not to be stood in.
    const high = above.filter((t) => t[6] > y + 0.25);
    const clear = (x: number, z: number): boolean => !high.some((t) => Math.min(t[0], t[2], t[4]) < x + 1.6 && Math.max(t[0], t[2], t[4]) > x - 1.6 && Math.min(t[1], t[3], t[5]) < z + 1.6 && Math.max(t[1], t[3], t[5]) > z - 1.6);
    const spots: [number, number][] = [];
    for (let x = min[0] + 2.4; x <= max[0] - 2.4; x += 3.2)
      for (let z = min[2] + 2.4; z <= max[2] - 2.4; z += 3.2) if ([[0, 0], [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].every(([dx, dz]) => on(x + dx, z + dz)) && clear(x, z)) spots.push([x, z]);
    const fits = (x: number, z: number, hx: number, hz: number): boolean => {
      const [nx, nz] = [Math.max(1, Math.ceil(hx)), Math.max(1, Math.ceil(hz))];
      for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) if (!on(x + (i / nx) * hx, z + (j / nz) * hz)) return false;
      return !high.some((t) => Math.min(t[0], t[2], t[4]) < x + hx + 0.2 && Math.max(t[0], t[2], t[4]) > x - hx - 0.2 && Math.min(t[1], t[3], t[5]) < z + hz + 0.2 && Math.max(t[1], t[3], t[5]) > z - hz - 0.2);
    };
    if (spots.length) out = { y, spots, fits };
  }
  decks.set(model, out);
  return out;
}
const ROOF_AC = ['buildpart/ac-1', 'buildpart/ac-2', 'buildpart/ac-1-beige', 'buildpart/ac-2-beige', 'buildpart/ac-3', 'buildpart/ac-3-beige'];
const ROOF_SMALL = ['buildpart/vent-1', 'buildpart/vent-2', 'buildpart/vent-3', 'buildpart/skylight-1', 'buildpart/skylight-2', 'buildpart/duct-1'];

const BACK_TABLES = ['park/picnic-table-wood', 'park/picnic-table-red', 'park/picnic-table-metal', 'furniture/bench-picnic-weathered'];
  const BACK_PLAY = ['park/swing-2', 'park/swing-toddler', 'park/sandbox', 'park/swing-old', 'park/pergola'];
  const POINTS = ['furniture/bin-point-block', 'furniture/bin-point-block-empty', 'furniture/bin-point-cage', 'furniture/bin-point-cage-carts'];
  const kerb = new Map<string, number>();
  const houseLot = (f: Frame): boolean => {
    const lot = f.lot;
    const [s0, s1, sideMin, back] = HOUSE_SET[f.type];
    const street = HOUSES[f.type];
    const fav = street[Math.floor(rnd(lot.edge, 20) * street.length)][0];
    const base = Math.max(0, f.v0) + s0 + (s1 - s0) * rnd(lot.edge, lot.side, 21) + (rnd(lot.id, 22) - 0.5) * 0.8;
    let made: Building | null = null;
    let [uc, vf] = [0, 0];
    for (const [cands, side, salt] of [[mix(street, fav), sideMin, 23], [mix(ANY_HOUSE), 0.6, 24]] as [[Shape, number][], number, number][]) {
      let tries = 0;
      for (const s of order(cands, lot, salt)) {
        // A shallow plot brings the house forward before it gives up its back yard.
        vf = Math.min(base, Math.max(Math.max(0, f.v0) + Math.min(s0, 1.5), f.d - back - s.d));
        if (vf + s.d > f.d - 1.2) continue;
        const [lo, hi] = span(f, vf, vf + s.d, side);
        if (hi - lo < s.w) continue;
        const slack = hi - lo - s.w;
        // To one side where that leaves room for a drive beside the house, else near the middle.
        const plan = HOUSE_PLANS.get(s.id);
        const t = !plan?.garage && slack > 2.4 && slack < 9 ? (rnd(lot.id, 25) < 0.5 ? 0.04 : 0.96) : 0.3 + 0.4 * rnd(lot.id, 26);
        uc = lo + s.w / 2 + slack * t;
        const door = plan ? modelUV(f, s.id, uc, vf, plan.door[0], plan.door[1])[0] : uc;
        made = place(f, s.id, uc, vf, { maxRelief: f.type === 'hills' ? 4.6 : 3.2, doorU: plan?.garage ? modelUV(f, s.id, uc, vf, plan.garage.x, plan.garage.z)[0] : door, ...(plan?.garage ? { level: modelUV(f, s.id, uc, vf, plan.garage.x, plan.garage.z + 1.5) } : {}) });
        if (made || ++tries >= 6) break;
      }
      if (made) break;
    }
    if (!made) return false;
    remember(lot, made.model);
    const model = made.model;
    const plan = HOUSE_PLANS.get(model);
    const house: Rect = [uc - made.hx, uc + made.hx, vf, vf + 2 * made.hz];
    const body = plan ? plan.body.map(([x0, , , z1]) => modelUV(f, model, uc, vf, x0, z1)[1]) : [vf];
    const wallV = Math.min(...body.slice(0, 1));
    const gaps: [number, number][] = [];
    const old = f.type === 'oldtown' || f.type === 'beach' || f.type === 'midtown' || f.type === 'downtown';
    // Drive: to the garage door, or beside the house.
    let drive: Rect | null = null;
    if (plan?.garage) {
      const [gu, gv] = modelUV(f, model, uc, vf, plan.garage.x, plan.garage.z);
      drive = [gu - plan.garage.w / 2 - 0.35, gu + plan.garage.w / 2 + 0.35, -f.gap, gv];
    } else if (!old || rnd(lot.id, 30) < 0.3) {
      const [lo, hi] = span(f, 0, house[3], 0.4);
      const [roomL, roomR] = [house[0] - lo, hi - house[1]];
      const s = roomL > roomR ? -1 : 1;
      if (Math.max(roomL, roomR) >= 3 && rnd(lot.id, 31) < 0.8) drive = s < 0 ? [lo, lo + 2.7, -f.gap, house[2] + made.hz * (0.6 + rnd(lot.id, 32))] : [hi - 2.7, hi, -f.gap, house[2] + made.hz * (0.6 + rnd(lot.id, 32))];
    }
    const dtex = DRIVES[Math.floor(rnd(lot.id, 33) * DRIVES.length)];
    // Where the drive can pass the house, it may run on to a garage of its own behind it.
    let garageBack: number | null = null;
    if (drive && !plan?.garage && rnd(lot.id, 340) < { suburb: 0.7, residential: 0.5, hills: 0.6, beach: 0.2, oldtown: 0, industrial: 0, midtown: 0, downtown: 0 }[f.type]) {
      const s = drive[0] < house[0] ? -1 : 1;
      const [hw, hd, hh, pitch] = [1.8, 3, 2.5, 0.45];
      const v0 = house[3] + 0.6;
      const [lo, hi] = span(f, 0, v0 + 2 * hd + 0.4, 0.4);
      const [uc, vc] = [s < 0 ? lo + hw + 0.2 : hi - hw - 0.2, v0 + hd];
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([du, dv]) => [uc + du, vc + dv]);
      const hs = corners.map(([u, v]) => ground(f, u, v));
      const fits = (s < 0 ? house[0] - lo : hi - house[1]) >= 2 * hw - 0.2 && f.d - (vc + hd) >= 1.2;
      if (fits && Math.max(...hs) - Math.min(...hs) < 0.35 && corners.every(([u, v]) => ((q) => site.at(q.x, q.y) !== ROAD && inPoly(f.poly, q.x, q.y))(at(f, u, v)))) {
        const p = at(f, uc, vc);
        const b = tile(p.x, p.y);
        const pose: Pose = { o: [p.x, Math.max(...hs), p.y], x: [f.tx, 0, f.ty], y: [0, 1, 0], z: [f.nx, 0, f.ny] };
        const wall = SHED_WALLS[Math.floor(rnd(lot.id, 341) * 5)];
        const roof = GARAGE_ROOFS[Math.floor(rnd(lot.id, 342) * GARAGE_ROOFS.length)];
        box(b, 'concrete/walk-plain', pose, [0, -0.2, 0], [hw + 0.08, 0.26, hd + 0.08], 'Y');
        box(b, wall, pose, [0, hh / 2, 0], [hw, hh / 2, hd], 'yY');
        box(b, GARAGE_DOORS[Math.floor(rnd(lot.id, 343) * GARAGE_DOORS.length)], pose, [0, 1.11, -hd - 0.02], [1.3, 1.05, 0.03], 'yY');
        const eave = hw + 0.3;
        const [c, sn] = [1 / Math.hypot(1, pitch), pitch / Math.hypot(1, pitch)];
        for (const e of [-1, 1]) {
          const o = poseAt(pose, (e * eave) / 2, hh + (eave * pitch) / 2 - 0.3 * pitch + 0.04, 0);
          box(b, roof, { o, x: [f.tx * c, -e * sn, f.ty * c], y: [e * sn * f.tx, c, e * sn * f.ty], z: pose.z }, [0, 0, 0], [eave / 2 / c, 0.05, hd + 0.3]);
        }
        for (const z of [-hd, hd]) b.tri(wall, poseAt(pose, -hw, hh, z), poseAt(pose, hw, hh, z), poseAt(pose, 0, hh + hw * pitch, z), [[0, 0], [2 * hw, 0], [hw, hw * pitch]]);
        drive = [uc - 1.5, uc + 1.5, -f.gap, v0];
        garageBack = vc + hd;
        const r: Rect = [uc - hw, uc + hw, vc - hd, vc + hd];
        f.taken.push(r);
        f.solid.push(r);
        out.garages++;
      }
    }
    if (drive) {
      pave(f, f.type === 'industrial' && !plan?.garage ? 'ground/gravel-dirt' : dtex, drive, 0.05, 3);
      f.taken.push(drive);
      gaps.push([drive[0] - 0.2, drive[1] + 0.2]);
      // Room on it for a car, clear of the pavement.
      if (drive[3] >= 5.6 && drive[1] - drive[0] >= 2.5) {
        const p = at(f, (drive[0] + drive[1]) / 2, Math.max(2.9, drive[3] - 2.9 - 1.5 * rnd(lot.id, 35)));
        out.spots.push({ x: p.x, y: p.y, h: site.heightAt(p.x, p.y) + 0.06, yaw: Math.atan2(f.ny, f.nx), lot: lot.id, kind: 'drive' });
      }
    }
    // Path from the door to the pavement, or across to the drive.
    const [du, dv0] = plan ? modelUV(f, model, uc, vf, plan.door[0], plan.door[1]) : [uc, vf];
    const dv = dv0 - steps(f, du, dv0, made.floor, 1.4);
    const wtex = rnd(lot.id, 34) < 0.45 ? dtex.replace('asphalt/plain-worn-cracked', 'concrete/walk-plain').replace('asphalt/plain-bleached-cracked', 'concrete/walk-plain') : WALKS[Math.floor(rnd(lot.id, 35) * WALKS.length)];
    const beside = drive && (du < drive[0] ? drive[0] - du : du - drive[1]);
    if (drive && beside! > 1 && beside! < 9 && dv > 1.6 && rnd(lot.id, 36) < 0.5) {
      const across: Rect = du < drive[0] ? [du - 0.55, drive[0], dv - 1.5, dv - 0.4] : [drive[1], du + 0.55, dv - 1.5, dv - 0.4];
      pave(f, wtex, [du - 0.55, du + 0.55, dv - 0.4, dv], 0.06, 3);
      pave(f, wtex, across, 0.06, 3);
      f.taken.push([du - 0.55, du + 0.55, dv - 1.5, dv], across);
    } else if (!(drive && du > drive[0] - 0.4 && du < drive[1] + 0.4)) {
      const walk: Rect = [du - 0.55, du + 0.55, -f.gap, dv];
      pave(f, wtex, walk, 0.06, 3);
      f.taken.push(walk);
      gaps.push([du - 0.75, du + 0.75]);
    }
    // Where the houses stand close to the street the strip before them is as often paved as planted, and some further out have gravelled theirs over.
    const paved = wallV - Math.max(0, f.v0) < 3.2 ? rnd(lot.id, 363) < (old ? 0.75 : 0.45) : rnd(lot.id, 363) < (f.type === 'residential' ? 0.1 : 0.03);
    if (paved && f.type !== 'hills') {
      court(f, wallV - Math.max(0, f.v0) < 3.2 ? courtTex(lot, 4) : rnd(lot.id, 364) < 0.5 ? 'ground/gravel-dirt' : dtex, -f.gap, wallV);
      harden(f, wallV);
    }
    // Planting against the front wall, a tree or two, the mail box and the bins.
    const lush = f.type === 'industrial' ? 0.3 : paved ? 0.5 : 1;
    for (let i = 0; i < 4; i++) {
      if (rnd(lot.id, 40, i) > 0.45 * lush) continue;
      const u = house[0] + 0.8 + rnd(lot.id, 41, i) * (house[1] - house[0] - 1.6);
      const heavy = rnd(lot.id, 42, i) < 0.12;
      small(f, heavy ? SHRUBS[Math.floor(rnd(lot.id, 43, i) * SHRUBS.length)] : BEDS[Math.floor(rnd(lot.id, 43, i) * BEDS.length)], 'plant', u, wallV - 0.75, rnd(lot.id, 44, i) * 6, 0.6);
    }
    const [lo, hi] = span(f, 0, f.d, 0);
    const pt = { suburb: 0.55, residential: 0.4, oldtown: 0.15, beach: 0.3, hills: 0.6, industrial: 0.1, midtown: 0.15, downtown: 0.1 }[f.type];
    if (rnd(lot.id, 45) < pt && wallV > 4.5) for (let i = 0; i < 3; i++) if (tree(f, lo + 2 + rnd(lot.id, 46, i) * (hi - lo - 4), 1.8 + rnd(lot.id, 47, i) * (wallV - 4), 48 + i, 2.2)) break;
    // A low hedge down one side of the front garden, where the drive is not.
    if (!old && f.type !== 'industrial' && wallV > 3.5 && !(drive && drive[1] > house[1]) && rnd(lot.id, 350) < (f.type === 'residential' ? 0.25 : 0.33)) {
      let made = 0;
      for (let v = Math.max(0, f.v0) + 1.6; v + 1.1 < wallV + 2.5; v += 2.2) if (small(f, 'plant/hedge-garden', 'plant', right(f, v) - 0.55, v, Math.PI / 2, 0.4)) made++;
      out.hedges += made;
    }
    const yard = f.d - house[3];
    // What a back garden is kept for: a terrace behind the house with a table on it, somewhere to grill, a swing or a sand pit for the children.
    if (yard > 6.5 && f.type !== 'industrial') {
      const w = Math.min(house[1] - house[0] - 1, 3.2 + 2 * rnd(lot.id, 301));
      const pu = (house[0] + house[1]) / 2 + (rnd(lot.id, 302) - 0.5) * (house[1] - house[0] - w);
      const patio: Rect = [pu - w / 2, pu + w / 2, house[3], house[3] + 2.8];
      const [plo, phi] = span(f, patio[2], patio[3], 0.5);
      if (rnd(lot.id, 300) < 0.55 && w > 2.6 && patio[0] > plo && patio[1] < phi && f.taken.every(([u0, u1, v0, v1]) => patio[1] <= u0 || patio[0] >= u1 || patio[3] <= v0 || patio[2] >= v1 - 0.01) && Math.abs(ground(f, pu, house[3] + 2.8) - ground(f, pu, house[3])) < 0.5) {
        pave(f, WALKS[Math.floor(rnd(lot.id, 303) * WALKS.length)], patio, 0.06, 3);
        f.taken.push(patio);
        out.patios++;
        if (rnd(lot.id, 304) < 0.7) stand(f, BACK_TABLES[Math.floor(rnd(lot.id, 305) * BACK_TABLES.length)], 'yard', pu + (rnd(lot.id, 306) - 0.5) * (w - 2.2), house[3] + 1.5);
        if (rnd(lot.id, 307) < 0.4) stand(f, 'park/grill', 'yard', pu + (rnd(lot.id, 308) < 0.5 ? -1 : 1) * (w / 2 - 0.5), house[3] + 2.2);
      }
      const [qu, qv] = [lo + 3.2 + rnd(lot.id, 310) * Math.max(0, hi - lo - 6.4), house[3] + 5 + rnd(lot.id, 311) * Math.max(0, yard - 8.5)];
      if (yard > 9.5 && hi - lo > 8 && rnd(lot.id, 309) < (f.type === 'suburb' ? 0.3 : 0.2) && free(f, qu, qv, 2.8) && Math.abs(ground(f, qu - 2, qv) - ground(f, qu + 2, qv)) < 0.4) stand(f, BACK_PLAY[Math.floor(rnd(lot.id, 312) * BACK_PLAY.length)], 'yard', qu, qv);
    }
    // A shed in a back corner, and washing on a line.
    if (yard > 7 && hi - lo > 9 && rnd(lot.id, 320) < { suburb: 0.45, residential: 0.4, oldtown: 0.25, beach: 0.25, hills: 0.3, industrial: 0.3, midtown: 0.2, downtown: 0.1 }[f.type]) {
      const [hw, hd] = [1.1 + 0.5 * rnd(lot.id, 321), 0.85 + 0.35 * rnd(lot.id, 322)];
      const s = rnd(lot.id, 323) < 0.5 ? -1 : 1;
      const [u, v] = [s < 0 ? lo + hw + 0.9 : hi - hw - 0.9, f.d - hd - 1];
      const p = at(f, u, v);
      if (free(f, u, v, hw + 0.3) && site.at(p.x, p.y) !== ROAD && Math.abs(ground(f, u - hw, v) - ground(f, u + hw, v)) < 0.25) {
        const b = tile(p.x, p.y);
        const y = Math.max(ground(f, u - hw, v), ground(f, u + hw, v));
        const pose = (tilt: number): Pose => ({ o: [p.x, y, p.y], x: [f.tx, 0, f.ty], y: [0, 1, 0], z: [f.nx, tilt, f.ny] });
        box(b, SHED_WALLS[Math.floor(rnd(lot.id, 324) * SHED_WALLS.length)], pose(0), [0, 1, 0], [hw, 1.05, hd], 'y');
        box(b, SHED_ROOFS[Math.floor(rnd(lot.id, 325) * SHED_ROOFS.length)], pose(-0.16), [0, 2.1, 0], [hw + 0.18, 0.04, hd + 0.22]);
        box(b, 'trim/paint-white-old', pose(0), [(rnd(lot.id, 326) - 0.5) * hw, 0.92, -hd - 0.02], [0.42, 0.92, 0.02], 'y');
        f.taken.push([u - hw, u + hw, v - hd, v + hd]);
        f.solid.push([u - hw, u + hw, v - hd, v + hd]);
        out.sheds++;
      }
    }
    if (yard > 8 && hi - lo > 9 && f.type !== 'hills' && f.type !== 'downtown' && rnd(lot.id, 330) < (f.type === 'suburb' ? 0.12 : 0.24)) {
      const [u, v] = [lo + 3.6 + rnd(lot.id, 331) * Math.max(0, hi - lo - 7.2), house[3] + 4.4 + rnd(lot.id, 332) * Math.max(0, yard - 7.4)];
      const p = at(f, u, v);
      if (free(f, u, v, 2.6) && site.at(p.x, p.y) !== ROAD && Math.abs(ground(f, u - 2.2, v) - ground(f, u + 2.2, v)) < 0.2) {
        const b = tile(p.x, p.y);
        const pose: Pose = { o: [p.x, ground(f, u, v), p.y], x: [f.tx, 0, f.ty], y: [0, 1, 0], z: [f.nx, 0, f.ny] };
        for (const e of [-2.2, 2.2]) {
          box(b, ZINC, pose, [e, 0.9, 0], [0.03, 0.9, 0.03], 'y');
          box(b, ZINC, pose, [e, 1.8, 0], [0.025, 0.025, 0.45]);
        }
        for (const z of [-0.4, 0.4]) {
          box(b, ZINC, pose, [0, 1.8, z], [2.2, 0.006, 0.006], 'xX');
          let x = -1.9 + 0.5 * rnd(lot.id, 333, z);
          for (let i = 0; i < 4 && x < 1.7; i++) {
            const [w, h] = [0.22 + 0.3 * rnd(lot.id, 334, i, z), 0.28 + 0.3 * rnd(lot.id, 335, i, z)];
            if (rnd(lot.id, 336, i, z) < 0.75) box(b, WASHING[Math.floor(rnd(lot.id, 337, i, z) * WASHING.length)], pose, [x + w, 1.79 - h, z], [w, h, 0.008]);
            x += 2 * w + 0.12 + 0.3 * rnd(lot.id, 338, i, z);
          }
        }
        f.taken.push([u - 2.4, u + 2.4, v - 0.6, v + 0.6]);
        f.solid.push([u - 2.4, u + 2.4, v - 0.6, v + 0.6]);
        out.lines++;
      }
    }
    for (let i = 0; i < 3; i++) if (rnd(lot.id, 50, i) < [0.7, 0.4, 0.25][i] * lush && yard > 5) tree(f, lo + 2 + rnd(lot.id, 51, i) * (hi - lo - 4), house[3] + 2.6 + rnd(lot.id, 52, i) * (yard - 4.4), 53 + i, 2.4);
    if (!old && rnd(lot.id, 55) < (f.type === 'suburb' || f.type === 'hills' ? 0.85 : 0.4)) {
      const u = drive ? (drive[0] - 0.6 > lo + 0.5 ? drive[0] - 0.6 : drive[1] + 0.6) : du + 1.2;
      small(f, ['furniture/mail-curb-black', 'furniture/mail-curb-white', 'furniture/mail-curb-galvanized'][Math.floor(rnd(lot.id, 56) * 3)], 'yard', u, Math.max(0, f.v0) + 0.5, Math.PI, 0.3);
    }
    if (rnd(lot.id, 57) < 0.35) {
      const s = drive && drive[0] < house[0] ? -1 : 1;
      small(f, ['furniture/bin-cart-black', 'furniture/bin-cart-green', 'furniture/bin-cart-blue', 'furniture/bin-cart-trio'][Math.floor(rnd(lot.id, 58) * 4)], 'bin', s < 0 ? house[0] - 0.7 : house[1] + 0.7, house[2] + made.hz, s < 0 ? Math.PI / 2 : -Math.PI / 2, 0.5);
    }
    // One house in every nine or so has the street's collection point at the corner of its front garden, open to the pavement.
    const turnOf = (kerb.get(keyOf(lot)) ?? Math.floor(rnd(lot.edge, lot.side, 60) * 9)) + 1;
    kerb.set(keyOf(lot), turnOf);
    if (turnOf % 9 === 0 && f.type !== 'hills') {
      const model = POINTS[Math.floor(rnd(lot.id, 61) * POINTS.length)];
      for (const s of [-1, 1]) if (stand(f, model, 'bin', s < 0 ? lo + 1.6 : hi - 1.6, Math.max(0, f.v0) + 0.95)) break;
    }
    const start = house[2] + made.hz * (0.5 + 0.8 * rnd(lot.id, 59));
    // On the side the drive runs down, the fence starts where the drive ends: behind the garage, if the drive goes on to one.
    const startOn = (s: -1 | 1): number =>
      drive && !plan?.garage && (s < 0 ? drive[0] < house[0] : drive[1] > house[1]) ? (garageBack !== null ? garageBack + 0.3 : Math.min(house[3], drive[3] + 0.3)) : start;
    yardFence(f, house, startOn(-1), startOn(1), gaps);
    return true;
  };

  // --- Parking ---
  const ASPHALT = ['asphalt/plain-used-patched', 'asphalt/plain-worn-sealed', 'asphalt/plain-worn-cracked', 'asphalt/plain-bleached-cracked', 'asphalt/plain-used-clean', 'asphalt/plain-worn-patched', 'asphalt/plain-bleached-sealed'];
  const asphalt = (lot: Lot): string => ASPHALT[Math.floor(rnd(lot.id, 80) * ASPHALT.length)];
  /** The lines of one parking space, 2.6 m by 5.4 m, in two pieces along its length so that it lies on the paving under it. */
  const mark = (b: MeshBuilder, tex: string, cx: number, cy: number, yaw: number): void => {
    const { mw, mh } = b.part(tex);
    const pt = (a: number, c: number): [number, number, number] => {
      const p = Site.local(cx, cy, yaw, a * 1.3, c * 2.7);
      return [p.x, site.heightAt(p.x, p.y) + 0.09, p.y];
    };
    for (const c of [-1, 0]) b.quadUp(tex, pt(-1, c), pt(1, c), pt(1, c + 1), pt(-1, c + 1), 0, [[0, ((c + 1) / 2) * mh], [mw, ((c + 1) / 2) * mh], [mw, ((c + 2) / 2) * mh], [0, ((c + 2) / 2) * mh]]);
  };
  /**
   * Marks parking spaces in rows across a paved rectangle, from its far end towards the road; returns how many.
   * `lanes` are the u ranges of the ways in: every row but the far one leaves them open, so that each aisle is reached.
   */
  const stalls = (f: Frame, r: Rect, keep?: Rect, lanes: [number, number][] = []): number => {
    const spots = stallSpots(f, r, keep, lanes);
    const worn = rnd(f.lot.id, 79) < 0.6;
    // The closed end of a space is away from its aisle: the far row and every second one after it open towards the road,
    // and the texture's closed end is on the road side as it comes.
    for (const [p, k] of spots) {
      mark(tile(p.x, p.y), worn ? 'symbol/parking-stall-white-worn' : 'symbol/parking-stall-white-new', p.x, p.y, f.yaw + (k % 2 ? 0 : Math.PI));
      out.spots.push({ x: p.x, y: p.y, h: site.heightAt(p.x, p.y) + 0.06, yaw: Math.atan2(f.ny, f.nx) + (k % 2 ? Math.PI : 0), lot: f.lot.id, kind: 'stall' });
    }
    out.stalls += spots.length;
    return spots.length;
  };
  /** Where `stalls` would mark its spaces, each with the number of its row. */
  const stallSpots = (f: Frame, r: Rect, keep?: Rect, lanes: [number, number][] = []): [Vec2, number][] => {
    const [u0, u1, v0, v1] = r;
    const n = Math.floor((u1 - u0) / 2.6);
    if (n < 2 || v1 - v0 < 5.4) return [];
    const rows: number[] = [];
    // A row against the far edge, an aisle, then rows back to back with an aisle between each pair.
    for (let v = v1 - 5.4, k = 1; v >= v0 - 0.01; k++) {
      if (k > 1 && k % 2 === 1 && v - 6.2 < v0 - 0.01) break;
      rows.push(v);
      v -= 5.4 + (k % 2 === 1 ? 6.2 : 0);
    }
    const spots: [Vec2, number][] = [];
    const start = (u0 + u1) / 2 - (n * 2.6) / 2;
    rows.forEach((v, k) => {
      for (let i = 0; i < n; i++) {
        const [u, vc] = [start + (i + 0.5) * 2.6, v + 2.7];
        if (!free(f, u, vc, 1.2, f.solid) || (keep && u > keep[0] && u < keep[1] && vc > keep[2] && vc < keep[3])) continue;
        if (k > 0 && lanes.some(([a, b]) => u + 1.3 > a && u - 1.3 < b)) continue;
        const p = at(f, u, vc);
        if (site.at(p.x, p.y) !== LOT && site.at(p.x, p.y) !== FREE) continue;
        spots.push([p, k]);
      }
    });
    return spots;
  };
  /** Width between a block and the boundary that is kept clear for the drive to a car park behind: 3.25 m by the car park's own measure. */
  const LANE = 3.75;
  /**
   * A paved yard behind the buildings with marked spaces, and a drive to it down one side of the lot where there is room: returns the drive.
   * 'bins' where there is to be no car park but the bins already stand behind the buildings.
   */
  const rearParking = (f: Frame, group: Rect, gaps: [number, number][]): Rect | 'bins' | null => {
    const lot = f.lot;
    const [L, R] = span(f, 0, f.d - 1, 0.5);
    const from = group[3] + 1.5;
    if (f.d - 1 - from < 6 || R - L < 8) return null;
    const [roomL, roomR] = [group[0] - L, R - group[1]];
    // (Measured over the whole depth of the lot, which on a tapering one is a little less than the lane kept beside the block.)
    if (Math.max(roomL, roomR) < 2.9) return null;
    const tex = asphalt(lot);
    const drive: Rect = roomL > roomR ? [L, L + Math.min(roomL - 0.2, 5.5), -f.gap, from] : [R - Math.min(roomR - 0.2, 5.5), R, -f.gap, from];
    const park: Rect = [L + 0.3, R - 0.3, from + 0.2, f.d - 1.2];
    // The bins go in first, for the spaces are marked around them. No car park where they leave no room to park: the land behind stays a yard.
    const built = f.solid.length;
    const bins = refuse(f, roomL > roomR ? 1 : -1, lot.area > 1100 || lot.floors >= 4, f.d - 1.1);
    if (stallSpots(f, park, undefined, [[drive[0], drive[1]]]).length < 2) return bins ? 'bins' : null;
    pave(f, tex, drive, 0.05, 4);
    const pad: Rect = [L, R, from, f.d - 1];
    // The bins stand on the car park: it is paved under them, as under nothing else that is built.
    const onPad = f.solid.splice(built);
    pave(f, tex, pad, 0.05, 4);
    f.solid.push(...onPad);
    f.taken.push(drive, pad);
    gaps.push([drive[0] - 0.2, drive[1] + 0.2]);
    stalls(f, park, undefined, [[drive[0], drive[1]]]);
    return drive;
  };

  // --- Flats ---
  // Where the plots around are nearly all houses, a block of flats keeps to their height: four storeys alone among bungalows are out of place.
  const mid = (lot: Lot): Vec2 => ({ x: lot.poly.reduce((a, p) => a + p.x, 0) / lot.poly.length, y: lot.poly.reduce((a, p) => a + p.y, 0) / lot.poly.length });
  const HOOD = 90;
  const hood = new Map<number, [x: number, y: number, house: boolean][]>();
  for (const lot of land.lots) {
    if (lot.use === 'OS' || lot.use === 'PK') continue;
    const c = mid(lot);
    const key = Math.floor(c.x / HOOD) * 4096 + Math.floor(c.y / HOOD);
    (hood.get(key) ?? hood.set(key, []).get(key)!).push([c.x, c.y, lot.use === 'R1']);
  }
  const amongHouses = (lot: Lot): boolean => {
    const c = mid(lot);
    let [all, houses] = [0, 0];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const [x, y, house] of hood.get((Math.floor(c.x / HOOD) + i) * 4096 + Math.floor(c.y / HOOD) + j) ?? [])
          if (Math.hypot(x - c.x, y - c.y) < HOOD) [all, houses] = [all + 1, houses + (house ? 1 : 0)];
    return houses >= 0.6 * all;
  };
  const flats = (f: Frame, use: LandUse = f.lot.use): boolean => {
    const lot = f.lot;
    const high = use === 'R3';
    const low = !high && f.type !== 'oldtown' && f.type !== 'midtown' && f.type !== 'downtown' && amongHouses(lot);
    const floors = high ? Math.max(6, lot.floors) : low ? 2 : Math.min(6, Math.max(2, lot.floors));
    const target = floors * 3.05 + 2;
    const t = f.type;
    const soft = t === 'suburb' || t === 'residential' || t === 'beach';
    const urban = t === 'oldtown' || t === 'midtown' || t === 'downtown';
    const cands: [Shape, number][] = high
      ? [...family('apartment/highrise').map((s) => [s, tall(s, target, 0.22)] as [Shape, number]), ...family('apartment/balcony').map((s) => [s, 0.6 * tall(s, target, 0.22)] as [Shape, number])]
      : [
          ...family('apartment/walkup').map((s) => [s, (t === 'hills' ? 0.6 : 2) * tall(s, target)] as [Shape, number]),
          ...family('apartment/balcony').map((s) => [s, 1.5 * tall(s, target)] as [Shape, number]),
          ...family('apartment/dingbat').map((s) => [s, (soft ? 2 : 0.3) * tall(s, target)] as [Shape, number]),
          ...family('apartment/motel').map((s) => [s, (soft ? 1 : 0.2) * tall(s, target)] as [Shape, number]),
          ...family('apartment/rowhouse').map((s) => [s, (urban ? 2 : t === 'residential' ? 0.8 : 0.2) * tall(s, target)] as [Shape, number]),
          ...family('house/duplex').map((s) => [s, (urban ? 0.2 : low ? 2.5 : 1) * tall(s, target)] as [Shape, number]),
        ].filter(([s]) => (!low || s.h < 9.5) && (lot.use !== 'R3' || !s.id.startsWith('house/'))) as [Shape, number][];
    // In the middle of town a block stands at the back of the pavement, wall beside wall but for a passage; further out it keeps a paved forecourt.
    const front = Math.max(0, f.v0) + (urban ? (high ? 1 : 0.4) + 1.4 * rnd(lot.edge, lot.side, 81) : high ? 3 + 2 * rnd(lot.edge, lot.side, 81) : 2 + 1.5 * rnd(lot.edge, lot.side, 81));
    const apart = high ? (urban ? 6 : 8) : urban ? 1.8 : 3;
    // The block that fills more of the frontage is the likelier one: land on a street is not left over beside the building.
    const fill = (s: Shape): number => {
      const n = Math.max(1, Math.floor((f.w - 1.6 + apart) / (s.w + apart)));
      return Math.min(1, (n * s.w) / Math.max(1, f.w - 1.6)) ** 2;
    };
    for (const c of cands) c[1] *= fill(c[0]);
    let group: Rect | null = null;
    const gaps: [number, number][] = [];
    let tries = 0;
    search: for (const side of high ? (urban ? [2, 1] : [4, 1.5]) : urban ? [0.9, 0.5] : [1.5, 0.8])
      for (const s of order(cands, lot, 82)) {
        const vf = Math.min(front, Math.max(Math.max(0, f.v0) + 1.5, f.d - 2 - s.d));
        if (vf + s.d > f.d - 1.2) continue;
        const [lo, hi] = span(f, vf, vf + s.d, side);
        if (hi - lo < s.w) continue;
        // A terrace stands wall to wall, and not as one thin house alone on a lawn.
        const row = !high && s.id.startsWith('apartment/rowhouse');
        // The coping of its parapet stands out past the side wall, and it is the walls that touch.
        const between = row ? -2 * ROW_TRIM : apart;
        const n = clamp(Math.floor((hi - lo + between) / (s.w + between)), 1, row ? 6 : 4);
        if (row && n < 2 && hi - lo > s.w + 5) continue;
        // Room for a drive down one side, or the block stands in the middle. What frontage is left after that the block is built out to fill.
        const lane = hi - lo - (n * s.w + (n - 1) * between) + side >= LANE && f.d - (vf + s.d) >= 8.5 ? Math.max(0, LANE - side) : 0;
        const k = row || s.id.startsWith('house/') ? 1 : clamp((hi - lo - lane - (n - 1) * between) / (n * s.w), 1, 1.15);
        const sw = s.w * k;
        const width = n * sw + (n - 1) * between;
        const slack = hi - lo - width;
        const pass = lane > 0 || (slack + side >= LANE && f.d - (vf + s.d) >= 8.5);
        // To one side of the lot for the drive; in the middle where there is none, or where the block does not stand at the side.
        const starts = pass ? [rnd(lot.id, 83) < 0.5 ? lo : hi - width, lo + slack / 2] : [lo + slack / 2];
        const same = shapes.get(s.id.replace(/-\d+$/, ''))!.filter((x) => x.w <= s.w + 0.01 && x.d <= s.d + 0.01 && (!row || x.w > s.w - 0.01));
        let first: Building | null = null;
        for (const start of starts) {
          for (let i = 0; i < n; i++) {
            const m = i === 0 ? s : same[Math.floor(rnd(lot.id, 84, i) * same.length)];
            const uc = start + i * (sw + between) + sw / 2;
            const b = place(f, m.id, uc, vf, { main: i === 0, stretch: k, ...(row ? { lap: ROW_TRIM + 0.005 } : {}) });
            if (!b) {
              if (i === 0 || row) break;
              continue;
            }
            first ??= b;
            remember(lot, m.id);
            group = group ? [Math.min(group[0], uc - b.hx), Math.max(group[1], uc + b.hx), vf, Math.max(group[3], vf + 2 * b.hz)] : [uc - b.hx, uc + b.hx, vf, vf + 2 * b.hz];
            const walk: Rect = [uc - 0.8, uc + 0.8, -f.gap, vf];
            pave(f, 'concrete/walk-plain', walk, 0.06, 3);
            f.taken.push(walk);
            gaps.push([uc - 1, uc + 1]);
          }
          if (first) break;
        }
        if (first || ++tries >= 5) break search;
      }
    if (!group) return false;
    const rear = rearParking(f, group, gaps);
    const drive = rear === 'bins' ? null : rear;
    // Houses divided in two keep their gardens like the houses beside them. Flats do not stand in a lawn: the forecourt and the passages
    // beside the block are paved, and behind it is the car park, a paved yard in town, or a fenced garden further out.
    const homely = !high && out.list[out.list.length - 1].model.startsWith('house/');
    if (!homely) {
      const yard = !urban && !high && !drive && f.d - group[3] > 4 && rnd(lot.id, 362) < 0.35;
      court(f, courtTex(lot), -f.gap, yard ? group[3] : f.d - 0.3);
      harden(f, yard ? group[3] : Infinity);
    }
    if (!rear) refuse(f, rnd(lot.id, 84) < 0.5 ? -1 : 1, false);
    const [lo, hi] = span(f, 0, f.d, 0);
    for (let i = 0; i < (high ? 4 : 2); i++) if (rnd(lot.id, 85, i) < 0.6) tree(f, lo + 2 + rnd(lot.id, 86, i) * (hi - lo - 4), 1.7 + rnd(lot.id, 87, i) * Math.max(0, group[2] - 3), 88 + i, 2.2);
    for (let i = 0; i < 4; i++) if (rnd(lot.id, 92, i) < 0.4) small(f, BEDS[Math.floor(rnd(lot.id, 93, i) * BEDS.length)], 'plant', group[0] + 1 + rnd(lot.id, 94, i) * (group[1] - group[0] - 2), group[2] - 0.8, rnd(lot.id, 95, i) * 6, 0.6);
    const start = group[2] + (group[3] - group[2]) * 0.5;
    // On the side of the drive to the parking behind, the fence starts past the end of the drive, not across it.
    const startOn = (s: -1 | 1): number => (drive && (s < 0 ? drive[0] < group[0] : drive[1] > group[1]) ? drive[3] + 0.3 : start);
    yardFence(f, group, startOn(-1), startOn(1), gaps);
    return true;
  };

  // --- Shops wall to wall along the street ---
  const shopRow = (f: Frame): boolean => {
    const lot = f.lot;
    const vf = Math.max(0, f.v0) + 0.1;
    const room = f.d - vf - 1;
    const target = 4.6 + (lot.floors - 1) * 3.2;
    const cands: [Shape, number][] =
      lot.floors <= 1
        ? mix([['shop/store', 12, 1]])
        : [
            ...family('shop/mixed').map((s) => [s, tall(s, target, 0.2)] as [Shape, number]),
            ...(lot.floors <= 2 ? family('shop/store').map((s) => [s, 0.2] as [Shape, number]) : []),
            ...(lot.floors >= 6 ? [...family('office/lowrise'), ...named('apartment/highrise-7', 'apartment/highrise-8', 'apartment/highrise-2', 'office/hotel-3')].map((s) => [s, 0.8 * tall(s, target * 1.1, 0.2)] as [Shape, number]) : []),
          ];
    const usable = cands.filter(([s]) => s.d <= room);
    if (!usable.length) return false;
    const [lo, hi] = span(f, vf, vf + Math.min(room, 14), 0);
    const W = hi - lo;
    let best: { seq: Shape[]; k: number; score: number } | null = null;
    for (let t = 0; t < 8; t++) {
      const list = order(usable, lot, 100 + t);
      const seq: Shape[] = [];
      let left = W;
      for (let i = 0; i < list.length && seq.length < 4; i++) {
        const s = list[i];
        if (s.w * 0.9 > left || seq.includes(s)) continue;
        seq.push(s);
        left -= s.w;
        if (left < 6.2) break;
      }
      if (!seq.length) continue;
      const k = W / seq.reduce((a, s) => a + s.w, 0);
      const score = Math.abs(k - 1) + (k > 1.15 ? 1 : 0) + t * 0.004;
      if (!best || score < best.score) best = { seq, k, score };
    }
    if (!best) {
      // Narrower than any shop: the smallest one squeezed in.
      const s = usable.map(([x]) => x).sort((a, b) => a.w - b.w)[0];
      if (W / s.w < 0.78) return false;
      best = { seq: [s], k: W / s.w, score: 0 };
    }
    const k = clamp(best.k, 0.78, 1.15);
    const total = best.seq.reduce((a, s) => a + s.w, 0) * k;
    let u = lo + (rnd(lot.id, 110) < 0.5 ? 0 : W - total);
    let back = 0;
    let any = false;
    const rows: [Building, Rect][] = [];
    for (const s of best.seq) {
      // Where the street bends, the row next door leans in: a narrower front may still fit.
      const b = place(f, s.id, u + (s.w * k) / 2, vf, { stretch: k, party: true, main: !any }) ?? place(f, s.id, u + (s.w * k) / 2, vf, { stretch: k * 0.86, party: true, main: !any });
      u += s.w * k;
      if (!b) continue;
      any = true;
      back = Math.max(back, vf + 2 * b.hz);
      remember(lot, s.id);
      rows.push([b, [u - s.w * k, u, vf, vf + 2 * b.hz]]);
    }
    if (!any) return false;
    if (f.gap > 0.2) pave(f, 'concrete/walk-square', [lo, hi, -f.gap - 0.3, vf + 0.3], 0.06, 2);
    if (f.d - back > 3.5 && rnd(lot.id, 111) < 0.75) {
      const yard: Rect = [lo + 0.3, hi - 0.3, back - 0.1, f.d - 0.4];
      pave(f, asphalt(lot), yard, 0.05, 4);
      if (f.d - back > 9) stalls(f, [lo + 0.6, hi - 0.6, back + 3.2, f.d - 0.8]);
      if (rnd(lot.id, 112) < 0.9) stand(f, DUMPSTERS[Math.floor(rnd(lot.id, 113) * 4)], 'bin', lo + 2.2 + rnd(lot.id, 114) * Math.max(0, W - 4.4), back + 1.4, 2);
      f.taken.push(yard);
    }
    for (const [b, box] of rows) dress(f, b, box, { walk: f.gap + vf - 0.1, back: f.d - box[3] > 2.2 });
    return true;
  };

  // --- Shops and offices that stand in their own car park ---
  const strip = (f: Frame, use: LandUse = f.lot.use): boolean => {
    const lot = f.lot;
    const t = f.type;
    const edge = Math.max(0, f.v0);
    const busy = lot.site.road === 'arterial' || lot.site.road === 'collector';
    const wide = family('shop/store').filter((s) => s.w > 15);
    const cands: [Shape, number][] =
      use === 'C4'
        ? mix([['shop/bigbox', 4, 1]])
        : use === 'C3'
          ? [
              ...mix([['shop/gas', 6, busy ? (lot.corner ? 3 : 1) : 0], ['shop/fastfood', 5, 2], ['shop/diner', 3, 1], ['shop/bank', 3, 1], ['shop/garage', 5, 1.2], ['apartment/motel', 4, t === 'beach' || t === 'suburb' ? 1.2 : 0.4]]),
              ...wide.map((s) => [s, 1.5] as [Shape, number]),
            ]
          : [...mix([['shop/store', 12, 2], ['shop/diner', 3, 1], ['shop/bank', 3, 0.7], ['shop/garage', 5, 0.8]]), ...named('shop/fastfood-3', 'shop/fastfood-5').map((s) => [s, 1] as [Shape, number])];
    let made: Building | null = null;
    let [uc, vf, deep] = [0, 0, false];
    let tries = 0;
    search: for (const side of [2.5, 1])
      for (const s of order(cands, lot, 120)) {
        const room = f.d - 2 - s.d - edge;
        if (room < 3) continue;
        const gas = s.id.startsWith('shop/gas');
        deep = !gas && room >= 13.5;
        vf = gas ? edge + Math.min(room, 5) : deep ? Math.min(edge + (use === 'C4' ? 60 : 22), f.d - 2 - s.d) : edge + Math.min(room, 4 + 2 * rnd(lot.id, 121));
        const [lo, hi] = span(f, vf, vf + s.d, side);
        if (hi - lo < s.w) continue;
        const slack = hi - lo - s.w;
        uc = lo + s.w / 2 + slack * (deep || gas ? 0.25 + 0.5 * rnd(lot.id, 122) : rnd(lot.id, 122) < 0.5 ? 0.04 : 0.96);
        made = place(f, s.id, uc, vf);
        if (made || ++tries >= 5) break search;
      }
    if (!made) return false;
    remember(lot, made.model);
    const gas = made.model.startsWith('shop/gas');
    const box: Rect = [uc - made.hx, uc + made.hx, vf, vf + 2 * made.hz];
    const [L, R] = span(f, edge + 2, f.d - 1.2, 1.2);
    const tex = asphalt(lot);
    const lotRect: Rect = [L, R, edge + 2, f.d - 1.2];
    pave(f, gas ? 'concrete/road-smooth-cracked' : tex, lotRect, 0.05, 4);
    // Ways in from the street: one at each end of a long frontage, else one clear of the building.
    const ways = R - L >= 34 ? [L + 5.5, R - 5.5] : [deep || gas ? (L + R) / 2 : box[0] - L > R - box[1] ? L + 4 : R - 4];
    for (const e of ways) pave(f, tex, [e - 3.5, e + 3.5, -f.gap, edge + 2.05], 0.05, 2.4);
    if (!gas) pave(f, 'concrete/walk-plain', [box[0], box[1], vf - 1.8, vf + 0.2], 0.07, 2);
    const lanes = ways.map((e): [number, number] => [e - 3.5, e + 3.5]);
    if (deep) stalls(f, [L + 1, R - 1, edge + 2.6, vf - 2], undefined, lanes);
    else if (!gas) {
      const sideRect: Rect = box[0] - L > R - box[1] ? [L + 0.5, box[0] - 1.5, edge + 2.6, f.d - 1.6] : [box[1] + 1.5, R - 0.5, edge + 2.6, f.d - 1.6];
      stalls(f, sideRect, undefined, lanes);
    }
    f.taken.push(lotRect);
    for (let u = L + 3, i = 0; u < R - 2; u += 9 + 5 * rnd(lot.id, 123, i), i++) if (ways.every((e) => Math.abs(u - e) > 5.5) && rnd(lot.id, 124, i) < 0.7) tree(f, u, edge + 1, 125 + i, 2, 0.6);
    refuse(f, rnd(lot.id, 126) < 0.5 ? -1 : 1, lot.area > 1400, f.d - 1.7);
    if (!gas) {
      // A restaurant set back in its car park may keep a terrace on the wider side of it.
      let patio: Rect | undefined;
      if (deep && /fastfood|diner/.test(made.model) && rnd(lot.id, 127) < 0.6) {
        const right = R - box[1] > box[0] - L;
        const wide = Math.min(8.5, (right ? R - box[1] : box[0] - L) - 1.2);
        const pr: Rect = right ? [box[1] + 0.3, box[1] + 0.3 + wide, vf + 0.6, Math.min(box[3] - 0.6, vf + 12)] : [box[0] - 0.3 - wide, box[0] - 0.3, vf + 0.6, Math.min(box[3] - 0.6, vf + 12)];
        if (wide >= 4.4 && pr[3] - pr[2] >= 4 && !f.solid.some(([u0, u1, v0, v1]) => u0 < pr[1] && u1 > pr[0] && v0 < pr[3] && v1 > pr[2])) {
          pave(f, PATIOS[Math.floor(rnd(lot.id, 128) * PATIOS.length)], pr, 0.08, 2);
          patio = pr;
        }
      }
      dress(f, made, box, { door: /fastfood|diner/.test(made.model) ? uc : undefined, walk: 1.8, back: f.d - box[3] > 2.2, patio });
    }
    return true;
  };

  // --- Offices and hotels ---
  const offices = (f: Frame): boolean => {
    const lot = f.lot;
    const t = f.type;
    const high = lot.use === 'O2';
    const target = lot.floors * 3.9 + 3;
    const edge = Math.max(0, f.v0);
    const cands: [Shape, number][] = (high
      ? mix([['office/glass', 10, 1.2], ['office/setback', 10, 1], ['office/deco', 4, 0.7], ['office/precast', 4, 0.7], ['office/brutal', 4, 0.5], ['office/hotel', 4, t === 'beach' ? 2.5 : 0.5]])
      : mix([['office/lowrise', 8, 1], ['office/precast', 4, 0.7], ['office/brutal', 4, 0.5], ['office/hotel', 4, t === 'beach' ? 1.5 : 0.2]])
    ).map(([s, w]) => [s, w * tall(s, target, 0.22) * Math.min(1, s.w / Math.max(1, f.w - 2)) ** 2] as [Shape, number]);
    const list = order(cands, lot, 130);
    const core = !!URBAN[t];
    let group: Rect | null = null;
    let tries = 0;
    search: for (const [side, front] of [[core ? 0.8 : high ? 1.5 : 3, edge + (core ? 0.5 + 1.8 * rnd(lot.edge, lot.side, 131) : high ? 1.5 + 2.5 * rnd(lot.edge, lot.side, 131) : 2.5 + 2 * rnd(lot.edge, lot.side, 131))], [0.6, edge + 0.6]])
      for (const s of list) {
        const vf = Math.min(front, f.d - 1 - s.d);
        if (vf < edge + 0.3) continue;
        const [lo, hi] = span(f, vf, vf + s.d, side);
        if (hi - lo < s.w) continue;
        const slack = hi - lo - s.w;
        // A wide lot takes a second, lower building beside the first.
        const between = core ? 2.5 : 6;
        const second = slack > 16 + between ? list.find((x) => x !== s && x.h < s.h * 0.85 && x.w + between <= slack && x.d <= f.d - 1 - vf) : undefined;
        // A building alone on its lot is built out towards the lot lines.
        const k = second ? 1 : clamp((hi - lo) / s.w, 1, 1.12);
        const sw = s.w * k;
        const uc = second ? (rnd(lot.id, 132) < 0.5 ? lo + s.w / 2 : hi - s.w / 2) : lo + sw / 2 + (hi - lo - sw) * (0.3 + 0.4 * rnd(lot.id, 133));
        const b = place(f, s.id, uc, vf, { stretch: k });
        if (!b) {
          if (++tries >= 5) break search;
          continue;
        }
        remember(lot, s.id);
        group = [uc - b.hx, uc + b.hx, vf, vf + 2 * b.hz];
        if (second) {
          const u2 = uc < (lo + hi) / 2 ? hi - second.w / 2 : lo + second.w / 2;
          const b2 = place(f, second.id, u2, vf + (core ? 0 : 2 * rnd(lot.id, 134)), { main: false });
          if (b2) group = [Math.min(group[0], u2 - b2.hx), Math.max(group[1], u2 + b2.hx), vf, Math.max(group[3], b2.setback + 2 * b2.hz)];
        }
        break search;
      }
    if (!group) return false;
    const [L, R] = span(f, 0, f.d - 0.4, 0.4);
    const gaps: [number, number][] = [];
    // An office does not stand in a lawn: the whole lot is forecourt, passage, car park and yard, with trees in the paving.
    harden(f);
    const tex = ['paving/slabs-granite', 'concrete/walk-square', 'paving/slabs-dark', 'paving/running-grey', 'concrete/walk-exposed', 'paving/slabs-sandstone'][Math.floor(rnd(lot.id, 135) * 6)];
    rearParking(f, group, gaps);
    court(f, tex, -f.gap - 0.2, f.d - 0.3);
    if (group[2] - edge > 3.2) for (let u = L + 3, i = 0; u < R - 2; u += 7 + 3 * rnd(lot.id, 136, i), i++) if (Math.abs(u - (group[0] + group[1]) / 2) > 3) tree(f, u, edge + 1.6, 137 + i, 1.4, 0.8);
    for (let i = 0; i < 3; i++) if (rnd(lot.id, 138, i) < (core ? 0.5 : 0.8)) tree(f, L + 2 + rnd(lot.id, 141, i) * (R - L - 4), group[3] + 2.5 + rnd(lot.id, 142, i) * Math.max(0, f.d - group[3] - 5), 143 + i, 2.4);
    return true;
  };

  // --- Works and warehouses ---
  const BOXES = ['waterfront/container-20-red', 'waterfront/container-20-blue', 'waterfront/container-20-green', 'waterfront/container-20-grey', 'waterfront/container-20-brown', 'waterfront/container-40-grey', 'waterfront/container-40-teal', 'waterfront/container-open'];
  const LOOSE = ['infra/pallet-stack', 'infra/pallet-stack', 'infra/cable-reel-flat', 'furniture/bin-drum', 'furniture/bin-drum-blue', 'furniture/bin-drum-full'];
  /** What a works keeps out of doors, along the back and the sides of its yard: containers end to end, pallets and drums in clusters. */
  const stock = (f: Frame, heavy: boolean, want: number, from: number): void => {
    const lot = f.lot;
    let made = 0;
    for (let k = 0; k < want * 3 && made < want; k++) {
      const where = rnd(lot.id, 158, k);
      const box = rnd(lot.id, 159, k) < (heavy ? 0.55 : 0.3);
      const model = box ? BOXES[Math.floor(rnd(lot.id, 167, k) * BOXES.length)] : LOOSE[Math.floor(rnd(lot.id, 167, k) * LOOSE.length)];
      const { min, max } = bbox(model);
      const [hx, hz] = [(max[0] - min[0]) / 2, (max[2] - min[2]) / 2];
      const t = rnd(lot.id, 168, k);
      let ok = false;
      if (where < 0.5) {
        const v = f.d - 2.2 - hz;
        const [lo, hi] = span(f, v - hz, v + hz, 2.2);
        if (hi - lo > 2 * hx) ok = stand(f, model, 'yard', lo + hx + (hi - lo - 2 * hx) * t, v);
      } else {
        const v = from + hx + (f.d - 3 - from - 2 * hx) * t;
        if (v - hx < from) continue;
        const [lo, hi] = span(f, v - hx, v + hx, 2.2);
        ok = stand(f, model, 'yard', where < 0.75 ? lo + hz : hi - hz, v, 1);
      }
      if (!ok) continue;
      made++;
      // Pallets and drums come several together.
      if (!box) for (let j = 1; j <= 2; j++) if (rnd(lot.id, 169, k, j) < 0.6) {
        const last = f.solid[f.solid.length - 1];
        stand(f, model, 'yard', (last[0] + last[1]) / 2 + (where < 0.5 ? 2 * hx + 0.5 : 0), (last[2] + last[3]) / 2 + (where < 0.5 ? 0 : 2 * hx + 0.5), where < 0.5 ? 0 : 1);
      }
    }
  };
  const works = (f: Frame): boolean => {
    const lot = f.lot;
    const heavy = lot.use === 'I2';
    const edge = Math.max(0, f.v0);
    const cands: [Shape, number][] = heavy
      ? mix([['industrial/mill', 4, 2], ['industrial/sawtooth', 4, 2], ['industrial/warehouse', 6, 1], ['industrial/vault', 3, 0.7]])
      : mix([['industrial/warehouse', 6, 3], ['industrial/shed', 8, 2], ['industrial/vault', 3, 1], ['industrial/sawtooth', 4, 0.8], ['industrial/storage', 4, 0.8], ['industrial/quonset', 3, 0.3]]);
    // The biggest that fits comes first more often than not: a works fills its plot.
    const list = order(cands.map(([s, w]) => [s, w * (0.3 + (s.w * s.d) / 1500)] as [Shape, number]), lot, 150);
    const front = edge + 9 + 5 * rnd(lot.id, 151);
    let main: Building | null = null;
    let tries = 0;
    search: for (const [side, fr] of [[5, front], [2.5, edge + 6]])
      for (const s of list) {
        const vf = Math.min(fr, f.d - 3 - s.d);
        if (vf < edge + 3) continue;
        const [lo, hi] = span(f, vf, vf + s.d, side);
        if (hi - lo < s.w) continue;
        main = place(f, s.id, lo + s.w / 2 + (hi - lo - s.w) * (rnd(lot.id, 152) < 0.5 ? 0.1 : 0.9), vf);
        if (main || ++tries >= 6) break search;
      }
    if (!main) return false;
    remember(lot, main.model);
    // Sheds, stores and tanks wherever the yard still has room, clear of the main building and the fence.
    const extra: [Shape, number][] = [
      ...mix([['industrial/shed', 8, 2], ['industrial/storage', 4, 1.5], ['industrial/quonset', 3, 1.5], ['industrial/tanks', 6, heavy ? 3 : 0.6], ['industrial/vault', 3, 0.5]]),
      ...named('infra/tank-vertical', 'infra/tank-vertical-rusty', 'infra/tank-horizontal', 'infra/tank-propane').map((s) => [s, heavy ? 1.5 : 0.3] as [Shape, number]),
    ];
    let count = 0;
    const want = Math.min(4, Math.floor(lot.area / (heavy ? 1800 : 2600)));
    for (const s of order(extra, lot, 153)) {
      if (count >= want) break;
      let done = false;
      for (let k = 0; k < 6 && !done; k++) {
        const vf = edge + 8 + rnd(lot.id, 154, count, k) * Math.max(0, f.d - 11 - s.d - edge);
        const [lo, hi] = span(f, vf, vf + s.d, 4);
        if (hi - lo < s.w || vf + s.d > f.d - 3) continue;
        const uc = lo + s.w / 2 + (hi - lo - s.w) * rnd(lot.id, 155, count, k);
        const r: Rect = [uc - s.w / 2 - 5, uc + s.w / 2 + 5, vf - 5, vf + s.d + 5];
        if (f.solid.some(([u0, u1, v0, v1]) => u0 < r[1] && u1 > r[0] && v0 < r[3] && v1 > r[2])) continue;
        done = !!place(f, s.id, uc, vf, { main: false });
      }
      if (done) count++;
    }
    const [L, R] = span(f, edge + 1.5, f.d - 1.5, 1.5);
    const tex = heavy ? ['ground/gravel-dirt', 'concrete/road-tined-stained', 'asphalt/plain-bleached-broken'][Math.floor(rnd(lot.id, 156) * 3)] : ['asphalt/plain-worn-patched', 'concrete/road-smooth-cracked', 'asphalt/plain-bleached-broken', 'asphalt/plain-used-patched', 'ground/gravel-dirt'][Math.floor(rnd(lot.id, 156) * 5)];
    pave(f, tex, [L, R, edge + 1.5, f.d - 1.5], 0.05, 5);
    pave(f, tex.startsWith('ground') ? 'concrete/road-smooth-cracked' : tex, [-6, 6, -f.gap, edge + 1.55], 0.05, 3);
    refuse(f, rnd(lot.id, 157) < 0.5 ? -1 : 1, true, f.d - 2);
    stock(f, heavy, Math.min(10, Math.floor(lot.area / 450)), edge + 8);
    // Staff parking along the front fence, clear of the gate.
    stalls(f, [L + 1, R - 1, edge + 2, edge + 7.4], [-8, 8, -1, f.d]);
    return true;
  };
  /** A yard with no building that would fit it: hard standing behind the fence, let for storage. */
  const storage = (f: Frame): boolean => {
    const lot = f.lot;
    const edge = Math.max(0, f.v0);
    if (f.d - edge < 7) return false;
    const [L, R] = span(f, edge + 1.5, f.d - 1.5, 1.5);
    if (R - L < 7) return false;
    const tex = ['ground/gravel-dirt', 'asphalt/plain-bleached-broken', 'concrete/road-smooth-cracked'][Math.floor(rnd(lot.id, 164) * 3)];
    pave(f, tex, [L, R, edge + 1.5, f.d - 1.5], 0.05, 5);
    pave(f, tex.startsWith('ground') ? 'concrete/road-smooth-cracked' : tex, [-4, 4, -f.gap, edge + 1.55], 0.05, 3);
    if (R - L > 12 && f.d - edge > 12) stand(f, 'waterfront/container-office', 'yard', rnd(lot.id, 165) < 0.5 ? L + 5 : R - 5, edge + 5);
    stock(f, rnd(lot.id, 166) < 0.4, Math.max(2, Math.min(12, Math.floor(lot.area / 110))), edge + 4);
    out.yards.push(lot.id);
    return true;
  };

  // --- Ground too small or too steep to build on ---
  const PLAZA = ['paving/slabs-granite', 'concrete/walk-square', 'paving/running-grey', 'concrete/walk-exposed', 'paving/slabs-sandstone'];
  const SEATS = ['furniture/bench-park', 'furniture/bench-park-weathered', 'furniture/bench-metal', 'furniture/bench-concrete-wood', 'furniture/bench-flat'];
  /** In town it is paved, with trees and a seat; elsewhere it is planted and left. A steep bank stays as it is. */
  const pocket = (f: Frame): boolean => {
    const lot = f.lot;
    const edge = Math.max(0, f.v0);
    const depth = f.d - edge;
    if (lot.site.slope > 0.22 || depth < 2.5 || f.type === 'hills') return true;
    const [L, R] = span(f, edge + 0.4, f.d - 0.4, 0.4);
    if (R - L < 2.5) return true;
    const town = f.type === 'downtown' || f.type === 'midtown' || f.type === 'oldtown';
    if (town && lot.site.relief < 1.2) {
      pave(f, PLAZA[Math.floor(rnd(lot.id, 181) * PLAZA.length)], [L, R, -f.gap, f.d - 0.4], 0.055, 3);
      for (let u = L + 2, i = 0; u < R - 1.5; u += 6 + 3 * rnd(lot.id, 182, i), i++) tree(f, u, edge + Math.min(depth - 1.2, Math.max(1.2, depth * 0.6)), 183 + i, 1.4, 0.8);
      if (depth > 3.5 && R - L > 6) small(f, SEATS[Math.floor(rnd(lot.id, 190) * SEATS.length)], 'yard', (L + R) / 2 + (rnd(lot.id, 191) - 0.5) * (R - L - 5), f.d - 1.1, 0, 1);
      if (rnd(lot.id, 192) < 0.5) small(f, ['furniture/planter-box-flowers', 'furniture/planter-trough-flowers', 'furniture/planter-bowl-flowers'][Math.floor(rnd(lot.id, 193) * 3)], 'plant', L + 1.2, edge + 1, 0, 0.7);
      return true;
    }
    if (f.type === 'industrial') {
      for (let i = 0; i < 2; i++) if (rnd(lot.id, 194, i) < 0.35) small(f, 'plant/shrub-dry', 'plant', L + 1 + rnd(lot.id, 195, i) * (R - L - 2), edge + 1 + rnd(lot.id, 196, i) * (depth - 2), 0, 0.6);
      return true;
    }
    const n = lot.area < 70 ? (rnd(lot.id, 197) < 0.5 ? 1 : 0) : Math.min(3, Math.round(lot.area / 160 + rnd(lot.id, 197)));
    for (let i = 0; i < n; i++) tree(f, L + 1.5 + rnd(lot.id, 198, i) * Math.max(0, R - L - 3), edge + 1.5 + rnd(lot.id, 199, i) * Math.max(0, depth - 3), 200 + i, 2.2, 1.2);
    for (let i = 0; i < 3; i++) if (rnd(lot.id, 204, i) < 0.45) small(f, [...SHRUBS, ...BEDS][Math.floor(rnd(lot.id, 205, i) * (SHRUBS.length + BEDS.length))], 'plant', L + 0.8 + rnd(lot.id, 206, i) * Math.max(0, R - L - 1.6), edge + 0.8 + rnd(lot.id, 207, i) * Math.max(0, depth - 1.6), rnd(lot.id, 208, i) * 6, 0.6);
    return true;
  };

  // --- Car parks ---
  const parkingLot = (f: Frame): boolean => {
    const lot = f.lot;
    const edge = Math.max(0, f.v0);
    if (lot.floors > 0) {
      for (const s of order(mix([['office/carpark', 4, 1]]).map(([s, w]) => [s, w * tall(s, lot.floors * 3.2 + 2)] as [Shape, number]), lot, 160)) {
        const vf = edge + Math.min(3, Math.max(1, f.d - 2 - s.d - edge));
        const [lo, hi] = span(f, vf, vf + s.d, 1.5);
        if (hi - lo < s.w || vf + s.d > f.d - 1) continue;
        const uc = (lo + hi) / 2;
        if (!place(f, s.id, uc, vf)) continue;
        pave(f, asphalt(lot), [uc - 4, uc + 4, -f.gap, vf + 0.3], 0.05, 2.5);
        return true;
      }
    }
    if (f.d - edge < 13.5) {
      // Too shallow for an aisle of its own: one row of spaces nose in from the street, as beside a row of shops.
      const back = Math.min(f.d - 0.3, edge + 5.9);
      const [l, r] = span(f, edge, back, 0.4);
      if (r - l < 5.4 || back - edge < 5.5) return pocket(f);
      const tex = asphalt(lot);
      pave(f, tex, [l, r, -f.gap, back], 0.05, 2.6);
      return stalls(f, [l + 0.1, r - 0.1, back - 5.5, back - 0.1]) > 0 || pocket(f);
    }
    const [L, R] = span(f, edge + 1, f.d - 1, 1);
    if (R - L < 8) return pocket(f);
    const tex = asphalt(lot);
    pave(f, tex, [L, R, edge + 1, f.d - 1], 0.05, 4);
    pave(f, tex, [-3.6, 3.6, -f.gap, edge + 1.05], 0.05, 2.4);
    const n = stalls(f, [L + 0.4, R - 0.4, edge + 1.3, f.d - 1.2], [-3.4, 3.4, -1, edge + 7], [[-3.4, 3.4]]);
    if (n > 18 && rnd(lot.id, 161) < 0.5) {
      const p = at(f, 5, edge + 3.2);
      if (site.at(p.x, p.y) === LOT) site.put(rnd(lot.id, 162) < 0.5 ? 'infra/parking-booth' : 'infra/parking-booth-flat', 'parking', p.x, p.y, f.yaw);
    }
    if (rnd(lot.id, 163) < 0.6) {
      const p = at(f, -4.6, edge + 1.2);
      if (site.at(p.x, p.y) === LOT) site.put('infra/parking-sign-rates', 'sign', p.x, p.y, f.yaw);
    }
    return n > 0;
  };

  // --- Public buildings ---
  interface Civic {
    kind: string;
    models: string[];
    max: number;
    /** Least distance to another of its kind. */
    apart: number;
    types: DistrictType[] | null;
    front: number;
    busy?: boolean;
    /** Paved all the way across its front. */
    plaza?: boolean;
    flag?: boolean;
  }
  const ALL: DistrictType[] = ['downtown', 'midtown', 'oldtown', 'residential', 'suburb', 'beach', 'hills', 'industrial'];
  const HOMES: DistrictType[] = ['residential', 'suburb', 'beach', 'hills', 'oldtown', 'midtown'];
  const CIVIC: Civic[] = [
    { kind: 'stadium', models: ['civic/stadium-school', 'civic/stadium-two-stands', 'civic/stadium-old', 'civic/stadium-soccer'], max: 1, apart: 0, types: ['midtown', 'industrial', 'suburb', 'residential'], front: 12 },
    { kind: 'arena', models: ['civic/arena-small', 'civic/arena-round'], max: 1, apart: 0, types: ['midtown', 'downtown', 'industrial', 'suburb'], front: 10 },
    { kind: 'hospital', models: ['civic/hospital-general', 'civic/hospital-modern', 'civic/hospital-brick', 'civic/hospital-ward', 'civic/hospital-small'], max: 2, apart: 1400, types: ['midtown', 'residential', 'suburb', 'downtown', 'oldtown'], front: 10, busy: true },
    { kind: 'high-school', models: ['civic/school-high-1', 'civic/school-high-2', 'civic/school-high-old'], max: 2, apart: 1400, types: HOMES, front: 9, flag: true },
    { kind: 'middle-school', models: ['civic/school-middle-1', 'civic/school-middle-2'], max: 2, apart: 1200, types: HOMES, front: 9, flag: true },
    { kind: 'school', models: ['civic/school-elementary-1', 'civic/school-elementary-2', 'civic/school-elementary-3'], max: 8, apart: 600, types: HOMES, front: 8, flag: true },
    { kind: 'university', models: ['civic/university-hall-tower', 'civic/university-hall-cupola', 'civic/university-lab'], max: 1, apart: 0, types: ['midtown', 'residential', 'oldtown'], front: 10 },
    { kind: 'museum', models: ['civic/museum-classical', 'civic/museum-dome', 'civic/museum-modern'], max: 1, apart: 0, types: ['downtown', 'midtown', 'oldtown'], front: 7, plaza: true },
    { kind: 'city-hall', models: ['civic/city-hall-dome', 'civic/city-hall-tower', 'civic/city-hall-brick', 'civic/city-hall-modern', 'civic/city-hall-old'], max: 1, apart: 0, types: ['downtown', 'oldtown', 'midtown'], front: 8, plaza: true, flag: true },
    { kind: 'courthouse', models: ['civic/courthouse-dome', 'civic/courthouse-classical', 'civic/courthouse-modern', 'civic/courthouse-brick'], max: 1, apart: 0, types: ['downtown', 'midtown', 'oldtown'], front: 6, plaza: true, flag: true },
    { kind: 'police', models: ['civic/police-brick', 'civic/police-brutal', 'civic/police-modern', 'civic/sheriff'], max: 2, apart: 1500, types: ['downtown', 'midtown', 'residential', 'suburb', 'oldtown', 'industrial'], front: 5, flag: true },
    { kind: 'fire', models: ['civic/fire-brick-2', 'civic/fire-brick-3', 'civic/fire-modern-3', 'civic/fire-modern-4', 'civic/fire-rural-1', 'civic/fire-stucco-2'], max: 8, apart: 1200, types: ALL, front: 9, busy: true, flag: true },
    { kind: 'library', models: ['civic/library-classical', 'civic/library-modern', 'civic/library-brick', 'civic/library-branch'], max: 4, apart: 1000, types: ALL, front: 5, plaza: true },
    { kind: 'post-office', models: ['civic/post-office-brick', 'civic/post-office-deco', 'civic/post-office-modern'], max: 3, apart: 1400, types: ALL, front: 5, flag: true },
    { kind: 'community', models: ['civic/community-1', 'civic/community-2', 'civic/community-3'], max: 5, apart: 900, types: HOMES, front: 5 },
    { kind: 'clinic', models: ['civic/clinic-1', 'civic/clinic-2', 'civic/clinic-3'], max: 6, apart: 700, types: ALL, front: 5 },
    {
      kind: 'church',
      models: ['civic/church-white-steeple', 'civic/church-brick-old', 'civic/church-gothic-brick', 'civic/church-gothic-stone', 'civic/church-mission', 'civic/church-mission-twin', 'civic/church-aframe', 'civic/church-chapel-stone', 'civic/church-chapel-wood', 'civic/church-cathedral'],
      max: 40, apart: 280, types: ALL, front: 5,
    },
    { kind: 'police', models: ['civic/police-substation'], max: 6, apart: 700, types: ALL, front: 3 },
    { kind: 'library', models: ['civic/library-branch'], max: 6, apart: 500, types: ALL, front: 4 },
  ];
  const civicAt: { kind: string; x: number; y: number }[] = [];
  const civicLot = (f: Frame, c: Civic, salt: number): boolean => {
    const lot = f.lot;
    const edge = Math.max(0, f.v0);
    const mid = at(f, 0, f.d / 2);
    // A hospital stands only where the lots beside it were planned for a big neighbour.
    if (c.kind === 'hospital' && lot.area <= 2600) return false;
    if (c.apart > 0 && civicAt.some((o) => o.kind === c.kind && Math.hypot(o.x - mid.x, o.y - mid.y) < c.apart)) return false;
    for (const s of order(named(...c.models).map((s) => [s, 1 + (s.w * s.d) / 800] as [Shape, number]), lot, 170 + salt)) {
      // In the middle of town a public building stands close behind the pavement like its neighbours; further out it keeps a forecourt.
      const want = URBAN[f.type] ? Math.min(c.front, c.plaza ? 5 : 3) : Math.min(c.front, 7);
      for (const [side, front] of [[3, want], [1.5, Math.min(want, 4)]]) {
        const vf = Math.min(edge + front, f.d - 2.5 - s.d);
        if (vf < edge + Math.min(front, 2.5)) continue;
        const [lo, hi] = span(f, vf, vf + s.d, side);
        if (hi - lo < s.w) continue;
        const slack = hi - lo - s.w;
        // To one side where the rest of the frontage can take the parking; in the middle of a lot it fills.
        const uc = slack > 12 ? (rnd(lot.id, 171) < 0.5 ? lo + s.w / 2 : hi - s.w / 2) : (lo + hi) / 2;
        const b = place(f, s.id, uc, vf, { civic: c.kind });
        if (!b) continue;
        civicAt.push({ kind: c.kind, x: mid.x, y: mid.y });
        out.civic[c.kind] = (out.civic[c.kind] ?? 0) + 1;
        const box: Rect = [uc - b.hx, uc + b.hx, vf, vf + 2 * b.hz];
        const [L, R] = span(f, edge, f.d - 1, 0.6);
        // Forecourt: paved across the front of a hall, an apron before the fire station's doors, else a path to the door.
        const way: Rect = c.kind === 'fire' ? [box[0] + 0.5, box[1] - 0.5, -f.gap, vf + 0.2] : c.plaza ? [box[0] - 1, box[1] + 1, -f.gap, vf + 0.2] : [uc - 1.6, uc + 1.6, -f.gap, vf + 0.2];
        pave(f, c.kind === 'fire' ? 'concrete/road-tined' : c.plaza ? 'paving/slabs-granite' : 'concrete/walk-square', way, 0.06, 2.4);
        f.taken.push(way);
        if (c.flag) small(f, 'civic/part-flagpole', 'yard', way[0] - 1.6 > L + 1 ? way[0] - 1.6 : way[1] + 1.6, edge + Math.min(2.5, (vf - edge) / 2), 0, 0.5);
        // Parking beside the building where the frontage is long, else behind it.
        const tex = asphalt(lot);
        const [roomL, roomR] = [box[0] - L, R - box[1]];
        if (Math.max(roomL, roomR) >= 14) {
          const pad: Rect = roomL > roomR ? [L + 0.5, box[0] - 3, edge + 3, Math.min(f.d - 1.5, box[3] + 6)] : [box[1] + 3, R - 0.5, edge + 3, Math.min(f.d - 1.5, box[3] + 6)];
          const [pl, pr] = span(f, pad[2], pad[3], 1);
          pad[0] = Math.max(pad[0], pl);
          pad[1] = Math.min(pad[1], pr);
          pave(f, tex, pad, 0.05, 4);
          const e = (pad[0] + pad[1]) / 2;
          pave(f, tex, [e - 3.2, e + 3.2, -f.gap, pad[2] + 0.05], 0.05, 2.4);
          stalls(f, [pad[0] + 0.3, pad[1] - 0.3, pad[2] + 0.3, pad[3] - 0.3], undefined, [[e - 3.2, e + 3.2]]);
          f.taken.push(pad, [e - 3.2, e + 3.2, 0, pad[2]]);
          refuse(f, roomL > roomR ? 1 : -1, lot.area > 1500);
        } else rearParking(f, box, []);
        // A school has a court in its yard.
        if (c.kind.includes('school')) {
          for (let k = 0; k < 8; k++) {
            const [u, v] = [L + 9 + rnd(lot.id, 172, k) * Math.max(0, R - L - 18), edge + 10 + rnd(lot.id, 173, k) * Math.max(0, f.d - edge - 20)];
            if (!open(f, u, v, 8.5, 8.5) || !open(f, u - 7, v - 7, 1, 1) || !open(f, u + 7, v + 7, 1, 1) || !open(f, u - 7, v + 7, 1, 1) || !open(f, u + 7, v - 7, 1, 1)) continue;
            const p = at(f, u, v);
            site.lay(['park/basketball-court', 'park/basketball-court-green', 'park/basketball-court-worn'][Math.floor(rnd(lot.id, 174) * 3)], 'sport', p.x, p.y, f.yaw);
            f.taken.push([u - 8, u + 8, v - 7.5, v + 7.5]);
            break;
          }
        }
        // The ground before and beside it is paved. Behind, a school has its yard and a building in town its service court; the rest keep their grounds in grass.
        const to = URBAN[f.type] || c.kind.includes('school') || c.kind === 'fire' || c.kind === 'police' ? Infinity : c.kind === 'church' ? vf : box[3];
        court(f, c.kind.includes('school') && to === Infinity ? 'asphalt/plain-bleached-cracked' : courtTex(lot, 2), -f.gap, Math.min(to, f.d - 0.3));
        harden(f, to);
        for (let i = 0; i < 6; i++) if (rnd(lot.id, 175, i) < 0.7) tree(f, L + 2 + rnd(lot.id, 176, i) * (R - L - 4), edge + 1.6 + rnd(lot.id, 177, i) * (f.d - edge - 3.5), 178 + i, 3, 1.2);
        return true;
      }
    }
    return false;
  };

  // --- Every lot in turn ---
  const frames: (Frame | null)[] = land.lots.map((lot, index) => (sand.has(index) ? null : frameOf(lot)));
  // Works, car parks and open ground keep to their own fences.
  for (const f of frames) if (f && f.lot.use !== 'I1' && f.lot.use !== 'I2' && f.lot.use !== 'PK' && f.lot.use !== 'OS') extend(f);
  for (const f of frames) if (f && (f.lot.use === 'R1' || f.lot.use === 'R2')) terrace(f);
  out.plots = frames.map((f) => f?.poly ?? null);
  out.owner = owner;
  const done = new Set<number>();
  const centre = (lot: Lot): number => lot.site.centre;
  CIVIC.forEach((c, ci) => {
    // The biggest and the most central halls take their pick first; the small kinds take the smallest lot that will do.
    const lots = land.lots
      .filter((lot) => lot.use === 'CV' && frames[lot.id] && !done.has(lot.id) && (!c.types || c.types.includes(lot.site.type)) && (!c.busy || lot.site.road === 'arterial' || lot.site.road === 'collector'))
      .map((lot) => ({ lot, k: (c.kind === 'city-hall' || c.kind === 'courthouse' || c.kind === 'museum' ? -centre(lot) / 30 : 0) - (c.types ? c.types.indexOf(lot.site.type) : 0) * 0.6 - lot.area / 4000 + rnd(lot.id, 180, ci) }))
      .sort((a, b) => b.k - a.k);
    let n = 0;
    for (const { lot } of lots) {
      if (n >= c.max) break;
      if (civicLot(frames[lot.id]!, c, ci)) {
        done.add(lot.id);
        n++;
      }
    }
  });
  for (const lot of land.lots) {
    const f = frames[lot.id];
    if (!f) {
      if (lot.use !== 'OS' && !sand.has(lot.id)) out.vacant.push(lot.id);
      continue;
    }
    if (lot.use === 'CV') {
      if (!done.has(lot.id)) out.vacant.push(lot.id);
      continue;
    }
    const t = f.type;
    const wall = t === 'oldtown' || t === 'midtown' || t === 'downtown' || t === 'beach' || lot.width < 22 || lot.depth < 30;
    const ok =
      lot.use === 'R1' ? houseLot(f)
      : lot.use === 'R2' ? flats(f) || houseLot(f)
      : lot.use === 'R3' ? flats(f) || flats(f, 'R2')
      : lot.use === 'C1' || lot.use === 'C2' ? (wall ? shopRow(f) || strip(f) : strip(f) || shopRow(f))
      : lot.use === 'C3' ? strip(f) || shopRow(f)
      : lot.use === 'C4' ? strip(f) || strip(f, 'C3')
      : lot.use === 'O1' || lot.use === 'O2' ? offices(f)
      : lot.use === 'I1' || lot.use === 'I2' ? works(f) || storage(f)
      : lot.use === 'PK' ? parkingLot(f)
      : pocket(f);
    if (!ok) out.vacant.push(lot.id);
  }
  for (const b of out.list) if (b.main) out.count[b.use] = (out.count[b.use] ?? 0) + 1;
  for (const b of builders.values()) out.tiles.push(b.build());
  return out;
}
