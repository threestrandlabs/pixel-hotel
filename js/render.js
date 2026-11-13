// Isometric renderer: DPR-aware native-resolution projection, procedural
// parallax city skyline backdrop, hotel tower cut-away architecture,
// depth-sorted volumetric furniture & voxel characters, and crisp UI text.
// Browser-only (uses document/canvas) — not exercised by the Node unit tests.

import { TILE, getCatalogueItem } from './data.js';
import {
  ISO, ART, WALL_ANCHOR_Y, buildFloorTile, buildWallSegment, buildWindowSegment,
  buildDoorSegment, buildElevatorDoorSegment, buildDoorTile, buildElevatorTile,
  buildGlassBalustradeSegment, buildStairwellDoorSegment, buildEdgeRailSegment,
  FURNITURE_BUILDERS, shadeColor,
} from './sprites.js';
import { LOOKS, getCharacterCanvas } from './voxel.js';

export const { TILE_W, TILE_H, WALL_H } = ISO;
export const TOP_PADDING = 54;

const canvasCache = new Map();

// Reused across frames instead of allocated fresh each call — renderRoom runs
// synchronously once per animation frame, so there's no re-entrancy risk.
const drawablesBuf = [];
const overheadDrawablesBuf = [];
const nameTargetsBuf = [];
const bubbleTargetsBuf = [];

// Effective device-pixel density for baked bitmaps drawn under the camera transform.
// The camera scales the world by `zoom`, so a sprite baked only at `dpr` gets upscaled
// (blurry) when zoomed in. Baking at ceil(dpr*zoom) guarantees it is never upscaled,
// while snapping to integers bounds the sprite/skyline caches to a few buckets instead
// of rebaking on every 0.01 zoom step. Capped so an extreme dpr can't explode memory.
export function deviceScale(dpr = 1, zoom = 1) {
  return Math.max(1, Math.min(8, Math.ceil(dpr * (zoom || 1))));
}

// Baked sprite canvases are rasterised at `dpr` density in room/world space. The
// caller may be drawing under a camera transform (device-pixel-ratio * zoom, plus
// pan) — we must honour that same transform here too, or sprites drift out of sync
// with vector-drawn content (shadows, vehicles, buildings) that already respects it.
function blitDeviceAligned(ctx, sourceCanvas, cssX, cssY, dpr) {
  const t = ctx.getTransform();
  const dx = Math.round(t.a * cssX + t.e);
  const dy = Math.round(t.d * cssY + t.f);
  const zoomScale = t.a / dpr;
  const dw = Math.round(sourceCanvas.width * zoomScale);
  const dh = Math.round(sourceCanvas.height * zoomScale);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
  ctx.restore();
}

// `spriteOrFactory` may be a pre-built sprite object or a zero-arg factory
// function. Callers should pass a factory (e.g. `() => buildFloorTile(...)`)
// so the (expensive, per-pixel) sprite construction only runs on a cache
// miss — passing an already-invoked sprite object defeats the cache, since
// the caller pays the full build cost on every call regardless of hit/miss.
function bakeSprite(key, spriteOrFactory, dpr = 1) {
  const scale = Math.max(1, dpr);
  const cacheKey = `${key}@${scale}`;
  if (canvasCache.has(cacheKey)) return canvasCache.get(cacheKey);
  const sprite = typeof spriteOrFactory === 'function' ? spriteOrFactory() : spriteOrFactory;

  // High-resolution native DPR rasterisation for volumetric 3D prism furniture
  if (sprite.boxes && sprite.boxes.length > 0) {
    const W = Math.max(1, Math.round(sprite.w * scale));
    const H = Math.max(1, Math.round(sprite.h * scale));
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
      // fine grounding AO along the base and a polished vertical highlight along
      // the nearest front corner — genuine extra finishing detail only resolvable
      // at the doubled bake density, applied to every box of every furniture piece
      const [dx0, dy0] = P(u0, v1, z0);
      const [ex0, ey0] = P(u1, v1, z0);
      const [fx0, fy0] = P(u1, v0, z0);
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = Math.max(0.75, 0.5 * scale);
      g.beginPath();
      g.moveTo(dx0, dy0);
      g.lineTo(ex0, ey0);
      g.lineTo(fx0, fy0);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = Math.max(0.65, 0.4 * scale);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(ex0, ey0);
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

  // Raster px-grid sprites (floor/wall/door/window/elevator/balustrade) are authored
  // at ART× the on-screen footprint (see sprites.js) — rasterise each fine grid cell
  // at scale/ART device pixels so the baked bitmap keeps the exact same CSS/world
  // size as before, just built from a finer, more detailed source grid.
  const fine = scale / ART;
  const W = Math.max(1, Math.round(sprite.w * fine));
  const H = Math.max(1, Math.round(sprite.h * fine));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < sprite.h; y++) {
    const y0 = Math.round(y * fine);
    const y1 = Math.round((y + 1) * fine);
    for (let x = 0; x < sprite.w; x++) {
      const color = sprite.px[y][x];
      if (!color) continue;
      const x0 = Math.round(x * fine);
      const x1 = Math.round((x + 1) * fine);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
  }
  c.ax = (sprite.ax ?? sprite.w / 2) / ART;
  c.ay = (sprite.ay ?? (sprite.h - TILE_H * ART / 2)) / ART;
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

export const DEFAULT_ZOOM = 1.85;
export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 2.5;

export function clampZoom(z) {
  const num = typeof z === 'number' && !isNaN(z) ? z : DEFAULT_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(num * 100) / 100));
}

export function worldToScreen(wx, wy, camera = null, width = 0, height = 0) {
  if (!camera) return { sx: wx, sy: wy };
  const zoom = camera.zoom ?? 1;
  const panX = camera.panX ?? 0;
  const panY = camera.panY ?? 0;
  const cx = width > 0 ? width / 2 : 0;
  const cy = height > 0 ? height / 2 : 0;
  return {
    sx: (wx - cx) * zoom + cx + panX,
    sy: (wy - cy) * zoom + cy + panY,
  };
}

export function screenToWorld(sx, sy, camera = null, width = 0, height = 0) {
  if (!camera) return { wx: sx, wy: sy };
  const zoom = camera.zoom ?? 1;
  const panX = camera.panX ?? 0;
  const panY = camera.panY ?? 0;
  const cx = width > 0 ? width / 2 : 0;
  const cy = height > 0 ? height / 2 : 0;
  return {
    wx: (sx - cx - panX) / zoom + cx,
    wy: (sy - cy - panY) / zoom + cy,
  };
}

export function screenToTile(mx, my, originX, originY, camera = null, width = 0, height = 0) {
  let wx = mx;
  let wy = my;
  if (camera && width && height) {
    const w = screenToWorld(mx, my, camera, width, height);
    wx = w.wx;
    wy = w.wy;
  }
  const a = (wx - originX) / (TILE_W / 2);
  const b = (wy - originY) / (TILE_H / 2);
  const x = (a + b) / 2;
  const y = (b - a) / 2;
  return { x: Math.round(x), y: Math.round(y) };
}

export function centerCameraOnTile(tx, ty, room, width, height, zoom = DEFAULT_ZOOM) {
  const { originX, originY } = computeOrigin(room, width, height);
  const { sx, sy } = tileToScreen(tx, ty, originX, originY);
  const clampedZoom = clampZoom(zoom);
  const panX = Math.round(- (sx - width / 2) * clampedZoom);
  const panY = Math.round((height * 0.52 - height / 2) - (sy - height / 2) * clampedZoom);
  return { zoom: clampedZoom, panX, panY };
}

// Default "Follow camera: Off" dead-zone: the camera only pans once the player's
// screen position reaches within this fraction of the viewport edge, so the
// camera stays still for small movements near the middle of the screen.
export const CAMERA_DEADZONE_MARGIN = 0.2;

// Target pan that keeps (tx,ty) within the dead-zone box of the viewport, under
// the camera's current pan/zoom. Returns the unchanged pan if the player is
// already inside the box. Callers ease ui.camera.panX/panY toward this target
// (see main.js frame()) rather than snapping straight to it.
export function deadzoneCameraTarget(tx, ty, room, width, height, camera, margin = CAMERA_DEADZONE_MARGIN) {
  const { originX, originY } = computeOrigin(room, width, height);
  const { sx, sy } = tileToScreen(tx, ty, originX, originY);
  const zoom = camera?.zoom ?? 1;
  const panX = camera?.panX ?? 0;
  const panY = camera?.panY ?? 0;
  const screen = worldToScreen(sx, sy, camera, width, height);
  const minX = width * margin;
  const maxX = width * (1 - margin);
  const minY = height * margin;
  const maxY = height * (1 - margin);
  let dx = 0;
  if (screen.sx < minX) dx = minX - screen.sx;
  else if (screen.sx > maxX) dx = maxX - screen.sx;
  let dy = 0;
  if (screen.sy < minY) dy = minY - screen.sy;
  else if (screen.sy > maxY) dy = maxY - screen.sy;
  return { zoom, panX: panX + dx, panY: panY + dy };
}

export function zoomAtPoint(camera, newZoom, cursorX, cursorY, width, height) {
  const oldZoom = camera?.zoom ?? 1;
  const clamped = clampZoom(newZoom);
  const panX = camera?.panX ?? 0;
  const panY = camera?.panY ?? 0;
  const wx = (cursorX - width / 2 - panX) / oldZoom + width / 2;
  const wy = (cursorY - height / 2 - panY) / oldZoom + height / 2;
  const newPanX = Math.round(cursorX - width / 2 - (wx - width / 2) * clamped);
  const newPanY = Math.round(cursorY - height / 2 - (wy - height / 2) * clamped);
  return { zoom: clamped, panX: newPanX, panY: newPanY };
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
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// ---------- Shared Isometric City & Ground Backdrop (Cached Offscreen) ----------

export const SLAB_H = 16;
export const STORY_H = 56;

export function storiesBelowFloor(floor = 1) {
  const f = (floor === 'R' || floor === 42 || floor === '42') ? 42 : (Number(floor) || 1);
  return Math.max(0, Math.floor(f) - 1);
}

export function computeGroundDy(floor = 1) {
  const f = (floor === 'R' || floor === 42 || floor === '42') ? 42 : Math.max(1, Number(floor) || 1);
  if (f <= 5) return SLAB_H + (f - 1) * STORY_H;
  return SLAB_H + 4 * STORY_H + (f - 5) * 32;
}

export function computeCityGroundDy(floor = 1) {
  return computeGroundDy(floor);
}

export function projectIsoCityPoint(u, v, z, originX, groundOriginY) {
  return [
    originX + (u - v) * (TILE_W / 2),
    groundOriginY + (u + v) * (TILE_H / 2) - z,
  ];
}

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0x10000000;
  };
}

