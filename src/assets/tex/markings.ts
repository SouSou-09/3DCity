import { Field, Layers, RGB, Rand, Tex, TextureData, TextureSpec, clamp01, hash2, hex, sstep } from './core';

type Pt = [number, number];

export const PAINT_WHITE: RGB = hex(0xe4e4dc);
export const PAINT_YELLOW: RGB = hex(0xdcae1e);
const PAINT_BLUE: RGB = hex(0x2f62b4);
const PAINT_RED: RGB = hex(0xb42c22);
const PAINT_GREEN: RGB = hex(0x2f8a50);

/**
 * Turns a paint mask into a decal: thermoplastic paint that wears off in flakes, more where wheels pass.
 * `wear` 0 = fresh, 1 = nearly gone. `wheels` lists x positions (metres) of extra wear.
 */
export function paintDecal(tex: Tex, layers: { mask: Field; color: RGB }[], seed: number, wear: number, wheels: number[] = []): TextureData {
  const L = new Layers(tex, [0, 0, 0], 0.6, 0);
  const flake = tex.cells(0.016, seed);
  const mid = tex.noise(0.12, 0.2, seed + 1, 3);
  const big = tex.noise(0.6, 1.1, seed + 2, 2);
  const crackN = tex.cells(0.11, seed + 3);
  const keep = tex.map((x, y) => {
    const c = flake(x, y);
    const id = c.id;
    const cr = crackN(x, y);
    const crack = 1 - sstep(0.015, 0.05, cr.f2 - cr.f1);
    let wheel = 0;
    for (const wx of wheels) wheel = Math.max(wheel, Math.exp(-((x - wx) ** 2) / 0.05));
    const w = wear * (0.75 + mid(x, y) * 0.9 + big(x, y) * 0.7 + (id - 0.5) * 1.1 + wheel * 0.9) + crack * wear * 0.6;
    return clamp01((0.78 - w) * 6);
  });
  for (const { mask, color } of layers) {
    const m = tex.field();
    for (let k = 0; k < tex.n; k++) m[k] = mask[k] * keep[k];
    L.paint(m, (k) => {
      const s = (1 - wear * 0.22) * (0.9 + hash2(k, 1, seed) * 0.14);
      return [color[0] * s, color[1] * s, color[2] * s * (1 - wear * 0.08)];
    }, { rough: 0.55, height: 0.0025, alpha: true });
    // Keep the paint colour under the antialiased edge so that it does not fringe dark.
    for (let k = 0; k < tex.n; k++) {
      if (L.alpha[k] === 0 && mask[k] > 0) {
        L.r[k] = color[0];
        L.g[k] = color[1];
        L.b[k] = color[2];
      }
    }
  }
  return L.finish();
}

const decals: TextureSpec[] = [];
const WEARS: [string, string, number][] = [
  ['new', '新しい', 0.05],
  ['worn', 'かすれ', 0.38],
  ['faded', '消えかけ', 0.68],
];

function addPaint(id: string, label: string, category: TextureSpec['category'], meters: readonly [number, number], tile: TextureSpec['tile'], draw: (tex: Tex) => { mask: Field; color: RGB }[], opts: { wears?: readonly number[]; wheels?: number[]; density?: number } = {}): void {
  for (const wi of opts.wears ?? [0, 1, 2]) {
    const [wid, wlabel, wear] = WEARS[wi];
    const seed = 1000 + decals.length;
    decals.push({ id: `${id}-${wid}`, label: `${label}・${wlabel}`, category, meters, tile, decal: true, density: opts.density ?? 256, generate: (tex) => paintDecal(tex, draw(tex), seed, wear, opts.wheels) });
  }
}

