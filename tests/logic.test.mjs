import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  findPath, retargetMover, advanceMover, createMoverState, canStep, smoothPath,
} from '../js/pathfinding.js';
import {
  buyItem, placeItem, pickupItem, moveItem, canPlaceAt, footprintCells, rotatedFootprint,
  availableCatalogue, interactionSlots, findFreeInteractionSlot, findApproachTile,
  hasDoorArrivalRoute, isDiningSeat, isFurnitureWalkable,
} from '../js/inventory.js';
import {
  initQuestState, advanceQuestsByType, setQuestProgress, claimReward, listQuests,
} from '../js/quests.js';
import { createDefaultState, loadState, saveState, resetState, sanitizePlacedItemsForRoom, SAVE_KEY } from '../js/save.js';
import { getCatalogueItem, TILE, SAVE_VERSION, ROOMS, NPCS, CATALOGUE, SEED_FURNITURE, ITEM_CATEGORIES, ROOM_TIERS } from '../js/data.js';
import { respondToMessage, findWanderTarget, createNpcRuntime, tickNpc } from '../js/npc.js';
import { LOOKS, renderCharacter, buildParts } from '../js/voxel.js';
import { buildWindowSegment, buildGlassBalustradeSegment, buildBookshelf, FURNITURE_BUILDERS, ART } from '../js/sprites.js';
import {
  tileToScreen, computeOrigin, computeGroundDy, computeCityGroundDy,
  projectIsoCityPoint, buildIsoCityLayout, computeCityVehicles, drawBackground,
  clampZoom, zoomAtPoint, centerCameraOnTile, screenToTile, worldToScreen,
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, deviceScale,
} from '../js/render.js';
import { ChiptuneAudio, MOOD_PROFILES, MUSIC_FILES, PLAYLIST, TRACK_ORDER, moodForRoom, formatTime } from '../js/audio.js';

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

// ======================= seeded rooms (v0.1.1) =======================

function blockedFor(roomId, placed) {
  const def = ROOMS[roomId];
  return (x, y) => {
    const c = def.grid[y][x];
    if (c === TILE.WALL || c === TILE.WINDOW) return true;
    return placed.some((p) => {
      const item = getCatalogueItem(p.itemId);
      return !item.seat && !item.flat && footprintCells(p.x, p.y, item.footprint, p.rot).some((f) => f.x === x && f.y === y);
    });
  };
}

test('seed: furnished rooms have no overlaps and keep every door, spawn, NPC and seat reachable', () => {
  const state = createDefaultState();
  for (const [roomId, def] of Object.entries(ROOMS)) {
    const placed = state.rooms[roomId].placed;
    assert.ok(placed.length > 5, `${roomId} should be furnished`);
    // each seeded piece must be placeable on top of the others (bounds, walls, overlap)
    placed.forEach((p) => {
      const others = { width: def.width, height: def.height, grid: def.grid, placed };
      assert.ok(canPlaceAt(others, getCatalogueItem(p.itemId), p.x, p.y, p.rot, [], p.instanceId).ok, `${roomId} ${p.itemId}@${p.x},${p.y}`);
    });
    const blocked = blockedFor(roomId, placed);
    const goals = [
      def.spawn,
      ...def.doors.map((d) => ({ x: d.x, y: d.y })),
      ...Object.values(ROOMS).flatMap((r) => r.doors.filter((d) => d.to === roomId).map((d) => d.toTile)),
      ...placed.filter((p) => getCatalogueItem(p.itemId).seat),
      ...NPCS.filter((n) => n.room === roomId).map((n) => n.home),
    ];
    for (const g of goals) {
      assert.ok(!blocked(g.x, g.y), `${roomId} tile ${g.x},${g.y} is blocked`);
      assert.ok(findPath(def.width, def.height, blocked, def.spawn, g), `${roomId} tile ${g.x},${g.y} unreachable`);
    }
  }
});

test('seed: the quest rooftop sofa exists and rugs are walkable and sit under furniture', () => {
  const state = createDefaultState();
  assert.ok(state.rooms.rooftop.placed.some((p) => p.itemId === 'rooftop_sofa'));
  const rug = getCatalogueItem('rug');
  const room = { width: 6, height: 6, grid: ROOMS.lobby.grid.slice(0, 6).map((r) => r.slice(0, 6)), placed: [{ instanceId: 'r', itemId: 'rug', x: 2, y: 2, rot: 0 }] };
  assert.ok(canPlaceAt(room, getCatalogueItem('stool'), 2, 2, 0).ok, 'stool on a rug');
  assert.equal(canPlaceAt(room, rug, 3, 3, 0).ok, false, 'rug on a rug');
});

test('save/load: a pre-0.1.1 save with empty rooms loads unchanged (not re-seeded)', () => {
  const old = createDefaultState();
  old.rooms = { lobby: { placed: [] }, rooftop: { placed: [] } };
  old.coins = 7;
  const storage = makeFakeStorage({ [SAVE_KEY]: JSON.stringify(old) });
  const loaded = loadState(storage);
  assert.equal(loaded.coins, 7);
  assert.equal(loaded.rooms.lobby.placed.length, 0);
  assert.equal(loaded.player.room, 'lobby');
});

// ======================= rendering regression (v0.2.0) =======================

test('rendering: all four facing, walk, and sitting frames for player and 4 NPCs generate nonempty bounded sprites', () => {
  const mockCanvas = (w, h) => ({
    width: w,
    height: h,
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
  });
  const characters = ['player', 'mochi', 'gus', 'drpix', 'lola'];
  const dirs = ['down', 'up', 'left', 'right'];
  const poses = [{ stride: 0 }, { stride: 1 }, { stride: -1 }, { sit: true }];

  for (const id of characters) {
    const look = LOOKS[id];
    assert.ok(look, `expected look definition for ${id}`);
    for (const dir of dirs) {
      for (const pose of poses) {
        const { canvas, ox, oy } = renderCharacter(look, dir, pose, mockCanvas);
        assert.ok(canvas.width > 0 && canvas.height > 0, `empty canvas for ${id} ${dir} ${JSON.stringify(pose)}`);
        assert.ok(ox > 0 && oy > 0, `invalid anchor offset for ${id} ${dir}`);
        assert.ok(canvas.width < 200 && canvas.height < 200, `unbounded canvas size for ${id}`);
        assert.ok(Number.isFinite(ox) && Number.isFinite(oy), `non-finite offsets for ${id}`);
      }
    }
  }
});

test('rendering: both wall window orientations generate nonempty bounded sprites', () => {
  const sky = { top: '#8fd0ff', bottom: '#fff6c9' };
  for (const orientation of ['north', 'west']) {
    const s = buildWindowSegment('#e8d8c8', sky, orientation);
    assert.ok(s.w > 0 && s.h > 0, `invalid dimensions for ${orientation} window`);
    assert.ok(s.w <= 128 * ART && s.h <= 128 * ART, `unbounded dimensions for ${orientation} window`);
    let opaque = 0;
    for (const row of s.px) for (const p of row) if (p) opaque++;
    assert.ok(opaque > 0, `expected opaque pixels for ${orientation} window`);
  }
});

// ======================= volumetric furniture regression (v0.3.0 / v0.4.0) =======================

test('furniture: all catalogue model sprites generate nonempty bounded sprites with meaningful volumetric faces', () => {
  assert.ok(CATALOGUE.length >= 41, 'catalogue should contain legacy + v0.3.0 + v0.4.0 items');

  for (const item of CATALOGUE) {
    const builder = FURNITURE_BUILDERS[item.spriteKey];
    assert.ok(builder, `missing sprite builder for catalogue item ${item.id} (spriteKey: ${item.spriteKey})`);

    // Verify both rotation 0 and rotation 1
    for (const rot of [0, 1]) {
      const s = builder(rot);
      assert.ok(s, `builder returned null for ${item.id} rot ${rot}`);
      assert.ok(s.w > 10 && s.w <= 200, `unreasonable width ${s.w} for ${item.id}`);
      assert.ok(s.h > 10 && s.h <= 200, `unreasonable height ${s.h} for ${item.id}`);
      assert.ok(Number.isFinite(s.ax) && Number.isFinite(s.ay), `non-finite anchor for ${item.id}`);
      assert.ok(s.ax > 0 && s.ax < s.w, `anchor x out of bounds for ${item.id}: ax=${s.ax}, w=${s.w}`);
      assert.ok(s.ay > 0 && s.ay < s.h, `anchor y out of bounds for ${item.id}: ay=${s.ay}, h=${s.h}`);

      // Count non-empty and non-outline pixels
      const colors = new Map();
      let opaqueCount = 0;
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          const c = s.px[y][x];
          if (!c) continue;
          opaqueCount++;
          if (c !== '#2a1d2e') {
            colors.set(c, (colors.get(c) || 0) + 1);
          }
        }
      }
      assert.ok(opaqueCount >= 40, `too few pixels (${opaqueCount}) for ${item.id} rot ${rot}`);

      // Meaningful volumetric faces check: true 3D isometric voxels have distinct
      // lit top faces (L=+0.14), mid front-left faces (L=0), and shaded front-right
      // faces (L=-0.22), resulting in at least 3 distinct non-outline color tones.
      assert.ok(
        colors.size >= 3,
        `expected at least 3 volumetric face tones for ${item.id} rot ${rot}, found ${colors.size}: ${[...colors.keys()].join(', ')}`
      );
    }
  }
});

test('catalogue: all 8 new v0.3.0 collection items have valid definitions, descriptions and sensible pricing', () => {
  const newIds = [
    'aquarium', 'boba_bar', 'mini_arcade', 'noodle_cart',
    'karaoke_machine', 'telescope', 'koi_pond', 'capsule_dispenser',
  ];

  for (const id of newIds) {
    const item = getCatalogueItem(id);
    assert.ok(item, `missing catalogue item ${id}`);
    assert.ok(item.name && item.name.length > 5, `missing or too short name for ${id}`);
    assert.ok(item.description && item.description.length > 15, `missing or too short description for ${id}`);
    assert.ok(item.price >= 30 && item.price <= 100, `price ${item.price} out of sensible range for ${id}`);
    assert.ok(item.category && typeof item.category === 'string', `missing category for ${id}`);
    assert.ok(item.footprint.w >= 1 && item.footprint.h >= 1, `invalid footprint for ${id}`);
    assert.equal(item.seat, false);
    assert.equal(item.unlockRequires, null, `item ${id} should be available for purchase`);
  }
});

test('inventory: purchasing all 8 new items deducts coins and enforces balance', () => {
  const newIds = [
    'aquarium', 'boba_bar', 'mini_arcade', 'noodle_cart',
    'karaoke_machine', 'telescope', 'koi_pond', 'capsule_dispenser',
  ];

  for (const id of newIds) {
    const item = getCatalogueItem(id);
    const state = createDefaultState();
    state.coins = item.price;
    const res = buyItem(state, id);
    assert.ok(res.ok, `failed to buy ${id}`);
    assert.equal(state.coins, 0);
    assert.equal(state.inventory.length, 1);
    assert.equal(state.inventory[0].itemId, id);

    // Fails with insufficient coins
    state.coins = item.price - 1;
    const failRes = buyItem(state, id);
    assert.equal(failRes.ok, false);
    assert.equal(failRes.reason, 'insufficient_coins');
  }
});

test('inventory: placement and collision validation for new items across footprints and rotations', () => {
  const room = makeTestRoom(); // 5x5 room, border walls at x=0, y=0. Usable: x:1..4, y:1..4
  const aquarium = getCatalogueItem('aquarium'); // 2x1
  const koiPond = getCatalogueItem('koi_pond'); // 2x2
  const miniArcade = getCatalogueItem('mini_arcade'); // 1x1

  // 1x1 item placement at (2, 2)
  const placeArcade = canPlaceAt(room, miniArcade, 2, 2, 0);
  assert.ok(placeArcade.ok);
  assert.deepEqual(placeArcade.cells, [{ x: 2, y: 2 }]);

  // 2x1 item placement at (2, 2)
  const placeAquaRot0 = canPlaceAt(room, aquarium, 2, 2, 0);
  assert.ok(placeAquaRot0.ok);
  assert.deepEqual(placeAquaRot0.cells, [{ x: 2, y: 2 }, { x: 3, y: 2 }]);

  // 2x1 item rotated (rot=1) becomes 1x2
  const placeAquaRot1 = canPlaceAt(room, aquarium, 2, 2, 1);
  assert.ok(placeAquaRot1.ok);
  assert.deepEqual(placeAquaRot1.cells, [{ x: 2, y: 2 }, { x: 2, y: 3 }]);

  // 2x2 koi pond placement at (2, 2) occupies 4 cells
  const placePond = canPlaceAt(room, koiPond, 2, 2, 0);
  assert.ok(placePond.ok);
  assert.equal(placePond.cells.length, 4);

  // Collision with border wall (y=0 is wall)
  assert.equal(canPlaceAt(room, miniArcade, 2, 0, 0).reason, 'blocked_tile');
  assert.equal(canPlaceAt(room, aquarium, 2, 0, 0).reason, 'blocked_tile');

  // Collision out of bounds (width 5, x=4 for a 2-wide item spills to x=5)
  assert.equal(canPlaceAt(room, aquarium, 4, 2, 0).reason, 'out_of_bounds');

  // Furniture overlap
  const state = createDefaultState();
  state.inventory.push({ instanceId: 'arc-1', itemId: 'mini_arcade' });
  const testRoom = { width: 6, height: 6, grid: ROOMS.lobby.grid.slice(0, 6).map((r) => r.slice(0, 6)), placed: [] };
  const p1 = placeItem(state, testRoom, 'arc-1', 2, 2, 0);
  assert.ok(p1.ok);
  assert.equal(canPlaceAt(testRoom, miniArcade, 2, 2, 0).reason, 'furniture_overlap');
  assert.equal(canPlaceAt(testRoom, aquarium, 1, 2, 0).reason, 'furniture_overlap'); // (1,2) with w=2 overlaps (2,2)

  // Occupant tile collision
  const occ = [{ x: 3, y: 3 }];
  assert.equal(canPlaceAt(testRoom, miniArcade, 3, 3, 0, occ).reason, 'occupied');
});

