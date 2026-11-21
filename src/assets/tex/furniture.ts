import { Field, Layers, RGB, Rand, TextureData, TextureSpec, Tex, clamp01, hash2, hex, sstep } from './core';
import * as S from './surfaces';
import { Pt, TextOpts, drawText } from './signkit';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'emissive' | 'decal'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 12000 + list.length;
  list.push({ id: `furniture/${id}`, label, category: 'furniture', meters, tile: 'none', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}
const tiled: Extra = { tile: 'xy', density: 128 };

const WHITE: RGB = hex(0xe8e6de);
const BLACK: RGB = hex(0x141414);
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Flat artwork: coloured shapes and lettering over a base coat, then dirt. */
class Art {
  readonly L: Layers;
  readonly w: number;
  readonly h: number;
  constructor(readonly tex: Tex, bg: RGB, rough = 0.45, metal = 0) {
    this.L = new Layers(tex, bg, rough);
    this.w = tex.mw;
    this.h = tex.mh;
    if (metal) this.L.metal.fill(metal);
  }
  private put(c: RGB, draw: (m: Field) => void, o?: { rough?: number; metal?: number; height?: number; opacity?: number }): void {
    const m = this.tex.field();
    draw(m);
    this.L.paint(m, c, { metal: 0, ...o });
  }
  rect(c: RGB, x0: number, y0: number, x1: number, y1: number, o?: { rough?: number; metal?: number; height?: number; opacity?: number }): void {
    this.put(c, (m) => this.tex.rect(m, x0, y0, x1, y1), o);
  }
  disc(c: RGB, x: number, y: number, r: number, o?: { rough?: number; metal?: number; height?: number; opacity?: number }): void {
    this.put(c, (m) => this.tex.disc(m, x, y, r), o);
  }
  ring(c: RGB, x: number, y: number, r: number, half: number): void {
    this.put(c, (m) => this.tex.ring(m, x, y, r, half));
  }
  poly(c: RGB, pts: Pt[], o?: { rough?: number; metal?: number; height?: number; opacity?: number }): void {
    this.put(c, (m) => this.tex.poly(m, [pts]), o);
  }
  line(c: RGB, pts: Pt[], half: number): void {
    this.put(c, (m) => this.tex.stroke(m, pts, half));
  }
  text(c: RGB, s: string, x: number, y: number, size: number, o?: TextOpts): void {
    this.put(c, (m) => drawText(this.tex, m, s, x, y, size, o));
  }
  /** Lines of text stacked downwards from `top`. */
  lines(c: RGB, lines: string[], x: number, top: number, size: number, o?: TextOpts): void {
    lines.forEach((s, i) => this.text(c, s, x, top - size - i * size * 1.45, size, o));
  }
  /** Frame of the given width just inside the edge. */
  frame(c: RGB, width: number, o?: { rough?: number; metal?: number; height?: number }): void {
    this.put(c, (m) => {
      this.tex.rect(m, 0, 0, this.w, width);
      this.tex.rect(m, 0, this.h - width, this.w, this.h);
      this.tex.rect(m, 0, 0, width, this.h);
      this.tex.rect(m, this.w - width, 0, this.w, this.h);
    }, o);
  }
  /** Sun fade, grime that gathers low down, streaks and (when old) paint tags. */
  done(seed: number, age = 0.15, tags = 0): TextureData {
    const { tex, L, h } = this;
    const fade = tex.noise(0.3, 0.3, seed, 2);
    const streak = tex.noise(0.03, 0.5, seed + 1, 3);
    const grime = tex.noise(0.1, 0.1, seed + 2, 3);
    const tagN = tex.noise(0.2, 0.1, seed + 3, 2);
    tex.map((x, y, k) => {
      let [r, g, b] = [L.r[k], L.g[k], L.b[k]];
      const f = age * (0.3 + 0.3 * fade(x, y));
      const chalk = (0.3 * r + 0.5 * g + 0.2 * b) * 0.5 + 0.4;
      r += (chalk - r) * f;
      g += (chalk - g) * f;
      b += (chalk * 0.96 - b) * f;
      const low = 1 - y / h;
      const dirt = clamp01(0.02 + age * (0.12 + grime(x, y) * 0.3 + sstep(0.2, 0.8, streak(x, y)) * 0.35 + low * low * 0.3));
      r *= 1 - dirt * 0.6;
      g *= 1 - dirt * 0.66;
      b *= 1 - dirt * 0.74;
      const tag = tags * sstep(0.26, 0.31, tagN(x, y));
      if (tag > 0) {
        const tc: RGB = hash2(Math.floor(x / 0.3), Math.floor(y / 0.25), seed) > 0.5 ? [0.07, 0.07, 0.09] : [0.6, 0.1, 0.4];
        r += (tc[0] - r) * tag * 0.9;
        g += (tc[1] - g) * tag * 0.9;
        b += (tc[2] - b) * tag * 0.9;
      }
      L.r[k] = r;
      L.g[k] = g;
      L.b[k] = b;
      L.rough[k] = clamp01(L.rough[k] + dirt * 0.4);
      L.metal[k] *= 1 - dirt;
      return 0;
    });
    return L.finish();
  }
}

// --- Paint on cast iron and sheet steel. ---

/** Thick, chipped enamel over cast iron: hydrants, bollards, bench ends. */
function enamel(tex: Tex, seed: number, color: RGB, wear: number): TextureData {
  const L = new Layers(tex, color, 0.38);
  const lump = tex.noise(0.035, 0.035, seed, 3);
  const tone = tex.noise(0.4, 0.4, seed + 1, 3);
  const chipN = tex.noise(0.06, 0.06, seed + 2, 4, 0.6);
  const fine = tex.noise(0.012, 0.012, seed + 3, 2);
  const run = tex.noise(0.04, 0.7, seed + 4, 2);
  const rust: RGB = [0.36, 0.2, 0.11];
  tex.map((x, y, k) => {
    const chip = sstep(0.5 - wear * 0.4, 0.56 - wear * 0.4, chipN(x, y) + fine(x, y) * 0.25);
    const stain = wear * sstep(0.1, 0.7, run(x, y)) * 0.35;
    const m = 1 + tone(x, y) * 0.1 - stain * 0.5;
    const dull = wear * 0.3;
    const grey = (color[0] + color[1] + color[2]) / 3;
    let [r, g, b] = [(color[0] + (grey - color[0]) * dull) * m, (color[1] + (grey - color[1]) * dull) * m, (color[2] + (grey - color[2]) * dull) * m];
    const rm = 0.75 + fine(x, y) * 0.5;
    r += (rust[0] * rm - r) * chip;
    g += (rust[1] * rm - g) * chip;
    b += (rust[2] * rm - b) * chip;
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.rough[k] = 0.36 + wear * 0.25 + chip * 0.5;
    L.height[k] = lump(x, y) * 0.0012 - chip * 0.0012;
    return 0;
  });
  return L.finish();
}
const enamelTile: Extra = { tile: 'xy', density: 256 };
const ENAMEL: [string, string, number][] = [
  ['red', '赤', 0xb3261c], ['yellow', '黄', 0xe0b414], ['white', '白', 0xdcdad2], ['silver', '銀', 0x9a9d9f], ['green', '緑', 0x2c5a3c],
  ['blue', '青', 0x1f4c8c], ['orange', '橙', 0xd8651c], ['black', '黒', 0x1c1c1d],
];
for (const [id, name, c] of ENAMEL) {
  add(`enamel-${id}`, `鋳鉄の塗装 ${name}`, [0.5, 0.5], (t, s) => enamel(t, s, hex(c), 0.12), enamelTile);
  if (id !== 'white' && id !== 'orange') add(`enamel-${id}-old`, `鋳鉄の塗装 ${name}・剥がれ`, [0.5, 0.5], (t, s) => enamel(t, s, hex(c), 0.75), enamelTile);
}

const COAT: [string, string, number, number][] = [
  ['mail-blue', '郵便ポストの青', 0x1d3c78, 0], ['mail-blue-old', '郵便ポストの青・古い', 0x2a4a80, 0.35], ['relay-green', '中継箱のオリーブ', 0x4a5638, 0.05],
  ['teal', '青緑', 0x1f5e5c, 0], ['burgundy', 'えんじ', 0x6a1f26, 0], ['brown', '茶', 0x4a3324, 0], ['cream', 'クリーム', 0xcfc6a8, 0.05],
  ['bin-green', 'ゴミ箱の濃緑', 0x21402c, 0.1], ['bin-green-old', 'ゴミ箱の濃緑・錆', 0x2a4632, 0.5], ['dumpster-blue', '大型ゴミ箱の青・錆', 0x24457a, 0.4],
  ['transformer-green', '変圧器の緑', 0x3f5a45, 0.08], ['can-grey', '柱上変圧器の灰', 0x8c9091, 0.15], ['can-grey-old', '柱上変圧器の灰・錆', 0x868a88, 0.55],
  ['stainless', 'ステンレス', 0, 0],
];
for (const [id, name, c, rust] of COAT) {
  add(`coat-${id}`, `塗装鋼板 ${name}`, [1, 1], (t, s) => S.metal(t, { seed: s, ...(c ? { paint: hex(c) } : {}), rust, streaks: rust > 0.1 ? rust : 0 }), tiled);
}

// --- Wood. ---

const WOOD: [string, string, number, number][] = [
  ['new', '新しい', 0x9a6a3c, 0.05], ['weathered', '風化', 0x8a7a66, 0.7], ['dark', '濃色仕上げ', 0x4c3220, 0.15], ['green', '緑塗装', 0x2f5a3a, 0.2],
  ['red', '赤茶塗装', 0x7a3020, 0.25], ['plastic', '再生樹脂・茶', 0x5a4636, 0],
];
for (const [id, name, c, w] of WOOD) add(`slats-${id}`, `ベンチの板 ${name}`, [0.36, 1.2], (t, s) => S.planks(t, { seed: s, width: 0.09, color: hex(c), weathered: w }), tiled);
add('crossarm', '電柱の腕木', [0.3, 1.2], (t, s) => S.planks(t, { seed: s, width: 0.3, color: hex(0x5a4a3a), weathered: 0.5 }), tiled);

// --- Open metalwork drawn as dark holes in a painted sheet. ---

function mesh(tex: Tex, seed: number, color: RGB, kind: 'diamond' | 'round' | 'grid' | 'slot', pitch: number, metalness: number): TextureData {
  const L = new Layers(tex, color, metalness ? 0.4 : 0.5);
  const tone = tex.noise(0.3, 0.3, seed, 3);
  const grime = tex.noise(0.15, 0.4, seed + 1, 3);
  tex.map((x, y, k) => {
    let hole = 0;
    if (kind === 'diamond') {
      const u = x / pitch;
      const v = y / (pitch * 0.5);
      const fu = u + (Math.floor(v) & 1) * 0.5;
      const dx = Math.abs(fu - Math.floor(fu) - 0.5);
      const dy = Math.abs(v - Math.floor(v) - 0.5);
      hole = 1 - sstep(0.3, 0.38, dx + dy * 0.8);
    } else if (kind === 'round') {
      const row = Math.floor(y / (pitch * 0.866));
      const u = x / pitch + (row & 1) * 0.5;
      hole = 1 - sstep(0.26, 0.32, Math.hypot(u - Math.floor(u) - 0.5, y / (pitch * 0.866) - row - 0.5));
    } else if (kind === 'grid') {
      const dx = Math.abs(x / pitch - Math.floor(x / pitch) - 0.5);
      const dy = Math.abs(y / pitch - Math.floor(y / pitch) - 0.5);
      hole = 1 - sstep(0.36, 0.41, Math.max(dx, dy));
    } else {
      const dx = Math.abs(x / pitch - Math.floor(x / pitch) - 0.5);
      const fy = y / (pitch * 5) - Math.floor(y / (pitch * 5));
      hole = (1 - sstep(0.2, 0.26, dx)) * (fy > 0.08 && fy < 0.92 ? 1 : 0);
    }
    const m = (1 + tone(x, y) * 0.1) * (1 - grime(x, y) * 0.25) * (1 - hole * 0.93);
    L.r[k] = color[0] * m;
    L.g[k] = color[1] * m;
    L.b[k] = color[2] * m;
    L.metal[k] = metalness * (1 - hole);
    L.rough[k] = 0.42 + hole * 0.5;
    L.height[k] = -hole * 0.003;
    return 0;
  });
  return L.finish();
}
const tileMesh: Extra = { tile: 'xy', density: 512 };
add('mesh-black', 'エキスパンドメタル 黒', [0.24, 0.24], (t, s) => mesh(t, s, hex(0x202122), 'diamond', 0.03, 0), tileMesh);
add('mesh-green', 'エキスパンドメタル 緑', [0.24, 0.24], (t, s) => mesh(t, s, hex(0x24452f), 'diamond', 0.03, 0), tileMesh);
add('mesh-galvanized', 'エキスパンドメタル 亜鉛めっき', [0.24, 0.24], (t, s) => mesh(t, s, hex(0x9a9ea0), 'diamond', 0.03, 0.8), tileMesh);
add('perforated-black', 'パンチングメタル 黒', [0.2, 0.1732], (t, s) => mesh(t, s, hex(0x232425), 'round', 0.02, 0), tileMesh);
add('perforated-steel', 'パンチングメタル ステンレス', [0.2, 0.1732], (t, s) => mesh(t, s, hex(0xa6a8aa), 'round', 0.02, 0.85), tileMesh);
add('perforated-blue', 'パンチングメタル 青', [0.2, 0.1732], (t, s) => mesh(t, s, hex(0x24487e), 'round', 0.02, 0), tileMesh);
add('grid-black', '格子 黒', [0.2, 0.2], (t, s) => mesh(t, s, hex(0x1e1f20), 'grid', 0.05, 0), tileMesh);
add('grid-galvanized', '格子 亜鉛めっき', [0.2, 0.2], (t, s) => mesh(t, s, hex(0x9da1a2), 'grid', 0.05, 0.8), tileMesh);
add('slots-black', '縦スリット 黒', [0.2, 0.5], (t, s) => mesh(t, s, hex(0x202122), 'slot', 0.025, 0), tileMesh);
add('slots-green', '縦スリット 緑', [0.2, 0.5], (t, s) => mesh(t, s, hex(0x264a33), 'slot', 0.025, 0), tileMesh);

/** Cast iron tree grate: rings of radial slots around the trunk opening. */
function grate(tex: Tex, seed: number, square: boolean): TextureData {
  const L = new Layers(tex, [0.2, 0.19, 0.18], 0.7);
  const tone = tex.noise(0.2, 0.2, seed, 3);
  const rustN = tex.noise(0.12, 0.12, seed + 1, 3);
  const [cx, cy] = [tex.mw / 2, tex.mh / 2];
  tex.map((x, y, k) => {
    const [dx, dy] = [x - cx, y - cy];
    let hole = 0;
    let seam = 0;
    if (square) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const ringI = Math.floor(d / 0.11);
      const fr = d / 0.11 - ringI;
      const along = Math.abs(dx) > Math.abs(dy) ? dy : dx;
      const fa = along / 0.035 - Math.floor(along / 0.035);
      hole = d < 0.2 ? 1 : fr > 0.18 && fr < 0.86 && fa > 0.3 && fa < 0.72 && Math.abs(along) < d - 0.03 ? 1 : 0;
      seam = Math.abs(dx) < 0.004 ? 1 : 0;
    } else {
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const ringI = Math.floor(d / 0.1);
      const fr = d / 0.1 - ringI;
      const n = 14 + ringI * 8;
      const fa = (a / (Math.PI * 2) + 1) * n - Math.floor((a / (Math.PI * 2) + 1) * n);
      hole = d < 0.2 ? 1 : fr > 0.16 && fr < 0.86 && fa > 0.3 && fa < 0.7 && d < Math.min(cx, cy) - 0.03 ? 1 : 0;
      seam = Math.abs(dx) < 0.004 ? 1 : 0;
    }
    const rust = sstep(0.05, 0.4, rustN(x, y)) * 0.6;
    const m = (1 + tone(x, y) * 0.15) * (1 - seam * 0.6);
    const earth = hole ? 0.75 + tone(x * 3, y * 3) * 0.3 : 0;
    L.r[k] = hole ? 0.2 * earth : (0.2 + rust * 0.16) * m;
    L.g[k] = hole ? 0.15 * earth : (0.19 + rust * 0.04) * m;
    L.b[k] = hole ? 0.11 * earth : (0.18 - rust * 0.05) * m;
    L.metal[k] = hole ? 0 : 0.5 * (1 - rust);
    L.rough[k] = hole ? 0.95 : 0.6 + rust * 0.3;
    L.height[k] = hole ? -0.012 : 0;
    return 0;
  });
  return L.finish();
}
add('grate-round', '樹木の根囲い 鋳鉄・放射', [1.2, 1.2], (t, s) => grate(t, s, false));
add('grate-square', '樹木の根囲い 鋳鉄・角', [1.2, 1.2], (t, s) => grate(t, s, true));

