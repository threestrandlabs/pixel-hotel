# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.8.1] - 2026-11-09

### Fixed

- **City Vehicles Floating Over Buildings (`js/render.js`)**: `drawBackground` now renders the city in three strictly ordered passes onto separate cached canvases — street/sky backdrop (no buildings), animated vehicles, then a buildings layer that **unconditionally redraws every block's building** (not just a "foreground" depth subset as before, which was the actual bug: any building behind that depth cutoff never got redrawn over the vehicle layer). Buildings now always occlude cars correctly regardless of their distance from the hotel, on every floor and at every zoom. Covered by a new Node test that drives `drawBackground` against a fake canvas context and asserts the buildings blit always lands after the vehicle draw calls.
- **Incomplete City Background at Zoom-Out (`js/render.js`)**: `buildIsoCityLayout`'s screen-space culling margins, the road/crossing/block grid extents, and the spire/beacon bounds were all too tight for a fully zoomed-out viewport, leaving an empty sky band with buildings cut off flat along a horizontal line. Extended the over-scan padding and block grid range, and added a procedural distant skyline silhouette plus high-floor cloud ribbons so the city now fills the viewport edge-to-edge at every floor and the full `[0.55, 2.5]` zoom range. Verified with screenshots at min zoom on floors 1, 5, 8, and 10.
- **Player Could Sit On Counters/Bars/Tables (`js/main.js`)**: `applyInteractionArrival`'s sitting-pose decision only checked the interaction *kind* (`'sit'`/`'eat'`), but counters/tables/bars also use kind `'eat'` for their standing "use" interaction — so walking up to use one (or an NPC forced onto one) rendered the avatar sitting on top of it. The sit pose now additionally requires the catalogue item's own `seat: true` flag, so only real seats (chairs, stools, sofas, benches) ever sit; standing-use surfaces render standing. A new logic test asserts every item whose id/name looks like a table/counter/bar/desk has `seat: false`.
- **Floor 9 & 10 Furniture Overlaps (`js/data.js`)**: Sky Garden's two ornamental sakura trees visually fused into the neighbouring flower planter (adjacent-tile sprites with tall canopies overlapping in the isometric projection even without a literal tile collision); repositioned both trees well clear of the planters, the koi pond, and the benches. Rooftop's bar counter/stools were already correctly spaced — the "Lola fused into the bar" symptom traced back to the same sit-pose bug above (an NPC forced onto the bar rendered seated). A new logic test checks every preset floor layout for overlapping non-flat furniture footprints and verifies every door/elevator-mat landing tile stays reachable and unblocked.

### Added

- **Lamp/Light On-Off Toggle (`js/data.js`, `js/main.js`, `js/render.js`)**: Every light-fixture item (Lava Lamp, String Light Post, Neon "HOTEL" Sign, Imperial Crystal Chandelier — tagged `lightSource: true`, interaction `toggle_light`) can now be clicked to toggle the room's lighting. Off darkens the room's floor and walls with a real colour-shade dim (not just an overlay) and renders the fixture's own sprite darkened; on restores normal colours and the fixture's warm emissive glow at night. Only works in the player's own My Room — public floors and a friend's room during a multiplayer Visit show a "Not your room" toast and make no change. The per-room `lightsOn` flag is persisted in the save (`SAVE_VERSION` 4 → 5, with a migration step that defaults any existing room to on and preserves an already-saved choice).
- **Elevator Doormat Trigger + Modal Popup (`index.html`, `css/style.css`, `js/main.js`)**: The floor directory now opens as soon as the avatar steps on the doormat tile directly in front of an elevator door, instead of walking into the door itself (elevator door tiles are now non-walkable). The directory is a centred modal popup with a dimmed backdrop, closable via the X button, Esc, or a click outside the box; the E key shortcut still opens the same popup.
- **Shop/Inventory Category Submenus (`js/data.js`, `js/main.js`, `css/style.css`)**: Every catalogue item now carries a `category` (Seating, Tables, Beds, Lighting, Plants, Rugs, Decor & Signs, Entertainment, Outdoor/Pool, Kitchen/Food). The Shop, My Items, and In This Room tabs all open on a grid of category tiles showing each category's item count; clicking a tile drills into its filtered list with a Back button. Buy/Place/Move/Pick-up/locked behaviour is unchanged. A logic test asserts every catalogue item has a category from the canonical list.

