import { MeshBuilder, ModelData, Path, arc, grade, hump, sCurve, straight, through } from './builder';
import { Arm, Control, junction, roundabout } from './junction';
import { Age, StreetOpts, highway, plainTex, street } from './presets';
import { Section, edgeElement, layout, reversed, stamp, sweepSection } from './section';
import { addSidewalks } from './sidewalks';
import { addSignals } from './signals';
import { addSigns } from './signs';
import { addFurniture } from './furniture';
import { addPlants } from './plants';
import { addHouses } from './houses';
import { addBlocks } from './blocks';
import { addTowers } from './towers';
import { addWorks } from './works';
import { addBuildParts } from './buildparts';
import { addTracks } from './tracks';
import { addCrossings } from './crossings';
import { addRailParts } from './railparts';
import { addStations } from './stations';
import { addStructures } from './structures';

export type ModelCategory = 'segment' | 'highway' | 'slope' | 'curve' | 'junction' | 'roundabout' | 'sidewalk' | 'bridge' | 'elevated' | 'signal' | 'sign' | 'furniture' | 'plant' | 'house' | 'apartment' | 'shop' | 'office' | 'industrial' | 'buildpart' | 'track' | 'crossing' | 'station' | 'railpart';
export const MODEL_CATEGORIES: [ModelCategory, string][] = [
  ['segment', '道路区間'],
  ['highway', '高速道路・ランプ'],
  ['slope', '坂'],
  ['curve', 'カーブ'],
  ['junction', '交差点'],
  ['roundabout', 'ロータリー・袋小路'],
  ['sidewalk', '歩道・縁石'],
  ['bridge', '橋'],
  ['elevated', '高架・立体交差'],
  ['signal', '信号機'],
  ['sign', '標識・工事用品'], ['furniture', '歩道設備'], ['plant', '樹木・植栽'],
  ['house', '戸建て住宅'], ['apartment', '集合住宅'], ['shop', '店舗・商業'], ['office', 'オフィス・高層'], ['industrial', '工場・倉庫'], ['buildpart', '建物の部品'],
  ['track', '線路'], ['crossing', '踏切'], ['station', '駅'], ['railpart', '鉄道設備'],
];

export interface ModelSpec {
  id: string;
  label: string;
  category: ModelCategory;
  build: () => ModelData;
}

const models: ModelSpec[] = [];
export function addModel(category: ModelCategory, id: string, label: string, fn: (b: MeshBuilder) => void): void {
  models.push({
    id: `${category}/${id}`,
    label,
    category,
    build: () => {
      const b = new MeshBuilder();
      fn(b);
      return b.build();
    },
  });
}

/** Scatters covers and stains on a road so that it does not look freshly rendered. */
export function litter(b: MeshBuilder, path: Path, sec: Section, seed: number, amount = 1): void {
  const lay = layout(sec);
  const L = path[path.length - 1].s;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const covers = ['cover/manhole-waffle', 'cover/manhole-radial', 'cover/manhole-rings', 'cover/manhole-dots', 'cover/manhole-city', 'cover/manhole-waffle-rusty', 'cover/utility-rect', 'cover/valve-small', 'cover/manhole-small'];
  const stains = ['cover/oil-stain-1', 'cover/oil-stain-2', 'cover/oil-stain-3', 'cover/tar-snakes', 'cover/patch-square', 'cover/skid-1', 'cover/puddle-dry'];
  const drive = lay.lanes.filter((l) => l.lane.kind === 'drive' || l.lane.kind === 'bus');
  if (!drive.length) return;
  const count = Math.round((L / 14) * amount);
  for (let i = 0; i < count; i++) {
    const lane = drive[Math.floor(rnd() * drive.length)];
    const id = rnd() < 0.55 ? covers[Math.floor(rnd() * covers.length)] : stains[Math.floor(rnd() * stains.length)];
    const len = b.part(id, 3).mh;
    const at = 1 + rnd() * Math.max(0.1, L - len - 2);
    stamp(b, path, id, at, lane.x0 + (lane.x1 - lane.x0) * (0.3 + rnd() * 0.4));
  }
  // Storm drains in the gutter.
  for (const [side, x] of [[sec.left, lay.road[0] + 0.3], [sec.right, lay.road[1] - 0.3]] as const) {
    if (!side.gutter) continue;
    for (let at = 6 + rnd() * 6; at < L - 2; at += 28) stamp(b, path, rnd() < 0.5 ? 'cover/storm-grate' : 'cover/storm-grate-rusty', at, x, { width: 0.55 });
  }
}

const road = (b: MeshBuilder, path: Path, sec: Section, seed: number): void => {
  sweepSection(b, path, sec);
  litter(b, path, sec, seed);
};

