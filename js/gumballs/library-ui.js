// Pixel Hotel v0.8.10 — Gumball Library: the full catalogue of all 20
// gumballs with name, rarity, drop %, flavor text and art. Unlike the
// Gumballs inventory tab (what you hold, for trading), this is the
// collection book — read-only, no actions.

import { GUMBALL_CATALOGUE, TOTAL_GUMBALLS, RARITY_LABELS } from './catalogue.js';
import { ownedCount } from './gumballs.js';

let stateRef = null;

export function initLibraryUI({ getState }) {
  stateRef = getState;
  document.getElementById('btnGumballLibraryClose')?.addEventListener('click', closeLibraryModal);
  document.getElementById('gumballLibraryModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLibraryModal();
  });
}

export function openLibraryModal() {
  const modal = document.getElementById('gumballLibraryModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderLibrary();
}

export function closeLibraryModal() {
  document.getElementById('gumballLibraryModal')?.classList.add('hidden');
}

function formatPercent(p) {
  return `${parseFloat((p * 100).toFixed(2))}%`;
}

function renderLibrary() {
  const grid = document.getElementById('gumballLibraryGrid');
  const progressEl = document.getElementById('gumballLibraryProgress');
  if (!grid || !stateRef) return;
  const state = stateRef();
  const owned = GUMBALL_CATALOGUE.filter((g) => ownedCount(state, g.id) > 0).length;
  if (progressEl) progressEl.textContent = `${owned}/${TOTAL_GUMBALLS} collected`;

  grid.innerHTML = GUMBALL_CATALOGUE.map((g) => {
    const count = ownedCount(state, g.id);
    const isOwned = count > 0;
    const firstDate = state.gumballs.firstObtained[g.id];
    const ballStyle = isOwned ? `background: radial-gradient(circle at 35% 30%, ${g.colorA}, ${g.colorB});` : '';
    return `
      <div class="gumball-library-card ${isOwned ? '' : 'unowned'}">
        <div class="gumball-cell-ball ${isOwned && g.special ? 'special-sparkle' : ''}" style="${ballStyle}"></div>
        <div class="gumball-cell-name">${isOwned ? g.name : '???'}</div>
        <div class="gumball-cell-rarity">${RARITY_LABELS[g.rarity]} · ${formatPercent(g.p)}</div>
        <div class="gumball-library-flavor">${isOwned ? g.flavor : 'Unidentified gumball — pull or trade to find out.'}</div>
        ${isOwned ? `<div class="gumball-cell-count">x${count} · first obtained ${firstDate}</div>` : ''}
      </div>`;
  }).join('');
}
