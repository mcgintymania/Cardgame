// Take 2 rules engine. Pure functions: every apply() clones the state first and
// never mutates its input, so the same code is safe on a server and in tests.

import { standardDeck, SUITS, type Card, type Suit } from '../core/cards.ts';
import { IllegalActionError, type ApplyResult, type GameModule, type SeatIndex, type SeatInfo } from '../core/game.ts';
import { shuffle, type Rng } from '../core/rng.ts';
import { defaultTake2Config, normalizeTake2Config, type Take2Config } from './config.ts';
import { scoreHand } from './scoring.ts';
import type {
  RoundResult, RoundScoreLine, Take2Action, Take2Event, Take2Player, Take2State, Take2View,
} from './types.ts';

export const TAKE2_MIN_PLAYERS = 2;
export const TAKE2_MAX_PLAYERS = 6;

type Result = ApplyResult<Take2State, Take2Event>;

// ---------------------------------------------------------------- helpers

export function topCard(s: Take2State): Card {
  return s.discard[s.discard.length - 1];
}

export function activeSeats(s: Take2State): SeatIndex[] {
  return s.players.filter((p) => !p.eliminated).map((p) => p.seat);
}

function nextSeat(s: Take2State, from: SeatIndex, dir: 1 | -1 = s.direction): SeatIndex {
  const n = s.players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!s.players[i].eliminated) return i;
  }
  return from;
}

function isActionCard(c: Card, cfg: Take2Config): boolean {
  return c.rank === 2 || (c.rank === 8 && cfg.eightSkips) || (c.rank === 11 && cfg.jackAction !== 'none');
}

/** Can this card legally be played right now (ignoring whose turn it is)? */
export function canPlayCard(s: Take2State, c: Card): boolean {
  const cfg = s.config;
  if (s.pending?.kind === 'draw') return cfg.twoStacking && c.rank === 2;
  if (s.pending?.kind === 'skip') return cfg.eightStacking && c.rank === 8;
  if (c.rank === 11 && cfg.jackWild) return true;
  if (c.suit === s.activeSuit) return true;
  if (cfg.matchRule === 'suitOrRank' && c.rank === topCard(s).rank) return true;
  return false;
}

/** Card rules plus hand-dependent rules (e.g. you can't finish on a Jack). */
export function canPlayFrom(s: Take2State, seat: SeatIndex, c: Card): boolean {
  if (!canPlayCard(s, c)) return false;
  const hand = s.players[seat].hand;
  if (s.config.noFinishOnJack && c.rank === 11 && hand.length === 1) return false;
  return true;
}

function playableCards(s: Take2State, seat: SeatIndex): Card[] {
  return s.players[seat].hand.filter((c) => canPlayFrom(s, seat, c));
}

/** Draw up to n cards, reshuffling the discard pile (minus its top card) when needed. */
function drawCards(s: Take2State, seat: SeatIndex, n: number, rng: Rng, events: Take2Event[]): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (s.drawPile.length === 0) {
      if (s.discard.length <= 1) break;
      const top = s.discard.pop()!;
      s.drawPile = shuffle(s.discard, rng);
      s.discard = [top];
      events.push({ type: 'reshuffled', count: s.drawPile.length });
    }
    const c = s.drawPile.pop()!;
    s.players[seat].hand.push(c);
    if (s.players[seat].hand.length > 1) s.players[seat].calledLastCard = false;
    drawn.push(c);
  }
  return drawn;
}

function lowestHandSeat(s: Take2State): SeatIndex {
  let best = activeSeats(s)[0];
  let bestScore = Infinity;
  for (const seat of activeSeats(s)) {
    const v = scoreHand(s.players[seat].hand, s.config.scoring).total;
    if (v < bestScore) {
      bestScore = v;
      best = seat;
    }
  }
  return best;
}

function canEverDraw(s: Take2State): boolean {
  return s.drawPile.length > 0 || s.discard.length > 1;
}

// ------------------------------------------------------------ turn flow

