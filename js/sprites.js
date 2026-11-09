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

export function buildElevatorDoorSegment(baseColor, kind = 'north') {
  const s = buildWallSegment(baseColor, kind);
  const brass = '#d8a848';
  const brassLight = '#ffe28a';
  const steelL = '#9aa8b8';
  const steelR = '#7c8a9a';
  const seam = '#28303c';
  const xl = kind === 'north' ? 34 : 4;
  const xr = xl + 28;
  const mid = Math.floor((xl + xr) / 2);
  const doorH = 48;
  for (let x = xl; x < xr; x++) {
    const base = Math.round(ISO.WALL_H + (kind === 'north' ? (x - 32) / 2 : (32 - x) / 2)) - 1;
    for (let y = base - doorH; y <= base; y++) {
      const isFrame = x < xl + 3 || x >= xr - 3 || y < base - doorH + 4;
      const isIndicator = y >= base - doorH - 5 && y < base - doorH && x >= mid - 5 && x <= mid + 5;
      if (isFrame) {
        setPixel(s, x, y, x === xl || y === base - doorH ? brassLight : brass);
      } else {
        let c = x < mid ? steelL : steelR;
        if (x === mid) c = seam;
        else if (y === base - doorH + 6 || y === base - 3) c = shade(c, -0.15);
        setPixel(s, x, y, c);
      }
      if (isIndicator) setPixel(s, x, y, '#1c1828');
    }
    // glowing floor indicator dots above elevator arch
    const indY = Math.round(ISO.WALL_H + (kind === 'north' ? (x - 32) / 2 : (32 - x) / 2)) - doorH - 4;
    if (x >= mid - 4 && x <= mid + 4) {
      setPixel(s, x, indY - 1, '#221a30');
      setPixel(s, x, indY, x % 2 === 0 ? '#ffcf56' : '#ff6b4a');
      setPixel(s, x, indY + 1, '#221a30');
    }
  }
  return s;
}

export function buildStairwellDoorSegment(baseColor, kind = 'north') {
  const s = buildWallSegment(baseColor, kind);
  const frame = '#323a48';
  const frameLight = '#627288';
  const xl = kind === 'north' ? 34 : 4;
  const xr = xl + 28;
  const mid = Math.floor((xl + xr) / 2);
  const doorH = 48;
  for (let x = xl; x < xr; x++) {
    const base = Math.round(ISO.WALL_H + (kind === 'north' ? (x - 32) / 2 : (32 - x) / 2)) - 1;
    for (let y = base - doorH; y <= base; y++) {
      const isFrame = x < xl + 3 || x >= xr - 3 || y < base - doorH + 4;
      const isWindow = !isFrame && y >= base - doorH + 8 && y <= base - doorH + 22 && x >= mid - 8 && x <= mid + 8;
      if (isFrame) {
        setPixel(s, x, y, (x === xl || y === base - doorH) ? frameLight : frame);
      } else if (isWindow) {
        setPixel(s, x, y, (x + y) % 2 === 0 ? '#b8ebff' : '#88ccee');
      } else {
        setPixel(s, x, y, x < mid ? '#485468' : '#384252');
      }
    }
    // Illuminated green "ROOF / EXIT" emergency sign above the stairwell door
    const signY = Math.round(ISO.WALL_H + (kind === 'north' ? (x - 32) / 2 : (32 - x) / 2)) - doorH - 4;
    if (x >= mid - 8 && x <= mid + 8) {
      setPixel(s, x, signY - 2, '#183824');
      setPixel(s, x, signY - 1, (x === mid - 8 || x === mid + 8) ? '#22c55e' : '#15803d');
      setPixel(s, x, signY, (x >= mid - 3 && x <= mid + 3) ? '#f0fdf4' : '#22c55e');
      setPixel(s, x, signY + 1, '#183824');
    }
  }
  return s;
}

export function buildGlassBalustradeSegment(kind = 'north') {
  const w = ISO.TILE_W;
  const h = ISO.WALL_H + ISO.TILE_H / 2;
  const s = makeGrid(w, h);
  const baseY = (x) => Math.round(ISO.WALL_H + (kind === 'north' ? (x - w / 2) / 2 : (w / 2 - x) / 2));
  const RAIL_H = 18;

  for (let x = 0; x < w; x++) {
    const base = baseY(x);
    // Base mounting shoe (dark metal channel)
    setPixel(s, x, base, '#242b35');
    setPixel(s, x, base - 1, '#3a4452');
    setPixel(s, x, base - 2, '#505d6e');

    // Tempered glass panel with reflections and sky tint
    for (let y = base - RAIL_H + 2; y <= base - 3; y++) {
      const isReflect = ((x * 2 + y * 3) % 20 < 2);
      const isPost = (x === 4 || x === 5 || x === 31 || x === 32 || x === 58 || x === 59);
      if (isPost) {
        setPixel(s, x, y, (x % 2 === 0) ? '#d8e4f0' : '#8fa4b8');
      } else if (isReflect) {
        setPixel(s, x, y, '#eaf8ff');
      } else {
        // Translucent glass texture with subtle dither
        setPixel(s, x, y, (x + y) % 2 === 0 ? '#98d2f0' : '#68b4dc');
      }
    }

    // Top handrail (polished steel chrome with upper highlight)
    setPixel(s, x, base - RAIL_H, '#edf4fa');
    setPixel(s, x, base - RAIL_H + 1, '#b8c8d8');
    setPixel(s, x, base - RAIL_H + 2, '#6c7c8c');
  }
  return s;
}

export function buildElevatorTile(baseColor) {
  const s = buildFloorTile(baseColor, 1);
  const w = ISO.TILE_W, h = ISO.TILE_H;
  fillDiamond(s, w / 2, h / 2, w / 2 - 7, h / 2 - 4, '#3a4252');
  fillDiamond(s, w / 2, h / 2, w / 2 - 11, h / 2 - 6, '#d8a848');
  fillDiamond(s, w / 2, h / 2, w / 2 - 15, h / 2 - 8, '#546074');
  return s;
}

// ---------- Furniture ----------

// Small isometric prism toolkit: (u,v) are tile units along the x/y grid axes,
// z is pixels of height. Sprites made this way carry ax/ay, the pixel that
// must land on the footprint centre (the renderer honours them), plus `boxes`
// so the renderer can rasterise them at native DPR resolution.
export function isoSprite(tw, th, height, draw) {
  const s = makeGrid((tw + th) * 32 + 2, (tw + th) * 16 + height + 2);
  const px0 = th * 32 + 1;
  const py0 = height + 1;
  const P = (u, v, z) => [px0 + (u - v) * 32, py0 + (u + v) * 16 - z];
  const boxes = [];
  const box = (u0, v0, u1, v1, z0, z1, top, left, right) => {
    const topC = left !== undefined ? top : shade(top, 0.14);
    const leftC = left !== undefined ? left : top;
    const rightC = right !== undefined ? right : shade(top, -0.22);
    boxes.push({ u0, v0, u1, v1, z0, z1, topC, leftC, rightC });
    fillPolygon(s, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], leftC);
    fillPolygon(s, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], rightC);
    fillPolygon(s, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], topC);
  };
  draw(box, P, s);
  const out = outline(s, '#2a1d2e');
  const c = P(tw / 2, th / 2, 0);
  out.ax = c[0];
  out.ay = c[1];
  out.tw = tw;
  out.th = th;
  out.height = height;
  out.boxes = boxes;
  return out;
}

const WOOD = ['#c98f55', '#a8703d', '#8a5a30']; // top, left, right

export function buildStoolSprite() {
  return isoSprite(1, 1, 26, (box) => {
    // 4 sturdy wooden legs touching floor (z = 0 .. 10)
    box(0.20, 0.20, 0.34, 0.34, 0, 10, ...WOOD);
    box(0.66, 0.20, 0.80, 0.34, 0, 10, ...WOOD);
    box(0.20, 0.66, 0.34, 0.80, 0, 10, ...WOOD);
    box(0.66, 0.66, 0.80, 0.80, 0, 10, ...WOOD);
    // Footrest cross-stretchers (z = 4 .. 6)
    box(0.22, 0.22, 0.78, 0.30, 4, 6, ...WOOD);
    box(0.22, 0.70, 0.78, 0.78, 4, 6, ...WOOD);
    box(0.22, 0.22, 0.30, 0.78, 4, 6, ...WOOD);
    box(0.70, 0.22, 0.78, 0.78, 4, 6, ...WOOD);
    // Wooden seat base slab (z = 10 .. 12)
    box(0.16, 0.16, 0.84, 0.84, 10, 12, ...WOOD);
    // Tufted leather seat cushion (z = 12 .. 14)
    box(0.12, 0.12, 0.88, 0.88, 12, 14, '#e0b25e', '#caa05a', '#9e7a38');
    // Button tuft
    box(0.44, 0.44, 0.56, 0.56, 14, 15, '#f4d084', '#e0b25e', '#b88d3e');
  });
}

