import React, { useEffect, useMemo, useRef, useState } from 'react';
import { awardFeats, ginFeats } from '../../lib/feats.ts';
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
import {
  LeaveSheet, MatchOverSheet, SPEED, SeatAvatar, TableBar, TableSide, Toasts, eventTitle, firstName, useToasts,
} from '../tables/shared.tsx';
import { SeatProp, seatProps } from '../tables/shared.tsx';
import { LocalSession } from '../../../../../packages/engine/src/core/session.ts';
import type { SeatInfo } from '../../../../../packages/engine/src/core/game.ts';
import { cardLabel, type Card } from '../../../../../packages/engine/src/core/cards.ts';
import { GinModule } from '../../../../../packages/engine/src/gin/engine.ts';
import { ginAI, ginThinkMs } from '../../../../../packages/engine/src/gin/ai.ts';
import { bestArrangement, type Meld } from '../../../../../packages/engine/src/gin/melds.ts';
import type { GinAction, GinConfig, GinEvent, GinHandResult, GinView } from '../../../../../packages/engine/src/gin/types.ts';

export interface GinMatchSetup {
  config: Partial<GinConfig>;
  opponents: string[];
  kind: MatchKind;
}

type Session = LocalSession<unknown, unknown, GinAction, GinView, GinEvent>;

function GinRules({ config }: { config: GinConfig }) {
  return (
    <div className="rules-text">
      <p>Make melds, cut your deadwood, and be first to <b>{config.target}</b> points.</p>
      <ul>
        <li><b>Melds</b> are sets (three or four of a rank) or runs (three or more in a row, same suit). Ace is low: A-2-3 counts, Q-K-A doesn't.</li>
        <li><b>Deadwood</b> is every card not in a meld. Ace counts 1, picture cards 10, the rest face value.</li>
        <li>On your turn, draw from the stock or take the top discard, then discard one. You can't throw back a card you just picked up.</li>
        {config.upcardOffer && <li>First turn: the upcard is offered to the non-dealer, then the dealer. If both pass, the non-dealer draws from the stock.</li>}
        <li><b>Knock</b> when your deadwood is {config.knockMax} or less. Your opponent then lays off cards on your melds. You score the difference in deadwood.</li>
        <li><b>Gin</b> (no deadwood) scores {config.ginBonus} plus your opponent's deadwood, and they can't lay off. Big gin (all eleven cards after drawing) scores {config.bigGinBonus}.</li>
        <li><b>Undercut</b>: if their deadwood is equal to or lower than yours, they score {config.undercutBonus} plus the difference.</li>
        <li>If the stock is down to two cards, the hand is a draw.</li>
      </ul>
    </div>
  );
}

/** Your hand in display order: melds together, then deadwood low to high. */
function arrangeHand(view: GinView): Array<{ card: Card; meld: number | null }> {
  const out: Array<{ card: Card; meld: number | null }> = [];
  view.myMelds.forEach((m, i) => {
    const cs = m.kind === 'run' ? m.cards.slice().sort((a, b) => a.rank - b.rank) : m.cards;
    for (const c of cs) out.push({ card: c, meld: i });
  });
  for (const c of view.myDeadwood.slice().sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit))) out.push({ card: c, meld: null });
  return out;
}

function Group({ cards, dead, layoffIds = [] }: { cards: Card[]; dead?: boolean; layoffIds?: string[] }) {
  return (
    <span className={`sd-group ${dead ? 'is-dead' : ''}`}>
      {cards.map((c) => <CardFace key={c.id} card={c} size="34px" className={layoffIds.includes(c.id) ? 'is-layoff' : ''} />)}
    </span>
  );
}

