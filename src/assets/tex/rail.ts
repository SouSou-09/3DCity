import { Layers, RGB, TextureData, TextureSpec, Tex, clamp01, hash2, hex, lerp, sstep } from './core';
import { Art } from './furniture';
import * as S from './surfaces';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'emissive' | 'decal'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 41000 + list.length * 5;
  list.push({ id: `rail/${id}`, label, category: 'rail', meters, tile: 'none', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}
const tiled: Extra = { tile: 'xy', density: 128 };

const WHITE: RGB = hex(0xe8e6de);
const BLACK: RGB = hex(0x161616);
const CREAM: RGB = hex(0xe6dcc0);
const RUST: RGB = [0.33, 0.17, 0.08];
const OIL: RGB = [0.045, 0.04, 0.035];

// --- Ballast: crushed stone, each piece lit on a different facet, browned by brake dust and blackened by oil. ---
interface BallastOpts { size?: number; colors: readonly RGB[]; soil?: RGB; rust?: number; oil?: number; weeds?: number; cover?: number }
function ballast(tex: Tex, seed: number, o: BallastOpts): TextureData {
  const size = o.size ?? 0.055;
  const soil = o.soil ?? [0.13, 0.12, 0.11];
  const L = new Layers(tex, soil, 0.95);
  const stones = tex.cells(size, seed);
  const tone = tex.noise(0.9, 0.9, seed + 1, 3);
  const patch = tex.noise(0.5, 0.5, seed + 2, 3);
  const weedN = tex.noise(0.35, 0.35, seed + 3, 3);
  const bladeN = tex.noise(0.012, 0.05, seed + 4, 2);
  const [rust, oil, weeds, cover] = [o.rust ?? 0, o.oil ?? 0, o.weeds ?? 0, o.cover ?? 1];
  tex.map((x, y, k) => {
    const c = stones(x, y);
    const top = sstep(0, 0.45, c.f2 - c.f1);
    const col = o.colors[Math.floor(c.id * 997) % o.colors.length];
    const present = hash2(Math.floor(c.id * 65536), 9, seed) < cover ? 1 : 0;
    const m = (0.7 + ((c.id * 37) % 1) * 0.55) * (0.55 + 0.45 * top) * (1 + tone(x, y) * 0.12) * (1 + (hash2(k, 6, seed) - 0.5) * 0.1);
    const s = top * present;
    let r = lerp(soil[0] * 0.8, col[0] * m, s);
    let g = lerp(soil[1] * 0.8, col[1] * m, s);
    let b = lerp(soil[2] * 0.8, col[2] * m, s);
    const p = patch(x, y);
    const ru = clamp01(rust * (0.65 + p * 0.7));
    r *= lerp(1, 1.1, ru);
    g *= lerp(1, 0.8, ru);
    b *= lerp(1, 0.58, ru);
    const ol = clamp01(oil * sstep(-0.25, 0.45, -p));
    r *= 1 - ol * 0.72;
    g *= 1 - ol * 0.74;
    b *= 1 - ol * 0.75;
    const w = weeds > 0 ? sstep(0.5 - weeds * 0.5, 0.7 - weeds * 0.5, weedN(x, y)) * sstep(-0.25, 0.2, bladeN(x, y)) : 0;
    const dry = hash2(Math.floor(x / 0.02), Math.floor(y / 0.06), seed);
    L.r[k] = lerp(r, lerp(0.2, 0.42, dry), w);
    L.g[k] = lerp(g, lerp(0.3, 0.38, dry), w);
    L.b[k] = lerp(b, lerp(0.1, 0.2, dry), w);
    L.rough[k] = 0.95 - ol * 0.3;
    L.height[k] = s * size * 0.35 * (1 - c.f1) + w * 0.012;
    return 0;
  });
  return L.finish(0.8);
}
const GREY: RGB[] = [hex(0x74726f), hex(0x5c5956), hex(0x868280), hex(0x4c4a48)];
const GRANITE: RGB[] = [hex(0x8a7d78), hex(0x9c8e86), hex(0x6a605c), hex(0xa8a09a), hex(0x54504e)];
const BASALT: RGB[] = [hex(0x3c3d40), hex(0x4a4b4e), hex(0x2e2f31), hex(0x56575a)];
const LIME: RGB[] = [hex(0xa8a294), hex(0x928c7e), hex(0xb8b2a6), hex(0x7c776c)];
add('ballast-grey', 'バラスト 灰', [2, 2], (t, s) => ballast(t, s, { colors: GREY, rust: 0.15 }), tiled);
add('ballast-granite', 'バラスト 花崗岩', [2, 2], (t, s) => ballast(t, s, { colors: GRANITE, rust: 0.1 }), tiled);
add('ballast-basalt', 'バラスト 玄武岩', [2, 2], (t, s) => ballast(t, s, { colors: BASALT, rust: 0.2 }), tiled);
add('ballast-limestone', 'バラスト 石灰岩', [2, 2], (t, s) => ballast(t, s, { colors: LIME, rust: 0.2 }), tiled);
add('ballast-brown', 'バラスト 鉄粉で茶色', [2, 2], (t, s) => ballast(t, s, { colors: GREY, rust: 0.85 }), tiled);
add('ballast-oily', 'バラスト 油じみ', [2, 2], (t, s) => ballast(t, s, { colors: GREY, rust: 0.5, oil: 0.9 }), tiled);
add('ballast-weedy', 'バラスト 雑草', [2, 2], (t, s) => ballast(t, s, { colors: GRANITE, rust: 0.45, weeds: 0.55, cover: 0.9, soil: [0.2, 0.17, 0.12] }), tiled);
add('ballast-overgrown', 'バラスト 草に埋もれた廃線', [2, 2], (t, s) => ballast(t, s, { colors: LIME, rust: 0.6, weeds: 1, cover: 0.7, soil: [0.22, 0.18, 0.12] }), tiled);
add('ballast-cinder', '細かい燃えがら(側線)', [2, 2], (t, s) => ballast(t, s, { colors: BASALT, size: 0.022, rust: 0.35, oil: 0.3, cover: 0.85 }), tiled);
add('ballast-fine', '細粒の砕石(歩廊)', [2, 2], (t, s) => ballast(t, s, { colors: LIME, size: 0.025, rust: 0.1 }), tiled);

// --- Sleepers. The grain runs along x; four sleepers' worth of rows, so neighbours can differ. ---
function sleeperWood(tex: Tex, seed: number, color: RGB, age: number): TextureData {
  const L = new Layers(tex, color, 0.9);
  const grain = tex.noise(0.5, 0.006, seed, 3);
  const wide = tex.noise(1.3, 0.05, seed + 1, 2);
  const crack = tex.noise(0.7, 0.014, seed + 2, 3);
  const blot = tex.noise(0.35, 0.2, seed + 3, 3);
  const grey = (color[0] + color[1] + color[2]) / 3;
  tex.map((x, y, k) => {
    const g = grain(x, y) * 0.5 + wide(x, y) * 0.5;
    const split = sstep(0.42 - age * 0.25, 0.6 - age * 0.25, crack(x, y)) * (0.4 + age * 0.6);
    const seat = Math.min(Math.abs(x - 0.5475), Math.abs(x - 2.0525));
    const iron = sstep(0.3, 0.05, seat) * (0.5 + blot(x, y) * 0.5);
    const oil = sstep(0.5, 0.1, Math.abs(x - 1.3)) * sstep(-0.2, 0.4, blot(x, y)) * 0.5;
    const m = (1 + g * 0.45) * (1 - split * 0.75) * (1 - oil * 0.6);
    const fade = clamp01(age * (0.75 + blot(x, y) * 0.5));
    L.r[k] = lerp(lerp(color[0], grey * 1.35, fade), RUST[0], iron * 0.55) * m;
    L.g[k] = lerp(lerp(color[1], grey * 1.32, fade), RUST[1], iron * 0.55) * m;
    L.b[k] = lerp(lerp(color[2], grey * 1.3, fade), RUST[2], iron * 0.55) * m;
    L.rough[k] = 0.92 - oil * 0.3;
    L.height[k] = g * 0.002 - split * 0.008;
    return 0;
  });
  return L.finish();
}
function sleeperConcrete(tex: Tex, seed: number, stain: number): TextureData {
  const L = new Layers(tex, [0.6, 0.59, 0.56], 0.88);
  const fine = tex.noise(0.015, 0.015, seed, 2);
  const tone = tex.noise(0.5, 0.2, seed + 1, 3);
  const blot = tex.noise(0.3, 0.15, seed + 2, 3);
  tex.map((x, y, k) => {
    const seat = Math.min(Math.abs(x - 0.5475), Math.abs(x - 2.0525));
    const iron = sstep(0.42, 0.06, seat) * clamp01(0.35 + stain * 0.6 + blot(x, y) * 0.5);
    const oil = sstep(0.55, 0.1, Math.abs(x - 1.3)) * sstep(-0.3, 0.4, blot(x, y)) * stain;
    const m = (1 + fine(x, y) * 0.1 + tone(x, y) * 0.14) * (1 - oil * 0.6) * (1 - stain * 0.18);
    L.r[k] = lerp(0.6, 0.42, iron * 0.8) * m;
    L.g[k] = lerp(0.59, 0.27, iron * 0.8) * m;
    L.b[k] = lerp(0.56, 0.16, iron * 0.8) * m;
    L.height[k] = fine(x, y) * 0.0008;
    return 0;
  });
  return L.finish();
}
/** Rolled steel left to the weather: a brown crust that flakes, darker where grease has run. */
function rusted(tex: Tex, seed: number, color: RGB, flake: number, grease = 0): TextureData {
  const L = new Layers(tex, color, 0.85);
  const tone = tex.noise(0.25, 0.08, seed, 3);
  const pit = tex.noise(0.012, 0.012, seed + 1, 3, 0.6);
  const sc = tex.noise(0.06, 0.03, seed + 2, 3);
  const gr = tex.noise(0.4, 0.05, seed + 3, 2);
  tex.map((x, y, k) => {
    const f = sstep(0.1, 0.4, sc(x, y)) * flake;
    const g = clamp01(grease * (0.5 + gr(x, y)));
    const m = (1 + tone(x, y) * 0.3 + pit(x, y) * 0.22) * (1 - f * 0.4) * (1 - g * 0.6);
    L.r[k] = lerp(color[0], color[0] * 1.5 + 0.06, f * 0.6) * m;
    L.g[k] = lerp(color[1], color[1] * 1.25 + 0.02, f * 0.6) * m;
    L.b[k] = color[2] * m;
    L.rough[k] = 0.9 - g * 0.4;
    L.metal[k] = 0.25 * (1 - f);
    L.height[k] = pit(x, y) * 0.0006 - f * 0.0008;
    return 0;
  });
  return L.finish();
}
const SLEEPER: Extra = { tile: 'xy', density: 160 };
add('sleeper-wood-new', '木枕木 クレオソート', [2.6, 1.04], (t, s) => sleeperWood(t, s, hex(0x33261c), 0.1), SLEEPER);
add('sleeper-wood', '木枕木', [2.6, 1.04], (t, s) => sleeperWood(t, s, hex(0x493a2c), 0.4), SLEEPER);
add('sleeper-wood-old', '木枕木 灰色に風化', [2.6, 1.04], (t, s) => sleeperWood(t, s, hex(0x5a4c3e), 0.8), SLEEPER);
add('sleeper-wood-rotten', '木枕木 割れ・腐朽', [2.6, 1.04], (t, s) => sleeperWood(t, s, hex(0x4a4034), 1), SLEEPER);
add('sleeper-concrete', 'PC枕木', [2.6, 1.04], (t, s) => sleeperConcrete(t, s, 0.15), SLEEPER);
add('sleeper-concrete-stained', 'PC枕木 さび汚れ', [2.6, 1.04], (t, s) => sleeperConcrete(t, s, 0.75), SLEEPER);
add('sleeper-steel', '鉄枕木', [2.6, 1.04], (t, s) => rusted(t, s, [0.24, 0.14, 0.09], 0.6, 0.3), SLEEPER);

// --- Rails. The head is polished by wheels along a band; the web and foot rust. ---
function head(tex: Tex, seed: number, use: number): TextureData {
  const L = new Layers(tex, [0.26, 0.15, 0.09], 0.85);
  const tone = tex.noise(0.3, 0.02, seed, 3);
  const scratch = tex.noise(0.4, 0.002, seed + 1, 2);
  const edge = tex.noise(0.2, 0.01, seed + 2, 2);
  tex.map((x, y, k) => {
    const v = y / tex.mh;
    // The running band sits towards the gauge side of the head.
    const band = sstep(0.5 + edge(x, y) * 0.06, 0.34, Math.abs(v - 0.56)) * use;
    const m = 1 + tone(x, y) * 0.25;
    const steel = 0.62 + scratch(x, y) * 0.12;
    L.r[k] = lerp(0.27 * m, steel, band);
    L.g[k] = lerp(0.155 * m, steel, band);
    L.b[k] = lerp(0.09 * m, steel * 1.02, band);
    L.rough[k] = lerp(0.88, 0.28 + scratch(x, y) * 0.1, band);
    L.metal[k] = lerp(0.2, 1, band);
    return 0;
  });
  return L.finish(0.5);
}
const STEEL: Extra = { tile: 'xy', density: 256 };
add('head-bright', 'レール頭面 磨かれた本線', [1, 0.072], (t, s) => head(t, s, 1), { tile: 'x', density: 512 });
add('head-dull', 'レール頭面 使用の少ない側線', [1, 0.072], (t, s) => head(t, s, 0.45), { tile: 'x', density: 512 });
add('head-rusty', 'レール頭面 さびた廃線', [1, 0.072], (t, s) => head(t, s, 0), { tile: 'x', density: 512 });
add('steel-rust', 'レール側面 さび', [1, 0.25], (t, s) => rusted(t, s, [0.27, 0.155, 0.09], 0.5), STEEL);
add('steel-dark', 'レール側面 油とブレーキ粉', [1, 0.25], (t, s) => rusted(t, s, [0.17, 0.115, 0.085], 0.3, 0.6), STEEL);
add('steel-orange', 'レール側面 赤さび', [1, 0.25], (t, s) => rusted(t, s, [0.4, 0.2, 0.09], 0.9), STEEL);
add('steel-cast', '鋳鋼(フログ・転てつ機)', [0.5, 0.5], (t, s) => rusted(t, s, [0.13, 0.12, 0.115], 0.25, 0.5), STEEL);
add('conductor-rail', '第三軌条', [1, 0.25], (t, s) => rusted(t, s, [0.3, 0.2, 0.13], 0.3), STEEL);

/** Laid over the bed: rust washed off the rails to either side of them, oil dripped along the middle. */
function bedStain(tex: Tex, seed: number, rust: number, oil: number): TextureData {
  const L = new Layers(tex, RUST, 0.95, 0);
  const n = tex.noise(0.35, 0.6, seed, 3);
  const drip = tex.noise(0.12, 0.3, seed + 1, 3);
  const cx = tex.mw / 2;
  tex.map((x, y, k) => {
    const seat = Math.min(Math.abs(x - cx - 0.7525), Math.abs(x - cx + 0.7525));
    const ru = sstep(0.55, 0.05, seat) * clamp01(0.55 + n(x, y) * 0.6) * rust;
    const ol = sstep(0.5, 0.05, Math.abs(x - cx)) * sstep(-0.15, 0.35, drip(x, y)) * oil;
    const a = clamp01(Math.max(ru * 0.6, ol * 0.85));
    const q = ol / (ol + ru + 1e-4);
    L.r[k] = lerp(RUST[0], OIL[0], q);
    L.g[k] = lerp(RUST[1], OIL[1], q);
    L.b[k] = lerp(RUST[2], OIL[2], q);
    L.rough[k] = lerp(0.95, 0.5, q);
    L.alpha[k] = a;
    return 0;
  });
  return L.finish();
}
const STAIN: Extra = { decal: true, tile: 'y', density: 64 };
add('bed-stain-rust', '道床の汚れ さび', [3.4, 6], (t, s) => bedStain(t, s, 0.9, 0.15), STAIN);
add('bed-stain-mixed', '道床の汚れ さびと油', [3.4, 6], (t, s) => bedStain(t, s, 0.8, 0.7), STAIN);
add('bed-stain-oil', '道床の汚れ 停車位置の油', [3.4, 6], (t, s) => bedStain(t, s, 0.6, 1.2), STAIN);
add('bed-stain-light', '道床の汚れ 薄い', [3.4, 6], (t, s) => bedStain(t, s, 0.45, 0.1), STAIN);

/** Grooved tram rail set flush in the street: bright head, dark flangeway, a strip of sealant either side. */
function tramRail(tex: Tex, seed: number, worn: number): TextureData {
  const L = new Layers(tex, [0.1, 0.1, 0.1], 0.8);
  const tone = tex.noise(0.3, 0.02, seed, 2);
  tex.map((x, y, k) => {
    const v = y / tex.mh;
    const headBand = sstep(0.2, 0.24, v) * sstep(0.56, 0.52, v);
    const groove = sstep(0.58, 0.6, v) * sstep(0.76, 0.74, v);
    const lip = sstep(0.76, 0.78, v) * sstep(0.88, 0.86, v);
    const steel = 0.6 + tone(x, y) * 0.1;
    const rust = 0.2 * (1 + tone(x, y) * 0.3);
    let c = 0.1;
    c = lerp(c, lerp(rust, steel, worn), headBand);
    c = lerp(c, 0.03, groove);
    c = lerp(c, rust, lip);
    L.r[k] = c * (headBand + lip > 0.5 && worn < 0.5 ? 1.3 : 1);
    L.g[k] = c;
    L.b[k] = c * (lip > 0.5 ? 0.7 : 1);
    L.rough[k] = lerp(0.85, 0.3, headBand * worn);
    L.metal[k] = headBand * worn;
    L.height[k] = -groove * 0.03;
    return 0;
  });
  return L.finish();
}
add('tram-rail', '路面電車の溝付きレール', [1, 0.18], (t, s) => tramRail(t, s, 1), { tile: 'x', density: 384 });
add('tram-rail-rusty', '路面電車の溝付きレール 休止線', [1, 0.18], (t, s) => tramRail(t, s, 0.15), { tile: 'x', density: 384 });

// --- Level crossing surfaces between and beside the rails. ---
function rubberPanel(tex: Tex, seed: number, wear: number): TextureData {
  const L = new Layers(tex, [0.075, 0.075, 0.078], 0.8);
  const tone = tex.noise(0.4, 0.4, seed, 3);
  const dust = tex.noise(0.15, 0.15, seed + 1, 3);
  const bolts = tex.field();
  for (const bx of [0.12, tex.mw - 0.12]) for (const by of [0.15, tex.mh / 2, tex.mh - 0.15]) tex.disc(bolts, bx, by, 0.022, 1, 0.004);
  tex.map((x, y, k) => {
    const d = Math.abs(((x + y) / 0.05) % 1 - 0.5) < 0.2 || Math.abs((((x - y) / 0.05) % 1 + 1) % 1 - 0.5) < 0.2 ? 1 : 0;
    const joint = sstep(0.012, 0.004, Math.min(y, tex.mh - y)) + sstep(0.01, 0.003, Math.min(x, tex.mw - x));
    const du = clamp01(wear * (0.5 + dust(x, y) * 0.8) + (1 - d) * 0.25 * wear);
    const m = (1 + tone(x, y) * 0.2) * (1 - joint * 0.7) * (0.85 + d * 0.3) * (1 - bolts[k] * 0.5);
    L.r[k] = lerp(0.075, 0.33, du) * m;
    L.g[k] = lerp(0.075, 0.3, du) * m;
    L.b[k] = lerp(0.078, 0.26, du) * m;
    L.height[k] = d * 0.002 - joint * 0.01 - bolts[k] * 0.006;
    return 0;
  });
  return L.finish();
}
function concretePanel(tex: Tex, seed: number, stain: number): TextureData {
  const L = S.concreteLayers(tex, { seed, finish: 'broom', dirt: 0.25 + stain * 0.5, stains: stain, cracks: stain * 0.4 });
  const frame = tex.field();
  const lug = tex.field();
  const e = 0.035;
  tex.rect(frame, 0, 0, tex.mw, e);
  tex.rect(frame, 0, tex.mh - e, tex.mw, tex.mh);
  tex.rect(frame, 0, 0, e, tex.mh);
  tex.rect(frame, tex.mw - e, 0, tex.mw, tex.mh);
  for (const lx of [0.3, tex.mw - 0.3]) for (const ly of [0.4, tex.mh - 0.4]) tex.disc(lug, lx, ly, 0.035, 1, 0.005);
  const n = tex.noise(0.1, 0.1, seed + 7, 3);
  L.paint(frame, (k) => [0.3 + n(k % tex.w * tex.px, Math.floor(k / tex.w) * tex.py) * 0.08, 0.17, 0.1], { rough: 0.85, metal: 0.3, height: 0.002 });
  L.paint(lug, [0.08, 0.075, 0.07], { height: -0.01 });
  return L.finish();
}
add('xing-timber', '踏切の敷板 木', [1.29, 3], (t, s) => S.planks(t, { seed: s, width: 0.215, color: hex(0x3c2e22), weathered: 0.25 }), tiled);
add('xing-timber-old', '踏切の敷板 木・風化', [1.29, 3], (t, s) => S.planks(t, { seed: s, width: 0.215, color: hex(0x54483c), weathered: 0.75 }), tiled);
add('xing-rubber', '踏切の敷板 ゴム', [1.29, 0.9], (t, s) => rubberPanel(t, s, 0.25), tiled);
add('xing-rubber-worn', '踏切の敷板 ゴム・土ぼこり', [1.29, 0.9], (t, s) => rubberPanel(t, s, 0.8), tiled);
add('xing-concrete', '踏切の敷板 コンクリート', [1.29, 2.4], (t, s) => concretePanel(t, s, 0.2), tiled);
add('xing-concrete-stained', '踏切の敷板 コンクリート・汚れ', [1.29, 2.4], (t, s) => concretePanel(t, s, 0.8), tiled);

// --- Platforms. ---
/** Edge of a platform, u along it and the track at the top: coping with a painted line or a stencilled warning. */
function platformEdge(tex: Tex, seed: number, o: { line?: RGB; text?: string; granite?: boolean; wear: number }): TextureData {
  const L = S.concreteLayers(tex, { seed, color: o.granite ? [0.62, 0.6, 0.58] : [0.66, 0.65, 0.62], finish: o.granite ? 'exposed' : 'smooth', slab: [1.2, 0], joint: 'tooled', dirt: 0.2 + o.wear * 0.4, stains: o.wear * 0.6, gum: 3 });
  const chip = tex.noise(0.05, 0.05, seed + 5, 3);
  const scuff = tex.noise(0.3, 0.04, seed + 6, 3);
  if (o.line) {
    const m = tex.field();
    tex.rect(m, 0, tex.mh - 0.2, tex.mw, tex.mh - 0.08);
    if (o.text) {
      const A = new Art(tex, [0, 0, 0]);
      A.text([1, 1, 1], o.text, tex.mw / 2, 0.08, 0.14, { fit: tex.mw - 0.6 });
      for (let k = 0; k < tex.n; k++) m[k] = Math.max(m[k], A.L.r[k]);
    }
    tex.map((x, y, k) => (m[k] *= clamp01(1.15 - o.wear * (0.5 + sstep(-0.1, 0.4, chip(x, y)) * 0.9))), m);
    L.paint(m, o.line, { rough: 0.6, height: 0.0006 });
  }
  // Brake dust blown up over the lip, and shoe scuffs along it.
  tex.map((x, y, k) => {
    const lip = sstep(tex.mh - 0.12, tex.mh, y) * (0.25 + o.wear * 0.4) + sstep(0.2, 0.6, scuff(x, y)) * 0.12 * o.wear;
    L.r[k] *= 1 - lip * 0.5;
    L.g[k] *= 1 - lip * 0.58;
    L.b[k] *= 1 - lip * 0.66;
    return 0;
  });
  return L.finish();
}
const YELLOW: RGB = hex(0xe0b020);
const EDGE: Extra = { tile: 'x', density: 192 };
add('edge-plain', 'ホーム縁 コンクリート', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.5 }), EDGE);
add('edge-granite', 'ホーム縁 御影石', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.3, granite: true }), EDGE);
add('edge-line-white', 'ホーム縁 白線', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.4, line: WHITE }), EDGE);
add('edge-line-yellow', 'ホーム縁 黄線', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.3, line: YELLOW }), EDGE);
add('edge-line-yellow-worn', 'ホーム縁 黄線・すり減り', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.9, line: YELLOW }), EDGE);
add('edge-text-gap', 'ホーム縁 WATCH THE GAP', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.35, line: YELLOW, text: 'WATCH THE GAP' }), EDGE);
add('edge-text-behind', 'ホーム縁 STAND BEHIND LINE', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.5, line: WHITE, text: 'STAND BEHIND LINE' }), EDGE);
add('edge-text-worn', 'ホーム縁 文字・すり減り', [4.8, 0.5], (t, s) => platformEdge(t, s, { wear: 0.95, line: YELLOW, text: 'WATCH THE GAP' }), EDGE);

