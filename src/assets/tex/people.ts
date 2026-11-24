import { Layers, RGB, TextureData, TextureSpec, Tex, clamp01, hex, lerp, sstep } from './core';
import { drawText } from './signkit';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'reflect' | 'decal' | 'cutout'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 83000 + list.length * 7;
  list.push({ id: `person/${id}`, label, category: 'person', meters, tile: 'none', decal: false, density: 512, ...o, generate: (tex) => generate(tex, seed) });
}
const mix = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const mul = (c: RGB, m: number): RGB => [c[0] * m, c[1] * m, c[2] * m];
/** Value of a piecewise linear table at x. */
export function table(pts: readonly (readonly [number, number])[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1));
  return pts[pts.length - 1][1];
}

// --- Skin and hair. ---
/** Skin from fair to dark. */
export const SKIN: readonly RGB[] = [hex(0xe9bfa2), hex(0xd8a680), hex(0xbd8a62), hex(0x8e5f3e), hex(0x5b3b28)];
const SKIN_NAMES = ['色白', '明るい', '小麦色', '褐色', '濃い褐色'];

/**
 * How hair lies on a head. Around the head `a` runs from 0 (middle of the face) to 1 (middle of the back), and `t` from the chin (0) to the crown (1).
 * The mesh swells the skull by `thick` where there is hair, and the head's texture paints it there.
 */
export interface Hair {
  /** Hairline: hair grows above this height, by `a`. */
  line: readonly (readonly [number, number])[];
  /** Nothing grows above this height (a bald crown). */
  top?: number;
  /** Thickness over the skull, in head heights: at the sides and back, and on top. */
  thick: number;
  crown?: number;
  /** Hair that hangs over the ears. */
  ears?: boolean;
  /** What hangs behind: a tail, a knot, two tails, or hair down to the shoulders. */
  tail?: 'pony' | 'bun' | 'twin' | 'long';
}
const SHORT: [number, number][] = [[0, 0.8], [0.2, 0.8], [0.3, 0.74], [0.37, 0.52], [0.42, 0.5], [0.455, 0.62], [0.56, 0.62], [0.6, 0.3], [1, 0.24]];
const BACK: [number, number][] = [[0, 0.8], [0.24, 0.78], [0.36, 0.62], [0.56, 0.6], [0.62, 0.3], [1, 0.22]];
const DOWN: [number, number][] = [[0, 0.79], [0.18, 0.77], [0.29, 0.62], [0.37, 0.3], [0.44, 0.06], [1, 0]];
export const HAIRS = {
  short: { line: SHORT, thick: 0.03, crown: 0.05 },
  buzz: { line: SHORT, thick: 0.008, crown: 0.01 },
  quiff: { line: SHORT, thick: 0.025, crown: 0.1 },
  bald: { line: [[0, 2], [1, 2]], thick: 0 },
  balding: { line: [[0, 0.8], [0.3, 0.74], [0.37, 0.52], [0.42, 0.5], [0.455, 0.62], [0.56, 0.62], [0.6, 0.3], [1, 0.24]], top: 0.8, thick: 0.02 },
  afro: { line: [[0, 0.77], [0.3, 0.7], [0.4, 0.5], [0.56, 0.5], [0.62, 0.3], [1, 0.24]], thick: 0.15, crown: 0.19, ears: true },
  curls: { line: SHORT, thick: 0.06, crown: 0.09 },
  back: { line: BACK, thick: 0.014, crown: 0.022 },
  pony: { line: BACK, thick: 0.014, crown: 0.022, tail: 'pony' },
  bun: { line: BACK, thick: 0.014, crown: 0.022, tail: 'bun' },
  twin: { line: BACK, thick: 0.016, crown: 0.024, tail: 'twin' },
  bob: { line: DOWN, thick: 0.07, crown: 0.045, ears: true },
  fringe: { line: [[0, 0.63], [0.2, 0.62], [0.29, 0.56], [0.37, 0.3], [0.44, 0.06], [1, 0]], thick: 0.07, crown: 0.05, ears: true },
  long: { line: DOWN, thick: 0.05, crown: 0.04, ears: true, tail: 'long' },
  veil: { line: [[0, 0.76], [0.16, 0.73], [0.27, 0.52], [0.33, 0.22], [0.37, 0], [1, 0]], thick: 0.045, crown: 0.05, ears: true, tail: 'long' },
} as const satisfies Record<string, Hair>;
export type HairStyle = keyof typeof HAIRS;
/** How much of the skin is under hair at (a, t). */
export function hairAt(h: Hair, a: number, t: number, wobble = 0): number {
  const l = table(h.line, a) + wobble;
  return sstep(l - 0.012, l + 0.012, t) * (h.top === undefined ? 1 : 1 - sstep(h.top - 0.03, h.top + 0.03, t));
}
/** Thickness of the hair over the skull at (a, t), in head heights. */
export function hairThick(h: Hair, a: number, t: number): number {
  const l = table(h.line, a);
  const grown = sstep(l, l + 0.14, t) * (h.top === undefined ? 1 : 1 - sstep(h.top - 0.08, h.top + 0.02, t));
  return grown * lerp(h.thick, h.crown ?? h.thick, sstep(0.62, 0.95, t) * (1 - 0.5 * sstep(0.5, 1, a)));
}

export interface Head {
  label: string;
  tone: number;
  hair: number;
  style: HairStyle;
  sex: 'm' | 'f';
  /** 0 a child, 0.3 a young adult, 1 old. */
  age: number;
  beard?: 'stubble' | 'full' | 'moustache' | 'goatee';
  glasses?: 'wire' | 'thick' | 'sun';
  eyes?: number;
  lips?: number;
  /** Cloth over the hair instead of hair. */
  veil?: number;
}
const [BLACK, DARK, BROWN, FAIR, BLOND, RED, GREY, WHITE] = [0x1a1512, 0x2f2118, 0x4c3422, 0x86683f, 0xc3a063, 0x8a3f1e, 0x8f8d8a, 0xd6d3cc];
export const HEADS = {
  'm-1': { label: '男 茶色の短髪', tone: 1, hair: DARK, style: 'short', sex: 'm', age: 0.35 },
  'm-2': { label: '男 黒髪 無精ひげ', tone: 2, hair: BLACK, style: 'short', sex: 'm', age: 0.4, beard: 'stubble' },
  'm-3': { label: '男 坊主 あごひげ', tone: 3, hair: BLACK, style: 'buzz', sex: 'm', age: 0.35, beard: 'goatee' },
  'm-4': { label: '男 金髪 前髪を上げる', tone: 0, hair: BLOND, style: 'quiff', sex: 'm', age: 0.28, eyes: 0x4c6c8c },
  'm-5': { label: '男 白髪まじり 薄い 眼鏡', tone: 1, hair: GREY, style: 'balding', sex: 'm', age: 0.85, glasses: 'wire' },
  'm-6': { label: '男 ひげ 黒縁眼鏡', tone: 1, hair: BROWN, style: 'short', sex: 'm', age: 0.5, beard: 'full', glasses: 'thick' },
  'm-7': { label: '男 スキンヘッド ひげ', tone: 4, hair: BLACK, style: 'bald', sex: 'm', age: 0.45, beard: 'full' },
  'm-8': { label: '男 口ひげ', tone: 2, hair: BLACK, style: 'back', sex: 'm', age: 0.62, beard: 'moustache' },
  'm-9': { label: '男 白髪', tone: 0, hair: WHITE, style: 'short', sex: 'm', age: 1, eyes: 0x5c7890 },
  'm-10': { label: '男 アフロ', tone: 3, hair: BLACK, style: 'afro', sex: 'm', age: 0.25 },
  'm-11': { label: '男 赤毛 サングラス', tone: 0, hair: RED, style: 'buzz', sex: 'm', age: 0.4, glasses: 'sun', beard: 'stubble' },
  'm-12': { label: '男 黒髪 短髪', tone: 4, hair: BLACK, style: 'curls', sex: 'm', age: 0.3 },
  'm-13': { label: '男 茶髪 中年', tone: 2, hair: BROWN, style: 'back', sex: 'm', age: 0.55 },
  'f-1': { label: '女 茶色の長い髪', tone: 1, hair: BROWN, style: 'long', sex: 'f', age: 0.3 },
  'f-2': { label: '女 黒髪 前髪のあるボブ', tone: 2, hair: BLACK, style: 'fringe', sex: 'f', age: 0.3 },
  'f-3': { label: '女 金髪 ポニーテール', tone: 0, hair: BLOND, style: 'pony', sex: 'f', age: 0.25, eyes: 0x4c6c8c },
  'f-4': { label: '女 黒髪 まとめ髪', tone: 4, hair: BLACK, style: 'bun', sex: 'f', age: 0.4 },
  'f-5': { label: '女 こげ茶の長い髪 サングラス', tone: 2, hair: DARK, style: 'long', sex: 'f', age: 0.35, glasses: 'sun', lips: 0xa83838 },
  'f-6': { label: '女 白髪まじりのボブ 眼鏡', tone: 0, hair: GREY, style: 'bob', sex: 'f', age: 0.9, glasses: 'wire' },
  'f-7': { label: '女 アフロ', tone: 3, hair: BLACK, style: 'afro', sex: 'f', age: 0.3 },
  'f-8': { label: '女 スカーフ', tone: 2, hair: BLACK, style: 'veil', sex: 'f', age: 0.35, veil: 0x6c7c94 },
  'f-9': { label: '女 赤毛 前髪', tone: 0, hair: RED, style: 'fringe', sex: 'f', age: 0.28, eyes: 0x4c7c5c },
  'f-10': { label: '女 茶髪 まとめ髪 中年', tone: 1, hair: FAIR, style: 'bun', sex: 'f', age: 0.6, glasses: 'thick' },
  'f-11': { label: '女 黒髪 ポニーテール', tone: 3, hair: BLACK, style: 'pony', sex: 'f', age: 0.3 },
  'boy-1': { label: '男の子 茶髪', tone: 1, hair: BROWN, style: 'short', sex: 'm', age: 0 },
  'boy-2': { label: '男の子 坊主', tone: 4, hair: BLACK, style: 'buzz', sex: 'm', age: 0 },
  'girl-1': { label: '女の子 二つ結び', tone: 2, hair: BLACK, style: 'twin', sex: 'f', age: 0 },
  'girl-2': { label: '女の子 金髪 ボブ', tone: 0, hair: BLOND, style: 'fringe', sex: 'f', age: 0, eyes: 0x4c6c8c },
} as const satisfies Record<string, Head>;
export type HeadId = keyof typeof HEADS;

