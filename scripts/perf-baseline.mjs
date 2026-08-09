#!/usr/bin/env node
/**
 * PERFORMANS OLCUM ARACI (Phase 0).
 *
 * Bu bir TEST degildir; kod degistirmeden once ve sonra AYNI olculeri alip
 * karsilastirabilmek icin bir olcum kosumudur. Ciktisi JSON olarak
 * test-artifacts/perf/ altina yazilir.
 *
 * Olculenler: ag istekleri (ve yinelenenler), DOM dugum sayisi, startup
 * kilometre taslari, uzun main-thread gorevleri, canli listener/timer/observer
 * sayilari, konsol gurultusu, uygulama acilis sureleri ve gezinme dongusunun
 * birakabilecegi sizinti sinyalleri.
 *
 * Kullanim: node ./scripts/perf-baseline.mjs [etiket]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { ThemeTestBrowser, ensureTestServer, delay, ROOT } from "./lib/theme-test-runtime.mjs";

const LABEL = process.argv[2] || "baseline";
const OUT_DIR = resolve(ROOT, "test-artifacts", "perf");
mkdirSync(OUT_DIR, { recursive: true });

/**
 * Sayfa daha ilk satirini calistirmadan once kurulan sayaclar.
 *
 * addEventListener/setInterval/rAF gibi API'leri sarmalayip CANLI sayilari
 * tutar. Boylece "kac listener sizdi" sorusu tahminle degil olcumle
 * yanitlanir. Sarmalayicilar davranisi degistirmez, yalnizca sayar.
 */
const INSTRUMENT = `
(() => {
  const stats = {
    listeners: new Map(),      // tip -> canli sayi
    listenerTotal: 0,
    intervals: new Set(),
    timeouts: new Set(),
    rafCount: 0,
    observers: { resize: 0, mutation: 0, intersection: 0 },
    longTasks: [],
    marks: {},
  };
  globalThis.__perf = stats;

  const targets = [EventTarget.prototype];
  for (const target of targets) {
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    target.addEventListener = function (type, handler, options) {
      stats.listeners.set(type, (stats.listeners.get(type) || 0) + 1);
      stats.listenerTotal += 1;
      return add.call(this, type, handler, options);
    };
    target.removeEventListener = function (type, handler, options) {
      const current = stats.listeners.get(type) || 0;
      if (current > 0) { stats.listeners.set(type, current - 1); stats.listenerTotal -= 1; }
      return remove.call(this, type, handler, options);
    };
  }

  const setIntervalOriginal = globalThis.setInterval;
  const clearIntervalOriginal = globalThis.clearInterval;
  globalThis.setInterval = function (...args) {
    const id = setIntervalOriginal.apply(this, args);
    stats.intervals.add(id);
    return id;
  };
  globalThis.clearInterval = function (id) { stats.intervals.delete(id); return clearIntervalOriginal.call(this, id); };

  const rafOriginal = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = function (...args) { stats.rafCount += 1; return rafOriginal.apply(this, args); };

  for (const [key, Ctor] of [["resize", "ResizeObserver"], ["mutation", "MutationObserver"], ["intersection", "IntersectionObserver"]]) {
    const Original = globalThis[Ctor];
    if (!Original) continue;
    globalThis[Ctor] = class extends Original {
      constructor(...args) { super(...args); stats.observers[key] += 1; }
    };
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        stats.longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch {}
})();
`;

