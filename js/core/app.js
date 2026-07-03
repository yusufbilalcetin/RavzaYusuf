import { loadLayoutPartials } from "./partial-loader.js";
import { initRouter, navigate } from "./router.js";
import { installCompatibility } from "./compatibility.js";

export async function initApp() {
  try {
    await loadLayoutPartials();
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
