// Reactions at the table: emotes (your character does a move) and quick phrases
// (a speech bubble). Members react to the game and reply to you now and then.

import React, { useEffect, useRef, useState } from 'react';
import { Character, type Look, type Pose } from '../../design/Character.tsx';
import { CATALOGUE } from '../../lib/catalogue.ts';
import { useStore } from '../../lib/store.ts';

/** An emote pose, or a phrase as 'say:<text>'. */
export type Reaction = Pose | `say:${string}`;
export const isSay = (r: Reaction | undefined | null): r is `say:${string}` => typeof r === 'string' && r.startsWith('say:');
export const sayText = (r: string) => r.slice(4);
/** The pose for a seated figure: phrases don't move the character. */
export const poseOf = (r: Reaction | undefined): Pose | undefined => (r && !isSay(r) ? r : undefined);

import { KO_LINES, LOSE_LINES, PHRASES, REPLIES, WIN_LINES } from '../../../../../packages/engine/src/online/reactions.ts';
import { onlineTableNow } from '../../lib/online/tables.ts';
export { PHRASES };

export function useEmotes() {
  const [active, setActive] = useState<Record<number, Reaction>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const show = (seat: number, r: Reaction) => {
    clearTimeout(timers.current[seat]);
    setActive((a: Record<number, Reaction>) => ({ ...a, [seat]: r }));
    timers.current[seat] = setTimeout(() => setActive((a: Record<number, Reaction>) => { const n = { ...a }; delete n[seat]; return n; }), isSay(r) ? 3000 : 2600);
  };
  // Online: what other people at the table say and do arrives from the server.
  const remote = onlineTableNow();
  useEffect(() => (remote ? remote.onReaction(show) : undefined), [remote]);
  const emote = (seat: number, r: Reaction) => {
    // Online, the table's own automatic lines are only for club members, never
    // put in a real person's mouth (they speak for themselves).
    if (remote && seat !== 0 && remote.isPersonAt(seat)) return;
    show(seat, r);
  };
  return { active, emote };
}

/** Above a seat: the character doing the emote, or the phrase in a speech bubble. */
export function EmoteBubble({ look, pose }: { look: Look; pose: Reaction }) {
  if (isSay(pose)) return <span className="say-bubble" role="status">{sayText(pose)}</span>;
  return (
    <span className="emote-bubble" aria-label={`Emote: ${pose}`}>
      <Character look={look} pose={pose} animate width="100%" height="100%" noShadow />
    </span>
  );
}

export function EmoteMenu({ onPick, disabled }: { onPick: (r: Reaction) => void; disabled?: boolean }) {
  const { wallet } = useStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'say' | 'emote'>('say');
  const owned = CATALOGUE.filter((i) => i.slot === 'emote' && wallet.owned.includes(i.id));
  const pick = (r: Reaction) => { onPick(r); setOpen(false); };
  return (
    <span className="emote-menu">
      <button className="icon-btn" aria-label="Say something or emote" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o: boolean) => !o)}>☺</button>
      {open && (
        <span className="emote-pop" role="menu">
          <span className="emote-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'say'} className={tab === 'say' ? 'is-on' : ''} onClick={() => setTab('say')}>Say</button>
            <button role="tab" aria-selected={tab === 'emote'} className={tab === 'emote' ? 'is-on' : ''} onClick={() => setTab('emote')}>Emotes</button>
          </span>
          {tab === 'say'
            ? <span className="phrase-grid">{PHRASES.map((t) => <button key={t} role="menuitem" className="phrase-opt" onClick={() => pick(`say:${t}`)}>{t}</button>)}</span>
            : owned.map((e) => <button key={e.id} role="menuitem" className="emote-opt" onClick={() => pick(e.kind as Pose)}>{e.name}</button>)}
        </span>
      )}
    </span>
  );
}

const pickOf = <T,>(xs: T[], roll: number) => xs[Math.min(xs.length - 1, Math.floor(roll * xs.length))];

/** How a member might react. Returns null most of the time so it stays charming, not spammy. */
export function aiReaction(trigger: 'won' | 'lost' | 'reply' | 'ko', style: string | undefined, roll: number, to?: Reaction): Reaction | null {
  const chatty = style === 'aggressive' || style === 'unpredictable' ? 1.5 : 1;
  const r2 = Math.random();
  switch (trigger) {
    case 'won':
      if (roll < 0.2 * chatty) return `say:${pickOf(WIN_LINES, r2)}`;
      return roll < 0.45 * chatty ? (style === 'aggressive' ? 'fistpump' : style === 'cautious' ? 'tiphat' : 'cheer') : null;
    case 'ko':
      if (roll < 0.3) return `say:${pickOf(KO_LINES, r2)}`;
      return roll < 0.55 ? 'facepalm' : roll < 0.65 ? 'shrug' : null;
    case 'lost':
      if (roll < 0.1 * chatty) return `say:${pickOf(LOSE_LINES, r2)}`;
      return roll < 0.2 * chatty ? 'shrug' : null;
    case 'reply':
      if (to && isSay(to)) {
        const lines = REPLIES[sayText(to)];
        return roll < 0.75 && lines ? `say:${pickOf(lines, r2)}` : null;
      }
      return roll < 0.45 ? (roll < 0.2 ? 'wave' : roll < 0.35 ? 'thumbs' : 'tiphat') : null;
  }
}

/** You react; someone at the table may answer. */
export function reactAtTable(r: Reaction, players: Array<{ seat: number; personality?: string }>, emote: (seat: number, r: Reaction) => void) {
  emote(0, r);
  const remote = onlineTableNow();
  // Online, only club members answer automatically; your brothers answer for themselves.
  const others = players.filter((p) => p.seat !== 0 && !(remote && remote.isPersonAt(p.seat)));
  const o = others[Math.floor(Math.random() * others.length)];
  const reply = o ? aiReaction('reply', o.personality, Math.random(), r) : null;
  remote?.react(r, o && reply ? { seat: o.seat, r: reply } : undefined);
  if (o && reply) setTimeout(() => emote(o.seat, reply), isSay(r) ? 1300 : 900);
}