// --- Straight street segments: every street type of the city in several conditions. ---
const STREETS: [string, string, StreetOpts][] = [
  ['alley', '路地(歩道なし・コンクリート)', { lanes: 1, oneWay: true, laneW: 4, walk: null, curb: null, age: 'bleached', wear: 'broken', ground: { w: 0.5, tex: 'concrete/walk-plain' } }],
  ['alley-setts', '路地(石畳)', { lanes: 1, oneWay: true, laneW: 4.2, walk: null, curb: null, age: 'worn', ground: { w: 0.4, tex: 'paving/setts-granite' } }],
  ['local-unmarked', '生活道路 中央線なし', { lanes: 1, laneW: 3, centre: null, walkW: 1.6, age: 'worn', wear: 'patched' }],
  ['local-parking', '生活道路 両側駐車', { lanes: 1, laneW: 3, parking: 2, centre: null, verge: 'ground/grass-patchy', walkW: 1.5, age: 'used', wear: 'cracked' }],
  ['local-verge', '住宅街 芝の植栽帯', { lanes: 1, laneW: 3.2, parking: 1, verge: 'ground/grass-lush', vergeW: 1.8, walkW: 1.5, age: 'used' }],
  ['local-rolled', '郊外 ロール縁石・歩道なし', { lanes: 1, laneW: 3.4, centre: null, walk: null, verge: 'ground/grass-mown', vergeW: 2, age: 'used', left: { rolled: true }, }],
  ['local-oneway', '一方通行 片側駐車', { lanes: 1, oneWay: true, laneW: 3.4, parking: 1, walkW: 2, age: 'worn', wear: 'sealed', arrows: true }],
  ['oldtown-setts', '旧市街 石畳の車道', { lanes: 1, laneW: 3, centre: null, walk: 'paving/slabs-sandstone', walkW: 1.8, curb: 'curb/granite', age: 'worn' }],
  ['oldtown-brick-walk', '旧市街 レンガ歩道', { lanes: 1, laneW: 3.1, parking: 1, walk: 'paving/herringbone-red', walkW: 2.2, curb: 'curb/granite', age: 'worn', wear: 'patched' }],
  ['collector', '補助幹線 2車線', { lanes: 1, laneW: 3.5, parking: 2, walkW: 2.4, age: 'used' }],
  ['collector-bike', '補助幹線 自転車レーン', { lanes: 1, laneW: 3.4, bike: 'plain', parking: 1, walkW: 2.4, age: 'used', wear: 'cracked' }],
  ['collector-bike-green', '補助幹線 緑の自転車レーン', { lanes: 1, laneW: 3.4, bike: 'green', walkW: 2.6, walk: 'concrete/walk-small', age: 'fresh' }],
  ['collector-buffered', '補助幹線 緩衝帯付き自転車レーン', { lanes: 1, laneW: 3.4, bike: 'buffered', walkW: 2.4, age: 'used' }],
  ['collector-turn', '補助幹線 中央右左折帯', { lanes: 1, laneW: 3.5, median: 'turn', walkW: 2.2, verge: 'ground/grass-dry', age: 'worn', wear: 'sealed' }],
  ['arterial-4', '幹線 4車線', { lanes: 2, walkW: 3, age: 'used', wear: 'cracked' }],
  ['arterial-4-turn', '幹線 4車線+中央右左折帯', { lanes: 2, median: 'turn', walkW: 3, age: 'worn', wear: 'sealed' }],
  ['arterial-4-median', '幹線 4車線+植栽中央分離帯', { lanes: 2, median: 'planted', walkW: 3, verge: 'ground/mulch', age: 'used' }],
  ['arterial-4-raised', '幹線 4車線+コンクリート中央分離帯', { lanes: 2, median: 'raised', medianW: 1.6, walkW: 2.6, age: 'worn', wear: 'patched' }],
  ['arterial-4-bus', '幹線 4車線 バスレーン', { lanes: 2, bus: true, walkW: 3.2, walk: 'concrete/walk-dark', age: 'used' }],
  ['arterial-4-bike-parking', '幹線 4車線+自転車+駐車', { lanes: 2, bike: 'blue', parking: 2, walkW: 3, age: 'used', wear: 'cracked' }],
  ['arterial-6-median', '大通り 6車線+植栽中央分離帯', { lanes: 3, median: 'planted', medianW: 4, medianTex: 'ground/grass-mown', walkW: 3.6, walk: 'concrete/walk-long', age: 'used' }],
  ['arterial-6-barrier', '大通り 6車線+防護柵分離', { lanes: 3, median: 'barrier', walkW: 2.4, age: 'worn', wear: 'cracked' }],
  ['arterial-oneway-3', '一方通行 3車線', { lanes: 3, oneWay: true, parking: 2, walkW: 3.4, age: 'used', wear: 'sealed', arrows: true }],
  ['arterial-oneway-4-bus', '一方通行 4車線 バスレーン', { lanes: 4, oneWay: true, bus: true, walkW: 4, walk: 'paving/slabs-granite', curb: 'curb/granite', age: 'used' }],
  ['downtown-plaza', '都心 石張りの広い歩道', { lanes: 2, walk: 'paving/slabs-dark', walkW: 5, curb: 'curb/granite', age: 'fresh', edge: 'bollards', edgeTex: 'structure/steel-black' }],
  ['downtown-brick', '都心 ブロック舗装の歩道+駐車', { lanes: 2, parking: 2, walk: 'paving/basket-tan', walkW: 4, age: 'used', wear: 'patched' }],
  ['beach-boardwalk', '海岸通り 板張り遊歩道', { lanes: 1, parking: 1, bike: 'green', walk: 'concrete/walk-new', walkW: 2, age: 'bleached', left: { walk: { w: 5, tex: 'paving/boardwalk' }, edge: 'railing', edgeTex: 'structure/steel-white' } }],
  ['beach-sand', '海岸通り 砂の路肩', { lanes: 1, laneW: 3.4, walk: null, curb: null, age: 'bleached', wear: 'cracked', ground: { w: 2, tex: 'ground/sand' } }],
  ['industrial', '工業地区 広い車線・砂利路肩', { lanes: 1, laneW: 4.2, walk: null, curb: null, age: 'bleached', wear: 'broken', ground: { w: 1.8, tex: 'ground/gravel-dirt' } }],
  ['industrial-4', '工業地区 4車線 片側歩道', { lanes: 2, laneW: 3.8, walkW: 1.8, age: 'worn', wear: 'broken', left: { walk: undefined, curb: undefined, gutter: false, ground: { w: 1.5, tex: 'ground/gravel' }, edge: 'fence' } }],
  ['industrial-concrete', '工業地区 コンクリート舗装', { lanes: 1, laneW: 4, walk: null, age: 'worn', centre: null, ground: { w: 1.2, tex: 'ground/gravel-dirt' }, curb: null }],
  ['hills-guardrail', '丘陵 ガードレール・歩道なし', { lanes: 1, laneW: 3.2, walk: null, curb: null, age: 'worn', wear: 'sealed', ground: { w: 0.8, tex: 'ground/gravel-dirt' }, edge: 'guardrail', left: { edge: 'wall', ground: { w: 0.4, tex: 'concrete/gutter' } } }],
  ['hills-narrow', '丘陵 狭い道・石積み擁壁', { lanes: 1, laneW: 2.7, centre: null, walk: null, curb: null, age: 'bleached', wear: 'cracked', ground: { w: 0.6, tex: 'ground/grass-dead' }, edge: 'cable' }],
  ['suburb-wide', '郊外 広い2車線・芝', { lanes: 1, laneW: 3.7, bike: 'plain', verge: 'ground/grass-mown', vergeW: 2.4, walkW: 1.5, age: 'fresh' }],
  ['suburb-median', '郊外 並木の中央分離帯', { lanes: 1, laneW: 3.6, median: 'planted', medianW: 5, verge: 'ground/grass-lush', vergeW: 2, walkW: 1.5, age: 'used' }],
  ['school-zone', '通学路 カラー舗装', { lanes: 1, laneW: 3.2, walkW: 2.2, age: 'used', edge: 'railing', edgeTex: 'structure/steel-green' }],
];
STREETS.forEach(([id, label, o], i) => {
  addModel('segment', id, label, (b) => {
    const sec = street(o);
    if (id === 'oldtown-setts') for (const l of sec.lanes) l.tex = 'paving/setts-large-tan';
    if (id === 'alley-setts') for (const l of sec.lanes) l.tex = 'paving/setts-granite';
    if (id === 'industrial-concrete') for (const l of sec.lanes) l.tex = 'concrete/road-smooth-cracked';
    if (id === 'school-zone') {
      for (const l of sec.lanes) l.tex = 'asphalt/coat-school-yellow-50';
      sec.lanes[0].symbols = ['symbol/text-school', 'symbol/text-slow'];
      sec.lanes[1].symbols = ['symbol/text-25', 'symbol/text-school'];
    }
    road(b, straight(36, 1), sec, i + 1);
  });
});
// The same streets age differently.
const AGES: [Age, string][] = [['fresh', '舗装直後'], ['used', '使用感'], ['worn', '老朽'], ['bleached', '退色・荒廃']];
for (const [age, alabel] of AGES) {
  addModel('segment', `age-collector-${age}`, `経年変化 2車線・${alabel}`, (b) => road(b, straight(36, 1), street({ lanes: 1, parking: 1, age, wear: age === 'fresh' ? 'clean' : age === 'used' ? 'cracked' : age === 'worn' ? 'patched' : 'broken', walk: age === 'fresh' ? 'concrete/walk-new' : age === 'bleached' ? 'concrete/walk-square-cracked' : 'concrete/walk-square-dirty', curb: age === 'bleached' ? 'curb/dirty' : 'curb/plain' }), 40));
  addModel('segment', `age-arterial-${age}`, `経年変化 4車線・${alabel}`, (b) => road(b, straight(36, 1), street({ lanes: 2, median: 'turn', age, wear: age === 'fresh' ? 'clean' : age === 'used' ? 'sealed' : age === 'worn' ? 'patched' : 'broken', curb: age === 'worn' ? 'curb/red-worn' : 'curb/plain' }), 41));
}
// Painted kerb zones.
for (const [c, label] of [['red', '赤縁石(駐停車禁止)'], ['yellow', '黄縁石(荷捌き)'], ['white', '白縁石(乗降)'], ['green', '緑縁石(短時間)'], ['blue', '青縁石(障害者用)']] as const) {
  addModel('segment', `zone-${c}`, `2車線 ${label}`, (b) => {
    const sec = street({ lanes: 1, parking: 1, curb: `curb/${c}`, age: 'used' });
    const path = straight(24, 1);
    const lay = sweepSection(b, path, sec);
    const park = lay.lanes[lay.lanes.length - 1];
    const cx = (park.x0 + park.x1) / 2;
    if (c === 'blue') stamp(b, path, 'symbol/handicap-new', 11, cx);
    if (c === 'yellow') stamp(b, path, 'symbol/text-loading-worn', 6, cx, { width: 2 });
    if (c === 'white') stamp(b, path, 'symbol/text-taxi-new', 8, cx, { width: 1.8 });
    if (c === 'green') stamp(b, path, 'symbol/ev-charge-new', 11, cx);
    if (c === 'red') stamp(b, path, 'symbol/fire-lane-worn', 9, cx, { width: 2.2 });
  });
}

