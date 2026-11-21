import { Field, Layers, RGB, Rand, Tex, TextureData, clamp01, fbm, hash2, lerp, sstep } from './core';

type Pt = [number, number];

/** Wandering line across the whole tile that meets itself at the tile border. */
function wander(tex: Tex, rnd: Rand, vertical: boolean, amp: number, wave = 0.7): Pt[] {
  const L = vertical ? tex.mh : tex.mw;
  const W = vertical ? tex.mw : tex.mh;
  const c = rnd.range(0, W);
  const seed = rnd.int(1, 1e6);
  const k = Math.max(2, Math.round(L / wave));
  const n = Math.ceil(L / 0.04);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    const off = c + amp * fbm((s / L) * k, 0.5, k, 1, seed, 3);
    pts.push(vertical ? [off, s] : [s, off]);
  }
  return pts;
}

function part(pts: Pt[], rnd: Rand, minShare: number): Pt[] {
  const share = rnd.range(minShare, 1);
  if (share > 0.95) return pts;
  const n = Math.floor(pts.length * share);
  const a = rnd.int(0, pts.length - n);
  return pts.slice(a, a + n);
}

/** Dark blotches with soft edges. */
function blotches(tex: Tex, rnd: Rand, count: number, rMin: number, rMax: number, stretch = 1): Field {
  const f = tex.field();
  for (let i = 0; i < count; i++) {
    const cx = rnd.range(0, tex.mw);
    const cy = rnd.range(0, tex.mh);
    const r = rnd.range(rMin, rMax);
    const sy = r * rnd.range(1, stretch);
    const v = rnd.range(0.4, 1);
    tex.sdf(f, cx - r, cy - sy, cx + r, cy + sy, (x, y) => (Math.hypot((x - cx) / r, (y - cy) / sy) - 1) * r, v, r * 1.2);
  }
  return f;
}

export interface AsphaltOpts {
  seed: number;
  /** 0 = freshly laid and black, 1 = old and grey. */
  age: number;
  /** The tile is one lane wide (x across): oil drip line and wheel paths. */
  lane?: boolean;
  /** Long cracks, 0..1. */
  cracks?: number;
  /** Share of the surface with alligator cracking, 0..1. */
  alligator?: number;
  /** Share of the long cracks sealed with tar, 0..1. */
  sealed?: number;
  /** Number of repair patches. */
  patches?: number;
  /** Utility trench cut across the road. */
  trench?: boolean;
  /** Oil stains, 0..1. */
  stains?: number;
  /** Stone size, 1 = normal. */
  coarse?: number;
  /** Coloured surfacing (bus or bike lanes) and how worn it is. */
  coat?: { color: RGB; wear: number };
}

