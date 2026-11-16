// Procedural pixel-art characters in the locked library-sample style (Pass 14b).
// Reference: /workspace/sprite-mock/agy_library/{core.py,character.py,texture.py,guide.md}
// - Snapped 2:1 isometric orthographic raycaster (1 unit = 4*DETAIL px across, 2*DETAIL px down)
// - Fixed 4-shade material ramps per part (top, left, right, mid-tone line; no AA, no gradients)
// - 75% cube head (6.75/side at z 11..17.75), thin 0.75 hair cap, 18.5-unit body proportions
// - Front-face 2:1 sloped feature stamps with white sclera, centred dark pupil + highlight, thin brows
// - Side face skin ~18% darker same hue (#c5a17e for #f0c49a)
// - All 11 guide 3.4 expressions exported as EXPRESSIONS

import {
  getDetail, registerCacheClearHook,
  hexToRgb, rgbToHex, materialRamp, skinRamp,
  TEXTURE_RULES, characterTexel,
} from './pixelart.js';
import { EMOTE_EXPRESSION_MAP } from './emotes.js';

export const KX = 2.0; // CSS px per world unit step along X / Y (4px at DPR 2 / DETAIL 1, 8px at DETAIL 2)
export const KZ = Math.sqrt(6); // Exact isometric vertical scale (matches core.py PPU = 4*sqrt(2)*DETAIL)

const HS = 0.75; // 75% default head scale
const HB = 11.0; // World z where the head begins (neck)
const H_HALF = 4.5 * HS; // 3.375: half width/depth of the 6.75-unit cube head
const hz = (yup) => HB + yup * HS;

export const EXPRESSIONS = [
  'neutral',
  'happy',
  'laughing',
  'sad',
  'angry',
  'surprised',
  'sleepy',
  'wink',
  'embarrassed',
  'smug',
  'thinking',
];

const EXPRESSION_SET = new Set(EXPRESSIONS);

export const LOOKS = {
  player: {
    skin: '#f0c49a', hair: '#5a3826', hairStyle: 'short', eye: '#1b1230', brow: '#1b1230', mouth: 'smile',
    shirt: '#4da3ff', outfit: 'tee', pants: '#2c3e63', shoe: '#f4f4f4',
  },
  mochi: { // cheerful bellhop: pink jacket, gold buttons, pillbox hat
    skin: '#ffdcb4', hair: '#4a2c2a', hairStyle: 'bob', eye: '#1b1230', brow: '#4a2c2a', mouth: 'smile',
    shirt: '#ff9fc7', outfit: 'bellhop', gold: '#f6c667', cuff: '#f6c667', hat: true, pants: '#6b3a55', shoe: '#2a2030',
  },
  gus: { // grumpy old guest: bald top, white hair/mustache, glasses, cardigan
    skin: '#f0c8a0', hair: '#e4e4ea', hairStyle: 'bald', eye: '#1b1230', brow: '#d0d0d8', mouth: 'frown',
    shirt: '#7f93b3', under: '#f1e8d2', outfit: 'cardigan', belly: true, mustache: true, glasses: true,
    pants: '#6b5a48', shoe: '#4a3a2e',
  },
  drpix: { // eccentric scientist: lab coat, wild hair, goggles
    skin: '#ffe0c0', hair: '#c4b5fd', hairStyle: 'spiky', eye: '#1b1230', brow: '#6d6698', mouth: 'open',
    shirt: '#f4f7f2', under: '#5fcf7a', outfit: 'labcoat', goggles: true, skirt: true,
    pants: '#3f5b4a', shoe: '#e8e8e8',
  },
  lola: { // lounge singer: gold gown, long plum hair, flower
    skin: '#c98a62', hair: '#5b2a6e', hairStyle: 'long', eye: '#1b1230', brow: '#3a1c48', mouth: 'lips', lashes: true,
    shirt: '#ffe08a', outfit: 'dress', skirt: true, flower: true, bareArms: true,
    pants: '#c98a62', shoe: '#c0304a',
  },
  barista_pip: { // energetic barista: espresso apron, warm brown hair
    skin: '#f5cba7', hair: '#6e3b24', hairStyle: 'short', eye: '#1b1230', brow: '#4e2816', mouth: 'smile',
    shirt: '#e8d8c8', under: '#5c3824', outfit: 'cardigan', pants: '#3b2e2a', shoe: '#5c3824',
  },
  chef_remy: { // head chef: white jacket, tall chef toque
    skin: '#f2c6a0', hair: '#382822', hairStyle: 'short', eye: '#1b1230', brow: '#2a1c18', mouth: 'smile',
    shirt: '#f2ede4', gold: '#d84040', outfit: 'bellhop', chefHat: true, pants: '#2f3542', shoe: '#2b2a3d',
  },
  coach_rex: { // fitness trainer: crimson athletic tee, headband
    skin: '#d99b72', hair: '#282028', hairStyle: 'spiky', eye: '#1b1230', brow: '#1c161c', mouth: 'smile',
    shirt: '#ff5252', outfit: 'tee', headband: '#f2ede4', bareArms: true, pants: '#222836', shoe: '#ff5252',
  },
  marina: { // spa attendant: serene aqua wrap, long dark hair, flower
    skin: '#f7d3b0', hair: '#2a344a', hairStyle: 'long', eye: '#1b1230', brow: '#1e2638', mouth: 'smile', lashes: true,
    shirt: '#5cd6c8', outfit: 'dress', flower: true, pants: '#3a8c82', shoe: '#f4efe6',
  },
  zack: { // arcade wizard: neon purple tee, cyan visor goggles
    skin: '#ffdbb8', hair: '#3a2058', hairStyle: 'spiky', eye: '#1b1230', brow: '#2a1640', mouth: 'open',
    shirt: '#8c52ff', outfit: 'tee', goggles: true, pants: '#241c38', shoe: '#50f0d0',
  },
  clara: { // archivist: emerald cardigan, glasses, bob hair
    skin: '#fce0c4', hair: '#8c442a', hairStyle: 'bob', eye: '#1b1230', brow: '#68301c', mouth: 'smile',
    shirt: '#489c72', under: '#fff8e8', outfit: 'cardigan', glasses: true, pants: '#384454', shoe: '#523422',
  },
  flora: { // botanist: sage tunic, blonde long hair, flower
    skin: '#ffd8b4', hair: '#e8b854', hairStyle: 'long', eye: '#1b1230', brow: '#8a641c', mouth: 'smile',
    shirt: '#78c466', under: '#fff4d4', outfit: 'cardigan', flower: true, pants: '#4a6b48', shoe: '#7c5434',
  },
  celeste: { // head receptionist: royal navy blazer with gold lapels & buttons, neat bob
    skin: '#ffe0c2', hair: '#382230', hairStyle: 'bob', eye: '#1b1230', brow: '#2a1824', mouth: 'smile', lashes: true,
    shirt: '#2e4478', gold: '#ffd268', cuff: '#ffd268', outfit: 'bellhop', pants: '#1e2c50', shoe: '#2b2a3d',
  },
  receptionist: {
    skin: '#ffe0c2', hair: '#382230', hairStyle: 'bob', eye: '#1b1230', brow: '#2a1824', mouth: 'smile', lashes: true,
    shirt: '#2e4478', gold: '#ffd268', cuff: '#ffd268', outfit: 'bellhop', pants: '#1e2c50', shoe: '#2b2a3d',
  },
};

export function resolveExpression(pose = {}, look = {}) {
  if (pose.expression && EXPRESSION_SET.has(pose.expression)) {
    return pose.expression;
  }
  if (pose.blink || pose.lie || pose.action === 'lie' || pose.action === 'spa_massage') {
    return 'sleepy';
  }
  if (pose.emote && EMOTE_EXPRESSION_MAP[pose.emote]) {
    return EMOTE_EXPRESSION_MAP[pose.emote];
  }
  if (pose.action === 'eat' || pose.action === 'swim') return 'happy';
  if (pose.action === 'treadmill') return 'angry';

  switch (look?.mouth) {
    case 'frown': return 'sad';
    case 'open': return 'surprised';
    case 'lips': return 'neutral';
    case 'smile': return 'happy';
    default: return 'neutral';
  }
}