// Sofa: 4-way volumetric orientation, coherent contact plane
export function buildSofaSprite(color = '#e2607a', rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const [tw, th] = r % 2 ? [1, 2] : [2, 1];
  const topC = shade(color, 0.14), midC = color, darkC = shade(color, -0.22);
  const col = [topC, midC, darkC];
  const lt = [shade(color, 0.25), shade(color, 0.10), shade(color, -0.12)];
  const dk = [shade(color, -0.10), shade(color, -0.22), shade(color, -0.35)];

  return isoSprite(tw, th, 36, (box) => {
    // 4 low wooden feet (z = 0 .. 3)
    box(0.06, 0.06, 0.18, 0.18, 0, 3, ...WOOD);
    box(tw - 0.18, 0.06, tw - 0.06, 0.18, 0, 3, ...WOOD);
    box(0.06, th - 0.18, 0.18, th - 0.06, 0, 3, ...WOOD);
    box(tw - 0.18, th - 0.18, tw - 0.06, th - 0.06, 0, 3, ...WOOD);

    if (r === 0) {
      // 2x1 facing down (+v): backrest on north edge
      box(0.04, 0.04, 1.96, 0.96, 3, 8, ...dk); // lower plinth
      box(0.04, 0.06, 1.96, 0.32, 8, 34, ...col); // backrest
      box(0.04, 0.32, 0.24, 0.96, 8, 22, ...col); // left armrest
      box(1.76, 0.32, 1.96, 0.96, 8, 22, ...col); // right armrest
      // seat cushions (z = 8 .. 13)
      box(0.26, 0.32, 0.98, 0.94, 8, 13, ...lt);
      box(1.02, 0.32, 1.74, 0.94, 8, 13, ...lt);
    } else if (r === 1) {
      // 1x2 facing right (+u): backrest on west edge
      box(0.04, 0.04, 0.96, 1.96, 3, 8, ...dk);
      box(0.06, 0.04, 0.32, 1.96, 8, 34, ...col);
      box(0.32, 0.04, 0.96, 0.24, 8, 22, ...col);
      box(0.32, 1.76, 0.96, 1.96, 8, 22, ...col);
      box(0.32, 0.26, 0.94, 0.98, 8, 13, ...lt);
      box(0.32, 1.02, 0.94, 1.74, 8, 13, ...lt);
    } else if (r === 2) {
      // 2x1 facing up (-v): backrest on south edge
      box(0.04, 0.04, 1.96, 0.96, 3, 8, ...dk);
      box(0.26, 0.06, 0.98, 0.68, 8, 13, ...lt);
      box(1.02, 0.06, 1.74, 0.68, 8, 13, ...lt);
      box(0.04, 0.04, 0.24, 0.68, 8, 22, ...col);
      box(1.76, 0.04, 1.96, 0.68, 8, 22, ...col);
      box(0.04, 0.68, 1.96, 0.94, 8, 34, ...col);
    } else {
      // 1x2 facing left (-u): backrest on east edge
      box(0.04, 0.04, 0.96, 1.96, 3, 8, ...dk);
      box(0.06, 0.26, 0.68, 0.98, 8, 13, ...lt);
      box(0.06, 1.02, 0.68, 1.74, 8, 13, ...lt);
      box(0.04, 0.04, 0.68, 0.24, 8, 22, ...col);
      box(0.04, 1.76, 0.68, 1.96, 8, 22, ...col);
      box(0.68, 0.04, 0.94, 1.96, 8, 34, ...col);
    }
  });
}

export function buildLampSprite() {
  const CHROME = ['#9e9eac', '#7c7c8a', '#5c5c68'];
  return isoSprite(1, 1, 46, (box) => {
    // Brushed chrome tiered pedestal base (z = 0 .. 8)
    box(0.24, 0.24, 0.76, 0.76, 0, 4, ...CHROME);
    box(0.30, 0.30, 0.70, 0.70, 4, 8, ...CHROME);
    // Glowing liquid cylinder chamber (z = 8 .. 32)
    box(0.34, 0.34, 0.66, 0.66, 8, 32, '#ff9040', '#e06020', '#b03810');
    // Internal floating thermal lava blobs
    box(0.38, 0.38, 0.62, 0.62, 11, 17, '#ffea70', '#ffc040', '#d08020');
    box(0.40, 0.40, 0.60, 0.60, 23, 29, '#fff298', '#ffd450', '#e49424');
    // Brushed chrome top cone & finial cap (z = 32 .. 42)
    box(0.30, 0.30, 0.70, 0.70, 32, 37, ...CHROME);
    box(0.38, 0.38, 0.62, 0.62, 37, 40, ...CHROME);
    box(0.44, 0.44, 0.56, 0.56, 40, 44, '#d8d8e4', '#b0b0c0', '#888898');
  });
}

export function buildPlantSprite() {
  const POT = ['#cc7d47', '#b06532', '#8c4b22'];
  const SOIL = ['#3d281a', '#2c1c12', '#20140c'];
  const LEAF1 = ['#66dd77', '#44aa55', '#2e7c3b'];
  const LEAF2 = ['#55cc66', '#3db04e', '#2a8037'];
  const LEAF3 = ['#77ee88', '#55cc66', '#3db04e'];

  return isoSprite(1, 1, 40, (box) => {
    // Terracotta pot base and flared rim (z = 0 .. 14)
    box(0.28, 0.28, 0.72, 0.72, 0, 10, ...POT);
    box(0.24, 0.24, 0.76, 0.76, 10, 14, ...POT);
    // Dark nutrient soil (z = 13 .. 14)
    box(0.26, 0.26, 0.74, 0.74, 13, 14, ...SOIL);
    // Main stem core
    box(0.45, 0.45, 0.55, 0.55, 14, 26, '#3a8c44', '#286b32', '#1c4a22');
    // Multi-faceted fern fronds layered in 3D
    box(0.12, 0.30, 0.42, 0.58, 18, 24, ...LEAF2); // west frond
    box(0.42, 0.12, 0.70, 0.40, 20, 26, ...LEAF1); // north frond
    box(0.32, 0.60, 0.62, 0.88, 16, 22, ...LEAF2); // south frond
    box(0.60, 0.34, 0.88, 0.64, 17, 23, ...LEAF1); // east frond
    // Mid & crown foliage tiers
    box(0.30, 0.30, 0.70, 0.70, 24, 30, ...LEAF1);
    box(0.40, 0.40, 0.60, 0.60, 30, 37, ...LEAF3);
  });
}

// Thin rugs are physically thin cuboid surfaces, not tall blocks
export function buildRugSprite() {
  const RUG_BERRY = ['#c7496b', '#a83854', '#7a243a'];
  const RUG_ROSE = ['#e2748f', '#c05872', '#8c384e'];
  const RUG_GOLD = ['#f6c667', '#d8a442', '#a07424'];
  const RUG_CREAM = ['#fff2a8', '#f6c667', '#c8922c'];

  return isoSprite(2, 2, 4, (box) => {
    // Outer border thin cuboid (z = 0 .. 2)
    box(0.06, 0.06, 1.94, 1.94, 0, 2, ...RUG_BERRY);
    // Rose field (z = 0 .. 2)
    box(0.24, 0.24, 1.76, 1.76, 0, 2, ...RUG_ROSE);
    // Inner ruby panel (z = 0 .. 2)
    box(0.54, 0.54, 1.46, 1.46, 0, 2, ...RUG_BERRY);
    // Gold starburst medallion (z = 0 .. 2)
    box(0.76, 0.76, 1.24, 1.24, 0, 2, ...RUG_GOLD);
    // Center jewel (z = 0 .. 2)
    box(0.90, 0.90, 1.10, 1.10, 0, 2, ...RUG_CREAM);
  });
}

export function buildNeonSignSprite() {
  const IRON = ['#4a4a58', '#383844', '#262630'];
  const CHASSIS = ['#222232', '#181824', '#0e0e16'];
  const NEON_PINK = ['#ff70d8', '#ff40c8', '#b8208c'];
  const NEON_CYAN = ['#70f4ff', '#40e8ff', '#1cb0c4'];
  const NEON_GOLD = ['#fff090', '#ffe040', '#c8a818'];

  return isoSprite(1, 1, 56, (box) => {
    // Cast iron cross base (z = 0 .. 3)
    box(0.20, 0.44, 0.80, 0.56, 0, 3, ...IRON);
    box(0.44, 0.20, 0.56, 0.80, 0, 3, ...IRON);
    // Vertical iron stanchion pole (z = 3 .. 26)
    box(0.45, 0.45, 0.55, 0.55, 3, 26, ...IRON);
    // Sign chassis backing box (z = 24 .. 52)
    box(0.14, 0.40, 0.86, 0.60, 24, 52, ...CHASSIS);
    // Outer neon pink border tubing
    box(0.12, 0.38, 0.88, 0.62, 50, 52, ...NEON_PINK);
    box(0.12, 0.38, 0.88, 0.62, 24, 26, ...NEON_PINK);
    box(0.12, 0.38, 0.16, 0.62, 26, 50, ...NEON_PINK);
    box(0.84, 0.38, 0.88, 0.62, 26, 50, ...NEON_PINK);
    // Neon HOTEL letter glyphs (z = 28 .. 48)
    box(0.22, 0.38, 0.32, 0.62, 28, 48, ...NEON_CYAN); // H
    box(0.38, 0.38, 0.48, 0.62, 28, 48, ...NEON_GOLD); // O
    box(0.54, 0.38, 0.64, 0.62, 28, 48, ...NEON_CYAN); // T
    box(0.70, 0.38, 0.80, 0.62, 28, 48, ...NEON_GOLD); // E/L
  });
}

