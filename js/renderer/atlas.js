// Phase 1 Runtime Atlas Loader, Time-Sliced In-Browser Fallback Packer, IndexedDB Cache,
// and Character Dynamic-Atlas Hook (PIXI_MIGRATION_PLAN.md §2.3).

import { setDetail, getDetail } from '../pixelart.js';
import { CATALOGUE, ROOMS } from '../data.js';
import {
  FURNITURE_BUILDERS,
  FLOOR_MATERIALS,
  buildFloorTile,
  buildWallSegment,
  buildWindowSegment,
  buildDoorSegment,
  buildElevatorDoorSegment,
  buildStairwellDoorSegment,
  buildGlassBalustradeSegment,
  buildEdgeRailSegment,
  buildDoorTile,
  buildElevatorTile,
} from '../sprites.js';
import { renderCharacter } from '../voxel.js';

export const ATLAS_DB_NAME = 'pixelHotel.atlasCache.v1';
export const ATLAS_STORE_NAME = 'atlases';
export const MAX_ATLAS_PAGE_DIM = 2048;

export function getAtlasCacheKey(version = '0.13.1', detail = 1) {
  return `v${String(version).replace(/^v/, '')}:detail${Number(detail) || 1}`;
}

// Minimal IndexedDB key-value wrapper with an in-memory Map fallback for headless/Node tests.
const memoryFallbackStore = new Map();

export async function readCachedAtlas(cacheKey, customStore = null) {
  if (customStore && typeof customStore.get === 'function') {
    return customStore.get(cacheKey) || null;
  }
  if (typeof indexedDB === 'undefined') {
    return memoryFallbackStore.get(cacheKey) || null;
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(ATLAS_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ATLAS_STORE_NAME)) {
          db.createObjectStore(ATLAS_STORE_NAME);
        }
      };
      req.onerror = () => resolve(memoryFallbackStore.get(cacheKey) || null);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(ATLAS_STORE_NAME, 'readonly');
          const getReq = tx.objectStore(ATLAS_STORE_NAME).get(cacheKey);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      };
    } catch (_) {
      resolve(memoryFallbackStore.get(cacheKey) || null);
    }
  });
}

export async function writeCachedAtlas(cacheKey, value, customStore = null) {
  if (customStore && typeof customStore.set === 'function') {
    customStore.set(cacheKey, value);
    return true;
  }
  memoryFallbackStore.set(cacheKey, value);
  if (typeof indexedDB === 'undefined') {
    return true;
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(ATLAS_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ATLAS_STORE_NAME)) {
          db.createObjectStore(ATLAS_STORE_NAME);
        }
      };
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(ATLAS_STORE_NAME, 'readwrite');
          tx.objectStore(ATLAS_STORE_NAME).put(value, cacheKey);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (_) {
          resolve(false);
        }
      };
    } catch (_) {
      resolve(false);
    }
  });
}

// Time-sliced in-browser fallback packer (<= budgetMs per slice, default 6ms) used when
// running from a bare checkout without pre-baked atlas/ PNGs.
export async function bakeFallbackAtlasTimeSliced({
  version = '0.13.1',
  detail = 1,
  budgetMs = 6,
  store = null,
  nowFn = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  yieldFn = () => new Promise((r) => setTimeout(r, 0)),
} = {}) {
  const cacheKey = getAtlasCacheKey(version, detail);
  const cached = await readCachedAtlas(cacheKey, store);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const tasks = [];
  for (const key of Object.keys(FURNITURE_BUILDERS).sort()) {
    const fn = FURNITURE_BUILDERS[key];
    for (let rot = 0; rot < 4; rot++) {
      tasks.push({ name: `furn:${key}:${rot}:all`, run: () => fn(rot, 'all') });
      tasks.push({ name: `furn:${key}:${rot}:back`, run: () => fn(rot, 'back') });
      tasks.push({ name: `furn:${key}:${rot}:front`, run: () => fn(rot, 'front') });
    }
  }
  const floorMatList = Array.isArray(FLOOR_MATERIALS) ? FLOOR_MATERIALS : Object.keys(FLOOR_MATERIALS);
  for (const mat of [...floorMatList].sort()) {
    tasks.push({ name: `floor:mat:${mat}:0:0`, run: () => buildFloorTile('#e8dcc8', '#dfd2bc', 0, 0, mat) });
  }
  for (const dir of ['north', 'west']) {
    tasks.push({ name: `wall:default:${dir}`, run: () => buildWallSegment('#d8d0c4', dir) });
    tasks.push({ name: `window:default:${dir}`, run: () => buildWindowSegment('#d8d0c4', dir, '#78b0d8') });
    tasks.push({ name: `door:default:${dir}`, run: () => buildDoorSegment('#d8d0c4', dir) });
    tasks.push({ name: `elevator_door:default:${dir}`, run: () => buildElevatorDoorSegment('#d8d0c4', dir) });
    tasks.push({ name: `stairwell_door:default:${dir}`, run: () => buildStairwellDoorSegment('#d8d0c4', dir) });
    tasks.push({ name: `balustrade:default:${dir}`, run: () => buildGlassBalustradeSegment('#d8d0c4', dir) });
    tasks.push({ name: `edge_rail:default:${dir}`, run: () => buildEdgeRailSegment('#d8d0c4', dir) });
  }
  tasks.push({ name: 'tile:door', run: () => buildDoorTile() });
  tasks.push({ name: 'tile:elevator', run: () => buildElevatorTile() });

  const frames = {};
  let curX = 2;
  let curY = 2;
  let shelfH = 0;
  let pageIndex = 0;
  let sliceCount = 1;
  let sliceStart = nowFn();

  for (let i = 0; i < tasks.length; i++) {
    const prevDetail = getDetail();
    setDetail(detail);
    let spr;
    try {
      spr = tasks[i].run();
    } finally {
      setDetail(prevDetail);
    }
    const w = Math.max(1, spr?.w || 1);
    const h = Math.max(1, spr?.h || 1);
    const ax = typeof spr?.ax === 'number' ? spr.ax : Math.round(w / 2);
    const ay = typeof spr?.ay === 'number' ? spr.ay : Math.round(h / 2);

    if (curX + w + 2 > MAX_ATLAS_PAGE_DIM) {
      curX = 2;
      curY += shelfH + 2;
      shelfH = 0;
    }
    if (curY + h + 2 > MAX_ATLAS_PAGE_DIM) {
      pageIndex++;
      curX = 2;
      curY = 2;
      shelfH = 0;
    }
    frames[tasks[i].name] = {
      pageIndex,
      frame: { x: curX, y: curY, w, h },
      anchor: { x: Number((ax / w).toFixed(6)), y: Number((ay / h).toFixed(6)) },
      pivot: { x: ax, y: ay },
    };
    curX += w + 2;
    if (h > shelfH) shelfH = h;

    if (nowFn() - sliceStart >= budgetMs && i + 1 < tasks.length) {
      sliceCount++;
      await yieldFn();
      sliceStart = nowFn();
    }
  }

  for (const item of CATALOGUE) {
    const spriteKey = item.spriteKey || item.sprite || item.id;
    for (let rot = 0; rot < 4; rot++) {
      for (const layer of ['all', 'back', 'front']) {
        const src = frames[`furn:${spriteKey}:${rot}:${layer}`];
        if (src && !frames[`furn:${item.id}:${rot}:${layer}`]) {
          frames[`furn:${item.id}:${rot}:${layer}`] = { ...src };
        }
      }
    }
    const base = frames[`furn:${spriteKey}:0:all`];
    if (base) {
      frames[`icon:${item.id}`] = { ...base };
    }
  }

  const baked = {
    cacheKey,
    version,
    detail,
    pageCount: pageIndex + 1,
    frameCount: Object.keys(frames).length,
    sliceCount,
    frames,
    fromCache: false,
  };
  await writeCachedAtlas(cacheKey, baked, store);
  return baked;
}

