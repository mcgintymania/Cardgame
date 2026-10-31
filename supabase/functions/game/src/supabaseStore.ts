// The real database behind the "game" function (Supabase, using the service role
// key that Supabase gives every Edge Function; it never leaves the server).
import type { Store } from './server.ts';

export async function supabaseStore(env: (k: string) => string | undefined): Promise<Store> {
  // @ts-ignore: resolved by Deno at deploy time
  const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const must = (r: { error: unknown }) => { if (r.error) throw r.error; return r; };
  return {
    async userFromToken(token) {
      const { data } = await db.auth.getUser(token);
      return data?.user?.id ?? null;
    },
    async names(ids) {
      if (!ids.length) return {};
      const { data } = must(await db.from('profiles').select('id,username').in('id', ids));
      return Object.fromEntries((data ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
    },
    async insertRoom(room) {
      const { data, error } = await db.from('rooms').insert({ ...room, is_private: true }).select('*').single();
      if (error) { if (error.code === '23505') return null; throw error; }
      return data;
    },
    async roomById(id) {
      const { data } = await db.from('rooms').select('*').eq('id', id).maybeSingle();
      return data ?? null;
    },
    async roomByCode(code) {
      const { data } = await db.from('rooms').select('*').eq('code', code).maybeSingle();
      return data ?? null;
    },
    async updateRoom(id, patch, ifStatus) {
      let q = db.from('rooms').update(patch).eq('id', id);
      if (ifStatus) q = q.eq('status', ifStatus);
      const { data } = must(await q.select('id'));
      return (data ?? []).length > 0;
    },
    async deleteRoom(id) { must(await db.from('rooms').delete().eq('id', id)); },
    async seats(roomId) {
      const { data } = must(await db.from('room_seats').select('room_id,seat,user_id,ai_key').eq('room_id', roomId));
      return data ?? [];
    },
    async insertSeat(row) {
      const { error } = await db.from('room_seats').insert(row);
      return !error;
    },
    async deleteSeat(roomId, seat) { must(await db.from('room_seats').delete().eq('room_id', roomId).eq('seat', seat)); },
    async aiMembers() {
      const { data } = must(await db.from('club_members').select('ai_key,name,style,skills').eq('kind', 'ai'));
      return data ?? [];
    },
    async loadGame(roomId) {
      const { data } = await db.from('game_states_private').select('version,state').eq('room_id', roomId).maybeSingle();
      return data ? { version: data.version, data: data.state } : null;
    },
    async saveGame(roomId, expected, state) {
      if (expected === null) {
        const { error } = await db.from('game_states_private').insert({ room_id: roomId, version: 1, state });
        return !error;
      }
      const { data } = must(await db.from('game_states_private').update({ state, version: expected + 1, updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('version', expected).select('room_id'));
      return (data ?? []).length > 0;
    },
    async loadViews(roomId) {
      const { data } = must(await db.from('player_views').select('room_id,user_id,version,view').eq('room_id', roomId));
      return data ?? [];
    },
    async saveViews(rows) {
      if (rows.length) must(await db.from('player_views').upsert(rows, { onConflict: 'room_id,user_id' }));
    },
    async savePublic(roomId, version, state) {
      must(await db.from('game_states_public').upsert({ room_id: roomId, version, state, updated_at: new Date().toISOString() }, { onConflict: 'room_id' }));
    },
    async finishMatch(roomId, game, seats, placements) {
      const { data } = must(await db.rpc('finish_match', {
        p_room: roomId, p_game: game,
        p_seats: seats.map((s) => (s.kind === 'human' ? { kind: 'human', user_id: s.userId, name: s.name } : { kind: 'ai', ai_key: s.aiKey, name: s.name })),
        p_placements: placements,
      }));
      return data;
    },
  };
}