export function buildJukeboxSprite() {
  const CHROME = ['#9e9eac', '#7c7c8a', '#5c5c68'];
  const MAHOGANY = ['#7c2836', '#601e2a', '#44121c'];
  const GRILLE = ['#ffd470', '#e0b048', '#a87e28'];

  return isoSprite(1, 1, 50, (box) => {
    // Chrome plinth kickplate (z = 0 .. 5)
    box(0.14, 0.14, 0.86, 0.86, 0, 5, ...CHROME);
    // Lower speaker cabinet (z = 5 .. 20)
    box(0.16, 0.16, 0.84, 0.84, 5, 20, ...MAHOGANY);
    box(0.22, 0.80, 0.78, 0.86, 7, 18, ...GRILLE); // front cloth
    // Middle selection control shelf (z = 20 .. 25)
    box(0.14, 0.14, 0.86, 0.86, 20, 25, '#9a3648', '#782636', '#541624');
    // Push buttons
    box(0.24, 0.78, 0.36, 0.86, 22, 24, '#5fe0ff', '#38b8d4', '#1e788c');
    box(0.44, 0.78, 0.56, 0.86, 22, 24, '#ffe27a', '#d8be56', '#9c8428');
    box(0.64, 0.78, 0.76, 0.86, 22, 24, '#ff5fd1', '#d43da8', '#941c70');
    // Upper record player viewing chamber (z = 25 .. 42)
    box(0.18, 0.18, 0.82, 0.82, 25, 42, '#202838', '#161c28', '#0c1018');
    // Vinyl record & tonearm turntable inside
    box(0.30, 0.30, 0.70, 0.70, 27, 30, '#101014', '#08080a', '#040406');
    box(0.46, 0.46, 0.54, 0.54, 30, 31, '#ff3850', '#c81c30', '#880c1e'); // label
    // Glowing neon arch trim (z = 40 .. 48)
    box(0.16, 0.16, 0.84, 0.84, 42, 46, '#ff5fd1', '#d43da8', '#941c70');
    box(0.26, 0.26, 0.74, 0.74, 46, 50, '#ffe27a', '#d8be56', '#9c8428');
  });
}

export function buildArmchairSprite(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const AMBER = ['#e8a452', '#d28a3c', '#9c6020'];
  const AMBER_LT = ['#f4bc74', '#e8a452', '#b8762c'];
  const AMBER_DK = ['#b87428', '#9c5e1c', '#6e3e0e'];

  return isoSprite(1, 1, 36, (box) => {
    // 4 sturdy turned wooden legs (z = 0 .. 6)
    box(0.16, 0.16, 0.28, 0.28, 0, 6, ...WOOD);
    box(0.72, 0.16, 0.84, 0.28, 0, 6, ...WOOD);
    box(0.16, 0.72, 0.28, 0.84, 0, 6, ...WOOD);
    box(0.72, 0.72, 0.84, 0.84, 0, 6, ...WOOD);
    // Base apron frame (z = 6 .. 8)
    box(0.12, 0.12, 0.88, 0.88, 6, 8, ...AMBER_DK);

    if (r === 0) {
      // Facing down (+v): backrest on north edge, arms on west/east
      box(0.10, 0.10, 0.90, 0.34, 8, 34, ...AMBER); // high backrest
      box(0.10, 0.34, 0.28, 0.90, 8, 22, ...AMBER); // left armrest
      box(0.72, 0.34, 0.90, 0.90, 8, 22, ...AMBER); // right armrest
      box(0.28, 0.34, 0.72, 0.86, 8, 12, ...AMBER_LT); // plush cushion
    } else if (r === 1) {
      // Facing right (+u): backrest on west edge, arms on north/south
      box(0.10, 0.10, 0.34, 0.90, 8, 34, ...AMBER);
      box(0.34, 0.10, 0.90, 0.28, 8, 22, ...AMBER);
      box(0.34, 0.72, 0.90, 0.90, 8, 22, ...AMBER);
      box(0.34, 0.28, 0.86, 0.72, 8, 12, ...AMBER_LT);
    } else if (r === 2) {
      // Facing up (-v): backrest on south edge
      box(0.28, 0.14, 0.72, 0.66, 8, 12, ...AMBER_LT);
      box(0.10, 0.10, 0.28, 0.66, 8, 22, ...AMBER);
      box(0.72, 0.10, 0.90, 0.66, 8, 22, ...AMBER);
      box(0.10, 0.66, 0.90, 0.90, 8, 34, ...AMBER);
    } else {
      // Facing left (-u): backrest on east edge
      box(0.14, 0.28, 0.66, 0.72, 8, 12, ...AMBER_LT);
      box(0.10, 0.10, 0.66, 0.28, 8, 22, ...AMBER);
      box(0.10, 0.72, 0.66, 0.90, 8, 22, ...AMBER);
      box(0.66, 0.10, 0.90, 0.90, 8, 34, ...AMBER);
    }
  });
}

export function buildDeckchairSprite(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const BEECH = ['#dfb882', '#b88a52', '#865e28'];
  const STRIPE_RED = ['#f0506e', '#d83856', '#a01c38'];
  const STRIPE_BLUE = ['#66b0f4', '#4894dc', '#2a6cb0'];
  const STRIPE_CREAM = ['#fdf6e6', '#ded4c0', '#b0a690'];

  return isoSprite(1, 1, 34, (box) => {
    if (r === 0 || r === 2) {
      // Cross scissor beechwood legs
      box(0.14, 0.14, 0.24, 0.86, 0, 16, ...BEECH);
      box(0.76, 0.14, 0.86, 0.86, 0, 16, ...BEECH);
      // Fabric sling (z = 8 .. 30)
      box(0.24, 0.18, 0.76, 0.42, 14, 30, ...STRIPE_RED);
      box(0.24, 0.42, 0.76, 0.66, 10, 14, ...STRIPE_CREAM);
      box(0.24, 0.66, 0.76, 0.86, 8, 11, ...STRIPE_BLUE);
    } else {
      // rot 1 or 3
      box(0.14, 0.14, 0.86, 0.24, 0, 16, ...BEECH);
      box(0.14, 0.76, 0.86, 0.86, 0, 16, ...BEECH);
      box(0.18, 0.24, 0.42, 0.76, 14, 30, ...STRIPE_RED);
      box(0.42, 0.24, 0.66, 0.76, 10, 14, ...STRIPE_CREAM);
      box(0.66, 0.24, 0.86, 0.76, 8, 11, ...STRIPE_BLUE);
    }
  });
}

export function buildReceptionDesk(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  const MARBLE = ['#f6eedc', '#dcceb4', '#b8a88c'];
  const BELL = ['#ffe27a', '#e0b23a', '#b88a2a'];

  return isoSprite(tw, th, 38, (box) => {
    // Plinth base molding (z = 0 .. 4)
    box(0.04, 0.08, tw - 0.04, th - 0.08, 0, 4, '#7c4c22', '#643a16', '#48260c');
    // Paneled wooden counter body (z = 4 .. 24)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 4, 24, ...WOOD);
    // Polished marble slab counter top with overhang (z = 24 .. 28)
    box(0.02, 0.05, tw - 0.02, th - 0.05, 24, 28, ...MARBLE);
    // Brass counter service bell (z = 28 .. 33)
    box(tw / 2 - 0.12, th / 2 - 0.12, tw / 2 + 0.12, th / 2 + 0.12, 28, 33, ...BELL);
    // Guest register leather ledger book (z = 28 .. 30)
    const bx = rot % 2 ? 0.35 : 0.65;
    const by = rot % 2 ? 0.65 : 0.35;
    box(bx, by, bx + 0.25, by + 0.25, 28, 30, '#542018', '#3e140e', '#280a06');
    // Desk lamp with brass arch (z = 28 .. 38)
    const lx = rot % 2 ? 0.35 : tw - 0.55;
    const ly = rot % 2 ? th - 0.55 : 0.35;
    box(lx, ly, lx + 0.18, ly + 0.18, 28, 38, ...BELL);
  });
}

export function buildBookshelf(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const FRAME = ['#a86834', '#8a5024', '#663614'];
  const bookColors = [
    ['#d2506b', '#aa3850', '#7c2036'],
    ['#4f8fd6', '#3470b4', '#204c84'],
    ['#e8c04a', '#c49e32', '#90721c'],
    ['#5cb06a', '#428e50', '#2a6436'],
    ['#9a6ad0', '#784eb0', '#543082'],
  ];

  return isoSprite(tw, th, 74, (box) => {
    // Outer wooden casing (z = 0 .. 74)
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 74, ...FRAME);
    // 3 shelves of volumetric book rows
    for (let row = 0; row < 3; row++) {
      const z = 8 + row * 20;
      // Shelf board
      box(0.06, 0.09, tw - 0.06, th - 0.09, z - 2, z, ...FRAME);
      const n = (rot % 2 ? th : tw) * 4;
      for (let i = 0; i < n; i++) {
        const col = bookColors[(i + row * 2) % bookColors.length];
        const t0 = 0.10 + (i / n) * ((rot % 2 ? th : tw) - 0.20);
        const t1 = t0 + 0.14;
        const bH = 12 + ((i * 7 + row * 11) % 5);
        if (rot % 2) {
          box(tw - 0.08, t0, tw - 0.02, t1, z, z + bH, ...col);
        } else {
          box(t0, th - 0.08, t1, th - 0.02, z, z + bH, ...col);
        }
      }
    }
  });
}

export function buildBarCounter(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  const BAR_BODY = ['#385482', '#283e62', '#1a2a44'];
  const MAHOGANY = ['#9e5232', '#823e20', '#5c2810'];

  return isoSprite(tw, th, 42, (box) => {
    // Brass footrail (z = 0 .. 4)
    box(0.04, 0.08, tw - 0.04, th - 0.08, 0, 4, '#c89e44', '#a47e30', '#74541c');
    // Front paneled bar body (z = 4 .. 28)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 4, 28, ...BAR_BODY);
    // Heavy polished mahogany top (z = 28 .. 32)
    box(0.02, 0.04, tw - 0.02, th - 0.04, 28, 32, ...MAHOGANY);
    // Glassware & beverage bottles on counter (z = 32 .. 42)
    const n = rot % 2 ? th * 3 : tw * 3;
    const bCols = [
      ['#5cc08a', '#3c9a68', '#2c7a50'],
      ['#e0734a', '#b85a38', '#904630'],
      ['#e8c85a', '#c2a23e', '#8c7224'],
      ['#78a4e8', '#5482c4', '#345c92'],
    ];
    for (let i = 0; i < n; i++) {
      const col = bCols[i % bCols.length];
      const t = 0.20 + (i / n) * ((rot % 2 ? th : tw) - 0.40);
      const bx = rot % 2 ? 0.35 : t;
      const by = rot % 2 ? t : 0.35;
      box(bx, by, bx + 0.10, by + 0.10, 32, 40, ...col);
    }
  });
}

