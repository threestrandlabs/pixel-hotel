// Procedural voxel characters. Each figure is a list of axis-aligned boxes in a
// local frame (lx = sideways, ly = forward, z = up, 1 unit = 1 voxel) that is
// rotated a quarter-turn per facing, projected isometrically and painted face by
// face (top / left / right), with textures (eyes, buttons, ...) mapped onto the
// real face planes. Nothing is mirrored: turning re-orients the actual planes.
// Parts are pure data (testable in Node); drawing only needs a canvas factory.

import { shadeColor as sh } from './sprites.js';

export const KX = 2.2; // px per voxel step along world x / y (2:1 iso, like the tiles)
export const KZ = 2.4; // px per voxel of height
const DIRS = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
// Same light as the room: lit from above-left, so +y faces (screen-left) match
// the north wall, +x faces (screen-right) are shaded like the west wall/floor edge.
const LIGHT = { top: 0.14, py: 0, px: -0.22 };
const OUTLINE = '#2a1d2e';

export const LOOKS = {
  player: {
    skin: '#ffd9a8', hair: '#5a3826', hairStyle: 'short', eye: '#2b2230', brow: '#4a2f20', mouth: 'smile',
    shirt: '#4da3ff', outfit: 'tee', pants: '#2c3e63', shoe: '#f4f4f4',
  },
  mochi: { // cheerful bellhop: pink jacket, gold buttons, pillbox hat
    skin: '#ffdcb4', hair: '#4a2c2a', hairStyle: 'bob', eye: '#2b2230', brow: '#4a2c2a', mouth: 'smile',
    shirt: '#ff9fc7', outfit: 'bellhop', gold: '#f6c667', cuff: '#f6c667', hat: true, pants: '#6b3a55', shoe: '#2a2030',
  },
  gus: { // grumpy old guest: bald top, white hair/mustache, glasses, cardigan
    skin: '#f0c8a0', hair: '#e4e4ea', hairStyle: 'bald', eye: '#2b2230', brow: '#f2f2f6', mouth: 'frown',
    shirt: '#7f93b3', under: '#f1e8d2', outfit: 'cardigan', belly: true, mustache: true, glasses: true,
    pants: '#6b5a48', shoe: '#4a3a2e',
  },
  drpix: { // eccentric scientist: lab coat, wild hair, goggles
    skin: '#ffe0c0', hair: '#e2dcff', hairStyle: 'spiky', eye: '#2b2230', brow: '#8d86b8', mouth: 'open',
    shirt: '#f4f7f2', under: '#5fcf7a', outfit: 'labcoat', goggles: true, skirt: true,
    pants: '#3f5b4a', shoe: '#e8e8e8',
  },
  lola: { // lounge singer: gold gown, long plum hair, flower
    skin: '#c98a62', hair: '#5b2a6e', hairStyle: 'long', eye: '#2b2230', brow: '#3a1c48', mouth: 'lips', lashes: true,
    shirt: '#ffe08a', outfit: 'dress', skirt: true, flower: true, bareArms: true,
    pants: '#c98a62', shoe: '#c0304a',
  },
};

// ---------- model ----------

