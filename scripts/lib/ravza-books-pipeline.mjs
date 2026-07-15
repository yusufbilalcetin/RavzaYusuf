import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import sharp from "sharp";

// PDF.js ve kapak canvasÄ± aynÄ± yerel geometri sÄ±nÄ±flarÄ±nÄ± kullanmalÄ±.
// Aksi halde iki farklÄ± @napi-rs/canvas sÃ¼rÃ¼mÃ¼ Path2D kullanan PDF'lerde Ã§akÄ±ÅŸÄ±r.
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const booksDir = path.join(projectRoot, "assets", "books");
const sourceDir = path.join(projectRoot, "assets", "books", "original");
const outputDir = path.join(projectRoot, "assets", "books", "optimized");
const manifestPath = path.join(projectRoot, "data", "ravza-books.generated.js");
const metadataPath = path.join(projectRoot, "data", "ravza-books-metadata.json");
const cachePath = path.join(projectRoot, ".cache", "ravza-books.json");
const ASSET_SOURCE_ROOT = "./assets/books/original";
const ASSET_OUTPUT_ROOT = "./assets/books/optimized";
const COVER_WIDTHS = Object.freeze([320, 640]);
const COVER_WEBP_OPTIONS = Object.freeze({ quality: 82, effort: 6, smartSubsample: true });
const GENERATED_COVER_RE = /^(.+)-cover-(320|640)-([0-9a-f]{8})\.webp$/;

const TR_MAP = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
};

export function slugify(input) {
  return String(input)
    .replace(/[çğıöşüâîûÇĞİIÖŞÜ]/g, character => TR_MAP[character] || character)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function humanize(id) {
  return id.split("-").filter(Boolean)
    .map(word => word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1))
    .join(" ");
}

function shortHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 8);
}

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

function relative(filePath) {
  return path.relative(projectRoot, filePath).replaceAll("\\", "/");
}

function assetSourcePath(fileName) {
  return `${ASSET_SOURCE_ROOT}/${encodeURIComponent(fileName)}`;
}

function assetSourceUrl(fileName, sourceHash) {
  return `${assetSourcePath(fileName)}?v=${sourceHash.slice(0, 12)}`;
}

function assetOutputPath(fileName) {
  return `${ASSET_OUTPUT_ROOT}/${fileName}`;
}

function normalizeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function orderValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 999;
}

function pdfInfoValue(info, key) {
  return normalizeText(info?.[key]);
}

async function ensureDirectories() {
  await mkdir(booksDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.dirname(cachePath), { recursive: true });
}

async function ingestRootPdfs() {
  const moved = [];
  const errors = [];
  const warnings = [];
  const entries = await readdir(booksDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) continue;
    const sourcePath = path.join(booksDir, entry.name);
    const targetPath = path.join(sourceDir, entry.name);
    if (existsSync(targetPath)) {
      const [sourceHash, targetHash] = await Promise.all([fileHash(sourcePath), fileHash(targetPath)]);
      if (sourceHash === targetHash) {
        warnings.push(`Aynı PDF original/ içinde zaten var; kökteki kopyaya dokunulmadı: ${entry.name}`);
      } else {
        errors.push(`Kökteki "${entry.name}" taşınamadı: original/ içinde aynı adlı farklı bir PDF var.`);
      }
      continue;
    }
    await rename(sourcePath, targetPath);
    moved.push(entry.name);
  }
  return { moved, errors, warnings };
}

async function rootPdfNames() {
  try {
    return (await readdir(booksDir, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b, "tr"));
  } catch {
    return [];
  }
}

export async function scanSources() {
  const books = new Map();
  const errors = [];
  const warnings = [];
  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    errors.push(`Kaynak klasör bulunamadı: ${relative(sourceDir)}`);
    return { books, errors, warnings };
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) {
      if (!/^readme(?:\..+)?$/i.test(entry.name)) warnings.push(`PDF olmadığı için atlandı: ${entry.name}`);
      continue;
    }
    const id = slugify(entry.name.replace(/\.pdf$/i, ""));
    if (!id) {
      errors.push(`Geçersiz PDF adı: ${entry.name}`);
      continue;
    }
    if (books.has(id)) {
      errors.push(`Aynı kitap kimliğini üreten iki PDF var: ${books.get(id).fileName} ve ${entry.name}`);
      continue;
    }
    books.set(id, { id, fileName: entry.name, path: path.join(sourceDir, entry.name) });
  }
  if (!books.size) errors.push(`Hiç PDF bulunamadı: ${relative(sourceDir)}`);
  return { books, errors, warnings };
}

