// Account sign-in + cloud save calls. Every function takes the Supabase
// client as its first argument (same pattern as multiplayer/auth.js) so the
// unit tests can pass an in-memory fake.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw) {
  const email = String(raw || '').trim();
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** The signed-in user as { id, email, isAnonymous }, or null. */
export async function getAccountUser(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const user = data && data.session && data.session.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || (user.user_metadata && user.user_metadata.email) || '',
    isAnonymous: user.is_anonymous === true,
  };
}

/**
 * Emails a one-time sign-in link. If this browser already has an anonymous
 * multiplayer identity, the email is attached to it instead, so the friend
 * code and shared room carry over. Falls back to a normal sign-in when that
 * email already belongs to an account.
 * Returns { linked: boolean }.
 */
export async function requestEmailLink(client, rawEmail, redirectTo) {
  const email = String(rawEmail || '').trim();
  if (!isValidEmail(email)) throw new Error('invalid_email');

  const current = await getAccountUser(client).catch(() => null);
  if (current && current.isAnonymous) {
    const { error } = await client.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
    if (!error) return { linked: true };
  }
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw error;
  return { linked: false };
}

/**
 * Starts Google sign-in (the browser leaves the page and comes back to
 * redirectTo). Links Google to an existing anonymous identity when possible.
 */
export async function startGoogleSignIn(client, redirectTo) {
  const current = await getAccountUser(client).catch(() => null);
  if (current && current.isAnonymous && typeof client.auth.linkIdentity === 'function') {
    const { error } = await client.auth.linkIdentity({ provider: 'google', options: { redirectTo } });
    if (!error) return { linked: true };
  }
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
  return { linked: false };
}

/**
 * "Continue as Guest": a Supabase anonymous identity. Reuses the browser's
 * existing session (e.g. from multiplayer) instead of creating a new one.
 * A guest can later add an email or Google to the same identity.
 */
export async function signInAsGuest(client) {
  const current = await getAccountUser(client);
  if (current) return current;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  const user = data && data.user;
  if (!user) throw new Error('guest_sign_in_failed');
  return { id: user.id, email: '', isAnonymous: true };
}

export async function signOutAccount(client) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** The caller's cloud save as { data, saveVersion, rev, updatedAt }, or null. */
export async function fetchCloudSave(client, userId) {
  const { data, error } = await client
    .from('player_saves')
    .select('data, save_version, rev, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { data: data.data, saveVersion: data.save_version, rev: Number(data.rev), updatedAt: data.updated_at };
}

/**
 * Writes the save. expectedRev is the cloud revision this device last saw
 * (null when it believes there is no cloud save yet). Throws a
 * 'save_conflict' error if another device saved in between.
 * Returns { rev, updatedAt }.
 */
export async function putCloudSave(client, payload, saveVersion, expectedRev) {
  const { data, error } = await client.rpc('put_player_save', {
    p_data: payload,
    p_save_version: saveVersion,
    p_expected_rev: expectedRev == null ? null : expectedRev,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('empty_response');
  return { rev: Number(row.rev), updatedAt: row.updated_at };
}
