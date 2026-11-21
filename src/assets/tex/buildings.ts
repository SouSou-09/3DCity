import { Layers, RGB, TextureCategory, TextureData, TextureSpec, Tex, clamp01, hash2, hex, lerp, sstep } from './core';
import * as S from './surfaces';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'reflect'>>;
function add(category: TextureCategory, id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 20000 + list.length * 7;
  list.push({ id: `${category}/${id}`, label, category, meters, tile: 'xy', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}
const grey = (c: RGB): number => (c[0] + c[1] + c[2]) / 3;

// --- Brick. ---
type Bond = 'running' | 'common' | 'flemish' | 'stack';
interface BrickOpts {
  colors: readonly RGB[];
  mortar?: RGB;
  bond?: Bond;
  /** Soot and rain streaks, 0..1. */
  soot?: number;
  /** Painted over, with `peel` (0..1) of the coat gone. */
  paint?: RGB;
  peel?: number;
  /** White salt bloom, 0..1. */
  bloom?: number;
}
const BW = 0.21;
const BH = 0.075;
function brick(tex: Tex, seed: number, o: BrickOpts): TextureData {
  const L = new Layers(tex, [0.5, 0.5, 0.5], 0.92);
  const mortar = o.mortar ?? [0.6, 0.57, 0.52];
  const bond = o.bond ?? 'running';
  const rows = Math.round(tex.mh / BH);
  const mottle = tex.noise(0.5, 0.5, seed + 1, 3);
  const face = tex.noise(0.02, 0.012, seed + 2, 3);
  const sootN = tex.noise(0.7, 1.5, seed + 3, 3);
  const streak = tex.noise(0.06, 1.5, seed + 4, 2);
  const peelN = tex.noise(0.16, 0.16, seed + 5, 4, 0.6);
  const bloomN = tex.noise(0.45, 0.3, seed + 6, 3);
  const grit = tex.noise(0.004, 0.004, seed + 7);
  tex.map((x, y, k) => {
    const row = Math.floor(y / BH);
    const fy = y / BH - row;
    // Position along the course in brick lengths, and the brick's ends there.
    let s = x / BW;
    let a: number;
    let len = 1;
    if (bond === 'flemish') {
      s = (s + (row % 2) * 0.75) % (tex.mw / BW);
      const p = s % 1.5;
      a = s - p + (p < 1 ? 0 : 1);
      len = p < 1 ? 1 : 0.5;
    } else if (bond === 'common' && row % 5 === 4) {
      s += 0.25;
      a = Math.floor(s * 2) / 2;
      len = 0.5;
    } else {
      s += bond === 'stack' ? 0 : (row % 2) * 0.5;
      a = Math.floor(s);
    }
    const fx = (s - a) / len;
    const col = Math.round(a * 2) % Math.round((tex.mw / BW) * 2);
    const id = hash2(col, row % rows, seed);
    const pick = hash2(col, row % rows, seed + 11);
    const c = o.colors[Math.floor(pick * o.colors.length) % o.colors.length];
    const d = Math.min(fx * len * BW, (1 - fx) * len * BW, fy * BH, (1 - fy) * BH);
    const chip = face(x, y) * 0.0025;
    const joint = 1 - sstep(0.004 + chip, 0.0075 + chip, d);
    let m = 1 + (id - 0.5) * 0.34 + mottle(x, y) * 0.1 + face(x, y) * 0.1 + grit(x, y) * 0.05;
    // Kiln marks: a darker core on some bricks.
    if (id > 0.8) m *= 1 - 0.25 * sstep(0.2, 0.5, Math.min(fx, 1 - fx)) * sstep(0.15, 0.5, Math.min(fy, 1 - fy));
    let r = lerp(c[0] * m, mortar[0] * (1 + grit(x, y) * 0.08), joint);
    let g = lerp(c[1] * m, mortar[1] * (1 + grit(x, y) * 0.08), joint);
    let b = lerp(c[2] * m, mortar[2] * (1 + grit(x, y) * 0.08), joint);
    let rough = 0.92;
    if (o.paint) {
      const gone = sstep(0.55 - (o.peel ?? 0) * 0.5, 0.6 - (o.peel ?? 0) * 0.5, peelN(x, y) * 0.9 + 0.5 + joint * 0.05 - face(x, y) * 0.1);
      const pm = (1 + mottle(x, y) * 0.06) * (1 - joint * 0.22);
      r = lerp(o.paint[0] * pm, r, gone);
      g = lerp(o.paint[1] * pm, g, gone);
      b = lerp(o.paint[2] * pm, b, gone);
      rough = lerp(0.7, 0.92, gone);
    }
    if (o.bloom) {
      const w = o.bloom * sstep(0.1, 0.6, bloomN(x, y)) * (1 - joint) * 0.5;
      r = lerp(r, 0.86, w);
      g = lerp(g, 0.84, w);
      b = lerp(b, 0.8, w);
    }
    const soot = (o.soot ?? 0.15) * clamp01(0.25 + sootN(x, y) * 0.9 + sstep(0, 0.6, streak(x, y)) * 0.5);
    r *= 1 - soot * 0.55;
    g *= 1 - soot * 0.57;
    b *= 1 - soot * 0.56;
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.rough[k] = rough;
    L.height[k] = (1 - joint) * (0.006 + (id - 0.5) * 0.003 + face(x, y) * 0.0015) * (o.paint ? 0.8 : 1);
    return 0;
  });
  return L.finish();
}
const REDS: RGB[] = [hex(0x8a3f2e), hex(0x7a3626), hex(0x99503a), hex(0x6c2f22), hex(0x91493a)];
const BROWNS: RGB[] = [hex(0x6b4838), hex(0x5a3c2e), hex(0x7b5844), hex(0x4c342a)];
const BUFFS: RGB[] = [hex(0xb89a6e), hex(0xa98a60), hex(0xc4a87e), hex(0x9c7e58)];
const YELLOWS: RGB[] = [hex(0xc2a25a), hex(0xb4944e), hex(0xcdb06c)];
const DARKS: RGB[] = [hex(0x4a3a36), hex(0x3e302e), hex(0x574440), hex(0x5c3a30)];
const ORANGES: RGB[] = [hex(0xa8573a), hex(0x9a4c30), hex(0xb86846), hex(0x8c4630)];
const MULTI: RGB[] = [hex(0x8a3f2e), hex(0x5a3c2e), hex(0xa8573a), hex(0x4a3a36), hex(0x99503a)];
const GREYB: RGB[] = [hex(0x8a8882), hex(0x7c7a76), hex(0x969490)];
const BRICKS: [string, string, BrickOpts, Bond?][] = [
  ['red', '赤', { colors: REDS }],
  ['red-common', '赤・アメリカ積み', { colors: REDS, bond: 'common', soot: 0.3 }],
  ['red-flemish', '赤・フランス積み', { colors: [...REDS, hex(0x3e302e)], bond: 'flemish' }],
  ['red-sooty', '赤・煤けた', { colors: REDS, soot: 0.75, bloom: 0.5 }],
  ['orange', 'オレンジ', { colors: ORANGES, mortar: [0.66, 0.62, 0.55] }],
  ['brown', '茶', { colors: BROWNS, mortar: [0.45, 0.42, 0.38] }],
  ['brown-common', '茶・アメリカ積み', { colors: BROWNS, bond: 'common', soot: 0.35 }],
  ['buff', '淡黄', { colors: BUFFS, mortar: [0.7, 0.67, 0.6] }],
  ['buff-sooty', '淡黄・煤けた', { colors: BUFFS, soot: 0.7 }],
  ['yellow', '黄', { colors: YELLOWS, bond: 'common' }],
  ['dark', '焦げ茶', { colors: DARKS, mortar: [0.4, 0.38, 0.36] }],
  ['multi', '混色', { colors: MULTI, bond: 'flemish' }],
  ['grey', 'グレー', { colors: GREYB, bond: 'stack', mortar: [0.5, 0.5, 0.5] }],
  ['painted-white', '白塗り', { colors: REDS, paint: hex(0xdcd8cc), peel: 0.12 }],
  ['painted-white-peeling', '白塗り・剥がれ', { colors: REDS, paint: hex(0xd6d2c6), peel: 0.6, soot: 0.3 }],
  ['painted-cream', 'クリーム塗り', { colors: BROWNS, paint: hex(0xd8c8a0), peel: 0.1 }],
  ['painted-grey', 'グレー塗り', { colors: BROWNS, paint: hex(0x7c8084), peel: 0.2 }],
  ['painted-blue', '青塗り・剥がれ', { colors: REDS, paint: hex(0x44688c), peel: 0.45 }],
  ['painted-green', '緑塗り', { colors: REDS, paint: hex(0x4c6e58), peel: 0.25 }],
  ['painted-black', '黒塗り', { colors: REDS, paint: hex(0x242426), peel: 0.08 }],
  ['painted-red', '赤塗り', { colors: BROWNS, paint: hex(0x8e2c24), peel: 0.3 }],
];
for (const [id, label, o] of BRICKS) add('wall', `brick-${id}`, `レンガ壁 ${label}`, o.bond === 'flemish' ? [1.89, 1.5] : [1.68, 1.5], (t, s) => brick(t, s, o), { density: 320 });

// --- Stucco and render. ---
interface StuccoOpts {
  color: RGB;
  finish?: 'sand' | 'dash' | 'lace' | 'smooth';
  stains?: number;
  cracks?: number;
  /** Repainted rectangles in a slightly different shade (covered graffiti), 0..1. */
  patches?: number;
}
function stucco(tex: Tex, seed: number, o: StuccoOpts): TextureData {
  const L = new Layers(tex, o.color, 0.93);
  const finish = o.finish ?? 'sand';
  const fine = tex.noise(0.012, 0.012, seed, 2);
  const lump = tex.noise(0.05, 0.05, seed + 1, 3);
  const cell = tex.cells(finish === 'lace' ? 0.09 : 0.02, seed + 2);
  const tone = tex.noise(1, 1, seed + 3, 3);
  const streak = tex.noise(0.09, 2, seed + 4, 3);
  const damp = tex.noise(0.8, 0.5, seed + 5, 3);
  const crackA = tex.noise(1, 1.4, seed + 6, 3, 0.55);
  const crackB = tex.noise(0.08, 0.08, seed + 7, 2);
  const patchN = tex.noise(1.2, 0.9, seed + 8, 1);
  const stains = o.stains ?? 0.3;
  tex.map((x, y, k) => {
    let h: number;
    if (finish === 'lace') {
      const c = cell(x, y);
      h = sstep(0.08, 0.2, c.f2 - c.f1) * 0.003 * (c.id > 0.35 ? 1 : 0.15) + fine(x, y) * 0.0006;
    } else if (finish === 'dash') {
      const c = cell(x, y);
      h = (1 - c.f1) * 0.004 + fine(x, y) * 0.001;
    } else h = fine(x, y) * (finish === 'smooth' ? 0.0004 : 0.0012) + lump(x, y) * (finish === 'smooth' ? 0.001 : 0.002);
    let m = 1 + tone(x, y) * 0.07 + h * 30;
    const st = stains * (sstep(0.05, 0.7, streak(x, y)) * 0.5 + sstep(0.1, 0.8, damp(x, y)) * 0.35);
    const patch = (o.patches ?? 0) > 0 && patchN(Math.floor(x / 0.6) * 0.6 + 0.3, Math.floor(y / 0.45) * 0.45 + 0.2) > 0.42 - (o.patches ?? 0) * 0.3 ? 1 : 0;
    if (patch) m *= 1.07;
    const crack = (o.cracks ?? 0) * (1 - sstep(0.004, 0.012 + 0.004 * (o.cracks ?? 0), Math.abs(crackA(x, y) + crackB(x, y) * 0.035)));
    L.r[k] = o.color[0] * m * (1 - st * 0.42) * (1 - crack * 0.6);
    L.g[k] = o.color[1] * m * (1 - st * 0.45) * (1 - crack * 0.6);
    L.b[k] = o.color[2] * m * (1 - st * 0.5 - patch * 0.03) * (1 - crack * 0.6);
    L.height[k] = h - crack * 0.003;
    return 0;
  });
  return L.finish();
}
const STUCCO: [string, string, number, Partial<StuccoOpts>?][] = [
  ['white', '白', 0xe4e0d6], ['white-stained', '白・雨だれ', 0xdcd8cc, { stains: 1, cracks: 0.6 }], ['cream', 'クリーム', 0xe0d0a8], ['cream-lace', 'クリーム・レース仕上げ', 0xdccba4, { finish: 'lace' }],
  ['sand', '砂色', 0xc8b088], ['sand-old', '砂色・ひび', 0xbca680, { stains: 0.9, cracks: 1, patches: 0.6 }], ['peach', 'ピーチ', 0xe2b490], ['pink', 'ピンク', 0xdca0a0, { finish: 'lace' }],
  ['salmon-old', 'サーモン・退色', 0xcc9884, { stains: 0.9, cracks: 0.7 }], ['terracotta', 'テラコッタ', 0xb86a48], ['ochre', '黄土', 0xcc9c48], ['yellow', '淡い黄', 0xe4d080, { finish: 'dash' }],
  ['mint', 'ミント', 0xa8cdb4], ['teal', 'ティール', 0x4c9490, { stains: 0.5 }], ['sky', '水色', 0x9cc0d8], ['blue', '青', 0x4870a0, { finish: 'smooth' }],
  ['lavender', 'ラベンダー', 0xb0a4cc], ['sage', 'セージ', 0x94a484], ['olive', 'オリーブ', 0x7c7c50, { stains: 0.6 }], ['grey', 'グレー', 0x9c9c98, { finish: 'smooth' }],
  ['grey-patched', 'グレー・塗り直し跡', 0x94948e, { patches: 1, stains: 0.7 }], ['charcoal', 'チャコール', 0x4a4c50, { finish: 'smooth' }], ['brown', '茶', 0x7c5c44, { finish: 'dash' }], ['beige-patched', 'ベージュ・塗り直し跡', 0xcab894, { patches: 1, stains: 0.8, cracks: 0.4 }],
];
for (const [id, label, c, o] of STUCCO) add('wall', `stucco-${id}`, `スタッコ ${label}`, [3, 3], (t, s) => stucco(t, s, { color: hex(c), ...o }), { density: 170 });

// --- Concrete. ---
const CONC: [string, string, Omit<S.ConcreteOpts, 'seed'>][] = [
  ['concrete-panel', 'PCコンクリート板', { slab: [1.5, 3], finish: 'smooth', joint: 'sawcut', dirt: 0.3, streaks: 0.6 }],
  ['concrete-panel-stained', 'PCコンクリート板・雨だれ', { slab: [1.5, 3], finish: 'smooth', joint: 'expansion', dirt: 0.8, streaks: 1.3, cracks: 0.3 }],
  ['concrete-formwork', '打ち放し(Pコン)', { slab: [1.5, 1.5], finish: 'formwork', joint: 'sawcut', dirt: 0.35, streaks: 0.7 }],
  ['concrete-boards', '打ち放し(杉板)', { finish: 'boards', dirt: 0.4, streaks: 0.8 }],
  ['concrete-exposed', '洗い出し骨材パネル', { slab: [1.5, 3], finish: 'exposed', joint: 'expansion', color: [0.62, 0.58, 0.5], dirt: 0.4, streaks: 0.6 }],
  ['concrete-white', '白いPC板', { slab: [3, 1.5], finish: 'smooth', joint: 'sawcut', color: [0.82, 0.81, 0.78], dirt: 0.2, streaks: 0.5 }],
  ['concrete-tiltup', 'ティルトアップ壁(倉庫)', { slab: [3, 0], finish: 'broom', joint: 'expansion', color: [0.7, 0.68, 0.63], dirt: 0.5, streaks: 0.9, stains: 0.3 }],
  ['concrete-dark', '濃色コンクリート', { slab: [1.5, 3], finish: 'smooth', joint: 'sawcut', color: [0.36, 0.36, 0.37], dirt: 0.3, streaks: 0.5 }],
];
for (const [id, label, o] of CONC) add('wall', id, label, [3, 3], (t, s) => S.concrete(t, { ...o, seed: s }), { density: 170 });

/** Vertical ribs or fluting cast into concrete, with streaks running down the grooves. */
function ribbed(tex: Tex, seed: number, color: RGB, pitch: number, depth: number, round: boolean): TextureData {
  const L = new Layers(tex, color, 0.9);
  const tone = tex.noise(0.6, 0.6, seed, 3);
  const streak = tex.noise(pitch, 1.6, seed + 1, 3);
  const fine = tex.noise(0.01, 0.01, seed + 2, 2);
  tex.map((x, y, k) => {
    const f = (x / pitch) % 1;
    const p = round ? Math.sin(f * Math.PI) : sstep(0.08, 0.2, f) * (1 - sstep(0.5, 0.62, f));
    const st = sstep(0, 0.7, streak(x, y)) * (1 - p) * 0.5;
    const m = (1 + tone(x, y) * 0.08 + fine(x, y) * 0.05) * (0.8 + p * 0.2) * (1 - st);
    L.r[k] = color[0] * m;
    L.g[k] = color[1] * m;
    L.b[k] = color[2] * m * (1 - st * 0.1);
    L.height[k] = p * depth + fine(x, y) * 0.0006;
    return 0;
  });
  return L.finish();
}
add('wall', 'concrete-ribbed', 'リブ付きコンクリート', [2.4, 2.4], (t, s) => ribbed(t, s, [0.6, 0.59, 0.56], 0.12, 0.03, false), { density: 200 });
add('wall', 'concrete-ribbed-dark', 'リブ付きコンクリート・濃色', [2.4, 2.4], (t, s) => ribbed(t, s, [0.4, 0.39, 0.38], 0.2, 0.04, false), { density: 200 });
add('wall', 'concrete-fluted', '縦溝コンクリート', [2.4, 2.4], (t, s) => ribbed(t, s, [0.74, 0.71, 0.64], 0.08, 0.02, true), { density: 200 });

// --- Stone cladding. ---
interface StoneOpts {
  colors: readonly RGB[];
  block: readonly [number, number];
  finish: 'polished' | 'honed' | 'rusticated';
  veins?: number;
  speckle?: number;
  stagger?: boolean;
  streaks?: number;
}
function stone(tex: Tex, seed: number, o: StoneOpts): TextureData {
  const L = new Layers(tex, o.colors[0], 0.8);
  const [bw, bh] = o.block;
  const nx = Math.max(1, Math.round(tex.mw / bw));
  const ny = Math.max(1, Math.round(tex.mh / bh));
  const cloud = tex.noise(0.5, 0.35, seed, 4, 0.55);
  const vein = tex.noise(0.6, 0.25, seed + 1, 4, 0.6);
  const warp = tex.noise(0.2, 0.2, seed + 2, 2);
  const speck = tex.cells(0.006, seed + 3);
  const bump = tex.noise(bw * 0.25, bh * 0.35, seed + 4, 4, 0.6);
  const streak = tex.noise(0.1, 1.8, seed + 5, 2);
  const polished = o.finish === 'polished';
  const rust = o.finish === 'rusticated';
  tex.map((x, y, k) => {
    const row = Math.floor(y / bh);
    const s = x / bw + (o.stagger && row % 2 ? 0.5 : 0);
    const col = Math.floor(s);
    const fx = s - col;
    const fy = y / bh - row;
    const d = Math.min(fx * bw, (1 - fx) * bw, fy * bh, (1 - fy) * bh);
    const idc = hash2(col % nx, row % ny, seed);
    const c = o.colors[Math.floor(hash2(col % nx, row % ny, seed + 9) * o.colors.length) % o.colors.length];
    const jw = rust ? 0.02 : 0.004;
    const joint = 1 - sstep(jw * 0.5, jw, d);
    // Each slab is cut from a different part of the block: shift the pattern per slab.
    const ox = idc * 5;
    const v = (o.veins ?? 0) * (1 - sstep(0.0, 0.05, Math.abs(vein(x + ox, y + warp(x, y) * 0.1))));
    const sp = (o.speckle ?? 0) * (speck(x, y).id - 0.5);
    let m = 1 + (idc - 0.5) * 0.14 + cloud(x + ox, y) * 0.16 + sp * 0.5 - v * 0.3;
    m *= 1 - sstep(0.1, 0.8, streak(x, y)) * (o.streaks ?? 0.3) * 0.4;
    const dark = joint * (rust ? 0.45 : 0.6);
    L.r[k] = c[0] * m * (1 - dark);
    L.g[k] = c[1] * m * (1 - dark);
    L.b[k] = c[2] * m * (1 - dark);
    L.rough[k] = polished ? 0.12 + joint * 0.6 : rust ? 0.95 : 0.7;
    L.height[k] = rust ? sstep(0, 0.045, d) * (0.02 + bump(x, y) * 0.012) : -joint * 0.002;
    return 0;
  });
  return L.finish();
}
const LIME: RGB[] = [hex(0xc8bea6), hex(0xbdb39a), hex(0xd0c7b0)];
const SANDST: RGB[] = [hex(0xb89a70), hex(0xa88c64), hex(0xc4a67c)];
const BROWNST: RGB[] = [hex(0x6c4a3a), hex(0x604234), hex(0x785444)];
const GRAN: RGB[] = [hex(0x74747a), hex(0x68686e), hex(0x808084)];
const STONES: [string, string, readonly [number, number], StoneOpts, number?][] = [
  ['limestone', '石灰岩の切石', [2.4, 2.4], { colors: LIME, block: [0.8, 0.4], finish: 'honed', stagger: true, speckle: 0.1 }],
  ['limestone-sooty', '石灰岩・煤けた', [2.4, 2.4], { colors: LIME.map((c) => [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8] as RGB), block: [0.8, 0.4], finish: 'honed', stagger: true, streaks: 1.6 }],
  ['limestone-rusticated', '石灰岩・ルスティカ積み', [2.4, 2.4], { colors: LIME, block: [0.8, 0.4], finish: 'rusticated', stagger: true }],
  ['sandstone', '砂岩の切石', [2.4, 2.4], { colors: SANDST, block: [0.6, 0.3], finish: 'honed', stagger: true, speckle: 0.15 }],
  ['sandstone-rusticated', '砂岩・ルスティカ積み', [2.4, 2.4], { colors: SANDST, block: [0.8, 0.4], finish: 'rusticated', stagger: true }],
  ['brownstone', 'ブラウンストーン', [2.4, 2.4], { colors: BROWNST, block: [1.2, 0.4], finish: 'honed', stagger: true, streaks: 0.8 }],
  ['granite-grey', '御影石パネル・灰', [2.4, 2.4], { colors: GRAN, block: [1.2, 0.6], finish: 'polished', speckle: 0.5 }],
  ['granite-black', '御影石パネル・黒', [2.4, 2.4], { colors: [hex(0x232428), hex(0x1c1d20), hex(0x2a2b30)], block: [1.2, 1.2], finish: 'polished', speckle: 0.4 }],
  ['granite-red', '御影石パネル・赤', [2.4, 2.4], { colors: [hex(0x7a4438), hex(0x6e3c32), hex(0x844c40)], block: [1.2, 0.6], finish: 'polished', speckle: 0.6 }],
  ['marble-white', '大理石パネル・白', [2.4, 2.4], { colors: [hex(0xdedcd4), hex(0xd4d2ca)], block: [1.2, 1.2], finish: 'polished', veins: 0.7 }],
  ['marble-green', '大理石パネル・緑', [2.4, 2.4], { colors: [hex(0x2c4a3c), hex(0x264236)], block: [0.8, 1.2], finish: 'polished', veins: -0.9 }],
  ['travertine', 'トラバーチン', [2.4, 2.4], { colors: [hex(0xd0c0a0), hex(0xc6b696)], block: [1.2, 0.6], finish: 'honed', veins: 0.35, stagger: true }],
];
for (const [id, label, m, o] of STONES) add('wall', `stone-${id}`, label, m, (t, s) => stone(t, s, o), { density: 200, ...(o.finish === 'polished' ? { reflect: 0.5 } : {}) });

// --- Timber and vinyl siding. ---
interface SidingOpts {
  color: RGB;
  kind: 'lap' | 'shingle' | 'batten' | 'vinyl' | 'plywood';
  /** Visible height of one board or course. */
  size?: number;
  /** Share of the paint that has flaked off, 0..1. */
  peel?: number;
  /** Unpainted: stained or weathered wood. */
  bare?: boolean;
}
function siding(tex: Tex, seed: number, o: SidingOpts): TextureData {
  const L = new Layers(tex, o.color, 0.75);
  const vertical = o.kind === 'batten' || o.kind === 'plywood';
  const size = o.size ?? (o.kind === 'shingle' ? 0.14 : vertical ? 0.3 : 0.115);
  const n = Math.max(1, Math.round((vertical ? tex.mw : tex.mh) / size));
  const w = (vertical ? tex.mw : tex.mh) / n;
  const grain = vertical ? tex.noise(0.006, 0.6, seed, 3) : tex.noise(0.6, 0.006, seed, 3);
  const tone = tex.noise(0.7, 0.7, seed + 1, 3);
  const peelN = tex.noise(0.1, 0.1, seed + 2, 4, 0.6);
  const streak = tex.noise(0.07, 1.6, seed + 3, 2);
  const wood: RGB = [0.42, 0.37, 0.31];
  tex.map((x, y, k) => {
    const [across, along] = vertical ? [x, y] : [y, x];
    const i = Math.floor(across / w);
    const f = across / w - i;
    const id = hash2(i, 5, seed);
    let h: number;
    let shadow: number;
    let cid = id;
    if (o.kind === 'lap' || o.kind === 'vinyl') {
      // Each board leans out at the bottom and tucks under the one above.
      h = (1 - f) * 0.012;
      shadow = sstep(0.86, 1, f) * 0.5 + (o.kind === 'vinyl' ? sstep(0.44, 0.5, f) * (1 - sstep(0.5, 0.56, f)) * 0.25 : 0);
      const end = (along + id * 3.7) % 3.6;
      shadow += o.kind === 'lap' ? (1 - sstep(0, 0.004, Math.min(end, 3.6 - end))) * 0.5 : 0;
    } else if (o.kind === 'shingle') {
      const sw = 0.1 + hash2(i, 6, seed) * 0.02;
      const s = along / sw + id * 7;
      const j = Math.floor(s);
      const fx = s - j;
      cid = hash2(i, j % Math.max(1, Math.round(tex.mw / sw)), seed + 7);
      const gap = 1 - sstep(0.02, 0.06, Math.min(fx, 1 - fx));
      h = (1 - f) * 0.01 + (cid - 0.5) * 0.003 - gap * 0.006;
      shadow = sstep(0.84, 1, f) * 0.55 + gap * 0.5;
    } else if (o.kind === 'batten') {
      const bat = 1 - sstep(0.07, 0.085, Math.min(f, 1 - f));
      h = bat * 0.018;
      shadow = sstep(0.085, 0.12, Math.min(f, 1 - f)) < 1 && !bat ? 0.35 : 0;
    } else {
      // Grooved plywood (T1-11).
      const groove = 1 - sstep(0.02, 0.035, Math.min(f, 1 - f));
      h = -groove * 0.008;
      shadow = groove * 0.5;
    }
    const gr = grain(vertical ? x + id * 3 : x, vertical ? y : y + id * 3);
    let m = (1 + (cid - 0.5) * (o.bare || o.kind === 'shingle' ? 0.3 : 0.06) + gr * (o.bare ? 0.25 : 0.05) + tone(x, y) * 0.06) * (1 - shadow * 0.7);
    m *= 1 - sstep(0.1, 0.8, streak(x, y)) * 0.12;
    const gone = o.bare ? 0 : sstep(0.6 - (o.peel ?? 0) * 0.55, 0.64 - (o.peel ?? 0) * 0.55, peelN(x, y) * 0.9 + 0.5 + gr * 0.12);
    L.r[k] = lerp(o.color[0], wood[0] * (1 + gr * 0.3), gone) * m;
    L.g[k] = lerp(o.color[1], wood[1] * (1 + gr * 0.3), gone) * m;
    L.b[k] = lerp(o.color[2], wood[2] * (1 + gr * 0.3), gone) * m;
    L.rough[k] = o.kind === 'vinyl' ? 0.5 : o.bare ? 0.88 : lerp(0.62, 0.9, gone);
    L.height[k] = h + gr * (o.bare ? 0.0012 : 0.0004) - gone * 0.0005;
    return 0;
  });
  return L.finish();
}
const SIDE_COLORS: [string, string, number][] = [['white', '白', 0xe6e4dc], ['cream', 'クリーム', 0xe2d6b0], ['yellow', '黄', 0xdcc470], ['blue', '青', 0x6488a8], ['sage', 'セージ', 0x8c9c80], ['grey', 'グレー', 0x8c9094], ['red', '赤', 0x8c3028], ['brown', '茶', 0x6a4c38], ['green', '深緑', 0x3c5644], ['tan', '黄褐色', 0xb89c74]];
for (const [id, label, c] of SIDE_COLORS) add('wall', `siding-${id}`, `下見板張り ${label}`, [2.3, 2.3], (t, s) => siding(t, s, { color: hex(c), kind: 'lap', peel: 0.06 }), { density: 220 });
add('wall', 'siding-white-peeling', '下見板張り 白・塗装剥がれ', [2.3, 2.3], (t, s) => siding(t, s, { color: hex(0xdad6ca), kind: 'lap', peel: 0.6 }), { density: 220 });
add('wall', 'siding-blue-peeling', '下見板張り 青・塗装剥がれ', [2.3, 2.3], (t, s) => siding(t, s, { color: hex(0x5c7c98), kind: 'lap', peel: 0.5 }), { density: 220 });
add('wall', 'siding-vinyl-white', '樹脂サイディング 白', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0xe4e4e0), kind: 'vinyl', size: 0.2 }), { density: 200 });
add('wall', 'siding-vinyl-beige', '樹脂サイディング ベージュ', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0xcdbf9f), kind: 'vinyl', size: 0.2 }), { density: 200 });
add('wall', 'siding-vinyl-grey', '樹脂サイディング 青灰', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0x8a98a4), kind: 'vinyl', size: 0.2 }), { density: 200 });
add('wall', 'shingle-cedar', 'シングル壁 杉・茶', [2.1, 2.1], (t, s) => siding(t, s, { color: hex(0x7c5a3c), kind: 'shingle', bare: true }), { density: 220 });
add('wall', 'shingle-grey', 'シングル壁 風化した灰', [2.1, 2.1], (t, s) => siding(t, s, { color: hex(0x7c7870), kind: 'shingle', bare: true }), { density: 220 });
add('wall', 'shingle-green', 'シングル壁 緑塗り', [2.1, 2.1], (t, s) => siding(t, s, { color: hex(0x55705c), kind: 'shingle' }), { density: 220 });
add('wall', 'batten-white', '縦羽目板 白', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0xe2e0d8), kind: 'batten' }), { density: 200 });
add('wall', 'batten-barn-red', '縦羽目板 赤', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0x82302a), kind: 'batten', peel: 0.25 }), { density: 200 });
add('wall', 'batten-charcoal', '縦羽目板 チャコール', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0x3a3c40), kind: 'batten' }), { density: 200 });
add('wall', 'wood-cedar', '板張り 杉(無塗装)', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0x9a6c44), kind: 'lap', size: 0.1, bare: true }), { density: 200 });
add('wall', 'wood-dark', '板張り 濃色ステイン', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0x4c3424), kind: 'plywood', size: 0.15, bare: true }), { density: 200 });
add('wall', 'plywood-tan', '溝付き合板 黄褐色', [2.4, 2.4], (t, s) => siding(t, s, { color: hex(0xb49a70), kind: 'plywood', size: 0.2, peel: 0.15 }), { density: 200 });

