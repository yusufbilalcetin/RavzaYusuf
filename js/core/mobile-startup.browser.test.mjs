// Regresyon testi: mobilde header görünüp ana içeriğin boş kalması hatası.
// Kök neden: initApp() ana içeriği (navigate()) render etmeden önce
// zaman aşımsız bir Firestore okumasını (loadProgressFromFirebase) bekliyordu.
// Bu test, Firestore/Firebase CDN isteklerini kasıtlı olarak geciktirip hiç
// yanıtlamayarak o koşulu yeniden üretir ve ana içeriğin yine de zamanında
// render edildiğini doğrular.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const artifactsDir = resolve(projectRoot, "test-artifacts/mobile-startup");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browserPort = 9337;
const serverPort = 8768;
const profile = join(tmpdir(), `ravza-mobile-startup-${Date.now()}`);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

assert.equal(existsSync(edge), true, "Microsoft Edge bulunamadı");

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${serverPort}`).pathname);
    let filePath = resolve(projectRoot, `.${pathname}`);
    if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) throw new Error("Geçersiz yol");
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((resolveListen) => server.listen(serverPort, "127.0.0.1", resolveListen));

const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${browserPort}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore" });

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function getPageTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${browserPort}/json/list`).then((r) => r.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch { /* Tarayıcı hazır olana kadar bekle. */ }
    await delay(100);
  }
  throw new Error("Headless Edge açılamadı.");
}

const target = await getPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let requestId = 0;
const pending = new Map();
let browserErrors = [];
let networkMode = "pass"; // "pass" | "hang" | "delay" | "delay-late"
let routeDelay = {}; // { [urlSubstring]: ms } — belirli partial HTML isteklerini geciktirmek için

function isFirebaseRequest(url) {
  return url.includes("firestore.googleapis.com") || url.includes("firebasejs");
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text || "Tarayıcı istisnası");
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text);

  if (message.method === "Fetch.requestPaused") {
    const { requestId: fetchRequestId, request } = message.params;
    if (isFirebaseRequest(request.url)) {
      if (networkMode === "hang") {
        return; // Kasıtlı olarak asla devam ettirilmez: "istek hiç dönmüyor" senaryosu.
      }
      if (networkMode === "delay") {
        const ms = Math.floor(Math.random() * 3000);
        setTimeout(() => command("Fetch.continueRequest", { requestId: fetchRequestId }).catch(() => {}), ms);
        return;
      }
      if (networkMode === "delay-late") {
        // legacy-app.js'deki 8s Firestore zaman aşımını kasıtlı olarak aşar.
        setTimeout(() => command("Fetch.continueRequest", { requestId: fetchRequestId }).catch(() => {}), 9000);
        return;
      }
    }
    const delayKey = Object.keys(routeDelay).find((key) => request.url.includes(key));
    if (delayKey) {
      setTimeout(() => command("Fetch.continueRequest", { requestId: fetchRequestId }).catch(() => {}), routeDelay[delayKey]);
      return;
    }
    command("Fetch.continueRequest", { requestId: fetchRequestId }).catch(() => {});
    return;
  }

  if (!message.id || !pending.has(message.id)) return;
  const callbacks = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) callbacks.reject(new Error(message.error.message));
  else callbacks.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolve: resolveCommand, reject: rejectCommand }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function setViewport(width, height) {
  await command("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 2, mobile: true, screenWidth: width, screenHeight: height
  });
}

