import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { awardFeats, take2Feats } from '../../lib/feats.ts';
import type { MatchSetup, FinishReport } from '../../app/App.tsx';
import { aiPersonality } from '../../lib/roster.ts';
import { OutcomeCard } from '../club/bits.tsx';
import { EmoteBubble, EmoteMenu, aiReaction, reactAtTable, useEmotes, type Reaction } from '../tables/Emotes.tsx';
import { TableSide, useToasts } from '../tables/shared.tsx';
import { SeatProp, seatProps, useBigScreen } from '../tables/shared.tsx';
import { SeatFigure } from '../tables/SeatFigure.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';
import { getItem } from '../../lib/catalogue.ts';
import { useMyExtras } from '../wardrobe/bits.tsx';
import type { Outcome } from '../../lib/club.ts';
import { prefersReducedMotion, store, useStore } from '../../lib/store.ts';
import { tableTheme } from '../../lib/tableTheme.ts';
import { rosterById } from '../../lib/roster.ts';
import { sfx } from '../../lib/audio.ts';
import { Avatar, type AvatarConfig } from '../../design/Avatar.tsx';
import { CardBack, CardFace } from '../../design/PlayingCard.tsx';
import { Button, Sheet, Tag } from '../../design/ui.tsx';
import { RulesSummary } from './RulesSummary.tsx';
import { RoundSummary, Standings, placements } from './Results.tsx';
import { LocalSession } from '../../../../../packages/engine/src/core/session.ts';
import type { SeatInfo } from '../../../../../packages/engine/src/core/game.ts';
import { cardLabel, rankLabel, SUIT_NAMES, SUIT_SYMBOLS, SUITS, isRed, type Card, type Suit } from '../../../../../packages/engine/src/core/cards.ts';
import { Take2Module } from '../../../../../packages/engine/src/take2/engine.ts';
import { take2ChooseAction, TAKE2_PERSONALITIES, type Take2PersonalityId } from '../../../../../packages/engine/src/take2/ai.ts';
import type { Take2Action, Take2Event, Take2View } from '../../../../../packages/engine/src/take2/types.ts';

type Session = LocalSession<unknown, unknown, Take2Action, Take2View, Take2Event>;

interface Flier { id: number; from: DOMRect; to: DOMRect; card: Card | null; delay: number }

const SPEED: Record<string, number> = { relaxed: 1.6, normal: 1, fast: 0.45 };
const SEAT_ANGLES: Record<number, number[]> = {
  1: [90], 2: [128, 52], 3: [152, 90, 28], 4: [156, 113, 67, 24], 5: [161, 126, 90, 54, 19],
};
const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
const firstName = (n: string) => n.split(' ')[0];
let uid = 1;

function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rank - b.rank);
}

/* ----------------------------------------------------------- flying cards */
function FlyingCard({ f, done, reduced }: { f: Flier; done: (id: number) => void; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== 'function') { done(f.id); return; }
    const dx = f.to.left + f.to.width / 2 - (f.from.left + f.from.width / 2);
    const dy = f.to.top + f.to.height / 2 - (f.from.top + f.from.height / 2);
    const a = el.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(-8deg) scale(0.9)', opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(4deg) scale(1)`, opacity: 1 },
      ],
      { duration: 420, delay: f.delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
    );
    a.onfinish = () => done(f.id);
    return () => a.cancel();
  }, []);
  return (
    <div ref={ref} className="flier" style={{ left: `${f.from.left + f.from.width / 2}px`, top: `${f.from.top + f.from.height / 2}px` }}>
      {f.card ? <CardFace card={f.card} /> : <CardBack />}
    </div>
  );
}