// --- Motorways and ramps at ground level. ---
const GRASS = { w: 3, tex: 'ground/grass-dry' };
addModel('highway', 'dual-2', '高速 片側2車線 防護柵', (b) => road(b, straight(60, 1), highway({ lanes: 2, ground: GRASS, edge: 'guardrail' }), 1));
addModel('highway', 'dual-3', '高速 片側3車線 防護柵', (b) => road(b, straight(60, 1), highway({ lanes: 3, ground: GRASS, edge: 'guardrail', wear: 'sealed' }), 2));
addModel('highway', 'dual-4-hov', '高速 片側4車線 HOVレーン', (b) => road(b, straight(60, 1), highway({ lanes: 4, hov: true, ground: GRASS, edge: 'barrier', age: 'worn', wear: 'cracked' }), 3));
addModel('highway', 'dual-3-concrete', '高速 コンクリート舗装', (b) => road(b, straight(60, 1), highway({ lanes: 3, concrete: true, ground: { w: 3, tex: 'ground/gravel-dirt' }, edge: 'barrier' }), 4));
addModel('highway', 'dual-2-grass-median', '高速 芝の広い中央分離帯', (b) => road(b, straight(60, 1), highway({ lanes: 2, median: 'planted', medianW: 9, ground: GRASS, edge: 'cable', age: 'fresh' }), 5));
addModel('highway', 'dual-3-guardrail-median', '高速 ガードレール中央分離', (b) => road(b, straight(60, 1), highway({ lanes: 3, median: 'guardrail', medianW: 2.4, ground: GRASS, edge: 'guardrail', age: 'bleached', wear: 'broken' }), 6));
addModel('highway', 'dual-2-walled', '高速 掘割(擁壁)', (b) => road(b, straight(60, 1), highway({ lanes: 2, edge: 'wall', age: 'worn', wear: 'patched' }), 7));
addModel('highway', 'ramp-1', 'ランプ 1車線', (b) => road(b, straight(40, 1), highway({ lanes: 1, dual: false, shoulder: 2.4, ground: GRASS, edge: 'guardrail' }), 8));
addModel('highway', 'ramp-2', 'ランプ 2車線', (b) => road(b, straight(40, 1), highway({ lanes: 2, dual: false, shoulder: 2.4, ground: GRASS, edge: 'barrier', age: 'worn', wear: 'sealed' }), 9));
addModel('highway', 'ramp-1-curve', 'ランプ 1車線 カーブ(片勾配)', (b) => road(b, arc(45, 1.4, 0, 0.06), highway({ lanes: 1, dual: false, shoulder: 2.4, ground: GRASS, edge: 'guardrail' }), 10));
addModel('highway', 'ramp-loop', 'ランプ ループ(270°)', (b) => road(b, arc(32, -4.6, 6, 0.07), highway({ lanes: 1, dual: false, shoulder: 2, ground: GRASS, edge: 'guardrail', age: 'worn' }), 11));
addModel('highway', 'dual-2-curve', '高速 片側2車線 カーブ', (b) => road(b, arc(180, 0.5, 0, 0.04), highway({ lanes: 2, ground: GRASS, edge: 'guardrail' }), 12));
addModel('highway', 'exit', '高速 出口(減速車線と分流)', (b) => {
  const main = highway({ lanes: 2, dual: false, ground: GRASS, edge: 'guardrail' });
  const ramp = highway({ lanes: 1, dual: false, shoulder: 2, innerShoulder: 0.6, ground: GRASS, edge: 'guardrail' });
  const wm = layout(main).outer[1] - GRASS.w;
  const wr = -layout(ramp).lanes[0].x0;
  main.right = {};
  sweepSection(b, straight(110, 1), main, { noRight: true });
  // The ramp runs alongside, then peels away.
  const off = wm + wr;
  const path = through([[off, 0, 0], [off, 0, -30], [off + 0.6, 0, -50], [off + 4, 0, -75], [off + 12, 0, -100], [off + 20, 0, -118]], 40);
  ramp.left = {};
  ramp.lines[0] = 'line/dashed-white-wide';
  ramp.lines[1] = null;
  sweepSection(b, path, ramp, { noLeft: true });
  stamp(b, straight(110, 1), 'symbol/gore-chevrons-worn', 62, wm + 0.2, { width: 3, flip: true });
  edgeElement(b, through([[wm + 1.2, 0, -78], [wm + 1.2, 0, -110]], 4), 'guardrail', 0, 0, 1);
  stamp(b, path, 'symbol/text-exit-new', 20, 0, { width: 2.2 });
});

