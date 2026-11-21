import { Layers, RGB, TextureData, TextureSpec, Tex, clamp01, hash2, hex, lerp, sstep } from './core';
import { drawText } from './signkit';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'reflect'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 24000 + list.length * 7;
  list.push({ id: `window/${id}`, label, category: 'window', meters, tile: 'none', decal: false, density: 256, reflect: 0.7, ...o, generate: (tex) => generate(tex, seed) });
}

const SKY: RGB = [0.5, 0.6, 0.74];
const DARK: RGB = [0.035, 0.04, 0.05];
const CURTAINS: RGB[] = [hex(0xd8d0bc), hex(0x8c6a5a), hex(0x5a6c80), hex(0xb89c6c), hex(0x7c3c38), hex(0x6c7c5c), hex(0xc8c8c4), hex(0x9c7c9c)];
const BLINDS: RGB[] = [hex(0xd8d4c8), hex(0xe4e4e0), hex(0xc0b8a4), hex(0xa8acb0)];
const frac = (v: number): number => v - Math.floor(v);
type Px = [number, number, number];

/** What is seen through a pane: empty room, blinds, curtains, sheers or a roller shade. Returns the colour and how much of the dark room it hides. */
type Inside = 'home' | 'office' | 'none';
function interior(kind: Inside, id: number, seed: number, u: number, v: number, x: number, y: number): [RGB, number] {
  const t = hash2(id, 1, seed);
  const p = hash2(id, 2, seed);
  const q = hash2(id, 3, seed);
  if (kind === 'none' || t < (kind === 'office' ? 0.3 : 0.22)) return [DARK, 0];
  if (kind === 'office' || t < 0.5) {
    // Venetian blinds lowered part of the way.
    const drop = kind === 'office' && p < 0.3 ? 1 : 0.25 + p * 0.8;
    if (v < 1 - drop) return [DARK, 0];
    const c = BLINDS[Math.floor(q * BLINDS.length)];
    const s = frac(y / 0.028);
    const m = (v < 1 - drop + 0.025 ? 0.55 : 0.55 + 0.45 * s) * (1 - 0.12 * sstep(0.3, 0, Math.abs(frac(u * 2 + 0.25) - 0.5) - 0.49));
    return [[c[0] * m, c[1] * m, c[2] * m], 1];
  }
  if (t < 0.8) {
    // Curtains drawn back to each side.
    const open = 0.12 + p * 0.38;
    if (u > open && u < 1 - open) return [DARK, 0];
    const c = CURTAINS[Math.floor(q * CURTAINS.length)];
    const m = 0.7 + 0.3 * Math.sin(x * 90 + Math.sin(y * 3 + id) * 0.8);
    return [[c[0] * m, c[1] * m, c[2] * m], 1];
  }
  if (t < 0.9) {
    const m = 0.8 + 0.2 * Math.sin(x * 70 + Math.sin(y * 2.5 + id) * 1.2);
    return [[0.86 * m, 0.86 * m, 0.83 * m], 0.6];
  }
  if (v < 0.35 + p * 0.5) return [DARK, 0];
  return [q < 0.5 ? [0.76, 0.7, 0.58] : [0.82, 0.82, 0.78], 1];
}
/** Glass over `content`: darkens what is behind and adds the sky it mirrors, brighter towards the top. */
function glaze(out: Px, content: RGB, cover: number, tint: RGB, up: number, cloud: number, mirror = 0): void {
  const refl = clamp01(0.14 + 0.2 * up + cloud * 0.16 + mirror * 0.5);
  const see = (1 - mirror) * 0.72;
  for (let i = 0; i < 3; i++) out[i] = lerp(DARK[i], content[i] * see + DARK[i] * (1 - see), cover) * (1 - refl) + tint[i] * refl * (0.8 + mirror * 0.5);
}

