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
const ARTIFACT_DIR = join(ROOT, "test-artifacts", "all-applications");
const QUICK = process.argv.includes("--quick");
const BROWSER_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const browserPath = BROWSER_PATHS.find(existsSync);

const VIEWPORTS = QUICK
  ? [{ name: "desktop", width: 1366, height: 768 }, { name: "mobile", width: 390, height: 844 }]
  : [
      { name: "desktop-xl", width: 1920, height: 1080 },
      { name: "desktop", width: 1366, height: 768 },
      { name: "tablet-landscape", width: 1024, height: 768 },
      { name: "tablet-portrait", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
      { name: "mobile-small", width: 360, height: 800 },
    ];

const ROUTES = [
  { name: "Ana Sayfa", route: "ana-sayfa", section: "#dashboard", ready: ".launcher-home-content", items: ".launcher-app", minimumItems: 5 },
  { name: "RavzaLingo", route: "ravzalingo", section: "#ravzalingo", ready: ".rlz5-shell", items: ".rlz5-section", minimumItems: 1 },
  { name: "Kahoot", route: "kahoot", section: "#kahoot", ready: "#kahootRoot > *", items: ".kahoot-category-card", minimumItems: 1 },
  { name: "Çalışma Merkezi", route: "calisma-merkezi", section: "#studyhub", ready: "#studyHubGrid", items: "#studyHubGrid .topic-card", minimumItems: 1 },
  { name: "Konu Detayı", route: "konu-detay", section: "#studydetail", ready: "#studyDetailContent > *", items: "#studyDetailContent > *", minimumItems: 1 },
  { name: "Ezber Merkezi", route: "ezber-merkezi", section: "#memoryhub", ready: "#memoryPracticeSection", items: ".memory-tab-btn", minimumItems: 5 },
  { name: "Boşluk Doldurma", route: "bosluk-doldurma", section: "#fillgaphub", ready: ".fill-gap-hero", items: "#fillGapGrid > *", minimumItems: 1 },
  { name: "Quiz Merkezi", route: "quiz-merkezi", section: "#quizhub", ready: "#quizHubGrid", items: "#quizHubGrid .topic-card", minimumItems: 1 },
  { name: "Quiz Çöz", route: "quiz-coz", section: "#quizdetail", ready: "#quizDetailContent > *", items: "#quizDetailContent > *", minimumItems: 1 },
  { name: "Sınav Merkezi", route: "sinav-merkezi", section: "#examcenter", ready: ".exam-pro-shell", items: ".exam-category-card", minimumItems: 5 },
  { name: "Sınav Çöz", route: "sinav-coz", section: "#sinavcoz", ready: "#examSolveRoot > *", items: "#examSolveRoot > *", minimumItems: 1 },
  { name: "Hızlı Tekrar", route: "hizli-tekrar", section: "#recap", ready: ".recap-toolbar", items: "#recapGrid .flashcard", minimumItems: 1 },
  { name: "Birinci Sınıf", route: "birinci-sinif", section: "#grade1", ready: "#grade1 h2", items: "#grade1 h2", minimumItems: 1 },
  { name: "İkinci Sınıf", route: "ikinci-sinif", section: "#grade2", ready: "#grade2 h2", items: "#grade2 h2", minimumItems: 1 },
  { name: "Ravza Books", route: "ravza-books", section: "#ravzabooks", ready: ".library-view", items: ".library-book-card", minimumItems: 1 },
  { name: "Oyun Alanı", route: "oyun", section: "#games", ready: "[data-game-catalog]", items: ".game-tile", minimumItems: 9 },
];

const STANDALONE_GAMES = [
  { name: "Şans Çarkı", path: "/games/cark-oyunu/", ready: ".wheel-app", items: "#wheelCanvas", minimumItems: 1 },
  { name: "Alan Bulmacası", path: "/games/alan-bulmacasi/", ready: ".game-shell", items: "#gameApp", minimumItems: 1 },
  { name: "Ok Bulmacası", path: "/games/ok-bulmacasi/", ready: "#screenHome", items: "#gameApp", minimumItems: 1 },
];

const EMBEDDED_GAMES = ["candy-match", "fruit-match", "flappy-bird", "boyama", "renk-siralama", "sudoku"];
const DIRECT_VIEWPORTS = QUICK
  ? VIEWPORTS
  : VIEWPORTS.filter(({ name }) => name === "desktop" || name === "mobile");
const LOCAL_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//;

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
const profile = resolve(tmpdir(), `ravza-all-applications-${Date.now()}`);
assert.ok(profile.startsWith(`${resolve(tmpdir())}${sep}`), "Geçici profil güvenli dizinde değil.");
const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
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
      const page = targets.find((entry) => entry.type === "page");
      if (page) return page;
    } catch {
      // Chromium debug portunun açılması bekleniyor.
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
let networkErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    consoleErrors.push(details.exception?.description || details.text || "JavaScript istisnası");
  }
  if (message.method === "Log.entryAdded") {
    const entry = message.params.entry;
    if (entry.level === "error") consoleErrors.push(entry.text);
    if (entry.level === "warning") consoleWarnings.push(entry.text);
  }
  if (message.method === "Network.requestWillBeSent") {
    requestUrls.set(message.params.requestId, message.params.request.url);
  }
  if (message.method === "Network.responseReceived") {
    const response = message.params.response;
    if (LOCAL_URL.test(response.url) && response.status >= 400) networkErrors.push(`${response.status} ${response.url}`);
  }
  if (message.method === "Network.loadingFailed" && !message.params.canceled) {
    const url = requestUrls.get(message.params.requestId) || "bilinmeyen istek";
    if (LOCAL_URL.test(url) && message.params.errorText !== "net::ERR_ABORTED") {
      networkErrors.push(`${message.params.errorText}: ${url}`);
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
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Değerlendirme hatası");
      return result.result.value;
    } catch (error) {
      if (attempt === 4 || !/context|Inspected target navigated|Cannot find/i.test(error.message)) throw error;
      await delay(100);
    }
  }
  return undefined;
}

