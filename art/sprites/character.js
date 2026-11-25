// Player / guest character built from isometric blocks, projected exactly
// like the furniture (same 2:1 projection, same light from the upper left),
// so avatars read as solid 3D figures standing in the room.
//
// The model is a set of boxes in body space: a = side to side, b = forward
// (the way the avatar faces), z = height in pixels. One unit of a/b is 1/16
// of a tile. Each of the four facings is rendered natively (not mirrored), so
// the lit and shaded sides always match the room's lighting.
//
// Layering: a skin-toned base body (the "mannequin") is rendered once. Every
// wearable (ears, bottoms, shoes, tops, hair, accessories) is rendered on its
// own over the mannequin and only its own visible pixels are kept, so the
// parts that should be hidden behind the head or body stay hidden. Wearables
// are drawn in a grey ramp and tinted at runtime with the wardrobe colour;
// "trim" boxes (buttons, ties, lenses) keep fixed colours in a separate
// sprite. The renderer stacks: skin, ears, bottom, shoes, top, top trim, hair,
// face parts, accessory, accessory trim.
import { PixelCanvas, mix } from '../lib/canvas.js';
import { TINT, INK } from '../palette.js';

const LAYERS = ['skin', 'hair', 'top', 'bottom', 'shoes', 'ears', 'acc', 'trim'];
const ID = Object.fromEntries(LAYERS.map((n, i) => [n, i + 1]));
const GREY = (h) => parseInt(h.slice(1, 3), 16);
const G = { hi: GREY(TINT.hi), base: GREY(TINT.base), shade: GREY(TINT.shade), deep: GREY(TINT.deep), line: GREY(TINT.line) };

const CW = 64; // canvas size
const CH = 84;
const OX = CW / 2; // pivot: feet centre
const OY = CH - 12;
const U = 1 / 16; // body unit in tiles

// Body-space centre of the footprint (between the feet).
const CA = 3.5;
const CB = 2;

// Map body space (a, b) to iso (u, v) in tiles for each facing.
//   down  = faces +v (screen lower-left)    right = faces +u (screen lower-right)
//   up    = faces -v (away, upper-right)    left  = faces -u (away, upper-left)
const FACING = {
  down: (a, b) => [a, b],
  right: (a, b) => [b, -a],
  up: (a, b) => [-a, -b],
  left: (a, b) => [-b, a],
};

function project(u, v, z) {
  return [OX + (u - v) * U * 32, OY + (u + v) * U * 16 - z];
}

// Layer-aware canvas: colour = [grey, layerId, 0, 255]. Trim pixels also
// remember their real colour.
class BodyCanvas extends PixelCanvas {
  constructor(w, h) {
    super(w, h);
    this.trim = new Map();
    this.curTrim = null;
    this.depth = new Float32Array(w * h).fill(-Infinity);
  }

  // Scanline fill (same rule as PixelCanvas.poly) that only paints a pixel
  // when this surface is nearer the camera than what is already there.
  // depthAt(x, y) gives the surface depth at a pixel centre.
  polyDepth(pts, c, depthAt) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
      const cy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x < Math.ceil(xs[k + 1] - 0.5); x++) {
          if (!this.inside(x, y)) continue;
          const d = depthAt(x + 0.5, cy);
          const i = y * this.w + x;
          if (d <= this.depth[i] + 1e-6) continue;
          this.depth[i] = d;
          this.set(x, y, c);
        }
      }
    }
  }

  set(x, y, c) {
    super.set(x, y, c);
    if (!Array.isArray(c) || !this.inside(x | 0, y | 0)) return;
    const k = (y | 0) * this.w + (x | 0);
    if (c[1] === ID.trim) this.trim.set(k, this.curTrim); else this.trim.delete(k);
  }

  paint(pts, grey, layer) { this.poly(pts, [grey, ID[layer], 0, 255]); }
}

const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };

function drawBox(cv, map, box) {
  const { a0, a1, b0, b1, z0, z1, layer } = box;
  const c = [map(a0 - CA, b0 - CB), map(a1 - CA, b0 - CB), map(a1 - CA, b1 - CB), map(a0 - CA, b1 - CB)];
  const us = c.map((p) => p[0]);
  const vs = c.map((p) => p[1]);
  const u0 = Math.min(...us); const u1 = Math.max(...us);
  const v0 = Math.min(...vs); const v1 = Math.max(...vs);
  const P = (u, v, z) => project(u, v, z);
  const left = [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)];
  const right = [P(u1, v1, z1), P(u1, v0, z1), P(u1, v0, z0), P(u1, v1, z0)];
  const top = [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)];
  // Screen: x = OX + 2(u - v), y = OY + (u + v) - z (u, v in body units).
  // Every point on one pixel's view ray differs by (1, 1, 2), so u + v + z
  // grows toward the camera; recover (u, v, z) on each face plane from (x, y).
  const sx = (x) => (x - OX) / 2; // = u - v
  const depthLeft = (x, y) => { const v = v1; const u = sx(x) + v; const z = OY + u + v - y; return u + v + z; };
  const depthRight = (x, y) => { const u = u1; const v = u - sx(x); const z = OY + u + v - y; return u + v + z; };
  const depthTop = (x, y) => (y - OY + z1) + z1; // u + v = y - OY + z on the top plane
  const fill = (pts, grey, lay, depthAt) => cv.polyDepth(pts, [grey, ID[lay], 0, 255], depthAt);
  if (layer === 'trim') {
    const base = typeof box.colour === 'string' ? hexRgb(box.colour) : box.colour;
    const shadeOf = (k) => (base[3] < 255 ? base : hexRgb(mix(box.colour, k < 0 ? '#1a1024' : '#ffffff', Math.abs(k))));
    cv.curTrim = shadeOf(0); fill(left, 0, 'trim', depthLeft);
    cv.curTrim = shadeOf(-0.25); fill(right, 0, 'trim', depthRight);
    cv.curTrim = shadeOf(0.2); fill(top, 0, 'trim', depthTop);
    return;
  }
  // "dark" boxes use the next step down the ramp (stripes, pockets, folds)
  const tone = box.tone === 'dark' ? [G.base, G.shade, G.deep] : [G.hi, G.base, G.shade];
  fill(left, tone[1], layer, depthLeft);
  fill(right, tone[2], layer, depthRight);
  fill(top, box.top ?? tone[0], layer, depthTop);
}

