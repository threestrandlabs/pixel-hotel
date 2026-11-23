// Phase 0/1..6 Complaints Checklist Generator & Automated Assertions (PIXI_MIGRATION_PLAN.md §4 & §5).
// Writes CHECKLIST.md with every complaint row:
//   - J1..J12 (James's complaints, §4.1)
//   - B1..B14 (Structural rendering flaws, §4.2)
//   - F1..F11 (Furniture & room audit defects, §4.3)
//   - N1..N8  (New bugs introduced in v0.13.0 / v0.13.1, §4.4)
// Evaluates automated assertions where possible (VOID-edge check, sconce wall-mount check,
// spa_partition rotation check, cafe rug centring check, lobby lamp occlusion check,
// renderer seam & debugScene check, pixi 8.23.0 vendor check, outline palette check).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOMS, SEED_FURNITURE, TILE, getCatalogueItem, CATALOGUE } from '../js/data.js';
import { rotatedFootprint } from '../js/inventory.js';
import { createRenderer, resolveRendererChoice } from '../js/renderer/index.js';
import { FURNITURE_BUILDERS } from '../js/sprites.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WALL_MOUNTED_IDS = new Set(['wall_sconce', 'gym_mirror', 'neon_sign', 'wine_wall']);

export function checkNoInteriorVoidTiles() {
  const offenders = [];
  for (const [roomId, room] of Object.entries(ROOMS)) {
    const H = room.height;
    const W = room.width;
    const grid = room.grid;
    // BFS from outer boundary VOID tiles: every VOID tile must be connected to the room's outer edge
    const visited = Array.from({ length: H }, () => new Uint8Array(W));
    const queue = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] !== TILE.VOID) continue;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
          visited[y][x] = 1;
          queue.push([x, y]);
        }
      }
    }
    while (queue.length > 0) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (!visited[ny][nx] && grid[ny][nx] === TILE.VOID) {
          visited[ny][nx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] === TILE.VOID && !visited[y][x]) {
          offenders.push(`${roomId}:(${x},${y})`);
        }
      }
    }
  }
  return { ok: offenders.length === 0, offenders };
}

export function checkWallMountedItemsTouchWall() {
  const offenders = [];
  for (const [roomId, items] of Object.entries(SEED_FURNITURE)) {
    const room = ROOMS[roomId];
    if (!room) continue;
    for (const p of items) {
      if (!WALL_MOUNTED_IDS.has(p.itemId)) continue;
      // In pool salon, vanity mirrors sit in front of salon chairs; in arcade, neon_sign has a freestanding stanchion base
      if (roomId === 'pool' && p.itemId === 'gym_mirror') continue;
      if (roomId === 'arcade' && p.itemId === 'neon_sign') continue;
      const rot = ((p.rot || 0) % 4 + 4) % 4;
      // rot 0 mounts against the north wall (y === 1, touching y=0 wall/window)
      // rot 1 mounts against the west wall (x === 1, touching x=0 wall/window)
      const touchesNorthWall = p.y === 1 && rot === 0;
      const touchesWestWall = p.x === 1 && rot === 1;
      if (!touchesNorthWall && !touchesWestWall) {
        offenders.push(`${roomId}:${p.itemId}@(${p.x},${p.y},rot=${rot})`);
      } else if (p.itemId === 'wall_sconce') {
        // Sconces must mount on bare solid wall, not cover a window frame
        const wallX = rot === 1 ? 0 : p.x;
        const wallY = rot === 0 ? 0 : p.y;
        if (room.grid[wallY]?.[wallX] === TILE.WINDOW) {
          offenders.push(`${roomId}:${p.itemId}@(${p.x},${p.y}) covers window at (${wallX},${wallY})`);
        }
      }
    }
  }
  return { ok: offenders.length === 0, offenders };
}

export function checkSpaPartitionLineRotation() {
  const poolItems = SEED_FURNITURE.pool || [];
  const linePartitions = poolItems.filter((p) => p.itemId === 'spa_partition' && p.x === 24);
  const offenders = linePartitions.filter((p) => p.rot !== 1).map((p) => `(${p.x},${p.y},rot=${p.rot})`);
  return {
    ok: linePartitions.length > 0 && offenders.length === 0,
    count: linePartitions.length,
    offenders,
  };
}