export function buildStringLightsSprite() {
  const IRON = ['#464654', '#343440', '#22222a'];
  const BULBS = [
    ['#ffe27a', '#f0be48', '#b88a24'],
    ['#ff8fb0', '#e06488', '#a03858'],
    ['#8fe0ff', '#5cc4e8', '#3488aa'],
    ['#b6ff9f', '#80e068', '#50a040'],
  ];

  return isoSprite(1, 1, 72, (box) => {
    // Fluted cast-iron base (z = 0 .. 6)
    box(0.24, 0.24, 0.76, 0.76, 0, 3, ...IRON);
    box(0.32, 0.32, 0.68, 0.68, 3, 6, ...IRON);
    // Vertical iron lamppost column (z = 6 .. 60)
    box(0.44, 0.44, 0.56, 0.56, 6, 60, ...IRON);
    // Decorative scrolled crossbar arm (z = 54 .. 58)
    box(0.12, 0.45, 0.88, 0.55, 54, 58, ...IRON);
    // Top finial spear (z = 60 .. 68)
    box(0.42, 0.42, 0.58, 0.58, 60, 64, '#ffe27a', '#d8a834', '#98721c');
    box(0.46, 0.46, 0.54, 0.54, 64, 68, '#ffe27a', '#d8a834', '#98721c');
    // 4 hanging festoon bulbs with glowing filaments
    for (let i = 0; i < 4; i++) {
      const u = 0.16 + i * 0.22;
      const col = BULBS[i % BULBS.length];
      box(u + 0.02, 0.46, u + 0.06, 0.54, 51, 54, '#1c1c24', '#14141a', '#0c0c10'); // socket
      box(u, 0.44, u + 0.08, 0.56, 45, 51, ...col); // bulb
    }
  });
}

// ---------------- 8 Original Collection Items (v0.3.0) ----------------

export function buildAquariumSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STAND = ['#6e4222', '#563216', '#3e200c'];
  const BRASS = ['#ffe27a', '#e0b23a', '#b88a2a'];
  const HOOD = ['#4e4e5e', '#363644', '#20202a'];

  return isoSprite(tw, th, 46, (box) => {
    // Dark timber cabinet stand (z = 0 .. 14)
    box(0.04, 0.08, tw - 0.04, th - 0.08, 0, 14, ...STAND);
    // Polished brass trim band (z = 14 .. 16)
    box(0.02, 0.06, tw - 0.02, th - 0.06, 14, 16, ...BRASS);
    // Coral sand bed inside tank (z = 16 .. 18)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 16, 18, '#ecdca0', '#d2c082', '#a89458');
    // Clear aquatic blue water prism (z = 18 .. 38)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 18, 38, '#6dd8d8', '#38b0b8', '#1c7882');
    // Corals & sea greenery
    box(0.18, 0.28, 0.36, 0.46, 18, 28, '#38c860', '#249442', '#166428');
    box(tw - 0.38, 0.28, tw - 0.20, 0.46, 18, 26, '#ff6098', '#cc3870', '#901c4a');
    // Darting neon fish (clownfish + neon tetra)
    box(tw * 0.38, th * 0.40, tw * 0.38 + 0.22, th * 0.40 + 0.12, 26, 30, '#ff7820', '#d85810', '#9c3804');
    box(tw * 0.65, th * 0.46, tw * 0.65 + 0.16, th * 0.46 + 0.10, 22, 25, '#40c8ff', '#2090cc', '#106090');
    // Top canopy hood with ventilation louvers (z = 38 .. 44)
    box(0.04, 0.08, tw - 0.04, th - 0.08, 38, 44, ...HOOD);
    // Power indicator LED
    box(tw - 0.22, th - 0.16, tw - 0.14, th - 0.10, 44, 45, '#40ff80', '#20d050', '#109030');
  });
}

export function buildBobaBarSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const TILES = ['#9fe0cc', '#78bfa8', '#508c78'];
  const BIRCH = ['#faeed0', '#deceaa', '#b8a680'];

  return isoSprite(tw, th, 46, (box) => {
    // Pastel tiled counter base (z = 0 .. 22)
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 22, ...TILES);
    // Polished birch counter top with overhang (z = 22 .. 25)
    box(0.02, 0.04, tw - 0.02, th - 0.04, 22, 25, ...BIRCH);
    // Twin tea urn dispensers (z = 25 .. 38)
    box(0.14 * tw, 0.24 * th, 0.14 * tw + 0.26, 0.24 * th + 0.26, 25, 38, '#d4a06a', '#b07c48', '#80542c');
    box(0.38 * tw, 0.24 * th, 0.38 * tw + 0.26, 0.24 * th + 0.26, 25, 38, '#88cc66', '#66aa44', '#447a28');
    // Cup sealer machine with digital display (z = 25 .. 36)
    box(0.66 * tw, 0.22 * th, 0.66 * tw + 0.26, 0.22 * th + 0.26, 25, 36, '#e0e0ea', '#c0c0cc', '#9090a0');
    // Prepared boba drink cups with dark tapioca pearls and wide straws
    box(0.80 * tw, 0.50 * th, 0.80 * tw + 0.14, 0.50 * th + 0.14, 25, 33, '#e8b878', '#c49454', '#946a32');
    box(0.80 * tw, 0.50 * th, 0.80 * tw + 0.14, 0.50 * th + 0.14, 25, 27, '#2a1a14', '#1c100c', '#100806'); // pearls
    // Overhead mini sign frame (z = 38 .. 44)
    box(0.20 * tw, 0.10 * th, tw - 0.20 * tw, 0.18 * th, 40, 44, '#ff9ec4', '#db789e', '#a44c70');
  });
}

export function buildMiniArcadeSprite(rot = 0) {
  const CHASSIS = ['#38244e', '#281838', '#180c24'];
  const SCREEN = ['#204050', '#142c38', '#0c1a22'];

  return isoSprite(1, 1, 52, (box) => {
    // Upright arcade cabinet base with coin door (z = 0 .. 18)
    box(0.14, 0.14, 0.86, 0.86, 0, 18, ...CHASSIS);
    box(0.32, 0.82, 0.68, 0.88, 4, 15, '#22222a', '#181820', '#101014'); // coin door
    box(0.46, 0.84, 0.54, 0.88, 9, 13, '#ffe27a', '#d8a834', '#98721c'); // slot
    // Slanted control panel deck (z = 18 .. 24)
    box(0.14, 0.44, 0.86, 0.88, 18, 24, '#241634', '#1a0e26', '#12081a');
    // Ball-top red joystick & action buttons
    box(0.28, 0.62, 0.36, 0.70, 24, 29, '#ff3850', '#d01c32', '#940e1e');
    box(0.52, 0.64, 0.60, 0.72, 24, 26, '#40e0d0', '#2cb4a6', '#1c7c72');
    box(0.68, 0.60, 0.76, 0.68, 24, 26, '#ffe040', '#d4b024', '#947810');
    // Recessed glowing CRT monitor (z = 24 .. 42)
    box(0.18, 0.24, 0.82, 0.70, 24, 42, ...SCREEN);
    // 8-bit spaceship graphic on screen
    box(0.44, 0.46, 0.56, 0.58, 30, 36, '#60ff80', '#3cd458', '#20943c');
    // Glowing marquee header (z = 42 .. 50)
    box(0.14, 0.20, 0.86, 0.56, 42, 50, '#ff40a0', '#d02078', '#940e4e');
    box(0.22, 0.54, 0.78, 0.58, 44, 48, '#fff080', '#e0c840', '#9c8c18'); // illuminated logo
  });
}

