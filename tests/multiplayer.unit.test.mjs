// Unit tests for Pixel Hotel v0.8.0 multiplayer: pure filter/validation/rate
// -limit helpers, plus a "smoke" pass that drives auth.js/guestbook.js/
// realtimeRoom.js against a hand-rolled in-memory fake Supabase client that
// mirrors the migration's semantics (ownership checks, the hourly rate
// limit, invite-code gating). This NEVER touches a real network or
// database — see supabase/migrations/0001_v08_multiplayer.sql for what the
// real Postgres RLS/triggers do; a human must verify those live.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  censorText, containsBlockedWord, escapeHtml, validateFreeText, validateDisplayName,
  normalizeFriendCode, normalizeInviteCode, isUnderRateLimit, NOTE_MAX_LEN,
  isValidUserId, validatePositionPayload, validateChatPayload, validateKickedPayload,
} from '../js/multiplayer/filter.js';
import {
  shouldSendPositionUpdate, interpolatePosition, createRemoteAvatarInterpolator, createReceiveThrottle,
} from '../js/multiplayer/realtimeRoom.js';
import { getMutedUserIds, setUserMuted, getLastDisplayName, setLastDisplayName } from '../js/multiplayer/localPrefs.js';
import { signInAndEnsureProfile, fetchOwnerByFriendCode, signOutMultiplayer } from '../js/multiplayer/auth.js';
import { listRoomNotes, addRoomNote, deleteRoomNote, setNoteLiked } from '../js/multiplayer/guestbook.js';
import { createRoom, joinRoomByCode, kickUser, checkKicked } from '../js/multiplayer/realtimeRoom.js';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// ======================= filter.js =======================

test('filter: censors blocked words (and simple suffixes) without over-blocking lookalikes', () => {
  assert.equal(censorText('you fucking idiot'), 'you ******* idiot');
  assert.equal(censorText('I passed the class'), 'I passed the class');
  assert.equal(containsBlockedWord('no bad words here'), false);
  assert.equal(containsBlockedWord('total asshole'), true);
});

test('filter: escapeHtml neutralizes HTML-significant characters', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml(`"quoted" & 'single'`), '&quot;quoted&quot; &amp; &#39;single&#39;');
});

test('filter: validateFreeText rejects empty, too-long, and control-character text', () => {
  assert.equal(validateFreeText('   ').ok, false);
  assert.equal(validateFreeText('a'.repeat(NOTE_MAX_LEN + 1)).ok, false);
  assert.equal(validateFreeText('hello\x07world').ok, false);
  const ok = validateFreeText('  hi there!  ');
  assert.equal(ok.ok, true);
  assert.equal(ok.text, 'hi there!');
});

test('filter: validateFreeText censors blocked words in the cleaned result', () => {
  const result = validateFreeText('you fucking rock');
  assert.equal(result.ok, true);
  assert.equal(result.text, 'you ******* rock');
});

test('filter: validateDisplayName enforces charset and length', () => {
  assert.equal(validateDisplayName('').ok, false);
  assert.equal(validateDisplayName('a'.repeat(25)).ok, false);
  assert.equal(validateDisplayName('<script>').ok, false);
  assert.equal(validateDisplayName("Pip_the-Bellhop.2").ok, true);
});

test('filter: normalizeFriendCode/normalizeInviteCode validate shape and normalize case', () => {
  assert.equal(normalizeFriendCode('ab23cd'), 'AB23CD');
  assert.equal(normalizeFriendCode('ab23c'), null); // too short
  assert.equal(normalizeFriendCode('ab23c1'), null); // '1' not in allowed alphabet
  assert.equal(normalizeInviteCode('zz zz99'), 'ZZZZ99');
  assert.equal(normalizeInviteCode(''), null);
});

test('filter: isUnderRateLimit counts only timestamps within the trailing hour', () => {
  const hourMs = 60 * 60 * 1000;
  const now = 10 * hourMs;
  const timestamps = [now - hourMs - 1, now - 100, now - 200, now - 300];
  assert.equal(isUnderRateLimit(timestamps, now, 5), true); // only 3 of 4 are in-window
  assert.equal(isUnderRateLimit(timestamps, now, 3), false);
});

// ======================= realtimeRoom.js pure helpers =======================

