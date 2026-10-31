import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { CATALOGUE, SLOT_LABEL, getItem, type ItemSlot, type TableSlot, type WearSlot } from '../../lib/catalogue.ts';
import { itemState } from '../../lib/progress.ts';
import { Character, POSES, type Look, type Pose } from '../../design/Character.tsx';
import { Button } from '../../design/ui.tsx';
import { BodyEditor } from './BodyEditor.tsx';
import { ItemSheet, ItemThumb, OPTIONAL_SLOTS, StateLabel, TABLE_SLOTS, WEAR_SLOTS } from './Items.tsx';
import { Coins, LevelBar, useMyExtras } from './bits.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';

type Tab = 'body' | WearSlot | TableSlot | 'emote';
const TABS: Tab[] = ['body', 'hat', 'glasses', 'top', 'jacket', 'neck', 'pin', 'wrist', 'legs', 'shoes', 'tattoo', 'necktat', 'handtat', 'felt', 'wood', 'cardback', 'prop', 'celebration', 'emote'];
const TAB_LABEL: Record<Tab, string> = {
  body: 'You', hat: 'Hats', glasses: 'Glasses', top: 'Tops', jacket: 'Jackets', neck: 'Neckwear', pin: 'Pins', wrist: 'Watches',
  legs: 'Trousers', shoes: 'Shoes', felt: 'Felt', wood: 'Rail', cardback: 'Card backs', celebration: 'Celebration', emote: 'Emotes', tattoo: 'Arm ink', necktat: 'Neck ink', handtat: 'Hand ink', prop: 'Table props',
};

export function Wardrobe({ nav }: { nav: Nav }) {
  const { profile, wallet, club } = useStore();
  const extras = useMyExtras();
  const [draft, setDraft] = useState<Look>(() => profile!.avatar);
  const [tab, setTab] = useState<Tab>('jacket');
  const [pose, setPose] = useState<Pose>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  if (!profile) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.avatar);
  const ownedEmotes = CATALOGUE.filter((i) => i.slot === 'emote' && wallet.owned.includes(i.id));

  const equipWear = (slot: WearSlot, id: string | null) => {
    const wear = { ...draft.wear };
    if (id) wear[slot] = id; else delete wear[slot];
    setDraft({ ...draft, wear });
  };
  const equipTable = (slot: TableSlot, id: string | null) => {
    const table = { ...wallet.table } as Record<string, string | undefined>;
    if (id) table[slot] = id; else delete table[slot];
    store.setWallet({ ...wallet, table: table as typeof wallet.table });
  };

  const items = tab === 'body' ? [] : CATALOGUE.filter((i) => i.slot === (tab as ItemSlot))
    .sort((a, b) => Number(!wallet.owned.includes(a.id)) - Number(!wallet.owned.includes(b.id)));
  const isWearTab = (WEAR_SLOTS as string[]).includes(tab);
  const isTableTab = (TABLE_SLOTS as string[]).includes(tab);
  const equippedId = isWearTab ? draft.wear[tab as WearSlot] : isTableTab ? wallet.table[tab as TableSlot] : null;
  const ownedCount = wallet.owned.length;

  return (
    <div className="page wardrobe">
      <header className="page-head wardrobe-head">
        <div>
          <p className="eyebrow">Dressing room</p>
          <h1 className="display h-lg">Wardrobe</h1>
        </div>
        <div className="wardrobe-meta">
          <Coins />
          <span className="muted small">{ownedCount} of {CATALOGUE.length} items</span>
        </div>
      </header>

      <div className="wardrobe-layout">
        <section className="dressing" aria-label="Preview">
          <div className="dressing-stage mirror">
            <Character look={draft} extras={extras} pose={pose} animate width="100%" height="100%" title="Your character" />
          </div>
          <div className="pose-row" role="group" aria-label="Try a pose">
            <button className={`pose-btn ${pose === 'idle' ? 'is-on' : ''}`} onClick={() => setPose('idle')}>Stand</button>
            {ownedEmotes.map((e) => (
              <button key={e.id} className={`pose-btn ${pose === e.kind ? 'is-on' : ''}`} onClick={() => setPose(e.kind as Pose)}>{e.name}</button>
            ))}
          </div>
          <LevelBar compact />
          <div className="btn-row save-row">
            <Button disabled={!dirty} onClick={() => store.setProfile({ ...profile, avatar: draft })}>{dirty ? 'Save outfit' : 'Saved'}</Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(profile.avatar)}>Undo changes</Button>
            <Button variant="ghost" onClick={() => nav.go('shop')}>Shop</Button>
          </div>
        </section>

        <section className="closet" aria-label="Closet">
          <div className="tab-strip" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab-chip ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
            ))}
          </div>

          {tab === 'body' ? (
            <div className="panel"><BodyEditor value={draft} onChange={setDraft} /></div>
          ) : (
            <>
              {tab === 'celebration' && <div className="btn-row"><Button variant="ghost" size="sm" onClick={() => setCelebrate(true)}>Preview your celebration</Button></div>}
              {tab === 'emote' && <p className="muted small">Emotes are used at the table and in the dressing room. Tap one to try it.</p>}
              <div className="item-grid">
                {isWearTab && OPTIONAL_SLOTS.includes(tab as WearSlot) && (
                  <button className={`item-card ${!equippedId ? 'is-on' : ''}`} onClick={() => equipWear(tab as WearSlot, null)}>
                    <span className="thumb thumb-none">None</span>
                    <span className="item-name">No {SLOT_LABEL[tab as ItemSlot].toLowerCase()}</span>
                  </button>
                )}
                {tab === 'prop' && (
                  <button className={`item-card ${!equippedId ? 'is-on' : ''}`} onClick={() => equipTable('prop', null)}>
                    <span className="thumb thumb-none">None</span>
                    <span className="item-name">Nothing by my seat</span>
                  </button>
                )}
                {items.map((i) => {
                  const st = itemState(i, wallet, club);
                  const owned = st.kind === 'owned';
                  const on = equippedId === i.id || (tab === 'emote' && pose === i.kind);
                  return (
                    <button key={i.id} className={`item-card rarity-${i.rarity} ${on ? 'is-on' : ''} ${owned ? '' : 'is-locked'}`}
                      onClick={() => {
                        if (!owned) { setDetail(i.id); return; }
                        if (isWearTab) equipWear(tab as WearSlot, i.id);
                        else if (isTableTab) equipTable(tab as TableSlot, i.id);
                        else if (tab === 'emote') setPose(i.kind as Pose);
                      }}
                      aria-pressed={on}>
                      <ItemThumb item={i} look={draft} />
                      <span className="item-name">{i.name}</span>
                      {!owned && <StateLabel item={i} wallet={wallet} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <ItemSheet itemId={detail} onClose={() => setDetail(null)} onWear={(i) => {
        if ((WEAR_SLOTS as string[]).includes(i.slot)) equipWear(i.slot as WearSlot, i.id);
        else if ((TABLE_SLOTS as string[]).includes(i.slot)) equipTable(i.slot as TableSlot, i.id);
        setDetail(null);
      }} />
      {celebrate && <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={draft} extras={extras} headline="Winner!" onDone={() => setCelebrate(false)} />}
    </div>
  );
}

export const POSE_NAMES = Object.keys(POSES);
