// Pixel Hotel v0.8.7 — Arcade Leaderboards & Daily Rewards
//
// Handles local top 10 leaderboards, daily coin rewards with capped budget,
// score validation against bounds, and Supabase RPC integration with graceful
// degradation to local storage when offline.

export const ARCADE_DAILY_COIN_CAP = 50;

export const VALID_GAMES = ['noodle_snake', 'brick_bash', 'block_drop'];

export const GAME_TITLES = {
  noodle_snake: 'Noodle Snake',
  brick_bash: 'Brick Bash',
  block_drop: 'Block Drop',
};

export const SCORE_BOUNDS = {
  noodle_snake: 50000,
  brick_bash: 50000,
  block_drop: 100000,
};

// Default high scores for nostalgic arcade flair before user sets records
export const DEFAULT_LOCAL_HIGH_SCORES = {
  noodle_snake: [
    { displayName: 'Zack', score: 320, date: '2026-11-01' },
    { displayName: 'Celeste', score: 260, date: '2026-11-02' },
    { displayName: 'Rex', score: 210, date: '2026-11-03' },
    { displayName: 'Clara', score: 180, date: '2026-11-04' },
    { displayName: 'Mochi', score: 140, date: '2026-11-05' },
    { displayName: 'Arthur', score: 110, date: '2026-11-06' },
    { displayName: 'Pip', score: 90, date: '2026-11-07' },
    { displayName: 'PixelCat', score: 70, date: '2026-11-08' },
    { displayName: 'Neo', score: 50, date: '2026-11-09' },
    { displayName: 'Rookie', score: 30, date: '2026-11-10' },
  ],
  brick_bash: [
    { displayName: 'Zack', score: 850, date: '2026-11-01' },
    { displayName: 'Rex', score: 680, date: '2026-11-02' },
    { displayName: 'Celeste', score: 540, date: '2026-11-03' },
    { displayName: 'Arthur', score: 420, date: '2026-11-04' },
    { displayName: 'Clara', score: 360, date: '2026-11-05' },
    { displayName: 'Mochi', score: 290, date: '2026-11-06' },
    { displayName: 'Pip', score: 220, date: '2026-11-07' },
    { displayName: 'RetroGamer', score: 170, date: '2026-11-08' },
    { displayName: 'PongMaster', score: 120, date: '2026-11-09' },
    { displayName: 'PaddlePro', score: 80, date: '2026-11-10' },
  ],
  block_drop: [
    { displayName: 'Zack', score: 2400, date: '2026-11-01' },
    { displayName: 'Clara', score: 1900, date: '2026-11-02' },
    { displayName: 'Celeste', score: 1500, date: '2026-11-03' },
    { displayName: 'Rex', score: 1200, date: '2026-11-04' },
    { displayName: 'Arthur', score: 900, date: '2026-11-05' },
    { displayName: 'Mochi', score: 700, date: '2026-11-06' },
    { displayName: 'Pip', score: 500, date: '2026-11-07' },
    { displayName: 'Tetra', score: 400, date: '2026-11-08' },
    { displayName: 'LineClearer', score: 300, date: '2026-11-09' },
    { displayName: 'DropChamp', score: 200, date: '2026-11-10' },
  ],
};

/**
 * Validates game ID and score sanity bounds.
 */
export function validateScore(game, score) {
  if (!VALID_GAMES.includes(game)) {
    return { ok: false, reason: 'invalid_game' };
  }
  if (typeof score !== 'number' || !Number.isFinite(score) || Math.floor(score) !== score) {
    return { ok: false, reason: 'score_not_integer' };
  }
  if (score < 0) {
    return { ok: false, reason: 'score_negative' };
  }
  const maxBound = SCORE_BOUNDS[game];
  if (score > maxBound) {
    return { ok: false, reason: 'score_exceeds_bounds' };
  }
  return { ok: true };
}

/**
 * Calculates modest coin reward based on game score.
 */
