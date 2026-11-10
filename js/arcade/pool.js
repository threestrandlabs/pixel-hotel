// Pixel Hotel v0.8.10 — Arcade Pool ("Rail & Pocket") Physics + 8-Ball Rules Core
//
// Standalone, deterministic 2D billiard engine: cushions, pockets, friction,
// elastic ball-ball collisions, and a simplified 8-ball rule set (solids vs
// stripes, scratch fouls, early/legal 8-ball win/loss). Headless-testable;
// rendering lives in pool-ui.js.

export const TABLE_W = 300;
export const TABLE_H = 150;
export const BALL_R = 4.5;
export const POCKET_R = 9;
export const FRICTION = 0.988;
export const STOP_EPS = 0.05;
export const MAX_SHOT_SPEED = 9.5;

export const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_W / 2, y: -1.5 },
  { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H },
  { x: TABLE_W / 2, y: TABLE_H + 1.5 },
  { x: TABLE_W, y: TABLE_H },
];

export const HEAD_SPOT = { x: TABLE_W * 0.25, y: TABLE_H / 2 };
export const FOOT_SPOT = { x: TABLE_W * 0.7, y: TABLE_H / 2 };

export const DIFFICULTY_NOISE = { easy: 0.42, medium: 0.2, hard: 0.07 };
export const DIFFICULTY_POWER_NOISE = { easy: 0.3, medium: 0.16, hard: 0.08 };

function groupForNumber(n) {
  if (n === 8) return 'eight';
  if (n === 0) return 'cue';
  return n <= 7 ? 'solid' : 'stripe';
}

const BALL_COLORS = {
  1: '#ffd600', 2: '#2962ff', 3: '#d50000', 4: '#6a1b9a', 5: '#ff6d00',
  6: '#2e7d32', 7: '#6d4c41', 8: '#141414',
  9: '#ffd600', 10: '#2962ff', 11: '#d50000', 12: '#6a1b9a', 13: '#ff6d00',
  14: '#2e7d32', 15: '#6d4c41',
};

/**
 * Builds the standard 5-row triangle rack, apex at FOOT_SPOT, extending away
 * from the head spot. Ball 8 is fixed at the center of the 3rd row; the
 * remaining 14 numbers (7 solid + 7 stripe) are shuffled into the other slots.
 */
function buildRack(rng) {
  const positions = [];
  for (let row = 0; row < 5; row++) {
    const n = row + 1;
    const rowX = FOOT_SPOT.x + row * BALL_R * 2 * 0.866;
    for (let j = 0; j < n; j++) {
      const offset = (j - (n - 1) / 2) * (BALL_R * 2);
      positions.push({ x: rowX, y: FOOT_SPOT.y + offset, row, slot: j });
    }
  }
  // Center slot of row 2 (0-indexed) is the 8-ball's fixed spot.
  const eightIdx = positions.findIndex((p) => p.row === 2 && p.slot === 1);
  const others = positions.filter((_, i) => i !== eightIdx);
  const numbers = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  const balls = [{
    number: 0, group: 'cue', x: HEAD_SPOT.x, y: HEAD_SPOT.y, vx: 0, vy: 0,
    r: BALL_R, pocketed: false, color: '#f5f5f5',
  }];
  balls.push({
    number: 8, group: 'eight', x: positions[eightIdx].x, y: positions[eightIdx].y,
    vx: 0, vy: 0, r: BALL_R, pocketed: false, color: BALL_COLORS[8],
  });
  others.forEach((pos, i) => {
    const num = numbers[i];
    balls.push({
      number: num, group: groupForNumber(num), x: pos.x, y: pos.y, vx: 0, vy: 0,
      r: BALL_R, pocketed: false, color: BALL_COLORS[num],
    });
  });
  return balls;
}

export function createPoolGame({ difficulty = 'medium', rng = Math.random } = {}) {
  return {
    gameId: 'pool',
    difficulty,
    balls: buildRack(rng),
    currentPlayer: 0, // 0 = human, 1 = bot
    playerGroups: { 0: null, 1: null },
    tableOpen: true,
    shotInProgress: false,
    shotLog: null,
    firstShot: true,
    gameOver: false,
    winner: null,
    reason: null,
    foulLog: null,
  };
}

function activeBalls(game) {
  return game.balls.filter((b) => !b.pocketed);
}

export function cueBall(game) {
  return game.balls.find((b) => b.number === 0);
}

