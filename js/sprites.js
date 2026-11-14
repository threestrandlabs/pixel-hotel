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
  if (!hex || typeof hex !== 'string') return '#000000';
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

// Every raster px-grid sprite below (floor/wall/window/door/elevator/balustrade) is
// authored at ART× the on-screen footprint: the grid is ART times finer in each axis
// than the CSS-pixel size the tile actually occupies, so there's real sub-pixel detail
// to draw (extra bands, flecks, grain) instead of just bigger blocks. ISO itself stays
// in CSS-pixel/world units — every other part of the renderer (screen projection,
// camera, collision) is unaffected — bakeSprite (render.js) divides the grid back down
// by ART when it blits, so on-screen size and world scale never change.
export const ART = 2;

export function buildFloorTile(baseColor, variant = 0, material = 'default') {
  const w = ISO.TILE_W * ART;
  const h = ISO.TILE_H * ART;
  const s = makeGrid(w, h);
  fillDiamond(s, w / 2, h / 2 - 0.5, w / 2 - 0.5, h / 2 - 0.5, baseColor);
  const light = shade(baseColor, 0.18);
  const dark = shade(baseColor, -0.16);

  if (material === 'lobby_marble' || material === 'marble') {
    // Polished ivory marble with subtle brass inlay diamond lines
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 24 * ART && d <= 26 * ART) {
          s.px[y][x] = '#cca442'; // warm polished brass
        } else if (d > 26 * ART) {
          s.px[y][x] = shade(baseColor, -0.06);
        } else {
          if ((x * 3 + y * 7) % 19 === 0) s.px[y][x] = shade(baseColor, 0.12);
          else if ((x * 5 + y * 2) % 23 === 0) s.px[y][x] = shade(baseColor, -0.08);
          else if ((x * 11 + y * 13) % 37 === 0) s.px[y][x] = shade(baseColor, 0.22); // fine quartz sparkle
        }
      }
    }
    if (variant % 2 === 0) {
      fillRect(s, w / 2 - 1, h / 2 - 1, 2, 2, '#d8b454');
    }
    return s;
  }

  if (material === 'dark_parquet' || material === 'dark_marble') {
    // Posh dark espresso mahogany parquet with golden brass inlay edge
    const darkWood = '#281a16';
    const midWood = '#34221c';
    const lightWood = '#402a22';
    const gold = '#c69a48';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 28 * ART) {
          s.px[y][x] = '#1a100e';
        } else if (d >= 25 * ART && d <= 26 * ART) {
          s.px[y][x] = gold;
        } else {
          const plank = variant % 2 === 0 ? ((x + y * 2) % 6) : ((x - y * 2 + 100) % 6);
          let c = plank < 2 ? darkWood : (plank < 4 ? midWood : lightWood);
          if ((x * 3 + y * 5) % 29 === 0) c = shade(c, 0.16); // fine grain fleck
          s.px[y][x] = c;
        }
      }
    }
    return s;
  }

  if (material === 'gym_rubber') {
    // Heavy-duty textured gym rubber matting with cool blue & white flecks
    const rubberBase = '#26282c';
    const rubberDark = '#1c1e22';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        if (nx + ny * 2 >= 29 * ART) {
          s.px[y][x] = '#141418';
          continue;
        }
        const hash = (x * 37 + y * 59 + variant * 17) & 0xff;
        let c = hash < 12 ? '#5c8ea8' : hash < 20 ? '#c8d4dc' : hash < 80 ? rubberDark : rubberBase;
        if (x % (8 * ART) < 1 || y % (8 * ART) < 1) c = shade(c, -0.22); // interlocking mat seams
        s.px[y][x] = c;
      }
    }
    return s;
  }

  if (material === 'spa_stone') {
    // Serene natural slate/travertine pavers with bevelled grout
    const stoneBase = '#789492';
    const stoneLight = '#8aa6a4';
    const stoneDark = '#627c7a';
    const grout = '#445a58';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 27 * ART) s.px[y][x] = grout;
        else if (d >= 25 * ART) s.px[y][x] = stoneDark;
        else {
          const hh = (x * 29 + y * 43) % 17;
          let c = hh < 4 ? stoneLight : (hh < 12 ? stoneBase : stoneDark);
          if ((x * 13 + y * 7) % 31 === 0) c = shade(c, 0.2); // mineral vein glint
          s.px[y][x] = c;
        }
      }
    }
    return s;
  }

  if (material === 'library_carpet') {
    // Deep burgundy woven wool carpet with golden diamond lattice
    const burgDark = '#3e121e';
    const burgMid = '#521828';
    const gold = '#b89248';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 28 * ART) s.px[y][x] = '#2c0c16';
        else if (Math.floor(d / ART) === 16 || Math.floor(d / ART) === 17) s.px[y][x] = gold;
        else {
          let c = (nx + ny) % 3 === 0 ? burgMid : burgDark;
          if ((x + y * 3) % 23 === 0) c = shade(gold, -0.3); // fine woven thread fleck
          s.px[y][x] = c;
        }
      }
    }
    return s;
  }

  if (material === 'arcade_neon') {
    // Retro cyber neon carpet: dark indigo with vibrant magenta and cyan pixel accents
    const bg = '#161226';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 29 * ART) { s.px[y][x] = '#0e0a1a'; continue; }
        if ((x + y) % 11 === 0 && d < 22 * ART) s.px[y][x] = '#ff2a8c';
        else if ((x - y + 60) % 13 === 0 && d < 22 * ART) s.px[y][x] = '#00e5ff';
        else if (Math.floor(d / ART) === 14) s.px[y][x] = '#4a2878';
        else if ((x * 3 + y * 5) % 43 === 0) s.px[y][x] = shade(bg, 0.3); // faint pixel sparkle grid
        else s.px[y][x] = bg;
      }
    }
    return s;
  }

  if (material === 'glasshouse_tile' || material === 'terracotta') {
    // Warm terracotta ceramic tile with ivory grout
    const terra = '#b86244';
    const terraDark = '#984e36';
    const grout = '#e2d8c6';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 28 * ART) s.px[y][x] = grout;
        else if (d >= 26 * ART) s.px[y][x] = terraDark;
        else {
          let c = (x + y * 3) % 7 === 0 ? terraDark : terra;
          if ((x * 5 + y) % 17 === 0) c = shade(terra, 0.22); // kiln-fired fleck
          s.px[y][x] = c;
        }
      }
    }
    return s;
  }

  if (material === 'grass') {
    // Lush lawn grass
    const g0 = '#3e8a42';
    const g1 = '#4ea052';
    const g2 = '#327236';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const hh = (x * 41 + y * 73) % 19;
        let c = hh < 5 ? g1 : (hh < 13 ? g0 : g2);
        if ((x * 17 + y * 23) % 31 === 0) c = shade(g1, 0.35); // dew-lit blade tip
        s.px[y][x] = c;
      }
    }
    return s;
  }

  if (material === 'stone_path') {
    // Flagstone garden path
    const stone = '#7e848c';
    const stoneDark = '#5e646c';
    const seam = '#3a5c36';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 27 * ART) s.px[y][x] = seam;
        else {
          let c = (x * 7 + y * 13) % 11 < 4 ? stoneDark : stone;
          if ((x * 3 + y * 19) % 29 === 0) c = shade(stone, 0.28); // mica glint
          s.px[y][x] = c;
        }
      }
    }
    return s;
  }

  if (material === 'timber_deck') {
    // Teak outdoor decking boards
    const teak = '#98683e';
    const teakDark = '#7c522e';
    const seam = '#4a301a';
    const boardW = 3 * ART;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        if (y % boardW < ART) s.px[y][x] = seam;
        else {
          let c = (x * 3 + y) % 9 === 0 ? teakDark : teak;
          if ((x * 11 + y * 2) % 23 === 0) c = shade(teak, 0.2); // grain highlight
          s.px[y][x] = c;
        }
      }
    }
    return s;
  }

  if (material === 'kitchen_tile') {
    // Commercial white kitchen floor tile
    const tile = '#e6ecf0';
    const tileShade = '#d4dce2';
    const grout = '#a4b0b8';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!s.px[y][x]) continue;
        const nx = Math.abs(x - w / 2);
        const ny = Math.abs(y - h / 2);
        const d = nx + ny * 2;
        if (d >= 28 * ART) s.px[y][x] = grout;
        else if (d >= 26 * ART) s.px[y][x] = tileShade;
        else s.px[y][x] = (x % (16 * ART) < ART || y % (16 * ART) < ART) ? shade(tile, -0.04) : tile; // individual tile grout lines
      }
    }
    return s;
  }

  // Default subtle diamond facets
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!s.px[y][x]) continue;
      const nx = x - w / 2;
      const ny = y - h / 2;
      if (nx + ny * 2 < -6 * ART) s.px[y][x] = light;
      else if (nx + ny * 2 > 10 * ART) s.px[y][x] = dark;
      else if ((Math.abs(nx) + Math.abs(ny)) % 23 === 0) s.px[y][x] = shade(baseColor, 0.08); // subtle fine fleck
    }
  }
  if (variant % 2 === 0) {
    fillRect(s, w / 2 - 1, h / 2 - 1, 2, 2, shade(baseColor, 0.3));
  }
  return s;
}

export function buildDoorTile(baseColor) {
  const s = buildFloorTile(baseColor, 1);
  const w = ISO.TILE_W * ART, h = ISO.TILE_H * ART;
  const mat = '#9c4a3c';
  fillDiamond(s, w / 2, h / 2, w / 2 - 8 * ART, h / 2 - 5 * ART, mat);
  fillDiamond(s, w / 2, h / 2, w / 2 - 12 * ART, h / 2 - 7 * ART, shade(mat, 0.15));
  fillDiamond(s, w / 2, h / 2, w / 2 - 16 * ART, h / 2 - 9 * ART, shade(mat, -0.1)); // inner bevel ring
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
  const w = ISO.TILE_W * ART;
  const h = (ISO.WALL_H + ISO.TILE_H) * ART;
  const s = makeGrid(w, h);
  const bodyColor = kind === 'north' ? baseColor : shade(baseColor, -0.1);
  const trim = shade(bodyColor, 0.22);

  const north = [w / 2, ISO.WALL_H * ART];
  const side = kind === 'north' ? [w, (ISO.WALL_H + ISO.TILE_H / 2) * ART] : [0, (ISO.WALL_H + ISO.TILE_H / 2) * ART];
  const northUp = [north[0], north[1] - ISO.WALL_H * ART];
  const sideUp = [side[0], side[1] - ISO.WALL_H * ART];

  fillPolygon(s, [northUp, sideUp, side, north], bodyColor);
  // plank shading lines run parallel to the wall's slanted base, not the screen
  const baseY = (x) => Math.round(ISO.WALL_H * ART + (kind === 'north' ? (x - w / 2) / 2 : (w / 2 - x) / 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!s.px[y][x]) continue;
      if ((baseY(x) - y) % 7 === 6) s.px[y][x] = shade(bodyColor, -0.14);
      else if ((x * 3 + y * 5) % 41 === 0) s.px[y][x] = shade(bodyColor, 0.08); // fine plank grain fleck
    }
  }
  // a thin highlight along the top (ceiling) edge of the wall
  for (let x = 0; x < w; x++) {
    let hit = 0;
    for (let y = 0; y < h && hit < ART; y++) {
      if (s.px[y][x]) { s.px[y][x] = hit === 0 ? trim : shade(trim, -0.1); hit++; }
    }
  }
  // dark baseboard where the wall meets the floor
  for (let x = 0; x < w; x++) {
    let last = -1;
    for (let y = 0; y < h; y++) if (s.px[y][x]) last = y;
    for (let y = last - 3 * ART; y <= last; y++) if (y >= 0 && s.px[y][x]) s.px[y][x] = shade(bodyColor, -0.32);
  }
  return s;
}

export const WALL_ANCHOR_Y = ISO.WALL_H + ISO.TILE_H / 2;

// Wall-plane mapping for one wall tile: (u along the wall 0..1, t up the wall
// 0..1) <-> sprite pixels. Everything drawn through it follows the wall's
// slant, so window parts converge with the wall instead of floating on it.
function wallPlane(kind) {
  const sgn = kind === 'north' ? 1 : -1;
  const W2 = (ISO.TILE_W * ART) / 2;
  const WALLF = ISO.WALL_H * ART;
  return {
    P: (u, t) => [W2 + sgn * W2 * u, WALLF + (ISO.TILE_H * ART / 2) * u - WALLF * t],
    inv: (x, y) => {
      const u = sgn * (x - W2) / W2;
      return [u, (WALLF + (ISO.TILE_H * ART / 2) * u - y) / WALLF];
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
  const sx = sgn * 3.4 * ART, sy = -1.7 * ART;
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
      if ((x * 7 + y * 13) % 53 === 0) c = shade(c, 0.1); // fine glass-pane speckle
      s.px[y][x] = c;
    }
  }
  // projecting slab: top face, front face and the end cap that faces the viewer
  const slab = (ua, ub, ta, tb, pr, color) => {
    const out = [-sgn * (ISO.TILE_W * ART) / 2 * pr, (ISO.TILE_H * ART) / 2 * pr]; // outward = toward the viewer
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
  const half = (ISO.TILE_W * ART) / 2;
  const xl = (kind === 'north' ? 35 : 3) * ART;
  const xr = xl + 26 * ART;
  const doorH = 46 * ART;
  for (let x = xl; x < xr; x++) {
    const base = Math.round(ISO.WALL_H * ART + (kind === 'north' ? (x - half) / 2 : (half - x) / 2)) - ART;
    for (let y = base - doorH; y <= base; y++) {
      const post = x < xl + 4 * ART || x >= xr - 4 * ART || y < base - doorH + 4 * ART;
      let c = post ? (x === xl || y === base - doorH ? frameLight : frame) : '#2b1d2e';
      if (!post && y > base - 5 * ART) c = '#d9a65a'; // warm light spilling under the door
      else if (!post && (x * 3 + y * 7) % 31 === 0) c = shade('#2b1d2e', 0.2); // fine wood-grain panel fleck
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
  const half = (ISO.TILE_W * ART) / 2;
  const xl = (kind === 'north' ? 34 : 4) * ART;
  const xr = xl + 28 * ART;
  const mid = Math.floor((xl + xr) / 2);
  const doorH = 48 * ART;
  for (let x = xl; x < xr; x++) {
    const base = Math.round(ISO.WALL_H * ART + (kind === 'north' ? (x - half) / 2 : (half - x) / 2)) - ART;
    for (let y = base - doorH; y <= base; y++) {
      const isFrame = x < xl + 3 * ART || x >= xr - 3 * ART || y < base - doorH + 4 * ART;
      const isIndicator = y >= base - doorH - 5 * ART && y < base - doorH && x >= mid - 5 * ART && x <= mid + 5 * ART;
      if (isFrame) {
        setPixel(s, x, y, x === xl || y === base - doorH ? brassLight : brass);
      } else {
        let c = x < mid ? steelL : steelR;
        if (x === mid) c = seam;
        else if (y === base - doorH + 6 * ART || y === base - 3 * ART) c = shade(c, -0.15);
        else if ((x * 5 + y * 3) % 23 === 0) c = shade(c, 0.1); // brushed steel grain
        setPixel(s, x, y, c);
      }
      if (isIndicator) setPixel(s, x, y, '#1c1828');
    }
    // glowing floor indicator dots above elevator arch
    const indY = Math.round(ISO.WALL_H * ART + (kind === 'north' ? (x - half) / 2 : (half - x) / 2)) - doorH - 4 * ART;
    if (x >= mid - 4 * ART && x <= mid + 4 * ART) {
      setPixel(s, x, indY - ART, '#221a30');
      setPixel(s, x, indY, Math.floor(x / ART) % 2 === 0 ? '#ffcf56' : '#ff6b4a');
      setPixel(s, x, indY + ART, '#221a30');
    }
  }
  return s;
}

export function buildStairwellDoorSegment(baseColor, kind = 'north') {
  const s = buildWallSegment(baseColor, kind);
  const frame = '#323a48';
  const frameLight = '#627288';
  const half = (ISO.TILE_W * ART) / 2;
  const xl = (kind === 'north' ? 34 : 4) * ART;
  const xr = xl + 28 * ART;
  const mid = Math.floor((xl + xr) / 2);
  const doorH = 48 * ART;
  for (let x = xl; x < xr; x++) {
    const base = Math.round(ISO.WALL_H * ART + (kind === 'north' ? (x - half) / 2 : (half - x) / 2)) - ART;
    for (let y = base - doorH; y <= base; y++) {
      const isFrame = x < xl + 3 * ART || x >= xr - 3 * ART || y < base - doorH + 4 * ART;
      const isWindow = !isFrame && y >= base - doorH + 8 * ART && y <= base - doorH + 22 * ART && x >= mid - 8 * ART && x <= mid + 8 * ART;
      if (isFrame) {
        setPixel(s, x, y, (x === xl || y === base - doorH) ? frameLight : frame);
      } else if (isWindow) {
        setPixel(s, x, y, Math.floor((x + y) / ART) % 2 === 0 ? '#b8ebff' : '#88ccee');
      } else {
        let c = x < mid ? '#485468' : '#384252';
        if ((x * 7 + y * 3) % 29 === 0) c = shade(c, 0.1); // brushed panel grain
        setPixel(s, x, y, c);
      }
    }
    // Illuminated green "ROOF / EXIT" emergency sign above the stairwell door
    const signY = Math.round(ISO.WALL_H * ART + (kind === 'north' ? (x - half) / 2 : (half - x) / 2)) - doorH - 4 * ART;
    if (x >= mid - 8 * ART && x <= mid + 8 * ART) {
      setPixel(s, x, signY - 2 * ART, '#183824');
      setPixel(s, x, signY - ART, (x === mid - 8 * ART || x === mid + 8 * ART) ? '#22c55e' : '#15803d');
      setPixel(s, x, signY, (x >= mid - 3 * ART && x <= mid + 3 * ART) ? '#f0fdf4' : '#22c55e');
      setPixel(s, x, signY + ART, '#183824');
    }
  }
  return s;
}

export function buildGlassBalustradeSegment(kind = 'north') {
  const w = ISO.TILE_W * ART;
  const h = (ISO.WALL_H + ISO.TILE_H / 2) * ART;
  const s = makeGrid(w, h);
  const baseY = (x) => Math.round(ISO.WALL_H * ART + (kind === 'north' ? (x - w / 2) / 2 : (w / 2 - x) / 2));
  const RAIL_H = 18 * ART;
  const startX = kind === 'north' ? w / 2 : 0;
  const endX = kind === 'north' ? w : w / 2;
  const posts = [4, 5, 31, 32, 58, 59];

  for (let x = startX; x < endX; x++) {
    const base = baseY(x);
    // Base mounting shoe (dark metal channel)
    for (let i = 0; i < ART; i++) setPixel(s, x, base - i, '#242b35');
    for (let i = ART; i < 2 * ART; i++) setPixel(s, x, base - i, '#3a4452');
    for (let i = 2 * ART; i < 3 * ART; i++) setPixel(s, x, base - i, '#505d6e');

    // Tempered glass panel with reflections and sky tint
    for (let y = base - RAIL_H + 2 * ART; y <= base - 3 * ART; y++) {
      const isReflect = ((x * 2 + y * 3) % 20 < 2);
      const isPost = posts.some((p) => x >= p * ART && x < p * ART + ART);
      if (isPost) {
        setPixel(s, x, y, (Math.floor(x / ART) % 2 === 0) ? '#d8e4f0' : '#8fa4b8');
      } else if (isReflect) {
        setPixel(s, x, y, '#eaf8ff');
      } else {
        // Translucent glass texture with subtle dither
        let c = Math.floor((x + y) / ART) % 2 === 0 ? '#98d2f0' : '#68b4dc';
        if ((x * 3 + y * 5) % 37 === 0) c = shade(c, 0.3); // fine glint fleck
        setPixel(s, x, y, c);
      }
    }

    // Top handrail (polished steel chrome with upper highlight)
    for (let i = 0; i < ART; i++) setPixel(s, x, base - RAIL_H + i, '#edf4fa');
    for (let i = ART; i < 2 * ART; i++) setPixel(s, x, base - RAIL_H + i, '#b8c8d8');
    for (let i = 2 * ART; i < 3 * ART; i++) setPixel(s, x, base - RAIL_H + i, '#6c7c8c');
  }
  return s;
}

export function buildElevatorTile(baseColor) {
  const s = buildFloorTile(baseColor, 1);
  const w = ISO.TILE_W * ART, h = ISO.TILE_H * ART;
  fillDiamond(s, w / 2, h / 2, w / 2 - 7 * ART, h / 2 - 4 * ART, '#3a4252');
  fillDiamond(s, w / 2, h / 2, w / 2 - 11 * ART, h / 2 - 6 * ART, '#d8a848');
  fillDiamond(s, w / 2, h / 2, w / 2 - 15 * ART, h / 2 - 8 * ART, '#546074');
  fillDiamond(s, w / 2, h / 2, w / 2 - 17 * ART, h / 2 - 9 * ART, shade('#546074', -0.15)); // inner bevel
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

// ---------- Reusable Texture & Material Helpers (2x Detail Pass) ----------

export function planks(box, u0, v0, u1, v1, z0, z1, opts = {}) {
  const dir = opts.dir || ((u1 - u0 >= v1 - v0) ? 'v' : 'u');
  const count = opts.count || 3;
  const gap = opts.gap !== undefined ? opts.gap : 0.025;
  const wood = opts.wood || WOOD;
  const top = Array.isArray(wood) ? wood[0] : wood;
  const left = Array.isArray(wood) ? wood[1] : shade(top, -0.15);
  const right = Array.isArray(wood) ? wood[2] : shade(top, -0.28);
  const boltColor = opts.boltColor || ['#d8dbe2', '#9ea4b0', '#6b7280'];

  if (dir === 'u') {
    const span = u1 - u0;
    const plankW = (span - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const pu0 = u0 + i * (plankW + gap);
      const pu1 = pu0 + plankW;
      const t = i % 2 === 0 ? top : shade(top, -0.06);
      const l = i % 2 === 0 ? left : shade(left, -0.06);
      const r = i % 2 === 0 ? right : shade(right, -0.06);
      box(pu0, v0, pu1, v1, z0, z1, t, l, r);
      if (opts.grainDetail) {
        grain(box, pu0, v0, pu1, v1, z1, { dir: 'v', wood: t });
      }
      if (opts.bolts) {
        const bz = z1;
        const bRad = Math.min(plankW * 0.25, 0.03);
        const bx = (pu0 + pu1) / 2;
        box(bx - bRad, v0 + 0.04, bx + bRad, v0 + 0.04 + bRad * 2, bz, bz + 0.8, ...boltColor);
        box(bx - bRad, v1 - 0.04 - bRad * 2, bx + bRad, v1 - 0.04, bz, bz + 0.8, ...boltColor);
      }
    }
  } else {
    const span = v1 - v0;
    const plankH = (span - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const pv0 = v0 + i * (plankH + gap);
      const pv1 = pv0 + plankH;
      const t = i % 2 === 0 ? top : shade(top, -0.06);
      const l = i % 2 === 0 ? left : shade(left, -0.06);
      const r = i % 2 === 0 ? right : shade(right, -0.06);
      box(u0, pv0, u1, pv1, z0, z1, t, l, r);
      if (opts.grainDetail) {
        grain(box, u0, pv0, u1, pv1, z1, { dir: 'u', wood: t });
      }
      if (opts.bolts) {
        const bz = z1;
        const bRad = Math.min(plankH * 0.25, 0.03);
        const by = (pv0 + pv1) / 2;
        box(u0 + 0.04, by - bRad, u0 + 0.04 + bRad * 2, by + bRad, bz, bz + 0.8, ...boltColor);
        box(u1 - 0.04 - bRad * 2, by - bRad, u1 - 0.04, by + bRad, bz, bz + 0.8, ...boltColor);
      }
    }
  }
}

export function grain(box, u0, v0, u1, v1, z, opts = {}) {
  const dir = opts.dir || ((u1 - u0 >= v1 - v0) ? 'u' : 'v');
  const base = opts.wood || '#c98f55';
  const light = shade(base, 0.16);
  const dark = shade(base, -0.16);
  const z0 = z;
  const z1 = z + 0.2;

  if (dir === 'u') {
    const spanV = v1 - v0;
    for (const f of [0.22, 0.48, 0.76]) {
      const gv0 = v0 + spanV * f;
      const gv1 = gv0 + Math.max(0.015, spanV * 0.05);
      const col = f === 0.48 ? dark : light;
      box(u0 + 0.02, gv0, u1 - 0.02, gv1, z0, z1, col, col, shade(col, -0.1));
    }
  } else {
    const spanU = u1 - u0;
    for (const f of [0.22, 0.48, 0.76]) {
      const gu0 = u0 + spanU * f;
      const gu1 = gu0 + Math.max(0.015, spanU * 0.05);
      const col = f === 0.48 ? dark : light;
      box(gu0, v0 + 0.02, gu1, v1 - 0.02, z0, z1, col, col, shade(col, -0.1));
    }
  }
}

export function leafCluster(box, cx, cy, cz, rx, ry, rz, opts = {}) {
  const SHADOW = opts.shadow || '#1a4e22';
  const DARK = opts.dark || '#267332';
  const MID = opts.mid || '#3aa84f';
  const LIGHT = opts.light || '#5cd470';
  const BRIGHT = opts.bright || '#88f09c';

  // Base core shadow mass
  box(cx - rx * 0.85, cy - ry * 0.85, cx + rx * 0.85, cy + ry * 0.85, cz - rz * 0.6, cz + rz * 0.6, MID, DARK, SHADOW);

  // Sub-clumps with varied offsets creating bumpy, leafy silhouette
  const clumps = [
    [-0.35, -0.35, 0.25, 0.6, [BRIGHT, LIGHT, MID]],
    [-0.2, 0.2, 0.1, 0.55, [LIGHT, MID, DARK]],
    [0.2, -0.25, 0.15, 0.55, [LIGHT, MID, DARK]],
    [0.3, 0.3, -0.1, 0.6, [MID, DARK, SHADOW]],
    [0, 0, 0.45, 0.5, [BRIGHT, LIGHT, MID]],
    [-0.45, 0.05, -0.15, 0.45, [MID, DARK, SHADOW]],
    [0.1, 0.45, -0.15, 0.45, [DARK, SHADOW, SHADOW]],
  ];

  for (const [dx, dy, dz, sMul, cols] of clumps) {
    const kx = cx + dx * rx;
    const ky = cy + dy * ry;
    const kz = cz + dz * rz;
    const krx = rx * sMul;
    const kry = ry * sMul;
    const krz = rz * sMul;
    box(kx - krx, ky - kry, kx + krx, ky + kry, Math.max(0, kz - krz), kz + krz, cols[0], cols[1], cols[2]);
  }

  // Small individual leaf tip jaggies protruding
  const leafTips = [
    [cx - rx * 0.95, cy - ry * 0.1, cz + rz * 0.1, LIGHT],
    [cx - ry * 0.1, cy - ry * 0.95, cz + rz * 0.2, BRIGHT],
    [cx + rx * 0.85, cy + ry * 0.2, cz - rz * 0.2, DARK],
    [cx + rx * 0.2, cy + ry * 0.85, cz - rz * 0.1, DARK],
  ];
  for (const [lx, ly, lz, col] of leafTips) {
    box(lx - 0.04, ly - 0.04, lx + 0.04, ly + 0.04, lz, lz + 2, col, shade(col, -0.15), shade(col, -0.3));
  }

  // Optional flower clusters (e.g. blue hydrangea or orange marigold or pink sakura)
  if (opts.flowers) {
    const flw = Array.isArray(opts.flowers) ? opts.flowers : [opts.flowers];
    for (const f of flw) {
      const fCol = f.color || '#ff8fb0';
      const fMid = shade(fCol, -0.15);
      const fDark = shade(fCol, -0.3);
      const fx = cx + (f.x || 0) * rx;
      const fy = cy + (f.y || 0) * ry;
      const fz = cz + (f.z || 0.3) * rz;
      box(fx - 0.04, fy - 0.04, fx + 0.04, fy + 0.04, fz, fz + 2.5, fCol, fMid, fDark);
      box(fx - 0.07, fy - 0.02, fx - 0.03, fy + 0.02, fz - 0.5, fz + 1.5, fCol, fMid, fDark);
      box(fx + 0.03, fy - 0.02, fx + 0.07, fy + 0.02, fz - 0.5, fz + 1.5, fCol, fMid, fDark);
      box(fx - 0.02, fy + 0.03, fx + 0.02, fy + 0.07, fz - 0.5, fz + 1.5, fCol, fMid, fDark);
      box(fx - 0.02, fy - 0.02, fx + 0.02, fy + 0.02, fz + 1.5, fz + 2.8, '#fff490', '#ffd240', '#c89e20');
    }
  }
}

export function stoneBlocks(box, u0, v0, u1, v1, z0, z1, opts = {}) {
  const courses = opts.courses || 3;
  const stone = opts.stone || ['#b8b2a6', '#969084', '#6e685e'];
  const topS = stone[0];
  const leftS = stone[1];
  const rightS = stone[2];
  const mortar = opts.mortar || ['#58544e', '#44403a', '#32302c'];
  const coping = opts.coping !== false;
  const copingH = opts.copingH || 3;

  const wallZ1 = coping ? z1 - copingH : z1;
  const courseH = (wallZ1 - z0) / courses;

  box(u0, v0, u1, v1, z0, wallZ1, ...mortar);

  const colsU = opts.colsU || 3;
  const colsV = opts.colsV || 3;
  const mortarThick = 0.015;

  for (let c = 0; c < courses; c++) {
    const cz0 = z0 + c * courseH + 0.5;
    const cz1 = z0 + (c + 1) * courseH - 0.5;
    const stagger = (c % 2) * 0.5;

    const blockW = (u1 - u0) / colsU;
    for (let i = 0; i < colsU; i++) {
      const bu0 = Math.max(u0 + 0.01, u0 + (i + stagger * 0.5) * blockW + mortarThick);
      const bu1 = Math.min(u1 - 0.01, bu0 + blockW - mortarThick * 2);
      if (bu1 > bu0) {
        const varAmt = ((i * 7 + c * 13) % 5 - 2) * 0.04;
        box(bu0, v1 - 0.04, bu1, v1, cz0, cz1, shade(topS, varAmt), shade(leftS, varAmt), shade(rightS, varAmt));
      }
    }

    const blockD = (v1 - v0) / colsV;
    for (let j = 0; j < colsV; j++) {
      const bv0 = Math.max(v0 + 0.01, v0 + (j + stagger * 0.5) * blockD + mortarThick);
      const bv1 = Math.min(v1 - 0.01, bv0 + blockD - mortarThick * 2);
      if (bv1 > bv0) {
        const varAmt = ((j * 11 + c * 17) % 5 - 2) * 0.04;
        box(u1 - 0.04, bv0, u1, bv1, cz0, cz1, shade(topS, varAmt), shade(leftS, varAmt), shade(rightS, varAmt));
      }
    }
  }

  if (coping) {
    const copOver = opts.copingOver || 0.03;
    const copStone = [shade(topS, 0.12), shade(leftS, 0.08), shade(rightS, 0.05)];
    box(u0 - copOver, v0 - copOver, u1 + copOver, v1 + copOver, wallZ1, z1, ...copStone);
    box(u0 - copOver, v1 + copOver - 0.02, u1 + copOver, v1 + copOver, z1 - 0.5, z1, shade(topS, 0.22), shade(leftS, 0.15), shade(rightS, 0.1));
  }
}

export function stitching(box, u0, v0, u1, v1, z, opts = {}) {
  const pipingCol = opts.piping || ['#f2c0cc', '#d88fa0', '#a85c70'];
  const tufts = opts.tufts;

  if (opts.piping !== false) {
    const pw = opts.pipingWidth || 0.025;
    const pz = z;
    const ph = opts.pipingHeight || 1.2;
    box(u0, v1 - pw, u1, v1, pz, pz + ph, ...pipingCol);
    box(u1 - pw, v0, u1, v1, pz, pz + ph, ...pipingCol);
    if (opts.allSides) {
      box(u0, v0, u1, v0 + pw, pz, pz + ph, ...pipingCol);
      box(u0, v0, u0 + pw, v1, pz, pz + ph, ...pipingCol);
    }
  }

  if (tufts && tufts.length > 0) {
    for (const [tu, tv] of tufts) {
      const tx = u0 + (u1 - u0) * tu;
      const ty = v0 + (v1 - v0) * tv;
      const bDark = opts.tuftDark || '#4a1420';
      const bLight = opts.tuftLight || '#ffb8c8';
      box(tx - 0.025, ty - 0.025, tx + 0.025, ty + 0.025, z - 1.5, z + 0.5, bDark, bDark, bDark);
      box(tx - 0.015, ty - 0.015, tx + 0.015, ty + 0.015, z + 0.2, z + 1.0, bLight, shade(bLight, -0.15), shade(bLight, -0.3));
      box(tx - 0.08, ty - 0.015, tx - 0.03, ty + 0.015, z - 0.6, z, bDark, bDark, bDark);
      box(tx + 0.03, ty - 0.015, tx + 0.08, ty + 0.015, z - 0.6, z, bDark, bDark, bDark);
      box(tx - 0.015, ty - 0.08, tx + 0.015, ty - 0.03, z - 0.6, z, bDark, bDark, bDark);
      box(tx - 0.015, ty + 0.03, tx + 0.015, ty + 0.08, z - 0.6, z, bDark, bDark, bDark);
    }
  }
}

const WOOD = ['#c98f55', '#a8703d', '#8a5a30']; // top, left, right

export const SEAT_CONFIGS = {
  armchair: {
    seatHeight: 12,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  sofa: {
    seatHeight: 13,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  rooftop_sofa: {
    seatHeight: 13,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  stool: {
    seatHeight: 14,
    layerOrder: {
      0: ['base', 'avatar'],
      1: ['base', 'avatar'],
      2: ['base', 'avatar'],
      3: ['base', 'avatar'],
    },
  },
  dining_chair: {
    seatHeight: 14,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  dining_booth: {
    seatHeight: 16,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  deckchair: {
    seatHeight: 10,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  pool_lounger: {
    seatHeight: 12,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  salon_chair: {
    seatHeight: 18,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  garden_bench: {
    seatHeight: 14,
    layerOrder: {
      0: ['back', 'avatar', 'front'],
      1: ['back', 'avatar', 'front'],
      2: ['base', 'avatar', 'back'],
      3: ['base', 'avatar', 'back'],
    },
  },
  suite_bed: {
    seatHeight: 14,
    layerOrder: {
      0: ['base', 'avatar'],
      1: ['base', 'avatar'],
      2: ['base', 'avatar'],
      3: ['base', 'avatar'],
    },
  },
  massage_bed: {
    seatHeight: 14,
    layerOrder: {
      0: ['base', 'avatar'],
      1: ['base', 'avatar'],
      2: ['base', 'avatar'],
      3: ['base', 'avatar'],
    },
  },
  weight_bench: {
    seatHeight: 12,
    layerOrder: {
      0: ['base', 'avatar'],
      1: ['base', 'avatar'],
      2: ['base', 'avatar'],
      3: ['base', 'avatar'],
    },
  },
  exercise_bike: {
    seatHeight: 18,
    layerOrder: {
      0: ['base', 'avatar'],
      1: ['base', 'avatar'],
      2: ['base', 'avatar'],
      3: ['base', 'avatar'],
    },
  },
  rowing_machine: {
    seatHeight: 8,
    layerOrder: {
      0: ['base', 'avatar'],
      1: ['base', 'avatar'],
      2: ['base', 'avatar'],
      3: ['base', 'avatar'],
    },
  },
  grand_piano: {
    seatHeight: 14,
    layerOrder: {
      0: ['base', 'avatar'],
      1: ['base', 'avatar'],
      2: ['base', 'avatar'],
      3: ['base', 'avatar'],
    },
  },
};

export function getSeatConfig(itemId, rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const cfg = SEAT_CONFIGS[itemId] || {
    seatHeight: 12,
    layerOrder: { 0: ['base', 'avatar'], 1: ['base', 'avatar'], 2: ['base', 'avatar'], 3: ['base', 'avatar'] },
  };
  const order = cfg.layerOrder[r] || ['base', 'avatar'];
  return {
    seatHeight: cfg.seatHeight,
    yOffset: -cfg.seatHeight,
    layerOrder: order,
  };
}

// Stool: compact turned wooden stool
export function buildStoolSprite() {
  return isoSprite(1, 1, 26, (box) => {
    // 4 sturdy wooden legs touching floor (z = 0 .. 10)
    box(0.20, 0.20, 0.34, 0.34, 0, 10, ...WOOD);
    box(0.66, 0.20, 0.80, 0.34, 0, 10, ...WOOD);
    box(0.20, 0.66, 0.34, 0.80, 0, 10, ...WOOD);
    box(0.66, 0.66, 0.80, 0.80, 0, 10, ...WOOD);
    // Brass leg toe caps
    box(0.19, 0.19, 0.35, 0.35, 0, 1.4, '#d8a848', '#b8863a', '#8c6224');
    box(0.65, 0.19, 0.81, 0.35, 0, 1.4, '#d8a848', '#b8863a', '#8c6224');
    box(0.19, 0.65, 0.35, 0.81, 0, 1.4, '#d8a848', '#b8863a', '#8c6224');
    box(0.65, 0.65, 0.81, 0.81, 0, 1.4, '#d8a848', '#b8863a', '#8c6224');
    // Footrest cross-stretchers (z = 4 .. 6)
    box(0.22, 0.22, 0.78, 0.30, 4, 6, ...WOOD);
    box(0.22, 0.70, 0.78, 0.78, 4, 6, ...WOOD);
    box(0.22, 0.22, 0.30, 0.78, 4, 6, ...WOOD);
    box(0.70, 0.22, 0.78, 0.78, 4, 6, ...WOOD);
    // Wooden seat base slab (z = 10 .. 12)
    box(0.16, 0.16, 0.84, 0.84, 10, 12, ...WOOD);
    // Brass nailhead trim ring around the cushion base
    for (const [a, b] of [[0.14, 0.18], [0.5, 0.18], [0.82, 0.18], [0.14, 0.82], [0.5, 0.82], [0.82, 0.82], [0.14, 0.5], [0.82, 0.5]]) {
      box(a, b, a + 0.03, b + 0.03, 12, 12.6, '#f6c667', '#d8a442', '#a07424');
    }
    // Tufted leather seat cushion (z = 12 .. 14)
    box(0.12, 0.12, 0.88, 0.88, 12, 14, '#e0b25e', '#caa05a', '#9e7a38');
    // Button tuft
    box(0.44, 0.44, 0.56, 0.56, 14, 15, '#f4d084', '#e0b25e', '#b88d3e');
  });
}

// Sofa: 4-way volumetric orientation, coherent contact plane, plush cushions with piping
export function buildSofaSprite(color = '#e2607a', rot = 0, layer = 'all') {
  const r = ((rot % 4) + 4) % 4;
  const [tw, th] = r % 2 ? [1, 2] : [2, 1];
  const col = [shade(color, 0.14), color, shade(color, -0.22)];
  const lt = [shade(color, 0.28), shade(color, 0.12), shade(color, -0.10)];
  const dk = [shade(color, -0.10), shade(color, -0.22), shade(color, -0.35)];
  const PIPING = [shade(color, 0.38), shade(color, 0.22), shade(color, 0.05)];
  const BUN_FOOT = ['#7c4820', '#623414', '#48240c'];
  const BRASS = ['#f4c862', '#d4a034', '#986c1c'];

  return isoSprite(tw, th, 38, (box) => {
    const drawBack = layer === 'all' || layer === 'back';
    const drawFront = layer === 'all' || layer === 'front';

    if (drawBack) {
      // 4 turned wooden bun feet with brass accent collars (z = 0 .. 4)
      const feet = [
        [0.08, 0.08, 0.20, 0.20],
        [tw - 0.20, 0.08, tw - 0.08, 0.20],
        [0.08, th - 0.20, 0.20, th - 0.08],
        [tw - 0.20, th - 0.20, tw - 0.08, th - 0.08]
      ];
      for (const [u0, v0, u1, v1] of feet) {
        box(u0, v0, u1, v1, 0, 3, ...BUN_FOOT);
        box(u0 - 0.01, v0 - 0.01, u1 + 0.01, v1 + 0.01, 3, 4, ...BRASS);
      }
    }

    if (r === 0) {
      // 2x1 facing down (+v): backrest on north edge, arms on west/east
      if (drawBack) {
        box(0.04, 0.04, 1.96, 0.96, 4, 9, ...dk); // lower plinth frame
        // Button-tufted high backrest with vertical channel fluting
        box(0.04, 0.06, 1.96, 0.34, 9, 36, ...col);
        // Crown roll with piping
        box(0.04, 0.04, 1.96, 0.12, 34, 37, ...PIPING);

        // Two plush seat cushions with welted piping seams and button tufting
        box(0.28, 0.34, 0.98, 0.94, 9, 14, ...lt);
        stitching(box, 0.28, 0.34, 0.98, 0.94, 13.5, { piping: PIPING, tufts: [[0.5, 0.55]], tuftDark: dk[2], tuftLight: lt[0] });

        box(1.02, 0.34, 1.72, 0.94, 9, 14, ...lt);
        stitching(box, 1.02, 0.34, 1.72, 0.94, 13.5, { piping: PIPING, tufts: [[0.5, 0.55]], tuftDark: dk[2], tuftLight: lt[0] });

        // Backrest button tufting rows
        stitching(box, 0.28, 0.26, 1.72, 0.34, 25, { piping: false, tufts: [[0.25, 0.5], [0.75, 0.5]], tuftDark: dk[2], tuftLight: lt[0] });
      }
      if (drawFront) {
        // Padded roll armrests on left and right
        box(0.04, 0.34, 0.26, 0.96, 9, 23, ...col);
        box(1.74, 0.34, 1.96, 0.96, 9, 23, ...col);
        stitching(box, 0.04, 0.34, 0.26, 0.96, 22.5, { piping: PIPING, pipingHeight: 0.8 });
        stitching(box, 1.74, 0.34, 1.96, 0.96, 22.5, { piping: PIPING, pipingHeight: 0.8 });
      }
    } else if (r === 1) {
      // 1x2 facing right (+u): backrest on west edge
      if (drawBack) {
        box(0.04, 0.04, 0.96, 1.96, 4, 9, ...dk);
        box(0.06, 0.04, 0.34, 1.96, 9, 36, ...col);
        box(0.04, 0.04, 0.12, 1.96, 34, 37, ...PIPING);
        box(0.34, 0.04, 0.96, 0.26, 9, 23, ...col);
        stitching(box, 0.34, 0.04, 0.96, 0.26, 22.5, { piping: PIPING, pipingHeight: 0.8 });

        box(0.34, 0.28, 0.94, 0.98, 9, 14, ...lt);
        stitching(box, 0.34, 0.28, 0.94, 0.98, 13.5, { piping: PIPING, tufts: [[0.55, 0.5]], tuftDark: dk[2], tuftLight: lt[0] });

        box(0.34, 1.02, 0.94, 1.72, 9, 14, ...lt);
        stitching(box, 0.34, 1.02, 0.94, 1.72, 13.5, { piping: PIPING, tufts: [[0.55, 0.5]], tuftDark: dk[2], tuftLight: lt[0] });
      }
      if (drawFront) {
        box(0.34, 1.74, 0.96, 1.96, 9, 23, ...col);
        stitching(box, 0.34, 1.74, 0.96, 1.96, 22.5, { piping: PIPING, pipingHeight: 0.8 });
      }
    } else if (r === 2) {
      // 2x1 facing up (-v): backrest on south edge
      if (drawBack) {
        box(0.04, 0.04, 1.96, 0.96, 4, 9, ...dk);
        box(0.28, 0.06, 0.98, 0.66, 9, 14, ...lt);
        stitching(box, 0.28, 0.06, 0.98, 0.66, 13.5, { piping: PIPING, tufts: [[0.5, 0.45]], tuftDark: dk[2], tuftLight: lt[0] });

        box(1.02, 0.06, 1.72, 0.66, 9, 14, ...lt);
        stitching(box, 1.02, 0.06, 1.72, 0.66, 13.5, { piping: PIPING, tufts: [[0.5, 0.45]], tuftDark: dk[2], tuftLight: lt[0] });

        box(0.04, 0.04, 0.26, 0.66, 9, 23, ...col);
        box(1.74, 0.04, 1.96, 0.66, 9, 23, ...col);
      }
      if (drawFront) {
        box(0.04, 0.66, 1.96, 0.94, 9, 36, ...col);
        box(0.04, 0.88, 1.96, 0.96, 34, 37, ...PIPING);
      }
    } else {
      // 1x2 facing left (-u): backrest on east edge
      if (drawBack) {
        box(0.04, 0.04, 0.96, 1.96, 4, 9, ...dk);
        box(0.06, 0.28, 0.66, 0.98, 9, 14, ...lt);
        stitching(box, 0.06, 0.28, 0.66, 0.98, 13.5, { piping: PIPING, tufts: [[0.45, 0.5]], tuftDark: dk[2], tuftLight: lt[0] });

        box(0.06, 1.02, 0.66, 1.72, 9, 14, ...lt);
        stitching(box, 0.06, 1.02, 0.66, 1.72, 13.5, { piping: PIPING, tufts: [[0.45, 0.5]], tuftDark: dk[2], tuftLight: lt[0] });

        box(0.04, 0.04, 0.66, 0.26, 9, 23, ...col);
      }
      if (drawFront) {
        box(0.66, 0.04, 0.94, 1.96, 9, 36, ...col);
        box(0.88, 0.04, 0.96, 1.96, 34, 37, ...PIPING);
        box(0.04, 1.74, 0.66, 1.96, 9, 23, ...col);
      }
    }
  });
}

export function buildLampSprite() {
  const CHROME = ['#9e9eac', '#7c7c8a', '#5c5c68'];
  const CHROME_HI = ['#ffffff', '#e8e8f2', '#c0c0d0'];
  const LIQUID = ['#ff8834', '#e05818', '#b0300c'];
  const WAX1 = ['#ffea70', '#ffc040', '#d08020'];
  const WAX2 = ['#fff298', '#ffd450', '#e49424'];

  return isoSprite(1, 1, 46, (box) => {
    // Brushed chrome tiered pedestal base (z = 0 .. 8)
    box(0.24, 0.24, 0.76, 0.76, 0, 4, ...CHROME);
    box(0.30, 0.30, 0.70, 0.70, 4, 8, ...CHROME);
    // Fine rib detailing on the base tier
    box(0.24, 0.24, 0.76, 0.76, 1.6, 2.0, '#6c6c78', '#585864', '#444450');

    // Glowing liquid cylinder chamber (z = 8 .. 32)
    box(0.34, 0.34, 0.66, 0.66, 8, 32, ...LIQUID);
    // 2x specular vertical highlight streaks along cylindrical glass
    box(0.35, 0.35, 0.39, 0.39, 9, 31, '#ffffff', '#fff4dc', '#ffc888');

    // Internal floating thermal lava blobs
    box(0.38, 0.38, 0.62, 0.62, 11, 17, ...WAX1);
    box(0.40, 0.40, 0.60, 0.60, 23, 29, ...WAX2);
    // Rising tiny bubble with glow center
    box(0.46, 0.46, 0.54, 0.54, 19, 21.5, '#ffffff', '#ffe49a', '#e2b858');

    // Brushed chrome top cone & finial cap (z = 32 .. 44)
    box(0.30, 0.30, 0.70, 0.70, 32, 37, ...CHROME);
    box(0.32, 0.32, 0.36, 0.36, 33, 36, ...CHROME_HI); // chrome highlight streak
    box(0.38, 0.38, 0.62, 0.62, 37, 40, ...CHROME);
    box(0.44, 0.44, 0.56, 0.56, 40, 44, ...CHROME_HI);
  });
}

export function buildPlantSprite() {
  const POT = ['#d47c44', '#b86230', '#8c421e'];
  const POT_RIM = ['#e68c52', '#c66e38', '#9c4c22'];
  const SOIL = ['#3a2418', '#2a1810', '#1c100a'];

  return isoSprite(1, 1, 42, (box) => {
    // Terracotta pot base with stepped taper (z = 0 .. 10)
    box(0.30, 0.30, 0.70, 0.70, 0, 3, shade(POT[0], -0.1), shade(POT[1], -0.1), shade(POT[2], -0.1));
    box(0.26, 0.26, 0.74, 0.74, 3, 10, ...POT);
    // Decorative incised groove on pot body
    box(0.25, 0.25, 0.75, 0.75, 6, 7, shade(POT[0], 0.18), shade(POT[1], 0.1), shade(POT[2], 0.1));
    // Flared upper coping rim (z = 10 .. 14)
    box(0.22, 0.22, 0.78, 0.78, 10, 14, ...POT_RIM);
    // Dark nutrient potting soil (z = 13 .. 14.5)
    box(0.25, 0.25, 0.75, 0.75, 13, 14.5, ...SOIL);

    // Main arching frond stems
    box(0.46, 0.46, 0.54, 0.54, 14, 26, '#3a8c44', '#286b32', '#1c4a22');

    // Volumetric foliage canopy using clustered leafy clumps with flower accents
    leafCluster(box, 0.5, 0.5, 27, 0.38, 0.38, 11, {
      flowers: [
        { x: -0.2, y: -0.2, z: 0.5, color: '#ff8fb0' },
        { x: 0.25, y: 0.1, z: 0.4, color: '#ffa8c4' }
      ]
    });

    // Spilling leafy fronds cascading slightly over pot rim
    box(0.18, 0.42, 0.26, 0.58, 11, 16, '#4ec464', '#369c4a', '#226c30');
    box(0.42, 0.72, 0.58, 0.82, 10, 15, '#369c4a', '#267332', '#1a4e22');
  });
}

// Thin rugs are physically thin cuboid surfaces, not tall blocks
export function buildRugSprite() {
  const RUG_BERRY = ['#c7496b', '#a83854', '#7a243a'];
  const RUG_ROSE = ['#e2748f', '#c05872', '#8c384e'];
  const RUG_GOLD = ['#f6c667', '#d8a442', '#a07424'];
  const RUG_CREAM = ['#fff2a8', '#f6c667', '#c8922c'];

  return isoSprite(2, 2, 4, (box) => {
    // Far fringe yarn tassels (back edge)
    for (let i = 0; i < 10; i++) {
      const t = 0.08 + i * 0.185;
      box(t, -0.04, t + 0.06, 0.04, 0, 1, ...RUG_CREAM);
    }
    // Outer border thin cuboid (z = 0 .. 2)
    box(0.06, 0.06, 1.94, 1.94, 0, 2, ...RUG_BERRY);
    // Gold braided piping ring
    box(0.12, 0.12, 1.88, 1.88, 1, 2.2, ...RUG_GOLD);
    // Rose field (z = 0 .. 2)
    box(0.24, 0.24, 1.76, 1.76, 0, 2, ...RUG_ROSE);
    // Fine woven lattice ring between the field and the inner panel
    box(0.5, 0.5, 1.5, 1.5, 0, 2, ...RUG_GOLD);
    // Inner ruby panel (z = 0 .. 2)
    box(0.54, 0.54, 1.46, 1.46, 0, 2, ...RUG_BERRY);
    // Gold starburst medallion (z = 0 .. 2)
    box(0.76, 0.76, 1.24, 1.24, 0, 2.4, ...RUG_GOLD);
    // Center jewel (z = 0 .. 2)
    box(0.90, 0.90, 1.10, 1.10, 1, 2.6, ...RUG_CREAM);
    // Near fringe yarn tassels (front edge, drawn on top of border)
    for (let i = 0; i < 10; i++) {
      const t = 0.08 + i * 0.185;
      box(t, 1.96, t + 0.06, 2.04, 0, 1, ...RUG_CREAM);
    }
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
    // Sign chassis backing box & transformer unit (z = 24 .. 52)
    box(0.14, 0.40, 0.86, 0.60, 24, 52, ...CHASSIS);
    box(0.40, 0.36, 0.60, 0.42, 26, 34, '#181824', '#101018', '#08080e'); // transformer box
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
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];
  const CHROME_HI = ['#ffffff', '#e8f0f8', '#b8c6d4'];
  const MAHOGANY = ['#7c2836', '#601e2a', '#44121c'];
  const MAHOGANY_DARK = ['#541822', '#3e1018', '#2a0a10'];
  const ACOUSTIC_CLOTH = ['#ffcc66', '#d49a38', '#94661c'];
  const NEON_MAGENTA = ['#ff40b0', '#d82088', '#980c58'];
  const NEON_GOLD = ['#ffea60', '#ffcc28', '#b88a10'];
  const NEON_CYAN = ['#50f0ff', '#20c8e8', '#1088a8'];
  const BUBBLE_TUBE = ['#80ffb8', '#40d880', '#209850'];
  const VINYL = ['#1a1c22', '#121418', '#080a0c'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Chrome kickplate base (z = 0 .. 5)
    box(0.12, 0.12, 0.88, 0.88, 0, 5, ...CHROME);
    box(0.14, 0.86, 0.86, 0.88, 1, 4, ...CHROME_HI); // chrome specular streak

    // 2. Solid mahogany lower cabinet body (z = 5 .. 22)
    box(0.14, 0.14, 0.86, 0.86, 5, 22, ...MAHOGANY);

    // Left and right vertical bubble tube pilasters (z = 6 .. 44)
    // Left pilaster
    box(0.10, 0.70, 0.20, 0.86, 5, 42, ...CHROME);
    box(0.12, 0.72, 0.18, 0.84, 8, 39, ...BUBBLE_TUBE); // glowing bubbling liquid
    box(0.13, 0.73, 0.17, 0.83, 14, 17, '#ffffff', '#c8ffe0', '#70e0a0'); // bubble
    box(0.13, 0.73, 0.17, 0.83, 27, 30, '#ffffff', '#c8ffe0', '#70e0a0'); // bubble
    // Right pilaster (flanking front right corner)
    box(0.80, 0.70, 0.90, 0.86, 5, 42, ...CHROME);
    box(0.82, 0.72, 0.88, 0.84, 8, 39, ...BUBBLE_TUBE);
    box(0.83, 0.73, 0.87, 0.83, 20, 23, '#ffffff', '#c8ffe0', '#70e0a0');

    // Lower speaker grille: backlit acoustic amber cloth
    box(0.22, 0.80, 0.78, 0.86, 6, 20, ...ACOUSTIC_CLOTH);
    // Polished horizontal chrome grille louvers/bars
    for (const bz of [8, 11, 14, 17]) {
      box(0.20, 0.82, 0.80, 0.87, bz, bz + 1.2, ...CHROME_HI);
    }
    // Center decorative chrome V-crest on speaker
    box(0.46, 0.84, 0.54, 0.88, 9, 17, ...CHROME_HI);

    // 3. Middle slanted selector desk & title strip rack (z = 21 .. 28)
    box(0.14, 0.20, 0.86, 0.86, 21, 28, ...MAHOGANY_DARK);
    // White illuminated title strip cards with song names
    box(0.22, 0.74, 0.78, 0.85, 23, 27.5, '#fffded', '#f0e6c4', '#c4b68e');
    box(0.24, 0.75, 0.76, 0.84, 25, 25.8, '#e03040', '#b81c2c', '#800c18'); // red dividing line
    // Selection push buttons on front desk
    box(0.24, 0.85, 0.34, 0.88, 22, 24, ...NEON_CYAN);
    box(0.38, 0.85, 0.48, 0.88, 22, 24, ...NEON_GOLD);
    box(0.52, 0.85, 0.62, 0.88, 22, 24, ...NEON_MAGENTA);
    box(0.66, 0.85, 0.76, 0.88, 22, 24, '#38e070', '#24b852', '#148034');
    // Chrome coin acceptor entry
    box(0.72, 0.80, 0.80, 0.86, 25, 28, ...CHROME_HI);

    // 4. Upper record chamber with turntable and carousel (z = 28 .. 46)
    box(0.16, 0.18, 0.84, 0.82, 28, 44, '#181e2a', '#10141c', '#0a0c12');
    // Turntable plinth & 45 RPM vinyl record
    box(0.28, 0.30, 0.72, 0.68, 29, 32, ...VINYL);
    box(0.44, 0.44, 0.56, 0.54, 32, 33, '#e02838', '#b01826', '#780c16'); // red record label
    box(0.48, 0.48, 0.52, 0.50, 33, 34.5, ...CHROME_HI); // center silver spindle
    // Silver tonearm tracking the groove
    box(0.60, 0.34, 0.68, 0.42, 32, 35, ...CHROME_HI);
    box(0.52, 0.40, 0.64, 0.48, 33, 34, ...CHROME_HI);

    // Record carousel selector rack in background
    box(0.24, 0.22, 0.76, 0.32, 32, 42, '#2c3648', '#1e2634', '#141822');
    for (let rk = 0.28; rk <= 0.72; rk += 0.08) {
      box(rk, 0.21, rk + 0.03, 0.33, 34, 41, ...CHROME);
    }

    // 5. Arched luminous rainbow neon crown framing the top (z = 44 .. 54)
    box(0.14, 0.16, 0.86, 0.84, 44, 48, ...NEON_MAGENTA);
    box(0.18, 0.20, 0.82, 0.80, 48, 51, ...NEON_GOLD);
    box(0.24, 0.26, 0.76, 0.74, 51, 54, ...NEON_CYAN);
    // Outer arched mahogany moulding
    box(0.12, 0.14, 0.88, 0.86, 43, 46, ...MAHOGANY);
    box(0.16, 0.18, 0.84, 0.82, 46, 50, ...MAHOGANY);
  });
}

export function buildArmchairSprite(rot = 0, layer = 'all') {
  const r = ((rot % 4) + 4) % 4;
  const AMBER = ['#e89e44', '#cf8432', '#9c5c1c'];
  const AMBER_LT = ['#f8b65e', '#e89e44', '#b87224'];
  const AMBER_DK = ['#a8601c', '#8a4c14', '#60320c'];
  const PIPING = ['#ffd488', '#f0a84c', '#b87020'];
  const BRASS = ['#f4c862', '#d4a034', '#986c1c'];

  return isoSprite(1, 1, 38, (box) => {
    const drawBack = layer === 'all' || layer === 'back';
    const drawFront = layer === 'all' || layer === 'front';

    if (drawBack) {
      // 4 sturdy turned wooden legs with brass ferrules (z = 0 .. 6)
      const legCoords = [
        [0.16, 0.16, 0.28, 0.28],
        [0.72, 0.16, 0.84, 0.28],
        [0.16, 0.72, 0.28, 0.84],
        [0.72, 0.72, 0.84, 0.84]
      ];
      for (const [u0, v0, u1, v1] of legCoords) {
        box(u0, v0, u1, v1, 0, 5, ...WOOD);
        box(u0 - 0.01, v0 - 0.01, u1 + 0.01, v1 + 0.01, 0, 1.6, ...BRASS);
      }

      // Base apron frame (z = 5 .. 8)
      box(0.12, 0.12, 0.88, 0.88, 5, 8, ...AMBER_DK);
    }

    if (r === 0) {
      // Facing down (+v): backrest on north edge, arms on west/east
      if (drawBack) {
        box(0.10, 0.10, 0.90, 0.34, 8, 36, ...AMBER);
        box(0.10, 0.08, 0.90, 0.14, 34, 37, ...PIPING); // crown roll
        // Button tufting on backrest
        stitching(box, 0.16, 0.28, 0.84, 0.34, 25, { piping: false, tufts: [[0.28, 0.5], [0.72, 0.5]], tuftDark: AMBER_DK[2], tuftLight: AMBER_LT[0] });

        // Plush seat cushion with welted piping
        box(0.28, 0.34, 0.72, 0.88, 8, 14, ...AMBER_LT);
        stitching(box, 0.28, 0.34, 0.72, 0.88, 13.5, { piping: PIPING, tufts: [[0.5, 0.55]], tuftDark: AMBER_DK[2], tuftLight: AMBER_LT[0] });
      }
      if (drawFront) {
        // Roll armrests on left and right
        box(0.08, 0.34, 0.28, 0.90, 8, 23, ...AMBER);
        box(0.72, 0.34, 0.92, 0.90, 8, 23, ...AMBER);
        stitching(box, 0.08, 0.34, 0.28, 0.90, 22.5, { piping: PIPING, pipingHeight: 0.8 });
        stitching(box, 0.72, 0.34, 0.92, 0.90, 22.5, { piping: PIPING, pipingHeight: 0.8 });
      }
    } else if (r === 1) {
      // Facing right (+u): backrest on west edge, arms on north/south
      if (drawBack) {
        box(0.10, 0.10, 0.34, 0.90, 8, 36, ...AMBER);
        box(0.08, 0.10, 0.14, 0.90, 34, 37, ...PIPING);
        box(0.34, 0.08, 0.90, 0.28, 8, 23, ...AMBER);
        stitching(box, 0.34, 0.08, 0.90, 0.28, 22.5, { piping: PIPING, pipingHeight: 0.8 });

        box(0.34, 0.28, 0.88, 0.72, 8, 14, ...AMBER_LT);
        stitching(box, 0.34, 0.28, 0.88, 0.72, 13.5, { piping: PIPING, tufts: [[0.55, 0.5]], tuftDark: AMBER_DK[2], tuftLight: AMBER_LT[0] });
      }
      if (drawFront) {
        box(0.34, 0.72, 0.90, 0.92, 8, 23, ...AMBER);
        stitching(box, 0.34, 0.72, 0.90, 0.92, 22.5, { piping: PIPING, pipingHeight: 0.8 });
      }
    } else if (r === 2) {
      // Facing up (-v): backrest on south edge
      if (drawBack) {
        box(0.28, 0.12, 0.72, 0.66, 8, 14, ...AMBER_LT);
        stitching(box, 0.28, 0.12, 0.72, 0.66, 13.5, { piping: PIPING, tufts: [[0.5, 0.45]], tuftDark: AMBER_DK[2], tuftLight: AMBER_LT[0] });
        box(0.08, 0.10, 0.28, 0.66, 8, 23, ...AMBER);
        box(0.72, 0.10, 0.92, 0.66, 8, 23, ...AMBER);
      }
      if (drawFront) {
        box(0.10, 0.66, 0.90, 0.90, 8, 36, ...AMBER);
        box(0.10, 0.86, 0.90, 0.92, 34, 37, ...PIPING);
      }
    } else {
      // Facing left (-u): backrest on east edge
      if (drawBack) {
        box(0.12, 0.28, 0.66, 0.72, 8, 14, ...AMBER_LT);
        stitching(box, 0.12, 0.28, 0.66, 0.72, 13.5, { piping: PIPING, tufts: [[0.45, 0.5]], tuftDark: AMBER_DK[2], tuftLight: AMBER_LT[0] });
        box(0.10, 0.08, 0.66, 0.28, 8, 23, ...AMBER);
      }
      if (drawFront) {
        box(0.66, 0.10, 0.90, 0.90, 8, 36, ...AMBER);
        box(0.86, 0.10, 0.92, 0.90, 34, 37, ...PIPING);
        box(0.10, 0.72, 0.66, 0.92, 8, 23, ...AMBER);
      }
    }
  });
}

export function buildDeckchairSprite(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const BEECH = ['#dfb882', '#b88a52', '#865e28'];
  const BRASS = ['#f4c862', '#d4a034', '#986c1c'];
  const STRIPE_NAVY = ['#2c4875', '#1e3254', '#14223c'];
  const STRIPE_CREAM = ['#fdf6e6', '#ded4c0', '#b0a690'];
  const STRIPE_RED = ['#e53935', '#c62828', '#8e0000'];

  return isoSprite(1, 1, 36, (box) => {
    if (r === 0 || r === 2) {
      // 1. Beechwood crossed X-frame scissor legs
      // Rear leg struts (bottom rear v=0.16 to top front v=0.82)
      box(0.13, 0.16, 0.21, 0.36, 0, 6, ...BEECH);
      box(0.13, 0.38, 0.21, 0.60, 6, 11, ...BEECH);
      box(0.13, 0.62, 0.21, 0.82, 11, 15, ...BEECH);
      box(0.79, 0.16, 0.87, 0.36, 0, 6, ...BEECH);
      box(0.79, 0.38, 0.87, 0.60, 6, 11, ...BEECH);
      box(0.79, 0.62, 0.87, 0.82, 11, 15, ...BEECH);

      // Front leg struts (bottom front v=0.84 to top rear v=0.18)
      box(0.11, 0.64, 0.19, 0.84, 0, 6, ...BEECH);
      box(0.11, 0.40, 0.19, 0.62, 6, 12, ...BEECH);
      box(0.11, 0.18, 0.19, 0.38, 12, 18, ...BEECH);
      box(0.77, 0.64, 0.85, 0.84, 0, 6, ...BEECH);
      box(0.77, 0.40, 0.85, 0.62, 6, 12, ...BEECH);
      box(0.77, 0.18, 0.85, 0.38, 12, 18, ...BEECH);

      // Brass pivot bolts at the crossing points
      box(0.09, 0.47, 0.23, 0.53, 7, 10, ...BRASS);
      box(0.75, 0.47, 0.89, 0.53, 7, 10, ...BRASS);

      // Cross stretchers connecting left and right sides
      box(0.14, 0.18, 0.86, 0.24, 1, 3, ...BEECH); // bottom rear stretcher
      box(0.14, 0.18, 0.86, 0.24, 28, 31, ...BEECH); // top backrest stretcher
      box(0.14, 0.76, 0.86, 0.82, 10, 13, ...BEECH); // front seat stretcher

      // Striped canvas sling seat in 3 clean alternating nautical stripes
      box(0.22, 0.18, 0.78, 0.40, 18, 30, ...STRIPE_NAVY);
      box(0.22, 0.40, 0.78, 0.64, 13, 18, ...STRIPE_CREAM);
      box(0.22, 0.64, 0.78, 0.84, 9, 13, ...STRIPE_RED);
    } else {
      box(0.16, 0.13, 0.36, 0.21, 0, 6, ...BEECH);
      box(0.38, 0.13, 0.60, 0.21, 6, 11, ...BEECH);
      box(0.62, 0.13, 0.82, 0.21, 11, 15, ...BEECH);
      box(0.16, 0.79, 0.36, 0.87, 0, 6, ...BEECH);
      box(0.38, 0.79, 0.60, 0.87, 6, 11, ...BEECH);
      box(0.62, 0.79, 0.82, 0.87, 11, 15, ...BEECH);

      box(0.64, 0.11, 0.84, 0.19, 0, 6, ...BEECH);
      box(0.40, 0.11, 0.62, 0.19, 6, 12, ...BEECH);
      box(0.18, 0.11, 0.38, 0.19, 12, 18, ...BEECH);
      box(0.64, 0.77, 0.84, 0.85, 0, 6, ...BEECH);
      box(0.40, 0.77, 0.62, 0.85, 6, 12, ...BEECH);
      box(0.18, 0.77, 0.38, 0.85, 12, 18, ...BEECH);

      box(0.47, 0.09, 0.53, 0.23, 7, 10, ...BRASS);
      box(0.47, 0.75, 0.53, 0.89, 7, 10, ...BRASS);

      box(0.18, 0.14, 0.24, 0.86, 1, 3, ...BEECH);
      box(0.18, 0.14, 0.24, 0.86, 28, 31, ...BEECH);
      box(0.76, 0.14, 0.82, 0.86, 10, 13, ...BEECH);

      box(0.18, 0.22, 0.40, 0.78, 18, 30, ...STRIPE_NAVY);
      box(0.40, 0.22, 0.64, 0.78, 13, 18, ...STRIPE_CREAM);
      box(0.64, 0.22, 0.84, 0.78, 9, 13, ...STRIPE_RED);
    }
  });
}

export function buildReceptionDesk(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  const MARBLE = ['#f6eedc', '#dcceb4', '#b8a88c'];
  const BELL = ['#ffe27a', '#e0b23a', '#b88a2a'];
  const PLINTH = ['#6e3e1c', '#542e12', '#3a1e08'];

  return isoSprite(tw, th, 40, (box) => {
    // Plinth base molding with toe-kick (z = 0 .. 4)
    box(0.04, 0.08, tw - 0.04, th - 0.08, 0, 4, ...PLINTH);

    // Front curved wooden counter body with vertical panel slats (z = 4 .. 24)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 4, 24, ...WOOD);
    planks(box, 0.06, 0.10, tw - 0.06, th - 0.10, 4, 24, {
      dir: tw >= th ? 'u' : 'v',
      count: tw >= th ? 7 : 7,
      gap: 0.02,
      wood: WOOD,
      grainDetail: true,
    });

    // Brass accent trim banding along the upper counter rail
    box(0.05, 0.09, tw - 0.05, th - 0.09, 21, 23, ...BELL);

    // Polished marble slab counter top with overhang and bevel edge (z = 24 .. 28)
    box(0.02, 0.05, tw - 0.02, th - 0.05, 24, 28, ...MARBLE);
    box(0.02, 0.05, tw - 0.02, th - 0.05, 27.2, 28, ...BELL); // gold edge rim

    // Brass counter service bell
    box(tw / 2 - 0.10, th / 2 - 0.10, tw / 2 + 0.10, th / 2 + 0.10, 28, 33, ...BELL);
    box(tw / 2 - 0.03, th / 2 - 0.03, tw / 2 + 0.03, th / 2 + 0.03, 33, 35, '#ffffff', '#e8e8e8', '#cccccc'); // bell push button

    // Guest register leather ledger book with white pages
    const bx = rot % 2 ? 0.35 : 0.65;
    const by = rot % 2 ? 0.65 : 0.35;
    box(bx, by, bx + 0.30, by + 0.26, 28, 30, '#542018', '#3e140e', '#280a06');
    box(bx + 0.03, by + 0.03, bx + 0.27, by + 0.23, 29, 31, '#fcfaf2', '#dedad0', '#b8b2a4');

    // Banker's brass desk lamp
    const lx = rot % 2 ? 0.35 : tw - 0.55;
    const ly = rot % 2 ? th - 0.55 : 0.35;
    box(lx, ly, lx + 0.18, ly + 0.18, 28, 34, ...BELL);
    box(lx - 0.04, ly - 0.04, lx + 0.22, ly + 0.22, 34, 38, '#2e8b57', '#1e6840', '#12482c'); // green banker shade
  });
}

export function buildBookshelf(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const FRAME = ['#a86834', '#8a5024', '#663614'];
  const BASE = ['#824e22', '#6c3e18', '#502a10'];
  const CORNICE = ['#ba7840', '#9c5e2a', '#744018'];
  const BACK = ['#72421c', '#5e3414', '#46240c'];
  const bookColors = [
    ['#d2506b', '#aa3850', '#7c2036'],
    ['#4f8fd6', '#3470b4', '#204c84'],
    ['#e8c04a', '#c49e32', '#90721c'],
    ['#5cb06a', '#428e50', '#2a6436'],
    ['#9a6ad0', '#784eb0', '#543082'],
    ['#e27a3c', '#be5e26', '#8e4016'],
    ['#44b8a8', '#2e9686', '#1c6e62'],
  ];

  return isoSprite(tw, th, 74, (box) => {
    // 1. Plinth / bottom base molding (z = 0 .. 4)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 0, 4, ...BASE);

    if (rot % 2 === 0) {
      // 2x1: front face is south-west (v = th - 0.06), side face is south-east (u = tw - 0.04)
      // Solid back panel, behind every book
      box(0.06, 0.08, tw - 0.06, 0.22, 4, 70, ...BACK);

      // 3 shelves with books, drawn before the side panels (which are full
      // height, 4..70) so the panels fully wrap the shelf/book edges instead
      // of the books' own faces painting over them (the painter's-algorithm
      // order bug that left the right side looking sawed off).
      for (let row = 0; row < 3; row++) {
        const shelfZ = 4 + row * 22;
        if (shelfZ > 4) {
          box(0.16, 0.08, tw - 0.16, th - 0.08, shelfZ - 2, shelfZ, ...FRAME);
        }
        const n = 7;
        const span = tw - 0.36;
        for (let i = 0; i < n; i++) {
          const col = bookColors[(i + row * 3) % bookColors.length];
          const t0 = 0.18 + (i / n) * span;
          const t1 = t0 + span / n - 0.02;
          const bH = 13 + ((i * 5 + row * 7) % 6);
          box(t0, 0.20, t1, th - 0.10, shelfZ, shelfZ + bH, ...col);
          if (i % 2 === 0) {
            box(t0 + 0.02, th - 0.11, t1 - 0.02, th - 0.09, shelfZ + 3, shelfZ + bH - 3, '#fbe088', '#e2be52', '#a88626');
          }
        }
      }

      // Left side upright panel
      box(0.04, 0.06, 0.16, th - 0.06, 4, 70, ...FRAME);
      // Right side upright panel (fully encloses the side face from back to front)
      box(tw - 0.16, 0.06, tw - 0.04, th - 0.06, 4, 70, ...FRAME);
      // Decorative recessed side panel moulding on exposed side
      box(tw - 0.14, 0.12, tw - 0.06, th - 0.12, 8, 66, '#824e22', '#6c3e18', '#502a10');
      box(tw - 0.13, 0.14, tw - 0.07, th - 0.14, 10, 64, '#ba7840', '#9c5e2a', '#744018');
    } else {
      // 1x2: front face is south-east (u = tw - 0.06), side face is south-west (v = th - 0.04)
      // Solid back panel, behind every book
      box(0.08, 0.06, 0.22, th - 0.06, 4, 70, ...BACK);

      // 3 shelves with books, drawn before the side panels for the same
      // reason as the 2x1 branch above.
      for (let row = 0; row < 3; row++) {
        const shelfZ = 4 + row * 22;
        if (shelfZ > 4) {
          box(0.08, 0.16, tw - 0.08, th - 0.16, shelfZ - 2, shelfZ, ...FRAME);
        }
        const n = 7;
        const span = th - 0.36;
        for (let i = 0; i < n; i++) {
          const col = bookColors[(i + row * 3) % bookColors.length];
          const t0 = 0.18 + (i / n) * span;
          const t1 = t0 + span / n - 0.02;
          const bH = 13 + ((i * 5 + row * 7) % 6);
          box(0.20, t0, tw - 0.10, t1, shelfZ, shelfZ + bH, ...col);
          if (i % 2 === 0) {
            box(tw - 0.11, t0 + 0.02, tw - 0.09, t1 - 0.02, shelfZ + 3, shelfZ + bH - 3, '#fbe088', '#e2be52', '#a88626');
          }
        }
      }

      // Rear side upright panel
      box(0.06, 0.04, tw - 0.06, 0.16, 4, 70, ...FRAME);
      // Front side upright panel (fully encloses the side face from back to front)
      box(0.06, th - 0.16, tw - 0.06, th - 0.04, 4, 70, ...FRAME);
      // Decorative recessed side panel moulding on exposed side
      box(0.12, th - 0.14, tw - 0.12, th - 0.06, 8, 66, '#824e22', '#6c3e18', '#502a10');
      box(0.14, th - 0.13, tw - 0.14, th - 0.07, 10, 64, '#ba7840', '#9c5e2a', '#744018');
    }

    // Top molded cornice / capping slab (z = 70 .. 74) with subtle overhang
    box(0.02, 0.04, tw - 0.02, th - 0.04, 70, 74, ...CORNICE);
  });
}

export function buildBarCounter(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  const BAR_BASE = ['#1a2436', '#121a28', '#0a101a'];
  const BAR_BODY = ['#283c5e', '#1c2c46', '#121e30'];
  const PANEL = ['#344e78', '#263a5c', '#18263e'];
  const MAHOGANY = ['#7c381c', '#602812', '#441808'];
  const MAHOGANY_HI = ['#9e4a26', '#7c381c', '#5a2410'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];
  const BRASS_HI = ['#ffe890', '#e2b038', '#a47814'];
  const STEEL = ['#d8e0e8', '#b0bcc8', '#808c98'];

  return isoSprite(tw, th, 44, (box) => {
    // 1. Heavy dark plinth base (z = 0 .. 4)
    box(0.04, 0.08, tw - 0.04, th - 0.08, 0, 4, ...BAR_BASE);

    // Continuous polished brass footrail along guest side
    if (tw > th) {
      box(0.06, 0.04, tw - 0.06, 0.08, 3, 5, ...BRASS_HI);
      box(0.20, 0.04, 0.24, 0.10, 2, 4, ...BRASS);
      box(tw / 2 - 0.02, 0.04, tw / 2 + 0.02, 0.10, 2, 4, ...BRASS);
      box(tw - 0.24, 0.04, tw - 0.20, 0.10, 2, 4, ...BRASS);
    } else {
      box(0.04, 0.06, 0.08, th - 0.06, 3, 5, ...BRASS_HI);
      box(0.04, 0.20, 0.10, 0.24, 2, 4, ...BRASS);
      box(0.04, th / 2 - 0.02, 0.10, th / 2 + 0.02, 2, 4, ...BRASS);
      box(0.04, th - 0.24, 0.10, th - 0.20, 2, 4, ...BRASS);
    }

    // 2. Front bar carcass body with panelled wainscoting
    box(0.06, 0.10, tw - 0.06, th - 0.10, 4, 28, ...BAR_BODY);

    // Raised decorative panels along the front
    if (tw > th) {
      for (let p = 0; p < 3; p++) {
        const px0 = 0.12 + p * 0.94;
        const px1 = px0 + 0.82;
        box(px0, 0.09, px1, 0.11, 6, 26, ...PANEL);
        box(px0 + 0.04, 0.08, px1 - 0.04, 0.10, 8, 24, ...BAR_BODY);
      }
    } else {
      for (let p = 0; p < 3; p++) {
        const py0 = 0.12 + p * 0.94;
        const py1 = py0 + 0.82;
        box(0.09, py0, 0.11, py1, 6, 26, ...PANEL);
        box(0.08, py0 + 0.04, 0.10, py1 - 0.04, 8, 24, ...BAR_BODY);
      }
    }

    // 3. Heavy polished mahogany bar counter top with overhang & bullnose edge
    box(0.02, 0.04, tw - 0.02, th - 0.04, 28, 31, ...MAHOGANY);
    box(0.01, 0.03, tw - 0.01, th - 0.03, 31, 33, ...MAHOGANY_HI);

    // 4. Back-bar stainless speed rail & cocktail station
    if (tw > th) {
      box(0.08, th - 0.20, tw - 0.08, th - 0.06, 29, 32, ...STEEL);
      // Liquor bottles array with glass sheen & metal pour spouts
      const bCols = [
        ['#22c55e', '#16a34a', '#14532d'], // gin / absinthe
        ['#ef4444', '#dc2626', '#991b1b'], // campari
        ['#f59e0b', '#d97706', '#92400e'], // whiskey
        ['#3b82f6', '#2563eb', '#1e40af'], // curacao
        ['#e2e8f0', '#cbd5e1', '#64748b'], // vodka
        ['#a855f7', '#9333ea', '#6b21a8'], // liqueur
      ];
      for (let i = 0; i < 6; i++) {
        const bx = 0.20 + i * 0.44;
        const by = th - 0.18;
        const col = bCols[i % bCols.length];
        box(bx, by, bx + 0.12, by + 0.10, 33, 40, ...col);
        box(bx + 0.04, by + 0.02, bx + 0.08, by + 0.08, 40, 43, ...STEEL); // pour spout
      }
      // Cocktail shaker & cocktail glass
      box(tw / 2 - 0.08, 0.22, tw / 2 + 0.04, 0.34, 33, 41, ...STEEL); // shaker
      box(tw / 2 + 0.14, 0.24, tw / 2 + 0.24, 0.34, 33, 38, '#e0f6fc', '#b8e6f4', '#8accd8'); // glass
    } else {
      box(tw - 0.20, 0.08, tw - 0.06, th - 0.08, 29, 32, ...STEEL);
      const bCols = [
        ['#22c55e', '#16a34a', '#14532d'],
        ['#ef4444', '#dc2626', '#991b1b'],
        ['#f59e0b', '#d97706', '#92400e'],
        ['#3b82f6', '#2563eb', '#1e40af'],
        ['#e2e8f0', '#cbd5e1', '#64748b'],
        ['#a855f7', '#9333ea', '#6b21a8'],
      ];
      for (let i = 0; i < 6; i++) {
        const bx = tw - 0.18;
        const by = 0.20 + i * 0.44;
        const col = bCols[i % bCols.length];
        box(bx, by, bx + 0.10, by + 0.12, 33, 40, ...col);
        box(bx + 0.02, by + 0.04, bx + 0.08, by + 0.08, 40, 43, ...STEEL);
      }
      box(0.22, th / 2 - 0.08, 0.34, th / 2 + 0.04, 33, 41, ...STEEL);
      box(0.24, th / 2 + 0.14, 0.34, th / 2 + 0.24, 33, 38, '#e0f6fc', '#b8e6f4', '#8accd8');
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
    // 1. Cast-iron fluted base (z = 0 .. 6)
    box(0.24, 0.24, 0.76, 0.76, 0, 3, ...IRON);
    box(0.32, 0.32, 0.68, 0.68, 3, 6, ...IRON);

    // 2. Vertical iron lamppost column (z = 6 .. 60)
    box(0.44, 0.44, 0.56, 0.56, 6, 60, ...IRON);

    // 3. Decorative scrolled crossbar arm (z = 54 .. 58)
    box(0.12, 0.46, 0.88, 0.54, 54, 58, ...IRON);
    // Scrolled decorative iron brackets supporting crossbar
    box(0.32, 0.47, 0.44, 0.53, 48, 54, ...IRON);
    box(0.56, 0.47, 0.68, 0.53, 48, 54, ...IRON);

    // 4. Top finial spear (z = 60 .. 68)
    box(0.42, 0.42, 0.58, 0.58, 60, 64, '#ffe27a', '#d8a834', '#98721c');
    box(0.46, 0.46, 0.54, 0.54, 64, 68, '#ffe27a', '#d8a834', '#98721c');

    // 5. Hanging festoon cable and bulbs (spaced cleanly clear of center column)
    const bulbU = [0.16, 0.32, 0.68, 0.84];
    for (let i = 0; i < 4; i++) {
      const u = bulbU[i];
      const col = BULBS[i % BULBS.length];
      // Black weather-resistant cord socket
      box(u + 0.01, 0.46, u + 0.05, 0.54, 50, 54, '#1c1c24', '#14141a', '#0c0c10');
      // Glowing festoon bulb
      box(u - 0.01, 0.44, u + 0.07, 0.56, 44, 50, ...col);
      // Hot glowing incandescent filament core
      box(u + 0.01, 0.47, u + 0.05, 0.53, 46, 48.5, '#ffffff', '#fffbe8', '#ffe590');
    }
  });
}

// ---------------- 8 Original Collection Items (v0.3.0) ----------------

export function buildAquariumSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STAND_BASE = ['#20242c', '#16181e', '#0c0e12'];
  const STAND = ['#2c323d', '#20242c', '#14181e'];
  const STAND_DOOR = ['#38404e', '#2c323d', '#1c2028'];
  const CHROME = ['#eaf0f6', '#c0ccd8', '#8898a8'];
  const SAND = ['#f4ecd0', '#ded2b0', '#b8aa88'];
  const ROCK = ['#5e5852', '#46403a', '#302c28'];
  const WATER = ['#4ed8d8', '#26b0b8', '#147680'];
  const WATER_HI = ['#c8f8fa', '#88e4ec', '#48b8c4'];
  const HOOD = ['#22262e', '#181b22', '#101216'];

  return isoSprite(tw, th, 46, (box) => {
    // 1. Sleek modern cabinet stand
    // Recessed plinth base (z = 0 .. 3)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 0, 3, ...STAND_BASE);
    // Main cabinet body (z = 3 .. 15)
    box(0.04, 0.08, tw - 0.04, th - 0.08, 3, 15, ...STAND);

    // Twin cabinet doors with center seam and chrome edge handles
    if (tw > th) {
      box(0.06, 0.07, tw / 2 - 0.02, 0.09, 4, 14, ...STAND_DOOR);
      box(tw / 2 + 0.02, 0.07, tw - 0.06, 0.09, 4, 14, ...STAND_DOOR);
      box(tw / 2 - 0.05, 0.06, tw / 2 - 0.03, 0.08, 10, 13, ...CHROME);
      box(tw / 2 + 0.03, 0.06, tw / 2 + 0.05, 0.08, 10, 13, ...CHROME);
    } else {
      box(0.07, 0.06, 0.09, th / 2 - 0.02, 4, 14, ...STAND_DOOR);
      box(0.07, th / 2 + 0.02, 0.09, th - 0.06, 4, 14, ...STAND_DOOR);
      box(0.06, th / 2 - 0.05, 0.08, th / 2 - 0.03, 10, 13, ...CHROME);
      box(0.06, th / 2 + 0.03, 0.08, th / 2 + 0.05, 10, 13, ...CHROME);
    }

    // Polished chrome tank support collar (z = 15 .. 17)
    box(0.02, 0.06, tw - 0.02, th - 0.06, 15, 17, ...CHROME);

    // 2. Tank interior
    // Aragonite sand substrate bed (z = 17 .. 20)
    box(0.05, 0.09, tw - 0.05, th - 0.09, 17, 20, ...SAND);

    // Live rock coral reef scape (z = 20 .. 30)
    box(0.12 * tw, 0.22 * th, 0.42 * tw, 0.58 * th, 20, 28, ...ROCK);
    box(tw - 0.44 * tw, 0.26 * th, tw - 0.14 * tw, 0.62 * th, 20, 26, ...ROCK);

    // Branching pink coral & green sea anemone
    box(0.16 * tw, 0.26 * th, 0.32 * tw, 0.48 * th, 28, 34, '#f472b6', '#db2777', '#9d174d');
    box(tw - 0.38 * tw, 0.30 * th, tw - 0.20 * tw, 0.52 * th, 26, 31, '#34d399', '#059669', '#065f46');

    // Rising aerator bubble stream (micro 2x air bubbles)
    const bubX = tw > th ? 0.50 * tw : 0.48 * tw;
    const bubY = tw > th ? 0.38 * th : 0.50 * th;
    box(bubX - 0.02, bubY - 0.02, bubX + 0.02, bubY + 0.02, 21, 23, '#ffffff', '#e0f8fc', '#b0e8f4');
    box(bubX - 0.01, bubY - 0.01, bubX + 0.03, bubY + 0.03, 26, 28, '#ffffff', '#e0f8fc', '#b0e8f4');
    box(bubX - 0.02, bubY - 0.02, bubX + 0.02, bubY + 0.02, 32, 34, '#ffffff', '#e0f8fc', '#b0e8f4');

    // Tropical clownfish (orange body, white bar, dark fin)
    const cX = tw > th ? 0.36 * tw : 0.42 * tw;
    const cY = tw > th ? 0.42 * th : 0.36 * th;
    box(cX, cY, cX + 0.16, cY + 0.10, 27, 31, '#fb923c', '#ea580c', '#9a3412');
    box(cX + 0.06, cY, cX + 0.10, cY + 0.10, 27, 31, '#ffffff', '#f1f5f9', '#cbd5e1'); // white vertical bar
    box(cX + 0.14, cY + 0.02, cX + 0.17, cY + 0.08, 28, 30, '#1e293b', '#0f172a', '#020617'); // dark tail fin

    // Blue tang (royal blue body, vibrant yellow tail)
    const bX = tw > th ? 0.64 * tw : 0.52 * tw;
    const bY = tw > th ? 0.46 * th : 0.64 * th;
    box(bX, bY, bX + 0.14, bY + 0.08, 23, 27, '#2563eb', '#1d4ed8', '#1e3a8a');
    box(bX + 0.12, bY + 0.01, bX + 0.16, bY + 0.07, 24, 26, '#facc15', '#eab308', '#a16207');

    // Opti-white water prism with surface meniscus
    box(0.04, 0.08, tw - 0.04, th - 0.08, 20, 38, ...WATER);
    box(0.05, 0.09, tw - 0.05, th - 0.09, 37, 38.5, ...WATER_HI);

    // Top canopy hood with ventilation louvers & feeding hatch (z = 38 .. 44)
    box(0.03, 0.07, tw - 0.03, th - 0.07, 38, 44, ...HOOD);
    box(0.20 * tw, 0.22 * th, 0.60 * tw, 0.68 * th, 44, 45, '#38404e', '#2c323d', '#1c2028'); // feeding lid
    // Power indicator LED
    box(tw - 0.18, th - 0.14, tw - 0.12, th - 0.10, 44, 45.5, '#4ade80', '#22c55e', '#15803d');
  });
}

export function buildBobaBarSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const TILES = ['#9fe0cc', '#78bfa8', '#508c78'];
  const TILES_DARK = ['#70ac98', '#548c78', '#386454'];
  const BIRCH = ['#faeed0', '#deceaa', '#b8a680'];
  const BIRCH_HI = ['#ffffff', '#f4e6c8', '#d0be98'];
  const STEEL = ['#d8e0e8', '#b0bcc8', '#808c98'];
  const SEALER = ['#e8edf4', '#c4ced8', '#94a0b0'];
  const CUP = ['#f4f8fc', '#d0e0ec', '#a4bcc8'];

  return isoSprite(tw, th, 46, (box) => {
    // 1. Subway tiled counter base (z = 0 .. 22)
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 22, ...TILES);
    // Darker base plinth
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 3, ...TILES_DARK);

    // 2. Polished birch counter top with overhang (z = 22 .. 25)
    box(0.02, 0.04, tw - 0.02, th - 0.04, 22, 24, ...BIRCH);
    box(0.01, 0.03, tw - 0.01, th - 0.03, 24, 25.5, ...BIRCH_HI);

    // 3. Twin commercial stainless tea urn dispensers (z = 25 .. 38)
    // Urn 1 (Black Tea)
    const [u1x, u1y] = [0.12 * tw, 0.20 * th];
    box(u1x, u1y, u1x + 0.26, u1y + 0.26, 25, 37, ...STEEL);
    box(u1x - 0.01, u1y - 0.01, u1x + 0.27, u1y + 0.27, 36, 38, '#32363e', '#22242a', '#14161a'); // black lid
    box(u1x + 0.08, u1y + 0.25, u1x + 0.18, u1y + 0.29, 27, 30, '#ef4444', '#dc2626', '#991b1b'); // red tap

    // Urn 2 (Jasmine Green Tea)
    const [u2x, u2y] = [0.38 * tw, 0.20 * th];
    box(u2x, u2y, u2x + 0.26, u2y + 0.26, 25, 37, ...STEEL);
    box(u2x - 0.01, u2y - 0.01, u2x + 0.27, u2y + 0.27, 36, 38, '#32363e', '#22242a', '#14161a');
    box(u2x + 0.08, u2y + 0.25, u2x + 0.18, u2y + 0.29, 27, 30, '#22c55e', '#16a34a', '#15803d'); // green tap

    // 4. Automatic cup sealer machine with digital display (z = 25 .. 37)
    const [smx, smy] = [0.66 * tw, 0.18 * th];
    box(smx, smy, smx + 0.26, smy + 0.26, 25, 36, ...SEALER);
    box(smx + 0.04, smy + 0.25, smx + 0.22, smy + 0.28, 30, 34, '#0f172a', '#020617', '#000000'); // LED screen
    box(smx + 0.06, smy + 0.26, smx + 0.20, smy + 0.28, 31, 33, '#38bdf8', '#0284c7', '#0369a1'); // cyan readout
    // Film roll brackets on top
    box(smx + 0.06, smy + 0.06, smx + 0.20, smy + 0.20, 36, 39, '#f472b6', '#db2777', '#9d174d');

    // 5. Overhead menu header board & rear support posts (drawn before front counter props)
    box(0.20 * tw, 0.09 * th, 0.24 * tw, 0.13 * th, 24, 42, '#334155', '#1e293b', '#0f172a'); // left support post
    box(tw - 0.24 * tw, 0.09 * th, tw - 0.20 * tw, 0.13 * th, 24, 42, '#334155', '#1e293b', '#0f172a'); // right support post
    box(0.18 * tw, 0.08 * th, tw - 0.18 * tw, 0.16 * th, 40, 45, '#1e293b', '#0f172a', '#020617');
    box(0.22 * tw, 0.07 * th, tw - 0.22 * tw, 0.10 * th, 41, 44, '#f472b6', '#ec4899', '#be185d');

    // 6. Prepared boba drink cups with dark tapioca pearls and wide rainbow straws
    const [cx, cy] = [0.78 * tw, 0.48 * th];
    box(cx, cy, cx + 0.14, cy + 0.14, 25, 33, ...CUP);
    box(cx + 0.01, cy + 0.01, cx + 0.13, cy + 0.13, 25, 28, '#1e1612', '#140e0c', '#0a0604'); // boba pearls
    box(cx + 0.01, cy + 0.01, cx + 0.13, cy + 0.13, 28, 32, '#e8b878', '#c49454', '#946a32'); // milk tea
    box(cx + 0.05, cy + 0.05, cx + 0.09, cy + 0.09, 33, 37, '#ec4899', '#db2777', '#9d174d'); // fat pink straw
  });
}

export function buildMiniArcadeSprite(rot = 0) {
  const CHASSIS = ['#221e30', '#181424', '#0e0c16'];
  const TMOLD = ['#ff2a8c', '#d4186e', '#940c4a']; // hot magenta T-molding edge trim
  const SCREEN_BEZEL = ['#14161e', '#0e1016', '#080a0e'];
  const SCREEN = ['#0a1424', '#060e1a', '#040810'];
  const CRT_GLARE = ['#38bdf8', '#0284c7', '#0369a1'];
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];
  const COIN_DOOR = ['#1c1c24', '#14141a', '#0c0c10'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Upright arcade cabinet base plinth & T-molding profile (z = 0 .. 18)
    box(0.12, 0.14, 0.88, 0.86, 0, 18, ...CHASSIS);
    box(0.11, 0.13, 0.13, 0.87, 0, 18, ...TMOLD);
    box(0.87, 0.13, 0.89, 0.87, 0, 18, ...TMOLD);

    // 2. Upper chassis & illuminated marquee sign with "ARCADE" header (z = 43 .. 54)
    box(0.12, 0.16, 0.88, 0.52, 43, 54, ...CHASSIS);
    box(0.11, 0.15, 0.89, 0.53, 51, 54, ...TMOLD);
    box(0.18, 0.48, 0.82, 0.53, 44, 52, '#fff9c4', '#fff176', '#fbc02d');
    box(0.22, 0.50, 0.78, 0.535, 46, 50, '#ff007f', '#c70063', '#8a0044');

    // 3. Tilted CRT monitor display & bezel (z = 24 .. 43)
    box(0.14, 0.20, 0.86, 0.65, 24, 43, ...SCREEN_BEZEL);
    box(0.18, 0.24, 0.82, 0.60, 25, 42, ...SCREEN);
    // CRT curved diagonal glass glare streak
    box(0.20, 0.52, 0.32, 0.58, 38, 41, ...CRT_GLARE);
    box(0.26, 0.42, 0.40, 0.50, 34, 38, ...CRT_GLARE);

    // Pixel art retro spaceship & stars on screen
    box(0.44, 0.36, 0.56, 0.48, 30, 36, '#00e676', '#00b85c', '#007a3d'); // ship
    box(0.48, 0.38, 0.52, 0.46, 36, 38, '#ffeb3b', '#fbc02d', '#f57f17'); // nose laser
    box(0.28, 0.30, 0.32, 0.34, 38, 40, '#ffffff', '#f0f0f0', '#d0d0d0'); // star
    box(0.68, 0.32, 0.72, 0.36, 32, 34, '#ffffff', '#f0f0f0', '#d0d0d0'); // star
    box(0.36, 0.28, 0.40, 0.32, 28, 30, '#ff4081', '#d42862', '#941440'); // enemy alien

    // 4. Double commercial steel coin door with twin illuminated 25c reject buttons (z = 3 .. 16)
    box(0.28, 0.80, 0.72, 0.87, 3, 16, ...COIN_DOOR);
    box(0.30, 0.83, 0.70, 0.86, 4, 15, shade(COIN_DOOR[0], 0.1), shade(COIN_DOOR[1], 0.1), shade(COIN_DOOR[2], 0.1));
    box(0.48, 0.85, 0.52, 0.88, 14, 15.5, ...CHROME);
    box(0.34, 0.85, 0.44, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.56, 0.85, 0.66, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.34, 0.84, 0.44, 0.88, 4.5, 7, '#101016', '#08080c', '#040406');
    box(0.56, 0.84, 0.66, 0.88, 4.5, 7, '#101016', '#08080c', '#040406');

    // 5. Slanted control panel deck (drawn in front of CRT to occlude cleanly, z = 18 .. 31)
    box(0.12, 0.40, 0.88, 0.88, 18, 25, ...CHASSIS);
    box(0.11, 0.39, 0.89, 0.89, 23.5, 25.5, ...TMOLD);

    // Ball-top red arcade joystick
    box(0.24, 0.60, 0.32, 0.68, 25, 27, ...CHROME);
    box(0.22, 0.58, 0.34, 0.70, 27, 31, '#ff1744', '#cc0e34', '#8a0620');

    // 6 arcade action buttons in 2 curved rows of 3
    box(0.46, 0.66, 0.52, 0.72, 25, 26.5, '#00e5ff', '#00b4cc', '#007a8a');
    box(0.58, 0.66, 0.64, 0.72, 25, 26.5, '#ffea00', '#d4c200', '#948800');
    box(0.70, 0.66, 0.76, 0.72, 25, 26.5, '#00e676', '#00b85c', '#007a3d');
    box(0.46, 0.54, 0.52, 0.60, 25, 26.5, '#ff4081', '#d42862', '#941440');
    box(0.58, 0.54, 0.64, 0.60, 25, 26.5, '#2979ff', '#1c5ec4', '#103e84');
    box(0.70, 0.54, 0.76, 0.60, 25, 26.5, '#ff5722', '#d83808', '#942200');
    box(0.26, 0.46, 0.30, 0.50, 25, 26.2, '#ffffff', '#e0e0e0', '#b0b0b0');
  });
}

export function buildNoodleCartSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const CART_WOOD = ['#9e6634', '#825024', '#5c3614'];
  const CART_DARK = ['#6c3e18', '#542e10', '#3a1e0a'];
  const WHEEL = ['#4a3828', '#38281a', '#24180e'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];
  const AWNING_BLUE = ['#1e2c52', '#141e3a', '#0c1224'];
  const AWNING_WHITE = ['#f4f0dc', '#ded6be', '#b0a890'];
  const STEEL = ['#d8e0e8', '#b0bcc8', '#808c98'];
  const STEAM = ['#ffffff', '#f0f8fc', '#d8eef8'];

  return isoSprite(tw, th, 54, (box) => {
    // 1. Rear timber support legs / kickstand (z = 0 .. 8, grounding the back of the cart)
    box(0.12, 0.12, 0.22, 0.22, 0, 8, ...CART_DARK);
    box(tw - 0.22, 0.12, tw - 0.12, 0.22, 0, 8, ...CART_DARK);

    // 2. Spoked timber wheels with iron rim & center brass hub (z = 0 .. 10)
    box(0.10, 0.80, 0.26, 0.90, 0, 10, ...WHEEL);
    box(0.15, 0.79, 0.21, 0.91, 4, 7, ...BRASS); // hub
    box(tw - 0.26, 0.80, tw - 0.10, 0.90, 0, 10, ...WHEEL);
    box(tw - 0.21, 0.79, tw - 0.15, 0.91, 4, 7, ...BRASS);

    // Cart axle beam
    box(0.18, 0.82, tw - 0.18, 0.88, 4, 7, ...CART_DARK);

    // 3. Wooden food cart body with drawers & brass pulls (z = 8 .. 22)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 8, 22, ...CART_WOOD);
    box(0.10, 0.09, tw - 0.10, 0.11, 10, 20, ...CART_DARK); // front prep drawer seam
    box(tw / 2 - 0.04, 0.08, tw / 2 + 0.04, 0.10, 14, 16, ...BRASS); // drawer handle

    // 3. Boiling noodle broth cauldron (z = 22 .. 32)
    const [cx, cy] = [0.14 * tw, 0.20 * th];
    box(cx, cy, cx + 0.36, cy + 0.36, 22, 32, ...STEEL);
    // Golden rich ramen broth
    box(cx + 0.03, cy + 0.03, cx + 0.33, cy + 0.33, 31, 32.5, '#f0b840', '#d49c24', '#946a10');
    // Garnish: green scallions & nori seaweed
    box(cx + 0.06, cy + 0.06, cx + 0.14, cy + 0.14, 32.5, 33.5, '#22c55e', '#16a34a', '#14532d');
    box(cx + 0.20, cy + 0.06, cx + 0.28, cy + 0.16, 32.5, 33.5, '#1e293b', '#0f172a', '#020617');

    // Rising steam puffs above cauldron (z = 33 .. 42)
    box(cx + 0.10, cy + 0.10, cx + 0.18, cy + 0.18, 34, 37, ...STEAM);
    box(cx + 0.14, cy + 0.14, cx + 0.24, cy + 0.24, 38, 41, ...STEAM);

    // 4. Ceramic ramen bowls stack (z = 22 .. 30)
    const [bx, by] = [0.56 * tw, 0.26 * th];
    box(bx, by, bx + 0.22, by + 0.22, 22, 30, '#faf6ee', '#ded6c6', '#b0a894');
    box(bx + 0.02, by + 0.02, bx + 0.20, by + 0.20, 29, 30.5, '#2563eb', '#1d4ed8', '#1e3a8a'); // blue glazed rim

    // 5. Red chopstick caddy & seasoning shakers (z = 22 .. 31)
    box(tw - 0.22, 0.24 * th, tw - 0.10, 0.24 * th + 0.12, 22, 30, '#dc2626', '#b91c1c', '#7f1d1d');
    box(tw - 0.20, 0.24 * th + 0.02, tw - 0.12, 0.24 * th + 0.10, 30, 33, '#e5d0a4', '#c4b082', '#98865c'); // wooden chopsticks

    // 6. Canopy timber corner posts (z = 22 .. 45)
    box(0.06, 0.10, 0.12, 0.16, 22, 45, ...CART_DARK);
    box(tw - 0.12, 0.10, tw - 0.06, 0.16, 22, 45, ...CART_DARK);
    box(0.06, th - 0.16, 0.12, th - 0.10, 22, 45, ...CART_DARK);
    box(tw - 0.12, th - 0.16, tw - 0.06, th - 0.10, 22, 45, ...CART_DARK);

    // 7. Striped indigo noren fabric awning roof (z = 45 .. 53)
    box(0.02, 0.04, tw - 0.02, th - 0.04, 45, 52, ...AWNING_BLUE);
    box(tw * 0.20, 0.02, tw * 0.40, th - 0.02, 46, 53, ...AWNING_WHITE);
    box(tw * 0.60, 0.02, tw * 0.80, th - 0.02, 46, 53, ...AWNING_WHITE);

    // 8. Glowing crimson Japanese chochin paper lantern with gold tassel (z = 28 .. 42)
    box(tw - 0.26, 0.64, tw - 0.08, 0.82, 31, 41, '#ef4444', '#dc2626', '#991b1b');
    box(tw - 0.23, 0.67, tw - 0.11, 0.79, 32, 40, '#f87171', '#ef4444', '#b91c1c'); // glowing core
    box(tw - 0.19, 0.71, tw - 0.15, 0.75, 27, 31, ...BRASS); // gold tassel
  });
}

export function buildKaraokeMachineSprite(rot = 0) {
  const KIOSK = ['#242636', '#181a26', '#0e1018'];
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];
  const CHROME_HI = ['#ffffff', '#e8f0f8', '#b8c6d4'];
  const DISPLAY = ['#0a182e', '#061020', '#040a14'];
  const LYRIC_BLUE = ['#38bdf8', '#0284c7', '#0369a1'];
  const BOUNCE_GOLD = ['#ffea00', '#fbc02d', '#f57f17'];
  const WOOFER_CONE = ['#1a1c24', '#12141a', '#0a0c10'];
  const RING_CYAN = ['#00e5ff', '#00b4cc', '#007a8a'];
  const RING_MAGENTA = ['#ff2a8c', '#d4186e', '#940c4a'];

  return isoSprite(1, 1, 52, (box) => {
    // 1. Stage wash plinth with multicolor LED perimeter glow (z = 0 .. 4)
    box(0.12, 0.12, 0.88, 0.88, 0, 3, '#2a1a38', '#1c1028', '#12081a');
    // Pulsing LED edge wash lights
    box(0.14, 0.84, 0.48, 0.88, 1, 3.5, ...RING_MAGENTA);
    box(0.52, 0.84, 0.86, 0.88, 1, 3.5, ...RING_CYAN);

    // 2. Heavy acoustic speaker tower cabinet (z = 3 .. 40)
    box(0.18, 0.18, 0.82, 0.62, 3, 40, ...KIOSK);
    // Brushed chrome side vertical trim rails
    box(0.16, 0.16, 0.20, 0.64, 3, 40, ...CHROME);
    box(0.80, 0.16, 0.84, 0.64, 3, 40, ...CHROME);

    // 3. Dual glowing speaker woofers
    // Lower 10" subwoofer cone (z = 6 .. 17)
    box(0.24, 0.58, 0.76, 0.64, 6, 17, ...RING_CYAN); // cyan halo ring
    box(0.28, 0.59, 0.72, 0.63, 7, 16, ...WOOFER_CONE); // cone body
    box(0.44, 0.60, 0.56, 0.64, 10, 13, ...CHROME_HI); // center silver phase plug

    // Upper mid-woofer cone (z = 18 .. 27)
    box(0.30, 0.58, 0.70, 0.64, 18, 27, ...RING_MAGENTA); // magenta halo ring
    box(0.34, 0.59, 0.66, 0.63, 19, 26, ...WOOFER_CONE);
    box(0.46, 0.60, 0.54, 0.64, 21, 24, ...CHROME_HI);

    // 4. Central widescreen color monitor (z = 28 .. 39)
    box(0.20, 0.56, 0.80, 0.63, 28, 39, '#10121a', '#0a0c12', '#06080a'); // screen bezel
    box(0.24, 0.58, 0.76, 0.62, 29, 38, ...DISPLAY); // widescreen face

    // Animated lyric prompt bars on display
    box(0.28, 0.59, 0.60, 0.61, 34, 36, ...LYRIC_BLUE); // upper lyric text line
    box(0.32, 0.59, 0.72, 0.61, 31, 33, '#e2e8f0', '#cbd5e1', '#94a3b8'); // lower lyric text line
    // Bouncing golden karaoke ball over active syllable
    box(0.48, 0.60, 0.54, 0.62, 36, 38.5, ...BOUNCE_GOLD);

    // Left and right audio VU-meter spectrum LED columns
    box(0.21, 0.59, 0.23, 0.61, 29, 33, '#22c55e', '#16a34a', '#15803d'); // green
    box(0.21, 0.59, 0.23, 0.61, 33, 36, '#eab308', '#ca8a04', '#a16207'); // yellow
    box(0.21, 0.59, 0.23, 0.61, 36, 38, '#ef4444', '#dc2626', '#b91c1c'); // red peak
    box(0.77, 0.59, 0.79, 0.61, 29, 34, '#22c55e', '#16a34a', '#15803d');
    box(0.77, 0.59, 0.79, 0.61, 34, 37, '#eab308', '#ca8a04', '#a16207');

    // 5. Dual wireless microphones in side docking cradles
    // Left microphone (red band)
    box(0.10, 0.32, 0.18, 0.46, 20, 24, ...KIOSK); // cradle
    box(0.12, 0.34, 0.16, 0.44, 22, 31, ...CHROME); // mic shaft
    box(0.11, 0.33, 0.17, 0.45, 26, 27.5, '#ef4444', '#dc2626', '#b91c1c'); // red id band
    box(0.10, 0.32, 0.18, 0.46, 31, 36, ...CHROME_HI); // silver mesh head

    // Right microphone (blue band)
    box(0.82, 0.32, 0.90, 0.46, 20, 24, ...KIOSK);
    box(0.84, 0.34, 0.88, 0.44, 22, 31, ...CHROME);
    box(0.83, 0.33, 0.89, 0.45, 26, 27.5, '#3b82f6', '#2563eb', '#1d4ed8'); // blue id band
    box(0.82, 0.32, 0.90, 0.46, 31, 36, ...CHROME_HI);

    // 6. Top spinning party disco ball mirror dome (z = 40 .. 49)
    box(0.28, 0.24, 0.72, 0.56, 40, 42, ...CHROME); // dome base
    box(0.34, 0.28, 0.66, 0.52, 42, 49, '#ffffff', '#e2e8f0', '#94a3b8'); // multifaceted mirror ball
    box(0.38, 0.32, 0.46, 0.40, 45, 48, '#50f0ff', '#20c8e8', '#1088a8'); // cyan ray glint
    box(0.54, 0.40, 0.62, 0.48, 44, 47, '#ff40b0', '#d82088', '#980c58'); // magenta ray glint
  });
}

export function buildTelescopeSprite(rot = 0) {
  const BRASS = ['#f6c667', '#d8a442', '#a07424'];
  const BRASS_LT = ['#ffe088', '#f6c667', '#c08e2c'];
  const BRASS_HI = ['#ffffff', '#fff0b0', '#e2be48'];
  const TRIPOD = ['#7c4422', '#603216', '#44200c'];

  return isoSprite(1, 1, 56, (box) => {
    // 1. Far splayed mahogany tripod legs (West & East, z = 0 .. 24)
    // West leg (far NW)
    box(0.13, 0.23, 0.27, 0.37, 0, 3, ...BRASS);
    box(0.14, 0.24, 0.26, 0.36, 3, 8, ...TRIPOD);
    box(0.24, 0.30, 0.36, 0.42, 8, 16, ...TRIPOD);
    box(0.34, 0.38, 0.44, 0.48, 16, 24, ...TRIPOD);

    // East leg (far NE)
    box(0.73, 0.23, 0.87, 0.37, 0, 3, ...BRASS);
    box(0.74, 0.24, 0.86, 0.36, 3, 8, ...TRIPOD);
    box(0.64, 0.30, 0.76, 0.42, 8, 16, ...TRIPOD);
    box(0.56, 0.38, 0.66, 0.48, 16, 24, ...TRIPOD);

    // 2. Brass spreader tray & accessory rack between legs (z = 10 .. 12)
    box(0.38, 0.38, 0.62, 0.62, 10, 12, ...BRASS);

    // 3. Alt-azimuth swivel mount & setting circles (z = 24 .. 28)
    box(0.40, 0.40, 0.60, 0.60, 24, 28, ...BRASS);
    box(0.58, 0.46, 0.76, 0.54, 22, 25, '#8c6418', '#6a480e', '#482e06'); // counterweight rod
    box(0.70, 0.44, 0.78, 0.56, 21, 26, ...BRASS); // brass counterweight

    // 4. Slender angled brass refractor optical tube
    box(0.54, 0.54, 0.66, 0.66, 25, 29, ...BRASS); // 90-degree star diagonal & eyepiece
    box(0.48, 0.48, 0.56, 0.56, 28, 32, ...BRASS_LT); // focusing rack & knurled knob
    box(0.40, 0.40, 0.54, 0.54, 29, 39, ...BRASS); // mid barrel
    box(0.38, 0.38, 0.44, 0.44, 30, 38, ...BRASS_HI); // 2x top specular highlight streak
    box(0.30, 0.30, 0.44, 0.44, 39, 47, ...BRASS); // upper barrel
    box(0.28, 0.28, 0.34, 0.34, 40, 46, ...BRASS_HI);
    box(0.22, 0.22, 0.38, 0.38, 47, 54, ...BRASS_LT); // flared dew shield
    box(0.24, 0.24, 0.36, 0.36, 54, 55, '#e0f8ff', '#a8e8f8', '#60b8d8'); // multi-coated objective lens

    // 5. Near tripod leg (South leg, v = 0.71 .. 0.85, drawn last to sit cleanly in front)
    box(0.43, 0.71, 0.57, 0.85, 0, 3, ...BRASS); // brass toe shoe
    box(0.44, 0.72, 0.56, 0.84, 3, 8, ...TRIPOD);
    box(0.45, 0.58, 0.55, 0.72, 8, 16, ...TRIPOD);
    box(0.46, 0.48, 0.54, 0.58, 16, 24, ...TRIPOD);
  });
}

export function buildKoiPondSprite(rot = 0) {
  const SLATE = ['#6a6e7c', '#505460', '#383c46'];
  const SLATE_HI = ['#8c92a2', '#6e7482', '#4e5460'];
  const WATER = ['#38b8c8', '#1e8e9e', '#106472'];
  const WATER_HI = ['#9ae8f4', '#52cce0', '#249cb0'];
  const LILY = ['#4ebd5e', '#369e44', '#226e2e'];
  const LILY_HI = ['#72e482', '#4ebd5e', '#30883c'];

  return isoSprite(2, 2, 14, (box) => {
    // 1. Natural carved flagstone coping stone rim around all 4 sides (z = 0 .. 8)
    stoneBlocks(box, 0.04, 0.04, 1.96, 0.26, 0, 8, { stone: SLATE, blockLength: 0.45 });
    stoneBlocks(box, 0.04, 1.74, 1.96, 1.96, 0, 8, { stone: SLATE, blockLength: 0.45 });
    stoneBlocks(box, 0.04, 0.26, 0.26, 1.74, 0, 8, { stone: SLATE, blockLength: 0.45 });
    stoneBlocks(box, 1.74, 0.26, 1.96, 1.74, 0, 8, { stone: SLATE, blockLength: 0.45 });

    // Coping lip overhang bevel highlight
    box(0.02, 0.02, 1.98, 0.28, 7, 8.5, ...SLATE_HI);
    box(0.02, 1.72, 1.98, 1.98, 7, 8.5, ...SLATE_HI);
    box(0.02, 0.28, 0.28, 1.72, 7, 8.5, ...SLATE_HI);
    box(1.72, 0.28, 1.98, 1.72, 7, 8.5, ...SLATE_HI);

    // 2. Clear turquoise aquatic water pool with depth gradient (z = 0 .. 5.5)
    box(0.26, 0.26, 1.74, 1.74, 0, 5, ...WATER);
    box(0.30, 0.30, 1.70, 1.70, 4.8, 5.4, ...WATER_HI); // caustic ripple surface

    // 3. Natural mossy river boulder stepping stone (z = 0 .. 7.5)
    box(0.85, 0.85, 1.25, 1.25, 0, 7.5, '#78808e', '#5c6470', '#3e444e');
    box(0.88, 0.88, 1.22, 1.22, 7.2, 7.8, '#589e68', '#3c7a4a', '#245632'); // moss top

    // 4. Emerald floating circular lily pads with notched leaf outlines (z = 5.2 .. 6.2)
    box(0.42, 0.52, 0.70, 0.80, 5.2, 6.2, ...LILY);
    box(0.46, 0.56, 0.66, 0.76, 6.0, 6.4, ...LILY_HI);
    // Pink water lily blossom with golden stamen
    box(0.54, 0.62, 0.62, 0.70, 6.2, 7.5, '#f472b6', '#db2777', '#9d174d');
    box(0.56, 0.64, 0.60, 0.68, 7.4, 8.0, '#fde047', '#eab308', '#a16207');

    box(1.30, 1.10, 1.56, 1.36, 5.2, 6.2, ...LILY);
    box(1.34, 1.14, 1.52, 1.32, 6.0, 6.4, ...LILY_HI);

    // 5. Swimming Kohaku koi (white with vivid scarlet red patches and black pectoral fins)
    box(0.70, 0.40, 1.10, 0.65, 3, 5, '#f8fafc', '#e2e8f0', '#cbd5e1'); // pearl white body
    box(0.82, 0.44, 0.98, 0.60, 4.5, 5.2, '#ef4444', '#dc2626', '#991b1b'); // scarlet hi pattern
    box(0.68, 0.48, 0.72, 0.56, 3.5, 4.5, '#f8fafc', '#e2e8f0', '#cbd5e1'); // tail fin

    // 6. Swimming Yamabuki golden Ogon koi
    box(1.10, 0.65, 1.45, 0.90, 2.5, 4.5, '#facc15', '#eab308', '#a16207');
    box(1.18, 0.70, 1.38, 0.85, 4.2, 4.8, '#fde047', '#facc15', '#ca8a04'); // golden metallic sheen
  });
}

export function buildCapsuleDispenserSprite(rot = 0) {
  const IRON_BASE = ['#383a48', '#282a34', '#1a1c24'];
  const RED_BODY = ['#e02838', '#b81c2c', '#800c18'];
  const RED_HI = ['#ff4d5e', '#e02838', '#9e1422'];
  const GLOBE = ['#88d8f0', '#58b4d0', '#308098'];
  const GLASS_HI = ['#ffffff', '#e8f8ff', '#b4e4f8'];
  const CHROME = ['#e0e4ec', '#b8c0cc', '#848c98'];
  const CHROME_HI = ['#ffffff', '#f0f4fa', '#c8d0dc'];

  return isoSprite(1, 1, 48, (box) => {
    // 1. Heavy cast iron circular pedestal stand with flared foot (z = 0 .. 5)
    box(0.20, 0.20, 0.80, 0.80, 0, 3, ...IRON_BASE);
    box(0.26, 0.26, 0.74, 0.74, 3, 5, ...IRON_BASE);

    // 2. Cast metal crimson mechanism housing body (z = 5 .. 20)
    box(0.18, 0.18, 0.82, 0.82, 5, 20, ...RED_BODY);
    box(0.16, 0.16, 0.84, 0.84, 18, 20, ...CHROME); // polished top chrome mounting collar

    // Prize retrieval door flap (z = 2 .. 10)
    box(0.30, 0.78, 0.70, 0.85, 2, 10, '#1c1e24', '#14161a', '#0a0c0e'); // recessed chute pocket
    box(0.32, 0.82, 0.68, 0.86, 3, 9, '#343844', '#262a34', '#181a22'); // swinging door flap
    // Awarded prize capsule waiting in retrieval chute
    box(0.42, 0.80, 0.58, 0.86, 4, 8, '#fde047', '#eab308', '#a16207'); // yellow capsule half
    box(0.44, 0.82, 0.56, 0.86, 6, 8, '#ffffff', '#f1f5f9', '#cbd5e1'); // white capsule half

    // Chrome coin mechanism & turn crank key (z = 11 .. 17)
    box(0.34, 0.80, 0.66, 0.85, 12, 17, ...CHROME); // coin slide plate
    box(0.46, 0.84, 0.54, 0.86, 14, 16.5, '#121418', '#0a0c0e', '#040608'); // coin slot
    // Rotating winged crank handle
    box(0.42, 0.83, 0.58, 0.87, 13, 15.5, ...CHROME_HI);
    box(0.48, 0.82, 0.52, 0.88, 11.5, 17, ...CHROME_HI); // vertical turn wing

    // 3. Transparent spherical toy capsule globe (z = 20 .. 39)
    box(0.16, 0.16, 0.84, 0.84, 20, 39, ...GLOBE);

    // Multi-colored 2-tone toy prize capsules inside globe
    // Lower tier
    box(0.24, 0.26, 0.42, 0.44, 21, 27, '#ef4444', '#dc2626', '#991b1b'); // red
    box(0.24, 0.26, 0.42, 0.44, 24, 27, '#ffffff', '#f1f5f9', '#cbd5e1'); // white top
    box(0.56, 0.28, 0.74, 0.46, 21, 27, '#eab308', '#ca8a04', '#a16207'); // yellow
    box(0.56, 0.28, 0.74, 0.46, 24, 27, '#38bdf8', '#0284c7', '#0369a1'); // cyan top
    box(0.34, 0.52, 0.52, 0.70, 22, 28, '#22c55e', '#16a34a', '#15803d'); // green
    box(0.34, 0.52, 0.52, 0.70, 25, 28, '#ffffff', '#f1f5f9', '#cbd5e1');

    // Mid tier
    box(0.28, 0.32, 0.46, 0.50, 27, 33, '#3b82f6', '#2563eb', '#1d4ed8'); // blue
    box(0.28, 0.32, 0.46, 0.50, 30, 33, '#facc15', '#eab308', '#a16207');
    box(0.52, 0.48, 0.70, 0.66, 27, 33, '#a855f7', '#9333ea', '#6b21a8'); // purple
    box(0.52, 0.48, 0.70, 0.66, 30, 33, '#f43f5e', '#e11d48', '#9f1239');

    // Upper tier
    box(0.40, 0.36, 0.58, 0.54, 32, 37, '#f97316', '#ea580c', '#c2410c'); // orange
    box(0.40, 0.36, 0.58, 0.54, 34.5, 37, '#ffffff', '#f1f5f9', '#cbd5e1');

    // Clear globe specular glass reflection streaks
    box(0.18, 0.50, 0.24, 0.66, 24, 36, ...GLASS_HI);
    box(0.20, 0.20, 0.32, 0.32, 33, 37, ...GLASS_HI);

    // 4. Molded crimson metal lid cap & chrome cylinder lock (z = 39 .. 46)
    box(0.18, 0.18, 0.82, 0.82, 39, 43, ...RED_BODY);
    box(0.26, 0.26, 0.74, 0.74, 43, 45, ...RED_HI);
    box(0.44, 0.44, 0.56, 0.56, 45, 47.5, ...CHROME_HI); // center keylock
  });
}

export function buildSuiteBedSprite(rot = 0) {
  const FRAME = ['#4e2a14', '#381c0c', '#241006'];
  const TUFT = ['#382012', '#28140a', '#180a04'];
  const TUFT_CREASE = ['#5c341c', '#442412', '#2e160a'];
  const SHEET = ['#faf8f4', '#e2ded4', '#beb8aa'];
  const DUVET = ['#3b6aa8', '#2a4e82', '#1a3258'];
  const DUVET_HI = ['#5a8ad0', '#3b6aa8', '#264878'];
  const RUNNER = ['#8c2438', '#681424', '#480c16'];
  const PILLOW = ['#ffffff', '#f1f5f9', '#cbd5e1'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];

  return isoSprite(2, 2, 38, (box) => {
    // 1. King platform bed frame plinth (z = 0 .. 7)
    box(0.06, 0.06, 1.94, 1.94, 0, 7, ...FRAME);

    // 2. Thick plush mattress with fitted sheet (z = 7 .. 15)
    box(0.10, 0.10, 1.90, 1.90, 7, 15, ...SHEET);

    if (rot % 2 === 0) {
      // Tall upholstered headboard with vertical channel tufting seams (z = 7 .. 36)
      box(0.06, 0.06, 1.94, 0.28, 7, 36, ...FRAME);
      box(0.08, 0.08, 1.92, 0.26, 9, 34, ...TUFT);
      // Vertical stitch channels at 2x density
      for (let ch = 0.32; ch < 1.70; ch += 0.28) {
        box(ch, 0.07, ch + 0.04, 0.27, 9, 34, ...TUFT_CREASE);
      }

      // Duvet draped over lower 65% of bed (z = 8 .. 16)
      box(0.10, 0.68, 1.90, 1.90, 8, 15.5, ...DUVET);
      // Turn-down top sheet fold
      box(0.10, 0.60, 1.90, 0.70, 14.5, 16, ...SHEET);
      // Contrasting velvet bed runner along foot of bed
      box(0.10, 1.55, 1.90, 1.82, 15.2, 16.2, ...RUNNER);

      // 4 sleeping pillows (2 king base pillows + 2 accent pillows with center indents)
      box(0.18, 0.30, 0.94, 0.60, 15, 19, ...PILLOW);
      box(0.50, 0.42, 0.62, 0.48, 18.5, 19.2, '#94a3b8', '#64748b', '#475569'); // indent crease
      box(1.06, 0.30, 1.82, 0.60, 15, 19, ...PILLOW);
      box(1.38, 0.42, 1.50, 0.48, 18.5, 19.2, '#94a3b8', '#64748b', '#475569');

      // Accent burgundy throw pillows in front
      box(0.30, 0.52, 0.74, 0.68, 16, 21, ...RUNNER);
      box(1.26, 0.52, 1.70, 0.68, 16, 21, ...RUNNER);
    } else {
      box(0.06, 0.06, 0.28, 1.94, 7, 36, ...FRAME);
      box(0.08, 0.08, 0.26, 1.92, 9, 34, ...TUFT);
      for (let ch = 0.32; ch < 1.70; ch += 0.28) {
        box(0.07, ch, 0.27, ch + 0.04, 9, 34, ...TUFT_CREASE);
      }

      box(0.68, 0.10, 1.90, 1.90, 8, 15.5, ...DUVET);
      box(0.60, 0.10, 0.70, 1.90, 14.5, 16, ...SHEET);
      box(1.55, 0.10, 1.82, 1.90, 15.2, 16.2, ...RUNNER);

      box(0.30, 0.18, 0.60, 0.94, 15, 19, ...PILLOW);
      box(0.42, 0.50, 0.48, 0.62, 18.5, 19.2, '#94a3b8', '#64748b', '#475569');
      box(0.30, 1.06, 0.60, 1.82, 15, 19, ...PILLOW);
      box(0.42, 1.38, 0.48, 1.50, 18.5, 19.2, '#94a3b8', '#64748b', '#475569');

      box(0.52, 0.30, 0.68, 0.74, 16, 21, ...RUNNER);
      box(0.52, 1.26, 0.68, 1.70, 16, 21, ...RUNNER);
    }
  });
}

export function buildTreadmillSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [2, 1] : [1, 2];
  const FRAME = ['#4a505e', '#363a46', '#222630'];
  const BELT = ['#1e2026', '#14161a', '#0c0e10'];
  const STRIPE = ['#f4f6fa', '#d0d4de', '#9ea4b0'];
  const CONSOLE = ['#2a2e38', '#1c2028', '#101218'];
  const SCREEN = ['#00e5ff', '#00b4d8', '#0077b6'];
  const RED_KEY = ['#ff3b30', '#d32f2f', '#9a0007'];

  return isoSprite(tw, th, 44, (box) => {
    // Heavy base chassis & motor housing at front
    box(0.08, 0.08, tw - 0.08, th - 0.08, 0, 5, ...FRAME);

    if (tw >= th) {
      // 2x1 configuration (runs along u axis)
      // Front motor hood
      box(0.06, 0.08, 0.38, th - 0.08, 4, 12, ...FRAME);
      // Textured rubber running belt with center lane guide stripes
      box(0.36, 0.16, tw - 0.08, th - 0.16, 4, 6, ...BELT);
      box(0.38, 0.46, tw - 0.10, 0.54, 6, 6.4, ...STRIPE);
      // Extruded aluminum side foot rails with grip ridges
      box(0.36, 0.08, tw - 0.08, 0.16, 5, 7, '#747c8c', '#545a68', '#383e48');
      box(0.36, th - 0.16, tw - 0.08, th - 0.08, 5, 7, '#747c8c', '#545a68', '#383e48');

      // Tubular steel upright support arms
      box(0.18, 0.10, 0.28, 0.20, 5, 36, ...FRAME);
      box(0.18, th - 0.20, 0.28, th - 0.10, 5, 36, ...FRAME);
      // Handrails with pulse sensor pads
      box(0.26, 0.12, 0.65, 0.18, 33, 36, '#282c34', '#1c2026', '#101216');
      box(0.26, th - 0.18, 0.65, th - 0.12, 33, 36, '#282c34', '#1c2026', '#101216');

      // Wide angled digital dashboard console
      box(0.10, 0.10, 0.32, th - 0.10, 34, 40, ...CONSOLE);
      // Glowing color LCD workout screen
      box(0.14, 0.20, 0.28, th - 0.20, 40, 42, ...SCREEN);
      // Red magnetic safety key
      box(0.20, 0.45, 0.26, 0.55, 39, 41, ...RED_KEY);
    } else {
      // 1x2 configuration (runs along v axis)
      box(0.08, 0.06, tw - 0.08, 0.38, 4, 12, ...FRAME);
      box(0.16, 0.36, tw - 0.16, th - 0.08, 4, 6, ...BELT);
      box(0.46, 0.38, 0.54, th - 0.10, 6, 6.4, ...STRIPE);
      box(0.08, 0.36, 0.16, th - 0.08, 5, 7, '#747c8c', '#545a68', '#383e48');
      box(tw - 0.16, 0.36, tw - 0.08, th - 0.08, 5, 7, '#747c8c', '#545a68', '#383e48');

      box(0.10, 0.18, 0.20, 0.28, 5, 36, ...FRAME);
      box(tw - 0.20, 0.18, tw - 0.10, 0.28, 5, 36, ...FRAME);
      box(0.12, 0.26, 0.18, 0.65, 33, 36, '#282c34', '#1c2026', '#101216');
      box(tw - 0.18, 0.26, tw - 0.12, 0.65, 33, 36, '#282c34', '#1c2026', '#101216');

      box(0.10, 0.10, tw - 0.10, 0.32, 34, 40, ...CONSOLE);
      box(0.20, 0.14, tw - 0.20, 0.28, 40, 42, ...SCREEN);
      box(0.45, 0.20, 0.55, 0.26, 39, 41, ...RED_KEY);
    }
  });
}

export function buildWeightBenchSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [2, 1] : [1, 2];
  const STEEL = ['#7c8496', '#5e6474', '#424856'];
  const PAD = ['#242830', '#181c22', '#101216'];
  const RED_ACCENT = ['#e53935', '#c62828', '#8e0000'];
  const CHROME = ['#e4eaf2', '#bcc4d2', '#88909e'];
  const PLATE = ['#22262e', '#161a20', '#0e1014'];

  return isoSprite(tw, th, 40, (box) => {
    // 1. Heavy boxed steel base frame
    box(0.24, 0.16, tw - 0.24, th - 0.16, 0, 8, ...STEEL);

    if (tw >= th) {
      // Far upright barbell post
      box(0.12, 0.16, 0.22, 0.28, 0, 32, ...STEEL);
      box(0.10, 0.14, 0.24, 0.30, 27, 30, ...RED_ACCENT);

      // Thick dense foam bench pad with red stitching borders
      box(0.20, 0.12, tw - 0.20, th - 0.12, 8, 13, ...PAD);
      stitching(box, 0.20, 0.12, tw - 0.20, th - 0.12, 12.8, { piping: RED_ACCENT, pipingHeight: 0.8 });

      // Near upright barbell post
      box(0.12, th - 0.28, 0.22, th - 0.16, 0, 32, ...STEEL);
      box(0.10, th - 0.30, 0.24, th - 0.14, 27, 30, ...RED_ACCENT);

      // Knurled barbell & loaded Olympic plates resting on hooks
      box(0.14, 0.02, 0.20, th - 0.02, 29, 31, ...CHROME);
      box(0.10, 0.03, 0.24, 0.12, 23, 37, ...PLATE);
      box(0.10, th - 0.12, 0.24, th - 0.03, 23, 37, ...PLATE);
    } else {
      // Both upright barbell posts are at the far end (v = 0.12 .. 0.22)
      box(0.16, 0.12, 0.28, 0.22, 0, 32, ...STEEL);
      box(tw - 0.28, 0.12, tw - 0.16, 0.22, 0, 32, ...STEEL);
      box(0.14, 0.10, 0.30, 0.24, 27, 30, ...RED_ACCENT);
      box(tw - 0.30, 0.10, tw - 0.14, 0.24, 27, 30, ...RED_ACCENT);

      box(0.02, 0.14, tw - 0.02, 0.20, 29, 31, ...CHROME);
      box(0.03, 0.10, 0.12, 0.24, 23, 37, ...PLATE);
      box(tw - 0.12, 0.10, tw - 0.03, 0.24, 23, 37, ...PLATE);

      // Bench pad extends towards the near viewer side (v = 0.22 .. th - 0.12)
      box(0.20, 0.18, tw - 0.20, th - 0.12, 8, 13, ...PAD);
      stitching(box, 0.20, 0.18, tw - 0.20, th - 0.12, 12.8, { piping: RED_ACCENT, pipingHeight: 0.8 });
    }
  });
}

export function buildDumbbellRackSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const RACK = ['#565e6e', '#3e4452', '#262a34'];
  const CHROME = ['#e6edf6', '#c0c8d6', '#8e96a4'];
  const HEX_IRON = ['#22262e', '#161a20', '#0c0e12'];

  return isoSprite(tw, th, 34, (box) => {
    // A-frame angled heavy steel uprights
    box(0.08, 0.10, tw - 0.08, th - 0.10, 0, 6, ...RACK);

    if (tw >= th) {
      // Lower and upper angled dumbbell trays
      box(0.10, 0.14, tw - 0.10, th - 0.14, 6, 12, ...RACK);
      box(0.12, 0.12, tw - 0.12, th - 0.30, 14, 20, ...RACK);

      // Array of paired hex dumbbells graduating in size
      for (let i = 0; i < 4; i++) {
        const u = 0.20 + i * 0.44;
        const size = 0.12 + i * 0.02;
        // Dumbbell on lower tier
        box(u - size, 0.52, u + size, 0.84, 12, 18, ...HEX_IRON);
        box(u - 0.03, 0.58, u + 0.03, 0.78, 18, 20, ...CHROME);
        // Dumbbell on upper tier
        box(u - size * 0.85, 0.16, u + size * 0.85, 0.44, 20, 25, ...HEX_IRON);
        box(u - 0.03, 0.22, u + 0.03, 0.38, 25, 27, ...CHROME);
      }
    } else {
      box(0.14, 0.10, tw - 0.14, th - 0.10, 6, 12, ...RACK);
      box(0.12, 0.12, tw - 0.30, th - 0.12, 14, 20, ...RACK);

      for (let i = 0; i < 4; i++) {
        const v = 0.20 + i * 0.44;
        const size = 0.12 + i * 0.02;
        box(0.52, v - size, 0.84, v + size, 12, 18, ...HEX_IRON);
        box(0.58, v - 0.03, 0.78, v + 0.03, 18, 20, ...CHROME);
        box(0.16, v - size * 0.85, 0.44, v + size * 0.85, 20, 25, ...HEX_IRON);
        box(0.22, v - 0.03, 0.38, v + 0.03, 25, 27, ...CHROME);
      }
    }
  });
}

export function buildYogaMatSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [2, 1] : [1, 2];
  const MAT = ['#a87ae6', '#875ac4', '#5c3894'];
  const MAT_DARK = ['#7c4ebc', '#60389c', '#442474'];
  const TRIM = ['#5eead4', '#2dd4bf', '#14b8a6'];
  const TOWEL = ['#ffffff', '#f1f5f9', '#cbd5e1'];

  return isoSprite(tw, th, 8, (box) => {
    // 1. Unrolled textured yoga mat body (z = 0 .. 2)
    box(0.10, 0.08, tw - 0.10, th - 0.08, 0, 2, ...MAT);

    // Embossed center alignment grip lines at 2x density
    if (tw > th) {
      box(0.30, 0.47, tw - 0.30, 0.53, 1.8, 2.3, ...TRIM);
      box(tw / 2 - 0.10, 0.25, tw / 2 + 0.10, 0.75, 1.8, 2.3, ...TRIM);
      // Partially rolled end showing thickness & strap
      box(0.08, 0.08, 0.28, th - 0.08, 2, 7, ...MAT_DARK);
      box(0.12, 0.07, 0.24, th - 0.07, 2, 6, ...MAT);
      box(0.16, 0.06, 0.20, th - 0.06, 2, 7.5, '#1e293b', '#0f172a', '#020617'); // strap
      // Rolled white spa towel on mat
      box(0.34, 0.26, 0.58, 0.74, 2, 5.5, ...TOWEL);
    } else {
      box(0.47, 0.30, 0.53, th - 0.30, 1.8, 2.3, ...TRIM);
      box(0.25, th / 2 - 0.10, 0.75, th / 2 + 0.10, 1.8, 2.3, ...TRIM);
      box(0.08, 0.08, tw - 0.08, 0.28, 2, 7, ...MAT_DARK);
      box(0.07, 0.12, tw - 0.07, 0.24, 2, 6, ...MAT);
      box(0.06, 0.16, tw - 0.06, 0.20, 2, 7.5, '#1e293b', '#0f172a', '#020617');
      box(0.26, 0.34, 0.74, 0.58, 2, 5.5, ...TOWEL);
    }
  });
}

export function buildDiningTableSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const WALNUT = ['#6e4228', '#54301a', '#3c2010'];
  const LINEN = ['#fbf8f2', '#e2dcd0', '#bab2a4'];
  const GOLD = ['#f6c862', '#d4a23c', '#986e1c'];

  return isoSprite(tw, th, 36, (box) => {
    // 4 sturdy turned walnut table legs with mortise corner brackets (z = 0 .. 18)
    const legCoords = [
      [0.10, 0.12, 0.22, 0.24],
      [tw - 0.22, 0.12, tw - 0.10, 0.24],
      [0.10, th - 0.24, 0.22, th - 0.12],
      [tw - 0.22, th - 0.24, tw - 0.10, th - 0.12]
    ];
    for (const [u0, v0, u1, v1] of legCoords) {
      box(u0, v0, u1, v1, 0, 18, ...WALNUT);
    }
    // Under-table apron rails
    box(0.12, 0.14, tw - 0.12, th - 0.14, 14, 18, shade(WALNUT[0], -0.1), shade(WALNUT[1], -0.1), shade(WALNUT[2], -0.1));

    // Hardwood tabletop planks with grain and bevelled perimeter (z = 18 .. 22)
    planks(box, 0.04, 0.06, tw - 0.04, th - 0.06, 18, 22, {
      dir: tw >= th ? 'v' : 'u',
      count: 3,
      gap: 0.02,
      wood: WALNUT,
      grainDetail: true,
    });

    // Central woven linen table runner with gold stitched edge (z = 22 .. 23)
    if (tw >= th) {
      box(0.02, 0.25, tw - 0.02, th - 0.25, 22, 23, ...LINEN);
      box(0.02, 0.25, tw - 0.02, 0.27, 22.8, 23.2, ...GOLD);
      box(0.02, th - 0.27, tw - 0.02, th - 0.25, 22.8, 23.2, ...GOLD);
    } else {
      box(0.25, 0.02, tw - 0.25, th - 0.02, 22, 23, ...LINEN);
      box(0.25, 0.02, 0.27, th - 0.02, 22.8, 23.2, ...GOLD);
      box(tw - 0.27, 0.02, tw - 0.25, th - 0.02, 22.8, 23.2, ...GOLD);
    }

    // Elegant brass floral centerpiece vase
    box(tw / 2 - 0.08, th / 2 - 0.08, tw / 2 + 0.08, th / 2 + 0.08, 23, 30, ...GOLD);
    box(tw / 2 - 0.05, th / 2 - 0.05, tw / 2 + 0.05, th / 2 + 0.05, 30, 34, '#ff6b8b', '#d84a68', '#a82c48'); // rose bud

    // Two porcelain dinner place settings
    const [px, py] = rot % 2 ? [tw / 2, th / 2 - 0.5] : [tw / 2 - 0.5, th / 2];
    for (const s of [-1, 1]) {
      const x = rot % 2 ? px : px + s * 0.36;
      const y = rot % 2 ? py + s * 0.36 : py;
      box(x - 0.12, y - 0.12, x + 0.12, y + 0.12, 23, 24.2, '#ffffff', '#e8e6e0', '#c8c4be');
      box(x - 0.08, y - 0.08, x + 0.08, y + 0.08, 24, 24.6, '#f4f6fa', '#dcdfe6', '#b0b6c2');
    }
  });
}

export function buildDiningChairSprite(rot = 0, layer = 'all') {
  const r = ((rot % 4) + 4) % 4;
  const VELVET = ['#c83e58', '#a22840', '#721428'];
  const PIPING = ['#f4c862', '#d2a03c', '#986c1c'];
  const WALNUT = ['#5a341e', '#422414', '#2c160c'];
  const GOLD = ['#f4c862', '#d4a034', '#986c1c'];

  return isoSprite(1, 1, 36, (box) => {
    const drawBack = layer === 'all' || layer === 'back';
    const drawFront = layer === 'all' || layer === 'front';

    if (drawBack) {
      // 4 slender tapered legs with polished gold ferrules (z = 0 .. 10)
      const legCoords = [
        [0.20, 0.20, 0.30, 0.30],
        [0.70, 0.20, 0.80, 0.30],
        [0.20, 0.70, 0.30, 0.80],
        [0.70, 0.70, 0.80, 0.80]
      ];
      for (const [u0, v0, u1, v1] of legCoords) {
        box(u0, v0, u1, v1, 0, 10, ...WALNUT);
        box(u0 - 0.01, v0 - 0.01, u1 + 0.01, v1 + 0.01, 0, 2.5, ...GOLD);
      }

      // Plush velvet seat cushion with gold piping rim
      box(0.18, 0.18, 0.82, 0.82, 10, 15, ...VELVET);
      stitching(box, 0.18, 0.18, 0.82, 0.82, 14.5, { piping: PIPING, pipingHeight: 0.8 });

      // Curved upholstered backrest with gold piping frame
      if (r === 0) {
        box(0.18, 0.16, 0.82, 0.30, 15, 34, ...VELVET);
        box(0.18, 0.14, 0.82, 0.20, 32, 35, ...PIPING);
        box(0.48, 0.28, 0.52, 0.32, 16, 32, ...PIPING); // vertical center flute seam
      } else if (r === 1) {
        box(0.16, 0.18, 0.30, 0.82, 15, 34, ...VELVET);
        box(0.14, 0.18, 0.20, 0.82, 32, 35, ...PIPING);
        box(0.28, 0.48, 0.32, 0.52, 16, 32, ...PIPING);
      }
    }

    if (drawFront) {
      if (r === 2) {
        box(0.18, 0.70, 0.82, 0.84, 15, 34, ...VELVET);
        box(0.18, 0.80, 0.82, 0.86, 32, 35, ...PIPING);
      } else if (r === 3) {
        box(0.70, 0.18, 0.84, 0.82, 15, 34, ...VELVET);
        box(0.80, 0.18, 0.86, 0.82, 32, 35, ...PIPING);
      }
    }
  });
}

export function buildBuffetCounterSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  const CABINET = ['#381e14', '#26120a', '#180a04'];
  const MARBLE = ['#f6f0e4', '#dcd2c0', '#b2a692'];
  const MARBLE_HI = ['#ffffff', '#f4ede2', '#dcd0be'];
  const STEEL = ['#d8e2ec', '#b0bcc8', '#808c98'];
  const CHAFING = ['#eaf0f6', '#c4d0dc', '#94a0b0'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];
  const GLASS = ['#dcf6fa', '#aee4ec', '#7ac4ce'];
  const HEAT = ['#ff8a38', '#e05818', '#a03808'];

  return isoSprite(tw, th, 44, (box) => {
    // 1. Dark wood base cabinet with panelled doors (z = 0 .. 22)
    box(0.06, 0.10, tw - 0.06, th - 0.10, 0, 22, ...CABINET);

    // Front panels & brass handles
    if (tw > th) {
      for (let p = 0; p < 3; p++) {
        const px0 = 0.10 + p * 0.94;
        const px1 = px0 + 0.84;
        box(px0, 0.09, px1, 0.11, 4, 20, '#4a281c', '#341a10', '#221008');
        box((px0 + px1) / 2 - 0.03, 0.08, (px0 + px1) / 2 + 0.03, 0.10, 10, 14, ...BRASS);
      }
    } else {
      for (let p = 0; p < 3; p++) {
        const py0 = 0.10 + p * 0.94;
        const py1 = py0 + 0.84;
        box(0.09, py0, 0.11, py1, 4, 20, '#4a281c', '#341a10', '#221008');
        box(0.08, (py0 + py1) / 2 - 0.03, 0.10, (py0 + py1) / 2 + 0.03, 10, 14, ...BRASS);
      }
    }

    // 2. Polished white marble counter top with bevelled edge (z = 22 .. 26)
    box(0.02, 0.06, tw - 0.02, th - 0.06, 22, 25, ...MARBLE);
    box(0.01, 0.05, tw - 0.01, th - 0.05, 25, 26, ...MARBLE_HI);

    // 3. Three roll-top stainless steel chafing dishes with domed covers
    for (let i = 0; i < 3; i++) {
      const t = 0.20 + i * 0.92;
      const x = rot % 2 ? 0.20 : t;
      const y = rot % 2 ? t : 0.20;
      const spanW = rot % 2 ? 0.60 : 0.68;
      const spanH = rot % 2 ? 0.68 : 0.60;

      // Water pan warming stand & legs
      box(x, y, x + spanW, y + spanH, 26, 28, ...STEEL);
      // Food pan with golden roasted meats/pasta
      box(x + 0.04, y + 0.04, x + spanW - 0.04, y + spanH - 0.04, 27, 29, '#e09838', '#b87420', '#844c10');
      // Polished domed roll-top lid
      box(x + 0.02, y + 0.02, x + spanW - 0.02, y + spanH - 0.02, 29, 34, ...CHAFING);
      // Heat-resistant lid handle
      box(x + spanW / 2 - 0.08, y + spanH / 2 - 0.04, x + spanW / 2 + 0.08, y + spanH / 2 + 0.04, 34, 36, ...BRASS);
    }

    // 4. Sneeze guard glass canopy with brass support struts (z = 26 .. 43)
    if (tw > th) {
      box(0.06, 0.10, 0.10, 0.14, 26, 42, ...BRASS);
      box(tw - 0.10, 0.10, tw - 0.06, 0.14, 26, 42, ...BRASS);
      box(0.04, 0.12, tw - 0.04, 0.16, 40, 43, ...GLASS);
      // Overhead heat lamp warming strip
      box(0.18, 0.14, tw - 0.18, 0.20, 39, 41, ...HEAT);
    } else {
      box(0.10, 0.06, 0.14, 0.10, 26, 42, ...BRASS);
      box(0.10, th - 0.10, 0.14, th - 0.06, 26, 42, ...BRASS);
      box(0.12, 0.04, 0.16, th - 0.04, 40, 43, ...GLASS);
      box(0.14, 0.18, 0.20, th - 0.18, 39, 41, ...HEAT);
    }
  });
}

export function buildChefStationSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#d8dfe8', '#b0b8c4', '#7e8694'];
  const STEEL_HI = ['#ffffff', '#eaf0f6', '#c4ced8'];
  const GRILL = ['#282c34', '#1c1f24', '#101216'];
  const GRILL_HOT = ['#404652', '#2c323c', '#1a1e24'];
  const TEAK = ['#5a341e', '#422414', '#2c1408'];
  const FLAME = ['#ff8830', '#e04018', '#a01808'];

  return isoSprite(tw, th, 42, (box) => {
    // 1. Commercial stainless steel cabinet chassis (z = 0 .. 24)
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 24, ...STEEL);
    // Lower utility kickplate & louvers
    box(0.07, 0.07, tw - 0.07, 0.09, 2, 8, '#262a32', '#1a1c22', '#101216');

    // 2. Surrounding solid teak dining ledge
    box(0.02, 0.04, tw - 0.02, th - 0.04, 23, 26, ...TEAK);

    // 3. Heavy Japanese teppanyaki flat-top steel plancha griddle
    const [gx0, gy0, gx1, gy1] = tw > th
      ? [0.12, 0.16, tw * 0.65, th - 0.14]
      : [0.16, 0.12, tw - 0.14, th * 0.65];

    box(gx0 - 0.02, gy0 - 0.02, gx1 + 0.02, gy1 + 0.02, 25, 27, ...GRILL); // grease trough
    box(gx0, gy0, gx1, gy1, 26, 28, ...GRILL_HOT); // hot plancha surface
    // Sizzling steak / seafood searing on grill
    box(gx0 + 0.14, gy0 + 0.10, gx0 + 0.36, gy0 + 0.28, 28, 30, '#8c3822', '#6c2814', '#4c1808');

    // 4. Chef's squeeze bottles & stainless spatula
    const [bx, by] = tw > th
      ? [tw * 0.72, 0.25 * th]
      : [0.25 * tw, th * 0.72];

    // Red sriracha bottle
    box(bx, by, bx + 0.10, by + 0.10, 26, 34, '#ef4444', '#dc2626', '#991b1b');
    box(bx + 0.03, by + 0.03, bx + 0.07, by + 0.07, 34, 37, ...STEEL_HI);
    // Yellow oil bottle
    box(bx + 0.14, by, bx + 0.24, by + 0.10, 26, 34, '#eab308', '#ca8a04', '#854d0e');
    box(bx + 0.17, by + 0.03, bx + 0.21, by + 0.07, 34, 37, ...STEEL_HI);
    // Stainless teppan turner spatula
    box(bx + 0.04, by + 0.18, bx + 0.22, by + 0.28, 26, 28, ...STEEL_HI);
    box(bx + 0.10, by + 0.28, bx + 0.16, by + 0.38, 27, 29, ...TEAK); // wood handle
  });
}

export function buildPoolWaterSprite(rot = 0) {
  const WATER = ['#40d0e4', '#24a8c0', '#14748c'];
  const DEEP = ['#2090ac', '#146e84', '#0c485c'];
  const FOAM = ['#c8f8ff', '#94e8f6', '#64c0d4'];
  const LANE_LINE = ['#ffffff', '#d8f0f6', '#a4d4e0'];
  return isoSprite(2, 2, 7, (box) => {
    // 1. Deep water basin bottom
    box(0.01, 0.01, 1.99, 1.99, 0, 2, ...DEEP);
    // 2. Pool lane bottom marker line (drawn on bottom tiles BEFORE water)
    if (rot % 2 === 0) {
      box(0.85, 0.02, 1.15, 1.98, 1, 2, ...LANE_LINE);
    } else {
      box(0.02, 0.85, 1.98, 1.15, 1, 2, ...LANE_LINE);
    }
    // 3. Translucent shimmering pool water
    box(0.01, 0.01, 1.99, 1.99, 2, 5, ...WATER);
    // 4. Animated surface ripples / caustics
    box(0.30, 0.40, 0.90, 0.60, 5, 6, ...FOAM);
    box(1.10, 1.30, 1.70, 1.50, 5, 6, ...FOAM);
    box(0.55, 1.05, 0.75, 1.15, 5, 5.6, ...FOAM);
    box(1.45, 0.25, 1.65, 0.35, 5, 5.6, ...FOAM);
    box(0.15, 1.6, 0.3, 1.7, 5, 5.6, ...FOAM);
  });
}

export function buildSaunaCabinSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const CEDAR = ['#d48c52', '#b06c36', '#804a1e'];
  const CEDAR_DARK = ['#9e5c2c', '#7c441c', '#5a3012'];
  const CEDAR_HI = ['#f0aa6c', '#d48c52', '#a06432'];
  const GLASS = ['#e09848', '#b87428', '#845014'];
  const STOVE = ['#282c34', '#1c1f24', '#101216'];
  const ROCK = ['#444852', '#30343c', '#202228'];
  const GLOW = ['#ff8830', '#e04810', '#a02804'];

  return isoSprite(tw, th, 58, (box) => {
    // 1. Back and side cedar plank walls (enclosure structure)
    // Back wall
    box(0.06, 0.08, tw - 0.06, 0.18, 0, 52, ...CEDAR);
    // Left side wall
    box(0.06, 0.18, 0.16, th - 0.08, 0, 52, ...CEDAR);
    // Right side wall
    box(tw - 0.16, 0.18, tw - 0.06, th - 0.08, 0, 52, ...CEDAR);

    // 2. Interior sauna features (visible through front entrance)
    // Slatted cedar interior benches against back wall
    box(0.18, 0.18, tw - 0.18, 0.44, 10, 15, ...CEDAR_HI); // lower bench
    box(0.18, 0.18, tw - 0.18, 0.32, 22, 27, ...CEDAR_HI); // upper bench

    // Volcanic stone stove with glowing heater elements
    const [sx, sy] = [0.20, th - 0.38];
    box(sx, sy, sx + 0.24, sy + 0.24, 0, 14, ...STOVE);
    box(sx + 0.02, sy + 0.02, sx + 0.22, sy + 0.22, 12, 14, ...GLOW); // glowing heating coil
    box(sx + 0.02, sy + 0.02, sx + 0.22, sy + 0.22, 14, 18, ...ROCK); // sauna stones

    // 3. Front wall facing viewer with bronze tempered glass observation door
    // Front corner pilasters
    box(0.06, th - 0.18, 0.18, th - 0.08, 0, 52, ...CEDAR);
    box(tw - 0.18, th - 0.18, tw - 0.06, th - 0.08, 0, 52, ...CEDAR);
    // Front door frame header
    box(0.18, th - 0.18, tw - 0.18, th - 0.08, 46, 52, ...CEDAR);

    // Bronze tempered glass observation door
    box(0.18, th - 0.16, tw - 0.18, th - 0.10, 2, 46, ...GLASS);

    // Cedar safety door handle on front
    box(tw / 2 + 0.08, th - 0.09, tw / 2 + 0.14, th - 0.06, 18, 32, ...CEDAR_HI);

    // 4. Overhanging carved cedar roof cornice (z = 52 .. 57)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 52, 55, ...CEDAR_DARK);
    box(0.02, 0.04, tw - 0.02, th - 0.04, 55, 57, ...CEDAR_HI);
  });
}

export function buildTowelRackSprite(rot = 0) {
  const BAMBOO = ['#dfc082', '#ba9a58', '#886c34'];
  const BAMBOO_HI = ['#f4d8a4', '#d8b878', '#a48444'];
  const TOWEL1 = ['#ffffff', '#dce4ec', '#b0bac6'];
  const TOWEL2 = ['#38bdf8', '#0ea5e9', '#0284c7'];
  const WICKER = ['#b88a54', '#946a38', '#6c4a20'];

  return isoSprite(1, 1, 44, (box) => {
    // 1. Far vertical bamboo frame corner posts (z = 0 .. 42)
    box(0.14, 0.14, 0.24, 0.24, 0, 42, ...BAMBOO);
    box(0.13, 0.13, 0.25, 0.25, 40, 42, ...BAMBOO_HI);
    box(0.76, 0.14, 0.86, 0.24, 0, 42, ...BAMBOO);
    box(0.75, 0.13, 0.87, 0.25, 40, 42, ...BAMBOO_HI);

    // 2. 3 slatted bamboo shelves
    box(0.16, 0.16, 0.84, 0.84, 8, 10, ...BAMBOO);
    box(0.16, 0.16, 0.84, 0.84, 20, 22, ...BAMBOO);
    box(0.16, 0.16, 0.84, 0.84, 32, 34, ...BAMBOO);

    // Bottom shelf: Woven wicker laundry hamper basket for used linen (z = 0 .. 8)
    box(0.20, 0.20, 0.80, 0.80, 0, 8, ...WICKER);
    box(0.22, 0.22, 0.78, 0.78, 7, 9, '#fafafa', '#e5e5e5', '#cccccc'); // linen peeking out

    // Middle shelf: Stack of rolled turquoise pool towels
    box(0.22, 0.24, 0.78, 0.48, 10, 17, ...TOWEL2);
    box(0.22, 0.52, 0.78, 0.76, 10, 17, ...TOWEL2);
    // Rolled spiral highlights on towel ends
    box(0.72, 0.26, 0.76, 0.46, 12, 15, '#bae6fd', '#7dd3fc', '#38bdf8');
    box(0.72, 0.54, 0.76, 0.74, 12, 15, '#bae6fd', '#7dd3fc', '#38bdf8');

    // Top shelf: Stack of fluffy rolled white spa towels
    box(0.22, 0.24, 0.78, 0.48, 22, 29, ...TOWEL1);
    box(0.22, 0.52, 0.78, 0.76, 22, 29, ...TOWEL1);
    box(0.72, 0.26, 0.76, 0.46, 24, 27, '#f8fafc', '#f1f5f9', '#e2e8f0');
    box(0.72, 0.54, 0.76, 0.74, 24, 27, '#f8fafc', '#f1f5f9', '#e2e8f0');

    // 3. Near vertical bamboo frame corner posts (drawn in front of shelves and towels)
    box(0.14, 0.76, 0.24, 0.86, 0, 42, ...BAMBOO);
    box(0.13, 0.75, 0.25, 0.87, 40, 42, ...BAMBOO_HI);
    box(0.76, 0.76, 0.86, 0.86, 0, 42, ...BAMBOO);
    box(0.75, 0.75, 0.87, 0.87, 40, 42, ...BAMBOO_HI);

    // 4. Folded guest hand towel hanging over front crossbar
    box(0.28, 0.78, 0.54, 0.86, 30, 36, ...TOWEL1);
  });
}

export function buildEspressoBarSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const COUNTER = ['#4a2c1a', '#341e12', '#20120a'];
  const MARBLE = ['#faf6ee', '#dfd8ca', '#b4ac9a'];
  const CHROME = ['#eaf0f6', '#c4d0dc', '#90a0b0'];
  const CHROME_HI = ['#ffffff', '#eef4f8', '#cbd7e2'];
  const COPPER = ['#e2884e', '#ba6630', '#844218'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];
  const GLASS = ['#d8f2ff', '#a8d4ec', '#74a0bc'];
  const BEANS = ['#382014', '#26140c', '#140804'];

  return isoSprite(tw, th, 44, (box) => {
    // 1. Dark walnut counter base (z = 0 .. 23)
    box(0.05, 0.08, tw - 0.05, th - 0.08, 0, 23, ...COUNTER);
    // Brushed brass toe kick
    box(0.06, 0.07, tw - 0.06, 0.09, 0, 3, ...BRASS);

    // 2. White marble counter top with bullnose edge (z = 23 .. 26)
    box(0.02, 0.04, tw - 0.02, th - 0.04, 23, 26, ...MARBLE);

    // 3. Commercial dual-group chrome & copper espresso machine
    const [mx0, my0] = [0.12 * tw, 0.18 * th];
    const [mw, mh] = tw > th ? [0.46, 0.58] : [0.58, 0.46];

    box(mx0, my0, mx0 + mw, my0 + mh, 26, 37, ...CHROME);
    box(mx0 + 0.04, my0 + 0.04, mx0 + mw - 0.04, my0 + mh - 0.04, 30, 36, ...COPPER); // front copper accent panel
    // Twin portafilters with black handles protruding forward
    box(mx0 + 0.08, my0 + mh - 0.04, mx0 + 0.16, my0 + mh + 0.08, 28, 30, '#1e293b', '#0f172a', '#020617');
    box(mx0 + mw - 0.16, my0 + mh - 0.04, mx0 + mw - 0.08, my0 + mh + 0.08, 28, 30, '#1e293b', '#0f172a', '#020617');
    // Twin dual circular brass pressure gauges
    box(mx0 + mw / 2 - 0.06, my0 + mh - 0.02, mx0 + mw / 2 + 0.06, my0 + mh + 0.01, 33, 36, ...BRASS);
    // Angled stainless steam wand
    box(mx0 + mw - 0.04, my0 + mh / 2 - 0.04, mx0 + mw + 0.04, my0 + mh / 2 + 0.04, 27, 33, ...CHROME_HI);

    // Cup warming tray on top with ceramic espresso demitasse cups
    box(mx0 + 0.04, my0 + 0.04, mx0 + mw - 0.04, my0 + mh - 0.04, 37, 38, ...CHROME);
    box(mx0 + 0.08, my0 + 0.08, mx0 + 0.18, my0 + 0.18, 38, 41, '#ffffff', '#f1f5f9', '#cbd5e1');
    box(mx0 + mw - 0.18, my0 + 0.08, mx0 + mw - 0.08, my0 + 0.18, 38, 41, '#ffffff', '#f1f5f9', '#cbd5e1');

    // 4. Commercial conical burr grinder with clear bean hopper
    const [gx, gy] = [0.65 * tw, 0.20 * th];
    const [gw, gh] = [0.22 * tw, 0.24 * th];
    box(gx, gy, gx + gw, gy + gh, 26, 33, '#262a32', '#1a1c22', '#101216'); // heavy matte grinder body
    box(gx + 0.02, gy + 0.02, gx + gw - 0.02, gy + gh - 0.02, 33, 38, ...GLASS); // clear hopper
    box(gx + 0.04, gy + 0.04, gx + gw - 0.04, gy + gh - 0.04, 33, 37, ...BEANS); // dark roast beans inside

    // 5. Stainless milk pitcher & knock box
    box(gx, gy + gh + 0.08, gx + 0.12, gy + gh + 0.20, 26, 31, ...CHROME_HI);
  });
}

export function buildCafeTableSprite(rot = 0) {
  const IRON = ['#303440', '#222630', '#161820'];
  const BRASS = ['#f4c862', '#d4a034', '#986c1c'];
  const MARBLE = ['#f8f6f0', '#dedad0', '#b4b0a4'];

  return isoSprite(1, 1, 30, (box) => {
    // 3-legged ornate cast-iron base with scrolled tripod feet (z = 0 .. 4)
    box(0.25, 0.25, 0.75, 0.75, 0, 4, ...IRON);
    // Fluted central iron pedestal column with brass trim ring (z = 4 .. 20)
    box(0.42, 0.42, 0.58, 0.58, 4, 20, ...IRON);
    box(0.40, 0.40, 0.60, 0.60, 8, 10, ...BRASS);
    box(0.38, 0.38, 0.62, 0.62, 19, 21, ...BRASS);

    // Polished circular Carrara marble top with brass bullnose rim (z = 21 .. 25)
    box(0.10, 0.10, 0.90, 0.90, 21, 25, ...MARBLE);
    box(0.08, 0.08, 0.92, 0.92, 23.8, 25, ...BRASS); // polished brass rim

    // Ceramic coffee cup on saucer with espresso foam
    box(0.40, 0.40, 0.60, 0.60, 25, 26, '#ffffff', '#e8e8e8', '#cccccc'); // saucer
    box(0.44, 0.44, 0.56, 0.56, 26, 29, '#ffffff', '#e8e8e8', '#cccccc'); // cup
    box(0.46, 0.46, 0.54, 0.54, 28, 29.2, '#6f4e37', '#4a3324', '#2d1e14'); // espresso crema
  });
}

export function buildPoolTableSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const MAHOGANY = ['#7c3626', '#5e2418', '#40140c'];
  const MAHOGANY_DARK = ['#52180e', '#3c1008', '#260804'];
  const BRASS = ['#f6c667', '#d8a442', '#a07424'];
  const BRASS_HI = ['#ffe898', '#e2b040', '#a87818'];
  const FELT = ['#228b48', '#186834', '#104622'];
  const CUSHION = ['#1a7038', '#125228', '#0c381a'];
  const POCKET_NET = ['#26221c', '#1a1612', '#0e0c08'];
  const ASH_WOOD = ['#e6caa0', '#c8aa80', '#9c7e5a'];

  return isoSprite(tw, th, 32, (box) => {
    // 1. 4 heavy fluted turned mahogany legs with polished brass toe boots (z = 0 .. 18)
    const legW = 0.22;
    const legPositions = [
      [0.08, 0.08],
      [tw - 0.08 - legW, 0.08],
      [0.08, th - 0.08 - legW],
      [tw - 0.08 - legW, th - 0.08 - legW],
    ];
    for (const [lx, ly] of legPositions) {
      box(lx, ly, lx + legW, ly + legW, 0, 3, ...BRASS); // brass leveler foot
      box(lx + 0.02, ly + 0.02, lx + legW - 0.02, ly + legW - 0.02, 3, 18, ...MAHOGANY); // turned fluted leg
      box(lx + 0.01, ly + 0.01, lx + legW - 0.01, ly + legW - 0.01, 8, 10, ...MAHOGANY_DARK); // decorative ring
    }

    // 2. Heavy hardwood cabinet apron (z = 16 .. 23)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 16, 23, ...MAHOGANY);
    // Apron lower bead moulding
    box(0.03, 0.05, tw - 0.03, th - 0.05, 16, 17.5, ...MAHOGANY_DARK);

    // 3. Side cue sticks in brass brackets along the apron
    if (tw > th) {
      // Cue stick 1 along front apron
      box(0.24, th - 0.05, tw - 0.24, th - 0.02, 18, 19.5, ...ASH_WOOD);
      box(0.20, th - 0.05, 0.24, th - 0.02, 17.5, 20, '#1a1a20', '#121216', '#08080a'); // rubber bumper
      box(tw - 0.28, th - 0.05, tw - 0.24, th - 0.02, 18, 19.5, '#40c4ff', '#2098d4', '#106090'); // chalked blue tip
      box(0.40, th - 0.06, 0.44, th - 0.01, 17, 20.5, ...BRASS_HI); // clip
      box(tw - 0.44, th - 0.06, tw - 0.40, th - 0.01, 17, 20.5, ...BRASS_HI); // clip
    } else {
      box(tw - 0.05, 0.24, tw - 0.02, th - 0.24, 18, 19.5, ...ASH_WOOD);
      box(tw - 0.05, 0.20, tw - 0.02, 0.24, 17.5, 20, '#1a1a20', '#121216', '#08080a');
      box(tw - 0.05, th - 0.28, tw - 0.02, th - 0.24, 18, 19.5, '#40c4ff', '#2098d4', '#106090');
      box(tw - 0.06, 0.40, tw - 0.01, 0.44, 17, 20.5, ...BRASS_HI);
      box(tw - 0.06, th - 0.44, tw - 0.01, th - 0.40, 17, 20.5, ...BRASS_HI);
    }

    // 4. Solid wood rail perimeter & cushions (z = 23 .. 26.5)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 23, 26, ...MAHOGANY);
    // Beveled green rubber cushions framing the playing area
    box(0.11, 0.13, tw - 0.11, th - 0.13, 24, 26, ...CUSHION);

    // 5. Worst wool green baize playing surface (z = 23 .. 25)
    box(0.14, 0.16, tw - 0.14, th - 0.16, 23, 25, ...FELT);

    // 6. Leather drop pocket nets (z = 21 .. 25) & Cast brass corner pocket irons (z = 25 .. 27)
    const pocketSize = 0.12;
    const pockets = tw > th ? [
      [0.05, 0.07], // NW corner
      [tw / 2 - pocketSize / 2, 0.06], // N center
      [tw - 0.05 - pocketSize, 0.07], // NE corner
      [0.05, th - 0.07 - pocketSize], // SW corner
      [tw / 2 - pocketSize / 2, th - 0.06 - pocketSize], // S center
      [tw - 0.05 - pocketSize, th - 0.07 - pocketSize], // SE corner
    ] : [
      [0.07, 0.05],
      [0.06, th / 2 - pocketSize / 2],
      [0.07, th - 0.05 - pocketSize],
      [tw - 0.07 - pocketSize, 0.05],
      [tw - 0.06 - pocketSize, th / 2 - pocketSize / 2],
      [tw - 0.07 - pocketSize, th - 0.05 - pocketSize],
    ];

    for (const [px, py] of pockets) {
      box(px + 0.01, py + 0.01, px + pocketSize - 0.01, py + pocketSize - 0.01, 21, 25, ...POCKET_NET); // leather drop pocket
      box(px, py, px + pocketSize, py + pocketSize, 25.5, 27, ...BRASS_HI); // polished brass pocket casting
    }

    // 7. Head string / baulk line & Balls on baize (z = 25 .. 27.5)
    if (tw > th) {
      // Baulk line
      box(tw * 0.70, 0.17, tw * 0.70 + 0.02, th - 0.17, 25, 25.4, '#ffffff', '#e0f0e8', '#b8d0c0');
      // Cue ball at head spot
      box(tw * 0.72, th * 0.46, tw * 0.72 + 0.08, th * 0.46 + 0.08, 25, 27.2, '#ffffff', '#f4f4f4', '#dcdcdc');

      // Racked 15-ball triangular cluster at foot spot (tw * 0.30, th * 0.46)
      const balls = [
        // apex
        { u: tw * 0.38, v: th * 0.47, c: ['#ffdd00', '#d4b400', '#988000'] }, // 1-ball solid yellow
        // row 2
        { u: tw * 0.34, v: th * 0.42, c: ['#2563eb', '#1d4ed8', '#1e3a8a'] }, // 2 solid blue
        { u: tw * 0.34, v: th * 0.52, c: ['#dc2626', '#b91c1c', '#7f1d1d'] }, // 3 solid red
        // row 3
        { u: tw * 0.30, v: th * 0.37, c: ['#9333ea', '#7e22ce', '#581c87'] }, // 4 solid purple
        { u: tw * 0.30, v: th * 0.47, c: ['#18181b', '#09090b', '#000000'] }, // 8-ball black center
        { u: tw * 0.30, v: th * 0.57, c: ['#ea580c', '#c2410c', '#7c2d12'] }, // 5 solid orange
        // row 4
        { u: tw * 0.26, v: th * 0.32, c: ['#16a34a', '#15803d', '#14532d'] }, // 6 solid green
        { u: tw * 0.26, v: th * 0.42, c: ['#be123c', '#9f1239', '#881337'] }, // 7 solid maroon
        { u: tw * 0.26, v: th * 0.52, c: ['#fef08a', '#eab308', '#a16207'] }, // 9 stripe yellow
        { u: tw * 0.26, v: th * 0.62, c: ['#93c5fd', '#3b82f6', '#1d4ed8'] }, // 10 stripe blue
      ];
      for (const b of balls) {
        box(b.u, b.v, b.u + 0.07, b.v + 0.07, 25, 27, ...b.c);
      }
    } else {
      box(0.17, th * 0.70, tw - 0.17, th * 0.70 + 0.02, 25, 25.4, '#ffffff', '#e0f0e8', '#b8d0c0');
      box(tw * 0.46, th * 0.72, tw * 0.46 + 0.08, th * 0.72 + 0.08, 25, 27.2, '#ffffff', '#f4f4f4', '#dcdcdc');
      const balls = [
        { u: tw * 0.47, v: th * 0.38, c: ['#ffdd00', '#d4b400', '#988000'] },
        { u: tw * 0.42, v: th * 0.34, c: ['#2563eb', '#1d4ed8', '#1e3a8a'] },
        { u: tw * 0.52, v: th * 0.34, c: ['#dc2626', '#b91c1c', '#7f1d1d'] },
        { u: tw * 0.37, v: th * 0.30, c: ['#9333ea', '#7e22ce', '#581c87'] },
        { u: tw * 0.47, v: th * 0.30, c: ['#18181b', '#09090b', '#000000'] },
        { u: tw * 0.57, v: th * 0.30, c: ['#ea580c', '#c2410c', '#7c2d12'] },
        { u: tw * 0.32, v: th * 0.26, c: ['#16a34a', '#15803d', '#14532d'] },
        { u: tw * 0.42, v: th * 0.26, c: ['#be123c', '#9f1239', '#881337'] },
        { u: tw * 0.52, v: th * 0.26, c: ['#fef08a', '#eab308', '#a16207'] },
        { u: tw * 0.62, v: th * 0.26, c: ['#93c5fd', '#3b82f6', '#1d4ed8'] },
      ];
      for (const b of balls) {
        box(b.u, b.v, b.u + 0.07, b.v + 0.07, 25, 27, ...b.c);
      }
    }
  });
}

export function buildComputerDeskSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const OAK = ['#c48848', '#a06a32', '#764a1e'];
  const CHASSIS = ['#2a2e38', '#1c2028', '#101216'];
  const SCREEN = ['#00e5ff', '#00b4d8', '#0077b6'];
  const HANDLE = ['#d8e0ea', '#b0b8c4', '#848c98'];

  return isoSprite(tw, th, 42, (box) => {
    // Solid timber desk gable legs & modesty panel (z = 0 .. 22)
    box(0.06, 0.08, tw - 0.06, th - 0.08, 0, 22, ...OAK);

    if (tw >= th) {
      // Pedestal drawer bank on the right side
      box(tw - 0.70, 0.10, tw - 0.08, th - 0.10, 2, 21, shade(OAK[0], -0.1), shade(OAK[1], -0.1), shade(OAK[2], -0.1));
      // 3 drawer bar handles
      for (const dz of [6, 12, 18]) {
        box(tw - 0.50, th - 0.09, tw - 0.28, th - 0.07, dz, dz + 1.5, ...HANDLE);
      }
      // Kneehole opening on left
      box(0.10, 0.14, tw - 0.72, th - 0.12, 0, 20, '#1a1008', '#120a04', '#0a0602');
    } else {
      box(0.10, th - 0.70, tw - 0.10, th - 0.08, 2, 21, shade(OAK[0], -0.1), shade(OAK[1], -0.1), shade(OAK[2], -0.1));
      for (const dz of [6, 12, 18]) {
        box(tw - 0.09, th - 0.50, tw - 0.07, th - 0.28, dz, dz + 1.5, ...HANDLE);
      }
      box(0.14, 0.10, tw - 0.12, th - 0.72, 0, 20, '#1a1008', '#120a04', '#0a0602');
    }

    // Hardwood desktop surface with plank grain (z = 21 .. 24)
    planks(box, 0.04, 0.06, tw - 0.04, th - 0.06, 21, 24, {
      dir: tw >= th ? 'v' : 'u',
      count: 3,
      gap: 0.02,
      wood: OAK,
      grainDetail: true,
    });

    // Dual-display workstation setup
    if (tw >= th) {
      // Primary wide LCD monitor on angled stand
      box(0.24, 0.18, 0.82, 0.30, 24, 38, ...CHASSIS);
      box(0.26, 0.26, 0.80, 0.31, 26, 37, ...SCREEN); // glowing screen
      box(0.48, 0.20, 0.58, 0.28, 24, 28, ...HANDLE); // monitor arm

      // Slim mechanical keyboard and mouse on black mat
      box(0.30, 0.54, 0.65, 0.76, 24, 25.5, '#14161c', '#0e1014', '#080a0c');
      box(0.70, 0.58, 0.80, 0.74, 24, 25.8, '#202228', '#16181e', '#0c0e12');
      // Coffee mug
      box(0.15, 0.35, 0.25, 0.45, 24, 29, '#f4f6fa', '#d0d8e2', '#a0a8b4');
    } else {
      box(0.18, 0.24, 0.30, 0.82, 24, 38, ...CHASSIS);
      box(0.26, 0.26, 0.31, 0.80, 26, 37, ...SCREEN);
      box(0.20, 0.48, 0.28, 0.58, 24, 28, ...HANDLE);

      box(0.54, 0.30, 0.76, 0.65, 24, 25.5, '#14161c', '#0e1014', '#080a0c');
      box(0.58, 0.70, 0.74, 0.80, 24, 25.8, '#202228', '#16181e', '#0c0e12');
      box(0.35, 0.15, 0.45, 0.25, 24, 29, '#f4f6fa', '#d0d8e2', '#a0a8b4');
    }
  });
}

export function buildSkyTreeSprite(rot = 0) {
  const STONE = ['#b4b0a4', '#928e82', '#6c685e'];
  const TRUNK = ['#6e442c', '#54321e', '#3a2012'];
  const SAKURA = {
    shadow: '#9e3868',
    dark: '#c44882',
    mid: '#e86da4',
    light: '#ffa2c8',
    bright: '#ffd2e6',
  };

  return isoSprite(1, 1, 62, (box) => {
    // Ashlar stone hexagonal tree planter base with coping rim (z = 0 .. 10)
    stoneBlocks(box, 0.14, 0.14, 0.86, 0.86, 0, 10, { courses: 2, stone: STONE, coping: true, copingH: 2.2 });
    // Rich potting soil & root collar (z = 8 .. 10.5)
    box(0.18, 0.18, 0.82, 0.82, 8, 10.5, '#321e14', '#22140c', '#160c08');
    // Buttress roots spreading into soil
    box(0.30, 0.36, 0.70, 0.64, 10, 14, ...TRUNK);
    box(0.36, 0.30, 0.64, 0.70, 10, 14, ...TRUNK);

    // Main gnarled trunk with bark grain
    box(0.40, 0.40, 0.60, 0.60, 10, 32, ...TRUNK);
    // Trunk highlight line
    box(0.39, 0.41, 0.43, 0.59, 14, 30, shade(TRUNK[0], 0.2), shade(TRUNK[1], 0.15), shade(TRUNK[2], 0.1));
    // Branching boughs spreading outward
    box(0.24, 0.34, 0.42, 0.52, 26, 33, ...TRUNK);
    box(0.58, 0.38, 0.76, 0.56, 27, 34, ...TRUNK);
    box(0.36, 0.22, 0.54, 0.40, 28, 35, ...TRUNK);

    // Billowing sakura blossom cloud clusters with organic leaf/petal jaggies
    leafCluster(box, 0.36, 0.40, 38, 0.34, 0.34, 9, { ...SAKURA, flowers: [{ x: 0, y: 0, z: 0.3, color: '#ffffff' }] });
    leafCluster(box, 0.64, 0.48, 41, 0.34, 0.34, 9, { ...SAKURA, flowers: [{ x: 0.1, y: -0.1, z: 0.4, color: '#fff0f6' }] });
    leafCluster(box, 0.50, 0.36, 46, 0.36, 0.36, 10, { ...SAKURA, flowers: [{ x: -0.1, y: 0.1, z: 0.4, color: '#ffffff' }] });
    leafCluster(box, 0.48, 0.52, 54, 0.30, 0.30, 8, { ...SAKURA, flowers: [{ x: 0, y: 0, z: 0.3, color: '#fff0f6' }] });

    // Floating petal specks drifting down
    box(0.22, 0.68, 0.26, 0.72, 16, 18, '#ffa8cb', '#e280a5', '#b45c7e');
    box(0.72, 0.26, 0.76, 0.30, 20, 22, '#ffc0da', '#f098be', '#c46a90');
    box(0.30, 0.22, 0.34, 0.26, 23, 25, '#ffa8cb', '#e280a5', '#b45c7e');
  });
}

export function buildGardenBenchSprite(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const [tw, th] = r % 2 ? [1, 2] : [2, 1];
  const TEAK = ['#d29456', '#ae743a', '#7e4e20'];
  const IRON = ['#323844', '#222630', '#141820'];

  return isoSprite(tw, th, 34, (box) => {
    if (r % 2 === 0) {
      // Facing along u axis (tw = 2, th = 1)
      // Left and right cast-iron scrolled leg & armrest frames
      box(0.10, 0.14, 0.22, th - 0.14, 0, 13, ...IRON);
      box(tw - 0.22, 0.14, tw - 0.10, th - 0.14, 0, 13, ...IRON);
      // Center reinforcement iron leg
      box(0.94, 0.14, 1.06, th - 0.14, 0, 12, ...IRON);
      // Scrolled armrests
      box(0.08, 0.12, 0.24, th - 0.12, 13, 19, ...IRON);
      box(tw - 0.24, 0.12, tw - 0.08, th - 0.12, 13, 19, ...IRON);

      // Contoured seat: 4 separate teak wood slats with gaps and end-bolts
      planks(box, 0.08, 0.14, tw - 0.08, th - 0.14, 11, 14, {
        dir: 'v',
        count: 4,
        gap: 0.03,
        wood: TEAK,
        bolts: true,
        grainDetail: true,
      });

      // Backrest: 3 separate teak wood slats with gaps and end-bolts
      planks(box, 0.08, 0.12, tw - 0.08, 0.32, 17, 31, {
        dir: 'v',
        count: 3,
        gap: 0.035,
        wood: TEAK,
        bolts: true,
        grainDetail: true,
      });
      // Backrest rear cast-iron stanchion uprights
      box(0.12, 0.10, 0.20, 0.16, 12, 31, ...IRON);
      box(tw - 0.20, 0.10, tw - 0.12, 0.16, 12, 31, ...IRON);
      box(0.96, 0.10, 1.04, 0.16, 12, 31, ...IRON);
    } else {
      // Facing along v axis (tw = 1, th = 2)
      box(0.14, 0.10, tw - 0.14, 0.22, 0, 13, ...IRON);
      box(0.14, th - 0.22, tw - 0.14, th - 0.10, 0, 13, ...IRON);
      box(0.14, 0.94, tw - 0.14, 1.06, 0, 12, ...IRON);
      box(0.12, 0.08, tw - 0.12, 0.24, 13, 19, ...IRON);
      box(0.12, th - 0.24, tw - 0.12, th - 0.08, 13, 19, ...IRON);

      planks(box, 0.14, 0.08, tw - 0.14, th - 0.08, 11, 14, {
        dir: 'u',
        count: 4,
        gap: 0.03,
        wood: TEAK,
        bolts: true,
        grainDetail: true,
      });

      planks(box, 0.12, 0.08, 0.32, th - 0.08, 17, 31, {
        dir: 'u',
        count: 3,
        gap: 0.035,
        wood: TEAK,
        bolts: true,
        grainDetail: true,
      });
      box(0.10, 0.12, 0.16, 0.20, 12, 31, ...IRON);
      box(0.10, th - 0.20, 0.16, th - 0.12, 12, 31, ...IRON);
      box(0.10, 0.96, 0.16, 1.04, 12, 31, ...IRON);
    }
  });
}

export function buildFlowerPlanterSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STONE = ['#b8b2a6', '#969084', '#6e685e'];

  return isoSprite(tw, th, 36, (box) => {
    // Stone ashlar planter box with mortar lines and coping ledge (z = 0 .. 12)
    stoneBlocks(box, 0.06, 0.08, tw - 0.06, th - 0.08, 0, 12, {
      courses: 2,
      stone: STONE,
      coping: true,
      copingH: 2.5,
      copingOver: 0.03,
    });

    // Dark rich nutrient potting soil bed (z = 9 .. 12.5)
    box(0.08, 0.10, tw - 0.08, th - 0.10, 9, 12.5, '#342216', '#24160e', '#160e08');

    if (tw >= th) {
      // 2x1 configuration (tw = 2, th = 1)
      // Dense irregular bush/hedge mass rising above rim with 3 distinct floral clusters
      // Left clump: lush foliage with blue hydrangea flower cluster
      leafCluster(box, 0.55, 0.50, 20, 0.42, 0.38, 9, {
        flowers: [
          { x: -0.15, y: -0.1, z: 0.4, color: '#5c9cff' },
          { x: 0.2, y: 0.15, z: 0.35, color: '#7cb2ff' }
        ]
      });

      // Center clump: dense crown foliage with yellow/orange marigold flower cluster
      leafCluster(box, 1.0, 0.48, 22, 0.46, 0.40, 10, {
        flowers: [
          { x: 0.05, y: -0.15, z: 0.5, color: '#ff9a28' }
        ]
      });

      // Right clump: lush foliage with orange/coral flower cluster
      leafCluster(box, 1.45, 0.50, 20, 0.42, 0.38, 9, {
        flowers: [
          { x: -0.1, y: 0.1, z: 0.4, color: '#ffa838' },
          { x: 0.2, y: -0.1, z: 0.35, color: '#ff7820' }
        ]
      });

      // Spilling ivy leaves cascading organically over the front coping lip
      box(0.35, 0.88, 0.50, 1.02, 7, 13, '#3aa84f', '#267332', '#1a4e22');
      box(1.25, 0.88, 1.40, 1.02, 6, 12.5, '#4ec464', '#369c4a', '#226c30');
      box(0.80, 0.90, 0.92, 1.01, 8, 13.5, '#5cd470', '#3aa84f', '#267332');
    } else {
      // 1x2 configuration (tw = 1, th = 2)
      leafCluster(box, 0.50, 0.55, 20, 0.38, 0.42, 9, {
        flowers: [
          { x: -0.1, y: -0.15, z: 0.4, color: '#5c9cff' },
          { x: 0.15, y: 0.2, z: 0.35, color: '#7cb2ff' }
        ]
      });

      leafCluster(box, 0.48, 1.0, 22, 0.40, 0.46, 10, {
        flowers: [
          { x: -0.15, y: 0.05, z: 0.5, color: '#ff9a28' }
        ]
      });

      leafCluster(box, 0.50, 1.45, 20, 0.38, 0.42, 9, {
        flowers: [
          { x: 0.1, y: -0.1, z: 0.4, color: '#ffa838' },
          { x: -0.1, y: 0.2, z: 0.35, color: '#ff7820' }
        ]
      });

      // Spilling ivy leaves cascading over the side coping lip
      box(0.88, 0.35, 1.02, 0.50, 7, 13, '#3aa84f', '#267332', '#1a4e22');
      box(0.88, 1.25, 1.02, 1.40, 6, 12.5, '#4ec464', '#369c4a', '#226c30');
      box(0.90, 0.80, 1.01, 0.92, 8, 13.5, '#5cd470', '#3aa84f', '#267332');
    }
  });
}

export function buildMarblePillarSprite() {
  const MARBLE = ['#f7f0e4', '#ded4c2', '#b8ab96'];
  const MARBLE_SHADOW = ['#d8cebc', '#bcae98', '#948670'];
  const MARBLE_HI = ['#ffffff', '#f4ede0', '#ded4c4'];
  const GOLD = ['#f8cf6a', '#d4a438', '#9c7218'];
  const GOLD_HI = ['#ffe898', '#e2b040', '#a87818'];

  return isoSprite(1, 1, 58, (box) => {
    // Stepped plinth base with gold moulding
    box(0.10, 0.10, 0.90, 0.90, 0, 4, ...MARBLE_SHADOW);
    box(0.14, 0.14, 0.86, 0.86, 4, 7, ...GOLD);
    box(0.18, 0.18, 0.82, 0.82, 7, 11, ...MARBLE);

    // Fluted marble column shaft
    box(0.24, 0.24, 0.76, 0.76, 11, 48, ...MARBLE);

    // Vertical fluting ridges & shadow grooves at 2x density
    // South-east face fluting
    box(0.74, 0.32, 0.77, 0.42, 11, 48, ...MARBLE_HI);
    box(0.74, 0.46, 0.77, 0.54, 11, 48, ...MARBLE_HI);
    box(0.74, 0.58, 0.77, 0.68, 11, 48, ...MARBLE_HI);
    box(0.74, 0.42, 0.76, 0.46, 11, 48, ...MARBLE_SHADOW);
    box(0.74, 0.54, 0.76, 0.58, 11, 48, ...MARBLE_SHADOW);

    // South-west face fluting
    box(0.32, 0.74, 0.42, 0.77, 11, 48, ...MARBLE_HI);
    box(0.46, 0.74, 0.54, 0.77, 11, 48, ...MARBLE_HI);
    box(0.58, 0.74, 0.68, 0.77, 11, 48, ...MARBLE_HI);
    box(0.42, 0.74, 0.46, 0.76, 11, 48, ...MARBLE_SHADOW);
    box(0.54, 0.74, 0.58, 0.76, 11, 48, ...MARBLE_SHADOW);

    // Astragal necking ring with gold band
    box(0.20, 0.20, 0.80, 0.80, 48, 51, ...GOLD);

    // Classical carved capital header with corner scrolls
    box(0.16, 0.16, 0.84, 0.84, 51, 54, ...MARBLE_HI);
    box(0.12, 0.12, 0.88, 0.88, 54, 57, ...MARBLE);
    box(0.10, 0.10, 0.90, 0.90, 57, 58, ...GOLD_HI); // top abacus edge
  });
}

export function buildChandelierSprite() {
  const GOLD = ['#ffe082', '#d8a838', '#9e7216'];
  const GOLD_HI = ['#fff2b8', '#ffe082', '#cca028'];
  const CRYSTAL = ['#e8f8ff', '#b8e2f8', '#7cb4d8'];
  const CRYSTAL_HI = ['#ffffff', '#f0faff', '#d0eaf8'];
  const GLOW = ['#fff9d2', '#ffe074', '#d89e28'];
  const FLAME = ['#ffffff', '#fff4a8', '#ffc838'];

  return isoSprite(2, 2, 54, (box) => {
    // 1. Subtle inlaid golden marble floor medallion beneath chandelier
    box(0.30, 0.30, 1.70, 1.70, 0, 1.5, ...GOLD);
    box(0.45, 0.45, 1.55, 1.55, 1, 2.2, ...CRYSTAL);
    box(0.70, 0.70, 1.30, 1.30, 1.5, 2.8, ...GOLD_HI);

    // 2. Suspended center brass hanging rod & ceiling canopy rose (z = 44 .. 54)
    box(0.92, 0.92, 1.08, 1.08, 42, 54, ...GOLD);
    box(0.84, 0.84, 1.16, 1.16, 51, 54, ...GOLD_HI);

    // 3. Tier 1: Outer brass ring frame & candelabra candle arms (z = 32 .. 37)
    box(0.36, 0.36, 1.64, 1.64, 32, 35, ...GOLD);
    box(0.42, 0.42, 1.58, 1.58, 33, 35.5, ...GOLD_HI);

    // 4 Candelabra candle sleeves with warm incandescent flames
    const candleCoords = [
      [0.34, 0.34],
      [1.48, 0.34],
      [0.34, 1.48],
      [1.48, 1.48]
    ];
    for (const [cx, cy] of candleCoords) {
      box(cx, cy, cx + 0.18, cy + 0.18, 35, 41, '#fffdf8', '#eee8dc', '#cac2b2'); // candle sleeve
      box(cx + 0.04, cy + 0.04, cx + 0.14, cy + 0.14, 41, 46, ...GLOW); // flame
      box(cx + 0.06, cy + 0.06, cx + 0.12, cy + 0.12, 42, 47, ...FLAME); // inner hot core
    }

    // 4. Cascading crystal teardrop pendant garlands (z = 20 .. 32)
    box(0.44, 0.44, 1.56, 1.56, 26, 32, ...CRYSTAL);
    box(0.62, 0.62, 1.38, 1.38, 21, 27, ...CRYSTAL);
    box(0.78, 0.78, 1.22, 1.22, 17, 22, ...CRYSTAL_HI); // center crystal sphere finial
    box(0.88, 0.88, 1.12, 1.12, 14, 17, '#ffffff', '#eaf8ff', '#b4e2f8'); // bottom crystal prism droplet
  });
}

export function buildGrandStaircaseSprite(rot = 0) {
  const MARBLE = ['#f4ece0', '#d8cebe', '#b0a492'];
  const MARBLE_SHADOW = ['#d8cebc', '#baa894', '#8c7e6c'];
  const MARBLE_HI = ['#ffffff', '#ede4d6', '#c8bea8'];
  const CARPET = ['#b8243c', '#8e1628', '#600e1a'];
  const CARPET_GOLD = ['#f6c864', '#d49c2e', '#946c14'];
  const BRASS = ['#f4c658', '#ca962c', '#8e6414'];
  const BRASS_HI = ['#ffe890', '#e2b038', '#a47614'];
  const MAHOGANY = ['#5c2818', '#421a0e', '#2a0e06'];

  return isoSprite(2, 2, 54, (box) => {
    if (rot % 2 === 0) {
      // 4 tiered marble steps with bullnose overhangs
      const steps = [
        { y0: 0.06, y1: 0.62, z0: 0, z1: 36, cz0: 36, cz1: 38 },
        { y0: 0.62, y1: 1.12, z0: 0, z1: 24, cz0: 24, cz1: 26 },
        { y0: 1.12, y1: 1.58, z0: 0, z1: 14, cz0: 14, cz1: 16 },
        { y0: 1.58, y1: 1.94, z0: 0, z1: 6, cz0: 6, cz1: 8 }
      ];

      for (const s of steps) {
        box(0.06, s.y0, 1.94, s.y1, s.z0, s.z1, ...MARBLE);
        // Tread nosing highlight along step edge
        box(0.08, s.y1 - 0.05, 1.92, s.y1, s.z1 - 2, s.z1, ...MARBLE_HI);
        // Crimson carpet runner centered down step
        box(0.42, s.y0, 1.58, s.y1, s.cz0, s.cz1, ...CARPET);
        // Gold embroidered runner borders
        box(0.42, s.y0, 0.46, s.y1, s.cz0, s.cz1 + 0.5, ...CARPET_GOLD);
        box(1.54, s.y0, 1.58, s.y1, s.cz0, s.cz1 + 0.5, ...CARPET_GOLD);
        // Polished brass stair rod at riser crevice
        box(0.40, s.y0 + 0.02, 1.60, s.y0 + 0.06, s.cz0 - 1, s.cz0 + 2, ...BRASS_HI);
      }

      // Left balustrade with newel posts & turned balusters
      box(0.08, 0.08, 0.22, 0.22, 36, 52, ...MAHOGANY); // top newel post
      box(0.08, 0.08, 0.22, 0.22, 52, 54, ...BRASS_HI); // newel finial
      box(0.08, 1.76, 0.22, 1.90, 6, 24, ...MAHOGANY); // bottom newel post
      box(0.08, 1.76, 0.22, 1.90, 24, 26, ...BRASS_HI);
      box(0.12, 0.22, 0.18, 1.76, 12, 46, ...BRASS); // baluster spindles
      box(0.08, 0.12, 0.22, 1.86, 22, 48, ...MAHOGANY); // angled handrail

      // Right balustrade
      box(1.78, 0.08, 1.92, 0.22, 36, 52, ...MAHOGANY);
      box(1.78, 0.08, 1.92, 0.22, 52, 54, ...BRASS_HI);
      box(1.78, 1.76, 1.92, 1.90, 6, 24, ...MAHOGANY);
      box(1.78, 1.76, 1.92, 1.90, 24, 26, ...BRASS_HI);
      box(1.82, 0.22, 1.88, 1.76, 12, 46, ...BRASS);
      box(1.78, 0.12, 1.92, 1.86, 22, 48, ...MAHOGANY);
    } else {
      const steps = [
        { x0: 0.06, x1: 0.62, z0: 0, z1: 36, cz0: 36, cz1: 38 },
        { x0: 0.62, x1: 1.12, z0: 0, z1: 24, cz0: 24, cz1: 26 },
        { x0: 1.12, x1: 1.58, z0: 0, z1: 14, cz0: 14, cz1: 16 },
        { x0: 1.58, x1: 1.94, z0: 0, z1: 6, cz0: 6, cz1: 8 }
      ];

      for (const s of steps) {
        box(s.x0, 0.06, s.x1, 1.94, s.z0, s.z1, ...MARBLE);
        box(s.x1 - 0.05, 0.08, s.x1, 1.92, s.z1 - 2, s.z1, ...MARBLE_HI);
        box(s.x0, 0.42, s.x1, 1.58, s.cz0, s.cz1, ...CARPET);
        box(s.x0, 0.42, s.x1, 0.46, s.cz0, s.cz1 + 0.5, ...CARPET_GOLD);
        box(s.x0, 1.54, s.x1, 1.58, s.cz0, s.cz1 + 0.5, ...CARPET_GOLD);
        box(s.x0 + 0.02, 0.40, s.x0 + 0.06, 1.60, s.cz0 - 1, s.cz0 + 2, ...BRASS_HI);
      }

      box(0.08, 0.08, 0.22, 0.22, 36, 52, ...MAHOGANY);
      box(0.08, 0.08, 0.22, 0.22, 52, 54, ...BRASS_HI);
      box(1.76, 0.08, 1.90, 0.22, 6, 24, ...MAHOGANY);
      box(1.76, 0.08, 1.90, 0.22, 24, 26, ...BRASS_HI);
      box(0.22, 0.12, 1.76, 0.18, 12, 46, ...BRASS);
      box(0.12, 0.08, 1.86, 0.22, 22, 48, ...MAHOGANY);

      box(0.08, 1.78, 0.22, 1.92, 36, 52, ...MAHOGANY);
      box(0.08, 1.78, 0.22, 1.92, 52, 54, ...BRASS_HI);
      box(1.76, 1.78, 1.90, 1.92, 6, 24, ...MAHOGANY);
      box(1.76, 1.78, 1.90, 1.92, 24, 26, ...BRASS_HI);
      box(0.22, 1.82, 1.76, 1.88, 12, 46, ...BRASS);
      box(0.12, 1.78, 1.86, 1.92, 22, 48, ...MAHOGANY);
    }
  });
}

export function buildLobbyFountainSprite() {
  const MARBLE = ['#f2eae0', '#d4cab8', '#a89e8c'];
  const STONE_DARK = ['#b8ac98', '#988c78', '#6e6250'];
  const WATER = ['#4ed8ec', '#26b2cc', '#127a90'];
  const WATER_HI = ['#dcf6fa', '#9ae8f4', '#52cce0'];
  const GOLD = ['#f8cf68', '#d09e30', '#966c14'];
  const SPRAY = ['#ffffff', '#e8f8fc', '#b8e8f4'];

  return isoSprite(2, 2, 48, (box) => {
    // Stepped plinth & main basin outer rim (octagonal carved stone)
    box(0.06, 0.06, 1.94, 1.94, 0, 4, ...STONE_DARK);
    box(0.08, 0.20, 1.92, 1.80, 4, 10, ...MARBLE);
    box(0.20, 0.08, 1.80, 1.92, 4, 10, ...MARBLE);
    box(0.12, 0.12, 1.88, 1.88, 4, 10, ...MARBLE);
    // Outer coping lip
    box(0.06, 0.18, 1.94, 1.82, 9, 11, ...MARBLE);
    box(0.18, 0.06, 1.82, 1.94, 9, 11, ...MARBLE);

    // Wishing coins shimmering at the bottom of the basin (drawn before water)
    box(0.40, 0.50, 0.48, 0.58, 4.5, 5.5, ...GOLD);
    box(0.55, 1.40, 0.63, 1.48, 4.5, 5.5, ...GOLD);
    box(1.42, 0.60, 1.50, 0.68, 4.5, 5.5, ...GOLD);
    box(1.35, 1.35, 1.43, 1.43, 4.5, 5.5, ...GOLD);

    // Basin water reservoir with ripples & depth
    box(0.18, 0.18, 1.82, 1.82, 4, 9.5, ...WATER);
    box(0.24, 0.24, 1.76, 1.76, 9.2, 9.8, ...WATER_HI);

    // Central pedestal column
    box(0.68, 0.68, 1.32, 1.32, 4, 16, ...MARBLE);
    box(0.62, 0.62, 1.38, 1.38, 16, 20, ...STONE_DARK);

    // Tier 2 carved basin bowl with coping rim
    box(0.48, 0.48, 1.52, 1.52, 20, 24, ...MARBLE);
    box(0.44, 0.44, 1.56, 1.56, 23, 25, ...MARBLE);
    box(0.52, 0.52, 1.48, 1.48, 23, 24.5, ...WATER);

    // Water overflow cascading sheets from upper basin into lower basin
    box(0.46, 0.88, 0.50, 1.12, 10, 24, ...WATER_HI);
    box(1.50, 0.88, 1.54, 1.12, 10, 24, ...WATER_HI);
    box(0.88, 0.46, 1.12, 0.50, 10, 24, ...WATER_HI);
    box(0.88, 1.50, 1.12, 1.54, 10, 24, ...WATER_HI);

    // Upper fountain spire with ornate finial
    box(0.76, 0.76, 1.24, 1.24, 24, 36, ...MARBLE);
    box(0.82, 0.82, 1.18, 1.18, 36, 42, ...GOLD);

    // Bubbling water jet / spray crown at top
    box(0.92, 0.92, 1.08, 1.08, 42, 46, ...SPRAY);
    box(0.95, 0.95, 1.05, 1.05, 46, 48, '#ffffff', '#f4fdff', '#e0f6fc');
  });
}

export function buildLuggageTrolleySprite(rot = 0) {
  const BRASS = ['#f6cb62', '#cf9c30', '#946a14'];
  const BRASS_HI = ['#ffe88e', '#e2b038', '#a47814'];
  const CARPET = ['#b8243c', '#8a1428', '#5e0a1a'];
  const BUMPER = ['#323438', '#222428', '#141618'];
  const CASTER = ['#8c94a0', '#646c78', '#424850'];
  const LEATHER1 = ['#9e5828', '#7a4018', '#562a0c'];
  const LEATHER2 = ['#2c4a68', '#1e344a', '#102030'];
  const LEATHER3 = ['#883838', '#682424', '#481414'];
  const GOLD = ['#ffd464', '#d8a428', '#966e12'];

  return isoSprite(1, 1, 46, (box) => {
    // 4 heavy-duty swivel caster wheels
    box(0.12, 0.16, 0.22, 0.26, 0, 4, ...CASTER);
    box(0.78, 0.16, 0.88, 0.26, 0, 4, ...CASTER);
    box(0.12, 0.74, 0.22, 0.84, 0, 4, ...CASTER);
    box(0.78, 0.74, 0.88, 0.84, 0, 4, ...CASTER);

    // Rubber protective bumper rim (z = 4 .. 6)
    box(0.08, 0.12, 0.92, 0.88, 4, 6, ...BUMPER);
    // Brass platform deck frame (z = 6 .. 8)
    box(0.10, 0.14, 0.90, 0.86, 6, 8, ...BRASS);
    // Plush red carpeted luggage platform
    box(0.12, 0.16, 0.88, 0.84, 7.5, 8.5, ...CARPET);

    // Tubular polished brass birdcage arch frame
    // Upright corner posts
    box(0.14, 0.18, 0.20, 0.24, 8, 40, ...BRASS_HI);
    box(0.80, 0.18, 0.86, 0.24, 8, 40, ...BRASS_HI);
    box(0.14, 0.76, 0.20, 0.82, 8, 40, ...BRASS_HI);
    box(0.80, 0.76, 0.86, 0.82, 8, 40, ...BRASS_HI);

    // Top arched canopy rails & crossbars (z = 40 .. 44)
    box(0.14, 0.18, 0.86, 0.24, 40, 43, ...BRASS);
    box(0.14, 0.76, 0.86, 0.82, 40, 43, ...BRASS);
    box(0.14, 0.18, 0.20, 0.82, 40, 43, ...BRASS);
    box(0.80, 0.18, 0.86, 0.82, 40, 43, ...BRASS);

    // Center coat hanging rail & finial
    box(0.47, 0.18, 0.53, 0.82, 42, 44, ...BRASS_HI);
    box(0.45, 0.45, 0.55, 0.55, 44, 46, ...GOLD);

    // Stack of 3 authentic vintage travel trunks with straps & brass locks
    if (rot % 2 === 0) {
      // Large bottom brown leather trunk
      box(0.22, 0.22, 0.78, 0.54, 8.5, 18, ...LEATHER1);
      box(0.20, 0.30, 0.80, 0.33, 8.5, 18.2, ...GOLD); // leather strap
      box(0.20, 0.43, 0.80, 0.46, 8.5, 18.2, ...GOLD); // leather strap
      box(0.77, 0.36, 0.79, 0.40, 12, 15, ...GOLD); // brass latch

      // Medium navy blue case on right
      box(0.24, 0.56, 0.76, 0.80, 8.5, 16, ...LEATHER2);
      box(0.75, 0.66, 0.77, 0.70, 11, 14, ...GOLD);

      // Top burgundy vanity case resting on top
      box(0.30, 0.26, 0.70, 0.50, 18, 26, ...LEATHER3);
      box(0.69, 0.36, 0.71, 0.40, 21, 24, ...GOLD);
      box(0.46, 0.35, 0.54, 0.41, 26, 28, ...LEATHER1); // top handle
    } else {
      box(0.22, 0.22, 0.54, 0.78, 8.5, 18, ...LEATHER1);
      box(0.30, 0.20, 0.33, 0.80, 8.5, 18.2, ...GOLD);
      box(0.43, 0.20, 0.46, 0.80, 8.5, 18.2, ...GOLD);
      box(0.36, 0.77, 0.40, 0.79, 12, 15, ...GOLD);

      box(0.56, 0.24, 0.80, 0.76, 8.5, 16, ...LEATHER2);
      box(0.66, 0.75, 0.70, 0.77, 11, 14, ...GOLD);

      box(0.26, 0.30, 0.50, 0.70, 18, 26, ...LEATHER3);
      box(0.36, 0.69, 0.40, 0.71, 21, 24, ...GOLD);
      box(0.35, 0.46, 0.41, 0.54, 26, 28, ...LEATHER1);
    }
  });
}

export function buildConciergeDeskSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const WALNUT_DARK = ['#4e2b14', '#381c0c', '#241006'];
  const WALNUT = ['#6e4228', '#522e18', '#361c0c'];
  const WALNUT_LGT = ['#8c5836', '#6e4228', '#522e18'];
  const BRASS = ['#f4c65a', '#cc982e', '#926814'];
  const BRASS_HI = ['#ffe898', '#e2b040', '#a87818'];
  const LEDGER = ['#fcf6e8', '#dfd4be', '#b4a890'];
  const BLOTTER = ['#2c342a', '#1e261c', '#121810'];
  const GREEN_SHADE = ['#249454', '#166e3c', '#0e4a26'];
  return isoSprite(tw, th, 42, (box) => {
    // Stepped plinth base with wood moulding
    box(0.04, 0.08, tw - 0.04, th - 0.08, 0, 3, ...WALNUT_DARK);
    box(0.06, 0.10, tw - 0.06, th - 0.10, 3, 5, ...WALNUT_LGT);

    // Main desk carcass
    box(0.08, 0.12, tw - 0.08, th - 0.12, 5, 23, ...WALNUT);

    // Front/side raised panel mouldings
    if (tw > th) {
      box(0.12, 0.10, tw / 2 - 0.04, 0.12, 6, 21, ...WALNUT_DARK);
      box(0.14, 0.09, tw / 2 - 0.06, 0.11, 7, 20, ...WALNUT_LGT);
      box(tw / 2 + 0.04, 0.10, tw - 0.12, 0.12, 6, 21, ...WALNUT_DARK);
      box(tw / 2 + 0.06, 0.09, tw - 0.14, 0.11, 7, 20, ...WALNUT_LGT);
    } else {
      box(0.10, 0.12, 0.12, th / 2 - 0.04, 6, 21, ...WALNUT_DARK);
      box(0.09, 0.14, 0.11, th / 2 - 0.06, 7, 20, ...WALNUT_LGT);
      box(0.10, th / 2 + 0.04, 0.12, th - 0.12, 6, 21, ...WALNUT_DARK);
      box(0.09, th / 2 + 0.06, 0.11, th - 0.14, 7, 20, ...WALNUT_LGT);
    }

    // Polished brass wrap-around footrail along guest side
    if (tw > th) {
      box(0.06, 0.04, tw - 0.06, 0.07, 3, 5, ...BRASS);
      box(0.15, 0.04, 0.18, 0.10, 2, 4, ...BRASS_HI);
      box(tw - 0.18, 0.04, tw - 0.15, 0.10, 2, 4, ...BRASS_HI);
    } else {
      box(0.04, 0.06, 0.07, th - 0.06, 3, 5, ...BRASS);
      box(0.04, 0.15, 0.10, 0.18, 2, 4, ...BRASS_HI);
      box(0.04, th - 0.18, 0.10, th - 0.15, 2, 4, ...BRASS_HI);
    }

    // Heavy mahogany counter top with bullnose overhang
    box(0.04, 0.06, tw - 0.04, th - 0.06, 23, 26, ...WALNUT_DARK);
    box(0.03, 0.05, tw - 0.03, th - 0.05, 25, 27, ...WALNUT_LGT);

    // Leather desk blotter
    const [bx0, by0, bx1, by1] = tw > th
      ? [0.18 * tw, 0.22 * th, 0.62 * tw, 0.78 * th]
      : [0.22 * tw, 0.18 * th, 0.78 * tw, 0.62 * th];
    box(bx0, by0, bx1, by1, 27, 28, ...BLOTTER);

    // Open leather guest register / ledger book
    const [lx0, ly0, lx1, ly1] = tw > th
      ? [0.22 * tw, 0.26 * th, 0.58 * tw, 0.74 * th]
      : [0.26 * tw, 0.22 * th, 0.74 * tw, 0.58 * th];
    box(lx0, ly0, lx1, ly1, 28, 30, ...LEDGER);
    // Dark spine seam and bookmark ribbon
    if (tw > th) {
      box((lx0 + lx1) / 2 - 0.02, ly0, (lx0 + lx1) / 2 + 0.02, ly1, 30, 31, '#8b1e2c', '#6e1420', '#4a0a14');
      box((lx0 + lx1) / 2 - 0.01, ly1 - 0.02, (lx0 + lx1) / 2 + 0.01, ly1 + 0.08, 27, 29, '#cc2438', '#991424', '#660a14'); // draped ribbon tail
    } else {
      box(lx0, (ly0 + ly1) / 2 - 0.02, lx1, (ly0 + ly1) / 2 + 0.02, 30, 31, '#8b1e2c', '#6e1420', '#4a0a14');
      box(lx1 - 0.02, (ly0 + ly1) / 2 - 0.01, lx1 + 0.08, (ly0 + ly1) / 2 + 0.01, 27, 29, '#cc2438', '#991424', '#660a14');
    }

    // Classic Banker's Lamp
    const [lampX, lampY] = tw > th ? [0.76 * tw, 0.45 * th] : [0.45 * tw, 0.76 * th];
    box(lampX - 0.06, lampY - 0.06, lampX + 0.06, lampY + 0.06, 27, 29, ...BRASS); // base
    box(lampX - 0.02, lampY - 0.02, lampX + 0.02, lampY + 0.02, 29, 36, ...BRASS_HI); // neck
    box(lampX - 0.10, lampY - 0.05, lampX + 0.10, lampY + 0.05, 36, 40, ...GREEN_SHADE); // emerald glass shade
    box(lampX - 0.06, lampY - 0.03, lampX + 0.06, lampY + 0.03, 35, 36, '#ffea90', '#ffd450', '#c89e24'); // bulb glow

    // Polished brass reception bell
    const [bellX, bellY] = tw > th ? [0.10 * tw, 0.50 * th] : [0.50 * tw, 0.10 * th];
    box(bellX - 0.04, bellY - 0.04, bellX + 0.04, bellY + 0.04, 27, 29, ...BRASS_HI);
    box(bellX - 0.01, bellY - 0.01, bellX + 0.01, bellY + 0.01, 29, 31, '#ffffff', '#e8c044', '#996e14');
  });
}

export function buildLobbyRunnerSprite(rot = 0) {
  const [tw, th] = rot % 2 ? [3, 2] : [2, 3];
  const GOLD = ['#f6c667', '#d8a442', '#a07424'];
  const GOLD_HI = ['#ffe898', '#e2b040', '#a87818'];
  const CRIMSON = ['#b8243c', '#8a1428', '#5e0a1a'];
  const INNER = ['#d83652', '#b0243c', '#7e1426'];
  const FRINGE = ['#ffea9c', '#d8a43c', '#986c1c'];

  return isoSprite(tw, th, 10, (box) => {
    // 1. Far fringe tassels (drawn before field)
    if (tw > th) {
      for (let i = 0; i < 10; i++) {
        const y = 0.08 + i * 0.185;
        box(-0.04, y, 0.04, y + 0.06, 0, 1, ...FRINGE);
      }
    } else {
      for (let i = 0; i < 10; i++) {
        const x = 0.08 + i * 0.185;
        box(x, -0.04, x + 0.06, 0.04, 0, 1, ...FRINGE);
      }
    }

    // 2. Heavy crimson velvet runner field
    box(0.04, 0.04, tw - 0.04, th - 0.04, 0, 2, ...CRIMSON);

    // 3. Intricate gold bullion braided border
    box(0.12, 0.12, tw - 0.12, th - 0.12, 1, 2.2, ...GOLD);
    box(0.18, 0.18, tw - 0.18, th - 0.18, 1, 2.2, ...CRIMSON);

    // 4. Inner ruby panel
    box(0.24, 0.24, tw - 0.24, th - 0.24, 1, 2.4, ...INNER);

    // 5. Repeating gold damask medallions along runner center
    if (tw > th) {
      for (let m = 0; m < 3; m++) {
        const mx = 0.50 + m * 1.0;
        box(mx - 0.20, 0.80, mx + 0.20, 1.20, 1.5, 2.6, ...GOLD_HI);
        box(mx - 0.08, 0.92, mx + 0.08, 1.08, 1.8, 2.8, ...CRIMSON);
      }
    } else {
      for (let m = 0; m < 3; m++) {
        const my = 0.50 + m * 1.0;
        box(0.80, my - 0.20, 1.20, my + 0.20, 1.5, 2.6, ...GOLD_HI);
        box(0.92, my - 0.08, 1.08, my + 0.08, 1.8, 2.8, ...CRIMSON);
      }
    }

    // 6. Near fringe tassels (drawn on top of near edge of runner)
    if (tw > th) {
      for (let i = 0; i < 10; i++) {
        const y = 0.08 + i * 0.185;
        box(tw - 0.04, y, tw + 0.04, y + 0.06, 0, 1, ...FRINGE);
      }
    } else {
      for (let i = 0; i < 10; i++) {
        const x = 0.08 + i * 0.185;
        box(x, th - 0.04, x + 0.06, th + 0.04, 0, 1, ...FRINGE);
      }
    }
  });
}

// ---------- v0.8.3 Hotel Layout Expansion Models ----------

export function buildGymMirror(rot = 0) {
  const [tw, th] = [1, 1];
  const FRAME = ['#8c96a8', '#6a7282', '#4a505e'];
  const FRAME_HI = ['#d0d8e6', '#b0b8c6', '#88909e'];
  const GLASS = ['#cce8f8', '#a0cce4', '#70a4bc'];
  const SHEEN = ['#ffffff', '#eaf6fd', '#bde0f4'];
  const BASE_RAIL = ['#9ea8b8', '#7c8494', '#586070'];

  return isoSprite(tw, th, 48, (box) => {
    if (rot % 2 === 0) {
      // Mounted on North-West wall (plane parallel to U axis: v = 0.02 .. 0.08)
      // Brushed aluminum wall mounting channels
      box(0.04, 0.02, 0.96, 0.08, 4, 7, ...BASE_RAIL);
      box(0.04, 0.02, 0.96, 0.08, 44, 47, ...FRAME);
      // Vertical perimeter frame stiles
      box(0.04, 0.02, 0.09, 0.08, 7, 44, ...FRAME);
      box(0.91, 0.02, 0.96, 0.08, 7, 44, ...FRAME);
      // Top polished frame highlight
      box(0.04, 0.02, 0.96, 0.04, 46.5, 47.5, ...FRAME_HI);

      // Full-height reflective mirror glass panel
      box(0.08, 0.03, 0.92, 0.07, 7, 44, ...GLASS);

      // Center expansion joint dividing mirror panels
      box(0.485, 0.03, 0.515, 0.075, 7, 44, '#5c6474', '#444c5a', '#303642');

      // 2:1 isometric diagonal reflection highlight streaks across mirror face
      box(0.18, 0.035, 0.38, 0.065, 12, 36, ...SHEEN);
      box(0.24, 0.035, 0.32, 0.065, 18, 30, '#ffffff', '#ffffff', '#ffffff');
      box(0.58, 0.035, 0.78, 0.065, 16, 40, ...SHEEN);
      box(0.64, 0.035, 0.72, 0.065, 22, 34, '#ffffff', '#ffffff', '#ffffff');
    } else {
      // Mounted on North-East wall (plane parallel to V axis: u = 0.02 .. 0.08)
      box(0.02, 0.04, 0.08, 0.96, 4, 7, ...BASE_RAIL);
      box(0.02, 0.04, 0.08, 0.96, 44, 47, ...FRAME);
      box(0.02, 0.04, 0.08, 0.09, 7, 44, ...FRAME);
      box(0.02, 0.91, 0.08, 0.96, 7, 44, ...FRAME);
      box(0.02, 0.04, 0.04, 0.96, 46.5, 47.5, ...FRAME_HI);

      box(0.03, 0.08, 0.07, 0.92, 7, 44, ...GLASS);
      box(0.03, 0.485, 0.075, 0.515, 7, 44, '#5c6474', '#444c5a', '#303642');

      box(0.035, 0.18, 0.065, 0.38, 12, 36, ...SHEEN);
      box(0.035, 0.24, 0.065, 0.32, 18, 30, '#ffffff', '#ffffff', '#ffffff');
      box(0.035, 0.58, 0.065, 0.78, 16, 40, ...SHEEN);
      box(0.035, 0.64, 0.065, 0.72, 22, 34, '#ffffff', '#ffffff', '#ffffff');
    }
  });
}

export function buildExerciseBike(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const tw = 1;
  const th = 1;
  const CHASSIS = ['#303440', '#222630', '#161820'];
  const CHROME = ['#e4eaf2', '#bcc4d2', '#88909e'];
  const FLYWHEEL = ['#606878', '#444c5a', '#2c323e'];
  const ACCENT = ['#00e5ff', '#00b4d8', '#0077b6'];
  const SADDLE = ['#1a1c22', '#121418', '#0a0c0e'];

  return isoSprite(tw, th, 40, (box) => {
    // 1. Far stabilizer foot at front with rubber end caps (z = 0 .. 3.5)
    box(0.18, 0.12, 0.82, 0.22, 0, 3, ...CHASSIS);
    box(0.14, 0.11, 0.20, 0.23, 0, 3.5, '#14161a', '#0c0e10', '#06080a');
    box(0.80, 0.11, 0.86, 0.23, 0, 3.5, '#14161a', '#0c0e10', '#06080a');

    // 2. Front weighted flywheel disc (z = 5 .. 20)
    box(0.42, 0.20, 0.58, 0.50, 5, 20, ...FLYWHEEL);
    box(0.40, 0.22, 0.60, 0.48, 7, 18, ...CHROME);
    box(0.43, 0.26, 0.57, 0.44, 9, 16, '#282c36', '#1c2028', '#101218');

    // 3. Front handlebar stem, bullhorns, and console screen (drawn before near saddle)
    box(0.46, 0.24, 0.54, 0.34, 18, 32, ...CHROME);
    box(0.32, 0.18, 0.68, 0.28, 31, 34, ...CHASSIS);
    // Rubber grip bullhorns extending forward
    box(0.30, 0.14, 0.36, 0.26, 33, 36, ...SADDLE);
    box(0.64, 0.14, 0.70, 0.26, 33, 36, ...SADDLE);
    // Glowing cyan workout digital console screen in center
    box(0.42, 0.18, 0.58, 0.30, 33, 37, ...CHASSIS);
    box(0.44, 0.20, 0.56, 0.28, 37, 39, ...ACCENT);

    // 4. Central bottom frame tube & bottom bracket (z = 2 .. 8)
    box(0.44, 0.20, 0.56, 0.80, 2, 7, ...CHASSIS);

    // Crank arms and pedals on left and right
    box(0.32, 0.38, 0.44, 0.44, 8, 12, ...CHROME);
    box(0.56, 0.46, 0.68, 0.52, 6, 10, ...CHROME);
    box(0.24, 0.36, 0.34, 0.46, 7, 9, '#1a1c22', '#121418', '#0a0c0e');
    box(0.66, 0.44, 0.76, 0.54, 5, 7, '#1a1c22', '#121418', '#0a0c0e');

    // Diagonal frame tube rising from bottom bracket to head tube
    box(0.44, 0.30, 0.56, 0.60, 7, 16, ...CHASSIS);
    box(0.43, 0.34, 0.57, 0.56, 15, 17, ...ACCENT);

    // 5. Near stabilizer foot at rear (z = 0 .. 3.5)
    box(0.18, 0.78, 0.82, 0.88, 0, 3, ...CHASSIS);
    box(0.14, 0.77, 0.20, 0.89, 0, 3.5, '#14161a', '#0c0e10', '#06080a');
    box(0.80, 0.77, 0.86, 0.89, 0, 3.5, '#14161a', '#0c0e10', '#06080a');

    // 6. Adjustable chrome seatpost & ergonomic racing saddle (drawn in front to sit cleanly)
    box(0.46, 0.60, 0.54, 0.72, 12, 26, ...CHROME);
    box(0.40, 0.54, 0.60, 0.80, 26, 29, ...SADDLE);
    box(0.44, 0.48, 0.56, 0.62, 27, 29.5, ...SADDLE);
    box(0.48, 0.56, 0.52, 0.76, 29, 30, ...ACCENT);
  });
}

export function buildRowingMachine(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const FRAME = ['#444a58', '#323642', '#20242e'];
  const MONORAIL = ['#d8e2ee', '#b0bcc8', '#7e8a96'];
  const HOUSING = ['#282c36', '#1c2028', '#101218'];
  const SEAT = ['#202228', '#16181e', '#0c0e12'];
  const RED_ACCENT = ['#e53935', '#c62828', '#8e0000'];
  const SCREEN = ['#00e676', '#00c853', '#009624'];

  return isoSprite(tw, th, 32, (box) => {
    if (tw >= th) {
      // 2x1 configuration (runs along u axis)
      // 1. Front and rear stabilizer feet with rubber pads
      box(0.08, 0.16, 0.24, th - 0.16, 0, 4, ...FRAME);
      box(tw - 0.20, 0.18, tw - 0.08, th - 0.18, 0, 4, ...FRAME);

      // Long extruded aluminum monorail runner beam
      box(0.24, 0.40, tw - 0.16, 0.60, 3, 7, ...MONORAIL);
      box(0.24, 0.44, tw - 0.16, 0.56, 7, 7.8, '#f0f4fa', '#d0d8e2', '#a0a8b4'); // rail top track

      // Front air turbine / flywheel housing with radial ventilation
      box(0.12, 0.24, 0.48, th - 0.24, 4, 22, ...HOUSING);
      box(0.16, 0.20, 0.44, th - 0.20, 6, 20, '#505868', '#3a404c', '#262a34');
      box(0.22, 0.32, 0.38, th - 0.32, 9, 17, '#707c90', '#545e6e', '#38404c');

      // 2. Handlebar and monitor stalk (drawn before sliding seat)
      box(0.46, 0.42, 0.54, 0.58, 14, 18, '#d8dfe8', '#b0b8c4', '#848c98');
      box(0.48, 0.32, 0.52, th - 0.32, 17, 20, ...SEAT);
      box(0.36, 0.44, 0.42, 0.56, 20, 26, ...FRAME);
      box(0.34, 0.40, 0.44, 0.60, 25, 29, ...HOUSING);
      box(0.36, 0.43, 0.42, 0.57, 29, 31, ...SCREEN);

      // 3. Angled footplates with heel cups and foot straps
      box(0.44, 0.18, 0.62, 0.38, 4, 14, ...FRAME);
      box(0.44, th - 0.38, 0.62, th - 0.18, 4, 14, ...FRAME);
      box(0.48, 0.17, 0.56, 0.39, 10, 12, ...RED_ACCENT);
      box(0.48, th - 0.39, 0.56, th - 0.17, 10, 12, ...RED_ACCENT);

      // 4. Ergonomic contoured sliding seat with roller bracket (drawn towards rear)
      box(1.05, 0.30, 1.45, th - 0.30, 8, 13, ...SEAT);
      box(1.05, 0.30, 1.45, th - 0.30, 12.5, 13, ...RED_ACCENT);
      box(1.15, 0.38, 1.35, 0.62, 6, 8, ...FRAME);
    } else {
      // 1x2 configuration (runs along v axis)
      box(0.16, 0.08, tw - 0.16, 0.24, 0, 4, ...FRAME);
      box(0.18, th - 0.20, tw - 0.18, th - 0.08, 0, 4, ...FRAME);

      box(0.40, 0.24, 0.60, th - 0.16, 3, 7, ...MONORAIL);
      box(0.44, 0.24, 0.56, th - 0.16, 7, 7.8, '#f0f4fa', '#d0d8e2', '#a0a8b4');

      box(0.24, 0.12, tw - 0.24, 0.48, 4, 22, ...HOUSING);
      box(0.20, 0.16, tw - 0.20, 0.44, 6, 20, '#505868', '#3a404c', '#262a34');
      box(0.32, 0.22, tw - 0.32, 0.38, 9, 17, '#707c90', '#545e6e', '#38404c');

      // Far handlebars and monitor (drawn before rear sliding seat)
      box(0.42, 0.46, 0.58, 0.54, 14, 18, '#d8dfe8', '#b0b8c4', '#848c98');
      box(0.32, 0.48, tw - 0.32, 0.52, 17, 20, ...SEAT);
      box(0.44, 0.36, 0.56, 0.42, 20, 26, ...FRAME);
      box(0.40, 0.34, 0.60, 0.44, 25, 29, ...HOUSING);
      box(0.43, 0.36, 0.57, 0.42, 29, 31, ...SCREEN);

      box(0.18, 0.44, 0.38, 0.62, 4, 14, ...FRAME);
      box(tw - 0.38, 0.44, tw - 0.18, 0.62, 4, 14, ...FRAME);
      box(0.17, 0.48, 0.39, 0.56, 10, 12, ...RED_ACCENT);
      box(tw - 0.39, 0.48, tw - 0.17, 0.56, 10, 12, ...RED_ACCENT);

      // Sliding seat at near end (v = 1.05 .. 1.45)
      box(0.30, 1.05, tw - 0.30, 1.45, 8, 13, ...SEAT);
      box(0.30, 1.05, tw - 0.30, 1.45, 12.5, 13, ...RED_ACCENT);
      box(0.38, 1.15, 0.62, 1.35, 6, 8, ...FRAME);
    }
  });
}

export function buildSquatRack(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#7c8698', '#5c6474', '#404652'];
  const PEG_HOLE = ['#282c34', '#1c2026', '#101216'];
  const J_HOOK = ['#e53935', '#c62828', '#8e0000'];
  const CHROME = ['#e8edf4', '#c0c8d4', '#8c94a0'];
  const PLATES_45 = ['#22262e', '#161a20', '#0e1014'];
  const RING_RED = ['#ef5350', '#d32f2f', '#9a0007'];

  return isoSprite(tw, th, 56, (box) => {
    // Heavy boxed steel base frame
    box(0.08, 0.08, tw - 0.08, th - 0.08, 0, 4, ...STEEL);

    if (tw >= th) {
      // 2x1 configuration (tw = 2, th = 1)
      // 1. Rear storage pegs holding spare plates (drawn first at v = 0.04 .. 0.14)
      box(0.14, 0.04, 0.22, 0.14, 14, 26, ...PLATES_45);
      box(tw - 0.22, 0.04, tw - 0.14, 0.14, 14, 26, ...PLATES_45);

      // 2. Rear upright columns (v = 0.12 .. 0.26)
      const rearCols = [
        [0.12, 0.12, 0.24, 0.26],
        [tw - 0.24, 0.12, tw - 0.12, 0.26]
      ];
      for (const [u0, v0, u1, v1] of rearCols) {
        box(u0, v0, u1, v1, 4, 52, ...STEEL);
        for (let hz = 12; hz <= 48; hz += 6) {
          box(u0 + 0.02, v1 - 0.02, u1 - 0.02, v1, hz, hz + 2, ...PEG_HOLE);
        }
      }

      // Overhead pull-up crossbars
      box(0.12, 0.14, tw - 0.12, 0.24, 50, 53, ...CHROME);
      box(0.12, th - 0.24, tw - 0.12, th - 0.14, 50, 53, ...CHROME);

      // 3. Front upright columns (v = th - 0.26 .. th - 0.12)
      const frontCols = [
        [0.12, th - 0.26, 0.24, th - 0.12],
        [tw - 0.24, th - 0.26, tw - 0.12, th - 0.12]
      ];
      for (const [u0, v0, u1, v1] of frontCols) {
        box(u0, v0, u1, v1, 4, 52, ...STEEL);
        for (let hz = 12; hz <= 48; hz += 6) {
          box(u0 + 0.02, v1 - 0.02, u1 - 0.02, v1, hz, hz + 2, ...PEG_HOLE);
        }
      }

      // Red J-hooks positioned on front posts at z = 26
      box(0.10, th - 0.32, 0.26, th - 0.22, 24, 28, ...J_HOOK);
      box(tw - 0.26, th - 0.32, tw - 0.10, th - 0.22, 24, 28, ...J_HOOK);

      // Knurled chrome Olympic barbell resting on J-hooks
      box(0.02, th - 0.30, tw - 0.02, th - 0.24, 28, 30, ...CHROME);

      // Olympic bumper plates on bar
      box(0.04, th - 0.38, 0.14, th - 0.16, 21, 37, ...PLATES_45);
      box(0.05, th - 0.36, 0.13, th - 0.18, 23, 35, ...RING_RED);
      box(tw - 0.14, th - 0.38, tw - 0.04, th - 0.16, 21, 37, ...PLATES_45);
      box(tw - 0.13, th - 0.36, tw - 0.05, th - 0.18, 23, 35, ...RING_RED);
    } else {
      // 1x2 configuration (tw = 1, th = 2)
      // Rear storage pegs
      box(0.04, 0.14, 0.14, 0.22, 14, 26, ...PLATES_45);
      box(0.04, th - 0.22, 0.14, th - 0.14, 14, 26, ...PLATES_45);

      // Rear posts (u = 0.12 .. 0.26)
      const rearCols = [
        [0.12, 0.12, 0.26, 0.24],
        [0.12, th - 0.24, 0.26, th - 0.12]
      ];
      for (const [u0, v0, u1, v1] of rearCols) {
        box(u0, v0, u1, v1, 4, 52, ...STEEL);
        for (let hz = 12; hz <= 48; hz += 6) {
          box(u1 - 0.02, v0 + 0.02, u1, v1 - 0.02, hz, hz + 2, ...PEG_HOLE);
        }
      }

      box(0.14, 0.12, 0.24, th - 0.12, 50, 53, ...CHROME);
      box(tw - 0.24, 0.12, tw - 0.14, th - 0.12, 50, 53, ...CHROME);

      // Front posts (u = tw - 0.26 .. tw - 0.12)
      const frontCols = [
        [tw - 0.26, 0.12, tw - 0.12, 0.24],
        [tw - 0.26, th - 0.24, tw - 0.12, th - 0.12]
      ];
      for (const [u0, v0, u1, v1] of frontCols) {
        box(u0, v0, u1, v1, 4, 52, ...STEEL);
        for (let hz = 12; hz <= 48; hz += 6) {
          box(u1 - 0.02, v0 + 0.02, u1, v1 - 0.02, hz, hz + 2, ...PEG_HOLE);
        }
      }

      box(tw - 0.32, 0.10, tw - 0.22, 0.26, 24, 28, ...J_HOOK);
      box(tw - 0.32, th - 0.26, tw - 0.22, th - 0.10, 24, 28, ...J_HOOK);

      box(tw - 0.30, 0.02, tw - 0.24, th - 0.02, 28, 30, ...CHROME);

      box(tw - 0.38, 0.04, tw - 0.16, 0.14, 21, 37, ...PLATES_45);
      box(tw - 0.36, 0.05, tw - 0.18, 0.13, 23, 35, ...RING_RED);
      box(tw - 0.38, th - 0.14, tw - 0.16, th - 0.04, 21, 37, ...PLATES_45);
      box(tw - 0.36, th - 0.13, tw - 0.18, th - 0.05, 23, 35, ...RING_RED);
    }
  });
}

export function buildGymLockers(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#626e80', '#4a5464', '#343c48'];
  const SEAM = ['#282e38', '#1c2028', '#12161c'];
  const HANDLE = ['#e4eaf2', '#bcc4d2', '#88909e'];
  const LOUVER = ['#303642', '#222832', '#161a20'];
  const BRASS_TAG = ['#f4c862', '#d4a034', '#986c1c'];

  return isoSprite(tw, th, 52, (box) => {
    // Heavy plinth base (z = 0 .. 4)
    box(0.06, 0.08, tw - 0.06, th - 0.08, 0, 4, ...SEAM);
    // Main locker cabinet outer body (z = 4 .. 50)
    box(0.06, 0.08, tw - 0.06, th - 0.08, 4, 50, ...STEEL);

    // 3 individual locker door panels with vertical seams, louvers, and number badges
    const cols = 3;
    if (tw >= th) {
      const colW = (tw - 0.16) / cols;
      for (let i = 0; i < cols; i++) {
        const u0 = 0.08 + i * colW + 0.02;
        const u1 = u0 + colW - 0.04;

        // Recessed door frame
        box(u0, th - 0.12, u1, th - 0.08, 5, 49, shade(STEEL[0], 0.05), shade(STEEL[1], 0.05), shade(STEEL[2], 0.05));

        // Upper ventilation louvers (slots)
        for (let lz = 41; lz <= 46; lz += 2) {
          box(u0 + 0.04, th - 0.09, u1 - 0.04, th - 0.075, lz, lz + 1, ...LOUVER);
        }

        // Brass locker number tag
        box((u0 + u1) / 2 - 0.04, th - 0.09, (u0 + u1) / 2 + 0.04, th - 0.075, 36, 39, ...BRASS_TAG);

        // Chrome latch hasp handle & padlock eyelet
        box(u1 - 0.08, th - 0.095, u1 - 0.02, th - 0.07, 22, 28, ...HANDLE);

        // Lower ventilation louvers
        for (let lz = 8; lz <= 13; lz += 2) {
          box(u0 + 0.04, th - 0.09, u1 - 0.04, th - 0.075, lz, lz + 1, ...LOUVER);
        }
      }
    } else {
      const colD = (th - 0.16) / cols;
      for (let i = 0; i < cols; i++) {
        const v0 = 0.08 + i * colD + 0.02;
        const v1 = v0 + colD - 0.04;

        box(tw - 0.12, v0, tw - 0.08, v1, 5, 49, shade(STEEL[0], 0.05), shade(STEEL[1], 0.05), shade(STEEL[2], 0.05));

        for (let lz = 41; lz <= 46; lz += 2) {
          box(tw - 0.09, v0 + 0.04, tw - 0.075, v1 - 0.04, lz, lz + 1, ...LOUVER);
        }

        box(tw - 0.09, (v0 + v1) / 2 - 0.04, tw - 0.075, (v0 + v1) / 2 + 0.04, 36, 39, ...BRASS_TAG);

        box(tw - 0.095, v1 - 0.08, tw - 0.07, v1 - 0.02, 22, 28, ...HANDLE);

        for (let lz = 8; lz <= 13; lz += 2) {
          box(tw - 0.09, v0 + 0.04, tw - 0.075, v1 - 0.04, lz, lz + 1, ...LOUVER);
        }
      }
    }
  });
}

export function buildWaterCooler(rot = 0) {
  const WHITE = ['#f4f6fa', '#d4d8e2', '#a8b0c0'];
  const BOTTLE = ['#50c8ff', '#28a0e0', '#1074b0'];
  const HIGHLIGHT = ['#eaf8ff', '#c4e8fa', '#94d0f0'];
  const TRAY = ['#282c34', '#1c2026', '#101216'];

  return isoSprite(1, 1, 44, (box) => {
    // Base cabinet body with recessed toe-kick (z = 0 .. 22)
    box(0.24, 0.24, 0.76, 0.76, 0, 3, shade(WHITE[0], -0.2), shade(WHITE[1], -0.2), shade(WHITE[2], -0.2));
    box(0.22, 0.22, 0.78, 0.78, 3, 22, ...WHITE);

    // Front recessed water dispensing alcove
    box(0.30, 0.62, 0.70, 0.79, 10, 20, '#e8ecf4', '#c4ccd8', '#9ca4b2');
    // Drip tray with black drain grating
    box(0.32, 0.64, 0.68, 0.78, 10, 12, ...TRAY);
    // Red (hot) and Blue (cold) push taps
    box(0.36, 0.68, 0.46, 0.76, 17, 20, '#e53935', '#c62828', '#8e0000');
    box(0.54, 0.68, 0.64, 0.76, 17, 20, '#1e88e5', '#1565c0', '#0d47a1');

    // Bottle collar mounting ring (z = 21 .. 23)
    box(0.26, 0.26, 0.74, 0.74, 21, 23, '#8e98a8', '#6e7686', '#505664');

    // Inverted 5-gallon blue water bottle with ribbed contours (z = 23 .. 39)
    box(0.28, 0.28, 0.72, 0.72, 23, 38, ...BOTTLE);
    // Water bottle rib rings
    box(0.27, 0.27, 0.73, 0.73, 27, 28, ...HIGHLIGHT);
    box(0.27, 0.27, 0.73, 0.73, 32, 33, ...HIGHLIGHT);
    // Top inverted bottle dome
    box(0.32, 0.32, 0.68, 0.68, 38, 41, ...BOTTLE);
    // Air bubble highlight inside bottle
    box(0.34, 0.34, 0.44, 0.44, 30, 34, ...HIGHLIGHT);

    // Side paper cup dispenser tube (attached to left side)
    box(0.14, 0.42, 0.21, 0.58, 8, 24, '#d8e4ee', '#b0c0ce', '#8494a4');
    box(0.15, 0.44, 0.20, 0.56, 10, 22, '#ffffff', '#e8e8e8', '#cccccc'); // stacked white cups
  });
}

export function buildRoundDiningTable(rot = 0) {
  const LINEN = ['#faf8f4', '#dedad0', '#b8b2a4'];
  const LINEN_SHADOW = ['#e6e2d8', '#cac4b6', '#9e9686'];
  const LINEN_HI = ['#ffffff', '#f4f2ec', '#dcd8cc'];
  const RUNNER = ['#8c2438', '#6a1424', '#480c16'];
  const CANDLE = ['#ffdf78', '#e8b834', '#b08418'];
  const PLATE = ['#ffffff', '#e8e6e2', '#c0bcb4'];
  const GOLD_RIM = ['#f4c65a', '#cc982e', '#926814'];
  const GLASS = ['#eaf6fc', '#c8e2f0', '#96bcd2'];
  const WOOD = ['#4a2818', '#341a0e', '#200e06'];
  const BRASS = ['#eec054', '#c49428', '#886212'];

  return isoSprite(2, 2, 34, (box) => {
    // 4 scrolled pedestal outrigger feet
    box(0.40, 0.92, 0.70, 1.08, 0, 4, ...WOOD);
    box(0.35, 0.92, 0.40, 1.08, 0, 3, ...BRASS); // left brass toe cap
    box(1.30, 0.92, 1.60, 1.08, 0, 4, ...WOOD);
    box(1.60, 0.92, 1.65, 1.08, 0, 3, ...BRASS); // right brass toe cap
    box(0.92, 0.40, 1.08, 0.70, 0, 4, ...WOOD);
    box(0.92, 0.35, 1.08, 0.40, 0, 3, ...BRASS); // top brass toe cap
    box(0.92, 1.30, 1.08, 1.60, 0, 4, ...WOOD);
    box(0.92, 1.60, 1.08, 1.65, 0, 3, ...BRASS); // bottom brass toe cap

    // Central turned timber pedestal column
    box(0.70, 0.70, 1.30, 1.30, 0, 5, ...WOOD);
    box(0.82, 0.82, 1.18, 1.18, 5, 17, ...WOOD);
    box(0.76, 0.76, 1.24, 1.24, 17, 20, ...WOOD);

    // Cascading tablecloth corners (draped fabric hanging lower at cardinal diagonals)
    box(0.24, 0.24, 1.76, 1.76, 15, 20, ...LINEN_SHADOW);
    box(0.18, 0.18, 1.82, 1.82, 20, 24, ...LINEN);

    // Main rounded tablecloth draped over table
    box(0.12, 0.30, 1.88, 1.70, 23, 25, ...LINEN);
    box(0.30, 0.12, 1.70, 1.88, 23, 25, ...LINEN);
    box(0.18, 0.18, 1.82, 1.82, 24, 25.5, ...LINEN_HI);

    // Damask red circular runner / centerpiece mat
    box(0.60, 0.60, 1.40, 1.40, 25.5, 26, ...RUNNER);
    box(0.65, 0.65, 1.35, 1.35, 25.7, 26.2, ...GOLD_RIM);

    // 4 full place settings (charger plate, inner plate, cloth napkin, wine goblet)
    const settings = [
      { px: 0.42, py: 1.0, nx: 0.42, ny: 0.85, gx: 0.50, gy: 1.15 },
      { px: 1.58, py: 1.0, nx: 1.58, ny: 1.15, gx: 1.50, gy: 0.85 },
      { px: 1.0, py: 0.42, nx: 1.15, ny: 0.42, gx: 0.85, gy: 0.50 },
      { px: 1.0, py: 1.58, nx: 0.85, ny: 1.58, gx: 1.15, gy: 1.50 }
    ];

    for (const s of settings) {
      // Charger plate with gold rim
      box(s.px - 0.14, s.py - 0.14, s.px + 0.14, s.py + 0.14, 25.5, 26.2, ...GOLD_RIM);
      box(s.px - 0.11, s.py - 0.11, s.px + 0.11, s.py + 0.11, 26.0, 26.6, ...PLATE);
      // Folded damask napkin
      box(s.nx - 0.05, s.ny - 0.07, s.nx + 0.05, s.ny + 0.07, 25.5, 26.4, ...RUNNER);
      // Crystal wine goblet
      box(s.gx - 0.04, s.gy - 0.04, s.gx + 0.04, s.gy + 0.04, 25.5, 29.5, ...GLASS);
      box(s.gx - 0.02, s.gy - 0.02, s.gx + 0.02, s.gy + 0.02, 29.5, 30.5, '#ffffff', '#eaf6fc', '#c8e2f0'); // glint
    }

    // Centerpiece: Crystal hurricane candle holder with glowing flame
    box(0.92, 0.92, 1.08, 1.08, 26.2, 27.2, ...GOLD_RIM);
    box(0.90, 0.90, 1.10, 1.10, 27.2, 31.5, ...GLASS);
    box(0.95, 0.95, 1.05, 1.05, 27.5, 30.5, '#fff6d4', '#eed090', '#c8a450'); // wax candle
    box(0.97, 0.97, 1.03, 1.03, 30.5, 32.5, ...CANDLE); // flame
    box(0.98, 0.98, 1.02, 1.02, 31.0, 33.0, '#ffffff', '#fff0a0', '#ffc040'); // inner white-hot flame
  });
}

export function buildDiningBooth(rot = 0, layer = 'all') {
  const r = ((rot % 4) + 4) % 4;
  const [tw, th] = r % 2 ? [1, 2] : [2, 1];
  const VELVET = ['#c82442', '#a01830', '#740c20'];
  const VELVET_LT = ['#e03856', '#c82442', '#901228'];
  const WALNUT = ['#381c14', '#26120c', '#160804'];
  const PIPING = ['#f4c862', '#d4a034', '#986c1c'];

  return isoSprite(tw, th, 40, (box) => {
    const drawBack = layer === 'all' || layer === 'back';
    const drawFront = layer === 'all' || layer === 'front';

    if (drawBack) {
      // Solid dark walnut kickplate plinth (z = 0 .. 8)
      box(0.06, 0.08, tw - 0.06, th - 0.08, 0, 8, ...WALNUT);
      grain(box, 0.06, 0.08, tw - 0.06, th - 0.08, 8, { wood: WALNUT[0] });

      // Deep cushioned velvet bench seat (z = 8 .. 16) with gold piping welt
      box(0.08, 0.10, tw - 0.08, th - 0.10, 8, 16, ...VELVET);
      stitching(box, 0.08, 0.10, tw - 0.08, th - 0.10, 15.5, { piping: PIPING, pipingHeight: 0.8 });

      // High-backed booth backrest with vertical channel tufting
      if (r === 0) {
        // 2x1 configuration: backrest along north edge
        box(0.06, 0.08, tw - 0.06, 0.34, 16, 38, ...VELVET);
        // Vertical channel tufting flutes
        const flutes = 5;
        const fW = (tw - 0.16) / flutes;
        for (let i = 0; i < flutes; i++) {
          const fu0 = 0.08 + i * fW + 0.015;
          const fu1 = fu0 + fW - 0.03;
          box(fu0, 0.28, fu1, 0.35, 17, 37, ...VELVET_LT);
        }
        // Top crown roll with gold piping
        box(0.06, 0.06, tw - 0.06, 0.14, 37, 40, ...PIPING);
        // End gable wings
        box(0.06, 0.08, 0.14, th - 0.08, 8, 30, ...WALNUT);
        box(tw - 0.14, 0.08, tw - 0.06, th - 0.08, 8, 30, ...WALNUT);
      } else if (r === 1) {
        // 1x2 configuration: backrest along west edge
        box(0.08, 0.06, 0.34, th - 0.06, 16, 38, ...VELVET);
        const flutes = 5;
        const fD = (th - 0.16) / flutes;
        for (let i = 0; i < flutes; i++) {
          const fv0 = 0.08 + i * fD + 0.015;
          const fv1 = fv0 + fD - 0.03;
          box(0.28, fv0, 0.35, fv1, 17, 37, ...VELVET_LT);
        }
        box(0.06, 0.06, 0.14, th - 0.06, 37, 40, ...PIPING);
        box(0.08, 0.06, tw - 0.08, 0.14, 8, 30, ...WALNUT);
        box(0.08, th - 0.14, tw - 0.08, th - 0.06, 8, 30, ...WALNUT);
      }
    }

    if (drawFront) {
      if (r === 2) {
        // 2x1 configuration: backrest along south edge
        box(0.06, 0.66, tw - 0.06, 0.92, 16, 38, ...VELVET);
        const flutes = 5;
        const fW = (tw - 0.16) / flutes;
        for (let i = 0; i < flutes; i++) {
          const fu0 = 0.08 + i * fW + 0.015;
          const fu1 = fu0 + fW - 0.03;
          box(fu0, 0.65, fu1, 0.72, 17, 37, ...VELVET_LT);
        }
        box(0.06, 0.86, tw - 0.06, 0.94, 37, 40, ...PIPING);
        box(0.06, 0.08, 0.14, th - 0.08, 8, 30, ...WALNUT);
        box(tw - 0.14, 0.08, tw - 0.06, th - 0.08, 8, 30, ...WALNUT);
      } else if (r === 3) {
        // 1x2 configuration: backrest along east edge
        box(0.66, 0.08, 0.92, th - 0.06, 16, 38, ...VELVET);
        const flutes = 5;
        const fD = (th - 0.16) / flutes;
        for (let i = 0; i < flutes; i++) {
          const fv0 = 0.08 + i * fD + 0.015;
          const fv1 = fv0 + fD - 0.03;
          box(0.65, fv0, 0.72, fv1, 17, 37, ...VELVET_LT);
        }
        box(0.86, 0.06, 0.94, th - 0.06, 37, 40, ...PIPING);
        box(0.08, 0.06, tw - 0.08, 0.14, 8, 30, ...WALNUT);
        box(0.08, th - 0.14, tw - 0.08, th - 0.06, 8, 30, ...WALNUT);
      }
    }
  });
}

export function buildWineWall(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const [tw, th] = r % 2 ? [1, 3] : [3, 1];
  const OAK_DARK = ['#28140c', '#1a0c06', '#0e0602'];
  const OAK = ['#3e2014', '#2c140a', '#1a0a04'];
  const OAK_TRIM = ['#5c3422', '#442214', '#2e140a'];
  const GLOW = ['#ffd878', '#dca438', '#986c18'];
  const CHROME = ['#eaf0f6', '#c4d0dc', '#90a0b0'];
  const BOTTLE_GREEN = ['#225c34', '#164224', '#0c2814'];
  const BOTTLE_BURGUNDY = ['#6e1c28', '#4e101a', '#320810'];
  const BOTTLE_AMBER = ['#8c4a18', '#64320e', '#421e06'];
  const FOIL_GOLD = ['#ffd460', '#daa028', '#966810'];
  const FOIL_SILVER = ['#f0f4f8', '#c8d4e0', '#94a0b0'];

  return isoSprite(tw, th, 64, (box) => {
    // Solid dark oak base plinth (z = 0 .. 4)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 0, 4, ...OAK_DARK);

    // 4 tiers of wine racks with individual bottles & foil capsules
    const bottles = [
      { col: BOTTLE_GREEN, foil: FOIL_GOLD },
      { col: BOTTLE_BURGUNDY, foil: FOIL_SILVER },
      { col: BOTTLE_AMBER, foil: FOIL_GOLD },
      { col: BOTTLE_GREEN, foil: FOIL_SILVER }
    ];

    if (r % 2 === 0) {
      // 3x1 configuration: back panel on north edge
      box(0.06, 0.08, tw - 0.06, 0.22, 4, 60, ...OAK);
      // Backlit illuminated interior cavity
      box(0.14, 0.20, tw - 0.14, th - 0.12, 6, 56, ...GLOW);

      for (let row = 0; row < 4; row++) {
        const z0 = 8 + row * 13;
        // Wood shelf beam
        box(0.10, 0.10, tw - 0.10, th - 0.10, z0, z0 + 2, ...OAK_TRIM);
        const { col, foil } = bottles[row % bottles.length];
        const numCols = 7;
        const span = tw - 0.32;
        for (let c = 0; c < numCols; c++) {
          const x0 = 0.16 + (c / numCols) * span;
          const x1 = x0 + span / numCols - 0.04;
          // Bottle body
          box(x0, 0.16, x1, th - 0.10, z0 + 2, z0 + 9, ...col);
          // Paper label on front
          box(x0 + 0.02, th - 0.11, x1 - 0.02, th - 0.09, z0 + 4, z0 + 7, '#faf6ee', '#ded6c6', '#b0a894');
          // Bottle neck & foil capsule
          box((x0 + x1) / 2 - 0.02, 0.18, (x0 + x1) / 2 + 0.02, th - 0.12, z0 + 9, z0 + 12, ...foil);
        }
      }
      // Left and right side upright panels fully enclosing the shelf ends
      box(0.04, 0.06, 0.14, th - 0.06, 4, 60, ...OAK_TRIM);
      box(tw - 0.14, 0.06, tw - 0.04, th - 0.06, 4, 60, ...OAK_TRIM);
      // Glass door mullions & chrome handles
      box(tw / 3 - 0.02, 0.07, tw / 3 + 0.02, 0.09, 4, 60, ...OAK_DARK);
      box((2 * tw) / 3 - 0.02, 0.07, (2 * tw) / 3 + 0.02, 0.09, 4, 60, ...OAK_DARK);
      box(tw / 3 - 0.05, 0.05, tw / 3 - 0.03, 0.08, 28, 36, ...CHROME);
      box((2 * tw) / 3 + 0.03, 0.05, (2 * tw) / 3 + 0.05, 0.08, 28, 36, ...CHROME);
    } else {
      // 1x3 configuration: back panel on west edge
      box(0.08, 0.06, 0.22, th - 0.06, 4, 60, ...OAK);
      box(0.20, 0.14, tw - 0.12, th - 0.14, 6, 56, ...GLOW);

      for (let row = 0; row < 4; row++) {
        const z0 = 8 + row * 13;
        box(0.10, 0.10, tw - 0.10, th - 0.10, z0, z0 + 2, ...OAK_TRIM);
        const { col, foil } = bottles[row % bottles.length];
        const numCols = 7;
        const span = th - 0.32;
        for (let c = 0; c < numCols; c++) {
          const y0 = 0.16 + (c / numCols) * span;
          const y1 = y0 + span / numCols - 0.04;
          box(0.16, y0, tw - 0.10, y1, z0 + 2, z0 + 9, ...col);
          box(tw - 0.11, y0 + 0.02, tw - 0.09, y1 - 0.02, z0 + 4, z0 + 7, '#faf6ee', '#ded6c6', '#b0a894');
          box(0.18, (y0 + y1) / 2 - 0.02, tw - 0.12, (y0 + y1) / 2 + 0.02, z0 + 9, z0 + 12, ...foil);
        }
      }
      // Side upright panels fully enclosing the shelf ends
      box(0.06, 0.04, tw - 0.06, 0.14, 4, 60, ...OAK_TRIM);
      box(0.06, th - 0.14, tw - 0.06, th - 0.04, 4, 60, ...OAK_TRIM);
      box(0.07, th / 3 - 0.02, 0.09, th / 3 + 0.02, 4, 60, ...OAK_DARK);
      box(0.07, (2 * th) / 3 - 0.02, 0.09, (2 * th) / 3 + 0.02, 4, 60, ...OAK_DARK);
      box(0.05, th / 3 - 0.05, 0.08, th / 3 - 0.03, 28, 36, ...CHROME);
      box(0.05, (2 * th) / 3 + 0.03, 0.08, (2 * th) / 3 + 0.05, 28, 36, ...CHROME);
    }
    // Top molded cornice / capping slab (z = 60 .. 64)
    box(0.02, 0.04, tw - 0.02, th - 0.04, 60, 64, ...OAK_TRIM);
  });
}

export function buildMaitreDPodium(rot = 0) {
  const WALNUT = ['#4e2818', '#381c10', '#221008'];
  const WALNUT_HI = ['#723e26', '#562e1c', '#3a1e12'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];
  const BRASS_HI = ['#ffe68c', '#e0ae36', '#a27614'];
  const BLOTTER = ['#28342a', '#1a241c', '#101812'];
  const LEDGER = ['#fcf6e8', '#dfd4be', '#b4a890'];

  return isoSprite(1, 1, 42, (box) => {
    // Stepped plinth base with brass perimeter accent
    box(0.16, 0.16, 0.84, 0.84, 0, 3, ...WALNUT);
    box(0.18, 0.18, 0.82, 0.82, 3, 5, ...BRASS);
    box(0.20, 0.20, 0.80, 0.80, 5, 8, ...WALNUT_HI);

    // Fluted central column shaft
    box(0.32, 0.32, 0.68, 0.68, 8, 28, ...WALNUT);
    box(0.66, 0.38, 0.70, 0.62, 8, 28, ...WALNUT_HI); // vertical highlight flute
    box(0.38, 0.66, 0.62, 0.70, 8, 28, ...WALNUT_HI);

    // Upper lectern body & slanted reading apron
    box(0.18, 0.18, 0.82, 0.82, 28, 32, ...WALNUT_HI);
    box(0.14, 0.14, 0.86, 0.86, 32, 35, ...WALNUT);

    // Leather blotter mat on lectern
    box(0.20, 0.20, 0.80, 0.80, 35, 36, ...BLOTTER);

    // Open hotel reservation ledger book
    box(0.26, 0.26, 0.74, 0.74, 36, 38, ...LEDGER);
    // Center spine crease & red bookmark ribbon
    box(0.48, 0.26, 0.52, 0.74, 38, 38.5, '#7e1622', '#5c0e18', '#3c080e');
    box(0.49, 0.72, 0.51, 0.84, 34, 37, '#c82436', '#941424', '#640a14'); // hanging ribbon tail

    // Polished brass reading lamp with emerald/brass banker's shade
    box(0.66, 0.24, 0.76, 0.34, 36, 38, ...BRASS); // base
    box(0.70, 0.28, 0.72, 0.30, 38, 43, ...BRASS_HI); // curved gooseneck
    box(0.62, 0.24, 0.78, 0.34, 43, 46, ...BRASS); // lamp shade
    box(0.64, 0.26, 0.76, 0.32, 42, 43, '#fff4b4', '#ffd654', '#cca028'); // warm illumination
  });
}

export function buildGrandPiano(rot = 0) {
  const [tw, th] = [2, 2];
  const EBONY = ['#20242e', '#14161e', '#0a0c12'];
  const EBONY_HI = ['#384050', '#262c38', '#161a22'];
  const SOUNDBOARD = ['#c89c62', '#a07842', '#745428'];
  const GOLD_HARP = ['#f4c654', '#cb982c', '#926a14'];
  const GOLD_HI = ['#ffe68c', '#e0ae36', '#a27614'];
  const STRINGS = ['#d8e0e8', '#b0bcc8', '#808c98'];
  const KEYS_WHITE = ['#ffffff', '#f4f4f4', '#dcdcdc'];
  const KEYS_BLACK = ['#181a20', '#101216', '#080a0c'];
  const BRASS = ['#f6c667', '#d8a442', '#a07424'];
  const SHEET = ['#fffdf4', '#f0e8d0', '#c8be9e'];

  return isoSprite(tw, th, 46, (box) => {
    // 1. Far legs and central lyre (drawn first)
    // Leg 2: Front-right cheek leg (treble side)
    box(1.68, 0.22, 1.82, 0.36, 0, 3, ...BRASS);
    box(1.70, 0.24, 1.80, 0.34, 3, 16, ...EBONY);

    // Leg 3: Rear curved tail leg
    box(0.32, 1.55, 0.46, 1.69, 0, 3, ...BRASS);
    box(0.34, 1.57, 0.44, 1.67, 3, 16, ...EBONY);

    // Central lyre pedal assembly with 3 solid brass pedals (z = 1 .. 16)
    box(0.92, 0.36, 1.08, 0.44, 3, 16, ...EBONY); // lyre pillar
    box(0.86, 0.32, 0.92, 0.40, 1, 3.5, ...BRASS); // soft pedal
    box(0.97, 0.32, 1.03, 0.40, 1, 3.5, ...BRASS); // sostenuto pedal
    box(1.08, 0.32, 1.14, 0.40, 1, 3.5, ...BRASS); // sustain pedal

    // 2. Curved grand piano rim casing (z = 16 .. 26)
    // Front straight keybed case
    box(0.14, 0.12, 1.86, 0.48, 16, 26, ...EBONY);
    // Straight left spine rim
    box(0.14, 0.48, 0.52, 1.68, 16, 26, ...EBONY);
    // Straight right cheek rim
    box(1.52, 0.48, 1.86, 1.15, 16, 26, ...EBONY);
    // Inward bentside curve
    box(1.05, 1.05, 1.62, 1.50, 16, 26, ...EBONY);
    // Rear rounded tail rim
    box(0.22, 1.48, 0.95, 1.82, 16, 26, ...EBONY);
    // Glossy lacquer specular edge highlights
    box(0.14, 0.12, 1.86, 0.14, 25.2, 26.2, ...EBONY_HI);
    box(1.84, 0.14, 1.86, 1.14, 25.2, 26.2, ...EBONY_HI);

    // 3. Spruce soundboard interior (z = 20 .. 22)
    box(0.35, 0.44, 1.62, 1.58, 20, 22, ...SOUNDBOARD);

    // 4. Cast-iron gold harp plate frame (z = 22 .. 24)
    box(0.40, 0.48, 1.54, 0.60, 22, 24, ...GOLD_HARP);
    box(0.44, 0.60, 0.65, 1.45, 22, 24, ...GOLD_HARP);
    box(1.00, 0.60, 1.48, 1.25, 22, 24, ...GOLD_HARP);
    box(0.55, 1.10, 0.95, 1.55, 22, 24, ...GOLD_HARP);
    // Sound holes in gold harp
    box(0.70, 0.80, 0.86, 0.96, 22, 24.2, '#181208', '#100c04', '#080602');
    box(1.10, 0.85, 1.25, 1.00, 22, 24.2, '#181208', '#100c04', '#080602');

    // Silver piano strings stretched across soundboard
    for (let s = 0.52; s <= 1.42; s += 0.09) {
      box(s, 0.50, s + 0.02, 1.30, 23.5, 24.2, ...STRINGS);
    }

    // 5. Keyboard assembly (z = 21 .. 26.5)
    // Keybed recessed shelf
    box(0.22, 0.14, 1.78, 0.42, 21, 23, '#101216', '#0a0c0e', '#040608');
    // White ivory keys
    box(0.24, 0.14, 1.76, 0.38, 23, 25, ...KEYS_WHITE);
    // Black ebony sharps/flats (fine 2x raised keys)
    for (let k = 0.28; k <= 1.68; k += 0.075) {
      if (Math.abs(k - 0.73) < 0.02 || Math.abs(k - 1.255) < 0.02) continue; // natural half-step gap
      box(k, 0.14, k + 0.04, 0.30, 24.8, 26, ...KEYS_BLACK);
    }

    // Fallboard behind keys with gold brand script
    box(0.20, 0.38, 1.80, 0.45, 24, 27, ...EBONY);
    box(0.92, 0.37, 1.08, 0.40, 25.5, 26.5, ...GOLD_HI); // gold emblem

    // 6. Music desk & tilted open sheet music (z = 27 .. 36)
    box(0.68, 0.42, 1.32, 0.48, 26, 32, ...EBONY);
    box(0.72, 0.40, 1.28, 0.45, 27, 34, ...SHEET); // sheet music
    // Stave notation lines
    box(0.76, 0.39, 0.96, 0.41, 29, 29.8, '#262626', '#1a1a1a', '#0a0a0a');
    box(0.76, 0.39, 0.96, 0.41, 31, 31.8, '#262626', '#1a1a1a', '#0a0a0a');
    box(1.04, 0.39, 1.24, 0.41, 29, 29.8, '#262626', '#1a1a1a', '#0a0a0a');
    box(1.04, 0.39, 1.24, 0.41, 31, 31.8, '#262626', '#1a1a1a', '#0a0a0a');

    // 7. Open grand piano lid propped high on wooden lid stick (z = 26 .. 44)
    // Lid prop stick
    box(1.52, 0.82, 1.57, 0.87, 24, 40, '#8c5e38', '#6a4224', '#482a14');
    // Sculpted open lid propped at angle
    box(0.20, 0.44, 1.70, 1.72, 34, 42, ...EBONY);
    box(0.22, 0.42, 1.68, 0.50, 41, 43, ...EBONY_HI); // top propped lid bevel
    box(0.18, 0.46, 0.28, 1.70, 26, 36, ...EBONY); // hinge side

    // 8. Leg 1: Front-left spine cheek leg (bass side, clearly visible under spine)
    box(0.20, 0.50, 0.34, 0.64, 0, 3, ...BRASS);
    box(0.22, 0.52, 0.32, 0.62, 3, 16, ...EBONY);
  });
}

export function buildWallSconce(rot = 0) {
  const BRASS = ['#f4ca5c', '#c89e34', '#947018'];
  const BRASS_HI = ['#ffe68c', '#e0ae36', '#a27614'];
  const BRASS_DARK = ['#7c5812', '#5a3e0c', '#3a2606'];
  const FROSTED = ['#fffbf0', '#f4e6c8', '#d0bc94'];
  const GLOW = ['#fff29e', '#ffd048', '#d49818'];
  const CORE = ['#ffffff', '#fff8cc', '#ffe078'];

  return isoSprite(1, 1, 36, (box) => {
    // 1. Subtle warm incandescent wall glow halo (z = 10 .. 34)
    box(0.22, 0.02, 0.78, 0.10, 10, 32, '#503818', '#38260e', '#241608');
    box(0.28, 0.03, 0.72, 0.10, 14, 28, '#785020', '#543612', '#362008');

    // 2. Polished brass wall escutcheon mounting plate (z = 12 .. 26)
    box(0.32, 0.06, 0.68, 0.16, 12, 26, ...BRASS);
    box(0.36, 0.08, 0.64, 0.18, 14, 24, ...BRASS_HI); // stepped inner plate
    // Top and bottom mounting screw rivets
    box(0.48, 0.05, 0.52, 0.09, 23.5, 25, ...BRASS_DARK);
    box(0.48, 0.05, 0.52, 0.09, 13, 14.5, ...BRASS_DARK);

    // 3. Graceful swan-neck cast brass gooseneck arm (z = 15 .. 24)
    box(0.44, 0.16, 0.56, 0.42, 17, 21, ...BRASS);
    box(0.45, 0.38, 0.55, 0.52, 18, 24, ...BRASS_HI); // ascending curve
    // Turned decorative brass socket cup
    box(0.40, 0.44, 0.60, 0.64, 21, 25, ...BRASS);
    box(0.38, 0.42, 0.62, 0.66, 24, 26, ...BRASS_HI); // socket lip

    // 4. Glowing incandescent filament core (positioned INSIDE shade, drawn before frosted glass)
    box(0.42, 0.46, 0.58, 0.62, 26, 31, ...GLOW);
    box(0.46, 0.50, 0.54, 0.58, 27, 30, ...CORE);

    // 5. Frosted fluted glass tulip shade with scalloped petals (z = 25 .. 35)
    box(0.32, 0.36, 0.68, 0.72, 26, 33, ...FROSTED);
    // Fluted vertical petal ribs
    box(0.30, 0.34, 0.70, 0.74, 32, 35, ...FROSTED);
    box(0.28, 0.32, 0.72, 0.76, 34, 36, shade(FROSTED[0], 0.1), shade(FROSTED[1], 0.1), shade(FROSTED[2], 0.1)); // scalloped rim
  });
}

export function buildKitchenRange(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#b8c4d2', '#8e9aa8', '#646e7a'];
  const STEEL_HI = ['#ffffff', '#e2ebf4', '#b8c6d4'];
  const OVEN_DOOR = ['#282c34', '#1c1f24', '#101216'];
  const BURNER = ['#181a20', '#101216', '#080a0c'];
  const RED_KNOB = ['#ef4444', '#dc2626', '#991b1b'];
  const FLAME = ['#38bdf8', '#0284c7', '#f97316'];

  return isoSprite(tw, th, 42, (box) => {
    // 1. Heavy commercial stainless body (z = 0 .. 24)
    box(0.06, 0.08, tw - 0.06, th - 0.08, 0, 24, ...STEEL);

    // Twin commercial oven doors below with wide chrome pull handles
    if (tw > th) {
      box(0.10, 0.07, tw / 2 - 0.04, 0.09, 4, 20, ...OVEN_DOOR);
      box(tw / 2 + 0.04, 0.07, tw - 0.10, 0.09, 4, 20, ...OVEN_DOOR);
      box(0.14, 0.06, tw / 2 - 0.08, 0.08, 16, 18, ...STEEL_HI);
      box(tw / 2 + 0.08, 0.06, tw - 0.14, 0.08, 16, 18, ...STEEL_HI);
      // Red burner control knobs along front manifold rail
      for (let k = 0; k < 6; k++) {
        const kx = 0.14 + k * ((tw - 0.28) / 5);
        box(kx - 0.03, 0.06, kx + 0.03, 0.08, 21, 23, ...RED_KNOB);
      }
    } else {
      box(0.07, 0.10, 0.09, th / 2 - 0.04, 4, 20, ...OVEN_DOOR);
      box(0.07, th / 2 + 0.04, 0.09, th - 0.10, 4, 20, ...OVEN_DOOR);
      box(0.06, 0.14, 0.08, th / 2 - 0.08, 16, 18, ...STEEL_HI);
      box(0.06, th / 2 + 0.08, 0.08, th - 0.14, 16, 18, ...STEEL_HI);
      for (let k = 0; k < 6; k++) {
        const ky = 0.14 + k * ((th - 0.28) / 5);
        box(0.06, ky - 0.03, 0.08, ky + 0.03, 21, 23, ...RED_KNOB);
      }
    }

    // 2. Cast iron burner grates (z = 24 .. 26)
    box(0.08, 0.10, tw - 0.08, th - 0.10, 24, 26, ...BURNER);

    // 3. Cookware on range: Heavy copper stockpot & black carbon saute pan with flame
    const [p1x, p1y] = [0.16 * tw, 0.24 * th];
    box(p1x, p1y, p1x + 0.30, p1y + 0.30, 26, 34, '#ea580c', '#c2410c', '#7c2d12'); // copper pot
    box(p1x - 0.04, p1y + 0.11, p1x, p1y + 0.19, 30, 32, ...STEEL_HI); // left handle
    box(p1x + 0.30, p1y + 0.11, p1x + 0.34, p1y + 0.19, 30, 32, ...STEEL_HI); // right handle

    const [p2x, p2y] = [0.58 * tw, 0.28 * th];
    // Blue/orange gas flame ring beneath saute pan
    box(p2x + 0.04, p2y + 0.04, p2x + 0.26, p2y + 0.26, 26, 28, ...FLAME);
    box(p2x, p2y, p2x + 0.30, p2y + 0.30, 28, 31, ...OVEN_DOOR); // saute pan
    box(p2x + 0.26, p2y + 0.12, p2x + 0.44, p2y + 0.18, 30, 32, ...STEEL_HI); // pan handle
  });
}

export function buildKitchenPrepTable(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#c8d4e2', '#9eb0c2', '#728294'];
  const STEEL_HI = ['#ffffff', '#eaf0f8', '#c4d2e0'];
  const BOARD = ['#d8a468', '#b48048', '#805428'];

  return isoSprite(tw, th, 36, (box) => {
    // 1. Far tubular stainless legs (drawn first at ly = 0.10)
    const farLegs = [
      [0.08, 0.10],
      [tw - 0.18, 0.10]
    ];
    for (const [lx, ly] of farLegs) {
      box(lx + 0.01, ly + 0.01, lx + 0.09, ly + 0.09, 0, 3, ...STEEL_HI);
      box(lx, ly, lx + 0.10, ly + 0.10, 3, 24, ...STEEL);
    }

    // 2. Lower galvanised undershelf holding nested stainless hotel pans
    box(0.08, 0.10, tw - 0.08, th - 0.10, 4, 7, ...STEEL);
    box(0.20 * tw, 0.25 * th, 0.50 * tw, 0.75 * th, 7, 12, ...STEEL_HI); // hotel pans

    // 3. Rolled bullnose food-grade stainless top (z = 24 .. 27)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 24, 26, ...STEEL);
    box(0.02, 0.04, tw - 0.02, th - 0.04, 26, 27.5, ...STEEL_HI);

    // 4. Thick end-grain butcher block cutting board & chef's knife
    const [bx0, by0] = [0.15 * tw, 0.20 * th];
    const [bw, bh] = tw > th ? [0.42, 0.58] : [0.58, 0.42];
    box(bx0, by0, bx0 + bw, by0 + bh, 27.5, 30, ...BOARD);
    box(bx0 + 0.08, by0 + 0.10, bx0 + 0.32, by0 + 0.14, 30, 31, ...STEEL_HI);
    box(bx0 + 0.30, by0 + 0.10, bx0 + 0.38, by0 + 0.14, 30, 31.5, '#1e293b', '#0f172a', '#020617');

    // Fresh chopped herbs & prep bowls
    box(bx0 + bw + 0.08, by0 + 0.10, bx0 + bw + 0.24, by0 + 0.26, 27.5, 31, ...STEEL_HI);
    box(bx0 + bw + 0.10, by0 + 0.12, bx0 + bw + 0.22, by0 + 0.24, 31, 33, '#22c55e', '#16a34a', '#14532d');

    // 5. Near tubular stainless legs (drawn in front of undershelf and pans)
    const nearLegs = [
      [0.08, th - 0.20],
      [tw - 0.18, th - 0.20]
    ];
    for (const [lx, ly] of nearLegs) {
      box(lx + 0.01, ly + 0.01, lx + 0.09, ly + 0.09, 0, 3, ...STEEL_HI);
      box(lx, ly, lx + 0.10, ly + 0.10, 3, 24, ...STEEL);
    }
  });
}

export function buildKitchenSink(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#b8c6d6', '#8e9ea8', '#647280'];
  const STEEL_HI = ['#ffffff', '#e8f0f8', '#c0ccd8'];
  const WATER = ['#38bdf8', '#0284c7', '#0369a1'];

  return isoSprite(tw, th, 46, (box) => {
    // 1. Stainless cabinet body with lower doors (z = 0 .. 25)
    box(0.06, 0.08, tw - 0.06, th - 0.08, 0, 25, ...STEEL);

    // 2. High splashback guard along back wall
    if (tw > th) {
      box(0.04, 0.06, tw - 0.04, 0.12, 25, 36, ...STEEL);
    } else {
      box(0.06, 0.04, 0.12, th - 0.04, 25, 36, ...STEEL);
    }

    // 3. Counter deck with corrugated drainage washboards
    box(0.04, 0.06, tw - 0.04, th - 0.06, 24, 26, ...STEEL_HI);

    // 4. Double deep commercial sink basins
    const [b1x, b1y, b1w, b1h] = tw > th
      ? [0.12 * tw, 0.18 * th, 0.34, 0.64]
      : [0.18 * tw, 0.12 * th, 0.64, 0.34];
    const [b2x, b2y, b2w, b2h] = tw > th
      ? [0.54 * tw, 0.18 * th, 0.34, 0.64]
      : [0.18 * tw, 0.54 * th, 0.64, 0.34];

    // Left wash basin with sudsy water
    box(b1x, b1y, b1x + b1w, b1y + b1h, 16, 24, ...WATER);
    box(b1x + 0.04, b1y + 0.04, b1x + b1w - 0.04, b1y + b1h - 0.04, 23, 24.5, '#f0fdf4', '#dcfce7', '#bbf7d0'); // foam suds

    // Right rinse basin
    box(b2x, b2y, b2x + b2w, b2y + b2h, 16, 21, ...WATER);
    box(b2x + b2w / 2 - 0.03, b2y + b2h / 2 - 0.03, b2x + b2w / 2 + 0.03, b2y + b2h / 2 + 0.03, 16, 17, '#0f172a', '#020617', '#000000'); // drain

    // 5. Commercial high-arc pre-rinse coiled spring gooseneck faucet
    const [fx, fy] = tw > th ? [tw / 2, 0.14] : [0.14, th / 2];
    box(fx - 0.04, fy - 0.04, fx + 0.04, fy + 0.04, 26, 44, ...STEEL_HI);
    box(fx - 0.06, fy + 0.04, fx + 0.06, fy + 0.12, 38, 43, '#38bdf8', '#0284c7', '#0369a1'); // spray valve
  });
}

export function buildKitchenFridge(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const STEEL = ['#b8c6d4', '#8e9ca8', '#62707c'];
  const STEEL_HI = ['#ffffff', '#eaf2f8', '#c4d0dc'];
  const GRILLE = ['#282c34', '#1c1f24', '#101216'];
  const HANDLE = ['#e8edf4', '#bcc4ce', '#848c96'];

  return isoSprite(tw, th, 60, (box) => {
    // 1. Lower plinth / wheel base (z = 0 .. 3)
    box(0.06, 0.08, tw - 0.06, th - 0.08, 0, 3, '#22262e', '#16181e', '#0c0e12');

    // 2. Main refrigerator carcass (z = 3 .. 48)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 3, 48, ...STEEL);

    // Twin massive reach-in doors with center gasket seal
    if (tw > th) {
      box(0.06, 0.05, tw / 2 - 0.02, 0.07, 4, 46, ...STEEL_HI);
      box(tw / 2 + 0.02, 0.05, tw - 0.06, 0.07, 4, 46, ...STEEL_HI);
      box(tw / 2 - 0.02, 0.05, tw / 2 + 0.02, 0.07, 4, 46, '#181b20', '#101216', '#080a0c'); // gasket
      // Heavy cam-lift latch handles
      box(tw / 2 - 0.06, 0.04, tw / 2 - 0.04, 0.06, 22, 36, ...HANDLE);
      box(tw / 2 + 0.04, 0.04, tw / 2 + 0.06, 0.06, 22, 36, ...HANDLE);
      // Digital temperature readout display
      box(tw - 0.22, 0.04, tw - 0.12, 0.06, 42, 45, '#0f172a', '#020617', '#000000');
      box(tw - 0.20, 0.04, tw - 0.14, 0.06, 43, 44, '#38bdf8', '#0284c7', '#0369a1');
    } else {
      box(0.05, 0.06, 0.07, th / 2 - 0.02, 4, 46, ...STEEL_HI);
      box(0.05, th / 2 + 0.02, 0.07, th - 0.06, 4, 46, ...STEEL_HI);
      box(0.05, th / 2 - 0.02, 0.07, th / 2 + 0.02, 4, 46, '#181b20', '#101216', '#080a0c');
      box(0.04, th / 2 - 0.06, 0.06, th / 2 - 0.04, 22, 36, ...HANDLE);
      box(0.04, th / 2 + 0.04, 0.06, th / 2 + 0.06, 22, 36, ...HANDLE);
      box(0.04, th - 0.22, 0.06, th - 0.12, 42, 45, '#0f172a', '#020617', '#000000');
      box(0.04, th - 0.20, 0.06, th - 0.14, 43, 44, '#38bdf8', '#0284c7', '#0369a1');
    }

    // 3. Top-mounted commercial compressor housing with ventilation intake grilles (z = 48 .. 58)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 48, 58, ...STEEL);
    if (tw > th) {
      box(0.10, 0.05, tw - 0.10, 0.07, 50, 56, ...GRILLE);
    } else {
      box(0.05, 0.10, 0.07, th - 0.10, 50, 56, ...GRILLE);
    }
  });
}

export function buildKitchenPass(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 3] : [3, 1];
  const STEEL = ['#c8d4e2', '#9eb0c2', '#728294'];
  const STEEL_HI = ['#ffffff', '#eaf0f8', '#c4d2e0'];
  const HEAT = ['#ff5030', '#d82810', '#901004'];
  const HEAT_GLOW = ['#ffd4a4', '#ff8a44', '#cc4014'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];

  return isoSprite(tw, th, 46, (box) => {
    // 1. Heated stainless plating counter (z = 0 .. 25)
    box(0.04, 0.06, tw - 0.04, th - 0.06, 0, 24, ...STEEL);
    box(0.02, 0.04, tw - 0.02, th - 0.04, 24, 26, ...STEEL_HI);

    // 2. Stainless upright posts supporting overhead pass shelf (z = 26 .. 42)
    const posts = tw > th
      ? [[0.10, 0.12], [tw - 0.18, 0.12], [0.10, th - 0.20], [tw - 0.18, th - 0.20]]
      : [[0.12, 0.10], [0.12, th - 0.18], [tw - 0.20, 0.10], [tw - 0.20, th - 0.18]];
    for (const [px, py] of posts) {
      box(px, py, px + 0.08, py + 0.08, 26, 42, ...STEEL);
    }

    // 3. Overhead warming shelf (z = 40 .. 44)
    box(0.06, 0.08, tw - 0.06, th - 0.08, 40, 44, ...STEEL);

    // Infrared heat lamp fixtures & radiant glow cones (z = 36 .. 40)
    const lamp1 = tw > th ? [0.28 * tw, 0.35 * th] : [0.35 * tw, 0.28 * th];
    const lamp2 = tw > th ? [0.68 * tw, 0.35 * th] : [0.35 * tw, 0.68 * th];
    box(lamp1[0], lamp1[1], lamp1[0] + 0.20, lamp1[1] + 0.20, 37, 40, ...HEAT);
    box(lamp1[0] - 0.04, lamp1[1] - 0.04, lamp1[0] + 0.24, lamp1[1] + 0.24, 35, 37, ...HEAT_GLOW);
    box(lamp2[0], lamp2[1], lamp2[0] + 0.20, lamp2[1] + 0.20, 37, 40, ...HEAT);
    box(lamp2[0] - 0.04, lamp2[1] - 0.04, lamp2[0] + 0.24, lamp2[1] + 0.24, 35, 37, ...HEAT_GLOW);

    // Ticket order rail along front of warming shelf with white order slips
    if (tw > th) {
      box(0.12, 0.06, tw - 0.12, 0.08, 38, 40, ...STEEL_HI);
      box(0.25, 0.05, 0.35, 0.07, 34, 38, '#ffffff', '#f1f5f9', '#cbd5e1'); // ticket slip 1
      box(0.55, 0.05, 0.65, 0.07, 34, 38, '#ffffff', '#f1f5f9', '#cbd5e1'); // ticket slip 2
    } else {
      box(0.06, 0.12, 0.08, th - 0.12, 38, 40, ...STEEL_HI);
      box(0.05, 0.25, 0.07, 0.35, 34, 38, '#ffffff', '#f1f5f9', '#cbd5e1');
      box(0.05, 0.55, 0.07, 0.65, 34, 38, '#ffffff', '#f1f5f9', '#cbd5e1');
    }

    // Service call bell on counter
    const [bellX, bellY] = tw > th ? [tw - 0.25, 0.25] : [0.25, th - 0.25];
    box(bellX, bellY, bellX + 0.10, bellY + 0.10, 26, 28, ...BRASS);
    box(bellX + 0.04, bellY + 0.04, bellX + 0.06, bellY + 0.06, 28, 30, ...STEEL_HI);

    // Two plated gourmet dishes on the pass waiting for pickup
    const p1 = tw > th ? [0.26 * tw, 0.35 * th] : [0.35 * tw, 0.26 * th];
    const p2 = tw > th ? [0.66 * tw, 0.35 * th] : [0.35 * tw, 0.66 * th];
    box(p1[0], p1[1], p1[0] + 0.18, p1[1] + 0.18, 26, 28, '#ffffff', '#f8fafc', '#e2e8f0');
    box(p1[0] + 0.04, p1[1] + 0.04, p1[0] + 0.14, p1[1] + 0.14, 28, 30, '#854d0e', '#713f12', '#451a03'); // entree
    box(p2[0], p2[1], p2[0] + 0.18, p2[1] + 0.18, 26, 28, '#ffffff', '#f8fafc', '#e2e8f0');
    box(p2[0] + 0.04, p2[1] + 0.04, p2[0] + 0.14, p2[1] + 0.14, 28, 30, '#dc2626', '#b91c1c', '#7f1d1d');
  });
}

export function buildStartingBlock(rot = 0) {
  const BLOCK = ['#2563eb', '#1d4ed8', '#1e40af'];
  const BLOCK_DARK = ['#1e3a8a', '#172554', '#0f172a'];
  const TOP = ['#f8fafc', '#e2e8f0', '#cbd5e1'];
  const TREAD = ['#475569', '#334155', '#1e293b'];
  const STEEL = ['#e2e8f0', '#cbd5e1', '#94a3b8'];
  const STEEL_HI = ['#ffffff', '#f1f5f9', '#cbd5e1'];
  const NUM_BG = ['#0f172a', '#020617', '#000000'];
  const NUM = ['#ffffff', '#f8fafc', '#e2e8f0'];
  const laneNum = ((rot % 4 + 4) % 4) + 1;

  return isoSprite(1, 1, 26, (box) => {
    // Deck mounting base plate & anchor bolts (z = 0 .. 3)
    box(0.18, 0.18, 0.82, 0.82, 0, 3, ...BLOCK_DARK);
    box(0.20, 0.20, 0.24, 0.24, 0, 3.5, ...STEEL_HI);
    box(0.76, 0.20, 0.80, 0.24, 0, 3.5, ...STEEL_HI);
    box(0.20, 0.76, 0.24, 0.80, 0, 3.5, ...STEEL_HI);
    box(0.76, 0.76, 0.80, 0.80, 0, 3.5, ...STEEL_HI);

    // Sturdy powder-coated pedestal base (z = 3 .. 16)
    box(0.22, 0.22, 0.78, 0.78, 3, 16, ...BLOCK);

    // Forward-angled platform deck with high-traction textured non-slip tread (z = 16 .. 20)
    box(0.14, 0.14, 0.86, 0.86, 16, 19, ...TOP);
    box(0.16, 0.16, 0.84, 0.84, 19, 20.5, ...TREAD);

    // Stainless steel backstroke starting grab bar mounted to front (z = 16 .. 25)
    box(0.32, 0.08, 0.68, 0.14, 16, 24, ...STEEL);
    box(0.34, 0.08, 0.66, 0.12, 23, 25, ...STEEL_HI);

    // Number plaque on front face facing pool
    box(0.30, 0.79, 0.70, 0.81, 3, 14, ...NUM_BG);
    if (laneNum === 1) {
      box(0.46, 0.79, 0.54, 0.82, 4, 13, ...NUM);
    } else if (laneNum === 2) {
      box(0.38, 0.79, 0.62, 0.82, 11, 13, ...NUM);
      box(0.54, 0.79, 0.62, 0.82, 8, 11, ...NUM);
      box(0.38, 0.79, 0.62, 0.82, 7, 9, ...NUM);
      box(0.38, 0.79, 0.46, 0.82, 5, 7, ...NUM);
      box(0.38, 0.79, 0.62, 0.82, 3, 5, ...NUM);
    } else if (laneNum === 3) {
      box(0.38, 0.79, 0.62, 0.82, 11, 13, ...NUM);
      box(0.54, 0.79, 0.62, 0.82, 8, 11, ...NUM);
      box(0.38, 0.79, 0.62, 0.82, 7, 9, ...NUM);
      box(0.54, 0.79, 0.62, 0.82, 5, 7, ...NUM);
      box(0.38, 0.79, 0.62, 0.82, 3, 5, ...NUM);
    } else { // 4
      box(0.38, 0.79, 0.46, 0.82, 8, 13, ...NUM);
      box(0.38, 0.79, 0.62, 0.82, 7, 9, ...NUM);
      box(0.54, 0.79, 0.62, 0.82, 3, 13, ...NUM);
    }
  });
}

export function buildLaneRope(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const RED = ['#ef4444', '#dc2626', '#991b1b'];
  const WHITE = ['#ffffff', '#f1f5f9', '#cbd5e1'];
  const BLUE = ['#2563eb', '#1d4ed8', '#1e40af'];
  const STEEL = ['#d8e0e8', '#b0bcc8', '#808c98'];
  const CABLE = ['#475569', '#334155', '#1e293b'];

  return isoSprite(tw, th, 9, (box) => {
    // Stainless tensioning cable running through center
    if (rot % 2 === 0) {
      // Far deck anchor tension ratchet (z = 2 .. 7)
      box(0.02, 0.42, 0.12, 0.58, 2, 7, ...STEEL);
      box(0.04, 0.48, tw - 0.04, 0.52, 4, 6, ...CABLE);

      // Alternating anti-turbulent buoyant discs (6 repeating sections) drawn back to front
      const numDiscs = 6;
      const span = tw - 0.24;
      for (let i = 0; i < numDiscs; i++) {
        const x0 = 0.12 + (i / numDiscs) * span;
        const x1 = x0 + span / numDiscs - 0.03;
        const col = i % 2 === 0 ? RED : WHITE;
        box(x0, 0.36, x1, 0.64, 3, 7.5, ...col);
        // Disc ribbed outer turbine teeth at 2x density
        box(x0 + 0.02, 0.34, x1 - 0.02, 0.66, 4, 6.5, ...col);
      }
      // Near opposing wall anchor bracket
      box(tw - 0.12, 0.42, tw - 0.02, 0.58, 2, 7, ...STEEL);
    } else {
      // Far deck anchor tension ratchet (z = 2 .. 7)
      box(0.42, 0.02, 0.58, 0.12, 2, 7, ...STEEL);
      box(0.48, 0.04, 0.52, th - 0.04, 4, 6, ...CABLE);

      const numDiscs = 6;
      const span = th - 0.24;
      for (let i = 0; i < numDiscs; i++) {
        const y0 = 0.12 + (i / numDiscs) * span;
        const y1 = y0 + span / numDiscs - 0.03;
        const col = i % 2 === 0 ? RED : WHITE;
        box(0.36, y0, 0.64, y1, 3, 7.5, ...col);
        box(0.34, y0 + 0.02, 0.66, y1 - 0.02, 4, 6.5, ...col);
      }
      // Near opposing wall anchor bracket
      box(0.42, th - 0.12, 0.58, th - 0.02, 2, 7, ...STEEL);
    }
  });
}

export function buildPoolLadder(rot = 0) {
  const STEEL = ['#eaf0f8', '#c4d0dc', '#94a0b0'];
  const STEEL_HI = ['#ffffff', '#f4f8fc', '#d0dce8'];
  const RUBBER = ['#1e293b', '#0f172a', '#020617'];

  return isoSprite(1, 1, 40, (box) => {
    // Pool ladder mounts to deck coping and arches down into the water.
    // Back-to-front depth: far rail (NW) -> step treads -> near rail (SE).

    // 1. Far tubular handrail (NW, u = 0.20..0.30)
    // Deck escutcheon flange anchor plate
    box(0.18, 0.16, 0.32, 0.30, 0, 3, ...STEEL);
    // Rear vertical riser tube from deck
    box(0.22, 0.19, 0.28, 0.27, 3, 35, ...STEEL);
    box(0.21, 0.18, 0.26, 0.24, 3, 35, ...STEEL_HI);
    // Sweeping top arch curve curving forward over coping rim
    box(0.22, 0.23, 0.28, 0.54, 33, 38, ...STEEL);
    box(0.21, 0.23, 0.26, 0.54, 35.5, 38, ...STEEL_HI);
    // Vertical drop rail down along pool wall into water
    box(0.22, 0.48, 0.28, 0.56, 0, 35, ...STEEL);
    box(0.21, 0.48, 0.26, 0.53, 0, 35, ...STEEL_HI);
    // Submerged lower rubber bumper resting against pool wall
    box(0.20, 0.47, 0.30, 0.57, 0, 4, ...RUBBER);

    // 2. Stainless step treads spanning between rails (drawn between far and near rail)
    const treads = [8, 17, 26];
    for (const z of treads) {
      box(0.28, 0.48, 0.72, 0.56, z, z + 2.5, ...STEEL);
      box(0.32, 0.49, 0.68, 0.55, z + 2, z + 3, ...RUBBER); // non-skid tread pad
    }

    // 3. Near tubular handrail (SE, u = 0.68..0.78, cleanly occluding treads)
    // Deck escutcheon flange anchor plate
    box(0.68, 0.16, 0.82, 0.30, 0, 3, ...STEEL);
    // Rear vertical riser tube from deck
    box(0.72, 0.19, 0.78, 0.27, 3, 35, ...STEEL);
    box(0.71, 0.18, 0.76, 0.24, 3, 35, ...STEEL_HI);
    // Sweeping top arch curve curving forward over coping rim
    box(0.72, 0.23, 0.78, 0.54, 33, 38, ...STEEL);
    box(0.71, 0.23, 0.76, 0.54, 35.5, 38, ...STEEL_HI);
    // Vertical drop rail down along pool wall into water
    box(0.72, 0.48, 0.78, 0.56, 0, 35, ...STEEL);
    box(0.71, 0.48, 0.76, 0.53, 0, 35, ...STEEL_HI);
    // Submerged lower rubber bumper resting against pool wall
    box(0.70, 0.47, 0.80, 0.57, 0, 4, ...RUBBER);
  });
}

export function buildPoolLounger(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const TEAK = ['#c88a4e', '#a46c36', '#764c20'];
  const CUSHION = ['#ffffff', '#e0e8f0', '#b0c0d0'];
  const ACCENT = ['#00b4d8', '#0096c7', '#0077b6'];
  const WHEEL = ['#22262e', '#161a20', '#0c0e12'];

  return isoSprite(tw, th, 26, (box) => {
    if (tw >= th) {
      box(0.12, 0.14, 0.22, 0.24, 0, 8, ...TEAK);
      box(0.12, th - 0.24, 0.22, th - 0.14, 0, 8, ...TEAK);
      box(tw - 0.22, 0.14, tw - 0.12, 0.24, 0, 8, ...TEAK);
      box(tw - 0.22, th - 0.24, tw - 0.12, th - 0.14, 0, 8, ...TEAK);
      box(0.08, 0.08, 0.20, 0.14, 1, 6, ...WHEEL);
      box(0.08, th - 0.14, 0.20, th - 0.08, 1, 6, ...WHEEL);

      planks(box, 0.08, 0.12, tw - 0.08, th - 0.12, 6, 9, {
        dir: 'v',
        count: 5,
        gap: 0.025,
        wood: TEAK,
        grainDetail: true,
      });

      box(0.10, 0.14, tw - 0.10, th - 0.14, 9, 14, ...CUSHION);
      stitching(box, 0.10, 0.14, tw - 0.10, th - 0.14, 13.5, { piping: ACCENT, pipingHeight: 0.8 });

      box(0.10, 0.14, 0.65, th - 0.14, 14, 23, ...CUSHION);
      box(0.14, 0.20, 0.45, th - 0.20, 21, 25, ...ACCENT);
    } else {
      box(0.14, 0.12, 0.24, 0.22, 0, 8, ...TEAK);
      box(tw - 0.24, 0.12, tw - 0.14, 0.22, 0, 8, ...TEAK);
      box(0.14, th - 0.22, 0.24, th - 0.12, 0, 8, ...TEAK);
      box(tw - 0.24, th - 0.22, tw - 0.14, th - 0.12, 0, 8, ...TEAK);
      box(0.08, 0.08, 0.14, 0.20, 1, 6, ...WHEEL);
      box(tw - 0.14, 0.08, tw - 0.08, 0.20, 1, 6, ...WHEEL);

      planks(box, 0.12, 0.08, tw - 0.12, th - 0.08, 6, 9, {
        dir: 'u',
        count: 5,
        gap: 0.025,
        wood: TEAK,
        grainDetail: true,
      });

      box(0.14, 0.10, tw - 0.14, th - 0.10, 9, 14, ...CUSHION);
      stitching(box, 0.14, 0.10, tw - 0.14, th - 0.10, 13.5, { piping: ACCENT, pipingHeight: 0.8 });

      box(0.14, 0.10, tw - 0.14, 0.65, 14, 23, ...CUSHION);
      box(0.20, 0.14, tw - 0.20, 0.45, 21, 25, ...ACCENT);
    }
  });
}

export function buildPoolUmbrella(rot = 0) {
  const GRANITE = ['#64748b', '#475569', '#334155'];
  const MAST = ['#d97706', '#b45309', '#78350f'];
  const BRASS = ['#f4c654', '#cb982c', '#926a14'];
  const CANOPY_CYAN = ['#00b4d8', '#0077b6', '#03045e'];
  const CANOPY_WHITE = ['#ffffff', '#f1f5f9', '#cbd5e1'];
  const CANOPY_HI = ['#caf0f8', '#90e0ef', '#0096c7'];

  return isoSprite(1, 1, 64, (box) => {
    // 1. Heavy circular granite slab base with locking brass collar (z = 0 .. 4)
    box(0.24, 0.24, 0.76, 0.76, 0, 3, ...GRANITE);
    box(0.38, 0.38, 0.62, 0.62, 3, 5, ...BRASS);

    // 2. Far radial stretcher ribs (NW/NE, drawn before mast hub)
    box(0.18, 0.47, 0.44, 0.53, 44, 48, ...MAST); // NW rib
    box(0.47, 0.18, 0.53, 0.44, 44, 48, ...MAST); // NE rib

    // 3. Solid eucalyptus center mast pole (z = 4 .. 50)
    box(0.44, 0.44, 0.56, 0.56, 4, 50, ...MAST);
    box(0.42, 0.42, 0.58, 0.58, 44, 48, ...BRASS); // rib runner hub mechanism

    // 4. Near radial stretcher ribs (SE/SW, drawn after mast hub)
    box(0.56, 0.47, 0.82, 0.53, 44, 48, ...MAST); // SE rib
    box(0.47, 0.56, 0.53, 0.82, 44, 48, ...MAST); // SW rib

    // 5. Multi-tier octagonal resort canvas parasol canopy (z = 48 .. 64)
    // Tier 1: Wide octagonal scalloped canopy valance hem
    box(0.04, 0.04, 0.96, 0.96, 48, 53, ...CANOPY_CYAN);
    // Alternating white striped triangular canopy segments
    box(0.08, 0.30, 0.92, 0.70, 49, 54, ...CANOPY_WHITE);
    box(0.30, 0.08, 0.70, 0.92, 49, 54, ...CANOPY_WHITE);

    // Tier 2: Mid canopy rise
    box(0.16, 0.16, 0.84, 0.84, 53, 58, ...CANOPY_CYAN);
    box(0.24, 0.24, 0.76, 0.76, 54, 59, ...CANOPY_HI);

    // Tier 3: Conical apex with top wind vent cap
    box(0.30, 0.30, 0.70, 0.70, 58, 62, ...CANOPY_CYAN);
    box(0.40, 0.40, 0.60, 0.60, 62, 64, ...CANOPY_WHITE); // wind vent cap
    box(0.46, 0.46, 0.54, 0.54, 64, 65, ...BRASS); // top finial
  });
}

export function buildChangingCubicle(rot = 0) {
  const WALL = ['#f8fafc', '#e2e8f0', '#cbd5e1'];
  const TRIM = ['#64748b', '#475569', '#334155'];
  const CHROME = ['#e2e8f0', '#cbd5e1', '#94a3b8'];
  const CURTAIN = ['#0d9488', '#0f766e', '#115e59'];
  const CURTAIN_HI = ['#2dd4bf', '#14b8a6', '#0d9488'];
  const WOOD = ['#b45309', '#92400e', '#713f12'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Satin anodised aluminum upright corner posts (z = 0 .. 52)
    const posts = [
      [0.06, 0.06],
      [0.84, 0.06],
      [0.06, 0.84],
      [0.84, 0.84]
    ];
    for (const [px, py] of posts) {
      box(px, py, px + 0.10, py + 0.10, 0, 52, ...TRIM);
    }

    // 2. White moisture-resistant melamine privacy wall panels (z = 4 .. 48)
    box(0.08, 0.08, 0.92, 0.16, 4, 48, ...WALL); // back wall
    box(0.08, 0.16, 0.16, 0.84, 4, 48, ...WALL); // left wall
    box(0.84, 0.16, 0.92, 0.84, 4, 48, ...WALL); // right wall

    // Overhead ceiling bracing rail & curtain track (z = 48 .. 51)
    box(0.06, 0.06, 0.94, 0.94, 48, 51, ...TRIM);

    // 3. Interior corner changing bench & coat hook
    box(0.16, 0.20, 0.50, 0.50, 10, 14, ...WOOD);
    box(0.18, 0.14, 0.22, 0.18, 32, 36, ...CHROME); // coat hook

    // 4. Privacy front drape curtain with natural vertical pleat folds (z = 4 .. 48)
    box(0.16, 0.80, 0.84, 0.88, 4, 48, ...CURTAIN);
    // Pleat highlight folds at 2x density
    box(0.24, 0.84, 0.32, 0.90, 6, 46, ...CURTAIN_HI);
    box(0.44, 0.84, 0.52, 0.90, 6, 46, ...CURTAIN_HI);
    box(0.64, 0.84, 0.72, 0.90, 6, 46, ...CURTAIN_HI);
  });
}

export function buildSalonChair(rot = 0) {
  const CHROME = ['#e6edf6', '#b8c2d0', '#8894a4'];
  const LEATHER = ['#22242a', '#16181e', '#0c0e12'];
  const STITCH = ['#3a404c', '#282c36', '#1a1c24'];
  const MIRROR = ['#d2ecf8', '#a8d2e4', '#7eaab8'];
  const SHEEN = ['#ffffff', '#eaf6fd', '#c4e0f0'];

  return isoSprite(1, 1, 50, (box) => {
    // Heavy circular chrome hydraulic pump base with foot pedal (z = 0 .. 4)
    box(0.22, 0.22, 0.78, 0.78, 0, 4, ...CHROME);
    box(0.40, 0.40, 0.60, 0.60, 4, 14, ...CHROME);
    // Hydraulic pump foot lever
    box(0.22, 0.68, 0.32, 0.82, 3, 5, ...CHROME);

    // Contoured black faux-leather bucket seat with horizontal ribbed seams
    box(0.20, 0.20, 0.80, 0.78, 14, 20, ...LEATHER);
    box(0.22, 0.32, 0.78, 0.36, 19.5, 20.5, ...STITCH);
    box(0.22, 0.52, 0.78, 0.56, 19.5, 20.5, ...STITCH);

    // Chrome padded armrests
    box(0.14, 0.24, 0.22, 0.76, 20, 27, ...CHROME);
    box(0.78, 0.24, 0.86, 0.76, 20, 27, ...CHROME);
    box(0.12, 0.26, 0.24, 0.74, 26, 28, ...LEATHER);
    box(0.76, 0.26, 0.88, 0.74, 26, 28, ...LEATHER);

    // Backrest with horizontal fluting
    box(0.20, 0.16, 0.80, 0.32, 20, 36, ...LEATHER);
    box(0.22, 0.28, 0.78, 0.33, 25, 26, ...STITCH);
    box(0.22, 0.28, 0.78, 0.33, 30, 31, ...STITCH);

    // Padded chrome footrest bar extending forward
    box(0.32, 0.76, 0.68, 0.94, 7, 9, ...CHROME);
    box(0.36, 0.84, 0.64, 0.92, 9, 11, ...LEATHER);

    // Vanity mirror station behind
    box(0.10, 0.04, 0.90, 0.14, 0, 48, ...CHROME);
    box(0.14, 0.06, 0.86, 0.12, 14, 46, ...MIRROR);
    box(0.25, 0.07, 0.55, 0.11, 20, 42, ...SHEEN);
  });
}

export function buildMassageBed(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const BEECH = ['#dfb882', '#b88a52', '#865e28'];
  const LINEN = ['#f8f8fc', '#dce0e8', '#b0b8c4'];
  const TOWEL = ['#c8a2c8', '#a87ca8', '#805480'];
  const BOTTLE = ['#50b498', '#388c74', '#20604e'];

  return isoSprite(tw, th, 30, (box) => {
    // 4 sturdy beechwood legs with lower cross-stretchers (z = 0 .. 15)
    box(0.10, 0.12, 0.22, 0.24, 0, 15, ...BEECH);
    box(tw - 0.22, 0.12, tw - 0.10, 0.24, 0, 15, ...BEECH);
    box(0.10, th - 0.24, 0.22, th - 0.12, 0, 15, ...BEECH);
    box(tw - 0.22, th - 0.24, tw - 0.10, th - 0.12, 0, 15, ...BEECH);

    // Lower slatted timber shelf holding spare linens
    planks(box, 0.12, 0.14, tw - 0.12, th - 0.14, 4, 6, {
      dir: tw >= th ? 'v' : 'u',
      count: 4,
      gap: 0.03,
      wood: BEECH,
      grainDetail: true,
    });

    // Padded treatment mattress with stitched perimeter (z = 14 .. 23)
    box(0.08, 0.10, tw - 0.08, th - 0.10, 14, 23, ...LINEN);
    stitching(box, 0.08, 0.10, tw - 0.08, th - 0.10, 22.5, {
      piping: ['#ffffff', '#e8e8f0', '#c8c8d8'],
      pipingHeight: 0.8
    });

    // Ergonomic face cradle ring opening & folded waffle-weave spa towel
    if (tw >= th) {
      box(0.12, 0.40, 0.32, 0.60, 22, 25, '#c0c8d4', '#9ca4b2', '#78808e');
      box(0.16, 0.44, 0.28, 0.56, 21, 25.5, ...LINEN);
      box(1.20, 0.25, 1.65, 0.75, 23, 27, ...TOWEL);
      box(1.72, 0.35, 1.84, 0.47, 23, 28, ...BOTTLE);
    } else {
      box(0.40, 0.12, 0.60, 0.32, 22, 25, '#c0c8d4', '#9ca4b2', '#78808e');
      box(0.44, 0.16, 0.56, 0.28, 21, 25.5, ...LINEN);
      box(0.25, 1.20, 0.75, 1.65, 23, 27, ...TOWEL);
      box(0.35, 1.72, 0.47, 1.84, 23, 28, ...BOTTLE);
    }
  });
}

export function buildChangingRoomDoor(rot = 0) {
  const FRAME = ['#7c522e', '#5a3b20', '#3e2816'];
  const FRAME_HI = ['#9e6c3e', '#7c522e', '#5a381c'];
  const SLAT = ['#a06c3c', '#84542c', '#5e3c1e'];
  const SLAT_DARK = ['#6e4222', '#523016', '#38200e'];
  const BRASS = ['#ffd268', '#d4a43c', '#9e7820'];
  const STEEL = ['#e2e8f0', '#cbd5e1', '#94a3b8'];

  return isoSprite(1, 1, 56, (box) => {
    // 1. Deep door frame jamb & threshold
    box(0.06, 0.06, 0.94, 0.18, 0, 54, ...FRAME);
    box(0.06, 0.18, 0.18, 0.94, 0, 54, ...FRAME);
    box(0.82, 0.18, 0.94, 0.94, 0, 54, ...FRAME);
    box(0.04, 0.04, 0.96, 0.20, 52, 56, ...FRAME_HI); // top lintel moulding

    // 2. Door leaf body with stainless kickplate at base (z = 0 .. 50)
    box(0.18, 0.38, 0.82, 0.48, 0, 6, ...STEEL); // protective kickplate
    box(0.18, 0.38, 0.82, 0.48, 6, 50, ...SLAT);

    // 3. Louvered ventilation slats along upper and lower door panels at 2x density
    for (let z = 8; z < 22; z += 3) {
      box(0.24, 0.46, 0.76, 0.50, z, z + 1.5, ...SLAT_DARK);
    }
    for (let z = 28; z < 46; z += 3) {
      box(0.24, 0.46, 0.76, 0.50, z, z + 1.5, ...SLAT_DARK);
    }

    // 4. Commercial satin lever handle with privacy deadbolt
    box(0.72, 0.44, 0.80, 0.52, 22, 27, ...STEEL);
    box(0.70, 0.50, 0.82, 0.54, 25, 27, '#ffffff', '#f1f5f9', '#cbd5e1'); // lever handle

    // 5. Engraved brass room occupancy / number plate
    box(0.38, 0.46, 0.62, 0.50, 46, 50, ...BRASS);
  });
}

export function buildSpaPartition(rot = 0) {
  const FRAME = ['#4a3424', '#362418', '#241810'];
  const CHROME = ['#e4ecf2', '#bcc8d4', '#8898a6'];
  const CHROME_HI = ['#ffffff', '#eaf2f8', '#c0ccd8'];
  const GLASS = ['#a8e2de', '#76ccc4', '#4eaaa0'];
  const BAMBOO = ['#5ca876', '#428856', '#2c663e'];

  return isoSprite(1, 1, 52, (box) => {
    if (rot % 2 === 0) {
      // Wall partition along U axis (v centered at ~0.50)
      // 1. Far stanchion end post (NW, u = 0.04..0.16)
      box(0.04, 0.42, 0.16, 0.58, 0, 3, ...CHROME);
      box(0.06, 0.44, 0.14, 0.56, 3, 50, ...CHROME);
      box(0.05, 0.43, 0.15, 0.57, 50, 52, ...CHROME_HI);

      // 2. Teak bottom shoe and top capping rail
      box(0.06, 0.45, 0.94, 0.55, 3, 9, ...FRAME);
      box(0.06, 0.45, 0.94, 0.55, 47, 51, ...FRAME);

      // 3. Frosted acoustic privacy glass screen
      box(0.10, 0.47, 0.90, 0.53, 9, 47, ...GLASS);

      // 4. Etched bamboo canes and shoots
      box(0.28, 0.46, 0.34, 0.54, 12, 44, ...BAMBOO);
      box(0.27, 0.45, 0.35, 0.55, 24, 26, ...FRAME);
      box(0.27, 0.45, 0.35, 0.55, 35, 37, ...FRAME);
      box(0.34, 0.46, 0.44, 0.54, 26, 28, ...BAMBOO);

      box(0.60, 0.46, 0.66, 0.54, 14, 46, ...BAMBOO);
      box(0.59, 0.45, 0.67, 0.55, 22, 24, ...FRAME);
      box(0.59, 0.45, 0.67, 0.55, 33, 35, ...FRAME);
      box(0.52, 0.46, 0.60, 0.54, 35, 37, ...BAMBOO);

      // 5. Near stanchion end post (SE, u = 0.84..0.96, drawn last)
      box(0.84, 0.42, 0.96, 0.58, 0, 3, ...CHROME);
      box(0.86, 0.44, 0.94, 0.56, 3, 50, ...CHROME);
      box(0.85, 0.43, 0.95, 0.57, 50, 52, ...CHROME_HI);
    } else {
      // Wall partition along V axis (u centered at ~0.50)
      // 1. Far stanchion end post (NE, v = 0.04..0.16)
      box(0.42, 0.04, 0.58, 0.16, 0, 3, ...CHROME);
      box(0.44, 0.06, 0.56, 0.14, 3, 50, ...CHROME);
      box(0.43, 0.05, 0.57, 0.15, 50, 52, ...CHROME_HI);

      // 2. Teak bottom shoe and top capping rail
      box(0.45, 0.06, 0.55, 0.94, 3, 9, ...FRAME);
      box(0.45, 0.06, 0.55, 0.94, 47, 51, ...FRAME);

      // 3. Frosted acoustic privacy glass screen
      box(0.47, 0.10, 0.53, 0.90, 9, 47, ...GLASS);

      // 4. Etched bamboo canes and shoots
      box(0.46, 0.28, 0.54, 0.34, 12, 44, ...BAMBOO);
      box(0.45, 0.27, 0.55, 0.35, 24, 26, ...FRAME);
      box(0.45, 0.27, 0.55, 0.35, 35, 37, ...FRAME);
      box(0.46, 0.34, 0.54, 0.44, 26, 28, ...BAMBOO);

      box(0.46, 0.60, 0.54, 0.66, 14, 46, ...BAMBOO);
      box(0.45, 0.59, 0.55, 0.67, 22, 24, ...FRAME);
      box(0.45, 0.59, 0.55, 0.67, 33, 35, ...FRAME);
      box(0.46, 0.52, 0.54, 0.60, 35, 37, ...BAMBOO);

      // 5. Near stanchion end post (SW, v = 0.84..0.96, drawn last)
      box(0.42, 0.84, 0.58, 0.96, 0, 3, ...CHROME);
      box(0.44, 0.86, 0.56, 0.94, 3, 50, ...CHROME);
      box(0.43, 0.85, 0.57, 0.95, 50, 52, ...CHROME_HI);
    }
  });
}

export function buildSpaDoor(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const BRONZE = ['#6e4a2c', '#4e341e', '#322012'];
  const BRONZE_HI = ['#946842', '#724e30', '#4e341e'];
  const CHROME = ['#e4ecf4', '#bcc8d4', '#8a9aa8'];
  const CHROME_HI = ['#ffffff', '#eaf2f8', '#c0ccd8'];
  const GLASS = ['#a8e4e0', '#74ccc2', '#4eaaa0'];
  const SIGN = ['#103840', '#0a242a', '#06161a'];
  const GOLD = ['#ffd478', '#dca848', '#9e7428'];

  return isoSprite(tw, th, 58, (box) => {
    // Two side pillars leaving the center open for walking through
    if (rot % 2 === 0) {
      // Left door jamb & glass side light
      box(0.04, 0.12, 0.28, th - 0.12, 0, 54, ...BRONZE);
      box(0.08, 0.14, 0.24, th - 0.14, 6, 46, ...GLASS);
      // Stainless steel full-height architectural ladder pull handle
      box(0.26, 0.14, 0.29, 0.20, 18, 38, ...CHROME);
      box(0.27, 0.15, 0.30, 0.19, 20, 36, ...CHROME_HI);

      // Right door jamb & glass side light
      box(tw - 0.28, 0.12, tw - 0.04, th - 0.12, 0, 54, ...BRONZE);
      box(tw - 0.24, 0.14, tw - 0.08, th - 0.14, 6, 46, ...GLASS);
      box(tw - 0.29, 0.14, tw - 0.26, 0.20, 18, 38, ...CHROME);
      box(tw - 0.30, 0.15, tw - 0.27, 0.19, 20, 36, ...CHROME_HI);

      // Arched lintel header beam spanning overhead
      box(0.02, 0.10, tw - 0.02, th - 0.10, 46, 56, ...BRONZE);
      box(0.04, 0.08, tw - 0.04, th - 0.08, 55, 57, ...BRONZE_HI); // top moulding
      // "AZURE SPA" backlit transom sign
      box(0.32, 0.08, tw - 0.32, th - 0.08, 48, 54, ...SIGN);
      box(0.36, 0.06, tw - 0.36, th - 0.06, 49, 53, ...GOLD);
    } else {
      // Left / rear door jamb
      box(0.12, 0.04, tw - 0.12, 0.28, 0, 54, ...BRONZE);
      box(0.14, 0.08, tw - 0.14, 0.24, 6, 46, ...GLASS);
      box(0.14, 0.26, 0.20, 0.29, 18, 38, ...CHROME);
      box(0.15, 0.27, 0.19, 0.30, 20, 36, ...CHROME_HI);

      // Right / front door jamb
      box(0.12, th - 0.28, tw - 0.12, th - 0.04, 0, 54, ...BRONZE);
      box(0.14, th - 0.24, tw - 0.14, th - 0.08, 6, 46, ...GLASS);
      box(0.14, th - 0.29, 0.20, th - 0.26, 18, 38, ...CHROME);
      box(0.15, th - 0.30, 0.19, th - 0.27, 20, 36, ...CHROME_HI);

      // Overhead lintel beam
      box(0.10, 0.02, tw - 0.10, th - 0.02, 46, 56, ...BRONZE);
      box(0.08, 0.04, tw - 0.08, th - 0.04, 55, 57, ...BRONZE_HI);
      box(0.08, 0.32, tw - 0.08, th - 0.32, 48, 54, ...SIGN);
      box(0.06, 0.36, tw - 0.06, th - 0.36, 49, 53, ...GOLD);
    }
  });
}

export function buildPergola(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const CEDAR = ['#9e6438', '#7c4c28', '#58341a'];
  const BRACKET = ['#3a404c', '#282c36', '#1a1c24'];

  return isoSprite(tw, th, 58, (box) => {
    // 4 sturdy timber posts with galvanized steel footing shoes
    const postCoords = [
      [0.08, 0.08, 0.20, 0.20],
      [tw - 0.20, 0.08, tw - 0.08, 0.20],
      [0.08, th - 0.20, 0.20, th - 0.08],
      [tw - 0.20, th - 0.20, tw - 0.08, th - 0.08]
    ];
    for (const [u0, v0, u1, v1] of postCoords) {
      box(u0 - 0.01, v0 - 0.01, u1 + 0.01, v1 + 0.01, 0, 3, ...BRACKET);
      box(u0, v0, u1, v1, 3, 48, ...CEDAR);
      // Top post capital bracket
      box(u0 - 0.02, v0 - 0.02, u1 + 0.02, v1 + 0.02, 46, 48, ...BRACKET);
    }

    // Overhead primary beams running along the length
    if (tw >= th) {
      box(0.04, 0.10, tw - 0.04, 0.18, 48, 51, ...CEDAR);
      box(0.04, th - 0.18, tw - 0.04, th - 0.10, 48, 51, ...CEDAR);
      // Cross-rafter slats with gaps
      planks(box, 0.06, 0.04, tw - 0.06, th - 0.04, 51, 54, {
        dir: 'u',
        count: 5,
        gap: 0.05,
        wood: CEDAR,
        grainDetail: true,
      });
    } else {
      box(0.10, 0.04, 0.18, th - 0.04, 48, 51, ...CEDAR);
      box(tw - 0.18, 0.04, tw - 0.10, th - 0.04, 48, 51, ...CEDAR);
      planks(box, 0.04, 0.06, tw - 0.04, th - 0.06, 51, 54, {
        dir: 'v',
        count: 5,
        gap: 0.05,
        wood: CEDAR,
        grainDetail: true,
      });
    }

    // Climbing ivy & wisteria vine clusters draping over rafters and posts
    leafCluster(box, tw * 0.30, th * 0.35, 53, 0.30, 0.30, 6, {
      flowers: [{ x: 0, y: 0, z: 0.2, color: '#e879f9' }, { x: 0.1, y: 0.1, z: -0.2, color: '#c084fc' }]
    });
    leafCluster(box, tw * 0.70, th * 0.65, 54, 0.32, 0.30, 6, {
      flowers: [{ x: -0.1, y: 0, z: 0.3, color: '#f472b6' }, { x: 0.1, y: -0.1, z: -0.2, color: '#e879f9' }]
    });

    // Hanging trailing wisteria flower cluster drops
    box(tw * 0.28, th * 0.32, tw * 0.34, th * 0.38, 44, 49, '#d946ef', '#c026d3', '#86198f');
    box(tw * 0.68, th * 0.62, tw * 0.74, th * 0.68, 43, 49, '#ec4899', '#db2777', '#9d174d');
  });
}

export function buildArcadeReserved(rot = 0) {
  const [tw, th] = [2, 2];
  const DARK = ['#1a1028', '#120a1c', '#0a0610'];
  const CHROME = ['#eaf0f6', '#c4d0dc', '#90a0b0'];
  const CHROME_HI = ['#ffffff', '#eef4f8', '#c8d4e0'];
  const ROPE = ['#c8243c', '#981628', '#640c1a'];
  const GOLD = ['#f4c654', '#cb982c', '#926a14'];
  const NEON_CYAN = ['#22d3ee', '#06b6d4', '#0891b2'];

  return isoSprite(tw, th, 36, (box) => {
    // Glossy VIP floor tile deck
    box(0.04, 0.04, tw - 0.04, th - 0.04, 0, 2, ...DARK);
    // Gold braided rope border trim around perimeter
    box(0.10, 0.10, tw - 0.10, 0.18, 1, 2.5, ...GOLD);
    box(0.10, th - 0.18, tw - 0.10, th - 0.10, 1, 2.5, ...GOLD);
    box(0.10, 0.18, 0.18, th - 0.18, 1, 2.5, ...GOLD);
    box(tw - 0.18, 0.18, tw - 0.10, th - 0.18, 1, 2.5, ...GOLD);

    // Center illuminated VIP crown badge
    box(0.60, 0.60, 1.40, 1.40, 2, 3.5, ...NEON_CYAN);
    box(0.80, 0.80, 1.20, 1.20, 3.5, 4.5, ...GOLD);

    // 4 corner polished chrome stanchion posts with weighted dome bases
    const posts = [
      [0.16, 0.16],
      [tw - 0.32, 0.16],
      [0.16, th - 0.32],
      [tw - 0.32, th - 0.32]
    ];

    for (const [px, py] of posts) {
      // Weighted dome base
      box(px - 0.04, py - 0.04, px + 0.20, py + 0.20, 0, 4, ...CHROME);
      box(px, py, px + 0.16, py + 0.16, 4, 6, ...CHROME_HI);
      // Stanchion post shaft
      box(px + 0.04, py + 0.04, px + 0.12, py + 0.12, 6, 30, ...CHROME);
      // Top ball finial and collar ring
      box(px + 0.02, py + 0.02, px + 0.14, py + 0.14, 29, 32, ...GOLD);
      box(px + 0.03, py + 0.03, px + 0.13, py + 0.13, 32, 35, ...CHROME_HI);
    }

    // Heavy twisted velvet barrier ropes with catenary droop sag
    // Back rope (between post 0 and post 1)
    box(0.32, 0.18, tw - 0.32, 0.24, 22, 26, ...ROPE);
    box(0.70, 0.19, tw - 0.70, 0.23, 18, 22, ...ROPE); // lower droop center

    // Front rope (between post 2 and post 3)
    box(0.32, th - 0.24, tw - 0.32, th - 0.18, 22, 26, ...ROPE);
    box(0.70, th - 0.23, tw - 0.70, th - 0.19, 18, 22, ...ROPE);

    // Left rope (between post 0 and post 2)
    box(0.18, 0.32, 0.24, th - 0.32, 22, 26, ...ROPE);
    box(0.19, 0.70, 0.23, th - 0.70, 18, 22, ...ROPE);

    // Right rope (between post 1 and post 3)
    box(tw - 0.24, 0.32, tw - 0.18, th - 0.32, 22, 26, ...ROPE);
    box(tw - 0.23, 0.70, tw - 0.19, th - 0.70, 18, 22, ...ROPE);
  });
}

// v0.8.7 Arcade Cabinets (Noodle Snake, Brick Bash, Block Drop) + Leaderboard
export function buildArcadeSnake1(rot = 0) {
  const CHASSIS = ['#24422c', '#183020', '#102014'];
  const TMOLD = ['#f59e0b', '#d97706', '#92400e']; // amber gold T-molding
  const SCREEN_BEZEL = ['#121814', '#0c120e', '#060a08'];
  const SCREEN = ['#0a1810', '#06100a', '#040a06'];
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Woodgrain green cabinet base & carcass sides (z = 0 .. 18)
    box(0.12, 0.14, 0.88, 0.86, 0, 18, ...CHASSIS);
    box(0.11, 0.13, 0.13, 0.87, 0, 18, ...TMOLD);
    box(0.87, 0.13, 0.89, 0.87, 0, 18, ...TMOLD);

    // 2. Backlit "Noodle Snake" marquee (z = 43 .. 54, far/recessed back)
    box(0.12, 0.16, 0.88, 0.52, 43, 54, ...CHASSIS);
    box(0.11, 0.15, 0.89, 0.53, 51, 54, ...TMOLD);
    box(0.18, 0.48, 0.82, 0.53, 44, 52, '#fef08a', '#facc15', '#ca8a04'); // glowing amber
    box(0.22, 0.50, 0.78, 0.535, 46, 50, '#15803d', '#166534', '#14532d'); // title text

    // 3. CRT monitor showing Noodle Snake gameplay (z = 24 .. 43, drawn before control deck)
    box(0.14, 0.20, 0.86, 0.65, 24, 43, ...SCREEN_BEZEL);
    box(0.18, 0.24, 0.82, 0.60, 25, 42, ...SCREEN);
    box(0.20, 0.52, 0.30, 0.58, 38, 41, '#34d399', '#059669', '#047857'); // glass glare

    // Pixel snake segments curving across CRT grid
    box(0.30, 0.32, 0.68, 0.38, 28, 32, '#4ade80', '#22c55e', '#16a34a'); // snake body
    box(0.62, 0.38, 0.68, 0.56, 28, 32, '#4ade80', '#22c55e', '#16a34a');
    box(0.36, 0.50, 0.62, 0.56, 32, 36, '#4ade80', '#22c55e', '#16a34a'); // head
    box(0.32, 0.60, 0.40, 0.66, 34, 38, '#ff3344', '#cc1c2c', '#8c0e18'); // glowing fruit target
    box(0.34, 0.62, 0.38, 0.64, 38, 39, '#86efac', '#4ade80', '#22c55e');

    // 4. Slanted control panel deck extending forward (z = 18 .. 25)
    box(0.12, 0.40, 0.88, 0.88, 18, 25, ...CHASSIS);
    box(0.11, 0.39, 0.89, 0.89, 23.5, 25.5, ...TMOLD);

    // Ball-top red joystick & action buttons
    box(0.24, 0.60, 0.32, 0.68, 25, 27, ...CHROME);
    box(0.22, 0.58, 0.34, 0.70, 27, 31, '#ef4444', '#dc2626', '#991b1b');
    box(0.52, 0.64, 0.60, 0.72, 25, 26.5, '#eab308', '#ca8a04', '#a16207'); // yellow button
    box(0.68, 0.60, 0.76, 0.68, 25, 26.5, '#22c55e', '#16a34a', '#15803d'); // green button

    // 5. Double coin door on front face (z = 3 .. 16)
    box(0.28, 0.80, 0.72, 0.87, 3, 16, '#181a20', '#101216', '#080a0c');
    box(0.34, 0.85, 0.44, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.56, 0.85, 0.66, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.34, 0.84, 0.44, 0.88, 4.5, 7, '#0e1014', '#080a0c', '#040406');
    box(0.56, 0.84, 0.66, 0.88, 4.5, 7, '#0e1014', '#080a0c', '#040406');
  });
}

export function buildArcadeSnake2(rot = 0) {
  const CHASSIS = ['#421a38', '#2e1026', '#1a0816'];
  const TMOLD = ['#00e5ff', '#00b4cc', '#007a8a']; // neon cyan T-mold
  const SCREEN_BEZEL = ['#1a0e1e', '#120816', '#0a040e'];
  const SCREEN = ['#14081e', '#0c0414', '#06020a'];
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Cyberpunk neon-cyan cabinet base & carcass (z = 0 .. 18)
    box(0.12, 0.14, 0.88, 0.86, 0, 18, ...CHASSIS);
    box(0.11, 0.13, 0.13, 0.87, 0, 18, ...TMOLD);
    box(0.87, 0.13, 0.89, 0.87, 0, 18, ...TMOLD);

    // 2. Holographic "Neon Snake" marquee (z = 43 .. 54, far back)
    box(0.12, 0.16, 0.88, 0.52, 43, 54, ...CHASSIS);
    box(0.11, 0.15, 0.89, 0.53, 51, 54, ...TMOLD);
    box(0.18, 0.48, 0.82, 0.53, 44, 52, '#ff007f', '#c70063', '#8a0044'); // hot magenta
    box(0.22, 0.50, 0.78, 0.535, 46, 50, '#80d8ff', '#40c4ff', '#00b0ff'); // cyan neon title

    // 3. CRT display showing high-contrast neon serpent trails (z = 24 .. 43)
    box(0.14, 0.20, 0.86, 0.65, 24, 43, ...SCREEN_BEZEL);
    box(0.18, 0.24, 0.82, 0.60, 25, 42, ...SCREEN);
    box(0.20, 0.52, 0.30, 0.58, 38, 41, '#ff007f', '#c70063', '#8a0044');

    // Neon glowing trailing snake
    box(0.28, 0.36, 0.50, 0.42, 28, 32, '#00e676', '#00b85c', '#007a3d');
    box(0.44, 0.42, 0.50, 0.62, 28, 34, '#00e676', '#00b85c', '#007a3d');
    box(0.44, 0.56, 0.72, 0.62, 32, 36, '#00e676', '#00b85c', '#007a3d');
    box(0.68, 0.36, 0.76, 0.44, 30, 36, '#ffd600', '#c7a700', '#8a7400'); // glowing orb

    // 4. Control deck with illuminated LED joystick (z = 18 .. 25)
    box(0.12, 0.40, 0.88, 0.88, 18, 25, ...CHASSIS);
    box(0.11, 0.39, 0.89, 0.89, 23.5, 25.5, ...TMOLD);

    // Illuminated cyan ball-top joystick
    box(0.24, 0.60, 0.32, 0.68, 25, 27, ...CHROME);
    box(0.22, 0.58, 0.34, 0.70, 27, 31, '#00e5ff', '#00b4cc', '#007a8a');
    box(0.52, 0.64, 0.60, 0.72, 25, 26.5, '#ff007f', '#c70063', '#8a0044'); // hot pink button
    box(0.68, 0.60, 0.76, 0.68, 25, 26.5, '#76ff03', '#5cc702', '#3d8501'); // neon green button

    // 5. Black light coin door (z = 3 .. 16)
    box(0.28, 0.80, 0.72, 0.87, 3, 16, '#181422', '#100c18', '#08060e');
    box(0.34, 0.85, 0.44, 0.88, 8, 12, '#00e5ff', '#00b4cc', '#007a8a');
    box(0.56, 0.85, 0.66, 0.88, 8, 12, '#00e5ff', '#00b4cc', '#007a8a');
    box(0.34, 0.84, 0.44, 0.88, 4.5, 7, '#08060e', '#040208', '#020004');
    box(0.56, 0.84, 0.66, 0.88, 4.5, 7, '#08060e', '#040208', '#020004');
  });
}

export function buildArcadeBreakout1(rot = 0) {
  const CHASSIS = ['#c25e1a', '#9e460e', '#6e2e06'];
  const TMOLD = ['#fef08a', '#facc15', '#ca8a04']; // warm cream T-mold
  const SCREEN_BEZEL = ['#1a1410', '#120e0a', '#0a0806'];
  const SCREEN = ['#0e1424', '#080c18', '#040610'];
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Vintage 1970s orange cabinet carcass body (z = 0 .. 18)
    box(0.12, 0.14, 0.88, 0.86, 0, 18, ...CHASSIS);
    box(0.11, 0.13, 0.13, 0.87, 0, 18, ...TMOLD);
    box(0.87, 0.13, 0.89, 0.87, 0, 18, ...TMOLD);

    // 2. Backlit "Brick Bash" marquee (z = 43 .. 54, far back)
    box(0.12, 0.16, 0.88, 0.52, 43, 54, ...CHASSIS);
    box(0.11, 0.15, 0.89, 0.53, 51, 54, ...TMOLD);
    box(0.18, 0.48, 0.82, 0.53, 44, 52, '#ff6d00', '#cc5700', '#8f3d00'); // warm orange
    box(0.22, 0.50, 0.78, 0.535, 46, 50, '#fff3e0', '#ffe0b2', '#ffb74d'); // retro lettering

    // 3. CRT display showing multi-color brick wall, paddle, and ball (z = 24 .. 43)
    box(0.14, 0.20, 0.86, 0.65, 24, 43, ...SCREEN_BEZEL);
    box(0.18, 0.24, 0.82, 0.60, 25, 42, ...SCREEN);
    box(0.20, 0.52, 0.30, 0.58, 38, 41, '#38bdf8', '#0284c7', '#0369a1');

    // 4-row brick wall
    box(0.24, 0.30, 0.40, 0.35, 37, 40, '#ff1744', '#cc0e34', '#8a0620');
    box(0.44, 0.30, 0.60, 0.35, 37, 40, '#ffd600', '#c7a700', '#8a7400');
    box(0.64, 0.30, 0.80, 0.35, 37, 40, '#00e5ff', '#00b4cc', '#007a8a');
    box(0.32, 0.38, 0.48, 0.43, 33, 36, '#76ff03', '#5cc702', '#3d8501');
    box(0.52, 0.38, 0.68, 0.43, 33, 36, '#ff9100', '#cc7400', '#8a4e00');

    // Ball & reflecting paddle
    box(0.48, 0.50, 0.54, 0.54, 29, 32, '#ffffff', '#e0e0e0', '#b0b0b0');
    box(0.36, 0.58, 0.66, 0.62, 26, 29, '#00e5ff', '#00b4cc', '#007a8a');

    // 4. Control deck with precision spinner dial (z = 18 .. 25)
    box(0.12, 0.40, 0.88, 0.88, 18, 25, ...CHASSIS);
    box(0.11, 0.39, 0.89, 0.89, 23.5, 25.5, ...TMOLD);

    // Precision aluminum rotary paddle spinner knob
    box(0.24, 0.58, 0.40, 0.74, 25, 29, ...CHROME);
    box(0.28, 0.62, 0.36, 0.70, 29, 31, '#ffffff', '#e8e8e8', '#cccccc'); // top indicator dimple
    // Ball launch button
    box(0.60, 0.60, 0.72, 0.72, 25, 27, '#ef4444', '#dc2626', '#991b1b');

    // 5. Front speaker slots & coin door (z = 3 .. 16)
    box(0.28, 0.80, 0.72, 0.87, 3, 16, '#181a20', '#101216', '#080a0c');
    box(0.34, 0.85, 0.44, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.56, 0.85, 0.66, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.34, 0.84, 0.44, 0.88, 4.5, 7, '#0e1014', '#080a0c', '#040406');
    box(0.56, 0.84, 0.66, 0.88, 4.5, 7, '#0e1014', '#080a0c', '#040406');
  });
}

export function buildArcadeBreakout2(rot = 0) {
  const CHASSIS = ['#322842', '#221a2e', '#140e1c'];
  const TMOLD = ['#ff0055', '#cc0044', '#88002e']; // hot red/magenta T-mold
  const SCREEN_BEZEL = ['#161220', '#0e0a16', '#08060e'];
  const SCREEN = ['#100a18', '#080410', '#040208'];
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. High-octane Turbo cabinet carcass base (z = 0 .. 18)
    box(0.12, 0.14, 0.88, 0.86, 0, 18, ...CHASSIS);
    box(0.11, 0.13, 0.13, 0.87, 0, 18, ...TMOLD);
    box(0.87, 0.13, 0.89, 0.87, 0, 18, ...TMOLD);

    // 2. Backlit "Turbo Brick" marquee (z = 43 .. 54, far back)
    box(0.12, 0.16, 0.88, 0.52, 43, 54, ...CHASSIS);
    box(0.11, 0.15, 0.89, 0.53, 51, 54, ...TMOLD);
    box(0.18, 0.48, 0.82, 0.53, 44, 52, '#d50000', '#a00000', '#6b0000');
    box(0.22, 0.50, 0.78, 0.535, 46, 50, '#ff8a80', '#ff5252', '#ff1744');

    // 3. CRT display showing multi-ball powerups & laser beams (z = 24 .. 43)
    box(0.14, 0.20, 0.86, 0.65, 24, 43, ...SCREEN_BEZEL);
    box(0.18, 0.24, 0.82, 0.60, 25, 42, ...SCREEN);
    box(0.20, 0.52, 0.30, 0.58, 38, 41, '#ff4081', '#d42862', '#941440');

    // Turbo neon bricks
    box(0.24, 0.30, 0.42, 0.35, 37, 40, '#ff4081', '#d42862', '#941440');
    box(0.46, 0.30, 0.64, 0.35, 37, 40, '#76ff03', '#5cc702', '#3d8501');
    box(0.36, 0.38, 0.54, 0.43, 33, 36, '#ffd600', '#c7a700', '#8a7400');
    // Multi-balls
    box(0.40, 0.48, 0.46, 0.52, 29, 32, '#ffff00', '#d4d400', '#949400');
    box(0.54, 0.46, 0.60, 0.50, 31, 34, '#00e5ff', '#00b4cc', '#007a8a');
    // Metallic wide paddle
    box(0.32, 0.58, 0.68, 0.62, 26, 29, '#eceff1', '#cfd8dc', '#b0bec5');

    // 4. Control deck with heavy spinner & dual turbo launch buttons (z = 18 .. 25)
    box(0.12, 0.40, 0.88, 0.88, 18, 25, ...CHASSIS);
    box(0.11, 0.39, 0.89, 0.89, 23.5, 25.5, ...TMOLD);

    box(0.24, 0.58, 0.40, 0.74, 25, 29, ...CHROME);
    box(0.28, 0.62, 0.36, 0.70, 29, 31, '#ff0055', '#cc0044', '#88002e');
    box(0.54, 0.62, 0.62, 0.70, 25, 27, '#ffd600', '#c7a700', '#8a7400'); // launch 1
    box(0.68, 0.62, 0.76, 0.70, 25, 27, '#ff1744', '#cc0e34', '#8a0620'); // launch 2

    // 5. Coin door with neon return (z = 3 .. 16)
    box(0.28, 0.80, 0.72, 0.87, 3, 16, '#181222', '#100a18', '#08040e');
    box(0.34, 0.85, 0.44, 0.88, 8, 12, '#ff0055', '#cc0044', '#88002e');
    box(0.56, 0.85, 0.66, 0.88, 8, 12, '#ff0055', '#cc0044', '#88002e');
    box(0.34, 0.84, 0.44, 0.88, 4.5, 7, '#08040e', '#040208', '#020004');
    box(0.56, 0.84, 0.66, 0.88, 4.5, 7, '#08040e', '#040208', '#020004');
  });
}

export function buildArcadeDrop1(rot = 0) {
  const CHASSIS = ['#1e2954', '#141c3c', '#0c1026'];
  const TMOLD = ['#38bdf8', '#0284c7', '#0369a1']; // cyan T-mold
  const SCREEN_BEZEL = ['#101424', '#0a0c18', '#060810'];
  const SCREEN = ['#080c18', '#040610', '#02040a'];
  const CHROME = ['#b8c4d2', '#909ea8', '#62707e'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Deep cobalt blue cabinet carcass base (z = 0 .. 18)
    box(0.12, 0.14, 0.88, 0.86, 0, 18, ...CHASSIS);
    box(0.11, 0.13, 0.13, 0.87, 0, 18, ...TMOLD);
    box(0.87, 0.13, 0.89, 0.87, 0, 18, ...TMOLD);

    // 2. Backlit "Block Drop" marquee (z = 43 .. 54, far back)
    box(0.12, 0.16, 0.88, 0.52, 43, 54, ...CHASSIS);
    box(0.11, 0.15, 0.89, 0.53, 51, 54, ...TMOLD);
    box(0.18, 0.48, 0.82, 0.53, 44, 52, '#00b0ff', '#008ecc', '#005f8a');
    box(0.22, 0.50, 0.78, 0.535, 46, 50, '#e1f5fe', '#b3e5fc', '#81d4fa');

    // 3. CRT screen displaying falling polyomino shapes (z = 24 .. 43)
    box(0.14, 0.20, 0.86, 0.65, 24, 43, ...SCREEN_BEZEL);
    box(0.18, 0.24, 0.82, 0.60, 25, 42, ...SCREEN);
    box(0.20, 0.52, 0.30, 0.58, 38, 41, '#38bdf8', '#0284c7', '#0369a1');

    // Falling polyomino tetromino pieces
    box(0.40, 0.34, 0.56, 0.38, 36, 40, '#00e5ff', '#00b4cc', '#007a8a'); // cyan I-piece
    box(0.30, 0.44, 0.46, 0.48, 30, 34, '#ff9100', '#cc7400', '#8a4e00'); // orange L
    box(0.46, 0.44, 0.62, 0.48, 30, 34, '#b388ff', '#8f5fe8', '#633bb8'); // purple T
    box(0.36, 0.54, 0.68, 0.58, 26, 29, '#00e676', '#00b85c', '#007a3d'); // clearing matrix line

    // 4. Control deck with 4-way joystick & rotation buttons (z = 18 .. 25)
    box(0.12, 0.40, 0.88, 0.88, 18, 25, ...CHASSIS);
    box(0.11, 0.39, 0.89, 0.89, 23.5, 25.5, ...TMOLD);

    box(0.24, 0.60, 0.32, 0.68, 25, 27, ...CHROME);
    box(0.22, 0.58, 0.34, 0.70, 27, 31, '#00b0ff', '#008ecc', '#005f8a'); // blue joystick
    box(0.52, 0.64, 0.60, 0.72, 25, 26.5, '#b388ff', '#8f5fe8', '#633bb8'); // rotate
    box(0.68, 0.60, 0.76, 0.68, 25, 26.5, '#00e5ff', '#00b4cc', '#007a8a'); // hard drop

    // 5. Coin door (z = 3 .. 16)
    box(0.28, 0.80, 0.72, 0.87, 3, 16, '#181a24', '#101218', '#080a10');
    box(0.34, 0.85, 0.44, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.56, 0.85, 0.66, 0.88, 8, 12, '#ff9800', '#e65100', '#b23c00');
    box(0.34, 0.84, 0.44, 0.88, 4.5, 7, '#0e1016', '#080a0e', '#040408');
    box(0.56, 0.84, 0.66, 0.88, 4.5, 7, '#0e1016', '#080a0e', '#040408');
  });
}

export function buildArcadeDrop2(rot = 0) {
  const CHASSIS = ['#282c38', '#1c2028', '#101218'];
  const TMOLD = ['#ffd700', '#d4af37', '#997a15']; // golden T-mold
  const SCREEN_BEZEL = ['#14161e', '#0e1016', '#080a0e'];
  const SCREEN = ['#0a0e18', '#060810', '#04060a'];
  const CHROME = ['#e0e4ec', '#b0b8c4', '#808894'];

  return isoSprite(1, 1, 54, (box) => {
    // 1. Deluxe golden edition cabinet carcass base (z = 0 .. 18)
    box(0.12, 0.14, 0.88, 0.86, 0, 18, ...CHASSIS);
    box(0.11, 0.13, 0.13, 0.87, 0, 18, ...TMOLD);
    box(0.87, 0.13, 0.89, 0.87, 0, 18, ...TMOLD);

    // 2. Backlit "Block Drop Deluxe" gold marquee (z = 43 .. 54, far back)
    box(0.12, 0.16, 0.88, 0.52, 43, 54, ...CHASSIS);
    box(0.11, 0.15, 0.89, 0.53, 51, 54, ...TMOLD);
    box(0.18, 0.48, 0.82, 0.53, 44, 52, '#ffd600', '#c7a700', '#8a7400'); // gold marquee
    box(0.22, 0.50, 0.78, 0.535, 46, 50, '#1a1c24', '#101218', '#080a10'); // deluxe lettering

    // 3. CRT display showing deluxe action & multipliers (z = 24 .. 43)
    box(0.14, 0.20, 0.86, 0.65, 24, 43, ...SCREEN_BEZEL);
    box(0.18, 0.24, 0.82, 0.60, 25, 42, ...SCREEN);
    box(0.20, 0.52, 0.30, 0.58, 38, 41, '#ffd700', '#d4af37', '#997a15');

    // Cyberpunk blocks & x4 multiplier badge
    box(0.32, 0.34, 0.48, 0.38, 36, 40, '#ffd600', '#c7a700', '#8a7400');
    box(0.50, 0.34, 0.66, 0.38, 36, 40, '#ff1744', '#cc0e34', '#8a0620');
    box(0.38, 0.44, 0.60, 0.48, 31, 35, '#00e5ff', '#00b4cc', '#007a8a');
    box(0.28, 0.56, 0.72, 0.60, 26, 29, '#76ff03', '#5cc702', '#3d8501');

    // 4. Control deck with gold ball joystick & backlit buttons (z = 18 .. 25)
    box(0.12, 0.40, 0.88, 0.88, 18, 25, ...CHASSIS);
    box(0.11, 0.39, 0.89, 0.89, 23.5, 25.5, ...TMOLD);

    box(0.24, 0.60, 0.32, 0.68, 25, 27, ...CHROME);
    box(0.22, 0.58, 0.34, 0.70, 27, 31, '#ffd700', '#d4af37', '#997a15'); // gold joystick
    box(0.52, 0.64, 0.60, 0.72, 25, 26.5, '#00e5ff', '#00b4cc', '#007a8a');
    box(0.68, 0.60, 0.76, 0.68, 25, 26.5, '#ff4081', '#d42862', '#941440');

    // 5. Front stereo sound speakers with gold rings & coin door (z = 3 .. 16)
    box(0.18, 0.82, 0.28, 0.86, 6, 14, ...TMOLD); // left gold speaker ring
    box(0.20, 0.84, 0.26, 0.87, 8, 12, '#181a20', '#101216', '#080a0c');
    box(0.72, 0.82, 0.82, 0.86, 6, 14, ...TMOLD); // right gold speaker ring
    box(0.74, 0.84, 0.80, 0.87, 8, 12, '#181a20', '#101216', '#080a0c');

    box(0.36, 0.80, 0.64, 0.87, 3, 16, '#181a24', '#101218', '#080a10');
    box(0.40, 0.85, 0.48, 0.88, 8, 12, '#ffd700', '#d4af37', '#997a15'); // gold coin slot
    box(0.52, 0.85, 0.60, 0.88, 8, 12, '#ffd700', '#d4af37', '#997a15');
  });
}

export function buildArcadeLeaderboard(rot = 0) {
  const [tw, th] = rot % 2 ? [1, 2] : [2, 1];
  const FRAME = ['#1e1c2e', '#161422', '#0e0c16'];
  const DISPLAY = ['#0a0e1c', '#060812', '#04050c'];
  const GOLD = ['#ffd700', '#d4af37', '#997a15'];
  const SILVER = ['#e2e8f0', '#cbd5e1', '#94a3b8'];
  const BRONZE = ['#f97316', '#ea580c', '#c2410c'];
  const NEON_CYAN = ['#00e5ff', '#00b4cc', '#007a8a'];
  const NEON_GREEN = ['#00e676', '#00b85c', '#007a3d'];
  const NEON_PINK = ['#ff007f', '#c70063', '#8a0044'];

  return isoSprite(tw, th, 56, (box) => {
    // 1. Heavy tubular steel pedestal support uprights (z = 0 .. 14)
    box(0.12 * tw, 0.20 * th, 0.32 * tw, 0.80 * th, 0, 14, ...FRAME);
    box(0.68 * tw, 0.20 * th, 0.88 * tw, 0.80 * th, 0, 14, ...FRAME);
    box(0.10 * tw, 0.35 * th, 0.90 * tw, 0.65 * th, 4, 8, '#2c2842', '#201c30', '#161222');

    // 2. Scoreboard monitor enclosure (z = 14 .. 46)
    box(0.06 * tw, 0.12 * th, tw - 0.06 * tw, th - 0.12 * th, 14, 46, ...FRAME);

    // Flanking illuminated vertical neon pillar lights
    box(0.04 * tw, 0.14 * th, 0.08 * tw, th - 0.14 * th, 15, 45, ...NEON_CYAN);
    box(tw - 0.08 * tw, 0.14 * th, tw - 0.04 * tw, th - 0.14 * th, 15, 45, ...NEON_PINK);

    // Deep black LED display screen face (z = 16 .. 44)
    box(0.10 * tw, 0.18 * th, tw - 0.10 * tw, th - 0.18 * th, 16, 44, ...DISPLAY);

    // 3. Multi-line high score matrix with medals & rank indicators
    // Rank #1: Gold trophy & gold LED score row
    box(0.16 * tw, 0.22 * th, 0.22 * tw, 0.28 * th, 36, 41, ...GOLD); // #1 Gold trophy medal
    box(0.24 * tw, 0.24 * th, 0.50 * tw, 0.28 * th, 37, 40, ...GOLD); // player 1 name
    box(0.60 * tw, 0.24 * th, 0.84 * tw, 0.28 * th, 37, 40, ...GOLD); // score 999,990

    // Rank #2: Silver medal & cyan LED score row
    box(0.16 * tw, 0.30 * th, 0.22 * tw, 0.36 * th, 29, 34, ...SILVER); // #2 Silver medal
    box(0.24 * tw, 0.32 * th, 0.48 * tw, 0.36 * th, 30, 33, ...NEON_CYAN);
    box(0.62 * tw, 0.32 * th, 0.84 * tw, 0.36 * th, 30, 33, ...NEON_CYAN);

    // Rank #3: Bronze medal & green LED score row
    box(0.16 * tw, 0.38 * th, 0.22 * tw, 0.44 * th, 22, 27, ...BRONZE); // #3 Bronze medal
    box(0.24 * tw, 0.40 * th, 0.46 * tw, 0.44 * th, 23, 26, ...NEON_GREEN);
    box(0.64 * tw, 0.40 * th, 0.84 * tw, 0.44 * th, 23, 26, ...NEON_GREEN);

    // 4. Crown ornament on top of scoreboard
    box(0.44 * tw, 0.20 * th, 0.56 * tw, 0.32 * th, 46, 52, ...GOLD);

    // 5. Marquee top banner: "HALL OF FAME" (z = 46 .. 56)
    box(0.06 * tw, 0.10 * th, tw - 0.06 * tw, 0.45 * th, 46, 54, ...NEON_PINK);
    box(0.14 * tw, 0.38 * th, tw - 0.14 * tw, 0.46 * th, 48, 52, '#fff9c4', '#ffd54f', '#ffb300');
  });
}

export function buildGumballTrophySprite(rot = 0) {
  const WALNUT = ['#4e2816', '#381c0e', '#221008'];
  const WALNUT_HI = ['#723e24', '#562e1a', '#3a1e10'];
  const BRASS = ['#f6c667', '#d8a442', '#a07424'];
  const BRASS_HI = ['#ffe898', '#e2b040', '#a87818'];
  const VELVET = ['#b81832', '#8c1024', '#580816'];
  const GOLD = ['#ffe066', '#f6b820', '#b87e10'];
  const GOLD_HI = ['#ffffff', '#fffde0', '#ffea70'];
  const GLASS = ['#e6f6fc', '#bce2f2', '#84bed4'];
  const GLASS_HI = ['#ffffff', '#f2fbff', '#d4eff8'];

  return isoSprite(1, 1, 42, (box) => {
    // 1. Stepped dark walnut plinth base (z = 0 .. 9)
    box(0.18, 0.18, 0.82, 0.82, 0, 4, ...WALNUT);
    box(0.22, 0.22, 0.78, 0.78, 4, 7, ...WALNUT_HI);
    box(0.24, 0.24, 0.76, 0.76, 7, 9, ...WALNUT);

    // Engraved polished brass plaque on front face
    box(0.32, 0.80, 0.68, 0.84, 1.5, 5.5, ...BRASS);
    box(0.34, 0.83, 0.66, 0.85, 2.5, 4.5, ...BRASS_HI); // engraved face
    box(0.38, 0.84, 0.62, 0.855, 3.2, 3.8, '#3a2008', '#2a1604', '#1a0c02'); // inscription line

    // 2. Tufted crimson velvet presentation cushion with indent (z = 9 .. 13)
    box(0.26, 0.26, 0.74, 0.74, 9, 12.5, ...VELVET);
    box(0.28, 0.28, 0.72, 0.72, 12, 13, shade(VELVET[0], 0.15), shade(VELVET[1], 0.1), shade(VELVET[2], 0.1));
    box(0.44, 0.44, 0.56, 0.56, 11.5, 12.2, '#640816', '#480410', '#30020a'); // center button dimple

    // 3. Clear hand-blown glass bell jar cloche base rim (z = 12 .. 14)
    box(0.25, 0.25, 0.75, 0.75, 12, 14, ...GLASS);

    // 4. Legendary floating Golden Gumball (z = 15 .. 27)
    // Spherical volume layers
    box(0.38, 0.38, 0.62, 0.62, 15, 27, ...GOLD);
    box(0.35, 0.35, 0.65, 0.65, 17, 25, ...GOLD);
    box(0.33, 0.33, 0.67, 0.67, 19, 23, ...GOLD);
    // Brilliant warm specular highlight and star glint
    box(0.35, 0.35, 0.45, 0.45, 22, 26, ...GOLD_HI);
    box(0.33, 0.39, 0.47, 0.41, 23.5, 24.5, ...GOLD_HI); // horizontal sparkle bar
    box(0.39, 0.33, 0.41, 0.47, 23.5, 24.5, ...GOLD_HI); // vertical sparkle bar
    // Secondary ambient floor reflection on underside
    box(0.42, 0.42, 0.58, 0.58, 15, 16.5, '#ffd240', '#d89814', '#946608');

    // 5. Transparent bell jar glass body (z = 14 .. 32)
    // Diagonal specular sheen reflections on glass surface
    box(0.26, 0.26, 0.30, 0.74, 14, 30, ...GLASS_HI); // west glass wall reflection
    box(0.26, 0.26, 0.74, 0.30, 14, 30, ...GLASS_HI); // north glass wall reflection
    box(0.28, 0.68, 0.36, 0.72, 16, 28, ...GLASS); // front specular glint
    box(0.68, 0.28, 0.72, 0.36, 16, 28, ...GLASS); // right specular glint

    // Curved bell jar glass dome top (z = 30 .. 34)
    box(0.28, 0.28, 0.72, 0.72, 30, 32.5, ...GLASS);
    box(0.32, 0.32, 0.68, 0.68, 32, 34, ...GLASS_HI);

    // Turned multifaceted crystal finial handle on top (z = 34 .. 39)
    box(0.44, 0.44, 0.56, 0.56, 34, 36.5, ...GLASS);
    box(0.42, 0.42, 0.58, 0.58, 36.5, 39, ...GLASS_HI);
  });
}

// ---------- v0.12.0 Sky viewing platforms & open-edge railings ----------

// Coin-operated binocular/telescope sky viewer on its own small raised dais.
// `rot` picks which way the barrels point (0 down/south, 1 right/east,
// 2 up/north, 3 left/west) so it can be aimed outward on any railing edge.
export function buildSkyViewerSprite(rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const STONE = ['#8c94a2', '#6e7482', '#4e5460'];
  const STONE_LT = ['#a8b0be', '#8c94a2', '#6c7280'];
  const RUBBER_PAD = ['#282c34', '#1c2026', '#101216'];
  const RED = ['#c83c48', '#a02834', '#701822'];
  const RED_DK = ['#8e1e28', '#68121c', '#460a12'];
  const CHROME = ['#e4eaf2', '#b4c0cc', '#7e8a98'];
  const CHROME_HI = ['#ffffff', '#f4f8fc', '#d0dae6'];
  const LENS_COATING = ['#1e3a5f', '#102238', '#081220'];
  const LENS_GLINT = ['#38bdf8', '#0284c7', '#0369a1'];
  const RUBBER_HOOD = ['#1a1c22', '#121418', '#080a0c'];
  const BRASS = ['#f6c667', '#d8a442', '#a07424'];
  const BRASS_HI = ['#ffe898', '#e2b040', '#a87818'];

  return isoSprite(1, 1, 56, (box) => {
    // 1. Heavy stepped circular dais platform (z = 0 .. 6)
    box(0.04, 0.04, 0.96, 0.96, 0, 3, ...STONE);
    box(0.12, 0.12, 0.88, 0.88, 3, 6, ...STONE_LT);
    // Diamond-plate non-slip rubber tourist footpad
    box(0.18, 0.18, 0.82, 0.82, 6, 6.8, ...RUBBER_PAD);

    // 2. Cast-iron pedestal base flange with bolt studs (z = 6 .. 10)
    box(0.30, 0.30, 0.70, 0.70, 6.8, 10, ...RED_DK);
    box(0.31, 0.31, 0.37, 0.37, 9.5, 11, ...CHROME); // bolt
    box(0.63, 0.31, 0.69, 0.37, 9.5, 11, ...CHROME);
    box(0.31, 0.63, 0.37, 0.69, 9.5, 11, ...CHROME);
    box(0.63, 0.63, 0.69, 0.69, 9.5, 11, ...CHROME);

    // 3. Powder-coated red coin-op column (z = 10 .. 30)
    box(0.34, 0.34, 0.66, 0.66, 10, 30, ...RED);

    // Solid brass coin-meter box & timer mechanism
    box(0.38, 0.31, 0.62, 0.36, 15, 23, ...BRASS);
    box(0.40, 0.30, 0.60, 0.33, 16, 22, ...BRASS_HI); // faceplate
    box(0.47, 0.29, 0.53, 0.31, 19, 21.5, '#121418', '#0a0c0e', '#040608'); // coin slot
    box(0.45, 0.29, 0.55, 0.31, 16.5, 18, '#121418', '#0a0c0e', '#040608'); // coin return cup

    // 4. Heavy cast steel swiveling yoke mount (z = 30 .. 36)
    box(0.28, 0.28, 0.72, 0.72, 30, 34, ...CHROME);
    box(0.32, 0.32, 0.68, 0.68, 34, 37, ...CHROME_HI);
    // Swivel locking knob
    box(0.70, 0.44, 0.76, 0.56, 33, 36, ...BRASS);

    // 5. Twin optical binocular barrels with lenses, rubber hoods, and focus wheel
    const barrel = (u0, v0, u1, v1) => {
      box(u0, v0, u1, v1, 37, 48, ...CHROME);
      box(u0 + 0.02, v0 + 0.02, u1 - 0.02, v1 - 0.02, 47, 48.5, ...CHROME_HI);
    };
    const sunshield = (u0, v0, u1, v1) => box(u0, v0, u1, v1, 36, 49, ...RED);
    const lens = (u0, v0, u1, v1) => {
      box(u0, v0, u1, v1, 41, 47, ...LENS_COATING);
      box(u0 + 0.02, v0 + 0.02, u1 - 0.02, v1 - 0.02, 46, 47.5, ...LENS_GLINT); // blue reflection
    };
    const eyepiece = (u0, v0, u1, v1) => {
      box(u0, v0, u1, v1, 38, 44, ...BRASS);
      box(u0 - 0.01, v0 - 0.01, u1 + 0.01, v1 + 0.01, 39, 43.5, ...RUBBER_HOOD); // rubber hood
    };
    const focusWheel = (u0, v0, u1, v1) => box(u0, v0, u1, v1, 43, 47, ...BRASS_HI);

    if (r === 0) { // facing south (+v): objective south (near), eyepiece north (far)
      eyepiece(0.31, 0.08, 0.45, 0.22); eyepiece(0.55, 0.08, 0.69, 0.22);
      barrel(0.30, 0.20, 0.46, 0.86); barrel(0.54, 0.20, 0.70, 0.86);
      focusWheel(0.45, 0.46, 0.55, 0.58);
      sunshield(0.28, 0.80, 0.48, 0.94); sunshield(0.52, 0.80, 0.72, 0.94);
      lens(0.30, 0.86, 0.46, 0.96); lens(0.54, 0.86, 0.70, 0.96);
    } else if (r === 2) { // facing north (-v): objective north (far), eyepiece south (near)
      lens(0.30, 0.04, 0.46, 0.14); lens(0.54, 0.04, 0.70, 0.14);
      sunshield(0.28, 0.06, 0.48, 0.20); sunshield(0.52, 0.06, 0.72, 0.20);
      barrel(0.30, 0.14, 0.46, 0.80); barrel(0.54, 0.14, 0.70, 0.80);
      focusWheel(0.45, 0.42, 0.55, 0.54);
      eyepiece(0.31, 0.78, 0.45, 0.92); eyepiece(0.55, 0.78, 0.69, 0.92);
    } else if (r === 1) { // facing east (+u): objective east (near), eyepiece west (far)
      eyepiece(0.08, 0.31, 0.22, 0.45); eyepiece(0.08, 0.55, 0.22, 0.69);
      barrel(0.20, 0.30, 0.86, 0.46); barrel(0.20, 0.54, 0.86, 0.70);
      focusWheel(0.46, 0.45, 0.58, 0.55);
      sunshield(0.80, 0.28, 0.94, 0.48); sunshield(0.80, 0.52, 0.94, 0.72);
      lens(0.86, 0.30, 0.96, 0.46); lens(0.86, 0.54, 0.96, 0.70);
    } else { // facing west (-u): objective west (far), eyepiece east (near)
      lens(0.04, 0.30, 0.14, 0.46); lens(0.04, 0.54, 0.14, 0.70);
      sunshield(0.06, 0.28, 0.20, 0.48); sunshield(0.06, 0.52, 0.20, 0.72);
      barrel(0.14, 0.30, 0.80, 0.46); barrel(0.14, 0.54, 0.80, 0.70);
      focusWheel(0.42, 0.45, 0.54, 0.55);
      eyepiece(0.78, 0.31, 0.92, 0.45); eyepiece(0.78, 0.55, 0.92, 0.69);
    }
  });
}

// Low glass-and-chrome safety railing that tiles seamlessly along an open
// floor edge; `edge` picks which far side of the tile it hugs.
export function buildEdgeRailSegment(edge = 'south') {
  const METAL = ['#c2ccd6', '#8fa0b0', '#55626f'];
  const GLASS = ['#a0d8f2', '#6fb6dd', '#3f7f9f'];
  const t = 0.09;
  return isoSprite(1, 1, 30, (box) => {
    if (edge === 'east') {
      box(1 - t, 0, 1, 1, 0, 3, ...METAL);
      box(1 - t * 0.7, 0.04, 1 - t * 0.25, 0.22, 3, 24, ...METAL);
      box(1 - t * 0.7, 0.78, 1 - t * 0.25, 0.96, 3, 24, ...METAL);
      box(1 - t, 0.06, 1 - t * 0.3, 0.94, 3, 22, ...GLASS);
      box(1 - t, 0, 1, 1, 24, 27, ...METAL);
    } else {
      box(0, 1 - t, 1, 1, 0, 3, ...METAL);
      box(0.04, 1 - t * 0.7, 0.22, 1 - t * 0.25, 3, 24, ...METAL);
      box(0.78, 1 - t * 0.7, 0.96, 1 - t * 0.25, 3, 24, ...METAL);
      box(0.06, 1 - t, 0.94, 1 - t * 0.3, 3, 22, ...GLASS);
      box(0, 1 - t, 1, 1, 24, 27, ...METAL);
    }
  });
}

export const FURNITURE_BUILDERS = {
  stool: (rot, layer) => buildStoolSprite(rot),
  sofa: (rot, layer) => buildSofaSprite('#e2607a', rot, layer),
  rooftopSofa: (rot, layer) => buildSofaSprite('#5aa0e2', rot, layer),
  lamp: (rot) => buildLampSprite(rot),
  plant: (rot) => buildPlantSprite(rot),
  rug: (rot) => buildRugSprite(rot),
  neonSign: (rot) => buildNeonSignSprite(rot),
  jukebox: (rot) => buildJukeboxSprite(rot),
  armchair: (rot, layer) => buildArmchairSprite(rot, layer),
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
  diningChair: (rot, layer) => buildDiningChairSprite(rot, layer),
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
  // v0.8.3 Hotel Layout Expansion Models
  gymMirror: (rot) => buildGymMirror(rot),
  exerciseBike: (rot) => buildExerciseBike(rot),
  rowingMachine: (rot) => buildRowingMachine(rot),
  squatRack: (rot) => buildSquatRack(rot),
  gymLockers: (rot) => buildGymLockers(rot),
  waterCooler: (rot) => buildWaterCooler(rot),
  roundDiningTable: (rot) => buildRoundDiningTable(rot),
  diningBooth: (rot, layer) => buildDiningBooth(rot, layer),
  wineWall: (rot) => buildWineWall(rot),
  maitreDPodium: (rot) => buildMaitreDPodium(rot),
  grandPiano: (rot) => buildGrandPiano(rot),
  wallSconce: (rot) => buildWallSconce(rot),
  kitchenRange: (rot) => buildKitchenRange(rot),
  kitchenPrepTable: (rot) => buildKitchenPrepTable(rot),
  kitchenSink: (rot) => buildKitchenSink(rot),
  kitchenFridge: (rot) => buildKitchenFridge(rot),
  kitchenPass: (rot) => buildKitchenPass(rot),
  startingBlock: (rot) => buildStartingBlock(rot),
  laneRope: (rot) => buildLaneRope(rot),
  poolLadder: (rot) => buildPoolLadder(rot),
  poolLounger: (rot) => buildPoolLounger(rot),
  poolUmbrella: (rot) => buildPoolUmbrella(rot),
  changingCubicle: (rot) => buildChangingCubicle(rot),
  changingRoomDoor: (rot) => buildChangingRoomDoor(rot),
  salonChair: (rot) => buildSalonChair(rot),
  massageBed: (rot) => buildMassageBed(rot),
  spaPartition: (rot) => buildSpaPartition(rot),
  spaDoor: (rot) => buildSpaDoor(rot),
  pergola: (rot) => buildPergola(rot),
  arcadeReserved: (rot) => buildArcadeReserved(rot),
  // v0.8.7 Arcade Cabinets & Leaderboard
  arcadeSnake1: (rot) => buildArcadeSnake1(rot),
  arcadeSnake2: (rot) => buildArcadeSnake2(rot),
  arcadeBreakout1: (rot) => buildArcadeBreakout1(rot),
  arcadeBreakout2: (rot) => buildArcadeBreakout2(rot),
  arcadeDrop1: (rot) => buildArcadeDrop1(rot),
  arcadeDrop2: (rot) => buildArcadeDrop2(rot),
  arcadeLeaderboard: (rot) => buildArcadeLeaderboard(rot),
  // v0.9.1 Gumball collection trophy
  gumballTrophy: (rot) => buildGumballTrophySprite(rot),
  wardrobe: (rot) => buildWardrobeSprite(rot),
  // v0.12.0 Sky viewing platforms
  skyViewer: (rot) => buildSkyViewerSprite(rot),
};

export function buildWardrobeSprite(rot = 0) {
  const WOOD = ['#9e6030', '#7e4820', '#5c3214'];
  const WOOD_DARK = ['#723a18', '#54280e', '#3a1806'];
  const TRIM = ['#b8743c', '#985828', '#703e18'];
  const TRIM_HI = ['#cca068', '#b08048', '#865a2e'];
  const BRASS = ['#f6c667', '#d89b34', '#a06e1e'];
  const BRASS_HI = ['#ffe898', '#e2b040', '#a87818'];
  const PLINTH = ['#7c441c', '#623414', '#48240c'];

  return isoSprite(1, 1, 58, (box) => {
    // 4 turned wooden bun feet
    box(0.12, 0.12, 0.24, 0.24, 0, 3, ...WOOD_DARK);
    box(0.76, 0.12, 0.88, 0.24, 0, 3, ...WOOD_DARK);
    box(0.12, 0.76, 0.24, 0.88, 0, 3, ...WOOD_DARK);
    box(0.76, 0.76, 0.88, 0.88, 0, 3, ...WOOD_DARK);

    // Stepped plinth base with moulding
    box(0.06, 0.06, 0.94, 0.94, 3, 6, ...PLINTH);
    box(0.08, 0.08, 0.92, 0.92, 6, 8, ...TRIM);

    // Main wardrobe carcass body
    box(0.10, 0.10, 0.90, 0.90, 8, 52, ...WOOD);

    // Dual doors with recessed panels on front face
    if (rot % 2 === 0) {
      // Front is south-west face (v = 0.90)
      // Left door stile & recessed panel
      box(0.14, 0.86, 0.48, 0.91, 10, 50, ...TRIM);
      box(0.18, 0.88, 0.44, 0.92, 14, 46, ...WOOD_DARK); // inner recessed panel
      box(0.20, 0.89, 0.42, 0.93, 16, 44, ...WOOD); // raised center field

      // Right door stile & recessed panel
      box(0.52, 0.86, 0.86, 0.91, 10, 50, ...TRIM);
      box(0.56, 0.88, 0.82, 0.92, 14, 46, ...WOOD_DARK);
      box(0.58, 0.89, 0.80, 0.93, 16, 44, ...WOOD);

      // Center vertical meeting stile seam
      box(0.48, 0.86, 0.52, 0.91, 8, 52, ...WOOD_DARK);

      // Ornate brass teardrop pull handles & keyholes
      box(0.44, 0.89, 0.47, 0.93, 26, 32, ...BRASS);
      box(0.44, 0.91, 0.46, 0.94, 27, 30, ...BRASS_HI);
      box(0.53, 0.89, 0.56, 0.93, 26, 32, ...BRASS);
      box(0.54, 0.91, 0.56, 0.94, 27, 30, ...BRASS_HI);

      // Exposed side panel recessed moulding
      box(0.86, 0.14, 0.91, 0.86, 10, 50, ...TRIM);
      box(0.88, 0.18, 0.92, 0.82, 14, 46, ...WOOD_DARK);
    } else {
      // Front is south-east face (u = 0.90)
      box(0.86, 0.14, 0.91, 0.48, 10, 50, ...TRIM);
      box(0.88, 0.18, 0.92, 0.44, 14, 46, ...WOOD_DARK);
      box(0.89, 0.20, 0.93, 0.42, 16, 44, ...WOOD);

      box(0.86, 0.52, 0.91, 0.86, 10, 50, ...TRIM);
      box(0.88, 0.56, 0.92, 0.82, 14, 46, ...WOOD_DARK);
      box(0.89, 0.58, 0.93, 0.80, 16, 44, ...WOOD);

      box(0.86, 0.48, 0.91, 0.52, 8, 52, ...WOOD_DARK);

      box(0.89, 0.44, 0.93, 0.47, 26, 32, ...BRASS);
      box(0.91, 0.44, 0.94, 0.46, 27, 30, ...BRASS_HI);
      box(0.89, 0.53, 0.93, 0.56, 26, 32, ...BRASS);
      box(0.91, 0.54, 0.94, 0.56, 27, 30, ...BRASS_HI);

      box(0.14, 0.86, 0.86, 0.91, 10, 50, ...TRIM);
      box(0.18, 0.88, 0.82, 0.92, 14, 46, ...WOOD_DARK);
    }

    // Classical carved top cornice with crown moulding overhang
    box(0.06, 0.06, 0.94, 0.94, 52, 55, ...TRIM);
    box(0.04, 0.04, 0.96, 0.96, 55, 58, ...TRIM_HI);
  });
}

export function shadeColor(hex, amt) {
  return shade(hex, amt);
}
