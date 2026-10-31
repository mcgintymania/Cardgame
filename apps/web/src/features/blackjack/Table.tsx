import React, { useEffect, useMemo, useRef, useState } from 'react';
import { awardFeats, blackjackTracker } from '../../lib/feats.ts';
import type { FinishReport } from '../../app/App.tsx';
import type { MatchKind, Outcome } from '../../lib/club.ts';
import { aiPersonality, rosterById } from '../../lib/roster.ts';
import { prefersReducedMotion, store, useStore } from '../../lib/store.ts';
import { tableTheme } from '../../lib/tableTheme.ts';
import { getItem } from '../../lib/catalogue.ts';
import { sfx } from '../../lib/audio.ts';
import { Avatar, type AvatarConfig } from '../../design/Avatar.tsx';
import { CardBack, CardFace } from '../../design/PlayingCard.tsx';
import { Button, Sheet } from '../../design/ui.tsx';
import { CelebrationOverlay } from '../../design/Celebration.tsx';
import { useMyExtras } from '../wardrobe/bits.tsx';
import { aiReaction, EmoteBubble, useEmotes } from '../tables/Emotes.tsx';
import { LeaveSheet, MatchOverSheet, SPEED, SeatAvatar, TableBar, TableSide, Toasts, eventTitle, firstName, useBigScreen, useLatest, useToasts } from '../tables/shared.tsx';
import { SeatProp, seatProps } from '../tables/shared.tsx';
import { DEALER_LOOK, Dealer, useDealer } from '../../design/Dealer.tsx';
import { LocalSession } from '../../../../../packages/engine/src/core/session.ts';
import type { SeatInfo } from '../../../../../packages/engine/src/core/game.ts';
import { BlackjackModule, handValue, isNatural } from '../../../../../packages/engine/src/blackjack/engine.ts';
import { blackjackAI, blackjackThinkMs } from '../../../../../packages/engine/src/blackjack/ai.ts';
import type { BJAction, BJEvent, BJHand, BJOutcome, BlackjackConfig, BlackjackView } from '../../../../../packages/engine/src/blackjack/types.ts';

export interface BlackjackMatchSetup {
  config: Partial<BlackjackConfig>;
  opponents: string[];
  kind: MatchKind;
}

