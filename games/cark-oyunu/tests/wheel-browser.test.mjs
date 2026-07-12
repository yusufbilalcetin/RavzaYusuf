// Şans Çarkı — uçtan uca tarayıcı testi: gizli kilit, spin kilidi, ibre↔kazanan eşleşmesi,
// responsive taşma, dokunma hedefleri, performans. Görsel regresyon için ekran görüntüsü de alır.
// Kendi statik sunucusunu ve headless Edge'ini açar (Playwright/Puppeteer bağımlılığı yok).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SHOTS = fileURLToPath(new URL("../../../test-artifacts/chance-wheel/", import.meta.url));
const PORT = 8767;
const DEBUG_PORT = 9335;
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml"
};

const SELECTED = "127,135,146"; // #7f8792 — finishSpin kazanan dilimi bu renge boyar

await mkdir(SHOTS, { recursive: true });

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
const profile = join(tmpdir(), `ravza-wheel-${Date.now()}`);
// Arka plana alma / kısıtlama kapalı: aksi hâlde sayfa "hidden" olur, requestAnimationFrame durur
// ve zamana bağlı spin animasyonu hiç bitmez (uygulama hatası değil, headless ortam davranışı).
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion",
  "--window-size=1440,900",
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "about:blank"
], { stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((response) => response.json());
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
const consoleIssues = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    consoleIssues.push(`istisna: ${message.params.exceptionDetails.text}`);
  }
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
    consoleIssues.push(`${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description).join(" ")}`);
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

const ok = (name) => console.log(`✓ ${name}`);

/**
 * Headless sayfa, ekran görüntüsü/emülasyon sonrası "hidden" durumuna düşebiliyor; gizli sayfada
 * requestAnimationFrame çalışmadığı için spin animasyonu asla bitmiyor. Bu bir uygulama hatası
 * değil, test ortamı kusuru — sayfayı açıkça etkin tutuyoruz.
 */
async function ensureActive() {
  await command("Emulation.setFocusEmulationEnabled", { enabled: true });
  await command("Page.setWebLifecycleState", { state: "active" });
}

/** Çarkı çevirir (sayfanın etkin olduğundan emin olarak). */
async function clickSpin() {
  await ensureActive();
  await evaluate("document.querySelector('#spinButton').click()");
}

async function screenshot(name, clip) {
  const params = { format: "png" };
  if (clip) params.clip = { ...clip, scale: 2 }; // yakın plan: 2× ölçekle netliği gösterelim
  const { data } = await command("Page.captureScreenshot", params);
  await writeFile(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
}

async function viewport(width, height, deviceScaleFactor = 1) {
  await command("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor, mobile: width < 768
  });
  await delay(350); // ResizeObserver + canvas yeniden ölçekleniyor
}

/** Gizli hareket: başlığa 650 ms içinde üç kez pointerdown. */
const revealLock = () => evaluate(`(() => {
  const title = document.querySelector('#brandTitle');
  title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
})()`);

/** Çarkı sıfırdan kurar: depoyu temizler, sayfayı baştan açar, verilen seçenekleri toplu ekler. */
async function setOptions(labels) {
  await evaluate(`localStorage.removeItem('ravza-wheel-game-v1')`);
  // Tam navigasyon (reload değil): headless sayfa uzun koşularda "hidden" durumuna düşüyor ve
  // requestAnimationFrame duruyor — yeni bir belge görünür durumda başlar.
  await command("Page.navigate", { url: `http://127.0.0.1:${PORT}/games/cark-oyunu/index.html` });
  await delay(800);
  await ensureActive();
  return evaluate(`(() => {
    // Her silme listeyi yeniden kurar (replaceChildren) — düğümler tazelenir, yeniden sorgulanmalı.
    let guard = 0;
    while (document.querySelector('.option-row .delete-button') && guard++ < 700) {
      document.querySelector('.option-row .delete-button').click();
    }
    const bulk = document.querySelector('#bulkToggle');
    bulk.checked = true;
    bulk.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#optionInput').value = ${JSON.stringify(labels.join("\n"))};
    document.querySelector('#addButton').click();
    return document.querySelector('#optionCount').textContent;
  })()`);
}

