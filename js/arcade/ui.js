// Pixel Hotel v0.8.7 — Arcade Modal UI, Game Loop & Canvas Renderer
//
// Manages the centered arcade modal, keyboard inputs, rendering loops for all 3
// games, game over score submission to Supabase, daily coin rewards, and the
// Hall of Fame Leaderboard modal.

import {
  createSnakeGame, stepSnakeGame, setSnakeDirection,
  createBrickBashGame, stepBrickBashGame, movePaddle,
  createBlockDropGame, stepBlockDropGame, moveBlockDrop,
} from './games.js';

import {
  VALID_GAMES, GAME_TITLES, ARCADE_DAILY_COIN_CAP,
  awardDailyArcadeCoins, recordLocalScore, getLocalLeaderboard,
  submitScoreToSupabase, fetchGlobalLeaderboard,
} from './leaderboard.js';

let activeGame = null;
let activeGameId = null;
let gameLoopId = null;
let lastTickTime = 0;
let keyState = {};
let stateRef = null;
let supabaseClientGetter = null;
let toastFn = null;

let currentLeaderboardGame = 'noodle_snake';
let currentLeaderboardScope = 'local'; // 'local' | 'global' | 'mine'

export function initArcadeUI({ getState, getClient, showToast }) {
  stateRef = getState;
  supabaseClientGetter = getClient;
  toastFn = showToast || console.log;

  bindArcadeDomEvents();
}

export function openArcadeGame(gameId = 'noodle_snake') {
  if (!VALID_GAMES.includes(gameId)) return;
  activeGameId = gameId;

  const modal = document.getElementById('arcadeGameModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const titleEl = document.getElementById('arcadeGameTitle');
  if (titleEl) titleEl.textContent = `🕹️ ${GAME_TITLES[gameId]}`;

  const scoreEl = document.getElementById('arcadeScore');
  if (scoreEl) scoreEl.textContent = '0';

  updateDailyCoinsDisplay();

  const gameOverOverlay = document.getElementById('arcadeGameOverOverlay');
  if (gameOverOverlay) gameOverOverlay.classList.add('hidden');

  // Initialize new game instance
  if (gameId === 'noodle_snake') {
    activeGame = createSnakeGame({ width: 16, height: 16 });
  } else if (gameId === 'brick_bash') {
    activeGame = createBrickBashGame({ width: 320, height: 320 });
  } else if (gameId === 'block_drop') {
    activeGame = createBlockDropGame({ cols: 10, rows: 18 });
  }

  updateTouchControlsVisibility(gameId);

  keyState = {};
  lastTickTime = performance.now();

  window.removeEventListener('keydown', onArcadeKeyDown);
  window.removeEventListener('keyup', onArcadeKeyUp);
  window.addEventListener('keydown', onArcadeKeyDown);
  window.addEventListener('keyup', onArcadeKeyUp);

  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(arcadeGameLoop);
}

export function closeArcadeGame() {
  if (gameLoopId) {
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
  }
  window.removeEventListener('keydown', onArcadeKeyDown);
  window.removeEventListener('keyup', onArcadeKeyUp);
  keyState = {};

  const modal = document.getElementById('arcadeGameModal');
  if (modal) modal.classList.add('hidden');
  activeGame = null;
  activeGameId = null;
}

export function openArcadeLeaderboard(gameId = 'noodle_snake', scope = 'local') {
  currentLeaderboardGame = VALID_GAMES.includes(gameId) ? gameId : 'noodle_snake';
  currentLeaderboardScope = scope;

  const modal = document.getElementById('arcadeLeaderboardModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  renderLeaderboardTabs();
  loadAndRenderLeaderboard();
}

export function closeArcadeLeaderboard() {
  const modal = document.getElementById('arcadeLeaderboardModal');
  if (modal) modal.classList.add('hidden');
}

export function getActiveArcadeState() {
  return {
    gameId: activeGameId,
    game: activeGame,
    isOpen: !document.getElementById('arcadeGameModal')?.classList.contains('hidden'),
    leaderboardOpen: !document.getElementById('arcadeLeaderboardModal')?.classList.contains('hidden'),
  };
}

// -----------------------------------------------------------------------------
// Input Handling
// -----------------------------------------------------------------------------

function onArcadeKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeArcadeGame();
    return;
  }

  // Prevent default scroll actions during arcade play
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }

  keyState[e.key.toLowerCase()] = true;
  keyState[e.code] = true;

  if (!activeGame || activeGame.gameOver) return;

  if (activeGameId === 'noodle_snake') {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') setSnakeDirection(activeGame, 'up');
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') setSnakeDirection(activeGame, 'down');
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setSnakeDirection(activeGame, 'left');
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setSnakeDirection(activeGame, 'right');
  } else if (activeGameId === 'block_drop') {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') moveBlockDrop(activeGame, 'left');
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') moveBlockDrop(activeGame, 'right');
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'x' || e.key === 'X') moveBlockDrop(activeGame, 'rotate');
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') moveBlockDrop(activeGame, 'down');
    else if (e.key === ' ') moveBlockDrop(activeGame, 'drop');
  }
}