/** Move play to the next seat and resolve anything that happens automatically on arrival. */
function advance(s: Take2State, events: Take2Event[]): void {
  s.roundTurns++;
  // Safeguard (not a house rule): a round that drags on forever ends, and the
  // player holding the lowest penalty is treated as having gone out.
  if (s.config.roundTurnLimit > 0 && s.roundTurns >= s.config.roundTurnLimit) {
    events.push({ type: 'turnLimit' });
    endRound(s, lowestHandSeat(s), events);
    return;
  }
  s.current = nextSeat(s, s.current);
  s.phase = 'play';
  s.drawnCardId = null;
  s.turnCount++;
  enterTurn(s, events);
}

function enterTurn(s: Take2State, events: Take2Event[]): void {
  // A pending skip with no possible counter is applied automatically.
  // Guard against loops: at most one automatic skip per arrival chain per player.
  for (let guard = 0; guard < s.players.length + 1; guard++) {
    if (s.pending?.kind !== 'skip') break;
    const canCounter = s.config.eightStacking && playableCards(s, s.current).length > 0;
    if (canCounter) break;
    events.push({ type: 'skipped', seat: s.current });
    s.pending = null;
    s.current = nextSeat(s, s.current);
    s.turnCount++;
  }
  events.push({ type: 'turn', seat: s.current });
}

function dealRound(s: Take2State, starter: SeatIndex, rng: Rng, events: Take2Event[]): void {
  let deck = shuffle(standardDeck(), rng);
  for (const p of s.players) {
    p.hand = [];
    p.calledLastCard = false;
  }
  const seats = activeSeats(s);
  // Never deal more than the deck allows (keeps one card for the discard pile).
  const handSize = Math.min(s.config.handSize, Math.floor(51 / seats.length));
  for (let r = 0; r < handSize; r++) {
    for (const seat of seats) s.players[seat].hand.push(deck.pop()!);
  }
  // Flip the first discard. With 'reflip', action cards go back under the pile.
  let first = deck.pop()!;
  if (s.config.flipActionOnStart === 'reflip') {
    for (let guard = 0; guard < 52 && isActionCard(first, s.config); guard++) {
      deck = [first, ...deck];
      first = deck.pop()!;
    }
  }
  s.drawPile = deck;
  s.discard = [first];
  s.activeSuit = first.suit;
  s.direction = 1;
  s.pending = null;
  s.drawnCardId = null;
  s.stall = 0;
  s.roundTurns = 0;
  s.roundStarter = starter;
  s.current = starter;
  s.phase = 'play';
  events.push({ type: 'dealt', round: s.round, starter, topCard: first });
  events.push({ type: 'turn', seat: starter });
}

function endRound(s: Take2State, wentOut: SeatIndex | null, events: Take2Event[]): void {
  const cfg = s.config;
  const lines: RoundScoreLine[] = [];
  for (const seat of activeSeats(s)) {
    const p = s.players[seat];
    const score = seat === wentOut ? { base: 0, twos: 0, multiplier: 1, total: 0 } : scoreHand(p.hand, cfg.scoring);
    const before = p.total;
    const after = cfg.scoringMode === 'cumulative' ? before + score.total : score.total;
    const out = cfg.eliminateOnExact ? after >= cfg.eliminationAt : after > cfg.eliminationAt;
    lines.push({ seat, hand: p.hand.slice(), score, before, after, eliminated: out });
  }
  // Safety net: someone must survive. If everyone would be knocked out (only possible
  // when a round stalls), the lowest total(s) survive.
  if (lines.every((l) => l.eliminated)) {
    const low = Math.min(...lines.map((l) => l.after));
    for (const l of lines) if (l.after === low) l.eliminated = false;
  }
  for (const l of lines) {
    const p = s.players[l.seat];
    p.total = l.after;
    if (l.eliminated) {
      p.eliminated = true;
      p.eliminatedInRound = s.round;
    }
  }
  if (wentOut !== null) s.players[wentOut].roundsWon++;
  const result: RoundResult = { round: s.round, wentOut, lines };
  s.history.push(result);
  s.pending = null;
  s.drawnCardId = null;
  events.push({ type: 'roundOver', result });
  for (const l of lines) if (l.eliminated) events.push({ type: 'eliminated', seat: l.seat, total: l.after });

  const remaining = activeSeats(s);
  if (remaining.length <= 1) {
    s.phase = 'matchOver';
    s.winner = remaining[0] ?? null;
    if (s.winner !== null) events.push({ type: 'matchOver', winner: s.winner });
  } else {
    s.phase = 'roundOver';
  }
}

