import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Button, Segmented, Tag, Toggle } from '../../design/ui.tsx';
import { pickOpponents } from '../../lib/club.ts';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { MemberSheet, SeatPicker, TitleStrip } from '../club/bits.tsx';
import { defaultGinConfig, normalizeGinConfig, type GinConfig } from '../../../../../packages/engine/src/gin/types.ts';

export function GinSetup({ nav }: { nav: Nav }) {
  const saved = useStore();
  const [rules, setRules] = useState<GinConfig>(() => normalizeGinConfig(saved.ginRules ?? undefined));
  const [picked, setPicked] = useState<string[]>(() => pickOpponents(saved.club, 'gin', 1, cryptoRng()));
  const [member, setMember] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const isDefault = JSON.stringify(rules) === JSON.stringify(defaultGinConfig());
  const update = (patch: Partial<GinConfig>) => {
    const r = normalizeGinConfig({ ...rules, ...patch });
    setRules(r);
    store.setGinRules(r);
  };

  return (
    <div className="page setup">
      <header className="page-head">
        <p className="eyebrow">Club table · one on one</p>
        <h1 className="display h-lg">Gin Rummy</h1>
        <p className="lede">Build sets and runs, keep your deadwood low, and knock when it's {rules.knockMax} or under. Go gin for a bonus. First to {rules.target} wins.</p>
      </header>

      <section className="block">
        <h2 className="h-sec">Your opponent</h2>
        <SeatPicker game="gin" count={1} min={1} max={1} ids={picked} onCount={() => undefined}
          onShuffle={() => setPicked(pickOpponents(saved.club, 'gin', 1, cryptoRng()))} onTap={setMember} />
        <TitleStrip game="gin" onClick={() => nav.go('club')} />
      </section>

      <section className="block">
        <button className="disclosure" aria-expanded={showRules} onClick={() => setShowRules((s: boolean) => !s)}>
          <span>
            <b>Table rules</b>
            <small>{isDefault ? 'Standard Gin' : 'Customised'} · game to {rules.target} · knock on {rules.knockMax}</small>
          </span>
          <span className={`chev ${showRules ? 'is-open' : ''}`} aria-hidden="true">›</span>
        </button>
        {showRules && (
          <div className="panel">
            <Segmented id="g-target" label="Game to" value={String(rules.target)}
              options={[{ value: '50', label: '50' }, { value: '100', label: '100' }, { value: '150', label: '150' }]} onChange={(v) => update({ target: Number(v) })} />
            <Segmented id="g-knock" label="Knock with deadwood of" hint="10 is standard. Lower makes knocking harder." value={String(rules.knockMax)}
              options={[{ value: '10', label: '10' }, { value: '7', label: '7' }, { value: '5', label: '5' }, { value: '0', label: 'Gin only' }]} onChange={(v) => update({ knockMax: Number(v) })} />
            <Toggle id="g-up" label="Offer the upcard first" hint="Classic opening: non-dealer, then dealer, may take the first upcard." checked={rules.upcardOffer} onChange={(v) => update({ upcardOffer: v })} />
            <div className="btn-row">
              <Button variant="ghost" size="sm" disabled={isDefault} onClick={() => { setRules(defaultGinConfig()); store.setGinRules(null); }}>Reset to standard</Button>
            </div>
          </div>
        )}
      </section>

      <MemberSheet id={member} onClose={() => setMember(null)} myName={saved.profile?.name ?? 'You'} />
      <div className="start-bar">
        <span className="muted small"><Tag>Club table</Tag> Coins, XP and ranking when you finish</span>
        <Button size="lg" onClick={() => nav.startGin({ config: rules, opponents: picked, kind: 'casual' })}>Deal me in</Button>
      </div>
    </div>
  );
}
