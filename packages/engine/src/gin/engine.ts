// Gin Rummy engine. Pure: apply() returns a new state and never mutates its input.

import { standardDeck, type Card } from '../core/cards.ts';
import { IllegalActionError, type ApplyResult, type GameModule, type SeatIndex, type SeatInfo } from '../core/game.ts';
import { shuffle, type Rng } from '../core/rng.ts';
import { bestArrangement, bestWithLayoffs, cardValue } from './melds.ts';
import {
  defaultGinConfig, normalizeGinConfig,
  type GinAction, type GinConfig, type GinEvent, type GinHandResult, type GinState, type GinView, type HandEnd,
} from './types.ts';

const clone = (s: GinState): GinState => JSON.parse(JSON.stringify(s));
const other = (seat: SeatIndex) => (seat === 0 ? 1 : 0);

const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 } as const;
export function sortGinHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rank - b.rank);
}

/** Discards from an 11-card hand that leave deadwood ≤ knockMax. */
export function knockOptions(hand: Card[], banned: string | null, knockMax: number): string[] {
  if (hand.length !== 11) return [];
  const ids: string[] = [];
  for (const c of hand) {
    if (c.id === banned) continue;
    if (bestArrangement(hand.filter((x) => x.id !== c.id)).deadwoodValue <= knockMax) ids.push(c.id);
  }
  return ids;
}

function deal(s: GinState, rng: Rng, events: GinEvent[]) {
  const deck = shuffle(standardDeck(), rng);
  const nonDealer = other(s.dealer);
  s.players[nonDealer].hand = sortGinHand(deck.slice(0, 10));
  s.players[s.dealer].hand = sortGinHand(deck.slice(10, 20));
  s.discard = [deck[20]];
  s.stock = deck.slice(21);
  for (const p of s.players) p.pickups = [];
  s.current = nonDealer;
  s.offerPasses = 0;
  s.stockOnly = false;
  s.takenFromDiscard = null;
  s.lastDrawn = null;
  s.phase = s.config.upcardOffer ? 'offer' : 'draw';
  events.push({ type: 'dealt', hand: s.hand, dealer: s.dealer, upcard: deck[20] });
  events.push({ type: 'turn', seat: s.current });
}

function setup(config: GinConfig, seats: SeatInfo[], rng: Rng): ApplyResult<GinState, GinEvent> {
  if (seats.length !== 2) throw new Error('Gin Rummy is for two players.');
  const s: GinState = {
    config,
    players: seats.map((p, seat) => ({ seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality, hand: [], score: 0, handsWon: 0, pickups: [] })),
    stock: [], discard: [], dealer: rng.int(2), current: 0, phase: 'draw', offerPasses: 0, stockOnly: false,
    takenFromDiscard: null, lastDrawn: null, hand: 1, history: [], placements: null,
  };
  const events: GinEvent[] = [];
  deal(s, rng, events);
  return { state: s, events };
}

function endHand(s: GinState, knocker: SeatIndex | null, kind: 'knock' | 'gin' | 'bigGin' | 'draw', events: GinEvent[]) {
  const scoresBefore = s.players.map((p) => p.score);
  let result: GinHandResult;
  if (knocker === null) {
    result = {
      hand: s.hand, end: 'draw', knocker: null, winner: null, points: 0,
      knockerMelds: [], knockerDeadwood: [], knockerValue: 0, defenderMelds: [], defenderDeadwood: [], defenderValue: 0, layoffs: [], scoresAfter: scoresBefore,
    };
  } else {
    const def = other(knocker);
    const k = bestArrangement(s.players[knocker].hand);
    let end: HandEnd = kind;
    let winner: SeatIndex = knocker;
    let points: number;
    let dMelds; let dDead; let dVal; let layoffs: Card[] = [];
    if (kind === 'gin' || kind === 'bigGin') {
      const d = bestArrangement(s.players[def].hand);
      dMelds = d.melds; dDead = d.deadwood; dVal = d.deadwoodValue;
      points = (kind === 'gin' ? s.config.ginBonus : s.config.bigGinBonus) + dVal;
    } else {
      const d = bestWithLayoffs(s.players[def].hand, k.melds);
      dMelds = d.melds; dDead = d.deadwood; dVal = d.deadwoodValue; layoffs = d.layoffs;
      if (dVal > k.deadwoodValue) {
        points = dVal - k.deadwoodValue;
      } else {
        end = 'undercut';
        winner = def;
        points = s.config.undercutBonus + (k.deadwoodValue - dVal);
      }
    }
    s.players[winner].score += points;
    s.players[winner].handsWon++;
    result = {
      hand: s.hand, end, knocker, winner, points,
      knockerMelds: k.melds, knockerDeadwood: k.deadwood, knockerValue: k.deadwoodValue,
      defenderMelds: dMelds, defenderDeadwood: dDead, defenderValue: dVal, layoffs,
      scoresAfter: s.players.map((p) => p.score),
    };
  }
  s.history.push(result);
  events.push({ type: 'roundOver', result });
  const leader = s.players[0].score >= s.players[1].score ? 0 : 1;
  if (s.players[leader].score >= s.config.target) {
    s.placements = [leader, other(leader)];
    s.phase = 'matchOver';
    events.push({ type: 'matchOver', placements: s.placements });
  } else {
    s.phase = 'roundOver';
  }
}

