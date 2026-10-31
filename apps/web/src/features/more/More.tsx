import React from 'react';
import type { Nav, Route } from '../../app/App.tsx';
import { Button, Tag } from '../../design/ui.tsx';
import { ALL_SHOWN, useShown, type ShownId } from '../../lib/games.ts';

const ITEMS: Array<{ route: Route; label: string; desc: string; ready: boolean }> = [
  { route: 'take2', label: 'Take 2', desc: 'Practise against AI', ready: true },
  { route: 'poker', label: 'Poker', desc: "Texas Hold'em vs AI", ready: true },
  { route: 'hearts', label: 'Hearts', desc: 'Four-player trick-taking vs AI', ready: true },
  { route: 'gin', label: 'Gin Rummy', desc: 'One-on-one rummy vs AI', ready: true },
  { route: 'draw', label: 'Five-Card Draw', desc: 'Classic draw poker vs AI', ready: true },
  { route: 'blackjack', label: 'Blackjack', desc: 'Tournament blackjack vs the dealer', ready: true },
  { route: 'solitaire', label: 'Solitaire', desc: 'Klondike, and the Daily Deal', ready: true },
  { route: 'pyramid', label: 'Beat the Pyramid', desc: 'Higher or lower to the top', ready: true },
  { route: 'friends', label: 'Friends', desc: 'Add friends and invite them to tables', ready: false },
  { route: 'club', label: 'The Club', desc: 'Rankings, titles, the Club Cup and members', ready: true },
  { route: 'challenges', label: 'Challenges', desc: 'Daily and weekly goals', ready: false },
  { route: 'shop', label: 'Shop', desc: 'Spend club coins on clothes, tables and celebrations', ready: true },
  { route: 'wardrobe', label: 'Wardrobe', desc: 'Dress your character and set up your table', ready: true },
  { route: 'settings', label: 'Settings', desc: 'Sound, motion, card size', ready: true },
];

const SOON: Partial<Record<Route, { title: string; body: string; phase: string }>> = {
  friends: { title: 'Friends', body: 'Add friends by username, see who is online, invite them to your table and keep a head-to-head record for bragging rights.', phase: 'Planned · needs online accounts' },
  challenges: { title: 'Challenges', body: 'Daily and weekly challenges that earn club coins and XP.', phase: 'Planned' },
  shop: { title: 'Shop', body: 'Jackets, hats, glasses and table cosmetics, bought with club coins.', phase: 'Planned' },
  wardrobe: { title: 'Wardrobe', body: 'You can already change your look from your profile. Unlockable items arrive with the shop.', phase: 'Planned' },
};

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
            {i.ready ? <span className="chev" aria-hidden="true">›</span> : <Tag>Soon</Tag>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ComingSoon({ route, nav }: { route: Route; nav: Nav }) {
  const s = SOON[route] ?? { title: 'Coming soon', body: '', phase: '' };
  return (
    <div className="page">
      <div className="soon">
        <p className="eyebrow">{s.phase}</p>
        <h1 className="display h-lg">{s.title}</h1>
        <p className="lede">{s.body}</p>
        <div className="soon-actions">
          <Button onClick={() => nav.go('take2')}>Play Take 2 instead</Button>
          {route === 'wardrobe' && <Button variant="ghost" onClick={() => nav.go('profile')}>Change your look</Button>}
        </div>
      </div>
    </div>
  );
}
