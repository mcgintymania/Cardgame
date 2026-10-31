// Hold'em AI. Works ONLY from a PokerView: its own two cards, the board, stacks,
// bets and the pot. It estimates its chances by dealing random cards to opponents
// (Monte Carlo) — it never sees their real cards or the deck order.

import { standardDeck, type Card } from '../core/cards.ts';
import type { Rng } from '../core/rng.ts';
import { quickScore } from './evaluator.ts';
import type { PokerAction, PokerView } from './types.ts';

export type PokerPersonalityId = 'cautious' | 'aggressive' | 'unpredictable' | 'beginner' | 'expert';

export interface PokerPersonality {
  id: PokerPersonalityId;
  label: string;
  blurb: string;
  /** Strength (1 = an average hand at this table) needed to bet when nobody has. */
  betAt: number;
  /** Strength needed to raise a bet. */
  raiseAt: number;
  /** How much worse than the pot odds it will still call (positive = looser, negative = tighter). */
  looseness: number;
  bluff: number;
  /** Chance of calling regardless. */
  callStation: number;
  /** Random wobble added to its strength estimate. */
  noise: number;
  /** Monte Carlo deals per decision (fewer = sloppier reads). */
  sims: number;
  thinkMs: [number, number];
}

export const POKER_PERSONALITIES: Record<PokerPersonalityId, PokerPersonality> = {
  cautious: {
    id: 'cautious', label: 'Tight', blurb: 'Waits for good cards, then bets them.',
    betAt: 1.35, raiseAt: 1.75, looseness: -0.06, bluff: 0.03, callStation: 0, noise: 0.08, sims: 320, thinkMs: [1100, 2200],
  },
  aggressive: {
    id: 'aggressive', label: 'Aggressive', blurb: 'Bets and raises a lot. Bluffs often.',
    betAt: 1.1, raiseAt: 1.4, looseness: -0.01, bluff: 0.2, callStation: 0.02, noise: 0.12, sims: 320, thinkMs: [700, 1500],
  },
  unpredictable: {
    id: 'unpredictable', label: 'Wild card', blurb: 'Hard to read. Mixes it up.',
    betAt: 1.2, raiseAt: 1.55, looseness: 0, bluff: 0.14, callStation: 0.07, noise: 0.45, sims: 260, thinkMs: [600, 2600],
  },
  beginner: {
    id: 'beginner', label: 'Beginner', blurb: 'Calls too much and rarely bluffs.',
    betAt: 1.55, raiseAt: 2.3, looseness: 0.1, bluff: 0.02, callStation: 0.32, noise: 0.25, sims: 120, thinkMs: [1300, 2400],
  },
  expert: {
    id: 'expert', label: 'Shark', blurb: 'Patient, precise and hard to bluff.',
    betAt: 1.25, raiseAt: 1.6, looseness: -0.03, bluff: 0.1, callStation: 0, noise: 0.04, sims: 500, thinkMs: [1000, 2200],
  },
};

