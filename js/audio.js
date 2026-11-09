// Original procedural Web Audio multi-room soundtrack, traffic ambience & soft SFX.
// Zero external audio files or network calls. AudioContext is created only after a user gesture.

export const ROOM_TRACKS = {
  lobby: {
    id: 'lobby',
    roomId: 'lobby',
    title: 'Velvet Grand Atrium',
    genre: 'Lobby Jazz Lounge',
    label: 'Velvet Lounge',
    stepMs: 190,
    cutoff: 1420,
    chordWave: 'triangle',
    leadWave: 'sine',
    bassWave: 'triangle',
    chords: [
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [164.81, 196.0, 246.94, 293.66], // Em7
      [146.83, 174.61, 220.0, 261.63], // Dm7
      [130.81, 164.81, 196.0, 246.94], // Cmaj7
    ],
    bass: [87.31, 87.31, 82.41, 98.0, 73.42, 73.42, 65.41, 98.0],
    bells: [523.25, 0, 659.25, 587.33, 0, 440.0, 523.25, 0],
    drumPattern: ['k', 'h', 's', 'h', 'k', 'k', 's', 'h'],
  },
  cafe: {
    id: 'cafe',
    roomId: 'cafe',
    title: 'Espresso Bossa Breeze',
    genre: 'Cafe Bossa Nova',
    label: 'Starlight Bossa',
    stepMs: 172,
    cutoff: 1550,
    chordWave: 'sine',
    leadWave: 'triangle',
    bassWave: 'sine',
    chords: [
      [196.0, 246.94, 293.66, 369.99], // Gmaj7
      [185.0, 220.0, 261.63, 329.63],  // F#m7b5
      [146.83, 185.0, 246.94, 311.13], // B7b9
      [164.81, 196.0, 246.94, 293.66], // Em7
    ],
    bass: [98.0, 0, 146.83, 98.0, 92.5, 0, 123.47, 82.41],
    bells: [587.33, 739.99, 0, 659.25, 587.33, 0, 493.88, 587.33],
    drumPattern: ['k', 'h', 's', 'k', 'h', 's', 'k', 'h'],
  },
  restaurant: {
    id: 'restaurant',
    roomId: 'restaurant',
    title: 'Candlelight Skyline Sax',
    genre: 'Restaurant Smooth Jazz',
    label: 'Skyline Smooth Jazz',
    stepMs: 205,
    cutoff: 1320,
    chordWave: 'sine',
    leadWave: 'sawtooth',
    bassWave: 'triangle',
    chords: [
      [155.56, 196.0, 233.08, 293.66], // Ebmaj7
      [130.81, 155.56, 196.0, 233.08], // Cm7
      [174.61, 207.65, 261.63, 311.13], // Fm7
      [116.54, 146.83, 174.61, 207.65], // Bb7
    ],
    bass: [77.78, 0, 98.0, 65.41, 87.31, 0, 58.27, 87.31],
    bells: [466.16, 587.33, 523.25, 0, 392.0, 466.16, 0, 523.25],
    drumPattern: ['k', 'h', 's', 'h', '.', 'k', 's', 'h'],
  },
  gym: {
    id: 'gym',
    roomId: 'gym',
    title: 'Pulse Synth Overdrive',
    genre: 'Gym Upbeat Electronic',
    label: 'Pulse Synth Groove',
    stepMs: 140,
    cutoff: 1920,
    chordWave: 'sawtooth',
    leadWave: 'sawtooth',
    bassWave: 'square',
    chords: [
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [196.0, 246.94, 293.66, 329.63], // G6
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [164.81, 220.0, 246.94, 293.66], // E7sus4
    ],
    bass: [110.0, 110.0, 98.0, 110.0, 87.31, 87.31, 82.41, 98.0],
    bells: [440.0, 523.25, 659.25, 523.25, 392.0, 523.25, 587.33, 659.25],
    drumPattern: ['k', 'h', 's', 'h', 'k', 'h', 's', 'h'],
  },
  pool: {
    id: 'pool',
    roomId: 'pool',
    title: 'Azure Thermal Reflections',
    genre: 'Pool & Spa Ambient',
    label: 'Azure Spa Drift',
    stepMs: 240,
    cutoff: 940,
    chordWave: 'sine',
    leadWave: 'sine',
    bassWave: 'sine',
    chords: [
      [146.83, 185.0, 220.0, 277.18],  // Dmaj7
      [123.47, 146.83, 185.0, 220.0],  // Bm7
      [196.0, 246.94, 293.66, 369.99], // Gmaj7
      [146.83, 164.81, 220.0, 277.18], // A6sus4
    ],
    bass: [73.42, 0, 61.74, 0, 98.0, 0, 82.41, 0],
    bells: [587.33, 0, 0, 739.99, 0, 659.25, 0, 880.0],
    drumPattern: ['k', '.', 'h', '.', '.', 'h', 's', '.'],
  },
  arcade: {
    id: 'arcade',
    roomId: 'arcade',
    title: 'Cosmic Bellhop Turbo',
    genre: 'Arcade Chiptune',
    label: 'Neon Arcade Pulse',
    stepMs: 138,
    cutoff: 2350,
    chordWave: 'square',
    leadWave: 'square',
    bassWave: 'triangle',
    chords: [
      [261.63, 311.13, 392.0, 466.16], // Cm7
      [207.65, 261.63, 311.13, 392.0], // Abmaj7
      [155.56, 196.0, 233.08, 311.13], // Ebmaj7
      [233.08, 293.66, 349.23, 466.16], // Bb
    ],
    bass: [130.81, 130.81, 103.83, 103.83, 77.78, 116.54, 116.54, 98.0],
    bells: [523.25, 622.25, 783.99, 622.25, 523.25, 466.16, 587.33, 783.99],
    drumPattern: ['k', 'h', 's', 'h', 'k', 'k', 's', 'h'],
  },
  library: {
    id: 'library',
    roomId: 'library',
    title: 'Folio & Rainlight',
    genre: 'Library Soft Piano',
    label: 'Quiet Piano Study',
    stepMs: 225,
    cutoff: 1120,
    chordWave: 'triangle',
    leadWave: 'triangle',
    bassWave: 'sine',
    chords: [
      [207.65, 261.63, 311.13, 392.0], // Abmaj7
      [174.61, 207.65, 261.63, 311.13], // Fm7
      [138.59, 174.61, 207.65, 261.63], // Dbmaj7
      [155.56, 196.0, 233.08, 277.18], // Eb7
    ],
    bass: [103.83, 0, 87.31, 0, 69.3, 0, 77.78, 0],
    bells: [523.25, 622.25, 415.3, 0, 523.25, 0, 466.16, 392.0],
    drumPattern: ['k', '.', 'h', '.', '.', '.', 'h', '.'],
  },
  myroom: {
    id: 'myroom',
    roomId: 'myroom',
    title: 'Suite 801 Cushioned Tape',
    genre: 'My Room Lo-Fi',
    label: 'Suite Lo-Fi',
    stepMs: 210,
    cutoff: 1060,
    chordWave: 'triangle',
    leadWave: 'sine',
    bassWave: 'triangle',
    chords: [
      [146.83, 174.61, 220.0, 261.63], // Dm7
      [196.0, 246.94, 293.66, 349.23], // G7
      [130.81, 164.81, 196.0, 246.94], // Cmaj7
      [164.81, 207.65, 246.94, 293.66], // E7
    ],
    bass: [73.42, 0, 98.0, 73.42, 65.41, 0, 82.41, 65.41],
    bells: [523.25, 0, 493.88, 440.0, 392.0, 0, 440.0, 523.25],
    drumPattern: ['k', 'h', 's', 'h', '.', 'k', 's', 'h'],
  },
  garden: {
    id: 'garden',
    roomId: 'garden',
    title: 'Sakura Canopy Pluck',
    genre: 'Sky Garden Acoustic',
    label: 'Botanical Breeze',
    stepMs: 195,
    cutoff: 1520,
    chordWave: 'sine',
    leadWave: 'triangle',
    bassWave: 'triangle',
    chords: [
      [130.81, 164.81, 196.0, 293.66], // Cadd9
      [196.0, 246.94, 293.66, 392.0],  // G
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
    ],
    bass: [65.41, 98.0, 98.0, 110.0, 110.0, 87.31, 87.31, 98.0],
    bells: [659.25, 587.33, 523.25, 392.0, 440.0, 523.25, 659.25, 587.33],
    drumPattern: ['k', 'h', '.', 'h', 'k', 'h', 's', 'h'],
  },
  rooftop: {
    id: 'rooftop',
    roomId: 'rooftop',
    title: 'Stratosphere Horizon Groove',
    genre: 'Rooftop Sunset House',
    label: 'Horizon Deep House',
    stepMs: 156,
    cutoff: 1680,
    chordWave: 'triangle',
    leadWave: 'sawtooth',
    bassWave: 'sine',
    chords: [
      [185.0, 220.0, 277.18, 329.63],  // F#m7
      [146.83, 185.0, 220.0, 277.18],  // Dmaj7
      [123.47, 146.83, 185.0, 220.0],  // Bm7
      [138.59, 185.0, 207.65, 246.94], // C#7sus4
    ],
    bass: [92.5, 92.5, 73.42, 73.42, 61.74, 61.74, 69.3, 82.41],
    bells: [554.37, 0, 493.88, 440.0, 0, 369.99, 440.0, 493.88],
    drumPattern: ['k', 'h', 'k', 'h', 'k', 'h', 's', 'h'],
  },
};

