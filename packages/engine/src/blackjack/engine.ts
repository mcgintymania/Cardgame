// Blackjack tournament engine. Pure: apply() returns a new state.

import { standardDeck, type Card } from '../core/cards.ts';
import { IllegalActionError, type ApplyResult, type GameModule, type SeatIndex, type SeatInfo } from '../core/game.ts';
import { shuffle, type Rng } from '../core/rng.ts';
import {
  defaultBlackjackConfig, normalizeBlackjackConfig,
  type BJAction, type BJEvent, type BJHand, type BJOptions, type BJPlayer, type BJRoundResult, type BlackjackConfig, type BlackjackState, type BlackjackView,
} from './types.ts';

const clone = (s: BlackjackState): BlackjackState => JSON.parse(JSON.stringify(s));

/** Ace 1 or 11, picture cards 10. */
export const cardPoints = (c: Card) => (c.rank === 1 ? 1 : Math.min(10, c.rank));

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) { total += cardPoints(c); if (c.rank === 1) aces++; }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export const isNatural = (h: { cards: Card[]; fromSplit: boolean }) => h.cards.length === 2 && !h.fromSplit && handValue(h.cards).total === 21;

function newShoe(config: BlackjackConfig, rng: Rng): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < config.decks; d++) cards.push(...standardDeck(String.fromCharCode(97 + d)));
  return shuffle(cards, rng);
}

function draw(s: BlackjackState, rng: Rng, events: BJEvent[]): Card {
  if (!s.shoe.length) {
    // Should never happen with the cut card, but never run dry.
    s.shoe = newShoe(s.config, rng);
    s.shuffles++;
    events.push({ type: 'shuffled' });
  }
  return s.shoe.pop()!;
}

const active = (s: BlackjackState) => s.players.filter((p) => !p.out);
const blankHand = (bet: number, cards: Card[] = [], fromSplit = false): BJHand => ({ cards, bet, doubled: false, fromSplit, splitAces: false, done: false, surrendered: false, outcome: null, net: 0 });

function setup(config: BlackjackConfig, seats: SeatInfo[], rng: Rng): ApplyResult<BlackjackState, BJEvent> {
  if (seats.length < 1 || seats.length > 5) throw new Error('Blackjack seats one to five players.');
  const shoe = newShoe(config, rng);
  const s: BlackjackState = {
    config,
    players: seats.map((p, seat) => ({ seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality, chips: config.startingChips, bet: null, hands: [], out: false, place: null, blackjacks: 0, handsWon: 0 })),
    shoe, cutCard: Math.floor(shoe.length * 0.25), dealer: [], holeRevealed: false, phase: 'bet', round: 1, current: null, history: [], placements: null, shuffles: 1,
  };
  return { state: s, events: [{ type: 'shuffled' }] };
}

export function betRange(s: BlackjackState, p: BJPlayer): [number, number] {
  return [s.config.minBet, Math.max(s.config.minBet, Math.min(s.config.maxBet, p.chips))];
}

function dealRound(s: BlackjackState, rng: Rng, events: BJEvent[]) {
  if (s.shoe.length < s.cutCard) {
    s.shoe = newShoe(s.config, rng);
    s.cutCard = Math.floor(s.shoe.length * 0.25);
    s.shuffles++;
    events.push({ type: 'shuffled' });
  }
  const ps = active(s);
  for (const p of ps) p.hands = [blankHand(p.bet!)];
  s.dealer = [];
  s.holeRevealed = false;
  for (let r = 0; r < 2; r++) {
    for (const p of ps) {
      const c = draw(s, rng, events);
      p.hands[0].cards.push(c);
      events.push({ type: 'card', seat: p.seat, hand: 0, card: c });
    }
    const d = draw(s, rng, events);
    s.dealer.push(d);
    if (r === 0) events.push({ type: 'card', seat: 'dealer', hand: 0, card: d });
  }
  s.phase = 'play';
  events.push({ type: 'dealt', round: s.round });
  for (const p of ps) {
    if (isNatural(p.hands[0])) { p.hands[0].done = true; events.push({ type: 'blackjack', seat: p.seat }); }
  }
  // Dealer peeks for blackjack under an ace or a ten.
  const up = s.dealer[0];
  if ((up.rank === 1 || cardPoints(up) === 10) && handValue(s.dealer).total === 21) {
    s.holeRevealed = true;
    events.push({ type: 'holeRevealed', card: s.dealer[1] });
    events.push({ type: 'blackjack', seat: 'dealer' });
    settle(s, events);
    return;
  }
  advance(s, rng, events);
}

