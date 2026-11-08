// Lazy Supabase client loader for Pixel Hotel multiplayer (v0.8.0+).
//
// Nothing in this file runs at import time beyond defining functions — no
// network call happens until getSupabaseClient() is actually invoked, which
// only happens after the player clicks the multiplayer opt-in button. This
// is what keeps single-player fully offline/unreachable to any backend.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_JS_CDN_URL } from '../config.js';

let clientPromise = null;

/**
 * Returns a singleton Supabase client, dynamically importing supabase-js
 * from a pinned CDN URL on first call. Safe to call multiple times.
 *
 * Test-only seam: if `window.__mpTestClientFactory` is set (only ever done
 * by the Playwright mocked-browser multiplayer tests, never in production),
 * it is used instead of the real CDN import so tests never touch the
 * network — mirrors the existing window.__pixelHotel debug-hook pattern.
 */
export function getSupabaseClient() {
  if (!clientPromise) {
    if (typeof window !== 'undefined' && typeof window.__mpTestClientFactory === 'function') {
      clientPromise = Promise.resolve(window.__mpTestClientFactory());
    } else {
      clientPromise = import(/* webpackIgnore: true */ SUPABASE_JS_CDN_URL).then(({ createClient }) => (
        createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            storageKey: 'pixelHotel.mp.auth.v1',
          },
        })
      ));
    }
  }
  return clientPromise;
}

/** True once the lazy client has been requested at least once this page load. */
export function isMultiplayerLoaded() {
  return clientPromise !== null;
}
