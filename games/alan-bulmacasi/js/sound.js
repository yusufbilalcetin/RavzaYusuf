export class GameSound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  play(type = "select") {
    if (!this.enabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.context ||= new AudioContextClass();
      if (this.context.state === "suspended") this.context.resume();
      const now = this.context.currentTime;
      const notes = {
        select: [330, 0.035, 0.025],
        correct: [520, 0.08, 0.045],
        wrong: [150, 0.1, 0.04],
        complete: [660, 0.22, 0.05]
      };
      const [frequency, duration, volume] = notes[type] || notes.select;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type === "wrong" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      if (type === "complete") oscillator.frequency.exponentialRampToValueAtTime(990, now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // Ses desteği yoksa oyun sessiz biçimde devam eder.
    }
  }
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Titreşim desteği isteğe bağlıdır.
  }
}
