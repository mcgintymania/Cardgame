// Card Club — the "game" Edge Function: online tables.
// Built into ../index.ts (one file to paste into Supabase) by scripts/build-game-fn.mjs.
//
// POST JSON { op, ... } with the player's access token (Authorization: Bearer …):
//   create  { game, seats, rules }  -> { roomId, code }          host sits in seat 0
//   join    { code }                -> { roomId }
//   settings{ roomId, seats, rules } (host, before the start)
//   start   { roomId }              (host) fills empty seats with AI members and deals
//   act     { roomId, action }      your move; AI members then play their turns
//   next    { roomId }              deal the next hand (anyone at the table)
//   nudge   { roomId }              someone's taking too long: play the safe move for them
//   leave   { roomId }              before the start: give up your seat; during a game: an AI member plays it
//   react   { roomId, reaction, reply? }  a quick phrase or emote everyone at the table sees
//   look    { look }                your character, so the people you play see it (cosmetic only)
//   rematch { roomId }              after the game: a new table with the same game; others who ask join it
//
// Everything is checked here: whose turn it is, what's legal, who's at the table.
// Each player's own view (their hand only) goes in player_views; the deck never leaves the server.

import { cryptoRng } from '../../../../packages/engine/src/core/rng.ts';
import { IllegalActionError } from '../../../../packages/engine/src/core/game.ts';
import { ONLINE, isOnlineGame, type OnlineGame } from '../../../../packages/engine/src/online/registry.ts';
import { REACTIONS_KEEP, validReaction, type TableReaction } from '../../../../packages/engine/src/online/reactions.ts';
import { betweenHands, forceMoves, nextHand, playAction, startMatch, type MatchMeta, type Played, type SeatSpec } from '../../../../packages/engine/src/online/match.ts';

export interface RoomRow { id: string; code: string; game: OnlineGame; host: string | null; status: 'waiting' | 'playing' | 'finished' | 'abandoned'; config: { seats?: number; rules?: Record<string, unknown>; rematch?: string } }
/** What every seated player can read: the step (so browsers know to fetch), reactions and any rematch. */
export interface PublicState { step: number; status: string; acting: number[]; turnSince: number; reactions?: TableReaction[]; rematch?: { roomId: string; by: number } }
export interface SeatRow { room_id: string; seat: number; user_id: string | null; ai_key: string | null }
export interface GameData { engine: unknown; meta: MatchMeta & { result?: unknown } }
export interface ViewRow { room_id: string; user_id: string; version: number; view: PlayerViewData }
export interface PlayerViewData { seat: number; n: number; game: OnlineGame; seats: Array<{ kind: 'human' | 'ai'; userId?: string; aiKey?: string; name: string }>; status: string; view: unknown; log: LogEntry[]; acting: number[]; turnSince: number; result?: unknown }
export interface LogEntry { n: number; seat: number; events: unknown[]; view: unknown }

