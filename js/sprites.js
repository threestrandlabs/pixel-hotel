// Procedural pixel-art generator. Everything here is computed from code —
// rectangles / circles / diamonds plotted onto small logical-pixel grids —
// there are no external image/sound assets anywhere in this project.
//
// A "sprite" is { w, h, px } where px is a Uint8-ish 2D array (row-major,
// px[y][x]) holding a palette key string or null (transparent). Grids are
// drawn with crisp square blocks by render.js, which is what gives the
// chunky retro-pixel look (no smoothing, no sub-pixel positions).

function makeGrid(w, h) {
  const px = [];
  for (let y = 0; y < h; y++) px.push(new Array(w).fill(null));
  return { w, h, px };
}

function fillRect(sprite, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= sprite.h) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= sprite.w) continue;
      sprite.px[yy][xx] = color;
    }
  }
}

function setPixel(sprite, x, y, color) {
  if (x < 0 || y < 0 || x >= sprite.w || y >= sprite.h) return;
  sprite.px[y][x] = color;
}

function fillCircle(sprite, cx, cy, r, color) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r * r) setPixel(sprite, x, y, color);
    }
  }
}

function fillPolygon(sprite, points, color) {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1]))));
  const maxY = Math.min(sprite.h - 1, Math.ceil(Math.max(...points.map((p) => p[1]))));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i += 2) {
      const xStart = Math.round(xs[i]);
      const xEnd = Math.round(xs[i + 1]);
      for (let x = Math.max(0, xStart); x < Math.min(sprite.w, xEnd); x++) setPixel(sprite, x, y, color);
    }
  }
}

function fillDiamond(sprite, cx, cy, halfW, halfH, color) {
  for (let y = -halfH; y <= halfH; y++) {
    const widthAtY = halfW * (1 - Math.abs(y) / halfH);
    for (let x = -widthAtY; x <= widthAtY; x++) {
      setPixel(sprite, Math.round(cx + x), Math.round(cy + y), color);
    }
  }
}

function outline(sprite, color) {
  // Adds a 1px outline around any opaque pixel that borders transparency.
  const out = makeGrid(sprite.w, sprite.h);
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) out.px[y][x] = sprite.px[y][x];
  }
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      if (sprite.px[y][x]) continue;
      const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= sprite.w || ny >= sprite.h) continue;
        if (sprite.px[ny][nx]) {
          out.px[y][x] = color;
          break;
        }
      }
    }
  }
  return out;
}

function shade(hex, amt) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + v * amt)));
  r = f(r); g = f(g); b = f(b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ---------- Floor / wall tiles ----------

export const ISO = { TILE_W: 64, TILE_H: 32, WALL_H: 56 };

export function buildFloorTile(baseColor, variant = 0) {
  const w = ISO.TILE_W;
  const h = ISO.TILE_H;
  const s = makeGrid(w, h);
  fillDiamond(s, w / 2, h / 2 - 0.5, w / 2 - 0.5, h / 2 - 0.5, baseColor);
  const light = shade(baseColor, 0.18);
  const dark = shade(baseColor, -0.16);
  // subtle facets: lighten top-left half, darken bottom-right half
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!s.px[y][x]) continue;
      const nx = x - w / 2;
      const ny = y - h / 2;
      if (nx + ny * 2 < -6) s.px[y][x] = light;
      else if (nx + ny * 2 > 10) s.px[y][x] = dark;
    }
  }
  if (variant % 2 === 0) {
    setPixel(s, w / 2, h / 2, shade(baseColor, 0.3));
  }
  return s;
}

export function buildDoorTile(baseColor) {
  const s = buildFloorTile(baseColor, 1);
  const w = ISO.TILE_W, h = ISO.TILE_H;
  const mat = '#9c4a3c';
  fillDiamond(s, w / 2, h / 2, w / 2 - 8, h / 2 - 5, mat);
  fillDiamond(s, w / 2, h / 2, w / 2 - 12, h / 2 - 7, shade(mat, 0.15));
  return s;
}

