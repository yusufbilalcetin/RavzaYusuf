const SOUND_SETTINGS = {
  click: { frequency: 420, duration: 0.055, type: "sine", volume: 0.028 },
  pop: { frequency: 680, duration: 0.095, type: "triangle", volume: 0.038 },
  combo: { frequency: 860, duration: 0.11, type: "triangle", volume: 0.042 },
  boost: { frequency: 540, duration: 0.13, type: "square", volume: 0.03 },
  win: { frequency: 760, duration: 0.16, type: "triangle", volume: 0.04 },
  lose: { frequency: 180, duration: 0.18, type: "sawtooth", volume: 0.025 }
};

const VIBRATE_PATTERNS = {
  click: 8,
  pop: 14,
  combo: [10, 30, 16],
  boost: 22,
  win: [24, 40, 24, 40, 40],
  lose: 60
};

const MUSIC_NOTES = [392, 440, 523.25, 659.25, 523.25, 440];
const MUSIC_STEP_MS = 520;

let audioContext = null;
let soundOn = true;
let musicOn = false;
let musicTimer = null;
let musicStep = 0;

function getContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ||= new AudioContextClass();
  return audioContext;
}

export function setAudioEnabled(sound, music) {
  soundOn = sound !== false;
  musicOn = Boolean(music);
  if (musicOn) startMusic();
  else stopMusic();
}

export function playSound(name) {
  if (!soundOn) return;
  const settings = SOUND_SETTINGS[name];
  if (!settings) return;

  try {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.frequency, now);
    if (name === "win" || name === "combo") {
      oscillator.frequency.exponentialRampToValueAtTime(settings.frequency * 1.28, now + settings.duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(settings.volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + settings.duration + 0.02);
  } catch {
    // Sound is optional; gameplay should never fail because audio is blocked.
  }
}

export function vibrate(name) {
  if (!soundOn) return;
  const pattern = VIBRATE_PATTERNS[name];
  if (!pattern || typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Vibration is optional and unsupported on many desktop browsers.
  }
}

function playMusicStep() {
  try {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const note = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.45);
  } catch {
    // Music is optional; never block gameplay on audio failures.
  }
  musicStep += 1;
}

export function startMusic() {
  if (musicTimer || !musicOn) return;
  playMusicStep();
  musicTimer = window.setInterval(playMusicStep, MUSIC_STEP_MS);
}

export function stopMusic() {
  if (musicTimer) window.clearInterval(musicTimer);
  musicTimer = null;
}
