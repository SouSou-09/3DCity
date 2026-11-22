import { MeshBuilder, V3 } from './builder';
import { S } from './boundaries';
import { BoatKind, BuoyKind, CONTAINER_COLORS, SeawallOpts, boat, buoy, canopy, container, flagPole, hut, reeferUnit, seawall, trailer } from './boats';
import { LightOpts, PierOpts, ball, beacon, bollard, boulder, cleat, cyl, floatDock, gangway, guard, hash, ladder, lighthouse, mound, pier, rocks, skeletonLight, tetrapod, torus } from './marine';
import { Pose, at, box, lathe, layZ, move, pipe, plate, stand, turn } from './kit';
import { TowerOpts, boardwalk, dune, jibCrane, lifeguardChair, lifeguardTower, lounger, rtgCrane, shower, stsCrane, surfboard, umbrella, volleyball } from './port';
import { addModel } from './registry';

export function addWaterfront(): void {
  const A = (id: string, label: string, fn: (b: MeshBuilder, f: Pose) => void): void => addModel('waterfront', id, label, (b) => fn(b, stand()));

  // Piers: the deck runs out along +x from the shore at x = 0; water level is y = 0.
  const PIERS: [string, string, number, PierOpts][] = [
    ['timber', '桟橋 木造 手すりつき', 24, { brace: true }],
    ['timber-lamps', '桟橋 木造 街灯とベンチ', 30, { w: 4, brace: true, lamps: 9, benches: 2, deck: S('deck-wet') }],
    ['timber-narrow', '桟橋 木造 細い 手すりなし', 18, { w: 1.6, rail: 'none', deckY: 1.4, cleats: true, ladder: true }],
    ['timber-new', '桟橋 木造 新しい板 白い手すり', 24, { w: 3.2, deck: S('deck-new'), rail: 'white', pile: S('pile-wood-dry') }],
    ['fishing', '釣り桟橋 先端が広い', 30, { w: 3.5, brace: true, head: [8, 12], lamps: 12, benches: 2, signs: [S('sign-no-diving')] }],
    ['boardwalk-wide', '桟橋 幅広の遊歩桟橋', 30, { w: 8, lamps: 8, benches: 4, rail: 'iron', lampTop: 'globe', deck: S('deck-grey') }],
    ['derelict', '桟橋 廃桟橋 板が抜けている', 20, { w: 3, rail: 'none', derelict: true, pile: S('pile-wood-grey'), signs: [S('sign-pier-closed')] }],
    ['moorings', '桟橋 係船杭つき', 24, { w: 3, rail: 'none', fenders: true, cleats: true, ladder: true }],
    ['concrete', '桟橋 コンクリート パイプ手すり', 30, { conc: true, w: 4, rail: 'pipe', bay: 5 }],
    ['concrete-wide', '桟橋 コンクリート 幅広 街灯', 30, { conc: true, w: 7, rail: 'cable', bay: 6, lamps: 10, lampTop: 'disc', lampTex: 'signal/pole-grey' }],
    ['concrete-head', '桟橋 コンクリート 先端が広い', 24, { conc: true, w: 4, rail: 'pipe', bay: 5, head: [8, 12], ladder: true }],
    ['steel-piles', '桟橋 鋼管杭 複合材デッキ', 24, { w: 3, pile: S('pile-steel'), pr: 0.2, deck: S('deck-composite'), rail: 'cable', timber: 'structure/steel-grey' }],
  ];
  for (const [id, label, len, o] of PIERS) A(`pier-${id}`, label, (b, f) => pier(b, f, len, o));

  // Floating docks.
  A('dock-float', '浮き桟橋 12m', (b, f) => floatDock(b, f, 12));
  A('dock-float-timber', '浮き桟橋 木デッキ 木杭', (b, f) => floatDock(b, f, 12, { deck: S('deck-grey'), pile: S('pile-wood'), w: 2 }));
  A('dock-float-concrete', '浮き桟橋 コンクリート 幅広', (b, f) => floatDock(b, f, 18, { deck: 'concrete/walk-plain', pile: S('pile-concrete'), w: 3.6 }));
  A('dock-gangway', '浮き桟橋 渡り橋つき', (b, f) => {
    gangway(b, f, 9, 2.2);
    floatDock(b, stand([10.2, 0, -5], -90), 14, { pileSide: -1 });
  });
  // Lighthouses and beacons.
  const T = (c: string): string => S(`tower-${c}`);
  const LIGHTS: [string, string, LightOpts][] = [
    ['white', '灯台 白 円筒 24m', { h: 24, r0: 3.4, r1: 2, bands: [[T('white'), 1]], windows: 4, lit: true }],
    ['red-white', '灯台 赤白の縞', { h: 28, r0: 3.6, r1: 2.1, bands: [[T('red'), 1], [T('white'), 1], [T('red'), 1], [T('white'), 1], [T('red'), 1]], windows: 4, trim: 'trim/paint-charcoal' }],
    ['black-white', '灯台 黒白の縞 見張り室つき', { h: 30, r0: 3.8, r1: 2.3, bands: [[T('black'), 1], [T('white'), 1], [T('black'), 1], [T('white'), 1]], windows: 5, watch: true, lit: true }],
    ['white-red-top', '灯台 白 赤い灯室', { h: 18, r0: 2.8, r1: 1.9, bands: [[T('white'), 5], [T('red'), 1]], windows: 3, trim: 'trim/paint-red', roof: 'trim/paint-red' }],
    ['octagonal', '灯台 八角 白 銅屋根', { h: 20, r0: 3.2, r1: 2, sides: 8, bands: [[T('white'), 1]], windows: 3, roof: 'roof/seam-copper', roofKind: 'cone', lit: true }],
    ['octagonal-green', '灯台 八角 緑白', { h: 16, r0: 2.8, r1: 1.9, sides: 8, bands: [[T('green'), 1], [T('white'), 2], [T('green'), 1]], windows: 2, trim: 'trim/paint-green' }],
    ['square', '灯台 四角 白 低い', { h: 12, r0: 2.4, r1: 1.9, sides: 4, bands: [[T('white'), 1]], windows: 2, roof: 'trim/paint-red', roofKind: 'cone', lr: 1.2 }],
    ['stone', '灯台 石積み', { h: 22, r0: 3.4, r1: 2.2, bands: [['structure/stone-ashlar', 1]], windows: 4, base: S('wall-rubble'), baseH: 2, watch: true }],
    ['brick', '灯台 レンガ 白い灯室', { h: 20, r0: 3, r1: 2, bands: [['structure/brick-red', 1]], windows: 3, trim: 'trim/paint-white', roof: 'trim/paint-black' }],
    ['rusty', '灯台 鉄製 さび', { h: 14, r0: 1.8, r1: 1.5, bands: [[T('rusty'), 1]], windows: 2, base: 'structure/wall-old', trim: 'trim/paint-rust', lr: 1.1 }],
    ['short-red', '灯台 港口 赤 低い', { h: 9, r0: 1.6, r1: 1.3, bands: [[T('red'), 1]], base: 'structure/wall-smooth', baseH: 1.6, trim: 'trim/paint-red', lr: 0.95, lh: 1.2, lit: true }],
    ['short-green', '灯台 港口 緑 低い', { h: 9, r0: 1.6, r1: 1.3, bands: [[T('green'), 1]], base: 'structure/wall-smooth', baseH: 1.6, trim: 'trim/paint-green', lr: 0.95, lh: 1.2 }],
  ];
  for (const [id, label, o] of LIGHTS) A(`lighthouse-${id}`, label, (b, f) => lighthouse(b, f, o));
  A('lighthouse-skeleton', '灯台 鉄骨やぐら 白', (b, f) => skeletonLight(b, f, { h: 22, s0: 4.5, s1: 1.6, mat: 'trim/paint-white', tube: T('white'), legs: 6, lit: true, roof: 'trim/paint-red' }));
  A('lighthouse-skeleton-red', '灯台 鉄骨やぐら 赤 4脚', (b, f) => skeletonLight(b, f, { h: 16, s0: 3.2, s1: 1.4, mat: 'structure/steel-red', tube: T('red') }));
  A('lighthouse-skeleton-rusty', '灯台 鉄骨やぐら さび 筒なし', (b, f) => skeletonLight(b, f, { h: 12, s0: 2.6, s1: 1.3, mat: 'structure/steel-grey-rusty' }));
  A('beacon-red', '防波堤灯標 赤', (b, f) => beacon(b, f, { h: 5, bands: [T('red')], lens: S('lens-fresnel-lit') }));
  A('beacon-green', '防波堤灯標 緑', (b, f) => beacon(b, f, { h: 5, bands: [T('green')] }));
  A('beacon-banded', '灯標 赤白 太陽電池つき', (b, f) => beacon(b, f, { h: 7, r: 0.55, bands: [T('red'), T('white'), T('red')], solar: true }));
  A('beacon-pole', '灯標 細い柱 黄', (b, f) => beacon(b, f, { h: 4, r: 0.16, bands: [S('buoy-yellow')], rail: false, solar: true }));
  A('beacon-black-yellow', '灯標 黒黄 方位標識', (b, f) => beacon(b, f, { h: 6, r: 0.5, bands: [T('black'), S('buoy-yellow'), T('black')] }));
  // Sea walls: 16 m of wall facing the water at +z with a promenade behind.
  const WALLS: [string, string, string, SeawallOpts][] = [
    ['concrete', '護岸 コンクリート', S('seawall-concrete'), {}],
    ['concrete-old', '護岸 古いコンクリート タイヤ防舷材', S('seawall-concrete-old'), { fenders: 'tyre', ladder: true, walk: 'concrete/walk-plain' }],
    ['stone', '護岸 石積み', S('seawall-stone'), { cap: 'structure/stone-ashlar', walk: 'paving/setts-granite' }],
    ['sheetpile', '護岸 鋼矢板', S('seawall-sheetpile'), { top: 1.6, cap: 'structure/steel-grey-rusty', walk: 'ground/gravel' }],
    ['quay', '岸壁 ゴム防舷材 はしご', S('seawall-concrete'), { top: 2.6, depth: 8, fenders: 'rubber', ladder: true, walk: 'concrete/walk-plain' }],
    ['wave-return', '護岸 波返しつき 高い', S('seawall-concrete-old'), { top: 3.2, lip: true }],
  ];
  for (const [id, label, tex, o] of WALLS) {
    A(`seawall-${id}`, label, (b, f) => {
      seawall(b, f, 16, tex, o);
      const top = o.top ?? 2.2;
      if (id === 'quay') for (const x of [3, 8, 13]) bollard(b, f, [x, top + 0.2, -0.9], x === 8 ? 'double' : 'tee');
      if (id === 'concrete' || id === 'stone') guard(b, f, id === 'stone' ? 'iron' : 'pipe', top + 0.2, 0, -0.3, 16, -0.3);
    });
  }
  A('seawall-steps', '護岸 水面へ下りる階段', (b, f) => {
    seawall(b, f, 5, S('seawall-stone'), { cap: 'structure/stone-ashlar' });
    seawall(b, move(f, 11, 0, 0), 5, S('seawall-stone'), { cap: 'structure/stone-ashlar' });
    for (let i = 0; i < 10; i++) box(b, 'structure/stone-ashlar', f, [8, 2.2 - (i + 1) * 0.26 - 1, -3.6 + i * 0.4 + 0.2], [3, 1.13, 0.2], 'Y');
    b.quadUp('paving/setts-granite', at(f, 5, 2.2, -3.6), at(f, 11, 2.2, -3.6), at(f, 11, 2.2, -4), at(f, 5, 2.2, -4));
  });
  A('boat-ramp', 'ボートランプ コンクリート斜路', (b, f) => {
    const tex = 'concrete/walk-plain';
    b.quad(tex, at(f, -3, -1.6, 9), at(f, 3, -1.6, 9), at(f, 3, 1.2, -9), at(f, -3, 1.2, -9), [[0, 0], [6, 0], [6, 18.2], [0, 18.2]]);
    for (const sx of [-1, 1]) {
      b.quadFacing('structure/wall-old', at(f, sx * 3, -2, 9), at(f, sx * 3, -2, -9), at(f, sx * 3, 1.2, -9), at(f, sx * 3, -1.6, 9), [sx * f.x[0], sx * f.x[1], sx * f.x[2]], [[0, 0], [18, 0], [18, 3.2], [0, 0.4]]);
      mound(b, S('riprap-granite'), turn(move(f, sx * 4.6, 0, -9), -90), 18, [[1.6, -2], [0.6, 0.6], [-0.6, 0.6], [-1.6, -2]].map(([z, y]) => [z, y + 0.4]) as [number, number][], { seed: 3 + sx, jit: 0.22 });
    }
    for (let i = 0; i < 14; i++) box(b, 'structure/wall-old', f, [0, -1.36 + i * 0.154 + 0.02, 7.5 - i], [3, 0.012, 0.06]);
    floatDock(b, turn(move(f, 4.3, 0, -2), -90), 10, { w: 1.6, pileSide: 1 });
    b.tube('trim/paint-galvanized', at(f, -3.4, 1.2, -8.6), at(f, -3.4, 3.3, -8.6), 0.03, 6, 0.03, true);
    plate(b, S('sign-boat-ramp'), f, [-3.4, 2.95, -8.56]);
  });

  // Rock structures.
  const RIP = ['granite', 'dark', 'wet', 'mossy', 'sandstone'];
  A('breakwater', '防波堤 捨石 30m', (b, f) => mound(b, S('riprap-granite'), f, 30, [[7, -2], [2, 2.4], [-2, 2.4], [-7, -2]], { taper: 7, seed: 1 }));
  A('breakwater-walk', '防波堤 捨石 上に歩道', (b, f) => {
    mound(b, S('riprap-dark'), f, 30, [[8, -2], [2.6, 2.2], [-2.6, 2.2], [-8, -2]], { seed: 2 });
    box(b, 'concrete/walk-plain', f, [15, 2.3, 0], [15, 0.25, 1.6], 'Y');
    guard(b, f, 'pipe', 2.55, 0, 1.5, 30, 1.5);
  });
  A('breakwater-head', '防波堤 先端 灯標つき', (b, f) => {
    mound(b, S('riprap-wet'), f, 22, [[7, -2], [2.4, 2.2], [-2.4, 2.2], [-7, -2]], { taper: 8, seed: 3 });
    cyl(b, 'structure/wall-smooth', f, [13, 1.6, 0], 2.2, 1, 14);
    beacon(b, move(f, 13, 2.6, 0), { h: 4.5, bands: [S('tower-red')], base: false });
  });
  A('breakwater-caisson', '防波堤 ケーソン 消波ブロック', (b, f) => {
    box(b, S('seawall-concrete-old'), f, [12, 0.5, -2], [12, 2.5, 2.5], 'Y');
    box(b, 'structure/wall-old', f, [12, 3.6, -3.6], [12, 0.6, 0.5], 'Y');
    for (let i = 0; i < 44; i++) tetrapod(b, 'structure/wall-old', f, [0.8 + (i % 15) * 1.6 + hash(i, 1) * 0.6, -0.5 + Math.floor(i / 15) * 0.9 + hash(i, 2) * 0.3, 1.5 + (2 - Math.floor(i / 15)) * 1.3 + hash(i, 3) * 0.5], 1.05, i + 1);
  });
  A('tetrapods', '消波ブロックの山', (b, f) => {
    for (let i = 0; i < 26; i++) {
      const l = i < 14 ? 0 : i < 22 ? 1 : 2;
      tetrapod(b, i % 5 === 0 ? 'structure/wall-smooth' : 'structure/wall-old', f, [(hash(i, 4) - 0.5) * (9 - l * 3), 0.2 + l * 1, (hash(i, 5) - 0.5) * (6 - l * 2)], 1.1, i + 40);
    }
  });
  A('tetrapod', '消波ブロック 1個', (b, f) => tetrapod(b, 'structure/wall-smooth', f, [0, 0.62, 0], 1.3, 7.3));
  RIP.forEach((c, i) => A(`revetment-${c}`, `護岸斜面 捨石 ${['花崗岩', '暗色', '濡れ', 'こけ', '砂岩'][i]}`, (b, f) => {
    mound(b, S(`riprap-${c}`), f, 16, [[5, -2], [0.2, 2 + (i % 2) * 0.6], [-0.6, 2.1 + (i % 2) * 0.6], [-1, 2 + (i % 2) * 0.6]], { seed: 10 + i, jit: 0.3 });
    b.quadUp(i % 2 ? 'ground/gravel' : 'ground/grass-patchy', at(f, 0, 2 + (i % 2) * 0.6, -0.8), at(f, 16, 2 + (i % 2) * 0.6, -0.8), at(f, 16, 2 + (i % 2) * 0.6, -4), at(f, 0, 2 + (i % 2) * 0.6, -4));
  }));
  A('groyne-rock', '突堤 捨石', (b, f) => mound(b, S('riprap-mossy'), f, 24, [[3.2, -1.5], [0.9, 1], [-0.9, 1], [-3.2, -1.5]], { taper: 6, taper0: 0.01, seed: 21, jit: 0.25 }));
  A('groyne-timber', '突堤 木杭', (b, f) => {
    for (let i = 0; i < 40; i++) {
      const h = 2.2 - i * 0.03 + hash(i, 6) * 0.35;
      lathe(b, S(i % 3 ? 'pile-wood' : 'pile-wood-grey'), move(f, i * 0.5, -2, (hash(i, 7) - 0.5) * 0.12), [[0.2, 0], [0.19, 2 + h], [0, 2.03 + h]], 7);
    }
    for (const sz of [-1, 1]) box(b, 'signal/pole-wood-grey', f, [10, 0.9, sz * 0.26], [10, 0.1, 0.04]);
  });
  const ROCK = ['granite', 'sandstone', 'basalt', 'mossy', 'wet'];
  ROCK.forEach((c, i) => {
    A(`rock-${c}`, `岩 ${['花崗岩', '砂岩', '玄武岩', 'こけ', '濡れ'][i]}`, (b, f) => boulder(b, S(`rock-${c}`), f, [0, 0.5 + i * 0.12, 0], [1.2 + i * 0.3, 0.9 + i * 0.15, 1 + (i % 2) * 0.5], 30 + i, 6));
    A(`rocks-${c}`, `岩の群れ ${['花崗岩', '砂岩', '玄武岩', 'こけ', '濡れ'][i]}`, (b, f) => rocks(b, S(`rock-${c}`), f, -4, 4, -3, 3, 7 + i * 2, 1.3 - i * 0.1, 50 + i));
  });
  A('rock-outcrop', '岩礁 海から突き出た岩', (b, f) => {
    boulder(b, S('rock-basalt'), f, [0, 0.6, 0], [4.5, 3.2, 3.4], 61, 7);
    boulder(b, S('rock-basalt'), f, [4.5, -0.2, 1.5], [2.4, 1.6, 2], 62, 6);
    boulder(b, S('rock-wet'), f, [-4.2, -0.4, -1.2], [2, 1.1, 1.6], 63, 5);
  });

  // Buoys and marks; the pose is on the water surface.
  const BUOYS: [string, string, BuoyKind, string, { light?: string; band?: string; lean?: number }?][] = [
    ['nun-red', '浮標 赤 円すい形', 'nun', S('buoy-red'), { lean: 6 }],
    ['can-green', '浮標 緑 円筒形', 'can', S('buoy-green'), { lean: -5 }],
    ['pillar-red', '灯浮標 赤 やぐらつき', 'pillar', S('buoy-red'), { light: S('beacon-red') }],
    ['pillar-green', '灯浮標 緑 やぐらつき', 'pillar', S('buoy-green'), { light: S('beacon-green'), lean: 4 }],
    ['pillar-yellow', '灯浮標 黄 特殊標識', 'pillar', S('buoy-yellow'), { light: S('beacon-white') }],
    ['mooring-white', '係留ブイ 白 青帯', 'ball', 'trim/paint-white', { band: 'trim/paint-blue' }],
    ['mooring-orange', '係留ブイ オレンジ', 'ball', S('buoy-orange')],
    ['spar-yellow', '浮標 細い柱 黄 ×印', 'spar', S('buoy-yellow'), { lean: 8 }],
    ['swim-barrel', '遊泳区域ブイ 白 たる形', 'barrel', 'trim/paint-white'],
  ];
  for (const [id, label, kind, tex, o] of BUOYS) A(`buoy-${id}`, label, (b, f) => buoy(b, f, kind, tex, o));
  A('buoy-swim-line', '遊泳区域ロープ 浮き玉つき', (b, f) => {
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) pts.push(at(f, i * 2, 0.02, Math.sin(i * 0.7) * 0.5));
    pipe(b, S('rope-blue'), pts, 0.02, 5);
    pts.forEach((q, i) => ball(b, S(i % 3 ? 'buoy-orange' : 'plastic-yellow'), { ...f, o: q }, [0, 0.03, 0], i % 3 ? 0.11 : 0.2, 8));
  });

  // Quayside hardware.
  (['single', 'tee', 'double', 'horn'] as const).forEach((k, i) => {
    A(`bollard-${k}`, `係船柱 ${['単柱', 'T形', '双柱', '角つき'][i]}`, (b, f) => bollard(b, f, [0, 0, 0], k, i % 2 ? 'structure/steel-grey-rusty' : 'structure/steel-black'));
  });
  A('bollard-rope', '係船柱 ロープつき', (b, f) => {
    bollard(b, f, [0, 0, 0], 'single', 'trim/paint-yellow');
    for (let i = 0; i < 3; i++) torus(b, S('rope'), f, [0, 0.16 + i * 0.07, 0], 0.19, 0.035, 12, 5);
    pipe(b, S('rope'), [at(f, 0.17, 0.3, 0.1), at(f, 0.8, 0.2, 0.5), at(f, 1.6, 0.05, 1.2), at(f, 2.4, -0.3, 2.2)], 0.035, 6);
  });
  A('cleat', '係船金具 クリート', (b, f) => cleat(b, f, [0, 0, 0], 0.4));
  A('cleat-rope', '係船金具 ロープつき', (b, f) => {
    cleat(b, f, [0, 0, 0], 0.4, 'structure/steel-black');
    pipe(b, S('rope-blue'), [at(f, -0.12, 0.08, 0.05), at(f, 0.12, 0.1, -0.05), at(f, 0.1, 0.07, 0.06), at(f, -0.1, 0.07, -0.06), at(f, -0.3, 0.03, 0.3), at(f, -0.5, 0.02, 0.8)], 0.014, 5);
  });
  A('rope-coil', 'ロープの束', (b, f) => {
    for (let i = 0; i < 5; i++) torus(b, S('rope'), f, [hash(i, 8) * 0.03, 0.035 + i * 0.065, hash(i, 9) * 0.03], 0.3 - i * 0.012, 0.035, 14, 5);
    pipe(b, S('rope'), [at(f, 0.28, 0.32, 0), at(f, 0.5, 0.12, 0.15), at(f, 0.8, 0.035, 0.2)], 0.035, 6);
  });
  A('ladder-quay', '岸壁はしご', (b, f) => ladder(b, f, [0, 0, 0], -1, 2.2));
  const ringStand = (b: MeshBuilder, f: Pose, post: string, cabinet: boolean): void => {
    b.tube(post, at(f, 0, 0, 0), at(f, 0, 1.6, 0), 0.04, 8, 0.04, true);
    if (cabinet) {
      box(b, 'trim/paint-orange', f, [0, 1.25, 0.08], [0.45, 0.45, 0.07]);
      plate(b, S('lifering'), f, [0, 1.25, 0.16]);
    } else {
      box(b, 'trim/paint-white', f, [0, 1.25, 0.05], [0.42, 0.42, 0.012]);
      torus(b, 'trim/paint-orange', layZ(move(f, 0, 1.25, 0.11)), [0, 0, 0], 0.3, 0.07, 14, 6);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.78;
        box(b, 'trim/paint-white', move(f, Math.cos(a) * 0.3, 1.25 + Math.sin(a) * 0.3, 0.11), [0, 0, 0], [0.075, 0.075, 0.075]);
      }
    }
  };
  A('lifering-post', '救命浮環 柱つき', (b, f) => ringStand(b, f, 'trim/paint-galvanized', false));
  A('lifering-cabinet', '救命浮環 オレンジの収納箱', (b, f) => ringStand(b, f, 'trim/paint-orange', true));
  A('dock-box', 'ドックボックス 白', (b, f) => {
    box(b, 'trim/paint-white', f, [0, 0.3, 0], [0.75, 0.3, 0.32], 'Y');
    box(b, 'trim/paint-white', f, [0, 0.63, 0], [0.78, 0.04, 0.35]);
  });
  A('power-pedestal', '係留用の電源・給水スタンド', (b, f) => {
    box(b, 'trim/paint-white', f, [0, 0.5, 0], [0.11, 0.5, 0.11], 'Y');
    box(b, 'trim/paint-blue', f, [0, 1.06, 0], [0.13, 0.06, 0.13]);
    lathe(b, 'furniture/globe-on', move(f, 0, 1.12, 0), [[0.07, 0], [0.07, 0.1], [0, 0.14]], 8);
    for (const sz of [-1, 1]) box(b, 'trim/paint-charcoal', f, [0, 0.7, sz * 0.12], [0.05, 0.07, 0.015]);
    pipe(b, 'trim/paint-yellow', [at(f, 0, 0.66, 0.14), at(f, 0.05, 0.3, 0.3), at(f, 0.3, 0.02, 0.45), at(f, 0.9, 0.02, 0.5)], 0.014, 5);
  });
  A('fish-table', '魚さばき台', (b, f) => {
    box(b, 'furniture/coat-stainless', f, [0, 0.92, 0], [0.9, 0.02, 0.35]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tube('trim/paint-galvanized', at(f, sx * 0.8, 0, sz * 0.28), at(f, sx * 0.8, 0.9, sz * 0.28), 0.02, 6);
    pipe(b, 'trim/paint-galvanized', [at(f, 0.6, 0.94, -0.3), at(f, 0.6, 1.25, -0.3), at(f, 0.6, 1.3, -0.15)], 0.012, 5);
    box(b, S('plastic-blue'), f, [-0.45, 1.02, 0], [0.25, 0.08, 0.2], 'Y');
  });

  // Boats, bow towards +x, floating on y = 0.
  const BOATS: [string, string, BoatKind, { side?: string; inside?: string; canvas?: string; tarp?: boolean; s?: number; deck?: string }][] = [
    ['dinghy-white', 'ボート 手こぎ 白', 'dinghy', {}],
    ['dinghy-blue', 'ボート 手こぎ 青', 'dinghy', { side: S('hull-blue'), inside: 'trim/paint-cream', s: 1.15 }],
    ['dinghy-tarp', 'ボート 手こぎ シートがけ', 'dinghy', { side: S('hull-green'), tarp: true }],
    ['canoe-red', 'カヌー 赤', 'canoe', { side: S('hull-red'), inside: 'trim/paint-tan' }],
    ['canoe-green', 'カヌー 緑', 'canoe', { side: S('hull-green'), inside: 'trim/paint-tan' }],
    ['kayak-yellow', 'カヤック 黄', 'kayak', { side: S('plastic-yellow') }],
    ['kayak-orange', 'カヤック オレンジ', 'kayak', { side: S('plastic-orange') }],
    ['kayak-blue', 'カヤック 青', 'kayak', { side: S('plastic-blue') }],
    ['skiff-aluminium', '小型ボート アルミ 船外機', 'skiff', { side: 'trim/paint-galvanized', inside: 'trim/paint-galvanized' }],
    ['skiff-white', '小型ボート 白 船外機', 'skiff', { inside: 'trim/paint-white', s: 1.15 }],
    ['skiff-tarp', '小型ボート シートがけ', 'skiff', { side: S('hull-blue'), tarp: true }],
    ['rib-grey', 'ゴムボート 灰', 'rib', { side: 'trim/paint-grey' }],
    ['rib-orange', 'ゴムボート オレンジ 救助艇', 'rib', { side: S('buoy-orange') }],
    ['sail-white', 'ヨット 白', 'sail', {}],
    ['sail-blue', 'ヨット 青 大きめ', 'sail', { side: S('hull-blue'), canvas: S('tarp-blue'), s: 1.2, deck: S('deck-teak') }],
    ['sail-red', 'ヨット 赤 小さめ', 'sail', { side: S('hull-red'), canvas: S('canvas-red'), s: 0.8 }],
    ['cruiser-white', 'クルーザー 白', 'cruiser', {}],
    ['cruiser-black', 'クルーザー 黒 大きめ', 'cruiser', { side: S('hull-black'), s: 1.2, canvas: S('canvas-stripe-blue') }],
    ['trawler-blue', '漁船 青', 'trawler', { side: S('hull-blue') }],
    ['trawler-red', '漁船 赤 小さめ', 'trawler', { side: S('hull-red'), s: 0.85 }],
    ['trawler-green', '漁船 緑 大きめ', 'trawler', { side: S('hull-green'), s: 1.15 }],
  ];
  for (const [id, label, kind, o] of BOATS) A(`boat-${id}`, label, (b, f) => boat(b, f, { kind, ...o }));
  A('boat-trailer', 'ボートトレーラー 空', (b, f) => trailer(b, f, 5));
  A('boat-on-trailer', 'トレーラーに載せた小型ボート', (b, f) => {
    trailer(b, f, 5);
    boat(b, move(f, -0.3, 0.85, 0), { kind: 'skiff', inside: 'trim/paint-white' });
  });
  A('boat-on-stands', '陸揚げしたヨット 船台つき', (b, f) => {
    boat(b, move(f, 0, 1.95, 0), { kind: 'sail', side: S('hull-white'), s: 0.9 });
    for (const sx of [-2.4, 0, 2.4]) for (const sz of [-1, 1]) {
      for (let k = 0; k < 3; k++) b.tube('trim/paint-yellow', at(f, sx + Math.cos(k * 2.1) * 0.35, 0, sz * 1.5 + Math.sin(k * 2.1) * 0.35), at(f, sx, 1.5, sz * 1.15), 0.02, 5);
      box(b, 'wall/plywood-tan', f, [sx, 1.55, sz * 1.1], [0.15, 0.03, 0.15]);
    }
    for (const sx of [-0.8, 0.5]) box(b, 'signal/pole-wood', f, [sx, 0.1, 0], [0.15, 0.1, 0.4]);
  });
  A('kayak-rack', 'カヤックラック 6艇', (b, f) => {
    for (const sx of [-1.2, 1.2]) {
      b.tube('trim/paint-galvanized', at(f, sx, 0, 0), at(f, sx, 2, 0), 0.035, 6, 0.035, true);
      for (let l = 0; l < 3; l++) b.tube('trim/paint-galvanized', at(f, sx, 0.4 + l * 0.65, -0.75), at(f, sx, 0.4 + l * 0.65, 0.75), 0.025, 6, 0.025, true);
      box(b, 'trim/paint-galvanized', f, [sx, 0.03, 0], [0.05, 0.03, 0.7]);
    }
    const cols = ['plastic-yellow', 'plastic-orange', 'plastic-blue', 'plastic-red', 'plastic-green', 'plastic-purple'];
    for (let l = 0; l < 3; l++) for (const sz of [-1, 1]) boat(b, move(f, 0, 0.52 + l * 0.65, sz * 0.4), { kind: 'kayak', side: S(cols[l * 2 + (sz > 0 ? 1 : 0)]) });
  });

  // Shipping containers stand on y = 0, doors at +x.
  CONTAINER_COLORS.forEach((c, i) => {
    A(`container-20-${c}`, `コンテナ 20ft ${c}`, (b, f) => container(b, f, c, 1));
    if (i % 2 === 0) A(`container-40-${c}`, `コンテナ 40ft ${c}`, (b, f) => container(b, f, c, 2));
  });
  A('container-40-high', 'コンテナ 40ft 背高', (b, f) => container(b, f, 'maroon', 2, { high: true }));
  A('container-open', 'コンテナ 20ft 扉開き', (b, f) => container(b, f, 'blue', 1, { open: true }));
  A('container-reefer', '冷凍コンテナ 20ft', (b, f) => {
    container(b, f, 'white', 1);
    reeferUnit(b, f, 6.06);
  });
  A('container-reefer-40', '冷凍コンテナ 40ft', (b, f) => {
    container(b, f, 'white', 2, { high: true });
    reeferUnit(b, f, 12.12);
  });
  A('container-office', 'コンテナ事務所', (b, f) => {
    container(b, f, 'grey', 1);
    box(b, 'door/steel-grey', f, [-1.6, 1.05, 1.225], [0.45, 1.02, 0.01]);
    box(b, 'window/band-black', f, [1, 1.6, 1.225], [1.1, 0.4, 0.01]);
    box(b, 'trim/paint-white', f, [2.6, 2.2, 1.4], [0.4, 0.2, 0.18]);
    for (let i = 0; i < 2; i++) box(b, 'concrete/walk-plain', f, [-1.6, 0.03 - i * 0, 1.5 + i * 0.3], [0.6, 0.03, 0.15]);
  });
  const stack = (b: MeshBuilder, f: Pose, cols: number, rows: number, high: number, units: 1 | 2, seed: number): void => {
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const n = Math.max(1, Math.round(high * (0.45 + hash(c * 7 + r, seed) * 0.6)));
      for (let k = 0; k < Math.min(high, n); k++) {
        const col = CONTAINER_COLORS[Math.floor(hash(c * 31 + r * 7 + k * 3, seed + 1) * CONTAINER_COLORS.length)];
        container(b, move(f, (c - (cols - 1) / 2) * (6.06 * units + 0.4), k * 2.61, (r - (rows - 1) / 2) * 2.6), col, units);
      }
    }
  };
  A('container-stack-3', 'コンテナ 3段積み', (b, f) => stack(b, f, 1, 1, 3, 1, 1));
  A('container-stack-small', 'コンテナの山 2×2', (b, f) => stack(b, f, 2, 2, 3, 1, 2));
  A('container-stack-row', 'コンテナの列 4列×3段', (b, f) => stack(b, f, 1, 4, 4, 2, 3));
  A('container-stack-yard', 'コンテナヤード 3×4 最大4段', (b, f) => stack(b, f, 3, 4, 5, 1, 4));
  A('container-stack-yard-40', 'コンテナヤード 40ft 2×5 最大5段', (b, f) => stack(b, f, 2, 5, 6, 2, 5));
  // Port cranes: rails along x, water at +z.
  A('crane-sts-red', 'ガントリークレーン 赤 ブーム下げ', (b, f) => stsCrane(b, f, { tex: S('crane-red'), load: 'blue' }));
  A('crane-sts-blue', 'ガントリークレーン 青 ブーム上げ', (b, f) => stsCrane(b, f, { tex: S('crane-blue'), raised: true }));
  A('crane-sts-yellow', 'ガントリークレーン 黄 小さめ', (b, f) => stsCrane(b, f, { tex: S('crane-yellow'), s: 0.8, house: 'trim/paint-grey' }));
  A('crane-sts-white', 'ガントリークレーン 白 ブーム上げ 大', (b, f) => stsCrane(b, f, { tex: 'structure/steel-white', raised: true, s: 1.15, house: 'trim/paint-blue' }));
  A('crane-rtg-yellow', 'ヤードクレーン タイヤ式 黄', (b, f) => rtgCrane(b, f, { tex: S('crane-yellow'), load: 'green' }));
  A('crane-rtg-red', 'ヤードクレーン タイヤ式 赤 空', (b, f) => rtgCrane(b, f, { tex: S('crane-red'), span: 20, h: 15 }));
  A('crane-rmg-blue', 'ヤードクレーン レール式 青 広い', (b, f) => rtgCrane(b, f, { tex: S('crane-blue'), span: 32, h: 20, rail: true, load: 'orange' }));
  A('crane-jib-green', '港湾クレーン ジブ式 緑', (b, f) => jibCrane(b, f, { tex: 'structure/steel-green', house: 'trim/paint-cream' }));
  A('crane-jib-yellow', '港湾クレーン ジブ式 黄 グラブつき', (b, f) => jibCrane(b, f, { tex: S('crane-yellow'), grab: true, ang: 42, slew: 30 }));
  A('crane-jib-rusty', '港湾クレーン ジブ式 古い さび', (b, f) => jibCrane(b, f, { tex: 'structure/steel-green-rusty', h: 9, jib: 20, ang: 68, slew: -40, house: 'structure/steel-grey-rusty' }));
  A('crane-jib-blue', '港湾クレーン ジブ式 青 高い', (b, f) => jibCrane(b, f, { tex: S('crane-blue'), h: 16, jib: 32, ang: 50, house: 'trim/paint-white' }));

  // Beach.
  const TOWERS: [string, string, TowerOpts][] = [
    ['blue', '監視塔 水色', { wall: 'wall/siding-blue', roof: 'roof/shingle-grey', flag: S('flag-yellow') }],
    ['white', '監視塔 白 赤屋根', { wall: 'wall/siding-white', roof: 'roof/seam-red', flag: S('flag-red'), h: 2.6 }],
    ['yellow', '監視塔 黄 平屋根', { wall: 'wall/siding-yellow', roof: 'roof/flat-membrane-white', flat: true, flag: S('flag-green') }],
    ['cedar', '監視塔 木板 低い', { wall: 'wall/shingle-cedar', roof: 'roof/shake-cedar', h: 1.6, trim: 'trim/paint-brown', number: false }],
    ['red', '監視塔 赤', { wall: 'wall/siding-red', roof: 'roof/shingle-charcoal', flag: S('flag-purple'), h: 3 }],
  ];
  for (const [id, label, o] of TOWERS) A(`lifeguard-tower-${id}`, label, (b, f) => lifeguardTower(b, f, o));
  A('lifeguard-chair', '監視いす 白', (b, f) => lifeguardChair(b, f, 'trim/paint-white'));
  A('lifeguard-chair-shade', '監視いす 日傘つき', (b, f) => lifeguardChair(b, f, 'signal/pole-wood-grey', S('canvas-red')));
  (['red', 'yellow', 'green', 'purple'] as const).forEach((c, i) => A(`beach-flag-${c}`, `ビーチ旗 ${['赤 遊泳禁止', '黄 注意', '緑 遊泳可', '紫 危険生物'][i]}`, (b, f) => flagPole(b, f, 3 + (i % 2) * 0.6, S(`flag-${c}`))));
  const CANVAS = ['canvas-stripe-blue', 'canvas-stripe-yellow', 'canvas-stripe-red', 'canvas-white', 'canvas-red'];
  CANVAS.forEach((c, i) => A(`umbrella-${c.replace('canvas-', '')}`, `ビーチパラソル ${['青縞', '黄縞', '赤縞', '白', '赤'][i]}`, (b, f) => umbrella(b, f, S(c), { lean: 4 + i * 3, r: 1 + (i % 3) * 0.12 })));
  A('umbrella-thatch', 'かやぶきパラソル', (b, f) => umbrella(b, f, 'roof/shake-cedar', { thatch: true, r: 1.6, h: 2.3, lean: 0 }));
  A('umbrella-set', 'パラソルと寝いす2台', (b, f) => {
    umbrella(b, f, S('canvas-stripe-blue'), { r: 1.3 });
    lounger(b, move(f, 0.2, 0, 0.8), S('canvas-white'));
    lounger(b, turn(move(f, 0.1, 0, -0.8), 8), S('canvas-white'));
  });
  A('umbrella-row', 'パラソルと寝いすの列', (b, f) => {
    for (let i = 0; i < 4; i++) {
      umbrella(b, move(f, 0, 0, i * 3.2), S(CANVAS[i % 3]), { r: 1.25, lean: 5 + hash(i, 1) * 6 });
      lounger(b, turn(move(f, 0.2, 0, i * 3.2 + 0.75), hash(i, 2) * 10 - 5), S(i % 2 ? 'canvas-stripe-yellow' : 'canvas-white'));
      lounger(b, turn(move(f, 0.2, 0, i * 3.2 - 0.75), hash(i, 3) * 10 - 5), S(i % 2 ? 'canvas-stripe-yellow' : 'canvas-white'));
    }
  });
  A('lounger', '寝いす', (b, f) => lounger(b, f, S('canvas-stripe-blue')));
  A('volleyball', 'ビーチバレーコート', (b, f) => volleyball(b, f));
  A('volleyball-old', 'ビーチバレーコート 古い 緑ネット', (b, f) => volleyball(b, f, { sand: S('sand-dry'), post: 'structure/steel-galvanized-rusty', net: S('net-green') }));
  A('shower-single', 'ビーチシャワー 1口', (b, f) => shower(b, f, 1));
  A('shower-quad', 'ビーチシャワー 4口', (b, f) => shower(b, f, 4, 'trim/paint-blue'));
  A('boardwalk', 'ボードウォーク 12m', (b, f) => boardwalk(b, f, 12, 3));
  A('boardwalk-rail', 'ボードウォーク 木の手すり', (b, f) => boardwalk(b, f, 12, 3.6, { rail: 'timber', deck: 'paving/boardwalk', y: 0.9 }));
  A('boardwalk-rope', 'ボードウォーク ロープ柵 砂浜へのスロープ', (b, f) => boardwalk(b, f, 12, 2, { rail: 'rope', deck: 'paving/boardwalk-wide', ramp: true }));
  A('boardwalk-wide', 'ボードウォーク 幅広 6m', (b, f) => boardwalk(b, f, 12, 6, { deck: 'paving/boardwalk', y: 0.6 }));
  const SAND = ['sand-dry', 'sand-white', 'sand-dark', 'sand-ripples', 'sand-wrack'];
  SAND.forEach((c, i) => A(`dune-${c.replace('sand-', '')}`, `砂丘 ${['乾いた砂', '白砂', '暗い砂', '風紋', '打ち上げ海藻'][i]}`, (b, f) => dune(b, S(c), f, 7 + i, 5 + (i % 2) * 2, 1 + i * 0.25, 70 + i)));
  // What the sea and the day's visitors leave on the sand.
  const log = (b: MeshBuilder, f: Pose, len: number, r: number, seed: number): void => {
    const pts: V3[] = [];
    for (let i = 0; i <= 5; i++) pts.push(at(f, (i / 5 - 0.5) * len, r * 0.8 + Math.sin(i * 1.3 + seed) * r * 0.25, Math.sin(i * 0.9 + seed * 2) * len * 0.04));
    pipe(b, S('pile-wood-grey'), pts, (q) => r * (1.15 - q * 0.5), 7);
    // The stub of a branch.
    pipe(b, S('pile-wood-grey'), [at(f, len * 0.1, r, 0), at(f, len * 0.22, r * 2.6, len * 0.12)], (q) => r * (0.45 - q * 0.2), 5);
  };
  A('driftwood-log', '流木', (b, f) => log(b, f, 2.8, 0.13, 1));
  A('driftwood-branch', '流木 細い枝', (b, f) => log(b, f, 1.7, 0.06, 4));
  A('driftwood-pile', '流木の山', (b, f) => {
    log(b, f, 3.2, 0.15, 2);
    log(b, turn(move(f, 0.3, 0.12, 0.4), 38), 2.4, 0.1, 5);
    log(b, turn(move(f, -0.5, 0.05, -0.5), -64), 1.8, 0.07, 7);
  });
  A('seaweed-heap', '打ち上げられた海藻', (b, f) => {
    dune(b, S('sand-wrack'), f, 1.1, 0.6, 0.12, 31);
    dune(b, S('sand-wrack'), move(f, 1.3, 0, 0.3), 0.6, 0.4, 0.08, 32);
  });
  const towel = (b: MeshBuilder, f: Pose, tex: string): void => box(b, tex, f, [0, 0.012, 0], [0.45, 0.012, 0.9]);
  ['canvas-stripe-blue', 'canvas-stripe-red', 'canvas-stripe-yellow'].forEach((c, i) => A(`beach-towel-${c.replace('canvas-stripe-', '')}`, `ビーチタオル ${['青縞', '赤縞', '黄縞'][i]}`, (b, f) => towel(b, f, S(c))));
  A('beach-towel-set', 'ビーチタオル2枚とバッグ、ボール', (b, f) => {
    towel(b, f, S('canvas-stripe-red'));
    towel(b, turn(move(f, 1.15, 0, 0.1), 7), S('canvas-white'));
    box(b, S('canvas-stripe-blue'), turn(move(f, 0.6, 0, -1.1), 20), [0, 0.14, 0], [0.22, 0.14, 0.12]);
    ball(b, S('canvas-stripe-yellow'), f, [-0.7, 0.17, 0.5], 0.17, 10);
  });
  A('sandcastle', '砂の城', (b, f) => {
    const sand = S('sand-wet');
    lathe(b, sand, f, [[0.75, 0], [0.6, 0.12], [0.34, 0.14], [0.3, 0.36], [0.2, 0.38], [0.16, 0.52], [0, 0.6]], 10);
    for (const [x, z] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) lathe(b, sand, move(f, x, 0, z), [[0.17, 0], [0.13, 0.26], [0, 0.36]], 8);
    // The bucket and spade that made it.
    lathe(b, 'trim/paint-red', move(f, 1.1, 0, 0.2), [[0.09, 0], [0.12, 0.2], [0.11, 0.2], [0.08, 0.02], [0, 0.02]], 10);
    box(b, 'trim/paint-blue', turn(move(f, 1, 0, -0.3), 30), [0, 0.012, 0], [0.05, 0.012, 0.2]);
  });
  A('beach-sign-rules', 'ビーチ規則看板', (b, f) => {
    for (const sx of [-1, 1]) box(b, 'signal/pole-wood', f, [sx * 0.52, 1.1, 0], [0.05, 1.1, 0.05], 'Y');
    plate(b, S('sign-beach-rules'), f, [0, 1.5, 0.06]);
  });
  A('beach-sign-rip', '離岸流注意の標識', (b, f) => {
    b.tube('trim/paint-galvanized', at(f, 0, 0, 0), at(f, 0, 2.3, 0), 0.03, 6, 0.03, true);
    plate(b, S('sign-rip-current'), f, [0, 1.95, 0.035]);
    plate(b, S('sign-no-diving'), f, [0, 1.3, 0.035]);
  });
  const HUTS: [string, string][] = [['wall/siding-blue', 'roof/shingle-grey'], ['wall/siding-yellow', 'roof/shingle-red'], ['wall/siding-red', 'roof/shingle-charcoal'], ['wall/siding-green', 'roof/shingle-brown'], ['wall/siding-white', 'roof/shingle-blue']];
  HUTS.forEach(([wall, roof], i) => A(`beach-hut-${wall.replace('wall/siding-', '')}`, `ビーチ小屋 ${['青', '黄', '赤', '緑', '白'][i]}`, (b, f) => {
    box(b, S('deck-grey'), f, [0, 0.15, 0.4], [1.2, 0.15, 1.8]);
    hut(b, turn(move(f, 0, 0.3, 0), 90), 2.4, 2.2, 2.1, { wall, roof, rise: 0.8, over: 0.2, win: undefined });
    box(b, i % 2 ? 'door/front-white-0' : 'door/front-blue-2', f, [0, 1.35, 1.205], [0.42, 1.02, 0.01]);
  }));
  A('beach-huts-row', 'ビーチ小屋 5棟並び', (b, f) => {
    HUTS.forEach(([wall, roof], i) => {
      const g = move(f, i * 2.7, 0, 0);
      box(b, S('deck-grey'), g, [0, 0.15, 0.4], [1.3, 0.15, 1.8]);
      hut(b, turn(move(g, 0, 0.3, 0), 90), 2.4, 2.2, 2.1, { wall, roof, rise: 0.8, over: 0.2 });
      box(b, 'door/front-white-0', g, [0, 1.35, 1.205], [0.42, 1.02, 0.01]);
    });
  });
  A('fire-pit', '砂浜のたき火台', (b, f) => {
    lathe(b, 'structure/wall-old', f, [[1.1, 0], [1.1, 0.45], [0.85, 0.45], [0.85, 0.12], [0, 0.12]], 14);
    for (let i = 0; i < 5; i++) b.tube('trim/paint-black', at(f, Math.cos(i * 1.3) * 0.6, 0.16, Math.sin(i * 1.3) * 0.6), at(f, -Math.cos(i * 1.3 + 0.5) * 0.4, 0.3, -Math.sin(i * 1.3 + 0.5) * 0.4), 0.07, 6, 0.06, true);
  });
  const BOARDS = ['plastic-yellow', 'hull-white', 'plastic-blue', 'plastic-red', 'hull-green', 'plastic-orange'];
  A('surfboard', 'サーフボード 立てかけ', (b, f) => surfboard(b, f, S('hull-white'), 2.1, 10));
  A('surfboard-rack', 'サーフボードラック 6枚', (b, f) => {
    for (const sx of [-1.7, 1.7]) box(b, 'signal/pole-wood', f, [sx, 0.7, -0.3], [0.05, 0.7, 0.05], 'Y');
    box(b, 'signal/pole-wood', f, [0, 1.3, -0.3], [1.75, 0.04, 0.04]);
    box(b, 'signal/pole-wood', f, [0, 0.06, 0.15], [1.75, 0.04, 0.04]);
    BOARDS.forEach((c, i) => surfboard(b, move(f, -1.4 + i * 0.56, 0.1, 0.12), S(c), 1.7 + hash(i, 4) * 0.6, 14));
  });
  A('beach-cabana', 'ビーチの日よけテント', (b, f) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tube('trim/paint-white', at(f, sx * 1.5, 0, sz * 1.5), at(f, sx * 1.5, 2.2, sz * 1.5), 0.03, 6);
    canopy(b, S('canvas-white'), turn(f, 45), [0, 2.2, 0], 2.2, 0.8, 4);
    lounger(b, move(f, 0, 0, 0.5), S('canvas-white'), 'signal/pole-wood');
    lounger(b, move(f, 0, 0, -0.5), S('canvas-white'), 'signal/pole-wood');
  });

  // Harbour buildings and working gear.
  A('bait-shop', '釣具・えさ店', (b, f) => {
    box(b, S('deck-grey'), f, [0, 0.1, 0.6], [3.6, 0.1, 3]);
    hut(b, move(f, 0, 0.2, 0), 6, 3.6, 2.6, { wall: 'wall/siding-white-peeling', roof: 'roof/corrugated-rusty', rise: 0.9, over: 0.5, door: 'door/front-blue-2', win: 'window/slider-aluminium', winU: 1.6, wins: 2, sign: S('sign-bait') });
    box(b, 'trim/paint-white', f, [2.2, 0.75, 2.4], [0.7, 0.55, 0.4]);
    box(b, 'trim/paint-blue', f, [2.2, 1.33, 2.4], [0.72, 0.03, 0.42]);
    for (let i = 0; i < 3; i++) ball(b, S(i % 2 ? 'buoy-orange' : 'buoy-red'), f, [-3.05 - 0 * i, 2.2 - i * 0.45, 1.5 + i * 0.1], 0.2, 8);
  });
  A('harbor-office', '港務所・マリーナ事務所', (b, f) => {
    hut(b, f, 8, 5, 3, { wall: 'wall/siding-grey', roof: 'roof/seam-blue', rise: 1.2, over: 0.5, door: 'door/front-white-0', win: 'window/sash-white', winU: 1.2, wins: 3, sign: S('sign-marina') });
    flagPole(b, move(f, 4.6, 0, 3), 6, S('flag-green'));
    b.tube('trim/paint-white', at(f, -3, 4.2, 0), at(f, -3, 7.5, 0), 0.04, 6);
    for (const y of [5.8, 6.6]) b.tube('trim/paint-white', at(f, -3.8, y, 0), at(f, -2.2, y, 0), 0.02, 5);
  });
  A('boathouse', 'ボート小屋 水上', (b, f) => {
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) lathe(b, S('pile-wood'), move(f, sx * 3, -2, -4.5 + i * 3), [[0.16, 0], [0.16, 2.8]], 8);
    for (const sx of [-1, 1]) box(b, S('deck-grey'), f, [sx * 2.9, 0.8, 0], [0.7, 0.06, 5]);
    for (const sx of [-1, 1]) box(b, 'wall/batten-barn-red', f, [sx * 3.5, 2.4, 0], [0.06, 1.6, 5]);
    box(b, 'wall/batten-barn-red', f, [0, 2.4, -5], [3.5, 1.6, 0.06]);
    box(b, 'wall/batten-barn-red', f, [0, 3.6, 5], [3.5, 0.4, 0.06]);
    for (const sz of [-1, 1]) b.quad('roof/shingle-grey', at(f, -sz * 4, 3.9, sz * 5.4 * 0 + (sz > 0 ? 5.4 : -5.4)), at(f, sz * 4, 3.9, sz > 0 ? 5.4 : -5.4), at(f, sz * 4, 3.9, 0), at(f, -sz * 4, 3.9, 0), [[0, 0], [8, 0], [8, 5.4], [0, 5.4]]);
    for (const sx of [-1, 1]) {
      b.quad('roof/shingle-grey', at(f, sx * 4, 3.9, sx * 5.4), at(f, sx * 4, 3.9, -sx * 5.4), at(f, 0, 5.6, -sx * 5.4), at(f, 0, 5.6, sx * 5.4), [[0, 0], [10.8, 0], [10.8, 4.4], [0, 4.4]]);
      b.quad('trim/paint-charcoal', at(f, sx * 4, 3.9, -sx * 5.4), at(f, sx * 4, 3.9, sx * 5.4), at(f, 0, 5.6, sx * 5.4), at(f, 0, 5.6, -sx * 5.4), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    for (const sz of [-1, 1]) b.tri('wall/batten-barn-red', at(f, -sz * 3.5, 4, sz * 5), at(f, sz * 3.5, 4, sz * 5), at(f, 0, 5.5, sz * 5), [[0, 0], [7, 0], [3.5, 1.5]]);
    boat(b, move(f, 0, 0, 0.5), { kind: 'skiff', inside: 'trim/paint-white' });
  });
  A('fish-crates', '魚箱の山', (b, f) => {
    const cols = ['plastic-blue', 'plastic-orange', 'plastic-green', 'plastic-red', 'plastic-yellow'];
    for (let i = 0; i < 14; i++) {
      const [c, l] = [i % 4, Math.floor(i / 4)];
      if (l === 3 && c > 1) continue;
      box(b, S(cols[Math.floor(hash(i, 5) * 5)]), turn(move(f, (c - 1.5) * 0.85, l * 0.3, hash(i, 6) * 0.08), hash(i, 7) * 8 - 4), [0, 0.15, 0], [0.4, 0.15, 0.3], 'y');
    }
  });
  const trap = (b: MeshBuilder, g: Pose): void => {
    box(b, 'signal/pole-wood-grey', g, [0, 0.02, 0], [0.45, 0.02, 0.3]);
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) box(b, 'signal/pole-wood-grey', g, [sx * 0.43, 0.2, sz * 0.28], [0.02, 0.2, 0.02]);
    box(b, S('net-green'), g, [0, 0.21, 0], [0.44, 0.19, 0.29], 'Y');
  };
  A('lobster-traps', 'エビかごの山', (b, f) => {
    for (let i = 0; i < 9; i++) {
      const l = i < 4 ? 0 : i < 7 ? 1 : 2;
      const c = i < 4 ? i : i < 7 ? i - 4 + 0.5 : i - 7 + 1;
      trap(b, turn(move(f, (c - 1.5) * 0.95, l * 0.42, 0), hash(i, 8) * 10 - 5));
    }
    for (let i = 0; i < 3; i++) ball(b, S(i % 2 ? 'buoy-yellow' : 'buoy-orange'), f, [-0.8 + i * 0.5, 0.15, 0.6], 0.15, 8);
  });
  A('net-pile', '漁網の山 浮き玉つき', (b, f) => {
    boulder(b, S('net-fishing'), f, [0, 0.25, 0], [1.3, 0.55, 1], 81, 6);
    boulder(b, 'furniture/bag-black', f, [0, 0.22, 0], [1.2, 0.5, 0.92], 81, 6);
    for (let i = 0; i < 7; i++) ball(b, S(i % 2 ? 'buoy-orange' : 'buoy-yellow'), f, [Math.cos(i * 0.9) * 0.8, 0.45 + hash(i, 9) * 0.2, Math.sin(i * 0.9) * 0.6], 0.09, 6);
  });
  A('net-drying', '漁網の干し場', (b, f) => {
    for (const sx of [0, 4, 8]) for (const sz of [-1, 1]) b.beam('signal/pole-wood-grey', at(f, sx, 0, sz * 0.9), at(f, sx, 2.2, 0), 0.08, 0.08);
    b.tube('signal/pole-wood-grey', at(f, -0.3, 2.2, 0), at(f, 8.3, 2.2, 0), 0.05, 6, 0.05, true);
    for (const sz of [-1, 1]) b.quad(S('net-fishing'), at(f, 0.2, 0.3, sz * 0.8), at(f, 7.8, 0.3, sz * 0.8), at(f, 7.8, 2.2, 0), at(f, 0.2, 2.2, 0), [[0, 0], [7.6, 0], [7.6, 2], [0, 2]]);
    for (const sz of [-1, 1]) b.quad(S('net-fishing'), at(f, 7.8, 0.3, sz * 0.8), at(f, 0.2, 0.3, sz * 0.8), at(f, 0.2, 2.2, 0), at(f, 7.8, 2.2, 0), [[0, 0], [7.6, 0], [7.6, 2], [0, 2]]);
  });
  A('fuel-dock', '給油桟橋', (b, f) => {
    floatDock(b, f, 12, { w: 3 });
    for (const x of [4, 8]) {
      box(b, 'trim/paint-white', f, [x, 1.15, -0.6], [0.4, 0.7, 0.25]);
      box(b, 'trim/paint-red', f, [x, 1.95, -0.6], [0.45, 0.1, 0.3]);
      pipe(b, 'trim/paint-black', [at(f, x + 0.3, 1.5, -0.34), at(f, x + 0.5, 0.9, -0.1), at(f, x + 0.2, 0.6, 0.1), at(f, x - 0.2, 1.2, -0.33)], 0.02, 5);
    }
    box(b, 'trim/paint-red', f, [1.2, 0.75, -0.9], [0.3, 0.3, 0.3]);
    plate(b, S('sign-no-fishing'), f, [11, 1.6, -1.2]);
    b.tube('trim/paint-galvanized', at(f, 11, 0.45, -1.24), at(f, 11, 1.9, -1.24), 0.025, 6);
  });
  A('marina-slips', 'マリーナ 係留区画 船つき', (b, f) => {
    floatDock(b, f, 36, { w: 2.6, pileSide: 0, cleats: false });
    const kinds: [BoatKind, string][] = [['sail', 'hull-white'], ['cruiser', 'hull-white'], ['sail', 'hull-blue'], ['skiff', 'hull-white'], ['cruiser', 'hull-black'], ['sail', 'hull-red'], ['rib', 'buoy-orange'], ['sail', 'hull-white']];
    for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) {
      const g = turn(move(f, 3 + i * 7.5, 0, sz * 1.3), -sz * 90);
      floatDock(b, g, 10, { w: 1.1, pileSide: 0 });
      lathe(b, S('pile-steel'), move(g, 10.4, -2, 0), [[0.16, 0], [0.16, 5.2], [0, 5.5]], 8);
      const k = kinds[(i * 2 + (sz > 0 ? 1 : 0) + 3) % kinds.length];
      if (hash(i * 2 + sz, 11) > 0.25 && i < 4) boat(b, turn(move(f, 3 + i * 7.5 + 3.6, 0, sz * (1.3 + 5.4)), sz * 90), { kind: k[0], side: S(k[1]), s: 0.9 });
    }
    plate(b, S('sign-slip-numbers'), f, [1.4, 1.3, 0]);
    for (const sx of [0.3, 2.5]) b.tube('trim/paint-galvanized', at(f, sx, 0.45, -0.03), at(f, sx, 1.45, -0.03), 0.02, 5);
  });
  A('piling', '係留杭 1本', (b, f) => {
    lathe(b, S('pile-wood'), move(f, 0, -2, 0), [[0.2, 0], [0.18, 5], [0, 5.05]], 8);
    lathe(b, 'trim/paint-white', move(f, 0, 3, 0), [[0.19, 0], [0.19, 0.06], [0, 0.35]], 8);
  });
  A('piling-dolphin', '係留杭 束ね杭(ドルフィン)', (b, f) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = i === 6 ? 0 : 0.9;
      const g: Pose = { ...move(f, Math.cos(a) * r, -2, Math.sin(a) * r), y: i === 6 ? f.y : at({ ...f, o: [0, 0, 0] }, -Math.cos(a) * 0.1, 1, -Math.sin(a) * 0.1) };
      lathe(b, S(i % 2 ? 'pile-wood' : 'pile-wood-grey'), g, [[0.19, 0], [0.17, 5.4 + (i === 6 ? 0.5 : hash(i, 12) * 0.3)], [0, 5.45 + (i === 6 ? 0.5 : hash(i, 12) * 0.3)]], 8);
    }
    for (const y of [2.1, 2.5]) torus(b, 'furniture/cable', f, [0, y, 0], 0.66 - (y - 2.1) * 0.1, 0.04, 12, 4);
  });
  A('piling-row', '古い杭の列 朽ちた桟橋跡', (b, f) => {
    for (let i = 0; i < 9; i++) for (const sz of [-1, 1]) {
      if (hash(i * 2 + sz, 13) < 0.2) continue;
      const h = 0.4 + hash(i * 2 + sz, 14) * 2.2;
      lathe(b, S('pile-wood-grey'), { ...move(f, i * 2.6 + hash(i, 15) * 0.3, -2, sz * 1.3), y: at({ ...f, o: [0, 0, 0] }, (hash(i * 2 + sz, 16) - 0.5) * 0.2, 1, (hash(i * 2 + sz, 17) - 0.5) * 0.2) }, [[0.17, 0], [0.15, 2 + h], [0.06, 2.08 + h], [0, 2.08 + h]], 7);
    }
  });
  A('harbor-light', '港の照明柱 投光器', (b, f) => {
    b.tube('trim/paint-galvanized', at(f, 0, 0, 0), at(f, 0, 14, 0), 0.2, 8, 0.11, true);
    box(b, 'trim/paint-galvanized', f, [0, 14, 0], [1.4, 0.06, 0.25]);
    for (let i = 0; i < 4; i++) {
      box(b, 'trim/paint-charcoal', f, [-1.05 + i * 0.7, 14.3, 0.2], [0.25, 0.18, 0.1]);
      box(b, 'furniture/led-strip-on', f, [-1.05 + i * 0.7, 14.3, 0.305], [0.22, 0.15, 0.005]);
    }
    box(b, 'concrete/walk-plain', f, [0, 0.15, 0], [0.45, 0.15, 0.45], 'Y');
  });
  A('pier-pavilion', '桟橋 先端にあずまや', (b, f) => {
    pier(b, f, 26, { w: 4, brace: true, head: [12, 12], lamps: 9, rail: 'white', railMat: 'trim/paint-white' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.tube('trim/paint-white', at(f, 32 + Math.cos(a) * 3.6, 2.2, Math.sin(a) * 3.6), at(f, 32 + Math.cos(a) * 3.6, 5, Math.sin(a) * 3.6), 0.08, 6);
    }
    canopy(b, 'roof/shingle-green', move(f, 32, 0, 0), [0, 5, 0], 4.3, 2, 8);
    ball(b, 'trim/paint-white', f, [32, 7.1, 0], 0.2, 8);
  });
  A('gangway', '渡り橋 アルミ', (b, f) => gangway(b, f, 9, 2.2));
}
