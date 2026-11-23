// Legacy Canvas2D Renderer (PIXI_MIGRATION_PLAN.md §2.1).
// Preserves the existing render.js Canvas2D pipeline until Phase 8 cleanup.

import {
  renderRoom, computeOrigin, screenToTile as rawScreenToTile, tileToScreen as rawTileToScreen,
  worldToScreen as rawWorldToScreen, hitTestNpc as rawHitTestNpc, getItemIconDataUrl as rawGetItemIconDataUrl,
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, clampZoom, zoomAtPoint, centerCameraOnTile, deadzoneCameraTarget,
  renderSkylineToCanvas, getCachedIsoCityLayout, computeCityVehicles, drawCityVehicles,
  nearCityLayerTransform, warmUpRoomSprites, clearSpriteCache, warmupRoomCache,
} from '../render.js';
import { setDetail, getDetail } from '../pixelart.js';
import { snapBakeCtx } from '../bakeSnap.js';
import { clearCharacterCache } from '../voxel.js';
import { resolveSpriteDetail } from '../adaptiveQuality.js';
import { drawWeatherOverlay } from '../viewer.js';

export {
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, clampZoom, zoomAtPoint, centerCameraOnTile, deadzoneCameraTarget,
  computeOrigin, rawTileToScreen as tileToScreen, rawWorldToScreen as worldToScreen,
  rawScreenToTile as screenToTile, rawHitTestNpc as hitTestNpc, rawGetItemIconDataUrl as getItemIconDataUrl,
};

const BG_SCALE_LOW = 0.5;
const BG_SCALE_HIGH = 1;
const BG_MAX_HIGH_PIXELS = 6e6; // shortcut: above this (huge zoom-out margins) fall back to 0.5, rarely hit
const VEHICLE_UPDATE_INTERVAL = 1000 / 12; // ~83.3ms for 12 Hz
const MARGIN_BUCKET = 160;

export function wantedBgScale(width, height, ox, oy) {
  if (getDetail() < 2) return BG_SCALE_LOW;
  return (width + 2 * ox) * (height + 2 * oy) > BG_MAX_HIGH_PIXELS ? 0.5 : BG_SCALE_HIGH;
}

export function requiredCityMargin(cssDim, pan, zoomNow) {
  const z = Math.max(MIN_ZOOM, zoomNow || 1);
  const effZoom = Math.min(1.0, z);
  const halfVisible = Math.abs(pan) / z + (cssDim / 2) / effZoom;
  const needed = Math.max(0, halfVisible - cssDim / 2) + cssDim * 0.12;
  return Math.ceil(needed / MARGIN_BUCKET) * MARGIN_BUCKET;
}

export class LegacyCanvasRenderer {
  constructor(opts = {}) {
    this.backend = 'legacy';
    this.requestedRenderer = opts.requestedRenderer || 'legacy';
    this.fallbackReason = opts.fallbackReason || null;
    this.canvas = null;
    this.ctx = null;
    this.cssW = 960;
    this.cssH = 600;
    this.dpr = 1;
    this.qualityLevel = 'auto';
    this.lastAppliedSpriteDetail = null;
    this.currentRoom = null;
    this.currentPlaced = [];
    this.currentLook = null;
    this.lastFrameState = null;
    this.lastVehiclesCount = 0;
    this.lastBeaconsCount = 0;

    this.skyLayer = null;
    this.skyCanvas = null;
    this.bgLayer = null;
    this.bgCanvas = null;
    this.vehicleCanvas = null;
    this.buildingsCanvas = null;
    this.beaconCanvas = null;

    this.bgScale = BG_SCALE_LOW;
    this.rebakeHandle = null;
    this.bgState = {
      floor: null,
      width: 0,
      height: 0,
      phase: -1,
      beacons: [],
      ox: 380,
      oy: 260,
      rebakeScheduled: false,
      lastVehicleUpdateAt: 0,
      lastTransform: '',
      lastSkyTransform: '',
      scale: BG_SCALE_LOW,
    };
    this.cityWorker = null;
    this.currentCityJobId = 0;
  }

