// Pure gumball pull + collection-state logic for Pixel Hotel v0.8.10. No DOM
// access here — safe for Node tests. Rendering/animation lives in
// gumballs-ui.js; this module only touches js/save.js's `state.gumballs`.

import { GUMBALL_CATALOGUE, TOTAL_GUMBALLS, RARITY_ORDER, gumballsByRarity } from './catalogue.js';

export const GUMBALL_PULL_COST = 5;

/** Device-local YYYY-MM-DD, used both for firstObtained records and the daily trader/offer rotation. */
export function todayDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Weighted-random pick across the full catalogue using an injectable RNG (0..1). */
export function pullGumball(rng = Math.random) {
  const roll = rng();
  let acc = 0;
  for (const g of GUMBALL_CATALOGUE) {
    acc += g.p;
    if (roll < acc) return g.id;
  }
  return GUMBALL_CATALOGUE[GUMBALL_CATALOGUE.length - 1].id;
}

/** Records a pulled or traded-in gumball into save state. Mutates state.gumballs. */
export function recordGumball(state, gumballId, dateStr, count = 1) {
  const g = state.gumballs;
  g.counts[gumballId] = (g.counts[gumballId] || 0) + count;
  if (!g.firstObtained[gumballId]) g.firstObtained[gumballId] = dateStr;
  g.totalPulls = (g.totalPulls || 0) + count;
}

/** Removes `count` of a gumball from the collection (for trades). Returns false if insufficient. */
export function removeGumballs(state, gumballId, count = 1) {
  const g = state.gumballs;
  const have = g.counts[gumballId] || 0;
  if (have < count) return false;
  g.counts[gumballId] = have - count;
  return true;
}

export function ownedCount(state, gumballId) {
  return state.gumballs.counts[gumballId] || 0;
}

export function distinctOwnedInRarity(state, rarity) {
  return gumballsByRarity(rarity).filter((g) => ownedCount(state, g.id) > 0).length;
}

export function totalDistinctOwned(state) {
  return GUMBALL_CATALOGUE.filter((g) => ownedCount(state, g.id) > 0).length;
}

export function hasFullSet(state) {
  return totalDistinctOwned(state) === TOTAL_GUMBALLS;
}

export function rarityProgress(state) {
  return RARITY_ORDER.map((rarity) => {
    const all = gumballsByRarity(rarity);
    return {
      rarity,
      owned: all.filter((g) => ownedCount(state, g.id) > 0).length,
      total: all.length,
    };
  });
}
