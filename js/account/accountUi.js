// Account panel + cloud-save sync controller.
//
// Offline-first: nothing here touches the network until the player either
// presses a sign-in button or has signed in on this device before (the
// `enabled` flag in the cloud meta). Playing without an account is unchanged.

import { getSupabaseClient } from '../multiplayer/client.js';
import { SAVE_KEY, onStateSaved, setSavesSuspended } from '../save.js';
import {
  getAccountUser, requestEmailLink, startGoogleSignIn, signInAsGuest, signOutAccount, fetchCloudSave, putCloudSave, isValidEmail,
} from './accountApi.js';
import {
  cloudPayload, mergeCloudIntoLocal, saveFingerprint, hasMeaningfulProgress, summarizeSave, decideSync,
  readCloudMeta, writeCloudMeta, clearCloudMeta, isConflictError,
} from './cloudSave.js';

const PUSH_DELAY_MS = 4000;
const FOCUS_RECHECK_MS = 60000;
const AUTH_CALLBACK_RE = /[#&?](access_token|refresh_token|error_description|error_code)=/;

const ctx = {
  deps: null,
  client: null,
  user: null,
  busy: false,
  reloading: false, // a pulled save is being installed; nothing may push
  conflict: null, // { cloud } while the choice dialog is open
  pushTimer: null,
  lastCheckAt: 0,
  lastSyncedAt: null,
  statusText: '',
};

const byId = (id) => document.getElementById(id);
const storage = () => window.localStorage;

function redirectUrl() {
  return window.location.origin + window.location.pathname;
}

function setStatus(text) {
  ctx.statusText = text || '';
  const el = byId('accountStatus');
  if (el) el.textContent = ctx.statusText;
}

function formatWhen(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function render() {
  const signedIn = !!(ctx.user && !ctx.user.isAnonymous);
  const guest = !!(ctx.user && ctx.user.isAnonymous);
  byId('accountSignedOut')?.classList.toggle('hidden', signedIn);
  byId('accountSignedIn')?.classList.toggle('hidden', !signedIn);
  byId('accountGuestBanner')?.classList.toggle('hidden', !guest);
  byId('accountSignedOutIntro')?.classList.toggle('hidden', guest);
  byId('accountGuestOption')?.classList.toggle('hidden', guest);
  byId('accountGuestActions')?.classList.toggle('hidden', !guest);
  const btn = byId('btnAccount');
  if (btn) {
    btn.classList.toggle('account-signed-in', signedIn);
    btn.classList.toggle('account-guest', guest);
    const label = signedIn
      ? `Account: ${ctx.user.email || 'signed in'} (cloud save on)`
      : guest ? 'Playing as Guest: add an email or Google to save across devices' : 'Sign in to save across devices';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  if (signedIn) {
    const email = byId('accountEmail');
    if (email) email.textContent = ctx.user.email || 'your account';
    const when = byId('accountLastSync');
    if (when) when.textContent = formatWhen(ctx.lastSyncedAt);
  }
  setStatus(ctx.statusText);
}

async function ensureClient() {
  if (!ctx.client) ctx.client = await getSupabaseClient();
  return ctx.client;
}

// ---------------------------------------------------------------- sync core

function localInfo() {
  const state = ctx.deps.getState();
  return { state, hash: saveFingerprint(state), hasProgress: hasMeaningfulProgress(state) };
}

function rememberSynced(rev, hash, updatedAt) {
  const meta = readCloudMeta(storage());
  writeCloudMeta(storage(), { ...meta, enabled: true, userId: ctx.user.id, rev, hash });
  ctx.lastSyncedAt = updatedAt || new Date().toISOString();
  render();
}

async function pushNow(expectedRev) {
  const { state, hash } = localInfo();
  const result = await putCloudSave(ctx.client, cloudPayload(state), ctx.deps.getSaveVersion(), expectedRev);
  rememberSynced(result.rev, hash, result.updatedAt);
  setStatus('Saved to the cloud.');
}

function pullAndReload(cloud) {
  ctx.reloading = true;
  setSavesSuspended(true);
  if (ctx.pushTimer) clearTimeout(ctx.pushTimer);
  const merged = mergeCloudIntoLocal(cloud.data, ctx.deps.getState());
  try {
    storage().setItem(SAVE_KEY, JSON.stringify(merged));
  } catch (e) {
    setSavesSuspended(false);
    ctx.reloading = false;
    setStatus('Could not load the cloud save: this browser\'s storage is full or blocked.');
    return;
  }
  const meta = readCloudMeta(storage());
  writeCloudMeta(storage(), {
    ...meta, enabled: true, userId: ctx.user.id, rev: cloud.rev, hash: null, rehashOnLoad: true, justPulled: true,
  });
  window.location.reload();
}

function syncBlocked() {
  return !ctx.user || ctx.user.isAnonymous || ctx.busy || ctx.conflict || ctx.reloading;
}

/** One reconcile pass. Returns 'retry' when another device saved mid-way. */
async function syncOnce(quiet) {
  const cloud = await fetchCloudSave(ctx.client, ctx.user.id);
  const local = localInfo();
  const decision = decideSync({ local, cloud, meta: readCloudMeta(storage()), userId: ctx.user.id });
  if (decision === 'none') {
    ctx.lastSyncedAt = cloud ? cloud.updatedAt : ctx.lastSyncedAt;
    render();
    if (!quiet) setStatus('Up to date.');
  } else if (decision === 'push') {
    try {
      await pushNow(cloud ? cloud.rev : null);
    } catch (e) {
      if (isConflictError(e)) return 'retry';
      throw e;
    }
  } else if (decision === 'pull') {
    setStatus('Loading your progress from the cloud…');
    pullAndReload(cloud);
  } else {
    openConflict(cloud, local.state);
  }
  return 'done';
}

/** Full reconcile with the cloud. Safe to call any time; no-ops when busy. */
async function syncNow({ quiet = false } = {}) {
  if (syncBlocked()) return;
  ctx.busy = true;
  ctx.lastCheckAt = Date.now();
  if (!quiet) setStatus('Syncing…');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await syncOnce(quiet) === 'done') return;
    }
    setStatus('Another device keeps saving. Try "Sync now" in a moment.');
  } catch (e) {
    setStatus('Could not reach the cloud. Your progress is still saved on this device; it will sync later.');
  } finally {
    ctx.busy = false;
  }
}