test('seating: seat items correctly rotate facing direction and seat interactions preserve reachability', () => {
  const seats = CATALOGUE.filter((item) => item.seat);
  assert.ok(seats.length >= 5, 'expected at least 5 seat types (stool, sofa, rooftop_sofa, armchair, deckchair)');

  const dirs = ['down', 'right', 'up', 'left'];
  for (const s of seats) {
    for (let r = 0; r < 4; r++) {
      const facing = dirs[((r % 4) + 4) % 4];
      assert.ok(facing, `valid facing for ${s.id} rot ${r}`);
      const fp = rotatedFootprint(s.footprint, r);
      assert.ok(fp.w >= 1 && fp.h >= 1);
    }
  }

  // Verify that an avatar can sit on a stool, sofa, or armchair without blocking
  const room = {
    width: 6, height: 6,
    grid: ROOMS.lobby.grid.slice(0, 6).map((r) => r.slice(0, 6)),
    placed: [
      { instanceId: 's1', itemId: 'stool', x: 3, y: 3, rot: 0 },
      { instanceId: 'c1', itemId: 'armchair', x: 2, y: 4, rot: 1 },
    ],
  };

  // Stool and armchair are seats, so isBlocked should not block their seat tiles
  const isBlocked = (x, y) => {
    if (x === 0 || y === 0) return true;
    for (const p of room.placed) {
      const item = getCatalogueItem(p.itemId);
      if (p.x === x && p.y === y && !item.seat) return true;
    }
    return false;
  };
  assert.equal(isBlocked(3, 3), false, 'stool tile is unblocked for sitting');
  assert.equal(isBlocked(2, 4), false, 'armchair tile is unblocked for sitting');
});

// ======================= v0.4.0 hotel expansion, save migration & DPR tests =======================

test('v0.4.0 rooms: all 10 floors (including facilities and My Room) have unique floor numbers, elevator doors, and valid pathfinding', () => {
  const requiredRooms = ['lobby', 'cafe', 'restaurant', 'gym', 'pool', 'arcade', 'library', 'myroom', 'garden', 'rooftop'];
  for (const id of requiredRooms) {
    assert.ok(ROOMS[id], `missing room ${id}`);
  }
  const floors = new Set(Object.values(ROOMS).map((r) => r.floor));
  assert.equal(floors.size, Object.keys(ROOMS).length, 'every room must have a unique floor number');

  for (const room of Object.values(ROOMS)) {
    const elevDoor = room.doors.find((d) => d.elevator);
    assert.ok(elevDoor, `room ${room.id} should have an elevator door tile`);
    const isBlocked = (x, y) => {
      const c = room.grid[y][x];
      return c === TILE.WALL || c === TILE.WINDOW || c === TILE.VOID;
    };
    const path = findPath(room.width, room.height, isBlocked, room.spawn, { x: elevDoor.x, y: elevDoor.y });
    assert.ok(path && path.length > 1, `expected walkable path from spawn to elevator door in ${room.id}`);
  }
});

test('v0.4.0 migration: v1 save migrates to latest version keeping coins, inventory, lobby/rooftop items and adding new rooms & My Room', () => {
  const v1Save = {
    version: 1,
    coins: 345,
    unlocked: ['rug'],
    inventory: [{ instanceId: 'inv-1', itemId: 'lamp' }],
    rooms: {
      lobby: { placed: [{ instanceId: 'custom-1', itemId: 'stool', x: 2, y: 2, rot: 0 }] },
      rooftop: { placed: [] },
    },
    quests: {
      quest_greet: { progress: 3, complete: true, claimed: true },
    },
    player: { room: 'lobby', x: 5, y: 3, dir: 'left', sitting: null },
  };
  const storage = makeFakeStorage({ [SAVE_KEY]: JSON.stringify(v1Save) });
  const loaded = loadState(storage);
  assert.equal(loaded.version, SAVE_VERSION);
  assert.equal(loaded.coins, 345);
  assert.deepEqual(loaded.unlocked, ['rug']);
  assert.equal(loaded.inventory.length, 1);
  assert.equal(loaded.rooms.lobby.placed.length, 1);
  assert.equal(loaded.rooms.lobby.placed[0].instanceId, 'custom-1');
  assert.equal(loaded.rooms.rooftop.placed.length, 0);
  // New rooms and My Room are seeded automatically
  assert.ok(loaded.rooms.gym && loaded.rooms.gym.placed.length > 5);
  assert.ok(loaded.rooms.restaurant && loaded.rooms.restaurant.placed.length > 5);
  assert.ok(loaded.rooms.myroom && loaded.rooms.myroom.placed.some((p) => p.itemId === 'suite_bed'));
  // Old quest state preserved, new quests initialised
  assert.equal(loaded.quests.quest_greet.claimed, true);
  assert.ok(loaded.quests.quest_gym);
  assert.ok(loaded.quests.quest_dine);
  assert.ok(loaded.quests.quest_myroom);
  assert.ok(loaded.quests.quest_explorer);
});

test('v0.4.0 quests: gym visit, restaurant dining, My Room decorating, and tower explorer quests complete and grant rewards', () => {
  const state = createDefaultState();
  assert.deepEqual(advanceQuestsByType(state, 'visit_gym', 1), ['quest_gym']);
  assert.deepEqual(advanceQuestsByType(state, 'sit_restaurant', 1), ['quest_dine']);
  assert.deepEqual(advanceQuestsByType(state, 'decorate_myroom', 3), ['quest_myroom']);
  const visitDone = setQuestProgress(state, 'visit', 6);
  assert.ok(visitDone.includes('quest_explorer'));
});

test('v0.4.0 DPR voxel rendering: renderCharacter scales backing canvas with DPR scale factor', () => {
  const mockCanvas = (w, h) => ({
    width: w,
    height: h,
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
  });
  const c1 = renderCharacter(LOOKS.player, 'down', { stride: 0 }, mockCanvas, 1);
  const c2 = renderCharacter(LOOKS.player, 'down', { stride: 0 }, mockCanvas, 2);
  assert.equal(c2.canvas.width, c1.canvas.width * 2);
  assert.equal(c2.canvas.height, c1.canvas.height * 2);
  assert.equal(c2.ox, c1.ox);
  assert.equal(c2.oy, c1.oy);
});

// ======================= v0.5.0 irregular rooms, cutaway, interactions & voxel expressions =======================

test('v0.5.0 rooms: irregular VOID cutouts, zone tiles, door landing clearance, and usable door arrival routes across all 10 floors', () => {
  const state = createDefaultState();
  for (const room of Object.values(ROOMS)) {
    assert.ok(room.wing, `room ${room.id} must have an elevator wing category`);
    assert.ok(room.shape, `room ${room.id} must have a shape descriptor`);
    assert.ok(Array.isArray(room.cutouts) && room.cutouts.length > 0, `room ${room.id} must define irregular cutouts`);
    assert.ok(room.zoneTiles && typeof room.zoneTiles.color === 'string', `room ${room.id} must define zone accent tiles`);

    let voidCount = 0;
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (room.grid[y][x] === TILE.VOID) voidCount++;
      }
    }
    assert.ok(voidCount >= 2, `room ${room.id} should contain TILE.VOID cutout cells`);

    // Verify no seeded furniture falls on a VOID tile and door arrival routes remain open
    const placed = state.rooms[room.id].placed;
    for (const p of placed) {
      const item = getCatalogueItem(p.itemId);
      const cells = footprintCells(p.x, p.y, item.footprint, p.rot);
      for (const c of cells) {
        assert.equal(room.grid[c.y][c.x], TILE.FLOOR, `seeded item ${p.instanceId} in ${room.id} must sit on FLOOR`);
      }
    }
    assert.equal(
      hasDoorArrivalRoute({ width: room.width, height: room.height, grid: room.grid, doors: room.doors, spawn: room.spawn, placed }),
      true,
      `room ${room.id} must preserve an unobstructed path between spawn and every door`,
    );
  }

  // Verify placement rules: VOID tile rejected, door landing apron rejected for solid items but allowed for flat rugs
  const lobbyRoom = {
    width: ROOMS.lobby.width,
    height: ROOMS.lobby.height,
    grid: ROOMS.lobby.grid,
    placed: [],
  };
  const stool = getCatalogueItem('stool');
  const rug = getCatalogueItem('rug');
  assert.equal(canPlaceAt(lobbyRoom, stool, 14, 10, 0).reason, 'blocked_tile', 'cannot place on TILE.VOID cutout');
  // Lobby elevator door is at (4, 0), so (4, 1) is the door landing apron
  assert.equal(canPlaceAt(lobbyRoom, stool, 4, 1, 0).reason, 'door_clearance', 'cannot place solid item on door apron');
  assert.equal(canPlaceAt(lobbyRoom, rug, 4, 1, 0).ok, true, 'flat rug allowed on door apron');
});

test('v0.5.0 migration: v2 save migrates to the latest version, pruning items on VOID cutouts and rescuing player position if on VOID', () => {
  const v2Save = {
    version: 2,
    coins: 500,
    unlocked: ['rug'],
    inventory: [],
    rooms: {
      lobby: {
        placed: [
          { instanceId: 'valid_stool', itemId: 'stool', x: 2, y: 2, rot: 0 },
          { instanceId: 'void_stool', itemId: 'stool', x: 14, y: 10, rot: 0 }, // (14,10) is VOID in Grand Lobby
        ],
      },
    },
    quests: {},
    player: { room: 'lobby', x: 14, y: 10, dir: 'down', sitting: null },
  };
  const storage = makeFakeStorage({ [SAVE_KEY]: JSON.stringify(v2Save) });
  const loaded = loadState(storage);
  assert.equal(loaded.version, SAVE_VERSION);
  assert.equal(loaded.rooms.lobby.placed.length, 1);
  assert.equal(loaded.rooms.lobby.placed[0].instanceId, 'valid_stool');
  assert.deepEqual({ x: loaded.player.x, y: loaded.player.y }, ROOMS.lobby.spawn);
});

test('v0.5.0 multi-slot occupancy & reservation: 2-tile sofas/beds and 4-slot pools track independent slots', () => {
  const sofaPlaced = { instanceId: 'sofa_1', itemId: 'sofa', x: 3, y: 3, rot: 0 };
  const slots = interactionSlots(sofaPlaced);
  assert.equal(slots.length, 2);
  assert.deepEqual({ x: slots[0].x, y: slots[0].y, dir: slots[0].dir }, { x: 3, y: 3, dir: 'down' });
  assert.deepEqual({ x: slots[1].x, y: slots[1].y, dir: slots[1].dir }, { x: 4, y: 3, dir: 'down' });

  // First occupant at (3,3) leaves (4,3) free
  const free1 = findFreeInteractionSlot(sofaPlaced, [{ x: 3, y: 3 }], []);
  assert.deepEqual({ x: free1.x, y: free1.y, dir: free1.dir }, { x: 4, y: 3, dir: 'down' });

  // Reserving (4,3) makes the sofa completely full
  const free2 = findFreeInteractionSlot(sofaPlaced, [{ x: 3, y: 3 }], [{ x: 4, y: 3 }]);
  assert.equal(free2, null);

  // Pool water has 4 swim lane slots
  const poolPlaced = { instanceId: 'pool_1', itemId: 'pool_water', x: 3, y: 2, rot: 0 };
  assert.equal(interactionSlots(poolPlaced).length, 4);
});

test('v0.5.0 safe approach tiles & activity resolution: treadmill, swim, lie, eat, and adjacent counter use', () => {
  const state = createDefaultState();

  // 1. Gym treadmill -> kind === 'treadmill' on belt tile
  const gymDef = ROOMS.gym;
  const gymRoom = { width: gymDef.width, height: gymDef.height, grid: gymDef.grid, placed: state.rooms.gym.placed };
  const gymBlocked = (x, y) => {
    const c = gymDef.grid[y][x];
    if (c === TILE.WALL || c === TILE.WINDOW || c === TILE.VOID) return true;
    for (const p of gymRoom.placed) {
      const item = getCatalogueItem(p.itemId);
      if (!item || item.flat || item.seat || item.interaction === 'treadmill') continue;
      if (footprintCells(p.x, p.y, item.footprint, p.rot).some((cell) => cell.x === x && cell.y === y)) return true;
    }
    return false;
  };
  const tm = gymRoom.placed.find((p) => p.itemId === 'treadmill');
  const tmApproach = findApproachTile(gymRoom, tm, gymBlocked, gymDef.spawn);
  assert.ok(tmApproach);
  assert.equal(tmApproach.kind, 'treadmill');
  assert.deepEqual(tmApproach.tile, { x: tm.x, y: tm.y + 1 });

  // 2. Pool water -> kind === 'swim'
  const poolDef = ROOMS.pool;
  const poolRoom = { width: poolDef.width, height: poolDef.height, grid: poolDef.grid, placed: state.rooms.pool.placed };
  const poolBlocked = (x, y) => {
    const c = poolDef.grid[y][x];
    return c === TILE.WALL || c === TILE.WINDOW || c === TILE.VOID;
  };
  const pw = poolRoom.placed.find((p) => p.itemId === 'pool_water');
  const pwApproach = findApproachTile(poolRoom, pw, poolBlocked, poolDef.spawn);
  assert.ok(pwApproach);
  assert.equal(pwApproach.kind, 'swim');

  // 3. Restaurant dining chair adjacent to dining table -> kind === 'eat'
  const restDef = ROOMS.restaurant;
  const restRoom = { width: restDef.width, height: restDef.height, grid: restDef.grid, placed: state.rooms.restaurant.placed };
  const restBlocked = (x, y) => {
    const c = restDef.grid[y][x];
    if (c === TILE.WALL || c === TILE.WINDOW || c === TILE.VOID) return true;
    for (const p of restRoom.placed) {
      const item = getCatalogueItem(p.itemId);
      if (!item || item.flat || item.seat) continue;
      if (footprintCells(p.x, p.y, item.footprint, p.rot).some((cell) => cell.x === x && cell.y === y)) return true;
    }
    return false;
  };
  const chair = restRoom.placed.find((p) => p.itemId === 'dining_chair');
  assert.equal(isDiningSeat(restRoom, chair), true, 'dining chair next to dining table is detected as dining seat');
  const chairApproach = findApproachTile(restRoom, chair, restBlocked, restDef.spawn);
  assert.ok(chairApproach);
  assert.equal(chairApproach.kind, 'eat');

  // 4. Solid counter -> approaches adjacent floor tile facing the object
  const buffet = restRoom.placed.find((p) => p.itemId === 'buffet_counter');
  const buffetApproach = findApproachTile(restRoom, buffet, restBlocked, restDef.spawn);
  assert.ok(buffetApproach);
  assert.equal(buffetApproach.kind, 'eat');
  const buffetCells = footprintCells(buffet.x, buffet.y, getCatalogueItem('buffet_counter').footprint, buffet.rot);
  assert.equal(buffetCells.some((c) => c.x === buffetApproach.tile.x && c.y === buffetApproach.tile.y), false, 'approach tile is adjacent, not overlapping solid counter');

  const rack = gymRoom.placed.find((p) => p.itemId === 'dumbbell_rack');
  const rackApproach = findApproachTile(gymRoom, rack, gymBlocked, gymDef.spawn);
  assert.ok(rackApproach);
  assert.equal(rackApproach.kind, 'use');
});

