// Pure, DOM-free helpers for text safety in multiplayer features: profanity
// filtering, HTML-safe rendering, and note/message validation. No DOM/canvas
// access here — safe for Node unit tests, matching the rest of this codebase.
//
// IMPORTANT (threat model): this filter is a client-side UX nicety, not a
// security control. It can be bypassed by anyone editing their own client
// (devtools, custom clients). It never replaces server-side validation —
// see supabase/migrations/0001_v08_multiplayer.sql for the DB-side length
// and character checks that are actually enforced.

export const NOTE_MAX_LEN = 140;
export const CHAT_BUBBLE_MAX_LEN = 140;
export const DISPLAY_NAME_MAX_LEN = 24;
export const FRIEND_CODE_LEN = 6;

// Small, intentionally conservative built-in block-list. Matches whole words
// only (word-boundary), case-insensitive, and tolerates simple leet-speak
// substitutions (a->4/@, e->3, i->1/!, o->0, s->5/$).
const BLOCK_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot',
  'retard', 'whore', 'slut', 'rape', 'cock', 'dick', 'pussy',
];

function leetPattern(word) {
  const subs = {
    a: '[a4@]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s5$]', u: '[uv]',
  };
  return word
    .split('')
    .map((ch) => subs[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('+?');
}

const BLOCK_RE = new RegExp(
  `\\b(${BLOCK_WORDS.map(leetPattern).join('|')})(?:ing|ers?|ed|s|y)?\\b`,
  'gi',
);

/** Replaces blocked words with asterisks of the same length. Pure string -> string. */
export function censorText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(BLOCK_RE, (m) => '*'.repeat(m.length));
}

/** True if the raw text contains a blocked word (before censoring). */
export function containsBlockedWord(text) {
  if (typeof text !== 'string') return false;
  return BLOCK_RE.test(text);
}

/** Escapes HTML-significant characters so text is safe to drop into innerHTML. */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Control characters other than plain whitespace (tab/space) — these have no
// business in a chat bubble or guestbook note and match the DB CHECK regex.
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * Validates and normalizes free text (room notes, chat bubbles) client-side,
 * mirroring the DB-side checks so a user gets instant feedback instead of a
 * round-trip failure. Returns { ok, reason, text } where `text` is trimmed
 * and censored when ok.
 */
export function validateFreeText(raw, maxLen = NOTE_MAX_LEN) {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid_type', text: '' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty', text: '' };
  if (trimmed.length > maxLen) return { ok: false, reason: 'too_long', text: '' };
  if (CONTROL_CHAR_RE.test(trimmed)) return { ok: false, reason: 'control_chars', text: '' };
  return { ok: true, reason: null, text: censorText(trimmed) };
}

const DISPLAY_NAME_RE = /^[A-Za-z0-9 _'.-]{1,24}$/;

/** Validates a chosen display name: printable ASCII, no control chars, bounded length. */
export function validateDisplayName(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid_type', text: '' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty', text: '' };
  if (!DISPLAY_NAME_RE.test(trimmed)) return { ok: false, reason: 'invalid_chars', text: '' };
  return { ok: true, reason: null, text: censorText(trimmed) };
}

const FRIEND_CODE_RE = /^[A-Z2-9]{6}$/;

/** Normalizes/validates a user-entered friend code (uppercases, strips spaces). */
export function normalizeFriendCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  return FRIEND_CODE_RE.test(code) ? code : null;
}

const INVITE_CODE_RE = /^[A-Z2-9]{6,10}$/;

/** Normalizes/validates a user-entered multiplayer room invite code. */
export function normalizeInviteCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  return INVITE_CODE_RE.test(code) ? code : null;
}

/**
 * Pure client-side mirror of the server's per-author-per-room hourly rate
 * limit, used only for optimistic UI (disable the button, show a countdown)
 * — the DB is the source of truth (see insert_room_note RPC). Takes an array
 * of millisecond timestamps of this author's own prior notes in this room.
 */
export function isUnderRateLimit(priorTimestampsMs, nowMs, maxPerHour) {
  const windowStart = nowMs - 60 * 60 * 1000;
  const countInWindow = priorTimestampsMs.filter((t) => t > windowStart && t <= nowMs).length;
  return countInWindow < maxPerHour;
}

// ---------- Incoming Realtime payload validation ----------
//
// IMPORTANT (threat model): Realtime Authorization (RLS on realtime.messages)
// only gates WHO may publish/subscribe to a room's topic (must hold a
// multiplayer_room_access row) — it does NOT verify that a `userId` a client
// puts inside its own broadcast payload actually matches its authenticated
// auth.uid(). Any other member of the SAME room can broadcast a payload
// claiming to be a different member's userId; there is no supabase-js-only
// (no custom relay/edge function) way to cryptographically bind a Broadcast
// payload's claimed identity to the sender's JWT. These validators defend
// against malformed/out-of-bounds/oversized data, not against that
// impersonation — never describe this as spoof-proof in docs or UI copy.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `v` is a syntactically valid UUID (profile/auth user id shape). */
export function isValidUserId(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

const MAX_COORD = 10000;
const VALID_DIRS = new Set(['up', 'down', 'left', 'right']);

/**
 * Validates an incoming avatar-position broadcast payload. Returns a clean
 * { userId, x, y, dir, displayName } or null if the payload is malformed,
 * has a non-finite/out-of-range coordinate, or lacks a valid userId.
 */
export function validatePositionPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!isValidUserId(payload.userId)) return null;
  const { x, y } = payload;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD) return null;
  const dir = VALID_DIRS.has(payload.dir) ? payload.dir : 'down';
  const displayName = typeof payload.displayName === 'string'
    ? payload.displayName.slice(0, DISPLAY_NAME_MAX_LEN) : null;
  return { userId: payload.userId, x, y, dir, displayName };
}

/**
 * Validates an incoming chat-bubble broadcast payload. Returns a clean
 * { userId, text, displayName } (text trimmed/length-bounded/control-char
 * checked, same rules as the sender's own validateFreeText) or null.
 */
export function validateChatPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!isValidUserId(payload.userId)) return null;
  const validated = validateFreeText(payload.text, CHAT_BUBBLE_MAX_LEN);
  if (!validated.ok) return null;
  const displayName = typeof payload.displayName === 'string'
    ? payload.displayName.slice(0, DISPLAY_NAME_MAX_LEN) : null;
  return { userId: payload.userId, text: validated.text, displayName };
}

/** Validates an incoming "kicked" broadcast payload. Returns { targetUserId } or null. */
export function validateKickedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!isValidUserId(payload.targetUserId)) return null;
  return { targetUserId: payload.targetUserId };
}