/** pose: { stride: -1|0|1 (walk phase), sit: boolean } -> boxes in local space */
export function buildParts(look, pose = {}) {
  const { stride = 0, sit = false } = pose;
  const dz = sit ? -1 : 0;
  const P = [];
  const add = (x0, x1, y0, y1, z0, z1, color, tex) => P.push({ x0, x1, y0, y1, z0, z1, color, tex });
  const skirt = look.skirt && !sit;
  const lower = look.bareArms ? look.skin : look.shirt;

  // legs: thigh / shin / shoe stepped forward and back for the walk cycle
  for (const s of [-1, 1]) {
    const [a, b] = s > 0 ? [0.15, 3.35] : [-3.35, -0.15];
    const o = stride * s * 1.7;
    if (sit) {
      add(a, b, -2.2, 4.4, 3.5, 6, look.skirt ? look.shirt : look.pants);
      add(a, b, 2.6, 4.4, 1.6, 3.5, look.pants);
      add(a, b, 2.4, 6, 0, 1.6, look.shoe, soleTex);
    } else {
      const lift = o > 0.5 ? 0.5 : 0;
      if (!skirt) add(a, b, -1.7 + o * 0.5, 1.7 + o * 0.5, 3.6, 7, look.pants);
      add(a, b, -1.7 + o, 1.7 + o, 1.6 + lift, skirt ? 3.8 : 3.6, look.pants);
      add(a, b, -1.7 + o, 3.6 + o, lift, 1.6 + lift, look.shoe, soleTex);
    }
  }
  if (skirt) { // dress / coat tails hang over the upper legs
    add(-4.2, 4.2, -3.2, 3.2, 5.2, 7, look.shirt, torsoTex(look));
    add(-4.8, 4.8, -3.8, 3.8, 3.8, 5.2, look.shirt, torsoTex(look, true));
  }

  // torso
  const tf = look.belly ? 3.1 : 2.4;
  add(-3.5, 3.5, -2.4, tf, 7 + dz, 15 + dz, look.shirt, torsoTex(look));

  // arms
  for (const s of [-1, 1]) {
    const [a, b] = s > 0 ? [3.5, 5.4] : [-5.4, -3.5];
    const o = -stride * s * 1.5;
    const cuff = look.cuff ? cuffTex(look.cuff) : null;
    if (sit) {
      add(a, b, -1.4, 1.4, 9, 14, look.bareArms ? look.skin : look.shirt);
      add(a, b, -0.2, 3.6, 7, 9, lower, cuff);
      add(a + 0.2, b - 0.2, 3.6, 4.9, 7, 8.6, look.skin);
    } else {
      add(a, b, -1.4 + o * 0.5, 1.4 + o * 0.5, 11.2, 15, look.bareArms ? look.skin : look.shirt);
      add(a, b, -1.2 + o, 1.2 + o, 8.7, 11.2, lower, cuff);
      add(a + 0.2, b - 0.2, -1 + o, 1 + o, 7.5, 8.7, look.skin);
    }
  }

  // head: skin box with the face painted on its front plane, plus 3D nose / ears
  add(-5, 5, -4.6, 4.6, 15 + dz, 23 + dz, look.skin, headTex(look));
  const z = (v) => v + dz;
  add(-0.6, 0.6, 4.6, 5.3, z(17.2), z(18.5), sh(look.skin, -0.03));
  const hairy = ['bob', 'long'].includes(look.hairStyle);
  if (!hairy) for (const s of [-1, 1]) add(s > 0 ? 5 : -5.6, s > 0 ? 5.6 : -5, -0.6, 1, z(17.8), z(20), sh(look.skin, -0.05));
  hairBoxes(look, add, z);
  if (look.mustache) {
    for (const s of [-1, 1]) {
      add(s > 0 ? 0.8 : -2.8, s > 0 ? 2.8 : -0.8, 4.6, 5.4, z(16.9), z(18.2), look.hair, voxTex(7));
      add(s > 0 ? 2.8 : -3.4, s > 0 ? 3.4 : -2.8, 4.6, 5.3, z(16.2), z(17.6), look.hair, voxTex(9));
      add(s > 0 ? 0.6 : -4.3, s > 0 ? 4.3 : -0.6, 4.6, 5.3, z(20), z(21), look.hair, voxTex(3)); // bushy brows
    }
  }
  if (look.glasses) {
    for (const s of [-1, 1]) add(s > 0 ? 5 : -5.3, s > 0 ? 5.3 : -5, -1, 4.6, z(19.3), z(19.8), '#3a3340');
  }
  if (look.hat) { // pillbox hat with a gold band and button
    add(-4, 4, -3.8, 3.8, z(24.3), z(25.4), look.gold);
    add(-3.7, 3.7, -3.5, 3.5, z(25.4), z(28), look.shirt, voxTex(5));
    add(-0.7, 0.7, -0.7, 0.7, z(28), z(28.8), look.gold);
  }
  if (look.goggles) {
    add(-5, 5, 4.6, 5, z(21), z(22.3), '#2f3a4a');
    for (const s of [-1, 1]) {
      add(s > 0 ? 5 : -5.4, s > 0 ? 5.4 : -5, -1.5, 4.6, z(21), z(22.3), '#2f3a4a');
      add(s > 0 ? 1.1 : -4.3, s > 0 ? 4.3 : -1.1, 5, 5.9, z(20.6), z(23), '#8fe36b', lensTex);
    }
  }
  if (look.flower) {
    add(-6.3, -5.6, 0.2, 3, z(21.2), z(23.6), '#ff5f8a');
    add(-6.7, -6.3, 1, 2.2, z(22), z(22.8), '#ffd24a');
  }
  return P;
}