/** Wall below the platform edge: brake dust and oil thrown up from the track darken its foot. */
function platformFace(tex: Tex, seed: number, kind: 'concrete' | 'brick' | 'block' | 'timber'): TextureData {
  const base: TextureData =
    kind === 'brick' ? S.masonry(tex, { seed, block: [0.215, 0.075], colors: [hex(0x7a4434), hex(0x6a3a2e), hex(0x8a5040), hex(0x5c342c)], mortar: [0.5, 0.48, 0.44], streaks: 0.5 })
    : kind === 'block' ? S.masonry(tex, { seed, block: [0.4, 0.2], colors: [hex(0x8c8a84), hex(0x7e7c78), hex(0x9a9892)], mortar: [0.55, 0.54, 0.5], streaks: 0.6 })
    : kind === 'timber' ? S.planks(tex, { seed, width: 0.2, color: hex(0x4a3a2a), weathered: 0.5 })
    : S.concrete(tex, { seed, finish: 'formwork', dirt: 0.5, streaks: 0.7, stains: 0.4 });
  const n = tex.noise(0.5, 0.3, seed + 11, 3);
  const st = tex.noise(0.05, 0.6, seed + 12, 3);
  const a = base.albedo;
  for (let j = 0; j < base.h; j++) {
    for (let i = 0; i < base.w; i++) {
      const [x, y] = [(i + 0.5) * tex.px, tex.mh - (j + 0.5) * tex.py];
      const v = y / tex.mh;
      const d = clamp01(sstep(0.75, 0.05, v) * (0.5 + n(x, y) * 0.5) + sstep(0.1, 0.6, st(x, y)) * 0.25 + sstep(0.94, 1, v) * 0.35);
      const k = (j * base.w + i) * 4;
      a[k] = lerp(a[k], a[k] * 0.42 + 14, d);
      a[k + 1] = lerp(a[k + 1], a[k + 1] * 0.36 + 9, d);
      a[k + 2] = lerp(a[k + 2], a[k + 2] * 0.3 + 5, d);
    }
  }
  return base;
}
const FACE: Extra = { tile: 'x', density: 128 };
add('platform-face-concrete', 'ホーム側面 コンクリート', [4, 1.3], (t, s) => platformFace(t, s, 'concrete'), FACE);
add('platform-face-brick', 'ホーム側面 レンガ', [3.87, 1.275], (t, s) => platformFace(t, s, 'brick'), FACE);
add('platform-face-block', 'ホーム側面 ブロック', [4, 1.2], (t, s) => platformFace(t, s, 'block'), FACE);
add('platform-face-timber', 'ホーム側面 木', [4, 1.3], (t, s) => platformFace(t, s, 'timber'), FACE);