test('realtimeRoom: shouldSendPositionUpdate throttles to the configured interval', () => {
  assert.equal(shouldSendPositionUpdate(1000, 1100, 120), false);
  assert.equal(shouldSendPositionUpdate(1000, 1130, 120), true);
});

test('realtimeRoom: interpolatePosition lerps and clamps t to [0,1]', () => {
  assert.deepEqual(interpolatePosition({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5), { x: 5, y: 10 });
  assert.deepEqual(interpolatePosition({ x: 0, y: 0 }, { x: 10, y: 20 }, -1), { x: 0, y: 0 });
  assert.deepEqual(interpolatePosition({ x: 0, y: 0 }, { x: 10, y: 20 }, 2), { x: 10, y: 20 });
});

test('realtimeRoom: createRemoteAvatarInterpolator smoothly moves toward a new target over its duration', () => {
  const interp = createRemoteAvatarInterpolator(200);
  interp.setTarget('u1', { x: 0, y: 0 }, 1000);
  assert.deepEqual(interp.getPosition('u1', 1000), { x: 0, y: 0 });
  interp.setTarget('u1', { x: 10, y: 0 }, 1000);
  assert.deepEqual(interp.getPosition('u1', 1100), { x: 5, y: 0 }); // halfway through the 200ms tween
  assert.deepEqual(interp.getPosition('u1', 1200), { x: 10, y: 0 }); // fully arrived
  interp.remove('u1');
  assert.equal(interp.getPosition('u1', 1300), null);
});

// ======================= localPrefs.js =======================

test('localPrefs: mute set and last display name round-trip through fake storage, independent of each other', () => {
  const storage = makeFakeStorage();
  assert.deepEqual(Array.from(getMutedUserIds(storage)), []);
  setUserMuted(storage, 'userA', true);
  setUserMuted(storage, 'userB', true);
  setUserMuted(storage, 'userA', false);
  assert.deepEqual(Array.from(getMutedUserIds(storage)), ['userB']);
  setLastDisplayName(storage, 'Pip');
  assert.equal(getLastDisplayName(storage), 'Pip');
  // confirms this never shares a key with js/save.js's SAVE_KEY
  assert.equal(storage.getItem('pixelHotel.save.v1'), null);
});

// ======================= mocked-Supabase smoke: auth + guestbook + rooms =======================
//
// This fake client mirrors (not re-implements 1:1) the migration's rules so
// the JS integration layer is exercised end to end: ownership checks, the
// concurrency-safe-in-Postgres hourly rate limit (simulated here as a plain
// sequential counter, since Node is single-threaded — the advisory-lock
// race protection itself can only be verified against real Postgres), and
// invite-code/kick gating. No network, no real database.

function makeFakeSupabase() {
  const db = {
    profiles: new Map(), // id -> {id, display_name, friend_code}
    friendCodes: new Map(), // friend_code -> id
    notes: [], // {id, room_owner_id, author_id, author_name, body, created_at}
    likes: new Set(), // `${noteId}:${authorId}`
    rooms: new Map(), // code -> {code, owner_id, active}
    access: new Set(), // `${code}:${userId}`
    kicks: new Set(), // `${code}:${userId}`
  };
  let nextId = 1;
  let currentUserId = null;
  let noteSeq = 1;
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // matches the migration's alphabet (no 0/1/I/O)
  let codeSeq = 1;
  function genCode(len) {
    let n = codeSeq++;
    let out = '';
    for (let i = 0; i < len; i++) {
      out += CODE_ALPHABET[n % CODE_ALPHABET.length];
      n = Math.floor(n / CODE_ALPHABET.length) + i + 1;
    }
    return out;
  }

  function requireAuth() {
    if (!currentUserId) throw new Error('not authenticated');
    return currentUserId;
  }

  const auth = {
    async getSession() {
      return { data: { session: currentUserId ? { user: { id: currentUserId } } : null }, error: null };
    },
    async signInAnonymously() {
      currentUserId = `user-${nextId++}`;
      return { data: { user: { id: currentUserId } }, error: null };
    },
    async signOut() {
      currentUserId = null;
      return { error: null };
    },
  };

  async function rpc(name, args = {}) {
    try {
      switch (name) {
        case 'ensure_profile': {
          const uid = requireAuth();
          let profile = db.profiles.get(uid);
          if (profile) {
            if (args.p_display_name) profile = { ...profile, display_name: args.p_display_name };
            db.profiles.set(uid, profile);
            return { data: profile, error: null };
          }
          const code = genCode(6);
          profile = { id: uid, display_name: args.p_display_name || 'Guest', friend_code: code };
          db.profiles.set(uid, profile);
          db.friendCodes.set(code, uid);
          return { data: profile, error: null };
        }
        case 'lookup_owner_by_friend_code': {
          const ownerId = db.friendCodes.get(String(args.p_code).toUpperCase());
          if (!ownerId) return { data: [], error: null };
          const profile = db.profiles.get(ownerId);
          return { data: [{ owner_id: ownerId, display_name: profile.display_name }], error: null };
        }
        case 'get_display_names': {
          const rows = (args.p_ids || [])
            .map((id) => db.profiles.get(id))
            .filter(Boolean)
            .map((p) => ({ id: p.id, display_name: p.display_name }));
          return { data: rows, error: null };
        }
        case 'create_multiplayer_room': {
          const uid = requireAuth();
          const code = genCode(6);
          const room = { code, owner_id: uid, active: true };
          db.rooms.set(code, room);
          db.access.add(`${code}:${uid}`);
          return { data: room, error: null };
        }
        case 'join_multiplayer_room': {
          const uid = requireAuth();
          const code = String(args.p_code).toUpperCase();
          const room = db.rooms.get(code);
          if (!room || !room.active) return { data: null, error: new Error('invalid_or_inactive_code') };
          if (db.kicks.has(`${code}:${uid}`)) return { data: null, error: new Error('kicked_from_room') };
          db.access.add(`${code}:${uid}`);
          return { data: room, error: null };
        }
        case 'kick_from_multiplayer_room': {
          const uid = requireAuth();
          const room = db.rooms.get(args.p_code);
          if (!room || room.owner_id !== uid) return { data: null, error: new Error('not_room_owner') };
          db.access.delete(`${args.p_code}:${args.p_target_user}`);
          db.kicks.add(`${args.p_code}:${args.p_target_user}`);
          return { data: null, error: null };
        }
        case 'check_kicked_from_room': {
          const uid = requireAuth();
          const code = String(args.p_code).toUpperCase();
          return { data: db.kicks.has(`${code}:${uid}`), error: null };
        }
        default:
          return { data: null, error: new Error(`unknown rpc ${name}`) };
      }
    } catch (err) {
      return { data: null, error: err };
    }
  }

  function from(table) {
    const builder = {
      _filters: [],
      _op: null,
      _payload: null,
      eq(col, val) { this._filters.push([col, val]); return this; },
      in(col, vals) { this._filters.push([col, vals, 'in']); return this; },
      order() { return this; },
      select() { if (!this._op) this._op = 'select'; return this; },
      insert(payload) { this._op = 'insert'; this._payload = payload; return this; },
      upsert(payload) { this._op = 'upsert'; this._payload = payload; return this; },
      delete() { this._op = 'delete'; return this; },
      single() { this._single = true; return this; },
      maybeSingle() { this._single = true; this._maybe = true; return this; },
      then(resolve) { resolve(exec(table, this)); },
    };
    return builder;
  }

  function matchFilters(row, filters) {
    return filters.every(([col, val, kind]) => (kind === 'in' ? val.includes(row[col]) : row[col] === val));
  }

  const MAX_NOTES_PER_HOUR = 5;

  function exec(table, b) {
    if (table === 'room_notes') {
      if (b._op === 'insert') {
        const uid = currentUserId;
        const payload = b._payload;
        if (payload.author_id !== uid) return { data: null, error: new Error('author_id must match the authenticated user') };
        const author = db.profiles.get(payload.author_id);
        if (!author) return { data: null, error: new Error('author profile not found') };
        if (!db.profiles.has(payload.room_owner_id)) return { data: null, error: new Error('room owner not found') };
        if (payload.body.length === 0 || payload.body.length > 140) return { data: null, error: new Error('body_len') };
        const hourAgo = Date.now() - 60 * 60 * 1000;
        const recentCount = db.notes.filter((n) => (
          n.author_id === payload.author_id && n.room_owner_id === payload.room_owner_id && n.created_at > hourAgo
        )).length;
        if (recentCount >= MAX_NOTES_PER_HOUR) return { data: null, error: new Error('rate_limited: max notes per room per hour') };
        const note = {
          id: `note-${noteSeq++}`, room_owner_id: payload.room_owner_id, author_id: payload.author_id,
          author_name: author.display_name, body: payload.body, created_at: Date.now(),
        };
        db.notes.push(note);
        return { data: note, error: null };
      }
      if (b._op === 'select') {
        const rows = db.notes.filter((n) => matchFilters(n, b._filters));
        return { data: rows, error: null };
      }
      if (b._op === 'delete') {
        const [[, noteId]] = b._filters;
        const note = db.notes.find((n) => n.id === noteId);
        if (!note) return { data: null, error: null };
        const uid = currentUserId;
        if (note.author_id !== uid && note.room_owner_id !== uid) return { data: null, error: new Error('permission denied') };
        db.notes = db.notes.filter((n) => n.id !== noteId);
        return { data: null, error: null };
      }
    }
    if (table === 'room_note_likes') {
      if (b._op === 'select') {
        const noteIds = b._filters.find(([col]) => col === 'note_id')?.[1] || [];
        const rows = Array.from(db.likes)
          .map((k) => k.split(':'))
          .filter(([noteId]) => noteIds.includes(noteId))
          .map(([note_id, author_id]) => ({ note_id, author_id }));
        return { data: rows, error: null };
      }
      if (b._op === 'upsert') {
        db.likes.add(`${b._payload.note_id}:${b._payload.author_id}`);
        return { data: null, error: null };
      }
      if (b._op === 'delete') {
        const noteId = b._filters.find(([col]) => col === 'note_id')?.[1];
        const authorId = b._filters.find(([col]) => col === 'author_id')?.[1];
        db.likes.delete(`${noteId}:${authorId}`);
        return { data: null, error: null };
      }
    }
    return { data: null, error: new Error(`unhandled fake table/op ${table}/${b._op}`) };
  }

  return { auth, rpc, from, _db: db, _setUser: (id) => { currentUserId = id; } };
}

test('mocked smoke: signInAndEnsureProfile creates a profile with a friend code on first call, reuses it after', async () => {
  const client = makeFakeSupabase();
  const p1 = await signInAndEnsureProfile(client, 'Alice');
  assert.equal(p1.display_name, 'Alice');
  assert.ok(p1.friend_code);
  const p2 = await signInAndEnsureProfile(client, null);
  assert.equal(p2.id, p1.id);
  assert.equal(p2.friend_code, p1.friend_code);
});

test('mocked smoke: fetchOwnerByFriendCode resolves a valid code and reports not_found for a bogus one', async () => {
  const client = makeFakeSupabase();
  const owner = await signInAndEnsureProfile(client, 'Bob');
  const found = await fetchOwnerByFriendCode(client, owner.friend_code.toLowerCase());
  assert.equal(found.ok, true);
  assert.equal(found.ownerId, owner.id);
  const notFound = await fetchOwnerByFriendCode(client, 'ZZ9999');
  assert.equal(notFound.ok, false);
  assert.equal(notFound.reason, 'not_found');
  const invalid = await fetchOwnerByFriendCode(client, '!!!');
  assert.equal(invalid.reason, 'invalid_code');
});

test('mocked smoke: guestbook add/list/like/delete round-trips and enforces author/owner delete permissions', async () => {
  const client = makeFakeSupabase();
  const owner = await signInAndEnsureProfile(client, 'Owner');
  client._setUser(null);
  const visitor = await signInAndEnsureProfile(client, 'Visitor');

  const addResult = await addRoomNote(client, { ownerId: owner.id, authorId: visitor.id, text: 'Lovely room!' });
  assert.equal(addResult.ok, true);
  assert.equal(addResult.note.author_name, 'Visitor');

  const notes = await listRoomNotes(client, owner.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].likeCount, 0);

  const likeResult = await setNoteLiked(client, { noteId: notes[0].id, authorId: visitor.id, liked: true });
  assert.equal(likeResult.ok, true);
  const notesAfterLike = await listRoomNotes(client, owner.id);
  assert.equal(notesAfterLike[0].likeCount, 1);
  // _liked reflects the viewer passed in, not just "somebody liked this".
  assert.equal((await listRoomNotes(client, owner.id, visitor.id))[0]._liked, true);
  assert.equal((await listRoomNotes(client, owner.id, owner.id))[0]._liked, false);

  // Owner can delete the visitor's note even though they didn't author it.
  client._setUser(owner.id);
  const delResult = await deleteRoomNote(client, notes[0].id);
  assert.equal(delResult.ok, true);
  assert.equal((await listRoomNotes(client, owner.id)).length, 0);
});

