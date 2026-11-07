// Isometric renderer: DPR-aware native-resolution projection, procedural
// parallax city skyline backdrop, hotel tower cut-away architecture,
// depth-sorted volumetric furniture & voxel characters, and crisp UI text.
// Browser-only (uses document/canvas) — not exercised by the Node unit tests.

import { TILE, getCatalogueItem } from './data.js';
import {
  ISO, WALL_ANCHOR_Y, buildFloorTile, buildWallSegment, buildWindowSegment,
  buildDoorSegment, buildElevatorDoorSegment, buildDoorTile, buildElevatorTile,
  FURNITURE_BUILDERS, shadeColor,
} from './sprites.js';
import { LOOKS, getCharacterCanvas } from './voxel.js';

export const { TILE_W, TILE_H, WALL_H } = ISO;
export const TOP_PADDING = 54;

const canvasCache = new Map();

function blitDeviceAligned(ctx, sourceCanvas, cssX, cssY, dpr) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, Math.round(cssX * dpr), Math.round(cssY * dpr));
  ctx.restore();
}

function bakeSprite(key, sprite, dpr = 1) {
  const scale = Math.max(1, dpr);
  const cacheKey = `${key}@${scale}`;
  if (canvasCache.has(cacheKey)) return canvasCache.get(cacheKey);

  const W = Math.max(1, Math.round(sprite.w * scale));
  const H = Math.max(1, Math.round(sprite.h * scale));

  // High-resolution native DPR rasterisation for volumetric 3D prism furniture
  if (sprite.boxes && sprite.boxes.length > 0) {
    const body = document.createElement('canvas');
    body.width = W;
    body.height = H;
    const g = body.getContext('2d');
    const px0 = sprite.th * 32 + 1;
    const py0 = sprite.height + 1;
    const P = (u, v, z) => [(px0 + (u - v) * 32) * scale, (py0 + (u + v) * 16 - z) * scale];
    const poly = (pts, color) => {
      g.fillStyle = color;
      g.strokeStyle = color;
      g.lineWidth = Math.max(0.75, 0.6 * scale);
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      g.stroke();
    };
    for (const b of sprite.boxes) {
      const { u0, v0, u1, v1, z0, z1, topC, leftC, rightC } = b;
      poly([P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], leftC);
      poly([P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], rightC);
      poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], topC);
      // subtle crease highlight along top front edges
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = Math.max(0.75, 0.55 * scale);
      g.beginPath();
      const [ax, ay] = P(u0, v1, z1);
      const [bx, by] = P(u1, v1, z1);
      const [cx, cy] = P(u1, v0, z1);
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.lineTo(cx, cy);
      g.stroke();
    }
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const og = out.getContext('2d');
    const d = Math.max(1, Math.round(scale));
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, d], [-d, d], [d, -d]]) {
      og.drawImage(body, dx, dy);
    }
    og.globalCompositeOperation = 'source-in';
    og.fillStyle = '#2a1d2e';
    og.fillRect(0, 0, W, H);
    og.globalCompositeOperation = 'source-over';
    og.drawImage(body, 0, 0);
    out.ax = sprite.ax ?? sprite.w / 2;
    out.ay = sprite.ay ?? sprite.h - TILE_H / 2;
    out.scale = scale;
    canvasCache.set(cacheKey, out);
    return out;
  }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < sprite.h; y++) {
    const y0 = Math.round(y * scale);
    const y1 = Math.round((y + 1) * scale);
    for (let x = 0; x < sprite.w; x++) {
      const color = sprite.px[y][x];
      if (!color) continue;
      const x0 = Math.round(x * scale);
      const x1 = Math.round((x + 1) * scale);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
  }
  c.ax = sprite.ax ?? sprite.w / 2;
  c.ay = sprite.ay ?? sprite.h - TILE_H / 2;
  c.scale = scale;
  canvasCache.set(cacheKey, c);
  return c;
}

function floorBaseColor(room) {
  return room.floorColor || (room.id === 'rooftop' ? '#d8b98c' : '#e9c48f');
}
function wallBaseColor(room) {
  return room.wallColor || (room.id === 'rooftop' ? '#6f9ec4' : '#e3a27a');
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
  const originX = Math.round(canvasWidth / 2 - skew);
  const floorSpan = (room.width + room.height) * (TILE_H / 2);
  const idealY = Math.round((canvasHeight - floorSpan) / 2 + 12);
  const minOriginY = TOP_PADDING + WALL_H + TILE_H / 2;
  const originY = Math.max(minOriginY, Math.min(idealY, minOriginY + 60));
  return { originX, originY };
}

export function roomPixelHeight(room) {
  return TOP_PADDING + WALL_H + TILE_H + (room.width + room.height) * (TILE_H / 2) + 40;
}

