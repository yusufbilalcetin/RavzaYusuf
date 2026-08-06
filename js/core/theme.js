const THEME_MODES = Object.freeze(["light", "dark", "system"]);
const THEME_STYLES = Object.freeze([
  "noel-ask",
  "gece-mavisi",
  "orman-yesili",
  "mor-isik",
  "klasik-koyu",
  "pembe-tema",
]);

export const THEME_CHANGE_EVENT = "app:theme-change";
export const THEME_STORAGE_KEYS = Object.freeze({
  mode: "eul_theme",
  style: "eul_theme_style",
});

const systemThemeMedia = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
const boundThemeToggles = new WeakSet();
const toggleGestures = new WeakMap();
let initialized = false;
let panelReturnFocus = null;

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
    // Gizli mod veya kapalı storage tema kullanımını engellememeli.
  }
}

export function normalizeThemeMode(value) {
  return THEME_MODES.includes(value) ? value : "system";
}

export function normalizeThemeStyle(value) {
  if (value === "gun-isigi") return "pembe-tema";
  return THEME_STYLES.includes(value) ? value : "noel-ask";
}

function resolveThemeMode(mode) {
  return mode === "system"
    ? (systemThemeMedia?.matches ? "dark" : "light")
    : mode;
}

function readStoredThemeState(options = {}) {
  const boot = options.preferBoot ? globalThis.__RAVZA_THEME_BOOT__ : null;
  const mode = normalizeThemeMode(boot?.mode || safeStorageGet(THEME_STORAGE_KEYS.mode));
  const style = normalizeThemeStyle(boot?.style || safeStorageGet(THEME_STORAGE_KEYS.style));
  return { mode, resolvedMode: resolveThemeMode(mode), style };
}

// Head bootstrap yalnız ilk modül kurulumu için kullanılır. Sonraki storage ve
// pageshow senkronları canonical localStorage değerini okumalıdır.
let themeState = readStoredThemeState({ preferBoot: true });

function setElementTheme(element, state) {
  if (!element) return;
  element.dataset.themeMode = state.mode;
  element.dataset.resolvedTheme = state.resolvedMode;
  element.dataset.themeStyle = state.style;
  element.classList.toggle("dark", state.resolvedMode === "dark");
  element.classList.toggle("theme-dark", state.resolvedMode === "dark");
  element.classList.toggle("theme-light", state.resolvedMode === "light");
}

function updateThemeColor(state) {
  const meta = document.getElementById("app-theme-color");
  if (!meta) return;
  const fallback = state.resolvedMode === "dark" ? "#0f1117" : "#f5f4fb";
  const computed = document.body
    ? getComputedStyle(document.body).getPropertyValue("--bg-base").trim()
    : "";
  meta.setAttribute("content", computed || fallback);
}

function updateToggleUi(state) {
  const isDark = state.resolvedMode === "dark";
  document.querySelectorAll("[data-theme-toggle], #theme-switch, #topbar-theme-btn").forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    button.dataset.themeCurrentMode = state.mode;
    button.dataset.resolvedTheme = state.resolvedMode;
    button.classList.toggle("is-dark", isDark);
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-expanded", String(isThemeSheetOpen()));
    const modeLabel = state.mode === "system" ? "Sistem" : state.mode === "dark" ? "Koyu" : "Açık";
    button.setAttribute(
      "aria-label",
      `${modeLabel} tema, ${isDark ? "koyu" : "açık"} görünüm. Değiştirmek için basın; tema seçenekleri için uzun basın.`,
    );
    button.setAttribute("aria-keyshortcuts", "Shift+Enter ArrowDown");
    const icon = button.querySelector(".mode-toggle-icon");
    if (icon) {
      icon.innerHTML = isDark
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="currentColor" stroke="none"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    }
  });
}

function updatePanelUi(state) {
  document.querySelectorAll(".theme-mode-control [data-theme-mode]").forEach((button) => {
    const active = button.dataset.themeMode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll(".theme-choice-card[data-theme-id]").forEach((card) => {
    const active = card.dataset.themeId === state.style;
    card.classList.toggle("active", active);
    card.setAttribute("aria-selected", String(active));
    card.setAttribute("aria-pressed", String(active));
  });
}

export function syncThemeControls() {
  updateToggleUi(themeState);
  updatePanelUi(themeState);
}

function emitThemeChange(reason) {
  const detail = Object.freeze({ ...themeState, reason });
  globalThis.__RAVZA_THEME_STATE__ = detail;
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail }));
}

