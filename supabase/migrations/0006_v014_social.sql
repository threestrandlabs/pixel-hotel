-- =============================================================================
-- Pixel Hotel v0.14 — friends & presence, room showcase, gumball trades
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste this whole file ->
-- Run (after 0001-0005). Idempotent: safe to re-run.
--
-- Design notes
--   * Friends are one-directional ("I added your code"). A friendship is
--     *mutual* when both sides added each other; only mutual friends can
--     trade, so nobody can be spammed with offers by someone they never
--     added. Presence is a last-seen heartbeat (online = seen < 2 minutes).
--   * The showcase only lists players who opted in (default off: it shows
--     your display name to everyone) and who have shared a room snapshot.
--   * Gumball counts live in each player's own save; the server only holds
--     the trade state machine (pending -> accepted | declined | cancelled,
--     accepted -> completed). Each client applies its side exactly once,
--     tracked by a ledger in its save, so retries never duplicate items.
--   * Every write goes through a SECURITY DEFINER function that checks the
--     caller; tables are read-only (or not readable) to clients.
-- =============================================================================

alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists showcase_opt_in boolean not null default false;

-- ---- presence ---------------------------------------------------------------

create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;

-- ---- friends ----------------------------------------------------------------

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_not_self check (user_id <> friend_id)
);
alter table public.friendships enable row level security;
revoke all on public.friendships from public, anon, authenticated;
grant select on public.friendships to authenticated;

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
  for select to authenticated using (user_id = auth.uid());

create index if not exists friendships_friend_idx on public.friendships (friend_id);