function onArcadeKeyUp(e) {
  keyState[e.key.toLowerCase()] = false;
  keyState[e.code] = false;
}

// -----------------------------------------------------------------------------
// Game Loop & Step Timing
// -----------------------------------------------------------------------------

function arcadeGameLoop(now) {
  if (!activeGame) return;

  const dt = now - lastTickTime;

  if (activeGameId === 'brick_bash' && !activeGame.gameOver) {
    if (keyState['arrowleft'] || keyState['a']) movePaddle(activeGame, 'left');
    if (keyState['arrowright'] || keyState['d']) movePaddle(activeGame, 'right');
    stepBrickBashGame(activeGame);
  } else if (activeGameId === 'noodle_snake' && !activeGame.gameOver) {
    const tickInterval = 130;
    if (dt >= tickInterval) {
      stepSnakeGame(activeGame);
      lastTickTime = now;
    }
  } else if (activeGameId === 'block_drop' && !activeGame.gameOver) {
    const tickInterval = Math.max(160, 420 - activeGame.linesCleared * 20);
    if (dt >= tickInterval) {
      stepBlockDropGame(activeGame);
      lastTickTime = now;
    }
  }

  // Update Score in DOM
  const scoreEl = document.getElementById('arcadeScore');
  if (scoreEl) scoreEl.textContent = String(activeGame.score || 0);

  // Render to canvas
  const canvas = document.getElementById('arcadeCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    renderGame(ctx, activeGameId, activeGame);
  }

  // Check Game Over transition
  if (activeGame.gameOver) {
    handleGameOver(activeGame);
    return;
  }

  gameLoopId = requestAnimationFrame(arcadeGameLoop);
}

function handleGameOver(game) {
  if (gameLoopId) {
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
  }

  const state = stateRef ? stateRef() : null;
  const score = game.score || 0;

  let rewardInfo = { awarded: 0, dailyTotal: 0, dailyCap: ARCADE_DAILY_COIN_CAP };
  let localRank = null;

  if (state) {
    rewardInfo = awardDailyArcadeCoins(state, score, game.gameId);
    const localRes = recordLocalScore(state, game.gameId, score, 'Player');
    localRank = localRes.rank;
  }

  updateDailyCoinsDisplay();

  // Try background submit to Supabase (fire and forget, degrades gracefully)
  if (typeof supabaseClientGetter === 'function') {
    Promise.resolve(supabaseClientGetter()).then((client) => {
      if (client) submitScoreToSupabase(client, game.gameId, score).catch(() => {});
    }).catch(() => {});
  }

  // Show Game Over overlay inside modal
  const overlay = document.getElementById('arcadeGameOverOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    const finalScoreEl = document.getElementById('arcadeFinalScore');
    if (finalScoreEl) finalScoreEl.textContent = String(score);

    const rewardEl = document.getElementById('arcadeRewardText');
    if (rewardEl) {
      if (rewardInfo.awarded > 0) {
        rewardEl.innerHTML = `🪙 +${rewardInfo.awarded} Coins! (Today: ${rewardInfo.dailyTotal}/${rewardInfo.dailyCap})`;
      } else if (rewardInfo.cappedOut) {
        rewardEl.innerHTML = `Daily coin cap reached (${rewardInfo.dailyCap}/${rewardInfo.dailyCap})`;
      } else {
        rewardEl.innerHTML = `Score higher to earn hotel coins!`;
      }
    }
  }
}

