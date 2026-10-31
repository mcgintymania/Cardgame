import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Button, Segmented, Tag, Toggle } from '../../design/ui.tsx';
import { pickOpponents } from '../../lib/club.ts';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { MemberSheet, SeatPicker, TitleStrip } from '../club/bits.tsx';
import { defaultBlackjackConfig, normalizeBlackjackConfig, type BlackjackConfig } from '../../../../../packages/engine/src/blackjack/types.ts';

export function BlackjackSetup({ nav }: { nav: Nav }) {
  const saved = useStore();
  const [rules, setRules] = useState<BlackjackConfig>(() => normalizeBlackjackConfig(saved.bjRules ?? undefined));
  const [count, setCount] = useState(3);
  const [picked, setPicked] = useState<string[]>(() => pickOpponents(saved.club, 'blackjack', 3, cryptoRng()));
  const [member, setMember] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const isDefault = JSON.stringify(rules) === JSON.stringify(defaultBlackjackConfig());
  const update = (patch: Partial<BlackjackConfig>) => {
    const r = normalizeBlackjackConfig({ ...rules, ...patch });
    setRules(r);
    store.setBjRules(r);
  };
  const changeCount = (n: number) => {
    setCount(n);
    setPicked((p: string[]) => (n <= p.length ? p.slice(0, n) : [...p, ...pickOpponents(saved.club, 'blackjack', n - p.length, cryptoRng(), p)]));
  };

  return (
    <div className="page setup">
      <header className="page-head">
        <p className="eyebrow">Practice table · tournament</p>
        <h1 className="display h-lg">Blackjack</h1>
        <p className="lede">Everyone at the table plays the dealer. You all start with {rules.startingChips.toLocaleString('en-GB')} chips, and after {rules.rounds} hands the biggest stack wins. Play it safe or bet big to catch the leader.</p>
      </header>

      <section className="block">
        <h2 className="h-sec">Your table</h2>
        <SeatPicker game="blackjack" count={count} min={1} max={4} ids={picked} onCount={changeCount}
          onShuffle={() => setPicked(pickOpponents(saved.club, 'blackjack', count, cryptoRng()))} onTap={setMember} />
        <TitleStrip game="blackjack" onClick={() => nav.go('club')} />
      </section>

      <section className="block">
        <button className="disclosure" aria-expanded={showRules} onClick={() => setShowRules((s: boolean) => !s)}>
          <span>
            <b>Table rules</b>
            <small>{isDefault ? 'Standard casino rules' : 'Customised'} · {rules.rounds} hands · blackjack pays {rules.blackjackPays === 1.5 ? '3:2' : '6:5'}</small>
          </span>
          <span className={`chev ${showRules ? 'is-open' : ''}`} aria-hidden="true">›</span>
        </button>
        {showRules && (
          <div className="panel">
            <Segmented id="bj-rounds" label="Hands" value={String(rules.rounds)}
              options={[{ value: '8', label: '8' }, { value: '12', label: '12' }, { value: '20', label: '20' }]} onChange={(v) => update({ rounds: Number(v) })} />
            <Segmented id="bj-pays" label="Blackjack pays" value={String(rules.blackjackPays)}
              options={[{ value: '1.5', label: '3 to 2' }, { value: '1.2', label: '6 to 5' }]} onChange={(v) => update({ blackjackPays: Number(v) })} />
            <Toggle id="bj-h17" label="Dealer hits soft 17" hint="Slightly worse for players." checked={rules.dealerHitsSoft17} onChange={(v) => update({ dealerHitsSoft17: v })} />
            <Toggle id="bj-das" label="Double after splitting" checked={rules.doubleAfterSplit} onChange={(v) => update({ doubleAfterSplit: v })} />
            <Toggle id="bj-sur" label="Surrender" hint="Give up half your bet on your first two cards." checked={rules.surrender} onChange={(v) => update({ surrender: v })} />
            <div className="btn-row">
              <Button variant="ghost" size="sm" disabled={isDefault} onClick={() => { setRules(defaultBlackjackConfig()); store.setBjRules(null); }}>Reset to standard</Button>
            </div>
          </div>
        )}
      </section>

      <MemberSheet id={member} onClose={() => setMember(null)} myName={saved.profile?.name ?? 'You'} />
      <div className="start-bar">
        <span className="muted small"><Tag>Practice chips</Tag> Not your real balance</span>
        <Button size="lg" onClick={() => nav.startBlackjack({ config: rules, opponents: picked, kind: 'casual' })}>Take a seat</Button>
      </div>
    </div>
  );
}
