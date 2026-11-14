import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(ROOT, 'shots', 'v0124');
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
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
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

async function main() {
  const prefix = process.argv[2] || 'before';
  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/index.html`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto(url);
  await page.waitForFunction(() => window.__pixelHotel);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // Capture rooms
  const rooms = [
    { id: 'garden', name: 'Sky Garden' },
    { id: 'library', name: 'Library' },
    { id: 'lobby', name: 'Grand Lobby' },
    { id: 'restaurant', name: 'Restaurant' },
  ];

  for (const r of rooms) {
    await page.evaluate((id) => {
      window.__pixelHotel.setDayPhase(0.5);
      window.__pixelHotel.takeElevator(id);
    }, r.id);
    await page.waitForTimeout(1500);
    const dest = path.join(SHOTS_DIR, `${prefix}-${r.id}.png`);
    await page.screenshot({ path: dest });
    console.log(`Saved room shot: ${dest}`);
  }

  // Capture all catalogue items
  const itemData = await page.evaluate(async (prefix) => {
    const { CATALOGUE } = await import('/js/data.js');
    const { renderItemIcon } = await import('/js/render.js');
    const results = [];

    // Make offscreen canvas for contact sheet
    const cols = 8;
    const rows = Math.ceil(CATALOGUE.length / cols);
    const cellSize = 120; // 2x density cells
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = cols * cellSize;
    sheetCanvas.height = rows * cellSize;
    const sctx = sheetCanvas.getContext('2d');
    sctx.fillStyle = '#1c1826';
    sctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    sctx.imageSmoothingEnabled = false;

    for (let i = 0; i < CATALOGUE.length; i++) {
      const item = CATALOGUE[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = col * cellSize;
      const cy = row * cellSize;

      // Draw subtle grid box
      sctx.strokeStyle = '#2d273d';
      sctx.strokeRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);

      // Render icon
      const iconCanvas = renderItemIcon(item.id, 48, 2);
      if (iconCanvas) {
        // Draw centered in cell
        const ix = cx + Math.round((cellSize - iconCanvas.width) / 2);
        const iy = cy + Math.round((cellSize - 20 - iconCanvas.height) / 2);
        sctx.drawImage(iconCanvas, ix, iy);

        // Also get individual thumbnail dataUrl
        results.push({
          id: item.id,
          name: item.name,
          category: item.category,
          dataUrl: iconCanvas.toDataURL(),
        });
      }

      // Draw label
      sctx.font = '10px monospace';
      sctx.fillStyle = '#c8b6d8';
      sctx.textAlign = 'center';
      const shortName = item.name.length > 16 ? item.name.slice(0, 15) + '…' : item.name;
      sctx.fillText(shortName, cx + cellSize / 2, cy + cellSize - 8);
    }

    return {
      sheetDataUrl: sheetCanvas.toDataURL(),
      items: results,
    };
  }, prefix);

  // Save contact sheet
  const sheetBuf = Buffer.from(itemData.sheetDataUrl.split(',')[1], 'base64');
  const sheetPath = path.join(SHOTS_DIR, `${prefix}_contact_sheet.png`);
  fs.writeFileSync(sheetPath, sheetBuf);
  console.log(`Saved contact sheet: ${sheetPath}`);

  // Save individual thumbnails
  for (const it of itemData.items) {
    const thumbBuf = Buffer.from(it.dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(ITEMS_DIR, `${prefix}_${it.id}.png`), thumbBuf);
  }
  console.log(`Saved ${itemData.items.length} item thumbnails in ${ITEMS_DIR}`);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