export function asphalt(tex: Tex, o: AsphaltOpts): TextureData {
  const rnd = new Rand(o.seed);
  const age = o.age;
  const base = lerp(0.07, 0.3, age);
  const L = new Layers(tex, [base * 1.03, base, base * 0.96], 0.93);
  const stones = tex.cells(0.013 * (o.coarse ?? 1), o.seed);
  const mottle = tex.noise(0.9, 0.9, o.seed + 1, 3);
  const mid = tex.noise(0.12, 0.12, o.seed + 2, 2);
  const streak = tex.noise(0.22, 2.6, o.seed + 3, 2);
  const oilWave = tex.noise(4, 0.9, o.seed + 4, 2);
  const contrast = lerp(0.35, 1.0, age);
  const tone = tex.field(1);
  // Larger chips that show as the binder wears off, areas losing stones, and broad tonal zones.
  const chips = tex.cells(0.026 * (o.coarse ?? 1), o.seed + 20);
  const zone = tex.noise(2.3, 2.3, o.seed + 21, 2);
  const ravelArea = tex.noise(0.8, 0.8, o.seed + 22, 3);
  const drag = tex.noise(0.05, 3.5, o.seed + 23, 2);
  const edge = tex.noise(0.09, 0.09, o.seed + 24, 2);

  // Newer or older asphalt in repair patches.
  const patch = tex.field();
  const seal = tex.field();
  const patchTone: { mask: Field; factor: number }[] = [];
  for (let i = 0; i < (o.patches ?? 0); i++) {
    const w = rnd.range(0.5, 1.8);
    const h = rnd.range(0.5, 2.4);
    const x = rnd.range(0, tex.mw);
    const y = rnd.range(0, tex.mh);
    const m = tex.field();
    // Hand-cut edges are never quite straight.
    tex.sdf(m, x - 0.1, y - 0.1, x + w + 0.1, y + h + 0.1, (px, py) => Math.max(Math.abs(px - x - w / 2) - w / 2, Math.abs(py - y - h / 2) - h / 2) + edge(px, py) * 0.018, 1, 0.012);
    patchTone.push({ mask: m, factor: rnd.chance(0.7) ? rnd.range(0.6, 0.85) : rnd.range(1.1, 1.25) });
    if (rnd.chance(0.4)) {
      const sw = rnd.range(0.008, 0.016);
      const ph = rnd.range(0, 6);
      tex.stroke(seal, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], (t) => sw * (0.6 + 0.5 * Math.sin(t * 31 + ph)));
    }
    for (let k = 0; k < tex.n; k++) patch[k] = Math.max(patch[k], m[k]);
  }
  if (o.trench) {
    const y = rnd.range(0.2, tex.mh - 1);
    const w = rnd.range(0.45, 0.8);
    const edge = tex.noise(0.5, 1, o.seed + 9, 2);
    const m = tex.field();
    tex.sdf(m, 0, y - 0.1, tex.mw, y + w + 0.1, (px, py) => Math.abs(py - y - w / 2) - w / 2 - edge(px, py) * 0.02, 1, 0.012);
    patchTone.push({ mask: m, factor: rnd.range(0.5, 0.7) });
    tex.stroke(seal, [[0, y], [tex.mw, y]], 0.014);
    tex.stroke(seal, [[0, y + w], [tex.mw, y + w]], 0.014);
    for (let k = 0; k < tex.n; k++) patch[k] = Math.max(patch[k], m[k]);
  }
  for (const p of patchTone) for (let k = 0; k < tex.n; k++) tone[k] *= lerp(1, p.factor, p.mask[k]);

  const alli = o.alligator ? tex.cells(0.085, o.seed + 5) : null;
  const alliArea = tex.noise(1.3, 1.3, o.seed + 6, 2);
  const alliTh = lerp(0.55, -0.35, o.alligator ?? 0);

  tex.map((x, y, k) => {
    const c = stones(x, y);
    const gap = sstep(0.02, 0.3, c.f2 - c.f1);
    // Stones lose their binder film with age and traffic: old asphalt shows pale stones in a dark matrix.
    const ravel = sstep(0.15, 0.6, ravelArea(x, y) + (age - 0.6)) * age;
    const stone = (c.id - 0.5) * contrast * (0.7 + ravel * 0.5) * gap - (1 - gap) * lerp(0.3, 0.2, age);
    const grain = (hash2(k, 7, o.seed) - 0.5) * 0.1;
    const ch = chips(x, y);
    const chip = sstep(lerp(0.9, 0.6, age) - ravel * 0.15, 1, ch.id) * sstep(0.04, 0.22, ch.f2 - ch.f1);
    let m = 1 + stone + grain + chip * lerp(0.3, 0.75, age) + mottle(x, y) * 0.14 + mid(x, y) * 0.06 + zone(x, y) * 0.09 + drag(x, y) * 0.035 + ravel * 0.1;
    let h = gap * 0.0011 * (0.5 + c.id) + chip * 0.0008;
    let rough = 0.93 - chip * 0.12;
    // Pits where stones have come loose.
    const pit = ravel * sstep(0.8, 0.95, hash2(Math.floor(ch.id * 8192), 5, o.seed)) * sstep(0.03, 0.12, ch.f2 - ch.f1);
    m *= 1 - pit * 0.55;
    h -= pit * 0.004;
    // Stones are not all the same grey: some warm, some bluish.
    const warm = ((hash2(Math.floor(c.id * 4096), 11, o.seed) - 0.5) * 0.12 + chip * 0.05) * gap * lerp(0.4, 1, age);
    if (o.lane) {
      const u = x / tex.mw - 0.5;
      m *= 1 + streak(x, y) * 0.07;
      const oil = Math.exp(-(u * u) / 0.012) * (0.6 + 0.4 * oilWave(x, y)) * lerp(0.1, 0.3, age);
      const wheel = Math.exp(-((Math.abs(u) - 0.25) ** 2) / 0.006);
      m *= 1 - oil + wheel * lerp(0.05, 0.1, age);
      rough -= oil * 0.5 + wheel * 0.07;
    }
    if (alli) {
      const area = sstep(alliTh, alliTh + 0.25, alliArea(x, y));
      if (area > 0) {
        const a = alli(x, y);
        const line = (1 - sstep(0.02, 0.09, a.f2 - a.f1)) * area;
        m *= 1 - line * 0.6 + area * 0.06 * (a.id - 0.5);
        h -= line * 0.004;
      }
    }
    m *= tone[k];
    L.r[k] *= m * (1 + warm);
    L.g[k] *= m * (1 + warm * 0.3);
    L.b[k] *= m * (1 - warm);
    L.height[k] = h + patch[k] * 0.003;
    L.rough[k] = rough;
    return 0;
  });

  if (o.coat) {
    const worn = tex.noise(0.12, 0.5, o.seed + 11, 3);
    const m = tex.map((x, y, k) => {
      const c = stones(x, y);
      const lane = o.lane ? Math.exp(-((Math.abs(x / tex.mw - 0.5) - 0.25) ** 2) / 0.008) * 0.5 : 0;
      return clamp01((1.25 - o.coat!.wear * (1 + worn(x, y) * 0.9 + c.id * 1.1 + lane)) * 3) * (1 - patch[k]);
    });
    L.paint(m, (k) => [o.coat!.color[0] * (0.85 + hash2(k, 3, o.seed) * 0.3), o.coat!.color[1] * (0.85 + hash2(k, 3, o.seed) * 0.3), o.coat!.color[2] * (0.85 + hash2(k, 3, o.seed) * 0.3)], { rough: 0.8, opacity: 0.92 });
  }

  // Long cracks, some of them sealed with tar.
  const crack = tex.field();
  const halo = tex.field();
  const count = Math.round((o.cracks ?? 0) * 7);
  for (let i = 0; i < count; i++) {
    const line = part(wander(tex, rnd, rnd.chance(0.6), rnd.range(0.05, 0.3), rnd.range(0.4, 1)), rnd, 0.35);
    if (rnd.chance(o.sealed ?? 0)) {
      const w = rnd.range(0.014, 0.03);
      const ws = rnd.range(0, 6);
      tex.stroke(seal, line, (t) => w * (0.8 + 0.14 * Math.sin(t * 40 + ws) + 0.1 * Math.sin(t * 97 + ws * 2)));
    } else {
      const cw = rnd.range(0.003, 0.008);
      const cp = rnd.range(0, 6);
      // Cracks open and close along their length; fines wash out and bleach the edges.
      tex.stroke(crack, line, (t) => cw * (0.35 + 0.65 * Math.abs(Math.sin(t * 19 + cp)) + 0.3 * Math.sin(t * 71 + cp)));
      tex.stroke(halo, line, (t) => cw * (4 + 3 * Math.sin(t * 13 + cp)));
      if (rnd.chance(0.5)) {
        const a = rnd.int(0, line.length - 1);
        const [bx, by] = line[a];
        const dir = rnd.range(0, Math.PI * 2);
        const branch: Pt[] = [];
        for (let s = 0; s < rnd.int(6, 20); s++) branch.push([bx + Math.cos(dir) * s * 0.04 + rnd.range(-0.01, 0.01) * s, by + Math.sin(dir) * s * 0.04 + rnd.range(-0.01, 0.01) * s]);
        if (branch.length > 1) tex.stroke(crack, branch, 0.003);
      }
    }
  }
  const haloTone = lerp(1.25, 1.12, age);
  tex.map((x, y, k) => {
    const a = halo[k] * (0.5 + 0.5 * edge(x, y)) * 0.6;
    if (a > 0) {
      L.r[k] *= lerp(1, haloTone, a);
      L.g[k] *= lerp(1, haloTone, a);
      L.b[k] *= lerp(1, haloTone * 0.97, a);
    }
    // Ragged edges instead of a ruled line.
    crack[k] = clamp01(crack[k] * (1.15 + edge(x * 3, y * 3) * 0.6));
    seal[k] = clamp01(seal[k] * (1.1 + edge(x * 2, y * 2) * 0.35));
    return 0;
  });
  L.paint(crack, [base * 0.25, base * 0.24, base * 0.23], { height: -0.006, rough: 0.97 });
  // Fresh tar is black and glossy; it greys and dulls with age.
  const tar = lerp(0.03, 0.085, age);
  L.paint(seal, [tar, tar, tar * 1.08], { height: 0.0012, rough: lerp(0.35, 0.6, age), opacity: 0.94 });

  if (o.stains) {
    const oil = blotches(tex, rnd, Math.round(o.stains * 14), 0.04, 0.28, 1.8);
    // Soaked into the texture of the surface: broken edges and a darker core, not a soft blob.
    const soak = tex.noise(0.06, 0.06, o.seed + 25, 3);
    tex.map((x, y, k) => {
      const m = clamp01((oil[k] * (0.85 + soak(x, y) * 0.75) - 0.16) * 2.4) * (0.35 + 0.3 * oil[k]);
      L.r[k] *= 1 - m;
      L.g[k] *= 1 - m;
      L.b[k] *= 1 - m * 0.93;
      L.rough[k] -= m * 0.5;
      return 0;
    });
  }
  return L.finish();
}

