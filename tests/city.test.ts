import { describe, expect, it, vi } from 'vitest';
import { SegmentIndex, pointSeg, segSeg } from '../src/core/geom';
import { angleDiff, clamp, dist, mix } from '../src/core/vec2';
import { City, DEFAULT_CONFIG, generateCity } from '../src/gen/city';
import { districtAt } from '../src/gen/districts';
import { LAND_USES, LandUse, Site, useWeights } from '../src/gen/landuse';
import { STREET_CLEARANCE, roadLevels } from '../src/gen/roadHeights';
import { profileWidth } from '../src/gen/roadSections';
import { layout } from '../src/assets/mesh/section';
import { MODELS } from '../src/assets/mesh/registry';
import { TEXTURES } from '../src/assets/tex';
import { EDGE_STUB, RoadModel, buildRoadModel } from '../src/place/roadModel';
import { RailModel, buildRailModel } from '../src/place/railModel';
import { roadAt, trackAt } from '../src/place/railProfile';
import { placeStreetFurniture } from '../src/place/streetFurniture';
import { RAIL_MAX_GRADE, RAIL_MIN_RADIUS, RAIL_STEP, RailIndex, sharpestRailTurn } from '../src/gen/rail';
import { STATION_HALF } from '../src/gen/stations';
import { isStreet } from '../src/gen/streamlines';
import { REF_SIZE, heightAt, inBounds, isWater, seaDistAt, waterDistAt } from '../src/gen/terrain';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 16, 21];
// Generating a full-size city takes several seconds.
vi.setConfig({ testTimeout: 120_000 });

const SIZE = DEFAULT_CONFIG.size;
/** Map side and area relative to the size the generator was first tuned for. */
const SCALE = SIZE / REF_SIZE;
const AREA = SCALE ** 2;
const cities = new Map<number, City>();
const city = (seed: number): City => {
  let c = cities.get(seed);
  if (!c) cities.set(seed, (c = generateCity({ seed, size: SIZE })));
  return c;
};

/** Direction in which an edge leaves one of its end nodes. */
function leaveAngle(c: City, edge: number, node: number): number {
  const e = c.graph.edges[edge];
  const pts = e.a === node ? e.points : e.points.slice().reverse();
  let i = 1;
  while (i < pts.length - 1 && Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y) < 12) i++;
  return Math.atan2(pts[i].y - pts[0].y, pts[i].x - pts[0].x);
}

