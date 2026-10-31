import { SolStats } from '../solitaire/Table.tsx';
import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { useStore } from '../../lib/store.ts';
import { Avatar } from '../../design/Avatar.tsx';
import { Character } from '../../design/Character.tsx';
import { Coins, LevelBar, useMyExtras } from '../wardrobe/bits.tsx';
import { Button, Tag } from '../../design/ui.tsx';
import { TrophyShelf, MemberSheet } from '../club/bits.tsx';
import { ME, nameOf, ordinal, rankOf, rankings, rivals } from '../../lib/club.ts';
import { GAME_NAMES, rosterById } from '../../lib/roster.ts';
import { useShown } from '../../lib/games.ts';
import { AchievementsPanel } from './Achievements.tsx';

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function Profile({ nav }: { nav: Nav }) {
  const { profile, stats, club, pyramid } = useStore();
  const { games, shows } = useShown();
  const myRivals = rivals(club).filter((r) => shows(r.game));
  const [member, setMember] = useState<string | null>(null);
  const extras = useMyExtras();
  if (!profile) return null;
  const winRate = stats.take2Played ? Math.round((stats.take2Wins / stats.take2Played) * 100) : null;
  const since = new Date(profile.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="page">
      <section className="profile-head">
        <div className="dressing-stage">
          <Character look={profile.avatar} extras={extras} width="100%" height="100%" title={profile.name} />
        </div>
        <div className="profile-info">
          <p className="eyebrow">Member since {since}</p>
          <h1 className="display h-lg">{profile.name}</h1>
          <LevelBar />
          <p className="muted"><Coins /> club coins · <Tag tone="warn">Local mode</Tag></p>
          <div className="btn-row">
            <Button onClick={() => nav.go('wardrobe')}>Wardrobe</Button>
            <Button variant="ghost" onClick={() => nav.go('shop')}>Shop</Button>
            <Button variant="ghost" onClick={() => nav.go('settings')}>Settings</Button>
          </div>
        </div>
      </section>

      <section className="panel cabinet">
        <h2 className="h-sec">Trophy cabinet</h2>
        <TrophyShelf id={ME} />
      </section>

      <AchievementsPanel />

      <section className="panel">
        <h2 className="h-sec">Club standing</h2>
        <dl className="statgrid">
          {games.map((g) => (
            <div key={g}><dt>{GAME_NAMES[g]}</dt><dd>{ordinal(rankOf(club, g, ME))}<small>/{rankings(club, g).length}</small></dd></div>
          ))}
          {games.map((g) => (
            <div key={`r${g}`}><dt>Rating · best {club.players[ME][g].peak}</dt><dd>{club.players[ME][g].rating}</dd></div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <h2 className="h-sec">Rivalries</h2>
        {myRivals.length === 0 ? <p className="empty">Play a few tables and your head-to-head records will show here.</p> : (
          <ul className="rivals">
            {myRivals.slice(0, 6).map((r) => {
              const m = rosterById(r.id)!;
              const lead = r.w > r.l ? 'You lead' : r.w < r.l ? `${m.name.split(' ')[0]} leads` : 'All square';
              return (
                <li key={`${r.id}${r.game}`}>
                  <button className="rival" onClick={() => setMember(r.id)}>
                    <Avatar config={m.avatar} size={36} />
                    <span><b>{nameOf(r.id)}</b><small>{GAME_NAMES[r.game]} · {lead}</small></span>
                    <span className={`rival-score ${r.w > r.l ? 'is-up' : r.w < r.l ? 'is-down' : ''}`}>{r.w}–{r.l}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="fine">When online play arrives, friends (and brothers) get the same head-to-head record.</p>
      </section>

      {shows('take2') && (
      <section className="panel">
        <h2 className="h-sec">Take 2</h2>
        <dl className="statgrid">
          <div><dt>Matches</dt><dd>{stats.take2Played}</dd></div>
          <div><dt>Wins</dt><dd>{stats.take2Wins}</dd></div>
          <div><dt>Win rate</dt><dd>{winRate === null ? '—' : `${winRate}%`}</dd></div>
          <div><dt>Rounds won</dt><dd>{stats.take2RoundsWon}</dd></div>
          <div><dt>Best finish</dt><dd>{stats.take2BestFinish ? ORD[stats.take2BestFinish] : '—'}</dd></div>
        </dl>
        <p className="fine">Every table counts towards your club ranking. Practice games never earn currency.</p>
      </section>
      )}

      {shows('poker') && (
      <section className="panel">
        <h2 className="h-sec">Hold'em</h2>
        <dl className="statgrid">
          <div><dt>Tables</dt><dd>{stats.pokerPlayed}</dd></div>
          <div><dt>Wins</dt><dd>{stats.pokerWins}</dd></div>
          <div><dt>Win rate</dt><dd>{stats.pokerPlayed ? `${Math.round((stats.pokerWins / stats.pokerPlayed) * 100)}%` : '—'}</dd></div>
          <div><dt>Hands won</dt><dd>{stats.pokerHandsWon}</dd></div>
          <div><dt>Best finish</dt><dd>{stats.pokerBestFinish ? ORD[stats.pokerBestFinish] : '—'}</dd></div>
        </dl>
      </section>
      )}
      {shows('hearts') && (
      <section className="panel">
        <h2 className="h-sec">Hearts</h2>
        <dl className="statgrid">
          <div><dt>Matches</dt><dd>{stats.heartsPlayed}</dd></div>
          <div><dt>Wins</dt><dd>{stats.heartsWins}</dd></div>
          <div><dt>Win rate</dt><dd>{stats.heartsPlayed ? `${Math.round((stats.heartsWins / stats.heartsPlayed) * 100)}%` : '—'}</dd></div>
          <div><dt>Moons shot</dt><dd>{stats.heartsMoons}</dd></div>
          <div><dt>Best finish</dt><dd>{stats.heartsBestFinish ? ORD[stats.heartsBestFinish] : '—'}</dd></div>
        </dl>
      </section>
      )}

      {shows('gin') && (
      <section className="panel">
        <h2 className="h-sec">Gin Rummy</h2>
        <dl className="statgrid">
          <div><dt>Matches</dt><dd>{stats.ginPlayed}</dd></div>
          <div><dt>Wins</dt><dd>{stats.ginWins}</dd></div>
          <div><dt>Win rate</dt><dd>{stats.ginPlayed ? `${Math.round((stats.ginWins / stats.ginPlayed) * 100)}%` : '—'}</dd></div>
          <div><dt>Hands won</dt><dd>{stats.ginHandsWon}</dd></div>
          <div><dt>Gins</dt><dd>{stats.ginGins}</dd></div>
        </dl>
      </section>
      )}
      {shows('draw') && (
      <section className="panel">
        <h2 className="h-sec">Five-Card Draw</h2>
        <dl className="statgrid">
          <div><dt>Tables</dt><dd>{stats.drawPlayed}</dd></div>
          <div><dt>Wins</dt><dd>{stats.drawWins}</dd></div>
          <div><dt>Win rate</dt><dd>{stats.drawPlayed ? `${Math.round((stats.drawWins / stats.drawPlayed) * 100)}%` : '—'}</dd></div>
          <div><dt>Hands won</dt><dd>{stats.drawHandsWon}</dd></div>
          <div><dt>Best finish</dt><dd>{stats.drawBestFinish ? ORD[stats.drawBestFinish] : '—'}</dd></div>
        </dl>
      </section>
      )}

      {shows('blackjack') && (
      <section className="panel">
        <h2 className="h-sec">Blackjack</h2>
        <dl className="statgrid">
          <div><dt>Tournaments</dt><dd>{stats.bjPlayed}</dd></div>
          <div><dt>Wins</dt><dd>{stats.bjWins}</dd></div>
          <div><dt>Win rate</dt><dd>{stats.bjPlayed ? `${Math.round((stats.bjWins / stats.bjPlayed) * 100)}%` : '—'}</dd></div>
          <div><dt>Blackjacks</dt><dd>{stats.bjBlackjacks}</dd></div>
          <div><dt>Best stack</dt><dd>{stats.bjBestChips ? stats.bjBestChips.toLocaleString('en-GB') : '—'}</dd></div>
        </dl>
      </section>
      )}
      {shows('solitaire') && <SolStats />}
      {shows('pyramid') && (
        <section className="panel">
          <h2 className="h-sec">Beat the Pyramid</h2>
          <dl className="statgrid">
            <div><dt>Beaten</dt><dd>{pyramid.wins}<small>/{pyramid.played}</small></dd></div>
            <div><dt>Best streak</dt><dd>{pyramid.bestStreak}</dd></div>
            {Object.entries(pyramid.best).sort((a, b) => Number(a[0]) - Number(b[0])).map(([rows, best]) => (
              <div key={rows}><dt>Best · {rows} rows</dt><dd>{best}</dd></div>
            ))}
          </dl>
        </section>
      )}
      <MemberSheet id={member} onClose={() => setMember(null)} myName={profile.name} />
    </div>
  );
}
