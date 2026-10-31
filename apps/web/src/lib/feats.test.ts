import { describe, expect, test } from 'bun:test';
import { blackjackTracker, ginFeats, heartsFeats, isRainbow, pokerTracker, take2Feats } from './feats.ts';
import { ACHIEVEMENTS, BUNDLES, CATALOGUE, FEATS, getItem } from './catalogue.ts';
import { activityOf, addFeats, bumpStreak, createWallet, grantUnlocks, itemState, recordSolo } from './progress.ts';
import { ME, createClub } from './club.ts';
import { seededRng } from '../../../../packages/engine/src/core/rng.ts';
import { cards } from '../../../../packages/engine/tests/helpers.ts';

describe('feats', () => {
  test('rainbow: four cards, one of each suit', () => {
    expect(isRainbow(cards('2H 5S 9D KC'))).toBe(true);
    expect(isRainbow(cards('2H 5H 9D KC'))).toBe(false);
    expect(isRainbow(cards('2H 5S 9D KC 3C'))).toBe(false);
    expect(take2Feats([], cards('2H 5S 9D KC'))).toContain('rainbow');
  });
  test('Take 2: passing a skip on and stacking 2s', () => {
    expect(take2Feats([{ type: 'skipPassed', from: 0 }], [])).toEqual(['passSkip']);
    expect(take2Feats([{ type: 'skipPassed', from: 2 }], [])).toEqual([]);
    expect(take2Feats([{ type: 'played', seat: 0, card: cards('2S')[0] }, { type: 'penaltyPending', target: 1, amount: 4, stacked: true }], [])).toEqual(['stackTwos']);
  });
  test('Hearts and Gin', () => {
    expect(heartsFeats([{ type: 'moon', seat: 0 }], [])).toContain('moon');
    expect(heartsFeats([{ type: 'roundOver', result: { moon: null, lines: [{ seat: 0, taken: 0 }] } }], [])).toContain('spotless');
    expect(ginFeats([{ type: 'roundOver', result: { winner: 0, end: 'gin' } }])).toEqual(['gin']);
    expect(ginFeats([{ type: 'roundOver', result: { winner: 1, end: 'gin' } }])).toEqual([]);
  });
  test('poker: full house, steal, all-in win', () => {
    const t = pokerTracker();
    t([{ type: 'handStarted' }, { type: 'acted', seat: 0, action: 'raise' }]);
    expect(t([{ type: 'handOver', result: { payouts: { 0: 120 }, uncontested: true, revealed: [] } }])).toEqual(['steal']);
    t([{ type: 'handStarted' }, { type: 'acted', seat: 0, action: 'allIn' }]);
    const r = t([{ type: 'handOver', result: { payouts: { 0: 900 }, uncontested: false, revealed: [{ seat: 0, description: 'Full house, Kings full of Twos' }] } }]);
    expect(r).toContain('fullHouse');
    expect(r).toContain('allInWin');
    expect(r).not.toContain('quads');
  });
  test('blackjack: natural, five-card Charlie, doubled up', () => {
    const t = blackjackTracker();
    expect(t([{ type: 'blackjack', seat: 0 }])).toEqual(['natural']);
    t([{ type: 'dealt' }, { type: 'acted', seat: 0, action: 'double' }]);
    const r = t([{ type: 'roundOver', result: { lines: [{ seat: 0, hands: [{ outcome: 'win', cards: cards('2H 3S 4D 5C 6H') }] }] } }]);
    expect(r).toEqual(['charlie', 'doubleWin']);
  });
  test('every feat has a description and at least one reward item', () => {
    for (const k of FEATS) {
      expect(ACHIEVEMENTS[k]).toBeDefined();
      expect(CATALOGUE.some((i) => i.unlock.kind === 'achievement' && i.unlock.key === k)).toBe(true);
    }
  });
});

describe('earning items by playing', () => {
  const club = createClub(seededRng(4));
  test('most of the catalogue is earned, not bought', () => {
    const earned = CATALOGUE.filter((i) => i.unlock.kind !== 'shop').length;
    expect(earned).toBeGreaterThan(CATALOGUE.length * 0.4);
    for (const b of BUNDLES) for (const id of b.items) expect(getItem(id)!.unlock.kind).toBe('shop');
  });
  test('play milestones show progress and unlock when reached', () => {
    const w = createWallet();
    const st = itemState(getItem('emote-shrug')!, w, club);
    expect(st.kind).toBe('locked');
    if (st.kind === 'locked') expect(st.progress).toEqual([0, 3]);
    let w2 = w;
    for (let i = 0; i < 3; i++) w2 = recordSolo(w2, 'solitaire', false);
    expect(activityOf(club, w2).total).toBe(3);
    expect(grantUnlocks(w2, club).wallet.owned).toContain('emote-shrug');
  });
  test('per-game wins count only that game', () => {
    let w = createWallet();
    for (let i = 0; i < 5; i++) w = recordSolo(w, 'pyramid', true);
    expect(grantUnlocks(w, club).wallet.owned).toContain('hand-clover');
    expect(grantUnlocks(w, club).wallet.owned).not.toContain('tat-moon');
  });
  test('feats unlock their item; streaks of three count', () => {
    const r = addFeats(createWallet(), ['rainbow', 'rainbow']);
    expect(r.fresh).toEqual(['rainbow']);
    expect(grantUnlocks(r.wallet, club).wallet.owned).toContain('hand-suits');
    let w = createWallet();
    w = bumpStreak(bumpStreak(bumpStreak(w, true), true), true);
    expect(w.streak).toEqual({ cur: 3, best: 3 });
    expect(grantUnlocks(w, club).wallet.owned).toContain('tat-lucky');
    expect(bumpStreak(w, false).streak).toEqual({ cur: 0, best: 3 });
  });
  test('club games count from the club record', () => {
    const c = structuredClone(club);
    c.players[ME].hearts.played = 10;
    expect(activityOf(c, createWallet()).played.hearts).toBe(10);
    expect(grantUnlocks(createWallet(), c).wallet.owned).toContain('tat-rose');
  });
});
