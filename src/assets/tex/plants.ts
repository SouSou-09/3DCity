import { Layers, RGB, Rand, TextureData, TextureSpec, Tex, hash2, hex, sstep } from './core';

type Pt = [number, number];
const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'cutout'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 15000 + list.length;
  list.push({ id: `plant/${id}`, label, category: 'plant', meters, tile: 'none', decal: false, density: 512, ...o, generate: (tex) => generate(tex, seed) });
}
const CARD: Extra = { cutout: true, density: 1024 };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const pal = (...h: number[]): RGB[] => h.map(hex);

// --- Bark. ---

type BarkKind = 'furrow' | 'plate' | 'mottle' | 'smooth' | 'birch' | 'strip' | 'ring' | 'diamond';
interface BarkOpts {
  kind: BarkKind;
  base: RGB;
  dark: RGB;
  /** Size of the furrows or plates, 1 = a mature tree. */
  scale?: number;
  moss?: number;
  /** Extra tones for mottled and peeling bark. */
  tones?: RGB[];
}
function bark(tex: Tex, seed: number, o: BarkOpts): TextureData {
  const L = new Layers(tex, o.base, 0.9);
  const s = o.scale ?? 1;
  const warp = tex.noise(0.3, 0.5, seed, 3);
  const n1 = tex.noise(0.075 * s, 0.6 * s, seed + 1, 4, 0.55);
  const n2 = tex.noise(0.03 * s, 0.22 * s, seed + 2, 3);
  const fine = tex.noise(0.01, 0.035, seed + 3, 2);
  const tone = tex.noise(0.5, 0.5, seed + 4, 3);
  const cell = tex.cells(0.1 * s, seed + 5);
  const mossN = tex.noise(0.3, 0.4, seed + 6, 3);
  const dash = tex.noise(0.11, 0.012, seed + 7, 2);
  const fibre = tex.noise(0.004, 0.25, seed + 8, 2);
  const tones = o.tones ?? [o.base];
  tex.map((x, y, k) => {
    let ridge = 0.6;
    let c = o.base;
    if (o.kind === 'furrow') {
      const a = Math.abs(n1(x, y) + n2(x, y) * 0.4);
      ridge = sstep(0.015, 0.3, a);
      c = mix(o.dark, o.base, ridge * (0.8 + 0.2 * sstep(-0.5, 0.5, n2(x, y))));
    } else if (o.kind === 'plate' || o.kind === 'mottle') {
      const cl = cell(x, y);
      const [edge, id] = [cl.f2 - cl.f1, cl.id];
      if (o.kind === 'plate') {
        ridge = sstep(0.02, 0.22, edge) * (0.75 + id * 0.25);
        c = mix(o.dark, mul(o.base, 0.8 + id * 0.4), sstep(0.02, 0.16, edge));
      } else {
        const t = tones[Math.floor(id * tones.length) % tones.length];
        ridge = 0.55 + id * 0.25 - (1 - sstep(0, 0.05, edge)) * 0.3;
        c = mix(o.dark, t, 0.75 + 0.25 * sstep(0, 0.05, edge));
      }
    } else if (o.kind === 'smooth') {
      const d = sstep(0.3, 0.5, dash(x, y));
      ridge = 0.65 + n2(x, y) * 0.12 - d * 0.3;
      c = mix(o.base, o.dark, d * 0.7);
    } else if (o.kind === 'birch') {
      const d = sstep(0.32, 0.45, dash(x, y));
      const cl = cell(x, y);
      const scar = cl.id > 0.82 ? 1 - sstep(0.1, 0.3, cl.f1) : 0;
      ridge = 0.7 - Math.max(d, scar) * 0.4;
      c = mix(o.base, o.dark, Math.max(d * 0.85, scar));
    } else if (o.kind === 'strip') {
      const t = n1(x, y) + warp(x, y) * 0.3;
      const i = t < -0.12 ? 0 : t < 0.18 ? 1 : 2;
      const lip = Math.min(Math.abs(t + 0.12), Math.abs(t - 0.18));
      ridge = 0.5 + i * 0.18 - (1 - sstep(0, 0.03, lip)) * 0.25;
      c = mix(o.dark, tones[i % tones.length], 0.7 + 0.3 * sstep(0, 0.03, lip));
    } else if (o.kind === 'ring') {
      const v = y / 0.06 + warp(x, y) * 0.3;
      const fr = v - Math.floor(v);
      ridge = sstep(0, 0.14, fr) * (1 - 0.35 * sstep(0.6, 1, fr)) * (0.8 + 0.2 * fibre(x, y));
      c = mix(o.dark, o.base, sstep(0, 0.1, fr) * (0.85 + 0.15 * fibre(x, y)));
    } else {
      const [u, v] = [x / 0.14 + y / 0.1, x / 0.14 - y / 0.1];
      const [fu, fv] = [u - Math.floor(u), v - Math.floor(v)];
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
      const id = hash2(Math.floor(u), Math.floor(v), seed);
      ridge = sstep(0, 0.2, edge) * (0.7 + 0.3 * (1 - fv));
      c = mix(o.dark, mul(o.base, 0.8 + id * 0.35), sstep(0, 0.14, edge) * (0.8 + 0.2 * fibre(x, y)));
    }
    const m = (1 + fine(x, y) * 0.14 + tone(x, y) * 0.1) * (0.82 + 0.18 * ridge);
    const moss = (o.moss ?? 0) * sstep(0.05, 0.45, mossN(x, y)) * (0.4 + 0.6 * ridge);
    L.r[k] = c[0] * m + (0.3 - c[0] * m) * moss;
    L.g[k] = c[1] * m + (0.37 - c[1] * m) * moss;
    L.b[k] = c[2] * m + (0.2 - c[2] * m) * moss;
    L.rough[k] = 0.95 - ridge * 0.12;
    L.height[k] = ridge * (o.kind === 'furrow' || o.kind === 'plate' || o.kind === 'diamond' ? 0.014 : 0.006) + fine(x, y) * 0.0008;
    return 0;
  });
  return L.finish();
}
const BARK: Extra = { tile: 'xy', density: 256 };
add('bark-oak', '樹皮 深い縦溝(ナラ・ニレ)', [1, 1.2], (t, s) => bark(t, s, { kind: 'furrow', base: hex(0x6a5a48), dark: hex(0x2a221a) }), BARK);
add('bark-oak-moss', '樹皮 深い縦溝・苔', [1, 1.2], (t, s) => bark(t, s, { kind: 'furrow', base: hex(0x62564a), dark: hex(0x28221c), moss: 0.7 }), BARK);
add('bark-young', '樹皮 細かい縦溝(若木)', [1, 1.2], (t, s) => bark(t, s, { kind: 'furrow', base: hex(0x7a6a56), dark: hex(0x3a3026), scale: 0.45 }), BARK);
add('bark-pine', '樹皮 うろこ状(マツ)', [1, 1.2], (t, s) => bark(t, s, { kind: 'plate', base: hex(0x7a5438), dark: hex(0x2c1c14) }), BARK);
add('bark-plane', '樹皮 まだら(プラタナス)', [1, 1.2], (t, s) => bark(t, s, { kind: 'mottle', base: hex(0xb8ad90), dark: hex(0x5a5040), tones: pal(0xc8c0a4, 0x8f9070, 0x9a8a70, 0xb0a888), scale: 1.3 }), BARK);
add('bark-smooth', '樹皮 なめらか 灰(イチジク属)', [1, 1.2], (t, s) => bark(t, s, { kind: 'smooth', base: hex(0x9a9488), dark: hex(0x5a544a) }), BARK);
add('bark-birch', '樹皮 白(シラカバ)', [1, 1.2], (t, s) => bark(t, s, { kind: 'birch', base: hex(0xd8d4c6), dark: hex(0x2a2622) }), BARK);
add('bark-eucalyptus', '樹皮 はがれ(ユーカリ)', [1, 1.2], (t, s) => bark(t, s, { kind: 'strip', base: hex(0xc4b8a0), dark: hex(0x6a5a46), tones: pal(0xd4cab4, 0xb09a7a, 0x8a8478) }), BARK);
add('bark-palm', '樹皮 ヤシ 輪状の葉痕', [1, 1.2], (t, s) => bark(t, s, { kind: 'ring', base: hex(0x8a7c68), dark: hex(0x3e342a) }), BARK);
add('bark-palm-grey', '樹皮 ヤシ 灰', [1, 1.2], (t, s) => bark(t, s, { kind: 'ring', base: hex(0x9a968c), dark: hex(0x4a463e) }), BARK);
add('bark-date', '樹皮 ナツメヤシ 菱形の葉柄跡', [0.84, 0.8], (t, s) => bark(t, s, { kind: 'diamond', base: hex(0x7a6448), dark: hex(0x2e241a) }), BARK);
add('bark-dead', '樹皮 枯れ木', [1, 1.2], (t, s) => bark(t, s, { kind: 'furrow', base: hex(0x9a948a), dark: hex(0x4a443c), scale: 0.7 }), BARK);

