import { RGB, TextureSpec, hex } from './core';
import * as S from './surfaces';

const list: TextureSpec[] = [];
const add = (s: Omit<TextureSpec, 'tile' | 'decal' | 'density'> & Partial<Pick<TextureSpec, 'tile' | 'decal' | 'density'>>): void => {
  list.push({ tile: 'xy', decal: false, density: 256, ...s });
};

// --- Asphalt: one lane wide (3.5 m) with wheel paths, and plain tiles for junctions. ---
const AGES: [string, string, number][] = [
  ['fresh', '新しい', 0.12],
  ['used', '使用感あり', 0.35],
  ['worn', '古い', 0.65],
  ['bleached', '白っぽく退色', 0.95],
];
const WEAR: [string, string, Partial<S.AsphaltOpts>][] = [
  ['clean', '無傷', {}],
  ['cracked', 'ひび', { cracks: 0.6, stains: 0.3 }],
  ['sealed', 'ひび補修(タール)', { cracks: 0.9, sealed: 0.85, stains: 0.2 }],
  ['patched', '補修跡', { cracks: 0.4, sealed: 0.4, patches: 2, stains: 0.4 }],
  ['broken', '亀甲ひび+掘削跡', { cracks: 1, alligator: 0.55, patches: 1, trench: true, sealed: 0.2, stains: 0.5 }],
];
let seed = 100;
for (const [aid, alabel, age] of AGES) {
  for (const [wid, wlabel, extra] of WEAR) {
    if (aid === 'fresh' && wid !== 'clean' && wid !== 'patched') continue;
    for (const lane of [true, false]) {
      const s = seed++;
      add({
        id: `asphalt/${lane ? 'lane' : 'plain'}-${aid}-${wid}`,
        label: `アスファルト ${alabel}・${wlabel}${lane ? '(車線)' : '(無地)'}`,
        category: 'asphalt',
        meters: lane ? [3.5, 7] : [4, 4],
        generate: (t) => S.asphalt(t, { seed: s, age, lane, ...extra }),
      });
    }
  }
}
const COATS: [string, string, RGB][] = [
  ['bus-red', 'バスレーン赤', hex(0x8f2a22)],
  ['bike-green', '自転車レーン緑', hex(0x2f7a4a)],
  ['bike-blue', '自転車レーン青', hex(0x2b5f9a)],
  ['school-yellow', '通学路 黄土色', hex(0xa9843a)],
];
for (const [cid, clabel, color] of COATS) {
  for (const [wl, wear] of [['新しい', 0.15], ['すり減り', 0.5], ['ほぼ剥離', 0.8]] as const) {
    const s = seed++;
    add({ id: `asphalt/coat-${cid}-${Math.round(wear * 100)}`, label: `カラー舗装 ${clabel}・${wl}`, category: 'asphalt', meters: [3.5, 7], generate: (t) => S.asphalt(t, { seed: s, age: 0.4, lane: true, coat: { color, wear }, cracks: wear > 0.4 ? 0.4 : 0 }) });
  }
}
add({ id: 'asphalt/coarse-chipseal', label: '粗い砕石舗装(チップシール)', category: 'asphalt', meters: [4, 4], generate: (t) => S.asphalt(t, { seed: 190, age: 0.7, coarse: 2.2 }) });
add({ id: 'asphalt/coarse-chipseal-cracked', label: '粗い砕石舗装・ひび', category: 'asphalt', meters: [4, 4], generate: (t) => S.asphalt(t, { seed: 191, age: 0.8, coarse: 2.2, cracks: 0.8, alligator: 0.3 }) });