// Each wall tile is a parallelogram, not a rectangle: adjacent room tiles are
// offset on screen by (TILE_W/2, TILE_H/2), so a rectangular slab would leave
// a staircase of gaps/overlaps along the back wall. Extruding the diamond's
// north-east edge (for the north wall) or north-west edge (for the west
// wall) upward by WALL_H gives a face whose side edges land exactly on the
// neighboring tile's face, producing one continuous slanted wall.
//
// Anchor: local (w/2, WALL_H + TILE_H/2) is the "north" diamond point at
// floor level — callers align that point with the tile's floor center.
export function buildWallSegment(baseColor, kind = 'north') {
  const w = ISO.TILE_W;
  const h = ISO.WALL_H + ISO.TILE_H;
  const s = makeGrid(w, h);
  const bodyColor = kind === 'north' ? baseColor : shade(baseColor, -0.1);
  const trim = shade(bodyColor, 0.22);

  const north = [w / 2, ISO.WALL_H];
  const side = kind === 'north' ? [w, ISO.WALL_H + ISO.TILE_H / 2] : [0, ISO.WALL_H + ISO.TILE_H / 2];
  const northUp = [north[0], north[1] - ISO.WALL_H];
  const sideUp = [side[0], side[1] - ISO.WALL_H];

  fillPolygon(s, [northUp, sideUp, side, north], bodyColor);
  // plank shading lines run parallel to the wall's slanted base, not the screen
  const baseY = (x) => Math.round(ISO.WALL_H + (kind === 'north' ? (x - w / 2) / 2 : (w / 2 - x) / 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (s.px[y][x] && (baseY(x) - y) % 7 === 6) s.px[y][x] = shade(bodyColor, -0.14);
    }
  }
  // a thin highlight along the top (ceiling) edge of the wall
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (s.px[y][x]) { s.px[y][x] = trim; break; }
    }
  }
  // dark baseboard where the wall meets the floor
  for (let x = 0; x < w; x++) {
    let last = -1;
    for (let y = 0; y < h; y++) if (s.px[y][x]) last = y;
    for (let y = last - 3; y <= last; y++) if (y >= 0 && s.px[y][x]) s.px[y][x] = shade(bodyColor, -0.32);
  }
  return s;
}

export const WALL_ANCHOR_Y = ISO.WALL_H + ISO.TILE_H / 2;

// Wall-plane mapping for one wall tile: (u along the wall 0..1, t up the wall
// 0..1) <-> sprite pixels. Everything drawn through it follows the wall's
// slant, so window parts converge with the wall instead of floating on it.
function wallPlane(kind) {
  const sgn = kind === 'north' ? 1 : -1;
  const W2 = ISO.TILE_W / 2;
  return {
    P: (u, t) => [W2 + sgn * W2 * u, ISO.WALL_H + (ISO.TILE_H / 2) * u - ISO.WALL_H * t],
    inv: (x, y) => {
      const u = sgn * (x - W2) / W2;
      return [u, (ISO.WALL_H + (ISO.TILE_H / 2) * u - y) / ISO.WALL_H];
    },
  };
}

