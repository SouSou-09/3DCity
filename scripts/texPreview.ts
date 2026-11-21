// Writes contact sheets of surface textures to an output directory for visual checks.
import { mkdirSync } from 'node:fs';
import { Tex, TextureData } from '../src/assets/tex/core';
import * as S from '../src/assets/tex/surfaces';
import { writePng } from './png';

const out = process.argv[2] ?? '/home/ubuntu/shots/tex';
mkdirSync(out, { recursive: true });
const save = (name: string, t: TextureData) => {
  // Flip so that v points up in the image.
  const flipped = new Uint8ClampedArray(t.albedo.length);
  for (let j = 0; j < t.h; j++) flipped.set(t.albedo.subarray(j * t.w * 4, (j + 1) * t.w * 4), (t.h - 1 - j) * t.w * 4);
  writePng(`${out}/${name}.png`, t.w, t.h, flipped);
};
const sq = (m: number, res = 512) => new Tex(res, res, m, m, true, true);
const t0 = performance.now();
save('asphalt-fresh', S.asphalt(new Tex(512, 512, 3.5, 3.5, true, true), { seed: 1, age: 0.05, lane: true }));
save('asphalt-worn', S.asphalt(new Tex(512, 512, 3.5, 3.5, true, true), { seed: 2, age: 0.6, lane: true, cracks: 0.6, sealed: 0.5, stains: 0.4 }));
save('asphalt-old', S.asphalt(sq(4), { seed: 3, age: 0.95, cracks: 1, alligator: 0.5, patches: 2, sealed: 0.3, trench: true }));
save('asphalt-bus', S.asphalt(new Tex(512, 512, 3.5, 3.5, true, true), { seed: 4, age: 0.4, lane: true, coat: { color: [0.55, 0.13, 0.1], wear: 0.45 } }));
save('concrete-walk', S.concrete(sq(3), { seed: 5, slab: [1.5, 1.5], gum: 6, stains: 0.5, cracks: 0.3, dirt: 0.5 }));
save('concrete-road', S.concrete(sq(4), { seed: 6, slab: [4, 4], finish: 'tined', joint: 'sawcut', dirt: 0.4 }));
save('pavers-herring', S.pavers(sq(1.6), { seed: 7, bond: 'herringbone', unit: 0.1, colors: [[0.55, 0.25, 0.18], [0.48, 0.2, 0.15], [0.6, 0.32, 0.22]] }));
save('pavers-setts', S.pavers(sq(1.6), { seed: 8, bond: 'setts', unit: 0.1, colors: [[0.4, 0.4, 0.41], [0.33, 0.33, 0.35]], domed: true, jointWidth: 0.008, moss: 0.5 }));
save('curb-red', S.curb(new Tex(1024, 256, 2, 0.5, true, false), { seed: 9, paint: [0.7, 0.1, 0.08], wear: 0.4 }));
save('grass', S.grass(sq(2), { seed: 10, dry: 0.3, bare: 0.3 }));
save('gravel', S.gravel(sq(1), { seed: 11, size: 0.03, colors: [[0.5, 0.48, 0.45], [0.4, 0.38, 0.35], [0.6, 0.55, 0.48]] }));
save('metal-green', S.metal(sq(1), { seed: 12, paint: [0.2, 0.35, 0.28], rust: 0.4, rivets: 0.5 }));
save('masonry', S.masonry(sq(2), { seed: 13, block: [0.5, 0.25], colors: [[0.55, 0.5, 0.42], [0.5, 0.46, 0.4]], rough: true, streaks: 0.5 }));
save('planks', S.planks(sq(2), { seed: 14, width: 0.14, color: [0.45, 0.33, 0.22], weathered: 0.5 }));
save('tactile', S.tactile(sq(0.6, 256), { seed: 15, color: [0.85, 0.68, 0.1] }));
console.log('ms', (performance.now() - t0).toFixed(0));
