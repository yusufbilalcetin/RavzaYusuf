// Ana sayfa hero görsel pipeline'ı — paylaşılan çekirdek.
// Tara → eşle → (kaynak-hash cache) → Sharp ile üret → içerik-hash'li isim →
// metadata ile manifest kur → atomik yaz → eski hash'leri güvenle temizle.
// Sharp yalnızca devDependency; bu modül yalnızca build/watch/check sırasında Node'da çalışır.
import { readdir, mkdir, rm, stat, readFile, writeFile, rename, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourceDir = path.join(projectRoot, "assets", "ana-sayfa", "original");
const outputDir = path.join(projectRoot, "assets", "ana-sayfa", "optimized");
const manifestPath = path.join(projectRoot, "data", "ana-sayfa-gorselleri.generated.js");
const metadataPath = path.join(projectRoot, "data", "ana-sayfa-tema-ayarlari.json");
const cachePath = path.join(projectRoot, ".cache", "home-hero-images.json");

// Manifest içindeki yollar sayfaya göreli çözülür (document.baseURI) — "./" önekini koru.
const ASSET_ROOT = "./assets/ana-sayfa/optimized";

const widthsByVariant = { desktop: [960, 1280, 1600, 1920], mobile: [360, 480, 720, 1080] };
const fallbackTarget = { desktop: 1280, mobile: 480 };
const SUPPORTED = /^(.+)-(desktop|mobile)\.(png|jpe?g|webp|avif)$/i;
const WEBP_OPTS = { quality: 80, effort: 6, smartSubsample: true };
const AVIF_OPTS = { quality: 60, effort: 6, chromaSubsampling: "4:4:4" };
const HASH_RE = "[0-9a-f]{8}";

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// ---- yardımcılar ----------------------------------------------------------

const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u" };

export function slugify(input) {
  return String(input)
    .replace(/[çğıöşüâîûÇĞİIÖŞÜ]/g, (c) => TR_MAP[c] || c)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function humanize(id) {
  return id.split("-").filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase("tr") + w.slice(1))
    .join(" ");
}

const shortHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);

async function fileHash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// ---- tarama + eşleştirme --------------------------------------------------

// original/ klasörünü tara → { themes: Map(id -> {desktop, mobile}), errors, warnings }
export async function scanSources() {
  const errors = [];
  const warnings = [];
  const themes = new Map();

  let files;
  try {
    files = (await readdir(sourceDir)).sort();
  } catch {
    errors.push(`Kaynak klasör bulunamadı: ${path.relative(projectRoot, sourceDir)}`);
    return { themes, errors, warnings };
  }

  const seen = new Map(); // `${id}:${variant}` -> fileName (aynı varyant iki kez mi?)
  for (const fileName of files) {
    const match = fileName.match(SUPPORTED);
    if (!match) {
      if (!fileName.startsWith(".")) warnings.push(`Ad kuralına uymuyor, atlandı: ${fileName}`);
      continue;
    }
    const [, rawTheme, variantRaw, ext] = match;
    const id = slugify(rawTheme);
    const variant = variantRaw.toLowerCase();
    if (!id) { errors.push(`Geçersiz tema adı: ${fileName}`); continue; }

    const key = `${id}:${variant}`;
    if (seen.has(key)) {
      errors.push(`"${id}" için birden fazla ${variant} dosyası: ${seen.get(key)} ve ${fileName}`);
      continue;
    }
    seen.set(key, fileName);

    if (!themes.has(id)) themes.set(id, { id });
    themes.get(id)[variant] = { fileName, ext: ext.toLowerCase(), path: path.join(sourceDir, fileName) };
  }

  // eşi eksik olanları geçersiz say (ama diğerlerini işlemeye devam et)
  for (const [id, pair] of themes) {
    if (!pair.desktop || !pair.mobile) {
      const missing = !pair.desktop ? "desktop" : "mobile";
      errors.push(`"${id}" teması eksik: ${missing} dosyası yok — bu tema atlandı.`);
      pair.invalid = true;
    }
  }

  return { themes, errors, warnings };
}

// ---- üretim ---------------------------------------------------------------

async function ensureDirs() {
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.dirname(cachePath), { recursive: true });
}

