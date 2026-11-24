// Tiny pixel-art canvas used to author the game's sprites.
// Runs in Node at build time (scripts/build-atlas.mjs) — never in the game.
//
// Conventions (see docs/art-direction.md):
// - 1 art pixel = 1 world pixel; a floor tile is a 64x32 diamond.
// - Iso projection P(u, v, z) = (ox + (u - v) * 32, oy + (u + v) * 16 - z),
//   u/v in tiles (use multiples of 1/8 so every corner lands on a whole pixel).
// - Light comes from the upper left: faces whose normal points +v (screen
//   lower-left) are the lit side, +u faces (screen lower-right) are shaded.

export function hex(c) {
  if (typeof c !== 'string') return c;
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  const r = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
  return `#${[r(0), r(1), r(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function darken(c, k) { return mix(c, '#1a1024', k); }
export function lighten(c, k) { return mix(c, '#fffaf0', k); }

export class PixelCanvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  set(x, y, c) {
    x |= 0; y |= 0;
    if (!this.inside(x, y) || c == null) return;
    const [r, g, b, a = 255] = hex(c);
    const i = (y * this.w + x) * 4;
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
  }

  get(x, y) {
    if (!this.inside(x, y)) return null;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  clear(x, y) {
    if (!this.inside(x, y)) return;
    this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  opaque(x, y) { return this.inside(x, y) && this.data[(y * this.w + x) * 4 + 3] > 0; }

  rect(x, y, w, h, c) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }

  // Scanline polygon fill sampled at pixel centres (half-open, so shapes that
  // share an edge tile together without gaps or double-covered pixels).
  poly(pts, c) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
      const cy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) {
          xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x < Math.ceil(xs[k + 1] - 0.5); x++) this.set(x, y, c);
      }
    }
  }

  // Bresenham line.
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Clean 2:1 iso line: two pixels across for every pixel up/down.
  isoLine(x0, y0, x1, y1, c) {
    const steps = Math.abs(x1 - x0);
    const dirX = Math.sign(x1 - x0) || 1;
    const dirY = Math.sign(y1 - y0);
    for (let i = 0; i < steps; i++) this.set(x0 + i * dirX, y0 + Math.floor(i / 2) * dirY, c);
  }

  // Draw an ASCII pixel map. `legend` maps characters to colours; '.' and ' '
  // are transparent.
  ascii(x, y, rows, legend) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        const c = legend[ch];
        if (c === undefined) throw new Error(`ascii: no colour for '${ch}'`);
        this.set(x + i, y + j, c);
      }
    });
  }

  // Selective outline: every opaque pixel touching transparency (4-neighbour)
  // is darkened toward its own hue, giving one cohesive silhouette per object.
  selout(k = 0.55) {
    const edge = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.opaque(x, y)) continue;
        if (!this.opaque(x - 1, y) || !this.opaque(x + 1, y) || !this.opaque(x, y - 1) || !this.opaque(x, y + 1)) {
          edge.push([x, y]);
        }
      }
    }
    for (const [x, y] of edge) {
      const [r, g, b] = this.get(x, y);
      const t = k;
      this.set(x, y, [Math.round(r * (1 - t) + 26 * t), Math.round(g * (1 - t) + 16 * t), Math.round(b * (1 - t) + 36 * t), 255]);
    }
    return this;
  }

  mirrored() {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        const j = (y * this.w + (this.w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) out.data[j + k] = this.data[i + k];
      }
    }
    return out;
  }

  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const p = src.get(x, y);
        if (p) this.set(dx + x, dy + y, p);
      }
    }
  }
}

// ---------- iso helpers ----------

export const HW = 32; // half tile width
export const HH = 16; // half tile height

// Projector for an object canvas whose footprint north corner sits at (ox, oy).
export function projector(ox, oy) {
  return (u, v, z = 0) => [ox + (u - v) * HW, oy + (u + v) * HH - z];
}

/**
 * Shaded iso box from (u0, v0) to (u1, v1) on the ground, z0..z1 in pixels.
 * Draws only the three visible faces: top, +v face (lit, left), +u face (shaded, right).
 */
export function isoBox(cv, P, u0, v0, u1, v1, z0, z1, { top, left, right, edge = null }) {
  const leftFace = [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)];
  const rightFace = [P(u1, v1, z1), P(u1, v0, z1), P(u1, v0, z0), P(u1, v1, z0)];
  const topFace = [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)];
  if (z1 > z0) {
    cv.poly(leftFace, left);
    cv.poly(rightFace, right);
  }
  cv.poly(topFace, top);
  if (edge) {
    // crisp highlight along the front-top edges
    const a = P(u0, v1, z1);
    const b = P(u1, v1, z1);
    const c = P(u1, v0, z1);
    cv.isoLine(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), edge);
    cv.isoLine(Math.round(b[0]), Math.round(b[1]) - 1, Math.round(c[0]), Math.round(c[1]) - 1, edge);
  }
}

// Canvas sized for a footprint (w x h tiles) plus `height` px above the floor.
export function objectCanvas(w, h, height, pad = 2) {
  const cw = (w + h) * HW + pad * 2;
  const ch = (w + h) * HH + height + pad * 2;
  const cv = new PixelCanvas(cw, ch);
  const ox = h * HW + pad;
  const oy = height + pad;
  return { cv, P: projector(ox, oy), pivot: [ox, oy] };
}

// Grow a ground tile by one pixel on every side (copying edge colours outward)
// so neighbouring tiles overlap slightly and never show hairline seams.
// Returns a new canvas 2px larger; shift the pivot by +1, +1.
export function bleed(cv) {
  const out = new PixelCanvas(cv.w + 2, cv.h + 2);
  out.blit(cv, 1, 1);
  const adds = [];
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    if (out.opaque(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = out.get(x + dx, y + dy);
      if (p) { adds.push([x, y, p]); break; }
    }
  }
  for (const [x, y, p] of adds) out.set(x, y, p);
  return out;
}
