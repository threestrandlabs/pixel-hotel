// Group Mini-Games UI coordinator for Pixel Hotel v0.11.0.
// Manages the Games modal, HUD overlay, authoritative host synchronization,
// audio playback for Musical Chairs, and daily coin cap rewards.

import {
  MINIGAME_IDS,
  MINIGAME_INFO,
  MINIGAME_DAILY_COIN_CAP,
  MinigameHostEngine,
  validateMinigamePayload,
  awardMinigameCoins,
} from './minigames.js';
import { createReceiveThrottle } from '../multiplayer/realtimeRoom.js';

// Per-sender receive throttles, mirroring realtimeRoom.js's pos/chat/emote
// throttles: defends the host against a single sender flooding game_action
// broadcasts faster than any legitimate client/UI would produce them.
const posActionThrottle = createReceiveThrottle(60);
const gameActionThrottle = createReceiveThrottle(250);

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const state = {
  hostApi: null,
  roomCode: null,
  isRoomOwner: false,
  profile: null,
  channel: null,
  hostEngine: null,
  activeGameState: null,
  localJoined: false,
  pendingInvite: null,
  lastTickAt: 0,
  lastMusicState: null,
  localRewardsAwarded: false,
};

// Introspection hook for Playwright / smoke tests
if (typeof window !== 'undefined') {
  window.__minigamesDebugState = state;
}

export function initMinigamesUI(hostApi) {
  state.hostApi = hostApi;

  // Games button in multiplayer room panel
  const btnGames = byId('btnMpGames');
  if (btnGames) {
    btnGames.addEventListener('click', openMinigamesModal);
  }

  // Close modal button
  const btnClose = byId('btnMinigameModalClose');
  if (btnClose) {
    btnClose.addEventListener('click', closeMinigamesModal);
  }

  // Start game buttons (Host view)
  document.querySelectorAll('.btn-start-minigame').forEach((btn) => {
    btn.addEventListener('click', () => {
      const gameId = btn.dataset.game;
      if (gameId && state.isRoomOwner) {
        startMinigameAsHost(gameId);
      }
    });
  });

  // Join / Decline buttons (Guest view)
  const btnJoin = byId('btnMinigameJoin');
  if (btnJoin) {
    btnJoin.addEventListener('click', () => {
      joinPendingGame();
    });
  }

  const btnDecline = byId('btnMinigameDecline');
  if (btnDecline) {
    btnDecline.addEventListener('click', () => {
      declinePendingGame();
    });
  }

  // HUD Leave button
  const btnLeave = byId('btnMinigameHudLeave');
  if (btnLeave) {
    btnLeave.addEventListener('click', () => {
      leaveActiveGame();
    });
  }
}

export function setMultiplayerContext({ roomCode, isRoomOwner, profile, channel }) {
  state.roomCode = roomCode;
  state.isRoomOwner = !!isRoomOwner;
  state.profile = profile;
  state.channel = channel;

  if (state.isRoomOwner && channel && profile) {
    state.hostEngine = new MinigameHostEngine({
      hostId: profile.id,
      channel,
      getSaveState: () => state.hostApi?.getSaveState?.(),
      broadcastFn: (event, payload) => {
        channel.send({ type: 'broadcast', event, payload });
      },
    });
  } else {
    state.hostEngine = null;
  }

  if (!roomCode) {
    closeMinigamesModal();
    hideHud();
    state.activeGameState = null;
    state.pendingInvite = null;
    state.localJoined = false;
    state.localRewardsAwarded = false;
  }
}