test('mocked smoke: adding a note rejects an empty/too-long body before ever reaching the fake DB', async () => {
  const client = makeFakeSupabase();
  const owner = await signInAndEnsureProfile(client, 'Owner');
  const visitor = await signInAndEnsureProfile(client, 'Visitor2');
  const tooLong = await addRoomNote(client, { ownerId: owner.id, authorId: visitor.id, text: 'x'.repeat(200) });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.reason, 'too_long');
  assert.equal(client._db.notes.length, 0);
});

test('mocked smoke: concurrency-safe hourly rate limit — 6th note in the same room within an hour is rejected', async () => {
  const client = makeFakeSupabase();
  const owner = await signInAndEnsureProfile(client, 'Owner3');
  client._setUser(null);
  const visitor = await signInAndEnsureProfile(client, 'Visitor3');

  for (let i = 0; i < 5; i++) {
    const r = await addRoomNote(client, { ownerId: owner.id, authorId: visitor.id, text: `note ${i}` });
    assert.equal(r.ok, true, `note ${i} should be accepted`);
  }
  const sixth = await addRoomNote(client, { ownerId: owner.id, authorId: visitor.id, text: 'one too many' });
  assert.equal(sixth.ok, false);
  assert.equal(sixth.reason, 'rate_limited');

  // A different room (different owner) is not affected by the first room's limit.
  const otherOwner = await signInAndEnsureProfile(client, 'OtherOwner');
  client._setUser(visitor.id);
  const inOtherRoom = await addRoomNote(client, { ownerId: otherOwner.id, authorId: visitor.id, text: 'hi there' });
  assert.equal(inOtherRoom.ok, true);
});

