import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(ROOT, 'shots', 'v0125');
const ITEMS_DIR = path.join(SHOTS_DIR, 'items');

fs.mkdirSync(ITEMS_DIR, { recursive: true });

function startStaticServer() {
  const mime = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
  };
  const server = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (p.endsWith('/')) p = path.join(p, 'index.html');
    fs.stat(p, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

export async function renderAllItems(targetItem = null) {
  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/index.html`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);

  const results = await page.evaluate(async (singleId) => {
    const { CATALOGUE } = await import('/js/data.js');
    const { furnitureCanvas } = await import('/js/render.js');

    const itemsToRender = singleId
      ? CATALOGUE.filter((it) => it.id === singleId)
      : CATALOGUE;

    const list = [];
    for (const item of itemsToRender) {
      try {
        // Render at 4x DPR
        const fCanvas = furnitureCanvas(item.id, 0, 4);
        if (!fCanvas) {
          list.push({ id: item.id, error: 'no canvas' });
          continue;
        }

        // Draw onto a canvas with 16px padding on dark background for high-contrast viewing
        const pad = 16;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = fCanvas.width + pad * 2;
        outCanvas.height = fCanvas.height + pad * 2;
        const ctx = outCanvas.getContext('2d');
        ctx.fillStyle = '#181424';
        ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

        // Subtle tile diamond outline in the background to show isometric alignment
        const midX = outCanvas.width / 2;
        const midY = outCanvas.height - pad - 10;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;

        ctx.drawImage(fCanvas, pad, pad);

        list.push({
          id: item.id,
          name: item.name,
          w: outCanvas.width,
          h: outCanvas.height,
          dataUrl: outCanvas.toDataURL('image/png'),
        });
      } catch (err) {
        list.push({ id: item.id, error: String(err) });
      }
    }
    return list;
  }, targetItem);

  for (const it of results) {
    if (it.dataUrl) {
      const buf = Buffer.from(it.dataUrl.split(',')[1], 'base64');
      const outPath = path.join(ITEMS_DIR, `${it.id}.png`);
      fs.writeFileSync(outPath, buf);
    } else {
      console.warn(`Failed to render ${it.id}: ${it.error}`);
    }
  }

  console.log(`Rendered ${results.filter((r) => r.dataUrl).length} items to ${ITEMS_DIR}`);
  await browser.close();
  server.close();
}

export async function generateContactSheet() {
  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/index.html`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);

  const sheetDataUrl = await page.evaluate(async () => {
    const { CATALOGUE } = await import('/js/data.js');
    const { furnitureCanvas } = await import('/js/render.js');

    const cols = 8;
    const rows = Math.ceil(CATALOGUE.length / cols);
    const cellSize = 180; // Large 180px cell size (>= 2x scale)

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = cols * cellSize;
    sheetCanvas.height = rows * cellSize;
    const sctx = sheetCanvas.getContext('2d');
    sctx.fillStyle = '#14111d';
    sctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    sctx.imageSmoothingEnabled = false;

    for (let i = 0; i < CATALOGUE.length; i++) {
      const item = CATALOGUE[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = col * cellSize;
      const cy = row * cellSize;

      // Subtle border
      sctx.strokeStyle = '#252033';
      sctx.lineWidth = 1;
      sctx.strokeRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);

      // Render item at 2x
      const fCanvas = furnitureCanvas(item.id, 0, 2);
      if (fCanvas && fCanvas.width > 0 && fCanvas.height > 0) {
        // Fit within cellSize - 30 (leave room for text)
        const maxW = cellSize - 16;
        const maxH = cellSize - 36;
        const scale = Math.min(maxW / fCanvas.width, maxH / fCanvas.height, 1.0);
        const dw = Math.round(fCanvas.width * scale);
        const dh = Math.round(fCanvas.height * scale);
        const dx = cx + Math.round((cellSize - dw) / 2);
        const dy = cy + Math.round((cellSize - 28 - dh) / 2);
        sctx.drawImage(fCanvas, dx, dy, dw, dh);
      }

      // Draw label
      sctx.font = '11px sans-serif';
      sctx.fillStyle = '#dcd4eb';
      sctx.textAlign = 'center';
      const shortName = item.name.length > 20 ? item.name.slice(0, 19) + '…' : item.name;
      sctx.fillText(shortName, cx + cellSize / 2, cy + cellSize - 10);
    }

    return sheetCanvas.toDataURL('image/png');
  });

  const sheetBuf = Buffer.from(sheetDataUrl.split(',')[1], 'base64');
  const sheetPath = path.join(SHOTS_DIR, 'after_contact_sheet.png');
  fs.writeFileSync(sheetPath, sheetBuf);
  console.log(`Saved contact sheet to ${sheetPath}`);

  await browser.close();
  server.close();
}

export async function generateCloseups() {
  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/index.html`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);

  const targets = [
    { id: 'grand_piano', file: 'closeup_piano.png', scale: 4 },
    { id: 'gym_mirror', file: 'closeup_gym_mirror.png', scale: 4 },
    { id: 'string_lights', file: 'closeup_occlusion_1.png', scale: 4 },
    { id: 'telescope', file: 'closeup_occlusion_2.png', scale: 4 },
    { id: 'pool_ladder', file: 'closeup_occlusion_3.png', scale: 4 },
  ];

  for (const t of targets) {
    const dataUrl = await page.evaluate(async ({ id, scale }) => {
      const { furnitureCanvas } = await import('/js/render.js');
      const fCanvas = furnitureCanvas(id, 0, scale);
      if (!fCanvas) return null;
      const pad = 24;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = fCanvas.width + pad * 2;
      outCanvas.height = fCanvas.height + pad * 2;
      const ctx = outCanvas.getContext('2d');
      ctx.fillStyle = '#15121f';
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
      ctx.drawImage(fCanvas, pad, pad);
      return outCanvas.toDataURL('image/png');
    }, t);

    if (dataUrl) {
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      fs.writeFileSync(path.join(SHOTS_DIR, t.file), buf);
      console.log(`Saved closeup ${t.file}`);
    }
  }

  await browser.close();
  server.close();
}

const cmd = process.argv[2] || 'all';
if (cmd === 'all') {
  renderAllItems().then(() => generateContactSheet()).then(() => generateCloseups());
} else if (cmd === 'contact') {
  generateContactSheet();
} else if (cmd === 'closeups') {
  generateCloseups();
} else {
  renderAllItems(cmd);
}
