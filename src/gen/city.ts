import { Rng } from '../core/rng';
import { Districts, generateDistricts } from './districts';
import { Highways } from './highways';
import { RoadGraph, buildRoadGraph } from './roadGraph';
import { generateRoads } from './roads';
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
  ms: number;
}

export interface City {
  config: CityConfig;
  terrain: Terrain;
  districts: Districts;
  field: TensorField;
  highways: Highways;
  /** Centre lines as traced, before graph clean-up (debugging). */
  lines: RoadLine[];
  graph: RoadGraph;
  stats: CityStats;
}

export const DEFAULT_CONFIG: CityConfig = { seed: 1, size: 2400 };

export function generateCity(config: CityConfig = DEFAULT_CONFIG): City {
  const t0 = performance.now();
  const rng = new Rng(config.seed);
  const terrain = generateTerrain(config.size, rng.fork('terrain'));
  const districts = generateDistricts(terrain, rng.fork('districts'));
  const roads = generateRoads(terrain, districts, rng.fork('roads'));
  const graph = buildRoadGraph(roads.lines, terrain, districts, rng.fork('graph'));

  const degree = [0, 0, 0, 0, 0, 0, 0];
  for (const n of graph.nodes) degree[Math.min(6, n.degree)]++;
  const length: Record<RoadClass, number> = { highway: 0, ramp: 0, arterial: 0, collector: 0, local: 0 };
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
    ms: performance.now() - t0,
  };
  return { config, terrain, districts, field: roads.field, highways: roads.highways, lines: roads.lines, graph, stats };
}
