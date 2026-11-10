// Emote system for Pixel Hotel v0.9.0.
// 8 core emotes: wave, dance, laugh, clap, heart, sleep (zzz), sit-cheer, thumbs up.
// Visible to multiplayer peers via Realtime broadcast with 1/s rate limiting.

export const EMOTES = [
  { id: 'wave', label: 'Wave', icon: '👋', key: '1' },
  { id: 'dance', label: 'Dance', icon: '💃', key: '2' },
  { id: 'laugh', label: 'Laugh', icon: '😂', key: '3' },
  { id: 'clap', label: 'Clap', icon: '👏', key: '4' },
  { id: 'heart', label: 'Heart', icon: '❤️', key: '5' },
  { id: 'sleep', label: 'Sleep', icon: '💤', key: '6' },
  { id: 'cheer', label: 'Cheer', icon: '🎉', key: '7' },
  { id: 'thumbsup', label: 'Thumbs Up', icon: '👍', key: '8' },
];

export const EMOTE_IDS = new Set(EMOTES.map((e) => e.id));
export const EMOTE_ICONS = Object.fromEntries(EMOTES.map((e) => [e.id, e.icon]));

export const EMOTE_DURATION_MS = 3000;
export const EMOTE_RATE_LIMIT_MS = 1000;

/** Pure rate-limit check for outgoing player emotes (max 1 per second). */
export function isEmoteAllowed(lastSentAtMs, nowMs) {
  if (typeof lastSentAtMs !== 'number') return true;
  return nowMs - lastSentAtMs >= EMOTE_RATE_LIMIT_MS;
}

/** Validates an emote ID string. */
export function isValidEmote(emote) {
  return typeof emote === 'string' && EMOTE_IDS.has(emote);
}
