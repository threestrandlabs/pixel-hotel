// QA: full-size screenshots of rooms from the running dev server.
//   node scripts/screenshot.mjs <outDir> [--zoom N] room [room...]
// Fails (exit 1) on page errors or console errors.
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const outDir = args.shift();
let zoom = 2;
const zi = args.indexOf('--zoom');
if (zi >= 0) { zoom = Number(args[zi + 1]); args.splice(zi, 2); }
// --phase 0.5 = noon, 0 = midnight, 0.27 = dawn
let phase = null;
const pi = args.indexOf('--phase');
if (pi >= 0) { phase = Number(args[pi + 1]); args.splice(pi, 2); }
const suffix = phase === null ? '' : `-p${phase}`;
const rooms = args.length ? args : ['lobby'];
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:8080');
await page.waitForFunction(() => window.app?.renderer && window.__pixelHotel, null, { timeout: 20000 });

const hideDialogs = () => page.evaluate(() => {
  document.querySelectorAll('.modal:not(.hidden)').forEach((el) => el.classList.add('hidden'));
});
await page.waitForTimeout(500);
// First-run flow: welcome dialog, then the wardrobe.
for (const label of ['Got it!', 'Cancel']) {
  const btn = page.getByRole('button', { name: label }).first();
  if (await btn.isVisible().catch(() => false)) { await btn.click(); await page.waitForTimeout(400); }
}
await hideDialogs();
for (const room of rooms) {
  await page.evaluate((r) => window.__pixelHotel.takeElevator(r), room);
  await page.waitForTimeout(2200);
  await hideDialogs();
  await page.evaluate((z) => { window.__pixelHotel.resetZoom(); window.__pixelHotel.setZoom(z); }, zoom);
  if (phase !== null) await page.evaluate((p) => window.__pixelHotel.setDayPhase(p), phase);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${room}${suffix}.png` });
}
const info = await page.evaluate(() => ({
  backend: window.app.renderer.name,
  stageChildren: window.app.stage.children.length,
}));
await browser.close();
console.log(JSON.stringify({ ...info, errors }, null, 2));
process.exit(errors.length ? 1 : 0);
