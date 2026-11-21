import './style.css';
import { MapView, Layers } from './debug/mapView';
import { City, generateCity } from './gen/city';
import { CityView } from './view3d/cityView';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('map') as HTMLCanvasElement;
const seedInput = document.getElementById('seed') as HTMLInputElement;
const statsEl = document.getElementById('stats')!;
const view = new MapView(canvas);
const size = Number(params.get('size')) || 2400;
let city: City;
let view3d: CityView | null = null;
let view3dSeed = -1;

function setMode(mode: '2d' | '3d'): void {
  document.body.classList.toggle('mode3d', mode === '3d');
  document.getElementById('mode2d')!.classList.toggle('active', mode === '2d');
  document.getElementById('mode3d')!.classList.toggle('active', mode === '3d');
  if (mode === '3d') {
    view3d ??= new CityView(document.getElementById('scene') as HTMLCanvasElement);
    if (view3dSeed !== city.config.seed) view3d.setCity(city);
    view3dSeed = city.config.seed;
    view3d.start();
  } else {
    view3d?.stop();
    view.render();
  }
  const url = new URL(location.href);
  url.searchParams.set('view', mode);
  history.replaceState(null, '', url);
}

for (const name of (params.get('layers') ?? '').split(',')) {
  if (name in view.layers) view.layers[name as keyof Layers] = true;
}
document.querySelectorAll<HTMLInputElement>('#layers input').forEach((el) => {
  const name = el.dataset.layer as keyof Layers;
  el.checked = view.layers[name];
  el.addEventListener('change', () => {
    view.layers[name] = el.checked;
    view.render();
  });
});
if (params.has('nopanel')) document.getElementById('panel')!.style.display = 'none';

function showStats(city: City): void {
  const s = city.stats;
  const km = (v: number) => (v / 1000).toFixed(1) + ' km';
  statsEl.textContent = [
    `交差点 ${s.nodes} / 区間 ${s.edges}`,
    `行き止まり ${s.degree[1]}`,
    `T字路 ${s.degree[3]} / 十字路 ${s.degree[4]} / 五差路以上 ${s.degree[5] + s.degree[6]}`,
    `高速 ${km(s.length.highway)} (IC ${s.interchanges})`,
    `幹線 ${km(s.length.arterial)} / 補助幹線 ${km(s.length.collector)}`,
    `生活道路 ${km(s.length.local)}`,
    `橋 ${s.bridges} / 生成 ${s.ms.toFixed(0)} ms`,
  ].join('\n');
}

function generate(seed: number): void {
  seedInput.value = String(seed);
  city = generateCity({ seed, size });
  (window as unknown as { city: City }).city = city;
  view.setCity(city);
  showStats(city);
  if (document.body.classList.contains('mode3d')) setMode('3d');
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
}

document.getElementById('generate')!.addEventListener('click', () => generate(Number(seedInput.value) || 0));
document.getElementById('random')!.addEventListener('click', () => generate(Math.floor(Math.random() * 1e6)));
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') generate(Number(seedInput.value) || 0);
});

document.getElementById('mode2d')!.addEventListener('click', () => setMode('2d'));
document.getElementById('mode3d')!.addEventListener('click', () => setMode('3d'));

const seedParam = Number(params.get('seed') || NaN);
generate(Number.isFinite(seedParam) ? seedParam : 1);
setMode(params.get('view') === '3d' ? '3d' : '2d');