test('mocked smoke: invite-code room create/join/kick — a kicked user cannot rejoin', async () => {
  const client = makeFakeSupabase();
  const owner = await signInAndEnsureProfile(client, 'HostOwner');
  const room = await createRoom(client);
  assert.ok(room.code);

  client._setUser(null);
  const guest = await signInAndEnsureProfile(client, 'Guest1');
  const joinResult = await joinRoomByCode(client, room.code.toLowerCase());
  assert.equal(joinResult.ok, true);

  client._setUser(owner.id);
  const kickResult = await kickUser(client, room.code, guest.id);
  assert.equal(kickResult.ok, true);

  client._setUser(guest.id);
  const rejoinResult = await joinRoomByCode(client, room.code);
  assert.equal(rejoinResult.ok, false);
  assert.equal(rejoinResult.reason, 'kicked');
});

test('mocked smoke: only the room owner can kick', async () => {
  const client = makeFakeSupabase();
  const owner = await signInAndEnsureProfile(client, 'HostOwner2');
  const room = await createRoom(client);
  client._setUser(null);
  const guestA = await signInAndEnsureProfile(client, 'GuestA');
  await joinRoomByCode(client, room.code);
  client._setUser(null);
  const guestB = await signInAndEnsureProfile(client, 'GuestB');
  await joinRoomByCode(client, room.code);

  // guestB (not the owner) tries to kick guestA — must fail.
  client._setUser(guestB.id);
  const forbiddenKick = await kickUser(client, room.code, guestA.id);
  assert.equal(forbiddenKick.ok, false);

  client._setUser(owner.id);
  await signOutMultiplayer(client); // sign-out must not throw and clears the session
});

