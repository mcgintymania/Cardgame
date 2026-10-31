import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { IllegalActionError } from '../src/core/game.ts';
import {
  HeartsModule, HEARTS_PERSONALITIES, defaultHeartsConfig, heartsAI, passTarget, playableCards, trickWinner,
  type HeartsConfig, type HeartsState, type Trick,
} from '../src/hearts/index.ts';
import { cards } from './helpers.ts';

const seats4 = (ai = false) => Array.from({ length: 4 }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, isAI: ai, personality: ai ? Object.keys(HEARTS_PERSONALITIES)[i % 5] : undefined }));

function makeState(hands: string[], opts: { tricks?: Trick[]; current?: number; broken?: boolean; scores?: number[]; config?: Partial<HeartsConfig> } = {}): HeartsState {
  return {
    config: { ...defaultHeartsConfig(), ...(opts.config ?? {}) },
    players: hands.map((h, seat) => ({ seat, playerId: `p${seat}`, name: `P${seat}`, isAI: false, hand: cards(h), score: opts.scores?.[seat] ?? 0, handPoints: 0, passing: null, received: [], moons: 0 })),
    phase: 'play', hand: 1, passDir: 'left', current: opts.current ?? 0, heartsBroken: opts.broken ?? false,
    tricks: opts.tricks ?? [], history: [], placements: null,
  };
}
const trick = (leader: number, spec: string, winner: number | null = null): Trick => {
  const cs = cards(spec);
  return { leader, plays: cs.map((card, i) => ({ seat: (leader + i) % 4, card })), winner, points: 0 };
};
const play = (s: HeartsState, seat: number, id: string) => HeartsModule.apply(s, seat, { type: 'play', cardId: id }, seededRng(1));

describe('Hearts setup and passing', () => {
  test('deals 13 each and starts with a pass to the left', () => {
    const { state } = HeartsModule.setup(defaultHeartsConfig(), seats4(), seededRng(3));
    expect(state.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13]);
    expect(state.phase).toBe('pass');
    expect(state.passDir).toBe('left');
    expect(HeartsModule.actingSeats(state)).toEqual([0, 1, 2, 3]);
  });

  test('pass rotation is left, right, across, hold', () => {
    expect(passTarget(0, 'left')).toBe(1);
    expect(passTarget(0, 'right')).toBe(3);
    expect(passTarget(0, 'across')).toBe(2);
    expect(passTarget(0, 'none')).toBe(0);
  });

  test('passed cards arrive with the right player and the 2♣ holder leads', () => {
    let { state } = HeartsModule.setup(defaultHeartsConfig(), seats4(), seededRng(9));
    const passed = state.players.map((p) => p.hand.slice(0, 3).map((c) => c.id));
    for (let i = 0; i < 4; i++) state = HeartsModule.apply(state, i, { type: 'pass', cardIds: passed[i] }, seededRng(1)).state;
    expect(state.phase).toBe('play');
    for (let i = 0; i < 4; i++) {
      const to = state.players[(i + 1) % 4];
      expect(to.received.map((c) => c.id).sort()).toEqual(passed[i].slice().sort());
      for (const id of passed[i]) expect(to.hand.some((c) => c.id === id)).toBe(true);
      expect(state.players[i].hand.length).toBe(13);
    }
    expect(state.players[state.current].hand.some((c) => c.id === '2C')).toBe(true);
  });

  test('passing needs three distinct cards from your hand, once', () => {
    const { state } = HeartsModule.setup(defaultHeartsConfig(), seats4(), seededRng(9));
    const h = state.players[0].hand;
    expect(() => HeartsModule.apply(state, 0, { type: 'pass', cardIds: [h[0].id, h[1].id] }, seededRng(1))).toThrow(IllegalActionError);
    expect(() => HeartsModule.apply(state, 0, { type: 'pass', cardIds: [h[0].id, h[0].id, h[1].id] }, seededRng(1))).toThrow(IllegalActionError);
    const other = state.players[1].hand[0].id;
    expect(() => HeartsModule.apply(state, 0, { type: 'pass', cardIds: [h[0].id, h[1].id, other] }, seededRng(1))).toThrow(IllegalActionError);
    const s2 = HeartsModule.apply(state, 0, { type: 'pass', cardIds: [h[0].id, h[1].id, h[2].id] }, seededRng(1)).state;
    expect(() => HeartsModule.apply(s2, 0, { type: 'pass', cardIds: [h[3].id, h[4].id, h[5].id] }, seededRng(1))).toThrow(IllegalActionError);
  });

  test('other players never see your hand or your pass', () => {
    let { state } = HeartsModule.setup(defaultHeartsConfig(), seats4(), seededRng(9));
    state = HeartsModule.apply(state, 0, { type: 'pass', cardIds: state.players[0].hand.slice(0, 3).map((c) => c.id) }, seededRng(1)).state;
    const v = HeartsModule.viewFor(state, 1);
    const json = JSON.stringify(v);
    for (const c of [...state.players[0].hand, ...state.players[0].passing!]) {
      if (!state.players[1].hand.some((x) => x.id === c.id)) expect(json.includes(`"id":"${c.id}"`)).toBe(false);
    }
    expect(v.players[0].hasPassed).toBe(true);
  });
});