export function buildIsoCityLayout(room = { id: 'lobby', width: 12, height: 9, floor: 1 }, width = 960, height = 600, phase = 0.5, padX = 480, padBottom = 320, skipBuildings = false) {
  const W = room?.width || 12;
  const H = room?.height || 9;
  const effW = Math.max(W, 64);
  const effH = Math.max(H, 48);
  const floor = room?.floor || 1;
  const { originX, originY } = computeOrigin({ width: W, height: H }, width, height);
  const groundDy = computeGroundDy(floor);
  const cityGroundDy = computeCityGroundDy(floor);
  const groundOriginY = originY + cityGroundDy;
  const floorNum = (floor === 'R' || floor === 42 || floor === '42') ? 42 : (Number(floor) || 1);
  const horizonY = Math.round(height * 0.26 + Math.min(30, (floorNum - 1) * 2));
  const { day } = dayNightColors(phase);
  const nightFactor = Math.max(0, Math.min(1, (0.78 - day) * 1.55));

  const P = (u, v, z = 0) => projectIsoCityPoint(u, v, z, originX, groundOriginY);

  const PAD = 0.6;
  const ROAD_W = 1.6;
  const BLK_U = 4.2;
  const BLK_V = 4.2;
  const PITCH_U = BLK_U + ROAD_W;
  const PITCH_V = BLK_V + ROAD_W;

  const uBounds = (bi) => {
    if (bi === 0) return [-PAD, effW + PAD];
    if (bi < 0) {
      const u1 = -PAD - ROAD_W + (bi + 1) * PITCH_U;
      return [u1 - BLK_U, u1];
    }
    const u0 = effW + PAD + ROAD_W + (bi - 1) * PITCH_U;
    return [u0, u0 + BLK_U];
  };

  const vBounds = (bj) => {
    if (bj === 0) return [-PAD, effH + PAD];
    if (bj < 0) {
      const v1 = -PAD - ROAD_W + (bj + 1) * PITCH_V;
      return [v1 - BLK_V, v1];
    }
    const v0 = effH + PAD + ROAD_W + (bj - 1) * PITCH_V;
    return [v0, v0 + BLK_V];
  };

  // Road corridors between block columns (v-axis avenues) and rows (u-axis avenues)
  const vRoads = [];
  const uRoads = [];
  const effPadX = Math.max(padX, effW * 24, effH * 24);
  const effPadBottom = Math.max(padBottom, (effW + effH) * 12);
  const maxB = Math.max(12, Math.ceil(Math.max(effW, effH) / 5.8) + 6);
  const maxSpan = Math.max(100, effW + 60, effH + 60);
  for (let bi = -maxB; bi <= maxB - 1; bi++) {
    const [, leftU1] = uBounds(bi);
    const [rightU0] = uBounds(bi + 1);
    vRoads.push({ axis: 'v', idx: bi, u0: leftU1, u1: rightU0, v0: -maxSpan, v1: maxSpan });
  }
  for (let bj = -maxB; bj <= maxB - 1; bj++) {
    const [, topV1] = vBounds(bj);
    const [botV0] = vBounds(bj + 1);
    uRoads.push({ axis: 'u', idx: bj, u0: -maxSpan, u1: maxSpan, v0: topV1, v1: botV0 });
  }

  const roads = [
    ...vRoads.map((r) => ({ ...r, pts: [P(r.u0, r.v0), P(r.u1, r.v0), P(r.u1, r.v1), P(r.u0, r.v1)] })),
    ...uRoads.map((r) => ({ ...r, pts: [P(r.u0, r.v0), P(r.u1, r.v0), P(r.u1, r.v1), P(r.u0, r.v1)] })),
  ];

  // Zebra crossings at intersections around the hotel and neighbouring avenues
  const crossings = [];
  for (const vr of vRoads) {
    if (vr.idx < -3 || vr.idx > 2) continue;
    for (let bj = -3; bj <= 3; bj++) {
      const [bv0, bv1] = vBounds(bj);
      for (const crossV of [bv0 + 0.25, bv1 - 0.75]) {
        const stripes = [];
        for (let s = 0; s < 4; s++) {
          const su0 = vr.u0 + 0.16 + s * 0.34;
          const su1 = su0 + 0.18;
          stripes.push([P(su0, crossV), P(su1, crossV), P(su1, crossV + 0.48), P(su0, crossV + 0.48)]);
        }
        crossings.push({ axis: 'u', u: (vr.u0 + vr.u1) / 2, v: crossV, stripes });
      }
    }
  }
  for (const ur of uRoads) {
    if (ur.idx < -3 || ur.idx > 2) continue;
    for (let bi = -3; bi <= 3; bi++) {
      const [bu0, bu1] = uBounds(bi);
      for (const crossU of [bu0 + 0.25, bu1 - 0.75]) {
        const stripes = [];
        for (let s = 0; s < 4; s++) {
          const sv0 = ur.v0 + 0.16 + s * 0.34;
          const sv1 = sv0 + 0.18;
          stripes.push([P(crossU, sv0), P(crossU + 0.48, sv0), P(crossU + 0.48, sv1), P(crossU, sv1)]);
        }
        crossings.push({ axis: 'v', u: crossU, v: (ur.v0 + ur.v1) / 2, stripes });
      }
    }
  }

  const hotelWestX = originX + (0.5 - (H - 0.5)) * (TILE_W / 2);
  const hotelEastX = originX + ((W - 0.5) - 0.5) * (TILE_W / 2);
  const palettes = [
    ['#6c7e9c', '#50617c', '#889ab8'],
    ['#86748e', '#64546c', '#a290aa'],
    ['#68888e', '#4c686e', '#84a4aa'],
    ['#927c6e', '#6e5c50', '#ae988a'],
    ['#5e7092', '#445472', '#7a8cae'],
    ['#7a846e', '#5a6450', '#96a08a'],
  ];

  const blocks = [];
  const beacons = [];

  // Vehicle-only callers (every frame) just need roads/crossings above; the
  // per-building/per-window generation below is only needed for the baked
  // backdrop/foreground canvases, which are cache-miss-only.
  for (let sum = -maxB * 2; !skipBuildings && sum <= maxB * 2; sum++) {
    for (let bi = -maxB; bi <= maxB; bi++) {
      const bj = sum - bi;
      if (bj < -maxB || bj > maxB) continue;
      const [u0, u1] = uBounds(bi);
      const [v0, v1] = vBounds(bj);
      const cPt = P((u0 + u1) / 2, (v0 + v1) / 2, 0);
      if (cPt[0] < -effPadX || cPt[0] > width + effPadX || cPt[1] < horizonY - 140 || cPt[1] > height + effPadBottom) {
        continue;
      }

      const distMetric = Math.max(0, (horizonY + 380 - cPt[1]) / 380) + Math.max(0, -sum) * 0.08;
      const haze = Math.max(0, Math.min(0.72, distMetric * 0.42));
      const rand = seededRand((bi + 17) * 73856093 ^ (bj + 19) * 19349663);

      const trees = [];
      const lamps = [];
      const addPerimeterProps = (step = 2.4, frontOnly = false) => {
        for (let u = u0 + 0.75; u <= u1 - 0.75; u += step) {
          if (!frontOnly) trees.push({ u, v: v0 + 0.26, layer: 'back' });
          trees.push({ u, v: v1 - 0.26, layer: 'front' });
        }
        for (let v = v0 + 0.95; v <= v1 - 0.95; v += step) {
          if (!frontOnly) lamps.push({ u: u0 + 0.26, v, layer: 'back' });
          lamps.push({ u: u1 - 0.26, v, layer: 'front' });
        }
      };

      if (bi === 0 && bj === 0) {
        addPerimeterProps(2.4, true);
        blocks.push({
          bi, bj, u0, v0, u1, v1,
          kind: 'hotel',
          haze: 0,
          buildings: [],
          trees,
          lamps,
        });
        continue;
      }

      // Subdivide block into parcels (or single parcel on compact outer blocks)
      const uSpanBlk = u1 - u0;
      const vSpanBlk = v1 - v0;
      let parcels;
      if (bi === 0 && bj === 1) {
        parcels = [
          { pu0: u0 + 0.32, pv0: v0 + 0.32, pu1: 2.6, pv1: v1 - 0.32 },
          { pu0: 3.1, pv0: v0 + 0.32, pu1: u1 - 0.32, pv1: v1 - 0.32 },
        ];
      } else if (bi === 1 && bj === 0) {
        parcels = [
          { pu0: u0 + 0.32, pv0: v0 + 0.32, pu1: u1 - 0.32, pv1: 2.6 },
          { pu0: u0 + 0.32, pv0: 3.1, pu1: u1 - 0.32, pv1: v1 - 0.32 },
        ];
      } else if (uSpanBlk > 6) {
        const midU = (u0 + u1) / 2;
        parcels = [
          { pu0: u0 + 0.32, pv0: v0 + 0.32, pu1: midU - 0.18, pv1: v1 - 0.32 },
          { pu0: midU + 0.18, pv0: v0 + 0.32, pu1: u1 - 0.32, pv1: v1 - 0.32 },
        ];
      } else if (vSpanBlk > 6) {
        const midV = (v0 + v1) / 2;
        parcels = [
          { pu0: u0 + 0.32, pv0: v0 + 0.32, pu1: u1 - 0.32, pv1: midV - 0.18 },
          { pu0: u0 + 0.32, pv0: midV + 0.18, pu1: u1 - 0.32, pv1: v1 - 0.32 },
        ];
      } else {
        parcels = [{ pu0: u0 + 0.32, pv0: v0 + 0.32, pu1: u1 - 0.32, pv1: v1 - 0.32 }];
      }

      const buildings = [];
      let isParkBlock = (bi === 1 && bj === 1);

      for (let pi = 0; pi < parcels.length; pi++) {
        const { pu0, pv0, pu1, pv1 } = parcels[pi];
        const pMinX = P(pu0, pv1, 0)[0];
        const pMaxX = P(pu1, pv0, 0)[0];
        const overlapsHotelCorridor = (bi > 0 || bj > 0) && (pMaxX > hotelWestX - 18 && pMinX < hotelEastX + 18);

        if (isParkBlock || overlapsHotelCorridor) {
          buildings.push({
            isPlaza: true,
            u0: pu0, v0: pv0, u1: pu1, v1: pv1,
            heightZ: 6,
            roofStyle: 'fountain',
          });
          trees.push({ u: (pu0 + pu1) / 2 - 0.9, v: (pv0 + pv1) / 2 + 0.7, layer: 'front' });
          trees.push({ u: (pu0 + pu1) / 2 + 0.9, v: (pv0 + pv1) / 2 - 0.7, layer: 'front' });
          continue;
        }

        // Neighbour building height in consistent storey units (3-34 storeys, STORY_H = 56px)
        const isBackRing = (bi <= 0 || bj <= 0 || (bi + bj) <= 0);
        const minStories = isBackRing ? 8 : 4;
        const maxStories = isBackRing ? 34 : 18;
        const rawStories = minStories + Math.floor(rand() * (maxStories - minStories + 1));
        const storyPx = STORY_H;
        const stories = Math.max(4, Math.min(34, rawStories));
        const heightZ = stories * storyPx;
        const pal = palettes[Math.floor(rand() * palettes.length)];
        const roofStyle = Math.floor(rand() * 4); // 0: penthouse+spire, 1: HVAC+skylight, 2: sky-garden, 3: art-deco setback
        const waterTower = stories >= 8 && stories <= 22 && rand() < 0.35;

        const windowsLeft = [];
        const windowsRight = [];
        const uSpan = pu1 - pu0;
        const vSpan = pv1 - pv0;
        const uCols = Math.max(2, Math.floor(uSpan * 1.4));
        const vCols = Math.max(2, Math.floor(vSpan * 1.4));

        for (let st = 0; st < stories; st++) {
          const z0 = 3 + 8 + st * storyPx;
          const z1 = z0 + 26;
          for (let c = 0; c < uCols; c++) {
            const wu0 = pu0 + 0.35 + (c / uCols) * (uSpan - 0.7);
            const wu1 = wu0 + ((uSpan - 0.7) / uCols) * 0.62;
            const wSeed = rand();
            const lit = nightFactor > 0.08 && wSeed < 0.58 * nightFactor;
            windowsLeft.push({ u0: wu0, u1: wu1, v: pv1, z0, z1, lit, tone: wSeed < 0.18 ? 'cyan' : 'warm' });
          }
          for (let c = 0; c < vCols; c++) {
            const wv0 = pv0 + 0.35 + (c / vCols) * (vSpan - 0.7);
            const wv1 = wv0 + ((vSpan - 0.7) / vCols) * 0.62;
            const wSeed = rand();
            const lit = nightFactor > 0.08 && wSeed < 0.54 * nightFactor;
            windowsRight.push({ v0: wv0, v1: wv1, u: pu1, z0, z1, lit, tone: wSeed < 0.18 ? 'cyan' : 'warm' });
          }
        }

        if (roofStyle === 0 && stories >= 6) {
          const spireTop = P((pu0 + pu1) / 2, (pv0 + pv1) / 2, 3 + heightZ + 32);
          if (spireTop[0] >= -padX && spireTop[0] <= width + padX && spireTop[1] >= -120 && spireTop[1] <= height + padBottom) {
            beacons.push({ x: spireTop[0], y: spireTop[1] });
          }
        }

        buildings.push({
          isPlaza: false,
          u0: pu0, v0: pv0, u1: pu1, v1: pv1,
          stories,
          heightZ,
          leftCol: pal[0],
          rightCol: pal[1],
          roofCol: pal[2],
          roofStyle,
          waterTower,
          windowsLeft,
          windowsRight,
        });
      }

      addPerimeterProps(2.4, true);
      blocks.push({
        bi, bj, u0, v0, u1, v1,
        depth: bi + bj,
        kind: isParkBlock ? 'park' : 'buildings',
        haze,
        buildings,
        trees,
        lamps,
      });
    }
  }

  return {
    originX,
    originY,
    groundDy,
    cityGroundDy,
    groundOriginY,
    horizonY,
    axes: {
      uVec: [TILE_W / 2, TILE_H / 2],
      vVec: [-TILE_W / 2, TILE_H / 2],
    },
    roads,
    crossings,
    blocks,
    beacons,
  };
}

let skylineCache = { key: '', canvas: null, beacons: [], ox: 0, oy: 0 };
let foregroundCache = { key: '', canvas: null, ox: 0, oy: 0 };
let cutawayCache = { key: '', canvas: null };
let cutawayOverCache = { key: '', canvas: null };
let cityLayoutCache = { key: '', layout: null };
let poolWaterLayerCache = { key: '', canvas: null, minX: 0, minY: 0, maxX: 0, maxY: 0 };
let lightMapCache = { key: '', canvas: null, minX: 0, minY: 0 };
let floorLayerCache = { key: '', canvas: null, minX: 0, minY: 0 };
let wallLayerCache = { key: '', canvas: null, minX: 0, minY: 0 };

export function getCachedIsoCityLayout(roomSpec, width, height, phase, padX, padBottom) {
  const key = `${roomSpec?.id || 'lobby'}:${roomSpec?.floor || 1}:${roomSpec?.width || 12}x${roomSpec?.height || 9}:${width}x${height}:${padX}x${padBottom}`;
  if (cityLayoutCache.key === key && cityLayoutCache.layout) return cityLayoutCache.layout;
  const layout = buildIsoCityLayout(roomSpec, width, height, phase, padX, padBottom, true);
  cityLayoutCache = { key, layout };
  return layout;
}

// ---------- Animated City Vehicles (Cars, Taxis, Buses, Scooters) ----------

const VEHICLE_TYPES = {
  car: { length: 1.3, width: 0.55, height: 8, speed: 0.0032 },
  taxi: { length: 1.3, width: 0.55, height: 8, speed: 0.0033 },
  bus: { length: 2.7, width: 0.72, height: 13, speed: 0.0024 },
  scooter: { length: 0.7, width: 0.35, height: 6, speed: 0.0038 },
};

const CAR_COLORS = ['#3f72af', '#c0392b', '#27ae60', '#e0e0e0', '#2c3e50', '#8e44ad', '#d35400'];

