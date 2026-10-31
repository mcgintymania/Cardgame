// Standard playing-card primitives shared by every game mode.

export type Suit = 'S' | 'H' | 'D' | 'C';
/** 1 = Ace, 11 = Jack, 12 = Queen, 13 = King */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  /** Unique within a deck, e.g. "JH" = Jack of hearts, "10S" = ten of spades. Add a deck prefix for multi-deck games. */
  id: string;
  suit: Suit;
  rank: Rank;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const SUIT_NAMES: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
export const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 1: return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return String(rank);
  }
}

export function rankName(rank: Rank): string {
  switch (rank) {
    case 1: return 'Ace';
    case 11: return 'Jack';
    case 12: return 'Queen';
    case 13: return 'King';
    default: return String(rank);
  }
}

export function cardLabel(c: Card): string {
  return `${rankLabel(c.rank)}${SUIT_SYMBOLS[c.suit]}`;
}

export function cardName(c: Card): string {
  return `${rankName(c.rank)} of ${SUIT_NAMES[c.suit]}`;
}

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function makeCard(rank: Rank, suit: Suit, prefix = ''): Card {
  return { id: `${prefix}${rankLabel(rank)}${suit}`, rank, suit };
}

/** A fresh, ordered 52-card deck. Always shuffle before dealing. */
export function standardDeck(prefix = ''): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit, prefix));
  return deck;
}