export interface ConcreteOpts {
  seed: number;
  color?: RGB;
  /** Slab size in metres; 0 = no joints on that axis. */
  slab?: readonly [number, number];
  /** Every second row is shifted by half a slab. */
  staggered?: boolean;
  joint?: 'tooled' | 'sawcut' | 'expansion';
  finish?: 'broom' | 'smooth' | 'tined' | 'exposed' | 'boards' | 'formwork';
  dirt?: number;
  cracks?: number;
  /** Chewing gum spots per square metre. */
  gum?: number;
  stains?: number;
  /** Dark streaks running down (for walls and barriers). */
  streaks?: number;
  /** Black tyre scuffs along the bottom. */
  scuffs?: number;
}

export function concreteLayers(tex: Tex, o: ConcreteOpts): Layers {
  const rnd = new Rand(o.seed);
  const col = o.color ?? [0.63, 0.61, 0.57];
  const L = new Layers(tex, col, 0.88);
  const [sw, sh] = o.slab ?? [0, 0];
  const mottle = tex.noise(0.6, 0.6, o.seed + 1, 3);
  const cloud = tex.noise(2.2, 2.2, o.seed + 2, 2);
  const pores = tex.cells(0.022, o.seed + 3);
  const finish = o.finish ?? 'broom';
  const broom = tex.noise(1.2, 0.005, o.seed + 4);
  const tine = tex.noise(1.5, 0.019, o.seed + 4);
  const pebbles = tex.cells(0.012, o.seed + 5);
  const dirtN = tex.noise(1.4, 1.4, o.seed + 6, 3);
  const streakN = tex.noise(0.07, 1.6, o.seed + 7, 2);
  const boards = tex.noise(2.5, 0.012, o.seed + 8, 2);
  const dirt = o.dirt ?? 0.3;
  const jointW = o.joint === 'expansion' ? 0.011 : o.joint === 'sawcut' ? 0.003 : 0.005;

  tex.map((x, y, k) => {
    let m = 1 + mottle(x, y) * 0.09 + cloud(x, y) * 0.06 + (hash2(k, 11, o.seed) - 0.5) * 0.06;
    let h = 0;
    let rough = 0.88;
    const p = pores(x, y);
    if (p.id > 0.82 && p.f1 < 0.16) {
      m *= 0.72;
      h -= 0.001;
    }
    if (finish === 'broom') {
      const b = broom(x, y);
      h += b * 0.0004;
      m *= 1 + b * 0.035;
    } else if (finish === 'tined') {
      const b = Math.max(0, tine(x, y) - 0.1);
      h -= b * 0.003;
      m *= 1 - b * 0.25;
    } else if (finish === 'exposed') {
      const c = pebbles(x, y);
      const gap = sstep(0.03, 0.3, c.f2 - c.f1);
      m *= 0.8 + (c.id - 0.4) * 0.5 * gap - (1 - gap) * 0.2;
      h += gap * 0.0015;
    } else if (finish === 'smooth') {
      rough = 0.7;
    }
    // Joints.
    let d = 1;
    let slabId = 0;
    if (sw > 0 || sh > 0) {
      const row = sh > 0 ? Math.floor(y / sh) : 0;
      const xs = o.staggered && sw > 0 ? x + (row % 2) * sw * 0.5 : x;
      if (sw > 0) {
        const fx = xs / sw - Math.floor(xs / sw);
        d = Math.min(d, Math.min(fx, 1 - fx) * sw);
      }
      if (sh > 0) {
        const fy = y / sh - row;
        d = Math.min(d, Math.min(fy, 1 - fy) * sh);
      }
      slabId = hash2(sw > 0 ? Math.floor(xs / sw) % Math.round(tex.mw / sw) : 0, sh > 0 ? row % Math.round(tex.mh / sh) : 0, o.seed + 13);
      m *= 1 + (slabId - 0.5) * 0.11;
      const groove = 1 - sstep(jointW * 0.5, jointW * 1.6, d);
      const edge = o.joint === 'sawcut' ? 0 : (1 - sstep(jointW, 0.035, d)) * (1 - groove);
      m *= 1 - groove * (o.joint === 'expansion' ? 0.8 : 0.55) + edge * 0.05;
      h -= groove * 0.006 + edge * 0.0012;
      rough -= edge * 0.1;
      m *= 1 - (1 - sstep(0, 0.09, d)) * dirt * 0.22;
    }
    if (finish === 'boards') {
      const bw = 0.15;
      const fy = y / bw - Math.floor(y / bw);
      const line = 1 - sstep(0.01, 0.05, Math.min(fy, 1 - fy));
      const tone = hash2(Math.floor(y / bw), 5, o.seed) - 0.5;
      m *= 1 + tone * 0.1 + boards(x, y) * 0.07 - line * 0.2;
      h += tone * 0.002 - line * 0.002 + boards(x, y) * 0.0006;
    } else if (finish === 'formwork') {
      // Tie holes in a regular pattern.
      const hx = (x % 0.6) - 0.3;
      const hy = (y % 0.6) - 0.3;
      const hole = 1 - sstep(0.012, 0.018, Math.hypot(hx, hy));
      m *= 1 - hole * 0.5;
      h -= hole * 0.008;
    }
    const dn = sstep(-0.1, 0.6, dirtN(x, y)) * dirt;
    let r = col[0] * m * (1 - dn * 0.3);
    let g = col[1] * m * (1 - dn * 0.34);
    let b = col[2] * m * (1 - dn * 0.42);
    if (o.streaks) {
      const top = y / tex.mh;
      const s = sstep(0.05, 0.6, streakN(x, y)) * o.streaks * (0.35 + 0.65 * top);
      r *= 1 - s * 0.5;
      g *= 1 - s * 0.48;
      b *= 1 - s * 0.45;
    }
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.height[k] = h;
    L.rough[k] = rough;
    return 0;
  });

  const crack = tex.field();
  for (let i = 0; i < Math.round((o.cracks ?? 0) * 6); i++) tex.stroke(crack, part(wander(tex, rnd, rnd.chance(0.5), rnd.range(0.05, 0.25), rnd.range(0.3, 0.8)), rnd, 0.3), rnd.range(0.0015, 0.004));
  L.paint(crack, [col[0] * 0.3, col[1] * 0.3, col[2] * 0.3], { height: -0.004 });

  if (o.stains) {
    const st = blotches(tex, rnd, Math.round(o.stains * 3 * tex.mw * tex.mh), 0.05, 0.4, 2.5);
    for (let k = 0; k < tex.n; k++) {
      const m = st[k] * 0.3;
      L.r[k] *= 1 - m;
      L.g[k] *= 1 - m * 1.02;
      L.b[k] *= 1 - m * 1.08;
    }
  }
  if (o.gum) {
    const gum = tex.field();
    const pale = tex.field();
    for (let i = 0; i < Math.round(o.gum * tex.mw * tex.mh); i++) {
      const r = rnd.range(0.009, 0.022);
      tex.disc(rnd.chance(0.75) ? gum : pale, rnd.range(0, tex.mw), rnd.range(0, tex.mh), r, rnd.range(0.6, 1), 0.006);
    }
    L.paint(gum, [0.13, 0.13, 0.13], { rough: 0.6, height: 0.0008, opacity: 0.85 });
    L.paint(pale, [0.75, 0.73, 0.7], { rough: 0.6, height: 0.0008, opacity: 0.6 });
  }
  if (o.scuffs) {
    const sc = tex.field();
    for (let i = 0; i < Math.round(o.scuffs * 10); i++) {
      const y = rnd.range(0.12, 0.5) * tex.mh;
      const x = rnd.range(0, tex.mw);
      const len = rnd.range(0.3, 1.4);
      tex.sdf(sc, x, y - 0.04, x + len, y + 0.04, (px, py) => Math.max(Math.abs(px - x - len / 2) - len / 2, Math.abs(py - y - (px - x) * 0.03) - 0.012), rnd.range(0.4, 0.9), 0.03);
    }
    L.paint(sc, [0.06, 0.06, 0.06], { rough: 0.7, opacity: 0.8 });
  }
  return L;
}

