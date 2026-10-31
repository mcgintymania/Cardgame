-- Tests for finish_match. Run after migrations 1-3 (and after security_test.sql if you like).
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
set client_min_messages = warning;
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@users.cardclub.invalid', '{"username":"Sean2"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@users.cardclub.invalid', '{"username":"Bro"}');
insert into public.rooms (id, code, game, host, status) values ('bbbbbbbb-0000-0000-0000-000000000001', 'ROOM01', 'take2', 'aaaaaaaa-0000-0000-0000-000000000001', 'playing');

-- Bro wins, Mags second, Sean third, Pip fourth.
select public.finish_match('bbbbbbbb-0000-0000-0000-000000000001', 'take2',
  '[{"kind":"human","user_id":"aaaaaaaa-0000-0000-0000-000000000001","name":"Sean2"},
    {"kind":"human","user_id":"aaaaaaaa-0000-0000-0000-000000000002","name":"Bro"},
    {"kind":"ai","ai_key":"mags","name":"Mags Delaney"},
    {"kind":"ai","ai_key":"pip","name":"Pip Okafor"}]'::jsonb, array[1, 2, 0, 3]);
-- Calling again changes nothing.
select public.finish_match('bbbbbbbb-0000-0000-0000-000000000001', 'take2',
  '[{"kind":"human","user_id":"aaaaaaaa-0000-0000-0000-000000000001","name":"Sean2"},
    {"kind":"human","user_id":"aaaaaaaa-0000-0000-0000-000000000002","name":"Bro"},
    {"kind":"ai","ai_key":"mags","name":"Mags Delaney"},
    {"kind":"ai","ai_key":"pip","name":"Pip Okafor"}]'::jsonb, array[1, 2, 0, 3]);

do $$
declare s jsonb;
begin
  assert (select coins from public.wallets where user_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 360, 'winner +60 once';
  assert (select coins from public.wallets where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 325, 'third +25';
  assert (select r.rating from public.ratings r join public.club_members m on m.id = r.member_id where m.user_id = 'aaaaaaaa-0000-0000-0000-000000000002' and r.game = 'take2') > 1000, 'winner rating up';
  assert (select r.wins from public.ratings r join public.club_members m on m.id = r.member_id where m.user_id = 'aaaaaaaa-0000-0000-0000-000000000002' and r.game = 'take2') = 1, 'one win';
  assert (select r.played from public.ratings r join public.club_members m on m.id = r.member_id where m.ai_key = 'mags' and r.game = 'take2') = 1, 'Mags played once';
  assert (select count(*) from public.matches) = 1, 'one match';
  assert (select count(*) from public.match_participants) = 4, 'four players';
  assert (select count(*) from public.head_to_head) = 6, 'six pairs';
  assert (select won from public.player_game_stats where user_id = 'aaaaaaaa-0000-0000-0000-000000000002' and game = 'take2') = 1, 'stats';
  assert (select current from public.player_streaks where user_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 1, 'streak';
  assert (select current from public.player_streaks where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'no streak';
  assert (select xp from public.profiles where username = 'Bro') = 40, 'xp';
  assert (select text from public.club_news order by id desc limit 1) = 'Bro won a Take 2 table against Mags Delaney, Sean2, Pip Okafor.', 'news';
  select summary into s from public.matches limit 1;
  assert jsonb_array_length(s) = 4, 'summary';
  -- the rating changes balance out (Elo is zero-sum, give or take rounding)
  assert abs((select sum(rating_after - rating_before) from public.match_participants)) <= 2, 'zero sum';
  assert public.level_for_xp(0) = 1 and public.level_for_xp(99) = 1 and public.level_for_xp(100) = 2 and public.level_for_xp(240) = 3, 'levels';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  begin perform public.finish_match(gen_random_uuid(), 'take2', '[]'::jsonb, '{}'); raise exception 'should not be callable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL ONLINE TESTS PASSED';