function updateDailyCoinsDisplay() {
  const state = stateRef ? stateRef() : null;
  const dailyEl = document.getElementById('arcadeDailyCoins');
  if (dailyEl && state?.arcade) {
    const count = state.arcade.dailyCoins || 0;
    dailyEl.textContent = `${count}/${ARCADE_DAILY_COIN_CAP}`;
  }
}

// -----------------------------------------------------------------------------
// Canvas Renderers
// -----------------------------------------------------------------------------

function renderGame(ctx, gameId, game) {
  ctx.save();
  ctx.clearRect(0, 0, 320, 320);

  if (gameId === 'noodle_snake') {
    renderSnake(ctx, game);
  } else if (gameId === 'brick_bash') {
    renderBrickBash(ctx, game);
  } else if (gameId === 'block_drop') {
    renderBlockDrop(ctx, game);
  }

  ctx.restore();
}

function renderSnake(ctx, game) {
  const tileSize = 320 / game.width;

  // Background grid
  ctx.fillStyle = '#121824';
  ctx.fillRect(0, 0, 320, 320);

  ctx.strokeStyle = '#1a2434';
  ctx.lineWidth = 1;
  for (let i = 0; i <= game.width; i++) {
    ctx.beginPath();
    ctx.moveTo(i * tileSize, 0);
    ctx.lineTo(i * tileSize, 320);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * tileSize);
    ctx.lineTo(320, i * tileSize);
    ctx.stroke();
  }

  // Food (golden ramen bowl or dumpling)
  const fx = game.food.x * tileSize;
  const fy = game.food.y * tileSize;
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.arc(fx + tileSize / 2, fy + tileSize / 2, tileSize * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff9c4';
  ctx.beginPath();
  ctx.arc(fx + tileSize / 2, fy + tileSize / 2, tileSize * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Snake body
  game.snake.forEach((seg, idx) => {
    const sx = seg.x * tileSize;
    const sy = seg.y * tileSize;
    if (idx === 0) {
      // Head
      ctx.fillStyle = '#00e676';
      ctx.fillRect(sx + 1, sy + 1, tileSize - 2, tileSize - 2);
      ctx.fillStyle = '#0a2214';
      ctx.fillRect(sx + tileSize * 0.25, sy + tileSize * 0.25, tileSize * 0.2, tileSize * 0.2);
      ctx.fillRect(sx + tileSize * 0.55, sy + tileSize * 0.25, tileSize * 0.2, tileSize * 0.2);
    } else {
      ctx.fillStyle = idx % 2 === 0 ? '#69f0ae' : '#00c853';
      ctx.fillRect(sx + 2, sy + 2, tileSize - 4, tileSize - 4);
    }
  });
}

function renderBrickBash(ctx, game) {
  // Background
  ctx.fillStyle = '#0e121a';
  ctx.fillRect(0, 0, game.width, game.height);

  // Bricks
  game.bricks.forEach((b) => {
    if (!b.alive) return;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(b.x, b.y, b.w, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
  });

  // Paddle
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(game.paddle.x, game.paddle.y, game.paddle.w, game.paddle.h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(game.paddle.x + 2, game.paddle.y + 1, game.paddle.w - 4, 2);

  // Ball
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
  ctx.fill();

  // Lives indicator
  ctx.fillStyle = '#ff1744';
  for (let i = 0; i < game.lives; i++) {
    ctx.fillRect(12 + i * 14, 12, 8, 8);
  }
}

function renderBlockDrop(ctx, game) {
  const blockSize = Math.floor(320 / game.rows);
  const matrixW = game.cols * blockSize;
  const offsetX = Math.floor((320 - matrixW) / 2);

  // Background
  ctx.fillStyle = '#0d111a';
  ctx.fillRect(0, 0, 320, 320);

  // Matrix border & background
  ctx.fillStyle = '#141a26';
  ctx.fillRect(offsetX, 0, matrixW, 320);

  // Grid lines
  ctx.strokeStyle = '#1b2334';
  ctx.lineWidth = 1;
  for (let c = 0; c <= game.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + c * blockSize, 0);
    ctx.lineTo(offsetX + c * blockSize, 320);
    ctx.stroke();
  }

  // Settled blocks
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const color = game.matrix[r][c];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(offsetX + c * blockSize + 1, r * blockSize + 1, blockSize - 2, blockSize - 2);
      }
    }
  }

  // Active falling piece
  if (game.currentPiece) {
    const { shape, color, x, y } = game.currentPiece;
    ctx.fillStyle = color;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const bx = offsetX + (x + c) * blockSize;
          const by = (y + r) * blockSize;
          ctx.fillRect(bx + 1, by + 1, blockSize - 2, blockSize - 2);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Leaderboard Modal
// -----------------------------------------------------------------------------

function renderLeaderboardTabs() {
  document.querySelectorAll('[data-arcade-game]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.arcadeGame === currentLeaderboardGame);
  });
  document.querySelectorAll('[data-leaderboard-scope]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.leaderboardScope === currentLeaderboardScope);
  });
}

