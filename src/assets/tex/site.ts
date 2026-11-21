import { Layers, RGB, TextureData, TextureSpec, Tex, clamp01, hash2, hex, lerp, sstep } from './core';
import { Art } from './furniture';
import * as S from './surfaces';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'emissive' | 'decal' | 'cutout' | 'reflect'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 52000 + list.length * 7;
  list.push({ id: `site/${id}`, label, category: 'site', meters, tile: 'none', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}
const tiled: Extra = { tile: 'xy', density: 128 };
const cutX: Extra = { cutout: true, tile: 'x', density: 256 };

const WHITE: RGB = hex(0xe8e6de);
const BLACK: RGB = hex(0x161616);
const RUST: RGB = [0.36, 0.18, 0.08];
const ALGAE: RGB = [0.16, 0.24, 0.1];
const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// --- Timber fences. Boards run up the texture; `age` greys the wood and peels the paint. ---
interface BoardOpts { board: number; age: number; paint?: RGB; top?: 'flat' | 'dogear' | 'point' | 'round'; open?: number; rails?: number[]; lean?: number }
function boards(tex: Tex, seed: number, color: RGB, o: BoardOpts): TextureData {
  const cut = (o.top ?? 'flat') !== 'flat' || !!o.open;
  const L = new Layers(tex, color, 0.85, cut ? 0 : 1);
  const grain = tex.noise(0.006, 0.5, seed, 3);
  const wide = tex.noise(0.3, 0.6, seed + 1, 3);
  const peel = tex.noise(0.03, 0.12, seed + 2, 3);
  const n = Math.max(1, Math.round(tex.mw / o.board));
  const w = tex.mw / n;
  const H = tex.mh;
  const fill = 1 - (o.open ?? 0);
  tex.map((x, y, k) => {
    const i = Math.floor(x / w);
    const fx = x / w - i;
    const id = hash2(i, 3, seed);
    const drop = (hash2(i, 5, seed) - 0.5) * (o.lean ?? 0.02);
    const off = Math.abs(fx - 0.5) * w;
    const half = (w * fill) / 2;
    const d = half - off;
    const top = H - 0.01 + drop - (o.top === 'point' ? off * 1.1 : o.top === 'dogear' ? Math.max(0, off - half + 0.035) : o.top === 'round' ? half - Math.sqrt(Math.max(0, half * half - off * off)) : 0);
    const rail = (o.rails ?? []).some((ry) => Math.abs(y - ry) < 0.045);
    const on = (d > 0 && y < top) || (rail && !!o.open);
    const gr = grain(x + id * 7, y) * 0.6 + wide(x, y + id * 3) * 0.4;
    const grey = clamp01(o.age * (0.6 + wide(x + 5, y) * 0.8));
    const g0 = (color[0] + color[1] + color[2]) / 3;
    let c: RGB = [lerp(color[0], g0 * 1.02, grey), lerp(color[1], g0 * 1.02, grey), lerp(color[2], g0 * 1.06, grey)];
    let rough = 0.88;
    if (o.paint && peel(x + id * 3, y) * 0.5 + 0.5 > o.age * o.age * (0.75 + sstep(0.5, 0, y) * 0.5 + (1 - sstep(0.0015, 0.02, Math.max(0, d))) * 0.4)) {
      c = o.paint;
      rough = 0.6;
    }
    const edge = d > 0 ? 1 - sstep(0.0015, 0.006, d) : 0;
    const splash = sstep(0.35, 0, y) * (0.25 + o.age * 0.3);
    const m = (1 + (id - 0.5) * 0.25 + gr * (o.paint ? 0.12 : 0.28)) * (1 - edge * 0.6) * (1 - splash) * (rail && !(d > 0 && y < top) ? 0.8 : 1);
    L.r[k] = c[0] * m;
    L.g[k] = c[1] * m;
    L.b[k] = c[2] * m;
    L.rough[k] = rough;
    L.height[k] = gr * 0.0012 - edge * 0.008;
    if (cut) L.alpha[k] = on ? 1 : 0;
    return 0;
  });
  return L.finish();
}
const CEDAR: RGB = hex(0x8a5a36);
const REDWOOD: RGB = hex(0x7a3c28);
const PINE: RGB = hex(0xb08a58);
const DARKWOOD: RGB = hex(0x4a3424);
add('fence-board-cedar', '板塀 シダー 角落とし', [1.8, 1.8], (t, s) => boards(t, s, CEDAR, { board: 0.15, age: 0.15, top: 'dogear' }), cutX);
add('fence-board-weathered', '板塀 風化して灰色', [1.8, 1.8], (t, s) => boards(t, s, CEDAR, { board: 0.15, age: 0.9, top: 'dogear', lean: 0.05 }), cutX);
add('fence-board-redwood', '板塀 レッドウッド 平ら', [1.8, 1.8], (t, s) => boards(t, s, REDWOOD, { board: 0.14, age: 0.3 }), { tile: 'x' });
add('fence-board-brown', '板塀 茶塗装', [1.8, 1.8], (t, s) => boards(t, s, PINE, { board: 0.15, age: 0.35, paint: hex(0x5a3c28), top: 'dogear' }), cutX);
add('fence-board-white', '板塀 白塗装 はがれ', [1.8, 1.8], (t, s) => boards(t, s, PINE, { board: 0.15, age: 0.6, paint: WHITE }), { tile: 'x' });
add('fence-board-green', '板塀 緑塗装', [1.8, 1.8], (t, s) => boards(t, s, PINE, { board: 0.15, age: 0.4, paint: hex(0x2c4a38), top: 'point' }), cutX);
add('fence-board-low', '低い板塀 1.2m', [1.8, 1.2], (t, s) => boards(t, s, CEDAR, { board: 0.14, age: 0.5, top: 'round' }), cutX);
add('fence-picket-white', 'ピケットフェンス 白', [1.2, 1.0], (t, s) => boards(t, s, PINE, { board: 0.12, age: 0.1, paint: WHITE, top: 'point', open: 0.42, rails: [0.22, 0.72] }), cutX);
add('fence-picket-peeling', 'ピケットフェンス 白 はがれ', [1.2, 1.0], (t, s) => boards(t, s, PINE, { board: 0.12, age: 0.75, paint: WHITE, top: 'point', open: 0.42, rails: [0.22, 0.72], lean: 0.06 }), cutX);
add('fence-picket-natural', 'ピケットフェンス 木地', [1.2, 1.0], (t, s) => boards(t, s, CEDAR, { board: 0.12, age: 0.4, top: 'round', open: 0.4, rails: [0.22, 0.72] }), cutX);
add('fence-picket-grey', 'ピケットフェンス 風化', [1.2, 1.0], (t, s) => boards(t, s, CEDAR, { board: 0.11, age: 1, top: 'dogear', open: 0.45, rails: [0.2, 0.7], lean: 0.08 }), cutX);
add('fence-vinyl-white', '樹脂フェンス 白', [1.8, 1.8], (t, s) => boards(t, s, WHITE, { board: 0.18, age: 0.05, paint: hex(0xeeeeea) }), { tile: 'x' });
add('fence-vinyl-tan', '樹脂フェンス ベージュ', [1.8, 1.8], (t, s) => boards(t, s, hex(0xc8b89a), { board: 0.18, age: 0.05, paint: hex(0xc8b89a) }), { tile: 'x' });
add('hoarding-plywood', '工事仮囲い 合板', [2.44, 2.44], (t, s) => boards(t, s, hex(0xb89a68), { board: 1.22, age: 0.3 }), { tile: 'x', density: 128 });
add('hoarding-blue', '工事仮囲い 青塗装', [2.44, 2.44], (t, s) => boards(t, s, PINE, { board: 1.22, age: 0.45, paint: hex(0x1c4a8c) }), { tile: 'x', density: 128 });
add('hoarding-green', '工事仮囲い 緑塗装', [2.44, 2.44], (t, s) => boards(t, s, PINE, { board: 1.22, age: 0.5, paint: hex(0x1c5a3c) }), { tile: 'x', density: 128 });
add('timber-crib', '枕木の土留め', [2.4, 1.0], (t, s) => S.masonry(t, { seed: s, block: [2.4, 0.25], colors: [hex(0x4a3828), hex(0x3c2e22), hex(0x54402c)], mortar: [0.08, 0.07, 0.06], rough: true, streaks: 0.5 }), tiled);
add('timber-log', '丸太の土留め', [1.2, 1.2], (t, s) => boards(t, s, DARKWOOD, { board: 0.2, age: 0.5 }), { tile: 'x', density: 128 });

// --- Metal fences and wire: cut out. ---
type Iron = 'spear' | 'flat' | 'hoop' | 'ranch' | 'weld' | 'razor' | 'barbed' | 'net' | 'bars';
function ironwork(tex: Tex, seed: number, c: RGB, kind: Iron, rust = 0): TextureData {
  const L = new Layers(tex, c, kind === 'ranch' || kind === 'net' ? 0.85 : 0.5, 0);
  const m = tex.field();
  const [w, h] = [tex.mw, tex.mh];
  if (kind === 'spear' || kind === 'flat' || kind === 'hoop') {
    const topRail = kind === 'flat' ? h - 0.04 : h - 0.26;
    tex.rect(m, 0, topRail - 0.015, w, topRail + 0.015);
    tex.rect(m, 0, 0.11, w, 0.14);
    const n = Math.round(w / 0.12);
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * w) / n;
      tex.rect(m, x - 0.008, 0.03, x + 0.008, kind === 'spear' ? h - 0.09 : kind === 'hoop' ? h - 0.09 : topRail);
      if (kind === 'spear') tex.poly(m, [[[x - 0.026, h - 0.1], [x + 0.026, h - 0.1], [x, h - 0.005]]]);
      if (kind === 'hoop' && i % 2 === 0) tex.ring(m, x + w / n / 2, h - 0.09, w / n / 2, 0.008);
    }
    if (kind === 'hoop') tex.rect(m, 0, h - 0.09, w, h, 0);
    if (kind === 'hoop') for (let i = 0; i < n; i += 2) tex.stroke(m, Array.from({ length: 9 }, (_, j) => [((i + 0.5) * w) / n + (w / n / 2) * (1 - Math.cos((j * Math.PI) / 8)), h - 0.09 + (w / n / 2) * Math.sin((j * Math.PI) / 8)] as [number, number]), 0.008);
  } else if (kind === 'bars') {
    tex.rect(m, 0, h - 0.05, w, h);
    tex.rect(m, 0, 0.05, w, 0.09);
    const n = Math.round(w / 0.1);
    for (let i = 0; i < n; i++) tex.rect(m, ((i + 0.5) * w) / n - 0.012, 0.05, ((i + 0.5) * w) / n + 0.012, h - 0.02);
  } else if (kind === 'ranch') {
    for (const y of [0.3, 0.65, 1.0]) tex.rect(m, 0, y - 0.065, w, y + 0.065);
    tex.rect(m, w / 2 - 0.065, 0, w / 2 + 0.065, h);
  } else if (kind === 'weld') {
    for (let x = 0.025; x < w; x += 0.05) tex.rect(m, x - 0.0022, 0, x + 0.0022, h);
    for (let y = 0.1; y < h; y += 0.2) tex.rect(m, 0, y - 0.0028, w, y + 0.0028);
  } else if (kind === 'razor') {
    for (let x = 0; x < w; x += 0.125) tex.ring(m, x, h / 2, h / 2 - 0.02, 0.004);
    for (let x = 0.03; x < w; x += 0.0625) for (const y of [0.06, h - 0.06]) tex.stroke(m, [[x - 0.012, y - 0.012], [x + 0.012, y + 0.012]], 0.004);
  } else if (kind === 'barbed') {
    for (const y of [0.05, 0.15, 0.25]) {
      tex.rect(m, 0, y - 0.003, w, y + 0.003);
      for (let x = 0.05; x < w; x += 0.1) {
        tex.stroke(m, [[x - 0.012, y - 0.012], [x + 0.012, y + 0.012]], 0.0025);
        tex.stroke(m, [[x - 0.012, y + 0.012], [x + 0.012, y - 0.012]], 0.0025);
      }
    }
  } else {
    for (let i = -6; i < 12; i++) {
      tex.stroke(m, [[i * 0.075, 0], [i * 0.075 + h, h]], 0.003);
      tex.stroke(m, [[i * 0.075, 0], [i * 0.075 - h, h]], 0.003);
    }
  }
  const rn = tex.noise(0.06, 0.12, seed, 3);
  L.paint(m, (k) => mixc(c, RUST, clamp01(rust * (0.5 + rn((k % tex.w) * tex.px, Math.floor(k / tex.w) * tex.py) * 1.2))), { alpha: true, height: 0.004, metal: kind === 'ranch' || kind === 'net' ? 0 : 0.6 });
  return L.finish();
}
const IRON: RGB = [0.06, 0.06, 0.065];
const ZINC: RGB = [0.6, 0.62, 0.63];
add('fence-iron-spear', '鉄柵 槍先', [1.2, 1.5], (t, s) => ironwork(t, s, IRON, 'spear'), cutX);
add('fence-iron-spear-rusty', '鉄柵 槍先 さび', [1.2, 1.5], (t, s) => ironwork(t, s, IRON, 'spear', 0.7), cutX);
add('fence-iron-flat', '鉄柵 平頭', [1.2, 1.2], (t, s) => ironwork(t, s, IRON, 'flat'), cutX);
add('fence-iron-hoop', '鉄柵 アーチ頭', [1.2, 1.1], (t, s) => ironwork(t, s, IRON, 'hoop'), cutX);
add('fence-iron-green', '鉄柵 緑 槍先', [1.2, 1.5], (t, s) => ironwork(t, s, [0.1, 0.22, 0.16], 'spear', 0.15), cutX);
add('fence-iron-white', '鉄柵 白 平頭', [1.2, 1.2], (t, s) => ironwork(t, s, [0.85, 0.85, 0.82], 'flat', 0.2), cutX);
add('fence-bars-galvanized', '太い縦格子 亜鉛めっき', [1.0, 2.4], (t, s) => ironwork(t, s, ZINC, 'bars', 0.1), cutX);
add('fence-bars-black', '太い縦格子 黒', [1.0, 2.4], (t, s) => ironwork(t, s, IRON, 'bars'), cutX);
add('fence-ranch-white', '牧場柵 白 3段', [2.4, 1.2], (t, s) => ironwork(t, s, [0.86, 0.85, 0.8], 'ranch'), cutX);
add('fence-ranch-brown', '牧場柵 茶 3段', [2.4, 1.2], (t, s) => ironwork(t, s, [0.3, 0.2, 0.13], 'ranch'), cutX);
add('mesh-weld-green', '溶接金網 緑', [0.3, 0.4], (t, s) => ironwork(t, s, [0.12, 0.3, 0.2], 'weld'), { cutout: true, tile: 'xy', density: 512 });
add('mesh-weld-black', '溶接金網 黒', [0.3, 0.4], (t, s) => ironwork(t, s, IRON, 'weld'), { cutout: true, tile: 'xy', density: 512 });
add('mesh-weld-galvanized', '溶接金網 亜鉛めっき', [0.3, 0.4], (t, s) => ironwork(t, s, ZINC, 'weld', 0.15), { cutout: true, tile: 'xy', density: 512 });
add('wire-razor', '有刺鉄線 らせん', [1, 0.45], (t, s) => ironwork(t, s, ZINC, 'razor'), { ...cutX, density: 384 });
add('wire-barbed', '有刺鉄線 3条', [1, 0.3], (t, s) => ironwork(t, s, [0.45, 0.42, 0.4], 'barbed', 0.5), { ...cutX, density: 384 });
add('net-white', 'ネット 白(ゴール・コート)', [0.3, 0.3], (t, s) => ironwork(t, s, [0.9, 0.9, 0.88], 'net'), { cutout: true, tile: 'xy', density: 512 });
add('net-green', 'ネット 緑(防球)', [0.3, 0.3], (t, s) => ironwork(t, s, [0.1, 0.3, 0.16], 'net'), { cutout: true, tile: 'xy', density: 512 });
add('net-fishing', '漁網', [0.3, 0.3], (t, s) => ironwork(t, s, [0.2, 0.42, 0.4], 'net'), { cutout: true, tile: 'xy', density: 512 });

