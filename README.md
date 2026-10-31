# Card Club

An original browser card-game club: Take 2 (a house knockout game), Hold'em, Five-Card Draw,
Hearts, Gin Rummy, Blackjack, Solitaire and Beat the Pyramid, against 25 AI club members now
and with friends online next. No real money, ever.

`index.html` is the whole game in one file (built by `npm run build:offline`): open it in a
browser to play offline.

## Current status — offline build (Take 2 and Hold'em playable vs AI)

| Area | State |
|---|---|
| Take 2 rules engine | Done; rules confirmed by the owner after play-testing |
| Hold'em engine (2–9 seats, side pots, short all-ins) | Done — see docs/POKER.md |
| Full-body characters, wardrobe, shop, coins/XP/tiers (local mode, no real money) | Done — see docs/WARDROBE.md |
| Automated tests | 181 tests + thousands of simulated AI matches/hands |
| Take 2 vs AI (2–6 players, 4 AI personalities) | Playable |
| Hold'em vs AI (up to 8 AI opponents, 3 table presets) | Playable |
| Hearts vs AI (4 players, standard rules + options) | Playable — see docs/HEARTS-GIN.md |
| Gin Rummy vs AI (1 on 1, knock/gin/undercut, lay-offs) | Playable — see docs/HEARTS-GIN.md |
| Five-Card Draw vs AI (2–6 players, shares the Hold'em engine) | Playable — see docs/BLACKJACK-DRAW.md |
| Blackjack tournament vs the dealer (up to 5 players) | Playable — see docs/BLACKJACK-DRAW.md |
| Solitaire (Klondike, draw 1/3, Daily Deal) | Playable — see docs/SOLITAIRE-DESKTOP.md |
| Big-screen layout, side panel, dealer character | Done — see docs/SOLITAIRE-DESKTOP.md |
| House rules screen | Done; all defaults confirmed |
| App shell: home, play, profile, settings, more | Done (local mode) |
| Character creator (layered 2D avatar) | Done (basic) |
| Beat the Pyramid, seasons, achievements, seated players | Done (offline) — see docs/SEASONS.md, docs/WARDROBE.md |
| Database (Supabase): schema, security rules, seed | Written and tested on PostgreSQL — see supabase/README.md |
| Accounts, online rooms, server-held coins | **Not built yet.** Next: sign-up/sign-in functions and the online club |

**Local mode:** profile, practice stats, settings and house rules are saved in the
browser only. No account, currency or online play exists yet, and the app says so.

## Layout

```
packages/engine/      Pure TypeScript game logic (no dependencies)
  src/core/           cards, secure shuffle, GameModule interface, LocalSession
  src/take2/          config, scoring, engine, views, AI
  src/poker/          evaluator, pots, engine, views, AI
  tests/              rule tests + full-match simulations
apps/web/src/         React app (design system, screens, Take 2 table)
scripts/build.mjs     Builds dist/card-club.html — one self-contained page
scripts/gen-seed.ts   Generates the Supabase seed SQL from the game data
supabase/             Database migrations, security tests, setup guide
docs/                 ARCHITECTURE.md, RULES-TAKE2.md, POKER.md, CLUB.md, WARDROBE.md, HEARTS-GIN.md, BLACKJACK-DRAW.md, SOLITAIRE-DESKTOP.md
```

The table talks to a `GameSession`. Today that's `LocalSession` (runs in the
browser). The online version adds an `OnlineSession` with the same interface, and the
same engine runs on the server, so the UI and rules don't change.

## Commands (in this workspace)

```bash
bun test packages/engine/tests        # run all engine tests
node scripts/build.mjs                # build dist/card-club.html (React from CDN)
node scripts/build.mjs --inline-react # offline test build with React bundled
```

## Moving to GitHub (next step)

1. Create the repo and copy this folder in.
2. Replace `scripts/build.mjs` with a Vite project in `apps/web`, add
   `@types/react` + `@types/react-dom` and delete `apps/web/src/types/react-shim.d.ts`.
3. Swap `bun:test` imports for `vitest` (same API) if you prefer Vitest.
4. Then: Supabase project, auth, schema and online rooms (see docs/ARCHITECTURE.md).
