import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { Vec2, dist } from '../core/vec2';
import { Terrain, gradient, hillAt, inBounds, riverBankAt, seaDistAt } from './terrain';

export type DistrictType = 'downtown' | 'midtown' | 'oldtown' | 'residential' | 'suburb' | 'hills' | 'industrial' | 'beach';

export interface DistrictStyle {
  /** Spacing between streets running along the district's main direction (block depth), metres. */
  sepA: number;
  /** Spacing between cross streets (block length), metres. */
  sepB: number;
  /** How far street directions wander, radians. */
  wobble: number;
  /** Probability that a local street stops at a bigger road instead of crossing it. */
  crossStop: number;
  /** Probability of deleting a local street segment to merge two blocks. */
  breakProb: number;
  /** Probability of keeping a dead end as a cul-de-sac. */
  culDeSac: number;
}

export const DISTRICT_STYLE: Record<DistrictType, DistrictStyle> = {
  downtown: { sepA: 88, sepB: 150, wobble: 0, crossStop: 0.12, breakProb: 0.05, culDeSac: 0 },
  midtown: { sepA: 80, sepB: 165, wobble: 0.04, crossStop: 0.35, breakProb: 0.1, culDeSac: 0.05 },
  oldtown: { sepA: 62, sepB: 95, wobble: 0.22, crossStop: 0.3, breakProb: 0.14, culDeSac: 0.1 },
  residential: { sepA: 72, sepB: 180, wobble: 0.08, crossStop: 0.5, breakProb: 0.16, culDeSac: 0.15 },
  suburb: { sepA: 78, sepB: 190, wobble: 0.5, crossStop: 0.55, breakProb: 0.22, culDeSac: 0.4 },
  hills: { sepA: 85, sepB: 330, wobble: 0.2, crossStop: 0.6, breakProb: 0.2, culDeSac: 0.6 },
  industrial: { sepA: 165, sepB: 250, wobble: 0.02, crossStop: 0.3, breakProb: 0.1, culDeSac: 0.25 },
  beach: { sepA: 62, sepB: 125, wobble: 0.05, crossStop: 0.3, breakProb: 0.08, culDeSac: 0.1 },
};

export interface District {
  id: number;
  type: DistrictType;
  center: Vec2;
  /** Orientation of the district's street grid. */
  angle: number;
  /** Streets radiate from the centre instead of following a grid. */
  radial: boolean;
  style: DistrictStyle;
}

export interface Park {
  center: Vec2;
  radius: number;
}

export interface Districts {
  list: District[];
  downtown: District;
  /** District id per terrain grid sample. */
  map: Uint8Array;
  parks: Park[];
  warp: (x: number, y: number) => Vec2;
}

export function districtAt(t: Terrain, d: Districts, x: number, y: number): District {
  const i = Math.min(t.n - 1, Math.max(0, Math.round(x / t.cell)));
  const j = Math.min(t.n - 1, Math.max(0, Math.round(y / t.cell)));
  return d.list[d.map[j * t.n + i]];
}

