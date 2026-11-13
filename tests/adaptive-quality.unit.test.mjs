import test from 'node:test';
import assert from 'node:assert/strict';
import { FpsMonitor, resolveBackgroundDetail } from '../js/adaptiveQuality.js';
import { createDefaultState, loadState, saveState, SAVE_KEY } from '../js/save.js';
import { SAVE_VERSION } from '../js/data.js';

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
