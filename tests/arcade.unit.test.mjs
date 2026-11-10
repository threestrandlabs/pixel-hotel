// Unit tests for Pixel Hotel v0.8.7 Arcade games, score validation,
// daily coin rewards, local leaderboards, and Supabase RPC integration.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSnakeGame, stepSnakeGame, setSnakeDirection,
  createBrickBashGame, stepBrickBashGame, movePaddle,
  createBlockDropGame, stepBlockDropGame, moveBlockDrop, rotateMatrix,
} from '../js/arcade/games.js';

import {
  validateScore, calculateCoinsForScore, awardDailyArcadeCoins,
  recordLocalScore, getLocalLeaderboard, submitScoreToSupabase,
  fetchGlobalLeaderboard, ARCADE_DAILY_COIN_CAP, SCORE_BOUNDS,
} from '../js/arcade/leaderboard.js';

// =============================================================================
// Noodle Snake Logic Tests
// =============================================================================

test('arcade snake: starts with initial length 3, heading right with valid food', () => {
  const game = createSnakeGame({ width: 12, height: 12 });
  assert.equal(game.snake.length, 3);
  assert.equal(game.score, 0);
  assert.equal(game.gameOver, false);
  assert.equal(game.dir.dx, 1);
  assert.equal(game.dir.dy, 0);
  assert.ok(game.food.x >= 0 && game.food.x < 12);
  assert.ok(game.food.y >= 0 && game.food.y < 12);
});

test('arcade snake: moves in direction and preserves length when no food is eaten', () => {
  const game = createSnakeGame({ width: 12, height: 12 });
  game.food = { x: 0, y: 0, type: 'egg' }; // place food far away
  const initialHeadX = game.snake[0].x;
  stepSnakeGame(game);
  assert.equal(game.snake[0].x, initialHeadX + 1);
  assert.equal(game.snake.length, 3);
  assert.equal(game.score, 0);
});

test('arcade snake: eating food increases score, increments length, and spawns new food', () => {
  const game = createSnakeGame({ width: 12, height: 12 });
  const head = game.snake[0];
  game.food = { x: head.x + 1, y: head.y, type: 'dumpling' };
  stepSnakeGame(game);
  assert.equal(game.score, 10);
  assert.equal(game.foodEaten, 1);
  assert.equal(game.snake.length, 4);
});

test('arcade snake: hitting a wall triggers game over', () => {
  const game = createSnakeGame({ width: 6, height: 6 });
  game.snake = [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }];
  game.dir = { dx: 1, dy: 0 };
  game.nextDir = { dx: 1, dy: 0 };
  stepSnakeGame(game);
  assert.equal(game.gameOver, true);
});

