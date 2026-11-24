// Pure isometric projection + camera math. No DOM, no canvas: shared by the
// PixiJS renderer, main.js input handling and the Node unit tests.
//
// World space: one tile is TILE_W x TILE_H world px (2:1 diamond). The camera
// maps world -> screen as: translate(w/2 + panX, h/2 + panY) * scale(zoom) *
// translate(-w/2, -h/2).

export const TILE_W = 64;
export const TILE_H = 32;
export const WALL_H = 56;
export const TOP_PADDING = 54;

export const DEFAULT_ZOOM = 1.85;
export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 2.5;

export function clampZoom(z) {
  const num = typeof z === 'number' && !isNaN(z) ? z : DEFAULT_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(num * 100) / 100));
}

export function tileToScreen(x, y, originX, originY) {
  return {
    sx: originX + (x - y) * (TILE_W / 2),
    sy: originY + (x + y) * (TILE_H / 2),
  };
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

export function centerCameraOnTile(tx, ty, room, width, height, zoom = DEFAULT_ZOOM) {
  const { originX, originY } = computeOrigin(room, width, height);
  const { sx, sy } = tileToScreen(tx, ty, originX, originY);
  const clampedZoom = clampZoom(zoom);
  const panX = Math.round(-(sx - width / 2) * clampedZoom);
  const panY = Math.round((height * 0.52 - height / 2) - (sy - height / 2) * clampedZoom);
  return { zoom: clampedZoom, panX, panY };
}

// "Follow camera: Off" dead-zone: the camera only pans once the player's screen
// position reaches within this fraction of the viewport edge.
export const CAMERA_DEADZONE_MARGIN = 0.2;

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
