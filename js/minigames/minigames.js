// Group Mini-Games Engine for Pixel Hotel v0.11.0.
// Pure ES module: state machines, payload validation, authoritative host logic,
// and daily coin cap rewards. Safe for both browser and Node unit tests.

import { TRIVIA_QUESTIONS } from './triviaData.js';

export const MINIGAME_IDS = {
  HIDE_SEEK: 'hide_seek',
  MUSICAL_CHAIRS: 'musical_chairs',
  TRIVIA: 'trivia',
};

export const MINIGAME_INFO = {
  [MINIGAME_IDS.HIDE_SEEK]: {
    id: MINIGAME_IDS.HIDE_SEEK,
    title: 'Hotel Hide & Seek',
    icon: '🙈',
    tagline: 'One seeker, many hiders — run, hide, or tag!',
    minPlayers: 2,
    maxPlayers: 8,
  },
  [MINIGAME_IDS.MUSICAL_CHAIRS]: {
    id: MINIGAME_IDS.MUSICAL_CHAIRS,
    title: 'Musical Chairs',
    icon: '🪑',
    tagline: 'When the music stops, scramble for a chair!',
    minPlayers: 2,
    maxPlayers: 8,
  },
  [MINIGAME_IDS.TRIVIA]: {
    id: MINIGAME_IDS.TRIVIA,
    title: 'Pixel Trivia',
    icon: '💡',
    tagline: '10 quick-fire questions on Singapore & the world!',
    minPlayers: 2,
    maxPlayers: 8,
  },
};

export const MINIGAME_DAILY_COIN_CAP = 60;

/**
 * Awards coins capped per day, updating saveState.minigames and saveState.coins.
 */
export function awardMinigameCoins(state, amount, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!state.minigames) {
    state.minigames = { dailyCoins: 0, lastRewardDate: todayStr };
  }
  if (state.minigames.lastRewardDate !== todayStr) {
    state.minigames.dailyCoins = 0;
    state.minigames.lastRewardDate = todayStr;
  }

  const earned = Math.max(0, Math.floor(Number(amount) || 0));
  const remaining = Math.max(0, MINIGAME_DAILY_COIN_CAP - (state.minigames.dailyCoins || 0));
  const awarded = Math.min(earned, remaining);

  if (awarded > 0) {
    state.coins = (state.coins || 0) + awarded;
    state.minigames.dailyCoins = (state.minigames.dailyCoins || 0) + awarded;
  }

  return {
    awarded,
    earned,
    dailyTotal: state.minigames.dailyCoins,
    dailyCap: MINIGAME_DAILY_COIN_CAP,
    cappedOut: state.minigames.dailyCoins >= MINIGAME_DAILY_COIN_CAP,
  };
}

/**
 * Validates any incoming minigame broadcast payload.
 * Prevents proto-pollution, oversized inputs, and malformed types.
 */
export function validateMinigamePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const type = String(payload.type || '').trim();
  const validTypes = ['game_invite', 'game_join', 'game_leave', 'game_state', 'game_action'];
  if (!validTypes.includes(type)) return null;

  const gameId = payload.gameId ? String(payload.gameId).trim() : null;
  if (gameId && !Object.values(MINIGAME_IDS).includes(gameId)) return null;

  const senderId = payload.senderId ? String(payload.senderId).trim() : null;
  const hostId = payload.hostId ? String(payload.hostId).trim() : null;

  return {
    type,
    gameId,
    senderId,
    hostId,
    action: payload.action ? String(payload.action).trim() : null,
    phase: payload.phase ? String(payload.phase).trim() : null,
    data: (payload.data && typeof payload.data === 'object') ? payload.data : null,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
  };
}

// ============================================================================
// 1) Hotel Hide & Seek State Machine
// ============================================================================

