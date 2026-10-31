// Coins, XP, levels, membership tiers, owned items and unlocks.
// LOCAL MODE: stored on this device. When accounts arrive this moves to the server
// (coins must be server-held to mean anything), with the same rules.

import { ACHIEVEMENTS, BOOSTS, BUNDLES, BUNDLE_DISCOUNT, CASES, CATALOGUE, PLAY_GAMES, PLAY_GAME_NAMES, STARTER_IDS, TIERS, getItem, type AchievementKey, type BoostKind, type FeatKey, type Item, type PlayGame, type Rarity, type TableSlot, type TierId } from './catalogue.ts';
import { GAMES } from './roster.ts';
import { ME, cabinetFor, type ClubState, type MatchKind } from './club.ts';

export const START_COINS = 300;
export const DAILY_WIN_BONUS = 50;

export interface LedgerEntry { date: string; amount: number; reason: string; balance: number }

export interface Wallet {
  version: 1;
  coins: number;
  xp: number;
  owned: string[];
  table: Record<TableSlot, string>;
  ledger: LedgerEntry[];
  lastDailyWin: string | null;
  achievements: AchievementKey[];
  /** Active boosts: when each one runs out (ISO time). */
  boosts: Partial<Record<BoostKind, string>>;
  /** The Daily Cut: last day claimed (YYYY-MM-DD, local) and the run of days in a row. */
  daily: { last: string | null; streak: number };
  /** Seasonal gifts already claimed, as 'season-year' keys. */
  seasonGifts?: string[];
  /** Solitaire and Pyramid games played and won (club games are in the club record). */
  solo?: Partial<Record<'solitaire' | 'pyramid', { played: number; won: number }>>;
  /** Wins in a row across every game. */
  streak?: { cur: number; best: number };
}

export function createWallet(): Wallet {
  return {
    version: 1,
    coins: START_COINS,
    xp: 0,
    owned: [...STARTER_IDS],
    table: { felt: 'felt-green', wood: 'wood-walnut', cardback: 'back-oxblood', celebration: 'cel-confetti', prop: 'prop-coffee' },
    ledger: [{ date: new Date().toISOString(), amount: START_COINS, reason: 'Welcome to the club', balance: START_COINS }],
    lastDailyWin: null,
    achievements: [],
    boosts: {},
    daily: { last: null, streak: 0 },
  };
}

// ------------------------------------------------------------------ levels

/** XP needed to go from level n to n + 1. */
export const xpForLevel = (n: number) => 100 + 40 * (n - 1);

export function levelInfo(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = xp;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  return { level, into: left, need: xpForLevel(level) };
}

export function tierFor(level: number): (typeof TIERS)[number] {
  return [...TIERS].reverse().find((t) => level >= t.level) ?? TIERS[0];
}

export const tierRank = (t: TierId) => TIERS.findIndex((x) => x.id === t);

// ----------------------------------------------------------------- rewards

export interface RewardInput {
  placements: string[];
  kind: MatchKind;
  titleWon: boolean;
  titleDefended: boolean;
  cupFinalReached: boolean;
  cupWon: boolean;
}

export interface Reward { coins: number; xp: number; lines: string[] }

export function rewardFor(r: RewardInput, w: Wallet, now = new Date()): Reward {
  const n = r.placements.length;
  const place = r.placements.indexOf(ME) + 1;
  const beaten = n - place;
  let coins = 10 + beaten * 8;
  let xp = 20 + beaten * 10;
  const lines: string[] = [];
  if (r.titleWon) { coins += 150; xp += 120; lines.push('Title won: +150 coins'); }
  if (r.titleDefended) { coins += 100; xp += 80; lines.push('Title defended: +100 coins'); }
  if (r.cupFinalReached) { coins += 40; xp += 30; }
  if (r.cupWon) { coins += 250; xp += 150; lines.push('Club Cup: +250 coins'); }
  const today = now.toISOString().slice(0, 10);
  if (place === 1 && w.lastDailyWin !== today) { coins += DAILY_WIN_BONUS; lines.push(`First win today: +${DAILY_WIN_BONUS} coins`); }
  return { coins, xp, lines };
}