// --- Longitudinal lines: x across, y along the road; the tile repeats along y. ---
interface Stripe {
  /** Offset of the stripe centre from the tile centre, metres. */
  x: number;
  w: number;
  color: RGB;
  /** Painted length and gap; leave out for a solid line. */
  dash?: readonly [number, number];
}
function lineSpec(id: string, label: string, width: number, period: number, stripes: Stripe[], extra?: (tex: Tex, add: (color: RGB) => Field) => void): void {
  addPaint(`line/${id}`, label, 'line', [width, period], 'y', (tex) => {
    const out: { mask: Field; color: RGB }[] = [];
    const get = (color: RGB): Field => {
      let l = out.find((o) => o.color === color);
      if (!l) out.push((l = { mask: tex.field(), color }));
      return l.mask;
    };
    for (const s of stripes) {
      const cx = width / 2 + s.x;
      if (!s.dash) tex.rect(get(s.color), cx - s.w / 2, -1, cx + s.w / 2, period + 1);
      else for (let y = (period % (s.dash[0] + s.dash[1])) / 2 + s.dash[1] / 2; y < period; y += s.dash[0] + s.dash[1]) tex.rect(get(s.color), cx - s.w / 2, y, cx + s.w / 2, y + s.dash[0]);
    }
    extra?.(tex, get);
    return out;
  }, { density: 128 });
}
const W = PAINT_WHITE;
const Y = PAINT_YELLOW;
lineSpec('solid-white', '実線 白', 0.5, 4, [{ x: 0, w: 0.12, color: W }]);
lineSpec('solid-white-wide', '太実線 白(20cm)', 0.5, 4, [{ x: 0, w: 0.2, color: W }]);
lineSpec('solid-yellow', '実線 黄', 0.5, 4, [{ x: 0, w: 0.12, color: Y }]);
lineSpec('double-yellow', '二重実線 黄(中央線)', 0.5, 4, [{ x: -0.11, w: 0.1, color: Y }, { x: 0.11, w: 0.1, color: Y }]);
lineSpec('double-white', '二重実線 白', 0.5, 4, [{ x: -0.11, w: 0.1, color: W }, { x: 0.11, w: 0.1, color: W }]);
lineSpec('solid-dashed-yellow', '実線+破線 黄(片側追越可)', 0.5, 12, [{ x: -0.11, w: 0.1, color: Y }, { x: 0.11, w: 0.1, color: Y, dash: [3, 9] }]);
lineSpec('dashed-white', '破線 白(車線境界 3m/9m)', 0.5, 12, [{ x: 0, w: 0.12, color: W, dash: [3, 9] }]);
lineSpec('dashed-white-short', '破線 白(短 1m/3m)', 0.5, 4, [{ x: 0, w: 0.12, color: W, dash: [1, 3] }]);
lineSpec('dashed-white-dense', '破線 白(密 2m/2m)', 0.5, 4, [{ x: 0, w: 0.15, color: W, dash: [2, 2] }]);
lineSpec('dashed-white-wide', '太破線 白(合流部 3m/3m)', 0.5, 6, [{ x: 0, w: 0.3, color: W, dash: [3, 3] }]);
lineSpec('dashed-yellow', '破線 黄(中央線)', 0.5, 12, [{ x: 0, w: 0.12, color: Y, dash: [3, 9] }]);
lineSpec('dotted-white', '点線 白(誘導 0.6m/1.2m)', 0.5, 1.8, [{ x: 0, w: 0.15, color: W, dash: [0.6, 1.2] }]);
lineSpec('turn-lane-yellow', '中央右左折帯 黄(実線+破線×2)', 3.6, 12, [
  { x: -1.69, w: 0.1, color: Y },
  { x: -1.47, w: 0.1, color: Y, dash: [3, 9] },
  { x: 1.47, w: 0.1, color: Y, dash: [3, 9] },
  { x: 1.69, w: 0.1, color: Y },
]);
lineSpec('bike-lane-white', '自転車レーン 境界線', 1.6, 4, [{ x: -0.72, w: 0.15, color: W }, { x: 0.72, w: 0.1, color: W }]);
lineSpec('bike-buffer', '自転車レーン 斜線緩衝帯', 0.9, 3, [{ x: -0.37, w: 0.12, color: W }, { x: 0.37, w: 0.12, color: W }], (tex, get) => {
  const m = get(W);
  for (let y = -1; y < 4; y += 1.5) tex.poly(m, [[[0.14, y], [0.76, y + 0.62], [0.76, y + 0.8], [0.14, y + 0.18]]]);
});
lineSpec('median-hatch-yellow', '導流帯 黄 斜線', 1.8, 3, [{ x: -0.8, w: 0.12, color: Y }, { x: 0.8, w: 0.12, color: Y }], (tex, get) => {
  const m = get(Y);
  for (let y = -2; y < 4; y += 1.5) tex.poly(m, [[[0.16, y], [1.64, y + 1.48], [1.64, y + 1.72], [0.16, y + 0.24]]]);
});
lineSpec('median-chevron-white', '導流帯 白 シェブロン', 2.4, 3, [{ x: -1.1, w: 0.15, color: W }, { x: 1.1, w: 0.15, color: W }], (tex, get) => {
  const m = get(W);
  for (let y = -2; y < 4; y += 1.5) tex.poly(m, [[[0.18, y + 1.02], [1.2, y], [2.22, y + 1.02], [2.22, y + 1.32], [1.2, y + 0.3], [0.18, y + 1.32]]]);
});
lineSpec('parking-ticks', '路上駐車枠 T字マーク', 2.4, 6.5, [], (tex, get) => {
  const m = get(W);
  tex.rect(m, 0.1, 3.2, 2.3, 3.3);
  tex.rect(m, 0.1, 2.75, 0.2, 3.75);
});
lineSpec('parking-box', '路上駐車枠 白枠', 2.4, 6.5, [{ x: -1.1, w: 0.1, color: W }], (tex, get) => tex.rect(get(W), 0.1, 3.2, 2.4, 3.3));
lineSpec('rumble-edge', '路肩 白線+ランブル', 0.7, 4, [{ x: -0.2, w: 0.15, color: W }]);
lineSpec('edge-red-no-stop', '二重赤線(駐停車禁止)', 0.5, 4, [{ x: -0.09, w: 0.08, color: PAINT_RED }, { x: 0.09, w: 0.08, color: PAINT_RED }]);
lineSpec('bus-lane-line', 'バスレーン 太実線', 0.5, 4, [{ x: 0, w: 0.3, color: W }]);

