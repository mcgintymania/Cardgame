import { makeCard, type Card, type Rank, type Suit } from '../src/core/cards.ts';
import type { SeatInfo } from '../src/core/game.ts';
import { defaultTake2Config, type Take2Config } from '../src/take2/config.ts';
import type { Take2State } from '../src/take2/types.ts';

/** Parse "5H 10S 2C JD QC KH AS" into cards. */
export function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).filter(Boolean).map((t) => {
    const suit = t.slice(-1) as Suit;
    const r = t.slice(0, -1);
    const rank = (r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : Number(r)) as Rank;
    return makeCard(rank, suit);
  });
}

export function seats(n: number): SeatInfo[] {
  return Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, isAI: false }));
}

/** Build an exact mid-round state for rule tests. Draw pile top = last card listed. */
export function makeState(opts: {
  hands: string[];
  discard: string;
  draw?: string;
  current?: number;
  config?: Partial<Take2Config>;
  totals?: number[];
}): Take2State {
  const config = { ...defaultTake2Config(), ...(opts.config ?? {}) };
  const discard = cards(opts.discard);
  return {
    config,
    players: opts.hands.map((h, seat) => ({
      seat, playerId: `p${seat}`, name: `P${seat}`, isAI: false, hand: cards(h),
      total: opts.totals?.[seat] ?? 0, eliminated: false, eliminatedInRound: null, roundsWon: 0,
      // Players set up holding one card are treated as having already called "last card".
      calledLastCard: cards(h).length === 1,
    })),
    drawPile: cards(opts.draw ?? ''),
    discard,
    activeSuit: discard[discard.length - 1].suit,
    direction: 1,
    current: opts.current ?? 0,
    phase: 'play',
    pending: null,
    drawnCardId: null,
    round: 1,
    roundStarter: 0,
    stall: 0,
    roundTurns: 0,
    turnCount: 0,
    history: [],
    winner: null,
  };
}
