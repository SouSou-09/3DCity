import { Rng } from '../core/rng';
import { catmullRom, cubicBezier, pointAt, polyLength, resample, segSeg, SegmentIndex } from '../core/geom';
import { Vec2, addScaled, angleDiff, clamp, dist, dot, norm, perp, sub } from '../core/vec2';
import { Districts } from './districts';
import { RoadBuilder } from './streamlines';
import { Terrain, hillAt, inBounds, isWater, seaDistAt } from './terrain';

export interface Highways {
  /** Runs roughly parallel to the coast, behind downtown. */
  main: Vec2[];
  /** Splits off the main freeway and heads for the port. */
  branch: Vec2[] | null;
  /** Arc length along `main` where the branch leaves. */
  branchS: number;
}

function clipToBounds(t: Terrain, pts: Vec2[], anchor: number): Vec2[] {
  let i0 = anchor;
  let i1 = anchor;
  while (i0 > 0 && inBounds(t, pts[i0 - 1].x, pts[i0 - 1].y)) i0--;
  while (i1 < pts.length - 1 && inBounds(t, pts[i1 + 1].x, pts[i1 + 1].y)) i1++;
  const out = pts.slice(i0, i1 + 1);
  const edge = (p: Vec2): Vec2 => ({ x: clamp(p.x, 0, t.size), y: clamp(p.y, 0, t.size) });
  if (i0 > 0) out.unshift(edge(pts[i0 - 1]));
  if (i1 < pts.length - 1) out.push(edge(pts[i1 + 1]));
  return out;
}

