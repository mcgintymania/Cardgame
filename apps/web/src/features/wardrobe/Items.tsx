import React, { useState } from 'react';
import { store, useStore } from '../../lib/store.ts';
import { RARITY_LABEL, SLOT_LABEL, getItem, type Item, type TableSlot, type WearSlot } from '../../lib/catalogue.ts';
import { buy, itemState, type Wallet } from '../../lib/progress.ts';
import { Character, type Look, type Pose } from '../../design/Character.tsx';
import { TattooArt } from '../../design/Tattoos.tsx';
import { PropArt } from '../../design/Props.tsx';
import { CardBack } from '../../design/PlayingCard.tsx';
import { Button, Sheet, Tag } from '../../design/ui.tsx';
import { Coins, useMyExtras } from './bits.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';

export const WEAR_SLOTS: WearSlot[] = ['hat', 'glasses', 'top', 'jacket', 'neck', 'pin', 'wrist', 'legs', 'shoes', 'tattoo', 'necktat', 'handtat'];
export const OPTIONAL_SLOTS: WearSlot[] = ['hat', 'glasses', 'jacket', 'neck', 'pin', 'wrist', 'tattoo', 'necktat', 'handtat'];
export const TABLE_SLOTS: TableSlot[] = ['felt', 'wood', 'cardback', 'prop', 'celebration'];
const SHORT_TOPS = ['tee', 'polo', 'hawaiian'];
const BUST_SLOTS: string[] = ['hat', 'glasses', 'neck', 'pin', 'top', 'jacket'];

export const isWear = (i: Item) => (WEAR_SLOTS as string[]).includes(i.slot);

export function tryOn(look: Look, item: Item): Look {
  const wear = { ...look.wear, [item.slot]: item.id };
  if (item.slot === 'top') delete wear.jacket; // show the top itself
  if (item.slot === 'tattoo') {
    // Arm tattoos need bare forearms to be seen: preview in a short-sleeve top.
    delete wear.jacket;
    const top = getItem(wear.top);
    if (!top || !SHORT_TOPS.includes(top.kind)) wear.top = 'tee-white';
  }
  return { ...look, wear };
}

export function MiniTable({ felt, wood }: { felt: Item; wood: Item }) {
  return (
    <span className="mini-table" style={{ '--felt': felt.c1, '--felt-hi': felt.c2 ?? felt.c1, '--felt-lo': felt.c3 ?? felt.c1, '--wood': wood.c1, '--wood-lo': wood.c3 ?? wood.c1 }} aria-hidden="true" />
  );
}

