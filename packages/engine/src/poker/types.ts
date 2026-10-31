import type { Card } from '../core/cards.ts';
import type { SeatIndex } from '../core/game.ts';

export interface PokerConfig {
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  /** Raise the blinds every N hands (0 = never). */
  blindsUpEvery: number;
  /** 'holdem' (default) or 'draw': Five-Card Draw, five cards each and one draw. */
  variant?: 'holdem' | 'draw';
  /** Five-Card Draw: most cards you may exchange (standard 3). */
  maxDraw?: number;
}

/**
 * Hold'em: preflop → flop → turn → river.
 * Five-Card Draw reuses 'preflop' for the betting before the draw, 'draw' for the
 * exchange, and 'river' for the betting after it.
 */
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'draw' | 'handOver' | 'matchOver';

export interface PokerPlayer {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  stack: number;
  hole: Card[];            // SECRET until shown at showdown
  folded: boolean;
  allIn: boolean;
  bet: number;             // chips put in on this street
  total: number;           // chips put in this hand
  hasActed: boolean;
  /** False after an incomplete all-in raise: the player may only call or fold. */
  canRaise: boolean;
  busted: boolean;
  place: number | null;
  lastAction: string | null;
  handsWon: number;
  /** Stack at the start of the current hand. */
  startStack: number;
  /** Five-Card Draw: cards exchanged this hand (null = not drawn yet). Public. */
  drew: number | null;
}

export interface PotResult {
  amount: number;
  winners: SeatIndex[];
  /** Description of the winning hand, or null if uncontested. */
  hand: string | null;
  winningCards: Card[];
}

export interface HandResult {
  hand: number;
  board: Card[];
  pots: PotResult[];
  /** Hole cards turned over at showdown. Empty when everyone else folded. */
  revealed: Array<{ seat: SeatIndex; cards: Card[]; description: string }>;
  payouts: Record<number, number>;
  uncontested: boolean;
}

export interface PokerState {
  config: PokerConfig;
  players: PokerPlayer[];
  deck: Card[];            // SECRET — top of deck is the END of the array
  /** Discarded cards (Five-Card Draw). Face down: SECRET. */
  muck: Card[];
  board: Card[];
  button: SeatIndex;
  sbSeat: SeatIndex;
  bbSeat: SeatIndex;
  smallBlind: number;
  bigBlind: number;
  level: number;
  street: Street;
  current: SeatIndex;
  currentBet: number;
  minRaise: number;
  handNumber: number;
  lastHand: HandResult | null;
  history: HandResult[];
  winner: SeatIndex | null;
}

export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** Bet or raise TO this street total (e.g. raise to 120). */
  | { type: 'raise'; to: number }
  | { type: 'allIn' }
  /** Five-Card Draw: exchange these cards (empty = stand pat). */
  | { type: 'draw'; discard: string[] }
  | { type: 'nextHand' };

export type PokerEvent =
  | { type: 'handStarted'; hand: number; button: SeatIndex; sbSeat: SeatIndex; bbSeat: SeatIndex; smallBlind: number; bigBlind: number }
  | { type: 'blindsUp'; smallBlind: number; bigBlind: number }
  | { type: 'acted'; seat: SeatIndex; action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn' | 'smallBlind' | 'bigBlind'; amount: number; to: number }
  | { type: 'street'; street: Street; cards: Card[] }
  | { type: 'returned'; seat: SeatIndex; amount: number }
  | { type: 'showdown'; revealed: HandResult['revealed'] }
  | { type: 'potAwarded'; index: number; amount: number; winners: SeatIndex[]; hand: string | null }
  | { type: 'handOver'; result: HandResult }
  | { type: 'busted'; seat: SeatIndex; place: number }
  | { type: 'drew'; seat: SeatIndex; count: number }
  | { type: 'matchOver'; winner: SeatIndex }
  | { type: 'turn'; seat: SeatIndex };

export interface PokerPlayerPublic {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  busted: boolean;
  place: number | null;
  inHand: boolean;
  lastAction: string | null;
  handsWon: number;
  /** Only filled at showdown for players who turned their cards over. */
  shown: Card[] | null;
  /** Five-Card Draw: how many cards they exchanged this hand (null = not yet). */
  drew: number | null;
}

export interface PokerOptions {
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  /** True when no bet has been made this street (so a raise is called a bet). */
  isBet: boolean;
}

export interface PokerView {
  seat: SeatIndex | null;
  config: PokerConfig;
  handNumber: number;
  level: number;
  smallBlind: number;
  bigBlind: number;
  street: Street;
  button: SeatIndex;
  sbSeat: SeatIndex;
  bbSeat: SeatIndex;
  current: SeatIndex;
  currentBet: number;
  board: Card[];
  /** Chips already gathered into the middle (not counting bets in front of players). */
  pot: number;
  /** pot + all bets on this street. */
  totalPot: number;
  players: PokerPlayerPublic[];
  hole: Card[];
  options: PokerOptions | null;
  legal: PokerAction[];
  lastHand: HandResult | null;
  /** Recent finished hands, newest last (showdown cards are public once shown). */
  history: HandResult[];
  winner: SeatIndex | null;
}
