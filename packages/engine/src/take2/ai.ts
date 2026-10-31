// Take 2 AI. It receives ONLY a Take2View — the same information a human sees —
// so it cannot peek at hidden hands or the deck order.

import { SUITS, type Card, type Suit } from '../core/cards.ts';
import type { Rng } from '../core/rng.ts';
import { scoreHand } from './scoring.ts';
import type { Take2Action, Take2View } from './types.ts';

export type Take2PersonalityId = 'cautious' | 'aggressive' | 'unpredictable' | 'beginner' | 'expert';

export interface Take2Personality {
  id: Take2PersonalityId;
  label: string;
  blurb: string;
  /** How much it values shedding penalty points (0–2). */
  shedWeight: number;
  /** How much it likes hitting the next player with 2s and 8s (0–2). */
  attackWeight: number;
  /** Tendency to hold Jacks as an escape card (0–2). */
  jackHoarding: number;
  /** Random noise added to every option's score. */
  noise: number;
  /** Chance of simply drawing even with a playable card. */
  lazyDrawChance: number;
  /** Chance of NOT stacking a 2 when it could. */
  stackReluctance: number;
  /** Chance of forgetting to announce "last card". */
  forgetLastCard: number;
  /** Thinking delay range in ms (used by the session, not the decision). */
  thinkMs: [number, number];
}

export const TAKE2_PERSONALITIES: Record<Take2PersonalityId, Take2Personality> = {
  cautious: {
    id: 'cautious', label: 'Cautious', blurb: 'Dumps high cards early, keeps Jacks as a lifeline.',
    shedWeight: 1.6, attackWeight: 0.5, jackHoarding: 1.5, noise: 1, lazyDrawChance: 0, stackReluctance: 0.15,
    forgetLastCard: 0.02,
    thinkMs: [900, 1700],
  },
  aggressive: {
    id: 'aggressive', label: 'Aggressive', blurb: 'Loves a +2 and never lets a skip go to waste.',
    shedWeight: 1, attackWeight: 1.8, jackHoarding: 0.4, noise: 1.5, lazyDrawChance: 0, stackReluctance: 0,
    forgetLastCard: 0.04,
    thinkMs: [600, 1200],
  },
  unpredictable: {
    id: 'unpredictable', label: 'Unpredictable', blurb: 'Hard to read. Sometimes brilliant, sometimes not.',
    shedWeight: 1, attackWeight: 1, jackHoarding: 0.8, noise: 9, lazyDrawChance: 0.08, stackReluctance: 0.3,
    forgetLastCard: 0.12,
    thinkMs: [500, 2200],
  },
  beginner: {
    id: 'beginner', label: 'Beginner', blurb: 'Still learning. Plays the first thing that looks right.',
    shedWeight: 0.3, attackWeight: 0.3, jackHoarding: 0, noise: 12, lazyDrawChance: 0.2, stackReluctance: 0.5,
    forgetLastCard: 0.3,
    thinkMs: [1000, 2000],
  },
  expert: {
    id: 'expert', label: 'Expert', blurb: 'Reads the table and times every 2.',
    shedWeight: 1.5, attackWeight: 1.4, jackHoarding: 1.1, noise: 0.4, lazyDrawChance: 0, stackReluctance: 0,
    forgetLastCard: 0,
    thinkMs: [900, 1800],
  },
};

function bestSuit(hand: Card[], v: Take2View, exclude?: string): Suit {
  // Choose the suit where we hold the most penalty value to shed.
  const weight = new Map<Suit, number>(SUITS.map((s) => [s, 0]));
  for (const c of hand) {
    if (c.id === exclude || c.rank === 11) continue;
    weight.set(c.suit, (weight.get(c.suit) ?? 0) + 1 + v.config.scoring.values[c.rank] / 10);
  }
  return [...SUITS].sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0))[0];
}

/** Announce "last card" when a play leaves one card (personalities sometimes forget). */
function withLastCardCall(a: Take2Action, v: Take2View, pers: Take2Personality, rng: Rng): Take2Action {
  if (a.type !== 'play' || !v.config.lastCardCall || v.hand.length !== 2) return a;
  return rng.float() < pers.forgetLastCard ? a : { ...a, lastCard: true };
}

export function take2ChooseAction(v: Take2View, personalityId: string | undefined, rng: Rng): Take2Action {
  const pers = TAKE2_PERSONALITIES[(personalityId as Take2PersonalityId) ?? 'cautious'] ?? TAKE2_PERSONALITIES.cautious;
  const legal = v.legal;
  if (legal.length === 0) throw new Error('AI asked to act with no legal actions');
  if (legal.length === 1) return withLastCardCall(legal[0], v, pers, rng);

  if (v.phase === 'chooseSuit') return { type: 'chooseSuit', suit: bestSuit(v.hand, v) };

  const plays = legal.filter((a): a is Extract<Take2Action, { type: 'play' }> => a.type === 'play');
  const fallback = legal.find((a) => a.type !== 'play')!;

  // Responding to a stacked +2 or a skip
  if (v.pending) {
    if (plays.length && rng.float() >= pers.stackReluctance) return withLastCardCall({ ...plays[0] }, v, pers, rng);
    return fallback;
  }
  if (plays.length === 0) return fallback;
  if (v.phase === 'play' && rng.float() < pers.lazyDrawChance && legal.some((a) => a.type === 'draw')) {
    return { type: 'draw' };
  }

  const n = v.players.length;
  const step = (i: number) => {
    for (let k = 1; k <= n; k++) {
      const j = (i + v.direction * k + n * 4) % n;
      if (!v.players[j].eliminated) return j;
    }
    return i;
  };
  const next = v.players[step(v.seat!)];
  const myTotal = v.players[v.seat!].total;
  const danger = myTotal / v.config.eliminationAt; // 0..1+, how close we are to elimination
  const currentScore = scoreHand(v.hand, v.config.scoring).total;

  let best: Take2Action = plays[0];
  let bestScore = -Infinity;
  for (const a of plays) {
    const card = v.hand.find((c) => c.id === a.cardId)!;
    const rest = v.hand.filter((c) => c.id !== a.cardId);
    const after = scoreHand(rest, v.config.scoring).total;
    let score = (currentScore - after) / 5 * pers.shedWeight * (1 + danger);

    if (rest.length === 0) score += 1000; // going out always wins the round
    if (card.rank === 2) score += (2 + (7 - Math.min(next.cardCount, 7))) * pers.attackWeight;
    if (card.rank === 8 && v.config.eightSkips) score += (1 + (7 - Math.min(next.cardCount, 7)) / 2) * pers.attackWeight;
    // You can't finish on a Jack, so don't get stuck holding one at the end.
    if (v.config.noFinishOnJack && rest.length === 1 && rest[0].rank === 11) score -= 9;
    if (card.rank === 11) {
      // A Jack is worth 20 penalty points but also an escape hatch.
      const hoard = pers.jackHoarding * (rest.length > 2 ? 3 : 0);
      score -= hoard;
    }
    // Prefer keeping options: count how many follow-up plays remain on our own suit.
    const sameSuit = rest.filter((c) => c.suit === card.suit).length;
    score += sameSuit * 0.4;
    score += (rng.float() - 0.5) * pers.noise;

    if (score > bestScore) {
      bestScore = score;
      best = card.rank === 11 && v.config.jackAction === 'changeSuit'
        ? { type: 'play', cardId: card.id, suit: bestSuit(rest, v) }
        : { ...a };
    }
  }
  return withLastCardCall(best, v, pers, rng);
}
