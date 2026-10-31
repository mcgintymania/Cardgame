// Hearts engine. Pure functions: every apply() returns a new state.

import { standardDeck, type Card } from '../core/cards.ts';
import { IllegalActionError, type ApplyResult, type GameModule, type SeatIndex, type SeatInfo } from '../core/game.ts';
import { shuffle, type Rng } from '../core/rng.ts';
import {
  defaultHeartsConfig, normalizeHeartsConfig,
  type HandResult, type HeartsAction, type HeartsConfig, type HeartsEvent, type HeartsState, type HeartsView, type PassDir, type Trick,
} from './types.ts';

export const NUM_SEATS = 4;
const PASS_CYCLE: PassDir[] = ['left', 'right', 'across', 'none'];

/** Ace is high in Hearts. */
export const power = (c: Card) => (c.rank === 1 ? 14 : c.rank);
export const isQueenOfSpades = (c: Card) => c.suit === 'S' && c.rank === 12;
export const isJackOfDiamonds = (c: Card) => c.suit === 'D' && c.rank === 11;

export function cardPoints(c: Card, config: HeartsConfig): number {
  if (c.suit === 'H') return 1;
  if (isQueenOfSpades(c)) return 13;
  if (config.jackOfDiamonds && isJackOfDiamonds(c)) return -10;
  return 0;
}
/** Points counted towards shooting the moon (hearts and Q♠ only). */
const moonPoints = (c: Card) => (c.suit === 'H' ? 1 : isQueenOfSpades(c) ? 13 : 0);

const SUIT_ORDER = { C: 0, D: 1, S: 2, H: 3 } as const;
export function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || power(a) - power(b));
}

export function passTarget(seat: SeatIndex, dir: PassDir): SeatIndex {
  const off = dir === 'left' ? 1 : dir === 'across' ? 2 : dir === 'right' ? 3 : 0;
  return (seat + off) % NUM_SEATS;
}

const clone = (s: HeartsState): HeartsState => JSON.parse(JSON.stringify(s));

export function passDirFor(hand: number, config: HeartsConfig): PassDir {
  return config.passing ? PASS_CYCLE[(hand - 1) % 4] : 'none';
}

function holderOfTwoClubs(s: HeartsState): SeatIndex {
  return s.players.findIndex((p) => p.hand.some((c) => c.suit === 'C' && c.rank === 2));
}

function deal(s: HeartsState, rng: Rng, events: HeartsEvent[]) {
  const deck = shuffle(standardDeck(), rng);
  s.players.forEach((p, i) => {
    p.hand = sortHand(deck.slice(i * 13, i * 13 + 13));
    p.handPoints = 0;
    p.passing = null;
    p.received = [];
  });
  s.tricks = [];
  s.heartsBroken = false;
  s.passDir = passDirFor(s.hand, s.config);
  events.push({ type: 'dealt', hand: s.hand, passDir: s.passDir });
  if (s.passDir === 'none') startPlay(s, events);
  else s.phase = 'pass';
}

function startPlay(s: HeartsState, events: HeartsEvent[]) {
  s.phase = 'play';
  s.current = holderOfTwoClubs(s);
  events.push({ type: 'turn', seat: s.current });
}

/** The trick being played now, or null if the next play leads a new trick. */
export function openTrick(tricks: Trick[]): Trick | null {
  const t = tricks[tricks.length - 1];
  return t && t.plays.length < NUM_SEATS ? t : null;
}

