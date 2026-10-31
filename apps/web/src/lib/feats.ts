// Feats: things you pull off during a game (a rainbow hand, a full house, going
// gin). Each table feeds its events to a tracker; anything new is recorded in the
// wallet, unlocks its item and pops up a notice.

import type { Card } from '../../../../packages/engine/src/core/cards.ts';
import { ACHIEVEMENTS, type FeatKey } from './catalogue.ts';
import { addFeats, grantUnlocks } from './progress.ts';
import { store } from './store.ts';

export interface FeatNotice { key: FeatKey; name: string; how: string; items: string[] }
export const FEAT_EVENT = 'cardclub:feat';

/** Records feats, grants their items and announces any that are new. */
export function awardFeats(keys: FeatKey[]): FeatKey[] {
  if (!keys.length) return [];
  const s = store.get();
  const r = addFeats(s.wallet, keys);
  if (!r.fresh.length) return [];
  const u = grantUnlocks(r.wallet, s.club);
  store.setWallet(u.wallet);
  for (const key of r.fresh) {
    const items = u.newly.filter((i) => i.unlock.kind === 'achievement' && i.unlock.key === key).map((i) => i.name);
    try { window.dispatchEvent(new CustomEvent<FeatNotice>(FEAT_EVENT, { detail: { key, name: ACHIEVEMENTS[key].name, how: ACHIEVEMENTS[key].how, items } })); } catch { /* no window in tests */ }
  }
  return r.fresh;
}

/** Four cards left, one of each suit. */
export const isRainbow = (hand: Card[] | undefined) => !!hand && hand.length === 4 && new Set(hand.map((c) => c.suit)).size === 4;

type Ev = { type: string; [k: string]: any };

/** Take 2: rainbow hand, passing a skip on, stacking 2s. */
export function take2Feats(events: Ev[], hand: Card[] | undefined): FeatKey[] {
  const out: FeatKey[] = [];
  if (isRainbow(hand)) out.push('rainbow');
  const iPlayedTwo = events.some((e) => e.type === 'played' && e.seat === 0 && e.card?.rank === 2);
  for (const e of events) {
    if (e.type === 'skipPassed' && e.from === 0) out.push('passSkip');
    if (e.type === 'penaltyPending' && e.stacked && iPlayedTwo) out.push('stackTwos');
  }
  return out;
}

/** Hearts: rainbow hand, shooting the moon, a clean hand. */
export function heartsFeats(events: Ev[], hand: Card[] | undefined): FeatKey[] {
  const out: FeatKey[] = [];
  if (isRainbow(hand)) out.push('rainbow');
  for (const e of events) {
    if (e.type === 'moon' && e.seat === 0) out.push('moon');
    if (e.type === 'roundOver' && e.result?.lines?.some((l: { seat: number; taken: number }) => l.seat === 0 && l.taken === 0) && e.result.moon === null) out.push('spotless');
  }
  return out;
}

export function ginFeats(events: Ev[]): FeatKey[] {
  const out: FeatKey[] = [];
  for (const e of events) {
    if (e.type !== 'roundOver' || e.result?.winner !== 0) continue;
    if (e.result.end === 'gin' || e.result.end === 'bigGin') out.push('gin');
    if (e.result.end === 'undercut') out.push('undercut');
  }
  return out;
}

/** Poker needs to remember what you did earlier in the hand. */
export function pokerTracker() {
  let aggressive = false;
  let allIn = false;
  return (events: Ev[]): FeatKey[] => {
    const out: FeatKey[] = [];
    for (const e of events) {
      if (e.type === 'handStarted') { aggressive = false; allIn = false; }
      if (e.type === 'acted' && e.seat === 0) {
        if (e.action === 'bet' || e.action === 'raise' || e.action === 'allIn') aggressive = true;
        if (e.action === 'allIn') allIn = true;
      }
      if (e.type === 'handOver') {
        const r = e.result;
        if (!(r?.payouts?.[0] > 0)) continue;
        if (r.uncontested) { if (aggressive) out.push('steal'); continue; }
        const mine: string = r.revealed?.find((x: { seat: number }) => x.seat === 0)?.description ?? '';
        if (/^Royal flush/.test(mine)) out.push('royalFlush', 'quads', 'fullHouse');
        else if (/^(Straight flush|Four of a kind)/.test(mine)) out.push('quads', 'fullHouse');
        else if (/^Full house/.test(mine)) out.push('fullHouse');
        if (allIn) out.push('allInWin');
      }
    }
    return out;
  };
}

export function blackjackTracker() {
  let doubled = false;
  return (events: Ev[]): FeatKey[] => {
    const out: FeatKey[] = [];
    for (const e of events) {
      if (e.type === 'dealt') doubled = false;
      if (e.type === 'blackjack' && e.seat === 0) out.push('natural');
      if (e.type === 'acted' && e.seat === 0 && e.action === 'double') doubled = true;
      if (e.type === 'roundOver') {
        const line = e.result?.lines?.find((l: { seat: number }) => l.seat === 0);
        const wins = (line?.hands ?? []).filter((h: { outcome: string }) => h.outcome === 'win' || h.outcome === 'blackjack');
        if (wins.some((h: { cards: Card[] }) => h.cards.length >= 5)) out.push('charlie');
        if (doubled && wins.length) out.push('doubleWin');
      }
    }
    return out;
  };
}
