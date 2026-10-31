import React, { useEffect, useState } from 'react';
import { onlineOutcome, openOnlineTable, type OnlineTable } from '../features/online/launch.ts';
import { leaveTable } from '../lib/online/tables.ts';
import { OnlinePage } from '../features/online/Online.tsx';
import { store, useStore } from '../lib/store.ts';
import { cryptoRng } from '../../../../packages/engine/src/core/rng.ts';
import { ME, cupOpponents, forfeit, pickOpponents, recordMatch, simulateOrder, titleStatus, type MatchKind, type Outcome } from '../lib/club.ts';
import type { GameId } from '../lib/roster.ts';
import { ClubPage } from '../features/club/Club.tsx';
import { POKER_PRESETS } from '../features/poker/Setup.tsx';
import { Wardrobe } from '../features/wardrobe/Wardrobe.tsx';
import { Shop } from '../features/shop/Shop.tsx';
import { applyReward, bumpStreak, grantUnlocks, rewardFor } from '../lib/progress.ts';
import { ACHIEVEMENTS } from '../lib/catalogue.ts';
import { tierFor } from '../lib/progress.ts';
import { useShown, type ShownId } from '../lib/games.ts';
import { sfx } from '../lib/audio.ts';
import { Avatar } from '../design/Avatar.tsx';
import { CreatePlayer } from '../features/onboarding/CreatePlayer.tsx';
import { Home } from '../features/home/Home.tsx';
import { Play } from '../features/play/Play.tsx';
import { Take2Setup } from '../features/take2/Setup.tsx';
import { Take2Table } from '../features/take2/Table.tsx';
import { Profile } from '../features/profile/Profile.tsx';
import { Settings } from '../features/settings/Settings.tsx';
import { More, ComingSoon } from '../features/more/More.tsx';
import { PokerSetup } from '../features/poker/Setup.tsx';
import { PokerTable, type PokerMatchSetup } from '../features/poker/Table.tsx';
import type { Take2Config } from '../../../../packages/engine/src/take2/config.ts';
import { HeartsSetup } from '../features/hearts/Setup.tsx';
import { HeartsTable, type HeartsMatchSetup } from '../features/hearts/Table.tsx';
import { GinSetup } from '../features/gin/Setup.tsx';
import { GinTable, type GinMatchSetup } from '../features/gin/Table.tsx';
import { BlackjackSetup } from '../features/blackjack/Setup.tsx';
import { SolitaireSetup } from '../features/solitaire/Setup.tsx';
import { PyramidSetup } from '../features/pyramid/Setup.tsx';
import { PyramidTable } from '../features/pyramid/Table.tsx';
import type { PyramidConfig } from '../../../../packages/engine/src/pyramid/engine.ts';
import { SolitaireTable, type SolitaireSetup as SolMatch } from '../features/solitaire/Table.tsx';
import { BlackjackTable, type BlackjackMatchSetup } from '../features/blackjack/Table.tsx';

export type Route =
  | 'home' | 'play' | 'take2' | 'profile' | 'settings' | 'more'
  | 'poker' | 'hearts' | 'gin' | 'draw' | 'blackjack' | 'solitaire' | 'pyramid' | 'club' | 'friends' | 'challenges' | 'shop' | 'wardrobe' | 'online';

const ROUTES: Route[] = ['home', 'play', 'take2', 'profile', 'settings', 'more', 'poker', 'hearts', 'gin', 'draw', 'blackjack', 'solitaire', 'pyramid', 'club', 'friends', 'challenges', 'shop', 'wardrobe', 'online'];
const GAME_ROUTES: Route[] = ['take2', 'poker', 'hearts', 'gin', 'draw', 'blackjack', 'solitaire', 'pyramid'];

export interface MatchSetup {
  /** Online: the RemoteSession for this table (replaces the local AI session). */
  remote?: unknown;
  /** Online: this table's room. */
  roomId?: string;
  config: Partial<Take2Config>;
  opponents: string[];
  kind: MatchKind;
}

