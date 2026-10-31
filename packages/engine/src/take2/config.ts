// Take 2 house rules. Penalty scoring and action effects are deliberately
// separate so either can change without touching the other.
//
// Defaults were confirmed by the owner on 18 Oct 2026. See docs/RULES-TAKE2.md.
// (Comments below still say which ones started as proposals.)

import type { Rank } from '../core/cards.ts';

export type MatchRule = 'suitOrRank' | 'suitOnly';
export type JackAction = 'changeSuit' | 'reverse' | 'none';
export type WhenStuck = 'drawOne' | 'drawUntilPlayable';
export type ScoringMode = 'cumulative' | 'singleHand';
export type TwoScoring = 'multiplier' | 'facevalue';

export interface Take2Scoring {
  /** Penalty value per rank. The value listed for 2 is only used when twoScoring = 'facevalue'. */
  values: Record<Rank, number>;
  /** 'multiplier': each 2 doubles the sum of the other cards (owner's spec). */
  twoScoring: TwoScoring;
  /** Optional ceiling on a single hand's penalty (null = no cap). */
  handCap: number | null;
}

export interface Take2Config {
  handSize: number;
  // ---- playing cards ----
  matchRule: MatchRule;              // UNCONFIRMED (spec doesn't say what is playable)
  mustPlayIfAble: boolean;           // UNCONFIRMED
  playDrawnCard: boolean;            // owner: NO — picking up ends your turn
  noFinishOnJack: boolean;           // owner: you can't finish on a Jack
  lastCardCall: boolean;             // owner: you must announce last card or going out doesn't count
  lastCardPenalty: number;           // owner: pick up 2, card stays played
  whenStuck: WhenStuck;              // UNCONFIRMED
  // ---- action effects ----
  twoDrawAmount: number;             // spec: 2
  twoStacking: boolean;              // UNCONFIRMED (spec asks for a setting)
  penaltyEndsTurn: boolean;          // owner: picking up a penalty takes your turn
  eightSkips: boolean;               // spec
  eightStacking: boolean;            // owner: if you're skipped and hold an 8, you can play it to pass the skip on
  jackAction: JackAction;            // spec says change suit; behaviour detail UNCONFIRMED
  jackWild: boolean;                 // UNCONFIRMED — Jack playable on anything?
  finishingActionApplies: boolean;   // UNCONFIRMED — going out on a 2 still makes the next player draw
  flipActionOnStart: 'reflip' | 'ignore'; // UNCONFIRMED
  // ---- scoring & elimination ----
  scoring: Take2Scoring;
  scoringMode: ScoringMode;          // UNCONFIRMED
  eliminationAt: number;             // spec: 100
  eliminateOnExact: boolean;         // spec: reaching 100 eliminates (≥)
  /** Safeguard against endless rounds (0 = off). Not a house rule. */
  roundTurnLimit: number;
}

export const SPEC_VALUES: Record<Rank, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 10, 9: 9, 10: 10, 11: 20, 12: 10, 13: 10,
};

export function defaultTake2Config(): Take2Config {
  return {
    handSize: 7,
    matchRule: 'suitOrRank',
    mustPlayIfAble: false,
    playDrawnCard: false,
    noFinishOnJack: true,
    lastCardCall: true,
    lastCardPenalty: 2,
    whenStuck: 'drawOne',
    twoDrawAmount: 2,
    twoStacking: true,
    penaltyEndsTurn: true,
    eightSkips: true,
    eightStacking: true,
    jackAction: 'changeSuit',
    jackWild: true,
    finishingActionApplies: true,
    flipActionOnStart: 'reflip',
    scoring: { values: { ...SPEC_VALUES }, twoScoring: 'multiplier', handCap: null },
    scoringMode: 'cumulative',
    eliminationAt: 100,
    eliminateOnExact: true,
    roundTurnLimit: 250,
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** Validates untrusted config (e.g. from the host's settings screen or a network request). */
export function normalizeTake2Config(input?: Partial<Take2Config>): Take2Config {
  const d = defaultTake2Config();
  const i = (input ?? {}) as Partial<Take2Config>;
  const bool = (v: unknown, f: boolean) => (typeof v === 'boolean' ? v : f);
  const values = { ...d.scoring.values };
  const inVals = i.scoring?.values as Partial<Record<Rank, number>> | undefined;
  if (inVals) {
    for (const r of Object.keys(values).map(Number) as Rank[]) {
      values[r] = clampInt(inVals[r], 0, 100, values[r]);
    }
  }
  const cap = i.scoring?.handCap;
  return {
    handSize: clampInt(i.handSize, 3, 10, d.handSize),
    matchRule: pick(i.matchRule, ['suitOrRank', 'suitOnly'] as const, d.matchRule),
    mustPlayIfAble: bool(i.mustPlayIfAble, d.mustPlayIfAble),
    playDrawnCard: bool(i.playDrawnCard, d.playDrawnCard),
    noFinishOnJack: bool(i.noFinishOnJack, d.noFinishOnJack),
    lastCardCall: bool(i.lastCardCall, d.lastCardCall),
    lastCardPenalty: clampInt(i.lastCardPenalty, 1, 5, d.lastCardPenalty),
    whenStuck: pick(i.whenStuck, ['drawOne', 'drawUntilPlayable'] as const, d.whenStuck),
    twoDrawAmount: clampInt(i.twoDrawAmount, 1, 5, d.twoDrawAmount),
    twoStacking: bool(i.twoStacking, d.twoStacking),
    penaltyEndsTurn: bool(i.penaltyEndsTurn, d.penaltyEndsTurn),
    eightSkips: bool(i.eightSkips, d.eightSkips),
    eightStacking: bool(i.eightStacking, d.eightStacking),
    jackAction: pick(i.jackAction, ['changeSuit', 'reverse', 'none'] as const, d.jackAction),
    jackWild: bool(i.jackWild, d.jackWild),
    finishingActionApplies: bool(i.finishingActionApplies, d.finishingActionApplies),
    flipActionOnStart: pick(i.flipActionOnStart, ['reflip', 'ignore'] as const, d.flipActionOnStart),
    scoring: {
      values,
      twoScoring: pick(i.scoring?.twoScoring, ['multiplier', 'facevalue'] as const, d.scoring.twoScoring),
      handCap: cap === null || cap === undefined ? null : clampInt(cap, 1, 100000, 1000),
    },
    scoringMode: pick(i.scoringMode, ['cumulative', 'singleHand'] as const, d.scoringMode),
    eliminationAt: clampInt(i.eliminationAt, 10, 1000, d.eliminationAt),
    eliminateOnExact: bool(i.eliminateOnExact, d.eliminateOnExact),
    roundTurnLimit: clampInt(i.roundTurnLimit, 0, 2000, d.roundTurnLimit),
  };
}

/** Human-readable list of which settings are still unconfirmed proposals. */
// The owner accepted every default after play-testing (18 Oct 2026), so nothing is
// flagged as "Proposed" any more. Add a key here to flag a future unconfirmed setting.
export const UNCONFIRMED_SETTINGS: ReadonlyArray<keyof Take2Config> = [];
