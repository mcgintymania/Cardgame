import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion, store, useStore } from '../../lib/store.ts';
import { tableTheme } from '../../lib/tableTheme.ts';
import { getItem } from '../../lib/catalogue.ts';
import { applyReward, grantUnlocks, levelInfo, recordSolo } from '../../lib/progress.ts';
import { awardFeats } from '../../lib/feats.ts';
import { sfx } from '../../lib/audio.ts';
import { CardBack, CardFace } from '../../design/PlayingCard.tsx';
import { Button, Sheet, Tag } from '../../design/ui.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';
import { Avatar } from '../../design/Avatar.tsx';
import { useMyExtras } from '../wardrobe/bits.tsx';
import { cryptoRng, seededRng } from '../../../../../packages/engine/src/core/rng.ts';
import type { Card } from '../../../../../packages/engine/src/core/cards.ts';
import {
  apply, autoStep, bestTarget, canAutoFinish, canMove, deal, hint, isWon, movingCards,
  type Pile, type SolAction, type SolitaireState,
} from '../../../../../packages/engine/src/solitaire/engine.ts';
import { dailyBoard, dailySeed, fmtTime, todayKey } from './daily.ts';

export interface SolitaireSetup { mode: 'classic' | 'daily'; draw: 1 | 3 }

interface Placed { card: Card; faceUp: boolean; x: number; y: number; z: number; from: Pile | null }
interface Drag { from: Pile; ids: string[]; sx: number; sy: number; dx: number; dy: number; moved: boolean; pointer: number }

const GAP = 0.12; // gap between piles, as a share of card width

