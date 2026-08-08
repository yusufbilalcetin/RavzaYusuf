#!/usr/bin/env node
/**
 * Gorsel QA araci: rota x tema x viewport kombinasyonlarinin ekran goruntusunu alir.
 *
 * Neden var: CSS okuyarak "sayfa iyi gorunuyor" denemez. Bu proje sayfa
 * girisinde fadeUp animasyonu kullaniyor; animasyon bitmeden alinan bir kare
 * her seyi yari saydam gosterip yanlis teshise goturuyor (bir kez oldu).
 * Bu yuzden varsayilan bekleme animasyon oturana kadar uzun tutuldu.
 *
 * Kullanim:
 *   node scripts/screenshot.mjs --routes=ana-sayfa,quiz-merkezi --modes=dark,light --w=390 --h=844
 *   node scripts/screenshot.mjs --preset=phone        # tum ana rotalar, telefon
 *   node scripts/screenshot.mjs --overlay=theme-panel # tema panelini acar
 *   node scripts/screenshot.mjs --out=before          # alt klasor adi
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, ensureTestServer, delay } from "./lib/theme-test-runtime.mjs";

const ALL_ROUTES = [
  "ana-sayfa", "ravza-books", "calisma-merkezi", "quiz-merkezi", "sinav-merkezi",
  "ezber-merkezi", "bosluk-doldurma", "hizli-tekrar", "kahoot", "ravzalingo",
  "oyun", "birinci-sinif", "ikinci-sinif",
];

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=") || "true"]; }),
);

const routes = args.routes ? args.routes.split(",") : ALL_ROUTES;
const modes = (args.modes || "dark,light").split(",");
const width = Number(args.w || 390);
const height = Number(args.h || 844);
const outDir = join(ROOT, "test-artifacts", "screens", args.out || "current");
// Animasyon oturmasi icin. fadeUp 280ms + reveal kademesi + gorsel yuklemesi.
const settle = Number(args.settle || 2600);

/** Rotaya ozel "hazir" kosulu; yoksa aktif sayfanin varligi yeterli. */
const READY = {
  "ana-sayfa": "!!document.querySelector('#launcherGrid .launcher-app')",
  oyun: "!!document.querySelector('.game-tile')",
};

await mkdir(outDir, { recursive: true });
await ensureTestServer();
const browser = await ThemeTestBrowser.launch("screenshot");
const saved = [];

try {
  for (const mode of modes) {
    await browser.seedTheme(mode, args.style || "noel-ask");
    await browser.setViewport({ width, height });

    for (const route of routes) {
      const url = route === "ana-sayfa" ? "/" : `/?page=${route}`;
      await browser.navigate(url);
      await browser
        .waitFor(READY[route] || "!!document.querySelector('#page-root .page.active')", `${route} hazir`)
        .catch(() => { /* sayfa acilmadiysa yine de kareyi al, teshis icin degerli */ });
      await delay(settle);

      if (args.overlay === "theme-panel") {
        await browser.evaluate("window.openThemeSheet && window.openThemeSheet()", { awaitPromise: false });
        await delay(700);
      }

      const name = `${route}-${width}-${mode}.png`;
      const { data } = await browser.command("Page.captureScreenshot", { format: "png" });
      await writeFile(join(outDir, name), Buffer.from(data, "base64"));
      saved.push(name);
      process.stdout.write(`  ${name}\n`);
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${saved.length} kare -> ${outDir}`);