async function loadAndRenderLeaderboard() {
  const listEl = document.getElementById('arcadeLeaderboardRows');
  const statusEl = document.getElementById('arcadeLeaderboardStatus');
  if (!listEl) return;

  listEl.innerHTML = '<div style="text-align:center; padding: 20px; color:#a09cb8;">Loading scores...</div>';

  const state = stateRef ? stateRef() : null;
  let rows = [];
  let isGlobal = false;

  if (currentLeaderboardScope === 'global' || currentLeaderboardScope === 'mine') {
    let client = null;
    if (typeof supabaseClientGetter === 'function') {
      try {
        client = await supabaseClientGetter();
      } catch (e) {
        client = null;
      }
    }

    if (client) {
      const data = await fetchGlobalLeaderboard(client, currentLeaderboardGame, {
        mineOnly: currentLeaderboardScope === 'mine',
        limit: 10,
      });
      if (data && Array.isArray(data)) {
        rows = data;
        isGlobal = true;
      }
    }
  }

  if (!isGlobal) {
    // Local fallback
    rows = getLocalLeaderboard(state, currentLeaderboardGame);
    if (statusEl) {
      statusEl.textContent = currentLeaderboardScope === 'local'
        ? 'Offline Local Top 10'
        : 'Supabase offline — showing Local Top 10';
    }
  } else if (statusEl) {
    statusEl.textContent = currentLeaderboardScope === 'mine' ? 'My Online Scores' : 'Supabase Global Top 10';
  }

  if (rows.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding: 20px; color:#a09cb8;">No scores recorded yet!</div>';
    return;
  }

  let html = '';
  rows.forEach((r, idx) => {
    const rank = idx + 1;
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const name = r.display_name || r.displayName || 'Guest';
    const score = r.score || 0;
    const dateStr = (r.created_at || r.date || '').slice(0, 10);

    html += `
      <div class="leaderboard-row" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="display:flex; align-items:center; gap: 8px;">
          <span style="font-weight:bold; min-width: 26px;">${rankIcon}</span>
          <span style="color:#ffd27a;">${escapeText(name)}</span>
        </div>
        <div style="display:flex; gap: 14px; align-items:center;">
          <span style="font-weight:bold; color:#00e5ff;">${score.toLocaleString()}</span>
          <span style="font-size:11px; color:#888;">${dateStr}</span>
        </div>
      </div>
    `;
  });
  listEl.innerHTML = html;
}