// --- Faces with lettering. ---

const P_BLUE = hex(0x1d3c78);
add('mail-front', '郵便ポスト 正面', [0.5, 0.75], (t, s) => {
  const a = new Art(t, P_BLUE, 0.4);
  a.rect(mul(P_BLUE, 0.45), 0.03, 0.52, 0.47, 0.535);
  a.rect(mul(P_BLUE, 1.35), 0.2, 0.545, 0.3, 0.57, { metal: 0.6, rough: 0.35, height: 0.004 });
  a.rect(WHITE, 0.06, 0.3, 0.44, 0.47);
  a.lines(P_BLUE, ['U.S. MAIL', 'PICKUP TIMES'], 0.25, 0.46, 0.036, { fit: 0.34 });
  a.lines(BLACK, ['MON-FRI 5:00 PM', 'SAT 1:00 PM'], 0.25, 0.375, 0.02, { fit: 0.34 });
  a.rect(WHITE, 0.06, 0.12, 0.44, 0.22);
  a.text(hex(0xb3151f), 'NO PACKAGES', 0.25, 0.175, 0.026, { fit: 0.34 });
  a.text(BLACK, 'OVER 10 OZ', 0.25, 0.135, 0.022);
  return a.done(s, 0.2);
});
add('mail-side', '郵便ポスト 側面', [0.5, 0.75], (t, s) => {
  const a = new Art(t, P_BLUE, 0.4);
  a.rect(WHITE, 0.07, 0.36, 0.43, 0.5);
  a.poly(P_BLUE, [[0.1, 0.39], [0.2, 0.47], [0.3, 0.42], [0.4, 0.47], [0.4, 0.44], [0.3, 0.39], [0.2, 0.44], [0.1, 0.375]]);
  a.text(WHITE, 'U.S. MAIL', 0.25, 0.28, 0.04, { fit: 0.36 });
  for (const x of [0.03, 0.47]) for (let y = 0.05; y < 0.75; y += 0.08) a.disc(mul(P_BLUE, 1.4), x, y, 0.006, { height: 0.002 });
  return a.done(s, 0.25);
});
add('mail-side-tagged', '郵便ポスト 側面・落書き', [0.5, 0.75], (t, s) => {
  const a = new Art(t, hex(0x2a4a80), 0.5);
  a.rect(WHITE, 0.07, 0.36, 0.43, 0.5);
  a.text(WHITE, 'U.S. MAIL', 0.25, 0.28, 0.04, { fit: 0.36 });
  return a.done(s, 0.7, 1);
});
add('relay-front', '郵便中継箱 正面', [0.6, 0.9], (t, s) => {
  const c = hex(0x4a5638);
  const a = new Art(t, c, 0.5);
  a.frame(mul(c, 0.6), 0.012);
  a.rect(mul(c, 0.5), 0.04, 0.04, 0.56, 0.05);
  a.rect(mul(c, 0.5), 0.04, 0.85, 0.56, 0.86);
  a.disc(hex(0x8a8a86), 0.5, 0.45, 0.018, { metal: 0.8, rough: 0.3, height: 0.004 });
  a.lines(WHITE, ['U.S. MAIL', 'RELAY BOX'], 0.3, 0.7, 0.04, { fit: 0.46 });
  a.text(mul(WHITE, 0.8), 'NOT FOR DEPOSIT OF MAIL', 0.3, 0.52, 0.018, { fit: 0.46 });
  return a.done(s, 0.4);
});