function clearDiagnostics(label) {
  activeCase = label;
  consoleErrors = [];
  consoleWarnings = [];
  networkErrors = [];
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

function routeProbeExpression(definition) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(definition.section)});
    const ready = document.querySelector(${JSON.stringify(definition.ready)});
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) return false;
      }
      return true;
    };
    return {
      readyState: document.readyState,
      startupComplete: Boolean(globalThis.__APP_STARTUP_STATE__?.completed),
      currentRoute: document.body?.dataset.currentRoute || '',
      active: Boolean(section?.classList.contains('active')),
      sectionVisible: visible(section),
      readyVisible: visible(ready),
      itemCount: document.querySelectorAll(${JSON.stringify(definition.items)}).length,
      textLength: (ready?.textContent || '').replace(/\\s+/g, ' ').trim().length,
      startupFallback: Boolean(document.querySelector('.startup-fallback')),
      startupError: document.querySelector('.startup-error')?.textContent?.trim() || '',
      readerLoading: document.querySelector('.reader-loading')?.textContent?.trim() || '',
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      viewport: { width: innerWidth, height: innerHeight },
    };
  })()`;
}

function standaloneProbeExpression(definition) {
  return `(() => {
    const ready = document.querySelector(${JSON.stringify(definition.ready)});
    const style = ready ? getComputedStyle(ready) : null;
    const rect = ready?.getBoundingClientRect();
    return {
      readyState: document.readyState,
      readyVisible: Boolean(ready && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .01),
      itemCount: document.querySelectorAll(${JSON.stringify(definition.items)}).length,
      textLength: (document.body?.textContent || '').replace(/\\s+/g, ' ').trim().length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  })()`;
}

async function waitForProbe(expression, predicate, timeout = 15000) {
  const startedAt = Date.now();
  let snapshot = null;
  while (Date.now() - startedAt < timeout) {
    snapshot = await evaluate(expression).catch(() => null);
    if (snapshot && predicate(snapshot)) {
      await delay(200);
      return { snapshot: await evaluate(expression), elapsed: Date.now() - startedAt };
    }
    await delay(100);
  }
  return { snapshot, elapsed: Date.now() - startedAt, timedOut: true };
}

function assertDiagnostics(label, snapshot) {
  assert.equal(snapshot.startupFallback, false, `${label}: loading ekranı kapanmadı.`);
  assert.equal(snapshot.startupError, "", `${label}: startup hata ekranı gösterdi.`);
  assert.ok(snapshot.horizontalOverflow <= 2, `${label}: ${snapshot.horizontalOverflow}px yatay taşma var.`);
  assert.deepEqual(consoleErrors, [], `${label}: konsol hataları:\n${consoleErrors.join("\n")}`);
  assert.deepEqual(networkErrors, [], `${label}: yerel network hataları:\n${networkErrors.join("\n")}`);
}

async function waitForRoute(definition, label) {
  const result = await waitForProbe(
    routeProbeExpression(definition),
    (snapshot) => snapshot.startupComplete
      && snapshot.currentRoute === definition.route
      && snapshot.active
      && snapshot.sectionVisible
      && snapshot.readyVisible
      && snapshot.itemCount >= definition.minimumItems
      && !snapshot.startupFallback,
  );
  assert.equal(result.timedOut, undefined, `${label}: rota görünür ve hazır olmadı.\n${JSON.stringify(result.snapshot, null, 2)}`);
  assertDiagnostics(label, result.snapshot);
  return result;
}

async function navigateUrl(url) {
  await command("Page.navigate", { url });
}

async function testSpaRoutes(viewport, results) {
  await setViewport(viewport);
  clearDiagnostics(`Ana Sayfa / ${viewport.name} / başlangıç`);
  await navigateUrl(`${BASE_URL}/?all-apps=${Date.now()}-${viewport.name}`);
  await waitForRoute(ROUTES[0], activeCase);

  for (const definition of ROUTES) {
    const label = `${definition.name} / ${viewport.name} / SPA geçişi`;
    clearDiagnostics(label);
    await evaluate(`window.navigate(${JSON.stringify(definition.route)})`);
    const outcome = await waitForRoute(definition, label);
    results.push({ type: "spa", route: definition.route, viewport: viewport.name, elapsed: outcome.elapsed });
    console.log(`✓ ${label}: ${outcome.elapsed} ms`);
  }
}

async function testDirectAndReload(definition, viewport, results) {
  await setViewport(viewport);
  const directLabel = `${definition.name} / ${viewport.name} / doğrudan URL`;
  clearDiagnostics(directLabel);
  await navigateUrl(`${BASE_URL}/?page=${definition.route}&direct=${Date.now()}-${viewport.name}`);
  const direct = await waitForRoute(definition, directLabel);
  results.push({ type: "direct", route: definition.route, viewport: viewport.name, elapsed: direct.elapsed });
  console.log(`✓ ${directLabel}: ${direct.elapsed} ms`);

  const reloadLabel = `${definition.name} / ${viewport.name} / yenileme`;
  clearDiagnostics(reloadLabel);
  await command("Page.reload", { ignoreCache: false });
  const reload = await waitForRoute(definition, reloadLabel);
  results.push({ type: "reload", route: definition.route, viewport: viewport.name, elapsed: reload.elapsed });
  console.log(`✓ ${reloadLabel}: ${reload.elapsed} ms`);
}

async function waitForExpression(expression, label, timeout = 10000) {
  const result = await waitForProbe(`Boolean(${expression})`, Boolean, timeout);
  assert.equal(result.timedOut, undefined, `${label}: beklenen durum oluşmadı.`);
}

async function testInteractions(viewport, results) {
  await setViewport(viewport);
  clearDiagnostics(`Temel etkileşimler / ${viewport.name}`);
  await navigateUrl(`${BASE_URL}/?interaction=${Date.now()}-${viewport.name}`);
  await waitForRoute(ROUTES[0], activeCase);

  await evaluate("window.navigate('calisma-merkezi')");
  await waitForRoute(ROUTES.find(({ route }) => route === "calisma-merkezi"), activeCase);
  await evaluate("document.querySelector('#studyHubGrid .topic-card .primary-btn').click()");
  await waitForExpression("document.querySelector('#studydetail.active .study-detail-panel')", "Çalışma konusu açma");

  await evaluate("window.navigate('quiz-merkezi')");
  await waitForRoute(ROUTES.find(({ route }) => route === "quiz-merkezi"), activeCase);
  await evaluate("document.querySelector('#quizHubGrid .topic-card .primary-btn').click()");
  await waitForExpression("document.querySelector('#quizdetail.active .quiz-shell')", "Quiz açma");

  await evaluate("window.navigate('ezber-merkezi')");
  await waitForRoute(ROUTES.find(({ route }) => route === "ezber-merkezi"), activeCase);
  for (const [tab, section] of Object.entries({
    practice: "memoryPracticeSection",
    cards: "memoryCardsSection",
    matching: "memoryMatchingSection",
    typing: "memoryTypingSection",
    weak: "memoryWeakSection",
  })) {
    await evaluate(`document.querySelector('[data-mem-tab=${tab}]').click()`);
    await waitForExpression(`!document.getElementById(${JSON.stringify(section)}).hidden`, `Ezber sekmesi: ${tab}`);
  }

  await evaluate("window.navigate('ravzalingo')");
  await waitForRoute(ROUTES.find(({ route }) => route === "ravzalingo"), activeCase);
  await evaluate("document.querySelector('.rlz5-banner-guide').click()");
  await waitForExpression("document.querySelector('#rlz5TopicModal')", "RavzaLingo konu penceresi");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitForExpression("!document.querySelector('#rlz5TopicModal')", "RavzaLingo konu penceresini kapatma");

  await evaluate("window.navigate('kahoot')");
  await waitForRoute(ROUTES.find(({ route }) => route === "kahoot"), activeCase);
  await evaluate("document.querySelector('.kahoot-create-btn').click()");
  await waitForExpression("document.querySelector('#kahootCreateModal')", "Kahoot oluşturma penceresi");
  await evaluate("document.querySelector('#kahootCreateModal .kahoot-modal-close').click()");
  await waitForExpression("!document.querySelector('#kahootCreateModal')", "Kahoot oluşturma penceresini kapatma");

  await evaluate("window.navigate('sinav-merkezi')");
  await waitForRoute(ROUTES.find(({ route }) => route === "sinav-merkezi"), activeCase);
  await evaluate("document.querySelector('.exam-history-btn').click()");
  await waitForExpression("document.querySelector('#examHistoryModal.open')", "Sınav geçmişi penceresi");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitForExpression("!document.querySelector('#examHistoryModal.open')", "Sınav geçmişi penceresini kapatma");

  await evaluate("window.navigate('oyun')");
  await waitForRoute(ROUTES.find(({ route }) => route === "oyun"), activeCase);
  for (const gameId of EMBEDDED_GAMES) {
    await evaluate(`document.querySelector('[data-game=${gameId}]').click()`);
    await waitForExpression("!document.getElementById('gameStage').hidden && document.getElementById('gameStageBody').children.length > 0", `Oyun açma: ${gameId}`, 15000);
    const gameState = await evaluate(`(() => ({
      title: document.getElementById('gameStageTitle')?.textContent?.trim(),
      error: document.querySelector('#gameStageBody .game-module-error')?.textContent?.trim() || '',
      iframeReady: [...document.querySelectorAll('#gameStageBody iframe')].every((frame) => frame.contentDocument?.readyState === 'complete')
    }))()`);
    assert.equal(gameState.error, "", `${gameId}: oyun modülü hata verdi: ${gameState.error}`);
    assert.equal(gameState.iframeReady, true, `${gameId}: oyun iframe'i tamamlanmadı.`);
    await evaluate("document.getElementById('gameCloseBtn').click()");
    await waitForExpression("document.getElementById('gameStage').hidden", `Oyun kapatma: ${gameId}`);
  }

  assert.deepEqual(consoleErrors, [], `${activeCase}: konsol hataları:\n${consoleErrors.join("\n")}`);
  assert.deepEqual(networkErrors, [], `${activeCase}: yerel network hataları:\n${networkErrors.join("\n")}`);
  results.push({ type: "interactions", viewport: viewport.name, embeddedGames: EMBEDDED_GAMES.length });
  console.log(`✓ Temel etkileşimler / ${viewport.name}`);
}

