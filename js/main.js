import { ROOMS, NPCS, QUESTS, getCatalogueItem, TILE, SAVE_VERSION } from './data.js';
import { findPath } from './pathfinding.js';
import {
  buyItem, placeItem, pickupItem, moveItem, canPlaceAt, footprintCells,
  availableCatalogue, rotatedFootprint, findApproachTile, seatDirFromRot,
} from './inventory.js';
import { advanceQuestsByType, setQuestProgress, claimReward, listQuests } from './quests.js';
import { loadState, saveState, resetState } from './save.js';
import {
  createNpcRuntime, tickNpc, findWanderTarget, directionBetween, respondToMessage, pickRandom,
} from './npc.js';
import { renderRoom, computeOrigin, screenToTile } from './render.js';
import { audio } from './audio.js';

const STEP_MS = 240;
const DAY_CYCLE_MS = 120000;
const HELP_SEEN_KEY = 'pixelHotel.helpSeen.v1';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let state = loadState(window.localStorage);

const npcRuntimes = NPCS.map((def) => ({
  def,
  ...createNpcRuntime(def),
  renderX: def.home.x,
  renderY: def.home.y,
  dir: 'down',
  frame: 0,
  walking: false,
  pathIdx: 0,
  stepStart: 0,
  lying: false,
  activity: null,
  pendingInteract: null,
}));

const player = {
  renderX: state.player.x,
  renderY: state.player.y,
  x: state.player.x,
  y: state.player.y,
  dir: state.player.dir || 'down',
  frame: 0,
  walking: false,
  path: null,
  pathIdx: 0,
  stepStart: 0,
  sitting: state.player.sitting || null,
  lying: false,
  activity: state.player.activity || null,
  pendingInteract: null,
};

const visitedRooms = new Set(state.stats.visitedRooms || ['lobby']);
const greetedNpcs = new Set(state.stats.greetedNpcs || []);
let chatLog = [];

const ui = {
  placing: null, // { instanceId, itemId, rot, moveInstanceId }
  hoverTile: null,
  phase: 0.5, // start at noon
  startTime: null,
  cssW: 960,
  cssH: 600,
  dpr: 1,
  elevatorAnim: null,
};

function syncCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.max(1, Math.round(rect.width || 960));
  const cssH = Math.max(1, Math.round(rect.height || 600));
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH || ui.dpr !== dpr || ui.cssW !== cssW || ui.cssH !== cssH) {
    canvas.width = targetW;
    canvas.height = targetH;
    ui.cssW = cssW;
    ui.cssH = cssH;
    ui.dpr = dpr;
  }
}

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => syncCanvasSize()).observe(canvas);
}
window.addEventListener('resize', syncCanvasSize);

// ---------- room/state helpers ----------

function currentRoomDef() { return ROOMS[state.player.room] || ROOMS.lobby; }
function currentRoomRuntime() { return state.rooms[state.player.room]; }
function roomForInventory(roomId = state.player.room) {
  const def = ROOMS[roomId];
  return { width: def.width, height: def.height, grid: def.grid, placed: state.rooms[roomId].placed };
}

function furnitureAt(room, roomRuntime, x, y) {
  for (const p of roomRuntime.placed) {
    const item = getCatalogueItem(p.itemId);
    if (!item || item.flat) continue;
    const cells = footprintCells(p.x, p.y, item.footprint, p.rot);
    if (cells.some((c) => c.x === x && c.y === y)) return p;
  }
  return null;
}

function interactiveFurnitureAt(room, roomRuntime, x, y) {
  const solid = furnitureAt(room, roomRuntime, x, y);
  if (solid) {
    const item = getCatalogueItem(solid.itemId);
    if (item && (item.seat || item.interaction)) return solid;
    return null;
  }
  for (const p of roomRuntime.placed) {
    const item = getCatalogueItem(p.itemId);
    if (!item || !item.flat || !item.interaction) continue;
    const cells = footprintCells(p.x, p.y, item.footprint, p.rot);
    if (cells.some((c) => c.x === x && c.y === y)) return p;
  }
  return null;
}

function occupantTilesExcluding(excludeKind, excludeId) {
  const tiles = [];
  if (!(excludeKind === 'player')) tiles.push({ x: player.x, y: player.y });
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    if (excludeKind === 'npc' && n.id === excludeId) continue;
    tiles.push({ x: n.x, y: n.y });
  }
  return tiles;
}

function reservedTilesExcluding(excludeKind, excludeId) {
  const tiles = [];
  if (excludeKind !== 'player' && player.pendingInteract?.targetTile) {
    tiles.push(player.pendingInteract.targetTile);
  }
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    if (excludeKind === 'npc' && n.id === excludeId) continue;
    if (n.pendingInteract?.targetTile) tiles.push(n.pendingInteract.targetTile);
  }
  return tiles;
}

function isBlockedFactory(room, roomRuntime, occupantTiles) {
  return (x, y) => {
    const cell = room.grid[y][x];
    if (cell === TILE.WALL || cell === TILE.WINDOW || cell === TILE.VOID) return true;
    const furn = furnitureAt(room, roomRuntime, x, y);
    if (furn) {
      const item = getCatalogueItem(furn.itemId);
      if (!item.seat && item.interaction !== 'treadmill') return true;
    }
    if (occupantTiles.some((o) => o.x === x && o.y === y)) return true;
    return false;
  };
}

// ---------- mover step engine (shared by player + NPCs) ----------

