import React, { useEffect, useMemo, useRef, useState } from 'react';
import { awardFeats, heartsFeats } from '../../lib/feats.ts';
import type { FinishReport } from '../../app/App.tsx';
import type { MatchKind, Outcome } from '../../lib/club.ts';
import { aiPersonality, rosterById } from '../../lib/roster.ts';
import { prefersReducedMotion, store, useStore } from '../../lib/store.ts';
import { tableTheme } from '../../lib/tableTheme.ts';
import { getItem } from '../../lib/catalogue.ts';
import { sfx } from '../../lib/audio.ts';
import { Avatar, type AvatarConfig } from '../../design/Avatar.tsx';
import { CardFace } from '../../design/PlayingCard.tsx';
import { Button, Sheet } from '../../design/ui.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';
import { useMyExtras } from '../wardrobe/bits.tsx';
import { aiReaction, EmoteBubble, useEmotes } from '../tables/Emotes.tsx';
import {
  LeaveSheet, MatchOverSheet, SPEED, SeatAvatar, TableBar, TableSide, Toasts, eventTitle, firstName, useLatest, useToasts,
} from '../tables/shared.tsx';
import { SeatProp, seatProps } from '../tables/shared.tsx';
import { LocalSession } from '../../../../../packages/engine/src/core/session.ts';
import type { SeatInfo } from '../../../../../packages/engine/src/core/game.ts';
import { cardLabel, SUIT_NAMES, SUIT_SYMBOLS, type Card } from '../../../../../packages/engine/src/core/cards.ts';
import { HeartsModule, cardPoints, isQueenOfSpades, openTrick, passTarget, sortHand } from '../../../../../packages/engine/src/hearts/engine.ts';
import { heartsAI, heartsThinkMs } from '../../../../../packages/engine/src/hearts/ai.ts';
import type { HeartsAction, HeartsConfig, HeartsEvent, HeartsView, PassDir, Trick } from '../../../../../packages/engine/src/hearts/types.ts';

export interface HeartsMatchSetup {
  config: Partial<HeartsConfig>;
  opponents: string[];
  kind: MatchKind;
  /** Title matches: the player whose result against yours decides the title. */
  rival?: string;
}

type Session = LocalSession<unknown, unknown, HeartsAction, HeartsView, HeartsEvent>;

// Seats sit clockwise: you (bottom), left, across (top), right.
const SEAT_POS = [{ x: 50, y: 100 }, { x: 7, y: 50 }, { x: 50, y: 12 }, { x: 93, y: 50 }];
const DIR_WORD: Record<PassDir, string> = { left: 'left', right: 'right', across: 'across', none: '' };
const ORD = ['1st', '2nd', '3rd', '4th'];

export function heartsPlacements(v: HeartsView) {
  if (v.placements) return v.placements.map((s) => v.players[s]);
  return v.players.slice().sort((a, b) => a.score - b.score || a.seat - b.seat);
}

