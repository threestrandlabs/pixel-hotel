// Pixel Hotel v0.8.10 — Gumball trader trade modal UI. Offer generation and
// trade validation logic lives in trader.js; this module is pure DOM wiring.

import { getGumball } from './catalogue.js';
import { ownedCount, todayDateStr } from './gumballs.js';
import { traderForDate, generateDailyOffers, tryAcceptTrade } from './trader.js';

let stateRef = null;
let saveFn = null;
let toastFn = null;
let onTradeFn = null;

export function initTraderUI({ getState, save, showToast, onTradeAccepted }) {
  stateRef = getState;
  saveFn = save;
  toastFn = showToast || console.log;
  onTradeFn = onTradeAccepted || (() => {});
  bindDomEvents();
}

export function openTraderModal() {
  const modal = document.getElementById('gumballTradeModal');
  if (!modal) return;
  const persona = traderForDate(todayDateStr());
  const nameEl = document.getElementById('traderModalName');
  if (nameEl) nameEl.textContent = `🍬 ${persona.name}'s Trades`;
  modal.classList.remove('hidden');
  renderOffers();
}

export function closeTraderModal() {
  document.getElementById('gumballTradeModal')?.classList.add('hidden');
}

function renderOffers() {
  const el = document.getElementById('traderOffersList');
  if (!el || !stateRef) return;
  const state = stateRef();
  const date = todayDateStr();
  const offers = generateDailyOffers(date);

  el.innerHTML = offers.map((offer) => {
    const give = getGumball(offer.give.gumballId);
    const receive = getGumball(offer.receive.gumballId);
    const have = ownedCount(state, offer.give.gumballId);
    const already = state.gumballs.tradesAcceptedToday?.includes(offer.id);
    const canAfford = have >= offer.give.count;
    return `
      <div class="trader-offer">
        <div class="trader-offer-row">
          <span class="trader-give">Give ${offer.give.count}× ${give.name}</span>
          <span class="trader-arrow">→</span>
          <span class="trader-receive">Get ${offer.receive.count}× ${receive.name}</span>
        </div>
        <div class="trader-offer-sub">You have ${have}/${offer.give.count} ${give.name}</div>
        <button class="pixel-btn" data-offer="${offer.id}" ${already || !canAfford ? 'disabled' : ''}>
          ${already ? 'Traded Today' : (canAfford ? 'Accept' : 'Not Enough')}
        </button>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-offer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const offer = offers.find((o) => o.id === btn.dataset.offer);
      if (!offer) return;
      const res = tryAcceptTrade(state, offer, date);
      if (res.ok) {
        saveFn?.();
        toastFn(`Traded for ${getGumball(offer.receive.gumballId).name}!`);
        onTradeFn();
        renderOffers();
      } else {
        toastFn('Trade failed.');
      }
    });
  });
}

function bindDomEvents() {
  document.getElementById('btnTraderClose')?.addEventListener('click', closeTraderModal);
  document.getElementById('gumballTradeModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTraderModal();
  });
}
