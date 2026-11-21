import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { Vec2, dist } from '../core/vec2';
import { REF_SIZE, Terrain, featureScale, gradient, hillAt, inBounds, riverBankAt, seaDistAt } from './terrain';

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
  // District and park sizes stay in metres; a bigger map gets more of them.
  const F = featureScale(S);
  const area = (S / REF_SIZE) ** 2;
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
      -2 * Math.abs(seaDistAt(t, p.x, p.y) - 0.24 * F) / S -
      1.2 * Math.abs(v) / S -
      3 * hillAt(t, p.x, p.y) -
      (riverBankAt(t, p.x, p.y) < 220 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  const sites: Vec2[] = [best];
  const minDist = 0.165 * REF_SIZE * (F / REF_SIZE) ** 0.4;
  const maxSites = Math.min(250, Math.round(40 * area));
  for (let i = 0; i < 6000 * area && sites.length < maxSites; i++) {
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
  /** Dense neighbourhoods between the inner city and the suburbs; only a map bigger than REF_SIZE has room for it. */
  const ring: number[] = [];
  const innerR = 0.29 * F;
  const ringR = innerR + 0.3 * (S - REF_SIZE);
  for (let i = 1; i < sites.length; i++) {
    const p = sites[i];
    if (hillAt(t, p.x, p.y) > 0.45) types[i] = 'hills';
    else if (seaDistAt(t, p.x, p.y) < 0.13 * F) coastal.push(i);
    else if (dist(p, best) < innerR) inner.push(i);
    else if (dist(p, best) < ringR) ring.push(i);
    else outer.push(i);
  }
  if (coastal.length >= 2) {
    const mouth = t.river[t.river.length - 1];
    coastal.sort((a, b) => dist(sites[a], mouth) - dist(sites[b], mouth));
    // The port grows with the map: the districts nearest the river mouth.
    const port = Math.min(coastal.length - 1, Math.round(S / REF_SIZE));
    for (const i of coastal.slice(0, port)) types[i] = 'industrial';
    for (const i of coastal.slice(port)) types[i] = 'beach';
  } else {
    for (const i of coastal) types[i] = 'beach';
  }
  inner.sort((a, b) => dist(sites[a], best) - dist(sites[b], best));
  inner.forEach((i, k) => (types[i] = k === 0 ? 'midtown' : k === 1 && inner.length >= 3 ? 'oldtown' : k % 2 ? 'midtown' : 'residential'));
  outer.forEach((i, k) => (types[i] = k % 3 === 0 ? 'residential' : 'suburb'));
  if (outer.length >= 2 && (coastal.length < 2 || rng.chance(0.4))) types[rng.pick(outer)] = 'industrial';
  if (ring.length) {
    const rRng = rng.fork('ring');
    ring.forEach((i) => (types[i] = rRng.chance(0.7) ? 'residential' : 'suburb'));
    // Sub-centres: a second, smaller core with its own main-street district next to it.
    const centres: number[] = [];
    const want = Math.round(S / REF_SIZE) - 1;
    for (let k = 0; k < 200 && centres.length < want; k++) {
      const i = rRng.pick(ring);
      if (dist(sites[i], best) < innerR + 0.5 * (ringR - innerR)) continue;
      if (centres.some((j) => dist(sites[i], sites[j]) < 0.5 * S)) continue;
      centres.push(i);
      types[i] = 'midtown';
      const near = ring.filter((j) => j !== i && types[j] !== 'midtown').sort((a, b) => dist(sites[a], sites[i]) - dist(sites[b], sites[i]));
      near.slice(0, 2).forEach((j, n) => (types[j] = n ? 'residential' : 'midtown'));
    }
    // Every city this size has an old quarter: fall back to the dense district nearest downtown.
    if (!types.includes('oldtown')) {
      const cand = [...inner, ...ring].filter((i) => types[i] === 'residential').sort((a, b) => dist(sites[a], best) - dist(sites[b], best));
      if (cand.length) types[cand[0]] = 'oldtown';
    }
    // A second industrial area inland, away from the centre.
    const far = [...ring, ...outer].filter((i) => types[i] === 'suburb' && dist(sites[i], best) > ringR * 0.8);
    if (far.length) types[rRng.pick(far)] = 'industrial';
  }

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
      if (list.some((d) => d.radial && dist(d.center, p) < radius + 260)) continue;
      parks.push({ center: p, radius });
      return;
    }
  };
  const k = F / REF_SIZE;
  tryPark(120 * Math.sqrt(k), 165 * Math.sqrt(k), (0.14 * F) / S, (0.24 * F) / S);
  tryPark(70, 100, (0.28 * F) / S, (0.42 * F) / S);
  // Neighbourhood parks across the rest of a bigger map.
  for (let i = 0; i < Math.round(2 * area) - 2; i++) tryPark(60, 115, (0.42 * F) / S, 0.75);

  return { list, downtown: list[0], map, parks, warp };
}
