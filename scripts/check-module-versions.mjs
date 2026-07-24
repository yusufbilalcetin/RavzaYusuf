#!/usr/bin/env node
/**
 * Ayni modulun farkli ?v= etiketleriyle (ya da biri etiketli digeri etiketsiz)
 * import edilmesini yakalar.
 *
 * Tarayici icin her farkli URL ayri bir moduldur: ayni dosya iki farkli
 * specifier ile import edilirse iki kez indirilir ve iki kez calisir. Modul
 * seviyesindeki state (tekil kayitlar, event listener'lar, init bayraklari)
 * bu durumda ikiye bolunur. js/core/app.js icindeki __RAVZA_INIT_APP__
 * idempotans korumasi tam olarak bu tehlike icin eklenmisti.
 *
 * Kullanim: node ./scripts/check-module-versions.mjs
 * Cikis kodu 1 ise tutarsizlik vardir.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["js", "data", "partials"];
const SCAN_FILES = ["index.html", "admin.html"];
const SKIP = new Set(["node_modules", ".git", "dist", "test-artifacts"]);

async function collectFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(rel)));
    else if (/\.(js|mjs|html)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// import ... from "x", import("x"), new URL("x", import.meta.url), src/href="x"
const SPECIFIER_PATTERNS = [
  /from\s+["']([^"']+\.js[^"']*)["']/g,
  /import\s*\(\s*["']([^"']+\.js[^"']*)["']\s*\)/g,
  /new URL\(\s*["']([^"']+\.js[^"']*)["']/g,
  /(?:src|href)\s*=\s*["']([^"']+\.(?:js|css)[^"']*)["']/g
];

const usages = new Map(); // resolved path -> Map<specifierSuffix, Set<importer>>

for (const file of [...(await Promise.all(SCAN_DIRS.map(collectFiles))).flat(), ...SCAN_FILES]) {
  let source;
  try {
    source = await readFile(join(ROOT, file), "utf8");
  } catch {
    continue;
  }

  for (const pattern of SPECIFIER_PATTERNS) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (/^(https?:)?\/\//.test(specifier)) continue; // CDN
      const [path, query = ""] = specifier.split("?");
      if (!path.startsWith(".") && !path.startsWith("/")) continue;

      const target = relative(ROOT, resolve(dirname(join(ROOT, file)), path)).replace(/\\/g, "/");
      if (!usages.has(target)) usages.set(target, new Map());
      const byQuery = usages.get(target);
      const key = query ? `?${query}` : "(etiketsiz)";
      if (!byQuery.has(key)) byQuery.set(key, new Set());
      byQuery.get(key).add(file.replace(/\\/g, "/"));
    }
  }
}

const conflicts = [...usages.entries()]
  .filter(([, byQuery]) => byQuery.size > 1)
  .sort(([a], [b]) => a.localeCompare(b));

if (!conflicts.length) {
  console.log(`✓ Modul surum etiketleri tutarli (${usages.size} modul tarandi).`);
  process.exit(0);
}

console.error(`✗ ${conflicts.length} modul birden fazla specifier ile import ediliyor:\n`);
for (const [target, byQuery] of conflicts) {
  console.error(`  ${target}`);
  for (const [key, importers] of byQuery) {
    console.error(`     ${key}  <- ${[...importers].join(", ")}`);
  }
  console.error("");
}
process.exit(1);
