// NPC behaviour: idle wandering, points of interest, stationary receptionist,
// click-to-talk pauses, ambient chatter, and keyword responses.
// Pure logic (no DOM) — takes a `rand` function and an `isBlocked` callback so
// it stays unit-testable; main.js wires in Math.random and real room state.

import { findPath, directionForStep } from './pathfinding.js';

export function createNpcRuntime(def) {
  return {
    id: def.id,
    room: def.room,
    x: def.home.x,
    y: def.home.y,
    fromX: def.home.x,
    fromY: def.home.y,
    toX: def.home.x,
    toY: def.home.y,
    targetX: null,
    targetY: null,
    dir: 'down',
    stationary: !!def.stationary,
    isReceptionist: !!def.isReceptionist,
    path: null,
    pathIdx: 0,
    pathStep: 0,
    moveProgress: 0,
    stepStart: 0,
    stepDuration: 240,
    sitting: null,
    pausedUntil: 0,
    bubble: null, // { text, until }
    nextWanderAt: 1200 + Math.random() * 2500,
    nextAmbientAt: 3000 + Math.random() * 4000,
    routineIdx: 0, // index into def.routine of the stop the NPC is currently at/heading to
  };
}

export function directionBetween(from, to) {
  return directionForStep(from, to);
}

const DEFAULT_DWELL_MS = () => 3200 + Math.random() * 4200;
const RETRY_DELAY_MS = () => 1500 + Math.random() * 1500;

/**
 * Tick an NPC's wander/ambient timers. `now` is a ms timestamp.
 * `tryWander(npc)` should return a reachable target `{ path, dwellMs? }`, a
 * `{ handledDirectly: true, dwellMs? }` result when the NPC acted in place
 * without walking (e.g. it was already standing on its next routine stop),
 * or null when no target is currently reachable.
 *
 * Gating is driven purely by `nextWanderAt` (not sitting/activity state) so
 * a seated/busy NPC still wakes up once its dwell time at that stop elapses.
 */
export function tickNpc(npc, now, { tryWander, pickAmbientLine, stepMs = 240 }) {
  if (npc.bubble && npc.bubble.until <= now) npc.bubble = null;

  const isStationary = !!(npc.stationary || npc.def?.stationary);
  const isPaused = npc.pausedUntil && now < npc.pausedUntil;

  if (!isStationary && !isPaused && !npc.walking && !npc.path && now >= npc.nextWanderAt) {
    const target = tryWander ? tryWander(npc) : null;
    if (target && target.path && target.path.length > 1) {
      const next = target.path[1];
      npc.path = target.path;
      npc.pathIdx = 0;
      npc.pathStep = 0;
      npc.fromX = npc.x;
      npc.fromY = npc.y;
      npc.toX = next.x;
      npc.toY = next.y;
      npc.targetX = target.path[target.path.length - 1].x;
      npc.targetY = target.path[target.path.length - 1].y;
      npc.dir = directionForStep(npc, next);
      npc.stepDuration = stepMs * Math.hypot(next.x - npc.x, next.y - npc.y);
      npc.stepStart = now;
      npc.walking = true;
      const travelMs = stepMs * (target.path.length - 1);
      npc.nextWanderAt = now + travelMs + (target.dwellMs ?? DEFAULT_DWELL_MS());
    } else if (target && target.handledDirectly) {
      npc.nextWanderAt = now + (target.dwellMs ?? DEFAULT_DWELL_MS());
    } else {
      npc.nextWanderAt = now + RETRY_DELAY_MS();
    }
  }

  if (now >= npc.nextAmbientAt && !npc.bubble) {
    const line = pickAmbientLine ? pickAmbientLine(npc) : null;
    if (line) npc.bubble = { text: line, until: now + 3400 };
    npc.nextAmbientAt = now + 8000 + Math.random() * 9000;
  }
}

export function findWanderTarget(npc, roomWidth, roomHeight, isBlocked, rand = Math.random, reservedTiles = []) {
  if (npc.stationary || npc.def?.stationary) return null;

  const isTileUnavailable = (x, y) => {
    if (x <= 0 || y <= 0 || x >= roomWidth || y >= roomHeight) return true;
    if (isBlocked(x, y)) return true;
    if (reservedTiles.some((r) => r.x === x && r.y === y)) return true;
    return false;
  };

  // 1. Prefer points of interest 35% of the time if configured
  const pois = npc.def?.pointsOfInterest;
  if (Array.isArray(pois) && pois.length > 0 && rand() < 0.35) {
    const poi = pois[Math.floor(rand() * pois.length)];
    if (poi && (poi.x !== npc.x || poi.y !== npc.y) && !isTileUnavailable(poi.x, poi.y)) {
      const path = findPath(roomWidth, roomHeight, isBlocked, { x: npc.x, y: npc.y }, { x: poi.x, y: poi.y });
      if (path && path.length > 1 && path.every((pt, idx) => idx === 0 || !isBlocked(pt.x, pt.y))) {
        return { path, targetTile: { x: poi.x, y: poi.y } };
      }
    }
  }

  // 2. Otherwise pick a reachable unblocked & unreserved floor tile
  for (let attempt = 0; attempt < 10; attempt++) {
    const tx = 1 + Math.floor(rand() * Math.max(1, roomWidth - 1));
    const ty = 1 + Math.floor(rand() * Math.max(1, roomHeight - 1));
    if (tx === npc.x && ty === npc.y) continue;
    if (isTileUnavailable(tx, ty)) continue;
    const path = findPath(roomWidth, roomHeight, isBlocked, { x: npc.x, y: npc.y }, { x: tx, y: ty });
    if (path && path.length > 1 && path.every((pt, idx) => idx === 0 || !isBlocked(pt.x, pt.y))) {
      return { path, targetTile: { x: tx, y: ty } };
    }
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
  const lower = (message || '').toLowerCase();
  const keywords = npcDef?.keywords || {};
  for (const keyword of Object.keys(keywords)) {
    if (lower.includes(keyword)) {
      const lines = keywords[keyword];
      return lines[Math.floor(rand() * lines.length)];
    }
  }
  return FALLBACK_LINES[Math.floor(rand() * FALLBACK_LINES.length)];
}

export function pickRandom(list, rand = Math.random) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(rand() * list.length)];
}
