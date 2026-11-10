// Invite-code live rooms: create/join/kick via RPC, then a Realtime private
// channel (presence + broadcast) authorized server-side by RLS on
// realtime.messages (see the migration) — never a client-only check.
//
// Movement throttling and remote-avatar interpolation are pure, DOM-free
// functions so they're covered by unit tests; channel wiring below is thin
// glue over the Supabase client, covered by the mocked smoke test.

import { normalizeInviteCode, validateFreeText, CHAT_BUBBLE_MAX_LEN } from './filter.js';

export const POSITION_SEND_INTERVAL_MS = 120;
export const AVATAR_LERP_MS = 160;
export const POSITION_RECEIVE_MIN_INTERVAL_MS = 60;
export const CHAT_RECEIVE_MIN_INTERVAL_MS = 500;
export const EMOTE_RECEIVE_MIN_INTERVAL_MS = 1000;

// ---------- pure helpers (unit-testable) ----------

/** True if enough time has passed since the last position broadcast to send another. */
export function shouldSendPositionUpdate(lastSentAtMs, nowMs, minIntervalMs = POSITION_SEND_INTERVAL_MS) {
  return nowMs - lastSentAtMs >= minIntervalMs;
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** Linearly interpolates between two {x,y} tile positions, t clamped to [0,1]. */
export function interpolatePosition(from, to, t) {
  const ct = Math.max(0, Math.min(1, t));
  return { x: lerp(from.x, to.x, ct), y: lerp(from.y, to.y, ct) };
}

/**
 * Tracks the last few remote avatar targets and smoothly interpolates
 * between them as throttled position updates arrive, so movement doesn't
 * visibly snap every POSITION_SEND_INTERVAL_MS.
 */
export function createRemoteAvatarInterpolator(durationMs = AVATAR_LERP_MS) {
  const states = new Map();

  function sample(state, nowMs) {
    const t = durationMs <= 0 ? 1 : (nowMs - state.startedAt) / durationMs;
    return interpolatePosition(state.from, state.to, t);
  }

  return {
    setTarget(id, pos, nowMs) {
      const prev = states.get(id);
      const from = prev ? sample(prev, nowMs) : pos;
      states.set(id, { from, to: pos, startedAt: nowMs });
    },
    getPosition(id, nowMs) {
      const state = states.get(id);
      return state ? sample(state, nowMs) : null;
    },
    remove(id) { states.delete(id); },
    knownIds() { return Array.from(states.keys()); },
  };
}

/**
 * Per-sender-id receive throttle for incoming broadcasts. Defends against a
 * single sender (malicious or buggy) flooding pos/chat events faster than
 * any legitimate client would — independent of (and in addition to) each
 * sender's own outgoing throttle, which a custom/modified client could
 * ignore.
 */
export function createReceiveThrottle(minIntervalMs) {
  const lastAt = new Map();
  return {
    allow(id, nowMs) {
      const prev = lastAt.get(id) || 0;
      if (nowMs - prev < minIntervalMs) return false;
      lastAt.set(id, nowMs);
      return true;
    },
    remove(id) { lastAt.delete(id); },
  };
}

// ---------- RPC wrappers ----------

/** Creates a new invite-code room owned by the caller. Returns { code, owner_id }. */
export async function createRoom(client) {
  const { data, error } = await client.rpc('create_multiplayer_room');
  if (error) throw error;
  return data;
}

/** Joins a room by invite code (validated/looked-up server-side, not client-trusted). */
export async function joinRoomByCode(client, rawCode) {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false, reason: 'invalid_code' };
  const { data, error } = await client.rpc('join_multiplayer_room', { p_code: code });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('kicked_from_room')) return { ok: false, reason: 'kicked' };
    if (msg.includes('invalid_or_inactive_code')) return { ok: false, reason: 'invalid_code' };
    return { ok: false, reason: 'error', error };
  }
  return { ok: true, room: data };
}

/** Owner-only: revokes the target's Realtime authorization and bans re-entry. */
export async function kickUser(client, code, targetUserId) {
  const { error } = await client.rpc('kick_from_multiplayer_room', { p_code: code, p_target_user: targetUserId });
  if (error) return { ok: false, reason: 'error', error };
  return { ok: true };
}

/**
 * Authoritative server-side check for "was I kicked from this room?" — used
 * to verify a received "kicked" broadcast before acting on it, since the
 * broadcast itself is a self-reported client message any room member can
 * send (Realtime Authorization gates room membership, not the payload's
 * claimed target). Returns false (never throws) on any RPC error so a
 * transient network hiccup can't be mistaken for "confirmed kicked".
 */
export async function checkKicked(client, code) {
  const { data, error } = await client.rpc('check_kicked_from_room', { p_code: code });
  if (error) return false;
  return !!data;
}

// ---------- Realtime channel wiring ----------

/**
 * Opens (but does not yet `.subscribe()`) a private Realtime channel for
 * `room:<code>`. Presence/broadcast access is enforced server-side by RLS
 * on realtime.messages keyed off multiplayer_room_access — joining this
 * channel without a valid access row will simply fail to authorize.
 */
export function openRoomChannel(client, code, selfUserId) {
  return client.channel(`room:${code}`, {
    config: {
      private: true,
      broadcast: { self: false },
      presence: { key: selfUserId },
    },
  });
}

/** Sends a throttled avatar position broadcast. Caller is responsible for throttling cadence. */
export function broadcastPosition(channel, pos) {
  return channel.send({ type: 'broadcast', event: 'pos', payload: pos });
}

/** Validates and sends a speech-bubble chat broadcast; returns {ok,reason}. */
export function broadcastChatBubble(channel, text, extraPayload = {}) {
  const validated = validateFreeText(text, CHAT_BUBBLE_MAX_LEN);
  if (!validated.ok) return { ok: false, reason: validated.reason };
  channel.send({ type: 'broadcast', event: 'chat', payload: { ...extraPayload, text: validated.text } });
  return { ok: true, text: validated.text };
}

/** Owner-side convenience: tells the kicked client's channel to disconnect itself (best-effort UX only). */
export function broadcastKicked(channel, targetUserId) {
  return channel.send({ type: 'broadcast', event: 'kicked', payload: { targetUserId } });
}

/** Sends an emote broadcast to peers in the party room. */
export function broadcastEmote(channel, emote, extraPayload = {}) {
  channel.send({ type: 'broadcast', event: 'emote', payload: { ...extraPayload, emote } });
  return { ok: true, emote };
}
