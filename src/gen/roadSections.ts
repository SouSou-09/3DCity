import { DistrictType } from './districts';
import { RoadClass } from './streamlines';

/** Width of the right of way (kerb to kerb plus pavements and verges), metres. Lots start at its edge. */
const ROW: Record<RoadClass, number> = { highway: 32, ramp: 9, arterial: 28, collector: 19, local: 15, alley: 6, path: 3 };
const ROW_BY_DISTRICT: Partial<Record<RoadClass, Partial<Record<DistrictType, number>>>> = {
  arterial: { downtown: 34, midtown: 32, industrial: 24, hills: 20, oldtown: 24 },
  collector: { downtown: 21, midtown: 20, hills: 12, oldtown: 15, beach: 17 },
  local: { downtown: 16, midtown: 16, oldtown: 10.5, suburb: 17, hills: 8, industrial: 14, beach: 11 },
  alley: { industrial: 8, oldtown: 5 },
};
export const rowWidth = (cls: RoadClass, type: DistrictType): number => ROW_BY_DISTRICT[cls]?.[type] ?? ROW[cls];
