import { MeshBuilder } from './builder';
import { acUnit, antenna, awning, balcony, billboard, blade, bulkhead, chimney, dish, dormer, duct, fireEscape, porch, sign, skylight, solar, stoop, vent, wall, waterTank } from './buildkit';
import { Pose, stand } from './kit';
import { addModel } from './registry';

const T = (c: string): string => `trim/paint-${c}`;

/** Loose building parts shown on their own: rooftop plant, balconies, signs and so on. */
export function addBuildParts(): void {
  const add = (id: string, label: string, fn: (b: MeshBuilder, f: Pose) => void): void => addModel('buildpart', id, label, (b) => fn(b, stand()));
  /** A patch of wall for parts that hang off a facade. */
  const backed = (id: string, label: string, mat: string, w: number, h: number, fn: (b: MeshBuilder, f: Pose) => void): void =>
    add(id, label, (b) => {
      wall(b, mat, stand([-w / 2, 0, 0]), w, h);
      fn(b, stand());
    });

  [0, 1, 2].forEach((s) => [false, true].forEach((beige) => add(`ac-${s + 1}${beige ? '-beige' : ''}`, `屋上の空調機 ${['小', '中', '大'][s]}${beige ? '・ベージュ' : ''}`, (b, f) => acUnit(b, f, s, beige))));
  [0, 1, 2].forEach((k) => add(`vent-${k + 1}`, `屋上の換気口 ${k + 1}`, (b, f) => vent(b, f, k, 1.5)));
  ([[1.5, 3, 2.4, 'tank-staves'], [1.2, 2.4, 3.2, 'tank-staves-grey'], [1.9, 3.6, 1.8, 'tank-staves']] as [number, number, number, string][]).forEach(([r, h, legs, st], i) => add(`water-tank-${i + 1}`, `屋上の給水タンク ${i + 1}`, (b, f) => waterTank(b, f, r, h, legs, `trim/${st}`)));
  ([['wall/block-grey', 'door/steel-grey'], ['wall/brick-red-common', 'door/steel-rust'], ['wall/stucco-white', 'door/steel-white'], ['wall/metal-ribbed-grey', 'door/steel-blue']] as [string, string][]).forEach(([wm, dr], i) => add(`bulkhead-${i + 1}`, `屋上の階段室 ${i + 1}`, (b, f) => bulkhead(b, f, 2.6 + i * 0.4, 3.2, 2.5, wm, dr)));
  [0.35, 0.5, 0.9].forEach((r, i) => add(`dish-${i + 1}`, `衛星アンテナ ${i + 1}`, (b, f) => dish(b, f, r, 0.6 + r)));
  ([[0, 3], [1, 6], [0, 5], [1, 10]] as [number, number][]).forEach(([k, h], i) => add(`antenna-${i + 1}`, `アンテナ ${i + 1}`, (b, f) => antenna(b, f, k, h)));
  ['cola', 'injury', 'radio', 'casino', 'burger', 'phone', 'movie', 'realty'].forEach((n, i) => add(`billboard-${n}`, `屋上広告塔 ${i + 1}`, (b, f) => billboard(b, f, `trim/billboard-${n}`, i % 2 ? 1.6 : 7, 1)));
  ([[3.2, 2], [6.4, 3.4]] as [number, number][]).forEach(([w, d], i) => add(`solar-${i + 1}`, `太陽光パネル ${i + 1}`, (b, f) => solar(b, f, w, d)));
  [false, true].forEach((dome, i) => add(`skylight-${i + 1}`, `天窓 ${i + 1}`, (b, f) => skylight(b, f, 1.2, dome ? 1.2 : 2.4, dome)));
  [3, 6].forEach((len, i) => add(`duct-${i + 1}`, `屋上ダクト ${i + 1}`, (b, f) => duct(b, f, len, 0.6 + i * 0.2, 0.45 + i * 0.15)));
  ([[0.6, 0.6, 1.6, 'wall/brick-red', 1], [1.1, 0.6, 2.2, 'wall/brick-brown', 2], [0.7, 0.7, 1.4, 'wall/stucco-white', 1], [1.4, 0.7, 3, 'wall/stone-limestone', 3]] as [number, number, number, string, number][])
    .forEach(([w, d, h, m, pots], i) => add(`chimney-${i + 1}`, `煙突 ${i + 1}`, (b, f) => chimney(b, f, w, d, h, m, pots)));

  ([[2, 'wall/brick-red'], [3, 'wall/brick-brown'], [4, 'wall/brick-buff'], [5, 'wall/brick-red-sooty']] as [number, string][])
    .forEach(([n, m], i) => backed(`fire-escape-${i + 1}`, `非常階段 ${n}層`, m, 7, (n + 1) * 3.1 + 1, (b) => fireEscape(b, stand([0, 3.1 + 0.8, 0]), n, 3.1, { w: 4.4, roof: 3 })));
  ([['rail-black', false], ['rail-white', false], ['rail-ornate', false], ['rail-cable', false], ['rail-green', false], ['wall/stucco-white', true], ['wall/concrete-panel', true]] as [string, boolean][])
    .forEach(([r, solid], i) => backed(`balcony-${i + 1}`, `バルコニー ${i + 1}`, i % 2 ? 'wall/stucco-cream' : 'wall/brick-red', 4.5, 3.2, (b) => balcony(b, stand([0, 0.6, 0]), 2.4 + (i % 3) * 0.7, 1.2, { rail: solid ? r : `trim/${r}`, ...(solid ? { solid: true } : {}) })));
  ['awning-red', 'awning-green', 'awning-navy', 'awning-stripe-red', 'awning-stripe-green', 'awning-stripe-blue', 'awning-faded', 'awning-black'].forEach((a, i) =>
    backed(`awning-${i + 1}`, `日除け ${i + 1}`, 'wall/brick-red', 5, 3.6, (b) => awning(b, stand([0, 2.6, 0]), 3 + (i % 3) * 0.6, 1 + (i % 2) * 0.5, 0.6 + (i % 3) * 0.15, `trim/${a}`, i % 2 === 0)));
  ['liquor', 'donuts', 'laundromat', 'pawn-shop', 'pharmacy', 'tattoo'].forEach((n, i) => backed(`sign-${i + 1}`, `店の看板 ${i + 1}`, 'wall/stucco-cream', 5.6, 1.8, (b) => sign(b, stand([0, 0.9, 0]), 4.8, 0.9, `trim/sign-${n}`)));
  ['hotel', 'motel', 'bar', 'loans', 'pawn', 'liquor', 'parking', 'theatre', 'diner', 'apts'].forEach((n, i) => backed(`blade-${n}`, `袖看板 ${i + 1}`, 'wall/brick-brown', 2.4, 6, (b) => blade(b, stand([0, 5.4, 0]), `trim/blade-${n}`)));
  ([[1.6, 0.5, ''], [2.2, 0.9, 'trim/rail-black'], [3, 1.5, 'trim/rail-ornate']] as [number, number, string][]).forEach(([w, rise, r], i) => add(`stoop-${i + 1}`, `玄関の階段 ${i + 1}`, (b, f) => stoop(b, f, w, rise, { landing: 1, ...(r ? { rail: r } : {}), mat: i === 2 ? 'wall/stone-brownstone' : 'structure/wall-smooth' })));
  ([['roof/shingle-grey', 'white', 3, 'trim/rail-white'], ['roof/seam-green', 'cream', 4, ''], ['roof/shingle-brown', 'brown', 2, 'trim/lattice-white']] as [string, string, number, string][])
    .forEach(([rf, c, posts, r], i) => backed(`porch-${i + 1}`, `ポーチ ${i + 1}`, 'wall/wood-cedar', 7, 3.4, (b) => porch(b, stand(), 4 + i, 1.8 + i * 0.3, 2.6, { roof: rf, post: T(c), posts, floorH: 0.4, ...(r ? { rail: r } : {}) })));
  ([['wall/wood-cedar', 'roof/shingle-grey', 'window/sash-white'], ['wall/stucco-white', 'roof/slate-grey', 'window/casement-white']] as [string, string, string][])
    .forEach(([wm, rf, wn], i) => add(`dormer-${i + 1}`, `屋根窓 ${i + 1}`, (b, f) => dormer(b, f, 1.5, 1.7, 0.8, { wall: wm, roof: rf, window: wn })));
}
