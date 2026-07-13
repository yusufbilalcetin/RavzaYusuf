import { TOTAL_LEVELS } from "./level-meta.js";

export const STORAGE_KEY = "ravza_ok_bulmacasi_v1";
const CURRENT_VERSION = 1;

function defaults() {
  return {
    version: CURRENT_VERSION,
    currentLevel: 1,
    lastUnlocked: 1,
    stars: {},
    soundEnabled: true,
    tutorialSeen: false
  };
}

function migrate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults();
  const base = defaults();
  const migrated = {
    ...base,
    ...value,
    version: CURRENT_VERSION,
    currentLevel: Number.isInteger(value.currentLevel) ? value.currentLevel : base.currentLevel,
    lastUnlocked: Number.isInteger(value.lastUnlocked) ? value.lastUnlocked : base.lastUnlocked,
    stars: value.stars && typeof value.stars === "object" ? value.stars : {},
    soundEnabled: value.soundEnabled !== false,
    tutorialSeen: value.tutorialSeen === true
  };
  migrated.currentLevel = Math.min(TOTAL_LEVELS, Math.max(1, migrated.currentLevel));
  migrated.lastUnlocked = Math.min(TOTAL_LEVELS, Math.max(1, migrated.lastUnlocked));
  return migrated;
}

export function loadGameStore() {
  try {
    return migrate(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return defaults();
  }
}

export function saveGameStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrate(store)));
    return true;
  } catch {
    return false;
  }
}