function beginStep(mover, now) {
  const next = mover.path[mover.pathIdx + 1];
  mover.fromX = mover.x;
  mover.fromY = mover.y;
  mover.toX = next.x;
  mover.toY = next.y;
  mover.dir = directionBetween({ x: mover.x, y: mover.y }, next);
  mover.stepStart = now;
  mover.walking = true;
  if (mover === player) audio.playSfx('footstep');
}

function startPath(mover, path, now) {
  if (!path || path.length < 2) {
    mover.path = null;
    mover.walking = false;
    return;
  }
  mover.path = path;
  mover.pathIdx = 0;
  mover.sitting = null;
  mover.lying = false;
  mover.activity = null;
  mover.pendingInteract = null;
  beginStep(mover, now);
}

function updateMover(mover, now, onArrive) {
  if (!mover.walking) {
    mover.renderX = mover.x;
    mover.renderY = mover.y;
    return;
  }
  const t = Math.min(1, (now - mover.stepStart) / STEP_MS);
  mover.renderX = mover.fromX + (mover.toX - mover.fromX) * t;
  mover.renderY = mover.fromY + (mover.toY - mover.fromY) * t;
  mover.frame = Math.floor(now / 140) % 2;
  if (t >= 1) {
    mover.x = mover.toX;
    mover.y = mover.toY;
    mover.pathIdx++;
    if (mover.pathIdx >= mover.path.length - 1) {
      mover.walking = false;
      mover.path = null;
      if (onArrive) onArrive();
    } else {
      beginStep(mover, now);
    }
  }
}

// ---------- player actions & elevator navigation ----------

function applyInteractionArrival(mover, pending, isPlayer = false) {
  const roomRuntime = state.rooms[isPlayer ? state.player.room : mover.room];
  const placed = roomRuntime.placed.find((p) => p.instanceId === pending.instanceId);
  if (!placed) return;
  mover.dir = pending.dir;
  const kind = pending.kind;
  const isSeatPose = kind === 'sit' || kind === 'eat';
  const isLiePose = kind === 'lie';
  mover.sitting = (isSeatPose || isLiePose) ? placed.instanceId : null;
  mover.lying = isLiePose;
  mover.activity = {
    instanceId: placed.instanceId,
    itemId: placed.itemId,
    kind,
    phase: 'loop',
    startedAt: performance.now(),
  };
  if (isPlayer) {
    state.player.sitting = mover.sitting;
    state.player.dir = mover.dir;
    state.player.activity = mover.activity;
    if (!Array.isArray(state.stats.activitiesUsed)) state.stats.activitiesUsed = [];
    if (!state.stats.activitiesUsed.includes(kind)) state.stats.activitiesUsed.push(kind);
    if (placed.itemId === 'rooftop_sofa') {
      onQuestProgress(advanceQuestsByType(state, 'sit', 1));
    }
    if (state.player.room === 'restaurant' && (kind === 'sit' || kind === 'eat')) {
      onQuestProgress(advanceQuestsByType(state, 'sit_restaurant', 1));
    }
    persistPlayerPos();
  }
}

function tryWalkPlayer(tx, ty) {
  const room = currentRoomDef();
  const occ = occupantTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, currentRoomRuntime(), occ);
  const path = findPath(room.width, room.height, blocked, { x: player.x, y: player.y }, { x: tx, y: ty });
  if (!path) return false;
  player.sitting = null;
  player.lying = false;
  player.activity = null;
  state.player.sitting = null;
  state.player.activity = null;
  startPath(player, path, performance.now());
  return true;
}

function tryInteractPlayer(placedItem, immediate = false) {
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const occ = occupantTilesExcluding('player', null);
  const res = reservedTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, roomRuntime, occ);
  const approach = findApproachTile(roomForInventory(), placedItem, blocked, { x: player.x, y: player.y }, occ, res);
  if (!approach) return false;
  const pending = {
    instanceId: placedItem.instanceId,
    itemId: placedItem.itemId,
    targetTile: approach.tile,
    dir: approach.dir,
    kind: approach.kind,
  };
  if (immediate || approach.path.length <= 1) {
    player.x = approach.tile.x;
    player.y = approach.tile.y;
    player.renderX = approach.tile.x;
    player.renderY = approach.tile.y;
    player.walking = false;
    player.path = null;
    player.pendingInteract = null;
    applyInteractionArrival(player, pending, true);
    return true;
  }
  startPath(player, approach.path, performance.now());
  player.pendingInteract = pending;
  return true;
}

function onPlayerArrive() {
  const room = currentRoomDef();
  const cell = room.grid[player.y][player.x];
  if (player.pendingInteract) {
    const pending = player.pendingInteract;
    player.pendingInteract = null;
    applyInteractionArrival(player, pending, true);
    return;
  }
  const roomRuntime = currentRoomRuntime();
  const flatPool = roomRuntime.placed.find((p) => {
    if (p.itemId !== 'pool_water') return false;
    const item = getCatalogueItem(p.itemId);
    return footprintCells(p.x, p.y, item.footprint, p.rot).some((c) => c.x === player.x && c.y === player.y);
  });
  if (flatPool) {
    player.activity = {
      instanceId: flatPool.instanceId,
      itemId: 'pool_water',
      kind: 'swim',
      phase: 'loop',
      startedAt: performance.now(),
    };
    state.player.activity = player.activity;
  }
  if (cell === TILE.DOOR) {
    const doorDef = room.doors.find((d) => d.x === player.x && d.y === player.y);
    if (doorDef) {
      if (doorDef.elevator) {
        openElevatorPanel();
      } else {
        switchRoom(doorDef.to, doorDef.toTile);
      }
    }
    return;
  }
  persistPlayerPos();
}