/** Everything the function needs from the database (a real one in Supabase, a fake one in tests). */
export interface Store {
  userFromToken(token: string): Promise<string | null>;
  names(userIds: string[]): Promise<Record<string, string>>;
  insertRoom(room: Omit<RoomRow, 'id'>): Promise<RoomRow | null>;   // null if the code is taken
  roomById(id: string): Promise<RoomRow | null>;
  roomByCode(code: string): Promise<RoomRow | null>;
  updateRoom(id: string, patch: Partial<RoomRow>, ifStatus?: RoomRow['status']): Promise<boolean>;
  deleteRoom(id: string): Promise<void>;
  seats(roomId: string): Promise<SeatRow[]>;
  insertSeat(row: SeatRow): Promise<boolean>;
  deleteSeat(roomId: string, seat: number): Promise<void>;
  aiMembers(game: OnlineGame): Promise<Array<{ ai_key: string; name: string; style: string; skills: Record<string, number> }>>;
  loadGame(roomId: string): Promise<{ version: number; data: GameData } | null>;
  /** Insert (expected = null) or compare-and-swap on version. False if someone else got there first. */
  saveGame(roomId: string, expected: number | null, data: GameData): Promise<boolean>;
  loadViews(roomId: string): Promise<ViewRow[]>;
  saveViews(rows: ViewRow[]): Promise<void>;
  loadPublic(roomId: string): Promise<{ version: number; state: PublicState } | null>;
  savePublic(roomId: string, version: number, state: PublicState): Promise<void>;
  saveLook(userId: string, look: Record<string, unknown>): Promise<void>;
  finishMatch(roomId: string, game: OnlineGame, seats: SeatSpec[], placements: number[]): Promise<unknown>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ok = (body: Record<string, unknown> = {}) => reply(200, { ok: true, ...body });
const fail = (status: number, error: string) => reply(status, { ok: false, error });
class Refusal extends Error { constructor(public status: number, msg: string) { super(msg); } }

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function roomCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** How long someone can take before another player may nudge (seconds). */
export const TURN_SECONDS = 60;
export const BETWEEN_HANDS_SECONDS = 12;
const LOG_KEEP = 14;

function personalityFor(skill: number, style: string): string {
  if (skill < 35) return 'beginner';
  if (skill >= 78) return 'expert';
  return style;
}

const skillKey = (g: OnlineGame) => (g === 'draw' ? 'draw' : g);

export async function handle(req: Request, store: Store, now = () => Date.now()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const me = token ? await store.userFromToken(token) : null;
  if (!me) return fail(401, 'Please sign in again.');
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail(400, 'Bad request.'); }
  try {
    switch (body.op) {
      case 'create': return ok(await create(store, me, body));
      case 'join': return ok(await join(store, me, String(body.code ?? '')));
      case 'settings': return ok(await settings(store, me, body));
      case 'start': return ok(await start(store, me, String(body.roomId)));
      case 'act': return ok(await act(store, me, String(body.roomId), body.action, now));
      case 'next': return ok(await act(store, me, String(body.roomId), '__next', now));
      case 'nudge': return ok(await nudge(store, me, String(body.roomId), now));
      case 'leave': return ok(await leave(store, me, String(body.roomId)));
      case 'react': return ok(await react(store, me, String(body.roomId), body.reaction, body.reply, now));
      case 'look': {
        const look = body.look;
        if (!look || typeof look !== 'object' || Array.isArray(look) || JSON.stringify(look).length > 4000) return fail(400, 'Bad look.');
        await store.saveLook(me, look);
        return ok();
      }
      case 'rematch': return ok(await rematch(store, me, String(body.roomId), now));
      default: return fail(400, 'Unknown request.');
    }
  } catch (e) {
    if (e instanceof Refusal) return fail(e.status, e.message);
    if (e instanceof IllegalActionError) return fail(409, e.message);
    throw e;
  }
}

function clampSeats(game: OnlineGame, n: unknown, humans = 1): number {
  const [lo, hi] = ONLINE[game].seats;
  const v = Math.round(Number(n));
  return Math.max(lo, Math.max(humans, Math.min(hi, Number.isFinite(v) ? v : lo)));
}

async function create(store: Store, me: string, body: Record<string, any>) {
  if (!isOnlineGame(body.game)) throw new Refusal(400, 'Pick a game.');
  const game = body.game as OnlineGame;
  const rules = body.rules && typeof body.rules === 'object' && JSON.stringify(body.rules).length < 4000 ? body.rules : {};
  for (let tries = 0; tries < 6; tries++) {
    const room = await store.insertRoom({ code: roomCode(), game, host: me, status: 'waiting', config: { seats: clampSeats(game, body.seats), rules } });
    if (!room) continue;
    await store.insertSeat({ room_id: room.id, seat: 0, user_id: me, ai_key: null });
    return { roomId: room.id, code: room.code };
  }
  throw new Refusal(503, 'Could not make a table just now. Please try again.');
}

async function join(store: Store, me: string, code: string) {
  const room = await store.roomByCode(code.trim().toUpperCase());
  if (!room || room.status === 'finished' || room.status === 'abandoned') throw new Refusal(404, 'No table with that code. Check it and try again.');
  const seats = await store.seats(room.id);
  if (seats.some((s) => s.user_id === me)) return { roomId: room.id };
  if (room.status !== 'waiting') throw new Refusal(409, 'That game has already started.');
  const total = room.config.seats ?? ONLINE[room.game].seats[1];
  for (let seat = 0; seat < total; seat++) {
    if (seats.some((s) => s.seat === seat)) continue;
    if (await store.insertSeat({ room_id: room.id, seat, user_id: me, ai_key: null })) return { roomId: room.id };
  }
  throw new Refusal(409, 'That table is full.');
}

