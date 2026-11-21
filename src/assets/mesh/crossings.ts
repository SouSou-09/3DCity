import { MeshBuilder, V3 } from './builder';
import { box, stand } from './kit';
import { addModel } from './registry';
import { BED, G, STYLES, StyleName, TIE, TOP, TrackStyle, cuts, way } from './railkit';
import { railSignal } from './signals';
import { tracks } from './tracks';

export interface CrossingOpts {
  /** Track centres along the road. */
  lats: number[];
  panel: 'timber' | 'timber-old' | 'rubber' | 'rubber-worn' | 'concrete' | 'concrete-stained' | 'paved';
  /** Width of the carriageway and of the footway on each side (0 for none). */
  w: number;
  walk?: number;
  road: string;
  walkTex?: string;
  protect: 'passive' | 'flashers' | 'gates' | 'cantilever' | 'quad';
  gate?: 'down' | 'up' | 'half';
  style: StyleName | StyleName[];
  marks?: 'new' | 'worn' | 'faded' | null;
  len?: number;
  half?: number;
  pole?: string;
}

/** Level crossing: the road runs along x and climbs to rail level, the tracks run along z. */
export function crossing(b: MeshBuilder, o: CrossingOpts): void {
  const len = o.len ?? 26;
  const half = o.half ?? 21;
  const walk = o.walk ?? 0;
  const hw = o.w / 2;
  const edge = hw + walk;
  const lats = [...o.lats].sort((a, c) => a - c);
  const xr = Math.max(...lats.map(Math.abs));
  const flat = xr + 2.7;
  const top = TOP - 0.004;
  const h = (x: number): number => {
    const q = Math.min(1, Math.max(0, (Math.abs(x) - flat) / 8));
    return top * (1 - q * q * (3 - 2 * q)) + 0.02 * q;
  };
  const styles = (Array.isArray(o.style) ? o.style : [o.style]).map((k) => STYLES[k] as TrackStyle);
  tracks(way(b, stand([0, 0, -len / 2])), 0, len, lats, styles);

  /** Piece of the road surface between x0 and x1, following the hump. */
  const strip = (mat: string, x0: number, x1: number, z0: number, z1: number, uv: (x: number, z: number) => [number, number], layer = 0): void => {
    const xs = cuts(x0, x1, Math.abs(x0) < flat && Math.abs(x1) < flat ? 1e6 : 1);
    for (let i = 0; i < xs.length - 1; i++) {
      const [a, c] = [xs[i], xs[i + 1]];
      const lift = layer * 0.004;
      b.quad(mat, [a, h(a) + lift, z1], [c, h(c) + lift, z1], [c, h(c) + lift, z0], [a, h(a) + lift, z0], [uv(a, z1), uv(c, z1), uv(c, z0), uv(a, z0)], layer);
    }
  };
  /** Wall closing the side of the raised road down to `foot`. */
  const skirt = (mat: string, x0: number, x1: number, foot: number): void => {
    for (const z of [-edge, edge]) {
      const xs = cuts(x0, x1, Math.abs(x0) < flat && Math.abs(x1) < flat ? 1e6 : 1);
      for (let i = 0; i < xs.length - 1; i++) {
        const [a, c] = [xs[i], xs[i + 1]];
        if (h(a) - foot < 0.01 && h(c) - foot < 0.01) continue;
        const p: V3[] = [[a, foot, z], [c, foot, z], [c, Math.max(foot, h(c)), z], [a, Math.max(foot, h(a)), z]];
        const uv: [number, number][] = [[a, foot], [c, foot], [c, h(c)], [a, h(a)]];
        if (z > 0) b.quad(mat, p[0], p[1], p[2], p[3], uv);
        else b.quad(mat, p[1], p[0], p[3], p[2], [uv[1], uv[0], uv[3], uv[2]]);
      }
    }
  };

  const panelTex = o.panel === 'paved' ? o.road : `rail/xing-${o.panel}`;
  const road = (x0: number, x1: number): void => {
    if (x1 - x0 < 0.01) return;
    strip(o.road, x0, x1, -hw, hw, (x, z) => [z + hw, x]);
    if (walk) for (const s of [-1, 1]) strip(o.walkTex ?? 'concrete/walk-square-dirty', x0, x1, s > 0 ? hw : -edge, s > 0 ? edge : -hw, (x, z) => [x, z]);
    const inBed = lats.some((c) => Math.abs((x0 + x1) / 2 - c) < 2.3);
    skirt('ground/gravel-dirt', x0, x1, inBed ? BED - 0.02 : 0);
  };
  const panel = (x0: number, x1: number, foot: number): void => {
    strip(panelTex, x0, x1, -edge, edge, (x, z) => (o.panel === 'paved' ? [z + hw, x] : [x - x0, z]));
    skirt(o.panel === 'paved' ? 'ground/gravel-dirt' : panelTex, x0, x1, foot);
  };
  let from = -half;
  for (const c of lats) {
    road(from, c - G - 0.635);
    panel(c - G - 0.635, c - G - 0.04, BED - 0.02);
    panel(c - G + 0.105, c + G - 0.105, TIE);
    panel(c + G + 0.04, c + G + 0.635, BED - 0.02);
    from = c + G + 0.635;
  }
  road(from, half);

  if (o.marks) {
    const m = o.marks;
    const lanes = Math.max(1, Math.round(hw / 3.5));
    const lw = hw / lanes;
    for (const s of [-1, 1]) {
      // s = 1: traffic heading +x on the z > 0 half, stopping short of the tracks.
      const stop = flat + 2.6;
      strip(`line/double-yellow-${m}`, s > 0 ? -half : stop + 0.6, s > 0 ? -stop - 0.6 : half, -0.25, 0.25, (x, z) => [z + 0.25, x], 1);
      strip(`crosswalk/stop-line-${m}`, s > 0 ? -stop - 0.6 : stop, s > 0 ? -stop : stop + 0.6, s > 0 ? 0.2 : -hw + 0.15, s > 0 ? hw - 0.15 : -0.2, (x, z) => [z, s > 0 ? x + stop + 0.6 : stop + 0.6 - x], 1);
      for (let i = 0; i < lanes; i++) {
        const zc = s * (i + 0.5) * lw;
        const x0 = s > 0 ? -stop - 12.5 : stop + 6.5;
        strip(`symbol/railroad-x-${m === 'faded' ? 'worn' : m}`, x0, x0 + 6, zc - 1.2, zc + 1.2, (x, z) => (s > 0 ? [z - zc + 1.2, x - x0] : [zc + 1.2 - z, x0 + 6 - x]), 1);
        if (i > 0) strip(`line/solid-white-${m}`, s > 0 ? -half : stop + 0.6, s > 0 ? -stop - 0.6 : half, s * i * lw - 0.25, s * i * lw + 0.25, (x, z) => [z, x], 1);
      }
      for (const e of [-1, 1]) strip(`line/solid-white-${m}`, s > 0 ? -half : flat, s > 0 ? -flat : half, e * (hw - 0.3) - 0.25, e * (hw - 0.3) + 0.25, (x, z) => [z, x], 1);
    }
  }
  if (walk) for (const s of [-1, 1]) for (const e of [-1, 1]) strip('paving/tactile-dome-yellow', s * (flat + 0.5) - 0.3, s * (flat + 0.5) + 0.3, e > 0 ? hw + 0.15 : -edge + 0.15, e > 0 ? edge - 0.15 : -hw - 0.15, (x, z) => [x, z], 1);

  const sx = xr + G + 3.4;
  const sz = edge + 0.7;
  const tex = o.pole ?? 'signal/pole-grey';
  const multi = lats.length > 1;
  const post = (x: number, z: number, yaw: number, opts: Parameters<typeof railSignal>[2]): void => {
    const y = h(x);
    box(b, 'ground/gravel-dirt', stand([x, 0, z]), [0, y / 2, 0], [0.9, y / 2, 0.9], 'Y');
    railSignal(b, stand([x, y, z], yaw), { tex, ...opts });
  };
  const gate = o.gate ?? 'up';
  const reach = sz - 0.25;
  for (const s of [-1, 1]) {
    const yaw = -90 * s;
    if (o.protect === 'passive') post(-s * sx, s * sz, yaw, { plain: true, tracks: multi });
    else if (o.protect === 'flashers') post(-s * sx, s * sz, yaw, { tracks: multi, bell: s > 0, both: true });
    else if (o.protect === 'cantilever') post(-s * sx, s * sz, yaw, { tracks: multi, bell: s > 0, cantilever: Math.max(5, reach - 0.5), gate, gateLen: reach, lit: [gate !== 'up', false] });
    else {
      post(-s * sx, s * sz, yaw, { tracks: multi, bell: s > 0, both: true, gate, gateLen: o.protect === 'quad' ? reach : Math.max(reach, hw > 5 ? reach : reach), lit: [gate !== 'up', false] });
      if (o.protect === 'quad') post(-s * sx, -s * sz, -yaw, { crossbuck: false, plain: true, gate, gateLen: reach });
    }
  }
}

