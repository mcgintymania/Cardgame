import React from 'react';
import { cardName, isRed, rankLabel, SUIT_SYMBOLS, type Card } from '../../../../packages/engine/src/core/cards.ts';

const COURT: Record<number, string> = { 11: 'Jack', 12: 'Queen', 13: 'King' };

export function CardFace({ card, size, className = '' }: { card: Card; size?: string; className?: string }) {
  const sym = SUIT_SYMBOLS[card.suit];
  const label = rankLabel(card.rank);
  const red = isRed(card.suit);
  const court = card.rank >= 11;
  return (
    <div
      className={`pc pc-face ${red ? 'is-red' : 'is-black'} ${court ? 'is-court' : ''} ${className}`}
      style={size ? { '--cw': size } : undefined}
      role="img"
      aria-label={cardName(card)}
    >
      <span className="pc-corner pc-tl">
        <b>{label}</b>
        <i>{sym}</i>
      </span>
      {court ? (
        <span className="pc-court" aria-hidden="true">
          <span className="pc-court-frame">
            <b>{label}</b>
            <i>{sym}</i>
            <small>{COURT[card.rank]}</small>
          </span>
        </span>
      ) : (
        <span className="pc-pip" aria-hidden="true">{sym}</span>
      )}
      <span className="pc-corner pc-br" aria-hidden="true">
        <b>{label}</b>
        <i>{sym}</i>
      </span>
    </div>
  );
}

export function CardBack({ size, className = '' }: { size?: string; className?: string }) {
  return (
    <div className={`pc pc-back ${className}`} style={size ? { '--cw': size } : undefined} aria-hidden="true">
      <span className="pc-back-inner">
        <span className="pc-back-mono">CC</span>
      </span>
    </div>
  );
}
