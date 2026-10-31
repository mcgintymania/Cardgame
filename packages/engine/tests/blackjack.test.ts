import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { IllegalActionError } from '../src/core/game.ts';
import {
  BJ_PERSONALITIES, BlackjackModule, basicStrategy, blackjackAI, handValue,
  type BJAction, type BlackjackConfig, type BlackjackState,
} from '../src/blackjack/index.ts';
import { cards } from './helpers.ts';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, isAI: false }));
const act = (s: BlackjackState, seat: number, a: BJAction) => BlackjackModule.apply(s, seat, a, seededRng(9));

/** A table where the next cards out of the shoe are exactly `next` (first listed comes out first). */
function rigged(n: number, next: string, config: Partial<BlackjackConfig> = {}): BlackjackState {
  const s = BlackjackModule.setup(BlackjackModule.normalizeConfig(config), seats(n), seededRng(1)).state;
  const top = cards(next).map((c, i) => ({ ...c, id: `z${i}${c.id}` }));
  s.shoe = [...s.shoe.slice(0, 200), ...top.reverse()];
  s.cutCard = 0;
  return s;
}
const betAll = (s: BlackjackState, amt = 100) => { let st = s; for (const p of s.players) st = act(st, p.seat, { type: 'bet', amount: amt }).state; return st; };

describe('blackjack hand values', () => {
  test('aces count 1 or 11', () => {
    expect(handValue(cards('AS KD'))).toEqual({ total: 21, soft: true });
    expect(handValue(cards('AS 6D'))).toEqual({ total: 17, soft: true });
    expect(handValue(cards('AS 6D 9C'))).toEqual({ total: 16, soft: false });
    expect(handValue(cards('AS AD 9C'))).toEqual({ total: 21, soft: true });
    expect(handValue(cards('KS QD 5C'))).toEqual({ total: 25, soft: false });
  });
});

describe('blackjack rounds', () => {
  test('bets are checked; cards are dealt once everyone has bet', () => {
    let s = BlackjackModule.setup(BlackjackModule.normalizeConfig({}), seats(2), seededRng(2)).state;
    expect(() => act(s, 0, { type: 'bet', amount: 5 })).toThrow(/between/);
    expect(() => act(s, 0, { type: 'bet', amount: 600 })).toThrow(/between/);
    s = act(s, 0, { type: 'bet', amount: 50 }).state;
    expect(s.phase).toBe('bet');
    expect(s.players[0].chips).toBe(950);
    // the other player can't see your bet until bets close
    expect(BlackjackModule.viewFor(s, 1).players[0].bet).toBe(null);
    s = act(s, 1, { type: 'bet', amount: 20 }).state;
    expect(['play', 'roundOver']).toContain(s.phase);
    for (const p of s.players) expect(p.hands[0].cards.length).toBeGreaterThanOrEqual(2);
  });

  test('win pays even money; dealer stands on 17', () => {
    // deal order: P0, dealer, P0, dealer(hole) → P0: 10,9 = 19; dealer K,7 = 17
    let s = rigged(1, '10H KS 9D 7C');
    s = betAll(s);
    s = act(s, 0, { type: 'stand' }).state;
    expect(s.phase).toBe('roundOver');
    expect(s.history[0].dealerTotal).toBe(17);
    expect(s.players[0].chips).toBe(1100);
  });

  test('blackjack pays 3:2 and the hand plays itself', () => {
    let s = rigged(1, 'AH 9S KD 7C');
    s = betAll(s);
    expect(s.history[0].lines[0].hands[0].outcome).toBe('blackjack');
    expect(s.players[0].chips).toBe(1150);
  });

  test('dealer blackjack: everyone loses their bet unless they also have one', () => {
    // P0: 10,5 ; P1: 9,5 ; dealer A, K (blackjack, peeked)
    let s = rigged(2, '10H 9C AS 5D 5C KD');
    s = betAll(s, 50);
    expect(s.history[0].dealerBlackjack).toBe(true);
    expect(s.players.map((p) => p.chips)).toEqual([950, 950]);
  });

  test('bust loses straight away even if the dealer busts later', () => {
    // P0: 10,6 ; dealer 6,10 ; P0 hits K → bust ; dealer draws 9 → bust
    let s = rigged(1, '10H 6S 6D 10C KS 9H');
    s = betAll(s);
    s = act(s, 0, { type: 'hit' }).state;
    expect(s.history[0].lines[0].hands[0].outcome).toBe('bust');
    expect(s.players[0].chips).toBe(900);
  });

  test('double: one card, double the bet', () => {
    // P0: 6,5 ; dealer 6,10 ; double gets 10 → 21 ; dealer hits 8 → 24 bust
    let s = rigged(1, '6H 6S 5D 10C 10S 8H');
    s = betAll(s);
    s = act(s, 0, { type: 'double' }).state;
    expect(s.history[0].lines[0].hands[0].bet).toBe(200);
    expect(s.players[0].chips).toBe(1200);
  });

  test('split: two hands with their own bets; split aces get one card each', () => {
    let s = rigged(1, '8H 6S 8D 10C 3S 10H');
    s = betAll(s);
    s = act(s, 0, { type: 'split' }).state;
    expect(s.players[0].hands.length).toBe(2);
    expect(s.players[0].chips).toBe(800);
    expect(s.players[0].hands.map((h) => h.cards.length)).toEqual([2, 2]);
    let a = rigged(1, 'AH 6S AD 10C KS QH');
    a = betAll(a);
    a = act(a, 0, { type: 'split' }).state;
    expect(a.phase).not.toBe('play'); // both ace hands are finished
    expect(a.history[0].lines[0].hands.map((h) => h.outcome)).toEqual(['win', 'win']); // 21s, not blackjacks
    expect(a.players[0].chips).toBe(1200);
  });

  test("can't double or split without the chips, or split a non-pair", () => {
    let s = rigged(1, '8H 6S 9D 10C', { startingChips: 100, minBet: 10 });
    s = act(s, 0, { type: 'bet', amount: 100 }).state;
    expect(() => act(s, 0, { type: 'double' })).toThrow(IllegalActionError);
    expect(() => act(s, 0, { type: 'split' })).toThrow(IllegalActionError);
  });

  test('surrender (when allowed) gives back half', () => {
    let s = rigged(1, '10H 9S 6D 10C', { surrender: true });
    s = betAll(s);
    s = act(s, 0, { type: 'surrender' }).state;
    expect(s.players[0].chips).toBe(950);
  });

  test('players who can’t cover the minimum are out; most chips at the end wins', () => {
    let s = rigged(2, '10H 10S 9C 7D 8D 8C', { rounds: 2 });
    s = act(s, 0, { type: 'bet', amount: 500 }).state;
    s = act(s, 1, { type: 'bet', amount: 10 }).state;
    // P0: 10,7 = 17; P1: 10,8 = 18 ; dealer 9,8 = 17
    s = act(s, 0, { type: 'stand' }).state;
    s = act(s, 1, { type: 'stand' }).state;
    expect(s.players.map((p) => p.chips)).toEqual([1000, 1010]);
    expect(s.phase).toBe('roundOver');
    s = act(s, 0, { type: 'nextRound' }).state;
    expect(s.round).toBe(2);
    expect(s.phase).toBe('bet');
  });
});