function persistPlayerPos() {
  state.player.x = player.x;
  state.player.y = player.y;
  state.player.dir = player.dir;
  state.player.sitting = player.sitting;
  state.player.activity = player.activity;
}

function switchRoom(roomId, toTile) {
  const targetDef = ROOMS[roomId];
  if (!targetDef) return false;
  const dest = toTile || targetDef.spawn;
  state.player.room = roomId;
  player.x = dest.x;
  player.y = dest.y;
  player.renderX = dest.x;
  player.renderY = dest.y;
  player.walking = false;
  player.path = null;
  player.sitting = null;
  player.lying = false;
  player.activity = null;
  player.pendingInteract = null;
  player.bubbleText = null;
  player.bubbleUntil = 0;
  state.player.sitting = null;
  state.player.activity = null;
  persistPlayerPos();
  visitedRooms.add(roomId);
  state.stats.visitedRooms = Array.from(visitedRooms);
  onQuestProgress(setQuestProgress(state, 'visit', visitedRooms.size));
  if (roomId === 'gym') {
    onQuestProgress(advanceQuestsByType(state, 'visit_gym', 1));
  }
  updateRoomLabel();
  audio.setRoomMood(roomId, ui.phase);
  refreshAudioUi();
  refreshRoomTab();
  refreshElevatorPanel();
  autoSave();
  return true;
}

function travelByElevator(roomId) {
  const targetDef = ROOMS[roomId];
  if (!targetDef) return false;
  const fromDef = currentRoomDef();
  ui.elevatorAnim = {
    fromFloor: fromDef.floor || 1,
    toFloor: targetDef.floor || 1,
    toName: targetDef.name,
    start: performance.now(),
    duration: 420,
  };
  document.getElementById('elevatorPanel')?.classList.add('hidden');
  audio.playSfx('elevator');
  return switchRoom(roomId, targetDef.spawn);
}

// ---------- chat ----------

function pushChatLine(who, text, color) {
  chatLog.push({ who, text });
  if (chatLog.length > 60) chatLog.shift();
  renderChatLog(color);
}