// --- Concrete: carriageway slabs, pavements, walls. ---
const WARM: RGB = [0.68, 0.63, 0.55];
const DARK: RGB = [0.45, 0.44, 0.42];
const WHITE: RGB = [0.76, 0.75, 0.72];
add({ id: 'concrete/road-tined', label: 'コンクリート舗装 溝付き', category: 'concrete', meters: [4, 4], generate: (t) => S.concrete(t, { seed: 200, slab: [4, 4], finish: 'tined', joint: 'sawcut', dirt: 0.4 }) });
add({ id: 'concrete/road-tined-stained', label: 'コンクリート舗装 溝付き・油染み', category: 'concrete', meters: [4, 4], generate: (t) => S.concrete(t, { seed: 201, slab: [4, 4], finish: 'tined', joint: 'expansion', dirt: 0.7, stains: 0.8, cracks: 0.5 }) });
add({ id: 'concrete/road-smooth-cracked', label: 'コンクリート舗装 古い・ひび', category: 'concrete', meters: [4, 4], generate: (t) => S.concrete(t, { seed: 202, color: WARM, slab: [4, 4], finish: 'exposed', joint: 'expansion', dirt: 0.6, cracks: 1 }) });
const WALKS: [string, string, S.ConcreteOpts][] = [
  ['walk-square', '歩道 正方形目地', { seed: 210, slab: [1.5, 1.5], gum: 2, dirt: 0.3 }],
  ['walk-square-dirty', '歩道 正方形目地・ガム跡と染み', { seed: 211, slab: [1.5, 1.5], gum: 9, stains: 0.7, cracks: 0.4, dirt: 0.6 }],
  ['walk-square-cracked', '歩道 正方形目地・ひび割れ', { seed: 212, color: WARM, slab: [1.5, 1.5], gum: 3, cracks: 1, dirt: 0.5 }],
  ['walk-small', '歩道 小さい目地', { seed: 213, slab: [0.75, 0.75], gum: 4, dirt: 0.4, stains: 0.3 }],
  ['walk-long', '歩道 横長スラブ', { seed: 214, slab: [3, 1.5], gum: 2, dirt: 0.35 }],
  ['walk-staggered', '歩道 千鳥目地', { seed: 215, slab: [1.5, 0.75], staggered: true, gum: 3, dirt: 0.4 }],
  ['walk-new', '歩道 新しい白コンクリート', { seed: 216, color: WHITE, slab: [1.5, 1.5], joint: 'sawcut', dirt: 0.1 }],
  ['walk-dark', '歩道 濃色コンクリート', { seed: 217, color: DARK, slab: [1, 1], joint: 'sawcut', finish: 'smooth', gum: 5, dirt: 0.3 }],
  ['walk-exposed', '歩道 洗い出し', { seed: 218, color: WARM, slab: [1.5, 1.5], finish: 'exposed', dirt: 0.3 }],
  ['walk-plain', 'コンクリート 目地なし', { seed: 219, dirt: 0.4, stains: 0.4 }],
  ['gutter', '側溝・街渠', { seed: 220, slab: [3, 0], finish: 'smooth', dirt: 0.8, stains: 1 }],
  ['driveway', '乗り入れ部 油染み', { seed: 221, slab: [3, 3], dirt: 0.6, stains: 1.2, cracks: 0.5 }],
];
for (const [id, label, o] of WALKS) add({ id: `concrete/${id}`, label, category: 'concrete', meters: [3, 3], generate: (t) => S.concrete(t, o) });

