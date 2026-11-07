// Pure grid A* pathfinding with binary-heap open list, octile heuristic,
// 8-directional movement with strict no-corner-cutting, cross-product
// tie-breaking, line-of-sight string-pulling, nearest-reachable fallback,
// and seamless mid-step mover re-targeting / dynamic re-planning.
// Zero DOM dependencies — unit testable in Node.

const SQRT2 = Math.SQRT2;
const OCTILE_F = SQRT2 - 2;

export class BinaryHeap {
  constructor(compare = (a, b) => a.f - b.f) {
    this.data = [];
    this.compare = compare;
  }

  get size() {
    return this.data.length;
  }

  push(item) {
    this.data.push(item);
    this._up(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const bottom = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this._down(0);
    }
    return top;
  }

  _up(i) {
    const { data, compare } = this;
    const item = data[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      const parent = data[p];
      if (compare(item, parent) >= 0) break;
      data[i] = parent;
      i = p;
    }
    data[i] = item;
  }

  _down(i) {
    const { data, compare } = this;
    const len = data.length;
    const item = data[i];
    const half = len >> 1;
    while (i < half) {
      let left = (i << 1) + 1;
      const right = left + 1;
      let best = data[left];
      if (right < len && compare(data[right], best) < 0) {
        left = right;
        best = data[right];
      }
      if (compare(best, item) >= 0) break;
      data[i] = best;
      i = left;
    }
    data[i] = item;
  }
}

export function octileHeuristic(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx + dy) + OCTILE_F * Math.min(dx, dy);
}

function key(x, y) {
  return `${x},${y}`;
}

const NEIGHBORS_8 = [
  { x: 1, y: 0, cost: 1 },
  { x: -1, y: 0, cost: 1 },
  { x: 0, y: 1, cost: 1 },
  { x: 0, y: -1, cost: 1 },
  { x: 1, y: 1, cost: SQRT2 },
  { x: 1, y: -1, cost: SQRT2 },
  { x: -1, y: 1, cost: SQRT2 },
  { x: -1, y: -1, cost: SQRT2 },
];

const NEIGHBORS_4 = NEIGHBORS_8.slice(0, 4);

/**
 * Checks whether a single step from (x, y) to adjacent (nx, ny) is valid,
 * enforcing strict no-corner-cutting on diagonal steps.
 */
export function canStep(x, y, nx, ny, isBlocked) {
  if (isBlocked(nx, ny)) return false;
  const dx = nx - x;
  const dy = ny - y;
  if (dx !== 0 && dy !== 0) {
    if (isBlocked(x + dx, y) || isBlocked(x, y + dy)) return false;
  }
  return true;
}

/**
 * Supercover line-of-sight & 8-directional step tracer between tiles `a` and `b`.
 * Returns the array of 1-tile steps `[a, ..., b]` if the segment has clear line of sight
 * without touching any blocked cell or cutting any diagonal corner; otherwise returns null.
 */
export function traceLineOfSightSteps(a, b, isBlocked) {
  if (a.x === b.x && a.y === b.y) return [{ x: a.x, y: a.y }];
  if (isBlocked(b.x, b.y)) return null;

  // 1. Supercover check: ensure every grid cell intersected by segment a->b is unblocked
  const dxTotal = b.x - a.x;
  const dyTotal = b.y - a.y;
  const nx = Math.abs(dxTotal);
  const ny = Math.abs(dyTotal);
  const signX = Math.sign(dxTotal);
  const signY = Math.sign(dyTotal);

  let cx = a.x;
  let cy = a.y;
  for (let ix = 0, iy = 0; ix < nx || iy < ny;) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      // Line passes directly through a grid corner: both adjacent cardinal cells must be free
      if (isBlocked(cx + signX, cy) || isBlocked(cx, cy + signY)) return null;
      cx += signX;
      cy += signY;
      ix++;
      iy++;
    } else if (decision < 0) {
      cx += signX;
      ix++;
    } else {
      cy += signY;
      iy++;
    }
    if (isBlocked(cx, cy)) return null;
  }

  // 2. Construct clean 8-directional 1-tile steps along the line with no corner-cutting
  const steps = [{ x: a.x, y: a.y }];
  let x = a.x;
  let y = a.y;
  const len = Math.hypot(dxTotal, dyTotal);
  while (x !== b.x || y !== b.y) {
    const remX = b.x - x;
    const remY = b.y - y;
    const sx = Math.sign(remX);
    const sy = Math.sign(remY);
    const candidates = [];
    if (sx !== 0 && sy !== 0) candidates.push({ nx: x + sx, ny: y + sy });
    if (sx !== 0) candidates.push({ nx: x + sx, ny: y });
    if (sy !== 0) candidates.push({ nx: x, ny: y + sy });

    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      if (!canStep(x, y, c.nx, c.ny, isBlocked)) continue;
      // Perpendicular distance from c to segment a->b + remaining distance to b
      const cross = Math.abs((c.nx - a.x) * dyTotal - (c.ny - a.y) * dxTotal) / (len || 1);
      const distToGoal = octileHeuristic(c, b);
      const score = distToGoal + cross * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) return null;
    x = best.nx;
    y = best.ny;
    steps.push({ x, y });
    if (steps.length > (nx + ny + 4)) return null;
  }
  return steps;
}

