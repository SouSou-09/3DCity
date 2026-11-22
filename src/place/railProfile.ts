import { V3 } from '../assets/mesh/builder';
import { Section, layout } from '../assets/mesh/section';
import { Vec2, clamp, mix, smoothstep } from '../core/vec2';
import { City } from '../gen/city';
import { RailStructure } from '../gen/rail';
import { isWater } from '../gen/terrain';

/** A railway line as built: the generated route with its rails brought to the level of the roads it crosses. */
export interface RailTrack {
  /** Index into Rail.lines. */
  line: number;
  kind: 'main' | 'freight';
  tracks: number;
  pts: Vec2[];
  /** Distance along the line at each point. */
  s: number[];
  /** Height of the rail heads at each point. */
  level: number[];
  /** What carries the track at each point. Bridge ends that stand on the bank count as ground. */
  structure: RailStructure[];
}

/** A place where a road crosses the rails on the level. */
export interface LevelCrossing {
  x: number;
  y: number;
  line: number;
  edge: number;
  /** Distance along the line, and the index of the point before it. */
  s: number;
  index: number;
  /** Height of the rail heads and the road surface. */
  h: number;
  /** Unit direction of the track and of the road. */
  tan: Vec2;
  dir: Vec2;
  /** Half width of the road across itself: kerb to kerb, and out to the backs of its pavements. */
  half: number;
  outer: number;
  /** Height of the crossing's deck above the road's centre line: level with the pavements, a low table for traffic. */
  table: number;
}

export interface RailProfile {
  lines: RailTrack[];
  crossings: LevelCrossing[];
  /** Roads that meet the track on the ground but get no crossing: too steep, or too close to another crossing at another height. */
  unbuilt: { line: number; edge: number; s: number }[];
}

/** Rail heads stand this far above the road surface at a level crossing, so that the road never buries them. */
export const RAIL_PROUD = 0.02;
/** Largest difference in height between road and rails that a level crossing can take up. */
const MAX_BEND = 3.3;
/** Most that a road may rise or fall over the width of the tracks it crosses on the level. */
const MAX_FALL = 0.9;
/** Road surface above the rails where the tracks pass under it in a tunnel. */
const TUNNEL_COVER = 6.3;
/** Rails on a viaduct stand at least this far above a street passing below, and how far they may be lifted to get there. */
const HEADROOM = 5.6;
const MAX_LIFT = 2.2;
/** Freeway surface above the rails it passes over: a train's height plus the freeway's deck. */
const UNDER_FREEWAY = 6.4;
/** Steepest grade of the line where it climbs or falls to a crossing. */
const RAIL_GRADE = 0.03;
/** Steepest grade that bending the rails to a road may add to the line's own. */
const BEND_GRADE = 0.008;

