import { layout } from '../assets/mesh/section';
import { Vec2 } from '../core/vec2';
import { districtAt } from '../gen/districts';
import { LandUse, Lot } from '../gen/landuse';
import { FREE, LOT, RAIL, ROAD, Site, SiteItem, USED, WATER, along, facing, hash, pick } from './site';
import { Waterfront } from './waterfront';

export interface FencedLot {
  lot: number;
  use: LandUse;
  model: string;
  /** Middle of the opening left in the frontage, and its width; null where the whole frontage is open. */
  gate: { x: number; y: number; width: number; model: string | null } | null;
  panels: number;
}

export interface GuardRun {
  kind: 'drop' | 'water' | 'cliff';
  pts: Vec2[];
  edge?: number;
}

export interface Boundaries {
  lots: FencedLot[];
  runs: GuardRun[];
  /** Panels left out because the neighbouring lot fences the shared line. */
  shared: number;
}

/** Fence that a kind of lot stands behind whatever is built on it; the other uses get theirs with their buildings. */
const FENCED: Partial<Record<LandUse, true>> = { I1: true, I2: true, PK: true, OS: true };
const PANEL = 12;
/** How far a fence may climb over one panel before it is broken into level steps, and the length of a step. */
const RAKE = 0.05;
const STEP = 2.4;
/** Height a road stands above the ground beside it before it gets a guard rail. */
const DROP = 1.6;

/**
 * Fences, walls and rails on the lines between one kind of ground and another: round yards, car parks and vacant lots,
 * along roads that run above a drop or beside water, and along the top of the rocks on the shore.
 */
