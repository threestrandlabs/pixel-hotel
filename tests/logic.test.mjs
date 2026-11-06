import test from 'node:test';
import assert from 'node:assert/strict';

import { findPath } from '../js/pathfinding.js';
import {
  buyItem, placeItem, pickupItem, moveItem, canPlaceAt, footprintCells, rotatedFootprint,
  availableCatalogue,
} from '../js/inventory.js';
import {
  initQuestState, advanceQuestsByType, setQuestProgress, claimReward, listQuests,
} from '../js/quests.js';
import { createDefaultState, loadState, saveState, resetState, SAVE_KEY } from '../js/save.js';
import { getCatalogueItem, TILE, SAVE_VERSION, ROOMS } from '../js/data.js';
import { respondToMessage } from '../js/npc.js';

// ---------- fake localStorage ----------
function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store,
  };
}

// ======================= pathfinding =======================

test('pathfinding: finds a straight path on an open grid', () => {
  const isBlocked = () => false;
  const path = findPath(5, 5, isBlocked, { x: 0, y: 0 }, { x: 3, y: 0 });
  assert.ok(path);
  assert.equal(path[0].x, 0);
  assert.equal(path[path.length - 1].x, 3);
  assert.equal(path.length, 4);
});

test('pathfinding: routes around a wall of blocked tiles', () => {
  // Wall across y=1 except a gap at x=4
  const blockedSet = new Set();
  for (let x = 0; x < 5; x++) if (x !== 4) blockedSet.add(`${x},1`);
  const isBlocked = (x, y) => blockedSet.has(`${x},${y}`);
  const path = findPath(5, 5, isBlocked, { x: 0, y: 0 }, { x: 0, y: 2 });
  assert.ok(path);
  // must pass through the gap at (4,1)
  assert.ok(path.some((p) => p.x === 4 && p.y === 1));
  for (const p of path) assert.ok(!isBlocked(p.x, p.y));
});

test('pathfinding: avoids a furniture-occupied tile directly in the way', () => {
  const occupied = { x: 1, y: 0 };
  const isBlocked = (x, y) => x === occupied.x && y === occupied.y;
  const path = findPath(3, 3, isBlocked, { x: 0, y: 0 }, { x: 2, y: 0 });
  assert.ok(path);
  assert.ok(!path.some((p) => p.x === occupied.x && p.y === occupied.y));
});

test('pathfinding: returns null when the goal is fully enclosed', () => {
  // Enclose (2,2) on a 5x5 grid with blocked tiles on all 4 sides
  const enclosed = ['1,2', '3,2', '2,1', '2,3'];
  const isBlocked = (x, y) => enclosed.includes(`${x},${y}`);
  const path = findPath(5, 5, isBlocked, { x: 0, y: 0 }, { x: 2, y: 2 });
  assert.equal(path, null);
});

test('pathfinding: returns null for an out-of-bounds goal', () => {
  const path = findPath(5, 5, () => false, { x: 0, y: 0 }, { x: 10, y: 10 });
  assert.equal(path, null);
});

test('pathfinding: start === goal returns a single-tile path', () => {
  const path = findPath(5, 5, () => false, { x: 2, y: 2 }, { x: 2, y: 2 });
  assert.deepEqual(path, [{ x: 2, y: 2 }]);
});

// ======================= inventory =======================

function makeTestRoom() {
  // 5x5 room: border walls on top row & left col (like real rooms), rest floor.
  const width = 5, height = 5;
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) row.push((y === 0 || x === 0) ? TILE.WALL : TILE.FLOOR);
    grid.push(row);
  }
  return { width, height, grid, placed: [] };
}

test('inventory: buying an item deducts coins and adds to inventory', () => {
  const state = createDefaultState();
  const startCoins = state.coins;
  const res = buyItem(state, 'stool');
  assert.ok(res.ok);
  assert.equal(state.coins, startCoins - getCatalogueItem('stool').price);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].itemId, 'stool');
});

test('inventory: buying fails with insufficient coins', () => {
  const state = createDefaultState();
  state.coins = 1;
  const res = buyItem(state, 'sofa');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'insufficient_coins');
});

test('inventory: buying a locked item fails until unlocked', () => {
  const state = createDefaultState();
  state.coins = 1000;
  const res = buyItem(state, 'jukebox');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'locked');
  state.unlocked.push('jukebox');
  const res2 = buyItem(state, 'jukebox');
  assert.ok(res2.ok);
});

