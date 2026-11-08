-- =============================================================================
-- Pixel Hotel v0.8.0 — Basic Multiplayer schema
--
-- HOW TO APPLY (human, one-time, per Supabase project):
--   1. Supabase Dashboard -> Authentication -> Sign In / Providers
--      -> enable "Allow anonymous sign-ins". This is required: the client
--      calls supabase.auth.signInAnonymously() and nothing else.
--   2. Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--      Idempotent: every statement is safe to re-run (CREATE ... IF NOT
--      EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS before
--      CREATE POLICY, DROP TRIGGER IF EXISTS before CREATE TRIGGER). If a
--      run fails partway, fix the reported error and re-run the whole file.
--   3. Realtime Authorization section (near the bottom of this file) only
--      uses CREATE POLICY on realtime.messages, per
--      https://supabase.com/docs/guides/realtime/authorization — it does
--      NOT alter that table's RLS status or grant table privileges on it
--      (both would fail as `postgres` is not its owner / are undocumented;
--      see the long comment right above those policies for the full
--      reasoning). If `realtime.messages` or `realtime.topic()` does not
--      exist at all when you run this file, your project's Realtime needs
--      upgrading first.
--   3b. REQUIRED manual dashboard step this SQL cannot do for you: turn
--       OFF "Allow public access" for Realtime (Project Settings ->
--       Realtime, wording/location may vary by dashboard version) — the
--       docs require this for private-channel RLS to actually be
--       enforced; leaving it on lets private channels bypass the policies
--       below entirely.
--   4. No Realtime "replication"/Postgres Changes toggle is needed — this
--      schema only uses Broadcast + Presence on private channels, not
--      Postgres Changes (CDC), so no table needs to be added to the
--      `supabase_realtime` publication.
--   5. After running, confirm every new table below shows Row Level
--      Security = ON in Table Editor. Every table's grants are set
--      explicitly (REVOKE ALL then GRANT only what's needed) rather than
--      assumed, so re-verify via Table Editor -> table -> "..." -> "View
--      Policies" and the Database -> Roles / `information_schema` grants
--      if you want to double check `anon` ends up with nothing.
--   6. Kick is NOT an instant hard disconnect for an adversarial client —
--      see the long comment above the Realtime Authorization policies and
--      docs/v0.8-multiplayer.md for the honest cooperative-vs-adversarial
--      model and the one secret-free mitigation available (JWT expiry).
--
-- This migration contains NO secrets and performs NO data writes by itself
-- beyond creating empty tables/functions — applying it does not touch any
-- existing single-player data (single-player uses only browser
-- localStorage and never calls this project).
-- =============================================================================

create extension if not exists pgcrypto;

-- Shared secure code generator for friend codes and room invite codes.
-- Uses pgcrypto's gen_random_bytes (OS CSPRNG), not plain random(), and
-- maps each byte into the 32-symbol alphabet via `% 32` — 256 is an exact
-- multiple of 32, so this mapping is perfectly uniform (no modulo bias).
--
-- Fixes a real bug in an earlier draft: that version picked each character
-- with `substr(alphabet, ceil(random() * 33)::int, 1)` against a 32-char
-- alphabet. ceil(random()*33) can yield 33 (random() can get arbitrarily
-- close to 1), and substr(text, 33, 1) against a 32-char string returns an
-- empty string — producing a code shorter than 6 characters, which then
-- failed the `~ '^[A-Z2-9]{6}$'` check constraint with an unhandled
-- check_violation (only unique_violation was caught), aborting the caller
-- with a confusing error on roughly a 1-in-6 chance per generated code
-- (1 - (32/33)^6 ≈ 17%).
create or replace function public.gen_room_code(len int)
returns text
language sql
volatile
as $$
  select string_agg(
    substr(
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      (get_byte(gen_random_bytes(1), 0) % 32) + 1,
      1
    ),
    ''
  )
  from generate_series(1, len);
$$;

revoke all on function public.gen_room_code(int) from public;
grant execute on function public.gen_room_code(int) to authenticated;

-- =============================================================================
-- profiles: one row per multiplayer identity (anonymous auth user).
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  friend_code text not null unique,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 24),
  constraint profiles_display_name_chars check (display_name !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  constraint profiles_friend_code_format check (friend_code ~ '^[A-Z2-9]{6}$')
);

