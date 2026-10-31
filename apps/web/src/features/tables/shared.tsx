// Pieces shared by the Hearts and Gin tables (Take 2 and poker have their own older copies).

import { onlineTableNow } from '../../lib/online/tables.ts';
import React, { useEffect, useRef, useState } from 'react';
import { Avatar, type AvatarConfig } from '../../design/Avatar.tsx';
import { Button, Sheet, Tag } from '../../design/ui.tsx';
import { store, useStore } from '../../lib/store.ts';
import { EmoteBubble, EmoteMenu, reactAtTable, type Reaction } from './Emotes.tsx';
import type { MatchKind, Outcome } from '../../lib/club.ts';
import { OutcomeCard } from '../club/bits.tsx';
import { SeatProp } from '../../design/Props.tsx';
import { SeatFigure } from './SeatFigure.tsx';
import { MEMBER_PROPS } from '../../lib/look.ts';
import { currentSeason } from '../../lib/useSeason.ts';
export { SeatProp };

/** Table props by seat: yours at seat 0, then each member's. */
export const seatProps = (opponents: string[]): Array<string | undefined> => {
  // In season, about half the members swap their usual prop for a seasonal one.
  const season = currentSeason();
  const pick = (id: string) => {
    const h = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    return season && h % 2 === 0 ? season.memberProps[h % season.memberProps.length] : MEMBER_PROPS[id];
  };
  return [store.get().wallet.table.prop, ...opponents.map(pick)];
};
import { EndButtons } from '../take2/Table.tsx';

export interface Toast { id: number; text: string; tone: 'info' | 'hot' | 'good' }
let uid = 1;

export interface LogLine { id: number; text: string; tone: Toast['tone'] }