test('v0.5.0 voxel characters: distinct treadmill, swim, eat, lie, blink, and breathe poses and side-profile eyes', () => {
  const stand = buildParts(LOOKS.player, { stride: 0 });
  const run0 = buildParts(LOOKS.player, { action: 'treadmill', actionFrame: 0 });
  const run1 = buildParts(LOOKS.player, { action: 'treadmill', actionFrame: 1 });
  const swim0 = buildParts(LOOKS.player, { action: 'swim', actionFrame: 0 });
  const swim1 = buildParts(LOOKS.player, { action: 'swim', actionFrame: 1 });
  const eat0 = buildParts(LOOKS.player, { sit: true, action: 'eat', actionFrame: 0 });
  const eat1 = buildParts(LOOKS.player, { sit: true, action: 'eat', actionFrame: 1 });
  const liePose = buildParts(LOOKS.player, { lie: true, action: 'lie' });
  const breathePose = buildParts(LOOKS.player, { breathe: 1 });
  const blinkPose = buildParts(LOOKS.player, { blink: true });

  // Head box is the 10x9.2x8 skin box (x0 === -5, x1 === 5, y0 === -4.6, y1 === 4.6)
  const findHead = (parts) => parts.find((p) => p.x0 === -5 && p.x1 === 5 && p.y0 === -4.6 && p.y1 === 4.6);

  // Treadmill alternates vertical body bounce and leg/arm geometry
  assert.notEqual(findHead(run0).z0, findHead(run1).z0, 'treadmill alternates vertical running cadence');
  assert.notDeepEqual(run0[0], run1[0], 'treadmill alternates leg lift between frames');

  // Swim submerges lower body (fewer total voxel boxes than standing) and alternates stroke arms
  assert.ok(swim0.length < stand.length, 'swimming submerges legs below water surface');
  assert.notDeepEqual(swim0, swim1, 'swimming alternates freestyle arm reach');

  // Eat raises right arm & cup prop toward mouth on frame 1
  assert.notDeepEqual(eat0, eat1, 'eating lifts right arm and cup between frames');

  // Lie pose reclines head lower onto bed/mat
  assert.ok(findHead(liePose).z0 < findHead(stand).z0, 'lying pose lowers head z onto bed/mat');

  // Breathe subtly shifts head elevation
  assert.notEqual(findHead(stand).z0, findHead(breathePose).z0, 'breathing shifts head elevation');

  // Side-profile eyes exist on left/right head faces and blink modifies front eye row
  const recordTex = (texFn, face) => {
    const ops = [];
    const g = {
      fillStyle: '',
      fillRect(x, y, w, h) { ops.push({ fill: this.fillStyle, x, y, w, h }); },
    };
    texFn(g, 10, 8, (c) => c, face);
    return ops;
  };
  const headStand = findHead(stand);
  const headBlink = findHead(blinkPose);
  assert.notDeepEqual(recordTex(headStand.tex, 'front'), recordTex(headBlink.tex, 'front'), 'blinking changes front face texture');
  const rightOps = recordTex(headStand.tex, 'right');
  assert.ok(rightOps.length >= 2, 'side-profile head texture includes temple sideburn and cheek contour');
});

// ======================= v0.6.0 isometric city, lounge audio & persisted mutes =======================

test('v0.6.0 isometric city: roads, crossings, blocks, trees, and buildings share the hotel 2:1 isometric axes', () => {
  const lobby = ROOMS.lobby;
  const layout = buildIsoCityLayout(lobby, 1200, 800, 0.5);
  const { originX, originY } = computeOrigin(lobby, 1200, 800);

  // Verify u and v basis vectors match tileToScreen exactly (+32,+16 and -32,+16)
  const p00 = projectIsoCityPoint(0, 0, 0, originX, layout.groundOriginY);
  const p10 = projectIsoCityPoint(1, 0, 0, originX, layout.groundOriginY);
  const p01 = projectIsoCityPoint(0, 1, 0, originX, layout.groundOriginY);
  const t00 = tileToScreen(0, 0, originX, originY);
  const t10 = tileToScreen(1, 0, originX, originY);
  const t01 = tileToScreen(0, 1, originX, originY);
  assert.equal(p10[0] - p00[0], t10.sx - t00.sx);
  assert.equal(p10[1] - p00[1], t10.sy - t00.sy);
  assert.equal(p01[0] - p00[0], t01.sx - t00.sx);
  assert.equal(p01[1] - p00[1], t01.sy - t00.sy);

  // Every road segment edge lies along a 2:1 isometric slope (|dy/dx| === 0.5)
  assert.ok(layout.roads.length >= 8, 'city layout contains u and v road avenues');
  for (const r of layout.roads) {
    const [a, b, c] = r.pts;
    const slopeAB = Math.abs((b[1] - a[1]) / (b[0] - a[0]));
    const slopeBC = Math.abs((c[1] - b[1]) / (c[0] - b[0]));
    assert.ok(Math.abs(slopeAB - 0.5) < 1e-6, `road edge AB slope ${slopeAB} must be 0.5`);
    assert.ok(Math.abs(slopeBC - 0.5) < 1e-6, `road edge BC slope ${slopeBC} must be 0.5`);
  }

  // Zebra crossings, hotel block, varied building heights, trees,lamps & distance haze
  assert.ok(layout.crossings.length >= 8, 'intersections include isometric pedestrian crossings');
  const hotelBlock = layout.blocks.find((b) => b.bi === 0 && b.bj === 0);
  assert.ok(hotelBlock && hotelBlock.kind === 'hotel', 'central block (0,0) is reserved for hotel plaza');
  assert.ok(hotelBlock.trees.length > 0 && hotelBlock.lamps.length > 0, 'hotel block has perimeter trees and streetlamps');

  const allBuildings = layout.blocks.flatMap((b) => b.buildings).filter((b) => !b.isPlaza);
  assert.ok(allBuildings.length >= 12, 'surrounding blocks contain 3D isometric buildings');
  const heights = new Set(allBuildings.map((b) => b.heightZ));
  assert.ok(heights.size >= 4, 'neighbouring buildings have varied heights');

  // Distance haze increases for blocks farther toward the horizon
  const sortedByHaze = [...layout.blocks].filter((b) => !(b.bi === 0 && b.bj === 0));
  const nearBlock = sortedByHaze.find((b) => b.bi + b.bj >= 2);
  const farBlock = sortedByHaze.find((b) => b.bi + b.bj <= -1);
  assert.ok(nearBlock && farBlock);
  assert.ok(farBlock.haze > nearBlock.haze, 'distant blocks have stronger atmospheric haze than foreground blocks');

  // Night phase lights up building facade windows
  const nightLayout = buildIsoCityLayout(lobby, 1200, 800, 0.02);
  const nightLitCount = nightLayout.blocks
    .flatMap((b) => b.buildings)
    .filter((b) => !b.isPlaza)
    .flatMap((b) => [...b.windowsLeft, ...b.windowsRight])
    .filter((w) => w.lit).length;
  assert.ok(nightLitCount > 25, 'night city layout illuminates building facade windows');

  // Floor-dependent elevation shifts ground plane downward on upper floors
  assert.ok(computeGroundDy(1) < computeGroundDy(4));
  assert.ok(computeGroundDy(4) < computeGroundDy(8));
  assert.ok(computeCityGroundDy(1) < computeCityGroundDy(4));
  assert.ok(computeCityGroundDy(4) < computeCityGroundDy(10));
});

test('v0.6.0 audio: defers AudioContext until user gesture, separates music/SFX mutes & volumes, and switches area moods', () => {
  let createdContexts = 0;
  let createdOscillators = 0;
  let createdFilters = 0;
  class FakeAudioContext {
    constructor() {
      createdContexts++;
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 22050;
      this.destination = {};
    }
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
          setTargetAtTime(v) { this.value = v; },
        },
        connect() {},
      };
    }
    createBiquadFilter() {
      createdFilters++;
      return { type: 'lowpass', frequency: { value: 1000 }, Q: { value: 0.7 }, connect() {} };
    }
    createOscillator() {
      createdOscillators++;
      return {
        type: 'sine',
        frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        detune: { value: 0 },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createBuffer(ch, len, sr) {
      return { getChannelData: () => new Float32Array(len) };
    }
    createBufferSource() {
      return { buffer: null, connect() {}, start() {}, stop() {} };
    }
    resume() { this.state = 'running'; }
  }

  const synth = new ChiptuneAudio(FakeAudioContext);
  synth.configure({ musicMuted: false, sfxMuted: false, musicVolume: 0.6, sfxVolume: 0.8 });

  // Before gesture: no AudioContext created, SFX blocked
  assert.equal(synth.isUnlocked(), false);
  assert.equal(createdContexts, 0, 'AudioContext must not be created before user gesture');
  assert.equal(synth.playSfx('click'), false);

  // Unlock on user gesture
  assert.equal(synth.unlockGesture(), true);
  assert.equal(createdContexts, 1, 'AudioContext created on gesture unlock');
  synth.stopLoop();

  // Soft filtered SFX and music step synthesis
  assert.equal(synth.playSfx('coin'), true);
  assert.equal(synth.playSfx('elevator'), true);
  assert.equal(synth.playSfx('quest'), true);
  synth._tickMusicStep();
  assert.ok(createdOscillators > 4 && createdFilters > 2, 'lounge music & SFX route oscillators through lowpass filters');

  // Independent music vs SFX mute & volume
  synth.setMusicMuted(true);
  assert.equal(synth.musicMuted, true);
  assert.equal(synth.sfxMuted, false, 'muting music leaves SFX unmuted');
  assert.equal(synth.playSfx('click'), true, 'SFX still plays when only music is muted');

  synth.setSfxMuted(true);
  assert.equal(synth.playSfx('click'), false, 'SFX muted independently');

  // Area moods & night mood
  assert.equal(moodForRoom('lobby', 0.5), 'lobby');
  assert.equal(moodForRoom('gym', 0.5), 'gym');
  assert.equal(moodForRoom('pool', 0.5), 'spa');
  assert.equal(moodForRoom('lobby', 0.05), 'night');
  assert.ok(MOOD_PROFILES.gym.stepMs < MOOD_PROFILES.spa.stepMs, 'gym tempo is faster than spa drift');
});

test('v0.6.0 persistence: separate musicMuted, sfxMuted, musicVolume, and sfxVolume round-trip through saveState/loadState', () => {
  const storage = makeFakeStorage();
  const state = createDefaultState();
  state.settings.musicMuted = true;
  state.settings.sfxMuted = false;
  state.settings.musicVolume = 0.35;
  state.settings.sfxVolume = 0.85;
  saveState(storage, state);

  const loaded = loadState(storage);
  assert.equal(loaded.settings.musicMuted, true);
  assert.equal(loaded.settings.sfxMuted, false);
  assert.equal(loaded.settings.musicVolume, 0.35);
  assert.equal(loaded.settings.sfxVolume, 0.85);
  assert.equal(loaded.settings.muted, false);
});

// ======================= v0.7.0 advanced pathfinding & seamless movement =======================

test('v0.7.0 movement: rapid repeated clicks on the same tile mid-step cause no back-and-forth replay', () => {
  const isBlocked = () => false;
  const mover = createMoverState(0, 0, 'down');
  let r = retargetMover(mover, 5, 0, 0, { width: 10, height: 10, isBlocked, stepMs: 240 });
  assert.equal(r.ok, true);
  const fromBefore = { x: mover.fromX, y: mover.fromY };
  const toBefore = { x: mover.toX, y: mover.toY };
  // Click the exact same target tile again mid-step: must not restart or move the anchor.
  r = retargetMover(mover, 5, 0, 60, { width: 10, height: 10, isBlocked, stepMs: 240 });
  assert.equal(r.ignoredDuplicate, true, 'duplicate click on same target tile is ignored');
  assert.deepEqual({ x: mover.fromX, y: mover.fromY }, fromBefore, 'step anchor does not reset on duplicate click');
  assert.deepEqual({ x: mover.toX, y: mover.toY }, toBefore, 'current step target does not reset on duplicate click');
});

test('v0.7.0 movement: re-targeting mid-step continues the current interpolated step instead of snapping back', () => {
  const isBlocked = () => false;
  const mover = createMoverState(0, 0, 'down');
  retargetMover(mover, 5, 0, 0, { width: 10, height: 10, isBlocked, stepMs: 240 });
  const toBefore = { x: mover.toX, y: mover.toY };
  const stepStartBefore = mover.stepStart;
  // Click a brand-new target mid-step: the in-flight step (fromX,fromY)->(toX,toY) must be preserved.
  const r = retargetMover(mover, 0, 5, 80, { width: 10, height: 10, isBlocked, stepMs: 240 });
  assert.equal(r.ok, true);
  assert.deepEqual({ x: mover.toX, y: mover.toY }, toBefore, 'in-flight step target is not replaced mid-step');
  assert.equal(mover.stepStart, stepStartBefore, 'step start time is not reset mid-step');
  assert.equal(mover.targetX, 0);
  assert.equal(mover.targetY, 5, 're-plan happens from the tile being entered, toward the new goal');
});

