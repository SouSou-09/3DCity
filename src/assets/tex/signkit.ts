import { Field, Layers, RGB, Rand, Tex, TextureData, clamp01, hex, lerp, sstep } from './core';

export type Pt = [number, number];
export type SignShape = 'rect' | 'octagon' | 'yield' | 'diamond' | 'circle' | 'pentagon' | 'shield';

/** Sheeting colours of road signs. */
export const C = {
  white: hex(0xe9e9e4),
  black: hex(0x161616),
  red: hex(0xb3151f),
  yellow: hex(0xf0bf0a),
  orange: hex(0xee6a16),
  green: hex(0x0b6a4c),
  blue: hex(0x134f9e),
  brown: hex(0x66432a),
  lime: hex(0xc2dc1c),
  grey: hex(0x8d9092),
} as const;

function corner(out: Pt[], a: Pt, p: Pt, b: Pt, da: number, db: number, steps: number): void {
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1;
  const lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
  const s: Pt = [p[0] + ((a[0] - p[0]) * da) / la, p[1] + ((a[1] - p[1]) * da) / la];
  const e: Pt = [p[0] + ((b[0] - p[0]) * db) / lb, p[1] + ((b[1] - p[1]) * db) / lb];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const u = 1 - t;
    out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
  }
}
const seg = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Rounds every corner of a closed polygon. */
export function roundPoly(pts: Pt[], r: number, steps = 4): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[(i + 1) % n];
    const d = Math.min(r, seg(a, pts[i]) / 2, seg(b, pts[i]) / 2);
    corner(out, a, pts[i], b, d, d, steps);
  }
  return out;
}

/** Rounds the flagged corners of an open polyline. */
export function roundLine(pts: Pt[], round: boolean[], r: number, steps = 5): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!round[i] || i === 0 || i === pts.length - 1) {
      out.push(pts[i]);
      continue;
    }
    const da = Math.min(r, seg(pts[i - 1], pts[i]) * (round[i - 1] ? 0.5 : 1));
    const db = Math.min(r, seg(pts[i + 1], pts[i]) * (round[i + 1] ? 0.5 : 1));
    corner(out, pts[i - 1], pts[i], pts[i + 1], da, db, steps);
  }
  return out;
}

/** Outline of a sign blank, counter-clockwise, in metres from its bottom-left corner. */
export function signOutline(shape: SignShape, w: number, h: number): Pt[] {
  switch (shape) {
    case 'rect':
      return roundPoly([[0, 0], [w, 0], [w, h], [0, h]], Math.min(0.045, Math.min(w, h) * 0.12));
    case 'octagon': {
      const k = w / (2 + Math.SQRT2);
      const j = h / (2 + Math.SQRT2);
      return [[k, 0], [w - k, 0], [w, j], [w, h - j], [w - k, h], [k, h], [0, h - j], [0, j]];
    }
    case 'yield':
      return roundPoly([[w / 2, 0], [w, h], [0, h]], w * 0.06);
    case 'diamond':
      return roundPoly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], w * 0.045);
    case 'circle': {
      const out: Pt[] = [];
      for (let i = 0; i < 40; i++) out.push([w / 2 + (Math.cos((i / 40) * Math.PI * 2) * w) / 2, h / 2 + (Math.sin((i / 40) * Math.PI * 2) * h) / 2]);
      return out;
    }
    case 'pentagon':
      return roundPoly([[0, 0], [w, 0], [w, h * 0.56], [w / 2, h], [0, h * 0.56]], w * 0.04);
    case 'shield':
      return roundPoly([[w / 2, 0], [w * 0.78, h * 0.15], [w * 0.94, h * 0.37], [w, h * 0.62], [w, h], [0, h], [0, h * 0.62], [w * 0.06, h * 0.37], [w * 0.22, h * 0.15]], w * 0.05, 3);
  }
}