// --- Single windows: an atlas of variants side by side. ---
type Kind = 'sash' | 'casement' | 'slider' | 'fixed' | 'steel' | 'louver' | 'arch' | 'frosted' | 'block' | 'boarded';
interface WinOpts {
  kind: Kind;
  w: number;
  h: number;
  frame: RGB;
  fw?: number;
  /** Panes across and up in each sash or leaf. */
  grid?: readonly [number, number];
  leaves?: number;
  inside?: Inside;
  bars?: boolean;
  ac?: boolean;
  age?: number;
  tint?: RGB;
  /** A strip of windows that repeats sideways: no frame on the sides, only half a mullion. */
  band?: boolean;
}
type Bar = [number, number, number, number];
function region(out: Bar[], x0: number, y0: number, x1: number, y1: number, sw: number, grid: readonly [number, number], mw = 0.007): void {
  if (sw > 0) out.push([x0, y0, x1, y0 + sw], [x0, y1 - sw, x1, y1], [x0, y0, x0 + sw, y1], [x1 - sw, y0, x1, y1]);
  for (let i = 1; i < grid[0]; i++) {
    const x = lerp(x0 + sw, x1 - sw, i / grid[0]);
    out.push([x - mw, y0, x + mw, y1]);
  }
  for (let j = 1; j < grid[1]; j++) {
    const y = lerp(y0 + sw, y1 - sw, j / grid[1]);
    out.push([x0, y - mw, x1, y + mw]);
  }
}
function winBars(o: WinOpts): Bar[] {
  const { w, h, kind } = o;
  const fw = o.fw ?? 0.05;
  const grid = o.grid ?? [1, 1];
  const side = o.band ? fw / 2 : fw;
  const out: Bar[] = [[0, 0, w, fw], [0, 0, side, h], [w - side, 0, w, h]];
  if (kind !== 'arch') out.push([0, h - fw, w, h]);
  const [x0, x1, y0, y1] = [side, w - side, fw, h - fw];
  if (kind === 'sash') {
    const m = (y0 + y1) / 2;
    region(out, x0, y0, x1, m + 0.02, 0.04, grid);
    region(out, x0, m - 0.02, x1, y1, 0.04, grid);
  } else if (kind === 'casement' || kind === 'slider') {
    const n = o.leaves ?? 2;
    const sw = kind === 'slider' ? 0.028 : 0.042;
    for (let i = 0; i < n; i++) region(out, lerp(x0, x1, i / n) - (i ? sw * 0.3 : 0), y0, lerp(x0, x1, (i + 1) / n), y1, sw, grid);
  } else if (kind === 'steel') region(out, x0, y0, x1, y1, 0, grid, 0.009);
  else if (kind === 'arch') {
    const cy = h - w / 2;
    out.push([x0, cy - 0.02, x1, cy + 0.02], [w / 2 - 0.016, y0, w / 2 + 0.016, h]);
    region(out, x0, y0, w / 2, cy, 0, [1, grid[1]]);
    region(out, w / 2, y0, x1, cy, 0, [1, grid[1]]);
  } else if (kind === 'fixed') region(out, x0, y0, x1, y1, 0, grid, 0.012);
  return out;
}
function windows(tex: Tex, seed: number, o: WinOpts): TextureData {
  const { w, h, kind } = o;
  const fw = o.fw ?? 0.05;
  const L = new Layers(tex, o.frame, 0.55);
  const bars = winBars(o);
  const tint = o.tint ?? SKY;
  const age = o.age ?? 0.15;
  const cloud = tex.noise(0.8, 0.5, seed, 3);
  const grime = tex.noise(0.25, 0.25, seed + 1, 3);
  const streak = tex.noise(0.04, 0.6, seed + 2, 2);
  const grain = tex.noise(0.4, 0.008, seed + 3, 3);
  const fine = tex.noise(0.006, 0.006, seed + 4, 2);
  const inside = o.inside ?? 'home';
  const px: Px = [0, 0, 0];
  const surround: RGB = [0.84, 0.82, 0.76];
  tex.map((x, y, k) => {
    const v = Math.min(Math.round(tex.mw / w) - 1, Math.floor(x / w));
    const lx = x - v * w;
    let d = 1;
    for (const b of bars) {
      const dd = Math.max(b[0] - lx, lx - b[2], b[1] - y, y - b[3]);
      if (dd < d) d = dd;
    }
    let outside = 0;
    if (kind === 'arch' && y > h - w / 2) {
      const r = Math.hypot(lx - w / 2, y - (h - w / 2));
      d = Math.min(d, w / 2 - fw - r);
      outside = sstep(-0.002, 0.002, r - w / 2);
    }
    const fr = 1 - sstep(-0.002, 0.002, d);
    const u = clamp01((lx - fw) / (w - 2 * fw));
    const vv = clamp01((y - fw) / (h - 2 * fw));
    let rough = 0.06;
    let height = 0;
    // The pane.
    if (kind === 'frosted') {
      const m = 0.9 + fine(x, y) * 0.25;
      px[0] = 0.62 * m;
      px[1] = 0.7 * m;
      px[2] = 0.7 * m;
      rough = 0.5;
    } else if (kind === 'block') {
      const bx = frac(lx / 0.19);
      const by = frac(y / 0.19);
      const joint = 1 - sstep(0.03, 0.06, Math.min(bx, 1 - bx, by, 1 - by));
      const wave = 0.75 + 0.25 * Math.sin(bx * 19 + Math.sin(by * 12) * 1.5) * Math.sin(by * 17);
      px[0] = lerp(0.42 * wave, 0.74, joint);
      px[1] = lerp(0.56 * wave, 0.74, joint);
      px[2] = lerp(0.56 * wave, 0.7, joint);
      rough = lerp(0.18, 0.9, joint);
      height = (1 - joint) * 0.004 * wave;
    } else if (kind === 'boarded') {
      const g = grain(lx + v * 3, y);
      const seam = 1 - sstep(0.002, 0.006, Math.abs(y - h * (0.45 + hash2(v, 5, seed) * 0.15)));
      const sx = Math.min(Math.abs(lx - 0.12), Math.abs(lx - (w - 0.12)));
      const sy = Math.abs(frac(y / 0.35) - 0.5) * 0.35;
      const screw = 1 - sstep(0.006, 0.01, Math.hypot(sx, sy));
      const tag = age > 0.4 ? sstep(0.2, 0.24, cloud(x * 2.3, y * 1.7 + v)) * 0.85 : 0;
      const m = (0.85 + g * 0.5 + hash2(v, 6, seed) * 0.2) * (1 - seam * 0.6) * (1 - screw * 0.7);
      px[0] = lerp(0.62 * m, v % 2 ? 0.08 : 0.55, tag);
      px[1] = lerp(0.5 * m, v % 2 ? 0.08 : 0.12, tag);
      px[2] = lerp(0.33 * m, v % 2 ? 0.1 : 0.4, tag);
      rough = 0.85;
      height = 0.004;
    } else {
      let id = v;
      let [iu, iv] = [u, vv];
      let [content, cover] = interior(kind === 'steel' || kind === 'louver' ? 'none' : inside, id, seed, iu, iv, lx, y);
      if (kind === 'steel') {
        const g = o.grid ?? [1, 1];
        id = v * 97 + Math.floor(u * g[0]) + Math.floor(vv * g[1]) * 13;
        const t = hash2(id, 8, seed);
        if (t < age * 0.35) [content, cover] = [[0.5, 0.53, 0.5], 1];
        else if (t < age * 0.5) [content, cover] = [[0.01, 0.01, 0.01], 1];
        rough = t < age * 0.5 ? 0.9 : 0.1 + hash2(id, 9, seed) * 0.1;
      }
      [iu, iv] = [iu, iv];
      const tilt = (hash2(id, 4, seed) - 0.5) * 0.25;
      glaze(px, content, cover, tint, vv + tilt, cloud(x, y) + tilt);
      if (kind === 'louver') {
        const s = frac((y - fw) / 0.11);
        const m = 1 + sstep(0.8, 0.95, s) * 0.8 - (1 - sstep(0, 0.1, s)) * 0.6;
        px[0] *= m;
        px[1] *= m;
        px[2] *= m;
        height = s * 0.004;
      }
      // Shadow of the frame on the glass, dust in the corners.
      const ao = 0.5 + 0.5 * sstep(0, 0.03, d);
      const dust = age * clamp01(grime(x, y) * 1.2 + (1 - sstep(0, 0.12, d)) * 0.6) * 0.5;
      for (let i = 0; i < 3; i++) px[i] = lerp(px[i] * ao, 0.45, dust);
      rough += dust * 0.6;
    }
    if (o.ac && hash2(v, 7, seed) < 0.5 && y > fw && y < fw + 0.4 && lx > fw && lx < w - fw) {
      // A window air conditioner in the lower sash, with pleated side panels.
      const ux = Math.abs(lx - w / 2);
      if (ux < 0.3) {
        const lou = lx - w / 2 > -0.12 ? 0.6 + 0.4 * sstep(0.2, 0.6, frac(y / 0.022)) : 1;
        const edge = sstep(0, 0.015, Math.min(0.3 - ux, y - fw, fw + 0.4 - y));
        px[0] = 0.74 * lou * (0.7 + 0.3 * edge);
        px[1] = 0.72 * lou * (0.7 + 0.3 * edge);
        px[2] = 0.66 * lou * (0.7 + 0.3 * edge);
        height = 0.03;
      } else {
        const m = 0.8 + 0.2 * Math.sin(lx * 300);
        px[0] = 0.84 * m;
        px[1] = 0.84 * m;
        px[2] = 0.8 * m;
        height = 0.008;
      }
      rough = 0.6;
    }
    // Frame, then anything in front of the window.
    const st = 1 - age * (0.25 * sstep(0, 0.6, streak(x, y)) + 0.2 * grime(x, y) + 0.1);
    const fm = (1 + fine(x, y) * 0.04) * st * (0.9 + 0.1 * sstep(-0.012, -0.004, d));
    let r = lerp(px[0], o.frame[0] * fm, fr);
    let g = lerp(px[1], o.frame[1] * fm, fr);
    let b = lerp(px[2], o.frame[2] * fm, fr);
    rough = lerp(rough, 0.55, fr);
    height = lerp(height, 0.014, fr);
    if (outside > 0) {
      const m = 1 + fine(x, y) * 0.06 - age * 0.2 * sstep(0, 0.6, streak(x, y));
      r = lerp(r, surround[0] * m, outside);
      g = lerp(g, surround[1] * m, outside);
      b = lerp(b, surround[2] * m, outside);
      rough = lerp(rough, 0.92, outside);
      height = lerp(height, 0.03, outside);
    }
    if (o.bars && lx > 0.015 && lx < w - 0.015) {
      const n = Math.round((w - 0.03) / 0.125);
      const bx = Math.abs(frac((lx - 0.015) / ((w - 0.03) / n)) - 0.5) * ((w - 0.03) / n);
      const by = Math.min(Math.abs(y - h * 0.12), Math.abs(y - h * 0.88), Math.abs(y - h * 0.5) + (h > 1.3 ? 0 : 1));
      const bar = 1 - sstep(0.005, 0.008, Math.min((w - 0.03) / n / 2 - bx, by - 0.006));
      r = lerp(r, 0.05, bar);
      g = lerp(g, 0.05, bar);
      b = lerp(b, 0.055, bar);
      rough = lerp(rough, 0.6, bar);
      height = lerp(height, 0.03, bar);
    }
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.rough[k] = rough;
    L.height[k] = height;
    return 0;
  });
  return L.finish();
}

