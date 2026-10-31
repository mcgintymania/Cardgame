import { describe, expect, test } from 'bun:test';
import { standardDeck, type Card } from '../src/core/cards.ts';
import { seededRng, shuffle } from '../src/core/rng.ts';
import { describeHand, evaluate, HandCategory, quickScore } from '../src/poker/evaluator.ts';
import { buildPots, splitPot } from '../src/poker/pots.ts';
import { pokerApply, pokerOptions, pokerSetup, pokerView, totalPot } from '../src/poker/engine.ts';
import type { PokerAction, PokerState } from '../src/poker/types.ts';
import { cards } from './helpers.ts';

const rng = seededRng(5);
const ev = (s: string) => evaluate(cards(s));
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, isAI: false }));
const act = (s: PokerState, a: PokerAction, seat = s.current) => pokerApply(s, seat, a, rng).state;
const chips = (s: PokerState) => s.players.reduce((sum, p) => sum + p.stack, 0) + totalPot(s);

/** New hand with a fixed button, and optionally fixed hole cards and board. */
function deal(n: number, opts: { button?: number; stacks?: number[]; holes?: string[]; board?: string } = {}): PokerState {
  // find a seed whose random button matches
  let s: PokerState | null = null;
  for (let seed = 1; seed < 500 && !s; seed++) {
    const st = pokerSetup(undefined, seats(n), seededRng(seed)).state;
    if (opts.button === undefined || st.button === opts.button) s = st;
  }
  if (!s) throw new Error('no seed');
  if (opts.stacks) opts.stacks.forEach((v, i) => { s!.players[i].stack = v - s!.players[i].total; s!.players[i].allIn = s!.players[i].stack === 0; });
  if (opts.holes) {
    opts.holes.forEach((h, i) => { s!.players[i].hole = cards(h); });
    const b = cards(opts.board ?? '');
    const used = new Set([...opts.holes.flatMap((h) => cards(h)), ...b].map((c) => c.id));
    const filler = standardDeck().filter((c) => !used.has(c.id));
    // pop order: burn, f1, f2, f3, burn, turn, burn, river
    const x = () => filler.pop()!;
    s.deck = [...filler.splice(0, 0), b[4], x(), b[3], x(), b[2], b[1], b[0], x()].filter(Boolean) as Card[];
    s.deck = [...filler, ...s.deck];
  }
  return s;
}

