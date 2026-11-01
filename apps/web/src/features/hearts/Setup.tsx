import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Button, Segmented, Tag, Toggle } from '../../design/ui.tsx';
import { pickOpponents } from '../../lib/club.ts';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { MemberSheet, SeatPicker, TitleStrip } from '../club/bits.tsx';
import { defaultHeartsConfig, normalizeHeartsConfig, type HeartsConfig } from '../../../../../packages/engine/src/hearts/types.ts';

export function HeartsSetup({ nav }: { nav: Nav }) {
  const saved = useStore();
  const [rules, setRules] = useState<HeartsConfig>(() => normalizeHeartsConfig(saved.heartsRules ?? undefined));
  const [picked, setPicked] = useState<string[]>(() => pickOpponents(saved.club, 'hearts', 3, cryptoRng()));
  const [member, setMember] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const isDefault = JSON.stringify(rules) === JSON.stringify(defaultHeartsConfig());
  const update = (patch: Partial<HeartsConfig>) => {
    const r = normalizeHeartsConfig({ ...rules, ...patch });
    setRules(r);
    store.setHeartsRules(r);
  };

  return (
    <div className="page setup">
      <header className="page-head">
        <p className="eyebrow">Club table · four players</p>
        <h1 className="display h-lg">Hearts</h1>
        <p className="lede">Dodge the hearts and the Queen of Spades. Every heart is a point, the Queen is 13, and the lowest score wins when someone hits {rules.endAt}. Or take the lot and shoot the moon.</p>
      </header>

      <section className="block">
        <h2 className="h-sec">Your table</h2>
        <SeatPicker game="hearts" count={3} min={3} max={3} ids={picked} onCount={() => undefined}
          onShuffle={() => setPicked(pickOpponents(saved.club, 'hearts', 3, cryptoRng()))} onTap={setMember} />
        <TitleStrip game="hearts" onClick={() => nav.go('club')} />
      </section>

      <section className="block">
        <button className="disclosure" aria-expanded={showRules} onClick={() => setShowRules((s: boolean) => !s)}>
          <span>
            <b>Table rules</b>
            <small>{isDefault ? 'Standard Hearts' : 'Customised'} · game to {rules.endAt} · {rules.passing ? 'passing on' : 'no passing'}</small>
          </span>
          <span className={`chev ${showRules ? 'is-open' : ''}`} aria-hidden="true">›</span>
        </button>
        {showRules && (
          <div className="panel">
            <Segmented id="h-end" label="Game to" hint="The match ends after the hand where someone reaches this." value={String(rules.endAt)}
              options={[{ value: '50', label: '50' }, { value: '75', label: '75' }, { value: '100', label: '100' }]} onChange={(v) => update({ endAt: Number(v) })} />
            <Toggle id="h-pass" label="Pass three cards" hint="Left, right, across, then hold." checked={rules.passing} onChange={(v) => update({ passing: v })} />
            <Segmented id="h-moon" label="Shooting the moon" value={rules.moon}
              options={[{ value: 'addToOthers', label: 'Others +26' }, { value: 'subtractFromSelf', label: 'You −26' }]} onChange={(v) => update({ moon: v })} />
            <Toggle id="h-jd" label="Jack of Diamonds is −10" hint="A popular house variant." checked={rules.jackOfDiamonds} onChange={(v) => update({ jackOfDiamonds: v })} />
            <Toggle id="h-first" label="No points on the first trick" checked={rules.noPointsFirstTrick} onChange={(v) => update({ noPointsFirstTrick: v })} />
            <Toggle id="h-queen" label="The Queen breaks hearts" checked={rules.queenBreaksHearts} onChange={(v) => update({ queenBreaksHearts: v })} />
            <div className="btn-row">
              <Button variant="ghost" size="sm" disabled={isDefault} onClick={() => { setRules(defaultHeartsConfig()); store.setHeartsRules(null); }}>Reset to standard</Button>
            </div>
          </div>
        )}
      </section>

      <MemberSheet id={member} onClose={() => setMember(null)} myName={saved.profile?.name ?? 'You'} />
      <div className="start-bar">
        <span className="muted small"><Tag>Club table</Tag> Coins, XP and ranking when you finish</span>
        <Button size="lg" onClick={() => nav.startHearts({ config: rules, opponents: picked, kind: 'casual' })}>Deal me in</Button>
      </div>
    </div>
  );
}