// --- Slopes. ---
const hill = (): Section => street({ lanes: 1, parking: 1, walkW: 1.8, age: 'worn', wear: 'sealed' });
for (const [pct, label] of [[5, '緩い'], [9, '中'], [14, '急'], [20, '激坂']] as const) {
  addModel('slope', `grade-${pct}`, `坂 ${pct}%(${label})`, (b) => road(b, grade(48, (48 * pct) / 100), hill(), pct));
}
addModel('slope', 'crest', '坂の頂上(凸型)', (b) => road(b, hump(60, 4), street({ lanes: 1, parking: 2, age: 'used' }), 21));
addModel('slope', 'sag', '谷(凹型)', (b) => road(b, hump(60, -3.5), street({ lanes: 2, median: 'turn', age: 'used', wear: 'cracked' }), 22));
addModel('slope', 'arterial-grade-6', '幹線の坂 6%', (b) => road(b, grade(60, 3.6), street({ lanes: 2, median: 'raised', medianW: 1.6, age: 'used' }), 23));
addModel('slope', 'hill-road-wall', '山腹の坂 擁壁+ガードレール', (b) => road(b, grade(50, 5), street(STREETS.find((s) => s[0] === 'hills-guardrail')![2]), 24));
addModel('slope', 'hill-curve-climb', '登りカーブ 8%', (b) => road(b, arc(40, 1.2, 4, 0.03), street(STREETS.find((s) => s[0] === 'hills-guardrail')![2]), 25));
addModel('slope', 'hairpin', 'ヘアピンカーブ', (b) => road(b, arc(11, Math.PI, 3.5, 0.05, 28), street({ lanes: 1, laneW: 3.6, walk: null, curb: null, age: 'worn', wear: 'cracked', ground: { w: 1, tex: 'ground/gravel-dirt' }, edge: 'guardrail' }), 26));
addModel('slope', 'switchback', 'つづら折り(S字の登り)', (b) => road(b, through([[0, 0, 0], [0, 1, -18], [-9, 2.4, -30], [-20, 3.4, -24], [-22, 4.4, -10], [-32, 5.6, 0], [-44, 6.6, -6], [-46, 8, -24]], 70), street({ lanes: 1, laneW: 3.2, walk: null, curb: null, age: 'bleached', wear: 'cracked', ground: { w: 0.8, tex: 'ground/grass-dead' }, edge: 'cable' }), 27));
addModel('slope', 'highway-grade-4', '高速の坂 4%', (b) => road(b, grade(90, 3.6), highway({ lanes: 2, ground: GRASS, edge: 'guardrail' }), 28));
addModel('slope', 'ramp-grade', 'ランプの坂(地上から高架へ)', (b) => road(b, grade(70, 6.5), highway({ lanes: 1, dual: false, shoulder: 2, edge: 'parapet' }), 29));
addModel('slope', 'speed-hump', 'ハンプ(生活道路)', (b) => {
  const sec = street({ lanes: 1, laneW: 3, centre: null, walkW: 1.6, age: 'used' });
  const path = through([[0, 0, 0], [0, 0, -9], [0, 0.02, -10], [0, 0.1, -11.2], [0, 0.1, -12.8], [0, 0.02, -14], [0, 0, -15], [0, 0, -24]], 48);
  const lay = sweepSection(b, path, sec);
  for (const l of lay.lanes) stamp(b, path, 'symbol/speed-hump-chevrons-new', 10.2, (l.x0 + l.x1) / 2, { width: 2.6, flip: l.lane.dir === -1 });
});

