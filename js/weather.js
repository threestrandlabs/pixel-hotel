// Deterministic real-time weather + time-of-day, seeded by the Asia/Singapore
// local date and 3-hour block so every client (and every re-render) agrees
// without any network round-trip.

export const TIMEZONE = 'Asia/Singapore';
export const WEATHER_TYPES = ['clear', 'cloudy', 'rain', 'thunderstorm', 'fog', 'snow'];
const WEATHER_WEIGHTS = [38, 26, 16, 8, 9, 3]; // sums to 100; snow is rare

export const WEATHER_ICONS = {
  clear: '☀️', cloudy: '☁️', rain: '🌧️', thunderstorm: '⛈️', fog: '🌫️', snow: '❄️',
};

export const WEATHER_LABELS = {
  clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', thunderstorm: 'Thunderstorm', fog: 'Fog', snow: 'Snow',
};

const SKY_PALETTES = {
  dawn: { top: '#2b3a67', mid: '#e8896a', bottom: '#ffd9a0', stars: false, starsFade: true, windowsLit: true, sunGlow: true },
  day: { top: '#4fa8e0', mid: '#9fd4ec', bottom: '#dff2f8', stars: false, starsFade: false, windowsLit: false, sunGlow: false },
  sunset: { top: '#2c2a55', mid: '#e3663f', bottom: '#ffb15c', stars: false, starsFade: true, windowsLit: true, sunGlow: true },
  night: { top: '#060a1e', mid: '#0c1538', bottom: '#1b2550', stars: true, starsFade: false, windowsLit: true, sunGlow: false },
};

// FNV-1a: small, stable, dependency-free string hash.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeatherFromSeed(seed) {
  const roll = mulberry32(seed)() * 100;
  let acc = 0;
  for (let i = 0; i < WEATHER_TYPES.length; i++) {
    acc += WEATHER_WEIGHTS[i];
    if (roll < acc) return WEATHER_TYPES[i];
  }
  return WEATHER_TYPES[WEATHER_TYPES.length - 1];
}

export function getSingaporeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return { year: map.year, month: map.month, day: map.day, hour };
}

export function timeOfDayForHour(hour) {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'sunset';
  return 'night';
}

export function skyPaletteForTimeOfDay(timeOfDay) {
  return SKY_PALETTES[timeOfDay] || SKY_PALETTES.day;
}

// Seeded per real-world date + 3-hour window in Asia/Singapore local time:
// same wall-clock block always resolves to the same weather for every player.
export function getWeatherState(date = new Date()) {
  const { year, month, day, hour } = getSingaporeParts(date);
  const blockIndex = Math.floor(hour / 3);
  const dateStr = `${year}-${month}-${day}`;
  const seedKey = `${dateStr}#${blockIndex}`;
  const seed = fnv1a(seedKey);
  return {
    dateStr,
    blockIndex,
    hour,
    seedKey,
    seed,
    weather: pickWeatherFromSeed(seed),
    timeOfDay: timeOfDayForHour(hour),
  };
}
