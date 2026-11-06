// NPC behaviour: idle wandering, ambient chatter, keyword responses.
// Pure logic (no DOM) — takes a `rand` function and an `isBlocked` callback so
// it stays unit-testable; main.js wires in Math.random and real room state.

import { findPath } from './pathfinding.js';

export function createNpcRuntime(def) {
  return {
    id: def.id,
    room: def.room,
    x: def.home.x,
    y: def.home.y,
    dir: 'down',
    path: null,
    pathStep: 0,
    moveProgress: 0,
    sitting: null,
    bubble: null, // { text, until }
    nextWanderAt: 0,
    nextAmbientAt: 3000 + Math.random() * 4000,
  };
}

const DIRS = {
  '1,0': 'right',
  '-1,0': 'left',
  '0,1': 'down',
  '0,-1': 'up',
};

export function directionBetween(from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return DIRS[`${dx},${dy}`] || 'down';
}

/**
 * Tick an NPC's wander/ambient timers. `now` is a ms timestamp.
 * `tryWander(npc)` should return a reachable random target tile or null.
 * `onAmbient(npc, text)` is called when an ambient line should be shown.
 */
export function tickNpc(npc, now, { tryWander, pickAmbientLine }) {
  if (npc.bubble && npc.bubble.until <= now) npc.bubble = null;

  if (!npc.path && npc.sitting === null && now >= npc.nextWanderAt) {
    const target = tryWander(npc);
    if (target) {
      npc.path = target.path;
      npc.pathStep = 0;
    }
    npc.nextWanderAt = now + 4000 + Math.random() * 5000;
  }

  if (now >= npc.nextAmbientAt && !npc.bubble) {
    const line = pickAmbientLine(npc);
    if (line) npc.bubble = { text: line, until: now + 3200 };
    npc.nextAmbientAt = now + 8000 + Math.random() * 9000;
  }
}

export function findWanderTarget(npc, roomWidth, roomHeight, isBlocked, rand = Math.random) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const tx = Math.floor(rand() * roomWidth);
    const ty = Math.floor(rand() * roomHeight);
    if (isBlocked(tx, ty)) continue;
    const path = findPath(roomWidth, roomHeight, isBlocked, { x: npc.x, y: npc.y }, { x: tx, y: ty });
    if (path && path.length > 1) return { path };
  }
  return null;
}

const FALLBACK_LINES = [
  "That's nice.",
  'Tell me more!',
  'Interesting...',
  "I'm not sure what to say to that.",
];

/**
 * Match a typed chat message against an NPC's keyword table.
 * Returns a response string (falls back to a generic line, never null).
 */
export function respondToMessage(npcDef, message, rand = Math.random) {
  const lower = message.toLowerCase();
  for (const keyword of Object.keys(npcDef.keywords)) {
    if (lower.includes(keyword)) {
      const lines = npcDef.keywords[keyword];
      return lines[Math.floor(rand() * lines.length)];
    }
  }
  return FALLBACK_LINES[Math.floor(rand() * FALLBACK_LINES.length)];
}

export function pickRandom(list, rand = Math.random) {
  return list[Math.floor(rand() * list.length)];
}
