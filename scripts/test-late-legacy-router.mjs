import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_DELAY_MS = 5_500;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

const mimeTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

const chromiumPath = [
  process.env.RAVZA_CHROMIUM_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean).find(existsSync);

assert.ok(
  chromiumPath,
  "Chromium bulunamadı. Gerekirse RAVZA_CHROMIUM_PATH ile çalıştırılabilir dosyayı belirtin."
);

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address().port));
  });
}

const staticServer = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    let filePath = resolve(projectRoot, `.${pathname}`);
    if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": body.length,
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

const serverPort = await listen(staticServer);
const appOrigin = `http://127.0.0.1:${serverPort}`;

const debugPortServer = createServer();
const debugPort = await listen(debugPortServer);
await new Promise((resolveClose) => debugPortServer.close(resolveClose));

const profilePath = join(tmpdir(), `ravza-late-legacy-${process.pid}-${Date.now()}`);
const browser = spawn(chromiumPath, [
  "--headless=new",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profilePath}`,
  "about:blank"
], { stdio: "ignore" });

async function findPageTarget() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (browser.exitCode !== null) throw new Error(`Chromium erken kapandı (${browser.exitCode}).`);
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // Chromium'un uzaktan hata ayıklama portu hazır olana kadar yeniden dene.
    }
    await delay(100);
  }
  throw new Error("Chromium CDP hedefi zamanında açılamadı.");
}

let socket;
let commandId = 0;
const pendingCommands = new Map();
const consoleErrors = [];
const localNetworkErrors = [];
const networkRequests = new Map();
let legacyRequest = null;
let legacyReleaseTask = null;
let legacyReleaseError = null;
let preReleaseState = null;

function command(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => {
    pendingCommands.set(id, { resolve: resolveCommand, reject: rejectCommand });
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitForValue(expression, timeoutMs, label) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastValue = await evaluate(expression);
      if (lastValue) return lastValue;
    } catch {
      // Navigasyon sırasında execution context kısa süreliğine kaybolabilir.
    }
    await delay(50);
  }
  throw new Error(`${label} zaman aşımına uğradı. Son değer: ${JSON.stringify(lastValue)}`);
}

const ownershipProbe = `(() => ({
  completed: globalThis.__APP_STARTUP_STATE__?.completed === true,
  legacyReady: globalThis.__APP_STARTUP_STATE__?.legacyReady === true,
  navigateEqualsRouter: typeof window.__routerNavigate === 'function'
    && window.navigate === window.__routerNavigate,
  navigateName: window.navigate?.name || null,
  url: location.href
}))()`;

async function releaseLegacyAfterRouter(fetchRequestId, pausedAt) {
  try {
    const remainingDelay = Math.max(0, LEGACY_DELAY_MS - (Date.now() - pausedAt));
    await delay(remainingDelay);
    await waitForValue(
      `globalThis.__APP_STARTUP_STATE__?.completed === true
        && typeof window.__routerNavigate === 'function'
        && window.navigate === window.__routerNavigate`,
      12_000,
      "Legacy serbest bırakılmadan önce router kurulumu"
    );
    preReleaseState = await evaluate(ownershipProbe);
  } catch (error) {
    legacyReleaseError = error;
  } finally {
    legacyRequest.continuedAt = Date.now();
    await command("Fetch.continueRequest", { requestId: fetchRequestId }).catch(() => {});
  }
}

function isLocalUrl(url) {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

function installCdpEventHandler() {
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      consoleErrors.push(details.exception?.description || details.text || "Runtime exception");
    }

    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) {
      consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    }

    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      consoleErrors.push(message.params.entry.text);
    }

    if (message.method === "Network.requestWillBeSent") {
      networkRequests.set(message.params.requestId, message.params.request.url);
    }

    if (message.method === "Network.responseReceived") {
      const { response } = message.params;
      if (isLocalUrl(response.url) && response.status >= 400) {
        localNetworkErrors.push(`${response.status} ${response.url}`);
      }
    }

    if (message.method === "Network.loadingFailed" && !message.params.canceled) {
      const url = networkRequests.get(message.params.requestId);
      if (url && isLocalUrl(url) && message.params.errorText !== "net::ERR_ABORTED") {
        localNetworkErrors.push(`${message.params.errorText} ${url}`);
      }
    }

    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      if (/\/js\/legacy\/legacy-app\.js(?:\?|$)/.test(request.url)) {
        const pausedAt = Date.now();
        legacyRequest = { url: request.url, pausedAt, continuedAt: null };
        legacyReleaseTask = releaseLegacyAfterRouter(requestId, pausedAt);
      } else {
        command("Fetch.continueRequest", { requestId }).catch(() => {});
      }
      return;
    }

    if (!message.id || !pendingCommands.has(message.id)) return;
    const callbacks = pendingCommands.get(message.id);
    pendingCommands.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message));
    else callbacks.resolve(message.result);
  });
}

try {
  const target = await findPageTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  installCdpEventHandler();

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Network.enable");
  await command("Fetch.enable", {
    patterns: [{ urlPattern: "*legacy-app.js*", requestStage: "Request" }]
  });

  await command("Page.navigate", { url: `${appOrigin}/?lateLegacyRouter=${Date.now()}` });

  await waitForValue(
    `globalThis.__APP_STARTUP_STATE__?.completed === true
      && typeof window.__routerNavigate === 'function'`,
    15_000,
    "Legacy beklerken ilk router renderı"
  );
  const routerBootState = await evaluate(ownershipProbe);

  await waitForValue("Boolean(document.getElementById('dashboard')?.classList.contains('active'))", 5_000, "Ana sayfa");
  await waitForValue("Boolean(window.__APP_STARTUP_STATE__?.legacyReady)", 25_000, "Gecikmiş legacy başlangıcı");
  await legacyReleaseTask;

  assert.ok(legacyRequest, "legacy-app.js isteği CDP Fetch tarafından yakalanmadı.");
  assert.equal(legacyReleaseError, null, legacyReleaseError?.message);
  assert.ok(
    legacyRequest.continuedAt - legacyRequest.pausedAt >= LEGACY_DELAY_MS,
    `legacy-app.js yalnızca ${legacyRequest.continuedAt - legacyRequest.pausedAt}ms geciktirildi.`
  );
  assert.equal(routerBootState.completed, true, "Router boot, legacy isteği beklerken tamamlanmadı.");
  assert.equal(routerBootState.navigateEqualsRouter, true, "İlk boot sırasında navigate routera ait değildi.");
  assert.equal(preReleaseState?.navigateEqualsRouter, true, "Legacy serbest bırakılmadan hemen önce router sahipliği kayboldu.");

  await waitForValue(
    `window.__APP_STARTUP_STATE__?.legacyReady === true
      && window.navigate === window.__routerNavigate`,
    8_000,
    "Legacy tamamlandıktan sonra router sahipliği"
  );
  const afterLegacyState = await evaluate(ownershipProbe);

  const navigationCall = await evaluate(`(async () => {
    const result = window.navigate('calisma-merkezi');
    const isPromise = Boolean(result && typeof result.then === 'function');
    if (isPromise) await result;
    return { isPromise };
  })()`);
  assert.equal(navigationCall.isPromise, true, "window.navigate('calisma-merkezi') Promise döndürmedi.");

  await waitForValue(
    `new URLSearchParams(location.search).get('page') === 'calisma-merkezi'
      && document.getElementById('studyhub')?.classList.contains('active')`,
    10_000,
    "Çalışma Merkezi yönlendirmesi"
  );
  await delay(500);

  const routeState = await evaluate(`(() => {
    const activePages = [...document.querySelectorAll('#page-root .page.active')];
    const studyHub = document.getElementById('studyhub');
    const rect = studyHub?.getBoundingClientRect();
    const style = studyHub ? getComputedStyle(studyHub) : null;
    return {
      pageParam: new URLSearchParams(location.search).get('page'),
      activeIds: activePages.map((page) => page.id),
      studyVisible: Boolean(studyHub
        && rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0)
    };
  })()`);

  assert.equal(afterLegacyState.legacyReady, true, "Legacy tamamlanmış olarak işaretlenmedi.");
  assert.equal(afterLegacyState.navigateEqualsRouter, true, "Geç legacy yüklemesi window.navigate router sahipliğini ezdi.");
  assert.equal(routeState.pageParam, "calisma-merkezi", "Route URL Çalışma Merkezi ile eşleşmiyor.");
  assert.deepEqual(routeState.activeIds, ["studyhub"], "Yalnızca #studyhub aktif olmalı.");
  assert.equal(routeState.studyVisible, true, "#studyhub aktif fakat görünür değil.");
  assert.deepEqual(consoleErrors, [], `Konsol hataları: ${consoleErrors.join(" | ")}`);
  assert.deepEqual(localNetworkErrors, [], `Yerel ağ hataları: ${localNetworkErrors.join(" | ")}`);

  console.log("✓ Geç legacy import router sahipliğini bozmadı");
  console.log(`  legacy gecikmesi: ${legacyRequest.continuedAt - legacyRequest.pausedAt}ms`);
  console.log("  navigate === __routerNavigate: true");
  console.log("  Çalışma Merkezi: Promise + doğru URL + tek görünür #studyhub");
  console.log("  konsol/yerel ağ hatası: 0/0");
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await Promise.race([
      command("Browser.close").catch(() => {}),
      delay(1_000)
    ]);
  }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
  await new Promise((resolveClose) => staticServer.close(resolveClose));
  if (profilePath.startsWith(`${tmpdir()}${sep}`)) {
    await rm(profilePath, { recursive: true, force: true }).catch(() => {});
  }
}
