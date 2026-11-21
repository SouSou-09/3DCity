/**
 * Building blocks for procedural PBR textures. Everything works in metres on plain typed arrays,
 * so textures come out the same in the browser and in Node, at any resolution.
 */

export function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const GX = new Float32Array(16);
const GY = new Float32Array(16);
for (let i = 0; i < 16; i++) {
  GX[i] = Math.cos((i / 16) * Math.PI * 2 + 0.2);
  GY[i] = Math.sin((i / 16) * Math.PI * 2 + 0.2);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Gradient noise in about [-1, 1] that repeats every px, py lattice cells. */
export function pnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const xa = mod(x0, px);
  const xb = mod(x0 + 1, px);
  const ya = mod(y0, py);
  const yb = mod(y0 + 1, py);
  const g00 = (hash2(xa, ya, seed) * 16) | 0;
  const g10 = (hash2(xb, ya, seed) * 16) | 0;
  const g01 = (hash2(xa, yb, seed) * 16) | 0;
  const g11 = (hash2(xb, yb, seed) * 16) | 0;
  const a = GX[g00] * fx + GY[g00] * fy;
  const b = GX[g10] * (fx - 1) + GY[g10] * fy;
  const c = GX[g01] * fx + GY[g01] * (fy - 1);
  const d = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
  return (a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v) * 1.5;
}

export function fbm(x: number, y: number, px: number, py: number, seed: number, octaves: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * pnoise(x * f, y * f, px * f, py * f, seed + o * 31);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

export interface Cell {
  /** Distance to the nearest and second nearest feature point, in lattice cells. */
  f1: number;
  f2: number;
  /** Random value of the nearest feature point. */
  id: number;
}

const CELL: Cell = { f1: 0, f2: 0, id: 0 };

/** Periodic cellular noise. Returns a shared object: read it before the next call. */
export function worley(x: number, y: number, px: number, py: number, seed: number): Cell {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = mod(x0 + i, px);
      const cy = mod(y0 + j, py);
      const dx = x0 + i + hash2(cx, cy, seed) - x;
      const dy = y0 + j + hash2(cx, cy, seed + 7919) - y;
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(cx, cy, seed + 104729);
      } else if (d < f2) f2 = d;
    }
  }
  CELL.f1 = Math.sqrt(f1);
  CELL.f2 = Math.sqrt(f2);
  CELL.id = id;
  return CELL;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function sstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Small deterministic generator for scattering features. */
export class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = (seed * 2654435761) >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export type RGB = readonly [number, number, number];
export const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** One float channel over the texture. */
export type Field = Float32Array;

/**
 * Texture canvas with a physical size. (x, y) are metres, y pointing up (row 0 is v = 0).
 * Drawing wraps around on the axes the texture tiles on.
 */