// --- Signs. ---
const BLUE: RGB = hex(0x1c3f8a);
const GREEN: RGB = hex(0x1f4a30);
const RED: RGB = hex(0xb8201c);
const AMBER: RGB = hex(0xffa820);
const LINES: RGB[] = [hex(0xd8302a), hex(0x2a6cc8), hex(0x2c9a48), hex(0xe89a1c), hex(0x8a3c9c), hex(0xd8c020)];
export const STATIONS = ['central', 'harbor', 'old-town', 'mesa-heights', 'palm-ave', 'civic-center', 'del-mar', 'eastgate'] as const;
export const NAME_STYLES = ['blue', 'white', 'green', 'black'] as const;
type NameStyle = (typeof NAME_STYLES)[number];
function nameBoard(tex: Tex, seed: number, name: string, style: NameStyle, line: RGB): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const bg = style === 'blue' ? BLUE : style === 'white' ? WHITE : style === 'green' ? GREEN : BLACK;
  const fg = style === 'white' ? BLACK : style === 'green' ? CREAM : WHITE;
  const A = new Art(tex, bg, 0.35);
  if (style === 'white') A.rect(line, 0, 0, w, h * 0.2);
  if (style === 'black') {
    A.disc(line, h * 0.5, h * 0.5, h * 0.3);
    A.text(WHITE, name[0], h * 0.5, h * 0.36, h * 0.28);
    A.text(fg, name, (w + h * 0.9) / 2, h * 0.34, h * 0.34, { fit: w - h * 1.2 });
  } else {
    A.text(fg, name, w / 2, h * (style === 'white' ? 0.42 : 0.33), h * 0.36, { fit: w - 0.24 });
  }
  if (style === 'blue' || style === 'green') A.frame(fg, 0.022);
  return A.done(seed, style === 'green' ? 0.45 : 0.2);
}
STATIONS.forEach((id, i) => {
  const name = id.replace(/-/g, ' ').toUpperCase();
  for (const style of NAME_STYLES) add(`name-${id}-${style}`, `駅名標 ${name} ${{ blue: '青', white: '白', green: '緑', black: '黒' }[style]}`, [2.4, 0.6], (t, s) => nameBoard(t, s, name, style, LINES[i % LINES.length]));
});
for (let n = 1; n <= 4; n++) {
  add(`track-${n}`, `番線標 ${n}`, [0.6, 0.6], (t, s) => {
    const A = new Art(t, BLUE, 0.35);
    A.text(WHITE, 'TRACK', 0.3, 0.42, 0.09);
    A.text(WHITE, String(n), 0.3, 0.08, 0.28);
    A.frame(WHITE, 0.015);
    return A.done(s, 0.2);
  });
}
/** Wayfinding strip: an arrow pointing left or right, then the words. */
function wayfinding(tex: Tex, seed: number, bg: RGB, fg: RGB, text: string, arrow: -1 | 0 | 1): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const A = new Art(tex, bg, 0.35);
  if (arrow) {
    const cx = arrow < 0 ? h * 0.5 : w - h * 0.5;
    const [a, t] = [h * 0.28 * arrow, h * 0.07];
    A.poly(fg, [[cx - a, h / 2 - t], [cx, h / 2 - t], [cx, h / 2 - t * 3], [cx + a, h / 2], [cx, h / 2 + t * 3], [cx, h / 2 + t], [cx - a, h / 2 + t]]);
  }
  const x0 = arrow < 0 ? h : 0.06;
  const x1 = arrow > 0 ? w - h : w - 0.06;
  A.text(fg, text, (x0 + x1) / 2, h * 0.31, h * 0.38, { fit: x1 - x0 - 0.06 });
  return A.done(seed, 0.15);
}
const WAYS: [string, string, RGB, RGB, string, -1 | 0 | 1][] = [
  ['exit', '出口', hex(0x1e7a3c), WHITE, 'EXIT', 1], ['exit-left', '出口 左', hex(0x1e7a3c), WHITE, 'EXIT', -1], ['tickets', 'きっぷ売り場', BLACK, WHITE, 'TICKETS', 1],
  ['trains', '乗り場', BLACK, WHITE, 'TO TRAINS', -1], ['tracks-1-2', '1・2番線', BLUE, WHITE, 'TRACKS 1-2', 1], ['tracks-3-4', '3・4番線', BLUE, WHITE, 'TRACKS 3-4', -1],
  ['elevator', 'エレベーター', BLACK, WHITE, 'ELEVATOR', 1], ['restrooms', 'お手洗い', BLACK, WHITE, 'RESTROOMS', -1], ['downtown', '都心方面', WHITE, BLACK, 'DOWNTOWN', -1], ['outbound', '郊外方面', WHITE, BLACK, 'OUTBOUND', 1],
  ['bus', 'バス乗り場', hex(0xe8b020), BLACK, 'BUSES', 1], ['parking', '駐車場', BLUE, WHITE, 'PARKING', -1],
];
for (const [id, jp, bg, fg, text, arrow] of WAYS) add(`way-${id}`, `案内サイン ${jp}`, [1.6, 0.36], (t, s) => wayfinding(t, s, bg, fg, text, arrow));

