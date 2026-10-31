// Runs an online match on the server: setup, a player's action, then every AI
// turn that follows, until it's a person's turn again (or the match ends).
// Pure and synchronous, so it can be tested without a database.

import { IllegalActionError, type SeatInfo } from '../core/game.ts';
import type { Rng } from '../core/rng.ts';
import { ONLINE, type OnlineGame } from './registry.ts';

export interface SeatSpec {
  kind: 'human' | 'ai';
  userId?: string;
  aiKey?: string;
  name: string;
  personality?: string;
}

export interface MatchMeta {
  game: OnlineGame;
  seats: SeatSpec[];
  /** Increases by one for every move (yours, a friend's or an AI member's). */
  step: number;
  /** Seats in the order they were knocked out. */
  out: number[];
  /** Best first, once the match is over. */
  placements: number[] | null;
  /** When the current turn began (for timeouts). */
  turnSince: number;
}

export interface Step { n: number; seat: number; events: unknown[] }
export interface Played { state: unknown; meta: MatchMeta; steps: Array<Step & { state: unknown }> }

const MAX_AI_STEPS = 400;

const humanSeatsActing = (game: OnlineGame, state: unknown, meta: MatchMeta) =>
  ONLINE[game].module.actingSeats(state).filter((s: number) => meta.seats[s]?.kind === 'human');

function record(meta: MatchMeta, seat: number, events: any[]) {
  for (const e of events) {
    if ((e.type === 'eliminated' || e.type === 'busted' || e.type === 'out') && typeof e.seat === 'number' && !meta.out.includes(e.seat)) meta.out.push(e.seat);
    if (e.type === 'matchOver') {
      const n = meta.seats.length;
      if (Array.isArray(e.placements)) meta.placements = e.placements.slice();
      else {
        const first = typeof e.winner === 'number' ? [e.winner] : [];
        const rest = [...meta.out].reverse().filter((s) => !first.includes(s));
        const others = Array.from({ length: n }, (_, i) => i).filter((s) => !first.includes(s) && !rest.includes(s));
        meta.placements = [...first, ...others, ...rest];
      }
    }
  }
  return { n: meta.step, seat, events };
}

/** Lets AI members take every turn that's theirs. */
function runAI(game: OnlineGame, state: unknown, meta: MatchMeta, rng: Rng, out: Played['steps']): unknown {
  const { module, ai } = ONLINE[game];
  for (let i = 0; i < MAX_AI_STEPS; i++) {
    if (module.isFinished(state)) break;
    const acting: number[] = module.actingSeats(state);
    const aiSeat = acting.find((s) => meta.seats[s]?.kind === 'ai');
    if (aiSeat === undefined) break;
    const view = module.viewFor(state, aiSeat);
    let action = ai(view, meta.seats[aiSeat].personality, rng);
    let res;
    try { res = module.apply(state, aiSeat, action, rng); } catch (e) {
      if (!(e instanceof IllegalActionError)) throw e;
      action = module.timeoutAction(state, aiSeat);
      res = module.apply(state, aiSeat, action, rng);
    }
    state = res.state;
    meta.step++;
    meta.turnSince = Date.now();
    out.push({ ...record(meta, aiSeat, res.events as any[]), state });
  }
  return state;
}

export function startMatch(game: OnlineGame, config: unknown, seats: SeatSpec[], rng: Rng): Played {
  const { module } = ONLINE[game];
  const info: SeatInfo[] = seats.map((s, i) => ({ playerId: s.userId ?? s.aiKey ?? `seat${i}`, name: s.name, isAI: s.kind === 'ai', personality: s.personality }));
  const cfg = module.normalizeConfig(config as never);
  const { state, events } = module.setup(cfg, info, rng);
  const meta: MatchMeta = { game, seats, step: 0, out: [], placements: null, turnSince: Date.now() };
  const steps: Played['steps'] = [{ ...record(meta, -1, events as any[]), state }];
  const after = runAI(game, state, meta, rng, steps);
  return { state: after, meta, steps };
}

/** A person's move. Throws IllegalActionError (with a readable message) if it isn't allowed. */
export function playAction(game: OnlineGame, state: unknown, meta0: MatchMeta, seat: number, action: unknown, rng: Rng): Played {
  const { module } = ONLINE[game];
  const meta: MatchMeta = { ...meta0, out: [...meta0.out] };
  if (meta.seats[seat]?.kind !== 'human') throw new IllegalActionError('That seat isn\'t yours.');
  if (module.isFinished(state)) throw new IllegalActionError('This game is over.');
  const res = module.apply(state, seat, action, rng);
  meta.step++;
  meta.turnSince = Date.now();
  const steps: Played['steps'] = [{ ...record(meta, seat, res.events as any[]), state: res.state }];
  const after = runAI(game, res.state, meta, rng, steps);
  return { state: after, meta, steps };
}

/** A person has run out of time (or left): play the safe default move for them. */
export function forceMoves(game: OnlineGame, state: unknown, meta0: MatchMeta, seats: number[], rng: Rng): Played {
  const { module } = ONLINE[game];
  const meta: MatchMeta = { ...meta0, out: [...meta0.out] };
  const steps: Played['steps'] = [];
  let s = state;
  for (const seat of seats) {
    if (module.isFinished(s) || !module.actingSeats(s).includes(seat)) continue;
    const res = module.apply(s, seat, module.timeoutAction(s, seat), rng);
    s = res.state;
    meta.step++;
    meta.turnSince = Date.now();
    steps.push({ ...record(meta, seat, res.events as any[]), state: s });
  }
  s = runAI(game, s, meta, rng, steps);
  return { state: s, meta, steps };
}

/** Between hands: deal the next one (any person at the table may ask). */
export function nextHand(game: OnlineGame, state: unknown, meta0: MatchMeta, rng: Rng): Played {
  const { module } = ONLINE[game];
  const meta: MatchMeta = { ...meta0, out: [...meta0.out] };
  const res = module.apply(state, 0, module.timeoutAction(state, 0), rng);
  meta.step++;
  meta.turnSince = Date.now();
  const steps: Played['steps'] = [{ ...record(meta, -1, res.events as any[]), state: res.state }];
  const after = runAI(game, res.state, meta, rng, steps);
  return { state: after, meta, steps };
}

/** Between hands nobody is "to act": anyone at the table may deal the next one. */
export function betweenHands(game: OnlineGame, state: unknown): boolean {
  const { module } = ONLINE[game];
  return !module.isFinished(state) && module.actingSeats(state).length === 0;
}

export { humanSeatsActing };
