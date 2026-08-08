/**
 * GORUNUM TERCIHLERI - TEK KANONIK KAYNAK.
 *
 * Tema (acik/koyu/sistem + renk stili) zaten theme.js'in tekelinde ve oraya
 * DOKUNULMAZ. Bu modul yalnizca theme.js'te karsiligi olmayan iki tercihi
 * yonetir:
 *
 *   1. Liquid Glass yogunlugu  (clear / balanced / tinted)
 *   2. Hareket azaltma          (system / reduced / full)
 *
 * Her ikisi de TEK anahtarda saklanir ve TEK olay yayar; Kontrol Merkezi ile
 * Ayarlar ayni durumu okur. Yuzeye ozel ikinci bir anahtar (ornegin
 * "controlCenterGlass") ACILMAZ - iki yuzeyin ayrisma sebebi budur.
 *
 * Kullaniciya ham CSS gosterilmez: secenekler semantik seviyedir, karsiliklari
 * css/themes/liquid-glass.css icindeki tokenlara baglanir.
 */

export const GLASS_LEVELS = Object.freeze(["clear", "balanced", "tinted"]);
export const MOTION_MODES = Object.freeze(["system", "reduced", "full"]);

export const APPEARANCE_STORAGE_KEYS = Object.freeze({
  glass: "eul_glass_level",
  motion: "eul_motion",
});

export const APPEARANCE_CHANGE_EVENT = "app:appearance-change";

const reducedMotionMedia = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") || null;

const state = {
  glass: "balanced",
  motion: "system",
};

let initialized = false;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kota dolu / depolama kapali: tercih oturumluk kalir, uygulama calisir.
  }
}

export function normalizeGlassLevel(value) {
  return GLASS_LEVELS.includes(value) ? value : "balanced";
}

export function normalizeMotionMode(value) {
  return MOTION_MODES.includes(value) ? value : "system";
}

/** Hareket azaltma SONUCU: kullanici override etmediyse sistem tercihi gecerli. */
export function prefersReducedMotionResolved(motion = state.motion) {
  if (motion === "reduced") return true;
  if (motion === "full") return false;
  return reducedMotionMedia?.matches === true;
}

function applyToDocument() {
  const root = document.documentElement;
  if (!root) return;
  root.dataset.glassLevel = state.glass;
  root.dataset.motion = state.motion;
  // Cozulmus deger ayri bir oznitelik: CSS "sistem koyu mu" hesabi yapmasin.
  root.dataset.reducedMotion = prefersReducedMotionResolved() ? "true" : "false";
}

function emitChange(reason) {
  applyToDocument();
  window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, {
    detail: { ...getAppearanceState(), reason },
  }));
}

export function getAppearanceState() {
  return {
    glass: state.glass,
    motion: state.motion,
    reducedMotion: prefersReducedMotionResolved(),
  };
}

export function setGlassLevel(level, options = {}) {
  const next = normalizeGlassLevel(level);
  if (next === state.glass && !options.force) return getAppearanceState();
  state.glass = next;
  if (options.persist !== false) safeSet(APPEARANCE_STORAGE_KEYS.glass, next);
  emitChange(options.reason || "glass");
  return getAppearanceState();
}

export function setMotionPreference(mode, options = {}) {
  const next = normalizeMotionMode(mode);
  if (next === state.motion && !options.force) return getAppearanceState();
  state.motion = next;
  if (options.persist !== false) safeSet(APPEARANCE_STORAGE_KEYS.motion, next);
  emitChange(options.reason || "motion");
  return getAppearanceState();
}

/** Kontrol Merkezi'ndeki anahtar icin: acik = hareket azalt. */
export function setReducedMotionEnabled(enabled, options = {}) {
  return setMotionPreference(enabled ? "reduced" : "full", options);
}

export function onAppearanceChange(callback, options = {}) {
  if (typeof callback !== "function") return () => {};
  const handler = (event) => callback(event.detail, event);
  window.addEventListener(APPEARANCE_CHANGE_EVENT, handler, { signal: options.signal });
  if (options.immediate !== false) callback(getAppearanceState(), null);
  return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, handler);
}

export function initAppearance() {
  if (initialized) return getAppearanceState();
  initialized = true;
  state.glass = normalizeGlassLevel(safeGet(APPEARANCE_STORAGE_KEYS.glass));
  state.motion = normalizeMotionMode(safeGet(APPEARANCE_STORAGE_KEYS.motion));
  applyToDocument();
  // Sistem tercihi degisirse "system" modunda cozulmus deger de degismeli.
  reducedMotionMedia?.addEventListener?.("change", () => {
    if (state.motion === "system") emitChange("system-motion");
  });
  return getAppearanceState();
}
