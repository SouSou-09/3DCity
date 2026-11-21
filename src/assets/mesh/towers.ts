import { Rand, textureSpec } from '../tex';
import { MeshBuilder } from './builder';
import { acUnit, antenna, balcony, blade, bulkhead, flatRoof, Opening, polySides, Side, sides, wall, weatherBySeed } from './buildkit';
import { roofPlant } from './blocks';
import { Pose, box, lathe, move, pipe, stand } from './kit';
import { addModel } from './registry';

export interface Tier {
  /** Size in bays of the skin texture, so that mullions meet the corners. */
  bx: number;
  bz: number;
  floors: number;
  /** Offset of the tier's centre, in bays. */
  ox?: number;
  oz?: number;
  skin?: string;
  /** Number of corners cut off: 4 gives an octagon, 2 cuts the front pair. */
  chamfer?: number;
}

export interface TowerOpts {
  seed: number;
  /** Curtain wall or facade texture: four bays by two floors per tile. */
  skin: string;
  tiers: Tier[];
  /** Material of the ground storey piers and of the bands that cap each tier. */
  base: string;
  trim: string;
  lobby?: string;
  lobbyH?: number;
  door?: string;
  /** Projecting vertical fins every `fins` bays. */
  fins?: number;
  finMat?: string;
  /** Projecting ledge at every floor. */
  ledges?: boolean;
  /** Solid piers at the corners, this wide. */
  corners?: number;
  crown?: 'plant' | 'mech' | 'spire' | 'mast' | 'slope' | 'none';
  cap?: number;
  /** Continuous access balconies across the front at every floor. */
  decks?: string;
  blade?: string;
  roof?: string;
}

function footprint(cx: number, cz: number, w: number, d: number, cut: number, n: number): [number, number][] {
  const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
  const c = (k: number): number => (k < n ? cut : 0);
  // Counter-clockwise seen from above, starting on the front face; corners 0 and 1 are the front pair.
  const pts: [number, number][] = [];
  const add = (x: number, z: number): void => {
    const p = pts[pts.length - 1];
    if (!p || Math.hypot(p[0] - x, p[1] - z) > 1e-6) pts.push([x, z]);
  };
  add(x0 + c(0), z1); add(x1 - c(1), z1); add(x1, z1 - c(1)); add(x1, z0 + c(2)); add(x1 - c(2), z0); add(x0 + c(3), z0); add(x0, z0 + c(3)); add(x0, z1 - c(0));
  return pts;
}

