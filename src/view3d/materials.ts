import * as THREE from 'three';
import { ModelData } from '../assets/mesh/builder';
import { TextureData, renderTexture, textureSpec } from '../assets/tex';

/** Sky over a dark skyline, for glass and polished stone to mirror. */
let skyMap: THREE.DataTexture | undefined;
function sky(): THREE.DataTexture {
  if (skyMap) return skyMap;
  const [w, h] = [128, 64];
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const up = (y + 0.5) / h * 2 - 1;
      const roof = 0.04 + 0.1 * Math.abs(Math.sin(x * 0.37) * Math.sin(x * 0.11 + 1));
      const c = up > roof ? [200 - 110 * up ** 0.6, 222 - 70 * up ** 0.6, 244 - 12 * up] : up > 0 ? [70, 72, 78] : [96 + 30 * up, 92 + 30 * up, 86 + 30 * up];
      px.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  }
  skyMap = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  skyMap.mapping = THREE.EquirectangularReflectionMapping;
  skyMap.colorSpace = THREE.SRGBColorSpace;
  skyMap.magFilter = skyMap.minFilter = THREE.LinearFilter;
  skyMap.needsUpdate = true;
  return skyMap;
}

/** Turns generated textures and models into Three.js materials and meshes, caching both. */
export class Materials {
  private cache = new Map<string, TextureData>();
  private mats = new Map<string, THREE.Material>();
  /** `quality` scales the texture resolution (1 = full). */
  constructor(private quality: number) {}

  data(id: string, scale: number): TextureData {
    const key = `${id}@${scale}`;
    let d = this.cache.get(key);
    if (!d) this.cache.set(key, (d = renderTexture(textureSpec(id), scale)));
    return d;
  }

  /** Material for a texture id; `layer` > 0 lifts decals off the surface they lie on. */
  material(id: string, layer: number): THREE.Material {
    const key = `${id}#${layer}`;
    let m = this.mats.get(key);
    if (m) return m;
    const spec = textureSpec(id);
    const d = this.data(id, this.quality);
    const make = (pixels: Uint8ClampedArray, srgb: boolean): THREE.DataTexture => {
      const t = new THREE.DataTexture(new Uint8Array(pixels.buffer as ArrayBuffer), d.w, d.h, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 8;
      t.needsUpdate = true;
      return t;
    };
    if (spec.cutout) {
      // What is cut away still has a colour and a gloss, and the smaller copies of the texture average them in: give it those of what is kept, or foliage pales to white with distance.
      const a = d.albedo;
      for (const px of [d.albedo, d.orm, d.normal]) {
        const sum = [0, 0, 0, 0];
        for (let i = 0; i < px.length; i += 4) if (a[i + 3] > 128) for (let q = 0; q < 3; q++) sum[q] += px[i + q], (sum[3] += q ? 0 : 1);
        if (sum[3]) for (let i = 0; i < px.length; i += 4) if (a[i + 3] < 26) for (let q = 0; q < 3; q++) px[i + q] = sum[q] / sum[3];
      }
    }
    const orm = make(d.orm, false);
    const albedo = make(d.albedo, true);
    m = new THREE.MeshStandardMaterial({
      map: albedo, ...(spec.emissive ? { emissive: 0xffffff, emissiveMap: albedo, emissiveIntensity: spec.emissive } : {}), ...(spec.reflect ? { envMap: sky(), envMapIntensity: spec.reflect } : {}), normalMap: make(d.normal, false), roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
      transparent: spec.decal, depthWrite: !spec.decal, ...(spec.cutout ? { alphaTest: 0.4, alphaToCoverage: true } : {}), polygonOffset: layer > 0, polygonOffsetFactor: -layer * 2, polygonOffsetUnits: -layer * 4,
      side: spec.decal || spec.cutout ? THREE.FrontSide : THREE.DoubleSide, shadowSide: THREE.DoubleSide,
    });
    // Leaves on flat cards catch the sun and the sky as one sheet, and a tree of them shines pale: no gloss, and the shade a crown throws on itself.
    if (spec.cutout && /^plant\//.test(id)) {
      const leaf = m as THREE.MeshStandardMaterial;
      [leaf.roughnessMap, leaf.metalnessMap, leaf.roughness, leaf.metalness] = [null, null, 1, 0];
      // Seen small, a spray of leaves is mostly gaps and its smaller copies fall under the cut: the leaves went, and a tree far off was its pale branches. Cut lower, so that the spray closes up with distance instead.
      leaf.alphaTest = 0.12;
      if (/^plant\/(leaf|frond|fan|foliage)/.test(id)) leaf.color.setRGB(0.66, 0.72, 0.6);
    }
    this.mats.set(key, m);
    return m;
  }

  /** Three.js meshes for a generated model, one per material. */
  group(data: ModelData): THREE.Group {
    const g = new THREE.Group();
    for (const p of data.parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(p.normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uvs, 2));
      geo.setIndex(p.indices);
      const mesh = new THREE.Mesh(geo, this.material(p.material, p.layer));
      mesh.renderOrder = p.layer;
      mesh.castShadow = p.layer === 0;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}