/** A head unrolled: x runs once around it (the back at both edges, the face in the middle) and y from the chin to the crown. */
function head(t: Tex, seed: number, f: Head): TextureData {
  const L = new Layers(t, SKIN[f.tone], 0.62);
  const skin = SKIN[f.tone];
  const dark = f.tone >= 3;
  const hair = hex(f.hair);
  const cloth = f.veil === undefined ? null : hex(f.veil);
  const H: Hair = HAIRS[f.style];
  const old = sstep(0.45, 1, f.age);
  const kid = f.age < 0.15;
  const fem = f.sex === 'f';
  const lip = f.lips !== undefined ? hex(f.lips) : mix(skin, dark ? hex(0x5c2c2c) : hex(0xa8504c), fem ? 0.7 : 0.38);
  const iris = hex(f.eyes ?? (dark || f.hair === BLACK ? 0x2c1c12 : 0x4c3420));
  const strand = t.noise(0.006, 0.12, seed + 1, 2);
  const lock = t.noise(0.03, 0.2, seed + 2, 2);
  const edge = t.noise(0.012, 0.5, seed + 3, 2);
  const pore = t.noise(0.01, 0.01, seed + 4, 2);
  const blotch = t.noise(0.07, 0.07, seed + 5, 2);
  const curl = t.noise(0.012, 0.012, seed + 6, 2);
  const [EX, EY, EW] = [0.065, kid ? 0.47 : 0.5, kid ? 0.033 : 0.029];
  const EH = EW * (kid ? 1 : 0.86);
  const ell = (du: number, v: number, cx: number, cy: number, rx: number, ry: number): number => Math.hypot((du - cx) / rx, (v - cy) / ry);
  t.map((x, y, k) => {
    const v = y / t.mh;
    const du = x / t.mw - 0.5;
    const a = Math.abs(du) * 2;
    const s = du < 0 ? -1 : 1;
    const ad = Math.abs(du);
    let c: RGB = skin;
    let rough = 0.62;
    let hgt = 0;
    let sh = 1 + 0.03 * blotch(x, y) + 0.015 * pore(x, y) - 0.1 * sstep(0.27, 0.5, a) - 0.16 * sstep(0.1, 0, v) - 0.05 * sstep(0.3, 0.12, v) * sstep(0.2, 0.4, a);
    // The hollows of the eyes, the cheeks, and the forehead catching the light.
    sh -= (dark ? 0.1 : 0.07) * (1 - sstep(0.5, 1, ell(ad, v, EX, EY + 0.02, 0.055, 0.075)));
    sh += 0.04 * (1 - sstep(0.3, 1, ell(ad, v, 0, 0.7, 0.09, 0.08)));
    c = mix(c, [skin[0] * 1.02, skin[1] * 0.8, skin[2] * 0.76], (fem || kid ? 0.3 : 0.16) * (1 - sstep(0.2, 1, ell(ad, v, 0.095, 0.35, 0.05, 0.075))));
    // Nose: light along the ridge, shade down its sides and under the tip, nostrils.
    const onNose = sstep(0.33, 0.36, v) * sstep(0.6, 0.54, v);
    sh += 0.06 * onNose * sstep(0.01, 0.003, ad) - 0.07 * onNose * sstep(0.008, 0.018, ad) * sstep(0.036, 0.022, ad);
    sh -= 0.1 * (1 - sstep(0.5, 1, ell(ad, v, 0, 0.312, 0.034, 0.02)));
    sh -= 0.5 * (1 - sstep(0.6, 1, ell(ad, v, 0.015, 0.338, 0.0085, 0.011)));
    sh -= 0.06 * (1 - sstep(0.5, 1, ell(ad, v, 0.036, 0.36, 0.008, 0.035)));
    // Mouth.
    const mw = fem ? 0.047 : 0.05;
    const mx = ad / mw;
    if (mx < 1.15) {
      const curve = 0.225 - 0.006 * mx * mx * (f.age > 0.7 ? -0.6 : 0.4);
      const up = curve + (fem ? 0.026 : 0.019) * Math.max(0, 1 - mx * mx) ** 0.7 - 0.007 * Math.exp(-((ad / 0.007) ** 2));
      const lo = curve - (fem ? 0.036 : 0.03) * Math.max(0, 1 - mx * mx) ** 0.6;
      const on = sstep(lo - 0.004, lo + 0.004, v) * sstep(up + 0.004, up - 0.004, v) * sstep(1, 0.9, mx);
      const lower = v < curve;
      c = mix(c, mul(lip, lower ? 1.06 : 0.86), on * 0.9);
      if (on > 0.5) {
        rough = 0.42;
        hgt += 0.0012 * on;
        if (lower) sh += 0.1 * (1 - sstep(0.2, 1, ell(ad, v, 0, (curve + lo) / 2 + 0.004, 0.022, 0.01)));
      }
      sh -= 0.6 * sstep(0.005, 0.0015, Math.abs(v - curve)) * sstep(1.08, 0.95, mx);
    }
    sh -= 0.08 * (1 - sstep(0.4, 1, ell(ad, v, 0, 0.165, 0.036, 0.016)));
    sh += 0.04 * (1 - sstep(0.3, 1, ell(ad, v, 0, 0.09, 0.03, 0.035)));
    // Lines of age.
    if (old > 0) {
      for (const y0 of [0.655, 0.7, 0.745]) sh -= 0.12 * old * sstep(0.004, 0.001, Math.abs(v - y0 - 0.004 * Math.sin(du * 70 + y0 * 40))) * sstep(0.085, 0.06, ad);
      const fold = Math.abs(ad - lerp(0.036, 0.066, clamp01((0.34 - v) / 0.15)));
      sh -= 0.16 * old * sstep(0.005, 0.001, fold) * sstep(0.17, 0.2, v) * sstep(0.35, 0.33, v);
      sh -= 0.1 * old * (1 - sstep(0.6, 1, ell(ad, v, EX, EY - 0.05, 0.03, 0.014)));
      for (const q of [-0.012, 0, 0.012]) sh -= 0.1 * old * sstep(0.003, 0.001, Math.abs(v - EY - q - (ad - 0.1) * q * 30)) * sstep(0.098, 0.102, ad) * sstep(0.125, 0.115, ad);
    }
    // Ears.
    const ear = ell(ad, v, 0.25, 0.47, 0.024, 0.115);
    if (ear < 1) {
      sh -= 0.06;
      c = mix(c, [skin[0], skin[1] * 0.82, skin[2] * 0.8], 0.25);
      sh -= 0.3 * (1 - sstep(0.5, 1, ell(ad, v, 0.252, 0.48, 0.01, 0.06)));
    }
    // Beard.
    if (f.beard) {
      const jaw = sstep(0.37, 0.3, v) * (1 - sstep(0.4, 0.5, a)) * (1 - 0.8 * sstep(0.05, 0.2, v) * sstep(0.12, 0.2, ad) * sstep(0.3, 0.2, v) * (f.beard === 'full' ? 0 : 1));
      const tash = sstep(0.232, 0.245, v) * sstep(0.305, 0.285, v) * sstep(0.064, 0.05, ad);
      const chin = sstep(0.2, 0.185, v) * sstep(0.045, 0.03, ad) + tash;
      const m = f.beard === 'moustache' ? tash : f.beard === 'goatee' ? clamp01(chin) : jaw;
      const mouth = sstep(0.245, 0.235, v) * sstep(0.185, 0.195, v) * sstep(mw + 0.006, mw - 0.004, ad);
      const g = clamp01(m - mouth) * (f.beard === 'stubble' ? 0.38 : 0.94) * (0.75 + 0.25 * strand(x * 1.7, y));
      c = mix(c, mul(hair, 0.9 + 0.3 * lock(x, y)), g);
      if (f.beard !== 'stubble') hgt += 0.002 * g * (1 + strand(x, y));
    }
    // Eyes.
    const ex = (ad - EX) / EW;
    if (Math.abs(ex) < 1.5) {
      const o2 = Math.max(0, 1 - ex * ex);
      const yu = EY + EH * 0.86 * o2 ** 0.6 + 0.004 * ex;
      const yl = EY - EH * 0.6 * o2 ** 0.8 + 0.004 * ex;
      const open = Math.abs(ex) < 1 ? sstep(yl - 0.003, yl + 0.003, v) * sstep(yu + 0.003, yu - 0.003, v) : 0;
      if (open > 0) {
        let e: RGB = mul([0.93, 0.91, 0.89], 1 - 0.3 * sstep(yu - 0.022, yu, v) - 0.12 * Math.abs(ex));
        const ir = ell(ad, v, EX, EY + 0.004, EW * 0.43, EW * 0.43 * 2.15);
        if (ir < 1) e = mix(mul(iris, ir > 0.82 ? 0.55 : 0.9 + 0.5 * (1 - ir)), [0.02, 0.02, 0.02], sstep(0.5, 0.4, ir));
        if (ell(du, v, s * EX - EW * 0.13, EY + 0.018, EW * 0.1, EW * 0.22) < 1) e = [0.95, 0.95, 0.95];
        c = mix(c, e, open);
        sh = lerp(sh, 1, open);
        rough = lerp(rough, 0.12, open);
      }
      const lash = fem ? 0.0075 : 0.0045;
      if (Math.abs(ex) < 1.08) {
        sh -= 0.85 * sstep(lash, lash * 0.3, Math.abs(v - yu - lash * 0.4)) * sstep(1.1, 0.98, Math.abs(ex));
        sh -= 0.25 * sstep(0.004, 0.001, Math.abs(v - yl + 0.003)) * sstep(1.05, 0.9, Math.abs(ex));
        sh -= 0.16 * sstep(0.004, 0.001, Math.abs(v - yu - 0.02 - 0.006 * o2));
        if (fem && !kid) c = mix(c, mul(skin, 0.62), 0.35 * sstep(yu, yu + 0.004, v) * sstep(yu + 0.03, yu + 0.012, v));
      }
      // Brows.
      const bx = (ad - EX - 0.004) / 0.043;
      if (Math.abs(bx) < 1) {
        const by = EY + (kid ? 0.105 : 0.09) + 0.016 * (1 - bx * bx) - 0.006 * bx;
        const bw = (fem ? 0.0085 : 0.0135) * (1 - 0.55 * Math.max(0, bx)) * (old > 0.5 ? 1.15 : 1);
        const g = sstep(bw, bw * 0.45, Math.abs(v - by)) * sstep(1, 0.8, Math.abs(bx)) * (0.8 + 0.2 * strand(x * 2, y * 3));
        c = mix(c, mul(hair, f.hair === BLOND || f.hair === FAIR ? 0.6 : 0.85), g * 0.9);
      }
    }
    // Glasses.
    if (f.glasses) {
      const q = [Math.abs(ad - 0.066) - 0.036, Math.abs(v - EY - 0.002) - 0.05];
      const r = 0.018;
      const d = Math.hypot(Math.max(q[0] + r / 1, 0), Math.max(q[1] + r * 2.15, 0) / 2.15) + Math.min(Math.max(q[0] + r, (q[1] + r * 2.15) / 2.15), 0) - r;
      const fw = f.glasses === 'wire' ? 0.0022 : 0.0055;
      const frame = Math.max(sstep(fw, fw * 0.5, Math.abs(d)), sstep(0.006, 0.003, Math.abs(v - EY - 0.02)) * sstep(0.034, 0.03, ad), sstep(0.007, 0.004, Math.abs(v - EY - 0.02 + (ad - 0.1) * 0.12)) * sstep(0.098, 0.102, ad) * sstep(0.262, 0.25, ad));
      if (f.glasses === 'sun' && d < 0) {
        c = mul([0.05, 0.05, 0.06], 1 + 3 * sstep(0, 0.07, v - EY) * sstep(0.02, -0.02, du * s - 0.07));
        sh = 1;
        rough = 0.08;
      }
      if (frame > 0) {
        c = mix(c, f.glasses === 'wire' ? [0.55, 0.5, 0.4] : [0.04, 0.04, 0.045], frame);
        sh = lerp(sh, 1, frame);
        rough = lerp(rough, 0.3, frame);
        hgt += 0.002 * frame;
      }
    }
    // Hair, or the cloth that covers it.
    const m = hairAt(H, a, v, 0.014 * edge(x, y)) * (H.thick > 0 || cloth ? 1 : 0);
    if (m > 0) {
      if (cloth) {
        const fold = t.noise(0.05, 0.16, seed + 9, 2)(x + 0.2 * v, y);
        c = mix(c, mul(cloth, 0.92 + 0.14 * fold - 0.2 * sstep(0.03, 0, v - table(H.line, a))), m);
        hgt += 0.002 * m * fold;
        rough = lerp(rough, 0.9, m);
      } else {
        const tight = f.style === 'afro' || f.style === 'curls';
        const n = tight ? curl(x, y) : 0.65 * strand(x, y) + 0.35 * lock(x, y);
        const gloss = tight ? 0 : 0.22 * sstep(0.1, 0, Math.abs(v - 0.86 - 0.03 * lock(x, y)));
        const thin = f.style === 'buzz' ? 0.72 : 1;
        c = mix(c, mul(hair, 0.82 + 0.34 * n + gloss), m * thin);
        hgt += (tight ? 0.004 : 0.0018) * m * n;
        rough = lerp(rough, 0.5, m);
      }
      sh = lerp(sh, 1 - 0.14 * sstep(0.5, 0.15, v), m);
      // Skin just under the hairline lies in its shade.
    } else if (H.thick > 0.012 || cloth) sh -= 0.12 * sstep(0.05, 0, table(H.line, a) - v);
    L.r[k] = c[0] * sh;
    L.g[k] = c[1] * sh;
    L.b[k] = c[2] * sh;
    L.rough[k] = rough;
    L.height[k] = hgt;
    return 0;
  });
  return L.finish();
}
for (const [id, f] of Object.entries(HEADS)) add(`head-${id}`, `頭 ${f.label}`, [1, 0.5], (t, s) => head(t, s, f), { tile: 'x' });

