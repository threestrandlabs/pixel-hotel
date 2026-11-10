// Unit tests for Pixel Hotel v0.11.0: group mini-games (Hotel Hide & Seek,
// Musical Chairs, Pixel Trivia), payload validation, authoritative host engine,
// mocked Realtime broadcast bus sync, and daily coin rewards.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIGAME_IDS,
  MINIGAME_INFO,
  MINIGAME_DAILY_COIN_CAP,
  validateMinigamePayload,
  awardMinigameCoins,
  createHideSeekGame,
  createMusicalChairsGame,
  createTriviaGame,
  MinigameHostEngine,
} from '../js/minigames/minigames.js';
import { TRIVIA_QUESTIONS } from '../js/minigames/triviaData.js';

// ======================= 1. Payload Validation =======================

test('minigames validation: accepts well-formed payloads', () => {
  const p1 = validateMinigamePayload({
    type: 'game_invite',
    gameId: 'hide_seek',
    hostId: 'host-123',
  });
  assert.ok(p1);
  assert.equal(p1.type, 'game_invite');
  assert.equal(p1.gameId, 'hide_seek');

  const p2 = validateMinigamePayload({
    type: 'game_action',
    action: 'claim_chair',
    senderId: 'user-456',
    data: { chairId: 'mc-chair-0' },
  });
  assert.ok(p2);
  assert.equal(p2.action, 'claim_chair');
  assert.equal(p2.data.chairId, 'mc-chair-0');
});

test('minigames validation: rejects invalid types, arrays, or bad gameIds', () => {
  assert.equal(validateMinigamePayload(null), null);
  assert.equal(validateMinigamePayload([]), null);
  assert.equal(validateMinigamePayload('string'), null);
  assert.equal(validateMinigamePayload({ type: 'unknown_type' }), null);
  assert.equal(validateMinigamePayload({ type: 'game_invite', gameId: 'trademarked_poker' }), null);
});

// ======================= 2. Hotel Hide & Seek =======================

test('hide & seek: requires between 2 and 8 players', () => {
  assert.throws(() => createHideSeekGame({ hostId: 'h1', players: [{ id: 'p1' }] }));
  const valid = createHideSeekGame({
    hostId: 'h1',
    players: [{ id: 'p1', displayName: 'Alice' }, { id: 'p2', displayName: 'Bob' }],
  });
  assert.ok(valid);
});

test('hide & seek: countdown phase ticks down and transitions to seeking', () => {
  const game = createHideSeekGame({
    hostId: 'h1',
    players: [{ id: 'p1', displayName: 'Alice' }, { id: 'p2', displayName: 'Bob' }],
    countdownSeconds: 3,
    gameSeconds: 20,
  });

  assert.equal(game.phase, 'countdown');
  assert.equal(game.countdownRemaining, 3);

  game.tick(2);
  assert.equal(game.phase, 'countdown');
  assert.equal(game.countdownRemaining, 1);

  game.tick(1);
  assert.equal(game.phase, 'seeking');
  assert.equal(game.gameRemaining, 20);
});

test('hide & seek: seeker tags hider by walking adjacent (Chebyshev distance <= 1)', () => {
  const game = createHideSeekGame({
    hostId: 'h1',
    seekerId: 'p1',
    players: [
      { id: 'p1', displayName: 'SeekerAlice', x: 2, y: 2 },
      { id: 'p2', displayName: 'HiderBob', x: 6, y: 6 },
    ],
    countdownSeconds: 1,
  });

  game.tick(1); // Finish countdown
  assert.equal(game.phase, 'seeking');
  assert.equal(game.players.p2.tagged, false);

  // Move seeker closer but not adjacent (dx=2, dy=2)
  game.updatePlayerPosition('p1', 4, 4);
  assert.equal(game.players.p2.tagged, false);

  // Move seeker adjacent to Bob (dx=1, dy=1)
  game.updatePlayerPosition('p1', 5, 5);
  assert.equal(game.players.p2.tagged, true);
  assert.equal(game.phase, 'results');
  assert.equal(game.winner, 'seeker');
});

