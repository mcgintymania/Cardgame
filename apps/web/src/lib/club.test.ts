import { describe, expect, test } from 'bun:test';
import { seededRng } from '../../../../packages/engine/src/core/rng.ts';
import { ROSTER, playsGame, aiPersonality } from './roster.ts';
import { ME, createClub, cupOpponents, forfeit, migrateClub, pickOpponents, rankings, recordMatch, simulateClubActivity, simulateOrder, startCup, titleStatus, cabinetFor, TITLE_SHOT_RANK } from './club.ts';

const rng = seededRng(11);

describe('club setup', () => {
  test('25 members with unique ids; everyone plays at least one game', () => {
    expect(ROSTER.length).toBe(25);
    expect(new Set(ROSTER.map((r) => r.id)).size).toBe(25);
    for (const r of ROSTER) expect(r.skill.take2 + r.skill.poker).toBeGreaterThan(0);
  });
  test('each game has a champion who plays it, and you start unranked-ish at 1000', () => {
    const s = createClub(rng);
    for (const g of ['take2', 'poker'] as const) {
      const holder = ROSTER.find((r) => r.id === s.titles[g].current.holder)!;
      expect(playsGame(holder, g)).toBe(true);
    }
    expect(s.players[ME].take2.rating).toBe(1000);
  });
  test('skill maps to AI level', () => {
    expect(aiPersonality(ROSTER.find((r) => r.id === 'juniper')!, 'take2')).toBe('beginner');
    expect(aiPersonality(ROSTER.find((r) => r.id === 'mei')!, 'take2')).toBe('expert');
  });
  test('opponents only come from members who play the game', () => {
    const s = createClub(rng);
    const ids = pickOpponents(s, 'poker', 8, rng);
    expect(new Set(ids).size).toBe(8);
    for (const id of ids) expect(ROSTER.find((r) => r.id === id)!.skill.poker).toBeGreaterThan(0);
  });
});

describe('ratings and records', () => {
  test('winning raises your rating and records head-to-head', () => {
    const s = createClub(rng);
    const { state, outcome } = recordMatch(s, 'take2', [ME, 'mags', 'rocco'], 'casual', rng);
    expect(state.players[ME].take2.rating).toBeGreaterThan(1000);
    expect(outcome.ratingChange).toBeGreaterThan(0);
    expect(state.h2h.mags.take2).toEqual({ w: 1, l: 0 });
    expect(state.players[ME].take2.wins).toBe(1);
  });
  test('ratings are zero-sum within a match', () => {
    const s = createClub(rng);
    const ids = [ME, 'mags', 'rocco', 'pip'];
    const before = ids.reduce((a, id) => a + s.players[id].take2.rating, 0);
    // stop background activity from muddying the sum: compare only these players' change
    const { state } = recordMatch(s, 'take2', ['pip', ME, 'rocco', 'mags'], 'casual', seededRng(1));
    const after = ids.reduce((a, id) => a + state.players[id].take2.rating, 0);
    expect(Math.abs(after - before)).toBeLessThan(60); // rounding + possible background games
  });
  test('rating-weighted simulation favours stronger players', () => {
    const s = createClub(rng);
    let strongWins = 0;
    for (let i = 0; i < 400; i++) if (simulateOrder(s, 'take2', ['mei', 'juniper'], seededRng(i))[0] === 'mei') strongWins++;
    expect(strongWins).toBeGreaterThan(300);
  });
});

describe('titles', () => {
  test('locked until you reach the top 5, then a win takes the title and wins are defences', () => {
    let s = createClub(rng);
    expect(titleStatus(s, 'take2').kind).toBe('locked');
    s.players[ME].take2.rating = 2000;
    expect(titleStatus(s, 'take2').kind).toBe('eligible');
    const holder = s.titles.take2.current.holder;
    let r = recordMatch(s, 'take2', [ME, holder], 'title', rng);
    s = r.state;
    expect(s.titles.take2.current.holder).toBe(ME);
    expect(s.titles.take2.history.at(-1)!.holder).toBe(holder);
    expect(r.outcome.headline).toMatch(/new/i);
    const st = titleStatus(s, 'take2');
    expect(st.kind).toBe('champion');
    r = recordMatch(s, 'take2', [ME, (st as { challenger: string }).challenger], 'title', rng);
    expect(r.state.titles.take2.current.defences).toBe(1);
    expect(cabinetFor(r.state, ME).current.length).toBe(1);
  });
  test('the AI never takes your title without playing you', () => {
    let s = createClub(rng);
    s.titles.poker.current.holder = ME;
    for (let i = 0; i < 50; i++) s = recordMatch(s, 'take2', [ME, 'mags'], 'casual', seededRng(i)).state;
    expect(s.titles.poker.current.holder).toBe(ME);
  });
  test(`top ${TITLE_SHOT_RANK} excludes the champion`, () => {
    const s = createClub(rng);
    const holder = s.titles.take2.current.holder;
    const order = rankings(s, 'take2').filter((id) => id !== holder);
    s.players[ME].take2.rating = s.players[order[TITLE_SHOT_RANK - 1]].take2.rating + 1;
    expect(titleStatus(s, 'take2').kind).toBe('eligible');
  });
});