// --- Crosswalks: x across the road (tiles), y = walking direction... the strip is `depth` metres deep. ---
function crosswalk(id: string, label: string, depth: number, period: number, draw: (tex: Tex, get: (c: RGB) => Field) => void): void {
  addPaint(`crosswalk/${id}`, label, 'crosswalk', [period, depth], 'x', (tex) => {
    const out: { mask: Field; color: RGB }[] = [];
    const get = (color: RGB): Field => {
      let l = out.find((o) => o.color === color);
      if (!l) out.push((l = { mask: tex.field(), color }));
      return l.mask;
    };
    draw(tex, get);
    return out;
  }, { density: 128, wheels: [period * 0.25, period * 0.75] });
}
crosswalk('zebra', '横断歩道 ゼブラ', 4, 1.2, (t, g) => t.rect(g(W), 0.3, 0, 0.9, 4));
crosswalk('zebra-wide', '横断歩道 ゼブラ太', 4, 1.8, (t, g) => t.rect(g(W), 0.4, 0, 1.4, 4));
crosswalk('zebra-yellow', '横断歩道 黄(スクール)', 4, 1.2, (t, g) => t.rect(g(Y), 0.3, 0, 0.9, 4));
crosswalk('zebra-short', '横断歩道 ゼブラ・幅狭(3m)', 3, 1.2, (t, g) => t.rect(g(W), 0.3, 0, 0.9, 3));
crosswalk('parallel', '横断歩道 平行2本線', 3.6, 2, (t, g) => {
  t.rect(g(W), -1, 0.05, 3, 0.35);
  t.rect(g(W), -1, 3.25, 3, 3.55);
});
crosswalk('ladder', '横断歩道 はしご型', 4, 1.2, (t, g) => {
  t.rect(g(W), 0.3, 0, 0.9, 4);
  t.rect(g(W), -1, 0, 3, 0.2);
  t.rect(g(W), -1, 3.8, 3, 4);
});
crosswalk('piano', '横断歩道 交互(千鳥)', 4, 1.2, (t, g) => {
  t.rect(g(W), 0.05, 0, 0.55, 1.9);
  t.rect(g(W), 0.65, 2.1, 1.15, 4);
});
crosswalk('diagonal', '横断歩道 斜めストライプ', 4, 1.6, (t, g) => {
  const m = g(W);
  t.poly(m, [[[0, 0.3], [0.6, 0.3], [1.6, 3.7], [1.0, 3.7]]]);
  t.rect(m, -1, 0, 3, 0.25);
  t.rect(m, -1, 3.75, 3, 4);
});
crosswalk('brick-band', '横断歩道 レンガ風帯', 4, 1.2, (t, g) => {
  t.rect(g(hex(0x8c4030)), -1, 0.3, 3, 3.7);
  t.rect(g(W), -1, 0, 3, 0.3);
  t.rect(g(W), -1, 3.7, 3, 4);
});
crosswalk('rainbow', '横断歩道 レインボー', 4, 3.6, (t, g) => {
  [0xc8322c, 0xe08a22, 0xe0c82a, 0x2f8a50, 0x2f62b4, 0x6a3a96].forEach((c, i) => t.rect(g(hex(c)), i * 0.6, 0, i * 0.6 + 0.6, 4));
});
crosswalk('stop-line', '停止線(60cm)', 0.6, 2, (t, g) => t.rect(g(W), -1, 0, 3, 0.6));
crosswalk('stop-line-thin', '停止線(30cm)', 0.3, 2, (t, g) => t.rect(g(W), -1, 0, 3, 0.3));
crosswalk('yield-teeth', '譲れ線(三角)', 0.7, 0.75, (t, g) => t.poly(g(W), [[[0.075, 0.7], [0.675, 0.7], [0.375, 0]]]));
crosswalk('speed-hump-arrows', 'ハンプ表示(三角)', 1.8, 1.2, (t, g) => t.poly(g(W), [[[0.15, 0], [1.05, 0], [0.6, 1.8]]]));
crosswalk('box-junction', '停止禁止部分(黄格子)', 4, 4, (t, g) => {
  const m = g(Y);
  for (let k = -1; k < 3; k++) {
    t.poly(m, [[[k * 2 - 0.075, 0], [k * 2 + 0.075, 0], [k * 2 + 4.075, 4], [k * 2 + 3.925, 4]]]);
    t.poly(m, [[[k * 2 + 4.075, 0], [k * 2 + 3.925, 0], [k * 2 - 0.075, 4], [k * 2 + 0.075, 4]]]);
  }
});

