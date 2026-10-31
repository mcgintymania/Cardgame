import React from 'react';
import { useStore } from '../../lib/store.ts';
import { levelInfo, tierFor, championStars, holdsTitle } from '../../lib/progress.ts';
import { CoinIcon } from '../../design/ui.tsx';
import type { Extras } from '../../design/Character.tsx';

export function useMyExtras(): Extras {
  const { club } = useStore();
  return { stars: championStars(club), belt: holdsTitle(club) };
}

export function LevelBar({ compact }: { compact?: boolean }) {
  const { wallet } = useStore();
  const li = levelInfo(wallet.xp);
  const tier = tierFor(li.level);
  return (
    <div className={`levelbar ${compact ? 'is-compact' : ''}`}>
      <span className={`tier-badge tier-${tier.id}`}>{tier.name}</span>
      <span className="lv">Level <b>{li.level}</b></span>
      <span className="xpbar" aria-label={`${li.into} of ${li.need} XP to level ${li.level + 1}`}><span style={{ width: `${(li.into / li.need) * 100}%` }} /></span>
      {!compact && <small className="xpnum">{li.into}/{li.need} XP</small>}
    </div>
  );
}

export function Coins({ amount }: { amount?: number }) {
  const { wallet } = useStore();
  return <span className="coins"><CoinIcon size={18} /> <b>{(amount ?? wallet.coins).toLocaleString('en-GB')}</b></span>;
}
