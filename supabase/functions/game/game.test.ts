import { describe, expect, test } from 'bun:test';
import { handle, TURN_SECONDS, type GameData, type PublicState, type RoomRow, type SeatRow, type Store, type ViewRow } from './src/server.ts';
import { ONLINE, type OnlineGame } from '../../../packages/engine/src/online/registry.ts';
import { rotateSeats } from '../../../packages/engine/src/online/rotate.ts';
import { seededRng } from '../../../packages/engine/src/core/rng.ts';
import { ROSTER } from '../../../apps/web/src/lib/roster.ts';

/** An in-memory database that behaves like the real one for the function's purposes. */
function memoryStore() {
  const rooms = new Map<string, RoomRow>();
  let seats: SeatRow[] = [];
  const games = new Map<string, { version: number; data: GameData }>();
  const views = new Map<string, ViewRow>();
  const looks = new Map<string, unknown>();
  const pubs = new Map<string, { version: number; state: PublicState }>();
  const finished: Array<{ roomId: string; placements: number[] }> = [];
  let n = 0;
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const store: Store = {
    async userFromToken(t) { return t.startsWith('tok-') ? t.slice(4) : null; },
    async names(ids) { return Object.fromEntries(ids.map((i) => [i, i[0].toUpperCase() + i.slice(1)])); },
    async insertRoom(room) {
      if ([...rooms.values()].some((r) => r.code === room.code)) return null;
      const r = { ...clone(room), id: `room${++n}` }; rooms.set(r.id, r); return clone(r);
    },
    async roomById(id) { return rooms.has(id) ? clone(rooms.get(id)!) : null; },
    async roomByCode(code) { const r = [...rooms.values()].find((x) => x.code === code); return r ? clone(r) : null; },
    async updateRoom(id, patch, ifStatus) {
      const r = rooms.get(id); if (!r || (ifStatus && r.status !== ifStatus)) return false;
      Object.assign(r, clone(patch)); return true;
    },
    async deleteRoom(id) { rooms.delete(id); seats = seats.filter((s) => s.room_id !== id); },
    async seats(roomId) { return clone(seats.filter((s) => s.room_id === roomId)); },
    async insertSeat(row) {
      if (seats.some((s) => s.room_id === row.room_id && (s.seat === row.seat || (row.user_id && s.user_id === row.user_id)))) return false;
      seats.push(clone(row)); return true;
    },
    async deleteSeat(roomId, seat) { seats = seats.filter((s) => !(s.room_id === roomId && s.seat === seat)); },
    async aiMembers() { return ROSTER.map((c) => ({ ai_key: c.id, name: c.name, style: c.style, skills: c.skill as Record<string, number> })); },
    async loadGame(roomId) { const g = games.get(roomId); return g ? clone(g) : null; },
    async saveGame(roomId, expected, data) {
      const g = games.get(roomId);
      if (expected === null) { if (g) return false; games.set(roomId, { version: 1, data: clone(data) }); return true; }
      if (!g || g.version !== expected) return false;
      games.set(roomId, { version: expected + 1, data: clone(data) }); return true;
    },
    async loadViews(roomId) { return clone([...views.values()].filter((v) => v.room_id === roomId)); },
    async saveViews(rows) { for (const r of rows) views.set(`${r.room_id}/${r.user_id}`, clone(r)); },
    async saveLook(id, look) { looks.set(id, clone(look)); },
    async loadPublic(roomId) { return pubs.has(roomId) ? clone(pubs.get(roomId)!) : null; },
    async savePublic(roomId, version, state) { pubs.set(roomId, { version, state: clone(state) }); },
    async finishMatch(roomId, _game, seatSpecs, placements) {
      finished.push({ roomId, placements }); return placements.map((s, i) => ({ seat: s, place: i + 1, coins: seatSpecs[s].kind === 'human' ? 60 : 0 }));
    },
  };
  return { store, rooms, views, games, finished, pubs, seatsOf: (id: string) => seats.filter((s) => s.room_id === id) };
}

let clock = Date.now();
const now = () => clock;
const call = async (store: Store, user: string, body: Record<string, unknown>) => {
  const res = await handle(new Request('https://x/functions/v1/game', { method: 'POST', headers: { Authorization: `Bearer tok-${user}` }, body: JSON.stringify(body) }), store, now);
  return { status: res.status, ...(await res.json()) };
};

const FAST: Partial<Record<OnlineGame, unknown>> = { poker: { startingStack: 200, smallBlind: 10, bigBlind: 20, blindsUpEvery: 2 }, draw: { startingStack: 200, smallBlind: 10, bigBlind: 20, blindsUpEvery: 2 } };

