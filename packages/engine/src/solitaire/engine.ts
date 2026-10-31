// Klondike solitaire. One player, so it isn't a GameModule: just pure functions
// over a state. The UI keeps earlier states for undo.

import { standardDeck, isRed, type Card, type Suit } from '../core/cards.ts';
import { shuffle, type Rng } from '../core/rng.ts';

export interface SolitaireConfig {
  /** Turn one card or three from the stock. */
  draw: 1 | 3;
}

export interface Column {
  cards: Card[];
  /** Index of the first face-up card; cards before it are face down. */
  up: number;
}

export interface SolitaireState {
  config: SolitaireConfig;
  stock: Card[];          // face down; top = end
  waste: Card[];          // face up; top = end
  foundations: Card[][];  // four piles, built Ace → King in one suit
  tableau: Column[];      // seven columns
  moves: number;
  score: number;
  recycles: number;
}

export type Pile =
  | { kind: 'waste' }
  | { kind: 'foundation'; index: number }
  | { kind: 'tableau'; index: number; card?: number };

export type SolAction =
  | { type: 'draw' }
  | { type: 'move'; from: Pile; to: Pile };

export class SolitaireError extends Error {}

export function deal(config: SolitaireConfig, rng: Rng): SolitaireState {
  const deck = shuffle(standardDeck(), rng);
  const tableau: Column[] = [];
  let k = 0;
  for (let i = 0; i < 7; i++) {
    tableau.push({ cards: deck.slice(k, k + i + 1), up: i });
    k += i + 1;
  }
  return { config, stock: deck.slice(k), waste: [], foundations: [[], [], [], []], tableau, moves: 0, score: 0, recycles: 0 };
}

const clone = (s: SolitaireState): SolitaireState => JSON.parse(JSON.stringify(s));
const top = <T,>(a: T[]): T | undefined => a[a.length - 1];

/** Can this card go on this foundation? */
export function fitsFoundation(card: Card, pile: Card[]): boolean {
  const t = top(pile);
  return t ? t.suit === card.suit && card.rank === t.rank + 1 : card.rank === 1;
}

/** Can this card (the bottom of a moving run) go on this column? */
export function fitsColumn(card: Card, col: Column): boolean {
  const t = top(col.cards);
  if (!t) return card.rank === 13;
  return col.up < col.cards.length && isRed(t.suit) !== isRed(card.suit) && card.rank === t.rank - 1;
}

/** Cards that would move from a pile (a run from a column, or one card). */
export function movingCards(s: SolitaireState, from: Pile): Card[] {
  if (from.kind === 'waste') return s.waste.length ? [top(s.waste)!] : [];
  if (from.kind === 'foundation') { const f = s.foundations[from.index]; return f.length ? [top(f)!] : []; }
  const col = s.tableau[from.index];
  const at = from.card ?? col.cards.length - 1;
  if (at < col.up || at >= col.cards.length) return [];
  return col.cards.slice(at);
}

function isRun(cards: Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (isRed(cards[i].suit) === isRed(cards[i - 1].suit) || cards[i].rank !== cards[i - 1].rank - 1) return false;
  }
  return true;
}

export function canMove(s: SolitaireState, from: Pile, to: Pile): boolean {
  const cards = movingCards(s, from);
  if (!cards.length || !isRun(cards)) return false;
  if (from.kind !== 'waste' && to.kind === from.kind && to.index === from.index) return false;
  if (to.kind === 'waste') return false;
  if (to.kind === 'foundation') return cards.length === 1 && fitsFoundation(cards[0], s.foundations[to.index]);
  return fitsColumn(cards[0], s.tableau[to.index]);
}

function flipIfNeeded(s: SolitaireState, col: Column) {
  if (col.cards.length && col.up >= col.cards.length) {
    col.up = col.cards.length - 1;
    s.score += 5;
  }
}

export function apply(state: SolitaireState, a: SolAction): SolitaireState {
  const s = clone(state);
  if (a.type === 'draw') {
    if (!s.stock.length) {
      if (!s.waste.length) throw new SolitaireError('No cards left to turn.');
      s.stock = s.waste.reverse();
      s.waste = [];
      s.recycles++;
      s.score = Math.max(0, s.score - (s.config.draw === 1 ? 100 : 20));
    } else {
      const n = Math.min(s.config.draw, s.stock.length);
      for (let i = 0; i < n; i++) s.waste.push(s.stock.pop()!);
    }
    s.moves++;
    return s;
  }
  const { from, to } = a;
  if (!canMove(s, from, to)) throw new SolitaireError("That card can't go there.");
  const cards = movingCards(s, from);
  // take
  if (from.kind === 'waste') s.waste.pop();
  else if (from.kind === 'foundation') s.foundations[from.index].pop();
  else if (from.kind === 'tableau') {
    const col = s.tableau[from.index];
    col.cards.splice(col.cards.length - cards.length, cards.length);
    flipIfNeeded(s, col);
  }
  // put
  if (to.kind === 'foundation') s.foundations[to.index].push(cards[0]);
  else if (to.kind === 'tableau') s.tableau[to.index].cards.push(...cards);
  // scoring (the classic Windows rules)
  if (to.kind === 'foundation') s.score += 10;
  else if (from.kind === 'waste') s.score += 5;
  else if (from.kind === 'foundation') s.score = Math.max(0, s.score - 15);
  s.moves++;
  return s;
}

