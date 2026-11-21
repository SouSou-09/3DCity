import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { pointSeg, SegmentIndex } from '../core/geom';
import { Vec2, clamp, mix, smoothstep } from '../core/vec2';
import { DISTRICT_STYLE, Districts } from './districts';
import { Terrain, gradient } from './terrain';

/**
 * Direction field that streets follow. Each sample stores the main street direction as a
 * doubled angle (cos 2θ, sin 2θ) so that opposite directions are equivalent and can be blended.
 * Family 0 streets run along θ, family 1 streets run across it.
 */
export interface TensorField {
  size: number;
  cell: number;
  n: number;
  cos2: Float32Array;
  sin2: Float32Array;
  /** Spacing between neighbouring family-0 / family-1 streets. */
  sep: [Float32Array, Float32Array];
}

function bilinear(f: TensorField, arr: Float32Array, x: number, y: number): number {
  const n = f.n;
  const fx = clamp(x / f.cell, 0, n - 1.001);
  const fy = clamp(y / f.cell, 0, n - 1.001);
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

export function fieldAngle(f: TensorField, x: number, y: number, family: number): number {
  const a = 0.5 * Math.atan2(bilinear(f, f.sin2, x, y), bilinear(f, f.cos2, x, y));
  return family ? a + Math.PI / 2 : a;
}

export const sepAt = (f: TensorField, x: number, y: number, family: number) => bilinear(f, f.sep[family], x, y);

export function buildField(t: Terrain, districts: Districts, highways: Vec2[][], rng: Rng): TensorField {
  const { n, cell, size } = t;
  const noise = new Noise2D(rng.fork('wobble'));
  const cos2 = new Float32Array(n * n);
  const sin2 = new Float32Array(n * n);
  const sepA = new Float32Array(n * n);
  const sepB = new Float32Array(n * n);
  const hw = new SegmentIndex(100);
  highways.forEach((pts, li) => hw.addLine(li, pts));
  const sigma2 = 2 * 95 * 95;
  const hillStyle = DISTRICT_STYLE.hills;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * cell;
      const y = j * cell;
      const k = j * n + i;
      const wp = districts.warp(x, y);
      let a = 0;
      let b = 0;
      let sa = 0;
      let sb = 0;
      let wob = 0;
      let wsum = 0;
      let dmin = Infinity;
      for (const d of districts.list) dmin = Math.min(dmin, (d.center.x - wp.x) ** 2 + (d.center.y - wp.y) ** 2);
      for (const d of districts.list) {
        const dd = (d.center.x - wp.x) ** 2 + (d.center.y - wp.y) ** 2;
        const w = Math.exp(-(dd - dmin) / sigma2);
        if (w < 1e-4) continue;
        const th = d.radial ? Math.atan2(wp.y - d.center.y, wp.x - d.center.x) : d.angle;
        a += w * Math.cos(2 * th);
        b += w * Math.sin(2 * th);
        sa += w * d.style.sepA;
        sb += w * d.style.sepB;
        wob += w * d.style.wobble;
        wsum += w;
      }
      a /= wsum;
      b /= wsum;
      sa /= wsum;
      sb /= wsum;
      wob /= wsum;

      const addDir = (w: number, th: number) => {
        a += w * Math.cos(2 * th);
        b += w * Math.sin(2 * th);
      };
      // Streets run parallel to the shore and the river banks...
      const sd = t.seaDist[k];
      if (sd > 0) {
        const g = gradient(t, t.seaDist, x, y, 24);
        addDir(1.5 * Math.exp(-((sd / 170) ** 2)), Math.atan2(g.y, g.x) + Math.PI / 2);
      }
      const rb = Math.max(0, t.riverBank[k]);
      if (rb < 400) {
        const g = gradient(t, t.riverBank, x, y, 16);
        addDir(1.3 * Math.exp(-((rb / 110) ** 2)), Math.atan2(g.y, g.x) + Math.PI / 2);
      }
      // ...follow contour lines on slopes...
      const gh = gradient(t, t.height, x, y, 16);
      const slope = Math.hypot(gh.x, gh.y);
      addDir(4 * smoothstep(0.035, 0.14, slope), Math.atan2(gh.y, gh.x) + Math.PI / 2);
      // ...and line up with nearby freeways.
      let hd = Infinity;
      let hth = 0;
      hw.query(x - 220, y - 220, x + 220, y + 220, (r) => {
        const d = pointSeg(x, y, r.a, r.b).d;
        if (d < hd) {
          hd = d;
          hth = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x);
        }
      });
      if (hd < 220) addDir(1.6 * Math.exp(-((hd / 80) ** 2)), hth);

      const th = 0.5 * Math.atan2(b, a) + wob * noise.fbm(x / 190, y / 190, 2) * 1.5;
      cos2[k] = Math.cos(2 * th);
      sin2[k] = Math.sin(2 * th);
      const hl = smoothstep(0.3, 0.65, t.hill[k]);
      sepA[k] = mix(sa, hillStyle.sepA, hl);
      sepB[k] = mix(sb, hillStyle.sepB, hl);
    }
  }
  return { size, cell, n, cos2, sin2, sep: [sepA, sepB] };
}
