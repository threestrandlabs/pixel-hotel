// Unit tests for v0.14 accounts & cloud save: the pure sync decisions, the
// account API against an in-memory fake Supabase client that mirrors
// put_player_save()'s optimistic-concurrency rules, and the save.js hooks.
// Never touches a network; supabase/migrations/0005_v014_cloud_save.sql is
// the source of truth for the real server behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cloudPayload, mergeCloudIntoLocal, saveFingerprint, hasMeaningfulProgress, summarizeSave, decideSync,
  readCloudMeta, writeCloudMeta, clearCloudMeta, isConflictError, CLOUD_META_KEY,
} from '../js/account/cloudSave.js';
import {
  isValidEmail, getAccountUser, requestEmailLink, startGoogleSignIn, signInAsGuest, fetchCloudSave, putCloudSave,
} from '../js/account/accountApi.js';
import { createDefaultState, saveState, onStateSaved, setSavesSuspended, SAVE_KEY } from '../js/save.js';
import { signOutMultiplayer } from '../js/multiplayer/auth.js';

function fakeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store,
  };
}

function fakeSupabase({ user = null, linkFails = false, emailTaken = false } = {}) {
  const calls = [];
  const rows = new Map();
  let session = user ? { user } : null;
  const client = {
    calls,
    rows,
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      async updateUser(attrs, opts) {
        calls.push(['updateUser', attrs, opts]);
        return emailTaken ? { error: { message: 'email_exists' } } : { data: {}, error: null };
      },
      async signInWithOtp(args) { calls.push(['signInWithOtp', args]); return { data: {}, error: null }; },
      async linkIdentity(args) {
        calls.push(['linkIdentity', args]);
        return linkFails ? { error: { message: 'Manual linking is disabled' } } : { data: {}, error: null };
      },
      async signInWithOAuth(args) { calls.push(['signInWithOAuth', args]); return { data: {}, error: null }; },
      async signInAnonymously() {
        calls.push(['signInAnonymously']);
        session = { user: { id: 'anon-new', is_anonymous: true } };
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() { calls.push(['signOut']); session = null; return { error: null }; },
    },
    from(table) {
      assert.equal(table, 'player_saves');
      let uid = null;
      const q = {
        select() { return q; },
        eq(col, val) { assert.equal(col, 'user_id'); uid = val; return q; },
        async maybeSingle() {
          const row = rows.get(uid);
          return { data: row ? { ...row } : null, error: null };
        },
      };
      return q;
    },
    async rpc(name, args) {
      assert.equal(name, 'put_player_save');
      const me = session && session.user;
      if (!me || me.is_anonymous) return { data: null, error: { message: 'not_signed_in' } };
      const existing = rows.get(me.id);
      if (!existing && args.p_expected_rev != null) return { data: null, error: { message: 'save_conflict', code: '40001' } };
      if (existing && args.p_expected_rev !== existing.rev) return { data: null, error: { message: 'save_conflict', code: '40001' } };
      const rev = existing ? existing.rev + 1 : 1;
      const updated_at = new Date(Date.UTC(2026, 10, 25, 0, 0, rev)).toISOString();
      rows.set(me.id, { data: JSON.parse(JSON.stringify(args.p_data)), save_version: args.p_save_version, rev, updated_at });
      return { data: [{ rev, updated_at }], error: null };
    },
  };
  return client;
}

const ALICE = { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'alice@example.com', is_anonymous: false };

// ------------------------------------------------------------ pure logic

test('cloudPayload drops per-device settings; merge restores local settings', () => {
  const s = createDefaultState();
  s.settings.zoom = 2.2;
  const payload = cloudPayload(s);
  assert.equal('settings' in payload, false);
  assert.equal(payload.coins, s.coins);
  const local = createDefaultState();
  local.settings.zoom = 0.9;
  const merged = mergeCloudIntoLocal(payload, local);
  assert.equal(merged.settings.zoom, 0.9);
  assert.equal(merged.coins, s.coins);
});