function nearestIndex(pts: Vec2[], p: Vec2): number {
  let bi = 0;
  let bd = Infinity;
  pts.forEach((q, i) => {
    const d = dist(p, q);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}

export function generateHighways(t: Terrain, districts: Districts, rng: Rng): Highways {
  const S = t.size;
  const dt = districts.downtown.center;
  let off = rng.range(0.11, 0.16) * S;
  let pm = addScaled(dt, t.inland, off);
  while (hillAt(t, pm.x, pm.y) > 0.3 && off > 0.06 * S) {
    off -= 0.02 * S;
    pm = addScaled(dt, t.inland, off);
  }
  const sd0 = seaDistAt(t, pm.x, pm.y);
  const wps: Vec2[] = [];
  for (let k = -4; k <= 4; k++) {
    let p = addScaled(pm, t.along, k * 0.22 * S);
    // Loosely follow the shape of the coast, stay out of the hills and off the beach.
    p = addScaled(p, t.inland, clamp((sd0 - seaDistAt(t, p.x, p.y)) * 0.5, -0.15 * S, 0.15 * S));
    p = addScaled(p, t.inland, rng.range(-0.05, 0.05) * S * Math.min(1, Math.abs(k)));
    for (let i = 0; i < 6 && hillAt(t, p.x, p.y) > 0.45; i++) p = addScaled(p, t.inland, -0.04 * S);
    const sd = seaDistAt(t, p.x, p.y);
    if (sd < 160) p = addScaled(p, t.inland, 160 - sd);
    wps.push(p);
  }
  const curve = resample(catmullRom(wps, 24), 10);
  const main = clipToBounds(t, curve, nearestIndex(curve, pm));

  // Branch towards the port / industrial area.
  let branch: Vec2[] | null = null;
  let branchS = 0;
  const targets = districts.list
    .filter((d) => d.type === 'industrial')
    .sort((a, b) => seaDistAt(t, a.center.x, a.center.y) - seaDistAt(t, b.center.x, b.center.y));
  if (targets.length) {
    const target = targets[0].center;
    const total = polyLength(main);
    const sMid = nearestIndex(main, pm) * 10;
    // Leave the main line well before the point closest to the target, so the branch peels off at a shallow angle.
    let nearS = 0;
    let nearD = Infinity;
    for (let s = 0; s <= total; s += 20) {
      const d = dist(pointAt(main, s).p, target);
      if (d < nearD) {
        nearD = d;
        nearS = s;
      }
    }
    let bestS = -1;
    let bestD = Infinity;
    if (nearD > 230) {
      const lead = nearD * rng.range(0.9, 1.3);
      const options = [nearS - lead, nearS + lead].filter((s) => s > 160 && s < total - 160 && Math.abs(s - sMid) > 0.16 * S);
      if (options.length) {
        bestS = rng.pick(options);
        bestD = dist(pointAt(main, bestS).p, target);
      }
    }
    if (bestS >= 0 && bestD > 320) {
      const at = pointAt(main, bestS);
      const b0 = at.p;
      const toTarget = sub(target, b0);
      const dirSign = dot(at.tan, toTarget) >= 0 ? 1 : -1;
      const tan = { x: at.tan.x * dirSign, y: at.tan.y * dirSign };
      let side = perp(tan);
      if (dot(side, toTarget) < 0) side = { x: -side.x, y: -side.y };
      const ghost = addScaled(b0, tan, -120);
      const b1 = addScaled(addScaled(b0, tan, 130), side, 24);
      const b2 = addScaled(addScaled(b0, tan, 250), side, 95);
      const mid = addScaled(
        { x: (b2.x + target.x) / 2, y: (b2.y + target.y) / 2 },
        perp(norm(sub(target, b2))),
        rng.range(-0.04, 0.04) * S,
      );
      const pts = dist(b2, target) > 260 ? [ghost, b0, b1, b2, mid, target] : [ghost, b0, b1, target];
      const curveB = resample(catmullRom(pts, 24).slice(24), 10);
      const out: Vec2[] = [];
      for (const p of curveB) {
        if (!inBounds(t, p.x, p.y, 20) || seaDistAt(t, p.x, p.y) < 60) break;
        out.push(p);
      }
      let maxTurn = 0;
      for (let i = 2; i < out.length; i++) {
        const a1 = Math.atan2(out[i - 1].y - out[i - 2].y, out[i - 1].x - out[i - 2].x);
        const a2 = Math.atan2(out[i].y - out[i - 1].y, out[i].x - out[i - 1].x);
        maxTurn = Math.max(maxTurn, angleDiff(a1, a2));
      }
      // Freeways do not make tight turns (10 m samples: 0.09 rad = 110 m radius).
      if (out.length > 35 && maxTurn < 0.09) {
        out[0] = b0;
        branch = out;
        branchS = bestS;
      }
    }
  }
  return { main, branch, branchS };
}

interface Crossing {
  s: number;
  line: number;
  sA: number;
  p: Vec2;
}

const RAMP_LENGTH = 115;
const RAMP_OFFSET = 48;
const INTERCHANGE_SPACING = 380;

/** Diamond interchanges where arterials cross a freeway. */
export function addRamps(builder: RoadBuilder, hwIds: number[], forbidden: { line: number; s: number }[]): number {
  const t = builder.terrain;
  const arterials = new SegmentIndex(80);
  const cum = new Map<number, number[]>();
  const cumOf = (id: number): number[] => {
    let c = cum.get(id);
    if (!c) {
      const pts = builder.lines[id].points;
      c = [0];
      for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
      cum.set(id, c);
    }
    return c;
  };
  builder.lines.forEach((l, id) => {
    if (l.cls === 'arterial') arterials.addLine(id, l.points);
  });

  let count = 0;
  for (const hid of hwIds) {
    const hw = builder.lines[hid].points;
    const hc = cumOf(hid);
    const total = hc[hc.length - 1];
    const crossings: Crossing[] = [];
    for (let i = 1; i < hw.length; i++) {
      const a = hw[i - 1];
      const b = hw[i];
      arterials.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (r) => {
        const h = segSeg(a, b, r.a, r.b);
        if (!h) return;
        crossings.push({ s: hc[i - 1] + h.t * (hc[i] - hc[i - 1]), line: r.line, sA: cumOf(r.line)[r.seg] + h.u * dist(r.a, r.b), p: { x: h.x, y: h.y } });
      });
    }
    crossings.sort((p, q) => p.s - q.s);
    let last = -Infinity;
    for (const c of crossings) {
      if (c.s - last < INTERCHANGE_SPACING) continue;
      if (c.s < RAMP_LENGTH + 40 || c.s > total - RAMP_LENGTH - 40) continue;
      if (forbidden.some((f) => f.line === hid && Math.abs(f.s - c.s) < 240)) continue;
      const art = builder.lines[c.line].points;
      const artLen = cumOf(c.line)[art.length - 1];
      const tf = pointAt(hw, c.s).tan;
      const ta = pointAt(art, c.sA).tan;
      const nf = perp(tf);
      const lateral = dot(ta, nf);
      if (Math.abs(lateral) < 0.8) continue;
      const along = RAMP_OFFSET / Math.abs(lateral);
      if (c.sA < along + 15 || c.sA > artLen - along - 15) continue;
      const ramps: Vec2[][] = [];
      let ok = true;
      for (const side of [1, -1]) {
        const g = pointAt(art, c.sA + side * Math.sign(lateral) * along).p;
        if (isWater(t, g.x, g.y)) ok = false;
        for (const sf of [1, -1]) {
          const f = pointAt(hw, c.s + sf * RAMP_LENGTH).p;
          const toX = { x: -tf.x * sf, y: -tf.y * sf };
          const p1 = addScaled(addScaled(f, toX, RAMP_LENGTH * 0.5), nf, side * 6);
          const p2 = addScaled(g, toX, -RAMP_LENGTH * 0.3);
          const pts = cubicBezier(f, p1, p2, g, 14);
          pts[0] = f;
          pts[pts.length - 1] = g;
          ramps.push(pts);
        }
      }
      if (!ok) continue;
      for (const pts of ramps) builder.addLine({ points: pts, cls: 'ramp', family: -1, ends: ['fixed', 'fixed'] });
      last = c.s;
      count++;
    }
  }
  return count;
}
