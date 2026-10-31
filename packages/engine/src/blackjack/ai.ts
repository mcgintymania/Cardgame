// Blackjack AI: basic strategy for playing, personality for betting.
// Sees only the view: its own and others' face-up cards, the dealer's upcard and the chip counts.

import type { Rng } from '../core/rng.ts';
import { cardPoints, handValue } from './engine.ts';
import type { BJAction, BlackjackView } from './types.ts';

export type BJPersonalityId = 'cautious' | 'aggressive' | 'unpredictable' | 'beginner' | 'expert';

interface P {
  label: string;
  /** Usual bet as a share of chips. */
  betShare: [number, number];
  /** Follows basic strategy this often (otherwise uses a hunch). */
  discipline: number;
  /** Plays the tournament: bets bigger when behind late on, smaller when ahead. */
  tactical: boolean;
  thinkMs: [number, number];
}

export const BJ_PERSONALITIES: Record<BJPersonalityId, P> = {
  cautious: { label: 'Careful', betShare: [0.02, 0.05], discipline: 0.92, tactical: false, thinkMs: [700, 1300] },
  aggressive: { label: 'Aggressive', betShare: [0.08, 0.2], discipline: 0.85, tactical: false, thinkMs: [400, 900] },
  unpredictable: { label: 'Unpredictable', betShare: [0.02, 0.3], discipline: 0.7, tactical: false, thinkMs: [400, 1500] },
  beginner: { label: 'Beginner', betShare: [0.03, 0.12], discipline: 0.45, tactical: false, thinkMs: [900, 1600] },
  expert: { label: 'Expert', betShare: [0.04, 0.1], discipline: 1, tactical: true, thinkMs: [600, 1200] },
};

type Move = 'H' | 'S' | 'D' | 'P' | 'R';

/**
 * Basic strategy for six decks, dealer stands on soft 17, double after split.
 * D = double (else hit), Ds = double (else stand), P = split, R = surrender (else hit).
 */
export function basicStrategy(cards: { rank: number }[], up: number, opts: { canDouble: boolean; canSplit: boolean; canSurrender: boolean }): Move {
  const v = handValue(cards as never);
  const pts = cards.map((c) => cardPoints(c as never));
  const d = up; // 2..11 (ace = 11)
  if (opts.canSplit && cards.length === 2 && pts[0] === pts[1]) {
    const r = pts[0] === 1 ? 11 : pts[0];
    const split =
      r === 11 || r === 8 ? true
        : r === 10 ? false
          : r === 9 ? (d <= 9 && d !== 7)
            : r === 7 ? d <= 7
              : r === 6 ? d <= 6
                : r === 5 ? false
                  : r === 4 ? d === 5 || d === 6
                    : d <= 7; // 2s and 3s
    if (split) return 'P';
  }
  const dbl = (m: boolean, fallback: Move): Move => (m && opts.canDouble ? 'D' : fallback);
  if (v.soft && cards.length >= 2) {
    const t = v.total;
    if (t >= 20) return 'S';
    if (t === 19) return dbl(d === 6, 'S');
    if (t === 18) return d >= 3 && d <= 6 ? dbl(true, 'S') : d === 2 || d === 7 || d === 8 ? 'S' : 'H';
    if (t === 17) return dbl(d >= 3 && d <= 6, 'H');
    if (t === 16 || t === 15) return dbl(d >= 4 && d <= 6, 'H');
    return dbl(d === 5 || d === 6, 'H');
  }
  const t = v.total;
  if (opts.canSurrender && ((t === 16 && d >= 9) || (t === 15 && d === 10))) return 'R';
  if (t >= 17) return 'S';
  if (t >= 13) return d <= 6 ? 'S' : 'H';
  if (t === 12) return d >= 4 && d <= 6 ? 'S' : 'H';
  if (t === 11) return dbl(d !== 11, 'H');
  if (t === 10) return dbl(d <= 9, 'H');
  if (t === 9) return dbl(d >= 3 && d <= 6, 'H');
  return 'H';
}

export function blackjackAI(view: BlackjackView, personality: string | undefined, rng: Rng): BJAction {
  const p = BJ_PERSONALITIES[(personality as BJPersonalityId) ?? 'cautious'] ?? BJ_PERSONALITIES.cautious;
  if (view.phase === 'roundOver') return { type: 'nextRound' };
  const me = view.players[view.seat!];
  if (view.phase === 'bet') {
    const [lo, hi] = view.betRange ?? [view.config.minBet, view.config.minBet];
    let share = p.betShare[0] + rng.float() * (p.betShare[1] - p.betShare[0]);
    if (p.tactical) {
      const left = view.config.rounds - view.round + 1;
      const leader = Math.max(...view.players.filter((x) => x.seat !== me.seat && !x.out).map((x) => x.chips), 0);
      const gap = leader - me.chips;
      if (left <= 3 && gap > 0) share = Math.max(share, Math.min(1, (gap + view.config.minBet) / Math.max(1, me.chips)));
      else if (left <= 3 && gap < 0) share = 0;
    }
    const amt = Math.round((me.chips * share) / 5) * 5;
    return { type: 'bet', amount: Math.max(lo, Math.min(hi, amt)) };
  }
  const o = view.options;
  if (!o || !view.current) return { type: 'stand' };
  const hand = me.hands[view.current.hand];
  const upCard = view.dealer[0]!;
  const up = upCard.rank === 1 ? 11 : cardPoints(upCard);
  const total = handValue(hand.cards).total;
  if (rng.float() > p.discipline) {
    // A hunch: beginners hate busting, wild players love doubling.
    if (personality === 'beginner') return total >= 12 ? { type: 'stand' } : { type: 'hit' };
    if (o.double && total >= 8 && total <= 12 && rng.float() < 0.5) return { type: 'double' };
    return total >= 15 + rng.int(4) ? { type: 'stand' } : { type: 'hit' };
  }
  const m = basicStrategy(hand.cards, up, { canDouble: o.double, canSplit: o.split, canSurrender: o.surrender });
  if (m === 'P') return { type: 'split' };
  if (m === 'D') return { type: 'double' };
  if (m === 'R') return { type: 'surrender' };
  return m === 'S' ? { type: 'stand' } : { type: 'hit' };
}

export function blackjackThinkMs(personality: string | undefined, rng: Rng): number {
  const p = BJ_PERSONALITIES[(personality as BJPersonalityId) ?? 'cautious'] ?? BJ_PERSONALITIES.cautious;
  return p.thinkMs[0] + rng.int(p.thinkMs[1] - p.thinkMs[0] + 1);
}