// Paint details on the head face that points "forward" (b1 side) when visible.
// Each entry: [da, dz, w, h, colour] — da along a from a0, dz down from z1.
function frontDetail(cv, map, box, pixels, facing, r = null) {
  if (!faceVisible(r, facing)) return;
  for (const [da, dz, w, h, colour] of pixels) {
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        const [pa, pb, pz] = xfPoint(r, box.a0 + da + i + 0.5, box.b1, box.z1 - dz - j);
        const [u, v] = map(pa - CA, pb - CB);
        const z = pz;
        const [x, y] = project(u, v, z);
        const px = Math.round(x);
        const py = Math.round(y - 0.5);
        const d = u + v + z + 0.01; // on the head's front, a hair in front of it
        // one body unit spans 2 screen px horizontally on these faces
        for (const qx of [px - 1, px]) {
          if (!cv.inside(qx, py)) continue;
          const k = py * cv.w + qx;
          if (cv.depth && d <= cv.depth[k] - 0.5) continue; // something clearly nearer (a brim)
          if (cv.depth) cv.depth[k] = Math.max(cv.depth[k], d);
          cv.set(qx, py, colour);
        }
      }
    }
  }
}

// ---------- the rig ----------
// Shared geometry for one pose; the mannequin and every wearable are built
// from it so they line up exactly.

// Arm shapes. Each arm is a list of segments (shoulder first) plus a hand;
// `upper` segments are what a short sleeve covers.
//   side: -1 = left arm (a -2..0), +1 = right arm (a 7..9)
function arm(side, kind, zt, sw = 0) {
  const a0 = side < 0 ? -2 : 7;
  const a1 = a0 + 2;
  const out = side; // outward along a
  const at = (da = 0) => [a0 + da, a1 + da];
  const sg = ([x0, x1], b0, b1, z0, z1, upper = false) => ({ a0: x0, a1: x1, b0, b1, z0, z1, upper });
  const z = zt;
  switch (kind) {
    case 'forward':
    case 'reach': {
      const dz = kind === 'reach' ? -2 : 0;
      return {
        segs: [sg(at(), 0.5, 3.5, z + 11 + dz, z + 14 + dz, true), sg(at(), 3.5, 6.5, z + 11 + dz, z + 14 + dz)],
        hand: sg(at(), 6.5, 8, z + 11 + dz, z + 14 + dz),
      };
    }
    case 'up':
    case 'upLow':
    case 'wave0':
    case 'wave1': {
      const dz = kind === 'upLow' ? -3 : kind === 'wave1' ? -1 : 0;
      const da = kind === 'wave0' ? out * 1 : kind === 'wave1' ? out * 0.3 : 0;
      return {
        segs: [sg(at(da * 0.4), 0.5, 3.5, z + 12 + dz, z + 17 + dz, true), sg(at(da), 0.5, 3.5, z + 17 + dz, z + 24 + dz)],
        hand: sg(at(da), 0.5, 3.5, z + 24 + dz, z + 27 + dz),
      };
    }
    case 'mouth':
      return {
        segs: [sg(at(), 0.5, 3.5, z + 9, z + 15, true), sg(at(-out * 0.3), 3, 5.5, z + 12, z + 15)],
        hand: sg(at(-out * 0.6), 4.5, 6.3, z + 15, z + 18),
      };
    case 'clapIn':
    case 'clapOut':
    case 'heart': {
      const inward = kind === 'clapOut' ? 0 : -out * 1.2;
      const dz = kind === 'heart' ? 1 : 0;
      const hand = kind === 'clapOut' ? at() : side < 0 ? [1.5, 3.5] : [3.5, 5.5];
      return {
        segs: [sg(at(), 0.5, 3.5, z + 10 + dz, z + 13 + dz, true), sg(at(inward), 3.5, 5.8, z + 10 + dz, z + 13 + dz)],
        hand: sg(hand, 5.5, 7.2, z + 10 + dz, z + 13 + dz + (kind === 'heart' ? 1 : 0)),
      };
    }
    case 'thumbs':
      return {
        segs: [sg(at(), 0.5, 3.5, z + 11, z + 14, true), sg(at(), 3.5, 6, z + 11, z + 14)],
        hand: sg(at(), 6, 7.5, z + 12, z + 17),
      };
    case 'back':
      sw = -1.5;
    // falls through
    default: // 'down'
      return {
        segs: [sg(at(), 0.5 + sw, 3.5 + sw, z + 9, z + 15, true), sg(at(), 0.5 + sw, 3.5 + sw, z + 4, z + 9)],
        hand: sg(at(), 0.5 + sw, 3.5 + sw, z + 1, z + 4),
      };
  }
}

