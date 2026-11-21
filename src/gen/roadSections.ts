import { Rng } from '../core/rng';
import { DistrictType, Districts, districtAt } from './districts';
import type { LandUse, LandUsePlan } from './landuse';
import { RoadGraph } from './roadGraph';
import { Terrain, gradient } from './terrain';
import { RoadClass } from './streamlines';

/** Width of the right of way (kerb to kerb plus pavements and verges), metres. Lots start at its edge. */
const ROW: Record<RoadClass, number> = { highway: 32, ramp: 9, arterial: 28, collector: 19, local: 15, alley: 6, path: 3 };
const ROW_BY_DISTRICT: Partial<Record<RoadClass, Partial<Record<DistrictType, number>>>> = {
  arterial: { downtown: 34, midtown: 32, industrial: 24, hills: 20, oldtown: 24 },
  collector: { downtown: 21, midtown: 20, hills: 12, oldtown: 15, beach: 17 },
  local: { downtown: 16, midtown: 16, oldtown: 10.5, suburb: 17, hills: 8, industrial: 14, beach: 11 },
  alley: { industrial: 8, oldtown: 5 },
};
export const rowWidth = (cls: RoadClass, type: DistrictType): number => ROW_BY_DISTRICT[cls]?.[type] ?? ROW[cls];

/** Cross-section chosen for one road edge. The 3D view turns it into a road model. */
export interface RoadProfile {
  /** Driving lanes per direction (in total for one-way streets). */
  lanes: number;
  laneW: number;
  oneWay: boolean;
  /** Kerbside parking on no, one or both sides. */
  parking: 0 | 1 | 2;
  bike: boolean;
  bus: boolean;
  median: 'raised' | 'planted' | 'turn' | null;
  /** Pavement and verge widths, metres (0 = none). */
  walk: number;
  verge: number;
  kerb: boolean;
  age: 'fresh' | 'used' | 'worn' | 'bleached';
  wear: 'clean' | 'cracked' | 'sealed' | 'patched' | 'broken';
  /** Right-of-way width the section must fit in. */
  row: number;
  /** Share of the lots along the edge by frontage length. */
  trade: number;
  homes: number;
  industry: number;
  /** Leads to a station entrance. */
  station: boolean;
}

/** Kerb-to-kerb width of a profile, metres. */
export function carriageway(p: RoadProfile): number {
  const dirs = p.oneWay ? 1 : 2;
  return dirs * p.lanes * p.laneW + p.parking * 2.4 + (p.bike ? dirs * 1.6 : 0) + (p.median === 'turn' ? 3.4 : p.median ? 2.4 : 0) + (p.kerb ? 0.6 : 0);
}
export const profileWidth = (p: RoadProfile): number => carriageway(p) + 2 * (p.walk + p.verge) + (p.kerb ? 0.3 : 0);

const TRADE: Partial<Record<LandUse, boolean>> = { C1: true, C2: true, C3: true, C4: true, O1: true, O2: true, CV: true };
const HOMES: Partial<Record<LandUse, boolean>> = { R1: true, R2: true, R3: true };
const INDUSTRY: Partial<Record<LandUse, boolean>> = { I1: true, I2: true };

/**
 * Picks every edge's cross-section from its class, its district, the land use that was decided along it,
 * and what it connects (station, freeway ramp, city centre). Placement plan §3.1.
 */