function addLedger(w: Wallet, amount: number, reason: string): Wallet {
  const coins = Math.max(0, w.coins + amount);
  const ledger = [{ date: new Date().toISOString(), amount, reason, balance: coins }, ...w.ledger].slice(0, 80);
  return { ...w, coins, ledger };
}

/** Milliseconds left on a boost (0 if none). */
export function boostLeft(w: Wallet, kind: BoostKind, now = Date.now()): number {
  const until = w.boosts?.[kind];
  return until ? Math.max(0, new Date(until).getTime() - now) : 0;
}

/** Adds coins and XP (boosts applied) and records it. Returns what was actually paid. */
export function applyReward(w: Wallet, reward: Reward, reason: string, won: boolean, now = new Date()): { wallet: Wallet; levelUp: number | null; coins: number; xp: number; boosted: string[] } {
  const before = levelInfo(w.xp).level;
  const boosted: string[] = [];
  let coins = reward.coins;
  let xp = reward.xp;
  if (boostLeft(w, 'coins', now.getTime()) > 0 && coins > 0) { coins = Math.round(coins * 1.5); boosted.push('coin boost'); }
  if (boostLeft(w, 'xp', now.getTime()) > 0 && xp > 0) { xp *= 2; boosted.push('double XP'); }
  let next = addLedger(w, coins, reason + (boosted.length ? ` (${boosted.join(', ')})` : ''));
  next = { ...next, xp: w.xp + xp, lastDailyWin: won ? now.toISOString().slice(0, 10) : w.lastDailyWin };
  const after = levelInfo(next.xp).level;
  return { wallet: next, levelUp: after > before ? after : null, coins, xp, boosted };
}

// ------------------------------------------------------------- boosts & shop extras

export function buyBoost(w: Wallet, id: string, now = Date.now()): { wallet: Wallet } | { error: string } {
  const b = BOOSTS.find((x) => x.id === id);
  if (!b) return { error: 'That boost no longer exists.' };
  if (w.coins < b.price) return { error: `You need ${b.price - w.coins} more coins.` };
  // Buying again adds time on top of what's left.
  const from = Math.max(now, now + boostLeft(w, b.kind, now));
  const next = addLedger(w, -b.price, `Boost: ${b.name}`);
  return { wallet: { ...next, boosts: { ...(w.boosts ?? {}), [b.kind]: new Date(from + b.hours * 3600000).toISOString() } } };
}

/** Price of a bundle for this wallet: a quarter off the items you don't own. Null if you own them all. */
export function bundlePrice(w: Wallet, bundleId: string, club: ClubState): { price: number; full: number; items: Item[]; missing: Item[] } | null {
  const b = BUNDLES.find((x) => x.id === bundleId);
  if (!b) return null;
  const items = b.items.map((id) => getItem(id)!).filter(Boolean);
  const missing = items.filter((i) => itemState(i, w, club).kind === 'buy');
  if (!missing.length) return null;
  const full = missing.reduce((a, i) => a + (i.unlock.kind === 'shop' ? i.unlock.price : 0), 0);
  return { price: Math.round((full * (1 - BUNDLE_DISCOUNT)) / 10) * 10, full, items, missing };
}

export function buyBundle(w: Wallet, bundleId: string, club: ClubState): { wallet: Wallet; got: Item[] } | { error: string } {
  const p = bundlePrice(w, bundleId, club);
  if (!p) return { error: 'You already own everything in this bundle.' };
  if (w.coins < p.price) return { error: `You need ${p.price - w.coins} more coins.` };
  const name = BUNDLES.find((x) => x.id === bundleId)!.name;
  const next = addLedger(w, -p.price, `Bundle: ${name}`);
  return { wallet: { ...next, owned: [...next.owned, ...p.missing.map((i) => i.id)] }, got: p.missing };
}