/** Signed distance to a closed polygon, negative inside. */
export function polyDist(pts: readonly Pt[]): (x: number, y: number) => number {
  const n = pts.length;
  return (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = pts[j][0];
      const ay = pts[j][1];
      const ex = pts[i][0] - ax;
      const ey = pts[i][1] - ay;
      const wx = x - ax;
      const wy = y - ay;
      const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey || 1));
      const dx = wx - ex * t;
      const dy = wy - ey * t;
      d = Math.min(d, dx * dx + dy * dy);
      if (ay > y !== pts[i][1] > y && x < ax + ((y - ay) / ey) * ex) inside = !inside;
    }
    return (inside ? -1 : 1) * Math.sqrt(d);
  };
}

// --- Lettering: single-stroke capitals on a 6-unit cap height, in the manner of highway sign alphabets. ---
// Each glyph is [width, strokes]; strokes are separated by |, points by spaces, and an "r" after a point rounds that corner.
const FONT: Record<string, [number, string]> = {
  A: [4, '0,0 2,6 4,0|0.75,2 3.25,2'],
  B: [4, '0,0 0,6 3.7,6r 3.7,3.2r 0,3.2|1,3.2 4,3.2r 4,0r 0,0'],
  C: [4, '4,1.4 4,0r 0,0r 0,6r 4,6r 4,4.6'],
  D: [4, '0,0 0,6 4,6r 4,0r 0,0'],
  E: [3.7, '3.7,0 0,0 0,6 3.7,6|0,3.2 2.9,3.2'],
  F: [3.6, '0,0 0,6 3.6,6|0,3.2 2.8,3.2'],
  G: [4, '4,4.6 4,6r 0,6r 0,0r 4,0r 4,2.8 2.2,2.8'],
  H: [4, '0,0 0,6|4,0 4,6|0,3.1 4,3.1'],
  I: [0, '0,0 0,6'],
  J: [3.3, '0,1.4 0,0r 3.3,0r 3.3,6'],
  K: [4, '0,0 0,6|4,6 0,2.3|1.5,3.5 4,0'],
  L: [3.5, '0,6 0,0 3.5,0'],
  M: [4.8, '0,0 0,6 2.4,1.4 4.8,6 4.8,0'],
  N: [4, '0,0 0,6 4,0 4,6'],
  O: [4, '2,0 4,0r 4,6r 0,6r 0,0r 2,0'],
  P: [4, '0,0 0,6 4,6r 4,2.8r 0,2.8'],
  Q: [4, '2,0 4,0r 4,6r 0,6r 0,0r 2,0|2.5,1.5 4.2,-0.5'],
  R: [4, '0,0 0,6 4,6r 4,3r 0,3|2,3 4,0'],
  S: [4, '4,4.8 4,6r 0,6r 0,3.1r 4,3.1r 4,0r 0,0r 0,1.2'],
  T: [4, '0,6 4,6|2,6 2,0'],
  U: [4, '0,6 0,0r 4,0r 4,6'],
  V: [4, '0,6 2,0 4,6'],
  W: [5.4, '0,6 1.35,0 2.7,5 4.05,0 5.4,6'],
  X: [4, '0,0 4,6|0,6 4,0'],
  Y: [4, '0,6 2,3 4,6|2,3 2,0'],
  Z: [4, '0,6 4,6 0,0 4,0'],
  '0': [3.6, '1.8,0 3.6,0r 3.6,6r 0,6r 0,0r 1.8,0'],
  '1': [1.6, '0,4.6 1.6,6 1.6,0'],
  '2': [3.8, '0,4.7 0,6r 3.8,6r 3.8,3.4r 0,0 3.8,0'],
  '3': [3.8, '0,4.9 0,6r 3.8,6r 3.8,3.2r 1.5,3.2|1.5,3.2 3.8,3.2r 3.8,0r 0,0r 0,1.1'],
  '4': [4.1, '3.1,0 3.1,6 0,1.8 4.1,1.8'],
  '5': [3.8, '3.6,6 0.3,6 0.1,3.5 3.8,3.5r 3.8,0r 0,0r 0,1.1'],
  '6': [3.8, '3.8,4.9 3.8,6r 0,6r 0,0r 3.8,0r 3.8,3.4r 0,3.4'],
  '7': [3.8, '0,6 3.8,6 1.3,0'],
  '8': [3.8, '1.9,3.2 3.6,3.2r 3.6,6r 0.2,6r 0.2,3.2r 1.9,3.2|1.9,3.2 3.8,3.2r 3.8,0r 0,0r 0,3.2r 1.9,3.2'],
  '9': [3.8, '0,1.1 0,0r 3.8,0r 3.8,6r 0,6r 0,2.6r 3.8,2.6'],
  '-': [2.4, '0,3 2.4,3'],
  '/': [2.6, '0,0 2.6,6'],
  '.': [0, '0,0 0,0.02'],
  ',': [0.4, '0.4,0.1 0,-1'],
  ':': [0, '0,0.8 0,0.82|0,4 0,4.02'],
  "'": [0, '0,6 0,4.6'],
  '&': [4.2, '4.2,0 0.6,4.6r 0.6,6r 2.6,6r 2.6,4.6r 0,1.6r 0,0r 2.4,0r 4.2,2.6'],
  ' ': [2, ''],
};
const glyphs = new Map<string, { w: number; lines: Pt[][] }>();
function glyph(ch: string): { w: number; lines: Pt[][] } {
  let g = glyphs.get(ch);
  if (!g) {
    const [w, def] = FONT[ch] ?? FONT[' '];
    const lines = def ? def.split('|').map((line) => {
      const pts: Pt[] = [];
      const round: boolean[] = [];
      for (const tok of line.split(' ')) {
        round.push(tok.endsWith('r'));
        const [x, y] = tok.replace('r', '').split(',').map(Number);
        pts.push([x, y]);
      }
      return roundLine(pts, round, 1.7);
    }) : [];
    glyphs.set(ch, (g = { w, lines }));
  }
  return g;
}

