-- =============================================================================
-- CARD CLUB — database schema (migration 1 of 2)
--
-- Run this first, then 20261031000002_seed.sql.
--
-- Principles (see docs/ONLINE-PLAN.md):
--   * The browser is a display. Every table has row level security (RLS) on.
--     Players can READ what they're allowed to see; they can never write
--     directly. Coins, items, ratings and games change only through server
--     functions (Edge Functions with the service role, or the few SECURITY
--     DEFINER functions below that check everything themselves).
--   * Username + password accounts, no email. Supabase Auth needs an address
--     internally, so the sign-up Edge Function uses a private placeholder
--     (<uuid>@users.cardclub.invalid) and passes the username in user metadata.
--   * One shared club: people and the 25 AI members share one set of ratings,
--     titles, Cups and news.
--   * No real money, ever. Club coins are earned in play.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------- helpers

-- Every game in the club (solitaire and pyramid are solo, so no ratings).
create or replace function public.is_club_game(g text) returns boolean
language sql immutable set search_path = '' as $$
  select g in ('take2', 'poker', 'hearts', 'gin', 'draw', 'blackjack')
$$;

create or replace function public.is_any_game(g text) returns boolean
language sql immutable set search_path = '' as $$
  select g in ('take2', 'poker', 'hearts', 'gin', 'draw', 'blackjack', 'solitaire', 'pyramid')
$$;