export function tower(b: MeshBuilder, o: TowerOpts): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.base);
  const lobbyH = o.lobbyH ?? 5.4;
  const cap = o.cap ?? 1.1;
  let y = 0;
  let last: { cx: number; cz: number; w: number; d: number } = { cx: 0, cz: 0, w: 1, d: 1 };
  o.tiers.forEach((t, ti) => {
    const skin = t.skin ?? o.skin;
    const [mw, mh] = textureSpec(skin).meters;
    const [bay, fh] = [mw / 4, mh / 2];
    const [w, d] = [t.bx * bay, t.bz * bay];
    const [cx, cz] = [(t.ox ?? 0) * bay, (t.oz ?? 0) * bay];
    const cut = t.chamfer ? Math.round(Math.min(t.bx, t.bz) / 4) * bay : 0;
    const pts = footprint(cx, cz, w, d, cut, t.chamfer ?? 0);
    const faces: Side[] = cut ? polySides(pts, y) : sides(cx, cz, w, d, y);
    const h = t.floors * fh;
    const lift = ti === 0 ? lobbyH : 0;
    if (ti === 0) {
      // Ground storey: glass between piers, with the entrance in the middle of the front.
      const lob = o.lobby ?? 'window/curtain-lobby';
      const door = o.door ?? 'door/lobby-aluminium';
      const [dw, dh] = textureSpec(door).meters;
      faces.forEach((s, k) => {
        const n = Math.max(1, Math.round(s.w / (bay * 4)));
        const pw = s.w / n;
        const pier = Math.min(0.9, pw * 0.2);
        const holes: Opening[] = [];
        for (let i = 0; i < n; i++) {
          const x = i * pw + pier / 2;
          if (k === 0 && i === Math.floor(n / 2) && pw - pier > dw + 0.4) {
            const gap = (pw - pier - dw) / 2;
            holes.push({ x: x + gap, y: 0.05, w: dw, h: dh, tex: door, depth: 0.5, reveal: o.trim });
            if (gap > 0.5) holes.push({ x, y: 0.4, w: gap - 0.25, h: lobbyH - 1.3, tex: lob, depth: 0.3, v: i, reveal: o.trim }, { x: x + gap + dw + 0.25, y: 0.4, w: gap - 0.25, h: lobbyH - 1.3, tex: lob, depth: 0.3, v: i + 3, reveal: o.trim });
            box(b, o.trim, s.f, [x + gap + dw / 2, dh + 0.45, 1.1], [dw / 2 + 0.9, 0.12, 1.3]);
          } else holes.push({ x, y: 0.4, w: pw - pier, h: lobbyH - 1.3, tex: lob, depth: 0.3, v: i * 2 + k, reveal: o.trim });
        }
        wall(b, o.base, s.f, s.w, lobbyH, holes);
        box(b, o.trim, s.f, [s.w / 2, lobbyH - 0.12, 0.05], [s.w / 2 + 0.05, 0.12, 0.08]);
      });
    }
    for (const s of faces) {
      const f: Pose = { ...s.f, o: [s.f.o[0], y + lift, s.f.o[2]] };
      const cw = o.corners && !cut ? o.corners : 0;
      wall(b, skin, move(f, cw, 0, 0), s.w - 2 * cw, h, []);
      if (cw) {
        wall(b, o.base, f, cw, h, [], 0, lift);
        wall(b, o.base, move(f, s.w - cw, 0, 0), cw, h, [], s.w - cw, lift);
      }
      wall(b, o.base, move(f, 0, h, 0), s.w, cap, [], 0, h);
      if (o.fins) {
        const fm = o.finMat ?? o.trim;
        for (let x = cw; x <= s.w - cw + 1e-6; x += o.fins * bay) box(b, fm, f, [x, h / 2 + cap / 2, 0.14], [0.09, h / 2 + cap / 2, 0.16]);
      }
      if (o.ledges) for (let i = 0; i <= t.floors; i++) box(b, o.trim, f, [s.w / 2, i * fh, 0.2], [s.w / 2 + 0.2, 0.07, 0.22]);
    }
    if (o.decks && ti === 0) for (let i = 1; i < t.floors; i++) balcony(b, stand([cx, y + lift + i * fh, cz + d / 2]), w - 0.4, 1.3, { rail: o.decks });
    y += lift + h;
    const roof = o.roof ?? 'roof/flat-membrane-grey';
    if (cut) {
      b.fan(roof, [cx, cz], pts.map(([px, pz]) => [px - Math.sign(px - cx) * 0.25, pz - Math.sign(pz - cz) * 0.25] as [number, number]), y);
      for (const s of polySides(pts, y)) {
        box(b, o.trim, s.f, [s.w / 2, cap + 0.035, -0.12], [s.w / 2 + 0.03, 0.035, 0.16]);
        wall(b, o.base, move({ ...s.f, x: [-s.f.x[0], -s.f.x[1], -s.f.x[2]], z: [-s.f.z[0], -s.f.z[1], -s.f.z[2]] }, -s.w, 0, 0.25), s.w, cap);
      }
    } else flatRoof(b, cx, cz, w, d, y, { mat: roof, parapet: cap, inner: o.base, coping: o.trim });
    last = { cx, cz, w: w - 2 * cut * 0.6, d: d - 2 * cut * 0.6 };
  });
  const { cx, cz, w, d } = last;
  const crown = o.crown ?? 'plant';
  const mech = (mw: number, md: number, mhh: number): void => {
    const lv = rnd.pick(['trim/louver-grey', 'trim/louver-dark', 'trim/louver-beige']);
    for (const s of sides(cx, cz, mw, md, y)) wall(b, lv, s.f, s.w, mhh);
    flatRoof(b, cx, cz, mw, md, y + mhh, { mat: 'roof/flat-membrane-grey', parapet: 0.3, inner: o.base, coping: o.trim });
    box(b, o.trim, stand([cx, y, cz]), [0, mhh - 0.1, 0], [mw / 2 + 0.06, 0.1, md / 2 + 0.06]);
  };
  if (crown === 'plant') {
    roofPlant(b, rnd, cx, cz, w - 2, d - 2, y, 2, { wall: o.base, big: true });
  } else if (crown === 'mech' || crown === 'mast' || crown === 'spire') {
    const [mw, md, mhh] = [Math.max(3, w * 0.6), Math.max(3, d * 0.6), crown === 'mech' ? 4.5 : 3.6];
    mech(mw, md, mhh);
    if (crown === 'mech') {
      acUnit(b, stand([cx - mw / 4, y + mhh, cz]), 2);
      acUnit(b, stand([cx + mw / 4, y + mhh, cz]), 2);
      antenna(b, stand([cx + mw / 2 - 0.8, y + mhh, cz - md / 2 + 0.8]), 1, 6);
    } else if (crown === 'mast') {
      const top = y + mhh;
      const hh = Math.max(14, y * 0.22);
      pipe(b, 'trim/paint-white', [[cx, top, cz], [cx, top + hh * 0.5, cz]], 0.35, 8);
      pipe(b, 'trim/paint-red', [[cx, top + hh * 0.5, cz], [cx, top + hh * 0.8, cz]], 0.2, 6);
      pipe(b, 'trim/paint-white', [[cx, top + hh * 0.8, cz], [cx, top + hh, cz]], 0.08, 6);
      for (const q of [-1, 1]) antenna(b, stand([cx + q * (mw / 2 - 0.7), top, cz + q * (md / 2 - 0.7)]), 0, 5);
    } else {
      const r = Math.min(mw, md) * 0.32;
      const hh = Math.max(16, y * 0.25);
      lathe(b, o.trim, stand([cx, y + mhh, cz]), [[r, 0], [r, 1.2], [r * 0.55, hh * 0.35], [r * 0.2, hh * 0.6], [0.12, hh * 0.72], [0.06, hh], [0, hh]], 8);
    }
  } else if (crown === 'slope') {
    // Wedge-shaped top that hides the plant, glazed like the rest of the tower.
    const hh = Math.min(w, d) * 0.55;
    const [x0, x1, z0, z1] = [cx - w / 2 + 0.3, cx + w / 2 - 0.3, cz - d / 2 + 0.3, cz + d / 2 - 0.3];
    const sk = o.tiers[o.tiers.length - 1].skin ?? o.skin;
    const len = Math.hypot(x1 - x0, hh);
    b.tri(sk, [x0, y, z1], [x1, y, z1], [x1, y + hh, z1], [[0, 0], [x1 - x0, 0], [x1 - x0, hh]]);
    b.tri(sk, [x1, y, z0], [x0, y, z0], [x1, y + hh, z0], [[0, 0], [x1 - x0, 0], [0, hh]]);
    b.quad(sk, [x1, y, z1], [x1, y, z0], [x1, y + hh, z0], [x1, y + hh, z1], [[0, 0], [z1 - z0, 0], [z1 - z0, hh], [0, hh]]);
    b.quad(sk, [x0, y, z1], [x1, y + hh, z1], [x1, y + hh, z0], [x0, y, z0], [[0, 0], [len, 0], [len, z1 - z0], [0, z1 - z0]]);
  }
  if (o.blade) {
    const t0 = o.tiers[0];
    const bay = textureSpec(t0.skin ?? o.skin).meters[0] / 4;
    blade(b, stand([-(t0.bx * bay) / 2 + 1.2, lobbyH + 9, (t0.bz * bay) / 2 + (t0.oz ?? 0) * bay]), o.blade, 2.2, 0.5);
  }
}