const COLLECT = `(() => {
  const perf = globalThis.__perf || {};
  const resources = performance.getEntriesByType('resource');
  const byUrl = new Map();
  for (const entry of resources) {
    const key = entry.name.split('#')[0];
    byUrl.set(key, (byUrl.get(key) || 0) + 1);
  }
  const duplicates = [...byUrl.entries()].filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url: url.replace(location.origin, ''), count }));

  const kind = (entry) => {
    const path = entry.name.split('?')[0].toLowerCase();
    if (entry.initiatorType === 'img' || /\\.(avif|webp|jpe?g|png|svg|gif)$/.test(path)) return 'image';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.js') || path.endsWith('.mjs')) return 'js';
    if (path.endsWith('.pdf')) return 'pdf';
    if (/fonts?\\.|\\.woff2?$/.test(path)) return 'font';
    return 'other';
  };
  const counts = {};
  const bytes = {};
  let remote = 0;
  for (const entry of resources) {
    const k = kind(entry);
    counts[k] = (counts[k] || 0) + 1;
    bytes[k] = (bytes[k] || 0) + (entry.transferSize || 0);
    if (!entry.name.startsWith(location.origin)) remote += 1;
  }

  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paints = {};
  for (const entry of performance.getEntriesByType('paint')) paints[entry.name] = Math.round(entry.startTime);

  return {
    requests: { total: resources.length, remote, counts, bytes, duplicates },
    dom: {
      nodes: document.getElementsByTagName('*').length,
      images: document.images.length,
      canvases: document.querySelectorAll('canvas').length,
      dialogs: document.querySelectorAll('dialog').length,
      scripts: document.scripts.length,
      stylesheets: document.styleSheets.length,
      cssRules: [...document.styleSheets].reduce((sum, sheet) => {
        try { return sum + sheet.cssRules.length; } catch { return sum; }
      }, 0),
    },
    listeners: { total: perf.listenerTotal || 0, byType: Object.fromEntries(perf.listeners || []) },
    timers: { liveIntervals: (perf.intervals || new Set()).size, rafRequests: perf.rafCount || 0 },
    observers: perf.observers || {},
    longTasks: {
      count: (perf.longTasks || []).length,
      totalMs: (perf.longTasks || []).reduce((sum, task) => sum + task.duration, 0),
      worst: (perf.longTasks || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 5),
    },
    timing: {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEvent: Math.round(nav.loadEventEnd || 0),
      firstPaint: paints['first-paint'] || null,
      firstContentfulPaint: paints['first-contentful-paint'] || null,
    },
    memory: performance.memory ? {
      usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      totalMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1),
    } : null,
  };
})()`;

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch(`perf-${LABEL}`);
const report = { label: LABEL, generatedAt: new Date().toISOString(), viewports: {}, apps: {}, cycle: null };

