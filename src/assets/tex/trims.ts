import { Field, Layers, RGB, TextureCategory, TextureData, TextureSpec, Tex, clamp01, hash2, hex, lerp, sstep } from './core';
import { TextOpts, drawText } from './signkit';
import * as S from './surfaces';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'reflect' | 'emissive' | 'decal' | 'cutout'>>;
function add(category: TextureCategory, id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 28000 + list.length * 7;
  list.push({ id: `${category}/${id}`, label, category, meters, tile: 'none', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}
type Paint = { rough?: number; metal?: number; height?: number; opacity?: number; alpha?: boolean; soft?: number };
const GLASS: RGB = [0.1, 0.14, 0.2];
const shadeC = (c: RGB, m: number): RGB => [c[0] * m, c[1] * m, c[2] * m];

/** Flat artwork built from rectangles, discs and lettering, then weathered. */
export class Art {
  readonly L: Layers;
  readonly w: number;
  readonly h: number;
  constructor(readonly tex: Tex, bg: RGB, rough = 0.6, alpha = 1) {
    this.L = new Layers(tex, bg, rough, alpha);
    this.w = tex.mw;
    this.h = tex.mh;
  }
  put(c: RGB, draw: (m: Field) => void, o: Paint = {}): void {
    const m = this.tex.field();
    draw(m);
    this.L.paint(m, c, { metal: 0, ...o });
  }
  rect(c: RGB, x0: number, y0: number, x1: number, y1: number, o: Paint = {}): void {
    this.put(c, (m) => this.tex.rect(m, x0, y0, x1, y1, 1, o.soft ?? 0), o);
  }
  disc(c: RGB, x: number, y: number, r: number, o: Paint = {}): void {
    this.put(c, (m) => this.tex.disc(m, x, y, r, 1, o.soft ?? 0), o);
  }
  line(c: RGB, pts: [number, number][], half: number, o: Paint = {}): void {
    this.put(c, (m) => this.tex.stroke(m, pts, half), o);
  }
  text(c: RGB, s: string, x: number, y: number, size: number, t: TextOpts = {}, o: Paint = {}): void {
    this.put(c, (m) => drawText(this.tex, m, s, x, y, size, { align: 'c', ...t }), o);
  }
  /** A moulded panel: a dark groove around a field that stands `depth` proud (or sunk when negative). */
  panel(c: RGB, x0: number, y0: number, x1: number, y1: number, depth = 0.006): void {
    this.rect(shadeC(c, 0.62), x0, y0, x1, y1, { height: -0.004 });
    this.rect(c, x0 + 0.014, y0 + 0.014, x1 - 0.014, y1 - 0.014, { height: depth });
    this.rect(shadeC(c, 1.12), x0 + 0.014, y1 - 0.024, x1 - 0.014, y1 - 0.014, { height: depth, opacity: 0.6 });
  }
  /** A pane: dark glass with a lighter sky reflection towards the top. */
  glass(x0: number, y0: number, x1: number, y1: number, frame?: RGB): void {
    if (frame) this.rect(frame, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, { height: 0.004 });
    this.rect(GLASS, x0, y0, x1, y1, { rough: 0.06, height: -0.004 });
    this.rect([0.5, 0.6, 0.74], x0, lerp(y0, y1, 0.45), x1, y1, { rough: 0.06, opacity: 0.3, soft: (y1 - y0) * 0.3, height: -0.004 });
  }
  /** Dirt gathering low down, rain streaks, scuffs and (when `tags`) spray paint. */
  done(seed: number, age = 0.2, tags = 0): TextureData {
    const { tex, L, h } = this;
    const streak = tex.noise(0.05, 0.8, seed + 1, 3);
    const grime = tex.noise(0.2, 0.2, seed + 2, 3);
    const tagA = tex.noise(0.5, 0.35, seed + 3, 3);
    const tagB = tex.noise(0.3, 0.3, seed + 4, 2);
    tex.map((x, y, k) => {
      const low = 1 - y / h;
      const dirt = clamp01(age * (0.1 + grime(x, y) * 0.35 + sstep(0.2, 0.8, streak(x, y)) * 0.3 + low * low * low * 0.7));
      let [r, g, b] = [L.r[k] * (1 - dirt * 0.6), L.g[k] * (1 - dirt * 0.64), L.b[k] * (1 - dirt * 0.7)];
      const tag = tags * (1 - sstep(0.01, 0.02, Math.abs(tagA(x, y)))) * sstep(-0.15, 0.05, tagB(x, y));
      if (tag > 0) {
        const tc: RGB = tagB(x + 5, y) > 0 ? [0.06, 0.06, 0.08] : hash2(Math.floor(x), 3, seed) > 0.5 ? [0.75, 0.75, 0.78] : [0.7, 0.15, 0.45];
        r = lerp(r, tc[0], tag);
        g = lerp(g, tc[1], tag);
        b = lerp(b, tc[2], tag);
      }
      L.r[k] = r;
      L.g[k] = g;
      L.b[k] = b;
      L.rough[k] = clamp01(L.rough[k] + dirt * 0.4);
      return 0;
    });
    return L.finish();
  }
}

// --- Doors. ---
const DOOR_COLORS: [string, string, number][] = [['white', '白', 0xe6e4dc], ['red', '赤', 0x9c2c24], ['blue', '青', 0x2c4c7c], ['green', '深緑', 0x2c4c3a], ['brown', '茶', 0x5c3c26], ['black', '黒', 0x202022], ['yellow', '黄', 0xd8b030], ['teal', '青緑', 0x2c7c7c]];
function hardware(a: Art, x: number, y: number, bright = true): void {
  const c: RGB = bright ? [0.72, 0.6, 0.3] : [0.6, 0.6, 0.6];
  a.rect(shadeC(c, 0.8), x - 0.03, y - 0.1, x + 0.03, y + 0.1, { rough: 0.35, height: 0.006 });
  a.disc(c, x, y - 0.03, 0.028, { rough: 0.3, height: 0.02 });
  a.disc(shadeC(c, 0.5), x, y + 0.055, 0.012, { rough: 0.4 });
}
/** Hinged front door: `style` picks the panel layout. */
function frontDoor(tex: Tex, seed: number, c: RGB, style: number, age: number): TextureData {
  const a = new Art(tex, c, 0.5);
  const [w, h] = [a.w, a.h];
  const m = 0.11;
  if (style === 0) {
    // Six panels.
    for (const [y0, y1] of [[0.14, 0.78], [0.9, 1.56], [1.68, h - 0.12]]) for (const [x0, x1] of [[m, w / 2 - 0.035], [w / 2 + 0.035, w - m]]) a.panel(c, x0, y0, x1, y1);
  } else if (style === 1) {
    // Half glazed with nine lights.
    a.glass(m, 1.1, w - m, h - 0.14, shadeC(c, 0.8));
    for (let i = 1; i < 3; i++) {
      a.rect(c, lerp(m, w - m, i / 3) - 0.012, 1.1, lerp(m, w - m, i / 3) + 0.012, h - 0.14, { height: 0.004 });
      a.rect(c, m, lerp(1.1, h - 0.14, i / 3) - 0.012, w - m, lerp(1.1, h - 0.14, i / 3) + 0.012, { height: 0.004 });
    }
    for (const [x0, x1] of [[m, w / 2 - 0.035], [w / 2 + 0.035, w - m]]) a.panel(c, x0, 0.14, x1, 0.96);
  } else if (style === 2) {
    // Fan light over four panels.
    a.put(shadeC(c, 0.7), (f) => tex.disc(f, w / 2, 1.72, 0.3));
    a.put(GLASS, (f) => tex.disc(f, w / 2, 1.72, 0.27), { rough: 0.06 });
    a.rect(c, 0, 1.4, w, 1.72, {});
    for (const [y0, y1] of [[0.14, 0.72], [0.84, 1.6]]) for (const [x0, x1] of [[m, w / 2 - 0.035], [w / 2 + 0.035, w - m]]) a.panel(c, x0, y0, x1, y1);
  } else if (style === 3) {
    // Flush modern door with a tall slot light.
    a.glass(w - 0.3, 0.5, w - 0.2, h - 0.3, shadeC(c, 0.7));
    for (let i = 1; i < 5; i++) a.rect(shadeC(c, 0.75), 0, (h * i) / 5 - 0.004, w, (h * i) / 5 + 0.004, { height: -0.003 });
  } else {
    // Plank door with strap hinges.
    for (let i = 1; i < 6; i++) a.rect(shadeC(c, 0.6), (w * i) / 6 - 0.004, 0, (w * i) / 6 + 0.004, h, { height: -0.003 });
    for (const y of [0.35, h - 0.35]) a.rect([0.08, 0.08, 0.08], 0, y - 0.025, w * 0.6, y + 0.025, { height: 0.004 });
    a.glass(w / 2 - 0.1, 1.5, w / 2 + 0.1, 1.72, [0.08, 0.08, 0.08]);
  }
  hardware(a, style === 3 ? 0.1 : w - 0.07, 1.0, style !== 3);
  if (style !== 3) a.rect([0.7, 0.58, 0.3], w / 2 - 0.12, 0.98, w / 2 + 0.12, 1.03, { rough: 0.3, opacity: style === 0 ? 1 : 0 });
  return a.done(seed, age);
}
const STYLE_NAMES = ['6枚パネル', '上半分ガラス', '扇窓つき', 'モダン', '板張り'];
DOOR_COLORS.forEach(([id, label, c], i) => {
  for (const st of [i % 5, (i + 2) % 5]) add('door', `front-${id}-${st}`, `玄関ドア ${label}・${STYLE_NAMES[st]}`, [0.9, 2.1], (t, s) => frontDoor(t, s, hex(c), st, 0.15 + (i % 3) * 0.15));
});
/** Aluminium-framed glass shop door, single or double. */
function glassDoor(tex: Tex, seed: number, frame: RGB, leaves: number, age: number, wide = 0.09): TextureData {
  const a = new Art(tex, frame, 0.45);
  const lw = a.w / leaves;
  for (let i = 0; i < leaves; i++) {
    const x0 = i * lw;
    a.glass(x0 + wide, 0.25, x0 + lw - wide, a.h - wide - 0.02);
    a.rect(shadeC(frame, 0.5), x0 - 0.004, 0, x0 + 0.004, a.h, { height: -0.004 });
    // Push bar and a sticker or two.
    a.rect(shadeC(frame, 1.1), x0 + wide * 0.5, 1.02, x0 + lw - wide * 0.5, 1.07, { rough: 0.3, height: 0.02 });
    const handle = leaves === 2 ? (i === 0 ? x0 + lw - wide * 0.5 : x0 + wide * 0.5) : x0 + lw - wide * 0.5;
    a.rect([0.75, 0.75, 0.76], handle - 0.012, 0.9, handle + 0.012, 1.3, { rough: 0.25, height: 0.03 });
    if (hash2(i, 1, seed) < 0.7) {
      const sx = x0 + lw / 2;
      a.rect([0.85, 0.15, 0.12], sx - 0.13, 1.42, sx + 0.13, 1.56, { rough: 0.5 });
      a.text([0.96, 0.96, 0.92], hash2(i, 2, seed) < 0.5 ? 'OPEN' : 'PUSH', sx, 1.455, 0.07, { fit: 0.22 });
    }
  }
  return a.done(seed, age);
}
const FRAMES: [string, string, number][] = [['aluminium', 'アルミ', 0xb4b6b8], ['black', '黒', 0x1e1e20], ['bronze', 'ブロンズ', 0x4a3c30], ['white', '白', 0xe4e2da], ['red', '赤', 0x8c2c24], ['green', '緑', 0x2c4a3a]];
FRAMES.forEach(([id, label, c], i) => {
  add('door', `glass-${id}`, `ガラス扉 ${label}`, [0.95, 2.15], (t, s) => glassDoor(t, s, hex(c), 1, 0.15 + (i % 2) * 0.2), { reflect: 0.6 });
  add('door', `glass-double-${id}`, `両開きガラス扉 ${label}`, [1.8, 2.15], (t, s) => glassDoor(t, s, hex(c), 2, 0.15 + (i % 2) * 0.2), { reflect: 0.6 });
});
for (const [id, label, c] of FRAMES.slice(0, 3)) {
  add('door', `lobby-${id}`, `ロビー入口 ${label}`, [3.6, 2.7], (t, s) => glassDoor(t, s, hex(c), 4, 0.1, 0.06), { reflect: 0.6, density: 200 });
}
/** Flat steel service door, single or double. */
function steelDoor(tex: Tex, seed: number, c: RGB, leaves: number, o: { age: number; tags?: number; vent?: boolean; lite?: boolean; sign?: string }): TextureData {
  const a = new Art(tex, c, 0.55);
  const lw = a.w / leaves;
  a.rect(shadeC(c, 0.8), 0, a.h - 0.05, a.w, a.h, {});
  for (let i = 0; i < leaves; i++) {
    const x0 = i * lw;
    a.rect(shadeC(c, 0.45), x0 - 0.005, 0, x0 + 0.005, a.h, { height: -0.004 });
    if (o.vent) for (let y = 0.2; y < 0.55; y += 0.035) a.rect(shadeC(c, 0.55), x0 + 0.2, y, x0 + lw - 0.2, y + 0.015, { height: -0.004 });
    if (o.lite) a.glass(x0 + lw / 2 - 0.1, 1.35, x0 + lw / 2 + 0.1, 1.8, shadeC(c, 0.7));
    const hx = leaves === 2 && i === 0 ? x0 + lw - 0.08 : leaves === 2 ? x0 + 0.08 : x0 + lw - 0.08;
    hardware(a, hx, 1.0, false);
    a.rect([0.6, 0.6, 0.6], x0 + 0.03, 0, x0 + lw - 0.03, 0.2, { rough: 0.4, metal: 0, opacity: hash2(i, 4, seed) < 0.5 ? 0.8 : 0 });
    for (const y of [0.25, 1.05, a.h - 0.3]) a.rect(shadeC(c, 0.7), (i === 0 ? x0 : x0 + lw - 0.012), y - 0.05, (i === 0 ? x0 + 0.012 : x0 + lw), y + 0.05, { height: 0.004 });
  }
  if (o.sign) {
    a.rect([0.9, 0.9, 0.86], lw / 2 - 0.2, 1.5, lw / 2 + 0.2, 1.64, { rough: 0.5 });
    a.text([0.75, 0.1, 0.08], o.sign, lw / 2, 1.535, 0.065, { fit: 0.36 });
  }
  return a.done(seed, o.age, o.tags ?? 0);
}
const STEEL: [string, string, number, { age: number; tags?: number; vent?: boolean; lite?: boolean; sign?: string }][] = [
  ['grey', '灰', 0x7c8084, { age: 0.3 }], ['grey-tagged', '灰・落書き', 0x74787c, { age: 0.7, tags: 1 }], ['brown', '茶', 0x54402e, { age: 0.4, vent: true }], ['green', '緑', 0x34503e, { age: 0.5, sign: 'NO PARKING' }],
  ['blue', '青', 0x2c4870, { age: 0.3, lite: true }], ['white', '白', 0xd4d4ce, { age: 0.5, sign: 'EXIT ONLY' }], ['red', '赤', 0x8c2a22, { age: 0.4, lite: true }], ['black', '黒', 0x222224, { age: 0.3, vent: true }],
  ['beige', 'ベージュ', 0xb8a888, { age: 0.6, tags: 0.7 }], ['rust', '錆色', 0x6c4630, { age: 0.9, sign: 'KEEP OUT' }],
];
for (const [id, label, c, o] of STEEL) add('door', `steel-${id}`, `鉄扉 ${label}`, [0.9, 2.1], (t, s) => steelDoor(t, s, hex(c), 1, o));
for (const [id, label, c, o] of STEEL.slice(0, 6)) add('door', `steel-double-${id}`, `両開き鉄扉 ${label}`, [1.8, 2.1], (t, s) => steelDoor(t, s, hex(c), 2, o));
/** Sectional overhead door: rows of sections, optionally panelled or with a row of lights. */
function sectional(tex: Tex, seed: number, c: RGB, o: { rows: number; cols?: number; lights?: number; ribs?: boolean; age: number; tags?: number; stripes?: boolean; num?: string }): TextureData {
  const a = new Art(tex, c, 0.5);
  const rh = a.h / o.rows;
  for (let r = 0; r < o.rows; r++) {
    a.rect(shadeC(c, 0.5), 0, r * rh - 0.006, a.w, r * rh + 0.006, { height: -0.006 });
    if (o.cols) for (let i = 0; i < o.cols; i++) {
      const [x0, x1] = [(i * a.w) / o.cols + 0.07, ((i + 1) * a.w) / o.cols - 0.07];
      if (r === o.lights) a.glass(x0 + 0.03, r * rh + 0.1, x1 - 0.03, (r + 1) * rh - 0.1, shadeC(c, 0.8));
      else a.panel(c, x0, r * rh + 0.07, x1, (r + 1) * rh - 0.07, 0.005);
    } else {
      if (o.ribs) for (const f of [0.33, 0.66]) a.rect(shadeC(c, 0.8), 0, (r + f) * rh - 0.004, a.w, (r + f) * rh + 0.004, { height: -0.003 });
      if (r === o.lights) for (let i = 0; i < Math.round(a.w / 1.3); i++) a.glass(0.45 + i * 1.3, r * rh + 0.12, 0.45 + i * 1.3 + 0.5, (r + 1) * rh - 0.12, [0.1, 0.1, 0.1]);
    }
  }
  if (o.stripes) for (let x = -0.2; x < a.w; x += 0.3) a.put([0.85, 0.7, 0.1], (m) => tex.poly(m, [[[x, 0.02], [x + 0.15, 0.02], [x + 0.33, 0.2], [x + 0.18, 0.2]]]), { rough: 0.6 });
  if (o.num) a.text(shadeC(c, 0.35), o.num, a.w / 2, a.h - rh * 0.75, rh * 0.5, {});
  a.rect([0.3, 0.3, 0.3], a.w / 2 - 0.08, 0.3, a.w / 2 + 0.08, 0.34, { height: 0.01, rough: 0.4 });
  return a.done(seed, o.age, o.tags ?? 0);
}
const GARAGE: [string, string, number][] = [['white', '白', 0xe2e0d8], ['cream', 'クリーム', 0xd4c8a4], ['brown', '茶', 0x5c4430], ['grey', '灰', 0x8c9094], ['green', '緑', 0x3c5846], ['charcoal', 'チャコール', 0x38393c]];
GARAGE.forEach(([id, label, c], i) => {
  add('door', `garage-${id}`, `ガレージ扉(1台) ${label}`, [2.6, 2.1], (t, s) => sectional(t, s, hex(c), { rows: 4, cols: 4, age: 0.15 + (i % 3) * 0.2, ...(i % 2 ? { lights: 3 } : {}) }), { density: 200 });
  add('door', `garage-wide-${id}`, `ガレージ扉(2台) ${label}`, [4.9, 2.1], (t, s) => sectional(t, s, hex(c), { rows: 4, cols: 8, age: 0.15 + (i % 3) * 0.2, ...(i % 2 ? {} : { lights: 3 }) }), { density: 160 });
});
add('door', 'garage-modern-glass', 'ガレージ扉 アルミとすりガラス', [4.9, 2.1], (t, s) => sectional(t, s, hex(0x3a3c40), { rows: 5, cols: 4, lights: -1, age: 0.1 }), { density: 160, reflect: 0.4 });
add('door', 'garage-flush-wood', 'ガレージ扉 木目フラット', [4.9, 2.1], (t, s) => sectional(t, s, hex(0x7c5434), { rows: 8, age: 0.2 }), { density: 160 });
const DOCK: [string, string, number, string, number, number?][] = [['white', '白', 0xd8d8d2, '1', 0.4], ['white-2', '白・2番', 0xd4d4cc, '2', 0.6], ['grey', '灰', 0x80848a, '3', 0.5], ['blue', '青', 0x2c5080, '4', 0.4], ['green', '緑', 0x34584a, '5', 0.6], ['white-tagged', '白・落書き', 0xcfcfc6, '7', 0.8, 1], ['orange', 'オレンジ', 0xc86428, '12', 0.4], ['rusty', '錆びた灰', 0x74706a, '9', 1]];
for (const [id, label, c, num, age, tags] of DOCK) add('door', `dock-${id}`, `搬入口シャッター ${label}`, [2.7, 3], (t, s) => sectional(t, s, hex(c), { rows: 6, ribs: true, lights: 3, stripes: true, num, age, tags: tags ?? 0 }), { density: 170 });
/** Roll-up shutter slats; tiles both ways. */
function shutter(tex: Tex, seed: number, c: RGB | null, rust: number, tags: number): TextureData {
  const base: RGB = c ?? [0.62, 0.64, 0.66];
  const L = new Layers(tex, base, 0.5);
  const tone = tex.noise(0.5, 0.5, seed, 3);
  const streak = tex.noise(0.06, 0.8, seed + 1, 2);
  const rustN = tex.noise(0.3, 0.2, seed + 2, 4, 0.6);
  const tagA = tex.noise(0.6, 0.4, seed + 3, 3);
  const tagB = tex.noise(0.4, 0.4, seed + 4, 2);
  tex.map((x, y, k) => {
    const f = (y / 0.075) % 1;
    const curve = Math.sin(f * Math.PI);
    const lip = 1 - sstep(0, 0.12, f);
    let m = (0.72 + 0.34 * curve) * (1 - lip * 0.5) * (1 + tone(x, y) * 0.06) * (1 - sstep(0.2, 0.8, streak(x, y)) * 0.15);
    const rv = sstep(1 - rust * 0.7, 1.1 - rust * 0.7, rustN(x, y) + 0.5 + lip * 0.2);
    const tag = tags * (1 - sstep(0.012, 0.024, Math.abs(tagA(x, y)))) * sstep(-0.1, 0.1, tagB(x, y));
    const tc: RGB = tagB(x + 3, y) > 0.05 ? [0.06, 0.06, 0.08] : tagB(x, y + 3) > 0 ? [0.8, 0.8, 0.82] : [0.2, 0.35, 0.75];
    m *= 1 - rv * 0.2;
    L.r[k] = lerp(lerp(base[0] * m, 0.38 * m, rv), tc[0] * (0.8 + 0.2 * curve), tag);
    L.g[k] = lerp(lerp(base[1] * m, 0.2 * m, rv), tc[1] * (0.8 + 0.2 * curve), tag);
    L.b[k] = lerp(lerp(base[2] * m, 0.1 * m, rv), tc[2] * (0.8 + 0.2 * curve), tag);
    L.rough[k] = lerp(c ? 0.5 : 0.38, 0.9, rv);
    L.metal[k] = c ? 0 : 0.7 * (1 - rv) * (1 - tag);
    L.height[k] = curve * 0.008 - lip * 0.004;
    return 0;
  });
  return L.finish();
}
const SHUTTERS: [string, string, number | null, number, number][] = [['steel', '亜鉛めっき', null, 0.1, 0], ['steel-tagged', '亜鉛めっき・落書き', null, 0.25, 1], ['steel-rusty', '錆', null, 0.8, 0.4], ['white', '白', 0xdcdcd6, 0.1, 0], ['grey', '灰', 0x70747a, 0.15, 0], ['grey-tagged', '灰・落書き', 0x6c7076, 0.2, 1], ['green', '緑', 0x34584a, 0.2, 0], ['blue', '青', 0x2c5080, 0.2, 0.5], ['brown', '茶', 0x5c4434, 0.3, 0], ['red', '赤', 0x8c2c24, 0.2, 0], ['black', '黒', 0x242426, 0.05, 0], ['yellow', '黄', 0xd0a830, 0.25, 0.6]];
for (const [id, label, c, rust, tags] of SHUTTERS) add('door', `shutter-${id}`, `巻き上げシャッター ${label}`, [2.4, 2.4], (t, s) => shutter(t, s, c === null ? null : hex(c), rust, tags), { tile: 'xy', density: 200 });

// --- Paint for trim, gutters, railings and frames. ---
export function paint(tex: Tex, seed: number, c: RGB, o: { metal?: number; rough?: number; wear?: number; chips?: number } = {}): TextureData {
  const L = new Layers(tex, c, o.rough ?? 0.5);
  const tone = tex.noise(0.4, 0.4, seed, 3);
  const fine = tex.noise(0.01, 0.01, seed + 1, 2);
  const streak = tex.noise(0.05, 0.6, seed + 2, 2);
  const chip = tex.noise(0.08, 0.08, seed + 3, 4, 0.6);
  tex.map((x, y, k) => {
    const st = sstep(0.15, 0.8, streak(x, y)) * (o.wear ?? 0.3) * 0.35;
    const ch = sstep(0.46 - (o.wear ?? 0.3) * 0.16, 0.5 - (o.wear ?? 0.3) * 0.16, chip(x, y)) * (o.chips ?? 1);
    const m = (1 + tone(x, y) * 0.07 + fine(x, y) * 0.04) * (1 - st);
    L.r[k] = lerp(c[0] * m, 0.32, ch * 0.7);
    L.g[k] = lerp(c[1] * m, 0.28, ch * 0.7);
    L.b[k] = lerp(c[2] * m, 0.25, ch * 0.7);
    L.rough[k] = clamp01((o.rough ?? 0.5) + st * 0.5 + ch * 0.3);
    L.metal[k] = (o.metal ?? 0) * (1 - ch);
    L.height[k] = fine(x, y) * 0.0003 - ch * 0.0006;
    return 0;
  });
  return L.finish();
}
const PAINTS: [string, string, number, { metal?: number; rough?: number; wear?: number }?][] = [
  ['white', '白', 0xe8e6de], ['white-old', '白・古い', 0xd4d0c4, { wear: 0.9 }], ['cream', 'クリーム', 0xdccfa8], ['grey', '灰', 0x8c9094], ['charcoal', 'チャコール', 0x3a3c40], ['black', '黒', 0x1c1c1e, { rough: 0.4 }],
  ['brown', '茶', 0x4c3424], ['brown-old', '茶・古い', 0x54402e, { wear: 0.9 }], ['green', '深緑', 0x2c4a3a], ['red', '赤', 0x8c2c24], ['blue', '青', 0x2c4c74], ['teal', '青緑', 0x2c7478], ['yellow', '黄', 0xd8b438], ['orange', 'オレンジ', 0xcc6c28],
  ['pink', 'ピンク', 0xd89c9c], ['tan', '黄褐色', 0xb49c78], ['aluminium', 'アルミ', 0xb4b6b8, { rough: 0.35, wear: 0.1 }], ['bronze', 'ブロンズ', 0x4a3c30, { rough: 0.35, wear: 0.1 }], ['galvanized', '亜鉛めっき', 0x9a9ea2, { rough: 0.45, wear: 0.4 }], ['rust', '錆止め色', 0x7c3c2c, { wear: 0.7 }],
];
for (const [id, label, c, o] of PAINTS) add('trim', `paint-${id}`, `塗装 ${label}`, [1, 1], (t, s) => paint(t, s, hex(c), o), { tile: 'xy', density: 128 });

// --- Awning canvas. ---
/** A whole number of threads per metre, so the weave meets itself at the tile edge. */
const WEAVE = 2 * Math.PI * 100;
function canvas(tex: Tex, seed: number, a: RGB, b: RGB | null, stripe: number, age: number): TextureData {
  const L = new Layers(tex, a, 0.85);
  const fade = tex.noise(0.5, 0.5, seed, 3);
  const streak = tex.noise(0.05, 0.5, seed + 1, 2);
  tex.map((x, y, k) => {
    const c = b && (x / stripe) % 2 >= 1 ? b : a;
    const w = Math.sin(x * WEAVE) * Math.sin(y * WEAVE);
    const weave = 1 + 0.03 * w;
    const f = age * (0.35 + fade(x, y) * 0.4);
    const d = 1 - age * sstep(0.1, 0.8, streak(x, y)) * 0.35;
    const chalk = (c[0] + c[1] + c[2]) / 3 * 0.5 + 0.35;
    L.r[k] = lerp(c[0], chalk, f) * weave * d;
    L.g[k] = lerp(c[1], chalk, f) * weave * d;
    L.b[k] = lerp(c[2], chalk * 0.97, f) * weave * d;
    L.height[k] = 0.0004 * w;
    return 0;
  });
  return L.finish();
}
const W: RGB = hex(0xe8e4d8);
const AWN: [string, string, number, boolean, number][] = [['red', '赤', 0xa82c24, false, 0.2], ['green', '緑', 0x2c5c40, false, 0.2], ['navy', '紺', 0x24345c, false, 0.15], ['black', '黒', 0x1e1e20, false, 0.1], ['burgundy', 'えんじ', 0x6c2430, false, 0.2], ['tan', '黄褐色', 0xc4a878, false, 0.3], ['orange', 'オレンジ', 0xd87428, false, 0.25], ['yellow', '黄', 0xdcb838, false, 0.3], ['teal', '青緑', 0x2c7c7c, false, 0.2], ['faded', '色あせた赤', 0xa82c24, false, 0.9],
  ['stripe-red', '赤白の縞', 0xa82c24, true, 0.2], ['stripe-green', '緑白の縞', 0x2c5c40, true, 0.2], ['stripe-blue', '青白の縞', 0x2c4c8c, true, 0.2], ['stripe-black', '黒白の縞', 0x1e1e20, true, 0.15], ['stripe-yellow', '黄白の縞', 0xdcb030, true, 0.3], ['stripe-faded', '色あせた緑白の縞', 0x2c5c40, true, 0.9]];
for (const [id, label, c, striped, age] of AWN) add('trim', `awning-${id}`, `日除けの布 ${label}`, [1, 1], (t, s) => canvas(t, s, hex(c), striped ? W : null, 0.125, age), { tile: 'xy', density: 200 });

// --- Shop signs. Every name is made up. ---
interface Sign { text: string; bg: number; fg: number; sub?: string; band?: number }
const SIGNS: Sign[] = [
  { text: 'LIQUOR', bg: 0xd8c020, fg: 0xb01c18, sub: 'BEER  WINE  LOTTO' }, { text: 'DONUTS', bg: 0xe890a8, fg: 0x5c2c1c, sub: 'OPEN 24 HOURS' }, { text: 'LAUNDROMAT', bg: 0x2c6cb0, fg: 0xf0f0e8, sub: 'COIN OP  WASH AND FOLD' }, { text: 'TACOS EL REY', bg: 0xc83020, fg: 0xf4e060, band: 0x2c8c40 },
  { text: 'PAWN SHOP', bg: 0x1c1c1e, fg: 0xe8c030, sub: 'WE BUY GOLD' }, { text: 'NAILS AND SPA', bg: 0xb04c9c, fg: 0xf8f0f4 }, { text: 'BARBER SHOP', bg: 0xf0ece0, fg: 0x1c3c7c, band: 0xb82c24 }, { text: 'MARKET', bg: 0x2c8444, fg: 0xf4f0d8, sub: 'FRESH PRODUCE  MEAT  DELI' },
  { text: 'PHARMACY', bg: 0xf0f0ec, fg: 0x1c7c4c, sub: 'PRESCRIPTIONS' }, { text: 'CAFE LUNA', bg: 0x3c2c24, fg: 0xe8d4a8 }, { text: 'USED BOOKS', bg: 0x244c3c, fg: 0xe8dcb4 }, { text: 'PIZZA', bg: 0xb82420, fg: 0xf4f0e0, sub: 'BY THE SLICE', band: 0x2c7c3c },
  { text: 'TATTOO', bg: 0x141416, fg: 0xd82c2c }, { text: 'CHECKS CASHED', bg: 0xe8c81c, fg: 0x141414, sub: 'MONEY ORDERS  PAYDAY LOANS' }, { text: 'AUTO PARTS', bg: 0x1c3c8c, fg: 0xf4d020 }, { text: 'FLOWERS', bg: 0xf0e8e0, fg: 0xb03c6c },
  { text: 'DRY CLEANERS', bg: 0x2c8c9c, fg: 0xf4f4f0, sub: 'ALTERATIONS' }, { text: 'SMOKE SHOP', bg: 0x2c2c30, fg: 0x58d858 }, { text: 'BURGERS', bg: 0xe8a020, fg: 0x8c1c14, sub: 'SHAKES  FRIES' }, { text: 'DISCOUNT 99', bg: 0x2c4cb0, fg: 0xf4e030 },
  { text: 'HARDWARE', bg: 0xb82c20, fg: 0xf4f0e4, sub: 'PAINT  TOOLS  KEYS' }, { text: 'RECORDS', bg: 0xe4dcc4, fg: 0x1c1c1c }, { text: 'BAIL BONDS', bg: 0xf0f0f0, fg: 0xb01818, sub: 'OPEN 24 HRS' }, { text: 'NOODLE HOUSE', bg: 0x8c1c1c, fg: 0xe8c860 },
  { text: 'FURNITURE', bg: 0x5c3c24, fg: 0xf0e4c4, sub: 'NO CREDIT NEEDED' }, { text: 'CELL PHONES', bg: 0x1c1c20, fg: 0x40b8e8, sub: 'REPAIR  UNLOCK' }, { text: 'BAKERY', bg: 0xe4c890, fg: 0x6c3418 }, { text: 'GYM', bg: 0x202024, fg: 0xe85820, sub: 'BOXING  WEIGHTS' },
  { text: 'THRIFT STORE', bg: 0x4c7cb0, fg: 0xf4f0e0 }, { text: 'DENTAL', bg: 0xf4f4f0, fg: 0x2c7cb0, sub: 'WALK INS WELCOME' }, { text: 'BAR', bg: 0x181818, fg: 0xe83c50, sub: 'COCKTAILS' }, { text: 'FOR LEASE', bg: 0xf0f0ec, fg: 0xb01c18, sub: 'CALL 555 0142' },
];
function fascia(tex: Tex, seed: number, s: Sign, age: number): TextureData {
  const a = new Art(tex, hex(s.bg), 0.45);
  const [w, h] = [a.w, a.h];
  if (s.band) {
    a.rect(hex(s.band), 0, 0, w, h * 0.14, {});
    a.rect(hex(s.band), 0, h * 0.86, w, h, {});
  }
  const big = s.sub ? h * 0.42 : h * 0.5;
  a.text(hex(s.fg), s.text, w / 2, s.sub ? h * 0.42 : (h - big) / 2, big, { fit: w * 0.88, weight: 0.1 }, { height: 0.004 });
  if (s.sub) a.text(hex(s.fg), s.sub, w / 2, h * 0.16, h * 0.15, { fit: w * 0.8 });
  // Lightbox seams.
  for (let x = 1.2; x < w - 0.3; x += 1.2) a.rect(shadeC(hex(s.bg), 0.7), x - 0.004, 0, x + 0.004, h, { opacity: 0.6 });
  a.rect(shadeC(hex(s.bg), 0.55), 0, 0, w, 0.025, {});
  a.rect(shadeC(hex(s.bg), 0.55), 0, h - 0.025, w, h, {});
  return a.done(seed, age);
}
SIGNS.forEach((s, i) => add('trim', `sign-${s.text.toLowerCase().replace(/ /g, '-')}`, `店の看板 ${s.text}`, [4.8, 0.9], (t, sd) => fascia(t, sd, s, 0.1 + (i % 4) * 0.15), { density: 128, ...(i % 3 === 0 ? { emissive: 0.25 } : {}) }));
/** Vertical blade sign with stacked letters. */
function blade(tex: Tex, seed: number, word: string, bg: RGB, fg: RGB): TextureData {
  const a = new Art(tex, bg, 0.45);
  const n = word.length;
  const step = (a.h - 0.3) / n;
  a.rect(fg, 0.04, 0.04, a.w - 0.04, a.h - 0.04, { opacity: 0.9 });
  a.rect(bg, 0.07, 0.07, a.w - 0.07, a.h - 0.07, {});
  [...word].forEach((ch, i) => a.text(fg, ch, a.w / 2, a.h - 0.15 - (i + 0.82) * step, step * 0.66, { weight: 0.12 }, { height: 0.006 }));
  return a.done(seed, 0.15);
}
const BLADES: [string, number, number][] = [['HOTEL', 0x1c2c5c, 0xf4e8c0], ['MOTEL', 0x1c6c8c, 0xf8f4e0], ['BAR', 0x181818, 0xe83c50], ['LOANS', 0xe8c81c, 0x141414], ['PAWN', 0xb01c18, 0xf4e060], ['LIQUOR', 0xf0ece0, 0xb01c18], ['PARKING', 0x1c4c9c, 0xf4f4f0], ['THEATRE', 0x8c1c2c, 0xf4d060], ['DINER', 0xd83c2c, 0xf4f4e8], ['APTS', 0x2c4c3c, 0xe8dcb4]];
for (const [word, bg, fg] of BLADES) add('trim', `blade-${word.toLowerCase()}`, `袖看板 ${word}`, [0.8, word.length * 0.62 + 0.3], (t, s) => blade(t, s, word, hex(bg), hex(fg)), { density: 160, emissive: 0.3 });
/** Roof billboards. */
const BOARDS: [string, string, string, number, number, number][] = [['cola', 'ZAP COLA', 'TASTE THE SPARK', 0xb81c1c, 0xf4f4f0, 0xf4d030], ['injury', 'INJURED?', 'CALL 555 0199 NOW', 0xf4d020, 0x141414, 0xb01c18], ['radio', '98.3 FM', 'THE COAST ROCKS', 0x141428, 0xe8508c, 0x40d0e8], ['casino', 'LUCKY PALMS', 'CASINO  EXIT 14', 0x2c1c4c, 0xf4d060, 0xe86030], ['burger', 'BIG STACK', 'BURGERS  NEXT RIGHT', 0xe8a020, 0x8c1c14, 0xf4f0e0], ['phone', 'NOVA 9', 'THE PHONE THAT GETS YOU', 0xe8e8ec, 0x1c1c24, 0x2c7ce0], ['movie', 'HEAT WAVE', 'IN THEATERS FRIDAY', 0x181014, 0xe86020, 0xf4e0b0], ['pizza', 'SLICE CITY', 'HOT PIZZA  DINE IN', 0x1f6a38, 0xf4f0e0, 0xc8281c], ['realty', 'SOLD', 'COASTLINE REALTY', 0x1c4c8c, 0xf4f4f0, 0xe8c030]];
for (const [id, head, sub, bg, fg, accent] of BOARDS) add('trim', `billboard-${id}`, `屋上広告 ${head}`, [6, 3], (t, s) => {
  const a = new Art(t, hex(bg), 0.5);
  a.put(hex(accent), (m) => t.poly(m, [[[0, 0], [6, 0], [6, 0.5], [0, 1.0]]]), {});
  a.disc(hex(accent), 5, 2.2, 0.45, {});
  a.text(hex(fg), head, 3, 1.35, 0.9, { fit: 5.2, weight: 0.11 });
  a.text(hex(bg), sub, 3, 0.16, 0.26, { fit: 5.4 });
  for (let x = 1; x < 6; x += 1) a.rect([0, 0, 0], x - 0.003, 0, x + 0.003, 3, { opacity: 0.25 });
  return a.done(s, 0.25);
}, { density: 96 });
add('trim', 'canopy-red', 'ガソリンスタンドの庇 赤', [4, 0.9], (t, s) => { const a = new Art(t, hex(0xe8e8e4), 0.4); a.rect(hex(0xc8201c), 0, 0.25, 4, 0.65, {}); a.text(hex(0xf4f4f0), 'REDLINE GAS', 2, 0.33, 0.24, { fit: 3 }); return a.done(s, 0.2); }, { tile: 'x', density: 128, emissive: 0.2 });
add('trim', 'canopy-green', 'ガソリンスタンドの庇 緑', [4, 0.9], (t, s) => { const a = new Art(t, hex(0x1c6c40), 0.4); a.rect(hex(0xf4d820), 0, 0.08, 4, 0.2, {}); a.text(hex(0xf4f4f0), 'PETROMAX', 2, 0.36, 0.3, { fit: 3 }); return a.done(s, 0.2); }, { tile: 'x', density: 128, emissive: 0.2 });
add('trim', 'canopy-blue', 'ガソリンスタンドの庇 青', [4, 0.9], (t, s) => { const a = new Art(t, hex(0x1c3c8c), 0.4); a.rect(hex(0xe86c20), 0, 0.7, 4, 0.82, {}); a.text(hex(0xf4f4f0), 'COAST FUEL', 2, 0.3, 0.28, { fit: 3 }); return a.done(s, 0.2); }, { tile: 'x', density: 128, emissive: 0.2 });

// --- Railings, grilles and gratings: cut out so bars are not modelled one by one. ---
function bars(tex: Tex, c: RGB, kind: 'baluster' | 'cable' | 'mesh' | 'grate' | 'lattice' | 'ornate'): TextureData {
  const L = new Layers(tex, c, 0.5, 0);
  const m = tex.field();
  const [w, h] = [tex.mw, tex.mh];
  if (kind === 'baluster' || kind === 'ornate') {
    tex.rect(m, 0, h - 0.045, w, h);
    tex.rect(m, 0, 0.06, w, 0.09);
    tex.rect(m, 0, h - 0.16, w, h - 0.14);
    const n = Math.round(w / 0.11);
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * w) / n;
      tex.rect(m, x - 0.008, 0.06, x + 0.008, h - 0.04);
      if (kind === 'ornate') tex.ring(m, x, h * 0.5, 0.035, 0.006);
    }
  } else if (kind === 'cable') {
    tex.rect(m, 0, h - 0.05, w, h);
    for (let y = 0.1; y < h - 0.1; y += 0.1) tex.rect(m, 0, y - 0.004, w, y + 0.004);
    tex.rect(m, w / 2 - 0.02, 0, w / 2 + 0.02, h);
  } else if (kind === 'mesh') {
    for (let i = -8; i < 16; i++) {
      tex.stroke(m, [[i * 0.0625, 0], [i * 0.0625 + h, h]], 0.0035);
      tex.stroke(m, [[i * 0.0625, 0], [i * 0.0625 - h, h]], 0.0035);
    }
  } else if (kind === 'grate') {
    for (let y = 0.015; y < h; y += 0.03) tex.rect(m, 0, y - 0.004, w, y + 0.004);
    for (let x = 0.05; x < w; x += 0.1) tex.rect(m, x - 0.004, 0, x + 0.004, h);
  } else {
    for (let i = -6; i < 12; i++) {
      tex.stroke(m, [[i * 0.1, 0], [i * 0.1 + h, h]], 0.014);
      tex.stroke(m, [[i * 0.1, 0], [i * 0.1 - h, h]], 0.014);
    }
  }
  L.paint(m, c, { alpha: true, height: 0.004 });
  return L.finish();
}
const CUT: Extra = { cutout: true, density: 384, tile: 'x' };
add('trim', 'rail-black', '手すり 黒い縦格子', [1.1, 1.05], (t) => bars(t, [0.06, 0.06, 0.065], 'baluster'), CUT);
add('trim', 'rail-white', '手すり 白い縦格子', [1.1, 1.05], (t) => bars(t, [0.88, 0.87, 0.83], 'baluster'), CUT);
add('trim', 'rail-green', '手すり 緑の縦格子', [1.1, 1.05], (t) => bars(t, [0.14, 0.26, 0.2], 'baluster'), CUT);
add('trim', 'rail-brown', '手すり 茶の縦格子', [1.1, 1.05], (t) => bars(t, [0.28, 0.2, 0.14], 'baluster'), CUT);
add('trim', 'rail-ornate', '手すり 飾りつき鉄柵', [1.1, 1.05], (t) => bars(t, [0.05, 0.05, 0.055], 'ornate'), CUT);
add('trim', 'rail-cable', '手すり 横桟', [1.2, 1.05], (t) => bars(t, [0.62, 0.63, 0.64], 'cable'), CUT);
add('trim', 'rail-cable-black', '手すり 横桟・黒', [1.2, 1.05], (t) => bars(t, [0.07, 0.07, 0.07], 'cable'), CUT);
add('trim', 'chainlink', '金網', [0.5, 0.5], (t) => bars(t, [0.6, 0.62, 0.63], 'mesh'), { ...CUT, tile: 'xy', density: 512 });
add('trim', 'grate-black', '床格子(非常階段) 黒', [0.4, 0.3], (t) => bars(t, [0.07, 0.07, 0.075], 'grate'), { ...CUT, tile: 'xy', density: 512 });
add('trim', 'grate-rust', '床格子(非常階段) 錆色', [0.4, 0.3], (t) => bars(t, [0.3, 0.17, 0.11], 'grate'), { ...CUT, tile: 'xy', density: 512 });
add('trim', 'lattice-white', '木の格子 白', [0.6, 0.6], (t) => bars(t, [0.88, 0.87, 0.83], 'lattice'), { ...CUT, tile: 'xy' });
add('trim', 'lattice-brown', '木の格子 茶', [0.6, 0.6], (t) => bars(t, [0.34, 0.24, 0.16], 'lattice'), { ...CUT, tile: 'xy' });