// Tek varyantın (desktop|mobile) tüm boyutlarını üretir, içerik-hash'li yazar.
async function buildVariant(id, variant, srcPath) {
  const meta = await sharp(srcPath).metadata();
  const srcWidth = meta.width || 0;
  const webp = [];
  const avif = [];

  for (const width of widthsByVariant[variant]) {
    if (srcWidth && width > srcWidth) continue;

    const webpBuf = await sharp(srcPath).rotate().resize({ width, withoutEnlargement: true }).webp(WEBP_OPTS).toBuffer();
    const webpName = `${id}-${variant}-${width}-${shortHash(webpBuf)}.webp`;
    await writeFile(path.join(outputDir, webpName), webpBuf);
    webp.push([webpName, width, webpBuf.length]);

    const avifBuf = await sharp(srcPath).rotate().resize({ width, withoutEnlargement: true }).avif(AVIF_OPTS).toBuffer();
    if (avifBuf.length < webpBuf.length) {
      const avifName = `${id}-${variant}-${width}-${shortHash(avifBuf)}.avif`;
      await writeFile(path.join(outputDir, avifName), avifBuf);
      avif.push([avifName, width, avifBuf.length]);
    }
  }

  if (!webp.length) throw new Error(`"${id}" ${variant}: hiç varyant üretilemedi (kaynak çok küçük olabilir).`);
  return { webp, avif, srcWidth };
}

async function buildPlaceholder(id, desktopSrcPath) {
  const buf = await sharp(desktopSrcPath).rotate().resize({ width: 60, withoutEnlargement: true })
    .blur(1.2).webp({ lossless: true, effort: 6 }).toBuffer();
  const name = `${id}-placeholder-${shortHash(buf)}.webp`;
  await writeFile(path.join(outputDir, name), buf);
  return { name, size: buf.length };
}

const pickFallback = (list, variant) => {
  const target = fallbackTarget[variant];
  const exact = list.find(([, w]) => w === target);
  if (exact) return exact[0];
  const below = list.filter(([, w]) => w <= target).sort((a, b) => b[1] - a[1]);
  return (below[0] || list[list.length - 1])[0];
};

const srcSet = (list) => list.map(([file, width]) => `${ASSET_ROOT}/${file} ${width}w`).join(", ");
const root = (file) => `${ASSET_ROOT}/${file}`;

// files (basename tabanlı) + metadata → çözülmüş manifest tema nesnesi
function buildEntry(id, files, meta) {
  const m = meta[id] || {};
  const name = m.name || humanize(id);
  return {
    id,
    name,
    alt: typeof m.alt === "string" ? m.alt : `Yusuf ve Ravza ${name} manzarasında`,
    desktop: {
      fallback: root(pickFallback(files.desktop.webp, "desktop")),
      webpSrcSet: srcSet(files.desktop.webp),
      avifSrcSet: srcSet(files.desktop.avif)
    },
    mobile: {
      fallback: root(pickFallback(files.mobile.webp, "mobile")),
      webpSrcSet: srcSet(files.mobile.webp),
      avifSrcSet: srcSet(files.mobile.avif)
    },
    placeholder: root(files.placeholder),
    desktopPosition: m.desktopPosition || "center center",
    mobilePosition: m.mobilePosition || "center center"
  };
}

// bir temanın files nesnesindeki tüm basename'ler
function entryBasenames(files) {
  const out = [files.placeholder];
  for (const v of ["desktop", "mobile"]) {
    for (const [f] of files[v].webp) out.push(f);
    for (const [f] of files[v].avif) out.push(f);
  }
  return out;
}

async function allExist(files) {
  for (const f of entryBasenames(files)) {
    if (!existsSync(path.join(outputDir, f))) return false;
  }
  return true;
}

// ---- manifest atomik yazma ------------------------------------------------

async function writeManifestAtomic(entries) {
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));

  // referans verilen tüm dosyalar diskte açılabiliyor mu? (manifest yazmadan önce doğrula)
  for (const e of sorted) {
    for (const rel of [e.desktop.fallback, e.mobile.fallback, e.placeholder]) {
      await access(path.join(projectRoot, rel.replace("./", "")));
    }
  }

  const body = JSON.stringify(sorted, null, 2);
  const content =
    "// OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: assets/ana-sayfa/original/ + data/ana-sayfa-tema-ayarlari.json\n" +
    "// Yeniden üretmek için: npm run hero:optimize\n" +
    `export const ANA_SAYFA_GORSELLERI = Object.freeze(${body});\n`;

  const tmp = `${manifestPath}.tmp-${process.pid}`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, manifestPath);
}

