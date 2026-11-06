// Pure furniture/inventory logic: purchase, placement validation, pickup, move, rotate.
// Operates on a plain game-state object (see save.js for its shape). No DOM access.

import { TILE, CATALOGUE, getCatalogueItem } from './data.js';

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
    if (cell === TILE.WALL || cell === TILE.DOOR || cell === TILE.WINDOW) {
      return { ok: false, reason: 'blocked_tile' };
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