// Pose table: everything the renderer can ask for, per facing.
//   base  stand | sit      step/stride  leg stride      swing  arm swing
//   arms  [left, right]    pedal  -1/1 lifts a leg      xf  'lie' | 'swim'
export const POSES = {
  idle0: {},
  walk0: { step: -1, swing: -1 }, walk1: {}, walk2: { step: 1, swing: 1 }, walk3: {},
  run0: { step: -1, stride: 2, swing: -2 }, run1: {}, run2: { step: 1, stride: 2, swing: 2 }, run3: {},
  sit0: { base: 'sit' },
  lie0: { xf: 'lie' },
  swim0: { xf: 'swim', arms: ['forward', 'forward'] },
  swim1: { xf: 'swim', arms: ['forward', 'down'] },
  swim2: { xf: 'swim', arms: ['down', 'down'] },
  swim3: { xf: 'swim', arms: ['down', 'forward'] },
  eat0: { arms: ['down', 'mouth'] }, eat1: {},
  eatsit0: { base: 'sit', arms: ['down', 'mouth'] }, eatsit1: { base: 'sit' },
  use0: { arms: ['forward', 'forward'] }, use1: { arms: ['reach', 'reach'] },
  play0: { base: 'sit', arms: ['forward', 'reach'] }, play1: { base: 'sit', arms: ['reach', 'forward'] },
  pedal0: { base: 'sit', pedal: 1, arms: ['forward', 'forward'] }, pedal1: { base: 'sit', pedal: -1, arms: ['forward', 'forward'] },
  row0: { base: 'sit', arms: ['forward', 'forward'] }, row1: { base: 'sit', arms: ['back', 'back'] },
  wave0: { arms: ['down', 'wave0'] }, wave1: { arms: ['down', 'wave1'] },
  clap0: { arms: ['clapIn', 'clapIn'] }, clap1: { arms: ['clapOut', 'clapOut'] },
  cheer0: { arms: ['up', 'up'] }, cheer1: { arms: ['upLow', 'upLow'] },
  dance0: { step: -1, arms: ['up', 'down'] }, dance1: {}, dance2: { step: 1, arms: ['down', 'up'] }, dance3: {},
  thumbs0: { arms: ['down', 'thumbs'] },
  heart0: { arms: ['heart', 'heart'] },
};

// Which face sprites a pose uses (the head sits in the same place).
export const FACE_KIND = (pose) => (pose.startsWith('lie') ? 'lie'
  : pose.startsWith('swim') ? 'swim'
    : /^(sit|eatsit|play|pedal|row)/.test(pose) ? 'sit' : 'stand');

function rig(spec = {}) {
  const sit = spec.base === 'sit';
  const stride = spec.stride || 1;
  const step = spec.step || 0;
  const fwdL = step === -1 ? stride : step === 1 ? -stride : 0; // which leg strides forward
  const legs = [[0.5, 3, fwdL, 1], [4, 6.5, -fwdL, -1]].map(([a0, a1, f, which]) => {
    if (sit) {
      const lift = spec.pedal === which ? 2 : 0; // pedalling raises one knee
      return {
        a0, a1,
        thigh: { b0: 0.5, b1: 7, z0: 7 + lift, z1: 11 + lift },
        shin: { b0: 4.5, b1: 7, z0: 2 + lift, z1: 7 + lift },
        foot: { b0: 4.5, b1: 7, z0: lift, z1: 2 + lift },
        toe: { b0: 7, b1: 8, z0: lift, z1: 3 + lift },
      };
    }
    const zl = f > 0 ? Math.min(2, f) : 0; // the forward leg lifts
    return {
      a0, a1,
      leg: { b0: 0.5 + f, b1: 3.5 + f, z0: 2 + zl, z1: 13 },
      foot: { b0: 0.5 + f, b1: 3.5 + f, z0: zl, z1: 2 + zl },
      toe: { b0: 3.5 + f, b1: 4.5 + f, z0: zl, z1: 3 + zl },
      f, zl,
    };
  });
  const zt = sit ? 11 : 13; // torso base (hips)
  const swing = spec.swing || 0; // arms swing opposite to the legs
  const [kl, kr] = spec.arms || ['down', 'down'];
  const arms = [arm(-1, kl, zt, swing), arm(1, kr, zt, -swing)];
  const zh = zt + 16; // head base
  const head = { a0: 0, a1: 7, b0: -1, b1: 5, z0: zh, z1: zh + 12, layer: 'skin' };
  return { sit, legs, zt, zh, arms, head, xf: spec.xf || null };
}