// --- Leaves and petals drawn one at a time. ---

type LeafShape = 'ovate' | 'lance' | 'oak' | 'maple' | 'round' | 'heart' | 'petal' | 'notch';
/** Half width at fraction t along a leaf of unit width. */
function halfWidth(shape: LeafShape, t: number): number {
  const s = (p: number, q: number): number => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, p))), q) / 2;
  switch (shape) {
    case 'lance': return s(0.85, 1.2);
    case 'round': return s(1, 0.55);
    case 'heart': return s(0.5, 0.7);
    case 'petal': return s(1.5, 0.6);
    case 'notch': return s(1.6, 0.5) * (1 - 0.35 * sstep(0.86, 1, t));
    case 'oak': return Math.max(0.05 * Math.sin(Math.PI * t), s(0.8, 0.7) * (0.66 + 0.34 * Math.cos(t * Math.PI * 7 + 0.6)));
    default: return s(0.7, 0.85);
  }
}
/** Outline in leaf coordinates [across, along]: base at the origin, tip at (0, len). */
function outline(shape: LeafShape, len: number, wid: number, half = false): Pt[] {
  const pts: Pt[] = [];
  if (shape === 'maple') {
    for (let i = half ? 20 : 0; i <= 40; i++) {
      const phi = -Math.PI + (i / 40) * Math.PI * 2;
      const lobe = Math.pow(Math.abs(Math.cos(2.5 * phi)), 1.1);
      const r = len * 0.58 * (0.42 + 0.58 * lobe * (1 - (0.3 * Math.abs(phi)) / Math.PI));
      pts.push([(r * Math.sin(phi) * wid) / len, 0.42 * len + r * Math.cos(phi)]);
    }
    if (half) pts.push([0, 0.42 * len]);
    return pts;
  }
  const N = 14;
  for (let i = 0; i <= N; i++) pts.push([halfWidth(shape, i / N) * wid, (i / N) * len]);
  if (!half) for (let i = N - 1; i >= 1; i--) pts.push([-halfWidth(shape, i / N) * wid, (i / N) * len]);
  return pts;
}
/** Leaf coordinates to texture coordinates: the leaf starts at (x, y) and points `ang` radians clockwise from up. */
function place(pts: Pt[], x: number, y: number, ang: number): Pt[] {
  const [s, c] = [Math.sin(ang), Math.cos(ang)];
  return pts.map(([a, l]) => [x + c * a + s * l, y - s * a + c * l] as Pt);
}
interface LeafStyle {
  shape: LeafShape;
  len: number;
  wid: number;
  cols: RGB[];
  vein: RGB;
  /** Pairs of side veins. */
  veins?: number;
}
/** Painter for cut-out cards: everything drawn is opaque, the rest of the card is clear. */
class Cut {
  readonly L: Layers;
  readonly w: number;
  readonly h: number;
  constructor(readonly tex: Tex, base: RGB, rough = 0.6) {
    this.L = new Layers(tex, base, rough, 0);
    this.w = tex.mw;
    this.h = tex.mh;
  }
  fill(pts: Pt[], c: RGB, height = 0.003): void {
    const m = this.tex.field();
    this.tex.poly(m, [pts]);
    this.L.paint(m, c, { alpha: true, height });
  }
  tint(pts: Pt[], c: RGB, opacity: number): void {
    const m = this.tex.field();
    this.tex.poly(m, [pts]);
    this.L.paint(m, c, { opacity });
  }
  line(pts: Pt[], half: number | ((t: number) => number), c: RGB, o: { cut?: boolean; opacity?: number; height?: number } = {}): void {
    const m = this.tex.field();
    this.tex.stroke(m, pts, half);
    this.L.paint(m, c, { alpha: o.cut, opacity: o.opacity, height: o.height });
  }
  lines(all: Pt[][], half: number | ((t: number) => number), c: RGB, o: { cut?: boolean; opacity?: number; height?: number } = {}): void {
    const m = this.tex.field();
    for (const pts of all) this.tex.stroke(m, pts, half);
    this.L.paint(m, c, { alpha: o.cut, opacity: o.opacity, height: o.height });
  }
  dot(x: number, y: number, r: number, c: RGB, cut = true, height = 0.002): void {
    const m = this.tex.field();
    this.tex.disc(m, x, y, r);
    this.L.paint(m, c, { alpha: cut, height });
  }
  /** One leaf with a lighter midrib, side veins and one half in shade. */
  leaf(st: LeafStyle, x: number, y: number, ang: number, scale: number, rnd: Rand): void {
    const [len, wid] = [st.len * scale, st.wid * scale];
    const c = mul(mix(rnd.pick(st.cols), rnd.pick(st.cols), rnd.next()), 0.86 + rnd.next() * 0.28);
    this.fill(place(outline(st.shape, len, wid), x, y, ang), c);
    this.tint(place(outline(st.shape, len, wid, true), x, y, ang), mul(c, 0.72), 0.55);
    const veins: Pt[][] = [];
    if (st.shape === 'maple') {
      for (const phi of [0, 1.257, -1.257, 2.2, -2.2]) veins.push(place([[0, 0.42 * len], [0.42 * len * Math.sin(phi) * (wid / len), 0.42 * len + 0.44 * len * Math.cos(phi) * (1 - 0.1 * Math.abs(phi))]], x, y, ang));
      veins.push(place([[0, 0], [0, 0.42 * len]], x, y, ang));
    } else {
      veins.push(place([[0, 0], [0, len * 0.96]], x, y, ang));
      const n = st.veins ?? 5;
      for (let i = 1; i <= n; i++) {
        const t = (i / (n + 1)) * 0.85;
        for (const s of [-1, 1]) veins.push(place([[0, t * len], [s * halfWidth(st.shape, t + 0.1) * wid * 0.86, (t + 0.13) * len]], x, y, ang));
      }
    }
    this.lines(veins, Math.max(len * 0.012, this.tex.px * 0.6), st.vein, { opacity: 0.75, height: 0.0012 });
  }
  /** Flower seen from the front: rings of petals around a centre. */
  flower(x: number, y: number, R: number, o: FlowerOpts, rnd: Rand): void {
    const rot0 = rnd.next() * 6.28;
    o.rings.forEach((ring, ri) => {
      const len = R * ring.len;
      const wid = ring.wid * len;
      for (let i = 0; i < ring.n; i++) {
        const ang = rot0 + ri * 0.5 + (i / ring.n) * Math.PI * 2 + (rnd.next() - 0.5) * 0.12;
        const c = mul(mix(rnd.pick(ring.cols), rnd.pick(ring.cols), rnd.next()), 0.9 + rnd.next() * 0.2);
        this.fill(place(outline(ring.shape, len, wid), x, y, ang), c, 0.002 + ri * 0.0012);
        this.tint(place(outline(ring.shape, len, wid, true), x, y, ang), mul(c, 0.8), 0.4);
        if (o.line) this.line(place([[0, len * 0.12], [0, len * 0.8]], x, y, ang), Math.max(len * 0.02, this.tex.px * 0.5), o.line, { opacity: 0.5 });
      }
      // The throat of each ring sits in shade.
      const m = this.tex.field();
      this.tex.disc(m, x, y, len * 0.5, 1, len * 0.3);
      this.L.paint(m, mul(ring.cols[0], 0.55), { opacity: 0.45 });
    });
    if (o.centre) {
      this.dot(x, y, R * o.centre.r, o.centre.col, true, 0.004);
      const n = Math.round(10 + o.centre.r * 60);
      for (let i = 0; i < n; i++) {
        const [a, d] = [rnd.next() * 6.28, Math.sqrt(rnd.next()) * R * o.centre.r * 0.85];
        this.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(R * 0.025, this.tex.px * 0.6), o.centre.dots, false, 0.001);
      }
    }
    if (o.column) {
      const a = rot0 + 0.6;
      const tip: Pt = [x + Math.sin(a) * R * 0.55, y + Math.cos(a) * R * 0.55];
      this.line([[x, y], tip], R * 0.035, o.column, { cut: true, height: 0.004 });
      for (let i = 0; i < 6; i++) this.dot(tip[0] + (rnd.next() - 0.5) * R * 0.16, tip[1] + (rnd.next() - 0.5) * R * 0.16, R * 0.035, hex(0xf0d040), true, 0.005);
    }
  }
  done(): TextureData {
    return this.L.finish();
  }
}
interface Ring {
  n: number;
  /** Petal length as a share of the flower radius, and width as a share of that length. */
  len: number;
  wid: number;
  shape: LeafShape;
  cols: RGB[];
}
interface FlowerOpts {
  rings: Ring[];
  centre?: { r: number; col: RGB; dots: RGB };
  /** Dark veins along the petals. */
  line?: RGB;
  /** Staminal column standing out of the centre (hibiscus). */
  column?: RGB;
}
const TWIG = hex(0x5a4630);