export function roadProfiles(graph: RoadGraph, t: Terrain, districts: Districts, land: LandUsePlan, rng: Rng): RoadProfile[] {
  const front = graph.edges.map(() => ({ trade: 0, homes: 0, industry: 0, total: 0 }));
  for (const l of land.lots) {
    const f = front[l.edge];
    f.total += l.width;
    if (TRADE[l.use]) f.trade += l.width;
    else if (HOMES[l.use]) f.homes += l.width;
    else if (INDUSTRY[l.use]) f.industry += l.width;
  }
  return graph.edges.map((e) => {
    const r = rng.fork(`road${e.id}`);
    const mid = e.points[e.points.length >> 1];
    const type = districtAt(t, districts, mid.x, mid.y).type;
    const f = front[e.id];
    const trade = f.total ? f.trade / f.total : 0;
    const homes = f.total ? f.homes / f.total : 0;
    const industry = f.total ? f.industry / f.total : type === 'industrial' ? 1 : 0;
    const near = (arr: Float64Array) => Math.min(arr[e.a], arr[e.b]);
    const station = e.cls !== 'highway' && e.cls !== 'ramp' && near(land.stationDist) < 230;
    const ramp = near(land.rampTime);
    const centre = near(land.centreTime);
    const core = type === 'downtown' || type === 'midtown';
    const g = gradient(t, t.height, mid.x, mid.y, 12);
    const steep = Math.hypot(g.x, g.y) > 0.08;
    const old = type === 'oldtown' || type === 'industrial' || type === 'beach';
    const p: RoadProfile = {
      lanes: 1,
      laneW: 3.2,
      oneWay: false,
      parking: 0,
      bike: false,
      bus: false,
      median: null,
      walk: 0,
      verge: 0,
      kerb: true,
      age: old ? (r.chance(0.5) ? 'worn' : 'bleached') : r.chance(0.2) ? 'fresh' : r.chance(0.7) ? 'used' : 'worn',
      wear: r.pick(old ? (['cracked', 'patched', 'patched', 'sealed', 'broken'] as const) : (['clean', 'clean', 'sealed', 'cracked', 'patched'] as const)),
      row: rowWidth(e.cls, type),
      trade,
      homes,
      industry,
      station,
    };
    switch (e.cls) {
      case 'highway':
        p.lanes = 3;
        p.laneW = 3.6;
        p.kerb = false;
        p.age = r.chance(0.5) ? 'used' : 'worn';
        p.wear = r.chance(0.6) ? 'clean' : 'sealed';
        break;
      case 'ramp':
        p.oneWay = true;
        p.laneW = 4;
        p.kerb = false;
        p.age = 'used';
        p.wear = 'clean';
        break;
      case 'arterial':
        // Six lanes where the traffic of the centre or a freeway ramp gathers; four elsewhere; two in the hills.
        p.lanes = type === 'hills' ? 1 : core || ramp < 25 || centre < 45 ? 3 : 2;
        p.laneW = industry > 0.5 ? 3.6 : 3.3;
        p.median = type === 'hills' || type === 'oldtown' ? null : trade > 0.45 || core ? 'turn' : 'planted';
        p.bus = station && p.lanes >= 3;
        p.parking = trade > 0.5 && !core ? 2 : 0;
        p.walk = core ? (trade > 0.4 || station ? 5.5 : 4.5) : trade > 0.4 || station ? 3.4 : 2.4;
        p.verge = core || trade > 0.4 || industry > 0.5 ? 0 : 1.5;
        if (p.age !== 'fresh' && r.chance(0.5)) p.age = 'used';
        break;
      case 'collector':
        p.laneW = industry > 0.5 ? 3.6 : 3.2;
        p.bike = (core || type === 'beach' || station) && industry < 0.5;
        p.parking = industry > 0.5 || type === 'hills' ? 0 : trade > 0.3 || homes > 0.3 ? 2 : 1;
        p.median = null;
        p.walk = core ? 3.5 : trade > 0.4 || station ? 3 : type === 'hills' ? 0 : 1.8;
        p.verge = core || trade > 0.4 || old || type === 'hills' ? 0 : 1.2;
        break;
      case 'local':
        p.laneW = industry > 0.5 ? 3.6 : type === 'oldtown' || type === 'beach' || type === 'hills' ? 2.75 : 3;
        p.oneWay = (type === 'oldtown' || type === 'downtown') && r.chance(0.45);
        p.parking = industry > 0.5 || type === 'hills' ? 0 : type === 'suburb' ? (homes > 0.5 ? 1 : 0) : type === 'oldtown' || type === 'beach' ? 1 : 2;
        p.walk = type === 'hills' ? 0 : core ? 3 : trade > 0.4 || station ? 2.4 : 1.5;
        p.verge = core || old || trade > 0.4 || type === 'hills' ? 0 : type === 'suburb' ? 2 : 1.5;
        break;
      case 'alley':
        p.oneWay = true;
        p.laneW = type === 'industrial' ? 6 : type === 'oldtown' ? 4 : 4.6;
        p.kerb = false;
        p.age = r.chance(0.6) ? 'bleached' : 'worn';
        p.wear = r.pick(['cracked', 'patched', 'broken'] as const);
        break;
      case 'path':
        p.lanes = 0;
        p.kerb = false;
        p.walk = 1.5;
        break;
    }
    if (steep && e.cls !== 'highway' && e.cls !== 'ramp') {
      p.parking = 0;
      p.bike = false;
      p.verge = 0;
    }
    // Fit the right of way: give up extras first, then pavement width.
    const fits = () => profileWidth(p) <= p.row + 0.01;
    if (!fits()) p.verge = 0;
    if (!fits() && p.parking === 2) p.parking = 1;
    if (!fits()) p.bike = false;
    if (!fits()) p.parking = 0;
    if (!fits() && p.median === 'planted') p.median = null;
    if (!fits() && p.walk > 0) p.walk = Math.max(1.2, p.walk - (profileWidth(p) - p.row) / 2);
    if (!fits() && p.lanes > 1) p.lanes--;
    return p;
  });
}