/** Chance of winning (ties count as a share) against `opponents` random hands. */
export function estimateEquity(hole: Card[], board: Card[], opponents: number, sims: number, rng: Rng): number {
  const known = new Set([...hole, ...board].map((c) => c.id));
  const deck = standardDeck().filter((c) => !known.has(c.id));
  const opp = Math.max(1, Math.min(opponents, 6));
  const need = 2 * opp + (5 - board.length);
  let won = 0;
  const fullBoard: Card[] = board.slice();
  for (let i = 0; i < sims; i++) {
    // partial Fisher–Yates: the last `need` cards become our sample
    for (let k = 0; k < need; k++) {
      const j = rng.int(deck.length - k);
      const last = deck.length - 1 - k;
      const t = deck[j]; deck[j] = deck[last]; deck[last] = t;
    }
    let idx = deck.length - 1;
    fullBoard.length = board.length;
    while (fullBoard.length < 5) fullBoard.push(deck[idx--]);
    const mine = quickScore([...hole, ...fullBoard]);
    let best = 0;
    let ties = 0;
    for (let o = 0; o < opp; o++) {
      const sc = quickScore([deck[idx--], deck[idx--], ...fullBoard]);
      if (sc > best) { best = sc; ties = 0; }
      if (sc === best) ties++;
    }
    if (mine > best) won += 1;
    else if (mine === best) won += 1 / (ties + 1);
  }
  return won / sims;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function pokerChooseAction(v: PokerView, personalityId: string | undefined, rng: Rng): PokerAction {
  if (v.street === 'handOver') return { type: 'nextHand' };
  const o = v.options;
  if (!o || v.seat === null) return v.legal[0] ?? { type: 'fold' };
  const pers = POKER_PERSONALITIES[(personalityId as PokerPersonalityId) ?? 'cautious'] ?? POKER_PERSONALITIES.cautious;
  const opponents = v.players.filter((p) => p.inHand && p.seat !== v.seat).length;
  const equity = estimateEquity(v.hole, v.board, opponents, pers.sims, rng);
  return decideBet(v, pers, equity, rng);
}

/** Turns an equity estimate into fold / check / call / bet / raise. Shared by Hold'em and Draw. */
export function decideBet(v: PokerView, pers: PokerPersonality, equity: number, rng: Rng): PokerAction {
  const o = v.options!;
  const me = v.players[v.seat!];
  const opponents = v.players.filter((p) => p.inHand && p.seat !== v.seat).length;
  const pot = v.totalPot;
  const bb = v.bigBlind;
  const facing = o.toCall > 0;
  // Someone who bets usually has something: the bigger the bet, the less our
  // "against random cards" equity is worth.
  const potBefore = Math.max(pot - o.toCall, bb);
  const betFrac = o.toCall / potBefore;
  const discount = facing && o.toCall > bb ? Math.min(0.4, 0.1 + 0.2 * betFrac) : 0;
  const adj = equity * (1 - discount);
  // 1.0 means "about as good as an average hand here"
  const strength = adj * (opponents + 1) + (rng.float() - 0.5) * pers.noise * 2;
  const shortStack = me.stack + me.bet <= bb * 12;
  const preflop = v.street === 'preflop';

  const raiseTo = (target: number): PokerAction => {
    const rounded = Math.round(target / 5) * 5 || o.minRaiseTo;
    const to = clamp(rounded, o.minRaiseTo, o.maxRaiseTo);
    if (to >= o.maxRaiseTo * 0.75) return { type: 'allIn' };
    return { type: 'raise', to };
  };
  const sizeBet = () => (preflop
    ? Math.max(v.currentBet, bb) * (2.5 + rng.float())
    : v.currentBet + pot * (0.5 + rng.float() * 0.35));

  if (!facing) {
    if (o.canRaise && (strength > pers.betAt || rng.float() < pers.bluff)) {
      if (shortStack && strength > pers.raiseAt) return { type: 'allIn' };
      return raiseTo(sizeBet());
    }
    return { type: 'check' };
  }

  if (o.canRaise && strength > pers.raiseAt && rng.float() < 0.75) {
    if (strength > pers.raiseAt + 1.2 && (shortStack || betFrac > 0.9)) return { type: 'allIn' };
    return raiseTo(sizeBet());
  }
  if (o.canRaise && !preflop && rng.float() < pers.bluff * 0.3 && betFrac < 0.5) return raiseTo(v.currentBet * 2.5);

  const potOdds = o.toCall / (pot + o.toCall);
  const cheap = o.toCall <= bb / 2 + 1; // completing the small blind
  const preflopOk = !preflop || cheap || strength > 1.05 - pers.looseness * 2;
  if ((preflopOk && adj >= potOdds - pers.looseness) || rng.float() < pers.callStation * (o.toCall > me.stack / 3 ? 0.3 : 1)) {
    return { type: 'call' };
  }
  return { type: 'fold' };
}
