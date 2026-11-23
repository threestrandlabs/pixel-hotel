// js/city-worker.js
// Offscreen Web Worker for 512px chunked city backdrop baking (PIXI_MIGRATION_PLAN.md §2.8 / Phase P2).

import { renderSkylineToCanvas } from './render.js';
import { snapBakeCtx } from './bakeSnap.js';

self.onmessage = async (e) => {
  const { jobId, width, height, phase, floor, room, ox, oy, scale = 1, chunkSize = 512 } = e.data;
  const bgScale = scale;
  const totalW = Math.max(1, Math.round((width + 2 * ox) * bgScale));
  const totalH = Math.max(1, Math.round((height + 2 * oy) * bgScale));

  const layers = ['ground', 'buildings', 'sky'];

  for (const layer of layers) {
    let allBeacons = [];
    const numChunksX = Math.ceil(totalW / chunkSize);
    const numChunksY = Math.ceil(totalH / chunkSize);

    for (let cy = 0; cy < numChunksY; cy++) {
      for (let cx = 0; cx < numChunksX; cx++) {
        const x0 = cx * chunkSize;
        const y0 = cy * chunkSize;
        const cw = Math.min(chunkSize, totalW - x0);
        const ch = Math.min(chunkSize, totalH - y0);

        const off = new OffscreenCanvas(cw, ch);
        const g = off.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.setTransform(bgScale, 0, 0, bgScale, ox * bgScale - x0, oy * bgScale - y0);
        snapBakeCtx(g, bgScale);

        const beacons = renderSkylineToCanvas(g, width, height, phase, floor, room, ox, oy, layer);
        if (layer === 'buildings' && Array.isArray(beacons)) {
          allBeacons = beacons;
        }

        const bitmap = off.transferToImageBitmap();
        self.postMessage(
          {
            jobId,
            layer,
            x0,
            y0,
            cw,
            ch,
            bitmap,
            beacons: (cx === 0 && cy === 0 && layer === 'buildings') ? allBeacons : null,
          },
          [bitmap]
        );
      }
    }
  }

  self.postMessage({ jobId, done: true });
};

