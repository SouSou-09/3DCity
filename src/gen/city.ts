import { Rng } from '../core/rng';
import { InfillStats, addInfillRoads } from './blocks';
import { Districts, generateDistricts } from './districts';
import { Highways } from './highways';
import { LandUsePlan, planLandUse } from './landuse';
import { Rail, RailCrossing, RailIndex, railCrossings } from './rail';
import { RoadGraph, buildRoadGraph } from './roadGraph';
import { RoadProfile, roadProfiles } from './roadSections';
import { generateRoads } from './roads';
import { Station, placeStations } from './stations';
import { RoadClass, RoadLine } from './streamlines';
import { TensorField } from './tensorField';
import { Terrain, generateTerrain } from './terrain';

export interface CityConfig {
  seed: number;
  /** Side length of the square map in metres. */
  size: number;
}

export interface CityStats {
  nodes: number;
  edges: number;
  /** Junction count by number of arms (index 1 = dead ends, 3 = T-junctions, ...; 6 = six or more). */
  degree: number[];
  /** Total centre-line length per road class in metres. */
  length: Record<RoadClass, number>;
  bridges: number;
  interchanges: number;
  /** Track length in metres, and how many streets cross it at grade. */
  rail: number;
  levelCrossings: number;
  /** Roads added inside blocks that were too deep. */
  infill: InfillStats;
  stations: number;
  lots: number;
  ms: number;
}

export interface City {
  config: CityConfig;
  terrain: Terrain;
  districts: Districts;
  field: TensorField;
  highways: Highways;
  /** Railway centre lines; the tracks, crossings and stations are built from them by buildRailModel. */
  rail: Rail;
  /** Where roads and tracks cross. */
  railCrossings: RailCrossing[];
  /** Centre lines as traced, before graph clean-up (debugging). */
  lines: RoadLine[];
  graph: RoadGraph;
  /** Station positions on the main line (no station models are placed yet). */
  stations: Station[];
  /** Land use and lots along every street. */
  land: LandUsePlan;
  /** Cross-section per road edge, chosen after the land use. */
  profiles: RoadProfile[];
  stats: CityStats;
}

export const DEFAULT_CONFIG: CityConfig = { seed: 1, size: 4800 };

export function generateCity(config: CityConfig = DEFAULT_CONFIG): City {
  const t0 = performance.now();
  const rng = new Rng(config.seed);
  const terrain = generateTerrain(config.size, rng.fork('terrain'));
  const districts = generateDistricts(terrain, rng.fork('districts'));
  const roads = generateRoads(terrain, districts, rng.fork('roads'));
  const railIndex = new RailIndex(roads.rail);
  const graph = buildRoadGraph(roads.lines, terrain, districts, rng.fork('graph'), railIndex);
  const infill = addInfillRoads(graph, terrain, districts, roads.rail, rng.fork('infill'));
  const crossings = railCrossings(railIndex, graph);
  const stations = placeStations(roads.rail, terrain, districts, rng.fork('stations'));
  const land = planLandUse(graph, terrain, districts, roads.rail, stations, rng.fork('land'));

  const profiles = roadProfiles(graph, terrain, districts, land, rng.fork('profiles'));

  const degree = [0, 0, 0, 0, 0, 0, 0];
  for (const n of graph.nodes) degree[Math.min(6, n.degree)]++;
  const length: Record<RoadClass, number> = { highway: 0, ramp: 0, arterial: 0, collector: 0, local: 0, alley: 0, path: 0 };
  let bridges = 0;
  for (const e of graph.edges) {
    length[e.cls] += e.length;
    if (e.bridge) bridges++;
  }
  const stats: CityStats = {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    degree,
    length,
    bridges,
    interchanges: roads.interchanges,
    rail: roads.rail.lines.reduce((sum, l) => sum + l.length, 0),
    levelCrossings: crossings.filter((c) => c.kind === 'level').length,
    infill,
    stations: stations.length,
    lots: land.lots.length,
    ms: performance.now() - t0,
  };
  return { config, terrain, districts, field: roads.field, highways: roads.highways, rail: roads.rail, railCrossings: crossings, lines: roads.lines, graph, stations, land, profiles, stats };
}
