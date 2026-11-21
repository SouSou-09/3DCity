import { TextureSpec } from './core';
import { DECALS } from './markings';
import { SURFACES } from './registry';
import { SIGN_TEXTURES } from './signs';

export * from './core';
export { signShape } from './signs';
export { signOutline } from './signkit';
export type { SignShape } from './signkit';
export const TEXTURES: readonly TextureSpec[] = [...SURFACES, ...DECALS, ...SIGN_TEXTURES];
const byId = new Map(TEXTURES.map((t) => [t.id, t]));
export function textureSpec(id: string): TextureSpec {
  const t = byId.get(id);
  if (!t) throw new Error(`unknown texture ${id}`);
  return t;
}
