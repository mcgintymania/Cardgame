// Texas Hold'em hand evaluation: best five cards out of five to seven.

import type { Card, Suit } from '../core/cards.ts';

export enum HandCategory {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High card',
  [HandCategory.OnePair]: 'Pair',
  [HandCategory.TwoPair]: 'Two pair',
  [HandCategory.ThreeOfAKind]: 'Three of a kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full house',
  [HandCategory.FourOfAKind]: 'Four of a kind',
  [HandCategory.StraightFlush]: 'Straight flush',
};

export interface HandValue {
  category: HandCategory;
  /** Tie-break ranks, most significant first (Ace = 14; a wheel straight's high card is 5). */
  ranks: number[];
  /** The five cards that make the hand. */
  cards: Card[];
  /** Single comparable number: higher is better. */
  score: number;
}

/** Ace plays high (14) in poker. */
export const pokerRank = (c: Card): number => (c.rank === 1 ? 14 : c.rank);

const RANK_NAME: Record<number, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};
const PLURAL: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens',
  11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

function scoreOf(category: number, ranks: number[]): number {
  // category, then up to five ranks, each in base 15.
  let s = category;
  for (let i = 0; i < 5; i++) s = s * 15 + (ranks[i] ?? 0);
  return s;
}

/** Evaluates exactly five cards. */
export function evaluate5(cards: Card[]): HandValue {
  const rs = cards.map(pokerRank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const unique = [...new Set(rs)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 5 && rs[4] === 2) straightHigh = 5; // A-2-3-4-5 "wheel"
  }
  // groups: [rank, count] sorted by count desc, then rank desc
  const counts = new Map<number, number>();
  for (const r of rs) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const order = (cat: HandCategory, ranks: number[]): HandValue => {
    // Order the five cards to match the tie-break ranks (nice for display).
    const pool = cards.slice();
    const ordered: Card[] = [];
    const seq = straightHigh ? (straightHigh === 5 ? [5, 4, 3, 2, 14] : [0, 1, 2, 3, 4].map((i) => straightHigh - i)) : groups.flatMap(([r, n]) => Array(n).fill(r));
    for (const r of seq) {
      const i = pool.findIndex((c) => pokerRank(c) === r);
      if (i >= 0) ordered.push(pool.splice(i, 1)[0]);
    }
    return { category: cat, ranks, cards: ordered.concat(pool), score: scoreOf(cat, ranks) };
  };
  if (straightHigh && flush) return order(HandCategory.StraightFlush, [straightHigh]);
  if (groups[0][1] === 4) return order(HandCategory.FourOfAKind, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return order(HandCategory.FullHouse, [groups[0][0], groups[1][0]]);
  if (flush) return order(HandCategory.Flush, rs);
  if (straightHigh) return order(HandCategory.Straight, [straightHigh]);
  if (groups[0][1] === 3) return order(HandCategory.ThreeOfAKind, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2 && groups[1][1] === 2) return order(HandCategory.TwoPair, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2) return order(HandCategory.OnePair, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]);
  return order(HandCategory.HighCard, rs);
}

/** Best five-card hand from five, six or seven cards. */
export function evaluate(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error(`evaluate needs 5–7 cards, got ${cards.length}`);
  if (cards.length === 5) return evaluate5(cards);
  let best: HandValue | null = null;
  const n = cards.length;
  const pick: Card[] = new Array(5);
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            pick[0] = cards[a]; pick[1] = cards[b]; pick[2] = cards[c]; pick[3] = cards[d]; pick[4] = cards[e];
            const v = evaluate5(pick);
            if (!best || v.score > best.score) best = v;
          }
  return best!;
}