// --- Roof plant. ---
function fan(tex: Tex, seed: number, c: RGB): TextureData {
  const a = new Art(tex, c, 0.5);
  const [w, h] = [a.w, a.h];
  a.disc([0.05, 0.05, 0.05], w / 2, h / 2, w * 0.42, { height: -0.03 });
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2 + 0.3;
    a.line([0.2, 0.2, 0.2], [[w / 2, h / 2], [w / 2 + Math.cos(t) * w * 0.38, h / 2 + Math.sin(t) * w * 0.38]], w * 0.06, { height: -0.02 });
  }
  a.disc([0.3, 0.3, 0.3], w / 2, h / 2, w * 0.09, { height: -0.01 });
  for (let r = w * 0.06; r < w * 0.43; r += w * 0.04) a.put([0.55, 0.56, 0.57], (m) => tex.ring(m, w / 2, h / 2, r, 0.004), { height: 0.003 });
  for (const t of [0, Math.PI / 2]) a.line([0.55, 0.56, 0.57], [[w / 2 - Math.cos(t) * w * 0.43, h / 2 - Math.sin(t) * w * 0.43], [w / 2 + Math.cos(t) * w * 0.43, h / 2 + Math.sin(t) * w * 0.43]], 0.006, { height: 0.004 });
  return a.done(seed, 0.3);
}
add('trim', 'ac-fan-grey', '室外機のファン 灰', [0.8, 0.8], (t, s) => fan(t, s, hex(0x9c9ea0)));
add('trim', 'ac-fan-beige', '室外機のファン ベージュ', [0.8, 0.8], (t, s) => fan(t, s, hex(0xc4bca4)));
/** Louvres or coil fins: tiles both ways. */
function louver(tex: Tex, seed: number, c: RGB, pitch: number, vertical: boolean): TextureData {
  const L = new Layers(tex, c, 0.5);
  const tone = tex.noise(0.3, 0.3, seed, 3);
  tex.map((x, y, k) => {
    const f = ((vertical ? x : y) / pitch) % 1;
    const m = (vertical ? 0.55 + 0.45 * Math.abs(Math.sin(f * Math.PI)) : 0.35 + 0.75 * f) * (1 + tone(x, y) * 0.08);
    L.r[k] = c[0] * m;
    L.g[k] = c[1] * m;
    L.b[k] = c[2] * m;
    L.height[k] = vertical ? Math.sin(f * Math.PI) * 0.002 : f * 0.01;
    return 0;
  });
  return L.finish();
}
add('trim', 'louver-grey', 'ルーバー 灰', [0.5, 0.5], (t, s) => louver(t, s, hex(0x9a9c9e), 0.05, false), { tile: 'xy' });
add('trim', 'louver-white', 'ルーバー 白', [0.5, 0.5], (t, s) => louver(t, s, hex(0xdcdcd8), 0.05, false), { tile: 'xy' });
add('trim', 'louver-dark', 'ルーバー 濃灰', [0.5, 0.5], (t, s) => louver(t, s, hex(0x44464a), 0.08, false), { tile: 'xy' });
add('trim', 'louver-beige', 'ルーバー ベージュ', [0.5, 0.5], (t, s) => louver(t, s, hex(0xc4bca4), 0.05, false), { tile: 'xy' });
add('trim', 'coil-fins', '室外機の放熱フィン', [0.5, 0.5], (t, s) => louver(t, s, hex(0x5c5e60), 0.5 / 64, true), { tile: 'xy', density: 512 });
add('trim', 'skylight', '天窓', [1.2, 1.2], (t, s) => { const a = new Art(t, hex(0xa8aaac), 0.4); a.glass(0.08, 0.08, 1.12, 1.12); a.rect(hex(0xa8aaac), 0.59, 0.08, 0.61, 1.12, { height: 0.004 }); return a.done(s, 0.3); }, { reflect: 0.8 });
add('trim', 'skylight-dome', '天窓 乳白ドーム', [1.2, 1.2], (t, s) => { const a = new Art(t, hex(0x8c8e90), 0.4); a.rect([0.82, 0.84, 0.84], 0.1, 0.1, 1.1, 1.1, { rough: 0.25, soft: 0.05, height: 0.03 }); return a.done(s, 0.4); }, { reflect: 0.4 });
add('trim', 'tank-staves', '給水塔の木の樽板', [1.2, 1.2], (t, s) => S.planks(t, { seed: s, width: 0.12, color: [0.36, 0.26, 0.18], weathered: 0.6 }), { tile: 'xy', density: 200 });
add('trim', 'tank-staves-grey', '給水塔の木の樽板 風化', [1.2, 1.2], (t, s) => S.planks(t, { seed: s, width: 0.12, color: [0.4, 0.37, 0.33], weathered: 0.95 }), { tile: 'xy', density: 200 });
add('trim', 'duct', '亜鉛めっきダクト', [1.2, 1.2], (t, s) => {
  const L = new Layers(t, [0.66, 0.68, 0.7], 0.4);
  const sp = t.cells(0.04, s);
  const tone = t.noise(0.5, 0.5, s + 1, 3);
  t.map((x, y, k) => {
    const seam = 1 - sstep(0.004, 0.01, Math.min(x % 0.6, 0.6 - (x % 0.6)));
    const cross = 1 - sstep(0.01, 0.3, Math.abs(Math.abs(((x % 0.6) / 0.6 - 0.5) * 2) - Math.abs(((y % 0.6) / 0.6 - 0.5) * 2)) * 0.3);
    const m = (1 + (sp(x, y).id - 0.5) * 0.14 + tone(x, y) * 0.08) * (1 - seam * 0.5) * (1 + cross * 0.06);
    L.r[k] = 0.66 * m;
    L.g[k] = 0.68 * m;
    L.b[k] = 0.7 * m;
    L.metal[k] = 0.8 * (1 - seam);
    L.height[k] = seam * 0.006;
    return 0;
  });
  return L.finish();
}, { tile: 'xy', density: 160 });

