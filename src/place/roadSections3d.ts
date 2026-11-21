import { Age, Wear, highway, plainTex, street } from '../assets/mesh/presets';
import { Section } from '../assets/mesh/section';
import { DistrictType } from '../gen/districts';
import { RoadProfile } from '../gen/roadSections';
import { RoadClass } from '../gen/streamlines';

/** Road surfaces used in the city: a short list, so that the view needs few textures. */
const SURFACE: Record<string, [Age, Wear]> = {
  'fresh': ['fresh', 'clean'],
  'used-clean': ['used', 'clean'],
  'used-sealed': ['used', 'sealed'],
  'used-cracked': ['used', 'cracked'],
  'used-patched': ['used', 'cracked'],
  'used-broken': ['worn', 'patched'],
  'worn-clean': ['used', 'cracked'],
  'worn-sealed': ['used', 'sealed'],
  'worn-cracked': ['worn', 'cracked'],
  'worn-patched': ['worn', 'patched'],
  'worn-broken': ['worn', 'patched'],
  'bleached-clean': ['bleached', 'cracked'],
  'bleached-sealed': ['bleached', 'cracked'],
  'bleached-cracked': ['bleached', 'cracked'],
  'bleached-patched': ['bleached', 'patched'],
  'bleached-broken': ['bleached', 'patched'],
};
export function surface(p: RoadProfile): [Age, Wear] {
  return SURFACE[p.age === 'fresh' ? 'fresh' : `${p.age}-${p.wear}`] ?? ['used', 'clean'];
}

const WALK: Record<DistrictType, string> = {
  downtown: 'concrete/walk-long',
  midtown: 'concrete/walk-square-dirty',
  oldtown: 'concrete/walk-square-cracked',
  residential: 'concrete/walk-square',
  suburb: 'concrete/walk-square',
  hills: 'concrete/walk-plain',
  beach: 'concrete/walk-exposed',
  industrial: 'concrete/walk-square-cracked',
} as Record<DistrictType, string>;
const VERGE: Partial<Record<DistrictType, string>> = { suburb: 'ground/grass-mown', hills: 'ground/grass-dry', industrial: 'ground/gravel-dirt', beach: 'ground/grass-dry' };

export const HIGHWAY_DECK = 1.6;
export const RAMP_DECK = 0.9;

/** The catalogue cross-section for an edge's profile; `bridge` adds parapets. */
export function sectionFor(cls: RoadClass, p: RoadProfile, bridge: boolean): Section {
  const [age, wear] = surface(p);
  if (cls === 'highway') return highway({ lanes: p.lanes, laneW: p.laneW, age, wear, edge: 'barrier', median: 'barrier' });
  if (cls === 'ramp') return highway({ lanes: 1, dual: false, laneW: p.laneW, shoulder: 2, innerShoulder: 1, age, wear, edge: 'barrier' });
  const plain = plainTex(age, wear);
  const paint = age === 'bleached' ? 'faded' : 'worn';
  if (cls === 'alley') {
    const side = bridge ? { edge: 'railing' as const } : {};
    return { lanes: [{ kind: 'drive', w: p.laneW, dir: 0, tex: plain }], lines: [null, null], left: side, right: side, asphalt: plain, paint };
  }
  if (cls === 'path') {
    const tex = p.type === 'beach' || p.type === 'downtown' || p.type === 'midtown' ? 'concrete/walk-plain' : 'ground/gravel-fine';
    const side = bridge ? { edge: 'railing' as const } : {};
    return { lanes: [{ kind: 'shoulder', w: 2.6, dir: 0, tex }], lines: [null, null], left: side, right: side, asphalt: tex, paint };
  }
  const kerb = p.walk > 0 || p.verge > 0;
  return street({
    lanes: p.lanes,
    laneW: p.laneW,
    oneWay: p.oneWay,
    parking: p.parking,
    bike: p.bike ? (p.type === 'downtown' || p.type === 'beach' ? 'green' : 'plain') : false,
    bus: p.bus,
    median: p.median,
    medianW: p.median === 'turn' ? 3.4 : 2.4,
    medianTex: p.median === 'planted' ? 'ground/grass-patchy' : undefined,
    walk: p.walk > 0 ? (WALK[p.type] ?? 'concrete/walk-square') : null,
    walkW: p.walk,
    verge: p.verge > 0 ? (VERGE[p.type] ?? 'ground/grass-patchy') : null,
    vergeW: p.verge,
    curb: kerb ? (p.type === 'oldtown' ? 'curb/dirty' : 'curb/plain') : null,
    gutter: kerb && cls !== 'local',
    ground: kerb ? undefined : { w: 0.8, tex: 'ground/gravel-dirt' },
    centre: cls === 'local' ? null : undefined,
    age,
    wear,
    edge: bridge ? 'parapet' : undefined,
  });
}
