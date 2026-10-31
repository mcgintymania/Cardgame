import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { IllegalActionError } from '../src/core/game.ts';
import {
  GinModule, GIN_PERSONALITIES, allMelds, bestArrangement, bestWithLayoffs, defaultGinConfig, ginAI,
  type GinConfig, type GinState,
} from '../src/gin/index.ts';
import { cards } from './helpers.ts';

const ids = (cs: { id: string }[]) => cs.map((c) => c.id).sort();

function makeState(h0: string, h1: string, opts: { discard?: string; stock?: string; current?: number; phase?: GinState['phase']; config?: Partial<GinConfig>; scores?: number[] } = {}): GinState {
  return {
    config: { ...defaultGinConfig(), ...(opts.config ?? {}) },
    players: [h0, h1].map((h, seat) => ({ seat, playerId: `p${seat}`, name: `P${seat}`, isAI: false, hand: cards(h), score: opts.scores?.[seat] ?? 0, handsWon: 0, pickups: [] })),
    stock: cards(opts.stock ?? '2C 3C 4C 5C 6C 7C 8C 9C 10C JC'),
    discard: cards(opts.discard ?? 'KD'),
    dealer: 1, current: opts.current ?? 0, phase: opts.phase ?? 'discard', offerPasses: 2, stockOnly: false,
    takenFromDiscard: null, lastDrawn: null, hand: 1, history: [], placements: null,
  };
}
const act = (s: GinState, seat: number, a: Parameters<typeof GinModule.apply>[2]) => GinModule.apply(s, seat, a, seededRng(1));

describe('Gin melds', () => {
  test('finds sets and runs, ace low only', () => {
    const ms = allMelds(cards('AS 2S 3S KS QS JS 7H 7D 7C'));
    const keys = ms.map((m) => m.kind + ':' + ids(m.cards).join(','));
    expect(keys).toContain('run:2S,3S,AS');
    expect(keys).toContain('run:JS,KS,QS');
    expect(keys).toContain('set:7C,7D,7H');
    // K-A-2 is not a run
    expect(keys.some((k) => k.includes('AS') && k.includes('KS'))).toBe(false);
  });

  test('chooses the arrangement with least deadwood when a card could go two ways', () => {
    const a = bestArrangement(cards('5H 6H 7H 7D 7C 7S KD'));
    // 7S 7D 7C set + 5H 6H 7H run leaves only KD
    expect(a.deadwoodValue).toBe(10);
    const b = bestArrangement(cards('5H 6H 7H 7D 7C 9S 9D'));
    // either the run (7D 7C 9S 9D = 32) or the set (5H 6H 9S 9D = 29): set wins
    expect(b.deadwoodValue).toBe(29);
  });

  test('picture cards are 10, ace is 1', () => {
    expect(bestArrangement(cards('KS QH JD AC')).deadwoodValue).toBe(31);
  });

  test('defender lays off onto runs at both ends and onto sets', () => {
    const knocker = bestArrangement(cards('5S 6S 7S 9H 9D 9C')).melds;
    const r = bestWithLayoffs(cards('4S 8S 9S KD'), knocker);
    // 4S and 8S extend the run, then 9S extends it further (9S could also go on the 9s)
    expect(ids(r.layoffs)).toEqual(['4S', '8S', '9S']);
    expect(r.deadwoodValue).toBe(10);
  });
});