test('hide & seek: hiders win when timer expires with survivors', () => {
  const game = createHideSeekGame({
    hostId: 'h1',
    seekerId: 'p1',
    players: [
      { id: 'p1', displayName: 'SeekerAlice', x: 1, y: 1 },
      { id: 'p2', displayName: 'HiderBob', x: 7, y: 7 },
    ],
    countdownSeconds: 1,
    gameSeconds: 5,
  });

  game.tick(1); // Countdown done
  game.tick(5); // Game time expires without tag

  assert.equal(game.phase, 'results');
  assert.equal(game.winner, 'hiders');
  assert.ok(game.summary.includes('HiderBob'));
});

// ======================= 3. Musical Chairs =======================

test('musical chairs: spawns N-1 chairs for N players and starts music', () => {
  const game = createMusicalChairsGame({
    hostId: 'h1',
    players: [
      { id: 'p1', displayName: 'Alice' },
      { id: 'p2', displayName: 'Bob' },
      { id: 'p3', displayName: 'Charlie' },
    ],
  });

  assert.equal(game.players.length, 3);
  assert.equal(game.chairs.length, 2); // 3 players - 1 = 2 chairs
  assert.equal(game.phase, 'music_playing');
  assert.equal(game.round, 1);
  assert.ok(game.currentTrack);
});

test('musical chairs: cannot claim chair while music is playing', () => {
  const game = createMusicalChairsGame({
    hostId: 'h1',
    players: [
      { id: 'p1', displayName: 'Alice', x: 3, y: 3 },
      { id: 'p2', displayName: 'Bob', x: 4, y: 3 },
    ],
  });

  const res = game.claimChair('p1', 'mc-chair-0');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'music_still_playing');
});

test('musical chairs: stopping music lets players claim adjacent chairs and eliminates unseated player', () => {
  const game = createMusicalChairsGame({
    hostId: 'h1',
    players: [
      { id: 'p1', displayName: 'Alice', x: 3, y: 3 },
      { id: 'p2', displayName: 'Bob', x: 4, y: 3 },
      { id: 'p3', displayName: 'Charlie', x: 1, y: 1 },
    ],
  });

  game.stopMusic();
  assert.equal(game.phase, 'music_stopped');

  // Alice claims chair 0 (at 3, 3)
  const res1 = game.claimChair('p1', 'mc-chair-0');
  assert.equal(res1.ok, true);

  // Bob tries claiming chair 0 (already taken)
  const res2 = game.claimChair('p2', 'mc-chair-0');
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'chair_occupied');

  // Bob claims chair 1 (at 4, 3)
  const res3 = game.claimChair('p2', 'mc-chair-1');
  assert.equal(res3.ok, true);

  // All chairs occupied -> Charlie eliminated, round advances to round 2 with 1 chair!
  assert.equal(game.round, 2);
  assert.equal(game.chairs.length, 1);
  assert.equal(game.players.find((p) => p.id === 'p3').eliminated, true);

  // Next round: Alice and Bob battle for 1 chair
  game.stopMusic();
  game.claimChair('p1', 'mc-chair-0');

  // Final player remaining wins!
  assert.equal(game.phase, 'results');
  assert.equal(game.winner, 'p1');
});

// ======================= 4. Pixel Trivia =======================

test('pixel trivia: loads questions and masks correct answer during question phase', () => {
  const game = createTriviaGame({
    hostId: 'h1',
    players: [
      { id: 'p1', displayName: 'Alice' },
      { id: 'p2', displayName: 'Bob' },
    ],
    questionCount: 10,
  });

  assert.equal(game.totalQuestions, 10);
  assert.equal(game.phase, 'question');

  const sanitized = game.getSanitizedQuestion();
  assert.ok(sanitized.question);
  assert.equal(sanitized.options.length, 4);
  assert.equal(sanitized.correctAnswer, undefined); // Never leaked to client
});