async function settings(store: Store, me: string, body: Record<string, any>) {
  const room = await store.roomById(String(body.roomId));
  if (!room || room.host !== me) throw new Refusal(403, 'Only the host can change the table.');
  if (room.status !== 'waiting') throw new Refusal(409, 'The game has started.');
  const humans = (await store.seats(room.id)).length;
  const rules = body.rules && typeof body.rules === 'object' && JSON.stringify(body.rules).length < 4000 ? body.rules : room.config.rules;
  await store.updateRoom(room.id, { config: { seats: clampSeats(room.game, body.seats ?? room.config.seats, humans), rules } }, 'waiting');
  return {};
}

async function start(store: Store, me: string, roomId: string) {
  const room = await store.roomById(roomId);
  if (!room || room.host !== me) throw new Refusal(403, 'Only the host can start the game.');
  if (room.status !== 'waiting') throw new Refusal(409, 'The game has already started.');
  const seatRows = (await store.seats(room.id)).filter((s) => s.user_id).sort((a, b) => a.seat - b.seat);
  const total = clampSeats(room.game, room.config.seats, seatRows.length);
  const names = await store.names(seatRows.map((s) => s.user_id!));
  const specs: SeatSpec[] = seatRows.map((s) => ({ kind: 'human', userId: s.user_id!, name: names[s.user_id!] ?? 'Player' }));
  // Fill the empty chairs with club members who play this game.
  const pool = (await store.aiMembers(room.game)).filter((m) => (m.skills?.[skillKey(room.game)] ?? 0) > 0);
  const rng = cryptoRng();
  while (specs.length < total && pool.length) {
    const m = pool.splice(rng.int(pool.length), 1)[0];
    specs.push({ kind: 'ai', aiKey: m.ai_key, name: m.name, personality: personalityFor(m.skills[skillKey(room.game)], m.style) });
  }
  if (specs.length < ONLINE[room.game].seats[0]) throw new Refusal(409, 'Not enough players for this game.');
  if (!(await store.updateRoom(room.id, { status: 'playing' }, 'waiting'))) throw new Refusal(409, 'The game has already started.');
  // Seat rows: people keep theirs (renumbered in join order); AI members fill the rest.
  for (const s of await store.seats(room.id)) await store.deleteSeat(room.id, s.seat);
  for (let i = 0; i < specs.length; i++) await store.insertSeat({ room_id: room.id, seat: i, user_id: specs[i].userId ?? null, ai_key: specs[i].aiKey ?? null });
  const played = startMatch(room.game, room.config.rules ?? {}, specs, rng);
  await persist(store, room, null, played);
  return {};
}

async function act(store: Store, me: string, roomId: string, action: unknown, now: () => number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { room, version, data, seat } = await loadForPlayer(store, me, roomId);
    const game = room.game;
    let played: Played;
    if (action === '__next') {
      if (!betweenHands(game, data.engine)) return {};      // someone else already dealt it
      played = nextHand(game, data.engine, data.meta, cryptoRng());
    } else {
      const acting: number[] = ONLINE[game].module.actingSeats(data.engine);
      if (!acting.includes(seat)) {
        // Between hands the table may send "next round" as a normal move: treat it as such.
        if (betweenHands(game, data.engine)) { played = nextHand(game, data.engine, data.meta, cryptoRng()); }
        else throw new Refusal(409, "It isn't your turn.");
      } else played = playAction(game, data.engine, data.meta, seat, action, cryptoRng());
    }
    if (await persist(store, room, version, played)) return { step: played.meta.step };
  }
  throw new Refusal(409, 'The table was busy. Please try again.');
}