function schedulePush() {
  if (!ctx.user || ctx.user.isAnonymous || ctx.conflict || ctx.reloading) return;
  if (ctx.pushTimer) clearTimeout(ctx.pushTimer);
  ctx.pushTimer = setTimeout(() => { ctx.pushTimer = null; pushIfChanged(); }, PUSH_DELAY_MS);
}

async function pushIfChanged() {
  if (syncBlocked()) return;
  const meta = readCloudMeta(storage());
  if (meta.userId !== ctx.user.id) { await syncNow({ quiet: true }); return; }
  if (localInfo().hash === meta.hash) return;
  ctx.busy = true;
  let conflicted = false;
  try {
    await pushNow(meta.rev == null ? null : meta.rev);
  } catch (e) {
    if (isConflictError(e)) conflicted = true;
    else setStatus('Offline: will sync when the connection is back.');
  } finally {
    ctx.busy = false;
  }
  // Another device saved first: reconcile (pull, or ask the player).
  if (conflicted) await syncNow({ quiet: true });
}

// ----------------------------------------------------------- conflict dialog

function fillSummary(prefix, summary, when) {
  const set = (id, v) => { const el = byId(prefix + id); if (el) el.textContent = String(v); };
  set('Coins', summary.coins);
  set('Items', summary.items);
  set('Quests', summary.questsDone);
  set('Tier', summary.roomTier);
  set('When', when);
}

