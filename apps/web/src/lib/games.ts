// Which games appear in the app. Hidden games disappear everywhere you'd see them
// (menus, game rooms, champions, rankings, news, trophies and stats) but their
// history is kept, so switching one back on brings everything back.

import { useStore } from './store.ts';
import { GAMES, type GameId } from './roster.ts';

export type ShownId = GameId | 'solitaire' | 'pyramid';

export const ALL_SHOWN: Array<{ id: ShownId; name: string; blurb: string }> = [
  { id: 'take2', name: 'Take 2', blurb: 'The house game' },
  { id: 'poker', name: "Texas Hold'em", blurb: 'No-limit poker' },
  { id: 'hearts', name: 'Hearts', blurb: 'Four-player tricks' },
  { id: 'gin', name: 'Gin Rummy', blurb: 'One on one' },
  { id: 'draw', name: 'Five-Card Draw', blurb: 'Classic draw poker' },
  { id: 'blackjack', name: 'Blackjack', blurb: 'Tournament vs the dealer' },
  { id: 'solitaire', name: 'Solitaire', blurb: 'Klondike and the Daily Deal' },
  { id: 'pyramid', name: 'Beat the Pyramid', blurb: 'Higher or lower, all the way to the top' },
];

export function useShown() {
  const { settings } = useStore();
  const hidden: string[] = settings.hiddenGames ?? [];
  const shows = (id: ShownId) => !hidden.includes(id);
  return { games: GAMES.filter((g) => shows(g)), shows, hidden };
}