/** Two brothers play a whole match; each moves from their own (rotated) view, like the browser. */
async function playWhole(game: OnlineGame, seats: number, opts: { leaveAfter?: number; nudge?: boolean } = {}) {
  const db = memoryStore();
  const made = await call(db.store, 'sean', { op: 'create', game, seats, rules: FAST[game] ?? {} });
  expect(made.ok).toBe(true);
  expect(made.code).toMatch(/^[A-Z2-9]{6}$/);
  expect((await call(db.store, 'bro', { op: 'join', code: made.code.toLowerCase() })).ok).toBe(true);
  expect((await call(db.store, 'bro', { op: 'start', roomId: made.roomId })).status).toBe(403); // only the host
  expect((await call(db.store, 'sean', { op: 'start', roomId: made.roomId })).ok).toBe(true);
  expect(db.seatsOf(made.roomId).length).toBe(seats);
  const rng = seededRng(9);
  const { module, ai } = ONLINE[game];
  let moves = 0;
  let left = false;
  for (let guard = 0; guard < 4000; guard++) {
    if (db.rooms.get(made.roomId)!.status === 'finished') break;
    const players = left ? ['sean'] : ['sean', 'bro'];
    let progressed = false;
    for (const u of players) {
      const row = db.views.get(`${made.roomId}/${u}`)!;
      const v = row.view;
      expect(v.seats.length).toBe(seats);
      if (v.status === 'finished') continue;
      const local = rotateSeats(v.view, v.seat, v.n) as { seat: number };
      expect(local.seat).toBe(0);
      if (!v.acting.includes(v.seat)) continue;
      if (opts.nudge && u === 'bro' && moves > 3 && moves % 9 === 0) {
        // Bro dawdles; Sean nudges after the time limit.
        clock = Date.now();
        expect((await call(db.store, 'sean', { op: 'nudge', roomId: made.roomId })).nudged).toBeUndefined();
        clock = Date.now() + (TURN_SECONDS + 1) * 1000;
        expect((await call(db.store, 'sean', { op: 'nudge', roomId: made.roomId })).nudged).toBe(true);
        progressed = true; continue;
      }
      const action = ai(local, 'cautious', rng); // actions never contain seat numbers
      const r = await call(db.store, u, { op: 'act', roomId: made.roomId, action });
      expect(r.ok).toBe(true);
      moves++; progressed = true;
      if (opts.leaveAfter && moves === opts.leaveAfter && !left) { expect((await call(db.store, 'bro', { op: 'leave', roomId: made.roomId })).ok).toBe(true); left = true; }
    }
    if (!progressed) {
      // Between hands: whoever's table gets there first deals the next one.
      const g = (await db.store.loadGame(made.roomId))!;
      if (!module.isFinished(g.data.engine)) {
        if (module.actingSeats(g.data.engine).length === 0) expect((await call(db.store, left ? 'sean' : 'bro', { op: 'next', roomId: made.roomId })).ok).toBe(true);
        else if (left) { clock = Date.now() + (TURN_SECONDS + 1) * 1000; await call(db.store, 'sean', { op: 'nudge', roomId: made.roomId }); }
      }
    }
  }
  return { db, roomId: made.roomId, moves };
}

