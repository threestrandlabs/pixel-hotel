// Versioned save/load for Pixel Hotel. Pure functions that take a storage-like
// object ({getItem,setItem,removeItem}) so tests can pass a fake localStorage.

import { SAVE_VERSION, STARTING_COINS, ROOMS } from './data.js';
import { initQuestState } from './quests.js';

export const SAVE_KEY = 'pixelHotel.save.v1';

export function createDefaultState() {
  const rooms = {};
  for (const id of Object.keys(ROOMS)) rooms[id] = { placed: [] };
  return {
    version: SAVE_VERSION,
    coins: STARTING_COINS,
    unlocked: [],
    inventory: [],
    rooms,
    quests: initQuestState(),
    player: { room: 'lobby', x: ROOMS.lobby.spawn.x, y: ROOMS.lobby.spawn.y, dir: 'down', sitting: null },
    stats: { greetedNpcs: [], visitedRooms: ['lobby'], placedCount: 0 },
    settings: { muted: true, helpShown: false },
  };
}

// Migration chain: each entry upgrades a save from its key version to key+1.
// Kept intentionally simple since this is the first shipped version, but the
// structure allows adding future migrations without touching load logic.
const MIGRATIONS = {
  0: (old) => ({ ...createDefaultState(), ...old, version: 1 }),
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
  return {
    ...def,
    ...data,
    rooms: { ...def.rooms, ...data.rooms },
    quests: { ...def.quests, ...data.quests },
    player: { ...def.player, ...data.player },
    stats: { ...def.stats, ...data.stats },
    settings: { ...def.settings, ...data.settings },
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