/** Cards this hand may play right now. Shared by the engine, the view and the AI. */
export function playableCards(hand: Card[], tricks: Trick[], heartsBroken: boolean, config: HeartsConfig): Card[] {
  const open = openTrick(tricks);
  const firstTrick = tricks.length === 0 || (tricks.length === 1 && open !== null);
  if (!open || open.plays.length === 0) {
    // Leading
    if (firstTrick) {
      const two = hand.find((c) => c.suit === 'C' && c.rank === 2);
      return two ? [two] : hand; // (only happens in tests with partial hands)
    }
    if (heartsBroken) return hand;
    const nonHearts = hand.filter((c) => c.suit !== 'H');
    return nonHearts.length ? nonHearts : hand;
  }
  const led = open.plays[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  if (follow.length) return follow;
  if (firstTrick && config.noPointsFirstTrick) {
    const safe = hand.filter((c) => c.suit !== 'H' && !isQueenOfSpades(c));
    if (safe.length) return safe;
  }
  return hand;
}

export function trickWinner(t: Trick): SeatIndex {
  const led = t.plays[0].card.suit;
  let best = t.plays[0];
  for (const p of t.plays) if (p.card.suit === led && power(p.card) > power(best.card)) best = p;
  return best.seat;
}

function scoreHand(s: HeartsState, events: HeartsEvent[]) {
  const taken = s.players.map(() => [] as Card[]);
  for (const t of s.tricks) taken[t.winner!].push(...t.plays.map((p) => p.card));
  const moonRaw = taken.map((cs) => cs.reduce((a, c) => a + moonPoints(c), 0));
  const shooter = moonRaw.findIndex((n) => n === 26);
  const result: HandResult = { hand: s.hand, lines: [], moon: shooter >= 0 ? shooter : null };
  s.players.forEach((p, i) => {
    const raw = taken[i].reduce((a, c) => a + cardPoints(c, s.config), 0);
    let scored = raw;
    if (shooter >= 0) {
      const jack = s.config.jackOfDiamonds && taken[i].some(isJackOfDiamonds) ? -10 : 0;
      if (s.config.moon === 'addToOthers') scored = (i === shooter ? 0 : 26) + jack;
      else scored = (i === shooter ? -26 : 0) + jack;
    }
    const before = p.score;
    p.score += scored;
    result.lines.push({ seat: i, taken: raw, scored, before, after: p.score });
  });
  if (shooter >= 0) {
    s.players[shooter].moons++;
    events.push({ type: 'moon', seat: shooter });
  }
  s.history.push(result);
  events.push({ type: 'roundOver', result });

  const top = Math.max(...s.players.map((p) => p.score));
  const low = Math.min(...s.players.map((p) => p.score));
  const leaders = s.players.filter((p) => p.score === low).length;
  if (top >= s.config.endAt && leaders === 1) {
    const order = s.players.map((p) => p.seat).sort((a, b) => s.players[a].score - s.players[b].score || a - b);
    s.placements = order;
    s.phase = 'matchOver';
    events.push({ type: 'matchOver', placements: order });
  } else {
    // A tie for the lowest score means another hand is played.
    s.phase = 'roundOver';
  }
}

function setup(config: HeartsConfig, seats: SeatInfo[], rng: Rng): ApplyResult<HeartsState, HeartsEvent> {
  if (seats.length !== NUM_SEATS) throw new Error('Hearts needs exactly 4 players.');
  const s: HeartsState = {
    config,
    players: seats.map((p, seat) => ({
      seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality,
      hand: [], score: 0, handPoints: 0, passing: null, received: [], moons: 0,
    })),
    phase: 'pass', hand: 1, passDir: 'left', current: 0, heartsBroken: false, tricks: [], history: [], placements: null,
  };
  const events: HeartsEvent[] = [];
  deal(s, rng, events);
  return { state: s, events };
}

function apply(state: HeartsState, seat: SeatIndex, action: HeartsAction, rng: Rng): ApplyResult<HeartsState, HeartsEvent> {
  const s = clone(state);
  const events: HeartsEvent[] = [];
  const me = s.players[seat];
  if (!me) throw new IllegalActionError('No such seat.');

  if (action.type === 'nextRound') {
    if (s.phase !== 'roundOver') throw new IllegalActionError('The hand is still being played.');
    s.hand++;
    deal(s, rng, events);
    return { state: s, events };
  }
  if (s.phase === 'matchOver') throw new IllegalActionError('The match is over.');
  if (s.phase === 'roundOver') throw new IllegalActionError('Waiting for the next hand.');

  if (action.type === 'pass') {
    if (s.phase !== 'pass') throw new IllegalActionError('It is not time to pass.');
    if (me.passing) throw new IllegalActionError('You have already passed.');
    const ids = Array.isArray(action.cardIds) ? action.cardIds : [];
    if (ids.length !== 3 || new Set(ids).size !== 3) throw new IllegalActionError('Choose exactly three cards to pass.');
    const cards = ids.map((id) => me.hand.find((c) => c.id === id));
    if (cards.some((c) => !c)) throw new IllegalActionError('You can only pass cards in your hand.');
    me.passing = cards as Card[];
    me.hand = me.hand.filter((c) => !ids.includes(c.id));
    events.push({ type: 'passReady', seat });
    if (s.players.every((p) => p.passing)) {
      for (const p of s.players) {
        const to = s.players[passTarget(p.seat, s.passDir)];
        to.received = p.passing!;
      }
      for (const p of s.players) {
        p.hand = sortHand([...p.hand, ...p.received]);
        p.passing = null;
      }
      events.push({ type: 'passed', passDir: s.passDir });
      startPlay(s, events);
    }
    return { state: s, events };
  }

  if (action.type === 'play') {
    if (s.phase !== 'play') throw new IllegalActionError('It is not time to play.');
    if (s.current !== seat) throw new IllegalActionError("It isn't your turn.");
    const card = me.hand.find((c) => c.id === action.cardId);
    if (!card) throw new IllegalActionError("That card isn't in your hand.");
    const legal = playableCards(me.hand, s.tricks, s.heartsBroken, s.config);
    if (!legal.some((c) => c.id === card.id)) {
      const open = openTrick(s.tricks);
      if (!open && s.tricks.length === 0) throw new IllegalActionError('The 2♣ leads the first trick.');
      if (open && open.plays.length) throw new IllegalActionError(me.hand.some((c) => c.suit === open.plays[0].card.suit) ? 'You must follow suit.' : 'No points on the first trick.');
      throw new IllegalActionError("Hearts haven't been broken yet.");
    }
    let trick = openTrick(s.tricks);
    if (!trick) {
      trick = { leader: seat, plays: [], winner: null, points: 0 };
      s.tricks.push(trick);
    }
    trick.plays.push({ seat, card });
    me.hand = me.hand.filter((c) => c.id !== card.id);
    events.push({ type: 'played', seat, card });
    if (!s.heartsBroken && (card.suit === 'H' || (s.config.queenBreaksHearts && isQueenOfSpades(card)))) {
      s.heartsBroken = true;
      events.push({ type: 'heartsBroken', seat });
    }
    if (trick.plays.length < NUM_SEATS) {
      s.current = (seat + 1) % NUM_SEATS;
      events.push({ type: 'turn', seat: s.current });
      return { state: s, events };
    }
    const w = trickWinner(trick);
    trick.winner = w;
    trick.points = trick.plays.reduce((a, p) => a + cardPoints(p.card, s.config), 0);
    s.players[w].handPoints += trick.points;
    events.push({ type: 'trickWon', seat: w, points: trick.points, cards: trick.plays.map((p) => p.card), queen: trick.plays.some((p) => isQueenOfSpades(p.card)) });
    if (s.tricks.length === 13) {
      scoreHand(s, events);
    } else {
      s.current = w;
      events.push({ type: 'turn', seat: w });
    }
    return { state: s, events };
  }
  throw new IllegalActionError('Unknown action.');
}

function viewFor(s: HeartsState, seat: SeatIndex | 'spectator'): HeartsView {
  const mine = seat === 'spectator' ? null : s.players[seat];
  const playable = mine && s.phase === 'play' && s.current === mine.seat
    ? playableCards(mine.hand, s.tricks, s.heartsBroken, s.config).map((c) => c.id) : [];
  return {
    seat: mine ? mine.seat : null,
    config: s.config,
    phase: s.phase,
    hand: s.hand,
    passDir: s.passDir,
    current: s.current,
    heartsBroken: s.heartsBroken,
    players: s.players.map((p) => ({
      seat: p.seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality,
      cardCount: p.hand.length, score: p.score, handPoints: p.handPoints, hasPassed: !!p.passing, moons: p.moons,
    })),
    myHand: mine ? mine.hand.slice() : [],
    received: mine ? mine.received.slice() : [],
    myPass: mine?.passing ? mine.passing.slice() : null,
    tricks: JSON.parse(JSON.stringify(s.tricks)),
    playableIds: playable,
    history: JSON.parse(JSON.stringify(s.history)),
    placements: s.placements ? s.placements.slice() : null,
  };
}

function legalActions(s: HeartsState, seat: SeatIndex): HeartsAction[] {
  const p = s.players[seat];
  if (s.phase === 'roundOver') return [{ type: 'nextRound' }];
  if (s.phase === 'pass') return p.passing ? [] : [timeoutAction(s, seat)];
  if (s.phase === 'play' && s.current === seat) return playableCards(p.hand, s.tricks, s.heartsBroken, s.config).map((c) => ({ type: 'play', cardId: c.id }));
  return [];
}

function timeoutAction(s: HeartsState, seat: SeatIndex): HeartsAction {
  const p = s.players[seat];
  if (s.phase === 'roundOver') return { type: 'nextRound' };
  if (s.phase === 'pass') {
    const worst = p.hand.slice().sort((a, b) => cardPoints(b, s.config) * 3 + power(b) - (cardPoints(a, s.config) * 3 + power(a)));
    return { type: 'pass', cardIds: worst.slice(0, 3).map((c) => c.id) };
  }
  const legal = playableCards(p.hand, s.tricks, s.heartsBroken, s.config);
  const low = legal.slice().sort((a, b) => power(a) - power(b))[0];
  return { type: 'play', cardId: low.id };
}

export const HeartsModule: GameModule<HeartsConfig, HeartsState, HeartsAction, HeartsView, HeartsEvent> = {
  id: 'hearts',
  name: 'Hearts',
  minPlayers: 4,
  maxPlayers: 4,
  defaultConfig: defaultHeartsConfig,
  normalizeConfig: normalizeHeartsConfig,
  setup,
  actingSeats: (s) => (s.phase === 'pass' ? s.players.filter((p) => !p.passing).map((p) => p.seat) : s.phase === 'play' ? [s.current] : []),
  legalActions,
  apply,
  viewFor,
  timeoutAction,
  isFinished: (s) => s.phase === 'matchOver',
};
