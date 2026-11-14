// v0.12.0 Sky viewing platforms: full-screen "view" modal showing a
// procedurally-drawn, original city skyline (no external images), with
// drag/arrow-key parallax panning and a weather + time-of-day overlay
// shared with the outdoor-floor overlay in render.js.

import { getWeatherState, skyPaletteForTimeOfDay, mulberry32, fnv1a, WEATHER_ICONS, WEATHER_LABELS } from './weather.js';

export const CITY_DEFS = {
  nyc: { label: 'New York Skyline' },
  singapore: { label: 'Singapore Marina' },
  tokyo: { label: 'Tokyo Lights' },
  paris: { label: 'Paris Rooftops' },
};

const WORLD_SCALE = 1.7; // skyline is wider than the viewport so panning has room to move
const PAN_KEY_SPEED = 14;

let modal = null;
let canvas = null;
let ctx = null;
let titleEl = null;
let weatherLabelEl = null;
let effectsEnabledGetter = () => true;

let activeCity = null;
let rafId = null;
const panByCity = { nyc: 0, singapore: 0, tokyo: 0, paris: 0 };
let dragging = false;
let dragPointerId = null;
let dragStartX = 0;
let dragStartPan = 0;
let lastWeatherLabel = '';

function clampPan(worldW, viewW, pan) {
  const maxPan = 0;
  const minPan = -(worldW - viewW);
  if (minPan >= 0) return 0;
  return Math.max(minPan, Math.min(maxPan, pan));
}

export function initViewerUI({ isEffectsEnabled } = {}) {
  if (typeof isEffectsEnabled === 'function') effectsEnabledGetter = isEffectsEnabled;
  modal = document.getElementById('skyViewerModal');
  canvas = document.getElementById('skyViewerCanvas');
  if (!modal || !canvas) return;
  ctx = canvas.getContext('2d');
  titleEl = document.getElementById('skyViewerTitle');
  weatherLabelEl = document.getElementById('skyViewerWeatherLabel');

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', syncCanvasSize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (isViewerModalOpen()) startLoop();
  });
}

export function openViewerModal(cityId) {
  if (!modal || !canvas || !CITY_DEFS[cityId]) return;
  activeCity = cityId;
  modal.classList.remove('hidden');
  if (titleEl) titleEl.textContent = `🔭 ${CITY_DEFS[cityId].label}`;
  lastWeatherLabel = '';
  syncCanvasSize();
  startLoop();
}

export function closeViewerModal() {
  if (modal) modal.classList.add('hidden');
  stopLoop();
  dragging = false;
  activeCity = null;
}

export function isViewerModalOpen() {
  return Boolean(modal && !modal.classList.contains('hidden'));
}

function syncCanvasSize() {
  if (!canvas || !isViewerModalOpen()) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
}

function onPointerDown(e) {
  if (!isViewerModalOpen()) return;
  dragging = true;
  dragPointerId = e.pointerId;
  dragStartX = e.clientX;
  dragStartPan = panByCity[activeCity] || 0;
  canvas.setPointerCapture?.(e.pointerId);
}
function onPointerMove(e) {
  if (!dragging || !activeCity || e.pointerId !== dragPointerId) return;
  const dx = e.clientX - dragStartX;
  panByCity[activeCity] = dragStartPan + dx;
}
function onPointerUp(e) {
  if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
  dragging = false;
  dragPointerId = null;
}
function onKeyDown(e) {
  if (!isViewerModalOpen() || !activeCity) return;
  if (e.key === 'ArrowLeft') { panByCity[activeCity] = (panByCity[activeCity] || 0) + PAN_KEY_SPEED; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { panByCity[activeCity] = (panByCity[activeCity] || 0) - PAN_KEY_SPEED; e.preventDefault(); }
}

function startLoop() {
  stopLoop();
  rafId = requestAnimationFrame(loop);
}
function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}
function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (!isViewerModalOpen() || !ctx) return;
  const weather = getWeatherState(new Date());
  renderCityCanvas(ctx, canvas.width, canvas.height, activeCity, panByCity, now, weather, effectsEnabledGetter());
  const label = `${WEATHER_ICONS[weather.weather] || ''} ${WEATHER_LABELS[weather.weather] || ''} · ${capitalize(weather.timeOfDay)}`;
  if (weatherLabelEl && label !== lastWeatherLabel) {
    weatherLabelEl.textContent = label;
    lastWeatherLabel = label;
  }
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ---------- shared drawing helpers ----------

