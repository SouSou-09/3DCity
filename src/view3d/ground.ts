import * as THREE from 'three';
import { Materials } from './materials';

let noiseMap: THREE.DataTexture | undefined;
/** Three channels of smooth noise that tile, for breaking up the ground and the water. */
function noise(): THREE.DataTexture {
  if (noiseMap) return noiseMap;
  const N = 256;
  const px = new Uint8Array(N * N * 4);
  const hash = (c: number, p: number, i: number, j: number): number => {
    let h = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(c + 1, 362437) ^ Math.imul(p, 974711)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let [v, amp, sum] = [0, 1, 0];
        for (const p of [4, 8, 16, 32, 64]) {
          const [fx, fy] = [(x / N) * p, (y / N) * p];
          const [i, j] = [Math.floor(fx), Math.floor(fy)];
          const [u, w] = [fx - i, fy - j];
          const [su, sw] = [u * u * (3 - 2 * u), w * w * (3 - 2 * w)];
          const at = (a: number, b: number): number => hash(c, p, (i + a) % p, (j + b) % p);
          v += amp * (at(0, 0) * (1 - su) * (1 - sw) + at(1, 0) * su * (1 - sw) + at(0, 1) * (1 - su) * sw + at(1, 1) * su * sw);
          sum += amp;
          amp *= 0.55;
        }
        // Stretched about the middle: the sum of octaves crowds 0.5.
        px[(y * N + x) * 4 + c] = Math.min(255, Math.max(0, ((v / sum - 0.5) * 1.9 + 0.5) * 255));
      }
  for (let k = 3; k < px.length; k += 4) px[k] = 255;
  noiseMap = new THREE.DataTexture(px, N, N, THREE.RGBAFormat);
  noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
  noiseMap.generateMipmaps = true;
  noiseMap.minFilter = THREE.LinearMipmapLinearFilter;
  noiseMap.magFilter = THREE.LinearFilter;
  noiseMap.needsUpdate = true;
  return noiseMap;
}

/** The height of the ground under the water, exactly as the two triangles of each cell of the terrain mesh give it: the water's edge is where the mesh cuts the surface. */
const BED = `
float bedAt(vec2 wp) {
  float n = 0.5 / uBedMap.y;
  vec2 p = wp * uBedMap.x * n;
  vec2 ij = floor(p);
  vec2 f = p - ij;
  vec2 c = (ij + 0.5) / n;
  float d = 1.0 / n;
  float h10 = texture2D(uBed, c + vec2(d, 0.0)).r;
  float h01 = texture2D(uBed, c + vec2(0.0, d)).r;
  return f.x + f.y <= 1.0
    ? texture2D(uBed, c).r + f.x * (h10 - texture2D(uBed, c).r) + f.y * (h01 - texture2D(uBed, c).r)
    : texture2D(uBed, c + vec2(d, d)).r + (1.0 - f.x) * (h01 - texture2D(uBed, c + vec2(d, d)).r) + (1.0 - f.y) * (h10 - texture2D(uBed, c + vec2(d, d)).r);
}
`;
const VARYING = 'varying vec3 vGround;\n';
const WORLD = '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;';

/**
 * The open ground. Vertex colours give what lies where; this lays the grain over them: sand that is wet and dark
 * where the waves reach and strewn with weed above that, lawns that are mown in stripes and tired in patches,
 * rough grass on the hills. `cover` on the geometry is how much of each vertex is sand, lawn, rough grass and
 * open shore.
 */
