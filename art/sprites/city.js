// City props (cars, street trees), the light-glow sprite and the glass
// railing used on open-air floors.
import { PixelCanvas, objectCanvas, isoBox, mix, HW } from '../lib/canvas.js';
import { M } from '../lib/furniture.js';

function mat(ramp, lit = 1) {
  return { top: ramp[lit], left: ramp[lit + 1], right: ramp[lit + 2], edge: ramp[0] };
}

// Car driving along u (long side on u); the v version is drawn natively too.
function car(body, alongU) {
  const L = 1.0; const Wd = 0.5;
  const [w, h] = alongU ? [L, Wd] : [Wd, L];
  const { cv, P, pivot } = objectCanvas(w, h, 24);
  const box = (a0, b0, a1, b1, z0, z1, m) => (alongU ? isoBox(cv, P, a0, b0, a1, b1, z0, z1, m) : isoBox(cv, P, b0, a0, b1, a1, z0, z1, m));
  // wheels
  for (const a of [0.15, 0.7]) box(a, 0.0, a + 0.15, Wd, 0, 4, mat(M.dark, 2));
  box(0, 0.03, L, Wd - 0.03, 3, 10, mat(body)); // body
  box(0.25, 0.06, 0.75, Wd - 0.06, 10, 16, mat(M.glass, 1)); // cabin glass
  box(0.28, 0.08, 0.72, Wd - 0.08, 16, 17, mat(body, 0)); // roof
  cv.selout(0.45);
  return { cv, pivot };
}

function tree(seedShift) {
  const { cv, P, pivot } = objectCanvas(1, 1, 64);
  isoBox(cv, P, 0.45, 0.45, 0.55, 0.55, 0, 22, mat(M.walnut, 2));
  // blobby canopy
  const [cx, cy] = P(0.5, 0.5, 34);
  const lobes = [[0, -6, 13], [-8, 0, 10], [8, 1, 10], [-3, 6, 9], [5, -12, 8], [-6, -10, 8]];
  for (const [dx, dy, r] of lobes) {
    const lx = cx + dx + seedShift; const ly = cy + dy;
    for (let y = Math.floor(ly - r); y < ly + r; y++) for (let x = Math.floor(lx - r); x < lx + r; x++) {
      const nx = (x + 0.5 - lx) / r; const ny = (y + 0.5 - ly) / r;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const light = -nx * 0.6 - ny * 0.8;
      cv.set(x, y, light > 0.5 ? M.leaf[0] : light > 0 ? M.leaf[1] : d > 0.75 ? M.leaf[3] : M.leaf[2]);
    }
  }
  cv.selout(0.45);
  return { cv, pivot };
}

// Stepped (pixel-art) radial glow, white, drawn additively and tinted per lamp.
function glow() {
  const W = 96; const H = 48;
  const cv = new PixelCanvas(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (W / 2);
    const dy = (y + 0.5 - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 1) continue;
    const step = d < 0.3 ? 110 : d < 0.55 ? 70 : d < 0.8 ? 38 : 16;
    cv.set(x, y, [255, 255, 255, step]);
  }
  return cv;
}

// Ring of ripples around a swimmer's waist, 4 frames growing outward.
function ripple(f) {
  const W = 44; const H = 24;
  const cv = new PixelCanvas(W, H);
  const rings = [[10 + f * 2, 0.9], [16 + f * 2, 0.45]];
  for (const [rx, strength] of rings) {
    const ry = rx / 2;
    for (let t = 0; t < 360; t += 2) {
      const a = (t * Math.PI) / 180;
      const x = Math.round(W / 2 + Math.cos(a) * rx);
      const y = Math.round(H / 2 + Math.sin(a) * ry);
      if ((t / 2 + f) % 5 === 0) continue; // broken ring reads as moving water
      cv.set(x, y, [235, 252, 255, Math.round(220 * strength * (1 - f * 0.15))]);
    }
  }
  // the bright waterline right at the body
  for (let x = W / 2 - 8; x <= W / 2 + 8; x++) {
    const y = Math.round(H / 2 + Math.sqrt(Math.max(0, 1 - ((x - W / 2) / 8.5) ** 2)) * 4);
    cv.set(x, y, [255, 255, 255, 230]);
  }
  return cv;
}

// Glass railing segment for open-air floors; same footprint as a wall segment.
function rail() {
  const H = 30;
  const cv = new PixelCanvas(HW, H + 16);
  for (let x = 0; x < HW; x++) {
    const top = Math.floor(x / 2);
    for (let t = 0; t < H; t++) {
      let c;
      if (t < 3) c = t === 0 ? M.gold[0] : M.gold[2];
      else if (t >= H - 2) c = M.gold[3];
      else if (x % 16 === 0) c = M.gold[2];
      else c = (x + t) % 19 < 2 ? [255, 255, 255, 150] : [170, 225, 235, 80];
      cv.set(x, top + t, c);
    }
  }
  return cv;
}

export default function build(add) {
  const bodies = { red: M.red, blue: M.azure, yellow: M.gold, white: M.porcelain, green: M.teal };
  for (const [name, ramp] of Object.entries(bodies)) {
    const u = car(ramp, true);
    const v = car(ramp, false);
    add(`city/car_${name}_u`, u.cv, u.pivot);
    add(`city/car_${name}_v`, v.cv, v.pivot);
  }
  for (let i = 0; i < 2; i++) {
    const t = tree(i * 2 - 1);
    add(`city/tree${i}`, t.cv, t.pivot);
  }
  add('fx/glow', glow(), [48, 24]);
  for (let f = 0; f < 4; f++) add(`fx/ripple${f}`, ripple(f), [22, 12]);
  const r = rail();
  add('wall/rail_north', r, [0, 30]);
  add('wall/rail_west', r.mirrored(), [HW, 30]);
  void mix;
}
