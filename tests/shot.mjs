// One-off Playwright screenshot script (not part of npm test). Captures
// Lobby/Restaurant/Pool/My Room/street views at a given DPR into a target dir.
// Usage: node tests/shot.mjs <prefix> <outDir>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8736;
const BASE_URL = `http://localhost:${PORT}`;
const [, , PREFIX = 'shot', OUT_DIR = '/tmp'] = process.argv;

function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      http.get(url, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) reject(new Error('server did not start in time'));
          else setTimeout(poll, 150);
        });
    })();
  });
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const killServer = () => { try { server.kill(); } catch (e) { /* ignore */ } };
  process.on('exit', killServer);

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const shots = [
      { name: 'lobby', room: 'lobby' },
      { name: 'restaurant', room: 'restaurant' },
      { name: 'pool', room: 'pool' },
      { name: 'myroom', room: 'myroom' },
    ];
    for (const s of shots) {
      await page.evaluate((r) => window.__pixelHotel.takeElevator(r), s.room);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, `${PREFIX}-${s.name}.png`) });
      console.log(`captured ${s.name}`);
    }
    // "street" view: zoom out on the lobby to see more of the city backdrop.
    await page.evaluate(() => window.__pixelHotel.takeElevator('lobby'));
    await page.waitForTimeout(400);
    const canvas = await page.$('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, `${PREFIX}-street.png`) });
    console.log('captured street');
  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