function hairBoxes(look, add, z) {
  const hc = look.hair, v = voxTex(11);
  const hb = (...a) => add(...a.slice(0, 6), hc, v);
  const st = look.hairStyle;
  if (st === 'bald') { // rim of hair around the sides and back only
    hb(5, 5.5, -4.6, 0.8, z(17.5), z(21.5)); hb(-5.5, -5, -4.6, 0.8, z(17.5), z(21.5)); hb(-5.5, 5.5, -5.1, -4.6, z(17.5), z(21.5));
    return;
  }
  hb(-5.5, 5.5, -5.1, 5.1, z(23), z(24.3)); // cap
  const long = st === 'long' || st === 'bob';
  const down = st === 'long' ? 15 : st === 'bob' ? 16 : 20.5;
  hb(5, 5.5, -4.6, long ? 3 : 1.8, z(down), z(23)); hb(-5.5, -5, -4.6, long ? 3 : 1.8, z(down), z(23));
  hb(-5.5, 5.5, -5.1, -4.6, z(st === 'long' ? 15 : st === 'bob' ? 15.4 : 18.5), z(23));
  if (st === 'long') hb(-4.6, 4.6, -4.6, -2.6, z(9.5), z(15));
  if (st === 'spiky') {
    hb(5, 6.3, -4.6, -1.5, z(20), z(23.5)); hb(-6.3, -5, -4.6, -1.5, z(20), z(23.5));
    for (const [x, y, h] of [[-3.5, -2.5, 2.6], [0, -1, 3.6], [3.2, -2.8, 2.4], [-2.8, 2.2, 2], [2.6, 2.4, 2.4], [0.2, 3.4, 1.8]]) {
      hb(x - 0.95, x + 0.95, y - 0.95, y + 0.95, z(24.3), z(24.3 + h));
    }
  } else if (st === 'long') {
    hb(-5, 2, 4.6, 5.1, z(21), z(23)); hb(2, 5, 4.6, 5.1, z(22), z(23));
  } else {
    hb(-5, 1.5, 4.6, 5.1, z(st === 'bob' ? 20.8 : 21.2), z(23)); hb(1.5, 5, 4.6, 5.1, z(22), z(23));
  }
}

// ---------- textures: tex(g, W, H, fc, face, part) in face units ----------

function soleTex(g, W, H, fc) { g.fillStyle = fc('#2a2030'); g.fillRect(0, H - 0.55, W, 0.55); }

function voxTex(seed) {
  return (g, W, H) => { // per-voxel sheen + faint grid so hair reads as stacked voxels
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const r = (i * 31 + j * 17 + seed * 13) % 5;
        if (r > 1) continue;
        g.fillStyle = r ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
        g.fillRect(i, j, Math.min(1, W - i), Math.min(1, H - j));
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 0.1;
    g.beginPath();
    for (let i = 1; i < W; i++) { g.moveTo(i, 0); g.lineTo(i, H); }
    for (let j = 1; j < H; j++) { g.moveTo(0, j); g.lineTo(W, j); }
    g.stroke();
  };
}

function cuffTex(color) { return (g, W, H, fc) => { g.fillStyle = fc(color); g.fillRect(0, H - 0.8, W, 0.8); }; }

