// Furniture drawing kit. Items are described in their rotation-0 frame
// (front faces +v, screen lower-left); the kit renders both the front view
// (rotation 0) and the back view (rotation 2) from the same description.
//
//   item(add, 'sofa', [2, 1], 40, (k) => {
//     k.box(0, 0, 2, 0.3, 4, 34, M.berry, { front: (d) => d.rect(0.5, 1.5, 20, 28, '#...') });
//   });
//
// Coordinates: u in [0, w], v in [0, h] tiles; z in pixels above the floor.
// Primitives are depth-sorted (topologically, like the room renderer) so they
// can be declared in any order.
import { objectCanvas, mix } from './canvas.js';
import { r as ramp } from '../palette.js';

const HW = 32;
const HH = 16;

// ---------- materials ----------
// A material is a 5-step ramp: [highlight, light, base, shade, outline].
const extra = {
  ebony: ['#6b5a6e', '#45384c', '#2e2433', '#1f1824', '#120d16'],
  linen: ['#ffffff', '#f6f1e8', '#e3dccf', '#c2b8a8', '#8a7f72'],
  terracotta: ['#f2a77a', '#d97b4e', '#b65d39', '#8a432b', '#5a2b1f'],
  steel: ['#f4f7fa', '#c9d2dc', '#9aa6b4', '#6c7787', '#3f4656'],
  copper: ['#ffcf9e', '#e8955a', '#c46e3c', '#8f4b2a', '#5c2e1c'],
  crimson: ['#f2737a', '#d23f4f', '#a82a3e', '#781e33', '#4a1426'],
  azure: ['#a8e4ff', '#5ec2f2', '#2f98d6', '#2070a6', '#174b73'],
  lavender: ['#e8d8ff', '#c7b1f2', '#a38ad6', '#7b65ad', '#4f4075'],
  cedar: ['#e8a873', '#c9824f', '#a5633a', '#7a462b', '#4f2c1d'],
  slate: ['#9aa3ad', '#737d89', '#555e6a', '#3d444f', '#262b33'],
  bamboo: ['#f2e1a0', '#dcc27a', '#bfa158', '#927a3f', '#5e4e2a'],
  screen: ['#cfffe8', '#5ee8b0', '#1f9d78', '#114f44', '#0a2a28'],
  neonPink: ['#ffe0f4', '#ff8ad4', '#f04fae', '#b02f86', '#6a1c55'],
  neonCyan: ['#e0ffff', '#8af4ff', '#3fd2f0', '#2394b8', '#165a73'],
  sakura: ['#ffe6f0', '#ffc2da', '#f294bb', '#c9658f', '#87405f'],
  porcelain: ['#ffffff', '#f4f6fa', '#dfe4ee', '#b4bccb', '#7a8292'],
  red: ['#ff9a8a', '#ec5a4a', '#c73b34', '#922a2a', '#5c1c1e'],
  gold: ['#fff6c0', '#ffd86a', '#e8b23a', '#b07e26', '#6e4a1a'],
  felt: ['#8fe3a8', '#4fbf74', '#2f9656', '#1f6b3f', '#14432a'],
  dark: ['#5a5368', '#3c3648', '#2a2533', '#1c1823', '#100d14'],
  leaf: ['#c4ec8a', '#86cc58', '#55a344', '#3a7a3a', '#244c2a'],
  stone: ['#f4f0ea', '#dcd5ca', '#bdb3a6', '#948a80', '#5f5853'],
  sand: ['#fbecc8', '#ead29c', '#d4b478', '#ab8c5a', '#73603f'],
  orange: ['#ffd08a', '#ffa64a', '#ee7f2c', '#b85c22', '#733a18'],
  purple: ['#e2b8ff', '#b877f2', '#8b4fd0', '#62379b', '#3e2463'],
};
export const M = new Proxy({}, { get: (_, k) => extra[k] || ramp(k) });

// ---------- sorting ----------
function separated(a, b) {
  if (a.u1 <= b.u0 + 1e-6 || a.v1 <= b.v0 + 1e-6) return -1; // a behind b
  if (b.u1 <= a.u0 + 1e-6 || b.v1 <= a.v0 + 1e-6) return 1;
  return 0;
}

function sortPrims(prims) {
  const n = prims.length;
  const out = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = prims[i]; const b = prims[j];
      let s = separated(a, b);
      if (s === 0) {
        // overlapping footprints: lower first, then the one further back
        s = a.z0 !== b.z0 ? Math.sign(a.z0 - b.z0) || -1 : (a.u0 + a.v0) <= (b.u0 + b.v0) ? -1 : 1;
        if (a.after === b.id) s = 1;
        if (b.after === a.id) s = -1;
      }
      if (s < 0) { out[i].push(j); indeg[j]++; } else { out[j].push(i); indeg[i]++; }
    }
  }
  const res = [];
  const done = new Array(n).fill(false);
  while (res.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0) { pick = i; break; }
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i]) { pick = i; break; }
    done[pick] = true;
    res.push(prims[pick]);
    for (const t of out[pick]) indeg[t]--;
  }
  return res;
}