function renderChatLog() {
  const el = document.getElementById('chatLog');
  el.innerHTML = chatLog
    .map((l) => `<div class="line"><span class="who">${escapeHtml(l.who)}:</span> ${escapeHtml(l.text)}</div>`)
    .join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nearestNpcInRange(range = 3) {
  let best = null;
  let bestDist = Infinity;
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    const d = Math.abs(n.x - player.x) + Math.abs(n.y - player.y);
    if (d <= range && d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

function handleChatSubmit(text) {
  text = text.trim();
  if (!text) return;
  player.bubbleText = text;
  player.bubbleUntil = performance.now() + 3200;
  pushChatLine('You', text);
  audio.playSfx('chat');

  const greetWords = ['hello', 'hi', 'hey'];
  const isGreeting = greetWords.some((w) => text.toLowerCase().includes(w));

  const npc = nearestNpcInRange(3);
  if (npc) {
    const reply = respondToMessage(npc.def, text);
    setTimeout(() => {
      npc.bubble = { text: reply, until: performance.now() + 3200 };
      pushChatLine(npc.def.name, reply);
    }, 450);
    if (isGreeting && !greetedNpcs.has(npc.id)) {
      greetedNpcs.add(npc.id);
      state.stats.greetedNpcs = Array.from(greetedNpcs);
      onQuestProgress(setQuestProgress(state, 'greet', greetedNpcs.size));
    }
  } else if (isGreeting) {
    pushChatLine('Hotel', 'No one nearby heard you. Walk closer to a guest!');
  }
}

// ---------- quests / toasts ----------

function onQuestProgress(newlyCompleteIds) {
  if (!newlyCompleteIds || newlyCompleteIds.length === 0) return;
  for (const id of newlyCompleteIds) {
    const reward = claimReward(state, id);
    const def = QUESTS.find((q) => q.id === id);
    if (reward) {
      showToast(`Quest complete: ${def.title}! +${reward.coins} coins${reward.unlock ? ' • unlocked ' + getCatalogueItem(reward.unlock).name : ''}`);
      audio.playSfx('quest');
    }
  }
  refreshCoins();
  refreshQuestPanel();
  refreshShopTab();
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3600);
}

// ---------- NPC AI ----------

function npcIsBlocked(room, roomRuntime, npcId) {
  const occ = occupantTilesExcluding('npc', npcId);
  return isBlockedFactory(room, roomRuntime, occ);
}

function tickNpcs(now) {
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    const room = ROOMS[n.room];
    const roomRuntime = state.rooms[n.room];
    updateMover(n, now, () => {
      if (n.pendingInteract) {
        const pending = n.pendingInteract;
        n.pendingInteract = null;
        applyInteractionArrival(n, pending, false);
      }
    });
    tickNpc(n, now, {
      tryWander: (npc) => {
        if ((npc.sitting || npc.activity) && Math.random() < 0.72) return null;
        if (Math.random() < 0.32) {
          const occ = occupantTilesExcluding('npc', npc.id);
          const res = reservedTilesExcluding('npc', npc.id);
          const blocked = isBlockedFactory(room, roomRuntime, occ);
          const candidates = roomRuntime.placed.filter((p) => {
            const item = getCatalogueItem(p.itemId);
            if (!item) return false;
            if (npc.sitting === p.instanceId || npc.activity?.instanceId === p.instanceId) return false;
            return item.seat || item.interaction === 'treadmill' || item.interaction === 'swim' || item.interaction === 'use';
          });
          const targetFurn = pickRandom(candidates);
          if (targetFurn) {
            const approach = findApproachTile(roomForInventory(npc.room), targetFurn, blocked, { x: npc.x, y: npc.y }, occ, res);
            if (approach && approach.path.length > 1) {
              npc.sitting = null;
              npc.lying = false;
              npc.activity = null;
              npc.pendingInteract = {
                instanceId: targetFurn.instanceId,
                itemId: targetFurn.itemId,
                targetTile: approach.tile,
                dir: approach.dir,
                kind: approach.kind,
              };
              return { path: approach.path };
            }
          }
        }
        npc.sitting = null;
        npc.lying = false;
        npc.activity = null;
        const blocked = npcIsBlocked(room, roomRuntime, npc.id);
        return findWanderTarget(npc, room.width, room.height, blocked);
      },
      pickAmbientLine: (npc) => pickRandom(npc.def.ambientLines),
    });
  }
}

// ---------- rendering frame ----------

function entityDepth(mover) {
  const instanceId = mover.sitting || (mover.activity && mover.activity.kind === 'treadmill' ? mover.activity.instanceId : null);
  if (!instanceId) return undefined;
  const p = currentRoomRuntime().placed.find((f) => f.instanceId === instanceId);
  if (!p) return undefined;
  const item = getCatalogueItem(p.itemId);
  if (!item || item.flat) return undefined;
  const fp = rotatedFootprint(item.footprint, p.rot);
  return p.x + fp.w - 1 + p.y + fp.h - 1 + 0.5;
}

function entityPhaseOffset(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return h % 5000;
}

function computeActionFrame(action, now, offset = 0) {
  if (!action) return 0;
  const t = now + offset;
  if (action === 'treadmill') return Math.floor(t / 135) % 4;
  if (action === 'swim') return Math.floor(t / 240) % 4;
  if (action === 'eat') return Math.floor(t / 380) % 4;
  if (action === 'use') return Math.floor(t / 280) % 4;
  return 0;
}

function buildEntities(now = performance.now()) {
  const list = [];
  const pOff = entityPhaseOffset('player');
  const pAction = !player.walking && player.activity ? player.activity.kind : null;
  list.push({
    x: player.renderX, y: player.renderY, dir: player.dir, frame: player.frame, walking: player.walking,
    sitting: !!player.sitting, lying: !!player.lying,
    blink: ((now + pOff * 1.3) % 3800) < 150,
    breathe: player.walking ? 0 : Math.floor((now + pOff) / 1400) % 2,
    action: pAction,
    actionFrame: computeActionFrame(pAction, now, pOff),
    depth: entityDepth(player), spriteKey: 'player', kind: 'player',
    bubbleText: player.bubbleUntil && player.bubbleUntil > now ? player.bubbleText : null,
  });
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    const nOff = entityPhaseOffset(n.id);
    const nAction = !n.walking && n.activity ? n.activity.kind : null;
    list.push({
      x: n.renderX, y: n.renderY, dir: n.dir, frame: n.frame, walking: n.walking,
      sitting: !!n.sitting, lying: !!n.lying,
      blink: ((now + nOff * 1.3) % 3800) < 150,
      breathe: n.walking ? 0 : Math.floor((now + nOff) / 1400) % 2,
      action: nAction,
      actionFrame: computeActionFrame(nAction, now, nOff),
      depth: entityDepth(n),
      spriteKey: n.id, kind: 'npc', color: n.def.color, nameTag: n.def.name,
      bubbleText: n.bubble ? n.bubble.text : null,
    });
  }
  return list;
}

function placedFurnitureWithFootprint(roomRuntime) {
  return roomRuntime.placed.map((p) => ({ ...p, footprint: rotatedFootprint(getCatalogueItem(p.itemId).footprint, p.rot) }));
}

function frame(now) {
  if (ui.startTime === null) ui.startTime = now;
  syncCanvasSize();
  tickNpcs(now);
  updateMover(player, now, onPlayerArrive);

  if (ui.elevatorAnim && now - ui.elevatorAnim.start > ui.elevatorAnim.duration) {
    ui.elevatorAnim = null;
  }

  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  ui.phase = (0.5 + (now - ui.startTime) / DAY_CYCLE_MS) % 1;
  audio.setRoomMood(state.player.room, ui.phase);

  let ghost = null;
  if (ui.placing && ui.hoverTile) {
    const item = getCatalogueItem(ui.placing.itemId);
    const occ = occupantTilesExcluding(null, null);
    const check = canPlaceAt(roomForInventory(), item, ui.hoverTile.x, ui.hoverTile.y, ui.placing.rot, occ, ui.placing.moveInstanceId || null);
    const cells = footprintCells(ui.hoverTile.x, ui.hoverTile.y, item.footprint, ui.placing.rot);
    ghost = { cells, valid: check.ok };
  }

  renderRoom(ctx, {
    room,
    placedFurniture: placedFurnitureWithFootprint(roomRuntime),
    entities: buildEntities(now),
    hoverTile: ui.placing ? null : ui.hoverTile,
    ghost,
    phase: ui.phase,
    width: ui.cssW,
    height: ui.cssH,
    dpr: ui.dpr,
    now,
    elevatorAnim: ui.elevatorAnim,
  });

  requestAnimationFrame(frame);
}

// ---------- input ----------

function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const p = evt.touches ? evt.touches[0] : evt;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

