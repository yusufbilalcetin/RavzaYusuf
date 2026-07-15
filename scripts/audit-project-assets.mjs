import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { extname, dirname, join, normalize, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ACTIVE_GAMES, GAMES } from "../data/games.js";
import { RAVZA_BOOKS } from "../data/ravza-books.generated.js";
import { ASSET_AUDIT_CONFIG, fileLimit } from "./asset-audit.config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modeArgument = process.argv.find((value) => value.startsWith("--")) || "--all";
const runUnused = modeArgument === "--all" || modeArgument === "--unused";
const runPerformance = modeArgument === "--all" || modeArgument === "--performance";
const runRoutes = modeArgument === "--all" || modeArgument === "--routes";
const runBrowserRoutes = modeArgument === "--routes" || process.env.CI === "true";
const allowlist = JSON.parse(await readFile(join(ROOT, "scripts/asset-audit-allowlist.json"), "utf8"));

const slash = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "");
const projectPath = (absolutePath) => slash(relative(ROOT, absolutePath));
const bytes = (value) => `${(value / 1024).toFixed(value >= 1024 * 1024 ? 0 : 1)} KB`;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const output = (value = "") => process.stdout.write(`${value}\n`);

function globRegex(pattern) {
  const token = "__DOUBLE_STAR__";
  const escaped = slash(pattern)
    .replaceAll("**", token)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll(token, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

const allowPatterns = Object.fromEntries(Object.entries(allowlist)
  .filter(([, value]) => Array.isArray(value))
  .map(([key, values]) => [key, values.map(globRegex)]));
const allowed = (group, value) => (allowPatterns[group] || []).some((pattern) => pattern.test(slash(value)));

function ignoredDirectory(name) {
  return ASSET_AUDIT_CONFIG.ignoredDirectoryNames.includes(name);
}

async function walk(start, files, directories) {
  let details;
  try { details = await stat(start); } catch { return; }
  if (details.isFile()) {
    files.push(start);
    return;
  }
  if (!details.isDirectory() || ignoredDirectory(start.split(/[\\/]/).at(-1))) return;
  directories.push(start);
  for (const entry of await readdir(start, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectory(entry.name)) continue;
    await walk(join(start, entry.name), files, directories);
  }
}

const repositoryFiles = [];
const repositoryDirectories = [];
await walk(ROOT, repositoryFiles, repositoryDirectories);
const fileByLowercase = new Map(repositoryFiles.map((file) => [projectPath(file).toLowerCase(), projectPath(file)]));
const directoryByLowercase = new Map(repositoryDirectories.map((directory) => [projectPath(directory).toLowerCase(), projectPath(directory)]));

const sourceFiles = [];
for (const entry of ASSET_AUDIT_CONFIG.sourceEntries) {
  const absolute = join(ROOT, entry);
  if (!existsSync(absolute)) continue;
  await walk(absolute, sourceFiles, []);
}
const textFiles = [...new Set(sourceFiles)]
  .filter((file) => ASSET_AUDIT_CONFIG.textExtensions.includes(extname(file).toLowerCase()))
  .filter((file) => !projectPath(file).startsWith("assets/vendor/"));

const report = {
  generatedAt: new Date().toISOString(),
  mode: modeArgument,
  summary: {
    scannedFiles: textFiles.length,
    totalGames: GAMES.length,
    activeGames: ACTIVE_GAMES.length,
    checkedRoutes: 0,
    browserRouteAudit: false,
    errors: 0,
    warnings: 0
  },
  missingIcons: [],
  brokenGameRoutes: [],
  duplicateIds: [],
  unusedImages: [],
  largeFiles: [],
  mediaFiles: [],
  caseErrors: [],
  missingReferences: [],
  httpErrors: [],
  duplicateLibraries: [],
  missingDimensions: [],
  lazyLoadingWarnings: [],
  duplicateAssetPaths: [],
  performanceWarnings: [],
  fixedChecks: []
};

const errorKeys = new Set(["missingIcons", "brokenGameRoutes", "duplicateIds", "caseErrors", "missingReferences", "httpErrors", "duplicateLibraries"]);
const informationalKeys = new Set(["mediaFiles", "fixedChecks"]);
function add(category, item) {
  const list = report[category];
  const signature = JSON.stringify(item);
  if (!list.some((entry) => JSON.stringify(entry) === signature)) list.push(item);
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function isLocalReference(value) {
  const raw = String(value || "").trim();
  return Boolean(raw)
    && !/^(?:[a-z]+:)?\/\//i.test(raw)
    && !/^[a-z][a-z0-9+.-]*:/i.test(raw)
    && !raw.startsWith("#")
    && !raw.includes("${");
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function extractReferences(source, text) {
  const found = [];
  const push = (raw, kind, index) => {
    const value = String(raw || "").trim();
    if (!isLocalReference(value)) return;
    if (kind === "js-import" && !value.startsWith(".") && !value.startsWith("/")) return;
    found.push({ source, raw: value, kind, line: lineNumber(text, index) });
  };
  const extension = "(?:png|jpe?g|webp|avif|svg|gif|css|m?js|jsx|json|webmanifest|html?|pdf|mp3|wav|ogg|woff2?|ttf|otf)";

  if (/\.html?$/.test(source)) {
    for (const match of text.matchAll(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi)) push(match[3], `html-${match[1].toLowerCase()}`, match.index);
    for (const match of text.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) {
      for (const candidate of match[2].split(",")) push(candidate.trim().split(/\s+/)[0], "html-srcset", match.index);
    }
  }
  if (/\.css$/.test(source)) {
    for (const match of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) push(match[2], "css-url", match.index);
  }
  if (/\.(?:m?js|jsx)$/.test(source)) {
    for (const match of text.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) push(match[1], "js-import", match.index);
    for (const match of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) push(match[1], "js-import", match.index);
  }
  const literalPattern = new RegExp(`["'\\x60]((?:(?:\\.\\./)+|\\./|/)?(?:assets|games|data|partials|content)/[^\\s"'\\x60(),}]+?\\.${extension}(?:\\?[^\\s"'\\x60(),}]*)?)["'\\x60]`, "gi");
  for (const match of text.matchAll(literalPattern)) push(match[1], "literal", match.index);
  const seen = new Set();
  return found.filter((reference) => {
    const key = reference.raw;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveReference(reference) {
  const raw = reference.raw.trim();
  if (raw.startsWith("?")) return { expected: "index.html", actual: fileByLowercase.get("index.html") };
  const withoutHash = raw.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  if (!withoutQuery) return { expected: "index.html", actual: fileByLowercase.get("index.html") };
  let value = safeDecode(withoutQuery).replaceAll("\\", "/");
  const source = slash(reference.source);
  const sourceDirectory = slash(dirname(source));
  const rootLike = value.replace(/^\.\//, "");
  let candidate;

  if (value.startsWith("/")) {
    candidate = value.slice(1);
    const gameRoot = source.match(/^(games\/[^/]+)\//)?.[1];
    const gameCandidate = gameRoot ? slash(join(gameRoot, candidate)) : null;
    if (gameCandidate && (fileByLowercase.has(gameCandidate.toLowerCase()) || directoryByLowercase.has(gameCandidate.toLowerCase()))) candidate = gameCandidate;
  } else if (reference.kind === "css-url" || reference.kind === "js-import") {
    candidate = slash(normalize(join(sourceDirectory, value)));
  } else if (source.startsWith("partials/") || (source.startsWith("data/") && value.startsWith("./"))) {
    candidate = rootLike;
  } else if (reference.kind === "literal" && /^(?:assets|games|data|partials|content)\//.test(rootLike)) {
    const localCandidate = slash(normalize(join(sourceDirectory, value)));
    const localExists = fileByLowercase.has(localCandidate.toLowerCase()) || directoryByLowercase.has(localCandidate.toLowerCase());
    candidate = source.startsWith("games/") && localExists ? localCandidate : rootLike;
  } else if (value.startsWith("./") || value.startsWith("../")) {
    candidate = slash(normalize(join(sourceDirectory, value)));
  } else if (/^(?:assets|games|css|data|partials|content)\//.test(rootLike)) {
    candidate = rootLike;
  } else {
    candidate = slash(normalize(join(sourceDirectory, value)));
  }

  candidate = candidate.replace(/^\.\//, "");
  if (raw.endsWith("/") || directoryByLowercase.has(candidate.toLowerCase())) candidate = `${candidate.replace(/\/$/, "")}/index.html`;
  return { expected: candidate, actual: fileByLowercase.get(candidate.toLowerCase()) };
}

const references = [];
const sourceText = new Map();
for (const file of textFiles) {
  const source = projectPath(file);
  const text = await readFile(file, "utf8");
  sourceText.set(source, text);
  references.push(...extractReferences(source, text));
}

const referencedFiles = new Set();
const pathsByPhysicalFile = new Map();
for (const reference of references) {
  if (allowed("referenceIgnore", reference.raw)) continue;
  const resolvedReference = resolveReference(reference);
  if (!resolvedReference.expected || /[*{}()]/.test(resolvedReference.expected)) continue;
  if (!resolvedReference.actual) {
    add("missingReferences", { source: reference.source, line: reference.line, path: reference.raw, expected: resolvedReference.expected });
    continue;
  }
  referencedFiles.add(resolvedReference.actual);
  if (resolvedReference.actual !== resolvedReference.expected) {
    add("caseErrors", { source: reference.source, line: reference.line, path: reference.raw, expected: resolvedReference.actual });
  }
  const rawSet = pathsByPhysicalFile.get(resolvedReference.actual) || new Set();
  rawSet.add(reference.raw.split(/[?#]/)[0]);
  pathsByPhysicalFile.set(resolvedReference.actual, rawSet);
}

async function validateCatalog() {
  const ids = new Map();
  for (const game of GAMES) {
    for (const field of ["id", "name", "icon", "path", "order", "status"]) {
      if (game[field] === undefined || game[field] === null || game[field] === "") add("brokenGameRoutes", { game: game.id || "(boş)", reason: `Eksik katalog alanı: ${field}` });
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id || "")) add("duplicateIds", { id: game.id, reason: "ID yalnızca küçük harf, rakam ve tire içermeli" });
    ids.set(game.id, (ids.get(game.id) || 0) + 1);
    if (game.status !== "active") continue;

    const icon = slash(game.icon || "");
    const iconActual = fileByLowercase.get(icon.toLowerCase());
    if (!/\.(png|jpe?g|webp|avif|svg)$/i.test(icon) || !iconActual) {
      add("missingIcons", { game: game.id, expected: icon, reason: "İkon bulunamadı veya uzantı desteklenmiyor" });
    } else {
      referencedFiles.add(iconActual);
      if (iconActual !== icon) add("caseErrors", { source: "data/games.js", path: icon, expected: iconActual });
      const iconFile = repositoryFiles.find((file) => projectPath(file) === iconActual);
      if (iconFile && (await stat(iconFile)).size === 0) add("missingIcons", { game: game.id, expected: icon, reason: "İkon 0 byte" });
    }

    if (game.path.startsWith("?")) {
      if (!fileByLowercase.has("index.html")) add("brokenGameRoutes", { game: game.id, path: game.path, reason: "SPA giriş dosyası bulunamadı" });
    } else {
      const route = slash(safeDecode(game.path)).replace(/^\.\//, "");
      if (!route.endsWith("/")) add("brokenGameRoutes", { game: game.id, path: game.path, reason: "Klasör rotası slash ile bitmeli" });
      const indexPath = `${route.replace(/\/$/, "")}/index.html`;
      const actual = fileByLowercase.get(indexPath.toLowerCase());
      if (!actual) add("brokenGameRoutes", { game: game.id, path: game.path, reason: "Hedef index.html bulunamadı" });
      else if (actual !== indexPath) add("caseErrors", { source: "data/games.js", path: game.path, expected: dirname(actual) });
    }

    if (game.standalonePath) {
      const standaloneIndex = `${slash(game.standalonePath).replace(/\/$/, "")}/index.html`;
      if (!fileByLowercase.has(standaloneIndex.toLowerCase())) add("brokenGameRoutes", { game: game.id, path: game.standalonePath, reason: "Standalone index.html bulunamadı" });
    }
  }
  for (const [id, count] of ids) if (count > 1) add("duplicateIds", { id, count, reason: "Aynı oyun ID'si birden fazla kullanılmış" });
}
await validateCatalog();

if (runUnused) {
  const imageExtensions = new Set(ASSET_AUDIT_CONFIG.imageExtensions);
  const candidates = repositoryFiles.filter((file) => {
    const value = projectPath(file);
    if (!imageExtensions.has(extname(file).toLowerCase())) return false;
    return value.startsWith("assets/images/")
      || value.startsWith("assets/icons/")
      || value.startsWith("assets/logos/")
      || value.startsWith("assets/branding/")
      || /^games\/[^/]+\/(?:dist\/)?assets\//.test(value)
      || value.startsWith("content/");
  });
  for (const image of candidates) {
    const value = projectPath(image);
    if (!referencedFiles.has(value) && !allowed("unusedIgnore", value)) add("unusedImages", { path: value, size: (await stat(image)).size });
  }
}

if (runPerformance) {
  for (const file of repositoryFiles) {
    const value = projectPath(file);
    const extension = extname(file).toLowerCase();
    if ([".pdf", ".mp4", ".webm", ".mov"].includes(extension)) {
      add("mediaFiles", { path: value, size: (await stat(file)).size, type: extension.slice(1).toUpperCase() });
      continue;
    }
    const limit = fileLimit(value);
    if (!limit) continue;
    const size = (await stat(file)).size;
    if (size > limit[1]) add("largeFiles", { path: value, size, limit: limit[1], type: limit[0], suggestion: "Kaynak dosyayı koruyup WebP/AVIF, palette PNG veya code splitting kullanın." });
  }

  for (const [source, text] of sourceText) {
    if (!/\.(?:html|js|jsx)$/.test(source)) continue;
    for (const match of text.matchAll(/<img\b[^>]*>/gi)) {
      const tag = match[0];
      if (tag.includes("${dimensions}") || tag.includes("data-dynamic-dimensions")) continue;
      if (!/\bwidth\s*=/.test(tag) || !/\bheight\s*=/.test(tag)) add("missingDimensions", { source, line: lineNumber(text, match.index), snippet: tag.replace(/\s+/g, " ").slice(0, 180) });
      if (/loading\s*=\s*["']lazy["']/.test(tag) && /fetchpriority\s*=\s*["']high["']/.test(tag)) add("lazyLoadingWarnings", { source, line: lineNumber(text, match.index), reason: "Aynı görsel hem lazy hem high priority" });
    }
  }

  const indexText = sourceText.get("index.html") || "";
  for (const icon of ASSET_AUDIT_CONFIG.criticalGamePreloads) {
    const expression = new RegExp(`<link[^>]+rel=["']preload["'][^>]+href=["']\\.?/?${icon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i");
    if (!expression.test(indexText)) add("performanceWarnings", { path: icon, reason: "İlk launcher görünümündeki kritik ikon preload edilmiyor" });
  }
  const oyunSource = sourceText.get("js/pages/oyun-page.js") || "";
  if (!oyunSource.includes("visibleIconCount") || !oyunSource.includes('fetchpriority="${isPriority ? "high" : "low"}')) add("performanceWarnings", { path: "js/pages/oyun-page.js", reason: "Viewport tabanlı eager/lazy ikon politikası bulunamadı" });
  const routerSource = sourceText.get("js/core/router.js") || "";
  if (!routerSource.includes('import("../pages/oyun-page.js')) add("performanceWarnings", { path: "js/core/router.js", reason: "Oyun rotası dinamik import ile yüklenmiyor" });

  for (const [physicalPath, rawPaths] of pathsByPhysicalFile) {
    if (!/\.(?:png|jpe?g|webp|avif|svg|gif|woff2?|ttf|otf|mp3|wav|ogg)$/i.test(physicalPath)) continue;
    const variants = [...rawPaths].map((value) => value.replace(/^(?:\.\.\/|\.\/)+/, ""));
    if (new Set(variants).size > 1) add("duplicateAssetPaths", { path: physicalPath, references: [...rawPaths] });
  }

  for (const [source, text] of sourceText) {
    if (!/\.html?$/.test(source)) continue;
    const resourceMatches = [...text.matchAll(/<(script|link)\b[^>]+?(?:src|href)\s*=\s*(["'])(.*?)\2[^>]*>/gi)];
    const grouped = new Map();
    for (const match of resourceMatches) {
      const url = match[3].split("#")[0];
      if (!/\.(?:m?js|css)(?:\?|$)/i.test(url)) continue;
      const key = url.replace(/[?&](?:v|ver|version)=[^&]+/gi, "").toLowerCase();
      const entries = grouped.get(key) || [];
      entries.push(url);
      grouped.set(key, entries);
    }
    for (const [library, entries] of grouped) if (entries.length > 1) add("duplicateLibraries", { source, library, references: entries });
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".jsx": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".woff2": "font/woff2", ".woff": "font/woff"
};

function routeUrl(pathValue) {
  const value = String(pathValue || "");
  if (value.startsWith("?")) return `/${value}`;
  return `/${value.replace(/^\.\//, "")}`;
}

async function runHttpAndBrowserAudit() {
  const port = ASSET_AUDIT_CONFIG.routeAuditPort;
  const base = `http://127.0.0.1:${port}`;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, base);
      let pathname = safeDecode(url.pathname);
      let filePath = resolve(ROOT, `.${pathname}`);
      if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) throw new Error("Geçersiz yol");
      let details = await stat(filePath).catch(() => null);
      if (details?.isDirectory()) {
        filePath = join(filePath, "index.html");
        details = await stat(filePath).catch(() => null);
      }
      if (!details && !extname(pathname)) {
        filePath = join(ROOT, "index.html");
        details = await stat(filePath);
      }
      if (!details?.isFile()) throw new Error("Dosya bulunamadı");
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => server.once("error", rejectListen).listen(port, "127.0.0.1", resolveListen));

  const routes = ["/index.html", "/admin.html", "/?page=oyun", "/?page=ravza-books"];
  for (const game of ACTIVE_GAMES) {
    routes.push(routeUrl(game.path));
    if (game.standalonePath) routes.push(routeUrl(game.standalonePath));
  }
  for (const book of RAVZA_BOOKS.filter((item) => item.type === "pdf")) routes.push(routeUrl(book.file));
  const uniqueRoutes = [...new Set(routes)];
  report.summary.checkedRoutes = uniqueRoutes.length;

  try {
    for (const route of uniqueRoutes) {
      try {
        const response = await fetch(`${base}${route}`, { redirect: "manual" });
        if (response.status >= 400) add("httpErrors", { route, status: response.status, source: "HTTP" });
        await response.body?.cancel();
      } catch (error) {
        add("httpErrors", { route, status: "NETWORK", source: "HTTP", message: error.message });
      }
    }

    if (!runBrowserRoutes) return;
    const browser = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    ].find(existsSync);
    if (!browser) {
      add("performanceWarnings", { path: "browser", reason: "Chromium bulunamadığı için tarayıcı route denetimi atlandı" });
      return;
    }
    report.summary.browserRouteAudit = true;

    const profile = join(tmpdir(), `ravza-asset-audit-${Date.now()}`);
    const debugPort = port + 100;
    const process = spawn(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    let socket;
    try {
      let target;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
          const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
          target = targets.find((entry) => entry.type === "page");
          if (target) break;
        } catch { /* Chromium başlatılıyor. */ }
        await delay(100);
      }
      if (!target) throw new Error("Chromium debug hedefi açılamadı");
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolveOpen, rejectOpen) => {
        socket.addEventListener("open", resolveOpen, { once: true });
        socket.addEventListener("error", rejectOpen, { once: true });
      });
      let requestId = 0;
      const pending = new Map();
      let activeRoute = "";
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.method === "Network.responseReceived") {
          const response = message.params.response;
          if (response.url.startsWith(base) && response.status >= 400) add("httpErrors", { route: activeRoute, resource: response.url, status: response.status, source: "Browser" });
        }
        if (message.method === "Network.loadingFailed" && message.params.errorText?.includes("ERR_FILE_NOT_FOUND")) add("httpErrors", { route: activeRoute, resource: message.params.requestId, status: message.params.errorText, source: "Browser" });
        if (message.method === "Runtime.exceptionThrown") add("httpErrors", { route: activeRoute, status: "JS_EXCEPTION", source: "Browser", message: message.params.exceptionDetails.text });
        if (!message.id || !pending.has(message.id)) return;
        const callbacks = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) callbacks.reject(new Error(message.error.message));
        else callbacks.resolve(message.result);
      });
      const command = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
        const id = ++requestId;
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
        socket.send(JSON.stringify({ id, method, params }));
      });
      await command("Page.enable");
      await command("Runtime.enable");
      await command("Network.enable");
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
      const browserRoutes = uniqueRoutes.filter((route) => !/\.pdf(?:\?|$)/i.test(route));
      for (const route of browserRoutes) {
        activeRoute = route;
        await command("Page.navigate", { url: `${base}${route}` });
        await delay(ASSET_AUDIT_CONFIG.routeWaitMs);
      }
    } finally {
      socket?.close();
      await new Promise((resolveExit) => {
        if (process.exitCode !== null || process.signalCode !== null) return resolveExit();
        process.once("exit", resolveExit);
        process.kill();
        setTimeout(resolveExit, 2000);
      });
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

if (runRoutes) await runHttpAndBrowserAudit();

for (const key of Object.keys(report)) {
  if (!Array.isArray(report[key])) continue;
  if (errorKeys.has(key)) report.summary.errors += report[key].length;
  else if (!informationalKeys.has(key)) report.summary.warnings += report[key].length;
}

const markdownSections = [
  ["Eksik ikonlar", "missingIcons"], ["Bozuk oyun rotaları", "brokenGameRoutes"], ["Tekrarlanan/geçersiz ID'ler", "duplicateIds"],
  ["Kullanılmayan görseller", "unusedImages"], ["Büyük dosyalar", "largeFiles"], ["Video ve PDF dosyaları", "mediaFiles"],
  ["Case-sensitive hatalar", "caseErrors"], ["Statik 404 kaynaklar", "missingReferences"], ["HTTP/tarayıcı hataları", "httpErrors"],
  ["Tekrarlanan kütüphaneler", "duplicateLibraries"], ["Eksik width/height", "missingDimensions"], ["Lazy-loading uyarıları", "lazyLoadingWarnings"],
  ["Aynı asset için farklı yollar", "duplicateAssetPaths"], ["Performans uyarıları", "performanceWarnings"]
];
const markdown = [
  "# RavzaYusuf Asset Denetim Raporu",
  "",
  `- Oluşturulma: ${report.generatedAt}`,
  `- Mod: ${report.mode}`,
  `- Taranan metin dosyası: ${report.summary.scannedFiles}`,
  `- Oyun: ${report.summary.totalGames} (${report.summary.activeGames} aktif)`,
  `- HTTP rotası: ${report.summary.checkedRoutes}`,
  `- Chromium rota denetimi: ${report.summary.browserRouteAudit ? "çalıştı" : "ayrı audit:routes komutunda çalışır"}`,
  `- Kritik hata: ${report.summary.errors}`,
  `- Uyarı: ${report.summary.warnings}`,
  ""
];
for (const [title, key] of markdownSections) {
  markdown.push(`## ${title}`, "");
  const entries = report[key];
  if (!entries.length) markdown.push("- Bulunmadı.", "");
  else {
    for (const entry of entries) {
      const display = { ...entry };
      if (display.size !== undefined) display.size = bytes(display.size);
      if (display.limit !== undefined) display.limit = bytes(display.limit);
      markdown.push(`- ${Object.entries(display).map(([name, value]) => `**${name}:** ${Array.isArray(value) ? value.join(", ") : value}`).join(" · ")}`);
    }
    markdown.push("");
  }
}

await mkdir(dirname(join(ROOT, ASSET_AUDIT_CONFIG.reportJson)), { recursive: true });
await writeFile(join(ROOT, ASSET_AUDIT_CONFIG.reportJson), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(join(ROOT, ASSET_AUDIT_CONFIG.reportMarkdown), `${markdown.join("\n")}\n`, "utf8");

output(`[asset-audit] ${report.summary.scannedFiles} dosya, ${report.summary.totalGames} oyun`);
output(`[asset-audit] ${report.summary.errors} kritik hata, ${report.summary.warnings} uyarı`);
output(`[asset-audit] Rapor: ${ASSET_AUDIT_CONFIG.reportMarkdown}`);
if (report.summary.errors > 0) process.exitCode = 1;
