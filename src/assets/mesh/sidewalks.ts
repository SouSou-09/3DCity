import { MeshBuilder, V3, straight } from './builder';
import { band } from './junction';
import { addModel } from './registry';
import { Section, Side, sweepSection } from './section';

type P2 = [number, number];
const ROAD = 'asphalt/plain-used-clean';

/** A strip of road edge with one pavement side: the unit a street is assembled from. */
function walkPiece(b: MeshBuilder, side: Side, len = 12): void {
  const sec: Section = { lanes: [{ kind: 'shoulder', w: 1.6, dir: 0, tex: ROAD }], lines: [null, null], left: {}, right: side, asphalt: ROAD, paint: 'worn' };
  sweepSection(b, straight(len, 1), sec, { noLeft: true });
}

/** Pavement whose kerb line is a free polyline (x = distance from the road edge, z along the street). */
function kerbLine(b: MeshBuilder, curb: P2[], depth: number, tex: string, curbTex = 'curb/plain', roadW = 3): void {
  const back = curb.map((p) => [depth, p[1]] as P2);
  band(b, curb, back, 0.15, curbTex, tex, () => [-1, 0]);
  for (let i = 0; i + 1 < curb.length; i++) b.quadUp(ROAD, [-roadW, 0, curb[i][1]], [curb[i][0], 0, curb[i][1]], [curb[i + 1][0], 0, curb[i + 1][1]], [-roadW, 0, curb[i + 1][1]]);
}
const smooth = (q: number): number => q * q * (3 - 2 * q);
/** Kerb line that steps sideways by `shift` between z0..z1 with eased ends. */
function stepped(len: number, shift: number, z0: number, z1: number, ease: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i <= 48; i++) {
    const z = (len * i) / 48;
    const k = Math.min(smooth(Math.min(1, Math.max(0, (z - z0) / ease))), smooth(Math.min(1, Math.max(0, (z1 - z) / ease))));
    pts.push([shift * k, -z]);
  }
  return pts;
}

/** Dropped kerb: the kerb sinks to `low` over `w` metres, with a sloped apron behind it. */
function droppedKerb(b: MeshBuilder, o: { w: number; flare: number; low?: number; apron: string; walk: string; curb?: string; tactile?: string; depth?: number; apronDepth?: number }): void {
  const len = o.w + o.flare * 2 + 6;
  const depth = o.depth ?? 3;
  const ad = o.apronDepth ?? 1.4;
  const low = o.low ?? 0.03;
  const z0 = 3;
  const h = (z: number): number => 0.15 - (0.15 - low) * Math.min(smooth(Math.min(1, Math.max(0, (z - z0) / o.flare))), smooth(Math.min(1, Math.max(0, (z0 + o.flare * 2 + o.w - z) / o.flare))));
  const curb = o.curb ?? 'curb/plain';
  const n = 40;
  for (let i = 0; i < n; i++) {
    const [za, zb] = [(len * i) / n, (len * (i + 1)) / n];
    const [ha, hb] = [h(za), h(zb)];
    const P = (x: number, y: number, z: number): V3 => [x, y, -z];
    const inRamp = (za + zb) / 2 > z0 + o.flare * 0.5 && (za + zb) / 2 < z0 + o.flare * 1.5 + o.w;
    b.quadUp(ROAD, P(-2.4, 0, za), P(-0.4, 0, za), P(-0.4, 0, zb), P(-2.4, 0, zb));
    b.quadUp('concrete/gutter', P(-0.4, 0, za), P(0, 0, za), P(0, 0, zb), P(-0.4, 0, zb), 0, [[za, 0], [za, 0.4], [zb, 0.4], [zb, 0]]);
    b.quadFacing(curb, P(0, 0, za), P(0, 0, zb), P(0, hb, zb), P(0, ha, za), [-1, 0, 0], [[za, 0], [zb, 0], [zb, 0.25 * (hb / 0.15)], [za, 0.25 * (ha / 0.15)]]);
    b.quadUp(curb, P(0, ha, za), P(0.15, ha, za), P(0.15, hb, zb), P(0, hb, zb), 0, [[za, 0.25], [za, 0.5], [zb, 0.5], [zb, 0.25]]);
    b.quadUp(inRamp ? o.apron : o.walk, P(0.15, ha, za), P(ad, 0.15, za), P(ad, 0.15, zb), P(0.15, hb, zb));
    b.quadUp(inRamp && o.apronDepth === undefined ? o.walk : inRamp ? o.apron : o.walk, P(ad, 0.15, za), P(depth, 0.15, za), P(depth, 0.15, zb), P(ad, 0.15, zb));
    b.quadFacing('ground/dirt', P(depth, -0.4, za), P(depth, -0.4, zb), P(depth, 0.15, zb), P(depth, 0.15, za), [1, 0, 0], [[za, 0], [zb, 0], [zb, 0.55], [za, 0.55]]);
    if (o.tactile && inRamp) b.quadUp(o.tactile, P(0.2, ha + 0.012, za), P(0.8, ha + (0.15 - ha) * 0.5 + 0.012, za), P(0.8, hb + (0.15 - hb) * 0.5 + 0.012, zb), P(0.2, hb + 0.012, zb), 1);
  }
}