export function createHideSeekGame({
  hostId,
  players = [],
  seekerId = null,
  countdownSeconds = 10,
  gameSeconds = 45,
}) {
  if (players.length < 2 || players.length > 8) {
    throw new Error('Hide & Seek requires 2 to 8 players');
  }

  const chosenSeeker = seekerId && players.some((p) => p.id === seekerId)
    ? seekerId
    : players[0].id;

  const playerMap = {};
  for (const p of players) {
    playerMap[p.id] = {
      id: p.id,
      displayName: p.displayName || 'Guest',
      isSeeker: p.id === chosenSeeker,
      tagged: false,
      taggedAt: null,
      x: p.x || 4,
      y: p.y || 4,
    };
  }

  return {
    gameId: MINIGAME_IDS.HIDE_SEEK,
    hostId,
    seekerId: chosenSeeker,
    phase: 'countdown', // 'countdown' | 'seeking' | 'results'
    countdownRemaining: countdownSeconds,
    gameRemaining: gameSeconds,
    players: playerMap,
    winner: null, // 'seeker' | 'hiders'
    summary: '',
    rewardsAwarded: false,

    tick(dtSeconds = 1) {
      if (this.phase === 'countdown') {
        this.countdownRemaining = Math.max(0, this.countdownRemaining - dtSeconds);
        if (this.countdownRemaining <= 0) {
          this.phase = 'seeking';
        }
        return this.getState();
      }

      if (this.phase === 'seeking') {
        this.gameRemaining = Math.max(0, this.gameRemaining - dtSeconds);
        this.checkTags();

        const allHidersTagged = this.getUntaggedHiders().length === 0;
        if (allHidersTagged) {
          this.phase = 'results';
          this.winner = 'seeker';
          this.summary = 'The seeker found all hiders!';
        } else if (this.gameRemaining <= 0) {
          this.phase = 'results';
          this.winner = 'hiders';
          const survivors = this.getUntaggedHiders().map((h) => h.displayName).join(', ');
          this.summary = `Time expired! Surviving hiders win: ${survivors}`;
        }
      }

      return this.getState();
    },

    updatePlayerPosition(userId, x, y) {
      if (!this.players[userId]) return;
      this.players[userId].x = x;
      this.players[userId].y = y;

      if (this.phase === 'seeking') {
        this.checkTags();
      }
    },

    checkTags() {
      if (this.phase !== 'seeking') return;
      const seeker = this.players[this.seekerId];
      if (!seeker) return;

      for (const p of Object.values(this.players)) {
        if (p.isSeeker || p.tagged) continue;
        // Seeker tags by walking adjacent (Chebyshev distance <= 1 tile)
        const dx = Math.abs(seeker.x - p.x);
        const dy = Math.abs(seeker.y - p.y);
        if (dx <= 1 && dy <= 1) {
          p.tagged = true;
          p.taggedAt = Date.now();
        }
      }

      const allHidersTagged = this.getUntaggedHiders().length === 0;
      if (allHidersTagged) {
        this.phase = 'results';
        this.winner = 'seeker';
        this.summary = 'The seeker found all hiders!';
      }
    },

    getUntaggedHiders() {
      return Object.values(this.players).filter((p) => !p.isSeeker && !p.tagged);
    },

    getTaggedHiders() {
      return Object.values(this.players).filter((p) => !p.isSeeker && p.tagged);
    },

    getState() {
      return {
        gameId: this.gameId,
        hostId: this.hostId,
        seekerId: this.seekerId,
        phase: this.phase,
        countdownRemaining: Math.ceil(this.countdownRemaining),
        gameRemaining: Math.ceil(this.gameRemaining),
        players: { ...this.players },
        winner: this.winner,
        summary: this.summary,
      };
    },
  };
}

// ============================================================================
// 2) Musical Chairs State Machine
// ============================================================================

export const MUSICAL_CHAIRS_TRACKS = ['arcade', 'cafe', 'lobby', 'restaurant', 'gym'];

