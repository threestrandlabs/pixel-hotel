-- =============================================================================
-- Pixel Hotel v0.8.0 — Hardening pass, fixing Supabase Advisor findings
-- against the already-applied 0001_v08_multiplayer.sql.
--
-- Idempotent (CREATE OR REPLACE FUNCTION, REVOKE/GRANT, COMMENT ON — all
-- safe to re-run). Apply the same way as 0001: SQL Editor -> paste -> Run.
--
-- Fixes:
--   1. "Function search_path mutable" on touch_room_snapshot_updated_at and
--      gen_room_code — both now pin `set search_path = ''`. gen_room_code
--      calls pgcrypto's gen_random_bytes, which 0001's unqualified
--      `create extension if not exists pgcrypto;` installed into `public`,
--      so that call is schema-qualified below. Built-ins used by both
--      (now(), generate_series, substr, string_agg) live in pg_catalog,
--      which stays implicitly on the search path regardless.
--   2. "SECURITY DEFINER function executable by public/anon" — explicit
--      `revoke ... from public, anon` on all 8 SECURITY DEFINER functions,
--      on top of 0001's `revoke all from public`. authenticated keeps
--      EXECUTE on the 7 RPCs the client actually calls via supabase-js
--      .rpc() (players are anonymous-auth users, i.e. role `authenticated`);
--      before_insert_room_note is a BEFORE INSERT trigger, never called
--      directly by any client, so EXECUTE is revoked from authenticated
--      too — trigger firing does not require the invoking role to hold
--      EXECUTE on the trigger function.
-- =============================================================================

alter function public.touch_room_snapshot_updated_at() set search_path = '';

create or replace function public.gen_room_code(len int)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr(
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      (get_byte(extensions.gen_random_bytes(1), 0) % 32) + 1,
      1
    ),
    ''
  )
  from generate_series(1, len);
$$;

-- ---- SECURITY DEFINER functions: explicit public/anon lockdown ----

revoke all on function public.before_insert_room_note() from public, anon, authenticated;
revoke all on function public.check_kicked_from_room(text) from public, anon;
revoke all on function public.create_multiplayer_room() from public, anon;
revoke all on function public.ensure_profile(text) from public, anon;
revoke all on function public.get_display_names(uuid[]) from public, anon;
revoke all on function public.join_multiplayer_room(text) from public, anon;
revoke all on function public.kick_from_multiplayer_room(text, uuid) from public, anon;
revoke all on function public.lookup_owner_by_friend_code(text) from public, anon;

-- The 7 client-called RPCs keep EXECUTE for authenticated (re-granted here
-- defensively; 0001 already grants these, this is just belt-and-suspenders
-- for a migration whose job is to pin down exact privilege state).
grant execute on function public.check_kicked_from_room(text) to authenticated;
grant execute on function public.create_multiplayer_room() to authenticated;
grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.get_display_names(uuid[]) to authenticated;
grant execute on function public.join_multiplayer_room(text) to authenticated;
grant execute on function public.kick_from_multiplayer_room(text, uuid) to authenticated;
grant execute on function public.lookup_owner_by_friend_code(text) to authenticated;
-- before_insert_room_note: no grant to anyone — trigger-only.

-- ---- Document the two intentionally-policy-less tables ----
-- (Advisor flags "RLS enabled, no policies" — this is by design, not an
-- oversight: both are internal ledgers written only by SECURITY DEFINER
-- functions, which bypass RLS/grants entirely. No client role should ever
-- gain a policy or grant on these.)

comment on table public.multiplayer_room_kicks is
  'Internal-only ban ledger, written only by kick_from_multiplayer_room()/join_multiplayer_room() (SECURITY DEFINER). RLS enabled with zero policies and all grants revoked from anon/authenticated is intentional default-deny, not an oversight.';

comment on table public.room_note_rate_log is
  'Internal-only rate-limit ledger, written only by before_insert_room_note() (SECURITY DEFINER). RLS enabled with zero policies and all grants revoked from anon/authenticated is intentional default-deny, not an oversight.';

-- No additional client-facing table/column grants were needed beyond what
-- 0001 already sets — table privileges for authenticated were already
-- scoped correctly there; this migration only tightens function-level
-- search_path and execute grants.
