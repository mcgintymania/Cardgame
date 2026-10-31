import React from 'react';
import { Avatar, type AvatarConfig } from '../../design/Avatar.tsx';
import { CardFace } from '../../design/PlayingCard.tsx';
import type { Take2View } from '../../../../../packages/engine/src/take2/types.ts';

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

/** Finishing order: winner, then later knockouts, then lower totals. */
export function placements(v: Take2View) {
  return v.players.slice().sort((a, b) => {
    if (a.seat === v.winner) return -1;
    if (b.seat === v.winner) return 1;
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    const ra = v.history.findIndex((r) => r.lines.some((l) => l.seat === a.seat && l.eliminated));
    const rb = v.history.findIndex((r) => r.lines.some((l) => l.seat === b.seat && l.eliminated));
    if (ra !== rb) return rb - ra;
    return a.total - b.total;
  });
}

export function RoundSummary({ view, avatars }: { view: Take2View; avatars: AvatarConfig[] }) {
  const r = view.history[view.history.length - 1];
  if (!r) return null;
  const limit = view.config.eliminationAt;
  const lines = r.lines.slice().sort((a, b) => (a.seat === r.wentOut ? -1 : b.seat === r.wentOut ? 1 : a.score.total - b.score.total));
  const outName = r.wentOut === null ? null : r.wentOut === 0 ? 'You' : view.players[r.wentOut].name.split(' ')[0];
  return (
    <div className="round-summary">
      <p className="lede">
        {outName ? <>{outName} went out first{r.wentOut === 0 ? '. Nice.' : '.'}</> : 'The round ran out of moves. The lowest hand counted as out.'}
      </p>
      <ul className="score-lines">
        {lines.map((l, i) => {
          const p = view.players[l.seat];
          const pct = Math.min(100, (l.after / limit) * 100);
          return (
            <li key={l.seat} className={`score-line ${l.eliminated ? 'is-ko' : ''} ${l.seat === r.wentOut ? 'is-out-first' : ''}`} style={{ '--i': i }}>
              <Avatar config={avatars[l.seat]} size={40} />
              <div className="sl-main">
                <div className="sl-top">
                  <b>{l.seat === 0 ? 'You' : p.name}</b>
                  <span className="sl-calc">
                    {l.seat === r.wentOut ? 'Went out · 0' : l.score.twos > 0
                      ? <>{l.score.base} × {l.score.multiplier} = <b>{l.score.total}</b></>
                      : <><b>{l.score.total}</b> pts</>}
                  </span>
                </div>
                {l.hand.length > 0 && (
                  <div className="sl-hand">
                    {l.hand.map((c) => <CardFace key={c.id} card={c} size="30px" />)}
                  </div>
                )}
                <div className="sl-total">
                  <span className={`meter ${pct >= 75 ? 'is-danger' : pct >= 50 ? 'is-warn' : ''}`}><span style={{ width: `${pct}%` }} /></span>
                  <span className="sl-nums">{l.before} → <b>{l.after}</b></span>
                </div>
              </div>
              {l.eliminated && <span className="ko-stamp ko-stamp-lg">KO</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Standings({ view, avatars, final }: { view: Take2View; avatars: AvatarConfig[]; final?: boolean }) {
  const order = final ? placements(view) : view.players.slice().sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || a.total - b.total);
  return (
    <div className="standings">
      <table>
        <thead>
          <tr>
            {final && <th scope="col">Place</th>}
            <th scope="col">Player</th>
            <th scope="col" className="num">Points</th>
            <th scope="col" className="num">Rounds won</th>
            {!final && view.history.map((r) => <th key={r.round} scope="col" className="num">R{r.round}</th>)}
          </tr>
        </thead>
        <tbody>
          {order.map((p, i) => (
            <tr key={p.seat} className={p.eliminated ? 'is-ko' : ''}>
              {final && <td className="place">{ORD[i]}</td>}
              <td>
                <span className="st-player">
                  <Avatar config={avatars[p.seat]} size={26} />
                  {p.seat === 0 ? 'You' : p.name}
                  {p.eliminated && <span className="tag tag-muted">KO</span>}
                </span>
              </td>
              <td className="num">{p.total}</td>
              <td className="num">{p.roundsWon}</td>
              {!final && view.history.map((r) => {
                const l = r.lines.find((x) => x.seat === p.seat);
                return <td key={r.round} className="num">{l ? (r.wentOut === p.seat ? '★' : l.score.total) : '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
