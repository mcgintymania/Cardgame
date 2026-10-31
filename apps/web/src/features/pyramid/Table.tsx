import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion, store, useStore } from '../../lib/store.ts';
import { tableTheme } from '../../lib/tableTheme.ts';
import { getItem } from '../../lib/catalogue.ts';
import { applyReward, grantUnlocks, recordSolo } from '../../lib/progress.ts';
import { awardFeats } from '../../lib/feats.ts';
import { sfx } from '../../lib/audio.ts';
import { CardBack, CardFace } from '../../design/PlayingCard.tsx';
import { Button, Sheet } from '../../design/ui.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';
import { useMyExtras } from '../wardrobe/bits.tsx';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { cardName } from '../../../../../packages/engine/src/core/cards.ts';
import { deal, guess, odds, type Guess, type PyramidConfig, type PyramidState } from '../../../../../packages/engine/src/pyramid/engine.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PyramidTable({ config, onExit, onAgain }: { config: PyramidConfig; onExit: () => void; onAgain: () => void }) {
  const { settings, wallet, profile, pyramid } = useStore();
  const theme = tableTheme(wallet);
  const reduced = prefersReducedMotion(settings);
  const extras = useMyExtras();
  const first = useMemo(() => deal(config, cryptoRng()), []);
  const [s, setS] = useState<PyramidState>(first);
  const [flash, setFlash] = useState<null | 'right' | 'wrong' | 'same'>(null);
  const [sheet, setSheet] = useState<null | 'over' | 'rules'>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [reward, setReward] = useState<string | null>(null);
  const recorded = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 420 });

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const rows = s.config.rows;
  const gapR = 0.1;
  const step = 0.62; // vertical step between rows, as a share of card height
  const cw = Math.max(30, Math.min(130, box.w / (rows + (rows - 1) * gapR), box.h / (1.4 * (1 + (rows - 1) * step))));
  const ch = cw * 1.4;
  const gap = cw * gapR;
  const totalH = ch * (1 + (rows - 1) * step);
  const top0 = Math.max(0, (box.h - totalH) / 2);
  const pos = (row: number, col: number) => ({
    x: box.w / 2 - ((row + 1) * cw + row * gap) / 2 + col * (cw + gap),
    y: top0 + row * ch * step,
  });

  const done = s.status !== 'playing';
  const current = s.cards[s.at];
  const o = odds(s);

  const play = (g: Guess) => {
    if (done) return;
    const next = guess(s, g);
    const r = next.log[next.log.length - 1].result;
    const ok = r === 'right' || (r === 'same' && next.config.same === 'safe');
    setFlash(ok ? (r === 'same' ? 'same' : 'right') : 'wrong');
    setTimeout(() => setFlash(null), reduced ? 300 : 700);
    if (ok) sfx.card(); else sfx.penalty();
    setS(next);
  };

  // Keyboard: ↑ higher, ↓ lower.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); play('higher'); }
      if (e.key === 'ArrowDown') { e.preventDefault(); play('lower'); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // Record the result once.
  useEffect(() => {
    if (!done || recorded.current) return;
    recorded.current = true;
    const st = store.get().pyramid;
    const key = String(rows);
    const won = s.status === 'won';
    store.setPyramid({
      ...st,
      played: st.played + 1,
      wins: st.wins + (won ? 1 : 0),
      best: { ...st.best, [key]: Math.max(st.best[key] ?? 0, s.score) },
      streak: won ? st.streak + 1 : 0,
      bestStreak: Math.max(st.bestStreak, won ? st.streak + 1 : 0),
    });
    store.setWallet(grantUnlocks(recordSolo(store.get().wallet, 'pyramid', won), store.get().club).wallet);
    if (won) awardFeats(['summit', ...(rows >= 9 ? ['pyramid9' as const] : [])]);
    if (won) {
      const coins = rows * 5;
      const { wallet: w, coins: paid, xp: xpPaid } = applyReward(store.get().wallet, { coins, xp: rows * 6, lines: [] }, `Beat the Pyramid (${rows} rows)`, false);
      store.setWallet(w);
      setReward(`+${paid} coins · +${xpPaid} XP`);
      sfx.win();
      setTimeout(() => setCelebrate(true), reduced ? 100 : 500);
    } else sfx.knockout();
    setTimeout(() => setSheet('over'), won ? (reduced ? 600 : 2600) : reduced ? 400 : 1200);
  }, [done]);

  const bestBefore = pyramid.best[String(rows)] ?? 0;
  const rowOf = s.path[Math.min(s.at, s.path.length - 1)].row;
  const rowsCleared = rows - 1 - rowOf + (s.status === 'won' ? 1 : 0);
  const showOdds = pyramid.showOdds;

  return (
    <div className={`table-screen pyr-screen ${theme.className} ${reduced ? 'reduce-motion' : ''}`} style={theme.style}>
      <header className="table-bar">
        <button className="icon-btn" onClick={onExit} aria-label="Leave">‹</button>
        <div className="table-title">
          <span className="display">Beat the Pyramid</span>
          <small>{rows} rows · score {s.score} of {s.cards.length - 1}{s.config.lives > 1 ? ` · ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left` : ''}</small>
        </div>
        <div className="table-tools">
          <button className={`icon-btn ${showOdds ? 'is-on' : ''}`} onClick={() => store.setPyramid({ ...store.get().pyramid, showOdds: !showOdds })} aria-pressed={showOdds} aria-label="Show the odds">%</button>
          <button className="icon-btn" onClick={() => setSheet('rules')} aria-label="How to play">?</button>
          <button className="icon-btn" onClick={() => store.setSettings({ sound: !settings.sound })} aria-label={settings.sound ? 'Mute sound' : 'Turn sound on'} aria-pressed={settings.sound}>{settings.sound ? '♪' : '–'}</button>
        </div>
      </header>

      <section className="pyr-stage" aria-label="The pyramid">
        <div className="pyr-felt">
          <div className="pyr-board" ref={boardRef}>
            {s.path.map((slot, i) => {
              const p = pos(slot.row, slot.col);
              const up = i <= s.at;
              const isCur = i === s.at && !done;
              const isNext = i === s.at + 1 && !done;
              const lastFlip = i === s.at && i > 0;
              const res = i > 0 && i <= s.at ? s.log[i - 1].result : null;
              const bad = res === 'wrong' || (res === 'same' && s.config.same === 'lose');
              return (
                <div key={i} className={`pyr-card ${isCur ? 'is-current' : ''} ${isNext ? 'is-next' : ''} ${up ? 'is-up' : ''} ${bad ? 'is-bad' : ''} ${lastFlip && flash ? `flash-${flash}` : ''}`}
                  style={{ left: p.x, top: p.y, width: cw, height: ch, zIndex: 10 + slot.row }}
                  aria-label={up ? cardName(s.cards[i]) : isNext ? 'Next card, face down' : 'Face-down card'}>
                  {up ? <CardFace card={s.cards[i]} size={`${cw}px`} className={lastFlip ? 'flip-in' : ''} key={`f${i}`} /> : <CardBack size={`${cw}px`} />}
                  {bad && <span className="pyr-x" aria-hidden="true">✕</span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="me pyr-me" aria-label="Your guess">
        <p className="status is-turn" role="status">
          {s.status === 'won' ? 'You beat the pyramid!' : s.status === 'lost' ? `Out! You climbed ${s.score} of ${s.cards.length - 1}.` : `${cardName(current)}: is the next card higher or lower?`}
        </p>
        {showOdds && !done && (
          <p className="pyr-odds">Higher {pct(o.higher)} · Lower {pct(o.lower)} · Same {pct(o.same)}</p>
        )}
        <div className="actions pyr-actions">
          {!done ? (
            <>
              <Button size="lg" onClick={() => play('higher')}>▲ Higher</Button>
              <Button size="lg" variant="felt" onClick={() => play('lower')}>▼ Lower</Button>
            </>
          ) : (
            <>
              <Button size="lg" onClick={onAgain}>New pyramid</Button>
              <Button variant="ghost" onClick={onExit}>Back</Button>
            </>
          )}
        </div>
        <p className="pyr-progress muted small">Row {Math.min(rows, rowsCleared + 1)} of {rows} · best on {rows} rows: {Math.max(bestBefore, s.score)}</p>
      </section>

      {celebrate && profile && (
        <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={profile.avatar} extras={extras}
          headline="Pyramid beaten!" sub={reward ?? undefined} onDone={() => setCelebrate(false)} />
      )}

      <Sheet open={sheet === 'over'} onClose={() => setSheet(null)} title={s.status === 'won' ? 'Pyramid beaten!' : 'Out!'}>
        <div className="winner">
          <p className="eyebrow">{rows}-row pyramid</p>
          <h2 className="display h-lg">{s.score} <small className="muted">of {s.cards.length - 1}</small></h2>
          <p className="muted">{s.status === 'won' ? 'All the way to the top.' : `You reached row ${Math.min(rows, rowsCleared + 1)} of ${rows}.`}{s.score > bestBefore ? ' A new best!' : bestBefore ? ` Your best is ${bestBefore}.` : ''}</p>
        </div>
        {reward && <div className="outcome outcome-good"><p className="outcome-line">{reward}</p></div>}
        <div className="btn-row sticky-actions">
          <Button size="lg" onClick={onAgain}>New pyramid</Button>
          <Button variant="ghost" onClick={onExit}>Back</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title="How to play">
        <div className="rules-text">
          <p>The cards are laid out in a pyramid, face down. The bottom-left card starts face up.</p>
          <ul>
            <li>Guess whether the next card is <b>higher</b> or <b>lower</b>, then it turns over.</li>
            <li>The climb goes along the bottom row, then {s.config.path === 'zigzag' ? 'back the other way along' : 'along'} each row above, finishing on the top card.</li>
            <li>A card of the same rank {s.config.same === 'safe' ? 'is safe: keep going' : 'counts as wrong'}. Aces are {s.config.aces}.</li>
            <li>{s.config.lives > 1 ? `You have ${s.config.lives} lives: a wrong guess costs one.` : 'One wrong guess and you\'re out.'} Your score is how many you got right.</li>
            <li>The % button shows the odds for the next card, counting only cards you haven't seen. On a keyboard, ↑ and ↓ guess.</li>
          </ul>
        </div>
      </Sheet>
    </div>
  );
}