async function nudge(store: Store, me: string, roomId: string, now: () => number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { room, version, data } = await loadForPlayer(store, me, roomId);
    const game = room.game;
    const waited = (now() - data.meta.turnSince) / 1000;
    let played: Played | null = null;
    if (betweenHands(game, data.engine)) {
      if (waited >= BETWEEN_HANDS_SECONDS) played = nextHand(game, data.engine, data.meta, cryptoRng());
    } else {
      const late = (ONLINE[game].module.actingSeats(data.engine) as number[]).filter((s) => data.meta.seats[s]?.kind === 'human');
      if (late.length && waited >= TURN_SECONDS) played = forceMoves(game, data.engine, data.meta, late, cryptoRng());
    }
    if (!played) return { waited: Math.floor(waited) };
    if (await persist(store, room, version, played)) return { nudged: true };
  }
  return {};
}

async function leave(store: Store, me: string, roomId: string) {
  const room = await store.roomById(roomId);
  if (!room) return {};
  const seats = await store.seats(room.id);
  const mine = seats.find((s) => s.user_id === me);
  if (!mine) return {};
  if (room.status === 'waiting') {
    await store.deleteSeat(room.id, mine.seat);
    const left = seats.filter((s) => s.user_id && s.user_id !== me);
    if (!left.length) await store.deleteRoom(room.id);
    else if (room.host === me) await store.updateRoom(room.id, { host: left[0].user_id });
    return {};
  }
  if (room.status !== 'playing') return {};
  // During a game an AI member plays your seat to the end (your result still counts).
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await store.loadGame(room.id);
    if (!g) return {};
    const meta: MatchMeta = { ...g.data.meta, seats: g.data.meta.seats.map((s, i) => (i === mine.seat ? { ...s, kind: 'ai', personality: 'cautious', name: s.name } as SeatSpec : s)) };
    // Keep the user id so the result is still recorded against them.
    meta.seats[mine.seat] = { ...meta.seats[mine.seat], userId: g.data.meta.seats[mine.seat].userId, aiKey: undefined };
    const played = forceMoves(room.game, g.data.engine, meta, [], cryptoRng());
    if (await persist(store, room, g.version, played)) break;
  }
  if (!(await store.loadGame(room.id))?.data.meta.seats.some((s) => s.kind === 'human')) await store.updateRoom(room.id, { status: 'abandoned' }, 'playing');
  return {};
}

/** The seat you played (or play) at this table, playing or finished; -1 if none. */
async function seatOf(store: Store, me: string, roomId: string) {
  const room = await store.roomById(roomId);
  if (!room) throw new Refusal(404, 'That table has closed.');
  const g = await store.loadGame(room.id);
  const seat = g ? g.data.meta.seats.findIndex((s) => s.userId === me) : -1;
  if (!g || seat < 0) throw new Refusal(403, "You're not playing at this table.");
  return { room, g, seat };
}