describe('Hearts play rules', () => {
  test('2♣ must lead the first trick', () => {
    const s = makeState(['2C 5C AH', '3C 4D 5H', '4C 6D 6H', 'QS 7D 7H']);
    expect(playableCards(s.players[0].hand, [], false, s.config).map((c) => c.id)).toEqual(['2C']);
    expect(() => play(s, 0, 'AH')).toThrow(/2♣/);
  });

  test('must follow suit', () => {
    const s = makeState(['2C 5C AH', '3C 4D 5H', '4C 6D 6H', 'QS 7D 7H'], { current: 1, tricks: [trick(0, '2C')] });
    expect(() => play(s, 1, '4D')).toThrow(/follow suit/);
    expect(() => play(s, 1, '3C')).not.toThrow();
  });

  test('no hearts or Q♠ on the first trick unless that is all you hold', () => {
    const s = makeState(['2C 5C AH', '3C 4D 5H', '4C 6D 6H', 'QS 7D 7H'], { current: 3, tricks: [trick(0, '2C 3C 4C')] });
    expect(playableCards(s.players[3].hand, s.tricks, false, s.config).map((c) => c.id)).toEqual(['7D']);
    const only = makeState(['2C', '3C', '4C', 'QS 7H'], { current: 3, tricks: [trick(0, '2C 3C 4C')] });
    expect(playableCards(only.players[3].hand, only.tricks, false, only.config).map((c) => c.id).sort()).toEqual(['7H', 'QS']);
  });

  test("hearts can't be led until broken, unless you only have hearts", () => {
    const done = trick(0, '2C 3C 4C 5C', 3);
    const s = makeState(['AH 9D', 'KH 9S', 'QH 8S', '5H 7D'], { current: 3, tricks: [done] });
    expect(() => play(s, 3, '5H')).toThrow(/broken/);
    expect(() => play(s, 3, '7D')).not.toThrow();
    const onlyHearts = makeState(['AH 9D', 'KH 9S', 'QH 8S', '5H 6H'], { current: 3, tricks: [done] });
    expect(() => play(onlyHearts, 3, '5H')).not.toThrow();
    const broken = makeState(['AH 9D', 'KH 9S', 'QH 8S', '5H 7D'], { current: 3, tricks: [done], broken: true });
    expect(() => play(broken, 3, '5H')).not.toThrow();
  });

  test('highest card of the led suit wins; aces are high', () => {
    expect(trickWinner(trick(0, '5D AH KD 3D'))).toBe(2);
    expect(trickWinner(trick(1, '5D AD KD 3D'))).toBe(2);
  });

  test('trick points go to the winner, who leads next; sloughing a heart breaks hearts', () => {
    const done = trick(0, '2C 3C 4C 5C', 3);
    let s = makeState(['9D 2S', 'KD 3S', '5H 4S', 'QS 7D'], { current: 3, tricks: [done] });
    s = play(s, 3, '7D').state;
    s = play(s, 0, '9D').state;
    s = play(s, 1, 'KD').state;
    const r = play(s, 2, '5H');
    expect(r.state.heartsBroken).toBe(true);
    expect(r.state.players[1].handPoints).toBe(1);
    expect(r.state.current).toBe(1);
    expect(r.events.some((e) => e.type === 'trickWon' && e.seat === 1 && e.points === 1)).toBe(true);
  });

  test("you can't play out of turn", () => {
    const s = makeState(['2C 5C', '3C 4D', '4C 6D', 'QS 7D']);
    expect(() => play(s, 1, '3C')).toThrow(/turn/);
  });
});

function playOut(s: HeartsState): HeartsState {
  let st = s;
  let guard = 0;
  while (st.phase === 'play' && guard++ < 60) {
    const a = HeartsModule.timeoutAction(st, st.current);
    st = HeartsModule.apply(st, st.current, a, seededRng(2)).state;
  }
  return st;
}