export function SolitaireTable({ setup, onExit, onAgain }: { setup: SolitaireSetup; onExit: () => void; onAgain: () => void }) {
  const { settings, wallet, profile } = useStore();
  const theme = tableTheme(wallet);
  const reduced = prefersReducedMotion(settings);
  const extras = useMyExtras();
  const first = useMemo(() => deal({ draw: setup.draw }, setup.mode === 'daily' ? seededRng(dailySeed()) : cryptoRng()), []);
  const [hist, setHist] = useState<SolitaireState[]>([first]);
  const s = hist[hist.length - 1];
  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);
  const [won, setWon] = useState(false);
  const [sheet, setSheet] = useState<null | 'leave' | 'won' | 'rules'>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hl, setHl] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [reward, setReward] = useState<string[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 560 });
  const finishing = useRef(false);

  // Size cards to the space we have: seven columns across, and enough height for a long column.
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const cw = Math.max(36, Math.min(140, (box.w / (7 + 6 * GAP)), box.h / 5.2));
  const ch = cw * 1.4;
  const gap = cw * GAP;
  const boardW = cw * 7 + gap * 6;
  const left = Math.max(0, (box.w - boardW) / 2);
  const colX = (i: number) => left + i * (cw + gap);
  const tabY = ch + gap * 2.2;

  // Timer
  useEffect(() => {
    if (!started || won) return undefined;
    const t = setInterval(() => setElapsed((e: number) => e + 1), 1000);
    return () => clearInterval(t);
  }, [started, won]);

  const say = (text: string) => { setMsg(text); setTimeout(() => setMsg((m: string | null) => (m === text ? null : m)), 2200); };

  const doAction = (a: SolAction) => {
    try {
      const next = apply(s, a);
      setHist((h: SolitaireState[]) => [...h, next].slice(-400));
      if (!started) setStarted(true);
      setHl([]);
      if (a.type === 'draw') sfx.deal(1); else sfx.card();
      return true;
    } catch (e) {
      say(e instanceof Error ? e.message : "Can't do that.");
      return false;
    }
  };

  // Win: record stats and rewards once.
  useEffect(() => {
    if (!isWon(s) || won) return;
    setWon(true);
    sfx.win();
    const st = store.get().solitaire;
    const t = elapsed;
    const next = {
      ...st,
      played: st.played + 1,
      won: st.won + 1,
      bestTime: st.bestTime === null ? t : Math.min(st.bestTime, t),
      bestMoves: st.bestMoves === null ? s.moves : Math.min(st.bestMoves, s.moves),
      bestScore: Math.max(st.bestScore, s.score),
      streak: st.streak + 1,
      bestStreak: Math.max(st.bestStreak, st.streak + 1),
    };
    const lines: string[] = [];
    let coins = 20;
    let xp = 25;
    if (setup.mode === 'daily') {
      const d = st.daily && st.daily.date === todayKey() ? st.daily : { date: todayKey(), won: false, time: null, moves: null, tries: 0 };
      if (!d.won) { coins += 40; xp += 30; lines.push('Daily Deal solved: +40 coins'); }
      next.daily = { ...d, won: true, time: d.time === null ? t : Math.min(d.time, t), moves: d.moves === null ? s.moves : Math.min(d.moves, s.moves) };
    }
    store.setSolitaire(next);
    const before = levelInfo(store.get().wallet.xp).level;
    const { wallet: w, levelUp, coins: paid, xp: xpPaid } = applyReward(store.get().wallet, { coins, xp, lines }, setup.mode === 'daily' ? 'Solitaire: Daily Deal solved' : 'Solitaire: solved', false);
    store.setWallet(grantUnlocks(recordSolo(w, 'solitaire', true), store.get().club).wallet);
    awardFeats(['patience', ...(t < 180 ? ['speedster' as const] : []), ...(setup.mode === 'daily' ? ['dailyDeal' as const] : [])]);
    setReward([`+${paid} coins · +${xpPaid} XP`, ...lines, ...(levelUp && levelUp > before ? [`Level up! You're level ${levelUp}.`] : [])]);
    setTimeout(() => setCelebrate(true), reduced ? 100 : 500);
    setTimeout(() => setSheet('won'), reduced ? 500 : 2600);
  }, [s]);

  // Count a started game as played if you leave without winning; a loss breaks the streak.
  const recordLoss = () => {
    if (won || !started) return;
    const st = store.get().solitaire;
    const next = { ...st, played: st.played + 1, streak: 0 };
    if (setup.mode === 'daily') {
      const d = st.daily && st.daily.date === todayKey() ? st.daily : { date: todayKey(), won: false, time: null, moves: null, tries: 0 };
      next.daily = { ...d, tries: d.tries + 1 };
    }
    store.setSolitaire(next);
    store.setWallet(recordSolo(store.get().wallet, 'solitaire', false));
  };

  // Auto-finish once everything is face up.
  useEffect(() => {
    if (!canAutoFinish(s) || finishing.current) return undefined;
    const t = setTimeout(() => {
      const m = autoStep(s);
      if (m) doAction({ type: 'move', ...m });
    }, reduced ? 30 : 110);
    return () => clearTimeout(t);
  }, [s]);

  const undo = () => {
    if (hist.length <= 1 || won) return;
    setHist((h: SolitaireState[]) => h.slice(0, -1));
    setHl([]);
  };
  const showHint = () => {
    const h = hint(s);
    if (!h) { say('No moves left. Undo, or start a new deal.'); return; }
    if (h === 'draw') { setHl(['stock']); say(s.stock.length ? 'Turn a card from the stock.' : 'Turn the waste back over.'); return; }
    setHl(movingCards(s, h.from).map((c) => c.id));
  };

  // ------------------------------------------------------------------ layout
  const placed: Placed[] = [];
  const stockTop = s.stock.length;
  // waste: show up to three fanned when drawing three
  const wasteShow = s.config.draw === 3 ? s.waste.slice(-3) : s.waste.slice(-2);
  wasteShow.forEach((c, i) => {
    const isTop = i === wasteShow.length - 1;
    const fan = s.config.draw === 3 ? i * cw * 0.28 : 0;
    placed.push({ card: c, faceUp: true, x: colX(1) + fan, y: 0, z: 10 + i, from: isTop ? { kind: 'waste' } : null });
  });
  s.foundations.forEach((f, i) => {
    f.slice(-2).forEach((c, j, arr) => placed.push({ card: c, faceUp: true, x: colX(3 + i), y: 0, z: 10 + j, from: j === arr.length - 1 ? { kind: 'foundation', index: i } : null }));
  });
  const availH = box.h - tabY - 6;
  s.tableau.forEach((col, i) => {
    const down = Math.min(col.up, col.cards.length);
    const upN = col.cards.length - down;
    let dOff = ch * 0.15;
    let uOff = ch * 0.33;
    const need = down * dOff + Math.max(0, upN - 1) * uOff + ch;
    if (need > availH && col.cards.length > 1) {
      const k = Math.max(0.25, (availH - ch) / (need - ch));
      dOff *= k; uOff *= k;
    }
    let y = tabY;
    col.cards.forEach((c, j) => {
      const faceUp = j >= col.up;
      placed.push({ card: c, faceUp, x: colX(i), y, z: 20 + j, from: faceUp ? { kind: 'tableau', index: i, card: j } : null });
      y += faceUp ? uOff : dOff;
    });
  });

  // ------------------------------------------------------------- interaction
  const targetAt = (px: number, py: number): Pile | null => {
    const r = boardRef.current!.getBoundingClientRect();
    const x = px - r.left;
    const y = py - r.top;
    const col = Math.floor((x - left + gap / 2) / (cw + gap));
    if (col < 0 || col > 6) return null;
    if (y < ch + gap) return col >= 3 ? { kind: 'foundation', index: col - 3 } : null;
    return { kind: 'tableau', index: col };
  };

  const onDown = (e: PointerEvent, from: Pile | null) => {
    if (!from || won) return;
    const ids = movingCards(s, from).map((c) => c.id);
    if (!ids.length) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ from, ids, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, pointer: e.pointerId });
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.hypot(dx, dy) > 7 });
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    setDrag(null);
    if (d.moved) {
      const to = targetAt(e.clientX, e.clientY);
      if (to && canMove(s, d.from, to)) doAction({ type: 'move', from: d.from, to });
      return;
    }
    // A tap: send the card (or run) to the best place for it.
    const to = bestTarget(s, d.from);
    if (to) doAction({ type: 'move', from: d.from, to });
    else { setHl(d.ids.slice(0, 1)); say("That card can't move yet."); setTimeout(() => setHl([]), 600); }
  };

  const daily = setup.mode === 'daily';
  const board = daily ? dailyBoard(profile?.name ?? 'You', store.get().solitaire.daily) : [];

  return (
    <div className={`table-screen sol-screen ${theme.className} ${reduced ? 'reduce-motion' : ''}`} style={{ ...theme.style, '--scw': `${cw}px` }}>
      <header className="table-bar">
        <button className="icon-btn" onClick={() => (started && !won ? setSheet('leave') : onExit())} aria-label="Leave">‹</button>
        <div className="table-title">
          <span className="display">{daily ? 'Daily Deal' : 'Solitaire'}</span>
          <small>Draw {s.config.draw} · {fmtTime(elapsed)} · {s.moves} moves · {s.score} pts</small>
        </div>
        <div className="table-tools">
          <button className="icon-btn" onClick={undo} disabled={hist.length <= 1 || won} aria-label="Undo">↶</button>
          <button className="icon-btn" onClick={showHint} disabled={won} aria-label="Hint">✦</button>
          <button className="icon-btn" onClick={() => setSheet('rules')} aria-label="How to play">?</button>
          <button className="icon-btn" onClick={() => store.setSettings({ sound: !settings.sound })} aria-label={settings.sound ? 'Mute sound' : 'Turn sound on'} aria-pressed={settings.sound}>{settings.sound ? '♪' : '–'}</button>
        </div>
      </header>

      <section className="sol-stage" aria-label="Solitaire table">
        <div className="sol-felt">
          <div className="sol-board" ref={boardRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
            {/* empty slots */}
            <button className={`sol-slot sol-stock ${hl.includes('stock') ? 'is-hint' : ''}`} style={{ left: colX(0), top: 0, width: cw, height: ch }}
              onClick={() => doAction({ type: 'draw' })} aria-label={s.stock.length ? `Stock, ${s.stock.length} cards. Tap to turn ${s.config.draw}.` : 'Turn the waste back over'}>
              {stockTop > 0 ? <CardBack size={`${cw}px`} /> : <span className="sol-recycle" aria-hidden="true">↻</span>}
              {stockTop > 1 && <span className="sol-count">{stockTop}</span>}
            </button>
            {[0, 1, 2, 3].map((i) => <span key={`f${i}`} className="sol-slot sol-found" style={{ left: colX(3 + i), top: 0, width: cw, height: ch }} aria-hidden="true">A</span>)}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={`t${i}`} className="sol-slot sol-col" style={{ left: colX(i), top: tabY, width: cw, height: ch }} aria-hidden="true">{s.tableau[i].cards.length === 0 ? 'K' : ''}</span>)}

            {placed.map((p) => {
              const dragging = drag && drag.moved && drag.ids.includes(p.card.id);
              return (
                <div
                  key={p.card.id}
                  className={`sol-card ${p.from ? 'is-live' : ''} ${dragging ? 'is-drag' : ''} ${hl.includes(p.card.id) ? 'is-hint' : ''}`}
                  style={{ left: p.x, top: p.y, zIndex: dragging ? 500 + p.z : p.z, transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined }}
                  onPointerDown={(e: PointerEvent) => onDown(e, p.from)}
                  role={p.from ? 'button' : undefined}
                  aria-label={p.faceUp ? `${p.card.id}` : 'Face-down card'}
                >
                  {p.faceUp ? <CardFace card={p.card} size={`${cw}px`} /> : <CardBack size={`${cw}px`} />}
                </div>
              );
            })}
          </div>
          {msg && <div className="toasts sol-toast" aria-live="polite"><div className="toast">{msg}</div></div>}
        </div>
      </section>

      <aside className="table-side sol-side" aria-label="Solitaire stats">
        <SolStats />
        {daily && <DailyBoard rows={board} />}
      </aside>

      {celebrate && profile && (
        <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={profile.avatar} extras={extras}
          headline="Solved!" sub={`${fmtTime(elapsed)} · ${s.moves} moves`} onDone={() => setCelebrate(false)} />
      )}

      <Sheet open={sheet === 'won'} title={daily ? 'Daily Deal solved' : 'Solved!'} wide dismissable={false}>
        <div className="winner">
          <p className="eyebrow">{daily ? `Daily Deal · ${todayKey()}` : `Draw ${s.config.draw}`}</p>
          <h2 className="display h-lg">{fmtTime(elapsed)}</h2>
          <p className="muted">{s.moves} moves · {s.score} points</p>
        </div>
        {reward.length > 0 && <div className="outcome outcome-good">{reward.map((l, i) => <p key={i} className="outcome-line">{l}</p>)}</div>}
        {daily && <DailyBoard rows={dailyBoard(profile?.name ?? 'You', store.get().solitaire.daily)} />}
        <div className="btn-row sticky-actions">
          {!daily && <Button size="lg" onClick={onAgain}>New deal</Button>}
          <Button variant={daily ? 'brass' : 'ghost'} onClick={onExit}>Back to the lobby</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'leave'} onClose={() => setSheet(null)} title="Leave this deal?">
        <p className="muted">It'll count as a game played{daily ? ' (you can try the Daily Deal again)' : ''}, and your win streak resets.</p>
        <div className="btn-row">
          <Button variant="danger" onClick={() => { recordLoss(); onExit(); }}>Leave</Button>
          {!daily && <Button variant="ghost" onClick={() => { recordLoss(); onAgain(); }}>New deal</Button>}
          <Button variant="ghost" onClick={() => setSheet(null)}>Keep playing</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title="How to play">
        <div className="rules-text">
          <p>Move every card up to the four foundations, Ace to King in each suit.</p>
          <ul>
            <li>In the seven columns, build down in alternating colours (a red 7 on a black 8). You can move a whole run at once.</li>
            <li>Only a King (or a run starting with one) can go into an empty column.</li>
            <li>Tap the stock to turn {s.config.draw === 1 ? 'one card' : 'three cards'}. When it runs out, tap again to turn the pile back over.</li>
            <li><b>Tap</b> a card to send it to the best place, or <b>drag</b> it where you want. ↶ undoes, ✦ gives a hint.</li>
            <li>When every card is face up, the rest finishes itself.</li>
          </ul>
        </div>
      </Sheet>
    </div>
  );
}

