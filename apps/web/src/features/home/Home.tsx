import React from 'react';
import type { Nav } from '../../app/App.tsx';
import { useStore } from '../../lib/store.ts';
import { CardBack, CardFace } from '../../design/PlayingCard.tsx';
import { makeCard } from '../../../../../packages/engine/src/core/cards.ts';
import { Button, ChipIcon, CoinIcon, Tag } from '../../design/ui.tsx';
import { Avatar as Av } from '../../design/Avatar.tsx';
import { Emblem } from '../club/bits.tsx';
import { Character } from '../../design/Character.tsx';
import { LevelBar, useMyExtras } from '../wardrobe/bits.tsx';
import { ME, nameOf, titleName, titleStatus } from '../../lib/club.ts';
import { rosterById } from '../../lib/roster.ts';
import { useShown } from '../../lib/games.ts';
import { store } from '../../lib/store.ts';
import { pickOpponents } from '../../lib/club.ts';
import type { GameId } from '../../lib/roster.ts';
import { cryptoRng } from '../../../../../packages/engine/src/core/rng.ts';
import { POKER_PRESETS } from '../poker/Setup.tsx';
import { BoostRings, DailyCut } from '../shop/extras.tsx';
import { openShopAt } from '../shop/Shop.tsx';
import { useSession } from '../../lib/online/useOnline.ts';
import { SeasonBanner } from '../seasons/Season.tsx';

const QUICK: GameId[] = ['take2', 'poker', 'hearts', 'gin', 'draw', 'blackjack'];
const QUICK_SEATS: Record<GameId, number> = { take2: 3, poker: 5, hearts: 3, gin: 1, draw: 3, blackjack: 3 };

/** Quick Play: a random game you have shown, with opponents picked for you and your saved rules. */
export function quickPlay(nav: Nav, shows: (g: GameId) => boolean): boolean {
  const pool = QUICK.filter((g) => shows(g));
  if (!pool.length) return false;
  const rng = cryptoRng();
  const g = pool[rng.int(pool.length)];
  const s = store.get();
  const opponents = pickOpponents(s.club, g, QUICK_SEATS[g], rng);
  const kind = 'casual' as const;
  switch (g) {
    case 'take2': nav.startTake2({ config: s.take2Rules ?? {}, opponents, kind }); break;
    case 'poker': nav.startPoker({ config: { ...POKER_PRESETS.tournament.config, variant: 'holdem' }, opponents, kind }); break;
    case 'draw': nav.startPoker({ config: { ...POKER_PRESETS.tournament.config, variant: 'draw' }, opponents, kind }); break;
    case 'hearts': nav.startHearts({ config: s.heartsRules ?? {}, opponents, kind }); break;
    case 'gin': nav.startGin({ config: s.ginRules ?? {}, opponents, kind }); break;
    case 'blackjack': nav.startBlackjack({ config: s.bjRules ?? {}, opponents, kind }); break;
  }
  return true;
}