/** Move to the next hand that still needs decisions, or let the dealer play. */
function advance(s: BlackjackState, rng: Rng, events: BJEvent[]) {
  for (const p of active(s)) {
    const h = p.hands.findIndex((x) => !x.done);
    if (h >= 0) {
      s.current = { seat: p.seat, hand: h };
      events.push({ type: 'turn', seat: p.seat, hand: h });
      return;
    }
  }
  s.current = null;
  dealerPlays(s, rng, events);
}

function dealerPlays(s: BlackjackState, rng: Rng, events: BJEvent[]) {
  s.holeRevealed = true;
  events.push({ type: 'holeRevealed', card: s.dealer[1] });
  const live = active(s).some((p) => p.hands.some((h) => !h.surrendered && handValue(h.cards).total <= 21 && !isNatural(h)));
  if (live) {
    for (;;) {
      const v = handValue(s.dealer);
      if (v.total > 17 || (v.total === 17 && !(v.soft && s.config.dealerHitsSoft17))) break;
      const c = draw(s, rng, events);
      s.dealer.push(c);
      events.push({ type: 'card', seat: 'dealer', hand: 0, card: c });
    }
  }
  settle(s, events);
}

function settle(s: BlackjackState, events: BJEvent[]) {
  const dv = handValue(s.dealer);
  const dealerBJ = s.dealer.length === 2 && dv.total === 21;
  const dealerBust = dv.total > 21;
  const result: BJRoundResult = { round: s.round, dealer: s.dealer.slice(), dealerTotal: dv.total, dealerBust, dealerBlackjack: dealerBJ, lines: [] };
  for (const p of active(s)) {
    let net = 0;
    for (const h of p.hands) {
      const v = handValue(h.cards).total;
      const nat = isNatural(h);
      if (h.surrendered) { h.outcome = 'surrender'; h.net = -Math.ceil(h.bet / 2); p.chips += h.bet + h.net; }
      else if (v > 21) { h.outcome = 'bust'; h.net = -h.bet; }
      else if (dealerBJ) {
        if (nat) { h.outcome = 'push'; h.net = 0; p.chips += h.bet; } else { h.outcome = 'lose'; h.net = -h.bet; }
      } else if (nat) { h.outcome = 'blackjack'; h.net = Math.floor(h.bet * s.config.blackjackPays); p.chips += h.bet + h.net; p.blackjacks++; }
      else if (dealerBust || v > dv.total) { h.outcome = 'win'; h.net = h.bet; p.chips += 2 * h.bet; }
      else if (v === dv.total) { h.outcome = 'push'; h.net = 0; p.chips += h.bet; }
      else { h.outcome = 'lose'; h.net = -h.bet; }
      h.done = true;
      net += h.net;
    }
    if (net > 0) p.handsWon++;
    result.lines.push({ seat: p.seat, hands: p.hands.map((h) => ({ cards: h.cards.slice(), bet: h.bet, outcome: h.outcome!, net: h.net })), net, chipsAfter: p.chips });
    p.bet = null;
  }
  s.history.push(result);
  s.current = null;
  events.push({ type: 'roundOver', result });

  // Anyone who can't cover the minimum bet is out. Ties for going out: bigger stack finishes higher.
  const busting = active(s).filter((p) => p.chips < s.config.minBet).sort((a, b) => b.chips - a.chips);
  const remaining = active(s).length - busting.length;
  busting.forEach((p, i) => {
    p.out = true;
    p.place = remaining + 1 + i;
    events.push({ type: 'out', seat: p.seat, place: p.place });
  });
  const solo = s.players.length === 1;
  if (s.round >= s.config.rounds || active(s).length === 0 || (!solo && active(s).length <= 1)) {
    const standing = active(s).sort((a, b) => b.chips - a.chips || a.seat - b.seat);
    standing.forEach((p, i) => { p.place = i + 1; });
    s.placements = s.players.slice().sort((a, b) => a.place! - b.place!).map((p) => p.seat);
    s.phase = 'matchOver';
    events.push({ type: 'matchOver', placements: s.placements });
  } else {
    s.phase = 'roundOver';
  }
}

