import { TextureSpec } from './core';
import { DECALS } from './markings';
import { SURFACES } from './registry';

export * from './core';
export const TEXTURES: readonly TextureSpec[] = [...SURFACES, ...DECALS];
const byId = new Map(TEXTURES.map((t) => [t.id, t]));
export function textureSpec(id: string): TextureSpec {
  const t = byId.get(id);
  if (!t) throw new Error(`unknown texture ${id}`);
  return t;
}