// Whole-body transforms. Lying turns the standing figure onto its back
// along b (feet toward +b, face up); swimming cuts it at the waterline.
const LIE_FEET_B = 11;
const SWIM_CUT = 17;
function xfPoint(r, a, b, z) {
  if (!r || !r.xf) return [a, b, z];
  if (r.xf === 'lie') return [a, LIE_FEET_B - z / 2, 2 * (b + 2)];
  return [a, b, z - SWIM_CUT];
}
function xfBox(r, box) {
  if (!r || !r.xf) return box;
  if (r.xf === 'lie') {
    return { ...box, b0: LIE_FEET_B - box.z1 / 2, b1: LIE_FEET_B - box.z0 / 2, z0: 2 * (box.b0 + 2), z1: 2 * (box.b1 + 2) };
  }
  if (box.z1 <= SWIM_CUT) return null;
  return { ...box, z0: Math.max(box.z0, SWIM_CUT) - SWIM_CUT, z1: box.z1 - SWIM_CUT };
}
// A lying figure shows its face (on top) from every side.
function faceVisible(r, facing) {
  return (r && r.xf === 'lie') || facing === 'down' || facing === 'right';
}

const B = (layer) => (a0, a1, b0, b1, z0, z1, extra = {}) => ({ a0, a1, b0, b1, z0, z1, layer, ...extra });
// d > 0 puffs a garment out on every side (including the top) so it never
// ties in depth with the skin underneath.
const seg = (layer, a0, a1, s, d = 0, extra = {}) => ({ a0: a0 - d, a1: a1 + d, b0: s.b0 - d, b1: s.b1 + d, z0: s.z0, z1: s.z1 + d, layer, ...extra });

// Skin-toned base body: legs, bare feet, torso, arms, neck, head.
function mannequin(r) {
  const boxes = [];
  for (const l of r.legs) {
    for (const k of ['leg', 'thigh', 'shin', 'foot', 'toe']) if (l[k]) boxes.push(seg('skin', l.a0, l.a1, l[k]));
  }
  const skin = B('skin');
  boxes.push(skin(0, 7, 0, 4, r.zt, r.zt + 15));
  for (const a of r.arms) {
    for (const sgm of a.segs) boxes.push(skin(sgm.a0, sgm.a1, sgm.b0, sgm.b1, sgm.z0, sgm.z1));
    boxes.push(skin(a.hand.a0, a.hand.a1, a.hand.b0, a.hand.b1, a.hand.z0, a.hand.z1));
  }
  boxes.push(skin(2.5, 4.5, 1, 3, r.zt + 15, r.zt + 16)); // neck
  boxes.push(r.head);
  return boxes;
}

// ---------- wearables ----------
const D = 0.15; // garments sit this far proud of the body

const BOTTOMS = {
  pants: (r) => {
    const out = [B('bottom')(-D, 7 + D, -D, 4 + D, r.zt, r.zt + 3.5)];
    for (const l of r.legs) {
      if (l.leg) out.push(seg('bottom', l.a0, l.a1, { ...l.leg, z0: l.leg.z0 }, D));
      if (l.thigh) out.push(seg('bottom', l.a0, l.a1, l.thigh, D), seg('bottom', l.a0, l.a1, l.shin, D));
    }
    return out;
  },
  shorts: (r) => {
    const out = [B('bottom')(-D, 7 + D, -D, 4 + D, r.zt, r.zt + 3.5)];
    for (const l of r.legs) {
      if (l.leg) out.push(seg('bottom', l.a0, l.a1, { ...l.leg, z0: 8 }, D));
      if (l.thigh) out.push(seg('bottom', l.a0, l.a1, { ...l.thigh, b1: 4.5 }, D));
    }
    return out;
  },
  skirt: (r) => {
    const b = B('bottom');
    if (r.sit) return [b(-D, 7 + D, -D, 4 + D, r.zt, r.zt + 3.5), b(-0.6, 7.6, 0, 6, 7.5, r.zt + 2)];
    return [b(-D, 7 + D, -D, 4 + D, r.zt, r.zt + 3.5), b(-0.6, 7.6, -0.6, 4.6, 6, r.zt + 2)];
  },
};

const SHOES = {
  sneakers: (r) => r.legs.flatMap((l) => [
    seg('shoes', l.a0, l.a1, l.foot, D), seg('shoes', l.a0, l.a1, l.toe, D),
  ]),
  boots: (r) => r.legs.flatMap((l) => [
    seg('shoes', l.a0, l.a1, l.foot, D),
    seg('shoes', l.a0, l.a1, l.toe, D),
    l.leg ? seg('shoes', l.a0, l.a1, { ...l.leg, z0: l.foot.z1, z1: l.foot.z1 + 6 }, D + 0.1)
      : seg('shoes', l.a0, l.a1, { ...l.shin, z1: 6 }, D + 0.1),
  ]),
};

function torso(r, z1 = r.zt + 15) { return B('top')(-D, 7 + D, -D, 4 + D, r.zt + 3, z1 + D); }
function sleeves(r, long) {
  return r.arms.flatMap((a) => a.segs.filter((sg) => long || sg.upper)
    .map((sg) => B('top')(sg.a0 - D, sg.a1 + D, sg.b0 - D, sg.b1 + D, sg.z0 - (long ? 0 : 0), sg.z1 + D)));
}
// A detail on the front of the torso (b = 4 + D), as a thin box.
function front(layer, a0, a1, z0, z1, extra = {}) {
  return { a0, a1, b0: 4 + D, b1: 4 + D + 0.12, z0, z1, layer, ...extra };
}
const trim = (colour) => ({ colour });