export const concrete = (tex: Tex, o: ConcreteOpts): TextureData => concreteLayers(tex, o).finish();

export type Bond = 'running' | 'stack' | 'herringbone' | 'basket' | 'setts' | 'slabs';

export interface PaverOpts {
  seed: number;
  bond: Bond;
  /** Short side of a paver in metres; the long side is twice that. */
  unit: number;
  colors: readonly RGB[];
  joint?: RGB;
  jointWidth?: number;
  /** Brightness variation between pavers, 0..1. */
  variation?: number;
  dirt?: number;
  /** Moss in the joints, 0..1. */
  moss?: number;
  gum?: number;
  /** Rounded tops (cobbles) instead of flat ones. */
  domed?: boolean;
}

/** Which paver a point belongs to and how far it is from that paver's edge. */
function paverAt(bond: Bond, x: number, y: number, W: number, seed: number, period: number, out: { d: number; ix: number; iy: number }): void {
  const u = x / W;
  const v = y / W;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  let lx: number;
  let ly: number;
  let w = 2;
  let h = 1;
  let ix = i;
  let iy = j;
  if (bond === 'stack') {
    lx = fu + (((i % 2) + 2) % 2);
    ly = fv;
    ix = i - (((i % 2) + 2) % 2);
  } else if (bond === 'running') {
    const s = u + (((j % 2) + 2) % 2);
    const si = Math.floor(s);
    const odd = ((si % 2) + 2) % 2;
    lx = s - si + odd;
    ly = fv;
    ix = si - odd;
  } else if (bond === 'herringbone') {
    const m = (((i - j) % 4) + 4) % 4;
    if (m === 0 || m === 1) {
      lx = fu + m;
      ly = fv;
      ix = i - m;
    } else {
      w = 1;
      h = 2;
      lx = fu;
      ly = fv + (m === 2 ? 1 : 0);
      iy = j - (m === 2 ? 1 : 0);
    }
  } else if (bond === 'basket') {
    const bi = Math.floor(i / 2);
    const bj = Math.floor(j / 2);
    if ((((bi + bj) % 2) + 2) % 2 === 0) {
      lx = u - bi * 2;
      ly = fv;
      ix = bi * 2;
    } else {
      w = 1;
      h = 2;
      lx = fu;
      ly = v - bj * 2;
      iy = bj * 2;
    }
  } else if (bond === 'setts') {
    // Rows of roughly square stones with uneven widths.
    const off = hash2(j % period, 3, seed) * 1.3;
    const s = u + off;
    const si = Math.floor(s);
    w = 1;
    lx = s - si;
    ly = fv;
    ix = si;
  } else {
    // Large slabs of random length in rows two units high.
    const rj = Math.floor(v / 2);
    const s = (u + hash2(rj % period, 9, seed) * 3) / 3;
    const si = Math.floor(s);
    w = 3;
    h = 2;
    lx = (s - si) * 3;
    ly = v - rj * 2;
    ix = si;
    iy = rj;
  }
  out.d = Math.min(lx, w - lx, ly, h - ly) * W;
  out.ix = ix;
  out.iy = iy;
}

