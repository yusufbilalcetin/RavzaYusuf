import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const browserCandidates = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const browserPath = browserCandidates.find(existsSync);
if (!browserPath) throw new Error("Chrome veya Edge bulunamadı. BROWSER_PATH belirleyebilirsin.");

const targetUrl = process.env.GAME_URL || "http://127.0.0.1:8765/games/alan-bulmacasi/";
const gamesPageUrl = new URL("../../index.html?page=oyun", targetUrl).href;
const port = 10000 + Math.floor(Math.random() * 40000);
const profile = mkdtempSync(join(tmpdir(), "ravza-shikaku-browser-"));
const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForJson(pathname, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
      if (response.ok) return response.json();
    } catch {
      // Tarayıcı başlangıcı bekleniyor.
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
      const { resolveCommand, rejectCommand } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCommand(new Error(message.error.message));
      else resolveCommand(message.result);
      return;
    }
    (listeners.get(message.method) || []).forEach((listener) => listener(message.params));
  });

  const ready = new Promise((resolveReady, rejectReady) => {
    socket.addEventListener("open", resolveReady, { once: true });
    socket.addEventListener("error", rejectReady, { once: true });
  });

  return {
    ready,
    on(method, listener) {
      const group = listeners.get(method) || [];
      group.push(listener);
      listeners.set(method, group);
    },
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveCommand, rejectCommand) => {
        pending.set(id, { resolveCommand, rejectCommand });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(cdp, expression, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  throw new Error(`Koşul zaman aşımına uğradı: ${expression}`);
}

let nextTouchId = 1;

async function dragRectangle(cdp, startRow, startColumn, endRow, endColumn) {
  const points = await evaluate(cdp, `(() => {
    const board = document.getElementById("board").getBoundingClientRect();
    const rows = 6;
    const columns = 6;
    const point = (row, column) => ({
      x: board.left + (column + .5) * board.width / columns,
      y: board.top + (row + .5) * board.height / rows
    });
    return { start: point(${startRow}, ${startColumn}), end: point(${endRow}, ${endColumn}) };
  })()`);
  const touchId = nextTouchId;
  nextTouchId += 1;
  const touch = (point) => [{ ...point, id: touchId, radiusX: 2, radiusY: 2, force: .5 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(points.start) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(points.end) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await delay(320);
}

async function dragRectangleSynthetic(cdp, startRow, startColumn, endRow, endColumn) {
  const pointerId = nextTouchId;
  nextTouchId += 1;
  await evaluate(cdp, `(() => {
    const board = document.getElementById("board");
    const rect = board.getBoundingClientRect();
    const point = (row, column) => ({
      x: rect.left + (column + .5) * rect.width / 6,
      y: rect.top + (row + .5) * rect.height / 6
    });
    const start = point(${startRow}, ${startColumn});
    const end = point(${endRow}, ${endColumn});
    const startCell = document.elementFromPoint(start.x, start.y);
    board.setPointerCapture = () => {};
    startCell.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: ${pointerId}, pointerType: "touch", button: 0, clientX: start.x, clientY: start.y }));
    board.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId: ${pointerId}, pointerType: "touch", buttons: 1, clientX: end.x, clientY: end.y }));
    board.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: ${pointerId}, pointerType: "touch", button: 0, clientX: end.x, clientY: end.y }));
  })()`);
  await delay(90);
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
    if (params.entry?.level === "error") consoleErrors.push(`${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ""}`);
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true
  });
  await cdp.send("Page.navigate", { url: targetUrl });
  await waitFor(cdp, "document.querySelectorAll('.cell').length === 36");
  await evaluate(cdp, `localStorage.setItem("ravza_shikaku_game_v1", JSON.stringify({version:1,currentLevel:1,lastUnlocked:1,completed:{},levels:{},soundEnabled:false,tutorialSeen:true})); location.reload()`);
  await waitFor(cdp, "document.querySelectorAll('.cell').length === 36 && document.getElementById('modalBackdrop').hidden");

  const layout = await evaluate(cdp, `({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    boardRight: Math.round(document.getElementById("board").getBoundingClientRect().right),
    controlRight: Math.round(document.querySelector(".controls").getBoundingClientRect().right)
  })`);
  assert.equal(layout.scrollWidth, layout.innerWidth, "320 px görünümde yatay taşma olmamalı");
  assert.ok(layout.boardRight <= layout.innerWidth, "Tahta mobil görünümde ekrana sığmalı");
  assert.ok(layout.controlRight <= layout.innerWidth, "Kontroller mobil görünümde ekrana sığmalı");
  assert.equal(await evaluate(cdp, "document.querySelector('.back-button').href"), gamesPageUrl, "Geri düğmesi oyunlar sayfasına dönmeli");

  await dragRectangle(cdp, 0, 0, 1, 1);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 1, "Doğru 2x2 alan eklenmeli");
  await evaluate(cdp, "document.getElementById('resetButton').click(); document.getElementById('resetConfirm').click()");
  await waitFor(cdp, "document.querySelectorAll('.region').length === 0");
  await dragRectangleSynthetic(cdp, 0, 0, 1, 1);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 1, "Yenileme sonrası doğru alan eklenmeli");
  await dragRectangleSynthetic(cdp, 2, 2, 2, 2);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 1, "Geçersiz alan kaydedilmemeli");
  assert.equal(await evaluate(cdp, "document.getElementById('moveValue').textContent"), "2", "Geçersiz seçim hamleye yansımalı");
  await evaluate(cdp, "document.getElementById('undoButton').click()");
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 0, "Geri al alanı kaldırmalı");

  await dragRectangleSynthetic(cdp, 0, 0, 1, 1);
  const firstAfterUndo = await evaluate(cdp, `({
    regions: document.querySelectorAll('.region').length,
    status: document.getElementById('boardStatus').textContent,
    moves: document.getElementById('moveValue').textContent
  })`);
  assert.equal(firstAfterUndo.regions, 1, `Birinci çözüm alanı eklenmeli: ${JSON.stringify(firstAfterUndo)}`);
  await dragRectangleSynthetic(cdp, 0, 2, 1, 5);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 2, "İkinci çözüm alanı eklenmeli");
  await dragRectangleSynthetic(cdp, 2, 0, 4, 1);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 3, "Üçüncü çözüm alanı eklenmeli");
  await dragRectangleSynthetic(cdp, 2, 2, 3, 5);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 4, "Dördüncü çözüm alanı eklenmeli");
  await dragRectangleSynthetic(cdp, 4, 2, 4, 5);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 5, "Beşinci çözüm alanı eklenmeli");
  await dragRectangleSynthetic(cdp, 5, 0, 5, 5);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 6, "Altıncı çözüm alanı eklenmeli");
  await waitFor(cdp, "document.getElementById('nextButton').disabled === false");
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.region').length"), 6, "Son hücreyle bölüm tamamlanmalı");
  await waitFor(cdp, "document.getElementById('modalBackdrop').hidden === false && document.getElementById('modalTitle')");
  await delay(300);
  assert.match(await evaluate(cdp, "document.getElementById('modalTitle').textContent"), /Ravza|parladı|tamamladın|bölüm|bulmaca/i, "Başarı penceresi açılmalı");
  assert.equal(consoleErrors.length, 0, `Tarayıcı konsolu temiz olmalı: ${consoleErrors.join(" | ")}`);

  if (process.env.BROWSER_SHOT) {
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(resolve(process.env.BROWSER_SHOT), Buffer.from(screenshot.data, "base64"));
  }

  await cdp.send("Page.navigate", { url: gamesPageUrl });
  await waitFor(cdp, "document.querySelector('#games.active') && document.querySelector('a[href=\"./games/alan-bulmacasi/index.html\"]')", 120);
  assert.equal(await evaluate(cdp, "document.querySelector('#games.active h2').textContent"), "Oyun Alanı", "Geri rota oyunlar sayfasını açmalı");

  console.log("Tarayıcı testi geçti: 320 px taşma yok, pointer seçimi, ret, geri al, tamamlama ve SPA dönüşü çalışıyor.");
  await cdp.send("Browser.close");
} finally {
  cdp?.close();
  browser.kill();
  await delay(300);
  const resolvedProfile = resolve(profile);
  const resolvedTemp = resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}\\`) || resolvedProfile.startsWith(`${resolvedTemp}/`)) {
    rmSync(resolvedProfile, { recursive: true, force: true });
  }
}
