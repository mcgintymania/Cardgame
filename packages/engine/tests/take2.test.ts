import { describe, expect, test } from 'bun:test';
import { standardDeck } from '../src/core/cards.ts';
import { cryptoRng, seededRng, shuffle } from '../src/core/rng.ts';
import { defaultTake2Config, normalizeTake2Config } from '../src/take2/config.ts';
import { scoreHand } from '../src/take2/scoring.ts';
import { take2Apply, take2LegalActions, take2Setup, take2View } from '../src/take2/engine.ts';
import type { Take2State } from '../src/take2/types.ts';
import { cards, makeState, seats } from './helpers.ts';

const rng = seededRng(42);
const S = defaultTake2Config().scoring;
const play = (s: Take2State, seat: number, cardId: string, suit?: 'S' | 'H' | 'D' | 'C') =>
  take2Apply(s, seat, { type: 'play', cardId, suit }, rng);

// ------------------------------------------------------------------ deck
describe('deck & shuffle', () => {
  test('standard deck has 52 unique cards', () => {
    const d = standardDeck();
    expect(d.length).toBe(52);
    expect(new Set(d.map((c) => c.id)).size).toBe(52);
  });
  test('shuffle is a permutation and does not mutate input', () => {
    const d = standardDeck();
    const before = d.map((c) => c.id).join();
    const s = shuffle(d, cryptoRng());
    expect(d.map((c) => c.id).join()).toBe(before);
    expect(s.map((c) => c.id).sort().join()).toBe(d.map((c) => c.id).sort().join());
  });
  test('secure rng stays in range', () => {
    const r = cryptoRng();
    for (let i = 0; i < 2000; i++) {
      const x = r.int(7);
      expect(x >= 0 && x < 7).toBe(true);
    }
  });
  test('shuffle is roughly uniform (first position over 52k shuffles)', () => {
    const r = seededRng(7);
    const counts = new Map<string, number>();
    const d = standardDeck();
    for (let i = 0; i < 52000; i++) {
      const id = shuffle(d, r)[0].id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const c of d) {
      const n = counts.get(c.id) ?? 0;
      expect(n > 800 && n < 1200).toBe(true); // expected 1000
    }
  });
});

// --------------------------------------------------------------- scoring
describe('scoring (owner spec)', () => {
  test('face values', () => {
    expect(scoreHand(cards('AH 3S 7D 9C 10H'), S).total).toBe(1 + 3 + 7 + 9 + 10);
  });
  test('8, Q, K are 10; J is 20', () => {
    expect(scoreHand(cards('8H'), S).total).toBe(10);
    expect(scoreHand(cards('QH KS'), S).total).toBe(20);
    expect(scoreHand(cards('JD'), S).total).toBe(20);
  });
  test('spec example: 5 + 10 + two 2s = 60', () => {
    expect(scoreHand(cards('5H 10S 2C 2D'), S).total).toBe(60);
  });
  test('2s multiply repeatedly', () => {
    expect(scoreHand(cards('JH 2C'), S).total).toBe(40);
    expect(scoreHand(cards('JH 2C 2D 2S'), S).total).toBe(160);
    expect(scoreHand(cards('AH 2C 2D 2S 2H'), S).total).toBe(16);
  });
  test('hand of only 2s scores 0 (flagged as an open question)', () => {
    expect(scoreHand(cards('2C 2D'), S).total).toBe(0);
  });
  test('empty hand scores 0', () => {
    expect(scoreHand([], S).total).toBe(0);
  });
  test('scoring is configurable: face-value mode and hand cap', () => {
    expect(scoreHand(cards('5H 10S 2C 2D'), { ...S, twoScoring: 'facevalue' }).total).toBe(19);
    expect(scoreHand(cards('JH 2C 2D 2S'), { ...S, handCap: 100 }).total).toBe(100);
  });
});