export function addCrossings(): void {
  const X = (id: string, label: string, o: CrossingOpts): void => addModel('crossing', id, label, (b) => crossing(b, o));
  const one = [0];
  const two = [-2, 2];
  const used = 'asphalt/plain-used-patched';
  const worn = 'asphalt/plain-worn-cracked';

  X('passive-timber', '警報機なし 木の敷板 田舎道', { lats: one, panel: 'timber-old', w: 6, road: worn, protect: 'passive', style: 'wood-old', marks: 'faded', pole: 'signal/pole-wood-grey' });
  X('passive-gravel', '警報機なし 砂利道の農道踏切', { lats: one, panel: 'timber-old', w: 4.5, road: 'ground/gravel-dirt', protect: 'passive', style: 'weedy', marks: null, half: 16, pole: 'signal/pole-wood' });
  X('passive-paved', '警報機なし 舗装のみ', { lats: one, panel: 'paved', w: 6.5, road: 'asphalt/plain-bleached-cracked', protect: 'passive', style: 'siding', marks: 'faded' });
  X('disused', '廃線の踏切 さびたレール', { lats: one, panel: 'paved', w: 7, road: 'asphalt/plain-worn-patched', protect: 'passive', style: 'disused', marks: 'faded', pole: 'signal/pole-rusty' });
  X('flashers-timber', '警報機 木の敷板', { lats: one, panel: 'timber', w: 7, road: used, protect: 'flashers', style: 'wood', marks: 'worn' });
  X('flashers-rubber', '警報機 ゴムの敷板', { lats: one, panel: 'rubber-worn', w: 7, road: worn, protect: 'flashers', style: 'wood', marks: 'worn' });
  X('flashers-paved', '警報機 舗装のみ', { lats: one, panel: 'paved', w: 7, road: 'asphalt/plain-used-cracked', protect: 'flashers', style: 'wood-old', marks: 'faded' });
  X('flashers-walk', '警報機 歩道つき', { lats: one, panel: 'concrete-stained', w: 7, walk: 1.8, road: used, protect: 'flashers', style: 'concrete-stained', marks: 'worn' });
  for (const [g, jp] of [['up', '開'], ['down', '閉'], ['half', '作動中']] as ['up' | 'down' | 'half', string][]) {
    X(`gates-rubber-${g}`, `遮断機 ゴムの敷板 ${jp}`, { lats: one, panel: 'rubber', w: 7, road: used, protect: 'gates', gate: g, style: 'concrete', marks: 'worn' });
    X(`double-gates-${g}`, `複線 遮断機 コンクリートの敷板 ${jp}`, { lats: two, panel: 'concrete', w: 7.5, road: used, protect: 'gates', gate: g, style: 'concrete', marks: 'new' });
  }
  X('gates-concrete', '遮断機 コンクリートの敷板', { lats: one, panel: 'concrete', w: 7.5, road: 'asphalt/plain-fresh-clean', protect: 'gates', style: 'concrete', marks: 'new' });
  X('gates-timber', '遮断機 木の敷板', { lats: one, panel: 'timber', w: 7, road: worn, protect: 'gates', gate: 'down', style: 'wood', marks: 'faded', pole: 'signal/pole-galvanized' });
  X('gates-walk', '遮断機 歩道つき', { lats: one, panel: 'concrete-stained', w: 7.5, walk: 2, road: used, protect: 'gates', style: 'concrete-stained', marks: 'worn' });
  X('gates-walk-down', '遮断機 歩道つき 閉', { lats: one, panel: 'rubber', w: 7.5, walk: 2, road: 'asphalt/plain-used-sealed', protect: 'gates', gate: 'down', style: 'concrete', marks: 'worn', walkTex: 'concrete/walk-square-cracked' });
  X('cantilever', '片持ち式警報機と遮断機', { lats: one, panel: 'concrete', w: 7.5, road: used, protect: 'cantilever', style: 'concrete', marks: 'worn' });
  X('cantilever-down', '片持ち式警報機と遮断機 閉', { lats: one, panel: 'rubber-worn', w: 7.5, walk: 1.8, road: worn, protect: 'cantilever', gate: 'down', style: 'wood', marks: 'worn' });
  X('double-passive', '複線 警報機なし', { lats: two, panel: 'timber-old', w: 6, road: worn, protect: 'passive', style: ['wood-old', 'siding'], marks: 'faded', pole: 'signal/pole-wood-grey' });
  X('double-flashers', '複線 警報機', { lats: two, panel: 'rubber-worn', w: 7, road: used, protect: 'flashers', style: 'wood', marks: 'worn' });
  X('double-gates-walk', '複線 遮断機 歩道つき', { lats: two, panel: 'concrete-stained', w: 7.5, walk: 2, road: used, protect: 'gates', gate: 'down', style: 'concrete-stained', marks: 'worn' });
  X('double-cantilever', '複線 片持ち式警報機', { lats: two, panel: 'concrete', w: 7.5, walk: 1.8, road: 'asphalt/plain-used-sealed', protect: 'cantilever', style: 'concrete', marks: 'new' });
  X('double-quad', '複線 4本遮断機 閉', { lats: two, panel: 'concrete', w: 7.5, road: used, protect: 'quad', gate: 'down', style: 'concrete', marks: 'new' });
  X('double-quad-walk', '複線 4本遮断機 歩道つき', { lats: two, panel: 'rubber', w: 7.5, walk: 2, road: used, protect: 'quad', gate: 'half', style: 'station', marks: 'worn' });
  X('triple-gates', '3線 遮断機 ヤード入口', { lats: [-4.5, 0, 4.5], panel: 'timber', w: 7, road: worn, protect: 'gates', style: ['siding', 'wood', 'siding'], marks: 'faded', half: 25 });
  X('wide-cantilever', '4車線道路 片持ち式警報機', { lats: one, panel: 'concrete-stained', w: 14, walk: 2, road: used, protect: 'cantilever', style: 'concrete-stained', marks: 'worn', len: 34 });
  X('wide-cantilever-down', '4車線道路 片持ち式警報機 閉', { lats: two, panel: 'concrete', w: 14, walk: 2, road: 'asphalt/plain-used-sealed', protect: 'cantilever', gate: 'down', style: 'concrete', marks: 'new', len: 34 });
  X('wide-quad', '4車線道路 4本遮断機', { lats: two, panel: 'rubber', w: 14, road: used, protect: 'quad', gate: 'down', style: 'concrete', marks: 'worn', len: 34 });
  X('path-timber', '歩行者用踏切 木の敷板', { lats: one, panel: 'timber', w: 2.4, road: 'concrete/walk-plain', protect: 'passive', style: 'wood', marks: null, half: 13, len: 16 });
  X('path-rubber-gates', '歩行者用踏切 遮断機', { lats: two, panel: 'rubber', w: 3, road: 'concrete/walk-square-dirty', protect: 'gates', gate: 'down', style: 'concrete', marks: null, half: 15, len: 16 });
  X('path-gravel', '歩行者用踏切 砂利道', { lats: one, panel: 'timber-old', w: 2, road: 'ground/gravel-fine', protect: 'passive', style: 'weedy', marks: null, half: 12, len: 14, pole: 'signal/pole-wood' });
}
