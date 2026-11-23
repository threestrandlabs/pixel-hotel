// Renderer seam (Phase 0 of PIXI_MIGRATION_PLAN.md §2.1).
// Pulls every render.js call out of main.js into a single interface:
//   init(canvasHost, opts), setQuality(level, ctxOpts), enterRoom(roomDef, placed, look, dpr),
//   renderFrame(frameState), worldToScreen(...), screenToTile(...), resize(cssW, cssH, dpr),
//   snapshot(), debugScene(), destroy()
// Default renderer is 'legacy' until Phase 3. Selecting 'pixi' via ?renderer=pixi or
// settings.renderer='pixi' uses PixiRenderer which falls back cleanly to
// LegacyCanvasRenderer if WebGL context creation fails.

export {
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, clampZoom, zoomAtPoint, centerCameraOnTile, deadzoneCameraTarget,
  computeOrigin, tileToScreen, worldToScreen, screenToTile, hitTestNpc, getItemIconDataUrl,
  LegacyCanvasRenderer, wantedBgScale, requiredCityMargin,
} from './legacy.js';

import { LegacyCanvasRenderer } from './legacy.js';
import { PixiRenderer } from './pixi/index.js';
export { PixiRenderer };

export function resolveRendererChoice(search = '', settings = null) {
  if (typeof search === 'string' && search.length > 0) {
    try {
      const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
      const q = (params.get('renderer') || '').toLowerCase();
      if (q === 'pixi' || q === 'legacy') return q;
    } catch (_) {
      // ignore malformed query string
    }
  }
  const s = String(settings?.renderer || '').toLowerCase();
  if (s === 'pixi' || s === 'legacy') return s;
  return 'legacy';
}

export function createRenderer(opts = {}) {
  const choice = opts.renderer || resolveRendererChoice(opts.search, opts.settings);
  if (choice === 'pixi') {
    return new PixiRenderer({ ...opts, requestedRenderer: 'pixi' });
  }
  return new LegacyCanvasRenderer({ ...opts, requestedRenderer: 'legacy' });
}
