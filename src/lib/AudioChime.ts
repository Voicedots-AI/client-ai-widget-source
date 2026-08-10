// Web Audio API Sound Synthesizer for VoiceDots UI Pop & Notification Chimes
// Zero external dependencies or MP3 asset files required!

export class AudioChime {
  private static audioCtx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (!AudioChime.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        AudioChime.audioCtx = new AudioContextClass();
      }
    }
    if (AudioChime.audioCtx && AudioChime.audioCtx.state === 'suspended') {
      AudioChime.audioCtx.resume();
    }
    return AudioChime.audioCtx;
  }

  /**
   * Plays a sweet, friendly 2-tone chime sound (C5 to G5 chord) for pop-ups and notifications
   */
  public static playPopSound(): void {
    try {
      const ctx = AudioChime.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Tone 1 (C5 - 523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Tone 2 (G5 - 783.99 Hz with slight delay for melodic chime effect)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.08);
      gain2.gain.setValueAtTime(0.15, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.5);
    } catch (e) {
      // Ignore audio policy errors safely
    }
  }

  /**
   * Plays a celebratory 3-note ascending chord (C5 - E5 - G5) when lead submitted or connected
   */
  public static playSuccessSound(): void {
    try {
      const ctx = AudioChime.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.14, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.4);
      });
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Plays a subtle click feedback sound for button interactions
   */
  public static playClickSound(): void {
    try {
      const ctx = AudioChime.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      // Ignore
    }
  }
}
