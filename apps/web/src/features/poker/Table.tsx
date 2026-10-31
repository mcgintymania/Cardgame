import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { awardFeats, pokerTracker } from '../../lib/feats.ts';
import { prefersReducedMotion, store, useStore } from '../../lib/store.ts';
import { tableTheme } from '../../lib/tableTheme.ts';
import { aiPersonality } from '../../lib/roster.ts';
import type { MatchKind, Outcome } from '../../lib/club.ts';
import type { FinishReport } from '../../app/App.tsx';
import { OutcomeCard } from '../club/bits.tsx';
import { EmoteBubble, EmoteMenu, aiReaction, useEmotes, reactAtTable, type Reaction } from '../tables/Emotes.tsx';
import { TableSide, useBigScreen, useToasts } from '../tables/shared.tsx';
import { SeatProp, seatProps } from '../tables/shared.tsx';
import { SeatFigure } from '../tables/SeatFigure.tsx';
import { Dealer, useDealer } from '../../design/Dealer.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';
import { getItem } from '../../lib/catalogue.ts';
import { useMyExtras } from '../wardrobe/bits.tsx';
import { EndButtons } from '../take2/Table.tsx';
import { rosterById } from '../../lib/roster.ts';
import { sfx } from '../../lib/audio.ts';
import { Avatar, type AvatarConfig } from '../../design/Avatar.tsx';
import { CardBack, CardFace } from '../../design/PlayingCard.tsx';
import { Button, Sheet, Tag } from '../../design/ui.tsx';
import { LocalSession } from '../../../../../packages/engine/src/core/session.ts';
import type { SeatInfo } from '../../../../../packages/engine/src/core/game.ts';
import { DrawModule, PokerModule } from '../../../../../packages/engine/src/poker/engine.ts';
import { drawChooseAction } from '../../../../../packages/engine/src/poker/drawAi.ts';
import { pokerChooseAction, POKER_PERSONALITIES, type PokerPersonalityId } from '../../../../../packages/engine/src/poker/ai.ts';
import { describePartial } from '../../../../../packages/engine/src/poker/evaluator.ts';
import type { PokerAction, PokerConfig, PokerEvent, PokerView } from '../../../../../packages/engine/src/poker/types.ts';

export interface PokerMatchSetup {
  config: PokerConfig;
  opponents: string[];
  kind: MatchKind;
}

type Session = LocalSession<unknown, unknown, PokerAction, PokerView, PokerEvent>;
const ACT_WORDS: Record<string, [string, string]> = {
  fold: ['fold', 'folds'], check: ['check', 'checks'], call: ['call', 'calls'], bet: ['bet', 'bets'], raise: ['raise to', 'raises to'],
  smallBlind: ['post the small blind', 'posts the small blind'], bigBlind: ['post the big blind', 'posts the big blind'],
};
interface ChipFly { id: number; from: DOMRect; to: DOMRect; amount: number }

const SPEED: Record<string, number> = { relaxed: 1.6, normal: 1, fast: 0.45 };
/** How long a finished hand stays on screen before the next deal. */
const HAND_PAUSE_MS = 6500;
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const firstName = (n: string) => n.split(' ')[0];
const fmt = (n: number) => n.toLocaleString('en-GB');
let uid = 1;

/** Opponents spread clockwise from your left, over the top, to your right.
 *  Bigger tables also use the lower sides of the felt. */
function seatAngle(i: number, k: number, dealer = false): number {
  if (dealer) {
    // Leave the top of the table for the dealer: seats go up the left side, then down the right.
    if (k === 1) return 140;
    const left = Math.ceil(k / 2);
    const right = k - left;
    if (i < left) return left === 1 ? 160 : 212 - (i * 84) / (left - 1);
    const j = i - left;
    return right === 1 ? 20 : 52 - (j * 84) / (right - 1);
  }
  if (k <= 3) return 210 - ((i + 1) * 240) / (k + 1);
  return 235 - ((i + 1) * 290) / (k + 1);
}

function Chips({ amount, small }: { amount: number; small?: boolean }) {
  const n = Math.min(5, Math.max(1, Math.ceil(Math.log10(amount + 1))));
  return (
    <span className={`chips ${small ? 'chips-sm' : ''}`}>
      <span className="chip-stack" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => <i key={i} style={{ '--i': i }} />)}
      </span>
      <b>{fmt(amount)}</b>
    </span>
  );
}