function dayNightColors(phase) {
  // phase 0.5 = noon, 0 / 1 = midnight.
  const k = (0.5 - Math.abs(0.5 - phase)) * 2; // 0 midnight .. 1 noon
  const day = Math.min(1, Math.max(0, k * 1.65));
  const dusk = Math.max(0, 1 - Math.abs(k - 0.38) * 3.2);
  let skyTop = lerpColor('#0b102c', '#4aa8ff', day);
  let skyMid = lerpColor('#1b2452', '#8cd2ff', day);
  let skyBottom = lerpColor('#2d3266', '#fff0c8', day);
  if (dusk > 0.01) {
    skyMid = lerpColor(skyMid, '#c85a7c', dusk * 0.65);
    skyBottom = lerpColor(skyBottom, '#ff9a5c', dusk * 0.78);
  }
  const tintAlpha = 0.36 * (1 - day);
  return { skyTop, skyMid, skyBottom, day, dusk, tintAlpha };
}

function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// ---------- Deterministic City Skyline Backdrop (Cached Offscreen) ----------

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0x10000000;
  };
}

let skylineCache = { key: '', canvas: null, beacons: [] };

export function drawBackground(ctx, width, height, phase, floor = 1, dpr = 1, now = 0) {
  const phaseBucket = Math.round(phase * 48) % 48;
  const key = `${width}x${height}@${dpr}:p${phaseBucket}:f${floor}`;

  if (skylineCache.key !== key) {
    const off = skylineCache.canvas || document.createElement('canvas');
    off.width = Math.max(1, Math.round(width * dpr));
    off.height = Math.max(1, Math.round(height * dpr));
    const g = off.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const beacons = renderSkylineToCanvas(g, width, height, phaseBucket / 48, floor);
    skylineCache = { key, canvas: off, beacons };
  }

  blitDeviceAligned(ctx, skylineCache.canvas, 0, 0, dpr);

  // Live blinking red aircraft warning beacons on skyscraper spires
  const blinkOn = Math.floor(now / 650) % 2 === 0;
  for (const b of skylineCache.beacons) {
    ctx.fillStyle = blinkOn ? '#ff3b4e' : '#6e1c28';
    ctx.beginPath();
    ctx.arc(b.x, b.y, blinkOn ? 2.2 : 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (blinkOn) {
      ctx.fillStyle = 'rgba(255, 70, 90, 0.28)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderSkylineToCanvas(g, width, height, phase, floor) {
  const { skyTop, skyMid, skyBottom, day } = dayNightColors(phase);
  // Higher floors look down slightly further over the city horizon
  const parallaxY = Math.round((floor - 1) * 5);
  const horizonY = Math.round(height * 0.66 + parallaxY);

  const grad = g.createLinearGradient(0, 0, 0, horizonY + 60);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(0.58, skyMid);
  grad.addColorStop(1, skyBottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);

  // Stars at night / twilight
  if (day < 0.72) {
    const starAlpha = Math.min(0.95, (0.72 - day) * 1.45);
    const rStar = seededRand(90421);
    for (let i = 0; i < 95; i++) {
      const sx = Math.round(rStar() * width);
      const sy = Math.round(rStar() * (horizonY * 0.78));
      const sz = rStar() > 0.8 ? 2 : 1.2;
      g.fillStyle = `rgba(255, 248, 224, ${(starAlpha * (0.4 + rStar() * 0.6)).toFixed(2)})`;
      g.fillRect(sx, sy, sz, sz);
    }
  }

  // Sun & Moon arc across the sky
  const sunAngle = (phase - 0.22) * Math.PI * 1.8;
  const cx = width * 0.5;
  const rx = width * 0.38;
  const ry = horizonY * 0.62;
  if (day > 0.15) {
    const sunX = cx - Math.cos(sunAngle) * rx;
    const sunY = horizonY * 0.72 - Math.sin(sunAngle) * ry;
    if (sunY < horizonY + 20) {
      const glow = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 44);
      glow.addColorStop(0, 'rgba(255, 246, 190, 0.95)');
      glow.addColorStop(0.4, 'rgba(255, 200, 110, 0.35)');
      glow.addColorStop(1, 'rgba(255, 180, 90, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(sunX, sunY, 44, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff5c0';
      g.beginPath();
      g.arc(sunX, sunY, 15, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (day < 0.65) {
    const moonAngle = ((phase + 0.5) % 1) * Math.PI;
    const moonX = width * 0.18 + Math.cos(moonAngle * 0.7) * (width * 0.28);
    const moonY = Math.max(36, horizonY * 0.28);
    g.fillStyle = 'rgba(210, 228, 255, 0.18)';
    g.beginPath();
    g.arc(moonX, moonY, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#eef4ff';
    g.beginPath();
    g.arc(moonX, moonY, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#cad8f0';
    g.beginPath();
    g.arc(moonX - 3, moonY - 2, 2.5, 0, Math.PI * 2);
    g.arc(moonX + 4, moonY + 3, 2, 0, Math.PI * 2);
    g.fill();
  }

  // Distant coastal hills silhouette
  const hillColor = lerpColor('#141b3d', '#6e94c0', day);
  g.fillStyle = hillColor;
  g.beginPath();
  g.moveTo(0, horizonY);
  for (let x = 0; x <= width; x += 40) {
    const h = Math.sin(x * 0.0065 + 1.2) * 18 + Math.cos(x * 0.015) * 9 + 16;
    g.lineTo(x, horizonY - h);
  }
  g.lineTo(width, height);
  g.lineTo(0, height);
  g.closePath();
  g.fill();

  // Distant harbour / sea band below hills
  const seaTop = lerpColor('#101838', '#4a8ec2', day);
  const seaBot = lerpColor('#0a0e24', '#2d5c8a', day);
  const seaGrad = g.createLinearGradient(0, horizonY - 4, 0, height);
  seaGrad.addColorStop(0, seaTop);
  seaGrad.addColorStop(1, seaBot);
  g.fillStyle = seaGrad;
  g.fillRect(0, horizonY - 2, width, height - horizonY + 2);

  // 3 Parallax Skyscraper Layers (far, mid, near)
  const layers = [
    {
      seed: 101,
      baseY: horizonY + Math.round((floor - 1) * 1.5),
      minW: 26, maxW: 44, minH: 55, maxH: 135, step: 28,
      bodyCol: lerpColor('#161e42', '#5b7ea8', day),
      sideCol: lerpColor('#101634', '#486890', day),
      winStepX: 6, winStepY: 8, winW: 3, winH: 4,
      winLitThreshold: 0.48,
    },
    {
      seed: 202,
      baseY: horizonY + 38 + Math.round((floor - 1) * 3),
      minW: 34, maxW: 58, minH: 80, maxH: 185, step: 38,
      bodyCol: lerpColor('#1d244c', '#45648c', day),
      sideCol: lerpColor('#141a38', '#334d70', day),
      winStepX: 7, winStepY: 9, winW: 3.5, winH: 5,
      winLitThreshold: 0.56,
    },
    {
      seed: 303,
      baseY: horizonY + 86 + Math.round((floor - 1) * 4.5),
      minW: 42, maxW: 72, minH: 105, maxH: 230, step: 50,
      bodyCol: lerpColor('#242a56', '#334b6e', day),
      sideCol: lerpColor('#181c3c', '#243754', day),
      winStepX: 8, winStepY: 11, winW: 4, winH: 6,
      winLitThreshold: 0.62,
      spires: true,
    },
  ];

  const beacons = [];
  const nightFactor = Math.max(0, Math.min(1, (0.78 - day) * 1.55));
  const dayWinCol = lerpColor('#26365e', '#6fa4d2', day);

  for (const L of layers) {
    const rand = seededRand(L.seed);
    for (let bx = -20; bx < width + 40; bx += L.step + Math.floor(rand() * 14)) {
      const bw = Math.round(L.minW + rand() * (L.maxW - L.minW));
      const bh = Math.round(L.minH + rand() * (L.maxH - L.minH));
      const topY = Math.round(L.baseY - bh);
      const sideW = Math.max(6, Math.round(bw * 0.24));

      // Main front face + shaded 3D side face
      g.fillStyle = L.bodyCol;
      g.fillRect(bx, topY, bw - sideW, bh + 180);
      g.fillStyle = L.sideCol;
      g.fillRect(bx + bw - sideW, topY + 3, sideW, bh + 180);

      // Stepped roof crown or spire
      const crownStyle = Math.floor(rand() * 3);
      if (crownStyle === 0) {
        const cw = Math.round((bw - sideW) * 0.6);
        const cx0 = bx + Math.round((bw - sideW - cw) / 2);
        g.fillStyle = L.bodyCol;
        g.fillRect(cx0, topY - 10, cw, 10);
        if (L.spires && bh > 155) {
          const sx = cx0 + Math.round(cw / 2);
          g.fillStyle = L.sideCol;
          g.fillRect(sx - 1, topY - 28, 2, 18);
          beacons.push({ x: sx, y: topY - 29 });
        }
      } else if (crownStyle === 1) {
        g.fillStyle = shadeColor(L.bodyCol, 0.12);
        g.fillRect(bx, topY, bw - sideW, 3);
      }

      // Deterministic building windows
      const cols = Math.floor((bw - sideW - 8) / L.winStepX);
      const rows = Math.floor((bh - 14) / L.winStepY);
      for (let r = 0; r < rows; r++) {
        const wy = topY + 8 + r * L.winStepY;
        if (wy > height) break;
        for (let c = 0; c < cols; c++) {
          const wRand = rand();
          const wx = bx + 5 + c * L.winStepX;
          const isLit = nightFactor > 0.08 && wRand < L.winLitThreshold * nightFactor;
          if (isLit) {
            g.fillStyle = wRand < 0.14 ? '#90e8ff' : wRand < 0.45 ? '#ffe494' : '#ffbe64';
            g.fillRect(wx, wy, L.winW, L.winH);
          } else if (wRand < 0.65) {
            g.fillStyle = dayWinCol;
            g.fillRect(wx, wy, L.winW, L.winH);
          }
        }
      }
    }
  }
  return beacons;
}

// Street-level plaza drawn under the tower when the ground is on screen.
function drawStreetPlaza(ctx, westPt, southPt, eastPt, northPt, groundDy, height, day, cw) {
  const w = cw / (ctx.getTransform().a || 1);
  const gy = (pt) => pt[1] + groundDy;
  const top = Math.round(Math.max(gy(westPt), gy(eastPt)) - 4);
  // Kerb-side sidewalk strip with street trees, then the road below it
  ctx.fillStyle = lerpColor('#2e2c38', '#a49e94', day);
  ctx.fillRect(0, top, w, 12);
  ctx.fillStyle = lerpColor('#1c1a28', '#5d6470', day);
  ctx.fillRect(0, top + 12, w, height - top + 8);
  for (let x = 18; x < w; x += 64) {
    ctx.fillStyle = lerpColor('#1d3a26', '#3f8f4a', day);
    ctx.beginPath(); ctx.arc(x, top - 4, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a3e2a'; ctx.fillRect(x - 1, top + 2, 3, 7);
  }
  // Lane dashes
  ctx.fillStyle = lerpColor('#8a7a40', '#f2e3a0', day);
  const laneY = Math.round(top + 12 + Math.max(10, (height - top - 12) * 0.5));
  for (let x = 6; x < w; x += 46) ctx.fillRect(x, laneY, 22, 3);
  // Sidewalk plaza diamond around the tower base
  const pad = 26;
  const plaza = [
    [westPt[0] - pad * 2, gy(westPt)],
    [southPt[0], gy(southPt) + pad],
    [eastPt[0] + pad * 2, gy(eastPt)],
    [northPt[0], gy(westPt) - (southPt[1] - westPt[1]) - pad],
  ];
  fillPoly(ctx, plaza, lerpColor('#3a3846', '#b9b2a6', day));
  ctx.strokeStyle = lerpColor('#2a2834', '#8f887c', day);
  ctx.lineWidth = 2;
  ctx.beginPath(); plaza.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
}

// ---------- Hotel Tower Cut-Away Architecture ----------

function drawTowerCutawayUnder(ctx, room, originX, originY, height, phase) {
  const { day } = dayNightColors(phase);
  const last = { x: room.width - 1, y: room.height - 1 };
  const P = (x, y, dx = 0, dy = 0) => {
    const t = tileToScreen(x, y, originX, originY);
    return [t.sx + dx, t.sy + dy];
  };
  const northPt = P(1, 1, 0, -TILE_H / 2);
  const eastPt = P(last.x, 1, TILE_W / 2, 0);
  const southPt = P(last.x, last.y, 0, TILE_H / 2);
  const westPt = P(1, last.y, -TILE_W / 2, 0);

  const facadeLeft = lerpColor('#2d2942', '#7c748e', day);
  const facadeRight = lerpColor('#1f1c30', '#585268', day);
  const colLeft = shadeColor(facadeLeft, 0.14);
  const colRight = shadeColor(facadeRight, 0.12);
  const SLAB_H = 16;
  const storyH = 54;
  const floorNo = room.floor || 1;
  // Ground level sits (floor-1) storeys below this floor's slab. When it is on
  // screen (low floors) the tower stands on a street plaza instead of running
  // off the bottom edge.
  const groundDy = SLAB_H + 6 + (floorNo - 1) * storyH;
  const grounded = southPt[1] + groundDy < height;
  const bottomY = height + 20;
  const gL = (pt) => (grounded ? pt[1] + groundDy : bottomY);
  if (grounded) drawStreetPlaza(ctx, westPt, southPt, eastPt, northPt, groundDy, height, day, ctx.canvas.width);

  // 1. Exterior tower shaft extending down from the current floor to the bottom of the screen
  fillPoly(ctx, [
    [westPt[0] - 8, westPt[1]],
    [southPt[0], southPt[1]],
    [southPt[0], gL(southPt)],
    [westPt[0] - 8, gL(westPt)],
  ], facadeLeft);

  fillPoly(ctx, [
    [southPt[0], southPt[1]],
    [eastPt[0] + 8, eastPt[1]],
    [eastPt[0] + 8, gL(eastPt)],
    [southPt[0], gL(southPt)],
  ], facadeRight);

  // Exterior corner structural columns extending down the tower
  fillPoly(ctx, [
    [westPt[0] - 10, westPt[1] - WALL_H],
    [westPt[0], westPt[1] - WALL_H],
    [westPt[0], gL(westPt)],
    [westPt[0] - 10, gL(westPt)],
  ], colLeft);
  fillPoly(ctx, [
    [eastPt[0], eastPt[1] - WALL_H],
    [eastPt[0] + 10, eastPt[1] - WALL_H],
    [eastPt[0] + 10, gL(eastPt)],
    [eastPt[0], gL(eastPt)],
  ], colRight);
  fillPoly(ctx, [
    [southPt[0] - 5, southPt[1] + SLAB_H],
    [southPt[0] + 5, southPt[1] + SLAB_H],
    [southPt[0] + 5, gL(southPt)],
    [southPt[0] - 5, gL(southPt)],
  ], shadeColor(facadeLeft, -0.08));

  // Neighbouring lower floors: horizontal floor spandrel bands + recessed lit windows/silhouettes
  for (let story = 0; story < Math.min(6, floorNo - 1); story++) {
    const dy0 = SLAB_H + 8 + story * storyH;
    // Left facade windows (parallel to westPt -> southPt slope)
    const stepsL = Math.max(2, room.height - 2);
    for (let i = 0; i < stepsL; i++) {
      const t0 = (i + 0.22) / stepsL;
      const t1 = (i + 0.78) / stepsL;
      const x0 = westPt[0] + (southPt[0] - westPt[0]) * t0;
      const y0 = westPt[1] + (southPt[1] - westPt[1]) * t0 + dy0;
      const x1 = westPt[0] + (southPt[0] - westPt[0]) * t1;
      const y1 = westPt[1] + (southPt[1] - westPt[1]) * t1 + dy0;
      if (y0 > height) continue;
      const isLit = ((i * 7 + story * 13 + (room.floor || 1)) % 5) !== 0;
      const winCol = day > 0.65
        ? (isLit ? '#9ad0f4' : '#4a6484')
        : (isLit ? '#ffd884' : '#242238');
      fillPoly(ctx, [[x0, y0], [x1, y1], [x1, y1 + 26], [x0, y0 + 26]], winCol);
      // Silhouette hint inside lit neighbouring floor window
      if (isLit && (i + story) % 2 === 0) {
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2 + 12;
        fillPoly(ctx, [[mx - 4, my], [mx + 4, my + 2], [mx + 4, my + 12], [mx - 4, my + 10]], 'rgba(35,24,48,0.45)');
      }
    }
    // Right facade windows (parallel to southPt -> eastPt slope)
    const stepsR = Math.max(2, room.width - 2);
    for (let i = 0; i < stepsR; i++) {
      const t0 = (i + 0.22) / stepsR;
      const t1 = (i + 0.78) / stepsR;
      const x0 = southPt[0] + (eastPt[0] - southPt[0]) * t0;
      const y0 = southPt[1] + (eastPt[1] - southPt[1]) * t0 + dy0;
      const x1 = southPt[0] + (eastPt[0] - southPt[0]) * t1;
      const y1 = southPt[1] + (eastPt[1] - southPt[1]) * t1 + dy0;
      if (y0 > height) continue;
      const isLit = ((i * 11 + story * 5 + (room.floor || 1)) % 4) !== 0;
      const winCol = day > 0.65
        ? (isLit ? '#78b0d8' : '#384e68')
        : (isLit ? '#f0be68' : '#1b182c');
      fillPoly(ctx, [[x0, y0], [x1, y1], [x1, y1 + 26], [x0, y0 + 26]], winCol);
    }
  }

  // 2. Cut-away Upper Story hint above the back walls (only for non-rooftop floors)
  if (!room.isRooftop) {
    const UPPER_H = 44;
    const nwUp = [northPt[0], northPt[1] - WALL_H];
    const wUp = [westPt[0], westPt[1] - WALL_H];
    const eUp = [eastPt[0], eastPt[1] - WALL_H];
    // Dimmer cut-away interior of the floor directly above
    fillPoly(ctx, [
      [wUp[0] - 8, wUp[1] - 12],
      [nwUp[0], nwUp[1] - 12],
      [nwUp[0], nwUp[1] - 12 - UPPER_H],
      [wUp[0] - 8, wUp[1] - 12 - UPPER_H],
    ], lerpColor('#26223a', '#4e4868', day));
    fillPoly(ctx, [
      [nwUp[0], nwUp[1] - 12],
      [eUp[0] + 8, eUp[1] - 12],
      [eUp[0] + 8, eUp[1] - 12 - UPPER_H],
      [nwUp[0], nwUp[1] - 12 - UPPER_H],
    ], lerpColor('#1c182c', '#3c3654', day));

    // Upper floor lit windows / silhouettes along the cut-away above
    for (let i = 0; i < 3; i++) {
      const t0 = 0.18 + i * 0.28;
      const t1 = t0 + 0.18;
      const lx0 = wUp[0] + (nwUp[0] - wUp[0]) * t0;
      const ly0 = wUp[1] + (nwUp[1] - wUp[1]) * t0 - 18;
      const lx1 = wUp[0] + (nwUp[0] - wUp[0]) * t1;
      const ly1 = wUp[1] + (nwUp[1] - wUp[1]) * t1 - 18;
      fillPoly(ctx, [[lx0, ly0], [lx1, ly1], [lx1, ly1 - 20], [lx0, ly0 - 20]], day > 0.6 ? '#9ad0f8' : '#ffd884');

      const rx0 = nwUp[0] + (eUp[0] - nwUp[0]) * t0;
      const ry0 = nwUp[1] + (eUp[1] - nwUp[1]) * t0 - 18;
      const rx1 = nwUp[0] + (eUp[0] - nwUp[0]) * t1;
      const ry1 = nwUp[1] + (eUp[1] - nwUp[1]) * t1 - 18;
      fillPoly(ctx, [[rx0, ry0], [rx1, ry1], [rx1, ry1 - 20], [rx0, ry0 - 20]], day > 0.6 ? '#7ab2de' : '#eab660');
    }
  }

  // 3. Reinforced concrete floor slab directly under the current room
  const corners = [northPt, eastPt, southPt, westPt];
  fillPoly(ctx, corners, shadeColor(floorBaseColor(room), -0.25));
  fillPoly(ctx, [westPt, southPt, [southPt[0], southPt[1] + SLAB_H], [westPt[0], westPt[1] + SLAB_H]], '#787486');
  fillPoly(ctx, [southPt, eastPt, [eastPt[0], eastPt[1] + SLAB_H], [southPt[0], southPt[1] + SLAB_H]], '#565264');

  // Structural steel I-beam / rebar details along the cut concrete floor slab
  const beamStepsL = room.height - 1;
  for (let i = 1; i < beamStepsL; i++) {
    const t = i / beamStepsL;
    const bx = westPt[0] + (southPt[0] - westPt[0]) * t;
    const by = westPt[1] + (southPt[1] - westPt[1]) * t + 4;
    ctx.fillStyle = '#3a3646';
    ctx.fillRect(Math.round(bx - 2), Math.round(by), 4, 8);
  }
  const beamStepsR = room.width - 1;
  for (let i = 1; i < beamStepsR; i++) {
    const t = i / beamStepsR;
    const bx = southPt[0] + (eastPt[0] - southPt[0]) * t;
    const by = southPt[1] + (eastPt[1] - southPt[1]) * t + 4;
    ctx.fillStyle = '#2a2636';
    ctx.fillRect(Math.round(bx - 2), Math.round(by), 4, 8);
  }
}

function drawTowerCutawayOver(ctx, room, originX, originY) {
  const last = { x: room.width - 1, y: room.height - 1 };
  const P = (x, y, dx = 0, dy = 0) => {
    const t = tileToScreen(x, y, originX, originY);
    return [t.sx + dx, t.sy + dy];
  };
  const northPt = P(1, 1, 0, -TILE_H / 2);
  const eastPt = P(last.x, 1, TILE_W / 2, 0);
  const westPt = P(1, last.y, -TILE_W / 2, 0);

  const nwUp = [northPt[0], northPt[1] - WALL_H];
  const wUp = [westPt[0], westPt[1] - WALL_H];
  const eUp = [eastPt[0], eastPt[1] - WALL_H];

  if (room.isRooftop) {
    // Rooftop parapet stone coping along top of the walls
    fillPoly(ctx, [
      [wUp[0] - 6, wUp[1] + 2],
      [nwUp[0], nwUp[1] + 2],
      [nwUp[0], nwUp[1] - 5],
      [wUp[0] - 6, wUp[1] - 5],
    ], '#d8dce6');
    fillPoly(ctx, [
      [nwUp[0], nwUp[1] + 2],
      [eUp[0] + 6, eUp[1] + 2],
      [eUp[0] + 6, eUp[1] - 5],
      [nwUp[0], nwUp[1] - 5],
    ], '#aeb6c8');
    return;
  }

  // Upper concrete floor slab capping the cut-away walls
  const SLAB_TOP = 12;
  fillPoly(ctx, [
    [wUp[0] - 10, wUp[1] + 2],
    [nwUp[0], nwUp[1] + 2],
    [nwUp[0], nwUp[1] - SLAB_TOP],
    [wUp[0] - 10, wUp[1] - SLAB_TOP],
  ], '#8c889a');
  fillPoly(ctx, [
    [nwUp[0], nwUp[1] + 2],
    [eUp[0] + 10, eUp[1] + 2],
    [eUp[0] + 10, eUp[1] - SLAB_TOP],
    [nwUp[0], nwUp[1] - SLAB_TOP],
  ], '#686478');

  // Rebar / structural girder markers in the upper cut concrete slab
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const lx = wUp[0] + (nwUp[0] - wUp[0]) * t;
    const ly = wUp[1] + (nwUp[1] - wUp[1]) * t - 7;
    ctx.fillStyle = '#403c4e';
    ctx.fillRect(Math.round(lx - 2), Math.round(ly), 4, 6);
    const rx = nwUp[0] + (eUp[0] - nwUp[0]) * t;
    const ry = nwUp[1] + (eUp[1] - nwUp[1]) * t - 7;
    ctx.fillStyle = '#302c3c';
    ctx.fillRect(Math.round(rx - 2), Math.round(ry), 4, 6);
  }
}

// ---------- Entities, Furniture, Text & Overlays ----------

function drawCharacter(ctx, e, screenX, screenY, dpr = 1) {
  const look = LOOKS[e.spriteKey] || { ...LOOKS.player, shirt: e.color || LOOKS.player.shirt };
  const stride = e.walking ? (e.frame % 2 ? 1 : -1) : 0;
  const { canvas, ox, oy, cssH } = getCharacterCanvas(`${e.spriteKey}:${e.color}`, look, e.dir, { stride, sit: e.sitting }, dpr);
  if (!e.sitting) {
    ctx.fillStyle = 'rgba(24, 12, 36, 0.24)';
    for (const [rx, ry] of [[19, 9.5], [14, 7]]) {
      ctx.beginPath();
      ctx.ellipse(screenX + 2, screenY + 1, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const dx = screenX - ox;
  const dy = screenY - oy;
  blitDeviceAligned(ctx, canvas, dx, dy, dpr);
  return { x: screenX, y: dy, footY: screenY + 11, w: 0, h: cssH || canvas.height / dpr };
}

function drawNameTag(ctx, x, y, name) {
  ctx.save();
  ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const tw = ctx.measureText(name).width;
  const padX = 6;
  const boxW = tw + padX * 2;
  const boxH = 18;
  const bx = Math.round(x - boxW / 2);
  const by = Math.round(y - boxH / 2);
  ctx.fillStyle = 'rgba(22, 16, 40, 0.84)';
  ctx.strokeStyle = 'rgba(255, 210, 122, 0.55)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, bx, by, boxW, boxH, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffe8a8';
  ctx.fillText(name, bx + padX, by + 13.5);
  ctx.restore();
}

function furnitureCanvas(itemId, rot = 0, dpr = 1) {
  const r = ((rot % 4) + 4) % 4;
  const key = `furn:${itemId}:${r}`;
  const builder = FURNITURE_BUILDERS[toSpriteKey(itemId)];
  const sprite = builder ? builder(r) : FURNITURE_BUILDERS.stool(r);
  return bakeSprite(key, sprite, dpr);
}

function toSpriteKey(itemId) {
  return getCatalogueItem(itemId)?.spriteKey || itemId;
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawFurniture(ctx, f, originX, originY, dpr = 1) {
  const anchorX = f.x + f.footprint.w / 2 - 0.5;
  const anchorY = f.y + f.footprint.h / 2 - 0.5;
  const { sx, sy } = tileToScreen(anchorX, anchorY, originX, originY);

  const item = getCatalogueItem(f.itemId);
  if (!item?.flat) {
    const tw = f.footprint.w;
    const th = f.footprint.h;
    const rx = (tw + th) * 11;
    const ry = (tw + th) * 5.5;
    ctx.fillStyle = 'rgba(24, 12, 36, 0.22)';
    ctx.beginPath();
    ctx.ellipse(sx + 2, sy + 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const canvas = furnitureCanvas(f.itemId, f.rot, dpr);
  blitDeviceAligned(ctx, canvas, sx - canvas.ax, sy - canvas.ay, dpr);
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

export function renderRoom(ctx, opts) {
  const {
    room, placedFurniture, entities, hoverTile, ghost, phase,
    width, height, dpr = 1, now = 0, elevatorAnim = null,
  } = opts;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  drawBackground(ctx, width, height, phase, room.floor || 1, dpr, now);
  const { originX, originY } = computeOrigin(room, width, height);
  const floorColor = floorBaseColor(room);
  const wallColor = wallBaseColor(room);
  const { day } = dayNightColors(phase);
  const wb = Math.round(day * 8) / 8;
  const sky = { top: lerpColor('#1a2250', '#8fd0ff', wb), bottom: lerpColor('#ffd27a', '#fff6c9', wb) };

  // Tower cut-away shaft, concrete floor slab, and neighbouring floors
  drawTowerCutawayUnder(ctx, room, originX, originY, height, phase);

  // Pass 1: floor tiles
  const doorMap = new Map();
  for (const d of room.doors) {
    const matKey = d.y === 0 ? `${d.x},1` : `1,${d.y}`;
    doorMap.set(matKey, d);
  }
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const cell = room.grid[y][x];
      if (cell === TILE.WALL || cell === TILE.WINDOW || cell === TILE.DOOR) continue;
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      const variant = (x + y) % 2;
      const doorDef = doorMap.get(`${x},${y}`);
      let canvas;
      if (doorDef?.elevator) {
        canvas = bakeSprite(`elevtile:${room.id}`, buildElevatorTile(floorColor), dpr);
      } else if (doorDef) {
        canvas = bakeSprite(`doortile:${room.id}`, buildDoorTile(floorColor), dpr);
      } else {
        canvas = bakeSprite(`floor:${room.id}:${variant}`, buildFloorTile(floorColor, variant), dpr);
      }
      blitDeviceAligned(ctx, canvas, sx - TILE_W / 2, sy - TILE_H / 2, dpr);
    }
  }

  // Flat decor (rugs, yoga mats, lap pool tiles) lies on the floor
  for (const f of placedFurniture) {
    if (!getCatalogueItem(f.itemId)?.flat) continue;
    drawFurniture(ctx, f, originX, originY, dpr);
  }

  // Hover + placement ghost highlights
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

  // Pass 2: walls, windows, doorways & elevator doors
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const cell = room.grid[y][x];
      if (cell !== TILE.WALL && cell !== TILE.WINDOW && cell !== TILE.DOOR) continue;
      if (x === 0 && y === 0) continue;
      const kind = y === 0 ? 'north' : 'west';
      const { sx, sy } = tileToScreen(kind === 'north' ? x : 1, kind === 'north' ? 1 : y, originX, originY);
      let sprite;
      let key;
      if (cell === TILE.WINDOW) {
        key = `window:${room.id}:${kind}:${wb}`;
        sprite = () => buildWindowSegment(wallColor, sky, kind);
      } else if (cell === TILE.DOOR) {
        const doorDef = room.doors.find((d) => d.x === x && d.y === y);
        if (doorDef?.elevator) {
          key = `elevdoor:${room.id}:${kind}`;
          sprite = () => buildElevatorDoorSegment(wallColor, kind);
        } else {
          key = `door:${room.id}:${kind}`;
          sprite = () => buildDoorSegment(wallColor, kind);
        }
      } else {
        key = `wall:${room.id}:${kind}`;
        sprite = () => buildWallSegment(wallColor, kind);
      }
      const wallCanvas = bakeSprite(key, sprite(), dpr);
      blitDeviceAligned(ctx, wallCanvas, sx - TILE_W / 2, sy - WALL_ANCHOR_Y, dpr);
    }
  }

  // Upper concrete ceiling slab / parapet over the top of the walls
  drawTowerCutawayOver(ctx, room, originX, originY);

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

  const nameTargets = [];
  const bubbleTargets = [];
  for (const d of drawables) {
    if (d.type === 'furniture') {
      drawFurniture(ctx, d.data, originX, originY, dpr);
    } else {
      const e = d.data;
      const { sx, sy } = tileToScreen(e.x, e.y, originX, originY);
      const bbox = drawCharacter(ctx, e, sx, sy, dpr);
      if (e.nameTag) nameTargets.push({ x: bbox.x, y: bbox.footY, name: e.nameTag });
      if (e.bubbleText) bubbleTargets.push({ x: bbox.x + bbox.w / 2, y: bbox.y, text: e.bubbleText });
    }
  }

  // Night lighting tint over the tower & room
  const { tintAlpha } = dayNightColors(phase);
  if (tintAlpha > 0.02) {
    ctx.save();
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = '#5b6bb0';
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  for (const n of nameTargets) drawNameTag(ctx, n.x, n.y, n.name);

  // De-collide nearby speech bubbles vertically so they never cover each other
  const placedBubbles = [];
  for (const b of bubbleTargets) {
    let by = b.y;
    for (const prev of placedBubbles) {
      if (Math.abs(prev.x - b.x) < 155 && Math.abs(prev.y - by) < 48) {
        by = prev.y - 50;
      }
    }
    placedBubbles.push({ x: b.x, y: by });
    drawSpeechBubble(ctx, b.x, by, b.text, width);
  }

  // Elevator travel transition animation
  if (elevatorAnim) {
    drawElevatorTransition(ctx, width, height, elevatorAnim, now);
  }
}

function drawElevatorTransition(ctx, width, height, anim, now) {
  const t = Math.max(0, Math.min(1, (now - anim.start) / anim.duration));
  // Door close-then-open curve: peaks at t = 0.5
  const closeAmt = Math.sin(t * Math.PI);
  if (closeAmt <= 0.01) return;

  ctx.save();
  const panelW = Math.round((width * 0.52) * closeAmt);
  ctx.fillStyle = 'rgba(18, 16, 32, 0.88)';
  ctx.fillRect(0, 0, panelW, height);
  ctx.fillRect(width - panelW, 0, panelW, height);
  ctx.fillStyle = '#d8a848';
  ctx.fillRect(panelW - 4, 0, 4, height);
  ctx.fillRect(width - panelW, 0, 4, height);

  // Central digital floor counter badge
  const curFloor = Math.round(anim.fromFloor + (anim.toFloor - anim.fromFloor) * t);
  const boxW = 220;
  const boxH = 68;
  const bx = Math.round((width - boxW) / 2);
  const by = Math.round(height * 0.16);
  ctx.fillStyle = 'rgba(24, 18, 44, 0.96)';
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2.5;
  roundRect(ctx, bx, by, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#ffd27a';
  ctx.textAlign = 'center';
  ctx.fillText(`🛗 FLOOR ${curFloor}`, width / 2, by + 28);
  ctx.font = '600 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#f2e9ff';
  ctx.fillText(anim.toName, width / 2, by + 52);
  ctx.restore();
}

export function drawSpeechBubble(ctx, x, y, text, canvasWidth = 960) {
  ctx.save();
  ctx.font = '600 13.5px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const maxWidth = 185;
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

  const lineHeight = 18;
  const paddingX = 10;
  const paddingY = 7;
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = Math.ceil(textWidth + paddingX * 2);
  const boxH = lines.length * lineHeight + paddingY * 2;
  const boxX = Math.max(8, Math.min(canvasWidth - boxW - 8, Math.round(x - boxW / 2)));
  const boxY = Math.max(8, Math.round(y - boxH - 14));

  ctx.fillStyle = 'rgba(255, 253, 248, 0.97)';
  ctx.strokeStyle = '#1b1430';
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, boxY, boxW, boxH, 7);
  ctx.fill();
  ctx.stroke();

  // Speech bubble pointer tail
  const tailX = Math.max(boxX + 12, Math.min(boxX + boxW - 12, Math.round(x)));
  ctx.beginPath();
  ctx.moveTo(tailX - 6, boxY + boxH - 1);
  ctx.lineTo(tailX + 6, boxY + boxH - 1);
  ctx.lineTo(tailX, boxY + boxH + 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 253, 248, 0.97)';
  ctx.fill();
  ctx.strokeStyle = '#1b1430';
  ctx.stroke();

  ctx.fillStyle = '#1a1428';
  lines.forEach((line, i) => {
    ctx.fillText(line, boxX + paddingX, boxY + paddingY + (i + 1) * lineHeight - 4);
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
