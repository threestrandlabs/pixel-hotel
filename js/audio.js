// Original procedural Web Audio gentle lounge/lofi looping music & soft enveloped SFX.
// Zero external audio files or network calls. AudioContext is created only after a user gesture.

export const MOOD_PROFILES = {
  lobby: {
    id: 'lobby',
    label: 'Velvet Lounge',
    stepMs: 195,
    cutoff: 1050,
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
  gym: {
    id: 'gym',
    label: 'Pulse Synth Groove',
    stepMs: 150,
    cutoff: 1380,
    chords: [
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [196.0, 246.94, 293.66, 329.63], // G6
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [164.81, 220.0, 246.94, 293.66], // E7sus4
    ],
    bass: [110.0, 110.0, 98.0, 110.0, 87.31, 87.31, 82.41, 98.0],
    bells: [440.0, 523.25, 659.25, 0, 392.0, 523.25, 587.33, 0],
    drumPattern: ['k', 'h', 's', 'h', 'k', 'h', 's', 'h'],
  },
  spa: {
    id: 'spa',
    label: 'Azure Spa Drift',
    stepMs: 240,
    cutoff: 820,
    chords: [
      [146.83, 185.0, 220.0, 277.18],  // Dmaj7
      [123.47, 146.83, 185.0, 220.0],  // Bm7
      [196.0, 246.94, 293.66, 369.99], // Gmaj7
      [146.83, 164.81, 220.0, 277.18], // A6sus4
    ],
    bass: [73.42, 0, 61.74, 0, 98.0, 0, 82.41, 0],
    bells: [587.33, 0, 0, 739.99, 0, 659.25, 0, 0],
    drumPattern: ['k', '.', 'h', '.', '.', 'h', 's', '.'],
  },
  night: {
    id: 'night',
    label: 'Midnight Lofi',
    stepMs: 225,
    cutoff: 740,
    chords: [
      [146.83, 174.61, 220.0, 261.63], // Dm7
      [196.0, 246.94, 293.66, 349.23], // G7
      [130.81, 164.81, 196.0, 246.94], // Cmaj7
      [164.81, 207.65, 246.94, 293.66], // E7
    ],
    bass: [73.42, 0, 98.0, 0, 65.41, 0, 82.41, 0],
    bells: [523.25, 0, 493.88, 0, 392.0, 0, 440.0, 0],
    drumPattern: ['k', '.', 'h', '.', 's', '.', 'h', '.'],
  },
};

export function moodForRoom(roomId = 'lobby', phase = 0.5) {
  const isNight = phase < 0.22 || phase > 0.78;
  if (roomId === 'gym' || roomId === 'arcade') return isNight ? 'Gym Night Lofi' && 'gym' : 'gym';
  if (roomId === 'pool' || roomId === 'garden' || roomId === 'rooftop') return 'spa';
  if (isNight) return 'night';
  return 'lobby';
}

export class ChiptuneAudio {
  constructor(audioContextFactory = null) {
    this._acFactory = audioContextFactory;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;

    this.gestureUnlocked = false;
    this.musicMuted = false;
    this.sfxMuted = false;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.7;

    this.roomId = 'lobby';
    this.phase = 0.5;
    this.mood = 'lobby';
    this.isNight = false;

    this.step = 0;
    this.timer = null;
    this.lastFootstepAt = 0;
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

  ensureContext() {
    if (!this.gestureUnlocked) return null;
    if (!this.ctx) {
      const AC = this._acFactory || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicMuted ? 0.0001 : Math.max(0.0001, this.musicVolume * 0.28);
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxMuted ? 0.0001 : Math.max(0.0001, this.sfxVolume * 0.36);
      this.sfxGain.connect(this.master);

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
    const len = Math.floor(sr * 0.15);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let s = 2463534242;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const white = ((s & 0xffff) / 0x8000) - 1;
      prev = prev * 0.72 + white * 0.28; // warm pink-ish noise
      data[i] = prev;
    }
    return buf;
  }

  _syncGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime || 0;
    if (this.musicGain) {
      const target = this.musicMuted ? 0.0001 : Math.max(0.0001, this.musicVolume * 0.28);
      if (this.musicGain.gain.setTargetAtTime) {
        this.musicGain.gain.setTargetAtTime(target, now, 0.03);
      } else {
        this.musicGain.gain.value = target;
      }
    }
    if (this.sfxGain) {
      const target = this.sfxMuted ? 0.0001 : Math.max(0.0001, this.sfxVolume * 0.36);
      if (this.sfxGain.gain.setTargetAtTime) {
        this.sfxGain.gain.setTargetAtTime(target, now, 0.02);
      } else {
        this.sfxGain.gain.value = target;
      }
    }
  }

  configure(settings = {}) {
    if (typeof settings.musicMuted === 'boolean') this.musicMuted = settings.musicMuted;
    else if (typeof settings.muted === 'boolean') this.musicMuted = settings.muted;

    if (typeof settings.sfxMuted === 'boolean') this.sfxMuted = settings.sfxMuted;
    else if (typeof settings.muted === 'boolean') this.sfxMuted = settings.muted;

    if (typeof settings.musicVolume === 'number' && Number.isFinite(settings.musicVolume)) {
      this.musicVolume = Math.max(0, Math.min(1, settings.musicVolume));
    }
    if (typeof settings.sfxVolume === 'number' && Number.isFinite(settings.sfxVolume)) {
      this.sfxVolume = Math.max(0, Math.min(1, settings.sfxVolume));
    }
    this._syncGains();
    if (this.gestureUnlocked) {
      if (this.musicMuted || this.musicVolume <= 0) this.stopLoop();
      else this.startLoop();
    }
  }

  unlockGesture() {
    const wasUnlocked = this.gestureUnlocked;
    this.gestureUnlocked = true;
    if (!this.musicMuted && this.musicVolume > 0) {
      this.ensureContext();
      this.startLoop();
    } else if (!this.sfxMuted && this.sfxVolume > 0 && !wasUnlocked) {
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
    if (this.musicMuted || this.musicVolume <= 0) this.stopLoop();
    else if (this.gestureUnlocked) this.startLoop();
  }

  setSfxMuted(muted) {
    this.sfxMuted = !!muted;
    this._syncGains();
  }

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    this._syncGains();
    if (this.musicVolume <= 0 || this.musicMuted) this.stopLoop();
    else if (this.gestureUnlocked) this.startLoop();
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    this._syncGains();
  }

  setRoomMood(roomId, phase = this.phase) {
    this.roomId = roomId || this.roomId;
    this.phase = typeof phase === 'number' ? phase : this.phase;
    this.isNight = this.phase < 0.22 || this.phase > 0.78;
    const nextMood = moodForRoom(this.roomId, this.phase);
    const changed = nextMood !== this.mood;
    this.mood = nextMood;
    if (changed && this.timer) {
      this.stopLoop();
      this.startLoop();
    }
    return this.getMoodInfo();
  }

  getMoodInfo() {
    const profile = MOOD_PROFILES[this.mood] || MOOD_PROFILES.lobby;
    return {
      mood: this.mood,
      label: this.isNight && this.mood !== 'night' ? `${profile.label} (Night)` : profile.label,
      roomId: this.roomId,
      isNight: this.isNight,
      stepMs: profile.stepMs,
      cutoff: this.isNight ? Math.round(profile.cutoff * 0.82) : profile.cutoff,
    };
  }

  startLoop() {
    if (!this.gestureUnlocked || this.musicMuted || this.musicVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || this.timer) return;
    const profile = MOOD_PROFILES[this.mood] || MOOD_PROFILES.lobby;
    const stepTime = profile.stepMs;
    this.timer = setInterval(() => {
      if (this.musicMuted || this.musicVolume <= 0) return;
      this._tickMusicStep();
      this.step++;
    }, stepTime);
  }

  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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
    const profile = MOOD_PROFILES[this.mood] || MOOD_PROFILES.lobby;
    const subStep = this.step % 8;
    const barIdx = Math.floor(this.step / 8) % profile.chords.length;
    const stepSec = profile.stepMs / 1000;
    const cutoff = this.isNight ? profile.cutoff * 0.82 : profile.cutoff;

    // 1. Warm Rhodes / Lounge Chords on beat 0 and gentle re-voicing on beat 4
    if (subStep === 0 || subStep === 4) {
      const chord = profile.chords[barIdx];
      const dur = stepSec * (subStep === 0 ? 3.8 : 3.4);
      const vel = subStep === 0 ? 0.065 : 0.042;
      this._playWarmChord(chord, dur, cutoff, vel);
    }

    // 2. Warm Lofi Sub/Triangle Bassline
    const bassFreq = profile.bass[subStep % profile.bass.length];
    if (bassFreq > 0) {
      this._playWarmVoice(bassFreq, stepSec * 1.4, 'triangle', 260, 0.085, 0.025);
    }

    // 3. Gentle Bell / Rhodes Pluck Melody
    const bellFreq = profile.bells[subStep % profile.bells.length];
    if (bellFreq > 0 && ((this.step + barIdx) % 2 === 0)) {
      const freq = this.isNight ? bellFreq * 0.5 : bellFreq;
      this._playWarmVoice(freq, stepSec * 1.9, 'sine', cutoff * 1.2, 0.036, 0.03);
    }

    // 4. Soft Brushed Drums
    const drum = profile.drumPattern[subStep % profile.drumPattern.length];
    if (drum === 'k') this._playSoftKick();
    else if (drum === 's') this._playSoftBrush(0.065, 1600, 0.026);
    else if (drum === 'h') this._playSoftBrush(0.035, 3400, 0.015);
  }

  _playWarmChord(freqs, duration, cutoff, peakGain = 0.055) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const filter = this._createLowpass(cutoff, 0.6);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(peakGain, now + 0.065);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (filter) {
      bus.connect(filter);
      filter.connect(this.musicGain);
    } else {
      bus.connect(this.musicGain);
    }

    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freqs[i], now);
      if (osc.detune) osc.detune.value = (i - 1.5) * 4;
      osc.connect(bus);
      osc.start(now);
      osc.stop(now + duration + 0.04);
    }
  }

  _playWarmVoice(freq, duration, type = 'sine', cutoff = 900, peakGain = 0.06, attack = 0.02, dest = this.musicGain) {
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

    const filter = this._createLowpass(cutoff, 0.5);
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

  _playSoftKick() {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(108, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  _playSoftBrush(duration = 0.045, centerFreq = 2600, peakGain = 0.02, dest = this.musicGain) {
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
    this._playWarmVoice(freq, duration, 'triangle', 1100, 0.12, 0.015, this.sfxGain || this.master);
  }

  playSfx(kind = 'click') {
    if (!this.gestureUnlocked || this.sfxMuted || this.sfxVolume <= 0) return false;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return false;
    const now = ctx.currentTime;

    if (kind === 'footstep' || kind === 'step') {
      const ms = Date.now();
      if (ms - this.lastFootstepAt < 110) return false;
      this.lastFootstepAt = ms;
      this._sweepTone(155, 88, 0.042, 'triangle', 420, 0.055);
      return true;
    }
    if (kind === 'click') {
      this._sweepTone(520, 370, 0.048, 'sine', 1100, 0.09);
      return true;
    }
    if (kind === 'chat') {
      this._sweepTone(420, 560, 0.06, 'sine', 1200, 0.085);
      return true;
    }
    if (kind === 'place') {
      this._sweepTone(210, 315, 0.09, 'triangle', 760, 0.12);
      return true;
    }
    if (kind === 'coin') {
      this._scheduleTone(987.77, now, 0.09, 'sine', 2100, 0.11);
      this._scheduleTone(1318.51, now + 0.055, 0.16, 'triangle', 2200, 0.11);
      return true;
    }
    if (kind === 'elevator') {
      this._scheduleTone(783.99, now, 0.18, 'sine', 1500, 0.11);
      this._scheduleTone(659.25, now + 0.14, 0.28, 'triangle', 1350, 0.11);
      return true;
    }
    if (kind === 'quest') {
      const notes = [523.25, 659.25, 783.99, 987.77];
      notes.forEach((f, i) => {
        this._scheduleTone(f, now + i * 0.06, 0.24, i % 2 ? 'triangle' : 'sine', 1850, 0.1);
      });
      return true;
    }
    this._sweepTone(440, 392, 0.065, 'sine', 1000, 0.08);
    return true;
  }

  _sweepTone(f0, f1, dur, type, cutoff, peak) {
    if (!this.ctx || !this.sfxGain) return;
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
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  _scheduleTone(freq, startTime, dur, type, cutoff, peak) {
    if (!this.ctx || !this.sfxGain) return;
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
    gain.connect(this.sfxGain);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }
}

export const audio = new ChiptuneAudio();
