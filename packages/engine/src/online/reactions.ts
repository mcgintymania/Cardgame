// Quick phrases and emotes, shared by the app and the server. Online, only these
// exact phrases can be sent (no free text), so nobody can type abuse at a table.

export const PHRASES = [
  'Well played', 'Nice hand', 'You were lucky', 'Good game', 'Unlucky', 'Easy!',
  'Ouch', 'Come on…', 'Hurry up!', 'Thanks', 'Sorry!', 'Not again', 'Rematch?',
];

export const REPLIES: Record<string, string[]> = {
  'Well played': ['Thanks', 'Cheers', 'You too'],
  'Nice hand': ['Thanks', 'Cheers', 'Had to be done'],
  'Good game': ['Good game', 'Cheers', 'Rematch?'],
  'You were lucky': ['Skill, pure skill', 'Luck? Please.', "I'll take it"],
  Unlucky: ['Next time', 'Story of my life', 'Cheers'],
  'Easy!': ['Steady on', "We'll see", 'Big talk'],
  Ouch: ['Ha!', 'Sorry, not sorry', 'Brutal'],
  'Come on…': ['Relax', 'Patience', 'Your turn will come'],
  'Hurry up!': ["I'm thinking!", 'Patience…', 'Good things take time'],
  Thanks: ['No problem', 'Any time'],
  'Sorry!': ['No worries', 'Hmm…'],
  'Not again': ['Oh yes', 'Afraid so', 'Ha!'],
  'Rematch?': ["You're on", 'Go on then', 'Deal them'],
};
export const WIN_LINES = ["Read 'em and weep", 'Too good', 'Lovely', 'Pay up', "That'll do"];
export const KO_LINES = ['Not my day', 'Unlucky me', "I'll be back", 'Well played, all'];
export const LOSE_LINES = ['Unlucky', 'Fair enough', 'Next time'];

const SAYABLE = new Set([...PHRASES, ...Object.values(REPLIES).flat(), ...WIN_LINES, ...KO_LINES, ...LOSE_LINES]);

/** A reaction someone may send online: a known phrase ('say:…') or an emote name. */
export function validReaction(r: unknown): r is string {
  if (typeof r !== 'string' || r.length > 40) return false;
  if (r.startsWith('say:')) return SAYABLE.has(r.slice(4));
  return /^[a-z]{2,16}$/.test(r);
}

/** What the server keeps for the table to show: the last few reactions. */
export interface TableReaction { id: string; seat: number; r: string; by: number; at: number }
export const REACTIONS_KEEP = 8;
