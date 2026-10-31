// The club: ratings, results, defended titles, the Club Cup, head-to-head records
// and a news feed. Pure functions over a ClubState so they're easy to test and,
// later, to run on the server for online play.

import type { Rng } from '../../../../packages/engine/src/core/rng.ts';
import { GAMES, GAME_NAMES, ROSTER, TABLE_SIZE, isHeadsUpGame, perGame, playsGame, rosterById, type GameId } from './roster.ts';

export const ME = 'me';
export const TITLE_SHOT_RANK = 5;
const K = 32;
const K_TITLE = 40;

export interface GameStats {
  rating: number;
  peak: number;
  played: number;
  wins: number;
  podiums: number;
}

export interface Reign {
  holder: string;
  won: string;          // ISO date
  lost: string | null;
  defences: number;
  wonFrom: string | null;
}

export interface TitleState {
  current: Reign;
  history: Reign[];     // finished reigns, newest last
}

export interface CupWin {
  game: GameId;
  edition: number;
  winner: string;
  runnerUp: string;
  date: string;
}

export interface NewsItem {
  id: number;
  date: string;
  game: GameId | null;
  kind: 'title' | 'cup' | 'result' | 'club';
  text: string;
  involvesMe: boolean;
}

export interface Tournament {
  game: GameId;
  edition: number;
  /** 'heats' (default): two heats of four, top two to a final of four. 'knockout': eight players, one on one. */
  format?: 'heats' | 'knockout';
  /** Knockout only: the players left in each round, in bracket order (pairs). rounds[0] has all eight. */
  rounds?: string[][];
  heats: [string[], string[]];     // heat 0 always has you in it
  heatResults: [string[] | null, string[] | null];
  finalists: string[] | null;
  finalResult: string[] | null;
  stage: 'heat' | 'final' | 'done';
}

export interface HeadToHead { w: number; l: number }

export interface ClubState {
  version: 1;
  players: Record<string, Record<GameId, GameStats>>;
  titles: Record<GameId, TitleState>;
  cups: CupWin[];
  cupEdition: Record<GameId, number>;
  h2h: Record<string, Record<GameId, HeadToHead>>;
  news: NewsItem[];
  tournament: Tournament | null;
  nextNewsId: number;
}

export type MatchKind = 'casual' | 'title' | 'cupHeat' | 'cupFinal';

export interface Outcome {
  headline: string;
  lines: string[];
  tone: 'good' | 'bad' | 'info';
  ratingChange: number;
  /** You finished first (used to trigger your win celebration). */
  won?: boolean;
}

