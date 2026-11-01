// LOCAL MODE storage. Everything here lives in this browser only.
// When Supabase is connected, profile and stats move to the server and this
// file keeps only device preferences (sound, motion, card size).

import { useEffect, useState } from 'react';
import type { AvatarConfig } from '../design/Avatar.tsx';
import type { Take2Config } from '../../../../packages/engine/src/take2/config.ts';
import { cryptoRng } from '../../../../packages/engine/src/core/rng.ts';
import { createClub, migrateClub, type ClubState } from './club.ts';
import type { HeartsConfig } from '../../../../packages/engine/src/hearts/types.ts';
import type { GinConfig } from '../../../../packages/engine/src/gin/types.ts';
import type { BlackjackConfig } from '../../../../packages/engine/src/blackjack/types.ts';
import type { PyramidConfig } from '../../../../packages/engine/src/pyramid/engine.ts';
import { createWallet, type Wallet } from './progress.ts';
import { migrateLook } from './look.ts';

export interface LocalProfile {
  name: string;
  avatar: AvatarConfig;
  createdAt: string;
}

export interface Settings {
  sound: boolean;
  volume: number;            // 0..1
  aiSpeed: 'relaxed' | 'normal' | 'fast';
  motion: 'system' | 'reduced' | 'full';
  cardSize: 'normal' | 'large';
  cardBack: 'oxblood' | 'navy' | 'forest';
  /** Games switched off in Settings (game ids, plus 'solitaire'). */
  hiddenGames: string[];
  /** After a poker or blackjack hand: carry on by itself after a pause, or wait for a tap. */
  handPause: 'auto' | 'tap';
  /** How characters are drawn: 'lounge' (grown-up, more realistic) or 'classic' (the original cartoon look). */
  charStyle?: 'lounge' | 'classic';
  /** Seasonal takeovers (decorations, banners, seasonal shop). */
  seasonal?: boolean;
  /** Preview a season now (for checking ahead). Null = follow the calendar. */
  seasonPreview?: string | null;
}

export interface PracticeStats {
  take2Played: number;
  take2Wins: number;
  take2RoundsWon: number;
  take2BestFinish: number | null;
  pokerPlayed: number;
  pokerWins: number;
  pokerHandsWon: number;
  pokerBestFinish: number | null;
  heartsPlayed: number;
  heartsWins: number;
  heartsMoons: number;
  heartsBestFinish: number | null;
  ginPlayed: number;
  ginWins: number;
  ginHandsWon: number;
  ginGins: number;
  drawPlayed: number;
  drawWins: number;
  drawHandsWon: number;
  drawBestFinish: number | null;
  bjPlayed: number;
  bjWins: number;
  bjBlackjacks: number;
  bjBestChips: number;
  lastPlayed: string | null;
}

export interface SolitaireStats {
  played: number;
  won: number;
  bestTime: number | null;   // seconds
  bestMoves: number | null;
  bestScore: number;
  streak: number;
  bestStreak: number;
  draw: 1 | 3;
  /** Today's Daily Deal: your best finish. */
  daily: { date: string; won: boolean; time: number | null; moves: number | null; tries: number } | null;
}

export interface PyramidStats {
  played: number;
  wins: number;
  /** Best score (correct guesses) for each pyramid size. */
  best: Record<string, number>;
  streak: number;
  bestStreak: number;
  showOdds: boolean;
  config: Partial<PyramidConfig>;
}
export const EMPTY_PYRAMID: PyramidStats = { played: 0, wins: 0, best: {}, streak: 0, bestStreak: 0, showOdds: false, config: {} };

export const EMPTY_SOLITAIRE: SolitaireStats = { played: 0, won: 0, bestTime: null, bestMoves: null, bestScore: 0, streak: 0, bestStreak: 0, draw: 1, daily: null };

export const DEFAULT_SETTINGS: Settings = {
  sound: true, volume: 0.6, aiSpeed: 'normal', motion: 'system', cardSize: 'normal', cardBack: 'oxblood', hiddenGames: [], handPause: 'auto', charStyle: 'lounge', seasonal: true, seasonPreview: null,
};