interface SprayOpts {
  /** Leaves along the main twig. */
  n?: number;
  /** Side twigs, each with its own leaves. */
  side?: number;
  twig?: RGB;
  /** Second kind of leaf (bracts, dead leaves) and how often it replaces the first. */
  alt?: LeafStyle;
  altShare?: number;
  /** Flowers set on the twig instead of some leaves. */
  flower?: FlowerOpts;
  flowerR?: number;
  flowerShare?: number;
}
/** Card with a twig rising from the bottom centre, carrying alternate leaves and a terminal leaf. */
function spray(tex: Tex, seed: number, st: LeafStyle, o: SprayOpts = {}): TextureData {
  const rnd = new Rand(seed);
  const c = new Cut(tex, st.cols[0]);
  const twigCol = o.twig ?? TWIG;
  const item = (x: number, y: number, ang: number, scale: number): void => {
    if (o.flower && rnd.chance(o.flowerShare ?? 0.6)) {
      const R = (o.flowerR ?? st.len * 0.3) * (0.85 + rnd.next() * 0.3);
      const [fx, fy] = [x + Math.sin(ang) * R * 1.2, y + Math.cos(ang) * R * 1.2];
      c.line([[x, y], [fx, fy]], tex.px * 0.7, twigCol, { cut: true });
      c.flower(Math.min(c.w - R, Math.max(R, fx)), Math.min(c.h - R, Math.max(R, fy)), R, o.flower, rnd);
    } else c.leaf(o.alt && rnd.chance(o.altShare ?? 0.5) ? o.alt : st, x, y, ang, scale, rnd);
  };
  const branch = (x0: number, y0: number, dir: number, length: number, n: number, thick: number, leafScale: number): void => {
    const bend = (rnd.next() - 0.5) * 0.5;
    const at = (t: number): Pt => [x0 + Math.sin(dir + bend * t) * length * t, y0 + Math.cos(dir + bend * t) * length * t];
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) pts.push(at(i / 8));
    c.line(pts, (t) => Math.max(tex.px * 0.6, thick * (1 - 0.65 * t)), twigCol, { cut: true, height: 0.004 });
    for (let i = 0; i < n - 1; i++) {
      const t = 0.14 + (0.82 * i) / Math.max(1, n - 2);
      const side = i % 2 ? 1 : -1;
      const [x, y] = at(t);
      item(x, y, dir + bend * t + side * (1.15 - 0.5 * t) + (rnd.next() - 0.5) * 0.25, leafScale * (1 - 0.22 * t) * (0.88 + rnd.next() * 0.24));
    }
    const [tx, ty] = at(1);
    item(tx, ty, dir + bend + (rnd.next() - 0.5) * 0.3, leafScale);
  };
  const sides = o.side ?? 0;
  const reach = st.len * (o.flower ? 0.7 : 1);
  if (sides) {
    for (let i = 0; i < sides; i++) {
      const dir = ((i + 0.5) / sides - 0.5) * 2.1 + (rnd.next() - 0.5) * 0.15;
      const room = Math.min((c.h - reach - 0.01) / Math.max(0.3, Math.cos(dir)), (c.w / 2 - reach * 0.8) / Math.max(0.15, Math.abs(Math.sin(dir))));
      branch(c.w / 2, 0, dir, room * (0.8 + rnd.next() * 0.2), o.n ?? 6, c.w * 0.012, 1);
    }
  } else branch(c.w / 2, 0, (rnd.next() - 0.5) * 0.12, c.h - reach - 0.01, o.n ?? 9, c.w * 0.014, 1);
  return c.done();
}

