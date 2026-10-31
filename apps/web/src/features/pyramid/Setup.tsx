import React from 'react';
import type { Nav } from '../../app/App.tsx';
import { store, useStore } from '../../lib/store.ts';
import { Button, Segmented, Tag, Toggle } from '../../design/ui.tsx';
import { normalizePyramidConfig, pyramidSize, PYRAMID_MAX_ROWS, PYRAMID_MIN_ROWS, type PyramidConfig } from '../../../../../packages/engine/src/pyramid/engine.ts';

export function PyramidSetup({ nav }: { nav: Nav }) {
  const { pyramid: st } = useStore();
  const cfg = normalizePyramidConfig(st.config);
  const set = (patch: Partial<PyramidConfig>) => store.setPyramid({ ...st, config: normalizePyramidConfig({ ...cfg, ...patch }) });
  const sizes = Array.from({ length: PYRAMID_MAX_ROWS - PYRAMID_MIN_ROWS + 1 }, (_, i) => PYRAMID_MIN_ROWS + i);
  return (
    <div className="page setup">
      <header className="page-head">
        <p className="eyebrow">Just you and the deck</p>
        <h1 className="display h-lg">Beat the Pyramid</h1>
        <p className="lede">Higher or lower, all the way to the top. Start at the bottom-left card and guess each next card. Reach the top card to beat the pyramid.</p>
      </header>

      <section className="block">
        <div className="panel">
          <Segmented id="pyr-rows" label="Rows" hint={`${pyramidSize(cfg.rows)} cards: ${pyramidSize(cfg.rows) - 1} guesses to the top.`} value={String(cfg.rows)}
            options={sizes.map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => set({ rows: Number(v) })} />
          <Segmented id="pyr-path" label="The climb" hint={cfg.path === 'rows' ? 'Each row left to right, starting bottom-left.' : 'Like a snake: each row goes the opposite way to the last.'} value={cfg.path}
            options={[{ value: 'rows', label: 'Row by row' }, { value: 'zigzag', label: 'Zig-zag' }]} onChange={(path) => set({ path })} />
          <Segmented id="pyr-same" label="Same card (e.g. 7 after a 7)" value={cfg.same}
            options={[{ value: 'safe', label: 'Safe' }, { value: 'lose', label: 'You lose' }]} onChange={(same) => set({ same })} />
          <Segmented id="pyr-aces" label="Aces" value={cfg.aces}
            options={[{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }]} onChange={(aces) => set({ aces })} />
          <Segmented id="pyr-lives" label="Lives" hint="How many wrong guesses before you're out." value={String(cfg.lives)}
            options={[{ value: '1', label: '1' }, { value: '3', label: '3' }]} onChange={(v) => set({ lives: Number(v) })} />
          <Toggle id="pyr-odds" label="Show the odds" hint="Handy for learning: the chance the next card is higher or lower." checked={st.showOdds}
            onChange={(showOdds) => store.setPyramid({ ...st, showOdds })} />
          <div className="btn-row"><Button size="lg" onClick={() => nav.startPyramid(cfg)}>Deal the pyramid</Button></div>
        </div>
      </section>

      <section className="block">
        <div className="ts-block">
          <h2 className="ts-h">Your climbs</h2>
          <dl className="statgrid">
            <div><dt>Beaten</dt><dd>{st.wins}<small>/{st.played}</small></dd></div>
            <div><dt>Streak</dt><dd>{st.streak}<small> best {st.bestStreak}</small></dd></div>
            {sizes.filter((n) => st.best[String(n)] !== undefined).map((n) => (
              <div key={n}><dt>Best · {n} rows</dt><dd>{st.best[String(n)]}<small>/{pyramidSize(n) - 1}</small></dd></div>
            ))}
          </dl>
        </div>
      </section>
      <p className="fine"><Tag>Club coins</Tag> Beating a pyramid earns 5 coins per row. It doesn't affect club ratings.</p>
    </div>
  );
}
