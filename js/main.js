import { ROOMS, NPCS, QUESTS, getCatalogueItem, TILE, SAVE_VERSION } from './data.js';
import { findPath } from './pathfinding.js';
import {
  buyItem, placeItem, pickupItem, moveItem, canPlaceAt, footprintCells,
  availableCatalogue, rotatedFootprint,
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
};

const visitedRooms = new Set(state.stats.visitedRooms || ['lobby']);
const greetedNpcs = new Set(state.stats.greetedNpcs || []);
let chatLog = [];

const ui = {
  placing: null, // { instanceId, itemId, rot, fromInventory:bool, moveFromRoom:bool }
  hoverTile: null,
  phase: 0.5, // start at noon
  startTime: performance.now(),
};

// ---------- room/state helpers ----------

function currentRoomDef() { return ROOMS[state.player.room]; }
function currentRoomRuntime() { return state.rooms[state.player.room]; }
// inventory.js operates on a single object with both the static grid/bounds
// and the mutable placed-items list; `placed` stays a reference into
// state.rooms so push/splice inside inventory.js persist correctly.
function roomForInventory(roomId = state.player.room) {
  const def = ROOMS[roomId];
  return { width: def.width, height: def.height, grid: def.grid, placed: state.rooms[roomId].placed };
}

function furnitureAt(room, roomRuntime, x, y) {
  for (const p of roomRuntime.placed) {
    const item = getCatalogueItem(p.itemId);
    if (item.flat) continue; // rugs never block or capture clicks
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

function isBlockedFactory(room, roomRuntime, occupantTiles) {
  return (x, y) => {
    const cell = room.grid[y][x];
    if (cell === TILE.WALL || cell === TILE.WINDOW) return true;
    const furn = furnitureAt(room, roomRuntime, x, y);
    if (furn) {
      const item = getCatalogueItem(furn.itemId);
      if (!item.seat) return true;
    }
    if (occupantTiles.some((o) => o.x === x && o.y === y)) return true;
    return false;
  };
}

function seatDirFromRot(rot) {
  const dirs = ['down', 'right', 'up', 'left'];
  return dirs[((rot % 4) + 4) % 4];
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

// ---------- player actions ----------

function tryWalkPlayer(tx, ty) {
  const room = currentRoomDef();
  const occ = occupantTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, currentRoomRuntime(), occ);
  const path = findPath(room.width, room.height, blocked, { x: player.x, y: player.y }, { x: tx, y: ty });
  if (!path) return false;
  player.sitting = null;
  state.player.sitting = null;
  startPath(player, path, performance.now());
  return true;
}

function trySitPlayer(placedItem) {
  const room = currentRoomDef();
  const occ = occupantTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, currentRoomRuntime(), occ);
  const path = findPath(room.width, room.height, blocked, { x: player.x, y: player.y }, { x: placedItem.x, y: placedItem.y });
  if (!path) return false;
  startPath(player, path, performance.now());
  player.pendingSit = placedItem.instanceId;
  return true;
}

function onPlayerArrive() {
  const room = currentRoomDef();
  const cell = room.grid[player.y][player.x];
  if (player.pendingSit) {
    const roomRuntime = currentRoomRuntime();
    const placed = roomRuntime.placed.find((p) => p.instanceId === player.pendingSit);
    player.pendingSit = null;
    if (placed) {
      player.sitting = placed.instanceId;
      player.dir = seatDirFromRot(placed.rot);
      state.player.sitting = placed.instanceId;
      state.player.dir = player.dir;
      if (placed.itemId === 'rooftop_sofa') {
        onQuestProgress(advanceQuestsByType(state, 'sit', 1));
      }
    }
    persistPlayerPos();
    return;
  }
  if (cell === TILE.DOOR) {
    const doorDef = room.doors.find((d) => d.x === player.x && d.y === player.y);
    if (doorDef) switchRoom(doorDef.to, doorDef.toTile);
    return;
  }
  persistPlayerPos();
}

function persistPlayerPos() {
  state.player.x = player.x;
  state.player.y = player.y;
  state.player.dir = player.dir;
  state.player.sitting = player.sitting;
}

function switchRoom(roomId, toTile) {
  state.player.room = roomId;
  player.x = toTile.x;
  player.y = toTile.y;
  player.renderX = toTile.x;
  player.renderY = toTile.y;
  player.sitting = null;
  state.player.sitting = null;
  persistPlayerPos();
  visitedRooms.add(roomId);
  state.stats.visitedRooms = Array.from(visitedRooms);
  onQuestProgress(setQuestProgress(state, 'visit', visitedRooms.size));
  updateRoomLabel();
  refreshRoomTab();
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
    if (n.room !== state.player.room) continue; // only simulate visible room for simplicity/perf
    const room = ROOMS[n.room];
    const roomRuntime = state.rooms[n.room];
    updateMover(n, now, () => {
      if (n.pendingSitTarget) {
        const placed = roomRuntime.placed.find((p) => p.instanceId === n.pendingSitTarget);
        n.pendingSitTarget = null;
        if (placed) {
          n.sitting = placed.instanceId;
          n.dir = seatDirFromRot(placed.rot);
        }
      }
    });
    tickNpc(n, now, {
      tryWander: (npc) => {
        if (Math.random() < 0.2) {
          const freeSeat = roomRuntime.placed.find((p) => {
            const item = getCatalogueItem(p.itemId);
            if (!item.seat) return false;
            if (player.sitting === p.instanceId) return false;
            return !npcRuntimes.some((o) => o !== npc && o.sitting === p.instanceId);
          });
          if (freeSeat && npc.sitting !== freeSeat.instanceId) {
            const blocked = npcIsBlocked(room, roomRuntime, npc.id);
            const path = findPath(room.width, room.height, blocked, { x: npc.x, y: npc.y }, { x: freeSeat.x, y: freeSeat.y });
            if (path && path.length > 1) {
              npc.sitting = null;
              npc.pendingSitTarget = freeSeat.instanceId;
              return { path };
            }
          }
        }
        if (npc.sitting) return null;
        const blocked = npcIsBlocked(room, roomRuntime, npc.id);
        return findWanderTarget(npc, room.width, room.height, blocked);
      },
      pickAmbientLine: (npc) => pickRandom(npc.def.ambientLines),
    });
  }
}

