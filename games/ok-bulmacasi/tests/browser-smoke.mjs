import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const browserPath = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean).find(existsSync);

if (!browserPath) throw new Error("Chrome veya Edge bulunamadı. BROWSER_PATH belirleyebilirsin.");

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

let staticServer;
let targetUrl = process.env.GAME_URL;
if (!targetUrl) {
  staticServer = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    let filePath = resolve(projectRoot, `.${pathname}`);
    if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    response.end(readFileSync(filePath));
  });
  await new Promise((resolveListen, rejectListen) => {
    staticServer.once("error", rejectListen);
    staticServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = staticServer.address();
  targetUrl = `http://127.0.0.1:${address.port}/games/ok-bulmacasi/`;
}
const debugPort = 10000 + Math.floor(Math.random() * 40000);
const profile = mkdtempSync(join(tmpdir(), "ravza-arrow-browser-"));
const visualDir = process.env.VISUAL_DIR ? resolve(process.env.VISUAL_DIR) : null;
if (visualDir) mkdirSync(visualDir, { recursive: true });
const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForJson(pathname, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}${pathname}`);
      if (response.ok) return response.json();
    } catch {
      // Tarayici acilisi bekleniyor.
    }
    await delay(100);
  }
  throw new Error("Tarayıcı hata ayıklama bağlantısı kurulamadı.");
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callbacks.reject(new Error(message.error.message));
      else callbacks.resolve(message.result);
      return;
    }
    (listeners.get(message.method) || []).forEach((listener) => listener(message.params));
  });

  return {
    ready: new Promise((resolveReady, rejectReady) => {
      socket.addEventListener("open", resolveReady, { once: true });
      socket.addEventListener("error", rejectReady, { once: true });
    }),
    on(method, listener) {
      const group = listeners.get(method) || [];
      group.push(listener);
      listeners.set(method, group);
    },
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveCommand, rejectCommand) => {
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

async function evaluate(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(cdp, expression, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  throw new Error(`Koşul zaman aşımına uğradı: ${expression}`);
}

async function clickPiece(cdp, pieceId) {
  const point = await evaluate(cdp, `(() => {
    const arrow = document.querySelector('[data-piece-id="${pieceId}"] .piece-arrow');
    const rect = arrow.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function captureShot(cdp, name) {
  if (!visualDir) return;
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(visualDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
}

let cdp;
const consoleErrors = [];
try {
  const pages = await waitForJson("/json/list");
  const page = pages.find((item) => item.type === "page");
  cdp = connectCdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  cdp.on("Runtime.exceptionThrown", (params) => consoleErrors.push(params.exceptionDetails?.text || "Bilinmeyen JS hatası"));
  cdp.on("Log.entryAdded", (params) => {
    if (params.entry?.level === "error") consoleErrors.push(params.entry.text);
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 320,
    screenHeight: 844
  });
  await cdp.send("Page.navigate", { url: targetUrl });
  await waitFor(cdp, "document.body.dataset.screen === 'home'");
  await evaluate(cdp, "document.getElementById('levelsButton').click()");
  await waitFor(cdp, "document.querySelectorAll('.level-cell').length === 10");

  const pickerLayout = await evaluate(cdp, `({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    lastLevelRight: Math.ceil(document.querySelector('.level-cell:last-child').getBoundingClientRect().right)
  })`);
  assert.equal(pickerLayout.scrollWidth, pickerLayout.width, "320 px bölüm ekranında yatay taşma olmamalı");
  assert.ok(pickerLayout.lastLevelRight <= pickerLayout.width, "Bölüm kartları mobil ekrana sığmalı");

  if (process.env.BROWSER_PICKER_SHOT) {
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(resolve(process.env.BROWSER_PICKER_SHOT), Buffer.from(screenshot.data, "base64"));
  }

  // Temiz kayitta ileri kademeler de dogrudan acilabilmeli.
  for (const [chapter, level] of [[4, 61], [5, 101], [6, 131]]) {
    await evaluate(cdp, `document.querySelector('[data-chapter="${chapter}"]').click(); document.querySelector('[data-level="${level}"]').click()`);
    await waitFor(cdp, `document.body.dataset.screen === 'game' && document.getElementById('levelTag').textContent.includes('${level}')`);
    await evaluate(cdp, "document.getElementById('backToLevels').click()");
    await waitFor(cdp, "document.body.dataset.screen === 'levels'");
  }
  await evaluate(cdp, "document.querySelector('[data-chapter=\"1\"]').click()");

  await evaluate(cdp, "document.querySelector('[data-level=\"1\"]').click()");
  await waitFor(cdp, "document.body.dataset.screen === 'game' && document.querySelectorAll('.piece').length > 0");
  const gameLayout = await evaluate(cdp, `({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    height: innerHeight,
    boardBottom: Math.ceil(document.getElementById('board').getBoundingClientRect().bottom),
    pieceCount: document.querySelectorAll('.piece').length
  })`);
  assert.equal(gameLayout.scrollWidth, gameLayout.width, "320 px oyun ekranında yatay taşma olmamalı");
  assert.ok(gameLayout.boardBottom <= gameLayout.height, "Tahta mobil ekran yüksekliğine sığmalı");

  const blockedPiece = await evaluate(cdp, `(async () => {
    const { getLevel } = await import('/games/ok-bulmacasi/js/levels.js');
    const remaining = new Set(getLevel(1).pieces.map((piece) => piece.id));
    return getLevel(1).pieces.find((piece) => piece.blockedBy.some((id) => remaining.has(id))).id;
  })()`);
  await clickPiece(cdp, blockedPiece);
  await waitFor(cdp, "document.querySelectorAll('.heart.is-lost').length === 1");
  assert.ok(
    await evaluate(cdp, `document.querySelector('[data-piece-id="${blockedPiece}"]') !== null`),
    "Önü kapalı ok tahtada kalmalı"
  );

  const firstPullable = await evaluate(cdp, `(async () => {
    const { getLevel } = await import('/games/ok-bulmacasi/js/levels.js');
    return getLevel(1).pieces.find((piece) => piece.blockedBy.length === 0).id;
  })()`);
  const staticPoints = await evaluate(cdp, `document.querySelector('[data-piece-id="${firstPullable}"] .piece-line').getAttribute('points')`);
  await clickPiece(cdp, firstPullable);
  await waitFor(cdp, `document.querySelector('[data-piece-id="${firstPullable}"]')?.classList.contains('is-leaving-tail') === true`);
  await delay(100);
  const tailFrame = await evaluate(cdp, `({
    points: document.querySelector('[data-piece-id="${firstPullable}"] .piece-line')?.getAttribute('points'),
    transform: document.querySelector('[data-piece-id="${firstPullable}"]')?.style.transform || ''
  })`);
  assert.notEqual(tailFrame.points, staticPoints, "Kuyruk takip animasyonu visible path noktalarını her karede değiştirmeli");
  assert.equal(tailFrame.transform, "", "Ok sabit şekilli CSS translate ile hareket etmemeli");
  await waitFor(cdp, `document.querySelector('[data-piece-id="${firstPullable}"]') === null`);
  assert.equal(
    await evaluate(cdp, "document.querySelectorAll('.piece').length"),
    gameLayout.pieceCount - 1,
    "Gerçek işaretçi tıklaması bir oku çıkarmalı"
  );

  const nextPullable = await evaluate(cdp, `(async () => {
    const { getLevel } = await import('/games/ok-bulmacasi/js/levels.js');
    const remaining = new Set([...document.querySelectorAll('.piece')].map((piece) => Number(piece.dataset.pieceId)));
    return getLevel(1).pieces.find((piece) => remaining.has(piece.id) && piece.blockedBy.every((id) => !remaining.has(id))).id;
  })()`);
  await evaluate(cdp, `(() => {
    const piece = document.querySelector('[data-piece-id="${nextPullable}"]');
    piece.focus();
    piece.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  })()`);
  await waitFor(cdp, `document.querySelector('[data-piece-id="${nextPullable}"]') === null`);
  assert.equal(
    await evaluate(cdp, "document.querySelectorAll('.piece').length"),
    gameLayout.pieceCount - 2,
    "Enter tuşu odaktaki oku çıkarmalı"
  );

  for (let guard = 0; guard < 20; guard += 1) {
    const state = await evaluate(cdp, `(async () => {
      const pieces = [...document.querySelectorAll('.piece:not(.is-leaving)')];
      if (!pieces.length) return { done: true };
      const { getLevel } = await import('/games/ok-bulmacasi/js/levels.js');
      const remaining = new Set(pieces.map((piece) => Number(piece.dataset.pieceId)));
      const next = getLevel(1).pieces.find((piece) => remaining.has(piece.id) && piece.blockedBy.every((id) => !remaining.has(id)));
      next && document.querySelector('[data-piece-id="' + next.id + '"]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
      return { done: false };
    })()`);
    if (state.done) break;
    await delay(1000);
  }

  await waitFor(cdp, "document.getElementById('resultModal').hidden === false", 100);
  await evaluate(cdp, "document.getElementById('resultPrimary').click()");
  await waitFor(cdp, "document.getElementById('levelTag').textContent === 'Bölüm 2'", 100);
  const progress = await evaluate(cdp, "JSON.parse(localStorage.getItem('ravza_ok_bulmacasi_v2'))");
  assert.equal(progress.completed[1], true, "Tamamlanan bölüm kaydedilmeli");
  assert.equal(progress.lastUnlocked, 150, "Bütün bölümler erişilebilir kalmalı");

  const responsiveSizes = [
    [320, 568], [360, 640], [360, 800], [375, 667], [390, 844], [393, 852], [412, 915], [430, 932],
    [768, 1024], [820, 1180], [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]
  ];
  for (const [width, height] of responsiveSizes) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height
    });
    await delay(80);
    const layout = await evaluate(cdp, `({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      boardBottom: Math.ceil(document.getElementById('board').getBoundingClientRect().bottom),
      controlsTop: Math.floor(document.querySelector('.game-controls').getBoundingClientRect().top),
      controlsBottom: Math.ceil(document.querySelector('.game-controls').getBoundingClientRect().bottom),
      height: innerHeight
    })`);
    assert.equal(layout.scrollWidth, layout.width, `${width}x${height} görünümünde yatay taşma olmamalı`);
    assert.ok(layout.boardBottom <= layout.controlsTop + 1, `${width}x${height} görünümünde kontroller tahtayı kapatmamalı`);
    assert.ok(layout.controlsBottom <= layout.height + 1, `${width}x${height} görünümünde kontroller ekrana sığmalı`);
  }

  // Ayar anahtarları gerçek state ve tema sınıfını değiştirmeli.
  await evaluate(cdp, "document.getElementById('openSettingsGame').click()");
  await waitFor(cdp, "document.getElementById('settingsModal').hidden === false");
  await evaluate(cdp, `(() => { const input = document.querySelector('[data-setting="dark"]'); input.click(); })()`);
  assert.equal(await evaluate(cdp, "document.documentElement.classList.contains('theme-dark')"), true, "Koyu tema çalışmalı");
  await evaluate(cdp, "document.getElementById('closeSettings').click()");

  // Yarım kalan oyun başarılı hamleden sonra kaydedilmeli ve yenilemede devam etmeli.
  const resumable = await evaluate(cdp, `(async () => {
    const { getLevel } = await import('/games/ok-bulmacasi/js/levels.js');
    const remaining = new Set([...document.querySelectorAll('.piece')].map((piece) => Number(piece.dataset.pieceId)));
    return getLevel(2).pieces.find((piece) => remaining.has(piece.id) && piece.blockedBy.every((id) => !remaining.has(id))).id;
  })()`);
  await evaluate(cdp, `document.querySelector('[data-piece-id="${resumable}"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await waitFor(cdp, `document.querySelector('[data-piece-id="${resumable}"]') === null`);
  const savedPieceCount = await evaluate(cdp, "document.querySelectorAll('.piece').length");
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitFor(cdp, "document.body.dataset.screen === 'home'");
  assert.equal(await evaluate(cdp, "document.getElementById('playButton').hidden"), false, "Devam butonu yarım oyun varsa görünmeli");
  await evaluate(cdp, "document.getElementById('playButton').click()");
  await waitFor(cdp, "document.body.dataset.screen === 'game'");
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.piece').length"), savedPieceCount, "Yarım kalan ok durumu yenilemede geri yüklenmeli");

  // Günlük kart sahte/placeholder olmamalı; gerçek bir tarih tabanlı bölüm açmalı.
  await evaluate(cdp, "document.getElementById('backToLevels').click(); document.getElementById('backHome').click(); document.getElementById('dailyButton').click()");
  await waitFor(cdp, "document.body.dataset.screen === 'game' && document.querySelectorAll('.piece').length > 0");

  if (visualDir) {
    await evaluate(cdp, `(() => {
      const key = 'ravza_ok_bulmacasi_v2';
      const progress = JSON.parse(localStorage.getItem(key));
      progress.lastUnlocked = 150; progress.currentLevel = 120; progress.session = null; progress.settings.dark = false;
      localStorage.setItem(key, JSON.stringify(progress));
    })()`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, "document.body.dataset.screen === 'home'");
    await evaluate(cdp, "document.getElementById('levelsButton').click(); document.querySelector('[data-chapter=\"5\"]').click(); document.querySelector('[data-level=\"120\"]').click()");
    await waitFor(cdp, "document.body.dataset.screen === 'game' && document.querySelectorAll('.piece').length > 30");
    const openVisualLevel = async (id) => {
      const chapter = id <= 10 ? 1 : id <= 30 ? 2 : id <= 60 ? 3 : id <= 100 ? 4 : id <= 130 ? 5 : 6;
      await evaluate(cdp, `document.getElementById('backToLevels').click(); document.querySelector('[data-chapter="${chapter}"]').click(); document.querySelector('[data-level="${id}"]').click()`);
      await waitFor(cdp, `document.body.dataset.screen === 'game' && document.querySelectorAll('.piece').length > 0`);
      await delay(120);
    };
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    for (const id of [5, 10, 25, 50, 75, 100, 125, 144, 150]) {
      await openVisualLevel(id);
      await captureShot(cdp, `level-${id}-390x844`);
    }
    await openVisualLevel(150);
    for (const [width, height, name] of [[320, 568, "level-150-320x568"], [768, 1024, "level-150-768x1024"], [1440, 900, "level-150-1440x900"]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height });
      await delay(160); await captureShot(cdp, name);
    }
    await openVisualLevel(120);
    for (const [width, height, name] of [[390, 844, "dense-mobile-390x844"], [1440, 900, "dense-desktop-1440x900"]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height });
      await delay(300); await captureShot(cdp, name);
    }
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    const visualSafe = await evaluate(cdp, `(async () => {
      const { getLevel } = await import('/games/ok-bulmacasi/js/levels.js');
      const remaining = new Set([...document.querySelectorAll('.piece')].map((piece) => Number(piece.dataset.pieceId)));
      return getLevel(120).pieces.find((piece) => remaining.has(piece.id) && piece.blockedBy.every((id) => !remaining.has(id))).id;
    })()`);
    await clickPiece(cdp, visualSafe); await delay(20); await captureShot(cdp, "tail-follow-start-frame");
    await delay(120); await captureShot(cdp, "tail-follow-mid-frame");
    await waitFor(cdp, `document.querySelector('[data-piece-id="${visualSafe}"]') === null`);
    await captureShot(cdp, "tail-follow-end-frame");
    await evaluate(cdp, "document.getElementById('undoButton').click()"); await delay(80); await captureShot(cdp, "after-undo");
    await evaluate(cdp, "document.getElementById('hintButton').click()"); await delay(100); await captureShot(cdp, "hint-highlight");
    await evaluate(cdp, "document.getElementById('restartButton').click(); document.getElementById('confirmYes').click()");
    await waitFor(cdp, "document.body.dataset.screen === 'game' && document.querySelectorAll('.piece').length > 30");
    await delay(80); await captureShot(cdp, "after-restart");
    const blockedVisual = await evaluate(cdp, `(async () => {
      const { getLevel } = await import('/games/ok-bulmacasi/js/levels.js');
      const remaining = new Set([...document.querySelectorAll('.piece')].map((piece) => Number(piece.dataset.pieceId)));
      return getLevel(120).pieces.find((piece) => remaining.has(piece.id) && piece.blockedBy.some((id) => remaining.has(id)))?.id;
    })()`);
    if (blockedVisual !== undefined) { await clickPiece(cdp, blockedVisual); await delay(60); await captureShot(cdp, "wrong-selection"); }
    await evaluate(cdp, "document.documentElement.classList.add('theme-dark')"); await delay(80); await captureShot(cdp, "dark-theme");
    await evaluate(cdp, "document.documentElement.classList.remove('theme-dark')");
  }
  assert.equal(consoleErrors.length, 0, `Tarayıcı konsolu temiz olmalı: ${consoleErrors.join(" | ")}`);

  if (process.env.BROWSER_SHOT) {
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(resolve(process.env.BROWSER_SHOT), Buffer.from(screenshot.data, "base64"));
  }

  console.log("Tarayıcı testi geçti: mobil yerleşim, işaretçi, klavye, bölüm geçişi ve kayıt akışı çalışıyor.");
  await cdp.send("Browser.close");
} finally {
  cdp?.close();
  browser.kill();
  if (staticServer) await new Promise((resolveClose) => staticServer.close(resolveClose));
  await delay(300);
  const resolvedProfile = resolve(profile);
  const resolvedTemp = resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}\\`) || resolvedProfile.startsWith(`${resolvedTemp}/`)) {
    rmSync(resolvedProfile, { recursive: true, force: true });
  }
}
