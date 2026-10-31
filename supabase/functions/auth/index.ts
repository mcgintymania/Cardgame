// Card Club — Supabase Edge Function "auth".
// Username + password accounts with no email, and one-time recovery codes.
//
// POST JSON with an "action":
//   { action: 'signup',  username, password, look? }       -> { ok, session, recoveryCodes }
//   { action: 'login',   username, password }              -> { ok, session }
//   { action: 'recover', username, code, newPassword }     -> { ok, session }
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via editor,
// name it "auth", paste this whole file, Deploy. Then in its settings turn OFF
// "Verify JWT" (people calling it aren't signed in yet). It uses the project's own
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY, which Supabase
// provides to every function automatically: no keys are pasted anywhere.

declare const Deno: any;

export interface Session { access_token: string; refresh_token: string; expires_at: number; user_id: string }

/** Everything the function needs from Supabase, so it can be tested with a stand-in. */
export interface Deps {
  /** Records an attempt; false if this bucket has had `max` attempts in the last `windowSec` seconds. */
  rateLimit(bucket: string, max: number, windowSec: number): Promise<boolean>;
  usernameTaken(username: string): Promise<boolean>;
  createUser(email: string, password: string, meta: Record<string, unknown>): Promise<{ id: string } | { error: string }>;
  setRecoveryCodes(userId: string, codes: string[]): Promise<void>;
  loginEmailFor(username: string): Promise<string | null>;
  useRecoveryCode(username: string, code: string): Promise<string | null>;
  setPassword(userId: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<Session | null>;
}

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'mod', 'support', 'system', 'cardclub', 'card_club', 'dealer', 'lou', 'house', 'staff', 'owner', 'root', 'null', 'undefined', 'you', 'anonymous']);
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => reply(status, { ok: false, error });

export function usernameProblem(u: unknown): string | null {
  if (typeof u !== 'string' || !USERNAME.test(u)) return 'Usernames are 3–20 letters, numbers or underscores.';
  if (RESERVED.has(u.toLowerCase())) return 'That username is reserved. Please pick another.';
  return null;
}

export function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'Passwords need at least 8 characters.';
  if (p.length > 72) return 'Passwords can be at most 72 characters.';
  return null;
}

/** Eight one-time codes like "K7M2-QX9P", from a secure random source without bias. */
export function makeRecoveryCodes(n = 8): string[] {
  const pick = () => {
    const buf = new Uint8Array(1);
    const limit = 256 - (256 % CODE_ALPHABET.length);
    for (;;) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) return CODE_ALPHABET[buf[0] % CODE_ALPHABET.length];
    }
  };
  return Array.from({ length: n }, () => {
    const s = Array.from({ length: 8 }, pick).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'unknown').split(',')[0].trim();
const WRONG = 'Username or password is wrong.';

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, 'Bad request.'); }
  const ip = ipOf(req);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const lower = username.toLowerCase();

  switch (body.action) {
    case 'signup': {
      if (!(await deps.rateLimit(`signup:ip:${ip}`, 5, 3600))) return fail(429, 'Too many new accounts from here. Try again in an hour.');
      const uProb = usernameProblem(username);
      if (uProb) return fail(400, uProb);
      const pProb = passwordProblem(body.password);
      if (pProb) return fail(400, pProb);
      if (await deps.usernameTaken(username)) return fail(409, 'That username is taken.');
      const email = `${crypto.randomUUID()}@users.cardclub.invalid`;
      const look = body.look && typeof body.look === 'object' && JSON.stringify(body.look).length < 4000 ? body.look : undefined;
      const made = await deps.createUser(email, body.password as string, { username, ...(look ? { look } : {}) });
      if ('error' in made) return fail(/taken|exists|duplicate/i.test(made.error) ? 409 : 400, /taken|exists|duplicate/i.test(made.error) ? 'That username is taken.' : 'Could not create the account. Please try again.');
      const codes = makeRecoveryCodes();
      await deps.setRecoveryCodes(made.id, codes);
      const session = await deps.signIn(email, body.password as string);
      return reply(200, { ok: true, session, recoveryCodes: codes });
    }
    case 'login': {
      if (!(await deps.rateLimit(`login:ip:${ip}`, 20, 900))) return fail(429, 'Too many tries. Wait 15 minutes and try again.');
      if (!(await deps.rateLimit(`login:user:${lower}`, 8, 900))) return fail(429, 'Too many tries for this username. Wait 15 minutes and try again.');
      if (!username || typeof body.password !== 'string') return fail(400, WRONG);
      const email = await deps.loginEmailFor(username);
      // Same answer whether or not the username exists.
      const session = email ? await deps.signIn(email, body.password) : null;
      if (!session) return fail(401, WRONG);
      return reply(200, { ok: true, session });
    }
    case 'recover': {
      if (!(await deps.rateLimit(`recover:ip:${ip}`, 6, 3600))) return fail(429, 'Too many tries. Wait an hour and try again.');
      if (!(await deps.rateLimit(`recover:user:${lower}`, 5, 3600))) return fail(429, 'Too many tries for this username. Wait an hour and try again.');
      const pProb = passwordProblem(body.newPassword);
      if (pProb) return fail(400, pProb);
      const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
      const userId = username && code ? await deps.useRecoveryCode(username, code) : null;
      if (!userId) return fail(401, "That username and recovery code don't match. Each code works once.");
      await deps.setPassword(userId, body.newPassword as string);
      const email = await deps.loginEmailFor(username);
      const session = email ? await deps.signIn(email, body.newPassword as string) : null;
      return reply(200, { ok: true, session });
    }
    default:
      return fail(400, 'Unknown action.');
  }
}

// ----------------------------------------------------------- the real Supabase
async function supabaseDeps(): Promise<Deps> {
  const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const db = createClient(url, service, opts);
  return {
    async rateLimit(bucket, max, windowSec) {
      const since = new Date(Date.now() - windowSec * 1000).toISOString();
      const { count } = await db.from('auth_attempts').select('id', { count: 'exact', head: true }).eq('bucket', bucket).gte('at', since);
      await db.from('auth_attempts').insert({ bucket });
      return (count ?? 0) < max;
    },
    async usernameTaken(username) {
      const { data } = await db.from('profiles').select('id').ilike('username', username.replace(/[%_\\]/g, '\\$&')).limit(1);
      return !!data?.length;
    },
    async createUser(email, password, meta) {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
      if (error || !data?.user) return { error: error?.message ?? 'failed' };
      return { id: data.user.id };
    },
    async setRecoveryCodes(userId, codes) {
      const { error } = await db.rpc('recovery_set', { p_user: userId, p_codes: codes });
      if (error) throw error;
    },
    async loginEmailFor(username) {
      const { data } = await db.rpc('login_email_for', { p_username: username });
      return (data as string | null) ?? null;
    },
    async useRecoveryCode(username, code) {
      const { data } = await db.rpc('recovery_use', { p_username: username, p_code: code });
      return (data as string | null) ?? null;
    },
    async setPassword(userId, password) {
      const { error } = await db.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
    },
    async signIn(email, password) {
      const client = createClient(url, anon, opts);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data?.session) return null;
      const s = data.session;
      return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + 3600, user_id: s.user.id };
    },
  };
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  let deps: Promise<Deps> | null = null;
  Deno.serve(async (req: Request) => {
    try {
      deps ??= supabaseDeps();
      return await handle(req, await deps);
    } catch (e) {
      console.error(e);
      return fail(500, 'Something went wrong. Please try again.');
    }
  });
}