// A recessed window cut into the wall plane: architrave, a left reveal and
// inner sill visible through the opening, sky-gradient panes with sash bars and
// glare, a projecting stone sill and lintel (top + front + end faces).
// `sky` = { top, bottom } hex colours.
export function buildWindowSegment(baseColor, sky, kind = 'north') {
  const s = buildWallSegment(baseColor, kind);
  const body = kind === 'north' ? baseColor : shade(baseColor, -0.1);
  const { P, inv } = wallPlane(kind);
  const poly = (ua, ub, ta, tb, o = [0, 0]) => [[ua, ta], [ub, ta], [ub, tb], [ua, tb]]
    .map(([u, t]) => { const [x, y] = P(u, t); return [x + o[0], y + o[1]]; });
  const U0 = 0.16, U1 = 0.84, T0 = 0.32, T1 = 0.82;
  const frame = '#f1e6d2';
  const sgn = kind === 'north' ? 1 : -1;

  // architrave (flush with the wall): lit left jamb/head, shaded right jamb
  fillPolygon(s, poly(U0 - 0.07, U1 + 0.07, T0 - 0.06, T1 + 0.06), shade(frame, -0.05));
  fillPolygon(s, poly(U1, U1 + 0.07, T0 - 0.06, T1 + 0.06), shade(frame, -0.2));
  // opening: depth goes into the wall, which shifts the pane up the wall's depth axis
  const sx = sgn * 3.4, sy = -1.7;
  const lo = (a, b, c) => Math.max(a, Math.min(b, c));
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (!s.px[y][x]) continue;
      const [u, t] = inv(x + 0.5, y + 0.5);
      if (u < U0 || u > U1 || t < T0 || t > T1) continue;
      const [pu, pt] = inv(x + 0.5 - sx, y + 0.5 - sy);
      if (pu < U0) { s.px[y][x] = shade(body, -0.38); continue; } // side reveal
      if (pt < T0) { s.px[y][x] = shade(frame, -0.1); continue; } // inner sill, lit from above
      const nu = lo(0, 1, (pu - U0) / (U1 - U0)), nt = lo(0, 1, (pt - T0) / (T1 - T0));
      if (nu < 0.07 || nu > 0.93 || nt < 0.06 || nt > 0.94 || Math.abs(nu - 0.5) < 0.05 || Math.abs(nt - 0.5) < 0.045) {
        s.px[y][x] = (nu < 0.5 || nt > 0.5) ? shade(frame, -0.08) : shade(frame, -0.28); // lit top/left, shaded bottom/right
        continue;
      }
      let c = mixHex(sky.bottom, sky.top, nt);
      const g = nu * 0.8 + nt * 0.5;
      if (g > 0.9 && g < 1.05) c = shade(c, 0.22);
      else if (g > 1.12 && g < 1.2) c = shade(c, 0.12);
      if (nt > 0.88) c = shade(c, -0.14); // shadow under the lintel
      s.px[y][x] = c;
    }
  }
  // projecting slab: top face, front face and the end cap that faces the viewer
  const slab = (ua, ub, ta, tb, pr, color) => {
    const out = [-sgn * ISO.TILE_W / 2 * pr, ISO.TILE_H / 2 * pr]; // outward = toward the viewer
    const sh = (p) => [p[0] + out[0], p[1] + out[1]];
    fillPolygon(s, [P(ua, tb), P(ub, tb), sh(P(ub, tb)), sh(P(ua, tb))], shade(color, 0.12));
    fillPolygon(s, [P(ub, tb), P(ub, ta), sh(P(ub, ta)), sh(P(ub, tb))], shade(color, -0.3));
    fillPolygon(s, poly(ua, ub, ta, tb, out), color);
  };
  fillPolygon(s, poly(0.07, 0.95, T0 - 0.2, T0 - 0.15), shade(body, -0.22)); // wall shadow under the sill
  slab(0.07, 0.93, T0 - 0.15, T0 - 0.05, 0.16, shade(frame, -0.12));
  slab(U0 - 0.1, U1 + 0.1, T1 + 0.06, T1 + 0.13, 0.12, shade(frame, -0.12));
  return s;
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
}

// A wall segment with a framed doorway cut into it. Wall bases run along the
// same slanted line as buildWallSegment, so the frame sits flush on the floor edge.
export function buildDoorSegment(baseColor, kind = 'north') {
  const s = buildWallSegment(baseColor, kind);
  const frame = '#6a3f22';
  const frameLight = '#f0c27a';
  const xl = kind === 'north' ? 35 : 3;
  const xr = xl + 26;
  const doorH = 46;
  for (let x = xl; x < xr; x++) {
    const base = Math.round(ISO.WALL_H + (kind === 'north' ? (x - 32) / 2 : (32 - x) / 2)) - 1;
    for (let y = base - doorH; y <= base; y++) {
      const post = x < xl + 4 || x >= xr - 4 || y < base - doorH + 4;
      let c = post ? (x === xl || y === base - doorH ? frameLight : frame) : '#2b1d2e';
      if (!post && y > base - 5) c = '#d9a65a'; // warm light spilling under the door
      setPixel(s, x, y, c);
    }
  }
  return s;
}

