import { segSeg } from '../src/core/geom';
import { generateCity } from '../src/gen/city';
import { isStreet } from '../src/gen/streamlines';
const seed = Number(process.argv[2] ?? 7);
const c = generateCity({ seed, size: 4800 });
const streets = c.graph.edges.filter((e) => isStreet(e.cls));
for (let i = 0; i < streets.length; i++)
  for (let j = i + 1; j < streets.length; j++) {
    const a = streets[i], b = streets[j];
    if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
    for (let p = 1; p < a.points.length; p++)
      for (let q = 1; q < b.points.length; q++) {
        const h = segSeg(a.points[p - 1], a.points[p], b.points[q - 1], b.points[q]);
        if (h) console.log('cross', h.x.toFixed(1), h.y.toFixed(1), a.id, a.cls, a.length.toFixed(0), a.bridge, b.id, b.cls, b.length.toFixed(0), b.bridge, 'rail', c.rail.lines.map((l) => Math.min(...l.points.map((r) => Math.hypot(r.x - h.x, r.y - h.y))).toFixed(0)).join(','));
      }
  }
for (const id of process.argv.slice(3).map(Number)) {
  const e = c.graph.edges[id];
  console.log(id, e.cls, 'a', e.a, c.graph.nodes[e.a].degree, 'b', e.b, c.graph.nodes[e.b].degree, e.points.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' '));
}