export function isAllStopped(game) {
  return activeBalls(game).every((b) => Math.abs(b.vx) < STOP_EPS && Math.abs(b.vy) < STOP_EPS);
}

function clampStop(b) {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < STOP_EPS) {
    b.vx = 0;
    b.vy = 0;
  }
}

function resolvePockets(game) {
  for (const b of activeBalls(game)) {
    for (const p of POCKETS) {
      if (Math.hypot(b.x - p.x, b.y - p.y) <= POCKET_R) {
        b.pocketed = true;
        b.vx = 0;
        b.vy = 0;
        if (game.shotLog) game.shotLog.potted.push(b.number);
        break;
      }
    }
  }
}

function resolveCushions(game) {
  for (const b of activeBalls(game)) {
    if (b.x - b.r < 0) {
      b.x = b.r;
      b.vx = Math.abs(b.vx);
    } else if (b.x + b.r > TABLE_W) {
      b.x = TABLE_W - b.r;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y - b.r < 0) {
      b.y = b.r;
      b.vy = Math.abs(b.vy);
    } else if (b.y + b.r > TABLE_H) {
      b.y = TABLE_H - b.r;
      b.vy = -Math.abs(b.vy);
    }
  }
}

function resolveBallCollisions(game) {
  const balls = activeBalls(game);
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.r + b.r;
      if (dist > 0 && dist < minDist) {
        // Separate overlap along the line of centers.
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;

        // Equal-mass elastic collision: swap velocity components along normal.
        const relVx = a.vx - b.vx;
        const relVy = a.vy - b.vy;
        const relDot = relVx * nx + relVy * ny;
        if (relDot > 0) {
          a.vx -= relDot * nx;
          a.vy -= relDot * ny;
          b.vx += relDot * nx;
          b.vy += relDot * ny;
          if (game.shotLog && game.shotLog.firstContact === null) {
            const cueInvolved = a.number === 0 || b.number === 0;
            if (cueInvolved) {
              const other = a.number === 0 ? b : a;
              game.shotLog.firstContact = other.number;
            }
          }
        }
      }
    }
  }
}

function applyFriction(game) {
  for (const b of activeBalls(game)) {
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    clampStop(b);
  }
}

/** Re-spots a pocketed cue ball at the head spot (or nearest free tile). */
function respotCueBall(game) {
  const cue = cueBall(game);
  cue.pocketed = false;
  cue.vx = 0;
  cue.vy = 0;
  let spot = { ...HEAD_SPOT };
  const occupied = (pos) => game.balls.some((b) => !b.pocketed && b.number !== 0 && Math.hypot(b.x - pos.x, b.y - pos.y) < BALL_R * 2);
  if (occupied(spot)) {
    for (let dx = -20; dx <= 20 && occupied(spot); dx += 10) {
      spot = { x: HEAD_SPOT.x + dx, y: HEAD_SPOT.y };
    }
  }
  cue.x = spot.x;
  cue.y = spot.y;
}

function remainingGroupCount(game, group) {
  return game.balls.filter((b) => b.group === group && !b.pocketed).length;
}

function resolveTurn(game) {
  const log = game.shotLog;
  const potted = log.potted;
  const player = game.currentPlayer;
  const opponent = player === 0 ? 1 : 0;
  const cueScratched = potted.includes(0);
  const eightPotted = potted.includes(8);
  const nonCuePotted = potted.filter((n) => n !== 0);

  game.foulLog = { scratch: cueScratched, noContact: log.firstContact === null && nonCuePotted.length === 0 };

  if (eightPotted) {
    const myGroup = game.playerGroups[player];
    const legalPot = !game.tableOpen && myGroup && remainingGroupCount(game, myGroup) === 0;
    if (!legalPot) {
      game.gameOver = true;
      game.winner = opponent;
      game.reason = 'eight_ball_early';
    } else if (cueScratched) {
      game.gameOver = true;
      game.winner = opponent;
      game.reason = 'eight_ball_scratch';
    } else {
      game.gameOver = true;
      game.winner = player;
      game.reason = 'eight_ball_legal';
    }
    game.shotInProgress = false;
    game.shotLog = null;
    return;
  }

  // Group assignment: first ball(s) legally potted after the table opens.
  if (game.tableOpen && nonCuePotted.length > 0) {
    const groupsHit = new Set(nonCuePotted.map((n) => groupForNumber(n)));
    if (groupsHit.size === 1) {
      const chosen = [...groupsHit][0];
      game.playerGroups[player] = chosen;
      game.playerGroups[opponent] = chosen === 'solid' ? 'stripe' : 'solid';
      game.tableOpen = false;
    }
    // Potting both groups on the same (break) shot keeps the table open.
  }

  const foul = cueScratched || (log.firstContact === null && nonCuePotted.length === 0);
  const myGroup = game.playerGroups[player];
  const pottedOwn = myGroup ? nonCuePotted.some((n) => groupForNumber(n) === myGroup) : nonCuePotted.length > 0;

  if (cueScratched) respotCueBall(game);

  if (foul || !pottedOwn) {
    game.currentPlayer = opponent;
  }
  // else: same player continues (pocketed one of their own group).

  game.firstShot = false;
  game.shotInProgress = false;
  game.shotLog = null;
}

