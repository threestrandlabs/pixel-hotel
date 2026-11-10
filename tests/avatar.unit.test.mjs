// Unit tests for Pixel Hotel v0.9.0 avatar creator and emotes:
// validation, option sanitation, save migration, and emote rate limiting.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PLAYER_LOOK, validateAvatarLook, randomizeLook,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, TOP_STYLES, ACCESSORY_STYLES,
} from '../js/avatar.js';
import {
  EMOTES, EMOTE_IDS, EMOTE_ICONS, isEmoteAllowed, isValidEmote,
} from '../js/emotes.js';
import { validateEmotePayload } from '../js/multiplayer/filter.js';
import { createReceiveThrottle } from '../js/multiplayer/realtimeRoom.js';
import { createDefaultState, loadState, SAVE_KEY } from '../js/save.js';
import { SAVE_VERSION } from '../js/data.js';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// ======================= Avatar Option Validation =======================

test('avatar: validateAvatarLook accepts valid looks with known option ids and valid hex colors', () => {
  const custom = {
    skin: '#d99b72',
    hair: '#b83828',
    hairStyle: 'spiky',
    eye: '#3b7a57',
    mouth: 'open',
    brow: '#4a2f20',
    lashes: true,
    shirt: '#e04a4a',
    outfit: 'hoodie',
    pants: '#1e222a',
    skirt: false,
    shoe: '#ff5252',
    accessory: 'cap',
    accessoryColor: '#8c52ff',
  };

  const validated = validateAvatarLook(custom);
  assert.deepEqual(validated, custom);
});

test('avatar: validateAvatarLook rejects unknown option ids and defaults to safe values', () => {
  const malicious = {
    skin: 'not-a-color',
    hair: '<script>alert(1)</script>',
    hairStyle: 'hacker-hair',
    eye: '#xyz123',
    mouth: 'super-smile',
    outfit: 'invisible-cloak',
    pants: 'rgba(0,0,0,1)',
    accessory: 'machine-gun',
    accessoryColor: 'blue',
  };

  const validated = validateAvatarLook(malicious);
  assert.equal(validated.skin, DEFAULT_PLAYER_LOOK.skin);
  assert.equal(validated.hair, DEFAULT_PLAYER_LOOK.hair);
  assert.equal(validated.hairStyle, DEFAULT_PLAYER_LOOK.hairStyle);
  assert.equal(validated.eye, DEFAULT_PLAYER_LOOK.eye);
  assert.equal(validated.mouth, DEFAULT_PLAYER_LOOK.mouth);
  assert.equal(validated.outfit, DEFAULT_PLAYER_LOOK.outfit);
  assert.equal(validated.pants, DEFAULT_PLAYER_LOOK.pants);
  assert.equal(validated.accessory, DEFAULT_PLAYER_LOOK.accessory);
  assert.equal(validated.accessoryColor, DEFAULT_PLAYER_LOOK.accessoryColor);
});

test('avatar: validateAvatarLook handles null, non-objects, and missing fields gracefully', () => {
  assert.equal(validateAvatarLook(null), null);
  assert.equal(validateAvatarLook('bad'), null);
  assert.equal(validateAvatarLook(123), null);

  const partial = { skin: '#ffe0c4' };
  const validated = validateAvatarLook(partial);
  assert.equal(validated.skin, '#ffe0c4');
  assert.equal(validated.hairStyle, DEFAULT_PLAYER_LOOK.hairStyle);
  assert.equal(validated.shirt, DEFAULT_PLAYER_LOOK.shirt);
  assert.equal(validated.accessory, DEFAULT_PLAYER_LOOK.accessory);
});

test('avatar: randomizeLook returns a completely valid look object', () => {
  for (let i = 0; i < 20; i++) {
    const look = randomizeLook([]);
    const validated = validateAvatarLook(look);
    assert.deepEqual(look, validated, 'randomized look must pass validation without changes');
  }
});

// ======================= Save Migration =======================

test('avatar: save migration keeps existing player look as defaults and updates SAVE_VERSION', () => {
  const storage = makeFakeStorage();
  const v9State = createDefaultState();
  v9State.version = 9;
  v9State.player.look = {
    hairStyle: 'curls',
    hairColor: '#e75480',
  };

  storage.setItem(SAVE_KEY, JSON.stringify(v9State));
  const loaded = loadState(storage);

  assert.equal(loaded.version, SAVE_VERSION);
  assert.equal(loaded.player.look.hairStyle, 'curls');
  assert.equal(loaded.player.look.hair, '#e75480');
  assert.equal(loaded.player.look.skin, DEFAULT_PLAYER_LOOK.skin);
  assert.equal(loaded.player.look.shirt, DEFAULT_PLAYER_LOOK.shirt);
  assert.equal(loaded.player.look.accessory, 'none');
});

// ======================= Emotes & Rate Limiting =======================

test('emotes: 8 distinct core emotes are registered with labels, icons and shortcuts', () => {
  assert.equal(EMOTES.length, 8);
  const expected = ['wave', 'dance', 'laugh', 'clap', 'heart', 'sleep', 'cheer', 'thumbsup'];
  for (const id of expected) {
    assert.ok(EMOTE_IDS.has(id), `emote ${id} must exist in EMOTE_IDS`);
    assert.ok(EMOTE_ICONS[id], `emote ${id} must have an icon`);
    assert.equal(isValidEmote(id), true);
  }
  assert.equal(isValidEmote('unknown'), false);
  assert.equal(isValidEmote(null), false);
});

test('emotes: isEmoteAllowed enforces 1000ms minimum interval', () => {
  assert.equal(isEmoteAllowed(undefined, 1000), true);
  assert.equal(isEmoteAllowed(1000, 1500), false); // only 500ms passed -> blocked
  assert.equal(isEmoteAllowed(1000, 1999), false); // 999ms -> blocked
  assert.equal(isEmoteAllowed(1000, 2000), true);  // 1000ms -> allowed
  assert.equal(isEmoteAllowed(1000, 3000), true);  // 2000ms -> allowed
});

test('emotes: validateEmotePayload accepts valid payload and rejects unknown emotes or bad user ids', () => {
  const uid = '4f6f9c1e-3b1a-4b8e-9a2e-7e2b7a2b7a2b';
  assert.equal(validateEmotePayload(null), null);
  assert.equal(validateEmotePayload({ userId: 'not-a-uuid', emote: 'wave' }), null);
  assert.equal(validateEmotePayload({ userId: uid, emote: 'dab' }), null); // unknown emote
  assert.equal(validateEmotePayload({ userId: uid, emote: 123 }), null);

  const ok = validateEmotePayload({ userId: uid, emote: 'wave', displayName: 'Player One' });
  assert.deepEqual(ok, { userId: uid, emote: 'wave', displayName: 'Player One' });
});

test('emotes: receive throttle rate-limits incoming emotes per sender (max 1 per second)', () => {
  const throttle = createReceiveThrottle(1000);
  assert.equal(throttle.allow('user-1', 1000), true);
  assert.equal(throttle.allow('user-1', 1400), false); // 400ms too soon
  assert.equal(throttle.allow('user-2', 1400), true);  // independent user allowed
  assert.equal(throttle.allow('user-1', 2001), true);  // 1001ms passed -> allowed
});
