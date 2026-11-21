import { EdgeKind, Lane, MedianKind, Section, Side } from './section';

export type Age = 'fresh' | 'used' | 'worn' | 'bleached';
export type Wear = 'clean' | 'cracked' | 'sealed' | 'patched' | 'broken';
export const laneTex = (age: Age, wear: Wear = 'clean'): string => `asphalt/lane-${age}-${age === 'fresh' && wear !== 'clean' ? 'patched' : wear}`;
export const plainTex = (age: Age, wear: Wear = 'clean'): string => `asphalt/plain-${age}-${age === 'fresh' && wear !== 'clean' ? 'patched' : wear}`;
const paintFor = (age: Age): Section['paint'] => (age === 'fresh' ? 'new' : age === 'bleached' ? 'faded' : 'worn');

export interface StreetOpts {
  /** Driving lanes per direction (or in total for one-way streets). */
  lanes: number;
  laneW?: number;
  oneWay?: boolean;
  /** Parking lanes: on neither, the right, or both sides. */
  parking?: 0 | 1 | 2;
  bike?: false | 'plain' | 'green' | 'blue' | 'buffered';
  bus?: boolean;
  median?: MedianKind | 'turn' | null;
  medianW?: number;
  medianTex?: string;
  walk?: string | null;
  walkW?: number;
  verge?: string | null;
  vergeW?: number;
  curb?: string | null;
  gutter?: boolean;
  age?: Age;
  wear?: Wear;
  /** Centre line; null leaves the street unmarked. */
  centre?: string | null;
  edge?: EdgeKind;
  edgeTex?: string;
  /** Different treatment on the left side. */
  left?: Partial<Side> | null;
  ground?: { w: number; tex: string };
  arrows?: boolean;
}

/** City street cross-section: pavements, kerbs, parking, bike and bus lanes, medians. */
export function street(o: StreetOpts): Section {
  const age = o.age ?? 'used';
  const asphalt = laneTex(age, o.wear);
  const plain = plainTex(age, o.wear);
  const w = o.laneW ?? 3.3;
  const lanes: Lane[] = [];
  const lines: (string | null)[] = [];
  const half = (dir: 1 | -1): { lanes: Lane[]; lines: (string | null)[] } => {
    // Listed from the centre outwards; `lines[i]` is the line on the outer side of lane i.
    const ls: Lane[] = [];
    const li: (string | null)[] = [];
    for (let i = 0; i < o.lanes; i++) {
      const outer = i === o.lanes - 1;
      if (o.bus && outer && o.lanes > 1) {
        ls.push({ kind: 'bus', w: w + 0.2, dir, tex: `asphalt/coat-bus-red-${age === 'fresh' ? 15 : age === 'bleached' ? 80 : 50}`, symbols: ['symbol/text-bus-only'] });
      } else ls.push({ kind: 'drive', w, dir });
      li.push(outer ? null : o.bus && i === o.lanes - 2 ? 'line/bus-lane-line' : 'line/dashed-white');
    }
    if (o.bike) {
      const coat = o.bike === 'green' ? 'bike-green' : o.bike === 'blue' ? 'bike-blue' : null;
      if (o.bike === 'buffered') {
        ls.push({ kind: 'shoulder', w: 0.9, dir, tex: plain, overlay: 'line/bike-buffer' });
        li[li.length - 1] = null;
        li.push(null);
      } else li[li.length - 1] = 'line/solid-white';
      ls.push({ kind: 'bike', w: 1.6, dir, tex: coat ? `asphalt/coat-${coat}-${age === 'fresh' ? 15 : age === 'bleached' ? 80 : 50}` : plain, symbols: ['symbol/bike', 'symbol/arrow-bike'] });
      li.push(null);
    }
    if (o.parking === 2 || (o.parking === 1 && dir === 1)) {
      li[li.length - 1] = o.bike ? 'line/solid-white' : null;
      ls.push({ kind: 'parking', w: 2.4, dir, tex: plain, overlay: o.bike ? undefined : 'line/parking-ticks' });
      li.push(null);
    }
    return { lanes: ls, lines: li };
  };
  const right = half(1);
  if (o.oneWay) {
    // Parking on the left is added by hand; lanes run left to right.
    const leftPark: Lane[] = o.parking === 2 ? [{ kind: 'parking', w: 2.4, dir: 1, tex: plain, overlay: 'line/parking-ticks' }] : [];
    lanes.push(...leftPark, ...right.lanes);
    lines.push(null, ...(leftPark.length ? [null] : []), ...right.lines);
    if (!leftPark.length) lines[0] = o.lanes > 1 ? 'line/solid-yellow' : null;
  } else {
    const left = half(-1);
    lanes.push(...left.lanes.reverse());
    lines.push(...left.lines.reverse());
    const centre = o.centre === undefined ? (o.lanes > 1 ? 'line/double-yellow' : 'line/dashed-yellow') : o.centre;
    if (o.median) {
      const mw = o.medianW ?? (o.median === 'turn' ? 3.6 : o.median === 'painted' ? 1.8 : o.median === 'barrier' ? 1.2 : 3);
      const edgeLine = o.median === 'turn' || o.median === 'painted' ? null : 'line/solid-yellow';
      lines.push(edgeLine);
      lanes.push(o.median === 'turn' ? { kind: 'turn', w: mw, dir: 0, tex: plain } : { kind: 'median', w: mw, dir: 0, median: o.median, tex: o.median === 'raised' || o.median === 'planted' ? o.medianTex : plain });
      lines.push(edgeLine);
    } else lines.push(centre);
    lanes.push(...right.lanes);
    lines.push(...right.lines);
  }
  if (o.arrows) for (const l of lanes) if (l.kind === 'drive') l.symbols = ['symbol/arrow-straight'];
  const side: Side = {
    gutter: o.gutter ?? o.curb !== null,
    curb: o.curb === null ? undefined : (o.curb ?? 'curb/plain'),
    verge: o.verge ? { w: o.vergeW ?? 1.2, tex: o.verge } : undefined,
    walk: o.walk === null ? undefined : { w: o.walkW ?? 2.4, tex: o.walk ?? 'concrete/walk-square' },
    ground: o.ground,
    edge: o.edge,
    edgeTex: o.edgeTex,
  };
  return { lanes, lines, left: o.left === null ? {} : { ...side, ...o.left }, right: side, asphalt, paint: paintFor(age) };
}

