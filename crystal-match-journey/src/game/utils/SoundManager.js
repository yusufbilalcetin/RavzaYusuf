const SOUND_SETTINGS = {
  click: { frequency: 420, duration: 0.055, type: "sine", volume: 0.028 },
  pop: { frequency: 680, duration: 0.095, type: "triangle", volume: 0.038 },
  win: { frequency: 760, duration: 0.16, type: "triangle", volume: 0.04 },
  lose: { frequency: 180, duration: 0.18, type: "sawtooth", volume: 0.025 }
};

let audioContext = null;

export function playSound(name) {
  const settings = SOUND_SETTINGS[name];
  if (!settings) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audioContext ||= new AudioContextClass();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.frequency, now);
    if (name === "win") {
      oscillator.frequency.exponentialRampToValueAtTime(settings.frequency * 1.28, now + settings.duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(settings.volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + settings.duration + 0.02);
  } catch {
    // Sound is optional; gameplay should never fail because audio is blocked.
  }
}