### Testing

- `npm test` (73 Node unit/logic tests) and `npm run test:smoke` (Playwright, DPR 1× and 2×, plus the mocked-multiplayer UI flow) both pass.

## [0.8.0] - 2026-11-08

### Added

- **Basic Multiplayer, opt-in only (`js/multiplayer/*`, `js/config.js`, `supabase/migrations/0001_v08_multiplayer.sql`, `docs/v0.8-multiplayer.md`)**:
  - A new 🌐 Multiplayer panel (Connect / Visit Friend / Party Room tabs). **Nothing network-related runs until the player clicks Connect** — single-player stays fully offline and the existing save (`pixelHotel.save.v1`) is never read or written by any multiplayer code; verified by a Playwright check that asserts zero requests to Supabase/the CDN happen just from opening and using the panel without connecting.
  - **Anonymous identity**: `supabase.auth.signInAnonymously()` plus a chosen display name and a short unique shareable friend code (`profiles` table, `ensure_profile()` RPC).
  - **Visit a friend's room by code**: a persistent guestbook/noteboard per My Room (`room_notes`, max 140 chars, client + DB-side length/character validation, a concurrency-safe per-author-per-room hourly rate limit enforced by a `BEFORE INSERT` trigger using `pg_advisory_xact_lock` so it can't be bypassed by inserting directly) with likes (`room_note_likes`), owner delete-any / author delete-own, and a one-click "View My Guestbook" shortcut to your own board. Visiting someone else's room also renders a **transient, read-only snapshot** of their My Room (`room_snapshots`) — Move/Pick up/Buy/Place are all blocked while visiting, the visitor's own local save is never touched (the snapshot is kept out of the saved game state entirely), and their own room is restored on Leave Visit/Disconnect.
  - **Invite-code party rooms**: create/join via `create_multiplayer_room()`/`join_multiplayer_room()` RPCs, live in a shared My Room scene over a Supabase Realtime **private channel** (`room:<code>`) using Presence (member list) and Broadcast (throttled position updates + interpolated remote avatar movement, speech-bubble chat). Access is granted/revoked only by SECURITY DEFINER RPCs and enforced server-side via Row Level Security on `realtime.messages` — not a client-only check — so a client without a current `multiplayer_room_access` row cannot grant itself access to a room. Incoming Broadcast payloads are independently bounded/validated (finite in-range coordinates, UUID-shaped ids, text length/control-character checks, a per-sender receive throttle) and a received "kicked" event is confirmed against the `check_kicked_from_room` RPC before a client disconnects itself, rather than trusting the broadcast alone — but Realtime Authorization only proves the *sender* holds room access, not that a `userId` they put inside their own payload is really theirs, so this is **not** spoof-proof against another authenticated room member; see `docs/v0.8-multiplayer.md` §4 for the honest threat model. Kicking durably bans the specific user id from that specific room (`multiplayer_room_kicks`) in addition to a best-effort live-disconnect broadcast.
  - **Client-side word filter, HTML-safe rendering, local (per-device) mute, and owner kick** (`js/multiplayer/filter.js`, `js/multiplayer/localPrefs.js`) — documented explicitly as UX-level, not a security control; see `docs/v0.8-multiplayer.md` for the full threat/limits write-up (disposable anonymous identities, guestbook read-scope trade-off, no abuse/moderation tooling).
  - Public client config (`js/config.js`): Supabase URL + publishable key, intentionally public — all access control is server-side RLS. The Supabase JS client itself loads from a pinned CDN ESM URL only at opt-in time, with no bundler/npm dependency added.
  - Unit tests (`tests/multiplayer.unit.test.mjs`) for the filter/validation/rate-limit helpers and a mocked-Supabase-client smoke pass covering auth/guestbook/room flows (create/join/kick, rate limiting, delete permissions), plus a mocked-browser Playwright flow (`tests/smoke.spec.mjs`) driving the real Connect/Visit/note/owner-delete/join/movement/chat-filter/mute/kick UI against an in-page fake Supabase client/Realtime bus — no test ever touches a real database.
  - `supabase/migrations/0001_v08_multiplayer.sql` is a single idempotent migration containing the exact dashboard setup instructions (enable anonymous sign-ins, run this SQL, disable Realtime "Allow public access") plus every RLS policy/grant — intended to be run once by a human via the Supabase SQL Editor. **Not yet applied to or verified against a live project**; see `docs/v0.8-multiplayer.md` §6 for open risks and the required two-browser validation checklist before release.

