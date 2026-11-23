// Phase 0/1..6 Automated In-Game Visual Screenshot & 8x Crop Gate (PIXI_MIGRATION_PLAN.md §5).
// Captures every floor at default zoom and max zoom-in, street-level view, tower view,
// and 8x nearest-neighbour crops around complaint items across both profiles:
//   - desktop_high: 1440x900, DPR 2
//   - mobile_low:   390x844,  DPR 3
// Saved to shots/<version>/gate/ (or --out=<dir>).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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
  },
  {
    id: 'mobile_low',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    quality: 'low',
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
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function decodePNG(buf) {
  let off = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
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
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function cropAndUpscale8x(pngBuf, centerX, centerY, cropW, cropH) {
  const img = decodePNG(pngBuf);
  const x0 = Math.max(0, Math.min(img.width - cropW, Math.round(centerX - cropW / 2)));
  const y0 = Math.max(0, Math.min(img.height - cropH, Math.round(centerY - cropH / 2)));
  const scale = 8;
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
          out[di] = r;
          out[di + 1] = g;
          out[di + 2] = b;
          out[di + 3] = a;
        }
      }
    }
  }
  return encodePNG(outW, outH, out);
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

function parseArgs(argv) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const verTag = `v${pkg.version.replace(/\./g, '')}`;
  const args = {
    out: path.join(ROOT, 'shots', verTag, 'gate'),
    renderer: null,
    floors: FLOORS,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--out=')) args.out = path.resolve(a.slice('--out='.length));
    else if (a.startsWith('--renderer=')) args.renderer = a.slice('--renderer='.length);
    else if (a.startsWith('--floors=')) args.floors = a.slice('--floors='.length).split(',').filter(Boolean);
  }
  return args;
}

export async function runFloorShots(opts = {}) {
  const args = { ...parseArgs([]), ...opts };
  fs.mkdirSync(args.out, { recursive: true });
  const { server, port } = await startStaticServer(ROOT);
  const query = args.renderer ? `?renderer=${encodeURIComponent(args.renderer)}` : '';
  const url = `http://127.0.0.1:${port}/${query}`;

  const browser = await chromium.launch({ headless: true });
  const savedFiles = [];

  try {
    for (const prof of PROFILES) {
      const profDir = path.join(args.out, prof.id);
      fs.mkdirSync(profDir, { recursive: true });

      const context = await browser.newContext({
        viewport: prof.viewport,
        deviceScaleFactor: prof.deviceScaleFactor,
        isMobile: prof.isMobile,
        hasTouch: prof.hasTouch,
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 10000 });

      await page.evaluate((q) => {
        document.getElementById('helpOverlay')?.classList.add('hidden');
        if (window.__pixelHotel.setBackgroundDetail) window.__pixelHotel.setBackgroundDetail(q);
        if (window.__pixelHotel.setSpriteDetail) window.__pixelHotel.setSpriteDetail(q);
        if (window.__pixelHotel.setDayPhase) window.__pixelHotel.setDayPhase(0.5);
      }, prof.quality);
      await page.waitForTimeout(300);

      for (const floorId of args.floors) {
        await page.evaluate((fId) => {
          window.__pixelHotel.takeElevator(fId);
          window.__pixelHotel.resetZoom();
        }, floorId);
        await page.waitForTimeout(520);

        const defaultPath = path.join(profDir, `${floorId}_default.png`);
        await page.screenshot({ path: defaultPath });
        savedFiles.push(defaultPath);

        // Max zoom-in (2.5x)
        await page.evaluate(() => {
          window.__pixelHotel.setZoom(2.5);
        });
        await page.waitForTimeout(160);
        const maxZoomPath = path.join(profDir, `${floorId}_zoom_max.png`);
        await page.screenshot({ path: maxZoomPath });
        savedFiles.push(maxZoomPath);
      }

      // Street-level view (lobby at zoom 0.7) and Tower view (rooftop at zoom 0.55)
      await page.evaluate(() => {
        window.__pixelHotel.takeElevator('lobby');
        window.__pixelHotel.setZoom(0.7);
      });
      await page.waitForTimeout(520);
      const streetPath = path.join(profDir, 'view_street.png');
      await page.screenshot({ path: streetPath });
      savedFiles.push(streetPath);

      await page.evaluate(() => {
        window.__pixelHotel.takeElevator('rooftop');
        window.__pixelHotel.setZoom(0.55);
      });
      await page.waitForTimeout(520);
      const towerPath = path.join(profDir, 'view_tower.png');
      await page.screenshot({ path: towerPath });
      savedFiles.push(towerPath);

      // 8x complaint crops on desktop_high
      if (prof.id === 'desktop_high') {
        const cropsDir = path.join(args.out, 'crops_8x');
        fs.mkdirSync(cropsDir, { recursive: true });
        for (const c of COMPLAINT_CROPS) {
          if (!args.floors.includes(c.room)) continue;
          const pt = await page.evaluate(({ room, gx, gy }) => {
            window.__pixelHotel.takeElevator(room);
            window.__pixelHotel.resetZoom();
            const canvas = window.__pixelHotel.getCanvas();
            const rect = canvas.getBoundingClientRect();
            const s0 = window.__pixelHotel.tileToScreen(gx, gy);
            const dx = Math.round(rect.width / 2 - (s0.sx ?? s0.x));
            const dy = Math.round(rect.height / 2 - (s0.sy ?? s0.y));
            canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true }));
            canvas.dispatchEvent(new MouseEvent('mousemove', { button: 0, clientX: rect.left + 100 + dx, clientY: rect.top + 100 + dy, bubbles: true }));
            window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
            const s1 = window.__pixelHotel.tileToScreen(gx, gy);
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            return { x: (s1.sx ?? s1.x) * dpr, y: (s1.sy ?? s1.y) * dpr };
          }, c);
          await page.waitForTimeout(520);
          const dataUrl = await page.evaluate(() => window.__pixelHotel.getCanvas().toDataURL('image/png'));
          const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
          const cropBuf = cropAndUpscale8x(buf, pt.x, pt.y, c.cropW, c.cropH);
          const cropPath = path.join(cropsDir, `${c.id}_8x.png`);
          fs.writeFileSync(cropPath, cropBuf);
          savedFiles.push(cropPath);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  return { outDir: args.out, count: savedFiles.length, files: savedFiles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv);
  console.log(`Capturing floor screenshots into ${args.out}...`);
  const res = await runFloorShots(args);
  console.log(`Captured ${res.count} screenshots/crops into ${res.outDir}`);
}