const GAP = 0.3;
export interface TextOpts {
  align?: 'l' | 'c' | 'r';
  /** Stroke half-width as a share of the letter height. */
  weight?: number;
  /** Horizontal squeeze, 1 = normal. */
  cond?: number;
  /** Squeeze, then shrink, to fit this width. */
  fit?: number;
}
export function textWidth(s: string, size: number, cond = 1): number {
  let w = 0;
  for (const ch of s) w += ((glyph(ch).w / 6) * size + GAP * size) * cond;
  return w - GAP * size * cond;
}
/** Draws capitals with the baseline at y; returns the letter height actually used. */
export function drawText(tex: Tex, m: Field, s: string, x: number, y: number, size: number, o: TextOpts = {}): number {
  let cond = o.cond ?? 1;
  if (o.fit) {
    const w0 = textWidth(s, size, cond);
    if (w0 > o.fit) {
      cond = Math.max(0.62, (cond * o.fit) / w0);
      const w1 = textWidth(s, size, cond);
      if (w1 > o.fit) size *= o.fit / w1;
    }
  }
  const width = textWidth(s, size, cond);
  const half = (o.weight ?? 0.075) * size;
  const u = size / 6;
  let cx = x - (o.align === 'l' ? 0 : o.align === 'r' ? width : width / 2);
  for (const ch of s) {
    const g = glyph(ch);
    for (const line of g.lines) tex.stroke(m, line.map(([px, py]) => [cx + px * u * cond, y + py * u] as Pt), half);
    cx += (g.w * u + GAP * size) * cond;
  }
  return size;
}