export function buildNoodleCartSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const CART_WOOD = ['#9e6634', '#825024', '#5c3614'];
  const WHEEL = ['#4a3828', '#38281a', '#24180e'];
  const AWNING_BLUE = ['#2b3a67', '#1e2848', '#121a30'];
  const AWNING_WHITE = ['#f4f0dc', '#ded6be', '#b0a890'];

  return isoSprite(tw, th, 54, (box) => {
    // Spoke rolling wheels on floor (z = 0 .. 10)
    box(0.10, 0.80, 0.26, 0.90, 0, 10, ...WHEEL);
    box(tw - 0.26, 0.80, tw - 0.10, 0.90, 0, 10, ...WHEEL);
    // Wooden food cart prep body (z = 8 .. 22)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 8, 22, ...CART_WOOD);
    // Stainless steel soup / broth cauldron (z = 22 .. 32)
    box(0.16 * tw, 0.24 * th, 0.16 * tw + 0.34, 0.24 * th + 0.34, 22, 32, '#c8d0d8', '#a4acb4', '#7c848c');
    // Golden broth inside cauldron top
    box(0.18 * tw, 0.26 * th, 0.18 * tw + 0.30, 0.26 * th + 0.30, 31, 32, '#f0b840', '#d49c24', '#946a10');
    // Scallion & nori garnish on broth
    box(0.20 * tw, 0.28 * th, 0.24 * tw, 0.32 * th, 32, 33, '#2a883a', '#1c6628', '#104418');
    // Stack of ceramic ramen bowls (z = 22 .. 29)
    box(0.56 * tw, 0.30 * th, 0.56 * tw + 0.22, 0.30 * th + 0.22, 22, 29, '#f4f0e6', '#d6d0c2', '#a8a294');
    // Chopstick caddy (z = 22 .. 30)
    box(tw - 0.24, 0.26 * th, tw - 0.12, 0.26 * th + 0.12, 22, 30, '#d24830', '#a8321e', '#7c2010');
    // Canopy corner posts (z = 22 .. 44)
    box(0.06, 0.10, 0.12, 0.16, 22, 44, ...CART_WOOD);
    box(tw - 0.12, 0.10, tw - 0.06, 0.16, 22, 44, ...CART_WOOD);
    box(0.06, th - 0.16, 0.12, th - 0.10, 22, 44, ...CART_WOOD);
    box(tw - 0.12, th - 0.16, tw - 0.06, th - 0.10, 22, 44, ...CART_WOOD);
    // Striped fabric awning roof (z = 44 .. 52)
    box(0.02, 0.04, tw - 0.02, th - 0.04, 44, 52, ...AWNING_BLUE);
    box(tw * 0.25, 0.02, tw * 0.45, th - 0.02, 45, 53, ...AWNING_WHITE);
    box(tw * 0.65, 0.02, tw * 0.85, th - 0.02, 45, 53, ...AWNING_WHITE);
    // Hanging red paper lantern (z = 30 .. 42) with gold tassel
    box(tw - 0.25, 0.68, tw - 0.08, 0.85, 32, 42, '#f03838', '#cc2020', '#900e0e');
    box(tw - 0.19, 0.74, tw - 0.14, 0.79, 29, 32, '#ffe27a', '#d8a834', '#98721c'); // gold tassel
  });
}

export function buildKaraokeMachineSprite(rot = 0) {
  const KIOSK = ['#282c4e', '#1c1e36', '#101222'];
  const DISPLAY = ['#20d0f0', '#14a4c4', '#0c7088'];

  return isoSprite(1, 1, 50, (box) => {
    // Mirror stage plinth (z = 0 .. 4)
    box(0.12, 0.12, 0.88, 0.88, 0, 4, '#442854', '#301a3e', '#200e2a');
    // Console tower cabinet (z = 4 .. 38)
    box(0.20, 0.20, 0.80, 0.54, 4, 38, ...KIOSK);
    // Audio VU-meter spectrum LED display (z = 10 .. 22)
    box(0.26, 0.52, 0.38, 0.56, 10, 18, '#40f060', '#28c442', '#16842a');
    box(0.44, 0.52, 0.56, 0.56, 10, 22, '#ffe030', '#d4b418', '#947c0c');
    box(0.62, 0.52, 0.74, 0.56, 10, 16, '#ff3040', '#cc1826', '#880c16');
    // Lyrics video display (z = 24 .. 36)
    box(0.24, 0.50, 0.76, 0.56, 24, 36, ...DISPLAY);
    // Microphone stand in front (z = 4 .. 30)
    box(0.44, 0.68, 0.56, 0.80, 4, 6, '#404050', '#2c2c38', '#1c1c24');
    box(0.48, 0.72, 0.52, 0.76, 6, 26, '#c0c4d4', '#9aa0b0', '#6c7280');
    box(0.44, 0.68, 0.56, 0.80, 26, 31, '#e0e4f4', '#b8bed0', '#80889c'); // mic head
    // Top spinning disco ball mirror dome (z = 38 .. 46)
    box(0.32, 0.24, 0.68, 0.50, 38, 46, '#f0f4ff', '#ccd4e8', '#94a0bc');
  });
}

export function buildTelescopeSprite(rot = 0) {
  const BRASS = ['#f6c667', '#d8a442', '#a07424'];
  const BRASS_LT = ['#ffe088', '#f6c667', '#c08e2c'];
  const TRIPOD = ['#7c4422', '#603216', '#44200c'];

  return isoSprite(1, 1, 56, (box) => {
    // 3 splayed mahogany tripod legs meeting at central hub (z = 0 .. 24)
    // South leg
    box(0.44, 0.72, 0.56, 0.84, 0, 8, ...TRIPOD);
    box(0.45, 0.58, 0.55, 0.72, 8, 16, ...TRIPOD);
    box(0.46, 0.48, 0.54, 0.58, 16, 24, ...TRIPOD);
    // West leg
    box(0.14, 0.24, 0.26, 0.36, 0, 8, ...TRIPOD);
    box(0.24, 0.30, 0.36, 0.42, 8, 16, ...TRIPOD);
    box(0.34, 0.38, 0.44, 0.48, 16, 24, ...TRIPOD);
    // East leg
    box(0.74, 0.24, 0.86, 0.36, 0, 8, ...TRIPOD);
    box(0.64, 0.30, 0.76, 0.42, 8, 16, ...TRIPOD);
    box(0.56, 0.38, 0.66, 0.48, 16, 24, ...TRIPOD);

    // Equatorial mount hub & setting circles (z = 24 .. 28)
    box(0.42, 0.42, 0.58, 0.58, 24, 28, ...BRASS);
    // Counterweight rod extending to the right
    box(0.58, 0.46, 0.76, 0.54, 22, 25, '#8c6418', '#6a480e', '#482e06');
    box(0.70, 0.44, 0.78, 0.56, 21, 26, ...BRASS);

    // Slender angled brass refractor tube pointing up & towards north-west
    // Eyepiece / diagonal at bottom
    box(0.54, 0.54, 0.66, 0.66, 25, 29, ...BRASS);
    // Mid barrel section
    box(0.40, 0.40, 0.54, 0.54, 29, 39, ...BRASS);
    // Upper barrel section
    box(0.30, 0.30, 0.44, 0.44, 39, 47, ...BRASS);
    // Flared objective dew shield
    box(0.22, 0.22, 0.38, 0.38, 47, 54, ...BRASS_LT);
    // Coated objective lens reflection
    box(0.24, 0.24, 0.36, 0.36, 54, 55, '#e0f8ff', '#a8e8f8', '#60b8d8');
  });
}

export function buildKoiPondSprite(rot = 0) {
  const SLATE = ['#6a6e7c', '#505460', '#383c46'];
  const WATER = ['#48b8c8', '#2a8e9e', '#1a6472'];
  const LILY = ['#4ebd5e', '#369e44', '#226e2e'];

  return isoSprite(2, 2, 14, (box) => {
    // Slate stone basin rim around all 4 sides (z = 0 .. 8)
    box(0.04, 0.04, 1.96, 0.26, 0, 8, ...SLATE); // North rim
    box(0.04, 1.74, 1.96, 1.96, 0, 8, ...SLATE); // South rim
    box(0.04, 0.26, 0.26, 1.74, 0, 8, ...SLATE); // West rim
    box(1.74, 0.26, 1.96, 1.74, 0, 8, ...SLATE); // East rim
    // Clear turquoise water pool (z = 0 .. 5)
    box(0.26, 0.26, 1.74, 1.74, 0, 5, ...WATER);
    // Natural river boulder stepping stone (z = 0 .. 7)
    box(0.85, 0.85, 1.25, 1.25, 0, 7, '#888e9c', '#6c727e', '#4c525c');
    // Emerald floating lily pads on water surface (z = 5 .. 6)
    box(0.42, 0.52, 0.70, 0.80, 5, 6, ...LILY);
    box(0.54, 0.62, 0.62, 0.70, 6, 7, '#ff80b0', '#d85888', '#983058'); // pink lotus bud
    box(1.30, 1.10, 1.56, 1.36, 5, 6, ...LILY);
    // Swimming Kohaku koi (white with red patches)
    box(0.70, 0.40, 1.10, 0.65, 3, 5, '#f4f4f8', '#d0d0d8', '#a0a0aa');
    box(0.82, 0.46, 0.98, 0.58, 4, 5, '#e63820', '#b82410', '#801408'); // red mark
    // Swimming Yamabuki koi (golden yellow)
    box(1.10, 0.65, 1.45, 0.90, 2, 4, '#f8c830', '#d8a018', '#986c0c');
  });
}

export function buildCapsuleDispenserSprite(rot = 0) {
  const RED_BODY = ['#e03040', '#b8202e', '#80101c'];
  const GLOBE = ['#88d8f0', '#58b4d0', '#308098'];
  const CHROME = ['#e0e4ec', '#b8c0cc', '#848c98'];

  return isoSprite(1, 1, 46, (box) => {
    // Red gachapon pedestal stand (z = 0 .. 18)
    box(0.18, 0.18, 0.82, 0.82, 0, 18, ...RED_BODY);
    // Prize retrieval door flap (z = 2 .. 9)
    box(0.32, 0.76, 0.68, 0.84, 2, 9, '#303038', '#202028', '#14141c');
    // Rotating turn crank key (z = 11 .. 16)
    box(0.40, 0.76, 0.60, 0.84, 11, 16, ...CHROME);
    // Transparent spherical/prism toy capsule globe (z = 18 .. 36)
    box(0.16, 0.16, 0.84, 0.84, 18, 36, ...GLOBE);
    // Multi-colored toy prize capsules inside globe
    box(0.24, 0.28, 0.44, 0.48, 20, 26, '#ff4050', '#d82030', '#94101e'); // red
    box(0.54, 0.30, 0.74, 0.50, 20, 26, '#ffd830', '#d4b018', '#987c0c'); // yellow
    box(0.34, 0.52, 0.54, 0.72, 22, 28, '#4ae060', '#2cb840', '#1a8428'); // green
    box(0.30, 0.32, 0.50, 0.52, 27, 33, '#30c0ff', '#1890d0', '#0c6090'); // cyan
    box(0.50, 0.50, 0.70, 0.70, 27, 33, '#b860f0', '#9038cc', '#601890'); // purple
    // Molded crimson lid cap (z = 36 .. 42)
    box(0.18, 0.18, 0.82, 0.82, 36, 40, ...RED_BODY);
    box(0.30, 0.30, 0.70, 0.70, 40, 42, '#f44454', '#d02838', '#981420');
  });
}

