// Texas Hold'em (no-limit) rules engine. Pure: apply() clones and never mutates input.

import { standardDeck } from '../core/cards.ts';
import { IllegalActionError, type ApplyResult, type GameModule, type SeatIndex, type SeatInfo } from '../core/game.ts';
import { shuffle, type Rng } from '../core/rng.ts';
import { describeHand, evaluate } from './evaluator.ts';
import { buildPots, splitPot } from './pots.ts';
import type {
  HandResult, PokerAction, PokerConfig, PokerEvent, PokerOptions, PokerPlayer, PokerState, PokerView, Street,
} from './types.ts';

export const POKER_MIN_PLAYERS = 2;
export const POKER_MAX_PLAYERS = 9;
/** Five cards each plus up to three each on the draw must fit in one deck. */
export const DRAW_MAX_PLAYERS = 6;

type Result = ApplyResult<PokerState, PokerEvent>;

export function defaultPokerConfig(): PokerConfig {
  return { smallBlind: 10, bigBlind: 20, startingStack: 1000, blindsUpEvery: 0, variant: 'holdem', maxDraw: 3 };
}

export function normalizePokerConfig(input?: Partial<PokerConfig>): PokerConfig {
  const d = defaultPokerConfig();
  const i = input ?? {};
  const int = (v: unknown, min: number, max: number, f: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : f;
    return Math.min(max, Math.max(min, n));
  };
  const bigBlind = int(i.bigBlind, 2, 100000, d.bigBlind);
  const smallBlind = int(i.smallBlind, 1, bigBlind, Math.floor(bigBlind / 2));
  return {
    bigBlind,
    smallBlind,
    startingStack: int(i.startingStack, bigBlind * 10, 10000000, Math.max(d.startingStack, bigBlind * 10)),
    blindsUpEvery: int(i.blindsUpEvery, 0, 100, d.blindsUpEvery),
    variant: i.variant === 'draw' ? 'draw' : 'holdem',
    maxDraw: int(i.maxDraw, 0, 5, 3),
  };
}

// ------------------------------------------------------------------ seats

const live = (s: PokerState) => s.players.filter((p) => !p.busted);
const inHand = (s: PokerState) => s.players.filter((p) => !p.busted && !p.folded);
const canAct = (s: PokerState) => inHand(s).filter((p) => !p.allIn);

function nextSeat(s: PokerState, from: SeatIndex, ok: (p: PokerPlayer) => boolean): SeatIndex {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (ok(s.players[i])) return i;
  }
  return -1;
}

function needsToAct(s: PokerState, p: PokerPlayer): boolean {
  return !p.busted && !p.folded && !p.allIn && (!p.hasActed || p.bet < s.currentBet);
}