export const TRACK_ORDER = [
  'lobby', 'cafe', 'restaurant', 'gym', 'pool',
  'arcade', 'library', 'myroom', 'garden', 'rooftop',
];

// James's original floor soundtrack files (one per floor, ~2min, loop=true). If a
// file fails to load/decode/play, playback falls back to the procedural ROOM_TRACKS synth.
export const MUSIC_FILES = {
  lobby: { src: 'audio/music/01-grand-lobby.mp3', label: 'Grand Lobby Jazz Lounge' },
  cafe: { src: 'audio/music/02-cafe-and-bar.mp3', label: 'Cafe and Bar Bossa Nova' },
  restaurant: { src: 'audio/music/03-restaurant.mp3', label: 'Restaurant Smooth Jazz' },
  gym: { src: 'audio/music/04-gym.mp3', label: 'Gym Pulse Fitness Electronic' },
  pool: { src: 'audio/music/05-pool-and-spa.mp3', label: 'Pool and Spa Calm Ambient' },
  arcade: { src: 'audio/music/06-arcade.mp3', label: 'Arcade Chiptune' },
  library: { src: 'audio/music/07-library.mp3', label: 'Library Soft Piano' },
  myroom: { src: 'audio/music/08-my-room.mp3', label: 'My Room Lofi Chill' },
  garden: { src: 'audio/music/09-sky-garden.mp3', label: 'Sky Garden Nature Acoustic' },
  rooftop: { src: 'audio/music/10-rooftop.mp3', label: 'Rooftop Sunset Night House' },
};