const TOPS = {
  tee: (r) => [torso(r), ...sleeves(r, false)],
  tank: (r) => [torso(r, r.zt + 14)],
  sweater: (r) => {
    const out = [...sleeves(r, true)];
    // horizontal stripes: alternate plain and dark bands up the torso
    for (let z = r.zt + 3, i = 0; z < r.zt + 15; z += 3, i++) {
      out.push(B('top')(-D, 7 + D, -D, 4 + D, z, Math.min(r.zt + 15, z + 3), i % 2 ? { tone: 'dark' } : {}));
    }
    return out;
  },
  cardigan: (r) => [
    torso(r), ...sleeves(r, true),
    front('top', 3.2, 3.8, r.zt + 3, r.zt + 15, { tone: 'dark' }),
    front('trim', 2.6, 4.4, r.zt + 11, r.zt + 15, trim('#f4f1ea')), // shirt beneath
    ...[r.zt + 5, r.zt + 8].map((z) => front('trim', 3.35, 3.65, z, z + 1, trim('#e8d8b8'))),
  ],
  hoodie: (r) => [
    torso(r), ...sleeves(r, true),
    B('top')(1, 6, -1.4, 0.6, r.zt + 11, r.zt + 17), // hood resting on the back
    front('top', 1.5, 5.5, r.zt + 4, r.zt + 8, { tone: 'dark' }), // front pocket
    front('trim', 2.6, 2.8, r.zt + 9, r.zt + 13, trim('#f4f1ea')), // drawstrings
    front('trim', 4.2, 4.4, r.zt + 9, r.zt + 13, trim('#f4f1ea')),
  ],
  bellhop: (r) => [
    torso(r), ...sleeves(r, true),
    B('top')(1.6, 5.4, 0.6, 3.4, r.zt + 15, r.zt + 16.5), // stand-up collar
    ...[r.zt + 5, r.zt + 8, r.zt + 11].map((z) => front('trim', 3.2, 3.8, z, z + 1.4, trim('#e8b23a'))),
    ...[[-2, 0], [7, 9]].map(([x0, x1]) => B('trim')(x0 - D, x1 + D, 0.5 - D, 3.5 + D, r.zt + 14, r.zt + 15.4, trim('#e8b23a'))), // epaulettes
  ],
  labcoat: (r) => [
    torso(r), ...sleeves(r, true),
    B('top')(-0.35, 7.35, -0.35, 4.35, r.sit ? 9 : 6, r.zt + 3), // coat tails
    front('trim', 2.4, 4.6, r.zt + 10, r.zt + 15, trim('#f4f1ea')),
    front('top', 3.3, 3.7, r.sit ? 9 : 6, r.zt + 10, { tone: 'dark' }),
  ],
  dress: (r) => [
    torso(r), ...sleeves(r, false),
    B('top')(-0.7, 7.7, r.sit ? 0 : -0.7, r.sit ? 6.2 : 4.7, r.sit ? 7.5 : 5, r.zt + 4), // flared skirt
    front('top', -D, 7 + D, r.zt + 3, r.zt + 4.5, { tone: 'dark' }), // waist band
  ],
  suit: (r) => [
    torso(r), ...sleeves(r, true),
    front('trim', 2.3, 4.7, r.zt + 9, r.zt + 15, trim('#f4f1ea')), // shirt
    front('trim', 3.2, 3.8, r.zt + 5, r.zt + 14, { colour: '#a82a3e', b0: 4 + D + 0.12, b1: 4 + D + 0.24 }), // tie
    ...[r.zt + 5, r.zt + 7.5].map((z) => front('trim', 4.9, 5.3, z, z + 1, trim('#2a2030'))),
  ],
  // Worn after the changing room: a sporty swim top over swim shorts.
  swimsuit: (r) => [torso(r, r.zt + 12)],
};

const EARS = {
  normal: (r) => [
    B('ears')(-0.7, 0, 1.5, 3, r.zh + 4, r.zh + 8),
    B('ears')(7, 7.7, 1.5, 3, r.zh + 4, r.zh + 8),
  ],
  elf: (r) => [
    B('ears')(-0.7, 0, 1.5, 3, r.zh + 4, r.zh + 8),
    B('ears')(-1.4, -0.5, 1, 2.2, r.zh + 7, r.zh + 12),
    B('ears')(7, 7.7, 1.5, 3, r.zh + 4, r.zh + 8),
    B('ears')(7.5, 8.4, 1, 2.2, r.zh + 7, r.zh + 12),
  ],
};