// --------------------------------------------------------------- evaluator
describe('hand rankings', () => {
  test('categories in order', () => {
    const order = [
      ev('2C 7D 9H JS KD'), ev('2C 2D 9H JS KD'), ev('2C 2D 9H 9S KD'), ev('2C 2D 2H JS KD'), ev('5C 6D 7H 8S 9D'),
      ev('2H 7H 9H JH KH'), ev('2C 2D 2H KS KD'), ev('2C 2D 2H 2S KD'), ev('5H 6H 7H 8H 9H'),
    ];
    for (let i = 1; i < order.length; i++) expect(order[i].score).toBeGreaterThan(order[i - 1].score);
    expect(order.map((v) => v.category)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  test('wheel straight is five high and loses to a six-high straight', () => {
    const wheel = ev('AC 2D 3H 4S 5D');
    expect(wheel.category).toBe(HandCategory.Straight);
    expect(wheel.ranks).toEqual([5]);
    expect(ev('2D 3H 4S 5D 6C').score).toBeGreaterThan(wheel.score);
  });
  test('ace-high straight and royal flush', () => {
    expect(describeHand(ev('10H JH QH KH AH'))).toBe('Royal flush');
    expect(ev('10C JH QH KH AH').ranks).toEqual([14]);
  });
  test('kickers decide pairs and two pair', () => {
    expect(ev('KC KD 9H 7S 4D').score).toBeGreaterThan(ev('KH KS 9C 7D 3D').score);
    expect(ev('KC KD 9H 9S 4D').score).toBeGreaterThan(ev('KH KS 9C 9D 3D').score);
    expect(ev('AC AD 2H 2S 3D').score).toBeGreaterThan(ev('KH KS QC QD JD').score);
  });
  test('identical ranks in different suits tie', () => {
    expect(ev('AC KD 9H 7S 4D').score).toBe(ev('AD KH 9S 7C 4H').score);
  });
  test('best five of seven', () => {
    const v = evaluate(cards('AH KH 2C 7H 9H 3D QH'));
    expect(v.category).toBe(HandCategory.Flush);
    expect(v.ranks).toEqual([14, 13, 12, 9, 7]);
    expect(describeHand(evaluate(cards('KC KD 9H 9S 4D 4C 2H')))).toBe('Two pair, Kings and Nines');
    expect(describeHand(evaluate(cards('QC QD QH 9S 9D 4C 4H')))).toBe('Full house, Queens full of Nines');
  });
  test('fast scorer matches the full evaluator on 20,000 random hands', () => {
    const r = seededRng(99);
    const deck = standardDeck();
    for (let i = 0; i < 20000; i++) {
      const hand = shuffle(deck, r).slice(0, 7);
      expect(quickScore(hand)).toBe(evaluate(hand).score);
    }
  });
});

// -------------------------------------------------------------------- pots
describe('side pots and splits', () => {
  test('two all-ins of different sizes make a main pot and a side pot', () => {
    const pots = buildPots([
      { seat: 0, amount: 100, folded: false },
      { seat: 1, amount: 300, folded: false },
      { seat: 2, amount: 300, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 300, eligible: [0, 1, 2] }, { amount: 400, eligible: [1, 2] }]);
  });
  test("folded players' chips stay in the pot but they can't win it", () => {
    const pots = buildPots([
      { seat: 0, amount: 50, folded: true },
      { seat: 1, amount: 200, folded: false },
      { seat: 2, amount: 200, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 450, eligible: [1, 2] }]);
  });
  test('three-way with three different all-ins', () => {
    const pots = buildPots([
      { seat: 0, amount: 50, folded: false },
      { seat: 1, amount: 120, folded: false },
      { seat: 2, amount: 400, folded: false },
      { seat: 3, amount: 400, folded: false },
    ]);
    expect(pots.map((p) => p.amount)).toEqual([200, 210, 560]);
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(970);
  });
  test('odd chip goes to the first winner left of the button', () => {
    const m = splitPot(101, [1, 3], 2, 4);
    expect(m.get(3)).toBe(51);
    expect(m.get(1)).toBe(50);
  });
});

// ----------------------------------------------------------------- betting
describe('blinds and order of play', () => {
  test('heads-up: button posts the small blind and acts first before the flop', () => {
    const s = deal(2, { button: 0 });
    expect(s.sbSeat).toBe(0);
    expect(s.bbSeat).toBe(1);
    expect(s.current).toBe(0);
    let t = act(s, { type: 'call' });
    expect(t.current).toBe(1); // big blind's option
    expect(pokerOptions(t, 1)!.canCheck).toBe(true);
    t = act(t, { type: 'check' });
    expect(t.street).toBe('flop');
    expect(t.current).toBe(1); // big blind acts first after the flop heads-up
  });
  test('three-handed: button acts first preflop, small blind first on the flop', () => {
    let s = deal(3, { button: 0 });
    expect(s.sbSeat).toBe(1);
    expect(s.bbSeat).toBe(2);
    expect(s.current).toBe(0);
    s = act(s, { type: 'call' });
    s = act(s, { type: 'call' });
    s = act(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board.length).toBe(3);
    expect(s.current).toBe(1);
  });
  test('the big blind gets an option when everyone limps', () => {
    let s = deal(4, { button: 0 });
    s = act(s, { type: 'call' }); // seat 3
    s = act(s, { type: 'call' }); // button
    s = act(s, { type: 'call' }); // sb
    expect(s.current).toBe(2);
    expect(pokerOptions(s, 2)!.canRaise).toBe(true);
  });
});

describe('bet sizes', () => {
  test('minimum raise is the size of the last raise', () => {
    let s = deal(3, { button: 0 });
    expect(() => act(s, { type: 'raise', to: 30 })).toThrow(); // below min (40)
    s = act(s, { type: 'raise', to: 60 }); // raise of 40
    expect(pokerOptions(s, s.current)!.minRaiseTo).toBe(100);
  });
  test('opening bet must be at least the big blind', () => {
    let s = deal(2, { button: 0 });
    s = act(s, { type: 'call' });
    s = act(s, { type: 'check' });
    expect(() => act(s, { type: 'raise', to: 10 })).toThrow();
    s = act(s, { type: 'raise', to: 20 });
    expect(s.currentBet).toBe(20);
  });
  test('a short all-in raise does not reopen the betting', () => {
    // seat 0 (button) raises to 100, seat 1 (sb) goes all in for 130 total, seat 2 calls
    let s = deal(3, { button: 0, stacks: [1000, 130, 1000] });
    s = act(s, { type: 'raise', to: 100 });
    s = act(s, { type: 'allIn' });
    expect(s.currentBet).toBe(130);
    // big blind has not acted yet: may raise
    expect(pokerOptions(s, 2)!.canRaise).toBe(true);
    s = act(s, { type: 'call' });
    // back to the original raiser, who may only call or fold
    expect(s.current).toBe(0);
    const o = pokerOptions(s, 0)!;
    expect(o.canRaise).toBe(false);
    expect(o.toCall).toBe(30);
  });
  test('cannot check facing a bet, cannot call when nothing to call', () => {
    const s = deal(2, { button: 0 });
    expect(() => act(s, { type: 'check' })).toThrow();
    const t = act(s, { type: 'call' });
    expect(() => act(t, { type: 'call' })).toThrow();
  });
  test('out-of-turn actions are rejected', () => {
    const s = deal(3, { button: 0 });
    expect(() => pokerApply(s, 2, { type: 'fold' }, rng)).toThrow();
  });
});

describe('winning the pot', () => {
  test('everyone folds: last player takes the pot, uncalled bet comes back, cards stay hidden', () => {
    let s = deal(3, { button: 0 });
    const before = chips(s);
    s = act(s, { type: 'raise', to: 300 });
    s = act(s, { type: 'fold' });
    s = act(s, { type: 'fold' });
    expect(s.street).toBe('handOver');
    expect(s.players[0].stack).toBe(1000 + 10 + 20);
    expect(s.lastHand!.revealed).toEqual([]);
    expect(chips(s)).toBe(before);
  });
  test('all in before the flop runs out the board to a showdown', () => {
    let s = deal(2, { button: 0, holes: ['AS AH', 'KD KC'], board: '2C 7D 9H JS 3D' });
    s = act(s, { type: 'allIn' });
    s = act(s, { type: 'call' });
    expect(s.board.map((c) => c.id)).toEqual(['2C', '7D', '9H', 'JS', '3D']);
    expect(s.players[0].stack).toBe(2000);
    expect(s.lastHand!.pots[0].hand).toBe('Pair of Aces');
    expect(s.street).toBe('matchOver'); // heads-up: the loser is out
    expect(s.winner).toBe(0);
  });
  test('split pot when the board plays', () => {
    let s = deal(2, { button: 0, holes: ['2S 3H', '2D 3C'], board: '10H JH QH KH AH' });
    s = act(s, { type: 'call' });
    s = act(s, { type: 'check' });
    for (let i = 0; i < 6; i++) s = act(s, { type: 'check' });
    expect(s.street).toBe('handOver');
    expect(s.lastHand!.pots[0].winners).toEqual([0, 1]);
    expect(s.players[0].stack).toBe(1000);
    expect(s.players[1].stack).toBe(1000);
  });
  test('side pot: short stack wins the main pot, bigger stack wins the side pot', () => {
    // seat 0 has 100 and the best hand; seat 2 beats seat 1 for the side pot
    let s = deal(3, { button: 0, stacks: [100, 1000, 1000], holes: ['AS AH', 'KD KC', 'QD QC'], board: '2C 7D 9H QH 3D' });
    s = act(s, { type: 'allIn' }); // button all in 100
    s = act(s, { type: 'raise', to: 400 }); // sb
    s = act(s, { type: 'call' }); // bb
    for (let i = 0; i < 6; i++) if (s.street !== 'handOver') s = act(s, { type: 'check' });
    expect(s.street).toBe('handOver');
    const pots = s.lastHand!.pots;
    expect(pots[0]).toMatchObject({ amount: 300, winners: [2] });
    // Queens make a set on this board, beating aces and kings
    expect(s.players[2].stack).toBe(1000 - 400 + 300 + 600);
    expect(s.players[0].stack).toBe(0);
    expect(s.players[0].busted).toBe(true);
    expect(s.players[0].place).toBe(3);
  });
  test('main pot to the short stack, side pot to the next best', () => {
    let s = deal(3, { button: 0, stacks: [100, 1000, 1000], holes: ['AS AH', 'KD KC', 'QD JC'], board: '2C 7D 9H 4H 3D' });
    s = act(s, { type: 'allIn' });
    s = act(s, { type: 'raise', to: 400 });
    s = act(s, { type: 'call' });
    for (let i = 0; i < 6; i++) if (s.street !== 'handOver') s = act(s, { type: 'check' });
    expect(s.players[0].stack).toBe(300);
    expect(s.players[1].stack).toBe(1000 - 400 + 600);
    expect(s.players[2].stack).toBe(600);
  });
});

describe('privacy', () => {
  test("views never contain other players' hole cards or the deck before showdown", () => {
    const s = deal(4, { button: 0 });
    const v = pokerView(s, 1);
    const json = JSON.stringify(v);
    for (const p of s.players) if (p.seat !== 1) for (const c of p.hole) expect(json.includes(`"id":"${c.id}"`)).toBe(false);
    for (const c of s.deck) expect(json.includes(`"id":"${c.id}"`)).toBe(false);
    expect(v.hole.length).toBe(2);
  });
});