// --- Arrows and pictograms. ---
/** Offsets a polyline into a closed band with mitred corners and flat ends. */
export function ribbon(pts: Pt[], half: number): Pt[] {
  const l: Pt[] = [];
  const r: Pt[] = [];
  const dir = (a: Pt, b: Pt): Pt => {
    const n = seg(a, b) || 1;
    return [(b[0] - a[0]) / n, (b[1] - a[1]) / n];
  };
  for (let i = 0; i < pts.length; i++) {
    const d0 = dir(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]);
    const d1 = dir(pts[Math.min(pts.length - 2, i)], pts[Math.min(pts.length - 1, i + 1)]);
    let tx = d0[0] + d1[0];
    let ty = d0[1] + d1[1];
    const n = Math.hypot(tx, ty) || 1;
    tx /= n;
    ty /= n;
    const k = half / Math.max(0.5, tx * d0[0] + ty * d0[1]);
    l.push([pts[i][0] - ty * k, pts[i][1] + tx * k]);
    r.push([pts[i][0] + ty * k, pts[i][1] - tx * k]);
  }
  return [...l, ...r.reverse()];
}
/** Arrow along a polyline; the last point is the tip. */
export function arrow(tex: Tex, m: Field, pts: Pt[], half: number, headW = half * 3.4, headL = half * 4.6): void {
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const n = seg(prev, tip) || 1;
  const dx = (tip[0] - prev[0]) / n;
  const dy = (tip[1] - prev[1]) / n;
  const base: Pt = [tip[0] - dx * headL, tip[1] - dy * headL];
  // Stop the shaft inside the head.
  const shaft = pts.slice(0, -1);
  if (n > headL * 0.9) shaft.push([tip[0] - dx * headL * 0.9, tip[1] - dy * headL * 0.9]);
  if (shaft.length > 1) tex.poly(m, [ribbon(shaft, half)]);
  tex.poly(m, [[[base[0] - dy * headW, base[1] + dx * headW], tip, [base[0] + dy * headW, base[1] - dx * headW]]]);
  for (let k = 0; k < m.length; k++) if (m[k] > 1) m[k] = 1;
}
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 14): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

type Picto = (tex: Tex, m: Field, cx: number, y: number, s: number, flip?: boolean) => void;
const at = (cx: number, y: number, s: number, flip: boolean | undefined, pts: Pt[]): Pt[] => pts.map(([px, py]) => [cx + (flip ? -px : px) * s, y + py * s]);