export interface HighwayOpts {
  lanes: number;
  /** Both directions with a median, or a single carriageway (ramps, split roadways). */
  dual?: boolean;
  median?: MedianKind;
  medianW?: number;
  edge?: EdgeKind;
  edgeTex?: string;
  age?: Age;
  wear?: Wear;
  concrete?: boolean;
  shoulder?: number;
  innerShoulder?: number;
  laneW?: number;
  /** Grass or gravel beyond the shoulder (at ground level). */
  ground?: { w: number; tex: string };
  hov?: boolean;
}

/** Motorway and ramp cross-sections: shoulders, edge lines, median barrier. */
export function highway(o: HighwayOpts): Section {
  const age = o.age ?? 'used';
  const surface = o.concrete ? 'concrete/road-tined' : laneTex(age, o.wear);
  const shoulderTex = o.concrete ? 'concrete/road-tined-stained' : plainTex(age === 'fresh' ? 'used' : age, o.wear);
  const w = o.laneW ?? 3.6;
  const carriage = (dir: 1 | -1): { lanes: Lane[]; lines: (string | null)[] } => {
    // From the median outwards.
    const ls: Lane[] = [{ kind: 'shoulder', w: o.innerShoulder ?? 1.2, dir, tex: shoulderTex }];
    const li: (string | null)[] = ['line/solid-yellow'];
    for (let i = 0; i < o.lanes; i++) {
      ls.push({ kind: 'drive', w, dir, tex: surface, symbols: o.hov && i === 0 ? ['symbol/diamond'] : undefined });
      li.push(i === o.lanes - 1 ? 'line/solid-white' : o.hov && i === 0 ? 'line/double-white' : 'line/dashed-white');
    }
    ls.push({ kind: 'shoulder', w: o.shoulder ?? 3, dir, tex: shoulderTex });
    li.push(null);
    return { lanes: ls, lines: li };
  };
  const right = carriage(1);
  const side: Side = { edge: o.edge ?? 'barrier', edgeTex: o.edgeTex, ground: o.ground };
  const lanes: Lane[] = [];
  const lines: (string | null)[] = [];
  if (o.dual ?? true) {
    const left = carriage(-1);
    lanes.push(...left.lanes.reverse(), { kind: 'median', w: o.medianW ?? 0.8, dir: 0, median: o.median ?? 'barrier', tex: o.median === 'planted' ? 'ground/grass-dry' : shoulderTex }, ...right.lanes);
    lines.push(...left.lines.reverse(), null, null, ...right.lines);
  } else {
    lanes.push(...right.lanes);
    lines.push(null, ...right.lines);
  }
  return { lanes, lines, left: side, right: side, asphalt: surface, paint: paintFor(age) };
}
