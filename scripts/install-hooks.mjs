// Opt-in: git'i .githooks/ klasörünü kullanacak şekilde ayarlar (pre-commit → hero:check).
// Kullanıcının git ayarını yalnızca bu komut açıkça çalıştırıldığında değiştirir.
// Kullanım: npm run hero:install-hooks
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
try {
  await run("git", ["config", "core.hooksPath", ".githooks"]);
  console.log("[hero] Git hook'ları etkin: core.hooksPath = .githooks");
  console.log("[hero] Artık her commit öncesi 'npm run hero:check' çalışır.");
  console.log("[hero] Geri almak için: git config --unset core.hooksPath");
} catch (err) {
  console.error(`[hero] Hook kurulumu başarısız: ${err.message}`);
  process.exit(1);
}
