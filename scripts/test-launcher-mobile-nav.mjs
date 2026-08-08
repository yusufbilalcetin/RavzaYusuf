import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// Dock görünürlüğü (yalnız ana ekranda) ve sayfa noktaları (swipe/tıklama) için
// odaklı mobil doğrulama. test-launcher.mjs'in genel akışına gömülmez: o akış
// zaten uzun ve durum bağımlı (tema x viewport çarpımı), bu testler ekstra
// gerçek dokunma jestleri ekleyince kırılgan hale geliyordu.

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SERVER_PORT = 8790;
const ARTIFACTS = join(ROOT, "test-artifacts", "launcher-mobile-nav");
const LAYOUT_KEY = "ravzaders.launcher.layout.v4";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp",
  ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml"
};
const BROWSERS = [
  { name: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", port: 9371 },
  { name: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", port: 9372 }
].filter((browser) => existsSync(browser.path));
const MOBILE_WIDTHS = [320, 390, 430];

assert.ok(BROWSERS.length, "Test edilecek Chromium tarayıcısı bulunamadı");
await mkdir(ARTIFACTS, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${SERVER_PORT}`).pathname);
    let filePath = resolve(ROOT, `.${pathname}`);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) throw new Error("Geçersiz yol");
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": TYPES[extname(filePath).toLowerCase()] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolveListen) => server.listen(SERVER_PORT, "127.0.0.1", resolveListen));

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function runBrowser(browserConfig) {
  const profile = join(tmpdir(), `ravza-launcher-mobile-nav-${browserConfig.name}-${Date.now()}`);
  const browserProcess = spawn(browserConfig.path, [
    "--headless=new", "--disable-gpu", "--no-first-run",
    // Tarayici uzantilari devre disi: Edge kendi Copilot/Assistant uzantisini
    // enjekte ediyor ve onun hatalari ("AssistantLoadState already declared",
    // "runtime.lastError") uygulama hatasi sayilip testi dusuruyordu.
    // Ayni bayrak scripts/lib/theme-test-runtime.mjs ve test-all-applications
    // icinde zaten var; bu dosyalarda eksik kalmisti.
    "--disable-extensions", "--disable-background-networking", "--no-default-browser-check",
    `--remote-debugging-port=${browserConfig.port}`, `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: "ignore" });

  async function pageTarget() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${browserConfig.port}/json/list`).then((response) => response.json());
        const page = targets.find((target) => target.type === "page");
        if (page) return page;
      } catch { /* Tarayıcı açılıyor. */ }
      await delay(100);
    }
    throw new Error(`${browserConfig.name} açılamadı`);
  }

  const target = await pageTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  let requestId = 0;
  const pending = new Map();
  const consoleIssues = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") consoleIssues.push(message.params.exceptionDetails.text || "istisna");
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") consoleIssues.push(message.params.entry.text);
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

  async function waitFor(expression, timeout = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Zaman aşımı: ${expression}`);
  }

  async function point(selector) {
    return evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); if(!n) return null; const r=n.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  }

  async function realTap(selector) {
    const targetPoint = await point(selector);
    assert.ok(targetPoint, `Gerçek tıklama hedefi bulunamadı: ${selector}`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: targetPoint.x, y: targetPoint.y, button: "left", clickCount: 1 });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: targetPoint.x, y: targetPoint.y, button: "left", clickCount: 1 });
    await delay(220);
  }

  async function touchSwipe(x1, y1, x2, y2) {
    const touch = (type, x, y, points = true) => command("Input.dispatchTouchEvent", {
      type,
      touchPoints: points ? [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 7 }] : []
    });
    await touch("touchStart", x1, y1);
    await touch("touchMove", (x1 + x2) / 2, (y1 + y2) / 2);
    await touch("touchMove", x2, y2);
    await touch("touchEnd", x2, y2, false);
    await delay(320);
  }

  const results = [];
  try {
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Log.enable");

    for (const width of MOBILE_WIDTHS) {
      const tag = `${browserConfig.name}/${width}`;
      await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: 844 });
      await command("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/index.html` });
      await waitFor("document.querySelectorAll('#launcherGrid .launcher-app').length > 0 && document.querySelector('.launcher-dock')");
      await delay(300);

      // 1) Dock yalnız ana ekranda görünür.
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.launcher-dock')).visibility"), "visible", `${tag}: ana ekranda dock görünmüyor`);
      await evaluate("window.openLauncherFolder('preparation', document.querySelector('[data-launcher-folder=preparation]'), false)");
      await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
      await evaluate("document.querySelector('#launcherFolderGrid [data-launcher-item=ravzalingo]').click()");
      await waitFor("document.body.dataset.currentRoute === 'ravzalingo'");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.launcher-dock')).visibility"), "hidden", `${tag}: iç sayfada dock görünür kaldı`);

      // 2) Geri tuşu: route + dock birlikte geri dönmeli. Klasör de geri
      // butonuyla eşleştiği için yeniden açılabilir; testin geri kalanı
      // etkilenmesin diye açıkça kapatıyoruz.
      await evaluate("history.back()");
      await waitFor("document.body.dataset.currentRoute === 'ana-sayfa'");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.launcher-dock')).visibility"), "visible", `${tag}: geri dönüşte dock tekrar görünmedi`);
      await evaluate("window.closeLauncherFolder(false)");
      await waitFor("document.querySelector('#launcherFolderLayer').hidden");

      // 3) İki sayfa oluştur (add-page + doğrudan durum taşıma, edit modundan
      // çıkışta boş sayfa temizliğinden etkilenmemek için), noktaların doğru
      // sayıda ve doğru aktif durumda render edildiğini doğrula.
      await evaluate("document.querySelector('#launcherEditToggle').click()");
      await waitFor("document.body.classList.contains('launcher-editing')");
      await evaluate("document.querySelector('[data-launcher-add-page]').click()");
      await waitFor("window.__LAUNCHER_STATE__.layout.pages.length === 2");
      await evaluate(`(() => {
        const state = window.__LAUNCHER_STATE__;
        state.layout.pages[1].items.push(state.layout.pages[0].items.pop());
        state.layout.activePage = 0;
        state.layouts[state.device] = state.layout;
        localStorage.setItem(${JSON.stringify(LAYOUT_KEY)}, JSON.stringify(state.layouts));
      })()`);
      await evaluate("document.querySelector('[data-launcher-done]').click()");
      await waitFor("!document.body.classList.contains('launcher-editing')");
      assert.equal(await evaluate("document.querySelectorAll('[data-launcher-page-go]').length"), 2, `${tag}: iki sayfa için iki nokta görünmedi`);
      assert.equal(await evaluate("document.querySelector('[data-launcher-page-go=\"0\"]').classList.contains('is-active')"), true, `${tag}: aktif sayfa noktası belirgin değil`);

      // 4) Gerçek dokunmatik swipe (CDP Input.dispatchTouchEvent) boş alanda
      // sayfa değiştirmeli; grid ile dock arasındaki güvenli boşluğu hedefler.
      // Sayfa kaydirma yalnizca BOS alandan baslatilabilir: launcher, bir
      // uygulama ikonu veya slot uzerinden baslayan hareketi bilerek reddeder
      // (bkz. swipePointerDown), yoksa ikon suruklemeyle catisirdi.
      // "grid.bottom + 16" bu bosluga her zaman denk gelmiyordu; iki sayfali
      // duzende nokta son ikon sirasinin uzerine dusuyor ve swipe hic
      // baslamiyordu. Bu yuzden nokta varsayilmak yerine ARANIR.
      // Sayfa gorunumunun dikey ortasindan yatay kaydirma. Ikonlarin uzerinden
      // gecmesi sorun degil: launcher artik iOS gibi ikon uzerinden de
      // kaydirmaya izin veriyor (bkz. swipePointerDown). Dar ekranda ikonlar
      // tum alani doldurdugu icin "bos nokta" aramak zaten guvenilir degildi.
      const viewportBox = await evaluate(`(() => {
        const viewport = document.querySelector('#launcherPagesViewport').getBoundingClientRect();
        return {
          startX: viewport.right - 16,
          endX: viewport.left + 16,
          midY: Math.round(viewport.top + viewport.height / 2)
        };
      })()`);
      // Swipe baslamazsa sebebi hata mesajindan gorulebilsin.
      await evaluate(`window.__swipeStart = null;
        document.addEventListener('pointerdown', (e) => {
          window.__swipeStart = e.target.tagName + '.' + String(e.target.className || '').split(' ')[0];
        }, true);
        true`);
      await touchSwipe(viewportBox.startX, viewportBox.midY, viewportBox.endX, viewportBox.midY);
      const swipeStartTarget = await evaluate("window.__swipeStart");
      assert.equal(
        await evaluate("window.__LAUNCHER_STATE__.layout.activePage"), 1,
        `${tag}: gerçek touch swipe ikinci sayfaya geçmedi (dokunulan öğe ${swipeStartTarget})`
      );
      assert.equal(await evaluate("document.querySelector('[data-launcher-page-go=\"1\"]').classList.contains('is-active')"), true, `${tag}: swipe sonrası aktif nokta güncellenmedi`);

      // 5) Gerçek fare/dokunma tıklaması (CDP Input.dispatchMouseEvent) nokta
      // üzerinde sayfa değiştirmeli.
      await realTap('[data-launcher-page-go="0"]');
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.activePage"), 0, `${tag}: nokta tıklaması sayfa değiştirmedi`);
      assert.equal(await evaluate("document.querySelector('[data-launcher-page-go=\"0\"]').classList.contains('is-active')"), true, `${tag}: nokta tıklaması sonrası aktif nokta güncellenmedi`);

      if (browserConfig.name === BROWSERS[0].name) {
        const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(join(ARTIFACTS, `mobile-nav-${width}.png`), Buffer.from(screenshot.data, "base64"));
      }

      // Sonraki genişlik denemesi için düzeni varsayılana sıfırla.
      await evaluate("document.querySelector('#launcherEditToggle').click()");
      await waitFor("document.body.classList.contains('launcher-editing')");
      await evaluate("document.querySelector('[data-launcher-editor=reset]').click()");
      await waitFor("document.querySelector('[data-launcher-reset-confirm]')");
      await evaluate("document.querySelector('[data-launcher-reset-confirm]').click()");
      await evaluate("document.querySelector('[data-launcher-done]').click()");
      await waitFor("!document.body.classList.contains('launcher-editing') && window.__LAUNCHER_STATE__.layout.pages.length === 1");

      results.push({ width, dockHome: "visible", dockInApp: "hidden", dots: 2, swipe: "ok", tap: "ok" });
    }

    assert.deepEqual(consoleIssues, [], `${browserConfig.name} konsol hataları: ${consoleIssues.join(" | ")}`);
    return results;
  } finally {
    socket.close();
    await new Promise((resolveExit) => {
      if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) return resolveExit();
      browserProcess.once("exit", resolveExit);
      browserProcess.kill();
      setTimeout(resolveExit, 3000);
    });
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

try {
  for (const browser of BROWSERS) {
    const results = await runBrowser(browser);
    console.log(`\n${browser.name.toUpperCase()}`);
    console.table(results);
  }
  console.log("✓ Mobil dock görünürlüğü, geri tuşu ve gerçek sayfa noktası swipe/tıklama testleri geçti");
} finally {
  server.close();
}