const GREEN = pal(0x2f5a1e, 0x3f6e24, 0x4f7f2c);
const LEAVES: [string, string, LeafStyle, SprayOpts][] = [
  ['ovate', '葉 卵形(イチジク属・ニレ)', { shape: 'ovate', len: 0.13, wid: 0.07, cols: GREEN, vein: hex(0x8fb060) }, { side: 3, n: 6 }],
  ['ovate-light', '葉 卵形 若葉', { shape: 'ovate', len: 0.125, wid: 0.066, cols: pal(0x5f9a2c, 0x74ac36, 0x86b840), vein: hex(0xc0d888) }, { side: 3, n: 6 }],
  ['oak', '葉 切れ込み(ナラ)', { shape: 'oak', len: 0.14, wid: 0.09, cols: pal(0x355f22, 0x44702a, 0x587f30), vein: hex(0x9ab868), veins: 4 }, { side: 3, n: 6 }],
  ['maple', '葉 掌状(カエデ・プラタナス)', { shape: 'maple', len: 0.14, wid: 0.15, cols: pal(0x3d7426, 0x4f8a2e, 0x65992f), vein: hex(0xa8c870) }, { side: 3, n: 5 }],
  ['maple-autumn', '葉 掌状 紅葉', { shape: 'maple', len: 0.14, wid: 0.15, cols: pal(0xb8341a, 0xd8601c, 0xe89a1e, 0x9a2414), vein: hex(0xf0c060) }, { side: 3, n: 5 }],
  ['ovate-autumn', '葉 卵形 黄葉', { shape: 'ovate', len: 0.125, wid: 0.066, cols: pal(0xd8a41c, 0xe8bc24, 0xc88418, 0xa8a030), vein: hex(0xf4e090) }, { side: 3, n: 6 }],
  ['lance', '葉 細長(ユーカリ・オリーブ)', { shape: 'lance', len: 0.15, wid: 0.03, cols: pal(0x5d7a5a, 0x6f8a66, 0x7f9a72), vein: hex(0xc0d0b0), veins: 0 }, { side: 3, n: 9 }],
  ['dry', '葉 枯れ葉・まばら', { shape: 'ovate', len: 0.12, wid: 0.064, cols: pal(0x8a6a34, 0xa07c3c, 0x6e5228), vein: hex(0xc8a868) }, { side: 2, n: 4 }],
];
for (const [id, label, st, o] of LEAVES) add(`leaf-${id}`, label, [0.6, 0.6], (t, s) => spray(t, s, st, o), CARD);

