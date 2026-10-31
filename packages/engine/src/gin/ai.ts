// Gin Rummy AI. Sees only a GinView: its own hand, the discard pile and what
// the opponent has picked up from it.

import type { Card } from '../core/cards.ts';
import type { Rng } from '../core/rng.ts';
import { bestArrangement, cardValue } from './melds.ts';
import type { GinAction, GinView } from './types.ts';

export type GinPersonalityId = 'cautious' | 'aggressive' | 'unpredictable' | 'beginner' | 'expert';

interface P {
  label: string;
  noise: number;
  /** Chance of making a careless choice. */
  sloppy: number;
  /** Avoids feeding the opponent cards that fit what they've picked up. */
  defends: boolean;
  /** Knock as soon as deadwood ≤ this (and ≤ knockMax). */
  knockAt: number;
  /** Later in the hand (small stock), knock at this instead. */
  knockLate: number;
  /** Also take a discard that only builds towards a meld (two of a kind / two in a row). */
  takesDraws: boolean;
  thinkMs: [number, number];
}

export const GIN_PERSONALITIES: Record<GinPersonalityId, P> = {
  cautious: { label: 'Cautious', noise: 1, sloppy: 0.02, defends: true, knockAt: 10, knockLate: 10, takesDraws: false, thinkMs: [900, 1600] },
  aggressive: { label: 'Aggressive', noise: 2, sloppy: 0.04, defends: false, knockAt: 4, knockLate: 10, takesDraws: true, thinkMs: [500, 1100] },
  unpredictable: { label: 'Unpredictable', noise: 6, sloppy: 0.12, defends: false, knockAt: 8, knockLate: 10, takesDraws: true, thinkMs: [500, 1900] },
  beginner: { label: 'Beginner', noise: 8, sloppy: 0.3, defends: false, knockAt: 6, knockLate: 6, takesDraws: false, thinkMs: [1000, 1900] },
  expert: { label: 'Expert', noise: 0.3, sloppy: 0, defends: true, knockAt: 10, knockLate: 10, takesDraws: false, thinkMs: [800, 1500] },
};

const dw = (cards: Card[]) => bestArrangement(cards).deadwoodValue;

/** Best discard from an 11-card hand: lowest resulting deadwood, then keep useful cards. */
function bestDiscard(hand: Card[], banned: string | null, view: GinView, p: P, rng: Rng): { card: Card; deadwood: number } {
  const oppSeat = view.seat === 0 ? 1 : 0;
  const oppPicks = view.players[oppSeat]?.pickups ?? [];
  let best: Card = hand[0];
  let bestScore = Infinity;
  let bestDw = Infinity;
  for (const c of hand) {
    if (c.id === banned) continue;
    const rest = hand.filter((x) => x.id !== c.id);
    const d = dw(rest);
    // Keep cards that are one away from a meld (pairs, near-runs): small penalty for throwing them.
    const potential = rest.filter((x) => x.rank === c.rank || (x.suit === c.suit && Math.abs(x.rank - c.rank) <= 2)).length;
    let danger = 0;
    if (p.defends) {
      for (const k of oppPicks) {
        if (k.rank === c.rank) danger += 6;
        else if (k.suit === c.suit && Math.abs(k.rank - c.rank) <= 2) danger += 4;
      }
    }
    const score = d * 10 + potential * 3 + danger - cardValue(c) * 0.5 + (rng.float() - 0.5) * p.noise * 10;
    if (score < bestScore) { bestScore = score; best = c; bestDw = d; }
  }
  return { card: best, deadwood: bestDw };
}

function wantsCard(view: GinView, card: Card, p: P): boolean {
  const hand = view.myHand;
  const now = dw(hand);
  const withIt = [...hand, card];
  // best result if we took it and threw something else away
  let after = Infinity;
  for (const c of hand) after = Math.min(after, dw(withIt.filter((x) => x.id !== c.id)));
  const arr = bestArrangement(withIt);
  const inMeld = arr.melds.some((m) => m.cards.some((x) => x.id === card.id));
  if (inMeld && after < now) return true;
  if (p.takesDraws && cardValue(card) <= 4 && hand.some((x) => x.rank === card.rank || (x.suit === card.suit && Math.abs(x.rank - card.rank) === 1))) return true;
  return false;
}

export function ginAI(view: GinView, personality: string | undefined, rng: Rng): GinAction {
  const p = GIN_PERSONALITIES[(personality as GinPersonalityId) ?? 'cautious'] ?? GIN_PERSONALITIES.cautious;
  switch (view.phase) {
    case 'roundOver':
      return { type: 'nextRound' };
    case 'offer':
      return view.topDiscard && wantsCard(view, view.topDiscard, p) && rng.float() >= p.sloppy ? { type: 'takeUpcard' } : { type: 'passUpcard' };
    case 'draw': {
      if (!view.stockOnly && view.topDiscard && wantsCard(view, view.topDiscard, p) && rng.float() >= p.sloppy) return { type: 'draw', source: 'discard' };
      return { type: 'draw', source: 'stock' };
    }
    case 'discard': {
      if (view.canBigGin) return { type: 'bigGin' };
      const sloppy = rng.float() < p.sloppy;
      const options = view.myHand.filter((c) => c.id !== view.takenFromDiscard);
      const choice = sloppy ? options[rng.int(options.length)] : bestDiscard(view.myHand, view.takenFromDiscard, view, p, rng).card;
      // Always take gin.
      const ginId = view.knockIds.find((id) => dw(view.myHand.filter((x) => x.id !== id)) === 0);
      if (ginId) return { type: 'knock', cardId: ginId };
      if (view.knockIds.length) {
        const late = view.stockCount < 14;
        const limit = Math.min(view.config.knockMax, late ? p.knockLate : p.knockAt);
        // knock with the discard that leaves the least deadwood
        let bestId = view.knockIds[0];
        let bestV = Infinity;
        for (const id of view.knockIds) {
          const v = dw(view.myHand.filter((x) => x.id !== id));
          if (v < bestV) { bestV = v; bestId = id; }
        }
        // Experts weigh undercut risk: a defender who's been picking up is probably close.
        const oppPicks = view.players[view.seat === 0 ? 1 : 0].pickups.length;
        const cautiousLimit = p === GIN_PERSONALITIES.expert && oppPicks >= 3 && !late ? Math.min(limit, 5) : limit;
        if (bestV <= cautiousLimit) return { type: 'knock', cardId: bestId };
      }
      return { type: 'discard', cardId: choice.id };
    }
  }
  return { type: 'draw', source: 'stock' };
}

export function ginThinkMs(personality: string | undefined, rng: Rng): number {
  const p = GIN_PERSONALITIES[(personality as GinPersonalityId) ?? 'cautious'] ?? GIN_PERSONALITIES.cautious;
  return p.thinkMs[0] + rng.int(p.thinkMs[1] - p.thinkMs[0] + 1);
}
