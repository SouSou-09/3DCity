import { RGB, TextureData, TextureSpec, Tex, hex } from './core';
import { Art, paint } from './trims';

const list: TextureSpec[] = [];
type Gen = (tex: Tex, seed: number) => TextureData;
type Extra = Partial<Pick<TextureSpec, 'tile' | 'density' | 'reflect' | 'emissive' | 'decal' | 'cutout'>>;
function add(id: string, label: string, meters: readonly [number, number], generate: Gen, o: Extra = {}): void {
  const seed = 61000 + list.length * 7;
  list.push({ id: `vehicle/${id}`, label, category: 'vehicle', meters, tile: 'none', decal: false, density: 256, ...o, generate: (tex) => generate(tex, seed) });
}
const shade = (c: RGB, m: number): RGB => [c[0] * m, c[1] * m, c[2] * m];

// Body paint is near white: each car is tinted with its own colour where it stands.
add('paint', '車体塗装', [1, 1], (t, s) => paint(t, s, [0.93, 0.93, 0.93], { rough: 0.22, metal: 0.25, wear: 0.02 }), { tile: 'xy', density: 96, reflect: 0.35 });
add('paint-worn', '車体塗装 古い', [1, 1], (t, s) => paint(t, s, [0.88, 0.87, 0.85], { rough: 0.5, wear: 0.45 }), { tile: 'xy', density: 128 });
add('glass', '車の窓ガラス', [1, 1], (t, s) => {
  const a = new Art(t, [0.05, 0.065, 0.08], 0.05);
  a.rect([0.32, 0.4, 0.5], 0, 0.55, 1, 1, { rough: 0.05, opacity: 0.22, soft: 0.3 });
  return a.done(s, 0.08);
}, { tile: 'x', density: 64, reflect: 0.9 });

