// Online account: sign in, create an account (username + password, no email),
// recover with a one-time code, and see the shared club from the server.

import React, { useEffect, useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { useStore } from '../../lib/store.ts';
import { Button, Tag } from '../../design/ui.tsx';
import { GAMES, GAME_NAMES, type GameId } from '../../lib/roster.ts';
import { useShown } from '../../lib/games.ts';
import {
  OnlineError, countPlayers, loadBoard, loadMe, loadNews, recover, signIn, signOut, signUp,
  type BoardRow, type MyAccount, type NewsRow,
} from '../../lib/online/client.ts';
import { useSession } from '../../lib/online/useOnline.ts';
import { Lobby } from './Lobby.tsx';
import { SaveStatus } from './SaveStatus.tsx';
import { syncBeforeSignOut } from '../../lib/online/cloudSave.ts';
import { levelInfo } from '../../lib/progress.ts';
import { forgetWelcomeChoice } from './Welcome.tsx';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const msg = (e: unknown) => (e instanceof OnlineError ? e.message : 'Something went wrong. Please try again.');

function Field({ id, label, hint, ...rest }: { id: string; label: string; hint?: string } & Record<string, unknown>) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input id={id} className="input" {...rest} />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function SignedOut({ onCodes, start = 'in' }: { onCodes: (codes: string[]) => void; start?: 'in' | 'up' | 'recover' }) {
  const { profile } = useStore();
  const [tab, setTab] = useState<'in' | 'up' | 'recover'>(start);
  const [username, setUsername] = useState(profile?.name?.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) ?? '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setDone(null);
    try { await fn(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (tab === 'in') return run(() => signIn(username.trim(), password));
    if (tab === 'up') {
      if (!USERNAME_RE.test(username.trim())) { setError('Usernames are 3–20 letters, numbers or underscores.'); return; }
      if (password.length < 8) { setError('Passwords need at least 8 characters.'); return; }
      if (password !== password2) { setError("The two passwords don't match."); return; }
      return run(async () => { const codes = await signUp(username.trim(), password, profile?.avatar); onCodes(codes); });
    }
    if (password.length < 8) { setError('Passwords need at least 8 characters.'); return; }
    if (password !== password2) { setError("The two passwords don't match."); return; }
    return run(async () => { await recover(username.trim(), code.trim(), password); setDone('Password changed. You are signed in.'); });
  };

  return (
    <section className="panel online-auth">
      <div className="tab-strip" role="tablist">
        {([['in', 'Sign in'], ['up', 'Create account'], ['recover', 'Forgot password']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab-chip ${tab === k ? 'is-on' : ''}`} onClick={() => { setTab(k); setError(null); }}>{l}</button>
        ))}
      </div>
      <form className="online-form" onSubmit={submit}>
        <Field id="ol-user" label="Username" value={username} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20}
          onChange={(e: { target: HTMLInputElement }) => setUsername(e.target.value)} hint={tab === 'up' ? '3–20 letters, numbers or underscores. Other players will see it.' : undefined} />
        {tab === 'recover' && (
          <Field id="ol-code" label="Recovery code" value={code} autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX"
            onChange={(e: { target: HTMLInputElement }) => setCode(e.target.value)} hint="One of the codes you saved when you made your account. Each works once." />
        )}
        <Field id="ol-pass" label={tab === 'recover' ? 'New password' : 'Password'} type="password" value={password}
          autoComplete={tab === 'in' ? 'current-password' : 'new-password'} onChange={(e: { target: HTMLInputElement }) => setPassword(e.target.value)}
          hint={tab === 'in' ? undefined : 'At least 8 characters.'} />
        {tab !== 'in' && (
          <Field id="ol-pass2" label="Type it again" type="password" value={password2} autoComplete="new-password"
            onChange={(e: { target: HTMLInputElement }) => setPassword2(e.target.value)} />
        )}
        {error && <p className="item-msg is-error" role="alert">{error}</p>}
        {done && <p className="item-msg" role="status">{done}</p>}
        <div className="btn-row">
          <Button size="lg" type="submit" disabled={busy}>{busy ? 'One moment…' : tab === 'in' ? 'Sign in' : tab === 'up' ? 'Create my account' : 'Change password'}</Button>
        </div>
      </form>
      <p className="fine">No email is needed or stored. If you forget your password, one of your recovery codes is the only way back in, so keep them somewhere safe.</p>
    </section>
  );
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Card Club recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  const download = () => {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = 'card-club-recovery-codes.txt';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* not allowed here */ }
  };
  return (
    <section className="panel recovery">
      <p className="eyebrow">Account created</p>
      <h2 className="display h-md">Save your recovery codes</h2>
      <p>There's no email, so these codes are the only way back in if you forget your password. Each one works once. We can't show them again.</p>
      <ol className="codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="btn-row">
        <Button variant="ghost" onClick={copy}>{copied ? 'Copied' : 'Copy them'}</Button>
        <Button variant="ghost" onClick={download}>Download as a file</Button>
      </div>
      <label className="check-row"><input type="checkbox" checked={saved} onChange={(e: { target: HTMLInputElement }) => setSaved(e.target.checked)} /> I've saved my recovery codes somewhere safe</label>
      <div className="btn-row"><Button size="lg" disabled={!saved} onClick={onDone}>Continue</Button></div>
    </section>
  );
}

function SignedIn({ nav }: { nav: Nav }) {
  const { games, shows } = useShown();
  const [me, setMe] = useState<MyAccount | null>(null);
  const [news, setNews] = useState<NewsRow[]>([]);
  const [players, setPlayers] = useState<number | null>(null);
  const [game, setGame] = useState<GameId>(games[0] ?? 'take2');
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useSession();
  const { wallet } = useStore();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([loadMe(), loadNews(), countPlayers()])
      .then(([m, n, c]) => { if (live) { setMe(m); setNews(n); setPlayers(c); } })
      .catch((e) => live && setError(msg(e)));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    setBoard(null);
    loadBoard(game).then((b) => live && setBoard(b)).catch((e) => live && setError(msg(e)));
    return () => { live = false; };
  }, [game]);

  return (
    <>
      <section className="panel online-me">
        <div className="online-me-row">
          <span>
            <p className="eyebrow">Signed in</p>
            <h2 className="display h-md">{me?.username ?? '…'}</h2>
            {me && <small className="muted">Member since {new Date(me.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</small>}
          </span>
          <span className="online-me-stats">
            <span><b>{wallet.coins.toLocaleString('en-GB')}</b><small>coins</small></span>
            <span><b>{levelInfo(wallet.xp).level}</b><small>level</small></span>
            {players !== null && <span><b>{players}</b><small>{players === 1 ? 'player' : 'players'}</small></span>}
          </span>
        </div>
        {error && <p className="item-msg is-error" role="alert">{error}</p>}
        <div className="btn-row"><Button variant="ghost" disabled={leaving} onClick={async () => { setLeaving(true); await syncBeforeSignOut(); forgetWelcomeChoice(); signOut(); }}>{leaving ? 'Saving…' : 'Sign out'}</Button></div>
        <SaveStatus />
      </section>

      <Lobby nav={nav} />


      <section className="panel">
        <h2 className="h-sec">Online rankings</h2>
        <div className="tab-strip" role="tablist">
          {GAMES.filter((g) => shows(g)).map((g) => <button key={g} role="tab" aria-selected={game === g} className={`tab-chip ${game === g ? 'is-on' : ''}`} onClick={() => setGame(g)}>{GAME_NAMES[g]}</button>)}
        </div>
        {!board ? <p className="muted">Loading…</p> : (
          <ol className="online-board">
            {board.map((r, i) => (
              <li key={i} className={r.member.user_id === session?.user_id ? 'is-me' : r.member.kind === 'human' ? 'is-player' : ''}>
                <span className="ob-rank">{i + 1}</span>
                <span className="ob-name">{r.member.name}{r.member.kind === 'human' && <Tag>{r.member.user_id === session?.user_id ? 'You' : 'Player'}</Tag>}</span>
                <span className="ob-rating">{r.rating}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2 className="h-sec">Club news</h2>
        <ul className="online-news">{news.map((n) => <li key={n.id}><small>{new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small> {n.text}</li>)}</ul>
      </section>
    </>
  );
}

export function OnlinePage({ nav }: { nav: Nav }) {
  const session = useSession();
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <div className="page online">
      <header className="page-head">
        <p className="eyebrow">The club, online</p>
        <h1 className="display h-lg">Online</h1>
        <p className="lede">Play your friends and family at a real table, from anywhere. Every online game counts in the online rankings.</p>
      </header>
      {codes ? <RecoveryCodes codes={codes} onDone={() => setCodes(null)} /> : session ? <SignedIn nav={nav} /> : <SignedOut onCodes={setCodes} />}
      <section className="panel panel-quiet">
        <h2 className="h-sec">How online play works</h2>
        <ul className="plain-list">
          <li><b>Tables with friends and family</b> for Take 2, Hold'em, Five-Card Draw, Hearts, Gin Rummy and Blackjack. Club members fill any empty seats.</li>
          <li><b>Every online game counts</b> for the shared club: rankings, head-to-heads and club news, and pays coins and XP into your wallet.</li>
          <li><b>Fair play:</b> the cards are shuffled and dealt on the server. Nobody's browser ever sees another player's hand or the deck.</li>
          <li><b>Say it to their face:</b> quick phrases and emotes reach everyone at the table. After the game, <b>Rematch</b> keeps the same group together, no new code needed.</li>
          <li><b>Slow player?</b> After a minute, anyone at the table can be nudged and the game plays a safe move for them. If someone leaves, a club member finishes their game.</li>
          <li><b>One wallet:</b> while you're signed in, your coins, items, level and records are saved to your account and follow you to any phone or computer. Games played offline catch up when you're back online.</li>
        </ul>
        <div className="btn-row"><Button variant="ghost" onClick={() => nav.go('play')}>Play offline</Button></div>
      </section>
    </div>
  );
}