describe('config', () => {
  test('normalize rejects junk and clamps numbers', () => {
    const c = normalizeTake2Config({ handSize: 99, matchRule: 'nope' as never, eliminationAt: -5 });
    expect(c.handSize).toBe(10);
    expect(c.matchRule).toBe('suitOrRank');
    expect(c.eliminationAt).toBe(10);
  });
});

// ---------------------------------------------------------------- setup
describe('setup & dealing', () => {
  test('deals hands, one discard, rest in draw pile; no duplicates', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { state } = take2Setup(undefined, seats(4), seededRng(seed));
      const all = [...state.drawPile, ...state.discard, ...state.players.flatMap((p) => p.hand)];
      expect(all.length).toBe(52);
      expect(new Set(all.map((c) => c.id)).size).toBe(52);
      for (const p of state.players) expect(p.hand.length).toBe(7);
      // reflip default: first discard is never an action card
      expect([2, 8, 11]).not.toContain(state.discard[0].rank);
    }
  });
  test('rejects wrong player counts', () => {
    expect(() => take2Setup(undefined, seats(1), rng)).toThrow();
    expect(() => take2Setup(undefined, seats(7), rng)).toThrow();
  });
  test('never over-deals with large hands', () => {
    const { state } = take2Setup({ handSize: 10 }, seats(6), rng);
    expect(state.players[0].hand.length).toBe(8);
  });
});

// ------------------------------------------------------------- legality
describe('playing cards', () => {
  test('match suit or rank; others are illegal', () => {
    const s = makeState({ hands: ['5H 7S 9C KD', 'AS'], discard: '7H' });
    const ids = take2LegalActions(s, 0).filter((a) => a.type === 'play').map((a) => (a as { cardId: string }).cardId);
    expect(ids.sort()).toEqual(['5H', '7S'].sort());
    expect(() => play(s, 0, '9C')).toThrow();
  });
  test('suit-only rule', () => {
    const s = makeState({ hands: ['5H 7S', 'AS'], discard: '7H', config: { matchRule: 'suitOnly' } });
    expect(() => play(s, 0, '7S')).toThrow();
    expect(() => play(s, 0, '5H')).not.toThrow();
  });
  test('cannot act out of turn or play a card you do not hold', () => {
    const s = makeState({ hands: ['5H 6H', '4H 3H'], discard: '7H' });
    expect(() => play(s, 1, '4H')).toThrow();
    expect(() => play(s, 0, '9H')).toThrow();
  });
  test('apply does not mutate the input state', () => {
    const s = makeState({ hands: ['5H 6H', '4H 3H'], discard: '7H' });
    const snap = JSON.stringify(s);
    play(s, 0, '5H');
    expect(JSON.stringify(s)).toBe(snap);
  });
  test('turn passes to the next player', () => {
    const s = makeState({ hands: ['5H 6H', '4H 3H', '9H 9S'], discard: '7H' });
    expect(play(s, 0, '5H').state.current).toBe(1);
  });
});

