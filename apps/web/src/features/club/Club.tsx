import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Avatar } from '../../design/Avatar.tsx';
import { Button, Segmented, Tag } from '../../design/ui.tsx';
import { GAME_NAMES, rosterById, type GameId } from '../../lib/roster.ts';
import { useShown } from '../../lib/games.ts';
import {
  ME, KNOCKOUT_ROUND, cupName, nameOf, ordinal, rankOf, rankings, startCup, titleName, titleStatus, TITLE_SHOT_RANK,
} from '../../lib/club.ts';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { Emblem, MemberSheet, daysBetween, shortDate } from './bits.tsx';

export function ClubPage({ nav }: { nav: Nav }) {
  const { club, profile } = useStore();
  const { games, shows } = useShown();
  const [pick, setGame] = useState<GameId>(games[0] ?? 'take2');
  const game = games.includes(pick) ? pick : games[0] ?? 'take2';
  const [member, setMember] = useState<string | null>(null);
  if (!profile) return null;
  const avatarOf = (id: string) => (id === ME ? profile.avatar : rosterById(id)!.avatar);
  const name = (id: string) => nameOf(id, profile.name);
  // A Cup in a hidden game stays saved but isn't shown.
  const t = club.tournament && shows(club.tournament.game) ? club.tournament : null;
  const knockout = t?.format === 'knockout';
  const round = knockout ? t!.rounds![t!.rounds!.length - 1] : [];

  return (
    <div className="page club">
      <header className="page-head">
        <p className="eyebrow">25 members · open every night</p>
        <h1 className="display h-lg">The Club</h1>
        <div className="my-standing">
          {games.map((g) => (
            <span key={g} className="standing-chip">
              <small>{GAME_NAMES[g]}</small>
              <b>{ordinal(rankOf(club, g, ME))}</b>
              <em>{club.players[ME][g].rating}</em>
            </span>
          ))}
        </div>
      </header>

      <section className="block">
        <h2 className="h-sec">Titles</h2>
        <div className="belts">
          {games.map((g) => {
            const reign = club.titles[g].current;
            const st = titleStatus(club, g);
            const mine = reign.holder === ME;
            return (
              <article key={g} className={`belt-card belt-${g} ${mine ? 'is-mine' : ''}`}>
                <div className="belt-top">
                  <Emblem kind="belt" game={g} size={56} />
                  <div>
                    <p className="eyebrow">{titleName(g)}</p>
                    <button className="belt-holder" onClick={() => setMember(reign.holder)}>
                      <Avatar config={avatarOf(reign.holder)} size={40} />
                      <span>
                        <b>{mine ? 'You' : name(reign.holder)}</b>
                        <small>Since {shortDate(reign.won)} · {daysBetween(reign.won, null)} days · {reign.defences} defence{reign.defences === 1 ? '' : 's'}</small>
                      </span>
                    </button>
                  </div>
                </div>
                <div className="belt-action">
                  {st.kind === 'champion' && (
                    <>
                      <p className="small">{name(st.challenger)} is the top contender.</p>
                      <Button onClick={() => nav.startEvent(g, 'title')}>Defend your title</Button>
                    </>
                  )}
                  {st.kind === 'eligible' && (
                    <>
                      <p className="small">You're in the top {TITLE_SHOT_RANK}. One on one for the title.</p>
                      <Button onClick={() => nav.startEvent(g, 'title')}>Challenge {name(st.holder).split(' ')[0]}</Button>
                    </>
                  )}
                  {st.kind === 'locked' && (
                    <p className="small muted">Reach the top {TITLE_SHOT_RANK} contenders for a title shot. You're {ordinal(st.myRank)}.</p>
                  )}
                </div>
                {club.titles[g].history.length > 0 && (
                  <p className="fine">Previous champions: {club.titles[g].history.slice(-3).reverse().map((r) => `${name(r.holder).split(' ')[0]} (${r.defences})`).join(' · ')}</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="block">
        <h2 className="h-sec">Club Cup</h2>
        <div className="panel cup-panel">
          {t && t.stage !== 'done' ? (
            <>
              <div className="cup-head">
                <Emblem kind="cup" game={t.game} size={48} />
                <div>
                  <b>{cupName(t.game)} · edition {t.edition}</b>
                  <p className="small muted">{knockout
                    ? (round.length === 2 ? "You're in the final. One match for the Cup." : `${KNOCKOUT_ROUND[round.length]}s. Win one on one to go through.`)
                    : t.stage === 'heat' ? 'Your heat is waiting. Finish in the top two to reach the final.' : "You're in the final. Four players, one Cup."}</p>
                </div>
              </div>
              <div className="heats">
                {(knockout
                  ? Array.from({ length: round.length / 2 }, (_, i) => ({ label: round.length === 2 ? 'Final' : `${KNOCKOUT_ROUND[round.length]} ${i + 1}`, ids: round.slice(i * 2, i * 2 + 2) }))
                  : t.stage === 'heat' ? t.heats.map((h, i) => ({ label: `Heat ${i + 1}`, ids: h })) : [{ label: 'Final', ids: t.finalists! }]).map((h) => (
                  <div key={h.label} className="heat">
                    <small>{h.label}</small>
                    <div className="heat-row">
                      {h.ids.map((id) => (
                        <button key={id} className={`heat-chip ${id === ME ? 'is-me' : ''}`} onClick={() => setMember(id)}>
                          <Avatar config={avatarOf(id)} size={34} />
                          <span>{id === ME ? 'You' : name(id).split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Button size="lg" onClick={() => nav.startEvent(t.game, t.stage === 'heat' ? 'cupHeat' : 'cupFinal')}>
                {t.stage === 'final' ? 'Play the final' : knockout ? `Play your ${KNOCKOUT_ROUND[round.length].toLowerCase()}` : 'Play your heat'}
              </Button>
            </>
          ) : (
            <>
              <p className="muted">Eight players enter, in two heats of four; the top two from each heat play the final.{shows('gin') ? ' Gin Rummy is a one-on-one knockout instead: quarter-final, semi-final, final.' : ''} Win it to put a Cup on your shelf.</p>
              {t?.stage === 'done' && t.finalResult && (
                <p className="small">Last Cup: <b>{name(t.finalResult[0])}</b> won the {cupName(t.game)}, beating {name(t.finalResult[1]).split(' ')[0]} in the final.</p>
              )}
              <div className="btn-row">
                {games.map((g) => (
                  <Button key={g} variant="ghost" onClick={() => { store.setClub(startCup(store.get().club, g, cryptoRng())); }}>
                    Enter the {GAME_NAMES[g]} Cup <small className="ed">· No. {club.cupEdition[g]}</small>
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="block">
        <div className="sec-row">
          <h2 className="h-sec">Rankings</h2>
          <Segmented id="rank-game" label="" value={game} options={games.map((g) => ({ value: g, label: GAME_NAMES[g] }))} onChange={setGame} />
        </div>
        <ol className="ladder">
          {rankings(club, game).map((id, i) => {
            const st = club.players[id][game];
            const champ = club.titles[game].current.holder === id;
            return (
              <li key={id}>
                <button className={`ladder-row ${id === ME ? 'is-me' : ''}`} onClick={() => setMember(id)}>
                  <span className="ladder-rank">{i + 1}</span>
                  <Avatar config={avatarOf(id)} size={34} />
                  <span className="ladder-name">
                    <b>{id === ME ? `${profile.name} (you)` : name(id)}</b>
                    <small>{st.wins} won · {st.played} played</small>
                  </span>
                  {champ && <span className="ladder-belt" title="Champion"><Emblem kind="belt" game={game} size={26} /></span>}
                  <span className="ladder-rating">{st.rating}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="block">
        <h2 className="h-sec">Club news</h2>
        <ul className="news">
          {club.news.filter((n) => !n.game || shows(n.game)).slice(0, 12).map((n) => (
            <li key={n.id} className={`news-item news-${n.kind} ${n.involvesMe ? 'is-me' : ''}`}>
              {n.game && <Tag>{GAME_NAMES[n.game]}</Tag>} {n.text}
            </li>
          ))}
        </ul>
      </section>

      <MemberSheet id={member} onClose={() => setMember(null)} myName={profile.name} />
    </div>
  );
}
