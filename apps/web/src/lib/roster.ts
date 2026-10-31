// The club's 25 AI members. Each has a playing style and a separate skill level
// for each game (0 = doesn't play that game). Skill decides how well the AI plays;
// ratings (in club.ts) then move with actual results.

import type { AvatarConfig } from '../design/Avatar.tsx';
import { MEMBER_LOOKS } from './look.ts';

export type Style = 'cautious' | 'aggressive' | 'unpredictable';
export type PersonalityId = Style | 'beginner' | 'expert';
export type GameId = 'take2' | 'poker' | 'hearts' | 'gin' | 'draw' | 'blackjack';
export const GAMES: GameId[] = ['take2', 'poker', 'hearts', 'gin', 'draw', 'blackjack'];
export const GAME_NAMES: Record<GameId, string> = { take2: 'Take 2', poker: "Hold'em", hearts: 'Hearts', gin: 'Gin Rummy', draw: 'Five-Card Draw', blackjack: 'Blackjack' };
/** How many players sit at a table of each game (including you). */
export const TABLE_SIZE: Record<GameId, [number, number]> = { take2: [2, 6], poker: [2, 9], hearts: [4, 4], gin: [2, 2], draw: [2, 6], blackjack: [2, 5] };
/** Two-player games run their Cup as a knockout; the rest use heats of four. */
export const isHeadsUpGame = (g: GameId) => TABLE_SIZE[g][1] === 2;
/** A blank record for every game. */
export const perGame = <T,>(make: (g: GameId) => T): Record<GameId, T> => Object.fromEntries(GAMES.map((g) => [g, make(g)])) as Record<GameId, T>;

export interface AICharacter {
  id: string;
  name: string;
  style: Style;
  skill: Record<GameId, number>;
  tagline: string;
  avatar: AvatarConfig;
}

/** Legacy head-only description; replaced by MEMBER_LOOKS at load. */
const av = (skin: string, hair: string, hairColor: string, outfit: string, accessory: string, backdrop: string): AvatarConfig =>
  ({ skin, hair, hairColor, outfit, accessory, backdrop }) as unknown as AvatarConfig;