// --- Symbols: arrows, legends, pictograms. y points along the direction of travel. ---
function arrowHead(cx: number, y: number, w: number, h: number): Pt[] {
  return [[cx - w / 2, y], [cx, y + h], [cx + w / 2, y]];
}
/** Offsets a polyline into a closed ribbon. */
function ribbon(pts: Pt[], half: number): Pt[] {
  const l: Pt[] = [];
  const r: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = Math.hypot(dx, dy) || 1;
    l.push([pts[i][0] - (dy / n) * half, pts[i][1] + (dx / n) * half]);
    r.push([pts[i][0] + (dy / n) * half, pts[i][1] - (dx / n) * half]);
  }
  return [...l, ...r.reverse()];
}
/** Shaft that leaves the bottom centre and bends to `angle` (radians, + = left), ending in a head. */
function turnArrow(tex: Tex, m: Field, cx: number, y0: number, angle: number, rise: number, reach: number): void {
  const pts: Pt[] = [[cx, y0]];
  const dir = Math.PI / 2 + angle;
  const ex = cx + Math.cos(dir) * reach;
  const ey = y0 + rise + Math.sin(dir) * reach;
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    // Quadratic curve from the stem to the tip direction.
    const bx = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * cx + t * t * ex;
    const by = (1 - t) * (1 - t) * (y0 + rise * 0.3) + 2 * (1 - t) * t * (y0 + rise) + t * t * ey;
    pts.push([bx, by]);
  }
  tex.poly(m, [ribbon(pts, 0.075)]);
  const hx = Math.cos(dir);
  const hy = Math.sin(dir);
  const hw = 0.3;
  const hl = 0.8;
  tex.poly(m, [[[ex - hy * hw, ey + hx * hw], [ex + hx * hl, ey + hy * hl], [ex + hy * hw, ey - hx * hw]]]);
}
function symbol(id: string, label: string, meters: readonly [number, number], draw: (tex: Tex, get: (c: RGB) => Field) => void, wears: readonly number[] = [0, 1]): void {
  addPaint(`symbol/${id}`, label, 'symbol', meters, 'none', (tex) => {
    const out: { mask: Field; color: RGB }[] = [];
    const get = (color: RGB): Field => {
      let l = out.find((o) => o.color === color);
      if (!l) out.push((l = { mask: tex.field(), color }));
      return l.mask;
    };
    draw(tex, get);
    for (const o of out) for (let k = 0; k < tex.n; k++) o.mask[k] = clamp01(o.mask[k]);
    return out;
  }, { wears, density: 128 });
}
const L90 = Math.PI / 2;
symbol('arrow-straight', '矢印 直進', [1.5, 5], (t, g) => {
  t.rect(g(W), 0.675, 0.15, 0.825, 3.3);
  t.poly(g(W), [arrowHead(0.75, 3.2, 0.7, 1.6)]);
});
symbol('arrow-left', '矢印 左折', [2, 5], (t, g) => turnArrow(t, g(W), 1.3, 0.15, L90, 2.6, 0.5));
symbol('arrow-right', '矢印 右折', [2, 5], (t, g) => turnArrow(t, g(W), 0.7, 0.15, -L90, 2.6, 0.5));
symbol('arrow-straight-left', '矢印 直進+左折', [2, 5], (t, g) => {
  t.rect(g(W), 1.225, 0.15, 1.375, 3.3);
  t.poly(g(W), [arrowHead(1.3, 3.2, 0.7, 1.6)]);
  turnArrow(t, g(W), 1.3, 0.15, L90, 1.6, 0.4);
});
symbol('arrow-straight-right', '矢印 直進+右折', [2, 5], (t, g) => {
  t.rect(g(W), 0.625, 0.15, 0.775, 3.3);
  t.poly(g(W), [arrowHead(0.7, 3.2, 0.7, 1.6)]);
  turnArrow(t, g(W), 0.7, 0.15, -L90, 1.6, 0.4);
});
symbol('arrow-left-right', '矢印 左右', [2.6, 5], (t, g) => {
  turnArrow(t, g(W), 1.3, 0.15, L90, 2.6, 0.5);
  turnArrow(t, g(W), 1.3, 0.15, -L90, 2.6, 0.5);
});
symbol('arrow-all', '矢印 直進+左右', [2.6, 5], (t, g) => {
  t.rect(g(W), 1.225, 0.15, 1.375, 3.3);
  t.poly(g(W), [arrowHead(1.3, 3.2, 0.7, 1.6)]);
  turnArrow(t, g(W), 1.3, 0.15, L90, 1.6, 0.4);
  turnArrow(t, g(W), 1.3, 0.15, -L90, 1.6, 0.4);
});
symbol('arrow-merge-left', '矢印 合流(左へ)', [2, 5], (t, g) => turnArrow(t, g(W), 1.4, 0.15, 0.6, 2.2, 1.2));
symbol('arrow-merge-right', '矢印 合流(右へ)', [2, 5], (t, g) => turnArrow(t, g(W), 0.6, 0.15, -0.6, 2.2, 1.2));
symbol('arrow-uturn', '矢印 Uターン', [2.2, 5], (t, g) => {
  const pts: Pt[] = [[1.6, 0.15], [1.6, 3.4]];
  for (let i = 1; i <= 12; i++) pts.push([1.1 + Math.cos((i / 12) * Math.PI) * 0.5, 3.4 + Math.sin((i / 12) * Math.PI) * 0.5]);
  pts.push([0.6, 2.6]);
  t.poly(g(W), [ribbon(pts, 0.075)]);
  t.poly(g(W), [[[0.3, 2.7], [0.6, 1.8], [0.9, 2.7]]]);
});
symbol('arrow-bike', '矢印 自転車用(小)', [0.8, 2], (t, g) => {
  t.rect(g(W), 0.35, 0.1, 0.45, 1.2);
  t.poly(g(W), [arrowHead(0.4, 1.15, 0.4, 0.7)]);
});
symbol('sharrow', 'シャロー(自転車共用)', [1.2, 3], (t, g) => {
  const m = g(W);
  for (const y of [1.9, 2.3]) t.poly(m, [[[0.2, y], [0.6, y + 0.4], [1.0, y], [1.0, y + 0.14], [0.6, y + 0.54], [0.2, y + 0.14]]]);
  bike(t, m, 0.6, 0.85, 0.5);
});

/** Blocky stencil letters on a 5 x 7 grid. */
const GLYPHS: Record<string, string> = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001',
  I: '11111001000010000100001000010011111', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110',
  T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110', W: '10001100011000110101101011101110001',
  X: '10001100010101000100010101000110001', Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100110010001000011111',
  '3': '11110000010000101110000010000111110', '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
  '6': '01110100001000011110100011000101110', '8': '01110100011000101110100011000101110', ' ': '00000000000000000000000000000000000',
};
/** Draws elongated road lettering with its bottom-left corner at (x, y). Returns the width used. */
function text(tex: Tex, m: Field, s: string, x: number, y: number, cw: number, ch: number): number {
  const px = cw / 5;
  const py = ch / 7;
  // Cells overlap by half the antialiasing width so that no seams show between them.
  const grow = Math.max(0.03, (tex.px + tex.py) * 0.5) * 0.5 + 0.002;
  let cx = x;
  for (const c of s) {
    const g = GLYPHS[c] ?? GLYPHS[' '];
    for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r * 5 + q] === '1') tex.sdf(m, cx + q * px, y + (6 - r) * py, cx + (q + 1) * px, y + (7 - r) * py, (X, Y) => Math.max(Math.abs(X - cx - (q + 0.5) * px) - px * 0.5 - grow, Math.abs(Y - y - (6.5 - r) * py) - py * 0.5 - grow), 1, 0.03);
    cx += cw * 1.25;
  }
  return cx - x - cw * 0.25;
}
function legend(id: string, label: string, lines: string[], color: RGB = W, wears: readonly number[] = [0, 1]): void {
  const cw = 0.42;
  const ch = 2.4;
  const width = Math.max(...lines.map((l) => l.length * cw * 1.25 - cw * 0.25)) + 0.4;
  const height = lines.length * (ch + 1.2) - 1.2 + 0.4;
  symbol(id, label, [width, height], (t, g) => {
    // Drivers read the nearest word first, so the first line is at the bottom.
    lines.forEach((l, i) => {
      const w = l.length * cw * 1.25 - cw * 0.25;
      text(t, g(color), l, (width - w) / 2, 0.2 + i * (ch + 1.2), cw, ch);
    });
  }, wears);
}
legend('text-stop', '文字 STOP', ['STOP']);
legend('text-slow', '文字 SLOW', ['SLOW']);
legend('text-only', '文字 ONLY', ['ONLY']);
legend('text-bus-only', '文字 BUS ONLY', ['BUS', 'ONLY']);
legend('text-bus-lane', '文字 BUS LANE 黄', ['BUS', 'LANE'], Y, [1]);
legend('text-school', '文字 SCHOOL 黄', ['SCHOOL'], Y);
legend('text-ped-xing', '文字 PED XING', ['PED', 'XING']);
legend('text-keep-clear', '文字 KEEP CLEAR', ['KEEP', 'CLEAR']);
legend('text-no-parking', '文字 NO PARKING', ['NO', 'PARKING'], W, [1]);
legend('text-taxi', '文字 TAXI', ['TAXI'], Y, [0]);
legend('text-loading', '文字 LOADING ZONE', ['LOADING', 'ZONE'], Y, [1]);
legend('text-exit', '文字 EXIT', ['EXIT'], W, [0]);
legend('text-25', '速度表示 25', ['25']);
legend('text-35', '速度表示 35', ['35'], W, [1]);
legend('text-40', '速度表示 40', ['40'], W, [0]);
legend('text-55', '速度表示 55', ['55'], W, [1]);
legend('text-xing', '文字 X ING(踏切風)', ['XING'], W, [1]);

