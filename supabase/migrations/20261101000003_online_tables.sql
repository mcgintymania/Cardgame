-- =============================================================================
-- CARD CLUB — online tables (migration 3)
-- Run after migrations 1 and 2. Adds what the "game" Edge Function needs to
-- record a finished online match in ONE transaction: ratings, head-to-heads,
-- coins, XP, stats, streaks and club news. Safe to run twice for the same room
-- (the second call just returns the first result).
-- =============================================================================

alter table public.matches add column if not exists summary jsonb;
create unique index if not exists matches_room_unique on public.matches (room_id) where room_id is not null;

create or replace function public.level_for_xp(p_xp integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  lvl integer := 1;
  left_xp integer := p_xp;
begin
  -- Must match levelInfo() in progress.ts: level n needs 100 + 40(n-1) XP.
  while left_xp >= 100 + 40 * (lvl - 1) loop
    left_xp := left_xp - (100 + 40 * (lvl - 1));
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

create or replace function public.game_display_name(g text) returns text
language sql immutable set search_path = '' as $$
  select case g when 'take2' then 'Take 2' when 'poker' then 'Hold''em' when 'hearts' then 'Hearts' when 'gin' then 'Gin Rummy'
                when 'draw' then 'Five-Card Draw' when 'blackjack' then 'Blackjack' else g end
$$;

-- p_seats: one object per seat {kind:'human',user_id,name} | {kind:'ai',ai_key,name}
-- p_placements: seats, best first.
create or replace function public.finish_match(p_room uuid, p_game text, p_seats jsonb, p_placements integer[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n          integer := jsonb_array_length(p_seats);
  members    uuid[] := '{}';
  ratings    double precision[] := '{}';
  delta      double precision[] := '{}';
  place      integer[] := '{}';
  v_member   uuid;
  v_seat     jsonb;
  v_rating   integer;
  i integer; j integer; a integer; b integer;
  expect_a   double precision;
  d          double precision;
  k          constant double precision := 32;
  v_match    bigint;
  v_summary  jsonb := '[]'::jsonb;
  v_coins    integer;
  v_xp       integer;
  v_won      boolean;
  v_new      integer;
  v_names    text[] := '{}';
  v_existing jsonb;
begin
  if not public.is_club_game(p_game) then raise exception 'Unknown game %', p_game; end if;
  if n < 2 or coalesce(array_length(p_placements, 1), 0) <> n then raise exception 'Placements must list every seat.'; end if;

  select m.summary into v_existing from public.matches m where m.room_id = p_room;
  if found then return v_existing; end if;

  -- Each seat's club member and current rating.
  for i in 0 .. n - 1 loop
    v_seat := p_seats -> i;
    if v_seat ->> 'kind' = 'human' then
      select cm.id into v_member from public.club_members cm where cm.user_id = (v_seat ->> 'user_id')::uuid;
    else
      select cm.id into v_member from public.club_members cm where cm.ai_key = v_seat ->> 'ai_key';
    end if;
    if v_member is null then raise exception 'Seat % has no club member.', i; end if;
    insert into public.ratings (member_id, game, rating, peak) values (v_member, p_game, 1000, 1000) on conflict do nothing;
    select r.rating into v_rating from public.ratings r where r.member_id = v_member and r.game = p_game for update;
    members := members || v_member;
    ratings := ratings || v_rating::double precision;
    delta := delta || 0::double precision;
    place := place || 0;
    v_names := v_names || (v_seat ->> 'name');
  end loop;
  for i in 1 .. n loop place[p_placements[i] + 1] := i; end loop;

  -- Pairwise Elo, like the offline club: each finisher "beats" everyone below them.
  for i in 1 .. n loop
    for j in i + 1 .. n loop
      a := p_placements[i] + 1;
      b := p_placements[j] + 1;
      expect_a := 1 / (1 + power(10, (ratings[b] - ratings[a]) / 400));
      d := (k / (n - 1)) * (1 - expect_a);
      delta[a] := delta[a] + d;
      delta[b] := delta[b] - d;
    end loop;
  end loop;

  insert into public.matches (game, kind, room_id, finished_at) values (p_game, 'casual', p_room, now()) returning id into v_match;

  for i in 1 .. n loop
    v_new := round(ratings[i] + delta[i]);
    update public.ratings set
      rating = v_new, peak = greatest(peak, v_new), played = played + 1,
      wins = wins + case when place[i] = 1 then 1 else 0 end,
      podiums = podiums + case when place[i] <= greatest(1, least(3, n - 1)) then 1 else 0 end
    where member_id = members[i] and game = p_game;
    insert into public.match_participants (match_id, member_id, place, rating_before, rating_after)
      values (v_match, members[i], place[i], ratings[i]::integer, v_new);

    v_seat := p_seats -> (i - 1);
    v_coins := 0; v_xp := 0;
    if v_seat ->> 'kind' = 'human' then
      v_won := place[i] = 1;
      v_coins := case when v_won then 60 when place[i] <= least(3, n - 1) then 25 else 15 end;
      v_xp := case when v_won then 40 else 15 end;
      perform public.ledger_apply((v_seat ->> 'user_id')::uuid, v_coins,
        public.game_display_name(p_game) || case when v_won then ' table: won' else ' table: played' end, 'match:' || p_room::text);
      update public.profiles set xp = xp + v_xp, level = public.level_for_xp(xp + v_xp) where id = (v_seat ->> 'user_id')::uuid;
      insert into public.player_game_stats (user_id, game, played, won) values ((v_seat ->> 'user_id')::uuid, p_game, 1, case when v_won then 1 else 0 end)
        on conflict (user_id, game) do update set played = public.player_game_stats.played + 1, won = public.player_game_stats.won + excluded.won;
      insert into public.player_streaks (user_id, current, best) values ((v_seat ->> 'user_id')::uuid, case when v_won then 1 else 0 end, case when v_won then 1 else 0 end)
        on conflict (user_id) do update set
          current = case when v_won then public.player_streaks.current + 1 else 0 end,
          best = greatest(public.player_streaks.best, case when v_won then public.player_streaks.current + 1 else 0 end);
    end if;
    v_summary := v_summary || jsonb_build_object('seat', i - 1, 'place', place[i], 'ratingBefore', ratings[i]::integer, 'ratingAfter', v_new, 'coins', v_coins, 'xp', v_xp);
  end loop;

  -- Head to head: everyone at the table against everyone else.
  for i in 1 .. n loop
    for j in i + 1 .. n loop
      a := p_placements[i] + 1;   -- finished above
      b := p_placements[j] + 1;
      if members[a] < members[b] then
        insert into public.head_to_head (member_a, member_b, game, a_wins, b_wins) values (members[a], members[b], p_game, 1, 0)
          on conflict (member_a, member_b, game) do update set a_wins = public.head_to_head.a_wins + 1;
      else
        insert into public.head_to_head (member_a, member_b, game, a_wins, b_wins) values (members[b], members[a], p_game, 0, 1)
          on conflict (member_a, member_b, game) do update set b_wins = public.head_to_head.b_wins + 1;
      end if;
    end loop;
  end loop;

  insert into public.club_news (game, kind, text, members) values (p_game, 'result',
    v_names[p_placements[1] + 1] || ' won a ' || public.game_display_name(p_game) || ' table against ' ||
      (select string_agg(v_names[s + 1], ', ') from unnest(p_placements[2:]) s) || '.',
    members);

  update public.matches set summary = v_summary where id = v_match;
  return v_summary;
end $$;

revoke execute on function public.finish_match(uuid, text, jsonb, integer[]) from public, anon, authenticated;
grant execute on function public.level_for_xp(integer), public.game_display_name(text) to authenticated;

-- Players can see which rooms they're in, and the seats, through the existing policies.
-- Seats can be looked up by any signed-in player for the names and looks at their table.