export function bjOptions(s: BlackjackState, seat: SeatIndex): BJOptions | null {
  if (s.phase !== 'play' || !s.current || s.current.seat !== seat) return null;
  const p = s.players[seat];
  const h = p.hands[s.current.hand];
  const two = h.cards.length === 2;
  const canAfford = p.chips >= h.bet;
  return {
    hit: true,
    stand: true,
    double: two && canAfford && !h.splitAces && (!h.fromSplit || s.config.doubleAfterSplit),
    split: two && canAfford && cardPoints(h.cards[0]) === cardPoints(h.cards[1]) && p.hands.length < s.config.maxHands && !h.splitAces,
    surrender: s.config.surrender && two && !h.fromSplit && p.hands.length === 1,
  };
}

function apply(state: BlackjackState, seat: SeatIndex, action: BJAction, rng: Rng): ApplyResult<BlackjackState, BJEvent> {
  const s = clone(state);
  const events: BJEvent[] = [];
  const p = s.players[seat];
  if (!p) throw new IllegalActionError('No such seat.');

  if (action.type === 'nextRound') {
    if (s.phase !== 'roundOver') throw new IllegalActionError('The hand is still being played.');
    s.round++;
    s.phase = 'bet';
    s.dealer = [];
    s.holeRevealed = false;
    for (const x of s.players) { x.hands = []; x.bet = null; }
    return { state: s, events };
  }
  if (s.phase === 'matchOver') throw new IllegalActionError('The tournament is over.');
  if (s.phase === 'roundOver') throw new IllegalActionError('Waiting for the next hand.');
  if (p.out) throw new IllegalActionError("You're out of chips.");

  if (action.type === 'bet') {
    if (s.phase !== 'bet') throw new IllegalActionError('Bets are closed.');
    if (p.bet !== null) throw new IllegalActionError("You've already bet.");
    const [lo, hi] = betRange(s, p);
    const amt = Math.floor(Number(action.amount));
    if (!Number.isFinite(amt) || amt < lo || amt > hi) throw new IllegalActionError(`Bet between ${lo} and ${hi}.`);
    p.bet = amt;
    p.chips -= amt;
    events.push({ type: 'betPlaced', seat, amount: amt });
    if (active(s).every((x) => x.bet !== null)) dealRound(s, rng, events);
    return { state: s, events };
  }

  const o = bjOptions(s, seat);
  if (!o) throw new IllegalActionError("It isn't your turn.");
  const hi = s.current!.hand;
  const h = p.hands[hi];
  const give = (hand: BJHand, handIndex: number) => {
    const c = draw(s, rng, events);
    hand.cards.push(c);
    events.push({ type: 'card', seat, hand: handIndex, card: c });
    const v = handValue(hand.cards).total;
    if (v > 21) { hand.done = true; events.push({ type: 'bust', seat, hand: handIndex }); }
    else if (v === 21) hand.done = true;
  };

  switch (action.type) {
    case 'hit':
      events.push({ type: 'acted', seat, hand: hi, action: 'hit' });
      give(h, hi);
      break;
    case 'stand':
      events.push({ type: 'acted', seat, hand: hi, action: 'stand' });
      h.done = true;
      break;
    case 'double':
      if (!o.double) throw new IllegalActionError(h.cards.length !== 2 ? 'You can only double on your first two cards.' : p.chips < h.bet ? "You don't have the chips to double." : "You can't double this hand.");
      events.push({ type: 'acted', seat, hand: hi, action: 'double' });
      p.chips -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      give(h, hi);
      h.done = true;
      break;
    case 'split': {
      if (!o.split) throw new IllegalActionError(p.hands.length >= s.config.maxHands ? 'No more splits allowed.' : p.chips < h.bet ? "You don't have the chips to split." : 'You can only split a pair.');
      events.push({ type: 'acted', seat, hand: hi, action: 'split' });
      p.chips -= h.bet;
      const aces = h.cards[0].rank === 1;
      const second = blankHand(h.bet, [h.cards[1]], true);
      h.cards = [h.cards[0]];
      h.fromSplit = true;
      p.hands.splice(hi + 1, 0, second);
      give(h, hi);
      give(second, hi + 1);
      if (aces) for (const x of [h, second]) { x.splitAces = true; x.done = true; }
      break;
    }
    case 'surrender':
      if (!o.surrender) throw new IllegalActionError("You can't surrender now.");
      events.push({ type: 'acted', seat, hand: hi, action: 'surrender' });
      h.surrendered = true;
      h.done = true;
      break;
    default:
      throw new IllegalActionError('Unknown action.');
  }
  if (p.hands[hi].done || action.type === 'split') {
    // After a split, keep playing the first new hand unless it's finished.
    advance(s, rng, events);
  }
  return { state: s, events };
}

