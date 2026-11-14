// Unit tests for Pixel Hotel v0.12.0 weather/time-of-day system:
// deterministic weather picker and the time-of-day sky mapping.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WEATHER_TYPES, getWeatherState, pickWeatherFromSeed, timeOfDayForHour,
  skyPaletteForTimeOfDay, getSingaporeParts, mulberry32,
} from '../js/weather.js';

test('getWeatherState is deterministic for the same real-time block', () => {
  const a = getWeatherState(new Date('2026-03-05T10:15:00+08:00'));
  const b = getWeatherState(new Date('2026-03-05T11:59:00+08:00'));
  assert.equal(a.weather, b.weather);
  assert.equal(a.seedKey, b.seedKey);
  assert.equal(a.timeOfDay, b.timeOfDay);
});

test('getWeatherState changes seed key across 3-hour blocks', () => {
  const a = getWeatherState(new Date('2026-03-05T10:00:00+08:00'));
  const b = getWeatherState(new Date('2026-03-05T13:00:00+08:00'));
  assert.notEqual(a.seedKey, b.seedKey);
});

test('getWeatherState changes seed key across days', () => {
  const a = getWeatherState(new Date('2026-03-05T10:00:00+08:00'));
  const b = getWeatherState(new Date('2026-03-06T10:00:00+08:00'));
  assert.notEqual(a.seedKey, b.seedKey);
});

test('all weather types are reachable from some seed', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(pickWeatherFromSeed(i * 2654435761));
  for (const type of WEATHER_TYPES) assert.ok(seen.has(type), `missing weather type: ${type}`);
});

test('snow is rare across a large deterministic sample', () => {
  let snowCount = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) {
    if (pickWeatherFromSeed(i * 2654435761 + 7) === 'snow') snowCount++;
  }
  const frac = snowCount / N;
  assert.ok(frac > 0, 'snow should occur at least sometimes');
  assert.ok(frac < 0.08, `snow should be rare, got frac=${frac}`);
});

test('mulberry32 is a deterministic pure PRNG', () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  const seq1 = [r1(), r1(), r1()];
  const seq2 = [r2(), r2(), r2()];
  assert.deepEqual(seq1, seq2);
});

test('timeOfDayForHour maps hours to dawn/day/sunset/night with full 24h coverage', () => {
  const buckets = new Set();
  for (let h = 0; h < 24; h++) buckets.add(timeOfDayForHour(h));
  assert.deepEqual([...buckets].sort(), ['dawn', 'day', 'night', 'sunset']);
  assert.equal(timeOfDayForHour(6), 'dawn');
  assert.equal(timeOfDayForHour(12), 'day');
  assert.equal(timeOfDayForHour(18), 'sunset');
  assert.equal(timeOfDayForHour(2), 'night');
  assert.equal(timeOfDayForHour(23), 'night');
});

test('skyPaletteForTimeOfDay returns distinct palettes with night showing stars', () => {
  const day = skyPaletteForTimeOfDay('day');
  const night = skyPaletteForTimeOfDay('night');
  assert.ok(day.top && night.top);
  assert.notEqual(day.top, night.top);
  assert.equal(night.stars, true);
  assert.equal(day.stars, false);
  assert.equal(night.windowsLit, true);
  assert.equal(day.windowsLit, false);
});

test('getSingaporeParts extracts a 0-23 hour and zero-padded date parts', () => {
  const { year, month, day, hour } = getSingaporeParts(new Date('2026-01-01T00:30:00+08:00'));
  assert.equal(year, '2026');
  assert.equal(month, '01');
  assert.equal(day, '01');
  assert.ok(hour >= 0 && hour <= 23);
});

// ---------- v0.12.0 Sky viewing platforms: catalogue + viewer interaction ----------

import { getCatalogueItem, SEED_FURNITURE } from '../js/data.js';
import { FURNITURE_BUILDERS } from '../js/sprites.js';
import { CITY_DEFS, renderCityCanvas, drawWeatherOverlay } from '../js/viewer.js';

const SKY_VIEWER_IDS = ['sky_viewer_nyc', 'sky_viewer_singapore', 'sky_viewer_tokyo', 'sky_viewer_paris'];

test('catalogue: all 4 sky viewers are walk-up-and-use, mapped to a valid city and sprite', () => {
  for (const id of SKY_VIEWER_IDS) {
    const item = getCatalogueItem(id);
    assert.ok(item, `missing catalogue item ${id}`);
    assert.equal(item.interaction, 'city_view');
    assert.ok(CITY_DEFS[item.city], `item ${id} references unknown city ${item.city}`);
    assert.equal(item.spriteKey, 'skyViewer');
    assert.equal(typeof FURNITURE_BUILDERS[item.spriteKey], 'function');
    assert.equal(item.seat, false);
  }
});

test('seed furniture: Rooftop has all 4 city viewers and Sky Garden has at least one', () => {
  const rooftopIds = SEED_FURNITURE.rooftop.map((f) => f.itemId);
  for (const id of SKY_VIEWER_IDS) assert.ok(rooftopIds.includes(id), `rooftop missing ${id}`);
  const skyGardenIds = SEED_FURNITURE.garden.map((f) => f.itemId);
  assert.ok(SKY_VIEWER_IDS.some((id) => skyGardenIds.includes(id)), 'sky garden should have at least one sky viewer');
});

function stubCtx() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return {
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop,
    arc: noop, ellipse: noop, quadraticCurveTo: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    setTransform: noop,
    set fillStyle(v) {}, get fillStyle() { return '#000'; },
    set strokeStyle(v) {}, get strokeStyle() { return '#000'; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
  };
}

test('viewer: renderCityCanvas draws every city for every weather type without throwing', () => {
  for (const cityId of Object.keys(CITY_DEFS)) {
    for (const weatherType of ['clear', 'cloudy', 'rain', 'thunderstorm', 'fog', 'snow']) {
      const ctx = stubCtx();
      const weather = { weather: weatherType, timeOfDay: 'day' };
      const panState = {};
      assert.doesNotThrow(() => renderCityCanvas(ctx, 320, 200, cityId, panState, 1000, weather, true));
      assert.doesNotThrow(() => renderCityCanvas(ctx, 320, 200, cityId, panState, 1000, weather, false));
    }
  }
});

test('viewer: drawWeatherOverlay handles every weather type and every time of day', () => {
  for (const weatherType of ['clear', 'cloudy', 'rain', 'thunderstorm', 'fog', 'snow']) {
    for (const timeOfDay of ['dawn', 'day', 'sunset', 'night']) {
      const ctx = stubCtx();
      assert.doesNotThrow(() => drawWeatherOverlay(ctx, 320, 200, { weather: weatherType, timeOfDay }, 1000, 0.55));
    }
  }
});
