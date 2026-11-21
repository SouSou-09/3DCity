import { DEFAULT_CONFIG, generateCity } from '../src/gen/city';
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const c = generateCity({ seed, size: DEFAULT_CONFIG.size });
  const s = c.stats;
  console.log(seed, 'nodes', s.nodes, 'edges', s.edges, 'deg', s.degree.join('/'), 'km', Object.entries(s.length).map(([k, v]) => `${k}:${(v / 1000).toFixed(1)}`).join(' '), 'br', s.bridges, 'ic', s.interchanges, 'rail', (s.rail / 1000).toFixed(1), 'lx', s.levelCrossings, 'rx', c.railCrossings.length, 'infill', JSON.stringify(s.infill), 'ms', s.ms.toFixed(0), 'districts', c.districts.list.map((d) => d.type[0]).join(''));
}
