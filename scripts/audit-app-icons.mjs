import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { APP_ICON_IDS, APP_ICONS } from "../data/app-icons.js";
import { launcherRegistryEntries } from "../js/data/launcher-navigation.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsRoot = path.join(projectRoot, "assets", "icons", "apps");
const sourceDir = path.join(iconsRoot, "source");
const sizes = Object.freeze([64, 128, 256, 512]);
const formats = Object.freeze(["png", "webp", "avif"]);
const actualFormats = Object.freeze({ png: "png", webp: "webp", avif: "heif" });
const expectedLauncherIcons = Object.freeze({
  ravzalingo: "ravzalingo",
  kahoot: "kahoot",
  studyhub: "calisma-merkezi",
  memoryhub: "ezber-merkezi",
  fillgaphub: "bosluk-doldurma",
  quizhub: "quiz-merkezi",
  examcenter: "sinav-merkezi",
  recap: "hizli-tekrar",
  grade1: "sinif-ogretmen",
  grade2: "sinif-ogrenci",
  "arrow-puzzle": "ok-bulmacasi"
});
const sizeLimits = Object.freeze({
  "64.webp": 15 * 1024,
  "128.webp": 30 * 1024,
  "256.webp": 70 * 1024,
  "512.webp": 150 * 1024,
  "512.png": 300 * 1024
});
const scanExtensions = new Set([".html", ".js", ".mjs", ".json", ".css"]);
const ignoredDirectories = new Set([".git", "node_modules", "test-artifacts", ".cache", "tmp"]);
const errors = [];
const warnings = [];

function reportError(message) { errors.push(message); }
function reportWarning(message) { warnings.push(message); }

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

async function alphaCorners(filePath, maxAlpha = 0) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaIndex = info.channels - 1;
  const corners = [0, info.width - 1, (info.height - 1) * info.width, (info.height * info.width) - 1];
  return corners.every((pixel) => data[(pixel * info.channels) + alphaIndex] <= maxAlpha);
}

