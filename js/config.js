// Public client configuration for Pixel Hotel multiplayer (v0.8.0+).
//
// These values are PUBLIC BY DESIGN: a Supabase project URL and "publishable"
// (anon) key are meant to ship in client-side code — all access control is
// enforced server-side by Postgres Row Level Security, not by keeping this
// file secret. Never put a service_role key or any other secret here.
//
// This module has zero side effects (no network calls) — importing it alone
// does not touch the network, so single-player stays fully offline.
export const SUPABASE_URL = 'https://xpbqeirtripatxidjhno.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KjB0ZlcO3cLTuBOIPDK5UQ_62essroO';

// Pinned CDN ESM build of supabase-js — no bundler/npm dependency, matches
// this project's no-build-step setup. Loaded lazily only when the player
// opts into multiplayer (see js/multiplayer/client.js).
export const SUPABASE_JS_CDN_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1';
