// Player-to-player gumball trades: pure settlement logic (no DOM, no network).
//
// The server only stores each trade's state machine
//   pending -> accepted | declined | cancelled,   accepted -> completed
// Gumball counts live in each player's own save, so each client applies its
// own side of a trade exactly once, recorded in a ledger in the save:
//   state.gumballs.tradeLedger[id] = { escrowed, received, applied, refunded }
//
// Sender (from = me):
//   escrow   the offered gumball leaves the collection when the offer is made
//   receive  once accepted, the wanted gumball arrives (then mark completed)
//   refund   if declined or cancelled, the escrowed gumball comes back
// Recipient (to = me):
//   apply    on accepting, swap: lose the wanted gumball, gain the offered one
//
// reconcileTrades() is idempotent: run it as often as you like (on load, on
// a timer, after any action) and every side of every trade settles once.

import { GUMBALL_CATALOGUE } from '../gumballs/catalogue.js';

const KIND_IDS = new Set(GUMBALL_CATALOGUE.map((g) => g.id));

export function isTradeableKind(kind) {
  return typeof kind === 'string' && KIND_IDS.has(kind);
}

export function ensureLedger(state) {
  const g = state.gumballs || (state.gumballs = { counts: {}, firstObtained: {}, totalPulls: 0 });
  if (!g.counts) g.counts = {};
  if (!g.firstObtained) g.firstObtained = {};
  if (!g.tradeLedger || typeof g.tradeLedger !== 'object') g.tradeLedger = {};
  return g.tradeLedger;
}

function entry(ledger, id) {
  const key = String(id);
  if (!ledger[key]) ledger[key] = { escrowed: false, received: false, applied: false, refunded: false };
  return ledger[key];
}

const count = (state, kind) => state.gumballs.counts[kind] || 0;

function take(state, kind) {
  state.gumballs.counts[kind] = Math.max(0, count(state, kind) - 1);
}

function give(state, kind, dateStr) {
  state.gumballs.counts[kind] = count(state, kind) + 1;
  if (!state.gumballs.firstObtained[kind]) state.gumballs.firstObtained[kind] = dateStr;
}

/**
 * What this client still has to do for each trade.
 * Returns [{ kind: 'escrow'|'receive'|'refund'|'apply'|'complete', trade }].
 */
export function reconcileTrades(trades, ledger, myId) {
  const actions = [];
  for (const t of trades || []) {
    if (!t || !isTradeableKind(t.give_kind) || !isTradeableKind(t.want_kind)) continue;
    const e = (ledger || {})[String(t.id)] || {};
    if (t.from_id === myId) {
      const live = ['pending', 'accepted', 'completed'].includes(t.status);
      if (live && !e.escrowed) actions.push({ kind: 'escrow', trade: t });
      if ((t.status === 'accepted' || t.status === 'completed') && !e.received) actions.push({ kind: 'receive', trade: t });
      if (t.status === 'accepted') actions.push({ kind: 'complete', trade: t });
      if ((t.status === 'declined' || t.status === 'cancelled') && e.escrowed && !e.refunded) actions.push({ kind: 'refund', trade: t });
    } else if (t.to_id === myId) {
      if ((t.status === 'accepted' || t.status === 'completed') && !e.applied) actions.push({ kind: 'apply', trade: t });
    }
  }
  return actions;
}

/**
 * Applies one local action to the save (never the 'complete' server call).
 * Returns true if the collection changed.
 */
export function applyTradeAction(state, action, dateStr) {
  const ledger = ensureLedger(state);
  const t = action.trade;
  const e = entry(ledger, t.id);
  switch (action.kind) {
    case 'escrow':
      if (e.escrowed) return false;
      take(state, t.give_kind);
      e.escrowed = true;
      return true;
    case 'receive':
      if (e.received) return false;
      give(state, t.want_kind, dateStr);
      e.received = true;
      return true;
    case 'refund':
      if (!e.escrowed || e.refunded) return false;
      give(state, t.give_kind, dateStr);
      e.refunded = true;
      return true;
    case 'apply':
      if (e.applied) return false;
      take(state, t.want_kind);
      give(state, t.give_kind, dateStr);
      e.applied = true;
      return true;
    default:
      return false;
  }
}

/** Can I offer `kind`? (I must have one that isn't already set aside.) */
export function canOffer(state, kind) {
  return isTradeableKind(kind) && count(state, kind) > 0;
}

/** Can I accept this incoming trade? (I must have the gumball they want.) */
export function canAccept(state, trade) {
  return trade.status === 'pending' && isTradeableKind(trade.want_kind) && count(state, trade.want_kind) > 0;
}

/** Drops ledger entries for trades the server no longer reports and that are fully settled. */
export function pruneLedger(state, trades) {
  const ledger = ensureLedger(state);
  const live = new Set((trades || []).map((t) => String(t.id)));
  for (const [id, e] of Object.entries(ledger)) {
    if (live.has(id)) continue;
    const settled = e.applied || e.refunded || (e.escrowed && e.received);
    if (settled) delete ledger[id];
  }
}
