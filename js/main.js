import { ROOMS, NPCS, QUESTS, getCatalogueItem, TILE, SAVE_VERSION, ITEM_CATEGORIES, ROOM_TIERS, makeRoomGrid } from './data.js';
import { retargetMover, advanceMover, findPath } from './pathfinding.js';
import {
  buyItem, placeItem, pickupItem, moveItem, canPlaceAt, footprintCells,
  availableCatalogue, rotatedFootprint, findApproachTile, seatDirFromRot, isDiningSeat,
} from './inventory.js';
import { advanceQuestsByType, setQuestProgress, claimReward, listQuests } from './quests.js';
import { loadState, saveState, resetState, sanitizePlacedItemsForRoom } from './save.js';
import {
  createNpcRuntime, tickNpc, findWanderTarget, directionBetween, respondToMessage, pickRandom,
} from './npc.js';
import {
  renderRoom, computeOrigin, screenToTile, tileToScreen, worldToScreen, hitTestNpc, getItemIconDataUrl,
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, clampZoom, zoomAtPoint, centerCameraOnTile,
} from './render.js';
import { audio, formatTime, trackForRoom } from './audio.js';
import {
  initMultiplayerUI, getRemoteMultiplayerEntities, tickMultiplayer, notifyLocalChat, publishOwnRoomSnapshot,
  updateLocalOutfit, updateLocalLook, notifyLocalEmote,
} from './multiplayer/ui.js';
import { getSupabaseClient, isMultiplayerLoaded } from './multiplayer/client.js';
import {
  initArcadeUI, openArcadeGame, closeArcadeGame,
  openArcadeLeaderboard, closeArcadeLeaderboard, getActiveArcadeState,
} from './arcade/ui.js';
import { initPoolUI, openPoolGame, closePoolGame, getActivePoolState } from './arcade/pool-ui.js';
import { initGumballUI, openGumballModal, renderGumballsTab } from './gumballs/gumballs-ui.js';
import { distinctOwnedInRarity, totalDistinctOwned, todayDateStr } from './gumballs/gumballs.js';
import { applyTraderPersona } from './gumballs/trader.js';
import { initTraderUI, openTraderModal } from './gumballs/trader-ui.js';
import { initLibraryUI, openLibraryModal } from './gumballs/library-ui.js';
import { initAvatarModal, openAvatarModal, closeAvatarModal, isAvatarModalOpen } from './avatarModal.js';
import { DEFAULT_PLAYER_LOOK, validateAvatarLook } from './avatar.js';
import { EMOTES, EMOTE_IDS, EMOTE_ICONS, EMOTE_DURATION_MS, isEmoteAllowed } from './emotes.js';

const STEP_MS = 240;
const DAY_CYCLE_MS = 120000;
const HELP_SEEN_KEY = 'pixelHotel.helpSeen.v1';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let state = loadState(window.localStorage);
applyRoomTier(state.player.roomTier || 1);

const gumballTraderDef = NPCS.find((n) => n.id === 'gumball_trader');
if (gumballTraderDef) applyTraderPersona(gumballTraderDef, todayDateStr());

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
  fromX: state.player.x,
  fromY: state.player.y,
  toX: state.player.x,
  toY: state.player.y,
  targetX: null,
  targetY: null,
  dir: state.player.dir || 'down',
  frame: 0,
  walking: false,
  path: null,
  pathIdx: 0,
  stepStart: 0,
  stepDuration: STEP_MS,
  sitting: state.player.sitting || null,
  lying: false,
  activity: state.player.activity || null,
  pendingInteract: null,
  pendingDialogue: null,
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
  camera: { zoom: clampZoom(state.settings.zoom || DEFAULT_ZOOM), panX: 0, panY: 0 },
  dragging: false,
  dragMoved: false,
  dragLast: null,
  pinchDist: null,
  activeDialogue: null, // { npcId }
};

function recenterCamera(tx = player.x, ty = player.y, zoom = ui.camera.zoom) {
  const room = currentRoomDef();
  const centered = centerCameraOnTile(tx, ty, room, ui.cssW, ui.cssH, zoom);
  ui.camera.zoom = centered.zoom;
  ui.camera.panX = centered.panX;
  ui.camera.panY = centered.panY;
}

let zoomSaveTimer = null;
function persistZoom() {
  state.settings.zoom = ui.camera.zoom;
  if (zoomSaveTimer) clearTimeout(zoomSaveTimer);
  zoomSaveTimer = setTimeout(() => saveState(window.localStorage, state), 600);
}

function setZoomAtPoint(newZoom, cursorX, cursorY) {
  const result = zoomAtPoint(ui.camera, newZoom, cursorX, cursorY, ui.cssW, ui.cssH);
  ui.camera.zoom = result.zoom;
  ui.camera.panX = result.panX;
  ui.camera.panY = result.panY;
  updateZoomLabel();
  persistZoom();
}

function stepZoom(delta) {
  setZoomAtPoint(ui.camera.zoom + delta, ui.cssW / 2, ui.cssH / 2);
}

function resetZoom() {
  recenterCamera(player.x, player.y, DEFAULT_ZOOM);
  updateZoomLabel();
  persistZoom();
}

function updateZoomLabel() {
  const el = document.getElementById('zoomLevel');
  if (el) el.textContent = `${Math.round(ui.camera.zoom * 100)}%`;
}

function syncCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.max(1, Math.round(rect.width || 960));
  const cssH = Math.max(1, Math.round(rect.height || 600));
  const targetW = Math.max(1, Math.round((rect.width || 960) * dpr));
  const targetH = Math.max(1, Math.round((rect.height || 600) * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH || ui.dpr !== dpr || ui.cssW !== cssW || ui.cssH !== cssH) {
    canvas.width = targetW;
    canvas.height = targetH;
    ui.cssW = cssW;
    ui.cssH = cssH;
    ui.dpr = dpr;
    ctx.imageSmoothingEnabled = false;
  }
}

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => syncCanvasSize()).observe(canvas);
}
window.addEventListener('resize', syncCanvasSize);
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    syncCanvasSize();
    recenterCamera(player.x, player.y);
  }, 120);
});
if (typeof screen !== 'undefined' && screen.orientation?.addEventListener) {
  screen.orientation.addEventListener('change', () => {
    setTimeout(() => {
      syncCanvasSize();
      recenterCamera(player.x, player.y);
    }, 120);
  });
}

function initVisualViewport() {
  if (typeof window === 'undefined' || !window.visualViewport) return;
  const updateViewport = () => {
    const vv = window.visualViewport;
    const keyboardOffset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
    document.documentElement.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);
  };
  window.visualViewport.addEventListener('resize', updateViewport);
  window.visualViewport.addEventListener('scroll', updateViewport);
}
initVisualViewport();

// ---------- room/state helpers ----------

// Transient, read-only override while visiting a friend's My Room via the
// multiplayer "Visit" flow. Deliberately NOT part of `state` (never
// JSON.stringify'd by saveState) so a friend's furniture can never leak into
// the local single-player save, no matter when an autosave timer fires.
let visitScene = null; // { placed, previousRoom }

function currentRoomDef() { return ROOMS[state.player.room] || ROOMS.lobby; }
function currentRoomRuntime() {
  if (visitScene && state.player.room === 'myroom') return visitScene;
  return state.rooms[state.player.room];
}
function roomForInventory(roomId = state.player.room) {
  const def = ROOMS[roomId];
  const placed = (visitScene && roomId === 'myroom') ? visitScene.placed : state.rooms[roomId].placed;
  return { width: def.width, height: def.height, grid: def.grid, placed };
}

export function applyRoomTier(tierNum, targetState = null) {
  const tier = Number(tierNum) || 1;
  const tierDef = ROOM_TIERS.find((t) => t.tier === tier) || ROOM_TIERS[0];
  const room = ROOMS.myroom;
  room.floor = tierDef.floor;
  room.name = `My Room (${tierDef.name})`;
  room.roomNumber = tierDef.roomNumber;
  room.width = tierDef.width;
  room.height = tierDef.height;
  room.cutouts = tierDef.cutouts;
  room.spawn = tierDef.spawn;
  room.floorMaterial = tierDef.floorMaterial;
  room.grid = makeRoomGrid(tierDef.width, tierDef.height, {
    doors: [{ x: tierDef.spawn.x, y: 0 }],
    windows: [{ x: 2, y: 0 }, { x: tierDef.width - 2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: 5 }],
    cutouts: tierDef.cutouts,
  });
  room.doors = [
    { x: tierDef.spawn.x, y: 0, to: 'lobby', toTile: { x: 4, y: 2 }, elevator: true },
  ];
  if (targetState) {
    targetState.player.roomTier = tierDef.tier;
    const returnedInventory = Array.isArray(targetState.inventory) ? targetState.inventory : [];
    if (targetState.rooms && targetState.rooms.myroom) {
      targetState.rooms.myroom.placed = sanitizePlacedItemsForRoom(room, targetState.rooms.myroom.placed, returnedInventory);
    }
  }
}

/** True while rendering a friend's read-only room snapshot — blocks all edits. */
function isVisitingFriendRoom() { return !!visitScene; }

/** Enters the transient visitor scene (called only via the multiplayer UI). */
function enterVisitScene(displayName, roomData) {
  if (roomData && roomData.tier) {
    applyRoomTier(roomData.tier);
  }
  const def = ROOMS.myroom;
  const rawPlaced = Array.isArray(roomData) ? roomData : ((roomData && Array.isArray(roomData.placed)) ? roomData.placed : []);
  visitScene = { placed: sanitizePlacedItemsForRoom(def, rawPlaced, []), previousRoom: state.player.room };
  switchRoom('myroom');
  showToast(`Visiting ${displayName}'s room — look only, nothing here can be edited.`);
}

