import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ANA_SAYFA_GORSELLERI } from "../../data/ana-sayfa-gorselleri.js";
import { validThemes } from "./ana-sayfa-rastgele-gorsel.js";

// Gerçek üretim havuzundan türetilir; yeni tema eklendiğinde test kırılmaz.
const HERO_THEME_POOL = validThemes(ANA_SAYFA_GORSELLERI);
assert.ok(HERO_THEME_POOL.length > 0, "En az bir geçerli tema bulunmalı");
const HERO_THEME_IDS = HERO_THEME_POOL.map((theme) => theme.id);
assert.equal(new Set(HERO_THEME_IDS).size, HERO_THEME_IDS.length, "Tema havuzunda duplicate id var");
for (const theme of HERO_THEME_POOL) {
  assert.ok(theme.desktop.fallback && theme.mobile.fallback && theme.placeholder, `${theme.id}: boş görsel URL'i`);
}

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browserPort = 9334;
const serverPort = 8765;
const profile = join(tmpdir(), `ravza-home-hero-${Date.now()}`);
const captureScreenshots = process.env.CAPTURE_HOME_HERO === "1";
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
    const isOptimizedHero = filePath.includes(`${sep}assets${sep}ana-sayfa${sep}optimized${sep}`);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": isOptimizedHero ? "public, max-age=31536000, immutable" : "no-store"
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
      const targets = await fetch(`http://127.0.0.1:${browserPort}/json/list`).then((response) => response.json());
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
const browserErrors = [];
const failedAssets = [];
const heroRequests = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text || "Tarayıcı istisnası");
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text);
  if (message.method === "Network.requestWillBeSent" && message.params.request.url.includes("/assets/ana-sayfa/optimized/")) {
    heroRequests.push(message.params.request.url);
  }
  if (message.method === "Network.responseReceived") {
    const { response } = message.params;
    if (response.url.includes("/assets/ana-sayfa/") && response.status >= 400) failedAssets.push(`${response.status} ${response.url}`);
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

async function setViewport(width, height, mobile = false) {
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height
  });
  await delay(220);
}

async function waitForValue(expression, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = await evaluate(expression);
    if (value) return value;
    await delay(120);
  }
  throw new Error(`Zaman aşımı: ${expression}`);
}

async function captureScreenshot(name) {
  if (!captureScreenshots) return;
  const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(new URL(`./${name}.png`, import.meta.url), Buffer.from(screenshot.data, "base64"));
}

function mainImageRequests(startIndex = 0) {
  return [...new Set(heroRequests.slice(startIndex).filter((url) => /-(desktop|mobile)-\d+-[0-9a-f]{8}\.(avif|webp)(?:\?|$)/.test(url)))];
}

async function getHeroState() {
  return evaluate(`(() => {
    const stage = document.querySelector('#anaSayfaHeroStage');
    const image = document.querySelector('#anaSayfaHeroImage');
    const rect = stage?.getBoundingClientRect();
    return {
      theme: stage?.dataset.homeHeroTheme,
      loaded: stage?.classList.contains('is-home-hero-loaded'),
      currentSrc: image?.currentSrc,
      naturalWidth: image?.naturalWidth,
      rect: rect ? { width: rect.width, height: rect.height } : null,
      placeholder: stage ? getComputedStyle(stage).backgroundImage : '',
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      metrics: globalThis.__RAVZA_YUSUF_HOME_HERO_METRICS__,
      bootstrapAt: globalThis.__RAVZA_YUSUF_HOME_HERO_BOOTSTRAP_AT__,
      initAt: globalThis.__RAVZA_YUSUF_HOME_HERO_INIT_AT__,
      loadedAt: Number(stage?.dataset.homeHeroLoadedAt || 0),
      resources: performance.getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/assets/ana-sayfa/optimized/') || entry.name.includes('/js/main.js'))
        .map((entry) => ({ name: entry.name, startTime: entry.startTime, responseEnd: entry.responseEnd, transferSize: entry.transferSize }))
    };
  })()`);
}

async function setNetwork(downloadKbps, uploadKbps, latency, connectionType) {
  await command("Network.emulateNetworkConditions", {
    offline: false,
    latency,
    downloadThroughput: downloadKbps * 1024 / 8,
    uploadThroughput: uploadKbps * 1024 / 8,
    connectionType
  });
}

