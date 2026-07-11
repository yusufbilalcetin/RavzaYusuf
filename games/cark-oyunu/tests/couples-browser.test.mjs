// Özel alanın tarayıcıdaki davranışı: kilitliyken DOM'a ve ağa hiçbir gizli içerik sızmamalı.
// Kendi statik sunucusunu ve headless Edge'ini açar.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = 8766;
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(request.url, "http://x").pathname)));
  if (!path.startsWith(normalize(ROOT))) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("yok");
  }
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = join(tmpdir(), `ravza-couples-${Date.now()}`);
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  "--remote-debugging-port=9334", `--user-data-dir=${profile}`, "about:blank"
], { stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch("http://127.0.0.1:9334/json/list").then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch { /* tarayıcı açılıyor */ }
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
const requests = [];
const errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text || "istisna");
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

// Şifre Firestore'da tutuluyor; test gerçek belgeyi okur.
const PASSWORD = "0609";

// Kilitliyken sızmaması gereken istekler: kırpılmış görseller ve özel çark modülü.
// (Şifre kaydının okunması normaldir — içinde yalnızca salt + hash var.)
const secretRequests = () => requests.filter((url) => /ciftler-carki|couples\.js/i.test(url));
const ok = (name) => console.log(`✓ ${name}`);

