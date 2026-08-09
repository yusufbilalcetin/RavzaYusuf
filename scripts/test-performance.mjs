#!/usr/bin/env node
/**
 * PERFORMANS SOZLESME TESTI.
 *
 * Bu dosya hiz OLCMEZ - hiz olcumleri makineye gore degisir ve testte
 * kirilgan olur. Bunun yerine, olcumle DOGRULANMIS yapisal degismezleri
 * kilitler; bunlarin bozulmasi her zaman gercek bir gerileme demektir:
 *
 *   - initApp / overlay kaydi / launcher bir kereden fazla calismaz,
 *   - gezinme dongusu DOM, canvas, interval ya da observer biriktirmez,
 *   - CANLI dugumlerde ayni olay icin yinelenen dinleyici olusmaz,
 *   - ayni URL startup'ta iki kez istenmez,
 *   - ekran disi galeri gorselleri lazy, kritik hero gorseli eager kalir,
 *   - rota degisimi arka plan cozucusunu yeniden tetiklemez.
 *
 * Kullanim: node ./scripts/test-performance.mjs
 */
import assert from "node:assert/strict";
import { ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";

const cases = [];
async function runCase(name, task) {
  try {
    await task();
    cases.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    cases.push({ name, ok: false, error: error.message });
    console.error(`FAIL  ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

/**
 * Sayfa kodundan ONCE kurulan sayaclar.
 *
 * CANLI dugum basina dinleyici sayisi tutulur. Ham "kac addEventListener
 * cagrildi" sayisi yaniltici olur: her render'da yeniden yaratilan dugumlerin
 * dinleyicileri dugumle birlikte cope gider, sizinti degildir. Gercek hata,
 * DOM'da DURAN bir dugume ayni olayin iki kez baglanmasidir - olculen budur.
 */
const INSTRUMENT = [
  "(() => {",
  "  var counts = new WeakMap();",
  "  var stats = { intervals: new Set(), observers: { resize: 0, mutation: 0, intersection: 0 } };",
  "  globalThis.__perf = stats;",
  "  var add = EventTarget.prototype.addEventListener;",
  "  EventTarget.prototype.addEventListener = function (type, handler, options) {",
  "    if (this instanceof Element) {",
  "      var map = counts.get(this);",
  "      if (!map) { map = {}; counts.set(this, map); }",
  "      map[type] = (map[type] || 0) + 1;",
  "      if (map[type] > 1) this.setAttribute('data-perf-dup-' + type, String(map[type]));",
  "    }",
  "    return add.call(this, type, handler, options);",
  "  };",
  "  var setIntervalOriginal = globalThis.setInterval;",
  "  var clearIntervalOriginal = globalThis.clearInterval;",
  "  globalThis.setInterval = function () {",
  "    var id = setIntervalOriginal.apply(this, arguments);",
  "    stats.intervals.add(id);",
  "    return id;",
  "  };",
  "  globalThis.clearInterval = function (id) { stats.intervals.delete(id); return clearIntervalOriginal.call(this, id); };",
  "  var pairs = [['resize', 'ResizeObserver'], ['mutation', 'MutationObserver'], ['intersection', 'IntersectionObserver']];",
  "  for (var i = 0; i < pairs.length; i++) {",
  "    (function (key, name) {",
  "      var Original = globalThis[name];",
  "      if (!Original) return;",
  "      globalThis[name] = function () {",
  "        stats.observers[key] += 1;",
  "        return new Original(arguments[0], arguments[1]);",
  "      };",
  "      globalThis[name].prototype = Original.prototype;",
  "    })(pairs[i][0], pairs[i][1]);",
  "  }",
  "})();",
].join("\n");

const SNAPSHOT = `(() => {
  const perf = globalThis.__perf || { intervals: new Set(), observers: {} };
  return {
    nodes: document.getElementsByTagName('*').length,
    canvases: document.querySelectorAll('canvas').length,
    dialogs: document.querySelectorAll('dialog').length,
    intervals: perf.intervals.size,
    observers: { ...perf.observers },
    // Yinelenmis dinleyicisi olan ve HALA DOM'da duran dugumler.
    liveDuplicates: [...document.querySelectorAll('[data-perf-dup-click], [data-perf-dup-keydown], [data-perf-dup-scroll], [data-perf-dup-input]')]
      .filter((el) => el.isConnected)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        cls: String(el.className || '').slice(0, 48),
        click: el.getAttribute('data-perf-dup-click'),
        keydown: el.getAttribute('data-perf-dup-keydown'),
        scroll: el.getAttribute('data-perf-dup-scroll'),
      })),
  };
})()`;

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("performance");

async function gotoLauncher() {
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(900);
}

async function go(route) {
  await browser.evaluate(`window.navigate(${JSON.stringify(route)})`);
  await browser.waitFor(`document.body.dataset.currentRoute === ${JSON.stringify(route)}`, route, 30000);
  await delay(180);
}

/* Olculen taban degerler (perf-baseline.mjs, 1440x900). Buradaki sinirlar
   olculen degerin biraz ustunde tutulur: amac makine hizini degil, YAPISAL
   bir patlamayi yakalamaktir. */
const LIMITS = {
  startupIntervals: 4, // olculen: 2
  domGrowthPerCycle: 40, // olculen: 0
};

/**
 * BILINEN cift sahiplikler - bu turda BILEREK duzeltilmedi.
 *
 * Ikisi de legacy tarafinda katmanli davranisa baglidir:
 *   #scrollTopBtn   : compatibility.js app-shell scroll'u, legacy-app.js
 *                     window scroll'u baglar; ustune RavzaLingo capture
 *                     fazinda stopImmediatePropagation ile devralip
 *                     "orijinal handler en uste goturur" varsayimina dayanir.
 *   main-content    : app kabugu ve uyumluluk katmani ayni kaydiriciyi
 *                     dinler (ikisi de passive).
 *
 * Test bunlari GECIRIR ama listeyi sabitler: YENI bir dugumde yinelenen
 * dinleyici olusursa test duser. Boylece mevcut durum gizlenmez, yeni
 * gerileme de kacmaz.
 */
const KNOWN_DUPLICATE_OWNERS = ["scrollTopBtn", "main-content"];

try {
  await browser.addNewDocumentScript(INSTRUMENT);
  await browser.setViewport({ width: 1440, height: 900 });

  await runCase("startup: her sistem YALNIZCA bir kez baslar", async () => {
    await gotoLauncher();
    const repeated = await browser.evaluate(`(async () => {
      // initApp idempotent olmali: ikinci cagri hicbir sey yapmamali.
      const before = document.getElementsByTagName('*').length;
      await globalThis.__RAVZA_INIT_APP__?.();
      const after = document.getElementsByTagName('*').length;
      const overlay = await import('/js/core/overlay-manager.js');
      return {
        nodeDelta: after - before,
        launcherGrids: document.querySelectorAll('#launcherGrid').length,
        appShells: document.querySelectorAll('#page-root').length,
        controlCenters: document.querySelectorAll('#control-center').length,
        wallpaperPanels: document.querySelectorAll('#wallpaper-panel').length,
        overlayRegistered: ['control-center', 'wallpaper-panel'].map((id) => overlay.isOverlayRegistered(id)),
      };
    })()`);
    assert.equal(repeated.nodeDelta, 0, `ikinci initApp ${repeated.nodeDelta} dugum ekledi`);
    assert.equal(repeated.launcherGrids, 1, "birden fazla launcher grid var");
    assert.equal(repeated.appShells, 1, "birden fazla sayfa kabugu var");
    assert.ok(repeated.controlCenters <= 1, "birden fazla Kontrol Merkezi dialogu var");
    assert.ok(repeated.wallpaperPanels <= 1, "birden fazla Arka Plan paneli var");
    assert.deepEqual(repeated.overlayRegistered, [true, true], "overlay kaydi eksik");
  });

  await runCase("startup: ayni URL iki kez istenmez", async () => {
    await gotoLauncher();
    const duplicates = await browser.evaluate(`(() => {
      const seen = new Map();
      for (const entry of performance.getEntriesByType('resource')) {
        // Onbellekten gelen yeniden kullanimlar degil, GERCEK ikinci istekler.
        const url = entry.name.split('#')[0];
        seen.set(url, (seen.get(url) || 0) + 1);
      }
      return [...seen.entries()].filter(([, count]) => count > 1)
        .map(([url, count]) => url.replace(location.origin, '') + ' x' + count);
    })()`);
    assert.deepEqual(duplicates, [], `yinelenen istek: ${duplicates.join(", ")}`);
  });

  await runCase("startup: baslangicta acik interval sayisi sinirli", async () => {
    const snapshot = await browser.evaluate(SNAPSHOT);
    assert.ok(snapshot.intervals <= LIMITS.startupIntervals,
      `startup'ta ${snapshot.intervals} interval acik (sinir ${LIMITS.startupIntervals})`);
  });

  await runCase("10 gezinme dongusu DOM/canvas/interval biriktirmez", async () => {
    await gotoLauncher();
    /* ISINMA: SPA sayfalari bir kez acildiktan sonra DOM'da MONTE kalir
       (yeniden acilis hizi icin bilincli bir tasarim). Bu tek seferlik artis
       sizinti degildir. Bu yuzden once tum rotalar bir kez gezilir, olcum
       ondan SONRA baslar - boylece test gercek buyumeyi olcer. */
    for (const route of ["ravza-books", "ezber-merkezi", "ana-sayfa"]) await go(route);
    await delay(600);
    const before = await browser.evaluate(SNAPSHOT);
    for (let cycle = 0; cycle < 10; cycle += 1) {
      for (const route of ["ravza-books", "ezber-merkezi", "ana-sayfa"]) await go(route);
    }
    await delay(800);
    const after = await browser.evaluate(SNAPSHOT);

    const domGrowth = after.nodes - before.nodes;
    assert.ok(domGrowth <= LIMITS.domGrowthPerCycle * 10,
      `DOM ${before.nodes} -> ${after.nodes} (+${domGrowth}) buyudu`);
    assert.ok(after.canvases <= before.canvases + 2,
      `canvas ${before.canvases} -> ${after.canvases} birikti`);
    assert.equal(after.intervals, before.intervals,
      `interval ${before.intervals} -> ${after.intervals} sizdi`);
    // Observer'lar dogrudan bellek/CPU maliyetidir; dongu basina artmamali.
    for (const key of Object.keys(before.observers)) {
      const growth = (after.observers[key] || 0) - (before.observers[key] || 0);
      assert.ok(growth <= 10, `${key}Observer dongude ${growth} adet artti`);
    }
  });

  await runCase("CANLI dugumlerde yinelenen dinleyici olusmaz", async () => {
    const snapshot = await browser.evaluate(SNAPSHOT);
    const describe = (entry) =>
      `${entry.tag}#${entry.id || "-"}.${entry.cls} click=${entry.click} keydown=${entry.keydown} scroll=${entry.scroll}`;
    const unexpected = snapshot.liveDuplicates.filter((entry) => {
      const identity = `${entry.id || ""} ${entry.cls || ""}`;
      return !KNOWN_DUPLICATE_OWNERS.some((known) => identity.includes(known));
    });
    assert.deepEqual(unexpected.map(describe), [],
      `DOM'da duran dugumlerde YENI yinelenen dinleyici: ${unexpected.map(describe).join(" | ")}`);
  });

  await runCase("rota degisimi arka plan cozucusunu yeniden tetiklemez", async () => {
    await gotoLauncher();
    const stage = `document.getElementById('anaSayfaHeroStage')?.dataset.homeHeroTheme || null`;
    const before = await browser.evaluate(stage);
    for (const route of ["ravza-books", "ana-sayfa", "ezber-merkezi", "ana-sayfa"]) await go(route);
    await delay(400);
    assert.equal(await browser.evaluate(stage), before, "gezinme arka plani yeniden cozdu");
  });

  await runCase("tema degisimi uygulamalari yeniden baslatmaz", async () => {
    await gotoLauncher();
    const before = await browser.evaluate(SNAPSHOT);
    await browser.evaluate(`(async () => {
      const theme = await import('/js/core/theme.js');
      theme.setThemeMode('dark');
    })()`);
    await delay(500);
    await browser.evaluate(`(async () => {
      const theme = await import('/js/core/theme.js');
      theme.setThemeMode('light');
    })()`);
    await delay(500);
    const after = await browser.evaluate(SNAPSHOT);
    assert.equal(after.nodes, before.nodes, `tema degisimi DOM'u ${before.nodes} -> ${after.nodes} degistirdi`);
    assert.equal(after.intervals, before.intervals, "tema degisimi interval sizdirdi");
  });

  await runCase("ekran disi galeri gorselleri lazy, hero eager", async () => {
    await gotoLauncher();
    await browser.evaluate("window.openWallpaperPanel && window.openWallpaperPanel()");
    await browser.waitFor("document.getElementById('wallpaper-panel')?.open === true", "arka plan paneli");
    await delay(400);
    const loading = await browser.evaluate(`(() => {
      const gallery = [...document.querySelectorAll('#wallpaper-panel .wp-thumb-frame img')];
      const hero = document.getElementById('anaSayfaHeroImage');
      return {
        galleryCount: gallery.length,
        galleryLazy: gallery.every((img) => img.loading === 'lazy'),
        galleryAsync: gallery.every((img) => img.decoding === 'async'),
        heroLazy: hero ? hero.loading === 'lazy' : null,
      };
    })()`);
    assert.ok(loading.galleryCount > 4, "galeri gorselleri bulunamadi");
    assert.equal(loading.galleryLazy, true, "ekran disi galeri gorselleri eager yukleniyor");
    assert.equal(loading.galleryAsync, true, "galeri gorselleri decoding=async degil");
    assert.notEqual(loading.heroLazy, true, "kritik hero gorseli lazy isaretlenmis");
    await browser.evaluate("window.closeWallpaperPanel && window.closeWallpaperPanel()");
  });

  await runCase("konsol temiz kalir", async () => {
    assertCleanDiagnostics(browser, "performans");
  });
} finally {
  await browser.close();
  await server.close();
}

const passed = cases.filter((entry) => entry.ok).length;
console.log(`\nPerformans sozlesmeleri: ${passed}/${cases.length} gecti`);
if (passed === cases.length) {
  console.log("✓ Tek baslatma, sizinti yok, yinelenen istek yok, lazy/eager dogru");
}