// --- Sheet metal. ---
interface SheetOpts {
  kind: 'corrugated' | 'ribbed' | 'seam' | 'panel';
  /** Leave out for galvanised steel. */
  color?: RGB;
  rust?: number;
  pitch?: number;
  /** Polished composite panels. */
  gloss?: boolean;
  /** Height of a panel for `panel`. */
  rowH?: number;
}
function sheet(tex: Tex, seed: number, o: SheetOpts): TextureData {
  const bare: RGB = [0.66, 0.68, 0.7];
  const base = o.color ?? bare;
  const L = new Layers(tex, base, 0.5);
  const pitch = o.pitch ?? (o.kind === 'corrugated' ? 0.076 : o.kind === 'ribbed' ? 0.2 : o.kind === 'seam' ? 0.4 : 1.2);
  const rowH = o.rowH ?? (o.kind === 'panel' ? 0.6 : tex.mh / Math.max(1, Math.round(tex.mh / 2.4)));
  const tone = tex.noise(0.6, 0.6, seed, 3);
  const spangle = tex.cells(0.03, seed + 1);
  const rustN = tex.noise(0.35, 0.5, seed + 2, 4, 0.6);
  const rustF = tex.noise(0.02, 0.02, seed + 3, 2);
  const streak = tex.noise(pitch * 0.5, 1.5, seed + 4, 2);
  const dent = tex.noise(0.5, 0.5, seed + 5, 2);
  const rust = o.rust ?? 0.1;
  const nx = Math.max(1, Math.round(tex.mw / pitch));
  tex.map((x, y, k) => {
    const s = x / pitch;
    const i = Math.floor(s);
    const f = s - i;
    const row = Math.floor(y / rowH);
    const fy = y / rowH - row;
    const lap = (1 - sstep(0, 0.012, fy * rowH)) * (o.kind === 'panel' ? 0 : 1);
    let h: number;
    let groove = 0;
    if (o.kind === 'corrugated') h = Math.sin(f * Math.PI * 2) * 0.009;
    else if (o.kind === 'ribbed') h = sstep(0.0, 0.07, f) * (1 - sstep(0.16, 0.23, f)) * 0.025 + sstep(0.5, 0.52, f) * (1 - sstep(0.56, 0.58, f)) * 0.003;
    else if (o.kind === 'seam') h = (1 - sstep(0.012, 0.03, Math.min(f, 1 - f))) * 0.03;
    else {
      groove = 1 - sstep(0.004, 0.008, Math.min(f * pitch, (1 - f) * pitch, fy * rowH, (1 - fy) * rowH));
      h = -groove * 0.006 + dent(x, y) * 0.0015;
    }
    const pid = hash2(i % nx, row, seed);
    let m = 1 + tone(x, y) * 0.06 + (o.kind === 'panel' ? (pid - 0.5) * 0.07 : 0) + (o.color ? 0 : (spangle(x, y).id - 0.5) * 0.12);
    m *= 1 - sstep(0.15, 0.8, streak(x, y)) * 0.14 - lap * 0.35 - groove * 0.6;
    const rv = clamp01(sstep(1.0 - rust * 0.8, 1.12 - rust * 0.75, rustN(x, y) * 0.9 + 0.5 + lap * 0.25 + (o.kind === 'seam' ? (1 - sstep(0, 0.08, Math.min(f, 1 - f))) * 0.12 : 0)));
    const rf = 0.75 + rustF(x, y) * 0.4;
    L.r[k] = lerp(base[0] * m, 0.38 * rf, rv);
    L.g[k] = lerp(base[1] * m, 0.19 * rf, rv);
    L.b[k] = lerp(base[2] * m, 0.09 * rf, rv);
    L.rough[k] = lerp(o.gloss ? 0.18 : o.color ? 0.45 : 0.4, 0.92, Math.max(rv, groove));
    L.metal[k] = (o.color ? (o.gloss ? 0.5 : 0) : 0.85) * (1 - rv) * (1 - groove);
    L.height[k] = h + lap * 0.002;
    return 0;
  });
  return L.finish();
}
const SHEETS: [string, string, readonly [number, number], SheetOpts][] = [
  ['corrugated-galvanized', '波板 亜鉛めっき', [1.52, 2.4], { kind: 'corrugated' }],
  ['corrugated-rusty', '波板 錆', [1.52, 2.4], { kind: 'corrugated', rust: 0.7 }],
  ['corrugated-white', '波板 白', [1.52, 2.4], { kind: 'corrugated', color: hex(0xd8d8d2), rust: 0.15 }],
  ['corrugated-blue', '波板 青', [1.52, 2.4], { kind: 'corrugated', color: hex(0x3c6490), rust: 0.2 }],
  ['corrugated-green', '波板 緑', [1.52, 2.4], { kind: 'corrugated', color: hex(0x44664e), rust: 0.35 }],
  ['corrugated-red', '波板 赤錆色', [1.52, 2.4], { kind: 'corrugated', color: hex(0x8a3a2c), rust: 0.3 }],
  ['ribbed-beige', 'リブ鋼板 ベージュ', [2, 2.4], { kind: 'ribbed', color: hex(0xc8bc9c) }],
  ['ribbed-grey', 'リブ鋼板 グレー', [2, 2.4], { kind: 'ribbed', color: hex(0x868a8e) }],
  ['ribbed-white', 'リブ鋼板 白', [2, 2.4], { kind: 'ribbed', color: hex(0xdededa) }],
  ['ribbed-blue', 'リブ鋼板 青', [2, 2.4], { kind: 'ribbed', color: hex(0x2e5484) }],
  ['ribbed-galvanized', 'リブ鋼板 亜鉛めっき', [2, 2.4], { kind: 'ribbed', rust: 0.25 }],
  ['panel-silver', '金属パネル 銀', [2.4, 2.4], { kind: 'panel', color: hex(0xb4b8bc), gloss: true, rust: 0 }],
  ['panel-white', '金属パネル 白', [2.4, 2.4], { kind: 'panel', color: hex(0xe2e2e0), gloss: true, rust: 0 }],
  ['panel-charcoal', '金属パネル チャコール', [2.4, 2.4], { kind: 'panel', color: hex(0x3c3e44), gloss: true, rust: 0 }],
  ['panel-bronze', '金属パネル ブロンズ', [2.4, 2.4], { kind: 'panel', color: hex(0x6a503a), gloss: true, rust: 0 }],
  ['panel-red', '金属パネル 赤', [2.4, 2.4], { kind: 'panel', color: hex(0xa83028), gloss: true, rust: 0, pitch: 0.8, rowH: 1.2 }],
  ['panel-orange', '金属パネル オレンジ', [2.4, 2.4], { kind: 'panel', color: hex(0xcc7430), gloss: true, rust: 0, pitch: 0.8, rowH: 1.2 }],
  ['panel-green', '金属パネル 黄緑', [2.4, 2.4], { kind: 'panel', color: hex(0x8ca43c), gloss: true, rust: 0, pitch: 0.8, rowH: 1.2 }],
];
for (const [id, label, m, o] of SHEETS) add('wall', `metal-${id}`, label, m, (t, s) => sheet(t, s, o), { density: 200, ...(o.gloss ? { reflect: 0.35 } : {}) });

