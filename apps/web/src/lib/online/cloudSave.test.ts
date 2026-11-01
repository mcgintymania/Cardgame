import { describe, expect, test } from 'bun:test';
import { FRESH_BASE, mergeSave } from './cloudSave.ts';
import { createWallet, type Wallet } from '../progress.ts';
import { EMPTY_STATS } from '../store.ts';

const w = (patch: Partial<Wallet>): Wallet => ({ ...createWallet(), ledger: [], ...patch });

describe('one account, one wallet: merging two devices', () => {
  test('coins and XP earned on both devices all count', () => {
    const base = { wallet: w({ coins: 500, xp: 100 }) };
    const phone = { wallet: w({ coins: 560, xp: 140 }) };   // won 60 on the phone
    const laptop = { wallet: w({ coins: 450, xp: 120 }) };  // spent 50, earned 20 XP on the laptop
    const m = mergeSave(base, phone, laptop).wallet as Wallet;
    expect(m.coins).toBe(510);
    expect(m.xp).toBe(160);
  });
  test('items and achievements from either device are kept', () => {
    const base = { wallet: w({ owned: ['a'], achievements: [] }) };
    const m = mergeSave(base, { wallet: w({ owned: ['a', 'b'], achievements: ['first-win' as never] }) }, { wallet: w({ owned: ['a', 'c'] }) }).wallet as Wallet;
    expect(m.owned.sort()).toEqual(['a', 'b', 'c']);
    expect(m.achievements).toEqual(['first-win' as never]);
  });
  test('only one side changed: that side wins outright', () => {
    const base = { wallet: w({ coins: 300 }), profile: { name: 'Sean' } };
    const local = { wallet: w({ coins: 300 }), profile: { name: 'Sean' } };
    const server = { wallet: w({ coins: 900 }), profile: { name: 'Seano' } };
    expect(mergeSave(base, local, server)).toEqual(server);
    expect(mergeSave(base, server, local)).toEqual(server);
  });
  test('stats add up, best finishes keep the best', () => {
    const base = { stats: { ...EMPTY_STATS, take2Played: 10, take2Wins: 2, take2BestFinish: 3 } };
    const a = { stats: { ...EMPTY_STATS, take2Played: 12, take2Wins: 3, take2BestFinish: 1 } };
    const b = { stats: { ...EMPTY_STATS, take2Played: 11, take2Wins: 2, take2BestFinish: 2 } };
    const m = mergeSave(base, a, b).stats as typeof EMPTY_STATS;
    expect(m.take2Played).toBe(13);
    expect(m.take2Wins).toBe(3);
    expect(m.take2BestFinish).toBe(1);
  });
  test('a device with its own progress joins an account without doubling the welcome coins', () => {
    const device = { wallet: w({ coins: 300 + 120, xp: 50 }), profile: { name: 'Bro' } };   // 120 won here
    const account = { wallet: w({ coins: 800, xp: 400 }), profile: { name: 'Bro' } };
    const m = mergeSave(FRESH_BASE, device, account).wallet as Wallet;
    expect(m.coins).toBe(920);
    expect(m.xp).toBe(450);
  });
  test('coins never go below zero', () => {
    const m = mergeSave({ wallet: w({ coins: 500 }) }, { wallet: w({ coins: 0 }) }, { wallet: w({ coins: 100 }) }).wallet as Wallet;
    expect(m.coins).toBe(0);
  });
  test('club record: when both played, the busier record is kept', () => {
    const club = (n: number) => ({ version: 1, players: { me: { take2: { played: n } } }, titles: {} });
    expect(mergeSave({ club: club(5) }, { club: club(9) }, { club: club(7) }).club).toEqual(club(9));
    expect(mergeSave({ club: club(5) }, { club: club(6) }, { club: club(8) }).club).toEqual(club(8));
  });
});