// --- Paving. ---
const RED: RGB[] = [hex(0x8c4030), hex(0x7a3528), hex(0x9a5038), hex(0x6e3024)];
const BROWN: RGB[] = [hex(0x6a4a38), hex(0x5a3e30), hex(0x7a5a44)];
const TAN: RGB[] = [hex(0xb09a78), hex(0xa48c6a), hex(0xbca888)];
const GRAYS: RGB[] = [hex(0x8a8a88), hex(0x7a7a7a), hex(0x969694)];
const CHAR: RGB[] = [hex(0x4a4a4c), hex(0x404044), hex(0x56565a)];
const MIX: RGB[] = [hex(0x8c4030), hex(0x4a4a4c), hex(0x9a5038), hex(0x6a4a38)];
const GRANITE: RGB[] = [hex(0x6c6c70), hex(0x5c5c62), hex(0x7a7a7c), hex(0x66605c)];
const BONDS: [S.Bond, string][] = [['herringbone', 'ヘリンボーン'], ['running', '馬踏み'], ['basket', '網代'], ['stack', '芋目地']];
const PCOL: [string, string, RGB[]][] = [['red', '赤レンガ', RED], ['brown', '茶', BROWN], ['tan', '砂色', TAN], ['grey', 'グレー', GRAYS], ['charcoal', '濃灰', CHAR], ['mixed', '混色', MIX]];
for (const [bond, blabel] of BONDS) {
  for (const [cid, clabel, colors] of PCOL) {
    if (bond === 'stack' && (cid === 'red' || cid === 'brown' || cid === 'mixed')) continue;
    const s = seed++;
    add({ id: `paving/${bond}-${cid}`, label: `舗装ブロック ${blabel}・${clabel}`, category: 'paving', meters: [1.6, 1.6], density: 320, generate: (t) => S.pavers(t, { seed: s, bond, unit: 0.1, colors, gum: cid === 'grey' ? 4 : 1, dirt: 0.35 }) });
  }
}
add({ id: 'paving/setts-granite', label: '石畳 ピンコロ', category: 'paving', meters: [1.6, 1.6], density: 320, generate: (t) => S.pavers(t, { seed: 300, bond: 'setts', unit: 0.1, colors: GRANITE, domed: true, jointWidth: 0.008, dirt: 0.4 }) });
add({ id: 'paving/setts-mossy', label: '石畳 苔むした', category: 'paving', meters: [1.6, 1.6], density: 320, generate: (t) => S.pavers(t, { seed: 301, bond: 'setts', unit: 0.1, colors: GRANITE, domed: true, jointWidth: 0.009, moss: 0.8, dirt: 0.5 }) });
add({ id: 'paving/setts-large-tan', label: '石畳 大きめ・砂岩', category: 'paving', meters: [3.2, 3.2], generate: (t) => S.pavers(t, { seed: 302, bond: 'setts', unit: 0.2, colors: TAN, domed: true, jointWidth: 0.012, dirt: 0.4 }) });
add({ id: 'paving/slabs-granite', label: '石板 御影石', category: 'paving', meters: [3.6, 2.4], generate: (t) => S.pavers(t, { seed: 303, bond: 'slabs', unit: 0.3, colors: GRANITE, variation: 0.3, gum: 3 }) });
add({ id: 'paving/slabs-sandstone', label: '石板 砂岩', category: 'paving', meters: [3.6, 2.4], generate: (t) => S.pavers(t, { seed: 304, bond: 'slabs', unit: 0.3, colors: TAN, variation: 0.4, dirt: 0.4 }) });
add({ id: 'paving/slabs-dark', label: '石板 濃色・広場', category: 'paving', meters: [3.6, 2.4], generate: (t) => S.pavers(t, { seed: 305, bond: 'slabs', unit: 0.3, colors: CHAR, variation: 0.25, gum: 5 }) });
add({ id: 'paving/tactile-dome-yellow', label: '点字ブロック 点状・黄', category: 'paving', meters: [0.6, 0.6], density: 512, generate: (t) => S.tactile(t, { seed: 310, color: hex(0xd8aa1c) }) });
add({ id: 'paving/tactile-dome-worn', label: '点字ブロック 点状・すり減り', category: 'paving', meters: [0.6, 0.6], density: 512, generate: (t) => S.tactile(t, { seed: 311, color: hex(0xb8962c), wear: 0.8 }) });
add({ id: 'paving/tactile-dome-red', label: '点字ブロック 点状・赤茶', category: 'paving', meters: [0.6, 0.6], density: 512, generate: (t) => S.tactile(t, { seed: 312, color: hex(0x8a3a2a) }) });
add({ id: 'paving/tactile-bar-yellow', label: '点字ブロック 線状・黄', category: 'paving', meters: [0.6, 0.6], density: 512, generate: (t) => S.tactile(t, { seed: 313, color: hex(0xd8aa1c), bars: true }) });
add({ id: 'paving/tactile-dome-grey', label: '点字ブロック 点状・グレー', category: 'paving', meters: [0.6, 0.6], density: 512, generate: (t) => S.tactile(t, { seed: 314, color: hex(0x6a6a6c) }) });
add({ id: 'paving/boardwalk', label: '板張り ボードウォーク', category: 'paving', meters: [2.1, 3], generate: (t) => S.planks(t, { seed: 320, width: 0.14, color: hex(0x7a5a3c), weathered: 0.3 }) });
add({ id: 'paving/boardwalk-grey', label: '板張り 風化した灰色', category: 'paving', meters: [2.1, 3], generate: (t) => S.planks(t, { seed: 321, width: 0.14, color: hex(0x6e5a48), weathered: 0.85 }) });
add({ id: 'paving/boardwalk-wide', label: '板張り 幅広・濃色', category: 'paving', meters: [2.4, 3], generate: (t) => S.planks(t, { seed: 322, width: 0.2, color: hex(0x4e3626), weathered: 0.15 }) });