/** Skin for limbs on the left half; on the right a hand unrolled, its back to the left and its palm to the right, wrist at the bottom. */
SKIN.forEach((skin, i) =>
  add(`skin-${i + 1}`, `肌 ${SKIN_NAMES[i]}`, [1, 1], (t, seed) => {
    const L = new Layers(t, skin, 0.62);
    const blotch = t.noise(0.12, 0.12, seed, 2);
    const pore = t.noise(0.02, 0.02, seed + 1, 2);
    const palm = mix(skin, hex(0xe0a890), i >= 3 ? 0.55 : 0.2);
    t.map((x, y, k) => {
      let c: RGB = skin;
      let sh = 1 + 0.035 * blotch(x, y) + 0.015 * pore(x, y);
      if (x > 0.5) {
        const u = (x - 0.5) * 2;
        const back = u < 0.5;
        const w = (back ? u : 1 - u) * 2;
        if (!back) c = palm;
        // Fingers: three grooves from the knuckles to the tips, joints across them, nails on the back.
        if (y > 0.52) {
          for (const q of [0.25, 0.5, 0.75]) sh -= 0.45 * sstep(0.02, 0.006, Math.abs(w - q)) * sstep(0.52, 0.58, y);
          for (const q of [0.7, 0.84]) sh -= 0.12 * sstep(0.008, 0.002, Math.abs(y - q));
          if (back && y > 0.92) for (const q of [0.125, 0.375, 0.625, 0.875]) if (Math.abs(w - q) < 0.07) c = mix(c, [0.92, 0.82, 0.78], 0.6);
        } else if (!back) sh -= 0.12 * sstep(0.01, 0.003, Math.abs(y - 0.3 - 0.25 * (w - 0.5) ** 2 * 4));
        else for (const q of [0.125, 0.375, 0.625, 0.875]) sh += 0.05 * sstep(0.05, 0, Math.hypot(w - q, (y - 0.5) * 1.5));
      }
      L.r[k] = c[0] * sh;
      L.g[k] = c[1] * sh;
      L.b[k] = c[2] * sh;
      return 0;
    });
    return L.finish();
  }, { density: 128 }));