type Session = LocalSession<unknown, unknown, BJAction, BlackjackView, BJEvent>;
const fmt = (n: number) => n.toLocaleString('en-GB');
const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
const OUTCOME_LABEL: Record<BJOutcome, string> = { blackjack: 'Blackjack!', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust', surrender: 'Surrender' };
// Opponent seats around the felt: left, right, upper left, upper right.
const POS = [{ x: 12, y: 64 }, { x: 88, y: 64 }, { x: 11, y: 36 }, { x: 89, y: 36 }];
const POS_BIG = [{ x: 15, y: 80 }, { x: 85, y: 80 }, { x: 11, y: 42 }, { x: 89, y: 42 }];
const layout = (k: number, big: boolean) => { const P = big ? POS_BIG : POS; return k === 1 ? [P[1]] : P.slice(0, k); };

function totalLabel(h: BJHand): string {
  if (isNatural(h)) return 'BJ';
  const v = handValue(h.cards);
  return v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : String(v.total);
}

function MiniHand({ h, active }: { h: BJHand; active: boolean }) {
  return (
    <span className={`bj-mini ${active ? 'is-active' : ''} ${h.outcome ? `out-${h.outcome}` : ''}`}>
      <span className="bj-mini-cards">{h.cards.map((c) => <CardFace key={c.id} card={c} />)}</span>
      <span className="bj-total">{h.outcome ? OUTCOME_LABEL[h.outcome] : totalLabel(h)}</span>
    </span>
  );
}

export function BlackjackTable({ setup, onExit, onRematch, onFinished }: {
  setup: BlackjackMatchSetup; onExit: (forfeit: boolean) => void; onRematch: () => void; onFinished: (r: FinishReport) => Outcome;
}) {
  const isEvent = setup.kind !== 'casual';
  const { profile, settings, wallet } = useStore();
  const theme = tableTheme(wallet);
  const reduced = prefersReducedMotion(settings);
  const myExtras = useMyExtras();
  const { active: emotes, emote } = useEmotes();
  const { toasts, toast, note, log } = useToasts();
  const big = useBigScreen();
  const dealer = useDealer();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const recorded = useRef(false);

  const seatInfo: SeatInfo[] = useMemo(() => [
    { playerId: 'me', name: profile?.name ?? 'You', isAI: false },
    ...setup.opponents.map((id) => {
      const c = rosterById(id)!;
      return { playerId: c.id, name: c.name, isAI: true, personality: aiPersonality(c, 'blackjack') };
    }),
  ], []);
  const avatars: AvatarConfig[] = useMemo(() => [profile!.avatar, ...setup.opponents.map((id) => rosterById(id)!.avatar)], []);
  const props = useMemo(() => seatProps(setup.opponents), []);

  const session: Session = useMemo(() => new LocalSession(BlackjackModule as never, {
    config: setup.config,
    seats: seatInfo,
    humanSeat: 0,
    ai: blackjackAI as never,
    thinkDelay: (s: SeatInfo) => blackjackThinkMs(s.personality, { int: (n: number) => Math.floor(Math.random() * n), float: Math.random }) * (SPEED[store.get().settings.aiSpeed] ?? 1),
  }) as Session, []);

  const [view, setView] = useState<BlackjackView>(() => session.getView());
  const bjFeats = useMemo(() => blackjackTracker(), []);
  const viewRef = useLatest(view);
  const [bet, setBet] = useState<number>(() => Math.max(view.config.minBet, view.config.minBet * 5));
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'rules' | 'scores' | 'leave' | 'final'>(null);
  const nameOf = (seat: number) => (seat === 0 ? 'You' : firstName(viewRef.current.players[seat]?.name ?? ''));

  useEffect(() => {
    const unsub = session.subscribe(({ view: v, events }) => {
      setView(v);
      awardFeats(bjFeats(events));
      for (const e of events) {
        switch (e.type) {
          case 'card': sfx.card(); break;
          case 'shuffled': toast('Fresh shoe: the dealer shuffles', 'info'); dealer.say('Fresh shoe. Shuffling up.', 'deal'); break;
          case 'dealt': dealer.gesture('deal', 1200); break;
          case 'blackjack':
            sfx.win();
            toast(e.seat === 'dealer' ? 'Dealer has blackjack' : `${nameOf(e.seat)}: blackjack!`, e.seat === 'dealer' ? 'hot' : 'good');
            dealer.say(e.seat === 'dealer' ? 'Dealer blackjack. Sorry, folks.' : `Blackjack for ${e.seat === 0 ? 'you' : nameOf(e.seat)}! Pays ${v.config.blackjackPays === 1.5 ? 'three to two' : 'six to five'}.`, e.seat === 'dealer' ? 'shrug' : 'present');
            break;
          case 'bust': sfx.penalty(); if (e.seat !== 0) toast(`${nameOf(e.seat)} busts`, 'hot'); break;
          case 'acted':
            if (e.seat !== 0 && (e.action === 'double' || e.action === 'split')) toast(`${nameOf(e.seat)} ${e.action === 'double' ? 'doubles down' : 'splits'}`, 'info');
            break;
          case 'roundOver': {
            if (!e.result.dealerBlackjack) dealer.say(e.result.dealerBust ? `Dealer busts with ${e.result.dealerTotal}. Paying everyone still in.` : `Dealer has ${e.result.dealerTotal}.`, e.result.dealerBust ? 'shrug' : 'present');
            note(`Hand ${e.result.round}: dealer ${e.result.dealerBlackjack ? 'blackjack' : e.result.dealerBust ? 'busts' : e.result.dealerTotal}. ${e.result.lines.map((l) => `${l.seat === 0 ? 'You' : nameOf(l.seat)} ${l.net > 0 ? '+' : ''}${fmt(l.net)}`).join(', ')}`, 'info');
            for (const l of e.result.lines) {
              if (l.seat === 0) continue;
              const r = aiReaction(l.net > 0 ? 'won' : 'lost', v.players[l.seat].personality, Math.random() * (Math.abs(l.net) >= 100 ? 1 : 2.5));
              if (r) setTimeout(() => emote(l.seat, r), 600);
            }
            const mine = e.result.lines.find((l) => l.seat === 0);
            if (mine && mine.net > 0) sfx.win();
            break;
          }
          case 'out': sfx.knockout(); dealer.say(e.seat === 0 ? "That's your last chip. Thanks for playing." : `${nameOf(e.seat)} is out. Bad luck.`); toast(e.seat === 0 ? "You're out of chips" : `${nameOf(e.seat)} is out of chips`, 'hot'); break;
          case 'turn': if (e.seat === 0) sfx.turn(); break;
          default: break;
        }
      }
    });
    return () => { unsub(); session.dispose(); };
  }, [session]);

  // Next hand after a pause to read the result.
  useEffect(() => {
    if (view.phase !== 'roundOver') return undefined;
    if (store.get().settings.handPause === 'tap') return undefined;
    const t = setTimeout(() => { void session.act({ type: 'nextRound' }).catch(() => {}); }, 4500);
    return () => clearTimeout(t);
  }, [view.phase, view.round]);

  useEffect(() => {
    if (view.phase !== 'matchOver' || recorded.current) return;
    recorded.current = true;
    const order = view.placements!;
    store.recordBlackjack({ won: order[0] === 0, chips: view.players[0].chips, blackjacks: view.players[0].blackjacks });
    const o = onFinished({ ordered: order.map((s) => view.players[s].playerId), remaining: [] });
    setOutcome(o);
    setTimeout(() => setSheet('final'), reduced ? 600 : 1800);
    if (o.won) setTimeout(() => setCelebrate(true), reduced ? 200 : 900);
  }, [view.phase]);

  useEffect(() => { setError(null); }, [view.phase, view.current?.seat, view.current?.hand]);
  useEffect(() => {
    if (view.betRange) setBet((b: number) => Math.min(view.betRange![1], Math.max(view.betRange![0], b)));
  }, [view.round]);

  const act = async (a: BJAction) => {
    setError(null);
    try { await session.act(a); } catch (e) { setError(e instanceof Error ? e.message : 'That move was not allowed.'); }
  };

  const me = view.players[0];
  const o = view.options;
  const range = view.betRange;
  const opponents = view.players.slice(1);
  const pos = layout(opponents.length, big);
  const leader = view.players.filter((p) => !p.out).sort((a, b) => b.chips + (b.bet ?? 0) - (a.chips + (a.bet ?? 0)))[0];
  const lastLine = view.history[view.history.length - 1]?.lines.find((l) => l.seat === 0);
  const showingResult = view.phase === 'roundOver' || view.phase === 'matchOver';
  const myTurn = !!o;

  let status = '';
  if (view.phase === 'matchOver') status = view.placements![0] === 0 ? 'You win the tournament!' : `${nameOf(view.placements![0])} wins the tournament`;
  else if (me.out) status = `Out of chips · ${ORD[(me.place ?? 1) - 1]} place`;
  else if (view.phase === 'bet') status = range ? 'Place your bet' : 'Waiting for the others to bet…';
  else if (showingResult) status = lastLine ? (lastLine.net > 0 ? `You win ${fmt(lastLine.net)}` : lastLine.net < 0 ? `You lose ${fmt(-lastLine.net)}` : 'Push: your bet comes back') : 'Next hand coming up…';
  else if (myTurn) status = me.hands.length > 1 ? `Your turn · hand ${view.current!.hand + 1} of ${me.hands.length}` : 'Your turn';
  else if (view.current) status = `${nameOf(view.current.seat)} is playing…`;
  else status = 'Dealer plays…';

  const chipsAdd = [view.config.minBet, 25, 50, 100].filter((x, i, a) => a.indexOf(x) === i);
  const dealerHidden = view.dealer.length === 2 && view.dealer[1] === null;

  return (
    <div className={`table-screen bj-table ${settings.cardSize === 'large' ? 'cards-lg' : ''} ${theme.className} ${reduced ? 'reduce-motion' : ''}`} style={theme.style}>
      <TableBar
        title={eventTitle(setup.kind, 'Blackjack')}
        sub={`Hand ${Math.min(view.round, view.config.rounds)} of ${view.config.rounds} · bets ${view.config.minBet}–${view.config.maxBet}`}
        onLeave={() => setSheet('leave')} onScores={() => setSheet('scores')} onRules={() => setSheet('rules')}
        players={view.players} onEmote={emote}
      />

      <section className={`stage bj-stage ${big ? 'has-dealer' : ''}`} aria-label="Blackjack table">
        {big && <Dealer line={dealer.line} pose={dealer.pose} />}
        <div className="felt">
          <div className="felt-inner bj-center">
            <div className="bj-dealer" aria-label={`Dealer${view.dealerTotal !== null ? `, showing ${view.dealerTotal}` : ''}`}>
              <span className="bj-dealer-label">{!big && <Avatar config={DEALER_LOOK} size={26} />}Dealer{view.dealerTotal !== null && view.dealer.length ? <b>{dealerHidden ? view.dealerTotal : view.dealerTotal > 21 ? 'Bust' : view.dealerTotal}</b> : null}</span>
              <span className="bj-dealer-cards">
                {view.dealer.length === 0 && <><span className="pc pc-empty" /><span className="pc pc-empty" /></>}
                {view.dealer.map((c, i) => (c ? <CardFace key={c.id} card={c} className="landing" /> : <CardBack key={`hole${i}`} />))}
              </span>
            </div>
            <p className="bj-print" aria-hidden="true">
              Blackjack pays {view.config.blackjackPays === 1.5 ? '3 to 2' : '6 to 5'} · Dealer {view.config.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17
            </p>
            <Toasts toasts={toasts} />
          </div>
        </div>

        {opponents.map((p, i) => {
          const at = pos[i];
          const active = view.current?.seat === p.seat;
          const thinking = active || (view.phase === 'bet' && !p.hasBet && !p.out);
          return (
            <div key={p.seat} className={`seat bjseat ${active ? 'is-active' : ''} ${p.out ? 'is-out' : ''}`} style={{ left: `${at.x}%`, top: `${at.y}%` }}
              aria-label={`${p.name}, ${p.chips} chips${p.bet ? `, betting ${p.bet}` : ''}`}>
              <SeatAvatar look={avatars[p.seat]} size={38} thinking={thinking} emote={emotes[p.seat]} name={p.name} prop={props[p.seat]} chips={p.out ? null : p.chips} />
              <div className="seat-plate pplate">
                <span className="seat-name">{firstName(p.name)}</span>
                <span className="seat-stack">{p.out ? ORD[(p.place ?? 1) - 1] : fmt(p.chips)}</span>
              </div>
              {p.bet !== null && p.hands.length === 0 && !p.out && <span className="bj-betchip">{fmt(p.bet)}</span>}
              {p.hands.length > 0 && (
                <span className="bj-minis">
                  {p.hands.map((h, hi) => <MiniHand key={hi} h={h} active={active && view.current?.hand === hi} />)}
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className={`me bjme ${myTurn || range ? 'is-turn' : ''}`} aria-label="Your seat">
        <div className="me-bar">
          <div className="me-id">
            <Avatar config={avatars[0]} size={40} title={me.name} /><SeatProp id={props[0]} />
            {emotes[0] && <EmoteBubble look={avatars[0]} pose={emotes[0]} />}
            <span>
              <b>{me.name}</b>
              <small className="muted">{leader && leader.seat !== 0 ? `Leader: ${firstName(leader.name)} ${fmt(leader.chips + (leader.bet ?? 0))}` : leader ? "You're leading" : ''}</small>
            </span>
          </div>
          <div className="me-scores">
            <span><small>Chips</small><b>{fmt(me.chips)}</b></span>
            <span className={me.bet ? 'is-mult' : ''}><small>Bet</small><b>{fmt(me.hands.reduce((a, h) => a + h.bet, 0) || me.bet || 0)}</b></span>
          </div>
        </div>

        <div className="bj-my-hands">
          {me.hands.map((h, hi) => {
            const active = myTurn && view.current?.hand === hi;
            return (
              <div key={hi} className={`bj-hand ${active ? 'is-active' : ''} ${h.outcome ? `out-${h.outcome}` : ''}`}>
                <span className="bj-hand-cards">{h.cards.map((c, i) => <span key={c.id} className="bj-card" style={{ '--i': i }}><CardFace card={c} /></span>)}</span>
                <span className="bj-hand-meta">
                  <b>{h.outcome ? OUTCOME_LABEL[h.outcome] : totalLabel(h)}</b>
                  <small>{fmt(h.bet)}{h.doubled ? ' · doubled' : ''}{h.outcome && h.net !== 0 ? ` · ${h.net > 0 ? '+' : ''}${fmt(h.net)}` : ''}</small>
                </span>
              </div>
            );
          })}
          {me.hands.length === 0 && range && (
            <div className="bj-betting">
              <div className="bj-bet-amount"><small>Your bet</small><b>{fmt(bet)}</b></div>
              <div className="bj-chip-row">
                {chipsAdd.map((c) => (
                  <button key={c} type="button" className={`bj-chip chip-${c}`} onClick={() => setBet((b: number) => Math.min(range[1], b + c))} aria-label={`Add ${c}`}>+{c}</button>
                ))}
                <button type="button" className="bj-chip chip-clear" onClick={() => setBet(range[0])} aria-label="Minimum bet">Min</button>
                <button type="button" className="bj-chip chip-max" onClick={() => setBet(range[1])} aria-label="Maximum bet">Max</button>
              </div>
            </div>
          )}
        </div>

        <p className={`status ${myTurn || range ? 'is-turn' : ''}`} role="status">{status}</p>
        {error && <p className="move-error" role="alert">{error}</p>}

        <div className="actions bj-actions">
          {range && <Button onClick={() => act({ type: 'bet', amount: bet })}>Bet {fmt(bet)} · Deal</Button>}
          {o && (
            <>
              <Button onClick={() => act({ type: 'hit' })}>Hit</Button>
              <Button variant="felt" onClick={() => act({ type: 'stand' })}>Stand</Button>
              {o.double && <Button variant="ghost" onClick={() => act({ type: 'double' })}>Double</Button>}
              {o.split && <Button variant="ghost" onClick={() => act({ type: 'split' })}>Split</Button>}
              {o.surrender && <Button variant="ghost" onClick={() => act({ type: 'surrender' })}>Surrender</Button>}
            </>
          )}
          {view.phase === 'roundOver' && <Button variant={settings.handPause === 'tap' ? 'brass' : 'ghost'} onClick={() => session.act({ type: 'nextRound' }).catch(() => {})}>Next hand</Button>}
        </div>
      </section>

      <TableSide title={`Blackjack · hand ${Math.min(view.round, view.config.rounds)} of ${view.config.rounds}`} log={log} rows={view.players.slice().sort((a, b) => b.chips - a.chips).map((p) => ({
        seat: p.seat, name: p.name, look: avatars[p.seat], me: p.seat === 0, out: p.out,
        value: p.out ? 'Out' : fmt(p.chips + (showingResult ? 0 : p.hands.length ? p.hands.reduce((a, h) => a + h.bet, 0) : p.bet ?? 0)),
        sub: `${p.handsWon} won · ${p.blackjacks} blackjack${p.blackjacks === 1 ? '' : 's'}`,
        active: view.current?.seat === p.seat,
      }))} />

      {celebrate && (
        <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={avatars[0]} extras={myExtras}
          headline={outcome?.headline ?? 'You win!'} sub={outcome?.lines.find((l) => l.startsWith('+'))} onDone={() => setCelebrate(false)} />
      )}

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title="Blackjack tournament">
        <div className="rules-text">
          <p>Everyone starts with <b>{fmt(view.config.startingChips)}</b> chips. After <b>{view.config.rounds}</b> hands against the dealer, the biggest stack wins. Run out of chips and you're out.</p>
          <ul>
            <li>Get closer to 21 than the dealer without going over. Picture cards are 10, aces 1 or 11.</li>
            <li>Blackjack (an ace and a ten on your first two cards) pays {view.config.blackjackPays === 1.5 ? '3 to 2' : '6 to 5'}.</li>
            <li>The dealer {view.config.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17 and checks for blackjack under an ace or a ten.</li>
            <li><b>Double</b> on any first two cards{view.config.doubleAfterSplit ? ', including after a split' : ''}: double your bet, take exactly one card.</li>
            <li><b>Split</b> a pair into two hands (up to {view.config.maxHands}). Split aces get one card each.</li>
            {view.config.surrender && <li><b>Surrender</b> your first two cards to get half your bet back.</li>}
            <li>No insurance. {view.config.decks} decks, reshuffled when the shoe runs low.</li>
          </ul>
        </div>
      </Sheet>
      <Sheet open={sheet === 'scores'} onClose={() => setSheet(null)} title="Chip counts" wide>
        <div className="standings">
          <table>
            <thead><tr><th scope="col">Player</th><th scope="col" className="num">Chips</th><th scope="col" className="num">Hands won</th><th scope="col" className="num">Blackjacks</th></tr></thead>
            <tbody>
              {view.players.slice().sort((a, b) => b.chips + (b.bet ?? 0) - (a.chips + (a.bet ?? 0))).map((p) => (
                <tr key={p.seat} className={p.out ? 'is-ko' : ''}>
                  <td><span className="st-player"><Avatar config={avatars[p.seat]} size={26} />{p.seat === 0 ? 'You' : p.name}</span></td>
                  <td className="num">{p.out ? 'Out' : fmt(p.chips + (p.hands.length ? 0 : p.bet ?? 0))}</td>
                  <td className="num">{p.handsWon}</td>
                  <td className="num">{p.blackjacks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>
      <LeaveSheet open={sheet === 'leave'} onClose={() => setSheet(null)} isEvent={isEvent} finished={!!outcome} onLeave={onExit} />
      <MatchOverSheet
        open={sheet === 'final'}
        winnerLook={avatars[view.placements?.[0] ?? 0]}
        eyebrow="Biggest stack wins"
        headline={view.placements?.[0] === 0 ? 'You win!' : view.players[view.placements?.[0] ?? 0]?.name ?? ''}
        sub={`${view.history.length} hands played`}
        outcome={outcome} isEvent={isEvent} onRematch={onRematch} onExit={() => onExit(false)}
      >
        <div className="standings">
          <table>
            <thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col" className="num">Chips</th></tr></thead>
            <tbody>
              {(view.placements ?? []).map((s, i) => {
                const p = view.players[s];
                return (
                  <tr key={s}>
                    <td className="place">{ORD[i]}</td>
                    <td><span className="st-player"><Avatar config={avatars[s]} size={26} />{s === 0 ? 'You' : p.name}</span></td>
                    <td className="num">{p.out ? 'Out' : fmt(p.chips)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </MatchOverSheet>
    </div>
  );
}
