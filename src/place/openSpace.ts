import { ModelData } from '../assets/mesh/builder';
import { City } from '../gen/city';
import { LandUse } from '../gen/landuse';
import { Boundaries, placeBoundaries } from './boundaries';
import { Buildings, placeBuildings } from './buildings';
import { ParkPlan, placeParks } from './parks';
import { RoadModel } from './roadModel';
import { PARK, SITE_CELL, SITE_KINDS, Site, SiteItem, SiteKind } from './site';
import { Waterfront, placeWaterfront } from './waterfront';

export interface OpenSpace {
  items: SiteItem[];
  /** Paths, playground surfaces and other paving draped on the ground. */
  tiles: ModelData[];
  /** Ground heights on the terrain grid, as the roads left them and the waterfront reshaped them. */
  ground: Float32Array;
  parks: ParkPlan[];
  shore: Waterfront;
  bounds: Boundaries;
  buildings: Buildings;
  site: Site;
  stats: Record<SiteKind, number>;
  /** Whether a point is park land. */
  isPark: (x: number, y: number) => boolean;
  /** Whether a point is on a lot with a garden: houses, flats and public buildings. */
  isYard: (x: number, y: number) => boolean;
}

const GREEN: Partial<Record<LandUse, boolean>> = { R1: true, R2: true, R3: true, CV: true };

/** Everything that stands off the roads: parks, the waterfront, the buildings on their lots, fences and guard rails. */
export function placeOpenSpace(city: City, roads: RoadModel): OpenSpace {
  const site = new Site(city, roads);
  const { parks, tiles } = placeParks(site);
  const shore = placeWaterfront(site);
  tiles.push(...shore.tiles);
  const buildings = placeBuildings(site, shore);
  tiles.push(...buildings.tiles);
  const bounds = placeBoundaries(site, shore);
  const stats = Object.fromEntries(SITE_KINDS.map((k) => [k, 0])) as Record<SiteKind, number>;
  for (const it of site.items) stats[it.kind]++;
  const land = city.land;
  const sand = new Set(shore.sandLots);
  const isYard = (x: number, y: number): boolean => {
    const [i, j] = [Math.floor(x / land.cell), Math.floor(y / land.cell)];
    if (i < 0 || j < 0 || i >= land.n || j >= land.n) return false;
    const lot = land.grid[j * land.n + i] - 1;
    const id = lot >= 0 ? lot : buildings.owner[Math.floor(y / SITE_CELL) * site.n + Math.floor(x / SITE_CELL)] - 1;
    return id >= 0 && !sand.has(id) && GREEN[land.lots[id].use] === true;
  };
  return { items: site.items, tiles, ground: site.ground, parks, shore, bounds, buildings, site, stats, isPark: (x, y) => site.at(x, y) === PARK, isYard };
}