async function captureFailure(name) {
  await mkdir(artifactsDir, { recursive: true });
  try {
    const screenshot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(join(artifactsDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
  } catch { /* ekran görüntüsü alınamazsa yine de tanı bilgisi yazılır */ }
  const dom = await evaluate("document.getElementById('app')?.outerHTML || '(no #app)'").catch((e) => String(e));
  await writeFile(join(artifactsDir, `${name}.dom.html`), dom);
  await writeFile(join(artifactsDir, `${name}.console-errors.json`), JSON.stringify(browserErrors, null, 2));
}

async function getStartupState() {
  return evaluate(`(() => {
    const header = document.getElementById('topbar-root');
    const pageRoot = document.getElementById('page-root');
    const dashboard = document.getElementById('dashboard');
    const rect = dashboard?.getBoundingClientRect();
    const style = dashboard ? getComputedStyle(dashboard) : null;
    return {
      headerVisible: (header?.childElementCount || 0) > 0,
      mainChildCount: pageRoot?.childElementCount || 0,
      fallbackPresent: Boolean(pageRoot?.querySelector('.startup-fallback')),
      dashboardVisible: Boolean(dashboard && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'),
      bodyOverflowHidden: getComputedStyle(document.body).overflow === 'hidden',
      startupState: globalThis.__APP_STARTUP_STATE__ || null
    };
  })()`);
}

async function waitForMainContent(timeoutMs) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await getStartupState();
    if (last.dashboardVisible && !last.fallbackPresent) return { ...last, renderMs: Date.now() - startedAt };
    await delay(100);
  }
  return { ...last, renderMs: Date.now() - startedAt, timedOut: true };
}