async function testHistory(results) {
  const viewport = VIEWPORTS.find(({ name }) => name === "desktop") || VIEWPORTS[0];
  await setViewport(viewport);
  clearDiagnostics("Tarayıcı geri/ileri geçmişi");
  await navigateUrl(`${BASE_URL}/?history-test=${Date.now()}`);
  await waitForRoute(ROUTES[0], activeCase);
  await evaluate("window.navigate('calisma-merkezi')");
  await waitForRoute(ROUTES.find(({ route }) => route === "calisma-merkezi"), activeCase);
  await evaluate("window.navigate('ezber-merkezi')");
  await waitForRoute(ROUTES.find(({ route }) => route === "ezber-merkezi"), activeCase);
  await evaluate("history.back()");
  await waitForExpression("document.body.dataset.currentRoute === 'calisma-merkezi' && document.querySelector('#studyhub.active')", "Geri gezinme");
  await evaluate("history.forward()");
  await waitForExpression("document.body.dataset.currentRoute === 'ezber-merkezi' && document.querySelector('#memoryhub.active')", "İleri gezinme");
  assert.deepEqual(consoleErrors, [], `Geri/ileri gezinme konsol hatası: ${consoleErrors.join("\n")}`);
  assert.deepEqual(networkErrors, [], `Geri/ileri gezinme network hatası: ${networkErrors.join("\n")}`);
  results.push({ type: "history", viewport: viewport.name });
  console.log("✓ Tarayıcı geri/ileri geçmişi");
}

