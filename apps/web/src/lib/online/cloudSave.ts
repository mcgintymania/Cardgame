// One account, one wallet. While you're signed in, everything on this device
// (coins, items, level, stats, club record, house rules) is kept in your account
// and comes with you to every device. Games played offline catch up when you're
// back online, and coins won in online games are folded into the same wallet.
//
// If two devices both changed things since they last synced, the saves are merged:
// coins, XP and counts add up (nothing earned is lost), items and achievements
// are combined, best scores keep the best, and anything else keeps the newest change.

import { createWallet, type Wallet } from '../progress.ts';
import { applySaveData, saveData, store, EMPTY_STATS, EMPTY_PYRAMID, EMPTY_SOLITAIRE, type SaveData } from '../store.ts';
import { online, rpc } from './client.ts';

const META_KEY = 'cardclub.cloud.v1';
interface Meta { user: string; rev: number; base: SaveData }
interface SyncReply { rev: number; save: { data?: SaveData } | null; conflict?: boolean; collected?: { coins: number; xp: number } }

export type CloudStatus = 'off' | 'syncing' | 'saved' | 'offline';
let status: CloudStatus = 'off';
let lastSaved: number | null = null;
const statusFns = new Set<() => void>();
const setStatus = (s: CloudStatus) => { status = s; if (s === 'saved') lastSaved = Date.now(); for (const f of statusFns) f(); };
export const cloudStatus = () => ({ status, lastSaved });
export function onCloudStatus(fn: () => void) { statusFns.add(fn); return () => { statusFns.delete(fn); }; }

function readMeta(): Meta | null { try { const r = localStorage.getItem(META_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function writeMeta(m: Meta | null) { try { if (m) localStorage.setItem(META_KEY, JSON.stringify(m)); else localStorage.removeItem(META_KEY); } catch { /* storage blocked */ } }

// ------------------------------------------------------------------ merging
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** Whichever side changed since the last sync (this device wins if both did). */
const changed = <T,>(b: T, l: T, s: T): T => (same(l, b) ? s : l);
const lowerIsBetter = (k: string) => /time|moves|finish/i.test(k);

/** Counters add up; "best" keeps the best; anything else keeps the newest change. */
function mergeValue(key: string, b: unknown, l: unknown, s: unknown): unknown {
  if (same(l, b)) return s;
  if (same(s, b)) return l;
  if (/best/i.test(key) && key !== 'best') {
    const vals = [l, s].filter((v): v is number => typeof v === 'number');
    if (!vals.length) return l ?? s;
    return lowerIsBetter(key) ? Math.min(...vals) : Math.max(...vals);
  }
  if (typeof l === 'number' && typeof s === 'number' && !/streak/i.test(key)) return Math.max(0, s + (l - (typeof b === 'number' ? b : 0)));
  if (isObj(l) && isObj(s)) {
    const bo = isObj(b) ? b : {};
    const out: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(s)])) out[k] = mergeValue(k, bo[k], l[k], s[k]);
    return out;
  }
  if (typeof l === 'string' && typeof s === 'string' && /^\d{4}-\d\d-\d\d/.test(l) && /^\d{4}-\d\d-\d\d/.test(s)) return l > s ? l : s; // dates: the later
  return l;
}

const union = (...xs: Array<unknown[] | undefined>) => [...new Set(xs.flatMap((x) => x ?? []))];

function mergeWallet(b: Wallet, l: Wallet, s: Wallet): Wallet {
  if (same(l, b)) return s;
  if (same(s, b)) return l;
  const ledgerKey = (e: { date: string; amount: number; reason: string }) => `${e.date}|${e.amount}|${e.reason}`;
  const ledger = [...new Map([...s.ledger, ...l.ledger].map((e) => [ledgerKey(e), e])).values()]
    .sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 80);
  const later = (x: string | null, y: string | null) => (!x ? y : !y ? x : x > y ? x : y);
  const boosts: Wallet['boosts'] = { ...s.boosts };
  for (const [k, v] of Object.entries(l.boosts ?? {})) boosts[k as keyof Wallet['boosts']] = later(boosts[k as keyof Wallet['boosts']] ?? null, v ?? null) ?? undefined;
  return {
    ...s,
    version: 1,
    coins: Math.max(0, s.coins + (l.coins - b.coins)),
    xp: Math.max(0, s.xp + (l.xp - b.xp)),
    owned: union(s.owned, l.owned) as string[],
    achievements: union(s.achievements, l.achievements) as Wallet['achievements'],
    seasonGifts: union(s.seasonGifts, l.seasonGifts) as string[],
    ledger,
    table: changed(b.table, l.table, s.table),
    lastDailyWin: later(l.lastDailyWin, s.lastDailyWin),
    daily: (l.daily?.last ?? '') >= (s.daily?.last ?? '') ? l.daily : s.daily,
    boosts,
    solo: mergeValue('solo', b.solo ?? {}, l.solo ?? {}, s.solo ?? {}) as Wallet['solo'],
    streak: changed(b.streak, l.streak, s.streak),
  };
}

