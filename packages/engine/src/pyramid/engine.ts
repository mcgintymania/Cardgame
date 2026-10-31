// Beat the Pyramid: a higher-or-lower climb. Cards are dealt face down in a
// pyramid (1 card at the top, then 2, 3 … down to the bottom row). The bottom-left
// card starts face up; guess whether each next card is higher or lower, all the
// way to the top. Single player, so plain functions (not a GameModule).

import { standardDeck, type Card } from '../core/cards.ts';
import { shuffle, type Rng } from '../core/rng.ts';

export interface PyramidConfig {
  /** Rows in the pyramid: 4 up to 9 (9 rows = 45 cards, the most one deck allows). */
  rows: number;
  /** 'rows': each row left to right. 'zigzag': rows alternate direction, like a snake. */
  path: 'rows' | 'zigzag';
  /** What a card of the same rank counts as. */
  same: 'safe' | 'lose';
  aces: 'high' | 'low';
  /** Wrong guesses allowed before the run ends. */
  lives: number;
}

export const PYRAMID_MIN_ROWS = 4;
export const PYRAMID_MAX_ROWS = 9;

export function defaultPyramidConfig(): PyramidConfig {
  return { rows: 5, path: 'rows', same: 'safe', aces: 'high', lives: 1 };
}

export function normalizePyramidConfig(c?: Partial<PyramidConfig>): PyramidConfig {
  const d = defaultPyramidConfig();
  const x = { ...d, ...(c ?? {}) };
  return {
    rows: Math.min(PYRAMID_MAX_ROWS, Math.max(PYRAMID_MIN_ROWS, Math.round(Number(x.rows) || d.rows))),
    path: x.path === 'zigzag' ? 'zigzag' : 'rows',
    same: x.same === 'lose' ? 'lose' : 'safe',
    aces: x.aces === 'low' ? 'low' : 'high',
    lives: [1, 3].includes(Number(x.lives)) ? Number(x.lives) : 1,
  };
}

export interface Slot { row: number; col: number }

export type Guess = 'higher' | 'lower';
export interface GuessResult { guess: Guess; from: Card; card: Card; result: 'right' | 'wrong' | 'same' }

export interface PyramidState {
  config: PyramidConfig;
  /** Climb order: index 0 is the starting card. Rows count from the top (row 0 = 1 card). */
  path: Slot[];
  /** Card at each step of the path. SECRET beyond `at`. */
  cards: Card[];
  /** Index of the last face-up card on the path. */
  at: number;
  lives: number;
  /** Correct (or safe) guesses so far: the score. */
  score: number;
  status: 'playing' | 'won' | 'lost';
  log: GuessResult[];
}

export const pyramidSize = (rows: number) => (rows * (rows + 1)) / 2;

/** The climb: bottom-left first, row by row up to the single top card. */
export function climbPath(rows: number, path: PyramidConfig['path']): Slot[] {
  const out: Slot[] = [];
  for (let r = rows - 1, k = 0; r >= 0; r--, k++) {
    const cols = Array.from({ length: r + 1 }, (_, c) => c);
    if (path === 'zigzag' && k % 2 === 1) cols.reverse();
    for (const c of cols) out.push({ row: r, col: c });
  }
  return out;
}

export function deal(config: PyramidConfig, rng: Rng): PyramidState {
  const path = climbPath(config.rows, config.path);
  const cards = shuffle(standardDeck(), rng).slice(0, path.length);
  return { config, path, cards, at: 0, lives: config.lives, score: 0, status: 'playing', log: [] };
}

export const value = (c: Card, aces: PyramidConfig['aces']) => (c.rank === 1 ? (aces === 'high' ? 14 : 1) : c.rank);

export function guess(state: PyramidState, g: Guess): PyramidState {
  if (state.status !== 'playing') throw new Error('This pyramid is finished.');
  const s: PyramidState = { ...state, log: state.log.slice() };
  const from = s.cards[s.at];
  const card = s.cards[s.at + 1];
  const a = value(from, s.config.aces);
  const b = value(card, s.config.aces);
  const result: GuessResult['result'] = a === b ? 'same' : (b > a) === (g === 'higher') ? 'right' : 'wrong';
  s.at += 1;
  s.log.push({ guess: g, from, card, result });
  const ok = result === 'right' || (result === 'same' && s.config.same === 'safe');
  if (ok) s.score += 1;
  else s.lives -= 1;
  if (s.lives <= 0) s.status = 'lost';
  else if (s.at === s.cards.length - 1) s.status = 'won';
  return s;
}

/** The odds for the next card, counting only cards you haven't seen. */
export function odds(state: PyramidState): { higher: number; lower: number; same: number } {
  const seen = new Set(state.cards.slice(0, state.at + 1).map((c) => c.id));
  const unseen = standardDeck().filter((c) => !seen.has(c.id));
  const v = value(state.cards[state.at], state.config.aces);
  let higher = 0; let lower = 0; let same = 0;
  for (const c of unseen) {
    const w = value(c, state.config.aces);
    if (w > v) higher++; else if (w < v) lower++; else same++;
  }
  const n = unseen.length;
  return { higher: higher / n, lower: lower / n, same: same / n };
}
