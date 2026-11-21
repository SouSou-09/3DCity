import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TEXTURES, TextureData, TextureSpec, renderTexture, textureSpec } from '../assets/tex';
import { ModelData } from '../assets/mesh/builder';
import { MODELS, MODEL_CATEGORIES, ModelSpec } from '../assets/mesh/registry';
import './catalog.css';

const TEX_CATEGORIES: [string, string][] = [
  ['asphalt', 'アスファルト'], ['concrete', 'コンクリート'], ['paving', '舗装材'], ['curb', '縁石'], ['ground', '地面'],
  ['structure', '構造物'], ['line', '区画線'], ['crosswalk', '横断歩道・停止線'], ['symbol', '路面標示'], ['cover', '蓋・汚れ'],
];
const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let tab: 'textures' | 'models' = params.get('tab') === 'textures' ? 'textures' : 'models';
let cat = params.get('cat') ?? 'all';
/** Texture detail used in the 3D views (1 = full). */
const quality = Number(params.get('q')) || 0.5;

// --- Texture cache. ---
const dataCache = new Map<string, TextureData>();
function texData(id: string, scale: number): TextureData {
  const key = `${id}@${scale}`;
  let d = dataCache.get(key);
  if (!d) dataCache.set(key, (d = renderTexture(textureSpec(id), scale)));
  return d;
}
function paint(canvas: HTMLCanvasElement, d: TextureData, pixels: Uint8ClampedArray, decal: boolean): void {
  canvas.width = d.w;
  canvas.height = d.h;
  const img = new ImageData(d.w, d.h);
  for (let j = 0; j < d.h; j++) {
    for (let i = 0; i < d.w; i++) {
      const s = (j * d.w + i) * 4;
      const o = ((d.h - 1 - j) * d.w + i) * 4;
      const a = decal ? pixels[s + 3] / 255 : 1;
      for (let c = 0; c < 3; c++) img.data[o + c] = pixels[s + c] * a + 56 * (1 - a);
      img.data[o + 3] = 255;
    }
  }
  canvas.getContext('2d')!.putImageData(img, 0, 0);
}

const matCache = new Map<string, THREE.Material>();
function material(id: string, layer: number): THREE.Material {
  const key = `${id}#${layer}`;
  let m = matCache.get(key);
  if (m) return m;
  const spec = textureSpec(id);
  const d = texData(id, quality);
  const make = (pixels: Uint8ClampedArray, srgb: boolean): THREE.DataTexture => {
    const t = new THREE.DataTexture(new Uint8Array(pixels.buffer), d.w, d.h, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const orm = make(d.orm, false);
  m = new THREE.MeshStandardMaterial({
    map: make(d.albedo, true), normalMap: make(d.normal, false), roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
    transparent: spec.decal, depthWrite: !spec.decal, polygonOffset: layer > 0, polygonOffsetFactor: -layer * 2, polygonOffsetUnits: -layer * 4,
    side: spec.decal ? THREE.FrontSide : THREE.DoubleSide, shadowSide: THREE.DoubleSide,
  });
  matCache.set(key, m);
  return m;
}

function modelGroup(data: ModelData): THREE.Group {
  const g = new THREE.Group();
  for (const p of data.parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(p.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uvs, 2));
    geo.setIndex(p.indices);
    const mesh = new THREE.Mesh(geo, material(p.material, p.layer));
    mesh.renderOrder = p.layer;
    mesh.castShadow = p.layer === 0;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// --- One renderer for the viewer and (resized) for thumbnails. ---
class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 3000);
  sun = new THREE.DirectionalLight(0xfff2dc, 3);
  current: THREE.Object3D | null = null;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x9fb8d0);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x6a6258, 1.5), this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
  }
  show(obj: THREE.Object3D, min: number[], max: number[], dir: [number, number, number] = [0.55, 0.5, 0.75]): THREE.Vector3 {
    if (this.current) this.scene.remove(this.current);
    this.current = obj;
    this.scene.add(obj);
    const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
    const d = new THREE.Vector3(...dir).normalize();
    this.camera.position.copy(c).addScaledVector(d, (r / Math.sin((this.camera.fov * Math.PI) / 360)) * 0.82);
    this.camera.near = r / 100;
    this.camera.far = r * 20;
    this.camera.lookAt(c);
    this.sun.position.copy(c).add(new THREE.Vector3(-0.5, 0.8, 0.35).multiplyScalar(r * 2));
    this.sun.target.position.copy(c);
    const s = this.sun.shadow.camera;
    s.left = s.bottom = -r * 1.1;
    s.right = s.top = r * 1.1;
    s.near = 0.1;
    s.far = r * 5;
    s.updateProjectionMatrix();
    return c;
  }
  render(w: number, h: number, ratio = 1): void {
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
}
const thumbStage = new Stage(document.createElement('canvas'));
let viewStage: Stage | null = null;
let controls: OrbitControls | null = null;
let raf = 0;