// --- Fabric: fence screens, tarpaulins, sails. ---
function fabric(tex: Tex, seed: number, c: RGB, o: { fade?: number; weave?: number; stripes?: RGB; dirt?: number } = {}): TextureData {
  const L = new Layers(tex, c, 0.8);
  const fold = tex.noise(0.25, 0.6, seed, 3);
  const fade = tex.noise(0.6, 0.6, seed + 1, 2);
  const dirt = tex.noise(0.2, 0.2, seed + 2, 3);
  const wv = o.weave ?? 0.004;
  tex.map((x, y, k) => {
    const weave = hash2(Math.floor(x / wv), Math.floor(y / wv), seed) * 0.07;
    let col = c;
    if (o.stripes && Math.floor(x / 0.25) % 2) col = o.stripes;
    const f = clamp01((o.fade ?? 0.2) * (0.6 + fade(x, y)));
    const g = (col[0] + col[1] + col[2]) / 3;
    const m = (1 + fold(x, y) * 0.22 - weave) * (1 - clamp01((o.dirt ?? 0.2) * sstep(0, 0.6, dirt(x, y))) * 0.6);
    L.r[k] = lerp(col[0], g * 1.15 + 0.08, f) * m;
    L.g[k] = lerp(col[1], g * 1.15 + 0.08, f) * m;
    L.b[k] = lerp(col[2], g * 1.15 + 0.08, f) * m;
    L.height[k] = fold(x, y) * 0.004;
    return 0;
  });
  return L.finish();
}
add('screen-green', 'フェンスの目隠しシート 緑', [1, 1], (t, s) => fabric(t, s, hex(0x1c4a30), { fade: 0.35 }), tiled);
add('screen-black', 'フェンスの目隠しシート 黒', [1, 1], (t, s) => fabric(t, s, hex(0x1a1a1a), { fade: 0.4 }), tiled);
add('screen-tan', 'フェンスの目隠しシート 砂色', [1, 1], (t, s) => fabric(t, s, hex(0xb8a078), { fade: 0.3, dirt: 0.4 }), tiled);
add('screen-blue', 'フェンスの目隠しシート 青', [1, 1], (t, s) => fabric(t, s, hex(0x1c3c7c), { fade: 0.45 }), tiled);
add('tarp-blue', '防水シート 青', [1, 1], (t, s) => fabric(t, s, hex(0x1c50b0), { fade: 0.3, weave: 0.006 }), tiled);
add('tarp-grey', '防水シート 灰', [1, 1], (t, s) => fabric(t, s, hex(0x8a8c8c), { fade: 0.2, weave: 0.006, dirt: 0.5 }), tiled);
add('canvas-white', '帆布 白', [1, 1], (t, s) => fabric(t, s, hex(0xe6e2d6), { fade: 0.1, dirt: 0.25 }), tiled);
add('canvas-red', '帆布 赤', [1, 1], (t, s) => fabric(t, s, hex(0xb02c24), { fade: 0.3 }), tiled);
add('canvas-stripe-blue', '帆布 青白の縞', [1, 1], (t, s) => fabric(t, s, hex(0x1c4a9c), { fade: 0.25, stripes: hex(0xe8e6de) }), tiled);
add('canvas-stripe-yellow', '帆布 黄白の縞', [1, 1], (t, s) => fabric(t, s, hex(0xe8b81c), { fade: 0.3, stripes: hex(0xe8e6de) }), tiled);
add('canvas-stripe-red', '帆布 赤白の縞', [1, 1], (t, s) => fabric(t, s, hex(0xc02c24), { fade: 0.3, stripes: hex(0xe8e6de) }), tiled);
/** Chain link with plastic privacy slats woven through. */
function slats(tex: Tex, seed: number, c: RGB): TextureData {
  const L = new Layers(tex, c, 0.6);
  const fade = tex.noise(0.4, 0.4, seed, 2);
  tex.map((x, y, k) => {
    const i = Math.floor(x / 0.05);
    const fx = x / 0.05 - i;
    const gap = 1 - sstep(0.04, 0.12, Math.min(fx, 1 - fx));
    const wire = 1 - sstep(0.004, 0.008, Math.abs(((x + y) % 0.0625) - 0.03125)) * sstep(0.004, 0.008, Math.abs(((x - y + 8) % 0.0625) - 0.03125));
    const m = (1 + (hash2(i, 1, seed) - 0.5) * 0.18 + fade(x, y) * 0.15) * (1 - gap * 0.75);
    L.r[k] = lerp(c[0] * m, 0.6, wire * 0.8);
    L.g[k] = lerp(c[1] * m, 0.62, wire * 0.8);
    L.b[k] = lerp(c[2] * m, 0.63, wire * 0.8);
    L.height[k] = wire * 0.003 - gap * 0.004;
    return 0;
  });
  return L.finish();
}
add('chainlink-slats-green', '金網 目隠し板 緑', [0.5, 0.5], (t, s) => slats(t, s, hex(0x2c5a3c)), { ...tiled, density: 384 });
add('chainlink-slats-brown', '金網 目隠し板 茶', [0.5, 0.5], (t, s) => slats(t, s, hex(0x6a4a34)), { ...tiled, density: 384 });
add('chainlink-slats-white', '金網 目隠し板 白', [0.5, 0.5], (t, s) => slats(t, s, hex(0xd8d6ce)), { ...tiled, density: 384 });
add('chainlink-slats-grey', '金網 目隠し板 灰', [0.5, 0.5], (t, s) => slats(t, s, hex(0x70747a)), { ...tiled, density: 384 });