function newId(): string {
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function addReactions(store: Store, roomId: string, list: Array<Omit<TableReaction, 'id'>>, extra: Partial<PublicState> = {}) {
  const pub = await store.loadPublic(roomId);
  if (!pub) return;
  const reactions = [...(pub.state.reactions ?? []), ...list.map((x) => ({ ...x, id: newId() }))].slice(-REACTIONS_KEEP);
  await store.savePublic(roomId, pub.version, { ...pub.state, ...extra, reactions });
}

async function react(store: Store, me: string, roomId: string, reaction: unknown, replyTo: unknown, now: () => number) {
  if (!validReaction(reaction)) throw new Refusal(400, 'Pick one of the phrases or emotes.');
  const { g, seat } = await seatOf(store, me, roomId);
  const list: Array<Omit<TableReaction, 'id'>> = [{ seat, r: reaction, by: seat, at: now() }];
  // A club member's answer, picked by your browser: only for a seat a club member actually holds.
  const rp = replyTo as { seat?: unknown; r?: unknown } | undefined;
  if (rp && Number.isInteger(rp.seat) && validReaction(rp.r) && g.data.meta.seats[rp.seat as number]?.kind === 'ai' && !g.data.meta.seats[rp.seat as number]?.userId) {
    list.push({ seat: rp.seat as number, r: rp.r, by: seat, at: now() + 1200 });
  }
  await addReactions(store, roomId, list);
  return {};
}

async function rematch(store: Store, me: string, roomId: string, now: () => number) {
  const { room, g, seat } = await seatOf(store, me, roomId);
  if (room.status === 'playing') throw new Refusal(409, 'This game is still going.');
  // Someone already asked: join their new table if it's still waiting.
  if (room.config.rematch) {
    const next = await store.roomById(room.config.rematch);
    if (next && next.status === 'waiting') return { ...(await join(store, me, next.code)), code: next.code };
  }
  const made = await create(store, me, { game: room.game, seats: g.data.meta.seats.length, rules: room.config.rules ?? {} });
  await store.updateRoom(room.id, { config: { ...room.config, rematch: made.roomId } });
  // Two people pressed it at once: whoever was saved last wins, the other joins that one.
  const after = await store.roomById(room.id);
  if (after?.config.rematch && after.config.rematch !== made.roomId) {
    await leave(store, me, made.roomId);
    const theirs = await store.roomById(after.config.rematch);
    if (theirs && theirs.status === 'waiting') return { ...(await join(store, me, theirs.code)), code: theirs.code };
  }
  await addReactions(store, room.id, [{ seat, r: 'say:Rematch?', by: seat, at: now() }], { rematch: { roomId: made.roomId, by: seat } });
  return made;
}

async function loadForPlayer(store: Store, me: string, roomId: string) {
  const room = await store.roomById(roomId);
  if (!room) throw new Refusal(404, 'That table has closed.');
  if (room.status !== 'playing') throw new Refusal(409, room.status === 'finished' ? 'This game is over.' : 'The game hasn\'t started yet.');
  const g = await store.loadGame(room.id);
  if (!g) throw new Refusal(409, 'The game hasn\'t started yet.');
  const seat = g.data.meta.seats.findIndex((s) => s.userId === me && s.kind === 'human');
  if (seat < 0) throw new Refusal(403, "You're not playing at this table.");
  return { room, version: g.version, data: g.data, seat };
}

/** Saves the new state (if nobody else moved first), each person's view, and the result when it's over. */
async function persist(store: Store, room: RoomRow, expected: number | null, played: Played): Promise<boolean> {
  const { module } = ONLINE[room.game];
  const finished = module.isFinished(played.state);
  const data: GameData = { engine: played.state, meta: played.meta };
  if (!(await store.saveGame(room.id, expected, data))) return false;

  let result: unknown;
  if (finished && played.meta.placements) {
    // People who left are recorded as people (an AI member just finished their game).
    const seats = played.meta.seats.map((s) => (s.userId ? { ...s, kind: 'human' as const } : s));
    result = await store.finishMatch(room.id, room.game, seats, played.meta.placements);
    await store.updateRoom(room.id, { status: 'finished' }, 'playing');
  }

  const old = new Map((await store.loadViews(room.id)).map((v) => [v.user_id, v]));
  const n = played.meta.seats.length;
  const publicSeats = played.meta.seats.map((s) => ({ kind: s.kind, userId: s.userId, aiKey: s.aiKey, name: s.name }));
  const acting = finished ? [] : (module.actingSeats(played.state) as number[]);
  const rows: ViewRow[] = [];
  played.meta.seats.forEach((s, seat) => {
    if (!s.userId) return;
    const prev = old.get(s.userId)?.view.log ?? [];
    const log = [...prev, ...played.steps.map((st) => ({ n: st.n, seat: st.seat, events: st.events, view: module.viewFor(st.state, seat) }))].slice(-LOG_KEEP);
    rows.push({
      room_id: room.id, user_id: s.userId, version: played.meta.step,
      view: { seat, n, game: room.game, seats: publicSeats, status: finished ? 'finished' : 'playing', view: module.viewFor(played.state, seat), log, acting, turnSince: played.meta.turnSince, result },
    });
  });
  await store.saveViews(rows);
  const reactions = (await store.loadPublic(room.id))?.state.reactions;
  await store.savePublic(room.id, played.meta.step, { step: played.meta.step, status: finished ? 'finished' : 'playing', acting, turnSince: played.meta.turnSince, ...(reactions ? { reactions } : {}) });
  return true;
}