// ---------- Furniture ----------

function basicBox(w, h, topH, topColor, sideColorL, sideColorR) {
  const s = makeGrid(w, h);
  fillRect(s, 0, 0, w, topH, topColor);
  fillRect(s, 0, topH, Math.floor(w / 2), h - topH, sideColorL);
  fillRect(s, Math.floor(w / 2), topH, w - Math.floor(w / 2), h - topH, sideColorR);
  return s;
}

export function buildStoolSprite() {
  const s = makeGrid(28, 30);
  fillDiamond(s, 14, 10, 12, 7, '#caa05a');
  fillDiamond(s, 14, 10, 8, 4, shade('#caa05a', 0.2));
  fillRect(s, 6, 13, 4, 12, '#8a6a3a');
  fillRect(s, 18, 13, 4, 12, '#6e5327');
  fillRect(s, 10, 13, 4, 14, '#7a5d31');
  return s;
}

export function buildLampSprite() {
  const s = makeGrid(20, 38);
  fillRect(s, 2, 34, 16, 4, '#4a4a4a');
  fillRect(s, 9, 16, 2, 18, '#6a6a6a');
  fillCircle(s, 10, 11, 9, '#ff9f5a');
  fillCircle(s, 10, 11, 5, '#ffd79a');
  return s;
}

export function buildPlantSprite() {
  const s = makeGrid(24, 34);
  fillRect(s, 6, 24, 12, 10, '#a6703a');
  fillRect(s, 6, 24, 12, 3, '#c28a4e');
  fillCircle(s, 12, 16, 9, '#3f9a4f');
  fillCircle(s, 6, 12, 6, '#4bb25f');
  fillCircle(s, 18, 12, 6, '#36803f');
  fillCircle(s, 12, 6, 6, '#4bb25f');
  return s;
}

export function buildRugSprite() {
  const s = makeGrid(ISO.TILE_W * 2, ISO.TILE_H * 2);
  fillDiamond(s, s.w / 2, s.h / 2, s.w / 2 - 4, s.h / 2 - 4, '#c7496b');
  fillDiamond(s, s.w / 2, s.h / 2, s.w / 2 - 14, s.h / 2 - 14, '#e2748f');
  fillDiamond(s, s.w / 2, s.h / 2, s.w / 2 - 26, s.h / 2 - 26, '#c7496b');
  fillDiamond(s, s.w / 2, s.h / 2, 10, 6, '#f6c667');
  s.ax = s.w / 2;
  s.ay = s.h / 2;
  return s;
}

export function buildNeonSignSprite() {
  const s = makeGrid(30, 34);
  fillRect(s, 2, 2, 26, 20, '#1a1a2a');
  fillRect(s, 4, 4, 22, 16, '#241f3a');
  for (let i = 0; i < 5; i++) fillRect(s, 6 + i * 4, 8, 2, 8, i % 2 === 0 ? '#ff5fd1' : '#5fe0ff');
  fillRect(s, 12, 22, 6, 12, '#4a4a4a');
  return s;
}

export function buildJukeboxSprite() {
  const s = makeGrid(26, 38);
  fillRect(s, 2, 4, 22, 30, '#7a2f3a');
  fillRect(s, 4, 6, 18, 12, '#ffe9a8');
  fillCircle(s, 13, 12, 5, '#c7496b');
  fillRect(s, 4, 20, 18, 10, '#4a1f27');
  fillRect(s, 6, 22, 4, 2, '#f6c667');
  fillRect(s, 12, 22, 4, 2, '#5fe0ff');
  fillRect(s, 18, 22, 2, 2, '#ff5fd1');
  fillRect(s, 2, 34, 22, 4, '#2a2a2a');
  return s;
}

