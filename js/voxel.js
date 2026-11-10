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
  barista_pip: { // energetic barista: espresso apron, warm brown hair
    skin: '#f5cba7', hair: '#6e3b24', hairStyle: 'short', eye: '#2b2230', brow: '#4e2816', mouth: 'smile',
    shirt: '#e8d8c8', under: '#5c3824', outfit: 'cardigan', pants: '#3b2e2a', shoe: '#5c3824',
  },
  chef_remy: { // head chef: white jacket, tall chef toque
    skin: '#f2c6a0', hair: '#382822', hairStyle: 'short', eye: '#2b2230', brow: '#2a1c18', mouth: 'smile',
    shirt: '#f8f8fc', gold: '#d84040', outfit: 'bellhop', chefHat: true, pants: '#2f3542', shoe: '#1e222a',
  },
  coach_rex: { // fitness trainer: crimson athletic tee, headband
    skin: '#d99b72', hair: '#282028', hairStyle: 'spiky', eye: '#2b2230', brow: '#1c161c', mouth: 'smile',
    shirt: '#ff5252', outfit: 'tee', headband: '#ffffff', bareArms: true, pants: '#222836', shoe: '#ff5252',
  },
  marina: { // spa attendant: serene aqua wrap, long dark hair, flower
    skin: '#f7d3b0', hair: '#2a344a', hairStyle: 'long', eye: '#2b2230', brow: '#1e2638', mouth: 'smile', lashes: true,
    shirt: '#5cd6c8', outfit: 'dress', flower: true, pants: '#3a8c82', shoe: '#f4efe6',
  },
  zack: { // arcade wizard: neon purple hoodie, cyan visor goggles
    skin: '#ffdbb8', hair: '#3a2058', hairStyle: 'spiky', eye: '#2b2230', brow: '#2a1640', mouth: 'open',
    shirt: '#8c52ff', outfit: 'tee', goggles: true, pants: '#241c38', shoe: '#50f0d0',
  },
  clara: { // archivist: emerald cardigan, glasses, bob hair
    skin: '#fce0c4', hair: '#8c442a', hairStyle: 'bob', eye: '#2b2230', brow: '#68301c', mouth: 'smile',
    shirt: '#489c72', under: '#fff8e8', outfit: 'cardigan', glasses: true, pants: '#384454', shoe: '#523422',
  },
  flora: { // botanist: sage tunic, blonde long hair, flower
    skin: '#ffd8b4', hair: '#e8b854', hairStyle: 'long', eye: '#2b2230', brow: '#b0842c', mouth: 'smile',
    shirt: '#78c466', under: '#fff4d4', outfit: 'cardigan', flower: true, pants: '#4a6b48', shoe: '#7c5434',
  },
  celeste: { // head receptionist: royal navy blazer with gold lapels & buttons, neat bob
    skin: '#ffe0c2', hair: '#382230', hairStyle: 'bob', eye: '#2b2230', brow: '#2a1824', mouth: 'smile', lashes: true,
    shirt: '#2e4478', gold: '#ffd268', cuff: '#ffd268', outfit: 'bellhop', pants: '#1e2c50', shoe: '#1c1824',
  },
  receptionist: {
    skin: '#ffe0c2', hair: '#382230', hairStyle: 'bob', eye: '#2b2230', brow: '#2a1824', mouth: 'smile', lashes: true,
    shirt: '#2e4478', gold: '#ffd268', cuff: '#ffd268', outfit: 'bellhop', pants: '#1e2c50', shoe: '#1c1824',
  },
};

// ---------- model ----------

/**
 * pose: {
 *   stride?: -1|0|1,
 *   sit?: boolean,
 *   lie?: boolean,
 *   blink?: boolean,
 *   breathe?: 0|1,
 *   action?: null|'treadmill'|'swim'|'eat'|'use'|'lie',
 *   actionFrame?: 0|1|2|3,
 * } -> boxes in local space
 */
