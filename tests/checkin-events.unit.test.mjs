// Daily check-in streak and seasonal events (pure logic).
import test from 'node:test';
import assert from 'node:assert/strict';

import { CHECKIN_REWARDS, checkinStatus, claimCheckin, dayKey } from '../js/checkin.js';
import { activeEvent, daysLeft, SEASONAL_EVENTS } from '../js/events.js';
import { advanceEventQuests, trackEventSet, setEventQuestProgress, listEventQuests, claimReward, advanceQuestsByType } from '../js/quests.js';
import { createDefaultState } from '../js/save.js';
import { QUESTS } from '../js/data.js';

const day = (y, m, d) => new Date(y, m - 1, d, 10, 0, 0);

test('check-in: first ever claim is day 1', () => {
  const s = createDefaultState();
  const coins = s.coins;
  const st = checkinStatus(s, day(2026, 11, 25));
  assert.equal(st.available, true);
  assert.equal(st.day, 1);
  const r = claimCheckin(s, day(2026, 11, 25));
  assert.deepEqual(r, { ok: true, streak: 1, day: 1, coins: CHECKIN_REWARDS[0] });
  assert.equal(s.coins, coins + CHECKIN_REWARDS[0]);
  assert.equal(s.checkin.lastDate, '2026-11-25');
});

test('check-in: once per day', () => {
  const s = createDefaultState();
  claimCheckin(s, day(2026, 11, 25));
  const again = claimCheckin(s, new Date(2026, 10, 25, 23, 59));
  assert.equal(again.ok, false);
  assert.equal(checkinStatus(s, day(2026, 11, 25)).available, false);
});

test('check-in: consecutive days build the streak through the 7-day cycle', () => {
  const s = createDefaultState();
  const got = [];
  for (let i = 0; i < 9; i++) got.push(claimCheckin(s, day(2026, 11, 25 + i)));
  assert.deepEqual(got.map((r) => r.day), [1, 2, 3, 4, 5, 6, 7, 1, 2]);
  assert.deepEqual(got.map((r) => r.coins).slice(0, 7), CHECKIN_REWARDS);
  assert.equal(s.checkin.streak, 9);
  assert.equal(s.checkin.best, 9);
  assert.equal(s.checkin.totalDays, 9);
});

test('check-in: a missed day restarts at day 1 but keeps the best streak', () => {
  const s = createDefaultState();
  for (let i = 0; i < 4; i++) claimCheckin(s, day(2026, 11, 1 + i));
  const st = checkinStatus(s, day(2026, 11, 7));
  assert.equal(st.broken, true);
  assert.equal(st.day, 1);
  claimCheckin(s, day(2026, 11, 7));
  assert.equal(s.checkin.streak, 1);
  assert.equal(s.checkin.best, 4);
});

test('check-in: streak carries across month and year ends', () => {
  const s = createDefaultState();
  claimCheckin(s, day(2026, 12, 31));
  assert.equal(claimCheckin(s, day(2027, 1, 1)).streak, 2);
  const t = createDefaultState();
  claimCheckin(t, day(2028, 2, 28));
  assert.equal(claimCheckin(t, day(2028, 2, 29)).streak, 2, 'leap day');
  assert.equal(claimCheckin(t, day(2028, 3, 1)).streak, 3);
  assert.equal(dayKey(day(2027, 1, 5)), '2027-01-05');
});

test('check-in: junk saved data is treated as no history', () => {
  const s = createDefaultState();
  s.checkin = { lastDate: 42, streak: 'x' };
  assert.equal(claimCheckin(s, day(2026, 11, 25)).streak, 1);
  s.checkin = undefined;
  assert.equal(checkinStatus(s, day(2026, 11, 26)).streak, 1);
});

test('events: every date of the year has exactly one event or none, windows match', () => {
  assert.equal(activeEvent(day(2026, 11, 25)).id, 'autumn_harvest');
  assert.equal(activeEvent(day(2026, 12, 25)).id, 'winter_lights');
  assert.equal(activeEvent(day(2027, 1, 3)).id, 'winter_lights');
  assert.equal(activeEvent(day(2026, 4, 1)).id, 'spring_bloom');
  assert.equal(activeEvent(day(2026, 7, 4)).id, 'summer_splash');
  assert.equal(activeEvent(day(2026, 1, 20)), null, 'mid-January is quiet');
  for (const ev of SEASONAL_EVENTS) assert.ok(ev.quests.length >= 3, `${ev.id} has quests`);
});

test('events: Winter Lights spanning New Year is one instance with one end date', () => {
  const dec = activeEvent(day(2026, 12, 20));
  const jan = activeEvent(day(2027, 1, 2));
  assert.equal(dec.key, 'winter_lights-2026');
  assert.equal(jan.key, 'winter_lights-2026');
  assert.equal(dec.endsAt.getFullYear(), 2027);
  assert.equal(daysLeft(jan, day(2027, 1, 6)), 1, 'last day');
  assert.equal(activeEvent(day(2027, 12, 20)).key, 'winter_lights-2027', 'next year starts fresh');
});

test('event quests progress separately and pay out once', () => {
  const s = createDefaultState();
  const now = day(2026, 11, 25); // Autumn Harvest
  const before = advanceQuestsByType(s, 'sit_restaurant', 1);
  assert.deepEqual(before, ['quest_dine'], 'permanent quest API unchanged by events');
  const done = advanceEventQuests(s, 'sit_restaurant', 1, now);
  assert.equal(done.length, 1);
  assert.ok(done[0].startsWith('event:autumn_harvest-2026:'));
  const coins = s.coins;
  const reward = claimReward(s, done[0], now);
  assert.ok(reward && reward.coins > 0);
  assert.equal(s.coins, coins + reward.coins);
  assert.equal(claimReward(s, done[0], now), null, 'not twice');
  assert.equal(advanceEventQuests(s, 'sit_restaurant', 1, day(2026, 1, 20)).length, 0, 'nothing outside an event');
});

test('event set goals count only what happens during the event', () => {
  const s = createDefaultState();
  s.stats.visitedRooms = ['lobby', 'cafe', 'gym', 'pool', 'arcade', 'library']; // lifetime
  const now = day(2026, 12, 5); // Winter Lights: visit 5 floors
  assert.deepEqual(trackEventSet(s, 'visit', 'lobby', now), []);
  trackEventSet(s, 'visit', 'lobby', now); // repeat visits don't count twice
  for (const r of ['cafe', 'gym', 'pool']) trackEventSet(s, 'visit', r, now);
  const done = trackEventSet(s, 'visit', 'arcade', now);
  assert.equal(done.length, 1);
  const ev = listEventQuests(s, now);
  assert.equal(ev.quests.find((q) => q.type === 'visit').progress, 5);
});

test('event streak goal uses the current streak', () => {
  const s = createDefaultState();
  const now = day(2026, 11, 25);
  assert.equal(setEventQuestProgress(s, 'checkin_streak', 2, now).length, 0);
  assert.equal(setEventQuestProgress(s, 'checkin_streak', 3, now).length, 1);
});

test('new permanent quests exist for the new hooks', () => {
  const types = new Set(QUESTS.map((q) => q.type));
  for (const t of ['swim_laps', 'checkin_streak', 'salon_style', 'massage', 'arcade_play', 'gumball_pulls']) {
    assert.ok(types.has(t), t);
  }
  const ids = QUESTS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'quest ids unique');
});
