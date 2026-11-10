-- =============================================================================
-- Pixel Hotel v0.8.10 — Arcade Pool Leaderboard Schema
--
-- HOW TO APPLY (human, one-time, per Supabase project):
--   1. Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--      Idempotent: every statement is safe to re-run (CREATE TABLE IF NOT
--      EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS before
--      CREATE POLICY, REVOKE/GRANT).
--   2. Client access model, following 0003_v087_arcade_scores.sql's pattern:
--      - Table `pool_stats` has Row Level Security (RLS) ENABLED.
--      - Clients never write directly (INSERT/UPDATE/DELETE all revoked); rows
--        are only ever written by the submit_pool_result() RPC below.
--      - submit_pool_result(p_won) validates the authenticated user and a 5s
--        rate limit, then upserts the caller's own row. The win/loss streak
--        is accumulated server-side (never trusts a client-supplied streak)
--        so a player cannot forge a higher streak than they actually played.
--      - get_pool_leaderboard(mine_only, limit) joins to `profiles` to return
--        the global top 10 by best streak.
--      - Clients only use the publishable key; execution granted to authenticated.
--   3. Gumballs (collection counts, trades) are NOT stored server-side — they
--      stay local in the browser save (see js/save.js migration 9), so no
--      schema is needed for them here.
-- =============================================================================

create table if not exists public.pool_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  wins integer not null default 0,
  losses integer not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_submit timestamptz,
  updated_at timestamptz not null default now(),
  constraint pool_stats_wins_check check (wins >= 0),
  constraint pool_stats_losses_check check (losses >= 0),
  constraint pool_stats_streak_check check (current_streak >= 0 and best_streak >= 0)
);

create index if not exists pool_stats_best_streak_idx
  on public.pool_stats (best_streak desc, updated_at asc);

-- ---- Row Level Security ----

alter table public.pool_stats enable row level security;

drop policy if exists pool_stats_select on public.pool_stats;

create policy pool_stats_select on public.pool_stats
  for select to authenticated
  using (true);

-- No insert/update policy: rows are written only by submit_pool_result(), a
-- SECURITY DEFINER function owned by the migration-running role, which
-- bypasses RLS. Direct client writes would skip the rate limit and the
-- server-computed (non-forgeable) streak accounting.

revoke all on public.pool_stats from public, anon;
revoke insert, update, delete on public.pool_stats from authenticated;
grant select on public.pool_stats to authenticated;

-- ---- RPC: submit_pool_result ----
-- Records a single rack's outcome for the caller. Rate-limited to 1 submit
-- per 5 seconds per user. Streak is accumulated server-side: p_won extends
-- current_streak, a loss resets it to 0, best_streak tracks the max seen.

create or replace function public.submit_pool_result(
  p_won boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_row public.pool_stats;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_won is null then
    raise exception 'invalid_result: p_won is required';
  end if;

  select * into v_row from public.pool_stats where user_id = v_uid;

  if v_row.user_id is not null and v_row.last_submit is not null
     and v_row.last_submit > (now() - interval '5 seconds') then
    raise exception 'rate_limited: max 1 submission per 5 seconds';
  end if;

  if v_row.user_id is null then
    insert into public.pool_stats (user_id, wins, losses, current_streak, best_streak, last_submit)
    values (
      v_uid,
      case when p_won then 1 else 0 end,
      case when p_won then 0 else 1 end,
      case when p_won then 1 else 0 end,
      case when p_won then 1 else 0 end,
      now()
    );
  else
    update public.pool_stats set
      wins = v_row.wins + case when p_won then 1 else 0 end,
      losses = v_row.losses + case when p_won then 0 else 1 end,
      current_streak = case when p_won then v_row.current_streak + 1 else 0 end,
      best_streak = greatest(v_row.best_streak, case when p_won then v_row.current_streak + 1 else 0 end),
      last_submit = now(),
      updated_at = now()
    where user_id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'won', p_won);
end;
$$;

-- ---- RPC: get_pool_leaderboard ----
-- Returns top players by best streak, joined to profiles.display_name.

create or replace function public.get_pool_leaderboard(
  p_mine_only boolean default false,
  p_limit integer default 10
)
returns table (
  user_id uuid,
  display_name text,
  wins integer,
  losses integer,
  best_streak integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.user_id,
    coalesce(p.display_name, 'Guest') as display_name,
    s.wins,
    s.losses,
    s.best_streak
  from public.pool_stats s
  left join public.profiles p on p.id = s.user_id
  where (not coalesce(p_mine_only, false) or s.user_id = auth.uid())
  order by s.best_streak desc, s.wins desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ---- Hardening & Grants ----

revoke all on function public.submit_pool_result(boolean) from public, anon;
grant execute on function public.submit_pool_result(boolean) to authenticated;

revoke all on function public.get_pool_leaderboard(boolean, integer) from public, anon;
grant execute on function public.get_pool_leaderboard(boolean, integer) to authenticated;

comment on table public.pool_stats is
  'Arcade Pool (8-ball) win/loss/streak stats, one row per user. Written only via submit_pool_result().';
