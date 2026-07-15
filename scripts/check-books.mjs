import { checkAll } from "./lib/ravza-books-pipeline.mjs";

const { ok, problems, warnings } = await checkAll();
for (const warning of warnings) console.warn(`[books] uyarı: ${warning}`);
if (ok) {
  console.log("[books] Kontrol başarılı — PDF'ler, sayfa sayıları, kapaklar ve manifest tutarlı.");
  process.exit(0);
}
console.error(`[books] ${problems.length} sorun bulundu:`);
for (const problem of problems) console.error(`[books]   ✗ ${problem}`);
process.exit(1);