try {
  await browser.addNewDocumentScript(INSTRUMENT);

  /* --- 1. Viewport basina startup profili --- */
  for (const [width, height] of [[390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
    await browser.setViewport({ width, height });
    const started = Date.now();
    await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
    const launcherUsableMs = Date.now() - started;
    await delay(2500); // uzun gorevlerin ve gec isteklerin oturmasi icin
    const snapshot = await browser.evaluate(COLLECT);
    const splash = await browser.evaluate(`(() => {
      const node = document.getElementById('splash-screen') || document.querySelector('.splash-screen, #splash, [data-splash]');
      if (!node) return { present: false };
      const style = getComputedStyle(node);
      return { present: true, visible: style.display !== 'none' && style.opacity !== '0' && !node.hidden };
    })()`);
    report.viewports[`${width}x${height}`] = { launcherUsableMs, splash, ...snapshot };
  }

  /* --- 2. Uygulama acilis sureleri: ilk ve ikinci acilis --- */
  await browser.setViewport({ width: 1440, height: 900 });
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(1200);

  const ROUTES = ["ravza-books", "ezber-merkezi", "sinav-merkezi", "oyun"];
  for (const route of ROUTES) {
    const timings = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const started = Date.now();
      await browser.evaluate(`window.navigate(${JSON.stringify(route)})`);
      try {
        await browser.waitFor(`document.body.dataset.currentRoute === ${JSON.stringify(route)}`, route, 30000);
      } catch { timings.push(null); continue; }
      await delay(400);
      timings.push(Date.now() - started);
      await browser.evaluate(`window.navigate('ana-sayfa')`);
      await browser.waitFor("document.body.dataset.currentRoute === 'ana-sayfa'", "ana-sayfa", 30000);
      await delay(400);
    }
    report.apps[route] = { firstOpenMs: timings[0], secondOpenMs: timings[1] };
  }

  /* --- 3. Gezinme dongusu: sizinti sinyalleri --- */
  const before = await browser.evaluate(COLLECT);
  for (let cycle = 0; cycle < 10; cycle += 1) {
    for (const route of ["ravza-books", "ezber-merkezi", "ana-sayfa"]) {
      await browser.evaluate(`window.navigate(${JSON.stringify(route)})`);
      try { await browser.waitFor(`document.body.dataset.currentRoute === ${JSON.stringify(route)}`, route, 30000); }
      catch { /* rota acilamadi; dongu devam eder */ }
      await delay(150);
    }
  }
  await delay(1000);
  const after = await browser.evaluate(COLLECT);
  report.cycle = {
    cycles: 10,
    listenersBefore: before.listeners.total, listenersAfter: after.listeners.total,
    domBefore: before.dom.nodes, domAfter: after.dom.nodes,
    canvasBefore: before.dom.canvases, canvasAfter: after.dom.canvases,
    intervalsBefore: before.timers.liveIntervals, intervalsAfter: after.timers.liveIntervals,
    observersBefore: before.observers, observersAfter: after.observers,
    memoryBefore: before.memory, memoryAfter: after.memory,
    listenerGrowthByType: Object.fromEntries(
      Object.entries(after.listeners.byType)
        .map(([type, count]) => [type, count - (before.listeners.byType[type] || 0)])
        .filter(([, delta]) => delta !== 0)
        .sort((a, b) => b[1] - a[1]),
    ),
  };

  report.console = {
    errors: browser.consoleErrors,
    warnings: browser.consoleWarnings,
    networkErrors: browser.localNetworkErrors,
  };
} finally {
  await browser.close();
  await server.close();
}

const file = resolve(OUT_DIR, `perf-${LABEL}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));

const desktop = report.viewports["1440x900"];
console.log(`\n=== PERF (${LABEL}) — 1440x900 ===`);
console.log(`launcher kullanilabilir : ${desktop.launcherUsableMs} ms`);
console.log(`FCP                     : ${desktop.timing.firstContentfulPaint} ms`);
console.log(`istek / uzak            : ${desktop.requests.total} / ${desktop.requests.remote}`);
console.log(`  js/css/img/font       : ${desktop.requests.counts.js || 0} / ${desktop.requests.counts.css || 0} / ${desktop.requests.counts.image || 0} / ${desktop.requests.counts.font || 0}`);
console.log(`  yinelenen istek       : ${desktop.requests.duplicates.length}`);
console.log(`DOM dugum / img / canvas: ${desktop.dom.nodes} / ${desktop.dom.images} / ${desktop.dom.canvases}`);
console.log(`CSS kurali              : ${desktop.dom.cssRules}`);
console.log(`listener (canli)        : ${desktop.listeners.total}`);
console.log(`interval / rAF          : ${desktop.timers.liveIntervals} / ${desktop.timers.rafRequests}`);
console.log(`observer                : ${JSON.stringify(desktop.observers)}`);
console.log(`uzun gorev              : ${desktop.longTasks.count} adet, toplam ${desktop.longTasks.totalMs} ms`);
console.log(`heap                    : ${desktop.memory ? desktop.memory.usedMB + " MB" : "yok"}`);

console.log(`\n=== UYGULAMA ACILIS ===`);
for (const [route, timing] of Object.entries(report.apps)) {
  console.log(`${route.padEnd(16)}: ilk ${timing.firstOpenMs} ms / ikinci ${timing.secondOpenMs} ms`);
}

console.log(`\n=== 10 GEZINME DONGUSU ===`);
console.log(`listener : ${report.cycle.listenersBefore} -> ${report.cycle.listenersAfter}`);
console.log(`DOM      : ${report.cycle.domBefore} -> ${report.cycle.domAfter}`);
console.log(`canvas   : ${report.cycle.canvasBefore} -> ${report.cycle.canvasAfter}`);
console.log(`interval : ${report.cycle.intervalsBefore} -> ${report.cycle.intervalsAfter}`);
console.log(`heap     : ${report.cycle.memoryBefore?.usedMB} -> ${report.cycle.memoryAfter?.usedMB} MB`);
console.log(`buyuyen listener tipleri: ${JSON.stringify(report.cycle.listenerGrowthByType)}`);
console.log(`\nkonsol: ${report.console.errors.length} hata, ${report.console.warnings.length} uyari`);
console.log(`rapor: ${file}`);