export function groundMaterial(materials: Materials, waterY: number, land: THREE.Texture, landSize: number): THREE.Material {
  const map = (id: string): THREE.Texture => (materials.material(id, 0) as THREE.MeshStandardMaterial).map!;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uNoise: { value: noise() }, uSand: { value: map('ground/sand') }, uLawn: { value: map('ground/grass-mown') }, uWorn: { value: map('ground/grass-patchy') },
      uRough: { value: map('ground/grass-dry') }, uWater: { value: waterY }, uLand: { value: land }, uLandSize: { value: landSize },
      uDirt: { value: map('ground/gravel-dirt') }, uEarth: { value: map('ground/dirt') }, uHard: { value: map('concrete/road-smooth-cracked') }, uWeeds: { value: map('ground/grass-patchy') },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 cover;\nvarying vec4 vCover;\n${VARYING}`)
      .replace('#include <begin_vertex>', `${WORLD}\nvCover = cover;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uNoise, uSand, uLawn, uWorn, uRough, uLand, uDirt, uEarth, uHard, uWeeds;\nuniform float uWater, uLandSize;\nvarying vec4 vCover;\n${VARYING}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 gp = vGround.xz;
        vec3 mid = texture2D(uNoise, gp / 41.0).rgb;
        vec3 wide = texture2D(uNoise, gp / 233.0).rgb;
        float fine = texture2D(uNoise, gp / 5.3).b;
        vec3 ground = diffuseColor.rgb * (0.9 + 0.14 * mid.g + 0.08 * fine);
        vec3 rough = mix(texture2D(uRough, gp / 2.0).rgb, texture2D(uRough, gp / 7.3).rgb, 0.4) * (0.75 + 0.5 * wide.r);
        ground = mix(ground, rough, vCover.z * 0.8);

        vec3 lawn = mix(texture2D(uLawn, gp / 2.0).rgb, texture2D(uLawn, gp / 7.3).rgb, 0.4) * 1.3;
        float tired = smoothstep(0.56, 0.84, mid.r * 0.6 + wide.g * 0.4);
        lawn = mix(lawn, texture2D(uWorn, gp / 2.0).rgb * 1.3, tired * 0.7);
        lawn *= mix(vec3(0.84, 0.9, 0.78), vec3(1.12, 1.08, 0.98), wide.b);
        // Mown in stripes, each pass of the mower bending the grass the other way.
        lawn *= 1.0 + 0.09 * (smoothstep(-0.25, 0.25, sin(dot(gp, vec2(0.8, 0.6)) * 1.745)) - 0.5) * (1.0 - tired);
        // What covers the made ground of the town: rough grass with bare patches, earth and gravel, hard standing, and lawn over them.
        vec4 land = texture2D(uLand, gp / uLandSize);
        vec3 weeds = mix(texture2D(uWeeds, gp / 2.6).rgb, texture2D(uRough, gp / 6.1).rgb, 0.45) * (0.95 + 0.5 * wide.g) * mix(vec3(1.0), vec3(1.12, 1.02, 0.8), smoothstep(0.4, 0.75, mid.b));
        vec3 earth = mix(texture2D(uDirt, gp / 3.0).rgb, texture2D(uEarth, gp / 4.7).rgb, smoothstep(0.35, 0.7, mid.g)) * (1.05 + 0.3 * wide.b);
        // Old concrete and asphalt, patched: the texture only for its grain, so that its joints do not show as a grid.
        vec3 hard = mix(vec3(0.46, 0.46, 0.45), texture2D(uHard, gp / 3.1).rgb, 0.25) * (0.86 + 0.16 * mid.r + 0.08 * fine) * mix(vec3(1.0), vec3(0.86, 0.85, 0.84), smoothstep(0.5, 0.8, wide.r));
        ground = mix(ground, weeds, land.g);
        // Rough grass wears through to the earth where it is walked on and where nothing will grow.
        float bare = smoothstep(0.6, 0.82, mid.r * 0.55 + wide.b * 0.3 + fine * 0.15);
        ground = mix(ground, earth, max(land.b, land.g * (1.0 - land.r) * bare * 0.7));
        ground = mix(ground, hard, land.a);
        ground = mix(ground, lawn, max(vCover.y, land.r));

        float above = vGround.y - uWater;
        // The grain of the sand over its own colour: the texture alone is the shade between the grains.
        vec3 grain = mix(texture2D(uSand, gp / 2.0).rgb, texture2D(uSand, gp / 6.7, 3.0).rgb, 0.16) / max(texture2D(uSand, gp / 2.0, 9.0).rgb, vec3(0.05));
        vec3 sand = vec3(0.66, 0.55, 0.33) * grain * (0.9 + 0.2 * wide.r);
        sand *= 1.0 + 0.08 * smoothstep(0.7, 2.2, above) - 0.06 * smoothstep(0.55, 0.75, mid.g);
        // Wet as far as the last wave ran, and a line of weed where it turned.
        float swash = 0.3 + 0.45 * mid.b + 0.06 * fine;
        float wet = 1.0 - smoothstep(swash - 0.12, swash + 0.1, above);
        sand = mix(sand, sand * vec3(0.58, 0.58, 0.6), wet);
        float wrack = smoothstep(0.09, 0.0, abs(above - swash - 0.2)) * smoothstep(0.5, 0.68, fine) * vCover.w;
        sand = mix(sand, vec3(0.1, 0.085, 0.05), wrack * 0.75);
        diffuseColor.rgb = mix(ground, sand, vCover.x);`);
  };
  return m;
}

/** What the water needs from the ground: its height and how open to the sea the place is (0 up a river), on the terrain grid. */
/**
 * What the water needs to know of the ground under it, a texel for each vertex of the terrain: the height of the bed, how open
 * the water is (sea 1, river 0), and how far it is from the water's edge (out in the water positive, up the shore negative).
 */
export function bedTexture(n: number, cell: number, height: Float32Array, open: (k: number) => number, waterY: number): THREE.DataTexture {
  const FAR = 6;
  const edge = new Float32Array(n * n).fill(FAR * cell);
  // Every place where the mesh cuts the surface of the water along a side of a cell; each tells the vertices round it how near it is.
  const tell = (x: number, y: number): void => {
    const [ci, cj] = [Math.round(x / cell), Math.round(y / cell)];
    for (let j = Math.max(0, cj - FAR); j <= Math.min(n - 1, cj + FAR); j++)
      for (let i = Math.max(0, ci - FAR); i <= Math.min(n - 1, ci + FAR); i++) {
        const d = Math.hypot(i * cell - x, j * cell - y);
        if (d < edge[j * n + i]) edge[j * n + i] = d;
      }
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const h = height[k];
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        if (i + di >= n || j + dj >= n) continue;
        const g = height[k + dj * n + di];
        if (h < waterY === g < waterY) continue;
        const u = (waterY - h) / (g - h);
        tell((i + di * u) * cell, (j + dj * u) * cell);
      }
    }
  const px = new Uint16Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    px[k * 4] = THREE.DataUtils.toHalfFloat(Math.max(-60, Math.min(60, height[k])));
    px[k * 4 + 1] = THREE.DataUtils.toHalfFloat(open(k));
    px[k * 4 + 2] = THREE.DataUtils.toHalfFloat(height[k] < waterY ? edge[k] : -edge[k]);
  }
  const t = new THREE.DataTexture(px, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * The water: pale and clear over the shallows, dark over the deep, with foam where the waves run up the shore and
 * where they break on the way in. `size` is the side of the map in metres; `time.value` moves the waves.
 */
export function waterMaterial(bed: THREE.Texture, n: number, size: number, waterY: number, time: { value: number }): THREE.Material {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    // Texel centres sit on the terrain's vertices.
    Object.assign(shader.uniforms, { uNoise: { value: noise() }, uBed: { value: bed }, uBedMap: { value: new THREE.Vector2((n - 1) / (size * n), 0.5 / n) }, uWater: { value: waterY }, uTime: time });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VARYING}`).replace('#include <begin_vertex>', WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uNoise, uBed;\nuniform vec2 uBedMap;\nuniform float uWater, uTime;\n${VARYING}${BED}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wp = vGround.xz;
        vec4 bed = texture2D(uBed, wp * uBedMap.x + uBedMap.y);
        float depth = uWater - bedAt(wp);
        float open = clamp(bed.g, 0.0, 1.0);
        vec3 drift = texture2D(uNoise, wp / 67.0 + vec2(uTime * 0.003, 0.0)).rgb;
        float lace = texture2D(uNoise, wp / 4.3 + vec2(0.0, uTime * 0.012)).g;
        float deep = 1.0 - exp(-max(depth, 0.0) * 0.55);
        vec3 sea = mix(vec3(0.13, 0.46, 0.45), vec3(0.045, 0.19, 0.34), deep);
        vec3 river = mix(vec3(0.2, 0.3, 0.22), vec3(0.06, 0.16, 0.16), deep);
        vec3 water = mix(river, sea, open) * (0.93 + 0.14 * texture2D(uNoise, wp / 13.0 + vec2(uTime * 0.01)).r);
        // A film over the sand at the edge, where the last wave is still draining back.
        float alpha = 0.93;
        // How far out from the water's edge this is.
        float reach = max(bed.b, 0.0);
        alpha = mix(0.3, 0.93, max(smoothstep(0.0, 1.2, depth), smoothstep(0.0, 7.0, reach)));
        // Foam: the edge of the wave running up the sand, and the lines where the next ones break.
        float beat = uTime * 0.7 + drift.r * 6.283;
        float run = 1.3 + 0.9 * sin(beat) + 1.6 * (lace - 0.5);
        float foam = (1.0 - smoothstep(run, run + 1.3, reach)) * smoothstep(0.3, 0.55, lace + 0.25 * (1.0 - smoothstep(0.0, run + 0.5, reach))) * 0.92;
        float bar = 9.0 + 5.0 * drift.g + 1.2 * sin(beat * 0.6);
        foam = max(foam, smoothstep(1.3, 0.0, abs(reach - bar)) * smoothstep(0.4, 0.68, lace) * 0.85);
        foam = max(foam, smoothstep(1.6, 0.0, abs(reach - bar - 11.0)) * smoothstep(0.55, 0.8, lace) * 0.5);
        foam *= open;
        diffuseColor.rgb = mix(water, vec3(0.94, 0.95, 0.95), foam);
        diffuseColor.a = max(alpha, foam * 0.95);`);
  };
  return m;
}