function meter(tex: Tex, seed: number, kind: 'dial' | 'digital' | 'expired', age: number): TextureData {
  const body = hex(0x7d8083);
  const a = new Art(tex, body, 0.4, 0.75);
  const [w, h] = [a.w, a.h];
  // Arched window with the time display.
  a.disc(BLACK, w / 2, h * 0.62, w * 0.4);
  a.rect(body, 0, 0, w, h * 0.56, { metal: 0.75 });
  if (kind === 'digital') {
    a.rect(hex(0x1c2a1e), w * 0.2, h * 0.6, w * 0.8, h * 0.82, { rough: 0.15 });
    a.text(hex(0x8fd08a), '1:24', w / 2, h * 0.66, h * 0.1);
  } else {
    a.disc(hex(0xdedccf), w / 2, h * 0.62, w * 0.34, { rough: 0.2 });
    a.rect(body, 0, 0, w, h * 0.6, { metal: 0.75 });
    for (let i = 0; i <= 6; i++) {
      const an = Math.PI * (0.12 + (0.76 * i) / 6);
      a.line(BLACK, [[w / 2 + Math.cos(an) * w * 0.26, h * 0.62 + Math.sin(an) * w * 0.26], [w / 2 + Math.cos(an) * w * 0.31, h * 0.62 + Math.sin(an) * w * 0.31]], 0.0012);
    }
    if (kind === 'expired') {
      a.rect(hex(0xc0241c), w * 0.28, h * 0.62, w * 0.72, h * 0.72);
      a.text(WHITE, 'EXPIRED', w / 2, h * 0.645, h * 0.05, { fit: w * 0.4 });
    } else a.line(hex(0xc0241c), [[w / 2, h * 0.62], [w / 2 + w * 0.2, h * 0.62 + w * 0.22]], 0.002);
  }
  a.rect(hex(0xe0c020), w * 0.12, h * 0.36, w * 0.88, h * 0.54);
  a.lines(BLACK, ['2 HOUR LIMIT', '8AM-6PM MON-SAT'], w / 2, h * 0.53, h * 0.05, { fit: w * 0.7 });
  a.rect(BLACK, w * 0.42, h * 0.24, w * 0.58, h * 0.262, { rough: 0.9, height: -0.003 });
  a.text(mul(WHITE, 0.9), '25C 10C 5C', w / 2, h * 0.16, h * 0.04, { fit: w * 0.7 });
  a.disc(hex(0x55585a), w / 2, h * 0.07, w * 0.07, { metal: 0.8, rough: 0.3, height: 0.003 });
  return a.done(seed, age);
}
add('meter-dial', 'パーキングメーター 針式', [0.16, 0.26], (t, s) => meter(t, s, 'dial', 0.2), { density: 1024 });
add('meter-expired', 'パーキングメーター 時間切れ', [0.16, 0.26], (t, s) => meter(t, s, 'expired', 0.25), { density: 1024 });
add('meter-digital', 'パーキングメーター 液晶', [0.16, 0.26], (t, s) => meter(t, s, 'digital', 0.1), { density: 1024 });
add('meter-old', 'パーキングメーター 古い', [0.16, 0.26], (t, s) => meter(t, s, 'dial', 0.8), { density: 1024 });
add('meter-back', 'パーキングメーター 背面', [0.16, 0.26], (t, s) => {
  const a = new Art(t, hex(0x7d8083), 0.4, 0.75);
  a.disc(hex(0x55585a), 0.08, 0.13, 0.03, { metal: 0.8, rough: 0.3, height: 0.003 });
  a.rect(hex(0xdedccf), 0.03, 0.18, 0.13, 0.215);
  a.text(BLACK, 'NO 4471', 0.08, 0.19, 0.014);
  return a.done(s, 0.3);
}, { density: 1024 });

