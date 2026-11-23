// PixiJS Render Layer Implementation (PIXI_MIGRATION_PLAN.md §2.2–§2.8 / Phase P2).
// Draws the game in WebGL when ?renderer=pixi (or settings.renderer='pixi').
// Automatically falls back to LegacyCanvasRenderer if WebGL context creation fails.

import {
  computeOrigin, tileToScreen as rawTileToScreen, worldToScreen as rawWorldToScreen,
  screenToTile as rawScreenToTile, hitTestNpc as rawHitTestNpc, getItemIconDataUrl as rawGetItemIconDataUrl,
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, clampZoom,
} from '../../render.js';
import { getDetail } from '../../pixelart.js';
import { TILE } from '../../data.js';
import { LegacyCanvasRenderer } from '../legacy.js';

export class PixiRenderer extends LegacyCanvasRenderer {
  constructor(opts = {}) {
    super({
      ...opts,
      requestedRenderer: 'pixi',
      fallbackReason: opts.fallbackReason || (typeof window === 'undefined' ? 'no-webgl-in-node' : 'awaiting-webgl-init'),
    });
    this.backend = 'legacy';
    this.requestedRenderer = 'pixi';
    this.fallbackReason = opts.fallbackReason || (typeof window === 'undefined' ? 'no-webgl-in-node' : 'awaiting-webgl-init');
    this.isReady = false;
    this.readyPromise = null;
    this.fallbackRenderer = null;

    this.PIXI = null;
    this.app = null;
    this.stage = null;
    this.world = null;
    this.skyLayerContainer = null;
    this.cityLayerContainer = null;
    this.towerUnder = null;
    this.floorLayer = null;
    this.worldSorted = null;
    this.fxLayer = null;
    this.towerOver = null;
    this.overlayLayer = null;

    this.textures = new Map();
    this.sheets = [];
    this.loadedDetail = null;
    this.lastBuiltRoomKey = '';
  }

  init(canvasHost, opts = {}) {
    this.canvas = canvasHost;
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

    if (
      !canvasHost ||
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof canvasHost.getContext !== 'function'
    ) {
      this.backend = 'legacy';
      this.fallbackReason = 'no-webgl-or-headless';
      this.fallbackRenderer = new LegacyCanvasRenderer(opts).init(canvasHost, opts);
      return this;
    }

    this.readyPromise = this._initPixi(canvasHost, opts);
    return this;
  }

  async _initPixi(canvasHost, opts) {
    try {
      const pixiModule = await import('../../../vendor/pixi.min.mjs');
      const { Application, Container, TextureStyle, Assets, Sprite, Graphics } = pixiModule;
      this.PIXI = pixiModule;

      TextureStyle.defaultOptions.scaleMode = 'nearest';

      const dpr = Math.max(1, Math.min(2, this.dpr || 1));
      const app = new Application();
      await app.init({
        preference: 'webgl',
        antialias: false,
        roundPixels: true,
        autoDensity: true,
        resolution: dpr,
        backgroundAlpha: 0,
        preserveDrawingBuffer: true,
        canvas: canvasHost,
        width: this.cssW,
        height: this.cssH,
      });

      if (app.ticker) {
        app.ticker.stop();
      }

      this.app = app;
      this.stage = app.stage;
      this.stage.roundPixels = true;

      // Construct scene graph layers (§2.4)
      this.skyLayerContainer = new Container();
      this.cityLayerContainer = new Container();
      this.stage.addChild(this.skyLayerContainer);
      this.stage.addChild(this.cityLayerContainer);

      this.world = new Container();
      this.world.roundPixels = true;
      this.stage.addChild(this.world);

      this.towerUnder = new Container();
      this.floorLayer = new Container();
      this.floorLayer.roundPixels = true;
      this.worldSorted = new Container();
      this.worldSorted.sortableChildren = true;
      this.worldSorted.roundPixels = true;
      this.fxLayer = new Container();
      this.towerOver = new Container();
      this.overlayLayer = new Container();

      this.world.addChild(this.towerUnder);
      this.world.addChild(this.floorLayer);
      this.world.addChild(this.worldSorted);
      this.world.addChild(this.fxLayer);
      this.world.addChild(this.towerOver);
      this.world.addChild(this.overlayLayer);

      // Ingest pre-baked atlas pages
      await this.loadAtlas(getDetail());

      this.backend = 'pixi';
      this.fallbackReason = null;
      this.isReady = true;

      if (this.currentRoom) {
        this.buildFloorChunks(this.currentRoom);
      }
    } catch (err) {
      console.warn('Pixi WebGL init failed; falling back to LegacyCanvasRenderer:', err);
      this.backend = 'legacy';
      this.fallbackReason = err?.message || 'webgl-init-failed';
      this.fallbackRenderer = new LegacyCanvasRenderer({
        ...opts,
        requestedRenderer: 'pixi',
        fallbackReason: this.fallbackReason,
      });
      this.fallbackRenderer.init(canvasHost, opts);
    }
  }

  async loadAtlas(detail = 1) {
    if (this.loadedDetail === detail && this.textures.size > 0) return;
    try {
      const manifestRes = await fetch('atlas/manifest.json');
      if (!manifestRes.ok) throw new Error(`manifest fetch failed: ${manifestRes.status}`);
      const manifest = await manifestRes.json();
      const detailInfo = manifest.detail?.[detail] || manifest.detail?.[1];
      if (!detailInfo || !Array.isArray(detailInfo.pages)) {
        throw new Error(`no atlas pages for detail ${detail}`);
      }

      const { Assets } = this.PIXI;
      for (const page of detailInfo.pages) {
        const sheetPath = `atlas/${page.json}`;
        const sheet = await Assets.load(sheetPath);
        this.sheets.push(sheet);
        if (sheet && sheet.textures) {
          for (const [name, tex] of Object.entries(sheet.textures)) {
            this.textures.set(name, tex);
          }
        }
      }
      this.loadedDetail = detail;
    } catch (err) {
      console.warn('Failed to load pre-baked atlas; will use dynamic builder textures:', err);
    }
  }