async function testStandaloneGame(definition, viewport, results) {
  await setViewport(viewport);
  const label = `${definition.name} / ${viewport.name} / doğrudan URL`;
  clearDiagnostics(label);
  await navigateUrl(`${BASE_URL}${definition.path}?smoke=${Date.now()}-${viewport.name}`);
  const outcome = await waitForProbe(
    standaloneProbeExpression(definition),
    (snapshot) => snapshot.readyState === "complete"
      && snapshot.readyVisible
      && snapshot.itemCount >= definition.minimumItems
      && snapshot.textLength > 10,
  );
  assert.equal(outcome.timedOut, undefined, `${label}: görünür içerik yüklenmedi.\n${JSON.stringify(outcome.snapshot, null, 2)}`);
  assert.ok(outcome.snapshot.horizontalOverflow <= 2, `${label}: ${outcome.snapshot.horizontalOverflow}px yatay taşma var.`);
  assert.deepEqual(consoleErrors, [], `${label}: konsol hataları:\n${consoleErrors.join("\n")}`);
  assert.deepEqual(networkErrors, [], `${label}: yerel network hataları:\n${networkErrors.join("\n")}`);
  results.push({ type: "standalone", game: definition.name, viewport: viewport.name, elapsed: outcome.elapsed });
  console.log(`✓ ${label}: ${outcome.elapsed} ms`);
}