function bike(tex: Tex, m: Field, cx: number, cy: number, s: number): void {
  const wheel = 0.5 * s;
  tex.ring(m, cx - 0.72 * s, cy, wheel, 0.05 * s, 1, 0.02);
  tex.ring(m, cx + 0.72 * s, cy, wheel, 0.05 * s, 1, 0.02);
  const p = (x: number, y: number): Pt => [cx + x * s, cy + y * s];
  tex.stroke(m, [p(-0.72, 0), p(-0.25, 0.75), p(0.5, 0.75), p(0.72, 0)], 0.045 * s, 1, 0.02);
  tex.stroke(m, [p(-0.25, 0.75), p(0.05, 0), p(0.5, 0.75)], 0.045 * s, 1, 0.02);
  tex.stroke(m, [p(-0.72, 0), p(0.05, 0)], 0.045 * s, 1, 0.02);
  tex.stroke(m, [p(-0.38, 0.95), p(-0.1, 0.95)], 0.05 * s, 1, 0.02);
  tex.stroke(m, [p(-0.25, 0.75), p(-0.25, 0.95)], 0.04 * s, 1, 0.02);
  tex.stroke(m, [p(0.5, 0.75), p(0.42, 1.05), p(0.62, 1.1)], 0.045 * s, 1, 0.02);
}
symbol('bike', '自転車マーク', [1.6, 1.6], (t, g) => bike(t, g(W), 0.8, 0.6, 0.6));
symbol('bike-green-box', '自転車マーク 緑地', [1.6, 2.4], (t, g) => {
  t.rect(g(PAINT_GREEN), 0.05, 0.05, 1.55, 2.35);
  bike(t, g(W), 0.8, 0.95, 0.6);
});
symbol('diamond', 'ひし形(HOV/横断歩道予告)', [1.2, 3.6], (t, g) => t.poly(g(W), [[[0.6, 0.1], [1.1, 1.8], [0.6, 3.5], [0.1, 1.8]], [[0.6, 0.7], [0.92, 1.8], [0.6, 2.9], [0.28, 1.8]]]));
symbol('yield-triangle', '譲れ 逆三角', [1.6, 3.6], (t, g) => t.poly(g(W), [[[0.1, 3.5], [1.5, 3.5], [0.8, 0.1]], [[0.4, 3.25], [1.2, 3.25], [0.8, 1.2]]]));
symbol('handicap', '車いすマーク 青地', [1.5, 1.5], (t, g) => {
  t.rect(g(PAINT_BLUE), 0.05, 0.05, 1.45, 1.45);
  const m = g(W);
  t.disc(m, 0.72, 1.2, 0.09, 1, 0.01);
  t.stroke(m, [[0.7, 1.05], [0.72, 0.7], [1.0, 0.7], [1.15, 0.38], [1.25, 0.42]], 0.05, 1, 0.01);
  t.stroke(m, [[0.72, 0.9], [0.95, 0.9]], 0.04, 1, 0.01);
  const arc: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = 2.0 + (i / 16) * 4.0;
    arc.push([0.68 + Math.cos(a) * 0.3, 0.52 + Math.sin(a) * 0.3]);
  }
  t.stroke(m, arc, 0.045, 1, 0.01);
});
symbol('ev-charge', 'EV充電枠 緑地', [1.5, 1.5], (t, g) => {
  t.rect(g(PAINT_GREEN), 0.05, 0.05, 1.45, 1.45);
  t.poly(g(W), [[[0.85, 1.3], [0.45, 0.7], [0.7, 0.7], [0.6, 0.2], [1.05, 0.85], [0.78, 0.85]]]);
});
symbol('railroad-x', '踏切予告 X', [2.4, 6], (t, g) => {
  const m = g(W);
  t.stroke(m, [[0.3, 0.3], [2.1, 5.7]], 0.14, 1, 0.02);
  t.stroke(m, [[2.1, 0.3], [0.3, 5.7]], 0.14, 1, 0.02);
});
symbol('speed-hump-chevrons', 'ハンプ シェブロン', [3, 2], (t, g) => {
  const m = g(W);
  for (const x of [0.2, 1.1, 2.0]) t.poly(m, [[[x, 0.2], [x + 0.4, 1.7], [x + 0.8, 0.2], [x + 0.6, 0.2], [x + 0.4, 1.0], [x + 0.2, 0.2]]]);
});
symbol('gore-chevrons', '分流部 ゼブラ(三角)', [4, 12], (t, g) => {
  const m = g(W);
  t.poly(m, [[[2, 11.8], [0.1, 0.1], [0.28, 0.1], [2, 10.8], [3.72, 0.1], [3.9, 0.1]]]);
  for (let y = 0.8; y < 9.5; y += 1.6) {
    const half = 1.75 * (1 - y / 11.5);
    t.poly(m, [[[2 - half, y], [2, y + half * 0.8], [2 + half, y], [2 + half, y + 0.35], [2, y + half * 0.8 + 0.35], [2 - half, y + 0.35]]]);
  }
});
symbol('parking-stall-white', '駐車枠 白', [2.6, 5.4], (t, g) => {
  t.rect(g(W), 0.05, 0.05, 0.15, 5.35);
  t.rect(g(W), 2.45, 0.05, 2.55, 5.35);
  t.rect(g(W), 0.05, 5.25, 2.55, 5.35);
});
symbol('parking-stall-hatched', '駐車禁止ゼブラ(通路)', [1.6, 5.4], (t, g) => {
  const m = g(W);
  t.stroke(m, [[0.1, 0.1], [1.5, 0.1], [1.5, 5.3], [0.1, 5.3], [0.1, 0.1]], 0.05);
  for (let y = 0.1; y < 4.5; y += 0.9) t.poly(m, [[[0.1, y], [1.5, y + 0.8], [1.5, y + 1.0], [0.1, y + 0.2]]]);
});
symbol('bus-stop-box', 'バス停枠 黄', [3, 14], (t, g) => {
  const m = g(Y);
  t.stroke(m, [[0.15, 0.15], [2.85, 0.15], [2.85, 13.85], [0.15, 13.85], [0.15, 0.15]], 0.06);
  text(t, m, 'BUS', 0.75, 2.2, 0.42, 2.4);
  text(t, m, 'STOP', 0.5, 6.2, 0.42, 2.4);
}, [1]);
symbol('fire-lane', '消防活動空地 赤', [3, 6], (t, g) => {
  const m = g(PAINT_RED);
  t.stroke(m, [[0.15, 0.15], [2.85, 0.15], [2.85, 5.85], [0.15, 5.85], [0.15, 0.15]], 0.07);
  t.stroke(m, [[0.15, 0.15], [2.85, 5.85]], 0.07);
  t.stroke(m, [[2.85, 0.15], [0.15, 5.85]], 0.07);
}, [1]);