function texturePreview(spec: TextureSpec): { obj: THREE.Object3D; min: number[]; max: number[] } {
  // A tiled patch of ground (or the decal on asphalt) lit at a low angle so that relief shows.
  const reps = spec.decal ? 1 : spec.tile === 'xy' ? 3 : 1;
  const repsX = spec.tile === 'x' ? 4 : reps;
  const repsY = spec.tile === 'y' ? 3 : reps;
  const w = spec.meters[0] * repsX;
  const h = spec.meters[1] * repsY;
  const g = new THREE.Group();
  const plane = (mat: THREE.Material, y: number, pw: number, ph: number, ru: number, rv: number): void => {
    const geo = new THREE.PlaneGeometry(pw, ph);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    g.add(m);
  };
  if (spec.decal) plane(material('asphalt/plain-used-clean', 0), 0, w + 1.5, h + 1.5, (w + 1.5) / 4, (h + 1.5) / 4);
  plane(material(spec.id, spec.decal ? 2 : 0), spec.decal ? 0.01 : 0, w, h, repsX, repsY);
  return { obj: g, min: [-w / 2, 0, -h / 2], max: [w / 2, 0, h / 2] };
}

// --- Detail overlay. ---
function open(kind: 'tex' | 'model', id: string): void {
  const detail = $('detail');
  detail.hidden = false;
  detail.className = kind;
  const canvas = $<HTMLCanvasElement>('viewer');
  viewStage ??= new Stage(canvas);
  controls ??= new OrbitControls(viewStage.camera, canvas);
  $('maps').innerHTML = '';
  let target: THREE.Vector3;
  if (kind === 'model') {
    const spec = MODELS.find((m) => m.id === id)!;
    const data = spec.build();
    const size = data.max.map((v, i) => (v - data.min[i]).toFixed(1));
    $('title').textContent = spec.label;
    $('info').textContent = `${spec.id} ・ ${size[0]} × ${size[2]} m(高さ ${size[1]} m)・ ${data.triangles.toLocaleString()} 三角形 ・ ${data.parts.length} マテリアル`;
    target = viewStage.show(modelGroup(data), data.min, data.max);
  } else {
    const spec = textureSpec(id);
    const d = texData(id, 1);
    $('title').textContent = spec.label;
    $('info').textContent = `${spec.id} ・ ${spec.meters[0]} × ${spec.meters[1]} m ・ ${d.w} × ${d.h} px ・ ${spec.decal ? 'デカール(透過)' : 'タイル: ' + spec.tile}`;
    const p = texturePreview(spec);
    target = viewStage.show(p.obj, p.min, p.max, [0.25, 0.75, 0.6]);
    for (const [name, px] of [['アルベド', d.albedo], ['法線', d.normal], ['AO / 粗さ / 金属', d.orm]] as const) {
      const fig = document.createElement('figure');
      const c = document.createElement('canvas');
      paint(c, d, px, name === 'アルベド' && spec.decal);
      fig.append(c, Object.assign(document.createElement('figcaption'), { textContent: name }));
      $('maps').append(fig);
    }
  }
  controls.target.copy(target);
  controls.update();
  cancelAnimationFrame(raf);
  const loop = (): void => {
    if (detail.hidden) return;
    viewStage!.render(canvas.clientWidth, canvas.clientHeight, Math.min(2, devicePixelRatio));
    raf = requestAnimationFrame(loop);
  };
  loop();
  const url = new URL(location.href);
  url.searchParams.set(kind, id);
  history.replaceState(null, '', url);
}
$('close').onclick = () => {
  $('detail').hidden = true;
  const url = new URL(location.href);
  url.searchParams.delete('tex');
  url.searchParams.delete('model');
  history.replaceState(null, '', url);
};

