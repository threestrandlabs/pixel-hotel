// Floor tiles: 64x32 diamonds, pivot at the tile centre.
import { PixelCanvas, mix } from '../lib/canvas.js';
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

export default function build(add) {
  const cream = r('cream');
  const sand = ['#f7e7cf', '#e8d2b0', '#d2b78f', '#b39570', '#7f6650'];
  add('floor/marble_a', marble(3, cream), [32, 16]);
  add('floor/marble_b', marble(11, sand), [32, 16]);
  add('floor/parquet', parquet(r('walnut')), [32, 16]);
}
