import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp, mix, smoothstep } from '../core/vec2';
import { City } from '../gen/city';
import { MODELS } from '../assets/mesh/registry';
import { RoadModel, buildRoadModel } from '../place/roadModel';
import { RailModel, buildRailModel } from '../place/railModel';
import { landCover } from '../place/landCover';
import { OpenSpace, placeOpenSpace } from '../place/openSpace';
import { SITE_CELL } from '../place/site';
import { StreetFurniture, placeStreetFurniture } from '../place/streetFurniture';
import { CAR_SIZE } from '../assets/mesh/vehicles';
import { Vehicle, Vehicles, placeVehicles } from '../place/vehicles';
import { WATER_Y } from '../place/waterfront';
import { bedTexture, groundMaterial, waterMaterial } from './ground';
import { Materials } from './materials';

/** A catalogue model standing somewhere in the city. */
interface Instance {
  model: string;
  x: number;
  y: number;
  h: number;
  yaw: number;
  slopeX?: number;
  slopeZ?: number;
  scale?: number;
  /** Scale along the model's own x axis. */
  stretch?: number;
  /** Colour of the body paint, for the cars. */
  tint?: number;
}

/**
 * 3D view of the generated city: terrain graded to the roads and tracks, water, the road models
 * (streets with their junctions, freeways on viaducts, ramps), the equipment along them and the railway.
 * Map (x, y) becomes world (x, z); height is world y.
 */