test('fingerprint ignores settings but sees gameplay changes', () => {
  const a = createDefaultState();
  const b = createDefaultState();
  b.settings.musicMuted = !a.settings.musicMuted;
  assert.equal(saveFingerprint(a), saveFingerprint(b));
  b.coins += 1;
  assert.notEqual(saveFingerprint(a), saveFingerprint(b));
});

test('hasMeaningfulProgress: fresh save has none, any real progress counts', () => {
  const s = createDefaultState();
  assert.equal(hasMeaningfulProgress(s), false);
  s.coins += 25;
  assert.equal(hasMeaningfulProgress(s), true);
  const t = createDefaultState();
  t.inventory.push({ id: 'x' });
  assert.equal(hasMeaningfulProgress(t), true);
  const u = createDefaultState();
  u.avatarCustomized = true;
  assert.equal(hasMeaningfulProgress(u), true);
});

test('summarizeSave counts coins, items and finished quests', () => {
  const s = createDefaultState();
  s.coins = 777;
  s.inventory.push({ id: 'a' }, { id: 'b' });
  const qid = Object.keys(s.quests)[0];
  s.quests[qid].complete = true;
  const sum = summarizeSave(s);
  assert.equal(sum.coins, 777);
  assert.equal(sum.items, 2 + s.rooms.myroom.placed.length);
  assert.equal(sum.questsDone, 1);
});

test('decideSync covers every case', () => {
  const uid = 'u1';
  const meta = { userId: uid, rev: 3, hash: 'H' };
  const unchanged = { hash: 'H', hasProgress: true };
  const changed = { hash: 'X', hasProgress: true };
  // no cloud save yet -> upload
  assert.equal(decideSync({ local: changed, cloud: null, meta: {}, userId: uid }), 'push');
  // in sync
  assert.equal(decideSync({ local: unchanged, cloud: { rev: 3 }, meta, userId: uid }), 'none');
  // only this device changed
  assert.equal(decideSync({ local: changed, cloud: { rev: 3 }, meta, userId: uid }), 'push');
  // only the cloud changed (played on another device)
  assert.equal(decideSync({ local: unchanged, cloud: { rev: 5 }, meta, userId: uid }), 'pull');
  // both changed
  assert.equal(decideSync({ local: changed, cloud: { rev: 5 }, meta, userId: uid }), 'conflict');
  // first sign-in on a fresh device -> just take the cloud
  assert.equal(decideSync({ local: { hash: 'Z', hasProgress: false }, cloud: { rev: 5 }, meta: {}, userId: uid }), 'pull');
  // first sign-in on a device with real progress -> ask
  assert.equal(decideSync({ local: changed, cloud: { rev: 5 }, meta: {}, userId: uid }), 'conflict');
  // a different account signed in on this device -> never silently merge
  assert.equal(decideSync({ local: unchanged, cloud: { rev: 3 }, meta, userId: 'u2' }), 'conflict');
});

test('cloud meta round-trips and tolerates junk', () => {
  const st = fakeStorage();
  assert.deepEqual(readCloudMeta(st), {});
  writeCloudMeta(st, { userId: 'u', rev: 2 });
  assert.deepEqual(readCloudMeta(st), { userId: 'u', rev: 2 });
  st.setItem(CLOUD_META_KEY, '{not json');
  assert.deepEqual(readCloudMeta(st), {});
  clearCloudMeta(st);
  assert.equal(st.getItem(CLOUD_META_KEY), null);
});

test('isConflictError recognises server conflicts only', () => {
  assert.equal(isConflictError({ message: 'save_conflict' }), true);
  assert.equal(isConflictError({ code: '23505', message: 'duplicate key' }), true);
  assert.equal(isConflictError(new Error('Failed to fetch')), false);
  assert.equal(isConflictError(null), false);
});

// ------------------------------------------------------------ account API

test('isValidEmail', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail(' a@b.co '), true);
  assert.equal(isValidEmail('nope'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(''), false);
});

