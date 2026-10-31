import React, { useState } from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Button, Segmented, Tag } from '../../design/ui.tsx';
import { pickOpponents } from '../../lib/club.ts';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { MemberSheet, SeatPicker, TitleStrip } from '../club/bits.tsx';
import type { PokerConfig } from '../../../../../packages/engine/src/poker/types.ts';

export const POKER_PRESETS: Record<string, { label: string; blurb: string; config: PokerConfig }> = {
  casual: { label: 'Casual', blurb: '1,000 chips. Blinds 10/20 and they stay there.', config: { startingStack: 1000, smallBlind: 10, bigBlind: 20, blindsUpEvery: 0 } },
  tournament: { label: 'Tournament', blurb: '1,000 chips. Blinds go up every 8 hands.', config: { startingStack: 1000, smallBlind: 10, bigBlind: 20, blindsUpEvery: 8 } },
  turbo: { label: 'Turbo', blurb: '600 chips. Blinds go up every 5 hands.', config: { startingStack: 600, smallBlind: 10, bigBlind: 20, blindsUpEvery: 5 } },
};

export function PokerSetup({ nav, game = 'poker' }: { nav: Nav; game?: 'poker' | 'draw' }) {
  const saved = useStore();
  const draw = game === 'draw';
  const maxOpp = draw ? 5 : 8;
  const initial = draw ? 3 : saved.pokerTable?.count ?? 5;
  const [count, setCount] = useState<number>(initial);
  const [picked, setPicked] = useState<string[]>(() => pickOpponents(saved.club, game, initial, cryptoRng()));
  const [member, setMember] = useState<string | null>(null);
  const [preset, setPreset] = useState<string>(() => (saved.pokerTable?.preset && POKER_PRESETS[saved.pokerTable.preset] ? saved.pokerTable.preset : 'tournament'));

  const changeCount = (n: number) => {
    setCount(n);
    setPicked((p: string[]) => (n <= p.length ? p.slice(0, n) : [...p, ...pickOpponents(saved.club, game, n - p.length, cryptoRng(), p)]));
  };
  const start = () => {
    if (!draw) store.setPokerTable({ opponents: picked, preset, count });
    nav.startPoker({ config: { ...POKER_PRESETS[preset].config, variant: draw ? 'draw' : 'holdem' }, opponents: picked, kind: 'casual' });
  };

  return (
    <div className="page setup">
      <header className="page-head">
        <p className="eyebrow">Practice table</p>
        <h1 className="display h-lg">{draw ? 'Five-Card Draw' : "Texas Hold'em"}</h1>
        <p className="lede">{draw
          ? 'The classic home game. Five cards each, a round of betting, swap up to three cards, then bet again. Best hand wins. Last player with chips takes the table.'
          : "No-limit Hold'em. Make the best five-card hand from your two cards and the five on the table. Last player with chips wins."}</p>
      </header>

      <section className="block">
        <h2 className="h-sec">Your table</h2>
        <SeatPicker game={game} count={count} min={1} max={maxOpp} ids={picked} onCount={changeCount}
          onShuffle={() => setPicked(pickOpponents(saved.club, game, count, cryptoRng()))} onTap={setMember} />
        <TitleStrip game={game} onClick={() => nav.go('club')} />
      </section>

      <section className="block">
        <div className="panel">
          <Segmented id="p-preset" label="Table" hint={POKER_PRESETS[preset].blurb} value={preset}
            options={Object.entries(POKER_PRESETS).map(([value, p]) => ({ value, label: p.label }))}
            onChange={setPreset} />
        </div>
      </section>

      <MemberSheet id={member} onClose={() => setMember(null)} myName={saved.profile?.name ?? 'You'} />
      <div className="start-bar">
        <span className="muted small"><Tag>Practice chips</Tag> Not your real balance</span>
        <Button size="lg" onClick={start}>Take a seat</Button>
      </div>
    </div>
  );
}