function openConflict(cloud, localState) {
  ctx.conflict = { cloud };
  fillSummary('conflictLocal', summarizeSave(localState), 'now');
  fillSummary('conflictCloud', summarizeSave(cloud.data), formatWhen(cloud.updatedAt));
  ctx.deps.openPanel('syncConflictPanel');
  setStatus('Choose which progress to keep.');
}

async function resolveConflict(choice) {
  const pending = ctx.conflict;
  if (!pending) return;
  ctx.deps.closePanel('syncConflictPanel');
  ctx.conflict = null;
  if (choice === 'cloud') {
    pullAndReload(pending.cloud);
    return;
  }
  ctx.busy = true;
  let conflicted = false;
  try {
    await pushNow(pending.cloud.rev);
    ctx.deps.showToast('☁️ This device\'s progress is now your cloud save.');
  } catch (e) {
    if (isConflictError(e)) conflicted = true;
    else setStatus('Could not reach the cloud. Try "Sync now" in a moment.');
  } finally {
    ctx.busy = false;
  }
  if (conflicted) await syncNow();
}

// -------------------------------------------------------------- auth flows

async function onSignedIn(user) {
  ctx.user = user;
  const meta = readCloudMeta(storage());
  writeCloudMeta(storage(), { ...meta, enabled: true, guest: false });
  render();
  await syncNow();
}

async function start({ fromCallback }) {
  try {
    await ensureClient();
    const user = await getAccountUser(ctx.client);
    if (fromCallback) {
      const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
      const err = params.get('error_description');
      if (err) ctx.deps.showToast(`Sign-in failed: ${err}`);
      try { window.history.replaceState(null, '', redirectUrl()); } catch (e) { /* ignore */ }
    }
    if (!ctx.authListening) {
      ctx.authListening = true;
      ctx.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          ctx.user = null;
          const m = readCloudMeta(storage());
          if (m.guest) writeCloudMeta(storage(), { ...m, guest: false });
          render();
        } else if (session && session.user && session.user.is_anonymous && !ctx.user) {
          // multiplayer Connect created an anonymous identity in this tab
          ctx.user = { id: session.user.id, email: '', isAnonymous: true };
          render();
        } else if (session && session.user && !session.user.is_anonymous && (!ctx.user || ctx.user.isAnonymous)) {
          // e.g. the magic link was opened in another tab of this browser
          setTimeout(() => onSignedIn({
            id: session.user.id, email: session.user.email || '', isAnonymous: false,
          }), 0);
        }
      });
    }
    if (user && !user.isAnonymous) {
      if (fromCallback) ctx.deps.showToast(`☁️ Signed in as ${user.email || 'your account'}. Cloud save is on.`);
      await onSignedIn(user);
    } else {
      ctx.user = user;
      const meta = readCloudMeta(storage());
      writeCloudMeta(storage(), { ...meta, enabled: false, guest: !!user });
      render();
    }
  } catch (e) {
    setStatus('Could not reach the account service. You can keep playing; progress stays on this device.');
    render();
  }
}

