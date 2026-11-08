// My Room guestbook/noteboard: visit by friend code, read/add/delete notes,
// like/unlike, and push/fetch a read-only furniture snapshot. All writes are
// validated client-side first (fast feedback) and re-validated/rate-limited
// server-side (source of truth) — see supabase/migrations/0001_v08_multiplayer.sql.

import { validateFreeText, NOTE_MAX_LEN } from './filter.js';

const RATE_LIMIT_ERROR_MARKER = 'rate_limited';

function mapNoteInsertError(error) {
  const msg = String(error?.message || '');
  if (msg.includes(RATE_LIMIT_ERROR_MARKER)) return { ok: false, reason: 'rate_limited' };
  if (msg.includes('author profile not found')) return { ok: false, reason: 'no_profile' };
  if (msg.includes('room owner not found')) return { ok: false, reason: 'room_not_found' };
  return { ok: false, reason: 'error', error };
}

/** Lists notes for a room (newest first), each with its like count and
 * whether `viewerId` (the current caller) has liked it. */
export async function listRoomNotes(client, ownerId, viewerId) {
  const { data: notes, error } = await client
    .from('room_notes')
    .select('id, author_id, author_name, body, created_at')
    .eq('room_owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const noteIds = (notes || []).map((n) => n.id);
  let likeCounts = {};
  let myLikes = new Set();
  if (noteIds.length > 0) {
    const { data: likes, error: likeError } = await client
      .from('room_note_likes')
      .select('note_id, author_id')
      .in('note_id', noteIds);
    if (likeError) throw likeError;
    for (const like of likes || []) {
      likeCounts[like.note_id] = (likeCounts[like.note_id] || 0) + 1;
      if (viewerId && like.author_id === viewerId) myLikes.add(like.note_id);
    }
  }

  return (notes || []).map((n) => ({ ...n, likeCount: likeCounts[n.id] || 0, _liked: myLikes.has(n.id) }));
}

/**
 * Adds a note to `ownerId`'s room as `authorId`. Validates length/characters
 * client-side first; the DB trigger is the authoritative length/character +
 * rate-limit check (see before_insert_room_note in the migration).
 */
export async function addRoomNote(client, { ownerId, authorId, text }) {
  const validated = validateFreeText(text, NOTE_MAX_LEN);
  if (!validated.ok) return { ok: false, reason: validated.reason };

  const { data, error } = await client
    .from('room_notes')
    .insert({ room_owner_id: ownerId, author_id: authorId, body: validated.text })
    .select('id, author_id, author_name, body, created_at')
    .single();
  if (error) return mapNoteInsertError(error);
  return { ok: true, note: { ...data, likeCount: 0 } };
}

/** Deletes a note. RLS allows this only if you're the author or the room owner. */
export async function deleteRoomNote(client, noteId) {
  const { error } = await client.from('room_notes').delete().eq('id', noteId);
  if (error) return { ok: false, reason: 'error', error };
  return { ok: true };
}

/** Toggles a like for `authorId` on `noteId`. Idempotent either direction. */
export async function setNoteLiked(client, { noteId, authorId, liked }) {
  if (liked) {
    // ignoreDuplicates: true — a repeat like is a no-op on an already-liked
    // row, not a column update, so this never needs UPDATE privilege on
    // room_note_likes (only SELECT/INSERT/DELETE are granted; see migration).
    const { error } = await client
      .from('room_note_likes')
      .upsert({ note_id: noteId, author_id: authorId }, { onConflict: 'note_id,author_id', ignoreDuplicates: true });
    if (error) return { ok: false, reason: 'error', error };
  } else {
    const { error } = await client
      .from('room_note_likes')
      .delete()
      .eq('note_id', noteId)
      .eq('author_id', authorId);
    if (error) return { ok: false, reason: 'error', error };
  }
  return { ok: true };
}

/** Pushes the owner's current My Room furniture layout as a read-only snapshot for visitors. */
export async function pushRoomSnapshot(client, ownerId, roomData) {
  const { error } = await client
    .from('room_snapshots')
    .upsert({ owner_id: ownerId, room_data: roomData }, { onConflict: 'owner_id' });
  if (error) return { ok: false, reason: 'error', error };
  return { ok: true };
}

/** Fetches a room's furniture snapshot, or null if the owner never pushed one. */
export async function fetchRoomSnapshot(client, ownerId) {
  const { data, error } = await client
    .from('room_snapshots')
    .select('room_data, updated_at')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
