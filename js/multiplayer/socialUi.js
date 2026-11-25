// Friends / Showcase / Trades tabs of the Multiplayer panel.
// Network calls are in social.js, trade settlement rules in trades.js.

import {
  addFriendByCode, removeFriend, listFriends, touchPresence, getShowcaseSetting, setShowcase, listShowcase,
  setRoomLike, createTrade, updateTrade, listTrades, PRESENCE_INTERVAL_MS,
} from './social.js';
import {
  reconcileTrades, applyTradeAction, ensureLedger, canOffer, canAccept, pruneLedger, isTradeableKind,
} from './trades.js';
import { escapeHtml } from './filter.js';
import { GUMBALL_CATALOGUE } from '../gumballs/catalogue.js';

const POLL_MS = 45 * 1000;
const GUM = new Map(GUMBALL_CATALOGUE.map((g) => [g.id, g]));

const ui = {
  deps: null,
  friends: [],
  showcase: [],
  showcaseOptIn: false,
  sort: 'top',
  trades: [],
  seenIncoming: new Set(),
  timers: [],
  busy: false,
};

const byId = (id) => document.getElementById(id);
const client = () => ui.deps.getClient();
const me = () => ui.deps.getProfile();
const save = () => ui.deps.getSaveState();
const today = () => new Date().toISOString().slice(0, 10);

function gumLabel(kind) {
  const g = GUM.get(kind);
  if (!g) return escapeHtml(kind);
  return `<span class="mp-gum" style="background:${g.colorA}"></span>${escapeHtml(g.name)}`;
}

function gumName(kind) {
  return GUM.get(kind)?.name || kind;
}