// --- Decals laid over walls. ---
function tagDecal(tex: Tex, seed: number, colors: RGB[]): TextureData {
  const L = new Layers(tex, colors[0], 0.7, 0);
  const [w, h] = [tex.mw, tex.mh];
  const rnd = (i: number): number => hash2(i, 7, seed);
  colors.forEach((c, ci) => {
    const m = tex.field();
    let [x, y] = [w * (0.12 + rnd(ci * 50) * 0.2), h * (0.3 + rnd(ci * 50 + 1) * 0.4)];
    const pts: [number, number][] = [[x, y]];
    // A tag is one fast scrawl: loops and zigzags marching to the right.
    for (let i = 0; i < 26; i++) {
      x += w * 0.028 * (0.4 + rnd(ci * 50 + i * 2 + 2));
      y = clamp01(h * 0.5 + (rnd(ci * 50 + i * 2 + 3) - 0.5) * h * 0.75 * (i % 2 ? 1 : -0.6) + (ci - 0.5) * h * 0.1) ;
      pts.push([Math.min(x, w * 0.92), Math.max(h * 0.08, Math.min(h * 0.92, y))]);
    }
    tex.stroke(m, pts, 0.016 + ci * 0.006, 1, 0.006);
    L.paint(m, c, { alpha: true });
  });
  return L.finish();
}
const TAGS: [string, RGB[]][] = [['black', [[0.05, 0.05, 0.06]]], ['white', [[0.9, 0.9, 0.9]]], ['red', [[0.75, 0.1, 0.1]]], ['blue', [[0.15, 0.3, 0.75], [0.05, 0.05, 0.06]]], ['pink', [[0.85, 0.2, 0.55], [0.9, 0.9, 0.9]]], ['green', [[0.2, 0.7, 0.3], [0.05, 0.05, 0.06]]], ['silver', [[0.72, 0.74, 0.76], [0.05, 0.05, 0.06]]], ['orange', [[0.9, 0.45, 0.1]]]];
for (const [id, c] of TAGS) add('trim', `graffiti-${id}`, `落書き ${id}`, [2, 1], (t, s) => tagDecal(t, s, c), { decal: true, density: 200 });
/** Dirt splashed up from the pavement and rain streaks down from a parapet, as overlays. */
function grimeDecal(tex: Tex, seed: number, top: boolean): TextureData {
  const L = new Layers(tex, [0.12, 0.11, 0.1], 0.95, 0);
  const n = tex.noise(0.4, 0.3, seed, 3);
  const streak = tex.noise(0.07, 2, seed + 1, 3);
  tex.map((x, y, k) => {
    const v = top ? 1 - y / tex.mh : y / tex.mh;
    const a = top ? sstep(1, 0, v) ** 1.5 * clamp01(0.15 + sstep(0, 0.6, streak(x, y)) * 0.9) : sstep(1, 0, v) ** 2 * clamp01(0.55 + n(x, y) * 0.8);
    L.alpha[k] = clamp01(a * 0.7);
    return 0;
  });
  return L.finish();
}
add('trim', 'grime-base', '壁の裾の汚れ', [3, 1], (t, s) => grimeDecal(t, s, false), { decal: true, tile: 'x', density: 128 });
add('trim', 'grime-top', '雨だれ', [3, 2], (t, s) => grimeDecal(t, s, true), { decal: true, tile: 'x', density: 128 });