export function placeBoundaries(site: Site, shore: Waterfront): Boundaries {
  const { city, roads } = site;
  const t = city.terrain;
  const land = city.land;
  const seed = site.seed;
  const rnd = (...v: number[]): number => hash(seed, 9107, ...v);
  const out: Boundaries = { lots: [], runs: [], shared: 0 };
  const lotAt = (x: number, y: number): Lot | null => {
    const [i, j] = [Math.floor(x / land.cell), Math.floor(y / land.cell)];
    if (i < 0 || j < 0 || i >= land.n || j >= land.n) return null;
    const id = land.grid[j * land.n + i];
    return id > 0 ? land.lots[id - 1] : null;
  };

  /** One 12 m panel between two points: raked to the ground, or in level steps where the ground is too steep to rake. */
  const panel = (model: string, kind: SiteItem['kind'], p: Vec2, q: Vec2): void => {
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    if (l < 0.8) return;
    const [h0, h1] = [site.heightAt(p.x, p.y), site.heightAt(q.x, q.y)];
    const yaw = along({ x: q.x - p.x, y: q.y - p.y });
    const steps = Math.abs(h1 - h0) / l > RAKE ? Math.max(1, Math.round(l / STEP)) : 1;
    for (let k = 0; k < steps; k++) {
      const [u0, u1] = [k / steps, (k + 1) / steps];
      const m = (u0 + u1) / 2;
      // A step stands level at the height of its lower end.
      const h = steps === 1 ? (h0 + h1) / 2 : Math.min(h0 + (h1 - h0) * u0, h0 + (h1 - h0) * u1);
      site.set(model, kind, p.x + (q.x - p.x) * m, p.y + (q.y - p.y) * m, h, yaw, { stretch: l / steps / PANEL, slopeX: steps === 1 ? (h1 - h0) / l : 0 });
    }
  };

  // --- Lots ---
  const fencedIds = new Set<number>();
  const junctionNear = (p: Vec2, r: number): boolean => roads.junctions.some((j) => Math.abs(j.x - p.x) < r + 30 && Math.hypot(j.x - p.x, j.y - p.y) < r + 12);
  for (const lot of land.lots) {
    if (!FENCED[lot.use] || lot.poly.length < 3 || lot.area < 150) continue;
    const type = districtAt(t, city.districts, lot.poly[0].x, lot.poly[0].y).type;
    // Open land is only fenced where it is a vacant lot in town: small, level, and not every one.
    if (lot.use === 'OS' && (lot.area > 3500 || lot.site.slope > 0.06 || type === 'hills' || type === 'suburb' || rnd(1, lot.id) < 0.45)) continue;
    const u = rnd(2, lot.id);
    const model =
      lot.use === 'PK' ? (u < 0.6 ? 'boundary/knee-rail' : u < 0.85 ? 'boundary/knee-rail-diamond' : 'boundary/bollard-chain')
      : lot.use === 'OS' ? (u < 0.55 ? 'boundary/chainlink-rusty' : u < 0.8 ? 'boundary/chainlink-screen-green' : 'boundary/chainlink-1800')
      : u < 0.1 ? 'boundary/chainlink-rusty'
      : lot.use === 'I2' ? (u < 0.5 ? 'boundary/chainlink-razor' : u < 0.75 ? 'boundary/bars-razor' : 'boundary/chainlink-barbed')
      : u < 0.55 ? 'boundary/chainlink-barbed' : u < 0.8 ? 'boundary/chainlink-barbed-v' : 'boundary/chainlink-slats-grey-barbed';
    const low = lot.use === 'PK' ? model : 'boundary/weld-low';
    const c = { x: 0, y: 0 };
    for (const p of lot.poly) {
      c.x += p.x / lot.poly.length;
      c.y += p.y / lot.poly.length;
    }
    // The line of the fence: just inside the lot's edge.
    const ring = lot.poly.map((p) => {
      const d = Math.hypot(c.x - p.x, c.y - p.y) || 1;
      return { x: p.x + ((c.x - p.x) / d) * 0.45, y: p.y + ((c.y - p.y) / d) * 0.45 };
    });
    const rec: FencedLot = { lot: lot.id, use: lot.use, model, gate: null, panels: 0 };
    const before = site.items.length;
    const run = (a: Vec2, b: Vec2, front: boolean, skip?: [number, number]): void => {
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.round(l / PANEL));
      // Outward: away from the middle of the lot.
      let [ox, oy] = [-(b.y - a.y) / l, (b.x - a.x) / l];
      if ((c.x - a.x) * ox + (c.y - a.y) * oy > 0) [ox, oy] = [-ox, -oy];
      for (let k = 0; k < n; k++) {
        const [u0, u1] = [k / n, (k + 1) / n];
        if (skip && u1 * l > skip[0] && u0 * l < skip[1]) continue;
        const p = { x: a.x + (b.x - a.x) * u0, y: a.y + (b.y - a.y) * u0 };
        const q = { x: a.x + (b.x - a.x) * u1, y: a.y + (b.y - a.y) * u1 };
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const here = site.at(m.x, m.y);
        // The frontage runs along the back of the pavement, inside the margin kept round the road.
        if (here === WATER || here === RAIL || (!front && here === ROAD)) continue;
        if (!front) {
          // The track has its own fence, and of two fenced lots the one with the lower number owns the line between them.
          if (site.at(m.x + ox * 4, m.y + oy * 4) === RAIL) continue;
          let owned = false;
          for (const f of [0.5, 0.2, 0.8])
            for (const d of [1.6, 3]) {
              const next = lotAt(p.x + (q.x - p.x) * f + ox * d, p.y + (q.y - p.y) * f + oy * d);
              owned ||= !!next && next.id < lot.id && fenced.has(next.id);
            }
          if (owned) {
            out.shared++;
            continue;
          }
        }
        const water = site.at(m.x + ox * 5, m.y + oy * 5) === WATER;
        // Nothing taller than a driver's eye line near a corner.
        const sight = front && junctionNear(m, 14);
        panel(sight ? low : !front && water && lot.use !== 'PK' ? 'boundary/chainlink-rusty' : model, 'fence', p, q);
      }
    };
    const fenced = fencedIds;
    fenced.add(lot.id);
    const nf = Math.max(2, Math.min(lot.front, ring.length));
    // The frontage, with the way in at its middle.
    let fl = 0;
    for (let i = 1; i < nf; i++) fl += Math.hypot(ring[i].x - ring[i - 1].x, ring[i].y - ring[i - 1].y);
    const gateW = lot.use === 'PK' ? 7 : PANEL;
    const open = fl < gateW + 8;
    if (!open) {
      const [g0, g1] = [fl / 2 - gateW / 2, fl / 2 + gateW / 2];
      let s = 0;
      for (let i = 1; i < nf; i++) {
        const [a, b] = [ring[i - 1], ring[i]];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l < 0.5) continue;
        // The gate takes the place of whole panels, so the opening is fitted to the panel grid of its segment.
        const n = Math.max(1, Math.round(l / PANEL));
        const k0 = Math.max(0, Math.min(n - 1, Math.floor(((g0 + g1) / 2 - s) / (l / n))));
        const inSeg = (g0 + g1) / 2 >= s && (g0 + g1) / 2 < s + l;
        if (inSeg) {
          const [u0, u1] = [k0 / n, (k0 + 1) / n];
          const m = { x: a.x + (b.x - a.x) * (u0 + u1) / 2, y: a.y + (b.y - a.y) * (u0 + u1) / 2 };
          run(a, b, true, [u0 * l + 0.01, u1 * l - 0.01]);
          const gate = lot.use === 'PK' ? null : lot.use === 'OS' ? 'boundary/gate-chainlink-open' : 'boundary/gate-chainlink-sliding';
          const yaw = along({ x: b.x - a.x, y: b.y - a.y });
          if (gate) site.set(gate, 'gate', m.x, m.y, site.heightAt(m.x, m.y), yaw, { stretch: l / n / PANEL });
          rec.gate = { x: m.x, y: m.y, width: l / n, model: gate };
          // A gatehouse inside the gate of the bigger works.
          if (lot.use === 'I2' && lot.area > 3000) {
            const d = Math.hypot(c.x - m.x, c.y - m.y) || 1;
            const p = { x: m.x + ((c.x - m.x) / d) * 4 + ((b.x - a.x) / l) * 5, y: m.y + ((c.y - m.y) / d) * 4 + ((b.y - a.y) / l) * 5 };
            if (lotAt(p.x, p.y)?.id === lot.id) site.put('infra/guard-booth', 'gate', p.x, p.y, facing({ x: m.x - c.x, y: m.y - c.y }));
          }
        } else run(a, b, true);
        s += l;
      }
    }
    // The sides and the back.
    for (let i = nf - 1; i < ring.length; i++) {
      const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.8) run(a, b, false);
    }
    rec.panels = site.items.length - before;
    if (rec.panels) out.lots.push(rec);
  }

  // --- Roads above a drop, beside water, or under a cut ---
  for (const e of city.graph.edges) {
    const line = roads.lines[e.id];
    if (!line || e.bridge || e.cls === 'highway' || e.cls === 'ramp' || e.cls === 'path' || e.cls === 'alley') continue;
    const lay = layout(roads.sections[e.id]);
    const type = city.districts.list?.[e.district]?.type ?? districtAt(t, city.districts, line[0][0], line[0][2]).type;
    // Stations every panel along the road, clear of the junctions at its ends.
    const st: { x: number; y: number; h: number; tx: number; ty: number }[] = [];
    let total = 0;
    for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][2] - line[i - 1][2]);
    const n = Math.floor((total - 16) / PANEL);
    if (n < 1) continue;
    const start = (total - n * PANEL) / 2;
    let [i, acc] = [1, 0];
    for (let k = 0; k <= n; k++) {
      const s = start + k * PANEL;
      while (i < line.length - 1 && acc + Math.hypot(line[i][0] - line[i - 1][0], line[i][2] - line[i - 1][2]) < s) {
        acc += Math.hypot(line[i][0] - line[i - 1][0], line[i][2] - line[i - 1][2]);
        i++;
      }
      const [a, b] = [line[i - 1], line[i]];
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      const f = Math.max(0, Math.min(1, (s - acc) / l));
      st.push({ x: a[0] + (b[0] - a[0]) * f, y: a[2] + (b[2] - a[2]) * f, h: a[1] + (b[1] - a[1]) * f, tx: (b[0] - a[0]) / l, ty: (b[2] - a[2]) / l });
    }
    for (const side of [1, -1]) {
      const edge = side > 0 ? lay.outer[1] : -lay.outer[0];
      const at = (q: (typeof st)[number], d: number): Vec2 => ({ x: q.x - q.ty * side * (edge + d), y: q.y + q.tx * side * (edge + d) });
      /** What the ground beyond the road's edge does at a station. */
      const need = (q: (typeof st)[number]): GuardRun['kind'] | null => {
        const near = at(q, 3);
        const code = site.at(near.x, near.y);
        if (code === WATER || site.at(at(q, 6).x, at(q, 6).y) === WATER) return 'water';
        if (code !== FREE && code !== USED) return null;
        const g = site.heightAt(at(q, 7).x, at(q, 7).y);
        if (site.at(at(q, 7).x, at(q, 7).y) === ROAD || site.at(at(q, 7).x, at(q, 7).y) === RAIL) return null;
        return q.h - g > DROP ? 'drop' : null;
      };
      const needs = st.map(need);
      let k = 0;
      while (k < n) {
        const kind = needs[k];
        if (!kind || needs[k + 1] !== kind) {
          k++;
          continue;
        }
        let end = k + 1;
        while (end < n && needs[end + 1] === kind) end++;
        const off = 0.35;
        const pts = st.slice(k, end + 1).map((q) => at(q, off));
        const u = rnd(3, e.id, side, k);
        const model = kind === 'water' ? (e.cls === 'arterial' ? 'boundary/guardrail-box-beam' : 'boundary/guardrail-pipe')
          : type === 'hills' || type === 'suburb' ? (u < 0.5 ? 'boundary/guardrail-w-wood' : u < 0.8 ? 'boundary/guardrail-timber' : 'boundary/guardrail-w-corten')
          : u < 0.1 ? 'boundary/guardrail-w-rusty' : 'boundary/guardrail-w-steel';
        for (let q = 1; q < pts.length; q++) {
          // Rails face the traffic.
          const [p0, p1] = side < 0 ? [pts[q - 1], pts[q]] : [pts[q], pts[q - 1]];
          const [h0, h1] = side < 0 ? [st[k + q - 1].h, st[k + q].h] : [st[k + q].h, st[k + q - 1].h];
          const l = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
          const worn = kind === 'drop' && rnd(5, e.id, side, k + q) < 0.03 ? 'boundary/guardrail-w-damaged' : model;
          site.set(worn, 'guardrail', (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (h0 + h1) / 2 + 0.12, along({ x: p1.x - p0.x, y: p1.y - p0.y }), { stretch: l / PANEL, slopeX: (h1 - h0) / l });
        }
        for (const p of pts) site.stampDisc(p.x, p.y, 1.2, USED, FREE);
        out.runs.push({ kind, pts, edge: e.id });
        k = end + 1;
      }
    }
  }

  // --- The top of the rocks along the shore ---
  for (const r of shore.reaches) {
    if (r.kind !== 'rocky') continue;
    const stations = shore.coasts[r.coast];
    const model = pick(['boundary/post-rope', 'boundary/tube-rail-2', 'boundary/ped-rail-cable', 'boundary/guardrail-timber'], rnd(6, r.from));
    let run: Vec2[] = [];
    const flush = (): void => {
      if (run.length >= 4) {
        site.panels(model, 'fence', run);
        out.runs.push({ kind: 'cliff', pts: run });
        const m = run[run.length >> 1];
        const st = stations[r.from];
        const p = { x: m.x - st.nx * 2.2, y: m.y - st.ny * 2.2 };
        if (site.all(p.x, p.y, 1.2, FREE)) {
          site.stampDisc(p.x, p.y, 1.2, USED, FREE);
          site.put('furniture/bench-park', 'bench', p.x, p.y, facing({ x: st.nx, y: st.ny }));
        }
      }
      run = [];
    };
    for (let i = r.from; i <= r.to; i += 2) {
      const st = stations[i];
      let top = -1;
      for (let d = 2; d <= 18 && top < 0; d += 2) if (site.heightAt(st.x - st.nx * d, st.y - st.ny * d) >= 3) top = d;
      const p = top < 0 ? null : { x: st.x - st.nx * (top + 1.5), y: st.y - st.ny * (top + 1.5) };
      const last = run[run.length - 1];
      if (!p || !site.all(p.x, p.y, 0.8, FREE) || (last && Math.hypot(p.x - last.x, p.y - last.y) > 16)) flush();
      if (p && site.all(p.x, p.y, 0.8, FREE)) run.push(p);
    }
    flush();
  }
  void LOT;
  return out;
}
