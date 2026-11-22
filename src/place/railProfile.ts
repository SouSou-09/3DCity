import { V3 } from '../assets/mesh/builder';
import { Section, layout } from '../assets/mesh/section';
import { Vec2, clamp } from '../core/vec2';
import { City } from '../gen/city';
import { RailStructure } from '../gen/rail';
import { NodePlane } from '../gen/roadHeights';
import { heightAt, isWater } from '../gen/terrain';

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
  /** What carries the track at each point. Bridge ends on the bank count as ground. */
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
  /** Height of the rail heads and of the crossing's deck. */
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
  /**
   * Roads that meet the track on the ground without a crossing of their own: inside a junction (the rails run
   * through its surface), too steep, nearly along the track, or too close to another crossing at another height.
   */
  unbuilt: { line: number; edge: number; s: number; why: 'junction' | 'skew' | 'steep' | 'far' | 'conflict' }[];
  /** Track set into the surface of a junction, from where it enters the paving (s0) to where it leaves (s1). */
  through: Through[];
}

export interface Through {
  line: number;
  /** Index into the junctions given to railProfile. */
  junction: number;
  edge: number;
  s0: number;
  s1: number;
  /** Height of the rail heads: level with the highest point of the junction along the track. */
  h: number;
}

/** What railProfile needs to know of a junction. */
export interface JunctionArea {
  x: number;
  y: number;
  plane: NodePlane;
  /** Furthest that its surface reaches from its centre. */
  reach: number;
  /** Each road that ends here: direction away from the centre, how far its paving belongs to the junction, half its width. */
  arms: { dir: Vec2; reach: number; half: number }[];
}

/** Rail heads stand this far above the road surface at a level crossing, so that the road never buries them. */
export const RAIL_PROUD = 0.02;
/** Largest difference in height between road and rails that a level crossing can take up. */
const MAX_BEND = 9;
/** Most that a road may rise or fall over the width of the tracks it crosses on the level. */
const MAX_FALL = 1.6;
/** Most that a crossing's deck is raised above its road so that the rails can reach the next crossing. */
const MAX_TABLE = 0.6;
/** Rails on a viaduct stand at least this far above a street passing below, and how far they may be lifted to get there. */
const HEADROOM = 5.6;
const MAX_LIFT = 3.2;
/** Freeway or ramp surface above the rails it passes over: a train's height plus the deck. */
const UNDER_FREEWAY = 6.4;
/** A ramp at least this far above the rails passes over them; a lower one crosses them like a street. */
const RAMP_OVER = 4.5;
/** Steepest grade of the line where it climbs or falls to a crossing. */
const RAIL_GRADE = 0.03;
/** A street this far below track on an embankment passes under it by a bridge. */
const UNDERBRIDGE = 3.3;

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
 * are raised or lowered to the road, and climb or fall back to the generated profile on both sides.
 */
