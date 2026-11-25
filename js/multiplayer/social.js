// Friends & presence, room showcase and gumball trade calls. Every function
// takes the Supabase client first (same pattern as auth.js) so tests can pass
// a fake. Server rules live in supabase/migrations/0006_v014_social.sql.

import { normalizeFriendCode } from './filter.js';

export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const PRESENCE_INTERVAL_MS = 60 * 1000;

function reasonOf(error) {
  const msg = String((error && error.message) || error || '');
  for (const r of ['unknown_code', 'cannot_add_self', 'too_many_friends', 'not_connected', 'not_mutual_friends',
    'too_many_pending', 'bad_transition', 'no_such_trade', 'not_in_showcase', 'cannot_like_own_room']) {
    if (msg.includes(r)) return r;
  }
  return 'error';
}

export function isOnline(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now - t < ONLINE_WINDOW_MS;
}

export async function touchPresence(client) {
  const { error } = await client.rpc('touch_presence');
  if (error) throw error;
}

export async function addFriendByCode(client, rawCode) {
  const code = normalizeFriendCode(rawCode);
  if (!code) return { ok: false, reason: 'invalid_code' };
  const { data, error } = await client.rpc('add_friend_by_code', { p_code: code });
  if (error) return { ok: false, reason: reasonOf(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, friendId: row?.friend_id, displayName: row?.display_name };
}

export async function removeFriend(client, friendId) {
  const { error } = await client.rpc('remove_friend', { p_friend: friendId });
  if (error) throw error;
}

export async function listFriends(client, now = Date.now()) {
  const { data, error } = await client.rpc('list_friends');
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.friend_id,
    displayName: r.display_name,
    friendCode: r.friend_code,
    lastSeenAt: r.last_seen_at,
    online: isOnline(r.last_seen_at, now),
    isMutual: !!r.is_mutual,
    hasRoom: !!r.has_room,
  }));
}

export async function getShowcaseSetting(client) {
  const { data, error } = await client.rpc('get_showcase_setting');
  if (error) throw error;
  return !!data;
}

export async function setShowcase(client, on) {
  const { data, error } = await client.rpc('set_showcase', { p_on: !!on });
  if (error) throw error;
  return !!data;
}

export async function listShowcase(client, sort = 'top') {
  const { data, error } = await client.rpc('list_showcase', { p_sort: sort === 'new' ? 'new' : 'top', p_limit: 30 });
  if (error) throw error;
  return (data || []).map((r) => ({
    ownerId: r.owner_id,
    displayName: r.display_name,
    friendCode: r.friend_code,
    likes: Number(r.likes) || 0,
    likedByMe: !!r.liked_by_me,
    updatedAt: r.updated_at,
    itemCount: Number(r.item_count) || 0,
  }));
}

export async function setRoomLike(client, ownerId, like) {
  const { data, error } = await client.rpc('set_room_like', { p_owner: ownerId, p_like: !!like });
  if (error) return { ok: false, reason: reasonOf(error) };
  return { ok: true, likes: Number(data) || 0 };
}

export async function createTrade(client, toId, giveKind, wantKind) {
  const { data, error } = await client.rpc('create_gumball_trade', { p_to: toId, p_give: giveKind, p_want: wantKind });
  if (error) return { ok: false, reason: reasonOf(error) };
  return { ok: true, id: Number(data) };
}

export async function updateTrade(client, id, status) {
  const { data, error } = await client.rpc('update_gumball_trade', { p_id: id, p_status: status });
  if (error) return { ok: false, reason: reasonOf(error) };
  return { ok: true, status: data };
}

export async function listTrades(client) {
  const { data, error } = await client.rpc('list_gumball_trades');
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, id: Number(r.id) }));
}