// --- Glazed tile and painted block. ---
function glazed(tex: Tex, seed: number, colors: readonly RGB[], size: readonly [number, number], accent?: RGB): TextureData {
  const L = new Layers(tex, colors[0], 0.2);
  const [tw, th] = size;
  const nx = Math.round(tex.mw / tw);
  const ny = Math.round(tex.mh / th);
  const tone = tex.noise(0.5, 0.5, seed, 2);
  const craze = tex.cells(0.012, seed + 1);
  tex.map((x, y, k) => {
    const col = Math.floor(x / tw);
    const row = Math.floor(y / th);
    const d = Math.min(x - col * tw, (col + 1) * tw - x, y - row * th, (row + 1) * th - y);
    const joint = 1 - sstep(0.002, 0.004, d);
    const id = hash2(col % nx, row % ny, seed);
    let c = colors[Math.floor(hash2(col % nx, row % ny, seed + 3) * colors.length) % colors.length];
    if (accent && row % ny === Math.floor(ny / 2)) c = accent;
    const cz = craze(x, y);
    const m = 1 + (id - 0.5) * 0.12 + tone(x, y) * 0.05 - (cz.f2 - cz.f1 < 0.04 ? 0.05 : 0);
    L.r[k] = lerp(c[0] * m, 0.42, joint);
    L.g[k] = lerp(c[1] * m, 0.4, joint);
    L.b[k] = lerp(c[2] * m, 0.37, joint);
    L.rough[k] = lerp(0.12, 0.9, joint);
    L.height[k] = sstep(0, 0.006, d) * 0.0025;
    return 0;
  });
  return L.finish();
}
const TILES: [string, string, RGB[], [number, number], RGB?][] = [
  ['white', '白', [hex(0xe6e6e0), hex(0xdedfd8)], [0.15, 0.075]], ['green', '緑', [hex(0x2c5c48), hex(0x285440), hex(0x32644e)], [0.15, 0.075], hex(0xd8c890)],
  ['black', '黒', [hex(0x1e1f22), hex(0x232428)], [0.2, 0.2], hex(0xc8a848)], ['blue', '青', [hex(0x285888), hex(0x2c6094), hex(0x24507c)], [0.1, 0.1]],
  ['cream', 'クリーム', [hex(0xe0d4b0), hex(0xd8cca8)], [0.1, 0.1], hex(0x8c3a2c)], ['mosaic', 'モザイク', [hex(0x4c7c8c), hex(0x70a0a8), hex(0xd8d8cc), hex(0x2c5c70)], [0.05, 0.05]],
  ['terracotta', 'テラコッタ', [hex(0xb46846), hex(0xa85e3e), hex(0xbe7450)], [0.3, 0.15]],
];
for (const [id, label, c, sz, accent] of TILES) add('wall', `tile-${id}`, `タイル壁 ${label}`, [1.2, 1.2], (t, s) => glazed(t, s, c, sz, accent), { density: 320, reflect: 0.3 });
const CMU: [string, string, RGB[]][] = [
  ['grey', '素地', [hex(0x8e8c88), hex(0x84827e), hex(0x989690)]], ['white', '白塗り', [hex(0xd8d6ce), hex(0xd0cec6)]], ['beige', 'ベージュ塗り', [hex(0xc4b48c), hex(0xbcac84)]],
  ['blue', '青塗り', [hex(0x4c6c94), hex(0x46648a)]], ['yellow', '黄塗り', [hex(0xd0b048), hex(0xc8a840)]], ['red', '赤塗り', [hex(0x9c3c30), hex(0x94362c)]], ['split', '割肌', [hex(0x9c8c74), hex(0x8c7c68), hex(0xa89880)]],
];
for (const [id, label, colors] of CMU) add('wall', `block-${id}`, `コンクリートブロック ${label}`, [1.6, 1.6], (t, s) => S.masonry(t, { seed: s, block: [0.4, 0.2], colors, rough: id === 'split', streaks: 0.5, ...(id === 'grey' || id === 'split' ? {} : { mortar: [grey(colors[0]) * 0.82, grey(colors[0]) * 0.8, grey(colors[0]) * 0.76] as RGB }) }), { density: 200 });

