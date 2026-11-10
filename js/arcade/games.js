// Pixel Hotel v0.8.7 — Pure Arcade Game Logic
//
// Standalone, deterministic game engines for the 3 arcade titles:
//   1. Noodle Snake ("noodle_snake")
//   2. Brick Bash ("brick_bash")
//   3. Block Drop ("block_drop")
//
// Designed to be headless-testable and renderable to HTML5 Canvas.

// =============================================================================
// 1. Noodle Snake
// =============================================================================

export function createSnakeGame({ width = 16, height = 16, rng = Math.random } = {}) {
  const game = {
    gameId: 'noodle_snake',
    width,
    height,
    snake: [
      { x: 5, y: 8 },
      { x: 4, y: 8 },
      { x: 3, y: 8 },
    ],
    dir: { dx: 1, dy: 0 },
    nextDir: { dx: 1, dy: 0 },
    food: { x: 10, y: 8, type: 'dumpling' },
    score: 0,
    foodEaten: 0,
    gameOver: false,
  };
  spawnSnakeFood(game, rng);
  return game;
}

export function spawnSnakeFood(game, rng = Math.random) {
  const occupied = new Set(game.snake.map((s) => `${s.x},${s.y}`));
  const free = [];
  for (let y = 0; y < game.height; y++) {
    for (let x = 0; x < game.width; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) {
    game.gameOver = true;
    return;
  }
  const idx = Math.floor(rng() * free.length);
  const types = ['dumpling', 'egg', 'scallion', 'shrimp', 'chashu'];
  const type = types[Math.floor(rng() * types.length)];
  game.food = { ...free[idx], type };
}

export function setSnakeDirection(game, dirName) {
  if (game.gameOver) return false;
  const current = game.dir;
  let next = null;
  switch (dirName) {
    case 'up':
      if (current.dy !== 1) next = { dx: 0, dy: -1 };
      break;
    case 'down':
      if (current.dy !== -1) next = { dx: 0, dy: 1 };
      break;
    case 'left':
      if (current.dx !== 1) next = { dx: -1, dy: 0 };
      break;
    case 'right':
      if (current.dx !== -1) next = { dx: 1, dy: 0 };
      break;
    default:
      break;
  }
  if (next) {
    game.nextDir = next;
    return true;
  }
  return false;
}

export function stepSnakeGame(game, rng = Math.random) {
  if (game.gameOver) return game;

  game.dir = game.nextDir;
  const head = game.snake[0];
  const nextHead = { x: head.x + game.dir.dx, y: head.y + game.dir.dy };

  // Wall collision
  if (nextHead.x < 0 || nextHead.x >= game.width || nextHead.y < 0 || nextHead.y >= game.height) {
    game.gameOver = true;
    return game;
  }

  // Self collision (ignore tail tip if not eating this step, but simplest is check body)
  const hitsBody = game.snake.slice(0, -1).some((s) => s.x === nextHead.x && s.y === nextHead.y);
  if (hitsBody) {
    game.gameOver = true;
    return game;
  }

  game.snake.unshift(nextHead);

  if (nextHead.x === game.food.x && nextHead.y === game.food.y) {
    game.score += 10;
    game.foodEaten += 1;
    spawnSnakeFood(game, rng);
  } else {
    game.snake.pop();
  }

  return game;
}

// =============================================================================
// 2. Brick Bash
// =============================================================================

export function createBrickBashGame({ width = 320, height = 320 } = {}) {
  const game = {
    gameId: 'brick_bash',
    width,
    height,
    paddle: { x: 130, y: 295, w: 60, h: 10, speed: 6 },
    ball: { x: 160, y: 220, vx: 2.2, vy: -3.2, radius: 4 },
    bricks: [],
    lives: 3,
    score: 0,
    gameOver: false,
    wave: 1,
  };
  initBricks(game);
  return game;
}

export function initBricks(game) {
  const rows = 4;
  const cols = 8;
  const brickW = 34;
  const brickH = 12;
  const gap = 4;
  const offsetLeft = Math.floor((game.width - (cols * brickW + (cols - 1) * gap)) / 2);
  const offsetTop = 40;

  const rowColors = ['#ff4081', '#ff9100', '#00e5ff', '#76ff03'];
  const rowPoints = [40, 30, 20, 10];

  game.bricks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      game.bricks.push({
        id: `b-${r}-${c}`,
        x: offsetLeft + c * (brickW + gap),
        y: offsetTop + r * (brickH + gap),
        w: brickW,
        h: brickH,
        color: rowColors[r % rowColors.length],
        points: rowPoints[r % rowPoints.length],
        alive: true,
      });
    }
  }
}

export function movePaddle(game, dir) {
  if (game.gameOver) return;
  const delta = (dir === 'left' ? -1 : dir === 'right' ? 1 : 0) * game.paddle.speed;
  game.paddle.x = Math.max(0, Math.min(game.width - game.paddle.w, game.paddle.x + delta));
}