/** Ends a stalled round (nobody can play and nothing left to draw). */
function checkStall(s: Take2State, events: Take2Event[]): boolean {
  const limit = activeSeats(s).length * 2;
  if (!canEverDraw(s) && s.stall >= limit) {
    endRound(s, null, events);
    return true;
  }
  return false;
}

// ------------------------------------------------------------- actions

function doPlay(s: Take2State, seat: SeatIndex, cardId: string, suit: Suit | undefined, lastCard: boolean, rng: Rng, events: Take2Event[]): void {
  const p = s.players[seat];
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new IllegalActionError('That card is not in your hand.');
  const card = p.hand[idx];
  if (s.phase === 'afterDraw' && s.drawnCardId !== cardId) {
    throw new IllegalActionError('After drawing you may only play the card you drew.');
  }
  if (!canPlayCard(s, card)) throw new IllegalActionError('That card cannot be played now.');
  if (!canPlayFrom(s, seat, card)) throw new IllegalActionError("You can't finish on a Jack.");
  if (suit !== undefined && !SUITS.includes(suit)) throw new IllegalActionError('Unknown suit.');

  p.hand.splice(idx, 1);
  s.discard.push(card);
  s.activeSuit = card.suit;
  s.drawnCardId = null;
  s.stall = 0;
  events.push({ type: 'played', seat, card });
  const cfg = s.config;

  // --- announcing "last card"
  if (p.hand.length === 1) {
    p.calledLastCard = cfg.lastCardCall ? lastCard : false;
    if (p.calledLastCard) events.push({ type: 'lastCard', seat });
  }

  // --- went out without announcing: it doesn't count, pick up instead
  let missedCall = false;
  if (p.hand.length === 0 && cfg.lastCardCall && !p.calledLastCard) {
    missedCall = true;
    events.push({ type: 'missedLastCard', seat, penalty: cfg.lastCardPenalty });
    const got = drawCards(s, seat, cfg.lastCardPenalty, rng, events);
    events.push({ type: 'drew', seat, count: got.length, reason: 'missedCall' });
  }

  // --- the player went out
  if (p.hand.length === 0 && !missedCall) {
    events.push({ type: 'wentOut', seat });
    if (card.rank === 2 && cfg.finishingActionApplies) {
      const amount = (s.pending?.kind === 'draw' ? s.pending.amount : 0) + cfg.twoDrawAmount;
      const target = nextSeat(s, seat);
      const got = drawCards(s, target, amount, rng, events);
      events.push({ type: 'drew', seat: target, count: got.length, reason: 'finishing' });
    }
    endRound(s, seat, events);
    return;
  }

  // --- action effects (independent of penalty scoring)
  if (card.rank === 2) {
    const stacked = s.pending?.kind === 'draw';
    const amount = (stacked && s.pending?.kind === 'draw' ? s.pending.amount : 0) + cfg.twoDrawAmount;
    s.pending = { kind: 'draw', amount };
    events.push({ type: 'penaltyPending', target: nextSeat(s, seat), amount, stacked });
  } else if (card.rank === 8 && cfg.eightSkips) {
    if (s.pending?.kind === 'skip') events.push({ type: 'skipPassed', from: seat });
    s.pending = { kind: 'skip' };
  } else if (card.rank === 11) {
    if (cfg.jackAction === 'changeSuit') {
      if (suit === undefined) {
        s.phase = 'chooseSuit';
        return; // same player picks a suit next
      }
      s.activeSuit = suit;
      events.push({ type: 'suitChosen', seat, suit });
    } else if (cfg.jackAction === 'reverse') {
      s.direction = s.direction === 1 ? -1 : 1;
      events.push({ type: 'reversed', direction: s.direction });
    }
  }
  advance(s, events);
}

