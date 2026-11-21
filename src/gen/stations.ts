import { Rng } from '../core/rng';
import { Vec2, dist } from '../core/vec2';
import { Districts, districtAt } from './districts';
import { RAIL_STEP, Rail } from './rail';
import { Terrain, inBounds } from './terrain';

/** Where a station goes on the main line. Only the position is decided here; no model is placed. */
export interface Station {
  id: number;
  x: number;
  y: number;
  /** Rail line and point index of the middle of the platforms. */
  line: number;
  index: number;
  /** Direction of the track, radians. */
  angle: number;
  kind: 'central' | 'elevated' | 'commuter';
}

/** Half the length of the straight, open track a station needs. */
export const STATION_HALF = 110;
const SPACING: [number, number] = [950, 1450];

export function placeStations(rail: Rail, t: Terrain, districts: Districts, rng: Rng): Station[] {
  const li = rail.lines.findIndex((l) => l.kind === 'main');
  if (li < 0) return [];
  const line = rail.lines[li];
  const n = line.points.length;
  const w = Math.round(STATION_HALF / RAIL_STEP);
  /** Lower is better; Infinity where a station cannot go. */
  const cost = (i: number): number => {
    if (i < w || i >= n - w) return Infinity;
    const p = line.points[i];
    if (!inBounds(t, p.x, p.y, 160)) return Infinity;
    for (let k = i - w; k <= i + w; k++) if (line.structure[k] === 'tunnel' || line.structure[k] === 'bridge') return Infinity;
    const a = line.points[i - w];
    const b = line.points[i + w];
    // Sagitta of the platform track: platforms want straight track.
    const bow = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / (dist(a, b) || 1);
    const type = districtAt(t, districts, p.x, p.y).type;
    return bow * 6 + (type === 'hills' ? 400 : type === 'industrial' ? 120 : 0);
  };
  const best = (from: number, to: number, extra: (i: number) => number): number => {
    let bi = -1;
    let bc = Infinity;
    for (let i = Math.max(0, from); i <= Math.min(n - 1, to); i++) {
      const c = cost(i) + extra(i);
      if (c < bc) {
        bc = c;
        bi = i;
      }
    }
    return bi;
  };
  const out: Station[] = [];
  const add = (i: number, central: boolean) => {
    const p = line.points[i];
    const a = line.points[i - 1];
    const b = line.points[i + 1];
    out.push({ id: 0, x: p.x, y: p.y, line: li, index: i, angle: Math.atan2(b.y - a.y, b.x - a.x), kind: central ? 'central' : line.structure[i] === 'elevated' ? 'elevated' : 'commuter' });
  };
  const centre: Vec2 = districts.downtown.center;
  const c0 = best(0, n - 1, (i) => dist(line.points[i], centre));
  if (c0 < 0) return [];
  add(c0, true);
  for (const dir of [1, -1]) {
    let at = c0;
    for (;;) {
      const lo = at + (dir * SPACING[0]) / RAIL_STEP;
      const hi = at + (dir * SPACING[1]) / RAIL_STEP;
      const target = at + (dir * rng.range(SPACING[0] + 100, SPACING[1] - 100)) / RAIL_STEP;
      const i = best(Math.min(lo, hi), Math.max(lo, hi), (k) => Math.abs(k - target) * 0.3);
      if (i < 0) {
        // Nothing usable in this stretch (tunnel, bridge, map edge): look further on.
        at += (dir * SPACING[0]) / RAIL_STEP / 2;
        if (at < 0 || at >= n) break;
        continue;
      }
      add(i, false);
      at = i;
    }
  }
  out.sort((a, b) => a.index - b.index);
  out.forEach((s, i) => (s.id = i));
  return out;
}