function commit(p: PokerPlayer, amount: number): number {
  const a = Math.max(0, Math.min(amount, p.stack));
  p.stack -= a;
  p.bet += a;
  p.total += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

/** Collected pot plus every bet on the current street. */
export function totalPot(s: PokerState): number {
  return s.players.reduce((sum, p) => sum + p.total, 0);
}

// ------------------------------------------------------------- hand flow

function startHand(s: PokerState, rng: Rng, events: PokerEvent[], first: boolean): void {
  const cfg = s.config;
  if (!first) s.handNumber++;
  // Blind levels
  if (cfg.blindsUpEvery > 0 && s.handNumber > 1 && (s.handNumber - 1) % cfg.blindsUpEvery === 0) {
    s.level++;
    const bb = Math.ceil((s.bigBlind * 1.5) / 10) * 10 || s.bigBlind * 2;
    s.bigBlind = Math.max(bb, s.bigBlind + 2);
    s.smallBlind = Math.max(1, Math.floor(s.bigBlind / 2));
    events.push({ type: 'blindsUp', smallBlind: s.smallBlind, bigBlind: s.bigBlind });
  }
  for (const p of s.players) {
    p.hole = [];
    p.folded = p.busted;
    p.allIn = false;
    p.bet = 0;
    p.total = 0;
    p.hasActed = false;
    p.canRaise = true;
    p.lastAction = null;
    p.startStack = p.stack;
    p.drew = null;
  }
  if (!first) s.button = nextSeat(s, s.button, (p) => !p.busted);
  const heads = live(s).length === 2;
  s.sbSeat = heads ? s.button : nextSeat(s, s.button, (p) => !p.busted);
  s.bbSeat = nextSeat(s, s.sbSeat, (p) => !p.busted);
  s.board = [];
  s.deck = shuffle(standardDeck(), rng);
  s.muck = [];
  s.street = 'preflop';
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  // Deal two cards each (five in draw), one at a time, starting left of the button.
  const holeCount = isDraw(s) ? 5 : 2;
  for (let r = 0; r < holeCount; r++) {
    let seat = s.button;
    for (let k = 0; k < live(s).length; k++) {
      seat = nextSeat(s, seat, (p) => !p.busted);
      s.players[seat].hole.push(s.deck.pop()!);
    }
  }
  events.push({ type: 'handStarted', hand: s.handNumber, button: s.button, sbSeat: s.sbSeat, bbSeat: s.bbSeat, smallBlind: s.smallBlind, bigBlind: s.bigBlind });
  const sb = s.players[s.sbSeat];
  const bbp = s.players[s.bbSeat];
  const sbAmt = commit(sb, s.smallBlind);
  sb.lastAction = `SB ${sbAmt}`;
  events.push({ type: 'acted', seat: sb.seat, action: 'smallBlind', amount: sbAmt, to: sb.bet });
  const bbAmt = commit(bbp, s.bigBlind);
  bbp.lastAction = `BB ${bbAmt}`;
  events.push({ type: 'acted', seat: bbp.seat, action: 'bigBlind', amount: bbAmt, to: bbp.bet });
  s.currentBet = s.bigBlind;
  progress(s, s.bbSeat, rng, events);
}

/** After any action: end the betting round, or move to the next player who must act. */
function progress(s: PokerState, from: SeatIndex, rng: Rng, events: PokerEvent[]): void {
  if (inHand(s).length === 1) {
    finishUncontested(s, events);
    return;
  }
  const actors = canAct(s);
  const maxOther = (p: PokerPlayer) => Math.max(0, ...inHand(s).filter((o) => o !== p).map((o) => o.bet));
  const done = actors.length === 0
    || (actors.length === 1 && actors[0].bet >= maxOther(actors[0]) && (actors[0].hasActed || actors[0].bet >= s.currentBet))
    || actors.every((p) => p.hasActed && p.bet === s.currentBet);
  if (done) {
    endStreet(s, rng, events);
    return;
  }
  const next = nextSeat(s, from, (p) => needsToAct(s, p));
  s.current = next;
  events.push({ type: 'turn', seat: next });
}

function returnUncalled(s: PokerState, events: PokerEvent[]): void {
  const sorted = s.players.slice().sort((a, b) => b.total - a.total);
  const top = sorted[0];
  const second = sorted[1]?.total ?? 0;
  if (top && top.total > second) {
    const refund = top.total - second;
    top.total -= refund;
    top.bet = Math.max(0, top.bet - refund);
    top.stack += refund;
    if (top.stack > 0) top.allIn = false;
    events.push({ type: 'returned', seat: top.seat, amount: refund });
  }
}

const NEXT: Record<string, Street> = { preflop: 'flop', flop: 'turn', turn: 'river' };
export const isDraw = (s: { config: PokerConfig }) => s.config.variant === 'draw';

/** Five-Card Draw: next player (clockwise from the button) still to exchange cards. */
function nextDrawer(s: PokerState, from: SeatIndex): SeatIndex {
  return nextSeat(s, from, (p) => !p.busted && !p.folded && p.drew === null);
}

function startDraw(s: PokerState, events: PokerEvent[]): void {
  s.street = 'draw';
  for (const p of inHand(s)) { p.drew = null; if (!p.allIn) p.lastAction = null; }
  events.push({ type: 'street', street: 'draw', cards: [] });
  s.current = nextDrawer(s, s.button);
  events.push({ type: 'turn', seat: s.current });
}

function afterDraw(s: PokerState, rng: Rng, events: PokerEvent[], from: SeatIndex): void {
  const next = nextDrawer(s, from);
  if (next >= 0) {
    s.current = next;
    events.push({ type: 'turn', seat: next });
    return;
  }
  // Everyone has drawn: second betting round (or straight to showdown if nobody can bet).
  s.street = 'river';
  events.push({ type: 'street', street: 'river', cards: [] });
  if (canAct(s).length <= 1) {
    endStreet(s, rng, events);
    return;
  }
  const first = nextSeat(s, s.button, (p) => needsToAct(s, p));
  s.current = first;
  events.push({ type: 'turn', seat: first });
}

function endStreet(s: PokerState, rng: Rng, events: PokerEvent[]): void {
  returnUncalled(s, events);
  for (const p of s.players) {
    p.bet = 0;
    p.hasActed = false;
    p.canRaise = true;
  }
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  if (s.street === 'river') {
    showdown(s, events);
    return;
  }
  if (isDraw(s)) {
    startDraw(s, events);
    return;
  }
  // Deal the next street (burn one card first).
  const street = NEXT[s.street];
  s.deck.pop();
  const n = street === 'flop' ? 3 : 1;
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(s.deck.pop()!);
  s.board.push(...cards);
  s.street = street;
  for (const p of inHand(s)) if (!p.allIn) p.lastAction = null;
  events.push({ type: 'street', street, cards });
  if (canAct(s).length <= 1) {
    // Everyone (or all but one) is all-in: run the board out.
    endStreet(s, rng, events);
    return;
  }
  const first = nextSeat(s, s.button, (p) => needsToAct(s, p));
  s.current = first;
  events.push({ type: 'turn', seat: first });
}

function finishUncontested(s: PokerState, events: PokerEvent[]): void {
  returnUncalled(s, events);
  const w = inHand(s)[0];
  const amount = totalPot(s);
  w.stack += amount;
  w.handsWon++;
  const result: HandResult = {
    hand: s.handNumber, board: s.board.slice(), revealed: [], uncontested: true,
    pots: [{ amount, winners: [w.seat], hand: null, winningCards: [] }],
    payouts: { [w.seat]: amount },
  };
  events.push({ type: 'potAwarded', index: 0, amount, winners: [w.seat], hand: null });
  closeHand(s, result, events);
}

function showdown(s: PokerState, events: PokerEvent[]): void {
  const contenders = inHand(s);
  const values = new Map(contenders.map((p) => [p.seat, evaluate([...p.hole, ...s.board])]));
  const revealed = contenders.map((p) => ({ seat: p.seat, cards: p.hole.slice(), description: describeHand(values.get(p.seat)!) }));
  events.push({ type: 'showdown', revealed });
  const pots = buildPots(s.players.map((p) => ({ seat: p.seat, amount: p.total, folded: p.folded || p.busted })));
  const payouts: Record<number, number> = {};
  const potResults = pots.map((pot, index) => {
    const best = Math.max(...pot.eligible.map((seat) => values.get(seat)!.score));
    const winners = pot.eligible.filter((seat) => values.get(seat)!.score === best);
    const split = splitPot(pot.amount, winners, s.button, s.players.length);
    for (const [seat, amt] of split) {
      s.players[seat].stack += amt;
      payouts[seat] = (payouts[seat] ?? 0) + amt;
    }
    const v = values.get(winners[0])!;
    events.push({ type: 'potAwarded', index, amount: pot.amount, winners, hand: describeHand(v) });
    return { amount: pot.amount, winners, hand: describeHand(v), winningCards: v.cards };
  });
  for (const seat of Object.keys(payouts).map(Number)) s.players[seat].handsWon++;
  closeHand(s, { hand: s.handNumber, board: s.board.slice(), pots: potResults, revealed, payouts, uncontested: false }, events);
}

function closeHand(s: PokerState, result: HandResult, events: PokerEvent[]): void {
  for (const p of s.players) {
    p.bet = 0;
    p.total = 0;
  }
  s.lastHand = result;
  s.history.push(result);
  if (s.history.length > 30) s.history.shift();
  s.street = 'handOver';
  events.push({ type: 'handOver', result });
  // Knock out players with no chips. If several go out in the same hand, whoever started
  // the hand with more chips finishes higher.
  const busting = s.players.filter((p) => !p.busted && p.stack === 0).sort((a, b) => b.startStack - a.startStack);
  const remaining = live(s).length - busting.length;
  busting.forEach((p, i) => {
    p.busted = true;
    p.folded = true;
    p.place = remaining + 1 + i;
    events.push({ type: 'busted', seat: p.seat, place: p.place });
  });
  const left = live(s);
  if (left.length <= 1) {
    s.street = 'matchOver';
    s.winner = left[0]?.seat ?? null;
    if (left[0]) left[0].place = 1;
    if (s.winner !== null) events.push({ type: 'matchOver', winner: s.winner });
  }
}

// ---------------------------------------------------------------- options

export function pokerOptions(s: PokerState, seat: SeatIndex): PokerOptions | null {
  const p = s.players[seat];
  if (!p || s.street === 'handOver' || s.street === 'matchOver' || s.street === 'draw' || s.current !== seat || !needsToAct(s, p)) return null;
  const toCall = Math.min(s.currentBet - p.bet, p.stack);
  const maxRaiseTo = p.bet + p.stack;
  const othersCanRespond = canAct(s).some((o) => o.seat !== seat);
  const canRaise = p.canRaise && maxRaiseTo > s.currentBet && othersCanRespond;
  const minRaiseTo = Math.min(maxRaiseTo, s.currentBet === 0 ? s.bigBlind : s.currentBet + s.minRaise);
  return { toCall, canCheck: toCall === 0, canRaise, minRaiseTo, maxRaiseTo, isBet: s.currentBet === 0 };
}

export function pokerLegalActions(s: PokerState, seat: SeatIndex): PokerAction[] {
  if (s.street === 'matchOver') return [];
  if (s.street === 'handOver') return [{ type: 'nextHand' }];
  if (s.street === 'draw') return s.current === seat ? [{ type: 'draw', discard: [] }] : [];
  const o = pokerOptions(s, seat);
  if (!o) return [];
  const out: PokerAction[] = [];
  if (o.toCall > 0) out.push({ type: 'fold' });
  out.push(o.canCheck ? { type: 'check' } : { type: 'call' });
  if (o.canRaise) {
    out.push({ type: 'raise', to: o.minRaiseTo });
    if (o.maxRaiseTo > o.minRaiseTo) out.push({ type: 'allIn' });
  }
  return out;
}

// ------------------------------------------------------------------ apply

export function pokerSetup(cfgIn: Partial<PokerConfig> | undefined, seats: SeatInfo[], rng: Rng): Result {
  const config = normalizePokerConfig(cfgIn);
  if (seats.length < POKER_MIN_PLAYERS || seats.length > POKER_MAX_PLAYERS) {
    throw new IllegalActionError(`Hold'em needs ${POKER_MIN_PLAYERS}–${POKER_MAX_PLAYERS} players.`);
  }
  const players: PokerPlayer[] = seats.map((x, seat) => ({
    seat, playerId: x.playerId, name: x.name, isAI: x.isAI, personality: x.personality,
    stack: config.startingStack, hole: [], folded: false, allIn: false, bet: 0, total: 0,
    hasActed: false, canRaise: true, busted: false, place: null, lastAction: null, handsWon: 0, startStack: config.startingStack, drew: null,
  }));
  const max = config.variant === 'draw' ? DRAW_MAX_PLAYERS : POKER_MAX_PLAYERS;
  if (players.length > max) throw new IllegalActionError(`Five-Card Draw is for up to ${max} players.`);
  const s: PokerState = {
    config, players, deck: [], muck: [], board: [], button: rng.int(players.length), sbSeat: 0, bbSeat: 0,
    smallBlind: config.smallBlind, bigBlind: config.bigBlind, level: 1, street: 'preflop', current: 0,
    currentBet: 0, minRaise: config.bigBlind, handNumber: 1, lastHand: null, history: [], winner: null,
  };
  const events: PokerEvent[] = [];
  startHand(s, rng, events, true);
  return { state: s, events };
}

export function pokerApply(state: PokerState, seat: SeatIndex, action: PokerAction, rng: Rng): Result {
  const s: PokerState = structuredClone(state);
  const events: PokerEvent[] = [];
  if (s.street === 'matchOver') throw new IllegalActionError('The match is over.');
  if (action.type === 'nextHand') {
    if (s.street !== 'handOver') throw new IllegalActionError('The hand is still being played.');
    startHand(s, rng, events, false);
    return { state: s, events };
  }
  if (s.street === 'handOver') throw new IllegalActionError('Waiting for the next hand.');
  const p = s.players[seat];
  if (!p) throw new IllegalActionError('Unknown seat.');
  if (s.current !== seat) throw new IllegalActionError("It isn't your turn.");
  if (s.street === 'draw') {
    if (action.type !== 'draw') throw new IllegalActionError('Choose cards to exchange, or stand pat.');
    const ids = Array.isArray(action.discard) ? action.discard : [];
    const max = s.config.maxDraw ?? 3;
    if (new Set(ids).size !== ids.length) throw new IllegalActionError('Each card can only be thrown once.');
    if (ids.length > max) throw new IllegalActionError(`You can exchange at most ${max} cards.`);
    const out = ids.map((id) => p.hole.find((c) => c.id === id));
    if (out.some((c) => !c)) throw new IllegalActionError('You can only throw cards in your hand.');
    p.hole = p.hole.filter((c) => !ids.includes(c.id));
    for (let i = 0; i < ids.length; i++) {
      if (!s.deck.length) {
        // Rare with six players: shuffle earlier discards back in (never this player's own).
        s.deck = shuffle(s.muck, rng);
        s.muck = [];
      }
      p.hole.push(s.deck.pop()!);
    }
    s.muck.push(...(out as typeof p.hole));
    p.drew = ids.length;
    p.lastAction = ids.length === 0 ? 'Stands pat' : `Draws ${ids.length}`;
    events.push({ type: 'drew', seat, count: ids.length });
    afterDraw(s, rng, events, seat);
    return { state: s, events };
  }
  if (action.type === 'draw') throw new IllegalActionError("It isn't time to draw.");
  const o = pokerOptions(s, seat);
  if (!o) throw new IllegalActionError('You have nothing to do right now.');

  const raiseTo = (to: number, isAllIn: boolean) => {
    if (!o.canRaise) throw new IllegalActionError(o.toCall > 0 ? 'You can only call or fold here.' : 'You can only check here.');
    to = Math.floor(to);
    if (to >= o.maxRaiseTo) { to = o.maxRaiseTo; isAllIn = true; }
    if (to <= s.currentBet) throw new IllegalActionError('A raise must be more than the current bet.');
    if (to < o.minRaiseTo && !isAllIn) throw new IllegalActionError(`The minimum is ${o.minRaiseTo}.`);
    const wasBet = s.currentBet === 0;
    const raiseSize = to - s.currentBet;
    // A full raise (or any opening bet) reopens the betting. A short all-in raise doesn't.
    const reopens = wasBet || raiseSize >= s.minRaise;
    commit(p, to - p.bet);
    if (raiseSize >= s.minRaise) s.minRaise = raiseSize;
    for (const other of s.players) {
      if (other === p || other.folded || other.busted || other.allIn) continue;
      if (reopens) other.canRaise = true;
      else if (other.hasActed) other.canRaise = false; // incomplete raise doesn't reopen the betting
      other.hasActed = false;
    }
    s.currentBet = to;
    const kind = p.allIn ? 'allIn' : wasBet ? 'bet' : 'raise';
    p.lastAction = p.allIn ? `All in ${to}` : wasBet ? `Bet ${to}` : `Raise ${to}`;
    events.push({ type: 'acted', seat, action: kind, amount: to, to });
  };

  switch (action.type) {
    case 'fold':
      p.folded = true;
      p.lastAction = 'Fold';
      events.push({ type: 'acted', seat, action: 'fold', amount: 0, to: p.bet });
      break;
    case 'check':
      if (!o.canCheck) throw new IllegalActionError(`You need to call ${o.toCall} or fold.`);
      p.lastAction = 'Check';
      events.push({ type: 'acted', seat, action: 'check', amount: 0, to: p.bet });
      break;
    case 'call': {
      if (o.canCheck) throw new IllegalActionError('Nothing to call. Check instead.');
      const amt = commit(p, o.toCall);
      p.lastAction = p.allIn ? `All in ${p.bet}` : `Call ${amt}`;
      events.push({ type: 'acted', seat, action: p.allIn ? 'allIn' : 'call', amount: amt, to: p.bet });
      break;
    }
    case 'raise':
      raiseTo(action.to, false);
      break;
    case 'allIn':
      if (o.maxRaiseTo <= s.currentBet || !o.canRaise) {
        // All-in that doesn't raise (or can't): it's a call.
        if (o.canCheck) throw new IllegalActionError('Nothing to call.');
        const amt = commit(p, o.toCall);
        p.lastAction = `All in ${p.bet}`;
        events.push({ type: 'acted', seat, action: 'allIn', amount: amt, to: p.bet });
      } else raiseTo(o.maxRaiseTo, true);
      break;
    default:
      throw new IllegalActionError('Unknown action.');
  }
  p.hasActed = true;
  progress(s, seat, rng, events);
  return { state: s, events };
}

export function pokerView(s: PokerState, seat: SeatIndex | 'spectator'): PokerView {
  const me = seat === 'spectator' ? null : s.players[seat];
  const shown = new Map<number, typeof s.players[number]['hole']>();
  if ((s.street === 'handOver' || s.street === 'matchOver') && s.lastHand) {
    for (const r of s.lastHand.revealed) shown.set(r.seat, r.cards);
  }
  const collected = s.players.reduce((sum, p) => sum + p.total - p.bet, 0);
  return {
    seat: me ? me.seat : null,
    config: s.config,
    handNumber: s.handNumber,
    level: s.level,
    smallBlind: s.smallBlind,
    bigBlind: s.bigBlind,
    street: s.street,
    button: s.button,
    sbSeat: s.sbSeat,
    bbSeat: s.bbSeat,
    current: s.current,
    currentBet: s.currentBet,
    board: s.board.slice(),
    pot: collected,
    totalPot: totalPot(s),
    players: s.players.map((p) => ({
      seat: p.seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality,
      stack: p.stack, bet: p.bet, folded: p.folded, allIn: p.allIn, busted: p.busted, place: p.place,
      inHand: !p.busted && !p.folded && p.hole.length > 0, lastAction: p.lastAction, handsWon: p.handsWon,
      shown: shown.get(p.seat)?.slice() ?? null, drew: p.drew,
    })),
    hole: me ? me.hole.slice() : [],
    options: me ? pokerOptions(s, me.seat) : null,
    legal: me ? pokerLegalActions(s, me.seat) : [],
    lastHand: s.lastHand,
    history: s.history.slice(-15),
    winner: s.winner,
  };
}

export function pokerTimeoutAction(s: PokerState, seat: SeatIndex): PokerAction {
  if (s.street === 'handOver') return { type: 'nextHand' };
  if (s.street === 'draw') return { type: 'draw', discard: [] };
  const o = pokerOptions(s, seat);
  return o?.canCheck ? { type: 'check' } : { type: 'fold' };
}

export const PokerModule: GameModule<PokerConfig, PokerState, PokerAction, PokerView, PokerEvent> = {
  id: 'poker',
  name: "Texas Hold'em",
  minPlayers: POKER_MIN_PLAYERS,
  maxPlayers: POKER_MAX_PLAYERS,
  defaultConfig: defaultPokerConfig,
  normalizeConfig: normalizePokerConfig,
  setup: pokerSetup,
  actingSeats: (s) => (s.street === 'handOver' || s.street === 'matchOver' ? [] : [s.current]),
  legalActions: pokerLegalActions,
  apply: pokerApply,
  viewFor: pokerView,
  timeoutAction: pokerTimeoutAction,
  isFinished: (s) => s.street === 'matchOver',
};

/** Five-Card Draw: the same engine with five cards each and one draw. */
export const DrawModule: GameModule<PokerConfig, PokerState, PokerAction, PokerView, PokerEvent> = {
  ...PokerModule,
  id: 'draw',
  name: 'Five-Card Draw',
  maxPlayers: DRAW_MAX_PLAYERS,
  defaultConfig: () => ({ ...defaultPokerConfig(), variant: 'draw' }),
  normalizeConfig: (c) => normalizePokerConfig({ ...(c ?? {}), variant: 'draw' }),
  setup: (c, seats, rng) => pokerSetup({ ...c, variant: 'draw' }, seats, rng),
};
