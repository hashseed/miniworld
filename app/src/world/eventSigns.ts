// The signs put up before the events of the events dialog (humankind.md section 8.4).

import { detCos, detSin } from '../core/detmath.ts';
import type { Day } from '../time/calendar.ts';
import { hash01 } from '../core/hash.ts';
import { msAtDay } from '../time/rate.ts';
import type { CampPropPose } from './treeScene.ts';

/** What the signs need of an event of the startup index. */
export interface SignEvent {
  id: string;
  day: number;
  lat: number;
  lon: number;
}

/** A sign stands from this long (watching ms) before the event's time ... */
export const SIGN_LEAD_MS = 5_000;
/** ... to this long after it, and is put up and taken down in SIGN_RISE_MS. */
export const SIGN_STAY_MS = 20_000;
export const SIGN_RISE_MS = 1_500;
/** Layout metres north-east of the event's place. */
/** How much bigger than the model's own size the sign stands. */
export const SIGN_SIZE = 1.3;
const SIGN_OFFSET_M = 9;

/** The model of the sign of an era; metal signs are for later eras (section 8.4). */
export const signKind = (_day: Day): string => 'prop-sign-metal';

/** The signs standing at a clock time, as props to draw. */
export function signsAt(events: SignEvent[], ms: number, startDay: Day): CampPropPose[] {
  const out: CampPropPose[] = [];
  for (const e of events) {
    const t = msAtDay(e.day, startDay);
    const from = t - SIGN_LEAD_MS;
    const to = t + SIGN_STAY_MS;
    if (ms < from || ms >= to + SIGN_RISE_MS) continue;
    const grown = Math.min(1, (ms - from) / SIGN_RISE_MS, (to + SIGN_RISE_MS - ms) / SIGN_RISE_MS);
    const turn = (hash01(e.day, 41) - 0.5) * 0.5;
    out.push({
      id: `sign:${e.id}`,
      kind: signKind(e.day),
      lat: e.lat,
      lon: e.lon,
      x: SIGN_OFFSET_M * Math.SQRT1_2,
      z: SIGN_OFFSET_M * Math.SQRT1_2,
      // Facing south, a little askew.
      dirX: detSin(turn),
      dirZ: -detCos(turn),
      scale: SIGN_SIZE * Math.max(0.02 / SIGN_SIZE, grown * grown * (3 - 2 * grown)),
    });
  }
  return out;
}
