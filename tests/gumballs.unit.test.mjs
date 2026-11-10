// Unit tests for Pixel Hotel v0.8.10 Gumball collection core logic.

import test from 'node:test';
import assert from 'node:assert/strict';

import { GUMBALL_CATALOGUE, TOTAL_GUMBALLS, gumballValue, gumballsByRarity } from '../js/gumballs/catalogue.js';
import {
  pullGumball, recordGumball, removeGumballs, ownedCount,
  distinctOwnedInRarity, totalDistinctOwned, hasFullSet, rarityProgress, GUMBALL_PULL_COST,
} from '../js/gumballs/gumballs.js';
import { createDefaultState } from '../js/save.js';

function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('gumball drop table: probabilities sum to 1 (100%) across the full catalogue', () => {
  const sum = GUMBALL_CATALOGUE.reduce((acc, g) => acc + g.p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `sum ${sum} should be ~1`);
});

test('gumball drop table: rarity tier totals match the spec (legendary 1%, special 12%, rare 17%, uncommon 25%, common 45%)', () => {
  const tierSum = (r) => gumballsByRarity(r).reduce((acc, g) => acc + g.p, 0);
  assert.ok(Math.abs(tierSum('legendary') - 0.01) < 1e-9);
  assert.ok(Math.abs(tierSum('special') - 0.12) < 1e-9);
  assert.ok(Math.abs(tierSum('rare') - 0.17) < 1e-9);
  assert.ok(Math.abs(tierSum('uncommon') - 0.25) < 1e-9);
  assert.ok(Math.abs(tierSum('common') - 0.45) < 1e-9);
});

test('gumball drop table: every entry has a unique id and a positive probability', () => {
  const ids = new Set(GUMBALL_CATALOGUE.map((g) => g.id));
  assert.equal(ids.size, GUMBALL_CATALOGUE.length);
  for (const g of GUMBALL_CATALOGUE) assert.ok(g.p > 0, `${g.id} has positive probability`);
  assert.equal(TOTAL_GUMBALLS, GUMBALL_CATALOGUE.length);
});

test('gumballValue: rarer gumballs are worth strictly more than commons', () => {
  const common = gumballValue('common_red');
  const uncommon = gumballValue('uncommon_mango_swirl');
  const rare = gumballValue('rare_ruby');
  const special = gumballValue('special_catch_ball');
  const legendary = gumballValue('legendary_golden');
  assert.ok(common < uncommon);
  assert.ok(uncommon < rare);
  assert.ok(rare < special);
  assert.ok(special < legendary);
});

test('pullGumball: roll of 0 always returns the first catalogue entry', () => {
  assert.equal(pullGumball(() => 0), GUMBALL_CATALOGUE[0].id);
});

test('pullGumball: roll just under 1 returns the last catalogue entry (golden)', () => {
  assert.equal(pullGumball(() => 0.999999999), GUMBALL_CATALOGUE[GUMBALL_CATALOGUE.length - 1].id);
});

test('pullGumball: a fixed seed is fully deterministic across repeated runs', () => {
  const rng = mulberry32(42);
  const seqA = Array.from({ length: 20 }, () => pullGumball(rng));
  const rng2 = mulberry32(42);
  const seqB = Array.from({ length: 20 }, () => pullGumball(rng2));
  assert.deepEqual(seqA, seqB);
});

test('pullGumball: over many seeded trials, observed frequency roughly matches stated probability', () => {
  const rng = mulberry32(7);
  const trials = 200000;
  const counts = {};
  for (let i = 0; i < trials; i++) {
    const id = pullGumball(rng);
    counts[id] = (counts[id] || 0) + 1;
  }
  const commonFreq = (counts.common_red || 0) / trials;
  // common_red has p = 0.075; allow generous tolerance for RNG noise.
  assert.ok(Math.abs(commonFreq - 0.075) < 0.01, `common_red frequency ${commonFreq} close to 0.075`);
  const goldenFreq = (counts.legendary_golden || 0) / trials;
  assert.ok(Math.abs(goldenFreq - 0.01) < 0.005, `golden frequency ${goldenFreq} close to 0.01`);
});

test('recordGumball: first pull sets count=1 and firstObtained date; later pulls increment count without changing the date', () => {
  const state = createDefaultState();
  recordGumball(state, 'common_red', '2026-01-01');
  assert.equal(ownedCount(state, 'common_red'), 1);
  assert.equal(state.gumballs.firstObtained.common_red, '2026-01-01');
  assert.equal(state.gumballs.totalPulls, 1);

  recordGumball(state, 'common_red', '2026-01-02');
  assert.equal(ownedCount(state, 'common_red'), 2);
  assert.equal(state.gumballs.firstObtained.common_red, '2026-01-01', 'firstObtained date does not change on later pulls');
  assert.equal(state.gumballs.totalPulls, 2);
});

test('removeGumballs: fails and leaves counts unchanged when insufficient, succeeds and decrements otherwise', () => {
  const state = createDefaultState();
  recordGumball(state, 'common_red', '2026-01-01', 2);

  assert.equal(removeGumballs(state, 'common_red', 5), false);
  assert.equal(ownedCount(state, 'common_red'), 2, 'unchanged after a failed removal');

  assert.equal(removeGumballs(state, 'common_red', 2), true);
  assert.equal(ownedCount(state, 'common_red'), 0);
});

test('totalDistinctOwned / hasFullSet / rarityProgress track the collection correctly', () => {
  const state = createDefaultState();
  assert.equal(totalDistinctOwned(state), 0);
  assert.equal(hasFullSet(state), false);

  for (const g of GUMBALL_CATALOGUE) recordGumball(state, g.id, '2026-01-01');
  assert.equal(totalDistinctOwned(state), TOTAL_GUMBALLS);
  assert.equal(hasFullSet(state), true);

  const progress = rarityProgress(state);
  const common = progress.find((p) => p.rarity === 'common');
  assert.equal(common.owned, 6);
  assert.equal(common.total, 6);
  assert.equal(distinctOwnedInRarity(state, 'common'), 6);
});

test('GUMBALL_PULL_COST is a small positive coin amount', () => {
  assert.equal(GUMBALL_PULL_COST, 5);
});