function pickTile(evt) {
  const { x, y } = getCanvasPos(evt);
  const room = currentRoomDef();
  const { originX, originY } = computeOrigin(room, ui.cssW, ui.cssH);
  const tile = screenToTile(x, y, originX, originY);
  if (tile.x < 0 || tile.y < 0 || tile.x >= room.width || tile.y >= room.height) return null;
  return tile;
}

canvas.addEventListener('mousemove', (evt) => {
  ui.hoverTile = pickTile(evt);
});
canvas.addEventListener('mouseleave', () => { ui.hoverTile = null; });

canvas.addEventListener('click', (evt) => {
  const tile = pickTile(evt);
  if (!tile) return;
  audio.playSfx('click');
  if (ui.placing) {
    confirmPlacement(tile);
    return;
  }
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const furn = interactiveFurnitureAt(room, roomRuntime, tile.x, tile.y);
  if (furn && tryInteractPlayer(furn)) {
    return;
  }
  tryWalkPlayer(tile.x, tile.y);
});

document.getElementById('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  handleChatSubmit(input.value);
  input.value = '';
});

// ---------- placing mode ----------

function startPlacing({ instanceId, itemId, moveInstanceId }) {
  ui.placing = { instanceId, itemId, rot: 0, moveInstanceId: moveInstanceId || null };
  document.getElementById('placingBar').classList.remove('hidden');
  document.getElementById('placingLabel').textContent = `Placing ${getCatalogueItem(itemId).name} — click a tile`;
}

function cancelPlacing() {
  ui.placing = null;
  document.getElementById('placingBar').classList.add('hidden');
}

function recordPlacementProgress() {
  state.stats.placedCount = (state.stats.placedCount || 0) + 1;
  onQuestProgress(advanceQuestsByType(state, 'place', 1));
  if (state.player.room === 'myroom') {
    state.stats.myRoomPlacedCount = (state.stats.myRoomPlacedCount || 0) + 1;
    onQuestProgress(advanceQuestsByType(state, 'decorate_myroom', 1));
  }
}

function confirmPlacement(tile) {
  const room = roomForInventory();
  const occ = occupantTilesExcluding(null, null);
  let result;
  if (ui.placing.moveInstanceId) {
    result = moveItem(state, room, ui.placing.moveInstanceId, tile.x, tile.y, ui.placing.rot, occ);
  } else {
    result = placeItem(state, room, ui.placing.instanceId, tile.x, tile.y, ui.placing.rot, occ);
  }
  if (result.ok) {
    audio.playSfx('place');
    if (!ui.placing.moveInstanceId) {
      recordPlacementProgress();
    } else if (state.player.room === 'myroom') {
      onQuestProgress(advanceQuestsByType(state, 'decorate_myroom', 1));
    }
    cancelPlacing();
    refreshBagTab();
    refreshRoomTab();
    autoSave();
  } else {
    showToast(result.reason === 'furniture_overlap' ? "Can't place there — occupied." : "Can't place there.");
  }
}

function rotatePlacing() {
  if (!ui.placing) return;
  ui.placing.rot = (ui.placing.rot + 1) % 4;
}

document.getElementById('btnRotate').addEventListener('click', rotatePlacing);
document.getElementById('btnCancelPlace').addEventListener('click', cancelPlacing);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('helpOverlay').classList.contains('hidden')) hideHelp();
    else if (!document.getElementById('elevatorPanel').classList.contains('hidden')) document.getElementById('elevatorPanel').classList.add('hidden');
    else cancelPlacing();
  }
  else if (e.key.toLowerCase() === 'r' && ui.placing) rotatePlacing();
  else if (e.key.toLowerCase() === 'e' && !isTypingTarget(e)) togglePanel('elevatorPanel');
  else if (e.key.toLowerCase() === 'i' && !isTypingTarget(e)) togglePanel('inventoryPanel');
  else if (e.key.toLowerCase() === 'q' && !isTypingTarget(e)) togglePanel('questPanel');
  else if (e.key.toLowerCase() === 'm' && !isTypingTarget(e)) toggleMute();
  else if (e.key.toLowerCase() === 'h' && !isTypingTarget(e)) showHelp();
  else if (e.key.toLowerCase() === 's' && !isTypingTarget(e)) manualSave();
});
function isTypingTarget(e) { return e.target && e.target.tagName === 'INPUT'; }

// ---------- panels ----------

function togglePanel(id) {
  const el = document.getElementById(id);
  const willShow = el.classList.contains('hidden');
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  if (willShow) el.classList.remove('hidden');
  if (id === 'inventoryPanel' && willShow) { refreshShopTab(); refreshBagTab(); refreshRoomTab(); }
  if (id === 'questPanel' && willShow) refreshQuestPanel();
  if (id === 'elevatorPanel' && willShow) refreshElevatorPanel();
  if (id === 'audioPanel' && willShow) refreshAudioUi();
}

function openElevatorPanel() {
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  document.getElementById('elevatorPanel').classList.remove('hidden');
  refreshElevatorPanel();
}

document.getElementById('btnElevator').addEventListener('click', () => togglePanel('elevatorPanel'));
document.getElementById('btnMyRoom').addEventListener('click', () => travelByElevator('myroom'));
document.getElementById('btnInventory').addEventListener('click', () => togglePanel('inventoryPanel'));
document.getElementById('btnQuests').addEventListener('click', () => togglePanel('questPanel'));
document.querySelectorAll('.panel-close').forEach((btn) => {
  btn.addEventListener('click', () => document.getElementById(btn.dataset.close).classList.add('hidden'));
});
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panel = btn.closest('.panel');
    panel.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    panel.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  });
});