function payStation(tex: Tex, seed: number, color: RGB, lit: boolean): TextureData {
  const a = new Art(tex, color, 0.45);
  const [w, h] = [a.w, a.h];
  a.rect(hex(0x134f9e), w * 0.08, h * 0.82, w * 0.92, h * 0.96);
  a.text(WHITE, 'PAY HERE', w / 2, h * 0.86, h * 0.055, { fit: w * 0.7 });
  a.rect(BLACK, w * 0.14, h * 0.58, w * 0.86, h * 0.78, { rough: 0.12 });
  if (lit) {
    a.rect(hex(0x9fc6d8), w * 0.16, h * 0.59, w * 0.84, h * 0.77, { rough: 0.12 });
    a.lines(hex(0x10202a), ['INSERT CARD', 'OR COINS'], w / 2, h * 0.75, h * 0.035, { fit: w * 0.6 });
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) a.rect(hex(0xb8bab8), w * (0.16 + i * 0.12), h * (0.5 - j * 0.045), w * (0.25 + i * 0.12), h * (0.535 - j * 0.045), { metal: 0.6, rough: 0.35, height: 0.002 });
  a.rect(hex(0x2c8a3c), w * 0.56, h * 0.48, w * 0.84, h * 0.535, { height: 0.002 });
  a.rect(hex(0xb3261c), w * 0.56, h * 0.41, w * 0.84, h * 0.465, { height: 0.002 });
  a.rect(BLACK, w * 0.58, h * 0.345, w * 0.82, h * 0.36, { height: -0.003 });
  a.rect(hex(0xe0c020), w * 0.14, h * 0.2, w * 0.86, h * 0.31);
  a.lines(BLACK, ['DISPLAY RECEIPT', 'ON DASHBOARD'], w / 2, h * 0.3, h * 0.03, { fit: w * 0.66 });
  a.rect(BLACK, w * 0.2, h * 0.06, w * 0.8, h * 0.15, { rough: 0.8, height: -0.004 });
  return a.done(seed, 0.2);
}
add('paystation-grey', '駐車料金精算機 灰', [0.4, 0.9], (t, s) => payStation(t, s, hex(0x6a6e72), true));
add('paystation-green', '駐車料金精算機 緑', [0.4, 0.9], (t, s) => payStation(t, s, hex(0x2d5a40), true));
add('paystation-off', '駐車料金精算機 故障', [0.4, 0.9], (t, s) => payStation(t, s, hex(0x5a5e62), false));

/** Newspaper vending box front: masthead card, window with the paper inside, coin mechanism. */
function newsBox(tex: Tex, seed: number, color: RGB, title: string, ink: RGB, empty: boolean, age: number): TextureData {
  const a = new Art(tex, color, 0.45);
  const [w, h] = [a.w, a.h];
  const rnd = new Rand(seed);
  a.rect(WHITE, w * 0.06, h * 0.8, w * 0.94, h * 0.96);
  a.text(ink, title, w / 2, h * 0.845, h * 0.075, { fit: w * 0.8, weight: 0.1 });
  a.rect(hex(0x1a1c1e), w * 0.08, h * 0.3, w * 0.92, h * 0.76, { rough: 0.15 });
  if (!empty) {
    a.rect(hex(0xd9d5c8), w * 0.13, h * 0.32, w * 0.87, h * 0.74, { rough: 0.8 });
    a.text(BLACK, title, w / 2, h * 0.675, h * 0.045, { fit: w * 0.66, weight: 0.1 });
    a.rect(BLACK, w * 0.16, h * 0.655, w * 0.84, h * 0.66);
    a.text(BLACK, rnd.pick(['MAYOR DENIES ALL', 'HEAT WAVE HITS', 'PORT STRIKE ENDS', 'RENTS UP AGAIN', 'TEAM WINS TITLE']), w / 2, h * 0.585, h * 0.04, { fit: w * 0.64 });
    a.rect(hex(0x8c8a84), w * 0.17, h * 0.4, w * 0.5, h * 0.56);
    for (let i = 0; i < 9; i++) a.rect(hex(0x77756f), w * 0.54, h * (0.545 - i * 0.018), w * (0.74 + rnd.next() * 0.09), h * (0.552 - i * 0.018));
    for (let i = 0; i < 3; i++) a.rect(hex(0x77756f), w * 0.17, h * (0.375 - i * 0.018), w * (0.7 + rnd.next() * 0.12), h * (0.382 - i * 0.018));
  }
  a.rect(hex(0x9a9c9e), w * 0.62, h * 0.12, w * 0.9, h * 0.25, { metal: 0.8, rough: 0.35, height: 0.004 });
  a.rect(BLACK, w * 0.72, h * 0.19, w * 0.8, h * 0.2, { height: -0.002 });
  a.rect(mul(color, 0.5), w * 0.1, h * 0.265, w * 0.9, h * 0.275);
  a.text(WHITE, '50C', w * 0.3, h * 0.15, h * 0.06);
  return a.done(seed, age, age > 0.6 ? 1 : 0);
}
const NEWS: [string, string, number, string, number][] = [
  ['red', '赤', 0xb0281e, 'DAILY NEWS', 0xb0281e], ['blue', '青', 0x1e4a8a, 'THE TRIBUNE', 0x141414], ['yellow', '黄', 0xe0b414, 'CITY WEEKLY', 0x141414],
  ['green', '緑', 0x2a6a3c, 'AUTO FINDER', 0x2a6a3c], ['white', '白', 0xd8d6cc, 'HOME GUIDE', 0x1e4a8a], ['black', '黒', 0x1c1c1e, 'THE TIMES', 0x141414],
  ['orange', '橙', 0xd8651c, 'JOB SEEKER', 0xd8651c],
];
for (const [id, name, c, title, ink] of NEWS) add(`news-${id}`, `新聞販売箱の正面 ${name}`, [0.45, 0.6], (t, s) => newsBox(t, s, hex(c), title, hex(ink), false, 0.2), { density: 512 });
add('news-empty', '新聞販売箱の正面 空・落書き', [0.45, 0.6], (t, s) => newsBox(t, s, hex(0x7a2a24), 'DAILY NEWS', hex(0xb0281e), true, 0.8), { density: 512 });

