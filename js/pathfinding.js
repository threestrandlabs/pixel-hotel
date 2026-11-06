// Pure grid A* pathfinding. No DOM dependencies — unit testable in Node.

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function key(x, y) {
  return `${x},${y}`;
}

const NEIGHBORS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * @param {number} width
 * @param {number} height
 * @param {(x:number, y:number) => boolean} isBlocked - true if tile cannot be entered
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} goal
 * @returns {Array<{x:number,y:number}>|null} path including start and goal, or null if unreachable
 */
export function findPath(width, height, isBlocked, start, goal) {
  if (start.x === goal.x && start.y === goal.y) return [{ x: start.x, y: start.y }];
  if (goal.x < 0 || goal.y < 0 || goal.x >= width || goal.y >= height) return null;
  if (isBlocked(goal.x, goal.y)) return null;

  const open = new Map();
  const startKey = key(start.x, start.y);
  open.set(startKey, { x: start.x, y: start.y, g: 0, f: heuristic(start, goal) });

  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const closed = new Set();

  while (open.size > 0) {
    let currentKey = null;
    let current = null;
    for (const [k, node] of open) {
      if (!current || node.f < current.f) {
        current = node;
        currentKey = k;
      }
    }
    open.delete(currentKey);
    closed.add(currentKey);

    if (current.x === goal.x && current.y === goal.y) {
      const path = [{ x: current.x, y: current.y }];
      let ck = currentKey;
      while (cameFrom.has(ck)) {
        ck = cameFrom.get(ck);
        const [px, py] = ck.split(',').map(Number);
        path.unshift({ x: px, y: py });
      }
      return path;
    }

    for (const dir of NEIGHBORS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nKey = key(nx, ny);
      if (closed.has(nKey)) continue;
      const isGoalTile = nx === goal.x && ny === goal.y;
      if (!isGoalTile && isBlocked(nx, ny)) continue;
      if (isGoalTile && isBlocked(nx, ny)) continue;

      const tentativeG = current.g + 1;
      if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        const f = tentativeG + heuristic({ x: nx, y: ny }, goal);
        open.set(nKey, { x: nx, y: ny, g: tentativeG, f });
      }
    }
  }
  return null;
}
