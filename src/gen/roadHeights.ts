import { resample } from '../core/geom';
import { Vec2, clamp, mix, smoothstep } from '../core/vec2';
import { Rail } from './rail';
import { RoadEdge, RoadGraph, RoadNode } from './roadGraph';
import { Terrain, heightAt } from './terrain';

/** Height of a freeway deck above the ground it crosses. */
export const HIGHWAY_LIFT = 6.2;
/** Lowest bridge deck above the water. */
export const DECK_HEIGHT = 5;
/** Lowest road surface next to water. */
const MIN_ROAD = 0.9;
/** Above this height over the ground a road stands on a structure instead of the ground. */
export const STRUCTURE_ABOVE = 2.2;
const RAIL_CLEARANCE = 7;
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
    if (kind[i] === 'highway') return { h: overRail(n.x, n.y, Math.max(0, ground(t, n.x, n.y, 30)) + HIGHWAY_LIFT), gx: 0, gy: 0 };
    const bridge = n.edges.some((id) => graph.edges[id].bridge && !elevated(graph.edges[id]));
    const h = ground(t, n.x, n.y);
    if (bridge) return { h: Math.max(h, DECK_HEIGHT), gx: 0, gy: 0 };
    let gx = (ground(t, n.x + 10, n.y) - ground(t, n.x - 10, n.y)) / 20;
    let gy = (ground(t, n.x, n.y + 10) - ground(t, n.x, n.y - 10)) / 20;
    const g = Math.hypot(gx, gy);
    const k = h < MIN_ROAD + 0.6 ? 0 : g > 0.07 ? 0.07 / g : 1;
    gx *= k;
    gy *= k;
    return { h: Math.max(h, MIN_ROAD), gx, gy };
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
    });
  }

  const edges: EdgeLevel[] = graph.edges.map((e) => {
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
      h = pts.map((p, i) => Math.max(mix(ha, hb, smoothstep(0, 1, s[i] / L)), Math.min(g[i] + 0.3, Math.max(ha, hb))));
    } else if (e.bridge) {
      h = pts.map((_, i) => mix(ha, hb, s[i] / L));
    } else {
      let base = pts.map((p) => Math.max(ground(t, p.x, p.y), MIN_ROAD));
      for (let k = 0; k < 4; k++) base = base.map((v, i) => (i === 0 || i === base.length - 1 ? v : 0.25 * base[i - 1] + 0.5 * v + 0.25 * base[i + 1]));
      // Meet the junction planes at both ends.
      const pa = base[0] - planeAt(a, nodes[e.a], pts[0].x, pts[0].y);
      const pb = base[base.length - 1] - planeAt(b, nodes[e.b], pts[pts.length - 1].x, pts[pts.length - 1].y);
      h = base.map((v, i) => v - mix(pa, pb, s[i] / L));
    }
    return { pts, s, h, ground: g };
  });

  // A ramp leaves the freeway at deck level: it follows the deck until the two have separated.
  for (const e of graph.edges) {
    if (e.cls !== 'ramp') continue;
    const lv = edges[e.id];
    for (const end of [e.a, e.b]) {
      if (kind[end] !== 'highway') continue;
      const hw = graph.nodes[end].edges.filter((id) => graph.edges[id].cls === 'highway');
      lv.pts.forEach((p, i) => {
        let best = Infinity;
        let hh = 0;
        for (const id of hw) {
          const o = edges[id];
          for (let k = 0; k < o.pts.length; k++) {
            const d = Math.hypot(o.pts[k].x - p.x, o.pts[k].y - p.y);
            if (d < best) {
              best = d;
              hh = o.h[k];
            }
          }
        }
        const w = smoothstep(20, 46, best);
        if (w < 1) lv.h[i] = mix(hh, lv.h[i], w);
      });
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