// --- Pitched roofs: y runs up the slope. ---
interface ShingleOpts {
  colors: readonly RGB[];
  kind: 'asphalt' | 'shake' | 'slate' | 'flat';
  moss?: number;
}
function shingles(tex: Tex, seed: number, o: ShingleOpts): TextureData {
  const L = new Layers(tex, o.colors[0], 0.95);
  const exp = o.kind === 'asphalt' ? 0.14 : o.kind === 'shake' ? 0.18 : o.kind === 'slate' ? 0.2 : 0.33;
  const tw = o.kind === 'asphalt' ? 0.33 : o.kind === 'shake' ? 0.11 : o.kind === 'slate' ? 0.25 : 0.3;
  const rows = Math.round(tex.mh / exp);
  const nx = Math.round(tex.mw / tw);
  const grit = tex.noise(0.005, 0.005, seed, 2);
  const tone = tex.noise(0.8, 0.8, seed + 1, 3);
  const grain = tex.noise(0.008, 0.3, seed + 2, 3);
  const mossN = tex.noise(0.4, 0.3, seed + 3, 4, 0.6);
  const streak = tex.noise(0.15, 1.5, seed + 4, 2);
  tex.map((x, y, k) => {
    const row = Math.floor(y / exp);
    const fy = y / exp - row;
    const jit = o.kind === 'shake' ? hash2(row % rows, 3, seed) : (row % 2) * 0.5;
    const s = x / tw + jit;
    const col = Math.floor(s);
    const fx = s - col;
    const id = hash2(col % nx, row % rows, seed + 5);
    const c = o.colors[Math.floor(hash2(col % nx, row % rows, seed + 6) * o.colors.length) % o.colors.length];
    const gapW = o.kind === 'asphalt' ? 0.012 : o.kind === 'flat' ? 0.02 : 0.03;
    const gap = 1 - sstep(gapW, gapW * 2.2, Math.min(fx, 1 - fx));
    // The lower edge of each course (fy near 0) lies on top of the course below and casts a shadow onto it.
    const butt = (o.kind === 'shake' ? 0.012 + id * 0.008 : o.kind === 'slate' ? 0.007 : o.kind === 'flat' ? 0.014 : 0.004) * (1 - fy);
    const shadow = sstep(0.8, 1, fy) * 0.5;
    let m = 1 + (id - 0.5) * (o.kind === 'asphalt' ? 0.16 : 0.3) + tone(x, y) * 0.08 + (o.kind === 'asphalt' ? grit(x, y) * 0.22 : o.kind === 'shake' ? grain(x + id * 3, y) * 0.25 : grit(x, y) * 0.05);
    m *= (1 - shadow) * (1 - gap * 0.55) * (1 - sstep(0.1, 0.8, streak(x, y)) * 0.15);
    const moss = (o.moss ?? 0) * sstep(0.15, 0.45, mossN(x, y) + shadow * 0.3 + gap * 0.2);
    L.r[k] = lerp(c[0] * m, 0.26 * (1 + grit(x, y) * 0.3), moss * 0.8);
    L.g[k] = lerp(c[1] * m, 0.34 * (1 + grit(x, y) * 0.3), moss * 0.8);
    L.b[k] = lerp(c[2] * m, 0.14, moss * 0.8);
    L.rough[k] = o.kind === 'slate' ? 0.6 : 0.95;
    L.height[k] = butt - gap * 0.004 + grit(x, y) * (o.kind === 'asphalt' ? 0.0008 : 0.0003) + moss * 0.003;
    return 0;
  });
  return L.finish();
}
const tones = (c: number, spread = 0.12): RGB[] => {
  const b = hex(c);
  return [b, [b[0] * (1 - spread), b[1] * (1 - spread), b[2] * (1 - spread)], [b[0] * (1 + spread), b[1] * (1 + spread), b[2] * (1 + spread)]];
};
const SHINGLES: [string, string, ShingleOpts][] = [
  ['shingle-charcoal', 'アスファルトシングル 濃灰', { kind: 'asphalt', colors: tones(0x3c3c40) }], ['shingle-grey', 'アスファルトシングル 灰', { kind: 'asphalt', colors: tones(0x6c6c6e) }],
  ['shingle-brown', 'アスファルトシングル 茶', { kind: 'asphalt', colors: [...tones(0x5c4636), hex(0x74583e)] }], ['shingle-tan', 'アスファルトシングル 黄褐色', { kind: 'asphalt', colors: tones(0x94806a) }],
  ['shingle-red', 'アスファルトシングル 赤茶', { kind: 'asphalt', colors: tones(0x70382c) }], ['shingle-green', 'アスファルトシングル 緑', { kind: 'asphalt', colors: tones(0x3c5042) }],
  ['shingle-blue', 'アスファルトシングル 青灰', { kind: 'asphalt', colors: tones(0x4a5a6a) }], ['shingle-old', 'アスファルトシングル 古い・苔', { kind: 'asphalt', colors: tones(0x5a5852, 0.2), moss: 0.8 }],
  ['shake-cedar', '木の板葺き 杉', { kind: 'shake', colors: tones(0x7a5a3e, 0.2) }], ['shake-grey', '木の板葺き 風化', { kind: 'shake', colors: tones(0x6e6a62, 0.2), moss: 0.4 }],
  ['slate-grey', 'スレート 青灰', { kind: 'slate', colors: [...tones(0x484e56), hex(0x4c4a56)] }], ['slate-green', 'スレート 緑灰', { kind: 'slate', colors: tones(0x4e5a52) }],
  ['tile-flat-grey', '平板瓦 灰', { kind: 'flat', colors: tones(0x6a6a6a) }], ['tile-flat-red', '平板瓦 赤茶', { kind: 'flat', colors: tones(0x8c4a36) }], ['tile-flat-brown', '平板瓦 茶', { kind: 'flat', colors: tones(0x5e4a3e) }],
];
for (const [id, label, o] of SHINGLES) add('roof', id, label, o.kind === 'asphalt' ? [1.98, 1.96] : o.kind === 'shake' ? [1.98, 1.98] : o.kind === 'slate' ? [2, 2] : [2.1, 1.98], (t, s) => shingles(t, s, o), { density: 256 });