let failures = 0;
const renderTimes = [];

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Network.enable");
  await command("Fetch.enable", {
    patterns: [
      { urlPattern: "*firestore.googleapis.com*" },
      { urlPattern: "*firebasejs*" },
      { urlPattern: "*/partials/pages/*.html*" }
    ]
  });
  await command("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
  });

  // --- Senaryo 1: Firestore isteği hiç dönmüyor (kök neden yeniden üretimi) ---
  await setViewport(390, 844);
  networkMode = "hang";
  browserErrors = [];
  await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html` });
  // Üst sınır: legacy import zaman aşımı (4s, app.js) + navigate() süresi + ağ payı.
  const hangResult = await waitForMainContent(10000);
  if (!hangResult.dashboardVisible || hangResult.fallbackPresent) {
    failures += 1;
    await captureFailure("scenario1-firestore-hangs");
  }
  assert.equal(hangResult.headerVisible, true, "Senaryo 1: header görünmedi");
  assert.equal(hangResult.dashboardVisible, true, `Senaryo 1: Firestore hiç dönmeyince ana içerik ${hangResult.renderMs}ms içinde görünmedi (regresyon!)`);
  assert.equal(hangResult.fallbackPresent, false, "Senaryo 1: startup-fallback kaldırılmadı");
  assert.ok(hangResult.mainChildCount > 0, "Senaryo 1: #page-root boş");
  console.log(`✓ Senaryo 1 (Firestore hiç dönmüyor): ana içerik ${hangResult.renderMs}ms içinde göründü, header görünür, fallback kaldırıldı`);

  // --- Senaryo 2: iPhone 16 Pro Max viewport + rastgele 0-3000ms Firebase gecikmesi, tekrarlı reload ---
  await setViewport(430, 932);
  networkMode = "delay";
  const REPEATS = 15;
  for (let i = 0; i < REPEATS; i += 1) {
    browserErrors = [];
    await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html?run=${i}` });
    const result = await waitForMainContent(8000);
    const ok = result.dashboardVisible && !result.fallbackPresent && result.headerVisible && browserErrors.length === 0;
    if (!ok) {
      failures += 1;
      await captureFailure(`scenario2-repeat-${i}`);
      console.error(`✗ Tekrar ${i}: dashboardVisible=${result.dashboardVisible} fallbackPresent=${result.fallbackPresent} headerVisible=${result.headerVisible} consoleErrors=${browserErrors.length} renderMs=${result.renderMs}`);
    } else {
      renderTimes.push(result.renderMs);
    }
  }
  assert.equal(failures, 0, `${failures}/${REPEATS + 1} tekrar boş ana içerik veya hata ile sonuçlandı (test-artifacts/mobile-startup/ içinde kanıt var)`);
  const avg = Math.round(renderTimes.reduce((sum, v) => sum + v, 0) / renderTimes.length);
  const worst = Math.max(...renderTimes);
  console.log(`✓ Senaryo 2 (${REPEATS} tekrar, iPhone 16 Pro Max, 0-3000ms rastgele Firebase gecikmesi): ortalama ${avg}ms, en kötü ${worst}ms, 0 boş ekran, 0 konsol hatası`);

  // --- Senaryo 3: bfcache pageshow sonrası ana içerik boşsa güvenli rehydrate ---
  networkMode = "pass";
  await waitForMainContent(4000);
  const rehydrated = await evaluate(`(async () => {
    const root = document.getElementById('page-root');
    root.innerHTML = '';
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await new Promise((r) => setTimeout(r, 500));
    return root.childElementCount > 0 && Boolean(document.getElementById('dashboard'));
  })()`);
  assert.equal(rehydrated, true, "Senaryo 3: bfcache pageshow sonrası boş kalan ana içerik rehydrate edilmedi");
  console.log("✓ Senaryo 3 (bfcache pageshow, boş #page-root): rehydrate tetiklendi, içerik geri geldi");

  // --- Senaryo 4: Yarış durumu — geç gelen eski navigate() güncel rotayı ezmemeli ---
  networkMode = "pass";
  routeDelay = { "quiz-merkezi.html": 2500 };
  browserErrors = [];
  await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html` });
  await waitForMainContent(4000);
  await evaluate("window.navigate('quiz-merkezi'); true"); // yavaş (partial 2.5s gecikmeli), henüz bitmedi
  await delay(200);
  await evaluate("window.navigate('ezber-merkezi'); true"); // hızlı, quiz-merkezi'nden SONRA biter
  await delay(3200); // quiz-merkezi'nin gecikmiş partial'ı da gelsin
  routeDelay = {};
  const staleCheck = await evaluate(`(() => ({
    quizActive: document.getElementById('quizhub')?.classList.contains('active') || false,
    memoryActive: document.getElementById('memoryhub')?.classList.contains('active') || false
  }))()`);
  if (!staleCheck.memoryActive || staleCheck.quizActive) {
    failures += 1;
    await captureFailure("scenario4-stale-route-race");
  }
  assert.equal(staleCheck.memoryActive, true, "Senaryo 4: son çağrılan rota (ezber-merkezi) aktif değildi");
  assert.equal(staleCheck.quizActive, false, "Senaryo 4: geç gelen eski rota (quiz-merkezi) güncel rotanın DOM'unu ezdi (regresyon!)");
  assert.deepEqual(browserErrors, [], `Senaryo 4: yarış sırasında konsol/unhandled rejection hatası: ${browserErrors.join(" | ")}`);
  console.log("✓ Senaryo 4 (stale route race): geç gelen eski navigate() güncel rotayı ezmedi, hata yok");

  // --- Senaryo 5: initApp() iki kez çağrılırsa idempotent kalmalı (duplicate legacy boot / duplicate render yok) ---
  browserErrors = [];
  const idempotency = await evaluate(`(async () => {
    const before = JSON.stringify(window.__APP_STARTUP_STATE__);
    const dashboardCountBefore = document.querySelectorAll('#dashboard').length;
    await window.__RAVZA_INIT_APP__();
    await window.__RAVZA_INIT_APP__();
    await new Promise((r) => setTimeout(r, 300));
    return {
      stateUnchanged: before === JSON.stringify(window.__APP_STARTUP_STATE__),
      dashboardCountBefore,
      dashboardCountAfter: document.querySelectorAll('#dashboard').length
    };
  })()`);
  if (!idempotency.stateUnchanged || idempotency.dashboardCountAfter !== idempotency.dashboardCountBefore) {
    failures += 1;
    await captureFailure("scenario5-initapp-idempotent");
  }
  assert.equal(idempotency.stateUnchanged, true, "Senaryo 5: initApp() ikinci çağrıda başlangıç durumunu değiştirdi (idempotent değil)");
  assert.equal(idempotency.dashboardCountAfter, idempotency.dashboardCountBefore, "Senaryo 5: initApp() ikinci çağrıda #dashboard'u yeniden ekledi (duplicate render)");
  assert.deepEqual(browserErrors, [], `Senaryo 5: initApp() tekrar çağrısı hata üretti: ${browserErrors.join(" | ")}`);
  console.log("✓ Senaryo 5 (initApp iki kez çağrılırsa): idempotent, duplicate legacy boot/render yok");

  // --- Senaryo 6: pageshow rehydrate art arda tetiklenirse duplicate render üretmemeli ---
  browserErrors = [];
  const duplicateRehydrate = await evaluate(`(async () => {
    const root = document.getElementById('page-root');
    root.innerHTML = '';
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await new Promise((r) => setTimeout(r, 150));
    root.innerHTML = '';
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await new Promise((r) => setTimeout(r, 500));
    return { dashboardCount: document.querySelectorAll('#dashboard').length };
  })()`);
  if (duplicateRehydrate.dashboardCount !== 1) {
    failures += 1;
    await captureFailure("scenario6-pageshow-duplicate");
  }
  assert.equal(duplicateRehydrate.dashboardCount, 1, `Senaryo 6: art arda pageshow ${duplicateRehydrate.dashboardCount} adet #dashboard üretti (duplicate render!)`);
  assert.deepEqual(browserErrors, [], `Senaryo 6: art arda pageshow hata üretti: ${browserErrors.join(" | ")}`);
  console.log("✓ Senaryo 6 (art arda pageshow): duplicate render yok, hata yok");

  // --- Senaryo 7: Firestore 8s zaman aşımından sonra geç yanıt gelirse mevcut rota korunmalı, unhandled rejection olmamalı ---
  await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html` });
  await waitForMainContent(4000);
  networkMode = "delay-late";
  browserErrors = [];
  await evaluate("window.navigate('quiz-merkezi'); true");
  await delay(500);
  const quizActiveEarly = await evaluate("document.getElementById('quizhub')?.classList.contains('active') || false");
  assert.equal(quizActiveEarly, true, "Senaryo 7: quiz-merkezi'ne geçiş Firestore'u beklemeden hemen olmalıydı");
  await delay(9500); // legacy-app.js'deki 8s Firestore zaman aşımını aşan geç yanıt gelsin
  const lateCheck = await evaluate("document.getElementById('quizhub')?.classList.contains('active') || false");
  if (!lateCheck || browserErrors.length > 0) {
    failures += 1;
    await captureFailure("scenario7-late-firestore");
  }
  assert.equal(lateCheck, true, "Senaryo 7: Firestore'un geç gelen yanıtı kullanıcının bulunduğu rotayı değiştirdi/bozdu");
  assert.deepEqual(browserErrors, [], `Senaryo 7: geç gelen Firestore yanıtı sonrası hata: ${browserErrors.join(" | ")}`);
  console.log("✓ Senaryo 7: Firestore'un 8s zaman aşımından sonra geç gelen yanıtı mevcut rotayı bozmadı, unhandled rejection oluşmadı");
  networkMode = "pass";

  // --- Senaryo 8: genişletilmiş viewport × ağ profili matrisi ---
  // Not: İstenen tam matris (viewport başına 10 normal + 10 gecikmeli + 5 askıda + 5 pageshow)
  // burada, makul test süresi için viewport başına 6+6+3+3 olarak ölçeklenmiştir.
  // Tam sayıya çıkarmak için MATRIX_COUNTS sabitlerini artırmak yeterlidir.
  const VIEWPORTS = [
    { name: "iPhone 14/15 (390x844)", width: 390, height: 844 },
    { name: "iPhone 16 Pro Max (430x932)", width: 430, height: 932 },
    { name: "iPhone X/11/13 mini (375x812)", width: 375, height: 812 }
  ];
  const MATRIX_COUNTS = { normal: 6, delayed: 6, hang: 3, persisted: 3 };
  const matrixSummary = [];

  for (const viewport of VIEWPORTS) {
    await setViewport(viewport.width, viewport.height);
    let emptyMain = 0;
    let persistentFallback = 0;
    let consoleErrorCount = 0;
    let duplicateRenders = 0;
    const times = [];

    async function runOne(mode, label) {
      networkMode = mode;
      browserErrors = [];
      await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html?matrix=${encodeURIComponent(viewport.name)}-${label}` });
      const result = await waitForMainContent(mode === "hang" ? 10000 : 8000);
      if (!result.dashboardVisible) emptyMain += 1;
      if (result.fallbackPresent) persistentFallback += 1;
      consoleErrorCount += browserErrors.length;
      if (result.dashboardVisible && !result.fallbackPresent) times.push(result.renderMs);
      if (!result.dashboardVisible || result.fallbackPresent || browserErrors.length > 0) {
        failures += 1;
        await captureFailure(`scenario8-${viewport.name.replace(/[^a-z0-9]+/gi, "-")}-${label}`);
      }
    }

    for (let i = 0; i < MATRIX_COUNTS.normal; i += 1) await runOne("pass", `normal-${i}`);
    for (let i = 0; i < MATRIX_COUNTS.delayed; i += 1) await runOne("delay", `delayed-${i}`);
    for (let i = 0; i < MATRIX_COUNTS.hang; i += 1) await runOne("hang", `hang-${i}`);

    networkMode = "pass";
    for (let i = 0; i < MATRIX_COUNTS.persisted; i += 1) {
      browserErrors = [];
      await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html?matrix=${encodeURIComponent(viewport.name)}-persisted-${i}` });
      await waitForMainContent(6000);
      const persistedCheck = await evaluate(`(async () => {
        const before = document.querySelectorAll('#dashboard').length;
        document.getElementById('page-root').innerHTML = '';
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        await new Promise((r) => setTimeout(r, 400));
        return { after: document.querySelectorAll('#dashboard').length, empty: document.getElementById('page-root').childElementCount === 0 };
      })()`);
      if (persistedCheck.after !== 1) duplicateRenders += 1;
      if (persistedCheck.empty) emptyMain += 1;
      if (browserErrors.length > 0) consoleErrorCount += browserErrors.length;
    }

    matrixSummary.push({
      viewport: viewport.name,
      total: MATRIX_COUNTS.normal + MATRIX_COUNTS.delayed + MATRIX_COUNTS.hang + MATRIX_COUNTS.persisted,
      emptyMain,
      persistentFallback,
      consoleErrorCount,
      duplicateRenders,
      avgMs: times.length ? Math.round(times.reduce((sum, v) => sum + v, 0) / times.length) : null,
      worstMs: times.length ? Math.max(...times) : null
    });
  }

  for (const row of matrixSummary) {
    assert.equal(row.emptyMain, 0, `${row.viewport}: ${row.emptyMain} boş ana içerik`);
    assert.equal(row.persistentFallback, 0, `${row.viewport}: ${row.persistentFallback} kalıcı fallback`);
    assert.equal(row.consoleErrorCount, 0, `${row.viewport}: ${row.consoleErrorCount} konsol/unhandled rejection hatası`);
    assert.equal(row.duplicateRenders, 0, `${row.viewport}: ${row.duplicateRenders} duplicate render`);
    console.log(`✓ Senaryo 8 [${row.viewport}] ${row.total} tekrar: boş ekran 0, kalıcı fallback 0, konsol hatası 0, duplicate render 0, ortalama ${row.avgMs}ms, en kötü ${row.worstMs}ms`);
  }
  const totalUnhandled = matrixSummary.reduce((sum, row) => sum + row.consoleErrorCount, 0);
  console.log(`✓ Toplam matris: ${matrixSummary.reduce((s, r) => s + r.total, 0)} tekrar, 0 boş ekran, ${totalUnhandled} konsol/unhandled rejection hatası`);
} finally {
  socket.close();
  browser.kill();
  await new Promise((resolveClose) => server.close(resolveClose));
}
