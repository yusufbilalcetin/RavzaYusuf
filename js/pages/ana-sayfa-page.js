import { initAnaSayfaRastgeleGorsel } from "./ana-sayfa-rastgele-gorsel.js";
import { renderLauncherHome } from "../core/launcher.js";

export function initAnaSayfa() {
  initAnaSayfaRastgeleGorsel();
  renderLauncherHome();
  window.updateDashboardStats?.();
  window.renderExamPerformanceChart?.();
}
