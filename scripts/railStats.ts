import { Rng } from '../src/core/rng';
import { generateDistricts } from '../src/gen/districts';
import { generateHighways } from '../src/gen/highways';
import { generateRail, sharpestRailTurn } from '../src/gen/rail';
import { generateTerrain } from '../src/gen/terrain';

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 16, 21]) {
  const rng = new Rng(seed);
  const t = generateTerrain(4800, rng.fork('terrain'));
  const d = generateDistricts(t, rng.fork('districts'));
  const r = rng.fork('roads');
  const hw = generateHighways(t, d, r.fork('highways'));
  const t0 = performance.now();
  const rail = generateRail(t, d, [hw.main, hw.branch, hw.cross].filter((l): l is { x: number; y: number }[] => !!l), r.fork('rail'));
  const ms = performance.now() - t0;
  console.log(
    seed,
    `${ms.toFixed(0)}ms`,
    rail.lines
      .map((l) => {
        const c: Record<string, number> = {};
        l.structure.forEach((s) => (c[s] = (c[s] ?? 0) + 1));
        let g = 0;
        for (let i = 1; i < l.level.length; i++) g = Math.max(g, Math.abs(l.level[i] - l.level[i - 1]) / 10);
        return `${l.kind} ${(l.length / 1000).toFixed(1)}km R>=${(10 / sharpestRailTurn(l.points)).toFixed(0)} grade ${(g * 100).toFixed(1)}% ${JSON.stringify(c)}`;
      })
      .join(' | '),
  );
}