describe('Gin turns', () => {
  test('upcard offer: non-dealer, then dealer; if both pass the non-dealer must draw from stock', () => {
    let { state } = GinModule.setup(defaultGinConfig(), [{ playerId: 'a', name: 'A', isAI: false }, { playerId: 'b', name: 'B', isAI: false }], seededRng(4));
    const nd = state.dealer === 0 ? 1 : 0;
    expect(state.phase).toBe('offer');
    expect(state.current).toBe(nd);
    expect(() => act(state, state.dealer, { type: 'passUpcard' })).toThrow(IllegalActionError);
    state = act(state, nd, { type: 'passUpcard' }).state;
    expect(state.current).toBe(state.dealer);
    state = act(state, state.dealer, { type: 'passUpcard' }).state;
    expect(state.phase).toBe('draw');
    expect(state.current).toBe(nd);
    expect(() => act(state, nd, { type: 'draw', source: 'discard' })).toThrow(/stock/);
    state = act(state, nd, { type: 'draw', source: 'stock' }).state;
    expect(state.players[nd].hand.length).toBe(11);
  });

  test("can't throw back the card you just picked up", () => {
    let s = makeState('2H 3H 4H 9S 9D KC QC JC 5D 6D', 'AS AD AC 2S 3S 4S 5S 6S 7S 8S', { phase: 'draw', discard: '9C' });
    s = act(s, 0, { type: 'draw', source: 'discard' }).state;
    expect(() => act(s, 0, { type: 'discard', cardId: '9C' })).toThrow(/picked up/);
    expect(() => act(s, 0, { type: 'discard', cardId: 'KC' })).not.toThrow();
  });

  test('knocking needs 10 or less deadwood', () => {
    // after discarding KC: 2-3-4H run, 9s set (9S 9D 9C), QC JC 5D 6D? deadwood = 10+10+5+6 = 31 → can't knock
    const s = makeState('2H 3H 4H 9S 9D 9C KC QC JC 5D 6D', 'AS AD AC 2S 3S 4S 5S 6S 7S 8S');
    expect(() => act(s, 0, { type: 'knock', cardId: 'KC' })).toThrow(/10 or less/);
  });

  test('knock: knocker scores the difference after lay-offs', () => {
    // knocker: 2-3-4H, 9S 9D 9C, 5D 6D 7D, deadwood AC KC → discard KC, deadwood 1
    const s = makeState('2H 3H 4H 9S 9D 9C 5D 6D 7D AC KC', '5H 6H 8D KS QS JS 10S 2D 3C 4C');
    const r = act(s, 0, { type: 'knock', cardId: 'KC' });
    const res = r.state.history[0];
    expect(res.end).toBe('knock');
    expect(res.knockerValue).toBe(1);
    // defender melds JS QS KS 10S; lays off 5H (onto 2-3-4H), 6H then too, 8D onto 5-6-7D; deadwood 2D 3C 4C = 9
    expect(ids(res.layoffs)).toEqual(['5H', '6H', '8D']);
    expect(res.defenderValue).toBe(9);
    expect(res.winner).toBe(0);
    expect(res.points).toBe(8);
    expect(r.state.players[0].score).toBe(8);
  });

  test('undercut: defender with equal or less deadwood gets the bonus', () => {
    const s = makeState('2H 3H 4H 9S 9D 9C 5D 6D 7D 8C KC', 'AS 2S 3S KS QS JS 10D 10H 10C AD');
    const res = act(s, 0, { type: 'knock', cardId: 'KC' }).state.history[0];
    expect(res.knockerValue).toBe(8);
    expect(res.defenderValue).toBe(1);
    expect(res.end).toBe('undercut');
    expect(res.winner).toBe(1);
    expect(res.points).toBe(25 + 7);
  });

  test('gin: 25 plus all the defender’s deadwood, no lay-offs', () => {
    const s = makeState('2H 3H 4H 9S 9D 9C 5D 6D 7D 8D KC', '5H 6H 10S 2C 3C 4S AH QD JD KH');
    const r = act(s, 0, { type: 'knock', cardId: 'KC' });
    const res = r.state.history[0];
    expect(res.end).toBe('gin');
    expect(res.layoffs).toEqual([]);
    expect(res.points).toBe(25 + res.defenderValue);
  });

  test('big gin: eleven melded cards straight after drawing', () => {
    const s = makeState('2H 3H 4H 9S 9D 9C 5D 6D 7D 8D 9H', 'AS AD AC 2S 3S 4S 5S 6S 7S KH');
    const res = act(s, 0, { type: 'bigGin' }).state.history[0];
    expect(res.end).toBe('bigGin');
    expect(res.points).toBe(31 + 10);
  });

  test('hand is void when the stock runs down to two cards', () => {
    const s = makeState('2H 3H 4H 9S 9D KC QC JC 5D 6D 8S', 'AS AD AC 2S 3S 4S 5S 6S 7S 8C', { stock: '2C 3C' });
    const r = act(s, 0, { type: 'discard', cardId: 'KC' });
    expect(r.state.history[0].end).toBe('draw');
    expect(r.state.phase).toBe('roundOver');
    expect(r.state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  test('reaching the target ends the match', () => {
    const s = makeState('2H 3H 4H 9S 9D 9C 5D 6D 7D 8D KC', '5H 6H 10S 2C 3C 4S AH QD JD KH', { scores: [90, 40] });
    const r = act(s, 0, { type: 'knock', cardId: 'KC' });
    expect(r.state.phase).toBe('matchOver');
    expect(r.state.placements).toEqual([0, 1]);
  });

  test("your view never contains the opponent's hand or the stock", () => {
    const { state } = GinModule.setup(defaultGinConfig(), [{ playerId: 'a', name: 'A', isAI: false }, { playerId: 'b', name: 'B', isAI: false }], seededRng(4));
    const v = JSON.stringify(GinModule.viewFor(state, 0));
    for (const c of [...state.players[1].hand, ...state.stock]) expect(v.includes(`"id":"${c.id}"`)).toBe(false);
  });
});

describe('Gin AI vs AI', () => {
  test('hundreds of matches finish, every AI action legal, every card accounted for', () => {
    const ps = Object.keys(GIN_PERSONALITIES);
    const wins: Record<string, number> = {};
    const ends: Record<string, number> = {};
    for (let seed = 1; seed <= 150; seed++) {
      const rng = seededRng(seed);
      const a = ps[seed % ps.length];
      const b = ps[(seed * 3 + 1) % ps.length];
      const seats = [{ playerId: 'a', name: 'A', isAI: true, personality: a }, { playerId: 'b', name: 'B', isAI: true, personality: b }];
      let { state } = GinModule.setup(GinModule.normalizeConfig({ target: seed % 2 ? 100 : 50, upcardOffer: seed % 5 !== 0 }), seats, rng);
      let guard = 0;
      while (state.phase !== 'matchOver') {
        if (guard++ > 20000) throw new Error('match did not finish');
        if (state.phase !== 'roundOver') {
          const all = [...state.stock, ...state.discard, ...state.players.flatMap((p) => p.hand)];
          expect(new Set(all.map((c) => c.id)).size).toBe(52);
          expect(all.length).toBe(52);
        }
        const seat = state.phase === 'roundOver' ? 0 : state.current;
        const action = ginAI(GinModule.viewFor(state, seat), seats[seat].personality, rng);
        const legal = GinModule.legalActions(state, seat).map((x) => JSON.stringify(x));
        expect(legal).toContain(JSON.stringify(action));
        state = GinModule.apply(state, seat, action, rng).state;
      }
      for (const h of state.history) ends[h.end] = (ends[h.end] ?? 0) + 1;
      const w = seats[state.placements![0]].personality!;
      if (a !== b) wins[w] = (wins[w] ?? 0) + 1;
      expect(state.players[state.placements![0]].score).toBeGreaterThanOrEqual(state.config.target);
    }
    console.log('gin wins', wins, 'hand endings', ends);
    expect((wins.expert ?? 0)).toBeGreaterThan(wins.beginner ?? 0);
  }, 120000);
});
