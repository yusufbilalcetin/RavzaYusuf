// Statik bölüm görselleri: assets/<bölüm>/**/original/ → kardeş optimized/ klasörüne WebP.
// Ana sayfa hero'su hariç (onun kendi pipeline'ı var: npm run hero:optimize).
// Kullanım: node scripts/optimize-assets.mjs
import { readdir, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(projectRoot, "assets");
const SKIP = new Set(["ana-sayfa"]); // kendi pipeline'ı var
const SUPPORTED = /\.(png|jpe?g|webp)$/i;

// ponytail: yalnızca WebP. AVIF + CSS image-set() ancak ölçülebilir bir kazanç
// gerekirse eklenir; şu an WebP ~%97 tarayıcıda çalışıyor ve tek URL yetiyor.
const WEBP = { quality: 82, effort: 6, smartSubsample: true };

// Kutucukta ~150px gösterilen "ikon-*" görselleri için üst sınır; arka planlar kendi boyutunda kalır.
const maxWidthFor = (file) => (file.startsWith("ikon-") ? 512 : null);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

// assets altındaki tüm original/ klasörlerini bul (ana-sayfa hariç)
async function findOriginalDirs(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.name === "original") out.push(full);
    else out.push(...(await findOriginalDirs(full)));
  }
  return out;
}

const originalDirs = await findOriginalDirs(assetsDir);
let inBytes = 0;
let outBytes = 0;
let count = 0;

for (const srcDir of originalDirs) {
  const outDir = path.join(path.dirname(srcDir), "optimized");
  await rm(outDir, { recursive: true, force: true }); // bayat çıktı kalmasın
  await mkdir(outDir, { recursive: true });

  for (const file of (await readdir(srcDir)).sort()) {
    if (!SUPPORTED.test(file)) continue;
    const srcPath = path.join(srcDir, file);
    const maxWidth = maxWidthFor(file);
    const pipeline = sharp(srcPath).rotate();
    if (maxWidth) pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    let buf = await pipeline.webp(WEBP).toBuffer();

    // Kaynak zaten WebP ve yeniden kodlama büyütüyorsa orijinali aynen kullan.
    const srcSize = (await stat(srcPath)).size;
    if (/\.webp$/i.test(file) && srcSize <= buf.length) buf = await readFile(srcPath);

    const name = `${path.basename(file, path.extname(file))}.webp`;
    await writeFile(path.join(outDir, name), buf);

    inBytes += srcSize;
    outBytes += buf.length;
    count++;
    const rel = path.relative(projectRoot, path.join(outDir, name)).replace(/\\/g, "/");
    console.log(`[assets] ${rel.padEnd(52)} ${kb(srcSize).padStart(9)} → ${kb(buf.length).padStart(9)}`);
  }
}

console.log(`\n[assets] ${count} görsel, ${originalDirs.length} klasör`);
console.log(`[assets] Toplam: ${kb(inBytes)} → ${kb(outBytes)} (%${(100 - (outBytes / inBytes) * 100).toFixed(1)} küçülme)`);