export class Tex {
  readonly n: number;
  /** Metres per pixel. */
  readonly px: number;
  readonly py: number;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly mw: number,
    readonly mh: number,
    readonly wrapX: boolean,
    readonly wrapY: boolean,
  ) {
    this.n = w * h;
    this.px = mw / w;
    this.py = mh / h;
  }

  field(fill = 0): Field {
    const f = new Float32Array(this.n);
    if (fill) f.fill(fill);
    return f;
  }

  /** Evaluates fn at every pixel centre. */
  map(fn: (x: number, y: number, k: number) => number, into: Field = this.field()): Field {
    let k = 0;
    for (let j = 0; j < this.h; j++) {
      const y = (j + 0.5) * this.py;
      for (let i = 0; i < this.w; i++) into[k] = fn((i + 0.5) * this.px, y, k++);
    }
    return into;
  }

  /** Tileable fbm with features about sx by sy metres. */
  noise(sx: number, sy: number, seed: number, octaves = 1, gain = 0.5): (x: number, y: number) => number {
    const kx = Math.max(1, Math.round(this.mw / sx));
    const ky = Math.max(1, Math.round(this.mh / sy));
    const ax = kx / this.mw;
    const ay = ky / this.mh;
    return octaves === 1 ? (x, y) => pnoise(x * ax, y * ay, kx, ky, seed) : (x, y) => fbm(x * ax, y * ay, kx, ky, seed, octaves, gain);
  }

  /** Tileable cellular noise with cells about `size` metres. Distances come back in cells. */
  cells(size: number, seed: number): (x: number, y: number) => Cell {
    const kx = Math.max(1, Math.round(this.mw / size));
    const ky = Math.max(1, Math.round(this.mh / size));
    const ax = kx / this.mw;
    const ay = ky / this.mh;
    return (x, y) => worley(x * ax, y * ay, kx, ky, seed);
  }

  /** Calls draw once per wrapped copy that can touch the texture. */
  private wrapped(minX: number, minY: number, maxX: number, maxY: number, draw: (ox: number, oy: number) => void): void {
    const xs = this.wrapX ? [-this.mw, 0, this.mw] : [0];
    const ys = this.wrapY ? [-this.mh, 0, this.mh] : [0];
    for (const ox of xs) {
      if (maxX + ox < 0 || minX + ox > this.mw) continue;
      for (const oy of ys) {
        if (maxY + oy < 0 || minY + oy > this.mh) continue;
        draw(ox, oy);
      }
    }
  }

  /**
   * Raises f towards `value` inside a shape given by a signed distance function (negative inside),
   * antialiased over `soft` metres. bbox is in metres.
   */
  sdf(f: Field, minX: number, minY: number, maxX: number, maxY: number, dist: (x: number, y: number) => number, value = 1, soft = 0): void {
    const s = Math.max(soft, (this.px + this.py) * 0.5);
    this.wrapped(minX - s, minY - s, maxX + s, maxY + s, (ox, oy) => {
      const i0 = Math.max(0, Math.floor((minX - s + ox) / this.px));
      const i1 = Math.min(this.w - 1, Math.ceil((maxX + s + ox) / this.px));
      const j0 = Math.max(0, Math.floor((minY - s + oy) / this.py));
      const j1 = Math.min(this.h - 1, Math.ceil((maxY + s + oy) / this.py));
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * this.py - oy;
        for (let i = i0; i <= i1; i++) {
          const d = dist((i + 0.5) * this.px - ox, y);
          if (d >= s * 0.5) continue;
          const c = value * clamp01(0.5 - d / s);
          const k = j * this.w + i;
          if (c > f[k]) f[k] = c;
        }
      }
    });
  }

  rect(f: Field, x0: number, y0: number, x1: number, y1: number, value = 1, soft = 0): void {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hx = (x1 - x0) / 2;
    const hy = (y1 - y0) / 2;
    this.sdf(f, x0, y0, x1, y1, (x, y) => Math.max(Math.abs(x - cx) - hx, Math.abs(y - cy) - hy), value, soft);
  }

  disc(f: Field, cx: number, cy: number, r: number, value = 1, soft = 0): void {
    this.sdf(f, cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) - r, value, soft);
  }

  ring(f: Field, cx: number, cy: number, r: number, half: number, value = 1, soft = 0): void {
    const R = r + half;
    this.sdf(f, cx - R, cy - R, cx + R, cy + R, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - half, value, soft);
  }

  /** Thick polyline with round joins. `half` may vary along the line. */
  stroke(f: Field, pts: readonly (readonly [number, number])[], half: number | ((t: number) => number), value = 1, soft = 0): void {
    const n = pts.length - 1;
    for (let s = 0; s < n; s++) {
      const [ax, ay] = pts[s];
      const [bx, by] = pts[s + 1];
      const r = typeof half === 'number' ? half : Math.max(half(s / n), half((s + 1) / n));
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy || 1e-12;
      const r0 = typeof half === 'number' ? half : half(s / n);
      const r1 = typeof half === 'number' ? half : half((s + 1) / n);
      this.sdf(
        f,
        Math.min(ax, bx) - r,
        Math.min(ay, by) - r,
        Math.max(ax, bx) + r,
        Math.max(ay, by) + r,
        (x, y) => {
          const t = clamp01(((x - ax) * dx + (y - ay) * dy) / l2);
          return Math.hypot(x - ax - dx * t, y - ay - dy * t) - (r0 + (r1 - r0) * t);
        },
        value,
        soft,
      );
    }
  }

  /** Even-odd polygon fill with antialiasing; several contours make holes. */
  poly(f: Field, contours: readonly (readonly (readonly [number, number])[])[], value = 1): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of contours) {
      for (const [x, y] of c) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const SUB = 4;
    this.wrapped(minX, minY, maxX, maxY, (ox, oy) => {
      const j0 = Math.max(0, Math.floor((minY + oy) / this.py));
      const j1 = Math.min(this.h - 1, Math.floor((maxY + oy) / this.py));
      const xs: number[] = [];
      for (let j = j0; j <= j1; j++) {
        for (let s = 0; s < SUB; s++) {
          const y = (j + (s + 0.5) / SUB) * this.py - oy;
          xs.length = 0;
          for (const c of contours) {
            for (let a = 0, b = c.length - 1; a < c.length; b = a++) {
              const [x1, y1] = c[a];
              const [x2, y2] = c[b];
              if (y1 > y !== y2 > y) xs.push((x1 + ((y - y1) / (y2 - y1)) * (x2 - x1) + ox) / this.px);
            }
          }
          xs.sort((p, q) => p - q);
          for (let e = 0; e + 1 < xs.length; e += 2) {
            const xa = Math.max(0, xs[e]);
            const xb = Math.min(this.w, xs[e + 1]);
            if (xb <= xa) continue;
            const ia = Math.floor(xa);
            const ib = Math.min(this.w - 1, Math.floor(xb));
            const row = j * this.w;
            for (let i = ia; i <= ib; i++) {
              const cov = Math.min(xb, i + 1) - Math.max(xa, i);
              if (cov > 0) f[row + i] += (value * cov) / SUB;
            }
          }
        }
      }
    });
  }

  /** Box blur with a radius in metres (wraps on tiling axes, clamps otherwise). */
  blur(f: Field, radius: number, passes = 2): Field {
    let src = f;
    const rx = Math.max(0, Math.round(radius / this.px));
    const ry = Math.max(0, Math.round(radius / this.py));
    const { w, h } = this;
    for (let p = 0; p < passes; p++) {
      const tmp = new Float32Array(this.n);
      const out = new Float32Array(this.n);
      const ix = (i: number) => (this.wrapX ? mod(i, w) : i < 0 ? 0 : i >= w ? w - 1 : i);
      const iy = (j: number) => (this.wrapY ? mod(j, h) : j < 0 ? 0 : j >= h ? h - 1 : j);
      for (let j = 0; j < h; j++) {
        let acc = 0;
        for (let i = -rx; i <= rx; i++) acc += src[j * w + ix(i)];
        for (let i = 0; i < w; i++) {
          tmp[j * w + i] = acc / (2 * rx + 1);
          acc += src[j * w + ix(i + rx + 1)] - src[j * w + ix(i - rx)];
        }
      }
      for (let i = 0; i < w; i++) {
        let acc = 0;
        for (let j = -ry; j <= ry; j++) acc += tmp[iy(j) * w + i];
        for (let j = 0; j < h; j++) {
          out[j * w + i] = acc / (2 * ry + 1);
          acc += tmp[iy(j + ry + 1) * w + i] - tmp[iy(j - ry) * w + i];
        }
      }
      src = out;
    }
    return src;
  }
}