/* ------------------------------------------------------------ opponent seat */
function Seat({ p, active, angle, avatar, personality, limit, setRef, thinking, emote, prop }: {
  prop?: string;
  emote?: Reaction;
  p: Take2View['players'][number];
  active: boolean;
  angle: number;
  avatar: AvatarConfig;
  personality?: string;
  limit: number;
  setRef: (el: HTMLElement | null) => void;
  thinking: boolean;
}) {
  const rad = (angle * Math.PI) / 180;
  const x = 50 + 43 * Math.cos(rad);
  const y = 55 - 43 * Math.sin(rad);
  const pct = Math.min(100, (p.total / limit) * 100);
  const danger = pct >= 75 ? 'is-danger' : pct >= 50 ? 'is-warn' : '';
  const fan = Math.min(p.cardCount, 6);
  const big = useBigScreen();
  return (
    <div
      ref={setRef}
      className={`seat ${active ? 'is-active' : ''} ${p.eliminated ? 'is-out' : ''} ${y < 24 ? 'is-top' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-label={`${p.name}, ${p.cardCount} cards, ${p.total} points${p.eliminated ? ', knocked out' : ''}${active ? ', playing now' : ''}`}
    >
      <div className={`seat-avatar ${big ? 'is-figure' : ''}`}>
        {big ? <SeatFigure look={avatar} reaction={emote} thinking={thinking} prop={prop} out={p.eliminated} /> : <>
          <Avatar config={avatar} size={46} title={p.name} />
          <SeatProp id={prop} />
          {thinking && <span className="think" aria-hidden="true"><i /><i /><i /></span>}
          {emote && <EmoteBubble look={avatar} pose={emote} />}
        </>}
        {p.eliminated && <span className="ko-stamp">KO</span>}
        {p.calledLastCard && !p.eliminated && <span className="last-badge">Last card</span>}
      </div>
      <div className="seat-plate">
        <span className="seat-name">{firstName(p.name)}</span>
        <span className="seat-meta">
          <span className="mini-fan" aria-hidden="true">
            {Array.from({ length: fan }, (_, i) => <span key={i} style={{ '--i': i }} />)}
          </span>
          <b>{p.cardCount}</b>
        </span>
        <span className={`meter ${danger}`} title={`${p.total} of ${limit}`}>
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="seat-pts">{p.total}<small>/{limit}</small></span>
      </div>
      {personality && <span className="sr-only">{TAKE2_PERSONALITIES[personality as Take2PersonalityId]?.label}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------- table */
export function Take2Table({ setup, onExit, onRematch, onFinished }: {
  setup: MatchSetup; onExit: (forfeit: boolean) => void; onRematch: () => void; onFinished: (r: FinishReport) => Outcome;
}) {
  const isEvent = setup.kind !== 'casual';
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { active: emotes, emote } = useEmotes();
  const [celebrate, setCelebrate] = useState(false);
  const myExtras = useMyExtras();
  const { profile, settings, wallet } = useStore();
  const theme = tableTheme(wallet);
  const reduced = prefersReducedMotion(settings);
  const fastForward = useRef(false);

  const seatInfo: SeatInfo[] = useMemo(() => [
    { playerId: 'me', name: profile?.name ?? 'You', isAI: false },
    ...setup.opponents.map((id) => {
      const c = rosterById(id)!;
      return { playerId: c.id, name: c.name, isAI: true, personality: aiPersonality(c, 'take2') };
    }),
  ], []);
  const avatars: AvatarConfig[] = useMemo(() => [profile!.avatar, ...setup.opponents.map((id) => rosterById(id)!.avatar)], []);
  const props = useMemo(() => seatProps(setup.opponents), []);

  const session: Session = useMemo(() => new LocalSession(Take2Module as never, {
    config: setup.config,
    seats: seatInfo,
    humanSeat: 0,
    ai: take2ChooseAction as never,
    thinkDelay: (s: SeatInfo) => {
      const [lo, hi] = TAKE2_PERSONALITIES[(s.personality as Take2PersonalityId) ?? 'cautious'].thinkMs;
      const mult = fastForward.current ? 0.12 : SPEED[store.get().settings.aiSpeed] ?? 1;
      return (lo + Math.random() * (hi - lo)) * mult;
    },
  }) as Session, []);

  const [view, setView] = useState<Take2View>(() => session.getView());
  const [selected, setSelected] = useState<string | null>(null);
  const [callLast, setCallLast] = useState(false);
  const { toasts, toast, note, log } = useToasts();
  const [fliers, setFliers] = useState<Flier[]>([]);
  const [shake, setShake] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'rules' | 'scores' | 'leave' | 'round' | 'final' | 'skipped'>(null);
  const [koFlash, setKoFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorded = useRef(false);

  const seatEls = useRef<Record<number, HTMLElement | null>>({});
  const handEl = useRef<HTMLDivElement>(null);
  const drawEl = useRef<HTMLDivElement>(null);
  const discardEl = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const nameOf = (seat: number) => (seat === 0 ? 'You' : firstName(viewRef.current.players[seat]?.name ?? ''));


  const rectOf = (seat: number): DOMRect | null => {
    const el = seat === 0 ? handEl.current : seatEls.current[seat];
    return el ? el.getBoundingClientRect() : null;
  };

  const fly = (from: DOMRect | null, to: DOMRect | null, card: Card | null, delay = 0) => {
    if (!from || !to || reduced) return;
    setFliers((fs: Flier[]) => [...fs, { id: uid++, from, to, card, delay }]);
  };

  const handleEvents = (events: Take2Event[], next: Take2View) => {
    awardFeats(take2Feats(events, next.hand));
    for (const e of events) {
      switch (e.type) {
        case 'played':
          sfx.card();
          if (e.seat !== 0) fly(rectOf(e.seat), discardEl.current?.getBoundingClientRect() ?? null, e.card);
          break;
        case 'drew':
          if (e.count > 0) {
            sfx.deal(e.count);
            const from = drawEl.current?.getBoundingClientRect() ?? null;
            for (let i = 0; i < Math.min(e.count, 5); i++) fly(from, rectOf(e.seat), null, i * 90);
          }
          if (e.reason === 'penalty' || e.reason === 'finishing') {
            toast(e.seat === 0 ? `You pick up ${e.count}` : `${nameOf(e.seat)} picks up ${e.count}`, 'hot');
          }
          break;
        case 'penaltyPending':
          sfx.penalty();
          toast(e.stacked ? `Stacked! +${e.amount} for ${nameOf(e.target) === 'You' ? 'you' : nameOf(e.target)}` : `+${e.amount} for ${nameOf(e.target) === 'You' ? 'you' : nameOf(e.target)}`, 'hot');
          break;
        case 'skipped':
          sfx.skip();
          toast(e.seat === 0 ? 'You miss a turn' : `${nameOf(e.seat)} misses a turn`, 'hot');
          break;
        case 'skipPassed':
          toast(`${nameOf(e.from)} passes the skip on`, 'hot');
          break;
        case 'suitChosen':
          sfx.suit();
          if (e.seat !== 0) toast(`${nameOf(e.seat)} calls ${SUIT_NAMES[e.suit]} ${SUIT_SYMBOLS[e.suit]}`, 'info');
          break;
        case 'reversed':
          toast('Direction reversed', 'info');
          break;
        case 'reshuffled':
          sfx.deal(4);
          toast('Discard pile shuffled into the deck', 'info');
          break;
        case 'lastCard':
          sfx.suit();
          toast(e.seat === 0 ? 'You call "Last card!"' : `${nameOf(e.seat)}: "Last card!"`, 'good');
          break;
        case 'missedLastCard':
          sfx.penalty();
          toast(e.seat === 0 ? `You didn't call last card! Pick up ${e.penalty}` : `${nameOf(e.seat)} didn't call last card! Picks up ${e.penalty}`, 'hot');
          break;
        case 'wentOut':
          toast(e.seat === 0 ? "You're out of cards!" : `${nameOf(e.seat)} is out of cards!`, 'good');
          break;
        case 'turnLimit':
          toast('Round taking too long. Lowest hand counts as out.', 'info');
          break;
        case 'roundOver': {
          const w = e.result.wentOut;
          note(`Round ${e.result.round}: ${w === null ? 'no one went out' : `${nameOf(w)} went out`}. ${e.result.lines.filter((l) => l.seat !== w).map((l) => `${nameOf(l.seat)} +${l.score.total}`).join(', ')}`, 'info');
          if (w !== null && w !== 0) { const r = aiReaction('won', viewRef.current.players[w]?.personality, Math.random()); if (r) setTimeout(() => emote(w, r), 900); }
          break;
        }
        case 'eliminated':
          if (e.seat !== 0) { const r = aiReaction('ko', viewRef.current.players[e.seat]?.personality, Math.random()); if (r) setTimeout(() => emote(e.seat, r), 1200); }
          sfx.knockout();
          setKoFlash(e.seat === 0 ? 'You' : nameOf(e.seat));
          setTimeout(() => setKoFlash(null), 1800);
          if (e.seat === 0) fastForward.current = false;
          break;
        case 'matchOver':
          if (e.winner === 0) sfx.win();
          break;
        case 'turn':
          if (e.seat === 0 && next.phase === 'play') sfx.turn();
          break;
        default:
          break;
      }
    }
  };

  useEffect(() => {
    const unsub = session.subscribe(({ view: v, events }) => {
      setView(v);
      handleEvents(events, v);
    });
    return () => { unsub(); session.dispose(); };
  }, [session]);

  // Open the round summary shortly after a round ends so the last card can land.
  useEffect(() => {
    if (view.phase === 'roundOver' || view.phase === 'matchOver') {
      const t = setTimeout(() => setSheet('round'), reduced ? 300 : 1300);
      return () => clearTimeout(t);
    }
    if (sheet === 'round' || sheet === 'final') setSheet(null);
    return undefined;
  }, [view.phase, view.round]);

  // Save practice stats once.
  useEffect(() => {
    if (view.phase !== 'matchOver' || recorded.current) return;
    recorded.current = true;
    const place = placements(view).findIndex((p) => p.seat === 0) + 1;
    store.recordTake2({ won: view.winner === 0, place, roundsWon: view.players[0].roundsWon });
    if (!outcome) {
      const o = onFinished({ ordered: placements(view).map((p) => p.playerId), remaining: [] });
      setOutcome(o);
      if (o.won) setTimeout(() => setCelebrate(true), reduced ? 200 : 900);
    }
  }, [view.phase]);

  /** Knocked out: settle the rest of the table without watching it. */
  const skipToResult = () => {
    if (outcome) { setSheet('skipped'); return; }
    recorded.current = true;
    const order = placements(view);
    const place = order.findIndex((p) => p.seat === 0) + 1;
    store.recordTake2({ won: false, place, roundsWon: view.players[0].roundsWon });
    setOutcome(onFinished({ ordered: order.filter((p) => p.eliminated).map((p) => p.playerId), remaining: order.filter((p) => !p.eliminated).map((p) => p.playerId) }));
    setSheet('skipped');
  };

  useEffect(() => { setSelected(null); setCallLast(false); }, [view.current, view.phase, view.round]);

  const act = async (a: Take2Action) => {
    setError(null);
    try {
      await session.act(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That move was not allowed.');
    }
  };

  const me = view.players[0];
  const myTurn = view.current === 0 && (view.phase === 'play' || view.phase === 'afterDraw' || view.phase === 'chooseSuit');
  const top = view.topCard;
  const can = (t: Take2Action['type']) => view.legal.some((a) => a.type === t);
  const hand = sortHand(view.hand);
  const limit = view.config.eliminationAt;
  const opponents = view.players.slice(1);
  const angles = SEAT_ANGLES[opponents.length] ?? SEAT_ANGLES[5];
  const suitChanged = view.activeSuit !== top.suit;
  const largeCards = settings.cardSize === 'large';

  const tapCard = (c: Card) => {
    if (!myTurn) return;
    if (!view.playableIds.includes(c.id)) {
      setShake(c.id);
      setTimeout(() => setShake(null), 400);
      if (view.pending?.kind === 'draw') setError(view.config.twoStacking ? 'Only a 2 can go on a +2. Otherwise take the cards.' : `Take the ${view.pending.amount} cards.`);
      else if (view.phase === 'afterDraw') setError('After drawing you can only play the card you drew.');
      else if (c.rank === 11 && hand.length === 1 && view.config.noFinishOnJack) setError("You can't finish on a Jack. Draw a card.");
      else setError(`That doesn't fit. You need ${SUIT_SYMBOLS[view.activeSuit]} ${SUIT_NAMES[view.activeSuit]}${view.config.matchRule === 'suitOrRank' && !suitChanged ? ` or a ${rankLabel(top.rank)}` : ''}${view.config.jackWild ? ', or a Jack' : ''}.`);
      return;
    }
    if (selected === c.id) {
      void act({ type: 'play', cardId: c.id, lastCard: callLast });
      setSelected(null);
    } else {
      setSelected(c.id);
      setError(null);
    }
  };

  let status = '';
  if (view.phase === 'matchOver') status = view.winner === 0 ? 'You win the match!' : `${nameOf(view.winner ?? 0)} wins the match`;
  else if (view.phase === 'roundOver') status = `Round ${view.round} is over`;
  else if (view.current === 0) {
    if (view.phase === 'chooseSuit') status = 'Call a suit';
    else if (view.phase === 'afterDraw') status = view.playableIds.length ? 'Your drawn card fits. Play it or pass.' : 'No luck. Pass.';
    else if (view.pending?.kind === 'draw') status = view.playableIds.length ? `+${view.pending.amount} on you. Stack a 2 or take them.` : `+${view.pending.amount} on you. Take them.`;
    else if (view.pending?.kind === 'skip') status = 'Skipped. Play an 8 to pass it on, or sit this one out.';
    else status = view.playableIds.length ? 'Your turn' : 'Nothing fits. Draw a card.';
  } else status = me.eliminated ? `Watching · ${nameOf(view.current)} to play` : `${nameOf(view.current)} is thinking…`;

  const selCard = hand.find((c) => c.id === selected) ?? null;
  const canCall = myTurn && view.config.lastCardCall && hand.length === 2 && view.phase !== 'chooseSuit' && view.playableIds.length > 0;
  const showSuitPicker = view.phase === 'chooseSuit' && view.current === 0;
  const suitCounts = (s: Suit) => hand.filter((c) => c.suit === s).length;

  return (
    <div className={`table-screen ${largeCards ? 'cards-lg' : ''} ${theme.className} ${reduced ? 'reduce-motion' : ''}`} style={theme.style}>
      <header className="table-bar">
        <button className="icon-btn" onClick={() => setSheet('leave')} aria-label="Leave table">‹</button>
        <div className="table-title">
          <span className="display">{setup.kind === 'title' ? 'Title match' : setup.kind === 'cupHeat' ? 'Cup heat' : setup.kind === 'cupFinal' ? 'Cup final' : 'Take 2'}</span>
          <small>{setup.kind !== 'casual' ? 'Take 2 · ' : ''}Round {view.round} · out at {limit}</small>
        </div>
        <div className="table-tools">
          <EmoteMenu onPick={(r) => reactAtTable(r, view.players.filter((p) => !p.eliminated), emote)} />
          <button className="icon-btn" onClick={() => setSheet('scores')} aria-label="Scores">≡</button>
          <button className="icon-btn" onClick={() => setSheet('rules')} aria-label="House rules">?</button>
          <button className="icon-btn" onClick={() => store.setSettings({ sound: !settings.sound })} aria-label={settings.sound ? 'Mute sound' : 'Turn sound on'} aria-pressed={settings.sound}>
            {settings.sound ? '♪' : '–'}
          </button>
        </div>
      </header>

      <section className="stage" aria-label="Card table">
        <div className="felt">
          <div className="felt-inner">
            <div className="toasts" aria-live="polite">
              {toasts.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
            </div>

            <div className="piles">
              <div className="pile draw-pile" ref={drawEl}>
                <div className="stack">
                  {view.drawCount > 2 && <CardBack className="stack-3" />}
                  {view.drawCount > 1 && <CardBack className="stack-2" />}
                  {view.drawCount > 0 ? <CardBack /> : <div className="pc pc-empty" />}
                </div>
                <span className="pile-label">{view.drawCount} left</span>
              </div>

              <div className="center-info">
                <div className={`suit-medal ${isRed(view.activeSuit) ? 'is-red' : ''} ${suitChanged ? 'is-called' : ''}`} key={view.activeSuit + String(suitChanged)}
                  aria-label={`Active suit: ${SUIT_NAMES[view.activeSuit]}`}>
                  <span>{SUIT_SYMBOLS[view.activeSuit]}</span>
                </div>
                <span className="medal-label">{suitChanged ? 'Called' : SUIT_NAMES[view.activeSuit]}</span>
                {view.pending?.kind === 'draw' && <span className="pending-chip" key={`p${view.pending.amount}`}>+{view.pending.amount}</span>}
                {view.pending?.kind === 'skip' && <span className="pending-chip is-skip">Skip</span>}
                {view.config.jackAction === 'reverse' && (
                  <span className="direction" aria-label={view.direction === 1 ? 'Play goes clockwise' : 'Play goes anticlockwise'}>
                    {view.direction === 1 ? '↻' : '↺'}
                  </span>
                )}
              </div>

              <div className="pile discard-pile" ref={discardEl}>
                <div className="stack">
                  {view.recentDiscards.length > 1 && (
                    <CardFace card={view.recentDiscards[view.recentDiscards.length - 2]} className="under" />
                  )}
                  <CardFace card={top} key={top.id + view.discardCount} className="landing" />
                </div>
                <span className="pile-label">Discard</span>
              </div>
            </div>
          </div>
        </div>

        {opponents.map((p, i) => (
          <Seat
            key={p.seat}
            p={p}
            angle={angles[i]}
            active={view.current === p.seat && view.phase !== 'roundOver' && view.phase !== 'matchOver'}
            thinking={view.current === p.seat && view.phase !== 'roundOver' && view.phase !== 'matchOver'}
            avatar={avatars[p.seat]}
            prop={props[p.seat]}
            emote={emotes[p.seat]}
            personality={p.personality}
            limit={limit}
            setRef={(el) => { seatEls.current[p.seat] = el; }}
          />
        ))}
      </section>

      <section className={`me ${myTurn ? 'is-turn' : ''} ${me.eliminated ? 'is-out' : ''}`} aria-label="Your seat">
        <div className="me-bar">
          <div className="me-id">
            <Avatar config={avatars[0]} size={40} title={me.name} /><SeatProp id={props[0]} />
            {emotes[0] && <EmoteBubble look={avatars[0]} pose={emotes[0]} />}
            <span>
              <b>{me.name}</b>
              <span className={`meter ${me.total / limit >= 0.75 ? 'is-danger' : me.total / limit >= 0.5 ? 'is-warn' : ''}`}>
                <span style={{ width: `${Math.min(100, (me.total / limit) * 100)}%` }} />
              </span>
            </span>
          </div>
          <div className="me-scores">
            <span><small>Total</small><b>{me.total}</b></span>
            <span className={view.handScore && view.handScore.twos > 0 ? 'is-mult' : ''}>
              <small>Hand</small>
              <b>{view.handScore?.total ?? 0}</b>
              {view.handScore && view.handScore.twos > 0 && <em>{view.handScore.base}×{view.handScore.multiplier}</em>}
            </span>
          </div>
        </div>

        <p className={`status ${myTurn ? 'is-turn' : ''}`} role="status">{status}</p>
        {error && <p className="move-error" role="alert">{error}</p>}

        <div className="actions">
          {myTurn && selCard && (
            <Button onClick={() => { void act({ type: 'play', cardId: selCard.id, lastCard: callLast }); setSelected(null); }}>
              Play {cardLabel(selCard)}
            </Button>
          )}
          {canCall && (
            <button type="button" className={`last-call ${callLast ? 'is-on' : ''}`} aria-pressed={callLast} onClick={() => setCallLast((v: boolean) => !v)}>
              {callLast ? '✓ Last card!' : 'Call last card'}
            </button>
          )}
          {myTurn && can('draw') && <Button variant={view.playableIds.length ? 'ghost' : 'brass'} onClick={() => act({ type: 'draw' })}>Draw</Button>}
          {myTurn && can('pass') && <Button variant="ghost" onClick={() => act({ type: 'pass' })}>Pass</Button>}
          {myTurn && can('takePenalty') && view.pending?.kind === 'draw' && (
            <Button variant="danger" onClick={() => act({ type: 'takePenalty' })}>Take {view.pending.amount}</Button>
          )}
          {myTurn && can('takeSkip') && <Button variant="ghost" onClick={() => act({ type: 'takeSkip' })}>Miss turn</Button>}
          {me.eliminated && view.phase !== 'matchOver' && (
            <>
              <Button variant="ghost" onClick={() => { fastForward.current = !fastForward.current; toast(fastForward.current ? 'Fast-forwarding' : 'Normal speed'); }}>
                Fast-forward
              </Button>
              <Button onClick={skipToResult}>Skip to result</Button>
            </>
          )}
        </div>

        <div className="hand" ref={handEl} style={{ '--n': hand.length }} key={`r${view.round}`}>
          {me.eliminated && <p className="empty">You're out of this match. Watch it finish or leave the table.</p>}
          {hand.map((c, i) => {
            const playable = myTurn && view.playableIds.includes(c.id);
            return (
              <button
                key={c.id}
                id={`card-${c.id}`}
                className={`hand-card ${playable ? 'is-playable' : myTurn ? 'is-dim' : ''} ${selected === c.id ? 'is-selected' : ''} ${shake === c.id ? 'is-shake' : ''} ${view.drawnCardId === c.id ? 'is-drawn' : ''}`}
                style={{ '--i': i }}
                onClick={() => tapCard(c)}
                onDoubleClick={() => playable && act({ type: 'play', cardId: c.id, lastCard: callLast })}
                aria-label={`${cardLabel(c)}${playable ? ', playable' : ''}${selected === c.id ? ', selected: tap again to play' : ''}`}
              >
                <CardFace card={c} />
              </button>
            );
          })}
        </div>
      </section>

      <TableSide title={`Take 2 · out at ${limit}`} log={log} rows={view.players.slice().sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || a.total - b.total).map((p) => ({
        seat: p.seat, name: p.name, look: avatars[p.seat], me: p.seat === 0, out: p.eliminated,
        value: `${p.total}`, sub: p.eliminated ? 'Knocked out' : `${p.cardCount} card${p.cardCount === 1 ? '' : 's'}${p.roundsWon ? ` · ${p.roundsWon} round${p.roundsWon === 1 ? '' : 's'} won` : ''}`,
        active: view.current === p.seat && view.phase !== 'roundOver' && view.phase !== 'matchOver',
      }))} />

      {fliers.map((f) => (
        <FlyingCard key={f.id} f={f} reduced={reduced} done={(id) => setFliers((fs: Flier[]) => fs.filter((x) => x.id !== id))} />
      ))}

      {celebrate && (
        <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={avatars[0]} extras={myExtras}
          headline={outcome?.headline ?? 'You win!'} sub={outcome?.lines.find((l) => l.startsWith('+'))} onDone={() => setCelebrate(false)} />
      )}
      {koFlash && (
        <div className="ko-flash" aria-live="assertive">
          <span className="ko-word">Knocked out</span>
          <span className="ko-name">{koFlash}</span>
        </div>
      )}

      <Sheet open={showSuitPicker} title="Call a suit" dismissable={false}>
        <div className="suit-pick">
          {SUITS.map((s) => (
            <button key={s} id={`suit-${s}`} className={`suit-btn ${isRed(s) ? 'is-red' : ''}`} onClick={() => act({ type: 'chooseSuit', suit: s })}>
              <span className="suit-sym">{SUIT_SYMBOLS[s]}</span>
              <span>{SUIT_NAMES[s]}</span>
              <small>{suitCounts(s)} in hand</small>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title="House rules at this table">
        <RulesSummary config={view.config} />
      </Sheet>

      <Sheet open={sheet === 'scores'} onClose={() => setSheet(null)} title="Scores" wide>
        <Standings view={view} avatars={avatars} />
      </Sheet>

      <Sheet open={sheet === 'leave'} onClose={() => setSheet(null)} title="Leave the table?">
        <p className="muted">{isEvent && !outcome ? 'This is a club event: leaving now counts as finishing last.' : "This practice match will be abandoned and won't count in your stats."}</p>
        <div className="btn-row">
          <Button variant="danger" onClick={() => onExit(isEvent && !outcome)}>Leave table</Button>
          <Button variant="ghost" onClick={() => setSheet(null)}>Keep playing</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'round'} title={view.phase === 'matchOver' ? 'Final round' : `Round ${view.round} result`} wide dismissable={false}>
        <RoundSummary view={view} avatars={avatars} />
        <div className="btn-row sticky-actions">
          {view.phase === 'roundOver' && <Button size="lg" onClick={() => { setSheet(null); void act({ type: 'nextRound' }); }}>Deal round {view.round + 1}</Button>}
          {view.phase === 'matchOver' && <Button size="lg" onClick={() => setSheet('final')}>Final standings</Button>}
        </div>
      </Sheet>

      <Sheet open={sheet === 'final'} title="Match over" wide dismissable={false}>
        <div className="winner">
          <div className="spotlight">
            <Avatar config={avatars[view.winner ?? 0]} size={110} />
          </div>
          <p className="eyebrow">Last one standing</p>
          <h2 className="display h-lg">{view.winner === 0 ? 'You win!' : view.players[view.winner ?? 0]?.name}</h2>
          <p className="muted">{view.round} rounds played</p>
        </div>
        {outcome && <OutcomeCard outcome={outcome} />}
        <Standings view={view} avatars={avatars} final />
        <EndButtons isEvent={isEvent} onRematch={onRematch} onExit={() => onExit(false)} />
        <p className="fine"><Tag>Club</Tag> Ratings and records saved on this device.</p>
      </Sheet>

      <Sheet open={sheet === 'skipped'} title="Your result" dismissable={false}>
        {outcome && <OutcomeCard outcome={outcome} />}
        <EndButtons isEvent={isEvent} onRematch={onRematch} onExit={() => onExit(false)} />
      </Sheet>
    </div>
  );
}

export function EndButtons({ isEvent, onRematch, onExit }: { isEvent: boolean; onRematch: () => void; onExit: () => void }) {
  return (
    <div className="btn-row sticky-actions">
      {isEvent ? <Button size="lg" onClick={onExit}>Back to the club</Button> : <Button size="lg" onClick={onRematch}>Rematch</Button>}
      {!isEvent && <Button variant="ghost" onClick={onExit}>Back to lobby</Button>}
    </div>
  );
}
