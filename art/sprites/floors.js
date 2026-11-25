// Floor tiles: 64x32 diamonds, pivot at the tile centre.
import { PixelCanvas, mix, bleed } from '../lib/canvas.js';
import { r } from '../palette.js';

const DIAMOND = [[32, 0], [64, 16], [32, 32], [0, 16]];

// Deterministic tiny RNG so tiles are identical on every build.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Tile-local lattice coords (0..1 across the tile) for pixel (x, y).
function uv(x, y) {
  const px = x + 0.5 - 32;
  const py = y + 0.5 - 16;
  return [(px / 32 + py / 16) / 2 + 0.5, (py / 16 - px / 32) / 2 + 0.5];
}

function base(fill) {
  const cv = new PixelCanvas(64, 32);
  cv.poly(DIAMOND, fill);
  return cv;
}

// Grout on the two far edges only, so each shared edge is drawn once.
function grout(cv, color) {
  for (let y = 0; y < 16; y++) {
    let x0 = -1; let x1 = -1;
    for (let x = 0; x < 64; x++) if (cv.opaque(x, y)) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 < 0) continue;
    cv.set(x0, y, color); cv.set(x0 + 1, y, color);
    cv.set(x1, y, color); cv.set(x1 - 1, y, color);
  }
}

function marble(seed, tone) {
  const cv = base(tone[1]);
  const rand = rng(seed);
  // soft cloudy patches
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    if (!cv.opaque(x, y)) continue;
    const [u, v] = uv(x, y);
    const n = Math.sin(u * 9.1 + seed) + Math.sin(v * 7.3 - seed * 0.7) + Math.sin((u + v) * 4.2);
    if (n > 1.6) cv.set(x, y, tone[0]);
    else if (n < -1.9) cv.set(x, y, mix(tone[1], tone[2], 0.5));
  }
  // two hairline veins wandering roughly along the 2:1 diagonal
  for (let k = 0; k < 2; k++) {
    let x = 10 + Math.floor(rand() * 30);
    let y = 6 + Math.floor(rand() * 10);
    const dir = rand() < 0.5 ? 1 : -1;
    for (let i = 0; i < 18; i++) {
      if (cv.opaque(x, y)) cv.set(x, y, tone[2]);
      x += dir * (rand() < 0.75 ? 2 : 1);
      y += rand() < 0.6 ? 1 : 0;
    }
  }
  grout(cv, tone[3]);
  return cv;
}

function parquet(tone) {
  const cv = base(tone[2]);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    if (!cv.opaque(x, y)) continue;
    const [u, v] = uv(x, y);
    // planks run along u; four planks per tile, staggered joints
    const plank = Math.floor(v * 4);
    const along = (u + (plank % 2) * 0.5) % 1;
    if (Math.abs(v * 4 - Math.round(v * 4)) < 0.06) cv.set(x, y, tone[3]);
    else if (along < 0.03) cv.set(x, y, tone[3]);
    else if (plank % 2) cv.set(x, y, mix(tone[2], tone[1], 0.35));
    if ((x * 7 + y * 13) % 29 === 0 && cv.opaque(x, y)) cv.set(x, y, tone[1]);
  }
  grout(cv, tone[4]);
  return cv;
}

// Generic patterned tile: paint(u, v, x, y) -> colour, u/v in 0..1 across the tile.
function patterned(paint, groutColor) {
  const cv = base('#000000');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    if (!cv.opaque(x, y)) continue;
    const [u, v] = uv(x, y);
    cv.set(x, y, paint(u, v, x, y));
  }
  if (groutColor) grout(cv, groutColor);
  return cv;
}

const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h >>> 8) / 16777216;
};

export default function build(addRaw) {
  // every ground tile gets a 1px bleed so tiles overlap instead of leaving seams
  const add = (name, cv) => addRaw(name, bleed(cv), [33, 17]);
  // gym rubber: dark slate with sparse coloured fleck
  add('floor/rubber', patterned((u, v, x, y) => {
    const n = hash(x, y, 1);
    if (n > 0.97) return '#7fb0c8';
    if (n > 0.94) return '#5d6a78';
    return n < 0.05 ? '#3a4350' : '#46505e';
  }, '#323944'), [32, 16]);
  // spa stone: four pale aqua slabs per tile
  add('floor/spa_stone', patterned((u, v, x, y) => {
    const q = (u < 0.5 ? 0 : 1) + (v < 0.5 ? 0 : 2);
    const tones = ['#d9efec', '#cfe8e4', '#c6e2de', '#d3ebe7'];
    const edge = Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.5) < 0.025;
    if (edge) return '#a9cfca';
    return hash(x, y, 2) > 0.93 ? '#e8f7f5' : tones[q];
  }, '#9cc4bf'), [32, 16]);
  // arcade: deep purple with a neon grid
  add('floor/arcade', patterned((u, v, x, y) => {
    if (Math.abs(u - 0.5) < 0.02 || Math.abs(v - 0.5) < 0.02) return '#b05ad8';
    if (hash(x, y, 3) > 0.985) return '#7af0ff';
    return (u < 0.5) === (v < 0.5) ? '#2e2444' : '#352a4e';
  }, '#5a3d8a'), [32, 16]);
  // library carpet: warm red with a small gold diamond motif
  add('floor/carpet', patterned((u, v, x, y) => {
    const du = Math.abs(u - 0.5); const dv = Math.abs(v - 0.5);
    if (du + dv < 0.12) return '#e8b23a';
    if (du + dv < 0.18) return '#7e2a3e';
    if (du > 0.44 || dv > 0.44) return '#6e2436';
    return hash(x, y, 4) > 0.9 ? '#9c3a4e' : '#8a3246';
  }, null), [32, 16]);
  // grass: tufts in three greens
  add('floor/grass', patterned((u, v, x, y) => {
    const n = hash(x, y, 5);
    if (n > 0.9) return '#b8dc7a';
    if (n > 0.6) return '#86c060';
    if (n < 0.12) return '#4f9440';
    return '#6fae50';
  }, null), [32, 16]);
  // rooftop decking: pale weathered planks along u
  add('floor/decking', patterned((u, v, x, y) => {
    const plank = Math.floor(v * 4);
    if (Math.abs(v * 4 - Math.round(v * 4)) < 0.07) return '#8a6a4a';
    const c = plank % 2 ? '#d8b98c' : '#ccab7c';
    return hash(x, y, 6) > 0.95 ? '#b8956a' : c;
  }, '#7a5c40'), [32, 16]);


  const cream = r('cream');
  const sand = ['#f7e7cf', '#e8d2b0', '#d2b78f', '#b39570', '#7f6650'];
  add('floor/marble_a', marble(3, cream), [32, 16]);
  add('floor/marble_b', marble(11, sand), [32, 16]);
  add('floor/parquet', parquet(r('walnut')), [32, 16]);
}