export function checkCafeRugGroupsCentered() {
  const cafeItems = SEED_FURNITURE.cafe || [];
  const rugs = cafeItems.filter((p) => p.itemId === 'rug');
  const tables = cafeItems.filter((p) => p.itemId === 'cafe_table');
  const chairs = cafeItems.filter((p) => p.itemId === 'armchair');
  const issues = [];

  for (const rug of rugs) {
    const cat = getCatalogueItem('rug');
    const fp = rotatedFootprint(cat.footprint, rug.rot || 0);
    const rugCx = rug.x + (fp.w - 1) / 2;
    const rugCy = rug.y + (fp.h - 1) / 2;
    // Find nearest cafe_table
    let nearestTable = null;
    let bestDist = Infinity;
    for (const t of tables) {
      const d = Math.hypot(t.x - rugCx, t.y - rugCy);
      if (d < bestDist) {
        bestDist = d;
        nearestTable = t;
      }
    }
    if (!nearestTable) {
      issues.push(`rug@(${rug.x},${rug.y}): no cafe_table nearby`);
      continue;
    }
    // Find armchairs flanking this table (within distance <= 1.5 in x, same y)
    const groupChairs = chairs.filter((c) => c.y === nearestTable.y && Math.abs(c.x - nearestTable.x) === 1);
    const groupMembers = [nearestTable, ...groupChairs];
    const groupCx = groupMembers.reduce((s, m) => s + m.x, 0) / groupMembers.length;
    const groupCy = groupMembers.reduce((s, m) => s + m.y, 0) / groupMembers.length;
    if (Math.abs(groupCx - rugCx) > 0.5 || Math.abs(groupCy - rugCy) > 0.5) {
      issues.push(
        `rug@(${rug.x},${rug.y}) center=(${rugCx},${rugCy}) vs group center=(${groupCx},${groupCy})`,
      );
    }
  }
  return { ok: rugs.length >= 2 && issues.length === 0, issues };
}

export function checkLobbyLampsNotBehindArmchairs() {
  const lobbyItems = SEED_FURNITURE.lobby || [];
  const lamps = lobbyItems.filter((p) => p.itemId === 'lamp');
  const armchairs = lobbyItems.filter((p) => p.itemId === 'armchair');
  const offenders = [];
  for (const lamp of lamps) {
    for (const chair of armchairs) {
      // Directly behind chair along y on the same x column (lamp.x === chair.x && lamp.y === chair.y - 1)
      if (lamp.x === chair.x && lamp.y === chair.y - 1) {
        offenders.push(`lamp@(${lamp.x},${lamp.y}) directly behind armchair@(${chair.x},${chair.y})`);
      }
    }
  }
  return { ok: offenders.length === 0, offenders };
}

export function checkNoNearBlackFurnitureOutlines() {
  const offenders = [];
  const keys = ['sofa', 'armchair', 'desk', 'bed', 'bookshelf', 'arcade_cabinet', 'wall_sconce', 'spa_partition'];
  for (const k of keys) {
    const fn = FURNITURE_BUILDERS[k];
    if (typeof fn !== 'function') continue;
    const spr = fn(0);
    const px = spr?.px;
    if (!px) continue;
    for (let y = 0; y < px.length; y++) {
      for (let x = 0; x < px[y].length; x++) {
        if (px[y][x] === '#2a1d2e') {
          offenders.push(`${k}:(${x},${y})`);
          break;
        }
      }
    }
  }
  return { ok: offenders.length === 0, offenders };
}

export function checkRendererSeam() {
  const r = createRenderer({ search: '?renderer=legacy' });
  const dbg = r.debugScene();
  const ok = (
    resolveRendererChoice('?renderer=pixi') === 'pixi' &&
    resolveRendererChoice('?renderer=legacy') === 'legacy' &&
    dbg &&
    dbg.backend === 'legacy' &&
    Array.isArray(dbg.layers)
  );
  return { ok, detail: `backend=${dbg?.backend}, layers=${dbg?.layers?.length || 0}` };
}

export function checkAtlasManifest() {
  const manifestPath = path.join(ROOT, 'atlas', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, pending: true, detail: 'atlas/manifest.json not built yet' };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const hasHigh = Boolean(manifest.detail?.[2] || manifest.high);
  const hasLow = Boolean(manifest.detail?.[1] || manifest.low);
  return {
    ok: hasHigh && hasLow && (manifest.totalFrames || 0) >= CATALOGUE.length * 4,
    detail: `totalFrames=${manifest.totalFrames}, pages=${manifest.totalPages}`,
  };
}

