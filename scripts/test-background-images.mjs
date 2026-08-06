import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = (process.env.RAVZA_TEST_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const ARTIFACT_DIR = join(ROOT, "test-artifacts", "background-images");
const QUICK = process.argv.includes("--quick");
const LOCAL_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//;
const IMAGE_URL = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;

const BROWSER_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const browserPath = BROWSER_PATHS.find(existsSync);

const VIEWPORTS = QUICK
  ? [
      { name: "desktop", width: 1366, height: 768 },
      { name: "mobile", width: 390, height: 844 },
    ]
  : [
      { name: "desktop-xl", width: 1920, height: 1080 },
      { name: "desktop", width: 1366, height: 768 },
      { name: "tablet-landscape", width: 1024, height: 768 },
      { name: "tablet-portrait", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
      { name: "mobile-small", width: 360, height: 800 },
    ];

const ROUTES = [
  { name: "Ana Sayfa", route: "ana-sayfa", root: "#dashboard", ready: ".launcher-home-content", raster: "/assets/ana-sayfa/optimized/" },
  { name: "RavzaLingo", route: "ravzalingo", root: "#ravzalingo", ready: ".rlz5-shell", raster: "/assets/calisma-bolumu/optimized/ravzalingo-" },
  { name: "Kahoot", route: "kahoot", root: "#kahoot", ready: "#kahootRoot > *" },
  { name: "Çalışma Merkezi", route: "calisma-merkezi", root: "#studyhub", ready: "#studyHubGrid", raster: "/assets/calisma-bolumu/optimized/calisma-merkezi-" },
  { name: "Konu Detayı", route: "konu-detay", root: "#studydetail", ready: "#studyDetailContent > *", raster: "/assets/calisma-bolumu/optimized/calisma-detay-" },
  { name: "Ezber Merkezi", route: "ezber-merkezi", root: "#memoryhub", ready: "#memoryPracticeSection" },
  { name: "Boşluk Doldurma", route: "bosluk-doldurma", root: "#fillgaphub", ready: ".fill-gap-hero" },
  { name: "Quiz Merkezi", route: "quiz-merkezi", root: "#quizhub", ready: "#quizHubGrid", raster: "/assets/calisma-bolumu/optimized/bilgi-yarismasi-" },
  { name: "Quiz Çöz", route: "quiz-coz", root: "#quizdetail", ready: "#quizDetailContent > *" },
  { name: "Sınav Merkezi", route: "sinav-merkezi", root: "#examcenter", ready: ".exam-pro-shell" },
  { name: "Sınav Çöz", route: "sinav-coz", root: "#sinavcoz", ready: "#examSolveRoot > *" },
  { name: "Hızlı Tekrar", route: "hizli-tekrar", root: "#recap", ready: ".recap-toolbar" },
  { name: "Birinci Sınıf", route: "birinci-sinif", root: "#grade1", ready: "#grade1 h2", allowGlobalSurface: true },
  { name: "İkinci Sınıf", route: "ikinci-sinif", root: "#grade2", ready: "#grade2 h2", allowGlobalSurface: true },
  { name: "Ravza Books", route: "ravza-books", root: "#ravzabooks", ready: ".library-view" },
  { name: "Oyun Alanı", route: "oyun", root: "#games", ready: "[data-game-catalog]", raster: "/assets/oyun-bolumu/optimized/oyun-merkezi-desktop.webp" },
];

const EMBEDDED_GAMES = [
  { name: "Candy Crush", gameId: "candy-match" },
  { name: "Meyve Eşleştirme", gameId: "fruit-match" },
  { name: "Flappy Bird", gameId: "flappy-bird" },
  { name: "Boyama", gameId: "boyama" },
  { name: "Renk Sıralama", gameId: "renk-siralama" },
  { name: "Sudoku", gameId: "sudoku", allowGlobalSurface: true },
];

const STANDALONE_GAMES = [
  { name: "Şans Çarkı", path: "/games/cark-oyunu/", root: "body", ready: ".wheel-app" },
  { name: "Alan Bulmacası", path: "/games/alan-bulmacasi/", root: "body", ready: ".game-shell" },
  { name: "Ok Bulmacası", path: "/games/ok-bulmacasi/", root: "body", ready: "#screenHome", allowGlobalSurface: true },
];

assert.ok(browserPath, "Chrome veya Edge bulunamadı.");
await fetch(`${BASE_URL}/health`).then((response) => assert.equal(response.ok, true, `${BASE_URL}/health yanıt vermedi.`));

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function availablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

const debugPort = await availablePort();
const profile = resolve(tmpdir(), `ravza-background-images-${Date.now()}`);
assert.ok(profile.startsWith(`${resolve(tmpdir())}${sep}`), "Geçici tarayıcı profili güvenli dizinde değil.");
const browser = spawn(browserPath, [
  "--headless=new",
  "--enable-gpu-rasterization",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

async function findPageTarget() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((entry) => entry.type === "page");
      if (target) return target;
    } catch {
      // Chromium debug endpoint is still starting.
    }
    await delay(100);
  }
  throw new Error("Chromium debug hedefi açılamadı.");
}

const target = await findPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let commandId = 0;
const pendingCommands = new Map();
const requestUrls = new Map();
let activeCase = "başlangıç";
let consoleErrors = [];
let consoleWarnings = [];
let imageNetworkErrors = [];
let localNetworkErrors = [];
let requestedUrls = [];

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    addUnique(consoleErrors, details.exception?.description || details.text || "JavaScript istisnası");
  }
  if (message.method === "Runtime.consoleAPICalled") {
    const text = message.params.args.map((entry) => entry.value ?? entry.description ?? "").join(" ").trim();
    if (message.params.type === "error") addUnique(consoleErrors, text);
    if (message.params.type === "warning") addUnique(consoleWarnings, text);
  }
  if (message.method === "Log.entryAdded") {
    const entry = message.params.entry;
    if (entry.level === "error") addUnique(consoleErrors, entry.text);
    if (entry.level === "warning") addUnique(consoleWarnings, entry.text);
  }
  if (message.method === "Network.requestWillBeSent") {
    requestUrls.set(message.params.requestId, message.params.request.url);
    requestedUrls.push(message.params.request.url);
  }
  if (message.method === "Network.responseReceived") {
    const response = message.params.response;
    if (LOCAL_URL.test(response.url) && response.status >= 400) {
      addUnique(localNetworkErrors, `${response.status} ${response.url}`);
      if (message.params.type === "Image" || IMAGE_URL.test(response.url)) {
        addUnique(imageNetworkErrors, `${response.status} ${response.url}`);
      }
    }
  }
  if (message.method === "Network.loadingFailed" && !message.params.canceled) {
    const url = requestUrls.get(message.params.requestId) || "bilinmeyen istek";
    if (LOCAL_URL.test(url) && message.params.errorText !== "net::ERR_ABORTED") {
      addUnique(localNetworkErrors, `${message.params.errorText}: ${url}`);
      if (message.params.type === "Image" || IMAGE_URL.test(url)) {
        addUnique(imageNetworkErrors, `${message.params.errorText}: ${url}`);
      }
    }
  }
  if (!message.id || !pendingCommands.has(message.id)) return;
  const handlers = pendingCommands.get(message.id);
  pendingCommands.delete(message.id);
  if (message.error) handlers.reject(new Error(`${activeCase}: ${message.error.message}`));
  else handlers.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => pendingCommands.set(id, { resolve: resolveCommand, reject: rejectCommand }));
}