function binLabel(tex: Tex, seed: number, bg: RGB, linesText: string[], symbol: 'recycle' | 'person' | 'none'): TextureData {
  const a = new Art(tex, bg, 0.5);
  const [w, h] = [a.w, a.h];
  a.frame(WHITE, 0.008);
  if (symbol === 'recycle') {
    for (let i = 0; i < 3; i++) {
      const an = (i * Math.PI * 2) / 3 + Math.PI / 2;
      const p = (d: number, r: number): Pt => [w / 2 + Math.cos(an + d) * r, h * 0.62 + Math.sin(an + d) * r];
      a.line(WHITE, [p(-0.75, h * 0.2), p(0, h * 0.24), p(0.75, h * 0.2)], h * 0.025);
      a.poly(WHITE, [p(0.6, h * 0.14), p(0.95, h * 0.22), p(0.62, h * 0.29)]);
    }
  } else if (symbol === 'person') {
    a.disc(WHITE, w * 0.42, h * 0.8, h * 0.05);
    a.line(WHITE, [[w * 0.42, h * 0.72], [w * 0.42, h * 0.52], [w * 0.36, h * 0.38]], h * 0.03);
    a.line(WHITE, [[w * 0.42, h * 0.68], [w * 0.56, h * 0.6]], h * 0.022);
    a.rect(WHITE, w * 0.56, h * 0.4, w * 0.68, h * 0.56);
    a.disc(WHITE, w * 0.6, h * 0.64, h * 0.018);
  }
  a.lines(WHITE, linesText, w / 2, symbol === 'none' ? h * 0.72 : h * 0.34, h * (symbol === 'none' ? 0.16 : 0.1), { fit: w * 0.8 });
  return a.done(seed, 0.3);
}
add('label-trash', 'ゴミ箱の表示 TRASH', [0.3, 0.3], (t, s) => binLabel(t, s, hex(0x1e1e1e), ['TRASH'], 'person'), { density: 512 });
add('label-litter', 'ゴミ箱の表示 LITTER', [0.3, 0.3], (t, s) => binLabel(t, s, hex(0x21402c), ['KEEP OUR', 'CITY CLEAN'], 'person'), { density: 512 });
add('label-recycle', 'ゴミ箱の表示 RECYCLE', [0.3, 0.3], (t, s) => binLabel(t, s, hex(0x1e4a8a), ['RECYCLE'], 'recycle'), { density: 512 });
add('label-cans', 'ゴミ箱の表示 CANS & BOTTLES', [0.3, 0.3], (t, s) => binLabel(t, s, hex(0x2c7a3c), ['CANS AND', 'BOTTLES'], 'recycle'), { density: 512 });
add('label-landfill', 'ゴミ箱の表示 LANDFILL', [0.3, 0.3], (t, s) => binLabel(t, s, hex(0x3a3a3c), ['LANDFILL', 'ONLY'], 'none'), { density: 512 });

/** Litter seen from above: the open top of a full bin. */
add('litter', 'あふれたゴミ', [0.5, 0.5], (tex, seed) => {
  const L = new Layers(tex, [0.1, 0.1, 0.1], 0.85);
  const cell = tex.cells(0.07, seed);
  const crumple = tex.noise(0.02, 0.02, seed + 1, 3);
  const cols: RGB[] = [hex(0xd8d4c8), hex(0xb0281e), hex(0x7a5a3a), hex(0xe0c020), hex(0x1e4a8a), hex(0x2a2a2c), hex(0xc8c8c8), hex(0x8a6a44), hex(0xf0f0ea)];
  tex.map((x, y, k) => {
    const c = cell(x, y);
    const id = c.id;
    const col = cols[Math.floor(id * cols.length) % cols.length];
    const m = (0.7 + crumple(x, y) * 0.5) * (0.4 + sstep(0, 0.15, c.f2 - c.f1) * 0.6);
    L.r[k] = col[0] * m;
    L.g[k] = col[1] * m;
    L.b[k] = col[2] * m;
    L.height[k] = id * 0.02 + crumple(x, y) * 0.004;
    return 0;
  });
  return L.finish();
}, tiled);
add('bag-black', 'ゴミ袋 黒', [0.5, 0.5], (tex, seed) => {
  const L = new Layers(tex, [0.035, 0.035, 0.04], 0.3);
  const fold = tex.noise(0.05, 0.12, seed, 4, 0.6);
  const fine = tex.noise(0.012, 0.03, seed + 1, 2);
  tex.map((x, y, k) => {
    const f = fold(x, y);
    const m = 0.04 + sstep(0.15, 0.5, f) * 0.1 + fine(x, y) * 0.015;
    L.r[k] = m;
    L.g[k] = m;
    L.b[k] = m * 1.08;
    L.rough[k] = 0.25 + (1 - sstep(0.1, 0.5, f)) * 0.2;
    L.height[k] = f * 0.006 + fine(x, y) * 0.001;
    return 0;
  });
  return L.finish();
}, tiled);

// --- Bus shelter panels, posters and banners. ---

interface Poster {
  id: string;
  label: string;
  bg: number;
  /** Second colour for the lower band or shape. */
  alt: number;
  ink: number;
  head: string[];
  sub: string;
  motif: 'sun' | 'circle' | 'stripes' | 'burst' | 'skyline' | 'wave';
}
function poster(tex: Tex, seed: number, p: Poster, age: number): TextureData {
  const a = new Art(tex, hex(p.bg), 0.3);
  const [w, h] = [a.w, a.h];
  const alt = hex(p.alt);
  const ink = hex(p.ink);
  const rnd = new Rand(seed);
  if (p.motif === 'sun') {
    a.disc(alt, w / 2, h * 0.5, w * 0.34);
    for (let i = 0; i < 5; i++) a.rect(hex(p.bg), 0, h * (0.36 + i * 0.045), w, h * (0.375 + i * 0.045 + i * 0.004));
    a.rect(mul(alt, 0.55), 0, 0, w, h * 0.3);
  } else if (p.motif === 'circle') {
    a.disc(alt, w / 2, h * 0.4, w * 0.32);
    a.ring(hex(p.bg), w / 2, h * 0.4, w * 0.27, w * 0.012);
  } else if (p.motif === 'stripes') {
    for (let i = 0; i < 7; i++) a.poly(i % 2 ? alt : mul(alt, 0.7), [[0, h * (0.2 + i * 0.07)], [w, h * (0.34 + i * 0.07)], [w, h * (0.41 + i * 0.07)], [0, h * (0.27 + i * 0.07)]]);
  } else if (p.motif === 'burst') {
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      a.poly(alt, [[w / 2, h * 0.52], [w / 2 + Math.cos(an - 0.12) * w, h * 0.52 + Math.sin(an - 0.12) * w], [w / 2 + Math.cos(an + 0.12) * w, h * 0.52 + Math.sin(an + 0.12) * w]]);
    }
    a.disc(WHITE, w / 2, h * 0.52, w * 0.2);
  } else if (p.motif === 'skyline') {
    let x = 0;
    while (x < w) {
      const bw = rnd.range(0.07, 0.16) * w;
      a.rect(alt, x, 0, x + bw, h * rnd.range(0.2, 0.52));
      x += bw;
    }
    a.disc(hex(0xf0e0b0), w * 0.74, h * 0.66, w * 0.08);
  } else {
    for (let i = 0; i < 4; i++) {
      const pts: Pt[] = [];
      for (let k = 0; k <= 24; k++) pts.push([(k / 24) * w, h * (0.34 - i * 0.07) + Math.sin((k / 24) * Math.PI * 4 + i * 1.3) * h * 0.02]);
      a.poly(mul(alt, 1 - i * 0.14), [...pts, [w, 0], [0, 0]]);
    }
  }
  a.lines(ink, p.head, w / 2, h * 0.95, h * 0.085, { fit: w * 0.84, weight: 0.11 });
  a.text(ink, p.sub, w / 2, h * 0.06, h * 0.034, { fit: w * 0.84 });
  return a.done(seed, age);
}
const POSTERS: Poster[] = [
  { id: 'cola', label: '飲料', bg: 0xb81a1e, alt: 0xe8e6de, ink: 0xe8e6de, head: ['ZING', 'COLA'], sub: 'ICE COLD SINCE 1952', motif: 'circle' },
  { id: 'airline', label: '航空会社', bg: 0x2a78b8, alt: 0xf0c040, ink: 0xffffff, head: ['FLY', 'PACIFIC'], sub: 'DAILY NONSTOP TO HONOLULU', motif: 'sun' },
  { id: 'movie', label: '映画', bg: 0x14161c, alt: 0x8a1c1c, ink: 0xe8d8a0, head: ['MIDNIGHT', 'RUN'], sub: 'IN THEATERS FRIDAY', motif: 'skyline' },
  { id: 'burger', label: 'ハンバーガー', bg: 0xe8b020, alt: 0xc83a1c, ink: 0x3a1408, head: ['BIG BITE', 'BURGER'], sub: 'OPEN 24 HOURS', motif: 'burst' },
  { id: 'phone', label: '携帯電話', bg: 0x101418, alt: 0x18b8a8, ink: 0xf0f0f0, head: ['NOVA 12'], sub: 'UNLIMITED DATA  $39 A MONTH', motif: 'stripes' },
  { id: 'bank', label: '銀行', bg: 0x1c3a5a, alt: 0x2c6a9a, ink: 0xf0ead8, head: ['PACIFIC', 'TRUST'], sub: 'BANKING THAT STAYS LOCAL', motif: 'wave' },
  { id: 'radio', label: 'ラジオ局', bg: 0x5a1e7a, alt: 0xe83a8a, ink: 0xf8e040, head: ['KVRD', '97.3 FM'], sub: 'THE SOUND OF THE COAST', motif: 'burst' },
  { id: 'surf', label: 'サーフショップ', bg: 0xf0e8d0, alt: 0x1c8aa8, ink: 0x14404c, head: ['VERDE', 'SURF CO'], sub: 'BOARDS  WETSUITS  LESSONS', motif: 'wave' },
];
for (const p of POSTERS) add(`poster-${p.id}`, `広告ポスター ${p.label}・内照`, [1.2, 1.75], (t, s) => poster(t, s, p, 0.02), { emissive: 0.55 });
for (const p of POSTERS.slice(0, 4)) add(`poster-${p.id}-faded`, `広告ポスター ${p.label}・色あせ`, [1.2, 1.75], (t, s) => poster(t, s, p, 0.75));