export const EMPTY_STATS: PracticeStats = {
  take2Played: 0, take2Wins: 0, take2RoundsWon: 0, take2BestFinish: null,
  pokerPlayed: 0, pokerWins: 0, pokerHandsWon: 0, pokerBestFinish: null,
  heartsPlayed: 0, heartsWins: 0, heartsMoons: 0, heartsBestFinish: null,
  ginPlayed: 0, ginWins: 0, ginHandsWon: 0, ginGins: 0,
  drawPlayed: 0, drawWins: 0, drawHandsWon: 0, drawBestFinish: null,
  bjPlayed: 0, bjWins: 0, bjBlackjacks: 0, bjBestChips: 0, lastPlayed: null,
};

export const KEYS = {
  profile: 'cardclub.profile.v1',
  settings: 'cardclub.settings.v1',
  stats: 'cardclub.stats.v1',
  take2Rules: 'cardclub.take2rules.v1',
  take2Table: 'cardclub.take2table.v1',
  pokerTable: 'cardclub.pokertable.v1',
  club: 'cardclub.club.v1',
  heartsRules: 'cardclub.heartsrules.v1',
  ginRules: 'cardclub.ginrules.v1',
  bjRules: 'cardclub.bjrules.v1',
  solitaire: 'cardclub.solitaire.v1',
  pyramid: 'cardclub.pyramid.v1',
  wallet: 'cardclub.wallet.v1',
};

/** Saved house rules from before a rule was confirmed get the confirmed default. */
const TAKE2_RULES_V = 2;
function migrateTake2Rules(r: Partial<Take2Config> | null): Partial<Take2Config> | null {
  if (!r) return r;
  const v = (r as { rulesV?: number }).rulesV ?? 1;
  // v2: an 8 can pass a skip on (confirmed by the owner).
  return v < 2 ? { ...r, eightStacking: true } : r;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)
      ? { ...fallback, ...parsed }
      : parsed;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: keep working in memory */
  }
}

function loadProfile(): LocalProfile | null {
  const p = read<LocalProfile | null>(KEYS.profile, null);
  if (!p) return null;
  return { ...p, avatar: migrateLook(p.avatar) };
}

function loadWallet(): Wallet {
  const w = read<Wallet | null>(KEYS.wallet, null);
  if (w && w.version === 1 && Array.isArray(w.owned)) {
    const out: Wallet = { ...createWallet(), ...w };
    // Solo game counts started being kept in the wallet: seed them from the old stats.
    if (!w.solo) {
      const sol = read<SolitaireStats | null>(KEYS.solitaire, null);
      const pyr = read<PyramidStats | null>(KEYS.pyramid, null);
      out.solo = { solitaire: { played: sol?.played ?? 0, won: sol?.won ?? 0 }, pyramid: { played: pyr?.played ?? 0, won: pyr?.wins ?? 0 } };
    }
    return out;
  }
  const fresh = createWallet();
  write(KEYS.wallet, fresh);
  return fresh;
}

function loadClub(): ClubState {
  const saved = read<ClubState | null>(KEYS.club, null);
  if (saved && saved.version === 1 && saved.players && saved.titles) {
    const migrated = migrateClub(saved, cryptoRng());
    write(KEYS.club, migrated);
    return migrated;
  }
  const fresh = createClub(cryptoRng());
  write(KEYS.club, fresh);
  return fresh;
}

// Tiny observable store so every screen sees the same values.
type Listener = () => void;
const listeners = new Set<Listener>();
function loadAll() {
  return {
  profile: loadProfile(),
  wallet: loadWallet(),
  settings: read<Settings>(KEYS.settings, DEFAULT_SETTINGS),
  stats: read<PracticeStats>(KEYS.stats, EMPTY_STATS),
  take2Rules: migrateTake2Rules(read<Partial<Take2Config> | null>(KEYS.take2Rules, null)),
  take2Table: read<{ opponents: string[]; count?: number } | null>(KEYS.take2Table, null),
  pokerTable: read<{ opponents: string[]; preset: string; count?: number } | null>(KEYS.pokerTable, null),
  club: loadClub(),
  heartsRules: read<Partial<HeartsConfig> | null>(KEYS.heartsRules, null),
  ginRules: read<Partial<GinConfig> | null>(KEYS.ginRules, null),
  bjRules: read<Partial<BlackjackConfig> | null>(KEYS.bjRules, null),
  solitaire: read<SolitaireStats>(KEYS.solitaire, EMPTY_SOLITAIRE),
  pyramid: read<PyramidStats>(KEYS.pyramid, EMPTY_PYRAMID),
  };
}
const mem = loadAll();

