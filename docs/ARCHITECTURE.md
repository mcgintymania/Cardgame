# CARD CLUB — Architecture & Development Plan (v0.1, proposal)

Status: **offline build in progress** (Take 2 + Hold'em vs AI, the Club, titles, Cups).
Date: 18 Oct 2026

## Decisions so far
- **Build order changed by the owner:** games and design first, offline against AI; GitHub and
  Supabase (accounts, online play, server-held coins) follow.
- **No real money, ever.** Club coins are earned in play and spent on cosmetics only.
- Take 2 house rules confirmed after play-testing (see RULES-TAKE2.md).
- 25-member AI club with per-game skill, ratings, defended titles, Club Cups, trophy cabinet and
  head-to-head records (see CLUB.md). The same records will cover friends online.
- Target game list for launch: Take 2, Hold'em, Blackjack, Five-Card Draw, Hearts, Gin Rummy.
- Shop/wardrobe UI can be built offline; spending switches on once coins live on the server.
  Ideas agreed: win a member's signature item by beating them, own-table customisation,
  items that record achievements, membership tiers.

---

## 0. Project review

- No existing Card Club repository was found on the connected GitHub account (repos present: BOOKEDFamily, BOOKED-RingsideEmpire, BOOKED-PitchSideEmpire, Yorkshiremarketlord — none related).
- The claude.ai Project "Cards" has no docs yet.
- **Conclusion:** this is a fresh build. Nothing existing needs preserving.

---

## 1. The big picture in plain English

The browser is a **display and input device only**. It shows the table and sends *intentions* ("I want to play the 7♥", "I raise 200"). A trusted server function decides whether that's legal, updates the game, and tells each player only what they're allowed to see.

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
1. On the server (the real authority for online games).
2. In the browser for offline "practise vs AI" (no rewards — so cheating it gains nothing).
3. In automated tests.

That one decision is what makes the project manageable: rules are written once, tested once, and used everywhere.

---

## 2. Key technical decisions

### 2.1 Repository structure (single repo, "monorepo")

```
card-club/
├─ apps/web/                 React + Vite + TypeScript front end (PWA)
│  └─ src/
│     ├─ app/                routing, providers, layout, nav
│     ├─ design/             design system: tokens, Button, Panel, Modal, Card, Chip…
│     ├─ features/           auth, home, play, lobby, profile, shop, wardrobe…
│     ├─ tables/             TableScene, PokerTable, Take2Table, seat layouts
│     ├─ avatar/             layered SVG avatar renderer
│     └─ lib/                supabase client, realtime hooks, audio, settings
├─ packages/engine/          PURE TypeScript, zero dependencies
│  ├─ core/                  cards, deck, secure shuffle, GameModule interface
│  ├─ take2/                 rules config, reducer, scoring, views, AI
│  ├─ poker/                 hand evaluator, betting, pots, reducer, views, AI
│  └─ tests/                 Vitest suites
├─ supabase/
│  ├─ migrations/            versioned SQL (schema, RLS, functions)
│  ├─ functions/             Edge Functions (Deno): game-action, rooms, auth, tick
│  └─ tests/                 RLS / permission tests
├─ docs/                     ARCHITECTURE, RULES-TAKE2, SETUP, DEPLOY, SECURITY
└─ .github/workflows/        CI tests + deploy
```

The engine has no npm dependencies and uses explicit `.ts` imports so it runs unchanged in Node (Vite/Vitest) and Deno (Edge Functions).

### 2.2 The pluggable game-mode interface

Every game (Take 2, Poker, later Blackjack, Crazy Eights…) implements the same contract:

```ts
interface GameModule<Config, State, Action, PlayerView> {
  id: 'take2' | 'poker' | string;
  validateConfig(c: unknown): Config;
  setup(config: Config, seats: Seat[], rng: Rng): State;
  legalActions(state: State, seat: SeatId): Action[];
  apply(state: State, seat: SeatId, action: Action, rng: Rng): { state: State; events: GameEvent[] };
  viewFor(state: State, seat: SeatId | 'spectator'): PlayerView;   // the ONLY thing clients/AI see
  timeoutAction(state: State, seat: SeatId): Action;               // auto-fold / auto-draw
  result(state: State): MatchResult | null;                        // when finished
}
```

Rooms, lobby, realtime, timers, rewards and stats are written once against this interface. Adding a game = writing one new module + its table UI.

### 2.3 Hidden information

- Full state (deck order, every hand) lives in `game_state_private` — **no** client access at all under RLS.
- `game_state_public` holds what everyone may see (discard top, pot, community cards, card counts).
- `player_views` holds one row per seated player (their own cards + public info). RLS: you can only read the row where `user_id = auth.uid()`.
- Realtime messages contain only "room X is now at version N" plus public animation events. Clients then fetch their own view. Nothing secret ever travels on a shared channel.
- **Spectators:** they get `viewFor('spectator')` (no hole cards until showdown). Off by default; on by host choice.

### 2.4 Concurrency (two people clicking at once)

Each game row has a `version` number. The action function opens a database transaction, locks the row (`SELECT … FOR UPDATE`), and rejects the action if the version the client saw is stale. Only one action can win; the loser just refreshes. Every action also carries a client-generated `action_id` with a unique constraint, so a retried network request can never be applied twice.

### 2.5 Shuffling

Server-side Fisher–Yates using `crypto.getRandomValues` with rejection sampling (no modulo bias). A hash of the shuffled deck is stored at deal time so hands can be audited later without exposing them live.

### 2.6 AI opponents

- AI receives exactly the same `PlayerView` a human would — enforced by TypeScript types. It physically cannot see hidden cards because the function it's given doesn't contain them.
- Personalities are parameter sets (cautious / aggressive / unpredictable / beginner) over one decision function, so they can be tuned without code rewrites.
- Online, AI turns run server-side after the preceding action, with a randomised "thinking" delay. A scheduled sweeper (pg_cron) also handles turn timeouts and any AI turn that stalls.

### 2.7 Username + password login

Supabase Auth is built around email. Proposed approach:

- At sign-up you pick a **username** and **password**, plus an email address that is **optional**.
- A server-side `auth-login` Edge Function looks up the account behind the username and performs the sign-in. The browser never learns anyone's email, and no username→password data exists anywhere outside Supabase Auth's hashed storage.
- **If an email was given:** recovery by standard Supabase password-reset email.
- **If no email:** Supabase still needs an address internally, so a private non-routable placeholder is used, and the player receives **one-time recovery codes** at sign-up (shown once, stored hashed). A recovery Edge Function accepts a code and sets a new password.
- Rate limiting on login/sign-up/recovery, and optional CAPTCHA (Supabase supports hCaptcha/Turnstile).

**Decision needed from you:** make email optional (above), required (simplest and most robust recovery), or never collected (recovery codes only).

### 2.8 Currency and economy

- Balances live in a `wallets` table that players can read but **never write**.
- Every change goes through one SQL function, `ledger_apply(user, currency, amount, reason, idempotency_key)`, which: writes a `currency_transactions` row, updates the balance, and refuses if the balance would go below zero (also enforced by a CHECK constraint). The idempotency key makes duplicate payouts impossible.
- Poker buy-in moves chips wallet → table stack (escrow); cash-out moves them back when you leave. Chips at a table are always accounted for.
- **Anti-farming:** offline practice doesn't touch the wallet. Online AI-only/mixed tables earn rewards under a daily cap. All values live in a `economy_config` table so you can rebalance without code changes.

### 2.9 Avatars

Layered SVG (body/skin → hair → clothing → accessories), drawn originally in code. Each cosmetic item is data (`slot`, `layer`, `svg asset`, `rarity`). The renderer sits behind an `<Avatar config={…} />` component so a 3D renderer could replace it later without touching the rest of the app.

### 2.10 Hosting & deployment

- Front end: **Cloudflare Pages** or **Netlify** (free tier, auto-deploy from GitHub, proper SPA routing). GitHub Pages works but handles routing awkwardly.
- Supabase migrations and Edge Functions deploy via a **GitHub Actions** workflow using secrets stored in GitHub. This means your Supabase access token and service-role key are never pasted into chat or committed.
- Only the Supabase **URL** and **anon (public) key** appear in browser code — these are designed to be public; RLS is what protects data.

---

## 3. Database schema (first draft)

All tables: UUID primary keys, `created_at`/`updated_at`, foreign keys, RLS enabled.
"Read" = what a logged-in player can select. Writes marked *server* happen only via Edge Functions / SECURITY DEFINER functions.

| Area | Table | Player access |
|---|---|---|
| Identity | `profiles` (id = auth user, username unique/case-insensitive, level, xp, avatar_config, created_at) | read public columns of anyone; write own display prefs only |
| | `profile_private` (recovery email flag, recovery code hashes) | none |
| | `player_settings` (audio, reduced motion, table theme, card style) | own read/write |
| Social | `friendships` (requester, addressee, status) | own rows |
| | `blocks`, `mutes` | own rows |
| | `clubs`, `club_members` (role) | members only |
| | `reports` | insert own; no read |
| Rooms | `rooms` (mode, visibility, invite_code, host, config, status, max_seats) | public rooms + rooms you're in |
| | `room_seats` (room, seat_no, user_id or ai_profile, connected, last_seen) | rooms you're in / public |
| Game state | `game_states_public` (room, version, public json) | room members (+ spectators if enabled) |
| | `game_states_private` (room, version, full state) | **none** |
| | `player_views` (room, user, version, view json) | own row only |
| | `game_actions` (room, version, seat, action, action_id unique) | own actions; server writes |
| History | `matches`, `match_participants` (placement, knockouts, chips +/−) | read |
| | `poker_hands`, `poker_actions` (revealed info only after hand ends) | participants |
| | `take2_rounds` (scores per player per round) | participants |
| Economy | `wallets` (user, chips, coins; CHECK ≥ 0) | own read |
| | `currency_transactions` (append-only ledger) | own read |
| | `economy_config` | read |
| Progression | `achievements`, `player_achievements` | read |
| | `challenges`, `player_challenges` | own read |
| | `player_stats` (per mode; materialised from matches) | read |
| Cosmetics | `cosmetic_items`, `player_inventory`, `equipped_items` | catalogue read; own inventory read; equip via function |
| Moderation | `moderation_actions` | none |
| Ops | `rate_limits` (key, window, count) | none |

Leaderboards are SQL views over `player_stats` with minimum-games thresholds (so a 1–0 player doesn't top "win rate").

---

## 4. Game state machines (summary)

**Room:** `open → starting → in_progress → finished → (rematch → starting | closed)`

**Take 2 match:** `dealing → turn(seat) ⇄ pending_penalty / choosing_suit → round_over → (next round | match_over)`

**Poker hand:** `waiting → post_blinds → preflop → flop → turn → river → showdown → payout → next hand` (any street can short-circuit to payout when one player remains; all-in runs out remaining board).

Disconnects: seat marked disconnected after missed heartbeats; your turn timer keeps running; on expiry the engine's `timeoutAction` applies (poker: check/fold; Take 2: draw). Repeated timeouts → sit-out / forfeit (configurable). Reconnect = fetch latest view; nothing to replay.

---

## 5. Take 2 — rules ambiguities and PROPOSED defaults

These are **not confirmed rules**. Each becomes a host setting; the default column is only my suggestion until you confirm.

| # | Question | Proposed default (unconfirmed) | Configurable options |
|---|---|---|---|
| 1 | What makes a card playable? (spec doesn't say) | Match suit **or** rank of top discard (Crazy-Eights style) | suit-only / suit-or-rank |
| 2 | Jack's action | Changes active suit; player chooses suit | change suit / reverse direction / none |
| 3 | Can a Jack be played on anything (wild)? | Yes | wild / must match |
| 4 | Can you answer a 2 with another 2? | Yes, stacks (+2 each) | stack / no stack |
| 5 | Can you answer an 8 (skip) with another 8? | No | yes / no |
| 6 | Can't play — what happens? | Draw 1; may play it immediately if legal | draw 1 / draw until playable |
| 7 | Starting hand size | 7 | 5–10 |
| 8 | When is hand value scored? | Only at round end (value shown live as a preview) | — |
| 9 | Elimination: cumulative or per-hand? | **Cumulative** — hand value added to running total each round | cumulative / single hand |
| 10 | Exactly 100 eliminates? | Yes (≥ 100, per your spec) | ≥ / > |
| 11 | Round ends when… | First player empties their hand (they score 0 that round) | — |
| 12 | Hand containing only 2s | Scores 0 (0 × 2 = 0) — flagging as odd | 0 / treat each 2 as 2 then double |
| 13 | 8 in a 2-player game | Skips opponent → you play again | — |
| 14 | First discard flipped is an action card | No effect; flip again if it's a 2/8/J | apply / re-flip |
| 15 | Draw pile empty | Reshuffle discard (minus top card) | — |
| 16 | Who starts each round | Rotates left each round | — |
| 17 | Multiplier cap | None | none / cap at N |

Scoring as specified: A=1, 3–7 & 9–10 = face, 8=10, Q=10, K=10, J=20, each 2 doubles the sum of non-2 cards. Example: 5 + 10 + 2 + 2 → 15 × 4 = 60.

---

## 6. Recommended phase order (one change from your plan)

| Phase | Content | Why |
|---|---|---|
| **1 Foundation** | Repo, design system, app shell & responsive nav, Supabase project, migrations for identity/settings/wallets, username login, profile page, CI | as specified |
| **2 Take 2 (offline)** | Engine + rules config + scoring + actions + AI + table UI, practice vs AI in browser, full tests | as specified |
| **3 Online multiplayer (Take 2)** ⬅ moved up | Rooms, invite codes, server-authoritative game-action, realtime, presence, reconnect, timeouts, mixed human/AI, concurrency tests | Proves the hardest infrastructure on the simpler game. Poker is then built online from day one instead of retrofitted. |
| **4 Poker** | Evaluator, betting, side pots, table UI (2–9 seats), AI, buy-in escrow & payouts — online + offline | — |
| **5 Progression** | Ledger rewards, XP/levels, stats, achievements, leaderboards, daily rewards | — |
| **6 Customisation & social** | Avatar creator, wardrobe, shop, friends, clubs, emotes, quick chat, block/mute/report, challenges | — |
| **7 Polish & deploy** | PWA, audio, animation polish, accessibility pass, security review, performance, final docs | — |

Phases 1–2 each end with a working, testable build and a stop for your approval.

---

## 7. Main risks

1. **Scope.** This is a large game. Biggest mitigation: the shared engine interface and strict phase gates. Expect Phases 3 and 4 to be the longest.
2. **Server-authoritative latency.** Each action is a round trip to an Edge Function (typically a few hundred ms). Fine for turn-based card games; UI will show optimistic "pending" states and animate on confirmation.
3. **AI timing on serverless.** Edge Functions aren't long-running processes. AI delays happen inside the request plus a pg_cron sweeper; needs testing early in Phase 3.
4. **Poker correctness.** Side pots with multiple all-ins, odd-chip splits and heads-up blind rules are classic bug sources — covered by a large test table.
5. **Username auth.** Custom login path must be rate-limited and must not reveal whether a username exists via different error messages.
6. **Supabase free tier.** Free projects pause after a period of inactivity and have connection/message limits. Fine for development and friends; a paid plan may be needed for a public launch.
7. **9-seat poker on phones.** Needs a dedicated portrait layout (compact seats, your cards enlarged at the bottom), not a scaled-down desktop table.
8. **Gambling perception.** Free virtual chips with no cash value and no purchases. Decided: no real-money purchases at all.
9. **My environment.** I can edit the GitHub repo directly, but I likely can't reach your Supabase project from here. You'll apply migrations/deploys (or the GitHub Action will) and tell me results. I won't claim something is deployed or tested online unless it actually was.

---

## 8. What I need from you before Phase 1

1. **Create an empty GitHub repo** (suggested name `card-club`) — I can then attach it and push code.
2. **Create a free Supabase project** (region: EU, e.g. Frankfurt/London, suits Madrid). Later share only the **Project URL** and **anon public key**. Never paste the service-role key into chat.
3. **Choose a host:** Cloudflare Pages (recommended) or Netlify.
4. **Answer:** email optional / required / never (§2.7); approve the phase reorder (§6).
5. **Take 2 rules (§5)** — needed before Phase 2, not Phase 1. Corrections to any default are welcome.
