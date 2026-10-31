// Plays thousands of full AI-vs-AI matches under many rule combinations and checks
// invariants after every single action. Catches rule bugs no hand-written test thinks of.

import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { IllegalActionError } from '../src/core/game.ts';
import { take2ChooseAction, TAKE2_PERSONALITIES } from '../src/take2/ai.ts';
import { take2Apply, take2LegalActions, take2Setup, take2View } from '../src/take2/engine.ts';
import type { Take2Config } from '../src/take2/config.ts';
import type { Take2State } from '../src/take2/types.ts';

const personalities = Object.keys(TAKE2_PERSONALITIES);

function checkInvariants(s: Take2State) {
  const all = [...s.drawPile, ...s.discard, ...s.players.flatMap((p) => p.hand)];
  expect(all.length).toBe(52);
  expect(new Set(all.map((c) => c.id)).size).toBe(52);
  expect(s.discard.length).toBeGreaterThan(0);
  for (const p of s.players) expect(p.total).toBeGreaterThanOrEqual(0);
  if (s.phase !== 'matchOver' && s.phase !== 'roundOver') expect(s.players[s.current].eliminated).toBe(false);
}

function runMatch(seed: number, nPlayers: number, config: Partial<Take2Config>) {
  const rng = seededRng(seed);
  const seats = Array.from({ length: nPlayers }, (_, i) => ({
    playerId: `ai${i}`, name: `AI ${i}`, isAI: true, personality: personalities[(i + seed) % personalities.length],
  }));
  let { state } = take2Setup(config, seats, rng);
  let actions = 0;
  while (state.phase !== 'matchOver') {
    checkInvariants(state);
    let seat = state.current;
    if (state.phase === 'roundOver') seat = state.players.findIndex((p) => !p.eliminated);
    const view = take2View(state, seat);
    const action = take2ChooseAction(view, seats[seat].personality, rng);
    // AI must always choose something the engine lists as legal
    const key = (a: { type: string; cardId?: string; suit?: string }) => `${a.type}:${a.cardId ?? ''}`;
    const legal = take2LegalActions(state, seat).map(key);
    expect(legal).toContain(key(action as never));
    try {
      state = take2Apply(state, seat, action, rng).state;
    } catch (e) {
      if (e instanceof IllegalActionError) throw new Error(`AI made illegal move ${JSON.stringify(action)}: ${e.message}`);
      throw e;
    }
    actions++;
    if (actions > 20000) throw new Error('Match did not finish');
  }
  checkInvariants(state);
  expect(state.winner).not.toBeNull();
  expect(state.players.filter((p) => !p.eliminated).length).toBe(1);
  return { rounds: state.round, actions };
}

const variants: Array<[string, Partial<Take2Config>]> = [
  ['defaults', {}],
  ['strict', { matchRule: 'suitOnly', mustPlayIfAble: true, jackWild: false }],
  ['no stacking, 8 stacking', { twoStacking: false, eightStacking: true }],
  ['draw until playable', { whenStuck: 'drawUntilPlayable', penaltyEndsTurn: false, playDrawnCard: true }],
  ['no last-card or jack rules', { lastCardCall: false, noFinishOnJack: false, playDrawnCard: true }],
  ['reverse jacks', { jackAction: 'reverse' }],
  ['single hand scoring', { scoringMode: 'singleHand', eliminationAt: 30 }],
  ['big hands', { handSize: 10, flipActionOnStart: 'ignore' }],
];

describe('full AI matches', () => {
  for (const [name, cfg] of variants) {
    test(`${name}: 2–6 players finish legally`, () => {
      let rounds = 0;
      for (let seed = 1; seed <= 25; seed++) {
        const r = runMatch(seed * 31 + name.length, 2 + (seed % 5), cfg);
        rounds += r.rounds;
      }
      expect(rounds).toBeGreaterThan(25);
    });
  }
});
