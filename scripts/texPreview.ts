// Writes every texture as a PNG (decals composited over asphalt grey) for visual checks.
// Usage: npx tsx scripts/texPreview.ts [outDir] [idPrefix] [scale]
import { mkdirSync } from 'node:fs';
import { TEXTURES, renderTexture } from '../src/assets/tex';
import { writePng } from './png';

const out = process.argv[2] ?? '/home/ubuntu/shots/tex';
const prefix = process.argv[3] ?? '';
const scale = Number(process.argv[4] ?? 0.5);
mkdirSync(out, { recursive: true });
const t0 = performance.now();
let count = 0;
for (const spec of TEXTURES) {
  if (!spec.id.startsWith(prefix)) continue;
  const t = renderTexture(spec, scale);
  const img = new Uint8ClampedArray(t.albedo.length);
  for (let j = 0; j < t.h; j++) {
    for (let i = 0; i < t.w; i++) {
      const s = (j * t.w + i) * 4;
      const d = ((t.h - 1 - j) * t.w + i) * 4;
      const a = spec.decal || spec.cutout ? t.albedo[s + 3] / 255 : 1;
      for (let c = 0; c < 3; c++) img[d + c] = t.albedo[s + c] * a + (spec.cutout ? 150 : 52) * (1 - a);
      img[d + 3] = 255;
    }
  }
  writePng(`${out}/${spec.id.replace('/', '__')}.png`, t.w, t.h, img);
  count++;
}
console.log(count, 'textures', (performance.now() - t0).toFixed(0), 'ms');
