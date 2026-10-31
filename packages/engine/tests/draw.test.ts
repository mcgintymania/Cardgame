import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { IllegalActionError } from '../src/core/game.ts';
import { DrawModule, totalPot } from '../src/poker/engine.ts';
import { drawChooseAction, drawDiscards, estimateDrawEquity, POKER_PERSONALITIES } from '../src/poker/index.ts';
import type { PokerAction, PokerState } from '../src/poker/types.ts';
import { cards } from './helpers.ts';

const seats = (n: number, ai = false) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, isAI: ai }));
const act = (s: PokerState, a: PokerAction, seat = s.current) => DrawModule.apply(s, seat, a, seededRng(3)).state;
const chips = (s: PokerState) => s.players.reduce((sum, p) => sum + p.stack, 0) + totalPot(s);
const ids = (spec: string) => cards(spec).map((c) => c.id);

describe('Five-Card Draw flow', () => {
  test('five cards each, blinds posted, betting then a draw then betting', () => {
    let s = DrawModule.setup(DrawModule.normalizeConfig(undefined), seats(3), seededRng(1)).state;
    expect(s.config.variant).toBe('draw');
    for (const p of s.players) expect(p.hole.length).toBe(5);
    expect(s.street).toBe('preflop');
    // everyone calls / checks
    while (s.street === 'preflop') s = act(s, s.players[s.current].bet < s.currentBet ? { type: 'call' } : { type: 'check' });
    expect(s.street).toBe('draw');
    // first to draw is left of the button
    const order: number[] = [];
    while (s.street === 'draw') { order.push(s.current); s = act(s, { type: 'draw', discard: s.players[s.current].hole.slice(0, 2).map((c) => c.id) }); }
    expect(order[0]).toBe((s.button + 1) % 3);
    expect(order.length).toBe(3);
    expect(s.street).toBe('river');
    for (const p of s.players) { expect(p.hole.length).toBe(5); expect(p.drew).toBe(2); }
    while (s.street === 'river') s = act(s, { type: 'check' });
    expect(s.street).toBe('handOver');
    expect(s.lastHand!.revealed.length).toBe(3);
    expect(chips(s)).toBe(3000);
  });

  test('draw rules: at most three, only your own cards, no duplicates, no betting during the draw', () => {
    let s = DrawModule.setup(undefined, seats(2), seededRng(2)).state;
    while (s.street === 'preflop') s = act(s, s.players[s.current].bet < s.currentBet ? { type: 'call' } : { type: 'check' });
    const h = s.players[s.current].hole;
    expect(() => act(s, { type: 'draw', discard: h.slice(0, 4).map((c) => c.id) })).toThrow(/at most 3/);
    expect(() => act(s, { type: 'draw', discard: [h[0].id, h[0].id] })).toThrow(IllegalActionError);
    const other = s.players[(s.current + 1) % 2].hole[0].id;
    expect(() => act(s, { type: 'draw', discard: [other] })).toThrow(/your hand/);
    expect(() => act(s, { type: 'check' })).toThrow(IllegalActionError);
    const before = new Set(h.map((c) => c.id));
    const after = act(s, { type: 'draw', discard: [h[0].id] });
    const p = after.players[s.current];
    expect(p.hole.some((c) => c.id === h[0].id)).toBe(false);
    expect(p.hole.filter((c) => !before.has(c.id)).length).toBe(1);
    expect(p.lastAction).toBe('Draws 1');
  });

  test('a fold before the draw ends the hand uncontested', () => {
    let s = DrawModule.setup(undefined, seats(2), seededRng(4)).state;
    s = act(s, { type: 'fold' });
    expect(s.street).toBe('handOver');
    expect(chips(s)).toBe(2000);
  });

  test('all-in players still draw, then it goes straight to showdown', () => {
    let s = DrawModule.setup(undefined, seats(2), seededRng(6)).state;
    s = act(s, { type: 'allIn' });
    s = act(s, { type: 'call' });
    expect(s.street).toBe('draw');
    s = act(s, { type: 'draw', discard: [] });
    s = act(s, { type: 'draw', discard: [] });
    expect(['handOver', 'matchOver']).toContain(s.street);
    expect(chips(s)).toBe(2000);
  });

  test('opponents see how many cards you drew, never which', () => {
    let s = DrawModule.setup(undefined, seats(2), seededRng(8)).state;
    while (s.street === 'preflop') s = act(s, s.players[s.current].bet < s.currentBet ? { type: 'call' } : { type: 'check' });
    const seat = s.current;
    s = act(s, { type: 'draw', discard: s.players[seat].hole.slice(0, 3).map((c) => c.id) });
    const v = DrawModule.viewFor(s, (seat + 1) % 2);
    expect(v.players[seat].drew).toBe(3);
    const json = JSON.stringify(v);
    for (const c of [...s.players[seat].hole, ...s.muck, ...s.deck]) expect(json.includes(`"id":"${c.id}"`)).toBe(false);
  });

  test('at most six players', () => {
    expect(() => DrawModule.setup(undefined, seats(7), seededRng(1))).toThrow(/up to 6/);
  });
});

