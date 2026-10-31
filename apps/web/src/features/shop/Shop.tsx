import React, { useMemo, useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { useStore } from '../../lib/store.ts';
import { BUNDLES, CATALOGUE, RARITY_LABEL, SLOT_LABEL, TIERS, getItem, type Item, type ItemSlot } from '../../lib/catalogue.ts';
import { useSeason } from '../../lib/useSeason.ts';
import { seasonRun } from '../../lib/seasons.ts';
import { SeasonCalendar } from '../seasons/Season.tsx';
import { itemState, levelInfo, tierFor, winsAgainst } from '../../lib/progress.ts';
import { ROSTER } from '../../lib/roster.ts';
import { Avatar } from '../../design/Avatar.tsx';
import { Button, Sheet, Tag } from '../../design/ui.tsx';
import { ItemSheet, ItemThumb, StateLabel } from '../wardrobe/Items.tsx';
import { Coins, LevelBar } from '../wardrobe/bits.tsx';
import { BoostsPanel, BundleCard, BundleSheet, CasesPanel, DailyCut } from './extras.tsx';

export type ShopCat = 'featured' | 'bundles' | 'boosts' | 'cases' | 'table' | 'emotes' | 'outfits' | 'headwear' | 'accessories' | 'tattoos' | 'signatures' | 'membership';
type Cat = ShopCat;
const CATS: Array<{ id: Cat; label: string }> = [
  { id: 'featured', label: 'Featured' },
  { id: 'bundles', label: 'Bundles' },
  { id: 'boosts', label: 'Boosts' },
  { id: 'cases', label: 'Mystery cases' },
  { id: 'table', label: 'Table items' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'outfits', label: 'Outfits' },
  { id: 'headwear', label: 'Headwear' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'tattoos', label: 'Tattoos' },
  { id: 'signatures', label: 'Signature collection' },
  { id: 'membership', label: 'Membership' },
];
const OUTFITS: ItemSlot[] = ['top', 'jacket', 'legs', 'shoes'];
const ACCESSORIES: ItemSlot[] = ['glasses', 'neck', 'pin', 'wrist'];
const TABLE_ITEMS: ItemSlot[] = ['prop', 'felt', 'wood', 'cardback', 'celebration'];
let pendingCat: ShopCat | null = null;
/** Opens the shop on a given section. */
export function openShopAt(nav: Nav, c: ShopCat) { pendingCat = c; nav.go('shop'); }
const INK: ItemSlot[] = ['tattoo', 'necktat', 'handtat'];
const notSig = (i: Item) => i.unlock.kind !== 'signature';

function dailyPick(items: Item[], n: number): Item[] {
  const day = Math.floor(Date.now() / 86400000);
  const pool = items.slice();
  const out: Item[] = [];
  let seed = day * 9301 + 49297;
  while (out.length < n && pool.length) {
    seed = (seed * 9301 + 49297) % 233280;
    out.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return out;
}

export function Shop({ nav, start }: { nav: Nav; start?: ShopCat }) {
  const { profile, wallet, club } = useStore();
  const [cat, setCat] = useState<Cat>(() => { const c = pendingCat; pendingCat = null; return c ?? start ?? 'featured'; });
  const [detail, setDetail] = useState<string | null>(null);
  const [bundle, setBundle] = useState<string | null>(null);
  const season = useSeason();
  const run = season ? seasonRun(season) : null;
  const [ledger, setLedger] = useState(false);
  const buyable = useMemo(() => CATALOGUE.filter((i) => i.unlock.kind === 'shop'), []);
  const featured = useMemo(() => dailyPick(buyable.filter((i) => i.rarity !== 'common' && !i.season), 2).concat(dailyPick(buyable.filter((i) => i.rarity === 'common' && !i.season), 4)), [buyable]);
  if (!profile) return null;
  const look = profile.avatar;
  const level = levelInfo(wallet.xp).level;

  const grid = (items: Item[], groupBy?: ItemSlot[]) => {
    const groups = groupBy ? groupBy.map((s) => ({ s, list: items.filter((i) => i.slot === s) })) : [{ s: null as ItemSlot | null, list: items }];
    return groups.map((g) => (
      <div key={g.s ?? 'all'} className="shop-group">
        {g.s && <h3 className="rules-h">{SLOT_LABEL[g.s]}</h3>}
        <div className="item-grid">
          {g.list.map((i) => {
            const st = itemState(i, wallet, club);
            return (
              <button key={i.id} className={`item-card rarity-${i.rarity} ${st.kind === 'locked' ? 'is-locked' : ''} ${st.kind === 'owned' ? 'is-owned' : ''}`} onClick={() => setDetail(i.id)}>
                <ItemThumb item={i} look={look} />
                <span className="item-name">{i.name}</span>
                <span className="item-row"><span className={`rar rar-${i.rarity}`}>{RARITY_LABEL[i.rarity]}</span><StateLabel item={i} wallet={wallet} /></span>
              </button>
            );
          })}
        </div>
      </div>
    ));
  };

  let body: React.ReactNode;
  switch (cat) {
    case 'featured': {
      const seasonal = season ? BUNDLES.filter((b) => b.season === season.id) : [];
      const seasonItems = season ? CATALOGUE.filter((i) => i.season === season.id) : [];
      body = (
        <>
          {season && (
            <section className={`season-banner season-${season.id} is-shop`}>
              <div className="season-head">
                <p className="eyebrow">{run ? `Limited time · until ${run.to.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : 'Preview'}</p>
                <h2 className="display h-md">{season.title}</h2>
                <p className="small">{season.blurb}</p>
              </div>
              <div className="bundle-grid">{seasonal.map((b) => <BundleCard key={b.id} bundle={b} onOpen={() => setBundle(b.id)} />)}</div>
              {grid(seasonItems)}
            </section>
          )}
          <DailyCut compact />
          <h3 className="rules-h">Today's picks</h3>
          <p className="muted small">They change every day.</p>
          {grid(featured)}
          <h3 className="rules-h">Bundles</h3>
          <div className="bundle-grid">{BUNDLES.filter((b) => !b.season).slice(0, 2).map((b) => <BundleCard key={b.id} bundle={b} onOpen={() => setBundle(b.id)} />)}</div>
          <h3 className="rules-h">Seasons at the club</h3>
          <p className="muted small">Each season brings its own items, bundles and a free gift. Seasonal items stay on sale all year; the bundles only while the season is on.</p>
          <SeasonCalendar />
        </>
      );
      break;
    }
    case 'bundles':
      body = (
        <>
          <p className="muted">Sets that go together, with a quarter off. You only pay for the pieces you don't already own.</p>
          <div className="bundle-grid">{BUNDLES.filter((b) => !b.season || b.season === season?.id).map((b) => <BundleCard key={b.id} bundle={b} onOpen={() => setBundle(b.id)} />)}</div>
        </>
      );
      break;
    case 'boosts':
      body = <BoostsPanel />;
      break;
    case 'cases':
      body = <CasesPanel onItem={setDetail} />;
      break;
    case 'table':
      body = (
        <>
          <p className="muted">Props sit by your seat at every table, where everyone can see them. Felt, rail and card backs change your whole table.</p>
          {grid(CATALOGUE.filter((i) => TABLE_ITEMS.includes(i.slot) && notSig(i)), TABLE_ITEMS)}
        </>
      );
      break;
    case 'emotes':
      body = (
        <>
          <p className="muted">Use emotes at the table from the smiley button.</p>
          {grid(CATALOGUE.filter((i) => i.slot === 'emote'))}
        </>
      );
      break;
    case 'outfits':
      body = grid(CATALOGUE.filter((i) => OUTFITS.includes(i.slot) && notSig(i)), OUTFITS);
      break;
    case 'headwear':
      body = grid(CATALOGUE.filter((i) => i.slot === 'hat' && notSig(i)));
      break;
    case 'accessories':
      body = grid(CATALOGUE.filter((i) => ACCESSORIES.includes(i.slot) && notSig(i)), ACCESSORIES);
      break;
    case 'tattoos':
      body = (
        <>
          <p className="muted">Wear one on your arm, one on your neck and one on your hand. Arm tattoos show with short sleeves and no jacket; neck and hand tattoos always show.</p>
          {grid(CATALOGUE.filter((i) => INK.includes(i.slot)), INK)}
        </>
      );
      break;
    case 'signatures':
      body = (
        <>
          <p className="muted">Every member has a signature piece. Beat them five times, in any game, and it's yours. These can't be bought.</p>
          <ul className="sig-list">
            {ROSTER.map((m) => {
              const it = CATALOGUE.find((i) => i.unlock.kind === 'signature' && i.unlock.member === m.id)!;
              const wins = winsAgainst(club, m.id);
              const owned = wallet.owned.includes(it.id);
              return (
                <li key={m.id}>
                  <button className={`sig-row ${owned ? 'is-owned' : ''}`} onClick={() => setDetail(it.id)}>
                    <Avatar config={m.avatar} size={44} />
                    <span className="sig-text">
                      <b>{it.name}</b>
                      <small>{owned ? 'Won' : `Beat ${m.name.split(' ')[0]}: ${Math.min(wins, 5)} of 5`}</small>
                      <span className="mini-progress"><span style={{ width: `${Math.min(100, (wins / 5) * 100)}%` }} /></span>
                    </span>
                    <ItemThumb item={it} look={look} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      );
      break;
    case 'membership':
      body = (
        <>
          <LevelBar />
          <p className="muted">Levels come from playing: every table earns XP, and wins, titles and Cups earn more.</p>
          <ol className="tiers">
            {TIERS.map((t) => {
              const reached = level >= t.level;
              const perks = CATALOGUE.filter((i) => (i.unlock.kind === 'shop' && i.unlock.tier === t.id) || (i.unlock.kind === 'level' && tierFor(i.unlock.level).id === t.id));
              return (
                <li key={t.id} className={`tier-card tier-${t.id} ${reached ? 'is-reached' : ''} ${tierFor(level).id === t.id ? 'is-current' : ''}`}>
                  <div className="tier-top">
                    <span className={`tier-badge tier-${t.id}`}>{t.name}</span>
                    <span className="muted small">Level {t.level}{reached ? ' · reached' : ''}</span>
                  </div>
                  <p className="small">{t.blurb}</p>
                  {perks.length > 0 && <p className="small muted">Unlocks: {perks.map((p) => p.name).join(', ')}</p>}
                </li>
              );
            })}
          </ol>
        </>
      );
      break;
  }

  return (
    <div className="page shop">
      <header className="page-head shop-head">
        <div>
          <p className="eyebrow">The club shop</p>
          <h1 className="display h-lg">Shop</h1>
        </div>
        <div className="shop-balance">
          <Coins />
          <button className="linkish" onClick={() => setLedger(true)}>Coin history</button>
        </div>
      </header>
      <p className="muted small"><Tag tone="warn">Local mode</Tag> Club coins are earned by playing and only buy cosmetics. There's no real money in Card Club.</p>

      <div className="shop-layout">
        <nav className="shop-menu" role="tablist" aria-label="Shop sections">
          {CATS.map((c) => <button key={c.id} role="tab" aria-selected={cat === c.id} className={`tab-chip shop-tab ${cat === c.id ? 'is-on' : ''} ${c.id === 'featured' && season ? 'is-season' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>)}
        </nav>
        <div className="shop-body">
          {body}
          <div className="btn-row"><Button variant="ghost" onClick={() => nav.go('wardrobe')}>Open your wardrobe</Button></div>
        </div>
      </div>

      <ItemSheet itemId={detail} onClose={() => setDetail(null)} />
      <BundleSheet bundleId={bundle} onClose={() => setBundle(null)} onItem={(id) => { setBundle(null); setDetail(id); }} />
      <Sheet open={ledger} onClose={() => setLedger(false)} title="Coin history">
        <ul className="ledger">
          {wallet.ledger.map((e, i) => (
            <li key={i}>
              <span>{e.reason}<small>{new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></span>
              <b className={e.amount >= 0 ? 'is-up' : 'is-down'}>{e.amount >= 0 ? '+' : ''}{e.amount}</b>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

export const itemName = (id: string) => getItem(id)?.name ?? id;
