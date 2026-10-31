// Five-Card Draw AI. Sees only a PokerView: its own five cards, stacks, bets,
// and how many cards each opponent exchanged (which everyone at a real table sees).

import { standardDeck, type Card } from '../core/cards.ts';
import type { Rng } from '../core/rng.ts';
import { HandCategory, evaluate5, pokerRank } from './evaluator.ts';
import { POKER_PERSONALITIES, decideBet, type PokerPersonalityId } from './ai.ts';
import type { PokerAction, PokerView } from './types.ts';

/** Which cards to throw. Standard draw play: keep made hands, draw to pairs, four-flushes and open straights. */
export function drawDiscards(hand: Card[], maxDraw = 3, opts: { keepKicker?: boolean; chaseInside?: boolean } = {}): Card[] {
  const v = evaluate5(hand);
  const byRank = new Map<number, Card[]>();
  for (const c of hand) byRank.set(pokerRank(c), [...(byRank.get(pokerRank(c)) ?? []), c]);
  const groups = [...byRank.values()].sort((a, b) => b.length - a.length || pokerRank(b[0]) - pokerRank(a[0]));
  const throwAllBut = (keep: Card[]) => hand.filter((c) => !keep.includes(c)).slice(0, maxDraw);

  if (v.category >= HandCategory.Straight) return [];
  if (v.category === HandCategory.FourOfAKind) return [];
  if (v.category === HandCategory.ThreeOfAKind) return throwAllBut(groups[0]);
  if (v.category === HandCategory.TwoPair) return throwAllBut([...groups[0], ...groups[1]]);

  // Four to a flush?
  for (const suit of ['S', 'H', 'D', 'C']) {
    const same = hand.filter((c) => c.suit === suit);
    if (same.length === 4 && v.category === HandCategory.HighCard) return throwAllBut(same);
  }
  // Four to an open-ended straight (or any four-straight if it chases)?
  if (v.category === HandCategory.HighCard) {
    const rs = [...new Set(hand.map(pokerRank))].sort((a, b) => a - b);
    for (let lo = 2; lo <= 11; lo++) {
      const want = [lo, lo + 1, lo + 2, lo + 3];
      if (want.every((r) => rs.includes(r)) && (lo + 3 < 14 || opts.chaseInside)) {
        return throwAllBut(want.map((r) => hand.find((c) => pokerRank(c) === r)!));
      }
    }
  }
  if (v.category === HandCategory.OnePair) {
    const keep = [...groups[0]];
    if (opts.keepKicker) {
      const ace = hand.find((c) => pokerRank(c) === 14 && !keep.includes(c));
      if (ace) keep.push(ace);
    }
    return throwAllBut(keep);
  }
  // Nothing: keep the two highest (or one ace) and draw three.
  const sorted = hand.slice().sort((a, b) => pokerRank(b) - pokerRank(a));
  return throwAllBut(sorted.slice(0, 2));
}

function sample(deck: Card[], n: number, rng: Rng): Card[] {
  for (let k = 0; k < n; k++) {
    const j = rng.int(deck.length - k);
    const last = deck.length - 1 - k;
    const t = deck[j]; deck[j] = deck[last]; deck[last] = t;
  }
  return deck.slice(deck.length - n);
}

/**
 * Chance of winning against `opp` opponents. Before the draw, everyone (us included)
 * draws with the standard strategy. After the draw, opponents' random hands are
 * re-dealt until their own draw matches what they actually took (so a player who
 * stood pat is treated as holding a made hand).
 */
export function estimateDrawEquity(hole: Card[], oppDraws: Array<number | null>, sims: number, maxDraw: number, rng: Rng): number {
  const known = new Set(hole.map((c) => c.id));
  const base = standardDeck().filter((c) => !known.has(c.id));
  const predraw = oppDraws.every((d) => d === null);
  let won = 0;
  for (let i = 0; i < sims; i++) {
    const deck = base.slice();
    let mine = hole;
    if (predraw) {
      const out = drawDiscards(hole, maxDraw);
      if (out.length) mine = [...hole.filter((c) => !out.includes(c)), ...sample(deck, out.length, rng)];
      deck.length -= out.length;
    }
    const myScore = evaluate5(mine).score;
    let best = 0;
    let ties = 0;
    for (const d of oppDraws) {
      let hand: Card[] = [];
      // Pat hands are rare in random deals, so look harder for them.
      const maxTries = d === null ? 1 : d === 0 ? 120 : d <= 1 ? 40 : 12;
      for (let tries = 0; tries < maxTries; tries++) {
        hand = sample(deck, 5, rng);
        if (d === null || drawDiscards(hand, maxDraw).length === d) break;
      }
      deck.length -= 5;
      let final = hand;
      const out = drawDiscards(hand, maxDraw);
      if (out.length) {
        final = [...hand.filter((c) => !out.includes(c)), ...sample(deck, out.length, rng)];
        deck.length -= out.length;
      }
      const sc = evaluate5(final).score;
      if (sc > best) { best = sc; ties = 0; }
      if (sc === best) ties++;
    }
    if (myScore > best) won += 1;
    else if (myScore === best) won += 1 / (ties + 1);
  }
  return won / sims;
}

export function drawChooseAction(v: PokerView, personalityId: string | undefined, rng: Rng): PokerAction {
  if (v.street === 'handOver') return { type: 'nextHand' };
  const pers = POKER_PERSONALITIES[(personalityId as PokerPersonalityId) ?? 'cautious'] ?? POKER_PERSONALITIES.cautious;
  const maxDraw = v.config.maxDraw ?? 3;
  if (v.street === 'draw') {
    if (v.seat === null || v.current !== v.seat) return { type: 'draw', discard: [] };
    const cat = evaluate5(v.hole).category;
    // The occasional pat bluff with nothing.
    if (cat === HandCategory.HighCard && rng.float() < pers.bluff * 0.25) return { type: 'draw', discard: [] };
    // Beginners sometimes draw too many or keep junk.
    if (pers.id === 'beginner' && rng.float() < 0.25) {
      const n = rng.int(maxDraw + 1);
      return { type: 'draw', discard: v.hole.slice().sort(() => rng.float() - 0.5).slice(0, n).map((c) => c.id) };
    }
    const out = drawDiscards(v.hole, maxDraw, { keepKicker: pers.id === 'aggressive' || pers.id === 'unpredictable', chaseInside: pers.id === 'unpredictable' });
    return { type: 'draw', discard: out.map((c) => c.id) };
  }
  if (!v.options || v.seat === null) return v.legal[0] ?? { type: 'fold' };
  const opps = v.players.filter((p) => p.inHand && p.seat !== v.seat);
  const sims = Math.max(60, Math.round(pers.sims / 3));
  const equity = estimateDrawEquity(v.hole, opps.map((p) => p.drew), sims, maxDraw, rng);
  return decideBet(v, pers, equity, rng);
}
