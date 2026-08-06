import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = 8768;
const DEBUG_PORT = 9336;
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml"
};

const VIEWPORTS = [
  [360, 800], [375, 812], [390, 844], [430, 932], [768, 1024],
  [1366, 768], [1920, 1080],
  [419, 812], [420, 812], [421, 812],
  [819, 900], [820, 900], [821, 900],
  [1049, 900], [1050, 900], [1051, 900]
];

const TEST_PIN = "spin-responsive-test-pin";
const PIN_SALT = webcrypto.getRandomValues(new Uint8Array(16));
const PIN_ITERATIONS = 120000;
const pinKey = await webcrypto.subtle.importKey(
  "raw", new TextEncoder().encode(TEST_PIN), "PBKDF2", false, ["deriveBits"]
);
const PIN_HASH = await webcrypto.subtle.deriveBits({
  name: "PBKDF2", salt: PIN_SALT, iterations: PIN_ITERATIONS, hash: "SHA-256"
}, pinKey, 256);
const toHex = (value) => [...new Uint8Array(value)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
const FIRESTORE_PIN = JSON.stringify({
  fields: {
    pinHash: { stringValue: toHex(PIN_HASH) },
    pinSalt: { stringValue: toHex(PIN_SALT) },
    iterations: { integerValue: String(PIN_ITERATIONS) },
    hashAlgorithm: { stringValue: "SHA-256" }
  }
});
const MOCK_WEBP = "UklGRigAAABXRUJQVlA4IBwAAABQAQCdASoCAAIAAoBCJZwABAAAAP73kI4jcBAA";
const imageDocument = (code) => JSON.stringify({
  fields: {
    code: { stringValue: code },
    image: { stringValue: `data:image/webp;base64,${MOCK_WEBP}` },
    mimeType: { stringValue: "image/webp" },
    byteLength: { integerValue: "44" },
    base64Length: { integerValue: String(MOCK_WEBP.length) }
  }
});

const static404s = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://x");
  const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(normalize(ROOT))) {
    static404s.push(url.pathname);
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    response.end(body);
  } catch {
    static404s.push(url.pathname);
    response.writeHead(404).end("yok");
  }
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const profile = join(tmpdir(), `ravza-spin-stability-${Date.now()}`);
const browser = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
  "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
  "--disable-background-timer-throttling", "--disable-features=CalculateNativeWinOcclusion",
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "about:blank"
], { stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch { /* Edge açılıyor. */ }
    await delay(100);
  }
  throw new Error("Headless Edge açılamadı.");
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let requestId = 0;
const pending = new Map();
const consoleIssues = [];
const network404s = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    consoleIssues.push(message.params.exceptionDetails.text || "Tarayıcı istisnası");
  }
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
    consoleIssues.push(`${message.params.type}: ${message.params.args.map((item) => item.value ?? item.description).join(" ")}`);
  }
  if (message.method === "Network.responseReceived" && message.params.response.status === 404) {
    network404s.push(message.params.response.url);
  }
  if (message.method === "Fetch.requestPaused") {
    const url = decodeURIComponent(message.params.request.url);
    const imageMatch = url.match(/\/documents\/couplesWheelImages\/(0[1-9]|1[0-9]|2[0-8])(?:\?|$)/);
    const found = url.includes("/documents/privateConfig/couplesWheel") || imageMatch;
    const body = url.includes("/documents/privateConfig/couplesWheel")
      ? FIRESTORE_PIN
      : imageMatch ? imageDocument(imageMatch[1]) : JSON.stringify({ error: { message: "mock bulunamadı" } });
    void command("Fetch.fulfillRequest", {
      requestId: message.params.requestId,
      responseCode: found ? 200 : 404,
      responseHeaders: [
        { name: "content-type", value: "application/json; charset=utf-8" },
        { name: "access-control-allow-origin", value: "*" }
      ],
      body: Buffer.from(body).toString("base64")
    }).catch((error) => consoleIssues.push(error.message));
  }
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function viewport(width, height) {
  await command("Emulation.setDeviceMetricsOverride", {
    // Tek sekmede ardisik viewport testi yaparken device-mode'u degistirmek
    // Chromium'da gecikmeli bir layout yeniden kurulumu tetikler ve sonraki
    // spin baslangic olcumunu onceki viewporttan birakabilir. Responsive CSS
    // icin genislik yeterlidir; dokunmatik akisi ayri browser testindedir.
    width, height, deviceScaleFactor: 1, mobile: false,
    screenWidth: width, screenHeight: height
  });
  const expectedMobile = width <= 820;
  const expectedCompact = width <= 1050;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const settled = await evaluate(`innerWidth === ${width}
      && matchMedia('(max-width: 820px)').matches === ${expectedMobile}
      && matchMedia('(max-width: 1050px)').matches === ${expectedCompact}`);
    if (settled) {
      await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      return;
    }
    await delay(25);
  }
  throw new Error(`${width}x${height} viewport/media query durumu yerlesmedi`);
}

