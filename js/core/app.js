import { loadLayoutPartials } from "./partial-loader.js";
import { initRouter, navigate } from "./router.js?v=boyama-gallery-dl-20260705";
import { installCompatibility } from "./compatibility.js?v=fit-visible-20260704";
import { installAppShellScrollBridge } from "./app-shell-scroll.js";

export async function initApp() {
  try {
    await loadLayoutPartials();
    installAppShellScrollBridge();
    await import("../legacy/legacy-app.js");
    initRouter();
    installCompatibility();
    await window.__bootLegacyApp?.();
    await navigate("ana-sayfa");
  } catch (error) {
    console.error(error);
    const root = document.getElementById("page-root");
    if (root) root.innerHTML = '<div class="empty-grid">Sayfa yüklenemedi. Lütfen tekrar deneyin.</div>';
  }
}