// ------------------------------------------------------------------ helpers

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
export const nameOf = (id: string, myName = 'You') => (id === ME ? myName : rosterById(id)?.name ?? id);
const first = (id: string, myName = 'You') => nameOf(id, myName).split(' ')[0];
const blankStats = (rating: number): GameStats => ({ rating, peak: rating, played: 0, wins: 0, podiums: 0 });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function startingRating(skill: number): number {
  return Math.round(1000 + (skill - 50) * 8);
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T {
  const ws = items.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rng.float() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function shuffled<T>(xs: T[], rng: Rng): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function news(s: ClubState, game: GameId | null, kind: NewsItem['kind'], text: string, ids: string[]) {
  s.news.unshift({ id: s.nextNewsId++, date: now(), game, kind, text, involvesMe: ids.includes(ME) });
  if (s.news.length > 40) s.news.length = 40;
}

// -------------------------------------------------------------------- setup

function memberStats(c: (typeof ROSTER)[number], g: GameId, rng: Rng): GameStats {
  const st = blankStats(playsGame(c, g) ? startingRating(c.skill[g]) : 0);
  // a little history so the club feels lived-in
  if (playsGame(c, g)) {
    st.played = 5 + rng.int(40);
    st.wins = Math.round(st.played * Math.min(0.6, Math.max(0.05, (c.skill[g] - 20) / 120)));
    st.podiums = Math.min(st.played, st.wins + rng.int(Math.max(1, st.played - st.wins)));
  }
  return st;
}

function firstChampion(g: GameId, rng: Rng): TitleState {
  const champ = ROSTER.filter((c) => playsGame(c, g)).sort((a, b) => b.skill[g] - a.skill[g])[0];
  return { current: { holder: champ.id, won: daysAgo(20 + rng.int(60)), lost: null, defences: 1 + rng.int(5), wonFrom: null }, history: [] };
}

export function createClub(rng: Rng): ClubState {
  const players: ClubState['players'] = {};
  for (const c of ROSTER) players[c.id] = perGame((g) => memberStats(c, g, rng));
  players[ME] = perGame(() => blankStats(1000));
  const titles = perGame((g) => firstChampion(g, rng));
  const s: ClubState = {
    version: 1, players, titles, cups: [], cupEdition: perGame(() => 1), h2h: {}, news: [], tournament: null, nextNewsId: 1,
  };
  news(s, null, 'club', 'Welcome to the club. Win matches to climb the rankings and earn a title shot.', []);
  for (const g of GAMES) news(s, g, 'title', `${nameOf(titles[g].current.holder)} holds the ${titleName(g)}.`, []);
  return s;
}

/** Brings a saved club up to date when new games arrive. Keeps all your history. */
export function migrateClub(saved: ClubState, rng: Rng): ClubState {
  const s = clone(saved);
  const added: GameId[] = [];
  for (const g of GAMES) {
    if (s.titles[g]) continue;
    added.push(g);
    s.titles[g] = firstChampion(g, rng);
    s.cupEdition[g] = 1;
  }
  for (const c of ROSTER) {
    s.players[c.id] ??= perGame((g) => memberStats(c, g, rng));
    for (const g of GAMES) s.players[c.id][g] ??= memberStats(c, g, rng);
  }
  s.players[ME] ??= perGame(() => blankStats(1000));
  for (const g of GAMES) s.players[ME][g] ??= blankStats(1000);
  for (const rec of Object.values(s.h2h)) for (const g of GAMES) rec[g] ??= { w: 0, l: 0 };
  for (const g of added) {
    news(s, g, 'club', `The club now plays ${GAME_NAMES[g]}. ${nameOf(s.titles[g].current.holder)} holds the ${titleName(g)}.`, []);
  }
  return s;
}

const TITLE_NAMES: Record<GameId, string> = { take2: 'Take 2 Title', poker: "Hold'em Crown", hearts: 'Hearts Title', gin: 'Gin Rummy Belt', draw: 'Draw Poker Crown', blackjack: 'Blackjack Title' };
export const titleName = (g: GameId) => TITLE_NAMES[g];
export const cupName = (g: GameId) => `${GAME_NAMES[g]} Club Cup`;

// ----------------------------------------------------------------- rankings

export function rankings(s: ClubState, game: GameId): string[] {
  const ids = Object.keys(s.players).filter((id) => id === ME || (rosterById(id) && playsGame(rosterById(id)!, game)));
  return ids.sort((a, b) => s.players[b][game].rating - s.players[a][game].rating);
}

export function rankOf(s: ClubState, game: GameId, id: string): number {
  return rankings(s, game).indexOf(id) + 1;
}

export type TitleStatus =
  | { kind: 'champion'; challenger: string }
  | { kind: 'eligible'; holder: string }
  | { kind: 'locked'; holder: string; myRank: number; needed: number };

export function titleStatus(s: ClubState, game: GameId): TitleStatus {
  const holder = s.titles[game].current.holder;
  if (holder === ME) {
    const challenger = rankings(s, game).find((id) => id !== ME)!;
    return { kind: 'champion', challenger };
  }
  const contenders = rankings(s, game).filter((id) => id !== holder);
  const myRank = contenders.indexOf(ME) + 1;
  return myRank <= TITLE_SHOT_RANK ? { kind: 'eligible', holder } : { kind: 'locked', holder, myRank, needed: TITLE_SHOT_RANK };
}

/** Opponents for a table, chosen from members who play the game, leaning towards your level. */
export function pickOpponents(s: ClubState, game: GameId, count: number, rng: Rng, exclude: string[] = []): string[] {
  const mine = s.players[ME][game].rating;
  let pool = ROSTER.filter((c) => playsGame(c, game) && !exclude.includes(c.id)).map((c) => c.id);
  const out: string[] = [];
  while (out.length < count && pool.length) {
    const id = pickWeighted(pool, (x) => 0.35 + Math.exp(-Math.abs(s.players[x][game].rating - mine) / 180), rng);
    out.push(id);
    pool = pool.filter((x) => x !== id);
  }
  return out;
}

/** Finishing order for players whose match we don't play out, weighted by rating. */
export function simulateOrder(s: ClubState, game: GameId, ids: string[], rng: Rng): string[] {
  const left = ids.slice();
  const out: string[] = [];
  while (left.length) {
    const id = pickWeighted(left, (x) => 10 ** (s.players[x][game].rating / 400), rng);
    out.push(id);
    left.splice(left.indexOf(id), 1);
  }
  return out;
}

// ------------------------------------------------------------------ results

/** Updates ratings and records for a finished match. placements: best first. Returns your rating change. */
function applyResult(s: ClubState, game: GameId, placements: string[], k: number): Record<string, number> {
  const n = placements.length;
  const delta: Record<string, number> = Object.fromEntries(placements.map((id) => [id, 0]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = placements[i];
      const b = placements[j];
      const ra = s.players[a][game].rating;
      const rb = s.players[b][game].rating;
      const expectA = 1 / (1 + 10 ** ((rb - ra) / 400));
      const d = (k / (n - 1)) * (1 - expectA);
      delta[a] += d;
      delta[b] -= d;
    }
  }
  placements.forEach((id, i) => {
    const st = s.players[id][game];
    st.rating = Math.round(st.rating + delta[id]);
    st.peak = Math.max(st.peak, st.rating);
    st.played++;
    if (i === 0) st.wins++;
    if (i < Math.min(3, n - 1) || i === 0) st.podiums++;
  });
  // head-to-head: you against everyone you shared a table with
  const me = placements.indexOf(ME);
  if (me >= 0) {
    placements.forEach((id, i) => {
      if (id === ME) return;
      s.h2h[id] ??= perGame(() => ({ w: 0, l: 0 }));
      s.h2h[id][game] ??= { w: 0, l: 0 };
      if (me < i) s.h2h[id][game].w++;
      else s.h2h[id][game].l++;
    });
  }
  return delta;
}

function resolveTitle(s: ClubState, game: GameId, winner: string, loser: string): { changed: boolean } {
  const t = s.titles[game];
  if (winner === t.current.holder) {
    t.current.defences++;
    news(s, game, 'title', `${nameOf(winner)} defends the ${titleName(game)} against ${nameOf(loser)} (${ordinal(t.current.defences)} defence).`, [winner, loser]);
    return { changed: false };
  }
  t.current.lost = now();
  t.history.push(t.current);
  t.current = { holder: winner, won: now(), lost: null, defences: 0, wonFrom: loser };
  news(s, game, 'title', `New champion! ${nameOf(winner)} takes the ${titleName(game)} from ${nameOf(loser)}.`, [winner, loser]);
  return { changed: true };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Other members play while you're away: a couple of results, sometimes a title match. */
export function simulateClubActivity(s: ClubState, rng: Rng, matches = 2): void {
  for (let m = 0; m < matches; m++) {
    const game = GAMES[rng.int(GAMES.length)];
    const pool = ROSTER.filter((c) => playsGame(c, game)).map((c) => c.id);
    const [lo, hi] = TABLE_SIZE[game];
    const size = Math.max(2, Math.min(hi, lo === hi ? lo : 3 + rng.int(3)));
    const table = shuffled(pool, rng).slice(0, size);
    const order = simulateOrder(s, game, table, rng);
    const before = rankings(s, game)[0];
    applyResult(s, game, order, K);
    const top = rankings(s, game)[0];
    if (top !== before && top !== ME) news(s, game, 'result', `${nameOf(top)} climbs to number 1 in the ${GAME_NAMES[game]} rankings.`, [top]);
  }
  for (const game of GAMES) {
    const holder = s.titles[game].current.holder;
    if (holder === ME || rng.float() > 0.12) continue;
    const challenger = rankings(s, game).find((id) => id !== holder && id !== ME)!;
    const order = simulateOrder(s, game, [holder, challenger], rng);
    applyResult(s, game, order, K_TITLE);
    resolveTitle(s, game, order[0], order[1]);
  }
}

/**
 * Record one of your matches. Returns the updated state and what to tell you.
 * placements: everyone at the table, best first.
 */
export function recordMatch(state: ClubState, game: GameId, placements: string[], kind: MatchKind, rng: Rng, myName = 'You', rival?: string): { state: ClubState; outcome: Outcome } {
  const s = clone(state);
  const k = kind === 'title' ? K_TITLE : K;
  const myRankBefore = rankOf(s, game, ME);
  const statusBefore = titleStatus(s, game);
  const delta = applyResult(s, game, placements, k);
  const myPlace = placements.indexOf(ME) + 1;
  const myDelta = Math.round(delta[ME] ?? 0);
  const rankNow = rankOf(s, game, ME);
  const lines: string[] = [];
  let headline = myPlace === 1 ? 'You won!' : `You finished ${ordinal(myPlace)}`;
  let tone: Outcome['tone'] = myPlace === 1 ? 'good' : 'info';
  lines.push(`Rating ${myDelta >= 0 ? '+' : ''}${myDelta} → ${s.players[ME][game].rating} · ranked ${ordinal(rankNow)} of ${rankings(s, game).length}${rankNow < myRankBefore ? ' (up)' : rankNow > myRankBefore ? ' (down)' : ''}`);

  if (kind === 'title') {
    // Four-player games bring two extra players to a title match; only you and your rival count.
    const other = rival ?? placements.find((id) => id !== ME)!;
    const pair = placements.filter((id) => id === ME || id === other);
    const wasMine = s.titles[game].current.holder === ME;
    const { changed } = resolveTitle(s, game, pair[0], pair[1]);
    const iWon = pair[0] === ME;
    if (iWon && changed) { headline = `You're the new ${titleName(game)} holder!`; tone = 'good'; lines.unshift(`You beat ${first(other, myName)} to take the title.`); }
    else if (iWon) { headline = 'Title defended!'; tone = 'good'; lines.unshift(`That's defence number ${s.titles[game].current.defences}.`); }
    else if (wasMine) { headline = 'You lost your title'; tone = 'bad'; lines.unshift(`${nameOf(other)} is the new champion. Climb back into the top ${TITLE_SHOT_RANK} for a rematch.`); }
    else { headline = 'Title shot missed'; tone = 'bad'; lines.unshift(`${nameOf(other)} keeps the title.`); }
  }

  if (kind === 'cupHeat' && s.tournament?.format === 'knockout') {
    const r = knockoutRound(s, game, placements, rng);
    headline = r.headline; tone = r.tone; lines.unshift(...r.lines);
  } else if ((kind === 'cupHeat' || kind === 'cupFinal') && s.tournament) {
    const t = s.tournament;
    if (kind === 'cupHeat') {
      t.heatResults[0] = placements;
      const other = simulateOrder(s, game, t.heats[1], rng);
      applyResult(s, game, other, K);
      t.heatResults[1] = other;
      t.finalists = [placements[0], placements[1], other[0], other[1]];
      if (t.finalists.includes(ME)) {
        t.stage = 'final';
        headline = 'Through to the final!';
        tone = 'good';
        lines.unshift(`${first(other[0])} and ${first(other[1])} came through the other heat.`);
      } else {
        const fin = simulateOrder(s, game, t.finalists, rng);
        applyResult(s, game, fin, K);
        finishCup(s, fin);
        headline = 'Out in the heats';
        tone = 'bad';
        lines.unshift(`${nameOf(fin[0])} went on to win the ${cupName(game)}.`);
      }
    } else {
      if (t.format === 'knockout') t.rounds!.push([placements[0]]);
      finishCup(s, placements);
      headline = myPlace === 1 ? `You win the ${cupName(game)}!` : `${nameOf(placements[0])} wins the Cup`;
      tone = myPlace === 1 ? 'good' : 'info';
      if (myPlace !== 1) lines.unshift(`You finished ${ordinal(myPlace)} in the final.`);
    }
  }

  if (kind === 'casual' && myPlace === 1) news(s, game, 'result', `${myName} wins a ${GAME_NAMES[game]} table ahead of ${first(placements[1])}.`, [ME]);
  if (statusBefore.kind === 'locked' && titleStatus(s, game).kind === 'eligible') {
    lines.push(`You've earned a shot at the ${titleName(game)}!`);
    news(s, game, 'title', `${myName} breaks into the top ${TITLE_SHOT_RANK} and earns a ${titleName(game)} shot.`, [ME]);
  }
  simulateClubActivity(s, rng, 2);
  return { state: s, outcome: { headline, lines, tone, ratingChange: myDelta } };
}

function finishCup(s: ClubState, finalOrder: string[]) {
  const t = s.tournament!;
  t.finalResult = finalOrder;
  t.stage = 'done';
  s.cups.push({ game: t.game, edition: t.edition, winner: finalOrder[0], runnerUp: finalOrder[1], date: now() });
  s.cupEdition[t.game] = t.edition + 1;
  news(s, t.game, 'cup', `${nameOf(finalOrder[0])} wins the ${cupName(t.game)} (edition ${t.edition}), beating ${nameOf(finalOrder[1])} in the final.`, finalOrder.slice(0, 2));
}

export const KNOCKOUT_ROUND: Record<number, string> = { 8: 'Quarter-final', 4: 'Semi-final', 2: 'Final' };

/** Your opponents for the next Cup match. */
export function cupOpponents(t: Tournament | null, kind: 'cupHeat' | 'cupFinal'): string[] {
  if (!t || t.stage === 'done') return [];
  if (t.format === 'knockout') {
    const round = t.rounds![t.rounds!.length - 1];
    const i = round.indexOf(ME);
    return i < 0 ? [] : [round[i ^ 1]];
  }
  return (kind === 'cupHeat' ? t.heats[0] : t.finalists ?? []).filter((id) => id !== ME);
}

/** Plays out one knockout round after your match, and the rest of the Cup if you're out. */
function knockoutRound(s: ClubState, game: GameId, placements: string[], rng: Rng): { headline: string; tone: Outcome['tone']; lines: string[] } {
  const t = s.tournament!;
  const playRound = (round: string[], mine?: string[]) => {
    const winners: string[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const pair = [round[i], round[i + 1]];
      if (mine && pair.includes(ME)) { winners.push(mine[0]); continue; }
      const order = simulateOrder(s, game, pair, rng);
      applyResult(s, game, order, K);
      winners.push(order[0]);
    }
    return winners;
  };
  let next = playRound(t.rounds![t.rounds!.length - 1], placements);
  t.rounds!.push(next);
  if (next.includes(ME)) {
    if (next.length === 2) {
      t.stage = 'final';
      t.finalists = next;
      return { headline: 'Through to the final!', tone: 'good', lines: [`${first(next.find((id) => id !== ME)!)} is waiting in the final.`] };
    }
    const opp = next[next.indexOf(ME) ^ 1];
    return { headline: `Through to the ${KNOCKOUT_ROUND[next.length].toLowerCase()}!`, tone: 'good', lines: [`Next up: ${nameOf(opp)}.`] };
  }
  while (next.length > 2) { next = playRound(next); t.rounds!.push(next); }
  t.finalists = next;
  const fin = simulateOrder(s, game, next, rng);
  applyResult(s, game, fin, K);
  t.rounds!.push([fin[0]]);
  finishCup(s, fin);
  const beat = placements[0];
  return { headline: 'Knocked out', tone: 'bad', lines: [`${nameOf(beat)} knocked you out. ${nameOf(fin[0])} went on to win the ${cupName(game)}.`] };
}

export function startCup(state: ClubState, game: GameId, rng: Rng): ClubState {
  const s = clone(state);
  const others = shuffled(ROSTER.filter((c) => playsGame(c, game)).map((c) => c.id), rng).slice(0, 7);
  if (isHeadsUpGame(game)) {
    s.tournament = {
      game, edition: s.cupEdition[game], format: 'knockout', rounds: [[ME, ...others]],
      heats: [[], []], heatResults: [null, null], finalists: null, finalResult: null, stage: 'heat',
    };
    return s;
  }
  s.tournament = {
    game, edition: s.cupEdition[game],
    heats: [[ME, ...others.slice(0, 3)], others.slice(3, 7)],
    heatResults: [null, null], finalists: null, finalResult: null, stage: 'heat',
  };
  return s;
}

/** Leaving a cup or title match counts as finishing last. */
export function forfeit(state: ClubState, game: GameId, table: string[], kind: MatchKind, rng: Rng, myName = 'You', rival?: string) {
  const others = simulateOrder(state, game, table.filter((id) => id !== ME), rng);
  return recordMatch(state, game, [...others, ME], kind, rng, myName, rival);
}

// ----------------------------------------------------------------- trophies

export interface Cabinet {
  current: Array<{ game: GameId; reign: Reign }>;
  past: Array<{ game: GameId; reign: Reign }>;
  cups: CupWin[];
  runnerUps: number;
}

export function cabinetFor(s: ClubState, id: string): Cabinet {
  const current: Cabinet['current'] = [];
  const past: Cabinet['past'] = [];
  for (const g of GAMES) {
    if (s.titles[g].current.holder === id) current.push({ game: g, reign: s.titles[g].current });
    for (const r of s.titles[g].history) if (r.holder === id) past.push({ game: g, reign: r });
  }
  return {
    current,
    past: past.reverse(),
    cups: s.cups.filter((c) => c.winner === id).reverse(),
    runnerUps: s.cups.filter((c) => c.runnerUp === id).length,
  };
}

export function rivals(s: ClubState): Array<{ id: string; game: GameId; w: number; l: number }> {
  const out: Array<{ id: string; game: GameId; w: number; l: number }> = [];
  for (const [id, rec] of Object.entries(s.h2h)) for (const g of GAMES) if (rec[g] && rec[g].w + rec[g].l > 0) out.push({ id, game: g, ...rec[g] });
  return out.sort((a, b) => b.w + b.l - (a.w + a.l));
}