/** Bench-back advertising boards. */
const BENCH_ADS: [string, string, number, number, string, string][] = [
  ['lawyer', '弁護士', 0xe8c020, 0x141414, 'INJURED? CALL 555-0142', 'DELGADO AND REEVES  ATTORNEYS'],
  ['realtor', '不動産', 0x1c3a6a, 0xf0f0ea, 'SELL YOUR HOME FAST', 'MARIA SOTO REALTY  555-0177'],
  ['dentist', '歯科', 0xf0f0ea, 0x1c7a8a, 'SMILE VERDE DENTAL', 'NEW PATIENTS WELCOME  555-0119'],
  ['bail', '保釈保証', 0xb0201c, 0xf0f0ea, 'BAIL BONDS 24 HRS', 'ACE BAIL  555-0188'],
  ['blank', '空き枠', 0xd8d6cc, 0x6a6a6a, 'YOUR AD HERE', 'CALL 555-0100'],
];
for (const [id, name, bg, ink, l1, l2] of BENCH_ADS) {
  add(`bench-ad-${id}`, `ベンチ広告 ${name}`, [1.8, 0.5], (t, s) => {
    const a = new Art(t, hex(bg), 0.45);
    a.frame(hex(ink), 0.012);
    a.text(hex(ink), l1, 0.9, 0.25, 0.13, { fit: 1.6, weight: 0.11 });
    a.text(hex(ink), l2, 0.9, 0.08, 0.07, { fit: 1.6 });
    return a.done(s, id === 'blank' ? 0.7 : 0.3, id === 'blank' ? 1 : 0);
  });
}

add('transit-map', '路線図・時刻表', [0.6, 0.9], (tex, seed) => {
  const a = new Art(tex, hex(0xe8e6dc), 0.35);
  const rnd = new Rand(seed);
  a.rect(hex(0x134f9e), 0, 0.8, 0.6, 0.9);
  a.text(WHITE, 'PORT VERDE TRANSIT', 0.3, 0.83, 0.036, { fit: 0.52 });
  const cols = [0xb81a1e, 0x1c7a3c, 0xe08a1c, 0x1e4a8a, 0x7a2a8a];
  for (let i = 0; i < 5; i++) {
    const pts: Pt[] = [[0.05, 0.42 + rnd.range(0, 0.32)]];
    for (let k = 1; k <= 5; k++) pts.push([0.05 + k * 0.1, rnd.chance(0.5) ? pts[k - 1][1] : 0.42 + rnd.range(0, 0.32)]);
    a.line(hex(cols[i]), pts, 0.004);
    for (const p of pts) a.disc(WHITE, p[0], p[1], 0.006);
    for (const p of pts) a.ring(hex(cols[i]), p[0], p[1], 0.006, 0.0015);
  }
  for (let j = 0; j < 12; j++) for (let i = 0; i < 6; i++) a.rect(hex(j % 2 ? 0x8a8a86 : 0x5a5a58), 0.05 + i * 0.087, 0.36 - j * 0.027, 0.115 + i * 0.087, 0.37 - j * 0.027);
  return a.done(seed, 0.25);
});
add('shelter-glass', '待合所のガラス', [1.2, 2], (tex, seed) => {
  const L = new Layers(tex, [0.62, 0.74, 0.76], 0.08, 0.26);
  const smear = tex.noise(0.4, 0.25, seed, 3);
  const scratch = tex.noise(0.3, 0.004, seed + 1, 2);
  tex.map((x, y, k) => {
    const low = 1 - sstep(0, 0.9, y);
    const dirt = clamp01(smear(x, y) * 0.5 + low * 0.5) * 0.35 + sstep(0.3, 0.45, scratch(x, y)) * 0.25;
    const band = y > 1.0 && y < 1.12 ? (Math.floor(x / 0.03) + Math.floor(y / 0.03)) % 2 : 0;
    L.r[k] = 0.62 + dirt * 0.2 + band * 0.3;
    L.g[k] = 0.74 + dirt * 0.1 + band * 0.2;
    L.b[k] = 0.76 + band * 0.2;
    L.alpha[k] = 0.26 + dirt * 0.4 + band * 0.45;
    L.rough[k] = 0.06 + dirt * 0.6;
    return 0;
  });
  return L.finish();
}, { decal: true });
add('shelter-glass-tagged', '待合所のガラス 落書き・ひっかき傷', [1.2, 2], (tex, seed) => {
  const L = new Layers(tex, [0.6, 0.7, 0.72], 0.1, 0.3);
  const smear = tex.noise(0.3, 0.2, seed, 3);
  const etch = tex.noise(0.09, 0.05, seed + 1, 3);
  const tag = tex.noise(0.22, 0.12, seed + 2, 2);
  tex.map((x, y, k) => {
    const dirt = clamp01(smear(x, y) * 0.7 + (1 - sstep(0, 1.2, y)) * 0.5) * 0.5;
    const e = (1 - sstep(0, 0.03, Math.abs(etch(x, y)))) * (y > 0.6 && y < 1.7 ? 0.7 : 0);
    const t = sstep(0.26, 0.31, tag(x, y)) * (y > 0.5 && y < 1.5 ? 1 : 0);
    L.r[k] = 0.6 + dirt * 0.2 + e * 0.3 - t * 0.5;
    L.g[k] = 0.7 + dirt * 0.1 + e * 0.25 - t * 0.62;
    L.b[k] = 0.72 + e * 0.25 - t * 0.6;
    L.alpha[k] = clamp01(0.3 + dirt * 0.45 + e * 0.5 + t * 0.6);
    L.rough[k] = 0.1 + dirt * 0.6 + e * 0.5;
    return 0;
  });
  return L.finish();
}, { decal: true });

