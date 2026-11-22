// Live-game screenshot of the zoomed-out lobby (city backdrop visible) at a chosen Sprite Detail
// and device pixel ratio, for the 8x nearest-neighbour backdrop review.
// Usage: node scripts/leftovers-live-shot.mjs <out.png> [low|high] [dpr] [wheelClicks]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out, mode = 'low', dprArg = '1', wheelArg = '12'] = process.argv.slice(2);
const PORT = 8300 + Math.floor(Math.random() * 500);
const URL_ = `http://127.0.0.1:${PORT}/index.html`;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const ready = () => new Promise((res, rej) => {
  const t0 = Date.now();
  (function poll() {
    http.get(URL_, (r) => { r.resume(); res(); }).on('error', () => (Date.now() - t0 > 10000 ? rej(new Error('server')) : setTimeout(poll, 150)));
  })();
});
let browser;
try {
  await ready();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: Number(dprArg) });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
  await page.keyboard.press('Escape');
  await page.evaluate((m) => window.__pixelHotel.setSpriteDetail(m), mode);
  await page.evaluate(() => window.__pixelHotel.takeElevator('lobby'));
  await page.waitForTimeout(600);
  const box = await (await page.$('canvas')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < Number(wheelArg); i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out });
  console.log('wrote', out);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