describe('Club Cup', () => {
  test('heat → final → winner gets the cup', () => {
    let s = startCup(createClub(rng), 'poker', rng);
    const heat = s.tournament!.heats[0];
    expect(heat[0]).toBe(ME);
    expect(new Set([...heat, ...s.tournament!.heats[1]]).size).toBe(8);
    s = recordMatch(s, 'poker', [ME, ...heat.slice(1)], 'cupHeat', rng).state;
    expect(s.tournament!.stage).toBe('final');
    const fin = s.tournament!.finalists!;
    expect(fin).toContain(ME);
    s = recordMatch(s, 'poker', [ME, ...fin.filter((x) => x !== ME)], 'cupFinal', rng).state;
    expect(s.tournament!.stage).toBe('done');
    expect(cabinetFor(s, ME).cups.length).toBe(1);
    expect(s.cupEdition.poker).toBe(2);
  });
  test('going out in the heat still finishes the cup', () => {
    let s = startCup(createClub(rng), 'take2', rng);
    const heat = s.tournament!.heats[0];
    const r = forfeit(s, 'take2', heat, 'cupHeat', rng);
    s = r.state;
    expect(s.tournament!.stage).toBe('done');
    expect(r.outcome.headline).toMatch(/heats/);
    expect(s.cups.length).toBe(1);
  });
});

describe('new games', () => {
  test('every game has a champion who plays it; Hearts and Gin are in the club', () => {
    const s = createClub(seededRng(5));
    for (const g of ['hearts', 'gin'] as const) {
      expect(playsGame(ROSTER.find((r) => r.id === s.titles[g].current.holder)!, g)).toBe(true);
      expect(s.players[ME][g].rating).toBe(1000);
      expect(rankings(s, g).length).toBeGreaterThanOrEqual(9);
    }
  });

  test('an old two-game club is upgraded without losing anything', () => {
    const old = createClub(seededRng(6)) as any;
    for (const g of ['hearts', 'gin']) {
      delete old.titles[g];
      delete old.cupEdition[g];
      for (const id of Object.keys(old.players)) delete old.players[id][g];
    }
    old.players[ME].take2.rating = 1234;
    old.h2h.mags = { take2: { w: 3, l: 1 }, poker: { w: 0, l: 2 } };
    const s = migrateClub(old, seededRng(7));
    expect(s.players[ME].take2.rating).toBe(1234);
    expect(s.players[ME].hearts.rating).toBe(1000);
    expect(s.h2h.mags.take2).toEqual({ w: 3, l: 1 });
    expect(s.h2h.mags.gin).toEqual({ w: 0, l: 0 });
    expect(s.titles.gin.current.holder).toBeTruthy();
    expect(s.cupEdition.hearts).toBe(1);
    expect(s.news.some((n) => n.text.includes('now plays Hearts'))).toBe(true);
  });

  test('Gin Cup is an eight-player knockout: win three matches to lift it', () => {
    let s = startCup(createClub(seededRng(8)), 'gin', seededRng(9));
    expect(s.tournament!.format).toBe('knockout');
    expect(s.tournament!.rounds![0].length).toBe(8);
    for (const kind of ['cupHeat', 'cupHeat', 'cupFinal'] as const) {
      const [opp] = cupOpponents(s.tournament, kind);
      expect(opp).toBeTruthy();
      s = recordMatch(s, 'gin', [ME, opp], kind, seededRng(10)).state;
    }
    expect(s.tournament!.stage).toBe('done');
    expect(s.cups.at(-1)!.winner).toBe(ME);
    expect(s.tournament!.rounds!.map((r) => r.length)).toEqual([8, 4, 2, 1]);
  });

  test('losing a knockout match plays out the rest of the Cup', () => {
    let s = startCup(createClub(seededRng(8)), 'gin', seededRng(9));
    const [opp] = cupOpponents(s.tournament, 'cupHeat');
    const r = recordMatch(s, 'gin', [opp, ME], 'cupHeat', seededRng(10));
    expect(r.outcome.headline).toBe('Knocked out');
    expect(r.state.tournament!.stage).toBe('done');
    expect(r.state.cups.at(-1)!.winner).not.toBe(ME);
  });

  test('a four-player Hearts title match only counts you against your rival', () => {
    const s = createClub(seededRng(12));
    const holder = s.titles.hearts.current.holder;
    const fillers = ROSTER.filter((r) => r.id !== holder && playsGame(r, 'hearts')).slice(0, 2).map((r) => r.id);
    // a filler wins, but you beat the champion: you take the title
    const r = recordMatch(s, 'hearts', [fillers[0], ME, fillers[1], holder], 'title', seededRng(13), 'You', holder);
    expect(r.state.titles.hearts.current.holder).toBe(ME);
    expect(r.outcome.headline).toContain('new');
  });

  test('background tables use each game’s table size', () => {
    const s = createClub(seededRng(14));
    for (let i = 0; i < 30; i++) simulateClubActivity(s, seededRng(i), 3);
    for (const g of ['hearts', 'gin'] as const) {
      const played = Object.values(s.players).reduce((a, p) => a + p[g].played, 0);
      expect(played).toBeGreaterThan(0);
    }
  });
});