// Backward-compatible MOOD_PROFILES map including legacy aliases ('spa', 'night') and all 10 room tracks
export const MOOD_PROFILES = {
  ...ROOM_TRACKS,
  spa: {
    ...ROOM_TRACKS.pool,
    id: 'spa',
    label: 'Azure Spa Drift',
  },
  night: {
    ...ROOM_TRACKS.myroom,
    id: 'night',
    label: 'Midnight Lofi',
    stepMs: 225,
    cutoff: 840,
  },
};

export function moodForRoom(roomId = 'lobby', phase = 0.5) {
  const isNight = phase < 0.22 || phase > 0.78;
  if (roomId === 'gym' || roomId === 'arcade') return 'gym';
  if (roomId === 'pool' || roomId === 'garden' || roomId === 'rooftop') return 'spa';
  if (isNight) return 'night';
  return 'lobby';
}

export function trackForRoom(roomId = 'lobby') {
  return ROOM_TRACKS[roomId] ? roomId : 'lobby';
}

export function getTrafficAttenuation(roomId = 'lobby', floor = 1) {
  const f = floor === 'R' ? 10 : Math.max(1, Number(floor) || 1);
  if (roomId === 'lobby' || f === 1) return 0.78;
  if (roomId === 'rooftop') return 0.26;
  return Math.max(0.1, Math.pow(0.74, f - 1) * 0.65);
}

