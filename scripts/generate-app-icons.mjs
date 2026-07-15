import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { APP_ICON_IDS } from "../data/app-icons.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsRoot = path.join(projectRoot, "assets", "icons", "apps");
const sourceDir = path.join(iconsRoot, "source");
const manifestPath = path.join(iconsRoot, ".icon-manifest.json");
const sizes = Object.freeze([64, 128, 256, 512]);
const formats = Object.freeze(["png", "webp", "avif"]);
const pipelineVersion = 2;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function outputPaths(iconId) {
  return sizes.flatMap((size) => formats.map((format) => ({
    size,
    format,
    filePath: path.join(iconsRoot, String(size), `${iconId}.${format}`)
  })));
}

async function validateMaster(sourcePath, iconId) {
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.format !== "png") throw new Error(`${iconId}: master dosya PNG değil.`);
  if (metadata.width !== metadata.height || Number(metadata.width) < 1024) throw new Error(`${iconId}: master en az 1024×1024 kare olmalı.`);
  if (!metadata.hasAlpha) throw new Error(`${iconId}: master alfa kanalı içermiyor.`);
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaIndex = info.channels - 1;
  const corners = [0, info.width - 1, (info.height - 1) * info.width, (info.height * info.width) - 1];
  if (corners.some((pixel) => data[(pixel * info.channels) + alphaIndex] !== 0)) {
    throw new Error(`${iconId}: master köşeleri şeffaf değil.`);
  }
}

function contentHash(buffer) {
  return createHash("sha256")
    .update(String(pipelineVersion))
    .update(JSON.stringify({ sizes, formats, png: 9, webp: 86, avif: 60 }))
    .update(buffer)
    .digest("hex");
}

async function writeIcon(sourcePath, destination, size, format) {
  const tempPath = `${destination}.${process.pid}.tmp`;
  let image = sharp(sourcePath)
    .resize(size, size, { fit: "contain", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha();

  if (format === "png") {
    image = image.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 });
  } else if (format === "webp") {
    image = image.webp({ quality: 86, alphaQuality: 100, smartSubsample: true, effort: 6 });
  } else {
    image = image.avif({ quality: 60, effort: 6, chromaSubsampling: "4:4:4" });
  }

  try {
    await image.toFile(tempPath);
    if (await exists(destination)) await unlink(destination);
    await rename(tempPath, destination);
  } catch (error) {
    if (await exists(tempPath)) await unlink(tempPath);
    throw error;
  }
}

async function readManifest() {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return parsed?.version === pipelineVersion && parsed.icons && typeof parsed.icons === "object"
      ? parsed
      : { version: pipelineVersion, icons: {} };
  } catch {
    return { version: pipelineVersion, icons: {} };
  }
}

async function main() {
  const sourceFiles = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "tr"));
  const expectedFiles = APP_ICON_IDS.map((id) => `${id}.png`).sort((a, b) => a.localeCompare(b, "tr"));

  if (sourceFiles.join("|") !== expectedFiles.join("|")) {
    const missing = expectedFiles.filter((name) => !sourceFiles.includes(name));
    const extra = sourceFiles.filter((name) => !expectedFiles.includes(name));
    throw new Error(`Master seti tutarsız. Eksik: ${missing.join(", ") || "yok"}; fazla: ${extra.join(", ") || "yok"}.`);
  }

  await Promise.all(sizes.map((size) => mkdir(path.join(iconsRoot, String(size)), { recursive: true })));
  const previous = await readManifest();
  const next = { version: pipelineVersion, icons: {} };
  let generatedFiles = 0;
  let skippedIcons = 0;

  for (const filename of sourceFiles) {
    const iconId = path.basename(filename, ".png");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(iconId)) throw new Error(`${filename}: dosya adı kebab-case değil.`);
    const sourcePath = path.join(sourceDir, filename);
    await validateMaster(sourcePath, iconId);
    const hash = contentHash(await readFile(sourcePath));
    const outputs = outputPaths(iconId);
    const complete = (await Promise.all(outputs.map(({ filePath }) => exists(filePath)))).every(Boolean);
    next.icons[iconId] = { hash, outputs: outputs.length };

    if (previous.icons[iconId]?.hash === hash && complete) {
      skippedIcons += 1;
      process.stdout.write(`[app-icons] ${iconId}: değişmedi, atlandı\n`);
      continue;
    }

    for (const output of outputs) {
      await writeIcon(sourcePath, output.filePath, output.size, output.format);
      generatedFiles += 1;
    }
    process.stdout.write(`[app-icons] ${iconId}: ${outputs.length} çıktı üretildi\n`);
  }

  const tempManifest = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(tempManifest, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  if (await exists(manifestPath)) await unlink(manifestPath);
  await rename(tempManifest, manifestPath);
  process.stdout.write(`[app-icons] Tamamlandı — ${sourceFiles.length} raster master, ${generatedFiles} yeni çıktı, ${skippedIcons} değişmeyen ikon.\n`);
}

main().catch((error) => {
  process.stderr.write(`[app-icons] Üretim başarısız: ${error.message}\n`);
  process.exitCode = 1;
});