const networkResults = [];
let initialMetrics = null;

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Network.enable");
  await command("Network.setCacheDisabled", { cacheDisabled: true });

  await setViewport(1366, 768);
  const initialRequestIndex = heroRequests.length;
  await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html` });
  await waitForValue("document.querySelector('#anaSayfaHeroStage')?.classList.contains('is-home-hero-loaded')");
  const desktop = await getHeroState();
  assert.ok(HERO_THEME_IDS.includes(desktop.theme), `Seçilen tema (${desktop.theme}) üretim havuzunda yok: ${HERO_THEME_IDS.join(", ")}`);
  assert.match(desktop.currentSrc, new RegExp(`${desktop.theme}-desktop-\\d+-[0-9a-f]{8}\\.(avif|webp)$`));
  assert.ok(desktop.currentSrc && !desktop.currentSrc.endsWith("undefined"), "currentSrc boş/geçersiz");
  assert.ok(desktop.naturalWidth > 0);
  assert.equal(desktop.scrollWidth, desktop.innerWidth);
  assert.match(desktop.placeholder, new RegExp(`${desktop.theme}-placeholder-[0-9a-f]{8}\\.webp`));
  const initialMainRequests = mainImageRequests(initialRequestIndex);
  assert.ok(initialMainRequests.length >= 1);
  assert.ok(initialMainRequests.every((url) => url.includes(`/${desktop.theme}-desktop-`)), "İlk açılışta seçilmeyen tema veya mobil varyant indirildi");
  const heroResource = desktop.resources.find((entry) => entry.name.includes(`/${desktop.theme}-desktop-`));
  assert.ok(heroResource && heroResource.startTime < desktop.initAt, "Hero isteği ana sayfa bileşeni başlamadan önce başlamadı");
  initialMetrics = {
    source: desktop.currentSrc.split("/").at(-1),
    requestLeadMs: Math.round(desktop.initAt - heroResource.startTime),
    placeholderVisibleMs: Math.round(desktop.loadedAt - desktop.initAt),
    transferredBytes: desktop.resources
      .filter((entry) => entry.name.includes(`/assets/ana-sayfa/optimized/${desktop.theme}-`))
      .reduce((sum, entry) => sum + entry.transferSize, 0)
  };

  const themeToggleState = await evaluate(`(() => {
    const before = document.body.classList.contains('dark');
    document.querySelector('#topbar-theme-btn')?.click();
    return { before, after: document.body.classList.contains('dark'), heroTheme: document.querySelector('#anaSayfaHeroStage')?.dataset.homeHeroTheme };
  })()`);
  assert.notEqual(themeToggleState.before, themeToggleState.after, "Gece/gündüz düğmesi çalışmadı");
  assert.equal(themeToggleState.heroTheme, desktop.theme, "Gece/gündüz geçişinde hero teması değişti");

  const responsiveSizes = [
    [360, 800, true, "mobile"], [390, 844, true, "mobile"], [393, 852, true, "mobile"],
    [412, 915, true, "mobile"], [430, 932, true, "mobile"],
    [768, 1024, true, "mobile"], [820, 1180, false, "desktop"],
    [1440, 900, false, "desktop"], [1920, 1080, false, "desktop"], [2560, 1440, false, "desktop"]
  ];
  for (const [width, height, mobile, variant] of responsiveSizes) {
    await setViewport(width, height, mobile);
    await waitForValue("document.querySelector('#anaSayfaHeroImage')?.complete && document.querySelector('#anaSayfaHeroImage')?.naturalWidth");
    const state = await getHeroState();
    assert.equal(state.theme, desktop.theme, `${width}x${height} geçişinde tema değişti`);
    assert.match(state.currentSrc, new RegExp(`${state.theme}-${variant}-\\d+-[0-9a-f]{8}\\.(avif|webp)$`));
    assert.equal(state.scrollWidth, state.innerWidth, `${width}x${height} görünümünde yatay taşma var`);
    if (width === 390) await captureScreenshot("home-hero-mobile-check");
    if (width === 1440) await captureScreenshot("home-hero-desktop-check");
  }

  await command("Page.reload", { ignoreCache: true });
  await waitForValue("document.querySelector('#anaSayfaHeroStage')?.classList.contains('is-home-hero-loaded')");
  const nextTheme = await evaluate("document.querySelector('#anaSayfaHeroStage')?.dataset.homeHeroTheme");
  assert.notEqual(nextTheme, desktop.theme, "Sayfa yenilenince önceki tema tekrar seçildi");

  const throttleProfiles = [
    { name: "Fast 3G", down: 1600, up: 768, latency: 150, type: "cellular3g" },
    { name: "Slow 4G", down: 4000, up: 3000, latency: 170, type: "cellular4g" }
  ];
  for (const profileConfig of throttleProfiles) {
    await setViewport(390, 844, true);
    await setNetwork(profileConfig.down, profileConfig.up, profileConfig.latency, profileConfig.type);
    const requestStart = heroRequests.length;
    await command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/index.html?network=${encodeURIComponent(profileConfig.name)}` });
    await waitForValue("document.querySelector('#anaSayfaHeroStage')?.dataset.homeHeroTheme", 30000);
    const beforeLoad = await getHeroState();
    await waitForValue("document.querySelector('#anaSayfaHeroStage')?.classList.contains('is-home-hero-loaded')", 45000);
    await delay(800);
    const afterLoad = await getHeroState();
    assert.match(afterLoad.currentSrc, new RegExp(`${afterLoad.theme}-mobile-\\d+-[0-9a-f]{8}\\.(avif|webp)$`));
    assert.match(beforeLoad.placeholder, new RegExp(`${beforeLoad.theme}-placeholder-[0-9a-f]{8}\\.webp`));
    assert.ok(Math.abs(beforeLoad.rect.width - afterLoad.rect.width) < .5 && Math.abs(beforeLoad.rect.height - afterLoad.rect.height) < .5, `${profileConfig.name}: hero boyutu yüklemede değişti`);
    assert.ok(mainImageRequests(requestStart).every((url) => url.includes(`/${afterLoad.theme}-mobile-`)), `${profileConfig.name}: yanlış tema/cihaz varyantı indirildi`);
    networkResults.push({
      name: profileConfig.name,
      theme: afterLoad.theme,
      source: afterLoad.currentSrc.split("/").at(-1),
      heroReadyMs: Math.round(afterLoad.loadedAt - afterLoad.bootstrapAt),
      placeholderVisibleMs: Math.round(afterLoad.loadedAt - afterLoad.initAt),
      lcpMs: Math.round(afterLoad.metrics?.lcp || 0),
      cls: Number((afterLoad.metrics?.cls || 0).toFixed(4))
    });
  }
  await setNetwork(-1, -1, 0, "none");

  await command("Network.setCacheDisabled", { cacheDisabled: false });
  const cacheSource = (await getHeroState()).currentSrc;
  await evaluate(`fetch(${JSON.stringify(cacheSource)}, { cache: 'reload' }).then((response) => response.arrayBuffer()).then(() => true)`);
  await evaluate("performance.clearResourceTimings(); true");
  const cachedTransfer = await evaluate(`fetch(${JSON.stringify(cacheSource)}).then((response) => response.arrayBuffer()).then(() => {
    const entry = performance.getEntriesByName(${JSON.stringify(cacheSource)}).at(-1);
    return entry ? { transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize } : null;
  })`);
  assert.ok(cachedTransfer && cachedTransfer.transferSize === 0, "Cache açık ikinci istekte optimize görsel ağdan tekrar aktarıldı");

  assert.deepEqual(failedAssets, [], `404 veren hero görselleri: ${failedAssets.join(" | ")}`);
  assert.deepEqual(browserErrors, [], `Tarayıcı hataları: ${browserErrors.join(" | ")}`);
  console.log("✓ İlk açılışta yalnız seçilen temanın doğru cihaz varyantı indirildi");
  console.log(`✓ Normal bağlantı: ${initialMetrics.source}, ${initialMetrics.transferredBytes} bayt transfer, hero isteği bileşenden ${initialMetrics.requestLeadMs} ms önce, placeholder ${initialMetrics.placeholderVisibleMs} ms`);
  console.log("✓ Yenilemede önceki tema tekrar seçilmedi; resize boyunca tema sabit kaldı");
  console.log("✓ 11 hedef ekran boyutunda yatay taşma, CLS kaynaklı hero boyut değişimi ve 404 yok");
  console.log(`✓ Cache açık ikinci istekte ağ transferi ${cachedTransfer.transferSize} bayt`);
  for (const result of networkResults) console.log(`✓ ${result.name}: ${result.source}, hero ${result.heroReadyMs} ms, placeholder ${result.placeholderVisibleMs} ms, LCP ${result.lcpMs} ms, CLS ${result.cls}`);
} finally {
  socket.close();
  browser.kill();
  await new Promise((resolveClose) => server.close(resolveClose));
}
