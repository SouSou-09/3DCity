import { describe, expect, it, vi } from 'vitest';
import { SegmentIndex, pointSeg, segSeg } from '../src/core/geom';
import { angleDiff, clamp, dist, mix } from '../src/core/vec2';
import { City, DEFAULT_CONFIG, generateCity } from '../src/gen/city';
import { LAND_USES, LandUse, Site, useWeights } from '../src/gen/landuse';
import { STREET_CLEARANCE } from '../src/gen/roadHeights';
import { profileWidth } from '../src/gen/roadSections';
import { EDGE_STUB, RoadModel, buildRoadModel } from '../src/place/roadModel';
import { RAIL_MAX_GRADE, RAIL_MIN_RADIUS, RAIL_STEP, RailIndex, sharpestRailTurn } from '../src/gen/rail';
import { isStreet } from '../src/gen/streamlines';
import { REF_SIZE, inBounds, isWater, seaDistAt, waterDistAt } from '../src/gen/terrain';

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
