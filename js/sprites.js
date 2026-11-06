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

function mirrorH(sprite) {
  const out = makeGrid(sprite.w, sprite.h);
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      out.px[y][sprite.w - 1 - x] = sprite.px[y][x];
    }
  }
  return out;
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

// ---------- Character (avatar / NPC) ----------

const CHAR_W = 14;
const CHAR_H = 20;

function buildCharacterFrame(direction, legOffset, armSwing, scheme) {
  const s = makeGrid(CHAR_W, CHAR_H);
  const { skin, hair, shirt, shirtShade, pants, pantsShade, shoe, eye } = scheme;

  // legs (drawn first so torso overlaps the tops)
  fillRect(s, 3, 13 + (legOffset ? 1 : 0), 3, 5 - (legOffset ? 1 : 0), pants);
  fillRect(s, 8, 13 + (legOffset ? 0 : 1), 3, 5 - (legOffset ? 0 : 1), pantsShade);
  fillRect(s, 3, 17, 3, 2, shoe);
  fillRect(s, 8, 17, 3, 2, shoe);

  // torso
  fillRect(s, 2, 8, 10, 6, shirt);
  fillRect(s, 2, 8, 10, 2, shirtShade);
  // arms (shift down 1px on the swinging side)
  fillRect(s, 0, 8 + (armSwing === 'left' ? 1 : 0), 2, 5, shirt);
  fillRect(s, 12, 8 + (armSwing === 'right' ? 1 : 0), 2, 5, shirt);

  // head
  fillRect(s, 3, 1, 8, 7, skin);
  setPixel(s, 3, 1, null);
  setPixel(s, 10, 1, null);
  setPixel(s, 3, 7, null);
  setPixel(s, 10, 7, null);
  // hair
  fillRect(s, 3, 0, 8, 2, hair);
  setPixel(s, 3, 0, null);
  setPixel(s, 10, 0, null);

  if (direction === 'down') {
    setPixel(s, 5, 4, eye);
    setPixel(s, 8, 4, eye);
  } else if (direction === 'up') {
    fillRect(s, 3, 1, 8, 3, hair); // back of head, no face
  } else if (direction === 'right') {
    setPixel(s, 9, 4, eye);
  } else if (direction === 'left') {
    setPixel(s, 4, 4, eye);
  }

  return s;
}

function buildSitFrame(direction, scheme) {
  const s = makeGrid(CHAR_W, CHAR_H);
  const { skin, hair, shirt, shirtShade, pants, shoe, eye } = scheme;
  // folded legs (short, sitting on a seat)
  fillRect(s, 3, 15, 4, 3, pants);
  fillRect(s, 7, 15, 4, 3, pants);
  fillRect(s, 3, 17, 4, 1, shoe);
  fillRect(s, 7, 17, 4, 1, shoe);
  // torso
  fillRect(s, 2, 8, 10, 7, shirt);
  fillRect(s, 2, 8, 10, 2, shirtShade);
  fillRect(s, 0, 9, 2, 5, shirt);
  fillRect(s, 12, 9, 2, 5, shirt);
  // head
  fillRect(s, 3, 1, 8, 7, skin);
  setPixel(s, 3, 1, null);
  setPixel(s, 10, 1, null);
  setPixel(s, 3, 7, null);
  setPixel(s, 10, 7, null);
  fillRect(s, 3, 0, 8, 2, hair);
  setPixel(s, 3, 0, null);
  setPixel(s, 10, 0, null);
  if (direction === 'left') setPixel(s, 4, 4, eye);
  else if (direction === 'right') setPixel(s, 9, 4, eye);
  else {
    setPixel(s, 5, 4, eye);
    setPixel(s, 8, 4, eye);
  }
  return s;
}

export function buildCharacterSheet(scheme) {
  const right0 = buildCharacterFrame('right', false, 'left', scheme);
  const right1 = buildCharacterFrame('right', true, 'right', scheme);
  const down0 = buildCharacterFrame('down', false, 'left', scheme);
  const down1 = buildCharacterFrame('down', true, 'right', scheme);
  const up0 = buildCharacterFrame('up', false, 'left', scheme);
  const up1 = buildCharacterFrame('up', true, 'right', scheme);
  return {
    down: [down0, down1],
    up: [up0, up1],
    right: [right0, right1],
    left: [mirrorH(right0), mirrorH(right1)],
    sit: {
      down: buildSitFrame('down', scheme),
      up: buildSitFrame('down', scheme),
      left: buildSitFrame('left', scheme),
      right: buildSitFrame('right', scheme),
    },
  };
}