function doDraw(s: Take2State, seat: SeatIndex, rng: Rng, events: Take2Event[]): void {
  if (s.pending) throw new IllegalActionError('You must deal with the pending penalty first.');
  if (s.config.mustPlayIfAble && playableCards(s, seat).length > 0) {
    throw new IllegalActionError('House rules: you must play a card if you can.');
  }
  const max = s.config.whenStuck === 'drawUntilPlayable' ? 60 : 1;
  let lastPlayable: Card | null = null;
  let count = 0;
  for (let i = 0; i < max; i++) {
    const got = drawCards(s, seat, 1, rng, events);
    if (got.length === 0) break;
    count++;
    if (canPlayFrom(s, seat, got[0])) {
      lastPlayable = got[0];
      break;
    }
  }
  events.push({ type: 'drew', seat, count, reason: 'stuck' });
  if (lastPlayable && s.config.playDrawnCard) {
    s.phase = 'afterDraw';
    s.drawnCardId = lastPlayable.id;
    s.stall = 0;
    return;
  }
  // Picking up ends your turn (owner's rule) unless playDrawnCard is switched on.
  if (count === 0) s.stall++;
  else s.stall = 0;
  if (checkStall(s, events)) return;
  events.push({ type: 'passed', seat });
  advance(s, events);
}

function doTakePenalty(s: Take2State, seat: SeatIndex, rng: Rng, events: Take2Event[]): void {
  if (s.pending?.kind !== 'draw') throw new IllegalActionError('There is no penalty to take.');
  const got = drawCards(s, seat, s.pending.amount, rng, events);
  events.push({ type: 'drew', seat, count: got.length, reason: 'penalty' });
  s.pending = null;
  if (s.config.penaltyEndsTurn) advance(s, events);
  else s.phase = 'play';
}

// ------------------------------------------------------------- public API

export function take2Setup(configIn: Partial<Take2Config> | undefined, seats: SeatInfo[], rng: Rng): Result {
  const config = normalizeTake2Config(configIn);
  if (seats.length < TAKE2_MIN_PLAYERS || seats.length > TAKE2_MAX_PLAYERS) {
    throw new IllegalActionError(`Take 2 needs ${TAKE2_MIN_PLAYERS}–${TAKE2_MAX_PLAYERS} players.`);
  }
  const players: Take2Player[] = seats.map((s, seat) => ({
    seat, playerId: s.playerId, name: s.name, isAI: s.isAI, personality: s.personality,
    hand: [], total: 0, eliminated: false, eliminatedInRound: null, roundsWon: 0, calledLastCard: false,
  }));
  const s: Take2State = {
    config, players, drawPile: [], discard: [], activeSuit: 'S', direction: 1, current: 0,
    phase: 'play', pending: null, drawnCardId: null, round: 1, roundStarter: 0, stall: 0,
    roundTurns: 0, turnCount: 0, history: [], winner: null,
  };
  const events: Take2Event[] = [];
  dealRound(s, rng.int(players.length), rng, events);
  return { state: s, events };
}

export function take2LegalActions(s: Take2State, seat: SeatIndex): Take2Action[] {
  if (s.phase === 'matchOver') return [];
  if (s.phase === 'roundOver') return [{ type: 'nextRound' }];
  if (seat !== s.current || s.players[seat]?.eliminated) return [];
  if (s.phase === 'chooseSuit') return SUITS.map((suit) => ({ type: 'chooseSuit', suit }));
  const plays = playableCards(s, seat);
  if (s.phase === 'afterDraw') {
    const drawn = plays.filter((c) => c.id === s.drawnCardId);
    return [...drawn.map((c) => ({ type: 'play', cardId: c.id }) as Take2Action), { type: 'pass' }];
  }
  const out: Take2Action[] = plays.map((c) => ({ type: 'play', cardId: c.id }));
  if (s.pending?.kind === 'draw') out.push({ type: 'takePenalty' });
  else if (s.pending?.kind === 'skip') out.push({ type: 'takeSkip' });
  else if (!(s.config.mustPlayIfAble && plays.length > 0)) out.push({ type: 'draw' });
  return out;
}