// ---------- rendering frame ----------

// A seated avatar must draw in front of its seat, even on a multi-tile sofa.
function seatDepth(instanceId) {
  const p = instanceId && currentRoomRuntime().placed.find((f) => f.instanceId === instanceId);
  if (!p) return undefined;
  const fp = rotatedFootprint(getCatalogueItem(p.itemId).footprint, p.rot);
  return p.x + fp.w - 1 + p.y + fp.h - 1 + 0.5;
}

function buildEntities() {
  const list = [];
  list.push({
    x: player.renderX, y: player.renderY, dir: player.dir, frame: player.frame, walking: player.walking,
    sitting: !!player.sitting, depth: seatDepth(player.sitting), spriteKey: 'player', kind: 'player',
    bubbleText: player.bubbleUntil && player.bubbleUntil > performance.now() ? player.bubbleText : null,
  });
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    list.push({
      x: n.renderX, y: n.renderY, dir: n.dir, frame: n.frame, walking: n.walking, sitting: !!n.sitting, depth: seatDepth(n.sitting),
      spriteKey: n.id, kind: 'npc', color: n.def.color,
      bubbleText: n.bubble ? n.bubble.text : null,
    });
  }
  return list;
}

function placedFurnitureWithFootprint(roomRuntime) {
  return roomRuntime.placed.map((p) => ({ ...p, footprint: rotatedFootprint(getCatalogueItem(p.itemId).footprint, p.rot) }));
}

function frame(now) {
  tickNpcs(now);
  updateMover(player, now, onPlayerArrive);

  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  ui.phase = (0.5 + (now - ui.startTime) / DAY_CYCLE_MS) % 1;

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
    entities: buildEntities(),
    hoverTile: ui.placing ? null : ui.hoverTile,
    ghost,
    phase: ui.phase,
    width: canvas.width,
    height: canvas.height,
  });

  requestAnimationFrame(frame);
}