/** Open-deck car park: slabs, columns and upstand panels, with a stair tower. */
export function carPark(b: MeshBuilder, o: { seed: number; w: number; d: number; levels: number; panel: string; column: string; stair: string; sign?: boolean }): void {
  const rnd = new Rand(o.seed);
  weatherBySeed(b, o.seed, o.panel);
  const { w, d, levels } = o;
  const fh = 3.2;
  const f0 = stand();
  for (let i = 0; i <= levels; i++) {
    const y = i * fh;
    if (i > 0) box(b, o.column, f0, [0, y - 0.2, 0], [w / 2 - 0.1, 0.2, d / 2 - 0.1]);
    if (i > 0) for (const s of sides(0, 0, w, d, y - 0.45)) {
      box(b, o.panel, s.f, [s.w / 2, 0.8, -0.08], [s.w / 2, 0.8, 0.09]);
    }
  }
  const [nx, nz] = [Math.max(2, Math.round(w / 8)), Math.max(2, Math.round(d / 8))];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    if (i > 0 && i < nx && j > 0 && j < nz && (j % 2 === 1)) continue;
    box(b, o.column, f0, [-w / 2 + 0.35 + (i * (w - 0.7)) / nx, (levels * fh) / 2, -d / 2 + 0.35 + (j * (d - 0.7)) / nz], [0.3, (levels * fh) / 2, 0.3]);
  }
  // Dark back wall inside so that the decks do not read as hollow.
  box(b, 'structure/wall-old', f0, [0, (levels * fh) / 2, 0], [w / 2 - 6, (levels * fh) / 2 - 0.1, d / 2 - 6]);
  const top = levels * fh;
  b.quad('roof/deck-parking', [-w / 2 + 0.2, top + 0.01, d / 2 - 0.2], [w / 2 - 0.2, top + 0.01, d / 2 - 0.2], [w / 2 - 0.2, top + 0.01, -d / 2 + 0.2], [-w / 2 + 0.2, top + 0.01, -d / 2 + 0.2], [[0, 0], [w, 0], [w, d], [0, d]]);
  const sx = w / 2 - 2.2;
  for (const s of sides(sx, d / 2 - 1.6, 4, 5.4)) wall(b, o.stair, s.f, s.w, top + 3);
  flatRoof(b, sx, d / 2 - 1.6, 4, 5.4, top + 3, { mat: 'roof/flat-concrete', inner: o.stair });
  bulkhead(b, stand([-w / 2 + 3, top, -d / 2 + 3.5]), 3, 3.6, 2.6, o.stair);
  if (o.sign) blade(b, stand([sx - 2.6, top - 1.2, d / 2]), 'trim/blade-parking', 1.6, 0.4);
  for (let i = 0; i < 3; i++) if (rnd.chance(0.6)) box(b, 'trim/paint-galvanized', f0, [rnd.range(-w / 3, w / 3), top + 2.2, rnd.range(-d / 3, d / 3)], [0.06, 2.2, 0.06]);
}