// --- Stone: boulders, rubble, gabions. Each stone is one cell lit on its own facet. ---
interface StoneOpts { size: number; colors: readonly RGB[]; gap?: RGB; flat?: number; moss?: number; wet?: number; mesh?: boolean; stretch?: number; crack?: number; vary?: number }
function stones(tex: Tex, seed: number, o: StoneOpts): Layers {
  const gap = o.gap ?? [0.07, 0.065, 0.06];
  const L = new Layers(tex, gap, 0.92);
  const cell = tex.cells(o.size, seed);
  const grainN = tex.noise(o.size * 0.25, o.size * 0.25, seed + 1, 4);
  const mossN = tex.noise(0.5, 0.5, seed + 2, 3);
  const st = o.stretch ?? 1;
  tex.map((x, y, k) => {
    const c = cell(x, y * st);
    const top = sstep(0.02 * (o.crack ?? 1), 0.22 * (o.crack ?? 1), c.f2 - c.f1);
    const col = o.colors[Math.floor(c.id * 997) % o.colors.length];
    const gr = grainN(x, y);
    const vary = o.vary ?? 0.5;
    const m = (1 - vary * 0.56 + ((c.id * 37) % 1) * vary) * (1 + gr * (0.22 + (0.5 - vary) * 0.5)) * (0.5 + 0.5 * top) * (0.78 + 0.3 * (1 - c.f1)) * (1 + (hash2(k, 3, seed) - 0.5) * 0.06);
    let r = lerp(gap[0], col[0] * m, top);
    let g = lerp(gap[1], col[1] * m, top);
    let b = lerp(gap[2], col[2] * m, top);
    const ms = clamp01((o.moss ?? 0) * 2 * sstep(0.1, 0.6, mossN(x, y) + (1 - top) * 0.6));
    r = lerp(r, 0.17 * (0.7 + gr * 0.5), ms);
    g = lerp(g, 0.25 * (0.7 + gr * 0.5), ms);
    b = lerp(b, 0.09, ms);
    const wet = o.wet ?? 0;
    L.r[k] = r * (1 - wet * 0.45);
    L.g[k] = g * (1 - wet * 0.42);
    L.b[k] = b * (1 - wet * 0.38);
    L.rough[k] = lerp(0.92, 0.35, wet * top);
    L.height[k] = top * o.size * 0.3 * (1 - c.f1 * (1 - (o.flat ?? 0.3))) + gr * o.size * 0.02;
    return 0;
  });
  if (o.mesh) {
    const m = tex.field();
    for (let x = 0.0375; x < tex.mw; x += 0.075) tex.rect(m, x - 0.002, 0, x + 0.002, tex.mh);
    for (let y = 0.0375; y < tex.mh; y += 0.075) tex.rect(m, 0, y - 0.002, tex.mw, y + 0.002);
    for (let x = 0; x < tex.mw + 0.01; x += 1) tex.rect(m, x - 0.006, 0, x + 0.006, tex.mh);
    for (let y = 0; y < tex.mh + 0.01; y += 0.5) tex.rect(m, 0, y - 0.006, tex.mw, y + 0.006);
    L.paint(m, [0.55, 0.57, 0.58], { rough: 0.45, metal: 0.7, height: 0.006 });
  }
  return L;
}
const GRANITE: RGB[] = [hex(0x8c8884), hex(0x9c9690), hex(0x74706c), hex(0xaaa49c), hex(0x64605c)];
const SANDSTONE: RGB[] = [hex(0xb09870), hex(0xa08860), hex(0xc0a880), hex(0x90785a)];
const BASALT: RGB[] = [hex(0x3c3d40), hex(0x4a4b4e), hex(0x2e2f31), hex(0x56575a)];
const LIMESTONE: RGB[] = [hex(0xc0b8a4), hex(0xb0a894), hex(0xcec8b6), hex(0x9c9484)];
const COBBLE: RGB[] = [hex(0x8a8478), hex(0x9a7c64), hex(0x6c6a66), hex(0xb0a898), hex(0x5a5650), hex(0x7c6654)];
add('riprap-granite', '捨石 花崗岩', [3, 3], (t, s) => stones(t, s, { size: 0.55, colors: GRANITE }).finish(1.4), tiled);
add('riprap-dark', '捨石 玄武岩', [3, 3], (t, s) => stones(t, s, { size: 0.6, colors: BASALT }).finish(1.4), tiled);
add('riprap-wet', '捨石 濡れて海藻つき', [3, 3], (t, s) => stones(t, s, { size: 0.55, colors: GRANITE, wet: 0.8, moss: 0.35 }).finish(1.4), tiled);
add('riprap-mossy', '捨石 苔むした', [3, 3], (t, s) => stones(t, s, { size: 0.5, colors: LIMESTONE, moss: 0.6 }).finish(1.4), tiled);
add('riprap-sandstone', '捨石 砂岩', [3, 3], (t, s) => stones(t, s, { size: 0.5, colors: SANDSTONE }).finish(1.4), tiled);
add('rock-granite', '岩肌 花崗岩', [2, 2], (t, s) => stones(t, s, { size: 1.1, colors: GRANITE, crack: 0.12, vary: 0.12, flat: 0.8, gap: [0.3, 0.29, 0.28] }).finish(1.6), tiled);
add('rock-sandstone', '岩肌 砂岩', [2, 2], (t, s) => stones(t, s, { size: 1.0, colors: SANDSTONE, crack: 0.12, vary: 0.12, flat: 0.8, gap: [0.4, 0.33, 0.24], stretch: 2.2 }).finish(1.6), tiled);
add('rock-basalt', '岩肌 玄武岩', [2, 2], (t, s) => stones(t, s, { size: 0.9, colors: BASALT, crack: 0.12, vary: 0.12, flat: 0.7, gap: [0.1, 0.1, 0.1] }).finish(1.6), tiled);
add('rock-mossy', '岩肌 苔むした', [2, 2], (t, s) => stones(t, s, { size: 1.0, colors: GRANITE, crack: 0.12, vary: 0.12, flat: 0.8, gap: [0.2, 0.22, 0.16], moss: 0.5 }).finish(1.6), tiled);
add('rock-wet', '岩肌 波打ち際', [2, 2], (t, s) => stones(t, s, { size: 0.9, colors: BASALT, crack: 0.12, vary: 0.12, flat: 0.7, wet: 0.9, moss: 0.3 }).finish(1.6), tiled);
add('wall-rubble', '野面積みの石垣', [2, 2], (t, s) => stones(t, s, { size: 0.28, colors: COBBLE, flat: 0.75, gap: [0.2, 0.19, 0.17] }).finish(1.2), tiled);
add('wall-rubble-mossy', '野面積みの石垣 苔', [2, 2], (t, s) => stones(t, s, { size: 0.3, colors: GRANITE, flat: 0.75, gap: [0.14, 0.15, 0.11], moss: 0.5 }).finish(1.2), tiled);
add('wall-cobble', '玉石積み モルタル目地', [2, 2], (t, s) => stones(t, s, { size: 0.2, colors: COBBLE, flat: 0.4, gap: [0.5, 0.48, 0.44] }).finish(1.2), tiled);
add('wall-flagstone', '乱張りの石', [2, 2], (t, s) => stones(t, s, { size: 0.45, colors: SANDSTONE, flat: 0.95, gap: [0.42, 0.4, 0.36] }).finish(0.8), tiled);
add('gabion-granite', '蛇籠 花崗岩', [2, 1], (t, s) => stones(t, s, { size: 0.14, colors: GRANITE, mesh: true }).finish(1.2), tiled);
add('gabion-sandstone', '蛇籠 砂岩', [2, 1], (t, s) => stones(t, s, { size: 0.16, colors: SANDSTONE, mesh: true }).finish(1.2), tiled);
add('gabion-dark', '蛇籠 玄武岩', [2, 1], (t, s) => stones(t, s, { size: 0.13, colors: BASALT, mesh: true }).finish(1.2), tiled);
add('pebbles', '玉砂利の浜', [1.5, 1.5], (t, s) => stones(t, s, { size: 0.045, colors: COBBLE, flat: 0.2, gap: [0.3, 0.27, 0.22] }).finish(1), tiled);
add('pebbles-wet', '玉砂利 濡れ', [1.5, 1.5], (t, s) => stones(t, s, { size: 0.045, colors: COBBLE, flat: 0.2, gap: [0.2, 0.18, 0.15], wet: 0.8 }).finish(1), tiled);
add('wall-fieldstone', '切石積みの擁壁', [1.8, 1.2], (t, s) => S.masonry(t, { seed: s, block: [0.45, 0.2], colors: COBBLE, mortar: [0.45, 0.43, 0.4], rough: true, streaks: 0.4 }), tiled);
add('wall-ashlar-tan', '砂岩の切石塀', [1.8, 1.2], (t, s) => S.masonry(t, { seed: s, block: [0.6, 0.3], colors: SANDSTONE, mortar: [0.6, 0.55, 0.45], rough: true, streaks: 0.3 }), tiled);
add('wall-segmental-tan', '擁壁ブロック 割肌 砂色', [1.8, 1.2], (t, s) => S.masonry(t, { seed: s, block: [0.45, 0.2], colors: [hex(0xb8a484), hex(0xae9a7a), hex(0xc0ac8c)], mortar: [0.25, 0.22, 0.18], rough: true, streaks: 0.5 }), tiled);
add('wall-segmental-grey', '擁壁ブロック 割肌 灰', [1.8, 1.2], (t, s) => S.masonry(t, { seed: s, block: [0.45, 0.2], colors: [hex(0x8c8a86), hex(0x82807c), hex(0x96948e)], mortar: [0.2, 0.2, 0.2], rough: true, streaks: 0.6 }), tiled);
add('wall-segmental-red', '擁壁ブロック 割肌 赤茶', [1.8, 1.2], (t, s) => S.masonry(t, { seed: s, block: [0.45, 0.2], colors: [hex(0x9a6a54), hex(0x8c5e4a), hex(0xa4745c)], mortar: [0.22, 0.18, 0.15], rough: true, streaks: 0.5 }), tiled);

