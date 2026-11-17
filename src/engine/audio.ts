class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playTone(freq: number, duration = 0.09, type: OscillatorType = 'sine', gainVal = 0.06) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public playStationPlaced() {
    this.playTone(523.25, 0.08, 'triangle', 0.07);
    setTimeout(() => this.playTone(659.25, 0.11, 'triangle', 0.06), 45);
  }

  public playTrackConnected() {
    this.playTone(440, 0.07, 'sine', 0.06);
    setTimeout(() => this.playTone(587.33, 0.12, 'sine', 0.06), 55);
  }

  public playError() {
    this.playTone(190, 0.14, 'sawtooth', 0.04);
  }

  public playUiClick() {
    this.playTone(740, 0.035, 'sine', 0.025);
  }
}

export const soundEngine = new SoundEngine();
