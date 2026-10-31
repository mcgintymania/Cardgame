// Gin Rummy melds: sets (3–4 of a rank) and runs (3+ in a suit, ace low).
// Finds the arrangement with the least deadwood, and works out lay-offs.

import type { Card } from '../core/cards.ts';

export type MeldKind = 'set' | 'run';
export interface Meld { kind: MeldKind; cards: Card[] }

export interface Arrangement {
  melds: Meld[];
  deadwood: Card[];
  deadwoodValue: number;
}

/** Ace = 1, number cards face value, picture cards 10. */
export const cardValue = (c: Card) => Math.min(10, c.rank);
export const sumValue = (cs: Card[]) => cs.reduce((a, c) => a + cardValue(c), 0);

function sortRuns(cs: Card[]) {
  return cs.slice().sort((a, b) => a.rank - b.rank);
}

/** Every possible meld that can be made from these cards. */
export function allMelds(cards: Card[]): Meld[] {
  const out: Meld[] = [];
  const byRank = new Map<number, Card[]>();
  for (const c of cards) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  for (const group of byRank.values()) {
    if (group.length >= 3) out.push({ kind: 'set', cards: group.slice() });
    if (group.length === 4) for (let skip = 0; skip < 4; skip++) out.push({ kind: 'set', cards: group.filter((_, i) => i !== skip) });
  }
  for (const suit of ['S', 'H', 'D', 'C']) {
    const s = sortRuns(cards.filter((c) => c.suit === suit));
    // split into consecutive stretches, then every sub-run of length >= 3
    let start = 0;
    for (let i = 1; i <= s.length; i++) {
      if (i === s.length || s[i].rank !== s[i - 1].rank + 1) {
        const stretch = s.slice(start, i);
        for (let a = 0; a < stretch.length; a++) for (let b = a + 3; b <= stretch.length; b++) out.push({ kind: 'run', cards: stretch.slice(a, b) });
        start = i;
      }
    }
  }
  return out;
}

/** Calls visit() once for every way to split the cards into melds + deadwood. */
export function eachArrangement(cards: Card[], visit: (melds: Meld[], deadwood: Card[]) => void): void {
  const melds = allMelds(cards);
  const byCard = new Map<string, Meld[]>();
  for (const m of melds) for (const c of m.cards) byCard.set(c.id, [...(byCard.get(c.id) ?? []), m]);
  const order = cards.slice();
  const used = new Set<string>();
  const chosen: Meld[] = [];
  const dead: Card[] = [];
  const rec = (i: number) => {
    while (i < order.length && used.has(order[i].id)) i++;
    if (i === order.length) { visit(chosen.slice(), dead.slice()); return; }
    const c = order[i];
    // c is deadwood
    dead.push(c); used.add(c.id);
    rec(i + 1);
    dead.pop(); used.delete(c.id);
    // or c is in a meld
    for (const m of byCard.get(c.id) ?? []) {
      if (m.cards.some((x) => used.has(x.id))) continue;
      for (const x of m.cards) used.add(x.id);
      chosen.push(m);
      rec(i + 1);
      chosen.pop();
      for (const x of m.cards) used.delete(x.id);
    }
  };
  rec(0);
}

/** The arrangement with the lowest deadwood (ties: fewer deadwood cards). */
export function bestArrangement(cards: Card[]): Arrangement {
  let best: Arrangement | null = null;
  eachArrangement(cards, (melds, deadwood) => {
    const v = sumValue(deadwood);
    if (!best || v < best.deadwoodValue || (v === best.deadwoodValue && deadwood.length < best.deadwood.length)) {
      best = { melds, deadwood, deadwoodValue: v };
    }
  });
  return best!;
}

export const deadwoodOf = (cards: Card[]) => bestArrangement(cards).deadwoodValue;

/** Can this card go onto the meld (sets: same rank; runs: either end, same suit)? */
export function fits(card: Card, meld: Meld): boolean {
  if (meld.kind === 'set') return meld.cards.length < 4 && meld.cards[0].rank === card.rank;
  if (card.suit !== meld.cards[0].suit) return false;
  const rs = meld.cards.map((c) => c.rank);
  return card.rank === Math.min(...rs) - 1 || card.rank === Math.max(...rs) + 1;
}

export interface LayoffResult {
  melds: Meld[];          // defender's own melds
  layoffs: Card[];        // cards laid off on the knocker's melds
  deadwood: Card[];
  deadwoodValue: number;
  /** Knocker's melds after lay-offs (for showing the result). */
  extended: Meld[];
}

/** The defender's best result: own melds first, then lay off whatever fits on the knocker's melds. */
export function bestWithLayoffs(defender: Card[], knockerMelds: Meld[]): LayoffResult {
  let best: LayoffResult | null = null;
  eachArrangement(defender, (melds, deadwood) => {
    for (const runsFirst of [true, false]) {
      const ext: Meld[] = knockerMelds.map((m) => ({ kind: m.kind, cards: m.cards.slice() }));
      const order = runsFirst ? [...ext.filter((m) => m.kind === 'run'), ...ext.filter((m) => m.kind === 'set')] : ext;
      let left = deadwood.slice();
      const laid: Card[] = [];
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of left) {
          const m = order.find((mm) => fits(c, mm));
          if (m) {
            m.cards.push(c);
            if (m.kind === 'run') m.cards.sort((a, b) => a.rank - b.rank);
            laid.push(c);
            left = left.filter((x) => x.id !== c.id);
            changed = true;
            break;
          }
        }
      }
      const v = sumValue(left);
      if (!best || v < best.deadwoodValue) best = { melds, layoffs: laid, deadwood: left, deadwoodValue: v, extended: ext };
    }
  });
  return best!;
}