function apply(state: GinState, seat: SeatIndex, action: GinAction, rng: Rng): ApplyResult<GinState, GinEvent> {
  const s = clone(state);
  const events: GinEvent[] = [];
  const me = s.players[seat];
  if (!me) throw new IllegalActionError('No such seat.');

  if (action.type === 'nextRound') {
    if (s.phase !== 'roundOver') throw new IllegalActionError('The hand is still being played.');
    s.hand++;
    s.dealer = other(s.dealer);
    deal(s, rng, events);
    return { state: s, events };
  }
  if (s.phase === 'matchOver') throw new IllegalActionError('The match is over.');
  if (s.phase === 'roundOver') throw new IllegalActionError('Waiting for the next hand.');
  if (s.current !== seat) throw new IllegalActionError("It isn't your turn.");

  switch (action.type) {
    case 'takeUpcard':
    case 'passUpcard': {
      if (s.phase !== 'offer') throw new IllegalActionError('The upcard is no longer on offer.');
      if (action.type === 'takeUpcard') {
        const c = s.discard.pop()!;
        me.hand = sortGinHand([...me.hand, c]);
        me.pickups.push(c);
        s.takenFromDiscard = c.id;
        s.lastDrawn = c.id;
        s.phase = 'discard';
        events.push({ type: 'drew', seat, source: 'discard', card: c });
        return { state: s, events };
      }
      s.offerPasses++;
      events.push({ type: 'upcardPassed', seat });
      if (s.offerPasses === 1) {
        s.current = s.dealer;
      } else {
        s.current = other(s.dealer);
        s.phase = 'draw';
        s.stockOnly = true;
      }
      events.push({ type: 'turn', seat: s.current });
      return { state: s, events };
    }
    case 'draw': {
      if (s.phase !== 'draw') throw new IllegalActionError(s.phase === 'offer' ? 'Take or pass the upcard first.' : 'You have already drawn.');
      if (action.source === 'discard') {
        if (s.stockOnly) throw new IllegalActionError('You both passed the upcard, so draw from the stock.');
        const c = s.discard.pop();
        if (!c) throw new IllegalActionError('The discard pile is empty.');
        me.hand = sortGinHand([...me.hand, c]);
        me.pickups.push(c);
        s.takenFromDiscard = c.id;
        s.lastDrawn = c.id;
        events.push({ type: 'drew', seat, source: 'discard', card: c });
      } else {
        const c = s.stock.pop();
        if (!c) throw new IllegalActionError('The stock is empty.');
        me.hand = sortGinHand([...me.hand, c]);
        s.takenFromDiscard = null;
        s.lastDrawn = c.id;
        events.push({ type: 'drew', seat, source: 'stock', card: null });
      }
      s.stockOnly = false;
      s.phase = 'discard';
      return { state: s, events };
    }
    case 'discard':
    case 'knock': {
      if (s.phase !== 'discard') throw new IllegalActionError('Draw a card first.');
      const c = me.hand.find((x) => x.id === action.cardId);
      if (!c) throw new IllegalActionError("That card isn't in your hand.");
      if (c.id === s.takenFromDiscard) throw new IllegalActionError("You can't throw back the card you just picked up.");
      const rest = me.hand.filter((x) => x.id !== c.id);
      if (action.type === 'knock') {
        const dw = bestArrangement(rest).deadwoodValue;
        if (dw > s.config.knockMax) throw new IllegalActionError(`You need ${s.config.knockMax} or less deadwood to knock (you'd have ${dw}).`);
        me.hand = rest;
        s.discard.push(c);
        events.push({ type: 'discarded', seat, card: c });
        events.push({ type: 'knocked', seat, gin: dw === 0 });
        endHand(s, seat, dw === 0 ? 'gin' : 'knock', events);
        return { state: s, events };
      }
      me.hand = rest;
      s.discard.push(c);
      s.takenFromDiscard = null;
      s.lastDrawn = null;
      events.push({ type: 'discarded', seat, card: c });
      if (s.stock.length <= 2) {
        endHand(s, null, 'draw', events);
        return { state: s, events };
      }
      s.current = other(seat);
      s.phase = 'draw';
      events.push({ type: 'turn', seat: s.current });
      return { state: s, events };
    }
    case 'bigGin': {
      if (s.phase !== 'discard' || me.hand.length !== 11) throw new IllegalActionError('Big gin is declared straight after drawing.');
      if (bestArrangement(me.hand).deadwoodValue !== 0) throw new IllegalActionError('All eleven cards must be in melds for big gin.');
      events.push({ type: 'knocked', seat, gin: true });
      endHand(s, seat, 'bigGin', events);
      return { state: s, events };
    }
  }
  throw new IllegalActionError('Unknown action.');
}