// Small isometric prism toolkit: (u,v) are tile units along the x/y grid axes,
// z is pixels of height. Sprites made this way carry ax/ay, the pixel that
// must land on the footprint centre (the renderer honours them).
function isoSprite(tw, th, height, draw) {
  const s = makeGrid((tw + th) * 32 + 2, (tw + th) * 16 + height + 2);
  const px0 = th * 32 + 1;
  const py0 = height + 1;
  const P = (u, v, z) => [px0 + (u - v) * 32, py0 + (u + v) * 16 - z];
  const box = (u0, v0, u1, v1, z0, z1, top, left, right) => {
    fillPolygon(s, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], left);
    fillPolygon(s, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], right);
    fillPolygon(s, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], top);
  };
  draw(box, P, s);
  const out = outline(s, '#2a1d2e');
  const c = P(tw / 2, th / 2, 0);
  out.ax = c[0];
  out.ay = c[1];
  return out;
}

// Sofa: backrest on the far (low u/v) edge, so the sitter faces the viewer.
export function buildSofaSprite(color = '#e2607a', rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const c = [color, shade(color, -0.15), shade(color, -0.3)];
  const lt = [shade(color, 0.25), color, shade(color, -0.15)];
  return isoSprite(tw, th, 36, (box) => {
    const along = rot % 2 ? th : tw; // length along the sofa
    // [u,v] helpers: a = position along the sofa, d = depth across it
    const b2 = (a0, a1, d0, d1, z0, z1, col) => (rot % 2
      ? box(d0, a0, d1, a1, z0, z1, ...col)
      : box(a0, d0, a1, d1, z0, z1, ...col));
    const dep = 1;
    b2(0.03, along - 0.03, 0.05, dep - 0.05, 0, 12, lt.map((x) => shade(x, -0.1)));
    b2(0.03, along - 0.03, 0.05, 0.3, 12, 36, c);
    b2(0.03, 0.2, 0.3, dep - 0.05, 12, 26, c);
    for (let i = 0; i < along; i++) b2(0.22 + i, i + 0.98 - 0.0, 0.3, dep - 0.08, 12, 19, lt);
    b2(along - 0.2, along - 0.03, 0.3, dep - 0.05, 12, 26, c);
  });
}

const WOOD = ['#c98f55', '#a8703d', '#8a5a30']; // top, left, right

export function buildReceptionDesk(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  return isoSprite(tw, th, 34, (box) => {
    box(0.05, 0.1, tw - 0.05, th - 0.1, 0, 22, ...WOOD);
    box(0.05, 0.1, tw - 0.05, th - 0.1, 22, 25, '#f2d9a6', '#d9b87a', '#bf9d62');
    // bell + little lamp on top
    box(tw / 2 - 0.1, th / 2 - 0.1, tw / 2 + 0.1, th / 2 + 0.1, 25, 30, '#ffe27a', '#e0b23a', '#b88a2a');
  });
}

export function buildBookshelf(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const book = ['#d2506b', '#4f8fd6', '#e8c04a', '#5cb06a', '#9a6ad0'];
  return isoSprite(tw, th, 74, (box, P, s) => {
    box(0.05, 0.1, tw - 0.05, th - 0.1, 0, 74, '#b27a45', '#8f5f33', '#704a28');
    // book rows painted on the visible faces (left face = v max, right face = u max)
    for (let row = 0; row < 4; row++) {
      const z = 8 + row * 16;
      const n = (rot % 2 ? th : tw) * 5;
      for (let i = 0; i < n; i++) {
        const c = book[(i + row * 2) % book.length];
        const t0 = 0.08 + (i / n) * (rot % 2 ? th : tw) * 0.9;
        const t1 = t0 + (rot % 2 ? th : tw) * 0.9 / n * 0.8;
        if (rot % 2) box(tw - 0.06, t0, tw - 0.02, t1, z, z + 11, c, shade(c, -0.2), shade(c, -0.35));
        else box(t0, th - 0.1, t1, th - 0.06, z, z + 11, c, shade(c, -0.2), shade(c, -0.35));
      }
    }
  });
}