## [0.7.2] - 2026-11-08

### Fixed

- **Crisp Rendering at Every DPR × Zoom (`js/render.js`)**: All baked bitmaps (furniture, characters/NPCs, floor/wall/window/door tiles, the tower cut-away, and the city skyline/foreground) are now rasterised at `deviceScale(dpr, zoom) = ceil(dpr * zoom)` instead of raw `dpr`, so zooming in no longer upscales a lower-resolution bitmap into a blurry one — every layer stays 1:1 or sharper in device pixels at any supported DPR/zoom combination.
- **Zoomed-Out Background Gap (`js/render.js`)**: `drawBackground`/`renderSkylineToCanvas` now over-scan the baked city canvas (bucketed to 96px steps) by exactly the margin a zoom-out below 100% exposes, so the sky/city/ground always fills the viewport edge-to-edge with no empty margin, and the bottom-left music player is never clipped.
- **Vehicles Floating Over Building Facades (`js/render.js`)**: City blocks nearer the camera than street level are redrawn in a second transparent pass over the animated vehicle layer (`renderSkylineToCanvas(..., foregroundOnly)`), so a car on a road behind a building is correctly occluded instead of appearing to drive across its windows; headlight/taillight cones stay clipped to the ground-plane band.
- **Music Not Restarting After Unmute Then Room Change (`js/audio.js`)**: `_playFileTrack` now cancels any pending deferred-pause timer left over from a prior fade-out of the track it is about to (re)play, so a stale timer scheduled before the mute/room-change sequence can no longer pause the audio element seconds after playback has already resumed.

## [0.7.1] - 2026-11-07

### Added

- **Licensed Floor Soundtrack (`audio/music/`, `js/audio.js`, `js/main.js`)**: Replaced the procedural per-floor loops with James's original MP3 tracks (`01-grand-lobby.mp3` … `10-rooftop.mp3`, one per floor, Music by James). Each floor's file loads lazily when first visited, the next floor in sequence preloads in the background, the current track loops seamlessly via the browser's native media loop, and switching floors crossfades the old track out and the new one in over the Web Audio graph — all routed through the existing Music and Master volume sliders and the play/pause/prev/next/Auto: Room controls. If a floor's file fails to load or play, that floor instantly and silently falls back to the original procedural synth track. Still no autoplay: playback only starts after the first user gesture, exactly as before.
- **Bottom-Left Player Track Titles (`js/audio.js`, `index.html`)**: The music player now shows the licensed track title for the current floor — Grand Lobby Jazz Lounge, Cafe and Bar Bossa Nova, Restaurant Smooth Jazz, Gym Pulse Fitness Electronic, Pool and Spa Calm Ambient, Arcade Chiptune, Library Soft Piano, My Room Lofi Chill, Sky Garden Nature Acoustic, Rooftop Sunset Night House — falling back to the original procedural track title whenever a floor's file isn't playing.

### Changed

- **Deploy Workflow (`.github/workflows/deploy.yml`)**: The GitHub Pages deploy step now copies `audio/` into `_site` alongside `index.html`, `css`, and `js` so the floor soundtrack ships with the live site.

## [0.7.0] - 2026-11-07

### Added

- **Grand Lobby Expansion (`js/data.js`)**:
  - Expanded Floor 1 into a much larger 16×12 double-height Grand Lobby with a marble checkerboard floor, 4 Corinthian marble pillars, an Imperial Crystal Chandelier, a sweeping grand mezzanine staircase, lounge seating (sofa, armchairs, cafe table), an Atrium Marble Fountain, flower planters, a luggage trolley, a Concierge Podium, and a 3-tile Reception Desk staffed by **Celeste**, the Head Receptionist, who greets the player, answers hotel-facilities/check-in questions through dialogue topics, and kicks off the starter Welcome Quest.