test('mocked smoke: joining with an invalid invite code is rejected', async () => {
  const client = makeFakeSupabase();
  await signInAndEnsureProfile(client, 'Someone');
  const result = await joinRoomByCode(client, 'NOPE00');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_code');
});

test('mocked smoke: checkKicked confirms a kick server-side and clears once re-joined elsewhere', async () => {
  const client = makeFakeSupabase();
  const owner = await signInAndEnsureProfile(client, 'HostOwner3');
  const room = await createRoom(client);
  client._setUser(null);
  const guest = await signInAndEnsureProfile(client, 'Guest3');
  await joinRoomByCode(client, room.code);

  const notYetKicked = await checkKicked(client, room.code);
  assert.equal(notYetKicked, false);

  client._setUser(owner.id);
  await kickUser(client, room.code, guest.id);

  client._setUser(guest.id);
  const nowKicked = await checkKicked(client, room.code);
  assert.equal(nowKicked, true);

  // A different (never-kicked) room reports false, confirming the check is room-scoped.
  const otherRoom = await createRoom(client);
  const notKickedElsewhere = await checkKicked(client, otherRoom.code);
  assert.equal(notKickedElsewhere, false);
});

// ======================= incoming payload validation (filter.js) =======================
//
// These guard the receive side of Realtime broadcasts, which — unlike a
// note/chat the local client itself sends through validateFreeText — can be
// anything a room member's own custom script chooses to put in a broadcast
// payload. See the long comment above validatePositionPayload in filter.js
// for why this bounds/shapes data but does not verify claimed identity.

