import { RGB, TextureData, TextureSpec, Tex, clamp01, hash2, hex, sstep } from './core';
import * as S from './surfaces';
import { Art, paint } from './trims';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'reflect' | 'emissive' | 'decal' | 'cutout'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 67000 + list.length * 7;
  list.push({ id: `prop/${id}`, label, category: 'prop', meters, tile: 'none', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}
const shade = (c: RGB, m: number): RGB => [clamp01(c[0] * m), clamp01(c[1] * m), clamp01(c[2] * m)];
const WHITE: RGB = [0.92, 0.91, 0.88];
const INK: RGB = [0.08, 0.08, 0.09];

// --- Glazing you can see through: the rooms behind it are built. ---
const GLAZING: [string, string, number][] = [['aluminium', 'アルミ', 0xb4b6b8], ['black', '黒', 0x1c1c1e], ['red', '赤', 0x9c2420], ['white', '白', 0xe6e4dc], ['bronze', 'ブロンズ', 0x4a3c30], ['green', '緑', 0x2c5a3c]];
for (const [id, label, c] of GLAZING)
  for (const [kind, h] of [['', 2.2], ['-low', 1.5]] as const)
    add(`glass-${id}${kind}`, `透ける店のガラス ${label}${kind ? '・腰高' : ''}`, [1.5, h], (t, s) => {
      const a = new Art(t, [0.05, 0.075, 0.09], 0.05, 0.2);
      // The sky lies on the upper glass and hides a little of the room.
      t.map((x, y, k) => {
        a.L.alpha[k] = 0.16 + 0.22 * sstep(h * 0.45, h, y) + 0.05 * sstep(0.3, 0, Math.abs(x - 0.75 - (y - h / 2) * 0.35));
        return 0;
      });
      a.rect([0.5, 0.62, 0.75], 0, h * 0.5, 1.5, h, { rough: 0.05, opacity: 0.35, soft: h * 0.3 });
      const f = hex(c);
      const bar = { alpha: true, rough: 0.4, height: 0.005 };
      a.rect(f, 0, 0, 1.5, kind ? 0.05 : 0.22, bar);
      a.rect(f, 0, h - 0.06, 1.5, h, bar);
      a.rect(f, 0, 0, 0.03, h, bar);
      a.rect(f, 1.47, 0, 1.5, h, bar);
      if (!kind) a.rect(shade(f, 0.8), 0.03, 0.02, 1.47, 0.2, { alpha: true, rough: 0.5 });
      return a.done(s, 0.06);
    }, { tile: 'x', decal: true, density: 128, reflect: 0.8 });

// --- Plain materials of furniture. ---
const PLASTIC: [string, string, number][] = [
  ['red', '赤', 0xc8281c], ['yellow', '黄', 0xe8b81c], ['white', '白', 0xecebe6], ['black', '黒', 0x1a1a1c], ['teal', '青緑', 0x1c8c88], ['orange', 'オレンジ', 0xe0701c],
  ['green', '緑', 0x2c8c40], ['blue', '青', 0x2450a8], ['cream', 'クリーム', 0xe4d8b4], ['brown', '茶', 0x5c3a24], ['grey', '灰', 0x8a8c8e], ['pink', 'ピンク', 0xe498a8],
];
for (const [id, label, c] of PLASTIC) add(`plastic-${id}`, `樹脂 ${label}`, [0.5, 0.5], (t, s) => paint(t, s, hex(c), { rough: 0.4, wear: 0.03, chips: 0 }), { tile: 'xy', density: 64 });
add('chrome', 'クロームめっき', [0.5, 0.5], (t, s) => paint(t, s, [0.78, 0.79, 0.8], { rough: 0.12, metal: 0.9, wear: 0, chips: 0 }), { tile: 'xy', density: 64, reflect: 0.9 });
add('steel', '厨房のステンレス', [1, 1], (t, s) => S.metal(t, { seed: s, paint: [0.72, 0.73, 0.74], rust: 0, streaks: 0.05 }), { tile: 'xy', density: 64, reflect: 0.5 });
const VINYL: [string, string, number][] = [['red', '赤', 0xb0241c], ['teal', '青緑', 0x1c7c80], ['brown', '茶', 0x5a3420], ['cream', 'クリーム', 0xdccca0], ['black', '黒', 0x202022], ['orange', 'オレンジ', 0xd0641c], ['green', '緑', 0x2a6a3c]];
for (const [id, label, c] of VINYL)
  add(`vinyl-${id}`, `ビニール張り ${label}`, [0.5, 0.5], (t, s) => {
    const a = new Art(t, hex(c), 0.38);
    // Channels sewn down the back.
    for (let x = 0; x < 0.5; x += 0.125) {
      a.rect(shade(hex(c), 0.62), x - 0.004, -0.1, x + 0.004, 0.6, { height: -0.006 });
      a.rect(shade(hex(c), 1.18), x + 0.035, -0.1, x + 0.075, 0.6, { opacity: 0.35, soft: 0.02, height: 0.004 });
    }
    // No ageing: its dirt gathers at the foot of a sheet, and this one repeats.
    return a.done(s, 0);
  }, { tile: 'xy', density: 128 });
const LAMINATE: [string, string, number, number][] = [['white', '白', 0xe6e4dc, 0], ['grey', '灰の斑', 0xa8a8a4, 1], ['red', '赤の斑', 0xb03024, 1], ['cream', 'クリーム', 0xdcd0ac, 0], ['teal', '青緑の斑', 0x3c8c88, 1], ['black', '黒', 0x242426, 0]];
for (const [id, label, c, fleck] of LAMINATE)
  add(`laminate-${id}`, `メラミン天板 ${label}`, [0.6, 0.6], (t, s) => {
    const a = new Art(t, hex(c), 0.3);
    if (fleck) {
      const n = t.noise(0.012, 0.012, s, 2);
      a.put(shade(hex(c), 1.35), (m) => t.map((x, y, k) => ((m[k] = sstep(0.25, 0.4, n(x, y))), 0)), { opacity: 0.6 });
      a.put(shade(hex(c), 0.6), (m) => t.map((x, y, k) => ((m[k] = sstep(0.3, 0.45, -n(x + 3, y))), 0)), { opacity: 0.5 });
    }
    return a.done(s, 0);
  }, { tile: 'xy', density: 128 });
for (const [id, label, c] of [['oak', 'オーク', 0xa87c4c], ['walnut', 'ウォルナット', 0x5c3c26], ['pine', '松', 0xc8a470]] as const)
  add(`wood-${id}`, `家具の木 ${label}`, [0.6, 0.6], (t, s) => S.planks(t, { seed: s, width: 0.15, color: hex(c), weathered: 0 }), { tile: 'xy', density: 128 });

// --- Floors, walls and ceilings of a dining room. ---
const CHECKS: [string, string, number, number][] = [['bw', '白黒', 0xe4e2da, 0x1c1c1e], ['red', '赤白', 0xe4e0d4, 0xa42c20], ['green', '緑白', 0xdcdccc, 0x2c6444], ['teal', '青緑とクリーム', 0xe0d8bc, 0x2c7c7c]];
for (const [id, label, c0, c1] of CHECKS)
  add(`floor-check-${id}`, `床 市松 ${label}`, [0.6, 0.6], (t, s) => {
    const a = new Art(t, hex(c0), 0.35);
    a.rect(hex(c1), 0, 0, 0.3, 0.3, { rough: 0.35 });
    a.rect(hex(c1), 0.3, 0.3, 0.6, 0.6, { rough: 0.35 });
    for (const x of [0, 0.3, 0.6]) {
      a.rect([0.3, 0.29, 0.27], x - 0.003, 0, x + 0.003, 0.6, { height: -0.002, opacity: 0.6 });
      a.rect([0.3, 0.29, 0.27], 0, x - 0.003, 0.6, x + 0.003, { height: -0.002, opacity: 0.6 });
    }
    return a.done(s, 0.12);
  }, { tile: 'xy', density: 128 });
const TILES: [string, string, number, number][] = [['beige', 'ベージュ', 0xc8b894, 0.3], ['grey', '灰', 0x9c9c98, 0.3], ['quarry', '厨房の赤いタイル', 0x8c4630, 0.15], ['terracotta', 'テラコッタ', 0xb86c44, 0.3], ['cream', 'クリーム', 0xdcd4bc, 0.45]];
for (const [id, label, c, size] of TILES)
  add(`floor-tile-${id}`, `床タイル ${label}`, [size * 2, size * 2], (t, s) => {
    const a = new Art(t, hex(c), 0.4);
    const n = t.noise(size, size, s, 1);
    a.put(shade(hex(c), 0.86), (m) => t.map((x, y, k) => ((m[k] = sstep(0, 0.5, n(Math.floor(x / size) * size + 0.01, Math.floor(y / size) * size + 0.01))), 0)), { opacity: 0.7 });
    for (const x of [0, size, size * 2]) {
      a.rect(shade(hex(c), 0.55), x - 0.004, 0, x + 0.004, size * 2, { height: -0.003 });
      a.rect(shade(hex(c), 0.55), 0, x - 0.004, size * 2, x + 0.004, { height: -0.003 });
    }
    return a.done(s, 0.15);
  }, { tile: 'xy', density: 128 });
add('floor-wood', '床 フローリング', [1.2, 1.2], (t, s) => S.planks(t, { seed: s, width: 0.12, color: hex(0x8c6038), weathered: 0.05 }), { tile: 'xy', density: 96 });
/** Walls 3 m high: a dado below, a rail, and paint or tile above. */
const WALLS: [string, string, number, number, number, 'paint' | 'tile' | 'wood' | 'stripe'][] = [
  ['cream-red', 'クリームと赤い腰壁', 0xe8dcc0, 0xa82c20, 0xe8e4d8, 'paint'], ['white-tile', '白いタイル', 0xecebe6, 0xecebe6, 0x2c2c30, 'tile'], ['yellow-wood', '黄色と木の腰壁', 0xe8c458, 0x7a5030, 0x4c3020, 'wood'],
  ['teal-cream', '青緑とクリーム', 0xe4dcc0, 0x2c7c7c, 0xd8d0b4, 'paint'], ['orange-brown', 'オレンジと茶', 0xe0965c, 0x5c3824, 0x3c2418, 'wood'], ['green-white', '白と緑の縞', 0xe8e6dc, 0x2c6c44, 0xe8e6dc, 'stripe'],
  ['pink-chrome', 'ピンクと銀', 0xe8b4b4, 0xb4b8bc, 0x8c2c3c, 'tile'], ['grey-black', '灰と黒', 0xb8b8b4, 0x2c2c30, 0xd8a41c, 'paint'],
];
for (const [id, label, up, lo, rail, kind] of WALLS)
  add(`wall-${id}`, `店内の壁 ${label}`, [1.2, 3], (t, s) => {
    const a = new Art(t, hex(up), 0.7);
    if (kind === 'tile') for (let y = 0; y < 3; y += 0.15) for (let x = 0; x < 1.2; x += 0.15) a.rect(hex((Math.floor(y / 0.15) + Math.floor(x / 0.15)) % 2 || y > 1.05 ? up : lo), x + 0.004, y + 0.004, x + 0.146, y + 0.146, { rough: 0.25, height: 0.002 });
    else a.rect(hex(lo), 0, 0, 1.2, 0.95, { rough: 0.6 });
    if (kind === 'wood') for (let x = 0; x < 1.2; x += 0.12) a.rect(shade(hex(lo), 0.7), x - 0.004, 0.1, x + 0.004, 0.95, { height: -0.004 });
    if (kind === 'stripe') for (let x = 0; x < 1.2; x += 0.3) a.rect(hex(lo), x, 1.05, x + 0.15, 3, { opacity: 0.85 });
    a.rect(hex(rail), 0, 0.95, 1.2, 1.05, { rough: 0.4, height: 0.012 });
    a.rect(shade(hex(lo), 0.6), 0, 0, 1.2, 0.1, { rough: 0.6, height: 0.008 });
    return a.done(s, 0.08);
  }, { tile: 'x', density: 96 });
add('ceiling', '天井 吸音板', [1.2, 1.2], (t, s) => {
  const a = new Art(t, [0.86, 0.86, 0.83], 0.9);
  const n = t.noise(0.01, 0.01, s, 2);
  a.put([0.55, 0.55, 0.52], (m) => t.map((x, y, k) => ((m[k] = sstep(0.35, 0.5, n(x, y))), 0)), { opacity: 0.5, height: -0.002 });
  for (const x of [0, 0.6, 1.2]) {
    a.rect([0.95, 0.95, 0.94], x - 0.012, 0, x + 0.012, 1.2, { height: 0.003, rough: 0.5 });
    a.rect([0.95, 0.95, 0.94], 0, x - 0.012, 1.2, x + 0.012, { height: 0.003, rough: 0.5 });
  }
  return a.done(s, 0.03);
}, { tile: 'xy', density: 96 });
add('light', '点いた照明の面', [0.6, 0.6], (t, s) => {
  const a = new Art(t, [1, 0.97, 0.88], 0.4);
  a.rect([0.8, 0.8, 0.78], 0, 0, 0.6, 0.015);
  a.rect([0.8, 0.8, 0.78], 0, 0.585, 0.6, 0.6);
  a.rect([0.8, 0.8, 0.78], 0, 0, 0.015, 0.6);
  a.rect([0.8, 0.8, 0.78], 0.585, 0, 0.6, 0.6);
  return a.done(s, 0);
}, { density: 32, emissive: 1 });
const COUNTERS: [string, string, number, number, number][] = [['red', '赤と白', 0xc02c20, 0xecebe6, 0xe8b81c], ['wood', '木目', 0x8c6038, 0x5c3c26, 0x2c2c30], ['steel', 'ステンレス', 0xb4b8bb, 0x8c9094, 0x2c2c30], ['teal', '青緑', 0x1c7c80, 0xe4dcc0, 0xb4b8bb], ['yellow', '黄', 0xe0b028, 0xa82c20, 0xecebe6], ['green', '緑', 0x2c6c44, 0xe8e6dc, 0xd8a41c], ['black', '黒', 0x242426, 0x3a3a3e, 0xd0641c]];
for (const [id, label, c, c2, c3] of COUNTERS)
  add(`counter-${id}`, `カウンターの腰 ${label}`, [1.2, 1.05], (t, s) => {
    const a = new Art(t, hex(c), 0.45);
    a.panel(hex(c), 0.02, 0.14, 1.18, 0.8, 0.004);
    a.rect(hex(c2), 0, 0.82, 1.2, 0.98, { rough: 0.4 });
    a.rect(hex(c3), 0, 0.86, 1.2, 0.9, { rough: 0.35 });
    a.rect([0.1, 0.1, 0.1], 0, 0, 1.2, 0.1, { rough: 0.7 });
    a.rect(shade(hex(c), 0.5), 0, 0.5, 1.2, 0.515, { height: -0.002, opacity: 0.4 });
    return a.done(s, 0.12);
  }, { tile: 'x', density: 128 });

// --- Menu boards over the counter: lit from behind. ---
type Food = 'burger' | 'taco' | 'donut' | 'pizza' | 'noodle' | 'coffee' | 'chicken' | 'pancake' | 'fries' | 'cup';
/** A picture of a dish seen from the side or from above, about 2r across. */
function food(a: Art, kind: Food, x: number, y: number, r: number): void {
  const o = { rough: 0.5 };
  if (kind === 'burger') {
    a.rect([0.78, 0.5, 0.2], x - r, y - r * 0.6, x + r, y - r * 0.25, o);
    a.rect([0.3, 0.14, 0.08], x - r * 1.05, y - r * 0.25, x + r * 1.05, y + 0.02 * r, o);
    a.rect([0.95, 0.75, 0.15], x - r * 1.08, y, x + r * 1.08, y + r * 0.1, o);
    a.rect([0.3, 0.6, 0.2], x - r * 1.1, y + r * 0.1, x + r * 1.1, y + r * 0.2, o);
    a.disc([0.82, 0.54, 0.22], x, y + r * 0.15, r, o);
    a.rect([0.82, 0.54, 0.22], x - r, y + r * 0.2, x + r, y + r * 0.22, o);
  } else if (kind === 'taco') {
    a.disc([0.9, 0.72, 0.3], x, y - r * 0.2, r, o);
    a.rect([0.3, 0.6, 0.2], x - r * 0.8, y + r * 0.3, x + r * 0.8, y + r * 0.55, o);
    a.rect([0.8, 0.2, 0.12], x - r * 0.5, y + r * 0.45, x + r * 0.5, y + r * 0.7, o);
  } else if (kind === 'donut') {
    a.disc([0.8, 0.56, 0.3], x, y, r, o);
    a.disc([0.9, 0.45, 0.6], x, y, r * 0.82, o);
    a.disc([0.96, 0.94, 0.88], x, y, r * 0.3, o);
  } else if (kind === 'pizza') {
    a.disc([0.82, 0.6, 0.3], x, y, r, o);
    a.disc([0.9, 0.74, 0.3], x, y, r * 0.85, o);
    for (let i = 0; i < 6; i++) a.disc([0.7, 0.16, 0.1], x + Math.cos(i * 1.05) * r * 0.5, y + Math.sin(i * 1.05) * r * 0.5, r * 0.16, o);
  } else if (kind === 'noodle') {
    a.disc([0.85, 0.2, 0.14], x, y, r, o);
    a.disc([0.82, 0.62, 0.3], x, y, r * 0.8, o);
    a.disc([0.96, 0.92, 0.8], x - r * 0.25, y + r * 0.2, r * 0.25, o);
    a.rect([0.25, 0.5, 0.2], x, y - r * 0.4, x + r * 0.4, y - r * 0.2, o);
  } else if (kind === 'coffee' || kind === 'cup') {
    const c: RGB = kind === 'coffee' ? [0.94, 0.92, 0.86] : [0.85, 0.16, 0.12];
    a.rect(c, x - r * 0.55, y - r, x + r * 0.55, y + r * 0.7, o);
    a.rect([0.96, 0.96, 0.96], x - r * 0.65, y + r * 0.7, x + r * 0.65, y + r * 0.9, o);
    a.rect(kind === 'coffee' ? [0.4, 0.24, 0.12] : [0.96, 0.96, 0.96], x - r * 0.55, y - r * 0.3, x + r * 0.55, y + r * 0.2, o);
  } else if (kind === 'chicken') {
    a.rect([0.85, 0.16, 0.12], x - r * 0.7, y - r, x + r * 0.7, y + r * 0.3, o);
    for (let i = 0; i < 3; i++) a.disc([0.76, 0.48, 0.18], x + (i - 1) * r * 0.5, y + r * 0.45, r * 0.38, o);
  } else if (kind === 'pancake') {
    a.disc([0.94, 0.93, 0.9], x, y - r * 0.1, r, o);
    for (let i = 0; i < 3; i++) a.rect([0.84, 0.6, 0.28], x - r * 0.75, y - r * 0.35 + i * r * 0.26, x + r * 0.75, y - r * 0.12 + i * r * 0.26, o);
    a.rect([0.96, 0.86, 0.4], x - r * 0.2, y + r * 0.4, x + r * 0.2, y + r * 0.56, o);
  } else {
    a.rect([0.85, 0.16, 0.12], x - r * 0.6, y - r, x + r * 0.6, y + r * 0.1, o);
    for (let i = 0; i < 5; i++) a.rect([0.95, 0.78, 0.25], x - r * 0.55 + i * r * 0.24, y, x - r * 0.4 + i * r * 0.24, y + r * (0.6 + 0.3 * ((i * 7) % 3) / 2), o);
  }
}
const MENUS: [string, string, number, number, Food[], string[]][] = [
  ['burger', 'ハンバーガー', 0xb82018, 0xf4d020, ['burger', 'fries', 'cup', 'chicken'], ['BURGER', 'COMBO', 'DRINKS', 'CHICKEN']],
  ['taco', 'タコス', 0x2c7c3c, 0xe8641c, ['taco', 'taco', 'cup', 'fries'], ['TACOS', 'BURRITO', 'DRINKS', 'NACHOS']],
  ['donut', 'ドーナツ', 0xd85c8c, 0xf8f0e0, ['donut', 'coffee', 'donut', 'cup'], ['DONUTS', 'COFFEE', 'DOZEN', 'ICED']],
  ['pizza', 'ピザ', 0x2c6c3c, 0xc82018, ['pizza', 'pizza', 'cup', 'fries'], ['SLICE', 'WHOLE PIE', 'DRINKS', 'SIDES']],
  ['noodle', '麺', 0x1c1c1e, 0xc82018, ['noodle', 'noodle', 'cup', 'chicken'], ['RAMEN', 'UDON', 'TEA', 'GYOZA']],
  ['diner', 'ダイナー', 0x1c7c80, 0xf0e8d0, ['pancake', 'burger', 'coffee', 'fries'], ['BREAKFAST', 'LUNCH', 'COFFEE', 'SIDES']],
  ['coffee', 'コーヒー', 0x3c2a1c, 0xe8d8b0, ['coffee', 'coffee', 'donut', 'cup'], ['ESPRESSO', 'LATTE', 'BAKERY', 'ICED']],
  ['chicken', 'フライドチキン', 0xc82018, 0xf8f4ec, ['chicken', 'burger', 'fries', 'cup'], ['BUCKET', 'SANDWICH', 'SIDES', 'DRINKS']],
];
for (const [id, label, bg, fg, pics, heads] of MENUS)
  add(`menu-${id}`, `メニュー板 ${label}`, [3.2, 0.8], (t, s) => {
    const a = new Art(t, [0.05, 0.05, 0.05], 0.5);
    for (let i = 0; i < 4; i++) {
      const x = i * 0.8;
      a.rect(i % 2 ? shade(hex(bg), 0.82) : hex(bg), x + 0.012, 0.012, x + 0.788, 0.788, { rough: 0.4 });
      a.rect(hex(fg), x + 0.03, 0.62, x + 0.77, 0.76, { rough: 0.4 });
      a.text(hex(bg), heads[i], x + 0.4, 0.655, 0.075, { weight: 0.14, fit: 0.66 });
      food(a, pics[i], x + 0.2, 0.36, 0.12);
      for (let j = 0; j < 4; j++) {
        a.rect(hex(fg), x + 0.4, 0.5 - j * 0.115, x + 0.62, 0.52 - j * 0.115, { opacity: 0.85 });
        a.text(hex(fg), `${1 + ((i * 3 + j * 2 + s) % 7)}.${(j * 3 + i) % 2 ? '99' : '49'}`, x + 0.7, 0.485 - j * 0.115, 0.045, { weight: 0.13 });
      }
    }
    return a.done(s, 0);
  }, { density: 160, emissive: 0.85 });

// --- Posters on the wall and boards at the door. ---
const POSTERS: [string, string, number, number, Food, string, string][] = [
  ['burger', 'ハンバーガー', 0xf4d020, 0xb82018, 'burger', 'NEW', 'DOUBLE DELUXE'], ['coffee', 'コーヒー', 0x3c2a1c, 0xe8d8b0, 'coffee', 'FRESH', 'BREWED DAILY'], ['donut', 'ドーナツ', 0xf4c0d0, 0x8c2c5c, 'donut', 'SWEET', 'DOZEN 9.99'],
  ['pizza', 'ピザ', 0xf0e8d0, 0x2c6c3c, 'pizza', 'HOT', 'SLICE 2.50'], ['combo', 'セット', 0xb82018, 0xf8f4ec, 'fries', 'COMBO', 'MEAL 5.99'], ['noodle', '麺', 0x1c1c1e, 0xe8c040, 'noodle', 'RAMEN', 'LUNCH SET'],
  ['shake', 'シェイク', 0x7cc4d8, 0xf8f4ec, 'cup', 'COLD', 'SHAKES'], ['breakfast', '朝食', 0xe89c2c, 0x4c2c14, 'pancake', 'ALL DAY', 'BREAKFAST'],
];
for (const [id, label, bg, fg, pic, top, bot] of POSTERS)
  add(`poster-${id}`, `店内ポスター ${label}`, [0.6, 0.9], (t, s) => {
    const a = new Art(t, hex(bg), 0.5);
    a.rect(hex(fg), 0, 0, 0.6, 0.012);
    a.rect(hex(fg), 0, 0.888, 0.6, 0.9);
    a.rect(hex(fg), 0, 0, 0.012, 0.9);
    a.rect(hex(fg), 0.588, 0, 0.6, 0.9);
    a.text(hex(fg), top, 0.3, 0.7, 0.12, { weight: 0.15, fit: 0.5 });
    food(a, pic, 0.3, 0.42, 0.17);
    a.text(hex(fg), bot, 0.3, 0.07, 0.07, { weight: 0.13, fit: 0.5 });
    return a.done(s, 0.05);
  }, { density: 200 });
const BOARDS: [string, string, number, number, number, string[], Food | null][] = [
  ['coffee', '黒板 COFFEE', 0x1c2420, 0xf0ece0, 0x8c6038, ['COFFEE', 'TO GO', '2.50'], 'coffee'], ['lunch', '黒板 LUNCH', 0x1c1c1e, 0xf4e8a0, 0x5c3c26, ['LUNCH', 'SPECIAL', '8.99'], null],
  ['open', '白 OPEN', 0xf0ece0, 0xc02018, 0xb4b8bb, ['OPEN', 'COME IN'], null], ['sale', '黄 SALE', 0xf0c820, 0xb81c18, 0x1c1c1e, ['SALE', '50 OFF'], null],
  ['pizza', '赤 PIZZA', 0xb82018, 0xf8f0d8, 0x1c1c1e, ['PIZZA', 'SLICE', '2.50'], 'pizza'], ['happy', '黒板 HAPPY HOUR', 0x1c2028, 0x9cd8e8, 0x8c6038, ['HAPPY', 'HOUR', '4-7'], null],
  ['donut', 'ピンク DONUTS', 0xf0b8c8, 0x7c2450, 0xf8f4ec, ['FRESH', 'DONUTS'], 'donut'], ['ramen', '黒 RAMEN', 0x1c1c1e, 0xe84828, 0x1c1c1e, ['RAMEN', 'GYOZA', 'BEER'], 'noodle'],
  ['burger', '黄 BURGERS', 0xf4d020, 0xb82018, 0xb82018, ['BURGER', 'FRIES', '5.99'], 'burger'], ['barber', '白 HAIRCUT', 0xf0ece0, 0x243c8c, 0xb82018, ['HAIRCUT', '15'], null],
  ['flowers', '緑 FLOWERS', 0x2c5a3c, 0xf4e8c0, 0x8c6038, ['FLOWERS', 'FRESH', 'DAILY'], null], ['books', '茶 BOOKS', 0x5c3a24, 0xf0e4c4, 0x3c2418, ['USED', 'BOOKS'], null],
];
for (const [id, label, bg, fg, frame, lines, pic] of BOARDS)
  add(`board-${id}`, `立て看板の面 ${label}`, [0.6, 0.9], (t, s) => {
    const a = new Art(t, hex(frame), 0.55);
    a.rect(hex(bg), 0.035, 0.035, 0.565, 0.865, { rough: 0.7, height: -0.003 });
    const top = pic ? 0.72 : 0.68;
    lines.forEach((l, i) => a.text(hex(fg), l, 0.3, top - i * (pic ? 0.14 : 0.19), pic ? 0.09 : 0.12, { weight: 0.13, fit: 0.46 }));
    if (pic) food(a, pic, 0.3, 0.2, 0.11);
    return a.done(s, 0.2);
  }, { density: 200 });
const FLAGS: [string, string, number, number, string[]][] = [
  ['red', '赤 SALE', 0xc02018, 0xf8f4ec, ['S', 'A', 'L', 'E']], ['blue', '青 OPEN', 0x2450a8, 0xf8f4ec, ['O', 'P', 'E', 'N']], ['yellow', '黄 LUNCH', 0xf0c820, 0xb81c18, ['L', 'U', 'N', 'C', 'H']],
  ['green', '緑 FRESH', 0x2c7c3c, 0xf8f4ec, ['F', 'R', 'E', 'S', 'H']], ['orange', '橙 DEALS', 0xe0641c, 0x1c1c1e, ['D', 'E', 'A', 'L', 'S']], ['white', '白 NEW', 0xf0ece0, 0xc02018, ['N', 'E', 'W']],
];
for (const [id, label, bg, fg, letters] of FLAGS)
  add(`flag-${id}`, `のぼり旗 ${label}`, [0.6, 1.8], (t, s) => {
    const a = new Art(t, hex(bg), 0.8);
    a.rect(shade(hex(bg), 0.75), 0, 0, 0.6, 0.12);
    a.rect(shade(hex(bg), 0.75), 0, 1.68, 0.6, 1.8);
    letters.forEach((l, i) => a.text(hex(fg), l, 0.3, 1.42 - i * (1.3 / letters.length), Math.min(0.26, 1.1 / letters.length), { weight: 0.15 }));
    return a.done(s, 0.12);
  }, { density: 128 });

// --- Small things, many to a sheet. ---
/** Where each small thing lies in the sheet, in metres: x0, y0, x1, y1. */
export const PROP_PARTS = {
  'tray-burger': [0, 0.7, 0.4, 1], 'tray-chicken': [0.4, 0.7, 0.8, 1], 'tray-pizza': [0.8, 0.7, 1.2, 1], 'tray-noodle': [1.2, 0.7, 1.6, 1], 'tray-empty': [1.6, 0.7, 2, 1],
  'plate-pancake': [0, 0.4, 0.3, 0.7], 'plate-breakfast': [0.3, 0.4, 0.6, 0.7], 'plate-donut': [0.6, 0.4, 0.9, 0.7], 'plate-empty': [0.9, 0.4, 1.2, 0.7], 'placemat': [1.2, 0.4, 1.6, 0.7], 'pizza-box': [1.6, 0.4, 2, 0.7],
  'register': [0, 0.1, 0.3, 0.4], 'dispenser': [0.3, 0.1, 0.9, 0.4], 'fryer': [0.9, 0.1, 1.2, 0.4], 'oven': [1.2, 0.1, 1.5, 0.4], 'fridge': [1.5, 0.1, 1.75, 0.4], 'coffee': [1.75, 0.1, 2, 0.4],
  'thanks': [0, 0, 0.3, 0.1], 'push': [0.3, 0, 0.6, 0.1], 'wet-floor': [0.6, 0, 0.8, 0.1], 'cup-red': [0.8, 0, 0.9, 0.1], 'cup-white': [0.9, 0, 1, 0.1], 'cup-blue': [1, 0, 1.1, 0.1], 'ketchup': [1.1, 0, 1.15, 0.1], 'mustard': [1.15, 0, 1.2, 0.1],
  'napkins': [1.2, 0, 1.35, 0.1], 'menu-card': [1.35, 0, 1.5, 0.1], 'shelf': [1.5, 0, 2, 0.1],
} as const;
export type PropPart = keyof typeof PROP_PARTS;
add('parts', '小物の面', [2, 1], (t, s) => {
  const a = new Art(t, [0.5, 0.5, 0.5], 0.5);
  const P = PROP_PARTS;
  const tray = (r: readonly number[], c: RGB, items: [Food, number, number][]): void => {
    a.rect(c, r[0], r[1], r[2], r[3], { rough: 0.5 });
    a.rect(shade(c, 0.78), r[0] + 0.015, r[1] + 0.015, r[2] - 0.015, r[3] - 0.015, { rough: 0.5, height: -0.003 });
    if (items.length) a.rect([0.95, 0.94, 0.9], r[0] + 0.04, r[1] + 0.03, r[2] - 0.04, r[3] - 0.03, { rough: 0.8 });
    for (const [k, x, y] of items) food(a, k, r[0] + x, r[1] + y, 0.05);
  };
  tray(P['tray-burger'], [0.5, 0.3, 0.16], [['burger', 0.12, 0.17], ['fries', 0.26, 0.19], ['cup', 0.32, 0.09]]);
  tray(P['tray-chicken'], [0.7, 0.14, 0.1], [['chicken', 0.14, 0.17], ['fries', 0.28, 0.17], ['cup', 0.2, 0.08]]);
  tray(P['tray-pizza'], [0.2, 0.2, 0.2], [['pizza', 0.13, 0.15], ['pizza', 0.27, 0.15]]);
  tray(P['tray-noodle'], [0.14, 0.14, 0.14], [['noodle', 0.14, 0.15], ['cup', 0.3, 0.14]]);
  tray(P['tray-empty'], [0.5, 0.3, 0.16], []);
  const plate = (r: readonly number[], k: Food | null): void => {
    const [cx, cy] = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    a.rect([0.5, 0.5, 0.5], r[0], r[1], r[2], r[3]);
    a.disc([0.95, 0.95, 0.93], cx, cy, 0.14, { rough: 0.25 });
    a.disc([0.88, 0.88, 0.86], cx, cy, 0.1, { rough: 0.25, height: -0.003 });
    if (k) food(a, k, cx, cy, 0.075);
  };
  plate(P['plate-pancake'], 'pancake');
  plate(P['plate-breakfast'], 'burger');
  plate(P['plate-donut'], 'donut');
  plate(P['plate-empty'], null);
  let r: readonly number[] = P.placemat;
  a.rect([0.94, 0.9, 0.78], r[0], r[1], r[2], r[3], { rough: 0.8 });
  a.rect([0.7, 0.16, 0.12], r[0] + 0.02, r[1] + 0.02, r[2] - 0.02, r[1] + 0.035);
  a.rect([0.7, 0.16, 0.12], r[0] + 0.02, r[3] - 0.035, r[2] - 0.02, r[3] - 0.02);
  a.text([0.7, 0.16, 0.12], 'MENU', r[0] + 0.2, r[1] + 0.19, 0.05, { weight: 0.14 });
  for (let i = 0; i < 4; i++) a.rect([0.3, 0.3, 0.3], r[0] + 0.06, r[1] + 0.06 + i * 0.028, r[2] - 0.06, r[1] + 0.068 + i * 0.028, { opacity: 0.6 });
  r = P['pizza-box'];
  a.rect([0.86, 0.8, 0.66], r[0], r[1], r[2], r[3], { rough: 0.85 });
  a.disc([0.75, 0.16, 0.1], r[0] + 0.2, r[1] + 0.15, 0.09);
  a.text([0.95, 0.92, 0.85], 'PIZZA', r[0] + 0.2, r[1] + 0.13, 0.04, { weight: 0.15 });
  r = P.register;
  a.rect([0.16, 0.16, 0.17], r[0], r[1], r[2], r[3], { rough: 0.5 });
  a.rect([0.2, 0.5, 0.8], r[0] + 0.03, r[1] + 0.1, r[2] - 0.03, r[3] - 0.03, { rough: 0.15 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) a.rect(([[0.9, 0.5, 0.1], [0.3, 0.7, 0.3], [0.9, 0.9, 0.9]] as RGB[])[(i + j) % 3], r[0] + 0.05 + j * 0.052, r[1] + 0.12 + i * 0.05, r[0] + 0.09 + j * 0.052, r[1] + 0.155 + i * 0.05);
  r = P.dispenser;
  a.rect([0.78, 0.78, 0.78], r[0], r[1], r[2], r[3], { rough: 0.3, metal: 0.6 });
  ([[0.8, 0.12, 0.1], [0.1, 0.25, 0.6], [0.15, 0.5, 0.2], [0.9, 0.5, 0.1], [0.35, 0.2, 0.1], [0.9, 0.8, 0.2]] as RGB[]).forEach((c, i) => {
    a.rect(c, r[0] + 0.015 + i * 0.097, r[1] + 0.16, r[0] + 0.1 + i * 0.097, r[3] - 0.02, { rough: 0.3 });
    a.disc([0.95, 0.95, 0.95], r[0] + 0.057 + i * 0.097, r[1] + 0.23, 0.022);
    a.rect([0.1, 0.1, 0.1], r[0] + 0.045 + i * 0.097, r[1] + 0.1, r[0] + 0.07 + i * 0.097, r[1] + 0.16);
  });
  a.rect([0.12, 0.12, 0.12], r[0], r[1], r[2], r[1] + 0.04);
  r = P.fryer;
  a.rect([0.72, 0.73, 0.74], r[0], r[1], r[2], r[3], { rough: 0.3, metal: 0.7 });
  a.panel([0.66, 0.67, 0.68], r[0] + 0.02, r[1] + 0.02, r[0] + 0.145, r[1] + 0.2);
  a.panel([0.66, 0.67, 0.68], r[0] + 0.155, r[1] + 0.02, r[2] - 0.02, r[1] + 0.2);
  a.rect([0.1, 0.1, 0.1], r[0] + 0.02, r[1] + 0.22, r[2] - 0.02, r[3] - 0.02);
  for (let i = 0; i < 4; i++) a.disc(i % 2 ? [0.8, 0.2, 0.1] : [0.2, 0.7, 0.3], r[0] + 0.06 + i * 0.06, r[1] + 0.255, 0.012);
  r = P.oven;
  a.rect([0.7, 0.71, 0.72], r[0], r[1], r[2], r[3], { rough: 0.3, metal: 0.7 });
  a.rect([0.08, 0.06, 0.05], r[0] + 0.04, r[1] + 0.05, r[2] - 0.04, r[1] + 0.2, { rough: 0.1 });
  a.rect([0.9, 0.5, 0.15], r[0] + 0.06, r[1] + 0.07, r[2] - 0.06, r[1] + 0.1, { opacity: 0.7, soft: 0.02 });
  a.rect([0.3, 0.3, 0.3], r[0] + 0.04, r[1] + 0.215, r[2] - 0.04, r[1] + 0.23);
  for (let i = 0; i < 4; i++) a.disc([0.1, 0.1, 0.1], r[0] + 0.06 + i * 0.06, r[1] + 0.265, 0.014);
  r = P.fridge;
  a.rect([0.74, 0.75, 0.76], r[0], r[1], r[2], r[3], { rough: 0.3, metal: 0.7 });
  a.rect([0.4, 0.4, 0.4], r[0] + 0.122, r[1], r[0] + 0.128, r[3]);
  a.rect([0.2, 0.2, 0.2], r[0] + 0.09, r[1] + 0.1, r[0] + 0.105, r[1] + 0.22);
  a.rect([0.2, 0.2, 0.2], r[0] + 0.145, r[1] + 0.1, r[0] + 0.16, r[1] + 0.22);
  r = P.coffee;
  a.rect([0.14, 0.14, 0.15], r[0], r[1], r[2], r[3], { rough: 0.35 });
  a.rect([0.75, 0.75, 0.76], r[0] + 0.02, r[1] + 0.18, r[2] - 0.02, r[3] - 0.02, { rough: 0.25, metal: 0.7 });
  for (let i = 0; i < 2; i++) {
    a.rect([0.05, 0.05, 0.05], r[0] + 0.05 + i * 0.1, r[1] + 0.1, r[0] + 0.1 + i * 0.1, r[1] + 0.18);
    a.rect([0.9, 0.9, 0.88], r[0] + 0.055 + i * 0.1, r[1] + 0.02, r[0] + 0.095 + i * 0.1, r[1] + 0.075);
  }
  r = P.thanks;
  a.rect([0.55, 0.36, 0.2], r[0], r[1], r[2], r[3], { rough: 0.5 });
  a.rect([0.1, 0.1, 0.1], r[0] + 0.03, r[1] + 0.012, r[2] - 0.03, r[3] - 0.012, { rough: 0.5 });
  a.text([0.92, 0.9, 0.85], 'THANK YOU', r[0] + 0.15, r[1] + 0.035, 0.03, { weight: 0.14 });
  r = P.push;
  a.rect([0.72, 0.73, 0.74], r[0], r[1], r[2], r[3], { rough: 0.3, metal: 0.7 });
  a.rect([0.3, 0.3, 0.3], r[0] + 0.03, r[1] + 0.012, r[2] - 0.03, r[3] - 0.012, { rough: 0.4 });
  a.text([0.9, 0.9, 0.9], 'PUSH', r[0] + 0.15, r[1] + 0.035, 0.03, { weight: 0.14 });
  r = P['wet-floor'];
  a.rect([0.95, 0.8, 0.1], r[0], r[1], r[2], r[3], { rough: 0.5 });
  a.text(INK, 'CAUTION', r[0] + 0.1, r[1] + 0.06, 0.022, { weight: 0.15 });
  a.text(INK, 'WET FLOOR', r[0] + 0.1, r[1] + 0.02, 0.02, { weight: 0.15 });
  ([['cup-red', [0.8, 0.14, 0.1]], ['cup-white', [0.94, 0.93, 0.9]], ['cup-blue', [0.15, 0.3, 0.65]]] as [PropPart, RGB][]).forEach(([k, c]) => {
    const q = P[k];
    a.rect(c, q[0], q[1], q[2], q[3], { rough: 0.5 });
    a.rect(k === 'cup-white' ? [0.45, 0.28, 0.14] : WHITE, q[0], q[1] + 0.03, q[2], q[1] + 0.06, { rough: 0.5 });
  });
  a.rect([0.75, 0.1, 0.08], P.ketchup[0], P.ketchup[1], P.ketchup[2], P.ketchup[3], { rough: 0.35 });
  a.rect(WHITE, P.ketchup[0], P.ketchup[1] + 0.03, P.ketchup[2], P.ketchup[1] + 0.06);
  a.rect([0.92, 0.75, 0.1], P.mustard[0], P.mustard[1], P.mustard[2], P.mustard[3], { rough: 0.35 });
  a.rect([0.6, 0.2, 0.1], P.mustard[0], P.mustard[1] + 0.03, P.mustard[2], P.mustard[1] + 0.06);
  r = P.napkins;
  a.rect([0.74, 0.75, 0.76], r[0], r[1], r[2], r[3], { rough: 0.25, metal: 0.8 });
  a.rect([0.96, 0.96, 0.94], r[0] + 0.02, r[1] + 0.03, r[2] - 0.02, r[1] + 0.07, { rough: 0.9 });
  r = P['menu-card'];
  a.rect([0.94, 0.9, 0.78], r[0], r[1], r[2], r[3], { rough: 0.6 });
  a.rect([0.7, 0.16, 0.12], r[0] + 0.01, r[1] + 0.075, r[2] - 0.01, r[1] + 0.09);
  for (let i = 0; i < 4; i++) a.rect([0.3, 0.3, 0.3], r[0] + 0.02, r[1] + 0.012 + i * 0.015, r[2] - 0.02, r[1] + 0.018 + i * 0.015, { opacity: 0.7 });
  r = P.shelf;
  a.rect([0.3, 0.3, 0.31], r[0], r[1], r[2], r[3], { rough: 0.4 });
  for (let i = 0; i < 10; i++) a.rect(([[0.9, 0.75, 0.2], [0.85, 0.2, 0.12], [0.95, 0.94, 0.9], [0.5, 0.3, 0.15]] as RGB[])[(i * 3) % 4], r[0] + 0.01 + i * 0.049, r[1] + 0.012, r[0] + 0.05 + i * 0.049, r[1] + 0.07 + ((i * 5) % 3) * 0.008, { rough: 0.6 });
  return a.done(s, 0.03);
}, { density: 320 });

const CRATES: [string, string, number, string, number][] = [['yellow', 'ビール 黄', 0xe0b020, 'BEER', 0x1c1c1e], ['red', 'コーラ 赤', 0xc02018, 'COLA', 0xf8f4ec], ['green', '野菜 緑', 0x2c7c3c, 'FRESH', 0xf8f4ec], ['blue', '牛乳 青', 0x2450a8, 'MILK', 0xf8f4ec], ['grey', '灰', 0x6c7074, '', 0], ['black', 'パン 黒', 0x242426, 'BAKERY', 0xe8d8b0]];
for (const [id, label, c, word, ink] of CRATES)
  add(`crate-${id}`, `通い箱 ${label}`, [0.5, 0.3], (t, s) => {
    const a = new Art(t, hex(c), 0.55);
    a.rect(shade(hex(c), 0.8), 0, 0, 0.5, 0.03, { height: 0.004 });
    a.rect(shade(hex(c), 0.8), 0, 0.27, 0.5, 0.3, { height: 0.004 });
    for (let i = 0; i < 6; i++) a.rect(shade(hex(c), 0.35), 0.035 + i * 0.075, 0.05, 0.085 + i * 0.075, 0.12, { height: -0.006 });
    a.rect(shade(hex(c), 0.3), 0.17, 0.2, 0.33, 0.245, { height: -0.008 });
    if (word) a.text(hex(ink), word, 0.25, 0.14, 0.04, { weight: 0.15, fit: 0.4 });
    return a.done(s, 0.3);
  }, { density: 256 });
for (const [id, label, word] of [['plain', '無地', ''], ['fragile', 'FRAGILE', 'FRAGILE'], ['produce', '青果', 'PRODUCE'], ['tape', 'テープ', '']] as const)
  add(`carton-${id}`, `段ボール箱 ${label}`, [0.5, 0.4], (t, s) => {
    const a = new Art(t, [0.66, 0.5, 0.32], 0.85);
    a.rect([0.74, 0.62, 0.42], 0, 0.18, 0.5, 0.23, { rough: 0.5, opacity: id === 'plain' ? 0.5 : 0.9 });
    if (id === 'tape') a.rect([0.74, 0.62, 0.42], 0.22, 0, 0.28, 0.4, { rough: 0.5 });
    if (word) a.text(id === 'fragile' ? [0.7, 0.12, 0.1] : [0.16, 0.36, 0.16], word, 0.25, 0.28, 0.05, { weight: 0.14, fit: 0.42 });
    return a.done(s, 0.3);
  }, { density: 200 });
for (const [id, label, bg, fg, word] of [['welcome', '茶 WELCOME', 0x5c4630, 0x1c1c1e, 'WELCOME'], ['rubber', '黒ゴム', 0x1c1c1e, 0x2c2c2e, ''], ['red', '赤', 0x8c1c18, 0x5c1410, ''], ['green', '緑 人工芝', 0x2c6a34, 0x24542c, '']] as const)
  add(`mat-${id}`, `玄関マット ${label}`, [0.9, 0.6], (t, s) => {
    const a = new Art(t, hex(bg), 0.95);
    a.rect(hex(fg), 0.03, 0.03, 0.87, 0.06);
    a.rect(hex(fg), 0.03, 0.54, 0.87, 0.57);
    a.rect(hex(fg), 0.03, 0.03, 0.06, 0.57);
    a.rect(hex(fg), 0.84, 0.03, 0.87, 0.57);
    if (word) a.text(hex(fg), word, 0.45, 0.25, 0.1, { weight: 0.14, fit: 0.66 });
    return a.done(s, 0.45);
  }, { density: 128 });

// --- Shop fronts you can see through: a bay of glass over a kick plate, and the same with the door in it. ---
const FRONTS: [string, string, number][] = [...GLAZING, ['blue', '青', 0x2c4c8c]];
for (const [id, label, c] of FRONTS)
  for (const [kind, h] of [['', 3], ['-low', 2.4]] as const)
    for (const door of [false, true])
      add(`front-${id}${kind}${door ? '-door' : ''}`, `透ける店の正面 ${label}${kind ? '・低' : ''}${door ? '・扉' : ''}`, [2, h], (t, s) => {
        const a = new Art(t, [0.05, 0.075, 0.09], 0.05, 0.2);
        t.map((x, y, k) => {
          a.L.alpha[k] = 0.13 + 0.2 * sstep(h * 0.5, h, y) + 0.05 * sstep(0.35, 0, Math.abs(x - 1 - (y - h / 2) * 0.35));
          return 0;
        });
        a.rect([0.5, 0.62, 0.75], 0, h * 0.55, 2, h, { rough: 0.05, opacity: 0.3, soft: h * 0.3 });
        const f = hex(c);
        const bar = { alpha: true, rough: 0.4, height: 0.005 };
        const kick = kind ? 0.22 : 0.32;
        const plate = (x0: number, x1: number): void => {
          a.rect(shade(f, 0.8), x0, 0, x1, kick, { alpha: true, rough: 0.5 });
          a.rect(f, x0, kick - 0.045, x1, kick, bar);
        };
        if (door) {
          // The leaf in the middle with a light on each side, and a light over it.
          plate(0, 0.48);
          plate(1.52, 2);
          a.rect(f, 0.45, 0, 0.5, 2.24, bar);
          a.rect(f, 1.5, 0, 1.55, 2.24, bar);
          a.rect(f, 0.45, 2.19, 1.55, 2.25, bar);
          a.rect(f, 0.5, 0, 1.5, 0.26, bar);
          a.rect(f, 0.5, 2.1, 1.5, 2.19, bar);
          a.rect(f, 0.5, 0, 0.57, 2.19, bar);
          a.rect(f, 1.43, 0, 1.5, 2.19, bar);
          a.rect([0.75, 0.76, 0.78], 0.6, 1.02, 1.4, 1.07, { alpha: true, rough: 0.2, metal: 0.9, height: 0.01 });
          a.rect([0.92, 0.92, 0.9], 0.82, 1.42, 1.18, 1.56, { alpha: true, rough: 0.5 });
          a.text([0.75, 0.1, 0.08], 'OPEN', 1, 1.455, 0.075, { weight: 0.16, fit: 0.32 }, { alpha: true });
        } else {
          plate(0, 2);
          if (!kind) a.rect(f, 0, 2.3, 2, 2.35, bar);
        }
        a.rect(f, 0, h - 0.06, 2, h, bar);
        a.rect(f, 0, 0, 0.03, h, bar);
        a.rect(f, 1.97, 0, 2, h, bar);
        return a.done(s, 0.06);
      }, { tile: 'x', decal: true, density: 128, reflect: 0.8 });

// --- What a shop is fitted with. ---
// Plain walls and floors.
for (const [id, label, c, lo] of [['white', '白', 0xeceae4, 0xb8b6b0], ['cream', 'クリーム', 0xe8dcc0, 0x8c7c5c], ['grey', '灰', 0xc4c4c0, 0x4c4c50], ['blue', '淡い青', 0xc8d8e0, 0x4c6478], ['sage', '淡い緑', 0xcdd8c4, 0x5c6c54], ['dark', '濃い茶', 0x4c3c34, 0x2c2420], ['pink', '淡いピンク', 0xecd4d4, 0xa87c84], ['yellow', '淡い黄', 0xecdfa8, 0x9c8440]] as const)
  add(`wall-plain-${id}`, `店内の壁 無地 ${label}`, [1.2, 3], (t, s) => {
    const a = new Art(t, hex(c), 0.75);
    a.rect(hex(lo), 0, 0, 1.2, 0.1, { rough: 0.6, height: 0.008 });
    return a.done(s, 0.08);
  }, { tile: 'x', density: 64 });
for (const [id, label, c, rough] of [['carpet-grey', 'カーペット 灰', 0x6c6c70, 0.97], ['carpet-blue', 'カーペット 青', 0x34486c, 0.97], ['carpet-red', 'カーペット 赤', 0x7c2c2c, 0.97], ['carpet-green', 'カーペット 緑', 0x3c5c48, 0.97], ['concrete', '磨いたコンクリート', 0x9c9a94, 0.45], ['rubber', '黒いゴム', 0x242426, 0.85], ['lino-speckle', '斑のリノリウム', 0xc8c4b4, 0.5]] as const)
  add(`floor-${id}`, `店内の床 ${label}`, [1.2, 1.2], (t, s) => {
    const a = new Art(t, hex(c), rough);
    const n = t.noise(0.012, 0.012, s, 2);
    a.put(shade(hex(c), id.startsWith('carpet') ? 0.8 : 0.86), (m) => t.map((x, y, k) => ((m[k] = sstep(0.42, 0.6, n(x, y))), 0)), { opacity: 0.55 });
    if (id === 'concrete') for (const x of [0, 1.2]) a.rect(shade(hex(c), 0.7), x - 0.004, 0, x + 0.004, 1.2, { height: -0.003 });
    return a.done(s, 0);
  }, { tile: 'xy', density: 96 });

/** Goods on shelves, 2.4 m of them to tile along a wall: how many shelves high each kind is. */
export const GOODS_ROWS = {
  grocery: 6, cans: 6, snacks: 5, bottles: 5, pharmacy: 6, tools: 4, parts: 5, books: 6, records: 5, phones: 4, tobacco: 8, discount: 5, electronics: 4, jewel: 2, pastry: 3, cooler: 5, fold: 5, magazines: 5, tyres: 3, paint: 5,
} as const;
export type Goods = keyof typeof GOODS_ROWS;
const BRIGHT = [0xd82c20, 0xf0c020, 0x2060c0, 0x2c9c4c, 0xf07820, 0xf4f0e8, 0x8c2c9c, 0x20a0b0, 0xe85c8c, 0x1c1c20];
const MUTED = [0x7c2c24, 0x2c4c6c, 0x3c5c3c, 0x8c6c3c, 0x4c3c5c, 0x1c1c20, 0xc8b890, 0x6c2c3c, 0x2c5c5c, 0xb04c20];
const PALE = [0xf4f4f0, 0xd0e4f0, 0xc8e8d0, 0xf0f0c0, 0x4c8cc8, 0x2c9c7c, 0xe8c8d0, 0xf4f4f0];
const GLASSY = [0x5c3414, 0x1c4c24, 0xd8d8c8, 0x141414, 0x7c1c1c, 0xc89c2c, 0x2c5c2c, 0xe8e0c0];
for (const kind of Object.keys(GOODS_ROWS) as Goods[])
  add(`goods-${kind}`, `棚の商品 ${kind}`, [2.4, 2], (t, s) => {
    const rows = GOODS_ROWS[kind];
    const ph = 2 / rows;
    const back: RGB = kind === 'tools' ? [0.62, 0.5, 0.36] : kind === 'jewel' ? [0.1, 0.06, 0.14] : kind === 'cooler' ? [0.75, 0.8, 0.82] : kind === 'phones' ? [0.9, 0.9, 0.9] : kind === 'tyres' ? [0.3, 0.3, 0.32] : [0.34, 0.33, 0.32];
    const a = new Art(t, back, 0.7);
    const R = (i: number, j: number, q = 0): number => hash2(i * 7 + q, j * 13 + q * 3, s);
    const col = (pal: number[], i: number, j: number, q = 1): RGB => hex(pal[Math.floor(R(i, j, q) * pal.length) % pal.length]);
    if (kind === 'tools') for (let y = 0.04; y < 2; y += 0.05) for (let x = 0.025; x < 2.4; x += 0.05) a.disc([0.3, 0.24, 0.18], x, y, 0.006);
    for (let j = 0; j < rows; j++) {
      const y0 = j * ph;
      const [lo, hi] = [y0 + 0.035, y0 + ph - 0.03];
      const H = hi - lo;
      let i = 0;
      const run = (wMin: number, wMax: number, gap: number, draw: (x: number, w: number, h: number, i: number) => void, hMin = 0.6): void => {
        for (let x = 0.02; x < 2.38; i++) {
          const w = Math.min(2.38 - x, wMin + (wMax - wMin) * R(i, j, 2));
          if (w < wMin * 0.7) break;
          draw(x, w, H * (hMin + (1 - hMin) * R(i, j, 3)), i);
          x += w + gap;
        }
      };
      const label = (x: number, w: number, y: number, h: number, i: number): void => a.rect(R(i, j, 5) < 0.5 ? [0.95, 0.94, 0.9] : col(BRIGHT, i, j, 6), x + w * 0.12, y, x + w * 0.88, y + h, { rough: 0.6 });
      if (kind === 'grocery' || kind === 'discount' || kind === 'parts' || kind === 'pharmacy' || kind === 'snacks' || kind === 'paint')
        run(kind === 'pharmacy' ? 0.05 : 0.08, kind === 'pharmacy' ? 0.11 : kind === 'snacks' ? 0.2 : 0.17, 0.006, (x, w, h, i) => {
          const c = col(kind === 'pharmacy' ? PALE : kind === 'parts' ? MUTED : BRIGHT, i, j);
          a.rect(c, x, lo, x + w, lo + h, { rough: kind === 'snacks' ? 0.3 : 0.55, height: 0.004 });
          if (kind === 'paint') { a.rect([0.8, 0.8, 0.8], x, lo + h - 0.02, x + w, lo + h, { rough: 0.3, metal: 0.8 }); label(x, w, lo + h * 0.25, h * 0.4, i); }
          else if (kind === 'pharmacy') a.rect(R(i, j, 7) < 0.4 ? [0.8, 0.15, 0.12] : [0.15, 0.4, 0.7], x + w * 0.2, lo + h * 0.55, x + w * 0.8, lo + h * 0.75, { rough: 0.5 });
          else label(x, w, lo + h * 0.3, h * 0.35, i);
        }, kind === 'discount' ? 0.35 : 0.6);
      else if (kind === 'cans' || kind === 'tobacco')
        run(kind === 'tobacco' ? 0.05 : 0.065, kind === 'tobacco' ? 0.055 : 0.07, 0.004, (x, w, _h, i) => {
          const c = col(kind === 'tobacco' ? [0xf4f0e8, 0xb81c18, 0x1c4c2c, 0x1c2c6c, 0xc8a040, 0x1c1c1c, 0xf4f0e8] : BRIGHT, Math.floor(i / (2 + Math.floor(R(j, 1, 8) * 4))), j);
          const h = kind === 'tobacco' ? H * 0.8 : Math.min(H, 0.12);
          for (let y = lo; y + h <= hi + 1e-6; y += h + 0.003) {
            a.rect(c, x, y, x + w, y + h, { rough: 0.35, metal: kind === 'cans' ? 0.5 : 0, height: 0.004 });
            a.rect([0.95, 0.94, 0.9], x, y + h * 0.35, x + w, y + h * 0.6, { rough: 0.5, opacity: 0.8 });
          }
        });
      else if (kind === 'bottles' || kind === 'cooler')
        run(0.07, 0.09, 0.012, (x, w, h, i) => {
          const c = col(kind === 'cooler' ? [0x1c6c2c, 0xb81c18, 0x2060c0, 0xf0c020, 0xd8d8c8, 0x5c3414, 0xf07820] : GLASSY, Math.floor(i / (1 + Math.floor(R(j, 2, 8) * 3))), j);
          const body = h * 0.62;
          a.rect(c, x, lo, x + w, lo + body, { rough: 0.12, height: 0.006 });
          a.rect(c, x + w * 0.32, lo + body, x + w * 0.68, lo + h * 0.94, { rough: 0.12, height: 0.004 });
          a.rect(R(i, j, 9) < 0.5 ? [0.75, 0.6, 0.2] : [0.7, 0.1, 0.1], x + w * 0.3, lo + h * 0.94, x + w * 0.7, lo + h, { rough: 0.3, metal: 0.6 });
          label(x, w, lo + body * 0.25, body * 0.45, i);
        }, 0.75);
      else if (kind === 'books')
        run(0.022, 0.06, 0.002, (x, w, h, i) => {
          const c = col(MUTED, i, j);
          a.rect(c, x, lo, x + w, lo + h, { rough: 0.7, height: 0.003 });
          a.rect(R(i, j, 5) < 0.5 ? [0.85, 0.75, 0.4] : [0.9, 0.88, 0.8], x + w * 0.2, lo + h * 0.72, x + w * 0.8, lo + h * 0.8, { rough: 0.6 });
        }, 0.72);
      else if (kind === 'records' || kind === 'magazines')
        run(kind === 'records' ? Math.min(H, 0.31) : 0.2, kind === 'records' ? Math.min(H, 0.31) : 0.23, 0.02, (x, w, _h, i) => {
          const h = kind === 'records' ? w : H * 0.92;
          const c = col(BRIGHT, i, j);
          a.rect(c, x, lo, x + w, lo + h, { rough: 0.45, height: 0.003 });
          if (kind === 'records') { a.disc(col(MUTED, i, j, 4), x + w / 2, lo + h / 2, w * (0.2 + 0.2 * R(i, j, 7)), { rough: 0.4 }); a.rect(col(PALE, i, j, 9), x + w * 0.1, lo + h * 0.8, x + w * 0.9, lo + h * 0.9); }
          else { a.rect([0.95, 0.94, 0.9], x + w * 0.08, lo + h * 0.78, x + w * 0.92, lo + h * 0.93); a.rect(col(MUTED, i, j, 4), x + w * 0.15, lo + h * 0.12, x + w * 0.85, lo + h * 0.68); }
        });
      else if (kind === 'phones')
        run(0.14, 0.2, 0.05, (x, w, _h, i) => {
          if (j === 0 || R(i, j, 7) < 0.35) { a.rect(col(BRIGHT, i, j), x, lo + H * 0.1, x + w, lo + H * 0.9, { rough: 0.4, height: 0.003 }); a.rect([0.92, 0.92, 0.9], x + w * 0.2, lo + H * 0.2, x + w * 0.8, lo + H * 0.6, { rough: 0.2 }); }
          else { a.rect([0.06, 0.06, 0.07], x + w * 0.25, lo + H * 0.12, x + w * 0.75, lo + H * 0.88, { rough: 0.15, height: 0.004 }); a.rect(col([0x2c4c8c, 0x4c8cc8, 0x2c2c30, 0x8c4c9c], i, j), x + w * 0.29, lo + H * 0.18, x + w * 0.71, lo + H * 0.84, { rough: 0.08 }); }
        });
      else if (kind === 'tools')
        run(0.07, 0.16, 0.05, (x, w, h, i) => {
          const c = col([0xb81c18, 0xf0c020, 0x1c1c20, 0x2060c0, 0xf07820], i, j);
          if (R(i, j, 7) < 0.5) { a.rect([0.7, 0.71, 0.73], x + w * 0.35, lo + h * 0.4, x + w * 0.65, lo + h, { rough: 0.3, metal: 0.9, height: 0.004 }); a.rect(c, x + w * 0.25, lo + h * 0.05, x + w * 0.75, lo + h * 0.42, { rough: 0.6, height: 0.006 }); }
          else { a.rect([0.9, 0.9, 0.86], x, lo + h * 0.1, x + w, lo + h, { rough: 0.6 }); a.rect(c, x + w * 0.15, lo + h * 0.2, x + w * 0.85, lo + h * 0.7, { rough: 0.5, height: 0.004 }); }
        }, 0.7);
      else if (kind === 'electronics')
        run(0.3, 0.62, 0.06, (x, w, _h, i) => {
          const h = Math.min(H * 0.9, w * 0.62);
          a.rect([0.05, 0.05, 0.055], x, lo, x + w, lo + h, { rough: 0.3, height: 0.006 });
          if (R(i, j, 7) < 0.6) a.rect(col([0x2c3c5c, 0x3c5c4c, 0x1c1c24, 0x5c4c6c], i, j), x + 0.02, lo + 0.03, x + w - 0.02, lo + h - 0.02, { rough: 0.08 });
          else for (const k of [0.28, 0.72]) a.disc([0.16, 0.16, 0.17], x + w * k, lo + h / 2, Math.min(h, w / 2) * 0.36, { rough: 0.6, height: -0.004 });
        });
      else if (kind === 'jewel')
        run(0.12, 0.2, 0.06, (x, w, _h, i) => {
          a.rect([0.16, 0.1, 0.22], x, lo + H * 0.1, x + w, lo + H * 0.9, { rough: 0.9 });
          for (let q = 0; q < 6; q++) a.disc(R(i, j, 10 + q) < 0.5 ? [0.9, 0.75, 0.3] : [0.85, 0.86, 0.9], x + w * (0.2 + 0.3 * (q % 3)), lo + H * (0.3 + 0.4 * Math.floor(q / 3)), 0.012, { rough: 0.15, metal: 0.95, height: 0.004 });
        });
      else if (kind === 'pastry')
        run(0.42, 0.55, 0.03, (x, w, _h, i) => {
          a.rect([0.78, 0.78, 0.76], x, lo, x + w, lo + 0.03, { rough: 0.3, metal: 0.7 });
          const c = ([[0.72, 0.48, 0.22], [0.82, 0.62, 0.34], [0.5, 0.3, 0.16], [0.9, 0.7, 0.75]] as RGB[])[Math.floor(R(i, j, 4) * 4) % 4];
          for (let q = 0; q * 0.085 + 0.09 < w; q++) for (let k = 0; k < 2 && 0.05 + k * 0.08 < H - 0.04; k++) a.disc(c, x + 0.05 + q * 0.085, lo + 0.07 + k * 0.08, 0.036, { rough: 0.6, height: 0.008 });
        });
      else if (kind === 'fold')
        run(0.26, 0.34, 0.04, (x, w, h, i) => {
          for (let y = lo, q = 0; y + 0.04 < lo + h; y += 0.045, q++) a.rect(col(R(j, i, 8) < 0.5 ? MUTED : BRIGHT, i * 5 + q, j), x, y, x + w, y + 0.04, { rough: 0.9, height: 0.004 });
        }, 0.4);
      else if (kind === 'tyres')
        run(Math.min(H, 0.6), Math.min(H, 0.6), 0.03, (x, w) => {
          a.disc([0.04, 0.04, 0.045], x + w / 2, lo + w / 2, w / 2, { rough: 0.9, height: 0.01 });
          a.disc([0.02, 0.02, 0.02], x + w / 2, lo + w / 2, w * 0.3, { rough: 0.95, height: -0.01 });
        });
      // The shelf itself, and its price strip.
      if (kind !== 'tyres') {
        a.rect(kind === 'cooler' ? [0.8, 0.82, 0.84] : [0.82, 0.81, 0.78], 0, y0, 2.4, y0 + 0.03, { rough: 0.5, height: 0.008 });
        if (kind !== 'jewel' && kind !== 'books' && kind !== 'tools') for (let x = 0.06; x < 2.36; x += 0.19) a.rect(R(Math.round(x * 50), j, 11) < 0.25 ? [0.95, 0.8, 0.1] : [0.96, 0.96, 0.94], x, y0 + 0.004, x + 0.07, y0 + 0.026, { rough: 0.6 });
      }
    }
    if (kind === 'cooler') {
      // Glass doors in black frames, with the light on the goods.
      for (let x = 0; x < 2.4; x += 0.8) {
        a.rect([0.08, 0.08, 0.09], x - 0.025, 0, x + 0.025, 2, { rough: 0.4, height: 0.01 });
        a.rect([0.7, 0.72, 0.74], x + 0.05, 0.75, x + 0.075, 1.25, { rough: 0.2, metal: 0.9, height: 0.014 });
      }
      a.rect([0.08, 0.08, 0.09], 0, 1.94, 2.4, 2, { rough: 0.4, height: 0.01 });
      a.rect([0.6, 0.75, 0.9], 0, 0, 2.4, 2, { opacity: 0.12, rough: 0.05 });
    }
    return a.done(s, 0.04);
  }, { tile: 'x', density: 160, ...(kind === 'cooler' ? { emissive: 0.25 } : {}) });

// Clothes on a rail and flowers in their buckets: cut out, to hang and stand free.
add('goods-clothes', '棚の商品 吊るした服', [2.4, 1.2], (t, s) => {
  const a = new Art(t, [0.3, 0.3, 0.3], 0.9, 0);
  for (let i = 0, x = 0.03; x < 2.3; i++) {
    const w = 0.07 + 0.05 * hash2(i, 3, s);
    const h = 0.55 + 0.5 * hash2(i, 4, s);
    const c = hex([...MUTED, ...BRIGHT][Math.floor(hash2(i, 5, s) * 20) % 20]);
    a.rect(c, x, 1.1 - h, x + w, 1.1, { alpha: true, rough: 0.9 });
    a.rect(shade(c, 0.7), x + w - 0.012, 1.1 - h, x + w, 1.1, { alpha: true, rough: 0.9 });
    a.rect([0.7, 0.7, 0.72], x + w * 0.4, 1.1, x + w * 0.6, 1.17, { alpha: true, rough: 0.3, metal: 0.8 });
    x += w + 0.012;
  }
  a.rect([0.75, 0.76, 0.78], 0, 1.16, 2.4, 1.19, { alpha: true, rough: 0.2, metal: 0.9 });
  return a.done(s, 0.03);
}, { tile: 'x', density: 128, cutout: true });
add('goods-flowers', '棚の商品 切り花', [2.4, 0.9], (t, s) => {
  const a = new Art(t, [0.2, 0.4, 0.2], 0.8, 0);
  const FL = [0xe83c5c, 0xf4d020, 0xf4f0e8, 0x9c4cc8, 0xf07828, 0xe880a8, 0xc81c2c];
  for (let i = 0; i < 8; i++) {
    const x = 0.15 + i * 0.3;
    const pot: RGB = i % 3 === 0 ? [0.7, 0.72, 0.74] : i % 3 === 1 ? [0.12, 0.3, 0.2] : [0.15, 0.15, 0.16];
    a.rect(pot, x - 0.1, 0, x + 0.1, 0.32, { alpha: true, rough: 0.5, metal: i % 3 === 0 ? 0.7 : 0 });
    for (let q = 0; q < 16; q++) a.disc([0.16, 0.42, 0.18], x + (hash2(i, q, s) - 0.5) * 0.24, 0.36 + hash2(q, i, s) * 0.34, 0.05, { alpha: true, rough: 0.8 });
    const c = hex(FL[Math.floor(hash2(i, 99, s) * FL.length) % FL.length]);
    for (let q = 0; q < 11; q++) a.disc(q % 4 === 3 ? shade(c, 0.75) : c, x + (hash2(i, q + 20, s) - 0.5) * 0.26, 0.52 + hash2(q + 20, i, s) * 0.3, 0.035, { alpha: true, rough: 0.6, height: 0.004 });
  }
  return a.done(s, 0.02);
}, { tile: 'x', density: 160, cutout: true });

// Machines and fittings seen from the front.
add('washer', '洗濯機の正面', [0.7, 0.9], (t, s) => {
  const a = new Art(t, [0.9, 0.9, 0.88], 0.35);
  a.rect([0.6, 0.6, 0.6], 0, 0, 0.012, 0.9);
  a.rect([0.6, 0.6, 0.6], 0.688, 0, 0.7, 0.9);
  a.rect([0.78, 0.78, 0.78], 0.03, 0.72, 0.67, 0.87, { rough: 0.3, height: 0.004 });
  a.rect([0.1, 0.12, 0.14], 0.06, 0.76, 0.3, 0.84, { rough: 0.1 });
  for (let i = 0; i < 4; i++) a.disc([0.2, 0.2, 0.22], 0.4 + i * 0.07, 0.8, 0.02, { height: 0.004 });
  a.disc([0.75, 0.76, 0.78], 0.35, 0.38, 0.25, { rough: 0.2, metal: 0.9, height: 0.008 });
  a.disc([0.08, 0.1, 0.13], 0.35, 0.38, 0.19, { rough: 0.06 });
  a.disc([0.3, 0.4, 0.5], 0.3, 0.44, 0.07, { rough: 0.06, opacity: 0.4 });
  return a.done(s, 0.06);
}, { tile: 'x', density: 160 });
add('dryer', '重ねた乾燥機の正面', [0.8, 1.9], (t, s) => {
  const a = new Art(t, [0.8, 0.8, 0.8], 0.3, 1);
  for (const y of [0.08, 1.0]) {
    a.rect([0.6, 0.6, 0.62], 0.02, y, 0.78, y + 0.86, { rough: 0.3, metal: 0.7, height: 0.004 });
    a.disc([0.85, 0.85, 0.86], 0.4, y + 0.42, 0.33, { rough: 0.2, metal: 0.9, height: 0.008 });
    a.disc([0.07, 0.08, 0.1], 0.4, y + 0.42, 0.27, { rough: 0.06 });
    a.rect([0.1, 0.12, 0.14], 0.55, y + 0.76, 0.75, y + 0.83, { rough: 0.1 });
  }
  return a.done(s, 0.06);
}, { tile: 'x', density: 128 });
add('mirror', '壁の鏡', [0.8, 1.2], (t, s) => {
  const a = new Art(t, [0.62, 0.68, 0.72], 0.04);
  a.rect([0.8, 0.86, 0.9], 0, 0.6, 0.8, 1.2, { opacity: 0.5, soft: 0.4, rough: 0.04 });
  for (const [x0, y0, x1, y1] of [[0, 0, 0.8, 0.025], [0, 1.175, 0.8, 1.2], [0, 0, 0.025, 1.2], [0.775, 0, 0.8, 1.2]]) a.rect([0.2, 0.2, 0.21], x0, y0, x1, y1, { rough: 0.4, height: 0.006 });
  return a.done(s, 0.02);
}, { tile: 'x', density: 64, reflect: 1 });
add('atm', '現金自動預払機の正面', [0.6, 1.7], (t, s) => {
  const a = new Art(t, [0.7, 0.71, 0.73], 0.4);
  a.rect([0.12, 0.3, 0.6], 0, 1.25, 0.6, 1.7, { rough: 0.4 });
  a.text([0.95, 0.95, 0.95], 'ATM', 0.3, 1.5, 0.16, { weight: 0.18, fit: 0.45 });
  a.rect([0.05, 0.05, 0.06], 0.1, 0.85, 0.5, 1.18, { rough: 0.2, height: -0.006 });
  a.rect([0.2, 0.45, 0.75], 0.12, 0.87, 0.48, 1.16, { rough: 0.08 });
  a.rect([0.3, 0.3, 0.32], 0.14, 0.55, 0.4, 0.78, { rough: 0.5, height: -0.004 });
  for (let i = 0; i < 12; i++) a.rect([0.8, 0.8, 0.8], 0.16 + (i % 3) * 0.075, 0.57 + Math.floor(i / 3) * 0.05, 0.22 + (i % 3) * 0.075, 0.61 + Math.floor(i / 3) * 0.05, { height: 0.003 });
  a.rect([0.03, 0.03, 0.03], 0.42, 0.68, 0.54, 0.7);
  a.rect([0.03, 0.03, 0.03], 0.12, 0.42, 0.48, 0.45);
  return a.done(s, 0.05);
}, { density: 200 });
add('tv', '点いたテレビ', [1, 0.6], (t, s) => {
  const a = new Art(t, [0.03, 0.03, 0.035], 0.3);
  a.rect([0.16, 0.5, 0.22], 0.03, 0.03, 0.97, 0.57, { rough: 0.1 });
  a.rect([0.85, 0.9, 0.85], 0.495, 0.03, 0.505, 0.57);
  a.disc([0.85, 0.9, 0.85], 0.5, 0.3, 0.09, { opacity: 0.5 });
  a.disc([0.16, 0.5, 0.22], 0.5, 0.3, 0.08);
  a.rect([0.1, 0.12, 0.3], 0.03, 0.03, 0.97, 0.1, { rough: 0.1 });
  a.text([0.95, 0.95, 0.95], 'LIVE  2 - 1', 0.5, 0.045, 0.045, { weight: 0.14, fit: 0.7 });
  return a.done(s, 0);
}, { density: 128, emissive: 0.7 });
add('toolchest', '工具箱の正面', [0.9, 1], (t, s) => {
  const a = new Art(t, [0.7, 0.1, 0.08], 0.35);
  for (let i = 0; i < 7; i++) {
    const y = 0.06 + i * 0.132;
    a.rect([0.6, 0.08, 0.06], 0.03, y, 0.87, y + 0.118, { rough: 0.35, height: 0.004 });
    a.rect([0.78, 0.78, 0.8], 0.1, y + 0.085, 0.8, y + 0.105, { rough: 0.2, metal: 0.9, height: 0.008 });
  }
  return a.done(s, 0.12);
}, { density: 128 });
const NOTICES: [string, string, number, number, string[], 'scissors' | 'tooth' | 'weight' | 'star' | 'phone' | 'none'][] = [
  ['hair', '散髪', 0xf0ece0, 0x243c8c, ['CUT 15', 'SHAVE 10'], 'scissors'], ['smile', '歯科', 0x2c9c9c, 0xf8f8f4, ['SMILE', 'CHECK UP'], 'tooth'], ['fit', 'ジム', 0x1c1c1e, 0xf0c020, ['NO PAIN', 'NO GAIN'], 'weight'],
  ['flash', 'タトゥーの図案', 0xe8dcc0, 0x1c1c1e, ['FLASH'], 'star'], ['rates', '手数料', 0xf8f4ec, 0x1c6c3c, ['CASH NOW', 'LOW FEES', '1.5%'], 'none'], ['sale', '特売', 0xd82c20, 0xf8f0d0, ['SALE', '50% OFF'], 'none'],
  ['phone', '新機種', 0x1c2c5c, 0xf4f4f4, ['NEW', 'UNLIMITED'], 'phone'], ['bail', '保釈', 0xf0c820, 0x1c1c1e, ['BAIL', '24 HOURS'], 'none'],
];
for (const [id, label, bg, fg, lines, pic] of NOTICES)
  add(`notice-${id}`, `店内の貼り紙 ${label}`, [0.6, 0.9], (t, s) => {
    const a = new Art(t, hex(bg), 0.5);
    const f = hex(fg);
    for (const [x0, y0, x1, y1] of [[0, 0, 0.6, 0.012], [0, 0.888, 0.6, 0.9], [0, 0, 0.012, 0.9], [0.588, 0, 0.6, 0.9]]) a.rect(f, x0, y0, x1, y1);
    const top = pic === 'none' ? 0.72 : 0.36;
    lines.forEach((l, i) => a.text(f, l, 0.3, top - i * (pic === 'none' ? 0.22 : 0.13), pic === 'none' ? 0.15 : 0.085, { weight: 0.15, fit: 0.5 }));
    if (pic === 'scissors') { a.line(f, [[0.18, 0.5], [0.44, 0.78]], 0.012); a.line(f, [[0.42, 0.5], [0.16, 0.78]], 0.012); a.disc(f, 0.16, 0.47, 0.04); a.disc(f, 0.44, 0.47, 0.04); a.disc(hex(bg), 0.16, 0.47, 0.022); a.disc(hex(bg), 0.44, 0.47, 0.022); }
    if (pic === 'tooth') { a.disc(f, 0.24, 0.68, 0.085); a.disc(f, 0.36, 0.68, 0.085); a.rect(f, 0.17, 0.52, 0.27, 0.68); a.rect(f, 0.33, 0.52, 0.43, 0.68); }
    if (pic === 'weight') { a.rect(f, 0.14, 0.62, 0.46, 0.65); for (const x of [0.13, 0.19, 0.41, 0.47]) a.rect(f, x - 0.02, 0.63 - (x < 0.16 || x > 0.44 ? 0.07 : 0.1), x + 0.02, 0.64 + (x < 0.16 || x > 0.44 ? 0.07 : 0.1)); }
    if (pic === 'star') for (let i = 0; i < 9; i++) { const [x, y] = [0.13 + (i % 3) * 0.17, 0.46 + Math.floor(i / 3) * 0.14]; if (i % 3 === 0) a.disc(f, x, y, 0.04); else if (i % 3 === 1) { a.line(f, [[x - 0.05, y], [x + 0.05, y]], 0.008); a.line(f, [[x, y - 0.05], [x, y + 0.05]], 0.008); } else { a.disc(hex(0xb81c18), x - 0.02, y + 0.012, 0.026); a.disc(hex(0xb81c18), x + 0.02, y + 0.012, 0.026); a.line(hex(0xb81c18), [[x - 0.035, y], [x, y - 0.045], [x + 0.035, y]], 0.012); } }
    if (pic === 'phone') { a.rect([0.05, 0.05, 0.06], 0.2, 0.44, 0.4, 0.82); a.rect([0.3, 0.6, 0.9], 0.215, 0.47, 0.385, 0.8, { rough: 0.1 }); }
    return a.done(s, 0.05);
  }, { density: 200 });
// A roll-up door standing open: the last slats of the curtain under the lintel, and nothing below them.
add('open', '開いた戸口', [1, 1], (t, s) => {
  const a = new Art(t, [0.1, 0.1, 0.1], 0.6, 0);
  a.rect([0.62, 0.63, 0.64], 0, 0.9, 1, 1, { alpha: true, rough: 0.45 });
  for (const y of [0.9, 0.933, 0.966]) a.rect([0.4, 0.41, 0.42], 0, y, 1, y + 0.008, { alpha: true, rough: 0.5 });
  return a.done(s, 0);
}, { tile: 'none', decal: true, density: 64 });

export const PROP_TEXTURES: readonly TextureSpec[] = list;
