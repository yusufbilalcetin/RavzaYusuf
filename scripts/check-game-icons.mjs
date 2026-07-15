import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { GAME_ICONS } from "../js/data/game-icons.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedIds = [
  "candy-crush",
  "meyve-eslestirme",
  "flappy-bird",
  "boyama",
  "renk-siralama",
  "sudoku",
  "sans-carki",
  "alan-bulmacasi",
  "ok-bulmacasi",
];

assert.deepEqual(Object.keys(GAME_ICONS), expectedIds, "GAME_ICONS sırası veya oyun kimlikleri hatalı");

for (const id of expectedIds) {
  const publicPath = GAME_ICONS[id];
  assert.equal(publicPath, `./assets/icons/games/${id}.png`, `${id}: ortak ikon yolu hatalı`);
  const filePath = path.join(projectRoot, publicPath.replace(/^\.\//, ""));
  await access(filePath);
  const metadata = await sharp(filePath).metadata();
  assert.equal(metadata.format, "png", `${id}: ikon PNG değil`);
  assert.equal(metadata.width, 1024, `${id}: ikon genişliği 1024 değil`);
  assert.equal(metadata.height, 1024, `${id}: ikon yüksekliği 1024 değil`);
}

const [gamePage, launcherData, boyamaPage] = await Promise.all([
  readFile(path.join(projectRoot, "partials/pages/oyun.html"), "utf8"),
  readFile(path.join(projectRoot, "js/data/launcher-navigation.js"), "utf8"),
  readFile(path.join(projectRoot, "js/pages/boyama-page.js"), "utf8"),
]);

for (const publicPath of Object.values(GAME_ICONS)) {
  assert.ok(gamePage.includes(publicPath), `Oyun Alanı ikon referansı eksik: ${publicPath}`);
}
assert.match(launcherData, /import \{ GAME_ICONS \}/, "Launcher ortak GAME_ICONS kaynağını kullanmıyor");
assert.ok(boyamaPage.includes(GAME_ICONS.boyama), "Boyama giriş ekranı ortak ikonu kullanmıyor");
assert.doesNotMatch(`${gamePage}\n${launcherData}\n${boyamaPage}`, /assets\/oyun-bolumu\/optimized\/ikon-/, "Eski oyun ikonu yolu hâlâ kullanılıyor");

console.log(`[game-icons] Kontrol başarılı — ${expectedIds.length} PNG, ortak yollar ve giriş ekranı referansları tutarlı.`);
