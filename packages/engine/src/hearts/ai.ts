// Hearts AI. Sees only a HeartsView: its own hand and the cards played face up.

import type { Card } from '../core/cards.ts';
import type { Rng } from '../core/rng.ts';
import { cardPoints, isQueenOfSpades, openTrick, power } from './engine.ts';
import type { HeartsAction, HeartsView } from './types.ts';

export type HeartsPersonalityId = 'cautious' | 'aggressive' | 'unpredictable' | 'beginner' | 'expert';

interface P {
  /** Random noise added to each option's score. */
  noise: number;
  /** Chance of just playing any legal card. */
  random: number;
  /** Tracks which cards are gone (Q♠, high spades) and fishes for the queen. */
  counts: boolean;
  /** Tries to stop someone shooting the moon. */
  blocksMoon: boolean;
  thinkMs: [number, number];
}

export const HEARTS_PERSONALITIES: Record<HeartsPersonalityId, P & { label: string }> = {
  cautious: { label: 'Cautious', noise: 1.5, random: 0, counts: false, blocksMoon: true, thinkMs: [800, 1500] },
  aggressive: { label: 'Aggressive', noise: 2.5, random: 0.03, counts: true, blocksMoon: false, thinkMs: [500, 1000] },
  unpredictable: { label: 'Unpredictable', noise: 8, random: 0.1, counts: false, blocksMoon: false, thinkMs: [500, 1800] },
  beginner: { label: 'Beginner', noise: 10, random: 0.35, counts: false, blocksMoon: false, thinkMs: [900, 1800] },
  expert: { label: 'Expert', noise: 0.5, random: 0, counts: true, blocksMoon: true, thinkMs: [700, 1400] },
};

const pick = <T,>(xs: T[], rng: Rng) => xs[rng.int(xs.length)];

function bestBy(cards: Card[], score: (c: Card) => number, noise: number, rng: Rng): Card {
  let best = cards[0];
  let bestScore = -Infinity;
  for (const c of cards) {
    const v = score(c) + (rng.float() - 0.5) * noise;
    if (v > bestScore) { bestScore = v; best = c; }
  }
  return best;
}