function viewFor(s: BlackjackState, seat: SeatIndex | 'spectator'): BlackjackView {
  const me = seat === 'spectator' ? null : s.players[seat];
  const dealer = s.dealer.map((c, i) => (i === 1 && !s.holeRevealed ? null : c));
  const shown = dealer.filter((c): c is Card => !!c);
  return {
    seat: me ? me.seat : null,
    config: s.config,
    phase: s.phase,
    round: s.round,
    players: s.players.map((p) => ({
      seat: p.seat, playerId: p.playerId, name: p.name, isAI: p.isAI, personality: p.personality, chips: p.chips,
      // Bets are placed face up, but only revealed once everyone has bet, so nobody can wait and react.
      bet: s.phase === 'bet' && p.seat !== me?.seat ? null : p.bet,
      hasBet: p.bet !== null, hands: JSON.parse(JSON.stringify(p.hands)), out: p.out, place: p.place, blackjacks: p.blackjacks, handsWon: p.handsWon,
    })),
    dealer,
    dealerTotal: shown.length ? handValue(shown).total : null,
    current: s.current ? { ...s.current } : null,
    options: me ? bjOptions(s, me.seat) : null,
    betRange: me && s.phase === 'bet' && !me.out && me.bet === null ? betRange(s, me) : null,
    shoeLeft: s.shoe.length,
    history: JSON.parse(JSON.stringify(s.history.slice(-20))),
    placements: s.placements ? s.placements.slice() : null,
  };
}

function legalActions(s: BlackjackState, seat: SeatIndex): BJAction[] {
  if (s.phase === 'roundOver') return [{ type: 'nextRound' }];
  const p = s.players[seat];
  if (!p || p.out) return [];
  if (s.phase === 'bet') return p.bet === null ? [{ type: 'bet', amount: s.config.minBet }] : [];
  const o = bjOptions(s, seat);
  if (!o) return [];
  const out: BJAction[] = [{ type: 'hit' }, { type: 'stand' }];
  if (o.double) out.push({ type: 'double' });
  if (o.split) out.push({ type: 'split' });
  if (o.surrender) out.push({ type: 'surrender' });
  return out;
}

function timeoutAction(s: BlackjackState, seat: SeatIndex): BJAction {
  if (s.phase === 'roundOver') return { type: 'nextRound' };
  if (s.phase === 'bet') return { type: 'bet', amount: s.config.minBet };
  return { type: 'stand' };
}

export const BlackjackModule: GameModule<BlackjackConfig, BlackjackState, BJAction, BlackjackView, BJEvent> = {
  id: 'blackjack',
  name: 'Blackjack',
  minPlayers: 1,
  maxPlayers: 5,
  defaultConfig: defaultBlackjackConfig,
  normalizeConfig: normalizeBlackjackConfig,
  setup,
  actingSeats: (s) => (s.phase === 'bet' ? active(s).filter((p) => p.bet === null).map((p) => p.seat) : s.phase === 'play' && s.current ? [s.current.seat] : []),
  legalActions,
  apply,
  viewFor,
  timeoutAction,
  isFinished: (s) => s.phase === 'matchOver',
};