const SMALL: LeafStyle = { shape: 'round', len: 0.05, wid: 0.03, cols: pal(0x274f1a, 0x356322, 0x467628), vein: hex(0x7fa050), veins: 0 };
add('leaf-small', '葉 小葉の茂み(ツゲ・生垣)', [0.32, 0.32], (t, s) => spray(t, s, SMALL, { side: 5, n: 8 }), { cutout: true, density: 1024 });
add('leaf-small-light', '葉 小葉の茂み 若葉', [0.32, 0.32], (t, s) => spray(t, s, { ...SMALL, cols: pal(0x4f8a28, 0x64a030, 0x7ab03a) }, { side: 5, n: 8 }), { cutout: true, density: 1024 });
add('leaf-small-dry', '葉 小葉の茂み 枯れ気味', [0.32, 0.32], (t, s) => spray(t, s, { ...SMALL, cols: pal(0x6a6a2c, 0x8a7a38, 0x4a5a24, 0x9a8444) }, { side: 4, n: 6 }), { cutout: true, density: 1024 });
add('leaf-shrub', '葉 低木の枝(ツバキ・ハイビスカス)', [0.4, 0.4], (t, s) => spray(t, s, { shape: 'ovate', len: 0.09, wid: 0.05, cols: pal(0x24501c, 0x30642a, 0x3f7626), vein: hex(0x86a85a), veins: 4 }, { side: 3, n: 6 }), { cutout: true, density: 768 });

// --- Blossom on the twig. ---

const five = (cols: RGB[], eye: RGB = hex(0xf0d858)): FlowerOpts => ({ rings: [{ n: 5, len: 1, wid: 0.95, shape: 'petal', cols }], centre: { r: 0.16, col: eye, dots: hex(0xb07818) } });
const SPRIG: LeafStyle = { shape: 'ovate', len: 0.1, wid: 0.05, cols: GREEN, vein: hex(0x8fb060), veins: 3 };
add('blossom-pink', '花枝 桃色の花(サクラ・ハナミズキ)', [0.6, 0.6], (t, s) => spray(t, s, SPRIG, { side: 3, n: 7, flower: five(pal(0xf4b4c8, 0xf8c8d8, 0xec98b4), hex(0xd84a70)), flowerR: 0.04, flowerShare: 0.78 }), CARD);
add('blossom-white', '花枝 白い花(ナシ・モクレン)', [0.6, 0.6], (t, s) => spray(t, s, SPRIG, { side: 3, n: 7, flower: five(pal(0xf4f2e8, 0xfaf8f0, 0xe8e6d8)), flowerR: 0.042, flowerShare: 0.75 }), CARD);
add('blossom-jacaranda', '花枝 紫の花(ジャカランダ)', [0.6, 0.6], (t, s) => spray(t, s, { shape: 'lance', len: 0.1, wid: 0.016, cols: pal(0x4a7a30, 0x5a8a38), vein: hex(0x90b060), veins: 0 }, { side: 4, n: 9, flower: { rings: [{ n: 5, len: 1, wid: 0.8, shape: 'notch', cols: pal(0x7a5ac8, 0x8c6ad8, 0x6a48b8, 0x9a7ae0) }], centre: { r: 0.2, col: hex(0xd8c8f0), dots: hex(0xf0e8ff) } }, flowerR: 0.032, flowerShare: 0.8 }), CARD);
add('blossom-bougainvillea', '花枝 ブーゲンビリア', [0.6, 0.6], (t, s) => spray(t, s, { shape: 'heart', len: 0.085, wid: 0.06, cols: pal(0x2a5a20, 0x3a6e28), vein: hex(0x86a85a), veins: 3 }, { side: 3, n: 9, alt: { shape: 'heart', len: 0.075, wid: 0.065, cols: pal(0xd81e78, 0xe83a90, 0xc01468, 0xf05aa0), vein: hex(0xf8a0c8), veins: 3 }, altShare: 0.68 }), CARD);
add('blossom-yellow', '花枝 黄色い花(タベブイア)', [0.6, 0.6], (t, s) => spray(t, s, SPRIG, { side: 3, n: 7, flower: five(pal(0xf4d020, 0xf8dc40, 0xe8b818), hex(0xd89010)), flowerR: 0.042, flowerShare: 0.8 }), CARD);

// --- Flower heads. ---

