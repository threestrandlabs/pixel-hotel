// Pure furniture/inventory logic: purchase, placement validation, pickup, move, rotate,
// multi-slot seat occupancy/reservation, and safe approach tile routing.
// Operates on a plain game-state object (see save.js for its shape). No DOM access.

import { TILE, CATALOGUE, getCatalogueItem } from './data.js';
import { findPath } from './pathfinding.js';

let nextInstanceSeq = 1;
export function generateInstanceId() {
  return `f${Date.now().toString(36)}${(nextInstanceSeq++).toString(36)}`;
}

export function rotatedFootprint(footprint, rot) {
  const r = ((rot % 4) + 4) % 4;
  if (r === 1 || r === 3) return { w: footprint.h, h: footprint.w };
  return { w: footprint.w, h: footprint.h };
}

export function footprintCells(x, y, footprint, rot) {
  const { w, h } = rotatedFootprint(footprint, rot);
  const cells = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      cells.push({ x: x + dx, y: y + dy });
    }
  }
  return cells;
}

export function seatDirFromRot(rot = 0) {
  const dirs = ['down', 'right', 'up', 'left'];
  return dirs[((rot % 4) + 4) % 4];
}

export function oppositeDir(dir) {
  return { down: 'up', up: 'down', left: 'right', right: 'left' }[dir] || 'down';
}

/**
 * Returns occupyable slot tiles for a placed item (seats, beds, yoga mats, treadmills, pools).
 */
export function interactionSlots(placedItem) {
  const item = getCatalogueItem(placedItem.itemId);
  if (!item) return [];
  const rot = ((placedItem.rot || 0) % 4 + 4) % 4;
  const cells = footprintCells(placedItem.x, placedItem.y, item.footprint, rot);
  if (item.interaction === 'treadmill') {
    const beltCell = cells[cells.length - 1] || { x: placedItem.x, y: placedItem.y };
    return [{
      x: beltCell.x,
      y: beltCell.y,
      dir: oppositeDir(seatDirFromRot(rot)),
      kind: 'treadmill',
      slotIdx: 0,
    }];
  }
  if (item.seat || item.interaction === 'lie' || item.interaction === 'swim') {
    const kind = item.interaction || 'sit';
    const dir = seatDirFromRot(rot);
    return cells.map((c, idx) => ({
      x: c.x,
      y: c.y,
      dir,
      kind,
      slotIdx: idx,
    }));
  }
  return [];
}

/**
 * Finds the first unoccupied and unreserved slot on a placed seat/bed/treadmill/pool.
 * @param {object} placedItem
 * @param {Array<{x:number,y:number}>} occupants - current tile positions of other actors
 * @param {Array<{instanceId?:string,x:number,y:number}>} reservations - pending slot claims
 */
export function findFreeInteractionSlot(placedItem, occupants = [], reservations = []) {
  const slots = interactionSlots(placedItem);
  for (const s of slots) {
    const taken = occupants.some((o) => o.x === s.x && o.y === s.y);
    const reserved = reservations.some((r) => r.x === s.x && r.y === s.y);
    if (!taken && !reserved) return s;
  }
  return null;
}

const DINING_SURFACES = new Set([
  'dining_table', 'cafe_table', 'espresso_bar', 'boba_bar', 'buffet_counter', 'noodle_cart', 'bar_counter', 'chef_station',
]);

/**
 * Returns true if a placed seat is orthogonally adjacent to a dining/food/drink table or counter.
 */
export function isDiningSeat(placedOrRoom, placedSeat, slotTile = null) {
  const placedList = Array.isArray(placedOrRoom) ? placedOrRoom : (placedOrRoom?.placed || []);
  const sx = slotTile ? slotTile.x : placedSeat.x;
  const sy = slotTile ? slotTile.y : placedSeat.y;
  for (const p of placedList) {
    if (!DINING_SURFACES.has(p.itemId)) continue;
    const item = getCatalogueItem(p.itemId);
    if (!item) continue;
    const cells = footprintCells(p.x, p.y, item.footprint, p.rot || 0);
    if (cells.some((c) => Math.abs(c.x - sx) + Math.abs(c.y - sy) === 1)) return true;
  }
  return false;
}