export function ModeTiles({ nav }: { nav: Nav }) {
  const { shows } = useShown();
  return (
    <div className="modes">
      {shows('take2') && (
      <button className="mode mode-take2" onClick={() => nav.go('take2')}>
        <span className="mode-art" aria-hidden="true">
          <CardFace card={makeCard(2, 'H')} size="54px" className="tilt-l" />
          <CardFace card={makeCard(2, 'S')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Take 2</span>
          <span className="mode-desc">Knockout. Stay under 100 points. Every 2 doubles your hand.</span>
          <Tag tone="ok">Practise vs AI</Tag>
        </span>
      </button>
      )}
      {shows('poker') && (
      <button className="mode mode-poker" onClick={() => nav.go('poker')}>
        <span className="mode-art" aria-hidden="true">
          <CardBack size="54px" className="tilt-l" />
          <CardFace card={makeCard(1, 'S')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Texas Hold'em</span>
          <span className="mode-desc">No-limit, up to nine seats. Eight AI regulars with their own styles.</span>
          <Tag tone="ok">Practise vs AI</Tag>
        </span>
      </button>
      )}
      {shows('hearts') && (
      <button className="mode mode-hearts" onClick={() => nav.go('hearts')}>
        <span className="mode-art" aria-hidden="true">
          <CardFace card={makeCard(12, 'S')} size="54px" className="tilt-l" />
          <CardFace card={makeCard(1, 'H')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Hearts</span>
          <span className="mode-desc">Four players. Dodge the hearts and the Queen of Spades, or shoot the moon.</span>
          <Tag tone="ok">New · vs AI</Tag>
        </span>
      </button>
      )}
      {shows('gin') && (
      <button className="mode mode-gin" onClick={() => nav.go('gin')}>
        <span className="mode-art" aria-hidden="true">
          <CardFace card={makeCard(7, 'D')} size="54px" className="tilt-l" />
          <CardFace card={makeCard(8, 'D')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Gin Rummy</span>
          <span className="mode-desc">One on one. Sets, runs and a knock at the right moment.</span>
          <Tag tone="ok">New · vs AI</Tag>
        </span>
      </button>
      )}
      {shows('draw') && (
      <button className="mode mode-draw" onClick={() => nav.go('draw')}>
        <span className="mode-art" aria-hidden="true">
          <CardFace card={makeCard(13, 'C')} size="54px" className="tilt-l" />
          <CardFace card={makeCard(13, 'H')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Five-Card Draw</span>
          <span className="mode-desc">The classic home poker game. Bet, swap up to three, bet again.</span>
          <Tag tone="ok">New · vs AI</Tag>
        </span>
      </button>
      )}
      {shows('blackjack') && (
      <button className="mode mode-blackjack" onClick={() => nav.go('blackjack')}>
        <span className="mode-art" aria-hidden="true">
          <CardFace card={makeCard(1, 'S')} size="54px" className="tilt-l" />
          <CardFace card={makeCard(11, 'D')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Blackjack</span>
          <span className="mode-desc">Tournament style: beat the dealer, finish with the biggest stack.</span>
          <Tag tone="ok">New · vs AI</Tag>
        </span>
      </button>
      )}
      {shows('solitaire') && (
      <button className="mode mode-solitaire" onClick={() => nav.go('solitaire')}>
        <span className="mode-art" aria-hidden="true">
          <CardFace card={makeCard(13, 'S')} size="54px" className="tilt-l" />
          <CardFace card={makeCard(12, 'H')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Solitaire</span>
          <span className="mode-desc">Classic Klondike, draw 1 or 3. Plus a Daily Deal against the club's times.</span>
          <Tag tone="ok">New · solo</Tag>
        </span>
      </button>
      )}
      {shows('pyramid') && (
      <button className="mode mode-pyramid" onClick={() => nav.go('pyramid')}>
        <span className="mode-art" aria-hidden="true">
          <CardBack size="54px" className="tilt-l" />
          <CardFace card={makeCard(7, 'H')} size="54px" className="tilt-r" />
        </span>
        <span className="mode-text">
          <span className="mode-name">Beat the Pyramid</span>
          <span className="mode-desc">Higher or lower, from the bottom-left card all the way to the top.</span>
          <Tag tone="ok">New · solo</Tag>
        </span>
      </button>
      )}
    </div>
  );
}

export function Home({ nav }: { nav: Nav }) {
  const { profile, stats, club, wallet } = useStore();
  const extras = useMyExtras();
  const { games, shows } = useShown();
  const signedIn = !!useSession();
  if (!profile) return null;
  const last = stats.lastPlayed ? new Date(stats.lastPlayed) : null;
  return (
    <div className="page home">
      <section className="home-hero">
        <button className="home-hero-art dressing-stage" onClick={() => nav.go('wardrobe')} aria-label="Open your wardrobe">
          <Character look={profile.avatar} extras={extras} pose="wave" animate width="100%" height="100%" title={profile.name} />
        </button>
        <div className="home-hero-text">
          <p className="eyebrow">Good to see you</p>
          <h1 className="display h-xl">{profile.name}</h1>
          <LevelBar />
          <div className="balances" aria-label="Balances">
            <button className="balance" onClick={() => nav.go('shop')}><CoinIcon /> <b>{wallet.coins.toLocaleString('en-GB')}</b> <em>club coins</em></button>
            <span className="balance is-locked" title="Unlocks with online accounts"><ChipIcon /> <b>Chips</b> <em>online</em></span>
          </div>
          <BoostRings onClick={() => openShopAt(nav, 'boosts')} />
          <div className="btn-row hero-ctas">
            {QUICK.some(shows) && <Button size="lg" className="play-cta quick-cta" onClick={() => quickPlay(nav, shows)}>Quick Play</Button>}
            <Button size="lg" variant={QUICK.some(shows) ? 'felt' : undefined} className="play-cta" onClick={() => nav.go('play')}>Find a game</Button>
            <Button size="lg" variant="ghost" className="play-cta" onClick={() => nav.go('online')}>{signedIn ? 'Play with friends' : 'Play online'}</Button>
          </div>
        </div>
      </section>

      <SeasonBanner onShop={() => openShopAt(nav, 'featured')} />

      <section className="block">
        <h2 className="h-sec">Champions</h2>
        <div className="champ-strip">
          {games.map((g) => {
            const holder = club.titles[g].current.holder;
            const st = titleStatus(club, g);
            return (
              <button key={g} className={`champ ${holder === ME ? 'is-mine' : ''}`} onClick={() => nav.go('club')}>
                <Emblem kind="belt" game={g} size={40} />
                <Av config={holder === ME ? profile.avatar : rosterById(holder)!.avatar} size={36} />
                <span>
                  <small>{titleName(g)}</small>
                  <b>{holder === ME ? 'You' : nameOf(holder)}</b>
                  <em>{st.kind === 'champion' ? 'Defend it' : st.kind === 'eligible' ? 'You have a title shot!' : `${club.titles[g].current.defences} defences`}</em>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="block">
        <h2 className="h-sec">Game rooms</h2>
        <ModeTiles nav={nav} />
      </section>

      <section className="block two-col">
        <div className="panel">
          <h2 className="h-sec">Your practice</h2>
          {stats.take2Played + stats.pokerPlayed + stats.heartsPlayed + stats.ginPlayed + stats.drawPlayed + stats.bjPlayed === 0 ? (
            <p className="empty">No games yet. Your first game will show up here.</p>
          ) : (
            <dl className="statgrid">
              {shows('take2') && <div><dt>Take 2 wins</dt><dd>{stats.take2Wins}<small>/{stats.take2Played}</small></dd></div>}
              {shows('poker') && <div><dt>Poker wins</dt><dd>{stats.pokerWins}<small>/{stats.pokerPlayed}</small></dd></div>}
              {shows('hearts') && <div><dt>Hearts wins</dt><dd>{stats.heartsWins}<small>/{stats.heartsPlayed}</small></dd></div>}
              {shows('gin') && <div><dt>Gin wins</dt><dd>{stats.ginWins}<small>/{stats.ginPlayed}</small></dd></div>}
              {shows('draw') && <div><dt>Draw wins</dt><dd>{stats.drawWins}<small>/{stats.drawPlayed}</small></dd></div>}
              {shows('blackjack') && <div><dt>Blackjack wins</dt><dd>{stats.bjWins}<small>/{stats.bjPlayed}</small></dd></div>}
              <div><dt>Last game</dt><dd className="small">{last ? last.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</dd></div>
            </dl>
          )}
        </div>
        <div className="panel">
          <DailyCut />
          <div className="btn-row"><Button variant="ghost" size="sm" onClick={() => openShopAt(nav, 'featured')}>Shop &amp; stash</Button></div>
        </div>
      </section>
    </div>
  );
}
