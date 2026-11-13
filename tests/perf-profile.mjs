// Playwright profiling script. Run with `node tests/perf-profile.mjs` to measure
// render-loop frame times across every visitable floor on desktop and mobile viewports.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const FLOORS = [
  { id: 'lobby', name: 'Lobby', targetA: { x: 6, y: 6 }, targetB: { x: 30, y: 20 } },
  { id: 'cafe', name: 'Cafe', targetA: { x: 10, y: 3 }, targetB: { x: 4, y: 8 } },
  { id: 'restaurant', name: 'Restaurant', targetA: { x: 20, y: 4 }, targetB: { x: 36, y: 20 } },
  { id: 'gym', name: 'Gym', targetA: { x: 10, y: 3 }, targetB: { x: 4, y: 8 } },
  { id: 'pool', name: 'F5 Pool & Spa', targetA: { x: 18, y: 4 }, targetB: { x: 30, y: 20 } },
  { id: 'arcade', name: 'Arcade', targetA: { x: 10, y: 3 }, targetB: { x: 4, y: 8 } },
  { id: 'library', name: 'Library', targetA: { x: 10, y: 3 }, targetB: { x: 4, y: 8 } },
  { id: 'garden', name: 'Sky Garden', targetA: { x: 8, y: 3 }, targetB: { x: 14, y: 10 } },
  { id: 'myroom', name: 'My Room', targetA: { x: 4, y: 2 }, targetB: { x: 3, y: 5 } },
  { id: 'rooftop', name: 'Rooftop', targetA: { x: 6, y: 3 }, targetB: { x: 14, y: 8 } },
];

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

function parseArgs() {
  const args = process.argv.slice(2);
  let durationMs = 10000;
  let floorFilter = null;
  let mode = 'all'; // 'all' | 'desktop' | 'mobile'

  for (const arg of args) {
    if (arg.startsWith('--duration=')) {
      durationMs = parseInt(arg.split('=')[1], 10) || 10000;
    } else if (arg === '--desktop') {
      mode = 'desktop';
    } else if (arg === '--mobile') {
      mode = 'mobile';
    } else if (!arg.startsWith('--')) {
      floorFilter = arg;
    }
  }
  return { durationMs, floorFilter, mode };
}

async function profileFloor(page, floor, durationMs) {
  await page.evaluate((f) => {
    window.__pixelHotel.takeElevator(f.id);
    if (f.id === 'pool') {
      window.__pixelHotel.interactWith('pool_water');
    }
  }, floor);
  await page.waitForTimeout(400);

  const frames = await page.evaluate(({ f, dur }) => new Promise((resolve) => {
    const recorded = [];
    let last = 0;
    let startTime = 0;
    let t = 0;
    window.__pixelHotel.walkTo(f.targetA.x, f.targetA.y);

    function tick(now) {
      if (!startTime) {
        startTime = now;
        last = now;
        requestAnimationFrame(tick);
        return;
      }
      recorded.push(now - last);
      last = now;
      t += 1;
      if (t % 90 === 0) {
        const p = window.__pixelHotel.getState().player;
        const distA = Math.hypot(p.x - f.targetA.x, p.y - f.targetA.y);
        const target = distA < 4 ? f.targetB : f.targetA;
        window.__pixelHotel.walkTo(target.x, target.y);
      }
      if (now - startTime < dur) {
        requestAnimationFrame(tick);
      } else {
        resolve(recorded);
      }
    }
    requestAnimationFrame(tick);
  }), { f: floor, dur: durationMs });

  const n = frames.length;
  const sorted = [...frames].sort((a, b) => a - b);
  const avgMs = frames.reduce((s, v) => s + v, 0) / n;
  const avgFps = 1000 / avgMs;
  const p95 = sorted[Math.floor(n * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(n * 0.99)] ?? 0;
  const over33 = frames.filter((v) => v > 33).length;

  return {
    floor: floor.name,
    id: floor.id,
    frames: n,
    avgFps,
    avgMs,
    p95,
    p99,
    over33,
  };
}

function printTable(title, results) {
  console.log(`\n### ${title}\n`);
  console.log('| Floor | Avg FPS | Avg Frame Time | p95 Frame Time | p99 Frame Time | Frames >33ms | Total Frames |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: |');
  for (const r of results) {
    console.log(
      `| ${r.floor} | ${r.avgFps.toFixed(1)} fps | ${r.avgMs.toFixed(2)} ms | ${r.p95.toFixed(2)} ms | ${r.p99.toFixed(2)} ms | ${r.over33} | ${r.frames} |`
    );
  }
}

async function main() {
  const { durationMs, floorFilter, mode } = parseArgs();
  const floorsToTest = floorFilter
    ? FLOORS.filter((f) => f.id === floorFilter || f.name.toLowerCase().includes(floorFilter.toLowerCase()))
    : FLOORS;

  console.log(`Profiling ${floorsToTest.length} floors (${durationMs}ms duration per floor, mode=${mode})...`);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : await getFreePort();
  const baseUrl = `http://localhost:${port}`;
  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
  const killServer = () => { try { server.kill('SIGKILL'); } catch (e) { /* ignore */ } };
  process.on('exit', killServer);

  let browser;
  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch();

    let desktopResults = [];
    let mobileResults = [];

    if (mode === 'all' || mode === 'desktop') {
      console.log('\n--- Profiling Desktop Viewport (1200x800, DPR 1) ---');
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await page.goto(baseUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);

      for (const floor of floorsToTest) {
        process.stdout.write(`Profiling ${floor.name}... `);
        const res = await profileFloor(page, floor, durationMs);
        desktopResults.push(res);
        console.log(`${res.avgFps.toFixed(1)} fps, p95=${res.p95.toFixed(1)}ms, >33ms=${res.over33}`);
      }
      await page.close();
      printTable('Desktop Profile (1200x800)', desktopResults);
    }

    if (mode === 'all' || mode === 'mobile') {
      console.log('\n--- Profiling Mobile Viewport (390x844, DPR 2) ---');
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);

      for (const floor of floorsToTest) {
        process.stdout.write(`Profiling ${floor.name}... `);
        const res = await profileFloor(page, floor, durationMs);
        mobileResults.push(res);
        console.log(`${res.avgFps.toFixed(1)} fps, p95=${res.p95.toFixed(1)}ms, >33ms=${res.over33}`);
      }
      await context.close();
      printTable('Mobile Profile (390x844, DPR 2)', mobileResults);
    }

  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
