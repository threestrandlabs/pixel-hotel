// Multiplayer UI orchestrator for Pixel Hotel v0.8.0. Owns all DOM wiring
// for the Multiplayer panel (Connect / Visit Friend / Party Room tabs) and
// all live multiplayer state. Nothing here runs until the player clicks
// "Connect" — that is the only opt-in trigger that loads the Supabase
// client and touches the network (see js/multiplayer/client.js).
//
// main.js integrates this module through a small, explicit surface:
//   initMultiplayerUI(hostApi) — call once at startup (no network access)
//   getRemoteMultiplayerEntities(now) — append to the render entity list
//   tickMultiplayer(now, player) — call once per frame (throttled position)
//   notifyLocalChat(text) — call from the existing chat submit handler
// `hostApi` is a small set of callbacks instead of importing main.js
// directly, to avoid a circular import.

import { getSupabaseClient } from './client.js';
import { signInAndEnsureProfile, fetchOwnerByFriendCode, fetchDisplayNames, signOutMultiplayer } from './auth.js';
import {
  listRoomNotes, addRoomNote, deleteRoomNote, setNoteLiked, pushRoomSnapshot, fetchRoomSnapshot,
} from './guestbook.js';
import {
  createRoom, joinRoomByCode, kickUser, checkKicked, openRoomChannel,
  broadcastPosition, broadcastChatBubble, broadcastKicked,
  shouldSendPositionUpdate, createRemoteAvatarInterpolator, createReceiveThrottle,
  POSITION_SEND_INTERVAL_MS, POSITION_RECEIVE_MIN_INTERVAL_MS, CHAT_RECEIVE_MIN_INTERVAL_MS,
} from './realtimeRoom.js';
import {
  escapeHtml, validateDisplayName, normalizeFriendCode, normalizeInviteCode,
  validatePositionPayload, validateChatPayload, validateKickedPayload,
} from './filter.js';
import { getMutedUserIds, setUserMuted, getLastDisplayName, setLastDisplayName } from './localPrefs.js';

export const MULTIPLAYER_ROOM_ID = 'myroom';

const state = {
  host: null,
  client: null,
  profile: null,
  mutedUserIds: getMutedUserIds(window.localStorage),
  visitingOwnerId: null,
  visitingDisplayName: null,
  visitSceneActive: false,
  notes: [],
  roomCode: null,
  isRoomOwner: false,
  channel: null,
  members: new Map(), // userId -> { displayName, dir }
  bubbles: new Map(), // userId -> { text, until }
  interpolator: createRemoteAvatarInterpolator(),
  posThrottle: createReceiveThrottle(POSITION_RECEIVE_MIN_INTERVAL_MS),
  chatThrottle: createReceiveThrottle(CHAT_RECEIVE_MIN_INTERVAL_MS),
  lastPositionSentAt: 0,
  previousLocalRoom: null,
};

// Test-only introspection hook, same convention as window.__pixelHotel in
// main.js: exposes internal state for the mocked-browser Playwright tests.
// Never used by production game code.
if (typeof window !== 'undefined') window.__mpDebugState = state;

function byId(id) { return document.getElementById(id); }

function setStatus(msg) {
  const el = byId('mpStatus');
  if (el) el.textContent = msg;
}

async function ensureClient() {
  if (!state.client) state.client = await getSupabaseClient();
  return state.client;
}

// ---------- Connect tab ----------

async function handleConnectClick() {
  try {
    setStatus('Connecting…');
    const client = await ensureClient();
    const nameInput = byId('mpDisplayNameInput');
    const requestedName = (nameInput && nameInput.value.trim()) || getLastDisplayName(window.localStorage) || '';
    const profile = await signInAndEnsureProfile(client, requestedName || null);
    state.profile = profile;
    setLastDisplayName(window.localStorage, profile.display_name);
    renderConnectTab();
    setStatus(`Connected as ${profile.display_name}.`);
    const ownRoom = state.host?.getMyRoomPlaced?.();
    if (ownRoom) publishOwnRoomSnapshot(ownRoom);
  } catch (err) {
    setStatus(`Could not connect: ${err.message || err}`);
  }
}