// --- Weathering overlays. Buildings lay these over their walls and roofs so that no two stretches of the same material look alike. ---
const DIRT: RGB = [0.13, 0.12, 0.1];
const DUST: RGB = [0.74, 0.7, 0.63];
const ALGAE: RGB = [0.16, 0.2, 0.11];
type Soil = 'light' | 'mid' | 'heavy' | 'pale';
const SOIL: Record<Soil, [number, string]> = { light: [0.27, '薄い'], mid: [0.36, '中'], heavy: [0.52, '濃い'], pale: [0.26, '白っぽい'] };
/** An overlay whose opacity is `fn`, tinted with patches of green where water lingers. */
function soil(tex: Tex, seed: number, kind: Soil, fn: (x: number, y: number) => number, green = 0.5): TextureData {
  const base = kind === 'pale' ? DUST : DIRT;
  const L = new Layers(tex, base, 0.95, 0);
  const tint = tex.noise(1.7, 1.7, seed + 9, 2);
  const k0 = SOIL[kind][0];
  tex.map((x, y, k) => {
    const g = kind === 'pale' ? 0 : sstep(0.15, 0.6, tint(x, y)) * green;
    L.r[k] = lerp(base[0], ALGAE[0], g);
    L.g[k] = lerp(base[1], ALGAE[1], g);
    L.b[k] = lerp(base[2], ALGAE[2], g);
    L.alpha[k] = clamp01(fn(x, y)) * k0;
    return 0;
  });
  return L.finish();
}
/** Blotches and long faint streaks over a whole wall. */
function stain(tex: Tex, seed: number, kind: Soil): TextureData {
  const blotch = tex.noise(2.6, 2, seed, 4);
  const streak = tex.noise(0.16, 3, seed + 1, 3);
  const fine = tex.noise(0.25, 0.25, seed + 2, 2);
  const band = tex.noise(4, 0.5, seed + 3, 2);
  return soil(tex, seed, kind, (x, y) => 0.1 + sstep(-0.15, 0.55, blotch(x, y)) * 0.75 + sstep(0.15, 0.65, streak(x, y)) * 0.34 * (0.5 + 0.5 * sstep(-0.3, 0.3, blotch(x, y))) + fine(x, y) * 0.12 + sstep(0.35, 0.7, band(x, y)) * 0.2);
}
/** Dirt thrown up from the pavement: densest at the foot of the wall, with a ragged upper edge. */
function splash(tex: Tex, seed: number, kind: Soil): TextureData {
  const edge = tex.noise(0.5, 0.3, seed, 3);
  const spot = tex.noise(0.07, 0.07, seed + 1, 2);
  return soil(tex, seed, kind, (x, y) => {
    const v = y / tex.mh;
    const reach = 0.55 + edge(x, y) * 0.35;
    return sstep(reach, reach * 0.15, v) * (0.7 + spot(x, y) * 0.3) + sstep(0.12, 0, v) * 0.4;
  }, 0.8);
}
/** Streaks running down from a ledge at the top edge. `ends` gathers them at the two ends, as below a window sill. */
function runoff(tex: Tex, seed: number, kind: Soil, ends: boolean): TextureData {
  const len = tex.noise(ends ? 0.09 : 0.14, 50, seed, 2);
  const wisp = tex.noise(0.04, 0.9, seed + 1, 2);
  const tile = !ends;
  return soil(tex, seed, kind, (x, y) => {
    const v = 1 - y / tex.mh;
    const u = x / tex.mw;
    const side = ends ? Math.max(sstep(0.2, 0.06, u), sstep(0.8, 0.94, u)) * sstep(0, 0.04, u) * sstep(1, 0.96, u) : 0;
    const reach = clamp01((tile ? 0.3 : 0.16) + sstep(-0.2, 0.7, len(x, 0)) * 0.6 + side * 0.55);
    const body = sstep(reach, reach * 0.2, v) * (0.45 + side * 0.55 + sstep(0, 0.6, wisp(x, y)) * 0.4);
    const fade = ends ? sstep(0, 0.03, u) * sstep(1, 0.97, u) : 1;
    return (body + sstep(0.07, 0, v) * 0.5) * fade * sstep(1, 0.92, v);
  }, 0.7);
}
/** Where puddles dry on a flat roof: dark patches with a tide mark round the edge. */
function pond(tex: Tex, seed: number): TextureData {
  const n = tex.noise(2.2, 2.2, seed, 3);
  const fine = tex.noise(0.3, 0.3, seed + 1, 2);
  const track = tex.noise(0.5, 6, seed + 2, 2);
  return soil(tex, seed, 'mid', (x, y) => {
    const d = n(x, y);
    return sstep(0.05, 0.3, d) * 0.5 + sstep(0.06, 0, Math.abs(d - 0.08)) * 0.5 + 0.15 + fine(x, y) * 0.15 + sstep(0.3, 0.7, track(x, y)) * 0.2;
  }, 0.9);
}
for (const kind of ['light', 'mid', 'heavy', 'pale'] as Soil[]) {
  const name = SOIL[kind][1];
  for (let i = 1; i <= 3; i++) add('trim', `stain-${kind}-${i}`, `壁のしみ ${name} ${i}`, [8, 6], (t, s) => stain(t, s, kind), { decal: true, tile: 'xy', density: 48 });
  for (let i = 1; i <= 3; i++) add('trim', `splash-${kind}-${i}`, `壁の裾の泥はね ${name} ${i}`, [4, 1.2], (t, s) => splash(t, s, kind), { decal: true, tile: 'x', density: 96 });
  for (let i = 1; i <= 2; i++) add('trim', `drip-${kind}-${i}`, `窓台の下の雨だれ ${name} ${i}`, [1.6, 1.6], (t, s) => runoff(t, s, kind, true), { decal: true, density: 128 });
  for (let i = 1; i <= 2; i++) add('trim', `runoff-${kind}-${i}`, `笠木の下の雨だれ ${name} ${i}`, [6, 2], (t, s) => runoff(t, s, kind, false), { decal: true, tile: 'x', density: 96 });
}
for (let i = 1; i <= 3; i++) add('trim', `pond-${i}`, `陸屋根の水たまり跡 ${i}`, [8, 8], (t, s) => pond(t, s), { decal: true, tile: 'xy', density: 48 });

