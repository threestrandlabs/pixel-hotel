// Pixel Hotel v0.8.10 — Gumball trader NPC: daily-rotating persona + daily
// trade offers. Pure logic, no DOM access — safe for Node tests. Everything
// here is deterministic from a YYYY-MM-DD date string so the same day always
// produces the same trader and the same offers for every player.

import { GUMBALL_CATALOGUE } from './catalogue.js';
import { gumballValue, getGumball } from './catalogue.js';
import { recordGumball, removeGumballs } from './gumballs.js';

export const FAVOR_RATIO = 1.3;
export const OFFERS_PER_DAY = 4;

// Seven original traveling gumball traders. No real names/brands — just a
// rotating cast with a distinct shirt color (and optional hair tint) so each
// day's visitor reads as a different person on the existing generic avatar.
export const TRADER_PROFILES = [
  { id: 'minty', name: 'Minty', color: '#3ecf9a', look: { hairColor: '#1f6b4a' }, greetLine: "Minty's in town today — got gumballs worth swapping?" },
  { id: 'rook', name: 'Rook', color: '#7b8699', look: { hairColor: '#2e343f' }, greetLine: "Rook here. I don't haggle, but I do trade fair... for me." },
  { id: 'sable', name: 'Sable', color: '#5a3d7a', look: { hairColor: '#1c1024' }, greetLine: "Sable's got today's offers ready, if you're brave enough." },
  { id: 'clementine', name: 'Clementine', color: '#ff8a3d', look: { hairColor: '#7a3c10' }, greetLine: "Clementine! Fresh trades, hot off the cart." },
  { id: 'juniper', name: 'Juniper', color: '#2e8c5a', look: { hairColor: '#143d24' }, greetLine: "Juniper's passing through — want to see today's swaps?" },
  { id: 'opal', name: 'Opal', color: '#cbb7e8', look: { hairColor: '#f4eefc' }, greetLine: "Opal, at your service. My offers change with the sun." },
  { id: 'ember', name: 'Ember', color: '#e8503d', look: { hairColor: '#7a1f14' }, greetLine: "Ember's here today. Trades are good 'til midnight." },
];

function hashDateStr(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day's trader persona, deterministic from a YYYY-MM-DD date string. */
export function traderForDate(dateStr) {
  const h = hashDateStr(`trader:${dateStr}`);
  return TRADER_PROFILES[h % TRADER_PROFILES.length];
}

/** Mutates an NPC def in place to show today's trader persona (name/color/look/lines). */
export function applyTraderPersona(npcDef, dateStr) {
  const persona = traderForDate(dateStr);
  npcDef.name = persona.name;
  npcDef.color = persona.color;
  npcDef.look = persona.look;
  npcDef.greetLines = [persona.greetLine];
  npcDef.ambientLines = [persona.greetLine];
  npcDef.keywords = { ...npcDef.keywords, hello: [persona.greetLine] };
  return npcDef;
}

/**
 * The day's 4 trade offers: any gumball for any gumball, always favouring
 * the trader (what the player gives is worth >= FAVOR_RATIO x what they get
 * back, using 1/probability as rarity value). Deterministic from dateStr.
 */
export function generateDailyOffers(dateStr) {
  const rng = mulberry32(hashDateStr(`offers:${dateStr}`));
  const offers = [];
  for (let i = 0; i < OFFERS_PER_DAY; i++) {
    const receive = GUMBALL_CATALOGUE[Math.floor(rng() * GUMBALL_CATALOGUE.length)];
    let give = receive;
    while (give.id === receive.id) {
      give = GUMBALL_CATALOGUE[Math.floor(rng() * GUMBALL_CATALOGUE.length)];
    }
    const receiveCount = 1;
    const receiveValue = gumballValue(receive.id);
    const giveValue = gumballValue(give.id);
    const giveCount = Math.max(1, Math.ceil((FAVOR_RATIO * receiveValue * receiveCount) / giveValue));
    offers.push({
      id: `${dateStr}-${i}`,
      give: { gumballId: give.id, count: giveCount },
      receive: { gumballId: receive.id, count: receiveCount },
    });
  }
  return offers;
}

/** True if what the player gives is worth at least FAVOR_RATIO x what they receive. */
export function offerFavorsNpc(offer) {
  const giveTotal = gumballValue(offer.give.gumballId) * offer.give.count;
  const receiveTotal = gumballValue(offer.receive.gumballId) * offer.receive.count;
  return giveTotal >= FAVOR_RATIO * receiveTotal - 1e-9;
}

function rolloverTradeDayIfNeeded(state, dateStr) {
  if (state.gumballs.lastTradeDate !== dateStr) {
    state.gumballs.lastTradeDate = dateStr;
    state.gumballs.tradesAcceptedToday = [];
  }
}

/**
 * Attempts to accept a trade offer: validates the player has enough of the
 * "give" gumball, that this exact offer slot hasn't already been used today,
 * then exchanges it. Returns {ok:true} or {ok:false, reason}.
 */
export function tryAcceptTrade(state, offer, dateStr) {
  rolloverTradeDayIfNeeded(state, dateStr);
  if (state.gumballs.tradesAcceptedToday.includes(offer.id)) {
    return { ok: false, reason: 'already_traded' };
  }
  if (!getGumball(offer.give.gumballId) || !getGumball(offer.receive.gumballId)) {
    return { ok: false, reason: 'invalid_offer' };
  }
  if (!removeGumballs(state, offer.give.gumballId, offer.give.count)) {
    return { ok: false, reason: 'insufficient_gumballs' };
  }
  recordGumball(state, offer.receive.gumballId, dateStr, offer.receive.count);
  state.gumballs.tradesAcceptedToday.push(offer.id);
  return { ok: true };
}