function head(tex: Tex, seed: number, o: FlowerOpts): TextureData {
  const c = new Cut(tex, o.rings[0].cols[0], 0.55);
  c.flower(c.w / 2, c.h / 2, (c.w / 2) * 0.96, o, new Rand(seed));
  return c.done();
}
const HEAD: Extra = { cutout: true, density: 1024 };
const daisy = (cols: RGB[], n = 17): FlowerOpts => ({ rings: [{ n, len: 1, wid: 0.3, shape: 'lance', cols }], centre: { r: 0.25, col: hex(0xe8b818), dots: hex(0xb07010) } });
const rose = (cols: RGB[]): FlowerOpts => ({ rings: [{ n: 6, len: 1, wid: 1.0, shape: 'round', cols: cols.map((c) => mul(c, 0.82)) }, { n: 5, len: 0.76, wid: 1.0, shape: 'round', cols: cols.map((c) => mul(c, 0.92)) }, { n: 4, len: 0.52, wid: 1.0, shape: 'round', cols }, { n: 3, len: 0.3, wid: 1.0, shape: 'round', cols: cols.map((c) => mul(c, 1.08)) }] });
const marigold = (cols: RGB[]): FlowerOpts => ({ rings: [14, 12, 9, 6].map((n, i) => ({ n, len: 1 - i * 0.22, wid: 0.5, shape: 'notch' as LeafShape, cols: cols.map((c) => mul(c, 0.86 + i * 0.07)) })), centre: { r: 0.1, col: mul(cols[0], 0.8), dots: cols[1] } });
const hibiscus = (cols: RGB[], throat: RGB): FlowerOpts => ({ rings: [{ n: 5, len: 1, wid: 1.05, shape: 'petal', cols }], centre: { r: 0.14, col: throat, dots: mul(throat, 0.7) }, line: mul(cols[0], 0.7), column: hex(0xf0e0a0) });
const HEADS: [string, string, FlowerOpts, number][] = [
  ['daisy-white', '花 デイジー 白', daisy(pal(0xf4f2ea, 0xfaf8f2, 0xe6e4da)), 0.14],
  ['daisy-yellow', '花 デイジー 黄', daisy(pal(0xf4d020, 0xf8dc48, 0xe8bc18)), 0.14],
  ['daisy-pink', '花 デイジー 桃', daisy(pal(0xf090b8, 0xf4a8c8, 0xe070a0), 15), 0.14],
  ['daisy-purple', '花 アスター 紫', daisy(pal(0x8a5ac8, 0x9c70d8, 0x7446b4), 21), 0.12],
  ['five-red', '花 5弁 赤(ゼラニウム)', five(pal(0xd8241c, 0xe83a2a, 0xc01a18)), 0.11],
  ['five-magenta', '花 5弁 赤紫(ペチュニア)', five(pal(0xc81e88, 0xdc3a9c, 0xb01478), hex(0x501040)), 0.12],
  ['five-purple', '花 5弁 紫(ペチュニア)', five(pal(0x6a3ab8, 0x7c50c8, 0x5a2ca4), hex(0x2a1450)), 0.12],
  ['five-white', '花 5弁 白(ビンカ)', five(pal(0xf6f4ec, 0xfbf9f3, 0xe8e6dc), hex(0xe04a70)), 0.11],
  ['five-blue', '花 5弁 青(プルンバゴ)', five(pal(0x7aa0e0, 0x8cb0ec, 0x6a8cd0), hex(0xf0f0ff)), 0.1],
  ['rose-red', '花 バラ 赤', rose(pal(0xb81420, 0xcc2028, 0xa01018)), 0.13],
  ['rose-pink', '花 バラ 桃', rose(pal(0xf090a8, 0xf4a4b8, 0xe87898)), 0.13],
  ['rose-yellow', '花 バラ 黄', rose(pal(0xf0c830, 0xf4d448, 0xe8b420)), 0.13],
  ['rose-white', '花 バラ 白', rose(pal(0xf2eedc, 0xf8f4e6, 0xe8e2cc)), 0.13],
  ['marigold-orange', '花 マリーゴールド 橙', marigold(pal(0xf08010, 0xf89820, 0xe06808)), 0.12],
  ['marigold-yellow', '花 マリーゴールド 黄', marigold(pal(0xf4c818, 0xf8d838, 0xe8b010)), 0.12],
  ['hibiscus-red', '花 ハイビスカス 赤', hibiscus(pal(0xd81828, 0xe83038, 0xc01020), hex(0x70081a)), 0.18],
  ['hibiscus-pink', '花 ハイビスカス 桃', hibiscus(pal(0xf47aa0, 0xf890b0, 0xe86090), hex(0xb01848)), 0.18],
  ['hibiscus-yellow', '花 ハイビスカス 黄', hibiscus(pal(0xf4cc28, 0xf8d848, 0xe8b818), hex(0xb02018)), 0.18],
  ['sunflower', '花 ヒマワリ', { rings: [{ n: 24, len: 1, wid: 0.3, shape: 'lance', cols: pal(0xf4c010, 0xf8d030, 0xe8a808) }, { n: 20, len: 0.86, wid: 0.3, shape: 'lance', cols: pal(0xf0b008, 0xe89c08) }], centre: { r: 0.45, col: hex(0x4a2c12), dots: hex(0x2a1808) } }, 0.3],
];
for (const [id, label, o, size] of HEADS) add(`flower-${id}`, label, [size, size], (t, s) => head(t, s, o), HEAD);

// --- Whole small plants seen from the side or from above. ---