// --- Public buildings: lettering, apparatus bay doors, church glass, clocks, stadium seats. Every name is made up. ---
const CIVIC_SIGNS: (Sign & { ja: string })[] = [
  { text: 'FIRE STATION', ja: '消防署', bg: 0xa82018, fg: 0xf4f0e0, sub: 'ENGINE CO 7  LADDER 3' }, { text: 'POLICE', ja: '警察署', bg: 0x1c2c54, fg: 0xf0f0ec, sub: 'TO PROTECT AND SERVE' }, { text: 'HOSPITAL', ja: '病院', bg: 0xf0f0ec, fg: 0x1c4c9c, sub: 'ST ELMO MEDICAL CENTER' },
  { text: 'EMERGENCY', ja: '救急入口', bg: 0xb01c18, fg: 0xf4f4f0 }, { text: 'AMBULANCE ONLY', ja: '救急車専用', bg: 0xf0f0ec, fg: 0xb01c18 }, { text: 'MEDICAL CLINIC', ja: '診療所', bg: 0x2c7c8c, fg: 0xf4f4f0, sub: 'URGENT CARE  WALK IN' },
  { text: 'CITY HALL', ja: '市役所', bg: 0xc8c0aa, fg: 0x3c3428 }, { text: 'COURTHOUSE', ja: '裁判所', bg: 0xc4bca8, fg: 0x34302a, sub: 'COUNTY SUPERIOR COURT' }, { text: 'PUBLIC LIBRARY', ja: '図書館', bg: 0xbcb4a0, fg: 0x2c3c34 },
  { text: 'POST OFFICE', ja: '郵便局', bg: 0x1c3c7c, fg: 0xf4f4f0, sub: 'CITY MAIL SERVICE' }, { text: 'MUSEUM OF ART', ja: '美術館', bg: 0x2a2a2e, fg: 0xe8dcb8 }, { text: 'COMMUNITY CENTER', ja: '公民館', bg: 0x3c6c54, fg: 0xf0ecd8, sub: 'PARKS AND RECREATION' },
  { text: 'ELEMENTARY SCHOOL', ja: '小学校', bg: 0xd8d0b8, fg: 0x7c2c24 }, { text: 'MIDDLE SCHOOL', ja: '中学校', bg: 0xd4d4cc, fg: 0x1c3c6c }, { text: 'HIGH SCHOOL', ja: '高校', bg: 0x6c1c24, fg: 0xf0d870, sub: 'HOME OF THE HAWKS' },
  { text: 'GYMNASIUM', ja: '体育館', bg: 0x30343c, fg: 0xf0d870 }, { text: 'UNIVERSITY HALL', ja: '大学本館', bg: 0xc0b8a4, fg: 0x2c2c44 }, { text: 'STADIUM', ja: '競技場', bg: 0x1c4c34, fg: 0xf4f4f0, sub: 'GATE A  TICKETS' },
  { text: 'ARENA', ja: 'アリーナ', bg: 0x202028, fg: 0x58c8e8, sub: 'BOX OFFICE' }, { text: 'CHAPEL', ja: '礼拝堂', bg: 0xe8e4d8, fg: 0x3c3428 }, { text: 'SHERIFF', ja: '保安官事務所', bg: 0x4c3c1c, fg: 0xe8c860, sub: 'COUNTY SUBSTATION' },
];
CIVIC_SIGNS.forEach((s, i) => add('trim', `sign-${s.text.toLowerCase().replace(/ /g, '-')}`, `公共施設の銘板 ${s.ja}`, [4.8, 0.9], (t, sd) => fascia(t, sd, s, 0.15 + (i % 3) * 0.12), { density: 128 }));
// Apparatus bay doors: tall sectional doors with one or two glazed rows.
const BAYS: [string, string, number, number][] = [['red', '赤', 0xa8241c, 3], ['white', '白', 0xdcdcd4, 2], ['grey', '灰', 0x70747a, 3], ['green', '深緑', 0x2c4c3a, 2]];
for (const [id, label, c, lights] of BAYS) add('door', `bay-${id}`, `消防車庫の扉 ${label}`, [4.2, 4.2], (t, s) => sectional(t, s, hex(c), { rows: 6, cols: 5, lights, age: 0.2 }), { density: 128 });
/** Double doors under a fanlight or with strap hinges, for churches and halls. */
function grandDoor(tex: Tex, seed: number, c: RGB, kind: 'strap' | 'panel' | 'glass'): TextureData {
  const a = new Art(tex, shadeC(c, 0.55), 0.55);
  const [w, h] = [a.w, a.h];
  for (const s of [0, 1]) {
    const [x0, x1] = [s * (w / 2) + 0.03, (s + 1) * (w / 2) - 0.03];
    a.rect(c, x0, 0.02, x1, h - 0.04, { height: 0.004 });
    if (kind === 'strap') {
      for (let x = x0 + 0.16; x < x1 - 0.05; x += 0.16) a.rect(shadeC(c, 0.7), x - 0.004, 0.02, x + 0.004, h - 0.04, { height: -0.003 });
      for (const y of [0.35, h * 0.5, h - 0.45]) a.rect([0.08, 0.08, 0.09], s ? x0 + 0.1 : x0, y - 0.035, s ? x1 : x1 - 0.1, y + 0.035, { height: 0.006, rough: 0.5, metal: 0.6 });
    } else if (kind === 'panel') {
      for (const [y0, y1] of [[0.12, h * 0.3], [h * 0.34, h * 0.62], [h * 0.66, h - 0.14]]) a.panel(c, x0 + 0.1, y0, x1 - 0.1, y1, 0.006);
    } else {
      a.panel(c, x0 + 0.1, 0.12, x1 - 0.1, h * 0.3, 0.006);
      a.glass(x0 + 0.14, h * 0.36, x1 - 0.14, h - 0.18, shadeC(c, 0.8));
    }
    a.disc([0.7, 0.58, 0.3], s ? x0 + 0.1 : x1 - 0.1, h * 0.42, 0.035, { height: 0.01, rough: 0.3, metal: 0.8 });
  }
  return a.done(seed, 0.3);
}
const GRAND: [string, string, number, 'strap' | 'panel' | 'glass'][] = [['church-oak', '教会の扉 オーク・帯金物', 0x5c3c24, 'strap'], ['church-red', '教会の扉 赤', 0x8c241c, 'strap'], ['church-dark', '教会の扉 濃茶・鏡板', 0x3a2a1e, 'panel'], ['civic-bronze', '庁舎の扉 ブロンズ', 0x5c4a34, 'glass'], ['civic-oak', '庁舎の扉 オーク', 0x6c4a2c, 'panel'], ['civic-green', '庁舎の扉 緑', 0x2c4638, 'glass']];
for (const [id, label, c, kind] of GRAND) add('door', id, label, [2.2, 3], (t, s) => grandDoor(t, s, hex(c), kind), { density: 200 });