async function handleRenameClick() {
  if (!state.client || !state.profile) return;
  const nameInput = byId('mpDisplayNameInput2');
  const raw = nameInput ? nameInput.value : '';
  const validated = validateDisplayName(raw);
  if (!validated.ok) { setStatus('Pick a name up to 24 letters/numbers/spaces.'); return; }
  const profile = await signInAndEnsureProfile(state.client, validated.text);
  state.profile = profile;
  setLastDisplayName(window.localStorage, profile.display_name);
  renderConnectTab();
}

async function handleDisconnectClick() {
  await leaveVisitIfAny();
  await leaveRoomIfAny();
  if (state.client) {
    try { await signOutMultiplayer(state.client); } catch (e) { /* ignore */ }
  }
  state.profile = null;
  renderConnectTab();
  setStatus('Disconnected from multiplayer.');
}

function renderConnectTab() {
  const signedOut = byId('mpSignedOutRow');
  const signedIn = byId('mpSignedInRow');
  if (!signedOut || !signedIn) return;
  if (state.profile) {
    signedOut.classList.add('hidden');
    signedIn.classList.remove('hidden');
    byId('mpOwnName').textContent = state.profile.display_name;
    byId('mpOwnCode').textContent = state.profile.friend_code;
  } else {
    signedOut.classList.remove('hidden');
    signedIn.classList.add('hidden');
  }
}

// ---------- Visit Friend tab ----------

async function handleVisitClick() {
  if (!state.profile) { setStatus('Connect first.'); return; }
  const input = byId('mpVisitCodeInput');
  const code = normalizeFriendCode(input ? input.value : '');
  if (!code) { setStatus('That friend code looks wrong — it should be 6 letters/numbers.'); return; }
  const result = await fetchOwnerByFriendCode(state.client, code);
  if (!result.ok) { setStatus('No one has that friend code.'); return; }
  await enterVisit(result.ownerId, result.displayName);
}

async function handleOwnGuestbookClick() {
  if (!state.profile) { setStatus('Connect first.'); return; }
  document.querySelector('.tab-btn[data-tab="mpVisitTab"]')?.click();
  await enterVisit(state.profile.id, state.profile.display_name);
}

/** Visits `ownerId`'s guestbook; if it's someone else's room, also shows a
 * transient read-only snapshot scene (never touches the local save). */
async function enterVisit(ownerId, displayName) {
  if (state.roomCode) { setStatus('Leave your party room first to visit a friend.'); return; }
  await leaveVisitIfAny();
  state.visitingOwnerId = ownerId;
  state.visitingDisplayName = displayName;
  await refreshGuestbook();
  const isOwnRoom = state.profile.id === ownerId;
  if (!isOwnRoom) {
    let snapshot = null;
    try { snapshot = await fetchRoomSnapshot(state.client, ownerId); } catch (e) { /* no snapshot yet */ }
    state.visitSceneActive = true;
    state.host?.enterVisitScene?.(displayName, (snapshot && snapshot.room_data) || { placed: [] });
    renderGuestbook();
  }
  setStatus(isOwnRoom ? 'Viewing your own guestbook.' : `Visiting ${displayName}'s room.`);
}

async function leaveVisitIfAny() {
  if (state.visitSceneActive) {
    state.visitSceneActive = false;
    state.host?.exitVisitScene?.();
  }
  state.visitingOwnerId = null;
  state.visitingDisplayName = null;
  state.notes = [];
  renderGuestbook();
}

async function refreshGuestbook() {
  if (!state.visitingOwnerId) return;
  state.notes = await listRoomNotes(state.client, state.visitingOwnerId, state.profile?.id);
  renderGuestbook();
}

