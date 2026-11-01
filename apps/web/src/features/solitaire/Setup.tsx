import React from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Button, Segmented, Tag } from '../../design/ui.tsx';
import { DailyBoard, SolStats } from './Table.tsx';
import { dailyBoard, fmtTime, todayKey } from './daily.ts';

export function SolitaireSetup({ nav }: { nav: Nav }) {
  const { solitaire: st, profile } = useStore();
  const today = st.daily && st.daily.date === todayKey() ? st.daily : null;
  return (
    <div className="page setup">
      <header className="page-head">
        <p className="eyebrow">Just you and the deck</p>
        <h1 className="display h-lg">Solitaire</h1>
        <p className="lede">Classic Klondike. Build the four suits up from Ace to King, using the seven columns to dig out what you need. Tap a card to send it home, or drag it.</p>
      </header>

      <section className="block">
        <div className="panel">
          <Segmented id="sol-draw" label="Turn from the stock" hint={st.draw === 1 ? 'One card at a time: more forgiving.' : 'Three at a time: the classic, tougher game.'}
            value={String(st.draw)} options={[{ value: '1', label: 'Draw 1' }, { value: '3', label: 'Draw 3' }]}
            onChange={(v) => store.setSolitaire({ ...st, draw: v === '3' ? 3 : 1 })} />
          <div className="btn-row"><Button size="lg" onClick={() => nav.startSolitaire({ mode: 'classic', draw: st.draw })}>Deal</Button></div>
        </div>
      </section>

      <section className="block">
        <button className="event-strip daily-strip" onClick={() => nav.startSolitaire({ mode: 'daily', draw: 1 })}>
          <span>
            <b>Daily Deal · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</b>
            <small>{today?.won ? `Solved in ${fmtTime(today.time ?? 0)}. Play again to beat your time.` : today?.tries ? `Not solved yet (${today.tries} ${today.tries === 1 ? 'try' : 'tries'}). Same shuffle as everyone else.` : 'The same shuffle for everyone today, draw 1. First solve earns 40 bonus coins.'}</small>
          </span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
      </section>

      <section className="block two-col">
        <SolStats />
        <DailyBoard rows={dailyBoard(profile?.name ?? 'You', st.daily)} />
      </section>
      <p className="fine"><Tag>Club coins</Tag> Each solve earns 20 coins and some XP. Solitaire doesn't affect your club ratings.</p>
    </div>
  );
}
