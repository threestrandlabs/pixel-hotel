// tests/camera-parity.mjs
// Automated camera & scene parity test comparing LegacyCanvasRenderer vs PixiRenderer.
// Verifies scale, DPR/backing-store, pan origin, and elevator framing across:
//   - desktop_high: 1440x900, DPR 2
//   - mobile_low:   390x844,  DPR 3
// Saves screenshots and side-by-side comparisons into /workspace/ph-rework-shots/pixi/p2b/.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = process.env.OUT_DIR || '/workspace/ph-rework-shots/pixi/p2b';

const FLOORS = [
  'lobby',
  'cafe',
  'restaurant',
  'gym',
  'pool',
  'arcade',
  'library',
  'garden',
  'myroom',
  'rooftop',
];

const PROFILES = [
  {
    id: 'desktop_high',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    quality: 'high',
    tolerance: 2.0,
  },
  {
    id: 'mobile_low',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    quality: 'low',
    tolerance: 3.0,
  },
];

const COMPLAINT_CROPS = [
  { id: 'lobby_crevice', room: 'lobby', gx: 14.5, gy: 10.5, cropW: 160, cropH: 120 },
  { id: 'lobby_lamps', room: 'lobby', gx: 2.2, gy: 9.0, cropW: 160, cropH: 160 },
  { id: 'cafe_rugs', room: 'cafe', gx: 6.5, gy: 8.2, cropW: 220, cropH: 160 },
  { id: 'restaurant_sconces', room: 'restaurant', gx: 2.0, gy: 14.0, cropW: 160, cropH: 140 },
  { id: 'spa_partitions', room: 'pool', gx: 24.0, gy: 11.0, cropW: 180, cropH: 150 },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function decodePNG(buf) {
  let off = 8, w = 0, h = 0, colorType = 0;
  const idatParts = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    }
    off += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const stride = w * channels;
  const out = new Uint8Array(w * h * 4);
  let prevRow = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rp + x];
      const a = x >= channels ? row[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      row[x] = (rawByte + pred) & 0xff;
    }
    rp += stride;
    for (let x = 0; x < w; x++) {
      const so = x * channels;
      const dOff = (y * w + x) * 4;
      out[dOff] = row[so];
      out[dOff + 1] = channels >= 3 ? row[so + 1] : row[so];
      out[dOff + 2] = channels >= 3 ? row[so + 2] : row[so];
      out[dOff + 3] = channels === 4 ? row[so + 3] : 255;
    }
    prevRow = row;
  }
  return { width: w, height: h, data: out };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const fp = path.join(rootDir, rel);
      if (!fp.startsWith(rootDir) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fp);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function cropAndUpscale8x(img, cx, cy, cropW, cropH, scale = 8) {
  const x0 = Math.max(0, Math.min(img.width - cropW, Math.round(cx - cropW / 2)));
  const y0 = Math.max(0, Math.min(img.height - cropH, Math.round(cy - cropH / 2)));
  const outW = cropW * scale;
  const outH = cropH * scale;
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const si = ((y0 + y) * img.width + (x0 + x)) * 4;
      const r = img.data[si];
      const g = img.data[si + 1];
      const b = img.data[si + 2];
      const a = img.data[si + 3];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const di = ((y * scale + dy) * outW + (x * scale + dx)) * 4;
          out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = a;
        }
      }
    }
  }
  return { width: outW, height: outH, data: out };
}

