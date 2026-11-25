// Cross-device cloud save: pure logic (no DOM, no network).
//
// The cloud row holds the whole save except `settings` (zoom, volumes,
// graphics detail ...), which stay per-device. Sync bookkeeping lives in its
// own localStorage key so the game save format never changes.
//
// "meta" = what this device last agreed with the cloud:
//   { userId, rev, hash }  rev  = cloud revision last pushed/pulled
//                          hash = fingerprint of the local save at that time
// plus { enabled } so a returning signed-in player auto-syncs on load, and
// { rehashOnLoad } set right before the page reloads with a pulled save.

import { STARTING_COINS } from '../data.js';

export const CLOUD_META_KEY = 'pixelHotel.cloud.v1'; // gitleaks:allow

/** The part of the save that travels between devices. */
export function cloudPayload(state) {
  const { settings, ...rest } = state || {};
  return rest;
}

/** Merges a pulled cloud payload with this device's own settings. */
export function mergeCloudIntoLocal(cloudData, localState) {
  return { ...cloudData, settings: localState && localState.settings ? localState.settings : cloudData.settings };
}

/** FNV-1a over the JSON of the cloud payload: cheap change detection. */
export function saveFingerprint(state) {
  const text = JSON.stringify(cloudPayload(state));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + ':' + text.length.toString(16);
}

/** True when the save holds anything a player would be sad to lose. */
export function hasMeaningfulProgress(state) {
  if (!state || typeof state !== 'object') return false;
  const stats = state.stats || {};
  return (
    (typeof state.coins === 'number' && state.coins !== STARTING_COINS) ||
    (Array.isArray(state.inventory) && state.inventory.length > 0) ||
    (Array.isArray(state.unlocked) && state.unlocked.length > 0) ||
    (stats.placedCount || 0) > 0 ||
    (Array.isArray(stats.greetedNpcs) && stats.greetedNpcs.length > 0) ||
    (Array.isArray(stats.visitedRooms) && stats.visitedRooms.length > 1) ||
    state.avatarCustomized === true ||
    ((state.gumballs && state.gumballs.totalPulls) || 0) > 0 ||
    ((state.player && state.player.roomTier) || 1) > 1
  );
}

/** Short human summary for the "which save do you want?" dialog. */
export function summarizeSave(state) {
  const quests = state && state.quests && typeof state.quests === 'object' ? Object.values(state.quests) : [];
  const questsDone = quests.filter((q) => q && (q.complete || q.claimed)).length;
  const placedMine = state && state.rooms && state.rooms.myroom && Array.isArray(state.rooms.myroom.placed)
    ? state.rooms.myroom.placed.length : 0;
  const inv = state && Array.isArray(state.inventory) ? state.inventory.length : 0;
  return {
    coins: state && typeof state.coins === 'number' ? state.coins : 0,
    items: inv + placedMine,
    questsDone,
    roomTier: (state && state.player && state.player.roomTier) || 1,
  };
}

/**
 * Decides what to do when this device and the cloud meet.
 *   local: { hash, hasProgress }   cloud: { rev } | null
 *   meta:  stored sync meta (may be empty)   userId: signed-in account
 * Returns 'none' | 'push' | 'pull' | 'conflict'.
 */
export function decideSync({ local, cloud, meta, userId }) {
  const m = meta || {};
  const sameUser = !!userId && m.userId === userId;
  const localChanged = !sameUser || local.hash !== m.hash;

  if (!cloud) return 'push';
  if (sameUser && cloud.rev === m.rev) return localChanged ? 'push' : 'none';
  // The cloud moved on (another device saved) or this device never synced
  // with this account.
  if (!localChanged) return 'pull';
  if (!local.hasProgress) return 'pull';
  return 'conflict';
}

export function readCloudMeta(storage) {
  try {
    const raw = storage.getItem(CLOUD_META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeCloudMeta(storage, meta) {
  try {
    storage.setItem(CLOUD_META_KEY, JSON.stringify(meta || {}));
  } catch (e) { /* storage full / blocked: sync just re-checks next time */ }
}

export function clearCloudMeta(storage) {
  try { storage.removeItem(CLOUD_META_KEY); } catch (e) { /* ignore */ }
}

/** True for errors the server raises when another device saved first. */
export function isConflictError(error) {
  if (!error) return false;
  const msg = String(error.message || error);
  return msg.includes('save_conflict') || error.code === '40001' || error.code === '23505';
}
