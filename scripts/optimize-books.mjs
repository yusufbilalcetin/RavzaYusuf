import { optimizeAll } from "./lib/ravza-books-pipeline.mjs";

const result = await optimizeAll({ force: process.argv.includes("--force") });
for (const fileName of result.ingested || []) console.log(`[books] kökten original/ klasörüne taşındı: ${fileName}`);
for (const warning of result.warnings) console.warn(`[books] uyarı: ${warning}`);
for (const report of result.reports) {
  if (report.skipped) {
    console.log(`[books] ${report.id}: değişmedi, atlandı (${report.totalPages} sayfa)`);
    continue;
  }
  const sizes = report.covers.map(cover => `${cover.width}w ${(cover.bytes / 1024).toFixed(1)} KB`).join(" · ");
  console.log(`[books] ${report.title}: ${report.totalPages} sayfa · kapaklar ${sizes}`);
}
if (result.cleaned) console.log(`[books] Eski kapak dosyaları temizlendi: ${result.cleaned}`);
if (result.errors.length) {
  console.error(`[books] ${result.errors.length} hata:`);
  for (const error of result.errors) console.error(`[books]   ✗ ${error}`);
}
console.log(`[books] Manifest: data/ravza-books.generated.js (${result.entries.length} kitap)`);
console.log(`[books] Süre: ${(result.ms / 1000).toFixed(1)} saniye`);
process.exit(result.ok ? 0 : 1);
