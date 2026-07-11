// İzleme modu: original/ klasörünü izler, değişiklikte optimizeAll() çağırır.
// Yerleşik fs.watch (bağımlılık yok) + debounce + kilit (burst'leri birleştirir, tek işlem).
// Kullanım: node scripts/watch-home-images.mjs
import { watch } from "node:fs";
import { optimizeAll, paths } from "./lib/home-hero-pipeline.mjs";

const DEBOUNCE_MS = 700;
let timer = null;
let running = false;
let rerun = false;

async function runOnce() {
  if (running) { rerun = true; return; }
  running = true;
  try {
    const result = await optimizeAll({});
    const changed = result.reports.filter((r) => !r.skipped).map((r) => r.id);
    if (changed.length) console.log(`[hero] güncellendi: ${changed.join(", ")} (${(result.ms / 1000).toFixed(1)} sn, ${result.cleaned} eski dosya temizlendi)`);
    else console.log("[hero] değişiklik yok");
    for (const w of result.warnings) console.warn(`[hero] uyarı: ${w}`);
    for (const e of result.errors) console.error(`[hero]   ✗ ${e}`);
  } catch (err) {
    console.error(`[hero] izleme işlemi hata verdi: ${err.message}`);
  } finally {
    running = false;
    if (rerun) { rerun = false; schedule(); }
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(runOnce, DEBOUNCE_MS);
}

console.log(`[hero] İzleniyor: ${paths.sourceDir}`);
console.log("[hero] Yeni desktop+mobile çifti ekleyin; çıktılar otomatik üretilir. Durdurmak için Ctrl+C.");

try {
  watch(paths.sourceDir, () => schedule());
} catch (err) {
  console.error(`[hero] Klasör izlenemedi (${paths.sourceDir}): ${err.message}`);
  process.exit(1);
}

// başlangıçta bir kez tara (eksik/değişmiş temaları yakala)
schedule();