-- Usernames: 3–20 letters, numbers or underscores; case-insensitive unique
-- (see the index on profiles); a few names are reserved.
create or replace function public.username_ok(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u ~ '^[A-Za-z0-9_]{3,20}$'
     and lower(u) not in ('admin', 'administrator', 'moderator', 'mod', 'support', 'system', 'cardclub', 'card_club',
                          'dealer', 'lou', 'house', 'staff', 'owner', 'root', 'null', 'undefined', 'you', 'anonymous')
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================== identity

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null check (public.username_ok(username)),
  level       integer not null default 1 check (level >= 1),
  xp          integer not null default 0 check (xp >= 0),
  -- Character: body, face, hair and what's worn (item ids). Validated by save_look().
  look        jsonb not null default '{}'::jsonb,
  -- Table things: felt, rail, card backs, celebration, prop (item ids).
  table_look  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_username_ci on public.profiles (lower(username));
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
comment on table public.profiles is 'Public player profile. Readable by signed-in players; written only by server functions.';

-- Never readable by anyone but the server: hashed one-time recovery codes.
create table public.profile_private (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  recovery_hashes text[] not null default '{}',
  updated_at      timestamptz not null default now()
);

create table public.player_settings (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create trigger player_settings_touch before update on public.player_settings for each row execute function public.touch_updated_at();

-- Rate limiting for sign-in, sign-up and recovery (used by Edge Functions).
create table public.auth_attempts (
  id      bigint generated always as identity primary key,
  bucket  text not null,            -- e.g. 'login:ip:1.2.3.4' or 'login:user:sean'
  at      timestamptz not null default now()
);
create index auth_attempts_bucket_at on public.auth_attempts (bucket, at desc);

-- ================================================================ social

create table public.friendships (
  user_a        uuid not null references public.profiles (id) on delete cascade,
  user_b        uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  requested_by  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);

create table public.blocks (
  blocker  uuid not null references public.profiles (id) on delete cascade,
  blocked  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- ============================================================= cosmetics

-- The catalogue (seeded from apps/web/src/lib/catalogue.ts by scripts/gen-seed.ts).
create table public.cosmetic_items (
  id          text primary key,
  name        text not null,
  slot        text not null,
  kind        text not null,
  rarity      text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  -- How it's got: {"kind":"shop","price":400,"tier":"gold"} | {"kind":"starter"} | {"kind":"level","level":10}
  -- | {"kind":"signature","member":"mags","wins":5} | {"kind":"achievement","key":"moon"}
  -- | {"kind":"play","count":25,"game":"hearts"} | {"kind":"win","count":5}
  unlock      jsonb not null,
  season      text,
  data        jsonb not null default '{}'::jsonb   -- colours, description
);

create table public.inventory (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  item_id      text not null references public.cosmetic_items (id),
  source       text not null,                     -- 'shop', 'earned', 'bundle', 'case', 'gift', 'admin'
  acquired_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ============================================================== economy

create table public.wallets (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  coins       bigint not null default 0 check (coins >= 0),
  updated_at  timestamptz not null default now()
);

-- Every coin movement, ever. Idempotent: the same key can't pay twice.
create table public.coin_ledger (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  amount         bigint not null,
  balance_after  bigint not null check (balance_after >= 0),
  reason         text not null,
  idem_key       text not null,
  created_at     timestamptz not null default now(),
  unique (user_id, idem_key)
);
create index coin_ledger_user_time on public.coin_ledger (user_id, created_at desc);

create table public.boosts (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  kind     text not null check (kind in ('xp', 'coins')),
  until    timestamptz not null,
  primary key (user_id, kind)
);

create table public.daily_cut (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  last_day date,
  streak   integer not null default 0
);

create table public.season_gifts (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  gift_key  text not null,                        -- e.g. 'christmas-2026'
  claimed_at timestamptz not null default now(),
  primary key (user_id, gift_key)
);

-- ========================================================== progress & stats

create table public.player_game_stats (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  game     text not null check (public.is_any_game(game)),
  played   integer not null default 0 check (played >= 0),
  won      integer not null default 0 check (won >= 0),
  extra    jsonb not null default '{}'::jsonb,   -- per game: best times, moons, gins…
  primary key (user_id, game)
);

create table public.player_achievements (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  key          text not null,
  achieved_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create table public.player_streaks (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  current  integer not null default 0,
  best     integer not null default 0
);

create table public.solitaire_daily (
  day      date not null,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  won      boolean not null default false,
  time_ms  integer,
  moves    integer,
  tries    integer not null default 0,
  primary key (day, user_id)
);

-- ================================================================ the club

-- Everyone in the club: the 25 AI members and every person who signs up.
create table public.club_members (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('ai', 'human')),
  ai_key      text unique,                          -- 'mags', 'rocco'… for AI members
  user_id     uuid unique references public.profiles (id) on delete cascade,
  name        text not null,
  style       text,                                 -- AI play style
  skills      jsonb,                                -- AI skill per game (0 = doesn't play)
  tagline     text,
  created_at  timestamptz not null default now(),
  check ((kind = 'ai') = (ai_key is not null)),
  check ((kind = 'human') = (user_id is not null))
);

create table public.ratings (
  member_id  uuid not null references public.club_members (id) on delete cascade,
  game       text not null check (public.is_club_game(game)),
  rating     integer not null,
  peak       integer not null,
  played     integer not null default 0,
  wins       integer not null default 0,
  podiums    integer not null default 0,
  primary key (member_id, game)
);
create index ratings_game_rating on public.ratings (game, rating desc);

create table public.titles (
  game       text primary key check (public.is_club_game(game)),
  holder     uuid not null references public.club_members (id),
  won_at     timestamptz not null default now(),
  defences   integer not null default 0,
  won_from   uuid references public.club_members (id)
);

create table public.title_reigns (
  id        bigint generated always as identity primary key,
  game      text not null check (public.is_club_game(game)),
  holder    uuid not null references public.club_members (id) on delete cascade,
  won_at    timestamptz not null,
  lost_at   timestamptz,
  defences  integer not null default 0,
  won_from  uuid references public.club_members (id) on delete set null,
  lost_to   uuid references public.club_members (id) on delete set null
);

create table public.cups (
  id           bigint generated always as identity primary key,
  game         text not null check (public.is_club_game(game)),
  edition      integer not null,
  status       text not null default 'open' check (status in ('open', 'heats', 'final', 'done')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  winner       uuid references public.club_members (id) on delete set null,
  unique (game, edition)
);

create table public.cup_entries (
  cup_id     bigint not null references public.cups (id) on delete cascade,
  member_id  uuid not null references public.club_members (id) on delete cascade,
  stage      text not null default 'heat',          -- 'heat', 'round-1', 'final'…
  place      integer,
  primary key (cup_id, member_id)
);

create table public.head_to_head (
  member_a  uuid not null references public.club_members (id) on delete cascade,
  member_b  uuid not null references public.club_members (id) on delete cascade,
  game      text not null check (public.is_club_game(game)),
  a_wins    integer not null default 0,
  b_wins    integer not null default 0,
  primary key (member_a, member_b, game),
  check (member_a < member_b)
);

create table public.club_news (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  game        text,
  kind        text not null,                        -- 'title', 'cup', 'upset', 'club'…
  text        text not null,
  members     uuid[] not null default '{}'
);
create index club_news_time on public.club_news (created_at desc);

-- ============================================================ rooms & games

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),  -- join code friends type in
  game        text not null check (public.is_club_game(game)),
  kind        text not null default 'casual' check (kind in ('casual', 'title', 'cupHeat', 'cupFinal')),
  host        uuid references public.profiles (id) on delete set null,
  status      text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'abandoned')),
  is_private  boolean not null default true,
  config      jsonb not null default '{}'::jsonb,   -- house rules for this table
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger rooms_touch before update on public.rooms for each row execute function public.touch_updated_at();

create table public.room_seats (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  seat       integer not null check (seat between 0 and 8),
  user_id    uuid references public.profiles (id) on delete cascade,
  ai_key     text,                                  -- an AI member fills the seat
  joined_at  timestamptz not null default now(),
  primary key (room_id, seat),
  unique (room_id, user_id),
  check ((user_id is null) <> (ai_key is null))
);

-- What everyone at the table may see (no hands, no deck order).
create table public.game_states_public (
  room_id     uuid primary key references public.rooms (id) on delete cascade,
  version     integer not null default 0,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- The full state, including the deck. No player can ever read this.
create table public.game_states_private (
  room_id     uuid primary key references public.rooms (id) on delete cascade,
  version     integer not null default 0,
  state       jsonb not null,
  deck_hash   text,                                 -- hash of the shuffled deck, for audits
  updated_at  timestamptz not null default now()
);

-- One row per seated person: exactly what that player may see (their own hand).
create table public.player_views (
  room_id     uuid not null references public.rooms (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  version     integer not null,
  view        jsonb not null,
  primary key (room_id, user_id)
);

-- Every move, in order. action_id makes a retried request harmless.
create table public.game_actions (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,
  seat        integer not null,
  action_id   uuid not null,
  version     integer not null,
  action      jsonb not null,
  created_at  timestamptz not null default now(),
  unique (room_id, action_id)
);
create index game_actions_room on public.game_actions (room_id, id);

create table public.matches (
  id           bigint generated always as identity primary key,
  game         text not null check (public.is_club_game(game)),
  kind         text not null default 'casual',
  room_id      uuid references public.rooms (id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table public.match_participants (
  match_id       bigint not null references public.matches (id) on delete cascade,
  member_id      uuid not null references public.club_members (id) on delete cascade,
  place          integer,
  rating_before  integer,
  rating_after   integer,
  primary key (match_id, member_id)
);

-- Is the signed-in player seated in this room? (Used by policies.)
create or replace function public.is_seated(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_seats s where s.room_id = p_room and s.user_id = (select auth.uid()))
$$;

-- =========================================================== row level security

alter table public.profiles             enable row level security;
alter table public.profile_private      enable row level security;
alter table public.player_settings      enable row level security;
alter table public.auth_attempts        enable row level security;
alter table public.friendships          enable row level security;
alter table public.blocks               enable row level security;
alter table public.cosmetic_items       enable row level security;
alter table public.inventory            enable row level security;
alter table public.wallets              enable row level security;
alter table public.coin_ledger          enable row level security;
alter table public.boosts               enable row level security;
alter table public.daily_cut            enable row level security;
alter table public.season_gifts         enable row level security;
alter table public.player_game_stats    enable row level security;
alter table public.player_achievements  enable row level security;
alter table public.player_streaks       enable row level security;
alter table public.solitaire_daily      enable row level security;
alter table public.club_members         enable row level security;
alter table public.ratings              enable row level security;
alter table public.titles               enable row level security;
alter table public.title_reigns         enable row level security;
alter table public.cups                 enable row level security;
alter table public.cup_entries          enable row level security;
alter table public.head_to_head         enable row level security;
alter table public.club_news            enable row level security;
alter table public.rooms                enable row level security;
alter table public.room_seats           enable row level security;
alter table public.game_states_public   enable row level security;
alter table public.game_states_private  enable row level security;
alter table public.player_views         enable row level security;
alter table public.game_actions         enable row level security;
alter table public.matches              enable row level security;
alter table public.match_participants   enable row level security;

-- Belt and braces: the browser roles can never write to any table directly.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
-- …and never see the server-only tables at all.
revoke all on public.profile_private, public.auth_attempts, public.game_states_private from anon, authenticated;

-- Readable by any signed-in player: the club, the catalogue, profiles.
create policy "signed in can read profiles"      on public.profiles          for select to authenticated using (true);
create policy "signed in can read items"         on public.cosmetic_items    for select to authenticated using (true);
create policy "signed in can read members"       on public.club_members      for select to authenticated using (true);
create policy "signed in can read ratings"       on public.ratings           for select to authenticated using (true);
create policy "signed in can read titles"        on public.titles            for select to authenticated using (true);
create policy "signed in can read reigns"        on public.title_reigns      for select to authenticated using (true);
create policy "signed in can read cups"          on public.cups              for select to authenticated using (true);
create policy "signed in can read cup entries"   on public.cup_entries       for select to authenticated using (true);
create policy "signed in can read h2h"           on public.head_to_head      for select to authenticated using (true);
create policy "signed in can read news"          on public.club_news         for select to authenticated using (true);
create policy "signed in can read matches"       on public.matches           for select to authenticated using (true);
create policy "signed in can read participants"  on public.match_participants for select to authenticated using (true);
create policy "signed in can read daily board"   on public.solitaire_daily   for select to authenticated using (true);
create policy "signed in can read streaks"       on public.player_streaks    for select to authenticated using (true);
create policy "signed in can read stats"         on public.player_game_stats for select to authenticated using (true);
create policy "signed in can read achievements"  on public.player_achievements for select to authenticated using (true);

-- Your own things only.
create policy "own settings"   on public.player_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "own inventory"  on public.inventory       for select to authenticated using (user_id = (select auth.uid()));
create policy "own wallet"     on public.wallets         for select to authenticated using (user_id = (select auth.uid()));
create policy "own ledger"     on public.coin_ledger     for select to authenticated using (user_id = (select auth.uid()));
create policy "own boosts"     on public.boosts          for select to authenticated using (user_id = (select auth.uid()));
create policy "own daily cut"  on public.daily_cut       for select to authenticated using (user_id = (select auth.uid()));
create policy "own gifts"      on public.season_gifts    for select to authenticated using (user_id = (select auth.uid()));
create policy "own blocks"     on public.blocks          for select to authenticated using (blocker = (select auth.uid()));
create policy "own friendships" on public.friendships    for select to authenticated using ((select auth.uid()) in (user_a, user_b));

-- Rooms: public lobbies are listed; private rooms only to those seated
-- (joining a private room by code goes through a server function).
create policy "see open or own rooms" on public.rooms for select to authenticated
  using (not is_private or public.is_seated(id));
create policy "see seats of visible rooms" on public.room_seats for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and (not r.is_private or public.is_seated(r.id))));
create policy "see table if seated or public" on public.game_states_public for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and (not r.is_private or public.is_seated(r.id))));
create policy "see only your own hand" on public.player_views for select to authenticated
  using (user_id = (select auth.uid()));
create policy "see moves at your table" on public.game_actions for select to authenticated
  using (public.is_seated(room_id));
-- profile_private, auth_attempts and game_states_private have NO policies: invisible to players.

-- ============================================================ server functions

-- New account: called by a trigger when the sign-up Edge Function creates the
-- auth user (with user_metadata.username). Sets up profile, wallet and club place.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := new.raw_user_meta_data ->> 'username';
  v_member   uuid;
  g          text;
begin
  if v_username is null or not public.username_ok(v_username) then
    raise exception 'A valid username is required (3–20 letters, numbers or underscores).';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = lower(v_username)) then
    raise exception 'That username is taken.';
  end if;

  insert into public.profiles (id, username, look)
    values (new.id, v_username, coalesce(new.raw_user_meta_data -> 'look', '{}'::jsonb));
  insert into public.profile_private (user_id) values (new.id);
  insert into public.player_settings (user_id) values (new.id);
  insert into public.wallets (user_id, coins) values (new.id, 0);
  perform public.ledger_apply(new.id, 300, 'Welcome to the club', 'welcome');
  insert into public.player_streaks (user_id) values (new.id);

  insert into public.club_members (kind, user_id, name) values ('human', new.id, v_username) returning id into v_member;
  foreach g in array array['take2', 'poker', 'hearts', 'gin', 'draw', 'blackjack'] loop
    insert into public.ratings (member_id, game, rating, peak) values (v_member, g, 1000, 1000);
  end loop;
  insert into public.club_news (kind, text, members) values ('club', v_username || ' joined the club.', array[v_member]);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The ONLY way coins move. Locks the wallet row, refuses to go below zero, and
-- the same idem_key never pays twice (returns the original balance instead).
create or replace function public.ledger_apply(p_user uuid, p_amount bigint, p_reason text, p_key text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_coins bigint;
  v_prev  bigint;
begin
  select l.balance_after into v_prev from public.coin_ledger l where l.user_id = p_user and l.idem_key = p_key;
  if found then return v_prev; end if;

  select w.coins into v_coins from public.wallets w where w.user_id = p_user for update;
  if not found then raise exception 'No wallet for this player.'; end if;
  if v_coins + p_amount < 0 then raise exception 'Not enough coins.'; end if;

  update public.wallets set coins = v_coins + p_amount, updated_at = now() where user_id = p_user;
  insert into public.coin_ledger (user_id, amount, balance_after, reason, idem_key)
    values (p_user, p_amount, v_coins + p_amount, p_reason, p_key);
  return v_coins + p_amount;
end $$;

-- Membership tiers (must match TIERS in catalogue.ts).
create or replace function public.tier_level(p_tier text) returns integer
language sql immutable set search_path = '' as $$
  select case p_tier when 'member' then 1 when 'regular' then 5 when 'gold' then 12 when 'black' then 20 else 1 end
$$;

-- Buy one shop item with club coins. Called from the browser (it checks everything itself).
create or replace function public.buy_item(p_item text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := auth.uid();
  v_item  public.cosmetic_items;
  v_price bigint;
  v_level integer;
begin
  if v_user is null then raise exception 'Please sign in.'; end if;
  select * into v_item from public.cosmetic_items where id = p_item;
  if not found then raise exception 'That item no longer exists.'; end if;
  if v_item.unlock ->> 'kind' <> 'shop' then raise exception 'That item can''t be bought: it''s earned by playing.'; end if;
  if exists (select 1 from public.inventory i where i.user_id = v_user and i.item_id = p_item) then
    raise exception 'You already own this.';
  end if;
  select p.level into v_level from public.profiles p where p.id = v_user;
  if v_item.unlock ? 'tier' and v_level < public.tier_level(v_item.unlock ->> 'tier') then
    raise exception 'Locked until you reach that membership tier.';
  end if;
  v_price := coalesce((v_item.unlock ->> 'price')::bigint, 0);
  perform public.ledger_apply(v_user, -v_price, 'Bought ' || v_item.name, 'buy:' || p_item);
  insert into public.inventory (user_id, item_id, source) values (v_user, p_item, 'shop');
  return (select coins from public.wallets where user_id = v_user);
end $$;

-- Save your character and table look. Every item worn must be one you own
-- (or a starter item); anything else is rejected.
create or replace function public.save_look(p_look jsonb, p_table jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id   text;
begin
  if v_user is null then raise exception 'Please sign in.'; end if;
  if jsonb_typeof(p_look) <> 'object' or jsonb_typeof(p_table) <> 'object' then raise exception 'Bad look.'; end if;
  if length(p_look::text) > 4000 or length(p_table::text) > 2000 then raise exception 'Look too large.'; end if;
  for v_id in
    select value from jsonb_each_text(coalesce(p_look -> 'wear', '{}'::jsonb))
    union all
    select value from jsonb_each_text(p_table)
  loop
    if not exists (select 1 from public.cosmetic_items c where c.id = v_id and (c.unlock ->> 'kind') = 'starter')
       and not exists (select 1 from public.inventory i where i.user_id = v_user and i.item_id = v_id) then
      raise exception 'You don''t own %.', v_id;
    end if;
  end loop;
  update public.profiles set look = p_look, table_look = p_table where id = v_user;
end $$;

-- Your settings (sound, card size…). Small, yours, no game effect.
create or replace function public.save_settings(p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if jsonb_typeof(p_settings) <> 'object' or length(p_settings::text) > 4000 then raise exception 'Bad settings.'; end if;
  update public.player_settings set settings = p_settings where user_id = auth.uid();
end $$;

-- Recovery codes (used by the sign-up and recovery Edge Functions only).
create or replace function public.recovery_set(p_user uuid, p_codes text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profile_private
     set recovery_hashes = (select coalesce(array_agg(extensions.crypt(upper(c), extensions.gen_salt('bf', 10))), '{}') from unnest(p_codes) c),
         updated_at = now()
   where user_id = p_user;
end $$;

-- Checks a recovery code for a username and uses it up. Returns the user id, or null.
create or replace function public.recovery_use(p_username text, p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_hashes text[];
  v_hash text;
begin
  select p.id into v_user from public.profiles p where lower(p.username) = lower(p_username);
  if not found then return null; end if;
  select pp.recovery_hashes into v_hashes from public.profile_private pp where pp.user_id = v_user for update;
  foreach v_hash in array coalesce(v_hashes, '{}') loop
    if extensions.crypt(upper(p_code), v_hash) = v_hash then
      update public.profile_private set recovery_hashes = array_remove(recovery_hashes, v_hash), updated_at = now() where user_id = v_user;
      return v_user;
    end if;
  end loop;
  return null;
end $$;

-- Looks up the hidden sign-in address for a username (sign-in Edge Function only).
create or replace function public.login_email_for(p_username text) returns text
language sql stable security definer set search_path = '' as $$
  select u.email::text from auth.users u join public.profiles p on p.id = u.id where lower(p.username) = lower(p_username)
$$;

-- Who may call what: browser roles get only the safe, self-checking functions.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.buy_item(text), public.save_look(jsonb, jsonb), public.save_settings(jsonb),
  public.is_seated(uuid), public.is_club_game(text), public.is_any_game(text), public.username_ok(text), public.tier_level(text)
  to authenticated;
revoke execute on function public.ledger_apply(uuid, bigint, text, text), public.recovery_set(uuid, text[]),
  public.recovery_use(text, text), public.login_email_for(text), public.handle_new_user() from authenticated;
-- (The service role used by Edge Functions keeps full access.)

-- Realtime: tables only send "room X changed" (the browser then fetches its own view).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_states_public, public.rooms, public.room_seats, public.club_news;
  end if;
end $$;