export function ItemThumb({ item, look }: { item: Item; look: Look }) {
  const { wallet } = useStore();
  if (item.slot === 'tattoo' || item.slot === 'necktat' || item.slot === 'handtat') return <span className="thumb thumb-ink"><TattooArt item={item} skin={look.skin} /></span>;
  if (isWear(item)) {
    const crop = BUST_SLOTS.includes(item.slot) ? 'bust' : 'full';
    return (
      <span className={`thumb thumb-${crop}`} style={{ background: look.backdrop }}>
        <Character look={tryOn(look, item)} crop={crop} width="100%" height="100%" noShadow />
      </span>
    );
  }
  if (item.slot === 'prop') return <span className="thumb thumb-prop"><PropArt item={item} size="70%" /></span>;
  if (item.slot === 'felt') return <span className="thumb"><MiniTable felt={item} wood={getItem(wallet.table.wood)!} /></span>;
  if (item.slot === 'wood') return <span className="thumb"><MiniTable felt={getItem(wallet.table.felt)!} wood={item} /></span>;
  if (item.slot === 'cardback') return <span className={`thumb cb-${item.id}`}><CardBack size="44px" /></span>;
  if (item.slot === 'emote') return <span className="thumb thumb-full" style={{ background: look.backdrop }}><Character look={look} pose={item.kind as Pose} width="100%" height="100%" noShadow /></span>;
  return <span className={`thumb cel-thumb cel-${item.kind}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

export function StateLabel({ item, wallet }: { item: Item; wallet: Wallet }) {
  const { club } = useStore();
  const st = itemState(item, wallet, club);
  if (st.kind === 'owned') return <span className="item-state is-owned">Owned</span>;
  if (st.kind === 'buy') return <span className="item-state is-buy">{st.price === 0 ? 'Free' : <><b>{st.price.toLocaleString('en-GB')}</b> coins</>}</span>;
  return (
    <span className="item-state is-locked">
      <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true"><rect x="1" y="5" width="9" height="7" rx="1.5" fill="currentColor" /><path d="M3 5 V3.5 a2.5 2.5 0 0 1 5 0 V5" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg> {st.reason}
      {st.progress && <span className="mini-progress"><span style={{ width: `${Math.min(100, (st.progress[0] / st.progress[1]) * 100)}%` }} /></span>}
    </span>
  );
}

/** Detail view: preview, how to get it, buy and wear. */
export function ItemSheet({ itemId, onClose, onWear }: { itemId: string | null; onClose: () => void; onWear?: (item: Item) => void }) {
  const { wallet, profile, club } = useStore();
  const extras = useMyExtras();
  const [msg, setMsg] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const item = getItem(itemId);
  if (!item || !profile) return null;
  const st = itemState(item, wallet, club);
  const look = profile.avatar;
  const wearNow = (i: Item) => {
    if (onWear) { onWear(i); return; }
    if (isWear(i)) store.setProfile({ ...profile, avatar: { ...look, wear: { ...look.wear, [i.slot]: i.id } } });
    else if (i.slot !== 'emote') store.setWallet({ ...store.get().wallet, table: { ...store.get().wallet.table, [i.slot]: i.id } });
    setMsg('Wearing it now.');
  };
  const doBuy = () => {
    const r = buy(wallet, item.id, club);
    if ('error' in r) { setMsg(r.error); return; }
    store.setWallet(r.wallet);
    setMsg(`Bought! ${item.name} is in your wardrobe.`);
  };
  const preview = isWear(item)
    ? <Character look={tryOn(look, item)} extras={extras} width="100%" height="100%" />
    : item.slot === 'emote' ? <Character look={look} extras={extras} pose={item.kind as Pose} animate width="100%" height="100%" />
      : <ItemThumb item={item} look={look} />;
  return (
    <Sheet open={!!itemId} onClose={() => { setMsg(null); onClose(); }} title={item.name}>
      <div className="item-detail">
        <div className={`dressing-stage ${isWear(item) || item.slot === 'emote' ? '' : 'is-object'}`}>{preview}</div>
        <div className="item-info">
          <p><Tag tone={item.rarity === 'legendary' ? 'brass' : item.rarity === 'epic' ? 'warn' : 'muted'}>{RARITY_LABEL[item.rarity]}</Tag> <span className="muted small">{SLOT_LABEL[item.slot]}</span></p>
          {item.desc && <p className="muted">{item.desc}</p>}
          <StateLabel item={item} wallet={wallet} />
          {msg && <p className="item-msg" role="status">{msg}</p>}
          <div className="btn-row">
            {st.kind === 'buy' && <Button onClick={doBuy} disabled={wallet.coins < st.price}>{st.price === 0 ? 'Claim' : `Buy for ${st.price.toLocaleString('en-GB')}`}</Button>}
            {st.kind === 'owned' && item.slot !== 'emote' && item.slot !== 'celebration' && <Button onClick={() => wearNow(item)}>{isWear(item) ? 'Wear it' : 'Use it'}</Button>}
            {item.slot === 'celebration' && st.kind === 'owned' && <Button onClick={() => wearNow(item)}>Use it</Button>}
            {item.slot === 'celebration' && <Button variant="ghost" onClick={() => setCelebrate(true)}>Preview</Button>}
          </div>
          {st.kind === 'buy' && wallet.coins < st.price && <p className="small muted">You have <Coins />. Win tables, titles and Cups to earn more.</p>}
        </div>
      </div>
      {celebrate && <CelebrationOverlay kind={item.kind} look={look} extras={extras} onDone={() => setCelebrate(false)} headline="Preview" />}
    </Sheet>
  );
}
