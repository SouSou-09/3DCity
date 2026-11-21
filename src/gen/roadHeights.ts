import { resample } from '../core/geom';
import { Vec2, clamp, mix } from '../core/vec2';
import { Rail } from './rail';
import { RoadEdge, RoadGraph, RoadNode } from './roadGraph';
import { Terrain, heightAt } from './terrain';

/** Height of a freeway deck above the ground it crosses. */
export const HIGHWAY_LIFT = 6.2;
/** Lowest bridge deck above the water. */
export const DECK_HEIGHT = 5;
/** Lowest road surface next to water. */
const MIN_ROAD = 0.9;
const RAIL_CLEARANCE = 7;
/** A ramp this far from the freeway's centre line has left the freeway's deck. */
export const RAMP_CLEAR = 20;
/** Steepest street, rise over run. */
export const MAX_GRADE = 0.16;
/** Freeway surface above the surface of a street passing below: headroom plus the deck. */
export const STREET_CLEARANCE = 6.4;
const STEP = 5;

/** Junction surface: a plane through the node, tilted with the ground. */
export interface NodePlane {
  h: number;
  gx: number;
  gy: number;
}

export interface EdgeLevel {
  /** Centre line from node a to node b, resampled. */
  pts: Vec2[];
  /** Distance along the line, road surface height and ground height at each point. */
  s: number[];
  h: number[];
  ground: number[];
}

export interface RoadLevels {
  nodes: NodePlane[];
  edges: EdgeLevel[];
}

export const planeAt = (n: RoadNode, p: NodePlane, x: number, y: number): number => p.h + p.gx * (x - n.x) + p.gy * (y - n.y);

/** Ground height averaged over a disc, so that roads ignore small bumps. */
function ground(t: Terrain, x: number, y: number, r = 8): number {
  let h = heightAt(t, x, y) * 2;
  for (let k = 0; k < 6; k++) h += heightAt(t, x + Math.cos(k * 1.0472) * r, y + Math.sin(k * 1.0472) * r);
  return h / 8;
}

const elevated = (e: RoadEdge): boolean => e.cls === 'highway' || e.cls === 'ramp';

/**
 * Vertical alignment of every road. Streets follow the (smoothed) ground and bridge water on a level deck;
 * freeways run on a viaduct above the streets and tracks they cross; ramps come down from it to the street.
 */
