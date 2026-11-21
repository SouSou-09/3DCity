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
  /** Unit vector pointing from the sea towards the hills. */
  inland: Vec2;
  /** Unit vector along the coast. */
  along: Vec2;
}

export const TERRAIN_CELL = 8;

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

  // Coast: a wavy line with one bay and one headland.
  const bayV = rng.range(-0.28, 0.28) * S;
  const bayDepth = rng.range(0.07, 0.14) * S;
  const bayW = rng.range(0.12, 0.2) * S;
  const headV = bayV + rng.sign() * rng.range(0.3, 0.45) * S;
  const headDepth = rng.range(0.03, 0.08) * S;
  const headW = rng.range(0.1, 0.16) * S;
  const coastBase = -rng.range(0.27, 0.33) * S;
  const hillSide = rng.sign() * rng.range(0.1, 0.3);
  const uv = (x: number, y: number) => ({
    u: (x - c) * inland.x + (y - c) * inland.y,
    v: (x - c) * along.x + (y - c) * along.y,
  });
  const seaRaw = (x: number, y: number): number => {
    const { u, v } = uv(x, y);
    const coastU =
      coastBase +
      0.07 * S * noise.fbm(v / 900 + 10, 3.3, 3) +
      bayDepth * Math.exp(-(((v - bayV) / bayW) ** 2)) -
      headDepth * Math.exp(-(((v - headV) / headW) ** 2)) +
      0.02 * S * noise.fbm(x / 260, y / 260, 3);
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
  const halfWidth = (frac: number) => mix(14, 30, frac);

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
      const bank = best - halfWidth(bestS / lastSeg);
      riverBank[k] = bank;

      const { u, v } = uv(x, y);
      const hm = smoothstep(0.2 * S, 0.46 * S, u + 0.1 * S * noise.fbm(x / 800 + 40, y / 800, 3) + hillSide * v);
      const hl = hm * smoothstep(20, 220, bank);
      hill[k] = hl;

      const sd = seaDist[k];
      let h = clamp(sd * 0.03, -15, 3.5);
      if (sd > 0) {
        h += smoothstep(60, 300, sd) * (2.5 + 2.5 * noise.fbm(x / 600, y / 600 + 7, 3));
        h += 0.012 * Math.max(0, sd - 150);
        const ridge = 0.5 + 0.5 * noise.fbm(x / 420 + 3, y / 420 + 9, 4);
        h += Math.pow(hl, 1.5) * (25 + 85 * ridge);
        if (bank < 15) h = mix(-1.5, h, smoothstep(-3, 15, bank));
      }
      height[k] = h;
    }
  }

  return { size, cell, n, height, seaDist, riverBank, hill, river, inland, along };
}
