import { watch } from "node:fs";
import path from "node:path";
import { optimizeAll, paths } from "./lib/ravza-books-pipeline.mjs";

const DEBOUNCE_MS = 700;
let timer = null;
let running = false;
let rerun = false;

async function runOnce() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    const result = await optimizeAll();
    const changed = result.reports.filter(report => !report.skipped).map(report => report.id);
    console.log(changed.length
      ? `[books] güncellendi: ${changed.join(", ")} (${(result.ms / 1000).toFixed(1)} sn)`
      : "[books] değişiklik yok");
    for (const warning of result.warnings) console.warn(`[books] uyarı: ${warning}`);
    for (const error of result.errors) console.error(`[books]   ✗ ${error}`);
  } catch (error) {
    console.error(`[books] izleme işlemi hata verdi: ${error.message}`);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      schedule();
    }
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(runOnce, DEBOUNCE_MS);
}

console.log(`[books] PDF gelen kutusu izleniyor: ${paths.booksDir}`);
console.log(`[books] PDF kaynak klasörü izleniyor: ${paths.sourceDir}`);
console.log(`[books] Metadata izleniyor: ${paths.metadataPath}`);
console.log("[books] PDF ekleyin veya değiştirin; manifest ve kapaklar otomatik hazırlanır. Durdurmak için Ctrl+C.");

try {
  watch(paths.booksDir, (_event, fileName) => {
    if (String(fileName || "").toLowerCase().endsWith(".pdf")) schedule();
  });
  watch(paths.sourceDir, (_event, fileName) => {
    if (String(fileName || "").toLowerCase().endsWith(".pdf")) schedule();
  });
  watch(path.dirname(paths.metadataPath), (_event, fileName) => {
    if (String(fileName || "") === path.basename(paths.metadataPath)) schedule();
  });
} catch (error) {
  console.error(`[books] Klasör izlenemedi: ${error.message}`);
  process.exit(1);
}
schedule();