// --- Marine growth: wet, weed and barnacles between the low and high water marks (heights in metres up the texture). ---
function tidal(L: Layers, seed: number, lo: number, hi: number, amount = 1): void {
  const tex = L.tex;
  const edge = tex.noise(0.4, 0.2, seed + 40, 3);
  const weed = tex.noise(0.05, 0.14, seed + 41, 3);
  const barn = tex.cells(0.018, seed + 42);
  tex.map((x, y, k) => {
    const yy = y + edge(x, y) * 0.25;
    const wet = sstep(hi + 0.5, hi - 0.1, yy) * amount;
    const band = sstep(lo - 0.3, lo + 0.2, yy) * sstep(hi + 0.15, hi - 0.35, yy);
    const al = clamp01(band * (0.55 + weed(x, y) * 0.9)) * amount;
    const deep = sstep(lo + 0.2, lo - 0.4, yy) * amount;
    L.r[k] *= 1 - wet * 0.45;
    L.g[k] *= 1 - wet * 0.4;
    L.b[k] *= 1 - wet * 0.36;
    L.r[k] = lerp(L.r[k], ALGAE[0] * (0.6 + weed(x, y)), al * 0.85);
    L.g[k] = lerp(L.g[k], ALGAE[1] * (0.6 + weed(x, y)), al * 0.85);
    L.b[k] = lerp(L.b[k], ALGAE[2], al * 0.85);
    const c = barn(x, y);
    const bz = sstep(lo - 0.2, lo + 0.1, yy) * sstep(lo + 0.9, lo + 0.4, yy) * (c.id > 0.45 ? 1 - sstep(0.15, 0.45, c.f1) : 0) * amount;
    L.r[k] = lerp(L.r[k], 0.62, bz * 0.8);
    L.g[k] = lerp(L.g[k], 0.6, bz * 0.8);
    L.b[k] = lerp(L.b[k], 0.54, bz * 0.8);
    L.height[k] += bz * 0.004;
    L.r[k] *= 1 - deep * 0.6;
    L.g[k] *= 1 - deep * 0.5;
    L.b[k] *= 1 - deep * 0.45;
    L.rough[k] = lerp(L.rough[k], 0.3, wet * 0.7);
    return 0;
  });
}
/** Rust that bleeds down from weep holes spaced along the wall. */
function weeps(L: Layers, seed: number, y: number, gap: number): void {
  const tex = L.tex;
  const m = tex.field();
  const hole = tex.field();
  for (let x = gap / 2; x < tex.mw; x += gap) {
    const len = 0.5 + hash2(Math.round(x * 10), 1, seed) * 0.9;
    tex.sdf(m, x - 0.2, y - len, x + 0.2, y, (px, py) => Math.abs(px - x) - 0.05 * (1 - (y - py) / len) - 0.01, 1, 0.05);
    tex.disc(hole, x, y, 0.035, 1, 0.006);
  }
  L.paint(m, RUST, { opacity: 0.45 });
  L.paint(hole, [0.03, 0.03, 0.03], { height: -0.02 });
}
const CONC: RGB = hex(0x9a968e);
add('seawall-concrete', '護岸 コンクリート 潮位帯', [4, 4], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: CONC, slab: [2, 0], finish: 'formwork', streaks: 0.6, dirt: 0.5 }); tidal(L, s, 0.8, 1.9); return L.finish(); }, { tile: 'x', density: 96 });
add('seawall-concrete-old', '護岸 古いコンクリート さび汁', [4, 4], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: hex(0x8a857a), slab: [2, 0], finish: 'boards', streaks: 0.9, dirt: 0.8, cracks: 0.6 }); weeps(L, s, 2.9, 2); tidal(L, s, 0.8, 1.9); return L.finish(); }, { tile: 'x', density: 96 });
add('seawall-stone', '護岸 石積み 潮位帯', [3.6, 4], (t, s) => { const L = stones(t, s, { size: 0.42, colors: GRANITE, flat: 0.85, gap: [0.3, 0.29, 0.27] }); tidal(L, s, 0.8, 1.9); return L.finish(1.2); }, { tile: 'x', density: 96 });
add('seawall-sheetpile', '護岸 鋼矢板 さび', [2.4, 4], (t, s) => { const L = paintLayers(t, s, hex(0x5a3a28), { rust: 0.9, ribs: 0.6, streaks: 0.6 }); tidal(L, s, 0.8, 1.9); return L.finish(); }, { tile: 'x', density: 96 });
add('retaining-concrete', '擁壁 コンクリート', [4, 3], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: CONC, slab: [2, 0], finish: 'formwork', streaks: 0.7, dirt: 0.4 }); weeps(L, s, 0.5, 2); return L.finish(); }, { tile: 'x', density: 96 });
add('retaining-concrete-stained', '擁壁 コンクリート 黒ずみ', [4, 3], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: hex(0x86827a), slab: [2, 0], finish: 'boards', streaks: 1, dirt: 0.9, cracks: 0.5, stains: 0.6 }); weeps(L, s, 0.5, 2); return L.finish(); }, { tile: 'x', density: 96 });
add('retaining-shotcrete', '擁壁 吹付けコンクリート', [3, 3], (t, s) => stones(t, s, { size: 0.5, colors: [hex(0x8e8a82), hex(0x86827a), hex(0x96928a)], crack: 0.05, vary: 0.1, flat: 0.5, gap: [0.5, 0.49, 0.46] }).finish(0.9), tiled);
add('noise-fluted', '遮音壁 縦リブ', [2, 3], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: hex(0xa8a296), finish: 'smooth', streaks: 0.8, dirt: 0.4 }); ribbed(L, 0.1, 0.012); return L.finish(); }, { tile: 'x', density: 128 });
add('noise-fluted-tan', '遮音壁 縦リブ 砂色', [2, 3], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: hex(0xb8a688), finish: 'smooth', streaks: 0.7, dirt: 0.5 }); ribbed(L, 0.14, 0.014); return L.finish(); }, { tile: 'x', density: 128 });
add('noise-absorptive', '遮音壁 吸音パネル 茶', [2, 3], (t, s) => { const L = paintLayers(t, s, hex(0x6a5444), { rust: 0.05, streaks: 0.5, rough: 0.9 }); ribbed(L, 0.05, 0.006, true); return L.finish(); }, { tile: 'x', density: 128 });
add('noise-absorptive-green', '遮音壁 吸音パネル 緑', [2, 3], (t, s) => { const L = paintLayers(t, s, hex(0x3c5a48), { rust: 0.05, streaks: 0.5, rough: 0.9 }); ribbed(L, 0.05, 0.006, true); return L.finish(); }, { tile: 'x', density: 128 });
add('noise-glass', '遮音壁 透明板', [2, 2], (t, s) => glass(t, s, hex(0x6a8c8c), [2, 2], [0.5, 0.52, 0.52], true), { tile: 'x', density: 128, reflect: 0.5 });
add('wall-cap', '塀の笠木 コンクリート', [1.2, 0.4], (t, s) => S.concrete(t, { seed: s, color: hex(0xa8a49a), slab: [1.2, 0], finish: 'smooth', dirt: 0.5, stains: 0.4 }), { tile: 'x', density: 192 });

/** Grooves pressed into a wall: vertical ribs, or horizontal slots when `across`. */
function ribbed(L: Layers, pitch: number, depth: number, across = false): void {
  const tex = L.tex;
  tex.map((x, y, k) => {
    const p = ((across ? y : x) / pitch) % 1;
    const v = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    L.height[k] += v * depth;
    const m = 0.82 + 0.26 * v;
    L.r[k] *= m;
    L.g[k] *= m;
    L.b[k] *= m;
    return 0;
  });
}

