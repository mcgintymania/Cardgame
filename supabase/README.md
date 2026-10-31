# Supabase setup

Two SQL files set up the whole database. Run them **in order**, once.

## 1. Run the SQL
In the Supabase dashboard: **SQL Editor → New query**.
1. Open `migrations/20261031000001_card_club_schema.sql`, copy all of it, paste, **Run**. It should finish with "Success. No rows returned".
2. New query again: paste `migrations/20261031000002_seed.sql`, **Run**. This adds the 247 items, the 25 AI members, their ratings and the first champions.

The seed file can be run again safely, and should be whenever the catalogue changes. It's generated from the game code by `bun scripts/gen-seed.ts`.

## 2. Two Authentication settings
- **Authentication → Sign In / Providers → "Allow new users to sign up": OFF.**
  - Accounts are created only by Card Club's own sign-up function, which checks usernames, rate-limits attempts and makes the recovery codes.
  - The direct sign-up route stays closed, so nobody can skip those checks.
- **Email → "Confirm email": OFF.** There is no email. Accounts use a private placeholder address that never receives mail.

## 3. What to send Claude
From **Project Settings → API** (Data API), send:
- the **Project URL**,
- the **anon / public** key (also called "publishable"). This key is designed to be public, and the database rules do the protecting.

**Never send or commit:**
- the **service_role** key (also called "secret"),
- the **database password**.

Those go into GitHub and Supabase secret settings only, when the deploy is set up.

## What's in the database
- **Everyone (signed in) can read:** the club (members, ratings, titles, Cups, news), the item catalogue, profiles and the Daily Deal board.
- **Only you can read:** your wallet, coin history, inventory, settings and your own hand at a table.
- **Nobody can read:** recovery codes, rate-limit records, the full game state (the deck).
- **Nobody can write from the browser.** Coins, items, ratings and games change only through server functions. The browser may call only these, and each checks everything itself:
  - `buy_item` (shop items only, coins and membership tier checked),
  - `save_look` (only items you own or starter items),
  - `save_settings`.
- **Coins** move only through `ledger_apply`, which locks the wallet, never goes below zero and never pays the same thing twice.

## Testing locally
`supabase/tests/security_test.sql` checks all of the above on plain PostgreSQL, using `tests/supabase-stub.sql` as a stand-in for Supabase's auth:
- sign-up and the welcome coins,
- username rules,
- the ledger can't pay twice,
- recovery codes,
- the shop rules,
- ownership checks on looks,
- privacy between two players,
- nothing visible when signed out.
