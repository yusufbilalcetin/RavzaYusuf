import { loadLayoutPartials } from "./partial-loader.js";
import { initRouter, navigate } from "./router.js?v=pdf-themes-20260716-1";
import { installCompatibility } from "./compatibility.js?v=fit-visible-20260704";
import { installAppShellScrollBridge } from "./app-shell-scroll.js";
import { pbnLog } from "../utils/pbn-debug.js?v=alan-bulmacasi-20260710-1";
import { withTimeout } from "../utils/helpers.js";
import { initLauncher } from "./launcher.js?v=home-proportions-20260716-1";
import { initLiquidGlassSurfaceSystem } from "../services/liquid-glass-service.js?v=liquid-optics-20260715-1";
import { initSearchClearControls } from "../utils/search-clear.js";

// legacy-app.js normalde çok hızlı yüklenir (yerel/CDN'den tek modül); bu
// süre yalnızca "CDN tamamen tıkanırsa ana içerik sonsuza dek beklemesin"
// diye bir üst sınırdır — Firestore okumasının zaman aşımından ayrıdır.
const LEGACY_IMPORT_TIMEOUT_MS = 4000;

// Üretimde hassas veri yazmadan başlangıç aşamalarını izlemek için.
// ?debugStartup=1 ile konsola da yazılır.
const startupState = {
  startedAt: Date.now(),
  domReady: false,
  shellRendered: false,
  contentStarted: false,
  contentRendered: false,
  legacyReady: false,
  completed: false,
  errorCode: null
};
globalThis.__APP_STARTUP_STATE__ = startupState;
const debugStartup = new URLSearchParams(location.search).has("debugStartup");

let appInitialized = false;

// Reload/crash diagnostics only. These listeners must never route the user.
function installDiagnostics() {
  window.addEventListener("error", (event) => {
    pbnLog("window.error", event.message || "", event.filename || "", event.lineno || "");
  });
  window.addEventListener("unhandledrejection", (event) => {
    pbnLog("unhandledrejection", event.reason || "");
  });
  window.addEventListener("pageshow", (event) => {
    pbnLog("pageshow", { persisted: event.persisted });
    // bfcache'den dönüşte ana içerik bir şekilde boş kaldıysa güvenli rehydrate.
    if (event.persisted && document.getElementById("page-root")?.childElementCount === 0) {
      const page = new URLSearchParams(location.search).get("page") || "ana-sayfa";
      navigate(page);
    }
  });
}

// Tema, panel istatistikleri ve Firebase ilerleme verisi ana sayfayı
// zenginleştirir ama CDN/Firestore gecikmesi ana içeriğin görünmesini asla
// bloklamamalı; bu yüzden navigate()'ten bağımsız, arka planda çalışır.
// (Firestore okumasının kendi zaman aşımı legacy-app.js içindedir.)
// Tek bir boot Promise'i önbelleğe alınır: çağrı iki kez yapılsa da import ve
// window.__bootLegacyApp() yalnızca bir kez çalışır (duplicate boot yok).
let legacyBoot = null;
function bootLegacyAppInBackground() {
  if (legacyBoot) return legacyBoot;

  const importPromise = import("../legacy/legacy-app.js");
  const ready = importPromise
    .then(() => {
      installCompatibility();
      return window.__bootLegacyApp?.();
    })
    .catch((error) => {
      console.error("Legacy app baslatilamadi:", error);
      startupState.errorCode ||= "legacy-boot-failed";
    })
    .finally(() => {
      startupState.legacyReady = true;
      if (debugStartup) console.log("[startup] legacyReady", startupState);
    });

  legacyBoot = { importPromise, ready };
  return legacyBoot;
}

export async function initApp() {
  // Test/gözlemlenebilirlik amaçlı: modül URL'sinin (?v=...) sürüm sorgusunu
  // bilmeye gerek kalmadan initApp()'in idempotentliğini doğrulamak için.
  globalThis.__RAVZA_INIT_APP__ = initApp;

  if (appInitialized) return;
  appInitialized = true;

  try {
    installDiagnostics();
    startupState.domReady = true;
    pbnLog("boot", {
      hash: location.hash,
      nav: (performance.getEntriesByType?.("navigation")?.[0]?.type) || performance.navigation?.type,
      ts: Date.now()
    });

    await loadLayoutPartials();
    startupState.shellRendered = true;
    initSearchClearControls();
    initLiquidGlassSurfaceSystem();
    installAppShellScrollBridge();
    initLauncher();

    const legacy = bootLegacyAppInBackground();
    // Modül gerçekten yüklendiyse (window.toggleTheme vb. bağlansın diye)
    // kısa süre beklenir; CDN tıkanırsa bu bekleme sonsuza uzamaz, ana
    // içerik yine de render edilir (legacy fonksiyonlar geldiğinde bağlanır).
    await withTimeout(legacy.importPromise, LEGACY_IMPORT_TIMEOUT_MS).catch(() => {});

    initRouter();
    installCompatibility();

    // pbnActiveProjectId is save/snapshot context only. Opening a project is
    // intentionally user-initiated from the Boyama "Son Calismalar" list.
    const requestedPage = new URLSearchParams(location.search).get("page") || "ana-sayfa";
    pbnLog("boot.navigate", requestedPage);
    startupState.contentStarted = true;
    await navigate(requestedPage);
    startupState.contentRendered = true;
  } catch (error) {
    console.error(error);
    startupState.errorCode = error?.message || "unknown";
    const root = document.getElementById("page-root");
    if (root) {
      root.innerHTML = '<div class="empty-grid">Sayfa y&uuml;klenemedi. <button type="button" onclick="location.reload()">Tekrar dene</button></div>';
    }
  } finally {
    startupState.completed = true;
    if (debugStartup) console.log("[startup] completed", startupState);
  }
}
