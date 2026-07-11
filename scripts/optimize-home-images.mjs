// Tek seferlik: original/ klasörünü tarar, değişmiş/eksik temaları optimize eder,
// manifesti günceller ve eski hash'leri temizler. (Değişmemiş temalar cache ile atlanır.)
// Kullanım: node scripts/optimize-home-images.mjs [--force]
import { optimizeAll, paths } from "./lib/home-hero-pipeline.mjs";

const force = process.argv.includes("--force");
const result = await optimizeAll({ force });

for (const w of result.warnings) console.warn(`[hero] uyarı: ${w}`);

for (const r of result.reports) {
  if (r.skipped) {
    console.log(`[hero] ${r.id}: değişmedi, atlandı`);
    continue;
  }
  console.log(`\n[hero] Tema işlendi: ${r.id}`);
  console.log(`[hero]   Desktop: ${r.desktopFile}  |  Mobile: ${r.mobileFile}`);
  console.log(`[hero]   WebP çıktıları: ${r.webpCount}  |  AVIF çıktıları: ${r.avifCount}`);
  console.log(`[hero]   Placeholder: ${paths.kb(r.placeholderSize)}`);
}

if (result.cleaned) console.log(`\n[hero] Eski hash dosyaları temizlendi: ${result.cleaned}`);

if (result.errors.length) {
  console.error(`\n[hero] ${result.errors.length} hata:`);
  for (const e of result.errors) console.error(`[hero]   ✗ ${e}`);
}

console.log(`\n[hero] Manifest: data/ana-sayfa-gorselleri.generated.js (${result.entries.length} tema)`);
console.log(`[hero] Süre: ${(result.ms / 1000).toFixed(1)} saniye`);

// Eşi eksik / geçersiz tema varsa uyar ama başarısız olma (diğer temalar üretildi).
process.exit(result.entries.length ? 0 : 1);