export function railProfile(city: City, roadLines: (V3[] | null)[], sections: Section[], junctions: JunctionArea[]): RailProfile {
  const t = city.terrain;
  const lines: RailTrack[] = city.rail.lines.map((l, line) => {
    const n = l.points.length;
    const s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(l.points[i].x - l.points[i - 1].x, l.points[i].y - l.points[i - 1].y));
    const cover = l.points.map((p, i) => heightAt(t, p.x, p.y) - l.level[i]);
    const structure = l.structure.map((st, i) => (st === 'bridge' && !isWater(t, l.points[i].x, l.points[i].y) && cover[i] > -2 ? 'ground' : st));
    // Keep a bridge whole: only the bank ends turn into ground, never a stretch between two wet parts.
    for (let i = 0; i < n; i++) {
      if (l.structure[i] !== 'bridge' || structure[i] !== 'ground') continue;
      let a = i;
      let b = i;
      while (a > 0 && l.structure[a - 1] === 'bridge') a--;
      while (b + 1 < n && l.structure[b + 1] === 'bridge') b++;
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
  const through: Through[] = [];
  /** Streets passing below a viaduct, and freeways passing above the rails. */
  const below: { line: number; s: number; h: number; half: number }[] = [];
  const above: { line: number; s: number; h: number }[] = [];
  for (const c of city.railCrossings) {
    const e = city.graph.edges[c.edge];
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
    const q = (s - tr.s[index]) / (tr.s[index + 1] - tr.s[index] || 1);
    const rail = tr.level[index] + (tr.level[index + 1] - tr.level[index]) * q;
    const onGround = tr.structure[index] === 'ground' && tr.structure[index + 1] === 'ground';
    const road = roadLines[c.edge];
    const at = road ? roadAt(road, c.x, c.y) : null;
    if (!at || at.d > 3) {
      // The road's own surface ends before the tracks: they pass through the junction at its end.
      if (e.cls === 'highway' || e.cls === 'ramp' || !onGround) continue;
      let best = -1;
      const off = (k: number): number => Math.hypot(junctions[k].x - c.x, junctions[k].y - c.y);
      junctions.forEach((j, k) => {
        if (off(k) < j.reach + 6 && (best < 0 || off(k) < off(best))) best = k;
      });
      if (best < 0) continue;
      if (through.some((x) => x.line === c.line && x.junction === best)) continue;
      const j = junctions[best];
      const paved = (p: Vec2): boolean =>
        j.arms.some((a) => {
          const [dx, dy] = [p.x - j.x, p.y - j.y];
          const along = dx * a.dir.x + dy * a.dir.y;
          return along > -a.half && along < a.reach + 0.5 && Math.abs(dy * a.dir.x - dx * a.dir.y) < a.half;
        });
      const end = tr.s[tr.s.length - 1];
      let [s0, s1] = [s, s];
      while (s0 > 0 && s - s0 < j.reach + 30 && paved(trackAt(tr, s0 - 1).p)) s0 -= 1;
      while (s1 < end && s1 - s < j.reach + 30 && paved(trackAt(tr, s1 + 1).p)) s1 += 1;
      [s0, s1] = [Math.max(0, s0 - 1), Math.min(end, s1 + 1)];
      let h = -Infinity;
      for (let q = s0; q <= s1; q += 1) {
        const p = trackAt(tr, q).p;
        h = Math.max(h, j.plane.h + j.plane.gx * (p.x - j.x) + j.plane.gy * (p.y - j.y));
      }
      if (Math.abs(h - rail) <= MAX_BEND) through.push({ line: c.line, junction: best, edge: c.edge, s0, s1, h: h + RAIL_PROUD });
      else unbuilt.push({ line: c.line, edge: c.edge, s, why: 'junction' });
      continue;
    }
    const lay = layout(sections[c.edge]);
    const half = Math.max(-lay.road[0], lay.road[1]);
    if (e.cls === 'highway' || (e.cls === 'ramp' && at.h - rail > RAMP_OVER)) {
      if (at.h > rail) above.push({ line: c.line, s, h: at.h });
      continue;
    }
    if (!onGround || rail - at.h > UNDERBRIDGE) {
      if (at.h >= rail) continue;
      // The street passes below a viaduct, or well below an embankment: the deck (a short bridge, in an embankment)
      // reaches clear across it, joined to any viaduct close by.
      const l = tr.s[index + 1] - tr.s[index] || 1;
      const sin = Math.abs(((tr.pts[index + 1].x - tr.pts[index].x) * at.dir.y - (tr.pts[index + 1].y - tr.pts[index].y) * at.dir.x) / l) || 1;
      const span = Math.max(12, Math.min(40, half / sin + 6));
      const open = (i: number): boolean => tr.structure[i] === 'ground';
      let [i0, i1] = [index, index + 1];
      while (i0 > 0 && s - tr.s[i0] < span) i0--;
      while (i1 + 1 < tr.pts.length && tr.s[i1] - s < span) i1++;
      for (let k = 1; k <= 3; k++) if (i0 - k >= 0 && !open(i0 - k) && tr.structure[i0 - k] !== 'tunnel') i0 -= k;
      for (let k = 1; k <= 3; k++) if (i1 + k < tr.pts.length && !open(i1 + k) && tr.structure[i1 + k] !== 'tunnel') i1 += k;
      let kind: RailStructure = 'elevated';
      for (let i = i0; i <= i1; i++) if (tr.structure[i] === 'bridge') kind = 'bridge';
      for (let i = i0; i <= i1; i++) if (open(i)) tr.structure[i] = kind;
      below.push({ line: c.line, s, h: at.h, half });
      continue;
    }
    const a = tr.pts[index];
    const b = tr.pts[index + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tan = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    // Raised kerbs and medians would bury the rails, so the crossing's deck is level with the highest of them.
    const table = Math.max(lay.outerY[0], lay.outerY[1], lay.lanes.some((ln) => ln.lane.kind === 'median' && (ln.lane.median === 'raised' || ln.lane.median === 'planted')) ? 0.15 : 0);
    // The road rises or falls across the tracks; the rails take its highest point.
    const reach = tr.tracks * 2 + 1.5;
    const across = [at.h, roadAt(road!, c.x + at.dir.x * reach, c.y + at.dir.y * reach).h, roadAt(road!, c.x - at.dir.x * reach, c.y - at.dir.y * reach).h];
    // No crossing where the road runs nearly along the track, is too steep to be level across it, or is too far above or below.
    const why = Math.abs(tan.x * at.dir.x + tan.y * at.dir.y) > 0.86 ? 'skew' : Math.max(...across) - Math.min(...across) > MAX_FALL ? 'steep' : Math.abs(at.h - rail) > MAX_BEND ? 'far' : null;
    if (why) {
      unbuilt.push({ line: c.line, edge: c.edge, s, why });
      continue;
    }
    const h = Math.max(...across) + table + RAIL_PROUD;
    crossings.push({ x: c.x, y: c.y, line: c.line, edge: c.edge, s, index, h, tan, dir: at.dir, half, outer: Math.max(-lay.outer[0], lay.outer[1]), table });
  }

  const RANK: Record<string, number> = { arterial: 3, collector: 2, ramp: 2, local: 1 };
  interface Knot {
    s: number;
    h: number;
    /** Half the length of track that is held level at h. */
    flat: number;
    rank: number;
    c: LevelCrossing | null;
    via: Through | null;
    edge: number;
  }
  const kept: LevelCrossing[] = [];
  const main = lines.find((l) => l.kind === 'main');
  for (const tr of lines) {
    const base = tr.level.slice();
    const baseAt = (s: number): number => {
      let i = 0;
      while (i + 2 < tr.s.length && tr.s[i + 1] < s) i++;
      return base[i] + ((base[i + 1] - base[i]) * (s - tr.s[i])) / (tr.s[i + 1] - tr.s[i] || 1);
    };
    let hard: Knot[] = [
      ...crossings
        .filter((c) => c.line === tr.line)
        // Along the track the road is this wide; the rails stay level under it.
        .map((c) => ({ s: c.s, h: c.h, flat: c.outer / (Math.abs(c.tan.x * c.dir.y - c.tan.y * c.dir.x) || 1) + 2, rank: RANK[city.graph.edges[c.edge].cls] ?? 0, c, via: null, edge: c.edge })),
      ...through.filter((k) => k.line === tr.line).map((k) => ({ s: (k.s0 + k.s1) / 2, h: k.h, flat: (k.s1 - k.s0) / 2 + 2, rank: 5, c: null, via: k, edge: k.edge })),
    ].sort((a, b) => a.s - b.s);
    if (main && tr.kind === 'freight') {
      // A branch leaves the main line at the main line's level, whatever the crossings have done to that.
      let at = 0;
      main.pts.forEach((p, i) => {
        if (Math.hypot(p.x - tr.pts[0].x, p.y - tr.pts[0].y) < Math.hypot(main.pts[at].x - tr.pts[0].x, main.pts[at].y - tr.pts[0].y)) at = i;
      });
      hard.unshift({ s: 0, h: main.level[at], flat: 0, rank: 9, c: null, via: null, edge: -1 });
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
        const need = dh - RAIL_GRADE * Math.max(0, gap);
        if (low.c && low.c.table + need <= MAX_TABLE) {
          // The lower road climbs a little more onto its crossing, and the rails can reach the other one.
          low.h += need;
          low.c.h += need;
          low.c.table += need;
        } else if (low.via && need <= MAX_TABLE) {
          // Likewise for rails set into a junction: they stand a little proud of it.
          low.h += need;
          low.via.h += need;
        } else {
          const out = a.rank < b.rank || (a.rank === b.rank && Math.abs(a.h - baseAt(a.s)) > Math.abs(b.h - baseAt(b.s))) ? a : b;
          hard = hard.filter((x) => x !== out);
          if (out.c) unbuilt.push({ line: tr.line, edge: out.edge, s: out.s, why: 'conflict' });
          if (out.via) {
            through.splice(through.indexOf(out.via), 1);
            unbuilt.push({ line: tr.line, edge: out.edge, s: out.s, why: 'junction' });
          }
        }
        again = true;
        break;
      }
    }
    for (const k of hard) if (k.c) kept.push(k.c);
    let level = base.slice();
    // Lift a low viaduct clear of the street below it, as far as a freeway overhead leaves room.
    for (const u of below) {
      if (u.line !== tr.line) continue;
      let d = clamp(u.h + HEADROOM - baseAt(u.s), 0, MAX_LIFT);
      for (const o of above) if (o.line === tr.line && Math.abs(o.s - u.s) < 400) d = Math.min(d, Math.max(0, o.h - UNDER_FREEWAY - baseAt(o.s)));
      if (d < 0.05) continue;
      const top = baseAt(u.s) + d;
      level = level.map((v, i) => Math.max(v, top - RAIL_GRADE * Math.max(0, Math.abs(tr.s[i] - u.s) - u.half - 4)));
    }
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
    // Round off the corners that leaves; a point never moves beyond its neighbours, so no grade gets steeper.
    for (let pass = 0; pass < 8; pass++) level = level.map((v, i) => (fixed[i] || i === 0 || i === level.length - 1 ? v : 0.25 * level[i - 1] + 0.5 * v + 0.25 * level[i + 1]));
    tr.level = level;
  }
  crossings.length = 0;
  crossings.push(...kept);
  return { lines, crossings, unbuilt, through };
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
