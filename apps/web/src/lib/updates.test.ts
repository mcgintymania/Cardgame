// Guards that keep updates from hurting players' saves.
import { describe, expect, test } from 'bun:test';
import released from './released-ids.json';
import { ACHIEVEMENTS, CATALOGUE } from './catalogue.ts';
import { KEYS } from './store.ts';

describe('updates never take things away from players', () => {
  test('every released item still exists (players may own it)', () => {
    const ids = new Set(CATALOGUE.map((i) => i.id));
    const gone = released.items.filter((id: string) => !ids.has(id));
    expect(gone).toEqual([]);
  });
  test('every released achievement still exists', () => {
    const gone = released.achievements.filter((k: string) => !(k in ACHIEVEMENTS));
    expect(gone).toEqual([]);
  });
  test('saved-data names never change (a new name would look like an empty save)', () => {
    expect(KEYS).toEqual({
      profile: 'cardclub.profile.v1', settings: 'cardclub.settings.v1', stats: 'cardclub.stats.v1',
      take2Rules: 'cardclub.take2rules.v1', take2Table: 'cardclub.take2table.v1', pokerTable: 'cardclub.pokertable.v1',
      club: 'cardclub.club.v1', heartsRules: 'cardclub.heartsrules.v1', ginRules: 'cardclub.ginrules.v1',
      bjRules: 'cardclub.bjrules.v1', solitaire: 'cardclub.solitaire.v1', pyramid: 'cardclub.pyramid.v1',
      wallet: 'cardclub.wallet.v1',
    });
  });
});