export function pavers(tex: Tex, o: PaverOpts): TextureData {
  const rnd = new Rand(o.seed);
  const W = o.unit;
  const jw = o.jointWidth ?? 0.004;
  const joint = o.joint ?? [0.2, 0.18, 0.15];
  const L = new Layers(tex, [0.5, 0.5, 0.5], 0.85);
  const mottle = tex.noise(0.4, 0.4, o.seed + 1, 3);
  const dirtN = tex.noise(1.2, 1.2, o.seed + 2, 3);
  const mossN = tex.noise(0.5, 0.5, o.seed + 3, 2);
  const wob = tex.noise(0.07, 0.07, o.seed + 4, 2);
  const variation = o.variation ?? 0.5;
  const dirt = o.dirt ?? 0.3;
  const period = Math.max(1, Math.round(tex.mh / W));
  const pu = Math.max(1, Math.round(tex.mw / W));
  const at = { d: 0, ix: 0, iy: 0 };
  const rough = o.bond === 'setts';
  tex.map((x, y, k) => {
    paverAt(o.bond, x, y, W, o.seed, period, at);
    const id = hash2(((at.ix % pu) + pu) % pu, ((at.iy % period) + period) % period, o.seed);
    const id2 = hash2(((at.ix % pu) + pu) % pu, ((at.iy % period) + period) % period, o.seed + 77);
    const d = at.d + (rough ? wob(x, y) * 0.006 : 0);
    const c = o.colors[Math.floor(id2 * o.colors.length) % o.colors.length];
    const g = 1 - sstep(jw * 0.5, jw * 1.5, d);
    const bevel = sstep(0, o.domed ? W * 0.35 : 0.007, d);
    let m = 1 + (id - 0.5) * 0.36 * variation + mottle(x, y) * 0.1 + (hash2(k, 5, o.seed) - 0.5) * 0.07;
    m *= 0.86 + 0.14 * bevel;
    const dn = sstep(-0.2, 0.6, dirtN(x, y)) * dirt;
    m *= 1 - dn * 0.3 - (1 - sstep(0, 0.02, d)) * dirt * 0.2;
    let r = lerp(c[0] * m, joint[0], g);
    let gg = lerp(c[1] * m, joint[1], g);
    let b = lerp(c[2] * m, joint[2], g);
    if (o.moss) {
      const ms = (1 - sstep(0, 0.012, d)) * sstep(0.1 - o.moss * 0.6, 0.5, mossN(x, y)) * o.moss;
      r = lerp(r, 0.2, ms);
      gg = lerp(gg, 0.3, ms);
      b = lerp(b, 0.1, ms);
    }
    L.r[k] = r;
    L.g[k] = gg;
    L.b[k] = b;
    L.height[k] = bevel * (o.domed ? 0.012 : 0.004) * (0.85 + id * 0.3) - g * 0.003 + (rough ? wob(x, y) * 0.002 : 0);
    L.rough[k] = lerp(0.82, 0.95, g);
    return 0;
  });
  if (o.gum) {
    const gum = tex.field();
    for (let i = 0; i < Math.round(o.gum * tex.mw * tex.mh); i++) tex.disc(gum, rnd.range(0, tex.mw), rnd.range(0, tex.mh), rnd.range(0.009, 0.02), rnd.range(0.6, 1), 0.006);
    L.paint(gum, [0.12, 0.12, 0.12], { rough: 0.6, opacity: 0.85 });
  }
  return L.finish();
}