/** Leaded glass in a pointed arch, set in a stone surround. */
function stained(tex: Tex, seed: number, stone: RGB, colors: RGB[]): TextureData {
  const a = new Art(tex, stone, 0.8);
  const [w, h] = [a.w, a.h];
  const [x0, x1] = [0.09, w - 0.09];
  const R = x1 - x0;
  const ys = h - 0.09 - R * 0.866;
  a.rect([0.05, 0.05, 0.06], x0, 0.1, x1, h - 0.05, { height: -0.01, rough: 0.5 });
  const [cols, ph] = [4, 0.3];
  for (let j = 0; j * ph < h; j++) for (let i = 0; i < cols; i++) {
    const c = colors[Math.floor(hash2(i + (j % 2) * 7, j, seed) * colors.length)];
    const [px, py] = [x0 + (i * R) / cols, 0.1 + j * ph];
    a.rect(shadeC(c, 0.75 + 0.5 * hash2(i, j, seed + 3)), px + 0.012, py + 0.012, px + R / cols - 0.012, py + ph - 0.012, { rough: 0.12, height: -0.012 });
  }
  // A medallion in the head and a border down each side.
  a.disc([0.05, 0.05, 0.06], w / 2, ys + R * 0.2, R * 0.3, { height: -0.01 });
  a.disc(colors[0], w / 2, ys + R * 0.2, R * 0.26, { rough: 0.12, height: -0.012 });
  a.disc(colors[colors.length - 1], w / 2, ys + R * 0.2, R * 0.12, { rough: 0.12, height: -0.012 });
  for (const x of [x0 + 0.05, x1 - 0.05]) a.rect(colors[1], x - 0.025, 0.12, x + 0.025, ys, { rough: 0.12, opacity: 0.85, height: -0.012 });
  // Stone outside the two arcs of the arch.
  for (const s of [0, 1]) {
    const pts: [number, number][] = [[s ? w : 0, ys - 0.02]];
    for (let k = 0; k <= 12; k++) {
      const ang = (k / 12) * (Math.PI / 3);
      pts.push(s ? [x0 + R * Math.cos(ang), ys + R * Math.sin(ang)] : [x1 - R * Math.cos(ang), ys + R * Math.sin(ang)]);
    }
    pts.push([w / 2, h], [s ? w : 0, h]);
    a.put(stone, (m) => tex.poly(m, [pts]), { rough: 0.8, height: 0.004 });
  }
  a.rect(stone, 0, 0, x0, h, { rough: 0.8, height: 0.004 });
  a.rect(stone, x1, 0, w, h, { rough: 0.8, height: 0.004 });
  a.rect(shadeC(stone, 0.85), 0, 0, w, 0.1, { rough: 0.8, height: 0.008 });
  return a.done(seed, 0.35);
}
const JEWEL: RGB[][] = [[hex(0x2c4cb0), hex(0xb0241c), hex(0xd8a828), hex(0x2c8c54), hex(0x6c2c8c)], [hex(0xb0241c), hex(0xd8a828), hex(0xe8d8a0), hex(0x8c3c1c)], [hex(0x2c7c9c), hex(0x3ca078), hex(0xd8d0a0), hex(0x2c4c8c)], [hex(0xd8c890), hex(0xc8b070), hex(0xe8e0c0), hex(0xa89058)]];
const STONES: [string, string, number][] = [['limestone', '石灰岩', 0xb4aa94], ['brick', 'レンガ', 0x7c4434], ['white', '白しっくい', 0xdcd8cc]];
JEWEL.forEach((colors, i) => STONES.forEach(([sid, sl, sc], j) => {
  if ((i + j) % 3 === 2) return;
  add('window', `stained-${['jewel', 'ruby', 'sea', 'amber'][i]}-${sid}`, `ステンドグラスの尖頭窓 ${['多色', '赤金', '青緑', '琥珀'][i]}・${sl}`, [1.2, 3.6], (t, s) => stained(t, s, hex(sc), colors), { density: 200, reflect: 0.3 });
}));
/** Rose window: petals of coloured glass around a hub. */
function rose(tex: Tex, seed: number, stone: RGB, colors: RGB[]): TextureData {
  const a = new Art(tex, stone, 0.8);
  const c = a.w / 2;
  a.disc(shadeC(stone, 0.8), c, c, c - 0.04, { height: 0.006 });
  a.disc([0.05, 0.05, 0.06], c, c, c - 0.16, { height: -0.01 });
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    a.disc(colors[k % colors.length], c + Math.cos(ang) * (c - 0.42), c + Math.sin(ang) * (c - 0.42), 0.2, { rough: 0.12, height: -0.012 });
    a.disc(colors[(k + 2) % colors.length], c + Math.cos(ang + 0.26) * (c - 0.78), c + Math.sin(ang + 0.26) * (c - 0.78), 0.13, { rough: 0.12, height: -0.012 });
    a.line(shadeC(stone, 0.8), [[c + Math.cos(ang + 0.26) * 0.22, c + Math.sin(ang + 0.26) * 0.22], [c + Math.cos(ang + 0.26) * (c - 0.18), c + Math.sin(ang + 0.26) * (c - 0.18)]], 0.018, { height: 0.004 });
  }
  a.disc(colors[0], c, c, 0.2, { rough: 0.12, height: -0.012 });
  return a.done(seed, 0.3);
}
STONES.forEach(([sid, sl, sc], j) => add('window', `rose-${sid}`, `バラ窓 ${sl}`, [2.6, 2.6], (t, s) => rose(t, s, hex(sc), JEWEL[j]), { density: 160, reflect: 0.3 }));