- **True-to-Storey Isometric City Scale (`js/render.js`)**: Reworked `computeGroundDy`/`computeCityGroundDy`/`storiesBelowFloor` and the isometric city layout so every room floor corresponds to exactly one storey of window rows — the lobby shows a ground-level street with no storeys below, Floor 4 shows 3 storeys below, and neighbouring city buildings (3–30 storeys) use the same storey unit, giving the tower and its neighbours consistent, believable proportions.
- **Animated Isometric Traffic & Procedural Traffic Ambience (`js/render.js`, `js/audio.js`)**:
  - Added `computeCityVehicles`/`drawCityVehicles`: animated cars, taxis, buses, and scooters that follow the isometric road lanes in the correct direction, stop at pedestrian crossings, and switch on headlights/taillights at night.
  - Added procedural Web Audio traffic ambience (engine hum, occasional horn, bus brake hiss) tied to the SFX volume/mute toggle and automatically quieter on higher floors and inside rooms than at street level.
- **Zoom & Pan Controls (`js/render.js`, `js/main.js`, `index.html`, `css/style.css`)**: Mouse wheel, trackpad pinch, on-screen **−** / **+** / **1:1** buttons, and `+`/`-`/`0` keyboard shortcuts zoom toward the cursor and clamp between 55%–250%; click-drag pans the camera and a recentre action snaps back to the player. The new default zoom (≈185%) matches the reference close-up framing, is crisp at every zoom level under HiDPI, is persisted in settings, and pointer→tile hit-testing (`tileToScreen`/`screenToTile`) stays correct at every zoom and pan offset.
- **Object Collision & Advanced A\* Pathfinding (`js/pathfinding.js`, `js/inventory.js`, `js/main.js`)**:
  - Every furniture item now declares a footprint and a `walkable` flag; blocking items (sofas, tables, counters, plants, lamps, machines, beds, desks…) block their tiles while rugs, floor mats, door mats, and yoga mats stay walkable. Seats and beds are reached via a free adjacent tile before sitting/lying.
  - Rewrote pathfinding as a pure, DOM-free A\* (`findPath`) with a binary-heap open list, octile heuristic, 8-directional movement with strict no-corner-cutting, line-of-sight path smoothing/string-pulling, straight-path tie-breaking, and nearest-reachable-tile fallback (`findNearestReachableTile`) when a clicked tile is blocked.
  - Added seamless mid-step re-targeting (`retargetMover`/`advanceMover`): a new click while walking continues the current interpolated step and re-plans from the tile being entered instead of snapping back or replaying a tile, duplicate clicks on the same target are ignored, and rapid repeated clicks no longer cause stutter/back-and-forth movement.
  - Added tile reservation (`reservedTilesExcluding`) so the player and NPCs dynamically re-plan around each other instead of colliding, and placement validation that prevents furniture from trapping the player or blocking a door/elevator tile.
  - Bumped `SAVE_VERSION` with a migration that reconciles overlapping placed items from older saves against the new collision rules.
