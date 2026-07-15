import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SERVER_PORT = 8774;
const ARTIFACTS = join(ROOT, "test-artifacts", "launcher");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp",
  ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml"
};
const BROWSERS = [
  { name: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", port: 9361 },
  { name: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", port: 9362 }
].filter((browser) => existsSync(browser.path));
const VIEWPORTS = [
  [320, 700], [360, 800], [390, 844], [430, 932],
  [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]
];
const THEME_MODES = ["dark", "light"];
const probeFolderExpr = () => `(() => {
  const dialog = document.querySelector('#launcherFolderDialog');
  const r = dialog.getBoundingClientRect();
  const style = getComputedStyle(dialog);
  const buttons = [...dialog.querySelectorAll('[data-launcher-item]')];
  const focusables = [...dialog.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((node) => node.offsetParent !== null);
  focusables.at(-1)?.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  const items = buttons.map((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
    const br = node.getBoundingClientRect();
    const cx = br.left + br.width / 2, cy = br.top + br.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { opacity: parseFloat(getComputedStyle(node).opacity), hitMatches: hit === node || node.contains(hit) };
  });
  return { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, count: buttons.length,
    background: style.backgroundColor, backdrop: style.backdropFilter || style.webkitBackdropFilter || 'none',
    trapped: document.activeElement === focusables[0], items };
})()`;

assert.ok(BROWSERS.length, "Test edilecek Chromium tarayıcısı bulunamadı");
await mkdir(ARTIFACTS, { recursive: true });

const local404s = [];
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
    local404s.push(request.url);
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolveListen) => server.listen(SERVER_PORT, "127.0.0.1", resolveListen));

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function runBrowser(browserConfig) {
  const profile = join(tmpdir(), `ravza-launcher-${browserConfig.name}-${Date.now()}`);
  const browserProcess = spawn(browserConfig.path, [
    "--headless=new", "--disable-gpu", "--no-first-run",
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
  const network404s = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") consoleIssues.push(message.params.exceptionDetails.text || "istisna");
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") consoleIssues.push(message.params.entry.text);
    if (message.method === "Network.responseReceived" && message.params.response.status === 404
      && message.params.response.url.startsWith(`http://127.0.0.1:${SERVER_PORT}`)) network404s.push(message.params.response.url);
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

  async function viewport(width, height) {
    await command("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 768,
      screenWidth: width, screenHeight: height
    });
    await delay(260);
  }

  async function waitFor(expression, timeout = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Zaman aşımı: ${expression}`);
  }

  const results = [];
  const glassByTheme = {};
  const isPrimaryBrowser = browserConfig.name === BROWSERS[0].name;
  try {
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Log.enable");
    await command("Network.enable");
    await viewport(390, 844);
    await command("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/index.html` });
    await waitFor("document.querySelectorAll('#launcherGrid .launcher-app').length > 0 && document.querySelector('.launcher-dock')");
    await delay(650);

    for (const themeMode of THEME_MODES) {
      await evaluate(`document.body.classList.toggle('dark', ${themeMode === "dark"})`);
      await delay(150);
      glassByTheme[themeMode] = {};

      for (const [width, height] of VIEWPORTS) {
        const tag = `${themeMode}/${width}`;
        await viewport(width, height);
        await evaluate("window.navigate('ana-sayfa', { history: false })");
        await waitFor("document.querySelector('#dashboard.active') && document.querySelectorAll('#launcherGrid .launcher-app').length > 0");
        const probe = await evaluate(`(() => {
          const rect = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const value = node.getBoundingClientRect();
            return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
          };
          function rectNode(node) { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; }
          const visibleTargets = [...document.querySelectorAll('button, a[href]')]
            .filter((node) => node.offsetParent !== null && !node.closest('[hidden]'))
            .map((node) => ({ name: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 30), ...rectNode(node) }));
          const bg = document.querySelector('#anaSayfaHeroStage');
          const bgStyle = getComputedStyle(bg);
          const topbarStyle = getComputedStyle(document.querySelector('.launcher-topbar'));
          const shellRects = {
            topbar: rect('.launcher-topbar'), dock: rect('.launcher-dock'), widget: rect('.launcher-widget'),
            grid: rect('.launcher-grid'), background: rect('#anaSayfaHeroStage')
          };
          const apps = [...document.querySelectorAll('#launcherGrid .launcher-app')].map((node) => {
            node.scrollIntoView({ block: "center", inline: "nearest" });
            const r = node.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const hit = document.elementFromPoint(cx, cy);
            return { width: r.width, height: r.height, opacity: parseFloat(getComputedStyle(node).opacity), hitMatches: hit === node || node.contains(hit) };
          });
          return {
            viewport: { width: innerWidth, height: innerHeight },
            scroll: { width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, main: document.querySelector('.main-content').scrollWidth },
            noSidebar: !document.querySelector('.sidebar') && !document.getElementById('sidebar-root'),
            ...shellRects,
            apps,
            targets: visibleTargets,
            backgroundPosition: bgStyle.position,
            backgroundFilter: bgStyle.filter,
            topbarBackdrop: topbarStyle.backdropFilter || topbarStyle.webkitBackdropFilter || 'none'
          };
        })()`);

        assert.equal(probe.noSidebar, true, `${tag}: eski sidebar DOM'da kaldı`);
        assert.ok(probe.scroll.width <= probe.scroll.client && probe.scroll.main <= probe.scroll.client, `${tag}: yatay taşma ${JSON.stringify(probe.scroll)}`);
        for (const [name, rect] of [["topbar", probe.topbar], ["dock", probe.dock], ["grid", probe.grid]]) {
          assert.ok(rect.left >= -1 && rect.right <= width + 1, `${tag}: ${name} viewport dışına taşıyor ${JSON.stringify(rect)}`);
        }
        if (probe.widget) assert.ok(probe.widget.left >= -1 && probe.widget.right <= width + 1, `${tag}: widget viewport dışına taşıyor ${JSON.stringify(probe.widget)}`);
        assert.ok(Math.abs(probe.background.left) <= 1 && Math.abs(probe.background.top) <= 1
          && Math.abs(probe.background.width - width) <= 1 && Math.abs(probe.background.height - height) <= 1,
        `${tag}: arka plan viewport'u kaplamıyor ${JSON.stringify(probe.background)}`);
        assert.equal(probe.backgroundFilter, "none", `${tag}: ana fotoğraf kalıcı olarak filtrelenmiş`);
        assert.ok(probe.apps.length > 0 && probe.apps.length <= 5, `${tag}: aktif sayfadaki ana kategori sayısı geçersiz`);
        assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.flatMap(page => page.items).filter(item => item.type !== 'widget').length"), 5, `${tag}: toplam ana kategori sayısı değişti`);
        assert.ok(probe.apps.every((app) => app.opacity > 0.9 && app.hitMatches), `${tag}: ana ekran uygulaması görünmez veya tıklanamaz ${JSON.stringify(probe.apps)}`);
        assert.ok(probe.targets.every((target) => target.width >= 43.5 && target.height >= 43.5), `${tag}: 44px altı hedef ${JSON.stringify(probe.targets.filter((target) => target.width < 43.5 || target.height < 43.5))}`);
        if (probe.topbarBackdrop !== "none") assert.match(probe.topbarBackdrop, /blur\(/, `${tag}: üst kontrol glass değil`);

        if (width === 390) {
          const glass = await evaluate(`(() => {
            function snap(sel) { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return { bg: s.backgroundColor }; }
            return { dock: snap('.launcher-dock'), topbar: snap('.launcher-topbar'), widget: snap('.launcher-widget') };
          })()`);
          Object.assign(glassByTheme[themeMode], glass);
        }

        let folder;
        for (const [folderId, expectedCount, label] of [["preparation", 8, "Hazırlık"], ["games", 9, "Oyun Alanı"]]) {
          await evaluate(`window.openLauncherFolder('${folderId}', document.querySelector('[data-launcher-folder=${folderId}]'), false)`);
          await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')")
            .catch((error) => { throw new Error(`${tag}/${folderId}: klasör açılamadı (${error.message})`); });
          const probedFolder = await evaluate(probeFolderExpr());
          if (folderId === "preparation") folder = probedFolder;
          assert.equal(probedFolder.count, expectedCount, `${tag}: ${label} klasörü ${expectedCount} uygulama içermiyor`);
          assert.ok(probedFolder.rect.left >= -1 && probedFolder.rect.right <= width + 1 && probedFolder.rect.top >= -1 && probedFolder.rect.bottom <= height + 1, `${tag}: ${label} klasörü viewport dışına taşıyor`);
          assert.equal(probedFolder.trapped, true, `${tag}: ${label} klasörü focus trap çalışmıyor`);
          assert.notEqual(probedFolder.backdrop, "none", `${tag}: ${label} klasörü glass blur kullanmıyor`);
          assert.ok(probedFolder.items.every((item) => item.opacity > 0.9 && item.hitMatches), `${tag}: ${label} klasöründe görünmez/tıklanamaz uygulama ${JSON.stringify(probedFolder.items)}`);
          const openPointerEvents = await evaluate("getComputedStyle(document.querySelector('#launcherFolderLayer')).pointerEvents");
          assert.notEqual(openPointerEvents, "none", `${tag}: ${label} açıkken pointer-events none olmamalı`);

          if (folderId === "preparation" && width === 390) glassByTheme[themeMode].dialog = { bg: probedFolder.background };

          if (isPrimaryBrowser && themeMode === "dark" && width === 390) {
            const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
            const filename = folderId === "preparation" ? "preparation-folder-mobile-390.png" : "games-folder-mobile-390.png";
            await writeFile(join(ARTIFACTS, filename), Buffer.from(screenshot.data, "base64"));
          }
          if (isPrimaryBrowser && themeMode === "dark" && width === 1440 && folderId === "preparation") {
            const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
            await writeFile(join(ARTIFACTS, "preparation-folder-desktop-1440.png"), Buffer.from(screenshot.data, "base64"));
          }

          await evaluate("window.closeLauncherFolder(false)");
          await waitFor("document.querySelector('#launcherFolderLayer').hidden");
          const closedState = await evaluate("(() => { const l = document.querySelector('#launcherFolderLayer'); const cs = getComputedStyle(l); return { hidden: l.hidden, pointerEvents: cs.pointerEvents }; })()");
          assert.equal(closedState.hidden, true, `${tag}: ${label} kapandıktan sonra hidden değil`);
          assert.equal(closedState.pointerEvents, "none", `${tag}: ${label} kapalıyken pointer-events none olmalı`);
        }

        await evaluate(`(() => {
          window.openLauncherSearch(document.querySelector('#launcherSearchOpen'), false);
          const input = document.querySelector('#launcherSearchInput');
          input.value = 'Object Pronouns';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        await waitFor("document.querySelector('[data-launcher-topic=objectpronouns]')");
        assert.equal(await evaluate("document.querySelectorAll('#launcherSearchResults [data-launcher-topic]').length >= 1"), true, `${tag}: ders araması sonuç vermedi`);
        await evaluate("window.closeLauncherSearch(false)");
        await delay(230);

        if (width === 390 && themeMode === "dark") {
          await evaluate("window.openLauncherFolder('preparation', document.querySelector('[data-launcher-folder=preparation]'), false)");
          await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
          await evaluate("document.querySelector('#launcherFolderGrid [data-launcher-item=ravzalingo]').click()");
          await waitFor("document.body.dataset.currentRoute === 'ravzalingo'");
          assert.equal(await evaluate("new URL(location.href).searchParams.get('page')"), "ravzalingo", "Route URL'ye yazılmadı");
          assert.equal(await evaluate("getComputedStyle(document.querySelector('.launcher-dock')).visibility"), "hidden", "İç sayfada dock görünür kaldı");
          await evaluate("history.back()");
          await waitFor("document.body.dataset.currentRoute === 'ana-sayfa'");
          assert.equal(await evaluate("getComputedStyle(document.querySelector('.launcher-dock')).visibility"), "visible", "Geri dönüşte dock tekrar görünmedi");

          await evaluate("window.openLauncherFolder('games', document.querySelector('[data-launcher-folder=games]'), false)");
          await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
          await evaluate("document.querySelector('#launcherFolderGrid [data-launcher-item=sudoku]').click()");
          await waitFor("document.body.classList.contains('is-game-fullscreen') && !document.querySelector('#gameStage').hidden");
          assert.equal(await evaluate("document.querySelector('#gameStageTitle').textContent"), "Sudoku", "Launcher iç oyun eylemi doğru oyunu açmadı");
          await evaluate("document.querySelector('#gameCloseBtn').click()");
          await waitFor("!document.body.classList.contains('is-game-fullscreen')");

          await evaluate("window.navigate('ravzalingo')");
          await waitFor("document.body.dataset.currentRoute === 'ravzalingo'");
          await command("Page.reload", { ignoreCache: true });
          await waitFor("typeof window.navigate === 'function' && document.body.dataset.currentRoute", 15000);
          assert.equal(await evaluate("document.body.dataset.currentRoute"), "ravzalingo", "Sayfa yenilendiğinde route korunmadı");
          assert.equal(await evaluate("getComputedStyle(document.querySelector('.launcher-dock')).visibility"), "hidden", "Yenileme sonrası iç sayfada dock görünür kaldı");

          await evaluate("window.navigate('ana-sayfa', { history: false })");
          await waitFor("document.body.dataset.currentRoute === 'ana-sayfa'");
          assert.equal(await evaluate("getComputedStyle(document.querySelector('.launcher-dock')).visibility"), "visible", "Ana sayfaya dönüşte dock görünmedi");
        }

        if (isPrimaryBrowser && width === 390) {
          const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          if (themeMode === "dark") {
            await writeFile(join(ARTIFACTS, "launcher-mobile-390.png"), Buffer.from(screenshot.data, "base64"));
            await writeFile(join(ARTIFACTS, "launcher-dark-mobile-390.png"), Buffer.from(screenshot.data, "base64"));
          } else {
            await writeFile(join(ARTIFACTS, "launcher-light-mobile-390.png"), Buffer.from(screenshot.data, "base64"));
          }
        }
        if (isPrimaryBrowser && themeMode === "dark" && width === 1440) {
          const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          await writeFile(join(ARTIFACTS, "launcher-desktop-1440.png"), Buffer.from(screenshot.data, "base64"));
        }
        results.push({ theme: themeMode, width, scroll: `${probe.scroll.width}/${probe.scroll.client}`, apps: probe.apps.length, preparation: folder.count });
      }
    }

    for (const surface of ["dock", "topbar", "dialog"]) {
      assert.notEqual(glassByTheme.dark[surface].bg, glassByTheme.light[surface].bg, `${surface}: açık/koyu temada arka plan aynı kaldı (glass token regresyonu)`);
    }

    await evaluate("window.navigate('oyun', { history: false })");
    await waitFor("document.body.dataset.currentRoute === 'oyun' && document.querySelectorAll('.game-tile-img').length === 9");
    for (const [width, height] of VIEWPORTS) {
      await viewport(width, height);
      await waitFor("[...document.querySelectorAll('.game-tile-img')].every((image) => image.complete && image.naturalWidth > 0)");
      const gamesProbe = await evaluate(`(() => {
        const images = [...document.querySelectorAll('.game-tile-img')];
        const tiles = [...document.querySelectorAll('.game-tile')];
        const viewportWidth = document.documentElement.clientWidth;
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth,
          images: images.map((image) => ({
            width: image.naturalWidth,
            height: image.naturalHeight,
            fit: getComputedStyle(image).objectFit,
            src: new URL(image.currentSrc || image.src).pathname
          })),
          tilesInsideViewport: tiles.every((tile) => {
            const rect = tile.getBoundingClientRect();
            return rect.left >= -1 && rect.right <= viewportWidth + 1;
          })
        };
      })()`);
      assert.equal(gamesProbe.images.length, 9, `${width}x${height}: oyun ikonu sayisi hatali`);
      assert.ok(gamesProbe.images.every((image) => image.width === 1024 && image.height === 1024), `${width}x${height}: 1024x1024 olmayan oyun ikonu var`);
      assert.ok(gamesProbe.images.every((image) => image.fit === "contain"), `${width}x${height}: object-fit contain uygulanmayan ikon var`);
      assert.ok(gamesProbe.images.every((image) => image.src.startsWith("/assets/icons/games/")), `${width}x${height}: ortak klasor disinda ikon yolu var`);
      assert.ok(gamesProbe.scrollWidth <= gamesProbe.viewportWidth + 1, `${width}x${height}: oyun ekrani yatay tasiyor`);
      assert.ok(gamesProbe.tilesInsideViewport, `${width}x${height}: oyun karti viewport disina tasiyor`);

      if (isPrimaryBrowser && width === 390 && height === 844) {
        const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(join(ARTIFACTS, "games-page-mobile-390.png"), Buffer.from(screenshot.data, "base64"));
      }
      if (isPrimaryBrowser && width === 1440) {
        const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(join(ARTIFACTS, "games-page-desktop-1440.png"), Buffer.from(screenshot.data, "base64"));
      }
    }
    await evaluate("window.navigate('ana-sayfa', { history: false })");
    await waitFor("document.body.dataset.currentRoute === 'ana-sayfa'");

    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await evaluate("window.openLauncherFolder('preparation', document.querySelector('[data-launcher-folder=preparation]'), false)");
    const reducedMotion = await evaluate("getComputedStyle(document.querySelector('#launcherFolderDialog')).transitionDuration");
    assert.ok(reducedMotion.split(",").every((value) => parseFloat(value) <= .001), `Reduced motion aktif değil: ${reducedMotion}`);
    await evaluate("window.closeLauncherFolder(false)");

    await command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
    const forced = await evaluate(`(() => { const s = getComputedStyle(document.querySelector('.launcher-dock')); return { backdrop: s.backdropFilter || s.webkitBackdropFilter || 'none', border: s.borderColor }; })()`);
    assert.equal(forced.backdrop, "none", "Forced colors blur'u kapatmadı");
    assert.notEqual(forced.border, "rgba(0, 0, 0, 0)", "Forced colors sınırı görünmüyor");
    await command("Emulation.setEmulatedMedia", { features: [] });

    assert.deepEqual(consoleIssues, [], `${browserConfig.name} konsol hataları: ${consoleIssues.join(" | ")}`);
    assert.deepEqual(network404s, [], `${browserConfig.name} 404: ${network404s.join(" | ")}`);
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
  assert.deepEqual(local404s, [], `Statik 404: ${local404s.join(" | ")}`);
  console.log("✓ Launcher responsive, klasör, arama, route, focus ve erişilebilirlik testleri geçti");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