// --- Curves. ---
addModel('curve', 'local-90', '生活道路 直角カーブ R12', (b) => road(b, arc(12, Math.PI / 2), street({ lanes: 1, laneW: 3, centre: null, walkW: 1.6, age: 'worn', wear: 'patched' }), 31));
addModel('curve', 'local-45', '生活道路 45°カーブ R25', (b) => road(b, arc(25, -Math.PI / 4), street({ lanes: 1, parking: 1, verge: 'ground/grass-lush', walkW: 1.5 }), 32));
addModel('curve', 'collector-60', '補助幹線 60°カーブ R40', (b) => road(b, arc(40, Math.PI / 3), street({ lanes: 1, bike: 'plain', age: 'used', wear: 'cracked' }), 33));
addModel('curve', 'arterial-30', '幹線 4車線 ゆるいカーブ R120', (b) => road(b, arc(120, -0.5), street({ lanes: 2, median: 'planted', age: 'used' }), 34));
addModel('curve', 'arterial-s', '幹線 4車線 S字', (b) => road(b, sCurve(70, 14), street({ lanes: 2, median: 'turn', age: 'worn', wear: 'sealed' }), 35));
addModel('curve', 'residential-s', '住宅街 S字', (b) => road(b, sCurve(50, 12), street({ lanes: 1, laneW: 3.2, verge: 'ground/grass-mown', vergeW: 2, walkW: 1.5, age: 'fresh' }), 36));
addModel('curve', 'oldtown-wiggle', '旧市街 不規則に曲がる路地', (b) => road(b, through([[0, 0, 0], [1.5, 0, -10], [-2, 0, -20], [-1, 0, -30], [4, 0, -40], [3, 0, -50]], 50), street({ lanes: 1, oneWay: true, laneW: 3.6, walk: 'paving/slabs-sandstone', walkW: 1.2, curb: 'curb/granite', age: 'worn' }), 37));
addModel('curve', 'coast-sweep', '海岸通り 大きなカーブ', (b) => road(b, arc(70, 0.9), street(STREETS.find((s) => s[0] === 'beach-boardwalk')![2]), 38));
addModel('curve', 'lane-shift', '車線シフト(幅員変化部)', (b) => road(b, sCurve(40, 3.5), street({ lanes: 1, age: 'used' }), 39));

