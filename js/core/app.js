import { loadLayoutPartials } from "./partial-loader.js";
import { initRouter, navigate } from "./router.js?v=alan-bulmacasi-20260710-1";
import { installCompatibility } from "./compatibility.js?v=fit-visible-20260704";
import { installAppShellScrollBridge } from "./app-shell-scroll.js";
import { pbnLog } from "../utils/pbn-debug.js?v=alan-bulmacasi-20260710-1";

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
  });
}

export async function initApp() {
  try {
    installDiagnostics();
    pbnLog("boot", {
      hash: location.hash,
      nav: (performance.getEntriesByType?.("navigation")?.[0]?.type) || performance.navigation?.type,
      ts: Date.now()
    });
    await loadLayoutPartials();
    installAppShellScrollBridge();
    await import("../legacy/legacy-app.js");
    initRouter();
    installCompatibility();
    await window.__bootLegacyApp?.();

    // pbnActiveProjectId is save/snapshot context only. Opening a project is
    // intentionally user-initiated from the Boyama "Son Calismalar" list.
    const requestedPage = new URLSearchParams(location.search).get("page") || "ana-sayfa";
    pbnLog("boot.navigate", requestedPage);
    await navigate(requestedPage);
  } catch (error) {
    console.error(error);
    const root = document.getElementById("page-root");
    if (root) root.innerHTML = '<div class="empty-grid">Sayfa y&uuml;klenemedi. L&uuml;tfen tekrar deneyin.</div>';
  }
}
