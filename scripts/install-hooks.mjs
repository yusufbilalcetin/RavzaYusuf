// Opt-in: git'i .githooks/ klasörünü kullanacak şekilde ayarlar.
// Kullanıcının git ayarını yalnızca bu komut açıkça çalıştırıldığında değiştirir.
// Kullanım: npm run hero:install-hooks veya npm run books:install-hooks
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
try {
  await run("git", ["config", "core.hooksPath", ".githooks"]);
  console.log("[hooks] Git hook'ları etkin: core.hooksPath = .githooks");
  console.log("[hooks] Her commit öncesi books:check; hero kaynakları varsa hero:check çalışır.");
  console.log("[hooks] Geri almak için: git config --unset core.hooksPath");
} catch (err) {
  console.error(`[hooks] Hook kurulumu başarısız: ${err.message}`);
  process.exit(1);
}