/** Where each small part lies in the sheet of parts, in metres: x0, y0, x1, y1. */
export const VEHICLE_PARTS = {
  'wheel-alloy': [0, 0.75, 0.25, 1],
  'wheel-steel': [0.25, 0.75, 0.5, 1],
  'wheel-cap': [0.5, 0.75, 0.75, 1],
  'wheel-truck': [0.75, 0.75, 1, 1],
  'head-rect': [0, 0.6, 0.25, 0.75],
  'head-round': [0.25, 0.6, 0.4, 0.75],
  'head-slim': [0.4, 0.62, 0.7, 0.73],
  'head-twin': [0.7, 0.6, 1, 0.75],
  'tail-rect': [0, 0.45, 0.25, 0.6],
  'tail-tall': [0.25, 0.45, 0.35, 0.6],
  'tail-bar': [0.35, 0.46, 0.7, 0.53],
  'tail-round': [0.7, 0.45, 0.85, 0.6],
  indicator: [0.87, 0.47, 0.98, 0.58],
  'grille-bars': [0, 0.3, 0.35, 0.45],
  'grille-mesh': [0.35, 0.3, 0.7, 0.45],
  'grille-chrome': [0.7, 0.3, 1, 0.45],
  'plate-white': [0, 0.18, 0.24, 0.3],
  'plate-yellow': [0.24, 0.18, 0.48, 0.3],
  'taxi-sign': [0.48, 0.18, 0.78, 0.3],
  lightbar: [0.78, 0.18, 1, 0.3],
  black: [0.03, 0.03, 0.19, 0.15],
  rubber: [0.23, 0.03, 0.39, 0.15],
  chrome: [0.43, 0.03, 0.59, 0.15],
  dark: [0.63, 0.03, 0.79, 0.15],
  seat: [0.83, 0.03, 0.97, 0.15],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type VehiclePart = keyof typeof VEHICLE_PARTS;

add('parts', '車の部品(灯火・ホイール・グリル・ナンバー)', [1, 1], (t, s) => {
  const a = new Art(t, [0.03, 0.03, 0.032], 0.7);
  const P = VEHICLE_PARTS;
  const TYRE: RGB = [0.035, 0.035, 0.037];
  const wheel = (r: readonly [number, number, number, number], kind: number): void => {
    const [cx, cy] = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    const R = (r[2] - r[0]) / 2;
    a.rect([0.02, 0.02, 0.02], r[0], r[1], r[2], r[3], { rough: 0.95 });
    a.disc(TYRE, cx, cy, R * 0.99, { rough: 0.9, height: 0.004 });
    a.put([0.08, 0.08, 0.08], (m) => t.ring(m, cx, cy, R * 0.86, R * 0.012), { rough: 0.8 });
    const rim = R * (kind === 3 ? 0.6 : 0.68);
    if (kind === 0) {
      // Alloy: five spokes over a dark well.
      a.disc([0.62, 0.63, 0.65], cx, cy, rim, { rough: 0.3, metal: 0.9, height: 0.004 });
      a.disc([0.05, 0.05, 0.055], cx, cy, rim * 0.88, { rough: 0.7, metal: 0, height: -0.01 });
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + 0.3;
        a.line([0.66, 0.67, 0.69], [[cx, cy], [cx + Math.cos(ang) * rim * 0.93, cy + Math.sin(ang) * rim * 0.93]], rim * 0.11, { rough: 0.28, metal: 0.9, height: 0.006 });
      }
      a.disc([0.6, 0.61, 0.63], cx, cy, rim * 0.24, { rough: 0.3, metal: 0.9, height: 0.008 });
    } else if (kind === 1) {
      // Pressed steel, black, with its holes and nuts.
      a.disc([0.12, 0.12, 0.125], cx, cy, rim, { rough: 0.55, metal: 0.6, height: 0.003 });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        a.disc([0.02, 0.02, 0.02], cx + Math.cos(ang) * rim * 0.68, cy + Math.sin(ang) * rim * 0.68, rim * 0.1, { rough: 0.9, metal: 0 });
      }
      a.disc([0.2, 0.2, 0.21], cx, cy, rim * 0.3, { rough: 0.5, metal: 0.7, height: 0.006 });
      for (let i = 0; i < 4; i++) a.disc([0.5, 0.5, 0.52], cx + Math.cos(i * 1.5708 + 0.78) * rim * 0.17, cy + Math.sin(i * 1.5708 + 0.78) * rim * 0.17, rim * 0.05, { rough: 0.35, metal: 0.9 });
    } else if (kind === 2) {
      // A plastic cover in silver.
      a.disc([0.6, 0.61, 0.62], cx, cy, rim, { rough: 0.42, metal: 0.5, height: 0.006 });
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        a.line([0.3, 0.3, 0.31], [[cx + Math.cos(ang) * rim * 0.35, cy + Math.sin(ang) * rim * 0.35], [cx + Math.cos(ang) * rim * 0.9, cy + Math.sin(ang) * rim * 0.9]], rim * 0.035, { rough: 0.6, metal: 0.2 });
      }
      a.disc([0.5, 0.51, 0.52], cx, cy, rim * 0.2, { rough: 0.4, metal: 0.5, height: 0.008 });
    } else {
      // A truck's: a deep white steel dish and a hub that stands out.
      a.disc([0.74, 0.74, 0.72], cx, cy, rim, { rough: 0.5, metal: 0.2, height: -0.004 });
      a.disc([0.5, 0.5, 0.49], cx, cy, rim * 0.62, { rough: 0.55, height: -0.01 });
      for (let i = 0; i < 6; i++) a.disc([0.25, 0.25, 0.25], cx + Math.cos(i * 1.047) * rim * 0.45, cy + Math.sin(i * 1.047) * rim * 0.45, rim * 0.07, { rough: 0.5, metal: 0.8 });
      a.disc([0.3, 0.3, 0.3], cx, cy, rim * 0.28, { rough: 0.5, metal: 0.7, height: 0.012 });
    }
  };
  (['wheel-alloy', 'wheel-steel', 'wheel-cap', 'wheel-truck'] as const).forEach((k, i) => wheel(P[k], i));

  const CHROME: RGB = [0.7, 0.71, 0.73];
  const LENS: RGB = [0.78, 0.82, 0.85];
  const lamp = (r: readonly [number, number, number, number], kind: 'rect' | 'round' | 'slim' | 'twin'): void => {
    const [x0, y0, x1, y1] = r;
    const [w, h] = [x1 - x0, y1 - y0];
    a.rect([0.1, 0.1, 0.11], x0, y0, x1, y1, { rough: 0.3 });
    if (kind === 'round') {
      a.disc(CHROME, (x0 + x1) / 2, (y0 + y1) / 2, w * 0.46, { rough: 0.2, metal: 0.9 });
      a.disc(LENS, (x0 + x1) / 2, (y0 + y1) / 2, w * 0.38, { rough: 0.08 });
      a.disc([0.95, 0.95, 0.9], (x0 + x1) / 2, (y0 + y1) / 2, w * 0.12, { rough: 0.1, soft: w * 0.1 });
      return;
    }
    a.rect(LENS, x0 + w * 0.03, y0 + h * 0.1, x1 - w * 0.03, y1 - h * 0.1, { rough: 0.08 });
    const eyes = kind === 'twin' ? [0.27, 0.7] : kind === 'slim' ? [0.2, 0.45, 0.7] : [0.36];
    for (const e of eyes) {
      a.disc([0.4, 0.42, 0.45], x0 + w * e, (y0 + y1) / 2, h * 0.3, { rough: 0.15, metal: 0.8 });
      a.disc([0.96, 0.96, 0.92], x0 + w * e, (y0 + y1) / 2, h * 0.14, { rough: 0.1, soft: h * 0.1 });
    }
    // The turn signal in the outer end.
    if (kind !== 'slim') a.rect([0.9, 0.5, 0.1], x1 - w * 0.2, y0 + h * 0.14, x1 - w * 0.05, y1 - h * 0.14, { rough: 0.2, opacity: 0.85 });
  };
  lamp(P['head-rect'], 'rect');
  lamp(P['head-round'], 'round');
  lamp(P['head-slim'], 'slim');
  lamp(P['head-twin'], 'twin');

  const RED: RGB = [0.55, 0.03, 0.03];
  const tail = (r: readonly [number, number, number, number], kind: 'rect' | 'tall' | 'bar' | 'round'): void => {
    const [x0, y0, x1, y1] = r;
    const [w, h] = [x1 - x0, y1 - y0];
    a.rect(shade(RED, 0.5), x0, y0, x1, y1, { rough: 0.25 });
    if (kind === 'round') {
      a.rect([0.06, 0.06, 0.06], x0, y0, x1, y1, { rough: 0.4 });
      a.disc(RED, (x0 + x1) / 2, (y0 + y1) / 2, w * 0.44, { rough: 0.15 });
      a.disc([0.8, 0.1, 0.08], (x0 + x1) / 2, (y0 + y1) / 2, w * 0.24, { rough: 0.15 });
      return;
    }
    a.rect(RED, x0 + w * 0.03, y0 + h * 0.08, x1 - w * 0.03, y1 - h * 0.08, { rough: 0.15 });
    if (kind === 'bar') {
      a.rect([0.85, 0.12, 0.1], x0 + w * 0.05, y0 + h * 0.35, x1 - w * 0.05, y1 - h * 0.35, { rough: 0.15 });
      return;
    }
    // Brake light, turn signal and reversing light one above another.
    a.rect([0.82, 0.1, 0.08], x0 + w * 0.1, y0 + h * 0.58, x1 - w * 0.1, y1 - h * 0.14, { rough: 0.15 });
    a.rect([0.9, 0.5, 0.1], x0 + w * 0.1, y0 + h * 0.36, x1 - w * 0.1, y0 + h * 0.54, { rough: 0.2 });
    a.rect([0.85, 0.86, 0.86], x0 + w * 0.1, y0 + h * 0.14, x1 - w * 0.1, y0 + h * 0.32, { rough: 0.15 });
  };
  tail(P['tail-rect'], 'rect');
  tail(P['tail-tall'], 'tall');
  tail(P['tail-bar'], 'bar');
  tail(P['tail-round'], 'round');
  {
    const [x0, y0, x1, y1] = P.indicator;
    a.rect([0.92, 0.5, 0.08], x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, { rough: 0.2 });
  }

  // Grilles.
  {
    const [x0, y0, x1, y1] = P['grille-bars'];
    a.rect([0.02, 0.02, 0.02], x0, y0, x1, y1, { rough: 0.9 });
    for (let y = y0 + 0.012; y < y1; y += 0.025) a.rect([0.1, 0.1, 0.105], x0, y, x1, y + 0.012, { rough: 0.5, height: 0.004 });
  }
  {
    const [x0, y0, x1, y1] = P['grille-mesh'];
    a.rect([0.015, 0.015, 0.015], x0, y0, x1, y1, { rough: 0.9 });
    for (let y = y0; y < y1; y += 0.02) a.rect([0.09, 0.09, 0.095], x0, y, x1, y + 0.004, { rough: 0.5 });
    for (let x = x0; x < x1; x += 0.02) a.rect([0.09, 0.09, 0.095], x, y0, x + 0.004, y1, { rough: 0.5 });
    a.rect(CHROME, (x0 + x1) / 2 - 0.03, (y0 + y1) / 2 - 0.02, (x0 + x1) / 2 + 0.03, (y0 + y1) / 2 + 0.02, { rough: 0.2, metal: 0.9, height: 0.004 });
  }
  {
    const [x0, y0, x1, y1] = P['grille-chrome'];
    a.rect([0.03, 0.03, 0.03], x0, y0, x1, y1, { rough: 0.9 });
    for (let y = y0 + 0.01; y < y1; y += 0.03) a.rect(CHROME, x0, y, x1, y + 0.014, { rough: 0.2, metal: 0.9, height: 0.005 });
    a.rect(CHROME, x0, y0, x0 + 0.012, y1, { rough: 0.2, metal: 0.9 });
    a.rect(CHROME, x1 - 0.012, y0, x1, y1, { rough: 0.2, metal: 0.9 });
  }

  // Number plates, the taxi's roof sign and the police lights.
  const plate = (r: readonly [number, number, number, number], bg: RGB, ink: RGB, no: string, top: string): void => {
    const [x0, y0, x1, y1] = r;
    a.rect([0.3, 0.3, 0.3], x0, y0, x1, y1, { rough: 0.4 });
    a.rect(bg, x0 + 0.006, y0 + 0.006, x1 - 0.006, y1 - 0.006, { rough: 0.45 });
    a.text(ink, top, (x0 + x1) / 2, y1 - 0.036, 0.02, { weight: 0.1 });
    a.text(ink, no, (x0 + x1) / 2, y0 + 0.018, 0.05, { weight: 0.12, fit: x1 - x0 - 0.04 });
  };
  plate(P['plate-white'], [0.9, 0.9, 0.88], [0.08, 0.25, 0.14], '48-15', 'CITY 300');
  plate(P['plate-yellow'], [0.88, 0.76, 0.16], [0.06, 0.06, 0.06], '27-06', 'CITY 480');
  {
    const [x0, y0, x1, y1] = P['taxi-sign'];
    a.rect([0.95, 0.82, 0.2], x0, y0, x1, y1, { rough: 0.3 });
    a.text([0.06, 0.06, 0.06], 'TAXI', (x0 + x1) / 2, y0 + 0.03, 0.06, { weight: 0.14 });
  }
  {
    const [x0, y0, x1, y1] = P.lightbar;
    const mid = (x0 + x1) / 2;
    a.rect([0.75, 0.06, 0.05], x0, y0, mid - 0.012, y1, { rough: 0.12 });
    a.rect([0.08, 0.16, 0.8], mid + 0.012, y0, x1, y1, { rough: 0.12 });
    a.rect([0.85, 0.85, 0.85], mid - 0.012, y0, mid + 0.012, y1, { rough: 0.2 });
  }

  // Plain fills: black plastic, tyre tread, chrome, the dark under a car, and seat cloth.
  const fill = (r: readonly [number, number, number, number], c: RGB, o: { rough: number; metal?: number }): void => a.rect(c, r[0] - 0.03, r[1] - 0.03, r[2] + 0.03, r[3] + 0.03, o);
  fill(P.black, [0.045, 0.045, 0.048], { rough: 0.6 });
  fill(P.rubber, TYRE, { rough: 0.92 });
  for (let x = P.rubber[0] - 0.03; x < P.rubber[2] + 0.03; x += 0.016) a.rect([0.012, 0.012, 0.012], x, P.rubber[1] - 0.03, x + 0.005, P.rubber[3] + 0.03, { rough: 0.95, height: -0.004 });
  fill(P.chrome, CHROME, { rough: 0.18, metal: 0.95 });
  fill(P.dark, [0.012, 0.012, 0.013], { rough: 0.95 });
  fill(P.seat, [0.16, 0.16, 0.18], { rough: 0.9 });
  return a.done(s, 0.05);
}, { density: 512 });