/** Kerbed island standing in the carriageway (median nose, refuge, splitter). */
function island(b: MeshBuilder, ring: P2[], tex: string, curb = 'curb/plain', pad: P2 = [4, 4]): void {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  b.quadUp(ROAD, [Math.min(...xs) - pad[0], 0, Math.min(...zs) - pad[1]], [Math.max(...xs) + pad[0], 0, Math.min(...zs) - pad[1]], [Math.max(...xs) + pad[0], 0, Math.max(...zs) + pad[1]], [Math.min(...xs) - pad[0], 0, Math.max(...zs) + pad[1]]);
  const inner = ring.map((p) => {
    const l = Math.hypot(p[0] - cx, p[1] - cz) || 1;
    return [p[0] - ((p[0] - cx) / l) * 0.15, p[1] - ((p[1] - cz) / l) * 0.15] as P2;
  });
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const len = Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]);
    const out: V3 = [(ring[i][0] + ring[j][0]) / 2 - cx, 0, (ring[i][1] + ring[j][1]) / 2 - cz];
    b.quadFacing(curb, [ring[i][0], 0, ring[i][1]], [ring[j][0], 0, ring[j][1]], [ring[j][0], 0.15, ring[j][1]], [ring[i][0], 0.15, ring[i][1]], out, [[s, 0], [s + len, 0], [s + len, 0.25], [s, 0.25]]);
    b.quadUp(curb, [ring[i][0], 0.15, ring[i][1]], [ring[j][0], 0.15, ring[j][1]], [inner[j][0], 0.15, inner[j][1]], [inner[i][0], 0.15, inner[i][1]], 0, [[s, 0.25], [s + len, 0.25], [s + len, 0.5], [s, 0.5]]);
    s += len;
  }
  b.fan(tex, [cx, cz], inner, 0.15);
}
/** Stadium outline: straight sides with semicircular ends. */
function capsule(w: number, len: number, taper = 1): P2[] {
  const pts: P2[] = [];
  const r0 = w / 2;
  const r1 = (w / 2) * taper;
  for (let i = 0; i <= 10; i++) pts.push([Math.cos((Math.PI * i) / 10) * r0, len / 2 - r0 + Math.sin((Math.PI * i) / 10) * r0]);
  for (let i = 0; i <= 10; i++) pts.push([-Math.cos((Math.PI * i) / 10) * r1, -len / 2 + r1 - Math.sin((Math.PI * i) / 10) * r1]);
  return pts;
}