function ChipFlier({ f, done, reduced }: { f: ChipFly; done: (id: number) => void; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== 'function') { done(f.id); return; }
    const dx = f.to.left + f.to.width / 2 - (f.from.left + f.from.width / 2);
    const dy = f.to.top + f.to.height / 2 - (f.from.top + f.from.height / 2);
    const a = el.animate(
      [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.9)`, opacity: 1 }],
      { duration: 650, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' },
    );
    a.onfinish = () => done(f.id);
    return () => a.cancel();
  }, []);
  return (
    <div ref={ref} className="flier" style={{ left: `${f.from.left + f.from.width / 2}px`, top: `${f.from.top + f.from.height / 2}px` }}>
      <Chips amount={f.amount} />
    </div>
  );
}

function PSeat({ p, view, angle, avatar, setRef, winner, emote, dealer, prop }: {
  prop?: string;
  p: PokerView['players'][number]; view: PokerView; angle: number; avatar: AvatarConfig; setRef: (el: HTMLElement | null) => void; winner: boolean; emote?: Reaction; dealer?: boolean;
}) {
  const shownAs = view.lastHand?.revealed.find((r) => r.seat === p.seat)?.description;
  const rad = (angle * Math.PI) / 180;
  const cy = dealer ? 62 : 53;
  const x = 50 + (dealer ? 44 : 41) * Math.cos(rad);
  const y = cy - (dealer ? 38 : 44) * Math.sin(rad);
  // Bets sit between the player and the middle of the table.
  const bx = 50 + (x - 50) * 0.6;
  const by = cy + (y - cy) * 0.62;
  const active = view.current === p.seat && (view.street === 'preflop' || view.street === 'flop' || view.street === 'turn' || view.street === 'river' || view.street === 'draw');
  const pers = POKER_PERSONALITIES[p.personality as PokerPersonalityId];
  const big = useBigScreen();
  return (
    <>
      <div
        ref={setRef}
        className={`seat pseat ${y < 24 ? 'is-top' : ''} ${active ? 'is-active' : ''} ${p.folded && !p.busted ? 'is-folded' : ''} ${p.busted ? 'is-out' : ''} ${winner ? 'is-winner' : ''}`}
        style={{ left: `${x}%`, top: `${y}%` }}
        aria-label={`${p.name}${pers ? ` (${pers.label})` : ''}, ${p.busted ? `out in ${ORD[(p.place ?? 1) - 1]} place` : `${p.stack} chips`}${p.lastAction ? `, ${p.lastAction}` : ''}`}
      >
        <div className={`seat-avatar ${big ? 'is-figure' : ''}`}>
          {big ? <SeatFigure look={avatar} reaction={emote} thinking={active} prop={prop} chips={p.busted ? null : p.stack} out={p.busted} /> : <>
            <Avatar config={avatar} size={40} title={p.name} />
            <SeatProp id={prop} />
            {active && <span className="think" aria-hidden="true"><i /><i /><i /></span>}
            {emote && <EmoteBubble look={avatar} pose={emote} />}
          </>}
          {view.button === p.seat && !p.busted && <span className="dealer-btn" title="Dealer">D</span>}
          {p.inHand && !p.shown && (
            <span className="seat-hole" aria-hidden="true"><CardBack /><CardBack /></span>
          )}
        </div>
        <div className="seat-plate pplate">
          <span className="seat-name">{firstName(p.name)}</span>
          <span className="seat-stack">{p.busted ? ORD[(p.place ?? 1) - 1] : p.allIn ? 'All in' : fmt(p.stack)}</span>
        </div>
        {p.lastAction && !p.busted && <span className={`act-bubble ${/fold/i.test(p.lastAction) ? 'is-fold' : /raise|bet|all/i.test(p.lastAction) ? 'is-raise' : ''}`}>{p.lastAction}</span>}
        {p.shown && (
          <span className={`shown ${p.shown.length > 2 ? 'shown-5' : ''}`} aria-label={`Shows ${p.shown.map((c) => c.id).join(' ')}`}>
            {p.shown.map((c) => <CardFace key={c.id} card={c} />)}
          </span>
        )}
        {p.shown && shownAs && <span className={`shown-as ${winner ? 'is-win' : ''}`}>{shownAs}</span>}
      </div>
      {p.bet > 0 && (
        <div className="bet-spot" style={{ left: `${bx}%`, top: `${by}%` }}>
          <Chips amount={p.bet} small />
        </div>
      )}
    </>
  );
}

export function PokerTable({ setup, onExit, onRematch, onFinished }: {
  setup: PokerMatchSetup; onExit: (forfeit: boolean) => void; onRematch: () => void; onFinished: (r: FinishReport) => Outcome;
}) {
  const isEvent = setup.kind !== 'casual';
  const draw = setup.config.variant === 'draw';
  const big = useBigScreen();
  const dealer = useDealer();
  const [picked, setPicked] = useState<string[]>([]);
  const { active: emotes, emote } = useEmotes();
  const [celebrate, setCelebrate] = useState(false);
  const myExtras = useMyExtras();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const clubRecorded = useRef(false);
  const { profile, settings, wallet } = useStore();
  const theme = tableTheme(wallet);
  const reduced = prefersReducedMotion(settings);
  const fast = useRef(false);

  const seatInfo: SeatInfo[] = useMemo(() => [
    { playerId: 'me', name: profile?.name ?? 'You', isAI: false },
    ...setup.opponents.map((id) => {
      const c = rosterById(id)!;
      return { playerId: c.id, name: c.name, isAI: true, personality: aiPersonality(c, draw ? 'draw' : 'poker') };
    }),
  ], []);
  const avatars: AvatarConfig[] = useMemo(() => [profile!.avatar, ...setup.opponents.map((id) => rosterById(id)!.avatar)], []);
  const props = useMemo(() => seatProps(setup.opponents), []);

  const session: Session = useMemo(() => new LocalSession((draw ? DrawModule : PokerModule) as never, {
    config: setup.config,
    seats: seatInfo,
    humanSeat: 0,
    ai: (draw ? drawChooseAction : pokerChooseAction) as never,
    thinkDelay: (s: SeatInfo) => {
      const [lo, hi] = POKER_PERSONALITIES[(s.personality as PokerPersonalityId) ?? 'cautious'].thinkMs;
      const mult = fast.current ? 0.1 : SPEED[store.get().settings.aiSpeed] ?? 1;
      return (lo + Math.random() * (hi - lo)) * mult;
    },
  }) as Session, []);

  const [view, setView] = useState<PokerView>(() => session.getView());
  const { toasts, toast, note, log } = useToasts();
  const [chipsFly, setChipsFly] = useState<ChipFly[]>([]);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [sheet, setSheet] = useState<null | 'leave' | 'history' | 'out' | 'final'>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const recorded = useRef(false);
  const pokerFeats = useMemo(() => pokerTracker(), []);
  const seatEls = useRef<Record<number, HTMLElement | null>>({});
  const potEl = useRef<HTMLDivElement>(null);
  const meEl = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const nameOf = (seat: number) => (seat === 0 ? 'You' : firstName(viewRef.current.players[seat]?.name ?? ''));


  const handle = (events: PokerEvent[]) => {
    awardFeats(pokerFeats(events));
    for (const e of events) {
      switch (e.type) {
        case 'handStarted': sfx.deal(4); dealer.gesture('deal', 1100); note(`Hand ${e.hand} · blinds ${e.smallBlind}/${e.bigBlind}`, 'good'); break;
        case 'blindsUp': toast(`Blinds up: ${e.smallBlind}/${e.bigBlind}`, 'hot'); dealer.say(`Blinds are going up: ${e.smallBlind}/${e.bigBlind}.`); break;
        case 'acted':
          if (e.action !== 'allIn') {
            const v = ACT_WORDS[e.action] ?? [e.action, e.action];
            const amt = e.action === 'fold' || e.action === 'check' ? '' : ` ${fmt(e.action === 'call' ? e.amount : e.to)}`;
            note(`${e.seat === 0 ? 'You' : nameOf(e.seat)} ${v[e.seat === 0 ? 0 : 1]}${amt}`, 'info');
          }
          if (e.action === 'fold') sfx.card();
          else if (e.action === 'check') sfx.turn();
          else if (e.action !== 'smallBlind' && e.action !== 'bigBlind') sfx.deal(1);
          if (e.action === 'allIn') { toast(`${nameOf(e.seat)} ${e.seat === 0 ? 'go' : 'goes'} all in!`, 'hot'); dealer.say(e.seat === 0 ? "You're all in!" : `${nameOf(e.seat)} is all in!`); }
          break;
        case 'street': sfx.deal(e.cards.length); if (e.street === 'draw') dealer.say('Cards to draw?', 'deal'); else if (e.street === 'flop') dealer.gesture('deal', 900); break;
        case 'drew': sfx.deal(Math.max(1, e.count)); if (e.seat !== 0) toast(e.count === 0 ? `${nameOf(e.seat)} stands pat` : `${nameOf(e.seat)} draws ${e.count}`, e.count === 0 ? 'hot' : 'info'); break;
        case 'potAwarded': {
          note(`${e.winners.map(nameOf).join(' & ')} ${e.winners.length > 1 ? 'split' : e.winners[0] === 0 ? 'win' : 'wins'} ${fmt(e.amount)}${e.hand ? ` · ${e.hand}` : ''}`, e.winners.includes(0) ? 'good' : 'info');
          if (e.index === 0) dealer.say(e.winners.length > 1 ? `Split pot${e.hand ? `, ${e.hand.toLowerCase()}` : ''}.` : `Pot to ${e.winners[0] === 0 ? 'you' : nameOf(e.winners[0])}${e.hand ? `, ${e.hand.toLowerCase()}` : ''}.`, 'present');
          const from = potEl.current?.getBoundingClientRect();
          for (const w of e.winners) {
            const to = w === 0 ? meEl.current?.getBoundingClientRect() : seatEls.current[w]?.getBoundingClientRect();
            if (from && to && !reduced) setChipsFly((fs: ChipFly[]) => [...fs, { id: uid++, from, to, amount: Math.floor(e.amount / e.winners.length) }]);
          }
          if (e.winners.includes(0)) sfx.win();
          else if (e.index === 0 && e.winners.length === 1) {
            const w = e.winners[0];
            const r = aiReaction('won', viewRef.current.players[w]?.personality, Math.random() * (e.amount > viewRef.current.bigBlind * 15 ? 1 : 2.2));
            if (r) setTimeout(() => emote(w, r), 700);
          }
          break;
        }
        case 'busted':
          dealer.say(e.seat === 0 ? `Bad luck. You finish ${ORD[e.place - 1]}.` : `That's ${nameOf(e.seat)} out in ${ORD[e.place - 1]}.`);
          if (e.seat !== 0) { const r = aiReaction('ko', viewRef.current.players[e.seat]?.personality, Math.random()); if (r) setTimeout(() => emote(e.seat, r), 900); }
          sfx.knockout();
          toast(e.seat === 0 ? `You're out in ${ORD[e.place - 1]} place` : `${nameOf(e.seat)} is out (${ORD[e.place - 1]})`, 'hot');
          break;
        case 'turn':
          if (e.seat === 0) sfx.turn();
          break;
        default: break;
      }
    }
  };

  useEffect(() => {
    const unsub = session.subscribe(({ view: v, events }) => {
      setView(v);
      handle(events);
    });
    return () => { unsub(); session.dispose(); };
  }, [session]);

  const meOut = view.players[0].busted;

  // Deal the next hand automatically after a pause to read the result.
  useEffect(() => {
    if (view.street !== 'handOver') return undefined;
    if (meOut && !watching) return undefined;
    // Give everyone time to see who won. "Wait for me" in Settings holds it until you tap.
    if (store.get().settings.handPause === 'tap' && !fast.current) return undefined;
    const t = setTimeout(() => { void session.act({ type: 'nextHand' }).catch(() => {}); }, fast.current ? 700 : HAND_PAUSE_MS);
    return () => clearTimeout(t);
  }, [view.street, view.handNumber, watching, meOut]);

  useEffect(() => {
    if (meOut && !watching && view.street !== 'matchOver') setSheet('out');
    if (view.street === 'matchOver') {
      const t = setTimeout(() => setSheet('final'), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [meOut, view.street]);

  useEffect(() => {
    if (recorded.current) return;
    const me = view.players[0];
    if (me.busted || view.street === 'matchOver') {
      recorded.current = true;
      if (draw) store.recordDraw({ won: view.winner === 0, place: me.place ?? 1, handsWon: me.handsWon });
      else store.recordPoker({ won: view.winner === 0, place: me.place ?? 1, handsWon: me.handsWon });
    }
    if (view.street === 'matchOver' && !clubRecorded.current) {
      clubRecorded.current = true;
      const order = view.players.slice().sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((p) => p.playerId);
      const o = onFinished({ ordered: order, remaining: [] });
      setOutcome(o);
      if (o.won) setTimeout(() => setCelebrate(true), reduced ? 200 : 800);
    }
  }, [view.street, meOut]);

  /** Knocked out: settle the rest of the table without watching. */
  const seeResult = () => {
    if (clubRecorded.current) return;
    clubRecorded.current = true;
    const busted = view.players.filter((p) => p.busted).sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((p) => p.playerId);
    const alive = view.players.filter((p) => !p.busted).map((p) => p.playerId);
    setOutcome(onFinished({ ordered: busted, remaining: alive }));
  };

  // Reset the raise panel whenever it stops being our turn.
  useEffect(() => {
    setRaiseOpen(false);
    setError(null);
    setPicked([]);
    if (view.options) setRaiseTo(view.options.minRaiseTo);
  }, [view.current, view.street, view.handNumber, view.currentBet]);

  const act = async (a: PokerAction) => {
    setError(null);
    try {
      await session.act(a);
      setRaiseOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That move was not allowed.');
    }
  };

  const me = view.players[0];
  const o = view.options;
  const opponents = view.players.slice(1);
  const lastHand = view.lastHand;
  const showResult = (view.street === 'handOver' || view.street === 'matchOver') && lastHand;
  const winners = new Set(showResult ? lastHand!.pots.flatMap((p) => p.winners) : []);
  const winningIds = new Set(showResult ? lastHand!.pots.flatMap((p) => p.winningCards.map((c) => c.id)) : []);
  const known = [...view.hole, ...view.board];
  const myHand = view.hole.length > 0 && !me.folded ? describePartial(known) : null;
  const myDraw = draw && view.street === 'draw' && view.current === 0 && !me.folded && !meOut;
  const maxDraw = view.config.maxDraw ?? 3;
  const togglePick = (id: string) => {
    if (!myDraw) return;
    setError(null);
    if (!picked.includes(id) && picked.length >= maxDraw) { setError(`You can exchange at most ${maxDraw} cards.`); return; }
    setPicked((ps: string[]) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));
  };
  const pot = view.street === 'handOver' || view.street === 'matchOver' ? 0 : view.pot;

  const presets = o ? [
    { label: 'Min', to: o.minRaiseTo },
    { label: '½ pot', to: view.currentBet + Math.round(view.totalPot / 2) },
    { label: '¾ pot', to: view.currentBet + Math.round((view.totalPot * 3) / 4) },
    { label: 'Pot', to: view.currentBet + view.totalPot + o.toCall },
  ].filter((p) => p.to > o.minRaiseTo - 1 && p.to < o.maxRaiseTo) : [];

  let resultLine = '';
  if (showResult && lastHand) {
    const main = lastHand.pots[0];
    const who = main.winners.map(nameOf).join(' & ');
    const total = lastHand.pots.reduce((a, p) => a + p.amount, 0);
    resultLine = lastHand.uncontested
      ? `${who} ${main.winners[0] === 0 ? 'win' : 'wins'} ${fmt(total)}`
      : `${who} ${main.winners.length > 1 ? 'split' : main.winners[0] === 0 ? 'win' : 'wins'} ${fmt(main.amount)} · ${main.hand}`;
  }

  const stillIn = view.players.filter((p) => p.inHand && p.seat !== 0).map((p) => nameOf(p.seat));
  const banner = showResult && lastHand ? (() => {
    const main = lastHand.pots[0];
    const total = lastHand.pots.reduce((a, p) => a + p.amount, 0);
    const mine = main.winners.includes(0);
    const title = main.winners.length > 1 ? `Split pot · ${main.winners.map(nameOf).join(' & ')}` : mine ? 'You win the pot!' : `${nameOf(main.winners[0])} wins`;
    return (
      <div className={`hand-winner ${mine ? 'is-mine' : ''}`} key={`hw${lastHand.hand}`} role="status">
        <span className="hw-avatars">{main.winners.map((w) => <Avatar key={w} config={avatars[w]} size={44} />)}</span>
        <span className="hw-text">
          <b>{title}</b>
          <span className="hw-amount">{fmt(lastHand.uncontested ? total : main.amount)} chips</span>
          <small>{lastHand.uncontested ? 'Everyone else folded' : main.hand}</small>
          {lastHand.pots.slice(1).map((sp, i) => <small key={i} className="hw-side">Side pot {fmt(sp.amount)}: {sp.winners.map(nameOf).join(' & ')}</small>)}
        </span>
        {!lastHand.uncontested && main.winningCards.length > 0 && (
          <span className="hw-cards" aria-label="Winning cards">{main.winningCards.map((c) => <CardFace key={c.id} card={c} />)}</span>
        )}
        {view.street === 'handOver' && settings.handPause !== 'tap' && !(meOut && !watching) && <span className="hw-timer" style={{ animationDuration: `${fast.current ? 700 : HAND_PAUSE_MS}ms` }} />}
      </div>
    );
  })() : null;

  let status = '';
  if (view.street === 'matchOver') status = view.winner === 0 ? 'You win the table!' : `${nameOf(view.winner ?? 0)} wins the table`;
  else if (view.street === 'handOver') status = meOut ? 'Watching' : settings.handPause === 'tap' ? 'Tap Next hand when you\'re ready' : 'Next hand coming up…';
  else if (myDraw) status = picked.length ? `Exchange ${picked.length} card${picked.length === 1 ? '' : 's'}?` : `Tap up to ${maxDraw} cards to throw, or stand pat`;
  else if (o) status = o.toCall > 0 ? `Your turn · ${fmt(o.toCall)} to call` : 'Your turn';
  else if (me.folded && !meOut) status = `You folded · ${stillIn.join(', ')} still in · ${nameOf(view.current)} to act`;
  else if (meOut) status = `Watching · ${nameOf(view.current)} to act`;
  else status = `${nameOf(view.current)} is thinking…`;

  return (
    <div className={`table-screen poker-screen ${settings.cardSize === 'large' ? 'cards-lg' : ''} ${theme.className} ${reduced ? 'reduce-motion' : ''}`} style={theme.style}>
      <header className="table-bar">
        <button className="icon-btn" onClick={() => setSheet('leave')} aria-label="Leave table">‹</button>
        <div className="table-title">
          <span className="display">{setup.kind === 'title' ? 'Title match' : setup.kind === 'cupHeat' ? 'Cup heat' : setup.kind === 'cupFinal' ? 'Cup final' : draw ? 'Five-Card Draw' : "Hold'em"}</span>
          <small>Hand {view.handNumber} · blinds {view.smallBlind}/{view.bigBlind}</small>
        </div>
        <div className="table-tools">
          <EmoteMenu onPick={(r) => reactAtTable(r, view.players.filter((p) => !p.busted), emote)} />
          <button className="icon-btn" onClick={() => setSheet('history')} aria-label="Hand history">≡</button>
          <button className="icon-btn" onClick={() => store.setSettings({ sound: !settings.sound })} aria-label={settings.sound ? 'Mute sound' : 'Turn sound on'} aria-pressed={settings.sound}>
            {settings.sound ? '♪' : '–'}
          </button>
        </div>
      </header>

      <section className={`stage pstage ${big ? 'has-dealer' : ''}`} aria-label="Poker table">
        {big && <Dealer line={dealer.line} pose={dealer.pose} />}
        <div className="felt">
          <div className="felt-inner poker-center">
            <div className="toasts" aria-live="polite">
              {toasts.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
            </div>
            <div className="pot" ref={potEl} aria-live="polite">
              {pot > 0 ? <><span className="pot-label">Pot</span><Chips amount={pot} /></> : <span className="pot-label">{view.street === 'preflop' && !draw ? 'Pre-flop' : '\u00a0'}</span>}
            </div>
            {draw ? (
              <div className="draw-stage" aria-live="polite">
                <span className={`draw-step ${view.street === 'preflop' ? 'is-on' : ''}`}>Bet</span>
                <span className="draw-sep" aria-hidden="true">›</span>
                <span className={`draw-step ${view.street === 'draw' ? 'is-on' : ''}`}>Draw</span>
                <span className="draw-sep" aria-hidden="true">›</span>
                <span className={`draw-step ${view.street === 'river' ? 'is-on' : ''}`}>Bet</span>
                <span className="draw-sep" aria-hidden="true">›</span>
                <span className={`draw-step ${showResult ? 'is-on' : ''}`}>Show</span>
              </div>
            ) : (
            <div className="board" aria-label="Community cards">
              {Array.from({ length: 5 }, (_, i) => {
                const c = view.board[i];
                return c
                  ? <CardFace key={c.id} card={c} className={`landing ${showResult && !lastHand!.uncontested && !winningIds.has(c.id) ? 'is-dim-card' : ''} ${winningIds.has(c.id) ? 'is-win-card' : ''}`} />
                  : <div key={`e${i}`} className="pc pc-empty" />;
              })}
            </div>
            )}
            {banner ?? <p className="result-line" aria-live="polite">{resultLine || '\u00a0'}</p>}
          </div>
        </div>
        {opponents.map((p, i) => (
          <PSeat key={p.seat} p={p} view={view} angle={seatAngle(i, opponents.length, big)} avatar={avatars[p.seat]} prop={props[p.seat]} dealer={big}
            winner={winners.has(p.seat)} emote={emotes[p.seat]} setRef={(el) => { seatEls.current[p.seat] = el; }} />
        ))}
        {me.bet > 0 && <div className="bet-spot" style={{ left: '50%', top: '84%' }}><Chips amount={me.bet} small /></div>}
      </section>

      <section className={`me pme ${o ? 'is-turn' : ''} ${winners.has(0) ? 'is-winner' : ''}`} aria-label="Your seat" ref={meEl}>
        <div className="pme-row">
          <div className="me-id">
            <Avatar config={avatars[0]} size={40} title={me.name} /><SeatProp id={props[0]} />
            {emotes[0] && <EmoteBubble look={avatars[0]} pose={emotes[0]} />}
            <span>
              <b>{me.name} {view.button === 0 && !meOut && <span className="dealer-btn inline">D</span>}</b>
              <span className="me-stack">{meOut ? `Out · ${ORD[(me.place ?? 1) - 1]}` : `${fmt(me.stack)} chips${me.allIn ? ' · all in' : ''}`}</span>
            </span>
          </div>
          {!draw && (
          <div className={`my-hole ${me.folded ? 'is-folded' : ''}`} key={`h${view.handNumber}`}>
            {view.hole.map((c, i) => <span key={c.id} className="hole-card" style={{ '--i': i }}><CardFace card={c} className={winningIds.has(c.id) ? 'is-win-card' : ''} /></span>)}
          </div>
          )}
          {draw && (view.street === 'draw' || view.street === 'river') && me.drew !== null && !me.folded && (
            <span className="tag tag-muted">{me.drew === 0 ? 'Stood pat' : `Drew ${me.drew}`}</span>
          )}
        </div>
        <p className={`status ${o ? 'is-turn' : ''}`} role="status">
          {status}{myHand && !meOut ? <span className="my-hand"> · {myHand}</span> : null}
        </p>
        {error && <p className="move-error" role="alert">{error}</p>}

        {o && raiseOpen && (
          <div className="raise-panel">
            <div className="raise-presets">
              {presets.map((p) => <button key={p.label} type="button" className="choice" onClick={() => setRaiseTo(Math.round(p.to))}>{p.label}</button>)}
              <button type="button" className="choice" onClick={() => setRaiseTo(o.maxRaiseTo)}>All in</button>
            </div>
            <div className="raise-slider">
              <button type="button" className="icon-btn" aria-label="Less" onClick={() => setRaiseTo((v: number) => Math.max(o.minRaiseTo, v - view.bigBlind))}>−</button>
              <input id="raise-amount" type="range" min={o.minRaiseTo} max={o.maxRaiseTo} step={Math.max(1, Math.floor(view.bigBlind / 2))} value={raiseTo}
                aria-label="Raise amount" onChange={(e: { target: HTMLInputElement }) => setRaiseTo(Number(e.target.value))} />
              <button type="button" className="icon-btn" aria-label="More" onClick={() => setRaiseTo((v: number) => Math.min(o.maxRaiseTo, v + view.bigBlind))}>+</button>
            </div>
          </div>
        )}

        <div className="actions">
          {o && (
            <>
              {o.toCall > 0 && <Button variant="ghost" onClick={() => act({ type: 'fold' })}>Fold</Button>}
              {o.canCheck
                ? <Button variant="ghost" onClick={() => act({ type: 'check' })}>Check</Button>
                : <Button variant={raiseOpen ? 'ghost' : 'felt'} onClick={() => act({ type: 'call' })}>{o.toCall >= me.stack ? `All in ${fmt(o.toCall)}` : `Call ${fmt(o.toCall)}`}</Button>}
              {o.canRaise && (raiseOpen
                ? <Button onClick={() => act(raiseTo >= o.maxRaiseTo ? { type: 'allIn' } : { type: 'raise', to: raiseTo })}>
                    {raiseTo >= o.maxRaiseTo ? `All in ${fmt(o.maxRaiseTo)}` : `${o.isBet ? 'Bet' : 'Raise to'} ${fmt(raiseTo)}`}
                  </Button>
                : <Button onClick={() => { setRaiseTo(o.minRaiseTo); setRaiseOpen(true); }}>{o.isBet ? 'Bet…' : 'Raise…'}</Button>)}
            </>
          )}
          {myDraw && (
            <>
              <Button variant={picked.length ? 'ghost' : 'brass'} onClick={() => act({ type: 'draw', discard: [] })}>Stand pat</Button>
              {picked.length > 0 && <Button onClick={() => act({ type: 'draw', discard: picked })}>Draw {picked.length}</Button>}
            </>
          )}
          {!o && view.street === 'handOver' && !meOut && (
            <Button variant={settings.handPause === 'tap' ? 'brass' : 'ghost'} onClick={() => session.act({ type: 'nextHand' }).catch(() => {})}>Next hand</Button>
          )}
          {meOut && watching && view.street !== 'matchOver' && (
            <Button variant="ghost" size="sm" onClick={() => { fast.current = !fast.current; toast(fast.current ? 'Fast-forwarding' : 'Normal speed'); }}>Fast-forward</Button>
          )}
        </div>
        {draw && view.hole.length > 0 && (
          <div className={`hand draw-hand ${me.folded ? 'is-folded' : ''}`} style={{ '--n': view.hole.length }} key={`d${view.handNumber}`}>
            {view.hole.map((c, i) => (
              <button key={c.id} className={`hand-card ${myDraw ? 'is-playable' : ''} ${picked.includes(c.id) ? 'is-selected is-throw' : ''}`} style={{ '--i': i }}
                onClick={() => togglePick(c.id)} aria-pressed={myDraw ? picked.includes(c.id) : undefined}
                aria-label={`${c.id}${picked.includes(c.id) ? ', will be thrown' : ''}`}>
                <CardFace card={c} className={winningIds.has(c.id) ? 'is-win-card' : ''} />
              </button>
            ))}
          </div>
        )}
      </section>

      <TableSide title={`${draw ? 'Five-Card Draw' : "Hold'em"} · blinds ${view.smallBlind}/${view.bigBlind}`} log={log} rows={view.players.slice().sort((a, b) => Number(a.busted) - Number(b.busted) || b.stack - a.stack || (a.place ?? 99) - (b.place ?? 99)).map((p) => ({
        seat: p.seat, name: p.name, look: avatars[p.seat], me: p.seat === 0, out: p.busted,
        value: p.busted ? ORD[(p.place ?? 1) - 1] : fmt(p.stack + p.bet), sub: p.busted ? 'Out' : p.folded ? 'Folded' : p.lastAction ?? `${p.handsWon} hand${p.handsWon === 1 ? '' : 's'} won`,
        active: view.current === p.seat && view.street !== 'handOver' && view.street !== 'matchOver',
      }))} />

      {celebrate && (
        <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={avatars[0]} extras={myExtras}
          headline={outcome?.headline ?? 'You win!'} sub={outcome?.lines.find((l) => l.startsWith('+'))} onDone={() => setCelebrate(false)} />
      )}
      {chipsFly.map((f) => <ChipFlier key={f.id} f={f} reduced={reduced} done={(id) => setChipsFly((fs: ChipFly[]) => fs.filter((x) => x.id !== id))} />)}

      <Sheet open={sheet === 'leave'} onClose={() => setSheet(null)} title="Leave the table?">
        <p className="muted">{isEvent && !outcome && !meOut ? 'This is a club event: leaving now counts as finishing last.' : "Practice chips aren't kept. A game you leave early doesn't count."}</p>
        <div className="btn-row">
          <Button variant="danger" onClick={() => { if (meOut && !clubRecorded.current) seeResult(); onExit(isEvent && !meOut && !outcome); }}>Leave table</Button>
          <Button variant="ghost" onClick={() => setSheet(null)}>Keep playing</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'history'} onClose={() => setSheet(null)} title="Recent hands" wide>
        <HandHistory view={view} nameOf={nameOf} />
      </Sheet>

      <Sheet open={sheet === 'out'} title="You're out" dismissable={false}>
        <div className="winner">
          <div className="spotlight"><Avatar config={avatars[0]} size={96} /></div>
          <h2 className="display h-lg">{ORD[(me.place ?? 1) - 1]} place</h2>
          <p className="muted">You won {me.handsWon} hand{me.handsWon === 1 ? '' : 's'} over {view.handNumber}.</p>
        </div>
        {outcome ? (
          <>
            <OutcomeCard outcome={outcome} />
            <EndButtons isEvent={isEvent} onRematch={onRematch} onExit={() => onExit(false)} />
          </>
        ) : (
          <div className="btn-row sticky-actions">
            <Button size="lg" onClick={seeResult}>See result</Button>
            <Button variant="ghost" onClick={() => { setWatching(true); fast.current = true; setSheet(null); }}>Watch the finish</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'final'} title="Table finished" wide dismissable={false}>
        <div className="winner">
          <div className="spotlight"><Avatar config={avatars[view.winner ?? 0]} size={110} /></div>
          <p className="eyebrow">Last one with chips</p>
          <h2 className="display h-lg">{view.winner === 0 ? 'You win!' : view.players[view.winner ?? 0]?.name}</h2>
          <p className="muted">{view.handNumber} hands played</p>
        </div>
        {outcome && <OutcomeCard outcome={outcome} />}
        <div className="standings">
          <table>
            <thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col" className="num">Hands won</th></tr></thead>
            <tbody>
              {view.players.slice().sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((p) => (
                <tr key={p.seat}>
                  <td className="place">{ORD[(p.place ?? 1) - 1]}</td>
                  <td><span className="st-player"><Avatar config={avatars[p.seat]} size={26} />{p.seat === 0 ? 'You' : p.name}</span></td>
                  <td className="num">{p.handsWon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <EndButtons isEvent={isEvent} onRematch={onRematch} onExit={() => onExit(false)} />
        <p className="fine"><Tag>Club</Tag> Ratings and records saved on this device.</p>
      </Sheet>
    </div>
  );
}

function HandHistory({ view, nameOf }: { view: PokerView; nameOf: (s: number) => string }) {
  const list = view.history.slice().reverse();
  if (!list.length) return <p className="empty">Finished hands will appear here.</p>;
  return (
    <ul className="history">
      {list.map((h) => (
        <li key={h.hand}>
          <div className="hist-top">
            <b>Hand {h.hand}</b>
            <span className="muted small">{h.uncontested ? 'Everyone else folded' : 'Showdown'}</span>
          </div>
          {h.pots.map((p, i) => (
            <p key={i} className="hist-pot">
              {i > 0 ? 'Side pot: ' : h.pots.length > 1 ? 'Main pot: ' : ''}
              <b>{p.winners.map(nameOf).join(' & ')}</b> {p.winners.length > 1 ? 'split' : p.winners[0] === 0 ? 'win' : 'wins'} {fmt(p.amount)}{p.hand ? ` · ${p.hand}` : ''}
            </p>
          ))}
          {h.board.length > 0 && <div className="sl-hand">{h.board.map((c) => <CardFace key={c.id} card={c} size="28px" />)}</div>}
          {h.revealed.length > 0 && (
            <div className="hist-shown">
              {h.revealed.map((r) => (
                <span key={r.seat} className="hist-player">
                  <small>{nameOf(r.seat)}</small>
                  <span className="sl-hand">{r.cards.map((c) => <CardFace key={c.id} card={c} size="28px" />)}</span>
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
