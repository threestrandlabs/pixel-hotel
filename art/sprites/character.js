// Player / guest character built from isometric blocks, projected exactly
// like the furniture (same 2:1 projection, same light from the upper left),
// so avatars read as solid 3D figures standing in the room.
//
// The model is a set of boxes in body space: a = side to side, b = forward
// (the way the avatar faces), z = height in pixels. One unit of a/b is 1/16
// of a tile. Each of the four facings is rendered natively (not mirrored), so
// the lit and shaded sides always match the room's lighting.
//
// Every box belongs to a tint layer (skin, hair, top, bottom, shoes) or the
// fixed "face" layer. The figure is rendered once with a layer id per pixel,
// then split into one grey-ramp sprite per layer; the renderer tints each with
// the wardrobe colour. Pixels are disjoint, so layer stacking order is moot.
import { PixelCanvas } from '../lib/canvas.js';
import { TINT, INK } from '../palette.js';

const LAYERS = ['skin', 'hair', 'top', 'bottom', 'shoes', 'face'];
const ID = Object.fromEntries(LAYERS.map((n, i) => [n, i + 1]));
const GREY = (h) => parseInt(h.slice(1, 3), 16);
const G = { hi: GREY(TINT.hi), base: GREY(TINT.base), shade: GREY(TINT.shade), deep: GREY(TINT.deep), line: GREY(TINT.line) };

const CW = 56; // canvas size
const CH = 72;
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

// Layer-aware canvas: colour = [grey, layerId, 0, 255].
class BodyCanvas extends PixelCanvas {
  paint(pts, grey, layer) { this.poly(pts, [grey, ID[layer], 0, 255]); }
}

function drawBox(cv, map, box) {
  const { a0, a1, b0, b1, z0, z1, layer } = box;
  const c = [map(a0 - CA, b0 - CB), map(a1 - CA, b0 - CB), map(a1 - CA, b1 - CB), map(a0 - CA, b1 - CB)];
  const us = c.map((p) => p[0]);
  const vs = c.map((p) => p[1]);
  const u0 = Math.min(...us); const u1 = Math.max(...us);
  const v0 = Math.min(...vs); const v1 = Math.max(...vs);
  const P = (u, v, z) => project(u, v, z);
  const top = box.top ?? G.hi;
  // +v face (screen-left, lit) and +u face (screen-right, shaded)
  cv.paint([P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], G.base, layer);
  cv.paint([P(u1, v1, z1), P(u1, v0, z1), P(u1, v0, z0), P(u1, v1, z0)], G.shade, layer);
  cv.paint([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], top, layer);
}

// Paint details on the head face that points "forward" (b1 side) when visible.
// Each entry: [da, dz, w, h, colour] — da along a from a0, dz down from z1.
function frontDetail(cv, map, box, pixels, facing) {
  if (facing === 'up' || facing === 'left') return;
  for (const [da, dz, w, h, colour] of pixels) {
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        const [u, v] = map(box.a0 + da + i + 0.5 - CA, box.b1 - CB);
        const [x, y] = project(u, v, box.z1 - dz - j);
        const px = Math.round(x);
        const py = Math.round(y - 0.5);
        // one body unit spans 2 screen px horizontally on these faces
        cv.set(px - 1, py, colour);
        cv.set(px, py, colour);
      }
    }
  }
}

// ---------- the model ----------