const ACCESSORIES = {
  cap: (r) => [
    B('acc')(-0.7, 7.7, -1.7, 5.4, r.zh + 11, r.zh + 15.5),
    B('acc')(0.5, 6.5, 5.4, 8.2, r.zh + 11, r.zh + 12),
    B('acc')(3, 4, 1.4, 2.6, r.zh + 15.5, r.zh + 16.5, { tone: 'dark' }),
  ],
  beanie: (r) => [
    B('acc')(-0.7, 7.7, -1.7, 5.6, r.zh + 11, r.zh + 16),
    B('acc')(-0.85, 7.85, -1.85, 5.75, r.zh + 9, r.zh + 11.5, { tone: 'dark' }),
    B('acc')(2.8, 4.2, 1.2, 2.6, r.zh + 16, r.zh + 18.5),
  ],
  headphones: (r) => [
    B('acc')(-0.9, 7.9, 1.6, 2.6, r.zh + 14, r.zh + 15.5),
    B('acc')(-0.9, -0.4, 1.6, 2.6, r.zh + 8, r.zh + 14),
    B('acc')(7.4, 7.9, 1.6, 2.6, r.zh + 8, r.zh + 14),
    B('acc')(-1.5, -0.2, 0.9, 3.3, r.zh + 3, r.zh + 9, { tone: 'dark' }),
    B('acc')(7.2, 8.5, 0.9, 3.3, r.zh + 3, r.zh + 9, { tone: 'dark' }),
  ],
  bow: (r) => [
    B('acc')(4, 5, 0.4, 2.6, r.zh + 12.5, r.zh + 16),
    B('acc')(6, 7, 0.4, 2.6, r.zh + 12.5, r.zh + 16),
    B('acc')(5, 6, 1, 2, r.zh + 13.5, r.zh + 15, { tone: 'dark' }),
  ],
  earrings: (r) => [
    B('acc')(-0.95, -0.1, 1.8, 2.7, r.zh + 0.5, r.zh + 4),
    B('acc')(7.1, 7.95, 1.8, 2.7, r.zh + 0.5, r.zh + 4),
  ],
};

// ---------- hair styles ----------
// Head: a 0..7 (side to side), b -1..5 (back to face), z zh..zh+12.
// Each style is a set of hair blocks around the head plus a fringe painted on
// the face side: [da, dz, w, h] cells measured from the head's top-left.
const box = B('hair');

export const HAIR_STYLES = {
  classic: (z) => ({
    boxes: [box(-0.5, 7.5, -1.5, 1.5, z + 3, z + 13), box(-0.5, 7.5, -1.5, 5.5, z + 12, z + 14)],
    fringe: [[0, 0, 7, 3], [0, 3, 1, 2], [6, 3, 1, 3]],
  }),
  bob: (z) => ({
    boxes: [
      box(-0.5, 7.5, -1.5, 2, z + 1, z + 13), box(-0.5, 7.5, -1.5, 5.5, z + 12, z + 14),
      box(-0.75, 0.25, -1.5, 4.5, z + 1, z + 12), box(6.75, 7.75, -1.5, 4.5, z + 1, z + 12),
    ],
    fringe: [[0, 0, 7, 4], [0, 4, 1, 4], [6, 4, 1, 4]],
  }),
  long: (z) => ({
    boxes: [
      box(0, 7, -1.75, -0.75, z - 16, z + 4), // falls down the back
      box(-0.5, 7.5, -1.5, 1.5, z + 2, z + 13), box(-0.5, 7.5, -1.5, 5.5, z + 12, z + 14),
      box(-0.75, 0.25, -1.5, 3.5, z - 2, z + 12), box(6.75, 7.75, -1.5, 3.5, z - 2, z + 12),
    ],
    fringe: [[0, 0, 7, 2], [0, 2, 4, 2], [0, 4, 1, 5], [6, 2, 1, 6]],
  }),
  ponytail: (z) => ({
    boxes: [
      box(-0.5, 7.5, -1.5, 1.5, z + 4, z + 13), box(-0.5, 7.5, -1.5, 5.5, z + 12, z + 14),
      box(2.5, 4.5, -3.25, -1.5, z + 3, z + 11), // tail
      box(3, 4, -3, -2, z - 5, z + 4), // tip hanging down
    ],
    fringe: [[0, 0, 7, 2], [0, 2, 1, 2], [6, 2, 1, 2]],
  }),
  spiky: (z) => ({
    boxes: [
      box(-0.5, 7.5, -1.5, 1.5, z + 4, z + 13), box(-0.5, 7.5, -1.5, 5.5, z + 12, z + 13),
      ...[[0.25, -1], [2.75, -1.25], [5.25, -1], [1.5, 1.5], [4, 1.5], [0.25, 3.5], [2.75, 3.75], [5.25, 3.5]]
        .map(([a, b], i) => box(a, a + 1.5, b, b + 1.5, z + 13, z + 16 + (i % 3))),
    ],
    fringe: [[0, 0, 7, 1], [0, 1, 1, 2], [2, 1, 1, 2], [4, 1, 1, 2], [6, 1, 1, 3]],
  }),
  curls: (z) => ({
    boxes: [
      box(-1, 8, -2, 2, z + 1, z + 12), box(-1, 8, -2, 6, z + 11, z + 15),
      box(-1, 0, -2, 4.5, z + 2, z + 12), box(7, 8, -2, 4.5, z + 2, z + 12),
      ...[[0, -1], [3, -1.5], [6, -1], [1.5, 2], [4.5, 2], [0, 4.5], [3, 4.5], [6, 4.5]]
        .map(([a, b]) => box(a - 0.5, a + 1, b, b + 1.5, z + 15, z + 16.5)),
    ],
    fringe: [[0, 0, 7, 3], [1, 3, 1, 1], [3, 3, 1, 1], [5, 3, 1, 1], [0, 3, 1, 3], [6, 3, 1, 3]],
  }),
};

