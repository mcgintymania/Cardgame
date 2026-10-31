import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { ONLINE, ONLINE_GAMES } from '../src/online/registry.ts';
import { rotateSeats } from '../src/online/rotate.ts';
import { betweenHands, forceMoves, nextHand, playAction, startMatch, type SeatSpec } from '../src/online/match.ts';

const SIZES = { take2: 4, poker: 5, draw: 4, hearts: 4, gin: 2, blackjack: 3 } as const;
const FAST: Record<string, unknown> = { poker: { startingStack: 200, smallBlind: 10, bigBlind: 20, blindsUpEvery: 2 }, draw: { startingStack: 200, smallBlind: 10, bigBlind: 20, blindsUpEvery: 2 } };

describe('seat rotation', () => {
  test('every seat sees itself at seat 0, and AI playing from rotated views never makes an illegal move', () => {
    for (const g of ONLINE_GAMES) {
      const { module, ai } = ONLINE[g];
      const n = SIZES[g];
      const rng = seededRng(11);
      let { state } = module.setup(module.normalizeConfig(FAST[g] ?? {}), Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, isAI: true })), rng);
      let moves = 0;
      while (!module.isFinished(state) && moves < 2500) {
        const acting: number[] = module.actingSeats(state);
        if (!acting.length) { state = module.apply(state, 0, module.timeoutAction(state, 0), rng).state; continue; }
        const seat = acting[0];
        const view = rotateSeats(module.viewFor(state, seat), seat, n) as any;
        expect(view.seat).toBe(0);
        if (Array.isArray(view.players)) expect(view.players[0].seat).toBe(0);
        const action = ai(view, 'expert', rng);
        state = module.apply(state, seat, action, rng).state; // throws if the rotated view misled the AI
        moves++;
      }
      expect(moves).toBeGreaterThan(5);
    }
  }, 120000);
  test('rotation leaves non-seat numbers alone and reorders per-seat lists', () => {
    const v = { seat: 2, current: 3, pot: 3, players: [{ seat: 0, stack: 10 }, { seat: 1, stack: 11 }, { seat: 2, stack: 12 }, { seat: 3, stack: 13 }], placements: [3, 2, 0, 1], payouts: { 2: 50, 3: 5 }, scoresAfter: [1, 2, 3, 4] };
    const r = rotateSeats(v, 2, 4) as any;
    expect(r.seat).toBe(0);
    expect(r.current).toBe(1);
    expect(r.pot).toBe(3);
    expect(r.players.map((p: any) => [p.seat, p.stack])).toEqual([[0, 12], [1, 13], [2, 10], [3, 11]]);
    expect(r.placements).toEqual([1, 0, 2, 3]);
    expect(r.payouts).toEqual({ 0: 50, 1: 5 });
    expect(r.scoresAfter).toEqual([3, 4, 1, 2]);
  });
});

describe('server match runner', () => {
  test('two people and AI members play a whole match of every game; placements cover every seat', () => {
    for (const g of ONLINE_GAMES) {
      const n = SIZES[g];
      const seats: SeatSpec[] = Array.from({ length: n }, (_, i) => (i < 2 ? { kind: 'human', userId: `u${i}`, name: `H${i}` } : { kind: 'ai', aiKey: `a${i}`, name: `A${i}`, personality: 'expert' }));
      const rng = seededRng(5);
      const { module, ai } = ONLINE[g];
      let p = startMatch(g, FAST[g] ?? {}, seats, rng);
      let guard = 0;
      while (!module.isFinished(p.state) && guard++ < 3000) {
        // state survives a trip through JSON, like the database
        p = { ...p, state: JSON.parse(JSON.stringify(p.state)), meta: JSON.parse(JSON.stringify(p.meta)) };
        if (betweenHands(g, p.state)) { p = nextHand(g, p.state, p.meta, rng); continue; }
        const acting: number[] = module.actingSeats(p.state);
        expect(acting.every((s) => seats[s].kind === 'human')).toBe(true); // AI turns are already done
        const seat = acting[0];
        if (guard % 7 === 0) { p = forceMoves(g, p.state, p.meta, [seat], rng); continue; } // sometimes a person times out
        p = playAction(g, p.state, p.meta, seat, ai(module.viewFor(p.state, seat), 'cautious', rng), rng);
      }
      expect(module.isFinished(p.state)).toBe(true);
      expect(p.meta.placements?.slice().sort()).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(p.meta.step).toBeGreaterThan(3);
    }
  }, 120000);
  test('a person cannot act for an AI seat or out of turn', () => {
    const seats: SeatSpec[] = [{ kind: 'human', userId: 'u0', name: 'H0' }, { kind: 'human', userId: 'u1', name: 'H1' }];
    const rng = seededRng(3);
    const p = startMatch('gin', {}, seats, rng);
    const acting = ONLINE.gin.module.actingSeats(p.state)[0];
    const other = acting === 0 ? 1 : 0;
    const legal = ONLINE.gin.module.legalActions(p.state, acting)[0];
    expect(() => playAction('gin', p.state, p.meta, other, legal, rng)).toThrow();
    const withAI: SeatSpec[] = [{ kind: 'human', userId: 'u0', name: 'H0' }, { kind: 'ai', aiKey: 'mags', name: 'Mags' }];
    const q = startMatch('gin', {}, withAI, rng);
    expect(() => playAction('gin', q.state, q.meta, 1, legal, rng)).toThrow();
  });
});