/** Walking person, s tall, standing on y. */
export const walker: Picto = (tex, m, cx, y, s, flip) => {
  const P = (...pts: Pt[]): Pt[] => at(cx, y, s, flip, pts);
  const [head] = P([0.04, 0.9]);
  tex.disc(m, head[0], head[1], 0.085 * s);
  tex.stroke(m, P([0.03, 0.74], [-0.02, 0.47]), 0.075 * s);
  tex.stroke(m, P([-0.01, 0.46], [0.13, 0.25], [0.15, 0.03]), 0.048 * s);
  tex.stroke(m, P([-0.03, 0.46], [-0.1, 0.24], [-0.25, 0.05]), 0.048 * s);
  tex.stroke(m, P([0.06, 0.74], [0.19, 0.59], [0.29, 0.56]), 0.036 * s);
  tex.stroke(m, P([0, 0.74], [-0.13, 0.6], [-0.21, 0.47]), 0.036 * s);
};
/** Bicycle seen from the side, s wide, wheels on y. */
export const bicycle: Picto = (tex, m, cx, y, s, flip) => {
  const P = (...pts: Pt[]): Pt[] => at(cx, y, s, flip, pts);
  const r = 0.2 * s;
  for (const [wx, wy] of P([-0.3, 0.2], [0.3, 0.2])) tex.ring(m, wx, wy, r - 0.022 * s, 0.022 * s);
  tex.stroke(m, P([-0.3, 0.2], [-0.1, 0.47], [0.2, 0.47], [0, 0.2], [-0.3, 0.2]), 0.02 * s);
  tex.stroke(m, P([-0.1, 0.47], [0, 0.2]), 0.02 * s);
  tex.stroke(m, P([0.3, 0.2], [0.19, 0.57], [0.1, 0.6]), 0.02 * s);
  tex.stroke(m, P([-0.17, 0.53], [-0.05, 0.53]), 0.028 * s);
  tex.stroke(m, P([-0.11, 0.53], [-0.1, 0.47]), 0.018 * s);
};
/** Lorry seen from the side, s long, wheels on y. */
export const truck: Picto = (tex, m, cx, y, s, flip) => {
  const P = (...pts: Pt[]): Pt[] => at(cx, y, s, flip, pts);
  tex.poly(m, [P([-0.5, 0.14], [0.14, 0.14], [0.14, 0.6], [-0.5, 0.6])]);
  tex.poly(m, [P([0.17, 0.14], [0.5, 0.14], [0.5, 0.3], [0.4, 0.33], [0.34, 0.5], [0.17, 0.5])]);
  for (const [wx, wy] of P([-0.36, 0.09], [-0.16, 0.09], [0.36, 0.09])) tex.disc(m, wx, wy, 0.085 * s);
};
/** Wheelchair user, s tall. */
export const wheelchair: Picto = (tex, m, cx, y, s, flip) => {
  const P = (...pts: Pt[]): Pt[] => at(cx, y, s, flip, pts);
  const [head, hub] = P([-0.08, 0.9], [-0.03, 0.28]);
  tex.disc(m, head[0], head[1], 0.08 * s);
  tex.stroke(m, P([-0.08, 0.74], [-0.06, 0.44], [0.2, 0.44], [0.3, 0.14], [0.38, 0.14]), 0.045 * s);
  tex.stroke(m, P([-0.07, 0.62], [0.16, 0.62]), 0.04 * s);
  tex.ring(m, hub[0], hub[1], 0.25 * s, 0.034 * s);
};
/** Bus seen from the front, s tall. */
export const bus: Picto = (tex, m, cx, y, s) => {
  const R = (x0: number, y0: number, x1: number, y1: number, r: number): Pt[] => roundPoly([[cx + x0 * s, y + y0 * s], [cx + x1 * s, y + y0 * s], [cx + x1 * s, y + y1 * s], [cx + x0 * s, y + y1 * s]], r * s);
  tex.poly(m, [R(-0.38, 0.12, 0.38, 1, 0.08), R(-0.3, 0.45, 0.3, 0.78, 0.03), R(-0.24, 0.84, 0.24, 0.94, 0.02), R(-0.31, 0.2, -0.19, 0.3, 0.03), R(0.19, 0.2, 0.31, 0.3, 0.03)]);
  tex.poly(m, [R(-0.34, 0, -0.2, 0.14, 0.02)]);
  tex.poly(m, [R(0.2, 0, 0.34, 0.14, 0.02)]);
  for (let k = 0; k < m.length; k++) if (m[k] > 1) m[k] = 1;
};
/** Raised hand ("don't walk"), s tall. */
export const hand: Picto = (tex, m, cx, y, s) => {
  const P = (...pts: Pt[]): Pt[] => at(cx, y, s, false, pts);
  tex.stroke(m, P([0, 0.22], [0, 0.5]), 0.2 * s);
  [[-0.15, 0.84], [-0.05, 0.96], [0.06, 0.93], [0.16, 0.8]].forEach(([fx, fy]) => tex.stroke(m, P([fx, 0.5], [fx * 1.05, fy]), 0.044 * s));
  tex.stroke(m, P([-0.16, 0.36], [-0.33, 0.56]), 0.046 * s);
};

