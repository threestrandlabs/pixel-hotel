// Tiny original procedural chiptune + SFX via WebAudio. No audio files.
// Off by default; main.js wires the mute toggle.

const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C major pentatonic-ish
const MELODY = [0, 2, 4, 2, 1, 3, 5, 3, 0, 4, 2, 5, 1, 3, 2, 0];

export class ChiptuneAudio {
  constructor() {
    this.ctx = null;
    this.muted = true;
    this.step = 0;
    this.timer = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.stopLoop();
    else this.startLoop();
  }

  startLoop() {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    if (this.timer) return;
    const stepTime = 220;
    this.timer = setInterval(() => {
      if (this.muted) return;
      this.playNote(SCALE[MELODY[this.step % MELODY.length]], stepTime / 1000);
      this.step++;
    }, stepTime);
  }

  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  playNote(freq, duration) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  playSfx(kind) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    const presets = {
      click: [660, 0.06],
      coin: [880, 0.08],
      place: [520, 0.1],
      quest: [784, 0.18],
      chat: [392, 0.05],
    };
    const [freq, dur] = presets[kind] || [440, 0.08];
    this.playNote(freq, dur);
  }
}

export const audio = new ChiptuneAudio();