// ---------------------------------------------------------- action cards
describe('2 — draw two', () => {
  test('next player must take two', () => {
    let s = makeState({ hands: ['2H 6H', '4C 3C', '9S 9D'], discard: '7H', draw: 'KC QC AD' });
    s = play(s, 0, '2H').state;
    expect(s.pending).toEqual({ kind: 'draw', amount: 2 });
    expect(s.current).toBe(1);
    const legal = take2LegalActions(s, 1).map((a) => a.type);
    expect(legal).toEqual(['takePenalty']);
    s = take2Apply(s, 1, { type: 'takePenalty' }, rng).state;
    expect(s.players[1].hand.length).toBe(4);
    expect(s.pending).toBeNull();
    expect(s.current).toBe(2); // penalty ends turn (default)
  });
  test('2s stack when enabled', () => {
    let s = makeState({ hands: ['2H 6H', '2C 3C', '9S 9D'], discard: '7H', draw: 'KC QC AD 4D 5D' });
    s = play(s, 0, '2H').state;
    s = play(s, 1, '2C').state;
    expect(s.pending).toEqual({ kind: 'draw', amount: 4 });
    expect(s.current).toBe(2);
    s = take2Apply(s, 2, { type: 'takePenalty' }, rng).state;
    expect(s.players[2].hand.length).toBe(6);
  });
  test('2s do not stack when disabled', () => {
    let s = makeState({ hands: ['2H 6H', '2C 3C'], discard: '7H', draw: 'KC QC', config: { twoStacking: false } });
    s = play(s, 0, '2H').state;
    expect(() => play(s, 1, '2C')).toThrow();
  });
  test('only a 2 may be played on a pending +2', () => {
    let s = makeState({ hands: ['2H 6H', '3H 2C'], discard: '7H', draw: 'KC QC' });
    s = play(s, 0, '2H').state;
    expect(() => play(s, 1, '3H')).toThrow();
  });
  test('penalty does not end turn when configured', () => {
    let s = makeState({ hands: ['2H 6H', '4C 3H'], discard: '7H', draw: 'KC QC', config: { penaltyEndsTurn: false } });
    s = play(s, 0, '2H').state;
    s = take2Apply(s, 1, { type: 'takePenalty' }, rng).state;
    expect(s.current).toBe(1);
    expect(s.phase).toBe('play');
  });
});

describe('8 — skip', () => {
  test('next player misses their turn', () => {
    let s = makeState({ hands: ['8H 6H', '4H 3H', '9H 9S'], discard: '7H' });
    const r = play(s, 0, '8H');
    s = r.state;
    expect(s.current).toBe(2);
    expect(r.events.some((e) => e.type === 'skipped' && e.seat === 1)).toBe(true);
  });
  test('in a two-player game the skipper goes again', () => {
    const s = play(makeState({ hands: ['8H 6H', '4H 3H'], discard: '7H' }), 0, '8H').state;
    expect(s.current).toBe(0);
  });
  test('by default, if you are skipped and hold an 8 you can play it', () => {
    let s = makeState({ hands: ['8H 6H', '8S 3H', '9H 9S'], discard: '7H' });
    s = play(s, 0, '8H').state;
    expect(s.current).toBe(1);
    expect(take2LegalActions(s, 1).some((a) => a.type === 'play')).toBe(true);
    s = play(s, 1, '8S').state;
    expect(s.current).toBe(0);
  });
  test('8s can pass the skip on when eightStacking is on', () => {
    let s = makeState({ hands: ['8H 6H', '8S 3H', '9H 9S'], discard: '7H', config: { eightStacking: true } });
    s = play(s, 0, '8H').state;
    expect(s.current).toBe(1);
    expect(take2LegalActions(s, 1).map((a) => a.type).sort()).toEqual(['play', 'takeSkip']);
    s = play(s, 1, '8S').state;
    expect(s.current).toBe(0); // seat 2 was skipped
  });
});

describe('Jack — change suit', () => {
  test('two-step: play then choose suit', () => {
    let s = makeState({ hands: ['JH 6H', '4C 3D', '9H 9S'], discard: '7H' });
    s = play(s, 0, 'JH').state;
    expect(s.phase).toBe('chooseSuit');
    expect(s.current).toBe(0);
    s = take2Apply(s, 0, { type: 'chooseSuit', suit: 'C' }, rng).state;
    expect(s.activeSuit).toBe('C');
    expect(s.current).toBe(1);
    expect(() => play(s, 1, '3D')).toThrow();
    expect(() => play(s, 1, '4C')).not.toThrow();
  });
  test('one-step with suit included', () => {
    const s = play(makeState({ hands: ['JH 6H', '4C 3D'], discard: '7H' }), 0, 'JH', 'D').state;
    expect(s.activeSuit).toBe('D');
    expect(s.current).toBe(1);
  });
  test('Jack is wild by default; not when disabled', () => {
    expect(() => play(makeState({ hands: ['JC 6D', '4C'], discard: '7H' }), 0, 'JC', 'C')).not.toThrow();
    expect(() => play(makeState({ hands: ['JC 6D', '4C'], discard: '7H', config: { jackWild: false } }), 0, 'JC', 'C')).toThrow();
  });
  test('reverse mode flips direction', () => {
    const s = play(makeState({ hands: ['JH 6H', '4H', '9H'], discard: '7H', config: { jackAction: 'reverse' } }), 0, 'JH').state;
    expect(s.direction).toBe(-1);
    expect(s.current).toBe(2);
  });
});