// --- Kerbs: x along the kerb, lower half = face, upper half = top. ---
const CURBS: [string, string, { paint?: RGB; wear?: number; granite?: boolean; dirt?: number }][] = [
  ['plain', '縁石 コンクリート', {}],
  ['dirty', '縁石 汚れ', { dirt: 0.9 }],
  ['granite', '縁石 御影石', { granite: true }],
  ['red', '縁石 赤(駐停車禁止)', { paint: hex(0xb3221a), wear: 0.2 }],
  ['red-worn', '縁石 赤・剥がれ', { paint: hex(0xa82a20), wear: 0.55 }],
  ['yellow', '縁石 黄(荷捌き)', { paint: hex(0xd8b01c), wear: 0.25 }],
  ['yellow-worn', '縁石 黄・剥がれ', { paint: hex(0xc8a224), wear: 0.6 }],
  ['white', '縁石 白(乗降)', { paint: hex(0xdcdcd6), wear: 0.3 }],
  ['green', '縁石 緑(短時間駐車)', { paint: hex(0x2f7a48), wear: 0.3 }],
  ['blue', '縁石 青(障害者用)', { paint: hex(0x2a56a0), wear: 0.3 }],
];
CURBS.forEach(([id, label, o], i) => add({ id: `curb/${id}`, label, category: 'curb', meters: [2, 0.5], tile: 'x', density: 512, generate: (t) => S.curb(t, { seed: 400 + i, ...o }) }));