export function openMinigamesModal() {
  const modal = byId('minigameModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderModalContent();
}

export function closeMinigamesModal() {
  const modal = byId('minigameModal');
  if (modal) modal.classList.add('hidden');
}

function updateDailyCapDisplay() {
  const dailyEl = byId('minigameDailyCoins');
  if (!dailyEl) return;
  const save = state.hostApi?.getSaveState?.();
  const count = save?.minigames?.dailyCoins || 0;
  dailyEl.textContent = `${count}/${MINIGAME_DAILY_COIN_CAP}`;
}

function renderModalContent() {
  updateDailyCapDisplay();
  const hostView = byId('minigameHostView');
  const guestView = byId('minigameGuestView');

  if (state.isRoomOwner) {
    if (hostView) hostView.classList.remove('hidden');
    if (guestView) guestView.classList.add('hidden');
  } else {
    if (hostView) hostView.classList.add('hidden');
    if (guestView) guestView.classList.remove('hidden');

    const inviteCard = byId('minigameInviteCard');
    const waitingText = byId('minigameGuestWaiting');
    if (state.pendingInvite) {
      if (inviteCard) inviteCard.classList.remove('hidden');
      if (waitingText) waitingText.classList.add('hidden');
      byId('minigameInviteTitle').textContent = state.pendingInvite.title || 'Party Mini-Game';
      byId('minigameInviteDesc').textContent = `Host started ${state.pendingInvite.title}! Would you like to join?`;
    } else {
      if (inviteCard) inviteCard.classList.add('hidden');
      if (waitingText) waitingText.classList.remove('hidden');
    }
  }
}

function startMinigameAsHost(gameId) {
  if (!state.hostEngine || !state.profile) return;
  const lobbyRes = state.hostEngine.openLobby(gameId, state.profile);
  if (!lobbyRes.ok) {
    state.hostApi?.showToast?.(`Could not start game: ${lobbyRes.reason}`);
    return;
  }

  // Auto-gather all current members in the party room
  const members = state.hostApi?.getPartyMembers?.() || [];
  for (const m of members) {
    state.hostEngine.addPlayer(m.id, m.displayName);
  }

  // If at least 2 players, start immediately
  const startRes = state.hostEngine.startGame();
  if (!startRes.ok) {
    state.hostApi?.showToast?.(`Need at least 2 players in room to start.`);
    return;
  }

  state.activeGameState = state.hostEngine.activeGame.getState();
  state.localJoined = true;
  closeMinigamesModal();
  renderHud();
}

function joinPendingGame() {
  if (!state.pendingInvite || !state.channel || !state.profile) return;
  state.localJoined = true;
  state.channel.send({
    type: 'broadcast',
    event: 'minigame',
    payload: {
      type: 'game_action',
      action: 'join_game',
      senderId: state.profile.id,
      gameId: state.pendingInvite.gameId,
      data: { displayName: state.profile.display_name },
      timestamp: Date.now(),
    },
  });
  state.pendingInvite = null;
  closeMinigamesModal();
  renderHud();
}

function declinePendingGame() {
  state.pendingInvite = null;
  closeMinigamesModal();
}

function leaveActiveGame() {
  if (state.isRoomOwner && state.hostEngine) {
    state.hostEngine.endGame();
  } else if (state.channel && state.profile) {
    state.channel.send({
      type: 'broadcast',
      event: 'minigame',
      payload: {
        type: 'game_action',
        action: 'leave_game',
        senderId: state.profile.id,
        timestamp: Date.now(),
      },
    });
  }
  state.activeGameState = null;
  state.localJoined = false;
  state.localRewardsAwarded = false;
  hideHud();
  if (state.hostApi?.stopMusic) {
    state.hostApi.stopMusic();
  }
}

/**
 * Handles incoming Realtime broadcast messages for event 'minigame'.
 */
export function handleMinigameBroadcast(rawPayload) {
  const payload = validateMinigamePayload(rawPayload);
  if (!payload) return;

  // Ignore if user is muted or sender not recognized
  if (payload.senderId && state.hostApi?.isUserMuted?.(payload.senderId)) {
    return;
  }

  if (payload.type === 'game_invite') {
    if (!state.isRoomOwner) {
      state.pendingInvite = {
        hostId: payload.hostId,
        gameId: payload.gameId,
        title: payload.data?.title || MINIGAME_INFO[payload.gameId]?.title || 'Party Game',
      };
      state.hostApi?.showToast?.(`🎮 ${state.pendingInvite.title} started! Open Games to join.`);
      renderModalContent();
    }
    return;
  }

  if (payload.type === 'game_state') {
    // Only trust game_state from the authoritative room owner
    if (!state.isRoomOwner) {
      state.activeGameState = payload.data ? payload.data : rawPayload.state || null;
      if (state.activeGameState) {
        state.localJoined = true;
        renderHud();
        syncClientAudio(state.activeGameState);
        maybeAwardLocalRewards(state.activeGameState);
      } else {
        hideHud();
      }
    }
    return;
  }

  if (payload.type === 'game_action' && state.isRoomOwner && state.hostEngine) {
    const action = payload.action;
    const senderId = payload.senderId;
    if (!senderId) return;

    // Only accept actions from senders currently tracked as party members —
    // Realtime Authorization only confirms the sender is A room member, not
    // that `senderId` is THEIR id (see filter.js), so this bounds spoofed
    // ids to real, currently-connected members rather than arbitrary guests.
    const members = state.hostApi?.getPartyMembers?.() || [];
    if (!members.some((m) => m.id === senderId)) return;

    const throttle = action === 'update_pos' ? posActionThrottle : gameActionThrottle;
    if (!throttle.allow(senderId, Date.now())) return;

    if (action === 'join_game') {
      const name = payload.data?.displayName || 'Guest';
      state.hostEngine.addPlayer(senderId, name);
    } else if (action === 'leave_game') {
      state.hostEngine.removePlayer(senderId);
    } else {
      state.hostEngine.handleAction(senderId, payload);
    }
  }
}

/**
 * Guests never run a MinigameHostEngine, so they'd otherwise never receive
 * the coin rewards the host awards itself in awardGameRewards(). Mirrors the
 * same per-game reward rules locally once a results state is first seen,
 * guarded by localRewardsAwarded so repeated results broadcasts don't
 * double-award.
 */
function maybeAwardLocalRewards(g) {
  if (g.phase !== 'results') {
    state.localRewardsAwarded = false;
    return;
  }
  if (state.localRewardsAwarded) return;
  state.localRewardsAwarded = true;

  const myId = state.profile?.id;
  const save = state.hostApi?.getSaveState?.();
  if (!myId || !save) return;

  let coins = 0;
  if (g.gameId === MINIGAME_IDS.HIDE_SEEK) {
    if (!g.players?.[myId]) return;
    if (g.winner === 'seeker' && g.seekerId === myId) coins = 15;
    else if (g.winner === 'hiders' && myId !== g.seekerId) coins = 10;
  } else if (g.gameId === MINIGAME_IDS.MUSICAL_CHAIRS) {
    if (!(g.players || []).some((p) => p.id === myId)) return;
    if (g.winner === myId) coins = 15;
  } else if (g.gameId === MINIGAME_IDS.TRIVIA) {
    if (!(g.players || []).some((p) => p.id === myId)) return;
    const ranked = [...(g.players || [])].sort((a, b) => (g.scores?.[b.id] || 0) - (g.scores?.[a.id] || 0));
    const rankIdx = ranked.findIndex((p) => p.id === myId);
    coins = rankIdx === 0 ? 15 : rankIdx === 1 ? 10 : rankIdx === 2 ? 6 : 3;
  }

  if (coins > 0) awardMinigameCoins(save, coins);
}

function syncClientAudio(gameState) {
  if (gameState.gameId !== MINIGAME_IDS.MUSICAL_CHAIRS) return;
  const isPlaying = gameState.musicPlaying;
  if (isPlaying !== state.lastMusicState) {
    state.lastMusicState = isPlaying;
    if (isPlaying && gameState.currentTrack) {
      state.hostApi?.playMusic?.(gameState.currentTrack);
    } else {
      state.hostApi?.stopMusic?.();
      state.hostApi?.playSfx?.('click');
    }
  }
}

/**
 * Frame-level tick called from main animation loop.
 */
export function tickMinigameUI(now, player) {
  if (state.isRoomOwner && state.hostEngine && state.hostEngine.activeGame) {
    if (!state.lastTickAt) state.lastTickAt = now;
    const dt = (now - state.lastTickAt) / 1000;
    if (dt >= 0.5) {
      state.lastTickAt = now;
      state.hostEngine.tick(dt);
      state.activeGameState = state.hostEngine.activeGame.getState();
      renderHud();

      // Check audio state change on host
      const isPlaying = state.activeGameState.musicPlaying;
      if (isPlaying !== state.lastMusicState) {
        state.lastMusicState = isPlaying;
        if (isPlaying && state.activeGameState.currentTrack) {
          state.hostApi?.playMusic?.(state.activeGameState.currentTrack);
        } else {
          state.hostApi?.stopMusic?.();
          state.hostApi?.playSfx?.('click');
        }
      }
    }

    // Host position sync for tagging
    if (player && state.hostEngine.activeGame) {
      state.hostEngine.activeGame.updatePlayerPosition?.(state.profile.id, player.x, player.y);
    }
  } else if (!state.isRoomOwner && state.activeGameState && player && state.channel && state.profile) {
    // Guest broadcasts position to host for Hide & Seek / Musical Chairs
    if (state.activeGameState.gameId === MINIGAME_IDS.HIDE_SEEK || state.activeGameState.gameId === MINIGAME_IDS.MUSICAL_CHAIRS) {
      state.channel.send({
        type: 'broadcast',
        event: 'minigame',
        payload: {
          type: 'game_action',
          action: 'update_pos',
          senderId: state.profile.id,
          data: { x: player.x, y: player.y },
          timestamp: Date.now(),
        },
      });
    }
  }
}

export function isMinigameActive() {
  return !!(state.activeGameState && state.activeGameState.phase !== 'results');
}

/**
 * Returns entities (such as Musical Chairs) to be rendered by the canvas engine.
 */
export function getMinigameEntities(now) {
  if (!state.activeGameState) return [];
  const g = state.activeGameState;
  const list = [];

  if (g.gameId === MINIGAME_IDS.MUSICAL_CHAIRS && Array.isArray(g.chairs)) {
    for (const c of g.chairs) {
      list.push({
        id: c.id,
        x: c.x,
        y: c.y,
        dir: 'down',
        frame: 0,
        walking: false,
        sitting: false,
        lying: false,
        blink: false,
        breathe: 0,
        spriteKey: 'stool',
        kind: 'furniture_chair',
        nameTag: c.occupiedBy ? '🪑 Seated' : '🪑 Free Chair',
        color: c.occupiedBy ? '#888' : '#ffd54f',
        depth: c.x + c.y,
      });
    }
  }

  return list;
}

function hideHud() {
  const hud = byId('minigameHud');
  if (hud) hud.classList.add('hidden');
}

function renderHud() {
  const hud = byId('minigameHud');
  const content = byId('minigameHudContent');
  const title = byId('minigameHudTitle');
  if (!hud || !content || !state.activeGameState) {
    if (hud) hud.classList.add('hidden');
    return;
  }

  hud.classList.remove('hidden');
  const g = state.activeGameState;
  const info = MINIGAME_INFO[g.gameId] || { title: 'Mini-Game', icon: '🎮' };
  title.textContent = `${info.icon} ${info.title}`;

  if (g.gameId === MINIGAME_IDS.HIDE_SEEK) {
    renderHideSeekHud(content, g);
  } else if (g.gameId === MINIGAME_IDS.MUSICAL_CHAIRS) {
    renderMusicalChairsHud(content, g);
  } else if (g.gameId === MINIGAME_IDS.TRIVIA) {
    renderTriviaHud(content, g);
  }
}

function renderHideSeekHud(container, g) {
  const myId = state.profile?.id;
  const isSeeker = g.seekerId === myId;
  const myData = g.players?.[myId];
  const isTagged = myData?.tagged;

  let roleHtml = isSeeker
    ? `<span class="minigame-badge seeker">🔍 You are the SEEKER!</span>`
    : (isTagged
      ? `<span class="minigame-badge tagged">💀 You were TAGGED!</span>`
      : `<span class="minigame-badge hider">🤫 You are a HIDER — Hide!</span>`);

  let statusHtml = '';
  if (g.phase === 'countdown') {
    statusHtml = `
      <div class="minigame-timer-box">
        <div class="minigame-timer-num">${g.countdownRemaining}s</div>
        <div class="minigame-timer-label">Counting down! Hiders, disperse!</div>
      </div>`;
  } else if (g.phase === 'seeking') {
    const taggedCount = Object.values(g.players || {}).filter((p) => !p.isSeeker && p.tagged).length;
    const totalHiders = Object.values(g.players || {}).filter((p) => !p.isSeeker).length;
    statusHtml = `
      <div class="minigame-timer-box">
        <div class="minigame-timer-num">${g.gameRemaining}s</div>
        <div class="minigame-timer-label">Tagged: ${taggedCount} / ${totalHiders}</div>
      </div>`;
  } else if (g.phase === 'results') {
    statusHtml = `
      <div class="minigame-results-banner">
        <b>${escapeHtml(g.summary || 'Game Over!')}</b>
        <p style="margin-top: 4px; font-size: 12px; color: #ffd27a;">🪙 Coins awarded to winners!</p>
      </div>`;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      ${roleHtml}
      ${statusHtml}
    </div>`;
}

function renderMusicalChairsHud(container, g) {
  const myId = state.profile?.id;
  const myPlayer = (g.players || []).find((p) => p.id === myId);
  const isEliminated = myPlayer?.eliminated;
  const isSeated = !!myPlayer?.seatedOn;

  let bannerHtml = '';
  if (g.phase === 'music_playing') {
    bannerHtml = `
      <div class="minigame-music-status playing">
        <span class="anim-pulse">🎶 MUSIC PLAYING! Walk or dance around! 🎶</span>
      </div>`;
  } else if (g.phase === 'music_stopped') {
    bannerHtml = `
      <div class="minigame-music-status stopped">
        <span class="anim-flash">🛑 MUSIC STOPPED! SIT ON A CHAIR! 🛑</span>
      </div>`;
  } else if (g.phase === 'results') {
    bannerHtml = `
      <div class="minigame-results-banner">
        <b>${escapeHtml(g.summary || 'Musical Chairs finished!')}</b>
        <p style="margin-top: 4px; font-size: 12px; color: #ffd27a;">🪙 Winner received coins!</p>
      </div>`;
  }

  // Chair claim quick actions
  let chairsHtml = '';
  if (g.phase === 'music_stopped' && !isEliminated && !isSeated) {
    const freeChairs = (g.chairs || []).filter((c) => !c.occupiedBy);
    chairsHtml = `
      <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-top: 6px;">
        ${freeChairs.map((c) => `
          <button class="pixel-btn btn-claim-chair" data-chair="${c.id}" style="font-size: 11px; padding: 3px 8px; background: #e65100;">
            🪑 Sit (${c.x}, ${c.y})
          </button>
        `).join('')}
      </div>`;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
      <div style="font-size: 12px; color: #ccc;">Round ${g.round} · ${g.chairs?.length || 0} Chairs Available</div>
      ${bannerHtml}
      ${isEliminated ? `<span class="minigame-badge tagged">Eliminated (Spectating)</span>` : (isSeated ? `<span class="minigame-badge seeker">Safe! Seated on chair</span>` : '')}
      ${chairsHtml}
    </div>`;

  container.querySelectorAll('.btn-claim-chair').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chairId = btn.dataset.chair;
      sendChairClaim(chairId);
    });
  });
}