test('inventory: placement validates bounds, walls, overlap and occupants', () => {
  const state = createDefaultState();
  const room = makeTestRoom();
  buyItem(state, 'stool'); // price 15, default coins cover it
  const instanceId = state.inventory[0].instanceId;

  // on a wall -> blocked
  const onWall = placeItem(state, room, instanceId, 0, 0, 0, []);
  assert.equal(onWall.ok, false);
  assert.equal(onWall.reason, 'blocked_tile');

  // valid floor tile
  const ok = placeItem(state, room, instanceId, 2, 2, 0, []);
  assert.ok(ok.ok);
  assert.equal(room.placed.length, 1);
  assert.equal(state.inventory.length, 0);

  // second stool overlapping the first -> blocked
  buyItem(state, 'stool');
  const instance2 = state.inventory[0].instanceId;
  const overlap = placeItem(state, room, instance2, 2, 2, 0, []);
  assert.equal(overlap.ok, false);
  assert.equal(overlap.reason, 'furniture_overlap');

  // occupant tile -> blocked
  const onOccupant = placeItem(state, room, instance2, 3, 3, 0, [{ x: 3, y: 3 }]);
  assert.equal(onOccupant.ok, false);
  assert.equal(onOccupant.reason, 'occupied');

  // out of bounds
  const oob = canPlaceAt(room, getCatalogueItem('stool'), 10, 10, 0, []);
  assert.equal(oob.ok, false);
  assert.equal(oob.reason, 'out_of_bounds');
});

test('inventory: a 2-wide sofa footprint rotates and both cells block placement', () => {
  const state = createDefaultState();
  const room = makeTestRoom();
  buyItem(state, 'sofa');
  const instanceId = state.inventory[0].instanceId;
  const placed = placeItem(state, room, instanceId, 1, 1, 0, []);
  assert.ok(placed.ok);
  const cellsFlat = footprintCells(1, 1, getCatalogueItem('sofa').footprint, 0);
  assert.deepEqual(cellsFlat, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  const rotated = rotatedFootprint(getCatalogueItem('sofa').footprint, 1);
  assert.deepEqual(rotated, { w: 1, h: 2 });

  // another item on the second occupied cell should fail
  buyItem(state, 'stool');
  const stoolId = state.inventory[0].instanceId;
  const blocked = placeItem(state, room, stoolId, 2, 1, 0, []);
  assert.equal(blocked.ok, false);
});

test('inventory: pickup returns item to inventory and frees the tile', () => {
  const state = createDefaultState();
  const room = makeTestRoom();
  buyItem(state, 'stool');
  const instanceId = state.inventory[0].instanceId;
  placeItem(state, room, instanceId, 2, 2, 0, []);
  const res = pickupItem(state, room, instanceId);
  assert.ok(res.ok);
  assert.equal(room.placed.length, 0);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].instanceId, instanceId);
});

test('inventory: moveItem relocates a placed item and validates the new spot', () => {
  const state = createDefaultState();
  const room = makeTestRoom();
  buyItem(state, 'stool');
  const a = state.inventory[0].instanceId;
  placeItem(state, room, a, 1, 1, 0, []);
  buyItem(state, 'stool');
  const b = state.inventory[0].instanceId;
  placeItem(state, room, b, 2, 2, 0, []);

  const blockedMove = moveItem(state, room, a, 2, 2, 0, []);
  assert.equal(blockedMove.ok, false);

  const okMove = moveItem(state, room, a, 3, 3, 0, []);
  assert.ok(okMove.ok);
  const moved = room.placed.find((p) => p.instanceId === a);
  assert.equal(moved.x, 3);
  assert.equal(moved.y, 3);
});

test('inventory: availableCatalogue reflects unlock state', () => {
  const state = createDefaultState();
  const list = availableCatalogue(state);
  const rug = list.find((i) => i.id === 'rug');
  assert.equal(rug.unlocked, false);
  state.unlocked.push('rug');
  const list2 = availableCatalogue(state);
  assert.equal(list2.find((i) => i.id === 'rug').unlocked, true);
});

// ======================= quests =======================

test('quests: advanceQuestsByType increments and caps progress at target', () => {
  const state = { quests: initQuestState() };
  const completed1 = advanceQuestsByType(state, 'place', 1);
  assert.deepEqual(completed1, []);
  assert.equal(state.quests.quest_place.progress, 1);
  const completed2 = advanceQuestsByType(state, 'place', 1);
  assert.deepEqual(completed2, ['quest_place']);
  assert.equal(state.quests.quest_place.complete, true);
  // further advances do not exceed target or re-trigger completion
  const completed3 = advanceQuestsByType(state, 'place', 5);
  assert.deepEqual(completed3, []);
  assert.equal(state.quests.quest_place.progress, 2);
});