// ---- temizlik (yalnızca geçerli temaların eski hash'leri) -----------------

// bir optimize dosyasının ait olduğu tema id'sini adından güvenle çıkar (id tire içerebilir)
export function themeIdFromOutput(fileName) {
  const m = fileName.match(new RegExp(`^(.+)-(?:desktop|mobile)-\\d+-${HASH_RE}\\.(?:webp|avif)$`)) ||
            fileName.match(new RegExp(`^(.+)-placeholder-${HASH_RE}\\.webp$`));
  return m ? m[1] : null;
}

// çözülmüş manifest entry'sindeki tüm optimize dosya basename'leri
function referencedBasenames(entry) {
  const fromSet = (s) => String(s || "").split(", ").filter(Boolean).map((x) => x.split("/").pop().split(" ")[0]);
  return [
    entry.placeholder.split("/").pop(),
    ...fromSet(entry.desktop.webpSrcSet), ...fromSet(entry.desktop.avifSrcSet),
    ...fromSet(entry.mobile.webpSrcSet), ...fromSet(entry.mobile.avifSrcSet)
  ];
}

async function cleanupOldHashes(entries) {
  const byTheme = new Map(entries.map((e) => [e.id, new Set(referencedBasenames(e))]));

  let removed = 0;
  const files = await readdir(outputDir);
  for (const f of files) {
    const id = themeIdFromOutput(f);
    if (!id || !byTheme.has(id)) continue; // bilinmeyen/tanınmayan → dokunma (check raporlar)
    if (!byTheme.get(id).has(f)) {
      await rm(path.join(outputDir, f), { force: true });
      removed++;
    }
  }
  return removed;
}

// ---- ana giriş: optimizeAll ----------------------------------------------

export async function optimizeAll({ force = false } = {}) {
  const started = Date.now();
  await ensureDirs();

  const [{ themes, errors, warnings }, meta, cache] = await Promise.all([
    scanSources(),
    loadJson(metadataPath, {}),
    loadJson(cachePath, {})
  ]);

  const valid = [...themes.values()].filter((t) => !t.invalid);
  const entries = [];
  const reports = [];
  const nextCache = { ...cache };

  for (const theme of valid) {
    const id = theme.id;
    try {
      const dHash = await fileHash(theme.desktop.path);
      const mHash = await fileHash(theme.mobile.path);
      const cached = cache[id];
      const canSkip = !force && cached && cached.desktopSrc === dHash && cached.mobileSrc === mHash && await allExist(cached.files);

      let files;
      if (canSkip) {
        files = cached.files;
        reports.push({ id, skipped: true });
      } else {
        const desktop = await buildVariant(id, "desktop", theme.desktop.path);
        const mobile = await buildVariant(id, "mobile", theme.mobile.path);
        const placeholder = await buildPlaceholder(id, theme.desktop.path);
        files = {
          desktop: { webp: desktop.webp.map(([f, w]) => [f, w]), avif: desktop.avif.map(([f, w]) => [f, w]) },
          mobile: { webp: mobile.webp.map(([f, w]) => [f, w]), avif: mobile.avif.map(([f, w]) => [f, w]) },
          placeholder: placeholder.name
        };
        nextCache[id] = { desktopSrc: dHash, mobileSrc: mHash, files };
        reports.push({
          id, skipped: false,
          desktopFile: theme.desktop.fileName, mobileFile: theme.mobile.fileName,
          webpCount: desktop.webp.length + mobile.webp.length,
          avifCount: desktop.avif.length + mobile.avif.length,
          placeholderSize: placeholder.size
        });
      }

      entries.push(buildEntry(id, files, meta));
    } catch (err) {
      // bir temadaki hata diğerlerini durdurmaz; bu tema manifestten çıkar
      errors.push(`"${id}" işlenemedi: ${err.message}`);
    }
  }

  if (!entries.length) {
    // Güvenlik: hiç geçerli tema yoksa mevcut manifesti EZME (siteyi bozma).
    return { ok: false, entries: [], errors: [...errors, "Geçerli tema bulunamadı — manifest korundu."], warnings, reports, cleaned: 0, ms: Date.now() - started };
  }

  await writeManifestAtomic(entries);
  const cleaned = await cleanupOldHashes(entries);

  // cache'i yalnızca geçerli temalarla tut (silinen temaların kayıtlarını at)
  const prunedCache = {};
  for (const e of entries) if (nextCache[e.id]) prunedCache[e.id] = nextCache[e.id];
  await writeFile(cachePath, JSON.stringify(prunedCache, null, 2), "utf8");

  return { ok: errors.length === 0, entries, errors, warnings, reports, cleaned, ms: Date.now() - started };
}