async function evaluate(expression) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Tarayıcı değerlendirme hatası");
      return result.result.value;
    } catch (error) {
      if (attempt === 4 || !/context|Inspected target navigated|Cannot find/i.test(error.message)) throw error;
      await delay(120);
    }
  }
  return undefined;
}

function clearDiagnostics(label) {
  activeCase = label;
  consoleErrors = [];
  consoleWarnings = [];
  imageNetworkErrors = [];
  localNetworkErrors = [];
  requestedUrls = [];
  requestUrls.clear();
}

async function setViewport(viewport) {
  await command("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 768,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
}

async function navigateToNewDocument(action, label) {
  const previousTimeOrigin = await evaluate("performance.timeOrigin").catch(() => null);
  await action();
  if (Number.isFinite(previousTimeOrigin)) {
    await waitFor(
      `performance.timeOrigin !== ${JSON.stringify(previousTimeOrigin)}`,
      `${label} / yeni dokuman`,
    );
  }
}

async function waitFor(expression, label, timeout = 20000) {
  const startedAt = Date.now();
  let value = null;
  while (Date.now() - startedAt < timeout) {
    value = await evaluate(expression).catch(() => null);
    if (value) return Date.now() - startedAt;
    await delay(120);
  }
  throw new Error(`${label}: hazır durum zaman aşımına uğradı. Son değer: ${JSON.stringify(value)}`);
}

function routeReadyExpression(definition) {
  return `(() => {
    const root = document.querySelector(${JSON.stringify(definition.root)});
    const ready = document.querySelector(${JSON.stringify(definition.ready)});
    const rect = root?.getBoundingClientRect();
    const style = root ? getComputedStyle(root) : null;
    return Boolean(globalThis.__APP_STARTUP_STATE__?.completed
      && document.body?.dataset.currentRoute === ${JSON.stringify(definition.route)}
      && root?.classList.contains('active')
      && ready
      && rect?.width > 1
      && rect?.height > 1
      && style?.display !== 'none'
      && style?.visibility !== 'hidden'
      && Number(style?.opacity) > .01);
  })()`;
}

function embeddedReadyExpression() {
  return `(() => {
    const stage = document.getElementById('gameStage');
    const body = document.getElementById('gameStageBody');
    const frames = [...(body?.querySelectorAll('iframe') || [])];
    return Boolean(stage && !stage.hidden && body?.children.length
      && frames.every((frame) => frame.contentDocument?.readyState === 'complete'));
  })()`;
}

function browserVisualProbe(rootSelector, scopeMode, allowGlobalSurface) {
  const mainDocument = document;
  let scopeDocument = mainDocument;
  let root = mainDocument.querySelector(rootSelector);
  if (scopeMode === "embedded") {
    const host = mainDocument.getElementById("gameStageBody");
    const frame = host?.querySelector("iframe");
    if (frame?.contentDocument?.body) {
      scopeDocument = frame.contentDocument;
      root = scopeDocument.body;
    } else {
      root = host;
    }
  }
  if (!root) return { rootFound: false };

  const view = scopeDocument.defaultView;
  const rootRect = root.getBoundingClientRect();
  const rootStyle = view.getComputedStyle(root);
  const rendered = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    for (let current = element; current; current = current.parentElement) {
      const style = view.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= .01) return false;
    }
    return true;
  };
  const elementName = (element, pseudo = "") => {
    const id = element.id ? `#${element.id}` : "";
    const className = [...element.classList].slice(0, 2).map((name) => `.${name}`).join("");
    return `${element.tagName.toLowerCase()}${id}${className}${pseudo}`;
  };
  const urlPattern = /url\((?:"([^"]*)"|'([^']*)'|([^\)]*))\)/g;
  const backgroundEntries = [];
  const backgroundUrls = new Set();
  const colorSurfaces = [];
  const candidates = [root, ...root.querySelectorAll("*")].slice(0, 3000);
  if (allowGlobalSurface && root !== scopeDocument.body) candidates.push(scopeDocument.body);

  for (const element of candidates) {
    if (!rendered(element)) continue;
    for (const pseudo of ["", "::before", "::after"]) {
      const style = view.getComputedStyle(element, pseudo || null);
      const backgroundImage = style.backgroundImage;
      if (backgroundImage && backgroundImage !== "none") {
        backgroundEntries.push({ element: elementName(element, pseudo), backgroundImage });
        let match;
        urlPattern.lastIndex = 0;
        while ((match = urlPattern.exec(backgroundImage))) backgroundUrls.add(match[1] || match[2] || match[3]);
      }
      const color = style.backgroundColor;
      if (color && color !== "transparent" && !/^rgba\([^\)]*,\s*0\s*\)$/.test(color)) {
        colorSurfaces.push({ element: elementName(element, pseudo), color });
      }
    }
  }

  const images = [...root.querySelectorAll("img")]
    .filter(rendered)
    .map((image) => ({
      src: image.currentSrc || image.src || "",
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));
  const canvases = [...root.querySelectorAll("canvas")]
    .filter(rendered)
    .map((canvas) => ({ width: canvas.width, height: canvas.height }));

  const loadBackground = (url) => new Promise((resolveLoad) => {
    if (!url || /^(?:data:|blob:)/i.test(url)) {
      resolveLoad({ url, loaded: true, naturalWidth: 1, naturalHeight: 1 });
      return;
    }
    const image = new view.Image();
    const timer = view.setTimeout(() => resolveLoad({ url, loaded: false, error: "timeout" }), 8000);
    image.onload = () => {
      view.clearTimeout(timer);
      resolveLoad({ url, loaded: image.naturalWidth > 0, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
    };
    image.onerror = () => {
      view.clearTimeout(timer);
      resolveLoad({ url, loaded: false, error: "decode" });
    };
    image.src = url;
  });

  return Promise.all([...backgroundUrls].map(loadBackground)).then((backgroundLoads) => {
    const revealHidden = [...root.querySelectorAll("[data-reveal]")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const effectiveBottom = view.innerHeight * .92;
      const intersectionHeight = Math.max(0, Math.min(rect.bottom, effectiveBottom) - Math.max(rect.top, 0));
      const intersectionRatio = rect.height > 0 ? intersectionHeight / rect.height : 0;
      return intersectionRatio >= .08 && Number(view.getComputedStyle(element).opacity) <= .01;
    }).length;
    return {
      rootFound: true,
      rootVisible: rendered(root),
      rootRect: { width: Math.round(rootRect.width), height: Math.round(rootRect.height) },
      rootTransform: rootStyle.transform,
      rootOpacity: rootStyle.opacity,
      backgroundEntries: backgroundEntries.slice(0, 160),
      backgroundLoads,
      images,
      canvases,
      colorSurfaces: colorSurfaces.slice(0, 80),
      revealHidden,
      horizontalOverflow: Math.max(0, scopeDocument.documentElement.scrollWidth - scopeDocument.documentElement.clientWidth),
    };
  });
}

async function probeVisual(definition, scopeMode = "main") {
  const rootSelector = scopeMode === "embedded" ? "#gameStageBody" : definition.root;
  return evaluate(`(${browserVisualProbe.toString()})(${JSON.stringify(rootSelector)}, ${JSON.stringify(scopeMode)}, ${Boolean(definition.allowGlobalSurface)})`);
}

function assertDiagnostics(label) {
  assert.deepEqual(consoleErrors, [], `${label}: konsol hataları:\n${consoleErrors.join("\n")}`);
  assert.deepEqual(consoleWarnings, [], `${label}: konsol uyarıları:\n${consoleWarnings.join("\n")}`);
  assert.deepEqual(imageNetworkErrors, [], `${label}: görsel network hataları:\n${imageNetworkErrors.join("\n")}`);
  assert.deepEqual(localNetworkErrors, [], `${label}: yerel network hataları:\n${localNetworkErrors.join("\n")}`);
}

function assertVisual(label, definition, snapshot, scopeMode) {
  assert.equal(snapshot.rootFound, true, `${label}: görsel kök bulunamadı.`);
  assert.equal(snapshot.rootVisible, true, `${label}: uygulama kökü görünür değil.`);
  assert.ok(snapshot.rootRect.width > 1 && snapshot.rootRect.height > 1, `${label}: uygulama kökü sıfır boyutlu.`);
  assert.ok(snapshot.horizontalOverflow <= 2, `${label}: ${snapshot.horizontalOverflow}px yatay taşma var.`);
  assert.equal(snapshot.revealHidden, 0, `${label}: viewport içinde opacity:0 kalan reveal öğesi var.`);
  if (scopeMode === "main") assert.equal(snapshot.rootTransform, "none", `${label}: aktif page transformu kalıcı kaldı: ${snapshot.rootTransform}`);

  const brokenBackgrounds = snapshot.backgroundLoads.filter((entry) => !entry.loaded || entry.naturalWidth < 1);
  assert.deepEqual(brokenBackgrounds, [], `${label}: decode edilemeyen CSS background var: ${JSON.stringify(brokenBackgrounds)}`);
  const brokenImages = snapshot.images.filter((entry) => !entry.complete || entry.naturalWidth < 1 || entry.naturalHeight < 1);
  assert.deepEqual(brokenImages, [], `${label}: görünür fakat yüklenmemiş img var: ${JSON.stringify(brokenImages)}`);

  const rasterUrls = [
    ...snapshot.backgroundLoads.map((entry) => entry.url),
    ...snapshot.images.map((entry) => entry.src),
  ];
  if (definition.raster) {
    assert.ok(rasterUrls.some((url) => url.includes(definition.raster)), `${label}: beklenen raster bulunamadı: ${definition.raster}`);
  }
  const hasVisualSurface = snapshot.backgroundEntries.length > 0
    || snapshot.images.length > 0
    || snapshot.canvases.some((canvas) => canvas.width > 1 && canvas.height > 1)
    || (definition.allowGlobalSurface && snapshot.colorSurfaces.length > 0);
  assert.equal(hasVisualSurface, true, `${label}: background/hero/canvas/solid yüzey bulunamadı.`);
  assertDiagnostics(label);
}

function resultRecord(definition, viewport, phase, snapshot, scopeMode) {
  const rasterUrls = [...new Set([
    ...snapshot.backgroundLoads.map((entry) => entry.url).filter(Boolean),
    ...snapshot.images.map((entry) => entry.src).filter(Boolean),
  ])];
  return {
    application: definition.name,
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    phase,
    scopeMode,
    root: snapshot.rootRect,
    rootTransform: snapshot.rootTransform,
    backgroundCount: snapshot.backgroundEntries.length,
    decodedBackgroundCount: snapshot.backgroundLoads.filter((entry) => entry.loaded).length,
    visibleImageCount: snapshot.images.length,
    canvasCount: snapshot.canvases.length,
    solidSurfaceCount: snapshot.colorSurfaces.length,
    rasterUrls,
    consoleErrors: [...consoleErrors],
    consoleWarnings: [...consoleWarnings],
    imageNetworkErrors: [...imageNetworkErrors],
    localNetworkErrors: [...localNetworkErrors],
  };
}

async function openRoute(definition, viewport, phase, results) {
  const label = `${definition.name} / ${viewport.name} / ${phase}`;
  clearDiagnostics(label);
  if (phase === "direct") {
    await navigateToNewDocument(
      () => command("Page.navigate", { url: `${BASE_URL}/?page=${definition.route}&background-test=${Date.now()}-${viewport.name}` }),
      label,
    );
  } else {
    await navigateToNewDocument(() => command("Page.reload", { ignoreCache: false }), label);
  }
  await waitFor(routeReadyExpression(definition), label);
  await delay(650);
  const snapshot = await probeVisual(definition, "main");
  assertVisual(label, definition, snapshot, "main");
  results.push(resultRecord(definition, viewport, phase, snapshot, "main"));
}

async function waitForGamesRoute(label) {
  const gamesRoute = ROUTES.find((definition) => definition.route === "oyun");
  await waitFor(routeReadyExpression(gamesRoute), label);
}

async function openEmbeddedGame(definition, viewport, phase, results) {
  const label = `${definition.name} / ${viewport.name} / ${phase}`;
  clearDiagnostics(label);
  if (phase === "direct") {
    await navigateToNewDocument(
      () => command("Page.navigate", { url: `${BASE_URL}/?page=oyun&background-game=${definition.gameId}-${Date.now()}` }),
      label,
    );
  } else {
    await navigateToNewDocument(() => command("Page.reload", { ignoreCache: false }), label);
  }
  await waitForGamesRoute(label);
  // Route DOM'u body.currentRoute'dan hemen sonra gorunebilir; oyun katalogu ve
  // click listener'lari initOyun'un ayni senkron turunda kurulur. Katalog hazir
  // olmadan optional-chain ile click etmek sessiz bir no-op olup testi flake
  // yapiyordu. Gercek interaktif tile'i bekle ve tiklamayi dogrula.
  const gameSelector = `#games[data-games-ready="true"] [data-game="${definition.gameId}"]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(gameSelector)}))`, label);
  assert.equal(await evaluate(`(() => {
    const trigger = document.querySelector(${JSON.stringify(gameSelector)});
    if (!trigger) return false;
    trigger.click();
    return true;
  })()`), true, `${label}: oyun kutusu tiklanamadi`);
  await waitFor(embeddedReadyExpression(), label, 25000);
  await delay(650);
  const snapshot = await probeVisual(definition, "embedded");
  assertVisual(label, definition, snapshot, "embedded");
  results.push(resultRecord(definition, viewport, phase, snapshot, "embedded"));
}

