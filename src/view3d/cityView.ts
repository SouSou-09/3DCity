import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { resample } from '../core/geom';
import { clamp, mix, smoothstep } from '../core/vec2';
import { City } from '../gen/city';
import { RoadEdge } from '../gen/roadGraph';
import { RoadClass } from '../gen/streamlines';
import { heightAt } from '../gen/terrain';

const ROAD: Record<RoadClass, { width: number; lift: number; color: number }> = {
  local: { width: 8, lift: 0.3, color: 0x4a4b4e },
  collector: { width: 11, lift: 0.35, color: 0x444548 },
  arterial: { width: 17, lift: 0.4, color: 0x3d3e42 },
  ramp: { width: 7, lift: 0.5, color: 0x55565a },
  highway: { width: 24, lift: 0.6, color: 0x35363a },
};
const DECK_HEIGHT = 5;

/**
 * Rough 3D preview of the generated city: terrain, water and flat road ribbons.
 * Map (x, y) becomes world (x, z); height is world y.
 */
export class CityView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 2, 12000);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
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

  setCity(city: City): void {
    this.content.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.content.clear();
    this.content.add(this.buildTerrain(city), this.buildWater(city));
    for (const cls of Object.keys(ROAD) as RoadClass[]) this.content.add(this.buildRoads(city, cls));
    const s = city.config.size;
    const dt = city.districts.downtown.center;
    this.controls.target.set(dt.x, 0, dt.y);
    // Look at downtown from the sea side.
    this.camera.position.set(dt.x - city.terrain.inland.x * s * 0.5, s * 0.3, dt.y - city.terrain.inland.y * s * 0.5);
    this.controls.update();
  }

  private buildTerrain(city: City): THREE.Mesh {
    const t = city.terrain;
    const n = t.n;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const color = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        pos[k * 3] = i * t.cell;
        pos[k * 3 + 1] = t.height[k];
        pos[k * 3 + 2] = j * t.cell;
        const sd = t.seaDist[k];
        const hl = t.hill[k];
        let r = mix(0.8, 0.5, hl);
        let g = mix(0.79, 0.58, hl);
        let b = mix(0.72, 0.36, hl);
        const sand = Math.max(1 - smoothstep(18, 34, sd), 1 - smoothstep(0, 8, t.riverBank[k]));
        r = mix(r, 0.85, sand);
        g = mix(g, 0.78, sand);
        b = mix(b, 0.58, sand);
        if (city.districts.parks.some((p) => Math.hypot(p.center.x - i * t.cell, p.center.y - j * t.cell) < p.radius)) {
          r = 0.36;
          g = 0.55;
          b = 0.3;
        }
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
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }

  private buildWater(city: City): THREE.Mesh {
    const s = city.config.size;
    const geo = new THREE.PlaneGeometry(s * 6, s * 6);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3f7fa8, transparent: true, opacity: 0.88 }));
    mesh.position.set(s / 2, -0.4, s / 2);
    return mesh;
  }

  /** Height of the road surface along an edge; bridges run straight between their abutments. */
  private profile(city: City, e: RoadEdge, pts: { x: number; y: number }[]): number[] {
    const t = city.terrain;
    const half = ROAD[e.cls].width / 2;
    const ground = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (-(b.y - a.y) / l) * half;
      const ny = ((b.x - a.x) / l) * half;
      return Math.max(heightAt(t, p.x, p.y), heightAt(t, p.x + nx, p.y + ny), heightAt(t, p.x - nx, p.y - ny));
    });
    if (!e.bridge) return ground;
    const h0 = Math.max(ground[0], DECK_HEIGHT);
    const h1 = Math.max(ground[ground.length - 1], DECK_HEIGHT);
    return ground.map((_, i) => mix(h0, h1, i / (ground.length - 1)));
  }

  private buildRoads(city: City, cls: RoadClass): THREE.Mesh {
    const style = ROAD[cls];
    const pos: number[] = [];
    const index: number[] = [];
    for (const e of city.graph.edges) {
      if (e.cls !== cls) continue;
      const pts = resample(e.points, 6);
      const hs = this.profile(city, e, pts);
      const base = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = (-(b.y - a.y) / l) * (style.width / 2);
        const ny = ((b.x - a.x) / l) * (style.width / 2);
        const y = hs[i] + style.lift;
        pos.push(pts[i].x + nx, y, pts[i].y + ny, pts[i].x - nx, y, pts[i].y - ny);
        if (i > 0) {
          const k = base + i * 2;
          index.push(k - 2, k - 1, k, k, k - 1, k + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: style.color, side: THREE.DoubleSide }));
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
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }
}