/** Toasts float over the felt for a moment; every toast (and quieter notes) also goes into the table log. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const note = (text: string, tone: Toast['tone'] = 'info') => {
    setLog((l: LogLine[]) => (l.length && l[0].text === text ? l : [{ id: uid++, text, tone }, ...l].slice(0, 60)));
  };
  const toast = (text: string, tone: Toast['tone'] = 'info') => {
    const t = { id: uid++, text, tone };
    setToasts((ts: Toast[]) => (ts.length && ts[ts.length - 1].text === text ? ts : [...ts.slice(-1), t]));
    setTimeout(() => setToasts((ts: Toast[]) => ts.filter((x) => x.id !== t.id)), 2200);
    note(text, tone);
  };
  return { toasts, toast, note, log };
}

export interface SideRow { seat: number; name: string; look: AvatarConfig; value: string; sub?: string; active?: boolean; out?: boolean; me?: boolean }

/** Big screens only: who's at the table and what just happened. Hidden on phones and tablets by CSS. */
export function TableSide({ title, rows, log, children }: { title: string; rows: SideRow[]; log: LogLine[]; children?: React.ReactNode }) {
  return (
    <aside className="table-side" aria-label="Table information">
      <section className="ts-block">
        <h2 className="ts-h">{title}</h2>
        <ol className="ts-rows">
          {rows.map((r) => (
            <li key={r.seat} className={`ts-row ${r.active ? 'is-active' : ''} ${r.out ? 'is-out' : ''} ${r.me ? 'is-me' : ''}`}>
              <Avatar config={r.look} size={36} />
              <span className="ts-name"><b>{r.me ? 'You' : r.name}</b>{r.sub && <small>{r.sub}</small>}</span>
              <span className="ts-val">{r.value}</span>
            </li>
          ))}
        </ol>
      </section>
      {children}
      <section className="ts-block ts-log-block">
        <h2 className="ts-h">At the table</h2>
        <ul className="ts-log" aria-live="off">
          {log.length === 0 && <li className="muted">The game's story will appear here.</li>}
          {log.map((l) => <li key={l.id} className={`ts-log-${l.tone}`}>{l.text}</li>)}
        </ul>
      </section>
    </aside>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
    </div>
  );
}

export const SPEED: Record<string, number> = { relaxed: 1.6, normal: 1, fast: 0.45 };
export const firstName = (n: string) => n.split(' ')[0];

export function eventTitle(kind: MatchKind, game: string) {
  return kind === 'title' ? 'Title match' : kind === 'cupHeat' ? 'Club Cup' : kind === 'cupFinal' ? 'Cup final' : game;
}

export function TableBar({ title, sub, onLeave, onScores, onRules, players, onEmote }: {
  title: string; sub: string; onLeave: () => void; onScores: () => void; onRules: () => void;
  players: Array<{ seat: number; personality?: string }>;
  onEmote: (seat: number, r: Reaction) => void;
}) {
  const { settings } = useStore();
  return (
    <header className="table-bar">
      <button className="icon-btn" onClick={onLeave} aria-label="Leave table">‹</button>
      <div className="table-title">
        <span className="display">{title}</span>
        <small>{sub}</small>
      </div>
      <div className="table-tools">
        <EmoteMenu onPick={(r) => reactAtTable(r, players, onEmote)} />
        <button className="icon-btn" onClick={onScores} aria-label="Scores">≡</button>
        <button className="icon-btn" onClick={onRules} aria-label="Rules">?</button>
        <button className="icon-btn" onClick={() => store.setSettings({ sound: !settings.sound })} aria-label={settings.sound ? 'Mute sound' : 'Turn sound on'} aria-pressed={settings.sound}>
          {settings.sound ? '♪' : '–'}
        </button>
      </div>
    </header>
  );
}

export function LeaveSheet({ open, onClose, isEvent, finished, onLeave }: { open: boolean; onClose: () => void; isEvent: boolean; finished: boolean; onLeave: (forfeit: boolean) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Leave the table?">
      <p className="muted">{isEvent && !finished ? 'This is a club event: leaving now counts as finishing last.' : "This practice match will be abandoned and won't count in your stats."}</p>
      <div className="btn-row">
        <Button variant="danger" onClick={() => onLeave(isEvent && !finished)}>Leave table</Button>
        <Button variant="ghost" onClick={onClose}>Keep playing</Button>
      </div>
    </Sheet>
  );
}

export function MatchOverSheet({ open, winnerLook, eyebrow, headline, sub, outcome, isEvent, onRematch, onExit, children }: {
  open: boolean; winnerLook: AvatarConfig; eyebrow: string; headline: string; sub: string; outcome: Outcome | null;
  isEvent: boolean; onRematch: () => void; onExit: () => void; children?: React.ReactNode;
}) {
  return (
    <Sheet open={open} title="Match over" wide dismissable={false}>
      <div className="winner">
        <div className="spotlight"><Avatar config={winnerLook} size={110} /></div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display h-lg">{headline}</h2>
        <p className="muted">{sub}</p>
      </div>
      {outcome && <OutcomeCard outcome={outcome} />}
      {children}
      <EndButtons isEvent={isEvent} onRematch={onRematch} onExit={onExit} />
      <p className="fine"><Tag>Club</Tag> {onlineTableNow() ? "Ratings and records saved to the online club." : "Ratings and records saved on this device."}</p>
    </Sheet>
  );
}

/** A seat's avatar with its "thinking" dots and emote bubble. */
export function SeatAvatar({ look, size, thinking, emote, name, prop, chips }: { look: AvatarConfig; size: number; thinking?: boolean; emote?: Reaction; name: string; prop?: string; chips?: number | null }) {
  const big = useBigScreen();
  if (big) return <div className="seat-avatar is-figure" title={name}><SeatFigure look={look} reaction={emote} thinking={thinking} prop={prop} chips={chips} /></div>;
  return (
    <div className="seat-avatar">
      <Avatar config={look} size={size} title={name} />
      <SeatProp id={prop} />
      {thinking && <span className="think" aria-hidden="true"><i /><i /><i /></span>}
      {emote && <EmoteBubble look={look} pose={emote} />}
    </div>
  );
}

/** Keeps a ref in sync with the latest value (for event handlers set up once). */
export function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

/** True on laptops and desktops (matches the BIG SCREENS block in styles.css). */
export function useBigScreen(): boolean {
  const q = '(min-width: 1024px) and (min-height: 640px)';
  const get = () => { try { return window.matchMedia(q).matches; } catch { return false; } };
  const [big, setBig] = useState(get);
  useEffect(() => {
    let m: MediaQueryList | null = null;
    try { m = window.matchMedia(q); } catch { return undefined; }
    const on = () => setBig(m!.matches);
    m.addEventListener?.('change', on);
    return () => m!.removeEventListener?.('change', on);
  }, []);
  return big;
}
