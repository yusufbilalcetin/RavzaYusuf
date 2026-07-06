import { loadLayoutPartials } from "./partial-loader.js";
import { initRouter, navigate } from "./router.js?v=boyama-safari-autosave-20260706-4";
import { installCompatibility } from "./compatibility.js?v=fit-visible-20260704";
import { installAppShellScrollBridge } from "./app-shell-scroll.js";
import { pbnLog } from "../utils/pbn-debug.js?v=boyama-safari-autosave-20260706-4";

// Reload/çökme teşhisi: bu dinleyiciler YALNIZ loglar — hiçbir yönlendirme yapmaz.
function installDiagnostics() {
  window.addEventListener("error", (e) => {
    pbnLog("window.error", e.message || "", e.filename || "", e.lineno || "");
  });
  window.addEventListener("unhandledrejection", (e) => {
    pbnLog("unhandledrejection", e.reason || "");
  });
  window.addEventListener("pageshow", (e) => {
    pbnLog("pageshow", { persisted: e.persisted });
  });
}

// Boot'ta yarım boyama işini otomatik geri aç: reload/çökme sonrası kullanıcı
// dashboard'da uyanmasın, kaldığı yerden devam etsin (istek #5, #6).
async function tryResumeBoyama() {
  let projectId = null;
  let route = null;
  try {
    projectId = localStorage.getItem("pbnActiveProjectId");
    route = localStorage.getItem("pbnActiveRoute");
  } catch { /* private mode */ }
  if (!projectId || route !== "oyun:boyama") return false;

  try {
    const { loadProject } = await import("../utils/pbn-store.js?v=boyama-safari-autosave-20260706-4");
    const record = await loadProject(projectId);
    if (!record) return false;
    pbnLog("boot.autoResume", { projectId });
    await navigate("oyun");
    // initOyun (navigate ile çalıştı) bu global'i tanımlar; boyama'yı açıp resume eder.
    const ok = await window.__pbnOpenBoyamaResume?.(projectId);
    return Boolean(ok);
  } catch (error) {
    pbnLog("boot.autoResume.error", error);
    return false;
  }
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
    const resumed = await tryResumeBoyama();
    if (!resumed) {
      pbnLog("boot.navigate", "ana-sayfa");
      await navigate("ana-sayfa");
    }
  } catch (error) {
    console.error(error);
    const root = document.getElementById("page-root");
    if (root) root.innerHTML = '<div class="empty-grid">Sayfa yüklenemedi. Lütfen tekrar deneyin.</div>';
  }
}
