import { Rng } from './rng';

const GRAD = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Seeded 2D gradient noise, output roughly in [-1, 1]. */
export class Noise2D {
  private perm = new Uint8Array(512);

  constructor(rng: Rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private g(ix: number, iy: number, dx: number, dy: number): number {
    const h = this.perm[(this.perm[ix & 255] + iy) & 255] & 7;
    return GRAD[h][0] * dx + GRAD[h][1] * dy;
  }

  noise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fade(fx);
    const v = fade(fy);
    const a = this.g(ix, iy, fx, fy);
    const b = this.g(ix + 1, iy, fx - 1, fy);
    const c = this.g(ix, iy + 1, fx, fy - 1);
    const d = this.g(ix + 1, iy + 1, fx - 1, fy - 1);
    return (a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v) * 1.6;
  }

  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