test('email link: fresh browser uses a normal magic-link sign-in', async () => {
  const c = fakeSupabase();
  const r = await requestEmailLink(c, 'alice@example.com', 'https://x/pixel-hotel/');
  assert.equal(r.linked, false);
  assert.equal(c.calls[0][0], 'signInWithOtp');
  assert.equal(c.calls[0][1].options.emailRedirectTo, 'https://x/pixel-hotel/');
  await assert.rejects(() => requestEmailLink(c, 'bad', 'https://x/'), /invalid_email/);
});

test('email link: anonymous multiplayer identity is upgraded in place', async () => {
  const c = fakeSupabase({ user: { id: 'anon1', is_anonymous: true } });
  const r = await requestEmailLink(c, 'alice@example.com', 'https://x/');
  assert.equal(r.linked, true);
  assert.deepEqual(c.calls.map((x) => x[0]), ['updateUser']);
});

test('email link: falls back to sign-in when the email already has an account', async () => {
  const c = fakeSupabase({ user: { id: 'anon1', is_anonymous: true }, emailTaken: true });
  const r = await requestEmailLink(c, 'alice@example.com', 'https://x/');
  assert.equal(r.linked, false);
  assert.deepEqual(c.calls.map((x) => x[0]), ['updateUser', 'signInWithOtp']);
});

test('google: links anonymous identity, falls back to plain OAuth', async () => {
  const linked = fakeSupabase({ user: { id: 'anon1', is_anonymous: true } });
  assert.equal((await startGoogleSignIn(linked, 'https://x/')).linked, true);
  const fallback = fakeSupabase({ user: { id: 'anon1', is_anonymous: true }, linkFails: true });
  assert.equal((await startGoogleSignIn(fallback, 'https://x/')).linked, false);
  assert.deepEqual(fallback.calls.map((x) => x[0]), ['linkIdentity', 'signInWithOAuth']);
  const fresh = fakeSupabase();
  await startGoogleSignIn(fresh, 'https://x/');
  assert.equal(fresh.calls[0][0], 'signInWithOAuth');
  assert.equal(fresh.calls[0][1].provider, 'google');
});

test('getAccountUser reports anonymous vs real accounts', async () => {
  assert.equal(await getAccountUser(fakeSupabase()), null);
  const anon = await getAccountUser(fakeSupabase({ user: { id: 'a', is_anonymous: true } }));
  assert.equal(anon.isAnonymous, true);
  const real = await getAccountUser(fakeSupabase({ user: ALICE }));
  assert.deepEqual(real, { id: ALICE.id, email: ALICE.email, isAnonymous: false });
});

test('cloud save round trip with optimistic concurrency', async () => {
  const c = fakeSupabase({ user: ALICE });
  assert.equal(await fetchCloudSave(c, ALICE.id), null);
  const s = createDefaultState();
  const first = await putCloudSave(c, cloudPayload(s), s.version, null);
  assert.equal(first.rev, 1);
  const got = await fetchCloudSave(c, ALICE.id);
  assert.equal(got.rev, 1);
  assert.equal(got.data.coins, s.coins);
  assert.equal(got.saveVersion, s.version);
  const second = await putCloudSave(c, cloudPayload(s), s.version, 1);
  assert.equal(second.rev, 2);
  // a device still on rev 1 must be refused, not silently overwrite
  await assert.rejects(() => putCloudSave(c, cloudPayload(s), s.version, 1), (e) => isConflictError(e));
  await assert.rejects(() => putCloudSave(c, cloudPayload(s), s.version, null), (e) => isConflictError(e));
});

