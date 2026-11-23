import { TextureSpec } from './core';
import { BUILDING_TEXTURES } from './buildings';
import { FURNITURE_TEXTURES } from './furniture';
import { PLANT_TEXTURES } from './plants';
import { RAIL_TEXTURES } from './rail';
import { SITE_TEXTURES } from './site';
import { TRIM_TEXTURES } from './trims';
import { VEHICLE_TEXTURES } from './vehicles';
import { PROP_TEXTURES } from './props';
import { WINDOW_TEXTURES } from './windows';
import { DECALS } from './markings';
import { SURFACES } from './registry';
import { SIGNAL_TEXTURES } from './signals';
import { SIGN_TEXTURES } from './signs';

export * from './core';
export { signShape } from './signs';
export { SHOP_BAYS, WINDOW_SIZES } from './windows';
export { signOutline } from './signkit';
export { NAME_STYLES, STATIONS } from './rail';
export { VEHICLE_PARTS } from './vehicles';
export type { VehiclePart } from './vehicles';
export { PROP_PARTS } from './props';
export type { PropPart } from './props';
export type { SignShape } from './signkit';
export const TEXTURES: readonly TextureSpec[] = [...SURFACES, ...DECALS, ...SIGN_TEXTURES, ...SIGNAL_TEXTURES, ...FURNITURE_TEXTURES, ...PLANT_TEXTURES, ...BUILDING_TEXTURES, ...WINDOW_TEXTURES, ...TRIM_TEXTURES, ...RAIL_TEXTURES, ...SITE_TEXTURES, ...VEHICLE_TEXTURES, ...PROP_TEXTURES];
const byId = new Map(TEXTURES.map((t) => [t.id, t]));
export function textureSpec(id: string): TextureSpec {
  const t = byId.get(id);
  if (!t) throw new Error(`unknown texture ${id}`);
  return t;
}