function seededRng(key) { return mulberry32(fnv1a(key)); }

function drawSkyGradient(ctx, w, h, sky) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.55, sky.mid);
  g.addColorStop(1, sky.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawStars(ctx, w, h, seedKey, now, count = 70) {
  const rng = seededRng(`stars:${seedKey}`);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.62;
    const tw = 0.5 + 0.5 * Math.sin(now / 900 + i * 1.7);
    ctx.globalAlpha = 0.35 + 0.5 * Math.max(0, tw);
    ctx.fillStyle = '#fdf6ff';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
}

function litWindowAlpha(sky, idx, now) {
  if (!sky.windowsLit) return 0;
  const flick = (idx % 11 === 0) ? (0.6 + 0.4 * Math.sin(now / 500 + idx)) : 1;
  return 0.55 * flick;
}

// Draws one building block with a window grid; (x,y) is the top-left of the
// roof, (bw,bh) the footprint width and visible height above `groundY`.
function drawBuilding(ctx, rng, x, groundY, bw, bh, color, sky, now, winCols = 3, winRows = 8) {
  const top = groundY - bh;
  ctx.fillStyle = color;
  ctx.fillRect(x, top, bw, bh);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + bw - Math.max(2, bw * 0.18), top, Math.max(2, bw * 0.18), bh); // shaded east face
  const padX = bw * 0.12;
  const padY = Math.min(10, bh * 0.05);
  const cellW = (bw - padX * 2) / winCols;
  const cellH = (bh - padY * 2) / winRows;
  let idx = Math.round(x * 7 + bh);
  for (let r = 0; r < winRows; r++) {
    for (let c = 0; c < winCols; c++) {
      idx++;
      const wx = x + padX + c * cellW + cellW * 0.18;
      const wy = top + padY + r * cellH + cellH * 0.18;
      const ww = cellW * 0.64;
      const wh = cellH * 0.6;
      if (wy + wh > groundY) continue;
      const alpha = litWindowAlpha(sky, idx, now);
      if (alpha > 0 && rng() < 0.42) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffdf8e';
        ctx.fillRect(wx, wy, ww, wh);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(10,14,24,0.28)';
        ctx.fillRect(wx, wy, ww, wh);
      }
    }
  }
}

function drawSetbackTower(ctx, rng, x, groundY, bw, totalH, tiers, color, sky, now) {
  let curW = bw;
  let curTop = groundY;
  for (let t = 0; t < tiers; t++) {
    const tierH = totalH / tiers;
    const cx = x + (bw - curW) / 2;
    drawBuilding(ctx, rng, cx, curTop, curW, tierH, color, sky, now, Math.max(2, Math.round(curW / 20)), 5);
    curTop -= tierH;
    curW *= 0.72;
  }
}