function renderGuestbook() {
  const wrap = byId('mpGuestbookWrap');
  if (!wrap) return;
  if (!state.visitingOwnerId) { wrap.innerHTML = ''; return; }
  const isOwner = state.profile && state.profile.id === state.visitingOwnerId;
  const header = `<div class="mp-guestbook-title">${escapeHtml(state.visitingDisplayName)}'s Guestbook${isOwner ? ' (yours)' : ''}</div>`;
  const leaveBtn = state.visitSceneActive
    ? '<button id="btnMpLeaveVisit" class="pixel-btn">Leave Visit</button>' : '';
  const form = `
    <form id="mpNoteForm" class="mp-note-form" autocomplete="off">
      <input id="mpNoteInput" type="text" maxlength="140" placeholder="Leave a friendly note (max 140 chars)" />
      <button type="submit" class="pixel-btn">Post</button>
    </form>`;
  const list = state.notes.map((n) => {
    const canDelete = state.profile && (state.profile.id === n.author_id || isOwner);
    const liked = n._liked;
    return `
    <div class="room-item mp-note" data-note="${n.id}">
      <div class="item-info">
        <div class="item-name">${escapeHtml(n.author_name)}</div>
        <div class="item-desc">${escapeHtml(n.body)}</div>
      </div>
      <div class="item-actions">
        <button class="pixel-btn mp-like-btn ${liked ? 'active' : ''}" data-like="${n.id}">♥ ${n.likeCount}</button>
        ${canDelete ? `<button class="pixel-btn" data-delete-note="${n.id}">Delete</button>` : ''}
      </div>
    </div>`;
  }).join('') || '<p>No notes yet — be the first to say hello!</p>';
  wrap.innerHTML = header + leaveBtn + form + list;

  byId('btnMpLeaveVisit')?.addEventListener('click', () => leaveVisitIfAny());
  byId('mpNoteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = byId('mpNoteInput');
    const result = await addRoomNote(state.client, {
      ownerId: state.visitingOwnerId, authorId: state.profile.id, text: input.value,
    });
    if (!result.ok) {
      setStatus(result.reason === 'rate_limited'
        ? "You've left a lot of notes here recently — try again later."
        : 'Could not post that note.');
      return;
    }
    input.value = '';
    await refreshGuestbook();
  });
  wrap.querySelectorAll('[data-delete-note]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteRoomNote(state.client, btn.dataset.deleteNote);
      await refreshGuestbook();
    });
  });
  wrap.querySelectorAll('[data-like]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const noteId = btn.dataset.like;
      const note = state.notes.find((n) => n.id === noteId);
      await setNoteLiked(state.client, { noteId, authorId: state.profile.id, liked: !note._liked });
      await refreshGuestbook();
    });
  });
}

/** Called by the owner (e.g. from the Save button flow) to publish their current My Room layout. */
export async function publishOwnRoomSnapshot(roomData) {
  if (!state.client || !state.profile) return;
  await pushRoomSnapshot(state.client, state.profile.id, roomData);
}

// ---------- Party Room tab ----------

function displayNameFor(userId) {
  const m = state.members.get(userId);
  return (m && m.displayName) || 'Guest';
}

