import { City } from '../gen/city';
import { DistrictType, districtAt } from '../gen/districts';
import { LandUse } from '../gen/landuse';
import { BELT, COPSE, RIVERSIDE } from './leftover';
import { OpenSpace } from './openSpace';
import { PARK, RAIL, SITE_CELL, Site } from './site';

/** What the open ground of each kind of district is, where nothing else says: lawn, rough grass, bare earth and gravel, hard standing. */
const OPEN: Record<DistrictType, [number, number, number, number]> = {
  downtown: [0, 0, 0, 1],
  midtown: [0, 0.1, 0.1, 0.9],
  oldtown: [0, 0.25, 0.35, 0.6],
  residential: [0.15, 1, 0.15, 0],
  beach: [0, 0.9, 0.3, 0],
  suburb: [0.1, 1, 0.1, 0],
  industrial: [0, 0.45, 1, 0],
  hills: [0, 0.6, 0.06, 0],
};
/** The ground of a lot around what is built and paved on it. */
const LOTS: Record<LandUse, [number, number, number, number]> = {
  R1: [1, 1, 0, 0],
  R2: [0.9, 1, 0, 0],
  R3: [0.85, 1, 0, 0.1],
  C1: [0, 0, 0, 1],
  C2: [0, 0, 0, 1],
  C3: [0, 0, 0.1, 1],
  C4: [0, 0, 0, 1],
  O1: [0, 0, 0, 1],
  O2: [0, 0, 0, 1],
  I1: [0, 0.2, 1, 0.3],
  I2: [0, 0.1, 1, 0.2],
  PK: [0, 0, 0.2, 1],
  CV: [1, 1, 0, 0],
  OS: [0.55, 1, 0.1, 0],
};

/**
 * What covers the ground, on the raster of the sites (2 m): four weights to a cell, each 0..255, of mown lawn, rough
 * grass, bare earth and gravel, and hard standing. They are laid one over the other in that order, lawn last, so a
 * cell may be part one and part another. Sand and the hills' own cover are not in it.
 */
export function landCover(city: City, open: OpenSpace): Uint8Array<ArrayBuffer> {
  const { site, shore, buildings, leftover } = open;
  const t = city.terrain;
  const land = city.land;
  const n = site.n;
  const sand = new Set(shore.sandLots);
  // What open ground is, at each vertex of the terrain: the district's, grass where the river bank is made ground, paving on a port's yard.
  const base = new Float32Array(t.n * t.n * 4);
  for (let j = 0; j < t.n; j++)
    for (let i = 0; i < t.n; i++) {
      const k = j * t.n + i;
      const w = [...OPEN[districtAt(t, city.districts, i * t.cell, j * t.cell).type]];
      if (shore.banks[k]) [w[0], w[1], w[2], w[3]] = [0.6, 1, 0, 0];
      w[3] = Math.max(w[3], shore.paved[k]);
      base.set(w, k * 4);
    }
  const hash = (id: number, salt: number): number => {
    let h = (Math.imul(id + 1, 374761393) ^ Math.imul(salt, 668265263) ^ Math.imul(city.config.seed, 362437)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vacant = new Set(buildings.vacant);
  // On the hills a plot is the hillside but for the garden kept round the house.
  const garden = new Uint8Array(n * n);
  for (const b of buildings.list) {
    if (land.lots[b.lot].site.type !== 'hills') continue;
    const [rx, rz] = [b.hx + 7, b.hz + 7];
    for (let mz = -rz; mz <= rz; mz += 1)
      for (let mx = -rx; mx <= rx; mx += 1) {
        const p = Site.local(b.x, b.y, b.yaw, mx, mz);
        const [i, j] = [Math.floor(p.x / SITE_CELL), Math.floor(p.y / SITE_CELL)];
        if (i >= 0 && j >= 0 && i < n && j < n) garden[j * n + i] = 1;
      }
  }
  const out = new Uint8Array(n * n * 4);
  const w = [0, 0, 0, 0];
  for (let j = 0; j < n; j++) {
    const y = (j + 0.5) * SITE_CELL;
    const [fy, lj] = [Math.min(y / t.cell, t.n - 1.001), Math.floor(y / land.cell)];
    const [tj, v] = [Math.floor(fy), fy - Math.floor(fy)];
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * SITE_CELL;
      const c = j * n + i;
      const code = site.grid[c];
      const li = Math.floor(x / land.cell);
      let id = li < land.n && lj < land.n ? land.grid[lj * land.n + li] - 1 : -1;
      if (id < 0) id = buildings.owner[c] - 1;
      if (id < 0) id = leftover.claim[c] - 1;
      const kind = id < 0 || vacant.has(id) ? leftover.kind[c] : 0;
      if (code === PARK) [w[0], w[1], w[2], w[3]] = [1, 0, 0, 0];
      else if (code === RAIL) {
        // Under and beside the tracks: ballast and cinders, but in the middle of town the ground under a viaduct is paved and used.
        const d = districtAt(t, city.districts, x, y).type;
        [w[0], w[1], w[2], w[3]] = d === 'downtown' || d === 'midtown' ? [0, 0, 0.12, 1] : d === 'oldtown' ? [0, 0.05, 0.4, 0.7] : [0, 0.15, 1, 0];
      }
      else if (kind === RIVERSIDE || kind === BELT || kind === COPSE) [w[0], w[1], w[2], w[3]] = kind === RIVERSIDE ? [0.7, 1, 0, 0] : kind === BELT ? [0, 1, 0.12, 0] : [0.12, 1, 0.08, 0];
      else if (id >= 0 && !sand.has(id) && !(land.lots[id].site.type === 'hills' ? vacant.has(id) || !garden[c] : false)) {
        const lot = land.lots[id];
        const k = LOTS[lot.use];
        [w[0], w[1], w[2], w[3]] = k;
        if (lot.use === 'R1' || lot.use === 'R2') {
          // No two gardens are kept alike: a few are watered and mown, most are tired, some have gone to weeds and bare earth.
          const care = hash(id, 1);
          w[0] = care < 0.12 ? 0.15 : 0.5 + 0.5 * hash(id, 2);
          w[2] = care < 0.12 ? 0.45 : 0;
        }
        // Grass is for gardens and grounds: the forecourt of a block of flats, an office's yard, the front of a public building are hard.
        const hard = buildings.hard.get(id);
        if (hard && (x - hard[0]) * hard[2] + (y - hard[1]) * hard[3] < hard[4]) [w[0], w[1], w[2], w[3]] = [0, 0, lot.use === 'R1' ? 0.12 : 0.04, 1];
        // A plot nothing was built on is waste ground until something is.
        if (vacant.has(id) && lot.use !== 'OS' && lot.use !== 'PK') [w[0], w[1], w[2], w[3]] = [0, 0.85, 0.4, 0];
      } else {
        const fx = Math.min(x / t.cell, t.n - 1.001);
        const [ti, u] = [Math.floor(fx), fx - Math.floor(fx)];
        const k = (tj * t.n + ti) * 4;
        for (let q = 0; q < 4; q++) w[q] = (base[k + q] * (1 - u) + base[k + 4 + q] * u) * (1 - v) + (base[k + t.n * 4 + q] * (1 - u) + base[k + t.n * 4 + 4 + q] * u) * v;
      }
      for (let q = 0; q < 4; q++) out[c * 4 + q] = Math.round(255 * w[q]);
    }
  }
  return out;
}