/** Collects the coloured layers of one sign face. */
export class Pen {
  readonly layers: { mask: Field; color: RGB }[] = [];
  readonly dist: (x: number, y: number) => number;
  constructor(readonly tex: Tex, readonly shape: SignShape, readonly w: number, readonly h: number) {
    this.dist = polyDist(signOutline(shape, w, h));
  }
  /** Mask for a colour, painted over everything drawn before it. */
  ink(c: RGB): Field {
    const last = this.layers[this.layers.length - 1];
    if (last && last.color === c) return last.mask;
    const mask = this.tex.field();
    this.layers.push({ mask, color: c });
    return mask;
  }
  /** The whole face, shrunk by `inset`. */
  fill(c: RGB, inset = 0): void {
    this.tex.sdf(this.ink(c), 0, 0, this.w, this.h, (x, y) => this.dist(x, y) + inset);
  }
  /** Line following the edge of the blank. */
  border(c: RGB, width = 0.016, inset = 0.01): void {
    this.tex.sdf(this.ink(c), 0, 0, this.w, this.h, (x, y) => {
      const d = this.dist(x, y) + inset;
      return Math.max(d, -d - width);
    });
  }
  text(c: RGB, s: string, cx: number, y: number, size: number, o?: TextOpts): void {
    drawText(this.tex, this.ink(c), s, cx, y, size, o);
  }
  /** Centred lines stacked downwards; `top` is the top of the first line. */
  lines(c: RGB, lines: string[], top: number, size: number, o: TextOpts & { gap?: number; cx?: number } = {}): number {
    let y = top;
    for (const l of lines) {
      y -= size;
      this.text(c, l, o.cx ?? this.w / 2, y, size, { fit: this.w * 0.82, ...o });
      y -= o.gap ?? size * 0.5;
    }
    return y;
  }
  /** Lines centred vertically on the face (or on `cy`). */
  centred(c: RGB, lines: string[], size: number, o: TextOpts & { gap?: number; cx?: number; cy?: number } = {}): void {
    const gap = o.gap ?? size * 0.5;
    const total = lines.length * size + (lines.length - 1) * gap;
    this.lines(c, lines, (o.cy ?? this.h / 2) + total / 2, size, o);
  }
  rect(c: RGB, x0: number, y0: number, x1: number, y1: number, r = 0): void {
    if (r > 0) this.tex.poly(this.ink(c), [roundPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r)]);
    else this.tex.rect(this.ink(c), x0, y0, x1, y1);
  }
  disc(c: RGB, cx: number, cy: number, r: number): void {
    this.tex.disc(this.ink(c), cx, cy, r);
  }
  arrow(c: RGB, pts: Pt[], half: number, headW?: number, headL?: number): void {
    arrow(this.tex, this.ink(c), pts, half, headW, headL);
  }
  /** Red circle with a slash through it. */
  prohibit(cx: number, cy: number, r: number): void {
    const m = this.ink(C.red);
    this.tex.ring(m, cx, cy, r, r * 0.11);
    this.tex.stroke(m, [[cx - r * 0.7, cy + r * 0.7], [cx + r * 0.7, cy - r * 0.7]], r * 0.1);
  }
}

/** Mounting bolts by blank shape. */
function boltsFor(shape: SignShape, w: number, h: number): Pt[] {
  if (Math.max(w, h) > 1.5 || h < 0.32) return [];
  if (shape === 'yield') return [[w / 2, h * 0.86], [w / 2, h * 0.36]];
  if (shape === 'diamond') return [[w / 2, h * 0.22], [w / 2, h * 0.78]];
  return [[w / 2, h * 0.1], [w / 2, h * 0.9]];
}

/**
 * Turns the layers into a retroreflective sign face. `age` 0 = new; 1 = decades in the sun:
 * faded ink, grime, rust under the bolts, scratches, stickers and peeling edges.
 */
