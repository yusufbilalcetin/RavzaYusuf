import { initAnaSayfaRastgeleGorsel } from "./ana-sayfa-rastgele-gorsel.js";

export function initAnaSayfa() {
  initAnaSayfaRastgeleGorsel();
  window.updateDashboardStats?.();
  window.renderExamPerformanceChart?.();
}