async function typePin(value, field = "#lockInput") {
  await evaluate(`(() => {
    const input = document.querySelector('${field}');
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

const submitLock = () => evaluate("document.querySelector('#lockForm').requestSubmit()");

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await command("Page.navigate", { url: `http://127.0.0.1:${PORT}/games/cark-oyunu/index.html` });
  await delay(900);

  // 7 + 8 · Kilit açılmadan özel çark render edilmez, ağ isteği yapılmaz.
  const locked = await evaluate(`({
    privatePanel: document.querySelectorAll('.private-panel').length,
    coupleModal: document.querySelectorAll('.couples-overlay').length,
    images: document.querySelectorAll('img').length,
    codes: /[ABC]-\\d/.test(document.body.textContent),
    normalOptions: document.querySelector('#optionCount')?.textContent
  })`);
  assert.equal(locked.privatePanel, 0, "kilitliyken özel panel render edilmemeli");
  assert.equal(locked.coupleModal, 0, "kilitliyken sonuç modalı olmamalı");
  assert.equal(locked.images, 0, "kilitliyken hiçbir görsel DOM'da olmamalı");
  assert.equal(locked.codes, false, "kilitliyken seçenek kodları görünmemeli");
  assert.deepEqual(secretRequests(), [], `kilitliyken gizli içerik istendi: ${secretRequests().join(", ")}`);
  ok("kilit açılmadan özel çark render edilmiyor (7)");
  ok("kilit açılmadan özel görsel/modül için ağ isteği yok (8)");

  // 15 · Normal mod etkilenmemiş.
  assert.equal(locked.normalOptions, "1");
  await evaluate(`(() => {
    document.querySelector('#optionInput').value = 'Seçenek 2';
    document.querySelector('#addButton').click();
  })()`);
  assert.equal(await evaluate("document.querySelector('#optionCount').textContent"), "2");
  await evaluate("document.querySelector('#spinButton').click()");
  await delay(700);
  const normalSpin = await evaluate(`({
    winner: document.querySelector('#modalWinner')?.textContent,
    overlayHidden: document.querySelector('#resultOverlay')?.hidden
  })`);
  assert.ok(["Seçenek 1", "Seçenek 2"].includes(normalSpin.winner), "normal çark çalışmalı");
  assert.equal(normalSpin.overlayHidden, false);
  await evaluate("document.querySelector('#modalClose').click()");
  ok("normal Şans Çarkı modu değişikliklerden etkilenmiyor (15)");

  // Şifre Firestore'dan gelir (admin_meta/couples-wheel). Önce yanlış şifre denenir.
  await evaluate("document.querySelector('#lockButton').click()");
  await delay(1200); // Firestore'dan şifre kaydı çekiliyor
  assert.equal(await evaluate("document.querySelector('#lockTitle').textContent"), "Özel alan");
  await typePin("0000");
  await submitLock();
  await delay(900);
  const wrongFirst = await evaluate(`({
    error: document.querySelector('#lockError').textContent,
    panel: document.querySelectorAll('.private-panel').length
  })`);
  assert.equal(wrongFirst.error, "Hatalı şifre");
  assert.equal(wrongFirst.panel, 0, "yanlış şifre özel alanı açmamalı");
  ok("yanlış şifre ile erişim sağlanamıyor (9)");

  await typePin(PASSWORD);
  await submitLock();
  await delay(1200);

  // 10 · Doğru PIN ile özel çark açılır.
  const unlocked = await evaluate(`({
    panel: document.querySelectorAll('.private-panel').length,
    counts: document.querySelector('.private-counts')?.textContent,
    filters: document.querySelectorAll('.catalog-filter').length,
    optionPanelHidden: document.querySelector('.option-panel')?.hidden,
    lockOpen: document.querySelector('#lockButton')?.classList.contains('is-open'),
    optionPanelDisplay: getComputedStyle(document.querySelector('.option-panel')).display,
    resultDisplay: getComputedStyle(document.querySelector('.couples-overlay')).display
  })`);
  assert.equal(unlocked.panel, 1);
  assert.equal(unlocked.counts, "Toplam seçenek 62 · Kalan seçenek 62");
  assert.equal(unlocked.filters, 3);
  assert.equal(unlocked.optionPanelHidden, true, "özel moddayken normal seçenek paneli gizlenmeli");
  assert.equal(unlocked.optionPanelDisplay, "none", "gizlenen normal panel gerçekten görünmemeli");
  assert.equal(unlocked.resultDisplay, "none", "sonuç modalı çevirmeden önce görünmemeli");
  assert.equal(unlocked.lockOpen, true);
  ok("doğru şifre ile özel çark açılıyor, 62 seçenekle başlıyor (10)");

  // Sonuç: kod + kırpılmış görsel (kaynak sayfa değil).
  await evaluate("document.querySelector('#spinButton').click()");
  await delay(900);
  const result = await evaluate(`({
    open: !document.querySelector('.couples-overlay').hidden,
    code: document.querySelector('.couples-code')?.textContent,
    caption: document.querySelector('.couples-caption')?.textContent,
    image: document.querySelector('.couples-figure img')?.getAttribute('src'),
    counts: document.querySelector('.private-counts')?.textContent
  })`);
  assert.match(result.code, /^[ABC]-\d{2,3}$/, "sonuçta kısa kod gösterilmeli");
  assert.match(result.caption, /Katalog [ABC] · \d+\. pozisyon/);
  assert.match(result.image, /assets\/ciftler-carki\/catalog-[abc]\/\d{2,3}\.webp$/, "kırpılmış görsel gösterilmeli");
  assert.equal(result.counts, "Toplam seçenek 62 · Kalan seçenek 61");
  assert.equal(await evaluate(`performance.getEntriesByType('resource').some((entry) => /sources\\/catalog-/.test(entry.name))`), false,
    "kaynak katalog sayfası hiçbir zaman yüklenmemeli");
  ok("sonuç modalı kod + katalog + kırpılmış görsel gösteriyor, kaynak sayfa yüklenmiyor");

  // 12 · Aynı tur içinde tekrar gelmez.
  const firstCode = result.code;
  await evaluate("document.querySelector('.couples-actions .primary-button').click()");
  const seen = [firstCode];
  for (let index = 0; index < 3; index += 1) {
    await evaluate("document.querySelector('#spinButton').click()");
    await delay(800);
    seen.push(await evaluate("document.querySelector('.couples-code').textContent"));
    await evaluate("document.querySelector('.couples-actions .primary-button').click()");
  }
  assert.equal(new Set(seen).size, seen.length, `aynı tur içinde tekrar eden kod: ${seen.join(", ")}`);
  assert.equal(await evaluate("document.querySelector('.private-counts').textContent"), "Toplam seçenek 62 · Kalan seçenek 58");
  ok("çekilen kod aynı turda tekrar gelmiyor (12)");

  // 11 · Manuel kilitleme: özel içerik DOM'dan kalkar.
  await evaluate("document.querySelector('#lockButton').click()");
  await delay(200);
  const relocked = await evaluate(`({
    panel: document.querySelectorAll('.private-panel').length,
    overlay: document.querySelectorAll('.couples-overlay').length,
    images: document.querySelectorAll('img').length,
    codes: /[ABC]-\\d/.test(document.body.textContent),
    lockedTitle: document.querySelector('.locked-card h2')?.textContent,
    lockedText: document.querySelector('.locked-card p')?.textContent,
    lockedButton: document.querySelector('.locked-card .primary-button')?.textContent,
    wheelHidden: document.querySelector('.wheel-panel')?.hidden
  })`);
  assert.equal(relocked.panel, 0, "kilitlenince özel panel DOM'dan silinmeli");
  assert.equal(relocked.overlay, 0, "kilitlenince sonuç modalı DOM'dan silinmeli");
  assert.equal(relocked.images, 0, "kilitlenince görsel referansları temizlenmeli");
  assert.equal(relocked.codes, false, "kilitlenince kodlar/geçmiş görünmemeli");
  assert.equal(relocked.lockedTitle, "Özel Alan Kilitli");
  assert.equal(relocked.lockedText, "Devam etmek için sağ üstteki kilit simgesine dokun.");
  assert.equal(relocked.lockedButton, "Kilidi Aç");
  assert.equal(relocked.wheelHidden, true, "kilitliyken çark görünmemeli");
  ok("manuel kilitlemeden sonra özel içerik DOM'dan kaldırılıyor (11)");

  // Kilitlendikten sonra doğru şifreyle tekrar girilir; tur durumu korunur.
  await evaluate("document.querySelector('.locked-card .primary-button').click()");
  await delay(900);
  assert.equal(await evaluate("document.querySelector('#lockTitle').textContent"), "Özel alan");
  await typePin(PASSWORD);
  await submitLock();
  await delay(1200);
  assert.equal(await evaluate("document.querySelector('.private-counts').textContent"), "Toplam seçenek 62 · Kalan seçenek 58");
  ok("yeniden açılınca tur durumu korunuyor");

  // 14 · Katalog filtresi.
  await evaluate(`document.querySelector('.catalog-filter input[data-catalog-id="catalog-b"]').click()`);
  await delay(150);
  assert.match(await evaluate("document.querySelector('.private-counts').textContent"), /Toplam seçenek 41/);
  await evaluate(`document.querySelector('.catalog-filter input[data-catalog-id="catalog-b"]').click()`);
  await delay(150);
  assert.match(await evaluate("document.querySelector('.private-counts').textContent"), /Toplam seçenek 62/);
  ok("katalog kapatılınca havuz doğru küçülüyor (14)");

  // Sayfa yenilenince kilit (varsayılan: sekme kapanınca — oturum sürdüğü için açık kalır).
  await command("Page.reload", { ignoreCache: true });
  await delay(900);
  assert.equal(await evaluate("document.querySelectorAll('.private-panel').length"), 1, "sekme açıkken oturum sürmeli");

  assert.deepEqual(errors, [], `Tarayıcı hataları: ${errors.join(" | ")}`);
  console.log("\nTüm tarayıcı testleri geçti.");
} finally {
  socket.close();
  browser.kill();
  server.close();
}