async function handleEmailClick() {
  const input = byId('accountEmailInput');
  const email = input ? input.value.trim() : '';
  if (!isValidEmail(email)) { setStatus('Enter a valid email address.'); input?.focus(); return; }
  const btn = byId('btnAccountEmail');
  if (btn) btn.disabled = true;
  setStatus('Sending…');
  try {
    await ensureClient();
    await requestEmailLink(ctx.client, email, redirectUrl());
    setStatus(`Check ${email} for a sign-in link. Open it on this device to finish.`);
  } catch (e) {
    const msg = String((e && e.message) || e);
    setStatus(/rate|seconds/i.test(msg)
      ? 'Please wait a minute before asking for another link.'
      : 'Could not send the link. Check the address and try again.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleGuestClick() {
  const btn = byId('btnAccountGuest');
  if (btn) btn.disabled = true;
  setStatus('Signing in as Guest…');
  try {
    await ensureClient();
    if (!ctx.authListening) await start({ fromCallback: false });
    const user = ctx.user && ctx.user.isAnonymous ? ctx.user : await signInAsGuest(ctx.client);
    if (!user.isAnonymous) { await onSignedIn(user); return; }
    ctx.user = user;
    writeCloudMeta(storage(), { ...readCloudMeta(storage()), guest: true });
    render();
    setStatus('You\'re playing as a Guest. Progress stays in this browser.');
    ctx.deps.showToast('👤 Signed in as Guest.');
  } catch (e) {
    const msg = String((e && e.message) || e);
    setStatus(/anonymous/i.test(msg)
      ? 'Guest sign-in is turned off for this server (enable anonymous sign-ins in Supabase).'
      : 'Could not sign in as Guest. Check your connection and try again.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleGuestSignOutClick() {
  if (!window.confirm('Leave Guest mode? Your progress stays in this browser, but this guest identity (and its multiplayer friend code) cannot be recovered.')) return;
  try { await signOutAccount(ctx.client); } catch (e) { /* already gone */ }
  writeCloudMeta(storage(), { ...readCloudMeta(storage()), guest: false });
  ctx.user = null;
  render();
  setStatus('Signed out of Guest mode.');
}

async function handleGoogleClick() {
  setStatus('Opening Google…');
  try {
    await ensureClient();
    await startGoogleSignIn(ctx.client, redirectUrl());
  } catch (e) {
    setStatus('Google sign-in is not available right now.');
  }
}

async function handleSignOutClick() {
  if (!window.confirm('Sign out? Your progress stays on this device and in the cloud.')) return;
  if (ctx.pushTimer) { clearTimeout(ctx.pushTimer); ctx.pushTimer = null; }
  await pushIfChanged().catch(() => {});
  try { await signOutAccount(ctx.client); } catch (e) { /* session may already be gone */ }
  clearCloudMeta(storage());
  ctx.user = null;
  window.location.reload();
}

// ----------------------------------------------------------------- public

/** True while signed in to a real account with cloud save on. */
export function isCloudSaveActive() {
  return !!(ctx.user && !ctx.user.isAnonymous);
}

/**
 * deps: { getState, getSaveVersion, showToast, openPanel(id), closePanel(id) }
 */
export function initAccountUI(deps) {
  ctx.deps = deps;

  const meta = readCloudMeta(storage());
  if (meta.rehashOnLoad) {
    const { rehashOnLoad, justPulled, ...rest } = meta;
    writeCloudMeta(storage(), { ...rest, hash: saveFingerprint(deps.getState()) });
    if (justPulled) setTimeout(() => deps.showToast('☁️ Loaded your latest progress from the cloud.'), 600);
  }

  byId('btnAccountEmail')?.addEventListener('click', handleEmailClick);
  byId('accountEmailInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleEmailClick(); });
  byId('btnAccountGoogle')?.addEventListener('click', handleGoogleClick);
  byId('btnAccountGuest')?.addEventListener('click', handleGuestClick);
  byId('btnAccountGuestSignOut')?.addEventListener('click', handleGuestSignOutClick);
  byId('btnAccountSync')?.addEventListener('click', () => { ctx.conflict = null; syncNow(); });
  byId('btnAccountSignOut')?.addEventListener('click', handleSignOutClick);
  byId('btnConflictKeepLocal')?.addEventListener('click', () => resolveConflict('local'));
  byId('btnConflictUseCloud')?.addEventListener('click', () => resolveConflict('cloud'));

  onStateSaved(() => schedulePush());

  document.addEventListener('visibilitychange', () => {
    if (!isCloudSaveActive()) return;
    if (document.visibilityState === 'hidden') {
      if (ctx.pushTimer) { clearTimeout(ctx.pushTimer); ctx.pushTimer = null; pushIfChanged(); }
    } else if (Date.now() - ctx.lastCheckAt > FOCUS_RECHECK_MS) {
      syncNow({ quiet: true });
    }
  });

  render();
  const fromCallback = AUTH_CALLBACK_RE.test(window.location.href);
  const bootMeta = readCloudMeta(storage());
  if (fromCallback || bootMeta.enabled || bootMeta.guest) start({ fromCallback });
}
