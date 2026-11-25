// Wall segments. One segment covers one tile edge of the back walls.
// North wall (along y = 0): 32 px wide, falls 1 px per 2 px to the right.
// West walls are horizontal mirrors of the north ones.
// Pivot: the segment's ground point at the tile's north corner.
import { PixelCanvas, mix } from '../lib/canvas.js';
import { r } from '../palette.js';

export const WALL_ART_H = 88;
const H = WALL_ART_H;
const W = 32;

// Paint a segment column by column; paint(x, t) returns the colour at column x,
// t px below the top of the wall (0 .. H-1).
function segment(paint) {
  const cv = new PixelCanvas(W, H + 16);
  for (let x = 0; x < W; x++) {
    const top = Math.floor(x / 2);
    for (let t = 0; t < H; t++) cv.set(x, top + t, paint(x, t));
  }
  return cv;
}

const paper = r('wallpaper');
const wood = r('wainscot');
const brass = r('brass');

const WAINSCOT_T = H - 30; // wainscot starts here
const RAIL_T = WAINSCOT_T - 3;

function plainWall(x, t, lit) {
  const p = lit ? paper : paper.map((c) => mix(c, '#5a3d5c', 0.18));
  const w = lit ? wood : wood.map((c) => mix(c, '#2a1a30', 0.18));
  if (t < 2) return lit ? p[0] : p[1]; // crown highlight
  if (t < 5) return w[1]; // crown moulding
  if (t === 5) return w[3];
  if (t < RAIL_T) {
    // damask-ish stripes: a 2px soft stripe every 8 px with a dot motif
    const sx = x % 8;
    if (sx === 0) return p[2];
    if (sx === 4 && (t % 12 === 6)) return p[2];
    if (sx === 4 && (t % 12 === 5 || t % 12 === 7)) return mix(p[1], p[2], 0.5);
    return p[1];
  }
  if (t < RAIL_T + 1) return brass[1];
  if (t < WAINSCOT_T) return w[1];
  if (t >= H - 4) return t === H - 4 ? w[0] : w[3]; // skirting
  // raised panel: inset frame inside each 32px segment
  const pt = t - WAINSCOT_T;
  if (x === 3 || pt === 3) return w[3];
  if (x === 28 || pt === 22) return w[0];
  if (x > 3 && x < 28 && pt > 3 && pt < 22) return w[2];
  return w[1];
}

function windowWall(x, t, lit) {
  const glass = r('glass');
  const frame = r('walnut');
  const g0 = 14; const g1 = RAIL_T - 6; // glass rows
  const x0 = 5; const x1 = 27;
  if (x >= x0 - 2 && x <= x1 + 1 && t >= g0 - 2 && t <= g1 + 3) {
    if (t > g1 + 1) return t === g1 + 2 ? frame[0] : frame[2]; // sill
    if (x < x0 || x > x1 - 1 || t < g0 || t > g1) return frame[lit ? 1 : 2];
    if (x === 16 || x === 15) return frame[2]; // mullion
    if (t === g0 + 18) return frame[2]; // transom
    // sky: lighter toward the bottom, with a diagonal sheen
    const k = (t - g0) / (g1 - g0);
    let c = k < 0.3 ? glass[3] : k < 0.65 ? glass[2] : glass[1];
    const d = (x * 2 + t) % 26;
    if (d === 0 || d === 1 || d === 4) c = glass[0];
    return c;
  }
  return plainWall(x, t, lit);
}

function doorWall(x, t, lit) {
  const wd = r('walnut');
  const top = 18;
  if (x >= 3 && x <= 29 && t >= top - 3) {
    if (t < top) return brass[2]; // lintel
    if (x === 3 || x === 29) return wd[3];
    if (x === 16) return wd[4]; // split between leaves
    if ((x === 13 || x === 19) && t > 48 && t < 56) return brass[1]; // handles
    const leafX = x < 16 ? x - 4 : x - 17;
    const pt = t - top;
    if (pt % 22 === 2 || leafX === 1 || leafX === 10) return wd[3];
    if (pt % 22 === 3 || leafX === 2) return wd[0];
    return lit ? wd[1] : wd[2];
  }
  return plainWall(x, t, lit);
}

export default function build(add) {
  const kinds = { plain: plainWall, window: windowWall, door: doorWall };
  for (const [name, fn] of Object.entries(kinds)) {
    const north = segment((x, t) => fn(x, t, true));
    // west walls face +u (shaded side); paint them shaded, then mirror
    const west = segment((x, t) => fn(31 - x, t, false)).mirrored();
    add(`wall/north_${name}`, north, [0, H]);
    add(`wall/west_${name}`, west, [W, H]);
  }
}