function applyThemeState(nextState, options = {}) {
  const mode = normalizeThemeMode(nextState?.mode ?? themeState.mode);
  const style = normalizeThemeStyle(nextState?.style ?? themeState.style);
  const resolvedMode = resolveThemeMode(mode);
  const changed = mode !== themeState.mode
    || style !== themeState.style
    || resolvedMode !== themeState.resolvedMode;

  themeState = { mode, resolvedMode, style };
  if (options.persist) {
    if (safeStorageGet(THEME_STORAGE_KEYS.mode) !== mode) safeStorageSet(THEME_STORAGE_KEYS.mode, mode);
    if (safeStorageGet(THEME_STORAGE_KEYS.style) !== style) safeStorageSet(THEME_STORAGE_KEYS.style, style);
  }

  setElementTheme(document.documentElement, themeState);
  setElementTheme(document.body, themeState);
  document.documentElement.style.colorScheme = resolvedMode;
  if (document.body) document.body.style.colorScheme = resolvedMode;
  const fallbackBackground = resolvedMode === "dark" ? "#0f1117" : "#f5f4fb";
  const baseBackground = document.body
    ? getComputedStyle(document.body).getPropertyValue("--bg-base").trim()
    : "";
  document.documentElement.style.backgroundColor = baseBackground || fallbackBackground;
  // Launcher alanı yalnız geriye uyumlu tek yönlü bir aynadır; canonical state
  // eul_theme/eul_theme_style olmaya devam eder.
  window.setLauncherThemePreference?.(mode);
  syncThemeControls();
  updateThemeColor(themeState);

  if (changed || options.force) emitThemeChange(options.reason || "apply");
  return getThemeState();
}

export function getThemeState() {
  return { ...themeState };
}

export function setThemeMode(mode, options = {}) {
  return applyThemeState(
    { ...themeState, mode: normalizeThemeMode(mode) },
    { persist: options.persist !== false, reason: options.reason || "mode" },
  );
}

export function setThemeStyle(style, options = {}) {
  return applyThemeState(
    { ...themeState, style: normalizeThemeStyle(style) },
    { persist: options.persist !== false, reason: options.reason || "style" },
  );
}

export function toggleThemeMode() {
  return setThemeMode(themeState.resolvedMode === "dark" ? "light" : "dark", { reason: "toggle" });
}

export function getThemeColor(token, fallback = "") {
  const name = String(token || "").startsWith("--") ? String(token) : `--${token}`;
  const value = document.body ? getComputedStyle(document.body).getPropertyValue(name).trim() : "";
  return value || fallback;
}

export function onThemeChange(callback, options = {}) {
  if (typeof callback !== "function") return () => {};
  const handler = (event) => callback(event.detail, event);
  window.addEventListener(THEME_CHANGE_EVENT, handler, { signal: options.signal });
  if (options.immediate !== false) callback(getThemeState(), null);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}

function focusableElements(container) {
  return [...container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && !element.closest("[hidden]");
  });
}

export function isThemeSheetOpen() {
  return document.getElementById("theme-sheet")?.classList.contains("open") === true;
}

function focusThemeSheetSelection() {
  const sheet = document.getElementById("theme-sheet");
  if (!sheet || !isThemeSheetOpen()) return;
  const target = sheet.querySelector('[data-theme-mode].active')
    || sheet.querySelector("button:not([disabled])")
    || sheet;
  target.focus({ preventScroll: true });
}