// --- Ground beside the road. ---
add({ id: 'ground/grass-lush', label: '芝生 青々', category: 'ground', meters: [2, 2], generate: (t) => S.grass(t, { seed: 500 }) });
add({ id: 'ground/grass-mown', label: '芝生 刈り跡', category: 'ground', meters: [2, 2], generate: (t) => S.grass(t, { seed: 501, mown: true }) });
add({ id: 'ground/grass-patchy', label: '芝生 はげ', category: 'ground', meters: [2, 2], generate: (t) => S.grass(t, { seed: 502, dry: 0.25, bare: 0.4 }) });
add({ id: 'ground/grass-dry', label: '芝生 枯れ気味', category: 'ground', meters: [2, 2], generate: (t) => S.grass(t, { seed: 503, dry: 0.7, bare: 0.2 }) });
add({ id: 'ground/grass-dead', label: '枯れ草と土', category: 'ground', meters: [2, 2], generate: (t) => S.grass(t, { seed: 504, dry: 1, bare: 0.6 }) });
const STONE: RGB[] = [hex(0x8a8680), hex(0x6e6a64), hex(0x9c958a), hex(0x5c5a56)];
add({ id: 'ground/gravel', label: '砂利', category: 'ground', meters: [1, 1], density: 512, generate: (t) => S.gravel(t, { seed: 510, size: 0.03, colors: STONE }) });
add({ id: 'ground/gravel-fine', label: '細かい砂利', category: 'ground', meters: [1, 1], density: 512, generate: (t) => S.gravel(t, { seed: 511, size: 0.014, colors: [...STONE, hex(0xa89878)] }) });
add({ id: 'ground/gravel-dirt', label: '土混じりの砂利路肩', category: 'ground', meters: [2, 2], generate: (t) => S.gravel(t, { seed: 512, size: 0.03, colors: STONE, cover: 0.45 }) });
add({ id: 'ground/ballast', label: '砕石 大粒', category: 'ground', meters: [2, 2], generate: (t) => S.gravel(t, { seed: 513, size: 0.06, colors: [hex(0x6a6866), hex(0x56524e), hex(0x7c7672)], soil: [0.12, 0.11, 0.1] }) });
add({ id: 'ground/mulch', label: 'バークチップ(植栽帯)', category: 'ground', meters: [1, 1], density: 512, generate: (t) => S.gravel(t, { seed: 514, size: 0.035, colors: [hex(0x4a3020), hex(0x5c3c26), hex(0x38241a), hex(0x6a4830)], soil: [0.14, 0.1, 0.07] }) });
add({ id: 'ground/sand', label: '砂', category: 'ground', meters: [2, 2], generate: (t) => S.gravel(t, { seed: 515, size: 0.008, colors: [hex(0xcdb88e), hex(0xc2ac80), hex(0xd8c49c)], soil: [0.7, 0.62, 0.46] }) });
add({ id: 'ground/dirt', label: '土', category: 'ground', meters: [2, 2], generate: (t) => S.gravel(t, { seed: 516, size: 0.02, colors: [hex(0x6a543c), hex(0x5a4632)], cover: 0.25, soil: [0.36, 0.28, 0.2] }) });