test('quests: setQuestProgress sets an exact value for set-based goals', () => {
  const state = { quests: initQuestState() };
  const completed = setQuestProgress(state, 'visit', 1);
  assert.deepEqual(completed, []);
  const completed2 = setQuestProgress(state, 'visit', 2);
  assert.deepEqual(completed2, ['quest_visit']);
});

test('quests: claimReward grants coins and unlocks exactly once', () => {
  const state = createDefaultState();
  advanceQuestsByType(state, 'place', 2);
  assert.equal(state.quests.quest_place.complete, true);
  const before = state.coins;
  const reward = claimReward(state, 'quest_place');
  assert.ok(reward);
  assert.equal(state.coins, before + reward.coins);
  assert.ok(state.unlocked.includes('neon_sign'));

  // claiming again returns null and does not double-pay
  const again = claimReward(state, 'quest_place');
  assert.equal(again, null);
  assert.equal(state.coins, before + reward.coins);
});

test('quests: listQuests merges definitions with live progress', () => {
  const state = createDefaultState();
  advanceQuestsByType(state, 'sit', 1);
  const list = listQuests(state);
  const sitQuest = list.find((q) => q.id === 'quest_sit');
  assert.equal(sitQuest.progress, 1);
  assert.equal(sitQuest.complete, true);
  assert.equal(sitQuest.title, 'Rooftop Relaxation');
});

// ======================= save / load =======================

test('save/load: round-trips a modified state through a fake localStorage', () => {
  const storage = makeFakeStorage();
  const state = createDefaultState();
  state.coins = 123;
  state.player.room = 'rooftop';
  state.player.x = 4;
  state.player.y = 3;
  buyItem(state, 'plant');
  const coinsAfterBuy = state.coins;

  saveState(storage, state);
  const loaded = loadState(storage);
  assert.equal(loaded.coins, coinsAfterBuy);
  assert.equal(loaded.player.room, 'rooftop');
  assert.equal(loaded.player.x, 4);
  assert.equal(loaded.inventory.length, 1);
  assert.equal(loaded.version, SAVE_VERSION);
});

test('save/load: missing save returns a fresh default state', () => {
  const storage = makeFakeStorage();
  const loaded = loadState(storage);
  assert.equal(loaded.coins, createDefaultState().coins);
  assert.equal(loaded.player.room, 'lobby');
});

test('save/load: corrupt JSON falls back to default state without throwing', () => {
  const storage = makeFakeStorage({ [SAVE_KEY]: '{not valid json::' });
  assert.doesNotThrow(() => loadState(storage));
  const loaded = loadState(storage);
  assert.equal(loaded.player.room, 'lobby');
});

test('save/load: structurally implausible data falls back to default state', () => {
  const storage = makeFakeStorage({ [SAVE_KEY]: JSON.stringify({ hello: 'world' }) });
  const loaded = loadState(storage);
  assert.equal(loaded.coins, createDefaultState().coins);
});

test('save/load: old-version save is migrated forward and filled with defaults', () => {
  const storage = makeFakeStorage({
    [SAVE_KEY]: JSON.stringify({ version: 0, coins: 999 }),
  });
  const loaded = loadState(storage);
  assert.equal(loaded.version, SAVE_VERSION);
  assert.equal(loaded.coins, 999);
  assert.ok(loaded.rooms.lobby);
  assert.ok(loaded.quests.quest_greet);
});

test('save/load: resetState clears storage and returns a default state', () => {
  const storage = makeFakeStorage();
  const state = createDefaultState();
  state.coins = 500;
  saveState(storage, state);
  const reset = resetState(storage);
  assert.equal(reset.coins, createDefaultState().coins);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

// ======================= npc dialogue =======================

test('npc: keyword matching returns a themed reply, unmatched falls back gracefully', () => {
  const npcDef = {
    keywords: { hello: ['Hi there!'], quest: ['Quests are fun.'] },
  };
  assert.equal(respondToMessage(npcDef, 'Hello!', () => 0), 'Hi there!');
  assert.equal(respondToMessage(npcDef, 'tell me about your QUEST', () => 0), 'Quests are fun.');
  const fallback = respondToMessage(npcDef, 'xyzzy', () => 0);
  assert.equal(typeof fallback, 'string');
  assert.ok(fallback.length > 0);
});

// ======================= room data sanity =======================

test('data: both rooms have a reachable floor path from spawn to their door', () => {
  for (const room of Object.values(ROOMS)) {
    const isBlocked = (x, y) => room.grid[y][x] === TILE.WALL || room.grid[y][x] === TILE.WINDOW;
    const door = room.doors[0];
    const path = findPath(room.width, room.height, isBlocked, room.spawn, { x: door.x, y: door.y });
    assert.ok(path, `expected a path from spawn to door in ${room.id}`);
  }
});