const WHITE = hex(0xe8e6de);
const CREAM = hex(0xd8cca8);
const BROWN = hex(0x4c3424);
const BLACK = hex(0x1c1c1e);
const GREEN = hex(0x2c4a3a);
const ALU = hex(0xb4b6b8);
const BRONZE = hex(0x4a3c30);
const RED = hex(0x8c2c24);
const BLUE = hex(0x2c4c74);
const RUST = hex(0x5c3a2a);
/** Size of one window and the number of variants in each atlas, for the meshes that hang them. */
export const WINDOW_SIZES: Record<string, { w: number; h: number; n: number }> = {};
function win(id: string, label: string, o: WinOpts, n = 4): void {
  WINDOW_SIZES[`window/${id}`] = { w: o.w, h: o.h, n };
  const wide = o.w * n;
  add(id, label, [wide, o.h], (t, s) => windows(t, s, o), { density: Math.round(Math.min(256, 1536 / wide)), ...(o.band ? { tile: 'x' as const } : {}), ...(o.kind === 'boarded' ? { reflect: 0 } : {}) });
}
const SASH = { kind: 'sash' as const, w: 0.9, h: 1.6 };
win('sash-white', '上げ下げ窓 白', { ...SASH, frame: WHITE });
win('sash-white-6over6', '上げ下げ窓 白・格子', { ...SASH, frame: WHITE, grid: [3, 2] });
win('sash-white-old', '上げ下げ窓 白・汚れ・窓用エアコン', { ...SASH, frame: hex(0xcfcbbf), age: 0.7, ac: true });
win('sash-white-barred', '上げ下げ窓 白・防犯格子', { ...SASH, frame: WHITE, bars: true, age: 0.4 });
win('sash-cream-2over2', '上げ下げ窓 クリーム・2分割', { ...SASH, frame: CREAM, grid: [2, 1] });
win('sash-brown', '上げ下げ窓 茶', { ...SASH, frame: BROWN });
win('sash-brown-old', '上げ下げ窓 茶・窓用エアコン', { ...SASH, frame: hex(0x54402e), age: 0.6, ac: true });
win('sash-green', '上げ下げ窓 深緑', { ...SASH, frame: GREEN, grid: [2, 1] });
win('sash-black', '上げ下げ窓 黒', { ...SASH, frame: BLACK });
win('sash-red', '上げ下げ窓 赤', { ...SASH, frame: RED, grid: [2, 2] });
win('sash-wide-white', '上げ下げ窓 幅広・白', { kind: 'sash', w: 1.2, h: 1.5, frame: WHITE, grid: [1, 1] });
win('sash-tall-white', '上げ下げ窓 縦長・白', { kind: 'sash', w: 0.8, h: 2, frame: WHITE, grid: [2, 2] });
win('sash-tall-black', '上げ下げ窓 縦長・黒', { kind: 'sash', w: 0.8, h: 2, frame: BLACK, grid: [1, 1] });
const CASE = { kind: 'casement' as const, w: 1.2, h: 1.3 };
win('casement-white', '両開き窓 白・格子', { ...CASE, frame: WHITE, grid: [2, 3] });
win('casement-brown', '両開き窓 茶・格子', { ...CASE, frame: BROWN, grid: [2, 3] });
win('casement-black', '両開き窓 黒', { ...CASE, frame: BLACK });
win('casement-blue', '両開き窓 青', { ...CASE, frame: BLUE, grid: [1, 2] });
win('casement-triple-white', '三連窓 白', { kind: 'casement', w: 1.8, h: 1.3, leaves: 3, frame: WHITE, grid: [1, 1] });
win('casement-triple-brown', '三連窓 茶', { kind: 'casement', w: 1.8, h: 1.3, leaves: 3, frame: BROWN, grid: [2, 3] });
const SLIDE = { kind: 'slider' as const, w: 1.5, h: 1.1, fw: 0.035 };
win('slider-aluminium', '引き違い窓 アルミ', { ...SLIDE, frame: ALU });
win('slider-aluminium-old', '引き違い窓 アルミ・汚れ', { ...SLIDE, frame: hex(0x9c9e9e), age: 0.7 });
win('slider-aluminium-barred', '引き違い窓 アルミ・防犯格子', { ...SLIDE, frame: ALU, bars: true, age: 0.4 });
win('slider-white', '引き違い窓 白', { ...SLIDE, frame: WHITE });
win('slider-bronze', '引き違い窓 ブロンズ', { ...SLIDE, frame: BRONZE });
win('slider-wide-aluminium', '引き違い窓 幅広・アルミ', { ...SLIDE, w: 2.4, h: 1.2, leaves: 3, frame: ALU }, 3);
win('slider-wide-bronze', '引き違い窓 幅広・ブロンズ', { ...SLIDE, w: 2.4, h: 1.2, leaves: 3, frame: BRONZE }, 3);
win('slider-small-aluminium', '引き違い窓 小・アルミ', { ...SLIDE, w: 0.9, h: 0.9, frame: ALU });
win('patio-aluminium', '掃き出し窓 アルミ', { ...SLIDE, w: 1.8, h: 2.05, frame: ALU }, 3);
win('patio-white', '掃き出し窓 白', { ...SLIDE, w: 1.8, h: 2.05, frame: WHITE }, 3);
win('patio-bronze', '掃き出し窓 ブロンズ', { ...SLIDE, w: 1.8, h: 2.05, frame: BRONZE }, 3);
win('patio-black-wide', '掃き出し窓 幅広・黒', { ...SLIDE, w: 2.7, h: 2.2, leaves: 3, frame: BLACK }, 2);
win('french-white', 'フランス窓 白・格子', { kind: 'casement', w: 1.5, h: 2.05, frame: WHITE, grid: [2, 5] }, 3);
win('french-brown', 'フランス窓 茶・格子', { kind: 'casement', w: 1.5, h: 2.05, frame: BROWN, grid: [2, 5] }, 3);
const FIX = { kind: 'fixed' as const, w: 1.8, h: 1.5 };
win('picture-white', 'はめ殺し窓 白', { ...FIX, frame: WHITE }, 3);
win('picture-white-grid', 'はめ殺し窓 白・格子', { ...FIX, frame: WHITE, grid: [4, 3] }, 3);
win('picture-black', 'はめ殺し窓 黒', { ...FIX, frame: BLACK, fw: 0.04 }, 3);
win('picture-aluminium', 'はめ殺し窓 アルミ', { ...FIX, frame: ALU, fw: 0.04, grid: [2, 1] }, 3);
win('picture-bronze', 'はめ殺し窓 ブロンズ', { ...FIX, frame: BRONZE, fw: 0.04, grid: [2, 1] }, 3);
win('tall-black', '縦長はめ殺し窓 黒', { kind: 'fixed', w: 0.9, h: 2.2, frame: BLACK, fw: 0.04 });
win('tall-aluminium', '縦長はめ殺し窓 アルミ', { kind: 'fixed', w: 0.9, h: 2.2, frame: ALU, fw: 0.04, grid: [1, 2] });
win('square-white', '小窓 白', { kind: 'fixed', w: 0.8, h: 0.8, frame: WHITE, grid: [2, 2] });
win('square-black', '小窓 黒', { kind: 'fixed', w: 0.8, h: 0.8, frame: BLACK });
win('corner-black', '大型はめ殺し窓 黒', { kind: 'fixed', w: 2.7, h: 2.4, frame: BLACK, fw: 0.04, grid: [1, 1] }, 2);
win('office-aluminium', '事務所窓 アルミ', { kind: 'fixed', w: 1.5, h: 1.8, frame: ALU, fw: 0.045, inside: 'office' });
win('office-bronze', '事務所窓 ブロンズ', { kind: 'fixed', w: 1.5, h: 1.8, frame: BRONZE, fw: 0.045, inside: 'office', tint: [0.5, 0.42, 0.32] });
win('office-black', '事務所窓 黒', { kind: 'fixed', w: 1.5, h: 1.8, frame: BLACK, fw: 0.045, inside: 'office', grid: [1, 2] });
const STEEL = { kind: 'steel' as const, w: 2, h: 2.4, fw: 0.035, inside: 'none' as const };
win('steel-black', '工場のスチール窓 黒', { ...STEEL, frame: BLACK, grid: [5, 6], age: 0.3 }, 3);
win('steel-green', '工場のスチール窓 緑', { ...STEEL, frame: GREEN, grid: [5, 6], age: 0.4 }, 3);
win('steel-rusty', '工場のスチール窓 錆・割れ', { ...STEEL, frame: RUST, grid: [5, 6], age: 1 }, 3);
win('steel-white', '工場のスチール窓 白', { ...STEEL, frame: hex(0xc8c8c0), grid: [4, 5], age: 0.5 }, 3);
win('steel-wide-black', '工場の横長スチール窓 黒', { ...STEEL, w: 3, h: 1.4, frame: BLACK, grid: [8, 3], age: 0.3 }, 2);
win('steel-wide-rusty', '工場の横長スチール窓 錆', { ...STEEL, w: 3, h: 1.4, frame: RUST, grid: [8, 3], age: 0.9 }, 2);
win('steel-loft-black', 'ロフトのスチール窓 黒', { ...STEEL, w: 1.6, h: 2.2, frame: BLACK, grid: [3, 4], age: 0.15, inside: 'home' }, 3);
const ARCH = { kind: 'arch' as const, w: 1, h: 1.9 };
win('arch-white', 'アーチ窓 白', { ...ARCH, frame: WHITE, grid: [1, 2] });
win('arch-brown', 'アーチ窓 茶', { ...ARCH, frame: BROWN, grid: [1, 3] });
win('arch-black', 'アーチ窓 黒', { ...ARCH, frame: BLACK, grid: [1, 1] });
win('arch-wide-brown', 'アーチ窓 幅広・茶', { kind: 'arch', w: 1.8, h: 2.1, frame: BROWN, grid: [1, 3] }, 3);
win('louver-aluminium', 'ジャロジー窓 アルミ', { kind: 'louver', w: 0.7, h: 1.2, frame: ALU, fw: 0.035 });
win('louver-white', 'ジャロジー窓 白', { kind: 'louver', w: 0.7, h: 1.2, frame: WHITE, fw: 0.04, age: 0.4 });
win('frosted-white', '浴室のすりガラス窓 白', { kind: 'frosted', w: 0.6, h: 0.6, frame: WHITE }, 2);
win('frosted-aluminium', '浴室のすりガラス窓 アルミ', { kind: 'frosted', w: 0.9, h: 0.6, frame: ALU, fw: 0.035 }, 2);
win('glass-block', 'ガラスブロック', { kind: 'block', w: 1.14, h: 0.76, frame: hex(0xb8b6ae), fw: 0.02 }, 2);
win('boarded', '板でふさいだ窓', { ...SASH, kind: 'boarded', frame: hex(0xb4b0a4), age: 0.2 });
win('boarded-tagged', '板でふさいだ窓・落書き', { ...SASH, kind: 'boarded', frame: hex(0x8c8478), age: 0.8 });
// Ribbon windows: repeat sideways.
const BAND = { kind: 'fixed' as const, band: true, inside: 'office' as const, fw: 0.05 };
win('band-aluminium', '連窓 アルミ', { ...BAND, w: 1.5, h: 1.8, frame: ALU });
win('band-aluminium-green', '連窓 アルミ・緑ガラス', { ...BAND, w: 1.5, h: 1.8, frame: ALU, tint: [0.42, 0.62, 0.56] });
win('band-bronze', '連窓 ブロンズ', { ...BAND, w: 1.5, h: 1.8, frame: BRONZE, tint: [0.52, 0.42, 0.3] });
win('band-black', '連窓 黒', { ...BAND, w: 1.2, h: 1.5, frame: BLACK, tint: [0.4, 0.46, 0.54] });
win('band-white', '連窓 白', { ...BAND, w: 1.2, h: 1.5, frame: WHITE, grid: [1, 2] });
win('band-clerestory', '高窓の連窓 アルミ', { ...BAND, w: 1.5, h: 0.75, frame: ALU, inside: 'none' });
win('band-tall-black', '連窓 縦長・黒', { ...BAND, w: 1.2, h: 2.7, frame: BLACK, grid: [1, 2], inside: 'home' });
win('band-tall-aluminium', '連窓 縦長・アルミ', { ...BAND, w: 1.5, h: 2.7, frame: ALU, grid: [1, 1], inside: 'office' });