/** Tower clock dial. */
function clockFace(tex: Tex, seed: number, dial: RGB, ink: RGB, hour: number): TextureData {
  const a = new Art(tex, shadeC(ink, 0.8), 0.5);
  const c = a.w / 2;
  a.disc(dial, c, c, c - 0.07, { rough: 0.4 });
  for (let k = 0; k < 60; k++) {
    const ang = (k / 60) * Math.PI * 2;
    const [r0, half] = k % 5 ? [c - 0.16, 0.006] : [c - 0.26, 0.02];
    a.line(ink, [[c + Math.sin(ang) * r0, c + Math.cos(ang) * r0], [c + Math.sin(ang) * (c - 0.11), c + Math.cos(ang) * (c - 0.11)]], half);
  }
  const hand = (turns: number, len: number, half: number): void => a.line(ink, [[c - Math.sin(turns * Math.PI * 2) * 0.08, c - Math.cos(turns * Math.PI * 2) * 0.08], [c + Math.sin(turns * Math.PI * 2) * len, c + Math.cos(turns * Math.PI * 2) * len]], half, { height: 0.004 });
  hand(hour / 12, c * 0.48, 0.03);
  hand((hour * 12) % 1, c * 0.74, 0.02);
  a.disc(ink, c, c, 0.05, { height: 0.006 });
  return a.done(seed, 0.25);
}
add('trim', 'clock-cream', '時計塔の文字盤 クリーム', [1.8, 1.8], (t, s) => clockFace(t, s, hex(0xe8e0c8), hex(0x1c1c1e), 10.15), { density: 160 });
add('trim', 'clock-white', '時計塔の文字盤 白', [1.8, 1.8], (t, s) => clockFace(t, s, hex(0xf0f0ec), hex(0x1c2c4c), 3.4), { density: 160, emissive: 0.2 });
add('trim', 'clock-black', '時計塔の文字盤 黒と金', [1.8, 1.8], (t, s) => clockFace(t, s, hex(0x1c1c1e), hex(0xd8b860), 7.55), { density: 160 });