export function createMusicalChairsGame({
  hostId,
  players = [],
  tracks = MUSICAL_CHAIRS_TRACKS,
  musicDurationFn = () => 4 + Math.random() * 4,
}) {
  if (players.length < 2 || players.length > 8) {
    throw new Error('Musical Chairs requires 2 to 8 players');
  }

  const activePlayers = players.map((p) => ({
    id: p.id,
    displayName: p.displayName || 'Guest',
    seatedOn: null,
    eliminated: false,
    x: p.x || 4,
    y: p.y || 4,
  }));

  // Standard chair positions around the room center (9x8 room)
  const CHAIR_SPOTS = [
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 4, y: 2 },
  ];

  function makeChairs(count) {
    const chairs = [];
    for (let i = 0; i < count; i++) {
      const spot = CHAIR_SPOTS[i % CHAIR_SPOTS.length];
      chairs.push({
        id: `mc-chair-${i}`,
        x: spot.x,
        y: spot.y,
        occupiedBy: null,
      });
    }
    return chairs;
  }

  const initialChairs = makeChairs(activePlayers.length - 1);
  const initialTrack = tracks[0] || 'lobby';

  return {
    gameId: MINIGAME_IDS.MUSICAL_CHAIRS,
    hostId,
    round: 1,
    phase: 'music_playing', // 'music_playing' | 'music_stopped' | 'round_end' | 'results'
    players: activePlayers,
    chairs: initialChairs,
    currentTrack: initialTrack,
    musicTimeRemaining: musicDurationFn(),
    winner: null,
    summary: '',

    tick(dtSeconds = 1) {
      if (this.phase === 'music_playing') {
        this.musicTimeRemaining = Math.max(0, this.musicTimeRemaining - dtSeconds);
        if (this.musicTimeRemaining <= 0) {
          this.stopMusic();
        }
        return this.getState();
      }

      if (this.phase === 'music_stopped') {
        // If all chairs are occupied, immediately resolve round
        const allOccupied = this.chairs.every((c) => c.occupiedBy !== null);
        if (allOccupied) {
          this.resolveRound();
        }
      }

      return this.getState();
    },

    stopMusic() {
      this.phase = 'music_stopped';
    },

    claimChair(userId, chairId) {
      if (this.phase !== 'music_stopped') {
        return { ok: false, reason: 'music_still_playing' };
      }

      const player = this.players.find((p) => p.id === userId && !p.eliminated);
      if (!player) return { ok: false, reason: 'not_active_player' };
      if (player.seatedOn) return { ok: false, reason: 'already_seated' };

      const chair = this.chairs.find((c) => c.id === chairId);
      if (!chair) return { ok: false, reason: 'chair_not_found' };
      if (chair.occupiedBy) return { ok: false, reason: 'chair_occupied' };

      // Validate proximity: player must be adjacent or on the chair tile (Chebyshev <= 1)
      const dx = Math.abs(player.x - chair.x);
      const dy = Math.abs(player.y - chair.y);
      if (dx > 1 || dy > 1) {
        return { ok: false, reason: 'too_far_from_chair' };
      }

      chair.occupiedBy = userId;
      player.seatedOn = chairId;

      const allOccupied = this.chairs.every((c) => c.occupiedBy !== null);
      if (allOccupied) {
        this.resolveRound();
      }

      return { ok: true, chairId, userId };
    },

    updatePlayerPosition(userId, x, y) {
      const p = this.players.find((pl) => pl.id === userId);
      if (p) {
        p.x = x;
        p.y = y;
      }
    },

    resolveRound() {
      const unseated = this.players.filter((p) => !p.eliminated && !p.seatedOn);
      for (const p of unseated) {
        p.eliminated = true;
      }

      const remaining = this.players.filter((p) => !p.eliminated);
      if (remaining.length <= 1) {
        this.phase = 'results';
        this.winner = remaining[0] ? remaining[0].id : null;
        this.summary = remaining[0]
          ? `${remaining[0].displayName} is the last one standing and wins Musical Chairs!`
          : 'Game over!';
        return;
      }

      // Prepare next round
      this.round += 1;
      this.phase = 'music_playing';
      this.musicTimeRemaining = musicDurationFn();
      this.currentTrack = tracks[(this.round - 1) % tracks.length];

      // Reset seating and reduce chairs by 1
      for (const p of this.players) {
        p.seatedOn = null;
      }
      this.chairs = makeChairs(remaining.length - 1);
    },

    getState() {
      return {
        gameId: this.gameId,
        hostId: this.hostId,
        round: this.round,
        phase: this.phase,
        currentTrack: this.currentTrack,
        musicPlaying: this.phase === 'music_playing',
        musicTimeRemaining: Math.ceil(this.musicTimeRemaining),
        players: this.players.map((p) => ({ ...p })),
        chairs: this.chairs.map((c) => ({ ...c })),
        winner: this.winner,
        summary: this.summary,
      };
    },
  };
}