// Legacy-compatible head texture callback for direct unit-test inspection
function makeHeadTexCallback(look, pose) {
  const expr = resolveExpression(pose, look);
  return (g, W, H, fc, face) => {
    if (face === 'left' || face === 'right') {
      const r = skinRamp(look.skin || '#f0c49a');
      g.fillStyle = r.right;
      g.fillRect(0, 0, W, H);
      g.fillStyle = r.line;
      g.fillRect(0, 0, 1, H);
      return;
    }
    if (face !== 'front') return;
    g.fillStyle = '#f2ede4';
    const eyeH = expr === 'sleepy' ? 0.4 : (expr === 'surprised' ? 1.8 : 1.5);
    g.fillRect(1.5, 3.0, 2.0, eyeH);
    g.fillRect(6.0, 3.0, 2.0, eyeH);
    g.fillStyle = look.eye || '#1b1230';
    g.fillRect(1.9, 3.2, 1.2, eyeH * 0.8);
    g.fillRect(6.4, 3.2, 1.2, eyeH * 0.8);
  };
}

/**
 * Builds the character's 3D boxes in local space:
 *   x = sideways (-left/far, +right/near in 'down' facing)
 *   y = forward (-back, +front)
 *   z = vertical height from ground (0 = soles, 18.5 = top of hair cap)
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
    emote = null,
    emoteFrame = 0,
  } = pose;

  const isSwim = action === 'swim';
  const isLie = lie || action === 'lie' || action === 'spa_massage';
  const isTreadmill = action === 'treadmill';
  const isEat = action === 'eat';
  const isUse = action === 'use';
  const idleBreathe = (!sit && !isLie && !isSwim && !isTreadmill && stride === 0 && breathe) ? 0.35 : 0;
  const emoteDanceBounce = emote === 'dance' ? Math.sin(emoteFrame * 3) * 0.5 : 0;
  const emoteLaughBounce = emote === 'laugh' ? Math.abs(Math.sin(emoteFrame * 4)) * 0.5 : 0;

  const dz = isSwim
    ? -4.2
    : isLie
      ? -2.6
      : isTreadmill
        ? (actionFrame % 2 === 0 ? 0.55 : -0.15)
        : sit
          ? -0.8
          : (idleBreathe * 0.5 + emoteDanceBounce + emoteLaughBounce);

  const P = [];
  let nextGroup = 1;
  const add = (x0, x1, y0, y1, z0, z1, color, opts = {}) => {
    const group = opts.group !== undefined ? opts.group : nextGroup++;
    P.push({
      x0, x1, y0, y1, z0, z1,
      color,
      mat: opts.mat || 'cloth',
      slot: opts.slot || null,
      face: opts.face || null,
      flushHead: Boolean(opts.flushHead),
      group,
      dz: opts.dz || 0,
      tex: opts.tex || null,
    });
  };

  const skirt = (look.skirt || look.outfit === 'dress') && !sit && !isLie && !isSwim;
  const sleeveColor = look.bareArms ? look.skin : look.shirt;
  const sleeveMat = look.bareArms ? 'skin' : 'shirt';
  const effStride = isTreadmill
    ? (actionFrame % 2 === 0 ? 1.25 : -1.25)
    : emote === 'dance'
      ? (Math.sin(emoteFrame * 2.5) > 0 ? 1.0 : -1.0)
      : stride;

  // 1. Shoes (z: 0..1.5) & Legs (z: 1.5..5.0) — straddling centre at x = ±1.2
  if (!isSwim) {
    for (const s of [-1, 1]) {
      const xc = 1.2 * s;
      const x0 = xc - 1.1;
      const x1 = xc + 1.1;
      const o = effStride * s * 1.1;
      const legGroup = nextGroup++;
      const shoeGroup = nextGroup++;

      if (isLie) {
        add(x0, x1, 0.2, 4.8, 2.6, 4.6, look.skirt ? look.shirt : look.pants, { mat: 'pants', slot: 'leg', group: legGroup });
        add(x0, x1, 4.8, 6.4, 2.4, 4.8, look.shoe, { mat: 'shoe', slot: 'shoe', group: shoeGroup });
      } else if (sit) {
        // Seated pose with bent knees (guide 8.5): thigh forward, shin hanging down
        add(x0, x1, -1.3, 2.8, 3.0, 4.5, look.skirt ? look.shirt : look.pants, { mat: 'pants', slot: 'leg', group: legGroup });
        add(x0, x1, 1.4, 2.9, 1.2, 3.0, look.pants, { mat: 'pants', slot: 'leg', group: legGroup });
        add(x0, x1, 1.3, 3.6, 0.0, 1.2, look.shoe, { mat: 'shoe', slot: 'shoe', group: shoeGroup });
      } else {
        const lift = o > 0.3 ? (isTreadmill ? 0.9 : 0.35) : 0;
        const legTop = skirt ? 3.5 : 5.0;
        add(x0, x1, -1.3 + o, 1.3 + o, 1.5 + lift, legTop + lift * 0.3, look.pants, { mat: 'pants', slot: 'leg', group: legGroup });
        // Shoe sticks out 0.4 forward of the leg (-1.5 to +1.9 = 3.4 deep)
        add(x0, x1, -1.5 + o, 1.9 + o, lift, 1.5 + lift, look.shoe, { mat: 'shoe', slot: 'shoe', group: shoeGroup });
      }
    }
  }

  // Skirt / coat hem over upper legs (flush with torso so it never occludes hands)
  const torsoDepth = 1.7;
  const torsoFront = look.belly ? 1.85 : torsoDepth;
  const torsoGroup = nextGroup++;
  if (skirt) {
    add(-2.5, 2.5, -torsoDepth, torsoDepth, 3.4 + dz, 5.0 + dz, look.shirt, {
      mat: 'shirt',
      slot: 'skirt',
      group: torsoGroup,
      dz,
    });
  }

  // 2. Torso: 5.0 wide (x: -2.5..2.5) x 3.4 deep (y: -1.7..1.7) x 6.0 tall (z: 5.0..11.0)
  add(-2.5, 2.5, -torsoDepth, torsoFront, 5.0 + dz, 11.0 + dz + idleBreathe, look.shirt, {
    mat: 'shirt',
    slot: 'torso',
    group: torsoGroup,
    dz: dz + idleBreathe * 0.5,
  });

  // 3. Arms & Hands: 1.9 wide (xc = ±3.45 -> [-4.4, -2.5] and [2.5, 4.4]), flush against torso side (x = ±2.5).
  // Hand is a 1.9 wide x 1.9..2.2 deep x 1.9 tall skin block coplanar with the end of each sleeve so it is
  // never overhanging-occluded by the sleeve or hidden behind the torso/head in any facing or pose.
  for (const s of [-1, 1]) {
    const xc = 3.45 * s;
    const ax0 = xc - 0.95;
    const ax1 = xc + 0.95;
    const hx0 = ax0;
    const hx1 = ax1;
    const o = -effStride * s * 1.0;
    const armGroup = nextGroup++;
    const handGroup = look.bareArms ? armGroup : nextGroup++;
    const ay0 = -1.1;
    const ay1 = 1.1;

    if (isSwim) {
      const strokePhase = (actionFrame + (s > 0 ? 0 : 2)) % 4;
      const reachY = strokePhase === 0 ? 0.35 : strokePhase === 1 ? 0.1 : strokePhase === 2 ? -0.3 : 0.15;
      const reachZ = strokePhase === 0 ? 7.6 : strokePhase === 1 ? 7.0 : strokePhase === 2 ? 7.2 : 7.8;
      add(ax0, ax1, ay0 + reachY, ay1 + reachY, reachZ + dz, reachZ + 2.5 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0 + reachY, ay1 + reachY, reachZ - 1.9 + dz, reachZ + dz, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (isEat && s > 0) {
      const liftToMouth = (actionFrame % 2) === 1;
      const eatLift = liftToMouth ? 0.65 : 0.15;
      const handZ0 = (sit ? 5.3 : 5.5) + dz + eatLift;
      add(ax0, ax1, ay0, ay1, handZ0 + 1.9, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, handZ0, handZ0 + 1.9, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
      // Held cup prop positioned in front of chest so it never occludes the hand in any facing
      add(0.8, 2.2, 1.65, 2.85, handZ0 + 0.2, handZ0 + 1.7, '#f2ede4', { mat: 'Cup', slot: 'prop' });
    } else if (isTreadmill) {
      const sw = o * 0.25;
      const armLift = sw > 0 ? 0.35 : 0;
      add(ax0, ax1, ay0 + sw, ay1 + sw, 7.5 + dz + armLift, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0 + sw, ay1 + sw, 5.6 + dz + armLift, 7.5 + dz + armLift, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (isUse) {
      const tap = ((actionFrame + (s > 0 ? 0 : 1)) % 2) * 0.4;
      add(ax0, ax1, ay0, ay1, 7.4 + dz + tap, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, 5.5 + dz + tap, 7.4 + dz + tap, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (isLie) {
      add(ax0, ax1, ay0, ay1, 5.0, 8.3, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, 3.1, 5.0, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (sit) {
      add(ax0, ax1, ay0, ay1, 7.2 + dz, 10.6 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, 5.3 + dz, 7.2 + dz, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (emote === 'wave' && s > 0) {
      const wBob = Math.sin((emoteFrame || 0) * 3) * 0.25;
      const handZ0 = 6.1 + dz + wBob;
      add(ax0, ax1, ay0, ay1, handZ0 + 1.9, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, handZ0, handZ0 + 1.9, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (emote === 'cheer') {
      const cBounce = Math.sin((emoteFrame || 0) * 2) * 0.25;
      const handZ0 = 6.1 + dz + cBounce;
      add(ax0, ax1, ay0, ay1, handZ0 + 1.9, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, handZ0, handZ0 + 1.9, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (emote === 'clap') {
      const cOff = Math.abs(Math.sin((emoteFrame || 0) * 4)) * 0.25;
      const handZ0 = 5.8 + dz + cOff;
      add(ax0, ax1, ay0 + cOff, ay1 + cOff, handZ0 + 1.9, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0 + cOff, ay1 + cOff, handZ0, handZ0 + 1.9, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (emote === 'thumbsup' && s > 0) {
      const handZ0 = 5.9 + dz;
      add(ax0, ax1, ay0, ay1, handZ0 + 1.9, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, handZ0, handZ0 + 1.9, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (emote === 'heart') {
      const handZ0 = 6.0 + dz;
      add(ax0, ax1, ay0, ay1, handZ0 + 1.9, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0, ay1, handZ0, handZ0 + 1.9, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else if (emote === 'dance') {
      const dSw = Math.sin((emoteFrame || 0) * 3 + s * 1.6) * 0.3;
      add(ax0, ax1, ay0 + dSw, ay1 + dSw, 7.4 + dz, 10.9 + dz, sleeveColor, { mat: sleeveMat, slot: 'sleeve', group: armGroup });
      add(hx0, hx1, ay0 + dSw, ay1 + dSw, 5.5 + dz, 7.4 + dz, look.skin, { mat: 'skin', slot: 'hand', group: handGroup });
    } else {
      // Standard standing / walking arm (sleeve 7.4..10.9, hand 5.5..7.4)
      const sw = o * 0.32;
      const lift = sw > 0 ? 0.2 : 0;
      add(ax0, ax1, ay0 + sw, ay1 + sw, 7.4 + dz + lift + idleBreathe * 0.3, 10.9 + dz + idleBreathe * 0.5, sleeveColor, {
        mat: sleeveMat,
        slot: 'sleeve',
        group: armGroup,
      });
      add(hx0, hx1, ay0 + sw, ay1 + sw, 5.5 + dz + lift + idleBreathe * 0.2, 7.4 + dz + lift + idleBreathe * 0.3, look.skin, {
        mat: 'skin',
        slot: 'hand',
        group: handGroup,
      });
    }
  }

  // 4. Head: 75% cube (6.75 per side: x, y in [-3.375, 3.375], z in [11.0, 17.75])
  const hdz = dz + idleBreathe * 0.5;
  const z = (v) => v + hdz;
  const h = H_HALF; // 3.375
  const headGroup = nextGroup++;
  add(-h, h, -h, h, z(HB), z(hz(9)), look.skin, {
    mat: 'skin',
    slot: 'head',
    group: headGroup,
    dz: hdz,
    tex: makeHeadTexCallback(look, pose),
  });

  // 5. Hair (thin 0.75 cap at z 17.75..18.5 + front fringe down to hz(7.7) = 16.775, adapted per style)
  const hairGroup = nextGroup++;
  buildHairBoxes(look, add, z, h, hairGroup, headGroup);

  // 6. NPC & Avatar Accessories
  if (look.mustache) {
    add(-1.2, 1.2, h - 0.1, h + 0.02, z(12.55), z(13.05), look.hair, {
      mat: 'hair', slot: 'mustache', face: '+y', flushHead: true, group: headGroup,
    });
  }

  const acc = look.accessory;
  const accColor = look.accessoryColor || '#3a3340';
  if (look.glasses || acc === 'glasses') {
    for (const s of [-1, 1]) {
      add(
        s > 0 ? h - 0.1 : -h - 0.04,
        s > 0 ? h + 0.04 : -h + 0.1,
        -0.3,
        h,
        z(14.2),
        z(14.55),
        accColor,
        { mat: 'acc', slot: 'glasses_side', face: s > 0 ? '+x' : '-x', flushHead: true, group: headGroup },
      );
    }
  }
  if (acc === 'cap') {
    const cGroup = nextGroup++;
    add(-h - 0.12, h + 0.12, -h - 0.12, h + 0.12, z(17.0), z(18.6), accColor, { mat: 'acc', slot: 'cap', group: cGroup });
    add(-h + 0.4, h - 0.4, h, h + 1.4, z(17.0), z(17.5), accColor, { mat: 'acc', slot: 'cap_brim', group: cGroup });
  }
  if (acc === 'headphones') {
    const hpGroup = nextGroup++;
    add(-h - 0.15, h + 0.15, -0.5, 0.5, z(18.4), z(18.95), accColor, { mat: 'acc', slot: 'headphones', group: hpGroup });
    for (const s of [-1, 1]) {
      const ex0 = s > 0 ? h - 0.1 : -h - 0.25;
      const ex1 = s > 0 ? h + 0.25 : -h + 0.1;
      add(ex0, ex1, -0.9, 0.9, z(13.4), z(15.6), accColor, { mat: 'acc', slot: 'headphones', group: hpGroup });
    }
  }
  if (look.headband) {
    add(-h - 0.09, h + 0.09, -h - 0.09, h + 0.09, z(15.85), z(16.55), look.headband, {
      mat: 'acc', slot: 'headband', flushHead: true, group: hairGroup,
    });
  }
  if (look.hat) { // Bellhop pillbox hat: gold base band + flat-topped pink crown
    const hatGroup = nextGroup++;
    add(-2.5, 2.5, -2.5, 2.5, z(18.3), z(18.85), look.gold || '#f6c667', { mat: 'gold', slot: 'hat_band', group: hatGroup });
    add(-2.45, 2.45, -2.45, 2.45, z(18.85), z(20.35), look.shirt, { mat: 'shirt', slot: 'hat_crown', group: hatGroup });
  }
  if (look.chefHat) { // Tall white chef toque: fitted headband base + wider puffed crown (guide 5.6)
    const chefGroup = nextGroup++;
    add(-h - 0.04, h + 0.04, -h - 0.04, h + 0.04, z(16.9), z(18.3), '#e2e0ea', { mat: 'acc', slot: 'chef_band', group: chefGroup });
    add(-h - 0.35, h + 0.35, -h - 0.35, h + 0.35, z(18.3), z(21.3), '#f5f2eb', { mat: 'acc', slot: 'chef_crown', group: chefGroup });
  }
  if (look.goggles) {
    const gogGroup = nextGroup++;
    // Thin side/front strap flush to head (leaves hair clearly visible above and behind)
    add(-h - 0.09, h + 0.09, -0.6, h + 0.09, z(15.7), z(16.25), '#2f3a4a', {
      mat: 'acc', slot: 'goggles_strap', flushHead: true, group: gogGroup,
    });
    for (const s of [-1, 1]) {
      const gx0 = s > 0 ? 0.45 : -2.45;
      const gx1 = s > 0 ? 2.45 : -0.45;
      add(gx0, gx1, h - 0.05, h + 0.18, z(15.45), z(16.45), '#8fe36b', {
        mat: 'acc', slot: 'goggles_lens', face: '+y', group: gogGroup,
      });
    }
  }
  if (look.flower) {
    const flowerGroup = nextGroup++;
    for (const [s, fc] of [[1, '+x'], [-1, '-x']]) {
      const fx0 = s > 0 ? h : -h - 0.14;
      const fx1 = s > 0 ? h + 0.14 : -h;
      const cx0 = s > 0 ? h : -h - 0.16;
      const cx1 = s > 0 ? h + 0.16 : -h;
      add(fx0, fx1, -0.2, 1.1, z(15.6), z(16.9), '#ff5f8a', { mat: 'acc', slot: 'flower', face: fc, group: flowerGroup });
      add(cx0, cx1, 0.15, 0.75, z(15.95), z(16.55), '#ffd24a', { mat: 'gold', slot: 'flower_center', face: fc, group: flowerGroup });
    }
  }

  return P;
}

function buildHairBoxes(look, add, z, h, hairGroup, headGroup) {
  const hc = look.hair || '#5a3826';
  const st = look.hairStyle || 'short';
  const hb = (x0, x1, y0, y1, z0, z1, slot = 'hair', grp = hairGroup, face = null, flushHead = false) =>
    add(x0, x1, y0, y1, z0, z1, hc, { mat: 'hair', slot, group: grp, face, flushHead });

  if (st === 'bald') {
    // Thin horseshoe fringe wrapping the back and sides flush to the head (top and forehead bare)
    hb(-h - 0.05, h + 0.05, -h - 0.05, -0.3, z(14.0), z(15.1), 'hair', headGroup, null, true);
    return;
  }

  // Hiding rule (guide 5.5): full hats (chef toque, cap) hide the top hair cap and front fringe
  if (look.chefHat || look.accessory === 'cap') {
    hb(-h - 0.05, h + 0.05, -h - 0.05, -0.2, z(13.8), z(17.0), 'hair_back', hairGroup, '-y', true);
    return;
  }

  // Approved Pass 14b thin hair cap (0.75 thick at z 17.75..18.5; 1.15 thick on spiky) + short front fringe
  const capTop = st === 'spiky' ? 1.15 : 0.75;
  hb(-h - 0.15, h + 0.15, -h - 0.15, h + 0.15, z(hz(9)), z(hz(9) + capTop), 'hair_cap');
  hb(-h - 0.05, h + 0.05, h - 0.4, h + 0.05, z(hz(7.7)), z(hz(9)), 'hair_fringe');

  if (st === 'short') {
    // Back nape hair visible when back of head faces camera ('left'/'up'), hidden in 'down'/'right'
    hb(-h - 0.05, h + 0.05, -h - 0.05, -0.2, z(13.5), z(hz(9)), 'hair_back', hairGroup, '-y', true);
  } else if (st === 'bob') {
    // Single continuous 3D box wrapping back and sides down to jaw level (zero corner seams)
    hb(-h - 0.08, h + 0.08, -h - 0.08, 0.8, z(12.2), z(hz(9)), 'hair_bob');
  } else if (st === 'long') {
    // Upper wrap + lower back cascade tucked to torso width so it never occludes far sleeve/hand
    hb(-h - 0.08, h + 0.08, -h - 0.08, 0.8, z(11.0), z(hz(9)), 'hair_long');
    hb(-2.5, 2.5, -2.15, -1.3, z(9.0), z(11.0), 'hair_long');
  } else if (st === 'spiky') {
    // Full back+side hair flush to head down to z(13.6) so hair is visible both above AND below headband/goggles
    hb(-h - 0.04, h + 0.04, -h - 0.04, 0.4, z(13.6), z(hz(9)), 'hair_spiky_base', hairGroup, null, true);
  } else if (st === 'ponytail') {
    hb(-h - 0.05, h + 0.05, -h - 0.05, -0.2, z(13.5), z(hz(9)), 'hair_back', hairGroup, '-y', true);
    add(-0.85, 0.85, -h - 0.35, -h - 0.02, z(15.4), z(16.4), '#ff5f8a', { mat: 'acc', slot: 'hair_tie' });
    hb(-1.1, 1.1, -h - 1.2, -h - 0.15, z(14.2), z(17.0));
    hb(-0.9, 0.9, -h - 1.4, -h - 0.35, z(11.8), z(14.5));
  } else if (st === 'curls') {
    hb(-h - 0.08, h + 0.08, -h - 0.08, 0.6, z(13.6), z(hz(9)));
    hb(-h + 0.25, h - 0.25, -h + 0.25, h - 0.2, z(hz(9) + 0.75), z(hz(9) + 1.45));
  }
}

// ---------- Orthographic Raycast & Pixel-Art Rasteriser ----------

// Pure 3D quarter-turn rotations mapping local (lx=sideways, ly=forward) to core.py world (wx, wy):
// In core.py: +wx goes screen-left-and-down (lit 'left' face), +wy goes screen-right-and-down (shaded 'right' face).
const DIR_BASIS = {
  down: { rx: 0, ry: 1, fx: 1, fy: 0 },   // wx = +ly (front on screen-left), wy = +lx (right side on screen-right)
  left: { rx: 1, ry: 0, fx: 0, fy: -1 },  // wx = +lx, wy = -ly
  up: { rx: 0, ry: -1, fx: -1, fy: 0 },   // wx = -ly, wy = -lx
  right: { rx: -1, ry: 0, fx: 0, fy: 1 }, // wx = -lx, wy = +ly (front on screen-right)
};

function worldBoxCore(part, dir) {
  const b = DIR_BASIS[dir] || DIR_BASIS.down;
  const w = (lx, ly) => [lx * b.rx + ly * b.fx, lx * b.ry + ly * b.fy];
  const c0 = w(part.x0, part.y0);
  const c1 = w(part.x1, part.y0);
  const c2 = w(part.x0, part.y1);
  const c3 = w(part.x1, part.y1);
  const wx0 = Math.min(c0[0], c1[0], c2[0], c3[0]);
  const wx1 = Math.max(c0[0], c1[0], c2[0], c3[0]);
  const wy0 = Math.min(c0[1], c1[1], c2[1], c3[1]);
  const wy1 = Math.max(c0[1], c1[1], c2[1], c3[1]);
  return { wx0, wx1, wy0, wy1, wz0: part.z0, wz1: part.z1, basis: b };
}

const projectCss = (wx, wy, wz) => [(wy - wx) * KX, (wx + wy) * (KX * 0.5) - wz * KZ];

// Evaluates torso outfit details in local torso coordinates (lx, ly, lz) using only material ramps.
function evalTorsoColor(look, lx, ly, lz, bandIdx, ramps, n = 2) {
  const bandKey = bandIdx === 0 ? 'top' : (bandIdx === 1 ? 'left' : 'right');
  const shirtRmp = ramps.shirt;
  const o = look.outfit || 'tee';
  const isFront = ly > 1.2;

  if (o === 'tee') {
    // Pass 14b calm accent: subtle 1-row broken waist crease in mid shade (right, not line)
    if (TEXTURE_RULES.cloth?.enabled !== false && bandIdx === 1 && isFront) {
      const iv = Math.round(lz * n * KZ);
      const ivCrease = Math.round(6.5 * n * KZ);
      if (iv === ivCrease && ((lx >= -1.45 && lx <= -0.45) || (lx >= 0.55 && lx <= 1.25))) {
        return shirtRmp.right;
      }
    }
    return shirtRmp[bandKey];
  }

  if (o === 'bellhop') {
    const goldRmp = ramps.gold;
    if (lz <= 5.55) return ramps.pants.line;
    if (isFront) {
      if (lz >= 10.2 && Math.abs(lx) <= 1.55) return goldRmp[bandKey];
      if (Math.abs(lx) < 0.18) return shirtRmp.line;
      const ax = Math.abs(lx);
      if (ax >= 0.75 && ax <= 1.25) {
        if ((lz >= 6.3 && lz <= 6.8) || (lz >= 7.7 && lz <= 8.2) || (lz >= 9.1 && lz <= 9.6)) {
          return goldRmp.top;
        }
      }
    }
    return shirtRmp[bandKey];
  }

  if (o === 'cardigan') {
    if (isFront) {
      const ax = Math.abs(lx);
      if (ax < 0.85) return ramps.under[bandKey];
      if (ax < 1.1) return shirtRmp.line;
    }
    return shirtRmp[bandKey];
  }

  if (o === 'labcoat') {
    if (isFront) {
      if (lz > 8.4 && Math.abs(lx) < (lz - 8.4) * 0.45) return ramps.under[bandKey];
      if (lz <= 8.4 && Math.abs(lx) < 0.18) return shirtRmp.line;
    }
    return shirtRmp[bandKey];
  }

  if (o === 'hoodie') {
    if (isFront) {
      const ax = Math.abs(lx);
      if (ax >= 0.45 && ax <= 0.7 && lz >= 8.8 && lz <= 10.5) return ramps.gold.top;
      if (ax <= 1.45 && lz >= 5.6 && lz <= 7.0) return shirtRmp.right;
    }
    if (lz <= 5.5) return shirtRmp.right;
    return shirtRmp[bandKey];
  }

  if (o === 'dress') {
    if (isFront && lz >= 10.1 && Math.abs(lx) < 1.1) return ramps.skin[bandKey];
    if (lz >= 5.6 && lz <= 6.3) return ramps.gold[bandKey];
    return shirtRmp[bandKey];
  }

  if (o === 'swimsuit') {
    if (isFront && lz >= 10.0 && Math.abs(lx) < 1.1) return ramps.skin[bandKey];
    if (isFront && Math.abs(lx) < 0.35) return ramps.gold.top;
    return shirtRmp[bandKey];
  }

  return shirtRmp[bandKey];
}

// Stamps projected face features onto the head's front isometric plane (2:1 slope).
// Matches core.py apply_face_stamps() at n=4 (DETAIL=2) and scales cleanly to n=2 (DETAIL=1).
function applyFaceStamps(colorGrid, pidGrid, boxes, W, H, headIdx, dir, look, pose, n, X0, Y0, hdz) {
  if (headIdx < 0 || (dir !== 'down' && dir !== 'right')) return;

  // Find horizontal reference edge of the head box
  let xMin = W;
  let xMax = -1;
  for (let i = 0; i < W * H; i++) {
    if (pidGrid[i] === headIdx) {
      const x = i % W;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
  }
  if (xMax < xMin) return;

  const isDown = dir === 'down';
  const xRef = isDown ? xMin : xMax;
  const slopeStep = (x) => (isDown ? Math.floor((x - xRef) / 2) : Math.floor((xRef - x) / 2));

  const paintPx = (x, y, hexColor) => {
    if (!hexColor || x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = y * W + x;
    const k = pidGrid[idx];
    if (k === headIdx || (k >= 0 && (boxes[k].p.slot === 'mustache' || boxes[k].p.slot === 'glasses_side'))) {
      colorGrid[idx] = hexColor;
    }
  };

  // Derive face feature colors with clear contrast across all skin tones (guide 3.5 & 4.3)
  const skinRgb = hexToRgb(look.skin || '#f0c49a');
  const skinLuma = (skinRgb[0] * 299 + skinRgb[1] * 587 + skinRgb[2] * 114) / 1000;
  const S = '#f2ede4'; // off-white sclera
  const P = look.eye || '#1b1230'; // pupil
  const HI = '#fff4e8'; // 1px/2x2 upper catchlight
  const BROW = look.brow || P;
  const MOUTH = look.mouth === 'lips'
    ? '#c0304a'
    : (skinLuma < 125 ? '#351915' : (skinLuma < 165 ? '#5e2c28' : '#8a4a4a'));
  const TONGUE = '#d9707a';
  const BLUSH = skinLuma < 140 ? '#7a3a2e' : '#e89a8a';
  const TEAR = '#bfe3ff';

  const expr = resolveExpression(pose, look);
  // Explicit expression vs default idle smile:
  // Locked style update: player's idle face matches pass 13/14b face_8x.png (white sclera, centred pupil + highlight, thin brows, mouth).
  const isExplicitExpr = Boolean(pose.expression || pose.emote || pose.action || pose.blink);

  const projectWorld = (lx, ly, wz) => {
    const b = DIR_BASIS[dir];
    const wx = lx * b.rx + ly * b.fx;
    const wy = lx * b.ry + ly * b.fy;
    const px = X0 + (wy - wx) * 2 * n - 0.5;
    const py = Y0 + (wx + wy) * n - wz * n * KZ - 0.5;
    return [px, py];
  };

  const ff = H_HALF + 0.03;
  const eyeZ = hdz + hz(expr === 'sad' ? 3.9 : 4.1);
  const mouthZ = hdz + hz(1.9);

  // Scale factor: isHiRes for n>=3 (DETAIL=2, 10x12 eye map from core.py), 6x6 even-width eye map for n<=2 (DETAIL=1)
  const isHiRes = n >= 3;
  const ew = isHiRes ? 10 : 6;
  const eh = isHiRes ? 12 : 6;

  const buildEyeGrid = (sideSgn) => {
    const isNearEye = (isDown && sideSgn > 0) || (!isDown && sideSgn < 0);
    // Sleepy / closed line eye
    if (expr === 'sleepy') {
      const rows = Array.from({ length: eh }, () => new Array(ew).fill(null));
      const midV = Math.floor(eh / 2);
      for (let u = 0; u < ew; u++) {
        rows[midV][u] = P;
        if (isHiRes) rows[midV + 1][u] = P;
      }
      return rows;
    }
    // Happy arc eye (∩) for laughing or wink's winking eye
    if (expr === 'laughing' || (expr === 'wink' && isNearEye)) {
      const rows = Array.from({ length: eh }, () => new Array(ew).fill(null));
      const midV = Math.floor(eh / 2);
      for (let u = 0; u < ew; u++) {
        const isArch = isHiRes ? (u >= 2 && u <= 7) : (u >= 1 && u <= 3);
        const v = isArch ? midV - (isHiRes ? 2 : 1) : midV;
        rows[v][u] = P;
        if (isHiRes) rows[v + 1][u] = P;
      }
      return rows;
    }

    // Standard open eye with white sclera on left & right, centred dark pupil, and highlight
    if (isHiRes) {
      // Exact 10x12 eye_map from core.py lines 411-424
      const map = [
        [S, S, S, S, S, S, S, S, S, S],
        [S, S, S, S, S, S, S, S, S, S],
        [S, S, P, P, HI, HI, P, P, S, S],
        [S, S, P, P, HI, HI, P, P, S, S],
        [S, S, P, P, P, P, P, P, S, S],
        [S, S, P, P, P, P, P, P, S, S],
        [S, S, P, P, P, P, P, P, S, S],
        [S, S, P, P, P, P, P, P, S, S],
        [S, S, P, P, P, P, P, P, S, S],
        [S, S, P, P, P, P, P, P, S, S],
        [S, S, S, S, S, S, S, S, S, S],
        [S, S, S, S, S, S, S, S, S, S],
      ];
      if (expr === 'smug') {
        // Half-lidded: top 3 rows covered by eyelid
        map[0] = new Array(10).fill(null);
        map[1] = new Array(10).fill(null);
        map[2] = new Array(10).fill(P);
      } else if (expr === 'thinking') {
        // Pupil shifted slightly toward one side while keeping sclera border
        for (let v = 2; v <= 9; v++) {
          const hiRow = v === 2 || v === 3;
          map[v] = [S, P, P, hiRow ? HI : P, hiRow ? HI : P, P, P, S, S, S];
        }
      } else if (expr === 'embarrassed') {
        // Slightly smaller pupil core
        map[2] = [S, S, S, S, S, S, S, S, S, S];
        map[9] = [S, S, S, S, S, S, S, S, S, S];
      }
      return map;
    }

    // 1x detail (n <= 2): 6x6 even-stair eye map (1 col sclera left, 4 col centred pupil + highlight, 1 col sclera right)
    const map1x = [
      [S, S, S, S, S, S],
      [S, P, HI, P, P, S],
      [S, P, P, P, P, S],
      [S, P, P, P, P, S],
      [S, P, P, P, P, S],
      [S, S, S, S, S, S],
    ];
    if (expr === 'smug') {
      map1x[0] = [null, null, null, null, null, null];
      map1x[1] = [P, P, P, P, P, P];
    } else if (expr === 'thinking') {
      map1x[1] = [S, HI, P, P, S, S];
      map1x[2] = [S, P, P, P, S, S];
      map1x[3] = [S, P, P, P, S, S];
      map1x[4] = [S, P, P, P, S, S];
    }
    return map1x;
  };

  // Paint eyes & brows
  for (const sgn of [-1, 1]) {
    const isNearEye = (isDown && sgn > 0) || (!isDown && sgn < 0);
    const lx = 2.1 * sgn * HS;
    const [cx, cy] = projectWorld(lx, ff, eyeZ);

    const x0 = xRef + 2 * Math.round((cx - ew / 2 - xRef) / 2);
    const xMid = x0 + Math.floor(ew / 2);
    const stMid = slopeStep(xMid);
    const y0 = Math.round(cy - eh / 2 - stMid);

    const eyeMap = buildEyeGrid(sgn);
    for (let u = 0; u < ew; u++) {
      const x = x0 + u;
      const st = slopeStep(x);
      for (let v = 0; v < eh; v++) {
        paintPx(x, y0 + st + v, eyeMap[v][u]);
      }
    }

    // Surprised: extra sclera row top & bottom (+15% taller eye)
    if (expr === 'surprised') {
      for (let u = 0; u < ew; u++) {
        const x = x0 + u;
        const st = slopeStep(x);
        paintPx(x, y0 + st - 1, S);
        paintPx(x, y0 + st + eh, S);
      }
    }

    // Sad tear drop under near eye
    if (expr === 'sad' && isNearEye) {
      const tx = x0 + Math.floor(ew / 2);
      const tst = slopeStep(tx);
      paintPx(tx, y0 + tst + eh + 1, TEAR);
      if (isHiRes) {
        paintPx(tx + 1, y0 + tst + eh + 1, TEAR);
        paintPx(tx, y0 + tst + eh + 2, TEAR);
        paintPx(tx + 1, y0 + tst + eh + 2, TEAR);
      }
    }

    // Embarrassed sweat drop near temple
    if (expr === 'embarrassed' && isNearEye) {
      const sx = x0 + ew + (isHiRes ? 1 : 0);
      const sst = slopeStep(sx);
      paintPx(sx, y0 + sst, TEAR);
      paintPx(sx, y0 + sst + 1, TEAR);
    }

    // Blush pixels on cheeks for happy (explicit), laughing, wink, embarrassed
    if ((expr === 'happy' && isExplicitExpr) || expr === 'laughing' || expr === 'wink' || expr === 'embarrassed') {
      const bx0 = sgn < 0 ? x0 - (isHiRes ? 2 : 1) : x0 + ew - (isHiRes ? 2 : 1);
      const bw = isHiRes ? 4 : 2;
      for (let bu = 0; bu < bw; bu++) {
        const bx = bx0 + bu;
        const bst = slopeStep(bx);
        paintPx(bx, y0 + bst + eh + (isHiRes ? 1 : 0), BLUSH);
        if (isHiRes) paintPx(bx, y0 + bst + eh + 2, BLUSH);
      }
    }

    // Thin brows (core.py lines 446-452: 8px wide at n=4, 4px wide at n=2, 1px tall, middle arched 1px)
    const bw = isHiRes ? 8 : 4;
    const baseGap = isHiRes ? 3 : 2;
    let browLift = 0;
    if (expr === 'surprised') browLift = isHiRes ? -2 : -1;
    else if (expr === 'laughing' || (expr === 'happy' && isExplicitExpr)) browLift = -1;
    else if (expr === 'sleepy') browLift = 1;
    else if ((expr === 'wink' || expr === 'smug' || expr === 'thinking') && isNearEye) browLift = isHiRes ? -2 : -1;

    const y0B = y0 - baseGap + browLift;
    for (let u = 0; u < bw; u++) {
      const x = x0 + 1 + u;
      const st = slopeStep(x);
      const isInner = (sgn < 0 && u >= bw / 2) || (sgn > 0 && u < bw / 2);
      let dy = 0;
      if (expr === 'angry') {
        dy = isInner ? 1 : 0; // slanted inward and down
      } else if (expr === 'sad' || expr === 'embarrassed') {
        dy = isInner ? -1 : 0; // slanted inward and up
      } else {
        // Default thin arch from core.py: middle half lifted by 1px (connected 4px arch at 1x)
        const isMid = isHiRes ? (u >= 2 && u <= 5) : (u >= 1);
        dy = isMid ? -1 : 0;
      }
      paintPx(x, y0B + st + dy, BROW);
    }

    // Optional front glasses frame around each eye (thin projected 2:1 rim + vertical sides)
    if (look.glasses || look.accessory === 'glasses') {
      const gCol = look.accessoryColor || '#3a3340';
      for (let u = -1; u <= ew; u++) {
        const x = x0 + u;
        const st = slopeStep(x);
        paintPx(x, y0 + st - 1, gCol);
        paintPx(x, y0 + st + eh, gCol);
      }
      for (let v = 0; v < eh; v++) {
        const xL = x0 - 1;
        const xR = x0 + ew;
        paintPx(xL, y0 + slopeStep(xL) + v, gCol);
        paintPx(xR, y0 + slopeStep(xR) + v, gCol);
      }
    }
  }

  // Nose bridge & temple connector for glasses
  if (look.glasses || look.accessory === 'glasses') {
    const gCol = look.accessoryColor || '#3a3340';
    const [cxL] = projectWorld(-2.1 * HS, ff, eyeZ);
    const [cxR, cyR] = projectWorld(2.1 * HS, ff, eyeZ);
    const x0L = xRef + 2 * Math.round((cxL - ew / 2 - xRef) / 2);
    const x0R = xRef + 2 * Math.round((cxR - ew / 2 - xRef) / 2);
    const xMidR = x0R + Math.floor(ew / 2);
    const y0R = Math.round(cyR - eh / 2 - slopeStep(xMidR));
    const bridgeV = isHiRes ? 3 : 1;
    const bxStart = Math.min(x0L, x0R) + ew;
    const bxEnd = Math.max(x0L, x0R) - 1;
    for (let x = bxStart; x <= bxEnd; x++) {
      paintPx(x, y0R + slopeStep(x) + bridgeV, gCol);
    }
    // Connect outer rim of near eye to side temple arm at the head ridge
    const ridgeX = Math.round(X0 - 0.5);
    const nearOuter = isDown ? (Math.max(x0L, x0R) + ew) : (Math.min(x0L, x0R) - 1);
    const cStart = Math.min(nearOuter, ridgeX);
    const cEnd = Math.max(nearOuter, ridgeX);
    for (let x = cStart; x <= cEnd; x++) {
      paintPx(x, y0R + slopeStep(x) + bridgeV, gCol);
    }
  }

  const [cxM, cyM] = projectWorld(0, ff, mouthZ);
  const mw = isHiRes ? 10 : 6;
  const mh = isHiRes ? 2 : 1;
  const x0M = xRef + 2 * Math.round((cxM - mw / 2 - xRef) / 2);
  const xMidM = x0M + Math.floor(mw / 2);
  const stMidM = slopeStep(xMidM);
  const y0M = Math.round(cyM - mh / 2 - stMidM);

  // Thin projected mustache along 2:1 slope (for gus)
  if (look.mustache) {
    const mRmp = materialRamp(look.hair || '#e4e4ea');
    const musW = isHiRes ? 12 : 6;
    const musH = isHiRes ? 3 : 2;
    const mx0 = xRef + 2 * Math.round((cxM - musW / 2 - xRef) / 2);
    const my0 = y0M - (isHiRes ? 2 : 1);
    for (let u = 0; u < musW; u++) {
      const x = mx0 + u;
      const st = slopeStep(x);
      const isEnd = isHiRes ? (u <= 1 || u >= musW - 2) : (u === 0 || u === musW - 1);
      const droop = isEnd ? 1 : 0;
      for (let v = 0; v < musH; v++) {
        paintPx(x, my0 + st + v + droop, v === 0 ? mRmp.top : mRmp.left);
      }
    }
    return;
  }

  if (expr === 'laughing') {
    // Open mouth with tongue
    const omH = isHiRes ? 5 : 3;
    for (let u = 0; u < mw; u++) {
      const x = x0M + u;
      const st = slopeStep(x);
      for (let v = 0; v < omH; v++) {
        const isTongue = v >= Math.floor(omH / 2) && u >= Math.floor(mw * 0.2) && u < Math.ceil(mw * 0.8);
        paintPx(x, y0M + st + v, isTongue ? TONGUE : MOUTH);
      }
    }
  } else if (expr === 'surprised') {
    // Small round "O" mouth
    const ow = isHiRes ? 4 : 2;
    const oh = isHiRes ? 4 : 2;
    const ox0 = xMidM - Math.floor(ow / 2);
    for (let u = 0; u < ow; u++) {
      const x = ox0 + u;
      const st = slopeStep(x);
      for (let v = 0; v < oh; v++) {
        paintPx(x, y0M + st + v, MOUTH);
      }
    }
  } else if (expr === 'sleepy' || expr === 'thinking') {
    // Small off-centre line mouth
    const sw = isHiRes ? 6 : 3;
    const sx0 = x0M + (expr === 'sleepy' ? (isHiRes ? 3 : 1) : 0);
    for (let u = 0; u < sw; u++) {
      const x = sx0 + u;
      const st = slopeStep(x);
      for (let v = 0; v < mh; v++) {
        paintPx(x, y0M + st + v, MOUTH);
      }
    }
  } else if (expr === 'embarrassed') {
    // Wavy mouth
    for (let u = 0; u < mw; u++) {
      const x = x0M + u;
      const st = slopeStep(x);
      const wave = ((Math.floor(u / (isHiRes ? 2 : 1))) % 2 === 0) ? 0 : -1;
      for (let v = 0; v < mh; v++) {
        paintPx(x, y0M + st + v + wave, MOUTH);
      }
    }
  } else {
    // Line / smile / frown / smirk mouth along the 2:1 slope
    // Note: when !isExplicitExpr and expr === 'happy' (default idle player), keep the exact straight 2:1 line from face_8x.png!
    for (let u = 0; u < mw; u++) {
      const x = x0M + u;
      const st = slopeStep(x);
      const isLeftEnd = isHiRes ? (u < 2) : (u === 0);
      const isRightEnd = isHiRes ? (u >= mw - 2) : (u === mw - 1);
      let curve = 0;
      if (expr === 'happy' && isExplicitExpr) {
        if (isLeftEnd || isRightEnd) curve = -1;
      } else if (expr === 'sad' || expr === 'angry') {
        if (isLeftEnd || isRightEnd) curve = 1;
      } else if (expr === 'wink' || expr === 'smug') {
        if (isRightEnd) curve = -1;
      }
      for (let v = 0; v < mh; v++) {
        paintPx(x, y0M + st + v + curve, MOUTH);
      }
    }
  }
}

/**
 * Draws one character pose to a canvas at native `scale`.
 * Returns { canvas, ox, oy, cssW, cssH, scale } — (ox, oy) is the figure's ground centre in CSS pixels.
 */