// ---- doğrulama: checkAll (hiçbir şeyi değiştirmez) ------------------------

export async function checkAll() {
  const problems = [];
  const [{ themes, errors, warnings }, cache] = await Promise.all([
    scanSources(),
    loadJson(cachePath, null)
  ]);
  problems.push(...errors); // eksik eş, çift varyant, geçersiz ad vb.

  // manifesti oku
  let manifest = null;
  try {
    ({ ANA_SAYFA_GORSELLERI: manifest } = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`));
  } catch (err) {
    problems.push(`Manifest okunamadı (${path.relative(projectRoot, manifestPath)}): ${err.message}`);
    return finishCheck(problems, warnings);
  }
  if (!Array.isArray(manifest)) {
    problems.push("Manifest bir dizi değil.");
    return finishCheck(problems, warnings);
  }

  const ids = manifest.map((t) => t.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) problems.push(`Manifestte yinelenen id: ${[...new Set(dupes)].join(", ")}`);

  const validSourceIds = new Set([...themes.values()].filter((t) => !t.invalid).map((t) => t.id));
  for (const id of validSourceIds) {
    if (!ids.includes(id)) problems.push(`"${id}" kaynakta var ama manifestte yok — hero:optimize çalıştırın.`);
  }
  for (const id of ids) {
    if (!validSourceIds.has(id)) problems.push(`"${id}" manifestte var ama geçerli kaynak çifti yok.`);
  }

  // kaynak-hash cache ile bayatlık kontrolü (encode etmeden)
  if (cache) {
    for (const t of themes.values()) {
      if (t.invalid) continue;
      const c = cache[t.id];
      if (!c) continue;
      const [dh, mh] = await Promise.all([fileHash(t.desktop.path), fileHash(t.mobile.path)]);
      if (c.desktopSrc !== dh || c.mobileSrc !== mh) problems.push(`"${t.id}" kaynağı değişmiş ama yeniden üretilmemiş — hero:optimize çalıştırın.`);
    }
  }

  // referans yolları + format/placeholder + hash'siz ad + png kontrolü
  const referenced = new Set();
  for (const t of manifest) {
    const paths = [t.desktop?.fallback, t.mobile?.fallback, t.placeholder,
      ...String(t.desktop?.webpSrcSet || "").split(", ").filter(Boolean).map((s) => s.split(" ")[0]),
      ...String(t.desktop?.avifSrcSet || "").split(", ").filter(Boolean).map((s) => s.split(" ")[0]),
      ...String(t.mobile?.webpSrcSet || "").split(", ").filter(Boolean).map((s) => s.split(" ")[0]),
      ...String(t.mobile?.avifSrcSet || "").split(", ").filter(Boolean).map((s) => s.split(" ")[0])];
    for (const p of paths) {
      if (!p) continue;
      const base = p.split("/").pop();
      referenced.add(base);
      if (!existsSync(path.join(outputDir, base))) problems.push(`Manifest yolu diskte yok: ${p}`);
      if (/\.png$/i.test(p)) problems.push(`Manifestte orijinal PNG referansı: ${p}`);
      if (!new RegExp(`-${HASH_RE}\\.(webp|avif)$`).test(base)) problems.push(`Hash'siz stabil dosya adı manifestte: ${base}`);
    }
    if (!t.placeholder) problems.push(`"${t.id}" placeholder yok.`);
    if (!t.desktop?.webpSrcSet) problems.push(`"${t.id}" desktop WebP srcset yok.`);
    if (!t.mobile?.webpSrcSet) problems.push(`"${t.id}" mobile WebP srcset yok.`);
  }

  // kullanılmayan optimize dosyaları
  if (existsSync(outputDir)) {
    for (const f of await readdir(outputDir)) {
      if (!referenced.has(f)) problems.push(`Kullanılmayan optimize dosya: ${f}`);
    }
  }

  return finishCheck(problems, warnings);
}

function finishCheck(problems, warnings) {
  return { ok: problems.length === 0, problems, warnings };
}

export const paths = { projectRoot, sourceDir, outputDir, manifestPath, metadataPath, cachePath, kb };