/** Tactile paving: truncated domes or guiding bars. */
export function tactile(tex: Tex, o: { seed: number; color: RGB; bars?: boolean; wear?: number }): TextureData {
  const L = new Layers(tex, o.color, 0.75);
  const mottle = tex.noise(0.3, 0.3, o.seed, 3);
  const wear = o.wear ?? 0.3;
  const pitch = o.bars ? 0.075 : 0.06;
  tex.map((x, y, k) => {
    const fx = (x % pitch) / pitch - 0.5;
    const fy = (y % pitch) / pitch - 0.5;
    const d = o.bars ? Math.abs(fx) * pitch : Math.hypot(fx, fy) * pitch;
    const dome = 1 - sstep(0.011, 0.017, d);
    const tile = Math.min(Math.min(x % 0.3, 0.3 - (x % 0.3)), Math.min(y % 0.3, 0.3 - (y % 0.3)));
    const groove = 1 - sstep(0.001, 0.004, tile);
    const dirtv = (0.5 + mottle(x, y)) * wear;
    const m = (1 + mottle(x, y) * 0.12 + (hash2(k, 2, o.seed) - 0.5) * 0.06) * (1 - (1 - dome) * dirtv * 0.35 - groove * 0.5) * (1 + dome * wear * 0.25);
    L.r[k] *= m;
    L.g[k] *= m;
    L.b[k] *= m * (1 + dome * wear * 0.4);
    L.height[k] = dome * 0.005 - groove * 0.003;
    return 0;
  });
  return L.finish();
}

/**
 * Kerb stone strip, x along the kerb. The lower half of the tile is the vertical face, the upper half
 * the top. Painted kerbs (red, yellow, ...) chip and wear down to the concrete.
 */
export function curb(tex: Tex, o: { seed: number; paint?: RGB; wear?: number; granite?: boolean; dirt?: number }): TextureData {
  const L = concreteLayers(tex, {
    seed: o.seed,
    color: o.granite ? [0.56, 0.56, 0.58] : [0.66, 0.64, 0.6],
    slab: [o.granite ? 1 : 2, 0],
    joint: o.granite ? 'expansion' : 'tooled',
    finish: o.granite ? 'exposed' : 'smooth',
    dirt: o.dirt ?? 0.4,
    stains: 0.6,
  });
  const grime = tex.noise(0.5, 0.2, o.seed + 20, 3);
  const chip = tex.noise(0.06, 0.06, o.seed + 21, 3);
  const big = tex.noise(0.7, 0.3, o.seed + 22, 2);
  const paint = tex.field();
  tex.map((x, y, k) => {
    const v = y / tex.mh;
    // Dirt gathers at the foot of the face; tyres rub the top edge.
    const foot = (1 - sstep(0, 0.22, v)) * (0.5 + grime(x, y) * 0.5);
    const edge = Math.exp(-((v - 0.5) ** 2) / 0.003);
    const m = 1 - foot * 0.45 - edge * 0.1 * (0.5 + grime(x, y));
    L.r[k] *= m;
    L.g[k] *= m;
    L.b[k] *= m;
    L.height[k] -= edge * 0.002;
    if (o.paint) paint[k] = clamp01(1.2 - (o.wear ?? 0.3) * (1.1 + chip(x, y) * 2.2 + big(x, y) * 1.5 + edge * 1.2 + foot)) > 0.5 ? 1 : 0;
    return 0;
  });
  if (o.paint) {
    const soft = tex.blur(paint, tex.px * 0.8, 1);
    L.paint(soft, (k) => {
      const s = 0.82 + hash2(k, 4, o.seed) * 0.2;
      return [o.paint![0] * s, o.paint![1] * s, o.paint![2] * s];
    }, { rough: 0.55, height: 0.0004, opacity: 0.96 });
  }
  return L.finish();
}