export function hasLineOfSight(a, b, isBlocked) {
  return traceLineOfSightSteps(a, b, isBlocked) !== null;
}

/**
 * Greedy line-of-sight string-pulling path smoother.
 * When `resample` is false (default), returns the minimal line-of-sight waypoints.
 * When `resample` is true, expands each smoothed segment into unobstructed 8-dir 1-tile steps.
 */
export function smoothPath(path, isBlocked, { resample = false } = {}) {
  if (!path || path.length <= 2) return path ? path.map((p) => ({ x: p.x, y: p.y })) : null;

  const waypoints = [{ x: path[0].x, y: path[0].y }];
  const expanded = [{ x: path[0].x, y: path[0].y }];
  let anchorIdx = 0;

  while (anchorIdx < path.length - 1) {
    let furthestIdx = anchorIdx + 1;
    let furthestSteps = null;
    for (let probe = path.length - 1; probe > anchorIdx + 1; probe--) {
      const steps = traceLineOfSightSteps(path[anchorIdx], path[probe], isBlocked);
      if (steps) {
        furthestIdx = probe;
        furthestSteps = steps;
        break;
      }
    }
    const nextWp = path[furthestIdx];
    waypoints.push({ x: nextWp.x, y: nextWp.y });
    if (resample) {
      const seg = furthestSteps || path.slice(anchorIdx, furthestIdx + 1);
      for (let i = 1; i < seg.length; i++) {
        expanded.push({ x: seg[i].x, y: seg[i].y });
      }
    }
    anchorIdx = furthestIdx;
  }

  return resample ? expanded : waypoints;
}

/**
 * 8-directional A* pathfinding with binary heap, octile heuristic, cross-product
 * straight-line tie-breaking, strict no-corner-cutting, and LoS string-pulling.
 *
 * @param {number} width
 * @param {number} height
 * @param {(x:number, y:number) => boolean} isBlocked - true if tile cannot be entered
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} goal
 * @param {{allowDiagonal?:boolean, smooth?:boolean, waypointsOnly?:boolean}} [options]
 * @returns {Array<{x:number,y:number}>|null} path including start and goal, or null if unreachable
 */
export function findPath(width, height, isBlocked, start, goal, options = {}) {
  if (!start || !goal) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ x: start.x, y: start.y }];
  if (goal.x < 0 || goal.y < 0 || goal.x >= width || goal.y >= height) return null;

  const boundedBlocked = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    return !!isBlocked(x, y);
  };
  if (boundedBlocked(goal.x, goal.y)) return null;

  const allowDiagonal = options.allowDiagonal !== false;
  const smooth = options.smooth !== false;
  const neighbors = allowDiagonal ? NEIGHBORS_8 : NEIGHBORS_4;

  const dx0 = goal.x - start.x;
  const dy0 = goal.y - start.y;

  const open = new BinaryHeap((a, b) => a.f - b.f);
  const startKey = key(start.x, start.y);
  const h0 = allowDiagonal ? octileHeuristic(start, goal) : Math.abs(dx0) + Math.abs(dy0);
  open.push({ x: start.x, y: start.y, g: 0, f: h0 });

  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const closed = new Set();

  while (open.size > 0) {
    const current = open.pop();
    const currentKey = key(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.x === goal.x && current.y === goal.y) {
      const rawPath = [{ x: current.x, y: current.y }];
      let ck = currentKey;
      while (cameFrom.has(ck)) {
        ck = cameFrom.get(ck);
        const [px, py] = ck.split(',').map(Number);
        rawPath.unshift({ x: px, y: py });
      }
      if (!smooth || !allowDiagonal) return rawPath;
      return smoothPath(rawPath, boundedBlocked, { resample: !options.waypointsOnly });
    }

    for (const dir of neighbors) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nKey = key(nx, ny);
      if (closed.has(nKey)) continue;
      if (!canStep(current.x, current.y, nx, ny, boundedBlocked)) continue;

      const tentativeG = current.g + dir.cost;
      const prevG = gScore.get(nKey);
      if (prevG === undefined || tentativeG < prevG - 1e-9) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        const h = allowDiagonal
          ? octileHeuristic({ x: nx, y: ny }, goal)
          : Math.abs(nx - goal.x) + Math.abs(ny - goal.y);
        // Cross-product tie-breaker encourages straight paths toward goal
        const dx1 = nx - goal.x;
        const dy1 = ny - goal.y;
        const cross = Math.abs(dx1 * dy0 - dx0 * dy1);
        const f = tentativeG + h + cross * 0.0004;
        open.push({ x: nx, y: ny, g: tentativeG, f });
      }
    }
  }
  return null;
}