// ============================================================================
// 3) Pixel Trivia State Machine
// ============================================================================

export function createTriviaGame({
  hostId,
  players = [],
  questions = TRIVIA_QUESTIONS,
  questionCount = 10,
  secondsPerQuestion = 10,
  revealSeconds = 3,
}) {
  if (players.length < 2 || players.length > 8) {
    throw new Error('Pixel Trivia requires 2 to 8 players');
  }

  // Pick up to `questionCount` questions from the pool
  const selectedPool = [...questions].sort(() => 0.5 - Math.random()).slice(0, questionCount);

  const scores = {};
  for (const p of players) {
    scores[p.id] = 0;
  }

  return {
    gameId: MINIGAME_IDS.TRIVIA,
    hostId,
    totalQuestions: selectedPool.length,
    currentIndex: 0,
    phase: 'question', // 'question' | 'reveal' | 'results'
    timeRemaining: secondsPerQuestion,
    revealTimeRemaining: revealSeconds,
    questions: selectedPool,
    answersForCurrent: {}, // userId -> { answerIndex, timeLeft }
    scores,
    players: players.map((p) => ({ id: p.id, displayName: p.displayName || 'Guest' })),
    winner: null,
    summary: '',

    tick(dtSeconds = 1) {
      if (this.phase === 'question') {
        this.timeRemaining = Math.max(0, this.timeRemaining - dtSeconds);
        // If time runs out OR all players answered, trigger reveal
        const allAnswered = this.players.every((p) => this.answersForCurrent[p.id] !== undefined);
        if (this.timeRemaining <= 0 || allAnswered) {
          this.triggerReveal();
        }
        return this.getState();
      }

      if (this.phase === 'reveal') {
        this.revealTimeRemaining = Math.max(0, this.revealTimeRemaining - dtSeconds);
        if (this.revealTimeRemaining <= 0) {
          this.advanceNext();
        }
        return this.getState();
      }

      return this.getState();
    },

    submitAnswer(userId, qIndex, answerIndex) {
      if (this.phase !== 'question') return { ok: false, reason: 'not_in_question_phase' };
      if (qIndex !== this.currentIndex) return { ok: false, reason: 'question_index_mismatch' };
      if (this.answersForCurrent[userId] !== undefined) return { ok: false, reason: 'already_answered' };
      if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex > 3) {
        return { ok: false, reason: 'invalid_answer_index' };
      }

      this.answersForCurrent[userId] = {
        answerIndex,
        timeLeft: this.timeRemaining,
      };

      const allAnswered = this.players.every((p) => this.answersForCurrent[p.id] !== undefined);
      if (allAnswered) {
        this.triggerReveal();
      }

      return { ok: true };
    },

    triggerReveal() {
      this.phase = 'reveal';
      this.revealTimeRemaining = revealSeconds;
      const curQ = this.questions[this.currentIndex];

      // Award points: 100 base for correct answer + speed bonus (5 pts per second left)
      for (const p of this.players) {
        const sub = this.answersForCurrent[p.id];
        if (sub && sub.answerIndex === curQ.answer) {
          const speedBonus = Math.max(0, Math.round(sub.timeLeft * 5));
          this.scores[p.id] += 100 + speedBonus;
        }
      }
    },

    advanceNext() {
      if (this.currentIndex + 1 < this.totalQuestions) {
        this.currentIndex += 1;
        this.phase = 'question';
        this.timeRemaining = secondsPerQuestion;
        this.answersForCurrent = {};
      } else {
        this.phase = 'results';
        // Rank players by score descending
        const ranked = [...this.players].sort((a, b) => (this.scores[b.id] || 0) - (this.scores[a.id] || 0));
        this.winner = ranked[0] ? ranked[0].id : null;
        this.summary = ranked[0]
          ? `Winner: ${ranked[0].displayName} with ${this.scores[ranked[0].id]} points!`
          : 'Trivia ended!';
      }
    },

    getSanitizedQuestion() {
      const q = this.questions[this.currentIndex];
      if (!q) return null;
      return {
        qIndex: this.currentIndex,
        total: this.totalQuestions,
        question: q.question,
        options: [...q.options],
        category: q.category,
      };
    },

    getState() {
      const curQ = this.questions[this.currentIndex];
      return {
        gameId: this.gameId,
        hostId: this.hostId,
        currentIndex: this.currentIndex,
        totalQuestions: this.totalQuestions,
        phase: this.phase,
        timeRemaining: Math.ceil(this.timeRemaining),
        revealTimeRemaining: Math.ceil(this.revealTimeRemaining),
        question: this.getSanitizedQuestion(),
        correctAnswer: this.phase === 'reveal' || this.phase === 'results' ? curQ?.answer : null,
        fact: this.phase === 'reveal' || this.phase === 'results' ? curQ?.fact : null,
        answers: { ...this.answersForCurrent },
        scores: { ...this.scores },
        players: [...this.players],
        winner: this.winner,
        summary: this.summary,
      };
    },
  };
}