export function buildBarCounter(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  return isoSprite(tw, th, 40, (box) => {
    box(0.05, 0.1, tw - 0.05, th - 0.1, 0, 30, '#3a5a8a', '#2f4a73', '#253b5c');
    box(0, 0.05, tw, th - 0.05, 30, 34, '#e8d6b0', '#c8b48a', '#a89468');
    // bottles
    box(tw * 0.2, th * 0.4, tw * 0.2 + 0.1, th * 0.4 + 0.1, 34, 42, '#5cc08a', '#3c9a68', '#2c7a50');
    box(tw * 0.5, th * 0.4, tw * 0.5 + 0.1, th * 0.4 + 0.1, 34, 40, '#e0734a', '#b85a38', '#904630');
  });
}

export function buildArmchairSprite() {
  const c = '#d28a3c';
  const s = makeGrid(32, 36);
  fillRect(s, 5, 4, 22, 14, shade(c, 0.1)); // backrest
  fillRect(s, 2, 14, 6, 14, shade(c, -0.15)); // arms
  fillRect(s, 24, 14, 6, 14, shade(c, -0.25));
  fillRect(s, 7, 17, 18, 11, c); // seat cushion
  fillRect(s, 7, 17, 18, 2, shade(c, 0.2));
  fillRect(s, 4, 28, 4, 5, '#4a3020');
  fillRect(s, 24, 28, 4, 5, '#4a3020');
  const o = outline(s, '#2a1d2e');
  o.ax = 16; o.ay = 36 - 16 + 2;
  return o;
}

export function buildDeckchairSprite() {
  const s = makeGrid(32, 36);
  fillPolygon(s, [[8, 3], [24, 3], [26, 20], [6, 20]], '#f4f0e0'); // reclined back
  for (let i = 0; i < 4; i++) fillRect(s, 6, 5 + i * 4, 20, 2, i % 2 ? '#e2607a' : '#5aa0e2');
  fillPolygon(s, [[6, 20], [26, 20], [28, 28], [4, 28]], '#e8dcc0');
  fillRect(s, 4, 28, 3, 6, '#8a5a30');
  fillRect(s, 25, 28, 3, 6, '#6e4627');
  const o = outline(s, '#2a1d2e');
  o.ax = 16; o.ay = 36 - 16 + 2;
  return o;
}

export function buildStringLightsSprite() {
  const s = makeGrid(30, 64);
  fillRect(s, 13, 8, 3, 54, '#5a4a3a');
  fillRect(s, 9, 60, 11, 3, '#3a3a3a');
  fillRect(s, 4, 8, 22, 2, '#3a3a3a'); // cross arm
  const bulbs = ['#ffe27a', '#ff8fb0', '#8fe0ff', '#b6ff9f'];
  for (let i = 0; i < 5; i++) {
    const x = 4 + i * 5;
    setPixel(s, x, 10, '#3a3a3a');
    fillRect(s, x - 1, 11, 3, 3, bulbs[i % bulbs.length]);
  }
  const o = outline(s, '#2a1d2e');
  o.ax = 15; o.ay = 64 - 16 + 2;
  return o;
}

export const FURNITURE_BUILDERS = {
  stool: () => buildStoolSprite(),
  sofa: (rot) => buildSofaSprite('#e2607a', rot),
  rooftopSofa: (rot) => buildSofaSprite('#5aa0e2', rot),
  lamp: () => buildLampSprite(),
  plant: () => buildPlantSprite(),
  rug: () => buildRugSprite(),
  neonSign: () => buildNeonSignSprite(),
  jukebox: () => buildJukeboxSprite(),
  armchair: () => buildArmchairSprite(),
  deckchair: () => buildDeckchairSprite(),
  receptionDesk: (rot) => buildReceptionDesk(rot),
  bookshelf: (rot) => buildBookshelf(rot),
  barCounter: (rot) => buildBarCounter(rot),
  stringLights: () => buildStringLightsSprite(),
};

export function shadeColor(hex, amt) {
  return shade(hex, amt);
}