/**
 * Resolves either a direct occupyable slot (for seats/beds/treadmills/pools) or a safe
 * unblocked adjacent approach tile facing a solid interactive item (counters, tables, games).
 */
export function findApproachTile(room, placedItem, isBlocked, fromPos, occupants = [], reservations = []) {
  const item = getCatalogueItem(placedItem.itemId);
  if (!item) return null;

  // 1. Direct slot items (seats, beds, treadmills, lap pools, yoga mats)
  const slots = interactionSlots(placedItem);
  if (slots.length > 0) {
    for (const s of slots) {
      if (occupants.some((o) => o.x === s.x && o.y === s.y)) continue;
      if (reservations.some((r) => r.x === s.x && r.y === s.y)) continue;
      const allowSlot = (x, y) => (x === s.x && y === s.y ? false : isBlocked(x, y));
      const path = findPath(room.width, room.height, allowSlot, fromPos, { x: s.x, y: s.y });
      if (path) {
        let kind = s.kind;
        if (kind === 'sit' && room.placed && isDiningSeat(room.placed, placedItem, s)) {
          kind = 'eat';
        }
        return { x: s.x, y: s.y, tile: { x: s.x, y: s.y }, dir: s.dir, kind, path, directSlot: true };
      }
    }
    return null;
  }

  // 2. Solid non-seat furniture: find safe adjacent approach tiles facing inward
  const fCells = footprintCells(placedItem.x, placedItem.y, item.footprint, placedItem.rot || 0);
  const fSet = new Set(fCells.map((c) => `${c.x},${c.y}`));
  const frontDir = seatDirFromRot(placedItem.rot || 0);
  const candidates = [];
  const deltas = [
    { dx: 0, dy: 1, faceDir: 'up', side: 'down' },
    { dx: 1, dy: 0, faceDir: 'left', side: 'right' },
    { dx: 0, dy: -1, faceDir: 'down', side: 'up' },
    { dx: -1, dy: 0, faceDir: 'right', side: 'left' },
  ];

  const seen = new Set();
  for (const fc of fCells) {
    for (const d of deltas) {
      const ax = fc.x + d.dx;
      const ay = fc.y + d.dy;
      const k = `${ax},${ay}`;
      if (fSet.has(k) || seen.has(k)) continue;
      seen.add(k);
      if (ax < 0 || ay < 0 || ax >= room.width || ay >= room.height) continue;
      if (reservations.some((r) => r.x === ax && r.y === ay)) continue;
      if ((ax !== fromPos.x || ay !== fromPos.y) && isBlocked(ax, ay)) continue;
      const path = findPath(room.width, room.height, isBlocked, fromPos, { x: ax, y: ay });
      if (path) {
        const isFront = d.side === frontDir ? 0 : 1;
        candidates.push({
          x: ax,
          y: ay,
          tile: { x: ax, y: ay },
          dir: d.faceDir,
          kind: item.interaction || 'use',
          path,
          directSlot: false,
          score: isFront * 5 + path.length,
        });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || null;
}

/**
 * Verifies that every door in `room` has an unblocked landing tile and a walkable path to `room.spawn`.
 */
export function hasDoorArrivalRoute(room, placed = room.placed || []) {
  const isBlocked = (x, y) => {
    if (x < 0 || y < 0 || x >= room.width || y >= room.height) return true;
    const c = room.grid[y][x];
    if (c === TILE.WALL || c === TILE.WINDOW || c === TILE.VOID) return true;
    return placed.some((p) => {
      const item = getCatalogueItem(p.itemId);
      return item && !item.seat && !item.flat && item.interaction !== 'treadmill' &&
        footprintCells(p.x, p.y, item.footprint, p.rot || 0).some((fc) => fc.x === x && fc.y === y);
    });
  };
  for (const d of room.doors || []) {
    const landing = d.y === 0 ? { x: d.x, y: 1 } : { x: 1, y: d.y };
    if (isBlocked(landing.x, landing.y)) return false;
    const path = findPath(room.width, room.height, isBlocked, landing, room.spawn);
    if (!path || path.length < 1) return false;
  }
  return true;
}

/**
 * @param {object} room - { width, height, grid, placed: [{instanceId,itemId,x,y,rot}] }
 * @param {object} item - catalogue item
 * @param {number} x
 * @param {number} y
 * @param {number} rot
 * @param {Array<{x:number,y:number}>} occupantTiles - tiles currently occupied by avatar/NPCs
 * @param {string|null} excludeInstanceId - ignore this placed instance (used while moving it)
 * @returns {{ok:boolean, reason?:string, cells?:Array}}
 */
export function canPlaceAt(room, item, x, y, rot, occupantTiles = [], excludeInstanceId = null) {
  const cells = footprintCells(x, y, item.footprint, rot);
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= room.width || c.y >= room.height) {
      return { ok: false, reason: 'out_of_bounds' };
    }
    const cell = room.grid[c.y][c.x];
    if (cell === TILE.WALL || cell === TILE.DOOR || cell === TILE.WINDOW || cell === TILE.VOID) {
      return { ok: false, reason: 'blocked_tile' };
    }
    if (!item.flat && c.y === 1 && room.grid[0] && room.grid[0][c.x] === TILE.DOOR) {
      return { ok: false, reason: 'door_clearance' };
    }
    if (occupantTiles.some((o) => o.x === c.x && o.y === c.y)) {
      return { ok: false, reason: 'occupied' };
    }
    for (const p of room.placed) {
      if (p.instanceId === excludeInstanceId) continue;
      const other = getCatalogueItem(p.itemId);
      if (!!other.flat !== !!item.flat) continue; // rugs lie under furniture
      const otherCells = footprintCells(p.x, p.y, other.footprint, p.rot);
      if (otherCells.some((oc) => oc.x === c.x && oc.y === c.y)) {
        return { ok: false, reason: 'furniture_overlap' };
      }
    }
  }
  return { ok: true, cells };
}

export function buyItem(state, itemId) {
  const item = getCatalogueItem(itemId);
  if (!item) return { ok: false, reason: 'unknown_item' };
  if (item.unlockRequires && !state.unlocked.includes(itemId)) {
    return { ok: false, reason: 'locked' };
  }
  if (state.coins < item.price) return { ok: false, reason: 'insufficient_coins' };
  state.coins -= item.price;
  const instanceId = generateInstanceId();
  state.inventory.push({ instanceId, itemId });
  return { ok: true, instanceId };
}

export function placeItem(state, room, instanceId, x, y, rot, occupantTiles = []) {
  const invIdx = state.inventory.findIndex((i) => i.instanceId === instanceId);
  if (invIdx === -1) return { ok: false, reason: 'not_in_inventory' };
  const entry = state.inventory[invIdx];
  const item = getCatalogueItem(entry.itemId);
  const check = canPlaceAt(room, item, x, y, rot, occupantTiles);
  if (!check.ok) return check;
  state.inventory.splice(invIdx, 1);
  room.placed.push({ instanceId, itemId: entry.itemId, x, y, rot });
  return { ok: true };
}

export function pickupItem(state, room, instanceId) {
  const idx = room.placed.findIndex((p) => p.instanceId === instanceId);
  if (idx === -1) return { ok: false, reason: 'not_placed' };
  const [placed] = room.placed.splice(idx, 1);
  state.inventory.push({ instanceId: placed.instanceId, itemId: placed.itemId });
  return { ok: true };
}

export function moveItem(state, room, instanceId, x, y, rot, occupantTiles = []) {
  const idx = room.placed.findIndex((p) => p.instanceId === instanceId);
  if (idx === -1) return { ok: false, reason: 'not_placed' };
  const placed = room.placed[idx];
  const item = getCatalogueItem(placed.itemId);
  const check = canPlaceAt(room, item, x, y, rot, occupantTiles, instanceId);
  if (!check.ok) return check;
  placed.x = x;
  placed.y = y;
  placed.rot = rot;
  return { ok: true };
}

export function isUnlocked(state, itemId) {
  const item = getCatalogueItem(itemId);
  if (!item) return false;
  return !item.unlockRequires || state.unlocked.includes(itemId);
}

export function availableCatalogue(state) {
  return CATALOGUE.map((item) => ({ ...item, unlocked: isUnlocked(state, item.id) }));
}