// --- Structures: barriers, piers, walls, steel. ---
add({ id: 'structure/barrier', label: 'コンクリート防護柵', category: 'structure', meters: [3, 1], tile: 'x', generate: (t) => S.concrete(t, { seed: 600, slab: [3, 0], finish: 'smooth', dirt: 0.4, streaks: 0.6, scuffs: 0.5 }) });
add({ id: 'structure/barrier-dirty', label: 'コンクリート防護柵 擦り傷・雨だれ', category: 'structure', meters: [3, 1], tile: 'x', generate: (t) => S.concrete(t, { seed: 601, slab: [3, 0], finish: 'smooth', dirt: 0.8, streaks: 1, scuffs: 1.4, cracks: 0.3 }) });
add({ id: 'structure/pier-formwork', label: '橋脚 型枠跡(Pコン)', category: 'structure', meters: [2.4, 2.4], generate: (t) => S.concrete(t, { seed: 602, slab: [1.2, 2.4], finish: 'formwork', joint: 'sawcut', dirt: 0.4, streaks: 0.7 }) });
add({ id: 'structure/pier-boards', label: '橋脚 杉板型枠', category: 'structure', meters: [2.4, 2.4], generate: (t) => S.concrete(t, { seed: 603, finish: 'boards', dirt: 0.4, streaks: 0.6 }) });
add({ id: 'structure/wall-smooth', label: '擁壁 コンクリート', category: 'structure', meters: [3, 3], generate: (t) => S.concrete(t, { seed: 604, slab: [1.5, 3], finish: 'smooth', joint: 'expansion', dirt: 0.5, streaks: 1, cracks: 0.3 }) });
add({ id: 'structure/wall-old', label: '擁壁 古い・染み', category: 'structure', meters: [3, 3], generate: (t) => S.concrete(t, { seed: 605, color: DARK, slab: [3, 1.5], finish: 'exposed', dirt: 0.9, streaks: 1.2, cracks: 0.8, stains: 0.5 }) });
add({ id: 'structure/deck-underside', label: '桁下面 コンクリート', category: 'structure', meters: [3, 3], generate: (t) => S.concrete(t, { seed: 606, finish: 'boards', color: [0.55, 0.54, 0.52], dirt: 0.6 }) });
add({ id: 'structure/stone-ashlar', label: '石積み 切石', category: 'structure', meters: [2, 2], generate: (t) => S.masonry(t, { seed: 610, block: [0.5, 0.25], colors: [hex(0x8c8272), hex(0x7e7566), hex(0x998e7c)], rough: true, streaks: 0.5 }) });
add({ id: 'structure/stone-dark', label: '石積み 濃色', category: 'structure', meters: [2, 2], generate: (t) => S.masonry(t, { seed: 611, block: [0.4, 0.2], colors: GRANITE, rough: true, streaks: 0.8 }) });
add({ id: 'structure/brick-red', label: 'レンガ壁 赤', category: 'structure', meters: [1.68, 1.6], density: 320, generate: (t) => S.masonry(t, { seed: 612, block: [0.21, 0.08], colors: RED, streaks: 0.4 }) });
add({ id: 'structure/brick-brown', label: 'レンガ壁 茶', category: 'structure', meters: [1.68, 1.6], density: 320, generate: (t) => S.masonry(t, { seed: 613, block: [0.21, 0.08], colors: BROWN, mortar: [0.4, 0.38, 0.35] }) });
add({ id: 'structure/block-wall', label: 'コンクリートブロック壁', category: 'structure', meters: [1.6, 1.6], generate: (t) => S.masonry(t, { seed: 614, block: [0.4, 0.2], colors: [hex(0x8e8c88), hex(0x84827e)], streaks: 0.6 }) });
const PAINTS: [string, string, RGB][] = [
  ['green', '緑', hex(0x3a5c4a)],
  ['red', '赤(朱)', hex(0xa83a26)],
  ['grey', '灰', hex(0x74787c)],
  ['blue', '青', hex(0x33557a)],
  ['white', '白', hex(0xcfd0cc)],
  ['black', '黒', hex(0x26282a)],
  ['yellow', '黄', hex(0xc8a020)],
];
for (const [id, label, paint] of PAINTS) {
  const s = seed++;
  add({ id: `structure/steel-${id}`, label: `塗装鋼材 ${label}`, category: 'structure', meters: [1, 1], generate: (t) => S.metal(t, { seed: s, paint, rust: 0.15, rivets: 0.5, streaks: 0.3 }) });
  if (id === 'green' || id === 'red' || id === 'grey') add({ id: `structure/steel-${id}-rusty`, label: `塗装鋼材 ${label}・錆`, category: 'structure', meters: [1, 1], generate: (t) => S.metal(t, { seed: s + 50, paint, rust: 0.6, rivets: 0.5, streaks: 0.6 }) });
}
add({ id: 'structure/steel-galvanized', label: '亜鉛めっき鋼(ガードレール)', category: 'structure', meters: [1, 1], generate: (t) => S.metal(t, { seed: 650, streaks: 0.3 }) });
add({ id: 'structure/steel-galvanized-rusty', label: '亜鉛めっき鋼 錆', category: 'structure', meters: [1, 1], generate: (t) => S.metal(t, { seed: 651, rust: 0.5, streaks: 0.6 }) });
add({ id: 'structure/steel-corten', label: '耐候性鋼', category: 'structure', meters: [1, 1], generate: (t) => S.metal(t, { seed: 652, corten: true, rivets: 0.5 }) });

/** Decal specs are appended by markings.ts. */
export const SURFACES: readonly TextureSpec[] = list;