// Liveries.
add('livery-taxi', 'タクシーの市松帯', [0.4, 0.2], (t, s) => {
  const a = new Art(t, [0.93, 0.8, 0.16], 0.3);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) a.rect([0.05, 0.05, 0.05], i * 0.1, j * 0.1, (i + 1) * 0.1, (j + 1) * 0.1, { rough: 0.35 });
  return a.done(s, 0.1);
}, { tile: 'x', density: 256 });
add('livery-police', 'パトカーの扉', [1.9, 0.6], (t, s) => {
  const a = new Art(t, [0.9, 0.9, 0.9], 0.25);
  a.rect([0.1, 0.2, 0.55], 0, 0.06, 1.9, 0.14, { rough: 0.3 });
  a.text([0.06, 0.06, 0.08], 'POLICE', 0.95, 0.24, 0.2, { weight: 0.13 });
  return a.done(s, 0.1);
}, { density: 256 });

/** Sides of a box body: its colour, a stripe, and a name. */
const BOXES: [string, string, number, number | null, string, number][] = [
  ['white', '白 無地', 0xe6e6e2, null, '', 0],
  ['aluminium', 'アルミ', 0xb2b5b8, null, '', 0],
  ['express', '宅配 青帯', 0xe8e8e4, 0x1c4c9c, 'KITE EXPRESS', 0x1c4c9c],
  ['mart', '食品 緑', 0xe4e8e0, 0x2c7c3c, 'FRESH MART', 0x2c7c3c],
  ['movers', '引越 橙', 0xf0ece0, 0xd8701c, 'CITY MOVERS', 0x33302c],
  ['logistics', '物流 赤', 0xdcdcdc, 0xa8201c, 'NORTH LINE', 0xa8201c],
  ['rental', 'レンタル 黄', 0xe8c82c, 0x222222, 'RENT-A-VAN', 0x222222],
];
for (const [id, label, bg, stripe, name, ink] of BOXES)
  add(`box-${id}`, `荷箱の側面 ${label}`, [4, 2], (t, s) => {
    const a = new Art(t, hex(bg), id === 'aluminium' ? 0.35 : 0.5);
    // Panel joints and the rail along the bottom.
    for (let x = 0.5; x < 4; x += 0.5) a.rect(shade(hex(bg), 0.82), x - 0.006, 0.06, x + 0.006, 1.96, { height: id === 'aluminium' ? 0.008 : -0.002 });
    a.rect(shade(hex(bg), 0.6), 0, 0, 4, 0.06, { rough: 0.5, height: 0.004 });
    a.rect(shade(hex(bg), 0.7), 0, 1.95, 4, 2, { rough: 0.5, height: 0.004 });
    if (stripe !== null) {
      a.rect(hex(stripe), 0, 0.42, 4, 0.62, { rough: 0.45 });
      a.rect(hex(stripe), 0, 0.68, 4, 0.72, { rough: 0.45 });
    }
    if (name) a.text(hex(ink), name, 2, 1.05, 0.42, { weight: 0.13, fit: 3.4 });
    return a.done(s, 0.3);
  }, { density: 128 });

export const VEHICLE_TEXTURES: readonly TextureSpec[] = list;