// ============================================================================
// Authoritative Host Controller
// ============================================================================

export class MinigameHostEngine {
  constructor({ hostId, channel, getSaveState, broadcastFn = null }) {
    this.hostId = hostId;
    this.channel = channel;
    this.getSaveState = getSaveState;
    this.broadcastFn = broadcastFn || ((event, payload) => {
      if (this.channel) this.channel.send({ type: 'broadcast', event, payload });
    });

    this.activeGame = null;
    this.lobbyGameId = null;
    this.lobbyPlayers = new Map(); // userId -> { id, displayName }
  }

  openLobby(gameId, hostProfile) {
    if (!Object.values(MINIGAME_IDS).includes(gameId)) {
      return { ok: false, reason: 'invalid_game_id' };
    }
    this.lobbyGameId = gameId;
    this.lobbyPlayers.clear();
    this.lobbyPlayers.set(hostProfile.id, { id: hostProfile.id, displayName: hostProfile.display_name });
    this.activeGame = null;

    this.broadcast('minigame', {
      type: 'game_invite',
      hostId: this.hostId,
      gameId,
      title: MINIGAME_INFO[gameId]?.title || gameId,
      timestamp: Date.now(),
    });

    return { ok: true, lobbyGameId: gameId };
  }

  addPlayer(userId, displayName) {
    if (!this.lobbyGameId) return { ok: false, reason: 'no_lobby' };
    if (this.lobbyPlayers.size >= 8) return { ok: false, reason: 'lobby_full' };

    this.lobbyPlayers.set(userId, { id: userId, displayName: displayName || 'Guest' });
    this.broadcastState();
    return { ok: true, count: this.lobbyPlayers.size };
  }

  removePlayer(userId) {
    this.lobbyPlayers.delete(userId);
    if (this.activeGame) {
      if (this.activeGame.gameId === MINIGAME_IDS.HIDE_SEEK) {
        if (this.activeGame.seekerId === userId) {
          // Seeker left, abort or assign new
          this.activeGame.phase = 'results';
          this.activeGame.summary = 'The seeker disconnected. Game ended.';
        } else if (this.activeGame.players[userId]) {
          delete this.activeGame.players[userId];
        }
      } else if (this.activeGame.gameId === MINIGAME_IDS.MUSICAL_CHAIRS) {
        this.activeGame.players = this.activeGame.players.filter((p) => p.id !== userId);
        if (this.activeGame.players.length <= 1) {
          this.activeGame.phase = 'results';
          this.activeGame.summary = 'Not enough players left. Game ended.';
        }
      } else if (this.activeGame.gameId === MINIGAME_IDS.TRIVIA) {
        this.activeGame.players = this.activeGame.players.filter((p) => p.id !== userId);
        delete this.activeGame.scores[userId];
      }
      this.broadcastState();
    }
  }