// --- Painted steel, timber and plastic that weather. ---
interface PaintOpts { rust?: number; streaks?: number; rough?: number; ribs?: number; chips?: number; fade?: number; metal?: number }
function paintLayers(tex: Tex, seed: number, c: RGB, o: PaintOpts = {}): Layers {
  const L = new Layers(tex, c, o.rough ?? 0.5);
  const mottle = tex.noise(0.5, 0.5, seed, 3);
  const chip = tex.noise(0.09, 0.09, seed + 1, 2);
  const patch = tex.noise(0.35, 0.5, seed + 2, 3);
  const streak = tex.noise(0.035, 0.9, seed + 3, 3);
  const [rust, chips] = [o.rust ?? 0.2, o.chips ?? o.rust ?? 0.2];
  tex.map((x, y, k) => {
    const f = clamp01((o.fade ?? 0.15) * (0.5 + mottle(x, y)));
    const g = (c[0] + c[1] + c[2]) / 3;
    let r = lerp(c[0], g + 0.1, f) * (1 + mottle(x, y) * 0.1);
    let gg = lerp(c[1], g + 0.1, f) * (1 + mottle(x, y) * 0.1);
    let b = lerp(c[2], g + 0.1, f) * (1 + mottle(x, y) * 0.1);
    const ru = clamp01(sstep(1.0 - rust * 0.6, 1.12 - rust * 0.6, patch(x, y) * 0.5 + 0.5 + chip(x, y) * 0.2) + sstep(0.97 - chips * 0.3, 1.02 - chips * 0.3, chip(x, y) * 0.5 + 0.5));
    const st = clamp01((o.streaks ?? 0.3) * sstep(0.05, 0.6, streak(x, y)) * 0.5);
    const rc = 0.6 + chip(x, y) * 0.5;
    r = lerp(r, RUST[0] * rc, Math.max(ru, st * 0.4));
    gg = lerp(gg, RUST[1] * rc, Math.max(ru, st * 0.4));
    b = lerp(b, RUST[2] * rc, Math.max(ru, st * 0.4));
    L.r[k] = r;
    L.g[k] = gg;
    L.b[k] = b;
    L.rough[k] = lerp(o.rough ?? 0.5, 0.9, ru);
    L.metal[k] = (o.metal ?? 0) * (1 - ru);
    L.height[k] = -ru * 0.0015;
    return 0;
  });
  if (o.ribs) ribbed(L, o.ribs, o.ribs * 0.12);
  return L;
}
const painted = (c: number, o: PaintOpts = {}): Gen => (t, s) => paintLayers(t, s, hex(c), o).finish();
add('tower-white', '灯台の塗装 白', [2, 2], painted(0xe8e6de, { rust: 0.12, streaks: 0.7, rough: 0.7 }), tiled);
add('tower-red', '灯台の塗装 赤', [2, 2], painted(0xb82820, { rust: 0.1, streaks: 0.5, rough: 0.7, fade: 0.3 }), tiled);
add('tower-black', '灯台の塗装 黒', [2, 2], painted(0x1c1c1e, { rust: 0.1, streaks: 0.3, rough: 0.7, fade: 0.3 }), tiled);
add('tower-green', '灯台の塗装 緑', [2, 2], painted(0x1c6c40, { rust: 0.1, streaks: 0.5, rough: 0.7, fade: 0.3 }), tiled);
add('tower-rusty', '灯台の塗装 白 さびだらけ', [2, 2], painted(0xdcd8cc, { rust: 0.6, streaks: 1, rough: 0.75 }), tiled);
add('buoy-red', 'ブイの塗装 赤', [1, 1], painted(0xc02820, { rust: 0.3, streaks: 0.6, fade: 0.3 }), tiled);
add('buoy-green', 'ブイの塗装 緑', [1, 1], painted(0x1c7c3c, { rust: 0.3, streaks: 0.6, fade: 0.3 }), tiled);
add('buoy-yellow', 'ブイの塗装 黄', [1, 1], painted(0xe8c01c, { rust: 0.3, streaks: 0.6, fade: 0.2 }), tiled);
add('buoy-orange', 'ブイの塗装 橙', [1, 1], painted(0xe8641c, { rust: 0.15, streaks: 0.3, fade: 0.3 }), tiled);
add('hull-white', '船体 白', [2, 1], painted(0xe8e8e4, { rust: 0.06, streaks: 0.5, rough: 0.35 }), tiled);
add('hull-blue', '船体 紺', [2, 1], painted(0x1c305c, { rust: 0.06, streaks: 0.3, rough: 0.35, fade: 0.3 }), tiled);
add('hull-red', '船体 赤', [2, 1], painted(0xa82420, { rust: 0.1, streaks: 0.3, rough: 0.4, fade: 0.3 }), tiled);
add('hull-green', '船体 緑 さび', [2, 1], painted(0x2c5c48, { rust: 0.4, streaks: 0.7, rough: 0.5 }), tiled);
add('hull-black', '船体 黒 さび', [2, 1], painted(0x1c1c1e, { rust: 0.35, streaks: 0.6, rough: 0.5 }), tiled);
add('hull-antifoul', '船底塗料 赤茶', [2, 1], painted(0x6c2c24, { rust: 0.2, streaks: 0.2, rough: 0.8, fade: 0.4 }), tiled);
add('hull-aluminium', '船体 アルミ', [2, 1], painted(0xa8acb0, { rust: 0, chips: 0, streaks: 0.1, rough: 0.4, metal: 0.8 }), tiled);
for (const [id, jp, c] of [['red', '赤', 0xd82c24], ['yellow', '黄', 0xf0c41c], ['blue', '青', 0x1c5cc0], ['green', '緑', 0x2c9c4c], ['orange', '橙', 0xf07c1c], ['purple', '紫', 0x7c3c9c]] as [string, string, number][]) {
  add(`plastic-${id}`, `遊具の樹脂 ${jp}`, [1, 1], painted(c, { rust: 0, chips: 0, streaks: 0.15, rough: 0.3, fade: 0.35 }), tiled);
}
add('tank-white', '給水塔の塗装 白', [3, 3], painted(0xe4e4e0, { rust: 0.15, streaks: 0.9, rough: 0.6 }), tiled);
add('tank-blue', '給水塔の塗装 水色', [3, 3], painted(0x8cb4cc, { rust: 0.12, streaks: 0.8, rough: 0.6, fade: 0.3 }), tiled);
add('tank-green', '給水塔の塗装 淡緑', [3, 3], painted(0x9cb89c, { rust: 0.2, streaks: 0.9, rough: 0.6, fade: 0.3 }), tiled);
add('tank-rusty', '給水塔の塗装 さび', [3, 3], painted(0xc8c4b8, { rust: 0.7, streaks: 1, rough: 0.7 }), tiled);
add('crane-yellow', 'クレーンの塗装 黄', [2, 2], painted(0xe8b01c, { rust: 0.2, streaks: 0.6, rough: 0.55 }), tiled);
add('crane-red', 'クレーンの塗装 赤', [2, 2], painted(0xc03c24, { rust: 0.2, streaks: 0.6, rough: 0.55, fade: 0.3 }), tiled);
add('crane-blue', 'クレーンの塗装 青', [2, 2], painted(0x1c4c9c, { rust: 0.2, streaks: 0.6, rough: 0.55, fade: 0.3 }), tiled);
add('bronze', 'ブロンズ像 緑青', [1, 1], (t, s) => { const L = paintLayers(t, s, hex(0x4a3a28), { rust: 0, chips: 0, streaks: 0.2, rough: 0.45, metal: 0.8 }); const p = t.noise(0.3, 0.5, s + 9, 3); L.paint(t.map((x, y) => sstep(-0.1, 0.5, p(x, y))), [0.3, 0.52, 0.44], { rough: 0.8, metal: 0.1, opacity: 0.85 }); return L.finish(); }, tiled);
add('bronze-dark', 'ブロンズ像 黒ずみ', [1, 1], painted(0x3c2e20, { rust: 0, chips: 0, streaks: 0.4, rough: 0.4, metal: 0.8 }), tiled);

// Shipping containers: corrugated sides and the door end.
const BOXES: [string, string, number][] = [['red', '赤', 0x9c2c24], ['blue', '青', 0x1c4c8c], ['green', '緑', 0x2c6c4c], ['orange', '橙', 0xd0601c], ['grey', '灰', 0x8c9094], ['white', '白', 0xd8d6ce], ['yellow', '黄', 0xd8a81c], ['brown', '茶', 0x6a3c2c], ['teal', '青緑', 0x1c7c84], ['maroon', 'えんじ', 0x6c2430]];
const LINES = ['PACLINE', 'OCEANIA', 'TRANSMAR', 'KESTREL', 'NORDBULK', 'SUNCARGO', 'HARBOR EXP', 'ATLAS', 'MERIDIAN', 'COASTAL'];
BOXES.forEach(([id, jp, c], i) => {
  add(`container-${id}`, `コンテナ側面 ${jp}`, [6.06, 2.59], (t, s) => {
    const L = paintLayers(t, s, hex(c), { rust: 0.15 + (i % 3) * 0.15, streaks: 0.7, ribs: 0.278, rough: 0.55 });
    const m = t.field();
    const ink: RGB = ['white', 'yellow', 'grey'].includes(id) ? [0.1, 0.12, 0.2] : WHITE;
    const tmp = new Art(t, [0, 0, 0]);
    tmp.text([1, 1, 1], LINES[i], 3.03, 1.2, 0.5, { fit: 4.4, weight: 0.12 });
    for (let k = 0; k < t.n; k++) m[k] = tmp.L.r[k];
    L.paint(m, ink, { opacity: 0.85 });
    return L.finish();
  }, { density: 96 });
  add(`container-door-${id}`, `コンテナ扉 ${jp}`, [2.44, 2.59], (t, s) => {
    const L = paintLayers(t, s, hex(c), { rust: 0.2 + (i % 3) * 0.15, streaks: 0.6, ribs: 0.4, rough: 0.55 });
    const bars = t.field();
    const dark = t.field();
    for (const x of [0.32, 0.9, 1.54, 2.12]) {
      t.rect(bars, x - 0.02, 0.08, x + 0.02, 2.51);
      t.rect(bars, x - 0.1, 1.0, x + 0.1, 1.06);
    }
    t.rect(dark, 1.215, 0, 1.225, 2.59);
    for (const y of [0.05, 2.54]) t.rect(bars, 0.05, y - 0.02, 2.39, y + 0.02);
    L.paint(bars, [0.5, 0.52, 0.53], { metal: 0.7, rough: 0.5, height: 0.012 });
    L.paint(dark, [0.03, 0.03, 0.03], { height: -0.01 });
    const tmp = new Art(t, [0, 0, 0]);
    tmp.lines([1, 1, 1], [`${LINES[i].slice(0, 4)}U ${200000 + i * 73411}`, '22G1', 'MAX GR 30480 KG', 'TARE 2200 KG'], 1.82, 2.3, 0.07, { fit: 0.9 });
    const m = t.field();
    for (let k = 0; k < t.n; k++) m[k] = tmp.L.r[k];
    L.paint(m, ['white', 'yellow', 'grey'].includes(id) ? [0.1, 0.12, 0.2] : WHITE, { opacity: 0.85 });
    return L.finish();
  }, { density: 128 });
});

// --- Timber piles and decks in the tidal zone. ---
function pile(tex: Tex, seed: number, c: RGB): Layers {
  const L = new Layers(tex, c, 0.9);
  const grain = tex.noise(0.012, 0.7, seed, 4);
  const check = tex.noise(0.02, 1.2, seed + 1, 2);
  tex.map((x, y, k) => {
    const g = grain(x, y);
    const crack = sstep(0.42, 0.5, check(x, y));
    const m = (1 + g * 0.35) * (1 - crack * 0.7);
    L.r[k] = c[0] * m;
    L.g[k] = c[1] * m;
    L.b[k] = c[2] * m;
    L.height[k] = g * 0.003 - crack * 0.01;
    return 0;
  });
  return L;
}
add('pile-wood', '木杭 潮位帯', [0.95, 6], (t, s) => { const L = pile(t, s, hex(0x5a4634)); tidal(L, s, 1.4, 2.6); return L.finish(); }, { tile: 'x', density: 128 });
add('pile-wood-dry', '木杭 クレオソート', [0.95, 3], (t, s) => pile(t, s, hex(0x3a2c22)).finish(), { tile: 'xy', density: 128 });
add('pile-wood-grey', '木杭 風化 潮位帯', [0.95, 6], (t, s) => { const L = pile(t, s, hex(0x7a746a)); tidal(L, s, 1.4, 2.6); return L.finish(); }, { tile: 'x', density: 128 });
add('pile-concrete', 'コンクリート杭 潮位帯', [1.25, 6], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: CONC, finish: 'smooth', streaks: 0.6, dirt: 0.4 }); tidal(L, s, 1.4, 2.6); return L.finish(); }, { tile: 'x', density: 128 });
add('pile-steel', '鋼管杭 さび 潮位帯', [1.25, 6], (t, s) => { const L = paintLayers(t, s, hex(0x4a3a30), { rust: 0.8, streaks: 0.5, rough: 0.8 }); tidal(L, s, 1.4, 2.6); return L.finish(); }, { tile: 'x', density: 128 });
add('deck-wet', '桟橋の板 濡れ', [1.6, 1.6], (t, s) => S.planks(t, { seed: s, width: 0.2, color: hex(0x4a3c30), weathered: 0.5 }), tiled);
add('deck-grey', '桟橋の板 風化', [1.6, 1.6], (t, s) => S.planks(t, { seed: s, width: 0.2, color: hex(0x8a8478), weathered: 0.9 }), tiled);
add('deck-new', '桟橋の板 新しい', [1.6, 1.6], (t, s) => S.planks(t, { seed: s, width: 0.15, color: hex(0xa8855c), weathered: 0.15 }), tiled);
add('deck-teak', '船の甲板 チーク', [1, 1], (t, s) => S.planks(t, { seed: s, width: 0.06, color: hex(0x9a6c40), weathered: 0.2 }), tiled);
add('deck-composite', '浮桟橋の板 樹脂', [1.6, 1.6], (t, s) => S.planks(t, { seed: s, width: 0.14, color: hex(0x8c8478), weathered: 0.6 }), tiled);
add('float-concrete', '浮桟橋の側面 潮位帯', [3, 1], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: hex(0xa8a49c), slab: [3, 0], finish: 'smooth', dirt: 0.6, streaks: 0.5 }); tidal(L, s, 0.15, 0.45, 0.9); return L.finish(); }, { tile: 'x', density: 128 });
add('rope', 'ロープ', [0.2, 0.2], (t, s) => { const L = new Layers(t, hex(0xb8a070), 0.9); const n = t.noise(0.05, 0.05, s, 2); t.map((x, y, k) => { const p = (((x + y) / 0.04) % 1 + 1) % 1; const v = 0.5 - 0.5 * Math.cos(p * Math.PI * 2); const m = (0.6 + 0.5 * v) * (1 + n(x, y) * 0.2); L.r[k] *= m; L.g[k] *= m; L.b[k] *= m; L.height[k] = v * 0.004; return 0; }); return L.finish(); }, { ...tiled, density: 384 });
add('rope-blue', 'ロープ 青(合成)', [0.2, 0.2], (t, s) => { const L = new Layers(t, hex(0x2c5cb0), 0.7); const n = t.noise(0.05, 0.05, s, 2); t.map((x, y, k) => { const p = (((x + y) / 0.04) % 1 + 1) % 1; const v = 0.5 - 0.5 * Math.cos(p * Math.PI * 2); const m = (0.6 + 0.5 * v) * (1 + n(x, y) * 0.2); L.r[k] *= m; L.g[k] *= m; L.b[k] *= m; L.height[k] = v * 0.004; return 0; }); return L.finish(); }, { ...tiled, density: 384 });