async function openStandaloneGame(definition, viewport, phase, results) {
  const label = `${definition.name} / ${viewport.name} / ${phase}`;
  clearDiagnostics(label);
  if (phase === "direct") {
    await navigateToNewDocument(
      () => command("Page.navigate", { url: `${BASE_URL}${definition.path}?background-test=${Date.now()}-${viewport.name}` }),
      label,
    );
  } else {
    await navigateToNewDocument(() => command("Page.reload", { ignoreCache: false }), label);
  }
  await waitFor(`(() => {
    const root = document.querySelector(${JSON.stringify(definition.root)});
    const ready = document.querySelector(${JSON.stringify(definition.ready)});
    const rect = ready?.getBoundingClientRect();
    const style = ready ? getComputedStyle(ready) : null;
    return Boolean(document.readyState === 'complete' && root && ready && rect?.width > 1 && rect?.height > 1
      && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity) > .01);
  })()`, label);
  await delay(650);
  const snapshot = await probeVisual(definition, "standalone");
  assertVisual(label, definition, snapshot, "standalone");
  results.push(resultRecord(definition, viewport, phase, snapshot, "standalone"));
}

function renderMarkdown(report) {
  const lines = [
    "# Runtime background/hero doğrulaması",
    "",
    `- Başlangıç: ${report.startedAt}`,
    `- Bitiş: ${report.finishedAt}`,
    `- Uygulama: ${report.applicationCount}`,
    `- Viewport: ${report.viewports.length}`,
    `- Senaryo: ${report.scenarioCount}`,
    `- Başarılı: ${report.passed}`,
    `- Başarısız: ${report.failed}`,
    "",
    "| Uygulama | Senaryo | Background | Raster | Img | Canvas | Solid | Sonuç |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const summary of report.byApplication) {
    lines.push(`| ${summary.application} | ${summary.scenarios} | ${summary.backgrounds} | ${summary.rasters} | ${summary.images} | ${summary.canvases} | ${summary.solids} | ${summary.status} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const results = [];
const startedAt = new Date().toISOString();
let runError = null;

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Network.enable");

  const firstViewport = VIEWPORTS.find(({ name }) => name === "desktop") || VIEWPORTS[0];
  await setViewport(firstViewport);
  clearDiagnostics("Derin rota öncelik kontrolü");
  const lingo = ROUTES.find(({ route }) => route === "ravzalingo");
  await command("Page.navigate", { url: `${BASE_URL}/?page=ravzalingo&background-priority=${Date.now()}` });
  await waitFor(routeReadyExpression(lingo), activeCase);
  await delay(400);
  assert.equal(requestedUrls.some((url) => url.includes("/assets/ana-sayfa/optimized/")), false, "Derin rotada ilgisiz Ana Sayfa hero preload edildi.");
  assertDiagnostics(activeCase);

  for (const viewport of VIEWPORTS) {
    await setViewport(viewport);
    for (const definition of ROUTES) {
      await openRoute(definition, viewport, "direct", results);
      await openRoute(definition, viewport, "reload", results);
      console.log(`✓ ${definition.name} / ${viewport.name}: direct + reload`);
    }
    for (const definition of EMBEDDED_GAMES) {
      await openEmbeddedGame(definition, viewport, "direct", results);
      await openEmbeddedGame(definition, viewport, "reload", results);
      console.log(`✓ ${definition.name} / ${viewport.name}: direct + reload`);
    }
    for (const definition of STANDALONE_GAMES) {
      await openStandaloneGame(definition, viewport, "direct", results);
      await openStandaloneGame(definition, viewport, "reload", results);
      console.log(`✓ ${definition.name} / ${viewport.name}: direct + reload`);
    }
  }

  const expectedScenarios = (ROUTES.length + EMBEDDED_GAMES.length + STANDALONE_GAMES.length) * VIEWPORTS.length * 2;
  assert.equal(results.length, expectedScenarios, `Senaryo sayısı eksik: ${results.length}/${expectedScenarios}`);
} catch (error) {
  runError = error;
  throw error;
} finally {
  const applications = [...ROUTES, ...EMBEDDED_GAMES, ...STANDALONE_GAMES];
  const byApplication = applications.map((definition) => {
    const entries = results.filter((entry) => entry.application === definition.name);
    return {
      application: definition.name,
      scenarios: entries.length,
      backgrounds: entries.reduce((sum, entry) => sum + entry.backgroundCount, 0),
      rasters: new Set(entries.flatMap((entry) => entry.rasterUrls)).size,
      images: entries.reduce((sum, entry) => sum + entry.visibleImageCount, 0),
      canvases: entries.reduce((sum, entry) => sum + entry.canvasCount, 0),
      solids: entries.reduce((sum, entry) => sum + entry.solidSurfaceCount, 0),
      status: entries.length === VIEWPORTS.length * 2 ? "PASS" : "INCOMPLETE",
    };
  });
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    quick: QUICK,
    applicationCount: ROUTES.length + EMBEDDED_GAMES.length + STANDALONE_GAMES.length,
    viewports: VIEWPORTS,
    scenarioCount: results.length,
    passed: results.length,
    failed: runError ? 1 : 0,
    error: runError?.stack || null,
    byApplication,
    results,
  };
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await Promise.all([
    writeFile(join(ARTIFACT_DIR, "runtime-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(join(ARTIFACT_DIR, "runtime-report.md"), renderMarkdown(report), "utf8"),
  ]);
  socket.close();
  browser.kill();
  await new Promise((resolveExit) => {
    if (browser.exitCode !== null || browser.signalCode !== null) return resolveExit();
    browser.once("exit", resolveExit);
    setTimeout(resolveExit, 2000);
  });
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

console.log(`✓ Background/hero doğrulaması: ${results.length} senaryo, 25 uygulama, ${VIEWPORTS.length} viewport.`);
