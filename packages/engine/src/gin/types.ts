// Gin Rummy: types, config and the per-seat view. Standard two-player rules:
// 10 cards each, draw from stock or discard, knock with 10 or less deadwood,
// gin bonus 25, undercut bonus 25, first to 100. See docs/GIN.md.

import type { Card } from '../core/cards.ts';
import type { SeatIndex } from '../core/game.ts';
import type { Meld } from './melds.ts';

export interface GinConfig {
  target: number;          // 50 | 100 | 150
  knockMax: number;        // most deadwood you may knock with (standard 10)
  ginBonus: number;        // 25
  bigGinBonus: number;     // 31: all 11 cards melded after drawing
  undercutBonus: number;   // 25
  /** First turn: the upcard is offered to the non-dealer, then the dealer. */
  upcardOffer: boolean;
}

export function defaultGinConfig(): GinConfig {
  return { target: 100, knockMax: 10, ginBonus: 25, bigGinBonus: 31, undercutBonus: 25, upcardOffer: true };
}

export function normalizeGinConfig(input?: Partial<GinConfig>): GinConfig {
  const d = defaultGinConfig();
  const c = { ...d, ...(input ?? {}) };
  const num = (v: unknown, lo: number, hi: number, dflt: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : dflt);
  return {
    target: [50, 100, 150].includes(Number(c.target)) ? Number(c.target) : d.target,
    knockMax: num(c.knockMax, 0, 10, d.knockMax),
    ginBonus: num(c.ginBonus, 0, 50, d.ginBonus),
    bigGinBonus: num(c.bigGinBonus, 0, 60, d.bigGinBonus),
    undercutBonus: num(c.undercutBonus, 0, 50, d.undercutBonus),
    upcardOffer: c.upcardOffer !== false,
  };
}

export type GinPhase = 'offer' | 'draw' | 'discard' | 'roundOver' | 'matchOver';

export interface GinPlayer {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  hand: Card[];
  score: number;
  handsWon: number;
  /** Cards this player took from the discard pile this hand (public knowledge). */
  pickups: Card[];
}

export type HandEnd = 'knock' | 'gin' | 'bigGin' | 'undercut' | 'draw';

export interface GinHandResult {
  hand: number;
  end: HandEnd;
  knocker: SeatIndex | null;
  winner: SeatIndex | null;
  points: number;
  knockerMelds: Meld[];
  knockerDeadwood: Card[];
  knockerValue: number;
  defenderMelds: Meld[];
  defenderDeadwood: Card[];
  defenderValue: number;
  layoffs: Card[];
  scoresAfter: number[];
}

export interface GinState {
  config: GinConfig;
  players: GinPlayer[];
  stock: Card[];          // SECRET; top = end
  discard: Card[];        // top = end
  dealer: SeatIndex;
  current: SeatIndex;
  phase: GinPhase;
  offerPasses: number;
  /** After both players pass the upcard, the non-dealer must draw from the stock. */
  stockOnly: boolean;
  /** Card just taken from the discard pile; it can't go straight back. */
  takenFromDiscard: string | null;
  lastDrawn: string | null;
  hand: number;
  history: GinHandResult[];
  placements: SeatIndex[] | null;
}

export type GinAction =
  | { type: 'takeUpcard' }
  | { type: 'passUpcard' }
  | { type: 'draw'; source: 'stock' | 'discard' }
  | { type: 'discard'; cardId: string }
  | { type: 'knock'; cardId: string }
  | { type: 'bigGin' }
  | { type: 'nextRound' };

export type GinEvent =
  | { type: 'dealt'; hand: number; dealer: SeatIndex; upcard: Card }
  | { type: 'turn'; seat: SeatIndex }
  | { type: 'upcardPassed'; seat: SeatIndex }
  | { type: 'drew'; seat: SeatIndex; source: 'stock' | 'discard'; card: Card | null }
  | { type: 'discarded'; seat: SeatIndex; card: Card }
  | { type: 'knocked'; seat: SeatIndex; gin: boolean }
  | { type: 'roundOver'; result: GinHandResult }
  | { type: 'matchOver'; placements: SeatIndex[] };

export interface GinPlayerPublic {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  cardCount: number;
  score: number;
  handsWon: number;
  pickups: Card[];
}

export interface GinView {
  seat: SeatIndex | null;
  config: GinConfig;
  phase: GinPhase;
  hand: number;
  dealer: SeatIndex;
  current: SeatIndex;
  players: GinPlayerPublic[];
  myHand: Card[];
  topDiscard: Card | null;
  discardCount: number;
  stockCount: number;
  takenFromDiscard: string | null;
  lastDrawn: string | null;
  stockOnly: boolean;
  /** Your best melds and deadwood right now. */
  myMelds: Meld[];
  myDeadwood: Card[];
  myDeadwoodValue: number;
  /** Discards that let you knock (deadwood after discarding ≤ knockMax). */
  knockIds: string[];
  canBigGin: boolean;
  /** Full public discard history, oldest first (everyone saw these). */
  discards: Card[];
  history: GinHandResult[];
  placements: SeatIndex[] | null;
}