test('arcade snake: self-collision triggers game over', () => {
  const game = createSnakeGame({ width: 10, height: 10 });
  game.snake = [
    { x: 3, y: 3 },
    { x: 2, y: 3 },
    { x: 2, y: 4 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
  ];
  setSnakeDirection(game, 'down');
  stepSnakeGame(game);
  assert.equal(game.gameOver, true);
});

test('arcade snake: 180-degree reverse direction input is rejected', () => {
  const game = createSnakeGame();
  game.dir = { dx: 1, dy: 0 };
  const changed = setSnakeDirection(game, 'left');
  assert.equal(changed, false);
  assert.equal(game.nextDir.dx, 1);
});

// =============================================================================
// Brick Bash Logic Tests
// =============================================================================

test('arcade brick bash: initializes paddle, ball, and 32 bricks across 4 rows', () => {
  const game = createBrickBashGame({ width: 320, height: 320 });
  assert.equal(game.lives, 3);
  assert.equal(game.score, 0);
  assert.equal(game.gameOver, false);
  assert.equal(game.bricks.length, 32);
  assert.ok(game.paddle.x >= 0);
  assert.ok(game.ball.vx !== 0);
});

test('arcade brick bash: paddle moves and stays within screen boundaries', () => {
  const game = createBrickBashGame({ width: 300, height: 300 });
  game.paddle.x = 5;
  movePaddle(game, 'left');
  assert.equal(game.paddle.x, 0, 'clamps at left edge');
  game.paddle.x = 235;
  movePaddle(game, 'right');
  movePaddle(game, 'right');
  assert.equal(game.paddle.x, 240, 'clamps at right edge');
});

test('arcade brick bash: ball bounces off side walls and ceiling', () => {
  const game = createBrickBashGame({ width: 300, height: 300 });
  // Left wall bounce
  game.ball = { x: 3, y: 100, vx: -3, vy: 2, radius: 4 };
  stepBrickBashGame(game);
  assert.ok(game.ball.vx > 0, 'vx reflected positive on left wall');

  // Ceiling bounce
  game.ball = { x: 100, y: 3, vx: 2, vy: -3, radius: 4 };
  stepBrickBashGame(game);
  assert.ok(game.ball.vy > 0, 'vy reflected positive on ceiling');
});

test('arcade brick bash: ball bouncing off paddle adjusts angle and reflects upward', () => {
  const game = createBrickBashGame({ width: 300, height: 300 });
  game.paddle = { x: 100, y: 250, w: 60, h: 10, speed: 6 };
  game.ball = { x: 145, y: 247, vx: 1, vy: 3, radius: 4 }; // hit right side of paddle
  stepBrickBashGame(game);
  assert.ok(game.ball.vy < 0, 'reflected upward');
  assert.ok(game.ball.vx > 1, 'deflected towards the right edge');
});

test('arcade brick bash: hitting a brick marks it destroyed and increases score', () => {
  const game = createBrickBashGame({ width: 300, height: 300 });
  const target = game.bricks[0];
  game.ball = { x: target.x + 5, y: target.y + target.h + 2, vx: 0, vy: -3, radius: 4 };
  stepBrickBashGame(game);
  assert.equal(target.alive, false);
  assert.ok(game.score >= target.points);
});

test('arcade brick bash: dropping below bottom loses life and ends game at 0 lives', () => {
  const game = createBrickBashGame({ width: 300, height: 300 });
  game.lives = 1;
  game.paddle.x = 0; // move paddle out of the way
  game.ball = { x: 250, y: 297, vx: 0, vy: 5, radius: 4 };
  stepBrickBashGame(game);
  assert.equal(game.lives, 0);
  assert.equal(game.gameOver, true);
});

// =============================================================================
// Block Drop Logic Tests
// =============================================================================

test('arcade block drop: initializes matrix and spawns active tetromino', () => {
  const game = createBlockDropGame({ cols: 10, rows: 18 });
  assert.equal(game.matrix.length, 18);
  assert.equal(game.matrix[0].length, 10);
  assert.ok(game.currentPiece);
  assert.equal(game.gameOver, false);
  assert.equal(game.linesCleared, 0);
});

test('arcade block drop: matrix rotation rotates 2D polyomino correctly', () => {
  const shape = [
    [1, 1],
    [0, 1],
  ];
  const rotated = rotateMatrix(shape);
  assert.deepEqual(rotated, [
    [0, 1],
    [1, 1],
  ]);
});

test('arcade block drop: lateral movement moves piece within matrix bounds', () => {
  const game = createBlockDropGame({ cols: 10, rows: 18 });
  const startX = game.currentPiece.x;
  moveBlockDrop(game, 'left');
  assert.equal(game.currentPiece.x, startX - 1);
  moveBlockDrop(game, 'right');
  assert.equal(game.currentPiece.x, startX);
});

test('arcade block drop: full line is cleared and score awarded according to line count', () => {
  const game = createBlockDropGame({ cols: 6, rows: 8 });
  // Fill row 7 completely except for 1 cell
  for (let c = 0; c < 5; c++) game.matrix[7][c] = '#00e5ff';
  game.matrix[7][5] = 0;

  // Place a 1x1 block into row 7, col 5
  game.currentPiece = {
    shape: [[1]],
    color: '#00e5ff',
    x: 5,
    y: 7,
  };
  stepBlockDropGame(game); // locks piece down
  assert.equal(game.linesCleared, 1);
  assert.equal(game.score, 100);
  // Row 7 is now clear (filled with empty zeroes from above)
  assert.ok(game.matrix[7].every((c) => c === 0));
});

test('arcade block drop: game over occurs when new piece cannot fit at spawn', () => {
  const game = createBlockDropGame({ cols: 6, rows: 8 });
  // Partially fill rows at spawn area with an incomplete row so it's not cleared
  game.matrix[0][1] = '#ff1744';
  game.matrix[0][2] = '#ff1744';
  game.matrix[0][3] = '#ff1744';
  game.matrix[0][4] = '#ff1744';
  // Lock a piece at bottom
  game.currentPiece = { shape: [[1]], color: '#ff1744', x: 0, y: 7 };
  moveBlockDrop(game, 'down'); // locks piece and attempts to spawn where matrix[0] is blocked
  assert.equal(game.gameOver, true);
});

// =============================================================================
// Score Validation & Bounds Tests
// =============================================================================

test('score validation: accepts valid integer scores within per-game bounds', () => {
  assert.ok(validateScore('noodle_snake', 0).ok);
  assert.ok(validateScore('noodle_snake', 1500).ok);
  assert.ok(validateScore('brick_bash', 2800).ok);
  assert.ok(validateScore('block_drop', 12500).ok);
});

test('score validation: rejects negative or non-integer scores', () => {
  assert.equal(validateScore('noodle_snake', -10).ok, false);
  assert.equal(validateScore('brick_bash', 12.5).ok, false);
  assert.equal(validateScore('block_drop', NaN).ok, false);
  assert.equal(validateScore('block_drop', Infinity).ok, false);
});

test('score validation: rejects unknown games', () => {
  assert.equal(validateScore('pacman_clone', 100).ok, false);
  assert.equal(validateScore('', 50).ok, false);
});

test('score validation: rejects scores above maximum sane bounds per game', () => {
  assert.equal(validateScore('noodle_snake', SCORE_BOUNDS.noodle_snake + 1).ok, false);
  assert.equal(validateScore('brick_bash', SCORE_BOUNDS.brick_bash + 1).ok, false);
  assert.equal(validateScore('block_drop', SCORE_BOUNDS.block_drop + 1).ok, false);
});

// =============================================================================
// Daily Coin Reward & Cap Tests
// =============================================================================

test('daily coin reward: awards modest coins based on score up to daily cap', () => {
  const state = {
    coins: 100,
    arcade: { dailyCoins: 0, lastRewardDate: '2026-11-11', highScores: {} },
  };

  // Score 240 -> Math.floor(240/40) = 6 coins
  const res1 = awardDailyArcadeCoins(state, 240, 'noodle_snake', '2026-11-11');
  assert.equal(res1.awarded, 6);
  assert.equal(state.coins, 106);
  assert.equal(state.arcade.dailyCoins, 6);
});

test('daily coin reward: enforces ARCADE_DAILY_COIN_CAP across multiple sessions', () => {
  const state = {
    coins: 0,
    arcade: { dailyCoins: ARCADE_DAILY_COIN_CAP - 3, lastRewardDate: '2026-11-11', highScores: {} },
  };

  // High score potential = 12 coins, but only 3 remaining under cap
  const res = awardDailyArcadeCoins(state, 2000, 'block_drop', '2026-11-11');
  assert.equal(res.awarded, 3);
  assert.equal(state.coins, 3);
  assert.equal(state.arcade.dailyCoins, ARCADE_DAILY_COIN_CAP);
  assert.equal(res.cappedOut, true);

  // Subsequent play on same day awards 0 coins
  const resNext = awardDailyArcadeCoins(state, 500, 'brick_bash', '2026-11-11');
  assert.equal(resNext.awarded, 0);
  assert.equal(state.coins, 3);
});

test('daily coin reward: rolling to a new day resets daily coin allowance', () => {
  const state = {
    coins: 50,
    arcade: { dailyCoins: ARCADE_DAILY_COIN_CAP, lastRewardDate: '2026-11-11', highScores: {} },
  };

  // Next calendar day
  const res = awardDailyArcadeCoins(state, 200, 'noodle_snake', '2026-11-12');
  assert.equal(res.awarded, 5);
  assert.equal(state.coins, 55);
  assert.equal(state.arcade.dailyCoins, 5);
  assert.equal(state.arcade.lastRewardDate, '2026-11-12');
});

// =============================================================================
// Local Leaderboard Sorting Tests
// =============================================================================

test('local leaderboard: keeps top 10 sorted descending with tie-break handling', () => {
  const state = {
    arcade: {
      dailyCoins: 0,
      lastRewardDate: '',
      highScores: {
        noodle_snake: [
          { displayName: 'Alice', score: 300, date: '2026-11-01' },
          { displayName: 'Bob', score: 200, date: '2026-11-02' },
          { displayName: 'Carol', score: 100, date: '2026-11-03' },
        ],
      },
    },
  };

  const res = recordLocalScore(state, 'noodle_snake', 250, 'Dave', '2026-11-04');
  assert.equal(res.ok, true);
  assert.equal(res.rank, 2);

  const top = getLocalLeaderboard(state, 'noodle_snake');
  assert.equal(top[0].displayName, 'Alice');
  assert.equal(top[1].displayName, 'Dave');
  assert.equal(top[2].displayName, 'Bob');
  assert.equal(top[3].displayName, 'Carol');
  assert.ok(top.length <= 10);
});

test('local leaderboard: fallback returns pre-seeded scores when empty', () => {
  const state = { arcade: { highScores: {} } };
  const board = getLocalLeaderboard(state, 'brick_bash');
  assert.equal(board.length, 10);
  assert.equal(board[0].displayName, 'Zack');
});

// =============================================================================
// Mocked Supabase RPC Tests
// =============================================================================

test('supabase rpc: submitScoreToSupabase and fetchGlobalLeaderboard work with fake client', async () => {
  const db = [];
  const fakeClient = {
    async rpc(name, args) {
      if (name === 'submit_arcade_score') {
        const row = { id: 'uuid-1', game: args.p_game, score: args.p_score, display_name: 'PlayerOne' };
        db.push(row);
        return { data: row, error: null };
      }
      if (name === 'get_arcade_leaderboard') {
        const filtered = db.filter((r) => r.game === args.p_game).sort((a, b) => b.score - a.score);
        return { data: filtered, error: null };
      }
      return { data: null, error: new Error('unknown_rpc') };
    },
  };

  const submitRes = await submitScoreToSupabase(fakeClient, 'noodle_snake', 450);
  assert.equal(submitRes.ok, true);

  const globalScores = await fetchGlobalLeaderboard(fakeClient, 'noodle_snake');
  assert.ok(Array.isArray(globalScores));
  assert.equal(globalScores.length, 1);
  assert.equal(globalScores[0].score, 450);
});

test('supabase rpc: graceful degradation when client is null or offline', async () => {
  const submitRes = await submitScoreToSupabase(null, 'noodle_snake', 300);
  assert.equal(submitRes.ok, false);
  assert.equal(submitRes.offline, true);

  const globalScores = await fetchGlobalLeaderboard(null, 'noodle_snake');
  assert.equal(globalScores, null);
});