test('two devices: phone plays, laptop pulls, then both edit -> conflict', async () => {
  const c = fakeSupabase({ user: ALICE });
  const phone = createDefaultState();
  phone.coins = 500;
  const phoneMeta = {};
  // phone signs in first: no cloud -> push
  assert.equal(decideSync({ local: { hash: saveFingerprint(phone), hasProgress: true }, cloud: null, meta: phoneMeta, userId: ALICE.id }), 'push');
  const p1 = await putCloudSave(c, cloudPayload(phone), phone.version, null);
  Object.assign(phoneMeta, { userId: ALICE.id, rev: p1.rev, hash: saveFingerprint(phone) });

  // laptop is fresh -> pull
  const laptop = createDefaultState();
  const cloud1 = await fetchCloudSave(c, ALICE.id);
  assert.equal(decideSync({ local: { hash: saveFingerprint(laptop), hasProgress: false }, cloud: cloud1, meta: {}, userId: ALICE.id }), 'pull');
  const pulled = mergeCloudIntoLocal(cloud1.data, laptop);
  assert.equal(pulled.coins, 500);
  const laptopMeta = { userId: ALICE.id, rev: cloud1.rev, hash: saveFingerprint(pulled) };

  // laptop earns coins and pushes
  pulled.coins = 650;
  const p2 = await putCloudSave(c, cloudPayload(pulled), pulled.version, laptopMeta.rev);
  Object.assign(laptopMeta, { rev: p2.rev, hash: saveFingerprint(pulled) });

  // phone also played offline meanwhile -> its push is refused, sync says conflict
  phone.coins = 520;
  await assert.rejects(() => putCloudSave(c, cloudPayload(phone), phone.version, phoneMeta.rev), (e) => isConflictError(e));
  const cloud2 = await fetchCloudSave(c, ALICE.id);
  assert.equal(decideSync({ local: { hash: saveFingerprint(phone), hasProgress: true }, cloud: cloud2, meta: phoneMeta, userId: ALICE.id }), 'conflict');
});

test('anonymous identities cannot write a cloud save', async () => {
  const c = fakeSupabase({ user: { id: 'anon1', is_anonymous: true } });
  await assert.rejects(() => putCloudSave(c, {}, 14, null), (e) => /not_signed_in/.test(e.message));
});

test('guest: creates an anonymous identity, or reuses the existing session', async () => {
  const fresh = fakeSupabase();
  const g = await signInAsGuest(fresh);
  assert.deepEqual(g, { id: 'anon-new', email: '', isAnonymous: true });
  assert.deepEqual(fresh.calls.map((x) => x[0]), ['signInAnonymously']);

  const existingAnon = fakeSupabase({ user: { id: 'anon-old', is_anonymous: true } });
  assert.equal((await signInAsGuest(existingAnon)).id, 'anon-old');
  assert.equal(existingAnon.calls.length, 0);

  const real = fakeSupabase({ user: ALICE });
  assert.equal((await signInAsGuest(real)).isAnonymous, false);
});

test('guest can later upgrade to email in place', async () => {
  const c = fakeSupabase();
  await signInAsGuest(c);
  const r = await requestEmailLink(c, 'alice@example.com', 'https://x/');
  assert.equal(r.linked, true);
  assert.deepEqual(c.calls.map((x) => x[0]), ['signInAnonymously', 'updateUser']);
});

// ------------------------------------------------------------ save.js hooks

test('saveState notifies listeners and can be suspended', () => {
  const st = fakeStorage();
  const seen = [];
  const off = onStateSaved((s) => seen.push(s.coins));
  const s = createDefaultState();
  assert.equal(saveState(st, s), true);
  assert.deepEqual(seen, [s.coins]);
  setSavesSuspended(true);
  s.coins = 1;
  assert.equal(saveState(st, s), false);
  assert.notEqual(JSON.parse(st.getItem(SAVE_KEY)).coins, 1);
  setSavesSuspended(false);
  off();
  saveState(st, s);
  assert.equal(seen.length, 1);
});

test('a throwing listener never breaks saving', () => {
  const st = fakeStorage();
  const off = onStateSaved(() => { throw new Error('boom'); });
  assert.equal(saveState(st, createDefaultState()), true);
  off();
});

// ------------------------------------------------------------ multiplayer

test('multiplayer Disconnect keeps a real account signed in, still signs out anonymous', async () => {
  const real = fakeSupabase({ user: ALICE });
  await signOutMultiplayer(real);
  assert.equal(real.calls.some((x) => x[0] === 'signOut'), false);
  const anon = fakeSupabase({ user: { id: 'anon1', is_anonymous: true } });
  await signOutMultiplayer(anon);
  assert.equal(anon.calls.some((x) => x[0] === 'signOut'), true);
});