/** Items a mystery case can give you: shop items you could buy but don't own yet. */
export function casePool(w: Wallet, club: ClubState): Item[] {
  return CATALOGUE.filter((i) => i.unlock.kind === 'shop' && i.unlock.price > 0 && itemState(i, w, club).kind === 'buy');
}

/** Opens a case. Odds are fixed and shown in the shop; you never get something you already own. */
export function openCase(w: Wallet, caseId: string, club: ClubState, roll: () => number): { wallet: Wallet; item: Item } | { error: string } {
  const c = CASES.find((x) => x.id === caseId);
  if (!c) return { error: 'That case no longer exists.' };
  if (w.coins < c.price) return { error: `You need ${c.price - w.coins} more coins.` };
  const pool = casePool(w, club);
  if (!pool.length) return { error: 'You already own everything a case could give you.' };
  const order: Rarity[] = ['legendary', 'epic', 'rare', 'common'];
  let r = roll() * 100;
  let rarity: Rarity = 'common';
  for (const k of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) { r -= c.odds[k]; if (r < 0) { rarity = k; break; } }
  // If you own every item of that rarity, step down (then up) to the nearest one you don't.
  const tryOrder = [rarity, ...order.slice(order.indexOf(rarity) + 1), ...order.slice(0, order.indexOf(rarity)).reverse()];
  const bucket = tryOrder.map((k) => pool.filter((i) => i.rarity === k)).find((b) => b.length)!;
  const item = bucket[Math.floor(roll() * bucket.length)];
  const next = addLedger(w, -c.price, `${c.name}: ${item.name}`);
  return { wallet: { ...next, owned: [...next.owned, item.id] }, item };
}

// ---------------------------------------------------------------- the Daily Cut
export const DAILY_CUT = [50, 75, 100, 125, 150, 200, 300];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function dailyStatus(w: Wallet, now = new Date()): { ready: boolean; streak: number; next: number; msToNext: number } {
  const today = dayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const last = w.daily?.last ?? null;
  const running = last === dayKey(y) || last === today ? w.daily.streak : 0;
  const ready = last !== today;
  const day = ready ? running % 7 : (running - 1) % 7;
  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  return { ready, streak: running, next: DAILY_CUT[ready ? day : running % 7], msToNext: ready ? 0 : midnight.getTime() - now.getTime() };
}

export function claimDaily(w: Wallet, now = new Date()): { wallet: Wallet; coins: number; day: number } | { error: string } {
  const st = dailyStatus(w, now);
  if (!st.ready) return { error: 'Come back tomorrow for your next cut.' };
  const day = st.streak % 7;
  const coins = DAILY_CUT[day];
  const next = addLedger(w, coins, `Daily Cut (day ${day + 1})`);
  return { wallet: { ...next, daily: { last: dayKey(now), streak: st.streak + 1 } }, coins, day: day + 1 };
}

// ---------------------------------------------------------------- unlocking

export type ItemState =
  | { kind: 'owned' }
  | { kind: 'buy'; price: number }
  | { kind: 'locked'; reason: string; progress?: [number, number] };

export function achievementsMet(club: ClubState, w: Wallet): AchievementKey[] {
  const cab = cabinetFor(club, ME);
  const reigns = [...cab.current, ...cab.past];
  const wins = GAMES.reduce((a, g) => a + club.players[ME][g].wins, 0);
  const beatCount = Object.values(club.h2h).filter((r) => GAMES.some((g) => r[g].w > 0)).length;
  const out = new Set<AchievementKey>(w.achievements);
  if (wins > 0) out.add('firstWin');
  if (cab.cups.length > 0) out.add('cupWinner');
  if (reigns.length > 0) out.add('titleWinner');
  if (cab.cups.length > 0 || reigns.length > 0) out.add('champion');
  if (cab.cups.length >= 3) out.add('cups3');
  if (reigns.some((r) => r.reign.defences >= 3)) out.add('defences3');
  if (beatCount >= 10) out.add('beat10');
  if ((w.streak?.best ?? 0) >= 3) out.add('streak3');
  const act = activityOf(club, w);
  if (PLAY_GAMES.every((g) => act.played[g] > 0)) out.add('allRounder');
  return [...out];
}