describe('Hearts scoring', () => {
  test('queen is 13, each heart 1, and the totals add up to 26', () => {
    const { state } = HeartsModule.setup(defaultHeartsConfig(), seats4(), seededRng(77));
    let s = state;
    for (let i = 0; i < 4; i++) s = HeartsModule.apply(s, i, HeartsModule.timeoutAction(s, i), seededRng(1)).state;
    s = playOut(s);
    expect(['roundOver', 'matchOver']).toContain(s.phase);
    const r = s.history[0];
    const sum = r.lines.reduce((a, l) => a + l.scored, 0);
    expect(sum).toBe(r.moon === null ? 26 : 78);
  });

  test('shooting the moon gives everyone else 26', () => {
    const st = makeState(['', '', '', ''], { current: 0 });
    // Fake 13 completed tricks all won by seat 1 containing every heart and Q♠
    const deck = 'AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H QS AC KC QC JC AD KD QD JD AS KS JS 10S 2C 3C 4C 5C 6C 7C 8C 9C 10C 2D 3D 4D 5D 6D 7D 8D 9D 10D 2S 3S 4S 5S 6S 7S 8S 9S'.split(' ');
    const tricks: Trick[] = [];
    for (let t = 0; t < 12; t++) tricks.push({ ...trick(1, deck.slice(t * 4, t * 4 + 4).join(' '), 1) });
    tricks.push(trick(1, deck.slice(48, 51).join(' ')));
    st.tricks = tricks;
    st.current = 0;
    st.players[0].hand = cards(deck[51]);
    st.heartsBroken = true;
    const r = HeartsModule.apply(st, 0, { type: 'play', cardId: deck[51] }, seededRng(1));
    const res = r.state.history[0];
    expect(res.moon).toBe(1);
    expect(res.lines.map((l) => l.scored)).toEqual([26, 0, 26, 26]);
    expect(r.events.some((e) => e.type === 'moon')).toBe(true);
  });

  test('match ends when someone reaches the target, lowest wins; a tie for lowest plays on', () => {
    const deck = 'AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H QS AC KC QC JC AD KD QD JD AS KS JS 10S 2C 3C 4C 5C 6C 7C 8C 9C 10C 2D 3D 4D 5D 6D 7D 8D 9D 10D 2S 3S 4S 5S 6S 7S 8S 9S'.split(' ');
    const build = (scores: number[], winners: number[]) => {
      const st = makeState(['', '', '', ''], { scores, broken: true });
      const tricks: Trick[] = [];
      for (let t = 0; t < 12; t++) tricks.push(trick(winners[t], deck.slice(t * 4, t * 4 + 4).join(' '), winners[t]));
      tricks.push(trick(1, deck.slice(48, 51).join(' ')));
      st.tricks = tricks;
      st.players[0].hand = cards(deck[51]);
      st.current = 0;
      return st;
    };
    // Hearts split: seat 2 takes trick 0-2 (12 hearts), seat 3 takes trick 3 (1 heart + QS = 14)
    const winners = [2, 2, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0];
    const end = HeartsModule.apply(build([100, 10, 20, 30], winners), 0, { type: 'play', cardId: deck[51] }, seededRng(1));
    expect(end.state.phase).toBe('matchOver');
    expect(end.state.placements).toEqual([1, 2, 3, 0]);
    // tie for lowest: 1 and 0 both on 10, someone over target -> play on
    const tie = HeartsModule.apply(build([90, 10, 20, 10], [2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 0, { type: 'play', cardId: deck[51] }, seededRng(1));
    expect(tie.state.players.map((p) => p.score)).toEqual([104, 10, 32, 10]);
    expect(tie.state.phase).toBe('roundOver');
  });
});

describe('Hearts AI vs AI', () => {
  test('hundreds of full matches finish with every action legal and every card accounted for', () => {
    const personalities = Object.keys(HEARTS_PERSONALITIES);
    let matches = 0;
    let moons = 0;
    const wins: Record<string, number> = {};
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seededRng(seed);
      const seats = Array.from({ length: 4 }, (_, i) => ({ playerId: `ai${i}`, name: `AI${i}`, isAI: true, personality: personalities[(i + seed) % personalities.length] }));
      const cfg = HeartsModule.normalizeConfig({ endAt: seed % 3 === 0 ? 50 : 100, jackOfDiamonds: seed % 4 === 0, moon: seed % 5 === 0 ? 'subtractFromSelf' : 'addToOthers', passing: seed % 7 !== 0 });
      let { state } = HeartsModule.setup(cfg, seats, rng);
      let guard = 0;
      while (state.phase !== 'matchOver') {
        if (guard++ > 5000) throw new Error('match did not finish');
        // every card accounted for
        const inHands = state.players.flatMap((p) => [...p.hand, ...(p.passing ?? [])]);
        const played = state.tricks.flatMap((t) => t.plays.map((x) => x.card));
        if (state.phase !== 'roundOver') expect(new Set([...inHands, ...played].map((c) => c.id)).size).toBe(52);
        const acting = state.phase === 'roundOver' ? [0] : HeartsModule.actingSeats(state);
        const seat = acting[0];
        const action = heartsAI(HeartsModule.viewFor(state, seat), seats[seat].personality, rng);
        if (action.type === 'play') expect(HeartsModule.legalActions(state, seat).map((a) => (a as { cardId: string }).cardId)).toContain(action.cardId);
        state = HeartsModule.apply(state, seat, action, rng).state;
      }
      matches++;
      moons += state.history.filter((h) => h.moon !== null).length;
      const winner = seats[state.placements![0]].personality!;
      wins[winner] = (wins[winner] ?? 0) + 1;
      // scores are consistent with history
      for (const p of state.players) expect(p.score).toBe(state.history.reduce((a, h) => a + h.lines[p.seat].scored, 0));
    }
    expect(matches).toBe(200);
    // the expert should beat the beginner over many matches
    expect(wins.expert ?? 0).toBeGreaterThan(wins.beginner ?? 0);
    console.log('hearts wins by personality', wins, 'moons', moons);
  }, 60000);
});
