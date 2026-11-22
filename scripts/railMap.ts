// Draws the railway over the road network and prints what is questionable about where it runs.
// usage: npx tsx scripts/railMap.ts <out dir> <seed...>
import { pointSeg } from '../src/core/geom';
import { Vec2, dist } from '../src/core/vec2';
import { DEFAULT_CONFIG, generateCity } from '../src/gen/city';
import { districtAt } from '../src/gen/districts';
import { hillAt, isWater, seaDistAt } from '../src/gen/terrain';
import { writePng } from './png';

const [dir, ...seeds] = process.argv.slice(2);
const PX = 1600;

const TINT: Record<string, [number, number, number]> = {
  downtown: [222, 205, 205],
  midtown: [228, 216, 204],
  oldtown: [226, 210, 190],
  residential: [236, 232, 214],
  suburb: [226, 236, 214],
  hills: [200, 214, 190],
  industrial: [210, 204, 226],
  beach: [244, 236, 200],
};
const STRUCT: Record<string, [number, number, number]> = { ground: [20, 20, 20], elevated: [190, 40, 200], bridge: [0, 150, 220], tunnel: [40, 170, 60] };

for (const seed of seeds.map(Number)) {
  const city = generateCity({ ...DEFAULT_CONFIG, seed });
  const t = city.terrain;
  const S = t.size;
  const k = PX / S;
  const img = new Uint8ClampedArray(PX * PX * 4);
  const put = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= PX || y >= PX) return;
    const o = (y * PX + x) * 4;
    img[o] = c[0];
    img[o + 1] = c[1];
    img[o + 2] = c[2];
    img[o + 3] = 255;
  };
  for (let j = 0; j < PX; j++) {
    for (let i = 0; i < PX; i++) {
      const [x, y] = [(i + 0.5) / k, (j + 0.5) / k];
      if (isWater(t, x, y)) {
        put(i, j, [150, 196, 232]);
        continue;
      }
      const c = TINT[districtAt(t, city.districts, x, y).type];
      const shade = 1 - 0.35 * hillAt(t, x, y);
      put(i, j, [c[0] * shade, c[1] * shade, c[2] * shade]);
    }
  }
  const disc = (x: number, y: number, r: number, c: [number, number, number]) => {
    const [cx, cy] = [x * k, y * k];
    for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) put(i, j, c);
  };
  const stroke = (pts: Vec2[], w: number, c: [number, number, number] | ((i: number) => [number, number, number])) => {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const steps = Math.max(1, Math.ceil(dist(a, b) * k));
      const col = typeof c === 'function' ? c(i - 1) : c;
      for (let s = 0; s <= steps; s++) disc(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, w / 2, col);
    }
  };
  const W: Record<string, number> = { highway: 5, ramp: 2.5, arterial: 3.5, collector: 2.4, local: 1.4, alley: 0.9, path: 0.7 };
  const C: Record<string, [number, number, number]> = { highway: [240, 140, 40], ramp: [245, 175, 90], arterial: [120, 120, 120], collector: [165, 165, 165], local: [255, 255, 255], alley: [250, 250, 250], path: [200, 220, 190] };
  for (const cls of ['path', 'alley', 'local', 'collector', 'arterial', 'ramp', 'highway']) for (const e of city.graph.edges) if (e.cls === cls) stroke(e.points, W[cls], C[cls]);
  city.rail.lines.forEach((l) => {
    stroke(l.points, l.kind === 'main' ? 4.5 : 3, [255, 255, 255]);
    stroke(l.points, l.kind === 'main' ? 3 : 1.8, (i) => STRUCT[l.structure[i]]);
  });
  for (const c of city.railCrossings) {
    const cls = city.graph.edges[c.edge].cls;
    if (c.kind === 'level') disc(c.x, c.y, cls === 'arterial' ? 6 : cls === 'collector' ? 4.5 : 3.2, cls === 'arterial' ? [230, 0, 0] : cls === 'collector' ? [250, 90, 0] : [250, 170, 0]);
  }
  for (const s of city.stations) {
    disc(s.x, s.y, 8, [0, 0, 0]);
    disc(s.x, s.y, 6, s.kind === 'central' ? [255, 230, 0] : s.kind === 'elevated' ? [255, 150, 255] : [120, 255, 120]);
  }
  writePng(`${dir}/rail_s${seed}.png`, PX, PX, img);

  // What is questionable.
  const hw = city.graph.edges.filter((e) => e.cls === 'highway');
  const hwDist = (p: Vec2): number => {
    let d = Infinity;
    for (const e of hw) for (let i = 1; i < e.points.length; i++) if (Math.abs(e.points[i].x - p.x) < 400 && Math.abs(e.points[i].y - p.y) < 400) d = Math.min(d, pointSeg(p.x, p.y, e.points[i - 1], e.points[i]).d);
    return d;
  };
  const out: string[] = [];
  city.rail.lines.forEach((l, li) => {
    const len: Record<string, number> = {};
    let on = 0;
    let beside = 0;
    let shore = 0;
    const byDistrict: Record<string, number> = {};
    l.points.forEach((p, i) => {
      len[l.structure[i]] = (len[l.structure[i]] ?? 0) + 10;
      const d = hwDist(p);
      if (d < 30) on += 10;
      else if (d < 90) beside += 10;
      if (seaDistAt(t, p.x, p.y) < 80) shore += 10;
      const type = districtAt(t, city.districts, p.x, p.y).type;
      byDistrict[type] = (byDistrict[type] ?? 0) + 10;
    });
    const xs = city.railCrossings.filter((c) => c.line === li);
    const lv = xs.filter((c) => c.kind === 'level');
    const cls: Record<string, number> = {};
    for (const c of lv) cls[city.graph.edges[c.edge].cls] = (cls[city.graph.edges[c.edge].cls] ?? 0) + 1;
    const over = xs.filter((c) => c.kind === 'road-over').length;
    const under = xs.filter((c) => c.kind === 'road-under').length;
    let close = 0;
    lv.forEach((a, i) => lv.forEach((b, j) => (close += j > i && dist(a, b) < 90 ? 1 : 0)));
    let atNode = 0;
    for (const c of lv) if (city.graph.nodes.some((n) => n.degree >= 3 && Math.hypot(n.x - c.x, n.y - c.y) < 25)) atNode++;
    out.push(
      `  ${l.kind} ${(l.length / 1000).toFixed(1)}km ${JSON.stringify(len)} districts ${JSON.stringify(byDistrict)}\n    on freeway(<30m) ${on}m, beside(30-90m) ${beside}m, shore(<80m) ${shore}m | level ${lv.length} ${JSON.stringify(cls)} pairs<90m ${close} atJunction ${atNode} | road-over ${over} road-under ${under}`,
    );
  });
  console.log(`seed ${seed}: stations ${city.stations.map((s) => s.kind[0]).join('')}\n${out.join('\n')}`);
}
