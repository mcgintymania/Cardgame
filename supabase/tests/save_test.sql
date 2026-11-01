-- Tests for sync_save (one account, one wallet). Run after online_test.sql:
-- Bro has 360 coins (300 welcome + 60 online win) and 40 online XP; Sean2 has 325 and 15.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
set client_min_messages = warning;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$
declare r jsonb; save jsonb := '{"app":"card-club","format":1,"data":{"wallet":{"version":1,"coins":500,"xp":100,"owned":[]},"profile":{"name":"Bro"}}}';
begin
  -- Nothing saved yet: fetching gives nothing.
  r := public.sync_save(null, 0);
  assert r->'save' = 'null'::jsonb, 'empty to start';
  -- First save from this device: online winnings (60, not the welcome 300) and 40 XP fold in.
  r := public.sync_save(save, 0);
  assert (r->>'rev')::int = 1, 'rev 1';
  assert (r#>>'{save,data,wallet,coins}')::int = 560, 'coins folded in: ' || (r#>>'{save,data,wallet,coins}');
  assert (r#>>'{save,data,wallet,xp}')::int = 140, 'xp folded in';
  assert (r#>>'{collected,coins}')::int = 60, 'collected 60';
  -- Fetch again: nothing new to collect, same rev.
  r := public.sync_save(null, 1);
  assert (r->>'rev')::int = 1 and (r#>>'{save,data,wallet,coins}')::int = 560, 'fetch is stable';
  -- A device that's behind gets the newer save back, and nothing is written.
  r := public.sync_save(save, 0);
  assert (r->>'conflict')::boolean and (r->>'rev')::int = 1, 'conflict';
  -- Saving from the latest version works.
  r := public.sync_save(jsonb_set(r->'save', '{data,wallet,coins}', '700'), 1); -- built on the newer save
  assert (r->>'rev')::int = 2 and (r#>>'{save,data,wallet,coins}')::int = 700, 'normal save';
  -- Can't read anyone else's save.
  assert (select count(*) from public.player_saves) = 1, 'only your own row';
end $$;
reset role;

-- Bro wins another online game: +60 coins, +40 XP, picked up on the next fetch.
insert into public.rooms (id, code, game, host, status) values ('bbbbbbbb-0000-0000-0000-000000000099', 'ROOM99', 'take2', 'aaaaaaaa-0000-0000-0000-000000000002', 'playing');
select public.finish_match('bbbbbbbb-0000-0000-0000-000000000099', 'take2',
  '[{"kind":"human","user_id":"aaaaaaaa-0000-0000-0000-000000000002","name":"Bro"},{"kind":"ai","ai_key":"mags","name":"Mags Delaney"}]'::jsonb, array[0, 1]) is not null;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$
declare r jsonb;
begin
  r := public.sync_save(null, 2);
  assert (r->>'rev')::int = 3, 'new rev after collecting';
  assert (r#>>'{save,data,wallet,coins}')::int = 760, 'won coins arrive: ' || (r#>>'{save,data,wallet,coins}');
  assert (r#>>'{save,data,wallet,xp}')::int = 180, 'won xp arrives';
  r := public.sync_save(null, 3);
  assert (r->>'rev')::int = 3, 'and only once';
  -- Junk is refused.
  begin perform public.sync_save('"hello"'::jsonb, 3); assert false, 'non-object accepted'; exception when others then null; end;
end $$;
reset role;
do $$ begin
  assert (select coins from public.wallets where user_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0, 'server wallet emptied into the save';
end $$;

-- Strangers can't call it.
set role anon;
do $$ begin
  begin perform public.sync_save(null, 0); assert false, 'anon allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo ALL SAVE TESTS PASSED
