// Isometric renderer: projection, sprite caching/blitting, depth sorting,
// hover/ghost overlays, day-night lighting, and speech bubbles.
// Browser-only (uses document/canvas) — not exercised by the Node unit tests.

import { TILE, getCatalogueItem } from './data.js';
import {
  ISO, WALL_ANCHOR_Y, buildFloorTile, buildWallSegment, buildWindowSegment,
  buildDoorSegment, buildDoorTile, FURNITURE_BUILDERS, shadeColor,
} from './sprites.js';
import { LOOKS, getCharacterCanvas } from './voxel.js';

export const { TILE_W, TILE_H, WALL_H } = ISO;
export const TOP_PADDING = 28;

const canvasCache = new Map();

function bakeSprite(key, sprite, pixelSize) {
  if (canvasCache.has(key)) return canvasCache.get(key);
  const c = document.createElement('canvas');
  c.width = sprite.w * pixelSize;
  c.height = sprite.h * pixelSize;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const color = sprite.px[y][x];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
  }
  canvasCache.set(key, c);
  return c;
}

function floorBaseColor(roomId) {
  return roomId === 'rooftop' ? '#d8b98c' : '#e9c48f';
}
function wallBaseColor(roomId) {
  return roomId === 'rooftop' ? '#6f9ec4' : '#e3a27a';
}

export function tileToScreen(x, y, originX, originY) {
  return {
    sx: originX + (x - y) * (TILE_W / 2),
    sy: originY + (x + y) * (TILE_H / 2),
  };
}

export function screenToTile(mx, my, originX, originY) {
  const a = (mx - originX) / (TILE_W / 2);
  const b = (my - originY) / (TILE_H / 2);
  const x = (a + b) / 2;
  const y = (b - a) / 2;
  return { x: Math.round(x), y: Math.round(y) };
}

export function computeOrigin(room, canvasWidth, canvasHeight) {
  const skew = ((room.width - 1) - (room.height - 1)) * (TILE_W / 4);
  const originX = canvasWidth / 2 - skew;
  const originY = TOP_PADDING + WALL_H + TILE_H / 2;
  return { originX, originY };
}

export function roomPixelHeight(room) {
  return TOP_PADDING + WALL_H + TILE_H + (room.width + room.height) * (TILE_H / 2) + 40;
}

function dayNightColors(phase) {
  // phase 0.5 = noon, 0 / 1 = midnight. Day holds a bright plateau; night is
  // dimmed with a blue multiply tint that stays light enough to read.
  const k = (0.5 - Math.abs(0.5 - phase)) * 2; // 0 midnight .. 1 noon
  const day = Math.min(1, k * 1.8);
  const skyTop = lerpColor('#1a2250', '#8fd0ff', day);
  const skyBottom = lerpColor('#3a3a72', '#ffe9b8', day);
  const tintAlpha = 0.42 * (1 - day);
  return { skyTop, skyBottom, day, tintAlpha };
}