export function buildParts(look, pose = {}) {
  const {
    stride = 0,
    sit = false,
    lie = false,
    blink = false,
    breathe = 0,
    action = null,
    actionFrame = 0,
  } = pose;
  const isSwim = action === 'swim';
  const isLie = lie || action === 'lie' || action === 'spa_massage';
  const isTreadmill = action === 'treadmill';
  const isEat = action === 'eat';
  const isUse = action === 'use';
  const idleBreathe = (!sit && !isLie && !isSwim && !isTreadmill && stride === 0 && breathe) ? 0.45 : 0;

  const dz = isSwim
    ? -5.4
    : isLie
      ? -3.2
      : isTreadmill
        ? (actionFrame % 2 === 0 ? 0.75 : -0.15)
        : sit
          ? -1
          : idleBreathe * 0.6;

  const P = [];
  const add = (x0, x1, y0, y1, z0, z1, color, tex) => P.push({ x0, x1, y0, y1, z0, z1, color, tex });
  const skirt = look.skirt && !sit && !isLie && !isSwim;
  const lower = look.bareArms ? look.skin : look.shirt;
  const effStride = isTreadmill ? (actionFrame % 2 === 0 ? 1.35 : -1.35) : stride;

  // legs: thigh / shin / shoe (submerged and omitted during swimming so waterline stays clean)
  if (!isSwim) {
    for (const s of [-1, 1]) {
      const [a, b] = s > 0 ? [0.15, 3.35] : [-3.35, -0.15];
      const o = effStride * s * 1.7;
      if (isLie) {
        add(a, b, 0.2, 5.2, 4.0, 6.4, look.skirt ? look.shirt : look.pants);
        add(a, b, 5.0, 7.6, 3.8, 6.1, look.pants);
        add(a, b, 7.2, 9.0, 3.6, 6.6, look.shoe, soleTex);
      } else if (sit) {
        add(a, b, -2.2, 4.4, 3.5, 6, look.skirt ? look.shirt : look.pants);
        add(a, b, 2.6, 4.4, 1.6, 3.5, look.pants);
        add(a, b, 2.4, 6, 0, 1.6, look.shoe, soleTex);
      } else {
        const lift = o > 0.5 ? (isTreadmill ? 1.45 : 0.5) : 0;
        if (!skirt) add(a, b, -1.7 + o * 0.5, 1.7 + o * 0.5, 3.6 + lift * 0.4, 7, look.pants);
        add(a, b, -1.7 + o, 1.7 + o, 1.6 + lift, skirt ? 3.8 : 3.6 + lift * 0.4, look.pants);
        add(a, b, -1.7 + o, 3.6 + o, lift, 1.6 + lift, look.shoe, soleTex);
      }
    }
  }
  if (skirt) { // dress / coat tails hang over the upper legs
    add(-4.2, 4.2, -3.2, 3.2, 5.2, 7, look.shirt, torsoTex(look));
    add(-4.8, 4.8, -3.8, 3.8, 3.8, 5.2, look.shirt, torsoTex(look, true));
  }

  // torso + collar/neck detail
  const tf = look.belly ? 3.1 : 2.4;
  add(-3.5, 3.5, -2.4, tf, 7 + dz, 15 + dz + idleBreathe, look.shirt, torsoTex(look));
  add(-1.8, 1.8, -1.6, 1.8, 14.6 + dz + idleBreathe, 15.6 + dz + idleBreathe, sh(look.skin, -0.05));

  // arms & activity props
  for (const s of [-1, 1]) {
    const [a, b] = s > 0 ? [3.5, 5.4] : [-5.4, -3.5];
    const o = -effStride * s * 1.5;
    const cuff = look.cuff ? cuffTex(look.cuff) : null;
    if (isSwim) {
      // Alternating freestyle/breaststroke swim stroke along the water surface
      const strokePhase = ((actionFrame + (s > 0 ? 0 : 2)) % 4);
      const reachY = strokePhase === 0 ? 2.2 : strokePhase === 1 ? 0.6 : strokePhase === 2 ? -1.4 : 0.4;
      const reachZ = strokePhase === 0 ? 9.6 : strokePhase === 1 ? 8.2 : strokePhase === 2 ? 8.4 : 9.8;
      add(a, b, -1.2 + reachY * 0.4, 1.6 + reachY * 0.4, reachZ + dz, reachZ + 3.4 + dz, look.bareArms ? look.skin : look.shirt);
      add(a, b, 1.0 + reachY, 4.4 + reachY, reachZ - 0.8 + dz, reachZ + 1.4 + dz, lower, cuff);
      add(a + 0.15, b - 0.15, 4.2 + reachY, 5.8 + reachY, reachZ - 0.8 + dz, reachZ + 1.0 + dz, look.skin);
    } else if (isEat && s > 0) {
      // Right arm lifts a gourmet cup/bowl toward the mouth on odd actionFrames
      const liftToMouth = (actionFrame % 2) === 1;
      const armZ = sit ? 9.6 : 10.8;
      add(a, b, -1.2, 1.6, armZ, armZ + 4.8, look.bareArms ? look.skin : look.shirt);
      const foreY0 = liftToMouth ? 1.2 : 0.6;
      const foreY1 = liftToMouth ? 4.8 : 4.2;
      const foreZ0 = liftToMouth ? 13.8 + dz : 10.4 + dz;
      const foreZ1 = foreZ0 + 2.2;
      add(a - 0.4, b - 0.2, foreY0, foreY1, foreZ0, foreZ1, lower, cuff);
      add(a - 0.3, b - 0.3, foreY1, foreY1 + 1.3, foreZ0, foreZ0 + 1.7, look.skin);
      // Voxel cup / gourmet plate held in hand
      const cupX0 = a - 1.4, cupX1 = a + 0.6;
      const cupY0 = foreY1 + 0.2, cupY1 = foreY1 + 2.2;
      add(cupX0, cupX1, cupY0, cupY1, foreZ0 + 0.4, foreZ0 + 2.6, '#fff8ee');
      add(cupX0 + 0.2, cupX1 - 0.2, cupY0 + 0.2, cupY1 - 0.2, foreZ0 + 2.4, foreZ0 + 3.0, '#e07a48');
    } else if (isTreadmill) {
      // Bent athletic pumping arms
      add(a, b, -1.4 + o * 0.4, 1.4 + o * 0.4, 10.8 + dz, 14.8 + dz, look.bareArms ? look.skin : look.shirt);
      add(a, b, 0.4 + o * 0.8, 3.8 + o * 0.8, 9.6 + dz, 11.8 + dz, lower, cuff);
      add(a + 0.2, b - 0.2, 3.6 + o * 0.8, 4.9 + o * 0.8, 9.8 + dz, 11.6 + dz, look.skin);
    } else if (isUse) {
      const tap = ((actionFrame + (s > 0 ? 0 : 1)) % 2) * 0.9;
      add(a, b, -1.2, 1.4, 10.6 + dz, 14.8 + dz, look.bareArms ? look.skin : look.shirt);
      add(a, b, 0.6, 4.0, 9.2 + dz + tap, 11.2 + dz + tap, lower, cuff);
      add(a + 0.2, b - 0.2, 3.8, 5.1, 9.2 + dz + tap, 10.9 + dz + tap, look.skin);
    } else if (isLie) {
      add(a, b, -1.6, 2.2, 6.2, 9.6, look.bareArms ? look.skin : look.shirt);
      add(a, b, 1.8, 4.4, 5.4, 7.6, lower, cuff);
      add(a + 0.2, b - 0.2, 4.2, 5.4, 5.4, 7.2, look.skin);
    } else if (sit) {
      add(a, b, -1.4, 1.4, 9, 14, look.bareArms ? look.skin : look.shirt);
      add(a, b, -0.2, 3.6, 7, 9, lower, cuff);
      add(a + 0.2, b - 0.2, 3.6, 4.9, 7, 8.6, look.skin);
    } else {
      const sway = idleBreathe ? s * 0.15 : 0;
      add(a + sway, b + sway, -1.4 + o * 0.5, 1.4 + o * 0.5, 11.2 + idleBreathe * 0.5, 15 + idleBreathe, look.bareArms ? look.skin : look.shirt);
      add(a + sway, b + sway, -1.2 + o, 1.2 + o, 8.7 + idleBreathe * 0.4, 11.2 + idleBreathe * 0.5, lower, cuff);
      add(a + 0.2 + sway, b - 0.2 + sway, -1 + o, 1 + o, 7.5 + idleBreathe * 0.3, 8.7 + idleBreathe * 0.4, look.skin);
    }
  }

  // head: skin box with the face painted on its front & side planes, plus 3D nose / ears
  const hdz = dz + idleBreathe * 0.6;
  add(-5, 5, -4.6, 4.6, 15 + hdz, 23 + hdz, look.skin, headTex(look, { blink: blink || isLie, action, actionFrame }));
  const z = (v) => v + hdz;
  add(-0.65, 0.65, 4.6, 5.35, z(17.2), z(18.5), sh(look.skin, -0.03));
  const hairy = ['bob', 'long', 'ponytail', 'curls'].includes(look.hairStyle);
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
  if (look.headband) {
    add(-5.4, 5.4, -4.8, 5.1, z(21.4), z(22.5), look.headband);
  }
  if (look.hat) { // pillbox hat with a gold band and button
    add(-4, 4, -3.8, 3.8, z(24.3), z(25.4), look.gold);
    add(-3.7, 3.7, -3.5, 3.5, z(25.4), z(28), look.shirt, voxTex(5));
    add(-0.7, 0.7, -0.7, 0.7, z(28), z(28.8), look.gold);
  }
  if (look.chefHat) { // tall white chef toque
    add(-4.4, 4.4, -4.2, 4.2, z(24.2), z(25.6), '#e8e8f0');
    add(-4.8, 4.8, -4.5, 4.5, z(25.6), z(29.5), '#ffffff', voxTex(4));
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
  add(-0.3, 0.3, -4.9, 4.9, z(24.3), z(24.7), sh(hc, 0.22)); // fine centre-parting sheen
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
  } else if (st === 'ponytail') {
    hb(-1.8, 1.8, -6.6, -4.6, z(19), z(24)); // high ponytail puff extending back
    hb(-1.4, 1.4, -7.2, -5.0, z(16), z(20.5)); // tail drop
    add(-1.2, 1.2, -5.2, -4.6, z(21.5), z(23), '#ff5f8a'); // hair-tie band
    hb(-5, 1.5, 4.6, 5.1, z(21.2), z(23)); hb(1.5, 5, 4.6, 5.1, z(22), z(23));
  } else if (st === 'curls') {
    for (const [cx, cy, cz] of [
      [-4.5, -2, 23.5], [4.5, -2, 23.5], [-3, 3, 23.8], [3, 3, 23.8],
      [-5.5, 0, 20], [5.5, 0, 20], [-5.2, -3.5, 18], [5.2, -3.5, 18],
    ]) {
      hb(cx - 1.2, cx + 1.2, cy - 1.2, cy + 1.2, z(cz), z(cz + 2.4));
    }
    hb(-5, 1.5, 4.6, 5.1, z(21), z(23)); hb(1.5, 5, 4.6, 5.1, z(21.5), z(23));
  } else if (st === 'long') {
    hb(-5, 2, 4.6, 5.1, z(21), z(23)); hb(2, 5, 4.6, 5.1, z(22), z(23));
  } else {
    hb(-5, 1.5, 4.6, 5.1, z(st === 'bob' ? 20.8 : 21.2), z(23)); hb(1.5, 5, 4.6, 5.1, z(22), z(23));
  }
}