async function waitFor(expression, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(25);
  }
  throw new Error(`Koşul zamanında gerçekleşmedi: ${expression}`);
}

async function setNormalOptions() {
  await evaluate(`(() => {
    const input = document.querySelector('#optionInput');
    for (const label of ['İki', 'Üç', 'Dört', 'Beş', 'Altı']) {
      input.value = label;
      document.querySelector('#addButton').click();
    }
  })()`);
  await waitFor("document.querySelectorAll('.option-row').length === 6");
}

async function unlockPrivate() {
  await evaluate(`(() => {
    const title = document.querySelector('#brandTitle');
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('#lockButton') !== null");
  await evaluate("document.querySelector('#lockButton').click()");
  await delay(200);
  await evaluate(`(() => {
    const input = document.querySelector('#lockInput');
    input.value = ${JSON.stringify(TEST_PIN)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#lockForm').requestSubmit();
  })()`);
  await waitFor("document.querySelector('.private-panel') !== null", 4000);
}

const installRecorder = () => evaluate(`(() => {
  window.__spinRecorderCleanup?.();
  const state = { samples: [], cls: 0 };
  const selectors = {
    html: 'html', body: 'body', appRoot: 'body', header: '.app-bar', mainGrid: '.wheel-app',
    leftPanel: '.option-column:not([hidden]), .private-panel', wheelColumn: '.wheel-panel',
    wheelStage: '#wheelWrap', wheel: '#wheelCanvas', pegs: '#wheelPegs', pegRotator: '#wheelPegsRotator', pointer: '.wheel-pointer',
    spinButton: '#spinButton', modal: '.result-overlay:not([hidden]) .result-modal, .couples-overlay:not([hidden]) .couples-modal'
  };
  const box = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      width: rect.width, height: rect.height, top: rect.top, left: rect.left,
      right: rect.right, bottom: rect.bottom, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
      transform: style.transform, scale: style.scale, rotate: style.rotate,
      className: typeof node.className === 'string' ? node.className : '', inlineStyle: node.getAttribute('style') || ''
    };
  };
  state.measure = (stage) => {
    const values = {};
    for (const [name, selector] of Object.entries(selectors)) values[name] = box(document.querySelector(selector));
    const wheelStage = values.wheelStage;
    values.pointerPivot = wheelStage ? {
      x: wheelStage.left + wheelStage.width / 2,
      y: wheelStage.top + wheelStage.height * .015
    } : null;
    state.samples.push({
      stage, at: performance.now(), values,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        scrollX, scrollY
      }
    });
  };
  const shifts = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) state.cls += entry.value;
  });
  try { shifts.observe({ type: 'layout-shift', buffered: false }); } catch {}
  const wrap = document.querySelector('#wheelWrap');
  const overlays = [...document.querySelectorAll('.result-overlay, .couples-overlay')];
  const mutation = new MutationObserver(() => {
    if (!wrap.classList.contains('is-spinning') && state.samples.some((sample) => sample.stage === 'click')
        && !state.samples.some((sample) => sample.stage === 'spin-end')) state.measure('spin-end');
    if (overlays.some((overlay) => !overlay.hidden)
        && !state.samples.some((sample) => sample.stage === 'modal-open')) state.measure('modal-open');
  });
  mutation.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
  const button = document.querySelector('#spinButton');
  const onClick = () => {
    state.measure('click');
    requestAnimationFrame(() => state.measure('first-frame'));
    setTimeout(() => state.measure('spin-mid'), 275);
  };
  button.addEventListener('click', onClick, true);
  state.measure('before');
  window.__spinStability = state;
  window.__spinRecorderCleanup = () => {
    button.removeEventListener('click', onClick, true);
    mutation.disconnect();
    shifts.disconnect();
  };
})()`);

async function physicalSpin() {
  const { root } = await command("DOM.getDocument");
  const { nodeId } = await command("DOM.querySelector", { nodeId: root.nodeId, selector: "#spinButton" });
  await command("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
  await evaluate("window.__spinStability.measure('pressed')");
  await command("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
  await evaluate("document.querySelector('#spinButton').click()");
}

const round = (value) => Math.round(value * 100) / 100;
const delta = (a, b) => round(Math.abs(a - b));

function validateRun(label, result) {
  const failures = [];
  const before = result.samples.find((sample) => sample.stage === "before");
  const stages = result.samples.filter((sample) => sample.stage !== "before");
  if (!before) return [`${label}: başlangıç ölçümü yok`];
  const baseWheel = before.values.wheel;
  const baseStage = before.values.wheelStage;
  const basePivot = before.values.pointerPivot;
  for (const sample of [before, ...stages]) {
    const prefix = `${label}/${sample.stage}`;
    if (sample.document.scrollWidth > sample.document.clientWidth) {
      failures.push(`${prefix}: html overflow +${sample.document.scrollWidth - sample.document.clientWidth}px`);
    }
    if (sample.document.bodyScrollWidth > sample.document.bodyClientWidth) {
      failures.push(`${prefix}: body overflow +${sample.document.bodyScrollWidth - sample.document.bodyClientWidth}px`);
    }
    if (sample.document.scrollX !== 0 || sample.document.scrollY !== before.document.scrollY) {
      failures.push(`${prefix}: scroll (${sample.document.scrollX}, ${sample.document.scrollY}), başlangıç Y=${before.document.scrollY}`);
    }
    for (const name of ["header", "mainGrid", "leftPanel", "wheelColumn", "wheelStage", "wheel", "pointer", "modal"]) {
      const value = sample.values[name];
      if (!value) continue;
      if (value.left < -1 || value.right > sample.document.clientWidth + 1) {
        failures.push(`${prefix}: ${name} viewport dışı [${round(value.left)}, ${round(value.right)}], viewport=${sample.document.clientWidth}`);
      }
    }
    if (!sample.values.wheel || !sample.values.wheelStage) continue;
    const wheelSizeDelta = Math.max(
      delta(sample.values.wheel.width, baseWheel.width), delta(sample.values.wheel.height, baseWheel.height)
    );
    const wheelPositionDelta = Math.max(
      delta(sample.values.wheel.left, baseWheel.left), delta(sample.values.wheel.top, baseWheel.top)
    );
    const stagePositionDelta = Math.max(
      delta(sample.values.wheelStage.left, baseStage.left), delta(sample.values.wheelStage.top, baseStage.top)
    );
    const pivotDelta = Math.max(
      delta(sample.values.pointerPivot.x, basePivot.x), delta(sample.values.pointerPivot.y, basePivot.y)
    );
    if (wheelPositionDelta > 2 || stagePositionDelta > 2 || pivotDelta > 1) {
      console.error(JSON.stringify({
        prefix,
        baseWheel,
        currentWheel: sample.values.wheel,
        baseStage,
        currentStage: sample.values.wheelStage,
        basePivot,
        currentPivot: sample.values.pointerPivot,
        document: sample.document
      }));
    }
    if (wheelSizeDelta > 1) failures.push(`${prefix}: #wheelCanvas boyut farkı ${wheelSizeDelta}px`);
    if (wheelPositionDelta > 2) failures.push(`${prefix}: #wheelCanvas konum farkı ${wheelPositionDelta}px`);
    if (stagePositionDelta > 2) failures.push(`${prefix}: #wheelWrap konum farkı ${stagePositionDelta}px`);
    if (pivotDelta > 1) failures.push(`${prefix}: .wheel-pointer pivot farkı ${pivotDelta}px`);
  }
  if (!result.samples.some((sample) => sample.stage === "first-frame")) failures.push(`${label}: ilk animation frame ölçülmedi`);
  if (!result.samples.some((sample) => sample.stage === "spin-mid")) failures.push(`${label}: spin ortası ölçülmedi`);
  if (!result.samples.some((sample) => sample.stage === "spin-end")) failures.push(`${label}: spin sonu ölçülmedi`);
  if (!result.samples.some((sample) => sample.stage === "modal-open")) failures.push(`${label}: modal açılışı ölçülmedi`);
  if (result.cls !== 0) failures.push(`${label}: spin CLS=${result.cls}`);
  return failures;
}