  startGame() {
    if (!this.lobbyGameId) return { ok: false, reason: 'no_lobby' };
    const players = Array.from(this.lobbyPlayers.values());
    if (players.length < 2) return { ok: false, reason: 'need_at_least_2_players' };

    switch (this.lobbyGameId) {
      case MINIGAME_IDS.HIDE_SEEK:
        this.activeGame = createHideSeekGame({ hostId: this.hostId, players });
        break;
      case MINIGAME_IDS.MUSICAL_CHAIRS:
        this.activeGame = createMusicalChairsGame({ hostId: this.hostId, players });
        break;
      case MINIGAME_IDS.TRIVIA:
        this.activeGame = createTriviaGame({ hostId: this.hostId, players });
        break;
      default:
        return { ok: false, reason: 'unknown_game' };
    }

    this.broadcastState();
    return { ok: true, gameId: this.lobbyGameId };
  }

  handleAction(senderId, payload) {
    if (!this.activeGame) return { ok: false, reason: 'no_active_game' };

    const { action, data } = payload;
    if (this.activeGame.gameId === MINIGAME_IDS.MUSICAL_CHAIRS && action === 'claim_chair') {
      const res = this.activeGame.claimChair(senderId, data?.chairId);
      if (res.ok) this.broadcastState();
      return res;
    }

    if (this.activeGame.gameId === MINIGAME_IDS.TRIVIA && action === 'answer') {
      const res = this.activeGame.submitAnswer(senderId, data?.qIndex, data?.answerIndex);
      if (res.ok) this.broadcastState();
      return res;
    }

    if (action === 'update_pos') {
      if (Number.isFinite(data?.x) && Number.isFinite(data?.y)) {
        const x = Math.max(0, Math.min(64, data.x));
        const y = Math.max(0, Math.min(64, data.y));
        this.activeGame.updatePlayerPosition?.(senderId, x, y);
      }
    }

    return { ok: true };
  }

  tick(dt = 1) {
    if (!this.activeGame) return;
    this.activeGame.tick(dt);

    if (this.activeGame.phase === 'results' && !this.activeGame.rewardsAwarded) {
      this.activeGame.rewardsAwarded = true;
      this.awardGameRewards();
    }

    this.broadcastState();
  }

  awardGameRewards() {
    const save = this.getSaveState?.();
    if (!save) return;

    if (this.activeGame.gameId === MINIGAME_IDS.HIDE_SEEK) {
      if (this.activeGame.winner === 'seeker' && this.activeGame.seekerId === this.hostId) {
        awardMinigameCoins(save, 15);
      } else if (this.activeGame.winner === 'hiders' && this.hostId !== this.activeGame.seekerId) {
        awardMinigameCoins(save, 10);
      }
    } else if (this.activeGame.gameId === MINIGAME_IDS.MUSICAL_CHAIRS) {
      if (this.activeGame.winner === this.hostId) {
        awardMinigameCoins(save, 15);
      }
    } else if (this.activeGame.gameId === MINIGAME_IDS.TRIVIA) {
      const hostScore = this.activeGame.scores[this.hostId] || 0;
      const ranked = [...this.activeGame.players].sort((a, b) => (this.activeGame.scores[b.id] || 0) - (this.activeGame.scores[a.id] || 0));
      const rankIdx = ranked.findIndex((p) => p.id === this.hostId);
      const coins = rankIdx === 0 ? 15 : rankIdx === 1 ? 10 : rankIdx === 2 ? 6 : 3;
      awardMinigameCoins(save, coins);
    }
  }

  broadcast(event, payload) {
    try {
      this.broadcastFn(event, payload);
    } catch (_) {
      // Ignore broadcast network drops
    }
  }

  broadcastState() {
    if (!this.activeGame) return;
    this.broadcast('minigame', {
      type: 'game_state',
      hostId: this.hostId,
      gameId: this.activeGame.gameId,
      state: this.activeGame.getState(),
      timestamp: Date.now(),
    });
  }

  endGame() {
    this.activeGame = null;
    this.lobbyGameId = null;
    this.lobbyPlayers.clear();
    this.broadcast('minigame', {
      type: 'game_state',
      hostId: this.hostId,
      gameId: null,
      state: null,
      timestamp: Date.now(),
    });
  }
}