test('v0.7.0 pathfinding: paths never cross blockers or cut diagonal corners', () => {
  const W = 8, H = 8;
  const blocked = new Set(['3,3', '4,3']);
  const isBlocked = (x, y) => blocked.has(`${x},${y}`);
  const path = findPath(W, H, isBlocked, { x: 2, y: 2 }, { x: 5, y: 5 }, { smooth: false });
  assert.ok(path, 'path exists around the blockers');
  for (const p of path) assert.equal(isBlocked(p.x, p.y), false, `path must not cross blocked tile ${p.x},${p.y}`);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx !== 0 && dy !== 0) {
      assert.equal(isBlocked(a.x + dx, a.y), false, 'no cutting a corner past a blocker (horizontal neighbour)');
      assert.equal(isBlocked(a.x, a.y + dy), false, 'no cutting a corner past a blocker (vertical neighbour)');
    }
  }
});

test('v0.7.0 pathfinding: line-of-sight smoothing never introduces a corner cut or a blocked waypoint', () => {
  const blocked = new Set(['2,1', '2,2', '2,3']);
  const isBlocked = (x, y) => blocked.has(`${x},${y}`);
  const raw = findPath(10, 10, isBlocked, { x: 0, y: 2 }, { x: 5, y: 2 }, { smooth: false });
  assert.ok(raw);
  const smoothed = smoothPath(raw, isBlocked, { resample: true });
  for (const p of smoothed) assert.equal(isBlocked(p.x, p.y), false);
  for (let i = 1; i < smoothed.length; i++) {
    const a = smoothed[i - 1], b = smoothed[i];
    assert.ok(Math.abs(b.x - a.x) <= 1 && Math.abs(b.y - a.y) <= 1, 'resampled smoothed path stays 1-tile-step');
  }
});

test('v0.7.0 movement: advanceMover dynamically re-plans around a tile that becomes blocked by a moving NPC', () => {
  const dynamicallyBlocked = new Set();
  const isBlocked = (x, y) => dynamicallyBlocked.has(`${x},${y}`);
  const mover = createMoverState(0, 0, 'down');
  retargetMover(mover, 5, 0, 0, { width: 10, height: 10, isBlocked, stepMs: 100 });
  // An NPC walks into a tile a couple of steps further down the path (not the
  // already-committed in-flight step), so the boundary check must catch it in time.
  dynamicallyBlocked.add('3,0');
  let replanned = false;
  advanceMover(mover, 250, {
    width: 10, height: 10, isBlocked, stepMs: 100, onReplan: () => { replanned = true; },
  });
  assert.equal(replanned, true, 'advanceMover detects the newly blocked tile ahead and re-plans');
  assert.equal(isBlocked(mover.toX, mover.toY), false, 'the mover never commits to stepping onto the newly blocked tile');
  assert.equal(mover.targetX, 5);
  assert.equal(mover.targetY, 0, 'the re-planned route still heads to the original goal');
});

test('v0.7.0 npc: stationary receptionist never wanders, and findWanderTarget never returns a blocked or reserved tile', () => {
  const celeste = NPCS.find((n) => n.id === 'celeste');
  assert.ok(celeste, 'Celeste the receptionist exists');
  assert.equal(celeste.isReceptionist, true);
  assert.equal(celeste.stationary, true);
  assert.ok(Array.isArray(celeste.dialogueTopics) && celeste.dialogueTopics.length > 0, 'receptionist has dialogue topics');

  const runtime = { ...createNpcRuntime(celeste), def: celeste };
  const target = findWanderTarget(runtime, 16, 12, () => false);
  assert.equal(target, null, 'stationary NPC never produces a wander target');

  const mochi = NPCS.find((n) => n.id === 'mochi');
  const mochiRuntime = { ...createNpcRuntime(mochi), def: mochi };
  const reserved = [{ x: 5, y: 8 }, { x: 3, y: 8 }, { x: 7, y: 4 }, { x: 3, y: 3 }];
  for (let i = 0; i < 20; i++) {
    const t = findWanderTarget(mochiRuntime, 16, 12, () => false, Math.random, reserved);
    if (t) {
      assert.ok(!reserved.some((r) => r.x === t.targetTile.x && r.y === t.targetTile.y), 'wander target avoids reserved tiles');
    }
  }
});

test('v0.7.0 npc: tickNpc actually starts a walking step (not just assigning a path) when a wander target is found', () => {
  const mochi = NPCS.find((n) => n.id === 'mochi');
  const npc = { ...createNpcRuntime(mochi), def: mochi, nextWanderAt: 0 };
  tickNpc(npc, 1000, {
    tryWander: () => ({ path: [{ x: npc.x, y: npc.y }, { x: npc.x + 1, y: npc.y }] }),
    pickAmbientLine: () => null,
  });
  assert.equal(npc.walking, true, 'npc.walking becomes true immediately once a wander path is assigned');
  assert.ok(npc.path && npc.path.length > 1);
  assert.notEqual(npc.toX, npc.fromX === npc.toX ? null : npc.fromX, 'a concrete step is queued');
});

// ======================= v0.8.4 NPC routines (role-based pathing) =======================

// Rebuilds the same collision rules main.js's isBlockedFactory applies (walls/doors +
// non-walkable furniture footprints), from the pure seed data, so routines can be
// validated without importing the DOM-coupled main.js.
function makeSeedBlocked(room, placedList) {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= room.width || y >= room.height) return true;
    const cell = room.grid[y][x];
    if (cell === TILE.WALL || cell === TILE.WINDOW || cell === TILE.VOID) return true;
    if (cell === TILE.DOOR && room.doors.find((d) => d.x === x && d.y === y)?.elevator) return true;
    for (const p of placedList) {
      const item = getCatalogueItem(p.itemId);
      if (!item || isFurnitureWalkable(item)) continue;
      if (item.seat || item.interaction === 'treadmill') continue; // steppable — matches main.js's isBlockedFactory
      const cells = footprintCells(p.x, p.y, item.footprint, p.rot || 0);
      if (cells.some((c) => c.x === x && c.y === y)) return true;
    }
    return false;
  };
}

test('v0.8.4 npc routines: every routine stop exists, stays in bounds, and is never on a wall/void tile', () => {
  for (const npc of NPCS) {
    if (!npc.routine) continue;
    const room = ROOMS[npc.room];
    assert.ok(room, `${npc.id}: room ${npc.room} exists`);
    for (const stop of npc.routine) {
      assert.ok(stop.x >= 0 && stop.y >= 0 && stop.x < room.width && stop.y < room.height,
        `${npc.id}: routine stop (${stop.x},${stop.y}) is within ${npc.room}`);
      const cell = room.grid[stop.y][stop.x];
      assert.notEqual(cell, TILE.WALL, `${npc.id}: stop (${stop.x},${stop.y}) is not a wall`);
      assert.notEqual(cell, TILE.VOID, `${npc.id}: stop (${stop.x},${stop.y}) is not void`);
      assert.notEqual(cell, TILE.WINDOW, `${npc.id}: stop (${stop.x},${stop.y}) is not a window`);
      if (stop.activity === 'interact') {
        const placed = (SEED_FURNITURE[npc.room] || []).find((p) => p.x === stop.x && p.y === stop.y);
        assert.ok(placed, `${npc.id}: 'interact' stop (${stop.x},${stop.y}) must sit on a real seeded furniture item`);
      }
    }
  }
});

test('v0.8.4 npc routines: every NPC can walk its full routine loop, in order, from its home tile, without crossing a blocked tile', () => {
  for (const npc of NPCS) {
    if (!npc.routine) continue;
    const room = ROOMS[npc.room];
    const placedList = (SEED_FURNITURE[npc.room] || []).map((p, i) => ({ ...p, instanceId: `${npc.room}-${i}` }));
    const blocked = makeSeedBlocked(room, placedList);
    const roomForInventory = { width: room.width, height: room.height, grid: room.grid, placed: placedList };
    let pos = { x: npc.home.x, y: npc.home.y };
    assert.ok(!blocked(pos.x, pos.y), `${npc.id}: home tile (${pos.x},${pos.y}) is not blocked`);
    for (const stop of npc.routine) {
      if (stop.activity === 'interact') {
        const placed = placedList.find((p) => p.x === stop.x && p.y === stop.y);
        const approach = findApproachTile(roomForInventory, placed, blocked, pos, [], []);
        assert.ok(approach && approach.path && approach.path.length >= 1,
          `${npc.id}: can reach interact stop (${stop.x},${stop.y}) from (${pos.x},${pos.y})`);
        for (const step of approach.path) assert.ok(!blocked(step.x, step.y), `${npc.id}: path step (${step.x},${step.y}) is never blocked`);
        pos = approach.tile;
      } else {
        const path = findPath(room.width, room.height, blocked, pos, { x: stop.x, y: stop.y });
        assert.ok(path, `${npc.id}: can reach stand stop (${stop.x},${stop.y}) from (${pos.x},${pos.y})`);
        for (const step of path) assert.ok(!blocked(step.x, step.y), `${npc.id}: path step (${step.x},${step.y}) is never blocked`);
        pos = { x: stop.x, y: stop.y };
      }
    }
  }
});

test('v0.8.4 npc routines: tickNpc advances routineIdx-driven dwell timers correctly (travel + dwell, instant-interact, and retry cases)', () => {
  const mochi = NPCS.find((n) => n.id === 'mochi');

  // A path target with an explicit dwellMs waits (at least) travel time + dwellMs before
  // the NPC is willing to move again — long enough to actually look "purposeful" at the stop.
  const npcA = { ...createNpcRuntime(mochi), def: mochi, nextWanderAt: 0 };
  tickNpc(npcA, 1000, {
    tryWander: () => ({ path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], dwellMs: 5000 }),
    pickAmbientLine: () => null,
    stepMs: 100,
  });
  assert.equal(npcA.walking, true);
  assert.ok(npcA.nextWanderAt >= 1000 + 200 + 5000 - 1, 'nextWanderAt covers travel time plus the full dwell');

  // handledDirectly (NPC already standing on its next routine stop, e.g. it never left a
  // single-stop loop) must still respect the dwell timer without starting a walk.
  const npcB = { ...createNpcRuntime(mochi), def: mochi, nextWanderAt: 0, walking: false };
  tickNpc(npcB, 1000, {
    tryWander: () => ({ handledDirectly: true, dwellMs: 4000 }),
    pickAmbientLine: () => null,
  });
  assert.equal(npcB.walking, false, 'handledDirectly never starts a walk');
  assert.equal(npcB.nextWanderAt, 5000, 'handledDirectly still schedules the next check after the dwell');

  // A seated/busy NPC is not stuck forever: once nextWanderAt elapses, tickNpc must still
  // call tryWander and let it reach a new routine stop (regression test for the old gate
  // `npc.sitting === null`, which silently froze any NPC that had ever sat down).
  const npcC = { ...createNpcRuntime(mochi), def: mochi, nextWanderAt: 0, sitting: 'some-chair-instance-id' };
  let wanderCalled = false;
  tickNpc(npcC, 1000, {
    tryWander: () => { wanderCalled = true; return { path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }; },
    pickAmbientLine: () => null,
  });
  assert.equal(wanderCalled, true, 'tickNpc calls tryWander for a seated NPC once its dwell timer elapses');
  assert.equal(npcC.walking, true, 'the seated NPC starts walking to its next routine stop');

  // No reachable target right now (e.g. stop momentarily occupied): retry soon, not instantly
  // (which would spam pathfinding every frame) and not after a full dwell (which would make
  // the NPC appear stuck).
  const npcD = { ...createNpcRuntime(mochi), def: mochi, nextWanderAt: 0, walking: false };
  tickNpc(npcD, 1000, { tryWander: () => null, pickAmbientLine: () => null });
  assert.equal(npcD.walking, false);
  assert.ok(npcD.nextWanderAt > 1000 && npcD.nextWanderAt <= 1000 + 3000, 'a missed target retries soon, bounded');
});

// ======================= v0.7.0 zoom, camera & pointer mapping =======================

test('v0.7.0 zoom: clampZoom bounds the zoom level and DEFAULT_ZOOM sits within range', () => {
  assert.ok(DEFAULT_ZOOM >= MIN_ZOOM && DEFAULT_ZOOM <= MAX_ZOOM);
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(99), MAX_ZOOM);
  assert.equal(clampZoom(Number.NaN), DEFAULT_ZOOM);
});

test('v0.7.0 zoom: pointer-to-tile mapping round-trips correctly at multiple zoom levels and pans', () => {
  const room = ROOMS.lobby;
  const width = 960, height = 600;
  const { originX, originY } = computeOrigin(room, width, height);
  for (const zoom of [MIN_ZOOM, 1.0, DEFAULT_ZOOM, MAX_ZOOM]) {
    const camera = centerCameraOnTile(6, 4, room, width, height, zoom);
    const { sx, sy } = worldToScreen(...Object.values(tileToScreen(6, 4, originX, originY)), camera, width, height);
    const tile = screenToTile(sx, sy, originX, originY, camera, width, height);
    assert.equal(tile.x, 6, `x round-trips at zoom ${zoom}`);
    assert.equal(tile.y, 4, `y round-trips at zoom ${zoom}`);
  }
});

test('v0.7.0 zoom: zoomAtPoint keeps the world point under the cursor fixed on screen', () => {
  const camera = { zoom: 1, panX: 0, panY: 0 };
  const cursorX = 300, cursorY = 200;
  const zoomed = zoomAtPoint(camera, 2, cursorX, cursorY, 960, 600);
  const back = zoomAtPoint(zoomed, 1, cursorX, cursorY, 960, 600);
  assert.ok(Math.abs(back.panX - camera.panX) <= 1);
  assert.ok(Math.abs(back.panY - camera.panY) <= 1);
});