// --- Junctions. ---
const A = (angle: number, section: Section, control: Control = 'signal', crosswalk: string | null = 'crosswalk/zebra', arrows = true): Arm => ({ angle, section, control, crosswalk, arrows });
const local = (age: Age = 'worn'): Section => street({ lanes: 1, laneW: 3.1, centre: null, walkW: 1.8, age, wear: 'patched' });
const localP = (): Section => street({ lanes: 1, laneW: 3, parking: 2, centre: null, verge: 'ground/grass-patchy', walkW: 1.5, age: 'used', wear: 'cracked' });
const coll = (age: Age = 'used'): Section => street({ lanes: 1, laneW: 3.5, walkW: 2.4, age });
const collBike = (): Section => street({ lanes: 1, laneW: 3.4, bike: 'green', walkW: 2.4, age: 'used' });
const art = (age: Age = 'used'): Section => street({ lanes: 2, walkW: 3, age, wear: 'cracked' });
const artT = (): Section => street({ lanes: 2, median: 'turn', walkW: 3, age: 'used', wear: 'sealed' });
const art6 = (): Section => street({ lanes: 3, median: 'turn', walkW: 3.6, walk: 'concrete/walk-long', age: 'used' });
const oneway = (n: number): Section => street({ lanes: n, oneWay: true, parking: 1, walkW: 2.6, age: 'used', wear: 'sealed' });
/** One-way street running towards the junction (arms are described looking away from it). */
const onewayIn = (n: number): Section => reversed(oneway(n));
const old = (): Section => {
  const s = street({ lanes: 1, laneW: 3, centre: null, walk: 'paving/slabs-sandstone', walkW: 1.8, curb: 'curb/granite', age: 'worn' });
  return s;
};
const MH: [string, number, number, number][] = [['cover/manhole-city', 0.8, -0.6, 0.4], ['cover/manhole-waffle-rusty', -2.2, 1.6, 1.1], ['cover/oil-stain-2', 1.6, 2.2, 0], ['cover/tar-snakes', -1, -2.5, 0.7]];
const J = (id: string, label: string, arms: Arm[], opts: { radius?: number; floor?: string; box?: boolean; decals?: [string, number, number, number][] } = {}): void =>
  addModel('junction', id, label, (b) => junction(b, { arms, radius: opts.radius, floor: opts.floor ?? plainTex('used', 'cracked'), box: opts.box, decals: opts.decals ?? MH }));
