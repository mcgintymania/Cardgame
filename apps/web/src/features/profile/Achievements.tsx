// Achievements and play milestones on the profile.

import React from 'react';
import { useStore } from '../../lib/store.ts';
import { ACHIEVEMENTS, CATALOGUE, type AchievementKey } from '../../lib/catalogue.ts';
import { achievementsMet, activityOf } from '../../lib/progress.ts';
import { useShown } from '../../lib/games.ts';

const ORDER: AchievementKey[] = ['rainbow', 'passSkip', 'stackTwos', 'moon', 'spotless', 'gin', 'undercut', 'fullHouse', 'quads', 'royalFlush', 'steal', 'allInWin',
  'natural', 'charlie', 'doubleWin', 'patience', 'speedster', 'dailyDeal', 'summit', 'pyramid9', 'streak3', 'allRounder', 'firstWin', 'titleWinner', 'champion', 'cupWinner', 'cups3', 'defences3', 'beat10'];

export function AchievementsPanel() {
  const { wallet, club } = useStore();
  const { shows } = useShown();
  const done = new Set(achievementsMet(club, wallet));
  const act = activityOf(club, wallet);
  const list = ORDER.filter((k) => { const g = ACHIEVEMENTS[k].game; return !g || shows(g as never); });
  const reward = (k: AchievementKey) => CATALOGUE.filter((i) => i.unlock.kind === 'achievement' && i.unlock.key === k).map((i) => i.name);
  return (
    <section className="panel">
      <h2 className="h-sec">Achievements <small className="muted">{list.filter((k) => done.has(k)).length} of {list.length}</small></h2>
      <dl className="statgrid">
        <div><dt>Games played</dt><dd>{act.total}</dd></div>
        <div><dt>Games won</dt><dd>{act.wins}</dd></div>
        <div><dt>Win streak</dt><dd>{wallet.streak?.cur ?? 0}<small> best {wallet.streak?.best ?? 0}</small></dd></div>
      </dl>
      <div className="ach-grid">
        {list.map((k) => (
          <div key={k} className={`ach ${done.has(k) ? 'is-done' : ''}`}>
            <span className="ft-medal" aria-hidden="true">★</span>
            <span>
              <b>{ACHIEVEMENTS[k].name}</b>
              <small>{ACHIEVEMENTS[k].how}</small>
              {reward(k).length > 0 && <em>Reward: {reward(k).join(', ')}</em>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
