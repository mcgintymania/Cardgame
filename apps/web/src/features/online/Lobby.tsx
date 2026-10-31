// Play with friends: make a table (you get a code to share), join one with a
// code, wait for everyone, and start. Empty chairs are filled by club members.

import React, { useEffect, useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store } from '../../lib/store.ts';
import { Button, Tag } from '../../design/ui.tsx';
import { useShown } from '../../lib/games.ts';
import { OnlineError, online } from '../../lib/online/client.ts';
import { createTable, joinTable, leaveTable, myTables, roomInfo, startTable, tableSettings, type RoomInfo } from '../../lib/online/tables.ts';
import { ONLINE, ONLINE_GAMES, type OnlineGame } from '../../../../../packages/engine/src/online/registry.ts';
import { POKER_PRESETS } from '../poker/Setup.tsx';

const NAMES: Record<OnlineGame, string> = { take2: 'Take 2', poker: "Hold'em", draw: 'Five-Card Draw', hearts: 'Hearts', gin: 'Gin Rummy', blackjack: 'Blackjack' };
const DEFAULT_SEATS: Record<OnlineGame, number> = { take2: 4, poker: 6, draw: 4, hearts: 4, gin: 2, blackjack: 4 };
const msg = (e: unknown) => (e instanceof OnlineError ? e.message : 'Something went wrong. Please try again.');

/** Your house rules for the game, as set up on this device. */
function rulesFor(game: OnlineGame): Record<string, unknown> {
  const s = store.get();
  switch (game) {
    case 'take2': return (s.take2Rules ?? {}) as Record<string, unknown>;
    case 'hearts': return (s.heartsRules ?? {}) as Record<string, unknown>;
    case 'gin': return (s.ginRules ?? {}) as Record<string, unknown>;
    case 'blackjack': return (s.bjRules ?? {}) as Record<string, unknown>;
    case 'poker': return { ...POKER_PRESETS.tournament.config, variant: 'holdem' };
    case 'draw': return { ...POKER_PRESETS.tournament.config, variant: 'draw' };
  }
}

function WaitingRoom({ roomId, nav, onLeft }: { roomId: string; nav: Nav; onLeft: () => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof roomInfo>>>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = online.session?.user_id;

  useEffect(() => {
    let live = true;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const i = await roomInfo(roomId);
        if (!live) return;
        if (!i || i.room.status === 'abandoned' || i.room.status === 'finished') { onLeft(); return; }
        setInfo(i);
        if (i.room.status === 'playing') { await nav.startOnline(roomId); return; }
      } catch (e) { if (live) setError(msg(e)); }
      if (live) t = setTimeout(poll, 1500);
    };
    void poll();
    return () => { live = false; clearTimeout(t); };
  }, [roomId]);

  if (!info) return <section className="panel"><p className="muted">Opening the table…</p>{error && <p className="item-msg is-error">{error}</p>}</section>;
  const { room, seats, names } = info;
  const isHost = room.host === me;
  const [lo, hi] = ONLINE[room.game].seats;
  const total = room.config.seats ?? lo;
  const people = seats.filter((s) => s.user_id);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(msg(e)); } finally { setBusy(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(room.code); setCopied(true); } catch { /* clipboard not allowed */ } };

  return (
    <section className="panel waiting-room">
      <p className="eyebrow">{NAMES[room.game]} · waiting for players</p>
      <div className="room-code">
        <span><small>Table code</small><b>{room.code}</b></span>
        <Button variant="ghost" size="sm" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</Button>
      </div>
      <p className="muted small">Send this code to your brothers. They open Online, choose <b>Join a table</b> and type it in.</p>
      <ol className="room-seats">
        {Array.from({ length: total }, (_, i) => {
          const s = people[i];
          return (
            <li key={i} className={s ? 'is-filled' : ''}>
              <span className="rs-num">{i + 1}</span>
              {s ? <b>{names[s.user_id!]?.username ?? 'Player'}{s.user_id === room.host && <Tag>Host</Tag>}{s.user_id === me && <Tag tone="ok">You</Tag>}</b>
                : <em className="muted">Open seat · a club member sits here if nobody joins</em>}
            </li>
          );
        })}
      </ol>
      {isHost && (
        <div className="seat-stepper">
          <span>Seats at the table</span>
          <Button variant="ghost" size="sm" disabled={busy || total <= Math.max(lo, people.length)} onClick={() => run(() => tableSettings(roomId, total - 1).then(async () => setInfo(await roomInfo(roomId))))}>−</Button>
          <b>{total}</b>
          <Button variant="ghost" size="sm" disabled={busy || total >= hi} onClick={() => run(() => tableSettings(roomId, total + 1).then(async () => setInfo(await roomInfo(roomId))))}>+</Button>
        </div>
      )}
      {error && <p className="item-msg is-error" role="alert">{error}</p>}
      <div className="btn-row">
        {isHost
          ? <Button size="lg" disabled={busy} onClick={() => run(async () => { await startTable(roomId); await nav.startOnline(roomId); })}>{people.length < total ? `Start (club members fill ${total - people.length} ${total - people.length === 1 ? 'seat' : 'seats'})` : 'Start the game'}</Button>
          : <p className="muted">Waiting for {names[room.host ?? '']?.username ?? 'the host'} to start…</p>}
        <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await leaveTable(roomId); onLeft(); })}>Leave table</Button>
      </div>
    </section>
  );
}

