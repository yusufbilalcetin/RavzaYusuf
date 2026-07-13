import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SERVER_PORT = 8775;
const ARTIFACTS = join(ROOT, "test-artifacts", "launcher-edit");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp",
  ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml"
};
const BROWSERS = [
  { name: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", port: 9371 },
  { name: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", port: 9372 }
].filter((browser) => existsSync(browser.path));
const VIEWPORTS = [[320, 700], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const LAYOUT_KEY = "ravzaders.launcher.layout.v4";

assert.ok(BROWSERS.length, "Chrome veya Edge bulunamadı");
await mkdir(ARTIFACTS, { recursive: true });

const local404s = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${SERVER_PORT}`).pathname);
    let filePath = resolve(ROOT, `.${pathname}`);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) throw new Error("Geçersiz yol");
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    response.writeHead(200, { "content-type": TYPES[extname(filePath).toLowerCase()] || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    local404s.push(request.url);
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolveListen) => server.listen(SERVER_PORT, "127.0.0.1", resolveListen));

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function runBrowser(config) {
  const profile = join(tmpdir(), `ravza-launcher-edit-${config.name}-${Date.now()}`);
  const browser = spawn(config.path, [
    "--headless=new", "--no-first-run", `--remote-debugging-port=${config.port}`,
    `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: "ignore" });

  async function pageTarget() {
    for (let attempt = 0; attempt < 70; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${config.port}/json/list`).then((response) => response.json());
        const page = targets.find((target) => target.type === "page");
        if (page) return page;
      } catch { /* Tarayıcı başlatılıyor. */ }
      await delay(100);
    }
    throw new Error(`${config.name} başlatılamadı`);
  }

  const target = await pageTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  let commandId = 0;
  const pending = new Map();
  const consoleIssues = [];
  const network404s = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") consoleIssues.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
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
    const id = ++commandId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolve: resolveCommand, reject: rejectCommand }));
  }
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function viewport(width, height) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height });
    await delay(240);
  }
  async function waitFor(expression, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await delay(80);
    }
    throw new Error(`Zaman aşımı: ${expression}`);
  }
  async function reload() {
    await command("Page.reload", { ignoreCache: true });
    await waitFor("document.querySelectorAll('#launcherGrid .launcher-app').length > 0 && window.__LAUNCHER_STATE__");
    await delay(300);
  }
  async function screenshot(name) {
    const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(ARTIFACTS, name), Buffer.from(shot.data, "base64"));
  }
  async function point(selector) {
    return evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); if(!n) return null; n.scrollIntoView({block:'center',inline:'nearest'}); const r=n.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  }
  async function mouseDrag(sourceSelector, destination, { dwell = 80, screenshotName = "" } = {}) {
    const start = await point(sourceSelector);
    assert.ok(start, `${sourceSelector} bulunamadı`);
    const end = typeof destination === "string" ? await point(destination) : destination;
    assert.ok(end, `Hedef bulunamadı: ${destination}`);
    const hit = await evaluate(`(() => { const n=document.elementFromPoint(${start.x},${start.y}); return n ? {tag:n.tagName, cls:n.className?.baseVal||n.className||'', label:n.getAttribute?.('aria-label')||'', id:n.id||''} : null; })()`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: start.x, y: start.y, button: "left", clickCount: 1 });
    await delay(40);
    assert.equal(await evaluate("Boolean(window.__LAUNCHER_STATE__.drag)"), true, `${sourceSelector}: pointer drag başlamadı; hit=${JSON.stringify(hit)}`);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: end.x, y: end.y, button: "left", buttons: 1 });
    await delay(dwell);
    if (dwell >= 500) {
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: end.x - 2, y: end.y, button: "left", buttons: 1 });
      await delay(60);
    }
    const target = await evaluate(`(() => { const t=window.__LAUNCHER_STATE__.drag?.target; return t ? { id:t.dataset?.launcherId||t.id||'', context:t.dataset?.launcherContext||'', page:t.dataset?.launcherPage||'', index:t.dataset?.launcherIndex||'', className:t.className||'' } : null; })()`);
    if (screenshotName) await screenshot(screenshotName);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: end.x, y: end.y, button: "left", clickCount: 1 });
    await delay(260);
    return target;
  }

  const results = [];
  const primary = config.name === BROWSERS[0].name;
  try {
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Log.enable");
    await command("Network.enable");
    await viewport(390, 844);
    await command("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/index.html` });
    await waitFor("document.querySelectorAll('#launcherGrid .launcher-app').length > 0 && window.__LAUNCHER_STATE__");
    await evaluate(`localStorage.removeItem(${JSON.stringify(LAYOUT_KEY)}); location.reload()`);
    await waitFor("document.querySelectorAll('#launcherGrid .launcher-app').length > 0 && window.__LAUNCHER_STATE__");
    await delay(350);

    const normal = await evaluate(`(() => ({
      editing: document.body.classList.contains('launcher-editing'),
      removes: [...document.querySelectorAll('[data-launcher-remove]')].filter(n=>n.offsetParent!==null).length,
      toolbarHidden: document.querySelector('#launcherEditToolbar').hidden,
      editVisible: document.querySelector('#launcherEditToggle').offsetParent!==null
    }))()`);
    assert.deepEqual(normal, { editing: false, removes: 0, toolbarHidden: true, editVisible: true }, `${config.name}: normal mod temiz değil`);
    if (primary) await screenshot("mobile-normal-390.png");

    await evaluate("document.querySelector('#launcherEditToggle').click()");
    await waitFor("document.body.classList.contains('launcher-editing') && !document.querySelector('#launcherEditToolbar').hidden");
    const edit = await evaluate(`(() => ({
      removes: [...document.querySelectorAll('[data-launcher-remove]')].filter(n=>n.offsetParent!==null).length,
      done: [...document.querySelectorAll('[data-launcher-done]')].some(n=>n.offsetParent!==null),
      widget: [...document.querySelectorAll('[data-launcher-editor="widgets"]')].some(n=>n.offsetParent!==null),
      newPage: [...document.querySelectorAll('[data-launcher-add-page]')].some(n=>n.offsetParent!==null),
      dots: document.querySelectorAll('[data-launcher-page-go]').length,
      dockEditing: document.querySelector('#launcherDock').classList.contains('is-editing')
    }))()`);
    assert.ok(edit.removes >= 8 && edit.done && edit.widget && edit.newPage && edit.dots === 1 && edit.dockEditing, `${config.name}: edit kontrolleri eksik ${JSON.stringify(edit)}`);
    const routeBefore = await evaluate("document.body.dataset.currentRoute");
    await evaluate("document.querySelector('[data-launcher-id=grade1] .launcher-app').click()");
    await delay(120);
    assert.equal(await evaluate("document.body.dataset.currentRoute"), routeBefore, `${config.name}: edit modunda route açıldı`);
    await evaluate("window.openLauncherSearch()");
    assert.equal(await evaluate("document.querySelector('#launcherSearchLayer').hidden"), true, `${config.name}: edit modunda arama açıldı`);
    if (primary) await screenshot("mobile-edit-mode-390.png");

    const beforeOrder = await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.map(i=>i.id).join(',')");
    const samePageTarget = await mouseDrag('[data-launcher-context="page"][data-launcher-id="grade2"] .launcher-app', '[data-launcher-context="page"][data-launcher-id="grade1"] .launcher-app');
    const afterOrder = await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.map(i=>i.id).join(',')");
    assert.notEqual(afterOrder, beforeOrder, `${config.name}: aynı sayfa drag sıralamayı değiştirmedi; hedef=${JSON.stringify(samePageTarget)}`);

    await evaluate("document.querySelector('[data-launcher-add-page]').click()");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 2, `${config.name}: yeni sayfa eklenmedi`);
    assert.equal(await evaluate("document.querySelectorAll('[data-launcher-page-go]').length"), 2, `${config.name}: sayfa noktası eklenmedi`);
    if (primary) await screenshot("mobile-page-2-390.png");
    await evaluate("document.querySelector('[data-launcher-page-go=\"0\"]').click()");
    await delay(240);
    await mouseDrag('[data-launcher-context="page"][data-launcher-id="preparation"] .launcher-app', { x: 388, y: 430 }, { dwell: 650 });
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages[1].items.some(i=>i.id==='preparation')"), true, `${config.name}: uygulama ikinci sayfaya taşınmadı`);

    await mouseDrag('[data-launcher-context="page"][data-launcher-id="preparation"] .launcher-app', { x: 388, y: 430 }, { dwell: 650, screenshotName: primary ? "mobile-drag-between-pages-390.png" : "" });
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 3, `${config.name}: edge dwell otomatik sayfa üretmedi`);
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages[2].items.some(i=>i.id==='preparation')"), true, `${config.name}: otomatik sayfaya bırakılmadı`);

    await evaluate("document.querySelector('[data-launcher-add-page]').click()");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 4);
    await evaluate("document.querySelector('[data-launcher-done]').click()");
    await waitFor("!document.body.classList.contains('launcher-editing')");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 3, `${config.name}: boş son sayfa temizlenmedi`);
    assert.equal(await evaluate("[...document.querySelectorAll('[data-launcher-remove]')].filter(n=>n.offsetParent!==null).length"), 0, `${config.name}: Bitti sonrası silme kontrolü kaldı`);

    await evaluate("document.querySelector('#launcherEditToggle').click(); document.querySelector('[data-launcher-editor=widgets]').click()");
    await waitFor("!document.querySelector('#launcherEditorLayer').hidden && document.querySelector('[data-launcher-add-widget=daily-goal]')");
    if (primary) await screenshot("mobile-widget-gallery-390.png");
    await evaluate("document.querySelector('[data-launcher-add-widget=daily-goal]').click()");
    await waitFor("document.querySelector('[data-launcher-id=daily-goal] .launcher-widget')");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.some(p=>p.items.some(i=>i.id==='daily-goal'))"), true, `${config.name}: widget eklenmedi`);
    await delay(260);
    await mouseDrag('[data-launcher-context="page"][data-launcher-id="daily-goal"] .launcher-widget', { x: 2, y: 430 }, { dwell: 650 });
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages[1].items.some(i=>i.id==='daily-goal')"), true, `${config.name}: widget pointer ile sayfalar arasında taşınmadı`);
    await evaluate(`(() => { const widget=document.querySelector('[data-launcher-id=daily-goal] .launcher-widget'); widget.focus(); widget.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true})); widget.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',bubbles:true})); const moved=document.querySelector('[data-launcher-id=daily-goal] .launcher-widget'); moved.focus(); moved.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
    await delay(220);
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.some(i=>i.id==='daily-goal')"), true, `${config.name}: widget klavyeyle sayfalar arasında taşınmadı`);
    await evaluate("document.querySelector('[data-launcher-id=daily-goal] [data-launcher-remove]').click()");
    await waitFor("document.querySelector('[data-launcher-remove-confirm]')");
    await evaluate("document.querySelector('[data-launcher-remove-confirm]').click()");
    await waitFor("document.querySelector('#launcherEditorLayer').hidden");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.some(p=>p.items.some(i=>i.id==='daily-goal'))"), false, `${config.name}: widget silinmedi`);

    await evaluate("document.querySelector('[data-launcher-page-go=\"0\"]').click()");
    await delay(220);
    await evaluate("document.querySelector('[data-launcher-id=grade1] [data-launcher-remove]').click()");
    await waitFor("document.querySelector('[data-launcher-remove-confirm]')");
    await evaluate("document.querySelector('[data-launcher-remove-confirm]').click()");
    await waitFor("document.querySelector('#launcherEditorLayer').hidden");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.hiddenApps.includes('grade1')"), true, `${config.name}: uygulama gizlenmedi`);
    await evaluate("document.querySelector('[data-launcher-editor=apps]').click()");
    await waitFor("document.querySelector('[data-launcher-add-app=grade1]')");
    await evaluate("document.querySelector('#launcherEditorTargetPage').value='0'; document.querySelector('[data-launcher-add-app=grade1]').click()");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.some(i=>i.id==='grade1')"), true, `${config.name}: uygulama geri eklenmedi`);
    await delay(260);

    const dockBefore = await evaluate("window.__LAUNCHER_STATE__.layout.dock.join(',')");
    await mouseDrag('[data-launcher-context="dock"][data-launcher-id="ravzalingo"] .launcher-app', '[data-launcher-context="dock"][data-launcher-id="quizhub"] .launcher-app');
    assert.notEqual(await evaluate("window.__LAUNCHER_STATE__.layout.dock.join(',')"), dockBefore, `${config.name}: dock sırası değişmedi`);
    await evaluate("document.querySelector('[data-launcher-context=dock][data-launcher-id=kahoot] [data-launcher-remove]').click()");
    await waitFor("document.querySelector('[data-launcher-remove-confirm]')");
    await evaluate("document.querySelector('[data-launcher-remove-confirm]').click()");
    await waitFor("document.querySelector('#launcherEditorLayer').hidden");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.dock.includes('kahoot')"), false, `${config.name}: dock öğesi silinmedi`);
    await mouseDrag('[data-launcher-context="page"][data-launcher-id="grade1"] .launcher-app', '#launcherDock');
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.dock.includes('grade1')"), true, `${config.name}: ana ekrandan dock'a eklenmedi`);
    await mouseDrag('[data-launcher-context="dock"][data-launcher-id="grade1"] .launcher-app', '.launcher-page.is-active .launcher-apps');
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.dock.includes('grade1')"), false, `${config.name}: dock'tan ana sayfaya çıkarılmadı`);

    const persisted = await evaluate("JSON.stringify(window.__LAUNCHER_STATE__.layout)");
    await evaluate("document.querySelector('[data-launcher-done]').click()");
    await reload();
    assert.equal(await evaluate("JSON.stringify(window.__LAUNCHER_STATE__.layout)"), persisted, `${config.name}: yerleşim reload sonrası korunmadı`);

    await evaluate(`localStorage.setItem(${JSON.stringify(LAYOUT_KEY)}, '{bozuk-json'); location.reload()`);
    await waitFor("window.__LAUNCHER_STATE__ && document.querySelectorAll('#launcherGrid .launcher-app').length>0");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 1, `${config.name}: bozuk storage fallback olmadı`);
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.dock.length"), 4, `${config.name}: bozuk storage dock fallback olmadı`);

    await evaluate("document.querySelector('#launcherEditToggle').click(); document.querySelector('[data-launcher-add-page]').click(); document.querySelector('[data-launcher-editor=reset]').click()");
    await waitFor("document.querySelector('[data-launcher-reset-confirm]')");
    await evaluate("document.querySelector('[data-launcher-reset-confirm]').click()");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 1, `${config.name}: varsayılan düzen sıfırlanmadı`);

    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const reduced = await evaluate("getComputedStyle(document.querySelector('.launcher-app-icon')).animationName");
    assert.equal(reduced, "none", `${config.name}: reduced motion wiggle kapanmadı`);
    await command("Emulation.setEmulatedMedia", { features: [] });

    await evaluate("document.querySelector('[data-launcher-add-page]').click(); document.querySelector('[data-launcher-page-go=\"0\"]').click()");
    await delay(220);
    await evaluate(`(() => { const v=document.querySelector('#launcherPagesViewport'); v.dispatchEvent(new PointerEvent('pointerdown',{pointerId:90,clientX:330,clientY:500,bubbles:true})); document.dispatchEvent(new PointerEvent('pointermove',{pointerId:90,clientX:80,clientY:505,bubbles:true})); document.dispatchEvent(new PointerEvent('pointerup',{pointerId:90,clientX:80,clientY:505,bubbles:true})); })()`);
    await delay(240);
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.activePage"), 1, `${config.name}: edit modunda swipe sayfa değiştirmedi`);
    await evaluate("document.querySelector('[data-launcher-page-go=\"0\"]').click()");
    await delay(200);
    await mouseDrag('[data-launcher-context="page"][data-launcher-id="grade1"] .launcher-app', { x: 388, y: 430 }, { dwell: 650 });
    await evaluate("document.querySelector('[data-launcher-done]').click()");
    await waitFor("!document.body.classList.contains('launcher-editing')");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 2, `${config.name}: swipe testi için ikinci sayfa korunmadı`);
    await evaluate(`(() => { const v=document.querySelector('#launcherPagesViewport'); v.dispatchEvent(new PointerEvent('pointerdown',{pointerId:91,clientX:330,clientY:500,bubbles:true})); document.dispatchEvent(new PointerEvent('pointermove',{pointerId:91,clientX:80,clientY:505,bubbles:true})); document.dispatchEvent(new PointerEvent('pointerup',{pointerId:91,clientX:80,clientY:505,bubbles:true})); })()`);
    await delay(260);
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.activePage"), 1, `${config.name}: mobil swipe sayfa değiştirmedi`);
    await evaluate("document.querySelector('[data-launcher-page-go=\"0\"]').click()");
    await delay(200);
    await evaluate("document.querySelector('[data-launcher-id=grade2] .launcher-app').click()");
    await waitFor("document.body.dataset.currentRoute==='ikinci-sinif'");
    assert.equal(await evaluate("new URLSearchParams(location.search).get('page')"), "ikinci-sinif", `${config.name}: normal mod route açılmadı`);
    await evaluate("window.navigate('ana-sayfa')");
    await waitFor("document.querySelector('#dashboard.active')");

    for (const [width, height] of VIEWPORTS) {
      await viewport(width, height);
      const normalProbe = await evaluate(`(() => ({
        width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
        editing: document.body.classList.contains('launcher-editing'),
        visibleRemoves: [...document.querySelectorAll('[data-launcher-remove]')].filter(n=>n.offsetParent!==null).length,
        errors: document.querySelectorAll('.launcher-error').length
      }))()`);
      assert.ok(normalProbe.width <= normalProbe.client, `${config.name}/${width}: normal yatay taşma ${JSON.stringify(normalProbe)}`);
      assert.equal(normalProbe.visibleRemoves, 0, `${config.name}/${width}: normal modda edit kontrolü görünüyor`);
      await evaluate("document.querySelector('#launcherEditToggle').click()");
      await delay(100);
      const editProbe = await evaluate(`(() => ({
        width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
        toolbar: document.querySelector('#launcherEditToolbar').getBoundingClientRect().toJSON(),
        targetSizes: [...document.querySelectorAll('#launcherEditToolbar button,[data-launcher-remove]')].filter(n=>n.offsetParent!==null).map(n=>{const r=n.getBoundingClientRect();return [r.width,r.height]})
      }))()`);
      assert.ok(editProbe.width <= editProbe.client, `${config.name}/${width}: edit yatay taşma ${JSON.stringify(editProbe)}`);
      assert.ok(editProbe.toolbar.left >= -.5 && editProbe.toolbar.right <= width + .5, `${config.name}/${width}: toolbar viewport dışında`);
      assert.ok(editProbe.targetSizes.every(([w, h]) => w >= 44 && h >= 44), `${config.name}/${width}: 44px altı edit hedefi ${JSON.stringify(editProbe.targetSizes)}`);
      results.push({ width, normal: `${normalProbe.width}/${normalProbe.client}`, edit: `${editProbe.width}/${editProbe.client}`, pages: await evaluate("window.__LAUNCHER_STATE__.layout.pages.length") });
      await evaluate("document.querySelector('[data-launcher-done]').click()");
      await delay(80);
    }

    if (primary) {
      await viewport(1440, 900);
      await evaluate("window.navigate('ana-sayfa')");
      await waitFor("document.querySelector('#dashboard.active')");
      await screenshot("desktop-normal-1440.png");
      await evaluate("document.querySelector('#launcherEditToggle').click()");
      await delay(180);
      await screenshot("desktop-edit-mode-1440.png");
      await evaluate("document.querySelector('[data-launcher-editor=widgets]').click()");
      await waitFor("!document.querySelector('#launcherEditorLayer').hidden");
      await delay(220);
      await screenshot("desktop-widget-gallery-1440.png");
      await evaluate("document.querySelector('[data-launcher-editor-close]').click(); document.querySelector('[data-launcher-done]').click()");
    }

    assert.deepEqual(consoleIssues, [], `${config.name}: console hataları ${consoleIssues.join(" | ")}`);
    assert.deepEqual(network404s, [], `${config.name}: 404 ${network404s.join(" | ")}`);
    return results;
  } finally {
    socket.close();
    await new Promise((resolveExit) => {
      if (browser.exitCode !== null || browser.signalCode !== null) return resolveExit();
      browser.once("exit", resolveExit);
      browser.kill();
      setTimeout(resolveExit, 3000);
    });
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

try {
  for (const browser of BROWSERS) {
    const results = await runBrowser(browser);
    console.log(`\n${browser.name.toUpperCase()} EDIT MODE`);
    console.table(results);
  }
  assert.deepEqual(local404s, [], `Statik 404: ${local404s.join(" | ")}`);
  console.log("✓ Launcher edit mode, drag, sayfa, widget, dock, storage, swipe ve responsive testleri geçti");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