async function openPdf(source) {
  const bytes = new Uint8Array(await readFile(source.path));
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("dosya geçerli bir PDF başlığı taşımıyor");
  }
  const loadingTask = getDocument({
    data: bytes,
    disableWorker: true,
    useSystemFonts: true,
    verbosity: 0,
  });
  const document = await loadingTask.promise;
  const metadata = await document.getMetadata().catch(() => ({ info: {} }));
  return { document, info: metadata?.info || {} };
}

async function renderCover(document, pageNumber) {
  const page = await document.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 640 / baseViewport.width });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  await page.render({ canvas, canvasContext: context, viewport, background: "#f4ead7" }).promise;
  const png = canvas.toBuffer("image/png");
  const covers = [];
  for (const width of COVER_WIDTHS) {
    const buffer = await sharp(png)
      .resize({ width, withoutEnlargement: true })
      .webp(COVER_WEBP_OPTIONS)
      .toBuffer();
    covers.push({ width, buffer });
  }
  return { covers, ratio: viewport.height / viewport.width };
}

function coverFileName(bookId, width, buffer) {
  return `${bookId}-cover-${width}-${shortHash(buffer)}.webp`;
}

async function buildBook(source, config, sourceHash) {
  const { document, info } = await openPdf(source);
  try {
    const totalPages = document.numPages;
    const coverPage = Math.max(1, Math.min(Number(config.coverPage) || 1, totalPages));
    const rendered = await renderCover(document, coverPage);
    const covers = [];
    for (const cover of rendered.covers) {
      const fileName = coverFileName(source.id, cover.width, cover.buffer);
      await writeFile(path.join(outputDir, fileName), cover.buffer);
      covers.push({ fileName, width: cover.width, bytes: cover.buffer.length });
    }
    return {
      sourceHash,
      totalPages,
      coverPage,
      info: { title: pdfInfoValue(info, "Title"), author: pdfInfoValue(info, "Author") },
      covers,
      coverWidth: 640,
      coverHeight: Math.round(640 * rendered.ratio),
    };
  } finally {
    await document.destroy();
  }
}

function cachedFilesExist(cached) {
  return Array.isArray(cached?.covers)
    && COVER_WIDTHS.every(width => {
      const cover = cached.covers.find(item => item.width === width);
      return cover && existsSync(path.join(outputDir, cover.fileName));
    });
}

function buildManifestEntry(source, built, config) {
  const title = normalizeText(config.title, built.info.title || humanize(source.id));
  const author = normalizeText(config.author, built.info.author || "Bilinmeyen yazar");
  const translator = normalizeText(config.translator);
  const description = normalizeText(config.description, `${title} kitabının orijinal PDF sürümü.`);
  const sortedCovers = [...built.covers].sort((a, b) => a.width - b.width);
  const largeCover = sortedCovers.at(-1);
  return {
    id: source.id,
    type: "pdf",
    title,
    author,
    ...(translator ? { translator } : {}),
    file: assetSourceUrl(source.fileName, built.sourceHash),
    sourceHash: built.sourceHash,
    cover: assetOutputPath(largeCover.fileName),
    coverSrcSet: sortedCovers.map(cover => `${assetOutputPath(cover.fileName)} ${cover.width}w`).join(", "),
    coverWidth: built.coverWidth,
    coverHeight: built.coverHeight,
    description,
    totalPages: built.totalPages,
    coverPage: built.coverPage,
    order: orderValue(config.order),
  };
}