add('whorl', '株の葉 ロゼット(上から)', [0.3, 0.3], (tex, seed) => {
  const rnd = new Rand(seed);
  const c = new Cut(tex, GREEN[0]);
  const st: LeafStyle = { shape: 'ovate', len: 0.135, wid: 0.07, cols: pal(0x2f5f1e, 0x3f7426, 0x52862e), vein: hex(0x90b060), veins: 4 };
  for (let i = 0; i < 8; i++) c.leaf(st, 0.15, 0.15, (i / 8) * 6.283 + rnd.next() * 0.3, 0.9 + rnd.next() * 0.2, rnd);
  for (let i = 0; i < 5; i++) c.leaf(st, 0.15, 0.15, (i / 5) * 6.283 + 0.4 + rnd.next() * 0.3, 0.55 + rnd.next() * 0.15, rnd);
  return c.done();
}, { cutout: true, density: 768 });
function sideFlower(tex: Tex, seed: number, kind: 'tulip' | 'lavender' | 'iris', cols: RGB[]): TextureData {
  const rnd = new Rand(seed);
  const leafCols = kind === 'lavender' ? pal(0x6a8468, 0x7c9478) : pal(0x3a6e28, 0x4a7f30, 0x5a8a36);
  const c = new Cut(tex, leafCols[0]);
  const [w, h] = [c.w, c.h];
  const blade: LeafStyle = { shape: 'lance', len: h * 0.62, wid: w * 0.2, cols: leafCols, vein: mul(leafCols[1], 1.3), veins: 0 };
  if (kind === 'lavender') {
    for (let i = 0; i < 9; i++) c.leaf({ ...blade, len: h * 0.3, wid: w * 0.07 }, w / 2 + (rnd.next() - 0.5) * 0.02, 0, (rnd.next() - 0.5) * 1.5, 0.8 + rnd.next() * 0.4, rnd);
    for (let i = 0; i < 5; i++) {
      const dir = ((i + 0.5) / 5 - 0.5) * 0.5 + (rnd.next() - 0.5) * 0.08;
      const len = h * (0.8 + rnd.next() * 0.17);
      const at = (t: number): Pt => [w / 2 + Math.sin(dir) * len * t, Math.cos(dir) * len * t];
      c.line([at(0), at(1)], tex.px * 0.7, hex(0x6a8458), { cut: true });
      for (let k = 0; k < 16; k++) {
        const [x, y] = at(0.58 + (k / 16) * 0.42);
        c.dot(x + (k % 2 ? 1 : -1) * w * 0.035 * (1 - k / 22), y, w * 0.04 * (1 - k / 30), mul(rnd.pick(cols), 0.9 + rnd.next() * 0.2));
      }
    }
    return c.done();
  }
  for (const a of [-0.42, 0.36, -0.12]) c.leaf(blade, w / 2, 0, a + (rnd.next() - 0.5) * 0.1, 0.8 + rnd.next() * 0.3, rnd);
  const top: Pt = [w / 2 + (rnd.next() - 0.5) * w * 0.1, h * 0.72];
  c.line([[w / 2, 0], [w / 2, h * 0.3], top], w * 0.02, hex(0x5a8a3a), { cut: true, height: 0.004 });
  const petal: LeafStyle = { shape: kind === 'tulip' ? 'ovate' : 'petal', len: h * 0.27, wid: w * (kind === 'tulip' ? 0.3 : 0.34), cols, vein: mul(cols[0], 0.75), veins: 0 };
  const fan = kind === 'tulip' ? [-0.38, 0.38, -0.14, 0.14, 0] : [-1.9, 1.9, -1.0, 1.0, -0.3, 0.3, 0];
  for (const a of fan) c.leaf(petal, top[0], top[1], a, Math.abs(a) > 1.5 ? 0.75 : 1, rnd);
  return c.done();
}
const SIDE: Extra = { cutout: true, density: 768 };
add('stem-tulip-red', '花 チューリップ 赤(横から)', [0.2, 0.45], (t, s) => sideFlower(t, s, 'tulip', pal(0xd81c24, 0xe83830, 0xc01420)), SIDE);
add('stem-tulip-yellow', '花 チューリップ 黄(横から)', [0.2, 0.45], (t, s) => sideFlower(t, s, 'tulip', pal(0xf4c818, 0xf8d838, 0xe8b010)), SIDE);
add('stem-tulip-pink', '花 チューリップ 桃(横から)', [0.2, 0.45], (t, s) => sideFlower(t, s, 'tulip', pal(0xf080a8, 0xf498b8, 0xe86898)), SIDE);
add('stem-iris', '花 アイリス 紫(横から)', [0.24, 0.6], (t, s) => sideFlower(t, s, 'iris', pal(0x5a3ab0, 0x6c4cc0, 0x4a2c9c)), SIDE);
add('stem-lavender', '花 ラベンダー(横から)', [0.3, 0.5], (t, s) => sideFlower(t, s, 'lavender', pal(0x7a5ac0, 0x8c6cd0, 0x6a48ac)), SIDE);

/** Tuft of grass blades fanning out of the bottom centre. */
function tuft(tex: Tex, seed: number, cols: RGB[], blades: number, seedHeads = false): TextureData {
  const rnd = new Rand(seed);
  const c = new Cut(tex, cols[0], 0.7);
  const groups: Pt[][][] = cols.map(() => []);
  const heads: Pt[] = [];
  for (let i = 0; i < blades; i++) {
    const a = (rnd.next() - 0.5) * 1.7;
    const len = c.h * (0.5 + rnd.next() * 0.46) * (1 - 0.3 * Math.abs(a));
    const x0 = c.w / 2 + (rnd.next() - 0.5) * c.w * 0.3;
    const pts: Pt[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push([x0 + Math.sin(a) * len * t + Math.sign(a) * c.w * 0.16 * t * t, Math.max(0, Math.cos(a) * len * t - c.h * 0.1 * t * t * Math.abs(a))]);
    }
    groups[i % cols.length].push(pts);
    if (seedHeads && i % 5 === 0) heads.push(pts[8]);
  }
  groups.forEach((g, i) => c.lines(g, (t) => Math.max(tex.px * 0.55, c.w * 0.012 * (1 - t)), cols[i], { cut: true, height: 0.002 + i * 0.001 }));
  for (const [x, y] of heads) c.dot(Math.min(c.w - 0.02, Math.max(0.02, x)), Math.min(c.h - 0.02, y), c.w * 0.018, hex(0xc8b078));
  return c.done();
}
add('grass-tuft', '草の株', [0.5, 0.6], (t, s) => tuft(t, s, pal(0x4a7a2a, 0x5c8c32, 0x3a6a24), 60), SIDE);
add('grass-tuft-dry', '草の株 枯れ', [0.5, 0.6], (t, s) => tuft(t, s, pal(0xa89858, 0xc0ac68, 0x8a7c48), 50, true), SIDE);
add('grass-tuft-blue', '草の株 青緑(フェスク)', [0.4, 0.4], (t, s) => tuft(t, s, pal(0x6a8a80, 0x7c9a90, 0x5a7a74), 70), SIDE);
add('grass-fountain', '観賞用の草 穂つき', [0.9, 1.1], (t, s) => tuft(t, s, pal(0x6a8a3a, 0x7c9a44, 0x8aa050, 0x587a30), 90, true), { cutout: true, density: 384 });

// --- Palm leaves. ---

