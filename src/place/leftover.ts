import { districtAt } from '../gen/districts';
import { Buildings } from './buildings';
import { FREE, SITE_CELL, Site, clearance, hash, pick } from './site';
import { Waterfront } from './waterfront';

/** What the ground between the lots is, where it is nobody's lot. */
export const WILD = 1;
export const RIVERSIDE = 2;
export const BELT = 3;
export const YARD = 4;
export const COPSE = 5;
export const COURT = 6;

export interface Leftover {
  /** Lot (id + 1) that the ground beside it goes with, on the raster of the sites; 0 where it goes with none. */
  claim: Int32Array;
  /** What the rest of the open ground is: WILD on the hills, RIVERSIDE, BELT beside a motorway, YARD, COPSE, COURT; 0 where it is a lot's, a road's, water. */
  kind: Uint8Array;
  trees: number;
  rocks: number;
  tufts: number;
}

/** How far a lot's ground reaches into what lies open beside it. */
const REACH = 14;
/** Side of the squares the trees are dealt out on. */
const G = 7;

const TREES: Record<number, string[]> = {
  [WILD]: ['plant/wood-oak', 'plant/wood-eucalyptus', 'plant/wood-olive', 'plant/wood-oak-old', 'plant/wood-oak'],
  [RIVERSIDE]: ['plant/wood-plane', 'plant/wood-maple', 'plant/wood-elm', 'plant/wood-birch', 'plant/wood-oak'],
  [BELT]: ['plant/wood-eucalyptus', 'plant/wood-poplar', 'plant/wood-plane', 'plant/wood-oak'],
  [YARD]: ['plant/wood-sparse', 'plant/wood-eucalyptus', 'plant/wood-poplar'],
  [COPSE]: ['plant/wood-oak', 'plant/wood-maple', 'plant/wood-plane', 'plant/wood-birch', 'plant/wood-elm'],
  [COURT]: ['plant/wood-plane', 'plant/wood-elm', 'plant/wood-maple'],
};
const GARDEN = ['plant/wood-maple', 'plant/wood-birch', 'plant/wood-olive', 'plant/wood-oak'];
const ROCKS = ['waterfront/rock-sandstone', 'waterfront/rock-granite', 'waterfront/rock-sandstone', 'waterfront/rock-mossy'];

function noise(seed: number, x: number, y: number, scale: number): number {
  const [fx, fy] = [x / scale, y / scale];
  const [i, j] = [Math.floor(fx), Math.floor(fy)];
  const [u, v] = [fx - i, fy - j];
  const [su, sv] = [u * u * (3 - 2 * u), v * v * (3 - 2 * v)];
  const a = hash(seed, i, j);
  const b = hash(seed, i + 1, j);
  const c = hash(seed, i, j + 1);
  const d = hash(seed, i + 1, j + 1);
  return a + (b - a) * su + (c + (d - c) * su - (a + (b - a) * su)) * sv;
}

/**
 * The ground that is left when the roads, the lots and the parks have taken theirs. A town leaves none of it bare:
 * the strip behind a fence goes with the lot in front of it, the bank of the river is mown and planted, the land
 * beside a motorway is a belt of trees, the corners of a block grow a copse, and the hills keep their oaks, their
 * dry grass and their rocks.
 */
