// Versioned save/load for Pixel Hotel. Pure functions that take a storage-like
// object ({getItem,setItem,removeItem}) so tests can pass a fake localStorage.

import { SAVE_VERSION, STARTING_COINS, ROOMS, SEED_FURNITURE, TILE, getCatalogueItem } from './data.js';
import { initQuestState } from './quests.js';
import { footprintCells, isFurnitureWalkable, isTileBlockedByFurniture } from './inventory.js';
import { DEFAULT_PLAYER_LOOK } from './avatar.js';

export const SAVE_KEY = 'pixelHotel.save.v1'; // gitleaks:allow
export const DEFAULT_ZOOM = 1.85;

export function createDefaultState() {
  const rooms = {};
  for (const id of Object.keys(ROOMS)) rooms[id] = {
    placed: (SEED_FURNITURE[id] || []).map((f, i) => ({ instanceId: `seed-${id}-${i}`, ...f })),
    lightsOn: true,
  };
  return {
    version: SAVE_VERSION,
    coins: STARTING_COINS,
    unlocked: [],
    inventory: [],
    rooms,
    quests: initQuestState(),
    player: { room: 'lobby', x: ROOMS.lobby.spawn.x, y: ROOMS.lobby.spawn.y, dir: 'down', sitting: null, activity: null, outfit: 'normal', roomTier: 1, look: { ...DEFAULT_PLAYER_LOOK } },
    avatarCustomized: false,
    stats: { greetedNpcs: [], visitedRooms: ['lobby'], placedCount: 0, myRoomPlacedCount: 0, activitiesUsed: [] },
    arcade: {
      dailyCoins: 0,
      lastRewardDate: '',
      highScores: {
        noodle_snake: [],
        brick_bash: [],
        block_drop: [],
      },
    },
    pool: {
      wins: 0,
      losses: 0,
      currentStreak: 0,
      bestStreak: 0,
    },
    gumballs: {
      counts: {},
      firstObtained: {},
      totalPulls: 0,
      lastTradeDate: '',
      tradesAcceptedToday: [],
    },
    minigames: {
      dailyCoins: 0,
      lastRewardDate: '',
    },
    settings: {
      muted: false,
      musicMuted: false,
      sfxMuted: false,
      ambienceMuted: false,
      masterVolume: 0.85,
      musicVolume: 0.75,
      sfxVolume: 0.75,
      ambienceVolume: 0.65,
      zoom: DEFAULT_ZOOM,
      autoFollowRoom: true,
      helpShown: false,
      playerMinimized: false,
      shuffle: false,
      followCamera: false,
    },
  };
}

export function sanitizePlacedItemsForRoom(roomDef, placedList, returnedInventory = []) {
  const accepted = [];
  const solidOccupied = new Set();
  const flatOccupied = new Set();
  const overheadOccupied = new Set();

  for (const p of placedList) {
    if (!p || typeof p !== 'object') continue;
    const item = getCatalogueItem(p.itemId);
    if (!item) continue;
    const rot = ((p.rot || 0) % 4 + 4) % 4;
    const cells = footprintCells(p.x, p.y, item.footprint, rot);
    const walkable = isFurnitureWalkable(item);

    // Check bounds, walls, doors, windows, VOID, and door landing clearance
    const validBounds = cells.every((c) => {
      if (c.x < 0 || c.y < 0 || c.x >= roomDef.width || c.y >= roomDef.height) return false;
      const cell = roomDef.grid[c.y][c.x];
      if (cell === TILE.WALL || cell === TILE.DOOR || cell === TILE.WINDOW || cell === TILE.VOID) return false;
      if (!walkable && c.y === 1 && roomDef.grid[0] && roomDef.grid[0][c.x] === TILE.DOOR) return false;
      return true;
    });
    if (!validBounds) {
      if (p.instanceId && !String(p.instanceId).startsWith('seed-')) {
        returnedInventory.push({ instanceId: p.instanceId, itemId: p.itemId });
      }
      continue;
    }

    const occSet = item.overhead ? overheadOccupied : (item.flat ? flatOccupied : solidOccupied);
    const overlaps = cells.some((c) => occSet.has(`${c.x},${c.y}`));
    if (!overlaps) {
      for (const c of cells) occSet.add(`${c.x},${c.y}`);
      accepted.push({ ...p, rot });
      continue;
    }

    // Relocate overlapping item to nearest free tile in the room, or return to inventory
    let relocated = false;
    for (let y = 1; y < roomDef.height && !relocated; y++) {
      for (let x = 1; x < roomDef.width && !relocated; x++) {
        const tryCells = footprintCells(x, y, item.footprint, rot);
        const ok = tryCells.every((c) => {
          if (c.x < 1 || c.y < 1 || c.x >= roomDef.width || c.y >= roomDef.height) return false;
          const cell = roomDef.grid[c.y][c.x];
          if (cell !== TILE.FLOOR) return false;
          if (!walkable && c.y === 1 && roomDef.grid[0] && roomDef.grid[0][c.x] === TILE.DOOR) return false;
          return !occSet.has(`${c.x},${c.y}`);
        });
        if (ok) {
          for (const c of tryCells) occSet.add(`${c.x},${c.y}`);
          accepted.push({ ...p, x, y, rot });
          relocated = true;
        }
      }
    }
    if (!relocated && p.instanceId && !String(p.instanceId).startsWith('seed-')) {
      returnedInventory.push({ instanceId: p.instanceId, itemId: p.itemId });
    }
  }
  return accepted;
}