// --- Clothes. ---
export type TopKind = 'tee' | 'polo' | 'shirt' | 'hoodie' | 'sweater' | 'suit' | 'jacket' | 'hivis' | 'uniform' | 'coat' | 'dress' | 'tank' | 'scrubs' | 'apron';
export interface Top {
  label: string;
  kind: TopKind;
  colour: number;
  /** Shirt under a suit or a vest, trim of a jacket, bib of an apron. */
  second?: number;
  /** Tie, print, stripes. */
  third?: number;
  pattern?: 'stripes' | 'check' | 'pin' | 'dots' | 'hoops';
  text?: string;
}
export const TOPS = {
  'tee-white': { label: 'Tシャツ 白', kind: 'tee', colour: 0xe4e2dc },
  'tee-black': { label: 'Tシャツ 黒 文字入り', kind: 'tee', colour: 0x1c1c1e, third: 0xd8d4c8, text: 'NYC' },
  'tee-red': { label: 'Tシャツ 赤', kind: 'tee', colour: 0xa8322c },
  'tee-grey': { label: 'Tシャツ 灰 番号入り', kind: 'tee', colour: 0x8c9096, third: 0x2c3c5c, text: '23' },
  'tee-hoops': { label: 'Tシャツ 紺と白の横縞', kind: 'tee', colour: 0xdcdad2, third: 0x2c3a5c, pattern: 'hoops' },
  'tee-green': { label: 'Tシャツ 緑', kind: 'tee', colour: 0x4c6c48 },
  'tee-yellow': { label: 'Tシャツ 黄 (子ども)', kind: 'tee', colour: 0xd8b03c, third: 0x2c5c9c, text: 'GO' },
  'polo-navy': { label: 'ポロシャツ 紺', kind: 'polo', colour: 0x26324c },
  'polo-green': { label: 'ポロシャツ 緑', kind: 'polo', colour: 0x3c6c54, second: 0xd8d4c8 },
  'polo-red': { label: 'ポロシャツ 赤 (店員)', kind: 'polo', colour: 0xb02c2c, second: 0xe8e4dc },
  'shirt-white': { label: 'シャツ 白', kind: 'shirt', colour: 0xe6e6e4 },
  'shirt-blue': { label: 'シャツ 水色', kind: 'shirt', colour: 0x9cb4d0 },
  'shirt-check': { label: 'シャツ 赤のチェック', kind: 'shirt', colour: 0x8c3430, third: 0x1c2434, pattern: 'check' },
  'shirt-stripe': { label: 'シャツ 青の縦縞', kind: 'shirt', colour: 0xdcdcdc, third: 0x5c7ca8, pattern: 'stripes' },
  'shirt-denim': { label: 'シャツ デニム', kind: 'shirt', colour: 0x54708c },
  'hoodie-grey': { label: 'パーカー 灰', kind: 'hoodie', colour: 0x8a8c90 },
  'hoodie-black': { label: 'パーカー 黒', kind: 'hoodie', colour: 0x222226 },
  'hoodie-maroon': { label: 'パーカー えんじ 文字入り', kind: 'hoodie', colour: 0x6c2430, third: 0xd8d0b8, text: 'STATE' },
  'sweater-cream': { label: 'セーター 生成り', kind: 'sweater', colour: 0xcfc4a8 },
  'sweater-green': { label: 'セーター 深緑', kind: 'sweater', colour: 0x34503c },
  'cardigan': { label: 'カーディガン 茶', kind: 'sweater', colour: 0x7c5c44, second: 0xd8d4cc },
  'suit-navy': { label: 'スーツ 紺 赤いネクタイ', kind: 'suit', colour: 0x1e2638, second: 0xe6e6e6, third: 0x8c2428 },
  'suit-grey': { label: 'スーツ 灰 青いネクタイ', kind: 'suit', colour: 0x54585e, second: 0xdcdfe6, third: 0x2c4c7c, pattern: 'pin' },
  'suit-black': { label: 'スーツ 黒', kind: 'suit', colour: 0x18181a, second: 0xe6e6e6, third: 0x1c1c1c },
  'blazer': { label: 'ブレザー ベージュ', kind: 'suit', colour: 0xb09c7c, second: 0x24262c },
  'jacket-leather': { label: '革のジャケット', kind: 'jacket', colour: 0x2c2420 },
  'jacket-denim': { label: 'デニムのジャケット', kind: 'jacket', colour: 0x4c6484, second: 0xc8a060 },
  'jacket-track': { label: 'トラックジャケット 青', kind: 'jacket', colour: 0x24509c, second: 0xe4e4e4 },
  'jacket-puffer': { label: 'ダウンジャケット オレンジ', kind: 'jacket', colour: 0xc8642c, pattern: 'hoops' },
  'hivis-yellow': { label: '反射ベスト 黄', kind: 'hivis', colour: 0xd4e02c, second: 0x5c6470 },
  'hivis-orange': { label: '反射ベスト オレンジ', kind: 'hivis', colour: 0xf06c1c, second: 0x2c3c5c },
  'police': { label: '警察官の制服', kind: 'uniform', colour: 0x1c2438, third: 0xc8a84c },
  'guard': { label: '警備員の制服', kind: 'uniform', colour: 0xd8dce0, third: 0x8c8c94 },
  'courier': { label: '配達員の制服', kind: 'uniform', colour: 0x5c4630, third: 0xd8b84c },
  'coat-camel': { label: 'コート キャメル', kind: 'coat', colour: 0xa8875c },
  'coat-black': { label: 'コート 黒', kind: 'coat', colour: 0x202024 },
  'coat-rain': { label: 'レインコート 黄', kind: 'coat', colour: 0xd8b42c },
  'dress-floral': { label: 'ワンピース 花柄', kind: 'dress', colour: 0x2c3c5c, third: 0xd8a8a0, pattern: 'dots' },
  'dress-red': { label: 'ワンピース 赤', kind: 'dress', colour: 0xa02c34 },
  'dress-green': { label: 'ワンピース 緑の縞', kind: 'dress', colour: 0x5c8468, third: 0xdcdccc, pattern: 'stripes' },
  'tank-white': { label: 'タンクトップ 白', kind: 'tank', colour: 0xe0e0dc },
  'tank-pink': { label: 'ランニングウェア ピンク', kind: 'tank', colour: 0xd84c7c, third: 0x202024 },
  'tank-black': { label: 'タンクトップ 黒', kind: 'tank', colour: 0x202022 },
  'scrubs-teal': { label: '医療着 青緑', kind: 'scrubs', colour: 0x3c8c8c },
  'scrubs-blue': { label: '医療着 青', kind: 'scrubs', colour: 0x4c6cac },
  'apron-green': { label: 'エプロン 緑 (カフェ)', kind: 'apron', colour: 0x24242a, second: 0x2c5c44 },
  'apron-white': { label: 'エプロン 白 (調理)', kind: 'apron', colour: 0xe4e4e0, second: 0xf0f0ec },
} as const satisfies Record<string, Top>;
export type TopId = keyof typeof TOPS;
/** Where a top's torso, sleeve and spare cloth sit across its texture. */
export const TOP_AT = { torso: [0, 0.66], sleeve: [0.68, 0.86], spare: [0.89, 0.99] } as const;