export function formatTime(sec) {
  if (typeof sec !== 'number' || isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export class ChiptuneAudio {
  constructor(audioContextFactory = null) {
    this._acFactory = audioContextFactory;
    this.ctx = null;
    this.compressor = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.ambienceGain = null;
    this.noiseBuffer = null;

    this.gestureUnlocked = false;
    this.musicMuted = false;
    this.sfxMuted = false;
    this.ambienceMuted = false;
    this.masterVolume = 0.85;
    this.musicVolume = 0.75;
    this.sfxVolume = 0.75;
    this.ambienceVolume = 0.65;

    this.playing = true;
    this.autoFollowRoom = true;
    this.roomId = 'lobby';
    this.floor = 1;
    this.phase = 0.5;
    this.mood = 'lobby';
    this.trackId = 'lobby';
    this.isNight = false;

    this.step = 0;
    this.timer = null;
    this.lastFootstepAt = 0;
    this.lastTrafficEventAt = 0;

    this._audioFactory = (typeof window !== 'undefined' && window.Audio) || (typeof Audio !== 'undefined' ? Audio : null);
    this.fileNodes = {};
    this.fileFallback = {};
    this.activeFileTrackId = null;
    this._fadeTimers = {};
    this._loadTrackAssets(this.trackId);
  }

  get muted() {
    return this.musicMuted && this.sfxMuted;
  }

  set muted(val) {
    this.musicMuted = !!val;
    this.sfxMuted = !!val;
  }

  isUnlocked() {
    return this.gestureUnlocked && !!this.ctx;
  }

  _effectiveMusicTarget() {
    if (this.musicMuted || !this.playing || this.musicVolume <= 0 || this.masterVolume <= 0) {
      return 0.0001;
    }
    return Math.max(0.0001, this.musicVolume * 0.84);
  }

  _effectiveSfxTarget() {
    if (this.sfxMuted || this.sfxVolume <= 0 || this.masterVolume <= 0) {
      return 0.0001;
    }
    return Math.max(0.0001, this.sfxVolume * 0.62);
  }

  _effectiveAmbienceTarget() {
    if (this.sfxMuted || this.ambienceMuted || this.sfxVolume <= 0 || this.ambienceVolume <= 0 || this.masterVolume <= 0) {
      return 0.0001;
    }
    const atten = getTrafficAttenuation(this.roomId, this.floor);
    return Math.max(0.0001, this.ambienceVolume * this.sfxVolume * atten * 0.45);
  }

  ensureContext() {
    if (!this.gestureUnlocked) return null;
    if (!this.ctx) {
      const AC = this._acFactory || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = Math.max(0.0001, this.masterVolume * 0.95);

      if (typeof this.ctx.createDynamicsCompressor === 'function') {
        this.compressor = this.ctx.createDynamicsCompressor();
        if (this.compressor.threshold) this.compressor.threshold.value = -12;
        if (this.compressor.knee) this.compressor.knee.value = 10;
        if (this.compressor.ratio) this.compressor.ratio.value = 3.5;
        if (this.compressor.attack) this.compressor.attack.value = 0.005;
        if (this.compressor.release) this.compressor.release.value = 0.16;
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
      } else {
        this.master.connect(this.ctx.destination);
      }

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this._effectiveMusicTarget();
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._effectiveSfxTarget();
      this.sfxGain.connect(this.master);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = this._effectiveAmbienceTarget();
      this.ambienceGain.connect(this.master);

      this.noiseBuffer = this._buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  _buildNoiseBuffer() {
    if (!this.ctx || typeof this.ctx.createBuffer !== 'function') return null;
    const sr = this.ctx.sampleRate || 44100;
    const len = Math.floor(sr * 0.35);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let s = 2463534242;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const white = ((s & 0xffff) / 0x8000) - 1;
      prev = prev * 0.74 + white * 0.26;
      data[i] = prev;
    }
    return buf;
  }

  _syncGains(crossfadeSec = 0.03) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime || 0;
    const setG = (node, target, tau) => {
      if (!node) return;
      if (node.gain.setTargetAtTime) {
        node.gain.setTargetAtTime(target, now, tau);
      } else {
        node.gain.value = target;
      }
    };
    setG(this.master, Math.max(0.0001, this.masterVolume * 0.95), 0.02);
    setG(this.musicGain, this._effectiveMusicTarget(), crossfadeSec);
    setG(this.sfxGain, this._effectiveSfxTarget(), 0.02);
    setG(this.ambienceGain, this._effectiveAmbienceTarget(), 0.05);
  }

  configure(settings = {}) {
    if (typeof settings.musicMuted === 'boolean') this.musicMuted = settings.musicMuted;
    else if (typeof settings.muted === 'boolean') this.musicMuted = settings.muted;

    if (typeof settings.sfxMuted === 'boolean') this.sfxMuted = settings.sfxMuted;
    else if (typeof settings.muted === 'boolean') this.sfxMuted = settings.muted;

    if (typeof settings.ambienceMuted === 'boolean') this.ambienceMuted = settings.ambienceMuted;

    if (typeof settings.masterVolume === 'number' && Number.isFinite(settings.masterVolume)) {
      this.masterVolume = Math.max(0, Math.min(1, settings.masterVolume));
    }
    if (typeof settings.musicVolume === 'number' && Number.isFinite(settings.musicVolume)) {
      this.musicVolume = Math.max(0, Math.min(1, settings.musicVolume));
    }
    if (typeof settings.sfxVolume === 'number' && Number.isFinite(settings.sfxVolume)) {
      this.sfxVolume = Math.max(0, Math.min(1, settings.sfxVolume));
    }
    if (typeof settings.ambienceVolume === 'number' && Number.isFinite(settings.ambienceVolume)) {
      this.ambienceVolume = Math.max(0, Math.min(1, settings.ambienceVolume));
    }
    if (typeof settings.autoFollowRoom === 'boolean') {
      this.autoFollowRoom = settings.autoFollowRoom;
    }
    this._syncGains();
    if (this.gestureUnlocked) {
      if ((this.musicMuted || !this.playing || this.musicVolume <= 0) && (this.sfxMuted || this.ambienceMuted || this.ambienceVolume <= 0)) {
        this.stopLoop();
      } else {
        this.startLoop();
      }
    }
  }

  unlockGesture() {
    const wasUnlocked = this.gestureUnlocked;
    this.gestureUnlocked = true;
    if ((!this.musicMuted && this.musicVolume > 0 && this.playing) || (!this.sfxMuted && this.sfxVolume > 0)) {
      this.ensureContext();
      this.startLoop();
    } else if (!wasUnlocked) {
      this.ensureContext();
    }
    return this.isUnlocked();
  }

  setMuted(muted) {
    this.musicMuted = !!muted;
    this.sfxMuted = !!muted;
    this._syncGains();
    if (this.musicMuted) this.stopLoop();
    else if (this.gestureUnlocked) this.startLoop();
  }

  setMusicMuted(muted) {
    this.musicMuted = !!muted;
    this._syncGains();
    if (this.musicMuted || this.musicVolume <= 0 || !this.playing) this.stopLoop();
    else if (this.gestureUnlocked) this.startLoop();
  }

  setSfxMuted(muted) {
    this.sfxMuted = !!muted;
    this._syncGains();
  }

  setAmbienceMuted(muted) {
    this.ambienceMuted = !!muted;
    this._syncGains();
  }

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    this._syncGains();
  }

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    this._syncGains();
    if (this.musicVolume <= 0 || this.musicMuted || !this.playing) this.stopLoop();
    else if (this.gestureUnlocked) this.startLoop();
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    this._syncGains();
  }

  setAmbienceVolume(vol) {
    this.ambienceVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    this._syncGains();
  }

  setPlaying(playing) {
    this.playing = !!playing;
    this._syncGains();
    if (!this.playing) this.stopLoop();
    else if (this.gestureUnlocked && !this.musicMuted && this.musicVolume > 0) this.startLoop();
    return this.playing;
  }

  togglePlayPause() {
    return this.setPlaying(!this.playing);
  }

  setAutoFollowRoom(autoFollow) {
    this.autoFollowRoom = !!autoFollow;
    if (this.autoFollowRoom) {
      this.setTrack(trackForRoom(this.roomId), false);
    }
    return this.autoFollowRoom;
  }

  setTrack(trackId, manual = false) {
    if (!ROOM_TRACKS[trackId]) return this.getTrackInfo();
    if (manual) this.autoFollowRoom = false;
    const changed = this.trackId !== trackId;
    this.trackId = trackId;
    if (changed) {
      this._loadTrackAssets(trackId);
      this._crossfadeRestartLoop();
    }
    return this.getTrackInfo();
  }

  nextTrack() {
    const idx = TRACK_ORDER.indexOf(this.trackId);
    const nextId = TRACK_ORDER[(idx + 1 + TRACK_ORDER.length) % TRACK_ORDER.length];
    return this.setTrack(nextId, true);
  }

  prevTrack() {
    const idx = TRACK_ORDER.indexOf(this.trackId);
    const prevId = TRACK_ORDER[(idx - 1 + TRACK_ORDER.length) % TRACK_ORDER.length];
    return this.setTrack(prevId, true);
  }

  _crossfadeRestartLoop() {
    const fileHandled = this._syncFileTrack();
    if (!fileHandled && this.ctx && this.musicGain && this.musicGain.gain.setValueAtTime && this.musicGain.gain.linearRampToValueAtTime) {
      const now = this.ctx.currentTime || 0;
      const target = this._effectiveMusicTarget();
      this.musicGain.gain.setValueAtTime(Math.max(0.0001, target * 0.25), now);
      this.musicGain.gain.linearRampToValueAtTime(target, now + 0.18);
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this._startTimer();
    }
  }

  // ---------- file-backed floor soundtrack (audio/music/*.mp3), with procedural synth fallback ----------

  _loadTrackAssets(trackId) {
    this._getFileTrack(trackId);
    const idx = TRACK_ORDER.indexOf(trackId);
    if (idx !== -1) this._getFileTrack(TRACK_ORDER[(idx + 1) % TRACK_ORDER.length]);
  }

  _getFileTrack(trackId) {
    const def = MUSIC_FILES[trackId];
    if (!def || this.fileFallback[trackId]) return null;
    let node = this.fileNodes[trackId];
    if (node) return node;
    if (!this._audioFactory) return null;
    let el;
    try {
      el = new this._audioFactory();
    } catch (e) {
      this.fileFallback[trackId] = true;
      return null;
    }
    el.loop = true;
    el.preload = 'auto';
    el.src = def.src;
    el.addEventListener('error', () => this._handleFileError(trackId));
    node = { el, source: null, gain: null };
    this.fileNodes[trackId] = node;
    return node;
  }

  _connectFileNode(trackId, node) {
    if (node.gain) return true;
    if (!this.ctx || !this.musicGain) return false;
    try {
      node.source = this.ctx.createMediaElementSource(node.el);
      node.gain = this.ctx.createGain();
      node.gain.gain.value = 0.0001;
      node.source.connect(node.gain);
      node.gain.connect(this.musicGain);
      return true;
    } catch (e) {
      this._handleFileError(trackId);
      return false;
    }
  }

  _handleFileError(trackId) {
    if (this.fileFallback[trackId]) return;
    this.fileFallback[trackId] = true;
    const node = this.fileNodes[trackId];
    delete this.fileNodes[trackId];
    if (node) {
      try { node.el.pause(); } catch (e) { /* ignore */ }
      if (node.gain) { try { node.gain.disconnect(); } catch (e) { /* ignore */ } }
      if (node.source) { try { node.source.disconnect(); } catch (e) { /* ignore */ } }
    }
    if (this._fadeTimers[trackId]) {
      clearTimeout(this._fadeTimers[trackId]);
      delete this._fadeTimers[trackId];
    }
    if (this.activeFileTrackId === trackId) this.activeFileTrackId = null;
  }

  _isFileTrackActive() {
    return this.activeFileTrackId === this.trackId && !this.fileFallback[this.trackId];
  }

  // Starts/crossfades the file track for the current trackId if music should be playing;
  // returns true when file playback is handling the current track (so the synth stays silent).
  _syncFileTrack() {
    const shouldPlayMusic = this.gestureUnlocked && !this.musicMuted && this.musicVolume > 0 && this.playing && this.masterVolume > 0;
    const fileAvailable = !!MUSIC_FILES[this.trackId] && !this.fileFallback[this.trackId];
    if (!shouldPlayMusic || !fileAvailable) {
      if (this.activeFileTrackId) this._fadeOutActiveFileTrack();
      return false;
    }
    if (this.activeFileTrackId === this.trackId) return true;
    return this._playFileTrack(this.trackId);
  }

  _playFileTrack(trackId) {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    const node = this._getFileTrack(trackId);
    if (!node || !this._connectFileNode(trackId, node)) return false;
    // Cancel any deferred pause from a prior fade-out of this track, otherwise the
    // stale timer pauses the element we are restarting (e.g. unmute then room change).
    if (this._fadeTimers[trackId]) {
      clearTimeout(this._fadeTimers[trackId]);
      delete this._fadeTimers[trackId];
    }
    const prevId = this.activeFileTrackId;
    const crossfade = !!(prevId && prevId !== trackId);
    if (crossfade) this._fadeOutActiveFileTrack(1.1);
    const fadeSec = crossfade ? 1.1 : 0.4;
    const now = ctx.currentTime || 0;
    const target = Math.max(0.0001, this._effectiveMusicTarget());
    const startVal = node.gain.gain.value || 0.0001;
    if (node.gain.gain.cancelScheduledValues) node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setValueAtTime(startVal, now);
    node.gain.gain.linearRampToValueAtTime(target, now + fadeSec);
    try {
      const playResult = node.el.play();
      if (playResult && typeof playResult.catch === 'function') playResult.catch(() => this._handleFileError(trackId));
    } catch (e) {
      this._handleFileError(trackId);
      return false;
    }
    this.activeFileTrackId = trackId;
    return true;
  }

  _fadeOutActiveFileTrack(fadeSec = 0.25) {
    const id = this.activeFileTrackId;
    this.activeFileTrackId = null;
    if (!id) return;
    const node = this.fileNodes[id];
    if (!node) return;
    if (this.ctx && node.gain && node.gain.gain.setValueAtTime) {
      const now = this.ctx.currentTime || 0;
      const startVal = node.gain.gain.value || 0.0001;
      if (node.gain.gain.cancelScheduledValues) node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(startVal, now);
      node.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    }
    if (this._fadeTimers[id]) clearTimeout(this._fadeTimers[id]);
    this._fadeTimers[id] = setTimeout(() => { try { node.el.pause(); } catch (e) { /* ignore */ } }, fadeSec * 1000 + 80);
  }

  setRoomMood(roomId, phase = this.phase, floor = this.floor) {
    const prevRoom = this.roomId;
    this.roomId = roomId || this.roomId;
    this.floor = typeof floor === 'number' ? floor : (floor === 'R' ? 10 : this.floor);
    this.phase = typeof phase === 'number' ? phase : this.phase;
    this.isNight = this.phase < 0.22 || this.phase > 0.78;
    const nextMood = moodForRoom(this.roomId, this.phase);
    const moodChanged = nextMood !== this.mood;
    this.mood = nextMood;

    let trackChanged = false;
    if (this.autoFollowRoom) {
      const targetTrack = trackForRoom(this.roomId);
      if (targetTrack !== this.trackId) {
        this.trackId = targetTrack;
        trackChanged = true;
        this._loadTrackAssets(targetTrack);
      }
    }
    if (prevRoom !== this.roomId) {
      this._syncGains(0.08);
    }
    if ((moodChanged || trackChanged) && this.timer) {
      this._crossfadeRestartLoop();
    }
    return this.getMoodInfo();
  }

  getTrackProfile() {
    return ROOM_TRACKS[this.trackId] || ROOM_TRACKS[this.roomId] || ROOM_TRACKS.lobby;
  }

  getMoodInfo() {
    const track = this.getTrackProfile();
    const moodProfile = MOOD_PROFILES[this.mood] || track;
    const fileDef = MUSIC_FILES[track.id];
    const fallback = !!this.fileFallback[track.id];
    const usingFile = this._isFileTrackActive();
    const label = (fileDef && !fallback) ? fileDef.label : (this.isNight ? `${track.title} (Night)` : track.title);
    return {
      mood: this.mood,
      trackId: track.id,
      title: track.title,
      genre: track.genre,
      label,
      moodLabel: this.isNight && this.mood !== 'night' ? `${moodProfile.label} (Night)` : moodProfile.label,
      roomId: this.roomId,
      isNight: this.isNight,
      playing: this.playing && !this.musicMuted && this.musicVolume > 0,
      autoFollowRoom: this.autoFollowRoom,
      stepMs: track.stepMs,
      cutoff: this.isNight ? Math.round(track.cutoff * 0.82) : track.cutoff,
      step: this.step,
      stepProgress: (this.step % 32) / 32,
      usingFile,
      fallback,
      src: fileDef ? fileDef.src : null,
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
    };
  }

  getCurrentTime() {
    const activeId = this.activeFileTrackId || this.trackId;
    const node = this.fileNodes[activeId];
    if (node) {
      if (typeof node._seekTime === 'number') {
        if (node.el && typeof node.el.currentTime === 'number' && !isNaN(node.el.currentTime)) {
          if (Math.abs(node.el.currentTime - node._seekTime) < 1.0) {
            return node.el.currentTime;
          }
          const delta = Math.max(0, node.el.currentTime - (node._seekBase || 0));
          return Math.min(this.getDuration(), node._seekTime + delta);
        }
        return node._seekTime;
      }
      if (typeof node._pendingSeek === 'number') return node._pendingSeek;
      if (node.el && typeof node.el.currentTime === 'number' && !isNaN(node.el.currentTime)) {
        return node.el.currentTime;
      }
    }
    const profile = this.getTrackProfile();
    const stepSec = (profile.stepMs || 200) / 1000;
    const loopSteps = (profile.chords?.length || 4) * 8;
    return ((this.step % loopSteps) * stepSec);
  }

  getDuration() {
    const activeId = this.activeFileTrackId || this.trackId;
    const isFileTrack = !!MUSIC_FILES[activeId] && !this.fileFallback[activeId];
    const node = this.fileNodes[activeId];
    if (node && node.el && typeof node.el.duration === 'number' && !isNaN(node.el.duration) && isFinite(node.el.duration) && node.el.duration > 0) {
      return node.el.duration;
    }
    if (isFileTrack) {
      return 120;
    }
    const profile = this.getTrackProfile();
    const stepSec = (profile.stepMs || 200) / 1000;
    const loopSteps = (profile.chords?.length || 4) * 8;
    return loopSteps * stepSec;
  }

  seek(seconds) {
    const dur = this.getDuration();
    const maxDur = dur > 0 ? dur : 120;
    const clamped = Math.max(0, Math.min(maxDur, Number(seconds) || 0));
    const activeId = this.activeFileTrackId || this.trackId;
    const node = this._getFileTrack(activeId) || this.fileNodes[activeId];
    if (node) {
      node._seekTime = clamped;
      node._seekBase = (node.el && !isNaN(node.el.currentTime)) ? node.el.currentTime : 0;
      if (node.el) {
        if (typeof node.el.readyState === 'number' && node.el.readyState < 1) {
          node._pendingSeek = clamped;
          node.el.addEventListener('loadedmetadata', () => {
            if (typeof node._pendingSeek === 'number') {
              try { node.el.currentTime = node._pendingSeek; } catch (e) {}
              node._pendingSeek = null;
            }
          }, { once: true });
        } else {
          try {
            node.el.currentTime = clamped;
            node._pendingSeek = null;
          } catch (e) {
            node._pendingSeek = clamped;
          }
        }
      }
    }
    const profile = this.getTrackProfile();
    const stepSec = (profile.stepMs || 200) / 1000;
    if (stepSec > 0) {
      const loopSteps = (profile.chords?.length || 4) * 8;
      this.step = Math.floor(clamped / stepSec) % loopSteps;
    }
    return clamped;
  }

  seekRatio(ratio) {
    const r = Math.max(0, Math.min(1, Number(ratio) || 0));
    const dur = this.getDuration();
    return this.seek(r * dur);
  }

  getTrackInfo() {
    return this.getMoodInfo();
  }

  startLoop() {
    if (!this.gestureUnlocked) return;
    if ((this.musicMuted || this.musicVolume <= 0 || !this.playing) && (this.sfxMuted || this.ambienceMuted || this.ambienceVolume <= 0)) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    this._syncFileTrack();
    if (this.timer) return;
    this._startTimer();
  }

  _startTimer() {
    const track = this.getTrackProfile();
    const stepTime = track.stepMs;
    this.timer = setInterval(() => {
      if (!this.musicMuted && this.musicVolume > 0 && this.playing && this.masterVolume > 0 && !this._isFileTrackActive()) {
        this._tickMusicStep();
      }
      if (!this.sfxMuted && !this.ambienceMuted && this.ambienceVolume > 0 && this.sfxVolume > 0 && this.masterVolume > 0) {
        this._tickTrafficAmbience();
      }
      this.step++;
    }, stepTime);
  }

  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._fadeOutActiveFileTrack();
  }

  _createLowpass(cutoff, q = 0.7) {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.createBiquadFilter !== 'function') return null;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    if (filter.Q) filter.Q.value = q;
    return filter;
  }

  _tickMusicStep() {
    if (!this.ctx || !this.musicGain) return;
    const profile = this.getTrackProfile();
    const subStep = this.step % 8;
    const barIdx = Math.floor(this.step / 8) % profile.chords.length;
    const stepSec = profile.stepMs / 1000;
    const cutoff = this.isNight ? profile.cutoff * 0.82 : profile.cutoff;

    // 1. Rich Multi-Voice Chords on beat 0 and re-voicing on beat 4
    if (subStep === 0 || subStep === 4) {
      const chord = profile.chords[barIdx];
      const dur = stepSec * (subStep === 0 ? 3.8 : 3.4);
      const vel = subStep === 0 ? 0.145 : 0.105;
      this._playWarmChord(chord, dur, cutoff, vel, profile.chordWave || 'triangle');
    }

    // 2. Groovy Bassline
    const bassFreq = profile.bass[subStep % profile.bass.length];
    if (bassFreq > 0) {
      this._playWarmVoice(bassFreq, stepSec * 1.45, profile.bassWave || 'triangle', 340, 0.185, 0.02);
    }

    // 3. Lead / Bell / Arpeggio Melody
    const bellFreq = profile.bells[subStep % profile.bells.length];
    if (bellFreq > 0) {
      const freq = this.isNight ? bellFreq * 0.5 : bellFreq;
      this._playWarmVoice(freq, stepSec * 1.85, profile.leadWave || 'sine', cutoff * 1.25, 0.11, 0.02);
    }

    // 4. Crisp Brushed & Groove Percussion
    const drum = profile.drumPattern[subStep % profile.drumPattern.length];
    if (drum === 'k') this._playSoftKick(0.165);
    else if (drum === 's') this._playSoftBrush(0.07, 1750, 0.068);
    else if (drum === 'h') this._playSoftBrush(0.038, 3600, 0.042);
  }

  _tickTrafficAmbience() {
    if (!this.ctx || (!this.ambienceGain && !this.sfxGain)) return;
    const dest = this.ambienceGain || this.sfxGain;
    const atten = getTrafficAttenuation(this.roomId, this.floor);
    if (atten <= 0.02) return;

    // Periodic low street tire/engine hum pulse every 4 steps
    if (this.step % 4 === 0 && this.noiseBuffer) {
      this._playSoftBrush(0.42, 240, 0.035 * atten, dest);
    }
    // Occasional distant car horn or bus brake hiss
    if (this.step % 24 === 12) {
      this.playTrafficHorn(atten);
    } else if (this.step % 32 === 20) {
      this.playBusBrakeHiss(atten);
    }
  }

  playTrafficHorn(atten = getTrafficAttenuation(this.roomId, this.floor)) {
    if (!this.gestureUnlocked || this.sfxMuted || this.ambienceMuted || this.sfxVolume <= 0 || this.ambienceVolume <= 0) {
      return false;
    }
    const ctx = this.ensureContext();
    const dest = this.ambienceGain || this.sfxGain;
    if (!ctx || !dest) return false;
    const now = ctx.currentTime || 0;
    const gain = Math.max(0.008, 0.055 * atten);
    // Classic urban dual-tone car horn (F#4 + A4)
    this._scheduleTone(369.99, now, 0.14, 'sawtooth', 920, gain, dest);
    this._scheduleTone(440.0, now, 0.14, 'triangle', 920, gain, dest);
    this._scheduleTone(369.99, now + 0.18, 0.22, 'sawtooth', 920, gain * 0.9, dest);
    this._scheduleTone(440.0, now + 0.18, 0.22, 'triangle', 920, gain * 0.9, dest);
    return true;
  }

  playBusBrakeHiss(atten = getTrafficAttenuation(this.roomId, this.floor)) {
    if (!this.gestureUnlocked || this.sfxMuted || this.ambienceMuted || this.sfxVolume <= 0 || this.ambienceVolume <= 0) {
      return false;
    }
    const ctx = this.ensureContext();
    const dest = this.ambienceGain || this.sfxGain;
    if (!ctx || !dest || !this.noiseBuffer) return false;
    this._playSoftBrush(0.28, 2100, Math.max(0.006, 0.045 * atten), dest);
    return true;
  }

  _playWarmChord(freqs, duration, cutoff, peakGain = 0.13, wave = 'triangle') {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const filter = this._createLowpass(cutoff, 0.65);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(peakGain, now + 0.05);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (filter) {
      bus.connect(filter);
      filter.connect(this.musicGain);
    } else {
      bus.connect(this.musicGain);
    }

    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : wave;
      osc.frequency.setValueAtTime(freqs[i], now);
      if (osc.detune) osc.detune.value = (i - 1.5) * 4;
      osc.connect(bus);
      osc.start(now);
      osc.stop(now + duration + 0.04);
    }
  }

  _playWarmVoice(freq, duration, type = 'sine', cutoff = 1100, peakGain = 0.12, attack = 0.018, dest = this.musicGain) {
    if (!this.ctx || !dest) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(attack + 0.02, duration));

    const filter = this._createLowpass(cutoff, 0.55);
    if (filter) {
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  _playSoftKick(peak = 0.16) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.095);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  _playSoftBrush(duration = 0.045, centerFreq = 2600, peakGain = 0.045, dest = this.musicGain) {
    if (!this.ctx || !dest || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this._createLowpass(centerFreq, 0.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (filter) {
      src.connect(filter);
      filter.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(dest);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  playNote(freq, duration) {
    if (!this.ctx) return;
    this._playWarmVoice(freq, duration, 'triangle', 1200, 0.16, 0.015, this.sfxGain || this.master);
  }

  playSfx(kind = 'click') {
    if (!this.gestureUnlocked || this.sfxMuted || this.sfxVolume <= 0 || this.masterVolume <= 0) return false;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return false;
    const now = ctx.currentTime;

    if (kind === 'footstep' || kind === 'step') {
      const ms = Date.now();
      if (ms - this.lastFootstepAt < 110) return false;
      this.lastFootstepAt = ms;
      this._sweepTone(155, 88, 0.042, 'triangle', 440, 0.075);
      return true;
    }
    if (kind === 'click') {
      this._sweepTone(540, 380, 0.048, 'sine', 1200, 0.11);
      return true;
    }
    if (kind === 'chat') {
      this._sweepTone(430, 580, 0.065, 'sine', 1300, 0.11);
      return true;
    }
    if (kind === 'place') {
      this._sweepTone(220, 330, 0.09, 'triangle', 820, 0.14);
      return true;
    }
    if (kind === 'coin') {
      this._scheduleTone(987.77, now, 0.09, 'sine', 2200, 0.14);
      this._scheduleTone(1318.51, now + 0.055, 0.16, 'triangle', 2300, 0.14);
      return true;
    }
    if (kind === 'elevator') {
      this._scheduleTone(783.99, now, 0.18, 'sine', 1550, 0.14);
      this._scheduleTone(659.25, now + 0.14, 0.28, 'triangle', 1400, 0.14);
      return true;
    }
    if (kind === 'horn') {
      return this.playTrafficHorn();
    }
    if (kind === 'brake') {
      return this.playBusBrakeHiss();
    }
    if (kind === 'quest') {
      const notes = [523.25, 659.25, 783.99, 987.77];
      notes.forEach((f, i) => {
        this._scheduleTone(f, now + i * 0.06, 0.24, i % 2 ? 'triangle' : 'sine', 1900, 0.13);
      });
      return true;
    }
    this._sweepTone(440, 392, 0.065, 'sine', 1050, 0.1);
    return true;
  }

  _sweepTone(f0, f1, dur, type, cutoff, peak, dest = this.sfxGain) {
    if (!this.ctx || !dest) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const filter = this._createLowpass(cutoff, 0.6);
    if (filter) {
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  _scheduleTone(freq, startTime, dur, type, cutoff, peak, dest = this.sfxGain) {
    if (!this.ctx || !dest) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    const filter = this._createLowpass(cutoff, 0.6);
    if (filter) {
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }
}

export const audio = new ChiptuneAudio();