// ---------- textures: tex(g, W, H, fc, face, part) in face units ----------

function soleTex(g, W, H, fc) {
  g.fillStyle = fc('#2a2030');
  g.fillRect(0, H - 0.55, W, 0.55);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(0.2, H - 0.85, W - 0.4, 0.25);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0.15, H - 0.3, W - 0.3, 0.08); // fine welt stitch line
}

function voxTex(seed) {
  const STEP = 0.5; // half-voxel grain: doubles the resolvable hair/fabric texture detail
  return (g, W, H) => { // per-voxel sheen + faint grid so hair reads as stacked voxels
    for (let i = 0; i < W / STEP; i++) {
      for (let j = 0; j < H / STEP; j++) {
        const r = (i * 31 + j * 17 + seed * 13) % 5;
        if (r > 1) continue;
        g.fillStyle = r ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
        g.fillRect(i * STEP, j * STEP, Math.min(STEP, W - i * STEP), Math.min(STEP, H - j * STEP));
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 0.08;
    g.beginPath();
    for (let i = 1; i < W; i++) { g.moveTo(i, 0); g.lineTo(i, H); }
    for (let j = 1; j < H; j++) { g.moveTo(0, j); g.lineTo(W, j); }
    g.stroke();
  };
}

function cuffTex(color) {
  return (g, W, H, fc) => {
    g.fillStyle = fc(color); g.fillRect(0, H - 0.8, W, 0.8);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, H - 0.85, W, 0.07); // seam line
  };
}

function lensTex(g, W, H, fc, face) {
  if (face !== 'front') return;
  g.fillStyle = fc('#bff3ff'); g.fillRect(0.4, 0.4, W - 0.8, H - 0.8);
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(0.7, 0.6, 0.8, 0.8);
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(1.6, 1.3, 0.35, 0.35); // secondary sparkle
}

function headTex(look, pose = {}) {
  const { blink = false, action = null, actionFrame = 0 } = pose;
  return (g, W, H, fc, face) => {
    if (face === 'top' && look.hairStyle === 'bald') { // comb-over strands on the bald top
      g.fillStyle = fc(look.hair);
      for (const [y, a, w] of [[1.2, 2, 6], [2.2, 1.7, 6.6], [3.2, 1.5, 7], [4.2, 1.8, 6.4], [5.2, 2, 6]]) g.fillRect(a, y, w, 0.28);
      return;
    }
    if (face === 'left' || face === 'right') {
      // Side temple hair sideburn & warm cheek contour (no duplicate side-eye on 3/4 view)
      g.fillStyle = fc(look.hair);
      g.fillRect(0, 0, W * 0.42, 2.6);
      g.fillStyle = 'rgba(0,0,0,0.14)';
      for (let k = 0; k < 3; k++) g.fillRect(W * 0.1 + k * W * 0.1, 0, 0.07, 2.6); // fine individual hair strands
      g.fillStyle = 'rgba(255,105,125,0.26)';
      g.fillRect(W - 2.4, 5.1, 1.5, 0.85);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(W - 2.0, 3.6, 0.8, 0.45);
      return;
    }
    if (face !== 'front') return;

    // Rosy cheek blush + warm specular dot
    g.fillStyle = 'rgba(255,105,125,0.38)';
    g.fillRect(0.65, 5.25, 2.0, 1.05);
    g.fillRect(7.35, 5.25, 2.0, 1.05);
    g.fillStyle = 'rgba(255,230,235,0.45)';
    g.fillRect(0.95, 5.4, 0.55, 0.35);
    g.fillRect(8.4, 5.4, 0.55, 0.35);

    const eh = look.glasses ? 1.6 : 2.15;
    for (const ex of [1.55, 5.95]) {
      // Subtle upper-eyelid crease for volumetric depth
      g.fillStyle = fc(sh(look.skin, -0.16));
      g.fillRect(ex, 2.65, 2.5, 0.32);

      if (blink) {
        // Closed eyelid with gentle lash curve
        g.fillStyle = fc(sh(look.skin, -0.08));
        g.fillRect(ex, 3.0, 2.5, eh * 0.75);
        g.fillStyle = look.eye;
        g.fillRect(ex - 0.1, 3.85, 2.7, 0.48);
        g.fillRect(ex < 5 ? ex - 0.35 : ex + 2.45, 3.65, 0.35, 0.45);
      } else {
        // Open eye: sclera, iris outer tone, deep pupil core, and dual catchlights
        g.fillStyle = fc('#ffffff');
        g.fillRect(ex, 3.0, 2.5, eh);
        g.fillStyle = sh(look.eye, 0.18);
        g.fillRect(ex + 0.45, 3.0, 1.6, eh);
        g.fillStyle = look.eye;
        g.fillRect(ex + 0.7, 3.15, 1.15, eh - 0.25);
        g.fillStyle = '#ffffff';
        g.fillRect(ex + 0.55, 3.1, 0.68, 0.68);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(ex + 1.45, 3.95, 0.38, 0.38);
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillRect(ex + 0.85, 3.35, 0.24, 0.24); // secondary fine catchlight
      }

      if (look.lashes) {
        g.fillStyle = look.eye;
        g.fillRect(ex - 0.1, 2.55, 2.7, 0.45);
        g.fillRect(ex < 5 ? ex - 0.45 : ex + 2.5, 2.85, 0.42, 0.52);
        for (const lt of [0.2, 1.1, 2.0]) g.fillRect(ex + lt, 2.28, 0.12, 0.32); // individual fine lash strokes
        g.fillStyle = look.brow;
        g.fillRect(ex, 1.95, 2.5, 0.4);
      } else if (!look.mustache) {
        g.fillStyle = look.brow;
        const browTilt = look.mouth === 'frown' || action === 'treadmill';
        if (browTilt) {
          g.fillRect(ex - 0.1, ex < 5 ? 2.05 : 2.25, 1.35, 0.48);
          g.fillRect(ex + 1.25, ex < 5 ? 2.25 : 2.05, 1.35, 0.48);
        } else {
          const lift = action === 'eat' || look.mouth === 'open' ? -0.15 : 0;
          g.fillRect(ex - 0.1, 2.08 + lift, 2.7, 0.48);
        }
      }
    }

    if (look.glasses) {
      g.strokeStyle = '#3a3340'; g.lineWidth = 0.35;
      g.strokeRect(1.3, 2.5, 3.2, 2.5); g.strokeRect(5.5, 2.5, 3.2, 2.5);
      g.fillStyle = '#3a3340'; g.fillRect(4.5, 3.4, 1, 0.35);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(1.7, 2.8, 0.5, 0.5); g.fillRect(5.9, 2.8, 0.5, 0.5); // lens glint
    }

    if (look.mustache) return;
    // fine philtrum shadow above the mouth
    g.fillStyle = 'rgba(0,0,0,0.07)';
    g.fillRect(4.7, 5.85, 0.6, 0.45);
    const m = action === 'eat'
      ? (actionFrame % 2 === 1 ? 'chew' : 'smile')
      : action === 'treadmill'
        ? 'pant'
        : look.mouth;

    if (m === 'lips') {
      g.fillStyle = '#c0304a'; g.fillRect(3.75, 6.45, 2.5, 0.9);
      g.fillStyle = '#ff8da1'; g.fillRect(4.15, 6.55, 1.5, 0.3);
    } else if (m === 'open' || m === 'pant') {
      g.fillStyle = '#5a1f2c'; g.fillRect(3.95, 6.35, 2.1, 1.15);
      g.fillStyle = '#ffffff'; g.fillRect(4.15, 6.35, 1.7, 0.3);
      g.fillStyle = '#e0707a'; g.fillRect(4.25, 7.0, 1.5, 0.45);
    } else if (m === 'chew') {
      g.fillStyle = '#9e4450'; g.fillRect(4.1, 6.55, 1.8, 0.75);
      g.fillStyle = 'rgba(255,120,135,0.45)'; g.fillRect(6.4, 5.9, 1.1, 0.9);
    } else {
      g.fillStyle = '#a8505a';
      g.fillRect(3.85, 6.68, 2.3, 0.5);
      g.fillRect(3.55, m === 'frown' ? 7.0 : 6.38, 0.42, 0.42);
      g.fillRect(6.03, m === 'frown' ? 7.0 : 6.38, 0.42, 0.42);
    }
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
    if (o === 'tee') {
      g.fillStyle = fc(look.skin); g.fillRect(mid - 1.3, 0, 2.6, 0.9);
      g.fillStyle = fc('#ffffff'); g.fillRect(mid - 0.9, 2.8, 1.8, 1.8);
      g.fillStyle = fc(sh(look.pants, 0.1)); g.fillRect(0, H - 1.2, W, 1.2);
      g.fillStyle = fc('#f6c667'); g.fillRect(mid - 0.5, H - 1.1, 1.0, 0.9);
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(1.1, 0.9, 0.15, H - 2.1); g.fillRect(W - 1.25, 0.9, 0.15, H - 2.1); // side seams
    } else if (o === 'bellhop') {
      g.fillStyle = fc(look.gold); g.fillRect(0, 0, W, 0.7);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 0.7, W, 0.1); // braid piping highlight
      g.fillStyle = fc(sh(look.shirt, -0.25)); g.fillRect(mid - 0.1, 0.7, 0.2, H);
      g.fillStyle = fc(look.gold);
      for (const a of [mid - 1.3, mid + 1.3]) for (const b of [1.8, 3.4, 5, 6.6]) g.fillRect(a - 0.35, b, 0.7, 0.7);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (const a of [mid - 1.3, mid + 1.3]) for (const b of [1.8, 3.4, 5, 6.6]) g.fillRect(a - 0.12, b + 0.1, 0.22, 0.22); // button highlight
      g.fillStyle = fc('#2a2030'); g.fillRect(0, H - 1, W, 1);
    } else if (o === 'cardigan') {
      g.fillStyle = fc(look.under); g.fillRect(mid - 1.2, 0, 2.4, H);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let ry = 0.4; ry < H; ry += 0.8) g.fillRect(mid - 1.2, ry, 2.4, 0.1); // ribbed knit texture
      g.fillStyle = fc('#6b4a2e'); for (const b of [2, 4, 6]) g.fillRect(mid - 0.3, b, 0.6, 0.6);
      g.fillStyle = fc(sh(look.shirt, -0.2)); g.fillRect(mid - 1.2, 0, 0.3, H); g.fillRect(mid + 0.9, 0, 0.3, H);
      g.fillRect(0.5, 5, 1.6, 1.4); g.fillRect(W - 2.1, 5, 1.6, 1.4);
    } else if (o === 'labcoat') {
      g.fillStyle = fc(look.under); g.beginPath(); g.moveTo(mid - 1.5, 0); g.lineTo(mid + 1.5, 0); g.lineTo(mid, 3.2); g.closePath(); g.fill();
      g.fillStyle = fc(sh(look.shirt, -0.3)); g.fillRect(mid - 0.1, 3.2, 0.2, H);
      g.fillStyle = fc(sh(look.shirt, -0.15)); g.fillRect(0.6, 5, 1.7, 1.5); g.fillRect(W - 2.3, 5, 1.7, 1.5);
      g.fillStyle = fc('#4da3ff'); g.fillRect(W - 2.3, 4.4, 0.4, 1); g.fillStyle = fc('#e04a4a'); g.fillRect(1, 1.8, 1.2, 0.7);
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 0.08;
      g.beginPath(); g.moveTo(mid - 1.5, 0); g.lineTo(mid, 3.2); g.lineTo(mid + 1.5, 0); g.stroke(); // lapel stitch line
    } else if (o === 'dress') {
      g.fillStyle = fc(look.skin); g.fillRect(mid - 1.6, 0, 3.2, 1.1); g.fillRect(mid - 1, 1.1, 2, 0.5);
      g.fillStyle = fc('#ffffff'); for (const [a, b] of [[-1.8, 1.4], [-1.2, 2], [-0.4, 2.3], [0.4, 2.3], [1.2, 2], [1.8, 1.4]]) g.fillRect(mid + a - 0.25, b, 0.5, 0.5);
      g.fillStyle = fc('#c0304a'); g.fillRect(0, 5.4, W, 0.8);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(mid - 2.2, 2.6, 0.9, H - 2.8); // fabric sheen highlight
    } else if (o === 'swimsuit') {
      g.fillStyle = fc(sh(look.shirt, -0.22)); g.fillRect(mid - 1.4, -0.2, 2.8, 1.1); // scoop neckline trim
      g.fillStyle = fc('#ffffff'); g.fillRect(mid - 0.35, 1.0, 0.7, H - 1.2); // racing stripe
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0.6, 1.2, 1.1, H - 2); // fabric sheen highlight
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
 * Draws one pose to a canvas at native `scale` (e.g., devicePixelRatio).
 * `makeCanvas(w,h)` supplies canvases.
 * Returns { canvas, ox, oy, scale } — (ox,oy) is the figure's ground centre in CSS pixels.
 */
export function renderCharacter(look, dir, pose, makeCanvas, scale = 1) {
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
  const cssW = Math.ceil(maxX - minX) + 2 * M + 1;
  const cssH = Math.ceil(maxY - minY) + 2 * M + 1;
  const W = Math.round(cssW * scale), H = Math.round(cssH * scale);
  const body = makeCanvas(W, H);
  const g = body.getContext('2d');
  const base = [scale, 0, 0, scale, 0, 0];
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
        g.setTransform(
          (u[0] - o[0]) * scale, (u[1] - o[1]) * scale,
          (v[0] - o[0]) * scale, (v[1] - o[1]) * scale,
          o[0] * scale, o[1] * scale
        );
        g.beginPath(); g.rect(0, 0, Wd, Hd); g.clip();
        p.tex(g, Wd, Hd, fc, name, p);
        g.restore();
      }
      g.setTransform(...base);
      g.strokeStyle = 'rgba(30,14,40,0.28)'; g.lineWidth = 0.65;
      g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    }
  }

  // dark silhouette outline around the whole figure at native device pixel radius
  const out = makeCanvas(W, H);
  const og = out.getContext('2d');
  const d = Math.max(1, Math.round(scale));
  for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, d], [-d, d], [d, -d]]) og.drawImage(body, dx, dy);
  og.globalCompositeOperation = 'source-in';
  og.fillStyle = OUTLINE; og.fillRect(0, 0, W, H);
  og.globalCompositeOperation = 'source-over';
  og.drawImage(body, 0, 0);
  return { canvas: out, ox, oy, cssW, cssH, scale };
}

const cache = new Map();
/** Cached figure canvas for a look / facing / pose / scale. */
export function getCharacterCanvas(key, look, dir, pose, scale = 1) {
  const k = [
    key,
    dir,
    pose.stride || 0,
    pose.sit ? 1 : 0,
    pose.lie ? 1 : 0,
    pose.blink ? 1 : 0,
    pose.breathe || 0,
    pose.action || '',
    pose.actionFrame || 0,
    scale,
  ].join('|');
  if (!cache.has(k)) {
    cache.set(k, renderCharacter(look, dir, pose, (w, h) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }, scale));
  }
  return cache.get(k);
}
