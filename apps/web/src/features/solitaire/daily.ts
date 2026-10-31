// The Daily Deal: one shuffle per day for everyone, and club members' times to beat.
// Members' times are made up from their skill and the date (local mode); online,
// these will be real players' results.

import { ROSTER, GAMES } from '../../lib/roster.ts';
import type { Look } from '../../design/Character.tsx';
import { store, type SolitaireStats } from '../../lib/store.ts';

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dailySeed = (d = new Date()) => Number(todayKey(d).replace(/-/g, ''));

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export interface DailyRow { id: string; name: string; look: Look; time: number | null; moves: number | null; me: boolean }

export function dailyBoard(myName: string, mine: SolitaireStats['daily'], d = new Date()): DailyRow[] {
  const key = todayKey(d);
  const players = ROSTER.filter((m) => hash(key + m.id) < 0.32).slice(0, 7);
  const rows: DailyRow[] = players.map((m) => {
    const skills = GAMES.map((g) => m.skill[g]).filter((x) => x > 0);
    const avg = skills.reduce((a, b) => a + b, 0) / Math.max(1, skills.length);
    const r = hash(key + m.id + 't');
    const solved = r > 0.18 - avg / 1000;
    const time = Math.round(150 + (100 - avg) * 3.2 + r * 160);
    return { id: m.id, name: m.name.split(' ')[0], look: m.avatar, time: solved ? time : null, moves: solved ? Math.round(95 + r * 70 + (100 - avg) / 2) : null, me: false };
  });
  const today = mine && mine.date === key ? mine : null;
  rows.push({ id: 'me', name: myName, look: store.get().profile?.avatar ?? players[0]?.avatar, time: today?.won ? today.time : null, moves: today?.won ? today.moves : null, me: true });
  return rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
}