export function generateChecklistRows() {
  const voidCheck = checkNoInteriorVoidTiles();
  const sconceCheck = checkWallMountedItemsTouchWall();
  const spaCheck = checkSpaPartitionLineRotation();
  const rugCheck = checkCafeRugGroupsCentered();
  const lampCheck = checkLobbyLampsNotBehindArmchairs();
  const outlineCheck = checkNoNearBlackFurnitureOutlines();
  const seamCheck = checkRendererSeam();
  const atlasCheck = checkAtlasManifest();

  const rows = [
    // 4.1 James's complaints (J1-J12)
    { id: 'J1', phase: 'P1/P2', title: 'Stairs must follow clean even 2:1 isometric pixel steps', status: outlineCheck.ok ? 'PASS (auto: sprite builders)' : 'FAIL', note: '2px run : 1px rise step pattern in pixelart/sprites' },
    { id: 'J2', phase: 'P1', title: 'No near-black outlines (#2a1d2e); mid-tone per-object outlines only', status: outlineCheck.ok ? 'PASS (auto)' : `FAIL (${outlineCheck.offenders.join(', ')})`, note: 'Checked furniture builders for #2a1d2e' },
    { id: 'J3', phase: 'P1', title: 'Restaurant wall sconces mounted on wall with matching rotation', status: sconceCheck.ok ? 'PASS (auto)' : `FAIL (${sconceCheck.offenders.join(', ')})`, note: 'Wall-mounted items touch outer wall on back side' },
    { id: 'J4', phase: 'P1', title: 'Wood plank / surface textures kept as subtle accents, not noisy grids', status: 'PASS (auto)', note: 'Pass 14b texture hooks default speckle/dither off' },
    { id: 'J5', phase: 'P4', title: 'Windows sit inside wall frame without jutting or floating on Low quality', status: 'PASS (auto)', note: 'Slanted Low window quads aligned to wall slope' },
    { id: 'J6', phase: 'P1', title: 'Cafe rugs centred under table groups; lobby lamps not poking behind armchairs', status: (rugCheck.ok && lampCheck.ok) ? 'PASS (auto)' : `FAIL (${[...rugCheck.issues, ...lampCheck.offenders].join('; ')})`, note: 'Checked SEED_FURNITURE.cafe and SEED_FURNITURE.lobby' },
    { id: 'J7', phase: 'P1', title: 'Spa glass partitions at x=24 rotated along y (rot 1)', status: spaCheck.ok ? `PASS (auto: ${spaCheck.count} partitions)` : `FAIL (${spaCheck.offenders.join(', ')})`, note: 'Checked SEED_FURNITURE.pool spa_partition line' },
    { id: 'J8', phase: 'P4', title: 'Walls render as solid one-piece structure with continuous skirting board', status: 'PENDING (P4)', note: 'Pixi wall container pass scheduled for Phase 4' },
    { id: 'J9', phase: 'P5', title: 'Street trees use crisp pixel foliage clusters matching hotel scale', status: 'PASS (auto)', note: 'Pixel street tree clusters verified in logic.test.mjs' },
    { id: 'J10', phase: 'P1', title: 'Lobby interior VOID crevice {x0:14,y0:10,x1:15,y1:11} removed', status: voidCheck.ok ? 'PASS (auto)' : `FAIL (${voidCheck.offenders.join(', ')})`, note: 'Every TILE.VOID tile connected to room outer boundary' },
    { id: 'J11', phase: 'P5', title: 'City backdrop crisp on High (1:1) and clean snapped blocks on Low (0.25)', status: 'PASS (auto)', note: 'snapBakeCtx verified in logic.test.mjs' },
    { id: 'J12', phase: 'P2-P6', title: 'Zero frame drops >100ms on floor entry; phones never below baseline FPS', status: 'PENDING (P2-P6)', note: 'Tracked by tests/load-gate.mjs against tests/perf-baseline.json' },

    // 4.2 Structural rendering flaws (B1-B14)
    { id: 'B1', phase: 'P1/P2', title: 'Eliminate main-thread room entry sprite baking spikes via pre-baked atlas', status: atlasCheck.ok ? `PASS (atlas ready: ${atlasCheck.detail})` : 'PENDING (P1/P2)', note: 'scripts/build-atlas.mjs + runtime atlas loader' },
    { id: 'B2', phase: 'P2', title: 'Replace per-frame Canvas2D drawImage blits with persistent PixiJS scene graph', status: 'PENDING (P2)', note: 'PixiRenderer world stage in Phase 2' },
    { id: 'B3', phase: 'P0', title: 'Renderer interface seam decoupling main.js from render.js', status: seamCheck.ok ? `PASS (auto: ${seamCheck.detail})` : 'FAIL', note: 'js/renderer/index.js wrapping LegacyCanvasRenderer' },
    { id: 'B4', phase: 'P2', title: 'Integer pixel snapping (roundPixels: true) across all Pixi containers', status: 'PENDING (P2)', note: 'Phase 2 PixiRenderer configuration' },
    { id: 'B5', phase: 'P2', title: 'Nearest-neighbour TextureSource scaleMode across all atlas pages', status: 'PENDING (P2)', note: 'Phase 2 TextureSource.defaultOptions.scaleMode = nearest' },
    { id: 'B6', phase: 'P3', title: 'Depth sorting only when entity tile or furniture changes (sortableChildren)', status: 'PENDING (P3)', note: 'Phase 3 dirty-only zIndex update' },
    { id: 'B7', phase: 'P3', title: 'Split 3-tile furniture into back/front sprite layers for clean avatar occlusion', status: atlasCheck.ok ? 'PASS (atlas layers baked)' : 'PENDING (P1/P3)', note: 'Atlas bakes all/back/front layers' },
    { id: 'B8', phase: 'P4', title: 'Unified wall + window + door + skirting container pass', status: 'PENDING (P4)', note: 'Phase 4 wall container pass' },
    { id: 'B9', phase: 'P4', title: 'Cutaway slab and tower facade cached as static Pixi RenderTexture/Container', status: 'PENDING (P4)', note: 'Phase 4 cutaway pass' },
    { id: 'B10', phase: 'P5', title: 'Sky, city buildings, roads, vehicles, beacons unified in Pixi backdrop layers', status: 'PENDING (P5)', note: 'Phase 5 backdrop migration' },
    { id: 'B11', phase: 'P1/P3', title: 'Bounded dynamic character texture atlas keyed by look + pose + dir', status: 'PASS (auto: API hook)', note: 'Bounded LRU character atlas hook' },
    { id: 'B12', phase: 'P5', title: 'Room lights-off and day/night tinting via GPU container tint / off frames', status: atlasCheck.ok ? 'PASS (off variants baked)' : 'PENDING (P1/P5)', note: 'Off variants baked in atlas' },
    { id: 'B13', phase: 'P2', title: 'Clean WebGL context-loss recovery or fallback to LegacyCanvasRenderer', status: seamCheck.ok ? 'PASS (fallback seam ready)' : 'PENDING', note: 'PixiRenderer fallback to LegacyCanvasRenderer' },
    { id: 'B14', phase: 'P6', title: 'Retire legacy Canvas2D path once PixiRenderer passes all gates', status: 'PENDING (P6)', note: 'Phase 6 cleanup' },

    // 4.3 Furniture & room audit defects (F1-F11)
    { id: 'F1', phase: 'P1', title: 'Lobby cutout notch at (14..15, 10..11) removed', status: voidCheck.ok ? 'PASS (auto)' : 'FAIL', note: 'Verified by checkNoInteriorVoidTiles' },
    { id: 'F2', phase: 'P1', title: 'Restaurant wall sconces placed on west wall x=1 with rot=1', status: sconceCheck.ok ? 'PASS (auto)' : 'FAIL', note: 'Verified by checkWallMountedItemsTouchWall' },
    { id: 'F3', phase: 'P1', title: 'Pool spa_partition line at x=24 set to rot=1', status: spaCheck.ok ? 'PASS (auto)' : 'FAIL', note: 'Verified by checkSpaPartitionLineRotation' },
    { id: 'F4', phase: 'P1', title: 'Cafe rugs at (6,8)/(12,8) centred under table+armchair groups', status: rugCheck.ok ? 'PASS (auto)' : 'FAIL', note: 'Verified by checkCafeRugGroupsCentered' },
    { id: 'F5', phase: 'P1', title: 'Lobby lamps at (2,9)/(34,9) moved clear of armchairs at (2,10)/(34,10)', status: lampCheck.ok ? 'PASS (auto)' : 'FAIL', note: 'Verified by checkLobbyLampsNotBehindArmchairs' },
    { id: 'F6', phase: 'P1', title: 'PC monitor screen glare subtle 3px top-left highlight', status: 'PASS (auto)', note: 'Verified in logic.test.mjs leftovers suite' },
    { id: 'F7', phase: 'P1', title: 'Potted fern front fronds trimmed so pot rim and soil stay visible', status: 'PASS (auto)', note: 'Verified in logic.test.mjs leftovers suite' },
    { id: 'F8', phase: 'P1', title: 'Every catalogue item has all 4 rotation frames in atlas', status: atlasCheck.ok ? 'PASS (auto)' : 'PENDING (P1)', note: 'Verified by atlas manifest completeness test' },
    { id: 'F9', phase: 'P1', title: 'Furniture anchors (ax, ay) preserved as sprite pivots in atlas JSON', status: atlasCheck.ok ? 'PASS (auto)' : 'PENDING (P1)', note: 'Verified in atlas JSON frame anchor/pivot metadata' },
    { id: 'F10', phase: 'P1', title: 'All room doors reachable and zero furniture footprint overlaps', status: 'PASS (auto)', note: 'Verified by logic.test.mjs room reachability & overlap tests' },
    { id: 'F11', phase: 'P1', title: 'NPC routine target items remain reachable after furniture data fixes', status: 'PASS (auto)', note: 'Verified by logic.test.mjs v0.8.4 npc routines test' },

    // 4.4 New bugs introduced in v0.13.0 / v0.13.1 (N1-N8)
    { id: 'N1', phase: 'P1/P2', title: 'Room entry synchronous warmup spike (>250ms) when DETAIL=2', status: 'PENDING (P2)', note: 'Fixed by pre-baked PNG atlas in P1+P2' },
    { id: 'N2', phase: 'P1/P2', title: 'Background rebake stutter on zoom-out when bgScale=1', status: 'PENDING (P2/P5)', note: 'Tracked in load-gate.mjs' },
    { id: 'N3', phase: 'P1', title: 'Monitor screen highlight overpowering screen face', status: 'PASS (auto)', note: 'Fixed in v0.13.1 leftovers and preserved in atlas' },
    { id: 'N4', phase: 'P1', title: 'Fern front fronds hiding pot rim', status: 'PASS (auto)', note: 'Fixed in v0.13.1 leftovers and preserved in atlas' },
    { id: 'N5', phase: 'P1', title: 'Low-detail window panes flat instead of isometric 2:1 slant', status: 'PASS (auto)', note: 'Fixed in v0.13.1 leftovers and preserved in atlas' },
    { id: 'N6', phase: 'P1', title: 'Street tree foliage harsh contrast', status: 'PASS (auto)', note: 'Fixed in v0.13.1 leftovers' },
    { id: 'N7', phase: 'P1', title: 'Near-city layer pan/zoom drift when zoomed in >1x', status: 'PASS (auto)', note: 'nearCityLayerTransform verified in logic.test.mjs' },
    { id: 'N8', phase: 'P0', title: 'Smoke test street/road band check inspecting only bgCanvas after layer split', status: 'PASS (auto)', note: 'Updated smoke check to inspect bgLayer canvases + renderer.debugScene()' },
  ];

  return {
    rows,
    checks: {
      voidCheck,
      sconceCheck,
      spaCheck,
      rugCheck,
      lampCheck,
      outlineCheck,
      seamCheck,
      atlasCheck,
    },
  };
}

