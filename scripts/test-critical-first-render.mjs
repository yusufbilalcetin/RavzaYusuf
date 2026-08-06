import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const BASE_URL = (process.env.RAVZA_TEST_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const QUICK = process.argv.includes("--quick");
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const browserPath = BROWSERS.find(existsSync);
const VIEWPORTS = QUICK
  ? [{ name: "desktop", width: 1366, height: 768 }]
  : [
      { name: "desktop-xl", width: 1920, height: 1080 },
      { name: "desktop", width: 1366, height: 768 },
      { name: "tablet-landscape", width: 1024, height: 768 },
      { name: "tablet-portrait", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
      { name: "mobile-small", width: 360, height: 800 },
    ];
const ROUTES = [
  {
    name: "RavzaLingo",
    route: "ravzalingo",
    section: "#ravzalingo",
    content: "#ravzaLingoRoot",
    ready: ".rlz5-shell",
    minimumItems: 1,
    itemSelector: ".rlz5-section",
  },
  {
    name: "Ravza Books",
    route: "ravza-books",
    section: "#ravzabooks",
    content: "#screen-reader",
    ready: ".library-view",
    minimumItems: 1,
    itemSelector: ".library-book-card",
  },
];
const LOCAL_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//;

assert.ok(browserPath, "Chrome veya Edge bulunamadı.");
await fetch(`${BASE_URL}/health`).then((response) => {
  assert.equal(response.ok, true, `${BASE_URL}/health yanıt vermedi.`);
});

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
const profile = resolve(tmpdir(), `ravza-critical-first-render-${Date.now()}`);
assert.ok(profile.startsWith(`${resolve(tmpdir())}${sep}`), "Geçici profil güvenli dizinde değil.");

const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function findPageTarget() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((entry) => entry.type === "page");
      if (target) return target;
    } catch {
      // Chromium debug portu açılana kadar bekle.
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
let networkErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    consoleErrors.push(details.exception?.description || details.text || "JavaScript istisnası");
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    consoleErrors.push(message.params.entry.text);
  }
  if (message.method === "Network.requestWillBeSent") {
    requestUrls.set(message.params.requestId, message.params.request.url);
  }
  if (message.method === "Network.responseReceived") {
    const response = message.params.response;
    if (LOCAL_URL.test(response.url) && response.status >= 400) {
      networkErrors.push(`${response.status} ${response.url}`);
    }
  }
  if (message.method === "Network.loadingFailed" && !message.params.canceled) {
    const url = requestUrls.get(message.params.requestId) || "bilinmeyen istek";
    if (LOCAL_URL.test(url)) networkErrors.push(`${message.params.errorText}: ${url}`);
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
  return new Promise((resolveCommand, rejectCommand) => {
    pendingCommands.set(id, { resolve: resolveCommand, reject: rejectCommand });
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Değerlendirme hatası");
  }
  return result.result.value;
}

function probeExpression(definition) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(definition.section)});
    const content = document.querySelector(${JSON.stringify(definition.content)});
    const ready = document.querySelector(${JSON.stringify(definition.ready)});
    const describe = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const ancestors = [];
      for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
        const currentStyle = getComputedStyle(current);
        const currentRect = current.getBoundingClientRect();
        ancestors.push({
          node: current.tagName.toLowerCase() + (current.id ? '#' + current.id : '')
            + (typeof current.className === 'string' && current.className.trim()
              ? '.' + current.className.trim().split(/\\s+/).slice(0, 3).join('.')
              : ''),
          display: currentStyle.display,
          visibility: currentStyle.visibility,
          opacity: currentStyle.opacity,
          width: Math.round(currentRect.width),
          height: Math.round(currentRect.height),
        });
      }
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        dataReveal: element.hasAttribute('data-reveal'),
        isRevealed: element.classList.contains('is-revealed'),
        animations: element.getAnimations().map((animation) => ({
          playState: animation.playState,
          currentTime: Math.round(animation.currentTime || 0),
        })),
        ancestors,
      };
    };
    const isVisible = (element) => {
      if (!element) return false;
      for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
        const style = getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) return false;
        if (current === element && (rect.width < 1 || rect.height < 1)) return false;
      }
      return true;
    };
    return {
      readyState: document.readyState,
      startup: globalThis.__APP_STARTUP_STATE__ || null,
      routeState: history.state,
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      viewport: { width: innerWidth, height: innerHeight },
      fallback: Boolean(document.querySelector('.startup-fallback')),
      startupError: document.querySelector('.startup-error')?.textContent?.trim() || '',
      appMode: section?.dataset.appMode || '',
      section: describe(section),
      content: describe(content),
      ready: describe(ready),
      sectionVisible: isVisible(section),
      contentVisible: isVisible(content),
      readyVisible: isVisible(ready),
      contentLength: content?.innerHTML.length || 0,
      itemCount: document.querySelectorAll(${JSON.stringify(definition.itemSelector)}).length,
      loadingText: document.querySelector('.reader-loading p')?.textContent?.trim() || '',
      textSample: ready?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 180) || '',
    };
  })()`;
}

async function waitForSettled(definition, timeout = 12000) {
  const expression = probeExpression(definition);
  const startedAt = Date.now();
  let snapshot = null;
  while (Date.now() - startedAt < timeout) {
    snapshot = await evaluate(expression);
    if (
      snapshot.startup?.completed
      && !snapshot.fallback
      && snapshot.readyVisible
      && snapshot.itemCount >= definition.minimumItems
    ) {
      await delay(250);
      return { snapshot: await evaluate(expression), elapsed: Date.now() - startedAt };
    }
    await delay(100);
  }
  return { snapshot, elapsed: Date.now() - startedAt, timedOut: true };
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

async function resizeForDiagnosis(viewport) {
  await command("Emulation.setDeviceMetricsOverride", {
    width: Math.max(320, viewport.width - 1),
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 768,
    screenWidth: Math.max(320, viewport.width - 1),
    screenHeight: viewport.height,
  });
  await delay(150);
  await setViewport(viewport);
  await delay(350);
}

async function runCase(definition, viewport, mode) {
  activeCase = `${definition.name} / ${viewport.name} / ${mode}`;
  consoleErrors = [];
  networkErrors = [];
  requestUrls.clear();

  if (mode === "direct") {
    const marker = `${Date.now()}-${encodeURIComponent(viewport.name)}`;
    await command("Page.navigate", { url: `${BASE_URL}/?page=${definition.route}&first-render=${marker}` });
  } else {
    await command("Page.reload", { ignoreCache: false });
  }

  const beforeResize = await waitForSettled(definition);
  const failedBeforeResize = Boolean(
    beforeResize.timedOut
    || !beforeResize.snapshot?.readyVisible
    || beforeResize.snapshot.itemCount < definition.minimumItems
  );

  let afterResize = null;
  if (failedBeforeResize) {
    await resizeForDiagnosis(viewport);
    afterResize = await evaluate(probeExpression(definition));
  }

  const diagnostic = {
    case: activeCase,
    elapsed: beforeResize.elapsed,
    beforeResize: beforeResize.snapshot,
    afterResize,
    consoleErrors,
    networkErrors,
  };

  assert.equal(failedBeforeResize, false, `${activeCase} resize/zoom olmadan görünmedi:\n${JSON.stringify(diagnostic, null, 2)}`);
  assert.equal(beforeResize.snapshot.startupError, "", `${activeCase} startup error gösterdi.`);
  assert.deepEqual(consoleErrors, [], `${activeCase} konsol hatası:\n${consoleErrors.join("\n")}`);
  assert.deepEqual(networkErrors, [], `${activeCase} yerel network hatası:\n${networkErrors.join("\n")}`);
  return diagnostic;
}

const results = [];

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Network.enable");

  for (const viewport of VIEWPORTS) {
    await setViewport(viewport);
    for (const definition of ROUTES) {
      const direct = await runCase(definition, viewport, "direct");
      results.push(direct);
      console.log(`✓ ${direct.case}: ${direct.elapsed} ms`);

      const reload = await runCase(definition, viewport, "reload");
      results.push(reload);
      console.log(`✓ ${reload.case}: ${reload.elapsed} ms`);
    }
  }

  console.log(`✓ Kritik ilk-render testi: ${results.length} senaryo, resize/zoom gereksinimi yok.`);
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
