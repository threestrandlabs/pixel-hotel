// Phase 0/1..6 Load & Frame-Time Gate (PIXI_MIGRATION_PLAN.md §5).
// Enters every floor by elevator, records every animation frame for the first 3 s
// plus PerformanceObserver('longtask') entries, and measures walking FPS across
// both required profiles:
//   - desktop_high: 1440x900, DPR 2, High quality
//   - mobile_low:   390x844,  DPR 3, CPU 4x throttling, Low quality
//
// Usage:
//   node tests/load-gate.mjs [--root=/path/to/worktree] [--runs=1] [--out=path.json] [--enforce]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');

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

const WALK_TARGETS = {
  lobby: [{ x: 18, y: 16 }, { x: 12, y: 20 }, { x: 15, y: 16 }],
  cafe: [{ x: 9, y: 10 }, { x: 5, y: 12 }, { x: 7, y: 9 }],
  restaurant: [{ x: 10, y: 14 }, { x: 6, y: 18 }, { x: 8, y: 12 }],
  gym: [{ x: 10, y: 10 }, { x: 6, y: 14 }, { x: 8, y: 10 }],
  pool: [{ x: 8, y: 12 }, { x: 20, y: 14 }, { x: 10, y: 10 }],
  arcade: [{ x: 10, y: 10 }, { x: 14, y: 14 }, { x: 8, y: 12 }],
  library: [{ x: 10, y: 10 }, { x: 14, y: 14 }, { x: 8, y: 12 }],
  garden: [{ x: 10, y: 12 }, { x: 14, y: 16 }, { x: 8, y: 10 }],
  myroom: [{ x: 6, y: 6 }, { x: 4, y: 8 }, { x: 5, y: 5 }],
  rooftop: [{ x: 10, y: 10 }, { x: 6, y: 12 }, { x: 8, y: 8 }],
};

const PROFILES = [
  {
    id: 'desktop_high',
    label: 'Desktop High (1440x900 @ 2x DPR)',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    cpuThrottle: 1,
    quality: 'high',
  },
  {
    id: 'mobile_low',
    label: 'Mobile Low (390x844 @ 3x DPR, 4x CPU throttle)',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    cpuThrottle: 4,
    quality: 'low',
  },
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

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    runs: 1,
    entryMs: 3000,
    out: null,
    enforce: false,
    renderer: null,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--root=')) args.root = path.resolve(a.slice('--root='.length));
    else if (a.startsWith('--runs=')) args.runs = Math.max(1, Number(a.slice('--runs='.length)) || 1);
    else if (a.startsWith('--entry-ms=')) args.entryMs = Math.max(500, Number(a.slice('--entry-ms='.length)) || 3000);
    else if (a.startsWith('--out=')) args.out = path.resolve(a.slice('--out='.length));
    else if (a.startsWith('--renderer=')) args.renderer = a.slice('--renderer='.length);
    else if (a === '--enforce') args.enforce = true;
  }
  return args;
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