/** How a table reports its finish: known finishers (best first) and players still in. */
export interface FinishReport {
  ordered: string[];
  remaining: string[];
}

export interface Nav {
  go: (r: Route) => void;
  startTake2: (m: MatchSetup) => void;
  startPoker: (m: PokerMatchSetup) => void;
  startHearts: (m: HeartsMatchSetup) => void;
  startGin: (m: GinMatchSetup) => void;
  startBlackjack: (m: BlackjackMatchSetup) => void;
  startSolitaire: (m: SolMatch) => void;
  startPyramid: (c: PyramidConfig) => void;
  /** Title match or Club Cup match for a game. */
  startEvent: (game: GameId, kind: Exclude<MatchKind, 'casual'>) => void;
  /** Sit down at an online table that has started. */
  startOnline: (roomId: string) => Promise<void>;
}

const RAIL: Array<{ route: Route; label: string; glyph: string }> = [
  { route: 'home', label: 'Home', glyph: '⌂' },
  { route: 'play', label: 'Play', glyph: '▶' },
  { route: 'take2', label: 'Take 2', glyph: '2' },
  { route: 'poker', label: 'Poker', glyph: '♠' },
  { route: 'hearts', label: 'Hearts', glyph: '♥' },
  { route: 'gin', label: 'Gin Rummy', glyph: '♦' },
  { route: 'draw', label: 'Five-Card Draw', glyph: '♣' },
  { route: 'blackjack', label: 'Blackjack', glyph: '21' },
  { route: 'solitaire', label: 'Solitaire', glyph: '♤' },
  { route: 'pyramid', label: 'Beat the Pyramid', glyph: '▲' },
  { route: 'club', label: 'The Club', glyph: '♛' },
  { route: 'online', label: 'Online', glyph: '◎' },
  { route: 'wardrobe', label: 'Wardrobe', glyph: '⌘' },
  { route: 'shop', label: 'Shop', glyph: '¤' },
  { route: 'profile', label: 'Profile', glyph: '◉' },
  { route: 'more', label: 'More', glyph: '⋯' },
];

const TABS: Array<{ route: Route; label: string; glyph: string }> = [
  { route: 'home', label: 'Home', glyph: '⌂' },
  { route: 'play', label: 'Play', glyph: '▶' },
  { route: 'club', label: 'Club', glyph: '♛' },
  { route: 'profile', label: 'Profile', glyph: '◉' },
  { route: 'more', label: 'More', glyph: '⋯' },
];

function routeFromHash(): Route {
  try {
    const h = location.hash.replace('#', '') as Route;
    return ROUTES.includes(h) ? h : 'home';
  } catch {
    return 'home';
  }
}