describe('city generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateCity({ seed: 3, size: SIZE });
    const b = city(3);
    expect(a.graph.nodes).toEqual(b.graph.nodes);
    expect(a.graph.edges).toEqual(b.graph.edges);
    expect(a.rail).toEqual(b.rail);
    expect(a.railCrossings).toEqual(b.railCrossings);
    expect(a.stations).toEqual(b.stations);
    expect(a.land.lots).toEqual(b.land.lots);
    expect(a.profiles).toEqual(b.profiles);
  });

  it('adds districts, parks, a tributary and a second freeway on a bigger map instead of stretching the small one', () => {
    const small = generateCity({ seed: 3, size: REF_SIZE });
    const big = city(3);
    expect(small.terrain.streams).toEqual([]);
    expect(small.highways.cross).toBeNull();
    expect(big.districts.list.length).toBeGreaterThan(small.districts.list.length * 0.6 * AREA);
    expect(big.districts.parks.length).toBeGreaterThan(small.districts.parks.length);
    if (SIZE >= 1.5 * REF_SIZE) {
      expect(big.terrain.streams.length).toBeGreaterThan(0);
      expect(big.highways.cross).not.toBeNull();
    }
  });

  it('gives different cities for different seeds', () => {
    expect(city(1).graph.edges.length).not.toBe(city(2).graph.edges.length);
    expect(city(1).terrain.river[20]).not.toEqual(city(2).terrain.river[20]);
  });

  describe.each(SEEDS)('seed %i', (seed) => {
    it('has a consistent graph', () => {
      const { nodes, edges } = city(seed).graph;
      for (const e of edges) {
        const first = e.points[0];
        const last = e.points[e.points.length - 1];
        expect(Math.hypot(first.x - nodes[e.a].x, first.y - nodes[e.a].y)).toBeLessThan(0.01);
        expect(Math.hypot(last.x - nodes[e.b].x, last.y - nodes[e.b].y)).toBeLessThan(0.01);
        expect(nodes[e.a].edges).toContain(e.id);
        expect(nodes[e.b].edges).toContain(e.id);
        expect(e.length).toBeGreaterThan(1);
      }
      for (const n of nodes) {
        expect(n.edges.length).toBeGreaterThan(0);
        expect(n.degree).toBe(edges.filter((e) => e.a === n.id).length + edges.filter((e) => e.b === n.id).length);
      }
    });

    it('is one connected network that includes the freeway', () => {
      const { nodes, edges } = city(seed).graph;
      const seen = new Set([0]);
      const stack = [0];
      while (stack.length) {
        const n = stack.pop()!;
        for (const k of nodes[n].edges) {
          const o = edges[k].a === n ? edges[k].b : edges[k].a;
          if (!seen.has(o)) {
            seen.add(o);
            stack.push(o);
          }
        }
      }
      expect(seen.size).toBe(nodes.length);
      const s = city(seed).stats;
      expect(s.length.highway).toBeGreaterThan(1500 * SCALE);
      expect(s.interchanges).toBeGreaterThanOrEqual(2);
    });

    it('is not a plain grid', () => {
      const s = city(seed).stats;
      // Real street networks have more T-junctions than four-way crossings, plus some dead ends.
      expect(s.degree[3]).toBeGreaterThan(s.degree[4] * 0.8);
      expect(s.degree[1]).toBeGreaterThan(5);
      // Street directions are spread out instead of falling into two perpendicular bins.
      const bins = new Array(12).fill(0);
      let total = 0;
      for (const e of city(seed).graph.edges) {
        if (!isStreet(e.cls)) continue;
        for (let i = 1; i < e.points.length; i++) {
          const dx = e.points[i].x - e.points[i - 1].x;
          const dy = e.points[i].y - e.points[i - 1].y;
          const a = (Math.atan2(dy, dx) + Math.PI) % (Math.PI / 2);
          const l = Math.hypot(dx, dy);
          bins[Math.min(11, Math.floor((a / (Math.PI / 2)) * 12))] += l;
          total += l;
        }
      }
      expect(Math.max(...bins) / total).toBeLessThan(0.45);
    });

    it('has every road class and enough streets', () => {
      const s = city(seed).stats;
      expect(s.length.arterial).toBeGreaterThan(8000 * AREA);
      expect(s.length.collector).toBeGreaterThan(5000 * AREA);
      expect(s.length.local).toBeGreaterThan(10000 * AREA);
      expect(s.bridges).toBeGreaterThanOrEqual(2);
    });

    it('keeps roads out of the water except on bridges', () => {
      const c = city(seed);
      for (const e of c.graph.edges) {
        if (e.bridge) continue;
        for (const p of e.points) expect(isWater(c.terrain, p.x, p.y), `edge ${e.id} at ${p.x},${p.y}`).toBe(false);
      }
    });

    it('has no slivers: tiny street segments or very sharp street junctions', () => {
      const c = city(seed);
      const { nodes, edges } = c.graph;
      let short = 0;
      for (const e of edges) if (isStreet(e.cls) && !e.bridge && e.length < 15 && nodes[e.a].edges.length > 1 && nodes[e.b].edges.length > 1) short++;
      expect(short).toBeLessThanOrEqual(2);
      let sharp = 0;
      for (const n of nodes) {
        const arms = n.edges.filter((k) => isStreet(edges[k].cls) && edges[k].a !== edges[k].b);
        for (let i = 0; i < arms.length; i++) {
          for (let j = i + 1; j < arms.length; j++) {
            if (angleDiff(leaveAngle(c, arms[i], n.id), leaveAngle(c, arms[j], n.id)) < (20 * Math.PI) / 180) sharp++;
          }
        }
      }
      expect(sharp).toBeLessThanOrEqual(3);
    });

    it('lets only arterials and collectors cross the freeway', () => {
      const { edges, crossings } = city(seed).graph;
      for (const c of crossings) expect(edges[c.street].cls, `edge ${c.street} at ${c.x},${c.y}`).not.toBe('local');
    });

    it('has no streets crossing without a junction', () => {
      const { edges } = city(seed).graph;
      // Alleys and paths included.
      const streets = edges.filter((e) => e.cls !== 'highway' && e.cls !== 'ramp');
      let crossings = 0;
      for (let i = 0; i < streets.length; i++) {
        for (let j = i + 1; j < streets.length; j++) {
          const a = streets[i];
          const b = streets[j];
          if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
          for (let p = 1; p < a.points.length; p++) {
            for (let q = 1; q < b.points.length; q++) {
              if (segSeg(a.points[p - 1], a.points[p], b.points[q - 1], b.points[q])) crossings++;
            }
          }
        }
      }
      expect(crossings).toBe(0);
    });
    it('adds alleys, streets, cul-de-sacs and paths inside deep blocks, clear of water, freeway and tracks', () => {
      const c = city(seed);
      const s = c.stats.infill;
      expect(s.alleys).toBeGreaterThan(30 * AREA);
      expect(s.streets).toBeGreaterThan(8 * AREA);
      expect(s.culDeSacs).toBeGreaterThan(15 * AREA);
      expect(s.paths).toBeGreaterThan(3 * AREA);
      const added = c.graph.edges.filter((e) => e.infill);
      expect(c.graph.edges.filter((e) => e.cls === 'alley' || e.cls === 'path').every((e) => e.infill)).toBe(true);
      const freeway = new SegmentIndex(60);
      for (const e of c.graph.edges) if (e.cls === 'highway' || e.cls === 'ramp') freeway.addLine(e.id, e.points);
      const index = new RailIndex(c.rail);
      let bad = 0;
      for (const e of added) {
        if (e.bridge || e.length < 15) bad++;
        for (let i = 1; i < e.points.length; i++) {
          const a = e.points[i - 1];
          const b = e.points[i];
          if (isWater(c.terrain, b.x, b.y) || index.crossings(a, b).length) bad++;
          freeway.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (r) => {
            if (segSeg(a, b, r.a, r.b)) bad++;
          });
        }
      }
      expect(bad).toBe(0);
    });

    it('has a main railway line across the map, with gentle curves and grades', () => {
      const { rail } = city(seed);
      const main = rail.lines[0];
      expect(main?.kind).toBe('main');
      const edge = (p: { x: number; y: number }) => Math.min(p.x, p.y, SIZE - p.x, SIZE - p.y);
      expect(edge(main.points[0])).toBeLessThan(1);
      expect(edge(main.points[main.points.length - 1])).toBeLessThan(1);
      expect(main.length).toBeGreaterThan(SIZE * 0.8);
      for (const line of rail.lines) {
        expect(line.structure.length).toBe(line.points.length);
        expect(line.level.length).toBe(line.points.length);
        expect(RAIL_STEP / sharpestRailTurn(line.points), `${line.kind} radius`).toBeGreaterThanOrEqual(RAIL_MIN_RADIUS[line.kind] * 0.95);
        for (let i = 1; i < line.points.length; i++) {
          expect(Math.abs(line.level[i] - line.level[i - 1]) / RAIL_STEP, `${line.kind} grade at ${i}`).toBeLessThanOrEqual(RAIL_MAX_GRADE * 1.02);
        }
      }
    });

    it('keeps the railway out of the sea and on bridges over rivers', () => {
      const { rail, terrain } = city(seed);
      for (const line of rail.lines) {
        line.points.forEach((p, i) => {
          expect(seaDistAt(terrain, p.x, p.y), `${line.kind} at ${i}`).toBeGreaterThanOrEqual(15);
          if (isWater(terrain, p.x, p.y)) expect(line.structure[i]).toBe('bridge');
        });
      }
    });

    it('routes the railway clear of the freeway, with the branch short and among the works', () => {
      const c = city(seed);
      const freeway = new SegmentIndex(80);
      for (const e of c.graph.edges) if (e.cls === 'highway') freeway.addLine(e.id, e.points);
      for (const line of c.rail.lines) {
        // Under or over the freeway once or twice, never beside it.
        let beside = 0;
        for (const p of line.points) {
          let near = false;
          freeway.query(p.x - 60, p.y - 60, p.x + 60, p.y + 60, (r) => {
            near ||= pointSeg(p.x, p.y, r.a, r.b).d < 60;
          });
          if (near) beside++;
        }
        expect(beside * RAIL_STEP, `${line.kind} beside the freeway`).toBeLessThanOrEqual(260);
        if (line.kind !== 'freight') continue;
        expect(line.length).toBeLessThanOrEqual(1600);
        const works = line.points.filter((p) => districtAt(c.terrain, c.districts, p.x, p.y).type === 'industrial').length;
        expect(works / line.points.length, 'branch among the works').toBeGreaterThan(0.6);
      }
    });

    it('has few level crossings: square to the street, apart, clear of junctions, and none on a main street near the centre', () => {
      const c = city(seed);
      const level = c.railCrossings.filter((x) => x.kind === 'level');
      const main = c.rail.lines.findIndex((l) => l.kind === 'main');
      expect(level.filter((x) => x.line === main).length).toBeLessThanOrEqual(8);
      for (const x of level) {
        const e = c.graph.edges[x.edge];
        const line = c.rail.lines[x.line];
        const where = `${e.cls} edge ${e.id} over the ${line.kind} line at ${x.x.toFixed(0)}, ${x.y.toFixed(0)}`;
        for (const o of level) {
          if (o !== x && o.line === x.line) expect(Math.hypot(o.x - x.x, o.y - x.y), where).toBeGreaterThan(140);
        }
        if (e.cls !== 'arterial') continue;
        if (x.line === main) expect(dist(x, c.districts.downtown.center), where).toBeGreaterThan(1250);
        let seg = 0;
        for (let i = 1; i + 1 < line.points.length; i++) {
          if (pointSeg(x.x, x.y, line.points[i], line.points[i + 1]).d < pointSeg(x.x, x.y, line.points[seg], line.points[seg + 1]).d) seg = i;
        }
        let k = 0;
        for (let i = 1; i + 1 < e.points.length; i++) {
          if (pointSeg(x.x, x.y, e.points[i], e.points[i + 1]).d < pointSeg(x.x, x.y, e.points[k], e.points[k + 1]).d) k = i;
        }
        const turn = angleDiff(
          Math.atan2(line.points[seg + 1].y - line.points[seg].y, line.points[seg + 1].x - line.points[seg].x),
          Math.atan2(e.points[k + 1].y - e.points[k].y, e.points[k + 1].x - e.points[k].x),
        );
        expect(Math.abs(Math.PI / 2 - Math.min(turn, Math.PI - turn)), `${where}: skew`).toBeLessThan(0.7);
        for (const n of c.graph.nodes) {
          if (n.degree >= 3) expect(Math.hypot(n.x - x.x, n.y - x.y), `${where}: junction ${n.id}`).toBeGreaterThan(40);
        }
      }
    });

    it('lets local streets cross the tracks only at the places left open, and no street runs along them', () => {
      const c = city(seed);
      for (const x of c.railCrossings) {
        const e = c.graph.edges[x.edge];
        const line = c.rail.lines[x.line];
        if (e.cls !== 'local') continue;
        let seg = 0;
        for (let i = 1; i < line.points.length; i++) {
          if (pointSeg(x.x, x.y, line.points[i - 1], line.points[i]).d < pointSeg(x.x, x.y, line.points[seg], line.points[seg + 1]).d) seg = i - 1;
        }
        expect(line.crossable[seg], `local edge ${e.id} at ${x.x},${x.y}`).toBe(true);
      }
      const index = new RailIndex(c.rail);
      let along = 0;
      for (const e of c.graph.edges) {
        if (!isStreet(e.cls)) continue;
        let run = 0;
        for (let i = 1; i < e.points.length; i++) {
          const a = e.points[i - 1];
          const b = e.points[i];
          const l = Math.hypot(b.x - a.x, b.y - a.y);
          for (let d = 0; d < l; d += 5) {
            const hit = index.nearest(a.x + ((b.x - a.x) * d) / l, a.y + ((b.y - a.y) * d) / l, 8);
            const on = hit && c.rail.lines[hit.line].structure[hit.seg] !== 'tunnel' && Math.abs(((b.x - a.x) * hit.tan.x + (b.y - a.y) * hit.tan.y) / l) > 0.8;
            run = on ? run + 5 : 0;
            if (run === 40) along++;
          }
        }
      }
      expect(along).toBe(0);
    });
  });
});

