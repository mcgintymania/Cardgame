// Seasonal takeover UI: the club's accent colours and a light decoration while a
// season is on, the home banner with the free gift, and the season calendar.

import React, { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion, store, useStore } from '../../lib/store.ts';
import { CharStyleContext } from '../../design/Character.tsx';
import { daysLeft, giftKey, seasonRun, upcoming, type Deco, type Season } from '../../lib/seasons.ts';
import { useSeason } from '../../lib/useSeason.ts';
import { claimSeasonGift } from '../../lib/progress.ts';
import { getItem } from '../../lib/catalogue.ts';
import { sfx } from '../../lib/audio.ts';
import { Button, Tag } from '../../design/ui.tsx';
import { ItemThumb } from '../wardrobe/Items.tsx';
import { FeatToasts } from './FeatToast.tsx';

/** Wraps the app: character style, season colours and decorations. */
export function SeasonRoot({ children }: { children: React.ReactNode }) {
  const { settings } = useStore();
  const season = useSeason();
  useEffect(() => {
    const root = document.documentElement;
    if (season) {
      root.dataset.season = season.id;
      root.style.setProperty('--season', season.accent);
      root.style.setProperty('--season-2', season.accent2);
    } else {
      delete root.dataset.season;
      root.style.removeProperty('--season');
      root.style.removeProperty('--season-2');
    }
  }, [season?.id]);
  return (
    <CharStyleContext.Provider value={settings.charStyle ?? 'lounge'}>
      {season && <SeasonDeco deco={season.deco} still={prefersReducedMotion(settings)} />}
      <FeatToasts />
      {children}
    </CharStyleContext.Provider>
  );
}

const DECO_COLORS: Record<Deco, string[]> = {
  snow: ['#f4f8ff', '#dce8f6'], hearts: ['#e04a6a', '#f0b8c4'], clover: ['#3aa864', '#2f8a50'], petals: ['#f0b8c8', '#f7e08a'],
  sun: ['#f2c86a', '#e8944a'], leaves: ['#d9772a', '#a8501a'], sparks: ['#f0cf86', '#c9d8ff'],
};

function Shape({ deco, c }: { deco: Deco; c: string }) {
  switch (deco) {
    case 'hearts': return <path d="M12 21 C3 14 2 7 7 5 C9.6 4 11.4 5.6 12 7.4 C12.6 5.6 14.4 4 17 5 C22 7 21 14 12 21 Z" fill={c} />;
    case 'clover': return <g fill={c}>{[0, 90, 180, 270].map((r) => <path key={r} transform={`rotate(${r} 12 12)`} d="M12 12 C8 10 7 5 10 4 C11.4 3.6 12 5 12 6 C12 5 12.6 3.6 14 4 C17 5 16 10 12 12 Z" />)}</g>;
    case 'petals': return <ellipse cx="12" cy="12" rx="7" ry="3.6" fill={c} />;
    case 'leaves': return <path d="M12 3 C18 7 19 14 12 21 C5 14 6 7 12 3 Z M12 6 V19" fill={c} stroke="#000" strokeOpacity=".2" />;
    case 'sun': return <circle cx="12" cy="12" r="3" fill={c} />;
    case 'sparks': return <path d="M12 3 L13.6 10.4 L21 12 L13.6 13.6 L12 21 L10.4 13.6 L3 12 L10.4 10.4 Z" fill={c} />;
    default: return <circle cx="12" cy="12" r="4" fill={c} />;
  }
}

/** A few slow particles behind the menus (tables have their own backgrounds). */
export function SeasonDeco({ deco, still }: { deco: Deco; still: boolean }) {
  const bits = useMemo(() => Array.from({ length: still ? 10 : 18 }, (_, i) => ({
    left: (i * 53) % 100, delay: -((i * 37) % 23), dur: 16 + ((i * 29) % 14), size: 8 + ((i * 7) % 12), drift: ((i * 13) % 40) - 20, c: DECO_COLORS[deco][i % 2],
    top: (i * 41) % 100,
  })), [deco, still]);
  return (
    <div className={`season-deco deco-${deco} ${still ? 'is-still' : ''}`} aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, top: still ? `${b.top}%` : undefined, width: b.size, height: b.size, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, '--drift': `${b.drift}px` }}>
          <svg viewBox="0 0 24 24" width="100%" height="100%"><Shape deco={deco} c={b.c} /></svg>
        </span>
      ))}
    </div>
  );
}

/** Home banner while a season is on: what's on, days left, the free gift. */
export function SeasonBanner({ onShop }: { onShop: () => void }) {
  const { wallet, profile } = useStore();
  const season = useSeason();
  const [msg, setMsg] = useState<string | null>(null);
  if (!season || !profile) return null;
  const run = seasonRun(season);
  const left = run ? daysLeft(run.to) : null;
  const key = giftKey(season);
  const claimed = (wallet.seasonGifts ?? []).includes(key);
  const real = !!run;
  const gift = getItem(season.gift);
  const claim = () => {
    const r = claimSeasonGift(store.get().wallet, season.gift, key);
    if ('error' in r) { setMsg(r.error); return; }
    store.setWallet(r.wallet);
    sfx.win();
    setMsg(r.item ? `${r.item.name} is yours. Find it in your wardrobe.` : `You already had it, so here are ${r.coins} coins instead.`);
  };
  return (
    <section className={`season-banner season-${season.id}`} aria-label={season.title}>
      <div className="season-head">
        <p className="eyebrow">{left === null ? 'Preview' : left <= 1 ? 'Last day' : `${left} days left`}</p>
        <h2 className="display h-md">{season.title}</h2>
        <p className="small">{season.blurb}</p>
        <div className="btn-row">
          <Button size="sm" onClick={onShop}>Seasonal shop</Button>
          {!claimed && real && <Button size="sm" variant="felt" onClick={claim}>Open your free gift</Button>}
        </div>
        {msg && <p className="item-msg small" role="status">{msg}</p>}
      </div>
      {gift && !claimed && real && (
        <div className="season-gift" aria-label={`Free gift: ${gift.name}`}>
          <ItemThumb item={gift} look={profile.avatar} />
          <small>Free: {gift.name}</small>
        </div>
      )}
    </section>
  );
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Every season and when it next runs. */
export function SeasonCalendar() {
  const list = upcoming();
  return (
    <ol className="season-cal">
      {list.map(({ season, from, to, on }) => (
        <li key={season.id} className={on ? 'is-on' : ''} style={{ '--sa': season.accent }}>
          <span className="sc-dot" aria-hidden="true" />
          <span className="sc-name"><b>{season.name}</b><small>{fmtDay(from)} to {fmtDay(to)}</small></span>
          {on ? <Tag tone="ok">On now</Tag> : <small className="muted">in {daysLeft(from)} days</small>}
        </li>
      ))}
    </ol>
  );
}

export type { Season };