/**
 * Finds the closest reachable unblocked tile to `target` when `target` itself is blocked
 * or unreachable, returning `{ tile, path }` or `null`.
 */
export function findNearestReachableTile(width, height, isBlocked, start, target, options = {}) {
  if (!start || !target) return null;
  const clampedTarget = {
    x: Math.max(0, Math.min(width - 1, Math.round(target.x))),
    y: Math.max(0, Math.min(height - 1, Math.round(target.y))),
  };
  const direct = findPath(width, height, isBlocked, start, clampedTarget, options);
  if (direct) return { tile: clampedTarget, path: direct };

  const candidates = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === clampedTarget.x && y === clampedTarget.y) continue;
      if (isBlocked(x, y)) continue;
      const distTarget = octileHeuristic({ x, y }, clampedTarget);
      const distStart = octileHeuristic({ x, y }, start);
      candidates.push({ x, y, score: distTarget * 100 + distStart });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  for (const c of candidates) {
    const path = findPath(width, height, isBlocked, start, { x: c.x, y: c.y }, options);
    if (path) return { tile: { x: c.x, y: c.y }, path };
  }
  return null;
}

export function findPathToNearest(width, height, isBlocked, start, target, options = {}) {
  const res = findNearestReachableTile(width, height, isBlocked, start, target, options);
  return res ? res.path : null;
}

const DIR_MAP = {
  '1,0': 'right',
  '-1,0': 'left',
  '0,1': 'down',
  '0,-1': 'up',
  '1,1': 'down',
  '-1,-1': 'up',
  '1,-1': 'right',
  '-1,1': 'left',
};

export function directionForStep(from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return DIR_MAP[`${dx},${dy}`] || 'down';
}

export function createMoverState(x = 0, y = 0, dir = 'down') {
  return {
    x,
    y,
    renderX: x,
    renderY: y,
    fromX: x,
    fromY: y,
    toX: x,
    toY: y,
    targetX: null,
    targetY: null,
    dir,
    frame: 0,
    walking: false,
    path: null,
    pathIdx: 0,
    stepStart: 0,
    stepDuration: 240,
  };
}

/**
 * Seamlessly plans or re-targets a mover toward `(tx, ty)` at timestamp `now`.
 * - If already walking, continues the current interpolated step `(fromX,fromY)->(toX,toY)`
 *   without snapping back or resetting `stepStart`, and re-plans from `(toX,toY)`.
 * - Ignores duplicate clicks on the same target tile.
 */