function drawWaterTower(ctx, x, groundY, scale = 1) {
  const legH = 10 * scale;
  const tankW = 16 * scale;
  const tankH = 12 * scale;
  ctx.fillStyle = '#5a4430';
  ctx.fillRect(x - 1 * scale, groundY - legH, 2 * scale, legH);
  ctx.fillRect(x + tankW - 3 * scale, groundY - legH, 2 * scale, legH);
  ctx.fillStyle = '#8a6a44';
  ctx.beginPath();
  ctx.moveTo(x - 2 * scale, groundY - legH);
  ctx.lineTo(x + tankW + 2 * scale, groundY - legH);
  ctx.lineTo(x + tankW, groundY - legH - tankH);
  ctx.lineTo(x, groundY - legH - tankH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6e5636';
  ctx.beginPath();
  ctx.moveTo(x - 1 * scale, groundY - legH - tankH);
  ctx.lineTo(x + tankW + 1 * scale, groundY - legH - tankH);
  ctx.lineTo(x + tankW * 0.5, groundY - legH - tankH - 6 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawCloud(ctx, x, y, scale, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, 22 * scale, 9 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 16 * scale, y + 2 * scale, 16 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 16 * scale, y + 3 * scale, 14 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBird(ctx, x, y, t) {
  const flap = Math.sin(t) * 5;
  ctx.strokeStyle = 'rgba(40,30,30,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 6, y + flap);
  ctx.lineTo(x, y - 2);
  ctx.lineTo(x + 6, y + flap);
  ctx.stroke();
}

function drawLatticeTower(ctx, x, groundY, h, color = '#a85c3c') {
  const baseW = h * 0.42;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x - baseW / 2, groundY);
  ctx.lineTo(x - baseW * 0.08, groundY - h * 0.62);
  ctx.lineTo(x - baseW * 0.04, groundY - h);
  ctx.moveTo(x + baseW / 2, groundY);
  ctx.lineTo(x + baseW * 0.08, groundY - h * 0.62);
  ctx.lineTo(x + baseW * 0.04, groundY - h);
  for (let i = 0; i < 6; i++) {
    const f = i / 5;
    const yy = groundY - f * h * 0.62;
    const ww = baseW / 2 * (1 - f * 0.86);
    ctx.moveTo(x - ww, yy);
    ctx.lineTo(x + ww, yy);
  }
  ctx.moveTo(x, groundY - h * 0.62);
  ctx.lineTo(x, groundY - h);
  ctx.stroke();
  // beacon
  const blink = 0.5 + 0.5 * Math.sin(Date.now() / 420);
  ctx.globalAlpha = 0.5 + 0.5 * blink;
  ctx.fillStyle = '#ff5050';
  ctx.beginPath();
  ctx.arc(x, groundY - h - 2, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawCar(ctx, x, y, color, dir = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 16 * dir, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x + (dir > 0 ? 3 : -13), y - 3, 10, 4);
  ctx.fillStyle = '#fff6d0';
  ctx.fillRect(x + (dir > 0 ? 15 : -16), y + 1, 2, 2);
}

function drawBoat(ctx, x, y, scale = 1) {
  ctx.fillStyle = '#e8e8ec';
  ctx.beginPath();
  ctx.moveTo(x - 10 * scale, y);
  ctx.lineTo(x + 10 * scale, y);
  ctx.lineTo(x + 6 * scale, y + 4 * scale);
  ctx.lineTo(x - 6 * scale, y + 4 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c94848';
  ctx.fillRect(x - 1 * scale, y - 7 * scale, 2 * scale, 7 * scale);
}

// ---------- weather overlay (shared with outdoor-floor overlay) ----------

const rainDropsCache = new Map();
const snowFlakesCache = new Map();

function getParticles(cache, key, count, w, h, seedBase) {
  let arr = cache.get(key);
  if (!arr || arr.length !== count) {
    const rng = seededRng(`particles:${seedBase}`);
    arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({ x: rng() * w, y: rng() * h, speed: 0.6 + rng() * 0.8, drift: (rng() - 0.5) * 0.4 });
    }
    cache.set(key, arr);
  }
  return arr;
}

export function drawWeatherOverlay(ctx, w, h, weather, now, intensity = 1) {
  const { weather: kind } = weather;
  if (kind === 'fog') {
    const g = ctx.createLinearGradient(0, h * 0.25, 0, h);
    g.addColorStop(0, 'rgba(210,218,226,0.05)');
    g.addColorStop(1, `rgba(210,218,226,${0.38 * intensity})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (kind === 'cloudy') {
    ctx.fillStyle = `rgba(90,100,115,${0.14 * intensity})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (kind === 'rain' || kind === 'thunderstorm') {
    const count = Math.round(Math.min(90, w * 0.09) * intensity);
    const drops = getParticles(rainDropsCache, 'rain', count, w, h, 'rain');
    ctx.strokeStyle = 'rgba(190,210,230,0.5)';
    ctx.lineWidth = 1;
    const t = now / 1000;
    ctx.beginPath();
    for (const d of drops) {
      const yy = (d.y + t * d.speed * 260) % h;
      const xx = (d.x + t * d.drift * 60) % w;
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx - 3, yy + 10);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(40,46,60,${0.12 * intensity})`;
    ctx.fillRect(0, 0, w, h);
    if (kind === 'thunderstorm') {
      const flashPhase = Math.sin(now / 1700 + 1.2);
      if (flashPhase > 0.985) {
        ctx.fillStyle = `rgba(255,255,255,${(flashPhase - 0.985) * 40})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
  if (kind === 'snow') {
    const count = Math.round(Math.min(70, w * 0.07) * intensity);
    const flakes = getParticles(snowFlakesCache, 'snow', count, w, h, 'snow');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const t = now / 1000;
    for (const f of flakes) {
      const yy = (f.y + t * f.speed * 40) % h;
      const xx = (f.x + Math.sin(t + f.y) * 10 + t * f.drift * 20) % w;
      ctx.fillRect((xx + w) % w, yy, 2, 2);
    }
  }
}

// ---------- per-city skylines ----------

function renderNYC(ctx, w, h, now, sky, weather) {
  const rng = seededRng('nyc');
  const groundY = h * 0.92;
  // Park on the left
  ctx.fillStyle = sky.windowsLit ? '#1c3420' : '#4c7a42';
  ctx.fillRect(0, groundY - 18, w * 0.1, 18);
  for (let i = 0; i < 6; i++) {
    const tx = rng() * w * 0.09 + 4;
    ctx.fillStyle = '#2f5a34';
    ctx.beginPath();
    ctx.arc(tx, groundY - 20, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // River + bridge
  const riverX = w * 0.72;
  ctx.fillStyle = sky.windowsLit ? '#132038' : '#4a7fa8';
  ctx.fillRect(riverX, groundY - 4, w * 0.28, 24);
  ctx.strokeStyle = '#6a7482';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(riverX, groundY - 20);
  ctx.quadraticCurveTo(riverX + w * 0.14, groundY - 44, riverX + w * 0.28, groundY - 20);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const bx = riverX + (w * 0.28) * (i / 4);
    ctx.fillStyle = sky.windowsLit ? '#ffe39a' : '#2a2a2a';
    ctx.fillRect(bx, groundY - 24, 2, 4);
  }

  // Dense grid of art-deco / glass towers with setbacks
  const n = 16;
  const bandW = w * 0.72 / n;
  for (let i = 0; i < n; i++) {
    const x = w * 0.12 + i * bandW;
    const bw = bandW * (0.68 + rng() * 0.2);
    const bh = h * (0.28 + rng() * 0.48);
    const isGlass = rng() > 0.5;
    const color = isGlass ? '#3c5a78' : '#9a7a5c';
    const tiers = 1 + Math.floor(rng() * 3);
    drawSetbackTower(ctx, rng, x, groundY, bw, bh, tiers, color, sky, now);
    if (rng() < 0.4) drawWaterTower(ctx, x + bw * 0.25, groundY - bh, 0.9);
  }

  // Tall spire tower, the tallest landmark
  const spireX = w * 0.46;
  const spireH = h * 0.86;
  drawSetbackTower(ctx, rng, spireX - w * 0.035, groundY, w * 0.07, spireH * 0.86, 3, '#8c8c96', sky, now);
  ctx.strokeStyle = '#c8c8d4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(spireX, groundY - spireH * 0.86);
  ctx.lineTo(spireX, groundY - spireH);
  ctx.stroke();
  const blink = 0.5 + 0.5 * Math.sin(now / 500);
  ctx.globalAlpha = 0.5 + blink * 0.5;
  ctx.fillStyle = '#ff4040';
  ctx.beginPath();
  ctx.arc(spireX, groundY - spireH - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Yellow cabs driving along the avenue at the base
  const t = now / 1000;
  for (let i = 0; i < 4; i++) {
    const cx = ((t * 70 + i * (w / 4)) % (w + 40)) - 20;
    drawCar(ctx, cx, groundY + 2, '#f3c13a', 1);
  }
  if (weather.timeOfDay === 'day' || weather.timeOfDay === 'dawn') {
    for (let i = 0; i < 3; i++) drawCloud(ctx, ((t * 8 + i * 220) % (w + 100)) - 50, h * (0.12 + i * 0.05), 1.1, 0.5);
  }
}

function renderSingapore(ctx, w, h, now, sky, weather) {
  const rng = seededRng('singapore');
  const groundY = h * 0.9;
  // Marina water
  ctx.fillStyle = sky.windowsLit ? '#0e2436' : '#4a90a8';
  ctx.fillRect(0, groundY, w, h - groundY);

  // Shophouses along the waterfront
  const shN = 10;
  for (let i = 0; i < shN; i++) {
    const x = w * 0.03 + i * (w * 0.2 / shN);
    const bw = w * 0.2 / shN - 2;
    const bh = h * (0.08 + (i % 3) * 0.015);
    const colors = ['#e8c07a', '#e89a8a', '#8ec2b6', '#e2d9a0'];
    drawBuilding(ctx, rng, x, groundY, bw, bh, colors[i % colors.length], sky, now, 2, 2);
  }

  // Dense tower cluster
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x = w * 0.26 + i * (w * 0.4 / n);
    const bw = (w * 0.4 / n) * 0.7;
    const bh = h * (0.3 + rng() * 0.4);
    drawBuilding(ctx, rng, x, groundY, bw, bh, '#3a5a68', sky, now, 3, 9);
  }

  // Supertree garden (tree-like structures) on the right
  for (let i = 0; i < 4; i++) {
    const tx = w * 0.72 + i * 22;
    const th = h * (0.22 + (i % 2) * 0.08);
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, groundY);
    ctx.lineTo(tx, groundY - th);
    ctx.stroke();
    ctx.fillStyle = sky.windowsLit ? '#6fd8a0' : '#3f8f5e';
    ctx.beginPath();
    ctx.ellipse(tx, groundY - th, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (sky.windowsLit) {
      const tw = 0.5 + 0.5 * Math.sin(now / 600 + i);
      ctx.globalAlpha = 0.4 + tw * 0.4;
      ctx.fillStyle = '#9ff0c8';
      ctx.beginPath();
      ctx.ellipse(tx, groundY - th, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Three-tower hotel with a sky deck (the headline landmark)
  const hx = w * 0.5;
  const towerH = h * 0.56;
  const towerW = 14;
  const gap = 22;
  for (let i = -1; i <= 1; i++) {
    drawBuilding(ctx, rng, hx + i * gap - towerW / 2, groundY, towerW, towerH, '#4a6272', sky, now, 2, 10);
  }
  // sky deck "boat" spanning the three towers
  ctx.fillStyle = '#2a3844';
  ctx.fillRect(hx - gap - towerW / 2 - 4, groundY - towerH - 10, gap * 2 + towerW + 8, 10);
  ctx.fillStyle = sky.windowsLit ? '#8fe0ff' : '#bfe8fa';
  ctx.fillRect(hx - gap - towerW / 2, groundY - towerH - 8, gap * 2 + towerW, 3);

  // Boats on the marina
  const t = now / 1000;
  for (let i = 0; i < 2; i++) {
    const bx = ((t * 24 + i * (w / 2)) % (w + 60)) - 30;
    drawBoat(ctx, bx, groundY + 8 + i * 6, 1);
  }
}

function renderTokyo(ctx, w, h, now, sky, weather) {
  const rng = seededRng('tokyo');
  const groundY = h * 0.92;

  const n = 20;
  for (let i = 0; i < n; i++) {
    const x = w * 0.04 + i * (w * 0.6 / n);
    const bw = (w * 0.6 / n) * 0.78;
    const bh = h * (0.22 + rng() * 0.5);
    drawBuilding(ctx, rng, x, groundY, bw, bh, '#394252', sky, now, 3, 10);
    // Neon signage strip on some buildings
    if (sky.windowsLit && rng() < 0.55) {
      const neonColors = ['#ff4fa3', '#4fe0ff', '#ffe34f', '#8affa0'];
      const nc = neonColors[Math.floor(rng() * neonColors.length)];
      const blink = Math.sin(now / 380 + i * 2) > -0.4;
      if (blink) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = nc;
        ctx.fillRect(x + bw * 0.12, groundY - bh * (0.4 + (i % 3) * 0.12), bw * 0.56, 5);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Red-and-white lattice tower landmark
  drawLatticeTower(ctx, w * 0.78, groundY, h * 0.62, '#c94848');

  // Ambient neon glow wash at night
  if (sky.windowsLit) {
    const g = ctx.createLinearGradient(0, groundY - h * 0.3, 0, groundY);
    g.addColorStop(0, 'rgba(255,90,180,0)');
    g.addColorStop(1, 'rgba(255,90,180,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (!sky.windowsLit && (weather.timeOfDay === 'day')) {
    for (let i = 0; i < 3; i++) drawBird(ctx, w * 0.1 + i * 30 + Math.sin(now / 900) * 10, h * 0.2, now / 300 + i);
  }
}

function renderParis(ctx, w, h, now, sky, weather) {
  const rng = seededRng('paris');
  const groundY = h * 0.9;

  const n = 16;
  for (let i = 0; i < n; i++) {
    const x = w * 0.04 + i * (w * 0.62 / n);
    const bw = (w * 0.62 / n) * 0.86;
    const bh = h * (0.14 + (i % 4) * 0.02);
    drawBuilding(ctx, rng, x, groundY, bw, bh, '#e7dcc4', sky, now, 2, 3);
    // Mansard roof
    ctx.fillStyle = '#5c4a3c';
    ctx.beginPath();
    ctx.moveTo(x - 1, groundY - bh);
    ctx.lineTo(x + bw / 2, groundY - bh - 8);
    ctx.lineTo(x + bw + 1, groundY - bh);
    ctx.closePath();
    ctx.fill();
  }

  // Lattice iron tower landmark
  drawLatticeTower(ctx, w * 0.8, groundY, h * 0.78, '#8a6a4a');

  const t = now / 1000;
  for (let i = 0; i < 2; i++) drawBird(ctx, (t * 14 + i * 140) % w, h * 0.22 + i * 10, t * 4 + i);
  if (weather.timeOfDay === 'day' || weather.timeOfDay === 'dawn') {
    drawCloud(ctx, ((t * 6) % (w + 100)) - 50, h * 0.14, 1.3, 0.55);
  }
}

const CITY_RENDERERS = { nyc: renderNYC, singapore: renderSingapore, tokyo: renderTokyo, paris: renderParis };

export function renderCityCanvas(ctx, w, h, cityId, panByCityState, now, weather, effectsOn) {
  if (w <= 0 || h <= 0) return;
  const sky = skyPaletteForTimeOfDay(weather.timeOfDay);
  drawSkyGradient(ctx, w, h, sky);
  if (sky.stars) drawStars(ctx, w, h, cityId, now);

  const worldW = w * WORLD_SCALE;
  const pan = clampPan(worldW, w, panByCityState[cityId] || 0);
  panByCityState[cityId] = pan;

  ctx.save();
  ctx.translate(pan, 0);
  const renderer = CITY_RENDERERS[cityId] || renderNYC;
  renderer(ctx, worldW, h, now, sky, weather);
  ctx.restore();

  if (effectsOn) drawWeatherOverlay(ctx, w, h, weather, now);

  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
