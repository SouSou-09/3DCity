import { describe, expect, it, vi } from 'vitest';
import { SegmentIndex, pointSeg, segSeg } from '../src/core/geom';
import { angleDiff } from '../src/core/vec2';
import { City, DEFAULT_CONFIG, generateCity } from '../src/gen/city';
import { RAIL_MAX_GRADE, RAIL_MIN_RADIUS, RAIL_STEP, RailIndex, sharpestRailTurn } from '../src/gen/rail';
import { isStreet } from '../src/gen/streamlines';
import { REF_SIZE, isWater, seaDistAt } from '../src/gen/terrain';

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