export function generateDistricts(t: Terrain, rng: Rng): Districts {
  const S = t.size;
  const noise = new Noise2D(rng.fork('warp'));
  const warp = (x: number, y: number): Vec2 => ({
    x: x + 75 * noise.fbm(x / 330, y / 330, 2),
    y: y + 75 * noise.fbm(x / 330 + 50, y / 330 + 50, 2),
  });
  const c = S / 2;
  const buildable = (p: Vec2, margin: number) => inBounds(t, p.x, p.y, margin) && seaDistAt(t, p.x, p.y) > 70 && riverBankAt(t, p.x, p.y) > 40;

  // Downtown: flat ground a few hundred metres from the shore, near the middle of the coast.
  let best: Vec2 = { x: c, y: c };
  let bestScore = -Infinity;
  for (let i = 0; i < 500; i++) {
    const p = { x: rng.range(0.2, 0.8) * S, y: rng.range(0.2, 0.8) * S };
    if (!buildable(p, 0.2 * S)) continue;
    const v = (p.x - c) * t.along.x + (p.y - c) * t.along.y;
    const score =
      -2 * Math.abs(seaDistAt(t, p.x, p.y) - 0.24 * S) / S -
      1.2 * Math.abs(v) / S -
      3 * hillAt(t, p.x, p.y) -
      (riverBankAt(t, p.x, p.y) < 220 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  const sites: Vec2[] = [best];
  const minDist = 0.165 * S;
  for (let i = 0; i < 6000 && sites.length < 40; i++) {
    const p = { x: rng.range(0.03, 0.97) * S, y: rng.range(0.03, 0.97) * S };
    if (!buildable(p, 0)) continue;
    if (sites.some((s) => dist(s, p) < minDist)) continue;
    sites.push(p);
  }

  const baseAngle = Math.atan2(t.along.y, t.along.x) + rng.range(-0.12, 0.12);
  const coastAngle = (p: Vec2) => {
    const g = gradient(t, t.seaDist, p.x, p.y, 40);
    return Math.atan2(g.y, g.x) + Math.PI / 2;
  };
  const downtownAngle = rng.chance(0.65) ? baseAngle + rng.sign() * rng.range(0.35, 0.7) : baseAngle;

  const types: DistrictType[] = sites.map(() => 'suburb');
  types[0] = 'downtown';
  const coastal: number[] = [];
  const inner: number[] = [];
  const outer: number[] = [];
  for (let i = 1; i < sites.length; i++) {
    const p = sites[i];
    if (hillAt(t, p.x, p.y) > 0.45) types[i] = 'hills';
    else if (seaDistAt(t, p.x, p.y) < 0.13 * S) coastal.push(i);
    else if (dist(p, best) < 0.29 * S) inner.push(i);
    else outer.push(i);
  }
  if (coastal.length >= 2) {
    const mouth = t.river[t.river.length - 1];
    coastal.sort((a, b) => dist(sites[a], mouth) - dist(sites[b], mouth));
    types[coastal[0]] = 'industrial';
    for (const i of coastal.slice(1)) types[i] = 'beach';
  } else {
    for (const i of coastal) types[i] = 'beach';
  }
  inner.sort((a, b) => dist(sites[a], best) - dist(sites[b], best));
  inner.forEach((i, k) => (types[i] = k === 0 ? 'midtown' : k === 1 && inner.length >= 3 ? 'oldtown' : k % 2 ? 'midtown' : 'residential'));
  outer.forEach((i, k) => (types[i] = k % 3 === 0 ? 'residential' : 'suburb'));
  if (outer.length >= 2 && (coastal.length < 2 || rng.chance(0.4))) types[rng.pick(outer)] = 'industrial';

  const list: District[] = sites.map((center, id) => {
    const type = types[id];
    let angle = baseAngle;
    if (type === 'downtown') angle = downtownAngle;
    else if (type === 'midtown') angle = rng.chance(0.5) ? downtownAngle : baseAngle;
    else if (type === 'residential') angle = rng.chance(0.6) ? baseAngle : baseAngle + rng.range(-0.5, 0.5);
    else if (type === 'suburb') angle = baseAngle + rng.range(-0.6, 0.6);
    else if (type === 'beach' || type === 'industrial') angle = coastAngle(center);
    return { id, type, center, angle, radial: type === 'oldtown', style: DISTRICT_STYLE[type] };
  });

  const map = new Uint8Array(t.n * t.n);
  for (let j = 0; j < t.n; j++) {
    for (let i = 0; i < t.n; i++) {
      const p = warp(i * t.cell, j * t.cell);
      let bi = 0;
      let bd = Infinity;
      for (const d of list) {
        const dd = (d.center.x - p.x) ** 2 + (d.center.y - p.y) ** 2;
        if (dd < bd) {
          bd = dd;
          bi = d.id;
        }
      }
      map[j * t.n + i] = bi;
    }
  }

  // Parks: a big central one near downtown and a smaller neighbourhood one.
  const parks: Park[] = [];
  const tryPark = (rMin: number, rMax: number, dMin: number, dMax: number) => {
    for (let i = 0; i < 300; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(dMin, dMax) * S;
      const p = { x: best.x + Math.cos(a) * r, y: best.y + Math.sin(a) * r };
      const radius = rng.range(rMin, rMax);
      if (!buildable(p, radius + 60) || seaDistAt(t, p.x, p.y) < radius + 120) continue;
      if (hillAt(t, p.x, p.y) > 0.3 || riverBankAt(t, p.x, p.y) < radius + 40) continue;
      if (parks.some((q) => dist(q.center, p) < q.radius + radius + 250)) continue;
      parks.push({ center: p, radius });
      return;
    }
  };
  tryPark(120, 165, 0.14, 0.24);
  tryPark(70, 100, 0.28, 0.42);

  return { list, downtown: list[0], map, parks, warp };
}