function lensTex(g, W, H, fc, face) {
  if (face !== 'front') return;
  g.fillStyle = fc('#bff3ff'); g.fillRect(0.4, 0.4, W - 0.8, H - 0.8);
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(0.7, 0.6, 0.8, 0.8);
}

function headTex(look) {
  return (g, W, H, fc, face) => {
    if (face === 'top' && look.hairStyle === 'bald') { // comb-over strands on the bald top
      g.fillStyle = fc(look.hair);
      for (const [y, a, w] of [[1.5, 2, 6], [3, 1.5, 7], [4.5, 2, 6]]) g.fillRect(a, y, w, 0.35);
      return;
    }
    if (face !== 'front') return;
    g.fillStyle = 'rgba(255,110,125,0.35)'; g.fillRect(0.7, 5.3, 1.9, 1); g.fillRect(7.4, 5.3, 1.9, 1);
    const eh = look.glasses ? 1.5 : 2.1;
    for (const ex of [1.6, 5.9]) {
      g.fillStyle = fc('#ffffff'); g.fillRect(ex, 3, 2.5, eh);
      g.fillStyle = look.eye; g.fillRect(ex + 0.5, 3, 1.5, eh);
      g.fillStyle = '#fff'; g.fillRect(ex + 0.6, 3.1, 0.6, 0.6);
      if (look.lashes) { g.fillStyle = look.eye; g.fillRect(ex - 0.1, 2.6, 2.7, 0.45); g.fillRect(ex < 5 ? ex - 0.4 : ex + 2.5, 2.9, 0.4, 0.5); }
      else if (!look.mustache) { g.fillStyle = look.brow; g.fillRect(ex - 0.1, 2.1, 2.7, 0.5); }
    }
    if (look.glasses) {
      g.strokeStyle = '#3a3340'; g.lineWidth = 0.35;
      g.strokeRect(1.3, 2.5, 3.2, 2.5); g.strokeRect(5.5, 2.5, 3.2, 2.5);
      g.fillStyle = '#3a3340'; g.fillRect(4.5, 3.4, 1, 0.35);
    }
    const m = look.mouth;
    if (look.mustache) return;
    if (m === 'lips') { g.fillStyle = '#c0304a'; g.fillRect(3.8, 6.5, 2.4, 0.9); }
    else if (m === 'open') { g.fillStyle = '#5a1f2c'; g.fillRect(4, 6.4, 2, 1.1); g.fillStyle = '#e0707a'; g.fillRect(4.3, 7, 1.4, 0.4); }
    else { g.fillStyle = '#a8505a'; g.fillRect(3.9, 6.7, 2.2, 0.5); g.fillRect(3.6, m === 'frown' ? 7 : 6.4, 0.4, 0.4); g.fillRect(6, m === 'frown' ? 7 : 6.4, 0.4, 0.4); }
  };
}

