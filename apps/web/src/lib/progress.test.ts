import { describe, expect, test } from 'bun:test';
import { seededRng } from '../../../../packages/engine/src/core/rng.ts';
import { CATALOGUE, getItem } from './catalogue.ts';
import { ME, createClub, recordMatch } from './club.ts';
import { ROSTER } from './roster.ts';
import { MEMBER_LOOKS, migrateLook } from './look.ts';
import { applyReward, buy, createWallet, grantUnlocks, itemState, levelInfo, rewardFor, tierFor, START_COINS } from './progress.ts';

const rng = seededRng(3);

describe('catalogue', () => {
  test('unique ids, every member has exactly one signature item and a full look', () => {
    expect(new Set(CATALOGUE.map((i) => i.id)).size).toBe(CATALOGUE.length);
    for (const m of ROSTER) {
      const sig = CATALOGUE.filter((i) => i.unlock.kind === 'signature' && i.unlock.member === m.id);
      expect(sig.length).toBe(1);
      const look = MEMBER_LOOKS[m.id];
      expect(look).toBeDefined();
      // they wear their signature item
      expect(Object.values(look.wear)).toContain(sig[0].id);
      for (const id of Object.values(look.wear)) expect(getItem(id)).toBeDefined();
    }
  });
  test('old head-only avatars migrate to full looks', () => {
    const l = migrateLook({ skin: '#e6b48f', hair: 'bun', hairColor: '#b8b2a6', outfit: '#1f4a3b', accessory: 'glasses', backdrop: '#2a3a33' });
    expect(l.v).toBe(2);
    expect(l.wear.jacket).toBe('blazer-bottle');
    expect(l.wear.glasses).toBe('round-gold');
    expect(l.hair).toBe('bun');
  });
});

describe('levels and tiers', () => {
  test('level curve and tiers', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(239).level).toBe(2);
    expect(levelInfo(240).level).toBe(3);
    expect(tierFor(1).id).toBe('member');
    expect(tierFor(5).id).toBe('regular');
    expect(tierFor(12).id).toBe('gold');
    expect(tierFor(25).id).toBe('black');
  });
});

describe('coins', () => {
  test('new wallet: welcome coins, starters owned, ledger records it', () => {
    const w = createWallet();
    expect(w.coins).toBe(START_COINS);
    expect(w.owned).toContain('blazer-navy');
    expect(w.ledger[0].amount).toBe(START_COINS);
  });
  test('winning pays more than losing; first win of the day bonus once', () => {
    let w = createWallet();
    const win = rewardFor({ placements: [ME, 'a', 'b', 'c'], kind: 'casual', titleWon: false, titleDefended: false, cupFinalReached: false, cupWon: false }, w);
    const lose = rewardFor({ placements: ['a', 'b', 'c', ME], kind: 'casual', titleWon: false, titleDefended: false, cupFinalReached: false, cupWon: false }, w);
    expect(win.coins).toBeGreaterThan(lose.coins + 40);
    w = applyReward(w, win, 'Won', true).wallet;
    const again = rewardFor({ placements: [ME, 'a', 'b', 'c'], kind: 'casual', titleWon: false, titleDefended: false, cupFinalReached: false, cupWon: false }, w);
    expect(again.coins).toBe(win.coins - 50);
  });
  test('buying: enough coins, tier gates, no double purchase, never negative', () => {
    const club = createClub(rng);
    let w = createWallet();
    expect('error' in buy(w, 'velvet-plum', club)).toBe(true); // gold tier
    expect('error' in buy(w, 'fedora-black', club)).toBe(true); // 700 > 300
    const r = buy(w, 'tee-red', club);
    expect('wallet' in r).toBe(true);
    w = (r as { wallet: typeof w }).wallet;
    expect(w.coins).toBe(START_COINS - 150);
    expect('error' in buy(w, 'tee-red', club)).toBe(true);
    expect(w.ledger[0].amount).toBe(-150);
  });
});

