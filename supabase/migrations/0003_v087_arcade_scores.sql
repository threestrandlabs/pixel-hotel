-- =============================================================================
-- Pixel Hotel v0.8.7 — Arcade Scores & Leaderboard Schema
--
-- HOW TO APPLY (human, one-time, per Supabase project):
--   1. Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--      Idempotent: every statement is safe to re-run (CREATE TABLE IF NOT
--      EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS before
--      CREATE POLICY, REVOKE/GRANT).
--   2. Client access model:
--      - Table `arcade_scores` has Row Level Security (RLS) ENABLED.
--      - Clients never write directly (INSERT/UPDATE/DELETE all revoked); rows
--        are only ever written by the submit_arcade_score() RPC below.
--      - A SECURITY DEFINER RPC `submit_arcade_score(game, score)` validates:
--        * authenticated user via auth.uid()
--        * game id in ('noodle_snake', 'brick_bash', 'block_drop')
--        * sane score bounds per game
--        * rate limit: max 1 submit per 20s per user
--      - A read RPC `get_arcade_leaderboard(game, mine_only, limit)` joins to
--        `profiles` to return display names for global top 10 per game.
--      - Clients only use the publishable key; execution granted to authenticated.
-- =============================================================================

create table if not exists public.arcade_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null,
  score integer not null,
  created_at timestamptz not null default now(),
  constraint arcade_scores_game_check check (game in ('noodle_snake', 'brick_bash', 'block_drop')),
  constraint arcade_scores_score_check check (score >= 0)
);

create index if not exists arcade_scores_game_score_idx
  on public.arcade_scores (game, score desc, created_at asc);

create index if not exists arcade_scores_user_time_idx
  on public.arcade_scores (user_id, created_at desc);

-- ---- Row Level Security ----

alter table public.arcade_scores enable row level security;

-- Drop existing policies if re-running
drop policy if exists arcade_scores_select on public.arcade_scores;
drop policy if exists arcade_scores_insert on public.arcade_scores;

-- Authenticated users can view scores
create policy arcade_scores_select on public.arcade_scores
  for select to authenticated
  using (true);

-- No insert policy: rows are written only by submit_arcade_score(), a
-- SECURITY DEFINER function owned by the migration-running role, which
-- bypasses RLS. This is deliberate — direct client inserts would skip the
-- score-bounds and rate-limit checks enforced inside that function.

-- Revoke direct write permissions from every client-facing role; clients
-- may only read rows directly and must write through submit_arcade_score().
revoke all on public.arcade_scores from public, anon;
revoke insert, update, delete on public.arcade_scores from authenticated;
grant select on public.arcade_scores to authenticated;

-- ---- RPC: submit_arcade_score ----
-- Validates user, game id, score bounds, and 20s rate limit per user.

create or replace function public.submit_arcade_score(
  p_game text,
  p_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_last_submit timestamptz;
  v_new_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Validate game id
  if p_game not in ('noodle_snake', 'brick_bash', 'block_drop') then
    raise exception 'invalid_game: % is not a recognized arcade game', p_game;
  end if;

  -- Validate sane score bounds per game
  if p_score < 0 then
    raise exception 'invalid_score: score cannot be negative';
  end if;

  if (p_game = 'noodle_snake' and p_score > 50000) or
     (p_game = 'brick_bash' and p_score > 50000) or
     (p_game = 'block_drop' and p_score > 100000) then
    raise exception 'invalid_score: score % exceeds maximum plausible bound for %', p_score, p_game;
  end if;

  -- Rate limit: max 1 submission per 20 seconds per user
  select created_at into v_last_submit
  from public.arcade_scores
  where user_id = v_uid
  order by created_at desc
  limit 1;

  if v_last_submit is not null and v_last_submit > (now() - interval '20 seconds') then
    raise exception 'rate_limited: max 1 submission per 20 seconds';
  end if;

  insert into public.arcade_scores (user_id, game, score)
  values (v_uid, p_game, p_score)
  returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'game', p_game,
    'score', p_score
  );
end;
$$;

-- ---- RPC: get_arcade_leaderboard ----
-- Returns top scores for a game joined to profiles.display_name.
-- Supports global top 10 or current user's top scores (p_mine_only = true).

create or replace function public.get_arcade_leaderboard(
  p_game text,
  p_mine_only boolean default false,
  p_limit integer default 10
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  score integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.user_id,
    coalesce(p.display_name, 'Guest') as display_name,
    s.score,
    s.created_at
  from public.arcade_scores s
  left join public.profiles p on p.id = s.user_id
  where s.game = p_game
    and (not coalesce(p_mine_only, false) or s.user_id = auth.uid())
  order by s.score desc, s.created_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ---- Hardening & Grants ----

revoke all on function public.submit_arcade_score(text, integer) from public, anon;
grant execute on function public.submit_arcade_score(text, integer) to authenticated;

revoke all on function public.get_arcade_leaderboard(text, boolean, integer) from public, anon;
grant execute on function public.get_arcade_leaderboard(text, boolean, integer) to authenticated;

comment on table public.arcade_scores is
  'Arcade machine high scores. Inserted via submit_arcade_score() with score validation and rate-limiting.';