function top(t: Tex, seed: number, g: Top): TextureData {
  const base = hex(g.colour);
  const second = hex(g.second ?? 0xe0e0e0);
  const third = hex(g.third ?? 0x202020);
  const knit = g.kind === 'sweater' || g.kind === 'hoodie';
  const L = new Layers(t, base, g.kind === 'jacket' && g.colour === 0x2c2420 ? 0.45 : 0.86);
  const weave = t.noise(0.004, 0.004, seed, 1);
  const fold = t.noise(0.09, 0.035, seed + 1, 2);
  const drape = t.noise(0.04, 0.16, seed + 2, 2);
  const text = t.field();
  if (g.text) drawText(t, text, g.text, 0.33, g.kind === 'hoodie' ? 0.33 : 0.32, g.text.length > 3 ? 0.04 : 0.06, { weight: 0.11, fit: 0.17 });
  const leather = g.kind === 'jacket' && !g.second && !g.pattern;
  t.map((x, y, k) => {
    const V = y / t.mh;
    let c: RGB = base;
    let rough = leather ? 0.42 : 0.86;
    let metal = 0;
    let hgt = 0;
    let sh = 1 + 0.035 * weave(x, y) + 0.05 * fold(x, y) * (1 - V * 0.5) + 0.04 * drape(x, y);
    const sleeve = x > 0.67 && x < 0.875;
    // Spare cloth for a collar: the shirt's under a suit or a vest.
    if (x >= 0.875 && (g.kind === 'suit' || g.kind === 'hivis') && g.second !== undefined) c = second;
    const torso = x <= 0.67;
    // Metres across the cloth and up it, so that a pattern keeps its size from the body to the sleeves.
    const mx = torso ? (x / 0.66) * 1.0 : ((x - 0.68) / 0.18) * 0.34;
    const my = V * 0.62;
    if (g.pattern === 'hoops') {
      const band = g.kind === 'jacket' ? 0.075 : 0.05;
      const q = ((my / band) % 1 + 1) % 1;
      if (g.kind === 'jacket') {
        sh += 0.1 * Math.sin(q * Math.PI) - 0.14 * sstep(0.08, 0, Math.min(q, 1 - q));
        hgt += 0.004 * Math.sin(q * Math.PI);
      } else if (q < 0.45) c = third;
    } else if (g.pattern === 'stripes') {
      if ((((mx / 0.022) % 1) + 1) % 1 < 0.32) c = third;
    } else if (g.pattern === 'pin') {
      if ((((mx / 0.02) % 1) + 1) % 1 < 0.1) c = mix(c, [0.8, 0.8, 0.8], 0.25);
    } else if (g.pattern === 'check') {
      const a = (((mx / 0.07) % 1) + 1) % 1 < 0.42 ? 1 : 0;
      const b = (((my / 0.07) % 1) + 1) % 1 < 0.42 ? 1 : 0;
      c = mix(c, third, 0.42 * (a + b));
      if (Math.abs((((mx / 0.07) % 1) + 1) % 1 - 0.7) < 0.03 || Math.abs((((my / 0.07) % 1) + 1) % 1 - 0.7) < 0.03) c = mix(c, [0.85, 0.8, 0.6], 0.5);
    } else if (g.pattern === 'dots') {
      const [cx, cy] = [Math.floor(mx / 0.05), Math.floor(my / 0.05)];
      const ox = 0.5 + 0.3 * Math.sin(cx * 12.9 + cy * 78.2);
      const oy = 0.5 + 0.3 * Math.sin(cx * 39.3 + cy * 11.1);
      const d = Math.hypot(mx / 0.05 - cx - ox, my / 0.05 - cy - oy);
      if (d < 0.26) c = d < 0.09 ? [0.85, 0.7, 0.3] : third;
      else if (d < 0.36 && (cx + cy) % 2 === 0) c = mix(c, [0.3, 0.5, 0.3], 0.7);
    }
    if (knit && g.kind === 'sweater') {
      sh += 0.07 * Math.sin((mx / 0.006) * Math.PI * 2) * (0.6 + 0.4 * Math.sin((my / 0.004) * Math.PI * 2));
      hgt += 0.0006 * Math.sin((mx / 0.006) * Math.PI * 2);
    }
    const rib = (lo: number, hi: number, at: number): void => {
      if (at < lo || at > hi) return;
      sh += 0.1 * Math.sin((mx / 0.007) * Math.PI * 2) - 0.05;
      hgt += 0.0008 * Math.sin((mx / 0.007) * Math.PI * 2);
    };
    if (sleeve) {
      const U = (x - 0.68) / 0.18;
      const long = g.kind !== 'tee' && g.kind !== 'polo' && g.kind !== 'scrubs' && g.kind !== 'dress';
      if (g.kind === 'hivis' || g.kind === 'apron') c = g.kind === 'hivis' ? second : base;
      if (knit || g.kind === 'jacket') rib(0, 0.07, V);
      else sh -= 0.25 * sstep(0.008, 0.003, Math.abs(V - (long ? 0.07 : 0.05)));
      if (g.kind === 'polo' && g.second && V < 0.05) c = second;
      if (g.kind === 'uniform') {
        const d = Math.hypot((Math.abs(U - 0.5) - 0.25) * 0.34, (V - 0.8) * 0.62);
        if (d < 0.034) c = d < 0.026 ? mix(third, base, 0.25 + 0.5 * sstep(0.012, 0.014, d) * sstep(0.02, 0.018, d)) : third;
      }
      if (g.kind === 'jacket' && g.second && !leather && g.colour === 0x24509c && Math.abs(Math.abs(U - 0.5) - 0.25) < 0.045) c = second;
      // The seam under the arm and the shade there.
      sh -= 0.12 * sstep(0.1, 0, Math.min(U, 1 - U)) + 0.2 * sstep(0.008, 0.002, Math.min(U, 1 - U));
    } else if (torso) {
      const du = x / 0.66 - 0.5;
      const ad = Math.abs(du);
      sh -= 0.1 * sstep(0.2, 0.27, ad) * sstep(0.33, 0.27, ad) * sstep(0.45, 0.8, V);
      const hem = (h: number): void => {
        sh -= 0.22 * sstep(0.006, 0.002, Math.abs(V - h));
      };
      const buttons = (from: number, to: number, step: number, col: RGB, off = 0): void => {
        if (Math.abs(ad - off) > 0.012 || V < from || V > to) return;
        const q = (((V - from) / step) % 1 + 1) % 1;
        if (Math.hypot((ad - off) * 1.0, (q - 0.5) * step * 0.62) < 0.007) {
          c = col;
          sh = 1;
          hgt += 0.002;
          rough = 0.4;
        }
      };
      // The opening at the neck and what shows in it.
      const vee = (depth: number, wide: number): number => (V > 1 - depth ? ((V - (1 - depth)) / depth) * wide : -1);
      switch (g.kind) {
        case 'tee':
        case 'tank': {
          rib(0.955, 1, V);
          if (g.kind === 'tank' && g.third) {
            if ((ad > 0.2 && ad < 0.3 && V < 0.8) || V < 0.035) c = third;
          }
          hem(0.035);
          if (g.pattern !== 'hoops') c = mix(c, third, clamp01(text[k]) * 0.92);
          break;
        }
        case 'polo': {
          const open = vee(0.2, 0.03);
          if (V > 0.935 - Math.max(0, 0.08 - ad) * 0.5) {
            c = mix(g.second ? second : base, [0, 0, 0], g.second ? 0 : 0.12);
            sh -= 0.3 * sstep(0.008, 0.002, Math.abs(V - 0.935 + Math.max(0, 0.08 - ad) * 0.5));
            hgt += 0.0015;
          } else if (ad < 0.014 && V > 0.72) {
            sh -= 0.06;
            buttons(0.74, 0.92, 0.09, [0.85, 0.85, 0.82]);
          }
          if (open > 0 && ad < open * 0.25) sh -= 0.2;
          hem(0.03);
          break;
        }
        case 'shirt':
        case 'uniform':
        case 'apron':
        case 'hivis': {
          const vest = g.kind === 'hivis';
          const shirt = vest || g.kind === 'apron';
          if (vest) c = base;
          // Collar.
          if (V > 0.925 - Math.max(0, 0.11 - ad) * 0.9 && ad < 0.2 + (V - 0.9) * 2) {
            if (vest) c = second;
            sh += 0.03;
            sh -= 0.3 * sstep(0.008, 0.002, Math.abs(V - 0.925 + Math.max(0, 0.11 - ad) * 0.9));
            hgt += 0.0015;
          }
          if (!vest) {
            if (ad < 0.016) sh -= 0.05 + 0.2 * sstep(0.004, 0.001, Math.abs(ad - 0.014));
            buttons(0.08, 0.9, 0.105, g.kind === 'uniform' ? third : [0.86, 0.86, 0.84]);
            // Chest pockets.
            const pk = Math.max(Math.abs(ad - 0.115) - 0.05, Math.abs(V - 0.7) - 0.055);
            if (g.kind === 'uniform' || du > 0) sh -= 0.2 * sstep(0.006, 0.001, Math.abs(pk)) * (g.kind === 'uniform' || shirt ? 1 : 0.8);
            if (g.kind === 'uniform') {
              if (pk < 0 && V > 0.725) sh -= 0.07;
              // Badge on the left of the chest, name bar on the right, a dark tie.
              const d = Math.hypot((du - 0.115) * 1.0, (V - 0.805) * 0.62);
              if (d < 0.02) {
                c = mix(third, [1, 1, 1], 0.3 * sstep(0.012, 0, d));
                metal = 0.8;
                rough = 0.3;
                hgt += 0.002;
                sh = 1;
              }
              if (Math.abs(du + 0.115) < 0.035 && Math.abs(V - 0.79) < 0.012) {
                c = third;
                metal = 0.7;
                rough = 0.35;
              }
              if (ad < 0.02 * (0.6 + 0.6 * sstep(0.9, 0.5, V)) && V > 0.5 && V < 0.93) c = mul(base, 0.5);
              // Straps on the shoulders.
              if (Math.abs(ad - 0.22) < 0.022 && V > 0.94) c = mul(base, 0.7);
            }
          } else {
            // A vest of bright cloth over the shirt: open at the sides, taped around the body and over the shoulders.
            if (V < 0.1 || (ad > 0.235 && ad < 0.3 && V > 0.6)) c = second;
            if (ad < 0.006) sh -= 0.3;
            const tape = Math.abs(V - 0.34) < 0.045 || Math.abs(V - 0.52) < 0.045 || (Math.abs(ad - 0.115) < 0.03 && V > 0.52) || (Math.abs(ad - 0.385) < 0.03 && V > 0.52);
            if (tape && V > 0.1) {
              c = [0.78, 0.79, 0.8];
              rough = 0.35;
              metal = 0.5;
              sh = 1 + 0.06 * Math.sin((mx + my) / 0.004);
              hgt += 0.001;
            }
          }
          if (g.kind === 'apron') {
            const bib = ad < (V > 0.6 ? 0.1 : 0.21) && V < 0.86;
            const strap = V >= 0.86 && Math.abs(ad - 0.085) < 0.014;
            const tie = Math.abs(V - 0.6) < 0.014 && ad >= 0.21;
            if (bib || strap || tie) {
              c = mul(second, 1 + 0.03 * weave(x * 3, y));
              hgt += 0.002;
              if (bib && Math.max(Math.abs(ad) - 0.07, Math.abs(V - 0.3) - 0.07) < 0 && V < 0.37) sh -= 0.06;
              if (bib) sh -= 0.2 * sstep(0.006, 0.001, Math.abs(Math.max(Math.abs(ad) - 0.07, Math.abs(V - 0.3) - 0.07)));
            }
          }
          hem(0.03);
          break;
        }
        case 'scrubs': {
          const open = vee(0.22, 0.085);
          if (open > 0 && Math.abs(ad - open) < 0.016) {
            c = mul(base, 0.8);
            hgt += 0.0015;
          } else if (open > 0 && ad < open) c = mul(base, 1.12);
          const pk = Math.max(Math.abs(du - 0.115) - 0.05, Math.abs(V - 0.68) - 0.06);
          sh -= 0.22 * sstep(0.006, 0.001, Math.abs(pk));
          for (const s of [-1, 1]) sh -= 0.22 * sstep(0.006, 0.001, Math.abs(Math.max(Math.abs(du - s * 0.12) - 0.07, Math.abs(V - 0.14) - 0.09)));
          hem(0.03);
          break;
        }
        case 'hoodie':
        case 'sweater': {
          rib(0, 0.075, V);
          if (g.kind === 'hoodie') {
            const pocket = Math.max(ad - 0.17 + Math.max(0, V - 0.2) * 0.35, Math.abs(V - 0.2) - 0.105);
            sh -= 0.25 * sstep(0.007, 0.001, Math.abs(pocket));
            if (pocket < 0) hgt += 0.002;
            for (const s of [-1, 1]) if (Math.abs(du - s * (0.03 + (0.9 - V) * 0.02)) < 0.005 && V > 0.62 && V < 0.93) c = [0.86, 0.86, 0.84];
            if (V > 0.9 - ad * 0.3) sh -= 0.06;
            c = mix(c, third, clamp01(text[k]) * 0.92);
          } else if (g.second) {
            // A cardigan: open down the front over a shirt.
            const open = 0.012 + Math.max(0, V - 0.5) * 0.17;
            if (ad < open) c = second;
            else if (ad < open + 0.02) {
              sh -= 0.08;
              hgt += 0.002;
            }
            buttons(0.1, 0.5, 0.1, [0.3, 0.22, 0.16], 0.022);
          } else rib(0.95, 1, V);
          break;
        }
        case 'suit':
        case 'coat': {
          const coat = g.kind === 'coat';
          const rain = coat && g.colour === 0xd8b42c;
          // The opening: a shirt and a tie between the lapels (a coat is buttoned higher).
          const open = coat ? vee(0.2, 0.07) : vee(0.52, 0.105);
          const cut = coat ? 0.8 : 0.48;
          if (!rain && open > 0 && ad < open) {
            c = coat ? mul(base, 0.45) : second;
            sh = 1 - 0.1 * sstep(open - 0.02, open, ad);
            if (!coat && g.third !== undefined) {
              const knot = V > 0.92;
              if (ad < (knot ? 0.02 : 0.013 + 0.012 * sstep(0.95, 0.5, V))) {
                c = mul(third, 1 + 0.12 * Math.sin((du + V) * 300));
                rough = 0.5;
              }
            }
            if (!coat && V > 0.93 - Math.max(0, 0.09 - ad) * 0.8 && ad > 0.014) sh -= 0.07;
          } else if (!rain && open > 0 && ad < open + (coat ? 0.07 : 0.05) * sstep(1 - (coat ? 0.2 : 0.52), 0.9, V) + 0.012) {
            sh += 0.05;
            hgt += 0.002;
            sh -= 0.25 * sstep(0.007, 0.002, Math.abs(ad - open - (coat ? 0.07 : 0.05) * sstep(1 - (coat ? 0.2 : 0.52), 0.9, V) - 0.012));
            if (Math.abs(V - 0.83 - (ad - 0.1) * 0.8) < 0.006) sh -= 0.3;
          }
          // Where the fronts overlap.
          if (V < cut) sh -= 0.25 * sstep(0.006, 0.001, Math.abs(du - 0.012 - (coat ? 0 : Math.max(0, 0.16 - V) * 0.18)));
          if (rain) {
            if (ad < 0.006) sh -= 0.25;
            buttons(0.12, 0.92, 0.13, [0.2, 0.2, 0.22], 0.018);
          } else if (coat) for (const s of [-0.05, 0.05]) {
            const q = ((V - 0.3) / 0.16) % 1;
            if (V > 0.3 && V < 0.78 && Math.hypot(du - 0.012 - s, (q - 0.5) * 0.16 * 0.9) < 0.011) c = mul(base, 0.35);
          } else for (const b of [0.44, 0.34]) if (Math.hypot(du - 0.03, (V - b) * 0.62) < 0.009) {
            c = mul(base, 0.4);
            hgt += 0.002;
          }
          // Pockets: flaps at the hips, a welt on the chest.
          const hip = coat ? 0.36 : 0.24;
          if (Math.abs(ad - 0.17) < 0.06 && Math.abs(V - hip) < (coat ? 0.015 : 0.022)) {
            sh += 0.04;
            hgt += 0.0015;
          }
          sh -= 0.22 * sstep(0.006, 0.001, Math.abs(Math.max(Math.abs(ad - 0.17) - 0.06, Math.abs(V - hip) - (coat ? 0.015 : 0.022))));
          if (!coat && Math.abs(du - 0.125) < 0.04 && Math.abs(V - 0.7) < 0.007) sh -= 0.25;
          if (coat && !rain && Math.abs(V - 0.52) < 0.022) {
            sh -= 0.08 + 0.2 * sstep(0.006, 0.001, Math.abs(Math.abs(V - 0.52) - 0.02));
            hgt += 0.002;
          }
          // Vent at the back.
          if (ad > 0.494 && V < (coat ? 0.3 : 0.2)) sh -= 0.3;
          hem(0.012);
          break;
        }
        case 'jacket': {
          const trim = g.second ? second : mul(base, 0.75);
          if (ad < 0.007) {
            c = leather ? [0.6, 0.6, 0.62] : mul(trim, 0.9);
            metal = leather ? 0.8 : 0;
            sh = 1 + 0.2 * Math.sin(V * 700);
          } else if (ad < 0.016) sh -= 0.1;
          if (V > 0.93) {
            sh -= 0.05;
            hgt += 0.002;
            if (g.colour === 0x24509c) c = second;
          }
          if (g.colour === 0x24509c) {
            rib(0, 0.06, V);
            if (Math.abs(ad - 0.25) < 0.012 && V > 0.6) c = second;
          } else if (g.pattern !== 'hoops') {
            // Slanted pockets, a yoke across the chest and back, stitching in the trim colour.
            const slant = Math.abs(ad - 0.15 - (V - 0.2) * 0.25);
            if (V > 0.12 && V < 0.33) sh -= 0.3 * sstep(0.007, 0.002, slant);
            const yoke = Math.abs(V - 0.8 + (ad < 0.25 ? ad * 0.12 : (0.5 - ad) * 0.12)) ;
            sh -= 0.2 * sstep(0.006, 0.002, yoke);
            if (g.second && !leather) {
              if (Math.abs(yoke - 0.012) < 0.003 || Math.abs(ad - 0.022) < 0.003 || Math.abs(V - 0.05) < 0.004) c = mix(c, second, 0.7 * (Math.sin((mx + my) * 900) > -0.2 ? 1 : 0));
              buttons(0.1, 0.92, 0.14, [0.7, 0.6, 0.4]);
              for (const s of [-1, 1]) sh -= 0.2 * sstep(0.006, 0.001, Math.abs(Math.max(Math.abs(du - s * 0.125) - 0.05, Math.abs(V - 0.68) - 0.05)));
            }
            if (V < 0.05) sh -= 0.05;
          } else if (V < 0.04 || V > 0.95) c = mul(base, 0.8);
          break;
        }
        case 'dress': {
          // Fitted to the waist, gathered below it.
          if (V < 0.55) sh += 0.1 * Math.sin((du * 2 * Math.PI) * 9 + 1.5 * drape(x, y)) * sstep(0.55, 0.3, V);
          sh -= 0.15 * sstep(0.008, 0.002, Math.abs(V - 0.56));
          if (V > 0.97 - ad * 0.25 && ad < 0.16) sh -= 0.1;
          hem(0.012);
          break;
        }
      }
    }
    L.r[k] = c[0] * sh;
    L.g[k] = c[1] * sh;
    L.b[k] = c[2] * sh;
    L.rough[k] = rough;
    L.metal[k] = metal;
    L.height[k] = hgt;
    return 0;
  });
  return L.finish();
}
for (const [id, g] of Object.entries(TOPS)) add(`top-${id}`, `上衣 ${g.label}`, [1, 0.5], (t, s) => top(t, s, g));

