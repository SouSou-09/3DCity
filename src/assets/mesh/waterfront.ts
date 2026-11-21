import { MeshBuilder } from './builder';
import { S } from './boundaries';
import { LightOpts, PierOpts, beacon, floatDock, gangway, lighthouse, pier, skeletonLight } from './marine';
import { Pose, stand } from './kit';
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
}
