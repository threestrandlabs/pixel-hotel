// Hero furniture: the sofa and the gym mirror, the two pieces that looked
// most broken before. Each rotation is a single sprite. Rotation 0 faces +v
// (screen lower-left); rotation 2 is the back view; 1 and 3 are mirrors.
import { objectCanvas, isoBox, mix } from '../lib/canvas.js';
import { r } from '../palette.js';

// Box spec helper: material ramp -> top/left/right faces + front edge highlight.
function mat(ramp, { lit = 1, edge = true } = {}) {
  return { top: ramp[lit], left: ramp[lit + 1], right: ramp[lit + 2], edge: edge ? ramp[0] : null };
}

// Flip a box along v for the back view (rotation 2).
function flipV(b, depth) {
  return { ...b, v0: depth - b.v1, v1: depth - b.v0 };
}

function drawBoxes(cv, P, boxes) {
  // painter's order: far boxes (small u+v) first, then lower boxes first
  const sorted = [...boxes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
    || (a.u0 + a.v0) - (b.u0 + b.v0) || a.z0 - b.z0);
  for (const b of sorted) isoBox(cv, P, b.u0, b.v0, b.u1, b.v1, b.z0, b.z1, b.m);
}

function sofa(back) {
  const fab = r('berry');
  const legs = r('walnut');
  const { cv, P, pivot } = objectCanvas(2, 1, 40);
  let boxes = [
    // legs
    { u0: 0.125, v0: 0.125, u1: 0.25, v1: 0.25, z0: 0, z1: 5, m: mat(legs, { edge: false }) },
    { u0: 1.75, v0: 0.125, u1: 1.875, v1: 0.25, z0: 0, z1: 5, m: mat(legs, { edge: false }) },
    { u0: 0.125, v0: 0.75, u1: 0.25, v1: 0.875, z0: 0, z1: 5, m: mat(legs, { edge: false }) },
    { u0: 1.75, v0: 0.75, u1: 1.875, v1: 0.875, z0: 0, z1: 5, m: mat(legs, { edge: false }) },
    // body
    { u0: 0.125, v0: 0.125, u1: 1.875, v1: 0.375, z0: 5, z1: 34, m: mat(fab), order: 1 }, // back rest
    { u0: 0.25, v0: 0.375, u1: 1.75, v1: 0.875, z0: 5, z1: 14, m: mat(fab, { lit: 1 }), order: 2 }, // seat base
    { u0: 0.25, v0: 0.375, u1: 1.0, v1: 0.875, z0: 14, z1: 19, m: mat(fab, { lit: 0 }), order: 3 }, // cushion L
    { u0: 1.0, v0: 0.375, u1: 1.75, v1: 0.875, z0: 14, z1: 19, m: mat(fab, { lit: 0 }), order: 3 }, // cushion R
    { u0: 0.0, v0: 0.125, u1: 0.25, v1: 0.875, z0: 5, z1: 24, m: mat(fab), order: 2 }, // arm far
    { u0: 1.75, v0: 0.125, u1: 2.0, v1: 0.875, z0: 5, z1: 24, m: mat(fab), order: 4 }, // arm near
  ];
  if (back) {
    boxes = boxes.map((b) => flipV(b, 1));
    // seen from behind, the back rest is now nearest: draw it last
    boxes.forEach((b) => { if (b.z1 === 34) b.order = 5; });
  }
  drawBoxes(cv, P, boxes);
  if (!back) {
    // button tufts on the back rest's front face
    for (const u of [0.55, 1.0, 1.45]) {
      const [x, y] = P(u, 0.375, 25);
      cv.set(Math.round(x), Math.round(y), fab[3]);
      cv.set(Math.round(x) + 1, Math.round(y), fab[3]);
    }
  }
  cv.selout(0.5);
  return { cv, pivot };
}

function gymMirror(back) {
  const chrome = r('chrome');
  const glass = r('glass');
  const { cv, P, pivot } = objectCanvas(1, 1, 80);
  const v0 = back ? 0.82 : 0.0;
  const v1 = back ? 1.0 : 0.18;
  // floor foot rail, then the frame slab
  isoBox(cv, P, 0.06, v0, 0.94, v1, 0, 4, mat(chrome, { lit: 2 }));
  isoBox(cv, P, 0.08, v0 + 0.02, 0.92, v1 - 0.02, 4, 76, mat(chrome, { lit: 1 }));
  if (!back) {
    // glass inset on the +v face, one continuous reflective panel
    const face = (u, z) => P(u, v1 - 0.02, z);
    const u0 = 0.14; const u1 = 0.86;
    const z0 = 8; const z1 = 72;
    cv.poly([face(u0, z1), face(u1, z1), face(u1, z0), face(u0, z0)], glass[2]);
    // vertical tone: brighter near the top like a lit room reflected
    for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
      const p = cv.get(x, y);
      if (!p || p[0] !== 0x8f || p[1] !== 0xc9) continue;
      const [, yTop] = face(u0, z1);
      const k = (y - yTop) / 70;
      let c = k < 0.35 ? glass[1] : k < 0.75 ? glass[2] : glass[3];
      // two parallel sheen streaks running up to the right
      const d = ((x - y * 0.5) % 40 + 40) % 40;
      if (d < 2) c = glass[0];
      else if (d > 7 && d < 9) c = mix(glass[0], glass[1], 0.5);
      cv.set(x, y, c);
    }
  } else {
    // painted backing board
    const face = (u, z) => P(u, v1 - 0.02, z);
    cv.poly([face(0.12, 72), face(0.88, 72), face(0.88, 8), face(0.12, 8)], mix(chrome[3], '#6a5281', 0.3));
  }
  cv.selout(0.45);
  return { cv, pivot };
}

export default function build(add) {
  for (const [name, fn] of Object.entries({ sofa, gym_mirror: gymMirror })) {
    const front = fn(false);
    const rear = fn(true);
    add(`furn/${name}/0`, front.cv, front.pivot);
    add(`furn/${name}/2`, rear.cv, rear.pivot);
  }
}