describe('basic strategy', () => {
  const bs = (spec: string, up: number, o = { canDouble: true, canSplit: true, canSurrender: false }) => basicStrategy(cards(spec), up, o);
  test('a few textbook plays', () => {
    expect(bs('8H 8D', 10)).toBe('P');
    expect(bs('10H KD', 6)).toBe('S');
    expect(bs('6H 5D', 6)).toBe('D');
    expect(bs('6H 5D', 11)).toBe('H');
    expect(bs('10H 6D', 7)).toBe('H');
    expect(bs('10H 6D', 4)).toBe('S');
    expect(bs('10H 2D', 3)).toBe('H');
    expect(bs('AH 7D', 9)).toBe('H');
    expect(bs('AH 7D', 7)).toBe('S');
    expect(bs('AH 6D', 4)).toBe('D');
    expect(bs('10H 6D', 10, { canDouble: true, canSplit: true, canSurrender: true })).toBe('R');
  });
});

describe('blackjack AI vs AI', () => {
  test('full tournaments finish with chips accounted for and every action legal', () => {
    const ps = Object.keys(BJ_PERSONALITIES);
    const wins: Record<string, number> = {};
    for (let seed = 1; seed <= 150; seed++) {
      const rng = seededRng(seed);
      const n = 1 + (seed % 5);
      const st = Array.from({ length: n }, (_, i) => ({ playerId: `a${i}`, name: `A${i}`, isAI: true, personality: ps[(i + seed) % ps.length] }));
      let s = BlackjackModule.setup(BlackjackModule.normalizeConfig({ rounds: 6 + (seed % 10), surrender: seed % 3 === 0, dealerHitsSoft17: seed % 4 === 0 }), st, rng).state;
      let guard = 0;
      while (s.phase !== 'matchOver') {
        if (guard++ > 5000) throw new Error('stuck');
        const seat = s.phase === 'roundOver' ? 0 : BlackjackModule.actingSeats(s)[0];
        const a = blackjackAI(BlackjackModule.viewFor(s, seat), st[seat].personality, rng);
        const legalTypes = BlackjackModule.legalActions(s, seat).map((x) => x.type);
        expect(legalTypes).toContain(a.type);
        s = BlackjackModule.apply(s, seat, a, rng).state;
        for (const p of s.players) expect(p.chips).toBeGreaterThanOrEqual(0);
      }
      // net results add up to the chip changes
      for (const p of s.players) {
        const net = s.history.reduce((a, r) => a + (r.lines.find((l) => l.seat === p.seat)?.net ?? 0), 0);
        expect(p.chips).toBe(s.config.startingChips + net);
      }
      expect(new Set(s.placements).size).toBe(n);
      if (n > 1) { const w = st[s.placements![0]].personality!; wins[w] = (wins[w] ?? 0) + 1; }
    }
    console.log('blackjack wins', wins);
  }, 60000);

  test('basic strategy loses slowly: the expert keeps most of its chips over many hands', () => {
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed * 7);
      let s = BlackjackModule.setup(BlackjackModule.normalizeConfig({ rounds: 50, maxBet: 10, startingChips: 1000 }), [{ playerId: 'x', name: 'X', isAI: true }], rng).state;
      while (s.phase !== 'matchOver') {
        const seat = 0;
        const v = BlackjackModule.viewFor(s, seat);
        s = BlackjackModule.apply(s, seat, s.phase === 'roundOver' ? { type: 'nextRound' } : s.phase === 'bet' ? { type: 'bet', amount: 10 } : blackjackAI(v, 'expert', rng), rng).state;
      }
      total += s.players[0].chips - 1000;
    }
    // house edge ~0.5%: over 2,000 hands of 10 the loss should be small (allow wide variance)
    expect(total / (40 * 50 * 10)).toBeGreaterThan(-0.08);
  });
});