// --- Covers and stains set into the road surface. ---
function iron(tex: Tex, seed: number, shape: (tex: Tex, body: Field, relief: Field, cut: Field) => void, opts: { rust?: number; concreteRing?: Field | null; grate?: boolean } = {}): TextureData {
  const L = new Layers(tex, [0, 0, 0], 0.6, 0);
  const body = tex.field();
  const relief = tex.field();
  const cut = tex.field();
  shape(tex, body, relief, cut);
  const rustN = tex.noise(0.15, 0.15, seed, 3);
  const fine = tex.noise(0.012, 0.012, seed + 1, 2);
  const rust = opts.rust ?? 0.3;
  const collar = tex.blur(body, 0.05, 2);
  // Asphalt collar: a darker ring of tar around the frame.
  const ring = tex.field();
  for (let k = 0; k < tex.n; k++) ring[k] = clamp01(collar[k] * 2.2) * (1 - body[k]);
  L.paint(ring, [0.05, 0.05, 0.055], { rough: 0.6, alpha: true, opacity: 0.85 });
  L.paint(body, (k) => {
    const j = k % tex.w;
    const i = (k - j) / tex.w;
    const x = (j + 0.5) * tex.px;
    const y = (i + 0.5) * tex.py;
    const r = clamp01((rustN(x, y) * 1.3 + rust - 0.55) * 3);
    const hi = relief[k] * 0.12;
    const f = 0.9 + fine(x, y) * 0.25;
    const rf = f * (0.8 + relief[k] * 0.5);
    return [(0.17 + hi) * f * (1 - r) + 0.3 * rf * r, (0.165 + hi) * f * (1 - r) + 0.16 * rf * r, (0.16 + hi) * f * (1 - r) + 0.09 * rf * r];
  }, { alpha: true });
  for (let k = 0; k < tex.n; k++) {
    if (body[k] <= 0) continue;
    L.metal[k] = 0.7 * body[k];
    L.rough[k] = 0.42 + (1 - relief[k]) * 0.3;
    L.height[k] = -0.004 * body[k] + relief[k] * 0.004 - cut[k] * 0.03;
  }
  L.paint(cut, [0.01, 0.01, 0.01], { rough: 1, metal: 0 });
  return L.finish(1.4);
}
type CoverDraw = (tex: Tex, body: Field, relief: Field, cut: Field) => void;
function cover(id: string, label: string, meters: readonly [number, number], draw: CoverDraw, rusts: readonly number[] = [0.15, 0.6]): void {
  rusts.forEach((rust, i) => {
    const seed = 3000 + decals.length;
    decals.push({ id: `cover/${id}${i ? '-rusty' : ''}`, label: `${label}${i ? '・錆' : ''}`, category: 'cover', meters, tile: 'none', decal: true, density: 512, generate: (tex) => iron(tex, seed, draw, { rust }) });
  });
}
const round = (pattern: (tex: Tex, relief: Field, cut: Field, c: number, r: number) => void): CoverDraw => (tex, body, relief, cut) => {
  const c = tex.mw / 2;
  const r = tex.mw / 2 - 0.09;
  tex.disc(body, c, c, r + 0.035);
  tex.ring(relief, c, c, r + 0.015, 0.014);
  tex.ring(cut, c, c, r - 0.008, 0.004, 0.5);
  pattern(tex, relief, cut, c, r - 0.03);
  // Pick holes.
  tex.disc(cut, c + r * 0.72, c, 0.012);
  tex.disc(cut, c - r * 0.72, c, 0.012);
};
cover('manhole-waffle', 'マンホール 格子模様', [0.84, 0.84], round((t, rel, _c, c, r) => {
  const m = t.field();
  for (let x = c - r; x < c + r; x += 0.06) for (let y = c - r; y < c + r; y += 0.06) if (Math.hypot(x + 0.02 - c, y + 0.02 - c) < r - 0.03) t.rect(m, x, y, x + 0.04, y + 0.04, 1, 0.006);
  for (let k = 0; k < t.n; k++) rel[k] = Math.max(rel[k], m[k]);
}));
cover('manhole-radial', 'マンホール 放射模様', [0.84, 0.84], round((t, rel, _c, c, r) => {
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    t.stroke(rel, [[c + Math.cos(a) * r * 0.28, c + Math.sin(a) * r * 0.28], [c + Math.cos(a) * r * 0.95, c + Math.sin(a) * r * 0.95]], 0.012, 1, 0.006);
  }
  t.ring(rel, c, c, r * 0.2, 0.012, 1, 0.006);
}));
cover('manhole-rings', 'マンホール 同心円', [0.84, 0.84], round((t, rel, _c, c, r) => {
  for (let q = 0.18; q < 1; q += 0.16) t.ring(rel, c, c, r * q, 0.011, 1, 0.006);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    t.stroke(rel, [[c + Math.cos(a) * r * 0.2, c + Math.sin(a) * r * 0.2], [c + Math.cos(a) * r * 0.95, c + Math.sin(a) * r * 0.95]], 0.008, 1, 0.006);
  }
}));
cover('manhole-dots', 'マンホール 丸鋲', [0.84, 0.84], round((t, rel, _c, c, r) => {
  for (let ring = 1; ring <= 5; ring++) {
    const n = ring * 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring;
      t.disc(rel, c + Math.cos(a) * r * ring * 0.18, c + Math.sin(a) * r * ring * 0.18, 0.016, 1, 0.006);
    }
  }
  t.disc(rel, c, c, 0.03, 1, 0.006);
}));
cover('manhole-city', 'マンホール 市章入り', [0.84, 0.84], round((t, rel, _c, c, r) => {
  t.ring(rel, c, c, r * 0.9, 0.012, 1, 0.006);
  t.ring(rel, c, c, r * 0.55, 0.01, 1, 0.006);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    t.stroke(rel, [[c + Math.cos(a) * r * 0.6, c + Math.sin(a) * r * 0.6], [c + Math.cos(a + 0.2) * r * 0.86, c + Math.sin(a + 0.2) * r * 0.86]], 0.012, 1, 0.006);
  }
  // Star emblem.
  const star: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const q = i % 2 ? 0.2 : 0.48;
    star.push([c + Math.cos(a) * r * q, c + Math.sin(a) * r * q]);
  }
  const m = t.field();
  t.poly(m, [star]);
  for (let k = 0; k < t.n; k++) rel[k] = Math.max(rel[k], clamp01(m[k]));
}));
cover('manhole-small', '小型マンホール(止水栓)', [0.42, 0.42], round((t, rel, _c, c, r) => {
  t.ring(rel, c, c, r * 0.6, 0.01, 1, 0.005);
  t.rect(rel, c - r * 0.4, c - 0.012, c + r * 0.4, c + 0.012, 1, 0.005);
}));
const rectCover = (pattern: (tex: Tex, relief: Field, cut: Field, w: number, h: number) => void): CoverDraw => (tex, body, relief, cut) => {
  const b = 0.07;
  tex.rect(body, b, b, tex.mw - b, tex.mh - b);
  tex.stroke(relief, [[b + 0.015, b + 0.015], [tex.mw - b - 0.015, b + 0.015], [tex.mw - b - 0.015, tex.mh - b - 0.015], [b + 0.015, tex.mh - b - 0.015], [b + 0.015, b + 0.015]], 0.012);
  pattern(tex, relief, cut, tex.mw, tex.mh);
};
cover('storm-grate', '雨水桝グレーチング', [0.74, 0.54], rectCover((t, _r, cut, w, h) => {
  for (let x = 0.13; x < w - 0.12; x += 0.05) t.rect(cut, x, 0.12, x + 0.026, h - 0.12, 1, 0.004);
}));
cover('storm-grate-cross', '雨水桝 格子グレーチング', [0.64, 0.64], rectCover((t, _r, cut, w, h) => {
  for (let x = 0.12; x < w - 0.13; x += 0.07) for (let y = 0.12; y < h - 0.13; y += 0.07) t.rect(cut, x, y, x + 0.045, y + 0.045, 1, 0.004);
}));
cover('storm-grate-long', '側溝グレーチング(細長)', [1.14, 0.44], rectCover((t, _r, cut, w, h) => {
  for (let x = 0.12; x < w - 0.1; x += 0.035) t.rect(cut, x, 0.11, x + 0.012, h - 0.11, 1, 0.003);
  t.rect(_r, 0.09, h / 2 - 0.008, w - 0.09, h / 2 + 0.008);
}));
cover('utility-rect', '角型ハンドホール 縞鋼板', [0.84, 0.64], rectCover((t, rel, _c, w, h) => {
  for (let x = 0.12; x < w - 0.12; x += 0.05) {
    for (let y = 0.12; y < h - 0.12; y += 0.05) {
      const flip = (Math.round(x / 0.05) + Math.round(y / 0.05)) % 2 ? 1 : -1;
      t.stroke(rel, [[x, y], [x + 0.028, y + 0.028 * flip]], 0.005, 1, 0.004);
    }
  }
}));
cover('utility-double', '角型 2枚蓋(通信)', [1.24, 0.74], rectCover((t, rel, cut, w, h) => {
  t.rect(cut, w / 2 - 0.004, 0.09, w / 2 + 0.004, h - 0.09, 0.6);
  for (const cx of [w * 0.29, w * 0.71]) {
    for (let y = 0.14; y < h - 0.12; y += 0.06) t.rect(rel, cx - 0.2, y, cx + 0.2, y + 0.03, 1, 0.006);
    t.rect(cut, cx - 0.03, h / 2 - 0.008, cx + 0.03, h / 2 + 0.008);
  }
}));
cover('utility-concrete', '角型 コンクリート充填蓋', [0.74, 0.74], rectCover((t, rel, _c, w, h) => {
  t.rect(rel, 0.12, 0.12, w - 0.12, h - 0.12, 0.5, 0.01);
  t.rect(rel, w / 2 - 0.006, 0.1, w / 2 + 0.006, h - 0.1);
  t.rect(rel, 0.1, h / 2 - 0.006, w - 0.1, h / 2 + 0.006);
}));
cover('valve-small', '仕切弁蓋(小・角)', [0.36, 0.36], rectCover((t, rel, _c, w, h) => {
  t.ring(rel, w / 2, h / 2, 0.06, 0.008, 1, 0.004);
  t.disc(rel, w / 2, h / 2, 0.02, 1, 0.004);
}));