async function auditSources() {
  const sourceNames = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const expectedNames = APP_ICON_IDS.map((id) => `${id}.png`).sort();

  for (const name of expectedNames) if (!sourceNames.includes(name)) reportError(`Eksik PNG master: assets/icons/apps/source/${name}`);
  for (const name of sourceNames) {
    if (!expectedNames.includes(name)) reportError(`Beklenmeyen master dosya: assets/icons/apps/source/${name}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/.test(name)) reportError(`${name}: küçük harf kebab-case değil`);
    if (!name.endsWith(".png")) continue;
    const filePath = path.join(sourceDir, name);
    const metadata = await sharp(filePath).metadata();
    if (metadata.format !== "png" || metadata.width !== metadata.height || Number(metadata.width) < 1024) reportError(`${name}: master en az 1024×1024 kare PNG değil`);
    if (!metadata.hasAlpha || !await alphaCorners(filePath)) reportError(`${name}: şeffaf köşeler korunmamış`);
  }
}

async function auditOutputs() {
  const outputHashes = new Map();
  let count = 0;
  for (const id of APP_ICON_IDS) {
    for (const size of sizes) {
      for (const format of formats) {
        const relativePath = `assets/icons/apps/${size}/${id}.${format}`;
        const filePath = path.join(projectRoot, relativePath);
        if (!await exists(filePath)) { reportError(`Eksik çıktı: ${relativePath}`); continue; }
        count += 1;
        const metadata = await sharp(filePath).metadata();
        if (metadata.width !== size || metadata.height !== size) reportError(`${relativePath}: ${size}×${size} değil`);
        if (metadata.format !== actualFormats[format]) reportError(`${relativePath}: gerçek format ${format} değil (${metadata.format || "bilinmiyor"})`);
        const maxCornerAlpha = format === "avif" ? 1 : 0;
        if (!metadata.hasAlpha || !await alphaCorners(filePath, maxCornerAlpha)) reportError(`${relativePath}: alfa/şeffaf köşe hatası`);

        const bytes = (await stat(filePath)).size;
        const limit = sizeLimits[`${size}.${format}`];
        if (limit && bytes > limit) reportWarning(`${relativePath}: ${(bytes / 1024).toFixed(1)} KB, hedef ${(limit / 1024).toFixed(0)} KB`);

        const hash = createHash("sha256").update(await readFile(filePath)).digest("hex");
        const duplicate = outputHashes.get(hash);
        if (duplicate) reportError(`Gereksiz aynı çıktı: ${relativePath} = ${duplicate}`);
        else outputHashes.set(hash, relativePath);
      }
    }
  }
  return count;
}

function auditCatalog() {
  for (const id of APP_ICON_IDS) {
    const icon = APP_ICONS[id];
    if (!icon) { reportError(`Katalog kaydı eksik: ${id}`); continue; }
    if (icon.width !== 128 || icon.height !== 128) reportError(`${id}: katalog ölçüsü 128×128 değil`);
    for (const value of [icon.src, icon.fallback, icon.master, ...icon.srcset, ...icon.avifSrcset]) {
      if (/[A-ZÇĞİÖŞÜ]/.test(value) || value.includes("\\")) reportError(`${id}: Linux/Vercel uyumsuz yol: ${value}`);
    }
  }
  const registry = new Map(launcherRegistryEntries().map((entry) => [entry.id, entry]));
  for (const [entryId, iconId] of Object.entries(expectedLauncherIcons)) {
    const entry = registry.get(entryId);
    if (!entry) reportError(`Launcher kaydı eksik: ${entryId}`);
    else if (entry.appIcon !== iconId) reportError(`${entryId}: ${iconId} merkezi ikonuna bağlı değil`);
  }
}

async function auditReferences() {
  const allFiles = await listFiles(projectRoot);
  const actualFiles = new Map(allFiles.map((name) => [name.toLowerCase(), name]));
  const scanFiles = allFiles.filter((name) => scanExtensions.has(path.extname(name)) && name !== "scripts/audit-app-icons.mjs");
  const appPathPattern = /(?:\.\.\/|\.\/)*assets\/icons\/apps\/[a-zA-Z0-9_./${}-]+\.(?:png|webp|avif)/g;
  const obsoleteOkPath = ["assets", "icons", "games", "ok-bulmacasi.png"].join("/");

  for (const relativePath of scanFiles) {
    const content = await readFile(path.join(projectRoot, relativePath), "utf8");
    if (content.includes(obsoleteOkPath)) reportError(`${relativePath}: eski Ok Bulmacası ikon yolu kaldı`);
    for (const match of content.matchAll(appPathPattern)) {
      const normalized = match[0].replace(/^(?:\.\.\/|\.\/)+/, "");
      if (normalized.includes("${")) continue;
      const actual = actualFiles.get(normalized.toLowerCase());
      if (!actual) reportError(`${relativePath}: bulunamayan ikon yolu ${match[0]}`);
      else if (actual !== normalized) reportError(`${relativePath}: büyük-küçük harf hatası ${match[0]} → ${actual}`);
    }
  }

  const oldCopies = allFiles.filter((name) => /(?:^|\/)ok-bulmacasi\.(?:svg|png|webp|avif)$/i.test(name)
    && !/^assets\/icons\/apps\/(?:source|64|128|256|512)\//.test(name));
  for (const copy of oldCopies) reportError(`Kullanılmayan eski Ok Bulmacası kopyası: ${copy}`);
}

async function main() {
  await auditSources();
  const outputCount = await auditOutputs();
  auditCatalog();
  await auditReferences();
  for (const warning of warnings) process.stdout.write(`[app-icons] Uyarı: ${warning}\n`);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`[app-icons] Hata: ${error}\n`);
    process.stderr.write(`[app-icons] Kontrol başarısız — ${errors.length} hata, ${warnings.length} uyarı.\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`[app-icons] Kontrol başarılı — ${APP_ICON_IDS.length} PNG master, ${outputCount} optimize çıktı, ${warnings.length} boyut uyarısı.\n`);
}

main().catch((error) => {
  process.stderr.write(`[app-icons] Kontrol çalıştırılamadı: ${error.message}\n`);
  process.exitCode = 1;
});