function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'not seen yet';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 120) return 'online now';
  if (s < 3600) return `seen ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `seen ${Math.round(s / 3600)} h ago`;
  return `seen ${Math.round(s / 86400)} d ago`;
}

function status(msg) { ui.deps.setStatus?.(msg); }

// ---------------------------------------------------------------- friends

async function refreshFriends() {
  if (!me()) return renderFriends();
  try {
    ui.friends = await listFriends(client());
  } catch (e) {
    status('Could not load your friends list.');
  }
  renderFriends();
  renderTradeForm();
}

function renderFriends() {
  const list = byId('mpFriendList');
  if (!list) return;
  if (!me()) { list.innerHTML = '<li class="empty">Connect first to see your friends.</li>'; return; }
  if (!ui.friends.length) { list.innerHTML = '<li class="empty">No friends yet. Add one with their friend code above.</li>'; return; }
  list.innerHTML = ui.friends.map((f) => `
    <li>
      <span class="mp-dot ${f.online ? 'on' : ''}" aria-hidden="true"></span>
      <span class="grow"><b>${escapeHtml(f.displayName)}</b>
        <span class="sub">${f.online ? 'Online now' : escapeHtml(ago(f.lastSeenAt))}${f.isMutual ? '' : ' • hasn\'t added you back yet'}</span></span>
      ${f.hasRoom ? `<button class="pixel-btn mp-mini" data-visit="${f.id}">Visit</button>` : ''}
      ${f.isMutual ? `<button class="pixel-btn mp-mini" data-trade="${f.id}">Trade</button>` : ''}
      <button class="pixel-btn mp-mini" data-unfriend="${f.id}" aria-label="Remove ${escapeHtml(f.displayName)}">✕</button>
    </li>`).join('');
  list.querySelectorAll('[data-visit]').forEach((b) => b.addEventListener('click', () => {
    const f = ui.friends.find((x) => x.id === b.dataset.visit);
    if (f) ui.deps.visitOwner(f.id, f.displayName);
  }));
  list.querySelectorAll('[data-trade]').forEach((b) => b.addEventListener('click', () => {
    document.querySelector('.tab-btn[data-tab="mpTradesTab"]')?.click();
    const sel = byId('mpTradeFriend');
    if (sel) sel.value = b.dataset.trade;
  }));
  list.querySelectorAll('[data-unfriend]').forEach((b) => b.addEventListener('click', async () => {
    const f = ui.friends.find((x) => x.id === b.dataset.unfriend);
    if (!f || !window.confirm(`Remove ${f.displayName} from your friends?`)) return;
    try { await removeFriend(client(), f.id); } catch (e) { status('Could not remove that friend.'); }
    await refreshFriends();
  }));
}

async function handleAddFriend() {
  if (!me()) { status('Connect first.'); return; }
  const input = byId('mpVisitCodeInput');
  const r = await addFriendByCode(client(), input ? input.value : '');
  const msg = {
    invalid_code: 'That friend code looks wrong: it should be 6 letters/numbers.',
    unknown_code: 'No one has that friend code.',
    cannot_add_self: "That's your own code!",
    too_many_friends: 'Your friends list is full (100).',
  };
  if (!r.ok) { status(msg[r.reason] || 'Could not add that friend.'); return; }
  status(`Added ${r.displayName}. Once they add you back you can trade.`);
  if (input) input.value = '';
  await refreshFriends();
}

// ---------------------------------------------------------------- showcase

async function refreshShowcase() {
  if (!me()) return renderShowcase();
  try {
    [ui.showcaseOptIn, ui.showcase] = await Promise.all([getShowcaseSetting(client()), listShowcase(client(), ui.sort)]);
  } catch (e) {
    status('Could not load the showcase.');
  }
  renderShowcase();
}

function renderShowcase() {
  const list = byId('mpShowcaseList');
  const opt = byId('mpShowcaseOptIn');
  if (opt) { opt.checked = ui.showcaseOptIn; opt.disabled = !me(); }
  for (const [id, key] of [['btnMpShowcaseTop', 'top'], ['btnMpShowcaseNew', 'new']]) {
    const b = byId(id);
    if (b) { b.classList.toggle('active', ui.sort === key); b.setAttribute('aria-pressed', String(ui.sort === key)); }
  }
  if (!list) return;
  if (!me()) { list.innerHTML = '<li class="empty">Connect first to browse rooms.</li>'; return; }
  if (!ui.showcase.length) { list.innerHTML = '<li class="empty">No rooms in the showcase yet. Be the first: tick the box above.</li>'; return; }
  const myId = me().id;
  list.innerHTML = ui.showcase.map((r) => `
    <li>
      <span class="grow"><b>${escapeHtml(r.displayName)}</b>${r.ownerId === myId ? ' (you)' : ''}
        <span class="sub">${r.itemCount} item${r.itemCount === 1 ? '' : 's'}</span></span>
      ${r.ownerId === myId
    ? `<span aria-label="${r.likes} likes">❤ ${r.likes}</span>`
    : `<button class="pixel-btn mp-mini mp-like ${r.likedByMe ? 'liked' : ''}" data-like="${r.ownerId}" aria-pressed="${r.likedByMe}" aria-label="${r.likedByMe ? 'Unlike' : 'Like'} ${escapeHtml(r.displayName)}'s room">${r.likedByMe ? '♥' : '♡'} ${r.likes}</button>
         <button class="pixel-btn mp-mini" data-visit="${r.ownerId}">Visit</button>`}
    </li>`).join('');
  list.querySelectorAll('[data-like]').forEach((b) => b.addEventListener('click', async () => {
    const row = ui.showcase.find((x) => x.ownerId === b.dataset.like);
    if (!row) return;
    b.disabled = true;
    const res = await setRoomLike(client(), row.ownerId, !row.likedByMe);
    if (res.ok) { row.likedByMe = !row.likedByMe; row.likes = res.likes; } else status('Could not update that like.');
    renderShowcase();
  }));
  list.querySelectorAll('[data-visit]').forEach((b) => b.addEventListener('click', () => {
    const row = ui.showcase.find((x) => x.ownerId === b.dataset.visit);
    if (row) ui.deps.visitOwner(row.ownerId, row.displayName);
  }));
}

// ---------------------------------------------------------------- trades

function renderTradeForm() {
  const friendSel = byId('mpTradeFriend');
  const giveSel = byId('mpTradeGive');
  const wantSel = byId('mpTradeWant');
  if (!friendSel || !giveSel || !wantSel) return;
  const prevFriend = friendSel.value; const prevGive = giveSel.value; const prevWant = wantSel.value;
  const mutual = ui.friends.filter((f) => f.isMutual);
  friendSel.innerHTML = mutual.length
    ? mutual.map((f) => `<option value="${f.id}">${escapeHtml(f.displayName)}</option>`).join('')
    : '<option value="">No mutual friends yet</option>';
  const s = save();
  const owned = s ? GUMBALL_CATALOGUE.filter((g) => canOffer(s, g.id)) : [];
  giveSel.innerHTML = owned.length
    ? owned.map((g) => `<option value="${g.id}">${escapeHtml(g.name)} ×${s.gumballs.counts[g.id]}</option>`).join('')
    : '<option value="">No gumballs to offer</option>';
  wantSel.innerHTML = GUMBALL_CATALOGUE.map((g) => `<option value="${g.id}">${escapeHtml(g.name)} (${g.rarity})</option>`).join('');
  if (mutual.some((f) => f.id === prevFriend)) friendSel.value = prevFriend;
  if (owned.some((g) => g.id === prevGive)) giveSel.value = prevGive;
  if (prevWant) wantSel.value = prevWant;
  byId('btnMpSendTrade').disabled = !me() || !mutual.length || !owned.length;
}

function renderTrades() {
  const inEl = byId('mpTradesIn');
  const outEl = byId('mpTradesOut');
  const badge = byId('mpTradesBadge');
  if (!inEl || !outEl) return;
  const myId = me()?.id;
  const incoming = ui.trades.filter((t) => t.to_id === myId);
  const outgoing = ui.trades.filter((t) => t.from_id === myId);
  const pendingIn = incoming.filter((t) => t.status === 'pending');
  if (badge) { badge.textContent = String(pendingIn.length); badge.classList.toggle('hidden', pendingIn.length === 0); }
  const label = { pending: 'waiting', accepted: 'accepted', completed: 'done ✓', declined: 'declined', cancelled: 'cancelled' };
  const s = save();
  inEl.innerHTML = !myId ? '<li class="empty">Connect first.</li>' : incoming.length ? incoming.slice(0, 12).map((t) => `
    <li>
      <span class="grow"><b>${escapeHtml(t.from_name)}</b> offers ${gumLabel(t.give_kind)} for your ${gumLabel(t.want_kind)}
        <span class="sub">${label[t.status] || t.status}</span></span>
      ${t.status === 'pending' ? `
        <button class="pixel-btn mp-mini" data-accept="${t.id}" ${s && canAccept(s, t) ? '' : `disabled title="You don't have a ${escapeHtml(gumName(t.want_kind))}"`}>Accept</button>
        <button class="pixel-btn mp-mini" data-decline="${t.id}">Decline</button>` : ''}
    </li>`).join('') : '<li class="empty">No offers for you right now.</li>';
  outEl.innerHTML = !myId ? '' : outgoing.length ? outgoing.slice(0, 12).map((t) => `
    <li>
      <span class="grow">${gumLabel(t.give_kind)} for ${gumLabel(t.want_kind)} to <b>${escapeHtml(t.to_name)}</b>
        <span class="sub">${label[t.status] || t.status}</span></span>
      ${t.status === 'pending' ? `<button class="pixel-btn mp-mini" data-cancel="${t.id}">Cancel</button>` : ''}
    </li>`).join('') : '<li class="empty">You have no open offers.</li>';
  inEl.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', () => respond(Number(b.dataset.accept), 'accepted')));
  inEl.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', () => respond(Number(b.dataset.decline), 'declined')));
  outEl.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => respond(Number(b.dataset.cancel), 'cancelled')));
}

/** Fetch trades and settle every side this client still owes. */
async function settleTrades({ notify = false } = {}) {
  if (!me() || ui.busy) return;
  ui.busy = true;
  try {
    const trades = await listTrades(client());
    ui.trades = trades;
    const s = save();
    if (s) {
      ensureLedger(s);
      let changed = false;
      for (const action of reconcileTrades(trades, s.gumballs.tradeLedger, me().id)) {
        if (action.kind === 'complete') {
          await updateTrade(client(), action.trade.id, 'completed');
          continue;
        }
        if (applyTradeAction(s, action, today())) {
          changed = true;
          if (action.kind === 'receive') ui.deps.showToast?.(`🤝 ${action.trade.to_name} accepted: you got a ${gumName(action.trade.want_kind)}!`);
          if (action.kind === 'refund') ui.deps.showToast?.(`Your ${gumName(action.trade.give_kind)} came back (offer ${action.trade.status}).`);
        }
      }
      pruneLedger(s, trades);
      if (changed) { ui.deps.saveGame(); ui.deps.onGumballsChanged(); }
    }
    if (notify) {
      for (const t of trades) {
        if (t.to_id === me().id && t.status === 'pending' && !ui.seenIncoming.has(t.id)) {
          ui.deps.showToast?.(`🎁 ${t.from_name} offers a ${gumName(t.give_kind)} for your ${gumName(t.want_kind)}. See Multi → Trades.`);
        }
      }
    }
    for (const t of trades) if (t.to_id === me().id) ui.seenIncoming.add(t.id);
  } catch (e) {
    status('Could not load trades.');
  } finally {
    ui.busy = false;
  }
  renderTrades();
  renderTradeForm();
}

async function respond(id, newStatus) {
  const t = ui.trades.find((x) => x.id === id);
  const s = save();
  if (!t || !s) return;
  if (newStatus === 'accepted' && !canAccept(s, t)) { status(`You need a ${gumName(t.want_kind)} to accept.`); return; }
  const r = await updateTrade(client(), id, newStatus);
  if (!r.ok) { status(r.reason === 'bad_transition' ? 'That offer has already changed. Refreshing…' : 'Could not update that offer.'); }
  else if (newStatus === 'accepted') ui.deps.showToast?.(`🤝 Traded your ${gumName(t.want_kind)} for a ${gumName(t.give_kind)}!`);
  await settleTrades(); // applies the swap / refund exactly once
}

async function handleSendTrade() {
  const s = save();
  const to = byId('mpTradeFriend')?.value;
  const give = byId('mpTradeGive')?.value;
  const want = byId('mpTradeWant')?.value;
  if (!me() || !s || !to) { status('Pick a friend who has added you back.'); return; }
  if (!isTradeableKind(want) || !canOffer(s, give)) { status('Pick a gumball you own to offer.'); return; }
  if (give === want) { status('Pick two different gumballs.'); return; }
  const btn = byId('btnMpSendTrade');
  if (btn) btn.disabled = true;
  const r = await createTrade(client(), to, give, want);
  if (!r.ok) {
    status({ not_mutual_friends: 'You can only trade with friends who added you back.', too_many_pending: 'You already have 10 open offers.' }[r.reason] || 'Could not send that offer.');
    if (btn) btn.disabled = false;
    return;
  }
  // set the offered gumball aside right away (settleTrades would do it too)
  applyTradeAction(s, { kind: 'escrow', trade: { id: r.id, from_id: me().id, to_id: to, give_kind: give, want_kind: want, status: 'pending' } }, today());
  ui.deps.saveGame();
  ui.deps.onGumballsChanged();
  status(`Offer sent: your ${gumName(give)} for their ${gumName(want)}.`);
  await settleTrades();
}

// ---------------------------------------------------------------- lifecycle

function stopTimers() {
  for (const t of ui.timers) clearInterval(t);
  ui.timers = [];
}

export function onSocialConnected() {
  stopTimers();
  touchPresence(client()).catch(() => {});
  ui.timers.push(setInterval(() => { if (me()) touchPresence(client()).catch(() => {}); }, PRESENCE_INTERVAL_MS));
  ui.timers.push(setInterval(() => { if (me()) { settleTrades({ notify: true }); refreshFriends(); } }, POLL_MS));
  refreshFriends();
  refreshShowcase();
  settleTrades({ notify: true });
}

export function onSocialDisconnected() {
  stopTimers();
  ui.friends = []; ui.showcase = []; ui.trades = [];
  renderFriends(); renderShowcase(); renderTrades(); renderTradeForm();
}

/**
 * deps: { getClient, getProfile, getSaveState, saveGame, onGumballsChanged,
 *         visitOwner(ownerId, displayName), setStatus, showToast }
 */
export function initSocialUI(deps) {
  ui.deps = deps;
  byId('btnMpAddFriend')?.addEventListener('click', handleAddFriend);
  byId('btnMpRefreshFriends')?.addEventListener('click', refreshFriends);
  byId('mpShowcaseOptIn')?.addEventListener('change', async (e) => {
    if (!me()) return;
    try {
      ui.showcaseOptIn = await setShowcase(client(), e.target.checked);
      status(ui.showcaseOptIn ? 'Your room is in the showcase.' : 'Your room is no longer listed.');
    } catch (err) {
      status('Could not change that setting.');
    }
    await refreshShowcase();
  });
  byId('btnMpShowcaseTop')?.addEventListener('click', () => { ui.sort = 'top'; refreshShowcase(); });
  byId('btnMpShowcaseNew')?.addEventListener('click', () => { ui.sort = 'new'; refreshShowcase(); });
  byId('btnMpSendTrade')?.addEventListener('click', handleSendTrade);
  document.querySelector('.tab-btn[data-tab="mpTradesTab"]')?.addEventListener('click', () => { renderTradeForm(); settleTrades(); });
  document.querySelector('.tab-btn[data-tab="mpShowcaseTab"]')?.addEventListener('click', () => refreshShowcase());
  document.querySelector('.tab-btn[data-tab="mpVisitTab"]')?.addEventListener('click', () => refreshFriends());
  renderFriends(); renderShowcase(); renderTrades(); renderTradeForm();
}