export type BottomKind = 'jeans' | 'slacks' | 'chinos' | 'shorts' | 'cargo' | 'sweat' | 'leggings' | 'skirt' | 'work';
export interface Bottom {
  label: string;
  kind: BottomKind;
  colour: number;
  belt?: number;
  stripe?: number;
}
export const BOTTOMS = {
  'jeans-blue': { label: 'ジーンズ 青', kind: 'jeans', colour: 0x3c5478, belt: 0x4c3424 },
  'jeans-dark': { label: 'ジーンズ 濃紺', kind: 'jeans', colour: 0x1e2a40, belt: 0x18181a },
  'jeans-light': { label: 'ジーンズ 色落ち', kind: 'jeans', colour: 0x7c98b4 },
  'jeans-black': { label: 'ジーンズ 黒', kind: 'jeans', colour: 0x1c1c20, belt: 0x18181a },
  'slacks-navy': { label: 'スラックス 紺', kind: 'slacks', colour: 0x1e2638, belt: 0x18181a },
  'slacks-grey': { label: 'スラックス 灰', kind: 'slacks', colour: 0x54585e, belt: 0x18181a },
  'slacks-black': { label: 'スラックス 黒', kind: 'slacks', colour: 0x18181a, belt: 0x18181a },
  'chinos-khaki': { label: 'チノパン カーキ', kind: 'chinos', colour: 0xa8946c, belt: 0x4c3424 },
  'chinos-olive': { label: 'チノパン オリーブ', kind: 'chinos', colour: 0x5c6044, belt: 0x4c3424 },
  'chinos-brown': { label: 'ズボン 茶 (配達員)', kind: 'chinos', colour: 0x5c4630, belt: 0x18181a },
  'police': { label: '警察官のズボン', kind: 'slacks', colour: 0x1c2438, belt: 0x101012, stripe: 0x3c4458 },
  'work-navy': { label: '作業ズボン 紺 反射帯', kind: 'work', colour: 0x2c3850, belt: 0x18181a },
  'work-tan': { label: '作業ズボン 茶', kind: 'work', colour: 0x7c6844 },
  'cargo': { label: 'カーゴショーツ', kind: 'cargo', colour: 0x847c64, belt: 0x4c3424 },
  'shorts-navy': { label: 'ショートパンツ 紺', kind: 'shorts', colour: 0x26304c },
  'shorts-black': { label: 'ランニングショーツ 黒', kind: 'shorts', colour: 0x1c1c20, stripe: 0xe0e0e0 },
  'shorts-red': { label: 'ショートパンツ 赤', kind: 'shorts', colour: 0xa8322c, stripe: 0xe0e0e0 },
  'sweat-grey': { label: 'スウェットパンツ 灰', kind: 'sweat', colour: 0x8a8c90 },
  'sweat-black': { label: 'トラックパンツ 黒 白線', kind: 'sweat', colour: 0x1c1c20, stripe: 0xe0e0e0 },
  'leggings': { label: 'レギンス 黒', kind: 'leggings', colour: 0x18181c },
  'scrubs-teal': { label: '医療着のズボン 青緑', kind: 'sweat', colour: 0x3c8c8c },
  'scrubs-blue': { label: '医療着のズボン 青', kind: 'sweat', colour: 0x4c6cac },
  'skirt-black': { label: 'スカート 黒', kind: 'skirt', colour: 0x1c1c20 },
  'skirt-plaid': { label: 'スカート チェックのひだ', kind: 'skirt', colour: 0x3c4c6c, stripe: 0xa8b0b8 },
  'skirt-denim': { label: 'スカート デニム', kind: 'skirt', colour: 0x54708c, belt: 0x4c3424 },
  'skirt-beige': { label: 'スカート ベージュ', kind: 'skirt', colour: 0xb8a888 },
} as const satisfies Record<string, Bottom>;
export type BottomId = keyof typeof BOTTOMS;
/** Where one leg (or a skirt) and the hips sit in a bottom's texture: x range, then y range. */
export const BOTTOM_AT = { leg: [0, 0.6, 0, 1], hips: [0.62, 1, 0.55, 1] } as const;