describe('unlocks', () => {
  test('beating a member five times wins their signature item', () => {
    let club = createClub(rng);
    let w = createWallet();
    expect(itemState(getItem('sig-rocco')!, w, club).kind).toBe('locked');
    for (let i = 0; i < 5; i++) club = recordMatch(club, 'poker', [ME, 'rocco'], 'casual', seededRng(i)).state;
    const g = grantUnlocks(w, club);
    w = g.wallet;
    expect(g.newly.map((i) => i.id)).toContain('sig-rocco');
    expect(w.owned).toContain('sig-rocco');
  });
  test('winning a title earns the crown and champion jacket', () => {
    let club = createClub(rng);
    club.players[ME].take2.rating = 2000;
    club = recordMatch(club, 'take2', [ME, club.titles.take2.current.holder], 'title', rng).state;
    const g = grantUnlocks(createWallet(), club);
    expect(g.newly.map((i) => i.id)).toEqual(expect.arrayContaining(['crown', 'champion-jacket']));
  });
  test('level items unlock at their level', () => {
    const w = { ...createWallet(), xp: 5000 };
    const g = grantUnlocks(w, createClub(rng));
    expect(g.wallet.owned).toEqual(expect.arrayContaining(['emote-clap', 'emote-cheer', 'blazer-club']));
  });
});

import { BOOSTS as _B, BUNDLES as _BU, CASES as _C, getItem as _gi } from './catalogue.ts';
import { boostLeft as _bl, buyBoost as _bb, buyBundle as _buyB, bundlePrice as _bp, casePool as _cp, claimDaily as _cd, dailyStatus as _ds, openCase as _oc, applyReward as _ar, createWallet as _cw, DAILY_CUT as _DC } from './progress.ts';
import { createClub as _cc } from './club.ts';
import { seededRng as _sr } from '../../../../packages/engine/src/core/rng.ts';

describe('shop & stash', () => {
  const club = _cc(_sr(3));
  const rich = () => ({ ..._cw(), coins: 100000 });
  test('every bundle item exists and bundles take a quarter off', () => {
    for (const b of _BU) for (const id of b.items) expect(_gi(id)).toBeDefined();
    const p = _bp(rich(), 'bundle-gnome', club)!;
    expect(p.price).toBe(Math.round(p.full * 0.75 / 10) * 10);
    const r = _buyB(rich(), 'bundle-gnome', club);
    expect('wallet' in r && r.wallet.owned.includes('hat-gnome') && r.wallet.owned.includes('prop-gnome')).toBe(true);
    if ('wallet' in r) expect(_bp(r.wallet, 'bundle-gnome', club)).toBeNull();
  });
  test('boosts double XP, add half coins, and stack time', () => {
    const now = Date.UTC(2026, 9, 29, 12);
    let w = rich();
    const r1 = _bb(w, 'boost-xp-1', now); if ('error' in r1) throw new Error(); w = r1.wallet;
    const r2 = _bb(w, 'boost-xp-1', now); if ('error' in r2) throw new Error(); w = r2.wallet;
    expect(_bl(w, 'xp', now)).toBe(2 * 3600000);
    const paid = _ar(w, { coins: 100, xp: 40, lines: [] }, 'test', true, new Date(now));
    expect(paid.xp).toBe(80);
    expect(paid.coins).toBe(100);
    const later = _ar(w, { coins: 100, xp: 40, lines: [] }, 'test', true, new Date(now + 3 * 3600000));
    expect(later.xp).toBe(40);
    expect(_B.length).toBeGreaterThan(0);
  });
  test('cases never give duplicates and odds add to 100', () => {
    for (const c of _C) expect(Object.values(c.odds).reduce((a, b) => a + b, 0)).toBe(100);
    let w = rich();
    const rng = _sr(9);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const r = _oc(w, 'case-gold', club, () => rng.float());
      if ('error' in r) throw new Error(r.error);
      expect(seen.has(r.item.id)).toBe(false);
      expect(w.owned.includes(r.item.id)).toBe(false);
      seen.add(r.item.id);
      w = r.wallet;
    }
    expect(_cp(w, club).length).toBeGreaterThanOrEqual(0);
  });
  test('Daily Cut: once a day, runs up, resets after a missed day', () => {
    let w = _cw();
    const d = (n: number) => new Date(2026, 9, 1 + n, 10);
    const a = _cd(w, d(0)); if ('error' in a) throw new Error(); w = a.wallet;
    expect(a.coins).toBe(_DC[0]);
    expect('error' in _cd(w, d(0))).toBe(true);
    const b = _cd(w, d(1)); if ('error' in b) throw new Error(); w = b.wallet;
    expect(b.coins).toBe(_DC[1]);
    expect(_ds(w, d(3)).streak).toBe(0);
    const c = _cd(w, d(3)); if ('error' in c) throw new Error();
    expect(c.coins).toBe(_DC[0]);
  });
});