export function stepBrickBashGame(game) {
  if (game.gameOver) return game;

  const { ball, paddle, width, height } = game;
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Left & right walls
  if (ball.x - ball.radius <= 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.radius >= width) {
    ball.x = width - ball.radius;
    ball.vx = -Math.abs(ball.vx);
  }

  // Ceiling
  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
  }

  // Paddle bounce
  if (
    ball.vy > 0 &&
    ball.y + ball.radius >= paddle.y &&
    ball.y - ball.radius <= paddle.y + paddle.h &&
    ball.x + ball.radius >= paddle.x &&
    ball.x - ball.radius <= paddle.x + paddle.w
  ) {
    ball.vy = -Math.abs(ball.vy);
    const hitOffset = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const clampedOffset = Math.max(-1, Math.min(1, hitOffset));
    ball.vx = clampedOffset * 4.2;
    // ensure ball is not inside paddle
    ball.y = paddle.y - ball.radius;
  }

  // Brick collision
  for (const b of game.bricks) {
    if (!b.alive) continue;
    if (
      ball.x + ball.radius >= b.x &&
      ball.x - ball.radius <= b.x + b.w &&
      ball.y + ball.radius >= b.y &&
      ball.y - ball.radius <= b.y + b.h
    ) {
      b.alive = false;
      game.score += b.points;
      ball.vy = -ball.vy;
      break;
    }
  }

  // Check if wave cleared
  const remainingBricks = game.bricks.filter((b) => b.alive).length;
  if (remainingBricks === 0) {
    game.score += 200;
    game.wave += 1;
    initBricks(game);
    // slightly faster ball
    const speedMultiplier = 1.1;
    ball.x = width / 2;
    ball.y = 200;
    ball.vx = (ball.vx > 0 ? 1 : -1) * Math.min(5, Math.abs(ball.vx) * speedMultiplier);
    ball.vy = -Math.min(5, Math.abs(ball.vy) * speedMultiplier);
    return game;
  }

  // Bottom edge (lose ball)
  if (ball.y + ball.radius >= height) {
    game.lives -= 1;
    if (game.lives <= 0) {
      game.gameOver = true;
    } else {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = 220;
      ball.vx = 2.2;
      ball.vy = -3.2;
    }
  }

  return game;
}

// =============================================================================
// 3. Block Drop
// =============================================================================

export const TETROMINOES = {
  I: {
    shape: [
      [1, 1, 1, 1],
    ],
    color: '#00e5ff',
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: '#ffd600',
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: '#b388ff',
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: '#00e676',
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: '#ff1744',
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: '#2979ff',
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: '#ff9100',
  },
};

const TETRO_KEYS = Object.keys(TETROMINOES);

export function createBlockDropGame({ cols = 10, rows = 18, rng = Math.random } = {}) {
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  const game = {
    gameId: 'block_drop',
    cols,
    rows,
    matrix,
    currentPiece: null,
    score: 0,
    linesCleared: 0,
    gameOver: false,
  };
  spawnPiece(game, rng);
  return game;
}

export function rotateMatrix(shape) {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = shape[r][c];
    }
  }
  return rotated;
}

export function canPieceFit(matrix, shape, px, py) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const targetX = px + c;
      const targetY = py + r;
      if (targetX < 0 || targetX >= cols || targetY < 0 || targetY >= rows) {
        return false;
      }
      if (matrix[targetY][targetX] !== 0) {
        return false;
      }
    }
  }
  return true;
}

export function spawnPiece(game, rng = Math.random) {
  const key = TETRO_KEYS[Math.floor(rng() * TETRO_KEYS.length)];
  const def = TETROMINOES[key];
  const shape = def.shape.map((row) => [...row]);
  const px = Math.floor((game.cols - shape[0].length) / 2);
  const py = 0;

  if (!canPieceFit(game.matrix, shape, px, py)) {
    game.gameOver = true;
    return false;
  }

  game.currentPiece = {
    shape,
    color: def.color,
    x: px,
    y: py,
  };
  return true;
}

export function lockPiece(game, rng = Math.random) {
  const { shape, color, x, y } = game.currentPiece;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        game.matrix[y + r][x + c] = color;
      }
    }
  }

  // Clear completed rows
  const newMatrix = [];
  let cleared = 0;
  for (let r = 0; r < game.rows; r++) {
    if (game.matrix[r].every((cell) => cell !== 0)) {
      cleared += 1;
    } else {
      newMatrix.push([...game.matrix[r]]);
    }
  }

  while (newMatrix.length < game.rows) {
    newMatrix.unshift(Array(game.cols).fill(0));
  }
  game.matrix = newMatrix;

  if (cleared > 0) {
    game.linesCleared += cleared;
    const linePoints = [0, 100, 300, 500, 800];
    game.score += linePoints[Math.min(cleared, 4)];
  }

  spawnPiece(game, rng);
}

export function moveBlockDrop(game, action, rng = Math.random) {
  if (game.gameOver || !game.currentPiece) return false;
  const p = game.currentPiece;

  if (action === 'left') {
    if (canPieceFit(game.matrix, p.shape, p.x - 1, p.y)) {
      p.x -= 1;
      return true;
    }
  } else if (action === 'right') {
    if (canPieceFit(game.matrix, p.shape, p.x + 1, p.y)) {
      p.x += 1;
      return true;
    }
  } else if (action === 'down') {
    if (canPieceFit(game.matrix, p.shape, p.x, p.y + 1)) {
      p.y += 1;
      return true;
    } else {
      lockPiece(game, rng);
      return true;
    }
  } else if (action === 'rotate') {
    const rotated = rotateMatrix(p.shape);
    if (canPieceFit(game.matrix, rotated, p.x, p.y)) {
      p.shape = rotated;
      return true;
    }
    // Simple wall-kick: try 1 tile left or right
    if (canPieceFit(game.matrix, rotated, p.x - 1, p.y)) {
      p.x -= 1;
      p.shape = rotated;
      return true;
    }
    if (canPieceFit(game.matrix, rotated, p.x + 1, p.y)) {
      p.x += 1;
      p.shape = rotated;
      return true;
    }
  } else if (action === 'drop') {
    while (canPieceFit(game.matrix, p.shape, p.x, p.y + 1)) {
      p.y += 1;
    }
    lockPiece(game, rng);
    return true;
  }
  return false;
}

export function stepBlockDropGame(game, rng = Math.random) {
  return moveBlockDrop(game, 'down', rng);
}