// --- Shop fronts: bays of plate glass over a kick panel, with a transom. Repeats sideways. ---
interface ShopOpts {
  frame: RGB;
  bay?: number;
  h?: number;
  /** Height of the solid base under the glass. */
  kick?: number;
  kickColor?: RGB;
  transom?: boolean;
  /** vacant: papered over from inside. */
  state?: 'open' | 'vacant' | 'old';
}
const WARES: RGB[] = [hex(0xc83c30), hex(0xe0b030), hex(0x3070b8), hex(0x40a058), hex(0xe8e4d8), hex(0xd87028), hex(0x8848a0), hex(0x40b0b8), hex(0x302c28), hex(0xe86890)];
const WORDS = ['SALE', 'OPEN', 'ATM', 'LOTTO', 'DEALS', '50% OFF', 'NEW', 'CASH'];
function shopfront(tex: Tex, seed: number, o: ShopOpts): TextureData {
  const bay = o.bay ?? 2;
  const h = o.h ?? tex.mh;
  const n = Math.round(tex.mw / bay);
  const kick = o.kick ?? 0.4;
  const state = o.state ?? 'open';
  const top = o.transom === false ? h - 0.05 : h - 0.62;
  const L = new Layers(tex, o.frame, 0.5);
  const cloud = tex.noise(1, 0.7, seed, 3);
  const fine = tex.noise(0.006, 0.006, seed + 1, 2);
  const grime = tex.noise(0.3, 0.3, seed + 2, 3);
  const paper = tex.noise(0.5, 0.5, seed + 3, 2);
  const kc = o.kickColor ?? o.frame;
  const px: Px = [0, 0, 0];
  const dirt = state === 'open' ? 0.12 : 0.6;
  tex.map((x, y, k) => {
    const v = Math.floor(x / bay) % n;
    const lx = x - Math.floor(x / bay) * bay;
    const split = hash2(v, 1, seed) < 0.4 ? 2 : 1;
    const sx = (lx * split) % bay;
    const dv = Math.min(sx, bay - sx) / split;
    const dx = Math.min(lx, bay - lx);
    // Frame members: posts at the bay lines, a glazing bar when the bay is split, sill and transom bars.
    let d = Math.min(dx - 0.03, dv - 0.018, Math.abs(y - kick) - 0.025, Math.abs(y - top) - 0.025, h - 0.04 - y);
    if (y < kick) d = Math.min(d, 0.012 - Math.abs(frac(lx / (bay / 2)) - 0.5) * (bay / 2) < 0 ? 1 : -1);
    const fr = 1 - sstep(-0.002, 0.002, d);
    let rough = 0.06;
    let height = 0;
    if (y < kick) {
      const m = (1 + fine(x, y) * 0.06) * (0.75 + 0.25 * sstep(0, 0.25, y)) * (1 - dirt * 0.4 * clamp01(0.5 + grime(x, y)));
      px[0] = kc[0] * m;
      px[1] = kc[1] * m;
      px[2] = kc[2] * m;
      rough = 0.6;
      height = 0.006 + sstep(0.03, 0.05, Math.min(dx - 0.03, y, kick - y)) * 0.004;
    } else {
      const up = (y - kick) / (h - kick);
      let content: RGB = DARK;
      let cover = 0;
      const t = hash2(v, 2, seed);
      if (state === 'vacant') {
        // Sheets of paper taped up inside, some fallen.
        const sheet = hash2(Math.floor(x / 0.55), Math.floor(y / 0.75), seed + 5);
        if (sheet > 0.14) {
          const m = 0.62 + sheet * 0.2 + paper(x, y) * 0.15 - (1 - sstep(0, 0.012, Math.min(frac(x / 0.55), 1 - frac(x / 0.55)) * 0.55)) * 0.12;
          content = [m, m * 0.96, m * 0.84];
          cover = 1;
        }
      } else if (y > top) {
        content = [0.1, 0.1, 0.1];
        cover = 0.5;
      } else if (t < 0.55) {
        // Shelves of goods seen through the glass.
        const row = Math.floor((y - kick) / 0.36);
        const sy = frac((y - kick) / 0.36);
        const item = Math.floor((x + row * 0.37) / (0.09 + hash2(row, v, seed) * 0.1));
        const ih = 0.45 + hash2(item, row + 31, seed) * 0.5;
        if (y - kick > 0.1 && row < 5 && sy < ih && sy > 0.06) {
          const c = WARES[Math.floor(hash2(item, row, seed + 7) * WARES.length)];
          const depth = 0.35 + 0.25 * (1 - up);
          content = [c[0] * depth, c[1] * depth, c[2] * depth];
          cover = 1;
        } else if (sy <= 0.06 && row < 6) {
          content = [0.22, 0.2, 0.18];
          cover = 1;
        }
      } else if (t < 0.75) {
        // A display backdrop behind a low platform.
        const c = WARES[Math.floor(hash2(v, 3, seed) * WARES.length)];
        const m = 0.25 + 0.2 * up + (up < 0.2 ? 0.2 : 0);
        content = [lerp(0.6, c[0], 0.5) * m, lerp(0.6, c[1], 0.5) * m, lerp(0.6, c[2], 0.5) * m];
        cover = 1;
      } else if (t < 0.88) [content, cover] = interior('office', v, seed, lx / bay, up, x, y);
      glaze(px, content, cover, SKY, up, cloud(x, y) + (hash2(v * split + Math.floor((lx * split) / bay), 4, seed) - 0.5) * 0.3);
      const dust = dirt * clamp01(grime(x, y) * 1.3 + (1 - sstep(0, 0.2, y - kick)) * 0.5) * 0.6;
      const ao = 0.55 + 0.45 * sstep(0, 0.04, d);
      for (let i = 0; i < 3; i++) px[i] = lerp(px[i] * ao, 0.45, dust);
      rough += dust * 0.5;
    }
    const fm = (1 + fine(x, y) * 0.04) * (1 - dirt * 0.25 * clamp01(0.5 + grime(x, y)));
    L.r[k] = lerp(px[0], o.frame[0] * fm, fr);
    L.g[k] = lerp(px[1], o.frame[1] * fm, fr);
    L.b[k] = lerp(px[2], o.frame[2] * fm, fr);
    L.rough[k] = lerp(rough, 0.5, fr);
    L.height[k] = lerp(height, 0.016, fr);
    return 0;
  });
  if (state !== 'vacant') {
    // Posters and stickers on the glass.
    for (let v = 0; v < n; v++) {
      const count = Math.floor(hash2(v, 11, seed) * (state === 'old' ? 4.5 : 3));
      for (let i = 0; i < count; i++) {
        const pw = 0.3 + hash2(v, 20 + i, seed) * 0.35;
        const ph = 0.25 + hash2(v, 30 + i, seed) * 0.4;
        const x0 = v * bay + 0.1 + hash2(v, 40 + i, seed) * (bay - pw - 0.2);
        const y0 = kick + 0.12 + hash2(v, 50 + i, seed) * (top - kick - ph - 0.25);
        const c = WARES[Math.floor(hash2(v, 60 + i, seed) * 8)];
        const m = tex.field();
        tex.rect(m, x0, y0, x0 + pw, y0 + ph);
        L.paint(m, [c[0] * 0.8 + 0.1, c[1] * 0.8 + 0.1, c[2] * 0.8 + 0.1], { rough: 0.5, height: 0.001 });
        const tm = tex.field();
        const word = WORDS[Math.floor(hash2(v, 70 + i, seed) * WORDS.length)];
        drawText(tex, tm, word, x0 + pw / 2, y0 + ph * 0.38, Math.min(ph * 0.3, 0.14), { align: 'c', fit: pw * 0.84, weight: 0.09 });
        L.paint(tm, c[0] + c[1] + c[2] > 1.6 ? [0.08, 0.08, 0.08] : [0.96, 0.95, 0.9], { rough: 0.5 });
      }
    }
  }
  return L.finish();
}
const SHOPS: [string, string, ShopOpts, number?][] = [
  ['aluminium', 'アルミ', { frame: ALU }], ['aluminium-tile', 'アルミ・タイル腰壁', { frame: ALU, kickColor: hex(0x2c5c70), kick: 0.5 }], ['black', '黒', { frame: BLACK, kick: 0.3 }],
  ['bronze', 'ブロンズ', { frame: BRONZE }], ['white', '白い木枠', { frame: WHITE, kick: 0.55 }], ['green', '緑の木枠', { frame: GREEN, kick: 0.6 }],
  ['red', '赤い木枠', { frame: RED, kick: 0.55 }], ['blue', '青い木枠', { frame: BLUE, kick: 0.55 }], ['brick-kick', 'アルミ・レンガ腰壁', { frame: ALU, kickColor: hex(0x7a3a2c), kick: 0.6 }],
  ['old', 'アルミ・汚れ', { frame: hex(0x8c8e8c), state: 'old' }], ['vacant', '空き店舗(紙貼り)', { frame: hex(0x8c8e8c), state: 'vacant' }], ['vacant-brown', '空き店舗(紙貼り)・茶', { frame: BROWN, state: 'vacant', kick: 0.55 }],
  ['low-aluminium', '低い店舗正面 アルミ', { frame: ALU, transom: false, kick: 0.3 }, 2.4], ['low-black', '低い店舗正面 黒', { frame: BLACK, transom: false, kick: 0.25 }, 2.4],
  ['showroom', 'ショールーム(床まで)', { frame: ALU, transom: false, kick: 0.08, bay: 3 }, 3.2], ['showroom-black', 'ショールーム(床まで)・黒', { frame: BLACK, transom: false, kick: 0.08, bay: 3 }, 3.2],
];
/** Width of one bay of each shop front, for the meshes. */
export const SHOP_BAYS: Record<string, { bay: number; h: number }> = {};
for (const [id, label, o, hh] of SHOPS) {
  const bay = o.bay ?? 2;
  const h = hh ?? 3;
  SHOP_BAYS[`window/shop-${id}`] = { bay, h };
  add(`shop-${id}`, `店舗正面 ${label}`, [bay * 4, h], (t, s) => shopfront(t, s, o), { tile: 'x', density: 170 });
}