function Showdown({ r, view, avatars }: { r: GinHandResult; view: GinView; avatars: AvatarConfig[] }) {
  const nm = (s: number) => (s === 0 ? 'You' : view.players[s].name.split(' ')[0]);
  if (r.end === 'draw') return <p className="lede">The stock ran out. No score this hand.</p>;
  const k = r.knocker!;
  const d = k === 0 ? 1 : 0;
  const sortRun = (m: Meld) => (m.kind === 'run' ? m.cards.slice().sort((a, b) => a.rank - b.rank) : m.cards);
  const verdict =
    r.end === 'gin' ? <>{nm(k)} went <b>gin</b>: {view.config.ginBonus} + {r.defenderValue} = <b>{r.points}</b></>
      : r.end === 'bigGin' ? <>{nm(k)} made <b>big gin</b>: {view.config.bigGinBonus} + {r.defenderValue} = <b>{r.points}</b></>
        : r.end === 'undercut' ? <><b>Undercut!</b> {nm(d)} scores {view.config.undercutBonus} + {r.knockerValue - r.defenderValue} = <b>{r.points}</b></>
          : <>{nm(k)} knocked: {r.defenderValue} − {r.knockerValue} = <b>{r.points}</b></>;
  return (
    <div className="showdown">
      {[k, d].map((s) => {
        const isK = s === k;
        const melds = isK ? r.knockerMelds : r.defenderMelds;
        const dead = isK ? r.knockerDeadwood : r.defenderDeadwood;
        const val = isK ? r.knockerValue : r.defenderValue;
        return (
          <div key={s} className="sd-player">
            <div className="sd-head">
              <Avatar config={avatars[s]} size={32} />
              <b>{nm(s)}</b>
              <small className="muted">{isK ? (r.end === 'knock' || r.end === 'undercut' ? 'knocked' : 'gin') : ''}</small>
              <span className="sd-dw">Deadwood <b>{val}</b></span>
            </div>
            <div className="sd-cards">
              {melds.map((m, i) => <Group key={i} cards={sortRun(m)} />)}
              {!isK && r.layoffs.length > 0 && <Group cards={r.layoffs} layoffIds={r.layoffs.map((c) => c.id)} />}
              {dead.length > 0 && <Group cards={dead} dead />}
            </div>
            {!isK && r.layoffs.length > 0 && <p className="sd-note">Laid off {r.layoffs.map(cardLabel).join(' ')} on {nm(k) === 'You' ? 'your' : `${nm(k)}'s`} melds.</p>}
          </div>
        );
      })}
      <p className="sd-verdict">{verdict}</p>
      <p className="sd-note" style={{ textAlign: 'center' }}>Score: {nm(0)} {r.scoresAfter[0]} · {nm(1)} {r.scoresAfter[1]} (to {view.config.target})</p>
    </div>
  );
}

