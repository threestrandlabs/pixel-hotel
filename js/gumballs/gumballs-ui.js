// Pixel Hotel v0.8.10 — Gumball Machine pull modal + Gumballs inventory tab UI.

import { GUMBALL_CATALOGUE, TOTAL_GUMBALLS, RARITY_LABELS } from './catalogue.js';
import {
  pullGumball, recordGumball, ownedCount, totalDistinctOwned, rarityProgress, GUMBALL_PULL_COST, todayDateStr,
} from './gumballs.js';

let stateRef = null;
let saveFn = null;
let toastFn = null;
let refreshCoinsFn = null;
let refreshGumballsTabFn = null;
let audioFn = null;
let openLibraryFn = null;
let cranking = false;

export function initGumballUI({ getState, save, showToast, refreshCoins, refreshGumballsTab, playSfx, openLibrary }) {
  stateRef = getState;
  saveFn = save;
  toastFn = showToast || console.log;
  refreshCoinsFn = refreshCoins || (() => {});
  refreshGumballsTabFn = refreshGumballsTab || (() => {});
  audioFn = playSfx || (() => {});
  openLibraryFn = openLibrary || (() => {});
  bindDomEvents();
}

export function openGumballModal() {
  const modal = document.getElementById('gumballModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('gumballReveal')?.classList.add('hidden');
  document.getElementById('gumballCrankArt')?.classList.remove('hidden');
}

export function closeGumballModal() {
  document.getElementById('gumballModal')?.classList.add('hidden');
}

function pull(rng = Math.random) {
  if (cranking) return;
  const state = stateRef();
  if (state.coins < GUMBALL_PULL_COST) {
    toastFn('Not enough coins — need 5 🪙');
    return;
  }
  cranking = true;
  state.coins -= GUMBALL_PULL_COST;
  refreshCoinsFn();

  const crankArt = document.getElementById('gumballCrankArt');
  const reveal = document.getElementById('gumballReveal');
  reveal?.classList.add('hidden');
  crankArt?.classList.add('cranking');
  audioFn('click');

  setTimeout(() => {
    const gumballId = pullGumball(rng);
    recordGumball(state, gumballId, todayDateStr());
    saveFn?.();
    refreshGumballsTabFn();
    showReveal(gumballId);
    crankArt?.classList.remove('cranking');
    crankArt?.classList.add('hidden');
    cranking = false;
  }, 600);
}

function showReveal(gumballId) {
  const g = GUMBALL_CATALOGUE.find((x) => x.id === gumballId);
  const reveal = document.getElementById('gumballReveal');
  const ball = document.getElementById('gumballRevealBall');
  const nameEl = document.getElementById('gumballRevealName');
  const rarityEl = document.getElementById('gumballRevealRarity');
  if (!reveal || !g) return;
  ball.style.background = `radial-gradient(circle at 35% 30%, ${g.colorA}, ${g.colorB})`;
  ball.classList.toggle('special-sparkle', !!g.special);
  nameEl.textContent = g.name;
  rarityEl.textContent = RARITY_LABELS[g.rarity];
  reveal.classList.remove('hidden');
  audioFn(g.special ? 'sparkle' : 'coin');
}

function bindDomEvents() {
  document.getElementById('btnGumballClose')?.addEventListener('click', closeGumballModal);
  document.getElementById('gumballModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeGumballModal();
  });
  document.getElementById('btnGumballPull')?.addEventListener('click', () => pull());
}

export function renderGumballsTab() {
  const el = document.getElementById('gumballsTab');
  if (!el || !stateRef) return;
  const state = stateRef();
  const owned = totalDistinctOwned(state);
  const progress = rarityProgress(state);

  const summaryHtml = `
    <div class="gumball-collection-summary">
      <span>Collected: <b>${owned}/${TOTAL_GUMBALLS}</b></span>
      <button class="pixel-btn" id="btnOpenGumballLibrary">📖 Library</button>
    </div>
    <div class="gumball-rarity-bars">
      ${progress.map((p) => `<div>${RARITY_LABELS[p.rarity]}: ${p.owned}/${p.total}</div>`).join('')}
    </div>`;

  const gridHtml = `<div class="gumball-grid">${GUMBALL_CATALOGUE.map((g) => {
    const count = ownedCount(state, g.id);
    const owned = count > 0;
    const ballStyle = owned
      ? `background: radial-gradient(circle at 35% 30%, ${g.colorA}, ${g.colorB});`
      : '';
    return `
      <div class="gumball-cell ${owned ? '' : 'unowned'}">
        <div class="gumball-cell-ball ${owned && g.special ? 'special-sparkle' : ''}" style="${ballStyle}"></div>
        <div class="gumball-cell-name">${owned ? g.name : '???'}</div>
        <div class="gumball-cell-rarity">${RARITY_LABELS[g.rarity]}</div>
        ${owned ? `<div class="gumball-cell-count">x${count}</div>` : ''}
      </div>`;
  }).join('')}</div>`;

  el.innerHTML = summaryHtml + gridHtml;
  document.getElementById('btnOpenGumballLibrary')?.addEventListener('click', () => openLibraryFn());
}
