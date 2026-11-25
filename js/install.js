// "Install app" support (no service worker: the game always loads fresh).
// Chromium browsers fire `beforeinstallprompt` when the page is installable;
// iOS Safari never does, so there we show the Share -> Add to Home Screen hint.

let deferredPrompt = null;

export function isStandalone() {
  return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

export function isIosSafari(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints || 0) {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1); // iPadOS reports as Mac
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && !otherBrowser;
}

function byId(id) { return document.getElementById(id); }

function render() {
  const section = byId('installSection');
  const btn = byId('btnInstallApp');
  const hint = byId('installHint');
  if (!section || !btn || !hint) return;
  if (isStandalone()) { section.classList.add('hidden'); return; }
  if (deferredPrompt) {
    section.classList.remove('hidden');
    btn.classList.remove('hidden');
    hint.classList.add('hidden');
  } else if (isIosSafari()) {
    section.classList.remove('hidden');
    btn.classList.add('hidden');
    hint.textContent = 'On iPhone or iPad: tap the Share button, then "Add to Home Screen".';
    hint.classList.remove('hidden');
  } else {
    section.classList.add('hidden');
  }
}

export function initInstallPrompt({ showToast } = {}) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we offer it from the Account panel instead of a mini-infobar
    deferredPrompt = e;
    render();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    render();
    if (showToast) showToast('📲 Pixel Hotel is installed. Open it from your home screen or dock.');
  });
  byId('btnInstallApp')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    try { await prompt.userChoice; } catch (e) { /* dismissed */ }
    render();
  });
  render();
}