// Painter's order: further boxes first (smaller u+v of the centre), then lower.
function order(map, boxes) {
  return boxes
    .map((b) => {
      const [u, v] = map((b.a0 + b.a1) / 2 - CA, (b.b0 + b.b1) / 2 - CB);
      return { b, key: u + v };
    })
    .sort((x, y) => x.key - y.key || x.b.z0 - y.b.z0)
    .map((x) => x.b);
}

function outline(cv) {
  const edge = [];
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    if (!cv.opaque(x, y)) continue;
    if (!cv.opaque(x - 1, y) || !cv.opaque(x + 1, y) || !cv.opaque(x, y - 1) || !cv.opaque(x, y + 1)) edge.push([x, y]);
  }
  for (const [x, y] of edge) {
    const [, id] = cv.get(x, y);
    if (id === ID.trim) {
      const t = cv.trim.get(y * cv.w + x);
      if (t && t[3] === 255) cv.curTrim = [Math.round(t[0] * 0.55), Math.round(t[1] * 0.5), Math.round(t[2] * 0.6), 255];
      else cv.curTrim = t;
      cv.set(x, y, [0, id, 0, 255]);
    } else {
      cv.set(x, y, [G.line, id, 0, 255]);
    }
  }
}

/**
 * Render the mannequin plus some wearable boxes, then return the sprites for
 * the requested layers (only pixels that stay visible).
 */
function render(facing, r, extra = [], fringe = []) {
  const map = FACING[facing];
  const cv = new BodyCanvas(CW, CH);
  const boxes = [...mannequin(r), ...extra].map((b) => xfBox(r, b)).filter(Boolean);
  for (const b of order(map, boxes)) drawBox(cv, map, b);
  if (fringe.length) frontDetail(cv, map, r.head, fringe.map((f) => [...f, [G.base, ID.hair, 0, 255]]), facing, r);
  outline(cv);
  const out = {};
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const p = cv.get(x, y);
    if (!p) continue;
    const name = LAYERS[p[1] - 1];
    const layer = (out[name] ??= new PixelCanvas(CW, CH));
    if (name === 'trim') layer.set(x, y, cv.trim.get(y * CW + x) || [255, 0, 255, 255]);
    else layer.set(x, y, [p[0], p[0], p[0], 255]);
  }
  return out;
}

// ---------- faces ----------
// The face is a 14 x 12 pixel grid on the head's front (fx 0..13 across,
// fz 0..11 down). Features are hand-drawn masks placed on that grid and kept
// as separate sprites so any combination (eye colour, mouth, expression,
// blink) can be stacked at runtime.
//   K lid/ink  W white  H highlight  I iris (tinted)  B brow (tinted)
//   M mouth    T tongue L lips       R blush  F freckle  E teeth
const FACE_COLOURS = {
  K: INK, W: '#ffffff', H: '#ffffff', E: '#fbf6ee', M: '#7a2a3a', T: '#e8708a', L: '#d0485e',
  R: [240, 120, 140, 150], F: [150, 85, 60, 170],
  I: TINT.base, B: TINT.base, G: TINT.base,
  C: [205, 232, 255, 90], S: [28, 22, 40, 230],
};

// Glasses sit on the face grid around the eyes: G frame (tinted with the
// accessory colour), C clear lens, S dark sunglasses lens.
const GLASSES = {
  frame: ['GGGGGGGGGGGG', 'G...GGGG...G', 'G...G..G...G', 'GGGGG..GGGGG'],
  clear: ['............', '.CCC....CCC.', '.CCC....CCC.', '............'],
  dark: ['............', '.SSS....SSS.', '.SSS....SSS.', '............'],
};

const EYES = {
  open: { L: ['KKK', 'WHI', 'WII'], R: ['KKK', 'HIW', 'IIW'] },
  sparkle: { L: ['KKK', 'HIH', 'IIH'], R: ['KKK', 'HIH', 'HII'] },
  sharp: { L: ['...', 'KKK', 'WIK'], R: ['...', 'KKK', 'KIW'] },
  half: { L: ['...', 'KKK', 'WII'], R: ['...', 'KKK', 'IIW'] },
  closed: { L: ['...', '...', 'KKK'], R: ['...', '...', 'KKK'] },
  happy: { L: ['...', '.K.', 'K.K'], R: ['...', '.K.', 'K.K'] },
};
const EYE_AT = { L: [2, 5], R: [9, 5] };

// Brow styles; 'raised' variants sit one row higher, 'sad' is shared.
const BROW_SHAPES = {
  soft: { L: ['BBB'], R: ['BBB'] },
  thick: { L: ['BBB', 'BBB'], R: ['BBB', 'BBB'] },
  arched: { L: ['.B.', 'B.B'], R: ['.B.', 'B.B'] },
  thin: { L: ['.BB'], R: ['BB.'] },
};
const BROW_SAD = { L: ['..B', 'BB.'], R: ['B..', '.BB'] };

const MOUTHS = {
  smile: { at: [5, 9], rows: ['M..M', '.MM.'] },
  frown: { at: [5, 9], rows: ['.MM.', 'M..M'] },
  open: { at: [5, 9], rows: ['MMMM', 'MTTM', '.MM.'] },
  lips: { at: [5, 9], rows: ['LLLL', '.LL.'] },
  grin: { at: [4, 9], rows: ['MMMMMM', 'MEEEEM', '.MMMM.'] },
  cat: { at: [4, 9], rows: ['M.MM.M', '.M..M.'] },
  laugh: { at: [4, 9], rows: ['MMMMMM', 'MTTTTM', '.MMMM.'] },
  smug: { at: [5, 9], rows: ['...M', 'MMM.'] },
  sleepy: { at: [6, 10], rows: ['MM'] },
};