const site = (o: Partial<Site> = {}): Site => ({ type: 'residential', road: 'collector', roadWidth: 19, relief: 0.5, slope: 0.01, station: 2500, ramp: 300, centre: 300, access: 0.5, sea: 1500, river: 1500, nuisance: 600, park: 1500, majorJunction: 1500, ...o });
/** Share of the given uses in the weights for a site. */
function share(s: Site, uses: LandUse[], corner = false): number {
  const w = useWeights(s, corner);
  const total = LAND_USES.reduce((sum, u) => sum + w[u], 0);
  return uses.reduce((sum, u) => sum + w[u], 0) / total;
}

describe('land use', () => {
  it('gets denser and more commercial towards a station', () => {
    const dense: LandUse[] = ['C2', 'R3', 'O1', 'C1'];
    expect(share(site({ station: 120 }), dense)).toBeGreaterThan(3 * share(site({ station: 400 }), dense));
    expect(share(site({ station: 120 }), ['R1'])).toBeLessThan(share(site({ station: 400 }), ['R1']));
    expect(share(site({ station: 400 }), ['R1'])).toBeLessThan(share(site(), ['R1']) * 0.5);
    expect(share(site({ station: 400 }), ['R2', 'R3'])).toBeGreaterThan(share(site(), ['R2', 'R3']));
  });

  it('puts trade on wide roads and houses on narrow ones', () => {
    const trade: LandUse[] = ['C1', 'C2', 'C3', 'C4'];
    const wide = site({ road: 'arterial', roadWidth: 28 });
    const narrow = site({ road: 'local', roadWidth: 15 });
    expect(share(wide, trade)).toBeGreaterThan(share(site(), trade));
    expect(share(site(), trade)).toBeGreaterThan(share(narrow, trade));
    expect(share(narrow, ['R1'])).toBeGreaterThan(share(wide, ['R1']) * 2);
    expect(share(site({ road: 'arterial', roadWidth: 28, ramp: 20 }), ['C3', 'C4'])).toBeGreaterThan(share(wide, ['C3', 'C4']));
  });

  it('keeps buildings off steep ground', () => {
    const total = (s: Site) => LAND_USES.reduce((sum, u) => sum + useWeights(s)[u], 0);
    expect(total(site({ slope: 0.13 }))).toBe(0);
    expect(total(site({ relief: 7 }))).toBe(0);
    const sloping = useWeights(site({ slope: 0.1 }));
    expect(sloping.R1).toBeGreaterThan(0);
    for (const u of LAND_USES) if (u !== 'R1') expect(sloping[u]).toBe(0);
    expect(useWeights(site({ type: 'hills', slope: 0.13, road: 'local' })).R1).toBeGreaterThan(0);
  });

  it.each(SEEDS)('seed %i: stations sit on the main line, apart from each other, with one in the centre', (seed) => {
    const c = city(seed);
    expect(c.stations.length).toBeGreaterThanOrEqual(2);
    expect(c.stations.filter((s) => s.kind === 'central').length).toBe(1);
    const main = c.rail.lines[0];
    c.stations.forEach((s, i) => {
      expect(s.line).toBe(0);
      expect(dist(s, main.points[s.index])).toBeLessThan(1);
      expect(inBounds(c.terrain, s.x, s.y, 60)).toBe(true);
      expect(main.structure[s.index]).not.toBe('tunnel');
      expect(main.structure[s.index]).not.toBe('bridge');
      if (i > 0) expect(dist(s, c.stations[i - 1])).toBeGreaterThan(600);
      // The platforms are on one kind of track, and a train standing at them does not hold a crossing's gates down.
      const half = Math.round(STATION_HALF / RAIL_STEP);
      for (let k = s.index - half; k <= s.index + half; k++) expect(main.structure[k], `station ${s.id} at ${k}`).toBe(main.structure[s.index]);
      for (const x of c.railCrossings) {
        if (x.kind === 'level' && x.line === 0) expect(dist(s, x), `station ${s.id}`).toBeGreaterThan(STATION_HALF + 40);
      }
    });
  });

  it.each(SEEDS)('seed %i: lots front a street, on dry land, clear of the freeway and the tracks', (seed) => {
    const c = city(seed);
    const { lots, grid, cell, n } = c.land;
    expect(lots.length).toBeGreaterThan(1500 * AREA);
    const cells = new Int32Array(lots.length);
    for (const v of grid) if (v > 0) cells[v - 1]++;
    const freeway = c.graph.edges.filter((e) => e.cls === 'highway');
    const bad = { id: 0, use: 0, small: 0, cells: 0, outside: 0, wet: 0, front: 0, freeway: 0 };
    lots.forEach((l, i) => {
      if (l.id !== i) bad.id++;
      if (!LAND_USES.includes(l.use)) bad.use++;
      if (!(l.area > 20)) bad.small++;
      // Each lot owns cells of the plan's grid: no two lots share ground.
      if (!cells[i]) bad.cells++;
      const m = { x: l.poly.reduce((s, p) => s + p.x, 0) / l.poly.length, y: l.poly.reduce((s, p) => s + p.y, 0) / l.poly.length };
      if (!inBounds(c.terrain, m.x, m.y)) bad.outside++;
      if (!(waterDistAt(c.terrain, m.x, m.y) > 0)) bad.wet++;
      const e = c.graph.edges[l.edge];
      if (e.cls === 'highway' || e.cls === 'ramp' || e.bridge) bad.front++;
      if (freeway.some((f) => f.points.some((p, k) => k > 0 && pointSeg(m.x, m.y, f.points[k - 1], p).d < 16))) bad.freeway++;
    });
    expect(bad).toEqual({ id: 0, use: 0, small: 0, cells: 0, outside: 0, wet: 0, front: 0, freeway: 0 });
    expect(grid.length).toBe(n * n);
    expect(cell).toBeGreaterThan(0);
    let onTrack = 0;
    for (const line of c.rail.lines) {
      line.points.forEach((p, k) => {
        if (line.structure[k] === 'ground' && inBounds(c.terrain, p.x, p.y, 2) && grid[Math.floor(p.y / cell) * n + Math.floor(p.x / cell)] !== 0) onTrack++;
      });
    }
    expect(onTrack).toBe(0);
  });

  it('builds denser around the stations than far from them', () => {
    const near = { dense: 0, houses: 0, all: 0 };
    const far = { dense: 0, houses: 0, all: 0 };
    for (const seed of SEEDS) {
      for (const l of city(seed).land.lots) {
        const t = l.site.station < 250 ? near : l.site.station > 800 ? far : null;
        if (!t) continue;
        t.all += l.area;
        if (l.use === 'R1') t.houses += l.area;
        if (l.use === 'C2' || l.use === 'R3' || l.use === 'O1' || l.use === 'O2') t.dense += l.area;
      }
    }
    expect(near.all).toBeGreaterThan(0);
    expect(near.dense / near.all).toBeGreaterThan(3 * (far.dense / far.all));
    expect(near.houses / near.all).toBeLessThan(0.3 * (far.houses / far.all));
  });

  it.each(SEEDS)('seed %i: every road gets a cross-section that fits its right of way', (seed) => {
    const c = city(seed);
    expect(c.profiles.length).toBe(c.graph.edges.length);
    const wrong = c.graph.edges.filter((e) => {
      const p = c.profiles[e.id];
      if (isStreet(e.cls) && profileWidth(p) > p.row + 0.01) return true;
      return (e.cls === 'highway' && p.lanes !== 3) || (e.cls === 'path' && p.lanes !== 0) || (p.type === 'hills' && p.parking !== 0);
    });
    expect(wrong.map((e) => e.id)).toEqual([]);
    // Main roads carry more lanes than side streets, and shopping streets have wider pavements than housing streets.
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
    const lanes = (cls: string) => mean(c.graph.edges.filter((e) => e.cls === cls).map((e) => c.profiles[e.id].lanes * (c.profiles[e.id].oneWay ? 1 : 2)));
    expect(lanes('arterial')).toBeGreaterThan(lanes('local') + 1);
    const walk = (f: (p: (typeof c.profiles)[number]) => boolean) => mean(c.graph.edges.filter((e) => (e.cls === 'collector' || e.cls === 'local') && f(c.profiles[e.id])).map((e) => c.profiles[e.id].walk));
    expect(walk((p) => p.trade > 0.5)).toBeGreaterThan(walk((p) => p.homes > 0.8));
  });
});

