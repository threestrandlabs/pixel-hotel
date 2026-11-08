// Anonymous auth + profile/friend-code identity for Pixel Hotel multiplayer.
//
// Every function here takes a Supabase client as its first argument instead
// of importing the singleton, so tests can pass a plain mock object instead
// of talking to a real project (see tests/multiplayer.unit.test.mjs).

import { normalizeFriendCode, validateDisplayName } from './filter.js';

/**
 * Ensures the current browser has an anonymous session, then creates (first
 * time) or fetches the caller's profile row, optionally applying a new
 * display name. Returns the profile { id, display_name, friend_code }.
 */
export async function signInAndEnsureProfile(client, displayName) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData || !sessionData.session) {
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  }

  let cleanName = null;
  if (displayName != null && String(displayName).trim().length > 0) {
    const validated = validateDisplayName(displayName);
    if (!validated.ok) throw new Error(`invalid_display_name:${validated.reason}`);
    cleanName = validated.text;
  }

  const { data, error } = await client.rpc('ensure_profile', { p_display_name: cleanName });
  if (error) throw error;
  return data;
}

/** Resolves a friend code to { ownerId, displayName }, or null if not found/invalid. */
export async function fetchOwnerByFriendCode(client, rawCode) {
  const code = normalizeFriendCode(rawCode);
  if (!code) return { ok: false, reason: 'invalid_code' };
  const { data, error } = await client.rpc('lookup_owner_by_friend_code', { p_code: code });
  if (error) return { ok: false, reason: 'rpc_error', error };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.owner_id) return { ok: false, reason: 'not_found' };
  return { ok: true, ownerId: row.owner_id, displayName: row.display_name };
}

/** Batch-resolves display names for a set of user ids (presence avatars). */
export async function fetchDisplayNames(client, userIds) {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return {};
  const { data, error } = await client.rpc('get_display_names', { p_ids: ids });
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.id] = row.display_name;
  return map;
}

/** Signs out of the multiplayer session only — never touches the single-player save. */
export async function signOutMultiplayer(client) {
  await client.auth.signOut();
}
