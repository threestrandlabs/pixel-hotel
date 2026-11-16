import test from 'node:test';
import assert from 'node:assert/strict';
import { FpsMonitor, resolveBackgroundDetail, resolveSpriteDetail, resolveSpriteDetailMode } from '../js/adaptiveQuality.js';
import { createDefaultState, loadState, saveState, SAVE_KEY } from '../js/save.js';
import { SAVE_VERSION } from '../js/data.js';
import { setDetail, registerCacheClearHook } from '../js/pixelart.js';
import { LOOKS, getCharacterCanvas, clearCharacterCache, getCharacterCacheSize, MAX_CHARACTER_CACHE_SIZE } from '../js/voxel.js';

function makeFakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

test('adaptive quality: FpsMonitor stays false when fps is healthy (~60 fps)', () => {
  const monitor = new FpsMonitor(2000, 45);
  let now = 1000;
  // 120 frames at 60 fps (16.6ms apart)
  for (let i = 0; i < 120; i++) {
    now += 16.6;
    monitor.recordFrame(now);
  }
  assert.equal(monitor.isTriggered(), false);
  assert.ok(monitor.getAverageFps() > 55);
});

test('adaptive quality: FpsMonitor triggers when avg fps < 45 for ~2s', () => {
  const monitor = new FpsMonitor(2000, 45);
  let now = 1000;
  // 60 frames at 30 fps (33.3ms apart, span ~2000ms)
  for (let i = 0; i < 62; i++) {
    now += 33.3;
    monitor.recordFrame(now);
  }
  assert.equal(monitor.isTriggered(), true);
  assert.ok(monitor.getAverageFps() < 35);
});

test('adaptive quality: FpsMonitor does not trigger before sufficient time window is sampled', () => {
  const monitor = new FpsMonitor(2000, 45);
  let now = 1000;
  // Only 3 frames at 20 fps (50ms apart, total elapsed only 150ms)
  for (let i = 0; i < 3; i++) {
    now += 50;
    monitor.recordFrame(now);
  }
  assert.equal(monitor.isTriggered(), false);
});

test('adaptive quality: FpsMonitor.reset clears samples and trigger', () => {
  const monitor = new FpsMonitor(2000, 45);
  let now = 1000;
  for (let i = 0; i < 62; i++) {
    now += 33.3;
    monitor.recordFrame(now);
  }
  assert.equal(monitor.isTriggered(), true);
  monitor.reset();
  assert.equal(monitor.isTriggered(), false);
});

test('adaptive quality: resolveBackgroundDetail handles auto, high, and low modes', () => {
  // Explicit high setting: always high
  assert.equal(resolveBackgroundDetail('high', false, false), 'high');
  assert.equal(resolveBackgroundDetail('high', true, false), 'high');
  assert.equal(resolveBackgroundDetail('high', true, true), 'high');

  // Explicit low setting: always low
  assert.equal(resolveBackgroundDetail('low', false, false), 'low');
  assert.equal(resolveBackgroundDetail('low', false, true), 'low');

  // Auto setting:
  // Desktop + healthy fps -> high
  assert.equal(resolveBackgroundDetail('auto', false, false), 'high');
  // Desktop + low fps triggered -> low
  assert.equal(resolveBackgroundDetail('auto', true, false), 'low');
  // Mobile emulation/device -> low
  assert.equal(resolveBackgroundDetail('auto', false, true), 'low');
  assert.equal(resolveBackgroundDetail('auto', true, true), 'low');
});

test('settings persistence: backgroundDetail defaults to auto and persists in saveState', () => {
  const storage = makeFakeStorage();
  const state = createDefaultState();
  assert.equal(state.settings.backgroundDetail, 'auto');
  assert.equal(state.version, SAVE_VERSION);

  // Modify and persist
  state.settings.backgroundDetail = 'high';
  saveState(storage, state);

  const loaded = loadState(storage);
  assert.equal(loaded.settings.backgroundDetail, 'high');
  assert.equal(loaded.version, SAVE_VERSION);
});

test('save migration: migrates v13 save to v14 with backgroundDetail default auto', () => {
  const storage = makeFakeStorage();
  const oldV13 = {
    version: 13,
    coins: 100,
    unlocked: [],
    inventory: [],
    rooms: { lobby: { placed: [], lightsOn: true } },
    quests: {},
    player: { room: 'lobby', x: 5, y: 5 },
    settings: {
      muted: false,
      musicMuted: false,
      sfxMuted: false,
      followCamera: false,
    },
  };
  storage.setItem(SAVE_KEY, JSON.stringify(oldV13));

  const migrated = loadState(storage);
  assert.equal(migrated.version, 14);
  assert.equal(migrated.settings.backgroundDetail, 'auto');
});