- **Wandering, Pathfinding NPCs & Click-to-Talk Dialogue (`js/npc.js`, `js/main.js`)**:
  - NPCs now wander between points of interest and furniture using the same A\* pathfinding as the player, pause naturally, and avoid the player and each other via tile reservation; the receptionist stays stationary behind her desk.
  - Clicking/tapping any NPC (wandering guests or the receptionist) walks the player to a free tile adjacent to them (picking an actually *reachable* adjacent tile, not just the nearest one, so a desk/NPC's own tile can no longer trap the approach), opens a speech-bubble dialogue panel with greeting/topic lines, and the NPC resumes wandering after a pause or when the player walks away. Hit-testing uses each NPC's on-screen sprite bounds at the current zoom so NPC clicks never fall through to a floor walk.
- **Compact Bottom-Left Music Player (`index.html`, `css/style.css`, `js/main.js`, `js/audio.js`)**: A collapsible widget showing the current track title and room/mood, play/pause, prev/next track cycling, an "Auto: follow room" toggle (on by default), a small animated equaliser/progress bar, and a volume slider linked to the Music volume.
- **Settings Panel with Master/Music/SFX/Ambience Mixing & Per-Room Tracks (`js/audio.js`, `index.html`)**: A gear-button settings panel with Master, Music, SFX, and Ambience (traffic) volume sliders (0–100%, live preview, persisted), raised default music loudness via gain staging and a light compressor/limiter, and a distinct procedural track per room/floor (lobby jazz lounge, cafe bossa, restaurant smooth jazz, gym upbeat electronic, pool & spa ambient, arcade chiptune, library soft piano, My Room lo-fi, sky garden acoustic, rooftop sunset/night house) with smooth crossfades between rooms and night variants.
- **Procedurally Rendered Item Icons (`js/render.js`)**: Every catalogue item now renders its own voxel/sprite model into a cached, HiDPI-crisp, transparent, auto-fit thumbnail (`getItemIconDataUrl`/`renderItemIcon`) used across the Shop, My Items, In This Room tabs, and placement preview, replacing the old flat colour squares, with a fallback for any item whose model can't render.

### Fixed

- Fixed a `ReferenceError: tileToScreen is not defined` crash (missing import in `js/main.js`) that broke the exposed `window.__pixelHotel.tileToScreen` debug/test hook and left the pointer→tile round-trip test unable to run; `tileToScreen` results are now additionally passed through `worldToScreen` so they match the zoom/pan-aware coordinates `screenToTile` expects.
- Fixed `tests/smoke.spec.mjs` hanging indefinitely on any mid-test failure: the Playwright `browser` handle was never closed on an error path, keeping the Node process alive forever. The browser is now always closed in a `finally` block, and a 90s watchdog timer forces an exit as a last resort.

## [0.6.0] - 2026-11-07

### Added

- **Shared Isometric City & Street Grid (`js/render.js`)**:
  - Replaced the flat front-facing 2D skyline and horizontal road strip with a unified 3D isometric city and ground plane (`projectIsoCityPoint`, `buildIsoCityLayout`, `computeGroundDy`, `computeCityGroundDy`) projected on the exact same 2:1 `(u, v)` axes as the hotel tower.
  - Added isometric avenues along the `u` and `v` axes, dashed centre lane markings, pedestrian zebra crossings at intersections, raised block sidewalks with kerbs and paving joints, isometric street trees, streetlamps with warm dusk/night glow pools, and foreground fountain park plazas.
  - Added depth-sorted neighbouring 3D isometric buildings of varied heights (`2`–`10` stories) with true isometric facade windows on both left (`+u`) and right (`+v`) walls, recessed roof decks, rooftop penthouses/spires, HVAC units, skylights, sky-garden terraces, atmospheric distance haze, and floor-dependent camera elevation (street-level avenues on lower floors vs neighbouring isometric rooftops on high floors).
  - Added offscreen static layer caching (`cutawayCache` + `skylineCache`) for both the isometric city backdrop and the lower tower cutaway shaft.
- **Procedural Web Audio Lounge/Lofi Music & Soft Enveloped SFX (`js/audio.js`, `js/main.js`, `js/save.js`, `index.html`)**:
  - Replaced harsh square-wave chiptune beeps with warm procedural Web Audio lounge/lofi looping music featuring low-pass filtered Rhodes/pad 7th chords, triangle sub-bass, bell plucks, and brushed pink-noise percussion.
  - Added area and time-of-day musical moods (`MOOD_PROFILES`, `moodForRoom`): **Velvet Lounge** (`lobby`), **Pulse Synth Groove** (`gym`), **Azure Spa Drift** (`spa`), and **Midnight Lofi** (`night`).
  - Added soft low-pass filtered, smooth-enveloped SFX for UI clicks (`click`), player footsteps (`footstep`), shop coins (`coin`), furniture placement (`place`), quest completion (`quest`), chat (`chat`), and two-tone luxury elevator bells (`elevator`).
  - Added separate Music and SFX mute buttons (`#btnMusicMute`, `#btnSfxMute`) and volume sliders (`#musicVolume`, `#sfxVolume` in `#audioPanel`), persisted in `state.settings` (`musicMuted`, `sfxMuted`, `musicVolume`, `sfxVolume`), and deferred `AudioContext` creation until the first user gesture (`unlockGesture`).

## [0.5.0] - 2026-11-07

### Added

- **v0.5.0 Research Synthesis (`docs/research-v0.5.md`)**:
  - Combined Parts A and B of the v0.5 research notes into `docs/research-v0.5.md`, retaining all verified source URLs and concrete implementation mappings across room geometry, cutaway parallax skylines, hotel amenity zoning, expressive voxel characters, and furniture interaction/animation systems.
- **Varied / Irregular Room Shapes & Door Arrival Clearance**:
  - Added `TILE.VOID = 4` cutouts (`makeRoomGrid`) and `zoneTiles` (with optional split-level step risers) across all 10 hotel floors (`atrium-step`, `l-terrace`, `split-dining`, `workout-wing`, `spa-deck`, `arcade-alcove`, `reading-nook`, `suite-alcove`, `conservatory-terrace`, and `sky-promenade`).
  - Added `hasDoorArrivalRoute` and 1-tile door landing apron protection (`'door_clearance'`) in `canPlaceAt` so doors and elevators remain unobstructed while flat rugs can still sit on door aprons.
  - Added `SAVE_VERSION = 3` migration (`MIGRATIONS[2]`) upgrading v2 saves while filtering legacy furniture on `VOID` tiles and rescuing any player coordinates on `VOID` cells.
- **Perspective-Consistent Isometric Cutaway Skyline & Emissive Night Lighting**:
  - Upgraded parallax skyscraper layers in `renderSkylineToCanvas` with 2:1 isometric roof caps and angled side parapets matching the room's 2:1 projection, high-altitude cloud ribbons on upper floors (F7–F10), and illuminated streetlamps on the ground-floor plaza.
  - Upgraded `drawTowerCutawayUnder` to follow per-tile non-`VOID` floor boundaries with stepped reinforced concrete slabs and I-beam markers.
  - Added localized warm dusk/night radial emissive light pools (`screen` blend) for lamps, neon signs, string lights, arcade cabinets, karaoke machines, aquariums, dining tables, sauna cabins, and heated pools.
- **Categorised Elevator Navigator & Functional Amenity Arrangements**:
  - Grouped the 10-floor Elevator Directory into 3 themed wings (**Suite & Sky Decks**, **Recreation & Wellness**, **Ground & Dining**) with live NPC guest counts per floor.
- **Expressive Voxel Faces, Asynchronous Blinking & Breathing Idle Variety**:
  - Upgraded `headTex` and `buildParts` in `js/voxel.js` with upper-eyelid creases, iris/pupil/dual catchlights, personality-tuned eyebrows, side-profile eyes and brows on `'left'` and `'right'` head faces, dynamic mouths (`chew`, `pant`, `lips`, `open`, `frown`, `smile`), asynchronous per-entity blinking (`blink`), and subtle 2-phase breathing torso/head bob (`breathe`).
- **Multi-Slot Occupancy, Safe Approach Tiles & Distinct Activity Animations**:
  - Added `interactionSlots`, `findFreeInteractionSlot`, `findApproachTile`, and `isDiningSeat` in `js/inventory.js` plus pending slot reservations (`reservedTilesExcluding`) in `js/main.js`, allowing 2 occupants on 2-tile sofas/beds and 4 swimmers in lap pools while routing solid counter/machine interactions to unblocked adjacent tiles facing inward.
  - Added visibly distinct multi-frame animations and canvas effects for **Treadmill Running** (`action: 'treadmill'` with high-knee stride, bent arm drive, moving belt chevrons, and sweat droplets), **Pool Swimming** (`action: 'swim'` with submerged lower body, alternating freestyle/breaststroke arms, animated waterline, V-wake, and splash droplets), **Dining / Eating** (`action: 'eat'` with right-arm cup/utensil lift, chewing mouth, and rising aroma wisps), and **Reclining / Lying** (`action: 'lie'` on suite beds and yoga mats).

## [0.4.0] - 2026-11-07

### Added

- **Crisp Native-DPR Rendering**:
  - Dynamic canvas backing store sized to `CSS box * window.devicePixelRatio` with `ResizeObserver` and resize handling.
  - DPR-aware sprite and voxel character caching (`scale` included in cache keys) blitted 1:1 to integer device pixels.
  - High-DPI volumetric 3D prism rasterisation for furniture and finer detail on voxel characters.
  - Readable UI and canvas typography (`system-ui` / sans-serif `>= 13px`, high-contrast pill badges, NPC name tags, and speech bubbles).
- **Procedural Parallax City Skyline Backdrop**:
  - Time-of-day sky gradients (noon cerulean, sunset coral/amber, starry midnight navy), sun & moon arcs, twinkling stars, coastal hills, harbour water, 3 deterministic seeded skyscraper layers with windows that light up at dusk/night, and blinking aircraft warning beacons.
  - Offscreen canvas caching keyed by viewport size, DPR, floor parallax, and quantised time bucket.
- **Skyscraper Tower Cut-Away Architecture**:
  - Every room is presented as a cut-away floor of a tall hotel tower with reinforced concrete floor/ceiling slabs, structural steel beam markers, exterior columns, and neighbouring upper/lower floor facade windows and silhouettes (open sky parapet on the Floor 10 Rooftop Lounge). Lower floors stand on a street-level plaza with sidewalk trees and a road; higher floors run off-screen down the tower.
  - Floor indicator in the top bar (`Floor 1 — Grand Lobby` .. `Floor 10 — Rooftop Lounge`).
- **10-Floor Hotel Expansion, My Room & Elevator Navigation**:
  - 8 new rooms across Floors 2–9: **Starlight Cafe & Bar** (F2), **Skyline Restaurant** (F3), **Pulse Fitness Gym** (F4), **Azure Pool & Spa** (F5), **Pixel Arcade & Games** (F6), **Quiet Library & Hub** (F7), **My Room** private player suite (F8), and **Cloud Nine Sky Garden** (F9).
  - 7 new NPCs (Pip, Chef Sora, Coach Rex, Marina, Zack, Clara, Flora) with custom voxel outfits and themed dialogue.
  - 19 new volumetric 3D furniture & decor items (`suite_bed`, `treadmill`, `weight_bench`, `dumbbell_rack`, `yoga_mat`, `dining_table`, `dining_chair`, `buffet_counter`, `chef_station`, `pool_water`, `sauna_cabin`, `towel_rack`, `espresso_bar`, `cafe_table`, `pool_table`, `computer_desk`, `sky_tree`, `garden_bench`, `flower_planter`).
  - **Elevator Directory UI** (`🛗 Elevator` button, `🔑 My Room` shortcut button, keyboard shortcut `E`, and brushed-steel elevator doors in every room) with animated elevator door & floor counter transitions.
  - 4 new quests (`quest_gym`, `quest_dine`, `quest_myroom`, `quest_explorer`) and `SAVE_VERSION = 2` migration preserving v1 saves.

## [0.3.1] - 2026-11-07

### Added

- GitHub Actions deploy to GitHub Pages (tests run first; only index.html, css and js are published).
- Gitleaks secret scanning in CI and as a pre-commit hook; reviewed false positive (save-slot key name) listed in .gitleaksignore.

## [0.3.0] - 2026-11-07

### Added

- 8 original distinctive catalogue furniture and decor items with unique geometry and sensible pricing (no external assets, no Habbo copies):
  - **Luminous Reef Tank** (`aquarium`): 2x1 oceanic aquarium with living coral reef and darting neon clownfish.
  - **Tea-Pearl Boba Bar** (`boba_bar`): 2x1 specialty drink counter with dual tea urns, cup sealer, and boba cups.
  - **Retro Pixel Arcade** (`mini_arcade`): 1x1 upright coin-op arcade cabinet with glowing CRT monitor and illuminated marquee.
  - **Midnight Noodle Cart** (`noodle_cart`): 2x1 street vendor cart with steaming broth cauldron, ramen bowls, striped awning, and glowing paper lantern.
  - **Star Stage Karaoke** (`karaoke_machine`): 1x1 digital kiosk with LED spectrum VU meters, lyric display, disco dome, and chrome microphone stand.
  - **Stargazer Telescope** (`telescope`): 1x1 mahogany equatorial tripod with angled brass refractor tube, counterweight, and coated objective.
  - **Zen Koi Stone Pond** (`koi_pond`): 2x2 hand-carved slate basin with clear turquoise water, stepping stone, flowering lily pad, and swimming calico koi.
  - **Gachapon Capsule Toy** (`capsule_dispenser`): 1x1 retro prize dispenser with coin turn crank, clear globe, and colorful toy capsules.
- Consistent volumetric 3D isometric voxel projection and lighting across all furniture and decor models (chairs, stools, sofas, lamps, plants, rugs, neon signs, jukeboxes, string lights, counters, and new collection), matching character voxel cameras and room lighting (`LIGHT.top = 0.14`, `LIGHT.py = 0`, `LIGHT.px = -0.22`, and `#2a1d2e` silhouette outline).
- 4-way rotation support for seats, chairs, and directional furniture.
- Coherent contact plane and floor contact shadows under all non-flat furniture.
- Thin rugs upgraded to physically thin cuboid surfaces (2px height) that maintain non-solid walkable pathing and allow furniture on top.
- Calibrated seat contact plane so sitting avatars' thighs rest directly on seat cushions with correct depth sorting and clean contact planes.
- Item descriptions displayed in Shop and Bag inventory tabs.
- Focused unit test suite for all 22 catalogue item sprites (non-empty, bounded, verified multi-toned volumetric faces), new item purchasing/balance validation, placement collision across rotations, and seating interactions.
- Showroom screenshot capture (`06-showroom.png`) and debug hook for visual verification.

### Changed

- Replaced all flat 2D billboard furniture models (chairs, lamps, plants, jukeboxes, signs, string lights) with genuine volumetric voxel geometry.
- `furnitureCanvas` now caches and renders with full 4-way rotation (`rot % 4`).

## [0.2.0] - 2026-11-07

### Added

- Volumetric 3D voxel character models (`js/voxel.js`) for the player and all 4
  NPC guests (Mochi, Gus, Dr. Pix, Lola), built from axis-aligned 3D boxes and
  projected isometrically with true 4-way rotation (no 2D mirroring).
- Character poses: distinct walk-cycle strides and seated poses, unique outfits,
  and customized accessories (glasses, mustache, bellhop hat, goggles, flower).
- Soft elliptical floor contact shadows under characters matching room lighting.
- Perspective-integrated wall windows cut into the north and west wall planes,
  featuring recessed reveals, inner sills, dynamic daylight sky gradients,
  sash bars, glare highlights, and projecting stone sills and lintels.
- Quantised daylight steps for efficient caching of daylight-dependent window
  sprites.
- Unit regression tests verifying bounded sprite generation across all 4 facings,
  walk strides, and sitting frames for all characters, plus both window
  orientations.

### Changed

- Replaced 2D flat character sprite sheet generation with procedural voxel
  model projection.
- Character stride state wired into entity rendering for walk animation.

## [0.1.1] - 2026-11-07

### Changed

- Back walls now stand on the floor's back edges and join into one continuous
  wall (previously they floated a row away with gaps); added baseboards.
- Doors are framed doorways cut into the wall with a welcome mat on the floor.
- Floor has visible front thickness and no hairline gaps between tiles.
- Brighter warm daytime palette; the game starts at noon. Night is dimmer but
  stays readable (lighter blue tint).
- Avatars redrawn: outlined, nicer faces (eyes, blush, mouth), hands, drop
  shadow, and feet anchored at the tile centre in walking and seated poses.
  Seated avatars now draw in front of multi-tile sofas.
- Help overlay closes with Escape or a click outside the box.

### Added

- New game starts with a cosy furnished Grand Lobby (reception desk, sofa,
  armchairs, rug, lamps, bookshelf, plants) and Rooftop Lounge (bar, rooftop
  sofa for the quest, deckchairs, string-light posts). Doors, spawn points and
  NPC homes stay reachable. Existing saves are untouched.
- Catalogue: Plush Armchair, Striped Deckchair, Reception Desk, Tall Bookshelf,
  Rooftop Bar, String Light Post — all procedural pixel art.
- Rugs are now walkable floor decor that furniture can sit on.
- Tests for seed integrity/reachability, old-save loading, and help overlay.

## [0.1.0] - 2026-11-06

### Added

- Isometric canvas renderer with procedurally drawn pixel-art floor/wall
  tiles, depth-sorted furniture/avatar/NPC rendering, and crisp (non-smoothed)
  pixel scaling.
- Two connected rooms — Grand Lobby and Rooftop Lounge — with door tiles that
  switch rooms on contact.
- Click-to-walk avatar with A* pathfinding, 4-direction facing, walk-cycle
  animation, and hover tile highlighting.
- Four original NPC guests with idle wandering, speech bubbles, keyword-based
  dialogue, and ambient chatter.
- Chat box with stacked speech bubbles and a scrolling chat log.
- Furniture catalogue with buy/place/move/rotate/pick-up, placement
  validation (walls, overlap, occupants), and a ghost preview.
- Multiple seat types; click-to-sit for the player, with occasional NPC
  auto-sit behaviour.
- Coins, a 4-quest quest line with coin rewards and catalogue unlocks.
- Day/night lighting cycle and an optional procedural WebAudio chiptune with
  a mute toggle (off by default).
- Versioned localStorage save/load with auto-save, manual Save/Reset, and
  corrupt-data/migration handling.
- Responsive desktop/mobile layout, first-run help overlay, and keyboard
  shortcuts.
- Node (`node:test`) unit tests for pathfinding, inventory, quests, and
  save/load, plus a Playwright smoke test with screenshots.