const VEHICLE_CONFIGS = [
  { id: 'v0', axis: 'v', rIdx: -2, lane: 1, type: 'car', color: CAR_COLORS[0], offset: 0 },
  { id: 'v1', axis: 'v', rIdx: -2, lane: -1, type: 'bus', color: '#c0392b', offset: 25 },
  { id: 'v2', axis: 'v', rIdx: -1, lane: 1, type: 'taxi', color: '#f1c40f', offset: 12 },
  { id: 'v3', axis: 'v', rIdx: -1, lane: -1, type: 'scooter', color: '#e74c3c', offset: 35 },
  { id: 'v4', axis: 'v', rIdx: 0, lane: 1, type: 'car', color: CAR_COLORS[1], offset: 48 },
  { id: 'v5', axis: 'v', rIdx: 0, lane: -1, type: 'taxi', color: '#f1c40f', offset: 6 },
  { id: 'v6', axis: 'v', rIdx: 1, lane: 1, type: 'bus', color: '#2980b9', offset: 18 },
  { id: 'v7', axis: 'v', rIdx: 1, lane: -1, type: 'car', color: CAR_COLORS[2], offset: 42 },

  { id: 'u0', axis: 'u', rIdx: -2, lane: 1, type: 'car', color: CAR_COLORS[3], offset: 5 },
  { id: 'u1', axis: 'u', rIdx: -2, lane: -1, type: 'taxi', color: '#f1c40f', offset: 28 },
  { id: 'u2', axis: 'u', rIdx: -1, lane: 1, type: 'bus', color: '#27ae60', offset: 16 },
  { id: 'u3', axis: 'u', rIdx: -1, lane: -1, type: 'car', color: CAR_COLORS[4], offset: 45 },
  { id: 'u4', axis: 'u', rIdx: 0, lane: 1, type: 'scooter', color: '#34495e', offset: 8 },
  { id: 'u5', axis: 'u', rIdx: 0, lane: -1, type: 'car', color: CAR_COLORS[5], offset: 33 },
  { id: 'u6', axis: 'u', rIdx: 1, lane: 1, type: 'taxi', color: '#f1c40f', offset: 22 },
  { id: 'u7', axis: 'u', rIdx: 1, lane: -1, type: 'bus', color: '#d35400', offset: 52 },
];

export function computeCityVehicles(layout, now = 0, phase = 0.5) {
  if (!layout?.roads) return [];
  const { day } = dayNightColors(phase);
  const lightsOn = day < 0.75;
  const vehicles = [];

  const cycle = (now % 12000) / 1000;
  const vGreen = cycle < 5.5;
  const uGreen = cycle >= 6.0 && cycle < 11.5;

  const roadLength = 76;
  const roadStart = -36;

  for (const cfg of VEHICLE_CONFIGS) {
    const road = layout.roads.find((r) => r.axis === cfg.axis && r.idx === cfg.rIdx);
    if (!road) continue;

    const vDef = VEHICLE_TYPES[cfg.type] || VEHICLE_TYPES.car;
    const isV = cfg.axis === 'v';
    const isGreen = isV ? vGreen : uGreen;

    let rawDist = ((now * vDef.speed + cfg.offset) % roadLength);
    let coord = cfg.lane > 0 ? (roadStart + rawDist) : (roadStart + roadLength - rawDist);

    const crossings = layout.crossings.filter((c) => (isV ? (c.axis === 'u') : (c.axis === 'v')));
    let stopping = false;

    if (!isGreen) {
      for (const cross of crossings) {
        const crossPos = isV ? cross.v : cross.u;
        const distToCross = cfg.lane > 0 ? (crossPos - coord) : (coord - crossPos);
        if (distToCross > 0.2 && distToCross < 2.5) {
          const stopLine = cfg.lane > 0 ? (crossPos - 0.75) : (crossPos + 0.75);
          coord = stopLine;
          stopping = true;
          break;
        }
      }
    }

    const mid = isV ? (road.u0 + road.u1) / 2 : (road.v0 + road.v1) / 2;
    const laneOffset = cfg.lane > 0 ? 0.38 : -0.38;

    let u, v, heading;
    if (isV) {
      u = mid + laneOffset;
      v = coord;
      heading = cfg.lane > 0 ? '+v' : '-v';
    } else {
      u = coord;
      v = mid - laneOffset;
      heading = cfg.lane > 0 ? '+u' : '-u';
    }

    const pt = projectIsoCityPoint(u, v, 0, layout.originX, layout.groundOriginY);

    vehicles.push({
      id: cfg.id,
      axis: cfg.axis,
      lane: cfg.lane,
      type: cfg.type,
      color: cfg.color,
      u,
      v,
      screenX: pt[0],
      screenY: pt[1],
      heading,
      stopping,
      lightsOn,
      length: vDef.length,
      width: vDef.width,
      height: vDef.height,
    });
  }

  vehicles.sort((a, b) => (a.u + a.v) - (b.u + b.v));
  return vehicles;
}

