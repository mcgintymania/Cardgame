# Card Club

An original card-game club: Take 2 (a house knockout game), Texas Hold'em, Five-Card Draw,
Hearts, Gin Rummy, Blackjack, Solitaire and Beat the Pyramid. Play the club's 25 members on
your own, or your friends and family online. Installable as an app. No real money, ever.

**Play:** https://mcgintymania.github.io/Cardgame/ (install it from the browser menu, or in
Safari: Share → Add to Home Screen).

## What's in it

| Area | Notes |
|---|---|
| Eight games | Rules engines with tests and thousands of simulated games. See `docs/` |
| Club members | 25 opponents with their own styles, ratings, titles, the Club Cup and rivalries |
| Online tables | Make a table, share a code, play friends and family; club members fill empty seats. The server deals and checks every move |
| Accounts | Username and password, no email; recovery codes instead |
| One wallet | Signed in, your coins, items, level and records are saved to your account and follow you to any device. Offline games catch up when you reconnect |
| Character, wardrobe, shop | 247 items, mostly earned by playing; seasonal events all year |
| Installable app | Works offline, updates itself the next time it opens online |
| Security | Every table protected by row-level security; secrets never in the app or repo. See `supabase/README.md` |

## Layout

```
packages/engine/      Game logic in plain TypeScript (no dependencies), shared by app and server
  src/online/         online matches: seat rotation, registry, phrases
  tests/              rule tests and full-match simulations
apps/web/src/         The React app
apps/web/public/      Icons, app manifest, offline service worker
supabase/             Database migrations, SQL tests, Edge Functions (auth, game), setup guide
scripts/              build.mjs (the site), build-game-fn.mjs (the game function), gen-seed.ts
docs/                 Rules and design notes; UPDATING.md explains how to ship updates safely
```

## Commands

```bash
bun test                              # every test
npx tsc --noEmit -p .                 # typecheck
node scripts/build.mjs --site         # build the website/app into site/ (copy to the repo root)
node scripts/build-game-fn.mjs        # rebuild supabase/functions/game/index.ts
bun scripts/gen-seed.ts               # regenerate the catalogue seed SQL
```

Before shipping an update, read `docs/UPDATING.md`.
