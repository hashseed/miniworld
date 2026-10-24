// A figure's outings and how often each is chosen (spec humankind.md section 8.1).

import { hash01 } from '../../core/hash.ts';
import type { FigureLook } from './types.ts';

export type Outing =
  | 'rest'
  | 'gather'
  | 'hunt'
  | 'stroll'
  | 'firewood'
  | 'water'
  | 'scrape'
  | 'crack'
  | 'spear'
  | 'cook'
  | 'flay'
  | 'rack'
  | 'fish'
  | 'hut'
  // The Neolithic village's work (section 8.5).
  | 'till'
  | 'sow'
  | 'reap'
  | 'thresh'
  | 'grind'
  | 'milk'
  | 'shape'
  | 'spin';

/** Shares of a figure's turns by activity (section 8.1), the rest of its turns rests. */
// Hunting was most of a man's turns until Yang, 2026-10-20: "activities are often just
// hunting. what about other activities?"
export const OUTING_SHARES: Record<FigureLook, [Outing, number][]> = {
  man: [
    ['hunt', 0.25],
    ['spear', 0.12],
    ['firewood', 0.1],
    ['water', 0.05],
    ['fish', 0.08],
    ['hut', 0.1],
    ['flay', 0.08],
    ['rack', 0.04],
    ['stroll', 0.05],
  ],
  founder: [
    ['hunt', 0.18],
    ['gather', 0.1],
    ['firewood', 0.08],
    ['water', 0.06],
    ['crack', 0.1],
    ['cook', 0.08],
    ['flay', 0.05],
    ['hut', 0.1],
    ['stroll', 0.05],
  ],
  woman: [
    ['gather', 0.18],
    ['scrape', 0.12],
    ['crack', 0.1],
    ['water', 0.1],
    ['fish', 0.04],
    ['firewood', 0.08],
    ['cook', 0.12],
    ['flay', 0.06],
    ['rack', 0.06],
    ['hut', 0.1],
    ['stroll', 0.04],
  ],
  child: [
    ['gather', 0.15],
    ['crack', 0.12],
    ['hut', 0.14],
    ['stroll', 0.15],
  ],
};

/** What a figure does in one of its turns (section 8.1), chosen by hash from its look's shares. */
export function outingOf(id: number, look: FigureLook, turn: number): Outing {
  let roll = hash01(id, turn, 71);
  for (const [outing, share] of OUTING_SHARES[look]) {
    if (roll < share) return outing;
    roll -= share;
  }
  return 'rest';
}