export function signFinish(p: Pen, bg: RGB, seed: number, age: number): TextureData {
  const { tex, w, h } = p;
  const rnd = new Rand(seed);
  const L = new Layers(tex, bg, 0.42);
  for (const l of p.layers) L.paint(l.mask, l.color);
  if (age > 0.5) {
    const tints: RGB[] = [hex(0xd8d4c8), hex(0x202020), hex(0xc03a2a), hex(0x2a6ab0), hex(0xe0c020), hex(0x3a8a4a)];
    for (let i = rnd.int(0, 3); i > 0; i--) {
      const m = tex.field();
      const sx = rnd.range(0.2, 0.8) * w;
      const sy = rnd.range(0.15, 0.6) * h;
      const sw = rnd.range(0.025, 0.06);
      const sh = rnd.range(0.02, 0.045);
      if (rnd.chance(0.4)) tex.disc(m, sx, sy, sh);
      else tex.poly(m, [roundPoly([[sx - sw, sy - sh], [sx + sw, sy - sh * 0.8], [sx + sw * 0.95, sy + sh], [sx - sw, sy + sh * 0.9]], 0.004)]);
      L.paint(m, rnd.pick(tints), { rough: 0.6, height: 0.0003 });
    }
  }
  const fade = tex.noise(0.35, 0.35, seed, 2);
  const streak = tex.noise(0.035, 0.6, seed + 1, 3);
  const grime = tex.noise(0.12, 0.12, seed + 2, 3);
  const speck = tex.noise(0.012, 0.012, seed + 3, 2);
  tex.map((x, y, k) => {
    const d = p.dist(x, y);
    if (d > 0.004) {
      L.r[k] = L.g[k] = L.b[k] = 0.09;
      L.rough[k] = 0.9;
      return 0;
    }
    let r = L.r[k];
    let g = L.g[k];
    let b = L.b[k];
    // The sun bleaches the ink: colours drift towards a chalky pale version of themselves.
    const f = age * (0.42 + 0.22 * fade(x, y));
    const chalk = (0.3 * r + 0.5 * g + 0.2 * b) * 0.55 + 0.42;
    r = lerp(r, chalk * 1.02, f * 0.9);
    g = lerp(g, chalk, f);
    b = lerp(b, chalk * 0.97, f);
    // Road grime: streaks that run down and a darker lower edge.
    const low = 1 - y / h;
    const dirt = clamp01(0.03 + age * (0.16 + grime(x, y) * 0.3 + sstep(0.15, 0.8, streak(x, y)) * 0.42 + low * low * 0.28 + speck(x, y) * 0.12));
    r *= 1 - dirt * 0.62;
    g *= 1 - dirt * 0.68;
    b *= 1 - dirt * 0.76;
    // Sheeting lifts and wears through along the rim.
    const peel = age > 0.3 ? sstep(-0.006 - 0.022 * clamp01(0.5 + grime(x * 2, y * 2)) * age, -0.001, d) * clamp01(age * 1.3 - 0.3) : 0;
    r = lerp(r, 0.56, peel);
    g = lerp(g, 0.57, peel);
    b = lerp(b, 0.58, peel);
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.rough[k] = lerp(0.4 + dirt * 0.5 + f * 0.2, 0.5, peel);
    L.metal[k] = peel * 0.8;
    L.height[k] += sstep(0.002, -0.003, d) * 0.0012 - peel * 0.0003;
    return 0;
  });
  if (age > 0.3) {
    const scratch = tex.field();
    for (let i = Math.round(age * 9); i > 0; i--) {
      const x = rnd.range(0.1, 0.9) * w;
      const y = rnd.range(0.1, 0.9) * h;
      const a = rnd.range(0, Math.PI);
      const l = rnd.range(0.03, 0.16);
      tex.stroke(scratch, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4]], 0.0009);
    }
    L.paint(scratch, [0.62, 0.62, 0.62], { opacity: 0.55, rough: 0.5 });
  }
  const bolts = boltsFor(p.shape, w, h);
  if (bolts.length) {
    const drip = tex.field();
    const head = tex.field();
    for (const [bx, by] of bolts) {
      tex.disc(head, bx, by, 0.0075);
      const len = rnd.range(0.05, 0.16);
      tex.stroke(drip, [[bx, by], [bx + rnd.range(-0.004, 0.004), by - len]], (t) => 0.007 * (1 - t * 0.7), 1, 0.006);
    }
    if (age > 0.25) L.paint(drip, [0.36, 0.2, 0.1], { opacity: clamp01(age * 0.8 - 0.1), rough: 0.8 });
    L.paint(head, age > 0.6 ? [0.42, 0.36, 0.32] : [0.66, 0.67, 0.68], { metal: 0.9, rough: 0.45, height: 0.0025 });
  }
  return L.finish();
}