export async function runCameraParityTest() {
  const { server, port } = await startStaticServer(ROOT);
  const browser = await chromium.launch({ headless: true });

  const summary = [];
  let failures = 0;

  try {
    for (const prof of PROFILES) {
      console.log(`\n========================================`);
      console.log(`Testing profile: ${prof.id} (${prof.viewport.width}x${prof.viewport.height} @ DPR ${prof.deviceScaleFactor})`);
      console.log(`========================================\n`);

      const legDir = path.join(OUT_DIR, 'legacy', prof.id);
      const pixDir = path.join(OUT_DIR, 'pixi', prof.id);
      const compDir = path.join(OUT_DIR, 'comparison', prof.id);
      fs.mkdirSync(legDir, { recursive: true });
      fs.mkdirSync(pixDir, { recursive: true });
      fs.mkdirSync(compDir, { recursive: true });

      const contexts = {};
      const pages = {};

      for (const ren of ['legacy', 'pixi']) {
        const ctx = await browser.newContext({
          viewport: prof.viewport,
          deviceScaleFactor: prof.deviceScaleFactor,
          isMobile: prof.isMobile,
          hasTouch: prof.hasTouch,
        });
        const page = await ctx.newPage();
        await page.goto(`http://127.0.0.1:${port}/?renderer=${ren}`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 10000 });
        await page.evaluate((q) => {
          document.getElementById('helpOverlay')?.classList.add('hidden');
          document.getElementById('hud')?.style.setProperty('display', 'none');
          document.getElementById('toast')?.classList.add('hidden');
          if (window.__pixelHotel.setBackgroundDetail) window.__pixelHotel.setBackgroundDetail(q);
          if (window.__pixelHotel.setSpriteDetail) window.__pixelHotel.setSpriteDetail(q);
          if (window.__pixelHotel.setDayPhase) window.__pixelHotel.setDayPhase(0.5);
          window.__pixelHotel.setEntitiesVisible(false);
        }, prof.quality);
        contexts[ren] = ctx;
        pages[ren] = page;
      }

      // Test all standard floors
      for (const floor of FLOORS) {
        for (const ren of ['legacy', 'pixi']) {
          await pages[ren].evaluate((f) => {
            window.__pixelHotel.takeElevator(f);
            window.__pixelHotel.resetZoom();
          }, floor);
          await pages[ren].waitForTimeout(650);
        }

        const legBuf = await pages.legacy.screenshot();
        const pixBuf = await pages.pixi.screenshot();

        fs.writeFileSync(path.join(legDir, `${floor}_default.png`), legBuf);
        fs.writeFileSync(path.join(pixDir, `${floor}_default.png`), pixBuf);

        const legImg = decodePNG(legBuf);
        const pixImg = decodePNG(pixBuf);

        // Compare and build side-by-side
        const w = legImg.width, h = legImg.height;
        let diffPx = 0;
        const sideBySide = new Uint8Array(w * 2 * h * 4);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const lr = legImg.data[idx], lg = legImg.data[idx+1], lb = legImg.data[idx+2];
            const pr = pixImg.data[idx], pg = pixImg.data[idx+1], pb = pixImg.data[idx+2];
            if (Math.max(Math.abs(lr - pr), Math.abs(lg - pg), Math.abs(lb - pb)) > 12) {
              diffPx++;
            }
            const o1 = (y * (w * 2) + x) * 4;
            sideBySide[o1] = lr; sideBySide[o1+1] = lg; sideBySide[o1+2] = lb; sideBySide[o1+3] = 255;
            const o2 = (y * (w * 2) + (x + w)) * 4;
            sideBySide[o2] = pr; sideBySide[o2+1] = pg; sideBySide[o2+2] = pb; sideBySide[o2+3] = 255;
          }
        }

        const pct = (diffPx / (w * h)) * 100;
        const pass = pct <= prof.tolerance;
        const verdict = pass ? `PASS (<= ${prof.tolerance}%)` : `FAIL (${pct.toFixed(2)}% > ${prof.tolerance}%)`;
        if (!pass) failures++;

        fs.writeFileSync(path.join(compDir, `sidebyside_${floor}_default.png`), encodePNG(w * 2, h, sideBySide));
        console.log(`[${prof.id}] ${floor}: diff=${pct.toFixed(2)}% -> ${verdict}`);
        summary.push({ prof: prof.id, shot: `${floor}_default`, pct, pass });
      }

      // Street view (lobby @ 0.7) and Tower view (rooftop @ 0.55)
      for (const view of [
        { id: 'view_street', floor: 'lobby', zoom: 0.7 },
        { id: 'view_tower', floor: 'rooftop', zoom: 0.55 },
      ]) {
        for (const ren of ['legacy', 'pixi']) {
          await pages[ren].evaluate(({ floor, zoom }) => {
            window.__pixelHotel.takeElevator(floor);
            window.__pixelHotel.setZoom(zoom);
          }, view);
          await pages[ren].waitForTimeout(650);
        }

        const legBuf = await pages.legacy.screenshot();
        const pixBuf = await pages.pixi.screenshot();
        fs.writeFileSync(path.join(legDir, `${view.id}.png`), legBuf);
        fs.writeFileSync(path.join(pixDir, `${view.id}.png`), pixBuf);

        const legImg = decodePNG(legBuf);
        const pixImg = decodePNG(pixBuf);
        const w = legImg.width, h = legImg.height;
        let diffPx = 0;
        const sideBySide = new Uint8Array(w * 2 * h * 4);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const lr = legImg.data[idx], lg = legImg.data[idx+1], lb = legImg.data[idx+2];
            const pr = pixImg.data[idx], pg = pixImg.data[idx+1], pb = pixImg.data[idx+2];
            if (Math.max(Math.abs(lr - pr), Math.abs(lg - pg), Math.abs(lb - pb)) > 12) diffPx++;
            const o1 = (y * (w * 2) + x) * 4;
            sideBySide[o1] = lr; sideBySide[o1+1] = lg; sideBySide[o1+2] = lb; sideBySide[o1+3] = 255;
            const o2 = (y * (w * 2) + (x + w)) * 4;
            sideBySide[o2] = pr; sideBySide[o2+1] = pg; sideBySide[o2+2] = pb; sideBySide[o2+3] = 255;
          }
        }
        const pct = (diffPx / (w * h)) * 100;
        const pass = pct <= prof.tolerance;
        const verdict = pass ? `PASS (<= ${prof.tolerance}%)` : `FAIL (${pct.toFixed(2)}% > ${prof.tolerance}%)`;
        if (!pass) failures++;
        fs.writeFileSync(path.join(compDir, `sidebyside_${view.id}.png`), encodePNG(w * 2, h, sideBySide));
        console.log(`[${prof.id}] ${view.id}: diff=${pct.toFixed(2)}% -> ${verdict}`);
        summary.push({ prof: prof.id, shot: view.id, pct, pass });
      }

      // 8x complaint crops on desktop_high
      if (prof.id === 'desktop_high') {
        const legCropsDir = path.join(OUT_DIR, 'legacy', 'crops_8x');
        const pixCropsDir = path.join(OUT_DIR, 'pixi', 'crops_8x');
        const compCropsDir = path.join(OUT_DIR, 'comparison', 'crops_8x');
        fs.mkdirSync(legCropsDir, { recursive: true });
        fs.mkdirSync(pixCropsDir, { recursive: true });
        fs.mkdirSync(compCropsDir, { recursive: true });

        for (const crop of COMPLAINT_CROPS) {
          const ptLeg = await pages.legacy.evaluate(({ room, gx, gy }) => {
            window.__pixelHotel.takeElevator(room);
            window.__pixelHotel.resetZoom();
            const s = window.__pixelHotel.tileToScreen(gx, gy);
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            return { x: (s.sx ?? s.x) * dpr, y: (s.sy ?? s.y) * dpr };
          }, crop);

          const ptPix = await pages.pixi.evaluate(({ room, gx, gy }) => {
            window.__pixelHotel.takeElevator(room);
            window.__pixelHotel.resetZoom();
            const s = window.__pixelHotel.tileToScreen(gx, gy);
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            return { x: (s.sx ?? s.x) * dpr, y: (s.sy ?? s.y) * dpr };
          }, crop);

          await pages.legacy.waitForTimeout(650);
          await pages.pixi.waitForTimeout(650);

          const legRaw = decodePNG(await pages.legacy.screenshot());
          const pixRaw = decodePNG(await pages.pixi.screenshot());

          const cLeg = cropAndUpscale8x(legRaw, ptLeg.x, ptLeg.y, crop.cropW, crop.cropH);
          const cPix = cropAndUpscale8x(pixRaw, ptPix.x, ptPix.y, crop.cropW, crop.cropH);

          fs.writeFileSync(path.join(legCropsDir, `${crop.id}_8x.png`), encodePNG(cLeg.width, cLeg.height, cLeg.data));
          fs.writeFileSync(path.join(pixCropsDir, `${crop.id}_8x.png`), encodePNG(cPix.width, cPix.height, cPix.data));

          const sideW = cLeg.width * 2;
          const sideH = cLeg.height;
          const sideCrop = new Uint8Array(sideW * sideH * 4);
          let cropDiffPx = 0;
          for (let y = 0; y < sideH; y++) {
            for (let x = 0; x < cLeg.width; x++) {
              const idx = (y * cLeg.width + x) * 4;
              const lr = cLeg.data[idx], lg = cLeg.data[idx+1], lb = cLeg.data[idx+2];
              const pr = cPix.data[idx], pg = cPix.data[idx+1], pb = cPix.data[idx+2];
              if (Math.max(Math.abs(lr - pr), Math.abs(lg - pg), Math.abs(lb - pb)) > 8) cropDiffPx++;
              const o1 = (y * sideW + x) * 4;
              sideCrop[o1] = lr; sideCrop[o1+1] = lg; sideCrop[o1+2] = lb; sideCrop[o1+3] = 255;
              const o2 = (y * sideW + (x + cLeg.width)) * 4;
              sideCrop[o2] = pr; sideCrop[o2+1] = pg; sideCrop[o2+2] = pb; sideCrop[o2+3] = 255;
            }
          }
          const cropPct = (cropDiffPx / (cLeg.width * sideH)) * 100;
          fs.writeFileSync(path.join(compCropsDir, `sidebyside_${crop.id}_8x.png`), encodePNG(sideW, sideH, sideCrop));
          console.log(`[8x crop] ${crop.id}: diff=${cropPct.toFixed(2)}%`);
        }
      }

      await contexts.legacy.close();
      await contexts.pixi.close();
    }

    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(`\n========================================`);
    console.log(`Parity test completed. Failures: ${failures}`);
    console.log(`Results written to: ${OUT_DIR}`);
    console.log(`========================================\n`);

    if (failures > 0) {
      throw new Error(`Camera parity test failed with ${failures} mismatched viewports`);
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCameraParityTest().catch((err) => {
    console.error('Parity test error:', err);
    process.exit(1);
  });
}
