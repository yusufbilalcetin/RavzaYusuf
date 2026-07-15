import { initAnaSayfaRastgeleGorsel } from "./ana-sayfa-rastgele-gorsel.js";
import { renderLauncherHome } from "../core/launcher.js?v=home-proportions-20260716-1";

export function initAnaSayfa() {
  initAnaSayfaRastgeleGorsel();
  renderLauncherHome();
  window.updateDashboardStats?.();
  window.renderExamPerformanceChart?.();
}