export function placeLeftover(site: Site, shore: Waterfront, buildings: Buildings): Leftover {
  const { city, roads } = site;
  const t = city.terrain;
  const land = city.land;
  const n = site.n;
  const seed = site.seed;
  const out: Leftover = { claim: new Int32Array(n * n), kind: new Uint8Array(n * n), trees: 0, rocks: 0, tufts: 0 };
  const sandLot = new Set(shore.sandLots);
  const vacant = new Set(buildings.vacant);
  const lotOf = (i: number, j: number): number => {
    const [li, lj] = [Math.floor(((i + 0.5) * SITE_CELL) / land.cell), Math.floor(((j + 0.5) * SITE_CELL) / land.cell)];
    return li < land.n && lj < land.n ? land.grid[lj * land.n + li] - 1 : -1;
  };
  const sandy = (x: number, y: number): boolean => shore.sand[Math.min(t.n - 1, Math.round(y / t.cell)) * t.n + Math.min(t.n - 1, Math.round(x / t.cell))] > 0.3;

  // Whose each cell is: a lot's (id + 1), nobody's (-1), or not ground to be had (0).
  const whose = new Int32Array(n * n);
  // Open ground a tree may stand on: nobody's, and the lots nothing was built on.
  const open = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const c = j * n + i;
      const id = lotOf(i, j);
      const lot = id >= 0 ? land.lots[id] : null;
      if (lot && !sandLot.has(id) && lot.use !== 'OS') {
        whose[c] = id + 1;
        if (vacant.has(id) && site.grid[c] === FREE && lot.use !== 'PK') open[c] = 1;
      } else if (buildings.owner[c]) whose[c] = buildings.owner[c];
      else if (site.grid[c] === FREE && !sandy((i + 0.5) * SITE_CELL, (j + 0.5) * SITE_CELL)) {
        whose[c] = -1;
        open[c] = 1;
      }
    }

  // --- What lies against a lot goes with it ---
  const type = (c: number): string => districtAt(t, city.districts, ((c % n) + 0.5) * SITE_CELL, (Math.floor(c / n) + 0.5) * SITE_CELL).type;
  let front: number[] = [];
  for (let c = 0; c < n * n; c++) if (whose[c] > 0 && !vacant.has(whose[c] - 1) && land.lots[whose[c] - 1].site.type !== 'hills') front.push(c);
  for (let step = 0; step < REACH / SITE_CELL && front.length; step++) {
    const next: number[] = [];
    for (const c of front) {
      const id = whose[c] > 0 ? whose[c] : out.claim[c];
      const [i, j] = [c % n, Math.floor(c / n)];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [a, b] = [i + di, j + dj];
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const k = b * n + a;
        if (whose[k] !== -1 || out.claim[k]) continue;
        out.claim[k] = id;
        next.push(k);
      }
    }
    front = next;
  }
  // The hills are not parcelled out: what a plot does not use is hillside.
  for (let c = 0; c < n * n; c++) if (out.claim[c] && type(c) === 'hills') out.claim[c] = 0;

  // --- Beside the motorway and its ramps, and beside a railway on its bank or viaduct ---
  const near = new Uint8Array(n * n);
  const R = 36;
  const mark = (x: number, y: number): void => {
    const [ci, cj, r] = [Math.floor(x / SITE_CELL), Math.floor(y / SITE_CELL), Math.ceil(R / SITE_CELL)];
    for (let j = Math.max(0, cj - r); j <= Math.min(n - 1, cj + r); j++)
      for (let i = Math.max(0, ci - r); i <= Math.min(n - 1, ci + r); i++) if ((i - ci) ** 2 + (j - cj) ** 2 <= r * r) near[j * n + i] = 1;
  };
  const along = (pts: [number, number][]): void => {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s <= l; s += 12) mark(a[0] + ((b[0] - a[0]) * s) / (l || 1), a[1] + ((b[1] - a[1]) * s) / (l || 1));
    }
  };
  for (const e of city.graph.edges) {
    const line = roads.lines[e.id];
    if (line && (e.cls === 'highway' || e.cls === 'ramp')) along(line.map((p) => [p[0], p[2]]));
  }
  for (const tr of roads.rail.lines) along(tr.pts.map((p) => [p.x, p.y]));

  for (let c = 0; c < n * n; c++) {
    if (!open[c] || out.claim[c]) continue;
    const [x, y] = [((c % n) + 0.5) * SITE_CELL, (Math.floor(c / n) + 0.5) * SITE_CELL];
    const d = type(c);
    const bank = shore.banks[Math.min(t.n - 1, Math.round(y / t.cell)) * t.n + Math.min(t.n - 1, Math.round(x / t.cell))] > 0;
    out.kind[c] = d === 'hills' ? WILD : bank ? RIVERSIDE : near[c] ? BELT : d === 'industrial' ? YARD : d === 'downtown' || d === 'midtown' || d === 'oldtown' ? COURT : COPSE;
  }

  // --- Trees, tufts of grass and rocks ---
  const room = clearance(open, n, n);
  const slope = (x: number, y: number): number => Math.hypot(site.heightAt(x + 3, y) - site.heightAt(x - 3, y), site.heightAt(x, y + 3) - site.heightAt(x, y - 3)) / 6;
  const m = Math.ceil(t.size / G);
  for (let gy = 0; gy < m; gy++)
    for (let gx = 0; gx < m; gx++) {
      const h = (k: number): number => hash(seed, 9091, gx, gy, k);
      const x = (gx + 0.15 + h(1) * 0.7) * G;
      const y = (gy + 0.15 + h(2) * 0.7) * G;
      const [i, j] = [Math.floor(x / SITE_CELL), Math.floor(y / SITE_CELL)];
      if (i >= n || j >= n) continue;
      const c = j * n + i;
      if (!open[c]) continue;
      const kind = out.kind[c];
      const clear = room[c] * SITE_CELL;
      const grove = noise(seed + 77, x, y, 64) * 0.7 + noise(seed + 78, x, y, 23) * 0.3;
      // A garden tree here and there on the ground that goes with a house; elsewhere in groves with open ground between.
      const use = !kind && out.claim[c] > 0 ? land.lots[out.claim[c] - 1].use : null;
      const garden = use !== null && use !== 'PK' && use !== 'OS';
      const p =
        garden ? (/R1|R2|R3|CV/.test(use!) ? 0.14 : use === 'I1' || use === 'I2' ? 0.03 : 0.08)
        : kind === WILD ? (grove > 0.56 ? 0.6 : grove > 0.46 ? 0.16 : 0.02)
        : kind === RIVERSIDE ? (grove > 0.55 ? 0.6 : 0.12)
        : kind === BELT ? 0.7
        : kind === YARD ? (grove > 0.6 ? 0.3 : 0.05)
        : kind === COPSE ? (grove > 0.5 ? 0.7 : 0.22)
        : kind === COURT ? 0.22
        : 0;
      const steep = kind === WILD ? slope(x, y) : 0;
      if (h(3) < p && clear >= (garden ? 4 : kind === BELT ? 5 : 3.2) && steep < 0.7) {
        const list = garden ? (/R1|R2|R3|CV/.test(use!) ? GARDEN : TREES[use === 'I1' || use === 'I2' ? YARD : COURT]) : TREES[kind];
        const model = pick(list, hash(seed, 9092, Math.floor(x / 52), Math.floor(y / 52)) * 0.7 + h(4) * 0.3);
        site.put(model, 'tree', x, y, h(5) * Math.PI * 2, { scale: 0.75 + h(6) * 0.5, lift: -0.05 });
        out.trees++;
      } else if (kind === WILD || kind === YARD || kind === BELT) {
        if (kind === WILD && steep > 0.3 && noise(seed + 79, x, y, 38) > 0.62 && h(7) < 0.5 && clear >= 2) {
          // Rock breaks the surface where the slope is steep, in outcrops rather than evenly: one stone of a kind to a place, most of it in the ground.
          const k = 0.35 + h(10) * h(10) * 0.9;
          site.put(pick(ROCKS, hash(seed, 9093, Math.floor(x / 90), Math.floor(y / 90))), 'rock', x, y, h(9) * Math.PI * 2, { scale: k, lift: -0.45 * k });
          out.rocks++;
        } else if (h(7) < (kind === WILD ? 0.28 : 0.2) && clear >= 1) {
          for (let q = 0; q < 1 + Math.floor(h(11) * 3); q++) {
            const [tx, ty] = [x + (h(12 + q) - 0.5) * 3, y + (h(16 + q) - 0.5) * 3];
            const tc = Math.floor(ty / SITE_CELL) * n + Math.floor(tx / SITE_CELL);
            if (tx < 0 || ty < 0 || tx >= n * SITE_CELL || ty >= n * SITE_CELL || !open[tc]) continue;
            site.put(h(20 + q) < 0.7 ? 'plant/grass-tuft-dry' : 'plant/grass-fescue', 'plant', tx, ty, h(24 + q) * 6.3, { scale: 0.9 + h(28 + q) * 1.2 });
            out.tufts++;
          }
        }
      }
    }
  return out;
}