// ------------------------------------------------------------- drawing
describe('drawing', () => {
  test('draw one: unplayable card ends turn', () => {
    let s = makeState({ hands: ['5S', '4C'], discard: '7H', draw: '9D' });
    s = take2Apply(s, 0, { type: 'draw' }, rng).state;
    expect(s.players[0].hand.length).toBe(2);
    expect(s.current).toBe(1);
  });
  test('owner rule: picking up ends your turn, even if the card would fit', () => {
    const s = take2Apply(makeState({ hands: ['5S 9H', '4C'], discard: '7H', draw: '3H' }), 0, { type: 'draw' }, rng).state;
    expect(s.phase).toBe('play');
    expect(s.current).toBe(1);
    expect(s.players[0].hand.map((c) => c.id)).toContain('3H');
  });
  test('optional: playable drawn card may be played (only that card) or passed', () => {
    let s = makeState({ hands: ['5S 9H', '4C'], discard: '7H', draw: '3H', config: { playDrawnCard: true } });
    s = take2Apply(s, 0, { type: 'draw' }, rng).state;
    expect(s.phase).toBe('afterDraw');
    expect(() => play(s, 0, '9H')).toThrow();
    const after = play(s, 0, '3H').state;
    expect(after.current).toBe(1);
    const passed = take2Apply(s, 0, { type: 'pass' }, rng).state;
    expect(passed.current).toBe(1);
  });
  test('must-play rule forbids drawing with a playable card', () => {
    const s = makeState({ hands: ['5H', '4C'], discard: '7H', draw: '9D', config: { mustPlayIfAble: true } });
    expect(() => take2Apply(s, 0, { type: 'draw' }, rng)).toThrow();
  });
  test('draw until playable', () => {
    let s = makeState({ hands: ['5S', '4C'], discard: '7H', draw: '3H 9D 10C', config: { whenStuck: 'drawUntilPlayable', playDrawnCard: true } });
    s = take2Apply(s, 0, { type: 'draw' }, rng).state;
    expect(s.players[0].hand.map((c) => c.id).sort()).toEqual(['10C', '3H', '5S', '9D'].sort());
    expect(s.drawnCardId).toBe('3H');
  });
  test('empty draw pile reshuffles the discard except its top card', () => {
    let s = makeState({ hands: ['5S', '4C'], discard: '3D 9D 10C 7H', draw: '' });
    const r = take2Apply(s, 0, { type: 'draw' }, rng);
    s = r.state;
    expect(r.events.some((e) => e.type === 'reshuffled')).toBe(true);
    expect(s.discard.map((c) => c.id)).toEqual(['7H']);
    expect(s.players[0].hand.length + s.drawPile.length).toBe(4);
  });
});

