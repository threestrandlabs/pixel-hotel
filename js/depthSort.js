// Isometric draw-order sorting by footprint boxes (pure, no DOM).
//
// The old renderer keyed every object by a single corner (frontX + frontY), so
// a 2x2 table and an avatar standing beside it could swap order and "pop
// through" each other. Here every drawable carries its ground-plane box in tile
// units and we topologically sort on the "is behind" relation:
//
//   A is behind B  <=>  A.maxX <= B.minX  or  A.maxY <= B.minY
//
// (the viewer looks from +x/+y, so lower x or lower y is further away). For
// boxes that overlap on both axes (e.g. an avatar sitting on a sofa) neither
// test holds and we fall back to the centre depth (x + y). Explicit `before`
// edges let callers pin an order, e.g. seat back -> seated avatar -> seat front.
//
// Tile (x, y) covers [x - 0.5, x + 0.5] on each axis (tileToScreen maps tile
// coordinates to the tile centre).

const EPS = 1e-6;

export function furnitureBox(x, y, w, h) {
  return { minX: x - 0.5, maxX: x + w - 0.5, minY: y - 0.5, maxY: y + h - 0.5 };
}

// Avatars are narrower than a tile so that one walking between two tiles does
// not overlap furniture on both neighbouring tiles at once.
export const ENTITY_HALF = 0.3;

export function entityBox(x, y, half = ENTITY_HALF) {
  return { minX: x - half, maxX: x + half, minY: y - half, maxY: y + half };
}

export function centreDepth(box) {
  return (box.minX + box.maxX) / 2 + (box.minY + box.maxY) / 2;
}

export function isBehind(a, b) {
  return a.maxX <= b.minX + EPS || a.maxY <= b.minY + EPS;
}

function overlapsBothAxes(a, b) {
  return !isBehind(a, b) && !isBehind(b, a);
}

/**
 * Sort drawables back-to-front.
 * @param {Array<{box:{minX,maxX,minY,maxY}, bias?:number, id?:string, before?:string[]}>} items
 *   `bias` nudges the centre-depth fallback for overlapping boxes.
 *   `before` lists ids this item must be drawn before.
 * @returns {Array} new array in draw order.
 */
export function sortDrawables(items) {
  const n = items.length;
  if (n < 2) return items.slice();
  const depth = new Float64Array(n);
  for (let i = 0; i < n; i++) depth[i] = centreDepth(items[i].box) + (items[i].bias || 0);

  const out = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);
  const addEdge = (from, to) => { out[from].push(to); indeg[to]++; };

  const byId = new Map();
  for (let i = 0; i < n; i++) if (items[i].id != null) byId.set(items[i].id, i);
  const pinned = new Set();
  for (let i = 0; i < n; i++) {
    const before = items[i].before;
    if (!before) continue;
    for (const id of before) {
      const j = byId.get(id);
      if (j === undefined || j === i) continue;
      addEdge(i, j);
      pinned.add(i * n + j);
      pinned.add(j * n + i);
    }
  }

  for (let i = 0; i < n; i++) {
    const a = items[i].box;
    for (let j = i + 1; j < n; j++) {
      if (pinned.has(i * n + j)) continue;
      const b = items[j].box;
      // Only order pairs whose screen footprints could overlap: boxes far apart
      // along the screen-x axis (x - y) never cover each other.
      const aL = a.minX - a.maxY;
      const aR = a.maxX - a.minY;
      const bL = b.minX - b.maxY;
      const bR = b.maxX - b.minY;
      if (aR <= bL || bR <= aL) continue;
      if (overlapsBothAxes(a, b)) {
        if (depth[i] <= depth[j]) addEdge(i, j); else addEdge(j, i);
      } else if (isBehind(a, b)) {
        addEdge(i, j);
      } else {
        addEdge(j, i);
      }
    }
  }

  // Kahn's algorithm, always emitting the ready item with the smallest depth so
  // the result is stable. If a cycle remains, break it at the shallowest item.
  const done = new Uint8Array(n);
  const result = [];
  const ready = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
  while (result.length < n) {
    let pick = -1;
    if (ready.length) {
      let best = 0;
      for (let k = 1; k < ready.length; k++) {
        if (depth[ready[k]] < depth[ready[best]]) best = k;
      }
      pick = ready[best];
      ready[best] = ready[ready.length - 1];
      ready.pop();
    } else {
      for (let i = 0; i < n; i++) {
        if (!done[i] && (pick < 0 || depth[i] < depth[pick])) pick = i;
      }
    }
    if (done[pick]) continue;
    done[pick] = 1;
    result.push(items[pick]);
    for (const t of out[pick]) {
      if (done[t]) continue;
      indeg[t]--;
      if (indeg[t] === 0) ready.push(t);
    }
  }
  return result;
}