/** Notice with a coloured header band over black lettering on white. */
function notice(tex: Tex, seed: number, header: string, band: RGB, lines: string[], age = 0.25): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const A = new Art(tex, WHITE, 0.4);
  A.rect(band, 0.02, h * 0.68, w - 0.02, h - 0.02);
  A.text(WHITE, header, w / 2, h * 0.74, h * 0.16, { fit: w - 0.08, weight: 0.1 });
  const size = Math.min(0.075, (h * 0.56) / (lines.length * 1.45));
  A.lines(BLACK, lines, w / 2, h * 0.63, size, { fit: w - 0.07 });
  A.frame(BLACK, 0.008);
  return A.done(seed, age);
}
add('warn-no-trespassing', '警告 立入禁止', [0.6, 0.45], (t, s) => notice(t, s, 'DANGER', RED, ['NO TRESPASSING', 'RAILROAD PROPERTY']));
add('warn-tracks', '警告 線路横断禁止', [0.6, 0.45], (t, s) => notice(t, s, 'WARNING', hex(0xe07a18), ['DO NOT CROSS', 'TRACKS']));
add('warn-high-voltage', '警告 高電圧', [0.6, 0.45], (t, s) => notice(t, s, 'DANGER', RED, ['HIGH VOLTAGE', 'OVERHEAD WIRES']));
add('warn-third-rail', '警告 第三軌条', [0.6, 0.45], (t, s) => notice(t, s, 'DANGER', RED, ['ELECTRIFIED', 'THIRD RAIL']));
add('warn-look', '注意 左右確認', [0.6, 0.45], (t, s) => notice(t, s, 'CAUTION', hex(0xd8a818), ['LOOK BOTH WAYS', 'TRAINS FROM', 'EITHER DIRECTION']));
add('warn-emergency', '踏切の緊急連絡先', [0.6, 0.45], (t, s) => notice(t, s, 'REPORT EMERGENCY', BLUE, ['OR PROBLEM TO', '1-800-555-0142', 'CROSSING 748 213 K']));
add('warn-old', '警告 立入禁止・色あせ', [0.6, 0.45], (t, s) => notice(t, s, 'DANGER', RED, ['NO TRESPASSING', 'RAILROAD PROPERTY'], 0.9));
/** Lineside board with a few large characters. */
function board(tex: Tex, seed: number, bg: RGB, fg: RGB, lines: string[], frame = true, age = 0.3): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const A = new Art(tex, bg, 0.4);
  const size = Math.min((h * 0.72) / (lines.length * 1.4), 0.34);
  A.lines(fg, lines, w / 2, h / 2 + (lines.length * size * 1.45) / 2 + size * 0.1, size, { fit: w - 0.08, weight: 0.09 });
  if (frame) A.frame(fg, 0.012);
  return A.done(seed, age);
}
for (const v of [15, 25, 40, 60, 79]) add(`speed-${v}`, `速度制限標 ${v}`, [0.5, 0.6], (t, s) => board(t, s, hex(0xe8c020), BLACK, [String(v)]));
for (const v of [12, 47, 103]) add(`mile-${v}`, `距離標 ${v}`, [0.3, 0.5], (t, s) => board(t, s, WHITE, BLACK, [String(v)], false, 0.5));
add('whistle', '汽笛吹鳴標 W', [0.45, 0.45], (t, s) => board(t, s, WHITE, BLACK, ['W'], false));
add('yard-limit', '構内限界標', [0.6, 0.45], (t, s) => board(t, s, hex(0xe8c020), BLACK, ['YARD', 'LIMIT']));
add('end-of-track', '線路終端標', [0.6, 0.45], (t, s) => board(t, s, RED, WHITE, ['END', 'OF TRACK']));
add('stop-here', '停止位置目標', [0.45, 0.45], (t, s) => board(t, s, BLUE, WHITE, ['4', 'CAR']));
add('signal-plate', '信号機の番号札', [0.3, 0.18], (t, s) => board(t, s, BLACK, WHITE, ['A 214'], false));
add('buffer-stripes', '車止めの赤白しま', [1.2, 0.3], (t, s) => {
  const A = new Art(t, WHITE, 0.45);
  for (let x = -0.3; x < 1.5; x += 0.3) A.poly(RED, [[x, 0], [x + 0.15, 0], [x + 0.45, 0.3], [x + 0.3, 0.3]]);
  return A.done(s, 0.5);
});