export function drawCityVehicles(ctx, layout, vehicles, phase = 0.5, dpr = 1) {
  if (!vehicles || vehicles.length === 0) return;
  const P = (u, v, z = 0) => projectIsoCityPoint(u, v, z, layout.originX, layout.groundOriginY);
  const { day } = dayNightColors(phase);

  for (const veh of vehicles) {
    const { u, v, heading, type, color, lightsOn, stopping, length, width, height } = veh;
    const isV = veh.axis === 'v';

    let u0, v0, u1, v1;
    if (isV) {
      u0 = u - width / 2;
      u1 = u + width / 2;
      v0 = v - length / 2;
      v1 = v + length / 2;
    } else {
      u0 = u - length / 2;
      u1 = u + length / 2;
      v0 = v - width / 2;
      v1 = v + width / 2;
    }

    // Shadow on asphalt
    fillPoly(ctx, [P(u0 - 0.08, v0 - 0.08, 0.2), P(u1 + 0.08, v0 - 0.08, 0.2), P(u1 + 0.08, v1 + 0.08, 0.2), P(u0 - 0.08, v1 + 0.08, 0.2)], 'rgba(15, 12, 24, 0.38)');

    // Headlight cones at night
    if (lightsOn) {
      ctx.save();
      let conePts = null;
      if (heading === '+v') {
        conePts = [P(u0 + 0.05, v1, 1), P(u1 - 0.05, v1, 1), P(u1 + 0.55, v1 + 2.8, 0), P(u0 - 0.55, v1 + 2.8, 0)];
      } else if (heading === '-v') {
        conePts = [P(u1 - 0.05, v0, 1), P(u0 + 0.05, v0, 1), P(u0 - 0.55, v0 - 2.8, 0), P(u1 + 0.55, v0 - 2.8, 0)];
      } else if (heading === '+u') {
        conePts = [P(u1, v0 + 0.05, 1), P(u1, v1 - 0.05, 1), P(u1 + 2.8, v1 + 0.55, 0), P(u1 + 2.8, v0 - 0.55, 0)];
      } else {
        conePts = [P(u0, v1 - 0.05, 1), P(u0, v0 + 0.05, 1), P(u0 - 2.8, v0 - 0.55, 0), P(u0 - 2.8, v1 + 0.55, 0)];
      }
      if (conePts) fillPoly(ctx, conePts, 'rgba(255, 246, 175, 0.2)');
      ctx.restore();
    }

    // Base body prism
    const bodyCol = color;
    const bodyLeft = shadeColor(bodyCol, -0.16);
    const bodyRight = shadeColor(bodyCol, -0.32);
    const bodyTop = shadeColor(bodyCol, 0.08);
    const zBase = 1;
    const zBody = zBase + Math.min(height, 5.5);

    drawIsoPrism(ctx, P, u0, v0, u1, v1, zBase, zBody, bodyLeft, bodyRight, bodyTop);

    // Dark wheel blobs at the body corners, only resolvable at native bake density
    ctx.fillStyle = '#14141a';
    for (const [wu, wv] of [[u0 + 0.08, v0 + 0.12], [u1 - 0.08, v0 + 0.12], [u0 + 0.08, v1 - 0.12], [u1 - 0.08, v1 - 0.12]]) {
      const wp = P(wu, wv, zBase);
      ctx.beginPath(); ctx.arc(wp[0], wp[1], Math.max(1, 1.1 * dpr), 0, Math.PI * 2); ctx.fill();
    }

    // Upper cabin / windows for car / taxi / bus
    if (type !== 'scooter') {
      const zCabTop = zBase + height;
      const cabPadU = isV ? 0.06 : 0.22;
      const cabPadV = isV ? 0.22 : 0.06;
      const cabU0 = u0 + cabPadU;
      const cabU1 = u1 - cabPadU;
      const cabV0 = v0 + cabPadV;
      const cabV1 = v1 - cabPadV;

      const cabGlass = day > 0.6 ? '#6cb0d8' : '#2c3e54';
      drawIsoPrism(ctx, P, cabU0, cabV0, cabU1, cabV1, zBody, zCabTop, shadeColor(cabGlass, -0.15), shadeColor(cabGlass, -0.28), bodyTop);

      // central door-pillar mullion line across the cabin glass, only resolvable at native bake density
      ctx.strokeStyle = shadeColor(bodyCol, -0.4);
      ctx.lineWidth = Math.max(0.6, 0.5 * dpr);
      ctx.beginPath();
      if (isV) {
        const mTop = P((cabU0 + cabU1) / 2, cabV0, zCabTop);
        const mBot = P((cabU0 + cabU1) / 2, cabV0, zBody);
        ctx.moveTo(mTop[0], mTop[1]); ctx.lineTo(mBot[0], mBot[1]);
      } else {
        const mTop = P(cabU0, (cabV0 + cabV1) / 2, zCabTop);
        const mBot = P(cabU0, (cabV0 + cabV1) / 2, zBody);
        ctx.moveTo(mTop[0], mTop[1]); ctx.lineTo(mBot[0], mBot[1]);
      }
      ctx.stroke();

      if (type === 'taxi') {
        const sU0 = u - 0.1, sU1 = u + 0.1;
        const sV0 = v - 0.1, sV1 = v + 0.1;
        drawIsoPrism(ctx, P, sU0, sV0, sU1, sV1, zCabTop, zCabTop + 2.8, '#f5f5f5', '#dcdcdc', '#ffffff');
      }
    } else {
      const rHead = P(u, v, zBody + 5);
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.arc(rHead[0], rHead[1], 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Headlights and Taillights
    if (lightsOn) {
      ctx.save();
      const headCol = '#fff9a8';
      const tailCol = stopping ? '#ff1e1e' : '#e74c3c';

      let frontPt1, frontPt2, rearPt1, rearPt2;
      if (heading === '+v') {
        frontPt1 = P(u0 + 0.08, v1, 3.5); frontPt2 = P(u1 - 0.08, v1, 3.5);
        rearPt1 = P(u0 + 0.08, v0, 3.5); rearPt2 = P(u1 - 0.08, v0, 3.5);
      } else if (heading === '-v') {
        frontPt1 = P(u1 - 0.08, v0, 3.5); frontPt2 = P(u0 + 0.08, v0, 3.5);
        rearPt1 = P(u1 - 0.08, v1, 3.5); rearPt2 = P(u0 + 0.08, v1, 3.5);
      } else if (heading === '+u') {
        frontPt1 = P(u1, v0 + 0.08, 3.5); frontPt2 = P(u1, v1 - 0.08, 3.5);
        rearPt1 = P(u0, v0 + 0.08, 3.5); rearPt2 = P(u0, v1 - 0.08, 3.5);
      } else {
        frontPt1 = P(u0, v1 - 0.08, 3.5); frontPt2 = P(u0, v0 + 0.08, 3.5);
        rearPt1 = P(u1, v1 - 0.08, 3.5); rearPt2 = P(u1, v0 + 0.08, 3.5);
      }

      ctx.fillStyle = headCol;
      ctx.beginPath(); ctx.arc(frontPt1[0], frontPt1[1], 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(frontPt2[0], frontPt2[1], 1.6, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = tailCol;
      ctx.beginPath(); ctx.arc(rearPt1[0], rearPt1[1], stopping ? 2.0 : 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rearPt2[0], rearPt2[1], stopping ? 2.0 : 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

export function drawBackground(ctx, width, height, phase, floor = 1, dpr = 1, now = 0, room = null, zoom = 1, camera = null) {
  const rW = room?.width || 12;
  const rH = room?.height || 9;
  const z = Math.max(0.1, zoom || 1);
  const zoomMarginX = Math.max(0, (width / z - width) / 2);
  const zoomMarginY = Math.max(0, (height / z - height) / 2);
  const ox = Math.max(180, Math.ceil((zoomMarginX + 40) / 60) * 60);
  const oy = Math.max(120, Math.ceil((zoomMarginY + 40) / 60) * 60);
  const baseKey = `${width}x${height}+${ox}x${oy}@${dpr}:f${floor}:${rW}x${rH}`;
  const needsBake = skylineCache.baseKey !== baseKey ||
    skylineCache.phase === undefined ||
    Math.abs(phase - skylineCache.phase) >= 0.25;

  // 1. Street layer & sky backdrop (sky, distant skyline, ground, roads, zebra crossings)
  if (needsBake) {
    const off = skylineCache.canvas || document.createElement('canvas');
    off.width = Math.max(1, Math.round((width + 2 * ox) * dpr));
    off.height = Math.max(1, Math.round((height + 2 * oy) * dpr));
    const g = off.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    renderSkylineToCanvas(g, width, height, phase, floor, room, ox, oy, 'backdrop');
    skylineCache = { key: baseKey, baseKey, canvas: off, ox, oy, phase };
  }
  blitDeviceAligned(ctx, skylineCache.canvas, -skylineCache.ox, -skylineCache.oy, dpr);

  // 2. Animated city vehicles on open isometric road corridors. Clipped to the ground-plane
  // band below horizonY so a vehicle far down a road stays on the asphalt. Drawn on top
  // of the street layer and underneath the buildings layer so buildings in front occlude cars.
  // Vehicles only read layout.roads/crossings, never the per-building/window data, so this
  // per-frame call skips generating the (expensive) building geometry entirely.
  const roomSpec = room || { id: 'lobby', width: 12, height: 9, floor };
  const layout = getCachedIsoCityLayout(roomSpec, width, height, phase, 400 + ox, 320 + oy);
  const vehicles = computeCityVehicles(layout, now, phase);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-ox, layout.horizonY, width + 2 * ox, height + oy - layout.horizonY);
  ctx.clip();
  drawCityVehicles(ctx, layout, vehicles, phase, dpr);
  ctx.restore();

  // 3. 3D City buildings, sidewalks, trees & lamps. Rendered over the vehicles on a
  // transparent canvas so vehicles passing behind buildings are correctly occluded while
  // vehicles on open streets remain fully visible.
  if (needsBake) {
    const off = foregroundCache.canvas || document.createElement('canvas');
    off.width = Math.max(1, Math.round((width + 2 * ox) * dpr));
    off.height = Math.max(1, Math.round((height + 2 * oy) * dpr));
    const g = off.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, off.width, off.height);
    g.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    const beacons = renderSkylineToCanvas(g, width, height, phase, floor, room, ox, oy, 'buildings');
    foregroundCache = { key: baseKey, baseKey, canvas: off, beacons, ox, oy, phase };
  }
  blitDeviceAligned(ctx, foregroundCache.canvas, -foregroundCache.ox, -foregroundCache.oy, dpr);

  // 4. Live blinking red aircraft warning beacons on tall isometric skyscraper spires
  const blinkOn = Math.floor(now / 650) % 2 === 0;
  for (const b of (foregroundCache.beacons || [])) {
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

function drawIsoPrism(g, P, u0, v0, u1, v1, z0, z1, leftCol, rightCol, topCol) {
  fillPoly(g, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], leftCol);
  fillPoly(g, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], rightCol);
  fillPoly(g, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], topCol);
}

// renderSkylineToCanvas renders either the street/sky backdrop layer (layer === 'backdrop')
// or the 3D buildings and sidewalk props layer (layer === 'buildings') or both (layer === 'all').
// By separating the street and building layers, vehicles are drawn on the asphalt before
// buildings in front of them are drawn, guaranteeing 100% correct isometric depth sorting.
export function renderSkylineToCanvas(g, width, height, phase, floor, room = null, ox = 0, oy = 0, layer = 'all') {
  const isBackdrop = (layer === 'backdrop' || layer === 'all' || layer === false);
  const isBuildings = (layer === 'buildings' || layer === 'all' || layer === true);
  const { skyTop, skyMid, skyBottom, day } = dayNightColors(phase);
  const roomSpec = room || { id: 'lobby', width: 12, height: 9, floor };
  // The backdrop-only bake never reads layout.blocks, so it skips generating them.
  const layout = buildIsoCityLayout(roomSpec, width, height, phase, 400 + ox, 320 + oy, !isBuildings);
  const { originX, groundOriginY, horizonY } = layout;
  const P = (u, v, z = 0) => projectIsoCityPoint(u, v, z, originX, groundOriginY);
  // Logical fill bounds, widened by the over-scan so the city/ground/sky still cover
  // the viewport when the camera is zoomed out (the whole bitmap shrinks toward centre).
  const bx0 = -ox;
  const by0 = -oy;
  const bw = width + 2 * ox;
  const bh = height + 2 * oy;
  const by1 = height + oy;
  const hazeColor = lerpColor('#1d244b', '#9ec6ec', day);

  if (isBackdrop) {
  // 1. Sky backdrop gradient
  const grad = g.createLinearGradient(0, 0, 0, horizonY + 50);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(0.58, skyMid);
  grad.addColorStop(1, skyBottom);
  g.fillStyle = grad;
  g.fillRect(bx0, by0, bw, bh);

  // 2. Twinkling stars at night / twilight
  if (day < 0.72) {
    const starAlpha = Math.min(0.95, (0.72 - day) * 1.45);
    const rStar = seededRand(90421);
    for (let i = 0; i < 160; i++) {
      const sx = Math.round(bx0 + rStar() * bw);
      const sy = Math.round(by0 + rStar() * (horizonY - by0) * 0.85);
      const roll = rStar();
      const sz = roll > 0.93 ? 2 : roll > 0.7 ? 1.2 : 0.6; // finer star grain, only resolvable at the doubled bake density
      g.fillStyle = `rgba(255, 248, 224, ${(starAlpha * (0.35 + rStar() * 0.65)).toFixed(2)})`;
      g.fillRect(sx, sy, sz, sz);
    }
  }

  // 3. Sun & Moon arc above the horizon
  const sunAngle = (phase - 0.22) * Math.PI * 1.8;
  const cx = width * 0.5;
  const rx = width * 0.38;
  const ry = horizonY * 0.65;
  if (day > 0.15) {
    const sunX = cx - Math.cos(sunAngle) * rx;
    const sunY = horizonY * 0.78 - Math.sin(sunAngle) * ry;
    if (sunY < horizonY + 18) {
      const glow = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 40);
      glow.addColorStop(0, 'rgba(255, 246, 190, 0.95)');
      glow.addColorStop(0.4, 'rgba(255, 200, 110, 0.35)');
      glow.addColorStop(1, 'rgba(255, 180, 90, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(sunX, sunY, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff5c0';
      g.beginPath();
      g.arc(sunX, sunY, 13, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (day < 0.65) {
    const moonAngle = ((phase + 0.5) % 1) * Math.PI;
    const moonX = width * 0.16 + Math.cos(moonAngle * 0.7) * (width * 0.25);
    const moonY = Math.max(32, horizonY * 0.34);
    g.fillStyle = 'rgba(210, 228, 255, 0.18)';
    g.beginPath();
    g.arc(moonX, moonY, 24, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#eef4ff';
    g.beginPath();
    g.arc(moonX, moonY, 11, 0, Math.PI * 2);
    g.fill();
  }

  // Distant city skyline silhouette along the horizon (procedural stepped towers and spires)
  const skylineCol1 = lerpColor('#0e132c', '#6086af', day);
  const skylineCol2 = lerpColor('#151c3d', '#7ba1c8', day);
  const rDistant = seededRand(88219);
  const distSkyGrad = g.createLinearGradient(0, horizonY - 140, 0, horizonY);
  distSkyGrad.addColorStop(0, skylineCol1);
  distSkyGrad.addColorStop(1, skylineCol2);
  g.fillStyle = distSkyGrad;

  for (let x = bx0; x < bx0 + bw; ) {
    const tw = Math.round(20 + rDistant() * 38);
    const th = Math.round(30 + rDistant() * 110 + (Math.sin(x * 0.003) + 1) * 20);
    g.fillRect(x, horizonY - th, tw - 2, th);
    // fine vertical facade seam lines, only resolvable at the doubled bake density
    g.fillStyle = lerpColor(skylineCol1, '#000000', 0.18);
    for (let sx2 = x + 6; sx2 < x + tw - 4; sx2 += 6) g.fillRect(sx2, horizonY - th, 1, th);
    g.fillStyle = distSkyGrad;
    if (rDistant() > 0.45) {
      const spireH = Math.round(12 + rDistant() * 26);
      g.fillRect(Math.round(x + tw / 2 - 1), horizonY - th - spireH, 2, spireH);
    }
    if (day < 0.65) {
      const winAlpha = Math.min(0.65, (0.65 - day) * 1.2);
      for (let wy = horizonY - th + 8; wy < horizonY - 4; wy += 5) {
        for (let wx = x + 4; wx < x + tw - 4; wx += 6) {
          if (rDistant() > 0.55) {
            g.fillStyle = `rgba(255, 235, 160, ${(winAlpha * (0.6 + rDistant() * 0.4)).toFixed(2)})`;
            g.fillRect(wx, wy, 1.4, 1.4);
          }
        }
      }
      g.fillStyle = distSkyGrad;
    }
    x += tw;
  }

  // Distant soft hills silhouette along horizon
  const hillColor = lerpColor('#151d3f', '#789ec8', day);
  g.fillStyle = hillColor;
  g.beginPath();
  g.moveTo(bx0, horizonY);
  for (let x = bx0; x <= bx0 + bw; x += 40) {
    const h = Math.sin(x * 0.0065 + 1.2) * 12 + Math.cos(x * 0.015) * 6 + 10;
    g.lineTo(x, horizonY - h);
  }
  g.lineTo(bx0 + bw, horizonY + 8);
  g.lineTo(bx0, horizonY + 8);
  g.closePath();
  g.fill();

  // 4. Shared Isometric Ground Plane, Roads, Lane Markings & Zebra Crossings (clipped below horizonY)
  const asphaltNear = lerpColor('#191926', '#4c5360', day);
  const asphaltFar = lerpColor(asphaltNear, hazeColor, 0.48);

  g.save();
  g.beginPath();
  g.rect(bx0, horizonY, bw, by1 - horizonY);
  g.clip();

  const groundGrad = g.createLinearGradient(0, horizonY, 0, by1);
  groundGrad.addColorStop(0, asphaltFar);
  groundGrad.addColorStop(0.38, lerpColor(asphaltNear, hazeColor, 0.18));
  groundGrad.addColorStop(1, asphaltNear);
  g.fillStyle = groundGrad;
  g.fillRect(bx0, horizonY, bw, by1 - horizonY);

  // Isometric road corridors & centre lane dashes aligned with hotel (u, v) axes
  const roadSurfCol = lerpColor('#161622', '#454c58', day);
  const dashCol = lerpColor('#7a6e3e', '#ebd998', day);
  for (const r of layout.roads) {
    fillPoly(g, r.pts, roadSurfCol);
    const mid = (r.axis === 'v') ? (r.u0 + r.u1) / 2 : (r.v0 + r.v1) / 2;
    for (let t = -54; t <= 54; t += 1.8) {
      const dPts = (r.axis === 'v')
        ? [P(mid - 0.07, t), P(mid + 0.07, t), P(mid + 0.07, t + 0.85), P(mid - 0.07, t + 0.85)]
        : [P(t, mid - 0.07), P(t + 0.85, mid - 0.07), P(t + 0.85, mid + 0.07), P(t, mid + 0.07)];
      fillPoly(g, dPts, dashCol);
    }
  }

  // Isometric pedestrian zebra crossings at intersections
  const zebraCol = lerpColor('#8c92a6', '#eef0f6', day);
  for (const c of layout.crossings) {
    for (const st of c.stripes) {
      fillPoly(g, st, zebraCol);
    }
  }
  g.restore();

  // Soft distance haze ribbon along the horizon (drawn before 3D buildings so towers rise cleanly through it)
  const mistGrad = g.createLinearGradient(0, horizonY - 12, 0, horizonY + 28);
  mistGrad.addColorStop(0, 'rgba(255,255,255,0)');
  mistGrad.addColorStop(0.45, lerpColor('#1d244b', '#cde4fa', day) + '55');
  mistGrad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = mistGrad;
  g.fillRect(bx0, horizonY - 12, bw, 40);

  // High-altitude atmospheric cloud ribbons on upper tower floors (Floors 7-10)
  if (floor >= 7) {
    const cloudAlpha = day > 0.5 ? 0.18 : 0.08;
    g.fillStyle = `rgba(236, 244, 255, ${cloudAlpha})`;
    for (let i = 0; i < 5; i++) {
      const cx0 = ((i * 210 + floor * 37) % (width - 80));
      const cy0 = 38 + (i % 3) * 32;
      g.beginPath();
      g.ellipse(cx0 + 50, cy0, 56, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  } // end isBackdrop

  if (isBuildings) {
  // 5. Depth-Sorted Isometric City Blocks, Pavements, 3D Buildings, Trees & Streetlamps
  const basePaveTop = lerpColor('#343244', '#b8b2a6', day);
  const basePaveLeft = lerpColor('#282636', '#948e82', day);
  const basePaveRight = lerpColor('#1e1c2a', '#787268', day);
  const dayWinLeft = lerpColor('#2a3e64', '#7ab2de', day);
  const dayWinRight = lerpColor('#203050', '#5c90bc', day);

  // Pass 5a: Raised isometric sidewalk slabs for all city blocks
  for (const blk of layout.blocks) {
    const { u0, v0, u1, v1, haze } = blk;
    const paveTop = lerpColor(basePaveTop, hazeColor, haze);
    const paveLeft = lerpColor(basePaveLeft, hazeColor, haze);
    const paveRight = lerpColor(basePaveRight, hazeColor, haze);

    const sPt = P(u1, v1, 0);
    if (sPt[1] > horizonY) {
      drawIsoPrism(g, P, u0, v0, u1, v1, 0, 3, paveLeft, paveRight, paveTop);
      g.strokeStyle = lerpColor(shadeColor(basePaveTop, -0.1), hazeColor, haze);
      g.lineWidth = 0.8;
      g.beginPath();
      for (let u = u0 + 1.5; u < u1; u += 1.8) {
        const a = P(u, v0, 3), b = P(u, v1, 3);
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      for (let v = v0 + 1.5; v < v1; v += 1.8) {
        const a = P(u0, v, 3), b = P(u1, v, 3);
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.stroke();
    }

    if (blk.kind === 'hotel') {
      const W = Math.max(roomSpec.width || 12, 64);
      const H = Math.max(roomSpec.height || 9, 48);
      fillPoly(
        g,
        [P(0.2, 0.2, 3), P(W - 0.2, 0.2, 3), P(W - 0.2, H - 0.2, 3), P(0.2, H - 0.2, 3)],
        lerpColor('#443e52', '#cfc6b8', day),
      );
      const midU = W * 0.5;
      fillPoly(
        g,
        [P(midU - 0.9, H - 0.5, 3.2), P(midU + 0.9, H - 0.5, 3.2), P(midU + 0.9, v1, 3.2), P(midU - 0.9, v1, 3.2)],
        lerpColor('#5c2434', '#b83b4e', day),
      );
    }
  }

  // Pass 5b: Draw each block's buildings/plazas and front-sidewalk trees/lamps in topological block order
  for (const blk of layout.blocks) {
    const { haze } = blk;
    const paveTop = lerpColor(basePaveTop, hazeColor, haze);
    const paveLeft = lerpColor(basePaveLeft, hazeColor, haze);
    const paveRight = lerpColor(basePaveRight, hazeColor, haze);

    for (const b of blk.buildings) {
      if (b.isPlaza) {
        const lawnTop = lerpColor(lerpColor('#1d3b2a', '#4ea25c', day), hazeColor, haze);
        const lawnLeft = shadeColor(lawnTop, -0.14);
        const lawnRight = shadeColor(lawnTop, -0.26);
        drawIsoPrism(g, P, b.u0 + 0.2, b.v0 + 0.2, b.u1 - 0.2, b.v1 - 0.2, 3, 5, lawnLeft, lawnRight, lawnTop);
        const cu = (b.u0 + b.u1) / 2;
        const cv = (b.v0 + b.v1) / 2;
        drawIsoPrism(g, P, cu - 0.85, cv - 0.85, cu + 0.85, cv + 0.85, 5, 9, paveLeft, paveRight, paveTop);
        const waterCol = lerpColor('#246a88', '#48c6e8', day);
        fillPoly(g, [P(cu - 0.65, cv - 0.65, 9.2), P(cu + 0.65, cv - 0.65, 9.2), P(cu + 0.65, cv + 0.65, 9.2), P(cu - 0.65, cv + 0.65, 9.2)], waterCol);
        continue;
      }

      const leftCol = lerpColor(lerpColor('#252a48', b.leftCol, day), hazeColor, haze);
      const rightCol = lerpColor(lerpColor('#191d36', b.rightCol, day), hazeColor, haze);
      const roofCol = lerpColor(lerpColor('#32385c', b.roofCol, day), hazeColor, haze);
      const zTop = 3 + b.heightZ;

      drawIsoPrism(g, P, b.u0, b.v0, b.u1, b.v1, 3, zTop, leftCol, rightCol, roofCol);

      const deckCol = shadeColor(roofCol, -0.15);
      fillPoly(
        g,
        [P(b.u0 + 0.26, b.v0 + 0.26, zTop), P(b.u1 - 0.26, b.v0 + 0.26, zTop), P(b.u1 - 0.26, b.v1 - 0.26, zTop), P(b.u0 + 0.26, b.v1 - 0.26, zTop)],
        deckCol,
      );

      for (const w of b.windowsLeft) {
        const wCol = w.lit
          ? lerpColor(w.tone === 'cyan' ? '#92e8ff' : '#ffd878', hazeColor, haze * 0.45)
          : lerpColor(dayWinLeft, hazeColor, haze);
        fillPoly(g, [P(w.u0, w.v, w.z1), P(w.u1, w.v, w.z1), P(w.u1, w.v, w.z0), P(w.u0, w.v, w.z0)], wCol);
      }
      for (const w of b.windowsRight) {
        const wCol = w.lit
          ? lerpColor(w.tone === 'cyan' ? '#7ad0ee' : '#f0bc5e', hazeColor, haze * 0.45)
          : lerpColor(dayWinRight, hazeColor, haze);
        fillPoly(g, [P(w.u, w.v0, w.z1), P(w.u, w.v1, w.z1), P(w.u, w.v1, w.z0), P(w.u, w.v0, w.z0)], wCol);
      }

      const mu = (b.u0 + b.u1) / 2;
      const mv = (b.v0 + b.v1) / 2;
      if (b.roofStyle === 0) {
        drawIsoPrism(g, P, b.u0 + 0.65, b.v0 + 0.65, b.u1 - 0.65, b.v1 - 0.65, zTop, zTop + 16, shadeColor(leftCol, 0.06), shadeColor(rightCol, 0.06), shadeColor(roofCol, 0.08));
        if (b.stories >= 6) {
          const spBase = P(mu, mv, zTop + 16);
          const spTop = P(mu, mv, zTop + 32);
          g.strokeStyle = rightCol;
          g.lineWidth = 1.8;
          g.beginPath();
          g.moveTo(spBase[0], spBase[1]);
          g.lineTo(spTop[0], spTop[1]);
          g.stroke();
        }
      } else if (b.roofStyle === 1) {
        drawIsoPrism(g, P, mu - 0.7, mv - 0.6, mu - 0.1, mv + 0.1, zTop, zTop + 8, leftCol, rightCol, shadeColor(roofCol, 0.1));
        const skyGlass = day > 0.6 ? '#88c6ee' : '#ffd884';
        fillPoly(g, [P(mu + 0.1, mv - 0.5, zTop + 1), P(mu + 0.75, mv - 0.5, zTop + 1), P(mu + 0.75, mv + 0.4, zTop + 1), P(mu + 0.1, mv + 0.4, zTop + 1)], lerpColor(skyGlass, hazeColor, haze * 0.5));
      } else if (b.roofStyle === 2) {
        const hedgeTop = lerpColor(lerpColor('#1e4430', '#489858', day), hazeColor, haze);
        drawIsoPrism(g, P, b.u0 + 0.45, b.v0 + 0.45, b.u1 - 0.45, b.v1 - 0.45, zTop, zTop + 5, shadeColor(hedgeTop, -0.15), shadeColor(hedgeTop, -0.28), hedgeTop);
      } else {
        // Art-deco setback: two diminishing ziggurat tiers topped with a thin spire,
        // giving the default skyline the NYC Manhattan silhouette asked for.
        drawIsoPrism(g, P, b.u0 + 0.35, b.v0 + 0.35, b.u1 - 0.35, b.v1 - 0.35, zTop, zTop + 10, shadeColor(leftCol, 0.05), shadeColor(rightCol, 0.05), shadeColor(roofCol, 0.06));
        drawIsoPrism(g, P, mu - (b.u1 - b.u0) * 0.22, mv - (b.v1 - b.v0) * 0.22, mu + (b.u1 - b.u0) * 0.22, mv + (b.v1 - b.v0) * 0.22, zTop + 10, zTop + 20, shadeColor(leftCol, 0.1), shadeColor(rightCol, 0.1), shadeColor(roofCol, 0.12));
        if (b.stories >= 6) {
          const spBase = P(mu, mv, zTop + 20);
          const spTop = P(mu, mv, zTop + 34);
          g.strokeStyle = rightCol;
          g.lineWidth = 1.8;
          g.beginPath();
          g.moveTo(spBase[0], spBase[1]);
          g.lineTo(spTop[0], spTop[1]);
          g.stroke();
        }
      }

      if (b.waterTower) {
        // Small wooden rooftop water tower — a classic NYC skyline touch.
        const wtu = b.u0 + (b.u1 - b.u0) * 0.78;
        const wtv = b.v0 + (b.v1 - b.v0) * 0.24;
        const legCol = lerpColor('#5a4430', hazeColor, haze);
        const tankCol = lerpColor('#8a6a44', hazeColor, haze);
        const roofColWt = lerpColor('#6e5636', hazeColor, haze);
        drawIsoPrism(g, P, wtu - 0.18, wtv - 0.18, wtu + 0.18, wtv + 0.18, zTop, zTop + 7, shadeColor(legCol, -0.1), shadeColor(legCol, -0.22), legCol);
        drawIsoPrism(g, P, wtu - 0.26, wtv - 0.26, wtu + 0.26, wtv + 0.26, zTop + 7, zTop + 16, shadeColor(tankCol, -0.08), shadeColor(tankCol, -0.2), tankCol);
        const roofTop = P(wtu, wtv, zTop + 21);
        const r0 = P(wtu - 0.3, wtv - 0.3, zTop + 16);
        const r1 = P(wtu + 0.3, wtv - 0.3, zTop + 16);
        const r2 = P(wtu + 0.3, wtv + 0.3, zTop + 16);
        const r3 = P(wtu - 0.3, wtv + 0.3, zTop + 16);
        fillPoly(g, [r0, r1, roofTop], shadeColor(roofColWt, 0.05));
        fillPoly(g, [r1, r2, roofTop], shadeColor(roofColWt, -0.1));
        fillPoly(g, [r2, r3, roofTop], shadeColor(roofColWt, -0.2));
        fillPoly(g, [r3, r0, roofTop], shadeColor(roofColWt, -0.05));
      }
    }

    const treeTop = lerpColor(lerpColor('#224830', '#54ac60', day), hazeColor, haze);
    const treeLeft = shadeColor(treeTop, -0.14);
    const treeRight = shadeColor(treeTop, -0.28);
    const trunkCol = lerpColor('#4e3624', hazeColor, haze);
    for (const tr of blk.trees) {
      const base = P(tr.u, tr.v, 3);
      if (base[1] < horizonY + 4 || base[1] > by1 + 20) continue;
      g.fillStyle = 'rgba(18, 12, 28, 0.22)';
      g.beginPath();
      g.ellipse(base[0], base[1], 7, 3.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = trunkCol;
      g.fillRect(Math.round(base[0] - 1.5), Math.round(base[1] - 9), 3, 9);
      drawIsoPrism(g, P, tr.u - 0.24, tr.v - 0.24, tr.u + 0.24, tr.v + 0.24, 9, 19, treeLeft, treeRight, treeTop);
    }

    const poleCol = lerpColor('#2c2a3a', hazeColor, haze);
    for (const lp of blk.lamps) {
      const base = P(lp.u, lp.v, 3);
      if (base[1] < horizonY + 4 || base[1] > by1 + 20) continue;
      if (day < 0.72) {
        g.fillStyle = `rgba(255, 214, 120, ${(0.22 * (1 - haze)).toFixed(2)})`;
        g.beginPath();
        g.ellipse(base[0], base[1], 16, 8, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = poleCol;
      g.fillRect(Math.round(base[0] - 1), Math.round(base[1] - 18), 2, 18);
      g.fillStyle = day < 0.72 ? '#ffe492' : '#d8dce8';
      g.beginPath();
      g.arc(base[0], base[1] - 19, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  } // end isBuildings

  return layout.beacons;
}

// ---------- Hotel Tower Cut-Away Architecture (Cached Static Layer) ----------

function drawTowerCutawayUnderCached(ctx, room, originX, originY, width, height, phase, dpr = 1) {
  const phaseBucket = Math.round(phase * 48) % 48;
  const key = `cutaway:${room.id}:${width}x${height}@${dpr}:p${phaseBucket}`;
  if (cutawayCache.key !== key) {
    const off = cutawayCache.canvas || document.createElement('canvas');
    off.width = Math.max(1, Math.round(width * dpr));
    off.height = Math.max(1, Math.round(height * dpr));
    const g = off.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    drawTowerCutawayUnder(g, room, originX, originY, height, phaseBucket / 48);
    cutawayCache = { key, canvas: off };
  }
  blitDeviceAligned(ctx, cutawayCache.canvas, 0, 0, dpr);
}

function drawTowerCutawayUnder(ctx, room, originX, originY, height, phase) {
  const { day } = dayNightColors(phase);
  const last = { x: room.width - 1, y: room.height - 1 };
  const isFloorTile = (tx, ty) => (
    tx >= 1 && ty >= 1 && tx < room.width && ty < room.height && room.grid[ty][tx] !== TILE.VOID
  );
  let maxWestY = last.y;
  while (maxWestY > 1 && !isFloorTile(1, maxWestY)) maxWestY--;
  let maxEastX = last.x;
  while (maxEastX > 1 && !isFloorTile(maxEastX, 1)) maxEastX--;

  const P = (x, y, dx = 0, dy = 0) => {
    const t = tileToScreen(x, y, originX, originY);
    return [t.sx + dx, t.sy + dy];
  };
  const northPt = P(1, 1, 0, -TILE_H / 2);
  const eastPt = P(maxEastX, 1, TILE_W / 2, 0);
  const southPt = P(last.x, last.y, 0, TILE_H / 2);
  const westPt = P(1, maxWestY, -TILE_W / 2, 0);

  const facadeLeft = lerpColor('#2d2942', '#7c748e', day);
  const facadeRight = lerpColor('#1f1c30', '#585268', day);
  const colLeft = shadeColor(facadeLeft, 0.14);
  const colRight = shadeColor(facadeRight, 0.12);
  const storyH = STORY_H;
  const floorNo = (room.floor === 'R' || room.floor === 42 || room.floor === '42') ? 42 : (Number(room.floor) || 1);
  const groundDy = computeGroundDy(floorNo);
  const gL = (pt) => pt[1] + groundDy;

  // Outer left & right structural corner columns
  const colTopOffset = room.isRooftop ? 0 : WALL_H;
  fillPoly(ctx, [
    [westPt[0] - 8, westPt[1] - colTopOffset],
    [westPt[0], westPt[1] - colTopOffset],
    [westPt[0], gL(westPt)],
    [westPt[0] - 8, gL(westPt)],
  ], colLeft);
  fillPoly(ctx, [
    [eastPt[0], eastPt[1] - colTopOffset],
    [eastPt[0] + 8, eastPt[1] - colTopOffset],
    [eastPt[0] + 8, gL(eastPt)],
    [eastPt[0], gL(eastPt)],
  ], colRight);

  // Cut-away Upper Story hint above the back walls (only for non-rooftop floors)
  if (!room.isRooftop) {
    const UPPER_H = 44;
    const nwUp = [northPt[0], northPt[1] - WALL_H];
    const wUp = [westPt[0], westPt[1] - WALL_H];
    const eUp = [eastPt[0], eastPt[1] - WALL_H];
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

  // Silhouette-accurate lower tower shaft, neighbouring floor windows, and concrete slab per non-VOID boundary tile
  const underSlabCol = shadeColor(floorBaseColor(room), -0.25);
  const storiesBelow = storiesBelowFloor(floorNo);
  for (let y = 1; y < room.height; y++) {
    for (let x = 1; x < room.width; x++) {
      if (!isFloorTile(x, y)) continue;
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      const nPt = [sx, sy - TILE_H / 2];
      const ePt = [sx + TILE_W / 2, sy];
      const sPt = [sx, sy + TILE_H / 2];
      const wPt = [sx - TILE_W / 2, sy];
      fillPoly(ctx, [nPt, ePt, sPt, wPt], underSlabCol);

      // Left-facing exterior boundary (+y edge where y+1 is void or outside room)
      if (!isFloorTile(x, y + 1)) {
        fillPoly(ctx, [wPt, sPt, [sPt[0], gL(sPt)], [wPt[0], gL(wPt)]], facadeLeft);
        for (let story = 0; story < storiesBelow; story++) {
          const dy0 = SLAB_H + 8 + story * storyH;
          if (dy0 + 26 > groundDy) break;
          const x0 = wPt[0] + (sPt[0] - wPt[0]) * 0.2;
          const y0 = wPt[1] + (sPt[1] - wPt[1]) * 0.2 + dy0;
          const x1 = wPt[0] + (sPt[0] - wPt[0]) * 0.8;
          const y1 = wPt[1] + (sPt[1] - wPt[1]) * 0.8 + dy0;
          const isLit = ((x * 7 + story * 13 + floorNo) % 5) !== 0;
          const winCol = day > 0.65 ? (isLit ? '#9ad0f4' : '#4a6484') : (isLit ? '#ffd884' : '#242238');
          fillPoly(ctx, [[x0, y0], [x1, y1], [x1, y1 + 26], [x0, y0 + 26]], winCol);
          // fine mullion bar splitting the pane, only resolvable at native bake density
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo((x0 + x1) / 2, (y0 + y1) / 2); ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2 + 26); ctx.stroke();
        }
        fillPoly(ctx, [wPt, sPt, [sPt[0], sPt[1] + SLAB_H], [wPt[0], wPt[1] + SLAB_H]], '#787486');
        ctx.fillStyle = '#3a3646';
        ctx.fillRect(Math.round((wPt[0] + sPt[0]) / 2 - 2), Math.round((wPt[1] + sPt[1]) / 2 + 4), 4, 8);
      }

      // Right-facing exterior boundary (+x edge where x+1 is void or outside room)
      if (!isFloorTile(x + 1, y)) {
        fillPoly(ctx, [sPt, ePt, [ePt[0], gL(ePt)], [sPt[0], gL(sPt)]], facadeRight);
        for (let story = 0; story < storiesBelow; story++) {
          const dy0 = SLAB_H + 8 + story * storyH;
          if (dy0 + 26 > groundDy) break;
          const x0 = sPt[0] + (ePt[0] - sPt[0]) * 0.2;
          const y0 = sPt[1] + (ePt[1] - sPt[1]) * 0.2 + dy0;
          const x1 = sPt[0] + (ePt[0] - sPt[0]) * 0.8;
          const y1 = sPt[1] + (ePt[1] - sPt[1]) * 0.8 + dy0;
          const isLit = ((y * 11 + story * 5 + floorNo) % 4) !== 0;
          const winCol = day > 0.65 ? (isLit ? '#78b0d8' : '#384e68') : (isLit ? '#f0be68' : '#1b182c');
          fillPoly(ctx, [[x0, y0], [x1, y1], [x1, y1 + 26], [x0, y0 + 26]], winCol);
          // fine mullion bar splitting the pane, only resolvable at native bake density
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo((x0 + x1) / 2, (y0 + y1) / 2); ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2 + 26); ctx.stroke();
        }
        if (room.isRooftop && x >= 15 && y >= 3 && y <= 8) {
          // Shimmering infinity pool overflow weir & cascading waterfall sheen
          fillPoly(ctx, [sPt, ePt, [ePt[0], ePt[1] + 24], [sPt[0], sPt[1] + 24]], 'rgba(72, 212, 240, 0.72)');
          fillPoly(ctx, [sPt, ePt, [ePt[0], ePt[1] + 8], [sPt[0], sPt[1] + 8]], 'rgba(210, 248, 255, 0.88)');
          ctx.strokeStyle = '#cff8ff';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(sPt[0], sPt[1]);
          ctx.lineTo(ePt[0], ePt[1]);
          ctx.stroke();
        } else {
          fillPoly(ctx, [sPt, ePt, [ePt[0], ePt[1] + SLAB_H], [sPt[0], sPt[1] + SLAB_H]], '#565264');
          ctx.fillStyle = '#2a2636';
          ctx.fillRect(Math.round((sPt[0] + ePt[0]) / 2 - 2), Math.round((sPt[1] + ePt[1]) / 2 + 4), 4, 8);
        }
      }
    }
  }
}

// drawTowerCutawayOver only depends on room geometry/origin (no day-night or
// animation state), so — like drawTowerCutawayUnderCached — it is safe to
// bake once per room/zoom/origin and blit thereafter instead of re-walking
// every polygon every frame.
function drawTowerCutawayOverCached(ctx, room, originX, originY, width, height, dpr = 1) {
  const key = `cutawayOver:${room.id}:${width}x${height}@${dpr}:${originX},${originY}`;
  if (cutawayOverCache.key !== key) {
    const off = cutawayOverCache.canvas || document.createElement('canvas');
    off.width = Math.max(1, Math.round(width * dpr));
    off.height = Math.max(1, Math.round(height * dpr));
    const g = off.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    drawTowerCutawayOver(g, room, originX, originY);
    cutawayOverCache = { key, canvas: off };
  }
  blitDeviceAligned(ctx, cutawayOverCache.canvas, 0, 0, dpr);
}

function drawTowerCutawayOver(ctx, room, originX, originY) {
  if (room.isRooftop) {
    // Rooftop housing block standing structure: flat top roof slab, stone parapet coping, and side return wall
    const hx0 = 4;
    const hx1 = 14;
    // Front top and ground corners along north wall
    const t4 = tileToScreen(hx0, 1, originX, originY);
    const nwTop = [t4.sx - TILE_W / 2, t4.sy - WALL_ANCHOR_Y - 16];
    const t14 = tileToScreen(hx1, 1, originX, originY);
    const neTop = [t14.sx + TILE_W / 2, t14.sy - WALL_ANCHOR_Y + 16];
    const neGround = [t14.sx + TILE_W / 2, t14.sy];
    // Return side wall going back 1 tile (dx = -TILE_W / 2, dy = -TILE_H / 2)
    const brTop = [neTop[0] - TILE_W / 2, neTop[1] - TILE_H / 2];
    const brGround = [neGround[0] - TILE_W / 2, neGround[1] - TILE_H / 2];
    const blTop = [nwTop[0] - TILE_W / 2, nwTop[1] - TILE_H / 2];

    // 1. Right return wall facing south-east (towards pool deck)
    const sideCol = shadeColor(room.wallColor, -0.22);
    fillPoly(ctx, [neTop, brTop, brGround, neGround], sideCol);

    // Window on the side return wall
    const winW = 12;
    const wTop0 = [neTop[0] - 8, neTop[1] - 4 + 14];
    const wTop1 = [wTop0[0] - winW, wTop0[1] - winW / 2];
    fillPoly(ctx, [
      wTop0,
      wTop1,
      [wTop1[0], wTop1[1] + 24],
      [wTop0[0], wTop0[1] + 24],
    ], '#384e68');
    // fine mullion cross splitting the window pane, only resolvable at native bake density
    const wMid = [(wTop0[0] + wTop1[0]) / 2, (wTop0[1] + wTop1[1]) / 2];
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wMid[0], wMid[1]); ctx.lineTo(wMid[0], wMid[1] + 24); ctx.stroke();

    // 2. Flat top roof slab of the housing block
    fillPoly(ctx, [nwTop, blTop, brTop, neTop], '#5e5a6c');

    // 3. Parapet stone coping along the top edges
    const COP_H = 4;
    fillPoly(ctx, [
      [nwTop[0], nwTop[1] - COP_H],
      [neTop[0], neTop[1] - COP_H],
      neTop,
      nwTop,
    ], '#d0d4e0');
    fillPoly(ctx, [
      [neTop[0], neTop[1] - COP_H],
      [brTop[0], brTop[1] - COP_H],
      brTop,
      neTop,
    ], '#a0a6b8');
    // individual coping-stone seam ticks, only resolvable at native bake density
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let t = 0.1; t < 1; t += 0.14) {
      const a = [nwTop[0] + (neTop[0] - nwTop[0]) * t, nwTop[1] + (neTop[1] - nwTop[1]) * t];
      ctx.beginPath(); ctx.moveTo(a[0], a[1] - COP_H); ctx.lineTo(a[0], a[1]); ctx.stroke();
    }
    return;
  }
  const last = { x: room.width - 1, y: room.height - 1 };
  const isFloorTile = (tx, ty) => (
    tx >= 1 && ty >= 1 && tx < room.width && ty < room.height && room.grid[ty][tx] !== TILE.VOID
  );
  let maxWestY = last.y;
  while (maxWestY > 1 && !isFloorTile(1, maxWestY)) maxWestY--;
  let maxEastX = last.x;
  while (maxEastX > 1 && !isFloorTile(maxEastX, 1)) maxEastX--;

  const P = (x, y, dx = 0, dy = 0) => {
    const t = tileToScreen(x, y, originX, originY);
    return [t.sx + dx, t.sy + dy];
  };
  const northPt = P(1, 1, 0, -TILE_H / 2);
  const eastPt = P(maxEastX, 1, TILE_W / 2, 0);
  const westPt = P(1, maxWestY, -TILE_W / 2, 0);

  const nwUp = [northPt[0], northPt[1] - WALL_H];
  const wUp = [westPt[0], westPt[1] - WALL_H];
  const eUp = [eastPt[0], eastPt[1] - WALL_H];

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

function drawCharacter(ctx, e, screenX, screenY, dpr = 1, room = null) {
  const isSwimsuit = e.outfit === 'swimsuit' || e.isWearingSwimsuit || (e.action === 'swim');
  let baseLook = LOOKS[e.spriteKey] || { ...LOOKS.player, shirt: e.color || LOOKS.player.shirt };
  if (e.look) {
    baseLook = { ...baseLook, ...e.look };
    if (e.look.hairColor) baseLook.hair = e.look.hairColor;
  }
  const look = isSwimsuit
    ? { ...baseLook, outfit: 'swimsuit', bareArms: true, shirt: '#00b4d8', pants: '#0077b6' }
    : baseLook;
  const stride = e.walking ? (e.frame % 2 ? 1 : -1) : 0;
  const pose = {
    stride,
    sit: !!e.sitting,
    lie: !!e.lying || e.action === 'lie' || e.action === 'spa_massage',
    blink: !!e.blink,
    breathe: e.breathe || 0,
    action: e.action || null,
    actionFrame: e.actionFrame || 0,
    emote: e.emote || null,
    emoteFrame: e.emoteFrame || 0,
  };
  const key = `${e.spriteKey}:${e.color}:${isSwimsuit ? 'swim' : 'norm'}:${e.look ? JSON.stringify(e.look) : ''}:${e.emote || ''}:${Math.floor((e.emoteFrame || 0) * 2) % 12}`;
  const { canvas, ox, oy, cssH } = getCharacterCanvas(key, look, e.dir, pose, dpr);

  // Faint mirrored reflection of avatar in the gym mirror wall
  if (room?.id === 'gym' && e.y <= 3.4 && e.x >= 2 && e.x <= 12) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.translate(screenX, screenY - 26);
    ctx.scale(-0.85, 0.85);
    blitDeviceAligned(ctx, canvas, -ox, -oy, dpr);
    ctx.restore();
  }

  // Treadmill belt motion lines beneath runner's feet
  if (e.action === 'treadmill') {
    ctx.save();
    ctx.strokeStyle = 'rgba(88, 226, 255, 0.72)';
    ctx.lineWidth = 2;
    const shift = (e.actionFrame || 0) * 3;
    for (let i = -1; i <= 1; i++) {
      const bx = screenX + i * 7 - 4 + (shift % 6);
      const by = screenY + 2 + i * 3;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by - 2.5);
      ctx.lineTo(bx + 5, by + 2.5);
      ctx.stroke();
    }
    ctx.restore();
  } else if (!e.sitting && !pose.lie && e.action !== 'swim') {
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

  // 4-Layer Swimming Waterline Mask, Wake Ripples & Splash Droplets
  if (e.action === 'swim') {
    ctx.save();
    // Layer 2: Translucent turquoise waterline collar masking submerged waist seam
    ctx.fillStyle = 'rgba(42, 188, 212, 0.58)';
    ctx.beginPath();
    ctx.ellipse(screenX, screenY - 2, 20, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Layer 3: Animated concentric white foam wake rings
    const ringPhase = (e.actionFrame || 0) % 4;
    ctx.strokeStyle = 'rgba(220, 252, 255, 0.88)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(screenX, screenY - 2, 14 + ringPhase * 2.5, 6.5 + ringPhase * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(140, 238, 252, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(screenX, screenY - 2, 21 + ((ringPhase + 2) % 4) * 2, 9.5 + ((ringPhase + 2) % 4) * 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Layer 4: Splash droplets kicked up by alternating swim strokes
    ctx.fillStyle = '#e8fcff';
    const splashSide = (ringPhase % 2 === 0) ? -1 : 1;
    for (const [sxOff, syOff, r] of [[splashSide * 15, -10, 2.2], [splashSide * 19, -6, 1.6], [-splashSide * 13, -7, 1.5]]) {
      ctx.beginPath();
      ctx.arc(screenX + sxOff, screenY + syOff, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (e.action === 'treadmill') {
    // Athletic effort / sweat droplets near temple while running
    ctx.save();
    const dropShift = ((e.actionFrame || 0) % 2) * 3;
    ctx.fillStyle = '#7ce8ff';
    ctx.beginPath();
    ctx.arc(screenX + 16, dy + 14 + dropShift, 2.2, 0, Math.PI * 2);
    ctx.arc(screenX - 16, dy + 17 - dropShift, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (e.action === 'eat') {
    // Rising warm culinary aroma / sip sparkle near character
    ctx.save();
    const wisp = ((e.actionFrame || 0) % 2) * 2.5;
    ctx.strokeStyle = 'rgba(255, 236, 180, 0.82)';
    ctx.lineWidth = 1.6;
    for (const wx of [screenX - 11, screenX + 11]) {
      ctx.beginPath();
      ctx.moveTo(wx, dy + 22 - wisp);
      ctx.quadraticCurveTo(wx + 3, dy + 17 - wisp, wx, dy + 12 - wisp);
      ctx.stroke();
    }
    ctx.restore();
  }

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

function furnitureCanvas(itemId, rot = 0, dpr = 1, off = false) {
  const r = ((rot % 4) + 4) % 4;
  const key = `furn:${itemId}:${r}`;
  const builder = FURNITURE_BUILDERS[toSpriteKey(itemId)];
  const canvas = bakeSprite(key, () => (builder ? builder(r) : FURNITURE_BUILDERS.stool(r)), dpr);
  if (!off) return canvas;
  // A toggled-off lamp/light item renders its normal sprite darkened, so it visibly
  // reads as "off" without needing a second hand-authored sprite per light fixture.
  const scale = Math.max(1, dpr);
  const offCacheKey = `${key}:off@${scale}`;
  if (canvasCache.has(offCacheKey)) return canvasCache.get(offCacheKey);
  const dimmed = document.createElement('canvas');
  dimmed.width = canvas.width;
  dimmed.height = canvas.height;
  const g = dimmed.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(14, 12, 24, 0.6)';
  g.fillRect(0, 0, dimmed.width, dimmed.height);
  dimmed.ax = canvas.ax;
  dimmed.ay = canvas.ay;
  dimmed.scale = canvas.scale;
  canvasCache.set(offCacheKey, dimmed);
  return dimmed;
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

function drawFurniture(ctx, f, originX, originY, dpr = 1, off = false) {
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

  const canvas = furnitureCanvas(f.itemId, f.rot, dpr, off);
  blitDeviceAligned(ctx, canvas, sx - canvas.ax, sy - canvas.ay, dpr);
}

// Continuous low glass railing along the south/east floor edges of outdoor
// decks (Rooftop, Sky Garden) — the north/west edges already get the taller
// buildGlassBalustradeSegment wall treatment in drawWallsLayerCached.
function drawEdgeRail(ctx, edge, x, y, originX, originY, dpr) {
  const { sx, sy } = tileToScreen(x, y, originX, originY);
  const canvas = bakeSprite(`edgerail:${edge}`, () => buildEdgeRailSegment(edge), dpr);
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

export const entityScreenBounds = new Map();

export function hitTestNpc(screenX, screenY) {
  for (const b of entityScreenBounds.values()) {
    if (screenX >= b.x0 && screenX <= b.x1 && screenY >= b.y0 && screenY <= b.y1) {
      return b.entity;
    }
  }
  return null;
}

const itemIconCache = new Map();

export function renderItemIcon(itemId, size = 52, dpr = 1, makeCanvas = null) {
  const cacheKey = `${itemId}:${size}@${dpr}`;
  if (itemIconCache.has(cacheKey)) return itemIconCache.get(cacheKey);

  const targetW = Math.max(1, Math.round(size * dpr));
  const targetH = Math.max(1, Math.round(size * dpr));
  const canvas = makeCanvas
    ? makeCanvas(targetW, targetH)
    : (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (!canvas) return null;
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  try {
    const fCanvas = furnitureCanvas(itemId, 0, dpr);
    if (fCanvas && fCanvas.width > 0 && fCanvas.height > 0) {
      const pad = Math.round(3 * dpr);
      const availW = targetW - pad * 2;
      const availH = targetH - pad * 2;
      const scale = Math.min(availW / fCanvas.width, availH / fCanvas.height, 1.25);
      const dw = Math.round(fCanvas.width * scale);
      const dh = Math.round(fCanvas.height * scale);
      const dx = Math.round((targetW - dw) / 2);
      const dy = Math.round((targetH - dh) / 2);
      ctx.drawImage(fCanvas, dx, dy, dw, dh);
      itemIconCache.set(cacheKey, canvas);
      return canvas;
    }
  } catch (err) {
    // fallback below
  }

  const item = getCatalogueItem(itemId);
  const color = item?.color || '#ffd27a';
  const midX = targetW / 2;
  const midY = targetH / 2;
  const s = Math.round(14 * dpr);
  fillPoly(ctx, [[midX, midY - s], [midX + s, midY - s / 2], [midX, midY], [midX - s, midY - s / 2]], color);
  fillPoly(ctx, [[midX - s, midY - s / 2], [midX, midY], [midX, midY + s], [midX - s, midY + s / 2]], shadeColor(color, -0.15));
  fillPoly(ctx, [[midX, midY], [midX + s, midY - s / 2], [midX + s, midY + s / 2], [midX, midY + s]], shadeColor(color, -0.3));
  // fine top-edge highlight, only resolvable at native bake density
  ctx.strokeStyle = shadeColor(color, 0.3);
  ctx.lineWidth = Math.max(0.6, 0.5 * dpr);
  ctx.beginPath(); ctx.moveTo(midX - s, midY - s / 2); ctx.lineTo(midX, midY - s); ctx.lineTo(midX + s, midY - s / 2); ctx.stroke();

  itemIconCache.set(cacheKey, canvas);
  return canvas;
}

export function getItemIconDataUrl(itemId, size = 52, dpr = 1) {
  const canvas = renderItemIcon(itemId, size, dpr);
  return canvas?.toDataURL ? canvas.toDataURL() : '';
}

function drawPoolWaterLayer(ctx, poolItems, originX, originY, ds, now) {
  const key = `${poolItems.length}:${originX},${originY}:${ds}`;
  if (poolWaterLayerCache.key !== key) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const sprites = [];
    for (const f of poolItems) {
      const anchorX = f.x + f.footprint.w / 2 - 0.5;
      const anchorY = f.y + f.footprint.h / 2 - 0.5;
      const { sx, sy } = tileToScreen(anchorX, anchorY, originX, originY);
      const canvas = furnitureCanvas(f.itemId, f.rot, ds, false);
      const x0 = sx - canvas.ax;
      const y0 = sy - canvas.ay;
      const x1 = x0 + canvas.width / ds;
      const y1 = y0 + canvas.height / ds;
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
      sprites.push({ canvas, x0, y0 });
    }
    const w = Math.ceil(maxX - minX);
    const h = Math.ceil(maxY - minY);
    const off = poolWaterLayerCache.canvas || document.createElement('canvas');
    off.width = Math.max(1, Math.round(w * ds));
    off.height = Math.max(1, Math.round(h * ds));
    const g = off.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, off.width, off.height);
    g.imageSmoothingEnabled = false;
    for (const s of sprites) {
      const dx = Math.round((s.x0 - minX) * ds);
      const dy = Math.round((s.y0 - minY) * ds);
      g.drawImage(s.canvas, dx, dy);
    }
    poolWaterLayerCache = { key, canvas: off, minX, minY, maxX, maxY };
  }
  blitDeviceAligned(ctx, poolWaterLayerCache.canvas, poolWaterLayerCache.minX, poolWaterLayerCache.minY, ds);

  // Cheap animated caustics shimmer overlay across the cached pool surface
  const phase = (now % 3000) / 3000;
  const cx = (poolWaterLayerCache.minX + poolWaterLayerCache.maxX) / 2;
  const cy = poolWaterLayerCache.minY + phase * (poolWaterLayerCache.maxY - poolWaterLayerCache.minY);
  ctx.save();
  ctx.fillStyle = 'rgba(215, 250, 255, 0.07)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, (poolWaterLayerCache.maxX - poolWaterLayerCache.minX) * 0.35, 12, -0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getRoomLightMap(room, placedFurniture, originX, originY, lightsOn, ds) {
  const placedKey = placedFurniture.map((f) => `${f.itemId}@${f.x},${f.y}`).join(';');
  const key = `${room.id}:${originX},${originY}:${lightsOn}:${ds}:${placedKey}`;
  if (lightMapCache.key === key) return lightMapCache;

  const emissives = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const f of placedFurniture) {
    const item = getCatalogueItem(f.itemId);
    if (!item?.emissive) continue;
    if (item.lightSource && !lightsOn) continue;
    const ax = f.x + f.footprint.w / 2 - 0.5;
    const ay = f.y + f.footprint.h / 2 - 0.5;
    const { sx, sy } = tileToScreen(ax, ay, originX, originY);
    const rad = item.emissive.radius || 56;
    const rgb = hexToRgb(item.emissive.color || '#ffd27a');
    const intensity = item.emissive.intensity || 0.36;
    minX = Math.min(minX, sx - rad);
    minY = Math.min(minY, sy - 10 - rad);
    maxX = Math.max(maxX, sx + rad);
    maxY = Math.max(maxY, sy + 4 + rad);
    emissives.push({ sx, sy, rad, rgb, intensity });
  }

  if (emissives.length === 0) {
    lightMapCache = { key, canvas: null, minX: 0, minY: 0 };
    return lightMapCache;
  }

  const pad = 8;
  minX = Math.floor(minX - pad);
  minY = Math.floor(minY - pad);
  maxX = Math.ceil(maxX + pad);
  maxY = Math.ceil(maxY + pad);
  const w = maxX - minX;
  const h = maxY - minY;

  const off = lightMapCache.canvas && lightMapCache.canvas.width === Math.round(w * ds) && lightMapCache.canvas.height === Math.round(h * ds)
    ? lightMapCache.canvas
    : document.createElement('canvas');
  off.width = Math.max(1, Math.round(w * ds));
  off.height = Math.max(1, Math.round(h * ds));
  const g = off.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, off.width, off.height);
  g.setTransform(ds, 0, 0, ds, -minX * ds, -minY * ds);
  g.globalCompositeOperation = 'screen';

  for (const e of emissives) {
    const glow = g.createRadialGradient(e.sx, e.sy - 10, 4, e.sx, e.sy - 4, e.rad);
    glow.addColorStop(0, `rgba(${e.rgb.r}, ${e.rgb.g}, ${e.rgb.b}, ${e.intensity})`);
    glow.addColorStop(0.55, `rgba(${e.rgb.r}, ${e.rgb.g}, ${e.rgb.b}, ${(e.intensity * 0.38).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${e.rgb.r}, ${e.rgb.g}, ${e.rgb.b}, 0)`);
    g.fillStyle = glow;
    g.beginPath();
    g.arc(e.sx, e.sy - 6, e.rad, 0, Math.PI * 2);
    g.fill();
  }

  lightMapCache = { key, canvas: off, minX, minY };
  return lightMapCache;
}

function drawFloorLayerCached(ctx, room, originX, originY, floorColor, lightsTag, ds, doorMap) {
  const zt = room.zoneTiles;
  const key = `${room.id}:${originX},${originY}:${floorColor}:${lightsTag}:${ds}`;
  if (floorLayerCache.key !== key) {
    const minX = Math.floor(originX - (room.height - 1) * (TILE_W / 2) - TILE_W / 2 - 4);
    const maxX = Math.ceil(originX + (room.width - 1) * (TILE_W / 2) + TILE_W / 2 + 4);
    const minY = Math.floor(originY - TILE_H / 2 - 4);
    const maxY = Math.ceil(originY + (room.width + room.height - 2) * (TILE_H / 2) + TILE_H / 2 + 8);
    const w = maxX - minX;
    const h = maxY - minY;

    const off = (floorLayerCache.canvas && floorLayerCache.canvas.width === Math.round(w * ds) && floorLayerCache.canvas.height === Math.round(h * ds))
      ? floorLayerCache.canvas
      : document.createElement('canvas');
    off.width = Math.max(1, Math.round(w * ds));
    off.height = Math.max(1, Math.round(h * ds));
    const g = off.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, off.width, off.height);
    g.imageSmoothingEnabled = false;

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const cell = room.grid[y][x];
        if (cell === TILE.WALL || cell === TILE.WINDOW || cell === TILE.DOOR || cell === TILE.VOID) continue;
        const { sx, sy } = tileToScreen(x, y, originX, originY);
        const variant = (x + y) % 2;
        const doorDef = doorMap.get(`${x},${y}`);
        const inZone = zt && x >= zt.x0 && x <= zt.x1 && y >= zt.y0 && y <= zt.y1;
        const tileCol = inZone ? (zt.color || floorColor) : floorColor;
        let canvas;
        if (doorDef?.elevator) {
          canvas = bakeSprite(`elevtile:${room.id}:${lightsTag}`, () => buildElevatorTile(floorColor), ds);
        } else if (doorDef) {
          canvas = bakeSprite(`doortile:${room.id}:${lightsTag}`, () => buildDoorTile(floorColor), ds);
        } else {
          let mat = room.floorMaterial || 'default';
          if (inZone && zt?.material) mat = zt.material;
          if (room.zones) {
            const matchZone = room.zones.find((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
            if (matchZone?.material) mat = matchZone.material;
          }
          canvas = bakeSprite(`floor:${room.id}:${inZone ? 'z' : 'b'}:${mat}:${variant}:${tileCol}:${lightsTag}`, () => buildFloorTile(tileCol, variant, mat), ds);
        }
        const dx = Math.round((sx - minX - TILE_W / 2) * ds);
        const dy = Math.round((sy - minY - TILE_H / 2) * ds);
        g.drawImage(canvas, dx, dy);
        if (inZone && zt.riser && (x === zt.x0 || y === zt.y0)) {
          g.save();
          g.setTransform(ds, 0, 0, ds, -minX * ds, -minY * ds);
          g.strokeStyle = 'rgba(255, 248, 224, 0.35)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(sx - TILE_W / 2, sy);
          g.lineTo(sx, sy - TILE_H / 2);
          g.lineTo(sx + TILE_W / 2, sy);
          g.stroke();
          g.restore();
        }
      }
    }
    floorLayerCache = { key, canvas: off, minX, minY };
  }
  blitDeviceAligned(ctx, floorLayerCache.canvas, floorLayerCache.minX, floorLayerCache.minY, ds);
}

function drawWallsLayerCached(ctx, room, originX, originY, wallColor, sky, wb, lightsTag, ds) {
  const key = `${room.id}:${originX},${originY}:${wallColor}:${lightsTag}:${wb}:${ds}`;
  if (wallLayerCache.key !== key) {
    const minX = Math.floor(originX - (room.height - 1) * (TILE_W / 2) - TILE_W / 2 - 32);
    const maxX = Math.ceil(originX + (room.width - 1) * (TILE_W / 2) + TILE_W / 2 + 32);
    const minY = Math.floor(originY - WALL_ANCHOR_Y - 32);
    const maxY = Math.ceil(originY + (room.width + room.height) * (TILE_H / 2) + 64);
    const w = maxX - minX;
    const h = maxY - minY;

    const off = (wallLayerCache.canvas && wallLayerCache.canvas.width === Math.round(w * ds) && wallLayerCache.canvas.height === Math.round(h * ds))
      ? wallLayerCache.canvas
      : document.createElement('canvas');
    off.width = Math.max(1, Math.round(w * ds));
    off.height = Math.max(1, Math.round(h * ds));
    const g = off.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, off.width, off.height);
    g.imageSmoothingEnabled = false;

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const cell = room.grid[y][x];
        if (cell !== TILE.WALL && cell !== TILE.WINDOW && cell !== TILE.DOOR) continue;
        if (x === 0 && y === 0) continue;
        const kind = y === 0 ? 'north' : 'west';
        const { sx, sy } = tileToScreen(kind === 'north' ? x : 1, kind === 'north' ? 1 : y, originX, originY);
        let sprite;
        let spriteKey;
        const isRooftopHousing = room.isRooftop && y === 0 && x >= 4 && x <= 14;
        if (room.isRooftop && !isRooftopHousing) {
          spriteKey = `rooftop_rail:${kind}:${ds}`;
          sprite = () => buildGlassBalustradeSegment(kind);
        } else if (cell === TILE.WINDOW) {
          spriteKey = `window:${room.id}:${kind}:${wb}:${lightsTag}`;
          sprite = () => buildWindowSegment(wallColor, sky, kind);
        } else if (cell === TILE.DOOR) {
          const doorDef = room.doors.find((d) => d.x === x && d.y === y);
          if (doorDef?.elevator) {
            spriteKey = `elevdoor:${room.id}:${kind}:${lightsTag}`;
            sprite = () => buildElevatorDoorSegment(wallColor, kind);
          } else if (doorDef?.to === 'rooftop' || room.isRooftop) {
            spriteKey = `stairdoor:${room.id}:${kind}:${lightsTag}`;
            sprite = () => buildStairwellDoorSegment(wallColor, kind);
          } else {
            spriteKey = `door:${room.id}:${kind}:${lightsTag}`;
            sprite = () => buildDoorSegment(wallColor, kind);
          }
        } else {
          spriteKey = `wall:${room.id}:${kind}:${lightsTag}`;
          sprite = () => buildWallSegment(wallColor, kind);
        }
        const wallCanvas = bakeSprite(spriteKey, sprite, ds);
        const dx = Math.round((sx - minX - TILE_W / 2) * ds);
        const dy = Math.round((sy - minY - WALL_ANCHOR_Y) * ds);
        g.drawImage(wallCanvas, dx, dy);
      }
    }
    wallLayerCache = { key, canvas: off, minX, minY };
  }
  blitDeviceAligned(ctx, wallLayerCache.canvas, wallLayerCache.minX, wallLayerCache.minY, ds);
}

export function renderRoom(ctx, opts) {
  const {
    room, placedFurniture, entities, hoverTile, ghost, phase,
    width, height, dpr = 1, now = 0, elevatorAnim = null, camera = null, lightsOn = true,
  } = opts;
  entityScreenBounds.clear();

  const zoom = camera?.zoom ?? 1;
  const panX = camera?.panX ?? 0;
  const panY = camera?.panY ?? 0;
  // Everything drawn inside the camera transform is baked at dpr*zoom device pixels
  // so nothing is an upscaled (blurry) bitmap when zoomed in. Main canvas DPR is capped at 2.
  const cappedDpr = Math.max(1, Math.min(2, dpr || 1));
  const ds = deviceScale(cappedDpr, zoom);

  ctx.setTransform(cappedDpr, 0, 0, cappedDpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // Clear main canvas so the separate background layer behind it is visible
  ctx.clearRect(0, 0, width, height);

  const { day, tintAlpha } = dayNightColors(phase);

  // 2. Camera-transformed World Context (cutaway, room, furniture, characters)
  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-width / 2, -height / 2);

  const { originX, originY } = computeOrigin(room, width, height);
  const lightsTag = lightsOn ? 'L' : 'D';
  const floorColor = lightsOn ? floorBaseColor(room) : shadeColor(floorBaseColor(room), -0.55);
  const wallColor = lightsOn ? wallBaseColor(room) : shadeColor(wallBaseColor(room), -0.55);
  const wb = Math.round(day * 8) / 8;
  const sky = { top: lerpColor('#1a2250', '#8fd0ff', wb), bottom: lerpColor('#ffd27a', '#fff6c9', wb) };

  // Tower cut-away shaft, concrete floor slab, and neighbouring floors
  drawTowerCutawayUnderCached(ctx, room, originX, originY, width, height, phase, ds);

  // Viewport bounds in world space for frustum culling on expanded floors
  const tl = screenToWorld(0, 0, camera, width, height);
  const br = screenToWorld(width, height, camera, width, height);
  const viewMinX = Math.min(tl.wx, br.wx) - 80;
  const viewMaxX = Math.max(tl.wx, br.wx) + 80;
  const viewMinY = Math.min(tl.wy, br.wy) - 90;
  const viewMaxY = Math.max(tl.wy, br.wy) + 80;

  // Pass 1: floor tiles (skipping walls, windows, doors, and irregular VOID cutouts)
  let doorMap = room._doorMap;
  if (!doorMap) {
    doorMap = new Map();
    for (const d of room.doors) {
      const matKey = d.y === 0 ? `${d.x},1` : `1,${d.y}`;
      doorMap.set(matKey, d);
    }
    room._doorMap = doorMap;
  }
  // Pass 1: static floor layer (cached offscreen per room/lighting/scale)
  drawFloorLayerCached(ctx, room, originX, originY, floorColor, lightsTag, ds, doorMap);

  // Flat decor (rugs, yoga mats, lap pool tiles) lies on the floor
  const poolItems = placedFurniture.filter((f) => f.itemId === 'pool_water');
  if (poolItems.length > 0) {
    drawPoolWaterLayer(ctx, poolItems, originX, originY, ds, now);
  }
  for (const f of placedFurniture) {
    if (f.itemId === 'pool_water') continue;
    const flatItem = getCatalogueItem(f.itemId);
    if (!flatItem?.flat) continue;
    const flatPt = tileToScreen(f.x, f.y, originX, originY);
    if (camera && (flatPt.sx < viewMinX - 80 || flatPt.sx > viewMaxX + 80 || flatPt.sy < viewMinY - 80 || flatPt.sy > viewMaxY + 80)) continue;
    drawFurniture(ctx, f, originX, originY, ds, Boolean(flatItem.lightSource) && !lightsOn);
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

  // Pass 2: static walls, windows, doorways & elevator doors (cached offscreen per room/lighting/scale)
  drawWallsLayerCached(ctx, room, originX, originY, wallColor, sky, wb, lightsTag, ds);

  // Upper concrete ceiling slab / parapet over the top of the walls
  drawTowerCutawayOverCached(ctx, room, originX, originY, width, height, ds);

  // Pass 3: depth-sorted furniture + entities (with overhead items rendered above)
  const drawables = drawablesBuf;
  const overheadDrawables = overheadDrawablesBuf;
  drawables.length = 0;
  overheadDrawables.length = 0;
  for (const f of placedFurniture) {
    const item = getCatalogueItem(f.itemId);
    if (item?.flat) continue;
    if (item?.overhead) {
      overheadDrawables.push(f);
      continue;
    }
    const frontX = f.x + (f.footprint.w - 1);
    const frontY = f.y + (f.footprint.h - 1);
    drawables.push({ depth: frontX + frontY, type: 'furniture', data: f });
  }
  for (const e of entities) {
    drawables.push({ depth: e.depth ?? e.x + e.y + 0.5, type: 'entity', data: e });
  }
  if (room.openEdges) {
    const southY = room.height - 1;
    const eastX = room.width - 1;
    for (let x = 0; x < room.width; x++) {
      if (room.grid[southY][x] === TILE.VOID) continue;
      if (room.doors.some((d) => d.x === x && d.y === southY)) continue;
      drawables.push({ depth: x + southY - 0.1, type: 'edgerail', data: { edge: 'south', x, y: southY } });
    }
    for (let y = 0; y < room.height; y++) {
      if (room.grid[y][eastX] === TILE.VOID) continue;
      if (room.doors.some((d) => d.x === eastX && d.y === y)) continue;
      drawables.push({ depth: eastX + y - 0.1, type: 'edgerail', data: { edge: 'east', x: eastX, y } });
    }
  }
  drawables.sort((a, b) => a.depth - b.depth);

  const nameTargets = nameTargetsBuf;
  const bubbleTargets = bubbleTargetsBuf;
  nameTargets.length = 0;
  bubbleTargets.length = 0;
  for (const d of drawables) {
    if (d.type === 'furniture') {
      const fItem = getCatalogueItem(d.data.itemId);
      drawFurniture(ctx, d.data, originX, originY, ds, Boolean(fItem?.lightSource) && !lightsOn);
    } else if (d.type === 'edgerail') {
      drawEdgeRail(ctx, d.data.edge, d.data.x, d.data.y, originX, originY, ds);
    } else {
      const e = d.data;
      const { sx, sy } = tileToScreen(e.x, e.y, originX, originY);
      const bbox = drawCharacter(ctx, e, sx, sy, ds, room);
      const sPt = worldToScreen(bbox.x, bbox.y, camera, width, height);
      const hw = Math.round(20 * zoom);
      const hh = Math.round((bbox.h || 52) * zoom);
      entityScreenBounds.set(e.id, {
        id: e.id,
        x0: sPt.sx - hw,
        y0: sPt.sy,
        x1: sPt.sx + hw,
        y1: sPt.sy + hh,
        entity: e,
      });
      const footScreen = worldToScreen(bbox.x, bbox.footY, camera, width, height);
      if (e.nameTag) nameTargets.push({ x: footScreen.sx, y: footScreen.sy, name: e.nameTag });
      if (e.bubbleText) {
        const headScreen = worldToScreen(bbox.x + bbox.w / 2, bbox.y, camera, width, height);
        bubbleTargets.push({ x: headScreen.sx, y: headScreen.sy, text: e.bubbleText });
      }
    }
  }

  // Draw overhead items (e.g. chandelier) above characters and furniture
  for (const f of overheadDrawables) {
    const oItem = getCatalogueItem(f.itemId);
    drawFurniture(ctx, f, originX, originY, ds, Boolean(oItem?.lightSource) && !lightsOn);
  }

  // Ambient lighting & localized warm emissive light pools (both night-time and per-room ambient lighting)
  const roomAmbient = room.ambientLighting;
  const effectiveTintAlpha = Math.max(tintAlpha, roomAmbient ? (roomAmbient.darkness || 0.3) : 0);
  const effectiveTintColor = (tintAlpha > 0.02)
    ? (roomAmbient ? lerpColor('#5b6bb0', roomAmbient.tint || '#261420', 0.5) : '#5b6bb0')
    : (roomAmbient?.tint || '#261420');

  if (effectiveTintAlpha > 0.02) {
    ctx.save();
    ctx.globalAlpha = effectiveTintAlpha;
    ctx.fillStyle = effectiveTintColor;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(viewMinX, viewMinY, viewMaxX - viewMinX, viewMaxY - viewMinY);
    ctx.restore();

    const lightStrength = Math.max(
      Math.min(1, tintAlpha / 0.32),
      roomAmbient?.warmGlow ? (roomAmbient.darkness || 0.35) * 2.2 : 0,
    );
    if (lightStrength > 0.01) {
      const lm = getRoomLightMap(room, placedFurniture, originX, originY, lightsOn, ds);
      if (lm && lm.canvas) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = lightStrength;
        blitDeviceAligned(ctx, lm.canvas, lm.minX, lm.minY, ds);
        ctx.restore();
      }
    }
  }

  // Restore camera transform so UI text, speech bubbles and dialog overlays render in native screen pixels
  ctx.restore();

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
  const curFloorNum = Math.round(anim.fromFloor + (anim.toFloor - anim.fromFloor) * t);
  const curFloorBadge = (curFloorNum >= 10 && anim.toFloor >= 10) ? 'ROOFTOP (R)' : `FLOOR ${curFloorNum}`;
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
  ctx.fillText(`🛗 ${curFloorBadge}`, width / 2, by + 28);
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
