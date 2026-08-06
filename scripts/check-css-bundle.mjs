/**
 * CSS paketi tazelik kontrolu.
 *
 * Paket repoya commit edilir (Vercel'de build adimi yok), bu yuzden bir CSS
 * dosyasi degistirilip paket yeniden uretilmezse site eski stille yayina cikar.
 *
 * Karsilastirma dosya tarihine degil ICERIGE bakar: taze bir `git clone`
 * butun dosyalara ayni anda dokunur, mtime siralamasi hicbir sey soylemez.
 * Yan fayda: paket bellekte yeniden uretildigi icin bozuk CSS sozdizimi de
 * burada yakalanir.
 */
import { readFile } from "node:fs/promises";
import { buildToMemory, CSS_BUNDLE, RELATIVE_BUNDLE } from "./build-css.mjs";

const [fresh, committed] = await Promise.all([
  buildToMemory().catch((error) => {
    console.error("[css] Paket uretilemedi — CSS sozdiziminde hata olabilir:");
    console.error(error.message);
    process.exit(1);
  }),
  readFile(CSS_BUNDLE, "utf8").catch(() => null)
]);

if (committed === null) {
  console.error(`[css] Paket bulunamadi: ${RELATIVE_BUNDLE}`);
  console.error("[css] Uretmek icin: npm run build:css");
  process.exit(1);
}

if (fresh !== committed) {
  console.error(`[css] Paket bayat — ${RELATIVE_BUNDLE} kaynaklarla ayni degil.`);
  console.error("[css] Duzeltmek icin: npm run build:css");
  process.exit(1);
}

console.log(`[css] Kontrol basarili — ${RELATIVE_BUNDLE} kaynaklarla guncel.`);