J('cross-local', '十字路 生活道路(一時停止)', [A(0, local(), 'stop', null), A(90, local(), 'stop', null), A(180, local(), 'stop', null), A(270, local(), 'stop', null)], { radius: 3, floor: plainTex('worn', 'patched') });
J('cross-local-2way-stop', '十字路 生活道路×補助幹線(2方向停止)', [A(0, coll(), 'none', 'crosswalk/parallel'), A(90, local(), 'stop', 'crosswalk/parallel'), A(180, coll(), 'none', 'crosswalk/parallel'), A(270, local(), 'stop', 'crosswalk/parallel')], { radius: 4 });
J('cross-collector', '十字路 補助幹線×補助幹線(信号)', [A(0, coll()), A(90, coll()), A(180, coll()), A(270, coll())], { radius: 5 });
J('cross-collector-bike', '十字路 自転車レーン付き', [A(0, collBike(), 'signal', 'crosswalk/ladder'), A(90, coll(), 'signal', 'crosswalk/ladder'), A(180, collBike(), 'signal', 'crosswalk/ladder'), A(270, coll(), 'signal', 'crosswalk/ladder')], { radius: 5 });
J('cross-arterial-collector', '十字路 幹線×補助幹線', [A(0, art()), A(90, coll()), A(180, art()), A(270, coll())], { radius: 6 });
J('cross-arterial', '十字路 幹線×幹線', [A(0, artT(), 'signal', 'crosswalk/zebra-wide'), A(90, art(), 'signal', 'crosswalk/zebra-wide'), A(180, artT(), 'signal', 'crosswalk/zebra-wide'), A(270, art(), 'signal', 'crosswalk/zebra-wide')], { radius: 7 });
J('cross-boulevard', '十字路 6車線大通り×幹線(停止禁止枠)', [A(0, art6(), 'signal', 'crosswalk/piano'), A(90, artT(), 'signal', 'crosswalk/piano'), A(180, art6(), 'signal', 'crosswalk/piano'), A(270, artT(), 'signal', 'crosswalk/piano')], { radius: 8, box: true });
J('cross-oneway', '十字路 一方通行×一方通行', [A(0, oneway(2), 'none'), A(90, onewayIn(2), 'signal'), A(180, onewayIn(2), 'signal'), A(270, oneway(2), 'none')], { radius: 5 });
J('cross-oneway-arterial', '十字路 一方通行3車線×幹線', [A(0, oneway(3), 'none'), A(90, art()), A(180, onewayIn(3)), A(270, art())], { radius: 6 });
J('cross-skew-70', '斜め十字路 70°', [A(0, coll()), A(70, coll()), A(180, coll()), A(250, coll())], { radius: 5 });
J('cross-skew-55', '斜め十字路 55°(幹線×斜めの大通り)', [A(0, art()), A(55, art(), 'signal', 'crosswalk/diagonal'), A(180, art()), A(235, art(), 'signal', 'crosswalk/diagonal')], { radius: 6 });
J('cross-offset-angles', '変形十字路(4方向ばらばら)', [A(5, coll()), A(98, local(), 'stop'), A(172, coll()), A(260, local(), 'stop')], { radius: 4 });
J('cross-oldtown', '旧市街の十字路(石張り歩道)', [A(0, old(), 'none', 'crosswalk/brick-band'), A(84, old(), 'stop', 'crosswalk/brick-band'), A(187, old(), 'none', 'crosswalk/brick-band'), A(262, old(), 'stop', 'crosswalk/brick-band')], { radius: 2.5, floor: 'paving/setts-large-tan', decals: [] });
J('cross-school', '十字路 スクールゾーン(黄色横断歩道)', [A(0, coll(), 'signal', 'crosswalk/zebra-yellow'), A(90, local('used'), 'stop', 'crosswalk/zebra-yellow'), A(180, coll(), 'signal', 'crosswalk/zebra-yellow'), A(270, local('used'), 'stop', 'crosswalk/zebra-yellow')], { radius: 4 });
J('cross-rainbow', '十字路 レインボー横断歩道', [A(0, coll('fresh'), 'signal', 'crosswalk/rainbow'), A(90, coll('fresh'), 'signal', 'crosswalk/rainbow'), A(180, coll('fresh'), 'signal', 'crosswalk/rainbow'), A(270, coll('fresh'), 'signal', 'crosswalk/rainbow')], { radius: 5, floor: plainTex('fresh'), decals: [] });
J('t-local', 'T字路 生活道路', [A(0, local(), 'none', null), A(180, local(), 'none', null), A(270, local(), 'stop', null)], { radius: 3, floor: plainTex('worn', 'patched') });
J('t-local-parking', 'T字路 住宅街(駐車帯)', [A(0, localP(), 'none', null), A(180, localP(), 'none', null), A(270, localP(), 'stop', 'crosswalk/parallel')], { radius: 4 });
J('t-collector', 'T字路 補助幹線に生活道路', [A(0, coll(), 'none', null), A(180, coll(), 'none', null), A(270, local(), 'stop', 'crosswalk/zebra')], { radius: 4 });
J('t-arterial', 'T字路 幹線に補助幹線(信号)', [A(0, artT()), A(180, artT()), A(270, coll())], { radius: 6 });
J('t-arterial-end', 'T字路 幹線の突き当たり', [A(90, art()), A(270, art()), A(180, art())], { radius: 7 });
J('t-skew', '斜めT字路 60°', [A(0, coll(), 'none', null), A(180, coll(), 'none', null), A(240, local(), 'stop', 'crosswalk/zebra')], { radius: 4 });
J('t-skew-sharp', '鋭角T字路 40°', [A(0, coll(), 'none', null), A(180, coll(), 'none', null), A(320, local(), 'yield', null)], { radius: 3 });
J('y-equal', 'Y字路 120°', [A(0, coll(), 'yield', null), A(120, coll(), 'yield', null), A(240, coll(), 'yield', null)], { radius: 6 });
J('y-fork', 'Y字路 分岐(鋭角)', [A(160, coll(), 'none', null), A(200, local(), 'yield', null), A(0, coll(), 'none', null)], { radius: 3 });
J('five-way', '五差路', [A(0, coll()), A(72, coll()), A(144, local(), 'stop'), A(216, coll()), A(288, local(), 'stop')], { radius: 4 });
J('five-way-diagonal', '五差路(十字路に斜めの道)', [A(0, art()), A(90, coll()), A(180, art()), A(270, coll()), A(135, coll(), 'signal', 'crosswalk/ladder')], { radius: 5, box: true });
J('six-way', '六差路', [A(0, coll()), A(60, local(), 'stop'), A(120, coll()), A(180, coll()), A(240, local(), 'stop'), A(300, coll())], { radius: 3.5, box: true });
J('bend-corner', '直角の曲がり角(2方向)', [A(0, local(), 'none', null), A(90, local(), 'none', null)], { radius: 4, floor: plainTex('worn', 'patched'), decals: [] });
J('width-change', '幅員変化(4車線→2車線)', [A(0, art(), 'none', null), A(180, coll(), 'none', null)], { decals: [] });
J('alley-mouth', '路地の出入口', [A(0, coll(), 'none', null), A(180, coll(), 'none', null), A(270, street({ lanes: 1, oneWay: true, laneW: 4, walk: null, curb: null, age: 'bleached', wear: 'broken', ground: { w: 0.5, tex: 'concrete/walk-plain' } }), 'none', null)], { radius: 2, decals: [] });

