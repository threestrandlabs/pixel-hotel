-- =============================================================================
-- Pixel Hotel v0.14 — Accounts & cross-device cloud save
--
-- HOW TO APPLY (human, one-time, per Supabase project):
--   1. Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--      Idempotent: safe to re-run.
--   2. Authentication -> Sign In / Providers:
--        - Email: enabled (magic links; no password needed).
--        - Google: enabled, with a Google Cloud OAuth client ID/secret.
--          The Google client's "Authorized redirect URI" is the callback
--          URL shown on that Supabase page.
--   3. Authentication -> Sign In / Providers -> "Allow manual linking": ON.
--      Lets a player who already used anonymous multiplayer attach Google
--      to that same account (keeping their friend code). Without it the
--      game falls back to a plain Google sign-in.
--   4. Authentication -> URL Configuration:
--        - Site URL: https://threestrandlabs.github.io/pixel-hotel/
--        - Redirect URLs: add the same URL, plus http://localhost:8080/
--          for local dev.
--
-- Design notes:
--   - One row per signed-in (non-anonymous) player holding the whole save
--     JSON. Anonymous multiplayer identities cannot use cloud save: they
--     have no way to sign in on a second device anyway.
--   - Writes go only through put_player_save(), which does optimistic
--     concurrency on `rev`: a device must say which revision it last saw,
--     so two devices can never silently overwrite each other.
-- =============================================================================

create table if not exists public.player_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  save_version int not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint player_saves_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint player_saves_data_size check (pg_column_size(data) <= 1048576)
);

alter table public.player_saves enable row level security;

revoke all on public.player_saves from public, anon, authenticated;
grant select on public.player_saves to authenticated;

-- True when the caller is a real (email / OAuth) account, not anonymous.
create or replace function public.is_permanent_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

revoke all on function public.is_permanent_user() from public;
grant execute on function public.is_permanent_user() to authenticated;

drop policy if exists player_saves_select_own on public.player_saves;
create policy player_saves_select_own on public.player_saves
  for select to authenticated
  using (user_id = auth.uid() and public.is_permanent_user());

-- Upsert the caller's save. p_expected_rev is the revision this device last
-- synced (null = "I have never synced, there should be no cloud save yet").
-- Raises 'save_conflict' if the cloud row moved on in the meantime.
-- Returns the new { rev, updated_at }.
create or replace function public.put_player_save(
  p_data jsonb,
  p_save_version int,
  p_expected_rev bigint
)
returns table (rev bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.player_saves;
begin
  if not public.is_permanent_user() then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_save' using errcode = '22023';
  end if;
  if p_save_version is null or p_save_version < 1 then
    raise exception 'invalid_save' using errcode = '22023';
  end if;

  select * into v_row from public.player_saves s where s.user_id = v_uid for update;

  if not found then
    if p_expected_rev is not null then
      raise exception 'save_conflict' using errcode = '40001';
    end if;
    insert into public.player_saves (user_id, data, save_version, rev, updated_at)
      values (v_uid, p_data, p_save_version, 1, now())
      returning player_saves.rev, player_saves.updated_at into rev, updated_at;
    return next;
    return;
  end if;

  if p_expected_rev is null or p_expected_rev <> v_row.rev then
    raise exception 'save_conflict' using errcode = '40001';
  end if;

  update public.player_saves s
     set data = p_data,
         save_version = p_save_version,
         rev = s.rev + 1,
         updated_at = now()
   where s.user_id = v_uid
   returning s.rev, s.updated_at into rev, updated_at;
  return next;
end;
$$;

revoke all on function public.put_player_save(jsonb, int, bigint) from public;
grant execute on function public.put_player_save(jsonb, int, bigint) to authenticated;
