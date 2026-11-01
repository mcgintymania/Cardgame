// Online tables in the browser: talking to the "game" Edge Function, and a
// RemoteSession that the existing table screens use instead of LocalSession.

import type { GameSession, SessionUpdate } from '../../../../../packages/engine/src/core/session.ts';
import { rotateSeats } from '../../../../../packages/engine/src/online/rotate.ts';
import type { TableReaction } from '../../../../../packages/engine/src/online/reactions.ts';
import type { OnlineGame } from '../../../../../packages/engine/src/online/registry.ts';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.ts';
import { OnlineError, online, select, token } from './client.ts';

export interface PublicSeat { kind: 'human' | 'ai'; userId?: string; aiKey?: string; name: string }
export interface LogEntry { n: number; seat: number; events: unknown[]; view: unknown }
export interface PlayerViewData {
  seat: number; n: number; game: OnlineGame; seats: PublicSeat[]; status: 'playing' | 'finished';
  view: unknown; log: LogEntry[]; acting: number[]; turnSince: number;
  result?: Array<{ seat: number; place: number; ratingBefore: number; ratingAfter: number; coins: number; xp: number }>;
}
export interface RoomInfo { id: string; code: string; game: OnlineGame; status: 'waiting' | 'playing' | 'finished' | 'abandoned'; host: string | null; config: { seats?: number; rules?: Record<string, unknown> } }

