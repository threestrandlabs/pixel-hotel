// Friends / showcase / gumball trades. The fake server mirrors the rules in
// supabase/migrations/0006_v014_social.sql (state machine, mutual friends,
// pending cap); the SQL itself is exercised against Postgres separately.
import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileTrades, applyTradeAction, ensureLedger, canOffer, canAccept, pruneLedger, isTradeableKind } from '../js/multiplayer/trades.js';
import {
  isOnline, addFriendByCode, listFriends, createTrade, updateTrade, listTrades, setRoomLike, listShowcase,
} from '../js/multiplayer/social.js';
import { createDefaultState } from '../js/save.js';

const A = 'aaaa'; const B = 'bbbb';

function fakeServer() {
  const trades = [];
  const friends = new Set([`${A}>${B}`, `${B}>${A}`]);
  let nextId = 1;
  const names = { [A]: 'Ann', [B]: 'Bo' };
  const clientFor = (me) => ({
    async rpc(name, args) {
      const err = (m) => ({ data: null, error: { message: m } });
      if (name === 'create_gumball_trade') {
        if (!(friends.has(`${me}>${args.p_to}`) && friends.has(`${args.p_to}>${me}`))) return err('not_mutual_friends');
        if (trades.filter((t) => t.from_id === me && t.status === 'pending').length >= 10) return err('too_many_pending');
        const t = { id: nextId++, from_id: me, to_id: args.p_to, from_name: names[me], to_name: names[args.p_to], give_kind: args.p_give, want_kind: args.p_want, status: 'pending' };
        trades.push(t);
        return { data: t.id, error: null };
      }
      if (name === 'update_gumball_trade') {
        const t = trades.find((x) => x.id === args.p_id && (x.from_id === me || x.to_id === me));
        if (!t) return err('no_such_trade');
        if (t.status === args.p_status) return { data: t.status, error: null };
        const ok = (me === t.to_id && t.status === 'pending' && ['accepted', 'declined'].includes(args.p_status))
          || (me === t.from_id && t.status === 'pending' && args.p_status === 'cancelled')
          || (me === t.from_id && t.status === 'accepted' && args.p_status === 'completed');
        if (!ok) return err('bad_transition');
        t.status = args.p_status;
        return { data: t.status, error: null };
      }
      if (name === 'list_gumball_trades') return { data: trades.filter((t) => t.from_id === me || t.to_id === me).map((t) => ({ ...t })), error: null };
      return err('unknown rpc');
    },
  });
  return { trades, clientFor };
}

function player(counts) {
  const s = createDefaultState();
  s.gumballs.counts = { ...counts };
  ensureLedger(s);
  return s;
}

// What a client does on every poll: fetch, settle, mark accepted ones completed.
async function settle(client, s, myId) {
  const trades = await listTrades(client);
  for (const a of reconcileTrades(trades, s.gumballs.tradeLedger, myId)) {
    if (a.kind === 'complete') await updateTrade(client, a.trade.id, 'completed');
    else applyTradeAction(s, a, '2026-11-25');
  }
  pruneLedger(s, trades);
}

const total = (...states) => states.reduce((n, s) => n + Object.values(s.gumballs.counts).reduce((a, b) => a + b, 0), 0);

test('trade accepted: exactly one swap, no duplication, settles idempotently', async () => {
  const srv = fakeServer();
  const ca = srv.clientFor(A); const cb = srv.clientFor(B);
  const ann = player({ common_red: 2 }); const bo = player({ rare_ruby: 1 });
  const before = total(ann, bo);
  const r = await createTrade(ca, B, 'common_red', 'rare_ruby');
  assert.ok(r.ok);
  applyTradeAction(ann, { kind: 'escrow', trade: { id: r.id, from_id: A, to_id: B, give_kind: 'common_red', want_kind: 'rare_ruby', status: 'pending' } }, 'd');
  assert.equal(ann.gumballs.counts.common_red, 1, 'offered gumball set aside');
  await settle(ca, ann, A); // re-running must not escrow twice
  assert.equal(ann.gumballs.counts.common_red, 1);

  const [offer] = await listTrades(cb);
  assert.ok(canAccept(bo, offer));
  assert.ok((await updateTrade(cb, offer.id, 'accepted')).ok);
  for (let i = 0; i < 3; i++) { await settle(cb, bo, B); await settle(ca, ann, A); }
  assert.equal(bo.gumballs.counts.rare_ruby, 0);
  assert.equal(bo.gumballs.counts.common_red, 1);
  assert.equal(ann.gumballs.counts.rare_ruby, 1);
  assert.equal(ann.gumballs.counts.common_red, 1);
  assert.equal(total(ann, bo), before, 'nothing created or destroyed');
  assert.equal(srv.trades[0].status, 'completed');
  assert.equal(ann.gumballs.totalPulls || 0, 0, 'trades are not pulls');
});

test('trade declined or cancelled: the offered gumball comes back once', async () => {
  for (const outcome of ['declined', 'cancelled']) {
    const srv = fakeServer();
    const ca = srv.clientFor(A); const cb = srv.clientFor(B);
    const ann = player({ common_red: 1 }); const bo = player({ rare_ruby: 1 });
    const r = await createTrade(ca, B, 'common_red', 'rare_ruby');
    await settle(ca, ann, A);
    assert.equal(ann.gumballs.counts.common_red, 0, `${outcome}: escrowed`);
    assert.ok((await updateTrade(outcome === 'declined' ? cb : ca, r.id, outcome)).ok);
    for (let i = 0; i < 3; i++) { await settle(ca, ann, A); await settle(cb, bo, B); }
    assert.equal(ann.gumballs.counts.common_red, 1, `${outcome}: refunded exactly once`);
    assert.equal(bo.gumballs.counts.rare_ruby, 1, `${outcome}: recipient untouched`);
  }
});