export function chooseHeartsPass(view: HeartsView, p: P, rng: Rng): string[] {
  const hand = view.myHand;
  const spades = hand.filter((c) => c.suit === 'S').length;
  const len = (s: string) => hand.filter((c) => c.suit === s).length;
  const danger = (c: Card): number => {
    if (isQueenOfSpades(c)) return p.counts && spades >= 5 ? 4 : 60;
    if (c.suit === 'S' && power(c) > 12) return spades >= 5 ? 6 : 40;
    if (c.suit === 'H') return power(c) * 1.3;
    if (c.suit === 'C' && c.rank === 2) return -5;
    return power(c) * 0.9 + (len(c.suit) <= 2 ? 6 : 0);
  };
  const chosen: Card[] = [];
  const pool = hand.slice();
  while (chosen.length < 3) {
    const c = rng.float() < p.random ? pick(pool, rng) : bestBy(pool, danger, p.noise, rng);
    chosen.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  return chosen.map((c) => c.id);
}

export function chooseHeartsPlay(view: HeartsView, p: P, rng: Rng): string {
  const hand = view.myHand;
  const legal = hand.filter((c) => view.playableIds.includes(c.id));
  if (legal.length === 1) return legal[0].id;
  if (rng.float() < p.random) return pick(legal, rng).id;

  const played = view.tricks.flatMap((t) => t.plays.map((x) => x.card));
  const queenGone = played.some(isQueenOfSpades) || hand.some(isQueenOfSpades);
  const holdQueen = hand.some(isQueenOfSpades);
  const open = openTrick(view.tricks);
  const trickNo = view.tricks.length - (open ? 1 : 0);
  const firstTrick = trickNo === 0;

  // Moon watch: one opponent holds every point so far.
  const takenBy = view.players.map((pl) => pl.handPoints);
  const pointsOut = takenBy.reduce((a, b) => a + b, 0);
  const shooter = takenBy.findIndex((n, i) => n > 0 && n === pointsOut && i !== view.seat);
  const moonThreat = p.blocksMoon && shooter >= 0 && pointsOut >= 10;

  // ---------------------------------------------------------------- leading
  if (!open || open.plays.length === 0) {
    const c = bestBy(legal, (c) => {
      let v = -power(c);
      if (c.suit === 'H') v -= 4;
      if (c.suit === 'S') {
        if (isQueenOfSpades(c)) v -= 40;
        else if (power(c) > 12 && !queenGone) v -= 30;
        else if (p.counts && !holdQueen && !queenGone) v += 3; // smoke out the queen
      }
      if (moonThreat && c.suit === 'H') v += power(c) * 1.5; // lead a high heart they must beat
      return v;
    }, p.noise, rng);
    return c.id;
  }

  // -------------------------------------------------------------- following
  const led = open.plays[0].card.suit;
  const winning = open.plays.filter((x) => x.card.suit === led).reduce((m, x) => Math.max(m, power(x.card)), 0);
  const trickPts = open.plays.reduce((a, x) => a + cardPoints(x.card, view.config), 0);
  const last = open.plays.length === 3;
  const winnerSoFar = open.plays.find((x) => x.card.suit === led && power(x.card) === winning)!.seat;

  if (legal[0].suit === led) {
    // Stop a moon: take a trick with points from the shooter if we can.
    if (moonThreat && winnerSoFar === shooter && trickPts > 0) {
      const beat = legal.filter((c) => power(c) > winning && !isQueenOfSpades(c));
      if (beat.length) return beat.sort((a, b) => power(a) - power(b))[0].id;
    }
    const ducks = legal.filter((c) => power(c) < winning);
    if (last && trickPts === 0 && !firstTrick) {
      const safe = legal.filter((c) => !isQueenOfSpades(c));
      if (safe.length) return bestBy(safe, (c) => power(c), p.noise * 0.3, rng).id;
    }
    if (firstTrick) return bestBy(legal, (c) => power(c), p.noise * 0.3, rng).id; // no points can fall: dump high
    if (ducks.length) return bestBy(ducks, (c) => power(c), p.noise * 0.3, rng).id;
    // We'll win it anyway: shed the biggest card, but never volunteer the queen.
    const nonQ = legal.filter((c) => !isQueenOfSpades(c));
    return bestBy(nonQ.length ? nonQ : legal, (c) => power(c), p.noise * 0.3, rng).id;
  }

  // ---------------------------------------------------------------- sloughing
  const len = (s: string) => hand.filter((c) => c.suit === s).length;
  const c = bestBy(legal, (c) => {
    if (moonThreat) {
      // Don't give the shooter more points; dump a high non-point card instead.
      if (winnerSoFar === shooter && cardPoints(c, view.config) > 0) return -50;
    }
    if (isQueenOfSpades(c)) return 100;
    if (c.suit === 'S' && power(c) > 12 && !queenGone) return 70;
    if (c.suit === 'H') return 30 + power(c);
    return power(c) + (len(c.suit) <= 2 ? 4 : 0);
  }, p.noise, rng);
  return c.id;
}

export function heartsAI(view: HeartsView, personality: string | undefined, rng: Rng): HeartsAction {
  const p = HEARTS_PERSONALITIES[(personality as HeartsPersonalityId) ?? 'cautious'] ?? HEARTS_PERSONALITIES.cautious;
  if (view.phase === 'roundOver') return { type: 'nextRound' };
  if (view.phase === 'pass') return { type: 'pass', cardIds: chooseHeartsPass(view, p, rng) };
  return { type: 'play', cardId: chooseHeartsPlay(view, p, rng) };
}

export function heartsThinkMs(personality: string | undefined, rng: Rng): number {
  const p = HEARTS_PERSONALITIES[(personality as HeartsPersonalityId) ?? 'cautious'] ?? HEARTS_PERSONALITIES.cautious;
  return p.thinkMs[0] + rng.int(p.thinkMs[1] - p.thinkMs[0] + 1);
}