// ------------------------------------------------- round end & elimination
describe('round end, scoring and knockout', () => {
  test('going out ends the round; others score their hands cumulatively', () => {
    let s = makeState({ hands: ['5H', 'JC 2D', 'KS 3S'], discard: '7H', totals: [10, 20, 30] });
    const r = play(s, 0, '5H');
    s = r.state;
    expect(s.phase).toBe('roundOver');
    expect(s.players.map((p) => p.total)).toEqual([10, 20 + 40, 30 + 13]);
    expect(s.history[0].wentOut).toBe(0);
    expect(s.players[0].roundsWon).toBe(1);
  });
  test('reaching exactly 100 eliminates', () => {
    const s = play(makeState({ hands: ['5H', 'QC', '3S'], discard: '7H', totals: [0, 90, 0] }), 0, '5H').state;
    expect(s.players[1].total).toBe(100);
    expect(s.players[1].eliminated).toBe(true);
    expect(s.players[2].eliminated).toBe(false);
  });
  test('exactly 100 survives when eliminateOnExact is off', () => {
    const s = play(makeState({ hands: ['5H', 'QC', '3S'], discard: '7H', totals: [0, 90, 0], config: { eliminateOnExact: false } }), 0, '5H').state;
    expect(s.players[1].eliminated).toBe(false);
  });
  test('last player standing wins the match', () => {
    const r = play(makeState({ hands: ['5H', 'QC 2C'], discard: '7H', totals: [50, 90] }), 0, '5H');
    expect(r.state.phase).toBe('matchOver');
    expect(r.state.winner).toBe(0);
    expect(r.events.some((e) => e.type === 'matchOver')).toBe(true);
  });
  test('single-hand mode: totals do not accumulate', () => {
    const s = play(makeState({ hands: ['5H', 'QC', '3S'], discard: '7H', totals: [0, 95, 0], config: { scoringMode: 'singleHand' } }), 0, '5H').state;
    expect(s.players[1].total).toBe(10);
    expect(s.players[1].eliminated).toBe(false);
  });
  test('going out on a 2 makes the next player draw before scoring (default)', () => {
    const s = play(makeState({ hands: ['2H', 'QC', '3S'], discard: '7H', draw: 'KD AD' }), 0, '2H').state;
    expect(s.players[1].hand.length).toBe(3);
    expect(s.history[0].lines.find((l) => l.seat === 1)!.score.total).toBe(10 + 10 + 1);
  });
  test('going out on a 2 with finishingActionApplies off', () => {
    const s = play(makeState({ hands: ['2H', 'QC', '3S'], discard: '7H', draw: 'KD AD', config: { finishingActionApplies: false } }), 0, '2H').state;
    expect(s.players[1].hand.length).toBe(1);
  });
  test('eliminated players are skipped in later rounds', () => {
    let s = play(makeState({ hands: ['5H', 'QC', '3S'], discard: '7H', totals: [0, 95, 0] }), 0, '5H').state;
    expect(s.players[1].eliminated).toBe(true);
    s = take2Apply(s, 0, { type: 'nextRound' }, rng).state;
    expect(s.players[1].hand.length).toBe(0);
    expect(s.round).toBe(2);
    // play passes over seat 1
    for (let i = 0; i < 10; i++) expect(s.current).not.toBe(1);
  });
  test('starting seat rotates each round', () => {
    let s = play(makeState({ hands: ['5H', 'QC', '3S'], discard: '7H' }), 0, '5H').state;
    s = take2Apply(s, 0, { type: 'nextRound' }, rng).state;
    expect(s.roundStarter).toBe(1);
  });
});

// ------------------------------------------------------------- privacy
describe('views hide private information', () => {
  test("a player's view contains only their own hand and no deck", () => {
    const { state } = take2Setup(undefined, seats(3), seededRng(3));
    const v = take2View(state, 1);
    const json = JSON.stringify(v);
    expect(v.hand.map((c) => c.id).sort()).toEqual(state.players[1].hand.map((c) => c.id).sort());
    for (const c of [...state.players[0].hand, ...state.players[2].hand, ...state.drawPile]) {
      expect(json.includes(`"id":"${c.id}"`)).toBe(false);
    }
    expect(v.players[0].cardCount).toBe(7);
  });
  test('spectator view has no hand at all', () => {
    const { state } = take2Setup(undefined, seats(3), seededRng(3));
    expect(take2View(state, 'spectator').hand).toEqual([]);
  });
});

