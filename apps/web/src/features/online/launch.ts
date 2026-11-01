// Turns an online room into the setup a table screen needs: everyone placed
// relative to you (you're always at the bottom), friends registered as guests
// so their names and looks appear, and the RemoteSession that talks to the server.

import { GUESTS, ROSTER, type AICharacter } from '../../lib/roster.ts';
import { migrateLook } from '../../lib/look.ts';
import { RemoteSession, forgetNames, myView, roomInfo, type PlayerViewData } from '../../lib/online/tables.ts';
import { OnlineError } from '../../lib/online/client.ts';
import type { Outcome } from '../../lib/club.ts';
import { ordinal } from '../../lib/club.ts';
import { POKER_PRESETS } from '../poker/Setup.tsx';

export interface OnlineTable {
  game: PlayerViewData['game'];
  roomId: string;
  session: RemoteSession;
  setup: { config: Record<string, unknown>; opponents: string[]; kind: 'casual'; remote: RemoteSession; roomId: string };
}

const skills0 = { take2: 0, poker: 0, hearts: 0, gin: 0, draw: 0, blackjack: 0 };

export async function openOnlineTable(roomId: string): Promise<OnlineTable> {
  const row = await myView(roomId);
  if (!row) throw new OnlineError("The game hasn't started yet.");
  forgetNames(); // fresh looks for the table
  const info = await roomInfo(roomId);
  const d = row.view;
  // Local seat i = real seat (mySeat + i) % n.
  const opponents: string[] = [];
  for (let i = 1; i < d.n; i++) {
    const s = d.seats[(d.seat + i) % d.n];
    if (s.kind === 'ai' && s.aiKey && ROSTER.some((c) => c.id === s.aiKey)) { opponents.push(s.aiKey); continue; }
    // A person (or a person whose seat an AI member is finishing): show them as themselves.
    const id = `u:${s.userId ?? `seat${i}`}`;
    const look = s.userId ? info?.names[s.userId]?.look : undefined;
    const guest: AICharacter = { id, name: s.name, style: 'cautious', skill: { ...skills0 }, tagline: 'Club member', avatar: migrateLook(look && typeof look === 'object' && 'v' in (look as object) ? look : undefined) };
    GUESTS.set(id, guest);
    opponents.push(id);
  }
  const rules = (info?.room.config.rules ?? {}) as Record<string, unknown>;
  const config = d.game === 'draw' ? { ...POKER_PRESETS.tournament.config, ...rules, variant: 'draw' } : d.game === 'poker' ? { ...POKER_PRESETS.tournament.config, ...rules, variant: 'holdem' } : rules;
  const session = new RemoteSession(roomId, row.version, d);
  return { game: d.game, roomId, session, setup: { config, opponents, kind: 'casual', remote: session, roomId } };
}

/** The result screen for an online game, from what the server recorded. */
export function onlineOutcome(t: OnlineTable): Outcome {
  const d = t.session.info;
  const mine = d.result?.find((r) => r.seat === d.seat);
  if (!mine) {
    return { headline: 'The table plays on', lines: ["Your result is saved to the online club when the game finishes. You can leave: a club member keeps your seat warm."], tone: 'info', ratingChange: 0, won: false };
  }
  const change = mine.ratingAfter - mine.ratingBefore;
  const won = mine.place === 1;
  return {
    headline: won ? 'You won!' : `You finished ${ordinal(mine.place)}`,
    lines: [
      `Online rating ${mine.ratingBefore} → ${mine.ratingAfter} (${change >= 0 ? '+' : ''}${change})`,
      `+${mine.coins} coins · +${mine.xp} XP (added to your wallet)`,
      'Recorded in the online club: rankings, head-to-heads and news.',
    ],
    tone: won ? 'good' : 'info',
    ratingChange: change,
    won,
  };
}