function sendChairClaim(chairId) {
  if (!state.profile) return;
  if (state.isRoomOwner && state.hostEngine) {
    state.hostEngine.handleAction(state.profile.id, {
      action: 'claim_chair',
      data: { chairId },
    });
  } else if (state.channel) {
    state.channel.send({
      type: 'broadcast',
      event: 'minigame',
      payload: {
        type: 'game_action',
        action: 'claim_chair',
        senderId: state.profile.id,
        data: { chairId },
        timestamp: Date.now(),
      },
    });
  }
}

function renderTriviaHud(container, g) {
  const myId = state.profile?.id;
  const myScore = g.scores?.[myId] || 0;
  const curQ = g.question;

  if (g.phase === 'results') {
    const ranked = [...(g.players || [])].sort((a, b) => (g.scores?.[b.id] || 0) - (g.scores?.[a.id] || 0));
    container.innerHTML = `
      <div class="minigame-results-banner">
        <h3 style="margin: 0 0 6px 0; font-size: 16px;">🏆 Final Scoreboard</h3>
        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left; max-height: 120px; overflow-y: auto;">
          ${ranked.map((p, idx) => `
            <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 2px 6px; background: rgba(0,0,0,0.2); border-radius: 4px;">
              <span>${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•'} ${escapeHtml(p.displayName)}</span>
              <b>${g.scores?.[p.id] || 0} pts</b>
            </div>
          `).join('')}
        </div>
        <p style="margin-top: 6px; font-size: 12px; color: #ffd27a;">🪙 Daily trivia coins awarded!</p>
      </div>`;
    return;
  }

  if (!curQ) return;

  const myAnswer = g.answers?.[myId];
  const isReveal = g.phase === 'reveal';

  const optionsHtml = curQ.options.map((opt, idx) => {
    let extraClass = '';
    if (isReveal) {
      if (idx === g.correctAnswer) extraClass = 'correct';
      else if (myAnswer?.answerIndex === idx) extraClass = 'wrong';
    } else if (myAnswer?.answerIndex === idx) {
      extraClass = 'selected';
    }

    return `
      <button class="pixel-btn trivia-opt-btn ${extraClass}" data-ans="${idx}" ${myAnswer !== undefined || isReveal ? 'disabled' : ''}>
        ${String.fromCharCode(65 + idx)}: ${escapeHtml(opt)}
      </button>`;
  }).join('');

  container.innerHTML = `
    <div class="trivia-card">
      <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: #ffd27a; margin-bottom: 4px;">
        <span>Question ${(curQ.qIndex || 0) + 1} of ${curQ.total}</span>
        <span>Score: <b>${myScore} pts</b></span>
        <span>⏱️ ${isReveal ? `Next in ${g.revealTimeRemaining}s` : `${g.timeRemaining}s`}</span>
      </div>
      <div class="trivia-question-text">${escapeHtml(curQ.question)}</div>
      <div class="trivia-options-grid">${optionsHtml}</div>
      ${isReveal && g.fact ? `<div class="trivia-fact">💡 <b>Did you know?</b> ${escapeHtml(g.fact)}</div>` : ''}
    </div>`;

  container.querySelectorAll('.trivia-opt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ansIdx = Number(btn.dataset.ans);
      sendTriviaAnswer(curQ.qIndex, ansIdx);
    });
  });
}

function sendTriviaAnswer(qIndex, answerIndex) {
  if (!state.profile) return;
  if (state.isRoomOwner && state.hostEngine) {
    state.hostEngine.handleAction(state.profile.id, {
      action: 'answer',
      data: { qIndex, answerIndex },
    });
  } else if (state.channel) {
    state.channel.send({
      type: 'broadcast',
      event: 'minigame',
      payload: {
        type: 'game_action',
        action: 'answer',
        senderId: state.profile.id,
        data: { qIndex, answerIndex },
        timestamp: Date.now(),
      },
    });
  }
}
