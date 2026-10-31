import { describe, expect, test } from 'bun:test';
import { SEASONS, activeSeason, easterSunday, giftKey, seasonById, upcoming } from './seasons.ts';
import { BUNDLES, CATALOGUE, getItem } from './catalogue.ts';
import { MEMBER_PROPS } from './look.ts';
import { claimSeasonGift, createWallet, SEASON_GIFT_FALLBACK } from './progress.ts';

describe('seasons', () => {
  test('Easter Sunday is right for known years', () => {
    expect(easterSunday(2025)).toEqual([4, 20]);
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2027)).toEqual([3, 28]);
    expect(easterSunday(2030)).toEqual([4, 21]);
  });
  test('dates land in the right season, including New Year across the year end', () => {
    const at = (y: number, m: number, d: number) => activeSeason(new Date(y, m - 1, d, 12))?.id ?? null;
    expect(at(2026, 10, 31)).toBe('halloween');
    expect(at(2026, 12, 25)).toBe('christmas');
    expect(at(2026, 12, 31)).toBe('newyear');
    expect(at(2027, 1, 3)).toBe('newyear');
    expect(at(2027, 2, 14)).toBe('valentines');
    expect(at(2027, 3, 17)).toBe('stpatricks');
    expect(at(2027, 3, 28)).toBe('easter');
    expect(at(2027, 7, 15)).toBe('summer');
    expect(at(2027, 5, 10)).toBe(null);
  });
  test('every season item, gift, dealer hat and bundle exists', () => {
    for (const s of SEASONS) {
      expect(getItem(s.gift)).toBeDefined();
      if (s.dealerHat) expect(getItem(s.dealerHat)?.slot).toBe('hat');
      for (const p of s.memberProps) expect(getItem(p)?.slot).toBe('prop');
      expect(CATALOGUE.some((i) => i.season === s.id)).toBe(true);
      expect(BUNDLES.some((b) => b.season === s.id)).toBe(true);
    }
    for (const b of BUNDLES) { for (const id of b.items) expect(getItem(id)).toBeDefined(); if (b.season) expect(seasonById(b.season)).toBeDefined(); }
    for (const id of Object.values(MEMBER_PROPS)) expect(getItem(id)?.slot).toBe('prop');
  });
  test('the calendar lists every season once, soonest first', () => {
    const list = upcoming(new Date(2026, 10, 20));
    expect(list.length).toBe(SEASONS.length);
    expect(list[0].season.id).toBe('christmas');
  });
  test('the gift can be opened once a season; coins if you own it already', () => {
    const s = seasonById('christmas')!;
    const key = giftKey(s, new Date(2026, 11, 10));
    expect(key).toBe('christmas-2026');
    const r = claimSeasonGift(createWallet(), s.gift, key);
    if ('error' in r) throw new Error(r.error);
    expect(r.wallet.owned).toContain(s.gift);
    expect('error' in claimSeasonGift(r.wallet, s.gift, key)).toBe(true);
    const again = claimSeasonGift({ ...r.wallet, seasonGifts: [] }, s.gift, 'christmas-2027');
    if ('error' in again) throw new Error();
    expect(again.coins).toBe(SEASON_GIFT_FALLBACK);
  });
});
