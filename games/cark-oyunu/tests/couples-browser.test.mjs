// Özel alanın tarayıcıdaki davranışı: kilitliyken DOM'a ve ağa hiçbir gizli içerik sızmamalı.
// Kendi statik sunucusunu ve headless Edge'ini açar.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, webcrypto } from "node:crypto";
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

const TEST_PIN = randomBytes(18).toString("base64url");
const WRONG_PIN = randomBytes(18).toString("base64url");
const PIN_SALT = webcrypto.getRandomValues(new Uint8Array(16));
const PIN_ITERATIONS = 120000;
const PIN_KEY = await webcrypto.subtle.importKey(
  "raw", new TextEncoder().encode(TEST_PIN), "PBKDF2", false, ["deriveBits"]
);
const PIN_HASH = await webcrypto.subtle.deriveBits({
  name: "PBKDF2", salt: PIN_SALT, iterations: PIN_ITERATIONS, hash: "SHA-256"
}, PIN_KEY, 256);
const toHex = (value) => [...new Uint8Array(value)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
const FIRESTORE_BODY = JSON.stringify({
  fields: {
    pinHash: { stringValue: toHex(PIN_HASH) },
    pinSalt: { stringValue: toHex(PIN_SALT) },
    iterations: { integerValue: String(PIN_ITERATIONS) },
    hashAlgorithm: { stringValue: "SHA-256" }
  }
});
// Sabit kodlanmış 2x2 geçerli/decode edilebilir WebP (base64): disk üzerinde gerçek bir
// pozisyon görseli dosyasına bağımlılık yok, tarayıcı <img> onerror'a düşmeden gösterir.
const MOCK_IMAGE_BYTES = Buffer.from(
  "UklGRigAAABXRUJQVlA4IBwAAABQAQCdASoCAAIAAoBCJZwABAAAAP73kI4jcBAA",
  "base64"
);
const MOCK_IMAGE_DATA_URL = `data:image/webp;base64,${MOCK_IMAGE_BYTES.toString("base64")}`;
const imageDocumentBody = (code) => JSON.stringify({
  fields: {
    code: { stringValue: code },
    image: { stringValue: MOCK_IMAGE_DATA_URL },
    mimeType: { stringValue: "image/webp" },
    byteLength: { integerValue: String(MOCK_IMAGE_BYTES.length) },
    base64Length: { integerValue: String(MOCK_IMAGE_DATA_URL.length - "data:image/webp;base64,".length) }
  }
});

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
const responses = [];
const errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
  if (message.method === "Network.responseReceived") {
    responses.push({ url: message.params.response.url, status: message.params.response.status });
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text || "istisna");
  if (message.method === "Fetch.requestPaused") {
    const url = decodeURIComponent(message.params.request.url);
    const imageMatch = url.match(/\/documents\/couplesWheelImages\/(0[1-9]|1[0-9]|2[0-8])(?:\?|$)/);
    const body = url.includes("/documents/privateConfig/couplesWheel")
      ? FIRESTORE_BODY
      : imageMatch ? imageDocumentBody(imageMatch[1]) : JSON.stringify({ error: { message: "mock bulunamadı" } });
    void command("Fetch.fulfillRequest", {
      requestId: message.params.requestId,
      responseCode: url.includes("/documents/privateConfig/couplesWheel") || imageMatch ? 200 : 404,
      responseHeaders: [
        { name: "content-type", value: "application/json; charset=utf-8" },
        { name: "access-control-allow-origin", value: "*" }
      ],
      body: Buffer.from(body).toString("base64")
    }).catch((error) => errors.push(error.message));
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

// Kilitliyken istenmemesi gereken içerikler: public pozisyon görselleri ve özel çark modülü.
const secretRequests = () => requests.filter((url) => /ciftler-carki|couples\.js/i.test(url));
const imageDocumentRequests = () => requests.filter((url) => /\/documents\/couplesWheelImages\//i.test(decodeURIComponent(url)));
const ok = (name) => console.log(`✓ ${name}`);

async function typePin(value, field = "#lockInput") {
  await evaluate(`(() => {
    const input = document.querySelector('${field}');
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

const submitLock = () => evaluate("document.querySelector('#lockForm').requestSubmit()");

/** Kilit butonu statik değil: başlığa 650 ms içinde üç kez dokununca üretilir. */
async function revealLock() {
  await evaluate(`(() => {
    const title = document.querySelector('#brandTitle');
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  })()`);
  await delay(150);
}

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Fetch.enable", {
    patterns: [{ urlPattern: "*firestore.googleapis.com/*", requestStage: "Request" }]
  });
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
  assert.deepEqual(imageDocumentRequests(), [], "PIN doğrulanmadan Firestore görsel belgesi istenmemeli");
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

  // PIN yapılandırması mock Firestore privateConfig/couplesWheel cevabından gelir.
  await revealLock();
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 1,
    "başlığa üç kez dokununca kilit butonu belirmeli");
  await evaluate("document.querySelector('#lockButton').click()");
  await delay(250); // Mock Firestore'dan hash/salt yapılandırması çekiliyor
  assert.equal(await evaluate("document.querySelector('#lockTitle').textContent"), "Özel alan");
  await typePin(WRONG_PIN);
  await submitLock();
  await delay(900);
  const wrongFirst = await evaluate(`({
    error: document.querySelector('#lockError').textContent,
    panel: document.querySelectorAll('.private-panel').length
  })`);
  assert.equal(wrongFirst.error, "Hatalı PIN");
  assert.equal(wrongFirst.panel, 0, "yanlış şifre özel alanı açmamalı");
  assert.equal(await evaluate("document.querySelector('#lockInput').value"), "", "PIN input'u doğrulama sonrasında temizlenmeli");
  ok("yanlış şifre ile erişim sağlanamıyor (9)");

  await typePin(TEST_PIN);
  await submitLock();
  await delay(1200);

  // 10 · Doğru PIN ile özel çark açılır.
  // .private-counts tek paragraftan iki stat-card'a bölündü (görsel yenileme); aynı alttaki
  // sayı test ediliyor, yalnızca DOM şekli değişti — bkz. js/couples.js data-stat öznitelikleri.
  const unlocked = await evaluate(`({
    panel: document.querySelectorAll('.private-panel').length,
    statTotal: document.querySelector('[data-stat=total]')?.textContent,
    statRemaining: document.querySelector('[data-stat=remaining]')?.textContent,
    optionPanelHidden: document.querySelector('.option-panel')?.hidden,
    lockButton: document.querySelectorAll('#lockButton').length,
    optionPanelDisplay: getComputedStyle(document.querySelector('.option-panel')).display,
    resultDisplay: getComputedStyle(document.querySelector('.couples-overlay')).display
  })`);
  assert.equal(unlocked.panel, 1);
  assert.equal(unlocked.statTotal, "28");
  assert.equal(unlocked.statRemaining, "28");
  assert.equal(unlocked.optionPanelHidden, true, "özel moddayken normal seçenek paneli gizlenmeli");
  assert.equal(unlocked.optionPanelDisplay, "none", "gizlenen normal panel gerçekten görünmemeli");
  assert.equal(unlocked.resultDisplay, "none", "sonuç modalı çevirmeden önce görünmemeli");
  assert.equal(unlocked.lockButton, 0, "modal kapanınca kilit butonu yine gizlenmeli");

  // Kilit açık: buton yeniden çağrılınca "açık kilit" ikonunu ve kilitleme etiketini gösterir.
  await revealLock();
  assert.equal(await evaluate(`document.querySelector('#lockButton').classList.contains('is-open')`), true);
  assert.equal(await evaluate(`document.querySelector('#lockButton').getAttribute('aria-label')`), "Özel alanı kilitle");
  ok("doğru şifre ile özel çark açılıyor, 28 seçenekle başlıyor (10)");

  assert.equal(await evaluate("document.querySelectorAll('.wheel-peg').length"), 28,
    "Özel Çark'ta peg sayısı sabit 28 pozisyonla eşleşmeli");
  ok("Özel Çark'ta peg sayısı 28");

  // Favoriler/Geçmiş başlıkları katlanıp açılabiliyor.
  const collapsible = await evaluate(`({
    favExpanded: document.querySelectorAll('.private-heading')[0]?.getAttribute('aria-expanded'),
    historyExpanded: document.querySelectorAll('.private-heading')[1]?.getAttribute('aria-expanded')
  })`);
  assert.equal(collapsible.favExpanded, "true", "Favoriler başlangıçta açık olmalı");
  assert.equal(collapsible.historyExpanded, "true", "Geçmiş başlangıçta açık olmalı");
  await evaluate("document.querySelectorAll('.private-heading')[0].click()");
  await delay(100);
  assert.equal(await evaluate("document.querySelectorAll('.private-heading')[0].getAttribute('aria-expanded')"), "false",
    "Favoriler başlığına tıklayınca kapanmalı");
  assert.equal(await evaluate("document.querySelectorAll('.private-section')[0].hidden"), true,
    "Favoriler içeriği kapanınca gizlenmeli");
  await evaluate("document.querySelectorAll('.private-heading')[0].click()"); // geri aç
  await delay(100);
  assert.equal(await evaluate("document.querySelectorAll('.private-section')[0].hidden"), false);
  ok("Favoriler/Geçmiş başlıkları katlanıp açılabiliyor");

  // Sonuç: pozisyon numarası + görsel (kaynak dosya değil).
  await evaluate("document.querySelector('#spinButton').click()");
  await delay(900);
  const result = await evaluate(`({
    open: !document.querySelector('.couples-overlay').hidden,
    code: document.querySelector('.couples-code')?.textContent,
    caption: document.querySelector('.couples-caption')?.textContent,
    image: document.querySelector('.couples-figure img')?.getAttribute('src'),
    statTotal: document.querySelector('[data-stat=total]')?.textContent,
    statRemaining: document.querySelector('[data-stat=remaining]')?.textContent
  })`);
  assert.match(result.code, /^\d{2}$/, "sonuçta pozisyon numarası gösterilmeli");
  assert.match(result.caption, /^\d+\. pozisyon$/);
  assert.match(result.image, /^data:image\/webp;base64,/, "Firestore'dan gelen WebP Data URL gösterilmeli");
  assert.equal(result.statTotal, "28");
  assert.equal(result.statRemaining, "27");
  assert.equal(await evaluate(`performance.getEntriesByType('resource').some((entry) => /ciftler-carki\\/sources\\//.test(entry.name))`), false,
    "kaynak görseller hiçbir zaman yüklenmemeli");
  ok("sonuç modalı numara + pozisyon görseli gösteriyor, kaynak dosya yüklenmiyor");

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
  assert.equal(await evaluate("document.querySelector('[data-stat=total]').textContent"), "28");
  assert.equal(await evaluate("document.querySelector('[data-stat=remaining]').textContent"), "24");
  ok("çekilen kod aynı turda tekrar gelmiyor (12)");

  // 11 · Manuel kilitleme: özel içerik DOM'dan kalkar.
  await revealLock();
  await evaluate("document.querySelector('#lockButton').click()");
  await delay(200);
  const relocked = await evaluate(`({
    panel: document.querySelectorAll('.private-panel').length,
    overlay: document.querySelectorAll('.couples-overlay').length,
    images: document.querySelectorAll('img').length,
    chips: document.querySelectorAll('.chip').length,
    codes: /\\d+\\. pozisyon/.test(document.body.textContent),
    lockedTitle: document.querySelector('.locked-card h2')?.textContent,
    lockedText: document.querySelector('.locked-card p')?.textContent,
    lockedButton: document.querySelector('.locked-card .primary-button')?.textContent,
    wheelHidden: document.querySelector('.wheel-panel')?.hidden
  })`);
  assert.equal(relocked.panel, 0, "kilitlenince özel panel DOM'dan silinmeli");
  assert.equal(relocked.overlay, 0, "kilitlenince sonuç modalı DOM'dan silinmeli");
  assert.equal(relocked.images, 0, "kilitlenince görsel referansları temizlenmeli");
  assert.equal(relocked.chips, 0, "kilitlenince geçmiş/favori numaraları DOM'da kalmamalı");
  assert.equal(relocked.codes, false, "kilitlenince pozisyon bilgisi görünmemeli");
  assert.equal(relocked.lockedTitle, "Özel Alan Kilitli");
  assert.equal(relocked.lockedText, "Devam etmek için aşağıdaki düğmeye dokun.");
  assert.equal(relocked.lockedButton, "Kilidi Aç");
  assert.equal(relocked.wheelHidden, true, "kilitliyken çark görünmemeli");
  ok("manuel kilitlemeden sonra özel içerik DOM'dan kaldırılıyor (11)");

  // Kilitlendikten sonra doğru şifreyle tekrar girilir; tur durumu korunur.
  await evaluate("document.querySelector('.locked-card .primary-button').click()");
  await delay(900);
  assert.equal(await evaluate("document.querySelector('#lockTitle').textContent"), "Özel alan");
  await typePin(TEST_PIN);
  await submitLock();
  await delay(1200);
  assert.equal(await evaluate("document.querySelector('[data-stat=total]').textContent"), "28");
  assert.equal(await evaluate("document.querySelector('[data-stat=remaining]').textContent"), "24");
  ok("yeniden açılınca tur durumu korunuyor");

  // 14 · Geçmiş numarasına tıklayınca pozisyon pop-up olarak açılır.
  // .chip-list[0] = Favoriler, .chip-list[1] = Geçmiş
  await evaluate(`document.querySelectorAll('.chip-list')[1].querySelector('button.chip').click()`);
  await delay(250);
  const browsed = await evaluate(`({
    open: !document.querySelector('.couples-overlay').hidden,
    code: document.querySelector('.couples-code').textContent,
    caption: document.querySelector('.couples-caption').textContent,
    image: document.querySelector('.couples-figure img').getAttribute('src'),
    passHidden: document.querySelector('.couples-actions button:nth-child(2)').hidden,
    respinHidden: document.querySelector('.couples-actions button:nth-child(3)').hidden,
    statTotal: document.querySelector('[data-stat=total]').textContent,
    statRemaining: document.querySelector('[data-stat=remaining]').textContent
  })`);
  assert.equal(browsed.open, true, "geçmiş numarasına tıklayınca pop-up açılmalı");
  assert.match(browsed.code, /^\d{2}$/);
  assert.match(browsed.caption, /^\d+\. pozisyon$/);
  assert.match(browsed.image, /^data:image\/webp;base64,/, "pop-up'ta Firestore görseli olmalı");
  assert.equal(browsed.passHidden, true, "geçmişten açılınca 'Pas geç' gizli olmalı");
  assert.equal(browsed.respinHidden, true, "geçmişten açılınca 'Yeniden çevir' gizli olmalı");
  assert.equal(browsed.statTotal, "28", "geçmişe bakmak havuzu değiştirmemeli");
  assert.equal(browsed.statRemaining, "24", "geçmişe bakmak havuzu değiştirmemeli");
  ok("geçmiş numarasına tıklayınca pozisyon pop-up olarak açılıyor (14)");

  // Favori numarası da aynı pop-up'ı açar; favoriden çıkarma pop-up içinden yapılır.
  await evaluate(`document.querySelector('.couples-actions button:nth-child(1)').click()`); // Favoriye ekle
  await delay(200);
  await evaluate("document.querySelector('.couples-actions .primary-button').click()");
  await delay(200);
  assert.deepEqual(
    await evaluate(`[...document.querySelectorAll('.chip-list')[0].querySelectorAll('button.chip')].map((chip) => chip.textContent)`),
    [browsed.code], "favoriye eklenen numara favori listesinde görünmeli");

  await evaluate(`document.querySelectorAll('.chip-list')[0].querySelector('button.chip').click()`);
  await delay(250);
  const fromFavorite = await evaluate(`({
    open: !document.querySelector('.couples-overlay').hidden,
    code: document.querySelector('.couples-code').textContent,
    image: document.querySelector('.couples-figure img').getAttribute('src'),
    favoriteLabel: document.querySelector('.couples-actions button:nth-child(1)').textContent
  })`);
  assert.equal(fromFavorite.open, true, "favori numarasına tıklayınca pop-up açılmalı");
  assert.equal(fromFavorite.code, browsed.code);
  assert.match(fromFavorite.image, /^data:image\/webp;base64,/);
  assert.equal(fromFavorite.favoriteLabel, "Favoriden çıkar");

  await evaluate(`document.querySelector('.couples-actions button:nth-child(1)').click()`); // Favoriden çıkar
  await delay(200);
  await evaluate("document.querySelector('.couples-actions .primary-button').click()");
  await delay(200);
  assert.equal(await evaluate(`document.querySelectorAll('.chip-list')[0].querySelectorAll('button.chip').length`), 0,
    "pop-up'tan favoriden çıkarınca chip listeden düşmeli");
  ok("favori numarasına tıklayınca pop-up açılıyor, favoriden çıkarma pop-up içinde");

  // Erişim yalnız memory state'tedir: sayfa yenilenince özel alan yeniden kilitlenir.
  const imageRequestsBeforeReload = imageDocumentRequests().length;
  await command("Page.reload", { ignoreCache: true });
  await delay(900);
  assert.equal(await evaluate("document.querySelectorAll('.private-panel').length"), 0, "yenilemede özel alan açık kalmamalı");
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 0, "yenilemede kilit butonu DOM'da olmamalı");
  assert.equal(imageDocumentRequests().length, imageRequestsBeforeReload,
    "yenileme sonrasında PIN girilmeden yeni görsel belgesi istenmemeli");

  assert.deepEqual(requests.filter((url) => /\/catalog-[abc]\//i.test(url)), [],
    "runtime eski katalog yollarına istek göndermemeli");
  assert.deepEqual(requests.filter((url) => /\/assets\/ciftler-carki\/pozisyonlar\/\d{2}\.webp/i.test(url)), [],
    "istemci public pozisyon görseline fallback yapmamalı");
  assert.ok(requests.some((url) => /\/documents\/couplesWheelImages\/(0[1-9]|1[0-9]|2[0-8])/i.test(decodeURIComponent(url))),
    "kilit açıldıktan sonra Firestore görsel belgesi istenmiş olmalı");
  assert.deepEqual(
    responses.filter(({ url, status }) => status === 404 && /cark-oyunu|ciftler-carki/i.test(url)),
    [],
    "çark veya pozisyon görseli isteğinde 404 olmamalı"
  );
  ok("runtime yalnız Firestore görsel belgelerini istiyor; public fallback, eski katalog isteği ve 404 yok");

  assert.deepEqual(errors, [], `Tarayıcı hataları: ${errors.join(" | ")}`);
  console.log("\nTüm tarayıcı testleri geçti.");
} finally {
  socket.close();
  browser.kill();
  server.close();
}
