// One-off Playwright profiling script (not part of `npm test`). Run with
// `node tests/perf-profile.mjs` to measure render-loop frame times on the
// busiest floor (Restaurant, ~11 NPCs) before/after a performance change.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8735;
const BASE_URL = `http://localhost:${PORT}`;

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
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Move to the Restaurant floor (~11 NPCs ticking/pathing every frame) and
    // keep the camera panning/zooming throughout the measurement window, since
    // that's what stresses the depth-sort + cutaway/background redraw paths.
    await page.evaluate(() => window.__pixelHotel.takeElevator('restaurant'));
    await page.waitForTimeout(400);

    const result = await page.evaluate(() => new Promise((resolve) => {
      const frames = [];
      let last = performance.now();
      let t = 0;
      // Walk the player back and forth across the dining room — this keeps
      // the camera panning (follows the player every frame) and keeps the
      // ~11 restaurant NPCs actively pathing/sitting/serving, matching what
      // "moving around" actually stresses in normal play.
      window.__pixelHotel.walkTo(40, 30);
      function tick(now) {
        frames.push(now - last);
        last = now;
        t += 1;
        if (t % 90 === 0) {
          const p = window.__pixelHotel.getState().player;
          window.__pixelHotel.walkTo(p.x < 20 ? 40 : 4, p.y < 15 ? 30 : 4);
        }
        if (t < 480) {
          requestAnimationFrame(tick);
        } else {
          resolve(frames);
        }
      }
      requestAnimationFrame(tick);
    }));

    const n = result.length;
    const sorted = [...result].sort((a, b) => a - b);
    const avg = result.reduce((s, v) => s + v, 0) / n;
    const p50 = sorted[Math.floor(n * 0.5)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const max = sorted[n - 1];
    const fps = 1000 / avg;
    console.log(`frames measured: ${n}`);
    console.log(`avg frame time: ${avg.toFixed(2)}ms (${fps.toFixed(1)} fps)`);
    console.log(`p50 frame time: ${p50.toFixed(2)}ms`);
    console.log(`p95 frame time: ${p95.toFixed(2)}ms`);
    console.log(`max frame time: ${max.toFixed(2)}ms`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