/** Dönüş bitene kadar bekler — sabit gecikmeye güvenmek yerine gerçek durumu yoklar. */
async function waitForSpinEnd(timeout = 12000) {
  await ensureActive();
  const deadline = Date.now() + timeout;
  let state = null;
  while (Date.now() < deadline) {
    state = await evaluate(`(() => {
      const button = document.querySelector('#spinButton');
      return {
        spinning: document.querySelector('#wheelWrap').classList.contains('is-spinning'),
        disabled: button.disabled,
        options: document.querySelector('#optionCount').textContent,
        overlay: !document.querySelector('#resultOverlay').hidden
      };
    })()`);
    if (!state.spinning && !state.disabled) return;
    await delay(100);
  }
  const alive = await evaluate(`(async () => {
    let ticks = 0;
    const tick = () => { ticks += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ticks, hidden: document.hidden, visibility: document.visibilityState };
  })()`);
  throw new Error(`Dönüş beklenen sürede bitmedi. Durum: ${JSON.stringify(state)}`
    + `\nrAF canlılığı: ${JSON.stringify(alive)}`
    + `\nKonsol: ${consoleIssues.join(" | ") || "(temiz)"}`);
}

/**
 * İbrenin gösterdiği dilimin rengi. Kanvas üzerinde POINTER_ANGLE (saat 12) yönünde örneklenir.
 * Yarıçapın %95'i seçilir: dilim etiketleri yarıçapın %24–%86'sını kaplar, oradan örneklenirse
 * harf pikseli okunur. %95, yazının dışında ama dış çember çizgisinin içindedir.
 */
const colorUnderPointer = () => evaluate(`(() => {
  const canvas = document.querySelector('#wheelCanvas');
  const context = canvas.getContext('2d');
  const centre = canvas.width / 2;
  const radius = canvas.width * 0.485;
  const y = Math.round(centre - radius * 0.95);
  const [r, g, b] = context.getImageData(Math.round(centre), y, 1, 1).data;
  return r + ',' + g + ',' + b;
})()`);