const BANNERS: [string, string, number, number, string[], Poster['motif']][] = [
  ['festival', '夏祭り', 0xd8501c, 0xf0c040, ['SUMMER', 'FEST'], 'sun'],
  ['downtown', '都心', 0x1c3a6a, 0x2c6a9a, ['DOWN', 'TOWN'], 'skyline'],
  ['beach', '海岸', 0x1c8aa8, 0xf0e8d0, ['VERDE', 'BEACH'], 'wave'],
  ['arts', '芸術地区', 0x5a1e7a, 0xe83a8a, ['ARTS', 'DISTRICT'], 'stripes'],
  ['market', '朝市', 0x2c6a3c, 0xe8e0c0, ['FARMERS', 'MARKET'], 'circle'],
];
for (const [id, name, bg, alt, head, motif] of BANNERS) {
  add(`banner-${id}`, `街灯の旗 ${name}`, [0.75, 1.8], (tex, seed) => {
    return poster(tex, seed, { id, label: name, bg, alt, ink: 0xf8f6ee, head, sub: 'PORT VERDE', motif }, 0.2);
  });
}

// --- Electrical kit. ---

add('transformer-front', '地上変圧器 正面', [1.2, 1], (tex, seed) => {
  const c = hex(0x3f5a45);
  const a = new Art(tex, c, 0.5);
  a.rect(mul(c, 0.5), 0.596, 0.04, 0.604, 0.96);
  a.frame(mul(c, 0.6), 0.02);
  for (const x of [0.5, 0.7]) a.rect(hex(0x2a2c2c), x - 0.012, 0.42, x + 0.012, 0.56, { metal: 0.6, height: 0.004 });
  a.rect(hex(0xe0b414), 0.1, 0.62, 0.42, 0.84);
  a.poly(BLACK, [[0.14, 0.66], [0.26, 0.82], [0.38, 0.66]]);
  a.poly(hex(0xe0b414), [[0.25, 0.79], [0.22, 0.73], [0.26, 0.73], [0.24, 0.68], [0.3, 0.75], [0.26, 0.75], [0.28, 0.79]]);
  a.rect(WHITE, 0.76, 0.66, 1.1, 0.82);
  a.lines(hex(0xb3151f), ['DANGER', 'HIGH VOLTAGE'], 0.93, 0.81, 0.04, { fit: 0.3 });
  a.text(mul(WHITE, 0.75), 'PVE 20417', 0.93, 0.2, 0.03);
  return a.done(seed, 0.35);
});
add('transformer-tagged', '地上変圧器 正面・落書き', [1.2, 1], (tex, seed) => {
  const c = hex(0x46604a);
  const a = new Art(tex, c, 0.55);
  a.rect(mul(c, 0.5), 0.596, 0.04, 0.604, 0.96);
  a.frame(mul(c, 0.6), 0.02);
  a.rect(hex(0xe0b414), 0.1, 0.62, 0.42, 0.84);
  a.poly(BLACK, [[0.14, 0.66], [0.26, 0.82], [0.38, 0.66]]);
  return a.done(seed, 0.7, 1);
});
add('ceramic-brown', '碍子 茶', [0.2, 0.2], (t, s) => enamel(t, s, hex(0x4a2a1c), 0), tiled);
add('ceramic-grey', '碍子 灰', [0.2, 0.2], (t, s) => enamel(t, s, hex(0x9a9c9c), 0), tiled);
add('ceramic-white', '碍子 白', [0.2, 0.2], (t, s) => enamel(t, s, hex(0xd8d8d2), 0.02), tiled);
add('cable', '電線の被覆', [0.2, 0.2], (tex, seed) => {
  const L = new Layers(tex, [0.05, 0.05, 0.05], 0.7);
  const n = tex.noise(0.05, 0.05, seed, 3);
  tex.map((x, y, k) => {
    const m = 0.045 + n(x, y) * 0.02;
    L.r[k] = L.g[k] = L.b[k] = m;
    return 0;
  });
  return L.finish();
}, tiled);
add('meter-box', '電力量計', [0.25, 0.35], (tex, seed) => {
  const a = new Art(tex, hex(0x8c9091), 0.45, 0.6);
  a.disc(hex(0x202224), 0.125, 0.22, 0.085, { rough: 0.1 });
  a.disc(hex(0xd8d6cc), 0.125, 0.22, 0.07, { rough: 0.2 });
  for (let i = 0; i < 5; i++) a.ring(BLACK, 0.07 + i * 0.0275, 0.24, 0.009, 0.001);
  a.rect(BLACK, 0.075, 0.185, 0.175, 0.2);
  a.rect(hex(0xe8e6de), 0.06, 0.04, 0.19, 0.09);
  a.text(BLACK, 'PVE 88213', 0.125, 0.055, 0.016);
  return a.done(seed, 0.3);
}, { density: 512 });

// --- Lamps, phones and other small faces. ---

function frosted(tex: Tex, seed: number, color: RGB, on: boolean, ribs: boolean): TextureData {
  const L = new Layers(tex, color, 0.35);
  const dust = tex.noise(0.1, 0.1, seed, 3);
  tex.map((x, y, k) => {
    const rib = ribs ? 0.5 + 0.5 * Math.cos((x / tex.mw) * Math.PI * 2 * 16) : 0.5;
    const up = y / tex.mh;
    const g = on ? 0.72 + 0.28 * Math.sin(up * Math.PI) * (0.8 + rib * 0.2) : 0.5 + rib * 0.12;
    const d = 1 - dust(x, y) * (on ? 0.08 : 0.3) - (1 - sstep(0, 0.25, up)) * (on ? 0.1 : 0.25);
    L.r[k] = color[0] * g * d;
    L.g[k] = color[1] * g * d;
    L.b[k] = color[2] * g * d;
    L.rough[k] = 0.3 + dust(x, y) * 0.3;
    L.height[k] = ribs ? rib * 0.0015 : 0;
    return 0;
  });
  return L.finish();
}
const lampTile: Extra = { tile: 'x', density: 256 };
add('globe-on', '乳白グローブ 点灯', [0.5, 0.5], (t, s) => frosted(t, s, [1, 0.95, 0.82], true, false), { ...lampTile, emissive: 1.5 });
add('globe-off', '乳白グローブ 消灯', [0.5, 0.5], (t, s) => frosted(t, s, [0.86, 0.85, 0.8], false, false), lampTile);
add('acorn-on', 'プリズムガラス 点灯', [0.5, 0.5], (t, s) => frosted(t, s, [1, 0.86, 0.6], true, true), { ...lampTile, emissive: 1.5 });
add('acorn-off', 'プリズムガラス 消灯', [0.5, 0.5], (t, s) => frosted(t, s, [0.74, 0.75, 0.72], false, true), lampTile);
add('lantern-on', 'ランタンのガラス 点灯', [0.5, 0.5], (t, s) => frosted(t, s, [1, 0.78, 0.45], true, false), { ...lampTile, emissive: 1.3 });
add('led-strip-on', 'LED照明 点灯', [0.5, 0.5], (t, s) => frosted(t, s, [0.9, 0.95, 1], true, true), { ...lampTile, emissive: 1.8 });

