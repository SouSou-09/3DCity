import { ModelData } from '../assets/mesh/builder';
import { City } from '../gen/city';
import { ParkPlan, placeParks } from './parks';
import { RoadModel } from './roadModel';
import { PARK, SITE_KINDS, Site, SiteItem, SiteKind } from './site';
import { Waterfront, placeWaterfront } from './waterfront';

export interface OpenSpace {
  items: SiteItem[];
  /** Paths, playground surfaces and other paving draped on the ground. */
  tiles: ModelData[];
  /** Ground heights on the terrain grid, as the roads left them and the waterfront reshaped them. */
  ground: Float32Array;
  parks: ParkPlan[];
  shore: Waterfront;
  site: Site;
  stats: Record<SiteKind, number>;
  /** Whether a point is park land. */
  isPark: (x: number, y: number) => boolean;
}

/** Everything that stands off the roads other than buildings: parks, the waterfront, fences and guard rails. */
export function placeOpenSpace(city: City, roads: RoadModel): OpenSpace {
  const site = new Site(city, roads);
  const { parks, tiles } = placeParks(site);
  const shore = placeWaterfront(site);
  tiles.push(...shore.tiles);
  const stats = Object.fromEntries(SITE_KINDS.map((k) => [k, 0])) as Record<SiteKind, number>;
  for (const it of site.items) stats[it.kind]++;
  return { items: site.items, tiles, ground: site.ground, parks, shore, site, stats, isPark: (x, y) => site.at(x, y) === PARK };
}
