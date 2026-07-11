// Doğrulama: hiçbir dosyayı değiştirmez. Sorun yoksa exit 0, varsa exit 1.
// Kullanım: node scripts/check-home-images.mjs
import { checkAll } from "./lib/home-hero-pipeline.mjs";

const { ok, problems, warnings } = await checkAll();

for (const w of warnings) console.warn(`[hero] uyarı: ${w}`);

if (ok) {
  console.log("[hero] Kontrol başarılı — manifest, dosyalar ve eşleşmeler tutarlı.");
  process.exit(0);
}

console.error(`[hero] ${problems.length} sorun bulundu:`);
for (const p of problems) console.error(`[hero]   ✗ ${p}`);
process.exit(1);
