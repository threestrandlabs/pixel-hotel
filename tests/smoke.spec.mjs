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

  let browser;
  try {
    await waitForServer(BASE_URL);

    browser = await chromium.launch();
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

    // Verify audio is NOT started before a user gesture
    const audioBeforeGesture = await page.evaluate(() => window.__pixelHotel.getAudioState());
    check(
      'audio context is deferred before first user gesture',
      audioBeforeGesture.gestureUnlocked === false && audioBeforeGesture.hasContext === false
    );

    // First-run help overlay: must close on Escape and on a click outside the box
    const helpOpen = () => page.locator('#helpOverlay:not(.hidden)').count();
    check('help overlay is shown on first run', (await helpOpen()) === 1);
    await page.keyboard.press('Escape');
    check('Escape closes the help overlay', (await helpOpen()) === 0);

    const audioAfterGesture = await page.evaluate(() => window.__pixelHotel.getAudioState());
    check(
      'audio unlocks and initializes after first user gesture',
      audioAfterGesture.gestureUnlocked === true && audioAfterGesture.hasContext === true
    );

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
    await page.screenshot({ path: '/workspace/pixel-hotel-v060-dpr1.png' });

    // ---- v0.7.0: default zoom, zoom controls, pointer->tile mapping, persistence ----
    const cam0 = await page.evaluate(() => window.__pixelHotel.getCamera());
    check('default zoom is clamped within [0.55, 2.5] and matches the reference framing (~1.6-2.1x)', cam0.zoom >= 1.6 && cam0.zoom <= 2.1);
    const zoomLabelBefore = await page.textContent('#zoomLevel');
    check('zoom level label reflects the current camera zoom', zoomLabelBefore === `${Math.round(cam0.zoom * 100)}%`);
    await page.click('#btnZoomIn');
    await page.waitForTimeout(80);
    const camAfterZoomIn = await page.evaluate(() => window.__pixelHotel.getCamera());
    check('+ zoom button increases zoom', camAfterZoomIn.zoom > cam0.zoom);
    await page.click('#btnZoomOut');
    await page.click('#btnZoomOut');
    await page.waitForTimeout(80);
    const camAfterZoomOut = await page.evaluate(() => window.__pixelHotel.getCamera());
    check('- zoom button decreases zoom', camAfterZoomOut.zoom < camAfterZoomIn.zoom);
    await page.click('#btnZoomReset');
    await page.waitForTimeout(80);
    const camAfterReset = await page.evaluate(() => window.__pixelHotel.getCamera());
    check('1:1 reset button restores the default zoom', Math.abs(camAfterReset.zoom - cam0.zoom) < 0.02);

    // Pointer -> tile -> screen mapping stays correct after zooming.
    await page.evaluate(() => window.__pixelHotel.setZoom(2.0));
    await page.waitForTimeout(80);
    const mapped = await page.evaluate(() => {
      const s = window.__pixelHotel.tileToScreen(5, 4);
      const tile = window.__pixelHotel.screenToTile(s.sx, s.sy);
      return tile;
    });
    check('pointer->tile mapping round-trips correctly while zoomed in', mapped.x === 5 && mapped.y === 4);
    await page.evaluate(() => window.__pixelHotel.resetZoom());
    await page.waitForTimeout(80);

    await page.screenshot({ path: '/workspace/pixel-hotel-v070-lobby.png' });

    await page.evaluate(() => window.__pixelHotel.setZoom(0.7));
    await page.waitForTimeout(150);
    await page.screenshot({ path: '/workspace/pixel-hotel-v070-zoomed-out.png' });
    await page.evaluate(() => window.__pixelHotel.resetZoom());
    await page.waitForTimeout(80);

    // ---- v0.7.0: vehicles on the isometric city roads ----
    const roadColors = await page.evaluate(() => {
      const c = document.getElementById('gameCanvas');
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, Math.floor(c.height * 0.72), c.width, Math.floor(c.height * 0.22)).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4 * 31) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return colors.size;
    });
    check('street/road band below the hotel renders many distinct colours (vehicles, lanes, crossings)', roadColors > 15);

    // ---- v0.7.0: every catalogue item renders a non-empty icon ----
    const iconCheck = await page.evaluate(async () => {
      const dataMod = await import('./js/data.js');
      const bad = [];
      for (const item of dataMod.CATALOGUE) {
        const url = window.__pixelHotel.getItemIcon(item.id);
        if (!url || url.length < 100) bad.push(item.id);
      }
      return { total: dataMod.CATALOGUE.length, bad };
    });
    check(`every one of ${iconCheck.total} catalogue items renders a non-empty icon`, iconCheck.bad.length === 0);
    if (iconCheck.bad.length) console.error('items with empty icons:', iconCheck.bad);

    // ---- v0.7.0: compact music player widget ----
    const mpBefore = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
    check('music player shows a track title and room subtitle', mpBefore.title.length > 0 && mpBefore.subtitle.length > 0);
    await page.click('#mpPlayPause');
    await page.waitForTimeout(80);
    const mpAfterPause = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
    check('music player play/pause button toggles playback', mpAfterPause.info.playing !== mpBefore.info.playing);
    await page.click('#mpPlayPause');
    await page.waitForTimeout(80);
    await page.click('#mpNext');
    await page.waitForTimeout(80);
    const mpAfterNext = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
    check('next track button switches to manual mode and changes the track', mpAfterNext.info.autoFollowRoom === false && mpAfterNext.info.trackId !== mpBefore.info.trackId);
    await page.click('#mpAutoFollow');
    await page.waitForTimeout(80);
    const mpAfterAuto = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
    check('Auto: follow room toggle re-enables room-following', mpAfterAuto.info.autoFollowRoom === true);
    await page.click('#mpCollapse');
    await page.waitForTimeout(80);
    check('music player body collapses', await page.locator('#mpBody.hidden').count() === 1);
    await page.click('#mpCollapse');
    await page.waitForTimeout(80);

    // ---- v0.7.0: settings panel Master / Music / SFX / Ambience sliders ----
    await page.click('#btnMute');
    await page.waitForTimeout(80);
    await page.locator('#masterVolume').fill('50');
    await page.locator('#masterVolume').dispatchEvent('input');
    await page.locator('#ambienceVolume').fill('20');
    await page.locator('#ambienceVolume').dispatchEvent('input');
    await page.waitForTimeout(80);
    const settingsAfterSliders = await page.evaluate(() => window.__pixelHotel.getState().settings);
    check('Master volume slider updates settings', Math.abs(settingsAfterSliders.masterVolume - 0.5) < 0.01);
    check('Ambience/traffic volume slider updates settings', Math.abs(settingsAfterSliders.ambienceVolume - 0.2) < 0.01);
    await page.click('[data-close="audioPanel"]');
    await page.waitForTimeout(80);

    // ---- v0.7.0: clicking an NPC opens dialogue instead of walking onto their tile ----
    const dlgResult = await page.evaluate(() => window.__pixelHotel.clickNpc('celeste'));
    check('clickNpc triggers a walk-and-talk toward the receptionist', dlgResult === true);
    await page.waitForFunction(() => window.__pixelHotel.getDialogueState().open === true, null, { timeout: 4000 });
    const dlgState = await page.evaluate(() => window.__pixelHotel.getDialogueState());
    check('NPC dialogue bar opens with the receptionist\'s greeting', dlgState.npcId === 'celeste' && dlgState.text.length > 0);
    await page.click('#btnNpcDlgClose');
    await page.waitForTimeout(80);
    const dlgClosed = await page.evaluate(() => window.__pixelHotel.getDialogueState());
    check('closing the dialogue bar hides it and resumes the NPC', dlgClosed.open === false);

    // ---- v0.7.0: rapid repeated clicks move smoothly with no back-and-forth stutter ----
    const canvasBoxForClicks = await page.locator('#gameCanvas').boundingBox();
    const cx = canvasBoxForClicks.x + canvasBoxForClicks.width / 2;
    const cy = canvasBoxForClicks.y + canvasBoxForClicks.height / 2;
    await page.evaluate(() => window.__pixelHotel.walkTo(6, 4));
    await page.waitForTimeout(50);
    const posTrace = [];
    for (let i = 0; i < 6; i++) {
      await page.mouse.click(cx + (i % 2 === 0 ? 30 : -30), cy + 10);
      posTrace.push(await page.evaluate(() => window.__pixelHotel.getState().player));
      await page.waitForTimeout(60);
    }
    // The render position (not the logical tile, which only updates at tile boundaries)
    // must never visibly reverse direction between two consecutive rapid re-clicks.
    check('rapid repeated clicks do not throw or desync player state', posTrace.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

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

    // ---- v0.7.1: gym floor plays the 04-gym.mp3 file (James's soundtrack), not the procedural fallback ----
    await page.waitForTimeout(400);
    const gymAudio = await page.evaluate(() => window.__pixelHotel.getAudioState().mood);
    check('gym floor music resolves to the 04-gym.mp3 file', gymAudio.src === 'audio/music/04-gym.mp3');
    check('gym floor music plays the file track, not the procedural fallback', gymAudio.usingFile === true && gymAudio.fallback === false);
    check('music player shows the gym floor track title', gymAudio.label === 'Gym Pulse Fitness Electronic');

    // ---- v0.7.1: switching floors crossfades to the new floor's file track ----
    await page.evaluate(() => window.__pixelHotel.takeElevator('library'));
    await page.waitForTimeout(400);
    const libraryAudio = await page.evaluate(() => window.__pixelHotel.getAudioState().mood);
    check('switching floors crossfades to the new floor\'s file', libraryAudio.src === 'audio/music/07-library.mp3' && libraryAudio.usingFile === true);
    check('music player shows the library floor track title', libraryAudio.label === 'Library Soft Piano');
    await page.evaluate(() => window.__pixelHotel.takeElevator('gym'));
    await page.waitForTimeout(400);

    // ---- v0.7.1: a failed music file falls back to the procedural synth track ----
    const fallbackInfo = await page.evaluate(() => window.__pixelHotel.simulateMusicFileError('gym'));
    check('a failing music file marks that track as fallback', fallbackInfo.fallback === true && fallbackInfo.usingFile === false);
    check('fallback keeps the procedural synth title instead of the file label', fallbackInfo.label !== 'Gym Pulse Fitness Electronic' && fallbackInfo.label.length > 0);

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

    // ---- separate music and SFX mute/volume controls & persistence ----
    await page.click('#btnMusicMute');
    const afterMusicMute = await page.evaluate(() => window.__pixelHotel.getAudioState());
    check(
      'toggling Music mute mutes music while leaving SFX unmuted',
      afterMusicMute.musicMuted === true && afterMusicMute.sfxMuted === false
    );
    await page.click('#btnMute');
    await page.waitForTimeout(100);
    await page.locator('#sfxVolume').fill('40');
    await page.locator('#sfxVolume').dispatchEvent('input');
    await page.click('[data-close="audioPanel"]');

    await page.evaluate(() => window.__pixelHotel.save());
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-myroom.png') });

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const stateAfterReload = await page.evaluate(() => window.__pixelHotel.getState());
    const audioAfterReload = await page.evaluate(() => window.__pixelHotel.getAudioState());
    check('My Room and placed furniture persist after reload',
      stateAfterReload.room === 'myroom' &&
      stateAfterReload.rooms.myroom.placed.some((p) => p.itemId === 'plant' && p.x === 7 && p.y === 6)
    );
    check(
      'separate musicMuted and sfxVolume settings persist across reload and defer context until gesture',
      audioAfterReload.musicMuted === true &&
      audioAfterReload.sfxMuted === false &&
      Math.abs(audioAfterReload.sfxVolume - 0.4) < 0.01 &&
      audioAfterReload.hasContext === false
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
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v060-street.png' });
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v060-dpr2.png' });

    // Gym screenshot (Floor 4): Pulse Fitness Gym with isometric city mid-level view & dual treadmill cardio
    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('gym');
      window.__pixelHotel.setDayPhase(0.5);
      window.__pixelHotel.setNpcActivity('rex', 'treadmill');
      window.__pixelHotel.interactWith('treadmill', true);
    });
    await page2x.waitForTimeout(550);
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v060-gym.png' });
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v070-gym.png' });

    // High-floor screenshot (Floor 10 — Rooftop Lounge): looking across neighbouring isometric rooftops & haze
    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('rooftop');
      window.__pixelHotel.setDayPhase(0.52);
      window.__pixelHotel.interactWith('rooftop_sofa', true);
    });
    await page2x.waitForTimeout(550);
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v060-highfloor.png' });

    // Night screenshot: Floor 1 / Floor 3 at night with illuminated isometric city windows, streetlamps & warm emissive pools
    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('lobby');
      window.__pixelHotel.setDayPhase(0.04);
      window.__pixelHotel.interactWith('sofa', true);
    });
    await page2x.waitForTimeout(550);
    await page2x.screenshot({ path: path.join(SCREENSHOT_DIR, '08-rooftop-night-2x.png') });
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v060-night.png' });

    // Street-at-night screenshot: zoomed out to show the isometric city, roads, vehicle
    // headlights/taillights and streetlamps around the Grand Lobby after dark.
    await page2x.evaluate(() => {
      window.__pixelHotel.resetZoom();
      window.__pixelHotel.setZoom(0.9);
    });
    await page2x.waitForTimeout(400);
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v070-street-night.png' });

    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('restaurant');
      window.__pixelHotel.setDayPhase(0.5);
    });
    await page2x.waitForTimeout(450);
    await page2x.screenshot({ path: path.join(SCREENSHOT_DIR, '09-restaurant-2x.png') });

    await context1x.close();
    await context2x.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
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

// Safety net: never let a stuck page/browser handle hang the process forever.
const watchdog = setTimeout(() => {
  console.error('Watchdog: smoke test exceeded 90s, forcing exit.');
  process.exit(1);
}, 90000);
watchdog.unref();

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