export function retargetMover(mover, tx, ty, now, { width, height, isBlocked, stepMs = 240, nearestFallback = true }) {
  if (mover.walking) {
    if (mover.targetX === tx && mover.targetY === ty) {
      return { ok: true, ignoredDuplicate: true, path: mover.path };
    }
    const anchor = { x: mover.toX, y: mover.toY };
    const subPath = nearestFallback
      ? findPathToNearest(width, height, isBlocked, anchor, { x: tx, y: ty })
      : findPath(width, height, isBlocked, anchor, { x: tx, y: ty });
    if (!subPath) return { ok: false };
    const resolvedGoal = subPath[subPath.length - 1];
    if (mover.targetX === resolvedGoal.x && mover.targetY === resolvedGoal.y) {
      return { ok: true, ignoredDuplicate: true, path: mover.path };
    }
    mover.path = [{ x: mover.fromX, y: mover.fromY }, ...subPath];
    mover.pathIdx = 0;
    mover.targetX = resolvedGoal.x;
    mover.targetY = resolvedGoal.y;
    return { ok: true, retargetedMidStep: true, path: mover.path };
  }

  const path = nearestFallback
    ? findPathToNearest(width, height, isBlocked, { x: mover.x, y: mover.y }, { x: tx, y: ty })
    : findPath(width, height, isBlocked, { x: mover.x, y: mover.y }, { x: tx, y: ty });
  if (!path || path.length < 2) {
    mover.path = null;
    mover.walking = false;
    return { ok: false, alreadyAtGoal: !!path };
  }
  const resolvedGoal = path[path.length - 1];
  const next = path[1];
  mover.path = path;
  mover.pathIdx = 0;
  mover.fromX = mover.x;
  mover.fromY = mover.y;
  mover.toX = next.x;
  mover.toY = next.y;
  mover.targetX = resolvedGoal.x;
  mover.targetY = resolvedGoal.y;
  mover.dir = directionForStep(mover, next);
  mover.stepDuration = stepMs * Math.hypot(next.x - mover.x, next.y - mover.y);
  mover.stepStart = now;
  mover.walking = true;
  return { ok: true, path: mover.path };
}

/**
 * Advances a mover's interpolation at timestamp `now`, dynamically re-planning
 * at tile boundaries if the next step becomes blocked by a moving NPC or placed item.
 */
export function advanceMover(mover, now, { width, height, isBlocked, stepMs = 240, onStep, onArrive, onReplan } = {}) {
  if (!mover.walking || !mover.path) {
    mover.renderX = mover.x;
    mover.renderY = mover.y;
    return;
  }

  const dur = mover.stepDuration || stepMs;
  let elapsed = Math.max(0, now - mover.stepStart);

  while (mover.walking && elapsed >= (mover.stepDuration || stepMs)) {
    const currentDur = mover.stepDuration || stepMs;
    elapsed -= currentDur;
    mover.x = mover.toX;
    mover.y = mover.toY;
    mover.pathIdx++;

    if (!mover.path || mover.pathIdx >= mover.path.length - 1) {
      mover.walking = false;
      mover.path = null;
      mover.fromX = mover.x;
      mover.fromY = mover.y;
      mover.renderX = mover.x;
      mover.renderY = mover.y;
      mover.targetX = null;
      mover.targetY = null;
      if (onArrive) onArrive(mover);
      return;
    }

    let next = mover.path[mover.pathIdx + 1];
    if (isBlocked && width && height) {
      if (!canStep(mover.x, mover.y, next.x, next.y, isBlocked)) {
        const goal = mover.path[mover.path.length - 1];
        const detour = findPathToNearest(width, height, isBlocked, { x: mover.x, y: mover.y }, goal);
        if (!detour || detour.length < 2) {
          mover.walking = false;
          mover.path = null;
          mover.fromX = mover.x;
          mover.fromY = mover.y;
          mover.renderX = mover.x;
          mover.renderY = mover.y;
          mover.targetX = null;
          mover.targetY = null;
          if (onArrive) onArrive(mover);
          return;
        }
        mover.path = detour;
        mover.pathIdx = 0;
        mover.targetX = detour[detour.length - 1].x;
        mover.targetY = detour[detour.length - 1].y;
        next = mover.path[1];
        if (onReplan) onReplan(mover, detour);
      }
    }

    mover.fromX = mover.x;
    mover.fromY = mover.y;
    mover.toX = next.x;
    mover.toY = next.y;
    mover.dir = directionForStep(mover, next);
    mover.stepDuration = stepMs * Math.hypot(next.x - mover.x, next.y - mover.y);
    mover.stepStart = now - Math.min(elapsed, mover.stepDuration * 0.9);
    if (onStep) onStep(mover);
  }

  const activeDur = mover.stepDuration || dur;
  const t = Math.max(0, Math.min(1, (now - mover.stepStart) / activeDur));
  mover.renderX = mover.fromX + (mover.toX - mover.fromX) * t;
  mover.renderY = mover.fromY + (mover.toY - mover.fromY) * t;
  mover.frame = Math.floor(now / 140) % 2;
}
