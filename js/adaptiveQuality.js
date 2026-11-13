// Adaptive Quality & Background Detail Manager for Pixel Hotel.
// Monitors rolling frame rate and resolves background detail mode (auto/high/low).

export class FpsMonitor {
  constructor(windowMs = 2000, thresholdFps = 45) {
    this.windowMs = windowMs;
    this.thresholdFps = thresholdFps;
    this.samples = [];
    this.lowQualityTriggered = false;
  }

  recordFrame(timestamp) {
    this.samples.push(timestamp);
    const cutoff = timestamp - this.windowMs;
    while (this.samples.length > 0 && this.samples[0] < cutoff) {
      this.samples.shift();
    }
    if (this.samples.length >= 5) {
      const span = this.samples[this.samples.length - 1] - this.samples[0];
      if (span >= this.windowMs * 0.9) {
        const fps = (this.samples.length - 1) / (span / 1000);
        if (fps < this.thresholdFps) {
          this.lowQualityTriggered = true;
        }
      }
    }
    return this.lowQualityTriggered;
  }

  isTriggered() {
    return this.lowQualityTriggered;
  }

  getAverageFps() {
    if (this.samples.length < 2) return 60;
    const span = this.samples[this.samples.length - 1] - this.samples[0];
    if (span <= 0) return 60;
    return (this.samples.length - 1) / (span / 1000);
  }

  reset() {
    this.samples.length = 0;
    this.lowQualityTriggered = false;
  }
}

export function resolveBackgroundDetail(setting = 'auto', isLowQualityTriggered = false, isMobile = false) {
  const norm = String(setting || 'auto').toLowerCase();
  if (norm === 'high') return 'high';
  if (norm === 'low') return 'low';
  // auto mode
  if (isMobile || isLowQualityTriggered) return 'low';
  return 'high';
}