export function openThemeSheet(trigger = document.activeElement) {
  const sheet = document.getElementById("theme-sheet");
  const backdrop = document.getElementById("theme-sheet-backdrop");
  if (!sheet || !backdrop) return false;
  if (!isThemeSheetOpen()) {
    panelReturnFocus = trigger instanceof HTMLElement ? trigger : null;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    backdrop.classList.add("open");
    document.body.classList.add("theme-sheet-open");
    syncThemeControls();
    // Pointer/dblclick varsayılan focus işlemi event handler'dan sonra toggle'a
    // dönebildiği için bir sonraki task ve paint'te dialog seçimini odakla.
    window.setTimeout(() => requestAnimationFrame(focusThemeSheetSelection), 0);
    // Hızlı Escape→yeniden açma sırasında visibility geçişi kesilirse ilk focus
    // denemesi gizli anda kalabilir; geçiş sonu güvenli bir ikinci denemedir.
    window.setTimeout(focusThemeSheetSelection, 260);
  }
  updateToggleUi(themeState);
  return true;
}

export function closeThemeSheet(options = {}) {
  const sheet = document.getElementById("theme-sheet");
  const backdrop = document.getElementById("theme-sheet-backdrop");
  const wasOpen = isThemeSheetOpen();
  sheet?.classList.remove("open");
  sheet?.setAttribute("aria-hidden", "true");
  backdrop?.classList.remove("open");
  document.body?.classList.remove("theme-sheet-open");
  document.querySelectorAll("[data-theme-toggle], #theme-switch, #topbar-theme-btn").forEach((button) => {
    const gesture = toggleGestures.get(button);
    if (gesture) {
      gesture.longPressed = false;
      gesture.suppressClick = false;
    }
  });
  updateToggleUi(themeState);
  if (wasOpen && options.restoreFocus !== false && panelReturnFocus?.isConnected) {
    panelReturnFocus.focus({ preventScroll: true });
  }
  panelReturnFocus = null;
  return wasOpen;
}

function cancelLongPress(button) {
  const gesture = toggleGestures.get(button);
  if (!gesture) return;
  clearTimeout(gesture.timer);
  gesture.timer = 0;
}

function bindThemeToggle(button) {
  if (!(button instanceof HTMLElement) || boundThemeToggles.has(button)) return;
  boundThemeToggles.add(button);
  button.dataset.themeToggle = "true";
  button.setAttribute("aria-controls", "theme-sheet");
  const gesture = {
    timer: 0,
    clickTimer: 0,
    pointerId: null,
    startX: 0,
    startY: 0,
    longPressed: false,
    suppressClick: false,
  };
  toggleGestures.set(button, gesture);

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    cancelLongPress(button);
    gesture.pointerId = event.pointerId;
    gesture.startX = event.clientX;
    gesture.startY = event.clientY;
    gesture.longPressed = false;
    gesture.timer = window.setTimeout(() => {
      gesture.timer = 0;
      gesture.longPressed = true;
      gesture.suppressClick = true;
      clearTimeout(gesture.clickTimer);
      gesture.clickTimer = 0;
      openThemeSheet(button);
    }, 575);
  });

  button.addEventListener("pointermove", (event) => {
    if (gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 10) cancelLongPress(button);
  });
  button.addEventListener("pointerup", (event) => {
    if (gesture.pointerId === event.pointerId) cancelLongPress(button);
    gesture.pointerId = null;
  });
  button.addEventListener("pointercancel", () => {
    cancelLongPress(button);
    gesture.pointerId = null;
  });
  button.addEventListener("lostpointercapture", () => cancelLongPress(button));

  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (gesture.longPressed || gesture.suppressClick) {
      gesture.longPressed = false;
      window.setTimeout(() => { gesture.suppressClick = false; }, 0);
      window.setTimeout(focusThemeSheetSelection, 0);
      return;
    }
    if (event.detail === 0) {
      toggleThemeMode();
      return;
    }
    clearTimeout(gesture.clickTimer);
    if (event.detail > 1) return;
    gesture.clickTimer = window.setTimeout(() => {
      gesture.clickTimer = 0;
      toggleThemeMode();
    }, 360);
  });

  button.addEventListener("dblclick", (event) => {
    event.preventDefault();
    clearTimeout(gesture.clickTimer);
    gesture.clickTimer = 0;
    gesture.suppressClick = true;
    openThemeSheet(button);
    window.setTimeout(focusThemeSheetSelection, 0);
    window.setTimeout(() => { gesture.suppressClick = false; }, 0);
  });

  button.addEventListener("keydown", (event) => {
    const activationKey = event.key === "Enter" || event.key === " ";
    const panelShortcut = event.key === "ArrowDown" || (activationKey && event.shiftKey);
    if (!panelShortcut && !activationKey) return;
    event.preventDefault();
    if (event.repeat) return;
    // Native button aktivasyonu tarayıcı/otomasyon katmanına göre keydown veya
    // keyup'ta click üretebilir. Davranışı burada kesinleştirip olası sentetik
    // click'i tek sefer bastırarak çift toggle yarışını önleriz.
    gesture.suppressClick = true;
    window.setTimeout(() => { gesture.suppressClick = false; }, 300);
    if (!panelShortcut) {
      toggleThemeMode();
      return;
    }
    openThemeSheet(button);
  });
}