describe('online tables (game function)', () => {
  test('two brothers and AI members play a whole match of every game', async () => {
    for (const [game, seats] of [['take2', 4], ['hearts', 4], ['gin', 2], ['blackjack', 3], ['poker', 4], ['draw', 3]] as Array<[OnlineGame, number]>) {
      const { db, roomId, moves } = await playWhole(game, seats);
      expect(db.rooms.get(roomId)!.status).toBe('finished');
      expect(db.finished.length).toBe(1);
      expect(db.finished[0].placements.slice().sort()).toEqual(Array.from({ length: seats }, (_, i) => i));
      expect(moves).toBeGreaterThan(2);
      const sean = db.views.get(`${roomId}/sean`)!.view;
      expect(sean.status).toBe('finished');
      expect(sean.result).toBeDefined();
      expect(sean.log.length).toBeGreaterThan(0);
    }
  }, 120000);
  test('nudging a slow player only works after the time limit', async () => {
    const { db, roomId } = await playWhole('take2', 3, { nudge: true });
    expect(db.rooms.get(roomId)!.status).toBe('finished');
  }, 60000);
  test('if a brother leaves mid-game an AI member finishes for him, and his result still counts', async () => {
    const { db, roomId } = await playWhole('hearts', 4, { leaveAfter: 6 });
    expect(db.rooms.get(roomId)!.status).toBe('finished');
    expect(db.finished[0].placements.length).toBe(4);
  }, 60000);
  test('nobody can see another player\'s hand or the deck', async () => {
    const db = memoryStore();
    const { roomId, code } = await call(db.store, 'sean', { op: 'create', game: 'take2', seats: 2 });
    await call(db.store, 'bro', { op: 'join', code });
    await call(db.store, 'sean', { op: 'start', roomId });
    const seanView = JSON.stringify(db.views.get(`${roomId}/sean`)!.view);
    const broHand = (db.views.get(`${roomId}/bro`)!.view.view as { hand: Array<{ id: string }> }).hand.map((c) => c.id);
    const engine = (await db.store.loadGame(roomId))!.data.engine as { drawPile: Array<{ id: string }> };
    // Bro's cards and the draw pile appear nowhere in what Sean's browser gets.
    for (const id of broHand) expect(seanView.includes(`"id":"${id}"`) && !JSON.stringify((db.views.get(`${roomId}/sean`)!.view.view as { recentDiscards: Array<{ id: string }>; topCard: { id: string } }).topCard).includes(id)).toBe(false);
    expect(engine.drawPile.length).toBeGreaterThan(10);
    const pileIds = engine.drawPile.slice(0, 10).map((c) => `"id":"${c.id}"`);
    expect(pileIds.some((p) => seanView.includes(p))).toBe(false);
  });
  test('the rules: sign in, real games only, no joining a started or full table, no moving for others', async () => {
    const db = memoryStore();
    expect((await handle(new Request('https://x', { method: 'POST', body: '{}' }), db.store)).status).toBe(401);
    expect((await call(db.store, 'sean', { op: 'create', game: 'snap' })).status).toBe(400);
    const { roomId, code } = await call(db.store, 'sean', { op: 'create', game: 'gin', seats: 2 });
    expect((await call(db.store, 'bro', { op: 'join', code: 'NOPE99' })).status).toBe(404);
    await call(db.store, 'bro', { op: 'join', code });
    expect((await call(db.store, 'cousin', { op: 'join', code })).status).toBe(409); // full
    await call(db.store, 'sean', { op: 'start', roomId });
    expect((await call(db.store, 'cousin', { op: 'act', roomId, action: { type: 'passUpcard' } })).status).toBe(403);
    const v = db.views.get(`${roomId}/sean`)!.view;
    const notMe = v.acting.includes(v.seat) ? 'bro' : 'sean';
    expect((await call(db.store, notMe, { op: 'act', roomId, action: { type: 'passUpcard' } })).status).toBe(409);
  });
  test('phrases and emotes reach everyone at the table; only known phrases are allowed', async () => {
    const db = memoryStore();
    const { roomId, code } = await call(db.store, 'sean', { op: 'create', game: 'take2', seats: 3 });
    await call(db.store, 'bro', { op: 'join', code });
    expect((await call(db.store, 'sean', { op: 'react', roomId, reaction: 'say:Well played' })).status).toBe(403); // not started
    await call(db.store, 'sean', { op: 'start', roomId });
    const ai = db.views.get(`${roomId}/sean`)!.view.seats.findIndex((s) => s.kind === 'ai');
    expect((await call(db.store, 'sean', { op: 'react', roomId, reaction: 'say:Well played', reply: { seat: ai, r: 'say:Cheers' } })).ok).toBe(true);
    expect((await call(db.store, 'bro', { op: 'react', roomId, reaction: 'thumbs', reply: { seat: 0, r: 'say:Thanks' } })).ok).toBe(true); // can't speak for Sean
    expect((await call(db.store, 'bro', { op: 'react', roomId, reaction: 'say:anything I like' })).status).toBe(400);
    expect((await call(db.store, 'cousin', { op: 'react', roomId, reaction: 'say:Ouch' })).status).toBe(403);
    const r = db.pubs.get(roomId)!.state.reactions!;
    expect(r.map((x) => [x.seat, x.r])).toEqual([[0, 'say:Well played'], [ai, 'say:Cheers'], [1, 'thumbs']]);
    // A move keeps the reactions.
    const v = db.views.get(`${roomId}/sean`)!.view;
    const who = v.acting.includes(v.seat) ? 'sean' : 'bro';
    const wv = db.views.get(`${roomId}/${who}`)!.view;
    await call(db.store, who, { op: 'act', roomId, action: ONLINE.take2.ai(rotateSeats(wv.view, wv.seat, wv.n), 'cautious', seededRng(1)) });
    expect(db.pubs.get(roomId)!.state.reactions!.length).toBe(3);
  });
  test('rematch: the first to ask makes the new table, the others join it', async () => {
    const { db, roomId } = await playWhole('gin', 2);
    const a = await call(db.store, 'bro', { op: 'rematch', roomId });
    expect(a.ok).toBe(true);
    expect(db.pubs.get(roomId)!.state.rematch).toEqual({ roomId: a.roomId, by: 1 });
    const b = await call(db.store, 'sean', { op: 'rematch', roomId });
    expect(b.roomId).toBe(a.roomId);
    expect(db.seatsOf(a.roomId).map((s) => s.user_id).sort()).toEqual(['bro', 'sean']);
    expect(db.rooms.get(a.roomId)!.status).toBe('waiting');
    expect((await call(db.store, 'cousin', { op: 'rematch', roomId })).status).toBe(403);
  }, 60000);
});