/** Dot-matrix departure board: rows of amber characters on black. */
function departures(tex: Tex, seed: number, rows: string[][], cols: number[]): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const A = new Art(tex, [0.012, 0.012, 0.014], 0.3);
  const rh = (h - 0.06) / rows.length;
  rows.forEach((r, j) => {
    const y = h - 0.03 - (j + 1) * rh + rh * 0.25;
    r.forEach((s, i) => A.text(j === 0 ? hex(0xb0b0b0) : AMBER, s, 0.05 + cols[i] * (w - 0.1), y, rh * 0.5, { align: 'l', weight: 0.1 }));
  });
  const L = A.L;
  // Break the strokes into dots.
  tex.map((x, y, k) => {
    const d = Math.abs((x / 0.008) % 1 - 0.5) < 0.36 && Math.abs((y / 0.008) % 1 - 0.5) < 0.36 ? 1 : 0.25;
    L.r[k] *= d;
    L.g[k] *= d;
    L.b[k] *= d;
    return 0;
  });
  void seed;
  return L.finish();
}
const DEP: [string, string[][]][] = [
  ['1', [['TIME', 'DESTINATION', 'TRK'], ['8:12', 'HARBOR', '2'], ['8:19', 'MESA HEIGHTS', '1'], ['8:27', 'DEL MAR', '2'], ['8:41', 'EASTGATE', '1']]],
  ['2', [['TIME', 'DESTINATION', 'TRK'], ['17:05', 'CENTRAL', '1'], ['17:18', 'OLD TOWN', '3'], ['17:30', 'CIVIC CENTER', '2'], ['DELAYED', 'PALM AVE', '4']]],
  ['3', [['TIME', 'DESTINATION', 'TRK'], ['23:40', 'CENTRAL', '1'], ['0:10', 'HARBOR', '2'], ['LAST TRAIN', '', ''], ['', '', '']]],
];
for (const [id, rows] of DEP) add(`departures-${id}`, `発車標 ${id}`, [1.8, 0.7], (t, s) => departures(t, s, rows, [0, 0.3, 0.88]), { emissive: 0.9, density: 384 });
add('next-train', '接近表示 NEXT TRAIN', [1.4, 0.26], (t, s) => departures(t, s, [['NEXT TRAIN 4 MIN']], [0.02]), { emissive: 0.9, density: 384 });
add('next-train-arriving', '接近表示 ARRIVING', [1.4, 0.26], (t, s) => departures(t, s, [['TRAIN ARRIVING']], [0.08]), { emissive: 0.9, density: 384 });

