import { describe, expect, it } from 'vitest';
import { MODELS, MODEL_CATEGORIES, ModelCategory } from '../src/assets/mesh/registry';
import { TEXTURES, TextureCategory, TextureData, renderTexture, textureSpec } from '../src/assets/tex';
import { MeshBuilder } from '../src/assets/mesh/builder';
import { TRADES, Trade, fitBay } from '../src/assets/mesh/shopfit';
import { limb, PEOPLE, Person } from '../src/assets/mesh/people';
import { BOTTOMS, HAIRS, HEADS, TOPS } from '../src/assets/tex';

const count = <T extends string>(items: readonly { category: T }[]): Map<T, number> => {
  const m = new Map<T, number>();
  for (const it of items) m.set(it.category, (m.get(it.category) ?? 0) + 1);
  return m;
};
const thumbs = new Map<string, TextureData>();
const thumb = (id: string): TextureData => {
  let t = thumbs.get(id);
  if (!t) thumbs.set(id, (t = renderTexture(textureSpec(id), 0.125)));
  return t;
};

describe('texture registry', { timeout: 120_000 }, () => {
  it('has unique ids prefixed by category', () => {
    expect(new Set(TEXTURES.map((t) => t.id)).size).toBe(TEXTURES.length);
    for (const t of TEXTURES) expect(t.id.startsWith(`${t.category}/`), t.id).toBe(true);
  });

  it('offers many patterns in every category', () => {
    const min: Record<TextureCategory, number> = { asphalt: 40, concrete: 12, paving: 30, curb: 8, ground: 10, structure: 20, line: 30, crosswalk: 15, symbol: 60, cover: 25, sign: 100, signal: 30, furniture: 80, plant: 50, wall: 100, roof: 40, window: 110, door: 70, trim: 100, rail: 100, site: 150, vehicle: 10, prop: 60, person: 100 };
    const n = count(TEXTURES);
    for (const [cat, least] of Object.entries(min)) expect(n.get(cat as TextureCategory) ?? 0, cat).toBeGreaterThanOrEqual(least);
    expect(TEXTURES.length).toBeGreaterThanOrEqual(350);
  });

  it('renders every texture with all three maps', () => {
    for (const spec of TEXTURES) {
      const t = thumb(spec.id);
      for (const map of [t.albedo, t.normal, t.orm]) expect(map.length, spec.id).toBe(t.w * t.h * 4);
      let opaque = 0;
      let clear = 0;
      for (let i = 3; i < t.albedo.length; i += 4) {
        if (t.albedo[i] > 60) opaque++;
        if (t.albedo[i] < 20) clear++;
      }
      expect(opaque, `${spec.id} has paint`).toBeGreaterThan(0);
      if (!spec.decal && !spec.cutout) expect(clear, `${spec.id} is opaque`).toBe(0);
    }
  });

  it('is deterministic', () => {
    for (const id of ['asphalt/lane-fresh-clean', 'paving/herringbone-red', 'structure/stone-ashlar', TEXTURES[TEXTURES.length - 1].id]) {
      const a = renderTexture(textureSpec(id), 0.25);
      const b = renderTexture(textureSpec(id), 0.25);
      expect(a.albedo, id).toEqual(b.albedo);
      expect(a.normal, id).toEqual(b.normal);
      expect(a.orm, id).toEqual(b.orm);
    }
  });

  it('gives distinct images for distinct ids', () => {
    const seen = new Map<string, string>();
    for (const spec of TEXTURES) {
      const t = thumb(spec.id);
      let h = 0;
      for (let i = 0; i < t.albedo.length; i++) h = (Math.imul(h, 31) + t.albedo[i]) | 0;
      for (let i = 0; i < t.orm.length; i++) h = (Math.imul(h, 31) + t.orm[i]) | 0;
      const key = `${t.w}x${t.h}:${h}`;
      expect(seen.get(key), `${spec.id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, spec.id);
    }
  });

  it('tiles without a seam', () => {
    // The wrap-around edge must not stand out more than the strongest line inside the tile (a joint, say).
    const seams: string[] = [];
    for (const spec of TEXTURES) {
      if (spec.decal || spec.tile === 'none') continue;
      const t = renderTexture(spec, 0.25);
      const px = (x: number, y: number, c: number): number => t.albedo[(y * t.w + x) * 4 + c];
      const check = (axis: 'x' | 'y'): void => {
        const [n, m] = axis === 'x' ? [t.w, t.h] : [t.h, t.w];
        const step = (i: number): number => {
          let d = 0;
          const k = (i + 1) % n;
          for (let o = 0; o < m; o++) for (let c = 0; c < 3; c++) d += Math.abs(axis === 'x' ? px(i, o, c) - px(k, o, c) : px(o, i, c) - px(o, k, c));
          return d / m;
        };
        let inner = 0;
        for (let i = 0; i + 1 < n; i++) inner = Math.max(inner, step(i));
        const seam = step(n - 1);
        if (seam > inner * 1.5 + 2) seams.push(`${spec.id} ${axis}: ${seam.toFixed(1)} vs ${inner.toFixed(1)}`);
      };
      if (spec.tile === 'xy' || spec.tile === 'x') check('x');
      if (spec.tile === 'xy' || spec.tile === 'y') check('y');
    }
    expect(seams).toEqual([]);
  });
});

describe('model registry', { timeout: 120_000 }, () => {
  const built = MODELS.map((spec) => ({ spec, data: spec.build() }));
  const textureIds = new Set(TEXTURES.map((t) => t.id));

  it('has unique ids prefixed by category', () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    for (const m of MODELS) expect(m.id.startsWith(`${m.category}/`), m.id).toBe(true);
  });

  it('offers many patterns in every category', () => {
    const min: Record<ModelCategory, number> = { segment: 40, highway: 10, slope: 12, curve: 8, junction: 25, roundabout: 8, sidewalk: 30, bridge: 25, elevated: 15, signal: 90, sign: 150, furniture: 250, plant: 70, house: 50, apartment: 35, shop: 45, office: 40, industrial: 30, buildpart: 70, track: 50, crossing: 25, station: 30, railpart: 60, boundary: 100, waterfront: 150, park: 60, infra: 60, civic: 70, vehicle: 20, prop: 90, person: 40 };
    const n = count(MODELS);
    for (const [cat] of MODEL_CATEGORIES) expect(n.get(cat) ?? 0, cat).toBeGreaterThanOrEqual(min[cat]);
    expect(MODELS.length).toBeGreaterThanOrEqual(200);
  });

  it('only uses registered textures', () => {
    for (const { spec, data } of built) for (const p of data.parts) expect(textureIds.has(p.material), `${spec.id} uses ${p.material}`).toBe(true);
  });

  it('builds valid geometry', () => {
    for (const { spec, data } of built) {
      let tris = 0;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const p of data.parts) {
        const verts = p.positions.length / 3;
        expect(p.normals.length, spec.id).toBe(verts * 3);
        expect(p.uvs.length, spec.id).toBe(verts * 2);
        expect(p.indices.length % 3, spec.id).toBe(0);
        tris += p.indices.length / 3;
        let bad = 0;
        for (const i of p.indices) if (!(i >= 0 && i < verts)) bad++;
        for (const v of p.uvs) if (!Number.isFinite(v)) bad++;
        for (let i = 0; i < verts; i++) {
          for (let c = 0; c < 3; c++) {
            const v = p.positions[i * 3 + c];
            if (!Number.isFinite(v)) bad++;
            min[c] = Math.min(min[c], v);
            max[c] = Math.max(max[c], v);
          }
          const l = Math.hypot(p.normals[i * 3], p.normals[i * 3 + 1], p.normals[i * 3 + 2]);
          if (!(Math.abs(l - 1) < 1e-3)) bad++;
        }
        expect(bad, `${spec.id} ${p.material}`).toBe(0);
      }
      expect(tris, spec.id).toBeGreaterThan(0);
      expect(data.triangles, spec.id).toBe(tris);
      expect(tris, `${spec.id} triangle budget`).toBeLessThan(120000);
      for (let c = 0; c < 3; c++) {
        expect(data.min[c], spec.id).toBeCloseTo(min[c], 6);
        expect(data.max[c], spec.id).toBeCloseTo(max[c], 6);
      }
    }
  });

  it('has roads facing up', () => {
    for (const { spec, data } of built) {
      let up = 0;
      let down = 0;
      for (const p of data.parts) {
        if (!p.material.startsWith('asphalt/')) continue;
        for (let i = 1; i < p.normals.length; i += 3) (p.normals[i] > 0.3 ? up++ : down++);
      }
      if (up + down > 0) expect(down / (up + down), spec.id).toBeLessThan(0.02);
    }
  });

  it('is deterministic', () => {
    for (const { spec, data } of built) expect(spec.build(), spec.id).toEqual(data);
  });

  it('gives distinct geometry for distinct ids', () => {
    const seen = new Map<string, string>();
    for (const { spec, data } of built) {
      const key = `${data.triangles}|${data.min.map((v) => v.toFixed(2))}|${data.max.map((v) => v.toFixed(2))}|${data.parts.map((p) => `${p.material}:${p.indices.length}`).join(',')}`;
      expect(seen.get(key), `${spec.id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, spec.id);
    }
  });
});

describe('shops and cars you can see into', { timeout: 120_000 }, () => {
  const by = new Map(MODELS.map((m) => [m.id, m]));
  const shops = MODELS.filter((m) => m.category === 'shop');

  it('gives all but the empty shops a room behind real glass, and the room stays inside the building', () => {
    const bare = shops.filter((s) => !by.has(`prop/interior-${s.id.slice(5)}`)).map((s) => s.id);
    expect(bare.length, bare.join(' ')).toBeLessThanOrEqual(2);
    // A front painted as an empty shop still trades where its sign names a trade: only the units to let stay papered over.
    expect(bare).not.toContain('shop/mixed-12');
    for (const kind of ['store', 'mixed', 'gas', 'fastfood', 'diner', 'bank', 'bigbox', 'garage'])
      expect(shops.filter((s) => s.id.startsWith(`shop/${kind}-`) && !bare.includes(s.id)).length, kind).toBeGreaterThanOrEqual(3);
    for (const s of shops) {
      const room = by.get(`prop/interior-${s.id.slice(5)}`);
      if (!room) continue;
      const [a, r] = [s.build(), room.build()];
      expect(r.triangles, room.id).toBeGreaterThan(100);
      for (let i = 0; i < 3; i++) {
        expect(r.min[i], `${room.id} axis ${i}`).toBeGreaterThanOrEqual(a.min[i] - 0.02);
        expect(r.max[i], `${room.id} axis ${i}`).toBeLessThanOrEqual(a.max[i] + 0.02);
      }
      // The front is glass you can see through, or a door standing open.
      const clear = a.parts.filter((p) => /^prop\/(front-|glass-|open$)/.test(p.material));
      expect(clear.length, s.id).toBeGreaterThan(0);
      for (const p of clear) expect(textureSpec(p.material).decal, p.material).toBe(true);
    }
  });

  it('fits out every trade inside its room, whatever the size of the room and wherever the door', () => {
    const trades = [...new Set<Trade>([...Object.values(TRADES), 'convenience', 'garage', 'hall-discount', 'hall-market', 'hall-hardware', 'hall-furniture'])];
    expect(trades.length).toBeGreaterThanOrEqual(30);
    const sizes = new Map<string, number>();
    for (const trade of trades)
      for (const [w, d] of [[3.6, 7], [4.4, 9], [5.6, 8], [7.6, 10], [11.6, 6.7], [24, 14]])
        for (const door of [-1, 0, 1])
          for (const n of [1, 2]) {
            const b = new MeshBuilder();
            fitBay(b, { x: 0, y: 0, z: 0, w, d, h: 3.1, door: door * (w / 2 - 1.2), trade, n });
            const m = b.build();
            const at = `${trade} ${w}x${d} door ${door} n ${n}`;
            expect(m.triangles, at).toBeGreaterThan(40);
            expect(m.min[0], at).toBeGreaterThanOrEqual(-w / 2 - 0.02);
            expect(m.max[0], at).toBeLessThanOrEqual(w / 2 + 0.02);
            expect(m.min[1], at).toBeGreaterThanOrEqual(0);
            expect(m.max[1], at).toBeLessThanOrEqual(3.1);
            expect(m.min[2], at).toBeGreaterThanOrEqual(-d - 0.02);
            expect(m.max[2], at).toBeLessThanOrEqual(0);
            if (w === 5.6 && door === 0 && n === 1) sizes.set(trade, m.parts.length * 100000 + m.triangles);
          }
    // Trades do not all come out as the same room.
    expect(new Set(sizes.values()).size).toBeGreaterThanOrEqual(18);
  });

  it('puts seats, a dashboard and a wheel behind the glass of every car', () => {
    const cars = MODELS.filter((m) => m.category === 'vehicle');
    expect(cars.length).toBeGreaterThanOrEqual(26);
    expect(textureSpec('vehicle/glass').decal).toBe(true);
    for (const c of cars) {
      const d = c.build();
      expect(d.parts.some((p) => p.material === 'vehicle/glass'), c.id).toBe(true);
      const parts = d.parts.find((p) => p.material === 'vehicle/parts')!;
      const [x0, x1, hw, top] = [d.min[0], d.max[0], Math.min(-d.min[2], d.max[2]), d.max[1]];
      let inside = 0;
      for (let i = 0; i < parts.positions.length; i += 3) {
        const [x, y, z] = [parts.positions[i], parts.positions[i + 1], parts.positions[i + 2]];
        if (x > x0 + 0.2 * (x1 - x0) && x < x1 - 0.2 * (x1 - x0) && Math.abs(z) < 0.7 * hw && y > 0.4 && y < top - 0.3) inside++;
      }
      expect(inside, c.id).toBeGreaterThanOrEqual(60);
      expect(d.triangles, c.id).toBeLessThan(900);
    }
  });
});

describe('people', { timeout: 120_000 }, () => {
  const all = Object.entries(PEOPLE).map(([id, who]) => ({ id, who: who as Person, data: MODELS.find((m) => m.id === `person/${id}`)!.build() }));
  const upright = new Set(['stand', 'relaxed', 'hips', 'pockets', 'phone', 'call', 'hold', 'wave', 'point']);

  it('stand on the ground at their own height, in a body, clothes and shoes', () => {
    expect(all.length).toBeGreaterThanOrEqual(40);
    for (const { id, who, data } of all) {
      for (const p of data.parts) for (const v of p.positions) expect(Number.isFinite(v), id).toBe(true);
      expect(Math.abs(data.min[1]), id).toBeLessThan(0.002);
      const used = new Set(data.parts.map((p) => p.material));
      for (const m of [`person/head-${who.head}`, `person/skin-${HEADS[who.head].tone + 1}`, `person/top-${who.top}`, 'person/shoes']) expect(used.has(m), `${id} ${m}`).toBe(true);
      const head = data.parts.find((p) => p.material === `person/head-${who.head}`)!;
      let top = 0;
      for (let i = 1; i < head.positions.length; i += 3) top = Math.max(top, head.positions[i]);
      // Hair stands a little above the skull; nobody is taller than that, and only those who sit, stoop or run are shorter.
      expect(top, id).toBeLessThan(who.height + 0.09);
      if (upright.has(who.pose) && HEADS[who.head].age <= 0.8) expect(top, id).toBeGreaterThan(who.height - 0.03);
      else expect(top, id).toBeGreaterThan(who.height * 0.62);
      // Narrow enough for a pavement, and nothing but an arm or a stride reaches far.
      expect(data.max[0] - data.min[0], id).toBeLessThan(1.0);
      expect(data.max[2] - data.min[2], id).toBeLessThan(1.3);
      expect(data.triangles, id).toBeGreaterThan(3000);
      expect(data.triangles, id).toBeLessThan(6000);
    }
  });

  it('differ in build, age, face, clothes and what they are doing', () => {
    const of = <T>(f: (w: Person) => T): Set<T> => new Set(all.map((a) => f(a.who)));
    expect(of((w) => w.head).size).toBeGreaterThanOrEqual(24);
    expect(of((w) => w.top).size).toBeGreaterThanOrEqual(36);
    expect(of((w) => w.bottom).size).toBeGreaterThanOrEqual(18);
    expect(of((w) => w.pose).size).toBeGreaterThanOrEqual(18);
    expect(of((w) => HEADS[w.head].tone).size).toBe(5);
    expect(of((w) => HEADS[w.head].style).size).toBeGreaterThanOrEqual(12);
    const n = (f: (w: Person) => boolean): number => all.filter((a) => f(a.who)).length;
    expect(n((w) => w.sex === 'f')).toBeGreaterThanOrEqual(18);
    expect(n((w) => w.sex === 'm')).toBeGreaterThanOrEqual(18);
    expect(n((w) => HEADS[w.head].age < 0.15)).toBeGreaterThanOrEqual(4);
    expect(n((w) => HEADS[w.head].age > 0.8)).toBeGreaterThanOrEqual(3);
    expect(n((w) => (w.girth ?? 1) > 1.3)).toBeGreaterThanOrEqual(3);
    expect(n((w) => (w.girth ?? 1) < 0.95)).toBeGreaterThanOrEqual(4);
    expect(n((w) => !!w.carry?.length)).toBeGreaterThanOrEqual(15);
    expect(n((w) => !!w.hat)).toBeGreaterThanOrEqual(6);
    // A child is shorter than every adult, with a larger head for the body.
    const kids = all.filter((a) => HEADS[a.who.head].age < 0.15);
    for (const k of kids) expect(k.who.height, k.id).toBeLessThan(1.45);
    // A heavy body is wider and deeper at the belly than a slim one of the same pose.
    const belly = (id: string): number => {
      const a = all.find((x) => x.id === id)!;
      const part = a.data.parts.find((p) => p.material === `person/top-${a.who.top}`)!;
      let z = 0;
      for (let i = 0; i < part.positions.length; i += 3) if (Math.abs(part.positions[i]) < 0.1 && part.positions[i + 1] > a.who.height * 0.5 && part.positions[i + 1] < a.who.height * 0.66) z = Math.max(z, part.positions[i + 2]);
      return z;
    };
    expect(belly('heavy-man')).toBeGreaterThan(belly('medic') + 0.05);
  });

  it('has a face, hair, clothes and shoes drawn for every look', () => {
    for (const id of Object.keys(HEADS)) expect(TEXTURES.some((t) => t.id === `person/head-${id}`), id).toBe(true);
    for (const id of Object.keys(TOPS)) expect(TEXTURES.some((t) => t.id === `person/top-${id}`), id).toBe(true);
    for (const id of Object.keys(BOTTOMS)) expect(TEXTURES.some((t) => t.id === `person/bottom-${id}`), id).toBe(true);
    // The eyes are darker than the cheeks beside them, and the hair differs from the forehead.
    const lum = (t: TextureData, u: number, v: number): number => {
      const [x, y] = [Math.floor(u * t.w), Math.floor(v * t.h)];
      const i = (Math.min(t.h - 1, y) * t.w + Math.min(t.w - 1, x)) * 4;
      return t.albedo[i] + t.albedo[i + 1] + t.albedo[i + 2];
    };
    for (const id of ['m-1', 'f-1', 'm-9', 'boy-1']) {
      const t = renderTexture(textureSpec(`person/head-${id}`), 0.5);
      let eye = Infinity;
      for (let du = 0.05; du < 0.08; du += 0.004) for (let v = 0.47; v < 0.53; v += 0.004) eye = Math.min(eye, lum(t, 0.5 + du, v));
      expect(eye, id).toBeLessThan(lum(t, 0.5 + 0.11, 0.36) - 120);
    }
  });

  it('is closed where parts meet: cuffs at a bent elbow, the wrists, under the chin', () => {
    // A cuff asked for inside the fold of a bent joint ends at the fold's edge, not a station short.
    const frame = (a: number): [[number, number, number], [number, number, number], [number, number, number]] => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]];
    const ss = [0, 0.3, 0.6, 0.86];
    const ends = (bend: number): number[] => limb([0, 1, 0], frame(0), 0.3, frame(bend), 0.25, () => 0.045, ss).map((q) => q.s);
    expect(ends(0)).toEqual(ss);
    for (const bend of [1.8, 2.3]) {
      const got = ends(bend);
      expect(got.length, `bend ${bend}`).toBe(ss.length);
      expect(got[3], `bend ${bend}`).toBeGreaterThan(0.6);
      expect(got[3], `bend ${bend}`).toBeLessThan(0.86);
    }
    const key = (p: { positions: number[] }, i: number): string => [0, 1, 2].map((k) => p.positions[i * 3 + k].toFixed(5)).join(',');
    for (const { id, who, data } of all) {
      // Skin reaches the wrist under every long sleeve: the hand is not left floating below the cuff.
      const skin = data.parts.filter((p) => p.material.startsWith('person/skin-'));
      expect(skin.reduce((n, p) => n + p.indices.length / 3, 0), id).toBeGreaterThanOrEqual(440);
      // The head has no open edge unless hair hangs from it as a sheet.
      const head = data.parts.find((p) => p.material === `person/head-${who.head}`)!;
      const edges = new Map<string, number>();
      for (let t = 0; t < head.indices.length; t += 3) {
        for (let e = 0; e < 3; e++) {
          const [a, c] = [key(head, head.indices[t + e]), key(head, head.indices[t + ((e + 1) % 3)])];
          if (a !== c) edges.set(a < c ? `${a}|${c}` : `${c}|${a}`, (edges.get(a < c ? `${a}|${c}` : `${c}|${a}`) ?? 0) + 1);
        }
      }
      const open = [...edges.values()].filter((n) => n === 1).length;
      const style = HAIRS[HEADS[who.head].style] as { ears?: boolean; thick: number };
      if (!(style.ears && style.thick < 0.1)) expect(open, id).toBe(0);
      // A phone faces outwards: each triangle winds the way its normals point.
      if (who.hat || who.carry?.join() !== 'phone') continue;
      for (const p of data.parts.filter((q) => q.material === 'person/gear')) {
        for (let t = 0; t < p.indices.length; t += 3) {
          const [a, c, d] = [0, 1, 2].map((e) => p.indices[t + e] * 3);
          const at = (i: number, k: number): number => p.positions[i + k];
          const e1 = [0, 1, 2].map((k) => at(c, k) - at(a, k));
          const e2 = [0, 1, 2].map((k) => at(d, k) - at(a, k));
          const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          if (Math.hypot(g[0], g[1], g[2]) < 1e-10) continue;
          const dot = [0, 1, 2].reduce((n, k) => n + g[k] * (p.normals[a + k] + p.normals[c + k] + p.normals[d + k]), 0);
          expect(dot, id).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
