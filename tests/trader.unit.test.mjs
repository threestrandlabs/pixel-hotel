// Unit tests for Pixel Hotel v0.8.10 Gumball trader NPC (daily persona + offers).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRADER_PROFILES, OFFERS_PER_DAY, FAVOR_RATIO,
  traderForDate, generateDailyOffers, offerFavorsNpc, tryAcceptTrade,
} from '../js/gumballs/trader.js';
import { recordGumball, ownedCount } from '../js/gumballs/gumballs.js';
import { createDefaultState } from '../js/save.js';

const FIXED_DATES = [
  '2026-01-01', '2026-02-14', '2026-03-03', '2026-04-20', '2026-05-05',
  '2026-06-18', '2026-07-04', '2026-08-30', '2026-09-09', '2026-10-31',
  '2026-11-11', '2026-12-25', '2027-01-01', '2027-06-15', '2027-09-22',
];

test('traderForDate: same date always picks the same trader from the pool', () => {
  for (const date of FIXED_DATES) {
    const a = traderForDate(date);
    const b = traderForDate(date);
    assert.equal(a.id, b.id);
    assert.ok(TRADER_PROFILES.includes(a));
  }
});

test('traderForDate: across many dates, more than one trader shows up (not always the same one)', () => {
  const ids = new Set(FIXED_DATES.map((d) => traderForDate(d).id));
  assert.ok(ids.size > 1, 'rotates across at least a few different traders');
});

test('generateDailyOffers: same date always produces the same offers (deterministic)', () => {
  for (const date of FIXED_DATES) {
    const a = generateDailyOffers(date);
    const b = generateDailyOffers(date);
    assert.deepEqual(a, b);
  }
});

test('generateDailyOffers: returns OFFERS_PER_DAY offers, each with a different give/receive gumball and positive counts', () => {
  for (const date of FIXED_DATES) {
    const offers = generateDailyOffers(date);
    assert.equal(offers.length, OFFERS_PER_DAY);
    for (const offer of offers) {
      assert.notEqual(offer.give.gumballId, offer.receive.gumballId);
      assert.ok(Number.isInteger(offer.give.count) && offer.give.count >= 1);
      assert.ok(Number.isInteger(offer.receive.count) && offer.receive.count >= 1);
    }
  }
});

test('every generated daily offer, across many fixed dates, favours the trader (give value >= 1.3x receive value)', () => {
  let checked = 0;
  for (const date of FIXED_DATES) {
    for (const offer of generateDailyOffers(date)) {
      assert.ok(offerFavorsNpc(offer), `offer ${JSON.stringify(offer)} on ${date} should favour the NPC`);
      checked += 1;
    }
  }
  // Also fuzz across a wider date range to make sure this isn't a coincidence of the fixed list.
  for (let y = 2025; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) {
      const date = `${y}-${String(m).padStart(2, '0')}-15`;
      for (const offer of generateDailyOffers(date)) {
        assert.ok(offerFavorsNpc(offer), `offer ${JSON.stringify(offer)} on ${date} should favour the NPC`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100, 'exercised a meaningful number of offers');
});

test('offerFavorsNpc: a hand-built offer below the ratio is correctly rejected', () => {
  // Player gives only 1 common (p=0.075, value~13.3) to receive the golden (p=0.01, value=100) — bad for the NPC.
  const badOffer = { give: { gumballId: 'common_red', count: 1 }, receive: { gumballId: 'legendary_golden', count: 1 } };
  assert.equal(offerFavorsNpc(badOffer), false);
  // Giving enough commons (10) for the golden clears the 1.3x bar — good for the NPC.
  const goodOffer = { give: { gumballId: 'common_red', count: 10 }, receive: { gumballId: 'legendary_golden', count: 1 } };
  assert.equal(offerFavorsNpc(goodOffer), true);
});

test('tryAcceptTrade: succeeds when the player has enough to give, exchanges gumballs, and records the trade', () => {
  const state = createDefaultState();
  const date = '2026-11-11';
  const offer = generateDailyOffers(date)[0];
  recordGumball(state, offer.give.gumballId, date, offer.give.count);

  const res = tryAcceptTrade(state, offer, date);
  assert.equal(res.ok, true);
  assert.equal(ownedCount(state, offer.give.gumballId), 0);
  assert.equal(ownedCount(state, offer.receive.gumballId), offer.receive.count);
  assert.deepEqual(state.gumballs.tradesAcceptedToday, [offer.id]);
});

test('tryAcceptTrade: fails without enough gumballs to give, and does not mutate state', () => {
  const state = createDefaultState();
  const date = '2026-11-11';
  const offer = generateDailyOffers(date)[0];
  // Give nothing — insufficient.
  const res = tryAcceptTrade(state, offer, date);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'insufficient_gumballs');
  assert.equal(ownedCount(state, offer.receive.gumballId), 0);
});

test('tryAcceptTrade: the same offer id cannot be accepted twice in the same day', () => {
  const state = createDefaultState();
  const date = '2026-11-11';
  const offer = generateDailyOffers(date)[0];
  recordGumball(state, offer.give.gumballId, date, offer.give.count * 2);

  assert.equal(tryAcceptTrade(state, offer, date).ok, true);
  const res2 = tryAcceptTrade(state, offer, date);
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'already_traded');
});

test('tryAcceptTrade: tradesAcceptedToday resets when the date rolls over', () => {
  const state = createDefaultState();
  const day1 = '2026-11-11';
  const day2 = '2026-11-12';
  const offer1 = generateDailyOffers(day1)[0];
  recordGumball(state, offer1.give.gumballId, day1, offer1.give.count);
  assert.equal(tryAcceptTrade(state, offer1, day1).ok, true);

  const offer2 = generateDailyOffers(day2)[0];
  recordGumball(state, offer2.give.gumballId, day2, offer2.give.count);
  assert.equal(tryAcceptTrade(state, offer2, day2).ok, true);
  assert.deepEqual(state.gumballs.tradesAcceptedToday, [offer2.id]);
  assert.equal(state.gumballs.lastTradeDate, day2);
});

test('FAVOR_RATIO is at least the 1.3x the spec requires', () => {
  assert.ok(FAVOR_RATIO >= 1.3);
});
