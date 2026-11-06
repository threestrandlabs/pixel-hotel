// Pure quest tracking logic: progress, completion, coin rewards, catalogue unlocks.

import { QUESTS } from './data.js';

export function initQuestState() {
  const quests = {};
  for (const q of QUESTS) {
    quests[q.id] = { progress: 0, complete: false, claimed: false };
  }
  return quests;
}

function getQuestDef(id) {
  return QUESTS.find((q) => q.id === id) || null;
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
export function claimReward(state, questId) {
  const def = getQuestDef(questId);
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
