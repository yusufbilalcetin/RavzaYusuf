/**
 * CSS paketleyici.
 *
 * Kaynak dogrulugu css/style.css'te kalir: gelistirme yine 50 ayri dosyada
 * yapilir, bu script yalnizca servis edilen ciktiyi uretir.
 *
 * Asset yollari kaynak dosyalarda koke-mutlaktir (url("/assets/...")). Boylece
 * bir kural hangi dosyada yazilirsa yazilsin, ayri servis edilirken de tek
 * pakete inlenirken de ayni dosyayi gosterir - klasor derinligi hic devreye
 * girmez. Bu yuzden asset'ler pakete dahil edilmez, disarida birakilir.
 */
import { build, context } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const CSS_ENTRY = join(ROOT, "css", "style.css");
export const CSS_BUNDLE = join(ROOT, "css", "style.min.css");
export const RELATIVE_BUNDLE = "css/style.min.css";

const buildOptions = {
  entryPoints: [CSS_ENTRY],
  outfile: CSS_BUNDLE,
  bundle: true,
  minify: true,
  // Gorseller ve fontlar pakete girmez; url() referanslari oldugu gibi kalir.
  // Kaynaklardaki yollar koke-mutlak oldugu icin bu dogru davranis.
  external: ["/assets/*", "https://*", "data:*"],
  // Tarayici hedefi: color-mix, :has, backdrop-filter ve dvh birimleri
  // oldugu gibi korunmali - kod zaten bunlara guveniyor.
  target: ["chrome111", "edge111", "firefox113", "safari16.4"],
  legalComments: "none",
  logLevel: "warning"
};

/** Paketi diske yazmadan uretir; tazelik kontrolu bunu kullanir. */
export async function buildToMemory() {
  const result = await build({ ...buildOptions, write: false, logLevel: "silent" });
  return result.outputFiles[0].text;
}

async function reportSize() {
  const bundle = await stat(CSS_BUNDLE);
  console.log(`[css] ${RELATIVE_BUNDLE} yazildi — ${Math.round(bundle.size / 1024)} KB`);
}

// Dosya dogrudan calistirildiysa paketi uret; import edildiyse (check script'i)
// yalnizca yardimcilari disa ac.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--watch")) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("[css] izleniyor — css/ altindaki her degisiklikte paket yeniden uretilir.");
  } else {
    await build(buildOptions);
    await reportSize();
  }
}