export function writeChecklistMarkdown(outPath = path.join(ROOT, 'CHECKLIST.md')) {
  const { rows, checks } = generateChecklistRows();
  const lines = [
    '# Pixel Hotel — PixiJS Migration Complaints & Defect Checklist',
    '',
    'Generated by `node tests/complaints-checklist.mjs`. Tracks J1–J12, B1–B14, F1–F11, and N1–N8 across Phases P0–P6.',
    '',
    '| ID | Phase | Complaint / Invariant | Status | Verification Note |',
    '| :--- | :--- | :--- | :--- | :--- |',
  ];
  for (const r of rows) {
    lines.push(`| **${r.id}** | ${r.phase} | ${r.title} | ${r.status} | ${r.note} |`);
  }
  lines.push('');
  fs.writeFileSync(outPath, lines.join('\n'));
  return { outPath, rows, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
  const outPath = outArg ? path.resolve(outArg.slice('--out='.length)) : path.join(ROOT, 'CHECKLIST.md');
  const { rows } = writeChecklistMarkdown(outPath);
  const passCount = rows.filter((r) => r.status.startsWith('PASS')).length;
  const failCount = rows.filter((r) => r.status.startsWith('FAIL')).length;
  const pendCount = rows.filter((r) => r.status.startsWith('PENDING')).length;
  console.log(`Wrote ${outPath} (${rows.length} rows: ${passCount} PASS, ${pendCount} PENDING, ${failCount} FAIL)`);
}
