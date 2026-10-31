// Blackjack, played as a club tournament: everyone starts with the same chips,
// plays a fixed number of hands against the dealer, and the biggest stack wins.
// Standard casino rules by default (six decks, dealer stands on soft 17,
// blackjack pays 3:2, double on any two cards, split up to four hands).
// See docs/BLACKJACK-DRAW.md.

import type { Card } from '../core/cards.ts';
import type { SeatIndex } from '../core/game.ts';

export interface BlackjackConfig {
  /** Hands in the tournament. */
  rounds: number;
  startingChips: number;
  minBet: number;
  maxBet: number;
  decks: number;
  /** Dealer hits soft 17 (H17) instead of standing (S17). */
  dealerHitsSoft17: boolean;
  /** 1.5 = 3:2, 1.2 = 6:5. */
  blackjackPays: number;
  doubleAfterSplit: boolean;
  /** Most hands one player can split into. */
  maxHands: number;
  /** Late surrender: give up half your bet on your first two cards. */
  surrender: boolean;
}

export function defaultBlackjackConfig(): BlackjackConfig {
  return { rounds: 12, startingChips: 1000, minBet: 10, maxBet: 500, decks: 6, dealerHitsSoft17: false, blackjackPays: 1.5, doubleAfterSplit: true, maxHands: 4, surrender: false };
}

export function normalizeBlackjackConfig(input?: Partial<BlackjackConfig>): BlackjackConfig {
  const d = defaultBlackjackConfig();
  const c = { ...d, ...(input ?? {}) };
  const int = (v: unknown, lo: number, hi: number, f: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : f);
  const minBet = int(c.minBet, 1, 1000, d.minBet);
  return {
    rounds: int(c.rounds, 3, 50, d.rounds),
    startingChips: int(c.startingChips, minBet * 10, 1000000, d.startingChips),
    minBet,
    maxBet: int(c.maxBet, minBet, 1000000, d.maxBet),
    decks: int(c.decks, 1, 8, d.decks),
    dealerHitsSoft17: !!c.dealerHitsSoft17,
    blackjackPays: c.blackjackPays === 1.2 ? 1.2 : 1.5,
    doubleAfterSplit: c.doubleAfterSplit !== false,
    maxHands: int(c.maxHands, 1, 4, d.maxHands),
    surrender: !!c.surrender,
  };
}

export type BJOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender';

export interface BJHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  done: boolean;
  surrendered: boolean;
  outcome: BJOutcome | null;
  /** Net chips won or lost on this hand (after settling). */
  net: number;
}

export interface BJPlayer {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  chips: number;
  /** Bet placed for the coming hand (null = not yet). */
  bet: number | null;
  hands: BJHand[];
  out: boolean;
  /** Final place once out or when the match ends. */
  place: number | null;
  blackjacks: number;
  handsWon: number;
}

export type BJPhase = 'bet' | 'play' | 'roundOver' | 'matchOver';

export interface BJRoundLine { seat: SeatIndex; hands: Array<{ cards: Card[]; bet: number; outcome: BJOutcome; net: number }>; net: number; chipsAfter: number }
export interface BJRoundResult { round: number; dealer: Card[]; dealerTotal: number; dealerBust: boolean; dealerBlackjack: boolean; lines: BJRoundLine[] }

export interface BlackjackState {
  config: BlackjackConfig;
  players: BJPlayer[];
  shoe: Card[];               // SECRET; top = end
  /** Reshuffle when the shoe gets below this. */
  cutCard: number;
  dealer: Card[];             // dealer[1] is the hole card, hidden until revealed
  holeRevealed: boolean;
  phase: BJPhase;
  round: number;
  current: { seat: SeatIndex; hand: number } | null;
  history: BJRoundResult[];
  placements: SeatIndex[] | null;
  /** Shuffles so far (shown when the shoe is reshuffled). */
  shuffles: number;
}

export type BJAction =
  | { type: 'bet'; amount: number }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double' }
  | { type: 'split' }
  | { type: 'surrender' }
  | { type: 'nextRound' };

export type BJEvent =
  | { type: 'shuffled' }
  | { type: 'betPlaced'; seat: SeatIndex; amount: number }
  | { type: 'dealt'; round: number }
  | { type: 'turn'; seat: SeatIndex; hand: number }
  | { type: 'card'; seat: SeatIndex | 'dealer'; hand: number; card: Card }
  | { type: 'acted'; seat: SeatIndex; hand: number; action: 'hit' | 'stand' | 'double' | 'split' | 'surrender' }
  | { type: 'bust'; seat: SeatIndex; hand: number }
  | { type: 'blackjack'; seat: SeatIndex | 'dealer' }
  | { type: 'holeRevealed'; card: Card }
  | { type: 'roundOver'; result: BJRoundResult }
  | { type: 'out'; seat: SeatIndex; place: number }
  | { type: 'matchOver'; placements: SeatIndex[] };

export interface BJOptions { hit: boolean; stand: boolean; double: boolean; split: boolean; surrender: boolean }

export interface BJPlayerPublic {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  chips: number;
  bet: number | null;
  hasBet: boolean;
  hands: BJHand[];
  out: boolean;
  place: number | null;
  blackjacks: number;
  handsWon: number;
}

/** Players' cards are dealt face up in blackjack, so all hands are public. The shoe and the dealer's hole card are not. */
export interface BlackjackView {
  seat: SeatIndex | null;
  config: BlackjackConfig;
  phase: BJPhase;
  round: number;
  players: BJPlayerPublic[];
  /** Dealer's visible cards (hole card only once revealed). */
  dealer: Array<Card | null>;
  dealerTotal: number | null;
  current: { seat: SeatIndex; hand: number } | null;
  options: BJOptions | null;
  /** Your bet limits for the coming hand. */
  betRange: [number, number] | null;
  shoeLeft: number;
  history: BJRoundResult[];
  placements: SeatIndex[] | null;
}