const results = [];
const startedAt = new Date().toISOString();

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Network.enable");

  for (const viewport of VIEWPORTS) await testSpaRoutes(viewport, results);
  for (const viewport of DIRECT_VIEWPORTS) {
    for (const definition of ROUTES) await testDirectAndReload(definition, viewport, results);
  }
  for (const viewport of DIRECT_VIEWPORTS) await testInteractions(viewport, results);
  await testHistory(results);
  for (const viewport of VIEWPORTS) {
    for (const definition of STANDALONE_GAMES) await testStandaloneGame(definition, viewport, results);
  }

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(join(ARTIFACT_DIR, "report.json"), `${JSON.stringify({
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewports: VIEWPORTS,
    routeCount: ROUTES.length,
    embeddedGameCount: EMBEDDED_GAMES.length,
    standaloneGameCount: STANDALONE_GAMES.length,
    scenarioCount: results.length,
    results,
  }, null, 2)}\n`, "utf8");
  console.log(`✓ Tüm uygulamalar: ${results.length} senaryo başarıyla tamamlandı.`);
} finally {
  socket.close();
  browser.kill();
  await new Promise((resolveExit) => {
    if (browser.exitCode !== null || browser.signalCode !== null) return resolveExit();
    browser.once("exit", resolveExit);
    setTimeout(resolveExit, 2000);
  });
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