add('payphone', '公衆電話 正面', [0.3, 0.5], (tex, seed) => {
  const a = new Art(tex, hex(0x2a2c30), 0.4, 0.5);
  a.rect(hex(0x134f9e), 0.02, 0.42, 0.28, 0.48);
  a.text(WHITE, 'PHONE', 0.15, 0.437, 0.026);
  a.rect(hex(0xa8aaac), 0.04, 0.05, 0.26, 0.4, { metal: 0.85, rough: 0.3 });
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) a.rect(hex(0x55585a), 0.13 + i * 0.04, 0.27 - j * 0.04, 0.16 + i * 0.04, 0.3 - j * 0.04, { metal: 0.7, height: 0.002 });
  a.rect(BLACK, 0.05, 0.1, 0.095, 0.37, { rough: 0.5, height: 0.01 });
  a.rect(BLACK, 0.2, 0.34, 0.25, 0.348, { height: -0.002 });
  a.rect(hex(0x3a3c40), 0.14, 0.06, 0.24, 0.1, { height: -0.004 });
  a.rect(hex(0xe8e6de), 0.13, 0.33, 0.19, 0.375);
  return a.done(seed, 0.4);
}, { density: 512 });
add('payphone-tagged', '公衆電話 正面・壊れ', [0.3, 0.5], (tex, seed) => {
  const a = new Art(tex, hex(0x34363a), 0.5, 0.4);
  a.rect(hex(0x1c4a8a), 0.02, 0.42, 0.28, 0.48);
  a.rect(hex(0x8a8c8e), 0.04, 0.05, 0.26, 0.4, { metal: 0.7, rough: 0.45 });
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) a.rect(hex(0x55585a), 0.13 + i * 0.04, 0.27 - j * 0.04, 0.16 + i * 0.04, 0.3 - j * 0.04, { metal: 0.7, height: 0.002 });
  a.rect(hex(0x3a3c40), 0.14, 0.06, 0.24, 0.1, { height: -0.004 });
  return a.done(seed, 0.8, 1);
}, { density: 512 });
add('phone-sign', '電話ボックスの表示', [0.6, 0.18], (tex, seed) => {
  const a = new Art(tex, hex(0x134f9e), 0.35);
  a.text(WHITE, 'TELEPHONE', 0.3, 0.05, 0.08, { fit: 0.5, weight: 0.1 });
  return a.done(seed, 0.2);
}, { emissive: 0.5 });
add('callbox', '非常通報機 正面', [0.3, 0.5], (tex, seed) => {
  const a = new Art(tex, hex(0xb3261c), 0.4);
  a.rect(WHITE, 0.03, 0.34, 0.27, 0.46);
  a.lines(hex(0xb3261c), ['FIRE', 'POLICE'], 0.15, 0.455, 0.036);
  a.rect(hex(0x8a1a14), 0.05, 0.08, 0.25, 0.3, { height: -0.002 });
  a.disc(hex(0xd8d6cc), 0.15, 0.19, 0.035, { metal: 0.7, rough: 0.3, height: 0.004 });
  a.text(WHITE, 'PULL', 0.15, 0.1, 0.022);
  return a.done(seed, 0.35);
}, { density: 512 });
add('bollard-band', '車止めの反射帯', [0.3, 0.3], (tex, seed) => {
  const L = new Layers(tex, hex(0xe0b414), 0.35);
  const n = tex.noise(0.1, 0.1, seed, 3);
  tex.map((x, y, k) => {
    const s = Math.floor((x + y) / 0.075) % 2;
    const c: RGB = s ? [0.08, 0.08, 0.08] : hex(0xe0b414);
    const m = 1 - n(x, y) * 0.15;
    L.r[k] = c[0] * m;
    L.g[k] = c[1] * m;
    L.b[k] = c[2] * m;
    return 0;
  });
  return L.finish();
}, tiled);
add('bollard-reflector', '車止めの反射帯 白赤', [0.3, 0.3], (tex, seed) => {
  const L = new Layers(tex, WHITE, 0.3);
  const n = tex.noise(0.1, 0.1, seed, 3);
  tex.map((x, y, k) => {
    const s = Math.floor(y / 0.075) % 2;
    const c: RGB = s ? hex(0xb3261c) : WHITE;
    const m = 1 - n(x, y) * 0.12;
    L.r[k] = c[0] * m;
    L.g[k] = c[1] * m;
    L.b[k] = c[2] * m;
    return 0;
  });
  return L.finish();
}, tiled);
add('tire', 'タイヤのゴム', [0.2, 0.2], (tex, seed) => {
  const L = new Layers(tex, [0.06, 0.06, 0.06], 0.85);
  const n = tex.noise(0.05, 0.05, seed, 2);
  tex.map((x, y, k) => {
    const tread = Math.abs(((x + Math.abs(y / 0.2 - 0.5) * 0.08) / 0.025) % 1 - 0.5) < 0.18 ? 1 : 0;
    const m = 0.07 + n(x, y) * 0.02 - tread * 0.035;
    L.r[k] = L.g[k] = L.b[k] = m;
    L.height[k] = -tread * 0.002;
    return 0;
  });
  return L.finish();
}, tiled);
add('terracotta', '素焼きの鉢', [0.5, 0.5], (tex, seed) => {
  const L = new Layers(tex, hex(0xa85a3a), 0.85);
  const tone = tex.noise(0.2, 0.2, seed, 3);
  const ring = tex.noise(1, 0.012, seed + 1, 2);
  const salt = tex.noise(0.12, 0.2, seed + 2, 3);
  tex.map((x, y, k) => {
    const m = 1 + tone(x, y) * 0.18 + ring(x, y) * 0.08;
    const w = sstep(0.15, 0.5, salt(x, y)) * (1 - sstep(0.1, 0.4, y)) * 0.5;
    L.r[k] = 0.66 * m + (0.8 - 0.66) * w;
    L.g[k] = 0.35 * m + (0.76 - 0.35) * w;
    L.b[k] = 0.23 * m + (0.7 - 0.23) * w;
    L.height[k] = ring(x, y) * 0.0006;
    return 0;
  });
  return L.finish();
}, tiled);
function foliage(tex: Tex, seed: number, a: RGB, b: RGB, flowers: RGB | null): TextureData {
  const L = new Layers(tex, a, 0.8);
  const leaf = tex.cells(0.035, seed);
  const clump = tex.noise(0.18, 0.18, seed + 1, 3);
  const bloom = tex.cells(0.06, seed + 2);
  tex.map((x, y, k) => {
    const c = leaf(x, y);
    const id = c.id;
    const rim = sstep(0, 0.25, c.f2 - c.f1);
    const t = clamp01(0.5 + clump(x, y) * 0.9 + (id - 0.5) * 0.6);
    const sh = 0.55 + rim * 0.45;
    let [r, g, bl] = [(a[0] + (b[0] - a[0]) * t) * sh, (a[1] + (b[1] - a[1]) * t) * sh, (a[2] + (b[2] - a[2]) * t) * sh];
    if (flowers) {
      const f = bloom(x, y);
      if (f.id > 0.55 && f.f1 < 0.32) [r, g, bl] = [flowers[0] * (0.8 + f.id * 0.3), flowers[1] * (0.8 + f.id * 0.3), flowers[2]];
    }
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = bl;
    L.height[k] = id * 0.01 + rim * 0.004;
    return 0;
  });
  return L.finish();
}
add('shrub', '低木の葉', [0.6, 0.6], (t, s) => foliage(t, s, hex(0x1f3a1c), hex(0x4a7030), null), tiled);
add('shrub-dry', '低木の葉 乾燥', [0.6, 0.6], (t, s) => foliage(t, s, hex(0x4a4a24), hex(0x8a7a40), null), tiled);
add('flowers-red', '花壇 赤', [0.6, 0.6], (t, s) => foliage(t, s, hex(0x24401c), hex(0x4a7030), hex(0xc8281e)), tiled);
add('flowers-yellow', '花壇 黄', [0.6, 0.6], (t, s) => foliage(t, s, hex(0x24401c), hex(0x4a7030), hex(0xe8c020)), tiled);
add('flowers-purple', '花壇 紫', [0.6, 0.6], (t, s) => foliage(t, s, hex(0x24401c), hex(0x4a7030), hex(0x8a3ab0)), tiled);

export const FURNITURE_TEXTURES: readonly TextureSpec[] = list;