// Migration chain: each entry upgrades a save from its key version to key+1.
const MIGRATIONS = {
  0: (old) => ({ ...createDefaultState(), ...old, version: 1 }),
  1: (old) => {
    const def = createDefaultState();
    const mergedRooms = { ...def.rooms };
    if (old.rooms && typeof old.rooms === 'object') {
      for (const [roomId, rState] of Object.entries(old.rooms)) {
        if (rState && Array.isArray(rState.placed)) {
          mergedRooms[roomId] = { ...mergedRooms[roomId], ...rState };
        }
      }
    }
    const mergedQuests = { ...def.quests };
    if (old.quests && typeof old.quests === 'object') {
      for (const [qId, qState] of Object.entries(old.quests)) {
        if (qState && typeof qState === 'object') {
          mergedQuests[qId] = { ...mergedQuests[qId], ...qState };
        }
      }
    }
    return {
      ...def,
      ...old,
      version: 2,
      rooms: mergedRooms,
      quests: mergedQuests,
      player: { ...def.player, ...(old.player || {}) },
      stats: { ...def.stats, ...(old.stats || {}) },
      settings: { ...def.settings, ...(old.settings || {}) },
    };
  },
  2: (old) => {
    const def = createDefaultState();
    const mergedRooms = { ...def.rooms };
    if (old.rooms && typeof old.rooms === 'object') {
      for (const [roomId, rState] of Object.entries(old.rooms)) {
        const roomDef = ROOMS[roomId];
        if (!roomDef || !rState || !Array.isArray(rState.placed)) continue;
        // Drop any item whose footprint falls on a VOID cutout tile (incl. legacy v0.5 lobby 10,7)
        const isLegacyV2Void = (rId, c) => rId === 'lobby' && c.x >= 10 && c.x <= 11 && c.y >= 7 && c.y <= 8;
        const validPlaced = rState.placed.filter((p) => {
          const item = getCatalogueItem(p.itemId);
          if (!item) return false;
          const cells = footprintCells(p.x, p.y, item.footprint, p.rot || 0);
          return cells.every((c) => (
            c.x >= 0 && c.y >= 0 && c.x < roomDef.width && c.y < roomDef.height &&
            roomDef.grid[c.y][c.x] !== TILE.VOID && !isLegacyV2Void(roomId, c)
          ));
        });
        mergedRooms[roomId] = { ...mergedRooms[roomId], ...rState, placed: validPlaced };
      }
    }
    const playerRoom = old.player?.room && ROOMS[old.player.room] ? old.player.room : 'lobby';
    const roomDef = ROOMS[playerRoom];
    let px = typeof old.player?.x === 'number' ? old.player.x : roomDef.spawn.x;
    let py = typeof old.player?.y === 'number' ? old.player.y : roomDef.spawn.y;
    const onLegacyLobbyCutout = playerRoom === 'lobby' && px >= 10 && px <= 11 && py >= 7 && py <= 8;
    if (py < 0 || px < 0 || py >= roomDef.height || px >= roomDef.width || roomDef.grid[py][px] === TILE.VOID || onLegacyLobbyCutout) {
      px = roomDef.spawn.x;
      py = roomDef.spawn.y;
    }
    return {
      ...def,
      ...old,
      version: 3,
      rooms: mergedRooms,
      quests: { ...def.quests, ...(old.quests || {}) },
      player: { ...def.player, ...(old.player || {}), room: playerRoom, x: px, y: py, activity: old.player?.activity || null },
      stats: { ...def.stats, ...(old.stats || {}), activitiesUsed: old.stats?.activitiesUsed || [] },
      settings: { ...def.settings, ...(old.settings || {}) },
    };
  },
  3: (old) => {
    const def = createDefaultState();
    const mergedRooms = { ...def.rooms };
    const returnedInventory = Array.isArray(old.inventory) ? [...old.inventory] : [];

    if (old.rooms && typeof old.rooms === 'object') {
      for (const [roomId, rState] of Object.entries(old.rooms)) {
        const roomDef = ROOMS[roomId];
        if (!roomDef || !rState || !Array.isArray(rState.placed)) continue;
        // If lobby only had the old v0.6 13-item seed set, upgrade to the v0.7 Grand Lobby seed
        const isUnmodifiedOldLobbySeed = (
          roomId === 'lobby' &&
          rState.placed.length === 13 &&
          rState.placed.every((p) => String(p.instanceId || '').startsWith('seed-lobby-'))
        );
        if (isUnmodifiedOldLobbySeed) {
          mergedRooms[roomId] = { placed: def.rooms.lobby.placed };
        } else {
          mergedRooms[roomId] = {
            ...mergedRooms[roomId],
            ...rState,
            placed: sanitizePlacedItemsForRoom(roomDef, rState.placed, returnedInventory),
          };
        }
      }
    }

    const mergedQuests = { ...def.quests };
    if (old.quests && typeof old.quests === 'object') {
      for (const [qId, qState] of Object.entries(old.quests)) {
        if (qState && typeof qState === 'object') {
          mergedQuests[qId] = { ...mergedQuests[qId], ...qState };
        }
      }
    }

    const playerRoom = old.player?.room && ROOMS[old.player.room] ? old.player.room : 'lobby';
    const roomDef = ROOMS[playerRoom];
    const placedInPlayerRoom = mergedRooms[playerRoom]?.placed || [];
    let px = typeof old.player?.x === 'number' ? old.player.x : roomDef.spawn.x;
    let py = typeof old.player?.y === 'number' ? old.player.y : roomDef.spawn.y;
    const tileInvalid = (
      py <= 0 || px <= 0 || py >= roomDef.height || px >= roomDef.width ||
      roomDef.grid[py][px] !== TILE.FLOOR ||
      (!old.player?.sitting && isTileBlockedByFurniture(placedInPlayerRoom, px, py))
    );
    if (tileInvalid) {
      px = roomDef.spawn.x;
      py = roomDef.spawn.y;
    }

    return {
      ...def,
      ...old,
      version: 4,
      inventory: returnedInventory,
      rooms: mergedRooms,
      quests: mergedQuests,
      player: { ...def.player, ...(old.player || {}), room: playerRoom, x: px, y: py, activity: old.player?.activity || null },
      stats: { ...def.stats, ...(old.stats || {}), activitiesUsed: old.stats?.activitiesUsed || [] },
      settings: { ...def.settings, ...(old.settings || {}) },
    };
  },
  4: (old) => {
    const def = createDefaultState();
    const mergedRooms = { ...def.rooms };
    if (old.rooms && typeof old.rooms === 'object') {
      for (const [roomId, rState] of Object.entries(old.rooms)) {
        if (!def.rooms[roomId] || !rState || typeof rState !== 'object') continue;
        mergedRooms[roomId] = {
          ...mergedRooms[roomId],
          ...rState,
          lightsOn: typeof rState.lightsOn === 'boolean' ? rState.lightsOn : true,
        };
      }
    }
    return { ...def, ...old, version: 5, rooms: mergedRooms };
  },
  5: (old) => {
    const def = createDefaultState();
    const mergedRooms = { ...def.rooms };
    const returnedInventory = Array.isArray(old.inventory) ? [...old.inventory] : [];

    if (old.rooms && typeof old.rooms === 'object') {
      for (const [roomId, rState] of Object.entries(old.rooms)) {
        const roomDef = ROOMS[roomId];
        if (!roomDef || !rState || !Array.isArray(rState.placed)) continue;
        const allSeed = rState.placed.length > 0 && rState.placed.every((p) => String(p.instanceId || '').startsWith(`seed-${roomId}-`));
        if (allSeed && roomId !== 'myroom') {
          mergedRooms[roomId] = {
            ...mergedRooms[roomId],
            ...rState,
            placed: def.rooms[roomId].placed,
          };
        } else {
          mergedRooms[roomId] = {
            ...mergedRooms[roomId],
            ...rState,
            placed: sanitizePlacedItemsForRoom(roomDef, rState.placed, returnedInventory),
          };
        }
      }
    }

    const mergedQuests = { ...def.quests };
    if (old.quests && typeof old.quests === 'object') {
      for (const [qId, qState] of Object.entries(old.quests)) {
        if (qState && typeof qState === 'object') {
          mergedQuests[qId] = { ...mergedQuests[qId], ...qState };
        }
      }
    }

    const playerRoom = old.player?.room && ROOMS[old.player.room] ? old.player.room : 'lobby';
    const roomDef = ROOMS[playerRoom];
    const placedInPlayerRoom = mergedRooms[playerRoom]?.placed || [];
    let px = typeof old.player?.x === 'number' ? old.player.x : roomDef.spawn.x;
    let py = typeof old.player?.y === 'number' ? old.player.y : roomDef.spawn.y;
    const tileInvalid = (
      py <= 0 || px <= 0 || py >= roomDef.height || px >= roomDef.width ||
      roomDef.grid[py][px] !== TILE.FLOOR ||
      (!old.player?.sitting && isTileBlockedByFurniture(placedInPlayerRoom, px, py))
    );
    if (tileInvalid) {
      px = roomDef.spawn.x;
      py = roomDef.spawn.y;
    }

    return {
      ...def,
      ...old,
      version: 6,
      inventory: returnedInventory,
      rooms: mergedRooms,
      quests: mergedQuests,
      player: { ...def.player, ...(old.player || {}), room: playerRoom, x: px, y: py, activity: old.player?.activity || null },
      stats: { ...def.stats, ...(old.stats || {}), activitiesUsed: old.stats?.activitiesUsed || [] },
      settings: { ...def.settings, ...(old.settings || {}) },
    };
  },
  6: (old) => {
    const def = createDefaultState();
    const mergedRooms = { ...def.rooms };
    const returnedInventory = Array.isArray(old.inventory) ? [...old.inventory] : [];

    if (old.rooms && typeof old.rooms === 'object') {
      for (const [roomId, rState] of Object.entries(old.rooms)) {
        const roomDef = ROOMS[roomId];
        if (!roomDef || !rState || !Array.isArray(rState.placed)) continue;
        const allSeed = rState.placed.length > 0 && rState.placed.every((p) => String(p.instanceId || '').startsWith(`seed-${roomId}-`));
        if (allSeed && roomId !== 'myroom') {
          mergedRooms[roomId] = {
            ...mergedRooms[roomId],
            ...rState,
            placed: def.rooms[roomId].placed,
          };
        } else {
          mergedRooms[roomId] = {
            ...mergedRooms[roomId],
            ...rState,
            placed: sanitizePlacedItemsForRoom(roomDef, rState.placed, returnedInventory),
          };
        }
      }
    }

    const mergedQuests = { ...def.quests };
    if (old.quests && typeof old.quests === 'object') {
      for (const [qId, qState] of Object.entries(old.quests)) {
        if (qState && typeof qState === 'object') {
          mergedQuests[qId] = { ...mergedQuests[qId], ...qState };
        }
      }
    }

    const playerRoom = old.player?.room && ROOMS[old.player.room] ? old.player.room : 'lobby';
    const roomDef = ROOMS[playerRoom];
    const placedInPlayerRoom = mergedRooms[playerRoom]?.placed || [];
    let px = typeof old.player?.x === 'number' ? old.player.x : roomDef.spawn.x;
    let py = typeof old.player?.y === 'number' ? old.player.y : roomDef.spawn.y;
    const tileInvalid = (
      py <= 0 || px <= 0 || py >= roomDef.height || px >= roomDef.width ||
      roomDef.grid[py][px] !== TILE.FLOOR ||
      (!old.player?.sitting && isTileBlockedByFurniture(placedInPlayerRoom, px, py))
    );
    if (tileInvalid) {
      px = roomDef.spawn.x;
      py = roomDef.spawn.y;
    }

    const oldPlayer = old.player || {};
    return {
      ...def,
      ...old,
      version: 7,
      inventory: returnedInventory,
      rooms: mergedRooms,
      quests: mergedQuests,
      player: {
        ...def.player,
        ...oldPlayer,
        room: playerRoom,
        x: px,
        y: py,
        activity: oldPlayer.activity || null,
        outfit: oldPlayer.outfit || 'normal',
        roomTier: oldPlayer.roomTier || 1,
      },
      stats: { ...def.stats, ...(old.stats || {}), activitiesUsed: old.stats?.activitiesUsed || [] },
      settings: { ...def.settings, ...(old.settings || {}) },
    };
  },
  7: (old) => {
    const def = createDefaultState();
    const mergedRooms = { ...def.rooms };
    const returnedInventory = Array.isArray(old.inventory) ? [...old.inventory] : [];

    if (old.rooms && typeof old.rooms === 'object') {
      for (const [roomId, rState] of Object.entries(old.rooms)) {
        const roomDef = ROOMS[roomId];
        if (!roomDef || !rState || !Array.isArray(rState.placed)) continue;
        const allSeed = rState.placed.length > 0 && rState.placed.every((p) => String(p.instanceId || '').startsWith(`seed-${roomId}-`));
        if (allSeed && roomId !== 'myroom') {
          mergedRooms[roomId] = {
            ...mergedRooms[roomId],
            ...rState,
            placed: def.rooms[roomId].placed,
          };
        } else {
          mergedRooms[roomId] = {
            ...mergedRooms[roomId],
            ...rState,
            placed: sanitizePlacedItemsForRoom(roomDef, rState.placed, returnedInventory),
          };
        }
      }
    }

    const mergedQuests = { ...def.quests };
    if (old.quests && typeof old.quests === 'object') {
      for (const [qId, qState] of Object.entries(old.quests)) {
        if (qState && typeof qState === 'object') {
          mergedQuests[qId] = { ...mergedQuests[qId], ...qState };
        }
      }
    }

    const playerRoom = old.player?.room && ROOMS[old.player.room] ? old.player.room : 'lobby';
    const roomDef = ROOMS[playerRoom];
    const placedInPlayerRoom = mergedRooms[playerRoom]?.placed || [];
    let px = typeof old.player?.x === 'number' ? old.player.x : roomDef.spawn.x;
    let py = typeof old.player?.y === 'number' ? old.player.y : roomDef.spawn.y;
    const tileInvalid = (
      py <= 0 || px <= 0 || py >= roomDef.height || px >= roomDef.width ||
      roomDef.grid[py][px] !== TILE.FLOOR ||
      (!old.player?.sitting && isTileBlockedByFurniture(placedInPlayerRoom, px, py))
    );
    if (tileInvalid) {
      px = roomDef.spawn.x;
      py = roomDef.spawn.y;
    }

    const oldPlayer = old.player || {};
    const oldArcade = (old.arcade && typeof old.arcade === 'object') ? old.arcade : {};
    return {
      ...def,
      ...old,
      version: 8,
      inventory: returnedInventory,
      rooms: mergedRooms,
      quests: mergedQuests,
      player: {
        ...def.player,
        ...oldPlayer,
        room: playerRoom,
        x: px,
        y: py,
        activity: oldPlayer.activity || null,
        outfit: oldPlayer.outfit || 'normal',
        roomTier: oldPlayer.roomTier || 1,
      },
      stats: { ...def.stats, ...(old.stats || {}), activitiesUsed: old.stats?.activitiesUsed || [] },
      settings: { ...def.settings, ...(old.settings || {}) },
      arcade: {
        dailyCoins: typeof oldArcade.dailyCoins === 'number' ? oldArcade.dailyCoins : 0,
        lastRewardDate: typeof oldArcade.lastRewardDate === 'string' ? oldArcade.lastRewardDate : '',
        highScores: (oldArcade.highScores && typeof oldArcade.highScores === 'object')
          ? { ...def.arcade.highScores, ...oldArcade.highScores }
          : { ...def.arcade.highScores },
      },
    };
  },
  8: (old) => {
    const def = createDefaultState();
    const oldSettings = (old.settings && typeof old.settings === 'object') ? { ...old.settings } : {};
    if (oldSettings.trackId && (String(oldSettings.trackId).startsWith('classic-') || !oldSettings.trackId)) {
      oldSettings.trackId = 'lobby';
    }
    return {
      ...def,
      ...old,
      version: 9,
      settings: { ...def.settings, ...oldSettings },
    };
  },
  // v0.9.0: adds player avatar look (skin, hair, top, bottom, shoes, accessory).
  9: (old) => {
    const def = createDefaultState();
    const oldPlayer = (old.player && typeof old.player === 'object') ? { ...old.player } : {};
    const existingLook = (oldPlayer.look && typeof oldPlayer.look === 'object') ? oldPlayer.look : {};
    const mergedLook = {
      ...DEFAULT_PLAYER_LOOK,
      ...existingLook,
      hair: existingLook.hair || existingLook.hairColor || DEFAULT_PLAYER_LOOK.hair,
      hairStyle: existingLook.hairStyle || DEFAULT_PLAYER_LOOK.hairStyle,
    };
    return {
      ...def,
      ...old,
      version: 10,
      player: {
        ...def.player,
        ...oldPlayer,
        look: mergedLook,
      },
    };
  },
  // v0.9.1: adds arcade Pool (8-ball) win/streak stats and the local Gumball
  // collection (counts, first-obtained dates, trade history).
  10: (old) => {
    const def = createDefaultState();
    const oldPool = (old.pool && typeof old.pool === 'object') ? old.pool : {};
    const oldGumballs = (old.gumballs && typeof old.gumballs === 'object') ? old.gumballs : {};
    return {
      ...def,
      ...old,
      version: 11,
      pool: {
        wins: typeof oldPool.wins === 'number' ? oldPool.wins : 0,
        losses: typeof oldPool.losses === 'number' ? oldPool.losses : 0,
        currentStreak: typeof oldPool.currentStreak === 'number' ? oldPool.currentStreak : 0,
        bestStreak: typeof oldPool.bestStreak === 'number' ? oldPool.bestStreak : 0,
      },
      gumballs: {
        counts: (oldGumballs.counts && typeof oldGumballs.counts === 'object') ? { ...oldGumballs.counts } : {},
        firstObtained: (oldGumballs.firstObtained && typeof oldGumballs.firstObtained === 'object') ? { ...oldGumballs.firstObtained } : {},
        totalPulls: typeof oldGumballs.totalPulls === 'number' ? oldGumballs.totalPulls : 0,
        lastTradeDate: typeof oldGumballs.lastTradeDate === 'string' ? oldGumballs.lastTradeDate : '',
        tradesAcceptedToday: Array.isArray(oldGumballs.tradesAcceptedToday) ? [...oldGumballs.tradesAcceptedToday] : [],
      },
    };
  },
  // v0.11.0: adds party mini-game daily coin reward tracking.
  11: (old) => {
    const def = createDefaultState();
    const oldMinigames = (old.minigames && typeof old.minigames === 'object') ? old.minigames : {};
    return {
      ...def,
      ...old,
      version: 12,
      minigames: {
        dailyCoins: typeof oldMinigames.dailyCoins === 'number' ? oldMinigames.dailyCoins : 0,
        lastRewardDate: typeof oldMinigames.lastRewardDate === 'string' ? oldMinigames.lastRewardDate : '',
      },
    };
  },
  // v0.11.1: adds the "Follow camera" toggle, defaulting existing players to off
  // (their camera already behaved like the new off-mode, so this is a no-op for them).
  12: (old) => {
    const def = createDefaultState();
    const oldSettings = (old.settings && typeof old.settings === 'object') ? old.settings : {};
    return {
      ...def,
      ...old,
      version: 13,
      settings: {
        ...def.settings,
        ...oldSettings,
        followCamera: false,
      },
    };
  },
};