alter table public.profiles enable row level security;

-- Self-select only (direct table reads). Cross-user lookups go through the
-- lookup_owner_by_friend_code / get_display_names RPCs below so friend codes
-- and the full user list can't be scraped via `select * from profiles`.
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- Display name is editable; friend_code is NOT — it must stay whatever
-- ensure_profile() first assigned, so a shared code can never silently
-- start pointing at different content via a client-side update.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and friend_code = (select p.friend_code from public.profiles p where p.id = auth.uid())
  );

revoke all on public.profiles from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

-- ---- RPC: create-or-fetch-and-rename your own profile ----
create or replace function public.ensure_profile(p_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_code text;
  v_tries int := 0;
  v_clean_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is not null then
    if p_display_name is not null and length(trim(p_display_name)) > 0
       and p_display_name is distinct from v_profile.display_name then
      update public.profiles set display_name = trim(p_display_name)
        where id = auth.uid()
        returning * into v_profile;
    end if;
    return v_profile;
  end if;

  v_clean_name := coalesce(nullif(trim(p_display_name), ''), 'Guest');
  loop
    v_code := public.gen_room_code(6);
    begin
      insert into public.profiles (id, display_name, friend_code)
        values (auth.uid(), v_clean_name, v_code)
        returning * into v_profile;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 10 then
        raise exception 'could not allocate a unique friend code, try again';
      end if;
    end;
  end loop;
  return v_profile;
end;
$$;

revoke all on function public.ensure_profile(text) from public;
grant execute on function public.ensure_profile(text) to authenticated;

-- ---- RPC: resolve a friend code to an owner_id + display_name only ----
create or replace function public.lookup_owner_by_friend_code(p_code text)
returns table(owner_id uuid, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select id, display_name from public.profiles where friend_code = upper(trim(p_code));
$$;

revoke all on function public.lookup_owner_by_friend_code(text) from public;
grant execute on function public.lookup_owner_by_friend_code(text) to authenticated;

-- ---- RPC: batch display-name lookup for presence avatars in a shared room ----
create or replace function public.get_display_names(p_ids uuid[])
returns table(id uuid, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select id, display_name from public.profiles where id = any(p_ids);
$$;

revoke all on function public.get_display_names(uuid[]) from public;
grant execute on function public.get_display_names(uuid[]) to authenticated;

-- =============================================================================
-- room_snapshots: owner's own My Room furniture layout, pushed voluntarily so
-- a friend visiting by code sees *something* of the room. Visitor editing is
-- out of scope for v0.8.0 — this is read-only to everyone but the owner.
-- =============================================================================

create table if not exists public.room_snapshots (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  room_data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint room_snapshots_size check (pg_column_size(room_data) < 20000)
);

alter table public.room_snapshots enable row level security;

drop policy if exists "room_snapshots_select" on public.room_snapshots;
create policy "room_snapshots_select" on public.room_snapshots
  for select to authenticated using (true);

drop policy if exists "room_snapshots_insert_own" on public.room_snapshots;
create policy "room_snapshots_insert_own" on public.room_snapshots
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "room_snapshots_update_own" on public.room_snapshots;
create policy "room_snapshots_update_own" on public.room_snapshots
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "room_snapshots_delete_own" on public.room_snapshots;
create policy "room_snapshots_delete_own" on public.room_snapshots
  for delete to authenticated using (owner_id = auth.uid());

revoke all on public.room_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.room_snapshots to authenticated;

create or replace function public.touch_room_snapshot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists room_snapshots_touch_updated_at on public.room_snapshots;
create trigger room_snapshots_touch_updated_at
  before update on public.room_snapshots
  for each row
  execute function public.touch_room_snapshot_updated_at();

-- =============================================================================
-- room_notes / room_note_likes: the My Room guestbook/noteboard.
--
-- Read is open to any authenticated user (the guestbook is meant to be
-- visible once you're visiting a room) — see docs/v0.8-multiplayer.md for
-- the threat/limit this implies (room_owner_id is a uuid, not a secret; the
-- friend code is the sharing boundary, not a hard access-control boundary).
-- Write is restricted to the authenticated author, with a concurrency-safe
-- per-author-per-room hourly rate limit enforced by a BEFORE INSERT trigger
-- (not just the RLS policy) so a malicious client cannot bypass the limit
-- by inserting directly instead of going through application code.
--
-- Two bypasses were found and closed here:
--   1. A client can supply its own `created_at` in the INSERT payload
--      (a column default only applies when the client omits the column) —
--      backdating it beyond "now() - 1 hour" would have made the note
--      invisible to the rate-limit's own count query. The trigger below
--      now unconditionally overwrites new.created_at with now().
--   2. The original design counted *currently existing* rows in
--      room_notes within the last hour. Since authors are allowed to
--      delete their own notes, "delete my note, then post a new one"
--      repeated in a loop would have reset the count indefinitely,
--      defeating "max N per hour" entirely. room_note_rate_log below is a
--      separate, durable ledger with NO client grants/policies at all
--      (only this SECURITY DEFINER trigger can write to it, bypassing its
--      RLS) — deleting a note never removes its ledger entry, so the
--      hourly quota is actually enforced against *attempts*, not
--      *surviving rows*.
-- =============================================================================

create table if not exists public.room_notes (
  id uuid primary key default gen_random_uuid(),
  room_owner_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  constraint room_notes_body_len check (char_length(body) between 1 and 140),
  constraint room_notes_body_chars check (body !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')
);

create index if not exists room_notes_owner_idx on public.room_notes (room_owner_id, created_at desc);
create index if not exists room_notes_author_room_idx on public.room_notes (author_id, room_owner_id, created_at desc);

alter table public.room_notes enable row level security;

drop policy if exists "room_notes_select" on public.room_notes;
create policy "room_notes_select" on public.room_notes
  for select to authenticated using (true);

drop policy if exists "room_notes_insert_self" on public.room_notes;
create policy "room_notes_insert_self" on public.room_notes
  for insert to authenticated with check (author_id = auth.uid());

-- Owner may moderate (delete any note in their own room); author may delete
-- their own note anywhere. No UPDATE policy exists at all, so notes are
-- immutable (not editable by anyone, including the owner) by omission.
drop policy if exists "room_notes_delete" on public.room_notes;
create policy "room_notes_delete" on public.room_notes
  for delete to authenticated
  using (author_id = auth.uid() or room_owner_id = auth.uid());

revoke all on public.room_notes from public, anon, authenticated;
grant select, insert, delete on public.room_notes to authenticated;

-- Durable per-author-per-room attempt ledger for the hourly rate limit.
-- Deliberately has NO policies and NO grants to any client-facing role —
-- RLS is enabled with zero matching policies, so it default-denies every
-- operation to anon/authenticated outright, and even if that weren't true
-- the explicit revoke below removes the base privilege too. Only the
-- SECURITY DEFINER trigger function can write to it.
create table if not exists public.room_note_rate_log (
  id bigint generated always as identity primary key,
  room_owner_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists room_note_rate_log_idx on public.room_note_rate_log (author_id, room_owner_id, created_at);

alter table public.room_note_rate_log enable row level security;
revoke all on public.room_note_rate_log from public, anon, authenticated;

create or replace function public.before_insert_room_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_max_per_hour constant int := 5;
  v_name text;
begin
  if new.author_id is distinct from auth.uid() then
    raise exception 'author_id must match the authenticated user';
  end if;

  select display_name into v_name from public.profiles where id = new.author_id;
  if v_name is null then
    raise exception 'author profile not found — call ensure_profile() first';
  end if;
  new.author_name := v_name;

  if not exists (select 1 from public.profiles where id = new.room_owner_id) then
    raise exception 'room owner not found';
  end if;

  -- Never trust a client-supplied created_at for the rate-limit window (or
  -- for display ordering) — a column default only applies when the client
  -- omits the column entirely, so without this a backdated timestamp would
  -- have let a note dodge the "last hour" count below.
  new.created_at := now();

  -- Serialize concurrent inserts from the SAME author+room so two
  -- simultaneous requests can't both read count=4 and both insert past the
  -- limit (classic check-then-act race). Lock is transaction-scoped and
  -- auto-released at commit/rollback.
  perform pg_advisory_xact_lock(hashtext(new.room_owner_id::text), hashtext(new.author_id::text));

  -- Counted against the durable ledger, not against surviving room_notes
  -- rows — deleting a note (author or owner delete) does not touch the
  -- ledger, so delete-then-reinsert cannot reset the quota.
  select count(*) into v_count
    from public.room_note_rate_log
    where author_id = new.author_id
      and room_owner_id = new.room_owner_id
      and created_at > now() - interval '1 hour';

  if v_count >= v_max_per_hour then
    raise exception 'rate_limited: max % notes per room per hour', v_max_per_hour;
  end if;

  insert into public.room_note_rate_log (room_owner_id, author_id)
    values (new.room_owner_id, new.author_id);

  return new;
end;
$$;

drop trigger if exists room_notes_before_insert on public.room_notes;
create trigger room_notes_before_insert
  before insert on public.room_notes
  for each row
  execute function public.before_insert_room_note();

create table if not exists public.room_note_likes (
  note_id uuid not null references public.room_notes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, author_id)
);

alter table public.room_note_likes enable row level security;

drop policy if exists "room_note_likes_select" on public.room_note_likes;
create policy "room_note_likes_select" on public.room_note_likes
  for select to authenticated using (true);

drop policy if exists "room_note_likes_insert_self" on public.room_note_likes;
create policy "room_note_likes_insert_self" on public.room_note_likes
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "room_note_likes_delete_self" on public.room_note_likes;
create policy "room_note_likes_delete_self" on public.room_note_likes
  for delete to authenticated using (author_id = auth.uid());

revoke all on public.room_note_likes from public, anon, authenticated;
grant select, insert, delete on public.room_note_likes to authenticated;

-- =============================================================================
-- multiplayer_rooms / multiplayer_room_access / multiplayer_room_kicks:
-- invite-code live rooms. Membership (and therefore Realtime authorization,
-- see the bottom section) is granted/revoked ONLY via the SECURITY DEFINER
-- RPCs below — there is deliberately no client INSERT/DELETE policy on
-- multiplayer_room_access, so a client cannot grant itself access by
-- crafting a payload; it must hold a code the join RPC accepts.
-- =============================================================================

create table if not exists public.multiplayer_rooms (
  code text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint multiplayer_rooms_code_format check (code ~ '^[A-Z2-9]{6,10}$')
);

alter table public.multiplayer_rooms enable row level security;

-- No generic client SELECT policy (would let any user enumerate active
-- codes). Owners can see their own rooms directly; everyone else resolves a
-- code only by calling join_multiplayer_room(), which validates server-side.
drop policy if exists "multiplayer_rooms_select_own" on public.multiplayer_rooms;
create policy "multiplayer_rooms_select_own" on public.multiplayer_rooms
  for select to authenticated using (owner_id = auth.uid());

revoke all on public.multiplayer_rooms from public, anon, authenticated;
grant select on public.multiplayer_rooms to authenticated;

create table if not exists public.multiplayer_room_access (
  room_code text not null references public.multiplayer_rooms(code) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

alter table public.multiplayer_room_access enable row level security;

drop policy if exists "multiplayer_room_access_select" on public.multiplayer_room_access;
create policy "multiplayer_room_access_select" on public.multiplayer_room_access
  for select to authenticated
  using (
    user_id = auth.uid()
    or room_code in (select code from public.multiplayer_rooms where owner_id = auth.uid())
  );

revoke all on public.multiplayer_room_access from public, anon, authenticated;
grant select on public.multiplayer_room_access to authenticated;
-- Deliberately no insert/update/delete grant: only the RPCs below (running
-- as table owner, which bypasses RLS/grants for SECURITY DEFINER functions)
-- can write this table. The explicit revoke above means this holds even if
-- Supabase's own default privileges for new public-schema tables ever
-- granted authenticated/anon broader access than we want by default — this
-- migration never assumes a particular default and always sets the exact
-- privilege state itself, safely on both a fresh project and a re-run.

create table if not exists public.multiplayer_room_kicks (
  room_code text not null references public.multiplayer_rooms(code) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kicked_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

alter table public.multiplayer_room_kicks enable row level security;
revoke all on public.multiplayer_room_kicks from public, anon, authenticated;
-- No client policies at all on this table (not even select) — it is purely
-- an internal durable "do not let this user back in" list consulted by
-- join_multiplayer_room(). The explicit revoke above (not just "never
-- granted") means this is denied regardless of any ambient default
-- privileges Supabase may apply to new public-schema tables.

-- ---- RPC: create a room, return its invite code, and auto-grant the owner access ----
create or replace function public.create_multiplayer_room()
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.multiplayer_rooms;
  v_code text;
  v_tries int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'call ensure_profile() first';
  end if;

  loop
    v_code := public.gen_room_code(6);
    begin
      insert into public.multiplayer_rooms (code, owner_id)
        values (v_code, auth.uid())
        returning * into v_room;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 10 then
        raise exception 'could not allocate a unique room code, try again';
      end if;
    end;
  end loop;

  insert into public.multiplayer_room_access (room_code, user_id)
    values (v_room.code, auth.uid())
    on conflict (room_code, user_id) do nothing;

  return v_room;
end;
$$;

revoke all on function public.create_multiplayer_room() from public;
grant execute on function public.create_multiplayer_room() to authenticated;

-- ---- RPC: join a room by code; checked server-side, not by the client ----
create or replace function public.join_multiplayer_room(p_code text)
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.multiplayer_rooms;
  v_code text := upper(trim(p_code));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'call ensure_profile() first';
  end if;

  select * into v_room from public.multiplayer_rooms where code = v_code and active;
  if v_room.code is null then
    raise exception 'invalid_or_inactive_code';
  end if;

  if exists (
    select 1 from public.multiplayer_room_kicks
    where room_code = v_code and user_id = auth.uid()
  ) then
    raise exception 'kicked_from_room';
  end if;

  insert into public.multiplayer_room_access (room_code, user_id)
    values (v_code, auth.uid())
    on conflict (room_code, user_id) do update set granted_at = now();

  return v_room;
end;
$$;

revoke all on function public.join_multiplayer_room(text) from public;
grant execute on function public.join_multiplayer_room(text) to authenticated;

-- ---- RPC: owner-only kick. Revokes Realtime authorization and durably bans re-entry ----
create or replace function public.kick_from_multiplayer_room(p_code text, p_target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_code));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.multiplayer_rooms where code = v_code and owner_id = auth.uid()
  ) then
    raise exception 'not_room_owner';
  end if;

  delete from public.multiplayer_room_access where room_code = v_code and user_id = p_target_user;
  insert into public.multiplayer_room_kicks (room_code, user_id)
    values (v_code, p_target_user)
    on conflict (room_code, user_id) do update set kicked_at = now();
end;
$$;

revoke all on function public.kick_from_multiplayer_room(text, uuid) from public;
grant execute on function public.kick_from_multiplayer_room(text, uuid) to authenticated;

-- ---- RPC: check if authenticated caller was kicked from a room (used to verify broadcasts) ----
create or replace function public.check_kicked_from_room(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.multiplayer_room_kicks
    where room_code = upper(trim(p_code)) and user_id = auth.uid()
  );
$$;

revoke all on function public.check_kicked_from_room(text) from public;
grant execute on function public.check_kicked_from_room(text) to authenticated;

-- =============================================================================
-- Realtime Authorization: gate private-channel Broadcast + Presence on
-- `room:<code>` topics to users holding a current multiplayer_room_access
-- row for that code.
--
-- IMPORTANT, corrected after a coordinator review against the live
-- Supabase docs (https://supabase.com/docs/guides/realtime/authorization):
--   - Do NOT run `alter table realtime.messages enable row level security`.
--     RLS is already enabled on that table by Supabase, `postgres` is not
--     its owner, and running this yourself fails with 42501 and aborts the
--     whole migration script. Only CREATE POLICY (managing policies) is
--     documented as supported/permitted — never ALTER TABLE/OWNER on it.
--   - Do NOT grant table privileges on realtime.messages either — that is
--     not documented as needed or permitted; the previous draft's `grant
--     select, insert on realtime.messages to authenticated` has been
--     removed. If policies alone aren't enough for your project, that's a
--     signal to re-check the live docs, not to add ad-hoc grants here.
--   - Use separate SELECT (receive) and INSERT (send) policies, not a
--     single `for all` policy — this matches the documented pattern.
--   - Match the topic by EXACT equality (`realtime.topic() = 'room:' ||
--     code`), not by taking the 2nd `:`-delimited segment — the previous
--     `split_part(realtime.topic(), ':', 2)` silently ignored anything
--     after a second colon, so a topic like `room:ABC123:extra` would
--     still have matched. Exact equality is the tighter, documented-safe
--     comparison.
--   - You must also separately DISABLE "Allow public access" for Realtime
--     in the dashboard (Project Settings -> Realtime, or Database ->
--     Realtime depending on dashboard version) — the docs require this for
--     private-channel RLS authorization to actually be enforced; with it
--     left on, private channels can bypass these policies entirely. This
--     cannot be done from SQL; it is a manual dashboard toggle. CONFIRM THIS
--     TOGGLE IS OFF as part of applying this migration, not just running
--     the SQL below.
--
-- Honest kick semantics (read before relying on this for anything beyond a
-- cooperative game): Realtime evaluates these policies against the
-- caller's JWT when a private channel is joined/(re)subscribed, and that
-- authorization is then cached for the life of the connection — it is
-- NOT re-evaluated against the database on every message. Revoking
-- multiplayer_room_access (kick_from_multiplayer_room) guarantees a kicked
-- user cannot successfully (re)subscribe going forward, and the
-- application also broadcasts a "kicked" event so a normal client
-- disconnects itself immediately. But an adversarial client that ignores
-- that broadcast and keeps its existing socket open is NOT instantly
-- evicted — the hard upper bound on how long they can linger is however
-- long their current access token remains valid before a refresh/
-- reconnect forces re-authorization, which defaults to Supabase's JWT
-- expiry (Dashboard -> Authentication -> Settings -> "Access token (JWT)
-- expiry", default 3600s). Lowering that value tightens the adversarial
-- worst case at the cost of more frequent token-refresh traffic; it is the
-- only secret-free lever available here, and there is no way to force an
-- instant server-side disconnect of a specific socket using only the
-- publishable key. See docs/v0.8-multiplayer.md for the full writeup —
-- do not describe kick as "instant" anywhere in UI copy or docs.
-- =============================================================================

drop policy if exists "pixel_hotel_room_topics" on realtime.messages;
drop policy if exists "pixel_hotel_room_topics_select" on realtime.messages;
create policy "pixel_hotel_room_topics_select" on realtime.messages
  for select
  to authenticated
  using (
    extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.multiplayer_room_access mra
      where mra.user_id = auth.uid()
        and realtime.topic() = 'room:' || mra.room_code
    )
  );

drop policy if exists "pixel_hotel_room_topics_insert" on realtime.messages;
create policy "pixel_hotel_room_topics_insert" on realtime.messages
  for insert
  to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.multiplayer_room_access mra
      where mra.user_id = auth.uid()
        and realtime.topic() = 'room:' || mra.room_code
    )
  );
