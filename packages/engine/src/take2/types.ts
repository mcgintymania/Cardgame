import type { Card, Suit } from '../core/cards.ts';
import type { SeatIndex } from '../core/game.ts';
import type { Take2Config } from './config.ts';
import type { HandScore } from './scoring.ts';

export type Pending = null | { kind: 'draw'; amount: number } | { kind: 'skip' };
export type Take2Phase = 'play' | 'chooseSuit' | 'afterDraw' | 'roundOver' | 'matchOver';

export interface Take2Player {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  hand: Card[];
  total: number;
  eliminated: boolean;
  eliminatedInRound: number | null;
  roundsWon: number;
  /** Announced "last card" while holding one card. */
  calledLastCard: boolean;
}

export interface RoundScoreLine {
  seat: SeatIndex;
  hand: Card[];
  score: HandScore;
  before: number;
  after: number;
  eliminated: boolean;
}

export interface RoundResult {
  round: number;
  /** Seat that emptied their hand, or null if the round stalled. */
  wentOut: SeatIndex | null;
  lines: RoundScoreLine[];
}

export interface Take2State {
  config: Take2Config;
  players: Take2Player[];
  drawPile: Card[];          // SECRET — top of pile is the END of the array
  discard: Card[];           // top of discard is the END of the array
  activeSuit: Suit;
  direction: 1 | -1;
  current: SeatIndex;
  phase: Take2Phase;
  pending: Pending;
  drawnCardId: string | null;
  round: number;
  roundStarter: SeatIndex;
  stall: number;
  roundTurns: number;
  turnCount: number;
  history: RoundResult[];
  winner: SeatIndex | null;
}

export type Take2Action =
  | { type: 'play'; cardId: string; suit?: Suit; lastCard?: boolean }
  | { type: 'chooseSuit'; suit: Suit }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'takePenalty' }
  | { type: 'takeSkip' }
  | { type: 'nextRound' };

export type Take2Event =
  | { type: 'dealt'; round: number; starter: SeatIndex; topCard: Card }
  | { type: 'turn'; seat: SeatIndex }
  | { type: 'played'; seat: SeatIndex; card: Card }
  | { type: 'drew'; seat: SeatIndex; count: number; reason: 'choice' | 'penalty' | 'stuck' | 'finishing' | 'missedCall' }
  | { type: 'penaltyPending'; target: SeatIndex; amount: number; stacked: boolean }
  | { type: 'skipped'; seat: SeatIndex }
  | { type: 'skipPassed'; from: SeatIndex }
  | { type: 'suitChosen'; seat: SeatIndex; suit: Suit }
  | { type: 'reversed'; direction: 1 | -1 }
  | { type: 'passed'; seat: SeatIndex }
  | { type: 'reshuffled'; count: number }
  | { type: 'wentOut'; seat: SeatIndex }
  | { type: 'lastCard'; seat: SeatIndex }
  | { type: 'missedLastCard'; seat: SeatIndex; penalty: number }
  | { type: 'turnLimit' }
  | { type: 'roundOver'; result: RoundResult }
  | { type: 'eliminated'; seat: SeatIndex; total: number }
  | { type: 'matchOver'; winner: SeatIndex };

export interface Take2PlayerPublic {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  cardCount: number;
  total: number;
  eliminated: boolean;
  roundsWon: number;
  calledLastCard: boolean;
}

/** Everything one seat is allowed to know. Contains no other player's cards and no deck order. */
export interface Take2View {
  seat: SeatIndex | null;
  config: Take2Config;
  round: number;
  phase: Take2Phase;
  current: SeatIndex;
  direction: 1 | -1;
  activeSuit: Suit;
  topCard: Card;
  discardCount: number;
  drawCount: number;
  pending: Pending;
  players: Take2PlayerPublic[];
  hand: Card[];
  handScore: HandScore | null;
  drawnCardId: string | null;
  legal: Take2Action[];
  playableIds: string[];
  history: RoundResult[];
  winner: SeatIndex | null;
  /** Public discard history (most recent last), limited — useful to AI and UI. */
  recentDiscards: Card[];
}
