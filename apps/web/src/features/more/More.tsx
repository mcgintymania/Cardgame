import React from 'react';
import type { Nav, Route } from '../../app/App.tsx';
import { ALL_SHOWN, useShown, type ShownId } from '../../lib/games.ts';

const ITEMS: Array<{ route: Route; label: string; desc: string; ready: boolean }> = [
  { route: 'take2', label: 'Take 2', desc: 'Knockout: stay under 100, every 2 doubles your hand', ready: true },
  { route: 'poker', label: "Texas Hold'em", desc: "No-limit Texas Hold'em", ready: true },
  { route: 'hearts', label: 'Hearts', desc: 'Four-player trick-taking', ready: true },
  { route: 'gin', label: 'Gin Rummy', desc: 'One-on-one rummy', ready: true },
  { route: 'draw', label: 'Five-Card Draw', desc: 'Classic draw poker', ready: true },
  { route: 'blackjack', label: 'Blackjack', desc: 'Tournament blackjack vs the dealer', ready: true },
  { route: 'solitaire', label: 'Solitaire', desc: 'Klondike, and the Daily Deal', ready: true },
  { route: 'pyramid', label: 'Beat the Pyramid', desc: 'Higher or lower to the top', ready: true },
  { route: 'online', label: 'Online', desc: 'Play your friends and family, and your account', ready: true },
  { route: 'club', label: 'The Club', desc: 'Rankings, titles, the Club Cup and members', ready: true },
  { route: 'shop', label: 'Shop', desc: 'Spend club coins on clothes, tables and celebrations', ready: true },
  { route: 'wardrobe', label: 'Wardrobe', desc: 'Dress your character and set up your table', ready: true },
  { route: 'settings', label: 'Settings', desc: 'Sound, motion, card size, install the app, your progress', ready: true },
];

const GAME_IDS = ALL_SHOWN.map((g) => g.id as string);

export function More({ nav }: { nav: Nav }) {
  const { shows } = useShown();
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display h-lg">More</h1>
      </header>
      <div className="more-list">
        {ITEMS.filter((i) => !GAME_IDS.includes(i.route) || shows(i.route as ShownId)).map((i) => (
          <button key={i.route} className="more-row" onClick={() => nav.go(i.route)}>
            <span>
              <b>{i.label}</b>
              <small>{i.desc}</small>
            </span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