export function SolStats() {
  const { solitaire: st } = useStore();
  return (
    <section className="ts-block sol-stats">
      <h2 className="ts-h">Your solitaire</h2>
      <dl className="statgrid">
        <div><dt>Won</dt><dd>{st.won}<small>/{st.played}</small></dd></div>
        <div><dt>Win rate</dt><dd>{st.played ? `${Math.round((st.won / st.played) * 100)}%` : '—'}</dd></div>
        <div><dt>Best time</dt><dd>{st.bestTime === null ? '—' : fmtTime(st.bestTime)}</dd></div>
        <div><dt>Streak</dt><dd>{st.streak}<small> best {st.bestStreak}</small></dd></div>
      </dl>
    </section>
  );
}

export function DailyBoard({ rows }: { rows: ReturnType<typeof dailyBoard> }) {
  return (
    <section className="ts-block daily-board">
      <h2 className="ts-h">Today's Daily Deal</h2>
      <ol className="ts-rows">
        {rows.map((r, i) => (
          <li key={r.id} className={`ts-row ${r.me ? 'is-me' : ''} ${r.time === null ? 'is-out' : ''}`}>
            <Avatar config={r.look} size={32} />
            <span className="ts-name"><b>{r.time === null ? '' : `${i + 1}. `}{r.name}</b><small>{r.time === null ? (r.me ? 'Not solved yet' : 'Gave up') : `${r.moves} moves`}</small></span>
            <span className="ts-val">{r.time === null ? '—' : fmtTime(r.time)}</span>
          </li>
        ))}
      </ol>
      <p className="fine"><Tag>Club</Tag> Same shuffle for everyone today.</p>
    </section>
  );
}