const MODEL_SEEDS = [1, 2, 3, 7, 16];
const models = new Map<number, RoadModel>();
const model = (seed: number): RoadModel => {
  let m = models.get(seed);
  if (!m) models.set(seed, (m = buildRoadModel(city(seed))));
  return m;
};

describe('roads in 3D', () => {
  it('is deterministic', () => {
    const a = model(3);
    const b = buildRoadModel(city(3));
    expect(b.stats).toEqual(a.stats);
    expect(b.lines).toEqual(a.lines);
    expect(b.tiles[0].parts[0].positions).toEqual(a.tiles[0].parts[0].positions);
  });

  it.each(MODEL_SEEDS)('seed %i: builds nearly every road, with finite geometry', (seed) => {
    const c = city(seed);
    const m = model(seed);
    expect(m.stats.triangles).toBeGreaterThan(100000);
    for (const t of m.tiles) for (const p of t.parts) for (const v of p.positions) if (!Number.isFinite(v)) throw new Error(`bad vertex in ${p.material}`);
    const total = c.graph.edges.reduce((s, e) => s + e.length, 0);
    const missing = c.graph.edges.filter((e) => !m.lines[e.id]);
    // Short links between two overlapping junctions become part of the junction; nothing long may go missing.
    expect(missing.reduce((s, e) => s + e.length, 0)).toBeLessThan(0.006 * total);
    for (const e of missing) expect(e.length).toBeLessThan(90);
    expect(missing.filter((e) => e.cls === 'ramp' && e.length > 40)).toEqual([]);
    for (const e of c.graph.edges) if (e.cls === 'highway') expect(m.lines[e.id]).not.toBeNull();
    expect(m.stats.signals).toBeGreaterThan(20);
    expect(m.stats.piers).toBeGreaterThan(50);
  });

  it.each(MODEL_SEEDS)('seed %i: roads meet their junctions without a step', (seed) => {
    const c = city(seed);
    const m = model(seed);
    for (const j of m.junctions) {
      for (const a of j.arms) {
        const line = m.lines[a.edge];
        if (!line || !Number.isFinite(a.reach)) continue;
        const p = a.end === 0 ? line[0] : line[line.length - 1];
        const x = j.x + a.dir.x * a.reach;
        const y = j.y + a.dir.y * a.reach;
        expect(Math.hypot(p[0] - x, p[2] - y)).toBeLessThan(0.01);
        expect(p[1]).toBeCloseTo(j.plane.h + j.plane.gx * (x - j.x) + j.plane.gy * (y - j.y), 2);
      }
    }
    // Streets are not built steeper than a street can be, bar a few metres on the worst hillsides.
    let all = 0;
    let steep = 0;
    for (const e of c.graph.edges) {
      const line = m.lines[e.id];
      if (!line || e.cls === 'highway' || e.cls === 'ramp') continue;
      for (let i = 1; i < line.length; i++) {
        const run = Math.hypot(line[i][0] - line[i - 1][0], line[i][2] - line[i - 1][2]);
        all += run;
        if (run > 0.5 && Math.abs(line[i][1] - line[i - 1][1]) / run > 0.2) steep += run;
      }
    }
    expect(steep).toBeLessThan(0.004 * all);
  });

  it('does not hold a ramp up for a railway it only runs beside', () => {
    // Seed 30 ends two ramps next to the main line without crossing it.
    const c = generateCity({ ...DEFAULT_CONFIG, seed: 30 });
    const levels = roadLevels(c.graph, c.terrain, c.rail);
    let ramps = 0;
    for (const e of c.graph.edges) {
      const lv = levels.edges[e.id];
      if (e.cls !== 'ramp' || !lv) continue;
      ramps++;
      for (let i = 1; i < lv.h.length; i++) {
        const run = lv.s[i] - lv.s[i - 1];
        if (run > 0.5) expect(Math.abs(lv.h[i] - lv.h[i - 1]) / run, `ramp ${e.id}`).toBeLessThan(0.08);
      }
    }
    expect(ramps).toBeGreaterThan(4);
  });

  it.each(MODEL_SEEDS)('seed %i: ramps come down gently and roads do not kink where they leave a junction', (seed) => {
    const c = city(seed);
    const m = model(seed);
    let steep = 0;
    let ramps = 0;
    for (const e of c.graph.edges) {
      if (e.cls !== 'ramp' || !m.lines[e.id]) continue;
      ramps += e.length;
      const lv = m.levels.edges[e.id];
      for (let i = 1; i < lv.h.length; i++) {
        const run = lv.s[i] - lv.s[i - 1];
        if (run > 0.5 && Math.abs(lv.h[i] - lv.h[i - 1]) / run > 0.08) steep += run;
      }
    }
    expect(ramps).toBeGreaterThan(2500);
    expect(steep).toBeLessThan(0.01 * ramps);

    const turn = (a: number[], b: number[], d: number[]): number => {
      const [ax, ay, bx, by] = [b[0] - a[0], b[1] - a[1], d[0] - b[0], d[1] - b[1]];
      const [la, lb] = [Math.hypot(ax, ay), Math.hypot(bx, by)];
      return la < 0.5 || lb < 0.5 ? 0 : Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1));
    };
    let bends = 0;
    let sharp = 0;
    for (const e of c.graph.edges) {
      const line = m.lines[e.id];
      if (!line || e.cls === 'highway' || e.cls === 'ramp') continue;
      // Streets whose own line turns a corner keep it.
      const own = e.points.map((p) => [p.x, p.y]);
      if (own.some((_, i) => i > 0 && i + 1 < own.length && turn(own[i - 1], own[i], own[i + 1]) > 0.3)) continue;
      const built = line.map((p) => [p[0], p[2]]);
      for (let i = 1; i + 1 < built.length; i++) {
        bends++;
        if (turn(built[i - 1], built[i], built[i + 1]) > 0.45) sharp++;
      }
    }
    expect(sharp).toBeLessThan(0.002 * bends);
  });

  it.each(MODEL_SEEDS)('seed %i: the ground is graded to the streets', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const t = c.terrain;
    const ground = (x: number, y: number): number => {
      const fx = clamp(x / t.cell, 0, t.n - 1.001);
      const fy = clamp(y / t.cell, 0, t.n - 1.001);
      const [i, j] = [Math.floor(fx), Math.floor(fy)];
      const [u, v] = [fx - i, fy - j];
      const g = m.ground;
      return (g[j * t.n + i] * (1 - u) + g[j * t.n + i + 1] * u) * (1 - v) + (g[(j + 1) * t.n + i] * (1 - u) + g[(j + 1) * t.n + i + 1] * u) * v;
    };
    let samples = 0;
    let above = 0;
    let below = 0;
    let buried = 0;
    for (const e of c.graph.edges) {
      const line = m.lines[e.id];
      if (!line || e.cls === 'highway' || e.cls === 'ramp' || e.bridge) continue;
      for (let i = 1; i < line.length; i++) {
        for (const q of [0.25, 0.75]) {
          const x = mix(line[i - 1][0], line[i][0], q);
          const y = mix(line[i - 1][2], line[i][2], q);
          if (!inBounds(t, x, y, 12)) continue;
          const d = ground(x, y) - mix(line[i - 1][1], line[i][1], q);
          samples++;
          if (d > 0.5) buried++;
          if (d > 0.05) above++;
          if (d < -0.8) below++;
        }
      }
    }
    // The ground does not cover the road, and the road does not float. (Two roads that run side by side
    // at different heights on a hillside share ground that can only match one of them.)
    expect(buried).toBeLessThan(0.002 * samples);
    expect(above).toBeLessThan(0.005 * samples);
    expect(below).toBeLessThan(0.005 * samples);
  });

  it.each(MODEL_SEEDS)('seed %i: the freeway clears every street below it and runs on past the edge of the map', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const heightNear = (id: number, x: number, y: number): number => {
      let best = Infinity;
      let h = NaN;
      const line = m.lines[id] ?? [];
      for (let i = 1; i < line.length; i++) {
        const [p, q] = [line[i - 1], line[i]];
        const l2 = (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2 || 1;
        const u = clamp(((x - p[0]) * (q[0] - p[0]) + (y - p[2]) * (q[2] - p[2])) / l2, 0, 1);
        const d = Math.hypot(mix(p[0], q[0], u) - x, mix(p[2], q[2], u) - y);
        if (d < best) [best, h] = [d, mix(p[1], q[1], u)];
      }
      return h;
    };
    for (const x of c.graph.crossings) {
      if (c.graph.edges[x.highway].cls !== 'highway' || !m.lines[x.street]) continue;
      expect(heightNear(x.highway, x.x, x.y) - heightNear(x.street, x.x, x.y)).toBeGreaterThan(STREET_CLEARANCE - 0.5);
    }
    for (const e of c.graph.edges) {
      if (e.cls !== 'highway') continue;
      const lv = m.levels.edges[e.id];
      expect(Math.min(...lv.h.map((h, i) => h - lv.ground[i]))).toBeGreaterThan(3);
    }
    const ends = c.graph.nodes.filter((n) => n.degree === 1 && c.graph.edges[n.edges[0]].cls === 'highway' && Math.min(n.x, n.y, c.terrain.size - n.x, c.terrain.size - n.y) < 3);
    expect(ends.length).toBeGreaterThanOrEqual(2);
    expect(m.cuts.length).toBe(ends.length);
    for (const cut of m.cuts) {
      const outside = Math.max(-cut.x, -cut.y, cut.x - c.terrain.size, cut.y - c.terrain.size);
      expect(outside).toBeGreaterThan(EDGE_STUB * 0.5);
      expect(outside).toBeLessThanOrEqual(EDGE_STUB + 3);
    }
  });
});