export const ROSTER: AICharacter[] = [
  { id: 'mags', name: 'Mags Delaney', style: 'cautious', skill: { take2: 62, poker: 88, hearts: 80, gin: 72, draw: 80, blackjack: 50 }, tagline: 'Runs the Thursday game. Never in a hurry.', avatar: av('#e6b48f', 'bun', '#b8b2a6', '#1f4a3b', 'glasses', '#2a3a33') },
  { id: 'rocco', name: 'Rocco Vance', style: 'aggressive', skill: { take2: 70, poker: 74, hearts: 40, gin: 0, draw: 70, blackjack: 66 }, tagline: 'Plays every hand like it owes him money.', avatar: av('#c98d63', 'slick', '#1d1612', '#5b1f2a', 'shades', '#3d2226') },
  { id: 'pip', name: 'Pip Okafor', style: 'unpredictable', skill: { take2: 84, poker: 55, hearts: 66, gin: 45, draw: 50, blackjack: 70 }, tagline: 'Nobody knows what Pip will do. Including Pip.', avatar: av('#4f2f1c', 'curly', '#1d1612', '#3a2c4f', 'earring', '#33293d') },
  { id: 'juniper', name: 'Juniper Bell', style: 'cautious', skill: { take2: 28, poker: 22, hearts: 26, gin: 30, draw: 25, blackjack: 30 }, tagline: 'First month at the club. Very polite.', avatar: av('#f3d2b3', 'long', '#c99a4e', '#2f3e66', 'none', '#22303d') },
  { id: 'silas', name: 'Silas Crane', style: 'cautious', skill: { take2: 77, poker: 68, hearts: 74, gin: 88, draw: 72, blackjack: 82 }, tagline: 'Counts every point twice.', avatar: av('#a8693f', 'bald', '#1d1612', '#24282e', 'glasses', '#3d2f1f') },
  { id: 'dot', name: 'Dot Marchetti', style: 'aggressive', skill: { take2: 81, poker: 40, hearts: 70, gin: 50, draw: 45, blackjack: 58 }, tagline: 'Will skip you and smile about it.', avatar: av('#e6b48f', 'short', '#8d2f23', '#5a4632', 'earring', '#3b2b22') },
  { id: 'teddy', name: 'Teddy Okoro', style: 'aggressive', skill: { take2: 45, poker: 79, hearts: 0, gin: 58, draw: 66, blackjack: 72 }, tagline: 'Raises first, asks questions never.', avatar: av('#7d4a2b', 'short', '#1d1612', '#1f4a3b', 'none', '#2a3a33') },
  { id: 'lena', name: 'Lena Fairweather', style: 'unpredictable', skill: { take2: 58, poker: 71, hearts: 62, gin: 66, draw: 64, blackjack: 55 }, tagline: 'Hums when she bluffs. Or does she?', avatar: av('#f3d2b3', 'curly', '#8d2f23', '#3a2c4f', 'glasses', '#33293d') },
  { id: 'frank', name: 'Frank Mulvaney', style: 'cautious', skill: { take2: 66, poker: 0, hearts: 54, gin: 79, draw: 58, blackjack: 0 }, tagline: "Won't touch poker. Take 2 and gin, all night.", avatar: av('#e6b48f', 'bald', '#b8b2a6', '#5a4632', 'glasses', '#3d2f1f') },
  { id: 'ines', name: 'Inés Valcárcel', style: 'aggressive', skill: { take2: 52, poker: 86, hearts: 58, gin: 0, draw: 74, blackjack: 88 }, tagline: 'Former casino dealer. Knows every tell.', avatar: av('#c98d63', 'long', '#1d1612', '#5b1f2a', 'earring', '#3d2226') },
  { id: 'wes', name: 'Wes Hartigan', style: 'unpredictable', skill: { take2: 38, poker: 47, hearts: 30, gin: 42, draw: 48, blackjack: 60 }, tagline: 'Talks a big game. Sometimes backs it up.', avatar: av('#f3d2b3', 'slick', '#c99a4e', '#2f3e66', 'shades', '#22303d') },
  { id: 'priya', name: 'Priya Nandakumar', style: 'cautious', skill: { take2: 74, poker: 76, hearts: 86, gin: 70, draw: 70, blackjack: 75 }, tagline: 'Keeps a notebook on everyone.', avatar: av('#a8693f', 'bun', '#1d1612', '#1f4a3b', 'glasses', '#2a3a33') },
  { id: 'gus', name: 'Gus Abernethy', style: 'aggressive', skill: { take2: 33, poker: 61, hearts: 45, gin: 34, draw: 55, blackjack: 64 }, tagline: 'Loud, cheerful, owes the bar a fortune.', avatar: av('#e6b48f', 'curly', '#8a5a2b', '#5a4632', 'none', '#3b2b22') },
  { id: 'mei', name: 'Mei Tanaka', style: 'cautious', skill: { take2: 90, poker: 58, hearts: 60, gin: 52, draw: 0, blackjack: 45 }, tagline: 'Three-time Take 2 champion. Allegedly.', avatar: av('#f3d2b3', 'short', '#1d1612', '#24282e', 'none', '#22303d') },
  { id: 'otis', name: 'Otis Blackwood', style: 'unpredictable', skill: { take2: 0, poker: 83, hearts: 0, gin: 0, draw: 77, blackjack: 68 }, tagline: 'Only comes in for the poker. Nothing else.', avatar: av('#4f2f1c', 'bald', '#1d1612', '#24282e', 'shades', '#3d2226') },
  { id: 'rosa', name: 'Rosa Quintero', style: 'aggressive', skill: { take2: 68, poker: 64, hearts: 68, gin: 61, draw: 0, blackjack: 62 }, tagline: 'Plays fast. Expects you to keep up.', avatar: av('#c98d63', 'curly', '#4a2e1c', '#3a2c4f', 'earring', '#33293d') },
  { id: 'nigel', name: 'Nigel Pembroke', style: 'cautious', skill: { take2: 24, poker: 35, hearts: 33, gin: 47, draw: 38, blackjack: 40 }, tagline: 'Has read every book. Still learning.', avatar: av('#f3d2b3', 'short', '#b8b2a6', '#2f3e66', 'glasses', '#22303d') },
  { id: 'ama', name: 'Ama Boateng', style: 'unpredictable', skill: { take2: 72, poker: 50, hearts: 71, gin: 38, draw: 52, blackjack: 57 }, tagline: 'Never plays the same way twice.', avatar: av('#7d4a2b', 'bun', '#1d1612', '#1f4a3b', 'earring', '#2a3a33') },
  { id: 'declan', name: 'Declan Foyle', style: 'aggressive', skill: { take2: 56, poker: 33, hearts: 28, gin: 0, draw: 40, blackjack: 74 }, tagline: 'All in is a lifestyle.', avatar: av('#e6b48f', 'slick', '#8d2f23', '#5b1f2a', 'none', '#3d2226') },
  { id: 'hattie', name: 'Hattie Byrne', style: 'cautious', skill: { take2: 48, poker: 44, hearts: 64, gin: 81, draw: 0, blackjack: 35 }, tagline: 'Retired schoolteacher. Takes no nonsense.', avatar: av('#f3d2b3', 'bun', '#b8b2a6', '#5a4632', 'glasses', '#3b2b22') },
  { id: 'kofi', name: 'Kofi Mensah', style: 'cautious', skill: { take2: 60, poker: 80, hearts: 52, gin: 63, draw: 76, blackjack: 0 }, tagline: 'Quiet. Then suddenly all your chips are his.', avatar: av('#4f2f1c', 'short', '#1d1612', '#24282e', 'none', '#2a3a33') },
  { id: 'bea', name: 'Bea Lindqvist', style: 'unpredictable', skill: { take2: 42, poker: 0, hearts: 57, gin: 0, draw: 0, blackjack: 52 }, tagline: 'Here for Take 2 and the gossip.', avatar: av('#f3d2b3', 'long', '#c99a4e', '#3a2c4f', 'none', '#33293d') },
  { id: 'marcus', name: 'Marcus Hale', style: 'aggressive', skill: { take2: 64, poker: 70, hearts: 49, gin: 55, draw: 62, blackjack: 66 }, tagline: 'Wants your title. Says so often.', avatar: av('#a8693f', 'slick', '#1d1612', '#2f3e66', 'shades', '#22303d') },
  { id: 'sal', name: 'Sal Ferrante', style: 'cautious', skill: { take2: 0, poker: 66, hearts: 0, gin: 84, draw: 85, blackjack: 0 }, tagline: 'Has played the same chair since 1994.', avatar: av('#c98d63', 'bald', '#b8b2a6', '#5b1f2a', 'glasses', '#3d2226') },
  { id: 'tilly', name: 'Tilly Garnett', style: 'unpredictable', skill: { take2: 31, poker: 28, hearts: 41, gin: 29, draw: 30, blackjack: 48 }, tagline: 'Plays for fun. Wins more than she should.', avatar: av('#e6b48f', 'curly', '#c99a4e', '#1f4a3b', 'glasses', '#2a3a33') },
];

// Members now have full-body looks (the avatar fields above are kept for history).
for (const c of ROSTER) if (MEMBER_LOOKS[c.id]) c.avatar = MEMBER_LOOKS[c.id];

/** People at an online table (friends and family), looked up like members so the table screens work unchanged. */
export const GUESTS = new Map<string, AICharacter>();
export const rosterById = (id: string) => ROSTER.find((c) => c.id === id) ?? GUESTS.get(id);

export const playsGame = (c: AICharacter, game: GameId) => c.skill[game] > 0;

/** Which AI behaviour a member uses in a game: novices play like beginners, the best like experts. */
export function aiPersonality(c: AICharacter, game: GameId): PersonalityId {
  const s = c.skill[game];
  if (s < 35) return 'beginner';
  if (s >= 78) return 'expert';
  return c.style;
}

export const STYLE_LABEL: Record<Style, string> = { cautious: 'Careful', aggressive: 'Aggressive', unpredictable: 'Unpredictable' };

export function skillLabel(s: number): string {
  if (s === 0) return "Doesn't play";
  if (s < 35) return 'Novice';
  if (s < 55) return 'Regular';
  if (s < 78) return 'Strong';
  return 'Expert';
}
