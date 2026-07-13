export class GameSound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  play(type = "move") {
    if (!this.enabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.context ||= new AudioContextClass();
      if (this.context.state === "suspended") this.context.resume();
      const now = this.context.currentTime;
      const notes = {
        move: [420, 0.09, 0.05],
        blocked: [140, 0.14, 0.05],
        hint: [560, 0.07, 0.035],
        win: [660, 0.32, 0.05],
        fail: [180, 0.3, 0.045]
      };
      const [frequency, duration, volume] = notes[type] || notes.move;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type === "blocked" || type === "fail" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      if (type === "win") oscillator.frequency.exponentialRampToValueAtTime(990, now + duration);
      if (type === "move") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.6, now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // Ses destegi yoksa oyun sessiz bicimde devam eder.
    }
  }
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Titresim destegi istege baglidir.
  }
}