describe('street furniture', () => {
  it('is the same every time and only uses models of the catalogue', () => {
    const a = placeStreetFurniture(city(1), model(1));
    const b = placeStreetFurniture(city(1), model(1));
    expect(b.items).toEqual(a.items);
    const ids = new Set(MODELS.map((m) => m.id));
    for (const it of a.items) expect(ids.has(it.model), it.model).toBe(true);
  });

  it.each(MODEL_SEEDS)('seed %i: every signalled approach has a signal and every stop line a stop sign', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const f = placeStreetFurniture(c, m);
    const served = new Set(f.items.filter((i) => i.kind === 'signal' || i.kind === 'stop').map((i) => `${i.kind}:${i.junction}:${i.arm}`));
    let signals = 0;
    let stops = 0;
    m.junctions.forEach((j, ji) => {
      const arms = j.arms.filter((a) => m.lines[a.edge] && Number.isFinite(a.reach));
      if (arms.length < 3) return;
      arms.forEach((a) => {
        const ai = j.arms.indexOf(a);
        const e = c.graph.edges[a.edge];
        expect(f.items.every((i) => i.junction !== ji || i.arm !== ai || i.kind === 'signal' || i.edge === a.edge), `arm ${ai} of junction ${ji}`).toBe(true);
        // Nobody drives into the junction from the start of a one-way street; ramps are checked by eye.
        if (e.cls === 'ramp' || e.cls === 'highway' || (e.cls === 'local' && c.profiles[a.edge].oneWay && a.end === 0)) return;
        if (a.control === 'signal') {
          signals++;
          expect(served.has(`signal:${ji}:${ai}`), `signal at junction ${ji} (${j.x.toFixed(0)}, ${j.y.toFixed(0)}) arm ${ai}`).toBe(true);
        } else if (a.control === 'stop') {
          stops++;
          expect(served.has(`stop:${ji}:${ai}`), `stop sign at junction ${ji} (${j.x.toFixed(0)}, ${j.y.toFixed(0)}) arm ${ai}`).toBe(true);
        }
      });
    });
    expect(signals).toBeGreaterThan(100);
    expect(stops).toBeGreaterThan(400);
    expect(f.stats.light).toBeGreaterThan(1500);
    expect(f.stats.cabinet).toBeGreaterThan(0.85 * m.stats.signals);
  });

  it.each(MODEL_SEEDS)('seed %i: nothing stands in a traffic lane, in the water or on top of something else', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const f = placeStreetFurniture(c, m);
    // Segments of every built road with the half-width of its carriageway on either side.
    const CELL = 40;
    const grid = new Map<number, { ax: number; ay: number; ah: number; bx: number; by: number; bh: number; l: number; r: number; edge: number }[]>();
    const key = (x: number, y: number): number => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
    c.graph.edges.forEach((e) => {
      const line = m.lines[e.id];
      if (!line || e.cls === 'path') return;
      const lay = layout(m.sections[e.id]);
      for (let i = 1; i < line.length; i++) {
        const [p, q] = [line[i - 1], line[i]];
        const seg = { ax: p[0], ay: p[2], ah: p[1], bx: q[0], by: q[2], bh: q[1], l: lay.road[0], r: lay.road[1], edge: e.id };
        const seen = new Set<number>();
        const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[2] - p[2]) / (CELL / 2)));
        for (let k = 0; k <= n; k++) {
          const kk = key(mix(p[0], q[0], k / n), mix(p[2], q[2], k / n));
          if (seen.has(kk)) continue;
          seen.add(kk);
          const cell = grid.get(kk);
          if (cell) cell.push(seg);
          else grid.set(kk, [seg]);
        }
      }
    });
    let inLane = 0;
    for (const it of f.items) {
      expect(Number.isFinite(it.h) && Number.isFinite(it.yaw)).toBe(true);
      if (it.edge === undefined || !c.graph.edges[it.edge].bridge) expect(isWater(c.terrain, it.x, it.y), `${it.model} in the water at ${it.x.toFixed(0)}, ${it.y.toFixed(0)}`).toBe(false);
      // Lights on the freeway's median barrier and boards on its parapet are where they belong.
      if (it.junction === undefined && it.edge !== undefined && (c.graph.edges[it.edge].cls === 'highway' || c.graph.edges[it.edge].cls === 'ramp')) continue;
      let hit = false;
      for (let dx = -1; dx <= 1 && !hit; dx++)
        for (let dy = -1; dy <= 1 && !hit; dy++)
          for (const s of grid.get(key(it.x + dx * CELL, it.y + dy * CELL)) ?? []) {
            const [vx, vy] = [s.bx - s.ax, s.by - s.ay];
            const l = Math.hypot(vx, vy) || 1;
            const u = ((it.x - s.ax) * vx + (it.y - s.ay) * vy) / (l * l);
            if (u < 0 || u > 1) continue;
            if (Math.abs(mix(s.ah, s.bh, u) - it.h) > 2.5) continue;
            // Offset to the right of the road's direction.
            const off = ((it.x - s.ax) * -vy + (it.y - s.ay) * vx) / l;
            if (off > s.l + 0.15 && off < s.r - 0.15) {
              hit = true;
              break;
            }
          }
      if (hit) inLane++;
    }
    expect(inLane).toBe(0);
    // Poles keep their distance from each other.
    const cells = new Map<number, typeof f.items>();
    const k2 = (x: number, y: number): number => Math.floor(x / 2) * 8192 + Math.floor(y / 2);
    let close = 0;
    for (const it of f.items) {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) for (const o of cells.get(k2(it.x + dx * 2, it.y + dy * 2)) ?? []) if (Math.hypot(o.x - it.x, o.y - it.y) < 0.6) close++;
      const cell = cells.get(k2(it.x, it.y));
      if (cell) cell.push(it);
      else cells.set(k2(it.x, it.y), [it]);
    }
    expect(close).toBe(0);
  });
});