function model(pose, step) {
  // step: -1, 0, +1 walking stride (which leg is forward)
  const sit = pose === 'sit';
  const boxes = [];
  if (sit) {
    // thighs forward along b, shins hanging down at the front
    boxes.push(
      { a0: 0.5, a1: 3, b0: 0.5, b1: 7, z0: 7, z1: 11, layer: 'bottom' },
      { a0: 4, a1: 6.5, b0: 0.5, b1: 7, z0: 7, z1: 11, layer: 'bottom' },
      { a0: 0.5, a1: 3, b0: 4.5, b1: 7, z0: 2, z1: 7, layer: 'bottom' },
      { a0: 4, a1: 6.5, b0: 4.5, b1: 7, z0: 2, z1: 7, layer: 'bottom' },
      // shoe = sole under the shin + toe cap in front of it (see standing legs)
      { a0: 0.5, a1: 3, b0: 4.5, b1: 7, z0: 0, z1: 2, layer: 'shoes' },
      { a0: 4, a1: 6.5, b0: 4.5, b1: 7, z0: 0, z1: 2, layer: 'shoes' },
      { a0: 0.5, a1: 3, b0: 7, b1: 8, z0: 0, z1: 3, layer: 'shoes' },
      { a0: 4, a1: 6.5, b0: 7, b1: 8, z0: 0, z1: 3, layer: 'shoes' },
    );
  } else {
    // legs swing along b; the forward leg also lifts a pixel
    const fwdL = step === -1 ? 1 : step === 1 ? -1 : 0;
    for (const [a0, a1, f] of [[0.5, 3, fwdL], [4, 6.5, -fwdL]]) {
      const zl = f > 0 ? 1 : 0;
      // A shoe is a sole directly under the leg (same centre, lower, so it is
      // drawn first and the leg stands on it) plus a toe cap in front of the
      // leg. One long box would paint its top face over the leg's base.
      boxes.push(
        { a0, a1, b0: 0.5 + f, b1: 3.5 + f, z0: zl, z1: 2 + zl, layer: 'shoes' },
        { a0, a1, b0: 0.5 + f, b1: 3.5 + f, z0: 2 + zl, z1: 13, layer: 'bottom' },
        { a0, a1, b0: 3.5 + f, b1: 4.5 + f, z0: zl, z1: 3 + zl, layer: 'shoes' },
      );
    }
  }
  const zt = sit ? 11 : 13; // torso base
  const swing = step || 0; // arms swing opposite to the legs
  boxes.push(
    { a0: 0, a1: 7, b0: 0, b1: 4, z0: zt, z1: zt + 3, layer: 'bottom' }, // hips / belt
    { a0: 0, a1: 7, b0: 0, b1: 4, z0: zt + 3, z1: zt + 15, layer: 'top' },
    { a0: -2, a1: 0, b0: 0.5 + swing, b1: 3.5 + swing, z0: zt + 4, z1: zt + 15, layer: 'top' },
    { a0: 7, a1: 9, b0: 0.5 - swing, b1: 3.5 - swing, z0: zt + 4, z1: zt + 15, layer: 'top' },
    { a0: -2, a1: 0, b0: 0.5 + swing, b1: 3.5 + swing, z0: zt + 1, z1: zt + 4, layer: 'skin' },
    { a0: 7, a1: 9, b0: 0.5 - swing, b1: 3.5 - swing, z0: zt + 1, z1: zt + 4, layer: 'skin' },
    { a0: 2.5, a1: 4.5, b0: 1, b1: 3, z0: zt + 15, z1: zt + 16, layer: 'skin' }, // neck
  );
  const zh = zt + 16; // head base
  const head = { a0: 0, a1: 7, b0: -1, b1: 5, z0: zh, z1: zh + 12, layer: 'skin' };
  boxes.push(head);
  return { boxes, head, zh };
}

// ---------- hair styles ----------
// Head: a 0..7 (side to side), b -1..5 (back to face), z zh..zh+12.
// Each style is a set of hair blocks around the head plus a fringe painted on
// the face side: [da, dz, w, h] cells measured from the head's top-left.
const box = (a0, a1, b0, b1, z0, z1) => ({ a0, a1, b0, b1, z0, z1, layer: 'hair' });

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
    const [g, id] = cv.get(x, y);
    if (id !== ID.face) cv.set(x, y, [G.line, id, 0, 255]);
    else cv.set(x, y, [g, id, 0, 255]);
  }
}

// style: a key of HAIR_STYLES, or null for the bald base figure.
function render(facing, pose, step, style = null) {
  const map = FACING[facing];
  const cv = new BodyCanvas(CW, CH);
  const { boxes, head, zh } = model(pose, step);
  const hairStyle = style ? HAIR_STYLES[style](zh) : { boxes: [], fringe: [] };
  for (const b of order(map, [...boxes, ...hairStyle.boxes])) drawBox(cv, map, b);

  // Fringe and face on the head's front.
  const hair = [G.base, ID.hair, 0, 255];
  const eye = [0, ID.face, 0, 255];
  const mouth = [1, ID.face, 0, 255];
  frontDetail(cv, map, head, [
    ...hairStyle.fringe.map((f) => [...f, hair]),
    [1.5, 6, 1, 2, eye], [4.5, 6, 1, 2, eye], [2.5, 9, 2, 1, mouth],
  ], facing);
  outline(cv);

  // Split into layer sprites.
  const out = {};
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const p = cv.get(x, y);
    if (!p) continue;
    const name = LAYERS[p[1] - 1];
    const layer = (out[name] ??= new PixelCanvas(CW, CH));
    if (name === 'face') layer.set(x, y, p[0] === 1 ? '#b4485a' : INK);
    else layer.set(x, y, [p[0], p[0], p[0], 255]);
  }
  return out;
}

export const CHARACTER_LAYERS = ['skin', 'bottom', 'shoes', 'top', 'hair', 'face'];

export default function build(add) {
  const poses = {
    idle0: ['stand', 0],
    walk0: ['stand', -1],
    walk1: ['stand', 0],
    walk2: ['stand', 1],
    walk3: ['stand', 0],
    sit0: ['sit', 0],
  };
  for (const facing of Object.keys(FACING)) {
    for (const [pose, [kind, step]] of Object.entries(poses)) {
      // Body layers come from the bald base figure; each hair style is
      // rendered over it on its own, and only its hair pixels are kept, so the
      // parts hidden behind the head or body stay hidden.
      const base = render(facing, kind, step, null);
      for (const name of CHARACTER_LAYERS) {
        if (name !== 'hair' && base[name]) add(`char/${facing}/${pose}/${name}`, base[name], [OX, OY]);
      }
      for (const style of Object.keys(HAIR_STYLES)) {
        const styled = render(facing, kind, step, style);
        if (styled.hair) add(`char/${facing}/${pose}/hair_${style}`, styled.hair, [OX, OY]);
      }
    }
  }
}
