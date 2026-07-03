const PREFIX = "oyunKuresi:";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* localStorage kapali olabilir */
  }
}

export const DEFAULT_SETTINGS = {
  theme: "dark",
  sfx: true,
  music: true,
  sfxVol: 0.8,
  musicVol: 0.45,
  autoCheck: true,
  sudokuTheme: "klasik",
  flappySkin: "turkuaz",
  playerName: "Oyuncu"
};

export const DEFAULT_STATS = {
  sudoku: {
    bests: { kolay: null, orta: null, zor: null, uzman: null },
    wins: 0,
    games: 0,
    totalMistakes: 0
  },
  flappy: {
    best: 0,
    games: 0,
    obstacles: 0
  }
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read("settings", {}) };
}

export function saveSettings(settings) {
  write("settings", settings);
}

export function loadStats() {
  const stored = read("stats", {});
  return {
    sudoku: { ...DEFAULT_STATS.sudoku, ...(stored.sudoku || {}), bests: { ...DEFAULT_STATS.sudoku.bests, ...((stored.sudoku || {}).bests || {}) } },
    flappy: { ...DEFAULT_STATS.flappy, ...(stored.flappy || {}) }
  };
}

export function saveStats(stats) {
  write("stats", stats);
}