const rails = new Map<number, RailModel>();
const railModel = (seed: number): RailModel => {
  let r = rails.get(seed);
  if (!r) rails.set(seed, (r = buildRailModel(city(seed), model(seed))));
  return r;
};

describe('railway in 3D', () => {
  it('is the same every time and only uses models of the catalogue', () => {
    const a = buildRailModel(city(1), model(1));
    const b = buildRailModel(city(1), model(1));
    expect(b.items).toEqual(a.items);
    expect(b.stations).toEqual(a.stations);
    expect(b.stats).toEqual(a.stats);
    expect(b.looks).toEqual(a.looks);
    const ids = new Set(MODELS.map((m) => m.id));
    for (const it of a.items) expect(ids.has(it.model), it.model).toBe(true);
  });

  it('gives its level crossings different decks, roads and rails, all from the catalogue', () => {
    const surfaces = new Set(TEXTURES.map((x) => x.id));
    const seen = { panel: new Set<string>(), approach: new Set<string>(), field: new Set<string>(), flange: new Set<string>(), head: new Set<string>() };
    for (const seed of MODEL_SEEDS) {
      const r = railModel(seed);
      expect(r.looks.length).toBe(r.crossings.length);
      for (const look of r.looks) {
        for (const k of ['panel', 'approach', 'field', 'flange', 'head'] as const) {
          expect(surfaces.has(look[k]), look[k]).toBe(true);
          seen[k].add(look[k]);
        }
      }
      // Two crossings in one town seldom look alike.
      expect(new Set(r.looks.map((l) => `${l.panel} ${l.approach} ${l.head}`)).size).toBeGreaterThanOrEqual(0.6 * r.looks.length);
    }
    // The towns have some fifteen crossings between them.
    expect(seen.panel.size).toBeGreaterThanOrEqual(5);
    expect(seen.approach.size).toBeGreaterThanOrEqual(4);
    expect(seen.flange.size).toBeGreaterThanOrEqual(2);
    expect(seen.head.size).toBeGreaterThanOrEqual(2);
  });

  it.each(MODEL_SEEDS)('seed %i: tunnels are under a hill, and the branch ends at a buffer stop on open ground', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const r = railModel(seed);
    for (const line of c.rail.lines) {
      const cover = (i: number): number => heightAt(c.terrain, line.points[i].x, line.points[i].y) - line.level[i];
      for (let i = 0; i < line.points.length; ) {
        if (line.structure[i] !== 'tunnel') {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < line.points.length && line.structure[j + 1] === 'tunnel') j++;
        const where = `${line.kind} tunnel at ${line.points[i].x.toFixed(0)}, ${line.points[i].y.toFixed(0)}`;
        expect(j - i + 1, where).toBeGreaterThanOrEqual(8);
        if (i > 0) expect(cover(i), where).toBeGreaterThan(8);
        if (j + 1 < line.points.length) expect(cover(j), where).toBeGreaterThan(8);
        let deep = 0;
        for (let k = i; k <= j; k++) deep = Math.max(deep, cover(k));
        expect(deep, where).toBeGreaterThan(11);
        i = j + 1;
      }
    }
    // Bringing the rails to the roads' level never makes a tunnel.
    m.rail.lines.forEach((tr) => tr.structure.forEach((k, i) => expect(k === 'tunnel', `${tr.kind} at ${i}`).toBe(c.rail.lines[tr.line].structure[i] === 'tunnel')));
    const branches = m.rail.lines.filter((tr) => tr.kind === 'freight');
    expect(r.stats.buffers).toBe(branches.length);
    for (const tr of branches) {
      const n = tr.pts.length;
      expect(tr.structure[n - 1]).toBe('ground');
      expect(Math.abs(c.rail.lines[tr.line].level[n - 1] - heightAt(c.terrain, tr.pts[n - 1].x, tr.pts[n - 1].y))).toBeLessThan(1.6);
    }
  });

  it.each(MODEL_SEEDS)('seed %i: every street that meets the rails crosses them on a deck, under a bridge or over one', (seed) => {
    const c = city(seed);
    const m = model(seed);
    let bare = 0;
    for (const x of c.railCrossings) {
      const e = c.graph.edges[x.edge];
      const tr = m.rail.lines[x.line];
      let s = 0;
      let near = Infinity;
      for (let i = 0; i + 1 < tr.pts.length; i++) {
        const q = pointSeg(x.x, x.y, tr.pts[i], tr.pts[i + 1]);
        if (q.d < near) [near, s] = [q.d, tr.s[i] + q.t * (tr.s[i + 1] - tr.s[i])];
      }
      const rail = trackAt(tr, s);
      const kind = tr.structure[rail.i] === 'ground' && tr.structure[Math.min(rail.i + 1, tr.pts.length - 1)] === 'ground' ? 'ground' : 'other';
      const where = `${e.cls} ${x.edge} at ${x.x.toFixed(0)}, ${x.y.toFixed(0)}`;
      const line = m.lines[x.edge];
      const road = line ? roadAt(line, x.x, x.y) : null;
      if (e.cls === 'highway' || e.cls === 'ramp') {
        // Freeways and their ramps pass well over the trains.
        if (road && road.d < 3 && tr.structure[rail.i] !== 'tunnel') expect(road.h - rail.h, where).toBeGreaterThan(5.5);
        continue;
      }
      if (kind !== 'ground') continue;
      if (m.rail.crossings.some((k) => k.edge === x.edge && k.line === x.line && Math.abs(k.s - s) < 3)) continue;
      const deck = m.rail.through.find((k) => k.line === x.line && s > k.s0 - 3 && s < k.s1 + 3);
      if (deck) {
        // Set into the junction: level through it, and no lower than its surface.
        const j = m.junctions[deck.junction];
        for (let q = deck.s0; q <= deck.s1; q += 2) {
          const p = trackAt(tr, q);
          const paved = j.plane.h + j.plane.gx * (p.p.x - j.x) + j.plane.gy * (p.p.y - j.y);
          expect(p.h - paved, where).toBeGreaterThan(-0.02);
          expect(p.h - paved, where).toBeLessThan(1.2);
        }
        continue;
      }
      expect(m.rail.unbuilt.some((k) => k.edge === x.edge && k.line === x.line), where).toBe(true);
      // A street far below an embankment has a bridge over it instead.
      if (road && road.d < 3) expect(rail.h - road.h, where).toBeLessThan(3.4);
      bare++;
    }
    expect(bare).toBeLessThanOrEqual(1);
  });

  it.each(MODEL_SEEDS)('seed %i: the ground around a station does not cover the streets beside it', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const r = railModel(seed);
    const t = c.terrain;
    const ground = (x: number, y: number): number => {
      const fx = clamp(x / t.cell, 0, t.n - 1.001);
      const fy = clamp(y / t.cell, 0, t.n - 1.001);
      const [i, j] = [Math.floor(fx), Math.floor(fy)];
      const [u, v] = [fx - i, fy - j];
      const g = m.ground;
      return (g[j * t.n + i] * (1 - u) + g[j * t.n + i + 1] * u) * (1 - v) + (g[(j + 1) * t.n + i] * (1 - u) + g[(j + 1) * t.n + i + 1] * u) * v;
    };
    for (const st of r.stations) {
      for (const e of c.graph.edges) {
        const line = m.lines[e.id];
        if (!line || e.cls === 'highway' || e.cls === 'ramp' || e.bridge) continue;
        for (const p of line) {
          if (Math.hypot(p[0] - st.x, p[2] - st.y) > 90) continue;
          expect(ground(p[0], p[2]) - p[1], `station ${st.id}: ${e.cls} ${e.id} at ${p[0].toFixed(0)}, ${p[2].toFixed(0)}`).toBeLessThan(0.5);
        }
      }
    }
  });

  it.each(MODEL_SEEDS)('seed %i: track is laid along every line, double on the main line and single on the branch', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const r = railModel(seed);
    const total = c.rail.lines.reduce((sum, l) => sum + l.length, 0);
    expect(r.stats.ground + r.stats.elevated + r.stats.bridge + r.stats.tunnel).toBeCloseTo(total, 0);
    expect(r.stats.triangles).toBeGreaterThan(20000);
    for (const tr of m.rail.lines) {
      // Sleepers are laid everywhere but deep inside a tunnel.
      let open = 0;
      for (let i = 0; i + 1 < tr.pts.length; ) {
        let j = i;
        const tunnel = (k: number): boolean => tr.structure[k] === 'tunnel' || tr.structure[k + 1] === 'tunnel';
        while (j + 1 < tr.pts.length && tunnel(j) === tunnel(i)) j++;
        if (!tunnel(i) || j - i < 6) open += tr.s[j] - tr.s[i];
        i = j;
      }
      const ties = r.items.filter((it) => it.kind === 'ties' && it.line === tr.line);
      expect(tr.tracks).toBe(tr.kind === 'main' ? 2 : 1);
      expect(ties.length / (open / 10) / tr.tracks, `${tr.kind} line`).toBeGreaterThan(0.93);
      expect(ties.length / (open / 10) / tr.tracks, `${tr.kind} line`).toBeLessThan(1.07);
      // Each run of sleepers lies on its own track: 2 m either side of the centre line, or on it.
      for (const it of ties) {
        const d = Math.min(...tr.pts.map((p) => Math.hypot(p.x - it.x, p.y - it.y)));
        expect(d, `sleepers at ${it.x.toFixed(0)}, ${it.y.toFixed(0)}`).toBeLessThan(tr.tracks > 1 ? 5.6 : 5.1);
      }
      // The rails never climb much more steeply than the route was planned for.
      for (let i = 1; i < tr.level.length; i++) expect(Math.abs(tr.level[i] - tr.level[i - 1]) / (tr.s[i] - tr.s[i - 1]), `${tr.kind} at ${tr.s[i].toFixed(0)} m`).toBeLessThan(RAIL_MAX_GRADE + 0.012);
    }
  });

  it.each(MODEL_SEEDS)('seed %i: viaducts and bridges stand on piers and tunnels have mouths', (seed) => {
    const m = model(seed);
    const r = railModel(seed);
    if (r.stats.elevated + r.stats.bridge > 150) expect(r.stats.piers).toBeGreaterThan(0);
    let mouths = 0;
    for (const tr of m.rail.lines) {
      const tunnel = (k: number): boolean => tr.structure[k] === 'tunnel' || tr.structure[k + 1] === 'tunnel';
      for (let i = 0; i + 1 < tr.pts.length; i++) {
        if (!tunnel(i)) continue;
        if (i > 0 && !tunnel(i - 1)) mouths++;
        if (i + 2 < tr.pts.length && !tunnel(i + 1)) mouths++;
      }
    }
    const portals = r.items.filter((it) => it.kind === 'portal');
    expect(portals.length).toBe(mouths);
    for (const p of portals) expect(p.model).toBe(m.rail.lines[p.line].tracks > 1 ? 'infra/tunnel-portal-rail-double' : 'infra/tunnel-portal-rail');
  });

  it.each(MODEL_SEEDS)('seed %i: level crossings are where a street meets track on the ground, at the height of both, and guarded', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const r = railModel(seed);
    r.crossings.forEach((x, id) => {
      const e = c.graph.edges[x.edge];
      const tr = m.rail.lines[x.line];
      const where = `crossing of edge ${x.edge} at ${x.x.toFixed(0)}, ${x.y.toFixed(0)}`;
      expect(e.cls === 'highway' || e.cls === 'ramp', where).toBe(false);
      expect(c.railCrossings.some((k) => k.kind === 'level' && k.edge === x.edge && k.line === x.line && Math.hypot(k.x - x.x, k.y - x.y) < 0.01), where).toBe(true);
      expect(tr.structure[x.index], where).toBe('ground');
      // The rails are level with the crossing's deck, which is just above the road.
      expect(Math.abs(trackAt(tr, x.s).h - x.h), where).toBeLessThan(0.02);
      const road = roadAt(m.lines[x.edge]!, x.x, x.y);
      expect(x.h - road.h, where).toBeGreaterThan(0);
      expect(x.h - road.h, where).toBeLessThan(x.table + 1);
      const guards = r.items.filter((it) => it.crossing === id && it.kind === 'gate');
      expect(guards.length, where).toBeGreaterThan(0);
      const want = e.cls === 'arterial' ? 'signal/rail-cantilever-gate' : e.cls === 'collector' ? 'signal/rail-gate-up' : e.cls === 'local' ? 'signal/rail-flashers-both' : 'signal/rail-crossbuck';
      for (const g of guards) {
        expect(g.model, where).toBe(want);
        // Beside the road, not in it, and clear of the rails.
        expect(roadAt(m.lines[x.edge]!, g.x, g.y).d, where).toBeGreaterThan(x.half);
        expect(Math.min(...tr.pts.map((p) => Math.hypot(p.x - g.x, p.y - g.y))), where).toBeGreaterThan(tr.tracks * 2 + 1.2);
      }
    });
  });

  it.each(MODEL_SEEDS)('seed %i: stations have platforms on open track between the crossings', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const r = railModel(seed);
    expect(r.stations.length).toBeGreaterThanOrEqual(Math.min(2, c.stations.length));
    expect(r.stations.some((s) => s.kind === 'central')).toBe(c.stations.some((s) => s.kind === 'central'));
    for (const st of r.stations) {
      const planned = c.stations.find((s) => s.id === st.id)!;
      const tr = m.rail.lines[planned.line];
      expect(st.s1 - st.s0, `station ${st.id}`).toBeGreaterThanOrEqual(60);
      expect(Math.hypot(st.x - planned.x, st.y - planned.y), `station ${st.id}`).toBeLessThan(260);
      const kind = tr.structure[trackAt(tr, (st.s0 + st.s1) / 2).i];
      expect(kind === 'ground' || kind === 'elevated', `station ${st.id}`).toBe(true);
      for (let s = st.s0; s <= st.s1; s += 10) expect(tr.structure[trackAt(tr, Math.min(s, st.s1 - 0.01)).i], `station ${st.id} at ${s.toFixed(0)} m`).toBe(kind);
      for (const x of r.crossings) if (x.line === planned.line) expect(x.s < st.s0 - 10 || x.s > st.s1 + 10, `station ${st.id}`).toBe(true);
    }
  });

  it.each(MODEL_SEEDS)('seed %i: fences and signals stand on dry land off the roads and the tracks, and no street furniture stands on the tracks', (seed) => {
    const c = city(seed);
    const m = model(seed);
    const r = railModel(seed);
    const index = new SegmentIndex(60);
    m.lines.forEach((line, id) => {
      if (line && c.graph.edges[id].cls !== 'highway' && c.graph.edges[id].cls !== 'ramp') index.addLine(id, line.map((p) => ({ x: p[0], y: p[2] })));
    });
    const half = c.graph.edges.map((e) => {
      const lay = layout(m.sections[e.id]);
      return Math.max(-lay.road[0], lay.road[1]);
    });
    const fences = r.items.filter((it) => it.kind === 'fence');
    // Only track on the ground is fenced, and the main line is on a viaduct through town.
    expect(fences.length).toBeGreaterThan(40);
    for (const it of r.items) {
      if (it.kind !== 'fence' && it.kind !== 'signal') continue;
      const where = `${it.model} at ${it.x.toFixed(0)}, ${it.y.toFixed(0)}`;
      expect(isWater(c.terrain, it.x, it.y), where).toBe(false);
      index.query(it.x - 30, it.y - 30, it.x + 30, it.y + 30, (s) => {
        expect(pointSeg(it.x, it.y, s.a, s.b).d, where).toBeGreaterThan(half[s.line]);
      });
      const tr = m.rail.lines[it.line];
      // Fences stand outside the formation; signals at the foot of the ballast, clear of a passing train.
      expect(Math.min(...tr.pts.map((p) => Math.hypot(p.x - it.x, p.y - it.y))), where).toBeGreaterThan((tr.tracks > 1 ? 2 : 0) + (it.kind === 'fence' ? 3.75 : 2.4));
    }
    const tracks = new RailIndex(c.rail);
    for (const it of placeStreetFurniture(c, m).items) {
      const hit = tracks.nearest(it.x, it.y, 8);
      if (!hit) continue;
      const tr = m.rail.lines[hit.line];
      if (Math.abs(tr.level[hit.seg] - it.h) < 3) expect(hit.d, `${it.model} at ${it.x.toFixed(0)}, ${it.y.toFixed(0)}`).toBeGreaterThanOrEqual(tr.tracks * 2 + 2.8);
    }
  });
});