describe('Draw strategy', () => {
  test('keeps made hands, pairs, trips, two pair; draws to flushes and open straights', () => {
    expect(drawDiscards(cards('2S 3S 4S 5S 7S'))).toEqual([]);
    expect(drawDiscards(cards('9H 9D 9C KS 2D')).map((c) => c.id).sort()).toEqual(ids('KS 2D').sort());
    expect(drawDiscards(cards('9H 9D 4C 4S AD')).map((c) => c.id)).toEqual(ids('AD'));
    expect(drawDiscards(cards('QH QD 4C 7S 2D')).length).toBe(3);
    expect(drawDiscards(cards('AH 7H 4H 2H KC')).map((c) => c.id)).toEqual(ids('KC'));
    expect(drawDiscards(cards('5D 6H 7C 8S KC')).map((c) => c.id)).toEqual(ids('KC'));
    expect(drawDiscards(cards('AD KH 7C 4S 2C')).map((c) => c.id).sort()).toEqual(ids('7C 4S 2C').sort());
  });

  test('a pat hand is scarier than a three-card draw', () => {
    const hole = cards('KH KD 7C 4S 2D');
    const vsPat = estimateDrawEquity(hole, [0], 400, 3, seededRng(1));
    const vsThree = estimateDrawEquity(hole, [3], 400, 3, seededRng(1));
    expect(vsThree).toBeGreaterThan(vsPat + 0.2);
  });
});

describe('Draw AI vs AI', () => {
  test('full matches finish with chips conserved and every action accepted', () => {
    const ps = Object.keys(POKER_PERSONALITIES);
    const wins: Record<string, number> = {};
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed);
      const n = 2 + (seed % 5);
      const st = Array.from({ length: n }, (_, i) => ({ playerId: `a${i}`, name: `A${i}`, isAI: true, personality: ps[(i + seed) % ps.length] }));
      let s = DrawModule.setup(DrawModule.normalizeConfig({ startingStack: 400, blindsUpEvery: 6 }), st, rng).state;
      const total = chips(s);
      let guard = 0;
      while (s.street !== 'matchOver') {
        if (guard++ > 20000) throw new Error('stuck');
        expect(chips(s)).toBe(total);
        const seat = s.street === 'handOver' ? 0 : s.current;
        const a = drawChooseAction(DrawModule.viewFor(s, seat), st[seat].personality, rng);
        s = DrawModule.apply(s, seat, a, rng).state;
        const all = [...s.deck, ...s.muck, ...s.players.flatMap((p) => p.hole)];
        if (s.street !== 'handOver' && s.street !== 'matchOver') expect(new Set(all.map((c) => c.id)).size).toBe(52);
      }
      const w = st[s.winner!].personality!;
      wins[w] = (wins[w] ?? 0) + 1;
    }
    console.log('draw wins', wins);
    expect(Object.values(wins).reduce((a, b) => a + b, 0)).toBe(40);
  }, 120000);
});