// ---------- input ----------

function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const p = evt.touches ? evt.touches[0] : evt;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
}

function pickTile(evt) {
  const { x, y } = getCanvasPos(evt);
  const room = currentRoomDef();
  const { originX, originY } = computeOrigin(room, canvas.width, canvas.height);
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
  const furn = furnitureAt(room, roomRuntime, tile.x, tile.y);
  if (furn) {
    const item = getCatalogueItem(furn.itemId);
    if (item.seat) {
      trySitPlayer(furn);
      return;
    }
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
      state.stats.placedCount = (state.stats.placedCount || 0) + 1;
      onQuestProgress(advanceQuestsByType(state, 'place', 1));
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
    else cancelPlacing();
  }
  else if (e.key.toLowerCase() === 'r' && ui.placing) rotatePlacing();
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
}
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
  document.getElementById('roomName').textContent = currentRoomDef().name;
}

function refreshShopTab() {
  const el = document.getElementById('shopTab');
  const items = availableCatalogue(state);
  el.innerHTML = items.map((item) => `
    <div class="shop-item">
      <div class="item-swatch" style="background:${swatchColor(item)}"></div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.description ? `<div class="item-desc" style="font-size:10px;color:#aaa;line-height:1.2;margin:2px 0 3px;">${item.description}</div>` : ''}
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
        ${item.description ? `<div class="item-desc" style="font-size:10px;color:#aaa;line-height:1.2;margin:2px 0 3px;">${item.description}</div>` : ''}
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
        ${item.description ? `<div class="item-desc" style="font-size:10px;color:#aaa;line-height:1.2;margin:2px 0 3px;">${item.description}</div>` : ''}
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

// ---------- mute / help / save ----------

function toggleMute() {
  state.settings.muted = !state.settings.muted;
  audio.setMuted(state.settings.muted);
  document.getElementById('btnMute').textContent = state.settings.muted ? '🔇' : '🔊';
  autoSave();
}

function showHelp() { document.getElementById('helpOverlay').classList.remove('hidden'); }
function hideHelp() {
  document.getElementById('helpOverlay').classList.add('hidden');
  window.localStorage.setItem(HELP_SEEN_KEY, '1');
}
document.getElementById('btnHelp').addEventListener('click', showHelp);
document.getElementById('btnHelpClose').addEventListener('click', hideHelp);
document.getElementById('helpOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'helpOverlay') hideHelp(); // click outside the box
});
document.getElementById('btnMute').addEventListener('click', toggleMute);

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
  refreshCoins();
  updateRoomLabel();
  document.getElementById('btnMute').textContent = state.settings.muted ? '🔇' : '🔊';
  audio.setMuted(state.settings.muted);
  if (!window.localStorage.getItem(HELP_SEEN_KEY)) showHelp();
  requestAnimationFrame(frame);
}
init();

// ---------- debug hooks for tests ----------

window.__pixelHotel = {
  getState: () => ({
    coins: state.coins,
    room: state.player.room,
    player: { x: player.x, y: player.y, dir: player.dir, sitting: player.sitting },
    inventory: state.inventory,
    rooms: state.rooms,
    quests: listQuests(state),
    unlocked: state.unlocked,
  }),
  setDayPhase: (p) => { ui.startTime = performance.now() - (p - 0.5) * DAY_CYCLE_MS; }, // 0.5 noon, 0 midnight
  getSaveVersion: () => SAVE_VERSION,
  walkTo: (x, y) => tryWalkPlayer(x, y),
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
      state.stats.placedCount = (state.stats.placedCount || 0) + 1;
      onQuestProgress(advanceQuestsByType(state, 'place', 1));
    }
    return r;
  },
  save: () => manualSave(),
  reset: () => { state = resetState(window.localStorage); },
  loadShowroom: () => {
    state.player.room = 'rooftop';
    player.x = 7;
    player.y = 5;
    player.dir = 'left';
    player.sitting = null;
    // Position NPCs out of the display area so all 8 items are unobscured
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