const probe = () => evaluate(`(() => {
  const canvas = document.querySelector('#wheelCanvas').getBoundingClientRect();
  const pointer = document.querySelector('.wheel-pointer').getBoundingClientRect();
  // 44px dokunma hedefi kuralı yalnızca dokunmatik genişliklerde geçerli (scripts/audit-responsive.mjs
  // ile aynı ölçüt). Görsel olarak gizlenmiş checkbox'ın gerçek hedefi onu saran label'dır.
  const small = window.innerWidth > 768 ? [] : [...document.querySelectorAll('button, a[href], input, select')]
    .filter((node) => node.offsetParent !== null || node.closest('label'))
    .map((node) => {
      const target = (node.type === 'checkbox' || node.type === 'radio') ? (node.closest('label') || node) : node;
      return { name: node.id || node.className, box: target.getBoundingClientRect() };
    })
    .filter(({ box }) => box.width > 0 && (box.width < 44 || box.height < 44))
    .map(({ name, box }) => name + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
  return {
    // Yalnızca POZİTİF fark yatay taşmadır; negatif değer dikey kaydırma çubuğunun payıdır.
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    round: Math.abs(canvas.width - canvas.height) < 1.5,
    pointerInside: pointer.left >= 0 && pointer.right <= window.innerWidth && pointer.top >= 0,
    pointerCentred: Math.abs((pointer.left + pointer.right) / 2 - (canvas.left + canvas.right) / 2) < 2,
    pointerTouchesWheel: Math.abs(pointer.bottom - (canvas.top + canvas.height * 0.015)) < canvas.height * 0.05,
    small
  };
})()`);

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await ensureActive();
  await command("Page.navigate", { url: `http://127.0.0.1:${PORT}/games/cark-oyunu/index.html` });
  await delay(900);
  await viewport(1440, 900);

  // —— 0 · Ölçek ve performans ————————————————————————————————————————
  // En başta ölçülür: headless compositor uzun koşularda kare üretmeyi bırakıyor ve
  // requestAnimationFrame yavaşlıyor — o noktadan sonra fps ölçümü uygulamayı değil
  // harness'i ölçer. Sayfanın görünürlüğü ayrıca doğrulanır (sahte sayı raporlanmasın).

  for (const count of [6, 50, 100, 200]) {
    const labels = Array.from({ length: count }, (_, index) => `Seçenek ${index + 1}`);
    assert.equal(await setOptions(labels), String(count));
    await delay(300);

    await ensureActive();
    const frames = await evaluate(`(async () => {
      let ticks = 0;
      let running = true;
      const tick = () => { if (running) { ticks += 1; requestAnimationFrame(tick); } };
      requestAnimationFrame(tick);
      const started = performance.now();
      document.querySelector('#spinButton').click();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      running = false;
      return { ticks, elapsed: performance.now() - started, visibility: document.visibilityState };
    })()`);
    assert.equal(frames.visibility, "visible",
      `${count} seçenek ölçülemedi: sayfa "${frames.visibility}" — headless arka plana aldı`);
    const fps = frames.ticks / (frames.elapsed / 1000);
    assert.ok(fps > 30, `${count} seçenekte kare hızı düştü: ${fps.toFixed(1)} fps`);

    await waitForSpinEnd();
    assert.equal(await colorUnderPointer(), SELECTED, `${count} seçenekte ibre kazananı göstermiyor`);
    await evaluate("document.querySelector('#modalClose').click()");
    console.log(`   ${count} seçenek · ${fps.toFixed(0)} fps · ibre ↔ kazanan ✓`);
  }
  ok("6 / 50 / 100 / 200 seçenekte sistem çalışıyor, kare hızı 30 fps üstünde");

  // —— 1 · Gizli kilit butonu ————————————————————————————————————————

  await command("Page.navigate", { url: `http://127.0.0.1:${PORT}/games/cark-oyunu/index.html` });
  await delay(900);
  await viewport(1440, 900);

  const initial = await evaluate(`({
    lock: document.querySelectorAll('#lockButton').length,
    barChildren: document.querySelector('.app-bar').children.length,
    focusable: [...document.querySelectorAll('.app-bar button, .app-bar a')].length
  })`);
  assert.equal(initial.lock, 0, "sayfa açılışında kilit butonu DOM'da olmamalı");
  assert.equal(initial.barChildren, 2, "kilidin yerinde boşluk kalmamalı (geri butonu + marka)");
  assert.equal(initial.focusable, 1, "gizliyken klavye ile odaklanılabilir kilit olmamalı");
  await screenshot("kilit-gizli");
  ok("sayfa ilk açıldığında kilit butonu render edilmiyor, yerinde boşluk yok");

  await evaluate(`document.querySelector('#brandTitle').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await delay(200);
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 0, "tek tıklama açmamalı");
  await delay(500); // üçlü tıklama penceresi (650 ms) kapansın
  await evaluate(`(() => {
    const title = document.querySelector('#brandTitle');
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  })()`);
  await delay(100);
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 0, "çift tıklama açmamalı");
  await delay(600);
  await evaluate(`(async () => {
    const title = document.querySelector('#brandTitle');
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 326));
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 326));
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  })()`);
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 0, "yavaş üçlü tıklama açmamalı");
  await delay(700);
  ok("tek, çift ve yavaş üçlü tıklama kilidi açmıyor");

  await revealLock();
  await delay(250);
  const revealed = await evaluate(`(() => {
    const button = document.querySelector('#lockButton');
    return button ? {
      label: button.getAttribute('aria-label'),
      revealed: button.classList.contains('is-revealed'),
      opacity: getComputedStyle(button).opacity
    } : null;
  })()`);
  assert.ok(revealed, "650 ms içindeki üçlü tıklama kilidi açmalı");
  assert.equal(revealed.label, "Özel alanı aç");
  assert.equal(revealed.revealed, true);
  assert.equal(revealed.opacity, "1", "açılış animasyonu tamamlanmalı");
  await screenshot("kilit-gorunur");
  ok("650 ms içindeki üçlü tıklamada kilit butonu beliriyor");

  await evaluate("document.querySelector('#lockButton').click()");
  await delay(600);
  assert.equal(await evaluate("document.querySelector('#lockOverlay').hidden"), false, "PIN modalı açılmalı");
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 1, "modal açıkken kilit kaybolmamalı");
  ok("kilide tıklanınca sade PIN modalı açılıyor");

  await evaluate("document.querySelector('#lockClose').click()");
  await delay(200);
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 0, "modal kapanınca kilit gizlenmeli");
  ok("modal kapatılınca kilit butonu yeniden DOM'dan kaldırılıyor");

  await evaluate("location.reload()");
  await delay(900);
  assert.equal(await evaluate("document.querySelectorAll('#lockButton').length"), 0, "yenilemede gizli duruma dönmeli");
  assert.equal(await evaluate("JSON.stringify(Object.keys(localStorage)).includes('lock-reveal')"), false,
    "görünürlük localStorage'a yazılmamalı");
  ok("sayfa yenilendiğinde gizli duruma dönüyor, localStorage'a yazılmıyor");

  // —— 2 · Çark: seçenek ekle, çevir ————————————————————————————————

  await viewport(1440, 900);
  assert.equal(await setOptions(["Ali", "Ayşe", "Mehmet", "Zeynep", "Can", "Elif"]), "6");
  await delay(300);
  await screenshot("masaustu-6-secenek");
  ok("6 seçenek eklendi");

  await clickSpin();
  await delay(700);
  const spinning = await evaluate(`({
    disabled: document.querySelector('#spinButton').disabled,
    spinning: document.querySelector('#wheelWrap').classList.contains('is-spinning')
  })`);
  assert.equal(spinning.disabled, true, "dönüş sırasında spin butonu devre dışı olmalı");
  assert.equal(spinning.spinning, true);
  await screenshot("masaustu-spin-sirasinda");

  // İkinci spin başlatılamamalı: buton disabled olsa da doğrudan click gönderiyoruz.
  const historyBefore = await evaluate("document.querySelectorAll('.option-row').length");
  await evaluate("document.querySelector('#spinButton').click()");
  await evaluate("document.querySelector('#spinButton').dispatchEvent(new MouseEvent('click', { bubbles: true }))");
  await waitForSpinEnd();
  const after = await evaluate(`({
    spinning: document.querySelector('#wheelWrap').classList.contains('is-spinning'),
    winner: document.querySelector('#modalWinner').textContent,
    banner: document.querySelector('#winnerBannerText').textContent,
    overlayOpen: !document.querySelector('#resultOverlay').hidden,
    rows: document.querySelectorAll('.option-row').length
  })`);
  assert.equal(after.spinning, false, "dönüş bitmeli");
  assert.equal(after.overlayOpen, true, "sonuç bir kez gösterilmeli");
  assert.equal(after.rows, historyBefore, "spin sırasında seçenek listesi değişmemeli");
  assert.equal(after.winner, after.banner, "modaldaki kazanan ile banner aynı olmalı");
  ok("dönüş sırasında ikinci spin başlamıyor, sonuç bir kez gösteriliyor");

  // —— 3 · İBRE ↔ KAZANAN: ibrenin baktığı dilim gerçekten kazanan mı? ————
  // finishSpin kazanan dilimi #7f8792'ye boyar. İbrenin yönündeki piksel bu renkse,
  // ibrenin gösterdiği dilim ile duyurulan kazanan aynıdır.
  assert.equal(await colorUnderPointer(), SELECTED,
    "ibrenin gösterdiği dilim kazanan dilim değil");
  const geometry = await probe();
  assert.equal(geometry.pointerCentred, true, "ibre çarkın tam üst ortasında (saat 12) olmalı");
  assert.equal(geometry.pointerTouchesWheel, true, "ibre ucu çark kenarına temas etmeli");
  assert.equal(geometry.round, true, "çark tam daire olmalı");
  await screenshot("masaustu-kazanan");
  await evaluate("document.querySelector('#modalClose').click()");
  ok("ibrenin gösterdiği segment ile sonuç kartındaki kazanan aynı (piksel ile doğrulandı)");

  // Bunu birden çok turda tekrarla: rastgele bir turda tutması tesadüf olmasın.
  for (let round = 0; round < 4; round += 1) {
    await clickSpin();
    await waitForSpinEnd();
    assert.equal(await colorUnderPointer(), SELECTED, `tur ${round + 2}: ibre kazananı göstermiyor`);
    assert.equal(
      await evaluate("document.querySelector('#modalWinner').textContent"),
      await evaluate("document.querySelector('#winnerBannerText').textContent"));
    await evaluate("document.querySelector('#modalClose').click()");
    await delay(120);
  }
  ok("5 turun tamamında ibre ↔ kazanan eşleşmesi korunuyor");

  // —— 4 · Ölçek: 50 / 100 / 200 seçenek ————————————————————————————

  // Kalabalık çarkların görsel regresyon kayıtları (performansı yukarıda ölçtük).
  for (const count of [50, 100, 200]) {
    assert.equal(await setOptions(Array.from({ length: count }, (_, index) => `Seçenek ${index + 1}`)), String(count));
    await delay(400);
    await screenshot(`masaustu-${count}-secenek`);
    assert.equal((await probe()).overflow, 0, `${count} seçenekte yatay taşma`);
  }
  ok("50 / 100 / 200 seçenekte ekran görüntüsü alındı, taşma yok");

  // —— 5 · Uzun isimler taşmıyor ————————————————————————————————————

  await setOptions([
    "Çok uzun bir seçenek adı buraya yazıldı",
    "Kısa",
    "Ortalama uzunlukta bir seçenek",
    "Bir diğer epey uzun seçenek metni",
    "Abc",
    "Yine oldukça uzun bir seçenek ismi daha"
  ]);
  await delay(400);
  await screenshot("masaustu-uzun-isimler");
  assert.equal((await probe()).overflow, 0, "uzun isimler yatay taşma yaratmamalı");
  ok("uzun isimler dilime sığdırılıyor, taşma yok");

  // —— 6 · Responsive: 8 viewport ————————————————————————————————————

  await setOptions(["Ali", "Ayşe", "Mehmet", "Zeynep", "Can", "Elif"]);
  const SIZES = [
    [1920, 1080], [1440, 900], [1366, 768], [1024, 768],
    [768, 1024], [430, 932], [390, 844], [375, 667]
  ];
  for (const [width, height] of SIZES) {
    await viewport(width, height);
    const result = await probe();
    assert.equal(result.overflow, 0, `${width}×${height}: yatay taşma (${result.overflow}px)`);
    assert.equal(result.round, true, `${width}×${height}: çark tam daire değil`);
    assert.equal(result.pointerInside, true, `${width}×${height}: ibre viewport dışına taştı`);
    assert.equal(result.pointerCentred, true, `${width}×${height}: ibre saat 12'de değil`);
    assert.deepEqual(result.small, [], `${width}×${height}: 44px altı dokunma hedefi: ${result.small.join(", ")}`);
    if (width === 390) await screenshot("mobil-390x844");
    if (width === 768) await screenshot("tablet-768x1024");
    console.log(`   ${width}×${height} · taşma yok · tam daire · ibre içeride · dokunma hedefleri ≥44px`);
  }
  ok("8 viewport'ta yatay taşma yok, çark tam daire, ibre kesilmiyor, dokunma hedefleri ≥44px");

  // —— 7 · İbre netliği: 1x / 2x / 3x DPR yakın planı ————————————————

  for (const dpr of [1, 2, 3]) {
    await viewport(1440, 900, dpr);
    await ensureActive();
    await command("Page.bringToFront");
    // İbrenin gerçek ekran kutusunu bul, çevresini biraz genişleterek kırp.
    const box = await evaluate(`(() => {
      const r = document.querySelector('.wheel-pointer').getBoundingClientRect();
      return { x: Math.round(r.left - 24), y: Math.round(r.top - 12), w: Math.round(r.width + 48), h: Math.round(r.height + 40) };
    })()`);
    await screenshot(`ibre-yakin-plan-${dpr}x`, { x: box.x, y: box.y, width: box.w, height: box.h });
  }
  await viewport(1440, 900);
  assert.equal(await evaluate("document.querySelectorAll('.wheel-pointer svg').length"), 1,
    "ibre vektör (SVG) olmalı — raster değil, her DPR'de net");
  assert.equal(await evaluate("document.querySelectorAll('.wheel-pointer img').length"), 0);
  ok("ibre inline SVG — 1x/2x/3x DPR ve tarayıcı zoom'unda net kalır");

  // —— 8 · Konsol temiz ————————————————————————————————————————————

  assert.deepEqual(consoleIssues, [], `Konsolda hata/uyarı var: ${consoleIssues.join(" | ")}`);
  ok("konsolda hata veya uyarı yok");

  console.log(`\nEkran görüntüleri: test-artifacts/chance-wheel/`);
  console.log("Tüm çark tarayıcı testleri geçti.");
} finally {
  socket.close();
  browser.kill();
  server.close();
}