export function take2Apply(state: Take2State, seat: SeatIndex, action: Take2Action, rng: Rng): Result {
  const s: Take2State = structuredClone(state);
  const events: Take2Event[] = [];
  const p = s.players[seat];
  if (!p) throw new IllegalActionError('Unknown seat.');
  if (s.phase === 'matchOver') throw new IllegalActionError('The match is over.');

  if (action.type === 'nextRound') {
    if (s.phase !== 'roundOver') throw new IllegalActionError('The round is still in progress.');
    s.round++;
    dealRound(s, nextSeat(s, s.roundStarter, 1), rng, events);
    return { state: s, events };
  }

  if (s.phase === 'roundOver') throw new IllegalActionError('Waiting for the next round.');
  if (seat !== s.current) throw new IllegalActionError("It isn't your turn.");
  if (p.eliminated) throw new IllegalActionError('You have been knocked out.');

  switch (action.type) {
    case 'play':
      if (s.phase !== 'play' && s.phase !== 'afterDraw') throw new IllegalActionError('Choose a suit first.');
      doPlay(s, seat, action.cardId, action.suit, action.lastCard === true, rng, events);
      break;
    case 'chooseSuit':
      if (s.phase !== 'chooseSuit') throw new IllegalActionError('No suit to choose.');
      if (!SUITS.includes(action.suit)) throw new IllegalActionError('Unknown suit.');
      s.activeSuit = action.suit;
      events.push({ type: 'suitChosen', seat, suit: action.suit });
      advance(s, events);
      break;
    case 'draw':
      if (s.phase !== 'play') throw new IllegalActionError('You cannot draw now.');
      doDraw(s, seat, rng, events);
      break;
    case 'pass':
      if (s.phase !== 'afterDraw') throw new IllegalActionError('You can only pass after drawing.');
      events.push({ type: 'passed', seat });
      advance(s, events);
      break;
    case 'takePenalty':
      if (s.phase !== 'play') throw new IllegalActionError('Not now.');
      doTakePenalty(s, seat, rng, events);
      break;
    case 'takeSkip':
      if (s.pending?.kind !== 'skip') throw new IllegalActionError('There is no skip to take.');
      events.push({ type: 'skipped', seat });
      s.pending = null;
      advance(s, events);
      break;
    default:
      throw new IllegalActionError('Unknown action.');
  }
  return { state: s, events };
}

export function take2View(s: Take2State, seat: SeatIndex | 'spectator'): Take2View {
  const me = seat === 'spectator' ? null : s.players[seat];
  const legal = me ? take2LegalActions(s, me.seat) : [];
  return {
    seat: me ? me.seat : null,
    config: s.config,
    round: s.round,
    phase: s.phase,
    current: s.current,
    direction: s.direction,
    activeSuit: s.activeSuit,
    topCard: topCard(s),
    discardCount: s.discard.length,
    drawCount: s.drawPile.length,
    pending: s.pending,
    players: s.players.map((p) => ({
      seat: p.seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality,
      cardCount: p.hand.length, total: p.total, eliminated: p.eliminated, roundsWon: p.roundsWon,
      calledLastCard: p.calledLastCard && p.hand.length === 1,
    })),
    hand: me ? me.hand.slice() : [],
    handScore: me ? scoreHand(me.hand, s.config.scoring) : null,
    drawnCardId: me && me.seat === s.current ? s.drawnCardId : null,
    legal,
    playableIds: legal.filter((a) => a.type === 'play').map((a) => (a as { cardId: string }).cardId),
    history: s.history,
    winner: s.winner,
    recentDiscards: s.discard.slice(-12),
  };
}

export function take2TimeoutAction(s: Take2State, seat: SeatIndex): Take2Action {
  if (s.phase === 'roundOver') return { type: 'nextRound' };
  if (s.phase === 'chooseSuit') {
    const counts = new Map<Suit, number>();
    for (const c of s.players[seat].hand) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
    const best = [...SUITS].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
    return { type: 'chooseSuit', suit: best };
  }
  if (s.phase === 'afterDraw') return { type: 'pass' };
  if (s.pending?.kind === 'draw') return { type: 'takePenalty' };
  if (s.pending?.kind === 'skip') return { type: 'takeSkip' };
  const legal = take2LegalActions(s, seat);
  return legal.find((a) => a.type === 'draw') ?? legal[0];
}

export const Take2Module: GameModule<Take2Config, Take2State, Take2Action, Take2View, Take2Event> = {
  id: 'take2',
  name: 'Take 2',
  minPlayers: TAKE2_MIN_PLAYERS,
  maxPlayers: TAKE2_MAX_PLAYERS,
  defaultConfig: defaultTake2Config,
  normalizeConfig: normalizeTake2Config,
  setup: take2Setup,
  actingSeats: (s) => (s.phase === 'matchOver' || s.phase === 'roundOver' ? [] : [s.current]),
  legalActions: take2LegalActions,
  apply: take2Apply,
  viewFor: take2View,
  timeoutAction: take2TimeoutAction,
  isFinished: (s) => s.phase === 'matchOver',
};