export function grass(tex: Tex, o: { seed: number; dry?: number; bare?: number; mown?: boolean }): TextureData {
  const L = new Layers(tex, [0.2, 0.33, 0.1], 0.95);
  const blades = tex.cells(0.012, o.seed);
  const tuft = tex.noise(0.09, 0.09, o.seed + 1, 2);
  const tone = tex.noise(0.7, 0.7, o.seed + 2, 3);
  const dryN = tex.noise(1.1, 1.1, o.seed + 3, 3);
  const bareN = tex.noise(0.8, 0.8, o.seed + 4, 3);
  const stripe = tex.noise(0.5, 4, o.seed + 5);
  const dry = o.dry ?? 0;
  const bare = o.bare ?? 0;
  tex.map((x, y, k) => {
    const c = blades(x, y);
    const t = tone(x, y);
    const d = clamp01(dry * 1.3 + dryN(x, y) * dry * 1.5 + (c.id - 0.5) * 0.5 * dry);
    let r = lerp(0.16 + t * 0.05, 0.56, d);
    let g = lerp(0.31 + t * 0.07, 0.5, d);
    let b = lerp(0.08, 0.27, d);
    const m = 0.72 + c.id * 0.5 + tuft(x, y) * 0.22 - sstep(0.5, 0, c.f2 - c.f1) * 0.25 + (o.mown ? stripe(x, y) * 0.08 : 0);
    r *= m;
    g *= m;
    b *= m;
    const e = sstep(0.55 - bare * 0.9, 0.75 - bare * 0.7, bareN(x, y) + (c.id - 0.5) * 0.25);
    const soil = 0.85 + (hash2(k, 1, o.seed) - 0.5) * 0.3;
    L.r[k] = lerp(r, 0.34 * soil, e);
    L.g[k] = lerp(g, 0.27 * soil, e);
    L.b[k] = lerp(b, 0.19 * soil, e);
    L.height[k] = (tuft(x, y) * 0.006 + c.id * 0.004) * (1 - e * 0.8);
    return 0;
  });
  return L.finish(0.6);
}

/** Loose stones: gravel shoulders, ballast, mulch (flat chips) or sand (very fine). */
export function gravel(tex: Tex, o: { seed: number; size: number; colors: readonly RGB[]; soil?: RGB; cover?: number }): TextureData {
  const L = new Layers(tex, o.soil ?? [0.3, 0.26, 0.2], 0.95);
  const stones = tex.cells(o.size, o.seed);
  const tone = tex.noise(0.8, 0.8, o.seed + 1, 3);
  const cover = o.cover ?? 1;
  const soil = o.soil ?? [0.3, 0.26, 0.2];
  tex.map((x, y, k) => {
    const c = stones(x, y);
    const top = sstep(0.0, 0.5, c.f2 - c.f1);
    const col = o.colors[Math.floor(c.id * 997) % o.colors.length];
    const present = hash2(Math.floor(c.id * 65536), 9, o.seed) < cover ? 1 : 0;
    const m = (0.7 + ((c.id * 37) % 1) * 0.55) * (0.6 + 0.4 * top) * (1 + tone(x, y) * 0.12) * (1 + (hash2(k, 6, o.seed) - 0.5) * 0.08);
    const s = top * present;
    const sm = (1 + tone(x, y) * 0.2) * (0.9 + hash2(k, 8, o.seed) * 0.2);
    L.r[k] = lerp(soil[0] * sm * 0.8, col[0] * m, s);
    L.g[k] = lerp(soil[1] * sm * 0.8, col[1] * m, s);
    L.b[k] = lerp(soil[2] * sm * 0.8, col[2] * m, s);
    L.height[k] = s * o.size * 0.35 * (1 - c.f1);
    return 0;
  });
  return L.finish(0.8);
}

export interface MetalOpts {
  seed: number;
  /** Paint colour; leave out for bare galvanised steel. */
  paint?: RGB;
  rust?: number;
  /** Rows of rivets every `rivets` metres. */
  rivets?: number;
  /** Weathering steel: rust is the finish. */
  corten?: boolean;
  streaks?: number;
}

export function metal(tex: Tex, o: MetalOpts): TextureData {
  const rnd = new Rand(o.seed);
  const bare: RGB = [0.62, 0.64, 0.66];
  const L = new Layers(tex, o.paint ?? bare, o.paint ? 0.5 : 0.42);
  const spangle = tex.cells(0.025, o.seed);
  const tone = tex.noise(0.5, 0.5, o.seed + 1, 3);
  const rustN = tex.noise(0.25, 0.25, o.seed + 2, 4, 0.6);
  const rustFine = tex.noise(0.03, 0.03, o.seed + 3, 2);
  const streakN = tex.noise(0.05, 1.3, o.seed + 4, 2);
  const rust = o.corten ? 1 : (o.rust ?? 0);
  const rivet = tex.field();
  if (o.rivets) {
    for (let y = o.rivets / 2; y < tex.mh; y += o.rivets) for (let x = 0.04; x < tex.mw; x += 0.08) tex.disc(rivet, x, y, 0.011, 1, 0.004);
  }
  void rnd;
  tex.map((x, y, k) => {
    const c = spangle(x, y);
    let r: number;
    let g: number;
    let b: number;
    let metalness = 0;
    let rough: number;
    if (o.paint) {
      const m = 1 + tone(x, y) * 0.08 + (hash2(k, 3, o.seed) - 0.5) * 0.03;
      r = o.paint[0] * m;
      g = o.paint[1] * m;
      b = o.paint[2] * m;
      rough = 0.5;
    } else {
      const m = 0.9 + (c.id - 0.5) * 0.16 + tone(x, y) * 0.07;
      r = bare[0] * m;
      g = bare[1] * m;
      b = bare[2] * m;
      metalness = 0.85;
      rough = 0.45 + c.id * 0.12;
    }
    const near = rivet[k];
    const rv = clamp01(sstep(1.05 - rust * 0.75, 1.15 - rust * 0.7, rustN(x, y) * 0.9 + 0.5 + near * 0.2) + (o.corten ? 1 : 0));
    if (rv > 0) {
      const f = 0.75 + rustFine(x, y) * 0.35 + tone(x, y) * 0.2;
      r = lerp(r, 0.36 * f, rv);
      g = lerp(g, 0.17 * f, rv);
      b = lerp(b, 0.08 * f, rv);
      rough = lerp(rough, 0.92, rv);
      metalness *= 1 - rv;
    }
    if (o.streaks) {
      const s = sstep(0.1, 0.7, streakN(x, y)) * o.streaks;
      r *= 1 - s * 0.35;
      g *= 1 - s * 0.4;
      b *= 1 - s * 0.45;
    }
    L.r[k] = r;
    L.g[k] = g;
    L.b[k] = b;
    L.rough[k] = rough;
    L.metal[k] = metalness;
    L.height[k] = near * 0.004 + rv * rustFine(x, y) * 0.0006;
    return 0;
  });
  return L.finish();
}