export interface TextureData {
  w: number;
  h: number;
  /** sRGB colour; alpha is opacity for decals. Row 0 is v = 0. */
  albedo: Uint8ClampedArray;
  /** Tangent-space normal, OpenGL convention. */
  normal: Uint8ClampedArray;
  /** R = ambient occlusion, G = roughness, B = metalness. */
  orm: Uint8ClampedArray;
}

/** Material channels being painted. Height is in metres. */
export class Layers {
  readonly r: Field;
  readonly g: Field;
  readonly b: Field;
  readonly rough: Field;
  readonly metal: Field;
  readonly height: Field;
  readonly alpha: Field;

  constructor(readonly tex: Tex, base: RGB = [0.5, 0.5, 0.5], rough = 0.9, alpha = 1) {
    this.r = tex.field(base[0]);
    this.g = tex.field(base[1]);
    this.b = tex.field(base[2]);
    this.rough = tex.field(rough);
    this.metal = tex.field();
    this.height = tex.field();
    this.alpha = tex.field(alpha);
  }

  /** Multiplies the colour by 1 + amount * f. */
  shade(f: Field | ((k: number) => number), amount = 1): void {
    const fn = typeof f === 'function' ? f : (k: number) => f[k];
    for (let k = 0; k < this.tex.n; k++) {
      const m = 1 + amount * fn(k);
      this.r[k] *= m;
      this.g[k] *= m;
      this.b[k] *= m;
    }
  }