function torsoTex(look, skirtTier = false) {
  return (g, W, H, fc, face) => {
    if (face !== 'front') return;
    const mid = W / 2, o = look.outfit;
    if (skirtTier) { // skirt tier: just the hem and the coat's front opening
      g.fillStyle = fc(sh(look.shirt, -0.25)); g.fillRect(0, H - 0.4, W, 0.4);
      if (o === 'labcoat') g.fillRect(mid - 0.1, 0, 0.2, H);
      return;
    }
    if (o === 'tee') { g.fillStyle = fc(look.skin); g.fillRect(mid - 1.3, 0, 2.6, 0.9); g.fillStyle = fc('#ffffff'); g.fillRect(mid - 0.8, 3, 1.6, 1.6); g.fillStyle = fc(sh(look.pants, 0.1)); g.fillRect(0, H - 1.2, W, 1.2); }
    else if (o === 'bellhop') {
      g.fillStyle = fc(look.gold); g.fillRect(0, 0, W, 0.7);
      g.fillStyle = fc(sh(look.shirt, -0.25)); g.fillRect(mid - 0.1, 0.7, 0.2, H);
      g.fillStyle = fc(look.gold);
      for (const a of [mid - 1.3, mid + 1.3]) for (const b of [1.8, 3.4, 5, 6.6]) g.fillRect(a - 0.35, b, 0.7, 0.7);
      g.fillStyle = fc('#2a2030'); g.fillRect(0, H - 1, W, 1);
    } else if (o === 'cardigan') {
      g.fillStyle = fc(look.under); g.fillRect(mid - 1.2, 0, 2.4, H);
      g.fillStyle = fc('#6b4a2e'); for (const b of [2, 4, 6]) g.fillRect(mid - 0.3, b, 0.6, 0.6);
      g.fillStyle = fc(sh(look.shirt, -0.2)); g.fillRect(mid - 1.2, 0, 0.3, H); g.fillRect(mid + 0.9, 0, 0.3, H);
      g.fillRect(0.5, 5, 1.6, 1.4); g.fillRect(W - 2.1, 5, 1.6, 1.4);
    } else if (o === 'labcoat') {
      g.fillStyle = fc(look.under); g.beginPath(); g.moveTo(mid - 1.5, 0); g.lineTo(mid + 1.5, 0); g.lineTo(mid, 3.2); g.closePath(); g.fill();
      g.fillStyle = fc(sh(look.shirt, -0.3)); g.fillRect(mid - 0.1, 3.2, 0.2, H);
      g.fillStyle = fc(sh(look.shirt, -0.15)); g.fillRect(0.6, 5, 1.7, 1.5); g.fillRect(W - 2.3, 5, 1.7, 1.5);
      g.fillStyle = fc('#4da3ff'); g.fillRect(W - 2.3, 4.4, 0.4, 1); g.fillStyle = fc('#e04a4a'); g.fillRect(1, 1.8, 1.2, 0.7);
    } else if (o === 'dress') {
      g.fillStyle = fc(look.skin); g.fillRect(mid - 1.6, 0, 3.2, 1.1); g.fillRect(mid - 1, 1.1, 2, 0.5);
      g.fillStyle = fc('#ffffff'); for (const [a, b] of [[-1.8, 1.4], [-1.2, 2], [-0.4, 2.3], [0.4, 2.3], [1.2, 2], [1.8, 1.4]]) g.fillRect(mid + a - 0.25, b, 0.5, 0.5);
      g.fillStyle = fc('#c0304a'); g.fillRect(0, 5.4, W, 0.8);
    }
  };
}

// ---------- rendering ----------

function worldBox(part, dir) {
  const [fx, fy] = DIRS[dir];
  const rx = fy, ry = -fx; // right-hand side of the facing direction (a pure rotation, never a mirror)
  const w = (lx, ly) => [lx * rx + ly * fx, lx * ry + ly * fy];
  const cs = [w(part.x0, part.y0), w(part.x1, part.y0), w(part.x0, part.y1), w(part.x1, part.y1)];
  const X = cs.map((c) => c[0]), Y = cs.map((c) => c[1]);
  return { w, R: [rx, ry], F: [fx, fy], X0: Math.min(...X), X1: Math.max(...X), Y0: Math.min(...Y), Y1: Math.max(...Y) };
}
const project = (X, Y, Z) => [(X - Y) * KX, (X + Y) * KX / 2 - Z * KZ];

// local face a part shows on the world normal n, with its local origin / u-axis / v-axis
function faceOf(part, wb, n) {
  const lx = n[0] * wb.R[0] + n[1] * wb.R[1];
  const ly = n[0] * wb.F[0] + n[1] * wb.F[1];
  const { x0, x1, y0, y1, z0, z1 } = part;
  const name = lx === 1 ? 'right' : lx === -1 ? 'left' : ly === 1 ? 'front' : 'back';
  const at = {
    front: (a, b) => [x0 + a, y1, z1 - b], back: (a, b) => [x0 + a, y0, z1 - b],
    right: (a, b) => [x1, y0 + a, z1 - b], left: (a, b) => [x0, y0 + a, z1 - b],
  }[name];
  const side = name === 'front' || name === 'back';
  return { name, at, W: side ? x1 - x0 : y1 - y0, H: z1 - z0 };
}

