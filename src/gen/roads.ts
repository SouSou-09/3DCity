import { Rng } from '../core/rng';
import { polyLength } from '../core/geom';
import { Vec2, clamp, dist } from '../core/vec2';
import { Districts, districtAt } from './districts';
import { Highways, addRamps, generateHighways } from './highways';
import { BRIDGE_APPROACH, EndReason, RoadBuilder, RoadLine } from './streamlines';
import { TensorField, buildField, fieldAngle, sepAt } from './tensorField';
import { Terrain, gradient, heightAt, hillAt, inBounds, isWater, riverBankAt, seaDistAt } from './terrain';

export interface RoadLines {
  lines: RoadLine[];
  field: TensorField;
  highways: Highways;
  interchanges: number;
}

/** Family whose streets run closest to the given direction at p. */
function familyAlong(field: TensorField, p: Vec2, angle: number): number {
  return Math.abs(Math.cos(fieldAngle(field, p.x, p.y, 0) - angle)) > 0.707 ? 0 : 1;
}

/** A boulevard that ignores the grid and cuts diagonally through downtown. */
function traceAvenue(builder: RoadBuilder, start: Vec2, angle: number, maxLen: number, rng: Rng): { pts: Vec2[]; reason: EndReason } {
  const t = builder.terrain;
  const pts: Vec2[] = [];
  let { x, y } = start;
  let a = angle;
  const bend = rng.range(-0.0005, 0.0005);
  let h = heightAt(t, x, y);
  for (let s = 0; s < maxLen; s += 6) {
    a += bend * 6;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let nx = x + dx * 6;
    let ny = y + dy * 6;
    if (!inBounds(t, nx, ny)) {
      pts.push({ x: nx, y: ny });
      return { pts, reason: 'bounds' };
    }
    if (isWater(t, nx, ny)) {
      const landing = seaDistAt(t, nx, ny) > 40 ? builder.findLanding(nx, ny, dx, dy) : null;
      if (!landing) return { pts, reason: 'water' };
      nx = landing.x;
      ny = landing.y;
    } else {
      const nh = heightAt(t, nx, ny);
      const approach = riverBankAt(t, nx, ny) < BRIDGE_APPROACH;
      if ((!approach && Math.abs(nh - h) / 6 > 0.12) || hillAt(t, nx, ny) > 0.5) return { pts, reason: 'steep' };
    }
    h = heightAt(t, nx, ny);
    pts.push({ x: nx, y: ny });
    x = nx;
    y = ny;
  }
  return { pts, reason: 'length' };
}

