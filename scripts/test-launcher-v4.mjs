import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { LAUNCHER_GROUPS, launcherRegistryEntries } from "../js/data/launcher-navigation.js";
import { normalizeSearchText } from "../js/utils/search.js";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const PORT = 8783;
const ARTIFACTS = join(ROOT, "test-artifacts", "launcher-v4");
const LAYOUT_KEY = "ravzaders.launcher.layout.v4";
const LEGACY_V3_KEY = "ravzaders.launcher.layout.v3";
const LEGACY_V1_KEY = "ravzaders.launcher.layout.v1";
const VIEWPORTS = [
  [320, 700], [360, 800], [390, 844], [430, 932],
  [768, 1024], [820, 1180], [1180, 820],
  [1200, 800], [1366, 768], [1440, 900], [1920, 1080]
];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp",
  ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml"
};
const BROWSERS = [
  { name: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", port: 9471 },
  { name: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", port: 9472 }
].filter((browser) => existsSync(browser.path));
const ROUTE_ENTRIES = launcherRegistryEntries().filter((entry) => entry.type !== "folder" && entry.route);
const LINK_ENTRIES = launcherRegistryEntries().filter((entry) => entry.type === "link" && entry.href);

assert.ok(BROWSERS.length, "Chrome veya Edge bulunamadı");
assert.equal(normalizeSearchText("Şans Çarkı"), "sans carki");
assert.equal(normalizeSearchText("Çalışma / calısma"), "calisma calisma");
for (const entry of launcherRegistryEntries()) {
  for (const field of ["id", "title", "route", "icon", "category", "removable", "searchable", "keywords", "defaultPage", "defaultDockEligible", "searchIndex"]) {
    assert.ok(Object.hasOwn(entry, field), `${entry.id}: registry alanı eksik: ${field}`);
  }
}

await mkdir(ARTIFACTS, { recursive: true });
const local404s = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${PORT}`).pathname);
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
await new Promise((done) => server.listen(PORT, "127.0.0.1", done));
for (const entry of LINK_ENTRIES) {
  const response = await fetch(new URL(entry.href, `http://127.0.0.1:${PORT}/index.html`));
  assert.equal(response.status, 200, `${entry.id}: harici oyun yolu açılamadı`);
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

async function runBrowser(config) {
  const profile = join(tmpdir(), `ravzaders-launcher-v4-${config.name}-${Date.now()}`);
  const browser = spawn(config.path, [
    "--headless=new", "--no-first-run", "--disable-background-networking",
    `--remote-debugging-port=${config.port}`, `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: "ignore" });
  const runtimeIssues = [];
  const network404s = [];

  async function findPage() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${config.port}/json/list`).then((response) => response.json());
        const target = targets.find((item) => item.type === "page");
        if (target) return target;
      } catch { /* Tarayıcı başlıyor. */ }
      await delay(100);
    }
    throw new Error(`${config.name} başlatılamadı`);
  }

  const target = await findPage();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") runtimeIssues.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") runtimeIssues.push(message.params.entry.text);
    if (message.method === "Network.responseReceived" && message.params.response.status === 404 && message.params.response.url.startsWith(`http://127.0.0.1:${PORT}`)) network404s.push(message.params.response.url);
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
  async function waitFor(expression, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await delay(70);
    }
    throw new Error(`${config.name}: zaman aşımı: ${expression}`);
  }
  async function viewport(width, height) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height });
    await delay(260);
  }
  async function point(selector) {
    return evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node) return null; node.scrollIntoView({block:'center',inline:'nearest'}); const box=node.getBoundingClientRect(); return {x:box.left+box.width/2,y:box.top+box.height/2}; })()`);
  }
  async function click(selector) {
    const targetPoint = await point(selector);
    assert.ok(targetPoint, `${config.name}: tıklama hedefi yok: ${selector}`);
    const hit = await evaluate(`(() => { const node=document.elementFromPoint(${targetPoint.x},${targetPoint.y}); return {tag:node?.tagName||'',className:node?.className?.baseVal||node?.className||'',launcherId:node?.closest?.('[data-launcher-id]')?.dataset?.launcherId||'',action:node?.closest?.('button,a')?.getAttribute?.('data-launcher-widget-route')||node?.closest?.('button,a')?.getAttribute?.('data-launcher-item')||''}; })()`);
    const geometry = await evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); const box=node?.getBoundingClientRect(); const scroller=document.querySelector('.main-content'); const page=node?.closest('.launcher-page'); const style=node?getComputedStyle(node):null; return {point:${JSON.stringify(targetPoint)},box:box?{left:box.left,top:box.top,width:box.width,height:box.height}:null,scrollTop:scroller?.scrollTop,scrollHeight:scroller?.scrollHeight,clientHeight:scroller?.clientHeight,display:style?.display,visibility:style?.visibility,opacity:style?.opacity,pointer:style?.pointerEvents,pageClass:page?.className,pageInert:page?.hasAttribute('inert'),dashboardClass:document.querySelector('#dashboard')?.className,bodyClass:document.body.className}; })()`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", ...targetPoint, button: "left", clickCount: 1 });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...targetPoint, button: "left", clickCount: 1 });
    await delay(230);
    return { ...hit, geometry };
  }
  async function drag(sourceSelector, targetSelector, dwell = 100) {
    const source = await point(sourceSelector);
    const destination = await point(targetSelector);
    assert.ok(source && destination, `${config.name}: sürükleme noktası bulunamadı`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", ...source, button: "left", clickCount: 1 });
    await delay(45);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...destination, button: "left", buttons: 1 });
    await delay(dwell);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...destination, button: "left", clickCount: 1 });
    await delay(280);
  }
  async function screenshot(name) {
    const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(ARTIFACTS, `${config.name}-${name}`), Buffer.from(shot.data, "base64"));
  }
  async function home() {
    await evaluate("window.navigate?.('ana-sayfa')");
    await waitFor("document.body.dataset.currentRoute === 'ana-sayfa'");
    await delay(220);
  }
  async function fresh(width = 390, height = 844) {
    await viewport(width, height);
    const marker = `${config.name}-${width}-${height}-${Date.now()}`;
    await command("Page.navigate", { url: "about:blank" });
    await waitFor("location.href === 'about:blank'");
    await command("Storage.clearDataForOrigin", { origin: `http://127.0.0.1:${PORT}`, storageTypes: "local_storage" });
    await command("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?v4=${marker}` });
    await waitFor(`window.__LAUNCHER_STATE__ && location.search === ${JSON.stringify(`?v4=${marker}`)} && document.querySelectorAll('#launcherGrid .launcher-app').length === 5`);
    await delay(320);
  }
  async function search(query) {
    await evaluate(`(() => { window.openLauncherSearch(); const input=document.querySelector('#launcherSearchInput'); input.value=${JSON.stringify(query)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor("document.querySelector('#launcherSearchLayer').classList.contains('is-open')");
    await delay(100);
    const titles = await evaluate("[...document.querySelectorAll('#launcherSearchResults strong')].map(node=>node.textContent.trim())");
    await evaluate("window.closeLauncherSearch(false, false)");
    await waitFor("document.querySelector('#launcherSearchLayer').hidden");
    return titles;
  }

  const responsive = [];
  try {
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Log.enable");
    await command("Network.enable");
    await fresh();

    const initial = await evaluate(`(() => { const state=window.__LAUNCHER_STATE__; return {
      version: state.layouts.version, widgets: state.layout.pages.flatMap(page=>page.items).filter(item=>item.type==='widget').length,
      apps: document.querySelectorAll('#launcherGrid .launcher-app').length, hasHome: Boolean(document.querySelector('[data-launcher-id=home]')),
      order: state.layout.pages[0].items.map(item=>item.id).join(','), preference: state.layouts.themePreference, iconAppearance: state.layouts.iconAppearance, folders: Array.isArray(state.layouts.folders)
    }; })()`);
    assert.deepEqual(initial, { version: 4, widgets: 0, apps: 5, hasHome: false, order: "ravza-books,preparation,grade1,grade2,games", preference: "system", iconAppearance: "standard", folders: true }, `${config.name}: v4 varsayılanı hatalı`);

    const searchCases = [
      ["sans carki", "Şans Çarkı"], ["şans çarkı", "Şans Çarkı"], ["hizli", "Hızlı Tekrar"],
      ["calisma", "Çalışma Merkezi"], ["calısma", "Çalışma Merkezi"], ["bosluk", "Boşluk Doldurma"],
      ["renk siralama", "Renk Sıralama"], ["oyun alani", "Oyun Alanı"]
    ];
    for (const [query, expected] of searchCases) assert.ok((await search(query)).includes(expected), `${config.name}: arama başarısız: ${query} → ${expected}`);

    for (const entry of ROUTE_ENTRIES) {
      await home();
      await evaluate(`(() => { window.openLauncherSearch(); const input=document.querySelector('#launcherSearchInput'); input.value=${JSON.stringify(entry.title)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await waitFor(`document.querySelector('#launcherSearchResults [data-launcher-item=${JSON.stringify(entry.id)}]')`);
      await click(`#launcherSearchResults [data-launcher-item="${entry.id}"]`);
      await waitFor(`document.body.dataset.currentRoute === ${JSON.stringify(entry.route)}`);
    }
    await home();

    await evaluate("window.launcherEditMode(true); window.openLauncherEditor('widgets')");
    await waitFor("document.querySelector('[data-launcher-editor-filter]')");
    await evaluate("(() => { const input=document.querySelector('[data-launcher-editor-filter]'); input.value='gunluk hedef'; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    assert.equal(await evaluate("document.querySelector('[data-launcher-add-widget=daily-goal]').hidden"), false, `${config.name}: widget galerisi araması`);
    if (config.name === BROWSERS[0].name) await screenshot("widget-gallery-390.png");
    await click("[data-launcher-add-widget=daily-goal]");
    await waitFor("document.querySelector('[data-launcher-id=daily-goal] .launcher-widget') && document.querySelector('#launcherEditorLayer').hidden");
    await evaluate("window.launcherEditMode(false)");
    await waitFor("!window.__LAUNCHER_STATE__.isEditing && document.querySelector('[data-launcher-id=daily-goal] [data-launcher-widget-route]')?.offsetParent");
    await delay(320);
    const widgetRouteHit = await click("[data-launcher-id=daily-goal] [data-launcher-widget-route]");
    await delay(800);
    assert.equal(await evaluate("document.body.dataset.currentRoute"), "calisma-merkezi", `${config.name}: widget route tıklaması başarısız; hit=${JSON.stringify(widgetRouteHit)}`);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#launcherDock')).visibility"), "hidden", `${config.name}: iç route dock gizlenmedi`);
    await home();

    await fresh();
    const blankPoint = await evaluate(`(() => { const root=document.querySelector('#launcherPagesViewport'); const box=root.getBoundingClientRect(); for(let y=box.top+8;y<box.bottom-8;y+=18){ for(let x=box.left+8;x<box.right-8;x+=18){ const n=document.elementFromPoint(x,y); if(n?.closest('.launcher-page') && !n.closest('button,a,input,select,[data-launcher-slot],.launcher-widget')) return {x,y}; } } return null; })()`);
    assert.ok(blankPoint, `${config.name}: uzun basma için boş alan bulunamadı`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", ...blankPoint, button: "left", clickCount: 1 });
    await delay(620);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...blankPoint, button: "left", clickCount: 1 });
    await waitFor("window.__LAUNCHER_STATE__.isEditing");
    if (config.name === BROWSERS[0].name) await screenshot("long-press-edit-390.png");

    await drag('[data-launcher-id="grade2"] .launcher-app', '[data-launcher-id="grade1"] .launcher-app', 680);
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layouts.folders.length"), 1, `${config.name}: mobil klasör oluşturulmadı`);
    const folderId = await evaluate("window.__LAUNCHER_STATE__.layouts.folders[0].id");
    await click(`[data-launcher-id="${folderId}"] [data-launcher-folder-edit]`);
    await waitFor("document.querySelector('[data-launcher-folder-name]')");
    await evaluate("(() => { const input=document.querySelector('[data-launcher-folder-name]'); input.value='Derslerim'; input.dispatchEvent(new Event('change',{bubbles:true})); })()");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layouts.folders[0].title"), "Derslerim", `${config.name}: klasör yeniden adlandırılamadı`);
    await click("[data-launcher-folder-remove]");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layouts.folders.length"), 0, `${config.name}: iki öğeden az klasör silinmedi`);

    await click('[data-launcher-id="grade1"] [data-launcher-remove]');
    await waitFor("document.querySelector('[data-launcher-remove-confirm]')");
    const removeText = await evaluate("document.querySelector('#launcherEditorContent').innerText.replace(/\\s+/g,' ').trim()");
    assert.ok(removeText.includes("Ana ekrandan kaldırılsın mı? Uygulama ve kayıtlar silinmeyecek."), `${config.name}: kaldırma metni farklı: ${removeText}`);
    await click("[data-launcher-remove-confirm]");
    await waitFor("document.querySelector('#launcherEditorLayer').hidden");
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.hiddenApps.includes('grade1')"), true, `${config.name}: hiddenApps güncellenmedi`);
    assert.equal(await evaluate("localStorage.getItem('eul_study_example')"), null, `${config.name}: kaldırma uygulama verisine dokundu`);

    await evaluate("window.openLauncherEditor('apps')");
    await waitFor("document.querySelector('[data-launcher-editor-filter]')");
    await evaluate("(() => { const input=document.querySelector('[data-launcher-editor-filter]'); input.value='birinci sinif'; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    assert.equal(await evaluate("document.querySelector('[data-launcher-add-app=grade1]').hidden"), false, `${config.name}: uygulama paneli araması`);
    await click("[data-launcher-add-app=grade1]");
    await waitFor("document.querySelector('[data-launcher-id=grade1]') && document.querySelector('#launcherEditorLayer').hidden");

    const registered = await evaluate(`window.registerLauncherApp({ id:'temporary-integration-app', title:'Geçici Çalışma', type:'route', route:'hizli-tekrar', icon:'missing-test-icon', category:'Test', removable:true, searchable:true, keywords:['gecici','calisma'], defaultPage:0, defaultDockEligible:true })`);
    assert.equal(registered.searchIndex.includes("gecici calisma"), true, `${config.name}: geçici kayıt searchIndex üretmedi`);
    await evaluate("window.openLauncherEditor('apps')");
    await waitFor("document.querySelector('[data-launcher-add-app=temporary-integration-app]')");
    await click("[data-launcher-add-app=temporary-integration-app]");
    await waitFor("document.querySelector('#launcherEditorLayer').hidden");
    assert.equal(await evaluate("document.querySelectorAll('[data-launcher-id=temporary-integration-app] .launcher-app-icon svg rect').length"), 4, `${config.name}: geçici uygulama fallback ikonu boş`);
    await click('[data-launcher-context="dock"][data-launcher-id="kahoot"] [data-launcher-remove]');
    await waitFor("document.querySelector('[data-launcher-remove-confirm]')");
    await click("[data-launcher-remove-confirm]");
    await waitFor("document.querySelector('#launcherEditorLayer').hidden");
    await drag('[data-launcher-context="page"][data-launcher-id="temporary-integration-app"] .launcher-app', '#launcherDock');
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.dock.includes('temporary-integration-app')"), true, `${config.name}: geçici uygulama dock'a eklenemedi`);
    await evaluate("window.launcherEditMode(false)");
    await waitFor("!window.__LAUNCHER_STATE__.isEditing && document.querySelector('[data-launcher-id=temporary-integration-app] .launcher-app')?.offsetParent");
    await delay(320);
    const temporaryProbe = await evaluate(`(() => { const node=document.querySelector('[data-launcher-id="temporary-integration-app"] .launcher-app'); const box=node.getBoundingClientRect(); const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2); return {box:{left:box.left,top:box.top,width:box.width,height:box.height},hit:hit?.closest('[data-launcher-id]')?.dataset?.launcherId||hit?.className||hit?.tagName,pointer:getComputedStyle(node).pointerEvents,route:document.body.dataset.currentRoute}; })()`);
    await click('[data-launcher-id="temporary-integration-app"] .launcher-app');
    await delay(800);
    assert.equal(await evaluate("document.body.dataset.currentRoute"), "hizli-tekrar", `${config.name}: geçici uygulama gerçek tıklaması route açmadı; ${JSON.stringify(temporaryProbe)}`);
    await home();
    assert.ok((await search("gecici calisma")).includes("Geçici Çalışma"), `${config.name}: geçici uygulama aranamadı`);
    assert.equal(await evaluate("window.unregisterLauncherApp('temporary-integration-app')"), true, `${config.name}: geçici uygulama kaldırılamadı`);
    assert.equal(await evaluate("Boolean(document.querySelector('[data-launcher-id=temporary-integration-app]'))"), false, `${config.name}: geçici uygulama üretimde kaldı`);

    await evaluate("window.setThemePreference('dark')");
    assert.equal(await evaluate("document.body.classList.contains('dark') && localStorage.getItem('eul_theme')==='dark' && window.__LAUNCHER_STATE__.layouts.themePreference==='dark'"), true, `${config.name}: koyu tercih kaydı`);
    await evaluate("window.setThemePreference('light')");
    assert.equal(await evaluate("!document.body.classList.contains('dark') && localStorage.getItem('eul_theme')==='light'"), true, `${config.name}: açık tercih kaydı`);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await evaluate("window.setThemePreference('system')");
    assert.equal(await evaluate("document.body.classList.contains('dark') && localStorage.getItem('eul_theme')==='system'"), true, `${config.name}: sistem teması koyuyu izlemedi`);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
    await waitFor("!document.body.classList.contains('dark')");

    for (const [width, height] of VIEWPORTS) {
      await viewport(width, height);
      await waitFor(`document.documentElement.dataset.launcherDevice === '${width < 768 ? "mobile" : width < 1200 ? "tablet" : "desktop"}'`);
      const probe = await evaluate(`(() => ({ width:${width}, height:${height}, scroll:document.documentElement.scrollWidth, client:document.documentElement.clientWidth, apps:document.querySelectorAll('#launcherGrid .launcher-app').length, dock:getComputedStyle(document.querySelector('#launcherDock')).visibility, errors:document.querySelectorAll('img:not([src])').length }))()`);
      assert.ok(probe.scroll <= probe.client, `${config.name}/${width}: yatay taşma ${probe.scroll}/${probe.client}`);
      assert.equal(probe.apps, 5, `${config.name}/${width}: varsayılan uygulamalar bozuldu`);
      assert.equal(probe.dock, "visible", `${config.name}/${width}: ana ekranda dock görünmüyor`);
      responsive.push(probe);
    }
    if (config.name === BROWSERS[0].name) {
      await fresh(390, 844);
      assert.deepEqual(await evaluate("({state:window.__LAUNCHER_STATE__.layout.pages[0].items.map(item=>item.id),dom:[...document.querySelectorAll('#launcherGrid [data-launcher-id]')].map(node=>node.dataset.launcherId)})"), { state: ["ravza-books", "preparation", "grade1", "grade2", "games"], dom: ["ravza-books", "preparation", "grade1", "grade2", "games"] }, `${config.name}: temiz mobil ekran sırası bozuk`);
      await screenshot("mobile-home-390.png");
      await fresh(820, 1180); await screenshot("tablet-home-820.png");
      await fresh(1440, 900); await screenshot("desktop-home-1440.png");
    }

    await viewport(390, 844);
    const v3 = await evaluate(`(() => { const current=JSON.parse(localStorage.getItem(${JSON.stringify(LAYOUT_KEY)})); current.version=3; current.customFolders=current.folders; delete current.folders; localStorage.setItem(${JSON.stringify(LEGACY_V3_KEY)},JSON.stringify(current)); localStorage.removeItem(${JSON.stringify(LAYOUT_KEY)}); location.reload(); return true; })()`);
    assert.equal(v3, true);
    await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(LAYOUT_KEY)}) || '{}').version === 4`);
    assert.equal(await evaluate("window.__LAUNCHER_STATE__.layouts.version"), 4, `${config.name}: v3→v4 migration başarısız`);
    const beforeBadJsonReload = await evaluate("performance.timeOrigin");
    await evaluate(`localStorage.setItem(${JSON.stringify(LAYOUT_KEY)},'{bad json'); location.reload()`);
    await waitFor(`performance.timeOrigin !== ${beforeBadJsonReload} && window.__LAUNCHER_STATE__ && window.__LAUNCHER_STATE__.layouts.version === 4 && document.querySelectorAll('#launcherGrid .launcher-app').length === 5`);
    assert.equal(await evaluate("document.querySelectorAll('#launcherGrid .launcher-app').length"), 5, `${config.name}: bozuk depolama fallback başarısız`);

    const relevantIssues = runtimeIssues.filter((issue) => !/firebase|firestore|ERR_BLOCKED_BY_CLIENT|Failed to fetch/i.test(issue));
    assert.deepEqual(relevantIssues, [], `${config.name}: console hataları: ${relevantIssues.join(" | ")}`);
    assert.deepEqual(network404s, [], `${config.name}: 404: ${network404s.join(", ")}`);
    return responsive;
  } finally {
    socket.close();
    browser.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

try {
  for (const browser of BROWSERS) {
    const result = await runBrowser(browser);
    console.log(`\n${browser.name.toUpperCase()} V4`);
    console.table(result.map((item) => ({ viewport: `${item.width}x${item.height}`, scroll: `${item.scroll}/${item.client}`, apps: item.apps })));
  }
  assert.deepEqual(local404s, [], `Sunucu 404 kayıtları: ${local404s.join(", ")}`);
  console.log("✓ Launcher v4 registry, arama, edit, klasör, widget, tema, migration ve responsive testleri geçti");
} finally {
  server.close();
}