// --- Grid with lazily drawn thumbnails. ---
const queue: (() => void)[] = [];
let pumping = false;
function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = (): void => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 24) queue.shift()!();
    if (queue.length) setTimeout(step, 0);
    else pumping = false;
  };
  setTimeout(step, 0);
}
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    observer.unobserve(e.target);
    const job = (e.target as HTMLElement & { job?: () => void }).job;
    if (job) queue.push(job);
  }
  pump();
}, { rootMargin: '300px' });

function card(label: string, id: string, draw: (c: HTMLCanvasElement) => void, onClick: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const text = document.createElement('div');
  text.append(Object.assign(document.createElement('b'), { textContent: label }), Object.assign(document.createElement('code'), { textContent: id }));
  el.append(c, text);
  el.onclick = onClick;
  (el as HTMLElement & { job?: () => void }).job = () => draw(c);
  observer.observe(el);
  return el;
}
function modelThumb(spec: ModelSpec, c: HTMLCanvasElement): void {
  const data = spec.build();
  const group = modelGroup(data);
  thumbStage.show(group, data.min, data.max);
  thumbStage.render(480, 300);
  c.width = 480;
  c.height = 300;
  c.getContext('2d')!.drawImage(thumbStage.renderer.domElement, 0, 0);
  group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}

function refresh(): void {
  document.body.className = tab;
  const cats = tab === 'textures' ? TEX_CATEGORIES : MODEL_CATEGORIES;
  const items: { category: string }[] = tab === 'textures' ? [...TEXTURES] : [...MODELS];
  if (cat !== 'all' && !cats.some(([id]) => id === cat)) cat = 'all';
  $('tabs').replaceChildren(...(['models', 'textures'] as const).map((t) => {
    const b = Object.assign(document.createElement('button'), { textContent: t === 'models' ? `3Dモデル ${MODELS.length}` : `テクスチャ ${TEXTURES.length}`, className: t === tab ? 'active' : '' });
    b.onclick = () => { tab = t; cat = 'all'; refresh(); };
    return b;
  }));
  $('cats').replaceChildren(...[['all', 'すべて'] as [string, string], ...cats].map(([id, label]) => {
    const n = id === 'all' ? items.length : items.filter((i) => i.category === id).length;
    const b = Object.assign(document.createElement('button'), { textContent: `${label} ${n}`, className: id === cat ? 'active' : '' });
    b.onclick = () => { cat = id; refresh(); };
    return b;
  }));
  queue.length = 0;
  observer.disconnect();
  const shown = items.filter((i) => cat === 'all' || i.category === cat);
  $('count').textContent = `${shown.length} 件`;
  $('grid').replaceChildren(...shown.map((item) => {
    if (tab === 'textures') {
      const s = item as TextureSpec;
      return card(s.label, s.id, (c) => { const d = texData(s.id, 0.25); paint(c, d, d.albedo, s.decal); }, () => open('tex', s.id));
    }
    const m = item as ModelSpec;
    return card(m.label, m.id, (c) => modelThumb(m, c), () => open('model', m.id));
  }));
  const url = new URL(location.href);
  url.searchParams.set('tab', tab);
  url.searchParams.set('cat', cat);
  history.replaceState(null, '', url);
}
refresh();
if (params.get('model') && MODELS.some((m) => m.id === params.get('model'))) open('model', params.get('model')!);
else if (params.get('tex') && TEXTURES.some((t) => t.id === params.get('tex'))) open('tex', params.get('tex')!);
