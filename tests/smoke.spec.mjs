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

// Installed in-page via page.addInitScript() for the mocked multiplayer UI
// flow tests below. Builds a fake Supabase client (auth/rpc/from/channel)
// backed by a single shared in-memory "server" (window.__mpFakeServer), so
// multiple independently-created client instances within the SAME page can
// represent different simulated users talking to the same fake backend and
// the same fake Realtime bus — without any real network/CDN access. Mirrors
// the migration's rules (ownership checks, invite-code/kick gating) the same
// way tests/multiplayer.unit.test.mjs's Node-side fake does.
function installMpFakeServer() {
  const db = {
    profiles: new Map(), friendCodes: new Map(), notes: [], likes: new Set(),
    snapshots: new Map(), rooms: new Map(), access: new Set(), kicks: new Set(),
  };
  let nextId = 1;
  let noteSeq = 1;
  let codeSeq = 1;
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function genCode(len) {
    let n = codeSeq++;
    let out = '';
    for (let i = 0; i < len; i++) { out += CODE_ALPHABET[n % CODE_ALPHABET.length]; n = Math.floor(n / CODE_ALPHABET.length) + i + 1; }
    return out;
  }
  function uuid() {
    const h = (nextId++).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${h}`;
  }
  const MAX_NOTES_PER_HOUR = 5;
  const buses = new Map(); // topic -> { members: Map<key,meta>, subs: Set<channelObj> }
  function getBus(topic) {
    if (!buses.has(topic)) buses.set(topic, { members: new Map(), subs: new Set() });
    return buses.get(topic);
  }

  function createClient() {
    let currentUserId = null;
    function requireAuth() { if (!currentUserId) throw new Error('not authenticated'); return currentUserId; }
    const auth = {
      async getSession() { return { data: { session: currentUserId ? { user: { id: currentUserId } } : null }, error: null }; },
      async signInAnonymously() { currentUserId = uuid(); return { data: { user: { id: currentUserId } }, error: null }; },
      async signOut() { currentUserId = null; return { error: null }; },
    };

    async function rpc(name, args = {}) {
      try {
        switch (name) {
          case 'ensure_profile': {
            const uid = requireAuth();
            let profile = db.profiles.get(uid);
            if (profile) {
              if (args.p_display_name) { profile = { ...profile, display_name: args.p_display_name }; db.profiles.set(uid, profile); }
              return { data: profile, error: null };
            }
            const code = genCode(6);
            profile = { id: uid, display_name: args.p_display_name || 'Guest', friend_code: code };
            db.profiles.set(uid, profile);
            db.friendCodes.set(code, uid);
            return { data: profile, error: null };
          }
          case 'lookup_owner_by_friend_code': {
            const ownerId = db.friendCodes.get(String(args.p_code).toUpperCase());
            if (!ownerId) return { data: [], error: null };
            const profile = db.profiles.get(ownerId);
            return { data: [{ owner_id: ownerId, display_name: profile.display_name }], error: null };
          }
          case 'get_display_names': {
            const rows = (args.p_ids || []).map((id) => db.profiles.get(id)).filter(Boolean)
              .map((p) => ({ id: p.id, display_name: p.display_name }));
            return { data: rows, error: null };
          }
          case 'create_multiplayer_room': {
            const uid = requireAuth();
            const code = genCode(6);
            const room = { code, owner_id: uid, active: true };
            db.rooms.set(code, room);
            db.access.add(`${code}:${uid}`);
            return { data: room, error: null };
          }
          case 'join_multiplayer_room': {
            const uid = requireAuth();
            const code = String(args.p_code).toUpperCase();
            const room = db.rooms.get(code);
            if (!room || !room.active) return { data: null, error: new Error('invalid_or_inactive_code') };
            if (db.kicks.has(`${code}:${uid}`)) return { data: null, error: new Error('kicked_from_room') };
            db.access.add(`${code}:${uid}`);
            return { data: room, error: null };
          }
          case 'kick_from_multiplayer_room': {
            const uid = requireAuth();
            const room = db.rooms.get(args.p_code);
            if (!room || room.owner_id !== uid) return { data: null, error: new Error('not_room_owner') };
            db.access.delete(`${args.p_code}:${args.p_target_user}`);
            db.kicks.add(`${args.p_code}:${args.p_target_user}`);
            return { data: null, error: null };
          }
          case 'check_kicked_from_room': {
            const uid = requireAuth();
            return { data: db.kicks.has(`${String(args.p_code).toUpperCase()}:${uid}`), error: null };
          }
          case 'submit_arcade_score': {
            const uid = requireAuth();
            const { p_game, p_score } = args;
            if (!['noodle_snake', 'brick_bash', 'block_drop'].includes(p_game)) return { data: null, error: new Error('invalid_game') };
            if (typeof p_score !== 'number' || p_score < 0) return { data: null, error: new Error('invalid_score') };
            const profile = db.profiles.get(uid);
            const entry = {
              id: uuid(),
              user_id: uid,
              game: p_game,
              score: p_score,
              display_name: profile ? profile.display_name : 'Guest',
              created_at: new Date().toISOString(),
            };
            if (!db.arcadeScores) db.arcadeScores = [];
            db.arcadeScores.push(entry);
            return { data: { ok: true, id: entry.id, game: p_game, score: p_score }, error: null };
          }
          case 'get_arcade_leaderboard': {
            const uid = currentUserId;
            const { p_game, p_mine_only, p_limit = 10 } = args;
            let rows = (db.arcadeScores || []).filter((r) => r.game === p_game);
            if (p_mine_only) rows = rows.filter((r) => r.user_id === uid);
            rows.sort((a, b) => b.score - a.score);
            return { data: rows.slice(0, p_limit), error: null };
          }
          default:
            return { data: null, error: new Error(`unknown rpc ${name}`) };
        }
      } catch (err) {
        return { data: null, error: err };
      }
    }

    function matchFilters(row, filters) {
      return filters.every(([col, val, kind]) => (kind === 'in' ? val.includes(row[col]) : row[col] === val));
    }

    function exec(table, b) {
      if (table === 'room_notes') {
        if (b._op === 'insert') {
          const uid = currentUserId;
          const payload = b._payload;
          if (payload.author_id !== uid) return { data: null, error: new Error('author_id must match the authenticated user') };
          const author = db.profiles.get(payload.author_id);
          if (!author) return { data: null, error: new Error('author profile not found') };
          if (!db.profiles.has(payload.room_owner_id)) return { data: null, error: new Error('room owner not found') };
          if (payload.body.length === 0 || payload.body.length > 140) return { data: null, error: new Error('body_len') };
          const hourAgo = Date.now() - 60 * 60 * 1000;
          const recentCount = db.notes.filter((n) => (
            n.author_id === payload.author_id && n.room_owner_id === payload.room_owner_id && n.created_at > hourAgo
          )).length;
          if (recentCount >= MAX_NOTES_PER_HOUR) return { data: null, error: new Error('rate_limited: max notes per room per hour') };
          const note = {
            id: `note-${noteSeq++}`, room_owner_id: payload.room_owner_id, author_id: payload.author_id,
            author_name: author.display_name, body: payload.body, created_at: Date.now(),
          };
          db.notes.push(note);
          return { data: note, error: null };
        }
        if (b._op === 'select') {
          // Matches the real listRoomNotes' .order('created_at', { ascending: false }) — newest first.
          // Tie-break on insertion order (the numeric id suffix) since two notes can share a Date.now() tick.
          const seqOf = (n) => Number(n.id.split('-')[1]);
          const rows = db.notes.filter((n) => matchFilters(n, b._filters))
            .sort((a, c) => (c.created_at - a.created_at) || (seqOf(c) - seqOf(a)));
          return { data: rows, error: null };
        }
        if (b._op === 'delete') {
          const [[, noteId]] = b._filters;
          const note = db.notes.find((n) => n.id === noteId);
          if (!note) return { data: null, error: null };
          const uid = currentUserId;
          if (note.author_id !== uid && note.room_owner_id !== uid) return { data: null, error: new Error('permission denied') };
          db.notes = db.notes.filter((n) => n.id !== noteId);
          return { data: null, error: null };
        }
      }
      if (table === 'room_note_likes') {
        if (b._op === 'select') {
          const noteIds = b._filters.find(([col]) => col === 'note_id')?.[1] || [];
          const rows = Array.from(db.likes).map((k) => k.split(':'))
            .filter(([noteId]) => noteIds.includes(noteId)).map(([note_id, author_id]) => ({ note_id, author_id }));
          return { data: rows, error: null };
        }
        if (b._op === 'upsert') { db.likes.add(`${b._payload.note_id}:${b._payload.author_id}`); return { data: null, error: null }; }
        if (b._op === 'delete') {
          const noteId = b._filters.find(([col]) => col === 'note_id')?.[1];
          const authorId = b._filters.find(([col]) => col === 'author_id')?.[1];
          db.likes.delete(`${noteId}:${authorId}`);
          return { data: null, error: null };
        }
      }
      if (table === 'room_snapshots') {
        if (b._op === 'upsert') { db.snapshots.set(b._payload.owner_id, b._payload.room_data); return { data: null, error: null }; }
        if (b._op === 'select') {
          const ownerId = b._filters.find(([col]) => col === 'owner_id')?.[1];
          const roomData = db.snapshots.get(ownerId);
          return { data: roomData ? { room_data: roomData } : null, error: null };
        }
      }
      return { data: null, error: new Error(`unhandled fake table/op ${table}/${b._op}`) };
    }

    function from(table) {
      const builder = {
        _filters: [], _op: null, _payload: null,
        eq(col, val) { this._filters.push([col, val]); return this; },
        in(col, vals) { this._filters.push([col, vals, 'in']); return this; },
        order() { return this; },
        select() { if (!this._op) this._op = 'select'; return this; },
        insert(payload) { this._op = 'insert'; this._payload = payload; return this; },
        upsert(payload) { this._op = 'upsert'; this._payload = payload; return this; },
        delete() { this._op = 'delete'; return this; },
        single() { this._single = true; return this; },
        maybeSingle() { this._single = true; this._maybe = true; return this; },
        then(resolve) { resolve(exec(table, this)); },
      };
      return builder;
    }

    function channel(topic, opts) {
      const bus = getBus(topic);
      const presenceKey = opts?.config?.presence?.key;
      const handlers = { presence: [], broadcast: {} };
      const chanObj = {
        on(type, filter, cb) {
          if (type === 'presence') handlers.presence.push(cb);
          else if (type === 'broadcast') { (handlers.broadcast[filter.event] ||= []).push(cb); }
          return chanObj;
        },
        subscribe(cb) {
          bus.subs.add(chanObj);
          if (cb) cb('SUBSCRIBED');
          return chanObj;
        },
        async track(meta) {
          bus.members.set(presenceKey, meta);
          for (const sub of bus.subs) sub._handlers.presence.forEach((fn) => fn());
          return 'ok';
        },
        presenceState() {
          const out = {};
          for (const [k, v] of bus.members) out[k] = [v];
          return out;
        },
        async send({ type, event, payload }) {
          if (type === 'broadcast') {
            for (const sub of bus.subs) {
              if (sub === chanObj) continue; // approximates config.broadcast.self === false
              (sub._handlers.broadcast[event] || []).forEach((fn) => fn({ payload }));
            }
          }
          return 'ok';
        },
        async unsubscribe() {
          bus.subs.delete(chanObj);
          if (presenceKey) bus.members.delete(presenceKey);
          for (const sub of bus.subs) sub._handlers.presence.forEach((fn) => fn());
          return 'ok';
        },
      };
      chanObj._handlers = handlers;
      return chanObj;
    }

    return { auth, rpc, from, channel, _setUser: (id) => { currentUserId = id; } };
  }

  window.__mpCreateClient = createClient;
  window.__mpTestClientFactory = createClient;
}

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
    const networkRequests = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('request', (req) => networkRequests.push(req.url()));

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
    check('lobby, gym, myroom, rooftop, and library start furnished',
      seeded.lobby.placed.length > 5 &&
      seeded.gym.placed.length > 5 &&
      seeded.myroom.placed.length >= 6 &&
      seeded.rooftop.placed.length > 5 &&
      seeded.library.placed.length >= 25
    );

    // ---- v0.8.1: lamps are not toggleable on public floors (show a hint, no state change) ----
    // Checked here, while still on the starting lobby floor, so this never disturbs the
    // camera framing other checks further down rely on.
    const lobbyLampBefore = await page.evaluate(() => window.__pixelHotel.getState().rooms.lobby.lightsOn);
    const lobbyToggleRes = await page.evaluate(() => window.__pixelHotel.interactWith('lamp', true));
    const lobbyLampAfter = await page.evaluate(() => window.__pixelHotel.getState().rooms.lobby.lightsOn);
    check(
      'the lobby lamp (public floor) ignores the toggle — interaction is rejected and lightsOn is unchanged',
      lobbyToggleRes === false && lobbyLampBefore !== false && lobbyLampAfter !== false
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

    // ---- v0.11.1: Follow Camera toggle, below the zoom controls cluster, defaults off ----
    const followLayout = await page.evaluate(() => {
      const zoomBox = document.getElementById('zoomControls').getBoundingClientRect();
      const followBox = document.getElementById('btnFollowCamera').getBoundingClientRect();
      return { zoomBottom: zoomBox.bottom, followTop: followBox.top };
    });
    check('Follow Camera toggle sits below the zoom controls cluster', followLayout.followTop >= followLayout.zoomBottom - 1);
    const followDefault = await page.evaluate(() => window.__pixelHotel.getState().settings.followCamera);
    check('Follow Camera defaults off', followDefault === false);
    const followAriaBefore = await page.getAttribute('#btnFollowCamera', 'aria-pressed');
    check('Follow Camera button reports off via aria-pressed', followAriaBefore === 'false');
    await page.click('#btnFollowCamera');
    await page.waitForTimeout(80);
    const followAfterOn = await page.evaluate(() => window.__pixelHotel.getState().settings.followCamera);
    const followAriaOn = await page.getAttribute('#btnFollowCamera', 'aria-pressed');
    check('clicking Follow Camera turns it on', followAfterOn === true && followAriaOn === 'true');
    await page.click('#btnFollowCamera');
    await page.waitForTimeout(80);
    const followAfterOff = await page.evaluate(() => window.__pixelHotel.getState().settings.followCamera);
    const followAriaOff = await page.getAttribute('#btnFollowCamera', 'aria-pressed');
    check('clicking Follow Camera again turns it back off', followAfterOff === false && followAriaOff === 'false');

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
      const c = document.getElementById('bgCanvas') || document.getElementById('gameCanvas');
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
    // ---- v0.8.3: cassette player minimise toggle & seek bar ----
    check('cassette tape view is visible in expanded player', await page.locator('#mpCassette').isVisible());
    check('shuffle toggle is visible in expanded player', await page.locator('#mpShuffle').isVisible());
    await page.click('#mpShuffle');
    await page.waitForTimeout(80);
    const mpShufOn = await page.evaluate(() => window.__pixelHotel.getState().settings.shuffle);
    check('shuffle toggle updates state and persists in save settings', mpShufOn === true);
    await page.click('#mpShuffle');
    await page.waitForTimeout(80);
    await page.click('#mpCollapse');
    await page.waitForTimeout(80);
    const mpMin = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
    check('music player minimise toggle collapses to compact size', mpMin.minimized === true && !(await page.locator('#mpCassette').isVisible()) && !(await page.locator('#mpShuffle').isVisible()) && (await page.locator('#mpProgressBar').isVisible()));
    await page.click('#mpCollapse');
    await page.waitForTimeout(80);
    const mpExp = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
    check('music player expands back to cassette view', mpExp.minimized === false && (await page.locator('#mpCassette').isVisible()));

    // Seek check: seeking changes currentTime and updates elapsed time display
    await page.evaluate(() => window.__pixelHotel.seekMusic(35));
    await page.waitForTimeout(80);
    const mpAfterSeek = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
    const curTimeLabel = await page.textContent('#mpTimeCurrent');
    check('seeking changes currentTime and updates elapsed time display', Math.abs(mpAfterSeek.currentTime - 35) < 1.0 && curTimeLabel === '0:35');

    // Seek via progress bar pointer interaction
    const pBarBox = await page.locator('#mpProgressBar').boundingBox();
    if (pBarBox) {
      await page.mouse.click(pBarBox.x + pBarBox.width * 0.2, pBarBox.y + pBarBox.height * 0.5);
      await page.waitForTimeout(80);
      const mpAfterClickSeek = await page.evaluate(() => window.__pixelHotel.getMusicPlayerState());
      check('clicking progress bar seeks track to target position', mpAfterClickSeek.currentTime > 0);
    }

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

    // ---- v0.8.1: elevator doormat trigger opens a centred modal; avatar never enters the car ----
    await page.evaluate(() => window.__pixelHotel.walkTo(4, 1)); // lobby's elevator doormat tile
    // v0.8.2: the lobby is much bigger now, so the walk there can take longer than a fixed
    // timeout — poll for arrival instead of sleeping a fixed duration.
    await page.waitForFunction(
      () => { const p = window.__pixelHotel.getState().player; return p.x === 4 && p.y === 1; },
      null,
      { timeout: 8000 },
    ).catch(() => {});
    const doormatState = await page.evaluate(() => ({
      player: window.__pixelHotel.getState().player,
      hidden: document.getElementById('elevatorPanel').classList.contains('hidden'),
    }));
    check(
      'stepping on the doormat tile opens the elevator modal and the avatar stays off the door tile',
      doormatState.hidden === false && doormatState.player.x === 4 && doormatState.player.y === 1
    );
    const modalBox = await page.evaluate(() => {
      const backdrop = document.getElementById('elevatorPanel');
      const box = backdrop.querySelector('.elevator-modal-box');
      const bRect = backdrop.getBoundingClientRect();
      const rRect = box.getBoundingClientRect();
      const centeredX = Math.abs((rRect.left + rRect.right) / 2 - (bRect.left + bRect.right) / 2) < 2;
      const centeredY = Math.abs((rRect.top + rRect.bottom) / 2 - (bRect.top + bRect.bottom) / 2) < 2;
      return { centeredX, centeredY };
    });
    check('the elevator directory is a centred modal box, not a side panel', modalBox.centeredX && modalBox.centeredY);

    await page.keyboard.press('Escape');
    check('Esc closes the elevator modal', await page.evaluate(() => document.getElementById('elevatorPanel').classList.contains('hidden')));

    await page.keyboard.press('e');
    await page.waitForTimeout(100);
    check('the E key shortcut reopens the same elevator modal', !(await page.evaluate(() => document.getElementById('elevatorPanel').classList.contains('hidden'))));

    await page.mouse.click(5, 5); // backdrop, well outside the centred modal box
    check('clicking outside the modal box (the dimmed backdrop) closes it', await page.evaluate(() => document.getElementById('elevatorPanel').classList.contains('hidden')));

    await page.click('#btnElevator');
    await page.waitForTimeout(100);
    await page.click('[data-close="elevatorPanel"]');
    check('the close (X) button closes the elevator modal', await page.evaluate(() => document.getElementById('elevatorPanel').classList.contains('hidden')));

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

    // ---- v0.8.5: gym floor plays the v2 gym.mp3 file (Music by James), not the procedural fallback ----
    await page.waitForTimeout(400);
    const gymAudio = await page.evaluate(() => window.__pixelHotel.getAudioState().mood);
    check('gym floor music resolves to the gym.mp3 file', gymAudio.src === 'audio/music/v2/gym.mp3');
    check('gym floor music plays the file track, not the procedural fallback', gymAudio.usingFile === true && gymAudio.fallback === false);
    check('music player shows the gym floor track title', gymAudio.label === 'Gym');

    // ---- v0.8.5: switching floors crossfades to the new floor's file track ----
    await page.evaluate(() => window.__pixelHotel.takeElevator('library'));
    await page.waitForTimeout(400);
    const libraryAudio = await page.evaluate(() => window.__pixelHotel.getAudioState().mood);
    check('switching floors crossfades to the new floor\'s file', libraryAudio.src === 'audio/music/v2/library.mp3' && libraryAudio.usingFile === true);
    check('music player shows the library floor track title', libraryAudio.label === 'Library');
    await page.evaluate(() => window.__pixelHotel.takeElevator('gym'));
    await page.waitForTimeout(400);

    // ---- a failed music file falls back to the procedural synth track ----
    const fallbackInfo = await page.evaluate(() => window.__pixelHotel.simulateMusicFileError('gym'));
    check('a failing music file marks that track as fallback', fallbackInfo.fallback === true && fallbackInfo.usingFile === false);
    check('fallback keeps the procedural synth title instead of the file label', fallbackInfo.label !== 'Gym' && fallbackInfo.label.length > 0);

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

    // ---- v0.8.7: Arcade (Floor 6) cabinets & leaderboard screen ----
    await page.evaluate(() => {
      window.__pixelHotel.takeElevator('arcade');
    });
    await page.waitForTimeout(500);
    const stateInArcade = await page.evaluate(() => window.__pixelHotel.getState());
    check('elevator travel to Arcade works', stateInArcade.room === 'arcade' && stateInArcade.floor === 6);
    const roomLabelArcade = await page.textContent('#roomName');
    check('floor indicator updates for Arcade', roomLabelArcade.includes('Floor 6') && roomLabelArcade.includes('Arcade'));

    // Cabinet interaction opens centered arcade game modal
    await page.evaluate(() => {
      window.__pixelHotel.interactWith('arcade_snake_1', true);
    });
    await page.waitForTimeout(200);
    const arcadeModalOpen = !(await page.evaluate(() => document.getElementById('arcadeGameModal').classList.contains('hidden')));
    check('using an arcade cabinet opens the centered arcade game modal', arcadeModalOpen);
    const arcadeTitle = await page.textContent('#arcadeGameTitle');
    check('arcade game modal displays game title', arcadeTitle.includes('Noodle Snake'));

    // Esc closes arcade modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const arcadeModalClosed = await page.evaluate(() => document.getElementById('arcadeGameModal').classList.contains('hidden'));
    check('Esc closes the arcade game modal', arcadeModalClosed);

    // Leaderboard board object interaction opens leaderboard modal
    await page.evaluate(() => {
      window.__pixelHotel.interactWith('arcade_leaderboard', true);
    });
    await page.waitForTimeout(200);
    const lbModalOpen = !(await page.evaluate(() => document.getElementById('arcadeLeaderboardModal').classList.contains('hidden')));
    check('using arcade leaderboard board object opens the leaderboard modal', lbModalOpen);

    // Esc closes leaderboard modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const lbModalClosed = await page.evaluate(() => document.getElementById('arcadeLeaderboardModal').classList.contains('hidden'));
    check('Esc closes the arcade leaderboard modal', lbModalClosed);

    // ---- elevator travel to My Room (Floor 11) and furniture placement persistence ----
    await page.keyboard.press('e');
    await page.waitForTimeout(100);
    await page.click('[data-floor-room="myroom"]');
    await page.waitForTimeout(500);
    const stateInMyRoom = await page.evaluate(() => window.__pixelHotel.getState());
    check('elevator travel to My Room works', stateInMyRoom.room === 'myroom' && stateInMyRoom.floor === 11);

    // ---- v0.8.1: Shop opens on category tiles; a tile drills into its filtered item list ----
    await page.click('#btnInventory');
    await page.waitForTimeout(80);
    const shopLandsOnTiles = await page.evaluate(() => ({
      tileCount: document.querySelectorAll('#shopTab .category-tile').length,
      buyButtons: document.querySelectorAll('#shopTab [data-buy]').length,
    }));
    check('Shop tab first shows category tiles, not a flat item list', shopLandsOnTiles.tileCount > 1 && shopLandsOnTiles.buyButtons === 0);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-shop-categories.png') });
    const lightingTile = page.locator('#shopTab .category-tile[data-category="lighting"]');
    const lightingCount = await lightingTile.locator('.category-tile-count').textContent();
    await lightingTile.click();
    await page.waitForTimeout(80);
    const shopCategoryItems = await page.evaluate(() => document.querySelectorAll('#shopTab [data-buy]').length);
    check('clicking a category tile opens its submenu list with only that category\'s items', String(shopCategoryItems) === lightingCount.trim());
    check('the submenu has a Back button', (await page.locator('#shopTab .category-back-btn').count()) === 1);
    await page.click('#shopTab .category-back-btn');
    await page.waitForTimeout(80);
    check('Back returns to the category tile grid', (await page.locator('#shopTab .category-tile').count()) > 1);
    await page.click('[data-close="inventoryPanel"]');

    const buyRes = await page.evaluate(() => window.__pixelHotel.buy('plant'));
    check('buying a plant succeeds', buyRes.ok === true);
    const placeRes = await page.evaluate((instanceId) => window.__pixelHotel.placeAt(instanceId, 7, 6, 0), buyRes.instanceId);
    check('placing the plant in My Room succeeds', placeRes.ok === true);

    // ---- v0.8.1: the lamp in My Room toggles the room's own light on/off ----
    const myLampBefore = await page.evaluate(() => window.__pixelHotel.getState().rooms.myroom.lightsOn);
    check('My Room lamp starts on by default', myLampBefore !== false);
    const myToggleOff = await page.evaluate(() => window.__pixelHotel.interactWith('lamp', true));
    const myLampOff = await page.evaluate(() => window.__pixelHotel.getState().rooms.myroom.lightsOn);
    check('interacting with the lamp in My Room toggles the room light off', myToggleOff === true && myLampOff === false);
    const myToggleOn = await page.evaluate(() => window.__pixelHotel.interactWith('lamp', true));
    const myLampOn = await page.evaluate(() => window.__pixelHotel.getState().rooms.myroom.lightsOn);
    check('toggling the lamp again turns the room light back on', myToggleOn === true && myLampOn === true);
    // Leave the lamp off so the reload check below also verifies lightsOn persistence.
    await page.evaluate(() => window.__pixelHotel.interactWith('lamp', true));
    // interactWith() snapped the player onto the lamp's approach tile; re-entering the
    // room resets them to the spawn tile so the camera framing below (and the night-view
    // pixel sample at a fixed canvas coordinate) matches the pre-existing baseline.
    await page.evaluate(() => window.__pixelHotel.takeElevator('myroom'));
    await page.waitForTimeout(500);

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
    check('the My Room lamp off state persists across reload', stateAfterReload.rooms.myroom.lightsOn === false);
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
      const c = document.getElementById('bgCanvas') || document.getElementById('gameCanvas');
      const ctx = c.getContext('2d');
      const p = ctx.getImageData(100, 10, 1, 1).data;
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

    // High-floor screenshot (Floor 42 — Rooftop Lounge): open-air balustrade, lounge, bar,
    // infinity pool, and neighbouring isometric rooftops & haze, by day and by night.
    await page2x.evaluate(() => {
      window.__pixelHotel.takeElevator('rooftop');
      window.__pixelHotel.setDayPhase(0.52);
      window.__pixelHotel.interactWith('rooftop_sofa', true);
    });
    await page2x.waitForTimeout(550);
    const roofLabelDay = await page2x.textContent('#roomName');
    check('floor indicator shows the Rooftop by day', roofLabelDay.includes('Floor 42') && roofLabelDay.includes('Rooftop'));
    await page2x.screenshot({ path: path.join(SCREENSHOT_DIR, '08-rooftop-day-2x.png') });
    await page2x.screenshot({ path: '/workspace/pixel-hotel-v060-highfloor.png' });

    // Rooftop at night: illuminated isometric city windows, streetlamps & warm emissive pools
    await page2x.evaluate(() => {
      window.__pixelHotel.setDayPhase(0.04);
    });
    await page2x.waitForTimeout(550);
    const roofLabelNight = await page2x.textContent('#roomName');
    check('floor indicator shows the Rooftop by night', roofLabelNight.includes('Floor 42') && roofLabelNight.includes('Rooftop'));
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

    // ---- v0.8.0: multiplayer panel opens/switches tabs with zero network calls until opt-in ----
    await page.click('#btnMultiplayer');
    await page.waitForTimeout(100);
    check('multiplayer panel opens', await page.locator('#multiplayerPanel:not(.hidden)').count() === 1);
    await page.click('[data-tab="mpVisitTab"]');
    await page.waitForTimeout(80);
    check('Visit Friend tab shows', await page.locator('#mpVisitTab:not(.hidden)').count() === 1);
    await page.click('[data-tab="mpRoomTab"]');
    await page.waitForTimeout(80);
    check('Party Room tab shows', await page.locator('#mpRoomTab:not(.hidden)').count() === 1);
    await page.click('[data-tab="mpConnectTab"]');
    await page.click('[data-close="multiplayerPanel"]');
    await page.waitForTimeout(80);
    const offendingRequests = networkRequests.filter((url) => /supabase\.co|esm\.sh/.test(url));
    check(
      'opening/using the multiplayer panel without clicking Connect makes zero requests to Supabase or the CDN (offline until opt-in)',
      offendingRequests.length === 0,
    );
    if (offendingRequests.length) console.error('unexpected multiplayer network requests:', offendingRequests);

    await context1x.close();
    await context2x.close();

    await runMobilePortraitSmokeTest(browser);

    await runMultiplayerUiFlowTests(browser);
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

// v0.8.8 Mobile-friendly portrait smoke test (390x844, hasTouch)
async function runMobilePortraitSmokeTest(browser) {
  console.log('Testing mobile portrait mode at 390x844 (hasTouch=true)...');
  const contextMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await contextMobile.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err?.stack || String(err)));

  try {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
    await page.waitForTimeout(300);

    const checkOverflow = async (label) => {
      const res = await page.evaluate(() => {
        const doc = document.documentElement;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scrollW = doc.scrollWidth;
        const issues = [];
        const checked = document.querySelectorAll('#app, #topbar, #gameArea, #chatDock, #topButtons, .panel:not(.hidden), .overlay:not(.hidden), .overlay-box');
        for (const el of checked) {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1.5 || r.left < -1.5) {
            issues.push({ id: el.id, class: el.className, left: Math.round(r.left), right: Math.round(r.right), vw });
          }
        }
        return { scrollW, vw, vh, horizontalOverflow: scrollW > vw, issues };
      });
      check(`${label}: document does not overflow horizontally`, !res.horizontalOverflow && res.issues.length === 0);
      if (res.issues.length) console.error(`${label} overflowing elements:`, res.issues);
    };

    // First-run help overlay: close on mobile
    const helpOpen = await page.locator('#helpOverlay:not(.hidden)').count();
    check('mobile: help overlay is shown initially on first run', helpOpen === 1);
    await checkOverflow('mobile: help overlay open');

    const helpText = await page.textContent('#helpOverlay');
    check('mobile: help text says "Tap" instead of "Click" on touch', helpText.includes('Tap a floor tile') && !helpText.includes('Click a floor tile'));

    const kbdHintVis = await page.evaluate(() => {
      const el = document.querySelector('.kbd-hint');
      return el && window.getComputedStyle(el).display !== 'none';
    });
    check('mobile: keyboard shortcuts row is hidden on touch devices', !kbdHintVis);

    await page.click('#btnHelpCloseTop');
    await page.waitForTimeout(100);
    check('mobile: closing help overlay hides it', (await page.locator('#helpOverlay:not(.hidden)').count()) === 0);

    // Check main screen viewport layout & canvas backing store
    await checkOverflow('mobile: main game screen');

    const canvasMetrics = await page.evaluate(() => {
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
      'mobile: canvas backing store matches CSS dimensions * DPR at 390x844',
      canvasMetrics.width === canvasMetrics.expectedW && canvasMetrics.height === canvasMetrics.expectedH
    );

    // Cassette player is minimized to a compact pill on mobile
    const mpMobile = await page.evaluate(() => {
      const mp = document.getElementById('musicPlayer');
      const r = mp.getBoundingClientRect();
      const cassetteVis = window.getComputedStyle(document.getElementById('mpCassette')).display !== 'none';
      return { width: r.width, height: r.height, cassetteVis };
    });
    check('mobile: cassette tape is hidden and music player forms a small pill', !mpMobile.cassetteVis && mpMobile.width <= 230);

    // v0.11.1: Follow Camera toggle fits on screen at 390x844 without overlapping the music player
    const followMobile = await page.evaluate(() => {
      const mp = document.getElementById('musicPlayer').getBoundingClientRect();
      const follow = document.getElementById('btnFollowCamera').getBoundingClientRect();
      const zoom = document.getElementById('zoomControls').getBoundingClientRect();
      return {
        mpRight: mp.right, followLeft: follow.left, followRight: follow.right,
        vw: window.innerWidth, followTop: follow.top, zoomBottom: zoom.bottom,
      };
    });
    check(
      'mobile 390x844: Follow Camera toggle sits below zoom controls, on-screen, and clear of the music player',
      followMobile.followTop >= followMobile.zoomBottom - 1 &&
      followMobile.followRight <= followMobile.vw + 1 &&
      followMobile.followLeft > followMobile.mpRight
    );

    // Tap to walk: record position before, tap canvas with touchscreen, assert position changes
    const playerBeforeTap = await page.evaluate(() => window.__pixelHotel.getState().player);
    const canvasBox = await page.locator('#gameCanvas').boundingBox();
    const tapX = canvasBox.x + canvasBox.width * 0.5 + 40;
    const tapY = canvasBox.y + canvasBox.height * 0.5 + 40;
    await page.touchscreen.tap(tapX, tapY);
    await page.waitForFunction(
      (start) => { const p = window.__pixelHotel.getState().player; return p.x !== start.x || p.y !== start.y; },
      playerBeforeTap,
      { timeout: 5000 },
    ).catch(() => {});
    const playerAfterTap = await page.evaluate(() => window.__pixelHotel.getState().player);
    check('mobile: touchscreen tap on floor tile walks the avatar', playerBeforeTap.x !== playerAfterTap.x || playerBeforeTap.y !== playerAfterTap.y);

    // Bottom action bar: audit tap targets >= 44px
    const tapTargets = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#topButtons .action-btn:not(.desktop-only)'));
      const small = [];
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        if (r.width < 43 || r.height < 43) {
          small.push({ id: b.id, width: r.width, height: r.height });
        }
      }
      return { total: btns.length, small };
    });
    check('mobile: bottom action bar buttons meet min 44px tap target requirements', tapTargets.total >= 5 && tapTargets.small.length === 0);
    if (tapTargets.small.length) console.error('buttons below 44px:', tapTargets.small);

    // Audit and test opening and closing each main panel as bottom sheets / modals:

    // 1. Elevator directory
    await page.click('#btnElevator');
    await page.waitForTimeout(150);
    check('mobile: elevator panel opens', await page.locator('#elevatorPanel:not(.hidden)').count() === 1);
    await checkOverflow('mobile: elevator panel');
    await page.click('[data-close="elevatorPanel"]');
    await page.waitForTimeout(100);
    check('mobile: elevator panel closes', await page.locator('#elevatorPanel.hidden').count() === 1);

    // 2. Inventory / Shop
    await page.click('#btnInventory');
    await page.waitForTimeout(150);
    check('mobile: inventory panel opens as bottom sheet', await page.locator('#inventoryPanel:not(.hidden)').count() === 1);
    await checkOverflow('mobile: inventory panel');
    await page.click('[data-close="inventoryPanel"]');
    await page.waitForTimeout(100);
    check('mobile: inventory panel closes', await page.locator('#inventoryPanel.hidden').count() === 1);

    // 3. Quests
    await page.click('#btnQuests');
    await page.waitForTimeout(150);
    check('mobile: quest panel opens as bottom sheet', await page.locator('#questPanel:not(.hidden)').count() === 1);
    await checkOverflow('mobile: quest panel');
    await page.click('[data-close="questPanel"]');
    await page.waitForTimeout(100);
    check('mobile: quest panel closes', await page.locator('#questPanel.hidden').count() === 1);

    // 4. Multiplayer
    await page.click('#btnMultiplayer');
    await page.waitForTimeout(150);
    check('mobile: multiplayer panel opens as bottom sheet', await page.locator('#multiplayerPanel:not(.hidden)').count() === 1);
    await checkOverflow('mobile: multiplayer panel');
    await page.click('[data-close="multiplayerPanel"]');
    await page.waitForTimeout(100);
    check('mobile: multiplayer panel closes', await page.locator('#multiplayerPanel.hidden').count() === 1);

    // 5. Settings / Audio Mixer
    await page.click('#btnMute');
    await page.waitForTimeout(150);
    check('mobile: audio settings panel opens as bottom sheet', await page.locator('#audioPanel:not(.hidden)').count() === 1);
    await checkOverflow('mobile: audio panel');
    await page.click('[data-close="audioPanel"]');
    await page.waitForTimeout(100);
    check('mobile: audio settings panel closes', await page.locator('#audioPanel.hidden').count() === 1);

    // 6. Room Upgrade Agency modal
    await page.click('#btnUpgradeRoom');
    await page.waitForTimeout(150);
    check('mobile: room upgrade agency modal opens', await page.locator('#roomUpgradeModal:not(.hidden)').count() === 1);
    await checkOverflow('mobile: upgrade modal');
    await page.click('#btnUpgradeClose');
    await page.waitForTimeout(100);
    check('mobile: room upgrade agency modal closes', await page.locator('#roomUpgradeModal.hidden').count() === 1);

    // 7. Arcade game modal & touch controls
    await page.evaluate(() => window.__pixelHotel.openArcadeGame('noodle_snake'));
    await page.waitForTimeout(150);
    check('mobile: arcade game modal opens', await page.locator('#arcadeGameModal:not(.hidden)').count() === 1);
    await checkOverflow('mobile: arcade game modal');
    const dpadCheck = await page.evaluate(() => {
      const up = document.getElementById('arcadeUp');
      const r = up ? up.getBoundingClientRect() : null;
      return { exists: !!up, width: r?.width, height: r?.height };
    });
    check('mobile: arcade on-screen D-pad has min 44px tap targets', dpadCheck.exists && dpadCheck.width >= 43 && dpadCheck.height >= 43);
    await page.click('#arcadeDown');
    await page.waitForTimeout(60);
    const arcadeState = await page.evaluate(() => window.__pixelHotel.getActiveArcadeState());
    check('mobile: tapping d-pad button issues game input', arcadeState.game?.nextDir?.dy === 1 || arcadeState.game?.dir?.dy === 1);
    await page.click('#btnArcadeClose');
    await page.waitForTimeout(100);
    check('mobile: arcade game modal closes', await page.locator('#arcadeGameModal.hidden').count() === 1);

    // 8. Arcade leaderboard modal
    await page.evaluate(() => window.__pixelHotel.openArcadeLeaderboard('noodle_snake', 'local'));
    await page.waitForTimeout(150);
    check('mobile: arcade leaderboard modal opens', await page.locator('#arcadeLeaderboardModal:not(.hidden)').count() === 1);
    await checkOverflow('mobile: leaderboard modal');
    await page.click('#btnLeaderboardClose');
    await page.waitForTimeout(100);
    check('mobile: arcade leaderboard modal closes', await page.locator('#arcadeLeaderboardModal.hidden').count() === 1);

    // 360x780 viewport layout & non-overlapping top controls check
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(100);

    const mpBox360 = await page.locator('#musicPlayer').boundingBox();
    const zoomBox360 = await page.locator('#zoomControls').boundingBox();
    check(
      'mobile 360px: cassette player and zoom controls do not overlap',
      mpBox360 && zoomBox360 && (mpBox360.x + mpBox360.width < zoomBox360.x)
    );
    const followBox360 = await page.locator('#btnFollowCamera').boundingBox();
    check(
      'mobile 360px: cassette player and the Follow Camera toggle do not overlap',
      mpBox360 && followBox360 && (mpBox360.x + mpBox360.width < followBox360.x)
    );

    // Verify bottom action bar fits at 360px and 390px without horizontal overflow
    for (const w of [360, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(60);
      const barFit = await page.evaluate(() => {
        const bar = document.getElementById('topButtons');
        const upgrade = document.getElementById('btnUpgradeRoom');
        const r = upgrade.getBoundingClientRect();
        return {
          barScrollW: bar.scrollWidth,
          barClientW: bar.clientWidth,
          upgradeRight: r.right,
          vw: window.innerWidth,
        };
      });
      check(`mobile: action bar fits at ${w}px wide without horizontal scrolling`, barFit.barScrollW <= barFit.barClientW + 1);
      check(`mobile: Upgrade button fits within viewport at ${w}px wide`, barFit.upgradeRight <= barFit.vw + 1);
    }
    await page.setViewportSize({ width: 360, height: 780 });

    // 9. Salon modal & top close button
    await page.evaluate(() => document.getElementById('salonModal')?.classList.remove('hidden'));
    await page.waitForTimeout(100);
    check('mobile: salon modal opens', (await page.locator('#salonModal:not(.hidden)').count()) === 1);
    await checkOverflow('mobile: salon modal at 360x780');
    await page.click('#btnSalonCloseTop');
    await page.waitForTimeout(100);
    check('mobile: salon modal closes via top close button', (await page.locator('#salonModal.hidden').count()) === 1);

    // 10. Pool prompt modal & top close button
    await page.evaluate(() => document.getElementById('poolPromptModal')?.classList.remove('hidden'));
    await page.waitForTimeout(100);
    check('mobile: pool prompt modal opens', (await page.locator('#poolPromptModal:not(.hidden)').count()) === 1);
    await checkOverflow('mobile: pool prompt modal at 360x780');
    await page.click('#btnPoolPromptClose');
    await page.waitForTimeout(100);
    check('mobile: pool prompt modal closes via top close button', (await page.locator('#poolPromptModal.hidden').count()) === 1);

    // Restore 390x844 viewport for Pool & Spa gameplay tests
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);

    // Floor 5 Azure Pool & Spa: travel via elevator
    await page.click('#btnElevator');
    await page.waitForTimeout(150);
    await page.click('button[data-floor-room="pool"]');
    await page.waitForTimeout(400);
    const currentRoom = await page.evaluate(() => window.__pixelHotel.getState().room);
    check('mobile: traveled to Floor 5 Azure Pool & Spa', currentRoom === 'pool');

    // Swimsuit gating: walking onto water without swimsuit is blocked with toast
    const walkWaterResult = await page.evaluate(() => window.__pixelHotel.walkTo(10, 16));
    const toastText = await page.textContent('#toast');
    check('mobile: entering pool without swimsuit is blocked with hint toast', walkWaterResult === false && toastText.includes('Change into your swimsuit first'));

    // Changing room: toggle swimsuit outfit
    await page.evaluate(() => window.__pixelHotel.setOutfit('swimsuit'));
    const outfitAfterChange = await page.evaluate(() => window.__pixelHotel.getOutfit());
    check('mobile: player changed into swimsuit', outfitAfterChange === 'swimsuit');

    // Walking onto water with swimsuit now succeeds
    const walkWaterSuccess = await page.evaluate(() => window.__pixelHotel.walkTo(10, 16));
    check('mobile: entering water in swimsuit succeeds', walkWaterSuccess === true);

    // Auto lap swimming
    await page.evaluate(() => window.__pixelHotel.swimLaps());
    const activityAfterLaps = await page.evaluate(() => window.__pixelHotel.getState().player.activity);
    check('mobile: lap swimming starts swim activity', activityAfterLaps?.kind === 'swim');

    // Exit pool via deck/steps
    await page.evaluate(() => window.__pixelHotel.exitPool());
    const activityAfterExit = await page.evaluate(() => window.__pixelHotel.getState().player.activity);
    check('mobile: exiting pool clears swim activity', activityAfterExit === null);

    // Antoine's Salon styling and hair dye
    await page.evaluate(() => {
      window.__pixelHotel.handleSalonStyle('ponytail');
      window.__pixelHotel.handleSalonColor('#4aa3df');
    });

    // Massage bed interaction and mood buff
    await page.evaluate(() => {
      const s = window.__pixelHotel.getState();
      const massageBed = s.rooms.pool.placed.find((p) => p.itemId === 'massage_bed');
      if (massageBed) window.__pixelHotel.interactWith(massageBed.instanceId, true);
    });
    await page.waitForTimeout(200);
    const playerStateAfterMassage = await page.evaluate(() => {
      const s = window.__pixelHotel.getState();
      return { lying: s.player.lying, sitting: s.player.sitting, buff: s.player.buff };
    });
    check('mobile: massage bed interaction sets lying pose and mood buff', (playerStateAfterMassage.lying === true || !!playerStateAfterMassage.sitting) && playerStateAfterMassage.buff?.name === 'Relaxed & Energized');

    // Chat dock & input with visualViewport
    await page.fill('#chatInput', 'mobile hello!');
    await page.click('#chatForm button[type="submit"]');
    await page.waitForTimeout(200);
    const chatTextMobile = await page.textContent('#chatLog');
    check('mobile: chat send works and appears in chat log', chatTextMobile.includes('mobile hello'));

    // v0.9.0 Avatar creator & emote interaction on 390x844 touch viewport
    const lookBefore = await page.evaluate(() => window.__pixelHotel.getPlayerLook());
    await page.click('#btnWardrobe');
    await page.waitForTimeout(150);
    check('mobile: avatar creator opens via wardrobe button', (await page.locator('#avatarModal:not(.hidden)').count()) === 1);
    await checkOverflow('mobile: avatar modal open at 390x844');

    // Change options: switch to hair tab, select a hairstyle and hair colour
    await page.click('[data-tab="hair"]');
    await page.waitForTimeout(80);
    const hairChoices = page.locator('#avatarTabContent .avatar-choice-btn');
    if ((await hairChoices.count()) > 1) {
      await hairChoices.nth(1).click();
      await page.waitForTimeout(60);
    }

    // Switch to top tab and select a top option
    await page.click('[data-tab="top"]');
    await page.waitForTimeout(80);
    const topChoices = page.locator('#avatarTabContent .avatar-choice-btn');
    if ((await topChoices.count()) > 1) {
      await topChoices.nth(1).click();
      await page.waitForTimeout(60);
    }

    // Save and wear
    await page.click('#btnSaveAvatar');
    await page.waitForTimeout(150);
    check('mobile: avatar creator closes on save', (await page.locator('#avatarModal.hidden').count()) === 1);

    const lookAfter = await page.evaluate(() => window.__pixelHotel.getPlayerLook());
    check('mobile: player look was updated after saving avatar', lookAfter && JSON.stringify(lookAfter) !== JSON.stringify(lookBefore));

    // Emotes: open emote bar, trigger emote, check active emote & speech bubble
    await page.click('#btnEmotes');
    await page.waitForTimeout(100);
    check('mobile: emote bar opens', (await page.locator('#emoteBar:not(.hidden)').count()) === 1);
    await checkOverflow('mobile: emote bar open');

    await page.click('button[data-emote="wave"]');
    await page.waitForTimeout(100);
    check('mobile: emote bar closes after triggering emote', (await page.locator('#emoteBar.hidden').count()) === 1);

    const emoteStatus = await page.evaluate(() => {
      const p = window.__pixelHotel.getState().player;
      return { emote: p.emote, bubbleText: p.bubbleText };
    });
    check('mobile: player wave emote and speech bubble icon active', emoteStatus.emote === 'wave' && emoteStatus.bubbleText === '👋');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-mobile-portrait-390x844.png') });

    check('mobile: no console errors', consoleErrors.length === 0);
    if (consoleErrors.length) console.error(consoleErrors);
    check('mobile: no uncaught page errors', pageErrors.length === 0);
    if (pageErrors.length) console.error(pageErrors);
  } finally {
    await contextMobile.close();
  }
}

// Mocked-browser multiplayer UI flow test (v0.8.0). Drives the REAL DOM/UI
// (Connect, Visit, note posting, owner delete, Party Room create/join,
// movement, chat filter, mute, kick) against the fake Supabase client
// installed by installMpFakeServer — never a real Supabase project. A
// second/third simulated "browser" (Bob/Carol/Dave) is a raw fake-client
// instance created directly via window.__mpCreateClient() and driven through
// the REAL js/multiplayer/*.js modules (dynamically imported in-page), not
// through the DOM — since this page's own UI module only supports one
// connected identity at a time, exactly like a real single browser tab.
async function runMultiplayerUiFlowTests(browser) {
  console.log('Running mocked-browser multiplayer UI flow tests...');
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(installMpFakeServer);
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pixelHotel, null, { timeout: 8000 });
  await page.keyboard.press('Escape'); // close the first-run help overlay
  await page.waitForTimeout(100);

  try {
    // ---- Connect ----
    await page.click('#btnMultiplayer');
    await page.waitForTimeout(80);
    await page.fill('#mpDisplayNameInput', 'Alice');
    await page.click('#btnMpConnect');
    await page.waitForFunction(
      () => !document.getElementById('mpSignedInRow').classList.contains('hidden'), null, { timeout: 4000 },
    );
    const aliceCode = (await page.textContent('#mpOwnCode')).trim();
    check('mp: Connect creates a profile with a well-formed friend code', /^[A-Z2-9]{6}$/.test(aliceCode));

    // ---- note + filter: posting a note to your own guestbook is censored client-side ----
    await page.click('#btnMpOwnGuestbook');
    await page.waitForTimeout(100);
    check('mp: "View My Guestbook" jumps to the Visit tab and labels it "(yours)"',
      (await page.textContent('#mpGuestbookWrap')).includes('(yours)'));
    await page.fill('#mpNoteInput', 'you fucking rock');
    await page.click('#mpNoteForm button[type="submit"]');
    await page.waitForTimeout(150);
    const ownNoteHtml = await page.innerHTML('#mpGuestbookWrap');
    check('mp: filter — a posted note is censored before ever reaching the (fake) server',
      ownNoteHtml.includes('you ******* rock') && !ownNoteHtml.includes('fucking'));

    // ---- a second simulated user ("Bob") posts a note to Alice's room via the real guestbook.js module ----
    const bobNote = await page.evaluate(async (ownerCode) => {
      const { signInAndEnsureProfile, fetchOwnerByFriendCode } = await import('/js/multiplayer/auth.js');
      const { addRoomNote } = await import('/js/multiplayer/guestbook.js');
      const bob = window.__mpCreateClient();
      await bob.auth.signInAnonymously();
      const bobProfile = await signInAndEnsureProfile(bob, 'Bob');
      const owner = await fetchOwnerByFriendCode(bob, ownerCode);
      return addRoomNote(bob, { ownerId: owner.ownerId, authorId: bobProfile.id, text: 'nice fucking place' });
    }, aliceCode);
    check('mp: a different user can post a note to the owner\'s room, also censored server-side-equivalent',
      bobNote.ok === true && bobNote.note.body === 'nice ******* place');

    // ---- owner delete: Alice deletes Bob's note from her own guestbook even though she didn't author it ----
    // "View My Guestbook" lives in the Connect tab, which the first click away from — switch back to it first.
    await page.click('[data-tab="mpConnectTab"]');
    await page.click('#btnMpOwnGuestbook');
    await page.waitForTimeout(150);
    const guestbookWithBobNote = await page.innerHTML('#mpGuestbookWrap');
    check('mp: owner sees the other author\'s censored note', guestbookWithBobNote.includes('nice ******* place'));
    await page.click('[data-delete-note]');
    await page.waitForTimeout(150);
    check('mp: owner delete removes another author\'s note', !(await page.textContent('#mpGuestbookWrap')).includes('nice'));

    // ---- Visit (a friend's room): transient read-only scene, no edits to the local save, restore on exit ----
    const beforeVisit = await page.evaluate(() => window.__pixelHotel.getState());
    const ownMyRoomBeforeVisit = JSON.stringify(beforeVisit.rooms.myroom.placed);
    const roomBeforeVisit = beforeVisit.room;

    const carolCode = await page.evaluate(async () => {
      const { signInAndEnsureProfile } = await import('/js/multiplayer/auth.js');
      const { pushRoomSnapshot } = await import('/js/multiplayer/guestbook.js');
      const carol = window.__mpCreateClient();
      await carol.auth.signInAnonymously();
      const profile = await signInAndEnsureProfile(carol, 'Carol');
      await pushRoomSnapshot(carol, profile.id, { placed: [{ instanceId: 'carol-plant', itemId: 'plant', x: 3, y: 3, rot: 0 }] });
      return profile.friend_code;
    });

    await page.click('[data-tab="mpVisitTab"]');
    await page.fill('#mpVisitCodeInput', carolCode);
    await page.click('#btnMpVisit');
    await page.waitForTimeout(250);
    const duringVisit = await page.evaluate(() => window.__pixelHotel.getState());
    check('mp: visit — the live scene switches to My Room to show the host\'s snapshot', duringVisit.room === 'myroom');
    check('mp: visit — guestbook header shows the host\'s display name',
      (await page.textContent('#mpGuestbookWrap')).includes('Carol'));

    await page.click('#btnInventory');
    await page.click('[data-tab="roomTab"]');
    await page.waitForTimeout(80);
    await page.click('#roomTab .category-tile'); // drill into Carol's one placed category to see the actual item row
    await page.waitForTimeout(80);
    const roomTabDuringVisit = await page.innerHTML('#roomTab');
    check('mp: visit — the visited room renders read-only (no Move/Pick up controls)',
      roomTabDuringVisit.includes('item-name') && !roomTabDuringVisit.includes('data-move') && !roomTabDuringVisit.includes('data-pickup'));

    await page.click('[data-tab="shopTab"]');
    await page.waitForTimeout(80);
    await page.click('#shopTab .category-tile'); // Shop opens on category tiles; drill into the first one
    await page.waitForTimeout(80);
    // Baseline right before the click, not before entering the visit — switching into My Room can itself
    // complete a "visit N rooms" quest and grant coins, which is unrelated to whether buying is blocked.
    const coinsJustBeforeBuy = (await page.evaluate(() => window.__pixelHotel.getState())).coins;
    await page.click('[data-buy]');
    await page.waitForTimeout(80);
    const coinsDuringVisit = (await page.evaluate(() => window.__pixelHotel.getState())).coins;
    check('mp: visit — buying is blocked while visiting (coins unchanged)', coinsDuringVisit === coinsJustBeforeBuy);
    await page.click('[data-close="inventoryPanel"]');

    // togglePanel() hides every .panel when opening another one, so re-open the multiplayer panel.
    await page.click('#btnMultiplayer');
    await page.click('[data-tab="mpVisitTab"]');
    await page.click('#btnMpLeaveVisit');
    await page.waitForTimeout(200);
    const afterVisit = await page.evaluate(() => window.__pixelHotel.getState());
    check('mp: visit — leaving restores the player\'s own previous room', afterVisit.room === roomBeforeVisit);
    check('mp: visit — the local save\'s My Room furniture is byte-for-byte unchanged after visiting',
      JSON.stringify(afterVisit.rooms.myroom.placed) === ownMyRoomBeforeVisit);

    // ---- Party Room: join, movement, chat/filter, mute, spoofed-kick rejection, real kick ----
    await page.click('[data-tab="mpRoomTab"]');
    await page.click('#btnMpCreateRoom');
    await page.waitForFunction(
      () => !document.getElementById('mpRoomActiveRow').classList.contains('hidden'), null, { timeout: 4000 },
    );
    const inviteCode = (await page.textContent('#mpRoomCode')).trim();
    check('mp: Create Party Room produces an invite code', inviteCode.length >= 6);

    const aliceProfileId = await page.evaluate(() => window.__mpDebugState.profile.id);

    const daveJoin = await page.evaluate(async (code) => {
      const { signInAndEnsureProfile } = await import('/js/multiplayer/auth.js');
      const { joinRoomByCode, openRoomChannel } = await import('/js/multiplayer/realtimeRoom.js');
      const dave = window.__mpCreateClient();
      await dave.auth.signInAnonymously();
      const profile = await signInAndEnsureProfile(dave, 'Dave');
      const joinResult = await joinRoomByCode(dave, code);
      const channel = openRoomChannel(dave, code, profile.id);
      await new Promise((resolve) => {
        channel.on('presence', { event: 'sync' }, () => {}).subscribe((status) => {
          if (status === 'SUBSCRIBED') { channel.track({ displayName: 'Dave' }).then(resolve); }
        });
      });
      window.__mpDave = { client: dave, profile, channel };
      return { ok: joinResult.ok, daveId: profile.id };
    }, inviteCode);
    check('mp: join — a second user joins the party room by invite code', daveJoin.ok === true);

    await page.waitForFunction(
      () => document.querySelector('#mpMemberList [data-mute]')?.textContent !== undefined
        && document.getElementById('mpMemberList').textContent.includes('Dave'),
      null, { timeout: 4000 },
    );
    check('mp: join — owner\'s member list shows the joined member via presence sync', true);

    // movement
    await page.evaluate(async ({ daveId }) => {
      const { broadcastPosition } = await import('/js/multiplayer/realtimeRoom.js');
      broadcastPosition(window.__mpDave.channel, { userId: daveId, displayName: 'Dave', x: 5, y: 6, dir: 'left' });
    }, { daveId: daveJoin.daveId });
    await page.waitForTimeout(250);
    const remoteAfterMove = await page.evaluate(() => window.__pixelHotel.getRemoteMultiplayer());
    const daveEntity = remoteAfterMove.find((e) => e.id === `mp-${daveJoin.daveId}`);
    check('mp: movement — the other member\'s broadcast position is reflected as a remote entity',
      !!daveEntity && Math.abs(daveEntity.x - 5) < 0.01 && Math.abs(daveEntity.y - 6) < 0.01);

    // chat (and implicitly: receive-side filter validation, since the payload round-trips through validateChatPayload)
    const chatLogBefore = await page.textContent('#chatLog');
    await page.evaluate(async ({ daveId }) => {
      const { broadcastChatBubble } = await import('/js/multiplayer/realtimeRoom.js');
      broadcastChatBubble(window.__mpDave.channel, 'hello from dave', { userId: daveId, displayName: 'Dave' });
    }, { daveId: daveJoin.daveId });
    await page.waitForTimeout(200);
    const chatLogAfterDaveChat = await page.textContent('#chatLog');
    check('mp: chat — a remote member\'s broadcast chat appears in the chat log',
      chatLogAfterDaveChat.length > chatLogBefore.length && chatLogAfterDaveChat.includes('hello from dave'));

    // mute: mute Dave, then confirm a further chat from Dave does NOT reach the chat log
    await page.click(`[data-mute="${daveJoin.daveId}"]`);
    await page.waitForTimeout(80);
    const chatLogBeforeMutedMsg = await page.textContent('#chatLog');
    await page.evaluate(async ({ daveId }) => {
      const { broadcastChatBubble } = await import('/js/multiplayer/realtimeRoom.js');
      broadcastChatBubble(window.__mpDave.channel, 'are you there', { userId: daveId, displayName: 'Dave' });
    }, { daveId: daveJoin.daveId });
    await page.waitForTimeout(200);
    const chatLogAfterMutedMsg = await page.textContent('#chatLog');
    check('mp: mute — a muted member\'s further chat does not reach the chat log',
      chatLogAfterMutedMsg === chatLogBeforeMutedMsg);

    // ---- v0.11: Group Mini-Games in party room ----
    // Host opens Games modal
    await page.click('#btnMpGames');
    await page.waitForTimeout(150);
    check('mp: minigames — host opens Games modal with game selection', await page.locator('#minigameHostView:not(.hidden)').count() === 1);

    // Host starts a game (Trivia)
    await page.click('[data-game="trivia"]');
    await page.waitForTimeout(200);
    check('mp: minigames — host starting game displays minigame HUD', await page.locator('#minigameHud:not(.hidden)').count() === 1);

    const hudHasContent = (await page.locator('#minigameHudContent').textContent()).trim().length > 0;
    check('mp: minigames — game HUD displays question and scoreboard state', hudHasContent);

    // Host leaves game to clean up
    await page.click('#btnMinigameHudLeave');
    await page.waitForTimeout(100);
    check('mp: minigames — leaving game dismisses HUD', await page.locator('#minigameHud.hidden').count() === 1);

    // security: a non-owner member (Dave) broadcasting a spoofed "kicked" event targeting the OWNER
    // must be ignored — the owner's client verifies against check_kicked_from_room, not the broadcast alone.
    await page.evaluate(async ({ targetUserId }) => {
      window.__mpDave.channel.send({ type: 'broadcast', event: 'kicked', payload: { targetUserId } });
    }, { targetUserId: aliceProfileId });
    await page.waitForTimeout(200);
    check('mp: kick security — a spoofed "kicked" broadcast targeting the owner is ignored (RPC-verified, not broadcast-trusted)',
      !(await page.locator('#mpRoomActiveRow.hidden').count()) && (await page.textContent('#mpRoomCode')).trim() === inviteCode);

    // real kick: the owner kicks Dave via the UI's Kick button
    await page.click(`[data-kick="${daveJoin.daveId}"]`);
    await page.waitForTimeout(150);
    const kickOutcome = await page.evaluate(async ({ code, daveId }) => {
      const { checkKicked, joinRoomByCode } = await import('/js/multiplayer/realtimeRoom.js');
      window.__mpDave.client._setUser(daveId);
      const kicked = await checkKicked(window.__mpDave.client, code);
      const rejoin = await joinRoomByCode(window.__mpDave.client, code);
      return { kicked, rejoin };
    }, { code: inviteCode, daveId: daveJoin.daveId });
    check('mp: kick — the owner\'s Kick button durably bans the target server-side', kickOutcome.kicked === true);
    check('mp: kick — the banned user cannot rejoin with the same invite code',
      kickOutcome.rejoin.ok === false && kickOutcome.rejoin.reason === 'kicked');

    await page.click('#btnMpLeaveRoom');
    await page.waitForTimeout(150);
    check('mp: leaving the party room hides the active room view', await page.locator('#mpRoomIdleRow:not(.hidden)').count() === 1);

    // ---- v0.8.7: Arcade RPC mocked test (submit_arcade_score and get_arcade_leaderboard) ----
    const arcadeRpcRes = await page.evaluate(async (aliceUid) => {
      const { submitScoreToSupabase, fetchGlobalLeaderboard } = await import('/js/arcade/leaderboard.js');
      const client = window.__mpCreateClient();
      client._setUser(aliceUid);
      const submit = await submitScoreToSupabase(client, 'noodle_snake', 580);
      const leaderboard = await fetchGlobalLeaderboard(client, 'noodle_snake');
      return { submit, leaderboard };
    }, aliceProfileId);
    check('mp: submit_arcade_score RPC persists score to mocked database', arcadeRpcRes.submit.ok === true);
    check('mp: get_arcade_leaderboard RPC retrieves global top 10 joined to profile',
      arcadeRpcRes.leaderboard && arcadeRpcRes.leaderboard.some((r) => r.score === 580));
  } finally {
    await context.close();
  }
}

// Safety net: never let a stuck page/browser handle hang the process forever.
// This full suite (2 single-user passes at DPR 1x/2x plus the mocked-browser
// multiplayer flow) legitimately takes ~95-110s end to end — there's no actual
// hang. A 90s budget here was a race against that normal runtime, not a hang
// detector, which is exactly why this test failed "about half the time" with
// no error of its own (`DEBUG=pw:api` showed it always died mid-action, at
// whatever step happened to be running at the 90s mark, with the Node process
// forcibly exited before Playwright's own per-action timeout ever got a
// chance to fire). 180s leaves real headroom above the ~110s baseline while
// still catching a genuine hang well before CI would.
const watchdog = setTimeout(() => {
  console.error('Watchdog: smoke test exceeded 180s, forcing exit.');
  process.exit(1);
}, 180000);
watchdog.unref();

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