// --- Sand, water and glass. ---
function sand(tex: Tex, seed: number, c: RGB, o: { wet?: number; ripples?: number; weed?: number; prints?: number; shells?: number } = {}): TextureData {
  const L = new Layers(tex, c, 0.95);
  const tone = tex.noise(0.8, 0.8, seed, 3);
  const warp = tex.noise(0.5, 0.5, seed + 1, 2);
  const weedN = tex.noise(0.1, 0.04, seed + 2, 3);
  const band = tex.noise(1.2, 0.3, seed + 3, 2);
  const shell = tex.cells(0.03, seed + 4);
  const dents = tex.cells(0.22, seed + 5);
  tex.map((x, y, k) => {
    const grain = (hash2(k, 1, seed) - 0.5) * 0.12;
    const rp = o.ripples ? Math.sin(((y + warp(x, y) * 0.12) / 0.09) * Math.PI * 2) * o.ripples : 0;
    const d = dents(x, y);
    const pr = o.prints ? (1 - sstep(0.12, 0.3, d.f1)) * (d.id > 1 - o.prints ? 1 : 0) : 0;
    const wet = o.wet ?? 0;
    const m = (1 + tone(x, y) * 0.1 + grain + rp * 0.1 - pr * 0.14) * (1 - wet * 0.38);
    let r = c[0] * m;
    let g = c[1] * m;
    let b = c[2] * m * (1 + wet * 0.08);
    const w = clamp01((o.weed ?? 0) * sstep(0.1, 0.5, band(x, y)) * sstep(0, 0.4, weedN(x, y)) * 2);
    r = lerp(r, 0.1, w);
    g = lerp(g, 0.11, w);
    b = lerp(b, 0.06, w);
    const sc = shell(x, y);
    const sh = o.shells && sc.id > 1 - o.shells * 0.25 ? 1 - sstep(0.1, 0.25, sc.f1) : 0;
    L.r[k] = lerp(r, 0.86, sh);
    L.g[k] = lerp(g, 0.82, sh);
    L.b[k] = lerp(b, 0.76, sh);
    L.rough[k] = lerp(0.95, 0.25, wet);
    L.height[k] = rp * 0.006 - pr * 0.012 + grain * 0.004 + w * 0.006 + sh * 0.004;
    return 0;
  });
  return L.finish();
}
const SAND: RGB = hex(0xd8c49a);
add('sand-dry', '砂浜 乾いた砂', [2, 2], (t, s) => sand(t, s, SAND, { shells: 0.1 }), tiled);
add('sand-prints', '砂浜 足跡', [2, 2], (t, s) => sand(t, s, SAND, { prints: 0.45 }), tiled);
add('sand-ripples', '砂浜 風紋', [2, 2], (t, s) => sand(t, s, hex(0xdcc8a0), { ripples: 1 }), tiled);
add('sand-wet', '砂浜 濡れた砂', [2, 2], (t, s) => sand(t, s, hex(0xb89c74), { wet: 0.85, ripples: 0.4 }), tiled);
add('sand-wrack', '砂浜 打ち上げられた海藻', [2, 2], (t, s) => sand(t, s, SAND, { weed: 0.9, shells: 0.5 }), tiled);
add('sand-white', '砂浜 白い砂', [2, 2], (t, s) => sand(t, s, hex(0xece4d0), { prints: 0.2 }), tiled);
add('sand-dark', '砂浜 黒っぽい砂', [2, 2], (t, s) => sand(t, s, hex(0x7c7468), { wet: 0.3, shells: 0.3 }), tiled);
add('mud', '干潟の泥', [2, 2], (t, s) => sand(t, s, hex(0x5a5040), { wet: 0.7, ripples: 0.3, prints: 0.15 }), tiled);
function water(tex: Tex, seed: number, c: RGB, foam = 0): TextureData {
  const L = new Layers(tex, c, 0.08);
  const a = tex.noise(0.5, 0.3, seed, 3);
  const b2 = tex.noise(0.15, 0.1, seed + 1, 2);
  const fm = tex.noise(0.4, 0.4, seed + 2, 4);
  tex.map((x, y, k) => {
    const h = a(x, y) * 0.7 + b2(x, y) * 0.3;
    const f = clamp01(foam * sstep(0.15, 0.5, fm(x, y)));
    L.r[k] = lerp(c[0] * (1 + h * 0.3), 0.9, f);
    L.g[k] = lerp(c[1] * (1 + h * 0.25), 0.93, f);
    L.b[k] = lerp(c[2] * (1 + h * 0.2), 0.94, f);
    L.rough[k] = lerp(0.06, 0.6, f);
    L.height[k] = h * 0.02;
    return 0;
  });
  return L.finish(1.2);
}
add('water-pool', '水面 プール・噴水', [2, 2], (t, s) => water(t, s, hex(0x3c94b0)), { ...tiled, reflect: 0.6 });
add('water-pond', '水面 池', [2, 2], (t, s) => water(t, s, hex(0x2c4c44)), { ...tiled, reflect: 0.7 });
add('water-harbor', '水面 港', [3, 3], (t, s) => water(t, s, hex(0x1c3c4c)), { ...tiled, reflect: 0.7 });
add('water-foam', '水面 泡立つ', [2, 2], (t, s) => water(t, s, hex(0x4c9cac), 0.9), { ...tiled, reflect: 0.3 });
function glass(tex: Tex, seed: number, c: RGB, pane: readonly [number, number], frame: RGB, birds = false): TextureData {
  const L = new Layers(tex, c, 0.08);
  const dirt = tex.noise(0.4, 0.6, seed, 3);
  const m = tex.field();
  for (let x = 0; x < tex.mw + 0.01; x += pane[0]) tex.rect(m, x - 0.025, 0, x + 0.025, tex.mh);
  for (let y = 0; y < tex.mh + 0.01; y += pane[1]) tex.rect(m, 0, y - 0.025, tex.mw, y + 0.025);
  tex.map((x, y, k) => {
    const d = clamp01(sstep(0, 0.6, dirt(x, y)) * 0.35 + sstep(0.5, 0, y) * 0.3);
    const stripe = birds && Math.abs((y % 0.1) - 0.05) < 0.004 ? 0.35 : 0;
    L.r[k] = lerp(c[0], 0.6, d + stripe);
    L.g[k] = lerp(c[1], 0.58, d + stripe);
    L.b[k] = lerp(c[2], 0.54, d + stripe);
    L.rough[k] = lerp(0.06, 0.7, d + stripe);
    return 0;
  });
  L.paint(m, frame, { rough: 0.5, metal: 0.6, height: 0.01 });
  return L.finish();
}
add('lantern-glass', '灯室のガラス', [0.8, 1.6], (t, s) => glass(t, s, hex(0x3c5058), [0.8, 0.8], [0.08, 0.08, 0.08]), { tile: 'x', reflect: 0.6 });
add('lantern-glass-lit', '灯室のガラス 点灯', [0.8, 1.6], (t, s) => glass(t, s, hex(0xf4e8b0), [0.8, 0.8], [0.08, 0.08, 0.08]), { tile: 'x', emissive: 0.8 });
add('lens-fresnel', 'フレネルレンズ', [0.6, 0.8], (t, s) => { const L = new Layers(t, hex(0xb8d0c8), 0.1); const n = t.noise(0.2, 0.2, s, 2); t.map((x, y, k) => { const p = (y / 0.04) % 1; const cx = Math.abs(x - 0.3) / 0.3; const m = 0.6 + 0.6 * p + n(x, y) * 0.1 - cx * 0.2; L.r[k] *= m; L.g[k] *= m; L.b[k] *= m; L.height[k] = p * 0.004; return 0; }); return L.finish(); }, { tile: 'x', reflect: 0.5 });
add('lens-fresnel-lit', 'フレネルレンズ 点灯', [0.6, 0.8], (t) => { const L = new Layers(t, hex(0xfff0b0), 0.1); t.map((_x, y, k) => { const p = (y / 0.04) % 1; const m = 0.75 + 0.3 * p; L.r[k] *= m; L.g[k] *= m; L.b[k] *= m; return 0; }); return L.finish(); }, { tile: 'x', emissive: 1 });
add('beacon-red', '標識灯 赤', [0.3, 0.3], (t) => new Layers(t, hex(0xf03020), 0.2).finish(), { tile: 'xy', emissive: 0.9, density: 64 });
add('beacon-green', '標識灯 緑', [0.3, 0.3], (t) => new Layers(t, hex(0x30e060), 0.2).finish(), { tile: 'xy', emissive: 0.9, density: 64 });
add('beacon-white', '標識灯 白', [0.3, 0.3], (t) => new Layers(t, hex(0xfff4d0), 0.2).finish(), { tile: 'xy', emissive: 0.9, density: 64 });