export function renderCharacter(look, dir, pose, makeCanvas, scale = 1) {
  const safePose = pose || {};
  const rawParts = buildParts(look, safePose);
  const boxes = rawParts.map((p) => ({ p, wb: worldBoxCore(p, dir) }));

  // Compute CSS pixel bounding box
  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  for (const { wb } of boxes) {
    for (const wx of [wb.wx0, wb.wx1]) {
      for (const wy of [wb.wy0, wb.wy1]) {
        for (const wz of [wb.wz0, wb.wz1]) {
          const [sx, sy] = projectCss(wx, wy, wz);
          if (sx < minX) minX = sx;
          if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy;
          if (sy > maxY) maxY = sy;
        }
      }
    }
  }

  const M = 2;
  const ox = Math.ceil(-minX) + M;
  const oy = Math.ceil(-minY) + M;
  const cssW = Math.ceil(maxX - minX) + 2 * M;
  const cssH = Math.ceil(maxY - minY) + 2 * M;

  const S = Math.max(1, Math.round(scale * 100) / 100);
  const W = Math.max(1, Math.round(cssW * S));
  const H = Math.max(1, Math.round(cssH * S));

  const out = makeCanvas(W, H);
  const ctx = out.getContext('2d');
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Precompute fixed 4-shade material ramps for this character
  const ramps = {
    skin: skinRamp(look.skin || '#f0c49a'),
    hair: materialRamp(look.hair || '#5a3826'),
    shirt: materialRamp(look.shirt || '#4da3ff'),
    pants: materialRamp(look.pants || '#2c3e63'),
    shoe: materialRamp(look.shoe || '#f4f4f4'),
    gold: materialRamp(look.gold || '#f6c667'),
    under: materialRamp(look.under || '#f2ede4'),
  };

  for (let k = 0; k < boxes.length; k++) {
    const { p } = boxes[k];
    if (p.mat === 'skin') p.rmp = ramps.skin;
    else if (p.mat === 'hair') p.rmp = ramps.hair;
    else if (p.mat === 'shirt') p.rmp = ramps.shirt;
    else if (p.mat === 'pants') p.rmp = ramps.pants;
    else if (p.mat === 'shoe') p.rmp = ramps.shoe;
    else if (p.mat === 'gold') p.rmp = ramps.gold;
    else p.rmp = materialRamp(p.color);
  }

  // Pixel-art raycast resolution n:
  // n = S (so at scale=2 / DETAIL=1, n=2 => 1 unit = 4px across, 2px down;
  // at scale=4 / DETAIL=2, n=4 => 1 unit = 8px across, 4px down, matching core.py).
  const n = S;
  const X0 = Math.round(ox * n);
  const Y0 = Math.round(oy * n);

  // Camera constants matching core.py (AZ=45, EL=30)
  const ppu = 2 * n * Math.SQRT2;
  const cx = Math.sqrt(6) / 4;
  const cy = cx;
  const cz = 0.5;
  const rx = -Math.SQRT1_2;
  const ry = Math.SQRT1_2;
  const upx = -0.5 * Math.SQRT1_2;
  const upy = upx;
  const upz = Math.sqrt(3) / 2;

  const uMin = -(X0 + 0.5) / ppu;
  const vMax = (Y0 + 0.5) / ppu;

  const invDx = -1 / cx;
  const invDy = -1 / cy;
  const invDz = -2.0; // -1 / cz

  const totalPx = W * H;
  const pidGrid = new Int16Array(totalPx).fill(-1);
  const bestGrid = new Float32Array(totalPx).fill(1e9);
  const bandGrid = new Uint8Array(totalPx);

  let headIdx = -1;
  let headHdz = 0;
  let hitMinX = W;
  let hitMaxX = -1;
  let hitMinY = H;
  let hitMaxY = -1;

  // Orthographic ray-box intersection bounded to each box's 2D screen AABB
  for (let k = 0; k < boxes.length; k++) {
    const { p, wb } = boxes[k];
    if (p.slot === 'head') {
      headIdx = k;
      headHdz = p.dz || 0;
    }
    // Skip head-surface features attached to a face pointing away from the camera in this dir
    if (p.face === '-y' && (dir === 'down' || dir === 'right')) continue;
    if (p.face === '+y' && (dir === 'left' || dir === 'up')) continue;
    if (p.face === '+x' && (dir === 'up' || dir === 'right')) continue;
    if (p.face === '-x' && (dir === 'down' || dir === 'left')) continue;

    // 2D pixel bounding box of this 3D box
    const pxMin = Math.max(0, Math.floor(X0 + (wb.wy0 - wb.wx1) * 2 * n - 1));
    const pxMax = Math.min(W - 1, Math.ceil(X0 + (wb.wy1 - wb.wx0) * 2 * n + 1));
    const pyMin = Math.max(0, Math.floor(Y0 + (wb.wx0 + wb.wy0) * n - wb.wz1 * n * KZ - 1));
    const pyMax = Math.min(H - 1, Math.ceil(Y0 + (wb.wx1 + wb.wy1) * n - wb.wz0 * n * KZ + 1));
    if (pxMin < hitMinX) hitMinX = pxMin;
    if (pxMax > hitMaxX) hitMaxX = pxMax;
    if (pyMin < hitMinY) hitMinY = pyMin;
    if (pyMax > hitMaxY) hitMaxY = pyMax;

    const stepOx = rx / ppu;
    const stepOy = ry / ppu;

    for (let py = pyMin; py <= pyMax; py++) {
      const v = vMax - (py + 0.5) / ppu;
      const baseOx = v * upx + 220 * cx;
      const baseOy = v * upy + 220 * cy;
      const Oz = v * upz + 220 * cz;

      const tz1 = (wb.wz1 - Oz) * invDz;
      const tz0 = (wb.wz0 - Oz) * invDz;
      const tzEnter = tz1 < tz0 ? tz1 : tz0;
      const tzExit = tz1 > tz0 ? tz1 : tz0;

      const uStart = uMin + (pxMin + 0.5) / ppu;
      let Ox = uStart * rx + baseOx;
      let Oy = uStart * ry + baseOy;
      const rowOffset = py * W;

      for (let px = pxMin; px <= pxMax; px++) {
        const tx1 = (wb.wx1 - Ox) * invDx;
        const tx0 = (wb.wx0 - Ox) * invDx;
        const txEnter = tx1 < tx0 ? tx1 : tx0;
        const txExit = tx1 > tx0 ? tx1 : tx0;

        const ty1 = (wb.wy1 - Oy) * invDy;
        const ty0 = (wb.wy0 - Oy) * invDy;
        const tyEnter = ty1 < ty0 ? ty1 : ty0;
        const tyExit = ty1 > ty0 ? ty1 : ty0;

        const te = txEnter > tyEnter
          ? (txEnter > tzEnter ? txEnter : tzEnter)
          : (tyEnter > tzEnter ? tyEnter : tzEnter);
        const tx = txExit < tyExit
          ? (txExit < tzExit ? txExit : tzExit)
          : (tyExit < tzExit ? tyExit : tzExit);

        const idx = rowOffset + px;
        if (p.flushHead && pidGrid[idx] < 0) {
          Ox += stepOx;
          Oy += stepOy;
          continue;
        }
        if (te <= tx && te < bestGrid[idx]) {
          bestGrid[idx] = te;
          pidGrid[idx] = k;
          bandGrid[idx] = te === tzEnter ? 0 : (te === txEnter ? 1 : 2);
        }

        Ox += stepOx;
        Oy += stepOy;
      }
    }
  }

  // Base 3-tone shading + Pass 14b calm-accent pattern hooks
  const colorGrid = new Array(totalPx).fill(null);
  const basis = DIR_BASIS[dir] || DIR_BASIS.down;

  for (let py = hitMinY; py <= hitMaxY; py++) {
    const v = vMax - (py + 0.5) / ppu;
    const baseOx = v * upx + 220 * cx;
    const baseOy = v * upy + 220 * cy;
    const Oz = v * upz + 220 * cz;
    const rowOffset = py * W;

    for (let px = hitMinX; px <= hitMaxX; px++) {
      const idx = rowOffset + px;
      const k = pidGrid[idx];
      if (k < 0) continue;

      const { p } = boxes[k];
      const b = bandGrid[idx];
      const rmp = p.rmp;
      const bandKey = b === 0 ? 'top' : (b === 1 ? 'left' : 'right');

      if (p.slot === 'torso') {
        const u = uMin + (px + 0.5) / ppu;
        const te = bestGrid[idx];
        const hx = u * rx + baseOx - te * cx;
        const hy = u * ry + baseOy - te * cy;
        const hzHit = Oz - te * cz;
        const lx = hx * basis.rx + hy * basis.ry;
        const ly = hx * basis.fx + hy * basis.fy;
        const lz = hzHit - (p.dz || 0);
        colorGrid[idx] = evalTorsoColor(look, lx, ly, lz, b, ramps, n);
      } else if (p.slot === 'hair_cap' && b === 0 && TEXTURE_RULES.hair?.enabled !== false) {
        const u = uMin + (px + 0.5) / ppu;
        const te = bestGrid[idx];
        const hx = u * rx + baseOx - te * cx;
        const hy = u * ry + baseOy - te * cy;
        const iu = Math.floor(hx * n);
        const iv = Math.floor(hy * n);
        const tk = characterTexel('hair_cap', iu, iv, 'top', { detail: n >= 3 ? 2 : 1, cu: 0, cv: 0 });
        colorGrid[idx] = tk ? rmp[tk] : rmp.top;
      } else if (p.slot === 'mustache') {
        colorGrid[idx] = ramps.skin[bandKey];
      } else {
        colorGrid[idx] = rmp[bandKey];
      }
    }
  }

  // Outline pass:
  // 1) Interior depth outline (core.py lines 284-294: farther pixel next to nearer different group -> its own line color)
  // 2) Outer silhouette outline (boundary pixel next to transparency -> its own mid-tone line color, never near-black)
  const outColors = colorGrid.slice();
  const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let py = hitMinY; py <= hitMaxY; py++) {
    const rowOffset = py * W;
    for (let px = hitMinX; px <= hitMaxX; px++) {
      const idx = rowOffset + px;
      const k = pidGrid[idx];
      if (k < 0) continue;

      const myGroup = boxes[k].p.group;
      const myBest = bestGrid[idx];
      let isOutline = false;

      for (let d = 0; d < 4; d++) {
        const nx = px + DIRS4[d][0];
        const ny = py + DIRS4[d][1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) {
          isOutline = true;
          break;
        }
        const nIdx = ny * W + nx;
        const nk = pidGrid[nIdx];
        if (nk < 0) {
          isOutline = true;
          break;
        }
        if (boxes[nk].p.group !== myGroup && bestGrid[nIdx] < myBest - 0.5 && !(n < 2 && boxes[k].p.slot === 'hand')) {
          isOutline = true;
          break;
        }
      }

      if (isOutline) {
        outColors[idx] = boxes[k].p.rmp.line;
      }
    }
  }

  // Stamp front-plane 2:1 sloped face features onto the head
  applyFaceStamps(outColors, pidGrid, boxes, W, H, headIdx, dir, look, safePose, n, X0, Y0, headHdz);

  // Emit horizontal pixel runs to canvas within tight hit bounds (zero anti-aliasing, stays GPU-accelerated)
  for (let py = hitMinY; py <= hitMaxY; py++) {
    const rowOffset = py * W;
    let px = hitMinX;
    while (px <= hitMaxX) {
      const col = outColors[rowOffset + px];
      if (!col) {
        px++;
        continue;
      }
      let runEnd = px + 1;
      while (runEnd <= hitMaxX && outColors[rowOffset + runEnd] === col) {
        runEnd++;
      }
      ctx.fillStyle = col;
      ctx.fillRect(px, py, runEnd - px, 1);
      px = runEnd;
    }
  }

  out.scale = scale;
  return { canvas: out, ox, oy, cssW, cssH, scale };
}

