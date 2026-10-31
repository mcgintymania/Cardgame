# CARD CLUB — Architecture & Development Plan (v0.2)

Status: **offline build playable** (Take 2, Hold'em, Five-Card Draw, Hearts, Gin Rummy, Blackjack and Solitaire vs AI; the Club, titles, Cups, wardrobe and shop). Online (GitHub + Supabase) is next.
Updated: 19 Oct 2026

## Decisions so far
- **Build order changed by the owner:** games and design first, offline against AI. GitHub and Supabase (accounts, online play, server-held coins) come after.
- **No real money, ever.** Club coins are earned in play and spent on cosmetics only.
- **Take 2 rules:** the house rules were confirmed after play-testing (see RULES-TAKE2.md).
- **The club:** 25 AI members, each with a skill level per game, plus ratings, defended titles, Club Cups, a trophy cabinet and head-to-head records (see CLUB.md).
- **Games:** Take 2, Hold'em, Five-Card Draw, Hearts, Gin Rummy, Blackjack and Solitaire. Any of them can be hidden in Settings.
- **Accounts (decided 19 Oct 2026): username and password only, no email.** Everything stays inside the app. Password recovery uses one-time recovery codes (§2.7).
- **One shared club online (decided 19 Oct 2026):**
  - Everyone who signs up joins the same club as the 25 AI members, with one set of rankings, titles and Cups.
  - AI members are shared characters: their ratings move whoever they play.
  - See §2.11.
- **Fair dealing:** every deal is a fresh secure shuffle, and nothing is predetermined. The Daily Deal is the only exception (§2.5).

---

## 0. Project review

- No existing Card Club repository was found on the connected GitHub account. The repos present (BOOKEDFamily, BOOKED-RingsideEmpire, BOOKED-PitchSideEmpire, Yorkshiremarketlord) are unrelated.
- **Conclusion:** this is a fresh build. Nothing existing needs preserving.

---

## 1. The big picture in plain English

The browser is a **display and input device only**. It shows the table and sends *intentions* ("I want to play the 7♥", "I raise 200"). A trusted server function decides whether the move is legal, updates the game, and tells each player only what they're allowed to see.

```
 Browser (React)                Supabase
 ───────────────                ─────────────────────────────────────────
 Table UI  ──"play 7♥, v=41"──▶ Edge Function: game-action
                                  1. check login (JWT)
                                  2. lock the room's game row (transaction)
                                  3. version still 41? else reject
                                  4. run shared game engine → new state
                                  5. write public state + per-player views
                                  6. bump version → 42, commit
 Table UI  ◀── "room changed, v42" ── Realtime broadcast (no secrets in it)
 Table UI  ──fetch my view──────▶ player_views (RLS: only your own row)
```

The **same game engine code** runs in three places:
1. On the server, as the real authority for online games, including games against AI members that count for the shared club (§2.11).
2. In the browser for the offline version.
3. In automated tests.

---

## 2. Key technical decisions

### 2.1 Repository structure (single repo)

```
card-club/
├─ apps/web/                 React + TypeScript front end (PWA)
├─ packages/engine/          PURE TypeScript, zero dependencies
│  ├─ core/                  cards, secure shuffle, GameModule interface, LocalSession
│  ├─ take2/ poker/ hearts/ gin/ blackjack/ solitaire/
│  └─ tests/
├─ supabase/                 migrations, Edge Functions, RLS tests (online phase)
├─ docs/
└─ .github/workflows/        CI tests + deploy
```

### 2.2 The pluggable game-mode interface
Every game implements the same contract: `setup`, `legalActions`, `apply`, `viewFor`, `timeoutAction`, `isFinished`. Rooms, lobby, realtime, timers, rewards and stats are written once against it.

### 2.3 Hidden information
- **Private state:** the full state (deck order, every hand) lives in `game_state_private`, which no client can read under RLS.
- **Public state:** `game_state_public` holds what everyone may see.
- **Your own view:** `player_views` has one row per seated player, and RLS lets you read only your own.
- **Realtime messages** carry only "room X is now at version N" plus public animation events.

### 2.4 Concurrency
- **Version check:** each game row has a version number, and actions lock the row and are rejected if the version they saw is stale.
- **No double-applies:** every action carries a client-generated `action_id` with a unique constraint, so a retried network request can never be applied twice.

### 2.5 Shuffling and fairness
- **Every shuffle:** Fisher–Yates using `crypto.getRandomValues` with rejection sampling, so there's no modulo bias.
- **Fresh decks:** every hand, round and match starts from a freshly shuffled deck. Blackjack uses a six-deck shoe, reshuffled when about a quarter is left. Nothing is rigged or predetermined, and AI players see only their own view.
- **Exceptions:**
  - The **Solitaire Daily Deal** is deliberately the same shuffle for everyone that day, seeded from the date. It's still a random shuffle, just a shared one.
  - Automated tests use fixed seeds so results are repeatable.
- **Online:**
  - The shuffle happens on the server, so no browser (nor the developer) can see or influence a live deck.
  - A hash of the deck is stored at deal time so hands can be audited afterwards.
  - Optional "provably fair" mode: the hash is shown to players before the hand and the deck after, so anyone can check nothing changed mid-hand.

### 2.6 AI opponents
- **Same view as a human:** AI receives exactly the `PlayerView` a human would, so it can't see hidden cards.
- **Online:** AI turns run server-side with a randomised thinking delay. A scheduled sweeper handles timeouts and any AI turn that stalls.

### 2.7 Accounts: username and password, no email (decided)
- **Sign-up:** choose a **username** and **password**. No email is asked for or stored.
- **Behind the scenes:** Supabase Auth needs an address internally, so each account gets a private placeholder that can't receive mail (e.g. `<random-id>@users.cardclub.invalid`). Players never see it. An `auth-login` Edge Function signs in by username.
- **Recovery:** at sign-up the player gets **one-time recovery codes**, shown once and stored hashed. A recovery function accepts a code and sets a new password. Without a code, the only route is an admin reset (the owner).
- **Protections:** rate limits on login, sign-up and recovery, and the same error message whether or not a username exists. Optional CAPTCHA.
- **Usernames:** case-insensitive unique, 3–20 characters, with a filter for offensive names.

### 2.8 Currency and economy
- **Wallets:** balances live in a `wallets` table that players can read but never write.
- **Ledger:** every change goes through `ledger_apply(user, currency, amount, reason, idempotency_key)`, which refuses to go below zero and can't pay twice.
- **Server-run rewards:** coins and XP are only awarded for games the server ran. The offline file keeps its own local coins, and these don't carry over.

### 2.9 Avatars
Full-body layered SVG characters drawn in code; items are data. See WARDROBE.md.

### 2.10 Hosting & deployment
- **Front end:** Cloudflare Pages (recommended) or Netlify.
- **Supabase deploys:** migrations and Edge Functions deploy via GitHub Actions secrets, so service keys are never pasted into chat or committed.
- **What the browser sees:** only the Supabase URL and anon key, which are designed to be public. RLS does the protecting.

### 2.11 One shared club online (decided)
- **Rankings:** everyone who signs up is in the same club as the 25 AI members, with one ranking ladder per game for humans and AI together. A "Players only" filter shows just the people who signed up.
- **Titles and Cups:**
  - Each game has one title, which can be held by a person or an AI member, and is defended against whoever earns the shot.
  - Club Cups draw from both people and AI members, and AI fills empty places.
- **Shared AI members:** Mags is the same Mags for everyone, so if your brother beats her, her rating drops for you too.
  - Each member's signature item still needs five wins against them, counted per player.
- **Head-to-head:** records between real players (you vs your brother) sit alongside records against AI members.
- **Seats:**
  - Practice against AI means AI members fill every seat.
  - Online tables fill with friends first, then AI members.
  - Both count for the shared club, because the server runs them.
- **Background activity:** members playing each other in the background (the "club news") runs on a server schedule instead of in each browser.

---

## 3. Database schema (first draft)
- **Identity:** `profiles` (username, level, xp, look), `profile_private` (recovery-code hashes), `player_settings`.
- **Social:** `friendships`, `blocks`, `reports`.
- **Rooms and games:** `rooms`, `room_seats`, `game_states_public`, `game_states_private`, `player_views`, `game_actions`.
- **Club:** `club_members` (humans + AI), `ratings` (member, game), `titles` and `title_reigns`, `cups` and `cup_entries`, `head_to_head`, `club_news`.
- **Economy and cosmetics:** `wallets`, `currency_transactions`, `cosmetic_items`, `player_inventory`, `equipped_items`.
- **Stats:** `matches`, `match_participants`, `player_stats`, `solitaire_daily` (date, player, time, moves).

---

## 4. Next steps when online starts
1. Create an empty GitHub repo (`card-club`). I'll attach it and push the code.
2. Create a free Supabase project (EU region). Share only the Project URL and anon key.
3. Choose a host: Cloudflare Pages (recommended) or Netlify.
4. Phase order online: accounts and shared club → Take 2 online with friends → the other games → coins and shop on the server.
