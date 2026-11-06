Build a polished single-player browser game called "Pixel Hotel" in this directory (/workspace/pixel-hotel), inspired by the cosy retro isometric virtual-hotel genre (like classic Habbo-style hotels) but with 100% ORIGINAL content: no Habbo, Sulake or Nexon names, logos, art, sprites, sounds or music. All art must be drawn procedurally in code (canvas pixel art) or as self-made data (e.g. pixel arrays) — no downloaded assets.

Constraints:
- Plain HTML/CSS/JS ES modules, no build step, no npm runtime deps. Must run with `python3 -m http.server 8080` from this folder, entry index.html.
- No network calls, no external CDNs/fonts. Everything local.
- Do NOT git push, deploy, or contact any external service. Don't read anything outside this folder.

Gameplay features (all required):
1. Isometric tiled room rendered on <canvas> with tasteful pixel art (walls, floor tiles, shading, outlines), crisp pixel scaling (imageSmoothingEnabled=false), depth sorting of avatar/NPCs/furniture.
2. Player avatar: pixel-art character with 4+ facing directions and walk animation frames; click-to-walk with A* pathfinding on the tile grid avoiding furniture/walls/NPC blocked tiles; hover tile highlight.
3. At least two rooms: a Lobby and a guest room (e.g. "Your Suite" or "Rooftop Lounge"), connected by door tiles; walking onto a door switches rooms.
4. 4+ original NPC guests with names/personalities, idle wandering, chat bubbles, and responses to keywords the player types (hello, quest-related words, etc.) plus random ambient lines.
5. Chat input box: player's typed messages appear as speech bubbles above the avatar (classic stacked bubble style), with a chat log.
6. Furniture: inventory panel; buy items from a small catalogue with coins; place items on free tiles (ghost preview, valid/invalid tint), pick up/move (drag or select+move), rotate. Placement must be validated (no overlap with walls/doors/furniture/occupants).
7. Seats: multiple chair/sofa/stool types; clicking a seat walks the avatar there and sits facing the seat direction; NPCs can sit too.
8. Economy & quests: coins, quest list (e.g. "Say hi to 3 guests", "Place 2 furniture items", "Sit on the rooftop sofa", "Visit both rooms"), rewards in coins, and unlocks of new catalogue items.
9. Day/night cycle (lighting tint, window colours) and optional simple original procedural chiptune via WebAudio, off by default with a mute toggle.
10. Save/load to localStorage (auto-save + manual Save/Reset buttons), versioned save format.
11. Responsive layout (desktop + mobile), small pixel-style UI panels, help overlay with clear controls (first-run shown), keyboard shortcuts.

Code structure: separate pure logic modules (e.g. js/pathfinding.js, js/inventory.js, js/quests.js, js/save.js, js/data.js for seed content) from rendering (js/render.js, js/sprites.js) and main (js/main.js), so logic is testable in Node without a DOM. Expose `window.__pixelHotel` debug hooks for tests (state, current room, avatar tile, a way to issue walk commands).

Tests:
- tests/logic.test.mjs using Node's built-in `node:test` (Node 20): pathfinding avoids collisions & finds paths around furniture, returns null when unreachable; inventory placement validation and pickup; quest progress + coin rewards + unlocks; save/load round-trip with a fake localStorage and migration/corrupt-data handling.
- tests/smoke.spec / smoke script using Playwright installed locally in this folder as a devDependency (npm i -D playwright; then npx playwright install chromium — if browser download fails, try system chromium; report if impossible). The smoke test starts/uses a local http server, loads the page, asserts NO console errors or page errors, canvas is non-blank (pixel check), clicks to walk and verifies the avatar moved, sends a chat message, places a furniture item, saves and reloads and verifies persistence, and takes screenshots into tests/screenshots/.
- package.json scripts: "test" (node logic tests), "test:smoke".
Run all tests and fix until they pass. Look at the screenshots yourself to judge polish and improve the art if it looks crude.

Docs/versioning:
- README.md: description, start command (`python3 -m http.server 8080` then http://localhost:8080), controls, features, tests, and an Assets & Attribution section stating all art/audio/content are original and procedurally generated in this repo, with a note that it is an homage to the genre and not affiliated with any company.
- CHANGELOG.md (Keep a Changelog style) with 0.1.0 entry.
- .gitignore (node_modules, test-results, etc).
- `git init`, commit locally with message "Pixel Hotel v0.1.0", and create a local tag v0.1.0. Never add a remote or push.

At the end, print a short summary of files, test results and any known issues.
