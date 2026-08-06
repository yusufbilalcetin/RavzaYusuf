import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = join(ROOT, "test-artifacts", "background-images");
const SCAN_ROOTS = ["css", "js", "data", "partials", "games"];
const ROOT_FILES = ["index.html"];
const SOURCE_EXTENSIONS = new Set([".css", ".js", ".mjs", ".html"]);
const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const EXCLUDED_DIRECTORIES = new Set(["node_modules", "test-artifacts", ".git"]);

function slash(value) {
  return value.split(sep).join("/");
}

function isLocalImageReference(value) {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed)
    && IMAGE_EXTENSION.test(trimmed)
    && !/^(?:data:|blob:|https?:|\/\/)/i.test(trimmed)
    && !/[${}]/.test(trimmed);
}

function cleanReference(value) {
  return decodeURIComponent(String(value).trim().replace(/^['"]|['"]$/g, "").split(/[?#]/, 1)[0]);
}

async function walk(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, files);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(absolute);
  }
}

function addReference(references, seen, file, line, kind, raw) {
  const value = String(raw || "").trim();
  if (!isLocalImageReference(value)) return;
  const key = `${file}\u0000${line}\u0000${kind}\u0000${value}`;
  if (seen.has(key)) return;
  seen.add(key);
  references.push({ file, line, kind, raw: value });
}

function extractReferences(absoluteFile, content) {
  const file = slash(relative(ROOT, absoluteFile));
  const references = [];
  const seen = new Set();
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, index) => {
    const line = index + 1;
    let match;

    const cssUrl = /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi;
    while ((match = cssUrl.exec(lineText))) addReference(references, seen, file, line, "css-url", match[2]);

    const imageAttribute = /\b(src|srcset|poster|href|imagesrcset)\s*=\s*(["'])(.*?)\2/gi;
    while ((match = imageAttribute.exec(lineText))) {
      const attribute = match[1].toLowerCase();
      if ((attribute === "href" || attribute === "imagesrcset") && !/(?:as\s*=\s*["']image|rel\s*=\s*["'](?:preload|icon))/i.test(lineText)) continue;
      const candidates = /srcset/i.test(attribute)
        ? match[3].split(",").map((part) => part.trim().split(/\s+/, 1)[0])
        : [match[3]];
      for (const candidate of candidates) addReference(references, seen, file, line, `html-${attribute}`, candidate);
    }

    if (file === "data/ana-sayfa-gorselleri.generated.js") {
      // Srcset değerlerinde URL'den sonra `960w` gibi bir descriptor bulunur;
      // yalnız tam quoted-string aramak manifestteki varyantların çoğunu atlar.
      // Her AVIF/WebP adayını ayrı kayda dönüştürerek tüm hero havuzunu denetle.
      const heroManifestPath = /(?:(?:\.\.\/|\.\/|\/)?assets\/ana-sayfa\/optimized\/)[^"'`,\s]+?\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#][^"'`,\s]*)?/gi;
      while ((match = heroManifestPath.exec(lineText))) addReference(references, seen, file, line, "hero-manifest", match[0]);
    } else if (/background|wallpaper|hero|banner|placeholder|fallback|thumb|cover|\bsrc\b|image|gorsel|görsel/i.test(lineText)) {
      const stringPath = /(["'`])((?:(?:\.\.\/|\.\/|\/)?(?:assets|games)\/)[^"'`\s]+?\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#][^"'`\s]*)?)\1/gi;
      while ((match = stringPath.exec(lineText))) addReference(references, seen, file, line, "script-image", match[2]);
    }
  });

  return references;
}

function referenceBase(reference) {
  const absoluteFile = join(ROOT, ...reference.file.split("/"));
  if (reference.raw.startsWith("/")) return ROOT;
  if (reference.file.endsWith(".css")) return dirname(absoluteFile);
  if (reference.file.startsWith("partials/")) return ROOT;
  if (reference.file.startsWith("games/")) {
    const segments = reference.file.split("/");
    if (segments.includes("dist")) return dirname(absoluteFile);
    return join(ROOT, segments[0], segments[1]);
  }
  return ROOT;
}

function resolvedPath(reference) {
  const clean = cleanReference(reference.raw);
  const withoutRootSlash = clean.replace(/^\/+/, "");
  return resolve(referenceBase(reference), withoutRootSlash);
}

async function exactCaseStatus(absolutePath) {
  const relativePath = relative(ROOT, absolutePath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    return { exactCase: false, mismatch: "proje-koku-disinda" };
  }

  let current = ROOT;
  for (const segment of relativePath.split(sep)) {
    let names;
    try {
      names = await readdir(current);
    } catch {
      return { exactCase: false, mismatch: slash(relative(ROOT, current)) || "." };
    }
    if (names.includes(segment)) {
      current = join(current, segment);
      continue;
    }
    const insensitive = names.find((name) => name.toLocaleLowerCase("en-US") === segment.toLocaleLowerCase("en-US"));
    return {
      exactCase: false,
      mismatch: insensitive ? `${segment} -> ${insensitive}` : segment,
    };
  }
  return { exactCase: true, mismatch: "" };
}

function markdownEscape(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderMarkdown(report) {
  const lines = [
    "# Arka plan ve hero görsel envanteri",
    "",
    `- Üretilme: ${report.generatedAt}`,
    `- Taranan kaynak dosyası: ${report.summary.scannedFiles}`,
    `- Toplam yerel görsel referansı: ${report.summary.references}`,
    `- Benzersiz hedef dosya: ${report.summary.uniqueTargets}`,
    `- Eksik hedef: ${report.summary.missing}`,
    `- Büyük/küçük harf uyuşmazlığı: ${report.summary.caseMismatches}`,
    `- Aynı hedef için farklı URL yazımı: ${report.summary.pathVariants}`,
    "",
    "| Kaynak | Tür | Referans | Disk karşılığı | Var | Case |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const entry of report.references) {
    lines.push(`| ${markdownEscape(`${entry.file}:${entry.line}`)} | ${markdownEscape(entry.kind)} | ${markdownEscape(entry.raw)} | ${markdownEscape(entry.resolved)} | ${entry.exists ? "Evet" : "Hayır"} | ${entry.exactCase ? "Tam" : markdownEscape(entry.caseMismatch || "Uyuşmuyor")} |`);
  }

  lines.push("", "## Aynı hedef için URL biçim varyantları", "");
  if (!report.pathVariants.length) lines.push("Yok.");
  for (const variant of report.pathVariants) {
    lines.push(`- \`${variant.target}\`: ${variant.raw.map((value) => `\`${value}\``).join(", ")}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const files = [];
for (const scanRoot of SCAN_ROOTS) {
  const absolute = join(ROOT, scanRoot);
  if (existsSync(absolute)) await walk(absolute, files);
}
for (const rootFile of ROOT_FILES) {
  const absolute = join(ROOT, rootFile);
  if (existsSync(absolute)) files.push(absolute);
}

const rawReferences = [];
for (const absoluteFile of files.sort()) {
  const content = await readFile(absoluteFile, "utf8");
  rawReferences.push(...extractReferences(absoluteFile, content));
}

const references = [];
for (const reference of rawReferences) {
  const absoluteTarget = resolvedPath(reference);
  const exists = existsSync(absoluteTarget);
  const caseStatus = await exactCaseStatus(absoluteTarget);
  references.push({
    ...reference,
    resolved: slash(relative(ROOT, absoluteTarget)),
    exists,
    exactCase: exists && caseStatus.exactCase,
    caseMismatch: caseStatus.mismatch,
  });
}

const targets = new Map();
for (const reference of references) {
  if (!targets.has(reference.resolved)) targets.set(reference.resolved, new Set());
  targets.get(reference.resolved).add(reference.raw);
}
const pathVariants = [...targets]
  .filter(([, raw]) => raw.size > 1)
  .map(([target, raw]) => ({ target, raw: [...raw].sort() }))
  .sort((a, b) => a.target.localeCompare(b.target));

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    scannedFiles: files.length,
    references: references.length,
    uniqueTargets: targets.size,
    missing: references.filter((entry) => !entry.exists).length,
    caseMismatches: references.filter((entry) => entry.exists && !entry.exactCase).length,
    pathVariants: pathVariants.length,
  },
  references,
  pathVariants,
};

await mkdir(ARTIFACT_DIR, { recursive: true });
await Promise.all([
  writeFile(join(ARTIFACT_DIR, "inventory.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(join(ARTIFACT_DIR, "inventory.md"), renderMarkdown(report), "utf8"),
]);

assert.equal(report.summary.missing, 0, `${report.summary.missing} görsel referansının disk karşılığı bulunamadı.`);
assert.equal(report.summary.caseMismatches, 0, `${report.summary.caseMismatches} görsel referansında case uyuşmazlığı bulundu.`);
console.log(`[background-assets] ${report.summary.references} referans, ${report.summary.uniqueTargets} hedef, ${report.summary.pathVariants} URL biçim varyantı.`);
console.log("[background-assets] Eksik dosya: 0, case uyuşmazlığı: 0.");