const W = (c: string): string => `wall/${c}`;
const T = (c: string): string => `trim/paint-${c}`;
const C = (c: string): string => `window/curtain-${c}`;
const F = (c: string): string => `window/facade-${c}`;

export function addTowers(): void {
  let seed = 9100;
  const next = (): number => (seed += 13);
  const office = (id: string, label: string, o: Omit<TowerOpts, 'seed'>): void => {
    const s = next();
    addModel('office', id, label, (b) => tower(b, { ...o, seed: s }));
  };
  const apt = (id: string, label: string, o: Omit<TowerOpts, 'seed'>): void => {
    const s = next();
    addModel('apartment', id, label, (b) => tower(b, { ...o, seed: s }));
  };

  // Plain glass boxes.
  const GLASS: [string, string, string, number, number, number, TowerOpts['crown']][] = [
    ['blue', 'metal-panel-silver', 'aluminium', 16, 16, 28, 'mech'], ['green-butt', 'concrete-white', 'white', 20, 14, 22, 'plant'], ['black', 'stone-granite-black', 'black', 14, 14, 36, 'mast'], ['bronze', 'stone-granite-red', 'bronze', 18, 12, 24, 'mech'],
    ['silver', 'metal-panel-silver', 'aluminium', 12, 12, 42, 'spire'], ['gold', 'stone-travertine', 'bronze', 16, 12, 18, 'plant'], ['blue-dark', 'metal-panel-charcoal', 'charcoal', 20, 20, 32, 'slope'], ['teal', 'concrete-white', 'white', 14, 10, 20, 'mech'],
    ['copper', 'stone-granite-black', 'black', 12, 12, 26, 'slope'], ['clear', 'concrete-panel', 'grey', 24, 12, 12, 'plant'],
  ];
  GLASS.forEach(([sk, base, tr, bx, bz, fl, crown], i) => office(`glass-${i + 1}`, `ガラスの高層ビル ${i + 1}`, {
    skin: C(sk), base: W(base), trim: T(tr), tiers: [{ bx, bz, floors: fl }], ...(crown ? { crown } : {}), lobby: i % 2 ? 'window/curtain-lobby-black' : 'window/curtain-lobby', door: `door/lobby-${['aluminium', 'black', 'bronze'][i % 3]}`,
    ...(i % 3 === 0 ? { fins: 2 } : {}), ...(i % 4 === 1 ? { corners: 1.5 } : {}),
  }));
  // Towers that step back as they rise.
  const STEP: [string, string, string, Tier[], TowerOpts['crown']][] = [
    ['blue-butt', 'metal-panel-silver', 'aluminium', [{ bx: 24, bz: 20, floors: 6 }, { bx: 16, bz: 14, floors: 22 }, { bx: 10, bz: 10, floors: 8 }], 'mast'],
    ['black-butt', 'stone-granite-black', 'black', [{ bx: 20, bz: 20, floors: 14 }, { bx: 14, bz: 14, floors: 14 }, { bx: 8, bz: 8, floors: 10 }], 'spire'],
    ['green', 'concrete-white', 'white', [{ bx: 28, bz: 16, floors: 4 }, { bx: 14, bz: 12, floors: 24, ox: -5 }], 'mech'],
    ['bronze-dark', 'stone-granite-red', 'bronze', [{ bx: 20, bz: 16, floors: 10 }, { bx: 20, bz: 10, floors: 12, oz: -3 }, { bx: 12, bz: 10, floors: 8, oz: -3 }], 'mech'],
    ['silver-butt', 'metal-panel-silver', 'aluminium', [{ bx: 16, bz: 16, floors: 30, chamfer: 4 }, { bx: 10, bz: 10, floors: 8, chamfer: 4 }], 'spire'],
    ['blue', 'stone-limestone', 'grey', [{ bx: 32, bz: 20, floors: 3, skin: C('clear') }, { bx: 14, bz: 14, floors: 30, ox: 6 }], 'slope'],
    ['teal', 'metal-panel-white', 'white', [{ bx: 18, bz: 18, floors: 20, chamfer: 2 }, { bx: 12, bz: 12, floors: 10, oz: -3 }], 'mast'],
    ['gold', 'stone-granite-black', 'black', [{ bx: 16, bz: 16, floors: 18, chamfer: 4 }], 'mech'],
    ['grey-panel', 'concrete-panel', 'grey', [{ bx: 24, bz: 16, floors: 5 }, { bx: 12, bz: 16, floors: 14, ox: -6 }, { bx: 8, bz: 12, floors: 9, ox: -6 }], 'plant'],
    ['copper', 'stone-travertine', 'bronze', [{ bx: 20, bz: 14, floors: 12, chamfer: 2 }, { bx: 14, bz: 10, floors: 16, oz: -2, chamfer: 2 }], 'slope'],
  ];
  STEP.forEach(([sk, base, tr, tiers, crown], i) => office(`setback-${i + 1}`, `段状・基壇つきの高層ビル ${i + 1}`, {
    skin: C(sk), base: W(base), trim: T(tr), tiers, ...(crown ? { crown } : {}), lobby: i % 2 ? 'window/curtain-lobby' : 'window/curtain-lobby-black', door: `door/lobby-${['black', 'aluminium', 'bronze'][i % 3]}`, lobbyH: 6.2, ...(i % 3 === 1 ? { fins: 4 } : {}),
  }));
  // Stone and concrete: stepped pre-war towers, precast grids and brutalist slabs.
  const SOLID: [string, string, string, string, Tier[], TowerOpts['crown'], Partial<TowerOpts>][] = [
    ['deco', 'pier-limestone', 'stone-limestone', 'grey', [{ bx: 12, bz: 10, floors: 12 }, { bx: 8, bz: 8, floors: 8 }, { bx: 6, bz: 6, floors: 4 }, { bx: 4, bz: 4, floors: 2 }], 'spire', { corners: 1.2 }],
    ['deco', 'pier-terracotta', 'tile-white', 'white', [{ bx: 10, bz: 8, floors: 10 }, { bx: 8, bz: 6, floors: 4 }], 'plant', { corners: 1 }],
    ['deco', 'pier-brick', 'brick-red', 'cream', [{ bx: 12, bz: 12, floors: 9 }, { bx: 8, bz: 8, floors: 5 }, { bx: 4, bz: 4, floors: 3 }], 'mast', { corners: 1.2 }],
    ['deco', 'pier-black', 'stone-granite-black', 'bronze', [{ bx: 12, bz: 12, floors: 16 }, { bx: 8, bz: 8, floors: 10 }], 'spire', { fins: 2, finMat: T('bronze') }],
    ['precast', 'precast-grid', 'concrete-panel', 'grey', [{ bx: 16, bz: 12, floors: 14 }], 'mech', {}],
    ['precast', 'precast-grid-white', 'concrete-white', 'white', [{ bx: 20, bz: 12, floors: 9 }], 'plant', { corners: 1.5 }],
    ['precast', 'precast-grid-dark', 'concrete-dark', 'charcoal', [{ bx: 12, bz: 12, floors: 20 }], 'mech', { fins: 4 }],
    ['precast', 'precast-wide', 'concrete-panel', 'grey', [{ bx: 10, bz: 6, floors: 7 }], 'plant', { ledges: true }],
    ['brutal', 'concrete-punched', 'concrete-formwork', 'grey', [{ bx: 12, bz: 8, floors: 3 }, { bx: 10, bz: 8, floors: 11 }], 'mech', { corners: 1.8 }],
    ['brutal', 'concrete-slot', 'concrete-boards', 'grey', [{ bx: 16, bz: 12, floors: 8 }], 'plant', { corners: 2.4, ledges: true }],
    ['brutal', 'concrete-punched', 'concrete-ribbed', 'grey', [{ bx: 8, bz: 8, floors: 16 }, { bx: 10, bz: 10, floors: 3 }], 'mech', { corners: 1.2 }],
    ['brutal', 'concrete-slot', 'concrete-exposed', 'charcoal', [{ bx: 20, bz: 10, floors: 5 }], 'plant', { corners: 1.8 }],
  ];
  const NAME: Record<string, string> = { deco: '石張りの段状ビル', precast: 'PC板の事務所ビル', brutal: 'コンクリート打放しのビル' };
  SOLID.forEach(([kind, sk, base, tr, tiers, crown, extra], i) => office(`${kind}-${i + 1}`, `${NAME[kind]} ${i + 1}`, {
    skin: F(sk), base: W(base), trim: T(tr), tiers, ...(crown ? { crown } : {}), lobby: 'window/curtain-lobby-black', door: `door/lobby-${['bronze', 'black', 'aluminium'][i % 3]}`, lobbyH: kind === 'deco' ? 6 : 4.6, roof: 'roof/flat-gravel', ...extra,
  }));
  // Low office blocks with horizontal bands or panel glazing.
  const LOW: [string, string, string, number, number, number][] = [['horizontal', 'concrete-white', 'white', 20, 10, 4], ['horizontal-dark', 'metal-panel-charcoal', 'charcoal', 16, 12, 6], ['vertical', 'concrete-panel', 'grey', 12, 12, 8],
    ['vertical-bronze', 'stone-travertine', 'bronze', 16, 8, 5], ['red-panel', 'metal-panel-white', 'aluminium', 24, 10, 3], ['blue-panel', 'metal-panel-silver', 'aluminium', 16, 10, 4], ['clear-white', 'concrete-white', 'white', 12, 8, 6], ['grey-panel', 'metal-panel-charcoal', 'charcoal', 28, 12, 2]];
  LOW.forEach(([sk, base, tr, bx, bz, fl], i) => office(`lowrise-${i + 1}`, `中低層の事務所ビル ${i + 1}`, {
    skin: C(sk), base: W(base), trim: T(tr), tiers: [{ bx, bz, floors: fl }], crown: 'plant', lobbyH: 4.2, door: `door/lobby-${['aluminium', 'black', 'bronze'][i % 3]}`, ...(i % 2 ? { corners: 1.2 } : {}), cap: 0.8,
  }));
  // Hotels.
  ([['hotel-white', 'concrete-white', 'white', 8, 4, 14, 'hotel'], ['hotel-tan', 'stone-travertine', 'bronze', 12, 4, 9, 'hotel'], ['stucco-pink', 'stucco-pink', 'white', 8, 4, 6, 'motel'], ['hotel-white', 'metal-panel-white', 'charcoal', 8, 8, 22, 'hotel']] as [string, string, string, number, number, number, string][])
    .forEach(([sk, base, tr, bx, bz, fl, bl], i) => office(`hotel-${i + 1}`, `ホテル ${i + 1}`, {
      skin: F(sk), base: W(base), trim: T(tr), tiers: [{ bx, bz, floors: fl }], crown: i % 2 ? 'plant' : 'mech', lobbyH: 4.8, door: 'door/lobby-bronze', blade: `trim/blade-${bl}`, corners: 1.4, roof: 'roof/flat-gravel-light',
    }));
  // Car parks.
  ([[30, 34, 4, 'concrete-panel', true], [36, 30, 6, 'concrete-panel-stained', false], [28, 50, 3, 'concrete-white', true], [32, 32, 8, 'concrete-ribbed', true]] as [number, number, number, string, boolean][]).forEach(([w, d, lv, pn, sg], i) => {
    const s = next();
    addModel('office', `carpark-${i + 1}`, `立体駐車場 ${i + 1}`, (b) => carPark(b, { seed: s, w, d, levels: lv, panel: W(pn), column: 'structure/wall-smooth', stair: W(i % 2 ? 'block-grey' : 'concrete-formwork'), sign: sg }));
  });

  // Apartment slabs and towers in textured facades.
  const SLAB: [string, string, string, number, number, number, string, Partial<TowerOpts>][] = [
    ['housing-grey', 'concrete-panel-stained', 'grey', 12, 5, 12, '団地の高層棟', { corners: 1.2 }], ['housing-brick', 'brick-red', 'cream', 8, 5, 14, '団地の高層棟', { corners: 1.2 }], ['housing-grey', 'concrete-panel', 'grey', 16, 5, 8, '団地の板状棟', { decks: 'trim/rail-cable' }],
    ['housing-brick', 'brick-brown', 'white', 12, 5, 6, '団地の板状棟', { decks: 'trim/rail-black' }], ['stucco-white', 'stucco-white', 'grey', 8, 5, 10, '塗り壁の高層住宅', { decks: 'trim/rail-white' }], ['stucco-beige', 'stucco-sand', 'brown', 8, 6, 7, '塗り壁の高層住宅', { corners: 1 }],
    ['brick-red', 'brick-red', 'cream', 8, 6, 10, 'レンガの高層アパート', { corners: 0.8, crown: 'plant' }], ['brick-buff', 'brick-buff', 'brown', 6, 6, 14, 'レンガの高層アパート', {}], ['brick-brown-pair', 'brick-brown', 'white', 8, 4, 12, 'レンガの高層アパート', { corners: 1 }],
    ['hotel-white', 'concrete-white', 'white', 8, 6, 26, '高層マンション', { decks: 'trim/rail-cable', crown: 'mech' }], ['hotel-tan', 'stone-travertine', 'bronze', 6, 6, 20, '高層マンション', { corners: 1.4, crown: 'mech' }], ['stucco-white', 'metal-panel-white', 'charcoal', 8, 8, 18, '高層マンション', { decks: 'trim/rail-cable-black', crown: 'mech' }],
  ];
  SLAB.forEach(([sk, base, tr, bx, bz, fl, label, extra], i) => apt(`highrise-${i + 1}`, `${label} ${i + 1}`, {
    skin: F(sk), base: W(base), trim: T(tr), tiers: [{ bx, bz, floors: fl }], crown: 'plant', lobbyH: 3.6, lobby: 'window/curtain-lobby', door: `door/lobby-${['aluminium', 'black', 'bronze'][i % 3]}`, cap: 0.9, roof: 'roof/flat-gravel', ...extra,
  }));
}
