// PixiJS Render Layer Implementation (PIXI_MIGRATION_PLAN.md §2.2–§2.8 / Phase P2).
// Draws the game in WebGL when ?renderer=pixi (or settings.renderer='pixi').
// Automatically falls back to LegacyCanvasRenderer if WebGL context creation fails.

import {
  computeOrigin, tileToScreen as rawTileToScreen, worldToScreen as rawWorldToScreen,
  screenToTile as rawScreenToTile, hitTestNpc as rawHitTestNpc, getItemIconDataUrl as rawGetItemIconDataUrl,
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, clampZoom, getSeatConfig, entityScreenBounds,
  getTowerCutawayUnder, getTowerCutawayOver, getRoomLightMap, dayNightColors, lerpColor,
} from '../../render.js';
import { getDetail } from '../../pixelart.js';
import { TILE, getCatalogueItem } from '../../data.js';
import { LOOKS, getCharacterCanvas } from '../../voxel.js';
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
    this.floorTilesContainer = null;
    this.floorDecalsContainer = null;
    this.wallsLayer = null;
    this.worldSorted = null;
    this.fxLayer = null;
    this.towerOver = null;
    this.overlayLayer = null;

    this.textures = new Map();
    this.sheets = [];
    this.loadedDetail = null;
    this.lastBuiltRoomKey = '';
    this.lastBuiltFurnitureKey = '';
    this.furnitureSprites = [];
    this.entitySprites = new Map();
    this.entityShadowGraphics = null;
    this.entityFxGraphics = null;
    this.charTextureCache = new Map();
    this.towerUnderSprite = null;
    this.towerOverSprite = null;
    this.tintGraphics = null;
    this.lightMapSprite = null;
    this.overlayGraphics = null;
    this.screenOverlay = null;
    this.elevatorGraphics = null;
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
      this.floorTilesContainer = new Container();
      this.floorDecalsContainer = new Container();
      this.floorLayer.addChild(this.floorTilesContainer);
      this.floorLayer.addChild(this.floorDecalsContainer);

      this.entityShadowGraphics = new Graphics();
      this.floorDecalsContainer.addChild(this.entityShadowGraphics);

      this.wallsLayer = new Container();
      this.wallsLayer.roundPixels = true;

      this.worldSorted = new Container();
      this.worldSorted.sortableChildren = true;
      this.worldSorted.roundPixels = true;

      this.entityFxGraphics = new Graphics();
      this.worldSorted.addChild(this.entityFxGraphics);

      this.fxLayer = new Container();
      this.towerOver = new Container();
      this.overlayLayer = new Container();

      this.world.addChild(this.towerUnder);
      this.world.addChild(this.floorLayer);
      this.world.addChild(this.wallsLayer);
      this.world.addChild(this.worldSorted);
      this.world.addChild(this.fxLayer);
      this.world.addChild(this.towerOver);
      this.world.addChild(this.overlayLayer);

      this.towerUnderSprite = new Sprite();
      this.towerUnder.addChild(this.towerUnderSprite);

      this.towerOverSprite = new Sprite();
      this.towerOver.addChild(this.towerOverSprite);

      this.tintGraphics = new Graphics();
      this.fxLayer.addChild(this.tintGraphics);

      this.lightMapSprite = new Sprite();
      this.fxLayer.addChild(this.lightMapSprite);

      this.overlayGraphics = new Graphics();
      this.overlayLayer.addChild(this.overlayGraphics);

      this.screenOverlay = new Container();
      this.stage.addChild(this.screenOverlay);

      this.elevatorGraphics = new Graphics();
      this.screenOverlay.addChild(this.elevatorGraphics);

      // Ingest pre-baked atlas pages
      await this.loadAtlas(getDetail());

      this.backend = 'pixi';
      this.fallbackReason = null;
      this.isReady = true;

      if (this.currentRoom) {
        this.buildFloorChunks(this.currentRoom);
        this.buildWalls(this.currentRoom);
        this.buildFurniture(this.currentRoom, this.currentPlaced || [], true);
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
    if (!room || !this.floorTilesContainer || !this.PIXI) return;
    const { Sprite } = this.PIXI;
    const origin = computeOrigin(room, this.cssW, this.cssH);
    const key = `${room.id}:${origin.originX},${origin.originY}:${this.loadedDetail}`;
    if (this.lastBuiltRoomKey === key) return;
    this.lastBuiltRoomKey = key;

    this.floorTilesContainer.removeChildren();

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
          this.floorTilesContainer.addChild(spr);
        }
      }
    }
  }

  buildWalls(room) {
    if (!room || !this.wallsLayer || !this.PIXI) return;
    const { Sprite } = this.PIXI;
    const origin = computeOrigin(room, this.cssW, this.cssH);
    this.wallsLayer.removeChildren();

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const cell = room.grid[y][x];
        if (cell !== TILE.WALL && cell !== TILE.WINDOW && cell !== TILE.DOOR) continue;
        if (x === 0 && y === 0) continue;
        const kind = y === 0 ? 'north' : 'west';
        const { sx, sy } = rawTileToScreen(kind === 'north' ? x : 1, kind === 'north' ? 1 : y, origin.originX, origin.originY);

        let frameKey;
        const isRooftopHousing = room.isRooftop && y === 0 && x >= 4 && x <= 14;
        if (room.isRooftop && !isRooftopHousing) {
          frameKey = `balustrade:default:${kind}`;
        } else if (cell === TILE.WINDOW) {
          frameKey = `window:room:${room.id}:${kind}`;
        } else if (cell === TILE.DOOR) {
          frameKey = `door:default:${kind}`;
        } else {
          frameKey = `wall:room:${room.id}:${kind}`;
        }

        let tex = this.getTexture(frameKey);
        if (!tex) {
          if (cell === TILE.WINDOW) tex = this.getTexture(`window:default:${kind}`);
          else if (cell === TILE.DOOR) tex = this.getTexture(`door:default:${kind}`);
          else tex = this.getTexture(`wall:default:${kind}`);
        }

        if (tex) {
          const spr = new Sprite(tex);
          spr.position.set(sx, sy);
          this.wallsLayer.addChild(spr);
        }
      }
    }
  }

  buildFurniture(room, placedFurniture = [], lightsOn = true, occupiedSeats = new Map()) {
    if (!room || !this.worldSorted || !this.PIXI) return;
    const { Sprite, Graphics } = this.PIXI;
    const origin = computeOrigin(room, this.cssW, this.cssH);

    for (const spr of this.furnitureSprites) {
      spr.destroy?.();
    }
    this.furnitureSprites = [];
    if (this.floorDecalsContainer) {
      this.floorDecalsContainer.removeChildren();
    }

    const shadowG = new Graphics();
    if (this.floorDecalsContainer) {
      this.floorDecalsContainer.addChild(shadowG);
    }

    for (const f of placedFurniture) {
      const item = getCatalogueItem(f.itemId);
      const rot = ((f.rot || 0) % 4 + 4) % 4;
      const spriteKey = item?.spriteKey || item?.sprite || f.itemId;
      const tw = f.footprint?.w || 1;
      const th = f.footprint?.h || 1;
      const anchorX = f.x + tw / 2 - 0.5;
      const anchorY = f.y + th / 2 - 0.5;
      const { sx, sy } = rawTileToScreen(anchorX, anchorY, origin.originX, origin.originY);

      if (item?.flat || f.itemId === 'pool_water') {
        const frameKey = `furn:${spriteKey}:${rot}:all`;
        const tex = this.getTexture(frameKey) || this.getTexture(`furn:${f.itemId}:${rot}:all`);
        if (tex && this.floorDecalsContainer) {
          const spr = new Sprite(tex);
          spr.position.set(sx, sy);
          this.floorDecalsContainer.addChild(spr);
        }
        continue;
      }

      // Footprint contact shadow
      const rx = (tw + th) * 11;
      const ry = (tw + th) * 5.5;
      shadowG.ellipse(sx + 2, sy + 1, rx, ry);
      shadowG.fill({ color: 0x180c24, alpha: 0.22 });

      const frontX = f.x + (tw - 1);
      const frontY = f.y + (th - 1);
      const isOverhead = Boolean(item?.overhead);
      const offTag = !lightsOn && item?.lightSource ? ':off' : '';

      const occ = occupiedSeats.get(f);
      const isSplitSeat = occ && occ.config.layerOrder.length === 3 && occ.config.layerOrder[2] === 'front';

      if (isSplitSeat) {
        const texBack = (
          this.getTexture(`furn:${spriteKey}:${rot}:back${offTag}`) ||
          this.getTexture(`furn:${f.itemId}:${rot}:back${offTag}`) ||
          this.getTexture(`furn:${spriteKey}:${rot}:back`) ||
          this.getTexture(`furn:${f.itemId}:${rot}:back`)
        );
        const texFront = (
          this.getTexture(`furn:${spriteKey}:${rot}:front${offTag}`) ||
          this.getTexture(`furn:${f.itemId}:${rot}:front${offTag}`) ||
          this.getTexture(`furn:${spriteKey}:${rot}:front`) ||
          this.getTexture(`furn:${f.itemId}:${rot}:front`)
        );
        if (texBack && texFront) {
          const sprBack = new Sprite(texBack);
          sprBack.position.set(sx, sy);
          sprBack.zIndex = Math.round((frontX + frontY - 0.05) * 1024);
          sprBack._furnitureData = f;
          sprBack._isCanopy = f.itemId === 'pool_umbrella' || f.itemId === 'canopy_bed';
          sprBack._anchorX = anchorX;
          sprBack._anchorY = anchorY;
          this.worldSorted.addChild(sprBack);
          this.furnitureSprites.push(sprBack);

          const sprFront = new Sprite(texFront);
          sprFront.position.set(sx, sy);
          sprFront.zIndex = Math.round((frontX + frontY + 0.15) * 1024);
          sprFront._furnitureData = f;
          sprFront._isCanopy = f.itemId === 'pool_umbrella' || f.itemId === 'canopy_bed';
          sprFront._anchorX = anchorX;
          sprFront._anchorY = anchorY;
          this.worldSorted.addChild(sprFront);
          this.furnitureSprites.push(sprFront);
          continue;
        }
      }

      const texAll = (
        this.getTexture(`furn:${spriteKey}:${rot}:all${offTag}`) ||
        this.getTexture(`furn:${f.itemId}:${rot}:all${offTag}`) ||
        this.getTexture(`furn:${spriteKey}:${rot}:all`) ||
        this.getTexture(`furn:${f.itemId}:${rot}:all`)
      );

      if (texAll) {
        const spr = new Sprite(texAll);
        spr.position.set(sx, sy);
        spr.zIndex = isOverhead ? 999999 : (frontX + frontY) * 1024;
        spr._furnitureData = f;
        spr._isCanopy = f.itemId === 'pool_umbrella' || f.itemId === 'canopy_bed';
        spr._anchorX = anchorX;
        spr._anchorY = anchorY;
        this.worldSorted.addChild(spr);
        this.furnitureSprites.push(spr);
      }
    }

    if (room.openEdges) {
      const southY = room.height - 1;
      const eastX = room.width - 1;
      for (let x = 0; x < room.width; x++) {
        if (room.grid[southY][x] === TILE.VOID) continue;
        if (room.doors.some((d) => d.x === x && d.y === southY)) continue;
        const { sx, sy } = rawTileToScreen(x, southY, origin.originX, origin.originY);
        const tex = this.getTexture('edge_rail:default:south');
        if (tex) {
          const spr = new Sprite(tex);
          spr.position.set(sx, sy);
          spr.zIndex = (x + southY) * 1024 - 100;
          this.worldSorted.addChild(spr);
          this.furnitureSprites.push(spr);
        }
      }
      for (let y = 0; y < room.height; y++) {
        if (room.grid[y][eastX] === TILE.VOID) continue;
        if (room.doors.some((d) => d.x === eastX && d.y === y)) continue;
        const { sx, sy } = rawTileToScreen(eastX, y, origin.originX, origin.originY);
        const tex = this.getTexture('edge_rail:default:west');
        if (tex) {
          const spr = new Sprite(tex);
          spr.position.set(sx, sy);
          spr.zIndex = (eastX + y) * 1024 - 100;
          this.worldSorted.addChild(spr);
          this.furnitureSprites.push(spr);
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
      this.buildWalls(roomDef);
      this.buildFurniture(roomDef, placed, true);
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

    const room = frameState.room || this.currentRoom;
    const placed = frameState.placedFurniture || this.currentPlaced || [];
    const lightsOn = frameState.lightsOn !== false;

    if (room) {
      this.buildFloorChunks(room);
      this.buildWalls(room);
    }

    const occupiedSeats = new Map();
    if (frameState.entities) {
      for (const e of frameState.entities) {
        if (e.sitting) {
          let seat = null;
          if (typeof e.sitting === 'string') {
            seat = placed.find((f) => f.instanceId === e.sitting);
          }
          if (!seat) {
            const ex = Math.round(e.x);
            const ey = Math.round(e.y);
            seat = placed.find((f) => Math.abs(f.x - ex) <= 1 && Math.abs(f.y - ey) <= 1 && getCatalogueItem(f.itemId)?.seat);
          }
          if (seat) {
            const seatCfg = getSeatConfig(seat.itemId, seat.rot);
            e.seatYOffset = seatCfg.yOffset;
            occupiedSeats.set(seat, { entity: e, config: seatCfg });
          }
        }
      }
    }

    const occKey = Array.from(occupiedSeats.keys()).map((f) => f.instanceId || `${f.x},${f.y}`).sort().join(';');
    const furnKey = `${room?.id || ''}:${placed.length}:${lightsOn ? 'L' : 'D'}:${this.loadedDetail}:${occKey}`;
    if (this.lastBuiltFurnitureKey !== furnKey) {
      this.lastBuiltFurnitureKey = furnKey;
      this.buildFurniture(room, placed, lightsOn, occupiedSeats);
    }

    const localPlayer = frameState.entities?.find((e) => e.isPlayer || e.id === 'player');
    if (localPlayer && this.furnitureSprites) {
      for (const spr of this.furnitureSprites) {
        if (spr._isCanopy) {
          const d = Math.hypot(spr._anchorX - localPlayer.x, spr._anchorY - localPlayer.y);
          spr.alpha = d < 1.5 ? 0.35 : 1.0;
        }
      }
    }

    const cam = frameState.camera || { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 };
    const zoom = cam.zoom ?? 1;
    const panX = cam.panX ?? 0;
    const panY = cam.panY ?? 0;
    const cx = (frameState.width || this.cssW) / 2;
    const cy = (frameState.height || this.cssH) / 2;

    this.world.position.set(Math.round(cx + panX - cx * zoom), Math.round(cy + panY - cy * zoom));
    this.world.scale.set(zoom);

    if (room) {
      const origin = computeOrigin(room, frameState.width || this.cssW, frameState.height || this.cssH);
      this.updateCutaway(
        room,
        origin,
        frameState.width || this.cssW,
        frameState.height || this.cssH,
        frameState.phase ?? 0.5,
        this.dpr,
      );
      this.updateFx(
        room,
        placed,
        origin,
        lightsOn,
        frameState.phase ?? 0.5,
      );
      this.updateOverlays(frameState, origin);
      this.updateEntities(
        frameState.entities || [],
        room,
        origin,
        cam,
        frameState.width || this.cssW,
        frameState.height || this.cssH,
        this.dpr,
        frameState.now || 0,
      );
    }
    this.updateElevator(
      frameState.elevatorAnim,
      frameState.width || this.cssW,
      frameState.height || this.cssH,
      frameState.now || 0,
    );

    this.app.render();
  }

  updateCutaway(room, origin, width, height, phase, dpr) {
    if (!room || !this.PIXI) return;
    const { Texture } = this.PIXI;
    const under = getTowerCutawayUnder(room, origin.originX, origin.originY, width, height, phase, 1);
    if (under?.canvas && this.towerUnderSprite) {
      this.towerUnderSprite.texture = Texture.from(under.canvas);
      this.towerUnderSprite.position.set(under.minX, under.minY);
      this.towerUnderSprite.visible = true;
    } else if (this.towerUnderSprite) {
      this.towerUnderSprite.visible = false;
    }

    const over = getTowerCutawayOver(room, origin.originX, origin.originY, width, height, 1);
    if (over?.canvas && this.towerOverSprite) {
      this.towerOverSprite.texture = Texture.from(over.canvas);
      this.towerOverSprite.position.set(over.minX, over.minY);
      this.towerOverSprite.visible = true;
    } else if (this.towerOverSprite) {
      this.towerOverSprite.visible = false;
    }
  }

  updateFx(room, placed, origin, lightsOn, phase) {
    if (!this.PIXI || !this.tintGraphics || !this.lightMapSprite) return;
    const { Texture } = this.PIXI;
    const { tintAlpha } = dayNightColors(phase);
    const roomAmbient = room?.ambientLighting;
    const effectiveTintAlpha = Math.max(tintAlpha, roomAmbient ? (roomAmbient.darkness || 0.3) : 0);
    const effectiveTintColor = (tintAlpha > 0.02)
      ? (roomAmbient ? lerpColor('#5b6bb0', roomAmbient.tint || '#261420', 0.5) : '#5b6bb0')
      : (roomAmbient?.tint || '#261420');

    this.tintGraphics.clear();
    if (effectiveTintAlpha > 0.02) {
      const viewMinX = origin.originX - 1600;
      const viewMaxX = origin.originX + 1600;
      const viewMinY = origin.originY - 1200;
      const viewMaxY = origin.originY + 1600;
      const col = parseInt(effectiveTintColor.replace('#', ''), 16);
      this.tintGraphics.rect(viewMinX, viewMinY, viewMaxX - viewMinX, viewMaxY - viewMinY);
      this.tintGraphics.fill({ color: col, alpha: effectiveTintAlpha });
      this.tintGraphics.blendMode = 'multiply';
      this.tintGraphics.visible = true;

      const lightStrength = Math.max(
        Math.min(1, tintAlpha / 0.32),
        roomAmbient?.warmGlow ? (roomAmbient.darkness || 0.35) * 2.2 : 0,
      );
      if (lightStrength > 0.01 && room) {
        const lm = getRoomLightMap(room, placed, origin.originX, origin.originY, lightsOn, 1);
        if (lm && lm.canvas) {
          this.lightMapSprite.texture = Texture.from(lm.canvas);
          this.lightMapSprite.position.set(lm.minX, lm.minY);
          const s = 1 / (lm.scale || 0.25);
          this.lightMapSprite.scale.set(s, s);
          this.lightMapSprite.blendMode = 'screen';
          this.lightMapSprite.alpha = lightStrength;
          this.lightMapSprite.visible = true;
        } else {
          this.lightMapSprite.visible = false;
        }
      } else {
        this.lightMapSprite.visible = false;
      }
    } else {
      this.tintGraphics.visible = false;
      this.lightMapSprite.visible = false;
    }
  }

  drawDiamond(g, sx, sy, scale = 1) {
    const hw = 32 * scale;
    const hh = 16 * scale;
    g.moveTo(sx, sy - hh);
    g.lineTo(sx + hw, sy);
    g.lineTo(sx, sy + hh);
    g.lineTo(sx - hw, sy);
    g.closePath();
  }

  updateOverlays(frameState, origin) {
    if (!this.overlayGraphics) return;
    this.overlayGraphics.clear();

    if (frameState.hoverTile) {
      const { sx, sy } = rawTileToScreen(frameState.hoverTile.x, frameState.hoverTile.y, origin.originX, origin.originY);
      this.drawDiamond(this.overlayGraphics, sx, sy, 1);
      this.overlayGraphics.fill({ color: 0xfff6c9, alpha: 0.35 });
    }

    if (frameState.ghost && frameState.ghost.cells) {
      for (const c of frameState.ghost.cells) {
        const { sx, sy } = rawTileToScreen(c.x, c.y, origin.originX, origin.originY);
        this.drawDiamond(this.overlayGraphics, sx, sy, 1);
        this.overlayGraphics.fill({ color: frameState.ghost.valid ? 0x7cfc9a : 0xff6b6b, alpha: 0.45 });
      }
    }

    if (frameState.walkTarget) {
      const wt = frameState.walkTarget;
      const { sx, sy } = rawTileToScreen(wt.x, wt.y, origin.originX, origin.originY);
      const age = Math.max(0, (frameState.now || 0) - wt.bornAt);
      if (wt.blocked) {
        if (age <= 420) {
          const alpha = 0.55 * (1 - age / 420);
          this.drawDiamond(this.overlayGraphics, sx, sy, 1);
          this.overlayGraphics.fill({ color: 0xff5050, alpha });
          this.drawDiamond(this.overlayGraphics, sx, sy, 1);
          this.overlayGraphics.stroke({ color: 0x7a1414, alpha, width: 2 });
        }
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(age / 260);
        this.drawDiamond(this.overlayGraphics, sx, sy, 1);
        this.overlayGraphics.fill({ color: 0xffe9a8, alpha: 0.16 + pulse * 0.14 });

        this.drawDiamond(this.overlayGraphics, sx, sy, 0.96);
        this.overlayGraphics.stroke({ color: 0x14100a, alpha: 0.8 * 0.75, width: 3 });

        this.drawDiamond(this.overlayGraphics, sx, sy, 0.96);
        this.overlayGraphics.stroke({ color: 0xfff6d8, alpha: 0.9, width: 1.4 });

        if (age < 360) {
          const rt = age / 360;
          this.drawDiamond(this.overlayGraphics, sx, sy, 0.3 + rt * 0.9);
          this.overlayGraphics.stroke({ color: 0xfff6d8, alpha: 0.5 * (1 - rt), width: 2 });
        }
      }
    }
  }

  updateElevator(anim, width, height, now) {
    if (!this.elevatorGraphics) return;
    this.elevatorGraphics.clear();
    if (!anim) {
      this.elevatorGraphics.visible = false;
      return;
    }
    const t = Math.max(0, Math.min(1, (now - anim.start) / anim.duration));
    const closeAmt = Math.sin(t * Math.PI);
    if (closeAmt <= 0.01) {
      this.elevatorGraphics.visible = false;
      return;
    }
    this.elevatorGraphics.visible = true;
    const panelW = Math.round((width * 0.52) * closeAmt);
    this.elevatorGraphics.rect(0, 0, panelW, height);
    this.elevatorGraphics.rect(width - panelW, 0, panelW, height);
    this.elevatorGraphics.fill({ color: 0x121020, alpha: 0.88 });

    this.elevatorGraphics.rect(panelW - 4, 0, 4, height);
    this.elevatorGraphics.rect(width - panelW, 0, 4, height);
    this.elevatorGraphics.fill({ color: 0xd8a848 });

    const boxW = 220;
    const boxH = 68;
    const bx = Math.round((width - boxW) / 2);
    const by = Math.round(height * 0.16);
    this.elevatorGraphics.roundRect(bx, by, boxW, boxH, 10);
    this.elevatorGraphics.fill({ color: 0x18122c, alpha: 0.96 });
    this.elevatorGraphics.stroke({ color: 0xffd27a, width: 2.5 });
  }

  updateEntities(entities, room, origin, camera, width, height, dpr, now) {
    entityScreenBounds.clear();
    if (!this.worldSorted || !this.PIXI) return;
    const { Sprite, Texture } = this.PIXI;
    const zoom = camera?.zoom ?? 1;

    if (this.entityShadowGraphics) {
      this.entityShadowGraphics.clear();
    }
    if (this.entityFxGraphics) {
      this.entityFxGraphics.clear();
    }

    const seenIds = new Set();

    for (const e of entities) {
      seenIds.add(e.id);
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
        expression: e.expression || null,
      };
      const lookKey = e.look ? (e.look._cachedKey || (e.look._cachedKey = JSON.stringify(e.look))) : '';
      const key = `${e.spriteKey}:${e.color}:${isSwimsuit ? 'swim' : 'norm'}:${lookKey}:${e.emote || ''}:${Math.floor((e.emoteFrame || 0) * 2) % 12}:${e.expression || ''}`;
      const charBake = getCharacterCanvas(key, look, e.dir || 'down', pose, 1);
      const { canvas, ox, oy, cssH } = charBake;

      let tex = this.charTextureCache.get(canvas);
      if (!tex) {
        tex = Texture.from(canvas);
        if (tex.source) tex.source.scaleMode = 'nearest';
        this.charTextureCache.set(canvas, tex);
      }

      let record = this.entitySprites.get(e.id);
      if (!record) {
        const spr = new Sprite(tex);
        this.worldSorted.addChild(spr);
        record = { sprite: spr, reflectionSprite: null };
        this.entitySprites.set(e.id, record);
      } else {
        record.sprite.texture = tex;
        record.sprite.visible = true;
      }

      const { sx, sy } = rawTileToScreen(e.x, e.y, origin.originX, origin.originY);
      const charY = sy + (e.seatYOffset || 0);
      const dx = sx - ox;
      const dy = charY - oy;
      record.sprite.position.set(dx, dy);
      record.sprite.zIndex = Math.round((e.depth ?? (e.x + e.y + 0.5)) * 1024);

      // Footprint contact shadow
      if (!e.sitting && !pose.lie && e.action !== 'swim' && this.entityShadowGraphics) {
        this.entityShadowGraphics.ellipse(sx + 1.5, sy + 1, 13.5, 6.5);
        this.entityShadowGraphics.fill({ color: 0x2a1636, alpha: 0.18 });
      }

      // Gym mirror reflection
      if (room?.id === 'gym' && e.y <= 3.4 && e.x >= 2 && e.x <= 12) {
        if (!record.reflectionSprite) {
          record.reflectionSprite = new Sprite(tex);
          this.worldSorted.addChild(record.reflectionSprite);
        }
        const ref = record.reflectionSprite;
        ref.texture = tex;
        ref.visible = true;
        ref.alpha = 0.25;
        ref.position.set(sx, sy - 26);
        ref.scale.set(-0.85, 0.85);
        ref.anchor.set(canvas.width ? ox / canvas.width : 0.5, canvas.height ? oy / canvas.height : 0.5);
        ref.zIndex = Math.round((e.x + 0.1) * 1024 - 10);
      } else if (record.reflectionSprite) {
        record.reflectionSprite.visible = false;
      }

      // Treadmill action lines / sweat droplets / culinary aroma wisps
      if (e.action === 'treadmill' && this.entityFxGraphics) {
        const shift = (e.actionFrame || 0) * 3;
        for (let i = -1; i <= 1; i++) {
          const bx = sx + i * 7 - 4 + (shift % 6);
          const by = sy + 2 + i * 3;
          this.entityFxGraphics.moveTo(bx - 5, by - 2.5);
          this.entityFxGraphics.lineTo(bx + 5, by + 2.5);
          this.entityFxGraphics.stroke({ color: 0x58e2ff, alpha: 0.72, width: 2 });
        }
        const dropShift = ((e.actionFrame || 0) % 2) * 3;
        this.entityFxGraphics.circle(sx + 16, dy + 14 + dropShift, 2.2);
        this.entityFxGraphics.circle(sx - 16, dy + 17 - dropShift, 1.8);
        this.entityFxGraphics.fill({ color: 0x7ce8ff });
      } else if (e.action === 'eat' && this.entityFxGraphics) {
        const wisp = ((e.actionFrame || 0) % 2) * 2.5;
        for (const wx of [sx - 11, sx + 11]) {
          this.entityFxGraphics.moveTo(wx, dy + 22 - wisp);
          this.entityFxGraphics.quadraticCurveTo(wx + 3, dy + 17 - wisp, wx, dy + 12 - wisp);
          this.entityFxGraphics.stroke({ color: 0xffecb4, alpha: 0.82, width: 1.6 });
        }
      } else if (e.action === 'swim' && this.entityFxGraphics) {
        this.entityFxGraphics.ellipse(sx, sy - 2, 20, 9.5);
        this.entityFxGraphics.fill({ color: 0x2abcD4, alpha: 0.58 });

        const ringPhase = (e.actionFrame || 0) % 4;
        this.entityFxGraphics.ellipse(sx, sy - 2, 14 + ringPhase * 2.5, 6.5 + ringPhase * 1.1);
        this.entityFxGraphics.stroke({ color: 0xdcfcff, alpha: 0.88, width: 1.6 });

        this.entityFxGraphics.ellipse(sx, sy - 2, 21 + ((ringPhase + 2) % 4) * 2, 9.5 + ((ringPhase + 2) % 4) * 0.9);
        this.entityFxGraphics.stroke({ color: 0x8ceefc, alpha: 0.55, width: 1.2 });

        const splashSide = (ringPhase % 2 === 0) ? -1 : 1;
        for (const [sxOff, syOff, r] of [[splashSide * 15, -10, 2.2], [splashSide * 19, -6, 1.6], [-splashSide * 13, -7, 1.5]]) {
          this.entityFxGraphics.circle(sx + sxOff, sy + syOff, r);
          this.entityFxGraphics.fill({ color: 0xe8fcff });
        }
      }

      // Update entityScreenBounds for hitTestNpc
      const bbox = { x: sx, y: dy, footY: charY + 11, w: 0, h: cssH || canvas.height };
      const sPt = rawWorldToScreen(bbox.x, bbox.y, camera, width, height);
      const hw = Math.round(20 * zoom);
      const hh = Math.round((bbox.h || 52) * zoom);
      entityScreenBounds.set(e.id, {
        id: e.id,
        x0: sPt.sx - hw,
        y0: sPt.sy,
        x1: sPt.sx + hw,
        y1: sPt.sy + hh,
        entity: e,
        footScreen: rawWorldToScreen(bbox.x, bbox.footY, camera, width, height),
        headScreen: rawWorldToScreen(bbox.x, bbox.y, camera, width, height),
      });
    }

    for (const [id, record] of this.entitySprites) {
      if (!seenIds.has(id)) {
        record.sprite.visible = false;
        if (record.reflectionSprite) record.reflectionSprite.visible = false;
      }
    }
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
    this.furnitureSprites = [];
    for (const record of this.entitySprites.values()) {
      record.sprite?.destroy?.();
      record.reflectionSprite?.destroy?.();
    }
    this.entitySprites.clear();
    this.charTextureCache.clear();
    this.lastBuiltFurnitureKey = '';
    this.isReady = false;
  }
}
