-- Card Club: one account, one wallet.
-- When you're signed in, your whole save (coins, items, level, stats, club record,
-- house rules) is kept here, so it follows you to every device. Coins and XP won
-- in online games are folded into the same save the next time your device syncs.
--
-- Safe to run more than once.

create table if not exists public.player_saves (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  rev         integer not null default 0,           -- goes up by one with every save
  save        jsonb,                                -- the same shape as a Settings backup
  xp_seen     integer not null default 0,           -- online XP already folded in
  updated_at  timestamptz not null default now()
);
alter table public.player_saves enable row level security;
drop policy if exists "see your own save" on public.player_saves;
create policy "see your own save" on public.player_saves for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.player_saves from anon, authenticated;

-- Save (p_save not null) or just fetch (p_save null).
--   p_rev is the version this device last saw. If another device saved since,
--   nothing is written and the newer save comes back (conflict) for the device to merge.
--   Online coins waiting in the wallet, and new online XP, are moved into the save.
create or replace function public.sync_save(p_save jsonb, p_rev integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_row    public.player_saves;
  v_coins  bigint;
  v_xp     integer;
  v_first  boolean;
  v_take   bigint;
  v_gain   integer;
  v_save   jsonb;
begin
  if v_user is null then raise exception 'Please sign in.'; end if;
  if p_save is not null and (jsonb_typeof(p_save) <> 'object' or length(p_save::text) > 900000) then
    raise exception 'That save is too large.';
  end if;

  insert into public.player_saves (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_row from public.player_saves where user_id = v_user for update;
  v_first := v_row.save is null;

  if p_save is not null and not v_first and v_row.rev <> coalesce(p_rev, -1) then
    return jsonb_build_object('conflict', true, 'rev', v_row.rev, 'save', v_row.save);
  end if;
  v_save := coalesce(p_save, v_row.save);
  if v_save is null then
    return jsonb_build_object('rev', v_row.rev, 'save', null);
  end if;

  -- Fold in what online games paid out. The 300 welcome coins every account
  -- starts with aren't added again: the save already began with its own.
  select coins into v_coins from public.wallets where user_id = v_user for update;
  select xp into v_xp from public.profiles where id = v_user;
  v_take := greatest(0, coalesce(v_coins, 0) - case when v_first then 300 else 0 end);
  v_gain := greatest(0, coalesce(v_xp, 0) - v_row.xp_seen);
  if v_save #> '{data,wallet}' is null then v_take := 0; v_gain := 0; end if;
  if coalesce(v_coins, 0) > 0 and v_save #> '{data,wallet}' is not null then
    perform public.ledger_apply(v_user, -v_coins, 'Moved into your account save', 'collect:' || v_user || ':' || (v_row.rev + 1));
  end if;
  if v_take > 0 then
    v_save := jsonb_set(v_save, '{data,wallet,coins}', to_jsonb(coalesce((v_save #>> '{data,wallet,coins}')::bigint, 0) + v_take));
  end if;
  if v_gain > 0 then
    v_save := jsonb_set(v_save, '{data,wallet,xp}', to_jsonb(coalesce((v_save #>> '{data,wallet,xp}')::bigint, 0) + v_gain));
  end if;

  -- Nothing new to store: just hand back what's there.
  if p_save is null and v_take = 0 and v_gain = 0 then
    return jsonb_build_object('rev', v_row.rev, 'save', v_row.save);
  end if;

  update public.player_saves
     set save = v_save, rev = v_row.rev + 1, xp_seen = greatest(v_row.xp_seen, coalesce(v_xp, 0)), updated_at = now()
   where user_id = v_user;
  return jsonb_build_object('rev', v_row.rev + 1, 'save', v_save, 'collected', jsonb_build_object('coins', v_take, 'xp', v_gain));
end $$;

revoke execute on function public.sync_save(jsonb, integer) from public, anon;
grant execute on function public.sync_save(jsonb, integer) to authenticated;