function refreshCoins() {
  document.getElementById('coinsValue').textContent = state.coins;
}
function updateRoomLabel() {
  const def = currentRoomDef();
  document.getElementById('roomName').textContent = `Floor ${def.floor || 1} — ${def.name}`;
}

function refreshElevatorPanel() {
  const el = document.getElementById('elevatorList');
  if (!el) return;
  const floors = Object.values(ROOMS).sort((a, b) => (b.floor || 0) - (a.floor || 0));
  let lastWing = null;
  el.innerHTML = floors.map((r) => {
    const isCurrent = r.id === state.player.room;
    const wingHeader = r.wing && r.wing !== lastWing
      ? `<div class="elevator-group-title">${r.wing}</div>`
      : '';
    lastWing = r.wing || lastWing;
    const guestCount = npcRuntimes.filter((n) => n.room === r.id).length;
    const guestLabel = guestCount > 0 ? ` • 👤 ${guestCount}` : '';
    return `${wingHeader}
      <div class="elevator-item ${isCurrent ? 'active-floor' : ''}">
        <div class="floor-pill">F${r.floor}</div>
        <div class="item-info">
          <div class="item-name">${r.icon || '🏢'} ${r.name}</div>
          <div class="item-desc">${r.privateSuite ? 'Your private personal suite' : `Tower Level ${r.floor}${guestLabel}`}</div>
        </div>
        <div class="item-actions">
          <button class="pixel-btn elevator-floor-btn" data-floor-room="${r.id}" ${isCurrent ? 'disabled' : ''}>
            ${isCurrent ? 'Here' : 'Go'}
          </button>
        </div>
      </div>`;
  }).join('');
  el.querySelectorAll('[data-floor-room]').forEach((btn) => {
    btn.addEventListener('click', () => {
      travelByElevator(btn.dataset.floorRoom);
    });
  });
}

function refreshShopTab() {
  const el = document.getElementById('shopTab');
  const items = availableCatalogue(state);
  el.innerHTML = items.map((item) => `
    <div class="shop-item">
      <div class="item-swatch" style="background:${swatchColor(item)}"></div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
        <div>💰 ${item.price}${item.unlocked ? '' : ' <span class="locked-tag">locked</span>'}</div>
      </div>
      <div class="item-actions">
        <button class="pixel-btn" data-buy="${item.id}" ${item.unlocked && state.coins >= item.price ? '' : 'disabled'}>Buy</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const res = buyItem(state, btn.dataset.buy);
      if (res.ok) {
        audio.playSfx('coin');
        refreshCoins();
        refreshShopTab();
        refreshBagTab();
        autoSave();
      } else {
        showToast(res.reason === 'insufficient_coins' ? 'Not enough coins.' : 'Item is locked.');
      }
    });
  });
}

function swatchColor(item) {
  const map = { seat: '#caa05a', decor: '#8fd0ff' };
  return map[item.category] || '#888';
}

function refreshBagTab() {
  const el = document.getElementById('bagTab');
  if (state.inventory.length === 0) {
    el.innerHTML = '<p>No unplaced items. Buy something from the Shop tab!</p>';
    return;
  }
  el.innerHTML = state.inventory.map((inv) => {
    const item = getCatalogueItem(inv.itemId);
    return `
    <div class="bag-item">
      <div class="item-swatch" style="background:${swatchColor(item)}"></div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="pixel-btn" data-place="${inv.instanceId}:${inv.itemId}">Place</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-place]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [instanceId, itemId] = btn.dataset.place.split(':');
      startPlacing({ instanceId, itemId });
      togglePanel('inventoryPanel');
    });
  });
}