test('pixel trivia: accepts valid answers, awards speed bonus points, and advances questions', () => {
  const customQuestions = [
    {
      id: 'q1',
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      answer: 1,
      fact: 'Math fact',
    },
    {
      id: 'q2',
      question: 'What color is grass?',
      options: ['Red', 'Green', 'Blue', 'Yellow'],
      answer: 1,
      fact: 'Chlorophyll makes grass green',
    },
  ];

  const game = createTriviaGame({
    hostId: 'h1',
    players: [
      { id: 'p1', displayName: 'Alice' },
      { id: 'p2', displayName: 'Bob' },
    ],
    questions: customQuestions,
    questionCount: 2,
    secondsPerQuestion: 10,
    revealSeconds: 1,
  });

  // Question 1: Alice answers 1 (correct, 10s left), Bob answers 0 (wrong)
  const a1 = game.submitAnswer('p1', 0, 1);
  assert.equal(a1.ok, true);
  // Duplicate answer rejected
  const a1Dup = game.submitAnswer('p1', 0, 1);
  assert.equal(a1Dup.ok, false);

  const a2 = game.submitAnswer('p2', 0, 0);
  assert.equal(a2.ok, true);

  // All answered -> automatic reveal
  assert.equal(game.phase, 'reveal');
  assert.ok(game.scores.p1 >= 150); // 100 base + 50 speed bonus
  assert.equal(game.scores.p2, 0);

  // Tick reveal timer -> advances to Question 2
  game.tick(1);
  assert.equal(game.phase, 'question');
  assert.equal(game.currentIndex, 1);

  // Question 2: Bob answers correctly
  game.submitAnswer('p1', 1, 0); // wrong
  game.submitAnswer('p2', 1, 1); // correct

  game.tick(1); // Advance past reveal -> results phase
  assert.equal(game.phase, 'results');
  assert.equal(game.winner, 'p1'); // Alice had speed bonus advantage
});

// ======================= 5. Mocked Realtime Broadcast Bus Sync =======================

test('mocked realtime bus: host engine syncs state to guest and handles actions', () => {
  const bus = [];
  const fakeChannel = {
    send({ type, event, payload }) {
      bus.push({ type, event, payload });
    },
  };

  const hostEngine = new MinigameHostEngine({
    hostId: 'alice-id',
    channel: fakeChannel,
    getSaveState: () => ({ coins: 100, minigames: { dailyCoins: 0, lastRewardDate: '' } }),
  });

  // Host opens Trivia lobby
  const openRes = hostEngine.openLobby(MINIGAME_IDS.TRIVIA, { id: 'alice-id', display_name: 'Alice' });
  assert.equal(openRes.ok, true);
  assert.equal(bus.length, 1);
  assert.equal(bus[0].payload.type, 'game_invite');

  // Dave joins the lobby
  const joinRes = hostEngine.addPlayer('dave-id', 'Dave');
  assert.equal(joinRes.ok, true);
  assert.equal(joinRes.count, 2);

  // Host starts game
  const startRes = hostEngine.startGame();
  assert.equal(startRes.ok, true);

  const lastBroadcast = bus[bus.length - 1];
  assert.equal(lastBroadcast.payload.type, 'game_state');
  assert.equal(lastBroadcast.payload.gameId, MINIGAME_IDS.TRIVIA);
  assert.equal(lastBroadcast.payload.state.phase, 'question');

  // Dave submits answer action through host
  const actionRes = hostEngine.handleAction('dave-id', {
    action: 'answer',
    data: { qIndex: 0, answerIndex: 2 },
  });
  assert.equal(actionRes.ok, true);
});

// ======================= 6. Daily Coin Rewards & Cap =======================

test('daily coin rewards: awards coins up to MINIGAME_DAILY_COIN_CAP and resets on new date', () => {
  const save = {
    coins: 50,
    minigames: { dailyCoins: 0, lastRewardDate: '2026-11-11' },
  };

  const r1 = awardMinigameCoins(save, 20, '2026-11-11');
  assert.equal(r1.awarded, 20);
  assert.equal(save.coins, 70);
  assert.equal(save.minigames.dailyCoins, 20);

  // Award another 35 coins -> total 55
  const r2 = awardMinigameCoins(save, 35, '2026-11-11');
  assert.equal(r2.awarded, 35);
  assert.equal(save.minigames.dailyCoins, 55);

  // Award 15 coins -> only 5 remaining to cap of 60
  const r3 = awardMinigameCoins(save, 15, '2026-11-11');
  assert.equal(r3.awarded, 5);
  assert.equal(save.minigames.dailyCoins, 60);
  assert.equal(r3.cappedOut, true);

  // Rolling to a new date resets allowance
  const r4 = awardMinigameCoins(save, 10, '2026-11-12');
  assert.equal(r4.awarded, 10);
  assert.equal(save.minigames.dailyCoins, 10);
  assert.equal(save.minigames.lastRewardDate, '2026-11-12');
});