  /** Blends a material over the surface where mask > 0. */
  paint(mask: Field, color: RGB | ((k: number) => RGB), opts: { rough?: number; metal?: number; height?: number; opacity?: number; alpha?: boolean } = {}): void {
    const op = opts.opacity ?? 1;
    for (let k = 0; k < this.tex.n; k++) {
      const m = clamp01(mask[k]) * op;
      if (m <= 0) continue;
      const c = typeof color === 'function' ? color(k) : color;
      this.r[k] += (c[0] - this.r[k]) * m;
      this.g[k] += (c[1] - this.g[k]) * m;
      this.b[k] += (c[2] - this.b[k]) * m;
      if (opts.rough !== undefined) this.rough[k] += (opts.rough - this.rough[k]) * m;
      if (opts.metal !== undefined) this.metal[k] += (opts.metal - this.metal[k]) * m;
      if (opts.height) this.height[k] += opts.height * m;
      if (opts.alpha) this.alpha[k] = Math.max(this.alpha[k], m);
    }
  }

  finish(normalStrength = 1): TextureData {
    const { w, h, n, px, py, wrapX, wrapY } = this.tex;
    const albedo = new Uint8ClampedArray(n * 4);
    const normal = new Uint8ClampedArray(n * 4);
    const orm = new Uint8ClampedArray(n * 4);
    const H = this.height;
    // Cavities are darker than their surroundings.
    const smooth = this.tex.blur(H, Math.max(px, py) * 3, 1);
    for (let j = 0; j < h; j++) {
      const ja = wrapY ? mod(j - 1, h) : Math.max(0, j - 1);
      const jb = wrapY ? mod(j + 1, h) : Math.min(h - 1, j + 1);
      for (let i = 0; i < w; i++) {
        const ia = wrapX ? mod(i - 1, w) : Math.max(0, i - 1);
        const ib = wrapX ? mod(i + 1, w) : Math.min(w - 1, i + 1);
        const k = j * w + i;
        const dx = ((H[j * w + ib] - H[j * w + ia]) / (2 * px)) * normalStrength;
        const dy = ((H[jb * w + i] - H[ja * w + i]) / (2 * py)) * normalStrength;
        const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const o = k * 4;
        normal[o] = (-dx * l * 0.5 + 0.5) * 255;
        normal[o + 1] = (-dy * l * 0.5 + 0.5) * 255;
        normal[o + 2] = (l * 0.5 + 0.5) * 255;
        normal[o + 3] = 255;
        const ao = clamp01(1 - (smooth[k] - H[k]) * 220);
        albedo[o] = clamp01(this.r[k]) * 255;
        albedo[o + 1] = clamp01(this.g[k]) * 255;
        albedo[o + 2] = clamp01(this.b[k]) * 255;
        albedo[o + 3] = clamp01(this.alpha[k]) * 255;
        orm[o] = ao * 255;
        orm[o + 1] = clamp01(this.rough[k]) * 255;
        orm[o + 2] = clamp01(this.metal[k]) * 255;
        orm[o + 3] = 255;
      }
    }
    return { w, h, albedo, normal, orm };
  }
}

export type TextureCategory = 'asphalt' | 'concrete' | 'paving' | 'curb' | 'ground' | 'structure' | 'line' | 'crosswalk' | 'symbol' | 'cover' | 'sign' | 'signal' | 'furniture' | 'plant';

export interface TextureSpec {
  id: string;
  /** Japanese label for the catalogue. */
  label: string;
  category: TextureCategory;
  /** Physical size of one tile in metres. */
  meters: readonly [number, number];
  /** Axes on which the texture repeats. */
  tile: 'xy' | 'x' | 'y' | 'none';
  /** Has transparency: meant to be laid over another surface. */
  decal: boolean;
  /** Pixels per metre at detail level 1. */
  density: number;
  /** Alpha is a cut-out mask (leaves, petals): drawn opaque where alpha is high. Meshes supply both faces, so foliage can share one lighting normal. */
  cutout?: boolean;
  /** The surface glows with its own colour (lit lamps); 1 = full brightness. */
  emissive?: number;
  generate: (tex: Tex) => TextureData;
}

/** Renders a texture. `scale` multiplies the resolution (1 = full detail, 0.25 = thumbnail). */
export function renderTexture(spec: TextureSpec, scale = 1): TextureData {
  const size = (m: number) => {
    const p = m * spec.density * scale;
    return Math.max(8, Math.min(2048, 2 ** Math.round(Math.log2(p))));
  };
  const tex = new Tex(size(spec.meters[0]), size(spec.meters[1]), spec.meters[0], spec.meters[1], spec.tile === 'xy' || spec.tile === 'x', spec.tile === 'xy' || spec.tile === 'y');
  return spec.generate(tex);
}