export function addSidewalks(): void {
  const S = (id: string, label: string, fn: (b: MeshBuilder) => void): void => addModel('sidewalk', id, label, fn);
  const PAVINGS: [string, string, string, string][] = [
    ['concrete-square', 'コンクリート平板(正方形目地)', 'concrete/walk-square', 'curb/plain'],
    ['concrete-small', 'コンクリート(細かい目地)', 'concrete/walk-small', 'curb/plain'],
    ['concrete-long', 'コンクリート(長い目地)', 'concrete/walk-long', 'curb/plain'],
    ['concrete-staggered', 'コンクリート(千鳥目地)', 'concrete/walk-staggered', 'curb/plain'],
    ['concrete-new', '新しいコンクリート', 'concrete/walk-new', 'curb/plain'],
    ['concrete-cracked', 'ひび割れたコンクリート', 'concrete/walk-square-cracked', 'curb/dirty'],
    ['concrete-dark', '濃色コンクリート', 'concrete/walk-dark', 'curb/plain'],
    ['concrete-exposed', '洗い出しコンクリート', 'concrete/walk-exposed', 'curb/plain'],
    ['herringbone-red', 'レンガ ヘリンボーン赤', 'paving/herringbone-red', 'curb/granite'],
    ['herringbone-charcoal', 'ブロック ヘリンボーン濃灰', 'paving/herringbone-charcoal', 'curb/plain'],
    ['running-grey', 'ブロック 馬踏み目地 灰', 'paving/running-grey', 'curb/plain'],
    ['basket-tan', 'ブロック 市松 黄土', 'paving/basket-tan', 'curb/plain'],
    ['stack-grey', 'ブロック 芋目地 灰', 'paving/stack-grey', 'curb/plain'],
    ['slabs-granite', '御影石の板石', 'paving/slabs-granite', 'curb/granite'],
    ['slabs-sandstone', '砂岩の板石', 'paving/slabs-sandstone', 'curb/granite'],
    ['slabs-dark', '黒い板石', 'paving/slabs-dark', 'curb/granite'],
    ['setts-granite', '小舗石', 'paving/setts-granite', 'curb/granite'],
    ['setts-mossy', '苔むした小舗石', 'paving/setts-mossy', 'curb/dirty'],
  ];
  for (const [id, label, tex, curb] of PAVINGS) S(`walk-${id}`, `歩道 ${label}`, (b) => walkPiece(b, { gutter: true, curb, walk: { w: 3, tex } }));
  S('kerb-rolled', '縁石 ロール型+芝', (b) => walkPiece(b, { curb: 'curb/plain', rolled: true, verge: { w: 1.5, tex: 'ground/grass-mown' }, walk: { w: 1.5, tex: 'concrete/walk-square' } }));
  S('kerb-high', '縁石 高い(25cm)', (b) => walkPiece(b, { gutter: true, curb: 'curb/plain', curbH: 0.25, walk: { w: 2.4, tex: 'concrete/walk-long' } }));
  S('kerb-flush-bollards', '段差なし+車止め', (b) => walkPiece(b, { ground: { w: 3, tex: 'paving/slabs-dark' }, edge: 'bollards', edgeTex: 'structure/steel-black' }));
  S('kerb-none-gravel', '縁石なし 砂利の路肩', (b) => walkPiece(b, { ground: { w: 2.4, tex: 'ground/gravel-dirt' } }));
  S('verge-grass', '植栽帯(芝)+歩道', (b) => walkPiece(b, { gutter: true, curb: 'curb/plain', verge: { w: 1.6, tex: 'ground/grass-lush' }, walk: { w: 1.8, tex: 'concrete/walk-square' } }));
  S('verge-mulch', '植栽帯(マルチ)+レンガ歩道', (b) => walkPiece(b, { gutter: true, curb: 'curb/granite', verge: { w: 1.2, tex: 'ground/mulch' }, walk: { w: 2.4, tex: 'paving/running-red' } }));
  S('verge-gravel', '砂利帯+歩道', (b) => walkPiece(b, { gutter: true, curb: 'curb/dirty', verge: { w: 1, tex: 'ground/gravel-fine' }, walk: { w: 1.8, tex: 'concrete/walk-square-dirty' } }));
  S('tactile-edge', '点字ブロック付き(バス停・乗降場)', (b) => walkPiece(b, { gutter: true, curb: 'curb/yellow', walk: { w: 3.2, tex: 'concrete/walk-small' }, tactile: 'paving/tactile-dome-yellow' }));
  S('tactile-edge-red', '点字ブロック 赤+レンガ', (b) => walkPiece(b, { gutter: true, curb: 'curb/granite', walk: { w: 3, tex: 'paving/herringbone-brown' }, tactile: 'paving/tactile-dome-red' }));
  S('railing', '歩道+転落防止柵', (b) => walkPiece(b, { gutter: true, curb: 'curb/plain', walk: { w: 2.2, tex: 'concrete/walk-square' }, edge: 'railing', edgeTex: 'structure/steel-green' }));
  S('fence', '歩道+金網フェンス', (b) => walkPiece(b, { gutter: true, curb: 'curb/dirty', walk: { w: 1.8, tex: 'concrete/walk-square-cracked' }, edge: 'fence' }));
  S('driveway', '車両乗入れ部(切り下げ)', (b) => droppedKerb(b, { w: 4, flare: 1, apron: 'concrete/driveway', walk: 'concrete/walk-square', apronDepth: 3 }));
  S('driveway-wide', '車両乗入れ部 幅広(商業施設)', (b) => droppedKerb(b, { w: 8, flare: 1.5, apron: 'concrete/driveway', walk: 'concrete/walk-long', depth: 4, apronDepth: 4 }));
  S('driveway-brick', '車両乗入れ部 レンガ歩道', (b) => droppedKerb(b, { w: 3.5, flare: 0.8, apron: 'paving/setts-granite', walk: 'paving/herringbone-red', curb: 'curb/granite', apronDepth: 3 }));
  S('kerb-ramp', '歩行者用スロープ(点字ブロック)', (b) => droppedKerb(b, { w: 1.5, flare: 1, low: 0.01, apron: 'concrete/walk-plain', walk: 'concrete/walk-square', tactile: 'paving/tactile-dome-yellow' }));
  S('kerb-ramp-red', '歩行者用スロープ(赤い点字ブロック)', (b) => droppedKerb(b, { w: 2, flare: 0.8, low: 0.01, apron: 'concrete/walk-plain', walk: 'concrete/walk-dark', tactile: 'paving/tactile-dome-red', curb: 'curb/granite' }));
  S('bulb-out', 'バルブアウト(歩道の張り出し)', (b) => kerbLine(b, stepped(22, -2.2, 6, 16, 3), 3, 'concrete/walk-square', 'curb/plain', 5.5));
  S('bulb-out-brick', 'バルブアウト レンガ舗装', (b) => kerbLine(b, stepped(18, -2.2, 5, 13, 2.5), 3.4, 'paving/herringbone-red', 'curb/granite', 5.5));
  S('bus-bay', 'バスベイ(停車帯の切り込み)', (b) => kerbLine(b, stepped(40, 3, 6, 34, 8), 6, 'concrete/walk-small', 'curb/red', 4));
  S('parking-bay', '駐車ます(歩道への切り込み)', (b) => kerbLine(b, stepped(24, 2.3, 4, 20, 1.2), 5, 'paving/basket-grey', 'curb/plain', 4));
  S('median-nose', '中央分離帯の端部(コンクリート)', (b) => island(b, capsule(1.8, 14), 'concrete/walk-plain'));
  S('median-nose-planted', '中央分離帯の端部(植栽)', (b) => island(b, capsule(3.2, 18), 'ground/grass-lush'));
  S('median-taper', '中央分離帯 先細り(右折レーン手前)', (b) => island(b, capsule(3.6, 22, 0.3), 'paving/setts-granite', 'curb/plain'));
  S('refuge-island', '横断歩道の安全島', (b) => island(b, capsule(2.2, 5), 'concrete/walk-exposed', 'curb/yellow'));
  S('splitter-island', '導流島(三角)', (b) => {
    const ring: P2[] = [];
    const corners: P2[] = [[0, 5], [3.4, -3], [-2.2, -2]];
    corners.forEach(([x, z], k) => {
      const [nx, nz] = corners[(k + 1) % 3];
      for (let i = 1; i < 6; i++) ring.push([x + ((nx - x) * i) / 6, z + ((nz - z) * i) / 6]);
    });
    island(b, ring, 'paving/setts-granite', 'curb/plain');
  });
  S('traffic-circle-island', '小型ロータリーの中央島', (b) => island(b, Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * Math.PI * 2) * 3, Math.sin((i / 24) * Math.PI * 2) * 3] as P2), 'ground/mulch', 'curb/plain', [5, 5]));
}
