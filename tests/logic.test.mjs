import test from 'node:test';
import assert from 'node:assert/strict';

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
import { createDefaultState, loadState, saveState, resetState, SAVE_KEY } from '../js/save.js';
import { getCatalogueItem, TILE, SAVE_VERSION, ROOMS, NPCS, CATALOGUE, SEED_FURNITURE, ITEM_CATEGORIES } from '../js/data.js';
import { respondToMessage, findWanderTarget, createNpcRuntime, tickNpc } from '../js/npc.js';
import { LOOKS, renderCharacter, buildParts } from '../js/voxel.js';
import { buildWindowSegment, FURNITURE_BUILDERS } from '../js/sprites.js';
import {
  tileToScreen, computeOrigin, computeGroundDy, computeCityGroundDy,
  projectIsoCityPoint, buildIsoCityLayout, computeCityVehicles, drawBackground,
  clampZoom, zoomAtPoint, centerCameraOnTile, screenToTile, worldToScreen,
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, deviceScale,
} from '../js/render.js';
import { ChiptuneAudio, MOOD_PROFILES, MUSIC_FILES, moodForRoom } from '../js/audio.js';

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
    assert.ok(s.w <= 128 && s.h <= 128, `unbounded dimensions for ${orientation} window`);
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

    // Gym floor resolves to the 04-gym.mp3 file and plays it (not the procedural fallback)
    synth.setRoomMood('gym', 0.5, 4);
    let info = synth.getMoodInfo();
    assert.equal(info.src, MUSIC_FILES.gym.src);
    assert.ok(info.src.endsWith('04-gym.mp3'));
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
