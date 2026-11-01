import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Button, Tag } from '../../design/ui.tsx';
import { pickOpponents, titleName, titleStatus, nameOf, TITLE_SHOT_RANK, ordinal } from '../../lib/club.ts';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { MemberSheet, SeatPicker } from '../club/bits.tsx';
import { RulesEditor } from './RulesEditor.tsx';
import { defaultTake2Config, normalizeTake2Config, type Take2Config } from '../../../../../packages/engine/src/take2/config.ts';

export function Take2Setup({ nav }: { nav: Nav }) {
  const saved = useStore();
  const [rules, setRules] = useState<Take2Config>(() => normalizeTake2Config(saved.take2Rules ?? undefined));
  const [count, setCount] = useState<number>(() => saved.take2Table?.count ?? 3);
  const [picked, setPicked] = useState<string[]>(() => pickOpponents(saved.club, 'take2', saved.take2Table?.count ?? 3, cryptoRng()));
  const [member, setMember] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const isDefault = JSON.stringify(rules) === JSON.stringify(defaultTake2Config());

  const changeCount = (n: number) => {
    setCount(n);
    setPicked((p: string[]) => (n <= p.length ? p.slice(0, n) : [...p, ...pickOpponents(saved.club, 'take2', n - p.length, cryptoRng(), p)]));
  };
  const status = titleStatus(saved.club, 'take2');
  const updateRules = (r: Take2Config) => {
    setRules(r);
    store.setTake2Rules(r);
  };
  const start = () => {
    store.setTake2Table({ opponents: picked, count });
    nav.startTake2({ config: rules, opponents: picked, kind: 'casual' });
  };

  return (
    <div className="page setup">
      <header className="page-head">
        <p className="eyebrow">Club table</p>
        <h1 className="display h-lg">Take 2</h1>
        <p className="lede">Get rid of your cards. When someone goes out, everyone else adds up their hand. Reach {rules.eliminationAt} and you're knocked out. Last player standing wins.</p>
      </header>

      <section className="block">
        <h2 className="h-sec">Your table</h2>
        <SeatPicker game="take2" count={count} min={1} max={5} ids={picked} onCount={changeCount}
          onShuffle={() => setPicked(pickOpponents(saved.club, 'take2', count, cryptoRng()))} onTap={setMember} />
        <button className="event-strip" onClick={() => nav.go('club')}>
          <span>
            <b>{titleName('take2')}</b>
            <small>{status.kind === 'champion' ? "You're the champion. Defend it at the club." : status.kind === 'eligible' ? `You've earned a shot at ${nameOf(status.holder)}.` : `Held by ${nameOf(status.holder)}. Reach the top ${TITLE_SHOT_RANK} for a shot (you're ${ordinal(status.myRank)}).`}</small>
          </span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
      </section>

      <section className="block">
        <button className="disclosure" aria-expanded={showRules} onClick={() => setShowRules((s: boolean) => !s)}>
          <span>
            <b>House rules</b>
            <small>{isDefault ? 'Standard settings' : 'Customised'} · 2s double your hand · knockout at {rules.eliminationAt}</small>
          </span>
          <span className={`chev ${showRules ? 'is-open' : ''}`} aria-hidden="true">›</span>
        </button>
        {showRules && (
          <div className="panel">
            <RulesEditor value={rules} onChange={updateRules} />
            <div className="btn-row">
              <Button variant="ghost" size="sm" disabled={isDefault} onClick={() => updateRules(defaultTake2Config())}>Reset to standard</Button>
            </div>
          </div>
        )}
      </section>

      <MemberSheet id={member} onClose={() => setMember(null)} myName={saved.profile?.name ?? 'You'} />
      <div className="start-bar">
        <span className="muted small"><Tag>Club table</Tag> Coins, XP and ranking when you finish</span>
        <Button size="lg" onClick={start}>Deal me in</Button>
      </div>
    </div>
  );
}