test('adaptive quality: resolveSpriteDetail maps auto/high/low to DETAIL 1 or 2', () => {
  // Explicit high setting: always 2
  assert.equal(resolveSpriteDetail('high', false, false), 2);
  assert.equal(resolveSpriteDetail('high', true, false), 2);
  assert.equal(resolveSpriteDetail('high', false, true), 2);
  assert.equal(resolveSpriteDetail('high', true, true), 2);
  assert.equal(resolveSpriteDetailMode('high'), 'high');

  // Explicit low setting: always 1
  assert.equal(resolveSpriteDetail('low', false, false), 1);
  assert.equal(resolveSpriteDetail('low', true, false), 1);
  assert.equal(resolveSpriteDetail('low', false, true), 1);
  assert.equal(resolveSpriteDetail('low', true, true), 1);
  assert.equal(resolveSpriteDetailMode('low'), 'low');

  // Auto setting:
  // Desktop + healthy fps -> 2 (high)
  assert.equal(resolveSpriteDetail('auto', false, false), 2);
  assert.equal(resolveSpriteDetailMode('auto', false, false), 'high');

  // Desktop + low fps triggered -> 1 (low)
  assert.equal(resolveSpriteDetail('auto', true, false), 1);
  assert.equal(resolveSpriteDetailMode('auto', true, false), 'low');

  // Mobile -> 1 (low)
  assert.equal(resolveSpriteDetail('auto', false, true), 1);
  assert.equal(resolveSpriteDetail('auto', true, true), 1);
  assert.equal(resolveSpriteDetailMode('auto', false, true), 'low');
});

test('settings persistence: spriteDetail defaults to auto and persists in saveState', () => {
  const storage = makeFakeStorage();
  const state = createDefaultState();
  assert.equal(state.settings.spriteDetail, 'auto');

  // Modify to high and persist
  state.settings.spriteDetail = 'high';
  saveState(storage, state);

  const loaded = loadState(storage);
  assert.equal(loaded.settings.spriteDetail, 'high');

  // Modify to low and persist
  state.settings.spriteDetail = 'low';
  saveState(storage, state);

  const loadedLow = loadState(storage);
  assert.equal(loadedLow.settings.spriteDetail, 'low');
});

test('adaptive quality: switching detail triggers exactly one cache clear/rebuild', () => {
  setDetail(1);
  let clearCount = 0;
  const unregister = registerCacheClearHook(() => {
    clearCount += 1;
  });

  // Re-applying same detail: zero cache clears
  setDetail(1);
  assert.equal(clearCount, 0);

  // Switching to DETAIL=2: exactly one cache clear
  setDetail(2);
  assert.equal(clearCount, 1);

  // Simulating successive frames at DETAIL=2 without change: zero additional clears
  for (let frame = 0; frame < 60; frame++) {
    setDetail(2);
  }
  assert.equal(clearCount, 1);

  // Switching back to DETAIL=1: exactly one more cache clear
  setDetail(1);
  assert.equal(clearCount, 2);

  unregister();
});

test('perf guard: character sprite cache stays bounded under fixed LRU cap (MAX_CHARACTER_CACHE_SIZE)', () => {
  const realDocument = global.document;
  global.document = {
    createElement(tag) {
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => ({
        setTransform() {},
        clearRect() {},
        drawImage() {},
        save() {},
        restore() {},
        beginPath() {},
        closePath() {},
        clip() {},
        rect() {},
        moveTo() {},
        lineTo() {},
        fill() {},
        stroke() {},
        fillRect() {},
        globalCompositeOperation: 'source-over',
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
      });
      return canvas;
    },
  };

  try {
    clearCharacterCache();
    assert.equal(getCharacterCacheSize(), 0);

    const baseLook = LOOKS.player;
    const pose = { stride: 0, sit: false, lie: false, blink: false, breathe: 0 };

    // Fill the cache up to MAX_CHARACTER_CACHE_SIZE (256)
    for (let i = 0; i < MAX_CHARACTER_CACHE_SIZE; i++) {
      getCharacterCanvas(`test_key_${i}`, baseLook, 'down', pose, 1);
    }
    assert.equal(getCharacterCacheSize(), MAX_CHARACTER_CACHE_SIZE);

    // Add 50 more distinct items: LRU eviction must keep size <= MAX_CHARACTER_CACHE_SIZE
    for (let i = 0; i < 50; i++) {
      getCharacterCanvas(`overflow_key_${i}`, baseLook, 'down', pose, 1);
      assert.ok(getCharacterCacheSize() <= MAX_CHARACTER_CACHE_SIZE, `Cache size ${getCharacterCacheSize()} must not exceed ${MAX_CHARACTER_CACHE_SIZE}`);
    }
    assert.equal(getCharacterCacheSize(), MAX_CHARACTER_CACHE_SIZE);

    // Oldest key `test_key_0` was evicted
    clearCharacterCache();
    assert.equal(getCharacterCacheSize(), 0);
  } finally {
    global.document = realDocument;
  }
});