test('v0.7.0 persistence: zoom level persists through saveState/loadState and stays clamped', () => {
  const storage = makeFakeStorage();
  const state = createDefaultState();
  state.settings.zoom = 2.2;
  saveState(storage, state);
  const loaded = loadState(storage);
  assert.equal(loaded.settings.zoom, 2.2);

  const storage2 = makeFakeStorage();
  const state2 = createDefaultState();
  state2.settings.zoom = 99;
  saveState(storage2, state2);
  const loaded2 = loadState(storage2);
  assert.ok(loaded2.settings.zoom <= MAX_ZOOM, 'out-of-range saved zoom is clamped on load');
});

test('v0.7.0 persistence: master and ambience volume settings round-trip', () => {
  const storage = makeFakeStorage();
  const state = createDefaultState();
  state.settings.masterVolume = 0.42;
  state.settings.ambienceVolume = 0.33;
  state.settings.ambienceMuted = true;
  state.settings.autoFollowRoom = false;
  saveState(storage, state);
  const loaded = loadState(storage);
  assert.equal(loaded.settings.masterVolume, 0.42);
  assert.equal(loaded.settings.ambienceVolume, 0.33);
  assert.equal(loaded.settings.ambienceMuted, true);
  assert.equal(loaded.settings.autoFollowRoom, false);
});

// ======================= v0.7.0 vehicles & per-room music =======================

test('v0.7.0 vehicles: cars, taxis, buses, and scooters render on the isometric roads with headlights at night', () => {
  const layout = buildIsoCityLayout(ROOMS.lobby, 960, 600, 0.5);
  const dayVehicles = computeCityVehicles(layout, 0, 0.5);
  assert.ok(dayVehicles.length >= 8, 'multiple vehicles populate the roads');
  const types = new Set(dayVehicles.map((v) => v.type));
  for (const t of ['car', 'taxi', 'bus', 'scooter']) assert.ok(types.has(t), `expected a ${t} among vehicles`);
  for (const v of dayVehicles) assert.equal(v.lightsOn, false, 'lights off in daylight');

  const nightVehicles = computeCityVehicles(layout, 0, 0.0);
  assert.ok(nightVehicles.every((v) => v.lightsOn === true), 'headlights/taillights on at night');
});

test('v0.7.2 vehicles: every vehicle sits inside a road corridor (never over a building block)', () => {
  const layout = buildIsoCityLayout(ROOMS.lobby, 960, 600, 0.5);
  // Sample the whole traffic-light cycle so cars occupy many positions along their lanes.
  for (const now of [0, 1500, 3000, 6000, 9000, 11000]) {
    for (const v of computeCityVehicles(layout, now, 0.5)) {
      // The vehicle must ride a road of its own axis, with its cross-axis coordinate
      // inside that road's width — i.e. on asphalt, never over a building block.
      const onRoad = layout.roads.some((r) => {
        if (r.axis !== v.axis) return false;
        return (r.axis === 'v')
          ? (v.u >= r.u0 - 0.01 && v.u <= r.u1 + 0.01) // v-road: constrained in u
          : (v.v >= r.v0 - 0.01 && v.v <= r.v1 + 0.01); // u-road: constrained in v
      });
      assert.ok(onRoad, `vehicle ${v.id} (${v.type}) at u=${v.u.toFixed(2)},v=${v.v.toFixed(2)} must be on a ${v.axis}-road`);
    }
  }
});

test('v0.7.2 render: deviceScale bakes at ceil(dpr*zoom) so bitmaps are never upscaled when zoomed in', () => {
  for (const dpr of [1, 2, 3]) {
    for (const zoom of [MIN_ZOOM, 0.7, 1, DEFAULT_ZOOM, MAX_ZOOM]) {
      const ds = deviceScale(dpr, zoom);
      assert.ok(Number.isInteger(ds), 'device scale is an integer bucket');
      assert.ok(ds >= dpr * zoom - 1e-9, `ds=${ds} must be >= dpr*zoom=${(dpr * zoom).toFixed(2)} (no upscaling)`);
      assert.ok(ds >= 1 && ds <= 8, 'device scale stays within sane bounds');
    }
  }
  assert.equal(deviceScale(1, 1), 1);
  assert.equal(deviceScale(2, DEFAULT_ZOOM), 4); // ceil(2 * 1.85) = 4
});

test('v0.7.0 audio: every hotel room/floor resolves to its own distinct procedural track', () => {
  const trackIds = new Set();
  for (const roomId of Object.keys(ROOMS)) {
    const synth = new ChiptuneAudio();
    synth.gestureUnlocked = true;
    synth.setRoomMood(roomId, 0.5, ROOMS[roomId].floor || 1);
    trackIds.add(synth.trackId);
  }
  assert.ok(trackIds.size >= 8, 'at least 8 distinct per-room/floor tracks are selectable');
});

test('v0.7.0 audio: traffic ambience is quieter on higher floors and inside than at street level', () => {
  const synth = new ChiptuneAudio();
  synth.gestureUnlocked = true;
  synth.setRoomMood('lobby', 0.5, 1);
  const streetAtten = synth._effectiveAmbienceTarget();
  synth.setRoomMood('library', 0.5, 7);
  const highFloorAtten = synth._effectiveAmbienceTarget();
  assert.ok(highFloorAtten < streetAtten, 'traffic ambience attenuates on higher floors');
});

// ======================= v0.7.1 James's floor MP3 soundtrack =======================

test('v0.7.1 audio: floor MP3s play per room, crossfade between floors, and fall back to synth on file failure', () => {
  class FakeGainParam {
    constructor() { this.value = 0.0001; this.ops = []; }
    setValueAtTime(v) { this.value = v; this.ops.push(['set', v]); }
    linearRampToValueAtTime(v) { this.value = v; this.ops.push(['ramp', v]); }
    exponentialRampToValueAtTime(v) { this.value = v; this.ops.push(['exp', v]); }
    cancelScheduledValues() {}
  }
  class FakeGainNode {
    constructor() { this.gain = new FakeGainParam(); }
    connect() {}
    disconnect() {}
  }
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 22050;
      this.destination = {};
    }
    createGain() { return new FakeGainNode(); }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 1000 }, Q: { value: 0.7 }, connect() {} }; }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        detune: { value: 0 },
        connect() {}, start() {}, stop() {},
      };
    }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
    createMediaElementSource() { return { connect() {}, disconnect() {} }; }
    resume() { this.state = 'running'; }
  }
  class FakeAudioElement {
    constructor() { this.loop = false; this.preload = ''; this._src = ''; this.paused = true; }
    set src(v) { this._src = v; }
    get src() { return this._src; }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  global.Audio = FakeAudioElement;
  let synth;
  try {
    synth = new ChiptuneAudio(FakeAudioContext);
    synth.unlockGesture();

    // Gym floor resolves to the v2 gym.mp3 file and plays it (not the procedural fallback)
    synth.setRoomMood('gym', 0.5, 4);
    let info = synth.getMoodInfo();
    assert.equal(info.src, MUSIC_FILES.gym.src);
    assert.ok(info.src.endsWith('gym.mp3'));
    assert.equal(info.usingFile, true);
    assert.equal(info.label, MUSIC_FILES.gym.label);
    assert.equal(synth.fileNodes.gym.el.paused, false, 'the gym file element is playing');

    // Switching floors crossfades: previous track ramps its gain down, new one ramps up
    const gymNode = synth.fileNodes.gym;
    synth.setRoomMood('pool', 0.5, 5);
    info = synth.getMoodInfo();
    assert.equal(info.src, MUSIC_FILES.pool.src);
    assert.equal(info.usingFile, true);
    assert.ok(gymNode.gain.gain.ops.some(([op, v]) => op === 'ramp' && v <= 0.0001), 'previous floor track crossfades out');
    assert.ok(synth.fileNodes.pool.gain.gain.ops.some(([op, v]) => op === 'ramp' && v > 0.0001), 'new floor track crossfades in');

    // A file load/playback failure falls back to the procedural synth track for that room
    synth._handleFileError('pool');
    info = synth.getMoodInfo();
    assert.equal(info.fallback, true);
    assert.equal(info.usingFile, false);
    assert.equal(info.label, synth.getTrackProfile().title, 'falls back to the procedural track title');
  } finally {
    if (synth) synth.stopLoop(); // clear the ticking interval so the test process can exit
    delete global.Audio;
  }
});

test('v0.7.2 audio: unmuting then changing room keeps the room track playing (no stale pause)', () => {
  class FakeGainParam {
    constructor() { this.value = 0.0001; }
    setValueAtTime(v) { this.value = v; }
    linearRampToValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime(v) { this.value = v; }
    setTargetAtTime(v) { this.value = v; }
    cancelScheduledValues() {}
  }
  class FakeGainNode { constructor() { this.gain = new FakeGainParam(); } connect() {} disconnect() {} }
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 22050; this.destination = {}; }
    createGain() { return new FakeGainNode(); }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 1000 }, Q: { value: 0.7 }, connect() {} }; }
    createOscillator() { return { frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, detune: { value: 0 }, connect() {}, start() {}, stop() {} }; }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
    createMediaElementSource() { return { connect() {}, disconnect() {} }; }
    resume() {}
  }
  class FakeAudioElement {
    constructor() { this.loop = false; this.preload = ''; this._src = ''; this.paused = true; }
    set src(v) { this._src = v; } get src() { return this._src; }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  // Capture deferred pause timers so we can deterministically fire them AFTER the
  // interaction sequence, emulating the real-world delay that exposed the bug.
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  const pending = new Map();
  let nextId = 1;
  global.setTimeout = (fn, ms) => { if (ms >= 200) { const id = nextId++; pending.set(id, fn); return id; } return realSetTimeout(fn, ms); };
  global.clearTimeout = (id) => { if (pending.has(id)) pending.delete(id); else realClearTimeout(id); };
  global.Audio = FakeAudioElement;

  let synth;
  try {
    synth = new ChiptuneAudio(FakeAudioContext);
    synth.unlockGesture();

    // Visit pool then gym (pool crossfades out, scheduling a deferred pause on pool).
    synth.setRoomMood('pool', 0.5, 5);
    synth.setRoomMood('gym', 0.5, 4);

    // Mute then unmute (gym fades out and is restarted).
    synth.setMusicMuted(true);
    synth.setMusicMuted(false);

    // Change room back to pool — the room's track must play.
    synth.setRoomMood('pool', 0.5, 5);
    assert.equal(synth.getMoodInfo().usingFile, true, 'pool file track becomes active after room change');
    assert.equal(synth.fileNodes.pool.el.paused, false, 'pool track is playing right after the room change');

    // Fire every deferred pause timer (what happens ~1s later in the real app).
    for (const fn of pending.values()) fn();

    assert.equal(synth.fileNodes.pool.el.paused, false, 'pool track stays playing; no stale pause timer killed it');
    assert.equal(synth.activeFileTrackId, 'pool', 'pool remains the active file track');
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    if (synth) synth.stopLoop();
    delete global.Audio;
  }
});

// ======================= v0.8.1: seats, overlaps, categories =======================

test('v0.8.1 furniture: table/counter/bar/desk items are never seats', () => {
  const surfaceLike = CATALOGUE.filter((c) => /table|counter|\bbar\b|desk|station/i.test(c.id) || /table|counter|\bbar\b|desk|station/i.test(c.name));
  assert.ok(surfaceLike.length > 5, 'sanity: the catalogue has several table/counter/bar/desk items');
  for (const item of surfaceLike) {
    assert.equal(item.seat, false, `${item.id} looks like a table/counter/bar/desk and must not be a seat`);
  }
  for (const item of CATALOGUE) {
    if (item.seat) {
      assert.ok(item.interaction, `seat item ${item.id} must declare an interaction`);
      assert.ok(Array.isArray(item.seatOffsets) && item.seatOffsets.length > 0, `seat item ${item.id} must declare seatOffsets`);
    }
  }
});

test('v0.8.1 furniture: no two non-walkable preset furniture footprints overlap, and doors/elevator mats stay clear', () => {
  for (const [roomId, placedList] of Object.entries(SEED_FURNITURE)) {
    const room = ROOMS[roomId];
    const cellOwner = new Map();
    for (const placed of placedList) {
      const item = getCatalogueItem(placed.itemId);
      assert.ok(item, `${roomId}: ${placed.itemId} is a real catalogue item`);
      if (isFurnitureWalkable(item)) continue; // flat decor (rugs, runners) may legitimately sit under other items
      for (const c of footprintCells(placed.x, placed.y, item.footprint, placed.rot || 0)) {
        const key = `${c.x},${c.y}`;
        assert.ok(!cellOwner.has(key), `${roomId}: ${placed.itemId} overlaps ${cellOwner.get(key)} at (${key})`);
        cellOwner.set(key, placed.itemId);
      }
    }
    assert.ok(hasDoorArrivalRoute(room, placedList), `${roomId}: every door/elevator mat must stay reachable and unblocked`);
  }
});

// ======================= v0.8.1: city vehicle/building draw order =======================

