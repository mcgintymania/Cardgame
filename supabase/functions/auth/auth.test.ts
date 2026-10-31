import { describe, expect, test } from 'bun:test';
import { handle, makeRecoveryCodes, passwordProblem, usernameProblem, type Deps, type Session } from './index.ts';

/** An in-memory stand-in for Supabase, enough to exercise the function's rules. */
function fakeSupabase() {
  const users = new Map<string, { id: string; email: string; password: string; username: string; codes: string[] }>();
  const attempts: string[] = [];
  let n = 0;
  const byName = (u: string) => [...users.values()].find((x) => x.username.toLowerCase() === u.toLowerCase());
  const deps: Deps = {
    async rateLimit(bucket, max) { attempts.push(bucket); return attempts.filter((b) => b === bucket).length <= max; },
    async usernameTaken(u) { return !!byName(u); },
    async createUser(email, password, meta) {
      if (byName(meta.username as string)) return { error: 'username taken' };
      const id = `u${++n}`; users.set(id, { id, email, password, username: meta.username as string, codes: [] }); return { id };
    },
    async setRecoveryCodes(id, codes) { users.get(id)!.codes = codes.slice(); },
    async loginEmailFor(u) { return byName(u)?.email ?? null; },
    async useRecoveryCode(u, code) {
      const x = byName(u); if (!x) return null;
      const i = x.codes.indexOf(code); if (i < 0) return null;
      x.codes.splice(i, 1); return x.id;
    },
    async setPassword(id, pw) { users.get(id)!.password = pw; },
    async signIn(email, pw): Promise<Session | null> {
      const x = [...users.values()].find((u) => u.email === email && u.password === pw);
      return x ? { access_token: `t-${x.id}`, refresh_token: 'r', expires_at: 9e9, user_id: x.id } : null;
    },
  };
  return { deps, users, attempts };
}

const post = (body: unknown, ip = '1.1.1.1') => new Request('https://x/functions/v1/auth', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: JSON.stringify(body) });

describe('auth function', () => {
  test('username and password rules', () => {
    expect(usernameProblem('Sean')).toBeNull();
    expect(usernameProblem('a b')).not.toBeNull();
    expect(usernameProblem('ab')).not.toBeNull();
    expect(usernameProblem('Admin')).not.toBeNull();
    expect(passwordProblem('short')).not.toBeNull();
    expect(passwordProblem('long enough')).toBeNull();
  });
  test('recovery codes: eight, unique, no confusable characters', () => {
    const c = makeRecoveryCodes();
    expect(c.length).toBe(8);
    expect(new Set(c).size).toBe(8);
    for (const x of c) expect(x).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });
  test('sign up, sign in, wrong password, taken username', async () => {
    const { deps, users } = fakeSupabase();
    const r = await (await handle(post({ action: 'signup', username: 'Sean', password: 'cards4ever' }), deps)).json();
    expect(r.ok).toBe(true);
    expect(r.session.access_token).toBe('t-u1');
    expect(r.recoveryCodes.length).toBe(8);
    expect([...users.values()][0].email).toMatch(/@users\.cardclub\.invalid$/);
    const taken = await handle(post({ action: 'signup', username: 'sean', password: 'cards4ever' }), deps);
    expect(taken.status).toBe(409);
    const ok = await (await handle(post({ action: 'login', username: 'SEAN', password: 'cards4ever' }), deps)).json();
    expect(ok.ok).toBe(true);
    const bad = await handle(post({ action: 'login', username: 'Sean', password: 'nope-nope' }), deps);
    const ghost = await handle(post({ action: 'login', username: 'Nobody', password: 'nope-nope' }), deps);
    expect(bad.status).toBe(401);
    expect((await bad.json()).error).toBe((await ghost.json()).error); // same message either way
  });
  test('recovery: a code works once and sets the new password', async () => {
    const { deps } = fakeSupabase();
    const { recoveryCodes } = await (await handle(post({ action: 'signup', username: 'Brother', password: 'first-pass' }), deps)).json();
    const r = await (await handle(post({ action: 'recover', username: 'brother', code: recoveryCodes[0].toLowerCase(), newPassword: 'second-pass' }), deps)).json();
    expect(r.ok).toBe(true);
    expect((await handle(post({ action: 'login', username: 'Brother', password: 'second-pass' }), deps)).status).toBe(200);
    expect((await handle(post({ action: 'recover', username: 'Brother', code: recoveryCodes[0], newPassword: 'third-pass' }), deps)).status).toBe(401);
  });
  test('rate limits kick in', async () => {
    const { deps } = fakeSupabase();
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await handle(post({ action: 'login', username: 'Sean', password: 'whatever1' }), deps)).status;
    expect(last).toBe(429);
    for (let i = 0; i < 5; i++) await handle(post({ action: 'signup', username: `p${i}x`, password: 'cards4ever' }, '9.9.9.9'), deps);
    expect((await handle(post({ action: 'signup', username: 'p6x', password: 'cards4ever' }, '9.9.9.9'), deps)).status).toBe(429);
  });
  test('CORS preflight and bad input', async () => {
    const { deps } = fakeSupabase();
    const pre = await handle(new Request('https://x', { method: 'OPTIONS' }), deps);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await handle(new Request('https://x', { method: 'POST', body: 'not json' }), deps)).status).toBe(400);
    expect((await handle(post({ action: 'dance' }), deps)).status).toBe(400);
  });
});