/** Exits the visitor scene, restoring the player's own previous room if still inside it. */
function exitVisitScene() {
  if (!visitScene) return;
  const prevRoom = visitScene.previousRoom;
  const wasInMyRoom = state.player.room === 'myroom';
  visitScene = null;
  applyRoomTier(state.player.roomTier || 1);
  if (wasInMyRoom) switchRoom(prevRoom);
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

function isWaterTile(room, roomRuntime, x, y) {
  if (!roomRuntime || !Array.isArray(roomRuntime.placed)) return false;
  for (const p of roomRuntime.placed) {
    if (p.itemId === 'pool_water') {
      const item = getCatalogueItem(p.itemId);
      const cells = footprintCells(p.x, p.y, item.footprint, p.rot || 0);
      if (cells.some((c) => c.x === x && c.y === y)) return true;
    }
  }
  return false;
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

function isBlockedFactory(room, roomRuntime, occupantTiles, isPlayer = false) {
  return (x, y) => {
    const cell = room.grid[y][x];
    if (cell === TILE.WALL || cell === TILE.WINDOW || cell === TILE.VOID) return true;
    // Elevator doors open the floor-directory modal from the doormat tile in front of them
    // (see onPlayerArrive) — the avatar never walks into the elevator car itself.
    if (cell === TILE.DOOR && room.doors.find((d) => d.x === x && d.y === y)?.elevator) return true;
    if (isPlayer && state.player.outfit !== 'swimsuit' && isWaterTile(room, roomRuntime, x, y)) return true;
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
// Movement uses pathfinding.js's retargetMover (click to walk / seamless
// mid-step re-targeting, duplicate-click coalescing) and advanceMover
// (constant-speed interpolation + dynamic re-plan around moving blockers).

function walkMoverTo(mover, tx, ty, room, isBlocked, { nearestFallback = true } = {}) {
  const now = performance.now();
  const result = retargetMover(mover, tx, ty, now, {
    width: room.width, height: room.height, isBlocked, stepMs: STEP_MS, nearestFallback,
  });
  if (result.ok && !result.ignoredDuplicate && mover === player) {
    audio.playSfx('footstep');
  }
  return result;
}

// ---------- player actions & elevator navigation ----------

function applyInteractionArrival(mover, pending, isPlayer = false, immediate = false) {
  const roomRuntime = isPlayer ? currentRoomRuntime() : state.rooms[mover.room];
  const placed = roomRuntime.placed.find((p) => p.instanceId === pending.instanceId);
  if (!placed) return;
  mover.dir = pending.dir;
  const kind = pending.kind;
  const item = getCatalogueItem(placed.itemId);
  // Counters/tables/bars use kind 'eat' too (standing use), so only a true seat item
  // (item.seat) should render the sitting pose — see tests/logic.test.mjs "never seats".
  const isSeatPose = Boolean(item?.seat) && (kind === 'sit' || kind === 'eat');
  const isLiePose = kind === 'lie' || kind === 'spa_massage';
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
    if (kind === 'toggle_light' && item?.lightSource) {
      const wasOn = roomRuntime.lightsOn !== false;
      roomRuntime.lightsOn = !wasOn;
      showToast(roomRuntime.lightsOn ? `${item.name} turned on.` : `${item.name} turned off.`);
      saveState(window.localStorage, state);
    }
    if (placed.itemId === 'changing_cubicle' || placed.itemId === 'changing_room_door' || item?.interaction === 'swimsuit_change') {
      state.player.outfit = state.player.outfit === 'swimsuit' ? 'normal' : 'swimsuit';
      player.outfit = state.player.outfit;
      showToast(state.player.outfit === 'swimsuit' ? 'Changed into your swimsuit! 🩱' : 'Changed back into regular clothes. 👕');
      updateLocalOutfit(state.player.outfit);
      saveState(window.localStorage, state);
      if (state.player.room === 'myroom') publishOwnRoomSnapshot({ tier: state.player.roomTier || 1, placed: state.rooms.myroom.placed });
    }
    if (placed.itemId === 'pool_water') {
      if (immediate) freeRoamPool();
      else showPoolActivityPrompt();
    }
    if (placed.itemId === 'pool_ladder') {
      exitPool();
    }
    if (placed.itemId === 'salon_chair') {
      if (!immediate) openSalonModal();
    }
    if (placed.itemId === 'wardrobe') {
      if (!immediate) openAvatarModal();
    }
    if (placed.itemId.startsWith('arcade_snake')) {
      openArcadeGame('noodle_snake');
    } else if (placed.itemId.startsWith('arcade_breakout')) {
      openArcadeGame('brick_bash');
    } else if (placed.itemId.startsWith('arcade_drop')) {
      openArcadeGame('block_drop');
    } else if (placed.itemId === 'arcade_leaderboard') {
      openArcadeLeaderboard('noodle_snake', 'local');
    } else if (placed.itemId === 'pool_table') {
      openPoolGame();
    } else if (placed.itemId === 'capsule_dispenser') {
      openGumballModal();
    }
    if (placed.itemId === 'massage_bed') {
      showToast('Relaxing massage... feeling energized! ✨ (+Mood buff: Relaxed & Energized)');
      state.player.buff = { name: 'Relaxed & Energized', expiresAt: Date.now() + 120000 };
      saveState(window.localStorage, state);
    }
    persistPlayerPos();
  }
}

let lapSwimTimer = null;
function startLapSwimming() {
  if (lapSwimTimer) clearTimeout(lapSwimTimer);
  player.activity = { kind: 'swim', loop: true, startedAt: performance.now() };
  state.player.activity = player.activity;
  const lanes = [7, 10, 13, 16];
  const laneX = lanes.reduce((prev, curr) => Math.abs(curr - player.x) < Math.abs(prev - player.x) ? curr : prev, 10);
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const occ = occupantTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, roomRuntime, occ, true);

  walkMoverTo(player, laneX, 32, room, blocked, { nearestFallback: false });
  showToast('Swimming laps along the pool lane... 🏊');

  let headingDeep = true;
  const checkLap = () => {
    if (state.player.room !== 'pool') return;
    if (player.activity?.kind !== 'swim') return;
    if (headingDeep && Math.abs(player.y - 32) <= 1 && !player.walking) {
      headingDeep = false;
      walkMoverTo(player, laneX, 11, room, blocked, { nearestFallback: false });
      lapSwimTimer = setTimeout(checkLap, 800);
    } else if (!headingDeep && Math.abs(player.y - 11) <= 1 && !player.walking) {
      headingDeep = true;
      state.stats.lapsCompleted = (state.stats.lapsCompleted || 0) + 1;
      showToast(`Completed lap ${state.stats.lapsCompleted}! 🏊`);
      onQuestProgress(advanceQuestsByType(state, 'visit_gym', 1));
      onQuestProgress(advanceQuestsByType(state, 'swim_laps', 1));
      saveState(window.localStorage, state);
      walkMoverTo(player, laneX, 32, room, blocked, { nearestFallback: false });
      lapSwimTimer = setTimeout(checkLap, 800);
    } else {
      lapSwimTimer = setTimeout(checkLap, 600);
    }
  };
  lapSwimTimer = setTimeout(checkLap, 800);
}

function freeRoamPool() {
  if (lapSwimTimer) { clearTimeout(lapSwimTimer); lapSwimTimer = null; }
  player.activity = { kind: 'swim', loop: true, startedAt: performance.now() };
  state.player.activity = player.activity;
  showToast('Free roam mode: Swim freely across the pool! 🌊');
}

function exitPool() {
  if (lapSwimTimer) { clearTimeout(lapSwimTimer); lapSwimTimer = null; }
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const occ = occupantTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, roomRuntime, occ, true);
  const targetX = player.x <= 11 ? 5 : 18;
  const targetY = Math.min(Math.max(player.y, 10), 32);
  walkMoverTo(player, targetX, targetY, room, blocked);
  player.activity = null;
  state.player.activity = null;
  showToast('Exited the pool onto the stone deck.');
}

function showPoolActivityPrompt() {
  const modal = document.getElementById('poolPromptModal');
  if (modal) {
    modal.classList.remove('hidden');
  } else {
    freeRoamPool();
  }
}

function openSalonModal() {
  document.getElementById('salonModal')?.classList.remove('hidden');
}

function handleSalonStyle(style) {
  if (state.coins < 20) {
    showToast('Not enough coins! (Costs 20 coins)');
    return;
  }
  state.coins -= 20;
  refreshCoins();
  state.player.look = state.player.look || {};
  state.player.look.hairStyle = style;
  showToast(`Antoine gave you a ${style} cut! ✨ (-20 coins)`);
  saveState(window.localStorage, state);
  document.getElementById('salonModal')?.classList.add('hidden');
}

function handleSalonColor(color) {
  if (state.coins < 20) {
    showToast('Not enough coins! (Costs 20 coins)');
    return;
  }
  state.coins -= 20;
  refreshCoins();
  state.player.look = state.player.look || {};
  state.player.look.hairColor = color;
  showToast('Dyed your hair! Looking fresh ✨ (-20 coins)');
  saveState(window.localStorage, state);
  document.getElementById('salonModal')?.classList.add('hidden');
}

function openRoomUpgradeModal() {
  const modal = document.getElementById('roomUpgradeModal');
  const listEl = document.getElementById('roomUpgradeList');
  if (!modal || !listEl) return;
  const currentTier = state.player.roomTier || 1;
  listEl.innerHTML = ROOM_TIERS.map((t) => {
    const isCurrent = t.tier === currentTier;
    const canAfford = state.coins >= t.cost;
    const isUpgrade = t.tier > currentTier;
    const btnHtml = isCurrent
      ? '<button class="pixel-btn" disabled>Current Suite</button>'
      : (isUpgrade
          ? `<button class="pixel-btn" data-upgrade-tier="${t.tier}" ${canAfford ? '' : 'disabled'}>Upgrade (${t.cost} 💰)</button>`
          : '<button class="pixel-btn" disabled>Unlocked</button>');
    return `
      <div class="upgrade-card ${isCurrent ? 'current' : ''}">
        <div>
          <div class="tier-name">${t.tier}. ${t.name} (Floor ${t.floor})</div>
          <div class="tier-meta">${t.width}x${t.height} layout • Room ${t.roomNumber} • ${t.description}</div>
        </div>
        <div>${btnHtml}</div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-upgrade-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = Number(btn.dataset.upgradeTier);
      upgradeRoom(tier);
    });
  });

  ui.preUpgradeTrackId = audio.trackId;
  ui.preUpgradeAutoFollow = audio.autoFollowRoom;
  audio.setTrack('renovation', false);
  refreshMusicPlayer();
  modal.classList.remove('hidden');
}

function closeRoomUpgradeModal() {
  const modal = document.getElementById('roomUpgradeModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  if (audio.trackId === 'renovation') {
    const restoreId = (ui.preUpgradeAutoFollow || !ui.preUpgradeTrackId) ? trackForRoom(state.player.room) : ui.preUpgradeTrackId;
    audio.setAutoFollowRoom(ui.preUpgradeAutoFollow !== false);
    audio.setTrack(restoreId, false);
    refreshMusicPlayer();
  }
}

function upgradeRoom(newTier) {
  const currentTier = state.player.roomTier || 1;
  if (newTier <= currentTier) return;
  const tierDef = ROOM_TIERS.find((t) => t.tier === newTier);
  if (!tierDef) return;
  if (state.coins < tierDef.cost) {
    showToast(`Need ${tierDef.cost} coins for this upgrade.`);
    return;
  }
  state.coins -= tierDef.cost;
  refreshCoins();
  applyRoomTier(newTier, state);
  saveState(window.localStorage, state);
  updateRoomLabel();
  refreshElevatorPanel();
  closeRoomUpgradeModal();
  showToast(`Upgraded to ${tierDef.name} on Floor ${tierDef.floor}! 🎉`);
}

function tryWalkPlayer(tx, ty) {
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  if (isWaterTile(room, roomRuntime, tx, ty) && state.player.outfit !== 'swimsuit') {
    showToast('Change into your swimsuit first');
    return false;
  }
  const occ = occupantTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, roomRuntime, occ, true);
  const result = walkMoverTo(player, tx, ty, room, blocked);
  if (!result.ok) return false;
  if (result.ignoredDuplicate) return true;
  player.sitting = null;
  player.lying = false;
  player.activity = isWaterTile(room, roomRuntime, tx, ty) ? { kind: 'swim', loop: true, startedAt: performance.now() } : null;
  player.pendingInteract = null;
  player.pendingDialogue = null;
  state.player.sitting = null;
  state.player.activity = player.activity;
  return true;
}

function tryInteractPlayer(placedItem, immediate = false) {
  if (isVisitingFriendRoom()) return false;
  if (placedItem.itemId === 'pool_water' && state.player.outfit !== 'swimsuit') {
    showToast('Change into your swimsuit first');
    return false;
  }
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const occ = occupantTilesExcluding('player', null);
  const res = reservedTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, roomRuntime, occ, true);
  const approach = findApproachTile(roomForInventory(), placedItem, blocked, { x: player.x, y: player.y }, occ, res);
  if (!approach) return false;
  if (approach.kind === 'toggle_light' && state.player.room !== 'myroom') {
    showToast('Not your room — lamps can only be toggled in My Room.');
    return false;
  }
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
    player.targetX = null;
    player.targetY = null;
    player.pendingInteract = null;
    applyInteractionArrival(player, pending, true, immediate);
    return true;
  }
  const result = walkMoverTo(player, approach.tile.x, approach.tile.y, room, blocked, { nearestFallback: false });
  if (!result.ok) return false;
  player.sitting = null;
  player.lying = false;
  player.activity = null;
  player.pendingDialogue = null;
  player.pendingInteract = pending;
  return true;
}

function findAdjacentFreeTile(npc, room, isBlocked) {
  const deltas = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }];
  const candidates = [];
  for (const d of deltas) {
    const x = npc.x + d.x;
    const y = npc.y + d.y;
    if (x < 0 || y < 0 || x >= room.width || y >= room.height) continue;
    if (isBlocked(x, y)) continue;
    const dist = Math.abs(x - player.x) + Math.abs(y - player.y);
    candidates.push({ x, y, dist });
  }
  candidates.sort((a, b) => a.dist - b.dist);
  // Prefer the closest candidate that is actually reachable from the player's
  // current tile; a geometrically-closest tile can be sealed off (e.g. a desk's
  // only free flank being the NPC's own standing tile).
  for (const c of candidates) {
    if (c.x === player.x && c.y === player.y) return c;
    if (findPath(room.width, room.height, isBlocked, { x: player.x, y: player.y }, { x: c.x, y: c.y })) return c;
  }
  return candidates[0] || null;
}

function startNpcDialogue(npcId) {
  const npc = npcRuntimes.find((n) => n.id === npcId);
  if (!npc || npc.room !== state.player.room) return false;
  if (ui.activeDialogue && ui.activeDialogue.npcId === npcId) return true;
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const occ = occupantTilesExcluding('player', null);
  const blocked = isBlockedFactory(room, roomRuntime, occ);
  const adj = findAdjacentFreeTile(npc, room, blocked);
  if (!adj || (adj.x === player.x && adj.y === player.y)) {
    openNpcDialogue(npc);
    return true;
  }
  const result = walkMoverTo(player, adj.x, adj.y, room, blocked, { nearestFallback: false });
  if (!result.ok) {
    openNpcDialogue(npc);
    return true;
  }
  player.sitting = null;
  player.lying = false;
  player.activity = null;
  player.pendingInteract = null;
  player.pendingDialogue = npcId;
  return true;
}

function openNpcDialogue(npc) {
  const now = performance.now();
  ui.activeDialogue = { npcId: npc.id };
  npc.pausedUntil = now + 20000;
  npc.walking = false;
  npc.path = null;
  npc.targetX = null;
  npc.targetY = null;
  npc.dir = directionBetween({ x: npc.x, y: npc.y }, { x: player.x, y: player.y });
  player.dir = directionBetween({ x: player.x, y: player.y }, { x: npc.x, y: npc.y });
  persistPlayerPos();

  const bar = document.getElementById('npcDialogueBar');
  bar.classList.remove('hidden');
  document.getElementById('npcDlgAvatar').textContent = npc.def.isReceptionist ? '🛎️' : '🙂';
  document.getElementById('npcDlgName').textContent = npc.def.name;
  document.getElementById('npcDlgRole').textContent = npc.def.role || (npc.def.isReceptionist ? 'Hotel Receptionist' : 'Hotel Guest');
  const line = pickRandom(npc.def.greetLines) || pickRandom(npc.def.ambientLines) || 'Hello there!';
  document.getElementById('npcDlgText').textContent = line;

  const optsEl = document.getElementById('npcDlgOptions');
  const topics = npc.def.dialogueTopics || [];
  optsEl.innerHTML = topics.map((t, i) => `<button class="pixel-btn npc-dlg-opt" data-topic="${i}">${t.label}</button>`).join('');
  optsEl.querySelectorAll('[data-topic]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const topic = topics[Number(btn.dataset.topic)];
      document.getElementById('npcDlgText').textContent = topic.reply;
      audio.playSfx('chat');
      if (topic.id === 'checkin') {
        onQuestProgress(setQuestProgress(state, 'greet', Math.max(1, greetedNpcs.size)));
      }
      if (topic.id === 'gumball_trade') {
        closeNpcDialogue();
        openTraderModal();
      }
    });
  });
  audio.playSfx('chat');
  pushChatLine(npc.def.name, line);
  if (!greetedNpcs.has(npc.id)) {
    greetedNpcs.add(npc.id);
    state.stats.greetedNpcs = Array.from(greetedNpcs);
    onQuestProgress(setQuestProgress(state, 'greet', greetedNpcs.size));
  }
}

function closeNpcDialogue() {
  if (ui.activeDialogue) {
    const npc = npcRuntimes.find((n) => n.id === ui.activeDialogue.npcId);
    if (npc) npc.pausedUntil = performance.now();
  }
  ui.activeDialogue = null;
  document.getElementById('npcDialogueBar').classList.add('hidden');
}

function tickActiveDialogue(now) {
  if (!ui.activeDialogue) return;
  const npc = npcRuntimes.find((n) => n.id === ui.activeDialogue.npcId);
  if (!npc || npc.room !== state.player.room || npc.pausedUntil <= now) {
    closeNpcDialogue();
    return;
  }
  const dist = Math.abs(npc.x - player.x) + Math.abs(npc.y - player.y);
  if (dist > 2) closeNpcDialogue();
}

// The tile just inside the room, directly facing a door (matches inventory.js's
// hasDoorArrivalRoute "landing" tile) — the doormat the player steps on to use it.
function doorLandingTile(d) {
  return d.y === 0 ? { x: d.x, y: 1 } : { x: 1, y: d.y };
}

function onPlayerArrive() {
  const room = currentRoomDef();
  const cell = room.grid[player.y][player.x];
  if (player.pendingDialogue) {
    const npcId = player.pendingDialogue;
    player.pendingDialogue = null;
    const npc = npcRuntimes.find((n) => n.id === npcId);
    if (npc) openNpcDialogue(npc);
    return;
  }
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
  } else if (player.activity?.kind === 'swim') {
    player.activity = null;
    state.player.activity = null;
    if (lapSwimTimer) { clearTimeout(lapSwimTimer); lapSwimTimer = null; }
  }
  if (cell === TILE.DOOR) {
    const doorDef = room.doors.find((d) => d.x === player.x && d.y === player.y);
    if (doorDef && !doorDef.elevator) {
      if (doorDef.label) showToast(doorDef.label);
      switchRoom(doorDef.to, doorDef.toTile);
      return;
    }
  }
  // Stepping onto the doormat tile directly in front of an elevator door opens the floor
  // directory as a modal — the avatar stays on the doormat and never walks into the car.
  const elevatorDoor = room.doors.find((d) => d.elevator && doorLandingTile(d).x === player.x && doorLandingTile(d).y === player.y);
  if (elevatorDoor) {
    openElevatorPanel();
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
  document.getElementById('poolPromptModal')?.classList.add('hidden');
  document.getElementById('salonModal')?.classList.add('hidden');
  closeRoomUpgradeModal();
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
  player.pendingDialogue = null;
  player.bubbleText = null;
  player.bubbleUntil = 0;
  player.targetX = null;
  player.targetY = null;
  closeNpcDialogue();
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
  recenterCamera(player.x, player.y, ui.camera.zoom);
  audio.setRoomMood(roomId, ui.phase, targetDef.floor || 1);
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
  const floorNum = (f) => (f === 'R' || f === 42 ? 42 : (Number(f) || 1));
  ui.elevatorAnim = {
    fromFloor: floorNum(fromDef.floor),
    toFloor: floorNum(targetDef.floor),
    toFloorLabel: (targetDef.floor === 'R' || targetDef.floor === 42) ? '42' : String(targetDef.floor || 1),
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
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  notifyLocalChat(text);

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

function onGumballCollectionChanged() {
  onQuestProgress(setQuestProgress(state, 'gumball_common_set', distinctOwnedInRarity(state, 'common')));
  onQuestProgress(setQuestProgress(state, 'gumball_uncommon_set', distinctOwnedInRarity(state, 'uncommon')));
  onQuestProgress(setQuestProgress(state, 'gumball_rare_set', distinctOwnedInRarity(state, 'rare')));
  onQuestProgress(setQuestProgress(state, 'gumball_special_set', distinctOwnedInRarity(state, 'special')));
  onQuestProgress(setQuestProgress(state, 'gumball_full_set', totalDistinctOwned(state)));
  renderGumballsTab();
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

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}

/**
 * Role-driven movement: each NPC with a `def.routine` walks its stops in a
 * fixed cycle (waypoints tied to real seats/stations/POIs for that floor —
 * see data.js), dwelling at each stop for a role-appropriate duration
 * instead of picking a new random tile every few seconds. `activity:
 * 'interact'` stops reuse the same approach/seat machinery as the player's
 * furniture interactions, so diners sit in their chair, chefs stand at
 * their range, swimmers occupy a lap-pool tile, etc. NPCs without a
 * routine (none, currently) fall back to the legacy random wander/furniture
 * seeking behaviour below.
 */
function routineStepFor(npc, room, roomRuntime, now) {
  const routine = npc.def?.routine;
  if (Array.isArray(routine) && routine.length > 0) {
    const occ = occupantTilesExcluding('npc', npc.id);
    const res = reservedTilesExcluding('npc', npc.id);
    const blocked = isBlockedFactory(room, roomRuntime, occ);
    for (let attempt = 0; attempt < routine.length; attempt++) {
      const idx = (npc.routineIdx + 1 + attempt) % routine.length;
      const stop = routine[idx];
      const dwellMs = stop.dwell ? randRange(stop.dwell) : 4000;
      if (stop.activity === 'interact') {
        const placed = roomRuntime.placed.find((p) => p.x === stop.x && p.y === stop.y);
        if (!placed) continue;
        if (npc.sitting === placed.instanceId || npc.activity?.instanceId === placed.instanceId) continue;
        const approach = findApproachTile(roomForInventory(npc.room), placed, blocked, { x: npc.x, y: npc.y }, occ, res);
        if (!approach || !approach.path || approach.path.length < 2) continue;
        npc.routineIdx = idx;
        npc.sitting = null;
        npc.lying = false;
        npc.activity = null;
        npc.pendingInteract = {
          instanceId: placed.instanceId,
          itemId: placed.itemId,
          targetTile: approach.tile,
          dir: approach.dir,
          kind: approach.kind,
        };
        return { path: approach.path, dwellMs };
      }
      const path = findPath(room.width, room.height, blocked, { x: npc.x, y: npc.y }, { x: stop.x, y: stop.y });
      if (!path || path.length < 2) continue;
      npc.routineIdx = idx;
      npc.sitting = null;
      npc.lying = false;
      npc.activity = null;
      return { path, dwellMs };
    }
    return null;
  }

  // Legacy fallback for any NPC without a routine: occasionally sit at a
  // nearby piece of furniture, otherwise wander to a random reachable tile.
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
}

function tickNpcs(now) {
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    const room = ROOMS[n.room];
    const roomRuntime = state.rooms[n.room];
    const liveBlocked = isBlockedFactory(room, roomRuntime, occupantTilesExcluding('npc', n.id));
    advanceMover(n, now, {
      width: room.width, height: room.height, isBlocked: liveBlocked, stepMs: STEP_MS,
      onArrive: () => {
        if (n.pendingInteract) {
          const pending = n.pendingInteract;
          n.pendingInteract = null;
          applyInteractionArrival(n, pending, false);
        }
      },
    });
    tickNpc(n, now, {
      tryWander: (npc) => routineStepFor(npc, room, roomRuntime, now),
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
  const roomDef = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const pOff = entityPhaseOffset('player');
  const inWater = isWaterTile(roomDef, roomRuntime, Math.round(player.renderX), Math.round(player.renderY));
  const pAction = (inWater || player.activity?.kind === 'swim') ? 'swim' : (!player.walking && player.activity ? player.activity.kind : null);

  const isPlayerEmote = player.emote && player.emoteUntil > now;
  if (isPlayerEmote) {
    player.emoteFrame = (player.emoteFrame || 0) + 0.15;
  } else if (player.emote) {
    player.emote = null;
    player.emoteFrame = 0;
  }

  list.push({
    id: 'player',
    x: player.renderX, y: player.renderY, dir: player.dir, frame: player.frame, walking: player.walking,
    sitting: !!player.sitting, lying: !!player.lying,
    blink: ((now + pOff * 1.3) % 3800) < 150,
    breathe: player.walking ? 0 : Math.floor((now + pOff) / 1400) % 2,
    action: pAction,
    actionFrame: computeActionFrame(pAction, now, pOff),
    emote: isPlayerEmote ? player.emote : null,
    emoteFrame: isPlayerEmote ? player.emoteFrame : 0,
    depth: entityDepth(player), spriteKey: 'player', kind: 'player',
    outfit: state.player.outfit || 'normal',
    look: state.player.look || null,
    bubbleText: player.bubbleUntil && player.bubbleUntil > now ? player.bubbleText : null,
  });
  for (const n of npcRuntimes) {
    if (n.room !== state.player.room) continue;
    const nOff = entityPhaseOffset(n.id);
    const nInWater = isWaterTile(roomDef, roomRuntime, Math.round(n.renderX), Math.round(n.renderY));
    const nAction = (nInWater || n.activity?.kind === 'swim') ? 'swim' : (!n.walking && n.activity ? n.activity.kind : null);
    const isNpcEmote = n.emote && n.emoteUntil > now;
    if (isNpcEmote) {
      n.emoteFrame = (n.emoteFrame || 0) + 0.15;
    } else if (n.emote) {
      n.emote = null;
      n.emoteFrame = 0;
    }
    list.push({
      id: n.id,
      x: n.renderX, y: n.renderY, dir: n.dir, frame: n.frame, walking: n.walking,
      sitting: !!n.sitting, lying: !!n.lying,
      blink: ((now + nOff * 1.3) % 3800) < 150,
      breathe: n.walking ? 0 : Math.floor((now + nOff) / 1400) % 2,
      action: nAction,
      actionFrame: computeActionFrame(nAction, now, nOff),
      emote: isNpcEmote ? n.emote : null,
      emoteFrame: isNpcEmote ? n.emoteFrame : 0,
      depth: entityDepth(n),
      spriteKey: n.id, kind: 'npc', color: n.def.color, look: n.def.look || null,
      nameTag: n.def.isStaff ? `${n.def.name} · Staff` : (n.def.homeFloor ? `${n.def.name} · F${n.def.homeFloor}` : n.def.name),
      outfit: n.id === 'marina' ? 'swimsuit' : 'normal',
      bubbleText: n.bubble ? n.bubble.text : (n.bubbleUntil && n.bubbleUntil > now ? n.bubbleText : null),
    });
  }
  list.push(...getRemoteMultiplayerEntities(now));
  return list;
}

function placedFurnitureWithFootprint(roomRuntime) {
  return roomRuntime.placed.map((p) => ({ ...p, footprint: rotatedFootprint(getCatalogueItem(p.itemId).footprint, p.rot) }));
}

function frame(now) {
  if (ui.startTime === null) ui.startTime = now;
  syncCanvasSize();
  tickNpcs(now);
  const room0 = currentRoomDef();
  const playerBlocked = isBlockedFactory(room0, currentRoomRuntime(), occupantTilesExcluding('player', null), true);
  advanceMover(player, now, {
    width: room0.width, height: room0.height, isBlocked: playerBlocked, stepMs: STEP_MS, onArrive: onPlayerArrive,
  });
  if (player.walking && !ui.dragging) {
    const target = centerCameraOnTile(player.renderX, player.renderY, room0, ui.cssW, ui.cssH, ui.camera.zoom);
    // Snapping the shared camera pan to whole device pixels (rather than letting
    // it drift sub-pixel) keeps every sprite's `blitDeviceAligned` rounding
    // consistent relative to each other frame-to-frame, which is what actually
    // stops the 1px shimmer/wobble between furniture, floor and characters
    // while the camera eases toward the walking player.
    const dpr = ui.dpr || 1;
    ui.camera.panX = Math.round((ui.camera.panX + (target.panX - ui.camera.panX) * 0.18) * dpr) / dpr;
    ui.camera.panY = Math.round((ui.camera.panY + (target.panY - ui.camera.panY) * 0.18) * dpr) / dpr;
  }
  tickActiveDialogue(now);
  tickMultiplayer(now, player);

  if (ui.elevatorAnim && now - ui.elevatorAnim.start > ui.elevatorAnim.duration) {
    ui.elevatorAnim = null;
  }

  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  ui.phase = (0.5 + (now - ui.startTime) / DAY_CYCLE_MS) % 1;
  audio.setRoomMood(state.player.room, ui.phase, room.floor || 1);
  refreshMusicPlayerThrottled(now);

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
    camera: ui.camera,
    lightsOn: roomRuntime.lightsOn !== false,
  });

  requestAnimationFrame(frame);
}

// ---------- input ----------

function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const p = (evt.touches && evt.touches[0]) || (evt.changedTouches && evt.changedTouches[0]) || evt;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

function pickTileAt(x, y) {
  const room = currentRoomDef();
  const { originX, originY } = computeOrigin(room, ui.cssW, ui.cssH);
  const tile = screenToTile(x, y, originX, originY, ui.camera, ui.cssW, ui.cssH);
  if (tile.x < 0 || tile.y < 0 || tile.x >= room.width || tile.y >= room.height) return null;
  return tile;
}

function pickTile(evt) {
  const { x, y } = getCanvasPos(evt);
  return pickTileAt(x, y);
}

function handleCanvasTap(cx, cy) {
  if (ui.placing) {
    const tile = pickTileAt(cx, cy);
    if (!tile) return;
    audio.playSfx('click');
    confirmPlacement(tile);
    return;
  }
  const hit = hitTestNpc(cx, cy);
  if (hit && hit.kind === 'npc') {
    audio.playSfx('click');
    startNpcDialogue(hit.id);
    return;
  }
  const tile = pickTileAt(cx, cy);
  if (!tile) return;
  audio.playSfx('click');
  const room = currentRoomDef();
  const roomRuntime = currentRoomRuntime();
  const furn = interactiveFurnitureAt(room, roomRuntime, tile.x, tile.y);
  if (furn && tryInteractPlayer(furn)) {
    return;
  }
  tryWalkPlayer(tile.x, tile.y);
}

canvas.addEventListener('mousemove', (evt) => {
  if (ui.dragging) {
    const { x, y } = getCanvasPos(evt);
    const dx = x - ui.dragLast.x;
    const dy = y - ui.dragLast.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) ui.dragMoved = true;
    if (ui.dragMoved) {
      ui.camera.panX += dx;
      ui.camera.panY += dy;
      ui.dragLast = { x, y };
    }
    return;
  }
  ui.hoverTile = pickTile(evt);
});
canvas.addEventListener('mouseleave', () => { ui.hoverTile = null; });

canvas.addEventListener('mousedown', (evt) => {
  if (evt.button !== 0) return;
  ui.dragging = true;
  ui.dragMoved = false;
  ui.dragLast = getCanvasPos(evt);
});
window.addEventListener('mouseup', () => { ui.dragging = false; });

canvas.addEventListener('wheel', (evt) => {
  evt.preventDefault();
  const { x, y } = getCanvasPos(evt);
  const delta = evt.deltaY > 0 ? -0.1 : 0.1;
  setZoomAtPoint(ui.camera.zoom + delta, x, y);
}, { passive: false });

// Touch controls: pinch-to-zoom, one-finger drag pan, tap to walk/interact, long-press
function touchDist(evt) {
  const [a, b] = evt.touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

let touchStartPos = null;
let touchStartTime = 0;
let longPressTimer = null;

canvas.addEventListener('touchstart', (evt) => {
  if (evt.touches.length === 2) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    ui.pinchDist = touchDist(evt);
    ui.dragging = false;
  } else if (evt.touches.length === 1) {
    ui.dragging = true;
    ui.dragMoved = false;
    const pos = getCanvasPos(evt);
    ui.dragLast = pos;
    touchStartPos = pos;
    touchStartTime = performance.now();

    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!ui.dragMoved && touchStartPos) {
        if (ui.placing) {
          cancelPlacing();
          audio.playSfx('click');
        } else {
          const tile = pickTileAt(touchStartPos.x, touchStartPos.y);
          if (tile && state.player.room === 'myroom') {
            const room = currentRoomDef();
            const roomRuntime = currentRoomRuntime();
            const furn = furnitureAt(room, roomRuntime, tile.x, tile.y);
            if (furn) {
              startPlacing({ instanceId: furn.instanceId, itemId: furn.itemId, moveInstanceId: furn.instanceId });
              audio.playSfx('click');
            }
          }
        }
      }
    }, 550);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (evt) => {
  if (evt.touches.length === 2 && ui.pinchDist) {
    evt.preventDefault();
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    const dist = touchDist(evt);
    const rect = canvas.getBoundingClientRect();
    const cx = (evt.touches[0].clientX + evt.touches[1].clientX) / 2 - rect.left;
    const cy = (evt.touches[0].clientY + evt.touches[1].clientY) / 2 - rect.top;
    setZoomAtPoint(ui.camera.zoom * (dist / ui.pinchDist), cx, cy);
    ui.pinchDist = dist;
  } else if (evt.touches.length === 1 && ui.dragging) {
    const { x, y } = getCanvasPos(evt);
    const dx = x - ui.dragLast.x;
    const dy = y - ui.dragLast.y;
    const totalDist = touchStartPos ? Math.hypot(x - touchStartPos.x, y - touchStartPos.y) : 0;
    if (totalDist > 8) {
      ui.dragMoved = true;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }
    if (ui.dragMoved) {
      ui.camera.panX += dx;
      ui.camera.panY += dy;
      ui.dragLast = { x, y };
      evt.preventDefault();
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  ui.pinchDist = null;
  ui.dragging = false;

  if (!ui.dragMoved && touchStartPos && (performance.now() - touchStartTime < 450)) {
    const pos = touchStartPos;
    touchStartPos = null;
    ui.lastTouchTapTime = performance.now();
    handleCanvasTap(pos.x, pos.y);
  }
  setTimeout(() => { ui.dragMoved = false; }, 60);
});

canvas.addEventListener('click', (evt) => {
  if (ui.lastTouchTapTime && (performance.now() - ui.lastTouchTapTime < 400)) {
    return;
  }
  if (ui.dragMoved) { ui.dragMoved = false; return; }
  const { x: cx, y: cy } = getCanvasPos(evt);
  handleCanvasTap(cx, cy);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.getElementById('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  handleChatSubmit(input.value);
  input.value = '';
});

// ---------- placing mode ----------

function startPlacing({ instanceId, itemId, moveInstanceId }) {
  if (isVisitingFriendRoom()) { showToast("You're just visiting — nothing here can be edited."); return; }
  ui.placing = { instanceId, itemId, rot: 0, moveInstanceId: moveInstanceId || null };
  document.getElementById('placingBar').classList.remove('hidden');
  document.getElementById('placingLabel').textContent = `Placing ${getCatalogueItem(itemId).name} — click a tile`;
  const iconEl = document.getElementById('placingIcon');
  const iconUrl = getItemIconDataUrl(itemId, 40, ui.dpr || 1);
  if (iconUrl) { iconEl.src = iconUrl; iconEl.classList.remove('hidden'); }
  else iconEl.classList.add('hidden');
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
  if (isVisitingFriendRoom()) { cancelPlacing(); return; }
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
    if (state.player.room === 'myroom') publishOwnRoomSnapshot(state.rooms.myroom.placed);
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
document.getElementById('btnZoomIn').addEventListener('click', () => stepZoom(0.15));
document.getElementById('btnZoomOut').addEventListener('click', () => stepZoom(-0.15));
document.getElementById('btnZoomReset').addEventListener('click', resetZoom);
document.getElementById('btnCenterPlayer').addEventListener('click', () => { recenterCamera(player.x, player.y, ui.camera.zoom); persistZoom(); });
document.getElementById('btnNpcDlgClose').addEventListener('click', closeNpcDialogue);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('helpOverlay').classList.contains('hidden')) hideHelp();
    else if (isAvatarModalOpen()) closeAvatarModal();
    else if (!document.getElementById('emoteBar')?.classList.contains('hidden')) toggleEmoteBar(false);
    else if (!document.getElementById('arcadeGameModal').classList.contains('hidden')) closeArcadeGame();
    else if (!document.getElementById('arcadeLeaderboardModal').classList.contains('hidden')) closeArcadeLeaderboard();
    else if (!document.getElementById('elevatorPanel').classList.contains('hidden')) document.getElementById('elevatorPanel').classList.add('hidden');
    else if (!document.getElementById('roomUpgradeModal').classList.contains('hidden')) closeRoomUpgradeModal();
    else if (ui.activeDialogue) closeNpcDialogue();
    else cancelPlacing();
  }
  else if (getActiveArcadeState().isOpen) return;
  else if (e.key >= '1' && e.key <= '8' && !isTypingTarget(e)) {
    const idx = parseInt(e.key, 10) - 1;
    if (idx >= 0 && idx < EMOTES.length) triggerEmote(EMOTES[idx].id);
  }
  else if (e.key.toLowerCase() === 'r' && ui.placing) rotatePlacing();
  else if ((e.key === '+' || e.key === '=') && !isTypingTarget(e)) stepZoom(0.15);
  else if (e.key === '-' && !isTypingTarget(e)) stepZoom(-0.15);
  else if (e.key === '0' && !isTypingTarget(e)) resetZoom();
  else if (e.key.toLowerCase() === 'e' && !isTypingTarget(e)) togglePanel('elevatorPanel');
  else if (e.key.toLowerCase() === 'i' && !isTypingTarget(e)) togglePanel('inventoryPanel');
  else if (e.key.toLowerCase() === 'q' && !isTypingTarget(e)) togglePanel('questPanel');
  else if (e.key.toLowerCase() === 'm' && !isTypingTarget(e)) toggleMute();
  else if (e.key.toLowerCase() === 'h' && !isTypingTarget(e)) showHelp();
  else if (e.key.toLowerCase() === 's' && !isTypingTarget(e)) manualSave();
});
function isTypingTarget(e) { return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'); }

// ---------- panels ----------

function togglePanel(id) {
  const el = document.getElementById(id);
  const willShow = el.classList.contains('hidden');
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  if (willShow) el.classList.remove('hidden');
  if (id === 'inventoryPanel' && willShow) {
    // Re-opening the panel always lands back on the category tiles, not wherever you left off.
    activeCategory.shopTab = null;
    activeCategory.bagTab = null;
    activeCategory.roomTab = null;
    refreshShopTab(); refreshBagTab(); refreshRoomTab(); renderGumballsTab();
  }
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
document.getElementById('btnUpgradeRoom')?.addEventListener('click', openRoomUpgradeModal);
document.getElementById('btnUpgradeClose')?.addEventListener('click', closeRoomUpgradeModal);
document.getElementById('roomUpgradeModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeRoomUpgradeModal();
});

document.getElementById('btnPoolSwimLaps')?.addEventListener('click', () => {
  document.getElementById('poolPromptModal')?.classList.add('hidden');
  startLapSwimming();
});
document.getElementById('btnPoolFreeRoam')?.addEventListener('click', () => {
  document.getElementById('poolPromptModal')?.classList.add('hidden');
  freeRoamPool();
});
document.getElementById('btnPoolExit')?.addEventListener('click', () => {
  document.getElementById('poolPromptModal')?.classList.add('hidden');
  exitPool();
});
document.getElementById('poolPromptModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

document.querySelectorAll('.salon-style-btn').forEach((btn) => {
  btn.addEventListener('click', () => handleSalonStyle(btn.dataset.style));
});
document.querySelectorAll('.salon-color-btn').forEach((btn) => {
  btn.addEventListener('click', () => handleSalonColor(btn.dataset.color));
});
document.getElementById('btnSalonClose')?.addEventListener('click', () => {
  document.getElementById('salonModal')?.classList.add('hidden');
});
document.getElementById('salonModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

document.getElementById('btnInventory').addEventListener('click', () => togglePanel('inventoryPanel'));
document.getElementById('btnQuests').addEventListener('click', () => togglePanel('questPanel'));
document.getElementById('btnMultiplayer').addEventListener('click', () => togglePanel('multiplayerPanel'));
document.querySelectorAll('.panel-close').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.close) {
      document.getElementById(btn.dataset.close)?.classList.add('hidden');
    }
  });
});
// Elevator directory is a centred modal: clicking the dimmed backdrop (not the box itself) closes it.
document.getElementById('elevatorPanel').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
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
  const floorLabel = (def.floor === 'R' || def.floor === 42) ? 'Floor 42' : `Floor ${def.floor || 1}`;
  document.getElementById('roomName').textContent = `${floorLabel} — ${def.name}`;
}

function refreshElevatorPanel() {
  const el = document.getElementById('elevatorList');
  if (!el) return;
  const floorNum = (r) => (r.floor === 'R' || r.floor === 42 ? 42 : (Number(r.floor) || 0));
  const floors = Object.values(ROOMS).sort((a, b) => floorNum(b) - floorNum(a));
  let lastWing = null;
  el.innerHTML = floors.map((r) => {
    const isCurrent = r.id === state.player.room;
    const wingHeader = r.wing && r.wing !== lastWing
      ? `<div class="elevator-group-title">${r.wing}</div>`
      : '';
    lastWing = r.wing || lastWing;
    const guestCount = npcRuntimes.filter((n) => n.room === r.id).length;
    const guestLabel = guestCount > 0 ? ` • 👤 ${guestCount}` : '';
    const floorPill = (r.floor === 'R' || r.floor === 42) ? '42' : `F${r.floor}`;
    const levelDesc = r.privateSuite
      ? 'Your private personal suite'
      : ((r.floor === 'R' || r.floor === 42) ? `Open-Air Rooftop${guestLabel}` : `Tower Level ${r.floor}${guestLabel}`);
    const btnLabel = isCurrent ? 'Here' : ((r.floor === 'R' || r.floor === 42) ? '42' : 'Go');
    let itemHtml = `${wingHeader}
      <div class="elevator-item ${isCurrent ? 'active-floor' : ''}">
        <div class="floor-pill">${floorPill}</div>
        <div class="item-info">
          <div class="item-name">${r.icon || '🏢'} ${r.name}</div>
          <div class="item-desc">${levelDesc}</div>
        </div>
        <div class="item-actions">
          <button class="pixel-btn elevator-floor-btn" data-floor-room="${r.id}" ${isCurrent ? 'disabled' : ''}>
            ${btnLabel}
          </button>
        </div>
      </div>`;
    if (r.id === 'rooftop') {
      itemHtml += `
      <div class="elevator-item disabled-floor">
        <div class="floor-pill">10-41</div>
        <div class="item-info">
          <div class="item-name">🛏️ Guest Rooms (Floors 10–41)</div>
          <div class="item-desc">Private Guest Suites • Guests only</div>
        </div>
        <div class="item-actions">
          <button class="pixel-btn elevator-floor-btn" disabled>Locked</button>
        </div>
      </div>`;
    }
    return itemHtml;
  }).join('');
  el.querySelectorAll('[data-floor-room]').forEach((btn) => {
    btn.addEventListener('click', () => {
      travelByElevator(btn.dataset.floorRoom);
    });
  });
}

function itemIconImg(item) {
  const url = getItemIconDataUrl(item.id, 48, ui.dpr || 1);
  return url
    ? `<img class="item-icon" src="${url}" alt="${item.name}" />`
    : `<div class="item-swatch" style="background:${swatchColor(item)}"></div>`;
}

// Shop / My Items / In This Room each start on a grid of category tiles; clicking one
// opens its filtered item list with a Back button. Each tab tracks its own open category.
const activeCategory = { shopTab: null, bagTab: null, roomTab: null };

function categoryMeta(catId) {
  return ITEM_CATEGORIES.find((c) => c.id === catId) || { id: catId, name: catId, icon: '📦' };
}

function categoryTilesHtml(entries, categoryOf) {
  const counts = new Map();
  for (const e of entries) {
    const cat = categoryOf(e);
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  return ITEM_CATEGORIES.filter((c) => counts.has(c.id)).map((c) => `
    <button class="category-tile" data-category="${c.id}">
      <span class="category-tile-icon">${c.icon}</span>
      <span class="category-tile-label">${c.name}</span>
      <span class="category-tile-count">${counts.get(c.id)}</span>
    </button>`).join('');
}

/** Renders category tiles when no category is open, or wires the Back button when one is. */
function renderCategoryNav(el, tabKey, entries, categoryOf, refreshFn, emptyMessage) {
  const cat = activeCategory[tabKey];
  if (entries.length === 0) {
    el.innerHTML = `<p>${emptyMessage}</p>`;
    return { show: false, items: [] };
  }
  if (!cat) {
    el.innerHTML = `<div class="category-grid">${categoryTilesHtml(entries, categoryOf)}</div>`;
    el.querySelectorAll('[data-category]').forEach((btn) => {
      btn.addEventListener('click', () => { activeCategory[tabKey] = btn.dataset.category; refreshFn(); });
    });
    return { show: false, items: [] };
  }
  const meta = categoryMeta(cat);
  const backHtml = `<button class="pixel-btn category-back-btn" data-back>← Back · ${meta.icon} ${meta.name}</button>`;
  return { show: true, items: entries.filter((e) => categoryOf(e) === cat), backHtml, wireBack: (htmlEl) => {
    htmlEl.querySelector('[data-back]').addEventListener('click', () => { activeCategory[tabKey] = null; refreshFn(); });
  } };
}

function refreshShopTab() {
  const el = document.getElementById('shopTab');
  const items = availableCatalogue(state);
  const nav = renderCategoryNav(el, 'shopTab', items, (i) => i.category, refreshShopTab, 'No items available.');
  if (!nav.show) return;
  el.innerHTML = nav.backHtml + nav.items.map((item) => `
    <div class="shop-item">
      ${itemIconImg(item)}
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
        <div>💰 ${item.price}${item.unlocked ? '' : ' <span class="locked-tag">locked</span>'}</div>
      </div>
      <div class="item-actions">
        <button class="pixel-btn" data-buy="${item.id}" ${item.unlocked && state.coins >= item.price ? '' : 'disabled'}>Buy</button>
      </div>
    </div>`).join('');
  nav.wireBack(el);
  el.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isVisitingFriendRoom()) { showToast("You're just visiting — nothing here can be edited."); return; }
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
  const map = { seating: '#caa05a', beds: '#caa05a', decor: '#8fd0ff' };
  return map[item.category] || '#888';
}

function refreshBagTab() {
  const el = document.getElementById('bagTab');
  const nav = renderCategoryNav(
    el, 'bagTab', state.inventory, (inv) => getCatalogueItem(inv.itemId).category,
    refreshBagTab, 'No unplaced items. Buy something from the Shop tab!',
  );
  if (!nav.show) return;
  el.innerHTML = nav.backHtml + nav.items.map((inv) => {
    const item = getCatalogueItem(inv.itemId);
    return `
    <div class="bag-item">
      ${itemIconImg(item)}
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="pixel-btn" data-place="${inv.instanceId}:${inv.itemId}">Place</button>
      </div>
    </div>`;
  }).join('');
  nav.wireBack(el);
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
  const readOnly = isVisitingFriendRoom();
  const nav = renderCategoryNav(
    el, 'roomTab', roomRuntime.placed, (p) => getCatalogueItem(p.itemId).category,
    refreshRoomTab, 'Nothing placed in this room yet.',
  );
  if (!nav.show) return;
  el.innerHTML = nav.backHtml + nav.items.map((p) => {
    const item = getCatalogueItem(p.itemId);
    return `
    <div class="room-item">
      ${itemIconImg(item)}
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
      </div>
      <div class="item-actions">
        ${readOnly ? '' : `
        <button class="pixel-btn" data-move="${p.instanceId}:${p.itemId}">Move</button>
        <button class="pixel-btn" data-pickup="${p.instanceId}">Pick up</button>`}
      </div>
    </div>`;
  }).join('');
  nav.wireBack(el);
  el.querySelectorAll('[data-pickup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isVisitingFriendRoom()) { showToast("You're just visiting — nothing here can be edited."); return; }
      pickupItem(state, roomRuntime, btn.dataset.pickup);
      refreshRoomTab();
      refreshBagTab();
      autoSave();
      if (state.player.room === 'myroom') publishOwnRoomSnapshot(state.rooms.myroom.placed);
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
  if (typeof state.settings.masterVolume !== 'number') state.settings.masterVolume = 0.85;
  if (typeof state.settings.ambienceVolume !== 'number') state.settings.ambienceVolume = 0.65;
  if (typeof state.settings.ambienceMuted !== 'boolean') state.settings.ambienceMuted = false;
  if (typeof state.settings.autoFollowRoom !== 'boolean') state.settings.autoFollowRoom = true;
  if (typeof state.settings.playerMinimized !== 'boolean') state.settings.playerMinimized = false;
  state.settings.muted = !!(state.settings.musicMuted && state.settings.sfxMuted);
}

function applyPlayerMinimized() {
  const isMin = !!state.settings.playerMinimized;
  const player = document.getElementById('musicPlayer');
  if (player) player.classList.toggle('minimized', isMin);
  const btn = document.getElementById('mpCollapse');
  if (btn) {
    btn.textContent = isMin ? '▲' : '▼';
    btn.title = isMin ? 'Expand Player' : 'Minimise Player';
  }
}

let lastMusicPlayerRefresh = 0;
function refreshMusicPlayerThrottled(now) {
  if (now - lastMusicPlayerRefresh < 220) return;
  lastMusicPlayerRefresh = now;
  refreshMusicPlayer();
}

let isSeekingProgressBar = false;

function refreshMusicPlayer() {
  const info = audio.getMoodInfo();
  const title = document.getElementById('mpTitle');
  const subtitle = document.getElementById('mpSubtitle');
  if (title) title.textContent = info.label;
  if (subtitle) subtitle.textContent = `${currentRoomDef().name} • ${info.genre}`;
  const cassetteTitle = document.getElementById('mpCassetteTitle');
  if (cassetteTitle) cassetteTitle.textContent = info.label;
  const playBtn = document.getElementById('mpPlayPause');
  if (playBtn) playBtn.textContent = info.playing ? '⏸' : '▶';
  const autoBtn = document.getElementById('mpAutoFollow');
  if (autoBtn) {
    autoBtn.classList.toggle('active', info.autoFollowRoom);
    autoBtn.textContent = info.autoFollowRoom ? 'Auto: Room' : 'Manual';
  }
  const shuffleBtn = document.getElementById('mpShuffle');
  if (shuffleBtn) {
    shuffleBtn.classList.toggle('active', !!info.shuffle);
  }
  if (!isSeekingProgressBar) {
    const cur = audio.getCurrentTime();
    const dur = audio.getDuration();
    const pct = dur > 0 ? Math.max(0, Math.min(100, (cur / dur) * 100)) : 0;
    const fill = document.getElementById('mpProgressFill');
    if (fill) fill.style.width = `${pct}%`;
    const thumb = document.getElementById('mpProgressThumb');
    if (thumb) thumb.style.left = `${pct}%`;
    const timeCur = document.getElementById('mpTimeCurrent');
    if (timeCur) timeCur.textContent = formatTime(cur);
    const timeTot = document.getElementById('mpTimeTotal');
    if (timeTot) timeTot.textContent = formatTime(dur);
    const pBar = document.getElementById('mpProgressBar');
    if (pBar) pBar.setAttribute('aria-valuenow', String(Math.round(pct)));
  }
  const vol = document.getElementById('mpVolume');
  if (vol) vol.value = String(Math.round(state.settings.musicVolume * 100));
  const player = document.getElementById('musicPlayer');
  if (player) {
    player.classList.toggle('playing', info.playing);
    player.classList.toggle('minimized', !!state.settings.playerMinimized);
  }
}

document.getElementById('mpPlayPause')?.addEventListener('click', () => { audio.togglePlayPause(); refreshMusicPlayer(); });
document.getElementById('mpPrev')?.addEventListener('click', () => { audio.prevTrack(); refreshMusicPlayer(); });
document.getElementById('mpNext')?.addEventListener('click', () => { audio.nextTrack(); refreshMusicPlayer(); });
document.getElementById('mpShuffle')?.addEventListener('click', () => {
  const nextShuf = audio.toggleShuffle();
  state.settings.shuffle = nextShuf;
  saveState(window.localStorage, state);
  refreshMusicPlayer();
});
document.getElementById('mpAutoFollow')?.addEventListener('click', () => {
  const nowAuto = !audio.getMoodInfo().autoFollowRoom;
  audio.setAutoFollowRoom(nowAuto);
  state.settings.autoFollowRoom = nowAuto;
  saveState(window.localStorage, state);
  refreshMusicPlayer();
});
document.getElementById('mpVolume')?.addEventListener('input', (e) => {
  const v = Math.max(0, Math.min(1, Number(e.target.value) / 100));
  state.settings.musicVolume = v;
  state.settings.musicMuted = v === 0;
  state.settings.muted = !!(state.settings.musicMuted && state.settings.sfxMuted);
  audio.setMusicMuted(state.settings.musicMuted);
  audio.setMusicVolume(v);
  refreshAudioUi();
  refreshMusicPlayer();
  saveState(window.localStorage, state);
});
document.getElementById('mpCollapse')?.addEventListener('click', () => {
  const player = document.getElementById('musicPlayer');
  if (!player) return;
  const isMin = player.classList.toggle('minimized');
  state.settings.playerMinimized = isMin;
  const btn = document.getElementById('mpCollapse');
  if (btn) {
    btn.textContent = isMin ? '▲' : '▼';
    btn.title = isMin ? 'Expand Player' : 'Minimise Player';
  }
  saveState(window.localStorage, state);
});

// Interactive seek bar (mouse + pointer drag + keyboard)
const pBar = document.getElementById('mpProgressBar');
if (pBar) {
  const doSeek = (e) => {
    const rect = pBar.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekSec = audio.seekRatio(ratio);
    const dur = audio.getDuration();
    const pct = dur > 0 ? (seekSec / dur) * 100 : 0;
    const fill = document.getElementById('mpProgressFill');
    const thumb = document.getElementById('mpProgressThumb');
    const timeCur = document.getElementById('mpTimeCurrent');
    if (fill) fill.style.width = `${pct}%`;
    if (thumb) thumb.style.left = `${pct}%`;
    if (timeCur) timeCur.textContent = formatTime(seekSec);
    pBar.setAttribute('aria-valuenow', String(Math.round(pct)));
  };

  pBar.addEventListener('pointerdown', (e) => {
    isSeekingProgressBar = true;
    try { pBar.setPointerCapture(e.pointerId); } catch (_) {}
    doSeek(e);
  });

  pBar.addEventListener('pointermove', (e) => {
    if (!isSeekingProgressBar) return;
    doSeek(e);
  });

  const onPointerUp = (e) => {
    if (!isSeekingProgressBar) return;
    isSeekingProgressBar = false;
    doSeek(e);
    try { pBar.releasePointerCapture(e.pointerId); } catch (_) {}
    refreshMusicPlayer();
  };

  pBar.addEventListener('pointerup', onPointerUp);
  pBar.addEventListener('pointercancel', onPointerUp);

  pBar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      audio.seek(audio.getCurrentTime() - 5);
      refreshMusicPlayer();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      audio.seek(audio.getCurrentTime() + 5);
      refreshMusicPlayer();
    }
  });
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
  const masterSlider = document.getElementById('masterVolume');
  if (masterSlider) masterSlider.value = String(Math.round(state.settings.masterVolume * 100));
  const ambienceSlider = document.getElementById('ambienceVolume');
  if (ambienceSlider) ambienceSlider.value = String(Math.round(state.settings.ambienceVolume * 100));

  const aMuted = state.settings.masterVolume <= 0;
  const amMuted = state.settings.ambienceMuted || state.settings.ambienceVolume <= 0;
  const masterBtn = document.getElementById('btnPanelMasterMute');
  if (masterBtn) masterBtn.textContent = aMuted ? 'Muted' : 'On';
  const ambienceBtn = document.getElementById('btnPanelAmbienceMute');
  if (ambienceBtn) ambienceBtn.textContent = amMuted ? 'Muted' : 'On';

  const moodEl = document.getElementById('audioMoodLabel');
  if (moodEl) moodEl.textContent = audio.getMoodInfo().label;
  refreshMusicPlayer();
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
document.getElementById('masterVolume')?.addEventListener('input', (e) => {
  const v = Math.max(0, Math.min(1, Number(e.target.value) / 100));
  state.settings.masterVolume = v;
  audio.setMasterVolume(v);
  refreshAudioUi();
  saveState(window.localStorage, state);
});
document.getElementById('ambienceVolume')?.addEventListener('input', (e) => {
  const v = Math.max(0, Math.min(1, Number(e.target.value) / 100));
  state.settings.ambienceVolume = v;
  state.settings.ambienceMuted = v === 0;
  audio.setAmbienceMuted(state.settings.ambienceMuted);
  audio.setAmbienceVolume(v);
  refreshAudioUi();
  saveState(window.localStorage, state);
});
document.getElementById('btnPanelMasterMute')?.addEventListener('click', () => {
  state.settings.masterVolume = state.settings.masterVolume > 0 ? 0 : 0.85;
  audio.setMasterVolume(state.settings.masterVolume);
  refreshAudioUi();
  saveState(window.localStorage, state);
});
document.getElementById('btnPanelAmbienceMute')?.addEventListener('click', () => {
  state.settings.ambienceMuted = !state.settings.ambienceMuted;
  audio.setAmbienceMuted(state.settings.ambienceMuted);
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

let lastEmoteTime = 0;
function toggleEmoteBar(force) {
  const bar = document.getElementById('emoteBar');
  if (!bar) return;
  if (typeof force === 'boolean') {
    bar.classList.toggle('hidden', !force);
  } else {
    bar.classList.toggle('hidden');
  }
}

function triggerEmote(emoteId) {
  if (!EMOTE_IDS.has(emoteId)) return false;
  const now = performance.now();
  if (!isEmoteAllowed(lastEmoteTime, now)) {
    showToast('Emote cooldown (1s)');
    return false;
  }
  lastEmoteTime = now;
  player.emote = emoteId;
  player.emoteUntil = now + EMOTE_DURATION_MS;
  player.emoteFrame = 0;
  player.bubbleText = EMOTE_ICONS[emoteId];
  player.bubbleUntil = now + EMOTE_DURATION_MS;
  audio.playSfx('click');
  toggleEmoteBar(false);
  notifyLocalEmote(emoteId);

  // Nearby NPCs occasionally react when player waves
  if (emoteId === 'wave') {
    for (const n of npcRuntimes) {
      if (n.room !== state.player.room) continue;
      const dist = Math.hypot(n.x - player.x, n.y - player.y);
      if (dist <= 3.5) {
        if (Math.random() < 0.75) {
          setTimeout(() => {
            if (n.room === state.player.room) {
              n.emote = 'wave';
              n.emoteUntil = performance.now() + 2500;
              n.emoteFrame = 0;
              n.bubbleText = '👋';
              n.bubbleUntil = performance.now() + 2500;
            }
          }, 350 + Math.random() * 300);
        }
      }
    }
  }
  return true;
}

// ---------- init ----------

window.__pixelHotel = Object.assign(window.__pixelHotel || {}, {
  getPlayerLook: () => state.player.look || DEFAULT_PLAYER_LOOK,
});

function init() {
  syncCanvasSize();
  syncSettingsState();
  refreshCoins();
  updateRoomLabel();
  refreshElevatorPanel();
  recenterCamera(player.x, player.y, ui.camera.zoom);
  updateZoomLabel();
  audio.configure(state.settings);
  audio.setAutoFollowRoom(state.settings.autoFollowRoom);
  audio.onTrackChange = () => refreshMusicPlayer();
  audio.setRoomMood(state.player.room, ui.phase, currentRoomDef().floor || 1);
  refreshAudioUi();
  applyPlayerMinimized();
  if (!window.localStorage.getItem(HELP_SEEN_KEY)) showHelp();
  initMultiplayerUI({
    switchRoom: (roomId) => switchRoom(roomId),
    getPlayerRoom: () => state.player.room,
    getPlayerOutfit: () => state.player.outfit || 'normal',
    getPlayerLook: () => state.player.look || DEFAULT_PLAYER_LOOK,
    onRemoteChat: (who, text) => pushChatLine(who, text),
    onRemoteEmote: (userId, emote) => {},
    getMyRoomPlaced: () => state.rooms.myroom.placed,
    enterVisitScene: (displayName, roomData) => enterVisitScene(displayName, roomData),
    exitVisitScene: () => exitVisitScene(),
  });
  initArcadeUI({
    getState: () => state,
    getClient: () => ((isMultiplayerLoaded() || (typeof window !== 'undefined' && typeof window.__mpTestClientFactory === 'function')) ? getSupabaseClient() : null),
    showToast: (msg) => showToast(msg),
  });
  initPoolUI({
    getState: () => state,
    getClient: () => getSupabaseClient(),
    showToast: (msg) => showToast(msg),
  });
  initGumballUI({
    getState: () => state,
    save: () => saveState(window.localStorage, state),
    showToast: (msg) => showToast(msg),
    refreshCoins: () => refreshCoins(),
    refreshGumballsTab: () => onGumballCollectionChanged(),
    playSfx: (kind) => audio.playSfx(kind),
    openLibrary: () => openLibraryModal(),
  });
  initTraderUI({
    getState: () => state,
    save: () => saveState(window.localStorage, state),
    showToast: (msg) => showToast(msg),
    onTradeAccepted: () => onGumballCollectionChanged(),
  });
  initLibraryUI({ getState: () => state });
  initAvatarModal({
    getState: () => state,
    getCoins: () => state.coins,
    spendCoins: (cost) => {
      refreshCoins();
      saveState(window.localStorage, state);
    },
    onLookSaved: (look) => {
      state.player.look = look;
      player.look = look;
      state.avatarCustomized = true;
      saveState(window.localStorage, state);
      updateLocalLook(state.player.look);
      showToast('Avatar saved! Looking sharp ✨');
    },
    showToast: (msg) => showToast(msg),
  });

  document.getElementById('btnWardrobe')?.addEventListener('click', () => openAvatarModal());
  document.getElementById('btnEmotes')?.addEventListener('click', () => toggleEmoteBar());
  document.querySelectorAll('.emote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      triggerEmote(btn.dataset.emote);
    });
  });

  const AVATAR_SEEN_KEY = 'pixelHotel.avatarSeen.v1'; // gitleaks:allow
  if (window.localStorage.getItem(HELP_SEEN_KEY)) {
    window.localStorage.setItem(AVATAR_SEEN_KEY, '1');
  }
  document.getElementById('btnHelpClose')?.addEventListener('click', () => {
    if (!state.avatarCustomized && !window.localStorage.getItem(AVATAR_SEEN_KEY)) {
      window.localStorage.setItem(AVATAR_SEEN_KEY, '1');
      openAvatarModal();
    }
  });

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (isTouch) {
    document.body.classList.add('has-touch');
    document.querySelectorAll('.help-action-walk').forEach((el) => { el.textContent = 'Tap a floor tile'; });
    document.querySelectorAll('.help-action-sit').forEach((el) => { el.textContent = 'Tap a chair/sofa/bed'; });
    document.querySelectorAll('.kbd-hint').forEach((el) => { el.style.display = 'none'; });
  }
  requestAnimationFrame(frame);
}
init();

// ---------- debug hooks for tests ----------

window.__pixelHotel = Object.assign(window.__pixelHotel || {}, {
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
      buff: state.player.buff,
      look: state.player.look,
      emote: player.emote,
      bubbleText: (player.bubbleUntil && player.bubbleUntil > performance.now()) ? player.bubbleText : null,
    },
    inventory: state.inventory,
    rooms: state.rooms,
    quests: listQuests(state),
    unlocked: state.unlocked,
    settings: state.settings,
    arcade: state.arcade,
    avatarCustomized: state.avatarCustomized,
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
  getVersion: () => '0.9.1',
  getRemoteMultiplayer: () => getRemoteMultiplayerEntities(performance.now()),
  walkTo: (x, y) => tryWalkPlayer(x, y),
  openAvatarCreator: () => openAvatarModal(),
  closeAvatarCreator: () => closeAvatarModal(),
  triggerEmote: (emote) => triggerEmote(emote),
  getPlayerLook: () => state.player.look || DEFAULT_PLAYER_LOOK,
  interactWith: (itemIdOrInstanceId, immediate = false) => {
    if (itemIdOrInstanceId === 'pool_water' && state.player.outfit !== 'swimsuit') {
      state.player.outfit = 'swimsuit';
      player.outfit = 'swimsuit';
    }
    const roomRuntime = currentRoomRuntime();
    const matches = roomRuntime.placed.filter(
      (p) => p.instanceId === itemIdOrInstanceId || p.itemId === itemIdOrInstanceId,
    );
    for (const placed of matches) {
      if (tryInteractPlayer(placed, immediate)) return true;
    }
    return false;
  },
  upgradeRoom: (tier) => upgradeRoom(tier),
  applyRoomTier: (tier) => {
    applyRoomTier(tier, state);
    updateRoomLabel();
    refreshElevatorPanel();
  },
  setOutfit: (outfit) => {
    state.player.outfit = outfit;
    player.outfit = outfit;
    saveState(window.localStorage, state);
  },
  getOutfit: () => state.player.outfit || 'normal',
  swimLaps: () => startLapSwimming(),
  freeRoamPool: () => freeRoamPool(),
  exitPool: () => exitPool(),
  handleSalonStyle: (style) => handleSalonStyle(style),
  handleSalonColor: (color) => handleSalonColor(color),
  openArcadeGame: (gameId) => openArcadeGame(gameId),
  closeArcadeGame: () => closeArcadeGame(),
  openArcadeLeaderboard: (gameId, scope) => openArcadeLeaderboard(gameId, scope),
  closeArcadeLeaderboard: () => closeArcadeLeaderboard(),
  getArcadeState: () => getActiveArcadeState(),
  getActiveArcadeState: () => getActiveArcadeState(),
  getSupabaseClient: () => ((isMultiplayerLoaded() || (typeof window !== 'undefined' && typeof window.__mpTestClientFactory === 'function')) ? getSupabaseClient() : null),
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
  getCamera: () => ({ ...ui.camera }),
  setZoom: (z) => { setZoomAtPoint(z, ui.cssW / 2, ui.cssH / 2); },
  resetZoom: () => resetZoom(),
  screenToTile: (x, y) => pickTileAt(x, y),
  tileToScreen: (x, y) => {
    const room = currentRoomDef();
    const { originX, originY } = computeOrigin(room, ui.cssW, ui.cssH);
    const world = tileToScreen(x, y, originX, originY);
    return worldToScreen(world.sx, world.sy, ui.camera, ui.cssW, ui.cssH);
  },
  clickNpc: (npcId) => startNpcDialogue(npcId),
  closeDialogue: () => closeNpcDialogue(),
  getDialogueState: () => ({
    open: !!ui.activeDialogue,
    npcId: ui.activeDialogue?.npcId || null,
    text: document.getElementById('npcDlgText')?.textContent || '',
  }),
  getMusicPlayerState: () => ({
    title: document.getElementById('mpTitle')?.textContent || '',
    subtitle: document.getElementById('mpSubtitle')?.textContent || '',
    playing: !audio.musicMuted && audio.playing !== false,
    autoFollowRoom: audio.autoFollowRoom,
    info: audio.getMoodInfo(),
    minimized: document.getElementById('musicPlayer')?.classList.contains('minimized') || false,
    shuffle: !!audio.shuffle,
    currentTime: audio.getCurrentTime(),
    duration: audio.getDuration(),
  }),
  seekMusic: (seconds) => {
    const res = audio.seek(seconds);
    refreshMusicPlayer();
    return res;
  },
  seekMusicRatio: (ratio) => {
    const res = audio.seekRatio(ratio);
    refreshMusicPlayer();
    return res;
  },
  getItemIcon: (itemId) => getItemIconDataUrl(itemId, 48, 1),
  simulateMusicFileError: (trackId) => {
    audio._handleFileError(trackId || audio.trackId);
    return audio.getMoodInfo();
  },
});
