import { describe, expect, it } from 'vitest';
import { MODELS, MODEL_CATEGORIES, ModelCategory } from '../src/assets/mesh/registry';
import { TEXTURES, TextureCategory, TextureData, renderTexture, textureSpec } from '../src/assets/tex';

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
    const min: Record<TextureCategory, number> = { asphalt: 40, concrete: 12, paving: 30, curb: 8, ground: 10, structure: 20, line: 30, crosswalk: 15, symbol: 60, cover: 25, sign: 100, signal: 30, furniture: 80, plant: 50 };
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
    const min: Record<ModelCategory, number> = { segment: 40, highway: 10, slope: 12, curve: 8, junction: 25, roundabout: 8, sidewalk: 30, bridge: 25, elevated: 15, signal: 90, sign: 150, furniture: 250 };
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