async function runSpinCase(width, height, mode, { resizeHeight = true } = {}) {
  await viewport(width, height);
  await evaluate("window.scrollTo(0, 0)");
  await installRecorder();
  await physicalSpin();
  if (resizeHeight) {
    await delay(80);
    await viewport(width, Math.max(500, height - 160));
    await delay(220);
    await viewport(width, height);
  }
  const overlaySelector = mode === "private" ? ".couples-overlay:not([hidden])" : ".result-overlay:not([hidden])";
  await waitFor(`document.querySelector('${overlaySelector}') !== null`, 2500);
  await delay(80);
  const result = await evaluate(`({
    samples: window.__spinStability.samples,
    cls: window.__spinStability.cls,
    optionHistory: document.querySelectorAll('.option-row').length,
    privateHistory: document.querySelectorAll('.chip-list')[1]?.querySelectorAll('.chip').length || 0
  })`);
  const closeSelector = mode === "private" ? ".couples-actions .primary-button" : "#modalClose";
  await evaluate(`document.querySelector('${closeSelector}').click()`);
  await delay(50);
  await evaluate("window.__spinStability.measure('modal-close')");
  const afterClose = await evaluate(`({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollX, scrollY,
    wheel: (() => { const r = document.querySelector('#wheelCanvas').getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top, left: r.left }; })(),
    layout: (() => {
      const app = document.querySelector('.wheel-app');
      const style = getComputedStyle(app);
      return {
        innerWidth,
        gridTemplateColumns: style.gridTemplateColumns,
        gap: style.gap,
        padding: style.padding,
        mobile: matchMedia('(max-width: 820px)').matches,
        compact: matchMedia('(max-width: 1050px)').matches,
        frozen: document.querySelector('#wheelWrap').classList.contains('is-size-frozen')
      };
    })()
  })`);
  result.afterClose = afterClose;
  result.samples.push(await evaluate("window.__spinStability.samples.at(-1)"));
  return result;
}