export function App() {
  const { profile } = useStore();
  const { shows } = useShown();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [pokerMatch, setPokerMatch] = useState<PokerMatchSetup | null>(null);
  const [heartsMatch, setHeartsMatch] = useState<HeartsMatchSetup | null>(null);
  const [ginMatch, setGinMatch] = useState<GinMatchSetup | null>(null);
  const [bjMatch, setBjMatch] = useState<BlackjackMatchSetup | null>(null);
  const [solMatch, setSolMatch] = useState<SolMatch | null>(null);
  const [pyrMatch, setPyrMatch] = useState<PyramidConfig | null>(null);
  const [matchKey, setMatchKey] = useState(0);

  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route) => {
    setRoute(r);
    try { history.replaceState(null, '', `#${r}`); } catch { /* sandboxed */ }
    window.scrollTo(0, 0);
  };
  const [onlineTable, setOnlineTable] = useState<OnlineTable | null>(null);
  const nav: Nav = {
    go,
    startOnline: async (roomId) => {
      const t = await openOnlineTable(roomId);
      setOnlineTable(t);
      setMatchKey((k: number) => k + 1);
    },
    startTake2: (m) => {
      setMatch(m);
      setMatchKey((k: number) => k + 1);
    },
    startPoker: (m) => {
      setPokerMatch(m);
      setMatchKey((k: number) => k + 1);
    },
    startHearts: (m) => {
      setHeartsMatch(m);
      setMatchKey((k: number) => k + 1);
    },
    startGin: (m) => {
      setGinMatch(m);
      setMatchKey((k: number) => k + 1);
    },
    startPyramid: (c) => {
      setPyrMatch(c);
      setMatchKey((k: number) => k + 1);
    },
    startSolitaire: (m) => {
      setSolMatch(m);
      setMatchKey((k: number) => k + 1);
    },
    startBlackjack: (m) => {
      setBjMatch(m);
      setMatchKey((k: number) => k + 1);
    },
    startEvent: (game, kind) => {
      const club = store.get().club;
      let opponents: string[] = [];
      let rival: string | undefined;
      if (kind === 'title') {
        const st = titleStatus(club, game);
        if (st.kind === 'locked') return;
        rival = st.kind === 'champion' ? st.challenger : st.holder;
        opponents = [rival];
        // Hearts needs four at the table: two club members make up the numbers.
        if (game === 'hearts') opponents = [rival, ...pickOpponents(club, 'hearts', 2, cryptoRng(), [rival])];
      } else if (club.tournament && club.tournament.game === game) {
        opponents = cupOpponents(club.tournament, kind);
      }
      if (!opponents.length) return;
      if (game === 'take2') nav.startTake2({ config: store.get().take2Rules ?? {}, opponents, kind });
      else if (game === 'hearts') nav.startHearts({ config: store.get().heartsRules ?? {}, opponents, kind, rival });
      else if (game === 'gin') nav.startGin({ config: store.get().ginRules ?? {}, opponents, kind });
      else if (game === 'blackjack') nav.startBlackjack({ config: store.get().bjRules ?? {}, opponents, kind });
      else nav.startPoker({ config: { ...POKER_PRESETS.tournament.config, variant: game === 'draw' ? 'draw' : 'holdem' }, opponents, kind });
    },
  };

  const finishFor = (game: GameId, setup: { opponents: string[]; kind: MatchKind; rival?: string }) => (r: FinishReport): Outcome => {
    const rng = cryptoRng();
    const club = store.get().club;
    const head = r.remaining.length > 1 ? simulateOrder(club, game, r.remaining, rng) : r.remaining;
    const placements = [...head, ...r.ordered.filter((id) => !head.includes(id))];
    const { state, outcome } = recordMatch(club, game, placements, setup.kind, rng, profile?.name ?? 'You', setup.rival);
    store.setClub(state);
    // Coins, XP and anything newly unlocked
    const before = club.titles[game].current.holder;
    const after = state.titles[game].current.holder;
    const won = placements[0] === ME;
    const reward = rewardFor({
      placements, kind: setup.kind,
      titleWon: setup.kind === 'title' && before !== ME && after === ME,
      titleDefended: setup.kind === 'title' && before === ME && after === ME,
      cupFinalReached: setup.kind === 'cupHeat' && state.tournament?.stage === 'final',
      cupWon: setup.kind === 'cupFinal' && won,
    }, store.get().wallet);
    const { wallet, levelUp, coins: paid, xp: xpPaid, boosted } = applyReward(store.get().wallet, reward, `${setup.kind === 'casual' ? 'Table' : setup.kind === 'title' ? 'Title match' : 'Club Cup'}: ${won ? 'won' : 'played'}`, won);
    const streaked = bumpStreak(wallet, won);
    const unlocked = grantUnlocks(streaked, state);
    store.setWallet(unlocked.wallet);
    const newAch = unlocked.wallet.achievements.filter((k) => !streaked.achievements.includes(k));
    const lines = [...outcome.lines, `+${paid} coins · +${xpPaid} XP${boosted.length ? ` (${boosted.join(', ')})` : ''}`, ...reward.lines.filter((l) => !l.startsWith('Title') && !l.startsWith('Club Cup'))];
    if (levelUp) {
      const t = tierFor(levelUp);
      lines.push(`Level up! You're level ${levelUp}${t.level === levelUp ? ` and a ${t.name}` : ''}.`);
    }
    for (const k of newAch) lines.push(`Achievement: ${ACHIEVEMENTS[k].name}!`);
    for (const it of unlocked.newly) lines.push(it.unlock.kind === 'signature' ? `You won ${it.name}! It's in your wardrobe.` : `Unlocked: ${it.name}`);
    return { ...outcome, lines, won };
  };
  const leave = (game: GameId, setup: { opponents: string[]; kind: MatchKind; rival?: string }, forfeited: boolean) => {
    if (forfeited && setup.kind !== 'casual') {
      const { state } = forfeit(store.get().club, game, [ME, ...setup.opponents], setup.kind, cryptoRng(), profile?.name ?? 'You', setup.rival);
      store.setClub(state);
    }
  };

  if (!profile) return <CreatePlayer />;

  if (heartsMatch) {
    return (
      <HeartsTable
        key={matchKey}
        setup={heartsMatch}
        onFinished={finishFor('hearts', heartsMatch)}
        onExit={(f) => { leave('hearts', heartsMatch, f); setHeartsMatch(null); go(heartsMatch.kind === 'casual' ? 'hearts' : 'club'); }}
        onRematch={() => setMatchKey((k: number) => k + 1)}
      />
    );
  }

  if (ginMatch) {
    return (
      <GinTable
        key={matchKey}
        setup={ginMatch}
        onFinished={finishFor('gin', ginMatch)}
        onExit={(f) => { leave('gin', ginMatch, f); setGinMatch(null); go(ginMatch.kind === 'casual' ? 'gin' : 'club'); }}
        onRematch={() => setMatchKey((k: number) => k + 1)}
      />
    );
  }

  if (pyrMatch) {
    return <PyramidTable key={matchKey} config={pyrMatch} onExit={() => { setPyrMatch(null); go('pyramid'); }} onAgain={() => setMatchKey((k: number) => k + 1)} />;
  }

  if (solMatch) {
    return <SolitaireTable key={matchKey} setup={solMatch} onExit={() => { setSolMatch(null); go('solitaire'); }} onAgain={() => setMatchKey((k: number) => k + 1)} />;
  }

  if (bjMatch) {
    return (
      <BlackjackTable
        key={matchKey}
        setup={bjMatch}
        onFinished={finishFor('blackjack', bjMatch)}
        onExit={(f) => { leave('blackjack', bjMatch, f); setBjMatch(null); go(bjMatch.kind === 'casual' ? 'blackjack' : 'club'); }}
        onRematch={() => setMatchKey((k: number) => k + 1)}
      />
    );
  }

  if (onlineTable) {
    const t = onlineTable;
    const exit = () => {
      if (t.session.info.status === 'playing') void leaveTable(t.roomId).catch(() => {});
      t.session.dispose();
      setOnlineTable(null);
      go('online');
    };
    const k = `online-${t.roomId}`;
    const common = { onFinished: () => onlineOutcome(t), onExit: exit, onRematch: () => { t.session.dispose(); setOnlineTable(null); go('online'); } };
    switch (t.game) {
      case 'take2': return <Take2Table key={k} {...common} setup={t.setup as never} />;
      case 'poker': case 'draw': return <PokerTable key={k} {...common} setup={t.setup as never} />;
      case 'hearts': return <HeartsTable key={k} {...common} setup={t.setup as never} />;
      case 'gin': return <GinTable key={k} {...common} setup={t.setup as never} />;
      case 'blackjack': return <BlackjackTable key={k} {...common} setup={t.setup as never} />;
    }
  }

  if (pokerMatch) {
    const pg: GameId = pokerMatch.config.variant === 'draw' ? 'draw' : 'poker';
    return (
      <PokerTable
        key={matchKey}
        setup={pokerMatch}
        onFinished={finishFor(pg, pokerMatch)}
        onExit={(f) => { leave(pg, pokerMatch, f); setPokerMatch(null); go(pokerMatch.kind === 'casual' ? pg : 'club'); }}
        onRematch={() => setMatchKey((k: number) => k + 1)}
      />
    );
  }

  if (match) {
    return (
      <Take2Table
        key={matchKey}
        setup={match}
        onFinished={finishFor('take2', match)}
        onExit={(f) => { leave('take2', match, f); setMatch(null); go(match.kind === 'casual' ? 'take2' : 'club'); }}
        onRematch={() => setMatchKey((k: number) => k + 1)}
      />
    );
  }

  let screen: React.ReactNode;
  switch (route) {
    case 'home': screen = <Home nav={nav} />; break;
    case 'play': screen = <Play nav={nav} />; break;
    case 'take2': screen = <Take2Setup nav={nav} />; break;
    case 'poker': screen = <PokerSetup nav={nav} key="poker" />; break;
    case 'hearts': screen = <HeartsSetup nav={nav} />; break;
    case 'gin': screen = <GinSetup nav={nav} />; break;
    case 'draw': screen = <PokerSetup nav={nav} game="draw" key="draw" />; break;
    case 'blackjack': screen = <BlackjackSetup nav={nav} />; break;
    case 'solitaire': screen = <SolitaireSetup nav={nav} />; break;
    case 'pyramid': screen = <PyramidSetup nav={nav} />; break;
    case 'club': screen = <ClubPage nav={nav} />; break;
    case 'wardrobe': screen = <Wardrobe nav={nav} />; break;
    case 'shop': screen = <Shop nav={nav} />; break;
    case 'profile': screen = <Profile nav={nav} />; break;
    case 'settings': screen = <Settings />; break;
    case 'online': screen = <OnlinePage nav={nav} />; break;
    case 'more': screen = <More nav={nav} />; break;
    default: screen = <ComingSoon route={route} nav={nav} />;
  }

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <div className="rail-brand">
          <span className="brand-mark">Card Club</span>
        </div>
        <nav className="rail-nav">
          {RAIL.filter((i) => !(GAME_ROUTES as string[]).includes(i.route) || shows(i.route as ShownId)).map((i) => (
            <button key={i.route} className={`rail-item ${route === i.route ? 'is-on' : ''}`} onClick={() => go(i.route)} aria-current={route === i.route ? 'page' : undefined}>
              <span className="rail-glyph" aria-hidden="true">{i.glyph}</span>
              {i.label}
            </button>
          ))}
          <button className={`rail-item ${route === 'settings' ? 'is-on' : ''}`} onClick={() => go('settings')}>
            <span className="rail-glyph" aria-hidden="true">⚙</span>Settings
          </button>
        </nav>
        <button className="rail-me" onClick={() => go('profile')}>
          <Avatar config={profile.avatar} size={36} />
          <span>{profile.name}</span>
        </button>
      </aside>

      <header className="topbar">
        <span className="brand-mark">Card Club</span>
        <button className="topbar-me" onClick={() => go('profile')} aria-label="Your profile">
          <Avatar config={profile.avatar} size={32} />
        </button>
      </header>

      <main className="screen" id="main">{screen}</main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.route} className={`tab ${route === t.route || (t.route === 'play' && GAME_ROUTES.includes(route)) ? 'is-on' : ''}`} onClick={() => go(t.route)} aria-current={route === t.route ? 'page' : undefined}>
            <span className="tab-glyph" aria-hidden="true">{t.glyph}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
