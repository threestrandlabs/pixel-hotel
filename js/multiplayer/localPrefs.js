// Purely local (device-only) multiplayer preferences: muted user ids and the
// last-used display name. Stored under their own localStorage key, entirely
// separate from js/save.js's SAVE_KEY, so this never touches or migrates
// single-player save data. Pure functions taking a storage-like object so
// they're unit-testable with a fake localStorage, matching js/save.js.

const PREFS_KEY = 'pixelHotel.mp.prefs.v1';

function readPrefs(storage) {
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return { mutedUserIds: [], displayName: null };
    const data = JSON.parse(raw);
    return {
      mutedUserIds: Array.isArray(data.mutedUserIds) ? data.mutedUserIds : [],
      displayName: typeof data.displayName === 'string' ? data.displayName : null,
    };
  } catch (e) {
    return { mutedUserIds: [], displayName: null };
  }
}

function writePrefs(storage, prefs) {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    // ignore — local mute/name memory is a nicety, not critical state
  }
}

export function getMutedUserIds(storage) {
  return new Set(readPrefs(storage).mutedUserIds);
}

export function setUserMuted(storage, userId, muted) {
  const prefs = readPrefs(storage);
  const set = new Set(prefs.mutedUserIds);
  if (muted) set.add(userId); else set.delete(userId);
  prefs.mutedUserIds = Array.from(set);
  writePrefs(storage, prefs);
  return set;
}

export function getLastDisplayName(storage) {
  return readPrefs(storage).displayName;
}

export function setLastDisplayName(storage, name) {
  const prefs = readPrefs(storage);
  prefs.displayName = name || null;
  writePrefs(storage, prefs);
}
