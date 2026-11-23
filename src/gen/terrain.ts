import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { pointSeg, resample } from '../core/geom';
import { Vec2, clamp, fromAngle, mix, perp, smoothstep } from '../core/vec2';

export interface Terrain {
  size: number;
  cell: number;
  /** Samples per side; grids are n*n, index = j*n + i. */
  n: number;
  /** Metres above sea level. */
  height: Float32Array;
  /** Signed distance to the sea shore in metres (positive on land). */
  seaDist: Float32Array;
  /** Signed distance to the river bank in metres (negative inside the river). */
  riverBank: Float32Array;
  /** 0..1 hill mask. */
  hill: Float32Array;
  river: Vec2[];
  /** Tributaries, each running from where it joins the river up towards its source. */
  streams: Vec2[][];
  /** Unit vector pointing from the sea towards the hills. */
  inland: Vec2;
  /** Unit vector along the coast. */
  along: Vec2;
}

export const TERRAIN_CELL = 8;
/** Map side the generator was first tuned for. Feature sizes in metres are tied to it, so a bigger map gets more features instead of stretched ones. */
export const REF_SIZE = 2400;
/** Height of made ground at the shore, above which the plain rises only gently, metres. */
export const FILL_HEIGHT = 2.6;
/** The strip along the river that belongs to it: the bank wall, the path on its berm and the embankment, metres from the water. */
export const RIVER_RESERVE = 22;
/** How far from the water the level berm reaches, and its height. */
export const BERM_WIDTH = 13;
export const BERM_HEIGHT = 1.3;
/** Length scale for features that should grow with the map, but slower than the map itself. */
export const featureScale = (size: number): number => REF_SIZE * Math.sqrt(Math.max(1, size / REF_SIZE));

export function sample(t: Terrain, arr: Float32Array, x: number, y: number): number {
  const n = t.n;
  const fx = clamp(x / t.cell, 0, n - 1.001);
  const fy = clamp(y / t.cell, 0, n - 1.001);
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const k = j * n + i;
  const a = arr[k];
  const b = arr[k + 1];
  const c = arr[k + n];
  const d = arr[k + n + 1];
  return a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v;
}

export function gradient(t: Terrain, arr: Float32Array, x: number, y: number, h = t.cell): Vec2 {
  return {
    x: (sample(t, arr, x + h, y) - sample(t, arr, x - h, y)) / (2 * h),
    y: (sample(t, arr, x, y + h) - sample(t, arr, x, y - h)) / (2 * h),
  };
}

export const heightAt = (t: Terrain, x: number, y: number) => sample(t, t.height, x, y);
export const seaDistAt = (t: Terrain, x: number, y: number) => sample(t, t.seaDist, x, y);
export const riverBankAt = (t: Terrain, x: number, y: number) => sample(t, t.riverBank, x, y);
export const hillAt = (t: Terrain, x: number, y: number) => sample(t, t.hill, x, y);
export const waterDistAt = (t: Terrain, x: number, y: number) => Math.min(seaDistAt(t, x, y), riverBankAt(t, x, y));
export const isWater = (t: Terrain, x: number, y: number) => waterDistAt(t, x, y) < 0;
/** Whether a street's centre line would be on the river or on the strip kept for its bank, path and embankment. */
export const onRiverStrip = (t: Terrain, x: number, y: number) => riverBankAt(t, x, y) < RIVER_RESERVE + 6;
export const inBounds = (t: Terrain, x: number, y: number, margin = 0) =>
  x >= margin && y >= margin && x <= t.size - margin && y <= t.size - margin;

/** Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt(inside: Uint8Array, n: number): Float32Array {
  const INF = 1e12;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const vv = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const out = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = inside[i] ? 0 : INF;
  const pass = (get: (q: number) => number, set: (q: number, val: number) => void) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0;
    vv[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = 0;
      for (;;) {
        const p = vv[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k] && k > 0) k--;
        else break;
      }
      k++;
      vv[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const p = vv[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
    for (let q = 0; q < n; q++) set(q, d[q]);
  };
  for (let i = 0; i < n; i++) pass((q) => out[q * n + i], (q, val) => (out[q * n + i] = val));
  for (let j = 0; j < n; j++) pass((q) => out[j * n + q], (q, val) => (out[j * n + q] = val));
  const res = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) res[i] = Math.sqrt(out[i]);
  return res;
}

function blur(arr: Float32Array, n: number): Float32Array {
  const out = new Float32Array(arr.length);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          s += arr[jj * n + ii];
          c++;
        }
      }
      out[j * n + i] = s / c;
    }
  }
  return out;
}

export function generateTerrain(size: number, rng: Rng): Terrain {
  const cell = TERRAIN_CELL;
  const n = Math.round(size / cell) + 1;
  const S = size;
  const noise = new Noise2D(rng.fork('noise'));
  const inland = fromAngle(rng.range(0, Math.PI * 2));
  const along = perp(inland);
  const c = S / 2;

  // Coast: a wavy line with a bay and a headland per REF_SIZE of shore.
  const F = featureScale(S);
  const coves = Math.max(1, Math.round(S / REF_SIZE));
  const bays: { v: number; depth: number; w: number }[] = [];
  const heads: { v: number; depth: number; w: number }[] = [];
  for (let i = 0; i < coves; i++) {
    const slot = ((i + 0.5) / coves - 0.5) * S;
    const v = slot + (rng.range(-0.28, 0.28) * S) / coves;
    bays.push({ v, depth: rng.range(0.07, 0.14) * F, w: rng.range(0.12, 0.2) * F });
    const hv = v + (rng.sign() * rng.range(0.3, 0.45) * S) / coves;
    heads.push({ v: hv, depth: rng.range(0.03, 0.08) * F, w: rng.range(0.1, 0.16) * F });
  }
  const coastBase = -(0.5 * S - (0.5 - rng.range(0.27, 0.33)) * F);
  const hillSide = rng.sign() * rng.range(0.1, 0.3);
  const uv = (x: number, y: number) => ({
    u: (x - c) * inland.x + (y - c) * inland.y,
    v: (x - c) * along.x + (y - c) * along.y,
  });
  const seaRaw = (x: number, y: number): number => {
    const { u, v } = uv(x, y);
    let coastU = coastBase + 0.07 * F * noise.fbm(v / 900 + 10, 3.3, 3) + 0.02 * F * noise.fbm(x / 260, y / 260, 3);
    for (const q of bays) coastU += q.depth * Math.exp(-(((v - q.v) / q.w) ** 2));
    for (const q of heads) coastU -= q.depth * Math.exp(-(((v - q.v) / q.w) ** 2));
    return u - coastU;
  };

  // River: meanders from the hills down to the sea.
  const riverV = rng.sign() * rng.range(0.14, 0.32) * S;
  const base = Math.atan2(-inland.y, -inland.x) + rng.range(-0.3, 0.3);
  const ph1 = rng.range(0, 6.28);
  const ph2 = rng.range(0, 6.28);
  let rp: Vec2 = { x: c + inland.x * 0.78 * S + along.x * riverV, y: c + inland.y * 0.78 * S + along.y * riverV };
  const riverRaw: Vec2[] = [rp];
  for (let s = 0; s < 3.2 * S; s += 15) {
    const a = base + 0.55 * Math.sin(s / 230 + ph1) + 0.3 * Math.sin(s / 97 + ph2);
    rp = { x: rp.x + Math.cos(a) * 15, y: rp.y + Math.sin(a) * 15 };
    riverRaw.push(rp);
    if (seaRaw(rp.x, rp.y) < -80) break;
  }
  const river = resample(riverRaw, 15);
  const mouthHalf = 30 + 10 * (S / REF_SIZE - 1);
  const halfWidth = (frac: number) => mix(14, mouthHalf, frac);

  // Bigger maps get tributaries: each leaves the river at a shallow angle and wanders up into the hills.
  const streams: Vec2[][] = [];
  const sRng = rng.fork('streams');
  for (let i = 0; i < coves - 1; i++) {
    const at = Math.floor(river.length * sRng.range(0.3, 0.55));
    const j = river[at];
    const up = Math.atan2(river[at - 1].y - j.y, river[at - 1].x - j.x);
    const side = uv(j.x, j.y).v > 0 ? -1 : 1;
    const out = Math.atan2(inland.y * 0.8 + along.y * side, inland.x * 0.8 + along.x * side);
    // Start between "upstream" and "towards the open side" so the confluence is a Y, not a T.
    let dir = up + clamp(Math.atan2(Math.sin(out - up), Math.cos(out - up)), -1.1, 1.1) * 0.75;
    const p1 = sRng.range(0, 6.28);
    const p2 = sRng.range(0, 6.28);
    let p = j;
    const raw: Vec2[] = [p];
    for (let d = 0; d < 1.6 * S; d += 15) {
      const pull = Math.atan2(Math.sin(out - dir), Math.cos(out - dir));
      dir += clamp(pull, -0.02, 0.02);
      const a = dir + 0.5 * Math.sin(d / 170 + p1) + 0.25 * Math.sin(d / 71 + p2);
      p = { x: p.x + Math.cos(a) * 15, y: p.y + Math.sin(a) * 15 };
      if (seaRaw(p.x, p.y) < 150) break;
      raw.push(p);
      if (p.x < -60 || p.y < -60 || p.x > S + 60 || p.y > S + 60) break;
    }
    if (raw.length > 30) streams.push(resample(raw, 15));
  }

  const land = new Uint8Array(n * n);
  const water = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const isLand = seaRaw(i * cell, j * cell) >= 0;
      land[j * n + i] = isLand ? 1 : 0;
      water[j * n + i] = isLand ? 0 : 1;
    }
  }
  const dWater = edt(water, n);
  const dLand = edt(land, n);
  let seaDist: Float32Array = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) seaDist[k] = (land[k] ? dWater[k] - 0.5 : -(dLand[k] - 0.5)) * cell;
  seaDist = blur(seaDist, n);

  const riverBank = new Float32Array(n * n);
  const hill = new Float32Array(n * n);
  const height = new Float32Array(n * n);
  const lastSeg = river.length - 1;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * cell;
      const y = j * cell;
      const k = j * n + i;
      let best = Infinity;
      let bestS = 0;
      for (let s = 0; s < lastSeg; s++) {
        const a = river[s];
        // cheap reject
        if (Math.abs(a.x - x) - 16 > best || Math.abs(a.y - y) - 16 > best) continue;
        const r = pointSeg(x, y, a, river[s + 1]);
        if (r.d < best) {
          best = r.d;
          bestS = s + r.t;
        }
      }
      let bank = best - halfWidth(bestS / lastSeg);
      for (const st of streams) {
        let bs = Infinity;
        let bt = 0;
        for (let q = 0; q + 1 < st.length; q++) {
          const a = st[q];
          if (Math.abs(a.x - x) - 16 > bs || Math.abs(a.y - y) - 16 > bs) continue;
          const r = pointSeg(x, y, a, st[q + 1]);
          if (r.d < bs) {
            bs = r.d;
            bt = q + r.t;
          }
        }
        // Widest at the confluence, a brook at the source.
        bank = Math.min(bank, bs - mix(12, 8, bt / (st.length - 1)));
      }
      riverBank[k] = bank;

      const { u, v } = uv(x, y);
      const hm = smoothstep(0.2 * S, 0.46 * S, u + 0.1 * S * noise.fbm(x / 800 + 40, y / 800, 3) + hillSide * v);
      const hl = hm * smoothstep(20, (220 * F) / REF_SIZE, bank);
      hill[k] = hl;

      const sd = seaDist[k];
      // The shore rises to the level of the made ground behind it and no higher.
      let h = clamp(sd * 0.03, -15, FILL_HEIGHT);
      if (sd > 0) {
        // A town's plain is graded land: all but level, with a long, even fall to the sea and to the river.
        h += smoothstep(80, 420, sd) * (1.1 + 0.9 * noise.fbm(x / 1100, y / 1100 + 7, 2));
        const rise = 0.004 * Math.max(0, sd - 250);
        const valley = 0.02 * Math.max(0, bank - RIVER_RESERVE);
        const w = clamp(0.5 + (valley - rise) / 6, 0, 1);
        h += Math.max(0, mix(valley, rise, w) - 3 * w * (1 - w));
        const ridge = 0.5 + 0.5 * noise.fbm(x / 420 + 3, y / 420 + 9, 4);
        h += Math.pow(hl, 1.5) * (25 + 85 * ridge) * (F / REF_SIZE);
        // The river runs in a made channel: a walled bank, a level berm for the path along it, and an
        // embankment up to the town.
        if (bank < RIVER_RESERVE) {
          const berm = Math.min(h, BERM_HEIGHT);
          h = mix(berm, h, smoothstep(BERM_WIDTH, RIVER_RESERVE - 2, bank));
          if (bank < 5) h = mix(bank < -6 ? -2.4 : -1.6, h, smoothstep(-2, 5, bank));
        }
      }
      height[k] = h;
    }
  }

  return { size, cell, n, height, seaDist, riverBank, hill, river, streams, inland, along };
}