function migrate(data) {
  let current = data;
  let version = typeof current.version === 'number' ? current.version : 0;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    version = current.version;
  }
  return current;
}

function isPlausibleState(data) {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.coins === 'number' &&
    data.rooms &&
    typeof data.rooms === 'object' &&
    data.player &&
    typeof data.player.x === 'number'
  );
}

export function saveState(storage, state) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Loads and validates a save. Falls back to a fresh default state if the
 * stored value is missing, corrupt JSON, or structurally implausible.
 */
export function loadState(storage) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (e) {
    return createDefaultState();
  }
  if (!raw) return createDefaultState();

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return createDefaultState();
  }

  if (!data || typeof data !== 'object') return createDefaultState();

  if (data.version !== SAVE_VERSION) {
    data = migrate(data);
  }

  if (!isPlausibleState(data)) return createDefaultState();

  // Fill in any missing fields from a default (forward-compat safety net).
  const def = createDefaultState();
  const playerRoom = data.player?.room && ROOMS[data.player.room] ? data.player.room : 'lobby';
  const rawSettings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const mergedSettings = { ...def.settings, ...rawSettings };
  if (typeof rawSettings.musicMuted !== 'boolean' && typeof rawSettings.muted === 'boolean') {
    mergedSettings.musicMuted = rawSettings.muted;
  }
  if (typeof rawSettings.sfxMuted !== 'boolean' && typeof rawSettings.muted === 'boolean') {
    mergedSettings.sfxMuted = rawSettings.muted;
  }
  if (typeof mergedSettings.zoom !== 'number' || !Number.isFinite(mergedSettings.zoom)) {
    mergedSettings.zoom = DEFAULT_ZOOM;
  } else {
    mergedSettings.zoom = Math.max(0.55, Math.min(2.5, mergedSettings.zoom));
  }
  if (typeof mergedSettings.masterVolume !== 'number' || !Number.isFinite(mergedSettings.masterVolume)) {
    mergedSettings.masterVolume = def.settings.masterVolume;
  }
  if (typeof mergedSettings.ambienceVolume !== 'number' || !Number.isFinite(mergedSettings.ambienceVolume)) {
    mergedSettings.ambienceVolume = def.settings.ambienceVolume;
  }
  if (typeof rawSettings.playerMinimized === 'boolean') {
    mergedSettings.playerMinimized = rawSettings.playerMinimized;
  } else {
    mergedSettings.playerMinimized = false;
  }
  if (typeof rawSettings.shuffle === 'boolean') {
    mergedSettings.shuffle = rawSettings.shuffle;
  } else {
    mergedSettings.shuffle = false;
  }
  if (typeof rawSettings.followCamera === 'boolean') {
    mergedSettings.followCamera = rawSettings.followCamera;
  } else {
    mergedSettings.followCamera = false;
  }
  mergedSettings.muted = !!(mergedSettings.musicMuted && mergedSettings.sfxMuted);
  return {
    ...def,
    ...data,
    rooms: { ...def.rooms, ...data.rooms },
    quests: { ...def.quests, ...data.quests },
    player: { ...def.player, ...data.player, room: playerRoom, look: { ...def.player.look, ...(data.player?.look || {}) } },
    stats: { ...def.stats, ...data.stats },
    settings: mergedSettings,
  };
}

export function resetState(storage) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch (e) {
    // ignore
  }
  return createDefaultState();
}
