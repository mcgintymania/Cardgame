// Hearts: types, config and the per-seat view.
//
// Standard rules (not a house game): four players, 13 tricks, pass three cards
// (left, right, across, then no pass), 2♣ leads, follow suit, hearts can't be
// led until broken, no points on the first trick, each heart = 1, Q♠ = 13,
// take all 26 to "shoot the moon". Lowest score when someone reaches the
// target wins. See docs/HEARTS.md.

import type { Card } from '../core/cards.ts';
import type { SeatIndex } from '../core/game.ts';

export type MoonRule = 'addToOthers' | 'subtractFromSelf';
export type PassDir = 'left' | 'right' | 'across' | 'none';

export interface HeartsConfig {
  /** Match ends at the end of the hand in which someone reaches this. */
  endAt: number;
  /** Pass three cards each hand (left, right, across, hold). */
  passing: boolean;
  moon: MoonRule;
  /** Optional house variant: the Jack of Diamonds is worth −10. */
  jackOfDiamonds: boolean;
  /** No hearts or Q♠ on the first trick (unless you hold nothing else). */
  noPointsFirstTrick: boolean;
  /** Playing Q♠ also breaks hearts. */
  queenBreaksHearts: boolean;
}

export function defaultHeartsConfig(): HeartsConfig {
  return { endAt: 100, passing: true, moon: 'addToOthers', jackOfDiamonds: false, noPointsFirstTrick: true, queenBreaksHearts: true };
}

export function normalizeHeartsConfig(input?: Partial<HeartsConfig>): HeartsConfig {
  const d = defaultHeartsConfig();
  const c = { ...d, ...(input ?? {}) };
  const endAt = [50, 75, 100].includes(Number(c.endAt)) ? Number(c.endAt) : d.endAt;
  return {
    endAt,
    passing: !!c.passing,
    moon: c.moon === 'subtractFromSelf' ? 'subtractFromSelf' : 'addToOthers',
    jackOfDiamonds: !!c.jackOfDiamonds,
    noPointsFirstTrick: c.noPointsFirstTrick !== false,
    queenBreaksHearts: c.queenBreaksHearts !== false,
  };
}

export type HeartsPhase = 'pass' | 'play' | 'roundOver' | 'matchOver';

export interface TrickPlay { seat: SeatIndex; card: Card }
export interface Trick { leader: SeatIndex; plays: TrickPlay[]; winner: SeatIndex | null; points: number }

export interface HeartsPlayer {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  hand: Card[];
  score: number;
  /** Points taken in the current hand. */
  handPoints: number;
  /** Cards chosen to pass (hidden from others). */
  passing: Card[] | null;
  /** Cards received in the pass this hand (only shown to this player). */
  received: Card[];
  moons: number;
}

export interface HandLine { seat: SeatIndex; taken: number; scored: number; before: number; after: number }
export interface HandResult { hand: number; lines: HandLine[]; moon: SeatIndex | null }

export interface HeartsState {
  config: HeartsConfig;
  players: HeartsPlayer[];
  phase: HeartsPhase;
  hand: number;              // 1-based hand number
  passDir: PassDir;
  current: SeatIndex;
  heartsBroken: boolean;
  tricks: Trick[];           // this hand, oldest first; last may be in progress
  history: HandResult[];
  placements: SeatIndex[] | null;
}

export type HeartsAction =
  | { type: 'pass'; cardIds: string[] }
  | { type: 'play'; cardId: string }
  | { type: 'nextRound' };

export type HeartsEvent =
  | { type: 'dealt'; hand: number; passDir: PassDir }
  | { type: 'passReady'; seat: SeatIndex }
  | { type: 'passed'; passDir: PassDir }
  | { type: 'turn'; seat: SeatIndex }
  | { type: 'played'; seat: SeatIndex; card: Card }
  | { type: 'heartsBroken'; seat: SeatIndex }
  | { type: 'trickWon'; seat: SeatIndex; points: number; cards: Card[]; queen: boolean }
  | { type: 'moon'; seat: SeatIndex }
  | { type: 'roundOver'; result: HandResult }
  | { type: 'matchOver'; placements: SeatIndex[] };

export interface HeartsPlayerPublic {
  seat: SeatIndex;
  playerId: string;
  name: string;
  isAI: boolean;
  personality?: string;
  cardCount: number;
  score: number;
  handPoints: number;
  hasPassed: boolean;
  moons: number;
}

/** Everything one seat may know: its own hand, and everything played face up. */
export interface HeartsView {
  seat: SeatIndex | null;
  config: HeartsConfig;
  phase: HeartsPhase;
  hand: number;
  passDir: PassDir;
  current: SeatIndex;
  heartsBroken: boolean;
  players: HeartsPlayerPublic[];
  myHand: Card[];
  received: Card[];
  myPass: Card[] | null;
  /** Tricks of this hand, all public. The last may be in progress. */
  tricks: Trick[];
  playableIds: string[];
  history: HandResult[];
  placements: SeatIndex[] | null;
}