-- Adds the player with that friend code. Returns their id and name.
create or replace function public.add_friend_by_code(p_code text)
returns table (friend_id uuid, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_friend public.profiles;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_connected' using errcode = '42501';
  end if;
  select * into v_friend from public.profiles where friend_code = upper(trim(p_code));
  if not found then
    raise exception 'unknown_code' using errcode = 'P0002';
  end if;
  if v_friend.id = v_me then
    raise exception 'cannot_add_self' using errcode = '22023';
  end if;
  if (select count(*) from public.friendships f where f.user_id = v_me) >= 100 then
    raise exception 'too_many_friends' using errcode = '54000';
  end if;
  insert into public.friendships (user_id, friend_id) values (v_me, v_friend.id)
    on conflict do nothing;
  friend_id := v_friend.id;
  display_name := v_friend.display_name;
  return next;
end;
$$;
revoke all on function public.add_friend_by_code(text) from public;
grant execute on function public.add_friend_by_code(text) to authenticated;

create or replace function public.remove_friend(p_friend uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.friendships where user_id = auth.uid() and friend_id = p_friend;
$$;
revoke all on function public.remove_friend(uuid) from public;
grant execute on function public.remove_friend(uuid) to authenticated;

-- My friends with what I may see about them.
create or replace function public.list_friends()
returns table (
  friend_id uuid, display_name text, friend_code text, last_seen_at timestamptz,
  is_mutual boolean, has_room boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.display_name, p.friend_code, p.last_seen_at,
         exists (select 1 from public.friendships b where b.user_id = p.id and b.friend_id = auth.uid()),
         exists (select 1 from public.room_snapshots r where r.owner_id = p.id)
    from public.friendships f
    join public.profiles p on p.id = f.friend_id
   where f.user_id = auth.uid()
   order by p.last_seen_at desc nulls last, p.display_name;
$$;
revoke all on function public.list_friends() from public;
grant execute on function public.list_friends() to authenticated;

-- ---- room showcase ----------------------------------------------------------

create table if not exists public.room_likes (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  liker_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, liker_id),
  constraint room_likes_not_self check (owner_id <> liker_id)
);
alter table public.room_likes enable row level security;
revoke all on public.room_likes from public, anon, authenticated;

create or replace function public.set_showcase(p_on boolean)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.profiles set showcase_opt_in = coalesce(p_on, false) where id = auth.uid()
  returning showcase_opt_in;
$$;
revoke all on function public.set_showcase(boolean) from public;
grant execute on function public.set_showcase(boolean) to authenticated;

create or replace function public.get_showcase_setting()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select showcase_opt_in from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.get_showcase_setting() from public;
grant execute on function public.get_showcase_setting() to authenticated;

create or replace function public.set_room_like(p_owner uuid, p_like boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_count integer;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_connected' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner and showcase_opt_in) then
    raise exception 'not_in_showcase' using errcode = 'P0002';
  end if;
  if p_owner = v_me then
    raise exception 'cannot_like_own_room' using errcode = '22023';
  end if;
  if p_like then
    insert into public.room_likes (owner_id, liker_id) values (p_owner, v_me) on conflict do nothing;
  else
    delete from public.room_likes where owner_id = p_owner and liker_id = v_me;
  end if;
  select count(*) into v_count from public.room_likes where owner_id = p_owner;
  return v_count;
end;
$$;
revoke all on function public.set_room_like(uuid, boolean) from public;
grant execute on function public.set_room_like(uuid, boolean) to authenticated;

-- p_sort: 'top' (most liked) or 'new' (recently updated). Max 50 rows.
create or replace function public.list_showcase(p_sort text default 'top', p_limit integer default 30)
returns table (
  owner_id uuid, display_name text, friend_code text, likes integer, liked_by_me boolean,
  updated_at timestamptz, item_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.display_name, p.friend_code,
         (select count(*)::int from public.room_likes l where l.owner_id = p.id),
         exists (select 1 from public.room_likes l where l.owner_id = p.id and l.liker_id = auth.uid()),
         r.updated_at,
         coalesce(jsonb_array_length(case when jsonb_typeof(r.room_data -> 'placed') = 'array' then r.room_data -> 'placed'
                                          when jsonb_typeof(r.room_data) = 'array' then r.room_data else '[]'::jsonb end), 0)
    from public.profiles p
    join public.room_snapshots r on r.owner_id = p.id
   where p.showcase_opt_in
   order by case when p_sort = 'new' then extract(epoch from r.updated_at) else 0 end desc,
            (select count(*) from public.room_likes l where l.owner_id = p.id) desc,
            r.updated_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;
revoke all on function public.list_showcase(text, integer) from public;
grant execute on function public.list_showcase(text, integer) to authenticated;

-- ---- gumball trades ---------------------------------------------------------

create table if not exists public.gumball_trades (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  give_kind text not null,
  want_kind text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gumball_trades_not_self check (from_id <> to_id),
  constraint gumball_trades_kinds check (give_kind ~ '^[a-z0-9_]{1,40}$' and want_kind ~ '^[a-z0-9_]{1,40}$'),
  constraint gumball_trades_status check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed'))
);
alter table public.gumball_trades enable row level security;
revoke all on public.gumball_trades from public, anon, authenticated;
grant select on public.gumball_trades to authenticated;

drop policy if exists gumball_trades_select_party on public.gumball_trades;
create policy gumball_trades_select_party on public.gumball_trades
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

create index if not exists gumball_trades_from_idx on public.gumball_trades (from_id, status);
create index if not exists gumball_trades_to_idx on public.gumball_trades (to_id, status);

create or replace function public.create_gumball_trade(p_to uuid, p_give text, p_want text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id bigint;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_connected' using errcode = '42501';
  end if;
  if not (exists (select 1 from public.friendships where user_id = v_me and friend_id = p_to)
          and exists (select 1 from public.friendships where user_id = p_to and friend_id = v_me)) then
    raise exception 'not_mutual_friends' using errcode = '42501';
  end if;
  if (select count(*) from public.gumball_trades where from_id = v_me and status = 'pending') >= 10 then
    raise exception 'too_many_pending' using errcode = '54000';
  end if;
  insert into public.gumball_trades (from_id, to_id, give_kind, want_kind)
    values (v_me, p_to, p_give, p_want)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_gumball_trade(uuid, text, text) from public;
grant execute on function public.create_gumball_trade(uuid, text, text) to authenticated;

-- Moves a trade along. Allowed transitions:
--   recipient: pending -> accepted | declined
--   sender:    pending -> cancelled, accepted -> completed
-- Returns the new status; raises 'bad_transition' otherwise.
create or replace function public.update_gumball_trade(p_id bigint, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_t public.gumball_trades;
begin
  select * into v_t from public.gumball_trades where id = p_id for update;
  if not found or (v_t.from_id <> v_me and v_t.to_id <> v_me) then
    raise exception 'no_such_trade' using errcode = 'P0002';
  end if;
  if v_t.status = p_status then
    return v_t.status; -- idempotent retry
  end if;
  if not (
    (v_me = v_t.to_id and v_t.status = 'pending' and p_status in ('accepted', 'declined')) or
    (v_me = v_t.from_id and v_t.status = 'pending' and p_status = 'cancelled') or
    (v_me = v_t.from_id and v_t.status = 'accepted' and p_status = 'completed')
  ) then
    raise exception 'bad_transition' using errcode = '22023';
  end if;
  update public.gumball_trades set status = p_status, updated_at = now() where id = p_id;
  return p_status;
end;
$$;
revoke all on function public.update_gumball_trade(bigint, text) from public;
grant execute on function public.update_gumball_trade(bigint, text) to authenticated;

-- Trades I'm part of that still matter (anything not finished, plus the
-- last 30 days of finished ones so both sides can settle), with names.
create or replace function public.list_gumball_trades()
returns table (
  id bigint, from_id uuid, to_id uuid, from_name text, to_name text,
  give_kind text, want_kind text, status text, created_at timestamptz, updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.from_id, t.to_id, pf.display_name, pt.display_name,
         t.give_kind, t.want_kind, t.status, t.created_at, t.updated_at
    from public.gumball_trades t
    join public.profiles pf on pf.id = t.from_id
    join public.profiles pt on pt.id = t.to_id
   where (t.from_id = auth.uid() or t.to_id = auth.uid())
     and (t.status in ('pending', 'accepted') or t.updated_at > now() - interval '30 days')
   order by t.created_at desc
   limit 100;
$$;
revoke all on function public.list_gumball_trades() from public;
grant execute on function public.list_gumball_trades() to authenticated;