export const MAX_CHARACTER_CACHE_SIZE = 256;
const cache = new Map();

export function clearCharacterCache() {
  cache.clear();
}

export function getCharacterCacheSize() {
  return cache.size;
}

registerCacheClearHook(clearCharacterCache);

/** Cached figure canvas for a look / facing / pose / scale. */
export function getCharacterCanvas(key, look, dir, pose, scale = 1) {
  const safePose = pose || {};
  const detail = getDetail();
  const effectiveScale = scale * detail;
  const expr = resolveExpression(safePose, look);
  const k = `${key}|${dir}|${safePose.stride || 0}|${safePose.sit ? 1 : 0}|${safePose.lie ? 1 : 0}|${safePose.blink ? 1 : 0}|${safePose.breathe || 0}|${safePose.action || ''}|${safePose.actionFrame || 0}|${safePose.emote || ''}|${Math.floor((safePose.emoteFrame || 0) * 2) % 12}|${expr}|${effectiveScale}`;
  const cached = cache.get(k);
  if (cached !== undefined) {
    cache.delete(k);
    cache.set(k, cached);
    return cached;
  }
  if (cache.size >= MAX_CHARACTER_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  const rendered = renderCharacter(look, dir, safePose, (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }, effectiveScale);
  cache.set(k, rendered);
  return rendered;
}