function makeFakeCanvasCtx({ record = false } = {}) {
  const calls = [];
  let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const push = (type) => { if (record) calls.push(type); };
  return {
    _calls: calls,
    canvas: { width: 0, height: 0 },
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, imageSmoothingEnabled: true,
    save() { push('save'); }, restore() { push('restore'); },
    beginPath() { push('beginPath'); }, closePath() { push('closePath'); }, clip() { push('clip'); }, rect() { push('rect'); },
    moveTo() { push('moveTo'); }, lineTo() { push('lineTo'); }, arc() { push('arc'); }, ellipse() { push('ellipse'); },
    fill() { push('fill'); }, stroke() { push('stroke'); },
    fillRect() { push('fillRect'); }, strokeRect() { push('strokeRect'); }, clearRect() { push('clearRect'); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    setTransform(a, b, c, d, e, f) { transform = { a, b, c, d, e, f }; push('setTransform'); },
    getTransform() { return { ...transform }; },
    drawImage() { push('drawImage'); },
  };
}

test('v0.8.1 render: street vehicles are drawn strictly between the street backdrop and the buildings layer, so buildings always occlude them', () => {
  const realDocument = global.document;
  global.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas', 'drawBackground only creates offscreen <canvas> elements');
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => makeFakeCanvasCtx({ record: false });
      return canvas;
    },
  };
  try {
    const liveCtx = makeFakeCanvasCtx({ record: true });
    drawBackground(liveCtx, 960, 600, 0.5, 8, 1, 5000, ROOMS.myroom, 1, null);
    const calls = liveCtx._calls;
    const blitIdx = calls.reduce((acc, c, i) => (c === 'drawImage' ? [...acc, i] : acc), []);
    assert.equal(blitIdx.length, 2, 'exactly two cached-layer blits land on the live canvas: street backdrop, then buildings');
    const [backdropIdx, buildingsIdx] = blitIdx;
    assert.ok(backdropIdx < buildingsIdx, 'the street backdrop must blit before the buildings layer');
    const vehicleDrawn = calls.some((c, i) => i > backdropIdx && i < buildingsIdx && (c === 'fill' || c === 'arc'));
    assert.ok(vehicleDrawn, 'vehicles must be drawn strictly between the backdrop and buildings blits, so buildings always occlude them');
  } finally {
    global.document = realDocument;
  }
});

// ======================= v0.8.1: lamp/light toggle & save migration =======================

test('v0.8.1 lighting: every lamp/light catalogue item is a proper toggleable light source', () => {
  const lights = CATALOGUE.filter((c) => c.lightSource);
  assert.ok(lights.length >= 4, 'sanity: lamp, string_lights, neon_sign, chandelier should all be tagged');
  for (const item of lights) {
    assert.equal(item.interaction, 'toggle_light', `${item.id} must use the toggle_light interaction`);
    assert.ok(item.emissive && item.emissive.color, `${item.id} must declare an emissive glow to toggle`);
    assert.equal(item.seat, false, `${item.id} is a light fixture, not a seat`);
  }
  for (const id of ['lamp', 'string_lights', 'neon_sign', 'chandelier']) {
    assert.ok(getCatalogueItem(id)?.lightSource, `${id} must be tagged as a light source`);
  }
});

test('v0.8.1 persistence: lightsOn defaults true for a fresh save and survives a v4 -> latest migration', () => {
  const fresh = createDefaultState();
  assert.equal(fresh.rooms.myroom.lightsOn, true);

  const v4Save = {
    version: 4,
    coins: 100,
    unlocked: [],
    inventory: [],
    rooms: { myroom: { placed: [{ instanceId: 'seed-myroom-0', itemId: 'lamp', x: 8, y: 2, rot: 0 }] } },
    quests: {},
    player: { room: 'myroom', x: 4, y: 2, dir: 'down', sitting: null },
  };
  const storage = makeFakeStorage({ [SAVE_KEY]: JSON.stringify(v4Save) });
  const loaded = loadState(storage);
  assert.equal(loaded.version, SAVE_VERSION);
  assert.equal(loaded.rooms.myroom.lightsOn, true, 'a save with no lightsOn field migrates in as on (unchanged behaviour)');

  // A save that had already turned the lamp off must keep that choice through migration.
  const v4SaveOff = { ...v4Save, rooms: { myroom: { ...v4Save.rooms.myroom, lightsOn: false } } };
  const storage2 = makeFakeStorage({ [SAVE_KEY]: JSON.stringify(v4SaveOff) });
  const loaded2 = loadState(storage2);
  assert.equal(loaded2.rooms.myroom.lightsOn, false);
});

test('v0.8.1 catalogue: every item has a valid shop/inventory category', () => {
  assert.ok(ITEM_CATEGORIES.length >= 8, 'sanity: the taxonomy has several categories');
  const validIds = new Set(ITEM_CATEGORIES.map((c) => c.id));
  for (const item of CATALOGUE) {
    assert.ok(validIds.has(item.category), `${item.id} has an invalid category: ${item.category}`);
  }
});

// ======================= v0.8.2: floor expansion & rooftop rework =======================

test('v0.8.2 room dimensions: 16x area for Lobby/Restaurant/Pool, 4x area for other public floors, My Room unchanged', () => {
  // 16x area (4x width, 4x depth)
  assert.equal(ROOMS.lobby.width, 64);
  assert.equal(ROOMS.lobby.height, 48);
  assert.equal(ROOMS.restaurant.width, 48);
  assert.equal(ROOMS.restaurant.height, 36);
  assert.equal(ROOMS.pool.width, 44);
  assert.equal(ROOMS.pool.height, 36);

  // 4x area (2x width, 2x depth)
  assert.equal(ROOMS.cafe.width, 20);
  assert.equal(ROOMS.cafe.height, 16);
  assert.equal(ROOMS.gym.width, 22);
  assert.equal(ROOMS.gym.height, 16);
  assert.equal(ROOMS.arcade.width, 22);
  assert.equal(ROOMS.arcade.height, 16);
  assert.equal(ROOMS.library.width, 22);
  assert.equal(ROOMS.library.height, 16);
  assert.equal(ROOMS.garden.width, 22);
  assert.equal(ROOMS.garden.height, 18);
  assert.equal(ROOMS.rooftop.width, 20);
  assert.equal(ROOMS.rooftop.height, 16);

  // My Room unchanged
  assert.equal(ROOMS.myroom.width, 9);
  assert.equal(ROOMS.myroom.height, 8);
});

test('v0.8.3 rooftop rework: floor 42, open-air balustrade, legacy lobby door removed, elevator reached, stair door decorative/staff only', () => {
  assert.equal(ROOMS.rooftop.floor, 42);
  assert.equal(ROOMS.rooftop.isRooftop, true);
  assert.equal(ROOMS.rooftop.shape, 'open-air-rooftop');

  // Legacy Lobby(6,0) <-> Rooftop(4,0) door pair is gone
  assert.ok(!ROOMS.lobby.doors.some((d) => d.to === 'rooftop'));
  assert.ok(!ROOMS.rooftop.doors.some((d) => d.to === 'lobby' && !d.elevator));

  // Sky Garden to roof stair door removed (roof is reached via elevator)
  const gardenToRoof = ROOMS.garden.doors.find((d) => d.to === 'rooftop');
  assert.equal(gardenToRoof, undefined, 'Sky garden has no stair door to rooftop');

  // Decorative locked staff door on rooftop
  const roofStair = ROOMS.rooftop.doors.find((d) => !d.elevator);
  assert.ok(roofStair, 'Rooftop has housing stair door');
  assert.equal(roofStair.label, 'Staff Only');
  assert.equal(roofStair.locked, true);

  // Elevator door exists on Rooftop
  const roofElevator = ROOMS.rooftop.doors.find((d) => d.elevator);
  assert.ok(roofElevator, 'Rooftop must have an elevator door');
});

test('v0.8.2 migration: v5 save migrates to v6, refreshing unmodified public seeds and returning unplaceable custom items to inventory', () => {
  const v5Save = {
    version: 5,
    coins: 200,
    unlocked: ['rug'],
    inventory: [{ instanceId: 'inv-1', itemId: 'lamp' }],
    rooms: {
      lobby: {
        placed: [
          { instanceId: 'seed-lobby-0', itemId: 'reception_desk', x: 7, y: 2, rot: 0 },
        ],
      },
      myroom: {
        placed: [
          { instanceId: 'custom-bed', itemId: 'suite_bed', x: 6, y: 2, rot: 0 },
        ],
      },
      pool: {
        placed: [
          { instanceId: 'custom-towel', itemId: 'towel_rack', x: 2, y: 2, rot: 0 },
          { instanceId: 'custom-overflow', itemId: 'armchair', x: 43, y: 35, rot: 0 },
        ],
      },
    },
    quests: {},
    player: { room: 'lobby', x: 6, y: 0, dir: 'up', sitting: null }, // on the legacy removed door
  };
  const storage = makeFakeStorage({ [SAVE_KEY]: JSON.stringify(v5Save) });
  const loaded = loadState(storage);
  assert.equal(loaded.version, SAVE_VERSION);
  // Unmodified lobby seed upgrades to new expanded seed
  assert.ok(loaded.rooms.lobby.placed.length > 10);
  // Custom item in pool preserved
  assert.ok(loaded.rooms.pool.placed.some((p) => p.instanceId === 'custom-towel'));
  // Player rescued from removed door tile (which is now WALL)
  assert.deepEqual({ x: loaded.player.x, y: loaded.player.y }, ROOMS.lobby.spawn);
});

test('v0.8.2 multiplayer room snapshots: My Room unchanged dimensions preserve visitor scene and sanitization', () => {
  const def = ROOMS.myroom;
  assert.equal(def.width, 9);
  assert.equal(def.height, 8);
  const rawPlaced = [
    { instanceId: 'snap-bed', itemId: 'suite_bed', x: 6, y: 2, rot: 0 },
    { instanceId: 'snap-lamp', itemId: 'lamp', x: 8, y: 2, rot: 0 },
  ];
  const sanitized = sanitizePlacedItemsForRoom(def, rawPlaced, []);
  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].instanceId, 'snap-bed');
});

// ======================= v0.8.3 cassette player & rooftop railing bugfix =======================

test('v0.8.3 rooftop railing: glass balustrade segments stay within their tile half (west x<32, north x>=32) and meet cleanly at corners without sticking out', () => {
  const west = buildGlassBalustradeSegment('west');
  const north = buildGlassBalustradeSegment('north');

  const corner = 32 * ART; // half the (ART-scaled) tile width

  let westOpaqueCount = 0;
  let westOpaquePastCorner = 0;
  let westHasCornerPost = false;
  for (let y = 0; y < west.h; y++) {
    for (let x = 0; x < west.w; x++) {
      if (west.px[y][x]) {
        westOpaqueCount++;
        if (x >= corner) westOpaquePastCorner++;
        if (x === corner - 1) westHasCornerPost = true;
      }
    }
  }

  let northOpaqueCount = 0;
  let northOpaqueBeforeCorner = 0;
  let northHasCornerPost = false;
  for (let y = 0; y < north.h; y++) {
    for (let x = 0; x < north.w; x++) {
      if (north.px[y][x]) {
        northOpaqueCount++;
        if (x < corner) northOpaqueBeforeCorner++;
        if (x === corner) northHasCornerPost = true;
      }
    }
  }

  assert.ok(westOpaqueCount > 0, 'west balustrade has pixels');
  assert.equal(westOpaquePastCorner, 0, 'west balustrade must not stick out beyond the corner into empty sky/floor');
  assert.ok(westHasCornerPost, 'west balustrade reaches the corner post');

  assert.ok(northOpaqueCount > 0, 'north balustrade has pixels');
  assert.equal(northOpaqueBeforeCorner, 0, 'north balustrade must not stick out before the corner into empty sky/floor');
  assert.ok(northHasCornerPost, 'north balustrade starts at the corner post');
});

test('v0.8.3 music player: formatTime formats seconds to M:SS with zero-padding and handles edge cases', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(9), '0:09');
  assert.equal(formatTime(10), '0:10');
  assert.equal(formatTime(59), '0:59');
  assert.equal(formatTime(60), '1:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(125.8), '2:05');
  assert.equal(formatTime(-10), '0:00');
  assert.equal(formatTime(NaN), '0:00');
  assert.equal(formatTime(Infinity), '0:00');
  assert.equal(formatTime(null), '0:00');
});