/** Soft dark stains and tyre marks: alpha only, no relief. */
function stain(id: string, label: string, meters: readonly [number, number], draw: (tex: Tex, m: Field, rnd: Rand) => void, color: RGB = [0.03, 0.03, 0.035], rough = 0.35, opacity = 0.75): void {
  const seed = 4000 + decals.length;
  decals.push({
    id: `cover/${id}`, label, category: 'cover', meters, tile: 'none', decal: true, density: 128,
    generate: (tex) => {
      const L = new Layers(tex, color, rough, 0);
      const m = tex.field();
      draw(tex, m, new Rand(seed));
      const n = tex.noise(0.1, 0.1, seed, 3);
      tex.map((x, y, k) => {
        // Fade out towards the tile border so that the quad never shows.
        const edge = sstep(0, 0.12, Math.min(x, tex.mw - x, y, tex.mh - y));
        L.alpha[k] = clamp01(m[k] * (0.8 + n(x, y) * 0.5)) * opacity * edge;
        return 0;
      });
      return L.finish();
    },
  });
}
for (let i = 0; i < 4; i++) {
  stain(`oil-stain-${i + 1}`, `油染み ${i + 1}`, [1.6, 1.6], (t, m, r) => {
    for (let k = 0; k < 3 + i * 2; k++) {
      const cx = 0.8 + r.range(-0.35, 0.35);
      const cy = 0.8 + r.range(-0.35, 0.35);
      const rad = r.range(0.06, 0.3);
      t.disc(m, cx, cy, rad, r.range(0.5, 1), rad * 1.3);
    }
  });
}
for (let i = 0; i < 3; i++) {
  stain(`skid-${i + 1}`, `タイヤ痕 ${['直線', 'カーブ', 'ロック'][i]}`, [2.4, 10], (t, m, r) => {
    const bend = i === 1 ? r.range(0.5, 0.9) * r.pick([-1, 1]) : r.range(-0.1, 0.1);
    for (const off of [-0.75, 0.75]) {
      const pts: Pt[] = [];
      for (let s = 0; s <= 24; s++) {
        const q = s / 24;
        pts.push([1.2 + off * (i === 1 ? 0.6 : 1) + bend * q * q * 0.6, 0.8 + q * 8.4]);
      }
      t.stroke(m, pts, (q) => 0.09 * Math.sin(Math.PI * Math.min(1, q * (i === 2 ? 3 : 1.2))) + 0.01, i === 2 ? 1 : 0.7, 0.05);
    }
  }, [0.02, 0.02, 0.02], 0.6, 0.7);
}
stain('tar-snakes', 'タール補修線(蛇行)', [3, 3], (t, m, r) => {
  for (let k = 0; k < 4; k++) {
    const pts: Pt[] = [];
    let x = r.range(0.4, 2.6);
    let y = 0.3;
    while (y < 2.7) {
      pts.push([x, y]);
      x = Math.min(2.6, Math.max(0.4, x + r.range(-0.18, 0.18)));
      y += r.range(0.08, 0.2);
    }
    t.stroke(m, pts, r.range(0.012, 0.022), 1.4, 0.005);
  }
}, [0.03, 0.03, 0.035], 0.35, 0.95);
stain('patch-square', '舗装パッチ(四角)', [1.6, 1.4], (t, m) => t.rect(m, 0.2, 0.2, 1.4, 1.2, 1.3, 0.01), [0.07, 0.07, 0.072], 0.92, 0.9);
stain('patch-long', '舗装パッチ(掘削跡)', [1.2, 6], (t, m) => t.rect(m, 0.2, 0.2, 1.0, 5.8, 1.3, 0.01), [0.08, 0.08, 0.082], 0.92, 0.9);
stain('puddle-dry', '水たまり跡', [2.4, 1.8], (t, m, r) => {
  for (let k = 0; k < 5; k++) t.disc(m, 1.2 + r.range(-0.5, 0.5), 0.9 + r.range(-0.3, 0.3), r.range(0.25, 0.5), 0.6, 0.25);
}, [0.2, 0.17, 0.13], 0.8, 0.45);
stain('leaves-dirt', '路肩の土・落ち葉だまり', [3, 0.9], (t, m, r) => {
  for (let k = 0; k < 60; k++) t.disc(m, r.range(0.2, 2.8), 0.15 + r.range(0, 0.5) ** 2 * 1.2, r.range(0.03, 0.12), r.range(0.4, 1), 0.06);
}, [0.24, 0.19, 0.12], 0.95, 0.8);

export const DECALS: readonly TextureSpec[] = decals;