export function buildSuiteBedSprite(rot = 0) {
  const HEAD = ['#6b4226', '#52301a', '#3a2010'];
  const SHEET = ['#f7f4ee', '#ded8cc', '#b8b0a2'];
  const DUVET = ['#5a82c8', '#4268ac', '#2c4a82'];
  const PILLOW = ['#ffffff', '#e6e4ec', '#c4c0cc'];
  return isoSprite(2, 2, 38, (box) => {
    box(0.06, 0.06, 1.94, 1.94, 0, 7, ...HEAD);
    box(0.10, 0.10, 1.90, 1.90, 7, 15, ...SHEET);
    if (rot % 2 === 0) {
      box(0.06, 0.06, 1.94, 0.28, 7, 34, ...HEAD);
      box(0.10, 0.70, 1.90, 1.90, 8, 16, ...DUVET);
      box(0.24, 0.32, 0.92, 0.64, 15, 19, ...PILLOW);
      box(1.08, 0.32, 1.76, 0.64, 15, 19, ...PILLOW);
    } else {
      box(0.06, 0.06, 0.28, 1.94, 7, 34, ...HEAD);
      box(0.70, 0.10, 1.90, 1.90, 8, 16, ...DUVET);
      box(0.32, 0.24, 0.64, 0.92, 15, 19, ...PILLOW);
      box(0.32, 1.08, 0.64, 1.76, 15, 19, ...PILLOW);
    }
  });
}

export function buildTreadmillSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [2, 1] : [1, 2];
  const FRAME = ['#525866', '#3c424e', '#282c36'];
  const BELT = ['#282a30', '#1c1e24', '#121418'];
  const SCREEN = ['#38d8f0', '#20a8c0', '#127488'];
  return isoSprite(tw, th, 42, (box) => {
    box(0.10, 0.08, tw - 0.10, th - 0.08, 0, 5, ...FRAME);
    box(0.16, 0.14, tw - 0.16, th - 0.14, 5, 6, ...BELT);
    if (rot % 2 === 0) {
      box(0.12, 0.12, 0.22, 0.30, 5, 34, ...FRAME);
      box(0.78, 0.12, 0.88, 0.30, 5, 34, ...FRAME);
      box(0.12, 0.10, 0.88, 0.42, 32, 39, ...FRAME);
      box(0.24, 0.16, 0.76, 0.36, 39, 41, ...SCREEN);
    } else {
      box(0.12, 0.12, 0.30, 0.22, 5, 34, ...FRAME);
      box(0.12, 0.78, 0.30, 0.88, 5, 34, ...FRAME);
      box(0.10, 0.12, 0.42, 0.88, 32, 39, ...FRAME);
      box(0.16, 0.24, 0.36, 0.76, 39, 41, ...SCREEN);
    }
  });
}

export function buildWeightBenchSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [2, 1] : [1, 2];
  const STEEL = ['#8a92a4', '#687082', '#464c5a'];
  const PAD = ['#d83c48', '#b02834', '#7e1822'];
  const PLATE = ['#2c303a', '#1e222a', '#12141a'];
  return isoSprite(tw, th, 38, (box) => {
    box(0.26, 0.16, tw - 0.26, th - 0.16, 0, 9, ...STEEL);
    box(0.22, 0.14, tw - 0.22, th - 0.14, 9, 13, ...PAD);
    if (rot % 2 === 0) {
      box(0.14, 0.18, 0.24, 0.28, 0, 30, ...STEEL);
      box(0.76, 0.18, 0.86, 0.28, 0, 30, ...STEEL);
      box(0.02, 0.20, 0.98, 0.26, 26, 28, '#d8e0ec', '#b0b8c6', '#7c8494');
      box(0.04, 0.12, 0.12, 0.34, 21, 33, ...PLATE);
      box(0.88, 0.12, 0.96, 0.34, 21, 33, ...PLATE);
    } else {
      box(0.18, 0.14, 0.28, 0.24, 0, 30, ...STEEL);
      box(0.18, 0.76, 0.28, 0.86, 0, 30, ...STEEL);
      box(0.20, 0.02, 0.26, 0.98, 26, 28, '#d8e0ec', '#b0b8c6', '#7c8494');
      box(0.12, 0.04, 0.34, 0.12, 21, 33, ...PLATE);
      box(0.12, 0.88, 0.34, 0.96, 21, 33, ...PLATE);
    }
  });
}

export function buildDumbbellRackSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const RACK = ['#565e6e', '#3e4452', '#262a34'];
  const IRON = ['#2e3440', '#20242e', '#14161c'];
  const CHROME = ['#dce2ee', '#b2bac8', '#808898'];
  return isoSprite(tw, th, 32, (box) => {
    box(0.08, 0.14, tw - 0.08, th - 0.14, 0, 10, ...RACK);
    box(0.10, 0.18, tw - 0.10, th - 0.18, 10, 22, ...RACK);
    for (let i = 0; i < 4; i++) {
      const t = 0.20 + i * 0.40;
      const x = rot % 2 ? 0.28 : t;
      const y = rot % 2 ? t : 0.28;
      box(x, y, x + 0.26, y + 0.26, 22, 26, ...IRON);
      box(x + 0.06, y + 0.06, x + 0.20, y + 0.20, 26, 28, ...CHROME);
    }
  });
}

export function buildYogaMatSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [2, 1] : [1, 2];
  const MAT = ['#a678e2', '#8658c2', '#5e3892'];
  const TRIM = ['#70e4d0', '#4cb8a6', '#2e8476'];
  return isoSprite(tw, th, 8, (box) => {
    box(0.12, 0.08, tw - 0.12, th - 0.08, 0, 2, ...MAT);
    box(0.18, 0.14, tw - 0.18, th - 0.14, 2, 3, ...TRIM);
    box(0.22, 0.16, 0.68, 0.36, 2, 6, '#f4f0fc', '#d4cce4', '#a49cb8');
  });
}

export function buildDiningTableSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const LINEN = ['#fbf8f2', '#e2dcd0', '#bab2a4'];
  const GOLD = ['#f6c862', '#d4a23c', '#986e1c'];
  return isoSprite(tw, th, 34, (box) => {
    box(0.20, 0.20, tw - 0.20, th - 0.20, 0, 18, ...WOOD);
    box(0.06, 0.08, tw - 0.06, th - 0.08, 18, 25, ...LINEN);
    box(tw / 2 - 0.10, th / 2 - 0.10, tw / 2 + 0.10, th / 2 + 0.10, 25, 31, ...GOLD);
    box(tw / 2 - 0.06, th / 2 - 0.06, tw / 2 + 0.06, th / 2 + 0.06, 31, 33, '#fff6a0', '#ffc840', '#d08818');
  });
}

export function buildDiningChairSprite(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const VELVET = ['#c83e58', '#a22840', '#721428'];
  return isoSprite(1, 1, 34, (box) => {
    box(0.20, 0.20, 0.32, 0.32, 0, 10, ...WOOD);
    box(0.68, 0.20, 0.80, 0.32, 0, 10, ...WOOD);
    box(0.20, 0.68, 0.32, 0.80, 0, 10, ...WOOD);
    box(0.68, 0.68, 0.80, 0.80, 0, 10, ...WOOD);
    box(0.18, 0.18, 0.82, 0.82, 10, 14, ...VELVET);
    if (r === 0) box(0.18, 0.16, 0.82, 0.32, 14, 32, ...VELVET);
    else if (r === 1) box(0.16, 0.18, 0.32, 0.82, 14, 32, ...VELVET);
    else if (r === 2) box(0.18, 0.68, 0.82, 0.84, 14, 32, ...VELVET);
    else box(0.68, 0.18, 0.84, 0.82, 14, 32, ...VELVET);
  });
}

export function buildBuffetCounterSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  const MARBLE = ['#f6f0e4', '#dcd2c0', '#b2a692'];
  const BRASS = ['#f4c662', '#d2a03c', '#986c1c'];
  return isoSprite(tw, th, 40, (box) => {
    box(0.06, 0.10, tw - 0.06, th - 0.10, 0, 22, ...WOOD);
    box(0.02, 0.06, tw - 0.02, th - 0.06, 22, 26, ...MARBLE);
    for (let i = 0; i < 3; i++) {
      const t = 0.24 + i * 0.90;
      const x = rot % 2 ? 0.22 : t;
      const y = rot % 2 ? t : 0.22;
      box(x, y, x + 0.52, y + 0.52, 26, 33, ...BRASS);
    }
  });
}

export function buildChefStationSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#d8dfe8', '#b0b8c4', '#7e8694'];
  const GRILL = ['#383c46', '#262a32', '#16181e'];
  const COPPER = ['#e07c44', '#b85c28', '#843c14'];
  return isoSprite(tw, th, 38, (box) => {
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 24, ...STEEL);
    box(0.12, 0.14, tw * 0.55, th * 0.82, 24, 27, ...GRILL);
    box(tw * 0.62, th * 0.24, tw * 0.62 + 0.26, th * 0.24 + 0.26, 24, 33, ...COPPER);
  });
}

