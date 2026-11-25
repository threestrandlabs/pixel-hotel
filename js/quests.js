// Pure quest tracking logic: progress, completion, coin rewards, catalogue unlocks.

import { QUESTS } from './data.js';
import { activeEvent } from './events.js';

export function initQuestState() {
  const quests = {};
  for (const q of QUESTS) {
    quests[q.id] = { progress: 0, complete: false, claimed: false };
  }
  return quests;
}

function getQuestDef(id, now = new Date()) {
  return QUESTS.find((q) => q.id === id) || (activeEvent(now)?.quests || []).find((q) => q.id === id) || null;
}

/** A quest definition by id: a permanent quest or one of the running event's. */
export function questDef(id, now = new Date()) {
  return getQuestDef(id, now);
}

function eventProgress(state, type, now, update) {
  const ev = activeEvent(now);
  if (!ev) return [];
  const newlyComplete = [];
  for (const def of ev.quests) {
    if (def.type !== type) continue;
    if (!state.quests[def.id]) state.quests[def.id] = { progress: 0, complete: false, claimed: false };
    const q = state.quests[def.id];
    if (q.complete) continue;
    q.progress = Math.min(def.target, update(q.progress));
    if (q.progress >= def.target) {
      q.complete = true;
      newlyComplete.push(def.id);
    }
  }
  return newlyComplete;
}

/** Like advanceQuestsByType, for the running seasonal event's quests. */
export function advanceEventQuests(state, type, amount = 1, now = new Date()) {
  return eventProgress(state, type, now, (p) => p + amount);
}

/**
 * Set-style goals (visit N floors, greet N guests) for the running event:
 * counts distinct `key`s seen *during this event*, not the lifetime total.
 */
export function trackEventSet(state, type, key, now = new Date()) {
  const ev = activeEvent(now);
  if (!ev || key == null) return [];
  const newlyComplete = [];
  for (const def of ev.quests) {
    if (def.type !== type) continue;
    if (!state.quests[def.id]) state.quests[def.id] = { progress: 0, complete: false, claimed: false };
    const q = state.quests[def.id];
    if (q.complete) continue;
    const seen = Array.isArray(q.seen) ? q.seen : [];
    if (!seen.includes(key)) seen.push(key);
    q.seen = seen;
    q.progress = Math.min(def.target, seen.length);
    if (q.progress >= def.target) {
      q.complete = true;
      newlyComplete.push(def.id);
    }
  }
  return newlyComplete;
}

/** Like setQuestProgress, for the running seasonal event's quests (e.g. a streak length). */
export function setEventQuestProgress(state, type, value, now = new Date()) {
  return eventProgress(state, type, now, () => value);
}

/** The running event (or null) with each quest's current progress. */
export function listEventQuests(state, now = new Date()) {
  const ev = activeEvent(now);
  if (!ev) return null;
  return {
    ...ev,
    quests: ev.quests.map((def) => ({ ...def, progress: 0, complete: false, claimed: false, ...state.quests[def.id] })),
  };
}

/**
 * Advance progress for every quest of a given type by `amount`, capped at target.
 * Returns list of quest ids that newly became complete (not yet claimed).
 */
export function advanceQuestsByType(state, type, amount = 1) {
  const newlyComplete = [];
  for (const def of QUESTS) {
    if (def.type !== type) continue;
    const q = state.quests[def.id];
    if (!q || q.complete) continue;
    q.progress = Math.min(def.target, q.progress + amount);
    if (q.progress >= def.target) {
      q.complete = true;
      newlyComplete.push(def.id);
    }
  }
  return newlyComplete;
}

/**
 * Set progress for a quest type to an exact value (used for set-based goals
 * like "visited rooms" or "distinct greeted npcs" where the caller tracks
 * the underlying set and passes its size).
 */
export function setQuestProgress(state, type, value) {
  const newlyComplete = [];
  for (const def of QUESTS) {
    if (def.type !== type) continue;
    const q = state.quests[def.id];
    if (!q || q.complete) continue;
    q.progress = Math.min(def.target, value);
    if (q.progress >= def.target) {
      q.complete = true;
      newlyComplete.push(def.id);
    }
  }
  return newlyComplete;
}

/**
 * Claim the reward for a completed-but-unclaimed quest: grants coins and
 * unlocks a catalogue item if any. Returns the reward or null if not claimable.
 */
export function claimReward(state, questId, now = new Date()) {
  const def = getQuestDef(questId, now);
  const q = state.quests[questId];
  if (!def || !q || !q.complete || q.claimed) return null;
  q.claimed = true;
  state.coins += def.reward.coins;
  if (def.reward.unlock && !state.unlocked.includes(def.reward.unlock)) {
    state.unlocked.push(def.reward.unlock);
  }
  return def.reward;
}

export function listQuests(state) {
  return QUESTS.map((def) => ({
    ...def,
    ...state.quests[def.id],
  }));
}