function bottom(t: Tex, seed: number, g: Bottom): TextureData {
  const base = hex(g.colour);
  const denim = g.kind === 'jeans' || (g.kind === 'skirt' && g.belt !== undefined);
  const L = new Layers(t, base, g.kind === 'leggings' ? 0.5 : 0.88);
  const weave = t.noise(0.006, 0.006, seed, 1);
  const fold = t.noise(0.1, 0.04, seed + 1, 2);
  const fade = t.noise(0.1, 0.3, seed + 2, 2);
  const stitch: RGB = denim ? [0.78, 0.6, 0.3] : mul(base, 0.6);
  t.map((x, y, k) => {
    let c: RGB = base;
    let sh = 1 + 0.04 * weave(x, y) + 0.04 * fold(x, y);
    let rough = g.kind === 'leggings' ? 0.5 : 0.88;
    let metal = 0;
    let hgt = 0;
    if (denim) sh += 0.05 * Math.sin((x + y) * 1400) + 0.06 * fade(x, y);
    if (x < 0.61) {
      const du = x / 0.6 - 0.5;
      const ad = Math.abs(du);
      const side = Math.abs(ad - 0.25);
      if (g.kind === 'skirt') {
        if (g.stripe !== undefined) {
          // Pleats, and a plaid across them.
          const q = ((x / 0.05) % 1 + 1) % 1;
          sh += 0.1 * (q - 0.5) - 0.25 * sstep(0.06, 0, q);
          const a = ((x / 0.1) % 1 + 1) % 1;
          const b = ((y / 0.1) % 1 + 1) % 1;
          if (Math.abs(a - 0.5) < 0.04 || Math.abs(b - 0.5) < 0.04) c = hex(g.stripe);
          else if (a < 0.2 || b < 0.2) c = mul(base, 0.7);
        } else sh += 0.05 * Math.sin(x * 60 + 2 * fade(x, y)) * sstep(0.9, 0.4, y);
        if (denim) {
          sh -= 0.25 * sstep(0.006, 0.002, ad);
          if (Math.abs(ad - 0.012) < 0.004 || Math.abs(y - 0.03) < 0.004) c = mix(c, stitch, Math.sin(y * 900 + x * 900) > -0.2 ? 0.8 : 0);
        }
        sh -= 0.2 * sstep(0.008, 0.003, Math.abs(y - 0.02));
        if (y > 0.955) {
          sh -= 0.06;
          hgt += 0.001;
        }
      } else {
        // Seams down the outside and the inside of the leg.
        sh -= 0.2 * sstep(0.006, 0.002, side) + 0.25 * sstep(0.006, 0.002, 0.5 - ad) + 0.1 * sstep(0.08, 0, 0.5 - ad);
        if (denim) {
          if (Math.abs(side - 0.01) < 0.003 && du < 0) c = mix(c, stitch, Math.sin(y * 900) > -0.2 ? 0.8 : 0);
          // Worn pale down the front of the thigh and at the knee, creased behind the knee.
          sh += 0.16 * sstep(0.2, 0, ad) * sstep(0.3, 0.6, y) * sstep(1, 0.8, y) + 0.08 * sstep(0.12, 0, ad) * sstep(0.12, 0, Math.abs(y - 0.48));
          for (const q of [0.82, 0.86, 0.9]) sh += 0.07 * sstep(0.008, 0.002, Math.abs(y - q - (ad - 0.1) * 0.2)) * sstep(0.2, 0.1, ad);
          for (const q of [0.5, 0.53, 0.47]) sh -= 0.1 * sstep(0.006, 0.002, Math.abs(y - q)) * sstep(0.35, 0.45, ad);
        }
        if (g.kind === 'slacks') sh += 0.07 * sstep(0.006, 0.001, ad) - 0.05 * sstep(0.012, 0.006, ad) + 0.05 * sstep(0.006, 0.001, 0.5 - ad - 0.02);
        if (g.stripe !== undefined && side < (g.kind === 'slacks' ? 0.012 : 0.03)) c = hex(g.stripe);
        if (g.kind === 'cargo' || g.kind === 'work') {
          const pk = Math.max(side - 0.1, Math.abs(y - (g.kind === 'cargo' ? 0.3 : 0.56)) - (g.kind === 'cargo' ? 0.22 : 0.09));
          sh -= 0.25 * sstep(0.008, 0.002, Math.abs(pk));
          if (pk < 0) {
            hgt += 0.002;
            if (y > (g.kind === 'cargo' ? 0.4 : 0.62)) sh -= 0.05;
          }
        }
        if (g.kind === 'work' && g.belt !== undefined && (Math.abs(y - 0.2) < 0.022 || Math.abs(y - 0.3) < 0.022)) {
          c = [0.78, 0.79, 0.8];
          rough = 0.35;
          metal = 0.5;
          sh = 1 + 0.06 * Math.sin((x + y) / 0.004);
        }
        if (g.kind === 'sweat' && y < 0.06) sh += 0.1 * Math.sin(x * 900) - 0.06;
        else sh -= 0.2 * sstep(0.008, 0.003, Math.abs(y - (g.kind === 'shorts' || g.kind === 'cargo' ? 0.06 : 0.03)));
      }
    } else if (y > 0.54) {
      const du = (x - 0.62) / 0.38 - 0.5;
      const ad = Math.abs(du);
      const V = (y - 0.55) / 0.45;
      const soft = g.kind === 'sweat' || g.kind === 'leggings' || g.kind === 'shorts';
      if (V > 0.78) {
        if (g.belt !== undefined) {
          const band = Math.abs(V - 0.87) < 0.075;
          if (band) {
            c = hex(g.belt);
            rough = 0.45;
            hgt += 0.002;
            sh = 1 - 0.3 * sstep(0.06, 0.075, Math.abs(V - 0.87));
            if (ad < 0.03) {
              c = Math.max(ad - 0.03, Math.abs(V - 0.87) - 0.075) > -0.02 ? [0.72, 0.7, 0.62] : c;
              metal = 0.8;
              rough = 0.3;
            }
          } else sh -= 0.05;
          // Loops.
          for (const q of [0.09, 0.25, 0.42]) if (Math.abs(ad - q) < 0.008) {
            c = base;
            hgt += 0.003;
            metal = 0;
          }
        } else if (soft) {
          sh += 0.1 * Math.sin(du * 600) - 0.06;
          if (g.kind !== 'leggings' && ad < 0.03 && Math.abs(ad - 0.012) < 0.004 && V < 0.9) c = [0.85, 0.85, 0.82];
        } else sh -= 0.05;
        sh -= 0.2 * sstep(0.01, 0.003, Math.abs(V - 0.78));
      } else if (!soft) {
        // The fly, the pockets at the front, patch pockets (or welts) at the back.
        sh -= 0.22 * sstep(0.005, 0.001, Math.abs(du - 0.012)) * (g.kind === 'skirt' && !denim ? 0 : 1);
        if (denim && Math.abs(du - 0.045 + (0.78 - V) * 0.02) < 0.003 && V > 0.2) c = mix(c, stitch, 0.8);
        const mouth = Math.hypot((ad - 0.27) / 0.11, (V - 0.8) / 0.42);
        if (ad < 0.27) sh -= 0.25 * sstep(0.05, 0.01, Math.abs(mouth - 1));
        if (denim && ad < 0.27 && Math.abs(mouth - 1.07) < 0.02) c = mix(c, stitch, 0.7);
        const bp = Math.max(Math.abs(ad - 0.385) - 0.06, Math.abs(V - 0.42) - 0.2 - (denim ? 0.06 * (1 - Math.abs(ad - 0.385) / 0.06) * 0 : 0));
        if (denim) {
          sh -= 0.22 * sstep(0.006, 0.001, Math.abs(bp));
          if (Math.abs(bp + 0.012) < 0.003) c = mix(c, stitch, 0.7);
          if (bp < 0) hgt += 0.001;
        } else if (Math.abs(ad - 0.385) < 0.05 && Math.abs(V - 0.55) < 0.012) sh -= 0.25;
        if (g.stripe !== undefined && g.kind === 'slacks' && Math.abs(ad - 0.25) < 0.012) c = hex(g.stripe);
      } else if (g.stripe !== undefined && Math.abs(ad - 0.25) < 0.03) c = hex(g.stripe);
      // The seam between the legs, front and back.
      if (soft || g.kind !== 'skirt') sh -= 0.12 * sstep(0.006, 0.001, 0.5 - ad) + (soft ? 0.12 * sstep(0.005, 0.001, ad) : 0);
    }
    L.r[k] = c[0] * sh;
    L.g[k] = c[1] * sh;
    L.b[k] = c[2] * sh;
    L.rough[k] = rough;
    L.metal[k] = metal;
    L.height[k] = hgt;
    return 0;
  });
  return L.finish();
}
for (const [id, g] of Object.entries(BOTTOMS)) add(`bottom-${id}`, `下衣 ${g.label}`, [1, 1], (t, s) => bottom(t, s, g), { density: 256 });

