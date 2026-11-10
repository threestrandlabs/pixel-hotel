// Pixel Hotel v0.8.10 — Arcade Pool ("Rail & Pocket") Modal UI
//
// Centred modal: top-down 8-ball table vs a bot opponent. Pointer events
// drive aim (drag back from the cue ball) + power (drag distance), working
// for both mouse and touch. Renders with Canvas 2D; game rules/physics live
// in pool.js.

import {
  createPoolGame, stepPoolPhysics, takeShot, isAllStopped, cueBall,
  pickBotShot, TABLE_W, TABLE_H, POCKETS,
} from './pool.js';

const MAX_PULL_PX = 110;
const MIN_SHOT_POWER = 0.05;
const BOT_THINK_MS = 650;

let game = null;
let stateRef = null;
let supabaseClientGetter = null;
let toastFn = null;
let difficulty = 'medium';
let rafId = null;
let botTimer = null;

let dragging = false;
let dragStart = null;
let dragPoint = null;

export function initPoolUI({ getState, getClient, showToast }) {
  stateRef = getState;
  supabaseClientGetter = getClient;
  toastFn = showToast || console.log;
  bindPoolDomEvents();
}

export function openPoolGame() {
  const modal = document.getElementById('poolGameModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('poolGameOverOverlay')?.classList.add('hidden');
  startNewGame(difficulty);
  updateStreakDisplay();
  if (!rafId) rafId = requestAnimationFrame(poolLoop);
}

export function closePoolGame() {
  const modal = document.getElementById('poolGameModal');
  if (modal) modal.classList.add('hidden');
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (botTimer) {
    clearTimeout(botTimer);
    botTimer = null;
  }
  dragging = false;
  game = null;
}

export function getActivePoolState() {
  return { isOpen: !document.getElementById('poolGameModal')?.classList.contains('hidden') };
}

function startNewGame(diff) {
  game = createPoolGame({ difficulty: diff, rng: Math.random });
  document.getElementById('poolGameOverOverlay')?.classList.add('hidden');
  updateTurnStatus();
}

function poolLoop() {
  if (!game) return;
  stepPoolPhysics(game);
  renderTable();
  updateTurnStatus();

  if (game.gameOver) {
    handlePoolGameOver(game);
    rafId = requestAnimationFrame(poolLoop);
    return;
  }

  if (game.currentPlayer === 1 && isAllStopped(game) && !game.shotInProgress && !botTimer) {
    botTimer = setTimeout(() => {
      botTimer = null;
      if (!game || game.gameOver) return;
      const { angle, power } = pickBotShot(game, game.difficulty, Math.random);
      takeShot(game, angle, power);
    }, BOT_THINK_MS);
  }

  rafId = requestAnimationFrame(poolLoop);
}

let lastResultWasWin = null;

function handlePoolGameOver(g) {
  if (lastResultWasWin !== null) return; // already handled this game-over
  const state = stateRef ? stateRef() : null;
  const won = g.winner === 0;
  lastResultWasWin = won;

  if (state) {
    if (!state.pool) state.pool = { wins: 0, losses: 0, currentStreak: 0, bestStreak: 0 };
    if (won) {
      state.pool.wins = (state.pool.wins || 0) + 1;
      state.pool.currentStreak = (state.pool.currentStreak || 0) + 1;
      state.pool.bestStreak = Math.max(state.pool.bestStreak || 0, state.pool.currentStreak);
    } else {
      state.pool.losses = (state.pool.losses || 0) + 1;
      state.pool.currentStreak = 0;
    }
  }
  updateStreakDisplay();

  if (typeof supabaseClientGetter === 'function') {
    Promise.resolve(supabaseClientGetter()).then((client) => {
      if (client && typeof client.rpc === 'function') {
        client.rpc('submit_pool_result', { p_won: won }).catch(() => {});
      }
    }).catch(() => {});
  }

  const overlay = document.getElementById('poolGameOverOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    const title = document.getElementById('poolResultTitle');
    const text = document.getElementById('poolResultText');
    if (title) title.textContent = won ? '🎉 You Win!' : '😔 You Lose';
    if (text) {
      const reasonText = {
        eight_ball_early: won ? 'Bot sank the 8-ball too early.' : 'You sank the 8-ball before clearing your group.',
        eight_ball_scratch: won ? 'Bot scratched on the 8-ball.' : 'You scratched on the 8-ball.',
        eight_ball_legal: won ? 'You cleared your group and sank the 8-ball!' : 'Bot cleared their group and sank the 8-ball.',
      }[g.reason] || '';
      text.textContent = reasonText;
    }
  }
}

function updateStreakDisplay() {
  const state = stateRef ? stateRef() : null;
  const el = document.getElementById('poolStreakStatus');
  if (el && state?.pool) {
    el.textContent = `🔥 Streak: ${state.pool.currentStreak || 0} · 🏆 Wins: ${state.pool.wins || 0}`;
  }
}

function updateTurnStatus() {
  const el = document.getElementById('poolTurnStatus');
  if (!el || !game) return;
  if (game.gameOver) {
    el.textContent = game.winner === 0 ? 'You won the rack!' : 'The bot won the rack.';
    return;
  }
  const groupLabel = (g) => (g === 'solid' ? 'Solids' : g === 'stripe' ? 'Stripes' : 'Open table');
  if (game.currentPlayer === 0) {
    el.textContent = `Your turn — ${groupLabel(game.playerGroups[0])}`;
  } else {
    el.textContent = `Bot's turn (${game.difficulty}) — ${groupLabel(game.playerGroups[1])}`;
  }
}

// -----------------------------------------------------------------------------
// Pointer input: drag back from the cue ball to aim, release to shoot.
// -----------------------------------------------------------------------------

function canvasPoint(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

function canShoot() {
  return game && !game.gameOver && game.currentPlayer === 0 && isAllStopped(game) && !game.shotInProgress;
}

function onPointerDown(evt) {
  const canvas = evt.currentTarget;
  if (!canShoot()) return;
  evt.preventDefault();
  dragging = true;
  dragStart = canvasPoint(canvas, evt);
  dragPoint = dragStart;
  canvas.setPointerCapture?.(evt.pointerId);
}

function onPointerMove(evt) {
  if (!dragging) return;
  evt.preventDefault();
  dragPoint = canvasPoint(evt.currentTarget, evt);
}

function onPointerUp(evt) {
  if (!dragging) return;
  evt.preventDefault();
  dragging = false;
  const cue = cueBall(game);
  const pull = { x: dragPoint.x - cue.x, y: dragPoint.y - cue.y };
  const dist = Math.hypot(pull.x, pull.y);
  const power = Math.min(1, dist / MAX_PULL_PX);
  if (power >= MIN_SHOT_POWER && cue) {
    const angle = Math.atan2(cue.y - dragPoint.y, cue.x - dragPoint.x);
    takeShot(game, angle, power);
  }
  dragPoint = null;
}

// -----------------------------------------------------------------------------
// Canvas rendering
// -----------------------------------------------------------------------------

function renderTable() {
  const canvas = document.getElementById('poolCanvas');
  if (!canvas || !game) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, TABLE_W, TABLE_H);

  // Rail
  ctx.fillStyle = '#4a2c18';
  ctx.fillRect(0, 0, TABLE_W, TABLE_H);
  // Felt
  ctx.fillStyle = '#146b3a';
  ctx.fillRect(6, 6, TABLE_W - 12, TABLE_H - 12);

  // Pockets
  ctx.fillStyle = '#0a0a0a';
  for (const p of POCKETS) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Aim guide while dragging
  if (dragging && dragPoint) {
    const cue = cueBall(game);
    const pull = { x: dragPoint.x - cue.x, y: dragPoint.y - cue.y };
    const dist = Math.hypot(pull.x, pull.y);
    const power = Math.min(1, dist / MAX_PULL_PX);
    const dirX = -pull.x / (dist || 1);
    const dirY = -pull.y / (dist || 1);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + power * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(cue.x + dirX * 60, cue.y + dirY * 60);
    ctx.stroke();
    // Cue stick pulled back behind the ball
    ctx.strokeStyle = '#d2a35c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cue.x - dirX * (10 + dist), cue.y - dirY * (10 + dist));
    ctx.lineTo(cue.x - dirX * 12, cue.y - dirY * 12);
    ctx.stroke();
  }

  // Balls
  for (const b of game.balls) {
    if (b.pocketed) continue;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    if (b.group === 'stripe') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(b.x - b.r, b.y - 1.3, b.r * 2, 2.6);
    }
    if (b.number > 0) {
      ctx.fillStyle = b.number === 8 ? '#ffffff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.fillStyle = '#141414';
      ctx.font = '4px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.number), b.x, b.y + 0.3);
    }
  }
}

function bindPoolDomEvents() {
  document.getElementById('btnPoolClose')?.addEventListener('click', closePoolGame);
  document.getElementById('btnPoolPlayAgain')?.addEventListener('click', () => {
    lastResultWasWin = null;
    startNewGame(difficulty);
  });
  document.getElementById('btnPoolNewGame')?.addEventListener('click', () => {
    lastResultWasWin = null;
    startNewGame(difficulty);
  });

  document.querySelectorAll('[data-pool-difficulty]').forEach((btn) => {
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.poolDifficulty;
      document.querySelectorAll('[data-pool-difficulty]').forEach((b) => b.classList.toggle('active', b === btn));
      lastResultWasWin = null;
      startNewGame(difficulty);
    });
  });

  const canvas = document.getElementById('poolCanvas');
  if (canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }
}

export function __resetForTests() {
  resetRack(game || createPoolGame({}));
}
