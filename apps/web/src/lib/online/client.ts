// A small Supabase client for Card Club: accounts through the "auth" Edge
// Function, then reads through the REST API as the signed-in player.
// (No supabase-js: plain fetch keeps the single-file build small and offline-safe.)

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.ts';

export interface Session { access_token: string; refresh_token: string; expires_at: number; user_id: string }
export class OnlineError extends Error {}

const KEY = 'cardclub.session.v1';
let session: Session | null = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(): Session | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return s && s.access_token ? s : null; } catch { return null; }
}
function save(s: Session | null) {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  emit();
}

export const online = {
  get session() { return session; },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SUPABASE_PUBLISHABLE_KEY, ...(init.headers ?? {}) } });
  } catch {
    throw new OnlineError("Can't reach the club server. Check your connection and try again.");
  }
}

async function authFn(body: Record<string, unknown>): Promise<{ session?: Session; recoveryCodes?: string[] }> {
  const res = await call('/functions/v1/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data: { ok?: boolean; error?: string; session?: Session; recoveryCodes?: string[] } = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data.ok) throw new OnlineError(data.error ?? (res.status === 404 ? "The club's sign-in service isn't switched on yet." : 'Something went wrong. Please try again.'));
  return data;
}

export async function signUp(username: string, password: string, look?: unknown): Promise<string[]> {
  const r = await authFn({ action: 'signup', username, password, look });
  if (r.session) save(r.session);
  return r.recoveryCodes ?? [];
}

export async function signIn(username: string, password: string): Promise<void> {
  const r = await authFn({ action: 'login', username, password });
  if (!r.session) throw new OnlineError('Username or password is wrong.');
  save(r.session);
}

export async function recover(username: string, code: string, newPassword: string): Promise<void> {
  const r = await authFn({ action: 'recover', username, code, newPassword });
  if (r.session) save(r.session);
}

export async function signOut(): Promise<void> {
  const s = session;
  save(null);
  if (s) { try { await call('/auth/v1/logout', { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}` } }); } catch { /* signed out locally anyway */ } }
}

/** A valid access token, refreshing it first if it's about to run out. */
export async function token(): Promise<string> {
  if (!session) throw new OnlineError('Please sign in.');
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  const res = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if (!res.ok) { save(null); throw new OnlineError('Your session ran out. Please sign in again.'); }
  const d = await res.json();
  save({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600), user_id: d.user?.id ?? session.user_id });
  return session!.access_token;
}

/** GET from the REST API as the signed-in player. */
export async function select<T>(path: string): Promise<T> {
  const res = await call(`/rest/v1/${path}`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (res.status === 401) { save(null); throw new OnlineError('Please sign in again.'); }
  if (!res.ok) throw new OnlineError('Could not load that from the club server.');
  return res.json();
}

/** Call one of the database functions players may use (buy_item, save_look…). */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await call(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new OnlineError((data && (data.message as string)) || 'That didn\'t work. Please try again.');
  return data as T;
}

// ------------------------------------------------------------ what we read
export interface MyAccount { username: string; level: number; xp: number; created_at: string; coins: number }
export async function loadMe(): Promise<MyAccount> {
  const uid = session?.user_id;
  const [p] = await select<Array<{ username: string; level: number; xp: number; created_at: string }>>(`profiles?id=eq.${uid}&select=username,level,xp,created_at`);
  const [w] = await select<Array<{ coins: number }>>('wallets?select=coins');
  if (!p) throw new OnlineError('Your profile is missing. Please sign in again.');
  return { ...p, coins: w?.coins ?? 0 };
}

export interface BoardRow { rating: number; played: number; wins: number; member: { name: string; kind: 'ai' | 'human'; user_id: string | null } }
export const loadBoard = (game: string) =>
  select<BoardRow[]>(`ratings?game=eq.${encodeURIComponent(game)}&select=rating,played,wins,member:club_members(name,kind,user_id)&order=rating.desc&limit=20`);

export interface TitleRow { game: string; defences: number; won_at: string; holder: { name: string; kind: 'ai' | 'human' } }
export const loadTitles = () => select<TitleRow[]>('titles?select=game,defences,won_at,holder:club_members!titles_holder_fkey(name,kind)');

export interface NewsRow { id: number; created_at: string; kind: string; text: string }
export const loadNews = () => select<NewsRow[]>('club_news?select=id,created_at,kind,text&order=created_at.desc&limit=12');

export const countPlayers = async () => (await select<Array<{ id: string }>>('club_members?kind=eq.human&select=id')).length;