/** A table to open in the waiting room next time the lobby shows (after a rematch). */
let nextRoom: string | null = null;
export function openRoomNext(roomId: string | null) { nextRoom = roomId; }

export function Lobby({ nav }: { nav: Nav }) {
  const { shows } = useShown();
  const games = ONLINE_GAMES.filter((g) => shows(g));
  const [game, setGame] = useState<OnlineGame>(games[0] ?? 'take2');
  const [seats, setSeats] = useState<number>(DEFAULT_SEATS[games[0] ?? 'take2']);
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<string | null>(() => { const r = nextRoom; nextRoom = null; return r; });
  const [mine, setMine] = useState<RoomInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => { myTables().then(setMine).catch(() => {}); };
  useEffect(refresh, [room]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(msg(e)); } finally { setBusy(false); } };
  const pick = (g: OnlineGame) => { setGame(g); setSeats(DEFAULT_SEATS[g]); };
  const [lo, hi] = ONLINE[game].seats;

  if (room) return <WaitingRoom roomId={room} nav={nav} onLeft={() => setRoom(null)} />;

  return (
    <>
      {mine.length > 0 && (
        <section className="panel">
          <h2 className="h-sec">Your tables</h2>
          <ul className="my-tables">
            {mine.map((r) => (
              <li key={r.id}>
                <span><b>{NAMES[r.game]}</b><small>{r.status === 'playing' ? 'In play' : 'Waiting to start'} · code {r.code}</small></span>
                <Button size="sm" onClick={() => (r.status === 'playing' ? run(() => nav.startOnline(r.id)) : setRoom(r.id))}>{r.status === 'playing' ? 'Back to the table' : 'Open'}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="h-sec">Play with friends</h2>
        <div className="tab-strip" role="tablist">
          {games.map((g) => <button key={g} role="tab" aria-selected={game === g} className={`tab-chip ${game === g ? 'is-on' : ''}`} onClick={() => pick(g)}>{NAMES[g]}</button>)}
        </div>
        {lo !== hi && (
          <div className="seat-stepper">
            <span>Seats at the table</span>
            <Button variant="ghost" size="sm" disabled={seats <= lo} onClick={() => setSeats(seats - 1)}>−</Button>
            <b>{seats}</b>
            <Button variant="ghost" size="sm" disabled={seats >= hi} onClick={() => setSeats(seats + 1)}>+</Button>
          </div>
        )}
        <p className="muted small">You get a code to send to your brothers. Any seats still empty when you start are filled by club members. Your house rules from this device are used.</p>
        <div className="btn-row"><Button size="lg" disabled={busy} onClick={() => run(async () => { const r = await createTable(game, seats, rulesFor(game)); setRoom(r.roomId); })}>Make a {NAMES[game]} table</Button></div>
      </section>

      <section className="panel">
        <h2 className="h-sec">Join a table</h2>
        <form className="join-row" onSubmit={(e: { preventDefault: () => void }) => { e.preventDefault(); void run(async () => { const r = await joinTable(code); setRoom(r.roomId); }); }}>
          <input className="input code-input" value={code} maxLength={6} autoCapitalize="characters" spellCheck={false} placeholder="CODE"
            aria-label="Table code" onChange={(e: { target: HTMLInputElement }) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <Button type="submit" disabled={busy || code.length !== 6}>Join</Button>
        </form>
      </section>
      {error && <p className="item-msg is-error" role="alert">{error}</p>}
    </>
  );
}