export function buildPoolWaterSprite(rot = 0) {
  const RIM = ['#e8f4f8', '#c4dce4', '#92aeb8'];
  const WATER = ['#48d4e8', '#2ab0c8', '#187c94'];
  const FOAM = ['#b8f6ff', '#84e2f4', '#50b4c8'];
  return isoSprite(2, 2, 8, (box) => {
    box(0.02, 0.02, 1.98, 1.98, 0, 4, ...RIM);
    box(0.14, 0.14, 1.86, 1.86, 0, 5, ...WATER);
    box(0.36, 0.44, 0.92, 0.62, 5, 6, ...FOAM);
    box(1.10, 1.22, 1.64, 1.40, 5, 6, ...FOAM);
  });
}

export function buildSaunaCabinSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const CEDAR = ['#d48c52', '#b06c36', '#804a1e'];
  const GLASS = ['#ffb860', '#d88c38', '#985c18'];
  return isoSprite(tw, th, 56, (box) => {
    box(0.06, 0.08, tw - 0.06, th - 0.08, 0, 52, ...CEDAR);
    box(tw * 0.30, th * 0.30, tw * 0.70, th * 0.92, 4, 44, ...GLASS);
    box(0.04, 0.06, tw - 0.04, th - 0.06, 52, 55, '#e8a468', '#c48248', '#8c5628');
  });
}

export function buildTowelRackSprite(rot = 0) {
  const BAMBOO = ['#dfc082', '#ba9a58', '#886c34'];
  const TOWEL1 = ['#ffffff', '#dce4ec', '#b0bac6'];
  const TOWEL2 = ['#68dcd0', '#44b4a8', '#288076'];
  return isoSprite(1, 1, 42, (box) => {
    box(0.18, 0.18, 0.82, 0.82, 0, 38, ...BAMBOO);
    box(0.22, 0.22, 0.78, 0.84, 8, 15, ...TOWEL1);
    box(0.22, 0.22, 0.78, 0.84, 18, 25, ...TOWEL2);
    box(0.22, 0.22, 0.78, 0.84, 28, 35, ...TOWEL1);
  });
}

export function buildEspressoBarSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const COUNTER = ['#5c3c28', '#442a1a', '#2c180e'];
  const COPPER = ['#e2884e', '#ba6630', '#844218'];
  const GLASS = ['#d8f2ff', '#a8d4ec', '#74a0bc'];
  return isoSprite(tw, th, 44, (box) => {
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 24, ...COUNTER);
    box(0.14 * tw, 0.20 * th, 0.48 * tw, 0.76 * th, 24, 38, ...COPPER);
    box(0.56 * tw, 0.20 * th, 0.90 * tw, 0.80 * th, 24, 35, ...GLASS);
  });
}

export function buildCafeTableSprite(rot = 0) {
  const BRASS = ['#e8ba54', '#c49434', '#8c6418'];
  const TOP = ['#f8f4ec', '#dcd4c6', '#b0a898'];
  return isoSprite(1, 1, 28, (box) => {
    box(0.30, 0.30, 0.70, 0.70, 0, 4, ...BRASS);
    box(0.44, 0.44, 0.56, 0.56, 4, 20, ...BRASS);
    box(0.12, 0.12, 0.88, 0.88, 20, 24, ...TOP);
    box(0.38, 0.38, 0.58, 0.58, 24, 27, '#d87a48', '#b05a2c', '#7c3a16');
  });
}

export function buildPoolTableSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const MAHOGANY = ['#7c3626', '#5e2418', '#40140c'];
  const FELT = ['#28a862', '#1c844a', '#105830'];
  return isoSprite(tw, th, 30, (box) => {
    box(0.12, 0.12, 0.26, 0.26, 0, 16, ...MAHOGANY);
    box(tw - 0.26, 0.12, tw - 0.12, 0.26, 0, 16, ...MAHOGANY);
    box(0.12, th - 0.26, 0.26, th - 0.12, 0, 16, ...MAHOGANY);
    box(tw - 0.26, th - 0.26, tw - 0.12, th - 0.12, 0, 16, ...MAHOGANY);
    box(0.04, 0.06, tw - 0.04, th - 0.06, 16, 24, ...MAHOGANY);
    box(0.12, 0.14, tw - 0.12, th - 0.14, 24, 26, ...FELT);
    box(tw * 0.35, th * 0.42, tw * 0.35 + 0.12, th * 0.42 + 0.12, 26, 28, '#ffd840', '#d4a820', '#987410');
    box(tw * 0.62, th * 0.48, tw * 0.62 + 0.12, th * 0.48 + 0.12, 26, 28, '#ff4050', '#c82030', '#8c101c');
  });
}

export function buildComputerDeskSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const MONITOR = ['#283040', '#1c222e', '#10141c'];
  const SCREEN = ['#50d8ff', '#30a8d0', '#187494'];
  return isoSprite(tw, th, 40, (box) => {
    box(0.06, 0.10, tw - 0.06, th - 0.10, 0, 22, ...WOOD);
    box(0.20 * tw, 0.20 * th, 0.56 * tw, 0.42 * th, 22, 36, ...MONITOR);
    box(0.24 * tw, 0.38 * th, 0.52 * tw, 0.44 * th, 24, 34, ...SCREEN);
    box(0.64 * tw, 0.28 * th, 0.82 * tw, 0.48 * th, 22, 34, '#f6c862', '#d4a23c', '#986e1c');
  });
}

export function buildSkyTreeSprite(rot = 0) {
  const STONE = ['#949aa8', '#747a88', '#525662'];
  const TRUNK = ['#6e4832', '#523422', '#382014'];
  const BLOSSOM1 = ['#ff9ec6', '#de78a2', '#a84e74'];
  const BLOSSOM2 = ['#ffb8d8', '#f090b8', '#ba6288'];
  return isoSprite(1, 1, 58, (box) => {
    box(0.20, 0.20, 0.80, 0.80, 0, 12, ...STONE);
    box(0.42, 0.42, 0.58, 0.58, 12, 34, ...TRUNK);
    box(0.14, 0.14, 0.86, 0.86, 32, 46, ...BLOSSOM1);
    box(0.24, 0.24, 0.76, 0.76, 46, 56, ...BLOSSOM2);
  });
}

export function buildGardenBenchSprite(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const [tw, th] = r % 2 ? [1, 2] : [2, 1];
  const TEAK = ['#d29456', '#ae743a', '#7e4e20'];
  const IRON = ['#3c424e', '#2a2e38', '#1a1c22'];
  return isoSprite(tw, th, 32, (box) => {
    box(0.08, 0.14, 0.20, th - 0.14, 0, 18, ...IRON);
    box(tw - 0.20, 0.14, tw - 0.08, th - 0.14, 0, 18, ...IRON);
    box(0.08, 0.14, tw - 0.08, th - 0.14, 10, 14, ...TEAK);
    if (r % 2 === 0) box(0.08, 0.12, tw - 0.08, 0.30, 14, 30, ...TEAK);
    else box(0.12, 0.08, 0.30, th - 0.08, 14, 30, ...TEAK);
  });
}

export function buildFlowerPlanterSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STONE = ['#b8b2a6', '#969084', '#6e685e'];
  const FOLIAGE = ['#4ec464', '#369c4a', '#226c30'];
  const BLOOM1 = ['#68a8ff', '#4884d8', '#2c5ca0'];
  const BLOOM2 = ['#ffbe44', '#d89624', '#9c6610'];
  return isoSprite(tw, th, 32, (box) => {
    box(0.06, 0.10, tw - 0.06, th - 0.10, 0, 14, ...STONE);
    box(0.10, 0.14, tw - 0.10, th - 0.14, 14, 24, ...FOLIAGE);
    box(0.18 * tw, 0.24 * th, 0.44 * tw, 0.72 * th, 24, 30, ...BLOOM1);
    box(0.56 * tw, 0.24 * th, 0.82 * tw, 0.72 * th, 24, 30, ...BLOOM2);
  });
}

export function buildMarblePillarSprite() {
  const MARBLE = ['#f7f0e4', '#ded4c2', '#b8ab96'];
  const GOLD = ['#f8cf6a', '#d4a438', '#9c7218'];
  return isoSprite(1, 1, 58, (box) => {
    box(0.16, 0.16, 0.84, 0.84, 0, 6, ...GOLD);
    box(0.22, 0.22, 0.78, 0.78, 6, 11, ...MARBLE);
    box(0.28, 0.28, 0.72, 0.72, 11, 48, ...MARBLE);
    box(0.22, 0.22, 0.78, 0.78, 48, 53, ...MARBLE);
    box(0.16, 0.16, 0.84, 0.84, 53, 57, ...GOLD);
  });
}

export function buildChandelierSprite() {
  const GOLD = ['#ffe082', '#d8a838', '#9e7216'];
  const CRYSTAL = ['#e8f8ff', '#b8e2f8', '#7cb4d8'];
  const GLOW = ['#fff9d2', '#ffe074', '#d89e28'];
  return isoSprite(2, 2, 54, (box) => {
    // Subtle inlaid golden marble floor medallion beneath chandelier
    box(0.35, 0.35, 1.65, 1.65, 0, 2, ...GOLD);
    box(0.55, 0.55, 1.45, 1.45, 0, 3, ...CRYSTAL);
    // Suspended multi-tier crystal & brass chandelier crown
    box(0.92, 0.92, 1.08, 1.08, 36, 52, ...GOLD);
    box(0.38, 0.38, 1.62, 1.62, 30, 35, ...GOLD);
    box(0.46, 0.46, 1.54, 1.54, 25, 30, ...CRYSTAL);
    box(0.66, 0.66, 1.34, 1.34, 20, 25, ...CRYSTAL);
    box(0.34, 0.34, 0.52, 0.52, 35, 41, ...GLOW);
    box(1.48, 0.34, 1.66, 0.52, 35, 41, ...GLOW);
    box(0.34, 1.48, 0.52, 1.66, 35, 41, ...GLOW);
    box(1.48, 1.48, 1.66, 1.66, 35, 41, ...GLOW);
  });
}

