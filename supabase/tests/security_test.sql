-- Security tests for the Card Club schema. Run against a scratch database after
-- the migrations (see supabase/README.md). Any failure stops with an error.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
set client_min_messages = warning;

create or replace function public.t_fails(q text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then return; end;
  raise exception 'EXPECTED FAILURE but it worked: %', q;
end $$;
grant execute on function public.t_fails(text) to authenticated, anon;

-- --- sign-up via the auth trigger -----------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '1@users.cardclub.invalid', '{"username":"Sean"}'),
  ('22222222-2222-2222-2222-222222222222', '2@users.cardclub.invalid', '{"username":"Brother"}');
select public.t_fails($q$insert into auth.users (email, raw_user_meta_data) values ('3@x.invalid', '{"username":"sean"}')$q$);   -- taken (any case)
select public.t_fails($q$insert into auth.users (email, raw_user_meta_data) values ('4@x.invalid', '{"username":"a b"}')$q$);    -- invalid
select public.t_fails($q$insert into auth.users (email, raw_user_meta_data) values ('5@x.invalid', '{}')$q$);                     -- missing
select public.t_fails($q$insert into auth.users (email, raw_user_meta_data) values ('6@x.invalid', '{"username":"Admin"}')$q$);   -- reserved
do $$ begin
  assert (select coins from public.wallets where user_id = '11111111-1111-1111-1111-111111111111') = 300, 'welcome coins';
  assert (select count(*) from public.ratings r join public.club_members m on m.id = r.member_id where m.user_id = '11111111-1111-1111-1111-111111111111') = 6, 'ratings';
  assert (select count(*) from public.coin_ledger) = 2, 'ledger rows';
end $$;

-- --- the ledger: idempotent, never negative ----------------------------------
select public.ledger_apply('11111111-1111-1111-1111-111111111111', 50, 'Test win', 'match:1');
select public.ledger_apply('11111111-1111-1111-1111-111111111111', 50, 'Test win', 'match:1');   -- same key: no double pay
do $$ begin assert (select coins from public.wallets where user_id = '11111111-1111-1111-1111-111111111111') = 350, 'idempotent'; end $$;
select public.t_fails($q$select public.ledger_apply('11111111-1111-1111-1111-111111111111', -1000, 'x', 'big')$q$);

-- --- recovery codes ----------------------------------------------------------
select public.recovery_set('11111111-1111-1111-1111-111111111111', array['ABCD-1234', 'WXYZ-9876']);
do $$ begin
  assert public.recovery_use('sean', 'wrong-code') is null, 'wrong code';
  assert public.recovery_use('SEAN', 'abcd-1234') = '11111111-1111-1111-1111-111111111111', 'right code (any case)';
  assert public.recovery_use('sean', 'ABCD-1234') is null, 'codes are single use';
  assert public.login_email_for('sean') = '1@users.cardclub.invalid', 'login lookup';
end $$;

-- --- a private room with Sean seated ------------------------------------------
insert into public.rooms (id, code, game, host) values ('33333333-3333-3333-3333-333333333333', 'ABC123', 'take2', '11111111-1111-1111-1111-111111111111');
insert into public.room_seats (room_id, seat, user_id) values ('33333333-3333-3333-3333-333333333333', 0, '11111111-1111-1111-1111-111111111111');
insert into public.room_seats (room_id, seat, ai_key) values ('33333333-3333-3333-3333-333333333333', 1, 'mags');
insert into public.game_states_public (room_id, state) values ('33333333-3333-3333-3333-333333333333', '{"top":"7H"}');
insert into public.game_states_private (room_id, state) values ('33333333-3333-3333-3333-333333333333', '{"deck":["AS","2S"]}');
insert into public.player_views (room_id, user_id, version, view) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 0, '{"hand":["8H"]}');

-- =========================== as Sean (a signed-in player) ===========================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.wallets) = 1, 'sees only own wallet';
  assert (select count(*) from public.profiles) = 2, 'sees profiles';
  assert (select count(*) from public.rooms) = 1, 'sees own private room';
  assert (select count(*) from public.player_views) = 1, 'sees own hand';
  assert (select count(*) from public.club_members) = 27, 'sees the club';
end $$;
select public.t_fails($q$update public.wallets set coins = 99999$q$);
select public.t_fails($q$insert into public.inventory (user_id, item_id, source) values ('11111111-1111-1111-1111-111111111111', 'tux-black', 'shop')$q$);
select public.t_fails($q$update public.profiles set level = 50$q$);
select public.t_fails($q$update public.ratings set rating = 3000$q$);
select public.t_fails($q$select * from public.profile_private$q$);
select public.t_fails($q$select * from public.game_states_private$q$);
select public.t_fails($q$select public.ledger_apply('11111111-1111-1111-1111-111111111111', 1000, 'cheat', 'cheat')$q$);
select public.t_fails($q$select public.login_email_for('brother')$q$);
select public.t_fails($q$select public.recovery_use('brother', 'x')$q$);
select public.t_fails($q$insert into public.titles (game, holder) values ('take2', gen_random_uuid())$q$);

-- the shop
do $$ begin assert public.buy_item('tee-red') = 200, 'bought tee for 150'; end $$;
select public.t_fails($q$select public.buy_item('tee-red')$q$);           -- already own it
select public.t_fails($q$select public.buy_item('tat-snake')$q$);         -- earned by playing, not for sale
select public.t_fails($q$select public.buy_item('sequin-gold')$q$);       -- Gold Member tier only
select public.t_fails($q$select public.buy_item('dinner-white')$q$);      -- Black Card tier
select public.t_fails($q$select public.buy_item('no-such-item')$q$);
do $$ begin assert (select count(*) from public.inventory) = 1, 'inventory'; end $$;

-- saving a look: only things you own (or starter items)
select public.save_look('{"wear":{"top":"tee-red","jacket":"blazer-navy"}}', '{"felt":"felt-green"}');
select public.t_fails($q$select public.save_look('{"wear":{"jacket":"tux-black"}}', '{}')$q$);
select public.t_fails($q$select public.save_look('{"wear":{}}', '{"felt":"felt-black"}')$q$);
select public.save_settings('{"sound":false}');

-- =========================== as Brother ===========================
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.rooms) = 0, 'cannot see a private room he is not in';
  assert (select count(*) from public.player_views) = 0, 'cannot see Sean''s hand';
  assert (select count(*) from public.game_states_public) = 0, 'cannot see the private table';
  assert (select count(*) from public.inventory) = 0, 'cannot see Sean''s inventory';
  assert (select coins from public.wallets) = 300, 'his own wallet';
  assert (select count(*) from public.coin_ledger) = 1, 'only his ledger';
end $$;

-- =========================== signed out ===========================
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  assert (select count(*) from public.profiles) = 0, 'signed out sees no profiles';
  assert (select count(*) from public.club_members) = 0, 'signed out sees no club';
  assert (select count(*) from public.wallets) = 0, 'signed out sees no wallets';
end $$;
select public.t_fails($q$select public.buy_item('tee-red')$q$);
reset role;
drop function public.t_fails(text);
select 'ALL SECURITY TESTS PASSED' as result;