  getTexture(key) {
    return this.textures.get(key) || null;
  }

  buildFloorChunks(room) {
    if (!room || !this.floorLayer || !this.PIXI) return;
    const { Sprite } = this.PIXI;
    const origin = computeOrigin(room, this.cssW, this.cssH);
    const key = `${room.id}:${origin.originX},${origin.originY}:${this.loadedDetail}`;
    if (this.lastBuiltRoomKey === key) return;
    this.lastBuiltRoomKey = key;

    this.floorLayer.removeChildren();

    let doorMap = room._doorMap;
    if (!doorMap) {
      doorMap = new Map();
      for (const d of room.doors) {
        const matKey = d.y === 0 ? `${d.x},1` : `1,${d.y}`;
        doorMap.set(matKey, d);
      }
      room._doorMap = doorMap;
    }

    const zt = room.zoneTiles;

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const cell = room.grid[y][x];
        if (cell === TILE.WALL || cell === TILE.WINDOW || cell === TILE.DOOR || cell === TILE.VOID) continue;

        const { sx, sy } = rawTileToScreen(x, y, origin.originX, origin.originY);
        const doorDef = doorMap.get(`${x},${y}`);

        let tex = null;
        if (doorDef?.elevator) {
          tex = this.getTexture('tile:elevator');
        } else if (doorDef) {
          tex = this.getTexture('tile:door');
        } else {
          let mat = room.floorMaterial || 'default';
          if (zt && x >= zt.x0 && x <= zt.x1 && y >= zt.y0 && y <= zt.y1 && zt.material) {
            mat = zt.material;
          }
          if (room.zones) {
            const match = room.zones.find((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
            if (match?.material) mat = match.material;
          }
          const ox = (x + y) % 2;
          const oy = (x * y) % 2;
          tex = (
            this.getTexture(`floor:room:${room.id}:${ox}:${oy}`) ||
            this.getTexture(`floor:mat:${mat}:${ox}:${oy}`) ||
            this.getTexture('floor:mat:marble:0:0')
          );
        }

        if (tex) {
          const spr = new Sprite(tex);
          spr.position.set(sx, sy);
          this.floorLayer.addChild(spr);
        }
      }
    }
  }

  resize(cssW, cssH, dpr = 1) {
    if (this.fallbackRenderer) {
      return this.fallbackRenderer.resize(cssW, cssH, dpr);
    }
    const res = super.resize(cssW, cssH, dpr);
    if (this.app && this.app.renderer) {
      this.app.renderer.resize(this.cssW, this.cssH, this.dpr);
    }
    return res;
  }

  setQuality(level = 'auto', ctxOpts = {}) {
    if (this.fallbackRenderer) {
      return this.fallbackRenderer.setQuality(level, ctxOpts);
    }
    const targetDetail = super.setQuality(level, ctxOpts);
    if (this.isReady && targetDetail !== this.loadedDetail) {
      this.loadAtlas(targetDetail).then(() => {
        if (this.currentRoom) {
          this.lastBuiltRoomKey = '';
          this.buildFloorChunks(this.currentRoom);
        }
      });
    }
    return targetDetail;
  }

  enterRoom(roomDef, placed = [], look = null, dpr = this.dpr) {
    this.currentRoom = roomDef;
    this.currentPlaced = placed;
    this.currentLook = look;
    if (this.fallbackRenderer) {
      this.fallbackRenderer.enterRoom(roomDef, placed, look, dpr);
      return;
    }
    if (this.isReady && roomDef) {
      this.buildFloorChunks(roomDef);
    }
  }

  renderFrame(frameState) {
    this.lastFrameState = frameState;
    if (this.fallbackRenderer) {
      this.fallbackRenderer.renderFrame(frameState);
      return;
    }

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

    if (!this.isReady || !this.app) {
      return;
    }

    if (frameState.room) {
      this.buildFloorChunks(frameState.room);
    }

    const cam = frameState.camera || { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 };
    const zoom = cam.zoom ?? 1;
    const panX = cam.panX ?? 0;
    const panY = cam.panY ?? 0;
    const cx = (frameState.width || this.cssW) / 2;
    const cy = (frameState.height || this.cssH) / 2;

    this.world.position.set(Math.round(cx + panX - cx * zoom), Math.round(cy + panY - cy * zoom));
    this.world.scale.set(zoom);

    this.app.render();
  }

  snapshot(type = 'image/png') {
    if (this.fallbackRenderer) return this.fallbackRenderer.snapshot(type);
    if (!this.canvas || typeof this.canvas.toDataURL !== 'function') return '';
    return this.canvas.toDataURL(type);
  }

  debugScene() {
    if (this.fallbackRenderer) return this.fallbackRenderer.debugScene();
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
    if (this.fallbackRenderer) {
      this.fallbackRenderer.destroy();
      return;
    }
    super.destroy();
    if (this.app) {
      try {
        this.app.destroy(false, { children: true, texture: false });
      } catch (_) {
        // ignore teardown errors
      }
      this.app = null;
    }
    this.textures.clear();
    this.sheets.length = 0;
    this.isReady = false;
  }
}
