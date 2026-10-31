// Shop extras: bundles, boosts, mystery cases and the Daily Cut.
// Everything here costs club coins earned by playing. No real money, ever.

import React, { useEffect, useState } from 'react';
import { store, useStore } from '../../lib/store.ts';
import { BOOSTS, BUNDLES, CASES, RARITY_LABEL, getItem, type Bundle, type BoostKind, type Item, type MysteryCase, type Rarity } from '../../lib/catalogue.ts';
import { DAILY_CUT, boostLeft, buyBoost, buyBundle, bundlePrice, casePool, claimDaily, dailyStatus, openCase } from '../../lib/progress.ts';
import { sfx } from '../../lib/audio.ts';
import { seasonById } from '../../lib/seasons.ts';
import { Button, Sheet, Tag } from '../../design/ui.tsx';
import { ItemThumb } from '../wardrobe/Items.tsx';
import { Coins } from '../wardrobe/bits.tsx';

const fmt = (n: number) => n.toLocaleString('en-GB');

/** Ticks once a second (or minute) so timers stay live. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(ss).padStart(2, '0')}`;
}

// ------------------------------------------------------------------- boosts

const BOOST_GLYPH: Record<BoostKind, string> = { xp: 'XP', coins: '¤' };
const BOOST_LABEL: Record<BoostKind, string> = { xp: 'Double XP', coins: 'Coin boost' };

/** A ring that empties as a boost runs down (full ring = 12 hours or more). */
export function BoostRing({ kind, left, size = 40 }: { kind: BoostKind; left: number; size?: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, left / (left <= 3600000 ? 3600000 : 12 * 3600000));
  const on = left > 0;
  return (
    <span className={`boost-ring boost-${kind} ${on ? 'is-on' : ''}`} style={{ width: size, height: size }} title={on ? `${BOOST_LABEL[kind]}: ${clock(left)} left` : `${BOOST_LABEL[kind]}: off`}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <circle cx="20" cy="20" r={r} className="br-track" />
        {on && <circle cx="20" cy="20" r={r} className="br-fill" strokeDasharray={`${Math.max(0.04, frac) * c} ${c}`} transform="rotate(-90 20 20)" />}
      </svg>
      <b>{BOOST_GLYPH[kind]}</b>
    </span>
  );
}

/** The two boost rings with time left, as on the main menu. Tapping goes to the boosts. */
export function BoostRings({ onClick }: { onClick?: () => void }) {
  const { wallet } = useStore();
  const now = useNow();
  const kinds: BoostKind[] = ['xp', 'coins'];
  return (
    <button className="boost-rings" onClick={onClick} aria-label="Boosts">
      {kinds.map((k) => {
        const left = boostLeft(wallet, k, now);
        return (
          <span key={k} className="boost-chip">
            <BoostRing kind={k} left={left} size={34} />
            <small>{left > 0 ? clock(left) : 'Off'}</small>
          </span>
        );
      })}
    </button>
  );
}