// --- Courts and play surfaces. ---
function court(tex: Tex, seed: number, base: RGB, draw: (a: Art, line: RGB) => void, line: RGB = WHITE): TextureData {
  const a = new Art(tex, base, 0.8);
  draw(a, line);
  return a.done(seed, 0.3);
}
const ln = (a: Art, c: RGB, x0: number, y0: number, x1: number, y1: number, w = 0.05): void => a.rect(c, Math.min(x0, x1) - (x0 === x1 ? w / 2 : 0), Math.min(y0, y1) - (y0 === y1 ? w / 2 : 0), Math.max(x0, x1) + (x0 === x1 ? w / 2 : 0), Math.max(y0, y1) + (y0 === y1 ? w / 2 : 0));
const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 24): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(a0 + ((a1 - a0) * i) / n), cy + r * Math.sin(a0 + ((a1 - a0) * i) / n)] as [number, number]);
const hoops = (a: Art, c: RGB): void => {
  // Half court 15.24 wide by 14.33 deep, baseline at y = 0.
  a.frame(c, 0.05);
  ln(a, c, 5.18, 0, 5.18, 5.8);
  ln(a, c, 10.06, 0, 10.06, 5.8);
  ln(a, c, 5.18, 5.8, 10.06, 5.8);
  a.line(c, arcPts(7.62, 5.8, 1.83, 0, Math.PI), 0.025);
  a.line(c, [[0.9, 0], [0.9, 4.2], ...arcPts(7.62, 1.6, 7.24, Math.PI - 0.38, 0.38, 40), [14.34, 0]], 0.025);
  a.line(c, arcPts(7.62, 14.33, 1.83, Math.PI, Math.PI * 2), 0.025);
};
add('court-basketball', 'バスケットコート 半面 アスファルト', [15.24, 14.33], (t, s) => court(t, s, hex(0x4a4a4c), hoops), { density: 40 });
add('court-basketball-green', 'バスケットコート 半面 緑', [15.24, 14.33], (t, s) => court(t, s, hex(0x2c6c4c), (a, c) => { a.rect(hex(0xa84c34), 5.18, 0, 10.06, 5.8); hoops(a, c); }), { density: 40 });
add('court-basketball-worn', 'バスケットコート 半面 色あせ', [15.24, 14.33], (t, s) => court(t, s, hex(0x6c6a68), hoops, hex(0xc8c088)), { density: 40 });
const tennis = (a: Art, c: RGB): void => {
  // Half of a court with its run-off: 18.29 wide by 18.29 deep, net at y = 18.29.
  const [x0, x1, y0] = [3.66, 14.63, 6.4];
  a.rect(hex(0x2c5c9c), x0, y0, x1, 18.29);
  for (const x of [x0, x1, x0 + 1.37, x1 - 1.37]) ln(a, c, x, y0, x, 18.29);
  ln(a, c, x0, y0, x1, y0, 0.1);
  ln(a, c, x0 + 1.37, 11.89, x1 - 1.37, 11.89);
  ln(a, c, 9.145, 11.89, 9.145, 18.29);
  ln(a, c, 9.145, y0, 9.145, y0 + 0.15);
};
add('court-tennis', 'テニスコート 半面 青/緑', [18.29, 18.29], (t, s) => court(t, s, hex(0x2c6c44), tennis), { density: 32 });
add('court-tennis-clay', 'テニスコート 半面 クレー', [18.29, 18.29], (t, s) => court(t, s, hex(0xa8583c), (a, c) => { tennis(a, c); a.rect(hex(0xa8583c), 3.66 + 0.03, 6.4 + 0.06, 3.66 + 1.37 - 0.03, 18.29, {}); }), { density: 32 });
add('safety-rubber-red', '遊び場のゴム舗装 赤', [1, 1], (t, s) => S.gravel(t, { seed: s, size: 0.014, colors: [hex(0x9c3c30), hex(0x8c3428), hex(0xa84438)], soil: [0.3, 0.12, 0.1] }), { ...tiled, density: 256 });
add('safety-rubber-green', '遊び場のゴム舗装 緑', [1, 1], (t, s) => S.gravel(t, { seed: s, size: 0.014, colors: [hex(0x3c7c4c), hex(0x346c40), hex(0x448c54)], soil: [0.12, 0.26, 0.15] }), { ...tiled, density: 256 });
add('safety-rubber-blue', '遊び場のゴム舗装 青', [1, 1], (t, s) => S.gravel(t, { seed: s, size: 0.014, colors: [hex(0x2c5c9c), hex(0x285088), hex(0x3468a8)], soil: [0.1, 0.2, 0.34] }), { ...tiled, density: 256 });
add('woodchips', '遊び場のウッドチップ', [1, 1], (t, s) => S.gravel(t, { seed: s, size: 0.03, colors: [hex(0x9c7448), hex(0x7c5834), hex(0xb48c5c), hex(0x64442c)], soil: [0.22, 0.15, 0.09] }), tiled);
add('track-red', '陸上トラック 赤', [2.44, 2], (t, s) => {
  const L = new Layers(t, hex(0xa8483c), 0.9);
  const grit = t.noise(0.01, 0.01, s, 2);
  const wear = t.noise(0.5, 0.5, s + 1, 3);
  t.map((x, y, k) => {
    const line = Math.min(x, 2.44 - x, Math.abs(x - 1.22)) < 0.025;
    const m = 0.86 + grit(x, y) * 0.2 - wear(x, y) * 0.1;
    const c = line ? WHITE : hex(0xa8483c);
    L.r[k] = c[0] * m;
    L.g[k] = c[1] * m;
    L.b[k] = c[2] * m;
    return 0;
  });
  return L.finish();
}, { tile: 'xy', density: 96 });
add('turf-lines', '人工芝 白線', [4, 4], (t, s) => { const a = new Art(t, hex(0x3c7c3c), 0.9); a.rect(hex(0x347034), 0, 0, 4, 2); a.rect(WHITE, 0, 1.94, 4, 2.06); return a.done(s, 0.1); }, { tile: 'xy', density: 64 });