/** Spanish barrel tiles: rows of half pipes, each tile overlapping the one below. */
function barrel(tex: Tex, seed: number, colors: readonly RGB[], age: number): TextureData {
  const L = new Layers(tex, colors[0], 0.85);
  const pitch = 0.2;
  const exp = 0.35;
  const nx = Math.round(tex.mw / pitch);
  const rows = Math.round(tex.mh / exp);
  const tone = tex.noise(0.7, 0.7, seed, 3);
  const fine = tex.noise(0.015, 0.015, seed + 1, 2);
  const lichen = tex.noise(0.12, 0.12, seed + 2, 4, 0.6);
  tex.map((x, y, k) => {
    const col = Math.floor(x / pitch);
    const fx = x / pitch - col;
    const row = Math.floor(y / exp);
    const fy = y / exp - row;
    const id = hash2(col % nx, row % rows, seed + 3);
    const c = colors[Math.floor(hash2(col % nx, row % rows, seed + 4) * colors.length) % colors.length];
    // Cover tiles (convex) alternate with the pans between them.
    const cover = Math.sin(fx * Math.PI);
    const h = cover ** 0.7 * 0.05 + (1 - fy) * 0.016;
    const shadow = sstep(0.82, 1, fy) * 0.5 + (1 - sstep(0, 0.3, cover)) * 0.45;
    const li = age * sstep(0.2, 0.5, lichen(x, y)) * 0.6;
    const m = (1 + (id - 0.5) * 0.3 + tone(x, y) * 0.08 + fine(x, y) * 0.08) * (1 - shadow);
    L.r[k] = lerp(c[0] * m, 0.5 * (1 - shadow), li);
    L.g[k] = lerp(c[1] * m, 0.5 * (1 - shadow), li);
    L.b[k] = lerp(c[2] * m, 0.42 * (1 - shadow), li);
    L.height[k] = h;
    return 0;
  });
  return L.finish();
}
add('roof', 'clay-terracotta', 'スペイン瓦 テラコッタ', [2, 2.1], (t, s) => barrel(t, s, [hex(0xb05c3a), hex(0xa05030), hex(0xc06c46), hex(0x9a5a3c)], 0.2));
add('roof', 'clay-red', 'スペイン瓦 赤', [2, 2.1], (t, s) => barrel(t, s, [hex(0x963a28), hex(0x8a3424), hex(0xa4442e)], 0.15));
add('roof', 'clay-mixed', 'スペイン瓦 混色', [2, 2.1], (t, s) => barrel(t, s, [hex(0xb05c3a), hex(0x7c4a34), hex(0xc88c5c), hex(0x9a4c30), hex(0x6a4030)], 0.3));
add('roof', 'clay-old', 'スペイン瓦 古い・地衣類', [2, 2.1], (t, s) => barrel(t, s, [hex(0x9a583c), hex(0x8a5038), hex(0xa46848)], 1));
const SEAMS: [string, string, number | null, number][] = [['seam-grey', '灰', 0x70767c, 0.05], ['seam-red', '赤', 0x8c3028, 0.1], ['seam-green', '緑', 0x3c5c4a, 0.1], ['seam-blue', '青', 0x34587c, 0.05], ['seam-copper', '緑青', 0x5c9c84, 0.25], ['seam-galvanized', '亜鉛めっき', null, 0.3], ['seam-white', '白', 0xdcdcd8, 0.05], ['seam-rusty', '錆', 0x6c7074, 0.8]];
for (const [id, label, c, rust] of SEAMS) add('roof', id, `立平葺き金属屋根 ${label}`, [2, 2.4], (t, s) => sheet(t, s, { kind: 'seam', ...(c === null ? {} : { color: hex(c) }), rust }), { density: 200 });
add('roof', 'corrugated-galvanized', '波板屋根 亜鉛めっき', [1.52, 2.4], (t, s) => sheet(t, s, { kind: 'corrugated', rust: 0.3 }), { density: 200 });
add('roof', 'corrugated-rusty', '波板屋根 錆', [1.52, 2.4], (t, s) => sheet(t, s, { kind: 'corrugated', rust: 0.85 }), { density: 200 });