function percentile(sortedVals, p) {
  if (!sortedVals.length) return 0;
  const idx = Math.min(sortedVals.length - 1, Math.max(0, Math.floor(sortedVals.length * p)));
  return sortedVals[idx];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export async function runLoadGate(opts = {}) {
  const rootDir = opts.root || DEFAULT_ROOT;
  const runs = opts.runs || 1;
  const entryMs = opts.entryMs || 3000;
  const rendererParam = opts.renderer ? `?renderer=${encodeURIComponent(opts.renderer)}` : '';

  const pkgPath = path.join(rootDir, 'package.json');
  const pkgVersion = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
    : 'unknown';

  const { server, port } = await startStaticServer(rootDir);
  const baseUrl = `http://127.0.0.1:${port}/${rendererParam}`;
  const browser = await chromium.launch({ headless: true });

  const result = {
    version: pkgVersion,
    root: rootDir,
    runs,
    entryWindowMs: entryMs,
    timestamp: new Date().toISOString(),
    profiles: {},
  };

  try {
    for (const prof of PROFILES) {
      const floorRuns = {};
      for (const f of FLOORS) floorRuns[f] = [];

      for (let runIdx = 0; runIdx < runs; runIdx++) {
        const context = await browser.newContext({
          viewport: prof.viewport,
          deviceScaleFactor: prof.deviceScaleFactor,
          isMobile: prof.isMobile,
          hasTouch: prof.hasTouch,
        });

        await context.addInitScript(() => {
          window.__longTasks = [];
          if (typeof PerformanceObserver !== 'undefined') {
            try {
              const obs = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  window.__longTasks.push({
                    startTime: entry.startTime,
                    duration: entry.duration,
                  });
                }
              });
              obs.observe({ entryTypes: ['longtask'] });
            } catch (_) {
              // ignore if longtask observer unsupported
            }
          }
        });

        const page = await context.newPage();
        let cdp = null;
        if (prof.cpuThrottle > 1) {
          cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpuThrottle });
        }

        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 10000 });

        // Close help overlay if open and configure quality mode
        await page.evaluate((q) => {
          document.getElementById('helpOverlay')?.classList.add('hidden');
          const api = window.__pixelHotel;
          if (api.setBackgroundDetail) api.setBackgroundDetail(q);
          if (api.setSpriteDetail) api.setSpriteDetail(q);
          // Start on rooftop so entering lobby first also travels by elevator
          api.takeElevator('rooftop');
        }, prof.quality);
        await page.waitForTimeout(550);

        for (const floorId of FLOORS) {
          const targets = WALK_TARGETS[floorId] || [{ x: 6, y: 6 }];
          const metrics = await page.evaluate(
            async ({ floorId, entryMs, targets }) => {
              window.__longTasks = [];
              const entryDts = [];
              const walkDts = [];
              const t0 = performance.now();
              let last = t0;

              // Trigger elevator entry via modal button if present, else takeElevator API
              const elevBtn = document.querySelector(`[data-floor-room="${floorId}"]`);
              if (elevBtn && !elevBtn.disabled) {
                elevBtn.click();
              } else {
                window.__pixelHotel.takeElevator(floorId);
              }

              // Phase A: First 3s (entryMs) after elevator click — captures all entry spikes
              await new Promise((resolve) => {
                function tickEntry(now) {
                  const dt = now - last;
                  last = now;
                  if (dt > 0) entryDts.push(dt);
                  if (now - t0 >= entryMs) {
                    resolve();
                    return;
                  }
                  requestAnimationFrame(tickEntry);
                }
                requestAnimationFrame(tickEntry);
              });

              const entryEnd = performance.now();
              const longTasks = (window.__longTasks || []).filter(
                (lt) => lt.startTime >= t0 && lt.startTime <= entryEnd,
              );

              // Phase B: Steady-state walking window (2000ms) after entry completes
              const walkWindowMs = 2000;
              const walkStart = performance.now();
              last = walkStart;
              let walkIdx = 0;
              let lastWalkAt = 0;

              await new Promise((resolve) => {
                function tickWalk(now) {
                  const dt = now - last;
                  last = now;
                  if (dt > 0) walkDts.push(dt);
                  if (now - lastWalkAt >= 650) {
                    lastWalkAt = now;
                    const t = targets[walkIdx % targets.length];
                    walkIdx++;
                    if (window.__pixelHotel && typeof window.__pixelHotel.walkTo === 'function') {
                      window.__pixelHotel.walkTo(t.x, t.y);
                    }
                  }
                  if (now - walkStart >= walkWindowMs) {
                    resolve();
                    return;
                  }
                  requestAnimationFrame(tickWalk);
                }
                requestAnimationFrame(tickWalk);
              });

              return {
                frameDts: entryDts,
                walkDts,
                elapsedMs: entryEnd - t0,
                longTasks,
              };
            },
            { floorId, entryMs, targets },
          );

          const dts = metrics.frameDts;
          const wDts = metrics.walkDts.length > 5 ? metrics.walkDts : dts;
          const sortedAll = [...dts].sort((a, b) => a - b);
          const sortedWalk = [...wDts].sort((a, b) => a - b);

          const framesOver50ms = dts.filter((d) => d > 50).length;
          const framesOver100ms = dts.filter((d) => d > 100).length;
          const framesOver250ms = dts.filter((d) => d > 250).length;
          const maxFrameMs = sortedAll.length ? round1(sortedAll[sortedAll.length - 1]) : 0;
          const p95FrameMs = round1(percentile(sortedWalk, 0.95));
          const walkSpanMs = wDts.reduce((acc, v) => acc + v, 0);
          const avgFps = walkSpanMs > 0 ? round1((wDts.length * 1000) / walkSpanMs) : 0;
          const p95Fps = p95FrameMs > 0 ? round1(1000 / p95FrameMs) : 0;
          const longTasksOver50ms = metrics.longTasks.filter((lt) => lt.duration > 50).length;
          const longTasksOver100ms = metrics.longTasks.filter((lt) => lt.duration > 100).length;

          floorRuns[floorId].push({
            avgFps,
            p95Fps,
            p95FrameMs,
            maxFrameMs,
            framesOver50ms,
            framesOver100ms,
            framesOver250ms,
            longTasksOver50ms,
            longTasksOver100ms,
            totalFrames: dts.length,
          });
        }

        if (cdp) await cdp.detach().catch(() => {});
        await context.close();
      }

      // Aggregate across runs
      const floorsSummary = {};
      for (const f of FLOORS) {
        const arr = floorRuns[f];
        const avg = (fn) => round1(arr.reduce((s, r) => s + fn(r), 0) / arr.length);
        const max = (fn) => Math.max(...arr.map(fn));
        floorsSummary[f] = {
          avgFps: avg((r) => r.avgFps),
          p95Fps: avg((r) => r.p95Fps),
          p95FrameMs: avg((r) => r.p95FrameMs),
          maxFrameMs: max((r) => r.maxFrameMs),
          framesOver50ms: max((r) => r.framesOver50ms),
          framesOver100ms: max((r) => r.framesOver100ms),
          framesOver250ms: max((r) => r.framesOver250ms),
          longTasksOver50ms: max((r) => r.longTasksOver50ms),
          longTasksOver100ms: max((r) => r.longTasksOver100ms),
          runs: arr,
        };
      }

      result.profiles[prof.id] = {
        label: prof.label,
        viewport: prof.viewport,
        deviceScaleFactor: prof.deviceScaleFactor,
        cpuThrottle: prof.cpuThrottle,
        quality: prof.quality,
        floors: floorsSummary,
      };
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv);
  console.log(`Running load-gate against ${args.root} (runs=${args.runs}, entryMs=${args.entryMs})...`);
  const res = await runLoadGate(args);
  for (const [profId, prof] of Object.entries(res.profiles)) {
    console.log(`\n=== ${prof.label} (${profId}) ===`);
    for (const [floorId, m] of Object.entries(prof.floors)) {
      console.log(
        `  ${floorId.padEnd(10)} | avgFps=${String(m.avgFps).padStart(5)} | p95Ms=${String(m.p95FrameMs).padStart(6)} | maxMs=${String(m.maxFrameMs).padStart(6)} | >50ms=${m.framesOver50ms} >100ms=${m.framesOver100ms} >250ms=${m.framesOver250ms} | longTasks>50ms=${m.longTasksOver50ms}`,
      );
    }
  }
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(res, null, 2) + '\n');
    console.log(`\nWrote load-gate results to ${args.out}`);
  }
  if (args.enforce) {
    let failed = 0;
    for (const [profId, prof] of Object.entries(res.profiles)) {
      for (const [floorId, m] of Object.entries(prof.floors)) {
        if (m.framesOver100ms > 0) {
          console.error(`GATE FAIL [${profId}/${floorId}]: framesOver100ms=${m.framesOver100ms} (expected 0)`);
          failed++;
        }
      }
    }
    if (failed > 0) process.exitCode = 1;
  }
}
