import { initAnaSayfaRastgeleGorsel } from "./ana-sayfa-rastgele-gorsel.js";
import { renderLauncherHome } from "../core/launcher.js?v=topbar-redesign-20260714-2";

export function initAnaSayfa() {
  initAnaSayfaRastgeleGorsel();
  renderLauncherHome();
  window.updateDashboardStats?.();
  window.renderExamPerformanceChart?.();
}