// --- Flat roofs. ---
function membrane(tex: Tex, seed: number, color: RGB, o: { dirt: number; kind: 'sheet' | 'bitumen' | 'tar' }): TextureData {
  const L = new Layers(tex, color, 0.8);
  const tone = tex.noise(1, 1, seed, 3);
  const pond = tex.noise(1.4, 1.4, seed + 1, 3);
  const fine = tex.noise(0.006, 0.006, seed + 2, 2);
  const blot = tex.noise(0.3, 0.3, seed + 3, 4, 0.6);
  const wr = tex.noise(0.5, 0.06, seed + 4, 2);
  const rollW = o.kind === 'sheet' ? 2 : 1;
  tex.map((x, y, k) => {
    const f = (y / rollW) % 1;
    const lap = 1 - sstep(0.0, 0.012, Math.min(f, 1 - f) * rollW);
    const edge = sstep(0.0, 0.06, f * rollW) < 1 ? 1 - sstep(0, 0.06, f * rollW) : 0;
    const ring = sstep(0.18, 0.24, pond(x, y)) * (1 - sstep(0.24, 0.5, pond(x, y)));
    const dirt = o.dirt * clamp01(0.2 + sstep(0.2, 0.5, pond(x, y)) * 0.5 + ring * 0.5 + blot(x, y) * 0.4);
    const tar = o.kind === 'tar' ? sstep(0.2, 0.26, blot(x + 3, y)) : 0;
    const m = 1 + tone(x, y) * 0.07 + fine(x, y) * (o.kind === 'sheet' ? 0.03 : 0.2) - lap * 0.4 + edge * 0.05;
    L.r[k] = lerp(color[0] * m * (1 - dirt * 0.5), 0.05, tar);
    L.g[k] = lerp(color[1] * m * (1 - dirt * 0.52), 0.05, tar);
    L.b[k] = lerp(color[2] * m * (1 - dirt * 0.56), 0.055, tar);
    L.rough[k] = lerp(o.kind === 'sheet' ? 0.6 : 0.95, 0.3, tar);
    L.height[k] = edge * 0.003 + wr(x, y) * (o.kind === 'sheet' ? 0.0015 : 0.0004) + fine(x, y) * (o.kind === 'sheet' ? 0 : 0.0008);
    return 0;
  });
  return L.finish();
}
add('roof', 'flat-membrane-white', '陸屋根 白い防水シート', [4, 4], (t, s) => membrane(t, s, hex(0xdcdcd6), { dirt: 0.5, kind: 'sheet' }), { density: 128 });
add('roof', 'flat-membrane-dirty', '陸屋根 防水シート・汚れ', [4, 4], (t, s) => membrane(t, s, hex(0xc4c2b8), { dirt: 1.1, kind: 'sheet' }), { density: 128 });
add('roof', 'flat-membrane-grey', '陸屋根 灰色の防水シート', [4, 4], (t, s) => membrane(t, s, hex(0x86888a), { dirt: 0.6, kind: 'sheet' }), { density: 128 });
add('roof', 'flat-bitumen', '陸屋根 アスファルト防水', [4, 4], (t, s) => membrane(t, s, hex(0x4c4c4e), { dirt: 0.5, kind: 'bitumen' }), { density: 128 });
add('roof', 'flat-bitumen-patched', '陸屋根 アスファルト防水・タール補修', [4, 4], (t, s) => membrane(t, s, hex(0x5a5856), { dirt: 0.8, kind: 'tar' }), { density: 128 });
add('roof', 'flat-bitumen-silver', '陸屋根 銀色塗装', [4, 4], (t, s) => membrane(t, s, hex(0x9c9ea0), { dirt: 0.7, kind: 'tar' }), { density: 128 });
add('roof', 'flat-bitumen-red', '陸屋根 赤い砂付きルーフィング', [4, 4], (t, s) => membrane(t, s, hex(0x7a4034), { dirt: 0.5, kind: 'bitumen' }), { density: 128 });
add('roof', 'flat-bitumen-green', '陸屋根 緑の砂付きルーフィング', [4, 4], (t, s) => membrane(t, s, hex(0x44584a), { dirt: 0.5, kind: 'bitumen' }), { density: 128 });
add('roof', 'flat-gravel', '陸屋根 砂利押さえ', [2, 2], (t, s) => S.gravel(t, { seed: s, size: 0.022, colors: [hex(0x8c8880), hex(0x74706a), hex(0x9c968c), hex(0x64605c)] }), { density: 256 });
add('roof', 'flat-gravel-light', '陸屋根 白っぽい砂利', [2, 2], (t, s) => S.gravel(t, { seed: s, size: 0.018, colors: [hex(0xb8b4a8), hex(0xa8a498), hex(0xc8c4b8)], soil: [0.5, 0.48, 0.44] }), { density: 256 });
add('roof', 'flat-concrete', '陸屋根 コンクリート', [3, 3], (t, s) => S.concrete(t, { seed: s, slab: [3, 3], finish: 'broom', dirt: 0.7, stains: 0.6, cracks: 0.4 }), { density: 170 });
add('roof', 'deck-parking', '屋上駐車場の床', [3, 3], (t, s) => S.concrete(t, { seed: s, slab: [3, 3], finish: 'broom', color: [0.5, 0.5, 0.5], dirt: 0.8, stains: 1.2, cracks: 0.3 }), { density: 170 });

export const BUILDING_TEXTURES: readonly TextureSpec[] = list;