// --- Curtain walls: four modules by two floors, repeating both ways. ---
interface CurtainOpts {
  module?: number;
  floor?: number;
  tint: RGB;
  /** 0 = clear (blinds show), 1 = mirror. */
  mirror?: number;
  /** Height of the opaque band at each floor line. */
  spandrel?: number;
  spandrelColor?: RGB;
  /** Mullion and transom widths; 0 leaves a butt joint. */
  mullion?: number;
  transom?: number;
  frame?: RGB;
  /** Panes per module. */
  sub?: number;
}
function curtain(tex: Tex, seed: number, o: CurtainOpts): TextureData {
  const mw = o.module ?? tex.mw / 4;
  const fh = o.floor ?? tex.mh / 2;
  const nx = Math.round(tex.mw / mw);
  const ny = Math.round(tex.mh / fh);
  const mirror = o.mirror ?? 0.3;
  const sp = o.spandrel ?? 0.9;
  const mv = (o.mullion ?? 0.06) / 2;
  const mh = (o.transom ?? 0.06) / 2;
  const frame = o.frame ?? ALU;
  const sub = o.sub ?? 1;
  const L = new Layers(tex, frame, 0.4);
  const cloud = tex.noise(tex.mw / 2, tex.mh / 2, seed, 4, 0.55);
  const streak = tex.noise(0.2, tex.mh / 2, seed + 1, 2);
  const px: Px = [0, 0, 0];
  tex.map((x, y, k) => {
    const col = Math.floor(x / mw) % nx;
    const row = Math.floor(y / fh) % ny;
    const fx = x - Math.floor(x / mw) * mw;
    const fy = y - Math.floor(y / fh) * fh;
    const pw = mw / sub;
    const pane = Math.floor(fx / pw);
    const px0 = fx - pane * pw;
    const dvx = Math.min(px0, pw - px0);
    const edge = Math.min(fx, mw - fx);
    const inSp = fy < sp;
    const dh = Math.min(fy, fh - fy, sp > 0 ? Math.abs(fy - sp) : 9);
    // Mullions between modules, thinner bars between panes, transoms at the floor and sill lines; butt joints show as dark lines.
    const dm = Math.min(edge - Math.max(mv, 0.006), dvx - Math.max(mv * 0.6, 0.005), dh - Math.max(mh, 0.006));
    const fr = 1 - sstep(-0.004, 0.004, dm);
    const joint = (edge < mv || (dvx < mv * 0.6 && mv > 0)) && mv > 0.008 ? 0 : dh < mh && mh > 0.008 ? 0 : 1;
    const id = col * 7 + pane + row * 131 + (inSp ? 500 : 0);
    const tilt = (hash2(id, 4, seed) - 0.5) * 0.3;
    const up = inSp ? fy / Math.max(sp, 0.01) : (fy - sp) / (fh - sp);
    let content: RGB = DARK;
    let cover = 0;
    if (inSp) {
      content = o.spandrelColor ?? [o.tint[0] * 0.25, o.tint[1] * 0.25, o.tint[2] * 0.25];
      cover = 1;
    } else if (mirror < 0.75) [content, cover] = interior('office', id, seed, px0 / pw, up, x, y);
    glaze(px, content, cover, o.tint, 0.3 + up * 0.5 + tilt, cloud(x + tilt * 3, y + tilt) * 1.6 + tilt, inSp && o.spandrelColor ? Math.min(mirror, 0.15) : mirror);
    const st = 1 - sstep(0.2, 0.8, streak(x, y)) * 0.08;
    const ao = 0.6 + 0.4 * sstep(0, 0.05, dm);
    const fc = joint ? [0.03, 0.03, 0.035] : frame;
    L.r[k] = lerp(px[0] * ao * st, fc[0], fr);
    L.g[k] = lerp(px[1] * ao * st, fc[1], fr);
    L.b[k] = lerp(px[2] * ao * st, fc[2], fr);
    L.rough[k] = lerp(inSp && o.spandrelColor ? 0.3 : 0.05, joint ? 0.9 : 0.4, fr);
    L.metal[k] = lerp(inSp && o.spandrelColor ? 0 : mirror * 0.9, 0, fr);
    L.height[k] = fr * (joint ? -0.004 : 0.02);
    return 0;
  });
  return L.finish();
}
const CURTAIN: [string, string, CurtainOpts, [number, number]?][] = [
  ['blue', '青ガラス', { tint: [0.36, 0.52, 0.74], mirror: 0.45 }],
  ['blue-butt', '青ガラス・枠なし', { tint: [0.34, 0.5, 0.76], mirror: 0.55, mullion: 0, transom: 0 }],
  ['blue-dark', '濃紺ガラス', { tint: [0.16, 0.26, 0.44], mirror: 0.5, frame: BLACK, mullion: 0.05, transom: 0.05 }],
  ['green', '緑ガラス', { tint: [0.4, 0.62, 0.56], mirror: 0.35 }],
  ['green-butt', '緑ガラス・枠なし', { tint: [0.36, 0.6, 0.54], mirror: 0.45, mullion: 0, transom: 0, spandrel: 1.1 }],
  ['clear', '透明ガラス・ブラインド', { tint: SKY, mirror: 0.1, sub: 2, spandrel: 0.7 }],
  ['clear-white', '透明ガラス・白パネル', { tint: SKY, mirror: 0.12, spandrelColor: hex(0xdcdcd8), frame: WHITE, spandrel: 1.2 }],
  ['bronze', 'ブロンズガラス', { tint: [0.5, 0.38, 0.26], mirror: 0.45, frame: BRONZE }],
  ['bronze-dark', '濃ブロンズガラス', { tint: [0.28, 0.2, 0.14], mirror: 0.5, frame: hex(0x2c241c), sub: 2 }],
  ['black', '黒ガラス', { tint: [0.1, 0.11, 0.13], mirror: 0.6, frame: BLACK, mullion: 0.08, transom: 0.04 }],
  ['black-butt', '黒ガラス・枠なし', { tint: [0.09, 0.1, 0.12], mirror: 0.7, mullion: 0, transom: 0 }],
  ['silver', '銀ミラー', { tint: [0.68, 0.74, 0.8], mirror: 0.9, mullion: 0.03, transom: 0.03 }],
  ['silver-butt', '銀ミラー・枠なし', { tint: [0.66, 0.73, 0.8], mirror: 0.95, mullion: 0, transom: 0 }],
  ['gold', '金ミラー', { tint: [0.8, 0.62, 0.3], mirror: 0.9, mullion: 0.03, transom: 0.03, frame: hex(0x8c6c34) }],
  ['copper', '銅色ミラー', { tint: [0.72, 0.44, 0.3], mirror: 0.85, mullion: 0, transom: 0 }],
  ['teal', '青緑ミラー', { tint: [0.24, 0.56, 0.6], mirror: 0.8, mullion: 0.03, transom: 0.03 }],
  ['grey-panel', '灰ガラス・金属パネル', { tint: [0.4, 0.44, 0.5], mirror: 0.4, spandrelColor: hex(0x8c9094), spandrel: 1.4 }],
  ['red-panel', '透明ガラス・赤パネル', { tint: SKY, mirror: 0.2, spandrelColor: hex(0xa03428), frame: ALU, spandrel: 1.1, sub: 2 }],
  ['blue-panel', '透明ガラス・青パネル', { tint: SKY, mirror: 0.2, spandrelColor: hex(0x2c5484), frame: ALU, spandrel: 1.1, sub: 2 }],
  ['vertical', '縦連窓・黒', { tint: [0.14, 0.17, 0.22], mirror: 0.6, frame: hex(0xc8c4b8), mullion: 0.5, transom: 0, spandrel: 0.9 }],
  ['vertical-bronze', '縦連窓・ブロンズ', { tint: [0.4, 0.3, 0.2], mirror: 0.55, frame: hex(0x5c4636), mullion: 0.4, transom: 0, spandrel: 0.9 }],
  ['horizontal', '横連窓・白', { tint: [0.3, 0.4, 0.52], mirror: 0.4, frame: WHITE, mullion: 0.02, transom: 0.02, spandrelColor: hex(0xe0ded6), spandrel: 1.7 }],
  ['horizontal-dark', '横連窓・濃灰', { tint: [0.3, 0.36, 0.44], mirror: 0.45, frame: BLACK, mullion: 0.02, transom: 0.02, spandrelColor: hex(0x44464a), spandrel: 1.6 }],
  ['lobby', 'ロビーの大ガラス', { tint: SKY, mirror: 0.15, spandrel: 0, mullion: 0.05, transom: 0.05, floor: 2.4, module: 1.5 }, [6, 4.8]],
  ['lobby-black', 'ロビーの大ガラス・黒枠', { tint: [0.4, 0.46, 0.54], mirror: 0.25, spandrel: 0, mullion: 0.05, transom: 0.05, frame: BLACK, floor: 2.4, module: 1.5 }, [6, 4.8]],
];
for (const [id, label, o, m] of CURTAIN) add(`curtain-${id}`, `カーテンウォール ${label}`, m ?? [6, 7.2], (t, s) => curtain(t, s, o), { tile: 'xy', density: 128, reflect: 1 });

