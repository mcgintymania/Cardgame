import type { Card } from '../core/cards.ts';
import type { Take2Scoring } from './config.ts';

export interface HandScore {
  base: number;        // sum of non-2 cards (or all cards in facevalue mode)
  twos: number;        // number of 2s
  multiplier: number;  // 2^twos in multiplier mode, otherwise 1
  total: number;
}

/**
 * Owner's spec: add the values of all non-2 cards, then double once per 2.
 * e.g. 5 + 10 + 2 + 2 → 15 × 4 = 60. A hand of only 2s scores 0 (flagged in docs).
 */
export function scoreHand(hand: readonly Card[], scoring: Take2Scoring): HandScore {
  let base = 0;
  let twos = 0;
  for (const c of hand) {
    if (c.rank === 2 && scoring.twoScoring === 'multiplier') twos++;
    else base += scoring.values[c.rank];
  }
  const multiplier = scoring.twoScoring === 'multiplier' ? 2 ** twos : 1;
  let total = base * multiplier;
  if (scoring.handCap !== null) total = Math.min(total, scoring.handCap);
  return { base, twos, multiplier, total };
}