export function winsAgainst(club: ClubState, member: string): number {
  const r = club.h2h[member];
  return r ? GAMES.reduce((a, g) => a + r[g].w, 0) : 0;
}

export function itemState(item: Item, w: Wallet, club: ClubState): ItemState {
  if (w.owned.includes(item.id)) return { kind: 'owned' };
  const level = levelInfo(w.xp).level;
  const u = item.unlock;
  switch (u.kind) {
    case 'starter': return { kind: 'owned' };
    case 'shop': {
      if (u.tier && tierRank(tierFor(level).id) < tierRank(u.tier)) {
        const t = TIERS.find((x) => x.id === u.tier)!;
        return { kind: 'locked', reason: `${t.name} (level ${t.level})`, progress: [level, t.level] };
      }
      return { kind: 'buy', price: u.price };
    }
    case 'level': return { kind: 'locked', reason: `Reach level ${u.level}`, progress: [level, u.level] };
    case 'signature': return { kind: 'locked', reason: `Beat ${u.member === 'ines' ? 'Inés' : u.member[0].toUpperCase() + u.member.slice(1)} ${u.wins} times`, progress: [winsAgainst(club, u.member), u.wins] };
    case 'achievement': return { kind: 'locked', reason: `${ACHIEVEMENTS[u.key].name}: ${ACHIEVEMENTS[u.key].how.replace(/\.$/, '')}` };
    case 'play': {
      const a = activityOf(club, w);
      const n = u.game ? a.played[u.game] : a.total;
      return { kind: 'locked', reason: `Play ${u.count} ${u.game ? `${PLAY_GAME_NAMES[u.game]} ` : ''}games`, progress: [n, u.count] };
    }
    case 'win': {
      const a = activityOf(club, w);
      const n = u.game ? a.won[u.game] : a.wins;
      return { kind: 'locked', reason: `Win ${u.count} ${u.game ? `${PLAY_GAME_NAMES[u.game]} ` : ''}${u.count === 1 ? 'game' : 'games'}`, progress: [n, u.count] };
    }
  }
}

// ---------------------------------------------------------------- activity
export type SoloGame = 'solitaire' | 'pyramid';

/** Games played and won, per game and in total (club games come from the club record). */
export function activityOf(club: ClubState, w: Wallet): { played: Record<PlayGame, number>; won: Record<PlayGame, number>; total: number; wins: number } {
  const played = {} as Record<PlayGame, number>;
  const won = {} as Record<PlayGame, number>;
  for (const g of GAMES) { played[g] = club.players[ME]?.[g]?.played ?? 0; won[g] = club.players[ME]?.[g]?.wins ?? 0; }
  for (const g of ['solitaire', 'pyramid'] as SoloGame[]) { played[g] = w.solo?.[g]?.played ?? 0; won[g] = w.solo?.[g]?.won ?? 0; }
  const total = PLAY_GAMES.reduce((a, g) => a + played[g], 0);
  const wins = PLAY_GAMES.reduce((a, g) => a + won[g], 0);
  return { played, won, total, wins };
}

/** Win streak across all games. */
export function bumpStreak(w: Wallet, won: boolean): Wallet {
  const cur = won ? (w.streak?.cur ?? 0) + 1 : 0;
  return { ...w, streak: { cur, best: Math.max(w.streak?.best ?? 0, cur) } };
}

/** A finished Solitaire or Pyramid game. */
export function recordSolo(w: Wallet, game: SoloGame, won: boolean): Wallet {
  const cur = w.solo?.[game] ?? { played: 0, won: 0 };
  return bumpStreak({ ...w, solo: { ...(w.solo ?? {}), [game]: { played: cur.played + 1, won: cur.won + (won ? 1 : 0) } } }, won);
}

