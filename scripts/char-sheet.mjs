// scripts/char-sheet.mjs
// Playwright script that renders a character sheet of every LOOK in all 4 facings
// at idle, plus the player in all 11 expressions at DPR 2, and saves:
// - sheet_1x.png
// - face_8x.png (8x nearest-neighbour crop of player head front-facing)
// - char_8x.png (8x nearest-neighbour crop of full player figure)
// Usage: node scripts/char-sheet.mjs <outDir>

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8740;
const BASE_URL = `http://localhost:${PORT}`;
const args = process.argv.slice(2);
let OUT_DIR = '/workspace/ph-rework-shots/before';
let requestedDetail = null;

for (const arg of args) {
  if (arg.startsWith('--detail=')) {
    requestedDetail = parseInt(arg.split('=')[1], 10);
  } else if (!arg.startsWith('--')) {
    OUT_DIR = arg;
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
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const killServer = () => { try { server.kill(); } catch (e) { /* ignore */ } };
  process.on('exit', killServer);

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 1800 }, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'load' });

    const detailsToRender = requestedDetail ? [requestedDetail] : [1, 2];

    for (const curDetail of detailsToRender) {
      console.log(`Generating character sheet for DETAIL=${curDetail}...`);
      const result = await page.evaluate(async (targetDetail) => {
        const { LOOKS, renderCharacter, KX, KZ } = await import('/js/voxel.js');
        const { setDetail } = await import('/js/pixelart.js');
        setDetail(targetDetail);

        const makeCanvas = (w, h) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          return c;
        };

      const scale = 2; // DPR 2
      const DIRS = ['down', 'left', 'up', 'right'];
      const DIR_LABELS = { down: 'Front (down)', left: 'Left', up: 'Back (up)', right: 'Right' };
      const lookKeys = Object.keys(LOOKS);

      const EXPRESSIONS = [
        'neutral', 'happy', 'laughing', 'sad', 'angry',
        'surprised', 'sleepy', 'wink', 'embarrassed', 'smug', 'thinking'
      ];

      // Measure character rendering sizes
      // Grid configuration:
      // Section 1: LOOKS (14 rows, 4 columns)
      // Section 2: Player expressions (11 entries in 2 rows or grid)
      const cellW = 80 * scale; // 160 px
      const cellH = 90 * scale; // 180 px
      const labelW = 120 * scale; // 240 px for row names

      const cols = 4;
      const sheetW = labelW + cols * cellW + 20 * scale;
      const exprRows = Math.ceil(EXPRESSIONS.length / cols);
      const sheetH = (lookKeys.length + exprRows + 2) * cellH;

      const sheet = makeCanvas(sheetW, sheetH);
      const sctx = sheet.getContext('2d');
      sctx.imageSmoothingEnabled = false;

      // Dark retro background
      sctx.fillStyle = '#181424';
      sctx.fillRect(0, 0, sheetW, sheetH);

      // Section header font
      sctx.fillStyle = '#e8d8c8';
      sctx.font = `${14 * scale}px sans-serif`;
      sctx.textBaseline = 'middle';

      // Header column labels
      for (let ci = 0; ci < DIRS.length; ci++) {
        const dir = DIRS[ci];
        const tx = labelW + ci * cellW + cellW / 2;
        sctx.textAlign = 'center';
        sctx.fillStyle = '#9b8fa8';
        sctx.font = `${11 * scale}px sans-serif`;
        sctx.fillText(DIR_LABELS[dir], tx, 25 * scale);
      }

      let curY = 45 * scale;

      // Helper to render and stamp one character
      const renderAndStamp = (look, dir, pose, x, y) => {
        const ren = renderCharacter(look, dir, pose, makeCanvas, scale);
        // ren.canvas has native dimensions (cssW * scale, cssH * scale)
        // ren.ox, ren.oy are in CSS px -> ground point on ren.canvas is (ox * scale, oy * scale)
        const groundX = x + cellW / 2;
        const groundY = y + cellH - 18 * scale;
        const drawX = Math.round(groundX - ren.ox * scale);
        const drawY = Math.round(groundY - ren.oy * scale);
        sctx.drawImage(ren.canvas, drawX, drawY);
        return ren;
      };

      // Draw all LOOKs
      for (const key of lookKeys) {
        const look = LOOKS[key];
        // Label
        sctx.textAlign = 'left';
        sctx.fillStyle = '#f0c8a0';
        sctx.font = `bold ${12 * scale}px sans-serif`;
        sctx.fillText(key, 15 * scale, curY + cellH / 2);

        for (let ci = 0; ci < DIRS.length; ci++) {
          const dir = DIRS[ci];
          const cx = labelW + ci * cellW;
          renderAndStamp(look, dir, { stride: 0, sit: false, lie: false, blink: false, breathe: 0 }, cx, curY);
        }
        curY += cellH;
      }

      // Separator
      curY += 15 * scale;
      sctx.strokeStyle = '#322842';
      sctx.lineWidth = 1 * scale;
      sctx.beginPath();
      sctx.moveTo(15 * scale, curY);
      sctx.lineTo(sheetW - 15 * scale, curY);
      sctx.stroke();
      curY += 25 * scale;

      // Section 2: Player Expressions Header
      sctx.fillStyle = '#f4b942';
      sctx.font = `bold ${13 * scale}px sans-serif`;
      sctx.fillText('Player Expressions (11 guide recipes)', 15 * scale, curY);
      curY += 25 * scale;

      for (let ei = 0; ei < EXPRESSIONS.length; ei++) {
        const expr = EXPRESSIONS[ei];
        const row = Math.floor(ei / cols);
        const col = ei % cols;
        const cx = labelW + col * cellW;
        const cy = curY + row * cellH;

        // Render player with expression (falls back to default face if unsupported)
        const pose = { stride: 0, sit: false, lie: false, blink: false, breathe: 0, expression: expr };
        renderAndStamp(LOOKS.player, 'down', pose, cx, cy);

        // Expression label below figure
        sctx.textAlign = 'center';
        sctx.fillStyle = '#c5b8d0';
        sctx.font = `${10 * scale}px sans-serif`;
        sctx.fillText(expr, cx + cellW / 2, cy + cellH - 6 * scale);
      }

      // Crop player idle down at DPR 2 for char_8x and face_8x
      const playerRen = renderCharacter(LOOKS.player, 'down', { stride: 0, sit: false, lie: false, blink: false, breathe: 0 }, makeCanvas, scale);
      const pCan = playerRen.canvas;
      const pCtx = pCan.getContext('2d');
      const pImg = pCtx.getImageData(0, 0, pCan.width, pCan.height);
      const { data, width: pw, height: ph } = pImg;

      // Find non-transparent pixel bbox of the character
      let minX = pw, maxX = -1, minY = ph, maxY = -1;
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const a = data[(y * pw + x) * 4 + 3];
          if (a > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // 8x nearest-neighbor scale helper
      const scale8x = (srcCanvas, sx0, sy0, sw, sh) => {
        const pad = 2; // pad 2px per core.py save_crop
        const x0 = Math.max(0, sx0 - pad);
        const y0 = Math.max(0, sy0 - pad);
        const x1 = Math.min(srcCanvas.width, sx0 + sw + pad);
        const y1 = Math.min(srcCanvas.height, sy0 + sh + pad);
        const cw = x1 - x0;
        const ch = y1 - y0;

        const out = makeCanvas(cw * 8, ch * 8);
        const octx = out.getContext('2d');
        octx.imageSmoothingEnabled = false;
        octx.drawImage(srcCanvas, x0, y0, cw, ch, 0, 0, cw * 8, ch * 8);
        return out.toDataURL('image/png');
      };

      // Full character 8x crop
      const charDataUrl = scale8x(pCan, minX, minY, maxX - minX + 1, maxY - minY + 1);

      // Head 8x crop:
      // The head box and hair occupies the upper ~45% of the character figure.
      // Top of head is minY, neck is around minY + (maxY - minY) * 0.48.
      const headHeight = Math.round((maxY - minY + 1) * 0.48);
      const faceDataUrl = scale8x(pCan, minX, minY, maxX - minX + 1, headHeight);

      return {
        sheetDataUrl: sheet.toDataURL('image/png'),
        charDataUrl,
        faceDataUrl,
      };
    }, curDetail);

    const saveBase64 = (dataUrl, filename) => {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(base64, 'base64');
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, buf);
      console.log(`Saved ${outPath} (${buf.length} bytes)`);
    };

    if (curDetail === 1) {
      saveBase64(result.sheetDataUrl, 'sheet_1x.png');
      saveBase64(result.faceDataUrl, 'face_8x.png');
      saveBase64(result.charDataUrl, 'char_8x.png');
      saveBase64(result.sheetDataUrl, 'sheet_1x_d1.png');
      saveBase64(result.faceDataUrl, 'face_8x_d1.png');
      saveBase64(result.charDataUrl, 'char_8x_d1.png');
    } else {
      saveBase64(result.sheetDataUrl, 'sheet_1x_d2.png');
      saveBase64(result.faceDataUrl, 'face_8x_d2.png');
      saveBase64(result.charDataUrl, 'char_8x_d2.png');
      if (requestedDetail === 2) {
        saveBase64(result.sheetDataUrl, 'sheet_1x.png');
        saveBase64(result.faceDataUrl, 'face_8x.png');
        saveBase64(result.charDataUrl, 'char_8x.png');
      }
    }
  }

  console.log('Done generating character sheets.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