function escapeText(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

let paddleHoldInterval = null;

function updateTouchControlsVisibility(gameId) {
  const upBtn = document.getElementById('arcadeUp');
  const downBtn = document.getElementById('arcadeDown');
  const leftBtn = document.getElementById('arcadeLeft');
  const rightBtn = document.getElementById('arcadeRight');
  const actBtns = document.getElementById('arcadeActionButtons');

  if (gameId === 'noodle_snake') {
    if (upBtn) upBtn.style.visibility = 'visible';
    if (downBtn) downBtn.style.visibility = 'visible';
    if (leftBtn) leftBtn.style.visibility = 'visible';
    if (rightBtn) rightBtn.style.visibility = 'visible';
    if (actBtns) actBtns.style.display = 'none';
  } else if (gameId === 'block_drop') {
    if (upBtn) upBtn.style.visibility = 'hidden';
    if (downBtn) downBtn.style.visibility = 'visible';
    if (leftBtn) leftBtn.style.visibility = 'visible';
    if (rightBtn) rightBtn.style.visibility = 'visible';
    if (actBtns) actBtns.style.display = 'flex';
  } else if (gameId === 'brick_bash') {
    if (upBtn) upBtn.style.visibility = 'hidden';
    if (downBtn) downBtn.style.visibility = 'hidden';
    if (leftBtn) leftBtn.style.visibility = 'visible';
    if (rightBtn) rightBtn.style.visibility = 'visible';
    if (actBtns) actBtns.style.display = 'none';
  }
}

function handleArcadeAction(action) {
  if (!activeGame || activeGame.gameOver) return;

  if (activeGameId === 'noodle_snake') {
    if (['up', 'down', 'left', 'right'].includes(action)) {
      setSnakeDirection(activeGame, action);
    }
  } else if (activeGameId === 'block_drop') {
    if (['left', 'right', 'down', 'rotate', 'drop'].includes(action)) {
      moveBlockDrop(activeGame, action);
    }
  } else if (activeGameId === 'brick_bash') {
    if (action === 'left' || action === 'right') {
      movePaddle(activeGame, action);
    }
  }
}

function startPaddleHold(dir) {
  if (paddleHoldInterval) clearInterval(paddleHoldInterval);
  handleArcadeAction(dir);
  paddleHoldInterval = setInterval(() => {
    if (activeGame && !activeGame.gameOver && activeGameId === 'brick_bash') {
      movePaddle(activeGame, dir);
    }
  }, 40);
}

function stopPaddleHold() {
  if (paddleHoldInterval) {
    clearInterval(paddleHoldInterval);
    paddleHoldInterval = null;
  }
}

function bindArcadeCanvasTouch() {
  const canvas = document.getElementById('arcadeCanvas');
  if (!canvas) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchMoved = false;

  canvas.addEventListener('touchstart', (e) => {
    if (!activeGame || activeGame.gameOver) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = performance.now();
    touchMoved = false;

    if (activeGameId === 'brick_bash') {
      const rect = canvas.getBoundingClientRect();
      const scale = activeGame.width / rect.width;
      const targetX = (touch.clientX - rect.left) * scale;
      activeGame.paddle.x = Math.max(0, Math.min(activeGame.width - activeGame.paddle.w, targetX - activeGame.paddle.w / 2));
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (!activeGame || activeGame.gameOver) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) touchMoved = true;

    if (activeGameId === 'brick_bash') {
      const rect = canvas.getBoundingClientRect();
      const scale = activeGame.width / rect.width;
      const targetX = (touch.clientX - rect.left) * scale;
      activeGame.paddle.x = Math.max(0, Math.min(activeGame.width - activeGame.paddle.w, targetX - activeGame.paddle.w / 2));
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    if (!activeGame || activeGame.gameOver) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const elapsed = performance.now() - touchStartTime;

    if (activeGameId === 'noodle_snake') {
      if (absDx > 20 || absDy > 20) {
        if (absDx > absDy) {
          setSnakeDirection(activeGame, dx > 0 ? 'right' : 'left');
        } else {
          setSnakeDirection(activeGame, dy > 0 ? 'down' : 'up');
        }
      }
    } else if (activeGameId === 'block_drop') {
      if (absDx > 25 && absDx > absDy) {
        moveBlockDrop(activeGame, dx > 0 ? 'right' : 'left');
      } else if (dy > 30 && absDy > absDx) {
        moveBlockDrop(activeGame, elapsed < 220 && dy > 60 ? 'drop' : 'down');
      } else if (dy < -25 && absDy > absDx) {
        moveBlockDrop(activeGame, 'rotate');
      } else if (!touchMoved) {
        moveBlockDrop(activeGame, 'rotate');
      }
    } else if (activeGameId === 'brick_bash') {
      if (!touchMoved) {
        const rect = canvas.getBoundingClientRect();
        const tapX = touch.clientX - rect.left;
        if (tapX < rect.width * 0.45) movePaddle(activeGame, 'left');
        else if (tapX > rect.width * 0.55) movePaddle(activeGame, 'right');
      }
    }
  }, { passive: false });
}

function bindArcadeDomEvents() {
  document.getElementById('btnArcadeClose')?.addEventListener('click', closeArcadeGame);
  document.getElementById('btnArcadePlayAgain')?.addEventListener('click', () => {
    if (activeGameId) openArcadeGame(activeGameId);
  });
  document.getElementById('btnArcadeOpenLeaderboard')?.addEventListener('click', () => {
    openArcadeLeaderboard(activeGameId || 'noodle_snake', 'local');
  });

  document.getElementById('btnLeaderboardClose')?.addEventListener('click', closeArcadeLeaderboard);

  // D-pad touch buttons
  const dpadButtons = [
    { id: 'arcadeUp', action: 'up' },
    { id: 'arcadeDown', action: 'down' },
    { id: 'arcadeLeft', action: 'left' },
    { id: 'arcadeRight', action: 'right' },
    { id: 'arcadeRotate', action: 'rotate' },
    { id: 'arcadeDrop', action: 'drop' },
  ];

  dpadButtons.forEach(({ id, action }) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    let lastHandled = 0;
    const trigger = (e) => {
      e.preventDefault();
      if (Date.now() - lastHandled < 60) return;
      lastHandled = Date.now();
      if (activeGameId === 'brick_bash' && (action === 'left' || action === 'right')) {
        startPaddleHold(action);
      } else {
        handleArcadeAction(action);
      }
    };

    btn.addEventListener('pointerdown', trigger);
    btn.addEventListener('click', trigger);

    if (action === 'left' || action === 'right') {
      btn.addEventListener('pointerup', stopPaddleHold);
      btn.addEventListener('pointercancel', stopPaddleHold);
      btn.addEventListener('pointerleave', stopPaddleHold);
    }
  });

  bindArcadeCanvasTouch();

  document.querySelectorAll('[data-arcade-game]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentLeaderboardGame = btn.dataset.arcadeGame;
      renderLeaderboardTabs();
      loadAndRenderLeaderboard();
    });
  });

  document.querySelectorAll('[data-leaderboard-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentLeaderboardScope = btn.dataset.leaderboardScope;
      renderLeaderboardTabs();
      loadAndRenderLeaderboard();
    });
  });
}