/** Masonry wall: bricks or cut stone blocks in courses. */
export function masonry(tex: Tex, o: { seed: number; block: readonly [number, number]; colors: readonly RGB[]; mortar?: RGB; rough?: boolean; streaks?: number }): TextureData {
  const [bw, bh] = o.block;
  const L = new Layers(tex, [0.5, 0.5, 0.5], 0.9);
  const mortar = o.mortar ?? [0.55, 0.52, 0.47];
  const mottle = tex.noise(0.25, 0.25, o.seed + 1, 3);
  const face = tex.noise(bw * 0.3, bh * 0.4, o.seed + 2, 3);
  const streakN = tex.noise(0.08, 1.5, o.seed + 3, 2);
  const nx = Math.max(1, Math.round(tex.mw / bw));
  const ny = Math.max(1, Math.round(tex.mh / bh));
  tex.map((x, y, k) => {
    const row = Math.floor(y / bh);
    const s = x / bw + (row % 2) * 0.5;
    const col = Math.floor(s);
    const d = Math.min((s - col) * bw, (1 - (s - col)) * bw, (y / bh - row) * bh, (1 - (y / bh - row)) * bh);
    const id = hash2(col % nx, row % ny, o.seed);
    const c = o.colors[Math.floor(hash2(col % nx, row % ny, o.seed + 5) * o.colors.length) % o.colors.length];
    const jw = o.rough ? 0.012 : 0.006;
    const g = 1 - sstep(jw * 0.6, jw * 1.4, d);
    let m = 1 + (id - 0.5) * 0.3 + mottle(x, y) * 0.12 + (hash2(k, 9, o.seed) - 0.5) * 0.06;
    if (o.streaks) m *= 1 - sstep(0.1, 0.7, streakN(x, y)) * o.streaks * 0.4;
    L.r[k] = lerp(c[0] * m, mortar[0], g);
    L.g[k] = lerp(c[1] * m, mortar[1], g);
    L.b[k] = lerp(c[2] * m, mortar[2], g);
    L.height[k] = (1 - g) * (0.006 + (o.rough ? face(x, y) * 0.012 + id * 0.006 : 0)) * sstep(0, o.rough ? 0.03 : 0.008, d);
    return 0;
  });
  return L.finish();
}

/** Timber deck of boards running along y. */
export function planks(tex: Tex, o: { seed: number; width: number; color: RGB; weathered?: number }): TextureData {
  const L = new Layers(tex, o.color, 0.85);
  const grain = tex.noise(0.006, 0.5, o.seed, 3);
  const wide = tex.noise(0.05, 1.4, o.seed + 1, 2);
  const n = Math.max(1, Math.round(tex.mw / o.width));
  const w = tex.mw / n;
  const grey = o.weathered ?? 0.3;
  const nails = tex.field();
  for (let i = 0; i < n; i++) for (let y = 0.3; y < tex.mh; y += 0.6) for (const fx of [0.25, 0.75]) tex.disc(nails, (i + fx) * w, y, 0.005, 1, 0.002);
  tex.map((x, y, k) => {
    const i = Math.floor(x / w);
    const fx = x / w - i;
    const id = hash2(i, 3, o.seed);
    const off = hash2(i, 4, o.seed) * 3;
    const end = ((y + off) % 3) / 3;
    const d = Math.min(Math.min(fx, 1 - fx) * w, Math.min(end, 1 - end) * 3);
    const gap = 1 - sstep(0.002, 0.006, d);
    const gr = grain(x + id * 7, y) * 0.5 + wide(x, y + id * 5) * 0.5;
    const m = (1 + (id - 0.5) * 0.3 + gr * 0.28) * (1 - gap * 0.85);
    const gy = (o.color[0] + o.color[1] + o.color[2]) / 3;
    L.r[k] = lerp(o.color[0], gy * 1.05, grey) * m;
    L.g[k] = lerp(o.color[1], gy * 1.05, grey) * m;
    L.b[k] = lerp(o.color[2], gy * 1.08, grey) * m;
    L.height[k] = gr * 0.0012 - gap * 0.012 + (id - 0.5) * 0.002 - nails[k] * 0.002;
    return 0;
  });
  L.paint(nails, [0.25, 0.22, 0.2], { metal: 0.6, rough: 0.5 });
  return L.finish();
}