function emit() {
  for (const l of listeners) l();
}

export const store = {
  get: () => mem,
  subscribe(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  setProfile(p: LocalProfile) { mem.profile = p; write(KEYS.profile, p); emit(); },
  setSettings(patch: Partial<Settings>) { mem.settings = { ...mem.settings, ...patch }; write(KEYS.settings, mem.settings); emit(); },
  setTake2Rules(r: Partial<Take2Config> | null) { mem.take2Rules = r; write(KEYS.take2Rules, r ? { ...r, rulesV: TAKE2_RULES_V } : r); emit(); },
  setWallet(w: Wallet) { mem.wallet = w; write(KEYS.wallet, w); emit(); },
  setClub(c: ClubState) { mem.club = c; write(KEYS.club, c); emit(); },
  setTake2Table(t: { opponents: string[]; count?: number }) { mem.take2Table = t; write(KEYS.take2Table, t); emit(); },
  setPokerTable(t: { opponents: string[]; preset: string; count?: number }) { mem.pokerTable = t; write(KEYS.pokerTable, t); emit(); },
  setHeartsRules(r: Partial<HeartsConfig> | null) { mem.heartsRules = r; write(KEYS.heartsRules, r); emit(); },
  setGinRules(r: Partial<GinConfig> | null) { mem.ginRules = r; write(KEYS.ginRules, r); emit(); },
  recordHearts(result: { won: boolean; place: number; moons: number }) {
    const s = mem.stats;
    mem.stats = {
      ...s,
      heartsPlayed: s.heartsPlayed + 1,
      heartsWins: s.heartsWins + (result.won ? 1 : 0),
      heartsMoons: s.heartsMoons + result.moons,
      heartsBestFinish: s.heartsBestFinish === null ? result.place : Math.min(s.heartsBestFinish, result.place),
      lastPlayed: new Date().toISOString(),
    };
    write(KEYS.stats, mem.stats);
    emit();
  },
  recordGin(result: { won: boolean; handsWon: number; gins: number }) {
    const s = mem.stats;
    mem.stats = {
      ...s,
      ginPlayed: s.ginPlayed + 1,
      ginWins: s.ginWins + (result.won ? 1 : 0),
      ginHandsWon: s.ginHandsWon + result.handsWon,
      ginGins: s.ginGins + result.gins,
      lastPlayed: new Date().toISOString(),
    };
    write(KEYS.stats, mem.stats);
    emit();
  },
  setBjRules(r: Partial<BlackjackConfig> | null) { mem.bjRules = r; write(KEYS.bjRules, r); emit(); },
  recordDraw(result: { won: boolean; place: number; handsWon: number }) {
    const s = mem.stats;
    mem.stats = {
      ...s,
      drawPlayed: s.drawPlayed + 1,
      drawWins: s.drawWins + (result.won ? 1 : 0),
      drawHandsWon: s.drawHandsWon + result.handsWon,
      drawBestFinish: s.drawBestFinish === null ? result.place : Math.min(s.drawBestFinish, result.place),
      lastPlayed: new Date().toISOString(),
    };
    write(KEYS.stats, mem.stats);
    emit();
  },
  recordBlackjack(result: { won: boolean; chips: number; blackjacks: number }) {
    const s = mem.stats;
    mem.stats = {
      ...s,
      bjPlayed: s.bjPlayed + 1,
      bjWins: s.bjWins + (result.won ? 1 : 0),
      bjBlackjacks: s.bjBlackjacks + result.blackjacks,
      bjBestChips: Math.max(s.bjBestChips, result.chips),
      lastPlayed: new Date().toISOString(),
    };
    write(KEYS.stats, mem.stats);
    emit();
  },
  setSolitaire(st: SolitaireStats) { mem.solitaire = st; write(KEYS.solitaire, st); emit(); },
  setPyramid(st: PyramidStats) { mem.pyramid = st; write(KEYS.pyramid, st); emit(); },
  recordPoker(result: { won: boolean; place: number; handsWon: number }) {
    const s = mem.stats;
    mem.stats = {
      ...s,
      pokerPlayed: s.pokerPlayed + 1,
      pokerWins: s.pokerWins + (result.won ? 1 : 0),
      pokerHandsWon: s.pokerHandsWon + result.handsWon,
      pokerBestFinish: s.pokerBestFinish === null ? result.place : Math.min(s.pokerBestFinish, result.place),
      lastPlayed: new Date().toISOString(),
    };
    write(KEYS.stats, mem.stats);
    emit();
  },
  recordTake2(result: { won: boolean; place: number; roundsWon: number }) {
    const s = mem.stats;
    mem.stats = {
      ...s,
      take2Played: s.take2Played + 1,
      take2Wins: s.take2Wins + (result.won ? 1 : 0),
      take2RoundsWon: s.take2RoundsWon + result.roundsWon,
      take2BestFinish: s.take2BestFinish === null ? result.place : Math.min(s.take2BestFinish, result.place),
      lastPlayed: new Date().toISOString(),
    };
    write(KEYS.stats, mem.stats);
    emit();
  },
  resetAll() {
    try { for (const k of Object.values(KEYS)) localStorage.removeItem(k); } catch { /* ignore */ }
    mem.profile = null;
    mem.settings = DEFAULT_SETTINGS;
    mem.stats = EMPTY_STATS;
    mem.take2Rules = null;
    mem.take2Table = null;
    mem.pokerTable = null;
    mem.heartsRules = null;
    mem.ginRules = null;
    mem.bjRules = null;
    mem.solitaire = EMPTY_SOLITAIRE;
    mem.pyramid = EMPTY_PYRAMID;
    mem.club = createClub(cryptoRng());
    mem.wallet = createWallet();
    emit();
  },
};

// ------------------------------------------------------------ backup / restore
// A single file with everything on this device. Lets you move to a new phone,
// and later lets the online version import local progress into an account.
export const BACKUP_FORMAT = 1;

export function exportBackup(): string {
  const data: Record<string, unknown> = {};
  for (const [name, key] of Object.entries(KEYS)) {
    try { const raw = localStorage.getItem(key); if (raw) data[name] = JSON.parse(raw); } catch { /* skip */ }
  }
  return JSON.stringify({ app: 'card-club', format: BACKUP_FORMAT, savedAt: new Date().toISOString(), data }, null, 1);
}

/** Checks a backup and writes it to this device. The page reloads afterwards. */
export function importBackup(text: string): { ok: true; savedAt: string } | { error: string } {
  let o: { app?: string; format?: number; savedAt?: string; data?: Record<string, unknown> };
  try { o = JSON.parse(text); } catch { return { error: "That file isn't a Card Club backup." }; }
  if (o.app !== 'card-club' || !o.data || typeof o.data !== 'object') return { error: "That file isn't a Card Club backup." };
  if ((o.format ?? 0) > BACKUP_FORMAT) return { error: 'That backup is from a newer version of Card Club.' };
  if (!o.data.profile) return { error: 'That backup has no player in it.' };
  try {
    for (const [name, key] of Object.entries(KEYS)) {
      const v = o.data[name];
      if (v === undefined) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v));
    }
  } catch { return { error: "This browser wouldn't let us save it." }; }
  return { ok: true, savedAt: o.savedAt ?? '' };
}