export function roadLevels(graph: RoadGraph, t: Terrain, rail: Rail): RoadLevels {
  // Places where the tracks are themselves on a viaduct: the freeway has to clear them.
  const bumps: { x: number; y: number; h: number }[] = [];
  for (const line of rail.lines) {
    line.points.forEach((p, i) => {
      if (line.structure[i] === 'elevated') bumps.push({ x: p.x, y: p.y, h: line.level[i] + RAIL_CLEARANCE });
    });
  }
  const overRail = (x: number, y: number, h: number): number => {
    for (const b of bumps) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < 220) h = Math.max(h, Math.min(b.h, b.h + 0.8 - 0.04 * Math.max(0, d - 16)));
    }
    return h;
  };

  const kind = graph.nodes.map((n) => {
    const cls = n.edges.map((id) => graph.edges[id].cls);
    return cls.includes('highway') ? 'highway' : cls.every((c) => c === 'ramp') ? 'ramp' : 'street';
  });
  const nodes: NodePlane[] = graph.nodes.map((n, i) => {
    if (kind[i] === 'highway') return { h: 0, gx: 0, gy: 0 };
    const bridge = n.edges.some((id) => graph.edges[id].bridge && !elevated(graph.edges[id]));
    const h = ground(t, n.x, n.y);
    if (bridge) return { h: Math.max(h, DECK_HEIGHT), gx: 0, gy: 0 };
    let gx = (ground(t, n.x + 10, n.y) - ground(t, n.x - 10, n.y)) / 20;
    let gy = (ground(t, n.x, n.y + 10) - ground(t, n.x, n.y - 10)) / 20;
    const g = Math.hypot(gx, gy);
    const k = h < MIN_ROAD + 0.6 ? 0 : g > 0.12 ? 0.12 / g : 1;
    gx *= k;
    gy *= k;
    return { h: Math.max(h, MIN_ROAD), gx, gy };
  });
  const fitted: [number, number, number][] = [];
  // On slopes too steep for a street, junctions move up or down until every street between them can make the climb.
  const floor = nodes.map((p) => p.h);
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (const e of graph.edges) {
      if (elevated(e) || e.a === e.b) continue;
      const d = nodes[e.b].h - nodes[e.a].h;
      const most = MAX_GRADE * 0.85 * e.length;
      if (Math.abs(d) <= most) continue;
      const shift = ((Math.abs(d) - most) / 2) * Math.sign(d);
      const water = (i: number): boolean => graph.nodes[i].edges.some((id) => graph.edges[id].bridge) || floor[i] < MIN_ROAD + 0.6;
      // Junctions at the water or on a bridge stay; the other end takes the whole change.
      const [fa, fb] = [water(e.a), water(e.b)];
      if (fa && fb) continue;
      if (!fa) nodes[e.a].h += fb ? shift * 2 : shift;
      if (!fb) nodes[e.b].h -= fa ? shift * 2 : shift;
      moved = true;
    }
    if (!moved) break;
  }

  // Tilt each junction towards its neighbours, so that the streets between two junctions leave both smoothly.
  graph.nodes.forEach((n, i) => {
    const p = nodes[i];
    if (kind[i] !== 'street') return;
    // Junctions at the water or at the end of a bridge stay nearly level.
    const most = n.edges.some((id) => graph.edges[id].bridge) || floor[i] < MIN_ROAD + 0.6 ? 0.04 : 0.14;
    let [axx, axy, ayy, bx, by] = [0.03, 0, 0.03, 0.03 * p.gx, 0.03 * p.gy];
    for (const id of n.edges) {
      const e = graph.edges[id];
      const o = e.a === i ? e.b : e.a;
      if (o === i || elevated(e)) continue;
      const dx = graph.nodes[o].x - n.x;
      const dy = graph.nodes[o].y - n.y;
      const w = 1 / (dx * dx + dy * dy || 1);
      const dh = nodes[o].h - p.h;
      axx += w * dx * dx;
      axy += w * dx * dy;
      ayy += w * dy * dy;
      bx += w * dx * dh;
      by += w * dy * dh;
    }
    const det = axx * ayy - axy * axy;
    let gx = (bx * ayy - by * axy) / det;
    let gy = (by * axx - bx * axy) / det;
    const g = Math.hypot(gx, gy);
    if (g > most) [gx, gy] = [(gx * most) / g, (gy * most) / g];
    fitted.push([i, gx, gy]);
  });
  for (const [i, gx, gy] of fitted) [nodes[i].gx, nodes[i].gy] = [gx, gy];

  const edges: EdgeLevel[] = new Array(graph.edges.length);
  for (const e of graph.edges) if (!elevated(e)) edges[e.id] = edgeLevel(e);
  // The freeway also clears every street that passes below it.
  for (const c of graph.crossings) {
    if (graph.edges[c.highway].cls !== 'highway') continue;
    const lv = edges[c.street];
    let best = Infinity;
    let h = 0;
    lv.pts.forEach((p, i) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < best) {
        best = d;
        h = lv.h[i];
      }
    });
    bumps.push({ x: c.x, y: c.y, h: h + STREET_CLEARANCE });
  }
  graph.nodes.forEach((n, i) => {
    if (kind[i] === 'highway') nodes[i].h = overRail(n.x, n.y, Math.max(0, ground(t, n.x, n.y, 30)) + HIGHWAY_LIFT);
  });
  // Nodes between two ramps hang between their neighbours.
  for (let it = 0; it < 40; it++) {
    graph.nodes.forEach((n, i) => {
      if (kind[i] !== 'ramp') return;
      let sum = 0;
      let w = 0;
      for (const id of n.edges) {
        const e = graph.edges[id];
        const o = e.a === i ? e.b : e.a;
        sum += nodes[o].h / e.length;
        w += 1 / e.length;
      }
      if (w) nodes[i].h = Math.max(sum / w, ground(t, n.x, n.y) + 0.3, MIN_ROAD + 1);
      // Still beside the freeway it came from: at deck level.
      for (const id of n.edges) {
        const e = graph.edges[id];
        const o = e.a === i ? e.b : e.a;
        if (kind[o] === 'highway' && Math.hypot(graph.nodes[o].x - n.x, graph.nodes[o].y - n.y) < RAMP_CLEAR + 12) nodes[i].h = nodes[o].h;
      }
    });
  }

  function edgeLevel(e: RoadEdge): EdgeLevel {
    const pts = resample(e.points, STEP);
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = s[s.length - 1] || 1;
    const g = pts.map((p) => heightAt(t, p.x, p.y));
    const a = graph.nodes[e.a];
    const b = graph.nodes[e.b];
    const ha = nodes[e.a].h;
    const hb = nodes[e.b].h;
    let h: number[];
    if (e.cls === 'highway') {
      let base = pts.map((p) => Math.max(0, ground(t, p.x, p.y, 30)) + HIGHWAY_LIFT);
      for (let k = 0; k < 30; k++) base = base.map((v, i) => (i === 0 || i === base.length - 1 ? v : 0.25 * base[i - 1] + 0.5 * v + 0.25 * base[i + 1]));
      const da = ha - overRail(a.x, a.y, base[0]);
      const db = hb - overRail(b.x, b.y, base[base.length - 1]);
      h = base.map((v, i) => overRail(pts[i].x, pts[i].y, v) + mix(da, db, s[i] / L));
    } else if (e.cls === 'ramp') {
      // Level for the last stretch before a street junction; a steady grade in between.
      const flat = (n: number): number => (kind[n] === 'street' ? Math.min(20, 0.25 * L) : 0);
      const [fa, fb] = [flat(e.a), flat(e.b)];
      h = pts.map((_, i) => Math.max(mix(ha, hb, clamp((s[i] - fa) / (L - fa - fb), 0, 1)), Math.min(g[i] + 0.3, Math.max(ha, hb))));
    } else if (e.bridge) {
      h = pts.map((_, i) => mix(ha, hb, s[i] / L));
    } else {
      let base = pts.map((p) => Math.max(ground(t, p.x, p.y), MIN_ROAD));
      for (let k = 0; k < 4; k++) base = base.map((v, i) => (i === 0 || i === base.length - 1 ? v : 0.25 * base[i - 1] + 0.5 * v + 0.25 * base[i + 1]));
      // Meet the junction planes at both ends.
      const pa = base[0] - planeAt(a, nodes[e.a], pts[0].x, pts[0].y);
      const pb = base[base.length - 1] - planeAt(b, nodes[e.b], pts[pts.length - 1].x, pts[pts.length - 1].y);
      h = base.map((v, i) => v - mix(pa, pb, s[i] / L));
      // Close to a junction the street lies in the junction's plane.
      const zone = Math.min(16, 0.3 * L);
      h = h.map((v, i) => (s[i] < zone ? planeAt(a, nodes[e.a], pts[i].x, pts[i].y) : s[i] > L - zone ? planeAt(b, nodes[e.b], pts[i].x, pts[i].y) : v));
      // No steeper than a street can be: cut into the slope or fill instead.
      const lim = Math.max(MAX_GRADE, (Math.abs(h[h.length - 1] - h[0]) / L) * 1.2);
      const [h0, h1] = [h[0], h[h.length - 1]];
      // Stay inside what can be reached from both ends, then smooth out what is still too steep.
      h = h.map((v, i) => clamp(v, Math.max(h0 - lim * s[i], h1 - lim * (L - s[i])), Math.min(h0 + lim * s[i], h1 + lim * (L - s[i]))));
      for (let i = 1; i < h.length; i++) h[i] = clamp(h[i], h[i - 1] - lim * (s[i] - s[i - 1]), h[i - 1] + lim * (s[i] - s[i - 1]));
      for (let i = h.length - 2; i >= 0; i--) h[i] = clamp(h[i], h[i + 1] - lim * (s[i + 1] - s[i]), h[i + 1] + lim * (s[i + 1] - s[i]));
    }
    return { pts, s, h, ground: g };
  }

  for (const e of graph.edges) if (elevated(e)) edges[e.id] = edgeLevel(e);

  // A ramp leaves the freeway at deck level: it rides on the deck until the two have separated, then comes down.
  for (const e of graph.edges) {
    if (e.cls !== 'ramp') continue;
    const lv = edges[e.id];
    const n = lv.pts.length;
    const L = lv.s[n - 1] || 1;
    for (const end of [e.a, e.b]) {
      if (kind[end] !== 'highway') continue;
      const hw = graph.nodes[end].edges.filter((id) => graph.edges[id].cls === 'highway');
      const at = (k: number): number => (end === e.a ? k : n - 1 - k);
      const deck = (p: Vec2): { d: number; h: number } => {
        let best = { d: Infinity, h: 0 };
        for (const id of hw) {
          const o = edges[id];
          for (let k = 0; k < o.pts.length; k++) {
            const d = Math.hypot(o.pts[k].x - p.x, o.pts[k].y - p.y);
            if (d < best.d) best = { d, h: o.h[k] };
          }
        }
        return best;
      };
      let sep = 0;
      while (sep < n - 2 && deck(lv.pts[at(sep)]).d < RAMP_CLEAR) sep++;
      const other = end === e.a ? e.b : e.a;
      const tail = kind[other] === 'street' ? Math.min(20, 0.25 * L) : 0;
      // Stay up until past any street that goes under the ramp.
      for (const c of graph.crossings) {
        if (c.highway !== e.id) continue;
        let k = 0;
        for (let j = 1; j < n; j++) if (Math.hypot(lv.pts[at(j)].x - c.x, lv.pts[at(j)].y - c.y) < Math.hypot(lv.pts[at(k)].x - c.x, lv.pts[at(k)].y - c.y)) k = j;
        sep = Math.max(sep, Math.min(n - 3, k + 3));
      }
      const s0 = Math.abs(lv.s[at(sep)] - lv.s[at(0)]);
      const hs = deck(lv.pts[at(Math.min(sep, n - 1))]).h;
      for (let k = 0; k < n; k++) {
        const i = at(k);
        const sk = Math.abs(lv.s[i] - lv.s[at(0)]);
        if (k <= sep) lv.h[i] = deck(lv.pts[i]).d < RAMP_CLEAR + 30 ? deck(lv.pts[i]).h : hs;
        else lv.h[i] = Math.max(mix(hs, nodes[other].h, clamp((sk - s0) / Math.max(1, L - tail - s0), 0, 1)), Math.min(lv.ground[i] + 0.3, hs));
      }
    }
  }
  return { nodes, edges };
}

/** Road surface height at distance s along an edge. */
export function levelAt(lv: EdgeLevel, s: number): number {
  const n = lv.s.length;
  if (s <= 0) return lv.h[0];
  if (s >= lv.s[n - 1]) return lv.h[n - 1];
  let i = clamp(Math.floor((s / lv.s[n - 1]) * (n - 1)), 0, n - 2);
  while (i > 0 && lv.s[i] > s) i--;
  while (i < n - 2 && lv.s[i + 1] < s) i++;
  return mix(lv.h[i], lv.h[i + 1], (s - lv.s[i]) / (lv.s[i + 1] - lv.s[i] || 1));
}