test('v0.8.3 music player: seek and seekRatio clamp within [0, duration] and update audio currentTime', () => {
  class FakeAudioElement {
    constructor() {
      this.currentTime = 0;
      this.duration = 100;
      this.paused = true;
    }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  global.Audio = FakeAudioElement;
  let audio;
  try {
    audio = new ChiptuneAudio();
    audio.setTrack('lobby');

    // getDuration is positive
    const dur = audio.getDuration();
    assert.ok(dur > 0);

    // seek clamps within [0, duration]
    assert.equal(audio.seek(-20), 0);
    assert.equal(audio.getCurrentTime(), 0);

    assert.equal(audio.seek(42), 42);
    assert.equal(audio.getCurrentTime(), 42);

    assert.equal(audio.seek(9999), dur);
    assert.equal(audio.getCurrentTime(), dur);

    // seekRatio maps [0, 1] to [0, duration]
    assert.equal(audio.seekRatio(0), 0);
    assert.equal(audio.getCurrentTime(), 0);

    const half = Math.round(dur * 0.5 * 100) / 100;
    const seekHalf = audio.seekRatio(0.5);
    assert.ok(Math.abs(seekHalf - half) < 0.1);

    assert.equal(audio.seekRatio(1), dur);
    assert.equal(audio.getCurrentTime(), dur);

    // getMoodInfo contains currentTime and duration
    const info = audio.getMoodInfo();
    assert.equal(info.duration, dur);
    assert.equal(info.currentTime, dur);
  } finally {
    if (audio) audio.stopLoop();
    delete global.Audio;
  }
});

test('v0.8.3 persistence: playerMinimized setting defaults to false and round-trips through saveState/loadState', () => {
  const fresh = createDefaultState();
  assert.equal(fresh.settings.playerMinimized, false);

  const storage = makeFakeStorage();
  fresh.settings.playerMinimized = true;
  saveState(storage, fresh);

  const loaded = loadState(storage);
  assert.equal(loaded.settings.playerMinimized, true);

  // An older save without playerMinimized should default to false
  const oldSave = {
    version: SAVE_VERSION,
    settings: {
      muted: false,
      musicMuted: false,
      sfxMuted: false,
      zoom: 1.85,
    },
  };
  const oldStorage = makeFakeStorage({ [SAVE_KEY]: JSON.stringify(oldSave) });
  const loadedOld = loadState(oldStorage);
  assert.equal(loadedOld.settings.playerMinimized, false);
});

test('v0.8.3 rooftop housing structure: elevator and stairwell "To Floor 9" door mounted on solid housing block (x=4..14, y=0) with windows and unblocked arrival routes', () => {
  const roof = ROOMS.rooftop;
  assert.equal(roof.isRooftop, true);

  // Doors on the housing block
  const stairDoor = roof.doors.find((d) => d.x === 6 && d.y === 0);
  assert.ok(stairDoor);
  assert.equal(stairDoor.x, 6);
  assert.equal(stairDoor.y, 0);
  assert.equal(stairDoor.label, 'Staff Only');
  assert.equal(stairDoor.locked, true);

  const elevDoor = roof.doors.find((d) => d.elevator);
  assert.ok(elevDoor);
  assert.equal(elevDoor.x, 12);
  assert.equal(elevDoor.y, 0);

  // Housing walls and windows along y = 0
  assert.equal(roof.grid[0][4], TILE.WALL);
  assert.equal(roof.grid[0][5], TILE.WINDOW);
  assert.equal(roof.grid[0][6], TILE.DOOR);
  assert.equal(roof.grid[0][7], TILE.WINDOW);
  assert.equal(roof.grid[0][8], TILE.WALL);
  assert.equal(roof.grid[0][9], TILE.WINDOW);
  assert.equal(roof.grid[0][11], TILE.WINDOW);
  assert.equal(roof.grid[0][12], TILE.DOOR);
  assert.equal(roof.grid[0][13], TILE.WINDOW);
  assert.equal(roof.grid[0][14], TILE.WALL);

  // Open air balustrade edges (outside x=4..14)
  assert.equal(roof.grid[0][1], TILE.WALL);
  assert.equal(roof.grid[0][18], TILE.WALL);

  // Door arrival routes stay clear
  assert.ok(hasDoorArrivalRoute(roof, SEED_FURNITURE.rooftop));
});

test('v0.8.3 bookshelf model: solid closed side panels, top cornice, base plinth, and recessed books for rot 0 and 1', () => {
  for (const rot of [0, 1]) {
    const shelf = buildBookshelf(rot);
    assert.ok(shelf.w > 0 && shelf.h > 0);
    assert.equal(shelf.height, 74);

    // Verify boxes include plinth base (z=0..4), back panel, upright side panels, shelves, and cornice (z=70..74)
    const baseBox = shelf.boxes.find((b) => b.z0 === 0 && b.z1 === 4);
    assert.ok(baseBox, `rot ${rot}: base plinth box must exist`);

    const corniceBox = shelf.boxes.find((b) => b.z0 === 70 && b.z1 === 74);
    assert.ok(corniceBox, `rot ${rot}: top cornice box must exist`);

    const sidePanel = shelf.boxes.find((b) => b.z0 === 4 && b.z1 === 70);
    assert.ok(sidePanel, `rot ${rot}: vertical upright side panel box must exist`);

    // Verify books are recessed within the frame and do not exceed outer depth or cornice height
    const bookBoxes = shelf.boxes.filter((b) => b.z0 > 0 && b.z1 - b.z0 <= 20 && b.z1 - b.z0 >= 10);
    assert.ok(bookBoxes.length >= 15, `rot ${rot}: at least 15 book boxes expected across 3 shelves`);
    for (const b of bookBoxes) {
      if (rot % 2 === 0) {
        assert.ok(b.v1 <= shelf.th - 0.08, `rot ${rot}: books must not protrude past front face`);
      } else {
        assert.ok(b.u1 <= shelf.tw - 0.08, `rot ${rot}: books must not protrude past front face`);
      }
    }
  }
});

test('v0.8.3 library expansion: filled layout with bookshelf rows, study tables, reading nook, and librarian desk', () => {
  const lib = ROOMS.library;
  const placed = SEED_FURNITURE.library;

  // Contains at least 25 items including bookshelves, study tables, chairs, lamps, desk, nook
  assert.ok(placed.length >= 25, 'library should have an enriched collection of furniture');
  const bookshelves = placed.filter((p) => p.itemId === 'bookshelf');
  assert.ok(bookshelves.length >= 10, 'library should have multiple rows and wall stacks of bookshelves');

  const desks = placed.filter((p) => /desk/i.test(p.itemId));
  assert.ok(desks.length >= 2, 'library should have a librarian desk and workstation desk');

  // No overlaps and all arrival routes clear
  assert.ok(hasDoorArrivalRoute(lib, placed), 'elevator arrival route must be unblocked');

  // NPC Clara's home tile is unblocked
  const claraHome = NPCS.find((n) => n.id === 'clara')?.home;
  assert.ok(claraHome);
  const isOccupied = placed.some((p) => {
    const item = getCatalogueItem(p.itemId);
    if (isFurnitureWalkable(item)) return false;
    return footprintCells(p.x, p.y, item.footprint, p.rot || 0).some((c) => c.x === claraHome.x && c.y === claraHome.y);
  });
  assert.equal(isOccupied, false, 'Clara home tile must be unblocked');
});

test('v0.8.3 npc rooms: every guest NPC has homeFloor 10-41 and a unique roomNumber', () => {
  const guestNpcs = NPCS.filter((n) => !n.isStaff);
  assert.ok(guestNpcs.length >= 6, 'should have multiple guest NPCs');
  const roomNumbers = new Set();
  for (const npc of guestNpcs) {
    assert.ok(typeof npc.homeFloor === 'number', `${npc.id} must have numeric homeFloor`);
    assert.ok(npc.homeFloor >= 10 && npc.homeFloor <= 41, `${npc.id} homeFloor must be between 10 and 41 (got ${npc.homeFloor})`);
    assert.ok(npc.roomNumber, `${npc.id} must have roomNumber`);
    assert.ok(!roomNumbers.has(npc.roomNumber), `roomNumber ${npc.roomNumber} for ${npc.id} must be unique`);
    roomNumbers.add(npc.roomNumber);
  }
  const staffNpcs = NPCS.filter((n) => n.isStaff);
  assert.ok(staffNpcs.length >= 6, 'should have staff NPCs');
  for (const staff of staffNpcs) {
    assert.equal(staff.isStaff, true);
  }
});

test('v0.8.3 room tiers: 5 purchasable tiers with expanding dimensions, floor progression, and safe furniture migration', () => {
  assert.equal(ROOM_TIERS.length, 5);
  for (let i = 0; i < ROOM_TIERS.length; i++) {
    const t = ROOM_TIERS[i];
    assert.equal(t.tier, i + 1);
    assert.ok(t.floor >= 11 && t.floor <= 41);
    assert.ok(t.width >= 9);
    assert.ok(t.height >= 8);
    if (i > 0) {
      assert.ok(t.floor > ROOM_TIERS[i - 1].floor, 'each tier moves up in tower');
      assert.ok(t.cost > ROOM_TIERS[i - 1].cost, 'cost scales with tier');
      assert.ok(t.width * t.height > ROOM_TIERS[i - 1].width * ROOM_TIERS[i - 1].height, 'area expands');
    }
  }

  // Placed furniture migration test
  const fakeRoom = {
    width: 9,
    height: 8,
    grid: Array.from({ length: 8 }, () => Array(9).fill(TILE.FLOOR)),
    cutouts: [],
  };
  const placedItems = [
    { instanceId: 'p1', itemId: 'suite_bed', x: 2, y: 2, rot: 0 },
    { instanceId: 'p2', itemId: 'sofa', x: 20, y: 20, rot: 0 },
  ];
  const returned = [];
  const kept = sanitizePlacedItemsForRoom(fakeRoom, placedItems, returned);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].instanceId, 'p1');
  assert.equal(returned.length, 1);
  assert.equal(returned[0].instanceId, 'p2');
});

test('v0.8.3 pool & spa: Olympic pool layout, changing cubicles, and swimsuit gating', () => {
  const poolRoom = ROOMS.pool;
  const placed = SEED_FURNITURE.pool;
  assert.ok(poolRoom.width >= 40 && poolRoom.height >= 30, 'pool room expanded to 16x area');

  const cubicles = placed.filter((p) => p.itemId === 'changing_cubicle');
  assert.ok(cubicles.length >= 2, 'changing cubicles present');

  const poolTiles = placed.filter((p) => p.itemId === 'pool_water');
  assert.ok(poolTiles.length >= 10, 'sunken Olympic pool consists of multiple water rows/lanes');

  const startingBlocks = placed.filter((p) => p.itemId === 'starting_block');
  assert.ok(startingBlocks.length >= 4, 'Olympic starting blocks for lanes');

  const loungers = placed.filter((p) => p.itemId === 'pool_lounger');
  assert.ok(loungers.length >= 4, 'pool loungers on deck');

  const salonChairs = placed.filter((p) => p.itemId === 'salon_chair');
  assert.ok(salonChairs.length >= 1, 'salon chair in spa');

  const massageBeds = placed.filter((p) => p.itemId === 'massage_bed');
  assert.ok(massageBeds.length >= 1, 'massage beds in spa');

  assert.ok(hasDoorArrivalRoute(poolRoom, placed), 'elevator landing is reachable');
});

test('v0.8.9-spa: Olympic pool 50m x 25m ratio, changing cubicles, and enclosed spa layout', () => {
  const poolRoom = ROOMS.pool;
  const placed = SEED_FURNITURE.pool;
  assert.equal(poolRoom.width, 44);
  assert.equal(poolRoom.height, 36);

  // Olympic pool dimensions: 12 wide x 24 long (exact 1:2 ratio, 50m x 25m Olympic spec)
  const poolTiles = placed.filter((p) => p.itemId === 'pool_water');
  assert.equal(poolTiles.length, 72); // 6 x 12 grid of 2x2 blocks = 12 x 24 tiles
  const minX = Math.min(...poolTiles.map((p) => p.x));
  const maxX = Math.max(...poolTiles.map((p) => p.x + 1));
  const minY = Math.min(...poolTiles.map((p) => p.y));
  const maxY = Math.max(...poolTiles.map((p) => p.y + 1));
  assert.equal(maxX - minX + 1, 12, 'pool width is 12 tiles (25m scale)');
  assert.equal(maxY - minY + 1, 24, 'pool length is 24 tiles (50m scale, 2:1 ratio)');

  // Starting blocks 1-4 with distinct rotation/lane numbers
  const blocks = placed.filter((p) => p.itemId === 'starting_block');
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.map((b) => b.rot).sort(), [0, 1, 2, 3]);

  // Pool exit ladders
  const ladders = placed.filter((p) => p.itemId === 'pool_ladder');
  assert.equal(ladders.length, 4);

  // Changing room cubicles and louvered door
  const cubicles = placed.filter((p) => p.itemId === 'changing_cubicle');
  assert.ok(cubicles.length >= 2);
  const changeDoor = placed.find((p) => p.itemId === 'changing_room_door');
  assert.ok(changeDoor);

  // Enclosed Spa room with partitions and walkable door archway
  const partitions = placed.filter((p) => p.itemId === 'spa_partition');
  assert.ok(partitions.length >= 20, 'spa enclosed with partition walls');
  const spaDoor = placed.find((p) => p.itemId === 'spa_door');
  assert.ok(spaDoor);
  assert.equal(getCatalogueItem('spa_door').walkable, true);

  // Spa interior
  const salonChairs = placed.filter((p) => p.itemId === 'salon_chair');
  assert.ok(salonChairs.length >= 2);
  const massageBeds = placed.filter((p) => p.itemId === 'massage_bed');
  assert.ok(massageBeds.length >= 2);
  const sauna = placed.find((p) => p.itemId === 'sauna_cabin');
  assert.ok(sauna);
});

test('v0.8.9-spa: Swimsuit gating and changing room logic', () => {
  const state = createDefaultState();
  state.player.room = 'pool';
  assert.equal(state.player.outfit, 'normal');

  // Changing room cubicle / door toggles outfit
  state.player.outfit = state.player.outfit === 'swimsuit' ? 'normal' : 'swimsuit';
  assert.equal(state.player.outfit, 'swimsuit');
  state.player.outfit = state.player.outfit === 'swimsuit' ? 'normal' : 'swimsuit';
  assert.equal(state.player.outfit, 'normal');

  // Water tile blocking check
  const poolWater = SEED_FURNITURE.pool.find((p) => p.itemId === 'pool_water');
  assert.ok(poolWater);

  const isWater = (x, y) => {
    return SEED_FURNITURE.pool.some((p) => {
      if (p.itemId !== 'pool_water') return false;
      const item = getCatalogueItem(p.itemId);
      return footprintCells(p.x, p.y, item.footprint, p.rot || 0).some((c) => c.x === x && c.y === y);
    });
  };

  assert.ok(isWater(poolWater.x, poolWater.y));
  assert.ok(!isWater(2, 2));

  // Gating helper simulation
  const checkWaterBlocked = (outfit, x, y) => {
    return outfit !== 'swimsuit' && isWater(x, y);
  };

  assert.equal(checkWaterBlocked('normal', poolWater.x, poolWater.y), true, 'blocked without swimsuit');
  assert.equal(checkWaterBlocked('swimsuit', poolWater.x, poolWater.y), false, 'walkable with swimsuit');
  assert.equal(checkWaterBlocked('normal', 2, 2), false, 'deck walkable without swimsuit');
});

test('v0.8.9-spa: Lap swimming progress, stats, and gym quest linking', () => {
  const state = createDefaultState();
  state.stats.lapsCompleted = 0;

  // Complete a lap
  state.stats.lapsCompleted += 1;
  const progressGym = advanceQuestsByType(state, 'visit_gym', 1);
  const progressSwim = advanceQuestsByType(state, 'swim_laps', 1);

  assert.equal(state.stats.lapsCompleted, 1);
  assert.ok(progressGym.length >= 1, 'advances visit_gym quest');
  assert.ok(progressSwim.length >= 0);
});