export const isWon = (s: SolitaireState) => s.foundations.every((f) => f.length === 13);

/** Every card is face up and the stock is empty: the rest can play itself. */
export const canAutoFinish = (s: SolitaireState) => !isWon(s) && !s.stock.length && !s.waste.length && s.tableau.every((c) => c.up === 0 || c.cards.length === 0);

/** Foundation a card would go to, if any. */
export function foundationFor(s: SolitaireState, card: Card): number {
  const same = s.foundations.findIndex((f) => f.length && f[0].suit === card.suit);
  if (same >= 0) return fitsFoundation(card, s.foundations[same]) ? same : -1;
  if (card.rank !== 1) return -1;
  return s.foundations.findIndex((f) => f.length === 0);
}

/** Where a tapped card should go: foundation first, then the best column. */
export function bestTarget(s: SolitaireState, from: Pile): Pile | null {
  const cards = movingCards(s, from);
  if (!cards.length) return null;
  if (cards.length === 1 && from.kind !== 'foundation') {
    const f = foundationFor(s, cards[0]);
    if (f >= 0) return { kind: 'foundation', index: f };
  }
  const options: Array<{ to: Pile; score: number }> = [];
  for (let i = 0; i < 7; i++) {
    if (from.kind === 'tableau' && from.index === i) continue;
    const to: Pile = { kind: 'tableau', index: i };
    if (!canMove(s, from, to)) continue;
    const col = s.tableau[i];
    // Prefer building on cards over filling empty columns; don't shuttle a king between empty columns.
    let score = col.cards.length ? 10 : 1;
    if (from.kind === 'tableau' && !col.cards.length && (from.card ?? 0) === 0) score = -1;
    options.push({ to, score });
  }
  options.sort((a, b) => b.score - a.score);
  return options.length && options[0].score >= 0 ? options[0].to : null;
}

/** A helpful next move, or 'draw', or null if stuck. */
export function hint(s: SolitaireState): { from: Pile; to: Pile } | 'draw' | null {
  // 1. Anything to a foundation (tableau tops, then waste)
  for (let i = 0; i < 7; i++) {
    const c = top(s.tableau[i].cards);
    if (c && foundationFor(s, c) >= 0) return { from: { kind: 'tableau', index: i }, to: { kind: 'foundation', index: foundationFor(s, c) } };
  }
  const w = top(s.waste);
  if (w && foundationFor(s, w) >= 0) return { from: { kind: 'waste' }, to: { kind: 'foundation', index: foundationFor(s, w) } };
  // 2. Moves that turn over a face-down card
  for (let i = 0; i < 7; i++) {
    const col = s.tableau[i];
    if (col.up === 0 || col.up >= col.cards.length) continue;
    const from: Pile = { kind: 'tableau', index: i, card: col.up };
    for (let j = 0; j < 7; j++) if (j !== i && canMove(s, from, { kind: 'tableau', index: j })) return { from, to: { kind: 'tableau', index: j } };
  }
  // 3. Waste to the tableau
  if (w) for (let j = 0; j < 7; j++) if (canMove(s, { kind: 'waste' }, { kind: 'tableau', index: j })) return { from: { kind: 'waste' }, to: { kind: 'tableau', index: j } };
  // 4. A king into an empty column from a column that has cards underneath
  for (let i = 0; i < 7; i++) {
    const col = s.tableau[i];
    if (col.up > 0 && col.cards[col.up]?.rank === 13) {
      const empty = s.tableau.findIndex((c) => c.cards.length === 0);
      if (empty >= 0) return { from: { kind: 'tableau', index: i, card: col.up }, to: { kind: 'tableau', index: empty } };
    }
  }
  if (s.stock.length || s.waste.length) return 'draw';
  return null;
}

/** Next automatic move when finishing: lowest card that can go up. */
export function autoStep(s: SolitaireState): { from: Pile; to: Pile } | null {
  let best: { from: Pile; to: Pile; rank: number } | null = null;
  for (let i = 0; i < 7; i++) {
    const c = top(s.tableau[i].cards);
    if (!c) continue;
    const f = foundationFor(s, c);
    if (f >= 0 && (!best || c.rank < best.rank)) best = { from: { kind: 'tableau', index: i }, to: { kind: 'foundation', index: f }, rank: c.rank };
  }
  return best ? { from: best.from, to: best.to } : null;
}

export const SUIT_FOUNDATION_HINT: Suit[] = ['S', 'H', 'C', 'D'];