export function BoostsPanel() {
  const { wallet } = useStore();
  const now = useNow();
  const [msg, setMsg] = useState<string | null>(null);
  const buy = (id: string) => {
    const r = buyBoost(store.get().wallet, id);
    if ('error' in r) { setMsg(r.error); return; }
    store.setWallet(r.wallet);
    sfx.card();
    setMsg(`${BOOSTS.find((b) => b.id === id)!.name}: on.`);
  };
  return (
    <>
      <p className="muted">Boosts run on the clock from when you buy them. Buying another adds time on top.</p>
      <div className="boost-now">
        {(['xp', 'coins'] as BoostKind[]).map((k) => {
          const left = boostLeft(wallet, k, now);
          return (
            <div key={k} className={`boost-status ${left > 0 ? 'is-on' : ''}`}>
              <BoostRing kind={k} left={left} size={52} />
              <span><b>{BOOST_LABEL[k]}</b><small>{left > 0 ? `${clock(left)} left` : 'Not running'}</small></span>
            </div>
          );
        })}
      </div>
      {msg && <p className="item-msg" role="status">{msg}</p>}
      <div className="boost-grid">
        {BOOSTS.map((b) => (
          <div key={b.id} className={`boost-card boost-${b.kind}`}>
            <BoostRing kind={b.kind} left={b.hours * 3600000} size={48} />
            <span className="boost-text"><b>{b.name}</b><small>{b.blurb}</small></span>
            <Button size="sm" onClick={() => buy(b.id)} disabled={wallet.coins < b.price}>{fmt(b.price)}</Button>
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ bundles

export function BundleArt({ bundle }: { bundle: Bundle }) {
  const { profile } = useStore();
  const items = bundle.items.map((id) => getItem(id)).filter(Boolean) as Item[];
  return (
    <span className={`bundle-art n${Math.min(4, items.length)}`} aria-hidden="true">
      {items.slice(0, 4).map((i) => <ItemThumb key={i.id} item={i} look={profile!.avatar} />)}
    </span>
  );
}

export function BundleCard({ bundle, onOpen }: { bundle: Bundle; onOpen: () => void }) {
  const { wallet, club } = useStore();
  const p = bundlePrice(wallet, bundle.id, club);
  return (
    <button className={`bundle-card ${bundle.season ? `is-${bundle.season}` : ''} ${p ? '' : 'is-owned'}`} onClick={onOpen}>
      <BundleArt bundle={bundle} />
      <span className="bundle-text">
        <b>{bundle.name}</b>
        <small>{bundle.items.length} items{bundle.season ? ` · ${seasonById(bundle.season)?.name ?? ''}` : ''}</small>
        {p ? <span className="bundle-price"><s>{fmt(p.full)}</s> <b>{fmt(p.price)}</b> coins</span> : <span className="item-state is-owned">All owned</span>}
      </span>
    </button>
  );
}

export function BundleSheet({ bundleId, onClose, onItem }: { bundleId: string | null; onClose: () => void; onItem: (id: string) => void }) {
  const { wallet, club, profile } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const b = BUNDLES.find((x) => x.id === bundleId);
  if (!b || !profile) return null;
  const p = bundlePrice(wallet, b.id, club);
  const doBuy = () => {
    const r = buyBundle(store.get().wallet, b.id, store.get().club);
    if ('error' in r) { setMsg(r.error); return; }
    store.setWallet(r.wallet);
    sfx.win();
    setMsg(`Yours: ${r.got.map((i) => i.name).join(', ')}.`);
  };
  return (
    <Sheet open={!!bundleId} onClose={() => { setMsg(null); onClose(); }} title={b.name}>
      <p className="muted">{b.blurb}</p>
      <ul className="bundle-items">
        {b.items.map((id) => {
          const i = getItem(id)!;
          const owned = wallet.owned.includes(id);
          return (
            <li key={id}>
              <button className="bundle-item" onClick={() => onItem(id)}>
                <ItemThumb item={i} look={profile.avatar} />
                <span><b>{i.name}</b><small>{RARITY_LABEL[i.rarity]}</small></span>
                {owned ? <span className="item-state is-owned">Owned</span> : <span className="item-state">{i.unlock.kind === 'shop' ? `${fmt(i.unlock.price)}` : ''}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {msg && <p className="item-msg" role="status">{msg}</p>}
      {p ? (
        <>
          <p className="small muted">A quarter off the {p.missing.length === b.items.length ? 'lot' : `${p.missing.length} you don't own yet`}: {fmt(p.full)} → <b>{fmt(p.price)}</b> coins.</p>
          <div className="btn-row sticky-actions">
            <Button size="lg" onClick={doBuy} disabled={wallet.coins < p.price}>Buy the bundle · {fmt(p.price)}</Button>
          </div>
          {wallet.coins < p.price && <p className="small muted">You have <Coins />.</p>}
        </>
      ) : <p className="item-state is-owned">You own everything in this bundle.</p>}
    </Sheet>
  );
}

// ------------------------------------------------------------- mystery cases

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const random = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; };

export function CaseArt({ c, shaking }: { c: MysteryCase; shaking?: boolean }) {
  return (
    <span className={`case-art case-${c.id} ${shaking ? 'is-shaking' : ''}`} aria-hidden="true">
      <span className="case-lid" />
      <span className="case-body"><span className="case-clasp">?</span></span>
    </span>
  );
}

export function CasesPanel({ onItem }: { onItem: (id: string) => void }) {
  const { wallet, club, profile } = useStore();
  const [opening, setOpening] = useState<{ c: MysteryCase; item: Item | null; stage: 'shake' | 'open' } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const left = casePool(wallet, club).length;
  const open = (c: MysteryCase) => {
    const r = openCase(store.get().wallet, c.id, store.get().club, random);
    if ('error' in r) { setMsg(r.error); return; }
    setMsg(null);
    setOpening({ c, item: r.item, stage: 'shake' });
    sfx.card();
    setTimeout(() => {
      store.setWallet(r.wallet);
      setOpening({ c, item: r.item, stage: 'open' });
      if (r.item.rarity === 'epic' || r.item.rarity === 'legendary') sfx.win(); else sfx.card();
    }, 1300);
  };
  return (
    <>
      <p className="muted">Each case gives you one random item you don't own yet, never a duplicate. The odds are fixed and shown on every case. Cases only cost club coins.</p>
      <p className="small muted">{left} shop item{left === 1 ? '' : 's'} left that a case could give you.</p>
      {msg && <p className="item-msg" role="status">{msg}</p>}
      <div className="case-grid">
        {CASES.map((c) => (
          <div key={c.id} className="case-card">
            <CaseArt c={c} />
            <span className="case-text">
              <b>{c.name}</b>
              <small>{c.blurb}</small>
              <span className="odds" aria-label="Odds">
                {RARITIES.filter((r) => c.odds[r] > 0).map((r) => <span key={r} className={`odd rar-${r}`}><i />{RARITY_LABEL[r]} {c.odds[r]}%</span>)}
              </span>
            </span>
            <Button onClick={() => open(c)} disabled={wallet.coins < c.price || left === 0}>Open · {fmt(c.price)}</Button>
          </div>
        ))}
      </div>
      <p className="fine">If you already own everything of the rarity you roll, you get the nearest rarity you don't own instead.</p>
      <Sheet open={!!opening} onClose={() => opening?.stage === 'open' && setOpening(null)} title={opening?.stage === 'open' ? 'You got…' : 'Opening…'}>
        {opening && (
          <div className={`case-reveal ${opening.stage === 'open' ? `is-open rar-${opening.item!.rarity}` : ''}`}>
            {opening.stage === 'shake' ? <CaseArt c={opening.c} shaking /> : (
              <>
                <span className="reveal-rays" aria-hidden="true" />
                <span className="reveal-item"><ItemThumb item={opening.item!} look={profile!.avatar} /></span>
                <p className={`rar rar-${opening.item!.rarity}`}>{RARITY_LABEL[opening.item!.rarity]}</p>
                <h2 className="display h-md">{opening.item!.name}</h2>
                <div className="btn-row">
                  <Button onClick={() => { const id = opening.item!.id; setOpening(null); onItem(id); }}>Have a look</Button>
                  <Button variant="ghost" onClick={() => setOpening(null)}>Done</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- Daily Cut

export function DailyCut({ compact }: { compact?: boolean }) {
  const { wallet } = useStore();
  const now = useNow();
  const st = dailyStatus(wallet, new Date(now));
  const [got, setGot] = useState<number | null>(null);
  const claim = () => {
    const r = claimDaily(store.get().wallet);
    if ('error' in r) return;
    store.setWallet(r.wallet);
    setGot(r.coins);
    sfx.win();
  };
  // Day in the 7-day run that's next to claim (or just claimed).
  const today = st.ready ? st.streak % 7 : (st.streak - 1) % 7;
  return (
    <div className={`daily-cut ${st.ready ? 'is-ready' : ''} ${compact ? 'is-compact' : ''}`}>
      <div className="dc-head">
        <span><b>The Daily Cut</b><small>{st.ready ? `Day ${today + 1}: ${DAILY_CUT[today]} coins waiting` : got ? `+${got} coins. See you tomorrow.` : `Next cut in ${clock(st.msToNext)}`}</small></span>
        {st.ready ? <Button size="sm" onClick={claim}>Claim {DAILY_CUT[today]}</Button> : <Tag tone="muted">{clock(st.msToNext)}</Tag>}
      </div>
      <ol className="dc-days" aria-label="Seven-day run">
        {DAILY_CUT.map((c, i) => {
          const done = st.ready ? i < today : i <= today;
          return <li key={i} className={`${done ? 'is-done' : ''} ${i === today ? 'is-today' : ''}`}><small>Day {i + 1}</small><b>{c}</b></li>;
        })}
      </ol>
      {!compact && <p className="fine">Claim once a day. Keep the run going for bigger cuts; miss a day and it starts again from day 1.</p>}
    </div>
  );
}