export class CityView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 2, 12000);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private running = false;
  /** Seconds since the view started, for the waves. */
  private time = { value: 0 };
  private clock = new THREE.Clock();
  private materials: Materials;
  /** Last road model, for inspection from the console and tests. */
  roads: RoadModel | null = null;
  /** Signals, signs and lights standing along the roads. */
  furniture: StreetFurniture | null = null;
  vehicles: Vehicles | null = null;
  private farCar: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
  /** Tracks, level crossings and stations along the railway. */
  rail: RailModel | null = null;
  /** Parks, the waterfront and fences as placed. */
  open: OpenSpace | null = null;

  /** `quality` scales the road textures (1 = full resolution). */
  constructor(private canvas: HTMLCanvasElement, quality = 0.25) {
    this.materials = new Materials(quality);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene.background = new THREE.Color(0xbcd7ee);
    this.scene.fog = new THREE.Fog(0xbcd7ee, 2500, 9000);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f7a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(-0.6, 1, -0.35);
    this.scene.add(sun, this.content);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enableDamping = true;
    window.addEventListener('resize', () => this.resize());
  }

  /** One instanced mesh per model, material and 800 m tile, so that what is out of view is skipped. */
  private buildFurniture(items: Instance[], TILE = 800, geos = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; layer: number; tinted: boolean }[]>()): THREE.Group {
    const groups = new Map<string, Instance[]>();
    for (const it of items) {
      const k = `${it.model}|${Math.floor(it.x / TILE)}|${Math.floor(it.y / TILE)}`;
      const g = groups.get(k);
      if (g) g.push(it);
      else groups.set(k, [it]);
    }
    const out = new THREE.Group();
    const tint = new THREE.Color();
    const m = new THREE.Matrix4();
    const size = new THREE.Vector3();
    for (const [k, list] of groups) {
      const id = k.slice(0, k.indexOf('|'));
      let parts = geos.get(id);
      if (!parts) {
        const spec = MODELS.find((s) => s.id === id);
        if (!spec) throw new Error(`no model ${id}`);
        parts = spec.build().parts.map((p) => {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(p.positions, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(p.normals, 3));
          geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uvs, 2));
          geo.setIndex(p.indices);
          return { geo, mat: this.materials.material(p.material, p.layer), layer: p.layer, tinted: p.material.startsWith('vehicle/paint') };
        });
        geos.set(id, parts);
      }
      for (const p of parts) {
        const mesh = new THREE.InstancedMesh(p.geo, p.mat, list.length);
        list.forEach((it, i) => {
          m.makeRotationY(-it.yaw);
          if (it.scale || it.stretch) m.scale(size.set((it.scale ?? 1) * (it.stretch ?? 1), it.scale ?? 1, it.scale ?? 1));
          // Things that follow a grade are sheared, so that posts stay upright.
          m.elements[1] = (it.slopeX ?? 0) * (it.stretch ?? 1);
          m.elements[9] = it.slopeZ ?? 0;
          m.setPosition(it.x, it.h, it.y);
          mesh.setMatrixAt(i, m);
          if (p.tinted && it.tint !== undefined) mesh.setColorAt(i, tint.setHex(it.tint, THREE.SRGBColorSpace));
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.renderOrder = p.layer;
        out.add(mesh);
      }
    }
    return out;
  }

  /** Cars in small tiles: the models up close, a tinted block for each further off, nothing beyond that. */
  private buildVehicles(items: Vehicle[]): THREE.Group {
    const TILE = 200;
    const tiles = new Map<string, Vehicle[]>();
    for (const it of items) {
      const k = `${Math.floor(it.x / TILE)}|${Math.floor(it.y / TILE)}`;
      const g = tiles.get(k);
      if (g) g.push(it);
      else tiles.set(k, [it]);
    }
    if (!this.farCar) {
      // A body and a cabin on it, white where the paint is and dark where the glass is.
      const body = new THREE.BoxGeometry(1, 0.42, 1).translate(0, 0.37, 0);
      const cabin = new THREE.BoxGeometry(0.52, 0.42, 0.9).translate(-0.06, 0.79, 0);
      const shade = (g: THREE.BufferGeometry, side: number): void => {
        const n = g.getAttribute('normal');
        const c = new Float32Array(n.count * 3);
        for (let i = 0; i < n.count; i++) c.fill(n.getY(i) > 0.5 ? 1 : side, i * 3, i * 3 + 3);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      };
      shade(body, 0.82);
      shade(cabin, 0.05);
      const geo = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color'] as const) {
        const [a, b] = [body.getAttribute(name), cabin.getAttribute(name)];
        const arr = new Float32Array(a.array.length + b.array.length);
        arr.set(a.array as Float32Array);
        arr.set(b.array as Float32Array, a.array.length);
        geo.setAttribute(name, new THREE.BufferAttribute(arr, 3));
      }
      geo.setIndex([...Array.from(body.index!.array), ...Array.from(cabin.index!.array, (i) => i + body.getAttribute('position').count)]);
      this.farCar = { geo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 }) };
    }
    const out = new THREE.Group();
    const geos = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; layer: number; tinted: boolean }[]>();
    const m = new THREE.Matrix4();
    const size = new THREE.Vector3();
    const tint = new THREE.Color();
    for (const list of tiles.values()) {
      const lod = new THREE.LOD();
      const c = list.reduce((a, it) => [a[0] + it.x / list.length, a[1] + it.h / list.length, a[2] + it.y / list.length], [0, 0, 0]);
      lod.position.set(c[0], c[1], c[2]);
      const near = this.buildFurniture(list, TILE, geos);
      near.position.set(-c[0], -c[1], -c[2]);
      const far = new THREE.InstancedMesh(this.farCar.geo, this.farCar.mat, list.length);
      list.forEach((it, i) => {
        const r = CAR_SIZE.get(it.model)!;
        m.makeRotationY(-it.yaw);
        m.scale(size.set(r.len - 0.16, r.hgt, r.wid - 0.3));
        m.setPosition(it.x - c[0], it.h - c[1], it.y - c[2]);
        far.setMatrixAt(i, m);
        far.setColorAt(i, tint.setHex(it.tint, THREE.SRGBColorSpace));
      });
      far.instanceMatrix.needsUpdate = true;
      far.instanceColor!.needsUpdate = true;
      far.computeBoundingSphere();
      far.userData.sharedGeometry = true;
      lod.addLevel(near, 0);
      lod.addLevel(far, 260);
      lod.addLevel(new THREE.Object3D(), 1800);
      out.add(lod);
    }
    return out;
  }

  setCity(city: City): void {
    this.content.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (!o.userData.sharedGeometry) o.geometry.dispose();
        if (o instanceof THREE.InstancedMesh) o.dispose();
        // Road materials are shared and cached; only the terrain and water own theirs.
        if (o.userData.ownMaterial) (o.material as THREE.Material).dispose();
        for (const tex of (o.userData.ownTextures as THREE.Texture[] | undefined) ?? []) tex.dispose();
      }
    });
    this.content.clear();
    const roads = (this.roads = buildRoadModel(city));
    const open = (this.open = placeOpenSpace(city, roads));
    this.content.add(this.buildTerrain(city, open), this.buildWater(city, open));
    for (const tile of roads.tiles) {
      const g = this.materials.group(tile);
      g.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
      });
      this.content.add(g);
    }
    this.furniture = placeStreetFurniture(city, roads);
    this.content.add(this.buildFurniture(this.furniture.items));
    for (const tile of this.furniture.tiles) this.content.add(this.materials.group(tile));
    const rail = (this.rail = buildRailModel(city, roads));
    for (const tile of rail.tiles) this.content.add(this.materials.group(tile));
    this.content.add(this.buildFurniture(rail.items));
    for (const tile of open.tiles) this.content.add(this.materials.group(tile));
    this.content.add(this.buildFurniture(open.items));
    this.vehicles = placeVehicles(city, open.buildings, this.furniture);
    this.content.add(this.buildVehicles(this.vehicles.items));
    const s = city.config.size;
    const dt = city.districts.downtown.center;
    this.controls.target.set(dt.x, 0, dt.y);
    // Look at downtown from the sea side.
    this.camera.position.set(dt.x - city.terrain.inland.x * s * 0.5, s * 0.3, dt.y - city.terrain.inland.y * s * 0.5);
    this.controls.update();
  }

  private buildTerrain(city: City, open: OpenSpace): THREE.Mesh {
    const height = open.ground;
    const t = city.terrain;
    const n = t.n;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    // How much of the ground at each vertex is sand, lawn, rough grass and open shore.
    const cover = new Float32Array(n * n * 4);
    const color = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        pos[k * 3] = i * t.cell;
        pos[k * 3 + 1] = height[k];
        pos[k * 3 + 2] = j * t.cell;
        const hl = t.hill[k];
        let r = mix(0.8, 0.5, hl);
        let g = mix(0.79, 0.58, hl);
        let b = mix(0.72, 0.36, hl);
        // A port's yard is paved; sand lies where the shore was left a beach.
        const yard = open.shore.paved[k];
        r = mix(r, 0.56, yard);
        g = mix(g, 0.56, yard);
        b = mix(b, 0.55, yard);
        // The banks of the river are sand and silt where they were left as they are.
        const sand = Math.max(open.shore.sand[k], (1 - smoothstep(0, 8, t.riverBank[k])) * (1 - open.shore.banks[k]));
        r = mix(r, 0.85, sand);
        g = mix(g, 0.78, sand);
        b = mix(b, 0.58, sand);
        // Lawns, rough grass, bare earth and hard standing are laid over this from the map of what covers the ground.
        cover.set([open.isPark(i * t.cell, j * t.cell) ? 0 : sand, 0, hl * (1 - yard), clamp((t.riverBank[k] - t.seaDist[k]) / 40 + 0.5, 0, 1)], k * 4);
        color.setRGB(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1), THREE.SRGBColorSpace);
        col[k * 3] = color.r;
        col[k * 3 + 1] = color.g;
        col[k * 3 + 2] = color.b;
      }
    }
    const index = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        index.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], q);
        q += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('cover', new THREE.BufferAttribute(cover, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    const land = new THREE.DataTexture(landCover(city, open), open.site.n, open.site.n, THREE.RGBAFormat);
    land.magFilter = THREE.LinearFilter;
    land.minFilter = THREE.LinearMipmapLinearFilter;
    land.generateMipmaps = true;
    land.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, groundMaterial(this.materials, WATER_Y, land, open.site.n * SITE_CELL));
    mesh.userData.ownMaterial = true;
    mesh.userData.ownTextures = [land];
    return mesh;
  }

  private buildWater(city: City, open: OpenSpace): THREE.Mesh {
    const s = city.config.size;
    const geo = new THREE.PlaneGeometry(s * 6, s * 6);
    geo.rotateX(-Math.PI / 2);
    const t = city.terrain;
    const bed = bedTexture(t.n, t.cell, open.ground, (k) => clamp((t.riverBank[k] - t.seaDist[k]) / 40 + 0.5, 0, 1), WATER_Y);
    const mesh = new THREE.Mesh(geo, waterMaterial(bed, t.n, (t.n - 1) * t.cell, WATER_Y, this.time));
    mesh.position.set(s / 2, WATER_Y, s / 2);
    mesh.userData.ownMaterial = true;
    mesh.userData.ownTextures = [bed];
    return mesh;
  }

  /** Puts the camera at a map position and height, looking at another (for reproducible screenshots). */
  look(from: [number, number, number], to: [number, number, number]): void {
    this.camera.position.set(from[0], from[2], from[1]);
    this.controls.target.set(to[0], to[2], to[1]);
    this.controls.update();
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.time.value += Math.min(0.1, this.clock.getDelta());
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }
}
