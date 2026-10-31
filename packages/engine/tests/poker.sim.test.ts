// Full AI-vs-AI Hold'em matches. After every action: no chips created or lost,
// no duplicate cards, no negative stacks, and the AI only makes legal moves.

import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { pokerChooseAction, POKER_PERSONALITIES } from '../src/poker/ai.ts';
import { pokerApply, pokerSetup, pokerView, totalPot } from '../src/poker/engine.ts';
import type { PokerState } from '../src/poker/types.ts';

const ids = Object.keys(POKER_PERSONALITIES);

function check(s: PokerState, expected: number) {
  const chips = s.players.reduce((sum, p) => sum + p.stack, 0) + totalPot(s);
  expect(chips).toBe(expected);
  for (const p of s.players) expect(p.stack).toBeGreaterThanOrEqual(0);
  const cardsSeen = [...s.deck, ...s.board, ...s.players.flatMap((p) => p.hole)].map((c) => c.id);
  if (s.street !== 'handOver' && s.street !== 'matchOver') {
    expect(new Set(cardsSeen).size).toBe(cardsSeen.length);
    expect(cardsSeen.length).toBe(52 - burned(s));
  }
}
const burned = (s: PokerState) => ({ preflop: 0, flop: 1, turn: 2, river: 3 } as Record<string, number>)[s.street] ?? 0;

function runMatch(seed: number, n: number) {
  const rng = seededRng(seed);
  const seats = Array.from({ length: n }, (_, i) => ({ playerId: `ai${i}`, name: `AI ${i}`, isAI: true, personality: ids[(i + seed) % ids.length] }));
  let { state } = pokerSetup({ blindsUpEvery: 4, startingStack: 600 }, seats, rng);
  const total = 600 * n;
  let actions = 0;
  while (state.street !== 'matchOver') {
    check(state, total);
    const seat = state.street === 'handOver' ? state.players.findIndex((p) => !p.busted) : state.current;
    const action = pokerChooseAction(pokerView(state, seat), seats[seat].personality, rng);
    state = pokerApply(state, seat, action, rng).state;
    if (++actions > 30000) throw new Error('match did not finish');
  }
  check(state, total);
  expect(state.players.filter((p) => !p.busted).length).toBe(1);
  const places = state.players.map((p) => p.place).sort((a, b) => a! - b!);
  expect(places).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  return state.handNumber;
}

describe("full AI Hold'em matches", () => {
  test('2–9 players: chips conserved, all moves legal, everyone placed', () => {
    let hands = 0;
    for (let seed = 1; seed <= 24; seed++) hands += runMatch(seed, 2 + (seed % 8));
    expect(hands).toBeGreaterThan(200);
  }, 120000);
});