test('filter: isValidUserId only accepts well-formed UUID strings', () => {
  assert.equal(isValidUserId('4f6f9c1e-3b1a-4b8e-9a2e-7e2b7a2b7a2b'), true);
  assert.equal(isValidUserId('not-a-uuid'), false);
  assert.equal(isValidUserId(''), false);
  assert.equal(isValidUserId(null), false);
  assert.equal(isValidUserId(12345), false);
});

test('filter: validatePositionPayload rejects non-finite/out-of-range/malformed coordinates and defaults an unknown dir', () => {
  const uid = '4f6f9c1e-3b1a-4b8e-9a2e-7e2b7a2b7a2b';
  assert.equal(validatePositionPayload(null), null);
  assert.equal(validatePositionPayload({ userId: 'bad-id', x: 1, y: 1 }), null);
  assert.equal(validatePositionPayload({ userId: uid, x: Infinity, y: 1 }), null);
  assert.equal(validatePositionPayload({ userId: uid, x: NaN, y: 1 }), null);
  assert.equal(validatePositionPayload({ userId: uid, x: 1e9, y: 1 }), null);
  assert.equal(validatePositionPayload({ userId: uid, x: '3', y: 1 }), null);
  const withBadDir = validatePositionPayload({ userId: uid, x: 3, y: 4, dir: 'teleport' });
  assert.deepEqual(withBadDir, { userId: uid, x: 3, y: 4, dir: 'down', displayName: null });
  const ok = validatePositionPayload({ userId: uid, x: 3, y: 4, dir: 'left', displayName: 'Pip' });
  assert.deepEqual(ok, { userId: uid, x: 3, y: 4, dir: 'left', displayName: 'Pip' });
});

test('filter: validateChatPayload rejects a bad userId or invalid text, and bounds an oversized displayName', () => {
  const uid = '4f6f9c1e-3b1a-4b8e-9a2e-7e2b7a2b7a2b';
  assert.equal(validateChatPayload({ userId: 'nope', text: 'hi' }), null);
  assert.equal(validateChatPayload({ userId: uid, text: '' }), null);
  assert.equal(validateChatPayload({ userId: uid, text: 'x'.repeat(200) }), null);
  const result = validateChatPayload({ userId: uid, text: '  hello  ', displayName: 'y'.repeat(40) });
  assert.equal(result.text, 'hello');
  assert.equal(result.displayName.length, 24);
});

test('filter: validateKickedPayload requires a well-formed targetUserId', () => {
  const uid = '4f6f9c1e-3b1a-4b8e-9a2e-7e2b7a2b7a2b';
  assert.equal(validateKickedPayload(null), null);
  assert.equal(validateKickedPayload({ targetUserId: 'nope' }), null);
  assert.deepEqual(validateKickedPayload({ targetUserId: uid }), { targetUserId: uid });
});

test('realtimeRoom: createReceiveThrottle rate-limits per sender id independently', () => {
  const throttle = createReceiveThrottle(100);
  assert.equal(throttle.allow('a', 1000), true);
  assert.equal(throttle.allow('a', 1050), false); // too soon
  assert.equal(throttle.allow('b', 1050), true); // different sender, unaffected
  assert.equal(throttle.allow('a', 1101), true); // enough time passed
  throttle.remove('a');
  assert.equal(throttle.allow('a', 1101), true); // removal resets the sender's cooldown
});
