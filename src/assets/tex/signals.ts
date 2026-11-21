import { Field, Layers, RGB, TextureData, TextureSpec, Tex, hash2, hex, sstep } from './core';
import * as S from './surfaces';
import { Pt, arrow, bicycle, drawText, hand, walker } from './signkit';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Partial<Pick<TextureSpec, 'tile' | 'density' | 'emissive'>> = {}): void {
  const seed = 9000 + list.length;
  list.push({ id: `signal/${id}`, label, category: 'signal', meters, tile: 'none', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}

const RED: RGB = [1, 0.07, 0.04];
const AMBER: RGB = [1, 0.66, 0.04];
const GREEN: RGB = [0.08, 1, 0.52];
const ORANGE: RGB = [1, 0.36, 0.03];
const WHITE: RGB = [0.92, 0.96, 1];

interface LedOpts {
  color: RGB;
  on: boolean;
  /** LED spacing in metres. */
  pitch: number;
  /** Which LEDs exist, as a drawn mask; all of them within the lens when left out. */
  mask?: (tex: Tex, m: Field) => void;
  /** Lens radius; a rectangular face when left out. */
  radius?: number;
  /** Second colour drawn with its own mask (hand + countdown faces use one colour, walk + countdown two). */
  extra?: { color: RGB; mask: (tex: Tex, m: Field) => void };
}
/** Face of an LED signal module: a hexagonal array of emitters behind a clear cover. */
function led(tex: Tex, seed: number, o: LedOpts): TextureData {
  const L = new Layers(tex, [0.02, 0.02, 0.02], 0.22);
  const draw = (fn?: (tex: Tex, m: Field) => void): Field | null => {
    if (!fn) return null;
    const m = tex.field();
    fn(tex, m);
    return m;
  };
  const mask = draw(o.mask);
  const extra = draw(o.extra?.mask);
  const [cx, cy] = [tex.mw / 2, tex.mh / 2];
  const rowH = o.pitch * 0.866;
  const at = (m: Field, x: number, y: number): number => m[Math.min(tex.h - 1, Math.max(0, Math.floor(y / tex.py))) * tex.w + Math.min(tex.w - 1, Math.max(0, Math.floor(x / tex.px)))];
  tex.map((x, y, k) => {
    const row = Math.round(y / rowH);
    const lx = (Math.round(x / o.pitch - (row & 1) * 0.5) + (row & 1) * 0.5) * o.pitch;
    const ly = row * rowH;
    const dot = 1 - sstep(o.pitch * 0.26, o.pitch * 0.47, Math.hypot(x - lx, y - ly));
    const edge = o.radius ? Math.hypot(lx - cx, ly - cy) - (o.radius - o.pitch * 0.6) : Math.max(Math.abs(lx - cx) - tex.mw / 2, Math.abs(ly - cy) - tex.mh / 2) + o.pitch;
    const lens = o.radius ? 1 - sstep(o.radius - 0.002, o.radius, Math.hypot(x - cx, y - cy)) : 1;
    let color = o.color;
    let has = edge < 0 ? 1 : 0;
    if (mask) has = at(mask, lx, ly) > 0.5 ? 1 : 0;
    if (extra && at(extra, lx, ly) > 0.5) {
      has = 1;
      color = o.extra!.color;
    }
    const each = 0.86 + hash2(Math.round(lx / o.pitch * 2), row, seed) * 0.14;
    const lit = o.on ? has * (0.3 + dot * 0.7) * each : 0;
    const dark = 0.022 + has * dot * 0.05 * lens;
    L.r[k] = (dark * (0.6 + color[0] * 0.6) + color[0] * lit) * (0.35 + lens * 0.65);
    L.g[k] = (dark * (0.6 + color[1] * 0.6) + color[1] * lit) * (0.35 + lens * 0.65);
    L.b[k] = (dark * (0.6 + color[2] * 0.6) + color[2] * lit) * (0.35 + lens * 0.65);
    L.rough[k] = 0.2 + (1 - lens) * 0.4;
    L.height[k] = lens * 0.0006;
    return 0;
  });
  return L.finish();
}
/** Older incandescent module: a tinted glass lens moulded with a diamond prism pattern. */
function glass(tex: Tex, seed: number, color: RGB, on: boolean): TextureData {
  const L = new Layers(tex, [0.02, 0.02, 0.02], 0.15);
  const dust = tex.noise(0.06, 0.06, seed, 3);
  const [cx, cy] = [tex.mw / 2, tex.mh / 2];
  tex.map((x, y, k) => {
    const r = Math.hypot(x - cx, y - cy) / 0.145;
    const lens = 1 - sstep(0.97, 1, r);
    const u = (x + y) / 0.011;
    const v = (x - y) / 0.011;
    const prism = Math.abs(u - Math.round(u)) + Math.abs(v - Math.round(v));
    const glow = on ? (0.5 + 0.5 * Math.exp(-r * r * 2.2)) * (0.78 + prism * 0.44) : 0.1 + prism * 0.12;
    const d = 1 - dust(x, y) * 0.25 - sstep(0.75, 1, r) * 0.25;
    L.r[k] = (0.02 + color[0] * glow * d * (on ? 1 : 0.75)) * lens + 0.015;
    L.g[k] = (0.02 + color[1] * glow * d * (on ? 1 : 0.6)) * lens + 0.015;
    L.b[k] = (0.02 + color[2] * glow * d * (on ? 1 : 0.6)) * lens + 0.015;
    L.rough[k] = 0.12 + dust(x, y) * 0.25;
    L.height[k] = lens * (0.001 + prism * 0.0012);
    return 0;
  });
  return L.finish();
}

const LENS = [0.3, 0.3] as const;
const lensOpts = { density: 850, emissive: 1 };
const COLOURS: [string, string, RGB][] = [['red', '赤', RED], ['yellow', '黄', AMBER], ['green', '青', GREEN]];
for (const [id, jp, color] of COLOURS) {
  add(`lens-${id}-on`, `LED灯器 ${jp} 点灯`, LENS, (t, s) => led(t, s, { color, on: true, pitch: 0.0105, radius: 0.143 }), lensOpts);
  add(`lens-${id}-off`, `LED灯器 ${jp} 消灯`, LENS, (t, s) => led(t, s, { color, on: false, pitch: 0.0105, radius: 0.143 }), { density: 850 });
  add(`glass-${id}-on`, `電球式レンズ ${jp} 点灯`, LENS, (t, s) => glass(t, s, color, true), lensOpts);
  add(`glass-${id}-off`, `電球式レンズ ${jp} 消灯`, LENS, (t, s) => glass(t, s, color, false), { density: 850 });
}
const ARROWS: [string, string, Pt[]][] = [
  ['left', '左', [[0.25, 0.15], [0.07, 0.15]]], ['right', '右', [[0.05, 0.15], [0.23, 0.15]]], ['up', '直進', [[0.15, 0.05], [0.15, 0.23]]],
];
for (const [id, jp, color] of COLOURS) {
  for (const [dir, dj, pts] of ARROWS) {
    if (dir === 'up' && id !== 'green') continue;
    add(`arrow-${id}-${dir}`, `LED矢印 ${jp} ${dj}`, LENS, (t, s) => led(t, s, { color, on: true, pitch: 0.0085, radius: 0.143, mask: (tex, m) => arrow(tex, m, pts, 0.021, 0.075, 0.07) }), lensOpts);
  }
  add(`bike-${id}`, `LED自転車 ${jp}`, LENS, (t, s) => led(t, s, { color, on: true, pitch: 0.007, radius: 0.143, mask: (tex, m) => bicycle(tex, m, 0.15, 0.085, 0.21) }), lensOpts);
}
add('lens-off', 'LED灯器 消灯(無色)', LENS, (t, s) => led(t, s, { color: [0.6, 0.6, 0.6], on: false, pitch: 0.0105, radius: 0.143 }), { density: 850 });

// --- Pedestrian signal faces, 0.4 m square. ---
const PED = [0.4, 0.4] as const;
const pedOpts = { density: 900, emissive: 1 };
const SEGS: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd' };
/** Seven-segment digit w wide and 2w tall with its bottom-left corner at (x, y). */
function digit(tex: Tex, m: Field, d: string, x: number, y: number, w: number): void {
  const seg: Record<string, [Pt, Pt]> = {
    a: [[0, 2], [1, 2]], b: [[1, 2], [1, 1]], c: [[1, 1], [1, 0]], d: [[0, 0], [1, 0]], e: [[0, 1], [0, 0]], f: [[0, 2], [0, 1]], g: [[0, 1], [1, 1]],
  };
  for (const s of SEGS[d] ?? '') {
    const [[ax, ay], [bx, by]] = seg[s];
    const inset = (a: number, b: number): number => a + (b - a) * 0.14;
    tex.stroke(m, [[x + inset(ax, bx) * w, y + inset(ay, by) * w], [x + inset(bx, ax) * w, y + inset(by, ay) * w]], w * 0.085);
  }
}
const number = (n: number) => (tex: Tex, m: Field): void => {
  const s = String(n);
  if (s.length === 2) digit(tex, m, s[0], 0.215, 0.1, 0.065);
  digit(tex, m, s[s.length - 1], 0.305, 0.1, 0.065);
};
const handAt = (cx: number, s: number) => (tex: Tex, m: Field): void => hand(tex, m, cx, 0.2 - s / 2, s);
const walkAt = (cx: number, s: number) => (tex: Tex, m: Field): void => walker(tex, m, cx, 0.2 - s / 2, s);
const ped = (o: Partial<LedOpts>): Gen => (t, s) => led(t, s, { color: ORANGE, on: true, pitch: 0.0058, ...o });
add('ped-hand', '歩行者灯 手(止まれ)', PED, ped({ mask: handAt(0.2, 0.3) }), pedOpts);
add('ped-walk', '歩行者灯 歩行者(進め)', PED, ped({ color: WHITE, mask: walkAt(0.2, 0.3) }), pedOpts);
add('ped-off', '歩行者灯 消灯', PED, ped({ on: false, mask: (tex, m) => { handAt(0.2, 0.3)(tex, m); } }), { density: 900 });
for (const n of [18, 9, 4]) {
  add(`ped-hand-count-${n}`, `歩行者灯 手+残り${n}秒`, PED, ped({ mask: (tex, m) => { handAt(0.11, 0.22)(tex, m); number(n)(tex, m); } }), pedOpts);
}
add('ped-walk-count-24', '歩行者灯 歩行者+残り24秒', PED, ped({ mask: number(24), extra: { color: WHITE, mask: walkAt(0.11, 0.22) } }), pedOpts);
add('ped-walk-side', '歩行者灯 歩行者(カウント消灯)', PED, ped({ color: WHITE, mask: walkAt(0.11, 0.22) }), pedOpts);
const words = (lines: string[], size: number) => (tex: Tex, m: Field): void => {
  lines.forEach((s, i) => drawText(tex, m, s, 0.2, 0.2 + ((lines.length - 1) / 2 - i) * size * 1.45 - size / 2, size, { align: 'c', weight: 0.1, fit: 0.34 }));
};
add('ped-text-dont-walk', '歩行者灯 旧式 DONT WALK', PED, ped({ pitch: 0.005, mask: words(['DONT', 'WALK'], 0.11) }), pedOpts);
add('ped-text-walk', '歩行者灯 旧式 WALK', PED, ped({ pitch: 0.005, color: WHITE, mask: words(['WALK'], 0.11) }), pedOpts);

// --- Lane control and warning lights. ---
const LANE = [0.45, 0.45] as const;
const cross = (tex: Tex, m: Field): void => {
  tex.stroke(m, [[0.09, 0.09], [0.36, 0.36]], 0.032);
  tex.stroke(m, [[0.09, 0.36], [0.36, 0.09]], 0.032);
};
add('lane-x-red', '車線制御 赤×', LANE, (t, s) => led(t, s, { color: RED, on: true, pitch: 0.009, mask: cross }), { density: 800, emissive: 1 });
add('lane-x-yellow', '車線制御 黄×', LANE, (t, s) => led(t, s, { color: AMBER, on: true, pitch: 0.009, mask: cross }), { density: 800, emissive: 1 });
add('lane-arrow-green', '車線制御 青↓', LANE, (t, s) => led(t, s, { color: GREEN, on: true, pitch: 0.009, mask: (tex, m) => arrow(tex, m, [[0.225, 0.38], [0.225, 0.07]], 0.032, 0.115, 0.13) }), { density: 800, emissive: 1 });
add('lane-off', '車線制御 消灯', LANE, (t, s) => led(t, s, { color: [0.6, 0.6, 0.6], on: false, pitch: 0.009 }), { density: 800 });
add('rrfb-on', '点滅灯バー 黄 点灯', [0.18, 0.08], (t, s) => led(t, s, { color: AMBER, on: true, pitch: 0.0075 }), { density: 1600, emissive: 1 });
add('rrfb-off', '点滅灯バー 消灯', [0.18, 0.08], (t, s) => led(t, s, { color: AMBER, on: false, pitch: 0.0075 }), { density: 1600 });

// --- Street light lenses. ---
function lamp(tex: Tex, seed: number, color: RGB, on: boolean, ledArray: boolean): TextureData {
  const L = new Layers(tex, color, 0.3);
  const dust = tex.noise(0.08, 0.08, seed, 3);
  tex.map((x, y, k) => {
    const [u, v] = [x / 0.045, y / 0.045];
    const cell = ledArray ? 1 - sstep(0.12, 0.34, Math.hypot(u - Math.floor(u) - 0.5, v - Math.floor(v) - 0.5)) : 0.5 + 0.5 * Math.cos(x / 0.012 * Math.PI) * Math.cos(y / 0.012 * Math.PI);
    const centre = Math.exp(-(((x - tex.mw / 2) / (tex.mw * 0.4)) ** 2 + ((y - tex.mh / 2) / (tex.mh * 0.4)) ** 2));
    const g = on ? (ledArray ? 0.25 + cell * 0.75 : 0.6 + centre * 0.3 + cell * 0.1) : (ledArray ? 0.1 + cell * 0.5 : 0.45 + cell * 0.2);
    const d = 1 - dust(x, y) * (on ? 0.1 : 0.3);
    L.r[k] = color[0] * g * d;
    L.g[k] = color[1] * g * d;
    L.b[k] = color[2] * g * d;
    L.rough[k] = 0.2 + dust(x, y) * 0.2;
    L.height[k] = cell * 0.0008;
    return 0;
  });
  return L.finish();
}
const LAMP = [0.36, 0.18] as const;
add('lamp-sodium-on', '街路灯 ナトリウム灯 点灯', LAMP, (t, s) => lamp(t, s, [1, 0.62, 0.22], true, false), { density: 700, emissive: 1.4 });
add('lamp-led-on', '街路灯 LED 点灯', LAMP, (t, s) => lamp(t, s, [0.9, 0.95, 1], true, true), { density: 700, emissive: 1.4 });
add('lamp-glass-off', '街路灯 レンズ 消灯', LAMP, (t, s) => lamp(t, s, [0.62, 0.64, 0.62], false, false), { density: 700 });
add('lamp-led-off', '街路灯 LED 消灯', LAMP, (t, s) => lamp(t, s, [0.7, 0.7, 0.62], false, true), { density: 700 });

// --- Housings, poles and cabinets. ---
const tiled = { tile: 'xy' as const };
const PAINT: [string, string, RGB, number][] = [
  ['yellow', '黄', hex(0xd9a70f), 0.04], ['black', '黒', hex(0x18191a), 0.02], ['green', '深緑', hex(0x1e3b2d), 0.04], ['grey', '灰', hex(0x7c8083), 0.03],
  ['yellow-old', '黄・色あせ', hex(0xb99a3a), 0.3], ['black-old', '黒・色あせ', hex(0x33312f), 0.25],
];
for (const [id, jp, paint, rust] of PAINT) add(`housing-${id}`, `灯器の筐体 ${jp}`, [1, 1], (t, s) => S.metal(t, { seed: s, paint, rust, streaks: rust * 2 }), tiled);
add('reflective-yellow', 'バックプレートの反射縁(黄)', [0.5, 0.5], (t, s) => S.metal(t, { seed: s, paint: hex(0xf2c500) }), tiled);
const POLES: [string, string, S.MetalOpts | null][] = [
  ['black', '黒塗装', { seed: 0, paint: hex(0x1c1d1f), rust: 0.05, streaks: 0.2 }], ['green', '深緑塗装', { seed: 0, paint: hex(0x21402f), rust: 0.08, streaks: 0.3 }],
  ['bronze', 'ブロンズ塗装', { seed: 0, paint: hex(0x40342a), rust: 0.03, streaks: 0.2 }], ['grey', '灰塗装', { seed: 0, paint: hex(0x878b8e), rust: 0.1, streaks: 0.4 }],
  ['galvanized', '亜鉛めっき', { seed: 0, streaks: 0.4 }], ['rusty', '亜鉛めっき 錆', { seed: 0, rust: 0.45, streaks: 0.7 }],
];
for (const [id, jp, o] of POLES) add(`pole-${id}`, `信号柱 ${jp}`, [1, 2], (t, s) => S.metal(t, { ...o!, seed: s }), tiled);
add('pole-concrete', '信号柱 コンクリート', [1, 2], (t, s) => S.concrete(t, { seed: s, finish: 'smooth', dirt: 0.5, streaks: 0.9 }), tiled);
add('pole-wood', '電柱 木(防腐処理)', [0.9, 2.4], (t, s) => S.planks(t, { seed: s, width: 0.9, color: hex(0x4a3625), weathered: 0.45 }), tiled);
add('pole-wood-grey', '電柱 木・風化', [0.9, 2.4], (t, s) => S.planks(t, { seed: s, width: 0.9, color: hex(0x6b5d4f), weathered: 0.9 }), tiled);

/** Door side of a controller cabinet: seam, louvres, handle, lock and a utility label. */
function cabinet(tex: Tex, seed: number, color: RGB, metalness: number, tags: number): TextureData {
  const L = new Layers(tex, color, 0.5);
  const tone = tex.noise(0.5, 0.5, seed, 3);
  const brush = tex.noise(1.2, 0.012, seed + 1, 2);
  const dirt = tex.noise(0.3, 0.6, seed + 2, 3);
  const tagN = tex.noise(0.22, 0.12, seed + 3, 2);
  const [w, h] = [tex.mw, tex.mh];
  const label = tex.field();
  tex.rect(label, w * 0.34, h * 0.72 - 0.05, w * 0.66, h * 0.72 + 0.05);
  const ink = tex.field();
  drawText(tex, ink, 'TRAFFIC', w * 0.5, h * 0.72 + 0.008, 0.028, { align: 'c' });
  drawText(tex, ink, 'DOT 4471', w * 0.5, h * 0.72 - 0.036, 0.024, { align: 'c' });
  tex.map((x, y, k) => {
    const seam = Math.min(Math.abs(x - 0.035), Math.abs(x - (w - 0.035)), Math.abs(y - 0.035), Math.abs(y - (h - 0.035)));
    const inDoor = x > 0.035 && x < w - 0.035 && y > 0.035 && y < h - 0.035;
    const gap = 1 - sstep(0.002, 0.006, seam);
    const lv = y > h * 0.12 && y < h * 0.3 && Math.abs(x - w / 2) < w * 0.3 ? 1 : 0;
    const slat = lv * (0.5 - 0.5 * Math.cos((y - h * 0.12) / 0.022 * Math.PI * 2));
    const handle = Math.max(Math.abs(x - (w - 0.11)) - 0.012, Math.abs(y - h * 0.5) - 0.07) < 0 ? 1 : 0;
    const lock = Math.hypot(x - (w - 0.11), y - h * 0.62) < 0.016 ? 1 : 0;
    const grime = (0.25 + dirt(x, y) * 0.6) * (1 - sstep(0, h * 0.5, y)) * 0.6;
    const tag = tags * sstep(0.12, 0.2, tagN(x, y)) * (y > h * 0.3 && y < h * 0.66 && inDoor ? 1 : 0);
    let m = (1 + tone(x, y) * 0.08 + brush(x, y) * 0.07 * metalness) * (1 - gap * 0.75) * (1 - lv * (1 - slat) * 0.7) * (1 - grime);
    let [r, g, b] = [color[0] * m, color[1] * m, color[2] * m];
    if (label[k] > 0.5) {
      const t = ink[k] > 0.5 ? 0.1 : 0.85;
      [r, g, b] = [t, t, t * 0.95];
    }
    if (tag > 0) {
      const tc: RGB = hash2(Math.floor(x / 0.25), Math.floor(y / 0.2), seed) > 0.5 ? [0.08, 0.08, 0.1] : [0.55, 0.12, 0.35];
      r += (tc[0] - r) * tag * 0.85;
      g += (tc[1] - g) * tag * 0.85;
      b += (tc[2] - b) * tag * 0.85;
    }
    if (handle || lock) {
      m = 0.55;
      [r, g, b] = [0.5, 0.5, 0.52];
    }
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.metal[k] = handle || lock ? 0.9 : label[k] > 0.5 || tag > 0.3 ? 0 : metalness * (1 - grime);
    L.rough[k] = handle || lock ? 0.3 : 0.45 + grime * 0.5 + tag * 0.2;
    L.height[k] = -gap * 0.003 + slat * 0.004 + (handle + lock) * 0.008;
    return 0;
  });
  return L.finish();
}
const CAB = [0.75, 1.4] as const;
add('cabinet-aluminium', '制御機の扉 アルミ', CAB, (t, s) => cabinet(t, s, [0.66, 0.67, 0.68], 0.85, 0));
add('cabinet-green', '制御機の扉 緑塗装', CAB, (t, s) => cabinet(t, s, hex(0x3d5546), 0, 0));
add('cabinet-beige', '制御機の扉 ベージュ塗装', CAB, (t, s) => cabinet(t, s, hex(0xa39b86), 0, 0));
add('cabinet-tagged', '制御機の扉 落書き', CAB, (t, s) => cabinet(t, s, [0.6, 0.61, 0.62], 0.6, 1));
add('cabinet-side', '制御機の側面 アルミ', [1, 1], (t, s) => S.metal(t, { seed: s, paint: hex(0x9a9c9e), streaks: 0.4 }), tiled);

add('button', '押しボタン箱', [0.12, 0.2], (tex, seed) => {
  const L = new Layers(tex, hex(0xd9a70f), 0.5);
  const n = tex.noise(0.05, 0.05, seed, 3);
  const ar = tex.field();
  arrow(tex, ar, [[0.03, 0.155], [0.09, 0.155]], 0.008, 0.024, 0.024);
  tex.map((x, y, k) => {
    const d = Math.hypot(x - 0.06, y - 0.07);
    const btn = 1 - sstep(0.026, 0.028, d);
    const rim = (1 - sstep(0.034, 0.036, d)) * (1 - btn);
    const m = 1 + n(x, y) * 0.12;
    const v = btn ? 0.72 - d * 6 : rim ? 0.12 : 0;
    L.r[k] = btn || rim ? v : ar[k] > 0.5 ? 0.08 : 0.85 * m;
    L.g[k] = btn || rim ? v : ar[k] > 0.5 ? 0.08 : 0.65 * m;
    L.b[k] = btn || rim ? v : ar[k] > 0.5 ? 0.08 : 0.06 * m;
    L.metal[k] = btn ? 0.95 : 0;
    L.rough[k] = btn ? 0.25 : 0.5;
    L.height[k] = btn * 0.004 + rim * 0.002;
    return 0;
  });
  return L.finish();
}, { density: 1600 });
add('solar-panel', '太陽電池パネル', [0.468, 0.468], (tex, seed) => {
  const L = new Layers(tex, [0.05, 0.07, 0.16], 0.15);
  const n = tex.noise(0.2, 0.2, seed, 2);
  tex.map((x, y, k) => {
    const [u, v] = [(x / 0.156) % 1, (y / 0.156) % 1];
    const grid = Math.min(u, 1 - u, v, 1 - v) < 0.035 ? 1 : 0;
    const bus = Math.abs(u - 0.3) < 0.012 || Math.abs(u - 0.7) < 0.012 ? 1 : 0;
    const finger = ((y / 0.004) % 1) < 0.25 ? 0.12 : 0;
    const m = 1 + n(x, y) * 0.2;
    L.r[k] = grid ? 0.75 : bus ? 0.6 : (0.035 + finger * 0.3) * m;
    L.g[k] = grid ? 0.76 : bus ? 0.62 : (0.05 + finger * 0.3) * m;
    L.b[k] = grid ? 0.78 : bus ? 0.66 : (0.14 + finger * 0.3) * m;
    L.metal[k] = grid || bus ? 0.8 : 0.3;
    L.rough[k] = 0.15;
    return 0;
  });
  return L.finish();
}, { tile: 'xy', density: 640 });

export const SIGNAL_TEXTURES: readonly TextureSpec[] = list;
