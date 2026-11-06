// Isometric renderer: projection, sprite caching/blitting, depth sorting,
// hover/ghost overlays, day-night lighting, and speech bubbles.
// Browser-only (uses document/canvas) — not exercised by the Node unit tests.

import { TILE } from './data.js';
import {
  ISO, WALL_ANCHOR_Y, buildFloorTile, buildWallSegment, buildWindowSegment,
  buildDoorTile, FURNITURE_BUILDERS, buildCharacterSheet, PLAYER_SCHEME, npcScheme,
} from './sprites.js';

export const { TILE_W, TILE_H, WALL_H } = ISO;
export const CHAR_PIXEL = 3;
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
  return roomId === 'rooftop' ? '#4d7fae' : '#caa3d8';
}
function wallBaseColor(roomId) {
  return roomId === 'rooftop' ? '#345a82' : '#8a5fa0';
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
  // phase 0 = noon, 0.5 = night, 1 = noon again (wraps)
  const t = 0.5 - Math.abs(0.5 - phase); // 0 at midnight-ish edges, 0.5 at noon
  const skyTop = lerpColor('#0e1030', '#8fd0ff', t * 2);
  const skyBottom = lerpColor('#2a2a55', '#ffe3a0', t * 2);
  const glow = lerpColor('#ffd27a', '#fff6c9', t * 2);
  const tintAlpha = 0.55 - t * 0.55;
  return { skyTop, skyBottom, glow, tintAlpha };
}

function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
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

function getCharSheet(key, scheme) {
  const cacheKey = `char:${key}`;
  if (canvasCache.has(cacheKey)) return canvasCache.get(cacheKey);
  const sheet = buildCharacterSheet(scheme);
  canvasCache.set(cacheKey, sheet);
  return sheet;
}

function drawCharacter(ctx, key, scheme, dir, frameIdx, sitting, screenX, screenY) {
  const sheet = getCharSheet(key, scheme);
  let sprite;
  if (sitting) sprite = sheet.sit[dir] || sheet.sit.down;
  else sprite = (sheet[dir] || sheet.down)[frameIdx % 2];
  const bakeKey = `${key}:${sitting ? 'sit' : 'walk'}:${dir}:${sitting ? 0 : frameIdx % 2}`;
  const canvas = bakeSprite(bakeKey, sprite, CHAR_PIXEL);
  const dx = Math.round(screenX - canvas.width / 2);
  const dy = Math.round(screenY - canvas.height + TILE_H / 2);
  ctx.drawImage(canvas, dx, dy);
  return { x: dx, y: dy, w: canvas.width, h: canvas.height };
}

function furnitureCanvas(itemId, rot) {
  const key = `furn:${itemId}:${rot % 2}`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const builder = FURNITURE_BUILDERS[toSpriteKey(itemId)];
  const sprite = builder ? builder() : FURNITURE_BUILDERS.stool();
  const canvas = bakeSprite(key, sprite, 1);
  return canvas;
}

function toSpriteKey(itemId) {
  const map = { stool: 'stool', sofa: 'sofa', rooftop_sofa: 'rooftopSofa', lamp: 'lamp', plant: 'plant', rug: 'rug', neon_sign: 'neonSign', jukebox: 'jukebox' };
  return map[itemId] || itemId;
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
  const { glow } = dayNightColors(phase);

  // Pass 1: floor tiles
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const cell = room.grid[y][x];
      if (cell === TILE.WALL || cell === TILE.WINDOW) continue;
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      const variant = (x + y) % 2;
      const tileKey = cell === TILE.DOOR ? `doortile:${room.id}` : `floor:${room.id}:${variant}`;
      const canvas = cell === TILE.DOOR
        ? bakeSprite(tileKey, buildDoorTile(floorColor), 1)
        : bakeSprite(tileKey, buildFloorTile(floorColor, variant), 1);
      ctx.drawImage(canvas, Math.round(sx - TILE_W / 2), Math.round(sy - TILE_H / 2));
    }
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

  // Pass 2: walls
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const cell = room.grid[y][x];
      if (cell !== TILE.WALL && cell !== TILE.WINDOW) continue;
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      const kind = y === 0 ? 'north' : 'west';
      const key = cell === TILE.WINDOW ? `window:${room.id}:${x}:${y}` : `wall:${room.id}:${kind}`;
      const canvas = cell === TILE.WINDOW
        ? bakeSprite(key, buildWindowSegment(wallColor, glow, kind), 1)
        : bakeSprite(key, buildWallSegment(wallColor, kind), 1);
      ctx.drawImage(canvas, Math.round(sx - TILE_W / 2), Math.round(sy - WALL_ANCHOR_Y));
    }
  }

  // Pass 3: depth-sorted furniture + entities
  const drawables = [];
  for (const f of placedFurniture) {
    const frontX = f.x + (f.footprint.w - 1);
    const frontY = f.y + (f.footprint.h - 1);
    drawables.push({ depth: frontX + frontY, type: 'furniture', data: f });
  }
  for (const e of entities) {
    drawables.push({ depth: e.x + e.y + 0.5, type: 'entity', data: e });
  }
  drawables.sort((a, b) => a.depth - b.depth);

  const bubbleTargets = [];
  for (const d of drawables) {
    if (d.type === 'furniture') {
      const f = d.data;
      const anchorX = f.x + (f.rot % 2 === 1 ? f.footprint.h : f.footprint.w) / 2 - 0.5;
      const anchorY = f.y + (f.rot % 2 === 1 ? f.footprint.w : f.footprint.h) / 2 - 0.5;
      const { sx, sy } = tileToScreen(anchorX, anchorY, originX, originY);
      const canvas = furnitureCanvas(f.itemId, f.rot);
      const dx = Math.round(sx - canvas.width / 2);
      const dy = Math.round(sy + TILE_H / 2 - canvas.height);
      ctx.drawImage(canvas, dx, dy);
    } else {
      const e = d.data;
      const { sx, sy } = tileToScreen(e.x, e.y, originX, originY);
      const scheme = e.kind === 'player' ? PLAYER_SCHEME : npcScheme(e.color);
      const bbox = drawCharacter(ctx, e.spriteKey, scheme, e.dir, e.frame, e.sitting, sx, sy);
      if (e.bubbleText) bubbleTargets.push({ x: bbox.x + bbox.w / 2, y: bbox.y, text: e.bubbleText });
    }
  }

  // Lighting tint
  const { tintAlpha } = dayNightColors(phase);
  if (tintAlpha > 0.02) {
    ctx.save();
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = '#0c1033';
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