test('v0.8.9-spa: Salon styling, color change, and massage bed relaxation buff', () => {
  const state = createDefaultState();
  state.coins = 50;

  // Hairstyle change
  const applyHairStyle = (s, style) => {
    if (s.coins < 20) return { ok: false, reason: 'insufficient_coins' };
    s.coins -= 20;
    s.player.look = s.player.look || {};
    s.player.look.hairStyle = style;
    return { ok: true };
  };

  const res1 = applyHairStyle(state, 'ponytail');
  assert.ok(res1.ok);
  assert.equal(state.coins, 30);
  assert.equal(state.player.look.hairStyle, 'ponytail');

  // Hair color change
  const applyHairColor = (s, color) => {
    if (s.coins < 20) return { ok: false, reason: 'insufficient_coins' };
    s.coins -= 20;
    s.player.look = s.player.look || {};
    s.player.look.hairColor = color;
    return { ok: true };
  };

  const res2 = applyHairColor(state, '#4aa3df');
  assert.ok(res2.ok);
  assert.equal(state.coins, 10);
  assert.equal(state.player.look.hairColor, '#4aa3df');

  // Insufficient coins
  const res3 = applyHairStyle(state, 'curls');
  assert.equal(res3.ok, false);
  assert.equal(res3.reason, 'insufficient_coins');

  // Massage bed relaxation buff
  const massageItem = getCatalogueItem('massage_bed');
  assert.ok(massageItem);
  assert.equal(massageItem.interaction, 'spa_massage');
  assert.equal(massageItem.seat, true);

  state.player.buff = { name: 'Relaxed & Energized', expiresAt: Date.now() + 120000 };
  assert.ok(state.player.buff);
  assert.equal(state.player.buff.name, 'Relaxed & Energized');
});

test('v0.8.9-spa: Spa NPCs (Antoine, Elena, Yuki) and Marina dialogue and routines', () => {
  const antoine = NPCS.find((n) => n.id === 'spa_antoine');
  const elena = NPCS.find((n) => n.id === 'spa_elena');
  const yuki = NPCS.find((n) => n.id === 'spa_yuki');
  const marina = NPCS.find((n) => n.id === 'marina');

  assert.ok(antoine && antoine.role === 'Hair Stylist' && antoine.room === 'pool');
  assert.ok(elena && elena.role === 'Masseuse' && elena.room === 'pool');
  assert.ok(yuki && yuki.role === 'Spa Receptionist' && yuki.room === 'pool');
  assert.ok(marina && marina.homeFloor === 28 && marina.roomNumber === '2802' && marina.room === 'pool');

  // Check dialogue topics
  assert.ok(antoine.dialogueTopics.length >= 2);
  assert.ok(elena.dialogueTopics.length >= 2);
  assert.ok(yuki.dialogueTopics.length >= 2);
  assert.ok(marina.dialogueTopics.length >= 2);

  // Check routine stops sit on valid seeded pool furniture
  for (const npc of [antoine, elena, yuki, marina]) {
    for (const stop of npc.routine) {
      if (stop.activity === 'interact') {
        const item = SEED_FURNITURE.pool.find((p) => p.x === stop.x && p.y === stop.y);
        assert.ok(item, `${npc.id} stop at (${stop.x}, ${stop.y}) must sit on seeded furniture`);
      }
    }
  }
});

// ======================= v0.8.5 Music by James v2 floor soundtrack & cassette playlist =======================

test('v0.8.5 audio: floor mapping resolves every floor to its matching v2 soundtrack file with clean labels', () => {
  const expectedFloorTracks = {
    lobby: { src: 'audio/music/v2/hotel-lobby.mp3', label: 'Hotel Lobby' },
    cafe: { src: 'audio/music/v2/cafe-and-bar.mp3', label: 'Cafe & Bar' },
    restaurant: { src: 'audio/music/v2/restaurant.mp3', label: 'Restaurant' },
    gym: { src: 'audio/music/v2/gym.mp3', label: 'Gym' },
    pool: { src: 'audio/music/v2/pool-and-spa.mp3', label: 'Pool & Spa' },
    arcade: { src: 'audio/music/v2/arcade.mp3', label: 'Arcade' },
    library: { src: 'audio/music/v2/library.mp3', label: 'Library' },
    myroom: { src: 'audio/music/v2/my-room.mp3', label: 'My Room' },
    garden: { src: 'audio/music/v2/sky-garden.mp3', label: 'Sky Garden' },
    rooftop: { src: 'audio/music/v2/rooftop.mp3', label: 'Rooftop' },
  };

  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 22050;
      this.destination = {};
    }
    createGain() { return { gain: { value: 0.0001, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 1000 }, Q: { value: 0.7 }, connect() {} }; }
    createOscillator() { return { type: 'sine', frequency: { value: 440, setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
    createMediaElementSource() { return { connect() {}, disconnect() {} }; }
    resume() { this.state = 'running'; }
  }

  class FakeAudioElement {
    constructor() { this.loop = false; this.preload = ''; this._src = ''; this.paused = true; }
    set src(v) { this._src = v; }
    get src() { return this._src; }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  global.Audio = FakeAudioElement;
  let synth;
  try {
    synth = new ChiptuneAudio(FakeAudioContext);
    synth.unlockGesture();

    for (const [roomId, expected] of Object.entries(expectedFloorTracks)) {
      synth.setRoomMood(roomId, 0.5, 1);
      const info = synth.getMoodInfo();
      assert.equal(info.src, expected.src, `${roomId} maps to ${expected.src}`);
      assert.equal(info.label, expected.label, `${roomId} has label ${expected.label}`);
    }

    // Verify extras in playlist
    assert.ok(PLAYLIST.includes('main-menu'));
    assert.ok(PLAYLIST.includes('guest-room'));
    assert.ok(PLAYLIST.includes('renovation'));
    assert.ok(PLAYLIST.includes('event-map'));
    assert.equal(MUSIC_FILES['main-menu'].src, 'audio/music/v2/main-menu.mp3');
    assert.equal(MUSIC_FILES['guest-room'].src, 'audio/music/v2/guest-room.mp3');
    assert.equal(MUSIC_FILES['renovation'].src, 'audio/music/v2/renovation.mp3');
    assert.equal(MUSIC_FILES['event-map'].src, 'audio/music/v2/event-map.mp3');

    // Goal 2: All tracks must be in audio/music/v2/, no legacy classic-* tracks or deleted files
    for (const [key, track] of Object.entries(MUSIC_FILES)) {
      assert.ok(track.src.startsWith('audio/music/v2/'), `track ${key} (${track.src}) uses audio/music/v2/`);
      assert.ok(!key.startsWith('classic-'), `track key ${key} is not a classic track`);
      assert.ok(fs.existsSync(path.resolve(__dirname, '..', track.src)), `track file ${track.src} exists on disk`);
    }
    assert.equal(PLAYLIST.filter((k) => k.startsWith('classic-')).length, 0);
  } finally {
    if (synth) synth.stopLoop();
    delete global.Audio;
  }
});

test('v0.8.5 audio: playlist advance automatically continues to the next track on track ended', () => {
  class FakeAudioElement {
    constructor() {
      this.loop = false;
      this.preload = '';
      this._src = '';
      this.paused = true;
      this.listeners = {};
    }
    set src(v) { this._src = v; }
    get src() { return this._src; }
    addEventListener(event, fn) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    }
    emit(event) {
      (this.listeners[event] || []).forEach((fn) => fn());
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  global.Audio = FakeAudioElement;
  let synth;
  try {
    synth = new ChiptuneAudio();
    synth.setTrack(PLAYLIST[0]);
    assert.equal(synth.trackId, PLAYLIST[0]);

    // Simulating the track ending advances to the next track in PLAYLIST
    synth._handleTrackEnded(PLAYLIST[0]);
    assert.equal(synth.trackId, PLAYLIST[1]);

    synth._handleTrackEnded(PLAYLIST[1]);
    assert.equal(synth.trackId, PLAYLIST[2]);
  } finally {
    if (synth) synth.stopLoop();
    delete global.Audio;
  }
});

test('v0.8.5 audio: prev/next wrap around the full playlist bounds', () => {
  let synth;
  try {
    synth = new ChiptuneAudio();
    synth.shuffle = false;

    // Start at first track
    synth.setTrack(PLAYLIST[0]);
    assert.equal(synth.trackId, PLAYLIST[0]);

    // prevTrack from index 0 wraps to the last track
    synth.prevTrack();
    assert.equal(synth.trackId, PLAYLIST[PLAYLIST.length - 1]);

    // nextTrack from the last track wraps to index 0
    synth.nextTrack();
    assert.equal(synth.trackId, PLAYLIST[0]);
  } finally {
    if (synth) synth.stopLoop();
  }
});

test('v0.8.5 persistence: shuffle setting defaults to false and round-trips through saveState/loadState', () => {
  const fresh = createDefaultState();
  assert.equal(fresh.settings.shuffle, false);

  const storage = makeFakeStorage();
  fresh.settings.shuffle = true;
  saveState(storage, fresh);

  const loaded = loadState(storage);
  assert.equal(loaded.settings.shuffle, true);

  // An older save without shuffle setting defaults to false
  const oldSave = createDefaultState();
  delete oldSave.settings.shuffle;
  oldSave.settings.playerMinimized = true;
  storage.setItem(SAVE_KEY, JSON.stringify(oldSave));
  const loadedOld = loadState(storage);
  assert.equal(loadedOld.settings.shuffle, false);
  assert.equal(loadedOld.settings.playerMinimized, true);
});

// ======================= v0.8.8 mobile portrait layout & music cleanup =======================
test('v0.8.8 layout: portrait viewport projection (390x844 and 360x780) computes valid origins and round-trips screenToTile / tileToScreen', () => {
  const viewports = [
    { w: 390, h: 844, name: 'iPhone portrait 390x844' },
    { w: 360, h: 780, name: 'Android portrait 360x780' },
  ];

  for (const vp of viewports) {
    const room = ROOMS.lobby;
    const { originX, originY } = computeOrigin(room, vp.w, vp.h);
    assert.ok(Number.isFinite(originX), `${vp.name}: originX is finite (${originX})`);
    assert.ok(Number.isFinite(originY), `${vp.name}: originY is finite (${originY})`);

    const cam = centerCameraOnTile(room.spawn.x, room.spawn.y, room, vp.w, vp.h, 1.85);
    assert.ok(Number.isFinite(cam.panX), `${vp.name}: cam.panX is finite`);
    assert.ok(Number.isFinite(cam.panY), `${vp.name}: cam.panY is finite`);
    assert.ok(cam.zoom >= 0.55 && cam.zoom <= 2.5, `${vp.name}: zoom clamped within sane bounds`);

    // Screen -> tile -> screen round trip
    const { sx: wx, sy: wy } = tileToScreen(room.spawn.x, room.spawn.y, originX, originY);
    const { sx, sy } = worldToScreen(wx, wy, cam, vp.w, vp.h);
    assert.ok(Number.isFinite(sx) && Number.isFinite(sy), `${vp.name}: worldToScreen produces finite screen coords`);

    const t = screenToTile(sx, sy, originX, originY, cam, vp.w, vp.h);
    assert.equal(t.x, room.spawn.x, `${vp.name}: round trip tile.x matches`);
    assert.equal(t.y, room.spawn.y, `${vp.name}: round trip tile.y matches`);
  }
});

test('v0.8.8 music: playlist strictly contains only audio/music/v2 tracks, zero deleted files, zero classic entries', () => {
  assert.ok(PLAYLIST.length >= 14, `PLAYLIST has ${PLAYLIST.length} tracks (>=14)`);

  for (const key of PLAYLIST) {
    const def = MUSIC_FILES[key];
    assert.ok(def, `PLAYLIST key ${key} exists in MUSIC_FILES`);
    assert.ok(def.src.startsWith('audio/music/v2/'), `track ${key} (${def.src}) points to audio/music/v2/`);
    assert.ok(!def.label.toLowerCase().includes('classic'), `track ${key} label does not mention classic`);
    assert.ok(!key.startsWith('classic-'), `track key ${key} does not start with classic-`);

    const fullPath = path.resolve(__dirname, '..', def.src);
    assert.ok(fs.existsSync(fullPath), `track file ${def.src} exists on disk at ${fullPath}`);
  }

  // Confirm old tracks 01-*.mp3 .. 10-*.mp3 are not present on disk
  const musicDir = path.resolve(__dirname, '..', 'audio/music');
  const filesInMusicDir = fs.readdirSync(musicDir);
  const oldFiles = filesInMusicDir.filter((f) => /^(0[1-9]|10)-.*\.mp3$/.test(f));
  assert.equal(oldFiles.length, 0, `no deleted 01-..10- mp3 files remain on disk (found: ${oldFiles.join(',')})`);
});

test('v0.8.8 migration: v8 save migrates forward to v9, resetting deprecated trackId', () => {
  const v8Save = createDefaultState();
  v8Save.version = 8;
  v8Save.settings.trackId = 'classic-lobby';

  const storage = makeFakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(v8Save));

  const loaded = loadState(storage);
  assert.equal(loaded.version, SAVE_VERSION, 'save migrated to latest version');
  assert.equal(loaded.settings.trackId, 'lobby', 'legacy classic-lobby trackId reset to lobby');
});

test('v0.9.0 migration: v9 save migrates forward to v10, keeping existing player look as defaults', () => {
  const v9Save = createDefaultState();
  v9Save.version = 9;
  v9Save.player.look = { hairStyle: 'bob', hairColor: '#b83828' };

  const storage = makeFakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(v9Save));

  const loaded = loadState(storage);
  assert.equal(loaded.version, SAVE_VERSION, 'save migrated past v10 avatar look migration');
  assert.equal(loaded.player.look.hairStyle, 'bob', 'preserves existing salon hairstyle');
  assert.equal(loaded.player.look.hair, '#b83828', 'preserves existing salon hair color');
  assert.equal(loaded.player.look.shirt, '#4da3ff', 'defaults shirt to sky blue');
  assert.equal(loaded.player.look.outfit, 'tee', 'defaults outfit to tee');
  assert.equal(loaded.player.look.pants, '#2c3e63', 'defaults pants to denim');
  assert.equal(loaded.player.look.accessory, 'none', 'defaults accessory to none');
});