function defaultMakeCanvas(w, h) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return {
    width: w,
    height: h,
    getContext() {
      return {
        imageSmoothingEnabled: false,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        globalAlpha: 1,
        clearRect() {},
        fillRect() {},
        strokeRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() {},
        stroke() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        setTransform() {},
      };
    },
  };
}

// Runtime Character Dynamic-Atlas Hook (PIXI_MIGRATION_PLAN.md §2.3 / B11).
// Bounded LRU dynamic atlas keyed by look + facing + pose + detail.
export class CharacterDynamicAtlas {
  constructor({ maxEntries = 256, pageSize = MAX_ATLAS_PAGE_DIM, makeCanvas = defaultMakeCanvas } = {}) {
    this.maxEntries = maxEntries;
    this.pageSize = pageSize;
    this.makeCanvas = makeCanvas;
    this.entries = new Map(); // key -> { key, w, h, ox, oy, pageX, pageY, detail, spr }
    this.curX = 2;
    this.curY = 2;
    this.shelfH = 0;
    this.evictions = 0;
  }

  buildKey(lookKey, dir, poseKey, detail = getDetail()) {
    return `char:${lookKey || 'default'}:${dir || 'down'}:${poseKey || 'idle'}:d${detail}`;
  }

  getOrBake(key, look, dir = 'down', pose = {}, detail = getDetail()) {
    if (this.entries.has(key)) {
      const existing = this.entries.get(key);
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      this.entries.delete(oldestKey);
      this.evictions++;
    }
    const prevDetail = getDetail();
    setDetail(detail);
    let spr;
    try {
      spr = renderCharacter(look, dir, pose, this.makeCanvas, 1);
    } finally {
      setDetail(prevDetail);
    }
    const w = Math.max(1, spr?.canvas?.width || spr?.w || 1);
    const h = Math.max(1, spr?.canvas?.height || spr?.h || 1);
    const ox = typeof spr?.ox === 'number' ? spr.ox : Math.round(w / 2);
    const oy = typeof spr?.oy === 'number' ? spr.oy : Math.round(h * 0.85);

    if (this.curX + w + 2 > this.pageSize) {
      this.curX = 2;
      this.curY += this.shelfH + 2;
      this.shelfH = 0;
    }
    if (this.curY + h + 2 > this.pageSize) {
      this.curX = 2;
      this.curY = 2;
      this.shelfH = 0;
    }
    const entry = {
      key,
      w,
      h,
      ox,
      oy,
      anchor: { x: Number((ox / w).toFixed(6)), y: Number((oy / h).toFixed(6)) },
      pageRect: { x: this.curX, y: this.curY, w, h },
      detail,
      spr,
    };
    this.curX += w + 2;
    if (h > this.shelfH) this.shelfH = h;
    this.entries.set(key, entry);
    return entry;
  }

  clear() {
    this.entries.clear();
    this.curX = 2;
    this.curY = 2;
    this.shelfH = 0;
  }

  stats() {
    return {
      size: this.entries.size,
      maxEntries: this.maxEntries,
      pageSize: this.pageSize,
      evictions: this.evictions,
    };
  }
}

export function createCharacterAtlas(opts = {}) {
  return new CharacterDynamicAtlas(opts);
}
