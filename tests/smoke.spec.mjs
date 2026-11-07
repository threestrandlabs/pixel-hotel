// Playwright smoke test (plain script, not @playwright/test) — run with
// `node tests/smoke.spec.mjs`. Starts a local static server, loads the page
// in Chromium at deviceScaleFactor 1 and 2, and exercises the golden path end to end.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8734;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok - ${name}`);
  } else {
    console.error(`  FAIL - ${name}`);
    failures++;
  }
}

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
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log(`Starting static server on port ${PORT}...`);
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const killServer = () => { try { server.kill(); } catch (e) { /* ignore */ } };
  process.on('exit', killServer);

  try {
    await waitForServer(BASE_URL);

    const browser = await chromium.launch();
    const context1x = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    const page = await context1x.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    console.log('Loading page at deviceScaleFactor=1...');
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.waitForTimeout(400);

    // Verify canvas backing store == CSS size * DPR at deviceScaleFactor 1
    const metrics1x = await page.evaluate(() => {
      const c = document.getElementById('gameCanvas');
      const r = c.getBoundingClientRect();
      return {
        dpr: window.devicePixelRatio,
        width: c.width,
        height: c.height,
        expectedW: Math.round(r.width * window.devicePixelRatio),
        expectedH: Math.round(r.height * window.devicePixelRatio),
      };
    });
    check(
      'canvas backing store == CSS size * DPR at deviceScaleFactor 1',
      metrics1x.dpr === 1 && metrics1x.width === metrics1x.expectedW && metrics1x.height === metrics1x.expectedH
    );

    // First-run help overlay: must close on Escape and on a click outside the box
    const helpOpen = () => page.locator('#helpOverlay:not(.hidden)').count();
    check('help overlay is shown on first run', (await helpOpen()) === 1);
    await page.keyboard.press('Escape');
    check('Escape closes the help overlay', (await helpOpen()) === 0);
    await page.click('#btnHelp');
    await page.mouse.click(4, 4);
    check('clicking outside closes the help overlay', (await helpOpen()) === 0);
    const seeded = await page.evaluate(() => window.__pixelHotel.getState().rooms);
    check('lobby, gym, myroom, and rooftop start furnished',
      seeded.lobby.placed.length > 5 &&
      seeded.gym.placed.length > 5 &&
      seeded.myroom.placed.length >= 6 &&
      seeded.rooftop.placed.length > 5
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-lobby-1x.png') });

    check('no console errors', consoleErrors.length === 0);
    if (consoleErrors.length) console.error(consoleErrors);
    check('no uncaught page errors', pageErrors.length === 0);
    if (pageErrors.length) console.error(pageErrors);

    // ---- canvas is non-blank ----
    const pixelStats = await page.evaluate(() => {
      const canvas = document.getElementById('gameCanvas');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4 * 97) {
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return { distinctColors: colors.size };
    });
    check('canvas renders more than one distinct colour', pixelStats.distinctColors > 3);

    // ---- click to walk ----
    const before = await page.evaluate(() => window.__pixelHotel.getState().player);
    const canvasBox = await page.locator('#gameCanvas').boundingBox();
    await page.mouse.click(canvasBox.x + canvasBox.width / 2 + 40, canvasBox.y + canvasBox.height / 2 + 40);
    await page.waitForFunction(
      (start) => { const p = window.__pixelHotel.getState().player; return p.x !== start.x || p.y !== start.y; },
      before,
      { timeout: 4000 },
    ).catch(() => {});
    const after = await page.evaluate(() => window.__pixelHotel.getState().player);
    check('avatar moved after a walk click', before.x !== after.x || before.y !== after.y);

    // ---- chat ----
    await page.fill('#chatInput', 'hello everyone!');
    await page.click('#chatForm button[type="submit"]');
    await page.waitForTimeout(300);
    const chatText = await page.textContent('#chatLog');
    check('player chat message appears in chat log', chatText.includes('hello everyone'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-chat.png') });

    // ---- elevator travel to Gym (Floor 4) & treadmill interaction ----
    await page.click('#btnElevator');
    await page.waitForTimeout(150);
    const wingHeaders = await page.locator('.elevator-group-title').count();
    check('elevator navigator displays categorized wing headers', wingHeaders === 3);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-elevator-directory.png') });
    await page.click('[data-floor-room="gym"]');
    await page.waitForTimeout(500);
    const stateInGym = await page.evaluate(() => window.__pixelHotel.getState());
    check('elevator travel to gym works', stateInGym.room === 'gym' && stateInGym.floor === 4);
    const roomLabelGym = await page.textContent('#roomName');
    check('floor indicator updates for Gym', roomLabelGym.includes('Floor 4') && roomLabelGym.includes('Gym'));
    const tmInteract = await page.evaluate(() => window.__pixelHotel.interactWith('treadmill', true));
    const gymAfterTm = await page.evaluate(() => window.__pixelHotel.getState().player);
    check('treadmill interaction sets player activity to treadmill', tmInteract === true && gymAfterTm.activity?.kind === 'treadmill');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-gym.png') });

    // ---- Pool swimming & Restaurant dining interactions ----
    await page.evaluate(() => {
      window.__pixelHotel.takeElevator('pool');
      window.__pixelHotel.interactWith('pool_water', true);
    });
    await page.waitForTimeout(250);
    const poolPlayer = await page.evaluate(() => window.__pixelHotel.getState().player);
    check('pool interaction sets player activity to swim', poolPlayer.activity?.kind === 'swim');

    await page.evaluate(() => {
      window.__pixelHotel.takeElevator('restaurant');
      window.__pixelHotel.interactWith('dining_chair', true);
    });
    await page.waitForTimeout(250);
    const restPlayer = await page.evaluate(() => window.__pixelHotel.getState().player);
    check('restaurant dining chair interaction sets player activity to eat', restPlayer.activity?.kind === 'eat' && !!restPlayer.sitting);

    // ---- elevator travel to My Room (Floor 8) and furniture placement persistence ----
    await page.keyboard.press('e');
    await page.waitForTimeout(100);
    await page.click('[data-floor-room="myroom"]');
    await page.waitForTimeout(500);
    const stateInMyRoom = await page.evaluate(() => window.__pixelHotel.getState());
    check('elevator travel to My Room works', stateInMyRoom.room === 'myroom' && stateInMyRoom.floor === 8);

    const buyRes = await page.evaluate(() => window.__pixelHotel.buy('plant'));
    check('buying a plant succeeds', buyRes.ok === true);
    const placeRes = await page.evaluate((instanceId) => window.__pixelHotel.placeAt(instanceId, 7, 6, 0), buyRes.instanceId);
    check('placing the plant in My Room succeeds', placeRes.ok === true);
    await page.evaluate(() => window.__pixelHotel.save());
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-myroom.png') });

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const stateAfterReload = await page.evaluate(() => window.__pixelHotel.getState());
    check('My Room and placed furniture persist after reload',
      stateAfterReload.room === 'myroom' &&
      stateAfterReload.rooms.myroom.placed.some((p) => p.itemId === 'plant' && p.x === 7 && p.y === 6)
    );

    // ---- night view rendering ----
    await page.evaluate(() => window.__pixelHotel.setDayPhase(0)); // midnight
    await page.waitForTimeout(350);
    const nightPixels = await page.evaluate(() => {
      const c = document.getElementById('gameCanvas');
      const ctx = c.getContext('2d');
      const p = ctx.getImageData(10, 10, 1, 1).data;
      return { r: p[0], g: p[1], b: p[2] };
    });
    check('night view renders dark sky at midnight', nightPixels.r < 60 && nightPixels.b > nightPixels.r);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-night-myroom.png') });

    // ---- deviceScaleFactor = 2 HiDPI verification & screenshots ----
    console.log('Testing at deviceScaleFactor=2...');
    const context2x = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
    const page2x = await context2x.newPage();
    await page2x.goto(BASE_URL, { waitUntil: 'load' });
    await page2x.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page2x.keyboard.press('Escape');
    await page2x.waitForTimeout(350);

    const metrics2x = await page2x.evaluate(() => {
      const c = document.getElementById('gameCanvas');
      const r = c.getBoundingClientRect();
      return {
        dpr: window.devicePixelRatio,
        width: c.width,
        height: c.height,
        expectedW: Math.round(r.width * window.devicePixelRatio),
        expectedH: Math.round(r.height * window.devicePixelRatio),
      };
    });
    check(
      'canvas backing store == CSS size * DPR at deviceScaleFactor 2',
      metrics2x.dpr === 2 && metrics2x.width === metrics2x.expectedW && metrics2x.height === metrics2x.expectedH
    );
    await page2x.screenshot({ path: path.join(SCREENSHOT_DIR, '07-lobby-2x.png') });
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v050-lobby.png' });

    // Facility screenshot: Azure Pool & Spa (Floor 5) with multi-lane swimming
    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('pool');
      window.__pixelHotel.setDayPhase(0.52);
      window.__pixelHotel.setNpcActivity('marina', 'pool_water');
      window.__pixelHotel.interactWith('pool_water', true);
    });
    await page2x.waitForTimeout(550);
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v050-facility.png' });

    // Interaction screenshot: Pulse Fitness Gym (Floor 4) with dual treadmill cardio
    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('gym');
      window.__pixelHotel.setDayPhase(0.5);
      window.__pixelHotel.setNpcActivity('rex', 'treadmill');
      window.__pixelHotel.interactWith('treadmill', true);
    });
    await page2x.waitForTimeout(550);
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v050-interaction.png' });

    // Night screenshot: Skyline Restaurant (Floor 3) at night with eating animation & warm emissive light pools
    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('restaurant');
      window.__pixelHotel.setDayPhase(0.04);
      window.__pixelHotel.interactWith('dining_chair', true);
    });
    await page2x.waitForTimeout(550);
    await page2x.screenshot({ path: path.join(SCREENSHOT_DIR, '08-rooftop-night-2x.png') });
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v050-night.png' });

    await page2x.evaluate(() => {
      window.__pixelHotel.setDayPhase(0.5);
    });
    await page2x.waitForTimeout(350);
    await page2x.screenshot({ path: path.join(SCREENSHOT_DIR, '09-restaurant-2x.png') });

    await context1x.close();
    await context2x.close();
    await browser.close();
  } finally {
    killServer();
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} smoke check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('All smoke checks passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