/** Pinnate frond: leaflets either side of a rachis that runs up the middle of the card. */
function frond(tex: Tex, seed: number, cols: RGB[], rachis: RGB, droop = 0): TextureData {
  const rnd = new Rand(seed);
  const c = new Cut(tex, cols[0], 0.5);
  const [w, h] = [c.w, c.h];
  const groups: Pt[][][] = cols.map(() => []);
  const y0 = h * 0.1;
  const n = Math.round((h - y0 - 0.06) / 0.05);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const len = w * 0.47 * sstep(-0.12, 0.22, t) * (1 - 0.62 * t * t);
    const a = 1.2 - 0.72 * t + (rnd.next() - 0.5) * 0.12;
    for (const s of [-1, 1]) {
      const y = y0 + t * (h - y0 - 0.06) + (s > 0 ? 0.02 : 0);
      const l = len * (0.88 + rnd.next() * 0.2);
      const sag = droop * l * 0.5;
      groups[Math.floor(rnd.next() * cols.length)].push([[w / 2, y], [w / 2 + s * Math.sin(a) * l * 0.5, y + Math.cos(a) * l * 0.5 - sag * 0.25], [w / 2 + s * Math.sin(a) * l, Math.min(h - 0.004, y + Math.cos(a) * l - sag)]]);
    }
  }
  groups.forEach((g, i) => c.lines(g, (t) => Math.max(tex.px * 0.6, w * 0.019 * Math.sin(Math.PI * (0.12 + 0.88 * t))), cols[i], { cut: true, height: 0.002 + i * 0.001 }));
  c.line([[w / 2, 0], [w / 2, h - 0.03]], (t) => w * (0.022 - 0.017 * t), rachis, { cut: true, height: 0.006 });
  return c.done();
}
const FROND: Extra = { cutout: true, density: 256 };
add('frond', 'ヤシの葉 羽状', [1, 3.2], (t, s) => frond(t, s, pal(0x3a6a24, 0x4a7c2c, 0x5a8a34, 0x2f5a1e), hex(0x9aa858)), FROND);
add('frond-droop', 'ヤシの葉 羽状・垂れ(ココヤシ)', [1, 3.2], (t, s) => frond(t, s, pal(0x4a7a28, 0x5c8c30, 0x6a9838), hex(0xa8b060), 1), FROND);
add('frond-date', 'ヤシの葉 羽状 灰緑(ナツメヤシ)', [0.8, 3.2], (t, s) => frond(t, s, pal(0x5a7a58, 0x6a8a64, 0x4a6a4c), hex(0xb0a868)), FROND);
add('frond-dry', 'ヤシの葉 羽状 枯れ', [1, 3.2], (t, s) => frond(t, s, pal(0x9a8450, 0xb09a60, 0x7a6840), hex(0x8a7448), 1), FROND);
/** Fan leaf: pleated segments radiating from the end of the leaf stalk, which enters at the bottom centre. */
function fan(tex: Tex, seed: number, cols: RGB[], stalk: RGB, ragged = 0): TextureData {
  const rnd = new Rand(seed);
  const c = new Cut(tex, cols[0], 0.5);
  const [w, h] = [c.w, c.h];
  const hub: Pt = [w / 2, h * 0.28];
  const n = 46;
  const spread = 2.62;
  const groups: Pt[][][] = cols.map(() => []);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n - 0.5) * 2 * spread;
    const back = Math.max(0, (Math.abs(a) - 1.57) / (spread - 1.57));
    const R = w * 0.485 * (1 - 0.5 * back) * (1 - ragged * rnd.next() * 0.35) * (0.94 + rnd.next() * 0.06);
    groups[i % cols.length].push([hub, [hub[0] + Math.sin(a) * R * 0.6, hub[1] + Math.cos(a) * R * 0.6], [hub[0] + Math.sin(a) * R, hub[1] + Math.cos(a) * R - ragged * R * 0.08]]);
  }
  const step = (2 * spread) / n;
  groups.forEach((g, i) => c.lines(g, (t) => Math.max(tex.px * 0.6, (t < 0.55 ? t : 0.55 * Math.pow(Math.max(0, 1 - (t - 0.55) / 0.45), 0.8)) * w * 0.46 * step * 0.62), cols[i], { cut: true, height: 0.002 + i * 0.0015 }));
  c.line([[w / 2, 0], hub], w * 0.012, stalk, { cut: true, height: 0.006 });
  c.dot(hub[0], hub[1], w * 0.02, stalk);
  return c.done();
}
add('fan', 'ヤシの葉 扇状(ワシントンヤシ)', [1.5, 1.5], (t, s) => fan(t, s, pal(0x3f6e26, 0x4f8030, 0x356020), hex(0x8a9a50)), FROND);
add('fan-dry', 'ヤシの葉 扇状 枯れ', [1.5, 1.5], (t, s) => fan(t, s, pal(0xa08a54, 0xb89c64, 0x86703e), hex(0x7a6844), 1), FROND);

/** Dense opaque foliage for the shaded inside of shrubs and hedges. */
add('foliage-core', '茂みの内側(不透明)', [0.5, 0.5], (tex, seed) => {
  const L = new Layers(tex, hex(0x1c3414), 0.85);
  const leaf = tex.cells(0.04, seed);
  const clump = tex.noise(0.15, 0.15, seed + 1, 3);
  tex.map((x, y, k) => {
    const cl = leaf(x, y);
    const m = (0.5 + cl.id * 0.5) * (0.55 + 0.45 * sstep(0, 0.25, cl.f2 - cl.f1)) * (0.8 + clump(x, y) * 0.3);
    L.r[k] = 0.13 * m;
    L.g[k] = 0.24 * m;
    L.b[k] = 0.09 * m;
    L.height[k] = cl.id * 0.008;
    return 0;
  });
  return L.finish();
}, { tile: 'xy', density: 256 });

export const PLANT_TEXTURES: readonly TextureSpec[] = list;