export function generateRoads(t: Terrain, districts: Districts, rng: Rng): RoadLines {
  const S = t.size;
  const highways = generateHighways(t, districts, rng.fork('highways'));
  const hwLines = [highways.main, highways.branch, highways.cross].filter((l): l is Vec2[] => !!l);
  const field = buildField(t, districts, hwLines, rng.fork('field'));
  const builder = new RoadBuilder(t, field);
  const style = (x: number, y: number) => districtAt(t, districts, x, y).style;

  const hwIds = [builder.addLine({ points: highways.main, cls: 'highway', family: -1, ends: ['bounds', 'bounds'] })];
  const branchId = highways.branch ? builder.addLine({ points: highways.branch, cls: 'highway', family: -1, ends: ['fixed', 'length'] }) : -1;
  const crossId = highways.cross ? builder.addLine({ points: highways.cross, cls: 'highway', family: -1, ends: ['fixed', 'bounds'] }) : -1;
  for (const id of [branchId, crossId]) if (id >= 0) hwIds.push(id);

  // Diagonal avenue through downtown.
  const dt = districts.downtown;
  const aRng = rng.fork('avenue');
  const avAngle = dt.angle + aRng.sign() * aRng.range(0.6, 0.95);
  const fwd = traceAvenue(builder, dt.center, avAngle, aRng.range(0.3, 0.55) * S, aRng);
  const bwd = traceAvenue(builder, dt.center, avAngle + Math.PI, aRng.range(0.3, 0.55) * S, aRng);
  const avenue = builder.addLine({
    points: [...bwd.pts.reverse(), dt.center, ...fwd.pts],
    cls: 'arterial',
    family: -1,
    ends: [bwd.reason, fwd.reason],
  });

  // Arterials: main streets through downtown, a coast road and riverside drives first.
  const seeds: { p: Vec2; family: number }[] = [
    { p: dt.center, family: 0 },
    { p: dt.center, family: 1 },
  ];
  const sRng = rng.fork('seeds');
  for (let i = 0, found = 0; i < 400 && found < 2; i++) {
    const p = { x: sRng.range(0.1, 0.9) * S, y: sRng.range(0.1, 0.9) * S };
    const sd = seaDistAt(t, p.x, p.y);
    if (sd < 65 || sd > 95 || riverBankAt(t, p.x, p.y) < 80) continue;
    const g = gradient(t, t.seaDist, p.x, p.y, 24);
    seeds.push({ p, family: familyAlong(field, p, Math.atan2(g.y, g.x) + Math.PI / 2) });
    found++;
  }
  for (const frac of [0.35, 0.6]) {
    const i = Math.floor(t.river.length * frac);
    const a = t.river[i];
    const b = t.river[i + 1];
    const l = dist(a, b);
    const nx = -(b.y - a.y) / l;
    const ny = (b.x - a.x) / l;
    for (const side of [1, -1]) {
      const p = { x: a.x + nx * side * 75, y: a.y + ny * side * 75 };
      if (inBounds(t, p.x, p.y, 20)) seeds.push({ p, family: familyAlong(field, p, Math.atan2(b.y - a.y, b.x - a.x)) });
    }
  }
  builder.runPass(
    {
      cls: 'arterial',
      sep: (x, y, f) => (f ? 440 : 380) * (1 + 0.8 * hillAt(t, x, y)),
      testRatio: 0.55,
      step: 6,
      minLength: 260,
      maxLength: () => Infinity,
      canBridge: true,
      maxGrade: 0.14,
      crossStop: () => 0,
      deadEnd: () => 0,
      seeds,
      randomTries: 300,
    },
    rng.fork('arterial'),
  );
  builder.joinEnds([avenue], () => 420, () => 0, aRng);

  const forbidden: { line: number; s: number }[] = [];
  if (branchId >= 0) forbidden.push({ line: hwIds[0], s: highways.branchS }, { line: branchId, s: 0 });
  if (crossId >= 0) forbidden.push({ line: hwIds[0], s: highways.crossS }, { line: crossId, s: 0 });
  const interchanges = addRamps(builder, hwIds, forbidden);

  const cRng = rng.fork('collector');
  builder.runPass(
    {
      cls: 'collector',
      sep: (x, y, f) => clamp(2.2 * sepAt(field, x, y, f), 175, 330),
      testRatio: 0.55,
      step: 6,
      minLength: 150,
      maxLength: () => cRng.range(500, 1700),
      canBridge: true,
      maxGrade: 0.17,
      crossStop: () => 0.1,
      deadEnd: () => 0,
      seeds: [],
      randomTries: 300,
    },
    cRng,
  );

  // The branch freeway ends at the first street ahead of it.
  if (branchId >= 0) builder.joinEnds([branchId], () => 380, () => 0, cRng);

  const lRng = rng.fork('local');
  builder.runPass(
    {
      cls: 'local',
      sep: (x, y, f) => sepAt(field, x, y, f),
      testRatio: 0.6,
      step: 5,
      minLength: 45,
      maxLength: (x, y) => {
        const s = style(x, y);
        return lRng.range(140, 420) / Math.max(0.12, s.crossStop);
      },
      canBridge: false,
      maxGrade: 0.2,
      crossStop: (x, y) => style(x, y).crossStop,
      deadEnd: (x, y) => style(x, y).culDeSac * 0.8,
      seeds: [],
      randomTries: 400,
    },
    lRng,
  );

  // Drop lines that degenerated to nothing.
  const lines = builder.lines.filter((l) => l.points.length >= 2 && polyLength(l.points) > 1);
  return { lines, field, highways, interchanges };
}
