// Pool water: 8-frame animated tile that repeats seamlessly across the iso
// lattice, plus rim overlays for each edge of a pool tile.
import { PixelCanvas, mix, bleed } from '../lib/canvas.js';
import { r } from '../palette.js';

const DIAMOND = [[32, 0], [64, 16], [32, 32], [0, 16]];
const FRAMES = 8;
const TAU = Math.PI * 2;

// Tile-local lattice coords in [0,1) for pixel (x, y).
function uv(x, y) {
  const px = x + 0.5 - 32;
  const py = y + 0.5 - 16;
  return [(px / 32 + py / 16) / 2 + 0.5, (py / 16 - px / 32) / 2 + 0.5];
}

// The pattern repeats every 2x2 tiles (half-integer lattice frequencies), so
// each frame comes in four parity variants: pu = x & 1, pv = y & 1.
function waterFrame(f, pu, pv) {
  const w = r('water');
  const cv = new PixelCanvas(64, 32);
  cv.poly(DIAMOND, w[2]);
  const ph = (f / FRAMES) * TAU;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    if (!cv.opaque(x, y)) continue;
    const [lu, lv] = uv(x, y);
    const u = lu + pu;
    const v = lv + pv;
    // Calm water: two broad, slow swells. Only their crests and troughs are
    // tinted, a step from the base colour, so the surface reads as gently
    // moving rather than sparkling.
    const a = Math.sin(TAU * (u + 0.5 * v) + ph);
    const b = Math.sin(TAU * (0.5 * u - v) - ph);
    const n = a + b;
    if (n > 1.6) cv.set(x, y, mix(w[2], w[1], 0.55));
    else if (n > 1.2) cv.set(x, y, mix(w[2], w[1], 0.28));
    else if (n < -1.6) cv.set(x, y, mix(w[2], w[3], 0.35));
  }
  return cv;
}

// Rim overlays. Far edges (n = toward -y, w = toward -x) show the stone coping
// plus the shadowed inner pool wall; near edges (s, e) show only the lip.
function rim(edge) {
  const stone = r('stone');
  const w = r('water');
  const cv = new PixelCanvas(64, 32);
  const COPING = 0.13;
  const WALL = 0.16;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    const [u, v] = uv(x, y);
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const d = { n: v, w: u, s: 1 - v, e: 1 - u }[edge];
    if (d < COPING) {
      const k = d / COPING;
      cv.set(x, y, k < 0.25 ? stone[0] : k > 0.8 ? stone[3] : stone[1]);
    } else if ((edge === 'n' || edge === 'w') && d < COPING + WALL) {
      const k = (d - COPING) / WALL;
      // mosaic band then deep shadow fading into the water
      if (k < 0.45) cv.set(x, y, ((x >> 1) + (y >> 1)) % 2 ? mix(w[3], '#ffffff', 0.25) : w[3]);
      else cv.set(x, y, k < 0.75 ? w[4] : mix(w[4], w[3], 0.6));
    }
  }
  return cv;
}

export default function build(add) {
  for (let f = 0; f < FRAMES; f++) {
    for (const pu of [0, 1]) for (const pv of [0, 1]) add(`water/frame${f}_${pu}${pv}`, bleed(waterFrame(f, pu, pv)), [33, 17]);
  }
  for (const e of ['n', 'w', 's', 'e']) add(`water/rim_${e}`, rim(e), [32, 16]);
}