  init(canvasHost, opts = {}) {
    this.canvas = canvasHost;
    if (canvasHost && typeof canvasHost.getContext === 'function') {
      this.ctx = canvasHost.getContext('2d');
      if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    }
    if (opts.cssW) this.cssW = opts.cssW;
    if (opts.cssH) this.cssH = opts.cssH;
    if (opts.dpr) this.dpr = opts.dpr;

    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    if (doc && typeof doc.getElementById === 'function') {
      this.skyLayer = doc.getElementById('skyLayer');
      this.skyCanvas = doc.getElementById('skyCanvas');
      this.bgLayer = doc.getElementById('bgLayer');
      this.bgCanvas = doc.getElementById('bgCanvas');
      this.vehicleCanvas = doc.getElementById('vehicleCanvas');
      this.buildingsCanvas = doc.getElementById('buildingsCanvas');
      this.beaconCanvas = doc.getElementById('beaconCanvas');
    }

    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && !this.cityWorker) {
      try {
        this.cityWorker = new Worker(new URL('../city-worker.js', import.meta.url), { type: 'module' });
        this.cityWorker.onmessage = (e) => this._onCityWorkerMessage(e.data);
      } catch (err) {
        console.warn('City backdrop Web Worker init failed; using main-thread bake:', err);
        this.cityWorker = null;
      }
    }
    return this;
  }

  _onCityWorkerMessage(data) {
    if (data.jobId !== this.currentCityJobId) {
      if (data.bitmap) data.bitmap.close();
      return;
    }
    if (data.bitmap) {
      let targetCanvas = null;
      if (data.layer === 'ground') targetCanvas = this.bgCanvas;
      else if (data.layer === 'buildings') {
        targetCanvas = this.buildingsCanvas;
        if (!this.buildingsClearedForJob || this.buildingsClearedForJob !== data.jobId) {
          this.buildingsClearedForJob = data.jobId;
          if (targetCanvas) {
            const ctx = targetCanvas.getContext('2d');
            ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
          }
        }
      }
      else if (data.layer === 'sky') targetCanvas = this.skyCanvas;

      if (targetCanvas) {
        const ctx = targetCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(data.bitmap, data.x0, data.y0);
      }
      data.bitmap.close();
    }
    if (data.beacons) {
      this.bgState.beacons = data.beacons;
      this.lastBeaconsCount = data.beacons.length;
    }
    if (data.done) {
      this.bgState.baking = false;
    }
  }

  resize(cssW, cssH, dpr = 1) {
    const cappedDpr = Math.max(1, Math.min(2, dpr || 1));
    const w = Math.max(1, Math.round(cssW || 960));
    const h = Math.max(1, Math.round(cssH || 600));
    const targetW = Math.max(1, Math.round(w * cappedDpr));
    const targetH = Math.max(1, Math.round(h * cappedDpr));
    const changed = (
      !this.canvas ||
      this.canvas.width !== targetW ||
      this.canvas.height !== targetH ||
      this.dpr !== cappedDpr ||
      this.cssW !== w ||
      this.cssH !== h
    );
    this.cssW = w;
    this.cssH = h;
    this.dpr = cappedDpr;
    if (this.canvas && (this.canvas.width !== targetW || this.canvas.height !== targetH)) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    if (changed && this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
    return { cssW: this.cssW, cssH: this.cssH, dpr: this.dpr, changed };
  }

  setQuality(level = 'auto', ctxOpts = {}) {
    this.qualityLevel = level;
    const isMobile = Boolean(ctxOpts.isMobile);
    const lowQualityTriggered = Boolean(ctxOpts.lowQualityTriggered);
    const force = Boolean(ctxOpts.force);
    const targetDetail = (level === 1 || level === 2)
      ? level
      : resolveSpriteDetail(level, lowQualityTriggered, isMobile);
    if (force || targetDetail !== this.lastAppliedSpriteDetail) {
      this.lastAppliedSpriteDetail = targetDetail;
      setDetail(targetDetail);
      clearSpriteCache();
      clearCharacterCache();
      const room = ctxOpts.room || this.currentRoom;
      const placed = ctxOpts.placed || this.currentPlaced || [];
      const dpr = ctxOpts.dpr || this.dpr || 1;
      if (room && typeof warmupRoomCache === 'function') {
        warmupRoomCache(room, placed, dpr);
      }
    }
    return targetDetail;
  }

  enterRoom(roomDef, placed = [], look = null, dpr = this.dpr) {
    this.currentRoom = roomDef;
    this.currentPlaced = placed;
    this.currentLook = look;
  }

  cancelPendingRebake() {
    if (this.rebakeHandle !== null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.rebakeHandle);
      } else {
        clearTimeout(this.rebakeHandle);
      }
      this.rebakeHandle = null;
    }
    this.bgState.rebakeScheduled = false;
  }

  performBackgroundBake(room, width, height, phase, ox, oy) {
    this.cancelPendingRebake();
    if (!this.bgCanvas) return;
    const floor = room?.floor || 1;
    this.bgScale = wantedBgScale(width, height, ox, oy);
    this.bgState.scale = this.bgScale;
    const bgScale = this.bgScale;
    const bgW = Math.max(1, Math.round((width + 2 * ox) * bgScale));
    const bgH = Math.max(1, Math.round((height + 2 * oy) * bgScale));

    for (const c of [this.bgCanvas, this.vehicleCanvas, this.buildingsCanvas, this.beaconCanvas, this.skyCanvas]) {
      if (!c) continue;
      if (c.width !== bgW || c.height !== bgH) {
        c.width = bgW;
        c.height = bgH;
      }
      c.style.left = `${-ox}px`;
      c.style.top = `${-oy}px`;
      c.style.width = `${width + 2 * ox}px`;
      c.style.height = `${height + 2 * oy}px`;
    }

    if (this.cityWorker) {
      this.currentCityJobId = (this.currentCityJobId || 0) + 1;
      this.bgState.baking = true;
      this.cityWorker.postMessage({
        jobId: this.currentCityJobId,
        width,
        height,
        phase,
        floor,
        room: room ? { id: room.id, floor: room.floor, width: room.width, height: room.height } : null,
        ox,
        oy,
        scale: bgScale,
        chunkSize: 512,
      });
      this.bgState.floor = floor;
      this.bgState.width = width;
      this.bgState.height = height;
      this.bgState.phase = phase;
      this.bgState.ox = ox;
      this.bgState.oy = oy;
      return;
    }

    const g = this.bgCanvas.getContext('2d');
    g.setTransform(bgScale, 0, 0, bgScale, ox * bgScale, oy * bgScale);
    g.imageSmoothingEnabled = false;
    snapBakeCtx(g, bgScale);
    renderSkylineToCanvas(g, width, height, phase, floor, room, ox, oy, 'ground');

    let beacons = [];
    if (this.buildingsCanvas) {
      const bCtx = this.buildingsCanvas.getContext('2d');
      bCtx.setTransform(1, 0, 0, 1, 0, 0);
      bCtx.clearRect(0, 0, this.buildingsCanvas.width, this.buildingsCanvas.height);
      bCtx.setTransform(bgScale, 0, 0, bgScale, ox * bgScale, oy * bgScale);
      bCtx.imageSmoothingEnabled = false;
      snapBakeCtx(bCtx, bgScale);
      beacons = renderSkylineToCanvas(bCtx, width, height, phase, floor, room, ox, oy, 'buildings');
    }
    this.bgState.beacons = beacons;

    if (this.skyCanvas) {
      if (this.skyCanvas.width !== bgW || this.skyCanvas.height !== bgH) {
        this.skyCanvas.width = bgW;
        this.skyCanvas.height = bgH;
      }
      this.skyCanvas.style.left = `${-ox}px`;
      this.skyCanvas.style.top = `${-oy}px`;
      this.skyCanvas.style.width = `${width + 2 * ox}px`;
      this.skyCanvas.style.height = `${height + 2 * oy}px`;
      const sg = this.skyCanvas.getContext('2d');
      sg.setTransform(bgScale, 0, 0, bgScale, ox * bgScale, oy * bgScale);
      sg.imageSmoothingEnabled = false;
      snapBakeCtx(sg, bgScale);
      renderSkylineToCanvas(sg, width, height, phase, floor, room, ox, oy, 'sky');
    }

    this.bgState.floor = floor;
    this.bgState.width = width;
    this.bgState.height = height;
    this.bgState.phase = phase;
    this.bgState.beacons = beacons || [];
    this.bgState.ox = ox;
    this.bgState.oy = oy;
    this.lastBeaconsCount = this.bgState.beacons.length;
  }

  scheduleBackgroundRebake(room, width, height, phase, ox, oy, getLivePhase = null) {
    this.cancelPendingRebake();
    this.bgState.rebakeScheduled = true;
    const runner = typeof requestIdleCallback !== 'undefined'
      ? (cb) => requestIdleCallback(cb, { timeout: 120 })
      : (cb) => setTimeout(cb, 16);
    this.rebakeHandle = runner(() => {
      this.rebakeHandle = null;
      this.bgState.rebakeScheduled = false;
      const p = typeof getLivePhase === 'function' ? getLivePhase() : phase;
      this.performBackgroundBake(room, width, height, p, ox, oy);
    });
  }

  updateBackgroundTransform(panX, panY, zoom) {
    if (this.bgLayer) {
      const near = nearCityLayerTransform({ panX, panY, zoom });
      const transform = `translate3d(${near.panX}px, ${near.panY}px, 0) scale(${near.zoom})`;
      if (this.bgState.lastTransform !== transform) {
        this.bgState.lastTransform = transform;
        this.bgLayer.style.transform = transform;
      }
    }
    if (this.skyLayer) {
      const parallax = 0.35;
      const skyPanX = Math.round(panX * parallax);
      const skyPanY = Math.round(panY * parallax);
      const skyZoom = (1 + (zoom - 1) * 0.3).toFixed(4);
      const transform = `translate3d(${skyPanX}px, ${skyPanY}px, 0) scale(${skyZoom})`;
      if (this.bgState.lastSkyTransform !== transform) {
        this.bgState.lastSkyTransform = transform;
        this.skyLayer.style.transform = transform;
      }
    }
  }

  updateVehiclesAndBeacons(now, room, width, height, phase, ox, oy, qualityMode) {
    if (!this.vehicleCanvas) return;
    if (qualityMode === 'low') {
      if (this.vehicleCanvas.style.display !== 'none') {
        this.vehicleCanvas.style.display = 'none';
        const vCtx = this.vehicleCanvas.getContext('2d');
        vCtx.setTransform(1, 0, 0, 1, 0, 0);
        vCtx.clearRect(0, 0, this.vehicleCanvas.width, this.vehicleCanvas.height);
      }
      if (this.beaconCanvas && this.beaconCanvas.style.display !== 'none') {
        this.beaconCanvas.style.display = 'none';
        const bCtx = this.beaconCanvas.getContext('2d');
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.clearRect(0, 0, this.beaconCanvas.width, this.beaconCanvas.height);
      }
      this.lastVehiclesCount = 0;
      return;
    }
    if (this.vehicleCanvas.style.display === 'none') {
      this.vehicleCanvas.style.display = 'block';
    }
    if (this.beaconCanvas && this.beaconCanvas.style.display === 'none') {
      this.beaconCanvas.style.display = 'block';
    }
    if (now - this.bgState.lastVehicleUpdateAt < VEHICLE_UPDATE_INTERVAL) {
      return;
    }
    this.bgState.lastVehicleUpdateAt = now;
    const bgScale = this.bgScale;
    const vCtx = this.vehicleCanvas.getContext('2d');
    vCtx.setTransform(1, 0, 0, 1, 0, 0);
    vCtx.clearRect(0, 0, this.vehicleCanvas.width, this.vehicleCanvas.height);
    vCtx.setTransform(bgScale, 0, 0, bgScale, ox * bgScale, oy * bgScale);
    snapBakeCtx(vCtx, bgScale);

    const roomSpec = room || { id: 'lobby', width: 12, height: 9, floor: 1 };
    const layout = getCachedIsoCityLayout(roomSpec, width, height, phase, 400 + ox, 320 + oy);
    const vehicles = computeCityVehicles(layout, now, phase);
    this.lastVehiclesCount = vehicles.length;
    vCtx.save();
    vCtx.beginPath();
    vCtx.rect(-ox, layout.horizonY, width + 2 * ox, height + oy - layout.horizonY);
    vCtx.clip();
    drawCityVehicles(vCtx, layout, vehicles, phase, 1);
    vCtx.restore();

    if (this.beaconCanvas) {
      const bCtx = this.beaconCanvas.getContext('2d');
      bCtx.setTransform(1, 0, 0, 1, 0, 0);
      bCtx.clearRect(0, 0, this.beaconCanvas.width, this.beaconCanvas.height);
      bCtx.setTransform(bgScale, 0, 0, bgScale, ox * bgScale, oy * bgScale);
      snapBakeCtx(bCtx, bgScale);
      const blinkOn = Math.floor(now / 650) % 2 === 0;
      for (const b of (this.bgState.beacons || [])) {
        bCtx.fillStyle = blinkOn ? '#ff3b4e' : '#6e1c28';
        bCtx.fillRect(b.x - 2, b.y - 2, 4, 4);
        if (blinkOn) {
          bCtx.fillStyle = 'rgba(255, 70, 90, 0.28)';
          bCtx.fillRect(b.x - 5, b.y - 5, 10, 10);
        }
      }
    }
  }

  updateBackground(now, room, width, height, phase, camera, qualityMode, playerWalking = false, getLivePhase = null) {
    const baseOx = Math.max(380, Math.round(width * 0.45));
    const baseOy = Math.max(260, Math.round(height * 0.45));
    const neededOx = Math.max(baseOx, requiredCityMargin(width, camera.panX, camera.zoom));
    const neededOy = Math.max(baseOy, requiredCityMargin(height, camera.panY, camera.zoom));
    const floor = room?.floor || 1;

    if (this.bgState.floor === null) {
      this.scheduleBackgroundRebake(room, width, height, phase, neededOx, neededOy, getLivePhase);
    } else if (
      !playerWalking && (
        this.bgState.floor !== floor ||
        Math.abs(this.bgState.width - width) > 60 ||
        Math.abs(this.bgState.height - height) > 60 ||
        Math.abs(this.bgState.phase - phase) >= 0.15 ||
        this.bgState.scale !== wantedBgScale(width, height, Math.max(neededOx, this.bgState.ox), Math.max(neededOy, this.bgState.oy)) ||
        neededOx > this.bgState.ox ||
        neededOy > this.bgState.oy
      )
    ) {
      this.scheduleBackgroundRebake(room, width, height, phase, Math.max(neededOx, this.bgState.ox), Math.max(neededOy, this.bgState.oy), getLivePhase);
    }

    this.updateBackgroundTransform(camera.panX, camera.panY, camera.zoom);
    this.updateVehiclesAndBeacons(now, room, width, height, phase, this.bgState.ox || baseOx, this.bgState.oy || baseOy, qualityMode);
  }

  renderFrame(frameState) {
    this.lastFrameState = frameState;
    if (frameState.room) this.currentRoom = frameState.room;
    if (frameState.placedFurniture) this.currentPlaced = frameState.placedFurniture;
    if (frameState.width) this.cssW = frameState.width;
    if (frameState.height) this.cssH = frameState.height;
    if (frameState.dpr) this.dpr = frameState.dpr;

    if (frameState.updateBackground !== false && this.bgCanvas) {
      this.updateBackground(
        frameState.now || 0,
        frameState.room,
        frameState.width || this.cssW,
        frameState.height || this.cssH,
        frameState.phase ?? 0.5,
        frameState.camera || { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 },
        frameState.qualityMode || 'high',
        Boolean(frameState.playerWalking),
        frameState.getLivePhase || null,
      );
    }

    if (this.ctx) {
      renderRoom(this.ctx, frameState);
      if (frameState.room?.openEdges && frameState.weatherEffects !== false && frameState.weatherState) {
        drawWeatherOverlay(this.ctx, frameState.width || this.cssW, frameState.height || this.cssH, frameState.weatherState, frameState.now || 0, 0.55);
      }
    }
  }

  worldToScreen(wx, wy, camera = this.lastFrameState?.camera || null, width = this.cssW, height = this.cssH) {
    return rawWorldToScreen(wx, wy, camera, width, height);
  }

  tileToScreen(tx, ty, originX, originY) {
    if (typeof originX === 'number' && typeof originY === 'number') {
      return rawTileToScreen(tx, ty, originX, originY);
    }
    const room = this.currentRoom || this.lastFrameState?.room || { width: 12, height: 9 };
    const orig = computeOrigin(room, this.cssW, this.cssH);
    const world = rawTileToScreen(tx, ty, orig.originX, orig.originY);
    return rawWorldToScreen(world.sx, world.sy, this.lastFrameState?.camera || null, this.cssW, this.cssH);
  }

  screenToTile(mx, my, originX, originY, camera, width, height) {
    if (typeof originX === 'number' && typeof originY === 'number') {
      return rawScreenToTile(mx, my, originX, originY, camera, width, height);
    }
    const room = this.currentRoom || this.lastFrameState?.room;
    if (!room) return null;
    const orig = computeOrigin(room, this.cssW, this.cssH);
    const cam = camera || this.lastFrameState?.camera || null;
    const tile = rawScreenToTile(mx, my, orig.originX, orig.originY, cam, this.cssW, this.cssH);
    if (tile.x < 0 || tile.y < 0 || tile.x >= room.width || tile.y >= room.height) return null;
    return tile;
  }

  hitTestNpc(cx, cy) {
    return rawHitTestNpc(cx, cy);
  }

  getItemIconDataUrl(itemId, size = 48, dpr = 1) {
    return rawGetItemIconDataUrl(itemId, size, dpr);
  }

  snapshot(type = 'image/png') {
    if (!this.canvas || typeof this.canvas.toDataURL !== 'function') return '';
    return this.canvas.toDataURL(type);
  }

  debugScene() {
    const fs = this.lastFrameState;
    const furn = fs?.placedFurniture || this.currentPlaced || [];
    const ents = fs?.entities || [];
    const frameNames = [
      ...furn.map((f) => `furn:${f.itemId}:${((f.rot || 0) % 4 + 4) % 4}:all`),
      ...ents.map((e) => `char:${e.spriteKey || e.id}:${e.dir || 'down'}`),
    ];
    return {
      backend: this.backend,
      requestedRenderer: this.requestedRenderer,
      fallbackReason: this.fallbackReason,
      detail: getDetail(),
      room: fs?.room?.id || this.currentRoom?.id || null,
      floor: fs?.room?.floor || this.currentRoom?.floor || null,
      viewport: { width: this.cssW, height: this.cssH, dpr: this.dpr },
      camera: fs?.camera ? { ...fs.camera } : null,
      layers: [
        'skyLayer',
        'cityLayer',
        'towerUnder',
        'floorLayer',
        'worldSorted',
        'fxLayer',
        'towerOver',
        'overlayLayer',
      ],
      counts: {
        furniture: furn.length,
        entities: ents.length,
        vehicles: this.lastVehiclesCount,
        beacons: this.lastBeaconsCount,
      },
      frameNames,
    };
  }

  destroy() {
    this.cancelPendingRebake();
    if (this.cityWorker) {
      try {
        this.cityWorker.terminate();
      } catch (_) {}
      this.cityWorker = null;
    }
    clearSpriteCache();
    clearCharacterCache();
    this.lastFrameState = null;
  }
}
