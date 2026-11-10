// Unit tests for Pixel Hotel v0.8.9 Arcade Pool physics & 8-ball rules core.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPoolGame, stepPoolPhysics, takeShot, isAllStopped, cueBall,
  pickBotShot, resetRack, TABLE_W, TABLE_H, BALL_R, POCKETS, POCKET_R,
  MAX_SHOT_SPEED, FRICTION,
} from '../js/arcade/pool.js';

function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runUntilStopped(game, maxSteps = 2000) {
  let steps = 0;
  while (game.shotInProgress && steps < maxSteps) {
    stepPoolPhysics(game);
    steps += 1;
  }
  return steps;
}

// =============================================================================
// Rack setup
// =============================================================================

test('pool: rack has 16 balls (cue + 15 numbered), no two overlapping', () => {
  const game = createPoolGame({ rng: mulberry32(1) });
  assert.equal(game.balls.length, 16);
  assert.equal(game.balls.filter((b) => b.number === 0).length, 1);
  const numbers = game.balls.filter((b) => b.number !== 0).map((b) => b.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  for (let i = 0; i < game.balls.length; i++) {
    for (let j = i + 1; j < game.balls.length; j++) {
      const a = game.balls[i];
      const b = game.balls[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(dist >= BALL_R * 2 - 0.01, `balls ${a.number} and ${b.number} overlap (${dist})`);
    }
  }
});

test('pool: rack is randomized by rng seed but 8-ball always sits at the rack center', () => {
  const g1 = createPoolGame({ rng: mulberry32(1) });
  const g2 = createPoolGame({ rng: mulberry32(2) });
  const eight1 = g1.balls.find((b) => b.number === 8);
  const eight2 = g2.balls.find((b) => b.number === 8);
  assert.equal(eight1.x, eight2.x);
  assert.equal(eight1.y, eight2.y);
  const order1 = g1.balls.map((b) => b.number).join(',');
  const order2 = g2.balls.map((b) => b.number).join(',');
  assert.notEqual(order1, order2);
});

// =============================================================================
// Physics: cushions, friction, collisions, pockets
// =============================================================================

test('pool physics: ball bounces off the right cushion, reversing x velocity', () => {
  const game = createPoolGame({ rng: mulberry32(3) });
  const cue = cueBall(game);
  cue.x = TABLE_W - BALL_R - 0.5;
  cue.y = TABLE_H / 2;
  cue.vx = 3;
  cue.vy = 0;
  for (const b of game.balls) if (b.number !== 0) b.pocketed = true; // isolate cue ball
  stepPoolPhysics(game);
  assert.ok(cue.vx < 0, 'vx should flip negative after hitting the right cushion');
  assert.ok(cue.x <= TABLE_W - BALL_R + 0.001, 'ball should be clamped inside the table');
});

test('pool physics: friction decelerates a moving ball to a full stop', () => {
  const game = createPoolGame({ rng: mulberry32(4) });
  const cue = cueBall(game);
  cue.x = TABLE_W / 2;
  cue.y = TABLE_H / 2;
  cue.vx = 2;
  cue.vy = 0;
  for (const b of game.balls) if (b.number !== 0) b.pocketed = true;
  let steps = 0;
  while ((Math.abs(cue.vx) > 0 || Math.abs(cue.vy) > 0) && steps < 5000) {
    stepPoolPhysics(game);
    steps += 1;
  }
  assert.ok(steps < 5000, 'ball should come to rest from friction');
  assert.equal(cue.vx, 0);
  assert.equal(cue.vy, 0);
});

test('pool physics: head-on equal-mass collision swaps velocity between two balls', () => {
  const game = createPoolGame({ rng: mulberry32(5) });
  for (const b of game.balls) b.pocketed = true;
  const a = game.balls[0];
  const b = game.balls[1];
  a.pocketed = false;
  b.pocketed = false;
  a.x = 50; a.y = 75; a.vx = 2; a.vy = 0;
  b.x = 50 + BALL_R * 2 + 1.9; b.y = 75; b.vx = 0; b.vy = 0;
  for (let i = 0; i < 3; i++) stepPoolPhysics(game);
  // Collision should have occurred: the trailing ball now carries the momentum.
  assert.ok(b.vx > 1.5, `expected ball b to pick up most of ball a's speed, got ${b.vx}`);
  assert.ok(Math.abs(a.vx) < 1, `expected ball a to slow sharply after head-on hit, got ${a.vx}`);
});

test('pool physics: a ball within pocket radius of a pocket mouth is captured', () => {
  const game = createPoolGame({ rng: mulberry32(6) });
  for (const b of game.balls) b.pocketed = true;
  const cue = cueBall(game);
  cue.pocketed = false;
  cue.x = POCKETS[0].x + 1;
  cue.y = POCKETS[0].y + 1;
  cue.vx = 0;
  cue.vy = 0;
  stepPoolPhysics(game);
  assert.equal(cue.pocketed, true);
});

// =============================================================================
// Shot taking
// =============================================================================

test('pool: takeShot sets cue ball velocity from angle/power and flags shot in progress', () => {
  const game = createPoolGame({ rng: mulberry32(7) });
  const ok = takeShot(game, 0, 1);
  assert.equal(ok, true);
  const cue = cueBall(game);
  assert.ok(Math.abs(cue.vx - MAX_SHOT_SPEED) < 0.001);
  assert.equal(game.shotInProgress, true);
});

test('pool: takeShot is rejected mid-shot or when cue ball is pocketed', () => {
  const game = createPoolGame({ rng: mulberry32(8) });
  takeShot(game, 0, 0.5);
  assert.equal(takeShot(game, 1, 0.5), false, 'cannot shoot again before balls stop');
  runUntilStopped(game);
  cueBall(game).pocketed = true;
  assert.equal(takeShot(game, 0, 0.5), false, 'cannot shoot a pocketed cue ball');
});

test('pool: a full break shot eventually settles and clears shotInProgress', () => {
  const game = createPoolGame({ rng: mulberry32(9) });
  takeShot(game, 0, 1);
  const steps = runUntilStopped(game, 4000);
  assert.ok(steps < 4000, 'break should settle within the step budget');
  assert.equal(game.shotInProgress, false);
  assert.ok(isAllStopped(game));
});

// =============================================================================
// 8-ball rules: fouls, group assignment, win/loss
// =============================================================================

function stillGame(rng = mulberry32(10)) {
  const game = createPoolGame({ rng });
  for (const b of game.balls) {
    b.vx = 0;
    b.vy = 0;
  }
  return game;
}

test('pool rules: scratching the cue ball is a foul that passes the turn and re-spots the cue ball', () => {
  const game = stillGame();
  game.shotInProgress = true;
  game.shotLog = { potted: [0], firstContact: 5 };
  cueBall(game).pocketed = true;
  stepPoolPhysics(game);
  assert.equal(game.currentPlayer, 1, 'turn should pass to the opponent on a scratch');
  assert.equal(cueBall(game).pocketed, false, 'cue ball should be re-spotted');
  assert.equal(game.foulLog.scratch, true);
});

test('pool rules: potting only solids while the table is open assigns solids/stripes to each player', () => {
  const game = stillGame();
  game.shotInProgress = true;
  game.shotLog = { potted: [3, 5], firstContact: 3 };
  game.balls.find((b) => b.number === 3).pocketed = true;
  game.balls.find((b) => b.number === 5).pocketed = true;
  stepPoolPhysics(game);
  assert.equal(game.tableOpen, false);
  assert.equal(game.playerGroups[0], 'solid');
  assert.equal(game.playerGroups[1], 'stripe');
  assert.equal(game.currentPlayer, 0, 'player pocketed their own group, so they keep shooting');
});

test('pool rules: potting both solids and stripes on the break keeps the table open', () => {
  const game = stillGame();
  game.shotInProgress = true;
  game.shotLog = { potted: [2, 9], firstContact: 2 };
  game.balls.find((b) => b.number === 2).pocketed = true;
  game.balls.find((b) => b.number === 9).pocketed = true;
  stepPoolPhysics(game);
  assert.equal(game.tableOpen, true);
  assert.equal(game.playerGroups[0], null);
});

test('pool rules: potting no ball (and hitting nothing) passes the turn as a foul', () => {
  const game = stillGame();
  game.playerGroups = { 0: 'solid', 1: 'stripe' };
  game.tableOpen = false;
  game.shotInProgress = true;
  game.shotLog = { potted: [], firstContact: null };
  stepPoolPhysics(game);
  assert.equal(game.currentPlayer, 1);
  assert.equal(game.foulLog.noContact, true);
});

test('pool rules: potting the 8-ball before clearing your group is an immediate loss', () => {
  const game = stillGame();
  game.playerGroups = { 0: 'solid', 1: 'stripe' };
  game.tableOpen = false;
  game.shotInProgress = true;
  game.shotLog = { potted: [8], firstContact: 8 };
  game.balls.find((b) => b.number === 8).pocketed = true;
  stepPoolPhysics(game);
  assert.equal(game.gameOver, true);
  assert.equal(game.winner, 1);
  assert.equal(game.reason, 'eight_ball_early');
});

test('pool rules: legally potting the 8-ball after clearing your group wins the game', () => {
  const game = stillGame();
  game.playerGroups = { 0: 'solid', 1: 'stripe' };
  game.tableOpen = false;
  for (const b of game.balls) {
    if (b.group === 'solid') b.pocketed = true; // every solid already cleared
  }
  game.shotInProgress = true;
  game.shotLog = { potted: [8], firstContact: 8 };
  game.balls.find((b) => b.number === 8).pocketed = true;
  stepPoolPhysics(game);
  assert.equal(game.gameOver, true);
  assert.equal(game.winner, 0);
  assert.equal(game.reason, 'eight_ball_legal');
});

test('pool rules: potting the 8-ball legally but scratching on the same shot is a loss', () => {
  const game = stillGame();
  game.playerGroups = { 0: 'solid', 1: 'stripe' };
  game.tableOpen = false;
  for (const b of game.balls) {
    if (b.group === 'solid') b.pocketed = true;
  }
  game.shotInProgress = true;
  game.shotLog = { potted: [8, 0], firstContact: 8 };
  game.balls.find((b) => b.number === 8).pocketed = true;
  cueBall(game).pocketed = true;
  stepPoolPhysics(game);
  assert.equal(game.gameOver, true);
  assert.equal(game.winner, 1);
  assert.equal(game.reason, 'eight_ball_scratch');
});

test('pool: resetRack restores an in-progress game back to a fresh break state', () => {
  const game = createPoolGame({ rng: mulberry32(11) });
  game.gameOver = true;
  game.winner = 1;
  game.currentPlayer = 1;
  resetRack(game, mulberry32(12));
  assert.equal(game.gameOver, false);
  assert.equal(game.winner, null);
  assert.equal(game.currentPlayer, 0);
  assert.equal(game.balls.length, 16);
});

// =============================================================================
// Bot aim noise by difficulty
// =============================================================================

function singleTargetGame() {
  const game = createPoolGame({ rng: mulberry32(20) });
  for (const b of game.balls) {
    if (b.number !== 0 && b.number !== 1) b.pocketed = true;
  }
  const cue = cueBall(game);
  cue.x = 40; cue.y = 75;
  const one = game.balls.find((b) => b.number === 1);
  one.x = 150; one.y = 75;
  game.playerGroups[0] = 'solid';
  game.tableOpen = false;
  game.currentPlayer = 0;
  return game;
}

test('bot aim: easy difficulty produces larger average angle deviation than hard', () => {
  const trials = 400;
  let easySum = 0;
  let hardSum = 0;
  const rngEasy = mulberry32(42);
  const rngHard = mulberry32(42);
  let baseAngle = null;
  for (let i = 0; i < trials; i++) {
    const gameEasy = singleTargetGame();
    const { angle: aEasy } = pickBotShot(gameEasy, 'easy', rngEasy);
    const gameHard = singleTargetGame();
    const { angle: aHard } = pickBotShot(gameHard, 'hard', rngHard);
    if (baseAngle === null) {
      // Deterministic target/cue geometry means the noise-free base angle
      // is identical every trial; recover it once from a zero-noise rng.
      const refGame = singleTargetGame();
      baseAngle = pickBotShot(refGame, 'hard', () => 0.5).angle;
    }
    easySum += Math.abs(aEasy - baseAngle);
    hardSum += Math.abs(aHard - baseAngle);
  }
  const easyAvg = easySum / trials;
  const hardAvg = hardSum / trials;
  assert.ok(easyAvg > hardAvg * 1.5, `expected easy (${easyAvg}) to deviate much more than hard (${hardAvg})`);
});

test('bot aim: pickBotShot always returns a finite angle and power within [0.15, 1]', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 50; i++) {
    const game = singleTargetGame();
    const { angle, power } = pickBotShot(game, 'medium', rng);
    assert.ok(Number.isFinite(angle));
    assert.ok(power >= 0.15 && power <= 1);
  }
});