// --- Signs and markers. ---
type SignDraw = (a: Art) => void;
const sign = (id: string, label: string, size: readonly [number, number], bg: number, draw: SignDraw, age = 0.2): void => add(`sign-${id}`, label, size, (t, s) => { const a = new Art(t, hex(bg), 0.5); draw(a); return a.done(s, age); }, { density: 320 });
const RED: RGB = hex(0xc0241c);
const NAVY: RGB = hex(0x1c2c5c);
sign('private', '看板 私有地', [0.45, 0.3], 0xf0eee6, (a) => { a.rect(RED, 0, 0.2, 0.45, 0.3); a.text(WHITE, 'PRIVATE', 0.225, 0.22, 0.06, { fit: 0.4 }); a.lines(BLACK, ['PROPERTY', 'NO TRESPASSING'], 0.225, 0.185, 0.045, { fit: 0.4 }); });
sign('beware-dog', '看板 猛犬注意', [0.45, 0.3], 0xe8c01c, (a) => { a.lines(BLACK, ['BEWARE', 'OF DOG'], 0.225, 0.27, 0.075, { fit: 0.4, weight: 0.13 }); });
sign('keep-out', '看板 立入禁止', [0.45, 0.3], 0xf0eee6, (a) => { a.rect(RED, 0, 0.19, 0.45, 0.3); a.text(WHITE, 'DANGER', 0.225, 0.215, 0.065, { fit: 0.4 }); a.text(BLACK, 'KEEP OUT', 0.225, 0.06, 0.075, { fit: 0.4, weight: 0.13 }); });
sign('no-parking-gate', '看板 門前駐車禁止', [0.45, 0.3], 0xf0eee6, (a) => { a.lines(RED, ['NO PARKING', 'ACTIVE DRIVEWAY'], 0.225, 0.26, 0.06, { fit: 0.4 }); a.text(BLACK, 'TOW AWAY ZONE', 0.225, 0.04, 0.04, { fit: 0.4 }); });
sign('cctv', '看板 監視カメラ作動中', [0.45, 0.3], 0xe8c01c, (a) => { a.lines(BLACK, ['24 HOUR', 'VIDEO SURVEILLANCE'], 0.225, 0.26, 0.055, { fit: 0.4 }); a.disc(BLACK, 0.225, 0.07, 0.035, {}); });
sign('for-sale', '看板 売地', [0.9, 0.6], 0xf0eee6, (a) => { a.rect(RED, 0, 0.4, 0.9, 0.6); a.text(WHITE, 'FOR SALE', 0.45, 0.435, 0.13, { fit: 0.8, weight: 0.12 }); a.lines(BLACK, ['COASTLINE REALTY', '555 0142'], 0.45, 0.36, 0.085, { fit: 0.8 }); }, 0.3);
sign('construction', '看板 工事現場', [1.2, 0.9], 0xf0eee6, (a) => { a.rect(hex(0xe8801c), 0, 0.68, 1.2, 0.9); a.text(BLACK, 'CONSTRUCTION SITE', 0.6, 0.73, 0.1, { fit: 1.1, weight: 0.12 }); a.lines(BLACK, ['HARD HATS REQUIRED', 'NO UNAUTHORIZED ENTRY', 'ALL VISITORS REPORT TO OFFICE'], 0.6, 0.6, 0.07, { fit: 1.1 }); }, 0.3);
sign('post-no-bills', '仮囲いの文字 POST NO BILLS', [1.6, 0.25], 0x1c4a8c, (a) => a.text(WHITE, 'POST NO BILLS', 0.8, 0.06, 0.13, { fit: 1.5, weight: 0.13 }), 0.4);
sign('lifeguard', '看板 ライフガード', [1.2, 0.4], 0xf0eee6, (a) => { a.text(RED, 'LIFEGUARD', 0.6, 0.1, 0.2, { fit: 1.1, weight: 0.13 }); });
sign('tower-number', '監視塔の番号', [0.6, 0.6], 0xf0eee6, (a) => a.text(NAVY, '14', 0.3, 0.12, 0.36, { weight: 0.13 }));
sign('beach-rules', '看板 海水浴場の注意', [0.9, 1.2], 0x1c5c9c, (a) => { a.text(WHITE, 'BEACH RULES', 0.45, 1.02, 0.1, { fit: 0.8, weight: 0.12 }); a.rect(WHITE, 0.06, 0.06, 0.84, 0.96); a.lines(NAVY, ['NO GLASS CONTAINERS', 'NO DOGS 9AM-5PM', 'NO FIRES', 'NO ALCOHOL', 'SWIM NEAR A LIFEGUARD', 'BEACH CLOSES 10PM'], 0.45, 0.9, 0.06, { fit: 0.72 }); }, 0.3);
sign('rip-current', '看板 離岸流注意', [0.6, 0.6], 0xe8c01c, (a) => { a.lines(BLACK, ['DANGER', 'RIP', 'CURRENTS'], 0.3, 0.54, 0.095, { fit: 0.52, weight: 0.13 }); });
sign('no-diving', '看板 飛込み禁止', [0.45, 0.6], 0xf0eee6, (a) => { a.ring(RED, 0.225, 0.38, 0.15, 0.022); a.line(RED, [[0.12, 0.49], [0.33, 0.27]], 0.02); a.lines(BLACK, ['NO DIVING', 'SHALLOW WATER'], 0.225, 0.19, 0.05, { fit: 0.4 }); });
sign('no-fishing', '看板 釣り禁止', [0.45, 0.6], 0xf0eee6, (a) => { a.ring(RED, 0.225, 0.38, 0.15, 0.022); a.line(RED, [[0.12, 0.49], [0.33, 0.27]], 0.02); a.lines(BLACK, ['NO FISHING', 'FROM PIER'], 0.225, 0.19, 0.05, { fit: 0.4 }); });
sign('pier-closed', '看板 桟橋 夜間閉鎖', [0.6, 0.45], 0xf0eee6, (a) => { a.rect(NAVY, 0, 0.3, 0.6, 0.45); a.text(WHITE, 'PIER HOURS', 0.3, 0.33, 0.08, { fit: 0.52 }); a.lines(BLACK, ['5 AM - 10 PM', 'NO BICYCLES OR SKATES'], 0.3, 0.27, 0.055, { fit: 0.52 }); });
sign('marina', '看板 マリーナ', [2.4, 0.6], 0x1c2c5c, (a) => { a.text(WHITE, 'DEL MAR MARINA', 1.2, 0.2, 0.26, { fit: 2.2, weight: 0.12 }); a.rect(hex(0xd8b040), 0.1, 0.08, 2.3, 0.11); }, 0.25);
sign('bait', '看板 釣具・えさ', [1.8, 0.5], 0xf0e6c8, (a) => { a.text(RED, 'BAIT & TACKLE', 0.9, 0.22, 0.2, { fit: 1.7, weight: 0.13 }); a.text(NAVY, 'ICE - SODA - RENTALS', 0.9, 0.06, 0.09, { fit: 1.6 }); }, 0.45);
sign('boat-ramp', '看板 ボートランプ', [0.6, 0.45], 0x1c5c3c, (a) => { a.lines(WHITE, ['BOAT RAMP', 'PERMIT REQUIRED'], 0.3, 0.38, 0.075, { fit: 0.52 }); });
sign('slip-numbers', '係留番号 A1〜A8', [2.4, 0.3], 0xf0eee6, (a) => { for (let i = 0; i < 8; i++) a.text(NAVY, `A${i + 1}`, 0.15 + i * 0.3, 0.07, 0.15, { weight: 0.13 }); });
sign('park-name', '看板 公園名', [2.4, 0.8], 0x3c2c20, (a) => { a.text(hex(0xe8dcb8), 'OCEANVIEW PARK', 1.2, 0.36, 0.26, { fit: 2.2, weight: 0.12 }); a.text(hex(0xe8dcb8), 'CITY PARKS & RECREATION', 1.2, 0.12, 0.1, { fit: 2 }); }, 0.35);
sign('park-rules', '看板 公園の注意', [0.6, 0.9], 0x1c5c3c, (a) => { a.text(WHITE, 'PARK RULES', 0.3, 0.76, 0.075, { fit: 0.52 }); a.lines(WHITE, ['OPEN DAWN TO DUSK', 'DOGS ON LEASH', 'NO LITTERING', 'NO AMPLIFIED MUSIC', 'NO OVERNIGHT CAMPING'], 0.3, 0.68, 0.05, { fit: 0.52 }); }, 0.35);
sign('playground-age', '看板 遊び場 対象年齢', [0.45, 0.6], 0xe8c01c, (a) => { a.lines(BLACK, ['PLAY AREA', 'AGES 5-12', 'ADULT', 'SUPERVISION', 'REQUIRED'], 0.225, 0.55, 0.055, { fit: 0.4 }); });
sign('parking-rates', '看板 駐車料金', [0.9, 1.2], 0x1c2c5c, (a) => { a.text(WHITE, 'PARKING', 0.45, 0.98, 0.14, { fit: 0.8, weight: 0.13 }); a.rect(WHITE, 0.06, 0.06, 0.84, 0.9); a.lines(NAVY, ['FIRST HOUR - 3', 'EACH ADDL - 2', 'DAILY MAX - 18', 'EVENING - 8', 'LOST TICKET - 25'], 0.45, 0.84, 0.065, { fit: 0.72 }); }, 0.25);
sign('parking-full', '看板 満車/空車', [0.9, 0.3], 0x141414, (a) => a.text(hex(0x40e060), 'OPEN', 0.45, 0.07, 0.16, { weight: 0.13 }), 0.05);
sign('ticket-machine', '駐車券発行機の正面', [0.4, 1.2], 0xd8a81c, (a) => { a.rect(BLACK, 0.06, 0.82, 0.34, 1.02); a.text(hex(0x40e060), 'PRESS', 0.2, 0.89, 0.06, { fit: 0.24 }); a.disc(hex(0x30c050), 0.2, 0.66, 0.05, {}); a.rect(BLACK, 0.1, 0.48, 0.3, 0.51); a.text(BLACK, 'TICKET', 0.2, 0.38, 0.05, { fit: 0.3 }); });
sign('clearance', '看板 高さ制限', [2.4, 0.3], 0xe8c01c, (a) => a.text(BLACK, "CLEARANCE 8'-2\"", 1.2, 0.07, 0.16, { fit: 2.2, weight: 0.13 }));
sign('tunnel-name', 'トンネル銘板', [2.4, 0.5], 0x3c5c48, (a) => { a.text(WHITE, 'MESA TUNNEL', 1.2, 0.18, 0.2, { fit: 2.2, weight: 0.12 }); a.text(WHITE, '1958', 1.2, 0.04, 0.09, {}); }, 0.4);
sign('watertower-name', '給水塔の文字', [8, 2.5], 0xe4e4e0, (a) => a.text(NAVY, 'DEL MAR', 4, 0.6, 1.3, { fit: 7.2, weight: 0.13 }), 0.3);
sign('danger-voltage', '看板 高圧危険', [0.45, 0.3], 0xf0eee6, (a) => { a.rect(RED, 0, 0.19, 0.45, 0.3); a.text(WHITE, 'DANGER', 0.225, 0.215, 0.065, { fit: 0.4 }); a.lines(BLACK, ['HIGH VOLTAGE', 'KEEP AWAY'], 0.225, 0.165, 0.05, { fit: 0.4 }); });
sign('plaque', '銘板 ブロンズ', [0.6, 0.4], 0x4a3a28, (a) => { a.frame(hex(0x8a6c40), 0.02); a.lines(hex(0xb89860), ['IN MEMORY OF', 'THE FOUNDERS', 'OF THIS CITY', '1887'], 0.3, 0.36, 0.05, { fit: 0.5 }); }, 0.3);
for (const [id, jp, c] of [['red', '赤(遊泳禁止)', 0xd02820], ['yellow', '黄(注意)', 0xe8c81c], ['green', '緑(遊泳可)', 0x28a048], ['purple', '紫(海洋生物注意)', 0x7c3c9c]] as [string, string, number][]) {
  add(`flag-${id}`, `海岸の旗 ${jp}`, [0.9, 0.6], (t, s) => fabric(t, s, hex(c), { fade: 0.25, dirt: 0.1 }), { density: 128 });
}
add('lifering', '救命浮輪', [0.76, 0.76], (t, s) => {
  const L = new Layers(t, hex(0xe8601c), 0.6, 0);
  const m = t.field();
  t.ring(m, 0.38, 0.38, 0.28, 0.095);
  L.paint(m, hex(0xe8601c), { alpha: true, height: 0.02 });
  const w = t.field();
  for (let i = 0; i < 4; i++) {
    const a0 = (i * Math.PI) / 2 + 0.55;
    t.stroke(w, arcPts(0.38, 0.38, 0.28, a0, a0 + 0.45, 8), 0.095);
  }
  for (let k = 0; k < t.n; k++) w[k] *= m[k];
  L.paint(w, WHITE, {});
  void s;
  return L.finish();
}, { cutout: true });
add('stripes-yellow-black', '警戒縞 黄黒', [0.6, 0.3], (t, s) => { const a = new Art(t, hex(0xe8c01c), 0.5); for (let x = -0.4; x < 0.8; x += 0.2) a.poly(BLACK, [[x, 0], [x + 0.1, 0], [x + 0.4, 0.3], [x + 0.3, 0.3]]); return a.done(s, 0.3); }, { tile: 'x' });
add('stripes-red-white', '警戒縞 赤白', [0.6, 0.3], (t, s) => { const a = new Art(t, WHITE, 0.5); for (let x = -0.4; x < 0.8; x += 0.2) a.poly(RED, [[x, 0], [x + 0.1, 0], [x + 0.4, 0.3], [x + 0.3, 0.3]]); return a.done(s, 0.3); }, { tile: 'x' });
add('reflector-strip', 'ガードレールの反射板', [0.3, 0.1], (t, s) => { const a = new Art(t, hex(0xe8e8e0), 0.3); a.rect(hex(0xe8c01c), 0.05, 0.02, 0.25, 0.08); return a.done(s, 0.1); }, { emissive: 0.15 });
add('tunnel-dark', 'トンネルの奥(暗がり)', [1, 1], (t) => new Layers(t, [0.012, 0.012, 0.014], 1).finish(), { tile: 'xy', density: 32 });
add('tunnel-lining', 'トンネル覆工 すす汚れ', [4, 4], (t, s) => { const L = S.concreteLayers(t, { seed: s, color: hex(0x8a867e), slab: [2, 0], finish: 'formwork', streaks: 1, dirt: 1, stains: 0.6 }); t.map((_x, y, k) => { const d = sstep(1.5, 4, y) * 0.55; L.r[k] *= 1 - d; L.g[k] *= 1 - d; L.b[k] *= 1 - d; return 0; }); return L.finish(); }, { tile: 'x', density: 64 });
add('tunnel-tile', 'トンネル内壁 タイル', [2, 2], (t, s) => S.masonry(t, { seed: s, block: [0.2, 0.1], colors: [hex(0xd8d4c4), hex(0xcec8b6), hex(0xc4bca8)], mortar: [0.3, 0.29, 0.27], streaks: 1 }), tiled);

export const SITE_TEXTURES: readonly TextureSpec[] = list;
