# Accounts & cloud save

Optional sign-in so a player's progress follows them across devices.

## Guest mode

**Continue as Guest** works as soon as "Allow anonymous sign-ins" is on (already
required by multiplayer), so it can be tested before any of the setup below.
Guests have no cloud save: an anonymous identity cannot sign in on a second
device. Adding an email or Google upgrades the guest in place.

## One-time setup (Supabase dashboard)

1. **SQL Editor:** paste and run
   [`supabase/migrations/0005_v014_cloud_save.sql`](../supabase/migrations/0005_v014_cloud_save.sql),
   then [`0006_v014_social.sql`](../supabase/migrations/0006_v014_social.sql)
   (friends, showcase and trades). Both are idempotent, so running them again
   is safe.
2. **Authentication → Sign In / Providers**
   - **Email:** enabled. Magic links need no password.
   - **Google:** enabled. Create an OAuth client in Google Cloud Console
     (type "Web application"), add the Supabase callback URL shown on this page
     as an *Authorized redirect URI*, then paste the client ID and secret here.
   - **Allow manual linking:** on. This lets a player who already used anonymous
     multiplayer attach Google to that same identity. Without it, the game falls
     back to a plain Google sign-in, and the old anonymous friend code is not
     carried over.
3. **Authentication → URL Configuration**
   - Site URL: `https://threestrandlabs.github.io/pixel-hotel/`
   - Redirect URLs: the same URL, plus `http://localhost:8080/` for `npm run dev`.
4. Optional: **Authentication → Emails** to restyle the magic-link and
   "confirm email change" templates. Players upgrading an anonymous identity
   receive the email-change one.

Supabase's built-in email sender is heavily rate-limited (a few emails per
hour). For real players, configure a custom SMTP provider under
**Authentication → Emails → SMTP Settings**.

## How sync works

- `js/account/cloudSave.js` holds the pure logic. The cloud copy is the whole
  save minus `settings`. A fingerprint of the local save plus the cloud revision
  last seen (stored under `pixelHotel.cloud.v1`) decide between *none*, *push*,
  *pull* and *conflict*:

  | This device changed? | Cloud changed? | Result |
  | --- | --- | --- |
  | no | no | nothing |
  | yes | no | upload |
  | no | yes | download and reload |
  | yes | yes | ask the player (download directly if the device has no real progress) |

- `put_player_save(p_data, p_save_version, p_expected_rev)` refuses a write
  unless `p_expected_rev` matches the stored revision, so two devices can never
  silently overwrite each other. A refused write triggers a fresh sync.
- Only permanent (email/Google) users can read or write `player_saves`;
  anonymous multiplayer identities cannot.
- Downloads go through the normal `loadState()` migration path: the page writes
  the save to `localStorage` and reloads, so an older cloud save is upgraded
  like any local one.

## Limits

- The save is trusted client data, as it always was: a player can edit their
  own coins. The cloud save does not change that, and it is never shared with
  other players.
- A save is capped at 1 MB server-side.