/** Advances the simulation by one fixed frame. */
export function stepPoolPhysics(game) {
  if (game.gameOver) return game;
  for (const b of activeBalls(game)) {
    b.x += b.vx;
    b.y += b.vy;
  }
  resolvePockets(game);
  resolveCushions(game);
  resolveBallCollisions(game);
  applyFriction(game);

  if (game.shotInProgress && isAllStopped(game)) {
    resolveTurn(game);
  }
  return game;
}

export function takeShot(game, angleRad, powerFrac) {
  if (game.gameOver || game.shotInProgress || !isAllStopped(game)) return false;
  const cue = cueBall(game);
  if (cue.pocketed) return false;
  const power = Math.max(0, Math.min(1, powerFrac));
  const speed = power * MAX_SHOT_SPEED;
  cue.vx = Math.cos(angleRad) * speed;
  cue.vy = Math.sin(angleRad) * speed;
  game.shotInProgress = true;
  game.shotLog = { potted: [], firstContact: null };
  return true;
}

/**
 * Chooses a bot shot: aims cue ball through the "ghost ball" position needed
 * to send a target ball toward its nearest pocket, then adds angle/power
 * noise scaled by difficulty.
 */
export function pickBotShot(game, difficulty = 'medium', rng = Math.random) {
  const cue = cueBall(game);
  const myGroup = game.playerGroups[game.currentPlayer];
  const legalTargets = game.balls.filter((b) => {
    if (b.pocketed || b.number === 0) return false;
    if (b.number === 8) {
      return myGroup ? remainingGroupCount(game, myGroup) === 0 : false;
    }
    if (!myGroup) return true; // table open
    return b.group === myGroup;
  });
  const pool = legalTargets.length > 0 ? legalTargets : game.balls.filter((b) => !b.pocketed && b.number !== 0);

  let best = null;
  for (const target of pool) {
    for (const pocket of POCKETS) {
      const dirX = pocket.x - target.x;
      const dirY = pocket.y - target.y;
      const dirLen = Math.hypot(dirX, dirY) || 1;
      const ghost = {
        x: target.x - (dirX / dirLen) * (BALL_R * 2),
        y: target.y - (dirY / dirLen) * (BALL_R * 2),
      };
      const dCueGhost = Math.hypot(ghost.x - cue.x, ghost.y - cue.y);
      const score = dCueGhost + dirLen;
      if (!best || score < best.score) {
        best = { target, pocket, ghost, score, dCueGhost, dirLen };
      }
    }
  }

  const noise = DIFFICULTY_NOISE[difficulty] ?? DIFFICULTY_NOISE.medium;
  const powerNoise = DIFFICULTY_POWER_NOISE[difficulty] ?? DIFFICULTY_POWER_NOISE.medium;
  const baseAngle = best ? Math.atan2(best.ghost.y - cue.y, best.ghost.x - cue.x) : rng() * Math.PI * 2;
  const angle = baseAngle + (rng() - 0.5) * noise;
  const basePower = best ? Math.min(1, 0.45 + (best.dCueGhost + best.dirLen) / 260) : 0.5;
  const power = Math.max(0.15, Math.min(1, basePower + (rng() - 0.5) * powerNoise));
  return { angle, power };
}

export function resetRack(game, rng = Math.random) {
  game.balls = buildRack(rng);
  game.currentPlayer = 0;
  game.playerGroups = { 0: null, 1: null };
  game.tableOpen = true;
  game.shotInProgress = false;
  game.shotLog = null;
  game.firstShot = true;
  game.gameOver = false;
  game.winner = null;
  game.reason = null;
  game.foulLog = null;
  return game;
}