// Screen pixel for face cell (fx, fz) on the visible front of the head.
function facePixel(map, r, head, fx, fz) {
  const unit = Math.floor(fx / 2);
  const [pa, pb, pz] = xfPoint(r, head.a0 + unit + 0.5, head.b1, head.z1 - fz);
  const [u, v] = map(pa - CA, pb - CB);
  const [x, y] = project(u, v, pz);
  return [Math.round(x) - 1 + (fx % 2), Math.round(y - 0.5)];
}

function paintMask(cv, map, r, [fx0, fz0], rows, palette = FACE_COLOURS) {
  const { head } = r;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const c = palette[ch];
      const [x, y] = facePixel(map, r, head, fx0 + i, fz0 + j);
      cv.set(x, y, c);
    }
  });
}

// Face parts for one facing and body pose ('stand' or 'sit').
const FACE_SPECS = { stand: POSES.idle0, sit: POSES.sit0, lie: POSES.lie0, swim: POSES.swim0 };
function faceParts(facing, kind) {
  const map = FACING[facing];
  const head = rig(FACE_SPECS[kind]);
  const parts = {};
  const part = (name, paint) => {
    const cv = new PixelCanvas(CW, CH);
    paint(cv);
    parts[name] = cv;
  };
  const only = (keep) => Object.fromEntries(Object.entries(FACE_COLOURS).map(([k, v]) => [k, keep.includes(k) ? v : null]));
  for (const [shape, eye] of Object.entries(EYES)) {
    for (const side of ['L', 'R']) {
      part(`eye${side}_${shape}`, (cv) => paintMask(cv, map, head, EYE_AT[side], eye[side], only('KWH')));
      if (eye[side].some((r) => r.includes('I'))) {
        part(`iris${side}_${shape}`, (cv) => paintMask(cv, map, head, EYE_AT[side], eye[side], only('I')));
      }
    }
  }
  const brows = (name, shape, dz) => part(`brows_${name}`, (cv) => {
    paintMask(cv, map, head, [EYE_AT.L[0], dz], shape.L);
    paintMask(cv, map, head, [EYE_AT.R[0], dz], shape.R);
  });
  for (const [name, shape] of Object.entries(BROW_SHAPES)) {
    const tall = shape.L.length;
    brows(`${name}_normal`, shape, 4 - tall);
    brows(`${name}_raised`, shape, 3 - tall);
  }
  brows('sad', BROW_SAD, 2);
  for (const [name, m] of Object.entries(MOUTHS)) part(`mouth_${name}`, (cv) => paintMask(cv, map, head, m.at, m.rows));
  part('lashes', (cv) => {
    paintMask(cv, map, head, [1, 4], ['K', 'K']);
    paintMask(cv, map, head, [12, 4], ['K', 'K']);
  });
  part('blush', (cv) => {
    paintMask(cv, map, head, [1, 8], ['RR']);
    paintMask(cv, map, head, [11, 8], ['RR']);
  });
  part('glasses_frame', (cv) => paintMask(cv, map, head, [1, 4], GLASSES.frame));
  part('glasses_clear', (cv) => paintMask(cv, map, head, [1, 4], GLASSES.clear));
  part('glasses_dark', (cv) => paintMask(cv, map, head, [1, 4], GLASSES.dark));
  part('freckles', (cv) => {
    paintMask(cv, map, head, [1, 7], ['F.F', '.F.']);
    paintMask(cv, map, head, [10, 7], ['F.F', '.F.']);
  });
  return parts;
}

// ---------- build ----------

export const WEARABLES = {
  ears: EARS, bottom: BOTTOMS, shoes: SHOES, top: TOPS, acc: ACCESSORIES,
};

export default function build(add) {
  for (const facing of Object.keys(FACING)) {
    for (const [pose, spec] of Object.entries(POSES)) {
      const r = rig(spec);
      const at = (name) => `char/${facing}/${pose}/${name}`;
      add(at('skin'), render(facing, r).skin, [OX, OY]);
      // each wearable over the bare mannequin: keep its own visible pixels
      for (const [layer, styles] of Object.entries(WEARABLES)) {
        for (const [style, make] of Object.entries(styles)) {
          const out = render(facing, r, make(r));
          if (out[layer]) add(at(`${layer}_${style}`), out[layer], [OX, OY]);
          if (out.trim) add(at(`${layer}_${style}_trim`), out.trim, [OX, OY]);
        }
      }
      for (const [style, make] of Object.entries(HAIR_STYLES)) {
        const h = make(r.zh);
        const out = render(facing, r, h.boxes, h.fringe);
        if (out.hair) add(at(`hair_${style}`), out.hair, [OX, OY]);
      }
    }
    // faces: one set per head position, on the facings where the face shows
    for (const kind of Object.keys(FACE_SPECS)) {
      if (!faceVisible(rig(FACE_SPECS[kind]), facing)) continue;
      for (const [name, cv] of Object.entries(faceParts(facing, kind))) add(`face/${facing}/${kind}/${name}`, cv, [OX, OY]);
    }
  }
}