// --- Shoes: eight to a sheet. Across a cell the shoe runs from heel to toe; up it, around the shoe from the middle of the sole, over the top, and back. ---
export interface Shoe {
  label: string;
  upper: number;
  sole: number;
  laces?: number;
  /** A stripe along the side. */
  flash?: number;
  /** Leather shines; a boot is taller. */
  shine?: boolean;
}
export const SHOES = {
  'sneaker-white': { label: 'スニーカー 白', upper: 0xe4e4e0, sole: 0xf0f0ec, laces: 0xf0f0ec, flash: 0x3c6cac },
  'sneaker-black': { label: 'スニーカー 黒', upper: 0x1c1c20, sole: 0xe8e8e4, laces: 0xe8e8e4 },
  'runner': { label: 'ランニングシューズ', upper: 0xd8dc3c, sole: 0xf0f0ec, laces: 0x202024, flash: 0xe04c3c },
  'leather-black': { label: '革靴 黒', upper: 0x141416, sole: 0x101010, laces: 0x101010, shine: true },
  'leather-brown': { label: '革靴 茶', upper: 0x5c3820, sole: 0x2c2018, laces: 0x3c2414, shine: true },
  'boot-tan': { label: '作業靴 茶', upper: 0xa8782c, sole: 0x2c2820, laces: 0x4c3c1c },
  'boot-black': { label: 'ブーツ 黒', upper: 0x18181a, sole: 0x101010, laces: 0x101010, shine: true },
  'flat': { label: 'パンプス', upper: 0x2c2024, sole: 0x1c1818, shine: true },
} as const satisfies Record<string, Shoe>;
export type ShoeId = keyof typeof SHOES;
/** Cell of a shoe in the sheet: x0, y0, x1, y1. */
export function shoeCell(id: ShoeId): [number, number, number, number] {
  const i = Object.keys(SHOES).indexOf(id);
  return [(i % 4) * 0.25 + 0.004, Math.floor(i / 4) * 0.25 + 0.004, (i % 4) * 0.25 + 0.246, Math.floor(i / 4) * 0.25 + 0.246];
}
add('shoes', '靴 8種', [1, 0.5], (t, seed) => {
  const L = new Layers(t, [0.2, 0.2, 0.2], 0.8);
  const grain = t.noise(0.01, 0.01, seed, 2);
  const kinds = Object.values(SHOES) as Shoe[];
  t.map((x, y, k) => {
    const g = kinds[Math.min(3, Math.floor(x / 0.25)) + 4 * Math.min(1, Math.floor(y / 0.25))];
    const X = (x % 0.25) / 0.25;
    const Y = (y % 0.25) / 0.25;
    const top = Math.abs(Y - 0.5);
    let c: RGB = hex(g.upper);
    let sh = 1 + 0.05 * grain(x, y);
    let rough = g.shine ? 0.3 : 0.8;
    let hgt = 0;
    if (top > 0.33) {
      // The sole, with a tread underneath.
      c = hex(g.sole);
      rough = 0.9;
      if (top > 0.4) sh -= 0.25 + 0.1 * Math.sin(X * 90);
      sh -= 0.3 * sstep(0.012, 0.004, Math.abs(top - 0.335));
    } else {
      if (g.flash !== undefined && Math.abs(top - 0.2 - (X - 0.5) * 0.12) < 0.035 && X > 0.25 && X < 0.8) c = hex(g.flash);
      // Toe cap, heel counter, the throat with its laces.
      sh -= 0.2 * sstep(0.012, 0.004, Math.abs(X - 0.8 + top * 0.2)) + 0.15 * sstep(0.012, 0.004, Math.abs(X - 0.16));
      if (g.laces !== undefined && X > 0.36 && X < 0.72 && top < 0.075) {
        c = mul(hex(g.upper), 0.8);
        const q = ((X - 0.36) / 0.06) % 1;
        if (Math.abs(q - 0.5) < 0.22) {
          c = hex(g.laces);
          hgt += 0.002;
          rough = 0.8;
        }
      }
      if (X < 0.36 && top < 0.1 * sstep(0.02, 0.12, X)) {
        c = [0.05, 0.05, 0.05];
        rough = 0.9;
      }
    }
    L.r[k] = c[0] * sh;
    L.g[k] = c[1] * sh;
    L.b[k] = c[2] * sh;
    L.rough[k] = rough;
    L.height[k] = hgt;
    return 0;
  });
  return L.finish();
}, { density: 256 });

// --- Things carried and worn: a sheet of sixteen plain or simply marked surfaces. ---
export const GEAR = ['nylon-black', 'leather-brown', 'canvas', 'nylon-red', 'phone', 'cup', 'plastic-yellow', 'plastic-white', 'steel', 'wood', 'cap-navy', 'cap-red', 'kraft', 'bag-white', 'orange', 'paper'] as const;
export type Gear = (typeof GEAR)[number];
/** Cell of a surface in the sheet: x0, y0, x1, y1. */
export function gearCell(id: Gear): [number, number, number, number] {
  const i = GEAR.indexOf(id);
  return [(i % 4) * 0.25 + 0.006, Math.floor(i / 4) * 0.25 + 0.006, (i % 4) * 0.25 + 0.244, Math.floor(i / 4) * 0.25 + 0.244];
}
add('gear', '持ち物・帽子 16種', [1, 1], (t, seed) => {
  const cols = [0x1c1c20, 0x5c3c24, 0x6c6c4c, 0xa82c2c, 0x101012, 0xe8e4dc, 0xe0b82c, 0xe8e8e4, 0x9c9ea4, 0x6c4c2c, 0x202c48, 0xa82c2c, 0xb89868, 0xe8e8e4, 0xe8641c, 0xd8d4c8].map(hex);
  const L = new Layers(t, [0.2, 0.2, 0.2], 0.8);
  const grain = t.noise(0.008, 0.008, seed, 2);
  const print = t.field();
  drawText(t, print, 'MART', 0.375, 0.84, 0.045, { weight: 0.12 });
  for (let r = 0; r < 9; r++) t.rect(print, 0.77, 0.77 + r * 0.022, 0.98, 0.776 + r * 0.022);
  t.map((x, y, k) => {
    const i = Math.min(3, Math.floor(x / 0.25)) + 4 * Math.min(3, Math.floor(y / 0.25));
    const X = (x % 0.25) / 0.25;
    const Y = (y % 0.25) / 0.25;
    let c = cols[i];
    let sh = 1 + 0.05 * grain(x, y);
    let rough = [0.8, 0.5, 0.9, 0.75, 0.2, 0.7, 0.35, 0.35, 0.3, 0.6, 0.85, 0.85, 0.9, 0.6, 0.8, 0.9][i];
    let metal = i === 8 ? 0.9 : 0;
    if (i < 4 || i === 10 || i === 11) sh += 0.05 * Math.sin((x + y) * 1500);
    if (i === 4 && Math.abs(X - 0.5) < 0.42 && Math.abs(Y - 0.5) < 0.44) {
      // A lit screen: a header, lines of text, a picture.
      c = [0.75, 0.8, 0.88];
      if (Y > 0.82) c = [0.25, 0.45, 0.8];
      else if (Y > 0.45 && Y < 0.75 && X > 0.16 && X < 0.84) c = [0.5 + 0.3 * Math.sin(X * 9), 0.55, 0.4 + 0.3 * Math.cos(Y * 11)];
      else if (Y < 0.4 && ((Y / 0.07) % 1) < 0.4 && X > 0.16 && X < 0.8) c = [0.3, 0.32, 0.36];
      rough = 0.1;
      sh = 1;
    }
    if (i === 5) {
      if (Y > 0.86) c = [0.9, 0.9, 0.9];
      else if (Y > 0.3 && Y < 0.66) {
        c = [0.55, 0.4, 0.26];
        sh += 0.08 * Math.sin(X * 150);
      }
    }
    if (i === 12 && Math.abs(X - 0.5) < 0.004) sh -= 0.15;
    if (i === 13 || i === 15) c = mix(c, i === 13 ? [0.75, 0.15, 0.15] : [0.25, 0.25, 0.27], clamp01(print[k]));
    if (i === 14 && Math.abs(Y - 0.5) < 0.1) {
      c = [0.8, 0.8, 0.82];
      metal = 0.5;
      rough = 0.35;
    }
    if (i === 9) sh += 0.08 * Math.sin(X * 60 + 3 * grain(x * 0.3, y));
    L.r[k] = c[0] * sh;
    L.g[k] = c[1] * sh;
    L.b[k] = c[2] * sh;
    L.rough[k] = rough;
    L.metal[k] = metal;
    return 0;
  });
  return L.finish();
}, { density: 256 });

export const PEOPLE_TEXTURES = list;