/** Rows of tip-up seats on concrete steps; tiles both ways. */
function seats(tex: Tex, seed: number, c: RGB, age: number): TextureData {
  const a = new Art(tex, hex(0x8c8a84), 0.8);
  for (let y = 0; y < a.h; y += 0.8) {
    a.rect(hex(0x6c6a66), 0, y, a.w, y + 0.05, {});
    for (let x = 0; x < a.w; x += 0.5) {
      const k = shadeC(c, 0.8 + 0.35 * hash2(Math.round(x * 2), Math.round(y * 5), seed));
      a.rect(shadeC(k, 0.6), x + 0.04, y + 0.12, x + 0.46, y + 0.42, { height: 0.01 });
      a.rect(k, x + 0.05, y + 0.38, x + 0.45, y + 0.74, { height: 0.02, rough: 0.5 });
    }
  }
  return a.done(seed, age);
}
const SEATS: [string, string, number, number][] = [['blue', '青', 0x2c4c9c, 0.1], ['red', '赤', 0xa82c24, 0.1], ['green', '緑', 0x2c6c44, 0.15], ['orange', 'オレンジ', 0xd87428, 0.1], ['grey-old', '色あせた灰', 0x8c9094, 0.35]];
for (const [id, label, c, age] of SEATS) add('trim', `seats-${id}`, `観客席の椅子 ${label}`, [2, 1.6], (t, s) => seats(t, s, hex(c), age), { tile: 'xy', density: 128 });
add('trim', 'scoreboard', '得点板', [8, 4], (t, s) => {
  const a = new Art(t, hex(0x141416), 0.4);
  a.rect(hex(0x1c3c2c), 0, a.h - 0.9, a.w, a.h, {});
  a.text(hex(0xf0f0e8), 'HAWKS FIELD', a.w / 2, a.h - 0.72, 0.5, { fit: a.w * 0.8, weight: 0.1 });
  a.text(hex(0xf0b030), 'HOME', 1.5, 2.45, 0.38, { fit: 1.8 });
  a.text(hex(0xf0b030), 'GUEST', 6.5, 2.45, 0.38, { fit: 1.8 });
  a.text(hex(0xf04030), '21', 1.5, 0.9, 1.1, { weight: 0.12, fit: 1.9 });
  a.text(hex(0xf04030), '14', 6.5, 0.9, 1.1, { weight: 0.12, fit: 1.9 });
  a.text(hex(0xf0b030), '08:42', a.w / 2, 1.75, 0.6, { weight: 0.1, fit: 2.3 });
  a.text(hex(0xf0f0e8), 'QTR 3', a.w / 2, 0.7, 0.34, { fit: 1.8 });
  return a.done(s, 0.15);
}, { density: 96, emissive: 0.45 });
add('trim', 'sign-h', '病院の H マーク', [1.6, 1.6], (t, s) => {
  const a = new Art(t, hex(0x1c4c9c), 0.45);
  a.rect(hex(0xf0f0ec), 0.06, 0.06, a.w - 0.06, a.h - 0.06, {});
  a.rect(hex(0x1c4c9c), 0.12, 0.12, a.w - 0.12, a.h - 0.12, {});
  a.text(hex(0xf4f4f0), 'H', a.w / 2, 0.3, 1.0, { weight: 0.14 });
  return a.done(s, 0.15);
}, { density: 160, emissive: 0.3 });
add('trim', 'sign-cross-red', '救急の赤十字マーク', [1.2, 1.2], (t, s) => {
  const a = new Art(t, hex(0xf0f0ec), 0.45);
  a.rect(hex(0xb01c18), 0.45, 0.15, 0.75, 1.05, {});
  a.rect(hex(0xb01c18), 0.15, 0.45, 1.05, 0.75, {});
  return a.done(s, 0.15);
}, { density: 160, emissive: 0.3 });
add('trim', 'helipad', '屋上ヘリポートの標示', [12, 12], (t, s) => {
  const a = new Art(t, hex(0x5c5e60), 0.85);
  a.put(hex(0xd8d8d0), (m) => t.ring(m, 6, 6, 5.2, 0.2), {});
  a.rect(hex(0xb01c18), 3.2, 3.2, 8.8, 8.8, {});
  a.rect(hex(0xf0f0ec), 4.5, 3.6, 7.5, 8.4, {});
  a.rect(hex(0xb01c18), 5.3, 3.6, 6.7, 5.4, {});
  a.rect(hex(0xb01c18), 5.3, 6.6, 6.7, 8.4, {});
  return a.done(s, 0.3);
}, { density: 48 });
add('trim', 'marquee-school', '学校の掲示板', [3, 1.2], (t, s) => {
  const a = new Art(t, hex(0xe8e6de), 0.5);
  for (let y = 0.18; y < 1.1; y += 0.3) a.rect(hex(0xc4c2ba), 0.05, y - 0.006, 2.95, y + 0.006, {});
  a.text(hex(0x141414), 'WELCOME BACK', 1.5, 0.84, 0.2, {});
  a.text(hex(0x141414), 'PARENT NIGHT THU 6PM', 1.5, 0.54, 0.2, { fit: 2.7 });
  a.text(hex(0xb01c18), 'GO HAWKS', 1.5, 0.24, 0.2, {});
  return a.done(s, 0.2);
}, { density: 200 });
const EPITAPHS = ['IN LOVING MEMORY', 'BELOVED FATHER', 'AT REST', 'FOREVER IN OUR HEARTS'];
EPITAPHS.forEach((line, i) => add('trim', `epitaph-${i + 1}`, `墓石の碑文 ${i + 1}`, [0.7, 0.9], (t, s) => {
  const stone = hex([0x8c8c8c, 0x4c4c50, 0xb4aa98, 0x6c5c54][i]);
  const a = new Art(t, stone, 0.75);
  const ink = shadeC(stone, i === 1 ? 2.2 : 0.4);
  a.text(ink, line, 0.35, 0.62, 0.07, { fit: 0.58 }, { height: -0.004 });
  a.rect(ink, 0.2, 0.55, 0.5, 0.56, { height: -0.004 });
  a.text(ink, ['J HOLLIS', 'R MAREN', 'E QUILL', 'A DOVER'][i], 0.35, 0.42, 0.08, { fit: 0.58, weight: 0.11 }, { height: -0.004 });
  a.text(ink, ['1921 1987', '1934 2002', '1899 1961', '1948 2019'][i], 0.35, 0.3, 0.06, {}, { height: -0.004 });
  return a.done(s, 0.3 + i * 0.15);
}, { density: 256 }));

export const TRIM_TEXTURES: readonly TextureSpec[] = list;