/** Fast score-only evaluation for AI simulations (same ordering as evaluate().score). */
export function quickScore(cards: Card[]): number {
  // 7-card evaluation by counting, without enumerating combinations.
  const rankCount = new Array(15).fill(0);
  const suitCards: Record<Suit, number[]> = { S: [], H: [], D: [], C: [] };
  for (const c of cards) {
    const r = pokerRank(c);
    rankCount[r]++;
    suitCards[c.suit].push(r);
  }
  const straightHighOf = (present: (r: number) => boolean): number => {
    for (let hi = 14; hi >= 5; hi--) {
      let ok = true;
      for (let k = 0; k < 5; k++) {
        const r = hi - k === 1 ? 14 : hi - k;
        if (!present(r)) { ok = false; break; }
      }
      if (ok) return hi;
    }
    return 0;
  };
  for (const s of ['S', 'H', 'D', 'C'] as Suit[]) {
    const sc = suitCards[s];
    if (sc.length >= 5) {
      const set = new Set(sc);
      const sf = straightHighOf((r) => set.has(r));
      if (sf) return scoreOf(HandCategory.StraightFlush, [sf]);
    }
  }
  const quads: number[] = [], trips: number[] = [], pairs: number[] = [], singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const n = rankCount[r];
    if (n === 4) quads.push(r); else if (n === 3) trips.push(r); else if (n === 2) pairs.push(r); else if (n === 1) singles.push(r);
  }
  if (quads.length) {
    const kick = Math.max(...[...trips, ...pairs, ...singles, ...quads.slice(1)], 0);
    return scoreOf(HandCategory.FourOfAKind, [quads[0], kick]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pairRank = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return scoreOf(HandCategory.FullHouse, [trips[0], pairRank]);
  }
  for (const s of ['S', 'H', 'D', 'C'] as Suit[]) {
    const sc = suitCards[s];
    if (sc.length >= 5) return scoreOf(HandCategory.Flush, sc.sort((a, b) => b - a).slice(0, 5));
  }
  const st = straightHighOf((r) => rankCount[r] > 0);
  if (st) return scoreOf(HandCategory.Straight, [st]);
  if (trips.length) {
    const kick = [...pairs, ...singles].sort((a, b) => b - a).slice(0, 2);
    return scoreOf(HandCategory.ThreeOfAKind, [trips[0], ...kick]);
  }
  if (pairs.length >= 2) {
    const kick = Math.max(pairs[2] ?? 0, singles[0] ?? 0);
    return scoreOf(HandCategory.TwoPair, [pairs[0], pairs[1], kick]);
  }
  if (pairs.length === 1) return scoreOf(HandCategory.OnePair, [pairs[0], ...singles.slice(0, 3)]);
  return scoreOf(HandCategory.HighCard, singles.slice(0, 5));
}

/** "Two pair, Kings and Nines", "Flush, Ace high", "Straight, Five high"… */
export function describeHand(v: HandValue): string {
  const [a, b] = v.ranks;
  switch (v.category) {
    case HandCategory.StraightFlush: return a === 14 ? 'Royal flush' : `Straight flush, ${RANK_NAME[a]} high`;
    case HandCategory.FourOfAKind: return `Four of a kind, ${PLURAL[a]}`;
    case HandCategory.FullHouse: return `Full house, ${PLURAL[a]} full of ${PLURAL[b]}`;
    case HandCategory.Flush: return `Flush, ${RANK_NAME[a]} high`;
    case HandCategory.Straight: return `Straight, ${RANK_NAME[a]} high`;
    case HandCategory.ThreeOfAKind: return `Three of a kind, ${PLURAL[a]}`;
    case HandCategory.TwoPair: return `Two pair, ${PLURAL[a]} and ${PLURAL[b]}`;
    case HandCategory.OnePair: return `Pair of ${PLURAL[a]}`;
    default: return `${RANK_NAME[a]} high`;
  }
}

/** Short description for 2–4 known cards (before the river makes five). */
export function describePartial(cards: Card[]): string {
  if (cards.length >= 5) return describeHand(evaluate(cards));
  const rs = cards.map(pokerRank);
  const counts = new Map<number, number>();
  for (const r of rs) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  if (groups[0][1] === 3) return `Three of a kind, ${PLURAL[groups[0][0]]}`;
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) return `Two pair, ${PLURAL[groups[0][0]]} and ${PLURAL[groups[1][0]]}`;
  if (groups[0][1] === 2) return cards.length === 2 ? `Pocket ${PLURAL[groups[0][0]].toLowerCase()}` : `Pair of ${PLURAL[groups[0][0]]}`;
  return `${RANK_NAME[Math.max(...rs)]} high`;
}