/** Front of a ticket machine: header, lit screen, keypad, slots and a tray. */
function tvm(tex: Tex, seed: number, body: RGB, on: boolean): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const A = new Art(tex, body, 0.4, 0.3);
  A.rect(BLACK, 0.05, h - 0.3, w - 0.05, h - 0.06);
  A.text(WHITE, 'TICKETS', w / 2, h - 0.23, 0.11, { fit: w - 0.2 });
  A.rect([0.02, 0.02, 0.025], 0.12, h - 0.82, w - 0.12, h - 0.38, { rough: 0.15 });
  if (on) {
    A.rect(hex(0x2a5cc0), 0.14, h - 0.8, w - 0.14, h - 0.4, { rough: 0.15 });
    A.text(WHITE, 'SELECT FARE', w / 2, h - 0.5, 0.05, { fit: w - 0.34 });
    for (let i = 0; i < 3; i++) A.rect(hex(0xe8e8e8), 0.18 + i * ((w - 0.36) / 3), h - 0.74, 0.18 + (i + 0.85) * ((w - 0.36) / 3), h - 0.6);
  }
  for (let i = 0; i < 12; i++) A.rect(hex(0x2a2a2c), 0.14 + (i % 3) * 0.075, h - 1.02 - Math.floor(i / 3) * 0.06, 0.2 + (i % 3) * 0.075, h - 0.97 - Math.floor(i / 3) * 0.06, { metal: 0.6 });
  A.rect([0.02, 0.02, 0.02], w - 0.38, h - 0.95, w - 0.14, h - 0.92);
  A.rect(hex(0x1e7a3c), w - 0.4, h - 1.0, w - 0.12, h - 0.97);
  A.rect([0.02, 0.02, 0.02], w - 0.38, h - 1.1, w - 0.3, h - 1.04);
  A.disc(hex(0xb8b8b8), w - 0.2, h - 1.07, 0.03, { metal: 0.9 });
  A.rect([0.015, 0.015, 0.015], 0.14, h - 1.5, w - 0.14, h - 1.3, { height: -0.01 });
  A.rect(hex(0x9a9a9a), 0.14, h - 1.32, w - 0.14, h - 1.3, { metal: 0.8 });
  A.text(WHITE, 'CASH  CARD', w / 2, h - 1.62, 0.045, { fit: w - 0.3 });
  A.frame([body[0] * 0.5, body[1] * 0.5, body[2] * 0.5], 0.02);
  return A.done(seed, 0.25);
}
add('tvm-blue', '券売機 青', [0.9, 1.85], (t, s) => tvm(t, s, hex(0x24509c), true), { emissive: 0.25 });
add('tvm-red', '券売機 赤', [0.9, 1.85], (t, s) => tvm(t, s, hex(0xa82a22), true), { emissive: 0.25 });
add('tvm-steel', '券売機 ステンレス', [0.9, 1.85], (t, s) => tvm(t, s, hex(0x9a9c9e), true), { emissive: 0.25 });
add('tvm-off', '券売機 故障中', [0.9, 1.85], (t, s) => tvm(t, s, hex(0x24509c), false));
add('validator', 'ICカード読取機', [0.26, 0.4], (t, s) => {
  const A = new Art(t, hex(0x2a2c30), 0.35);
  A.disc(hex(0x2a6cc8), 0.13, 0.24, 0.085);
  A.ring(WHITE, 0.13, 0.24, 0.06, 0.006);
  A.text(WHITE, 'TAP', 0.13, 0.215, 0.05);
  A.rect([0.02, 0.05, 0.02], 0.05, 0.05, 0.21, 0.11);
  A.text(hex(0x40e060), 'GO', 0.13, 0.062, 0.035);
  return A.done(s, 0.15);
}, { emissive: 0.2 });
add('gate-side', '自動改札機の側面', [1.4, 1], (t, s) => {
  const A = new Art(t, hex(0xa0a2a4), 0.3, 0.8);
  A.rect(hex(0x2a2c30), 0, 0.88, 1.4, 1, { metal: 0.2 });
  A.rect(hex(0x38383c), 0, 0, 1.4, 0.08, { metal: 0.2 });
  A.rect(hex(0x1e7a3c), 0.06, 0.9, 0.2, 0.98, { metal: 0 });
  for (let x = 0.35; x < 1.3; x += 0.45) A.line(hex(0x707274), [[x, 0.1], [x, 0.86]], 0.003);
  return A.done(s, 0.2);
});
add('gate-top', '自動改札機の天板', [1.4, 0.3], (t, s) => {
  const A = new Art(t, hex(0x2a2c30), 0.35, 0.2);
  A.rect(hex(0x2a6cc8), 0.1, 0.08, 0.34, 0.22, { metal: 0 });
  A.text(WHITE, 'TAP', 0.22, 0.125, 0.05);
  A.rect([0.01, 0.01, 0.01], 0.5, 0.13, 0.7, 0.17);
  A.poly(hex(0x40e060), [[1.1, 0.1], [1.2, 0.1], [1.2, 0.06], [1.3, 0.15], [1.2, 0.24], [1.2, 0.2], [1.1, 0.2]]);
  return A.done(s, 0.15);
}, { emissive: 0.15 });
add('gate-flap', '自動改札機の扉', [0.3, 0.45], (t, s) => {
  const A = new Art(t, hex(0xd84a20), 0.3);
  A.ring(WHITE, 0.15, 0.25, 0.07, 0.012);
  A.rect(WHITE, 0.09, 0.238, 0.21, 0.262);
  return A.done(s, 0.1);
});
/** System map: coloured lines with station dots and an interchange. */
function routeMap(tex: Tex, seed: number, title: string): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const A = new Art(tex, WHITE, 0.4);
  A.rect(BLUE, 0, h - 0.14, w, h);
  A.text(WHITE, title, w / 2, h - 0.105, 0.065, { fit: w - 0.1 });
  const mid: [number, number] = [w * 0.5, h * 0.45];
  LINES.slice(0, 5).forEach((c, i) => {
    const a = (i / 5) * Math.PI + 0.3 + hash2(i, 1, seed) * 0.3;
    const [dx, dy] = [Math.cos(a) * w * 0.44, Math.sin(a) * (h * 0.36)];
    const k1 = hash2(i, 2, seed) * 0.5 - 0.25;
    const pts: [number, number][] = [[mid[0] - dx, mid[1] - dy], [mid[0] - dx * 0.45, mid[1] - dy * 0.45 + k1 * 0.1], mid, [mid[0] + dx * 0.5, mid[1] + dy * 0.5 - k1 * 0.1], [mid[0] + dx, mid[1] + dy]];
    A.line(c, pts, 0.012);
    for (let j = 0; j < pts.length - 1; j++) {
      for (const q of [0, 0.5]) {
        const [px, py] = [lerp(pts[j][0], pts[j + 1][0], q), lerp(pts[j][1], pts[j + 1][1], q)];
        A.disc(WHITE, px, py, 0.014);
        A.ring(BLACK, px, py, 0.014, 0.003);
      }
    }
  });
  A.disc(WHITE, mid[0], mid[1], 0.03);
  A.ring(BLACK, mid[0], mid[1], 0.03, 0.006);
  A.rect(hex(0xb8d4e8), 0.03, 0.03, w * 0.3, 0.09);
  A.frame(hex(0x404040), 0.012);
  return A.done(seed, 0.2);
}
add('map-system', '路線図', [1.2, 0.9], (t, s) => routeMap(t, s, 'METRO RAIL SYSTEM MAP'));
add('map-system-lit', '路線図・内照', [1.2, 0.9], (t, s) => routeMap(t, s, 'RAIL AND BUS CONNECTIONS'), { emissive: 0.45 });
add('timetable', '時刻表', [0.6, 0.9], (t, s) => {
  const A = new Art(t, WHITE, 0.45);
  A.rect(RED, 0, 0.78, 0.6, 0.9);
  A.text(WHITE, 'SCHEDULE', 0.3, 0.81, 0.055);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 5; c++) if (hash2(r, c, s) > 0.12) A.rect(hex(0x303030), 0.05 + c * 0.105, 0.72 - r * 0.043, 0.05 + c * 0.105 + 0.07, 0.735 - r * 0.043);
  for (let r = 0; r < 16; r += 2) A.rect(hex(0xdcdcd4), 0.03, 0.713 - r * 0.043, 0.57, 0.742 - r * 0.043, { opacity: 0.5 });
  A.frame(hex(0x404040), 0.01);
  return A.done(s, 0.3);
});
function roundel(tex: Tex, seed: number, bg: RGB, letter: string, ring: RGB): TextureData {
  const A = new Art(tex, [0.05, 0.05, 0.05], 0.35);
  const c = tex.mw / 2;
  A.disc(ring, c, c, c);
  A.disc(bg, c, c, c * 0.86);
  A.text(WHITE, letter, c, c * 0.58, c * 0.85, { weight: 0.13 });
  return A.done(seed, 0.15);
}
add('logo-metro', 'メトロのロゴ M', [0.9, 0.9], (t, s) => roundel(t, s, BLUE, 'M', WHITE), { emissive: 0.3 });
add('logo-rail', '鉄道のロゴ R', [0.9, 0.9], (t, s) => roundel(t, s, RED, 'R', WHITE), { emissive: 0.3 });
add('logo-transit', '交通局のロゴ T', [0.9, 0.9], (t, s) => roundel(t, s, hex(0x1e7a3c), 'T', hex(0xe8c020)));
/** Entrance fascia: the word, then a bullet for each line that calls. */
function entrance(tex: Tex, seed: number, word: string, n: number): TextureData {
  const [w, h] = [tex.mw, tex.mh];
  const A = new Art(tex, BLACK, 0.35);
  A.text(WHITE, word, (w - n * h * 0.7) / 2, h * 0.3, h * 0.42, { fit: w - n * h * 0.7 - 0.2 });
  for (let i = 0; i < n; i++) {
    const cx = w - (i + 0.6) * h * 0.7;
    A.disc(LINES[(i + seed) % LINES.length], cx, h / 2, h * 0.28);
    A.text(WHITE, 'ABCDEF'[(i + seed) % 6], cx, h * 0.37, h * 0.26);
  }
  return A.done(seed, 0.2);
}
add('entrance-metro', '出入口の看板 METRO', [3, 0.5], (t, s) => entrance(t, s, 'METRO', 3), { emissive: 0.3 });
add('entrance-subway', '出入口の看板 SUBWAY', [3, 0.5], (t, s) => entrance(t, s, 'SUBWAY', 2), { emissive: 0.3 });
add('entrance-station', '駅舎の看板 UNION STATION', [6, 0.7], (t, s) => {
  const A = new Art(t, hex(0x2a2420), 0.5);
  A.text(hex(0xd8b060), 'UNION STATION', 3, 0.2, 0.34, { fit: 5.6, weight: 0.09 });
  return A.done(s, 0.3);
});
add('entrance-depot', '駅舎の看板 RAILROAD DEPOT', [4, 0.5], (t, s) => {
  const A = new Art(t, GREEN, 0.5);
  A.text(CREAM, 'RAILROAD DEPOT', 2, 0.15, 0.22, { fit: 3.7 });
  A.frame(CREAM, 0.02);
  return A.done(s, 0.5);
});

export const RAIL_TEXTURES: readonly TextureSpec[] = list;
