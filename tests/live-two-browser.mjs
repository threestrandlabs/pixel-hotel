// LIVE two-browser end-to-end test for Pixel Hotel multiplayer (v0.8.0+).
//
// NOT part of `npm test` / `npm run test:smoke` — run manually with:
//   node tests/live-two-browser.mjs
//
// Unlike tests/smoke.spec.mjs's mocked-browser flow, this script installs
// NO fake Supabase client: it serves the real repo locally and drives two
// separate real Playwright browser contexts (two independent anonymous
// sessions, two independent localStorages) through the real DOM against the
// REAL Supabase project configured in js/config.js (public URL + publishable
// key only — RLS enforces everything server-side). Requires outbound network
// access to that project and to the esm.sh CDN. Never touches service_role
// or any secret — only what already ships in the client bundle.
//
// Each run creates two brand-new throwaway anonymous Supabase auth users
// (fresh friend code / room each time), so it's safe to re-run repeatedly.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8736;
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

let passed = 0;
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log(`PASS - ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL - ${name}: ${(err && err.message) || err}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

async function openGame(page) {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
  await page.keyboard.press('Escape'); // close first-run help overlay
  await page.waitForTimeout(100);
}

async function connect(page, displayName) {
  await page.click('#btnMultiplayer');
  await page.waitForTimeout(100);
  await page.click('[data-tab="mpConnectTab"]');
  await page.fill('#mpDisplayNameInput', displayName);
  await page.click('#btnMpConnect');
  await page.waitForFunction(
    () => !document.getElementById('mpSignedInRow').classList.contains('hidden'),
    null, { timeout: 25000 },
  );
  return (await page.textContent('#mpOwnCode')).trim();
}

async function profileId(page) {
  return page.evaluate(() => window.__mpDebugState?.profile?.id);
}

async function main() {
  console.log(`Starting static server on port ${PORT}...`);
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const killServer = () => { try { server.kill(); } catch (e) { /* ignore */ } };
  process.on('exit', killServer);

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch();
    const ctxA = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const ctxB = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    for (const [label, page] of [['A', pageA], ['B', pageB]]) {
      page.on('pageerror', (err) => console.error(`[${label} pageerror]`, String(err)));
    }

    await openGame(pageA);
    await openGame(pageB);

    let aliceCode, bobCode, aliceId, bobId, inviteCode;

    await step('A connects and receives a well-formed friend code', async () => {
      aliceCode = await connect(pageA, 'Alice');
      assert(/^[A-Z2-9]{6}$/.test(aliceCode), `bad friend code: ${aliceCode}`);
      aliceId = await profileId(pageA);
      assert(aliceId, 'missing Alice profile id');
    });

    await step('B connects and receives a well-formed friend code', async () => {
      bobCode = await connect(pageB, 'Bob');
      assert(/^[A-Z2-9]{6}$/.test(bobCode), `bad friend code: ${bobCode}`);
      bobId = await profileId(pageB);
      assert(bobId, 'missing Bob profile id');
    });

    await step("B visits A's room by friend code", async () => {
      await pageB.click('[data-tab="mpVisitTab"]');
      await pageB.fill('#mpVisitCodeInput', aliceCode);
      await pageB.click('#btnMpVisit');
      await pageB.waitForFunction(
        () => document.getElementById('mpGuestbookWrap').textContent.includes('Alice'),
        null, { timeout: 15000 },
      );
    });

    await step('B leaves a note; the bad-word filter censors it client-side before it is posted', async () => {
      await pageB.fill('#mpNoteInput', 'this place is fucking amazing');
      await pageB.click('#mpNoteForm button[type="submit"]');
      await pageB.waitForFunction(
        () => document.getElementById('mpGuestbookWrap').textContent.includes('*******'),
        null, { timeout: 15000 },
      );
      const html = await pageB.innerHTML('#mpGuestbookWrap');
      assert(html.includes('this place is ******* amazing'), `note not censored as expected: ${html}`);
      assert(!html.includes('fucking'), 'uncensored profanity leaked into the DOM');
    });

    await step('B likes the note', async () => {
      await pageB.click('[data-like]');
      await pageB.waitForFunction(
        () => document.querySelector('.mp-like-btn.active') !== null,
        null, { timeout: 15000 },
      );
    });

    await step("A sees B's note and like count, then deletes the note (owner delete)", async () => {
      await pageA.click('[data-tab="mpConnectTab"]');
      await pageA.click('#btnMpOwnGuestbook');
      await pageA.waitForFunction(
        () => document.getElementById('mpGuestbookWrap').textContent.includes('Bob'),
        null, { timeout: 15000 },
      );
      const html = await pageA.innerHTML('#mpGuestbookWrap');
      assert(html.includes('this place is ******* amazing'), "A did not see B's note");
      assert(/♥ 1/.test(html), 'A did not see a like count of 1 on the note');
      await pageA.click('[data-delete-note]');
      await pageA.waitForFunction(
        () => !document.getElementById('mpGuestbookWrap').textContent.includes('this place is'),
        null, { timeout: 15000 },
      );
    });

    await step('B leaves the visit scene before joining a party room', async () => {
      await pageB.click('[data-tab="mpVisitTab"]');
      if (await pageB.locator('#btnMpLeaveVisit').count()) {
        await pageB.click('#btnMpLeaveVisit');
        await pageB.waitForTimeout(150);
      }
    });

    await step('A creates an invite-code party room', async () => {
      await pageA.click('[data-tab="mpRoomTab"]');
      await pageA.click('#btnMpCreateRoom');
      await pageA.waitForFunction(
        () => !document.getElementById('mpRoomActiveRow').classList.contains('hidden'),
        null, { timeout: 15000 },
      );
      inviteCode = (await pageA.textContent('#mpRoomCode')).trim();
      assert(inviteCode.length >= 6, 'invite code looks wrong');
    });

    await step("B joins A's party room with the invite code", async () => {
      await pageB.click('[data-tab="mpRoomTab"]');
      await pageB.fill('#mpJoinCodeInput', inviteCode);
      await pageB.click('#btnMpJoinRoom');
      await pageB.waitForFunction(
        () => !document.getElementById('mpRoomActiveRow').classList.contains('hidden'),
        null, { timeout: 15000 },
      );
      const codeSeenByB = (await pageB.textContent('#mpRoomCode')).trim();
      assert(codeSeenByB === inviteCode, 'B landed in the wrong room code');
    });

    await step('A and B each see the other in presence (member list)', async () => {
      await pageA.waitForFunction(
        () => document.getElementById('mpMemberList').textContent.includes('Bob'),
        null, { timeout: 15000 },
      );
      await pageB.waitForFunction(
        () => document.getElementById('mpMemberList').textContent.includes('Alice'),
        null, { timeout: 15000 },
      );
    });

    await step('movement broadcasts from each side are reflected as the remote avatar on the other side', async () => {
      await pageB.waitForFunction(
        (id) => window.__pixelHotel.getRemoteMultiplayer().some((e) => e.id === `mp-${id}`),
        aliceId, { timeout: 15000 },
      );
      await pageA.waitForFunction(
        (id) => window.__pixelHotel.getRemoteMultiplayer().some((e) => e.id === `mp-${id}`),
        bobId, { timeout: 15000 },
      );
      const aliceOnBBefore = await pageB.evaluate(
        (id) => window.__pixelHotel.getRemoteMultiplayer().find((e) => e.id === `mp-${id}`), aliceId,
      );
      const bobOnABefore = await pageA.evaluate(
        (id) => window.__pixelHotel.getRemoteMultiplayer().find((e) => e.id === `mp-${id}`), bobId,
      );
      await pageA.evaluate(() => window.__pixelHotel.walkTo(4, 6));
      await pageB.evaluate(() => window.__pixelHotel.walkTo(6, 5));
      await pageA.waitForTimeout(900);
      await pageB.waitForTimeout(100);
      const aliceOnBAfter = await pageB.evaluate(
        (id) => window.__pixelHotel.getRemoteMultiplayer().find((e) => e.id === `mp-${id}`), aliceId,
      );
      const bobOnAAfter = await pageA.evaluate(
        (id) => window.__pixelHotel.getRemoteMultiplayer().find((e) => e.id === `mp-${id}`), bobId,
      );
      const moved = (p, q) => p && q && (Math.abs(p.x - q.x) > 0.3 || Math.abs(p.y - q.y) > 0.3);
      assert(moved(aliceOnBAfter, aliceOnBBefore), `B did not observe A's movement: ${JSON.stringify(aliceOnBBefore)} -> ${JSON.stringify(aliceOnBAfter)}`);
      assert(moved(bobOnAAfter, bobOnABefore), `A did not observe B's movement: ${JSON.stringify(bobOnABefore)} -> ${JSON.stringify(bobOnAAfter)}`);
    });

    await step('B sends a chat message that A receives', async () => {
      const beforeLen = (await pageA.textContent('#chatLog')).length;
      await pageB.fill('#chatInput', 'hello alice, good to be here');
      await pageB.click('#chatForm button[type="submit"]');
      await pageA.waitForFunction(
        (prevLen) => document.getElementById('chatLog').textContent.length > prevLen,
        beforeLen, { timeout: 10000 },
      );
      const after = await pageA.textContent('#chatLog');
      assert(after.includes('hello alice, good to be here'), "A's chat log is missing B's message");
    });

    await step("the bad-word filter censors B's chat message before A sees it", async () => {
      // Respect realtimeRoom.js's per-sender receive throttle (500ms) so this
      // message isn't dropped for arriving too soon after the previous one.
      await pageA.waitForTimeout(650);
      const beforeLen = (await pageA.textContent('#chatLog')).length;
      await pageB.fill('#chatInput', 'this hotel is fucking cozy');
      await pageB.click('#chatForm button[type="submit"]');
      await pageA.waitForFunction(
        (prevLen) => document.getElementById('chatLog').textContent.length > prevLen,
        beforeLen, { timeout: 10000 },
      );
      const after = await pageA.textContent('#chatLog');
      assert(after.includes('this hotel is ******* cozy'), `A did not see the censored chat message: ${after}`);
      assert(!after.includes('fucking'), "uncensored profanity reached A's chat log");
    });

    await step("A mutes B locally; B's further chat stops reaching A", async () => {
      await pageA.click(`[data-mute="${bobId}"]`);
      await pageA.waitForFunction(
        (id) => document.querySelector(`[data-mute="${id}"]`)?.textContent.includes('Unmute'),
        bobId, { timeout: 5000 },
      );
      const before = await pageA.textContent('#chatLog');
      await pageB.fill('#chatInput', 'are you still there alice');
      await pageB.click('#chatForm button[type="submit"]');
      await pageA.waitForTimeout(1500);
      const after = await pageA.textContent('#chatLog');
      assert(after === before, "A's chat log changed even though B is muted");
    });

    await step("a spoofed 'kicked' broadcast from B (non-owner) targeting A is ignored", async () => {
      await pageB.evaluate((targetUserId) => {
        window.__mpDebugState.channel.send({ type: 'broadcast', event: 'kicked', payload: { targetUserId } });
      }, aliceId);
      await pageA.waitForTimeout(1500);
      assert(
        (await pageA.locator('#mpRoomActiveRow:not(.hidden)').count()) === 1,
        'A was disconnected by a spoofed kick broadcast',
      );
      assert(
        (await pageA.textContent('#mpRoomCode')).trim() === inviteCode,
        'A left or changed rooms because of the spoofed kick',
      );
    });

    await step('A (owner) kicks B; B is removed from the room', async () => {
      await pageA.click(`[data-kick="${bobId}"]`);
      await pageB.waitForFunction(
        () => !document.getElementById('mpRoomIdleRow').classList.contains('hidden'),
        null, { timeout: 15000 },
      );
    });

    await step('B cannot rejoin the room with the same invite code after being kicked', async () => {
      await pageB.fill('#mpJoinCodeInput', inviteCode);
      await pageB.click('#btnMpJoinRoom');
      await pageB.waitForTimeout(1500);
      assert(
        (await pageB.locator('#mpRoomIdleRow:not(.hidden)').count()) === 1,
        'B was able to rejoin the room after being kicked',
      );
      const status = await pageB.textContent('#mpStatus');
      assert(/removed/i.test(status), `expected a "removed" status message, got: ${status}`);
    });

    await ctxA.close();
    await ctxB.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }

  console.log('');
  console.log(`${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

const watchdog = setTimeout(() => {
  console.error('Watchdog: live two-browser test exceeded 180s, forcing exit.');
  process.exit(1);
}, 180000);
watchdog.unref();

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