test('trade: the recipient cannot accept twice or after a cancel', async () => {
  const srv = fakeServer();
  const ca = srv.clientFor(A); const cb = srv.clientFor(B);
  const r = await createTrade(ca, B, 'common_red', 'rare_ruby');
  assert.ok((await updateTrade(ca, r.id, 'cancelled')).ok);
  const late = await updateTrade(cb, r.id, 'accepted');
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'bad_transition');
  assert.equal((await updateTrade(ca, r.id, 'completed')).reason, 'bad_transition');
});

test('trade: a crash after the server accepted still applies the swap on next load', async () => {
  const srv = fakeServer();
  const ca = srv.clientFor(A); const cb = srv.clientFor(B);
  const ann = player({ common_red: 1 }); const bo = player({ rare_ruby: 1 });
  const r = await createTrade(ca, B, 'common_red', 'rare_ruby');
  await settle(ca, ann, A);
  await updateTrade(cb, r.id, 'accepted'); // ...and Bo's tab closes before applying
  assert.equal(bo.gumballs.counts.rare_ruby, 1);
  await settle(cb, bo, B); // next load
  assert.deepEqual([bo.gumballs.counts.rare_ruby, bo.gumballs.counts.common_red], [0, 1]);
});

test('trade: a second device with an old save does not double-apply after cloud sync', async () => {
  const srv = fakeServer();
  const ca = srv.clientFor(A); const cb = srv.clientFor(B);
  const ann = player({ common_red: 1 }); const bo = player({ rare_ruby: 1 });
  const r = await createTrade(ca, B, 'common_red', 'rare_ruby');
  await settle(ca, ann, A);
  await updateTrade(cb, r.id, 'accepted');
  await settle(cb, bo, B);
  const boLaptop = JSON.parse(JSON.stringify(bo)); // cloud-synced copy carries the ledger
  await settle(cb, boLaptop, B);
  assert.deepEqual(boLaptop.gumballs.counts, bo.gumballs.counts);
});

test('trade rules: mutual friends only, pending cap, real gumball ids', async () => {
  const srv = fakeServer();
  const ca = srv.clientFor(A);
  assert.equal((await createTrade(ca, 'cccc', 'common_red', 'rare_ruby')).reason, 'not_mutual_friends');
  for (let i = 0; i < 10; i++) assert.ok((await createTrade(ca, B, 'common_red', 'rare_ruby')).ok);
  assert.equal((await createTrade(ca, B, 'common_red', 'rare_ruby')).reason, 'too_many_pending');
  assert.equal(isTradeableKind('rare_ruby'), true);
  assert.equal(isTradeableKind('Red Ball!'), false);
  const s = player({ common_red: 0 });
  assert.equal(canOffer(s, 'common_red'), false);
  assert.equal(reconcileTrades([{ id: 9, from_id: A, to_id: B, give_kind: 'nope', want_kind: 'rare_ruby', status: 'accepted' }], {}, A).length, 0, 'unknown kinds are ignored');
});

test('ledger pruning keeps unsettled entries', () => {
  const s = player({});
  s.gumballs.tradeLedger = { 1: { escrowed: true, received: true }, 2: { escrowed: true }, 3: { applied: true } };
  pruneLedger(s, [{ id: 2 }]);
  assert.deepEqual(Object.keys(s.gumballs.tradeLedger), ['2']);
});

test('presence: online within two minutes of the last heartbeat', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(isOnline('2026-11-25T11:59:00Z', now), true);
  assert.equal(isOnline('2026-11-25T11:57:00Z', now), false);
  assert.equal(isOnline(null, now), false);
  assert.equal(isOnline('garbage', now), false);
});

test('friends API maps server rows and reasons', async () => {
  const rows = [{ friend_id: 'f1', display_name: 'Bo', friend_code: 'BBBBBB', last_seen_at: new Date().toISOString(), is_mutual: true, has_room: false }];
  const client = {
    async rpc(name, args) {
      if (name === 'list_friends') return { data: rows, error: null };
      if (name === 'add_friend_by_code') return args.p_code === 'BBBBBB' ? { data: [{ friend_id: 'f1', display_name: 'Bo' }], error: null } : { data: null, error: { message: 'unknown_code' } };
      if (name === 'set_room_like') return { data: 3, error: null };
      if (name === 'list_showcase') return { data: [{ owner_id: 'o', display_name: 'Cy', friend_code: 'CCCCCC', likes: '4', liked_by_me: true, updated_at: 'x', item_count: 7 }], error: null };
      return { data: null, error: { message: 'x' } };
    },
  };
  const [f] = await listFriends(client);
  assert.deepEqual([f.id, f.displayName, f.isMutual, f.online], ['f1', 'Bo', true, true]);
  assert.equal((await addFriendByCode(client, ' bbbbbb ')).displayName, 'Bo');
  assert.equal((await addFriendByCode(client, 'ZZZZZZ')).reason, 'unknown_code');
  assert.equal((await addFriendByCode(client, 'bad')).reason, 'invalid_code');
  assert.deepEqual(await setRoomLike(client, 'o', true), { ok: true, likes: 3 });
  const [room] = await listShowcase(client, 'top');
  assert.deepEqual([room.likes, room.likedByMe, room.itemCount], [4, true, 7]);
});