function refreshRoomTab() {
  const el = document.getElementById('roomTab');
  const roomRuntime = currentRoomRuntime();
  if (roomRuntime.placed.length === 0) {
    el.innerHTML = '<p>Nothing placed in this room yet.</p>';
    return;
  }
  el.innerHTML = roomRuntime.placed.map((p) => {
    const item = getCatalogueItem(p.itemId);
    return `
    <div class="room-item">
      <div class="item-swatch" style="background:${swatchColor(item)}"></div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="pixel-btn" data-move="${p.instanceId}:${p.itemId}">Move</button>
        <button class="pixel-btn" data-pickup="${p.instanceId}">Pick up</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-pickup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pickupItem(state, roomRuntime, btn.dataset.pickup);
      refreshRoomTab();
      refreshBagTab();
      autoSave();
    });
  });
  el.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [instanceId, itemId] = btn.dataset.move.split(':');
      startPlacing({ itemId, moveInstanceId: instanceId });
      togglePanel('inventoryPanel');
    });
  });
}

function refreshQuestPanel() {
  const el = document.getElementById('questList');
  el.innerHTML = listQuests(state).map((q) => `
    <div class="quest-item">
      <div class="quest-title">${q.title} ${q.complete ? '<span class="quest-complete">✓</span>' : ''}</div>
      <div>${q.description}</div>
      <div class="quest-progress">${q.progress} / ${q.target}${q.reward.unlock ? ' • unlocks ' + getCatalogueItem(q.reward.unlock).name : ''}</div>
    </div>`).join('');
}

// ---------- mute / audio / help / save ----------

function ensureGestureAudio() {
  audio.unlockGesture();
}
['pointerdown', 'keydown', 'click', 'touchstart'].forEach((ev) => {
  window.addEventListener(ev, ensureGestureAudio, { passive: true });
});

function syncSettingsState() {
  if (typeof state.settings.musicMuted !== 'boolean') state.settings.musicMuted = !!state.settings.muted;
  if (typeof state.settings.sfxMuted !== 'boolean') state.settings.sfxMuted = !!state.settings.muted;
  if (typeof state.settings.musicVolume !== 'number') state.settings.musicVolume = 0.55;
  if (typeof state.settings.sfxVolume !== 'number') state.settings.sfxVolume = 0.7;
  state.settings.muted = !!(state.settings.musicMuted && state.settings.sfxMuted);
}

function refreshAudioUi() {
  syncSettingsState();
  const mMuted = state.settings.musicMuted || state.settings.musicVolume <= 0;
  const sMuted = state.settings.sfxMuted || state.settings.sfxVolume <= 0;

  const btnMusic = document.getElementById('btnMusicMute');
  if (btnMusic) btnMusic.textContent = mMuted ? '🎵 Off' : '🎵 On';
  const btnSfx = document.getElementById('btnSfxMute');
  if (btnSfx) btnSfx.textContent = sMuted ? '🔕 Off' : '🔔 On';
  const btnMute = document.getElementById('btnMute');
  if (btnMute) btnMute.textContent = (mMuted && sMuted) ? '🔇' : '🎚️';

  const panelMusicBtn = document.getElementById('btnPanelMusicMute');
  if (panelMusicBtn) panelMusicBtn.textContent = mMuted ? 'Muted' : 'On';
  const panelSfxBtn = document.getElementById('btnPanelSfxMute');
  if (panelSfxBtn) panelSfxBtn.textContent = sMuted ? 'Muted' : 'On';

  const musicSlider = document.getElementById('musicVolume');
  if (musicSlider) musicSlider.value = String(Math.round(state.settings.musicVolume * 100));
  const sfxSlider = document.getElementById('sfxVolume');
  if (sfxSlider) sfxSlider.value = String(Math.round(state.settings.sfxVolume * 100));

  const moodEl = document.getElementById('audioMoodLabel');
  if (moodEl) moodEl.textContent = audio.getMoodInfo().label;
}

function toggleMusicMute() {
  syncSettingsState();
  state.settings.musicMuted = !state.settings.musicMuted;
  state.settings.muted = !!(state.settings.musicMuted && state.settings.sfxMuted);
  audio.setMusicMuted(state.settings.musicMuted);
  refreshAudioUi();
  saveState(window.localStorage, state);
}

function toggleSfxMute() {
  syncSettingsState();
  state.settings.sfxMuted = !state.settings.sfxMuted;
  state.settings.muted = !!(state.settings.musicMuted && state.settings.sfxMuted);
  audio.setSfxMuted(state.settings.sfxMuted);
  if (!state.settings.sfxMuted) audio.playSfx('click');
  refreshAudioUi();
  saveState(window.localStorage, state);
}

function toggleMute() {
  toggleMusicMute();
}

function showHelp() { document.getElementById('helpOverlay').classList.remove('hidden'); }
function hideHelp() {
  document.getElementById('helpOverlay').classList.add('hidden');
  window.localStorage.setItem(HELP_SEEN_KEY, '1');
}
document.getElementById('btnHelp').addEventListener('click', showHelp);
document.getElementById('btnHelpClose').addEventListener('click', hideHelp);
document.getElementById('helpOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'helpOverlay') hideHelp();
});
document.getElementById('btnMute').addEventListener('click', () => togglePanel('audioPanel'));
document.getElementById('btnMusicMute')?.addEventListener('click', toggleMusicMute);
document.getElementById('btnSfxMute')?.addEventListener('click', toggleSfxMute);
document.getElementById('btnPanelMusicMute')?.addEventListener('click', toggleMusicMute);
document.getElementById('btnPanelSfxMute')?.addEventListener('click', toggleSfxMute);
document.getElementById('musicVolume')?.addEventListener('input', (e) => {
  const v = Math.max(0, Math.min(1, Number(e.target.value) / 100));
  state.settings.musicVolume = v;
  state.settings.musicMuted = v === 0;
  state.settings.muted = !!(state.settings.musicMuted && state.settings.sfxMuted);
  audio.setMusicMuted(state.settings.musicMuted);
  audio.setMusicVolume(v);
  refreshAudioUi();
  saveState(window.localStorage, state);
});
document.getElementById('sfxVolume')?.addEventListener('input', (e) => {
  const v = Math.max(0, Math.min(1, Number(e.target.value) / 100));
  state.settings.sfxVolume = v;
  state.settings.sfxMuted = v === 0;
  state.settings.muted = !!(state.settings.musicMuted && state.settings.sfxMuted);
  audio.setSfxMuted(state.settings.sfxMuted);
  audio.setSfxVolume(v);
  refreshAudioUi();
  saveState(window.localStorage, state);
});

function manualSave() {
  persistPlayerPos();
  saveState(window.localStorage, state);
  showToast('Game saved!');
}
document.getElementById('btnSave').addEventListener('click', manualSave);

document.getElementById('btnReset').addEventListener('click', () => {
  if (!window.confirm('Reset all progress? This cannot be undone.')) return;
  state = resetState(window.localStorage);
  location.reload();
});

let autoSaveTimer = null;
function autoSave() {
  persistPlayerPos();
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveState(window.localStorage, state), 800);
}
setInterval(autoSave, 15000);

// ---------- init ----------

function init() {
  syncCanvasSize();
  syncSettingsState();
  refreshCoins();
  updateRoomLabel();
  refreshElevatorPanel();
  audio.configure(state.settings);
  audio.setRoomMood(state.player.room, ui.phase);
  refreshAudioUi();
  if (!window.localStorage.getItem(HELP_SEEN_KEY)) showHelp();
  requestAnimationFrame(frame);
}
init();

// ---------- debug hooks for tests ----------

window.__pixelHotel = {
  getState: () => ({
    coins: state.coins,
    room: state.player.room,
    floor: currentRoomDef().floor,
    player: {
      x: player.x,
      y: player.y,
      dir: player.dir,
      sitting: player.sitting,
      lying: !!player.lying,
      activity: player.activity,
    },
    inventory: state.inventory,
    rooms: state.rooms,
    quests: listQuests(state),
    unlocked: state.unlocked,
    settings: state.settings,
  }),
  getAudioState: () => ({
    gestureUnlocked: audio.gestureUnlocked,
    hasContext: !!audio.ctx,
    musicMuted: audio.musicMuted,
    sfxMuted: audio.sfxMuted,
    musicVolume: audio.musicVolume,
    sfxVolume: audio.sfxVolume,
    mood: audio.getMoodInfo(),
  }),
  setDayPhase: (p) => {
    ui.startTime = performance.now() - (p - 0.5) * DAY_CYCLE_MS;
    ui.phase = ((p % 1) + 1) % 1;
    audio.setRoomMood(state.player.room, ui.phase);
    refreshAudioUi();
  }, // 0.5 noon, 0 midnight
  getSaveVersion: () => SAVE_VERSION,
  walkTo: (x, y) => tryWalkPlayer(x, y),
  interactWith: (itemIdOrInstanceId, immediate = false) => {
    const roomRuntime = currentRoomRuntime();
    const matches = roomRuntime.placed.filter(
      (p) => p.instanceId === itemIdOrInstanceId || p.itemId === itemIdOrInstanceId,
    );
    for (const placed of matches) {
      if (tryInteractPlayer(placed, immediate)) return true;
    }
    return false;
  },
  setNpcActivity: (npcId, itemIdOrInstanceId) => {
    const npc = npcRuntimes.find((n) => n.id === npcId || n.id.endsWith(`_${npcId}`));
    if (!npc) return false;
    const room = ROOMS[npc.room];
    const roomRuntime = state.rooms[npc.room];
    const matches = roomRuntime.placed.filter(
      (p) => p.instanceId === itemIdOrInstanceId || p.itemId === itemIdOrInstanceId,
    );
    const occ = occupantTilesExcluding('npc', npc.id);
    const res = reservedTilesExcluding('npc', npc.id);
    const blocked = isBlockedFactory(room, roomRuntime, occ);
    for (const placed of matches) {
      const approach = findApproachTile(roomForInventory(npc.room), placed, blocked, { x: npc.x, y: npc.y }, occ, res);
      if (!approach) continue;
      npc.x = approach.tile.x;
      npc.y = approach.tile.y;
      npc.renderX = approach.tile.x;
      npc.renderY = approach.tile.y;
      npc.walking = false;
      npc.path = null;
      npc.pendingInteract = null;
      applyInteractionArrival(npc, {
        instanceId: placed.instanceId,
        itemId: placed.itemId,
        targetTile: approach.tile,
        dir: approach.dir,
        kind: approach.kind,
      }, false);
      return true;
    }
    return false;
  },
  takeElevator: (roomId) => travelByElevator(roomId),
  sendChat: (text) => handleChatSubmit(text),
  buy: (itemId) => {
    const r = buyItem(state, itemId);
    refreshCoins();
    return r;
  },
  placeAt: (instanceId, x, y, rot = 0) => {
    const occ = occupantTilesExcluding(null, null);
    const r = placeItem(state, roomForInventory(), instanceId, x, y, rot, occ);
    if (r.ok) {
      recordPlacementProgress();
      autoSave();
    }
    return r;
  },
  save: () => manualSave(),
  reset: () => {
    state = resetState(window.localStorage);
    audio.configure(state.settings);
    refreshAudioUi();
  },
  loadShowroom: () => {
    state.player.room = 'rooftop';
    player.x = 7;
    player.y = 5;
    player.dir = 'left';
    player.sitting = null;
    for (const n of npcRuntimes) {
      if (n.id === 'drpix') { n.x = 9; n.y = 6; n.renderX = 9; n.renderY = 6; n.dir = 'left'; n.sitting = null; }
      if (n.id === 'lola') { n.x = 1; n.y = 6; n.renderX = 1; n.renderY = 6; n.dir = 'right'; n.sitting = null; }
    }
    state.rooms.rooftop.placed = [
      { instanceId: 'show_aqua', itemId: 'aquarium', x: 1, y: 1, rot: 0 },
      { instanceId: 'show_boba', itemId: 'boba_bar', x: 4, y: 1, rot: 0 },
      { instanceId: 'show_noodle', itemId: 'noodle_cart', x: 7, y: 1, rot: 0 },
      { instanceId: 'show_pond', itemId: 'koi_pond', x: 1, y: 3, rot: 0 },
      { instanceId: 'show_arcade', itemId: 'mini_arcade', x: 4, y: 3, rot: 0 },
      { instanceId: 'show_karaoke', itemId: 'karaoke_machine', x: 6, y: 3, rot: 0 },
      { instanceId: 'show_tele', itemId: 'telescope', x: 8, y: 3, rot: 0 },
      { instanceId: 'show_gacha', itemId: 'capsule_dispenser', x: 5, y: 5, rot: 0 },
    ];
  },
  getCanvas: () => canvas,
};