const failures = [];
const summaries = [];

try {
  await command("Page.enable");
  await command("DOM.enable");
  await command("CSS.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Fetch.enable", { patterns: [{ urlPattern: "*firestore.googleapis.com/*", requestStage: "Request" }] });
  await command("Emulation.setFocusEmulationEnabled", { enabled: true });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await viewport(390, 844);
  await command("Page.navigate", { url: `http://127.0.0.1:${PORT}/games/cark-oyunu/index.html` });
  await waitFor("document.querySelector('#spinButton') !== null");
  await delay(500);
  await setNormalOptions();

  for (const [width, height] of VIEWPORTS) {
    const result = await runSpinCase(width, height, "normal");
    const label = `normal ${width}x${height}`;
    failures.push(...validateRun(label, result));
    const before = result.samples.find((sample) => sample.stage === "before");
    const mid = result.samples.find((sample) => sample.stage === "spin-mid");
    summaries.push({
      mode: "normal", viewport: `${width}x${height}`,
      scroll: `${before.document.scrollWidth}/${before.document.clientWidth}`,
      wheelDelta: mid ? delta(mid.values.wheel.width, before.values.wheel.width) : null,
      topDelta: mid ? delta(mid.values.wheel.top, before.values.wheel.top) : null
    });
    await evaluate("document.querySelector('#themeToggle').click()");
    const themeOverflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    if (themeOverflow > 0) failures.push(`${label}/tema: overflow +${themeOverflow}px`);
    await evaluate("document.querySelector('#themeToggle').click()");
  }

  // Beş ardışık normal spin: sonuç/history güncellemesi ve modal aç-kapat yerleşimi değiştirmemeli.
  await viewport(390, 844);
  for (let index = 0; index < 5; index += 1) {
    const result = await runSpinCase(390, 844, "normal", { resizeHeight: false });
    failures.push(...validateRun(`normal ardışık ${index + 1}`, result));
  }

  await unlockPrivate();
  for (const [width, height] of VIEWPORTS) {
    const result = await runSpinCase(width, height, "private");
    const label = `özel ${width}x${height}`;
    failures.push(...validateRun(label, result));
    const before = result.samples.find((sample) => sample.stage === "before");
    const mid = result.samples.find((sample) => sample.stage === "spin-mid");
    summaries.push({
      mode: "özel", viewport: `${width}x${height}`,
      scroll: `${before.document.scrollWidth}/${before.document.clientWidth}`,
      wheelDelta: mid ? delta(mid.values.wheel.width, before.values.wheel.width) : null,
      topDelta: mid ? delta(mid.values.wheel.top, before.values.wheel.top) : null
    });
  }

  console.table(summaries);
  assert.deepEqual(consoleIssues, [], `Konsol hataları: ${consoleIssues.join(" | ")}`);
  assert.deepEqual(static404s, [], `Statik 404: ${static404s.join(" | ")}`);
  assert.deepEqual(network404s, [], `Ağ 404: ${network404s.join(" | ")}`);
  assert.deepEqual(failures, [], `Responsive spin kararsızlıkları:\n${failures.join("\n")}`);
  console.log("✓ Normal/özel çark tüm viewport ve spin aşamalarında stabil");
} finally {
  socket.close();
  browser.kill();
  server.close();
}
