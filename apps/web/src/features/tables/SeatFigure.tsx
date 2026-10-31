// On big screens, players sit at the table: a full character in a club chair,
// with their table prop and chips on the felt in front of them. Emotes play on
// the character itself; phrases appear in a speech bubble.

import React from 'react';
import { Character, SEATED_VIEW, type Look } from '../../design/Character.tsx';
import { PropArt } from '../../design/Props.tsx';
import { getItem } from '../../lib/catalogue.ts';
import { EmoteBubble, isSay, poseOf, type Reaction } from './Emotes.tsx';

function Chair({ leather = '#5e2620' }: { leather?: string }) {
  const hi = '#ffffff';
  return (
    <svg className="sf-chair" viewBox={SEATED_VIEW} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path d="M36 214 L35 120 Q35 86 66 82 L134 82 Q165 86 165 120 L164 214 Z" fill={leather} />
      <path d="M36 214 L35 120 Q35 86 66 82 L134 82 Q165 86 165 120 L164 214 Z" fill="none" stroke="#2a120e" strokeWidth="3" />
      <path d="M41 212 L40 122 Q40 92 68 89 L132 89 Q160 92 160 122 L159 212" fill="none" stroke="#e2bd68" strokeWidth="1.4" strokeDasharray="0.1 5" strokeLinecap="round" opacity=".8" />
      {[100, 130, 160, 190].map((y, r) => [60, 80, 100, 120, 140].map((x, c) => (r + c) % 2 === 0 && <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="#000" opacity=".35" />))}
      <path d="M40 92 Q100 82 160 92" stroke={hi} strokeOpacity=".12" strokeWidth="6" fill="none" />
      <path d="M146 92 Q160 102 160 130 L160 212 L152 212 L152 130 Q152 106 146 92 Z" fill="#000" opacity=".2" />
    </svg>
  );
}

/** A small chip stack: taller with more chips (null = no chips game). */
export function ChipStack({ chips }: { chips: number | null | undefined }) {
  if (chips === null || chips === undefined || chips <= 0) return null;
  const n = Math.max(1, Math.min(7, Math.round(Math.log10(chips + 1) * 2.4)));
  const cols = ['#a83434', '#1d3561', '#1f5a43', '#e2bd68', '#2a2a2e'];
  return (
    <svg className="felt-chips" viewBox="0 0 30 34" aria-label={`${chips.toLocaleString('en-GB')} chips`}>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${i % 2 ? 1 : 0} ${28 - i * 4})`}>
          <ellipse cx="14" cy="2" rx="11" ry="4" fill={cols[i % cols.length]} />
          <ellipse cx="14" cy="2" rx="11" ry="4" fill="none" stroke="#f1e8d6" strokeWidth="1.2" strokeDasharray="2.4 2.4" />
          <path d="M3 2 V4 Q14 10 25 4 V2" fill={cols[i % cols.length]} opacity=".75" />
        </g>
      ))}
    </svg>
  );
}

export function SeatFigure({ look, reaction, thinking, prop, chips, out }: {
  look: Look; reaction?: Reaction; thinking?: boolean; prop?: string; chips?: number | null; out?: boolean;
}) {
  const pose = poseOf(reaction) ?? 'rest';
  const item = getItem(prop ?? undefined);
  return (
    <div className={`seat-figure ${out ? 'is-out' : ''}`}>
      <Chair />
      <div className="sf-person">
        <Character look={look} pose={pose} animate crop="seated" width="100%" height="100%" noShadow />
      </div>
      {thinking && <span className="think sf-think" aria-hidden="true"><i /><i /><i /></span>}
      {isSay(reaction) && <EmoteBubble look={look} pose={reaction!} />}
      {(item?.slot === 'prop' || (chips ?? 0) > 0) && (
        <span className="felt-items">
          {item?.slot === 'prop' && <span className="felt-prop" title={item.name}><PropArt item={item} size="100%" /></span>}
          <ChipStack chips={chips} />
        </span>
      )}
    </div>
  );
}
