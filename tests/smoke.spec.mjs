// Playwright smoke test (plain script, not @playwright/test) — run with
// `node tests/smoke.spec.mjs`. Starts a local static server, loads the page
// in Chromium, and exercises the golden path end to end.

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
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    console.log('Loading page...');
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.waitForTimeout(400); // let first animation frame(s) render

    // Dismiss first-run help overlay if present
    const helpVisible = await page.locator('#helpOverlay:not(.hidden)').count();
    if (helpVisible) await page.click('#btnHelpClose');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-lobby.png') });

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
    // click a point offset from center, generally landing on an open floor tile
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

    // ---- place furniture via debug hook (deterministic tile) ----
    const coinsBefore = await page.evaluate(() => window.__pixelHotel.getState().coins);
    const buyRes = await page.evaluate(() => window.__pixelHotel.buy('plant'));
    check('buying a plant succeeds', buyRes.ok === true);
    const placeRes = await page.evaluate((instanceId) => window.__pixelHotel.placeAt(instanceId, 3, 3, 0), buyRes.instanceId);
    check('placing the plant succeeds', placeRes.ok === true);
    const stateAfterPlace = await page.evaluate(() => window.__pixelHotel.getState());
    check('coins decreased after buying', stateAfterPlace.coins < coinsBefore);
    check('room contains the placed plant', stateAfterPlace.rooms.lobby.placed.some((p) => p.itemId === 'plant' && p.x === 3 && p.y === 3));

    // open inventory panel via UI too, for a real-UI screenshot
    await page.click('#btnInventory');
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-inventory.png') });
    await page.click('#btnInventory');

    // ---- rooftop lounge screenshot (room switch) ----
    await page.evaluate(() => window.__pixelHotel.walkTo(6, 0));
    await page.waitForFunction(
      () => window.__pixelHotel.getState().room === 'rooftop',
      null,
      { timeout: 6000 },
    ).catch(() => {});
    const roomAfterDoor = await page.evaluate(() => window.__pixelHotel.getState().room);
    check('walking onto the door switches rooms', roomAfterDoor === 'rooftop');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-rooftop.png') });

    // ---- save / reload / persistence ----
    // visiting the rooftop may complete the "visit both rooms" quest and grant
    // coins, so re-read coins right before saving rather than reusing an
    // earlier snapshot.
    const coinsBeforeSave = await page.evaluate(() => window.__pixelHotel.getState().coins);
    await page.evaluate(() => window.__pixelHotel.save());
    await page.waitForTimeout(200);
    const savedRaw = await page.evaluate(() => window.localStorage.getItem('pixelHotel.save.v1'));
    check('save writes to localStorage', !!savedRaw && savedRaw.includes('"coins"'));

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const stateAfterReload = await page.evaluate(() => window.__pixelHotel.getState());
    check('room persists after reload', stateAfterReload.room === 'rooftop');
    check('placed furniture persists after reload', stateAfterReload.rooms.lobby.placed.some((p) => p.itemId === 'plant'));
    check('coins persist after reload', stateAfterReload.coins === coinsBeforeSave);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-after-reload.png') });

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