// ------------------------------------------------------------ account save
// What goes to your account when you're signed in: everything except this
// device's own settings (sound, card size…).
export const SAVE_PARTS = (Object.keys(KEYS) as Array<keyof typeof KEYS>).filter((k) => k !== 'settings');
export type SaveData = Partial<Record<(typeof SAVE_PARTS)[number], unknown>>;

/** Everything on this device that belongs in the account save. */
export function saveData(): SaveData {
  const data: SaveData = {};
  for (const name of SAVE_PARTS) {
    try { const raw = localStorage.getItem(KEYS[name]); if (raw) data[name] = JSON.parse(raw); } catch { /* skip */ }
  }
  return data;
}

/** Puts an account save on this device (keeping this device's settings) and refreshes every screen. */
export function applySaveData(data: SaveData) {
  try {
    for (const name of SAVE_PARTS) {
      const v = data[name];
      if (v === undefined || v === null) localStorage.removeItem(KEYS[name]); else localStorage.setItem(KEYS[name], JSON.stringify(v));
    }
  } catch { /* storage blocked */ }
  const settings = mem.settings;
  Object.assign(mem, loadAll(), { settings });
  emit();
}

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n: number) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return mem;
}

export function prefersReducedMotion(s: Settings): boolean {
  if (s.motion === 'reduced') return true;
  if (s.motion === 'full') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