// ---------- the kit ----------
function makeKit(cv, P, h, back) {
  const prims = [];
  const V = (v) => (back ? h - v : v); // flip along v for the back view
  const span = (v0, v1) => (back ? [h - v1, h - v0] : [v0, v1]);

  // Face painter for details on a box. Planes: front (+v in rot 0), back
  // (-v), side (+u), top. Only planes that face the viewer are drawn.
  function faces(b) {
    const quadV = (v, u0, u1, z0, z1, c) => cv.poly([P(u0, v, z1), P(u1, v, z1), P(u1, v, z0), P(u0, v, z0)], c);
    return {
      // rectangle on the object's front face (v = b.v1 in rot 0)
      rect(u0, u1, z0, z1, c) { if (!back) quadV(b.v1, u0, u1, z0, z1, c); },
      // rectangle on the object's back face (v = b.v0 in rot 0)
      backRect(u0, u1, z0, z1, c) { if (back) quadV(h - b.v0, u0, u1, z0, z1, c); },
      // rectangle on the +u side face, v range in rot-0 coordinates
      side(v0, v1, z0, z1, c) {
        const [a, bb] = span(v0, v1);
        cv.poly([P(b.u1, a, z1), P(b.u1, bb, z1), P(b.u1, bb, z0), P(b.u1, a, z0)], c);
      },
      // rectangle on the top face
      top(u0, v0, u1, v1, c, z = b.z1) {
        const [a, bb] = span(v0, v1);
        cv.poly([P(u0, a, z), P(u1, a, z), P(u1, bb, z), P(u0, bb, z)], c);
      },
      // single projected pixel at (u, v, z), v in rot-0 coordinates
      px(u, v, z, c) { const [x, y] = P(u, V(v), z); cv.set(Math.round(x), Math.round(y), c); },
      // horizontal line of pixels on the front plane
      frontLine(u0, u1, z, c) { if (!back) { for (let u = u0; u <= u1; u += 1 / 64) { const [x, y] = P(u, b.v1, z); cv.set(Math.round(x), Math.round(y), c); } } },
      back,
    };
  }

  const k = {
    P, back, cv,
    // Box from (u0, v0) to (u1, v1), z0..z1. mat = 5-step ramp.
    box(u0, v0, u1, v1, z0, z1, mat, opts = {}) {
      const [a, b] = span(v0, v1);
      const id = prims.length;
      prims.push({
        id, u0, u1, v0: a, v1: b, z0, z1, after: opts.after,
        draw() {
          const lit = opts.lit ?? 1;
          const top = opts.top ?? mat[lit];
          const left = mat[Math.min(4, lit + 1)];
          const right = mat[Math.min(4, lit + 2)];
          if (z1 > z0) {
            cv.poly([P(u0, b, z1), P(u1, b, z1), P(u1, b, z0), P(u0, b, z0)], left);
            cv.poly([P(u1, b, z1), P(u1, a, z1), P(u1, a, z0), P(u1, b, z0)], right);
          }
          cv.poly([P(u0, a, z1), P(u1, a, z1), P(u1, b, z1), P(u0, b, z1)], top);
          if (opts.edge !== false && z1 - z0 > 2) {
            const e = mat[0];
            const p1 = P(u0, b, z1); const p2 = P(u1, b, z1); const p3 = P(u1, a, z1);
            cv.isoLine(Math.round(p1[0]), Math.round(p1[1]), Math.round(p2[0]), Math.round(p2[1]), mix(e, left, 0.35));
            cv.isoLine(Math.round(p2[0]), Math.round(p2[1]) - 1, Math.round(p3[0]), Math.round(p3[1]) - 1, mix(e, right, 0.5));
          }
          if (opts.front || opts.details) (opts.front || opts.details)(faces({ u0, u1, v0, v1, z0, z1 }));
        },
      });
      return id;
    },

    // Vertical cylinder centred at (cu, cv) with radius r tiles.
    cyl(cu, cv0, r, z0, z1, mat, opts = {}) {
      const cvv = V(cv0);
      const id = prims.length;
      prims.push({
        id, u0: cu - r, u1: cu + r, v0: cvv - r, v1: cvv + r, z0, z1, after: opts.after,
        draw() {
          const [cx, cyB] = P(cu, cvv, z0);
          const [, cyT] = P(cu, cvv, z1);
          const rx = r * HW * Math.SQRT2;
          const ry = r * HH * Math.SQRT2;
          for (let x = Math.ceil(cx - rx); x < cx + rx; x++) {
            const t = (x + 0.5 - cx) / rx;
            if (Math.abs(t) > 1) continue;
            const dy = ry * Math.sqrt(1 - t * t);
            const shade = t < -0.45 ? mat[1] : t < 0.35 ? mat[2] : mat[3];
            for (let y = Math.floor(cyT - dy); y < cyB + dy; y++) {
              const inTop = (y + 0.5 - cyT) ** 2 / (ry * ry) + ((x + 0.5 - cx) ** 2) / (rx * rx) <= 1;
              if (inTop) cv.set(x, y, opts.top ?? mat[0]);
              else if (y + 0.5 >= cyT && y + 0.5 <= cyB + dy) cv.set(x, y, shade);
            }
          }
          if (opts.details) opts.details({ cx, cyT, cyB, rx, ry });
        },
      });
      return id;
    },

    // Flat disc (ellipse) at height z, e.g. a table top or a plate.
    disc(cu, cv0, r, z, color, opts = {}) {
      const cvv = V(cv0);
      const id = prims.length;
      prims.push({
        id, u0: cu - r, u1: cu + r, v0: cvv - r, v1: cvv + r, z0: z, z1: z + 0.1, after: opts.after,
        draw() {
          const [cx, cy] = P(cu, cvv, z);
          const rx = r * HW * Math.SQRT2;
          const ry = r * HH * Math.SQRT2;
          for (let y = Math.floor(cy - ry); y < cy + ry; y++) {
            for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
              const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
              if (d <= 1) cv.set(x, y, opts.rim && d > 0.72 ? opts.rim : color);
            }
          }
        },
      });
      return id;
    },

    // Leafy clump: overlapping round lobes with top-left highlights.
    foliage(cu, cv0, z, r, mat, seed = 1, opts = {}) {
      const cvv = V(cv0);
      const id = prims.length;
      prims.push({
        id, u0: cu - r, u1: cu + r, v0: cvv - r, v1: cvv + r, z0: z - 8, z1: z + r * 40, after: opts.after,
        draw() {
          const [cx, cy] = P(cu, cvv, z);
          const R = r * HW * 1.25;
          let s = seed * 9301 + 49297;
          const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
          const lobes = [];
          const count = opts.lobes ?? 7;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rnd() * 0.6;
            const d = R * (0.35 + rnd() * 0.3);
            lobes.push([cx + Math.cos(a) * d, cy - R * 0.35 + Math.sin(a) * d * 0.6, R * (0.42 + rnd() * 0.18)]);
          }
          lobes.push([cx, cy - R * 0.55, R * 0.5]);
          lobes.sort((p, q) => p[1] - q[1]);
          for (const [lx, ly, lr] of lobes) {
            for (let y = Math.floor(ly - lr); y < ly + lr; y++) {
              for (let x = Math.floor(lx - lr); x < lx + lr; x++) {
                const dx = (x + 0.5 - lx) / lr; const dy = (y + 0.5 - ly) / lr;
                const d = dx * dx + dy * dy;
                if (d > 1) continue;
                const light = -dx * 0.6 - dy * 0.8;
                cv.set(x, y, light > 0.55 ? mat[0] : light > 0.05 ? mat[1] : d > 0.8 ? mat[3] : mat[2]);
              }
            }
          }
          if (opts.flowers) {
            for (let i = 0; i < opts.flowers.count; i++) {
              const x = Math.round(cx + (rnd() - 0.5) * R * 1.6);
              const y = Math.round(cy - R * 0.4 + (rnd() - 0.5) * R * 1.0);
              if (!cv.opaque(x, y)) continue;
              cv.set(x, y, opts.flowers.color);
              cv.set(x + 1, y, opts.flowers.color);
              cv.set(x, y - 1, opts.flowers.hi ?? opts.flowers.color);
            }
          }
        },
      });
      return id;
    },

    // Arbitrary drawing in projected space, sorted like a box with the given bounds.
    custom(u0, v0, u1, v1, z0, z1, fn) {
      const [a, b] = span(v0, v1);
      prims.push({ id: prims.length, u0, u1, v0: a, v1: b, z0, z1, draw: () => fn({ P: (u, v, z) => P(u, V(v), z), cv, back }) });
    },

    draw() { for (const p of sortPrims(prims)) p.draw(); },
  };
  return k;
}

/**
 * Register an item's rotation 0 and rotation 2 sprites.
 * @param {(k) => void} describe draws the item in its rotation-0 frame.
 * @param {object} [opts] { symmetric: true } reuses the front view for the back.
 */
export function item(add, id, [w, h], height, describe, opts = {}) {
  const views = opts.symmetric ? [false] : [false, true];
  for (const back of views) {
    const { cv, P, pivot } = objectCanvas(w, h, height);
    const k = makeKit(cv, P, h, back);
    describe(k);
    k.draw();
    if (opts.post) opts.post(cv, back);
    cv.selout(opts.selout ?? 0.5);
    add(`furn/${id}/${back ? 2 : 0}`, cv, pivot);
    if (opts.symmetric) add(`furn/${id}/2`, cv, pivot);
  }
}
