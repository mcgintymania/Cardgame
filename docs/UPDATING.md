# Shipping updates without hurting players

Card Club keeps each player's progress in two places: on their device (browser storage) and, when
they're signed in, in their account (`player_saves` in Supabase). An update replaces the game's code,
never that data. These rules keep it that way.

## How an update reaches players
1. Make the change, then run `bun test` (every test must pass) and `npx tsc --noEmit -p .`.
2. Build the website: `node scripts/build.mjs --site`. This writes `site/` (the page, manifest, icons
   and `sw.js`, stamped with a version like `2026.11.01-1021`).
3. Copy everything in `site/` to the root of the GitHub repo and merge it into `main`.
4. GitHub Pages publishes it within a couple of minutes.
5. Players get it the next time they open Card Club while online. The installed app checks for a new
   page every time it opens and falls back to the saved copy when offline. Nobody has to reinstall.
   Settings shows the version number at the bottom.

If the change touches online play or the database:
- **Game function changed** (`supabase/functions/game/src`): run `node scripts/build-game-fn.mjs`, then
  in Supabase open **Edge Functions → game → Code**, paste `supabase/functions/game/index.ts` over it and
  **Deploy**. Do this right after the site goes live.
- **Database changed:** add a *new* file in `supabase/migrations/` (never edit one that has been run),
  written so running it twice is safe (`if not exists`, `create or replace`), and run it in the SQL Editor.
- **Catalogue changed:** run `bun scripts/gen-seed.ts`, then run the seed file again in the SQL Editor.

## Rules that protect saves (the tests enforce the first three)
- **Never remove or rename a released item or achievement.** Players may own it. Retire an item by
  taking it out of the shop instead. `released-ids.json` lists every released id; after adding new
  items, regenerate it so they're protected too.
- **Never rename a storage key** in `store.ts` (`cardclub.wallet.v1` and so on). A new name looks like an
  empty save.
- **Changing the shape of saved data?** Keep reading old saves: add a migration in `store.ts`, the way
  `migrateTake2Rules` and `migrateClub` do, with a version number, and test it with an old save.
- **Online games in progress** keep their saved state across a function update. If an engine change
  alters a game's state shape, deploy when nobody is mid-game, or keep the old shape readable.
- **Coins only ever go up from playing and down from the shop.** Rewards are cosmetic-only; there is no
  real money anywhere.
- Never put the service-role key or any secret in the app, the repo or a migration.