function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`; // hex: sprites.js shades hex only
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function drawBackground(ctx, width, height, phase) {
  const { skyTop, skyBottom } = dayNightColors(phase);
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(1, skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawCharacter(ctx, e, screenX, screenY) {
  const look = LOOKS[e.spriteKey] || { ...LOOKS.player, shirt: e.color || LOOKS.player.shirt };
  const stride = e.walking ? (e.frame % 2 ? 1 : -1) : 0;
  const { canvas, ox, oy } = getCharacterCanvas(`${e.spriteKey}:${e.color}`, look, e.dir, { stride, sit: e.sitting });
  // soft contact shadow on the floor (when standing/walking), offset away from the room's upper-left light
  if (!e.sitting) {
    ctx.fillStyle = 'rgba(30,15,40,0.22)';
    for (const [rx, ry] of [[19, 9.5], [14, 7]]) {
      ctx.beginPath(); ctx.ellipse(screenX + 2, screenY + 1, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  const dx = Math.round(screenX - ox), dy = Math.round(screenY - oy); // ground centre sits on the tile centre
  ctx.drawImage(canvas, dx, dy);
  return { x: screenX, y: dy, w: 0, h: canvas.height };
}

function furnitureCanvas(itemId, rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  const key = `furn:${itemId}:${r}`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const builder = FURNITURE_BUILDERS[toSpriteKey(itemId)];
  const sprite = builder ? builder(r) : FURNITURE_BUILDERS.stool(r);
  const canvas = bakeSprite(key, sprite, 1);
  // ax/ay: pixel of the footprint centre; default is flat sprites' bottom-centre
  canvas.ax = sprite.ax ?? sprite.w / 2;
  canvas.ay = sprite.ay ?? sprite.h - TILE_H / 2;
  return canvas;
}

function toSpriteKey(itemId) {
  return getCatalogueItem(itemId)?.spriteKey || itemId;
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color; // stroke closes antialiasing seams on the diagonals
  ctx.lineWidth = 1;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawFurniture(ctx, f, originX, originY) {
  // f.footprint is already rotated by the caller
  const anchorX = f.x + f.footprint.w / 2 - 0.5;
  const anchorY = f.y + f.footprint.h / 2 - 0.5;
  const { sx, sy } = tileToScreen(anchorX, anchorY, originX, originY);

  const item = getCatalogueItem(f.itemId);
  if (!item?.flat) {
    // Coherent contact shadow on the floor plane under non-flat furniture
    const tw = f.footprint.w;
    const th = f.footprint.h;
    const rx = (tw + th) * 11;
    const ry = (tw + th) * 5.5;
    ctx.fillStyle = 'rgba(30,15,40,0.20)';
    ctx.beginPath();
    ctx.ellipse(sx + 2, sy + 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const canvas = furnitureCanvas(f.itemId, f.rot);
  ctx.drawImage(canvas, Math.round(sx - canvas.ax), Math.round(sy - canvas.ay));
}

export function drawDiamondOverlay(ctx, sx, sy, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(sx, sy - TILE_H / 2);
  ctx.lineTo(sx + TILE_W / 2, sy);
  ctx.lineTo(sx, sy + TILE_H / 2);
  ctx.lineTo(sx - TILE_W / 2, sy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draws one full frame: room (floor+walls), furniture/avatar/npc depth-sorted,
 * hover + ghost overlays, and a day/night tint.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts - { room, placedFurniture, entities, hoverTile,
 *   ghost: {cells, valid}|null, phase, width, height, bubbles }
 */
export function renderRoom(ctx, opts) {
  const { room, placedFurniture, entities, hoverTile, ghost, phase, width, height, bubbles } = opts;
  ctx.imageSmoothingEnabled = false;
  drawBackground(ctx, width, height, phase);
  const { originX, originY } = computeOrigin(room, width, height);
  const floorColor = floorBaseColor(room.id);
  const wallColor = wallBaseColor(room.id);
  const { day } = dayNightColors(phase);
  const wb = Math.round(day * 8) / 8; // quantised so window sprites are cached per daylight step
  const sky = { top: lerpColor('#1a2250', '#8fd0ff', wb), bottom: lerpColor('#ffd27a', '#fff6c9', wb) };

  // Pass 1: floor. A darker grout polygon underneath hides hairline gaps
  // between tiles and doubles as the slab's top edge.
  const last = { x: room.width - 1, y: room.height - 1 };
  const P = (x, y, dx, dy) => { const t = tileToScreen(x, y, originX, originY); return [t.sx + dx, t.sy + dy]; };
  const corners = [P(1, 1, 0, -TILE_H / 2), P(last.x, 1, TILE_W / 2, 0), P(last.x, last.y, 0, TILE_H / 2), P(1, last.y, -TILE_W / 2, 0)];
  fillPoly(ctx, corners, shadeColor(floorColor, -0.25));
  // Front slab thickness: south-west and south-east faces of the floor
  const T = 10;
  const [, eastPt, southPt, westPt] = corners;
  fillPoly(ctx, [westPt, southPt, [southPt[0], southPt[1] + T], [westPt[0], westPt[1] + T]], shadeColor(floorColor, -0.38));
  fillPoly(ctx, [southPt, eastPt, [eastPt[0], eastPt[1] + T], [southPt[0], southPt[1] + T]], shadeColor(floorColor, -0.55));

  const doorMats = new Set(room.doors.map((d) => (d.y === 0 ? `${d.x},1` : `${1},${d.y}`)));
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const cell = room.grid[y][x];
      if (cell === TILE.WALL || cell === TILE.WINDOW || cell === TILE.DOOR) continue;
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      const variant = (x + y) % 2;
      const mat = doorMats.has(`${x},${y}`);
      const tileKey = mat ? `doortile:${room.id}` : `floor:${room.id}:${variant}`;
      const canvas = mat
        ? bakeSprite(tileKey, buildDoorTile(floorColor), 1)
        : bakeSprite(tileKey, buildFloorTile(floorColor, variant), 1);
      ctx.drawImage(canvas, Math.round(sx - TILE_W / 2), Math.round(sy - TILE_H / 2));
    }
  }

  // Flat decor (rugs) lies on the floor, under everything else
  for (const f of placedFurniture) {
    if (!getCatalogueItem(f.itemId)?.flat) continue;
    drawFurniture(ctx, f, originX, originY);
  }

  // Hover highlight (under furniture/avatars, over floor)
  if (hoverTile) {
    const { sx, sy } = tileToScreen(hoverTile.x, hoverTile.y, originX, originY);
    drawDiamondOverlay(ctx, sx, sy, '#fff6c9', 0.35);
  }
  if (ghost) {
    for (const c of ghost.cells) {
      const { sx, sy } = tileToScreen(c.x, c.y, originX, originY);
      drawDiamondOverlay(ctx, sx, sy, ghost.valid ? '#7CFC9A' : '#ff6b6b', 0.45);
    }
  }

  // Pass 2: walls. Grid row 0 / column 0 are wall *cells*, but the wall face
  // stands on the back edge of the first floor row/column, so it is drawn
  // against floor tile (x,1) / (1,y) — adjacent faces then join seamlessly.
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const cell = room.grid[y][x];
      if (cell !== TILE.WALL && cell !== TILE.WINDOW && cell !== TILE.DOOR) continue;
      if (x === 0 && y === 0) continue;
      const kind = y === 0 ? 'north' : 'west';
      const { sx, sy } = tileToScreen(kind === 'north' ? x : 1, kind === 'north' ? 1 : y, originX, originY);
      let sprite;
      let key;
      if (cell === TILE.WINDOW) { key = `window:${room.id}:${kind}:${wb}`; sprite = () => buildWindowSegment(wallColor, sky, kind); }
      else if (cell === TILE.DOOR) { key = `door:${room.id}:${kind}`; sprite = () => buildDoorSegment(wallColor, kind); }
      else { key = `wall:${room.id}:${kind}`; sprite = () => buildWallSegment(wallColor, kind); }
      ctx.drawImage(bakeSprite(key, sprite(), 1), Math.round(sx - TILE_W / 2), Math.round(sy - WALL_ANCHOR_Y));
    }
  }

  // Pass 3: depth-sorted furniture + entities
  const drawables = [];
  for (const f of placedFurniture) {
    if (getCatalogueItem(f.itemId)?.flat) continue;
    const frontX = f.x + (f.footprint.w - 1);
    const frontY = f.y + (f.footprint.h - 1);
    drawables.push({ depth: frontX + frontY, type: 'furniture', data: f });
  }
  for (const e of entities) {
    drawables.push({ depth: e.depth ?? e.x + e.y + 0.5, type: 'entity', data: e });
  }
  drawables.sort((a, b) => a.depth - b.depth);

  const bubbleTargets = [];
  for (const d of drawables) {
    if (d.type === 'furniture') {
      drawFurniture(ctx, d.data, originX, originY);
    } else {
      const e = d.data;
      const { sx, sy } = tileToScreen(e.x, e.y, originX, originY);
      const bbox = drawCharacter(ctx, e, sx, sy);
      if (e.bubbleText) bubbleTargets.push({ x: bbox.x + bbox.w / 2, y: bbox.y, text: e.bubbleText });
    }
  }

  // Lighting tint
  const { tintAlpha } = dayNightColors(phase);
  if (tintAlpha > 0.02) {
    ctx.save();
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = '#5b6bb0';
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  for (const b of bubbleTargets) drawSpeechBubble(ctx, b.x, b.y, b.text);
}

export function drawSpeechBubble(ctx, x, y, text) {
  ctx.font = '11px monospace';
  const maxWidth = 150;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);

  const lineHeight = 13;
  const padding = 6;
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = textWidth + padding * 2;
  const boxH = lines.length * lineHeight + padding * 2;
  const boxX = x - boxW / 2;
  const boxY = y - boxH - 14;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(x - 5, boxY + boxH - 1);
  ctx.lineTo(x + 5, boxY + boxH - 1);
  ctx.lineTo(x, boxY + boxH + 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.strokeStyle = '#2a2a2a';
  ctx.stroke();

  ctx.fillStyle = '#222';
  lines.forEach((line, i) => {
    ctx.fillText(line, boxX + padding, boxY + padding + (i + 1) * lineHeight - 3);
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