async function writeManifestAtomic(entries) {
  const sorted = [...entries]
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "tr"))
    .map(({ order, ...entry }) => entry);
  for (const entry of sorted) {
    const pdfPath = entry.file.split("?", 1)[0];
    await access(path.join(projectRoot, decodeURIComponent(pdfPath.replace(/^\.\//, ""))));
    await access(path.join(projectRoot, entry.cover.replace(/^\.\//, "")));
  }
  const content = [
    "// OTOMATİK ÜRETİLDİ — elle düzenlemeyin.",
    "// Kaynak: assets/books/original/*.pdf + data/ravza-books-metadata.json",
    "// Yeniden üretmek için: npm run books:optimize",
    `export const RAVZA_BOOKS = Object.freeze(${JSON.stringify(sorted, null, 2)});`,
    "",
    "export default RAVZA_BOOKS;",
    "",
  ].join("\n");
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, manifestPath);
}

function referencedCoverNames(entries) {
  const names = new Set();
  for (const entry of entries) {
    for (const item of String(entry.coverSrcSet).split(", ")) {
      const fileName = item.split(" ")[0]?.split("/").pop();
      if (fileName) names.add(fileName);
    }
  }
  return names;
}

async function cleanupGeneratedCovers(entries) {
  const referenced = referencedCoverNames(entries);
  let removed = 0;
  for (const fileName of await readdir(outputDir)) {
    if (!GENERATED_COVER_RE.test(fileName) || referenced.has(fileName)) continue;
    await rm(path.join(outputDir, fileName), { force: true });
    removed += 1;
  }
  return removed;
}

export async function optimizeAll({ force = false } = {}) {
  const started = Date.now();
  await ensureDirectories();
  const ingestion = await ingestRootPdfs();
  const [{ books, errors, warnings }, metadata, cache] = await Promise.all([
    scanSources(),
    loadJson(metadataPath, {}),
    loadJson(cachePath, {}),
  ]);
  errors.unshift(...ingestion.errors);
  warnings.unshift(...ingestion.warnings);
  const entries = [];
  const reports = [];
  const nextCache = {};

  for (const source of books.values()) {
    try {
      const config = metadata[source.id] || {};
      const sourceHash = await fileHash(source.path);
      const cached = cache[source.id];
      const requestedCoverPage = Math.max(1, Number(config.coverPage) || 1);
      const cachedCoverPage = Math.min(requestedCoverPage, Number(cached?.totalPages) || requestedCoverPage);
      const canSkip = !force
        && cached?.sourceHash === sourceHash
        && cached?.coverPage === cachedCoverPage
        && cachedFilesExist(cached);
      const built = canSkip ? cached : await buildBook(source, config, sourceHash);
      nextCache[source.id] = built;
      entries.push(buildManifestEntry(source, built, config));
      reports.push({
        id: source.id,
        title: normalizeText(config.title, built.info.title || humanize(source.id)),
        totalPages: built.totalPages,
        skipped: canSkip,
        covers: built.covers,
      });
    } catch (error) {
      errors.push(`"${source.id}" işlenemedi: ${error.message}`);
    }
  }

  if (!entries.length) {
    return { ok: false, entries, errors: [...errors, "Geçerli kitap bulunamadı — mevcut manifest korundu."], warnings, reports, ingested: ingestion.moved, cleaned: 0, ms: Date.now() - started };
  }
  await writeManifestAtomic(entries);
  const cleaned = await cleanupGeneratedCovers(entries);
  await writeFile(cachePath, JSON.stringify(nextCache, null, 2), "utf8");
  return { ok: errors.length === 0, entries, errors, warnings, reports, ingested: ingestion.moved, cleaned, ms: Date.now() - started };
}

async function readManifest(problems) {
  try {
    const module = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`);
    return module.RAVZA_BOOKS;
  } catch (error) {
    problems.push(`Manifest okunamadı (${relative(manifestPath)}): ${error.message}`);
    return null;
  }
}

async function validateCover(entry, sourceId, problems, referenced) {
  const variants = String(entry.coverSrcSet || "").split(", ").filter(Boolean);
  if (variants.length !== COVER_WIDTHS.length) problems.push(`"${sourceId}" için 320w ve 640w kapak varyantları eksik.`);
  for (const variant of variants) {
    const [assetPath, widthToken] = variant.split(" ");
    const fileName = assetPath?.split("/").pop();
    const width = Number(String(widthToken).replace(/w$/, ""));
    if (!fileName || !GENERATED_COVER_RE.test(fileName)) {
      problems.push(`"${sourceId}" geçersiz kapak dosyası: ${assetPath || "boş"}`);
      continue;
    }
    referenced.add(fileName);
    const filePath = path.join(outputDir, fileName);
    if (!existsSync(filePath)) {
      problems.push(`"${sourceId}" kapak dosyası bulunamadı: ${assetPath}`);
      continue;
    }
    try {
      const image = await sharp(filePath).metadata();
      if (image.format !== "webp" || image.width !== width) problems.push(`"${sourceId}" kapak varyantı hatalı: ${fileName}`);
    } catch (error) {
      problems.push(`"${sourceId}" kapağı açılamadı (${fileName}): ${error.message}`);
    }
  }
}

export async function checkAll() {
  const problems = [];
  const [{ books, errors, warnings }, metadata, inboxPdfs] = await Promise.all([
    scanSources(),
    loadJson(metadataPath, {}),
    rootPdfNames(),
  ]);
  problems.push(...errors);
  for (const fileName of inboxPdfs) problems.push(`Kökte bekleyen PDF var: ${fileName} — books:optimize çalıştırın.`);
  const manifest = await readManifest(problems);
  if (!Array.isArray(manifest)) {
    if (manifest !== null) problems.push("Kitap manifesti bir dizi değil.");
    return { ok: false, problems, warnings };
  }

  const manifestById = new Map();
  for (const entry of manifest) {
    if (!entry?.id || manifestById.has(entry.id)) problems.push(`Manifestte yinelenen veya geçersiz kitap kimliği: ${entry?.id || "boş"}`);
    else manifestById.set(entry.id, entry);
  }
  for (const id of books.keys()) if (!manifestById.has(id)) problems.push(`"${id}" kaynakta var ama manifestte yok — books:optimize çalıştırın.`);
  for (const id of manifestById.keys()) if (!books.has(id)) problems.push(`"${id}" manifestte var ama kaynak PDF bulunamadı.`);
  for (const id of Object.keys(metadata)) if (!books.has(id)) warnings.push(`Metadata var ama kaynak PDF yok: ${id}`);

  const referenced = new Set();
  for (const source of books.values()) {
    const entry = manifestById.get(source.id);
    if (!entry) continue;
    const config = metadata[source.id] || {};
    if (entry.type !== "pdf") problems.push(`"${source.id}" kitap türü pdf değil.`);
    const hash = await fileHash(source.path);
    if (entry.file !== assetSourceUrl(source.fileName, hash)) problems.push(`"${source.id}" PDF yolu güncel değil — books:optimize çalıştırın.`);
    if (entry.sourceHash !== hash) problems.push(`"${source.id}" PDF değişmiş — books:optimize çalıştırın.`);

    try {
      const { document, info } = await openPdf(source);
      try {
        const expectedTitle = normalizeText(config.title, pdfInfoValue(info, "Title") || humanize(source.id));
        const expectedAuthor = normalizeText(config.author, pdfInfoValue(info, "Author") || "Bilinmeyen yazar");
        const expectedTranslator = normalizeText(config.translator);
        const expectedDescription = normalizeText(config.description, `${expectedTitle} kitabının orijinal PDF sürümü.`);
        if (entry.title !== expectedTitle) problems.push(`"${source.id}" başlığı metadata ile eşleşmiyor — books:optimize çalıştırın.`);
        if (entry.author !== expectedAuthor) problems.push(`"${source.id}" yazarı metadata ile eşleşmiyor — books:optimize çalıştırın.`);
        if ((entry.translator || "") !== expectedTranslator) problems.push(`"${source.id}" çevirmeni metadata ile eşleşmiyor — books:optimize çalıştırın.`);
        if (entry.description !== expectedDescription) problems.push(`"${source.id}" açıklaması metadata ile eşleşmiyor — books:optimize çalıştırın.`);
        if (entry.totalPages !== document.numPages) problems.push(`"${source.id}" sayfa sayısı ${entry.totalPages}, PDF gerçekte ${document.numPages}.`);
        const expectedCoverPage = Math.max(1, Math.min(Number(config.coverPage) || 1, document.numPages));
        if (entry.coverPage !== expectedCoverPage) problems.push(`"${source.id}" kapak sayfası metadata ile eşleşmiyor — books:optimize çalıştırın.`);
      } finally {
        await document.destroy();
      }
    } catch (error) {
      problems.push(`"${source.id}" PDF açılamadı: ${error.message}`);
    }
    await validateCover(entry, source.id, problems, referenced);
  }

  const expectedOrder = [...books.values()]
    .sort((a, b) => {
      const aConfig = metadata[a.id] || {};
      const bConfig = metadata[b.id] || {};
      const aTitle = normalizeText(aConfig.title, manifestById.get(a.id)?.title || humanize(a.id));
      const bTitle = normalizeText(bConfig.title, manifestById.get(b.id)?.title || humanize(b.id));
      return orderValue(aConfig.order) - orderValue(bConfig.order) || aTitle.localeCompare(bTitle, "tr");
    })
    .map(source => source.id);
  if (manifest.map(entry => entry.id).join("|") !== expectedOrder.join("|")) problems.push("Kitap sırası metadata ile eşleşmiyor — books:optimize çalıştırın.");

  if (existsSync(outputDir)) {
    for (const fileName of await readdir(outputDir)) {
      if (GENERATED_COVER_RE.test(fileName) && !referenced.has(fileName)) problems.push(`Kullanılmayan optimize kapak: ${fileName}`);
    }
  }
  return { ok: problems.length === 0, problems, warnings };
}

export const paths = Object.freeze({ projectRoot, booksDir, sourceDir, outputDir, manifestPath, metadataPath, cachePath });
