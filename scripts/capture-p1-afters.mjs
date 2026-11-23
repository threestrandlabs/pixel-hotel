import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = '/workspace/ph-rework-shots/pixi/p1';

const COMPLAINT_CROPS = [
  { id: 'cafe_rugs', room: 'cafe', gx: 6.5, gy: 8.5, dY: 0, cropW: 240, cropH: 180 },
  { id: 'restaurant_sconces', room: 'restaurant', gx: 1.2, gy: 9.85, dY: -43, cropW: 160, cropH: 160 },
  { id: 'lobby_lamps', room: 'lobby', gx: 2.1, gy: 8.9, dY: -14, cropW: 320, cropH: 240 },
  { id: 'lobby_sofa_rug', room: 'lobby', gx: 5.2, gy: 10.5, dY: 0, cropW: 260, cropH: 200 },
  { id: 'lobby_crevice', room: 'lobby', gx: 14.5, gy: 10.5, dY: 0, cropW: 240, cropH: 180 },
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
      let val = rawByte;
      if (filter === 1) val = (rawByte + a) & 0xff;
      else if (filter === 2) val = (rawByte + b) & 0xff;
      else if (filter === 3) val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (rawByte + pr) & 0xff;
      }
      row[x] = val;
    }
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      if (channels >= 3) {
        out[di] = row[x * channels];
        out[di + 1] = row[x * channels + 1];
        out[di + 2] = row[x * channels + 2];
        out[di + 3] = channels === 4 ? row[x * channels + 3] : 255;
      } else {
        const v = row[x * channels];
        out[di] = v;
        out[di + 1] = v;
        out[di + 2] = v;
        out[di + 3] = channels === 2 ? row[x * channels + 1] : 255;
      }
    }
    prevRow = row;
    rp += stride;
  }
  return { width: w, height: h, data: out };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return ~c >>> 0;
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { server, port } = await startStaticServer(ROOT);
  const url = `http://127.0.0.1:${port}/?renderer=legacy`;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: false,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 10000 });

    await page.evaluate(() => {
      document.getElementById('helpOverlay')?.classList.add('hidden');
      if (window.__pixelHotel.setBackgroundDetail) window.__pixelHotel.setBackgroundDetail('high');
      if (window.__pixelHotel.setSpriteDetail) window.__pixelHotel.setSpriteDetail('high');
    });
    await page.waitForTimeout(300);

    for (const c of COMPLAINT_CROPS) {
      console.log(`Navigating to ${c.room} for ${c.id}...`);
      await page.evaluate(({ room }) => {
        window.__pixelHotel.takeElevator(room);
        window.__pixelHotel.resetZoom();
      }, c);

      // Wait 1500ms for elevator animation (420ms) and room transition overlay to fully clear
      await page.waitForTimeout(1500);

      const pt = await page.evaluate(({ gx, gy, dY }) => {
        const canvas = window.__pixelHotel.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const s0 = window.__pixelHotel.tileToScreen(gx, gy);
        const targetY = (s0.sy ?? s0.y) + (dY || 0);
        const dx = Math.round(rect.width / 2 - (s0.sx ?? s0.x));
        const dy = Math.round(rect.height / 2 - targetY);

        canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true }));
        canvas.dispatchEvent(new MouseEvent('mousemove', { button: 0, clientX: rect.left + 100 + dx, clientY: rect.top + 100 + dy, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));

        const s1 = window.__pixelHotel.tileToScreen(gx, gy);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        return {
          x: (s1.sx ?? s1.x) * dpr,
          y: ((s1.sy ?? s1.y) + (dY || 0)) * dpr,
        };
      }, c);

      // Wait 400ms for canvas render after pan
      await page.waitForTimeout(400);

      const dataUrl = await page.evaluate(() => window.__pixelHotel.getCanvas().toDataURL('image/png'));
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');

      const fullPath = path.join(OUT_DIR, `${c.id}_after2.png`);
      fs.writeFileSync(fullPath, buf);

      const cropBuf = cropAndUpscale8x(buf, pt.x, pt.y, c.cropW, c.cropH);
      const cropPath = path.join(OUT_DIR, `${c.id}_after2_8x.png`);
      fs.writeFileSync(cropPath, cropBuf);

      console.log(`Saved ${fullPath} and ${cropPath}`);
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  console.log('All after2 shots and 8x crops captured successfully.');
}

await main();