export function bindThemeControls(root = document) {
  root.querySelectorAll?.("[data-theme-toggle], #theme-switch, #topbar-theme-btn").forEach(bindThemeToggle);
  syncThemeControls();
}

function installDocumentInteractions() {
  document.addEventListener("click", (event) => {
    const modeButton = event.target.closest?.(".theme-mode-control [data-theme-mode]");
    if (modeButton) {
      setThemeMode(modeButton.dataset.themeMode, { reason: "panel-mode" });
      return;
    }
    const styleButton = event.target.closest?.(".theme-choice-card[data-theme-id]");
    if (styleButton) {
      setThemeStyle(styleButton.dataset.themeId, { reason: "panel-style" });
      closeThemeSheet();
      return;
    }
    if (event.target.closest?.("[data-theme-sheet-close], #theme-sheet-backdrop")) {
      closeThemeSheet();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isThemeSheetOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeThemeSheet();
      return;
    }
    if (event.key !== "Tab" || !isThemeSheetOpen()) return;
    const sheet = document.getElementById("theme-sheet");
    if (!sheet) return;
    const focusable = focusableElements(sheet);
    if (!focusable.length) {
      event.preventDefault();
      sheet.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!sheet.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, true);
}

function installSystemAndStorageSync() {
  systemThemeMedia?.addEventListener?.("change", () => {
    if (themeState.mode === "system") {
      applyThemeState(themeState, { force: true, reason: "system-change" });
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== null && ![THEME_STORAGE_KEYS.mode, THEME_STORAGE_KEYS.style].includes(event.key)) return;
    applyThemeState(readStoredThemeState(), { reason: "storage" });
  });
  window.addEventListener("pageshow", (event) => {
    applyThemeState(readStoredThemeState(), { force: event.persisted === true, reason: "pageshow" });
  });
}

function installCompatibilityGlobals() {
  const api = Object.freeze({
    getState: getThemeState,
    setMode: setThemeMode,
    setStyle: setThemeStyle,
    toggle: toggleThemeMode,
    syncDom: () => applyThemeState(themeState, { reason: "sync" }),
    syncControls: syncThemeControls,
    bindControls: bindThemeControls,
    openPanel: openThemeSheet,
    closePanel: closeThemeSheet,
    getColor: getThemeColor,
    onChange: onThemeChange,
  });
  window.__RAVZA_THEME__ = api;
  window.toggleTheme = toggleThemeMode;
  window.setThemePreference = setThemeMode;
  window.selectTheme = (style) => {
    setThemeStyle(style, { reason: "legacy-style" });
    closeThemeSheet();
  };
  window.openThemeSheet = openThemeSheet;
  window.closeThemeSheet = closeThemeSheet;
  window.getThemeColor = getThemeColor;
}

export function initThemeSystem() {
  if (initialized) {
    applyThemeState(themeState, { force: true, reason: "reinit" });
    bindThemeControls();
    return getThemeState();
  }
  initialized = true;
  if (safeStorageGet(THEME_STORAGE_KEYS.style) === "gun-isigi") {
    safeStorageSet(THEME_STORAGE_KEYS.style, "pembe-tema");
  }
  installCompatibilityGlobals();
  installDocumentInteractions();
  installSystemAndStorageSync();
  applyThemeState(readStoredThemeState(), { force: true, reason: "init" });
  bindThemeControls();
  return getThemeState();
}