/** Height and direction of a road's centre line as built, at the point nearest (x, y). */
export function roadAt(line: V3[], x: number, y: number): { h: number; d: number; dir: Vec2; p: Vec2 } {
  let best = { h: line[0][1], d: Infinity, dir: { x: 1, y: 0 }, p: { x: line[0][0], y: line[0][2] } };
  for (let i = 1; i < line.length; i++) {
    const [ax, ah, ay] = line[i - 1];
    const [bx, bh, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const q = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    const d = Math.hypot(x - ax - dx * q, y - ay - dy * q);
    if (d < best.d) {
      const l = Math.sqrt(l2);
      best = { h: ah + (bh - ah) * q, d, dir: { x: dx / l, y: dy / l }, p: { x: ax + dx * q, y: ay + dy * q } };
    }
  }
  return best;
}

/**
 * Final vertical alignment of the railway. Roads are built before the tracks, so at each level crossing the rails
 * are raised or lowered to the road, easing back to the generated profile on both sides.
 */
export function railProfile(city: City, roadLines: (V3[] | null)[], sections: Section[]): RailProfile {
  const t = city.terrain;
  const lines: RailTrack[] = city.rail.lines.map((l, line) => {
    const s = [0];
    for (let i = 1; i < l.points.length; i++) s.push(s[i - 1] + Math.hypot(l.points[i].x - l.points[i - 1].x, l.points[i].y - l.points[i - 1].y));
    const structure = l.structure.map((st, i) => (st === 'bridge' && !isWater(t, l.points[i].x, l.points[i].y) && l.level[i] - groundNear(city, l.points[i]) < 2 ? 'ground' : st));
    // Keep a bridge whole: only the bank ends turn into ground, never a stretch between two wet parts.
    for (let i = 0; i < structure.length; i++) {
      if (l.structure[i] !== 'bridge' || structure[i] !== 'ground') continue;
      let a = i;
      let b = i;
      while (a > 0 && l.structure[a - 1] === 'bridge') a--;
      while (b + 1 < structure.length && l.structure[b + 1] === 'bridge') b++;
      let w0 = a;
      let w1 = b;
      while (w0 <= b && structure[w0] === 'ground') w0++;
      while (w1 >= a && structure[w1] === 'ground') w1--;
      for (let k = w0; k <= w1; k++) structure[k] = 'bridge';
      i = b;
    }
    return { line, kind: l.kind, tracks: l.tracks, pts: l.points, s, level: l.level.slice(), structure };
  });

  const crossings: LevelCrossing[] = [];
  const unbuilt: RailProfile['unbuilt'] = [];
  /** Roads passing below a viaduct, and freeways passing above the rails. */
  const below: { line: number; s: number; h: number; half: number }[] = [];
  const above: { line: number; s: number; h: number }[] = [];
  const spans: { line: number; s: number; h: number; along: number; half: number; kind: 'tunnel' | 'elevated' }[] = [];
  for (const c of city.railCrossings) {
    const e = city.graph.edges[c.edge];
    const road = roadLines[c.edge];
    if (!road) continue;
    const tr = lines[c.line];
    let index = 0;
    let s = 0;
    let bd = Infinity;
    for (let i = 0; i + 1 < tr.pts.length; i++) {
      const a = tr.pts[i];
      const b = tr.pts[i + 1];
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const q = clamp(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / l2, 0, 1);
      const d = Math.hypot(c.x - a.x - (b.x - a.x) * q, c.y - a.y - (b.y - a.y) * q);
      if (d < bd) {
        bd = d;
        index = i;
        s = tr.s[i] + Math.sqrt(l2) * q;
      }
    }
    const at = roadAt(road, c.x, c.y);
    if (at.d > 3) continue;
    const q = (s - tr.s[index]) / (tr.s[index + 1] - tr.s[index] || 1);
    const rail = tr.level[index] + (tr.level[index + 1] - tr.level[index]) * q;
    const lay = layout(sections[c.edge]);
    const half = Math.max(-lay.road[0], lay.road[1]);
    if (e.cls === 'highway' || e.cls === 'ramp') {
      if (at.h > rail) above.push({ line: c.line, s, h: at.h });
      continue;
    }
    if (tr.structure[index] !== 'ground' || tr.structure[index + 1] !== 'ground') {
      if (at.h < rail) below.push({ line: c.line, s, h: at.h, half });
      continue;
    }
    const a = tr.pts[index];
    const b = tr.pts[index + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tan = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    if (Math.abs(at.h - rail) > MAX_BEND) {
      // Too far apart to meet: the tracks pass under the road in a short tunnel, or over it on a short bridge.
      const along = Math.max(-lay.outer[0], lay.outer[1]) / Math.max(0.5, Math.abs(tan.x * at.dir.y - tan.y * at.dir.x));
      spans.push({ line: c.line, s, h: at.h, along, half, kind: at.h > rail ? 'tunnel' : 'elevated' });
      continue;
    }
    // A road that runs nearly along the track cannot cross it in any sensible length.
    if (Math.abs(tan.x * at.dir.x + tan.y * at.dir.y) > 0.86) continue;
    // Raised kerbs and medians would bury the rails, so the crossing's deck is level with the highest of them.
    const table = Math.max(lay.outerY[0], lay.outerY[1], lay.lanes.some((ln) => ln.lane.kind === 'median' && (ln.lane.median === 'raised' || ln.lane.median === 'planted')) ? 0.15 : 0);
    // The road rises or falls across the tracks; the rails take its highest point.
    const reach = tr.tracks * 2 + 1.5;
    const across = [at.h, roadAt(road, c.x + at.dir.x * reach, c.y + at.dir.y * reach).h, roadAt(road, c.x - at.dir.x * reach, c.y - at.dir.y * reach).h];
    // A road too steep to be level across the tracks gets no crossing.
    if (Math.max(...across) - Math.min(...across) > MAX_FALL) {
      unbuilt.push({ line: c.line, edge: c.edge, s });
      continue;
    }
    const h = Math.max(...across) + table + RAIL_PROUD;
    crossings.push({ x: c.x, y: c.y, line: c.line, edge: c.edge, s, index, h, tan, dir: at.dir, half, outer: Math.max(-lay.outer[0], lay.outer[1]), table });
  }

  for (const sp of spans) {
    const tr = lines[sp.line];
    const reach = sp.along + (sp.kind === 'tunnel' ? 14 : 8);
    tr.structure.forEach((st, i) => {
      if (st === 'ground' && Math.abs(tr.s[i] - sp.s) < reach) tr.structure[i] = sp.kind;
    });
    if (sp.kind === 'elevated') below.push(sp);
  }
  for (const tr of lines) {
    // A few metres of daylight between two tunnels are not worth opening up.
    for (let i = 1; i < tr.structure.length; i++) {
      if (tr.structure[i] !== 'ground' || tr.structure[i - 1] !== 'tunnel') continue;
      let j = i;
      while (j < tr.structure.length && tr.structure[j] === 'ground') j++;
      if (j < tr.structure.length && tr.structure[j] === 'tunnel' && j - i <= 4) for (let k = i; k < j; k++) tr.structure[k] = 'tunnel';
      i = j;
    }
  }

  const RANK: Record<string, number> = { arterial: 3, collector: 2, local: 1 };
  const kept: LevelCrossing[] = [];
  const main = lines.find((l) => l.kind === 'main');
  for (const tr of lines) {
    const base = tr.level.slice();
    const levelAt = (s: number): number => {
      let i = 0;
      while (i + 2 < tr.s.length && tr.s[i + 1] < s) i++;
      return base[i] + ((base[i + 1] - base[i]) * (s - tr.s[i])) / (tr.s[i + 1] - tr.s[i] || 1);
    };
    interface Knot { s: number; d: number; h: number; flat: number; ease: number; rank: number; c: LevelCrossing | null }
    const knot = (s: number, d: number, flat: number, c: LevelCrossing | null): Knot => ({ s, d, h: levelAt(s) + d, flat, ease: Math.max(60, (1.5 * Math.abs(d)) / BEND_GRADE), rank: c ? (RANK[city.graph.edges[c.edge].cls] ?? 0) : -1, c });
    let hard = crossings
      .filter((c) => c.line === tr.line)
      .map((c) => {
        // Along the track the road is this wide; the rails stay level under it.
        const sin = Math.abs(c.tan.x * c.dir.y - c.tan.y * c.dir.x) || 1;
        return knot(c.s, c.h - levelAt(c.s), c.outer / sin + 2, c);
      })
      .sort((a, b) => a.s - b.s);
    if (main && tr.kind === 'freight') {
      // A branch leaves the main line at the main line's level, whatever the crossings have done to that.
      let at = 0;
      main.pts.forEach((p, i) => {
        if (Math.hypot(p.x - tr.pts[0].x, p.y - tr.pts[0].y) < Math.hypot(main.pts[at].x - tr.pts[0].x, main.pts[at].y - tr.pts[0].y)) at = i;
      });
      hard.unshift({ ...knot(0, main.level[at] - base[0], 0, null), rank: 9 });
    }
    // Two roads too close together at heights too far apart cannot both be met: the smaller one gets no crossing.
    for (let again = true; again; ) {
      again = false;
      for (let k = 0; k + 1 < hard.length; k++) {
        const [a, b] = [hard[k], hard[k + 1]];
        const gap = b.s - b.flat - a.s - a.flat;
        const dh = Math.abs(a.h - b.h);
        if (dh <= RAIL_GRADE * Math.max(0, gap) + 1e-6) continue;
        const low = a.h < b.h ? a : b;
        if (gap < 12 && dh <= 0.5 && a.c && b.c && low.c) {
          // Two roads side by side share one level stretch of track: the lower road climbs a little more to it.
          low.h += dh;
          low.d += dh;
          low.c.h += dh;
          low.c.table += dh;
        } else {
          const out = a.rank < b.rank || (a.rank === b.rank && Math.abs(a.d) > Math.abs(b.d)) ? a : b;
          hard = hard.filter((x) => x !== out);
          if (out.c) unbuilt.push({ line: out.c.line, edge: out.c.edge, s: out.c.s });
        }
        again = true;
        break;
      }
    }
    for (const k of hard) if (k.c) kept.push(k.c);
    const knots = hard.slice();
    // Lift a low viaduct clear of the street below it, as far as a freeway overhead leaves room.
    for (const u of below) {
      if (u.line !== tr.line) continue;
      let d = clamp(u.h + HEADROOM - levelAt(u.s), 0, MAX_LIFT);
      for (const o of above) if (o.line === tr.line && Math.abs(o.s - u.s) < 400) d = Math.min(d, Math.max(0, o.h - UNDER_FREEWAY - levelAt(o.s)));
      if (d > 0.05) knots.push(knot(u.s, d, u.half + 4, null));
    }
    // And sink the tracks far enough below a road for a tunnel's roof to fit between them.
    for (const sp of spans) {
      if (sp.line !== tr.line || sp.kind !== 'tunnel') continue;
      const d = clamp(sp.h - TUNNEL_COVER - levelAt(sp.s), -MAX_BEND, 0);
      if (d < -0.05) knots.push(knot(sp.s, d, sp.along + 10, null));
    }
    if (!knots.length || knots.every((k) => Math.abs(k.d) < 1e-3)) continue;
    knots.sort((a, b) => a.s - b.s);
    const weight = (k: Knot, s: number): number => 1 - smoothstep(k.flat, k.flat + k.ease, Math.abs(s - k.s));
    let level = base.map((v, i) => {
      const s = tr.s[i];
      let k = 0;
      while (k + 1 < knots.length && knots[k + 1].s < s) k++;
      const a = knots[k];
      const b = knots[k + 1];
      if (s <= a.s || !b) return v + a.d * weight(a, s);
      // Between two of them each holds its own height near itself, and they hand over in between.
      let [lo, hi] = [a.s + a.flat, b.s - b.flat];
      if (hi - lo < 10) [lo, hi] = [a.s, b.s];
      return v + mix(a.d * weight(a, s), b.d * weight(b, s), smoothstep(lo, hi, s));
    });
    // The crossings are fixed; everything else stays within the grade that can still reach them.
    const fixed = level.map(() => false);
    level = level.map((v, i) => {
      let [lo, hi] = [-Infinity, Infinity];
      for (const k of hard) {
        const run = Math.max(0, Math.abs(tr.s[i] - k.s) - k.flat);
        if (run === 0) fixed[i] = true;
        lo = Math.max(lo, k.h - RAIL_GRADE * run);
        hi = Math.min(hi, k.h + RAIL_GRADE * run);
      }
      return lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi);
    });
    for (let pass = 0; pass < 6; pass++) level = level.map((v, i) => (fixed[i] || i === 0 || i === level.length - 1 ? v : 0.25 * level[i - 1] + 0.5 * v + 0.25 * level[i + 1]));
    tr.level = level;
  }
  crossings.length = 0;
  crossings.push(...kept);
  return { lines, crossings, unbuilt };
}

function groundNear(city: City, p: Vec2): number {
  const t = city.terrain;
  const i = clamp(Math.round(p.x / t.cell), 0, t.n - 1);
  const j = clamp(Math.round(p.y / t.cell), 0, t.n - 1);
  return t.height[j * t.n + i];
}

/** Position, unit direction and rail level at distance s along a line. */
export function trackAt(tr: RailTrack, s: number): { p: Vec2; tan: Vec2; h: number; i: number } {
  let lo = 0;
  let hi = tr.s.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tr.s[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = tr.pts[lo];
  const b = tr.pts[lo + 1];
  const l = tr.s[lo + 1] - tr.s[lo] || 1;
  const q = clamp((s - tr.s[lo]) / l, 0, 1);
  return { p: { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q }, tan: { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, h: tr.level[lo] + (tr.level[lo + 1] - tr.level[lo]) * q, i: lo };
}