export function calculateCoinsForScore(game, score) {
  if (score <= 0) return 0;
  // Modest reward: 1 coin per 40 pts, capped at 12 coins per individual run
  const earned = Math.floor(score / 40);
  return Math.min(12, Math.max(1, earned));
}

/**
 * Awards coins capped per day, updating state.arcade and state.coins.
 */
export function awardDailyArcadeCoins(state, score, game, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!state.arcade) {
    state.arcade = { dailyCoins: 0, lastRewardDate: todayStr, highScores: {} };
  }
  if (state.arcade.lastRewardDate !== todayStr) {
    state.arcade.dailyCoins = 0;
    state.arcade.lastRewardDate = todayStr;
  }

  const remaining = Math.max(0, ARCADE_DAILY_COIN_CAP - (state.arcade.dailyCoins || 0));
  const potential = calculateCoinsForScore(game, score);
  const awarded = Math.min(potential, remaining);

  if (awarded > 0) {
    state.coins = (state.coins || 0) + awarded;
    state.arcade.dailyCoins = (state.arcade.dailyCoins || 0) + awarded;
  }

  return {
    awarded,
    potential,
    dailyTotal: state.arcade.dailyCoins,
    dailyCap: ARCADE_DAILY_COIN_CAP,
    cappedOut: state.arcade.dailyCoins >= ARCADE_DAILY_COIN_CAP,
  };
}

/**
 * Records score into local top 10 leaderboard, maintaining sorting.
 */
export function recordLocalScore(state, game, score, displayName = 'Guest', date = new Date().toISOString().slice(0, 10)) {
  const check = validateScore(game, score);
  if (!check.ok) return { ok: false, reason: check.reason };

  if (!state.arcade) {
    state.arcade = { dailyCoins: 0, lastRewardDate: '', highScores: {} };
  }
  if (!state.arcade.highScores) {
    state.arcade.highScores = {};
  }
  if (!Array.isArray(state.arcade.highScores[game]) || state.arcade.highScores[game].length === 0) {
    state.arcade.highScores[game] = [...(DEFAULT_LOCAL_HIGH_SCORES[game] || [])];
  }

  const list = [...state.arcade.highScores[game]];
  const entry = { displayName: String(displayName).slice(0, 24), score, date };
  list.push(entry);

  // Sort: descending by score, tie-break by date ascending
  list.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  const top10 = list.slice(0, 10);
  state.arcade.highScores[game] = top10;

  const rank = top10.findIndex((e) => e === entry) + 1;
  return { ok: true, top10, rank: rank > 0 ? rank : null };
}

/**
 * Gets top 10 local scores for a game.
 */
export function getLocalLeaderboard(state, game) {
  if (!VALID_GAMES.includes(game)) return [];
  if (state?.arcade?.highScores?.[game]?.length) {
    return [...state.arcade.highScores[game]].sort((a, b) => b.score - a.score).slice(0, 10);
  }
  return [...(DEFAULT_LOCAL_HIGH_SCORES[game] || [])];
}

/**
 * Submits score to Supabase via RPC submit_arcade_score.
 * Degrades gracefully if offline, unauthenticated, or RPC fails.
 */
export async function submitScoreToSupabase(client, game, score) {
  const check = validateScore(game, score);
  if (!check.ok) return { ok: false, reason: check.reason };

  if (!client || typeof client.rpc !== 'function') {
    return { ok: false, offline: true, reason: 'no_client' };
  }

  try {
    const { data, error } = await client.rpc('submit_arcade_score', {
      p_game: game,
      p_score: score,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetches global top 10 (or user's top 10 if mineOnly is true) via RPC get_arcade_leaderboard.
 * Degrades gracefully by returning null if client or RPC is unavailable.
 */
export async function fetchGlobalLeaderboard(client, game, { mineOnly = false, limit = 10 } = {}) {
  if (!client || typeof client.rpc !== 'function') {
    return null;
  }
  try {
    const { data, error } = await client.rpc('get_arcade_leaderboard', {
      p_game: game,
      p_mine_only: Boolean(mineOnly),
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}