function HeartsRules({ config }: { config: HeartsConfig }) {
  return (
    <div className="rules-text">
      <p>Avoid points. Lowest score wins when someone reaches <b>{config.endAt}</b>.</p>
      <ul>
        <li>Each heart is 1 point. The Queen of Spades is 13.{config.jackOfDiamonds ? ' The Jack of Diamonds takes 10 off.' : ''}</li>
        {config.passing && <li>Before each hand, pass three cards: left, then right, then across, then keep your cards.</li>}
        <li>Whoever has the 2♣ leads it. Follow suit if you can; the highest card of the suit led takes the trick.</li>
        {config.noPointsFirstTrick && <li>No hearts or Queen of Spades on the first trick, unless that's all you have.</li>}
        <li>You can't lead hearts until a heart{config.queenBreaksHearts ? ' (or the Queen)' : ''} has been played, unless you only have hearts.</li>
        <li>Take every heart and the Queen to <b>shoot the moon</b>: {config.moon === 'addToOthers' ? 'everyone else gets 26' : 'you take 26 off your score'}.</li>
      </ul>
    </div>
  );
}

function ScoreTable({ view, avatars }: { view: HeartsView; avatars: AvatarConfig[] }) {
  const order = view.players.slice().sort((a, b) => a.score - b.score);
  return (
    <div className="standings">
      <table>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col" className="num">Score</th>
            {view.history.map((h) => <th key={h.hand} scope="col" className="num">H{h.hand}</th>)}
          </tr>
        </thead>
        <tbody>
          {order.map((p) => (
            <tr key={p.seat}>
              <td><span className="st-player"><Avatar config={avatars[p.seat]} size={26} />{p.seat === 0 ? 'You' : p.name}</span></td>
              <td className="num"><b>{p.score}</b></td>
              {view.history.map((h) => {
                const l = h.lines[p.seat];
                return <td key={h.hand} className="num">{h.moon === p.seat ? '🌙' : l.scored}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HandSummary({ view, avatars }: { view: HeartsView; avatars: AvatarConfig[] }) {
  const h = view.history[view.history.length - 1];
  if (!h) return null;
  const limit = view.config.endAt;
  const lines = h.lines.slice().sort((a, b) => a.scored - b.scored);
  const nm = (s: number) => (s === 0 ? 'You' : view.players[s].name.split(' ')[0]);
  return (
    <div className="round-summary">
      <p className="lede">
        {h.moon !== null ? <>🌙 {nm(h.moon)} shot the moon!</> : lines[0].taken === 0 ? <>{lines.filter((l) => l.taken === 0).map((l) => nm(l.seat)).join(' and ')} kept a clean sheet.</> : 'Hand over.'}
      </p>
      <ul className="score-lines">
        {lines.map((l, i) => {
          const pct = Math.min(100, (l.after / limit) * 100);
          return (
            <li key={l.seat} className={`score-line ${h.moon === l.seat ? 'is-out-first' : ''}`} style={{ '--i': i }}>
              <Avatar config={avatars[l.seat]} size={40} />
              <div className="sl-main">
                <div className="sl-top">
                  <b>{nm(l.seat)}</b>
                  <span className="sl-calc">{h.moon === l.seat ? 'Shot the moon' : <><b>+{l.scored}</b> pts</>}</span>
                </div>
                <div className="sl-total">
                  <span className={`meter ${pct >= 75 ? 'is-danger' : pct >= 50 ? 'is-warn' : ''}`}><span style={{ width: `${pct}%` }} /></span>
                  <span className="sl-nums">{l.before} → <b>{l.after}</b></span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HeartsTable({ setup, onExit, onRematch, onFinished }: {
  setup: HeartsMatchSetup; onExit: (forfeit: boolean) => void; onRematch: () => void; onFinished: (r: FinishReport) => Outcome;
}) {
  const isEvent = setup.kind !== 'casual';
  const { profile, settings, wallet } = useStore();
  const theme = tableTheme(wallet);
  const reduced = prefersReducedMotion(settings);
  const myExtras = useMyExtras();
  const { active: emotes, emote } = useEmotes();
  const { toasts, toast, note, log } = useToasts();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const recorded = useRef(false);

  const seatInfo: SeatInfo[] = useMemo(() => [
    { playerId: 'me', name: profile?.name ?? 'You', isAI: false },
    ...setup.opponents.map((id) => {
      const c = rosterById(id)!;
      return { playerId: c.id, name: c.name, isAI: true, personality: aiPersonality(c, 'hearts') };
    }),
  ], []);
  const avatars: AvatarConfig[] = useMemo(() => [profile!.avatar, ...setup.opponents.map((id) => rosterById(id)!.avatar)], []);
  const props = useMemo(() => seatProps(setup.opponents), []);

  const session: Session = useMemo(() => new LocalSession(HeartsModule as never, {
    config: setup.config,
    seats: seatInfo,
    humanSeat: 0,
    ai: heartsAI as never,
    thinkDelay: (s: SeatInfo) => heartsThinkMs(s.personality, { int: (n: number) => Math.floor(Math.random() * n), float: Math.random }) * (SPEED[store.get().settings.aiSpeed] ?? 1),
  }) as Session, []);

  const [view, setView] = useState<HeartsView>(() => session.getView());
  const viewRef = useLatest(view);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'rules' | 'scores' | 'leave' | 'hand' | 'final'>(null);
  const [heldTrick, setHeldTrick] = useState<Trick | null>(null);
  const [moonFlash, setMoonFlash] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameOf = (seat: number) => (seat === 0 ? 'You' : firstName(viewRef.current.players[seat]?.name ?? ''));

  useEffect(() => {
    const unsub = session.subscribe(({ view: v, events }) => {
      setView(v);
      awardFeats(heartsFeats(events, v.myHand));
      for (const e of events) {
        switch (e.type) {
          case 'played': sfx.card(); break;
          case 'heartsBroken': toast('Hearts are broken', 'hot'); break;
          case 'trickWon': {
            const t = v.tricks[v.tricks.length - 1];
            if (t && t.winner === e.seat) {
              setHeldTrick(t);
              if (holdTimer.current) clearTimeout(holdTimer.current);
              holdTimer.current = setTimeout(() => setHeldTrick(null), reduced ? 500 : 1300);
            }
            if (e.queen) {
              sfx.penalty();
              toast(e.seat === 0 ? 'You take the Queen of Spades. Ouch: 13.' : `${nameOf(e.seat)} takes the Queen of Spades!`, 'hot');
              if (e.seat !== 0) { const r = aiReaction('ko', v.players[e.seat].personality, Math.random()); if (r) setTimeout(() => emote(e.seat, r), 700); }
            } else if (e.points > 0) toast(`${e.seat === 0 ? 'You take' : `${nameOf(e.seat)} takes`} ${e.points} point${e.points === 1 ? '' : 's'}`, 'info');
            break;
          }
          case 'passed': {
            sfx.deal(3);
            const got = v.received.map((c) => cardLabel(c)).join(' ');
            toast(`You received ${got}`, 'good');
            break;
          }
          case 'moon':
            sfx.win();
            setMoonFlash(e.seat === 0 ? 'You' : nameOf(e.seat));
            setTimeout(() => setMoonFlash(null), 2200);
            break;
          case 'roundOver': {
            note(`Hand ${e.result.hand}: ${e.result.lines.map((l) => `${l.seat === 0 ? 'You' : nameOf(l.seat)} +${l.scored}`).join(', ')}`, 'good');
            const best = e.result.lines.slice().sort((a, b) => a.scored - b.scored)[0];
            if (best.seat !== 0) { const r = aiReaction('won', v.players[best.seat].personality, Math.random()); if (r) setTimeout(() => emote(best.seat, r), 900); }
            break;
          }
          case 'matchOver':
            if (e.placements[0] === 0) sfx.win();
            break;
          case 'turn':
            if (e.seat === 0 && v.phase === 'play') sfx.turn();
            break;
          default: break;
        }
      }
    });
    return () => { unsub(); session.dispose(); };
  }, [session]);

  useEffect(() => {
    if (view.phase === 'roundOver' || view.phase === 'matchOver') {
      const t = setTimeout(() => setSheet('hand'), reduced ? 400 : 1600);
      return () => clearTimeout(t);
    }
    if (sheet === 'hand' || sheet === 'final') setSheet(null);
    return undefined;
  }, [view.phase, view.hand]);

  useEffect(() => {
    if (view.phase !== 'matchOver' || recorded.current) return;
    recorded.current = true;
    const order = heartsPlacements(view);
    const place = order.findIndex((p) => p.seat === 0) + 1;
    store.recordHearts({ won: place === 1, place, moons: view.players[0].moons });
    const o = onFinished({ ordered: order.map((p) => p.playerId), remaining: [] });
    setOutcome(o);
    if (o.won) setTimeout(() => setCelebrate(true), reduced ? 200 : 900);
  }, [view.phase]);

  useEffect(() => { setSelected([]); setError(null); }, [view.phase, view.hand, view.current]);

  const act = async (a: HeartsAction) => {
    setError(null);
    try { await session.act(a); } catch (e) { setError(e instanceof Error ? e.message : 'That move was not allowed.'); }
  };

  const me = view.players[0];
  const hand = sortHand(view.myHand);
  const passing = view.phase === 'pass' && !view.myPass;
  const myTurn = view.phase === 'play' && view.current === 0;
  const open = openTrick(view.tricks);
  const shownTrick = open ?? heldTrick;
  const passTo = view.passDir !== 'none' ? view.players[passTarget(0, view.passDir)] : null;
  const firstTrick = view.tricks.length === 0 || (view.tricks.length === 1 && !!open);

  const explain = (c: Card) => {
    if (open && open.plays.length) {
      const led = open.plays[0].card.suit;
      if (hand.some((x) => x.suit === led)) return `Follow suit: play a ${SUIT_NAMES[led].slice(0, -1).toLowerCase()} ${SUIT_SYMBOLS[led]}.`;
      return 'No hearts or Queen of Spades on the first trick.';
    }
    if (firstTrick) return 'The 2♣ leads the first trick.';
    if (c.suit === 'H') return "Hearts aren't broken yet. Lead another suit.";
    return "You can't play that now.";
  };

  const tapCard = (c: Card) => {
    if (passing) {
      setSelected((s: string[]) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : s.length >= 3 ? [...s.slice(1), c.id] : [...s, c.id]));
      return;
    }
    if (!myTurn) return;
    if (!view.playableIds.includes(c.id)) {
      setShake(c.id);
      setTimeout(() => setShake(null), 400);
      setError(explain(c));
      return;
    }
    if (selected[0] === c.id) { void act({ type: 'play', cardId: c.id }); setSelected([]); }
    else { setSelected([c.id]); setError(null); }
  };

  let status = '';
  if (view.phase === 'matchOver') status = heartsPlacements(view)[0].seat === 0 ? 'You win the match!' : `${nameOf(heartsPlacements(view)[0].seat)} wins the match`;
  else if (view.phase === 'roundOver') status = `Hand ${view.hand} is over`;
  else if (view.phase === 'pass') status = view.myPass ? 'Waiting for the others to pass…' : `Choose 3 cards to pass ${DIR_WORD[view.passDir]} to ${passTo ? firstName(passTo.name) : ''}`;
  else if (myTurn) status = !open ? (firstTrick ? 'Lead the 2♣' : 'Your lead') : 'Your turn';
  else status = `${nameOf(view.current)} is thinking…`;

  const seatPoints = (s: number) => view.players[s].handPoints;
  const limit = view.config.endAt;
  const sel = hand.find((c) => c.id === selected[0]) ?? null;

  return (
    <div className={`table-screen hearts-table ${settings.cardSize === 'large' ? 'cards-lg' : ''} ${theme.className} ${reduced ? 'reduce-motion' : ''}`} style={theme.style}>
      <TableBar
        title={eventTitle(setup.kind, 'Hearts')}
        sub={`Hand ${view.hand} · to ${limit}`}
        onLeave={() => setSheet('leave')} onScores={() => setSheet('scores')} onRules={() => setSheet('rules')}
        players={view.players} onEmote={emote}
      />

      <section className="stage trick-stage" aria-label="Card table">
        <div className="felt">
          <div className="felt-inner trick-inner">
            <Toasts toasts={toasts} />
            <div className="trick" aria-label="Current trick">
              {shownTrick && shownTrick.plays.map((pl) => (
                <div key={pl.card.id} className={`trick-card pos-${pl.seat} ${shownTrick.winner === pl.seat ? 'is-winner' : ''} ${shownTrick.winner !== null && shownTrick === heldTrick ? `collect-${shownTrick.winner}` : ''}`}>
                  <CardFace card={pl.card} />
                </div>
              ))}
              {!shownTrick && view.phase === 'play' && (
                <span className="trick-hint">{view.heartsBroken ? <span className="broken">♥ broken</span> : <span className="muted small">Hearts not broken</span>}</span>
              )}
              {view.phase === 'pass' && (
                <span className="pass-arrow" aria-hidden="true" data-dir={view.passDir}>{view.passDir === 'left' ? '↖' : view.passDir === 'right' ? '↗' : '↑'}</span>
              )}
            </div>
          </div>
        </div>

        {[1, 2, 3].map((s) => {
          const p = view.players[s];
          const pos = SEAT_POS[s];
          const active = view.phase === 'play' && view.current === s;
          const waiting = view.phase === 'pass' && !p.hasPassed;
          const pct = Math.min(100, (p.score / limit) * 100);
          return (
            <div key={s} className={`seat hseat hseat-${s} ${active ? 'is-active' : ''}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              aria-label={`${p.name}, ${p.score} points, ${seatPoints(s)} this hand${active ? ', playing now' : ''}`}>
              <SeatAvatar look={avatars[s]} size={46} thinking={active || waiting} emote={emotes[s]} name={p.name} prop={props[s]} />
              <div className="seat-plate">
                <span className="seat-name">{firstName(p.name)}</span>
                <span className="seat-meta hpts" title="Points taken this hand">{seatPoints(s) > 0 ? <>♥<b>{seatPoints(s)}</b></> : <b className="muted">0</b>}</span>
                <span className={`meter ${pct >= 75 ? 'is-danger' : pct >= 50 ? 'is-warn' : ''}`}><span style={{ width: `${pct}%` }} /></span>
                <span className="seat-pts">{p.score}<small>/{limit}</small></span>
              </div>
              {view.phase === 'pass' && p.hasPassed && <span className="last-badge">Passed</span>}
            </div>
          );
        })}
      </section>

      <section className={`me ${myTurn || passing ? 'is-turn' : ''}`} aria-label="Your seat">
        <div className="me-bar">
          <div className="me-id">
            <Avatar config={avatars[0]} size={40} title={me.name} /><SeatProp id={props[0]} />
            {emotes[0] && <EmoteBubble look={avatars[0]} pose={emotes[0]} />}
            <span>
              <b>{me.name}</b>
              <span className={`meter ${me.score / limit >= 0.75 ? 'is-danger' : me.score / limit >= 0.5 ? 'is-warn' : ''}`}><span style={{ width: `${Math.min(100, (me.score / limit) * 100)}%` }} /></span>
            </span>
          </div>
          <div className="me-scores">
            <span><small>Score</small><b>{me.score}</b></span>
            <span className={me.handPoints > 0 ? 'is-mult' : ''}><small>This hand</small><b>{me.handPoints}</b></span>
          </div>
        </div>

        <p className={`status ${myTurn || passing ? 'is-turn' : ''}`} role="status">{status}</p>
        {error && <p className="move-error" role="alert">{error}</p>}

        <div className="actions">
          {passing && (
            <Button disabled={selected.length !== 3} onClick={() => act({ type: 'pass', cardIds: selected })}>
              {selected.length === 3 ? `Pass ${DIR_WORD[view.passDir]}` : `Pick ${3 - selected.length} more`}
            </Button>
          )}
          {myTurn && sel && <Button onClick={() => { void act({ type: 'play', cardId: sel.id }); setSelected([]); }}>Play {cardLabel(sel)}</Button>}
        </div>

        <div className="hand" style={{ '--n': hand.length }} key={`h${view.hand}`}>
          {hand.map((c, i) => {
            const playable = myTurn && view.playableIds.includes(c.id);
            const isSel = selected.includes(c.id);
            const pts = cardPoints(c, view.config);
            return (
              <button
                key={c.id}
                className={`hand-card ${playable || passing ? 'is-playable' : myTurn ? 'is-dim' : ''} ${isSel ? 'is-selected' : ''} ${shake === c.id ? 'is-shake' : ''} ${view.received.some((r) => r.id === c.id) && view.tricks.length <= 1 ? 'is-drawn' : ''}`}
                style={{ '--i': i }}
                onClick={() => tapCard(c)}
                onDoubleClick={() => playable && act({ type: 'play', cardId: c.id })}
                aria-label={`${cardLabel(c)}${pts ? `, ${pts} points` : ''}${playable ? ', playable' : ''}${isSel ? ', selected' : ''}`}
                aria-pressed={passing ? isSel : undefined}
              >
                <CardFace card={c} />
                {isQueenOfSpades(c) && <span className="danger-dot" aria-hidden="true">13</span>}
              </button>
            );
          })}
          {view.myPass && view.phase === 'pass' && <p className="empty">Passed: {view.myPass.map(cardLabel).join(' ')}</p>}
        </div>
      </section>

      <TableSide title={`Hearts · to ${limit}`} log={log} rows={view.players.slice().sort((a, b) => a.score - b.score).map((p) => ({
        seat: p.seat, name: p.name, look: avatars[p.seat], value: String(p.score), me: p.seat === 0,
        sub: view.phase === 'pass' ? (p.hasPassed ? 'Passed' : 'Choosing cards…') : `${p.handPoints} this hand${p.moons ? ` · ${p.moons} moon${p.moons > 1 ? 's' : ''}` : ''}`,
        active: view.phase === 'play' && view.current === p.seat,
      }))} />

      {moonFlash && (
        <div className="ko-flash moon-flash" aria-live="assertive">
          <span className="ko-word">🌙 Shot the moon</span>
          <span className="ko-name">{moonFlash}</span>
        </div>
      )}
      {celebrate && (
        <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={avatars[0]} extras={myExtras}
          headline={outcome?.headline ?? 'You win!'} sub={outcome?.lines.find((l) => l.startsWith('+'))} onDone={() => setCelebrate(false)} />
      )}

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title="How Hearts works"><HeartsRules config={view.config} /></Sheet>
      <Sheet open={sheet === 'scores'} onClose={() => setSheet(null)} title="Scores" wide><ScoreTable view={view} avatars={avatars} /></Sheet>
      <LeaveSheet open={sheet === 'leave'} onClose={() => setSheet(null)} isEvent={isEvent} finished={!!outcome} onLeave={onExit} />

      <Sheet open={sheet === 'hand'} title={view.phase === 'matchOver' ? 'Final hand' : `Hand ${view.hand} result`} wide dismissable={false}>
        <HandSummary view={view} avatars={avatars} />
        <div className="btn-row sticky-actions">
          {view.phase === 'roundOver' && <Button size="lg" onClick={() => { setSheet(null); void act({ type: 'nextRound' }); }}>Deal hand {view.hand + 1}</Button>}
          {view.phase === 'matchOver' && <Button size="lg" onClick={() => setSheet('final')}>Final standings</Button>}
        </div>
      </Sheet>

      <MatchOverSheet
        open={sheet === 'final'}
        winnerLook={avatars[heartsPlacements(view)[0].seat]}
        eyebrow="Lowest score wins"
        headline={heartsPlacements(view)[0].seat === 0 ? 'You win!' : heartsPlacements(view)[0].name}
        sub={`${view.history.length} hands played`}
        outcome={outcome} isEvent={isEvent} onRematch={onRematch} onExit={() => onExit(false)}
      >
        <div className="standings">
          <table>
            <thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col" className="num">Score</th></tr></thead>
            <tbody>
              {heartsPlacements(view).map((p, i) => (
                <tr key={p.seat}>
                  <td className="place">{ORD[i]}</td>
                  <td><span className="st-player"><Avatar config={avatars[p.seat]} size={26} />{p.seat === 0 ? 'You' : p.name}</span></td>
                  <td className="num">{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MatchOverSheet>
    </div>
  );
}