/** Games played in the club record: when two devices both played, keep the busier record. */
function clubGames(c: unknown): number {
  const me = (c as { players?: Record<string, Record<string, { played?: number }>> })?.players?.me;
  return me ? Object.values(me).reduce((n, g) => n + (g?.played ?? 0), 0) : 0;
}

/** What a brand-new device looks like, so its progress can be added to an account fairly. */
export const FRESH_BASE: SaveData = { wallet: createWallet(), stats: EMPTY_STATS, solitaire: EMPTY_SOLITAIRE, pyramid: EMPTY_PYRAMID };

/** Three-way merge: what both sides last agreed on (base), this device, and the account. */
export function mergeSave(base: SaveData, local: SaveData, server: SaveData): SaveData {
  const out: SaveData = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(server)]) as Set<keyof SaveData>;
  for (const k of keys) {
    const b = base[k], l = local[k], s = server[k];
    if (l === undefined) { out[k] = s; continue; }
    if (s === undefined) { out[k] = l; continue; }
    if (k === 'wallet') out[k] = mergeWallet((b ?? createWallet()) as Wallet, l as Wallet, s as Wallet);
    else if (k === 'club') out[k] = same(l, b) ? s : same(s, b) ? l : clubGames(l) >= clubGames(s) ? l : s;
    else if (k === 'stats' || k === 'solitaire' || k === 'pyramid') out[k] = mergeValue(k, b, l, s);
    else out[k] = changed(b, l, s);
  }
  return out;
}

// ------------------------------------------------------------------ syncing
const pack = (data: SaveData) => ({ app: 'card-club', format: 1, savedAt: new Date().toISOString(), data });
const call = (data: SaveData | null, rev: number) => rpc<SyncReply>('sync_save', { p_save: data ? pack(data) : null, p_rev: rev });

let running: Promise<void> | null = null;
let again = false;

/** Sync now (or right after the sync that's already running). */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try { await syncOnce(); setStatus('saved'); }
    catch { setStatus('offline'); }
    finally {
      running = null;
      if (again) { again = false; void syncNow(); }
    }
  })();
  return running;
}

async function syncOnce() {
  const session = online.session;
  if (!session) { setStatus('off'); return; }
  setStatus('syncing');
  let meta = readMeta();

  // This device was last used with a different account: switch to this account's save.
  if (meta && meta.user !== session.user_id) {
    const r = await call(null, 0);
    const data = r.save?.data ?? {};
    applySaveData(data);
    writeMeta({ user: session.user_id, rev: r.rev, base: data });
    return;
  }

  const before = saveData(); // this device when the sync started
  let local = before;
  let base: SaveData = meta?.base ?? (local.profile ? FRESH_BASE : {});
  let rev = meta?.rev ?? 0;
  const dirty = !meta || !same(local, meta.base);
  if (!meta) {
    // First sync on this device: if the account already has a save, add this device's progress to it.
    const r = await call(null, 0);
    if (r.save?.data) {
      rev = r.rev;
      local = local.profile ? mergeSave(base, local, r.save.data) : r.save.data;
      base = r.save.data;
    }
  }
  let reply: SyncReply | null = null;
  for (let tries = 0; tries < 4; tries++) {
    reply = await call(dirty || !meta ? (local.profile ? local : null) : null, rev);
    if (!reply.conflict) break;
    // Another device saved since: merge both, then save that.
    const theirs = reply.save?.data ?? {};
    local = mergeSave(base, local, theirs);
    base = theirs;
    rev = reply.rev;
  }
  if (!reply || reply.conflict) throw new Error('busy');
  const saved = reply.save?.data ?? null;
  if (!saved) { writeMeta({ user: session.user_id, rev: reply.rev, base: {} }); return; }

  // Anything changed on this device while we were saving is kept on top.
  const now = saveData();
  const result = same(now, before) ? saved : mergeSave(before, now, saved);
  if (!same(result, now)) applySaveData(result);
  writeMeta({ user: session.user_id, rev: reply.rev, base: saved });

  const got = reply.collected;
  if (got && (got.coins > 0 || got.xp > 0)) {
    // A line in your coin history (the coins are already in the balance).
    const w = store.get().wallet;
    if (got.coins > 0) store.setWallet({ ...w, ledger: [{ date: new Date().toISOString(), amount: got.coins, reason: 'Online games', balance: w.coins }, ...w.ledger].slice(0, 80) });
    try { window.dispatchEvent(new CustomEvent('cardclub:online-pay', { detail: got })); } catch { /* old browser */ }
  }
}

/** Keep the account save up to date while signed in. Call once when the app starts. */
export function startCloudSave() {
  let t: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms = 2500) => { if (t) clearTimeout(t); t = setTimeout(() => { if (online.session) void syncNow(); }, ms); };
  store.subscribe(() => soon());
  online.subscribe(() => { if (online.session) soon(50); else setStatus('off'); });
  window.addEventListener('online', () => soon(200));
  window.addEventListener('cardclub:sync', () => soon(300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(200); });
  setInterval(() => { if (online.session && !document.hidden) void syncNow(); }, 60000);
  if (online.session) soon(50);
}

/** Before signing out: save what's here so nothing is lost, then forget which account it was. */
export async function syncBeforeSignOut() {
  try { await syncNow(); } catch { /* offline: it stays on this device */ }
}