export function GinTable({ setup, onExit, onRematch, onFinished }: {
  setup: GinMatchSetup; onExit: (forfeit: boolean) => void; onRematch: () => void; onFinished: (r: FinishReport) => Outcome;
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
  const opp = rosterById(setup.opponents[0])!;

  const seatInfo: SeatInfo[] = useMemo(() => [
    { playerId: 'me', name: profile?.name ?? 'You', isAI: false },
    { playerId: opp.id, name: opp.name, isAI: true, personality: aiPersonality(opp, 'gin') },
  ], []);
  const avatars: AvatarConfig[] = useMemo(() => [profile!.avatar, opp.avatar], []);
  const props = useMemo(() => seatProps(setup.opponents), []);

  const session: Session = useMemo(() => new LocalSession(GinModule as never, {
    config: setup.config,
    seats: seatInfo,
    humanSeat: 0,
    ai: ginAI as never,
    thinkDelay: (s: SeatInfo) => ginThinkMs(s.personality, { int: (n: number) => Math.floor(Math.random() * n), float: Math.random }) * (SPEED[store.get().settings.aiSpeed] ?? 1),
  }) as Session, []);

  const [view, setView] = useState<GinView>(() => session.getView());
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'rules' | 'scores' | 'leave' | 'hand' | 'final'>(null);
  const [gins, setGins] = useState(0);

  useEffect(() => {
    const unsub = session.subscribe(({ view: v, events }) => {
      setView(v);
      awardFeats(ginFeats(events));
      for (const e of events) {
        switch (e.type) {
          case 'drew':
            sfx.deal(1);
            if (e.seat !== 0 && e.source === 'discard' && e.card) toast(`${firstName(opp.name)} takes the ${cardLabel(e.card)}`, 'info');
            break;
          case 'discarded': sfx.card(); break;
          case 'upcardPassed': if (e.seat !== 0) toast(`${firstName(opp.name)} passes the upcard`, 'info'); break;
          case 'knocked':
            sfx.penalty();
            toast(e.seat === 0 ? (e.gin ? 'Gin!' : 'You knock') : `${firstName(opp.name)} ${e.gin ? 'goes gin!' : 'knocks'}`, e.gin ? 'good' : 'hot');
            break;
          case 'roundOver': {
            const w = e.result.winner;
            note(w === null ? `Hand ${e.result.hand}: the stock ran out, no score` : `Hand ${e.result.hand}: ${w === 0 ? 'you score' : `${firstName(opp.name)} scores`} ${e.result.points} (${e.result.end === 'bigGin' ? 'big gin' : e.result.end})`, w === 0 ? 'good' : 'info');
            if (w === 0 && (e.result.end === 'gin' || e.result.end === 'bigGin')) setGins((g: number) => g + 1);
            if (w === 1) { const r = aiReaction('won', v.players[1].personality, Math.random()); if (r) setTimeout(() => emote(1, r), 900); }
            if (w === 0) { const r = aiReaction('lost', v.players[1].personality, Math.random()); if (r) setTimeout(() => emote(1, r), 1100); }
            break;
          }
          case 'matchOver': if (e.placements[0] === 0) sfx.win(); break;
          case 'turn': if (e.seat === 0) sfx.turn(); break;
          default: break;
        }
      }
    });
    return () => { unsub(); session.dispose(); };
  }, [session]);

  useEffect(() => {
    if (view.phase === 'roundOver' || view.phase === 'matchOver') {
      const t = setTimeout(() => setSheet('hand'), reduced ? 300 : 1000);
      return () => clearTimeout(t);
    }
    if (sheet === 'hand' || sheet === 'final') setSheet(null);
    return undefined;
  }, [view.phase, view.hand]);

  useEffect(() => {
    if (view.phase !== 'matchOver' || recorded.current) return;
    recorded.current = true;
    const won = view.placements![0] === 0;
    store.recordGin({ won, handsWon: view.players[0].handsWon, gins: view.history.filter((h) => h.winner === 0 && (h.end === 'gin' || h.end === 'bigGin')).length });
    const o = onFinished({ ordered: view.placements!.map((s) => view.players[s].playerId), remaining: [] });
    setOutcome(o);
    if (o.won) setTimeout(() => setCelebrate(true), reduced ? 200 : 900);
  }, [view.phase]);

  useEffect(() => { setSelected(null); setError(null); }, [view.phase, view.current, view.hand]);

  const act = async (a: GinAction) => {
    setError(null);
    try { await session.act(a); } catch (e) { setError(e instanceof Error ? e.message : 'That move was not allowed.'); }
  };

  const me = view.players[0];
  const them = view.players[1];
  const myTurn = view.current === 0 && (view.phase === 'offer' || view.phase === 'draw' || view.phase === 'discard');
  const arranged = arrangeHand(view);
  const sel = view.myHand.find((c) => c.id === selected) ?? null;
  const target = view.config.target;
  const canDrawDiscard = myTurn && view.phase === 'draw' && !view.stockOnly && !!view.topDiscard;
  const canDrawStock = myTurn && view.phase === 'draw';
  const banned = view.takenFromDiscard;
  // Deadwood after discarding the selected card (11-card hands only).
  const dwAfter = sel && view.myHand.length === 11 ? bestArrangement(view.myHand.filter((c) => c.id !== sel.id)).deadwoodValue : null;
  const canKnockSel = !!sel && view.knockIds.includes(sel.id);

  const tapCard = (c: Card) => {
    if (!(myTurn && view.phase === 'discard')) {
      if (myTurn && view.phase === 'draw') setError('Draw first: tap the stock or the discard pile.');
      return;
    }
    if (c.id === banned) { setError("You can't throw back the card you just picked up."); return; }
    if (selected === c.id) { void act({ type: 'discard', cardId: c.id }); setSelected(null); }
    else { setSelected(c.id); setError(null); }
  };

  let status = '';
  if (view.phase === 'matchOver') status = view.placements![0] === 0 ? 'You win the match!' : `${firstName(opp.name)} wins the match`;
  else if (view.phase === 'roundOver') status = `Hand ${view.hand} is over`;
  else if (!myTurn) status = `${firstName(opp.name)} is thinking…`;
  else if (view.phase === 'offer') status = `Take the ${view.topDiscard ? cardLabel(view.topDiscard) : 'upcard'}, or pass?`;
  else if (view.phase === 'draw') status = view.stockOnly ? 'Draw from the stock' : 'Draw from the stock or take the discard';
  else if (view.canBigGin) status = 'Big gin! All eleven cards are in melds.';
  else if (view.knockIds.length) status = view.knockIds.some((id) => bestArrangement(view.myHand.filter((c) => c.id !== id)).deadwoodValue === 0) ? 'You can go gin! Pick the card to throw.' : 'You can knock: pick a card to throw.';
  else status = 'Choose a card to discard';

  return (
    <div className={`table-screen gin-table ${settings.cardSize === 'large' ? 'cards-lg' : ''} ${theme.className} ${reduced ? 'reduce-motion' : ''}`} style={theme.style}>
      <TableBar
        title={eventTitle(setup.kind, 'Gin')}
        sub={`Hand ${view.hand} · first to ${target}`}
        onLeave={() => setSheet('leave')} onScores={() => setSheet('scores')} onRules={() => setSheet('rules')}
        players={view.players} onEmote={emote}
      />

      <section className="stage gin-stage" aria-label="Card table">
        <div className="felt">
          <div className="felt-inner">
            <Toasts toasts={toasts} />
            <div className="piles gin-piles">
              <button className={`pile pile-btn ${canDrawStock ? 'is-live' : ''}`} disabled={!canDrawStock} onClick={() => act({ type: 'draw', source: 'stock' })} aria-label={`Stock, ${view.stockCount} cards${canDrawStock ? ', tap to draw' : ''}`}>
                <span className="stack">
                  {view.stockCount > 1 && <CardBack className="stack-2" />}
                  {view.stockCount > 0 ? <CardBack /> : <span className="pc pc-empty" />}
                </span>
                <span className="pile-label">{view.stockCount} in stock</span>
              </button>
              <button className={`pile pile-btn ${canDrawDiscard || (myTurn && view.phase === 'offer') ? 'is-live' : ''}`} disabled={!(canDrawDiscard || (myTurn && view.phase === 'offer'))}
                onClick={() => act(view.phase === 'offer' ? { type: 'takeUpcard' } : { type: 'draw', source: 'discard' })}
                aria-label={`Discard pile${view.topDiscard ? `, ${cardLabel(view.topDiscard)} on top` : ''}`}>
                <span className="stack">
                  {view.discards.length > 1 && <CardFace card={view.discards[view.discards.length - 2]} className="under" />}
                  {view.topDiscard ? <CardFace card={view.topDiscard} key={view.topDiscard.id + view.discardCount} className="landing" /> : <span className="pc pc-empty" />}
                </span>
                <span className="pile-label">{view.phase === 'offer' ? 'Upcard' : 'Discard'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className={`seat gseat ${view.current === 1 && myTurn === false && view.phase !== 'roundOver' && view.phase !== 'matchOver' ? 'is-active' : ''}`} aria-label={`${opp.name}, ${them.score} points`}>
          <SeatAvatar look={avatars[1]} size={46} name={opp.name} emote={emotes[1]} prop={props[1]}
            thinking={view.current === 1 && view.phase !== 'roundOver' && view.phase !== 'matchOver'} />
          <div className="seat-plate">
            <span className="seat-name">{firstName(opp.name)}</span>
            <span className="seat-meta"><b>{them.cardCount}</b></span>
            <span className="meter"><span style={{ width: `${Math.min(100, (them.score / target) * 100)}%` }} /></span>
            <span className="seat-pts">{them.score}<small>/{target}</small></span>
          </div>
          {them.pickups.length > 0 && <span className="took-pill" title="Cards they took from the discard pile">Took {them.pickups.slice(-4).map(cardLabel).join(' ')}</span>}
        </div>
      </section>

      <section className={`me ${myTurn ? 'is-turn' : ''}`} aria-label="Your seat">
        <div className="me-bar">
          <div className="me-id">
            <Avatar config={avatars[0]} size={40} title={me.name} /><SeatProp id={props[0]} />
            {emotes[0] && <EmoteBubble look={avatars[0]} pose={emotes[0]} />}
            <span>
              <b>{me.name}</b>
              <span className="meter"><span style={{ width: `${Math.min(100, (me.score / target) * 100)}%` }} /></span>
            </span>
          </div>
          <div className="me-scores">
            <span><small>Score</small><b>{me.score}</b></span>
            <span className={`dw-badge ${view.myDeadwoodValue <= view.config.knockMax ? 'is-low is-mult' : ''}`}>
              <small>Deadwood</small><b>{view.myDeadwoodValue}</b>
            </span>
          </div>
        </div>

        <p className={`status ${myTurn ? 'is-turn' : ''}`} role="status">{status}</p>
        {error && <p className="move-error" role="alert">{error}</p>}

        <div className="actions">
          {myTurn && view.phase === 'offer' && (
            <>
              <Button onClick={() => act({ type: 'takeUpcard' })}>Take {view.topDiscard ? cardLabel(view.topDiscard) : 'it'}</Button>
              <Button variant="ghost" onClick={() => act({ type: 'passUpcard' })}>Pass</Button>
            </>
          )}
          {myTurn && view.phase === 'draw' && (
            <>
              <Button variant={canDrawDiscard ? 'ghost' : 'brass'} onClick={() => act({ type: 'draw', source: 'stock' })}>Draw from stock</Button>
              {canDrawDiscard && <Button variant="ghost" onClick={() => act({ type: 'draw', source: 'discard' })}>Take {cardLabel(view.topDiscard!)}</Button>}
            </>
          )}
          {myTurn && view.phase === 'discard' && view.canBigGin && <Button onClick={() => act({ type: 'bigGin' })}>Big gin!</Button>}
          {myTurn && view.phase === 'discard' && sel && (
            <>
              {canKnockSel
                ? <Button onClick={() => act({ type: 'knock', cardId: sel.id })}>{dwAfter === 0 ? 'Gin!' : `Knock (${dwAfter})`}</Button>
                : null}
              <Button variant={canKnockSel ? 'ghost' : 'brass'} onClick={() => { void act({ type: 'discard', cardId: sel.id }); setSelected(null); }}>Discard {cardLabel(sel)}</Button>
            </>
          )}
        </div>

        <p className="legend" aria-hidden="true"><span><i />in a meld</span><span>Deadwood {view.myDeadwoodValue}{view.myHand.length === 11 ? ' (before discarding)' : ''}</span></p>
        <div className="hand gin-hand" style={{ '--n': arranged.length + view.myMelds.length * 0.45 }} key={`h${view.hand}`}>
          {arranged.map(({ card: c, meld }, i) => {
            const prev = arranged[i - 1];
            const gap = i > 0 && prev.meld !== meld;
            const canThrow = myTurn && view.phase === 'discard' && c.id !== banned;
            const knockable = myTurn && view.knockIds.includes(c.id);
            return (
              <React.Fragment key={c.id}>
                <button
                  className={`hand-card ${gap ? 'group-start' : ''} ${meld !== null ? 'is-melded' : 'is-dead'} ${canThrow ? (knockable ? 'is-playable' : '') : myTurn && view.phase === 'discard' ? 'is-dim' : ''} ${selected === c.id ? 'is-selected' : ''} ${view.lastDrawn === c.id ? 'is-drawn' : ''}`}
                  style={{ '--i': i }}
                  onClick={() => tapCard(c)}
                  onDoubleClick={() => canThrow && act({ type: 'discard', cardId: c.id })}
                  aria-label={`${cardLabel(c)}${meld !== null ? ', in a meld' : ', deadwood'}${knockable ? ', you can knock by throwing this' : ''}${selected === c.id ? ', selected' : ''}`}
                >
                  <CardFace card={c} />
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </section>

      <TableSide title={`Gin Rummy · first to ${target}`} log={log} rows={view.players.slice().sort((a, b) => b.score - a.score).map((p) => ({
        seat: p.seat, name: p.name, look: avatars[p.seat], value: String(p.score), me: p.seat === 0,
        sub: `${p.handsWon} hand${p.handsWon === 1 ? '' : 's'} won${p.seat === 0 ? ` · deadwood ${view.myDeadwoodValue}` : ''}`,
        active: view.current === p.seat && view.phase !== 'roundOver' && view.phase !== 'matchOver',
      }))} />

      {celebrate && (
        <CelebrationOverlay kind={getItem(wallet.table.celebration)?.kind ?? 'confetti'} look={avatars[0]} extras={myExtras}
          headline={outcome?.headline ?? 'You win!'} sub={outcome?.lines.find((l) => l.startsWith('+'))} onDone={() => setCelebrate(false)} />
      )}

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title="How Gin Rummy works"><GinRules config={view.config} /></Sheet>
      <Sheet open={sheet === 'scores'} onClose={() => setSheet(null)} title="Scores" wide>
        <div className="standings">
          <table>
            <thead><tr><th scope="col">Hand</th><th scope="col">Result</th><th scope="col" className="num">You</th><th scope="col" className="num">{firstName(opp.name)}</th></tr></thead>
            <tbody>
              {view.history.map((h) => (
                <tr key={h.hand}>
                  <td>{h.hand}</td>
                  <td>{h.end === 'draw' ? 'Draw' : `${h.winner === 0 ? 'You' : firstName(opp.name)} · ${h.end === 'bigGin' ? 'big gin' : h.end} +${h.points}`}</td>
                  <td className="num">{h.scoresAfter[0]}</td>
                  <td className="num">{h.scoresAfter[1]}</td>
                </tr>
              ))}
              {!view.history.length && <tr><td colSpan={4} className="muted">No hands finished yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Sheet>
      <LeaveSheet open={sheet === 'leave'} onClose={() => setSheet(null)} isEvent={isEvent} finished={!!outcome} onLeave={onExit} />

      <Sheet open={sheet === 'hand'} title={view.phase === 'matchOver' ? 'Final hand' : `Hand ${view.hand} result`} wide dismissable={false}>
        {view.history.length > 0 && <Showdown r={view.history[view.history.length - 1]} view={view} avatars={avatars} />}
        <div className="btn-row sticky-actions">
          {view.phase === 'roundOver' && <Button size="lg" onClick={() => { setSheet(null); void act({ type: 'nextRound' }); }}>Deal hand {view.hand + 1}</Button>}
          {view.phase === 'matchOver' && <Button size="lg" onClick={() => setSheet('final')}>Final score</Button>}
        </div>
      </Sheet>

      <MatchOverSheet
        open={sheet === 'final'}
        winnerLook={avatars[view.placements?.[0] ?? 0]}
        eyebrow={`First to ${target}`}
        headline={view.placements?.[0] === 0 ? 'You win!' : opp.name}
        sub={`${me.score} – ${them.score} · ${view.history.length} hands${gins ? ` · ${gins} gin${gins === 1 ? '' : 's'} for you` : ''}`}
        outcome={outcome} isEvent={isEvent} onRematch={onRematch} onExit={() => onExit(false)}
      />
    </div>
  );
}
