import { TOTAL_LEVELS } from "./level-meta.js";

export const STORAGE_KEY = "ravza_ok_bulmacasi_v2";
const LEGACY_KEY = "ravza_ok_bulmacasi_v1";
export const SCHEMA_VERSION = 3;
export const CURRENT_LEVEL_DATA_VERSION = 2;

export function clampLevel(id) {
  return Math.min(TOTAL_LEVELS, Math.max(1, Number.isInteger(id) ? id : 1));
}

export function defaultProgress() {
  return {
    version: SCHEMA_VERSION,
    currentLevel: 1,
    lastUnlocked: TOTAL_LEVELS,
    completed: {},
    best: {},
    tutorialSeen: {},
    totalHints: 0,
    session: null,
    daily: {},
    stats: { plays: 0, correctMoves: 0, errors: 0, hints: 0, playTimeMs: 0 },
    settings: {
      sound: true,
      vibration: true,
      dark: false,
      thickLines: false,
      reducedMotion: false,
      zen: false
    }
  };
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalize(value) {
  const base = defaultProgress();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  // Tum bolumler serbest: eski kayitlar da yuklenirken otomatik olarak 150'ye acilir.
  const lastUnlocked = TOTAL_LEVELS;
  const settings = value.settings && typeof value.settings === "object" ? value.settings : {};
  return {
    ...base,
    currentLevel: Math.min(clampLevel(value.currentLevel), lastUnlocked),
    lastUnlocked,
    completed: value.completed && typeof value.completed === "object" && !Array.isArray(value.completed) ? value.completed : {},
    best: value.best && typeof value.best === "object" && !Array.isArray(value.best) ? value.best : {},
    tutorialSeen: value.tutorialSeen && typeof value.tutorialSeen === "object" ? value.tutorialSeen : {},
    totalHints: Number.isFinite(value.totalHints) ? Math.max(0, value.totalHints) : 0,
    session: value.session && typeof value.session === "object" && value.session.levelDataVersion === CURRENT_LEVEL_DATA_VERSION ? value.session : null,
    daily: value.daily && typeof value.daily === "object" && !Array.isArray(value.daily) ? value.daily : {},
    stats: {
      plays: Math.max(0, Number(value.stats?.plays) || 0),
      correctMoves: Math.max(0, Number(value.stats?.correctMoves) || 0),
      errors: Math.max(0, Number(value.stats?.errors) || 0),
      hints: Math.max(0, Number(value.stats?.hints) || 0),
      playTimeMs: Math.max(0, Number(value.stats?.playTimeMs) || 0)
    },
    settings: {
      sound: bool(settings.sound, base.settings.sound),
      vibration: bool(settings.vibration, base.settings.vibration),
      dark: bool(settings.dark, base.settings.dark),
      thickLines: bool(settings.thickLines, base.settings.thickLines),
      reducedMotion: bool(settings.reducedMotion, base.settings.reducedMotion),
      zen: bool(settings.zen, base.settings.zen)
    }
  };
}

export function loadProgress() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const legacy = current == null ? localStorage.getItem(LEGACY_KEY) : null;
    const progress = normalize(JSON.parse(current ?? legacy));
    if (current == null && legacy != null) saveProgress(progress);
    return progress;
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(progress)));
    return true;
  } catch {
    return false;
  }
}

export function updateProgress(mutate) {
  const progress = loadProgress();
  mutate(progress);
  saveProgress(progress);
  return loadProgress();
}

export function resetProgress() {
  const fresh = defaultProgress();
  saveProgress(fresh);
  return fresh;
}

export function isUnlocked(_progress, id) { return Number.isInteger(id) && id >= 1 && id <= TOTAL_LEVELS; }
export function isCompleted(progress, id) { return progress.completed[id] === true; }

export function recordResult(progress, levelId, stats) {
  const previous = progress.best[levelId] || {};
  progress.completed[levelId] = true;
  progress.best[levelId] = {
    lives: Math.max(previous.lives ?? 0, stats.lives),
    elapsedMs: Math.min(previous.elapsedMs ?? Infinity, stats.elapsedMs),
    errors: Math.min(previous.errors ?? Infinity, stats.errors),
    hints: Math.min(previous.hints ?? Infinity, stats.hints),
    perfect: Boolean(previous.perfect || stats.perfect),
    lastPlayedAt: new Date().toISOString()
  };
}

export function serializeSession(game) {
  if (!game || game.status !== "playing") return null;
  const remaining = new Set(game.pieces.map((piece) => piece.id));
  return {
    levelDataVersion: CURRENT_LEVEL_DATA_VERSION,
    levelId: game.levelId,
    removedIds: game.level.pieces.filter((piece) => !remaining.has(piece.id)).map((piece) => piece.id),
    lives: game.lives,
    errors: game.errors,
    hints: game.hints,
    history: [...game.history],
    elapsedMs: Math.max(0, Date.now() - game.startedAt),
    zen: game.zen,
    savedAt: new Date().toISOString()
  };
}
