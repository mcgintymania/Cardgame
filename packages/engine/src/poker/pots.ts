// Main pot and side pots from what each player has put in this hand.

import type { SeatIndex } from '../core/game.ts';

export interface Contribution {
  seat: SeatIndex;
  amount: number;   // total chips put in this hand
  folded: boolean;
}

export interface Pot {
  amount: number;
  eligible: SeatIndex[]; // seats that can win it (not folded)
}

/**
 * Splits contributions into pots. Each all-in level among the players still in the hand
 * creates a new pot; folded players' chips stay in the pots they reached.
 * Assumes uncalled bets were already returned.
 */
export function buildPots(contribs: Contribution[]): Pot[] {
  const live = contribs.filter((c) => !c.folded && c.amount > 0);
  const levels = [...new Set(live.map((c) => c.amount))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contribs) amount += Math.max(0, Math.min(c.amount, level) - prev);
    const eligible = live.filter((c) => c.amount >= level).map((c) => c.seat);
    if (amount > 0) {
      // Merge with the previous pot when the same players are eligible (keeps the display tidy).
      const last = pots[pots.length - 1];
      if (last && last.eligible.length === eligible.length && last.eligible.every((s, i) => s === eligible[i])) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  // Chips above the highest live level can only come from folded players. Give them to the last pot.
  const leftover = contribs.reduce((sum, c) => sum + Math.max(0, c.amount - prev), 0);
  if (leftover > 0) {
    if (pots.length) pots[pots.length - 1].amount += leftover;
    else pots.push({ amount: leftover, eligible: live.map((c) => c.seat) });
  }
  return pots;
}

/**
 * Splits one pot between tied winners. Odd chips go one at a time to the winners
 * closest to the left of the dealer button.
 */
export function splitPot(amount: number, winners: SeatIndex[], button: SeatIndex, seatCount: number): Map<SeatIndex, number> {
  const out = new Map<SeatIndex, number>();
  if (winners.length === 0) return out;
  const share = Math.floor(amount / winners.length);
  let odd = amount - share * winners.length;
  const byPosition = winners.slice().sort((a, b) => ((a - button - 1 + seatCount) % seatCount) - ((b - button - 1 + seatCount) % seatCount));
  for (const w of byPosition) {
    out.set(w, share + (odd > 0 ? 1 : 0));
    if (odd > 0) odd--;
  }
  return out;
}