/** Feats pulled off in a game (deduplicated). */
export function addFeats(w: Wallet, keys: FeatKey[]): { wallet: Wallet; fresh: FeatKey[] } {
  const fresh = [...new Set(keys)].filter((k) => !w.achievements.includes(k));
  if (!fresh.length) return { wallet: w, fresh };
  return { wallet: { ...w, achievements: [...w.achievements, ...fresh] }, fresh };
}

/** Grants anything newly earned (levels, signatures, achievements). */
export function grantUnlocks(w: Wallet, club: ClubState): { wallet: Wallet; newly: Item[] } {
  const level = levelInfo(w.xp).level;
  const ach = achievementsMet(club, w);
  const act = activityOf(club, w);
  const newly: Item[] = [];
  for (const item of CATALOGUE) {
    if (w.owned.includes(item.id)) continue;
    const u = item.unlock;
    const earned = u.kind === 'starter'
      || (u.kind === 'level' && level >= u.level)
      || (u.kind === 'signature' && winsAgainst(club, u.member) >= u.wins)
      || (u.kind === 'achievement' && ach.includes(u.key))
      || (u.kind === 'play' && (u.game ? act.played[u.game] : act.total) >= u.count)
      || (u.kind === 'win' && (u.game ? act.won[u.game] : act.wins) >= u.count)
      || (u.kind === 'shop' && u.price === 0 && u.tier !== undefined && tierRank(tierFor(level).id) >= tierRank(u.tier));
    if (earned) newly.push(item);
  }
  if (!newly.length && ach.length === w.achievements.length) return { wallet: w, newly };
  return { wallet: { ...w, owned: [...w.owned, ...newly.map((i) => i.id)], achievements: ach }, newly };
}

export function buy(w: Wallet, itemId: string, club: ClubState): { wallet: Wallet } | { error: string } {
  const item = getItem(itemId);
  if (!item) return { error: 'That item no longer exists.' };
  const st = itemState(item, w, club);
  if (st.kind === 'owned') return { error: 'You already own this.' };
  if (st.kind === 'locked') return { error: `Locked: ${st.reason}.` };
  if (w.coins < st.price) return { error: `You need ${st.price - w.coins} more coins.` };
  const next = addLedger(w, -st.price, `Bought ${item.name}`);
  return { wallet: { ...next, owned: [...next.owned, item.id] } };
}

/** Gold stars on the champion's jacket: one per title won and per Cup won. */
export function championStars(club: ClubState): number {
  const cab = cabinetFor(club, ME);
  return cab.current.length + cab.past.length + cab.cups.length;
}

export const holdsTitle = (club: ClubState) => GAMES.some((g) => club.titles[g].current.holder === ME);

// ------------------------------------------------------------- seasonal gifts
export const SEASON_GIFT_FALLBACK = 250;

/** Claims a season's free gift. If you already own the item, you get coins instead. */
export function claimSeasonGift(w: Wallet, giftItem: string, key: string): { wallet: Wallet; item: Item | null; coins: number } | { error: string } {
  if ((w.seasonGifts ?? []).includes(key)) return { error: 'You have already opened this season\'s gift.' };
  const item = getItem(giftItem) ?? null;
  const gifts = [...(w.seasonGifts ?? []), key];
  if (item && !w.owned.includes(item.id)) {
    const next = addLedger(w, 0, `Seasonal gift: ${item.name}`);
    return { wallet: { ...next, owned: [...next.owned, item.id], seasonGifts: gifts }, item, coins: 0 };
  }
  const next = addLedger(w, SEASON_GIFT_FALLBACK, 'Seasonal gift (coins)');
  return { wallet: { ...next, seasonGifts: gifts }, item: null, coins: SEASON_GIFT_FALLBACK };
}
