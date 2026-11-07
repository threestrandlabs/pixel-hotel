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
import { getCatalogueItem, TILE, SAVE_VERSION, ROOMS, NPCS, CATALOGUE } from '../js/data.js';
import { respondToMessage } from '../js/npc.js';
import { LOOKS, renderCharacter } from '../js/voxel.js';
import { buildWindowSegment, FURNITURE_BUILDERS } from '../js/sprites.js';

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
    assert.equal(item.category, 'decor');
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
    const isBlocked = (x, y) => room.grid[y][x] === TILE.WALL || room.grid[y][x] === TILE.WINDOW;
    const path = findPath(room.width, room.height, isBlocked, room.spawn, { x: elevDoor.x, y: elevDoor.y });
    assert.ok(path && path.length > 1, `expected walkable path from spawn to elevator door in ${room.id}`);
  }
});

test('v0.4.0 migration: v1 save migrates to v2 keeping coins, inventory, lobby/rooftop items and adding new rooms & My Room', () => {
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
  assert.equal(loaded.version, 2);
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