// --- Whole façades: wall with punched windows, four bays by two floors, for towers where every window as geometry would cost too much. ---
interface FacadeOpts {
  wall: RGB;
  kind: 'plain' | 'brick' | 'panel';
  /** Window in a bay as x0, y0, x1, y1 in metres from the bay's lower left. */
  win: readonly [number, number, number, number];
  frame?: RGB;
  split?: number;
  /** Colour of the panel that fills the bay under and over the window (pier-and-spandrel fronts). */
  spandrel?: RGB;
  sill?: boolean;
  tint?: RGB;
  inside?: Inside;
  stains?: number;
  bay?: number;
  floor?: number;
}
function facade(tex: Tex, seed: number, o: FacadeOpts): TextureData {
  const bay = o.bay ?? tex.mw / 4;
  const fh = o.floor ?? tex.mh / 2;
  const nx = Math.round(tex.mw / bay);
  const ny = Math.round(tex.mh / fh);
  const [x0, y0, x1, y1] = o.win;
  const L = new Layers(tex, o.wall, 0.9);
  const tone = tex.noise(1.5, 1.5, seed, 3);
  const fine = tex.noise(0.012, 0.012, seed + 1, 2);
  const streak = tex.noise(0.1, 1.8, seed + 2, 2);
  const cloud = tex.noise(tex.mw / 2, tex.mh / 2, seed + 3, 3);
  const frame = o.frame ?? ALU;
  const split = o.split ?? 1;
  const stains = o.stains ?? 0.4;
  const px: Px = [0, 0, 0];
  tex.map((x, y, k) => {
    const col = Math.floor(x / bay) % nx;
    const row = Math.floor(y / fh) % ny;
    const fx = x - Math.floor(x / bay) * bay;
    const fy = y - Math.floor(y / fh) * fh;
    const dIn = Math.min(fx - x0, x1 - fx, fy - y0, y1 - fy);
    const inCol = fx > x0 && fx < x1;
    let r: number;
    let g: number;
    let b: number;
    let rough = 0.9;
    let height = 0;
    if (dIn > 0) {
      const id = col + row * 17;
      const pw = (x1 - x0) / split;
      const lx = (fx - x0) % pw;
      const dfr = Math.min(dIn - 0.045, Math.min(lx, pw - lx) - 0.02);
      const fr = 1 - sstep(-0.004, 0.004, dfr);
      const up = (fy - y0) / (y1 - y0);
      const [content, cover] = interior(o.inside ?? 'office', id * split + Math.floor((fx - x0) / pw), seed, lx / pw, up, x, y);
      const tilt = (hash2(id, 4, seed) - 0.5) * 0.3;
      glaze(px, content, cover, o.tint ?? SKY, up + tilt, cloud(x, y) + tilt);
      // The window sits back in the wall: the head and one jamb shade it.
      const shade = (1 - 0.5 * sstep(0.22, 0.02, y1 - fy)) * (1 - 0.3 * sstep(0.12, 0.01, fx - x0));
      r = lerp(px[0], frame[0], fr) * shade;
      g = lerp(px[1], frame[1], fr) * shade;
      b = lerp(px[2], frame[2], fr) * shade;
      rough = lerp(0.06, 0.5, fr);
      height = -0.12;
    } else {
      let c = o.wall;
      let m = 1 + tone(x, y) * 0.07 + fine(x, y) * 0.05;
      if (o.spandrel && inCol) {
        c = o.spandrel;
        m *= 0.92 + 0.08 * sstep(0, 0.06, Math.min(fx - x0, x1 - fx));
        height = -0.05;
      } else if (o.kind === 'brick') {
        const rr = Math.floor(y / 0.075);
        const s = x / 0.21 + (rr % 2) * 0.5;
        const dj = Math.min(frac(s) * 0.21, (1 - frac(s)) * 0.21, frac(y / 0.075) * 0.075, (1 - frac(y / 0.075)) * 0.075);
        const joint = 1 - sstep(0.004, 0.009, dj);
        m *= 1 + (hash2(Math.floor(s) % 400, rr % 400, seed) - 0.5) * 0.3;
        m = lerp(m, 1.25, joint * 0.6);
        height = (1 - joint) * 0.005;
      } else if (o.kind === 'panel') {
        const dj = Math.min(fx, bay - fx, fy, fh - fy);
        const joint = 1 - sstep(0.006, 0.014, dj);
        m *= 1 - joint * 0.4 + (hash2(col, row, seed) - 0.5) * 0.05;
        height = -joint * 0.006;
      }
      // Rain streaks start under each sill; the wall just under the window is dirtier.
      const under = inCol && fy < y0 ? sstep(0.9, 0, y0 - fy) : inCol && fy > y1 ? sstep(1.2, 0.4, fy - y1) * 0.4 : 0;
      const st = stains * (sstep(0.1, 0.8, streak(x, y)) * 0.3 + under * (0.25 + 0.4 * sstep(-0.1, 0.5, streak(x, y))));
      if (o.sill && inCol && y0 - fy > 0 && y0 - fy < 0.07) {
        m *= 1.12;
        height = 0.03;
      } else if (o.sill && fx > x0 - 0.03 && fx < x1 + 0.03 && y0 - fy >= 0.07 && y0 - fy < 0.14) m *= 0.7;
      const ao = 0.85 + 0.15 * sstep(0, 0.05, -dIn);
      r = c[0] * m * (1 - st * 0.5) * ao;
      g = c[1] * m * (1 - st * 0.52) * ao;
      b = c[2] * m * (1 - st * 0.56) * ao;
    }
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.rough[k] = rough;
    L.height[k] = height;
    return 0;
  });
  return L.finish(0.6);
}
const FACADES: [string, string, FacadeOpts, [number, number]?][] = [
  ['precast-grid', 'PC板の格子・事務所', { wall: hex(0xc4c0b4), kind: 'panel', win: [0.25, 0.9, 1.25, 2.9] }, [6, 7.2]],
  ['precast-grid-white', '白い格子・事務所', { wall: hex(0xe0ded6), kind: 'panel', win: [0.2, 0.8, 1.3, 3.0], tint: [0.36, 0.44, 0.54], frame: BLACK }, [6, 7.2]],
  ['precast-grid-dark', '濃灰の格子・事務所', { wall: hex(0x54565a), kind: 'panel', win: [0.2, 0.9, 1.3, 3.0], tint: [0.5, 0.42, 0.32], frame: BRONZE }, [6, 7.2]],
  ['precast-wide', 'PC板・横長窓', { wall: hex(0xb8b4a8), kind: 'panel', win: [0.3, 1.0, 2.7, 2.7], split: 2, bay: 3 }, [12, 7.2]],
  ['concrete-punched', 'コンクリート・小窓(ブルータリズム)', { wall: hex(0x8c8a84), kind: 'plain', win: [0.45, 1.0, 1.35, 2.5], stains: 1, frame: BLACK, bay: 1.8 }, [7.2, 7.2]],
  ['concrete-slot', 'コンクリート・縦スリット窓', { wall: hex(0x9c9a92), kind: 'plain', win: [0.5, 0.5, 1.0, 3.2], stains: 0.9, frame: BLACK, tint: [0.3, 0.34, 0.4] }, [6, 7.2]],
  ['pier-limestone', '石の柱型と黒い腰パネル', { wall: hex(0xc8bea6), kind: 'plain', win: [0.3, 1.1, 1.5, 3.1], spandrel: hex(0x38342e), frame: hex(0x2c2c2c), bay: 1.8, stains: 0.6 }, [7.2, 7.2]],
  ['pier-terracotta', '白い柱型と緑の腰パネル', { wall: hex(0xdcd8cc), kind: 'plain', win: [0.3, 1.1, 1.5, 3.1], spandrel: hex(0x3c5c4c), frame: hex(0x2c3c34), bay: 1.8, split: 2 }, [7.2, 7.2]],
  ['pier-brick', 'レンガの柱型と石の腰パネル', { wall: hex(0x7c4030), kind: 'brick', win: [0.35, 1.2, 1.45, 3.0], spandrel: hex(0xb8ae98), frame: WHITE, bay: 1.8, split: 2, inside: 'home' }, [7.2, 7.2]],
  ['pier-black', '黒い柱型とブロンズの腰パネル', { wall: hex(0x242426), kind: 'plain', win: [0.2, 1.0, 1.3, 3.2], spandrel: hex(0x5c4430), frame: BRONZE, tint: [0.5, 0.4, 0.28], stains: 0.1 }, [6, 7.2]],
  ['brick-red', 'レンガ・上げ下げ窓', { wall: hex(0x84402e), kind: 'brick', win: [0.55, 0.9, 1.45, 2.5], frame: WHITE, split: 1, sill: true, inside: 'home', bay: 2, floor: 3.2 }, [8, 6.4]],
  ['brick-buff', '淡黄レンガ・上げ下げ窓', { wall: hex(0xb0946a), kind: 'brick', win: [0.55, 0.9, 1.45, 2.5], frame: BROWN, sill: true, inside: 'home', bay: 2, floor: 3.2 }, [8, 6.4]],
  ['brick-brown-pair', '茶レンガ・二連窓', { wall: hex(0x644434), kind: 'brick', win: [0.4, 0.9, 2.2, 2.4], frame: WHITE, split: 2, sill: true, inside: 'home', bay: 2.6, floor: 3.2 }, [10.4, 6.4]],
  ['stucco-white', '白い塗り壁・引き違い窓', { wall: hex(0xdedad0), kind: 'plain', win: [0.5, 1.0, 2.0, 2.2], frame: ALU, split: 2, inside: 'home', bay: 2.5, floor: 3, stains: 0.7 }, [10, 6]],
  ['stucco-beige', 'ベージュの塗り壁・引き違い窓', { wall: hex(0xc8b490), kind: 'plain', win: [0.5, 1.0, 2.0, 2.2], frame: BRONZE, split: 2, inside: 'home', bay: 2.5, floor: 3, stains: 0.8 }, [10, 6]],
  ['stucco-pink', 'ピンクの塗り壁・ホテル窓', { wall: hex(0xd8a898), kind: 'plain', win: [0.5, 0.7, 2.3, 2.5], frame: WHITE, split: 2, inside: 'home', bay: 2.8, floor: 3, sill: true }, [11.2, 6]],
  ['hotel-white', '白い外壁・ホテル窓', { wall: hex(0xe4e2dc), kind: 'panel', win: [0.4, 0.6, 2.4, 2.5], frame: BLACK, split: 2, inside: 'home', bay: 2.8, floor: 3 }, [11.2, 6]],
  ['hotel-tan', '黄褐色の外壁・ホテル窓', { wall: hex(0xb49c78), kind: 'panel', win: [0.5, 0.7, 2.3, 2.4], frame: BRONZE, split: 2, inside: 'home', bay: 2.8, floor: 3, tint: [0.5, 0.42, 0.32] }, [11.2, 6]],
  ['housing-grey', '灰色の団地・小窓', { wall: hex(0x94928c), kind: 'panel', win: [0.6, 1.0, 1.8, 2.2], frame: ALU, split: 2, inside: 'home', bay: 2.4, floor: 2.8, stains: 1 }, [9.6, 5.6]],
  ['housing-brick', 'レンガの団地・小窓', { wall: hex(0x8c5440), kind: 'brick', win: [0.6, 1.0, 1.8, 2.2], frame: ALU, split: 2, inside: 'home', bay: 2.4, floor: 2.8, stains: 0.7 }, [9.6, 5.6]],
];
for (const [id, label, o, m] of FACADES) add(`facade-${id}`, `窓付き外壁 ${label}`, m ?? [6, 7.2], (t, s) => facade(t, s, o), { tile: 'xy', density: 128, reflect: 0.7 });

export const WINDOW_TEXTURES: readonly TextureSpec[] = list;
