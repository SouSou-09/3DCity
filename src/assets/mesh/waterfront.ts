import { MeshBuilder } from './builder';
import { S } from './boundaries';
import { PierOpts, floatDock, gangway, pier } from './marine';
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
    floatDock(b, stand([8, 0, -4], -90), 14, { pileSide: -1 });
  });
}