/**
 * Draws one pose to a canvas. `makeCanvas(w,h)` supplies canvases (browser).
 * Returns { canvas, ox, oy } — (ox,oy) is the figure's ground centre in the canvas.
 */
export function renderCharacter(look, dir, pose, makeCanvas) {
  const parts = buildParts(look, pose).map((p) => ({ p, wb: worldBox(p, dir) }));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const { p, wb } of parts) {
    for (const X of [wb.X0, wb.X1]) for (const Y of [wb.Y0, wb.Y1]) for (const Z of [p.z0, p.z1]) {
      const [sx, sy] = project(X, Y, Z);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
  }
  const M = 3;
  const ox = Math.ceil(-minX) + M, oy = Math.ceil(-minY) + M;
  const W = Math.ceil(maxX - minX) + 2 * M + 1, H = Math.ceil(maxY - minY) + 2 * M + 1;
  const body = makeCanvas(W, H);
  const g = body.getContext('2d');
  const base = [1, 0, 0, 1, 0, 0];
  const cen = (q) => q.wb.X0 + q.wb.X1 + q.wb.Y0 + q.wb.Y1 + q.p.z0 + q.p.z1;
  parts.sort((a, b) => cen(a) - cen(b)); // nearer-to-camera boxes (larger x+y+z) paint last

  for (const q of parts) {
    const { p, wb } = q;
    for (const [fname, n, light] of [['top'], ['py', [0, 1], LIGHT.py], ['px', [1, 0], LIGHT.px]]) {
      let pt, Wd, Hd, name;
      if (fname === 'top') {
        name = 'top'; Wd = p.x1 - p.x0; Hd = p.y1 - p.y0;
        pt = (a, b) => [p.x0 + a, p.y0 + b, p.z1];
      } else {
        const f = faceOf(p, wb, n);
        ({ name, W: Wd, H: Hd } = f);
        pt = f.at;
      }
      const L = fname === 'top' ? LIGHT.top : light;
      const scr = (a, b) => {
        const [lx, ly, z] = pt(a, b);
        const [X, Y] = wb.w(lx, ly);
        const [sx, sy] = project(X, Y, z);
        return [sx + ox, sy + oy];
      };
      const c = [scr(0, 0), scr(Wd, 0), scr(Wd, Hd), scr(0, Hd)];
      const fc = (hex) => sh(hex, L);
      g.setTransform(...base);
      g.fillStyle = g.strokeStyle = fc(p.color);
      g.lineWidth = 1;
      g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke();
      if (p.tex) {
        const o = c[0], u = scr(1, 0), v = scr(0, 1);
        g.save();
        g.setTransform(u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1]);
        g.beginPath(); g.rect(0, 0, Wd, Hd); g.clip();
        p.tex(g, Wd, Hd, fc, name, p);
        g.restore();
      }
      g.setTransform(...base);
      g.strokeStyle = 'rgba(30,14,40,0.28)'; g.lineWidth = 0.7;
      g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    }
  }

  // dark silhouette outline around the whole figure
  const out = makeCanvas(W, H);
  const og = out.getContext('2d');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) og.drawImage(body, dx, dy);
  og.globalCompositeOperation = 'source-in';
  og.fillStyle = OUTLINE; og.fillRect(0, 0, W, H);
  og.globalCompositeOperation = 'source-over';
  og.drawImage(body, 0, 0);
  return { canvas: out, ox, oy };
}

const cache = new Map();
/** Cached figure canvas for a look / facing / pose. */
export function getCharacterCanvas(key, look, dir, pose) {
  const k = `${key}|${dir}|${pose.stride || 0}|${pose.sit ? 1 : 0}`;
  if (!cache.has(k)) {
    cache.set(k, renderCharacter(look, dir, pose, (w, h) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }));
  }
  return cache.get(k);
}
