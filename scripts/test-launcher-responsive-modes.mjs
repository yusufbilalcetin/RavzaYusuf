import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const AUDIT_MODE = process.argv.includes("--audit");
const SKIP_SCREENSHOTS = process.argv.includes("--no-screenshots");
const SERVER_PORT = 8784;
const ARTIFACTS = AUDIT_MODE
  ? join(ROOT, "test-artifacts", "launcher", "responsive-audit")
  : join(ROOT, "test-artifacts", "launcher-responsive");
const LAYOUT_KEY = "ravzaders.launcher.layout.v4";
const LEGACY_KEY = "ravzaders.launcher.layout.v1";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp",
  ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml"
};
const BROWSERS = [
  { name: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", port: 9381 },
  { name: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", port: 9382 }
].filter((browser) => existsSync(browser.path));
const BASE_VIEWPORTS = [
  [320, 700], [360, 800], [375, 812], [390, 844], [430, 932],
  [768, 1024], [810, 1080], [820, 1180], [834, 1194],
  [1024, 768], [1080, 810], [1180, 820], [1194, 834],
  [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]
];
const VIEWPORTS = AUDIT_MODE ? [
  [320, 700], [360, 800], [375, 812], [390, 844], [430, 932], [767, 900],
  [768, 1024], [810, 1080], [820, 1180], [834, 1194],
  [1024, 768], [1080, 810], [1180, 820], [1194, 834], [1199, 834],
  [1200, 800], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]
] : BASE_VIEWPORTS;
const AUDIT_SCREENSHOT_NAMES = new Map([
  ["mobile-home-normal-390.png", "audit-mobile-home-390.png"],
  ["mobile-home-edit-390.png", "audit-mobile-edit-390.png"],
  ["mobile-page-2-390.png", "audit-mobile-page-2-390.png"],
  ["mobile-widget-gallery-390.png", "audit-mobile-widget-gallery-390.png"],
  ["mobile-folder-open-390.png", "audit-mobile-folder-390.png"],
  ["tablet-portrait-home-820.png", "audit-tablet-portrait-home-820.png"],
  ["tablet-portrait-edit-820.png", "audit-tablet-portrait-edit-820.png"],
  ["tablet-portrait-page-2-820.png", "audit-tablet-portrait-page-2-820.png"],
  ["tablet-portrait-widget-gallery-820.png", "audit-tablet-portrait-widget-820.png"],
  ["tablet-portrait-folder-open-820.png", "audit-tablet-portrait-folder-820.png"],
  ["tablet-landscape-home-1180.png", "audit-tablet-landscape-home-1180.png"],
  ["tablet-landscape-edit-1180.png", "audit-tablet-landscape-edit-1180.png"],
  ["tablet-landscape-page-2-1180.png", "audit-tablet-landscape-page-2-1180.png"],
  ["tablet-landscape-widget-layout-1180.png", "audit-tablet-landscape-widget-1180.png"],
  ["tablet-landscape-folder-open-1180.png", "audit-tablet-landscape-folder-1180.png"],
  ["desktop-home-normal-1440.png", "audit-desktop-home-1440.png"],
  ["desktop-home-edit-1440.png", "audit-desktop-edit-1440.png"],
  ["desktop-widget-layout-1440.png", "audit-desktop-widget-1440.png"],
  ["desktop-folder-open-1440.png", "audit-desktop-folder-1440.png"],
  ["desktop-home-wide-1920.png", "audit-desktop-wide-1920.png"]
]);

assert.ok(BROWSERS.length === 2, "Responsive doğrulama için Chrome ve Edge birlikte bulunmalı");
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
const expectedMode = (width) => width < 768 ? "mobile" : width < 1200 ? "tablet" : "desktop";

async function runBrowser(config) {
  const profile = join(tmpdir(), `ravza-launcher-responsive-${config.name}-${Date.now()}`);
  const browser = spawn(config.path, [
    "--headless=new", "--no-first-run", `--remote-debugging-port=${config.port}`,
    // Tarayici uzantilari devre disi: Edge kendi Copilot/Assistant uzantisini
    // enjekte ediyor ve onun hatalari uygulama hatasi sayilip testi dusuruyordu.
    // Ayni bayrak scripts/lib/theme-test-runtime.mjs icinde zaten var.
    "--disable-extensions", "--disable-background-networking", "--no-default-browser-check",
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
    await command("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height
    });
    await delay(260);
  }
  async function waitFor(expression, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await delay(80);
    }
    throw new Error(`Zaman aşımı: ${expression}`);
  }
  async function reloadFresh(width, height) {
    await viewport(width, height);
    const marker = `${config.name}-${width}-${height}-${Date.now()}`;
    await evaluate(`localStorage.removeItem(${JSON.stringify(LAYOUT_KEY)}); localStorage.removeItem(${JSON.stringify(LEGACY_KEY)})`);
    await command("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/index.html?launcher-audit=${encodeURIComponent(marker)}` });
    await waitFor(`window.__LAUNCHER_STATE__ && location.search.includes(${JSON.stringify(marker)}) && document.documentElement.dataset.launcherDevice === '${expectedMode(width)}' && document.querySelector('#launcherGrid')`);
    await delay(320);
  }
  async function screenshot(name) {
    if (SKIP_SCREENSHOTS) return;
    if (AUDIT_MODE && !AUDIT_SCREENSHOT_NAMES.has(name)) return;
    await evaluate("document.fonts.ready.then(() => true)");
    await waitFor("[...document.images].filter((image) => image.offsetParent !== null).every((image) => image.complete && image.naturalWidth > 0)");
    await delay(150);
    const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const outputName = AUDIT_MODE ? AUDIT_SCREENSHOT_NAMES.get(name) || name : name;
    await writeFile(join(ARTIFACTS, outputName), Buffer.from(shot.data, "base64"));
  }
  async function prepareWidgetLayout(width, height) {
    await reloadFresh(width, height);
    await evaluate("window.launcherEditMode(true)");
    await waitFor("window.__LAUNCHER_STATE__.isEditing && document.querySelector('[data-launcher-editor=widgets]')");
    await evaluate("window.openLauncherEditor('widgets')");
    await waitFor("document.querySelector('#launcherEditorLayer').classList.contains('is-open') && document.querySelector('[data-launcher-add-widget=daily-goal]')");
    await evaluate("document.querySelector('[data-launcher-add-widget=daily-goal]').click()");
    await waitFor("document.querySelector('[data-launcher-id=daily-goal] .launcher-widget') && document.querySelector('#launcherEditorLayer').hidden");
    await evaluate("window.launcherEditMode(false)");
    await waitFor("!window.__LAUNCHER_STATE__.isEditing");
    await delay(320);
  }
  async function point(selector) {
    return evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); if(!n) return null; const r=n.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  }
  async function mouseDrag(sourceSelector, targetSelector, dwell = 120) {
    const source = await point(sourceSelector);
    const targetPoint = typeof targetSelector === "string" ? await point(targetSelector) : targetSelector;
    assert.ok(source && targetPoint, `${config.name}: drag hedefi bulunamadı`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: source.x, y: source.y, button: "left", clickCount: 1 });
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: targetPoint.x, y: targetPoint.y, button: "left", buttons: 1 });
    await delay(dwell);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: targetPoint.x, y: targetPoint.y, button: "left", clickCount: 1 });
    await delay(260);
  }
  async function realClick(selector) {
    const targetPoint = await point(selector);
    assert.ok(targetPoint, `${config.name}: tıklama hedefi bulunamadı: ${selector}`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: targetPoint.x, y: targetPoint.y, button: "left", clickCount: 1 });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: targetPoint.x, y: targetPoint.y, button: "left", clickCount: 1 });
    await delay(220);
  }
  async function touchDrag(sourceSelector, targetSelector, dwell = 160) {
    const source = await point(sourceSelector);
    const targetPoint = typeof targetSelector === "string" ? await point(targetSelector) : targetSelector;
    assert.ok(source && targetPoint, `${config.name}: touch drag hedefi bulunamadı`);
    const touch = (type, x, y, points = true) => command("Input.dispatchTouchEvent", {
      type,
      touchPoints: points ? [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }] : []
    });
    await touch("touchStart", source.x, source.y);
    await delay(60);
    await touch("touchMove", (source.x + targetPoint.x) / 2, (source.y + targetPoint.y) / 2);
    await delay(dwell);
    await touch("touchMove", targetPoint.x, targetPoint.y);
    await delay(80);
    await touch("touchEnd", targetPoint.x, targetPoint.y, false);
    await delay(300);
  }
  async function touchSwipe(x1, y1, x2, y2) {
    const touch = (type, x, y, points = true) => command("Input.dispatchTouchEvent", {
      type,
      touchPoints: points ? [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 2 }] : []
    });
    await touch("touchStart", x1, y1);
    await touch("touchMove", (x1 + x2) / 2, (y1 + y2) / 2);
    await touch("touchMove", x2, y2);
    await touch("touchEnd", x2, y2, false);
    await delay(320);
  }

  const results = [];
  const auditReport = {
    browser: config.name,
    profile,
    cacheDisabled: false,
    serviceWorkers: null,
    viewports: [],
    transitions: [],
    realClicks: [],
    glass: {},
    storage: {}
  };
  const primary = config.name === "edge";
  try {
    await command("Page.enable");
    await command("Page.bringToFront");
    await command("Runtime.enable");
    await command("Log.enable");
    await command("Network.enable");
    await command("Network.setCacheDisabled", { cacheDisabled: true });
    await command("Emulation.setFocusEmulationEnabled", { enabled: true });
    auditReport.cacheDisabled = true;
    await viewport(390, 844);
    await command("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/index.html` });
    await waitFor("window.__LAUNCHER_STATE__ && document.querySelector('#launcherGrid')");
    await delay(400);
    auditReport.serviceWorkers = await evaluate(`(async () => {
      const before = 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0;
      if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration => registration.unregister()));
      if ('caches' in window) await Promise.all((await caches.keys()).map(key => caches.delete(key)));
      const after = 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0;
      return { supported: 'serviceWorker' in navigator, before, after };
    })()`);

    for (const [width, height] of VIEWPORTS) {
      const mode = expectedMode(width);
      const orientation = width > height ? "landscape" : "portrait";
      await viewport(width, height);
      await waitFor(`document.documentElement.dataset.launcherDevice === '${mode}' && document.documentElement.dataset.launcherOrientation === '${orientation}'`);
      await evaluate("window.navigate('ana-sayfa', { history: false })");
      await waitFor("document.querySelector('#dashboard.active') && document.querySelector('#launcherGrid')");
      const probe = await evaluate(`(() => {
        const rect = (node) => { const r=node?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height} : null; };
        const grid = document.querySelector('#launcherGrid');
        const dock = document.querySelector('#launcherDock');
        const slots = [...grid.querySelectorAll(':scope > [data-launcher-slot]')].map(rect);
        const overlaps = [];
        if (document.documentElement.dataset.launcherDevice === 'desktop') {
          for (let a=0; a<slots.length; a++) for (let b=a+1; b<slots.length; b++) {
            const x=Math.max(0,Math.min(slots[a].right,slots[b].right)-Math.max(slots[a].left,slots[b].left));
            const y=Math.max(0,Math.min(slots[a].bottom,slots[b].bottom)-Math.max(slots[a].top,slots[b].top));
            if (x*y>4) overlaps.push([a,b,x*y]);
          }
        }
        const gridStyle = getComputedStyle(grid);
        const columns = gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length;
        const rows = gridStyle.gridTemplateRows.split(' ').filter(Boolean).length;
        const visibleApps = [...grid.querySelectorAll('.launcher-app')].map((node) => {
          const bounds = rect(node);
          const style = getComputedStyle(node);
          const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
          return {...bounds, opacity:Number(style.opacity), visibility:style.visibility, pointerEvents:style.pointerEvents, hitMatches:hit === node || node.contains(hit), hitElement:hit ? hit.tagName.toLowerCase() + (hit.id ? '#'+hit.id : '') + (hit.className && typeof hit.className === 'string' ? '.'+hit.className.trim().replace(/\s+/g,'.') : '') : null};
        });
        const labels = [...grid.querySelectorAll('.launcher-app-label')].map((node) => {
          const style=getComputedStyle(node); const bounds=rect(node); const lineHeight=parseFloat(style.lineHeight);
          return {text:node.textContent.trim(),lines:lineHeight ? Math.round(bounds.height/lineHeight) : 0,height:bounds.height,lineHeight};
        });
        const targets = [...document.querySelectorAll('.launcher-topbar button:not([hidden]), .launcher-dock .launcher-app, #launcherGrid .launcher-app, #launcherGrid .launcher-widget button')]
          .filter(node => node.offsetParent !== null).map(node => ({name:node.getAttribute('aria-label')||node.textContent.trim().slice(0,32),...rect(node)}));
        const topbarTargets = [...document.querySelectorAll('.launcher-topbar button')].filter(node => node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden' && Number(getComputedStyle(node).opacity) > .01).map(node=>({name:node.id||node.getAttribute('aria-label'),...rect(node)}));
        const topbarOverlaps=[];
        for(let a=0;a<topbarTargets.length;a++) for(let b=a+1;b<topbarTargets.length;b++) {
          const x=Math.max(0,Math.min(topbarTargets[a].right,topbarTargets[b].right)-Math.max(topbarTargets[a].left,topbarTargets[b].left));
          const y=Math.max(0,Math.min(topbarTargets[a].bottom,topbarTargets[b].bottom)-Math.max(topbarTargets[a].top,topbarTargets[b].top));
          if(x*y>.5) topbarOverlaps.push({a:topbarTargets[a].name,b:topbarTargets[b].name,area:x*y});
        }
        const dockItems = [...dock.querySelectorAll('.launcher-app')].map((node) => {
          const bounds=rect(node); const style=getComputedStyle(node); const hit=document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
          return {...bounds,opacity:Number(style.opacity),visibility:style.visibility,pointerEvents:style.pointerEvents,hitMatches:hit===node||node.contains(hit)};
        });
        const iconBackdrop = [...document.querySelectorAll('.launcher-app-icon')].map(node => getComputedStyle(node).backdropFilter || getComputedStyle(node).webkitBackdropFilter || 'none');
        const pageDots = [...document.querySelectorAll('[data-launcher-page-go]')].filter(node=>node.offsetParent!==null).length;
        const shellHeight = rect(document.querySelector('.launcher-home-content'))?.height || 0;
        return {
          mode: document.documentElement.dataset.launcherDevice,
          orientation: document.documentElement.dataset.launcherOrientation,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          topbar: rect(document.querySelector('.launcher-topbar')),
          dock: rect(dock), grid: rect(grid), widget: rect(document.querySelector('.launcher-widget')),
          visibleApps, slots, overlaps, columns, rows, labels, targets, topbarTargets, topbarOverlaps, dockItems, iconBackdrop, pageDots,
          dockCount: dock.querySelectorAll(':scope > [data-launcher-slot]').length,
          dockIds: [...dock.querySelectorAll(':scope > [data-launcher-slot]')].map(node => node.dataset.launcherId),
          stateDockIds: [...window.__LAUNCHER_STATE__.layout.dock],
          storedDockCounts: Object.fromEntries(Object.entries(window.__LAUNCHER_STATE__.layouts).filter(([, value]) => value?.dock).map(([key, value]) => [key, value.dock.length])),
          pages: window.__LAUNCHER_STATE__.layout.pages.length,
          totalApps: window.__LAUNCHER_STATE__.layout.pages.flatMap(p=>p.items).filter(i=>i.type!=='widget').length,
          pageControlsHidden: document.querySelector('#launcherPageControls').hidden || getComputedStyle(document.querySelector('#launcherPageControls')).display === 'none',
          editing: window.__LAUNCHER_STATE__.isEditing,
          bodyEditing: document.body.classList.contains('launcher-editing'),
          pageControls: {...rect(document.querySelector('#launcherPageControls')),display:getComputedStyle(document.querySelector('#launcherPageControls')).display,childCount:document.querySelector('#launcherPageControls').children.length},
          scrollX, scrollY, gridCount: document.querySelectorAll('#launcherGrid').length,
          gridTemplateColumns: gridStyle.gridTemplateColumns, gridTemplateRows: gridStyle.gridTemplateRows,
          snapCell: {width:parseFloat(gridStyle.gridTemplateColumns) || 0,height:parseFloat(gridStyle.gridTemplateRows) || 0},
          reserved: {top:rect(document.querySelector('.launcher-home-content'))?.top || 0,bottom:Math.max(0,innerHeight-dock.getBoundingClientRect().top),shellHeight},
          storageVersion: JSON.parse(localStorage.getItem(${JSON.stringify(LAYOUT_KEY)}) || '{}').version || null
        };
      })()`);
      const tag = `${config.name}/${width}x${height}`;
      assert.equal(probe.mode, mode, `${tag}: yanlış cihaz modu`);
      assert.equal(probe.orientation, orientation, `${tag}: yanlış yön`);
      assert.ok(probe.scrollWidth <= probe.clientWidth && probe.bodyScrollWidth <= probe.clientWidth, `${tag}: yatay taşma ${probe.scrollWidth}/${probe.clientWidth}`);
      for (const [name, rect] of [["topbar", probe.topbar], ["dock", probe.dock], ["grid", probe.grid]]) {
        assert.ok(rect && rect.left >= -1 && rect.right <= width + 1, `${tag}: ${name} yatay sınır dışında ${JSON.stringify(rect)}`);
      }
      if (probe.widget) assert.ok(probe.widget.left >= -1 && probe.widget.right <= width + 1, `${tag}: widget yatay sınır dışında ${JSON.stringify(probe.widget)}`);
      assert.ok(probe.topbar.top >= -1 && probe.topbar.bottom <= height + 1 && probe.dock.top >= -1 && probe.dock.bottom <= height + 1, `${tag}: sabit shell dikey sınır dışında`);
      assert.equal(probe.totalApps, 5, `${tag}: uygulama kaybı var`);
      assert.ok(probe.visibleApps.every((app) => app.left >= -1 && app.right <= width + 1 && app.top >= -1 && app.bottom <= probe.dock.top + 2), `${tag}: uygulama kesiliyor ${JSON.stringify(probe.visibleApps)}`);
      const expectedColumns = mode === "mobile" ? 4 : mode === "tablet" ? (orientation === "portrait" ? 5 : width >= 1120 ? 7 : 6) : probe.columns;
      assert.equal(probe.columns, expectedColumns, `${tag}: grid sütun sayısı yanlış`);
      assert.ok(probe.dockCount >= (mode === "mobile" ? 4 : mode === "tablet" ? 5 : 4) && probe.dockCount <= (mode === "mobile" ? 4 : mode === "tablet" ? 8 : 10), `${tag}: dock kapasitesi yanlış ${JSON.stringify({ count: probe.dockCount, ids: probe.dockIds, state: probe.stateDockIds, stored: probe.storedDockCounts })}`);
      assert.equal(probe.overlaps.length, 0, `${tag}: masaüstü öğeleri çakışıyor ${JSON.stringify(probe.overlaps)}`);
      assert.equal(mode === "desktop" ? probe.pageControlsHidden : true, true, `${tag}: masaüstünde sayfa noktaları görünür`);
      assert.equal(probe.gridCount, 1, `${tag}: launcherGrid çoğaltılmış`);
      assert.equal(probe.scrollX, 0, `${tag}: scrollX sıfır değil`);
      assert.equal(probe.scrollY, 0, `${tag}: scrollY sıfır değil`);
      assert.ok(probe.visibleApps.every((app) => app.opacity > .9 && app.visibility === "visible" && app.pointerEvents !== "none" && app.hitMatches), `${tag}: uygulama görünmez veya hit-test başarısız ${JSON.stringify({apps:probe.visibleApps,editing:probe.editing,bodyEditing:probe.bodyEditing,pageControls:probe.pageControls})}`);
      assert.ok(probe.dockItems.every((app) => app.opacity > .9 && app.visibility === "visible" && app.pointerEvents !== "none" && app.hitMatches), `${tag}: dock görünmez veya hit-test başarısız ${JSON.stringify(probe.dockItems)}`);
      assert.ok(probe.targets.every((target) => target.width >= 43.5 && target.height >= 43.5), `${tag}: 44px altı hedef ${JSON.stringify(probe.targets.filter(target=>target.width<43.5||target.height<43.5))}`);
      assert.deepEqual(probe.topbarOverlaps, [], `${tag}: topbar kontrolleri çakışıyor ${JSON.stringify(probe.topbarOverlaps)}`);
      assert.ok(probe.labels.every((label) => label.lines <= 2), `${tag}: iki satırı aşan etiket ${JSON.stringify(probe.labels)}`);
      assert.ok(probe.iconBackdrop.every((value) => value === "none"), `${tag}: uygulama ikonuna backdrop-filter uygulanmış`);
      assert.equal(probe.storageVersion, 4, `${tag}: v4 storage yazılmamış`);
      if (probe.pages > 1 && mode !== "desktop") assert.equal(probe.pageDots, probe.pages, `${tag}: sayfa noktaları sayfalarla eşleşmiyor`);

      for (const folderId of ["preparation", "games"]) {
        await evaluate(`window.openLauncherFolder('${folderId}', null, false)`);
        await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
        const folder = await evaluate(`(() => { const n=document.querySelector('#launcherFolderDialog'); const r=n.getBoundingClientRect(); return {count:n.querySelectorAll('[data-launcher-item]').length,left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })()`);
        const expectedFolderCount = folderId === "games" ? 9 : 8;
        assert.equal(folder.count, expectedFolderCount, `${tag}/${folderId}: klasör ${expectedFolderCount}/${expectedFolderCount} değil`);
        assert.ok(folder.left >= -1 && folder.right <= width + 1 && folder.top >= -1 && folder.bottom <= height + 1, `${tag}/${folderId}: klasör kesiliyor`);
        await evaluate("window.closeLauncherFolder(false)");
        await waitFor("document.querySelector('#launcherFolderLayer').hidden");
      }

      await evaluate("window.launcherEditMode(true)");
      await waitFor("document.body.classList.contains('launcher-editing')");
      const editScroll = await evaluate("({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,removes:document.querySelectorAll('[data-launcher-remove]').length})");
      assert.ok(editScroll.scroll <= editScroll.client && editScroll.removes > 0, `${tag}: edit modu taşma veya kontrol hatası`);
      await evaluate("window.launcherEditMode(false)");
      await delay(120);
      const summary = { viewport: `${width}x${height}`, mode, orientation, scroll: `${probe.scrollWidth}/${probe.clientWidth}`, columns: probe.columns, rows: probe.rows, pages: probe.pages, dock: probe.dockCount };
      results.push(summary);
      auditReport.viewports.push({...summary, snapCell:probe.snapCell, reserved:probe.reserved, gridTemplateColumns:probe.gridTemplateColumns, gridTemplateRows:probe.gridTemplateRows});
    }

    if (primary) {
      await reloadFresh(390, 844);
      await screenshot("mobile-home-normal-390.png");
      await evaluate("window.launcherEditMode(true)"); await delay(100); await screenshot("mobile-home-edit-390.png");
      await evaluate("window.openLauncherEditor('widgets')");
      await waitFor("document.querySelector('#launcherEditorLayer').classList.contains('is-open')");
      await screenshot("mobile-widget-gallery-390.png");
      await evaluate("document.querySelector('[data-launcher-editor-close]').click(); window.launcherEditMode(false)"); await delay(240);
      await evaluate("window.openLauncherFolder('preparation', null, false)"); await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
      await screenshot("mobile-folder-open-390.png");
      await evaluate("window.closeLauncherFolder(false)"); await delay(230);
      await evaluate("window.launcherEditMode(true)"); await delay(80);
      await evaluate("document.querySelector('[data-launcher-add-page]').click()"); await delay(80);
      await evaluate("document.querySelector('[data-launcher-page-go=\"1\"]').click()"); await delay(240); await screenshot("mobile-page-2-390.png");
      await evaluate("window.launcherEditMode(false)"); await delay(80);

      await reloadFresh(768, 1024);
      await screenshot("tablet-home-768.png");
      await evaluate("window.launcherEditMode(true)"); await delay(100); await screenshot("tablet-edit-768.png");

      await reloadFresh(820, 1180);
      await screenshot("tablet-portrait-home-820.png");
      await evaluate("window.launcherEditMode(true)"); await delay(100); await screenshot("tablet-portrait-edit-820.png");
      await waitFor("window.__LAUNCHER_STATE__.isEditing && document.querySelector('[data-launcher-editor=widgets]')");
      await evaluate("window.openLauncherEditor('widgets')");
      await waitFor("document.querySelector('#launcherEditorLayer').classList.contains('is-open')"); await screenshot("tablet-portrait-widget-gallery-820.png");
      await evaluate("document.querySelector('[data-launcher-editor-close]').click()");
      await waitFor("document.querySelector('#launcherEditorLayer').hidden");
      await evaluate(`(() => {
        document.querySelector('[data-launcher-add-page]').click();
        const state=window.__LAUNCHER_STATE__;
        state.layout.pages[1].items.push(state.layout.pages[0].items.pop());
        state.layout.activePage=1;
        state.layouts.tablet=state.layout;
        localStorage.setItem(${JSON.stringify(LAYOUT_KEY)}, JSON.stringify(state.layouts));
        window.launcherEditMode(false);
      })()`); await delay(360);
      await screenshot("tablet-portrait-page-2-820.png");
      await reloadFresh(820, 1180);
      await realClick('[data-launcher-id="preparation"] .launcher-app');
      await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')"); await screenshot("tablet-portrait-folder-open-820.png");

      await reloadFresh(1180, 820);
      await screenshot("tablet-landscape-home-1180.png");
      await prepareWidgetLayout(1180, 820);
      await screenshot("tablet-landscape-widget-layout-1180.png");
      await reloadFresh(1180, 820);
      await evaluate("window.launcherEditMode(true)"); await delay(100); await screenshot("tablet-landscape-edit-1180.png");
      await evaluate(`(() => {
        document.querySelector('[data-launcher-add-page]').click();
        const state=window.__LAUNCHER_STATE__;
        state.layout.pages[1].items.push(state.layout.pages[0].items.pop());
        state.layout.activePage=1;
        window.launcherEditMode(false);
      })()`);
      await waitFor("!window.__LAUNCHER_STATE__.isEditing"); await delay(360); await screenshot("tablet-landscape-page-2-1180.png");
      await reloadFresh(1180, 820);
      await realClick('[data-launcher-id="preparation"] .launcher-app');
      await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
      await screenshot("tablet-landscape-folder-open-1180.png");

      await reloadFresh(820, 1180);
      await evaluate("window.launcherEditMode(true)");
      await mouseDrag('[data-launcher-id="grade2"] .launcher-app', '[data-launcher-id="grade1"] .launcher-app', 680);
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layouts.folders.length"), 1, "tablet: uygulamadan klasör oluşturulamadı");

      await reloadFresh(1440, 900);
      await screenshot("desktop-home-normal-1440.png");
      await prepareWidgetLayout(1440, 900);
      await screenshot("desktop-widget-layout-1440.png");
      await reloadFresh(1440, 900);
      await evaluate("window.launcherEditMode(true)"); await delay(100); await screenshot("desktop-home-edit-1440.png");
      await mouseDrag('[data-launcher-id="grade2"] .launcher-app', '[data-launcher-id="grade1"] .launcher-app', 680);
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layouts.folders.length"), 1, "desktop: uygulamadan klasör oluşturulamadı");
      const desktopFolderId = await evaluate("window.__LAUNCHER_STATE__.layouts.folders[0].id");
      await evaluate("window.launcherEditMode(false)");
      await waitFor(`!window.__LAUNCHER_STATE__.isEditing && document.querySelector('[data-launcher-id="${desktopFolderId}"] .launcher-app')`);
      await realClick(`[data-launcher-id="${desktopFolderId}"] .launcher-app`);
      await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')"); await screenshot("desktop-folder-open-1440.png");
      await reloadFresh(1920, 1080); await screenshot("desktop-home-wide-1920.png");

      await reloadFresh(390, 844);
      await evaluate("window.launcherEditMode(true); document.querySelector('[data-launcher-add-page]').click()");
      const mobilePages = await evaluate("window.__LAUNCHER_STATE__.layout.pages.length");
      await viewport(820, 1180);
      await waitFor("window.__LAUNCHER_STATE__.device === 'tablet'");
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.device"), "tablet", "mobil → tablet cihaz durumu değişmedi");
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), 1, "tablet düzeni mobil sayfaları kopyaladı");
      const tabletOrder = await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.map(item=>item.id).join(',')");
      await viewport(1180, 820);
      await waitFor("window.__LAUNCHER_STATE__.device === 'tablet' && window.__LAUNCHER_STATE__.orientation === 'landscape'");
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.map(item=>item.id).join(',')"), tabletOrder, "tablet orientation değişiminde sıra bozuldu");
      await viewport(390, 844);
      await waitFor("window.__LAUNCHER_STATE__.device === 'mobile'");
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.pages.length"), mobilePages, "mobil düzene dönüşte sayfalar korunmadı");

      await evaluate(`(() => {
        const legacy={version:1,pages:[{id:'legacy-page',items:[{type:'app',id:'home'},{type:'app',id:'grade1'}]}],dock:['ravzalingo'],hiddenApps:[],activePage:0};
        localStorage.removeItem(${JSON.stringify(LAYOUT_KEY)});
        localStorage.setItem(${JSON.stringify(LEGACY_KEY)}, JSON.stringify(legacy));
        location.reload();
      })()`);
      await waitFor("window.__LAUNCHER_STATE__ && JSON.parse(localStorage.getItem('ravzaders.launcher.layout.v4') || '{}').version === 4");
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layouts.mobile.pages[0].items.some(item=>item.id==='grade1')"), true, "v1 → v4 migration öğe sırasını taşımadı");
    }

    if (AUDIT_MODE) {
      const modeAt = async (width, height) => {
        const orientation = width > height ? "landscape" : "portrait";
        await viewport(width, height);
        await waitFor(`document.documentElement.dataset.launcherDevice === '${expectedMode(width)}' && document.documentElement.dataset.launcherOrientation === '${orientation}'`);
        return evaluate(`({
          width: innerWidth,
          height: innerHeight,
          mode: document.documentElement.dataset.launcherDevice,
          orientation: document.documentElement.dataset.launcherOrientation,
          route: document.body.dataset.currentRoute,
          folderOpen: document.querySelector('#launcherFolderLayer')?.classList.contains('is-open') || false,
          editing: window.__LAUNCHER_STATE__.isEditing,
          activePage: window.__LAUNCHER_STATE__.layout.activePage,
          order: window.__LAUNCHER_STATE__.layout.pages?.[0]?.items?.map(item=>item.id).join(',') || window.__LAUNCHER_STATE__.layout.items?.map(item=>item.id).join(','),
          dock: window.__LAUNCHER_STATE__.layout.dock.join(','),
          storageLength: localStorage.getItem(${JSON.stringify(LAYOUT_KEY)})?.length || 0
        })`);
      };

      await reloadFresh(390, 844);
      await realClick('[data-launcher-id="grade1"] .launcher-app');
      await waitFor("document.body.dataset.currentRoute === 'birinci-sinif'");
      auditReport.realClicks.push({ mode: "mobile", target: "grade1", route: await evaluate("document.body.dataset.currentRoute") });
      await evaluate("window.navigate('ana-sayfa', { history: false })");
      await waitFor("document.querySelector('#dashboard.active')");
      await realClick('[data-launcher-id="preparation"] .launcher-app');
      await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
      const folderHit = await evaluate(`(() => { const n=document.querySelector('#launcherFolderGrid [data-launcher-item]'); const r=n.getBoundingClientRect(); const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return {id:n.dataset.launcherItem,opacity:getComputedStyle(n).opacity,pointerEvents:getComputedStyle(n).pointerEvents,hitMatches:hit===n||n.contains(hit)}; })()`);
      assert.ok(folderHit.hitMatches && Number(folderHit.opacity) > .9 && folderHit.pointerEvents !== "none", `${config.name}: klasör öğesi görünür/hit-test değil`);
      await realClick('#launcherFolderGrid [data-launcher-item]');
      await waitFor("document.querySelector('#launcherFolderLayer').hidden && document.body.dataset.currentRoute !== 'ana-sayfa'");
      auditReport.realClicks.push({ mode: "mobile", target: `folder:${folderHit.id}`, route: await evaluate("document.body.dataset.currentRoute"), hit: folderHit });

      await evaluate("window.navigate('ana-sayfa', { history: false })");
      await waitFor("document.querySelector('#dashboard.active')");
      const touchOrderBefore = await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.map(item=>item.id).join(',')");
      await evaluate("window.launcherEditMode(true)");
      await waitFor("window.__LAUNCHER_STATE__.isEditing");
      await touchDrag('[data-launcher-id="grade2"] .launcher-app', '[data-launcher-id="grade1"] .launcher-app');
      const touchOrderAfter = await evaluate("window.__LAUNCHER_STATE__.layout.pages[0].items.map(item=>item.id).join(',')");
      assert.notEqual(touchOrderAfter, touchOrderBefore, `${config.name}: gerçek touch drag sıralamayı değiştirmedi`);
      const touchCleanup = await evaluate("({drag:window.__LAUNCHER_STATE__.drag,ghosts:document.querySelectorAll('.launcher-drag-layer > *').length,dragClass:document.body.classList.contains('launcher-dragging'),inlineTransforms:[...document.querySelectorAll('[data-launcher-slot]')].filter(node=>node.style.transform).length})");
      assert.deepEqual(touchCleanup, { drag:null, ghosts:0, dragClass:false, inlineTransforms:0 }, `${config.name}: touch drag temizliği eksik`);
      await evaluate(`(() => {
        document.querySelector('[data-launcher-add-page]').click();
        const state=window.__LAUNCHER_STATE__;
        state.layout.pages[1].items.push(state.layout.pages[0].items.pop());
        state.layouts.mobile=state.layout;
        localStorage.setItem(${JSON.stringify(LAYOUT_KEY)}, JSON.stringify(state.layouts));
      })()`);
      await evaluate("window.launcherEditMode(false)");
      await waitFor("!window.__LAUNCHER_STATE__.isEditing");
      await touchSwipe(350, 470, 55, 470);
      assert.equal(await evaluate("window.__LAUNCHER_STATE__.layout.activePage"), 1, `${config.name}: gerçek touch swipe ikinci sayfaya geçmedi`);
      auditReport.touch = { orderBefore:touchOrderBefore, orderAfter:touchOrderAfter, cleanup:touchCleanup, activePage:1 };
      await evaluate("window.__LAUNCHER_STATE__.layout.activePage=0; window.navigate('ana-sayfa', { history:false })");
      await delay(260);
      for (const [width, height, mode] of [[820, 1180, "tablet"], [1440, 900, "desktop"]]) {
        await viewport(width, height);
        await waitFor(`document.documentElement.dataset.launcherDevice === '${mode}'`);
        await realClick('[data-launcher-id="grade1"] .launcher-app');
        await waitFor("document.body.dataset.currentRoute === 'birinci-sinif'");
        auditReport.realClicks.push({ mode, target: "grade1", route: await evaluate("document.body.dataset.currentRoute") });
        await evaluate("window.navigate('ana-sayfa', { history: false })");
        await waitFor("document.querySelector('#dashboard.active')");
      }

      await reloadFresh(390, 844);
      await evaluate("window.openLauncherFolder('preparation', null, false)");
      await waitFor("document.querySelector('#launcherFolderLayer').classList.contains('is-open')");
      const transitionSequence = [[390,844],[820,1180],[1440,900],[390,844],[767,900],[768,1024],[1199,834],[1200,800],[1199,834]];
      for (const [width, height] of transitionSequence) auditReport.transitions.push(await modeAt(width, height));
      assert.deepEqual(auditReport.transitions.map(item=>item.mode), ["mobile","tablet","desktop","mobile","mobile","tablet","tablet","desktop","tablet"], `${config.name}: breakpoint geçiş dizisi yanlış`);
      assert.equal(auditReport.transitions[1].folderOpen, false, `${config.name}: mod değişiminde klasör kapanmadı`);
      assert.ok(auditReport.transitions.every(item=>item.route === "ana-sayfa"), `${config.name}: mod geçişinde route değişti`);
      assert.ok(auditReport.transitions.every(item=>!item.editing), `${config.name}: mod geçişinde edit durumu kaldı`);

      await reloadFresh(820, 1180);
      const tabletBefore = await evaluate("({order:window.__LAUNCHER_STATE__.layout.pages[0].items.map(i=>i.id).join(','),dock:window.__LAUNCHER_STATE__.layout.dock.join(','),activePage:window.__LAUNCHER_STATE__.layout.activePage})");
      const tabletLandscape = await modeAt(1180, 820);
      const tabletPortrait = await modeAt(820, 1180);
      assert.equal(tabletLandscape.order, tabletBefore.order, `${config.name}: tablet yön değişiminde sıra bozuldu`);
      assert.equal(tabletPortrait.order, tabletBefore.order, `${config.name}: tablet dönüşünde sıra bozuldu`);
      assert.equal(tabletLandscape.dock, tabletBefore.dock, `${config.name}: tablet yön değişiminde dock bozuldu`);
      auditReport.orientation = { before:tabletBefore, landscape:tabletLandscape, portrait:tabletPortrait };

      const glassSnapshot = () => evaluate(`(() => {
        const one=(selector)=>{const n=document.querySelector(selector);if(!n)return null;const s=getComputedStyle(n);return {background:s.backgroundColor,backdrop:s.backdropFilter||s.webkitBackdropFilter||'none',border:s.borderColor,opacity:s.opacity};};
        return {topbar:one('.launcher-topbar'),widget:one('.launcher-widget'),dock:one('.launcher-dock'),icon:one('.launcher-app-icon')};
      })()`);
      await command("Emulation.setEmulatedMedia", { media: "screen", features: [] });
      await evaluate("document.body.classList.add('dark')"); await delay(80);
      auditReport.glass.dark = await glassSnapshot();
      await evaluate("document.body.classList.remove('dark')"); await delay(80);
      auditReport.glass.light = await glassSnapshot();
      for (const theme of ["dark", "light"]) for (const surface of ["topbar", "dock"]) {
        assert.notEqual(auditReport.glass[theme][surface].backdrop, "none", `${config.name}/${theme}/${surface}: backdrop-filter yok`);
      }
      assert.equal(auditReport.glass.dark.icon.backdrop, "none", `${config.name}: ikon backdrop-filter almamalı`);
      await command("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "prefers-reduced-transparency", value: "reduce" }] }); await delay(100);
      auditReport.glass.reducedTransparency = await glassSnapshot();
      assert.equal(auditReport.glass.reducedTransparency.dock.backdrop, "none", `${config.name}: reduced transparency dock blur kapatılmadı`);
      assert.equal(auditReport.glass.reducedTransparency.topbar.backdrop, "none", `${config.name}: reduced transparency topbar blur kapatılmadı`);
      await command("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "forced-colors", value: "active" }] }); await delay(100);
      auditReport.glass.forcedColors = await glassSnapshot();
      assert.equal(auditReport.glass.forcedColors.dock.backdrop, "none", `${config.name}: forced colors dock blur kapatılmadı`);
      await command("Emulation.setEmulatedMedia", { media: "screen", features: [] });

      await evaluate(`localStorage.setItem(${JSON.stringify(LAYOUT_KEY)}, '{bozuk-json'); location.reload()`);
      await waitFor("window.__LAUNCHER_STATE__ && document.querySelector('#launcherGrid')");
      auditReport.storage.badJsonFallback = await evaluate("({version:window.__LAUNCHER_STATE__.layouts.version,dock:window.__LAUNCHER_STATE__.layout.dock.length,apps:window.__LAUNCHER_STATE__.layout.pages.flatMap(p=>p.items).filter(i=>i.type!=='widget').length})");
      assert.equal(auditReport.storage.badJsonFallback.version, 4, `${config.name}: bozuk JSON v4 fallback değil`);
      assert.ok(auditReport.storage.badJsonFallback.dock >= 4 && auditReport.storage.badJsonFallback.apps === 4, `${config.name}: bozuk JSON fallback yanlış ${JSON.stringify(auditReport.storage.badJsonFallback)}`);
      await evaluate(`(() => { const value=window.__LAUNCHER_STATE__.layouts; value.mobile.pages[0].items.push({type:'app',id:'missing-registry-id'}); localStorage.setItem(${JSON.stringify(LAYOUT_KEY)},JSON.stringify(value)); location.reload(); })()`);
      await waitFor("window.__LAUNCHER_STATE__ && document.querySelector('#launcherGrid')");
      auditReport.storage.missingIdSanitized = await evaluate("!window.__LAUNCHER_STATE__.layouts.mobile.pages.some(page=>page.items.some(item=>item.id==='missing-registry-id'))");
      assert.equal(auditReport.storage.missingIdSanitized, true, `${config.name}: registry dışı kimlik temizlenmedi`);
      await evaluate(`(() => {
        window.__auditPerf={cls:0,longTasks:0,started:performance.now()};
        new PerformanceObserver(list=>{for(const entry of list.getEntries()) if(entry.startTime>=window.__auditPerf.started && !entry.hadRecentInput) window.__auditPerf.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
        try { new PerformanceObserver(list=>{window.__auditPerf.longTasks+=list.getEntries().filter(entry=>entry.startTime>=window.__auditPerf.started).length;}).observe({type:'longtask',buffered:true}); } catch {}
      })()`);
      await delay(650);
      auditReport.performance = await evaluate(`({cls:window.__auditPerf.cls,longTasks:window.__auditPerf.longTasks,resources:performance.getEntriesByType('resource').length,scrollX,scrollY})`);
      assert.equal(auditReport.performance.cls, 0, `${config.name}: yerleşik audit CLS sıfır değil`);
      assert.equal(auditReport.performance.scrollX, 0, `${config.name}: audit sonunda scrollX sıfır değil`);
      auditReport.consoleErrors = [...consoleIssues];
      auditReport.network404s = [...network404s];
      auditReport.local404s = [...local404s];
      await writeFile(join(ARTIFACTS, `audit-${config.name}-results.json`), `${JSON.stringify(auditReport, null, 2)}\n`);
    }

    assert.deepEqual(consoleIssues, [], `${config.name}: console hataları ${JSON.stringify(consoleIssues)}`);
    assert.deepEqual(network404s, [], `${config.name}: 404 yanıtları ${JSON.stringify(network404s)}`);
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
    console.log(`\n${browser.name.toUpperCase()} RESPONSIVE MODES`);
    console.table(results);
  }
  assert.deepEqual(local404s, [], `Yerel 404 istekleri: ${JSON.stringify(local404s)}`);
  console.log("✓ Mobil, tablet ve masaüstü launcher modları Chrome + Edge üzerinde geçti");
} finally {
  server.close();
}