function renderMemberList() {
  const el = byId('mpMemberList');
  if (!el) return;
  const rows = Array.from(state.members.entries()).map(([userId, m]) => {
    const muted = state.mutedUserIds.has(userId);
    const kickBtn = state.isRoomOwner && userId !== state.profile.id
      ? `<button class="pixel-btn" data-kick="${userId}">Kick</button>` : '';
    return `
    <div class="room-item mp-member">
      <div class="item-info"><div class="item-name">${escapeHtml(m.displayName || 'Guest')}</div></div>
      <div class="item-actions">
        <button class="pixel-btn ${muted ? 'active' : ''}" data-mute="${userId}">${muted ? 'Unmute' : 'Mute'}</button>
        ${kickBtn}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = rows || '<p>Just you so far.</p>';
  el.querySelectorAll('[data-mute]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mutedUserIds = setUserMuted(window.localStorage, btn.dataset.mute, !state.mutedUserIds.has(btn.dataset.mute));
      renderMemberList();
    });
  });
  el.querySelectorAll('[data-kick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.kick;
      await kickUser(state.client, state.roomCode, targetId);
      if (state.channel) broadcastKicked(state.channel, targetId);
    });
  });
}

function renderRoomTab() {
  const idle = byId('mpRoomIdleRow');
  const active = byId('mpRoomActiveRow');
  if (!idle || !active) return;
  if (state.roomCode) {
    idle.classList.add('hidden');
    active.classList.remove('hidden');
    byId('mpRoomCode').textContent = state.roomCode;
    renderMemberList();
  } else {
    idle.classList.remove('hidden');
    active.classList.add('hidden');
  }
}

function subscribeChannel(code) {
  const channel = openRoomChannel(state.client, code, state.profile.id);
  channel
    .on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const seen = new Set();
      for (const [userId, metas] of Object.entries(presenceState)) {
        seen.add(userId);
        const meta = metas[metas.length - 1] || {};
        const prev = state.members.get(userId) || {};
        state.members.set(userId, { ...prev, displayName: meta.displayName || prev.displayName });
      }
      for (const userId of Array.from(state.members.keys())) {
        if (!seen.has(userId)) {
          state.members.delete(userId);
          state.interpolator.remove(userId);
          state.posThrottle.remove(userId);
          state.chatThrottle.remove(userId);
        }
      }
      renderMemberList();
    })
    .on('broadcast', { event: 'pos' }, ({ payload }) => {
      // See filter.js's validatePositionPayload doc comment: Realtime
      // Authorization only confirms the sender is A room member, not that
      // `userId` is THEIR id — this bounds/shapes the data and restricts it
      // to currently-tracked presence members, it does not verify identity.
      const validated = validatePositionPayload(payload);
      if (!validated || validated.userId === state.profile.id) return;
      if (!state.members.has(validated.userId)) return;
      if (!state.posThrottle.allow(validated.userId, performance.now())) return;
      const prev = state.members.get(validated.userId) || {};
      state.members.set(validated.userId, { ...prev, dir: validated.dir, displayName: prev.displayName || validated.displayName });
      state.interpolator.setTarget(validated.userId, { x: validated.x, y: validated.y }, performance.now());
    })
    .on('broadcast', { event: 'chat' }, ({ payload }) => {
      const validated = validateChatPayload(payload);
      if (!validated || validated.userId === state.profile.id) return;
      if (!state.members.has(validated.userId)) return;
      if (state.mutedUserIds.has(validated.userId)) return;
      if (!state.chatThrottle.allow(validated.userId, performance.now())) return;
      state.bubbles.set(validated.userId, { text: validated.text, until: performance.now() + 3200 });
      state.host?.onRemoteChat?.(displayNameFor(validated.userId), validated.text);
    })
    .on('broadcast', { event: 'kicked' }, async ({ payload }) => {
      const validated = validateKickedPayload(payload);
      if (!validated || validated.targetUserId !== state.profile.id) return;
      // Never trust the broadcast alone — any room member can send one
      // naming any target (Realtime Authorization only checks room
      // membership, not that the sender is the owner). Confirm against the
      // durable server-side ban list before actually disconnecting.
      const roomAtReceipt = state.roomCode;
      if (!roomAtReceipt) return;
      const actuallyKicked = await checkKicked(state.client, roomAtReceipt);
      if (!actuallyKicked || state.roomCode !== roomAtReceipt) return;
      setStatus('You were removed from this room by the owner.');
      await leaveRoomIfAny();
      renderRoomTab();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ displayName: state.profile.display_name });
      }
    });
  return channel;
}

async function enterPartyRoom(code, isOwner) {
  state.previousLocalRoom = state.host.getPlayerRoom();
  state.roomCode = code;
  state.isRoomOwner = isOwner;
  state.members.clear();
  state.bubbles.clear();
  state.channel = subscribeChannel(code);
  state.host.switchRoom(MULTIPLAYER_ROOM_ID);
  renderRoomTab();
}

async function handleCreateRoomClick() {
  if (!state.profile) { setStatus('Connect first.'); return; }
  if (state.visitSceneActive) { setStatus('Leave the room you are visiting first.'); return; }
  try {
    const room = await createRoom(state.client);
    await enterPartyRoom(room.code, true);
    setStatus(`Party room created — invite code ${room.code}.`);
  } catch (err) {
    setStatus(`Could not create a room: ${err.message || err}`);
  }
}

async function handleJoinRoomClick() {
  if (!state.profile) { setStatus('Connect first.'); return; }
  if (state.visitSceneActive) { setStatus('Leave the room you are visiting first.'); return; }
  const input = byId('mpJoinCodeInput');
  const code = normalizeInviteCode(input ? input.value : '');
  if (!code) { setStatus('That invite code looks wrong.'); return; }
  const result = await joinRoomByCode(state.client, code);
  if (!result.ok) {
    setStatus(result.reason === 'kicked'
      ? 'You were removed from that room previously and cannot rejoin.'
      : 'That invite code is invalid or no longer active.');
    return;
  }
  await enterPartyRoom(result.room.code, result.room.owner_id === state.profile.id);
  setStatus(`Joined party room ${result.room.code}.`);
}

async function leaveRoomIfAny() {
  if (state.channel) {
    try { await state.channel.unsubscribe(); } catch (e) { /* ignore */ }
    state.channel = null;
  }
  const prevRoom = state.previousLocalRoom;
  state.roomCode = null;
  state.isRoomOwner = false;
  state.members.clear();
  state.bubbles.clear();
  state.previousLocalRoom = null;
  if (prevRoom && state.host) state.host.switchRoom(prevRoom);
  renderRoomTab();
}

// ---------- Panel / tabs plumbing ----------

// Tab switching within the panel is already handled generically by the
// `.tab-btn` listener wired in main.js (shared across every panel).

/**
 * Wires all multiplayer panel DOM listeners. Pure DOM setup — does not call
 * getSupabaseClient(), so no network access happens until the player
 * clicks Connect. `host` is a small callback surface from main.js:
 *   { switchRoom(roomId), getPlayerRoom(), pushChatLine(who,text), showToast(msg),
 *     onRemoteChat(who,text), getMyRoomPlaced(), enterVisitScene(displayName,roomData),
 *     exitVisitScene() }
 */
export function initMultiplayerUI(host) {
  state.host = host;
  renderConnectTab();
  renderRoomTab();
  byId('btnMpConnect')?.addEventListener('click', handleConnectClick);
  byId('btnMpRename')?.addEventListener('click', handleRenameClick);
  byId('btnMpDisconnect')?.addEventListener('click', handleDisconnectClick);
  byId('btnMpVisit')?.addEventListener('click', handleVisitClick);
  byId('btnMpOwnGuestbook')?.addEventListener('click', handleOwnGuestbookClick);
  byId('btnMpCreateRoom')?.addEventListener('click', handleCreateRoomClick);
  byId('btnMpJoinRoom')?.addEventListener('click', handleJoinRoomClick);
  byId('btnMpLeaveRoom')?.addEventListener('click', leaveRoomIfAny);
  const lastName = getLastDisplayName(window.localStorage);
  const nameInput = byId('mpDisplayNameInput');
  if (lastName && nameInput) nameInput.value = lastName;
}

/** Call once per frame from main.js's frame(now) loop. */
export function tickMultiplayer(now, player) {
  if (!state.channel || !state.roomCode) return;
  if (!shouldSendPositionUpdate(state.lastPositionSentAt, now, POSITION_SEND_INTERVAL_MS)) return;
  state.lastPositionSentAt = now;
  broadcastPosition(state.channel, {
    userId: state.profile.id,
    displayName: state.profile.display_name,
    x: player.renderX,
    y: player.renderY,
    dir: player.dir,
  });
}

/** Call from the existing chat form submit handler; no-op unless in a party room. */
export function notifyLocalChat(text) {
  if (!state.channel || !state.profile) return;
  broadcastChatBubble(state.channel, text, { userId: state.profile.id, displayName: state.profile.display_name });
}

/** Returns render-ready entities for every remote avatar currently in the shared party room. */
export function getRemoteMultiplayerEntities(now) {
  if (!state.channel || !state.roomCode) return [];
  const list = [];
  for (const [userId, meta] of state.members.entries()) {
    if (userId === state.profile?.id) continue;
    const pos = state.interpolator.getPosition(userId, now);
    if (!pos) continue;
    const bubble = state.bubbles.get(userId);
    list.push({
      id: `mp-${userId}`,
      x: pos.x, y: pos.y, dir: meta.dir || 'down', frame: 0, walking: false,
      sitting: false, lying: false, blink: false, breathe: 0,
      action: null, actionFrame: 0, depth: undefined,
      spriteKey: 'player', kind: 'remote_player', color: '#7fd9ff',
      nameTag: meta.displayName || 'Guest',
      bubbleText: bubble && bubble.until > now ? bubble.text : null,
    });
  }
  return list;
}