// --- Roundabouts and turning circles. ---
const RB = (id: string, label: string, o: Parameters<typeof roundabout>[1]): void => addModel('roundabout', id, label, (b) => roundabout(b, o));
const yieldArm = (angle: number, section: Section, cw: string | null = 'crosswalk/zebra'): Arm => ({ angle, section, control: 'yield', crosswalk: cw, length: 16 });
RB('mini', 'ミニロータリー(生活道路)', { arms: [0, 90, 180, 270].map((a) => yieldArm(a, local(), null)), radius: 8, ring: 5, island: 'paving/setts-granite', floor: plainTex('worn', 'patched') });
RB('single-3', 'ロータリー 3方向', { arms: [0, 120, 240].map((a) => yieldArm(a, coll())), radius: 14, ring: 5.5, apron: 1.5, floor: plainTex('used') });
RB('single-4', 'ロータリー 4方向 1車線', { arms: [0, 90, 180, 270].map((a) => yieldArm(a, coll())), radius: 16, ring: 5.5, apron: 2, floor: plainTex('used', 'cracked') });
RB('single-4-brick', 'ロータリー 4方向 レンガの中央島', { arms: [0, 90, 180, 270].map((a) => yieldArm(a, coll(), 'crosswalk/brick-band')), radius: 15, ring: 6, apron: 2.5, apronTex: 'paving/herringbone-red', island: 'ground/mulch', floor: plainTex('used') });
RB('single-5', 'ロータリー 5方向', { arms: [0, 70, 150, 215, 290].map((a) => yieldArm(a, a === 150 ? local() : coll())), radius: 18, ring: 6, apron: 2, floor: plainTex('used', 'sealed') });
RB('multi-4', 'ロータリー 2車線 幹線', { arms: [0, 90, 180, 270].map((a) => yieldArm(a, art())), radius: 24, ring: 8.5, apron: 2, floor: plainTex('used', 'cracked') });
RB('plaza-6', '広場のロータリー 6方向', { arms: [0, 60, 120, 180, 240, 300].map((a) => yieldArm(a, a % 120 === 0 ? art() : coll())), radius: 30, ring: 10, apron: 0, island: 'paving/slabs-sandstone', floor: plainTex('used') });
RB('culdesac', '袋小路の転回広場', { arms: [{ angle: 0, section: localP(), control: 'none', crosswalk: null, length: 18 }], radius: 11, ring: 11, floor: plainTex('used', 'cracked') });
RB('culdesac-island', '袋小路 植栽島つき', { arms: [{ angle: 0, section: local('used'), control: 'none', crosswalk: null, length: 18 }], radius: 13, ring: 7, island: 'ground/grass-lush', floor: plainTex('used') });
RB('culdesac-small', '袋小路 小(郊外)', { arms: [{ angle: 0, section: street({ lanes: 1, laneW: 3.2, centre: null, walk: null, verge: 'ground/grass-mown', vergeW: 2, age: 'fresh' }), control: 'none', crosswalk: null, length: 18 }], radius: 9, ring: 9, floor: plainTex('fresh') });

addSidewalks();
addStructures();
addSignals();
addSigns();
addFurniture();
addPlants();
addHouses();
addBlocks();
addTowers();
addWorks();
addBuildParts();
addTracks();
addCrossings();
addRailParts();
addStations();

export const MODELS: readonly ModelSpec[] = models;