function viewFor(s: GinState, seat: SeatIndex | 'spectator'): GinView {
  const mine = seat === 'spectator' ? null : s.players[seat];
  const arr = mine && mine.hand.length ? bestArrangement(mine.hand) : { melds: [], deadwood: [], deadwoodValue: 0 };
  const myTurnDiscard = mine && s.phase === 'discard' && s.current === mine.seat;
  return {
    seat: mine ? mine.seat : null,
    config: s.config,
    phase: s.phase,
    hand: s.hand,
    dealer: s.dealer,
    current: s.current,
    players: s.players.map((p) => ({
      seat: p.seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality,
      cardCount: p.hand.length, score: p.score, handsWon: p.handsWon, pickups: p.pickups.slice(),
    })),
    myHand: mine ? mine.hand.slice() : [],
    topDiscard: s.discard[s.discard.length - 1] ?? null,
    discardCount: s.discard.length,
    stockCount: s.stock.length,
    takenFromDiscard: mine && s.current === mine.seat ? s.takenFromDiscard : null,
    lastDrawn: mine && s.current === mine.seat ? s.lastDrawn : null,
    stockOnly: s.stockOnly,
    myMelds: arr.melds,
    myDeadwood: arr.deadwood,
    myDeadwoodValue: arr.deadwoodValue,
    knockIds: myTurnDiscard ? knockOptions(mine!.hand, s.takenFromDiscard, s.config.knockMax) : [],
    canBigGin: !!myTurnDiscard && mine!.hand.length === 11 && arr.deadwoodValue === 0,
    discards: s.discard.slice(),
    history: JSON.parse(JSON.stringify(s.history)),
    placements: s.placements ? s.placements.slice() : null,
  };
}

function legalActions(s: GinState, seat: SeatIndex): GinAction[] {
  if (s.phase === 'roundOver') return [{ type: 'nextRound' }];
  if (s.phase === 'matchOver' || s.current !== seat) return [];
  const p = s.players[seat];
  if (s.phase === 'offer') return [{ type: 'takeUpcard' }, { type: 'passUpcard' }];
  if (s.phase === 'draw') {
    const a: GinAction[] = [{ type: 'draw', source: 'stock' }];
    if (!s.stockOnly && s.discard.length) a.push({ type: 'draw', source: 'discard' });
    return a;
  }
  const a: GinAction[] = p.hand.filter((c) => c.id !== s.takenFromDiscard).map((c) => ({ type: 'discard', cardId: c.id }));
  for (const id of knockOptions(p.hand, s.takenFromDiscard, s.config.knockMax)) a.push({ type: 'knock', cardId: id });
  if (p.hand.length === 11 && bestArrangement(p.hand).deadwoodValue === 0) a.push({ type: 'bigGin' });
  return a;
}

function timeoutAction(s: GinState, seat: SeatIndex): GinAction {
  if (s.phase === 'roundOver') return { type: 'nextRound' };
  if (s.phase === 'offer') return { type: 'passUpcard' };
  if (s.phase === 'draw') return { type: 'draw', source: 'stock' };
  const p = s.players[seat];
  const options = p.hand.filter((c) => c.id !== s.takenFromDiscard);
  let best = options[0];
  let bestV = Infinity;
  for (const c of options) {
    const v = bestArrangement(p.hand.filter((x) => x.id !== c.id)).deadwoodValue * 100 - cardValue(c);
    if (v < bestV) { bestV = v; best = c; }
  }
  return { type: 'discard', cardId: best.id };
}

export const GinModule: GameModule<GinConfig, GinState, GinAction, GinView, GinEvent> = {
  id: 'gin',
  name: 'Gin Rummy',
  minPlayers: 2,
  maxPlayers: 2,
  defaultConfig: defaultGinConfig,
  normalizeConfig: normalizeGinConfig,
  setup,
  actingSeats: (s) => (s.phase === 'roundOver' || s.phase === 'matchOver' ? [] : [s.current]),
  legalActions,
  apply,
  viewFor,
  timeoutAction,
  isFinished: (s) => s.phase === 'matchOver',
};