export const PLAYER_SCHEME = {
  skin: '#ffd9a8', hair: '#5a3826', shirt: '#4da3ff', shirtShade: '#2f7fd6',
  pants: '#2c3e63', pantsShade: '#223152', shoe: '#2a2a2a', eye: '#222222',
};

export function npcScheme(accentColor) {
  return {
    skin: '#ffe0b8', hair: '#3a2a22', shirt: accentColor, shirtShade: shade(accentColor, -0.22),
    pants: '#515a73', pantsShade: '#3f4760', shoe: '#2a2a2a', eye: '#222222',
  };
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
  fillDiamond(s, w / 2, h / 2, w / 2 - 1, h / 2 - 1, baseColor);
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
  const mat = '#caa05a';
  fillDiamond(s, w / 2, h / 2, w / 2 - 6, h / 2 - 6, mat);
  fillDiamond(s, w / 2, h / 2, w / 2 - 12, h / 2 - 12, shade(mat, -0.1));
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
  // horizontal plank shading lines, clipped to the wall silhouette
  for (let y = 0; y < h; y += 7) {
    for (let x = 0; x < w; x++) {
      if (s.px[y][x]) s.px[y][x] = shade(bodyColor, -0.14);
    }
  }
  // a thin highlight along the top (ceiling) edge of the wall
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (s.px[y][x]) { s.px[y][x] = trim; break; }
    }
  }
  return s;
}

export const WALL_ANCHOR_Y = ISO.WALL_H + ISO.TILE_H / 2;

export function buildWindowSegment(baseColor, glowColor, kind = 'north') {
  const s = buildWallSegment(baseColor, kind);
  const w = ISO.TILE_W;
  // Wall tiles only paint their local half-width nearest their "side" point
  // (see buildWallSegment) — the window must sit inside that slanted region,
  // centered at t=0.5 along the edge so it stays clear of both borders.
  const cx = kind === 'north' ? w * 0.75 : w * 0.25;
  const t = 0.5;
  const topY = t * (ISO.TILE_H / 2);
  const winW = 16, winH = 30, margin = 6;
  const left = Math.round(cx - winW / 2);
  const top = Math.round(topY + margin);
  fillRect(s, left - 2, top - 2, winW + 4, winH + 4, '#1b1f2e');
  fillRect(s, left, top, winW, winH, glowColor);
  fillRect(s, left + winW / 2 - 1, top, 2, winH, '#1b1f2e');
  fillRect(s, left, top + winH / 2 - 1, winW, 2, '#1b1f2e');
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

export function buildSofaSprite(color = '#e2607a') {
  const s = makeGrid(56, 34);
  fillRect(s, 2, 4, 52, 10, shade(color, 0.12));
  fillRect(s, 2, 12, 52, 16, color);
  fillRect(s, 2, 12, 6, 16, shade(color, -0.15));
  fillRect(s, 44, 12, 10, 16, shade(color, -0.2));
  fillRect(s, 4, 26, 6, 6, '#3a2a22');
  fillRect(s, 46, 26, 6, 6, '#3a2a22');
  fillRect(s, 10, 16, 14, 10, shade(color, 0.08));
  fillRect(s, 26, 16, 14, 10, shade(color, 0.04));
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

export const FURNITURE_BUILDERS = {
  stool: () => buildStoolSprite(),
  sofa: () => buildSofaSprite('#e2607a'),
  rooftopSofa: () => buildSofaSprite('#5aa0e2'),
  lamp: () => buildLampSprite(),
  plant: () => buildPlantSprite(),
  rug: () => buildRugSprite(),
  neonSign: () => buildNeonSignSprite(),
  jukebox: () => buildJukeboxSprite(),
};

export function shadeColor(hex, amt) {
  return shade(hex, amt);
}
