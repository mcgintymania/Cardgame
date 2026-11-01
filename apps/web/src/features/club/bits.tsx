// Shared pieces for the club: outcome card, belts, member profiles, seat picker.

import React from 'react';
import { Avatar } from '../../design/Avatar.tsx';
import { Character } from '../../design/Character.tsx';
import { CATALOGUE } from '../../lib/catalogue.ts';
import { winsAgainst } from '../../lib/progress.ts';
import { Button, Sheet, Stepper, Tag } from '../../design/ui.tsx';
import { useStore } from '../../lib/store.ts';
import { useShown } from '../../lib/games.ts';
import {
  GAME_NAMES, STYLE_LABEL, rosterById, skillLabel, type GameId,
} from '../../lib/roster.ts';
import {
  ME, TITLE_SHOT_RANK, cabinetFor, cupName, nameOf, ordinal, rankOf, rankings, titleName, titleStatus, type Outcome, type Reign,
} from '../../lib/club.ts';

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const daysBetween = (a: string, b: string | null) => Math.max(1, Math.round(((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 86400000));

export function OutcomeCard({ outcome }: { outcome: Outcome }) {
  return (
    <div className={`outcome outcome-${outcome.tone}`} role="status">
      <p className="outcome-head display">{outcome.headline}</p>
      {outcome.lines.map((l, i) => <p key={i} className="outcome-line">{l}</p>)}
    </div>
  );
}

/** A belt (title) or cup emblem drawn in SVG. */
export function Emblem({ kind, game, size = 44, dim }: { kind: 'belt' | 'cup'; game: GameId; size?: number; dim?: boolean }) {
  const metal = dim ? '#8a7d68' : '#e2bd68';
  const gem = ({ take2: '#2f8463', poker: '#a83434', hearts: '#c2456a', gin: '#3d6fa8', draw: '#7a4fb0', blackjack: '#e8e0cc' } as Record<GameId, string>)[game];
  if (kind === 'cup') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="emblem">
        <path d="M14 8 H34 V18 C34 26 29 30 24 30 C19 30 14 26 14 18 Z" fill={metal} />
        <path d="M14 11 H8 C8 18 11 21 15 21 M34 11 H40 C40 18 37 21 33 21" stroke={metal} strokeWidth="2.5" fill="none" />
        <rect x="21" y="29" width="6" height="7" fill={metal} />
        <rect x="15" y="36" width="18" height="5" rx="1.5" fill={metal} />
        <circle cx="24" cy="17" r="3.5" fill={gem} />
        <path d="M17 10 Q18 20 22 25" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="emblem">
      <rect x="1" y="17" width="46" height="14" rx="3" fill="#3a2414" />
      <rect x="1" y="19" width="46" height="2" fill={metal} opacity=".6" />
      <rect x="1" y="27" width="46" height="2" fill={metal} opacity=".6" />
      <path d="M14 10 H34 L38 24 L34 38 H14 L10 24 Z" fill={metal} />
      <path d="M17 14 H31 L34 24 L31 34 H17 L14 24 Z" fill="none" stroke="#7a541b" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="5" fill={gem} stroke="#7a541b" strokeWidth="1" />
    </svg>
  );
}

export function ReignLine({ game, reign }: { game: GameId; reign: Reign }) {
  return (
    <span className="reign">
      <b>{titleName(game)}</b>
      <small>
        {shortDate(reign.won)} – {reign.lost ? shortDate(reign.lost) : 'now'} · {daysBetween(reign.won, reign.lost)} days ·{' '}
        {reign.defences} defence{reign.defences === 1 ? '' : 's'}
      </small>
    </span>
  );
}

export function TrophyShelf({ id }: { id: string }) {
  const { club } = useStore();
  const { games, shows } = useShown();
  const all = cabinetFor(club, id);
  const cab = { ...all, current: all.current.filter((x) => shows(x.game)), past: all.past.filter((x) => shows(x.game)), cups: all.cups.filter((c) => shows(c.game)) };
  const cupsByGame = games.map((g) => ({ g, n: cab.cups.filter((c) => c.game === g).length })).filter((x) => x.n > 0);
  if (!cab.current.length && !cab.past.length && !cab.cups.length) {
    return <p className="empty">No titles or cups yet.{id === ME ? ' Win a Club Cup or take a title to fill this shelf.' : ''}</p>;
  }
  return (
    <div className="shelf">
      {cab.current.map(({ game, reign }) => (
        <div key={`c${game}`} className="trophy is-current">
          <Emblem kind="belt" game={game} size={52} />
          <span className="trophy-text">
            <Tag tone="brass">Champion</Tag>
            <ReignLine game={game} reign={reign} />
          </span>
        </div>
      ))}
      {cupsByGame.map(({ g, n }) => (
        <div key={`cup${g}`} className="trophy">
          <Emblem kind="cup" game={g} size={48} />
          <span className="trophy-text">
            <b>{cupName(g)} × {n}</b>
            <small>Editions {cab.cups.filter((c) => c.game === g).map((c) => c.edition).join(', ')}</small>
          </span>
        </div>
      ))}
      {cab.past.map(({ game, reign }, i) => (
        <div key={`p${i}`} className="trophy is-past">
          <Emblem kind="belt" game={game} size={40} dim />
          <span className="trophy-text"><small className="past-label">Former champion</small><ReignLine game={game} reign={reign} /></span>
        </div>
      ))}
    </div>
  );
}

export function MemberSheet({ id, onClose, myName }: { id: string | null; onClose: () => void; myName: string }) {
  const { club, profile, wallet } = useStore();
  if (!id) return null;
  const isMe = id === ME;
  const m = rosterById(id);
  const name = isMe ? myName : m?.name ?? id;
  const h2h = club.h2h[id];
  const sig = CATALOGUE.find((i) => i.unlock.kind === 'signature' && i.unlock.member === id);
  const { games } = useShown();
  return (
    <Sheet open={!!id} onClose={onClose} title={name} wide>
      <div className="member-head">
        <div className="dressing-stage member-figure"><Character look={isMe ? profile!.avatar : m!.avatar} width="100%" height="100%" /></div>
        <div>
          {m && <p className="muted">{m.tagline}</p>}
          {m && <p className="small"><Tag>{STYLE_LABEL[m.style]}</Tag></p>}
          {sig && <p className="small sig-line">Signature: <b>{sig.name}</b> · {wallet.owned.includes(sig.id) ? 'yours now' : `beat ${name.split(' ')[0]} 5 times to win it (${Math.min(5, winsAgainst(club, id))}/5)`}</p>}
        </div>
      </div>
      <div className="member-games">
        {games.map((g) => {
          const st = club.players[id][g];
          const plays = isMe || (m && m.skill[g] > 0);
          return (
            <div key={g} className="mg">
              <p className="h-sec">{GAME_NAMES[g]}</p>
              {plays ? (
                <dl className="statgrid">
                  <div><dt>Rank</dt><dd>{ordinal(rankOf(club, g, id))}<small>/{rankings(club, g).length}</small></dd></div>
                  <div><dt>Rating</dt><dd>{st.rating}</dd></div>
                  <div><dt>Won</dt><dd>{st.wins}<small>/{st.played}</small></dd></div>
                  {m && <div><dt>Level</dt><dd className="small">{skillLabel(m.skill[g])}</dd></div>}
                </dl>
              ) : <p className="empty">Doesn't play {GAME_NAMES[g]}.</p>}
              {!isMe && h2h && h2h[g].w + h2h[g].l > 0 && (
                <p className="h2h">Head to head: <b>you {h2h[g].w}–{h2h[g].l}</b> {h2h[g].w > h2h[g].l ? '· you lead' : h2h[g].w < h2h[g].l ? `· ${name.split(' ')[0]} leads` : '· all square'}</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="h-sec">Trophies</p>
      <TrophyShelf id={id} />
    </Sheet>
  );
}

/** The title strip on a game's setup page. */
export function TitleStrip({ game, onClick }: { game: GameId; onClick: () => void }) {
  const { club } = useStore();
  const status = titleStatus(club, game);
  return (
    <button className="event-strip" onClick={onClick}>
      <span>
        <b>{titleName(game)}</b>
        <small>{status.kind === 'champion' ? "You're the champion. Defend it at the club." : status.kind === 'eligible' ? `You've earned a shot at ${nameOf(status.holder)}.` : `Held by ${nameOf(status.holder)}. Reach the top ${TITLE_SHOT_RANK} for a shot (you're ${ordinal(status.myRank)}).`}</small>
      </span>
      <span className="chev" aria-hidden="true">›</span>
    </button>
  );
}

/** Choose how many opponents; the club fills the seats. */
export function SeatPicker({ game, count, min, max, ids, onCount, onShuffle, onTap }: {
  game: GameId; count: number; min: number; max: number; ids: string[];
  onCount: (n: number) => void; onShuffle: () => void; onTap: (id: string) => void;
}) {
  const { club } = useStore();
  return (
    <div className="panel seat-picker">
      {min !== max ? (
        <Stepper id={`${game}-count`} label="Opponents" hint="Seats are filled from the club, matched roughly to your level."
          value={count} min={min} max={max} onChange={onCount} />
      ) : (
        <div className="row-setting"><span className="row-text"><span className="row-label">{count === 1 ? 'Opponent' : `${count} opponents`}</span><span className="row-hint">Chosen from the club, matched roughly to your level.</span></span></div>
      )}
      <div className="seat-row">
        {ids.map((id) => {
          const m = rosterById(id)!;
          return (
            <button key={id} className="seat-chip" onClick={() => onTap(id)} aria-label={`${m.name}, rating ${club.players[id][game].rating}`}>
              <Avatar config={m.avatar} size={44} />
              <span className="seat-chip-name">{m.name.split(' ')[0]}</span>
              <span className="seat-chip-meta">{club.players[id][game].rating}</span>
            </button>
          );
        })}
      </div>
      <div className="btn-row"><Button variant="ghost" size="sm" onClick={onShuffle}>Shuffle seats</Button></div>
    </div>
  );
}
