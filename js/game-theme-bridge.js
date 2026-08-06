(function installRavzaGameThemeBridge() {
  "use strict";

  const MODES = Object.freeze(["light", "dark", "system"]);
  const RESOLVED_MODES = Object.freeze(["light", "dark"]);
  const STYLES = Object.freeze([
    "noel-ask",
    "gece-mavisi",
    "orman-yesili",
    "mor-isik",
    "klasik-koyu",
    "pembe-tema",
  ]);
  const STORAGE_KEYS = Object.freeze({ mode: "eul_theme", style: "eul_theme_style" });
  const MESSAGE_TYPE = "RAVZAYUSUF_THEME";
  const CHANGE_EVENT = "app:theme-change";
  const script = document.currentScript;
  const root = document.documentElement;
  const systemThemeMedia = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
  const isEmbedded = window.parent !== window;

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Tema, storage kapalı olduğunda da geçerli belge için uygulanır.
    }
  }

  function normalizeMode(value) {
    return MODES.includes(value) ? value : "system";
  }

  function normalizeStyle(value) {
    if (value === "gun-isigi") return "pembe-tema";
    return STYLES.includes(value) ? value : "noel-ask";
  }

  function resolveMode(mode) {
    return mode === "system" ? (systemThemeMedia?.matches ? "dark" : "light") : mode;
  }

  function valueAtPath(value, path) {
    return String(path || "")
      .split(".")
      .filter(Boolean)
      .reduce((current, key) => current?.[key], value);
  }

  function migrateLegacyMode() {
    if (safeStorageGet(STORAGE_KEYS.mode) !== null || !script) return null;

    const legacyModeKey = script.dataset.legacyModeKey;
    const legacyMode = legacyModeKey ? safeStorageGet(legacyModeKey) : null;
    if (RESOLVED_MODES.includes(legacyMode)) {
      safeStorageSet(STORAGE_KEYS.mode, legacyMode);
      return legacyMode;
    }

    const legacyJsonKey = script.dataset.legacyJsonKey;
    const legacyJson = legacyJsonKey ? safeStorageGet(legacyJsonKey) : null;
    if (!legacyJson) return null;

    try {
      const legacyValue = valueAtPath(JSON.parse(legacyJson), script.dataset.legacyJsonPath);
      if (typeof legacyValue !== "boolean") return null;
      const migratedMode = legacyValue ? "dark" : "light";
      safeStorageSet(STORAGE_KEYS.mode, migratedMode);
      return migratedMode;
    } catch {
      return null;
    }
  }

  function readCanonicalState() {
    const storedMode = safeStorageGet(STORAGE_KEYS.mode);
    const mode = normalizeMode(storedMode === null ? migrateLegacyMode() : storedMode);
    const style = normalizeStyle(safeStorageGet(STORAGE_KEYS.style));
    return { mode, resolvedMode: resolveMode(mode), style };
  }

  function themeColorFor(resolvedMode) {
    if (resolvedMode === "dark") return script?.dataset.themeColorDark || "#0f1117";
    return script?.dataset.themeColorLight || "#f5f4fb";
  }

  function setElementTheme(element, nextState) {
    if (!element) return;
    element.dataset.themeMode = nextState.mode;
    element.dataset.resolvedTheme = nextState.resolvedMode;
    element.dataset.themeStyle = nextState.style;
    // data-theme, Şans Çarkı'nın mevcut CSS sözleşmesi için tek yönlü uyumluluk aynasıdır.
    element.dataset.theme = nextState.resolvedMode;
    element.classList.toggle("dark", nextState.resolvedMode === "dark");
    element.classList.toggle("theme-dark", nextState.resolvedMode === "dark");
    element.classList.toggle("theme-light", nextState.resolvedMode === "light");
    element.style.colorScheme = nextState.resolvedMode;
  }

  function applyDocumentTheme(nextState) {
    setElementTheme(root, nextState);
    root.style.backgroundColor = themeColorFor(nextState.resolvedMode);
    setElementTheme(document.body, nextState);

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", themeColorFor(nextState.resolvedMode));
    const colorScheme = document.querySelector('meta[name="color-scheme"]');
    colorScheme?.setAttribute("content", nextState.resolvedMode);
  }

  function emitThemeChange(reason) {
    const detail = Object.freeze({ ...state, reason });
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }));
  }

  let state = readCanonicalState();

  function applyState(nextState, options = {}) {
    const mode = normalizeMode(nextState?.mode ?? state.mode);
    const style = normalizeStyle(nextState?.style ?? state.style);
    const requestedResolvedMode = nextState?.resolvedMode;
    const resolvedMode = options.trustResolved && RESOLVED_MODES.includes(requestedResolvedMode)
      ? requestedResolvedMode
      : resolveMode(mode);
    const changed = mode !== state.mode || resolvedMode !== state.resolvedMode || style !== state.style;

    state = { mode, resolvedMode, style };
    if (options.persist) {
      safeStorageSet(STORAGE_KEYS.mode, mode);
      safeStorageSet(STORAGE_KEYS.style, style);
    }
    applyDocumentTheme(state);
    if (changed || options.force) emitThemeChange(options.reason || "apply");
    return { ...state };
  }

  function validMessageState(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    return MODES.includes(payload.mode)
      && RESOLVED_MODES.includes(payload.resolvedMode)
      && STYLES.includes(payload.style);
  }

  const api = Object.freeze({
    getState: () => ({ ...state }),
    setMode(mode) {
      if (isEmbedded || !MODES.includes(mode)) return { ...state };
      return applyState({ ...state, mode }, { persist: true, reason: "mode" });
    },
    setStyle(style) {
      if (isEmbedded || !STYLES.includes(style)) return { ...state };
      return applyState({ ...state, style }, { persist: true, reason: "style" });
    },
    applyState(nextState) {
      if (isEmbedded || !validMessageState(nextState)) return { ...state };
      return applyState(nextState, { persist: true, reason: "api" });
    },
    refresh() {
      if (isEmbedded) return { ...state };
      return applyState(readCanonicalState(), { force: true, reason: "refresh" });
    },
    isEmbedded,
  });

  window.RavzaGameTheme = api;
  window.__RAVZA_GAME_THEME__ = api;
  applyDocumentTheme(state);
  root.dataset.ravzaThemeReady = "true";

  if (!document.body) {
    const bodyObserver = new MutationObserver(() => {
      if (!document.body) return;
      bodyObserver.disconnect();
      applyDocumentTheme(state);
    });
    bodyObserver.observe(root, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => {
      bodyObserver.disconnect();
      applyDocumentTheme(state);
    }, { once: true });
  }

  if (isEmbedded) {
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type !== MESSAGE_TYPE || !validMessageState(event.data.payload)) return;
      applyState(event.data.payload, {
        trustResolved: true,
        force: true,
        reason: typeof event.data.payload.reason === "string" ? event.data.payload.reason : "parent",
      });
    });
  } else {
    systemThemeMedia?.addEventListener?.("change", () => {
      if (state.mode === "system") applyState(state, { force: true, reason: "system-change" });
    });
    window.addEventListener("storage", (event) => {
      if (![STORAGE_KEYS.mode, STORAGE_KEYS.style].includes(event.key)) return;
      applyState(readCanonicalState(), { force: true, reason: "storage" });
    });
    window.addEventListener("pageshow", () => {
      applyState(readCanonicalState(), { force: true, reason: "pageshow" });
    });
  }
})();