/** Call the "game" function as the signed-in player. */
export async function gameFn<T = Record<string, unknown>>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/game`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, ...body }),
    });
  } catch {
    throw new OnlineError("Can't reach the club server. Check your connection.");
  }
  let data: { ok?: boolean; error?: string } & Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data.ok) throw new OnlineError(data.error ?? (res.status === 404 ? "The club's table service isn't switched on yet." : 'That didn\'t work. Please try again.'));
  return data as T;
}

export const createTable = (game: OnlineGame, seats: number, rules: unknown) => gameFn<{ roomId: string; code: string }>('create', { game, seats, rules });
export const joinTable = (code: string) => gameFn<{ roomId: string }>('join', { code });
export const tableSettings = (roomId: string, seats: number) => gameFn('settings', { roomId, seats });
export const startTable = (roomId: string) => gameFn('start', { roomId });
export const leaveTable = (roomId: string) => gameFn('leave', { roomId });
export const rematchTable = (roomId: string) => gameFn<{ roomId: string; code: string }>('rematch', { roomId });

interface PublicRow { version: number; state: { reactions?: TableReaction[]; rematch?: { roomId: string; by: number } } }
async function publicState(roomId: string): Promise<PublicRow | null> {
  const [row] = await select<PublicRow[]>(`game_states_public?room_id=eq.${roomId}&select=version,state`);
  return row ?? null;
}

/** The online table on screen right now (null when you're playing on this device). */
let activeTable: RemoteSession | null = null;
export const onlineTableNow = () => activeTable;

export async function myTables(): Promise<RoomInfo[]> {
  const uid = online.session?.user_id;
  const rows = await select<Array<{ room: RoomInfo | null }>>(`room_seats?user_id=eq.${uid}&select=room:rooms(id,code,game,status,host,config)`);
  return rows.map((r) => r.room).filter((r): r is RoomInfo => !!r && (r.status === 'waiting' || r.status === 'playing'));
}

const nameCache = new Map<string, { id: string; username: string; look: unknown }>();
export function forgetNames() { nameCache.clear(); }

export async function roomInfo(roomId: string): Promise<{ room: RoomInfo; seats: Array<{ seat: number; user_id: string | null; ai_key: string | null }>; names: Record<string, { username: string; look: unknown }> } | null> {
  const [room] = await select<RoomInfo[]>(`rooms?id=eq.${roomId}&select=id,code,game,status,host,config`);
  if (!room) return null;
  const seats = await select<Array<{ seat: number; user_id: string | null; ai_key: string | null }>>(`room_seats?room_id=eq.${roomId}&select=seat,user_id,ai_key&order=seat`);
  const ids = seats.map((s) => s.user_id).filter(Boolean) as string[];
  // Names change rarely: remember them so the waiting room checks quickly.
  const missing = ids.filter((i) => !nameCache.has(i));
  if (missing.length) for (const p of await select<Array<{ id: string; username: string; look: unknown }>>(`profiles?id=in.(${missing.join(',')})&select=id,username,look`)) nameCache.set(p.id, p);
  const profiles = ids.map((i) => nameCache.get(i)).filter((p): p is { id: string; username: string; look: unknown } => !!p);
  return { room, seats, names: Object.fromEntries(profiles.map((p) => [p.id, { username: p.username, look: p.look }])) };
}

export async function myView(roomId: string): Promise<{ version: number; view: PlayerViewData } | null> {
  const uid = online.session?.user_id;
  const [row] = await select<Array<{ version: number; view: PlayerViewData }>>(`player_views?room_id=eq.${roomId}&user_id=eq.${uid}&select=version,view`);
  return row ?? null;
}

/** Seconds before a slow player can be nudged (must match the server). */
const TURN_SECONDS = 60;
const BETWEEN_HANDS_SECONDS = 12;

/**
 * The table screens' online session. The server works in real seats; this rotates
 * everything so you are always seat 0, replays other players' moves one at a time
 * (so cards still fly), and polls for changes.
 */
export class RemoteSession<Action = unknown, View = unknown, Event = unknown> implements GameSession<Action, View, Event> {
  readonly seat = 0;
  private data: PlayerViewData;
  private shown: number;
  private current: View;
  private listeners = new Set<(u: SessionUpdate<View, Event>) => void>();
  private queue: LogEntry[] = [];
  private playing = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastNudge = 0;
  private seenReactions: Set<string> | null = null;
  private reactionFns = new Set<(seat: number, r: any) => void>();
  private rematchFns = new Set<(r: { roomId: string; by: number } | null) => void>();
  /** A rematch someone has asked for (their new table), once the game is over. */
  rematch: { roomId: string; by: number } | null = null;
  onData?: (d: PlayerViewData) => void;

  constructor(readonly roomId: string, version: number, data: PlayerViewData) {
    this.data = data;
    this.shown = version;
    this.current = this.rot(data.view) as View;
    this.schedule(400);
    activeTable = this as unknown as RemoteSession;
  }

  get info() { return this.data; }
  private rot<T>(x: T): T { return rotateSeats(x, this.data.seat, this.data.n); }

  getView(): View { return this.current; }
  subscribe(fn: (u: SessionUpdate<View, Event>) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  dispose(): void {
    this.disposed = true; if (this.timer) clearTimeout(this.timer); this.listeners.clear();
    this.reactionFns.clear(); this.rematchFns.clear();
    if ((activeTable as unknown) === this) activeTable = null;
  }

  /** Seat numbers here are yours (you are 0); the server's are real seats. */
  private real(local: number) { return (local + this.data.seat) % this.data.n; }
  private local(real: number) { return (real - this.data.seat + this.data.n) % this.data.n; }
  /** A real person sits here (not a club member). */
  isPersonAt(local: number): boolean { return this.data.seats[this.real(local)]?.kind === 'human'; }
  /** Other people's phrases and emotes, as they arrive. */
  onReaction(fn: (seat: number, r: any) => void): () => void { this.reactionFns.add(fn); return () => { this.reactionFns.delete(fn); }; }
  onRematch(fn: (r: { roomId: string; by: number } | null) => void): () => void { this.rematchFns.add(fn); fn(this.rematch); return () => { this.rematchFns.delete(fn); }; }
  /** Say something or emote: everyone at the table sees it (shown here straight away by the table). */
  react(r: string, reply?: { seat: number; r: string }): void {
    void gameFn('react', { roomId: this.roomId, reaction: r, reply: reply ? { seat: this.real(reply.seat), r: reply.r } : undefined }).catch(() => {});
  }
  /** Who asked for a rematch, by name. */
  nameAt(real: number): string { return this.data.seats[real]?.name ?? 'Someone'; }

  private takePublic(p: PublicRow) {
    const list = p.state.reactions ?? [];
    if (!this.seenReactions) this.seenReactions = new Set(list.map((x) => x.id)); // old ones aren't replayed
    for (const x of list) {
      if (this.seenReactions.has(x.id)) continue;
      this.seenReactions.add(x.id);
      if (x.by === this.data.seat) continue; // you already saw your own (and the reply you got)
      const delay = x.seat !== x.by ? 1300 : 0; // a club member's answer comes a moment later
      const show = () => { for (const fn of this.reactionFns) fn(this.local(x.seat), x.r); };
      if (delay) setTimeout(show, delay); else show();
    }
    const rm = p.state.rematch ?? null;
    if (rm && rm.roomId !== this.rematch?.roomId) { this.rematch = rm; for (const fn of this.rematchFns) fn(rm); }
  }

  async act(action: Action): Promise<void> {
    const t = (action as { type?: string })?.type ?? '';
    if (t.startsWith('next')) {
      // Dealing the next hand: whoever asks first; never an error.
      try { await gameFn('next', { roomId: this.roomId }); } catch { /* someone else dealt it */ }
    } else {
      await gameFn('act', { roomId: this.roomId, action });
    }
    await this.refresh();
  }

  private schedule(ms: number) {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.tick(); }, ms);
  }

  private async tick() {
    if (this.disposed) return;
    try {
      const p = await publicState(this.roomId);
      const v = p ? p.version : null;
      if (p) this.takePublic(p);
      if (v !== null && v > this.shown) await this.refresh();
      else this.maybeNudge();
    } catch { /* try again shortly */ }
    const myTurn = this.data.acting.includes(this.data.seat);
    const hidden = typeof document !== 'undefined' && document.hidden;
    this.schedule(this.data.status === 'finished' ? (hidden ? 10000 : 3000) : hidden ? 5000 : myTurn ? 2000 : 1200);
  }

  private maybeNudge() {
    if (this.data.status !== 'playing') return;
    const waited = (Date.now() - this.data.turnSince) / 1000;
    const others = this.data.acting.filter((s) => s !== this.data.seat && this.data.seats[s]?.kind === 'human');
    const between = this.data.acting.length === 0;
    if ((others.length && waited > TURN_SECONDS + 2) || (between && waited > BETWEEN_HANDS_SECONDS + 2)) {
      if (Date.now() - this.lastNudge < 8000) return;
      this.lastNudge = Date.now();
      void gameFn('nudge', { roomId: this.roomId }).then(() => this.refresh()).catch(() => {});
    }
  }

  private async refresh() {
    const row = await myView(this.roomId);
    if (!row || row.version <= this.shown) return;
    const fresh = row.view.log.filter((e) => e.n > this.shown);
    const gap = !row.view.log.some((e) => e.n === this.shown + 1) && fresh.length > 0 && fresh[0].n !== this.shown + 1;
    if (row.view.status === 'finished' && this.data.status !== 'finished') {
      // The server has paid out: bring the coins into your wallet soon.
      setTimeout(() => { try { window.dispatchEvent(new Event('cardclub:sync')); } catch { /* old browser */ } }, 1500);
    }
    this.data = row.view;
    this.shown = row.version;
    this.onData?.(row.view);
    if (gap || !fresh.length) {
      this.queue = [];
      this.current = this.rot(row.view.view) as View;
      this.emit({ view: this.current, events: [] });
      return;
    }
    this.queue.push(...fresh);
    if (!this.playing) void this.play();
  }

  /** Replays moves one at a time: other players' moves get a short pause, like at a real table. */
  private async play() {
    this.playing = true;
    while (this.queue.length && !this.disposed) {
      const e = this.queue.shift()!;
      this.current = this.rot(e.view) as View;
      this.emit({ view: this.current, events: this.rot(e.events) as Event[] });
      const who = this.data.seats[e.seat];
      const pause = e.seat === this.data.seat || e.seat < 0 ? 120 : who?.kind === 'ai' ? 650 + Math.random() * 350 : 350;
      if (this.queue.length) await new Promise((r) => setTimeout(r, pause));
    }
    this.playing = false;
  }

  private emit(u: SessionUpdate<View, Event>) { for (const l of this.listeners) l(u); }
}