export function buildGrandStaircaseSprite(rot = 0) {
  const MARBLE = ['#f4ece0', '#d8cebe', '#b0a492'];
  const CARPET = ['#c83850', '#9e2438', '#6e1424'];
  const BRASS = ['#f4c658', '#ca962c', '#8e6414'];
  return isoSprite(2, 2, 52, (box) => {
    if (rot % 2 === 0) {
      box(0.06, 0.06, 1.94, 0.65, 0, 36, ...MARBLE);
      box(0.06, 0.65, 1.94, 1.15, 0, 24, ...MARBLE);
      box(0.06, 1.15, 1.94, 1.60, 0, 14, ...MARBLE);
      box(0.06, 1.60, 1.94, 1.94, 0, 6, ...MARBLE);
      // Crimson carpet runner down steps
      box(0.42, 0.12, 1.58, 0.65, 36, 38, ...CARPET);
      box(0.42, 0.65, 1.58, 1.15, 24, 26, ...CARPET);
      box(0.42, 1.15, 1.58, 1.60, 14, 16, ...CARPET);
      box(0.42, 1.60, 1.58, 1.92, 6, 8, ...CARPET);
      // Brass balustrades
      box(0.08, 0.08, 0.24, 1.90, 6, 44, ...BRASS);
      box(1.76, 0.08, 1.92, 1.90, 6, 44, ...BRASS);
    } else {
      box(0.06, 0.06, 0.65, 1.94, 0, 36, ...MARBLE);
      box(0.65, 0.06, 1.15, 1.94, 0, 24, ...MARBLE);
      box(1.15, 0.06, 1.60, 1.94, 0, 14, ...MARBLE);
      box(1.60, 0.06, 1.94, 1.94, 0, 6, ...MARBLE);
      box(0.12, 0.42, 0.65, 1.58, 36, 38, ...CARPET);
      box(0.65, 0.42, 1.15, 1.58, 24, 26, ...CARPET);
      box(1.15, 0.42, 1.60, 1.58, 14, 16, ...CARPET);
      box(1.60, 0.42, 1.92, 1.58, 6, 8, ...CARPET);
      box(0.08, 0.08, 1.90, 0.24, 6, 44, ...BRASS);
      box(0.08, 1.76, 1.90, 1.92, 6, 44, ...BRASS);
    }
  });
}

export function buildLobbyFountainSprite() {
  const MARBLE = ['#f2eae0', '#d4cab8', '#a89e8c'];
  const WATER = ['#6ce4f8', '#3cb8d4', '#1e829c'];
  const GOLD = ['#f8cf68', '#d09e30', '#966c14'];
  return isoSprite(2, 2, 46, (box) => {
    box(0.10, 0.10, 1.90, 1.90, 0, 10, ...MARBLE);
    box(0.22, 0.22, 1.78, 1.78, 10, 12, ...WATER);
    box(0.56, 0.56, 1.44, 1.44, 12, 24, ...MARBLE);
    box(0.64, 0.64, 1.36, 1.36, 24, 26, ...WATER);
    box(0.82, 0.82, 1.18, 1.18, 26, 38, ...MARBLE);
    box(0.88, 0.88, 1.12, 1.12, 38, 44, ...GOLD);
  });
}

export function buildLuggageTrolleySprite(rot = 0) {
  const BRASS = ['#f6cb62', '#cf9c30', '#946a14'];
  const BASE = ['#c4364c', '#982236', '#681222'];
  const CASE1 = ['#8c5230', '#6c3a1e', '#4a2410'];
  const CASE2 = ['#3e6b8c', '#2a4e68', '#183246'];
  return isoSprite(1, 1, 44, (box) => {
    box(0.14, 0.18, 0.86, 0.82, 0, 6, ...BASE);
    box(0.16, 0.20, 0.26, 0.80, 6, 38, ...BRASS);
    box(0.74, 0.20, 0.84, 0.80, 6, 38, ...BRASS);
    box(0.16, 0.20, 0.84, 0.80, 38, 42, ...BRASS);
    if (rot % 2 === 0) {
      box(0.28, 0.24, 0.72, 0.54, 6, 18, ...CASE1);
      box(0.30, 0.54, 0.70, 0.78, 6, 16, ...CASE2);
    } else {
      box(0.24, 0.28, 0.54, 0.72, 6, 18, ...CASE1);
      box(0.54, 0.30, 0.78, 0.70, 6, 16, ...CASE2);
    }
  });
}

export function buildConciergeDeskSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const WALNUT = ['#6e4228', '#522e18', '#361c0c'];
  const BRASS = ['#f4c65a', '#cc982e', '#926814'];
  const LEDGER = ['#fcf6e8', '#dfd4be', '#b4a890'];
  return isoSprite(tw, th, 38, (box) => {
    box(0.06, 0.10, tw - 0.06, th - 0.10, 0, 22, ...WALNUT);
    box(0.04, 0.08, tw - 0.04, th - 0.08, 22, 26, ...BRASS);
    box(0.22 * tw, 0.26 * th, 0.54 * tw, 0.72 * th, 26, 30, ...LEDGER);
    box(0.66 * tw, 0.30 * th, 0.84 * tw, 0.68 * th, 26, 35, ...BRASS);
  });
}

export function buildLobbyRunnerSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [3, 2] : [2, 3];
  const GOLD = ['#f6c667', '#d8a442', '#a07424'];
  const CRIMSON = ['#b8324a', '#942238', '#681424'];
  const INNER = ['#d84a64', '#b4344c', '#822034'];
  return isoSprite(tw, th, 10, (box) => {
    box(0.04, 0.04, tw - 0.04, th - 0.04, 0, 2, ...GOLD);
    box(0.14, 0.14, tw - 0.14, th - 0.14, 0, 2, ...CRIMSON);
    box(0.32, 0.32, tw - 0.32, th - 0.32, 0, 2, ...INNER);
  });
}

export const FURNITURE_BUILDERS = {
  stool: (rot) => buildStoolSprite(rot),
  sofa: (rot) => buildSofaSprite('#e2607a', rot),
  rooftopSofa: (rot) => buildSofaSprite('#5aa0e2', rot),
  lamp: (rot) => buildLampSprite(rot),
  plant: (rot) => buildPlantSprite(rot),
  rug: (rot) => buildRugSprite(rot),
  neonSign: (rot) => buildNeonSignSprite(rot),
  jukebox: (rot) => buildJukeboxSprite(rot),
  armchair: (rot) => buildArmchairSprite(rot),
  deckchair: (rot) => buildDeckchairSprite(rot),
  receptionDesk: (rot) => buildReceptionDesk(rot),
  bookshelf: (rot) => buildBookshelf(rot),
  barCounter: (rot) => buildBarCounter(rot),
  stringLights: (rot) => buildStringLightsSprite(rot),
  // 8 original v0.3.0 collection items
  aquarium: (rot) => buildAquariumSprite(rot),
  bobaBar: (rot) => buildBobaBarSprite(rot),
  miniArcade: (rot) => buildMiniArcadeSprite(rot),
  noodleCart: (rot) => buildNoodleCartSprite(rot),
  karaokeMachine: (rot) => buildKaraokeMachineSprite(rot),
  telescope: (rot) => buildTelescopeSprite(rot),
  koiPond: (rot) => buildKoiPondSprite(rot),
  capsuleDispenser: (rot) => buildCapsuleDispenserSprite(rot),
  // 19 original v0.4.0 facility & suite items
  suiteBed: (rot) => buildSuiteBedSprite(rot),
  treadmill: (rot) => buildTreadmillSprite(rot),
  weightBench: (rot) => buildWeightBenchSprite(rot),
  dumbbellRack: (rot) => buildDumbbellRackSprite(rot),
  yogaMat: (rot) => buildYogaMatSprite(rot),
  diningTable: (rot) => buildDiningTableSprite(rot),
  diningChair: (rot) => buildDiningChairSprite(rot),
  buffetCounter: (rot) => buildBuffetCounterSprite(rot),
  chefStation: (rot) => buildChefStationSprite(rot),
  poolWater: (rot) => buildPoolWaterSprite(rot),
  saunaCabin: (rot) => buildSaunaCabinSprite(rot),
  towelRack: (rot) => buildTowelRackSprite(rot),
  espressoBar: (rot) => buildEspressoBarSprite(rot),
  cafeTable: (rot) => buildCafeTableSprite(rot),
  poolTable: (rot) => buildPoolTableSprite(rot),
  computerDesk: (rot) => buildComputerDeskSprite(rot),
  skyTree: (rot) => buildSkyTreeSprite(rot),
  gardenBench: (rot) => buildGardenBenchSprite(rot),
  flowerPlanter: (rot) => buildFlowerPlanterSprite(rot),
  // v0.7.0 Grand Lobby architectural & luxury collection
  marblePillar: (rot) => buildMarblePillarSprite(rot),
  chandelier: (rot) => buildChandelierSprite(rot),
  grandStaircase: (rot) => buildGrandStaircaseSprite(rot),
  lobbyFountain: (rot) => buildLobbyFountainSprite(rot),
  luggageTrolley: (rot) => buildLuggageTrolleySprite(rot),
  conciergeDesk: (rot) => buildConciergeDeskSprite(rot),
  lobbyRunner: (rot) => buildLobbyRunnerSprite(rot),
};

export function shadeColor(hex, amt) {
  return shade(hex, amt);
}