describe('safeguards', () => {
  test('round turn limit ends an endless round; lowest hand is treated as going out', () => {
    let s = makeState({ hands: ['5S 9C', 'QC 4D', 'KD 3D'], discard: '7H', draw: 'AD AC', config: { roundTurnLimit: 2 } });
    s = take2Apply(s, 0, { type: 'draw' }, rng).state; // turn 1
    const r = take2Apply(s, 1, { type: 'draw' }, rng);  // turn 2 → limit
    expect(r.events.some((e) => e.type === 'turnLimit')).toBe(true);
    expect(r.state.phase).toBe('roundOver');
  });
});

describe('owner rules: last card and Jacks', () => {
  test('calling last card is recorded and public', () => {
    const r = take2Apply(makeState({ hands: ['5H 6H', '4C 3C'], discard: '7H' }), 0, { type: 'play', cardId: '5H', lastCard: true }, rng);
    expect(r.events.some((e) => e.type === 'lastCard' && e.seat === 0)).toBe(true);
    expect(take2View(r.state, 1).players[0].calledLastCard).toBe(true);
  });
  test('going out after calling ends the round', () => {
    let s = makeState({ hands: ['5H 6H', '4C 3C'], discard: '7H' });
    s = take2Apply(s, 0, { type: 'play', cardId: '5H', lastCard: true }, rng).state;
    s = take2Apply(s, 1, { type: 'draw' }, rng).state;
    s = take2Apply(s, 0, { type: 'play', cardId: '6H' }, rng).state;
    expect(s.phase).toBe('roundOver');
    expect(s.history[0].wentOut).toBe(0);
  });
  test("going out without calling doesn't count: pick up the penalty and play on", () => {
    let s = makeState({ hands: ['5H 6H', '4C 3C'], discard: '7H', draw: 'KD QD 9S 8S' });
    s = take2Apply(s, 0, { type: 'play', cardId: '5H' }, rng).state; // forgot to call
    s = take2Apply(s, 1, { type: 'draw' }, rng).state;
    const r = take2Apply(s, 0, { type: 'play', cardId: '6H' }, rng);
    expect(r.events.some((e) => e.type === 'missedLastCard')).toBe(true);
    expect(r.state.phase).toBe('play');
    expect(r.state.players[0].hand.length).toBe(2);
    expect(r.state.current).toBe(1);
  });
  test('drawing resets the call', () => {
    let s = makeState({ hands: ['5H 9S', '4C 3C'], discard: '7H', draw: 'KD QD 10D' });
    s = take2Apply(s, 0, { type: 'play', cardId: '5H', lastCard: true }, rng).state;
    s = take2Apply(s, 1, { type: 'draw' }, rng).state;
    s = take2Apply(s, 0, { type: 'draw' }, rng).state;
    expect(s.players[0].calledLastCard).toBe(false);
  });
  test("you can't finish on a Jack", () => {
    const s = makeState({ hands: ['JH', '4C 3C'], discard: '7H', draw: 'KD' });
    expect(() => play(s, 0, 'JH', 'C')).toThrow();
    expect(take2LegalActions(s, 0).map((a) => a.type)).toEqual(['draw']);
  });
  test('a Jack is fine when it is not your last card', () => {
    const s = play(makeState({ hands: ['JH 5S', '4C 3C'], discard: '7H' }), 0, 'JH', 'S').state;
    expect(s.activeSuit).toBe('S');
  });
  test('the rules can be switched off', () => {
    const s = makeState({ hands: ['JH', '4C 3C'], discard: '7H', config: { noFinishOnJack: false } });
    expect(play(s, 0, 'JH', 'C').state.phase).toBe('roundOver');
    const s2 = makeState({ hands: ['5H 6H', '4C'], discard: '7H', config: { lastCardCall: false } });
    let t = play(s2, 0, '5H').state;
    t = take2Apply(t, 1, { type: 'draw' }, rng).state;
    expect(play(t, 0, '6H').state.phase).toBe('roundOver');
  });
});
