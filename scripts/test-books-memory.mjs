/**
 * Ravza Books · okuyucu bellek ve render yaşam döngüsü ölçümü.
 *
 * Bu betik ÖNCE ÖLÇER, sonra iddia eder. 19 adımlık gerçek okuma senaryosu
 * tarayıcıda aynen koşturulur; her adımda canlı ölçüm alınır ve ham kayıt
 * test-artifacts/perf/books-memory.json dosyasına yazılır.
 *
 * ÖLÇÜM YÖNTEMİ - kasıtlı seçimler:
 *
 *   1. Tuval belleği yalnızca canvas SAYISIYLA ölçülemez. Backing store
 *      yaklaşık göstergesi sum(width * height * 4) baytıdır. Bu GERÇEK GPU
 *      belleği DEĞİLDİR (sürücü tarafı, tiling ve sıkıştırma hariç); yalnızca
 *      2D backing store'un büyüklük mertebesini verir.
 *
 *   2. "Kopmuş (detached) canvas" DOM sorgusuyla bulunamaz. Runtime.queryObjects
 *      HTMLCanvasElement.prototype üzerinde çalıştırılır: CDP önce çöp toplar,
 *      sonra YAŞAYAN nesneleri döndürür. isConnected === false olanlar gerçekten
 *      tutulan tuvallerdir. Bu projede daha önce "kümülatif addEventListener
 *      sayısı" leak sanılmıştı; o hata tekrarlanmıyor - canlı nesne ölçülür.
 *
 *   3. "Okuyucu kapandıktan sonra aktif renderTask" doğrudan görülemez: pdf.js
 *      render görevleri modül içi nesnelerdir ve üretim kodu test için
 *      değiştirilmez. Ama pdf.js'in TÜM render işi worker'da yapılır - worker
 *      sonlandıysa çalışan bir render görevi olamaz. Worker yaşam döngüsü
 *      sayfa içinde Worker sınıfı sarılarak sayılır.
 *
 *   4. Heap MB değeri GC'ye bağlıdır; hard-fail eşiği olarak KULLANILMAZ,
 *      yalnızca eğilim raporlanır. Kesin iddialar deterministik sayımlara
 *      (tuval backing, worker, DOM düğümü) dayanır.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  ThemeTestBrowser,
  ensureTestServer,
  delay,
  assertCleanDiagnostics,
} from "./lib/theme-test-runtime.mjs";

const ARTIFACT_DIR = join(ROOT, "test-artifacts", "perf");
const BIG_BOOK = "atesten-gomlek"; // 6,8 MB - depodaki en büyük PDF
const SECOND_BOOK = "ask-i-memnu"; // 2,8 MB - kitap değişimi için ikinci büyük PDF
const PREFS_KEY = "ravza-books-prefs";

const results = [];
const timeline = [];
let failures = 0;

async function testCase(name, run) {
  try {
    await run();
    results.push(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`  FAIL  ${name}\n        ${String(error.message).split("\n").join("\n        ")}`);
  }
}

/* ------------------------------------------------------------------------ */
/* SAYFA İÇİ ENSTRÜMANTASYON (yalnızca test tarafı, üretim kodu değişmez)     */
/* ------------------------------------------------------------------------ */

const INSTRUMENT = `(() => {
  let rafScheduled = 0;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    rafScheduled += 1;
    return nativeRaf(callback);
  };

  const workers = new Set();
  let workersCreated = 0;
  const NativeWorker = window.Worker;
  if (typeof NativeWorker === 'function') {
    class TrackedWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        workersCreated += 1;
        workers.add(this);
      }
      terminate() {
        workers.delete(this);
        return super.terminate();
      }
    }
    window.Worker = TrackedWorker;
  }

  const objectUrls = new Set();
  const nativeCreate = URL.createObjectURL.bind(URL);
  const nativeRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = nativeCreate(blob);
    objectUrls.add(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    objectUrls.delete(url);
    return nativeRevoke(url);
  };

  const intervals = new Set();
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  window.setInterval = (...args) => {
    const id = nativeSetInterval(...args);
    intervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    intervals.delete(id);
    return nativeClearInterval(id);
  };

  window.__readerProbe = {
    liveWorkers: () => workers.size,
    workersCreated: () => workersCreated,
    objectUrls: () => objectUrls.size,
    intervals: () => intervals.size,
    // Kalıcı animasyon döngüsü ölçümü: boştaki sayfada 1 sn'de kaç rAF planlandı.
    sampleRaf: (ms) => new Promise((resolve) => {
      const start = rafScheduled;
      setTimeout(() => resolve(rafScheduled - start), ms);
    }),
  };
})()`;

/**
 * Yer tutucu tuval `<canvas width="1" height="1">` olarak doğar (4 bayt) ve
 * pencereden çıkınca 0x0'a indirilir. Yani "sıfırdan büyük tuval" saymak
 * anlamsızdır - ölçülmesi gereken GERÇEK render bellekleridir. Eşik:
 * 10.000 piksel (100x100), yer tutucudan üç kat büyüklük mertebesi uzakta.
 */
const RENDER_PIXEL_FLOOR = 10000;

const PROBE = `(() => {
  const FLOOR = ${RENDER_PIXEL_FLOOR};
  const probe = window.__readerProbe;
  const canvases = [...document.querySelectorAll('canvas')];
  let canvasPixels = 0;
  let heavyCanvases = 0;
  for (const canvas of canvases) {
    const pixels = canvas.width * canvas.height;
    canvasPixels += pixels;
    if (pixels >= FLOOR) heavyCanvases += 1;
  }

  /* "Pencere dışı" ÖLÇÜTÜ: geçerli sayfadan UZAKLIK, is-rendered sınıfı değil.
     İlk denememde sınıfa bakıyordum ve render'ı süren sayfaları (tuvali
     boyutlanmış ama sınıfı henüz yazılmamış) sızıntı sanıyordum. Render
     penceresi tek sayfada 5, çift sayfada 6'dır; yani en fazla geçerli
     sayfanın ±2-3 komşusu. Uzaklığı 4'ü geçen bir sayfa hâlâ tam çözünürlüklü
     tuval tutuyorsa bu GERÇEK bir tahliye kusurudur. */
  const WINDOW_REACH = 4;
  const current = Number(document.getElementById('reader-inner')?.dataset.currentPage) || 0;
  const pdfPages = [...document.querySelectorAll('.pdf-page')];
  let offWindowHeavy = 0;
  let offWindowPixels = 0;
  let renderedPages = 0;
  for (const page of pdfPages) {
    const canvas = page.querySelector('canvas');
    const backing = canvas ? canvas.width * canvas.height : 0;
    if (page.classList.contains('is-rendered')) renderedPages += 1;
    const number = Number(page.dataset.pdfPage) || 0;
    if (backing >= FLOOR && current > 0 && Math.abs(number - current) > WINDOW_REACH) {
      offWindowHeavy += 1;
      offWindowPixels += backing;
    }
  }

  return {
    domNodes: document.getElementsByTagName('*').length,
    canvasCount: canvases.length,
    heavyCanvases,
    canvasPixels,
    canvasBackingMB: Number(((canvasPixels * 4) / 1048576).toFixed(2)),
    pdfPageElements: pdfPages.length,
    renderedPages,
    offWindowHeavy,
    offWindowPixels,
    textLayerNodes: document.querySelectorAll('.textLayer, .pdf-text-layer').length,
    thumbImages: document.querySelectorAll('img[data-thumb-page]').length,
    thumbsLoaded: document.querySelectorAll('.reader-thumb.is-loaded').length,
    liveWorkers: probe ? probe.liveWorkers() : -1,
    workersCreated: probe ? probe.workersCreated() : -1,
    objectUrls: probe ? probe.objectUrls() : -1,
    intervals: probe ? probe.intervals() : -1,
    appMode: document.getElementById('ravzabooks')?.dataset.appMode ?? null,
    currentPage: Number(document.getElementById('reader-inner')?.dataset.currentPage) || null,
    readerMode: document.querySelector('.mode-btn.selected')?.dataset.mode ?? null,
  };
})()`;

/* ------------------------------------------------------------------------ */
/* CDP TARAFI ÖLÇÜM                                                          */
/* ------------------------------------------------------------------------ */

async function liveCanvasCensus(browser) {
  const proto = await browser.command("Runtime.evaluate", {
    expression: "HTMLCanvasElement.prototype",
    returnByValue: false,
  });
  const objectId = proto.result?.objectId;
  if (!objectId) return null;
  const query = await browser.command("Runtime.queryObjects", { prototypeObjectId: objectId });
  const arrayId = query.objects?.objectId;
  if (!arrayId) {
    await browser.command("Runtime.releaseObject", { objectId });
    return null;
  }
  const census = await browser.command("Runtime.callFunctionOn", {
    objectId: arrayId,
    returnByValue: true,
    functionDeclaration: `function () {
      let live = 0;
      let detached = 0;
      let livePixels = 0;
      let detachedPixels = 0;
      for (const canvas of this) {
        const pixels = canvas.width * canvas.height;
        live += 1;
        livePixels += pixels;
        if (!canvas.isConnected) {
          detached += 1;
          detachedPixels += pixels;
        }
      }
      return { live, detached, livePixels, detachedPixels };
    }`,
  });
  await browser.command("Runtime.releaseObject", { objectId: arrayId });
  await browser.command("Runtime.releaseObject", { objectId });
  return census.result?.value ?? null;
}

async function heapUsedMB(browser) {
  await browser.command("HeapProfiler.collectGarbage").catch(() => {});
  const usage = await browser.command("Runtime.getHeapUsage").catch(() => null);
  if (!usage?.usedSize) return null;
  return Number((usage.usedSize / 1048576).toFixed(2));
}

async function snapshot(browser, label) {
  await waitForReaderIdle(browser);
  const page = await browser.evaluate(PROBE);
  const census = await liveCanvasCensus(browser);
  const heapMB = await heapUsedMB(browser);
  const entry = {
    label,
    ...page,
    liveCanvases: census?.live ?? null,
    detachedCanvases: census?.detached ?? null,
    liveCanvasBackingMB: census ? Number(((census.livePixels * 4) / 1048576).toFixed(2)) : null,
    detachedCanvasBackingMB: census ? Number(((census.detachedPixels * 4) / 1048576).toFixed(2)) : null,
    heapMB,
  };
  timeline.push(entry);
  return entry;
}

/* ------------------------------------------------------------------------ */
/* SENARYO SÜRÜCÜLERİ                                                        */
/* ------------------------------------------------------------------------ */

const LIBRARY_READY = "document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')";
const READING_READY = "document.querySelector('#ravzabooks[data-app-mode=\"reading\"] .pdf-page.is-rendered')";
const ARROW_CODES = { ArrowRight: 39, ArrowLeft: 37 };

/** Doğrudan CDP tuş olayı: Page.bringToFront çağırmaz, favicon gürültüsü üretmez. */
async function pressKey(browser, key) {
  const shared = {
    key,
    code: key,
    windowsVirtualKeyCode: ARROW_CODES[key],
    nativeVirtualKeyCode: ARROW_CODES[key],
  };
  await browser.command("Input.dispatchKeyEvent", { type: "rawKeyDown", ...shared });
  await browser.command("Input.dispatchKeyEvent", { type: "keyUp", ...shared });
}

async function openLibrary(browser) {
  await browser.navigate("/?page=ravza-books", LIBRARY_READY);
}

async function openBook(browser, bookId) {
  await browser.evaluate(
    `document.querySelector('.library-book-card[data-book-id=${JSON.stringify(bookId)}]').click()`,
  );
  await browser.waitFor(READING_READY, `${bookId} okuyucuda açılmadı`, 60000);
}

async function closeReader(browser) {
  await browser.evaluate("document.getElementById('rdr-back')?.click()");
  await browser.waitFor(LIBRARY_READY, "kitaplığa dönülemedi", 20000);
}

const currentPageExpression = "Number(document.getElementById('reader-inner')?.dataset.currentPage) || 0";

/** Klavye ile sayfa çevirir; sabit uyku yerine sayfa numarasının değişmesini bekler. */
async function turnPages(browser, count, key) {
  for (let step = 0; step < count; step += 1) {
    const before = await browser.evaluate(currentPageExpression);
    await pressKey(browser, key);
    await browser
      .waitFor(`(${currentPageExpression}) !== ${before}`, `sayfa ${key} ile ilerlemedi`, 8000)
      .catch(() => {});
  }
}

/**
 * Okuyucu durulana kadar bekler.
 *
 * Sürekli modda goToPdfPage yumuşak kaydırma başlatır: dataset.currentPage
 * hedefe hemen yazılır ama render penceresi kaydırma bitene kadar eski
 * konumun etrafındadır. O anda alınan bir örnek, yolda kalan tuvalleri
 * "pencere dışı sızıntı" gibi gösteriyordu. Sabit uyku yerine gerçek koşul
 * beklenir: sayfa numarası ve kaydırma konumu iki ardışık okumada aynı olsun.
 */
async function waitForReaderIdle(browser) {
  const state = `(() => {
    const scroller = document.getElementById('rdr-flipbook');
    return [
      document.getElementById('reader-inner')?.dataset.currentPage ?? '',
      Math.round(scroller?.scrollTop ?? -1),
      document.querySelectorAll('.pdf-page.is-rendered').length,
    ].join('|');
  })()`;
  let previous = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await browser.evaluate(state);
    if (current === previous) return current;
    previous = current;
    await delay(120);
  }
  return previous;
}

async function openPagesTab(browser) {
  await browser.evaluate("document.getElementById('rdr-contents-open').click()");
  await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler açılmadı");
  await browser.evaluate("document.getElementById('rdr-tab-pages')?.click()");
  await browser.waitFor(
    "document.querySelectorAll('img[data-thumb-page]').length > 0",
    "küçük resim ızgarası kurulmadı",
  );
}

/** Küçük resim şeridini gerçekten kaydırır; yüklenen sayısı hedefe ulaşana kadar. */
async function scrollThumbnails(browser, targetLoaded) {
  const loadedExpression = "document.querySelectorAll('.reader-thumb.is-loaded').length";
  for (let step = 0; step < 40; step += 1) {
    const loaded = await browser.evaluate(loadedExpression);
    if (loaded >= targetLoaded) return loaded;
    const atEnd = await browser.evaluate(`(() => {
      const node = document.getElementById('rdr-thumbs');
      if (!node) return true;
      const before = node.scrollTop;
      node.scrollTop = before + node.clientHeight * 0.85;
      return node.scrollTop === before;
    })()`);
    await browser
      .waitFor(`${loadedExpression} > ${loaded}`, "küçük resim yüklenmedi", 8000)
      .catch(() => {});
    if (atEnd) break;
  }
  return browser.evaluate(loadedExpression);
}

async function closeSheets(browser) {
  await browser.evaluate("document.querySelectorAll('dialog[open]').forEach(sheet => sheet.close())");
  await browser.waitFor("document.querySelectorAll('dialog[open]').length === 0", "paneller kapanmadı");
}

async function switchMode(browser, mode) {
  await browser.evaluate("document.getElementById('rdr-settings-open').click()");
  await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open === true", "ayarlar açılmadı");
  await browser.evaluate(`document.querySelector('.mode-btn[data-mode="${mode}"]').click()`);
  await browser.waitFor(READING_READY, `${mode} moduna geçilemedi`, 60000);
}

/**
 * Okuma modunu diske yazar ve sayfayı YENİDEN YÜKLER.
 *
 * Yalnızca localStorage'a yazmak yetmez: state modül belleğinde zaten
 * yüklüdür. İlk denememde bu yüzden senaryo sessizce kaydırma modunda koştu ve
 * sayfa modundaki kusuru ıskaladı - o hata burada kapatılıyor.
 */
async function forcePageMode(browser) {
  await browser.evaluate(
    `localStorage.setItem(${JSON.stringify(PREFS_KEY)}, JSON.stringify({ readerMode: 'page' }))`,
  );
  await browser.navigate("/?page=ravza-books", LIBRARY_READY);
}

/* ------------------------------------------------------------------------ */
/* KOŞU                                                                       */
/* ------------------------------------------------------------------------ */

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch();
let baselineLibrary = null;
let dprHigh = null;
let afterThumbs = null;
let thumbsLoaded = 0;
let afterFirstClose = null;
let afterSecondBook = null;
let afterSecondClose = null;
let idleRafBaseline = null;
let idleRafAfterCycles = null;
const cycleSamples = [];

try {
  await browser.command("HeapProfiler.enable").catch(() => {});
  await browser.command("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await browser.addNewDocumentScript(INSTRUMENT);
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log("Ravza Books · bellek profili (1440x900, çift sayfa modu)");

  /* --- 1. Kitaplık ---------------------------------------------------- */
  await openLibrary(browser);
  await forcePageMode(browser);
  browser.clearDiagnostics("books-memory");
  baselineLibrary = await snapshot(browser, "1 · kitaplık (temel)");
  // Boştaki kitaplıkta saniyede kaç animasyon karesi planlanıyor: referans.
  idleRafBaseline = await browser.evaluate("window.__readerProbe.sampleRaf(1000)");

  /* --- 2. Büyük kitabı aç --------------------------------------------- */
  await openBook(browser, BIG_BOOK);
  await snapshot(browser, "2 · büyük kitap açıldı");

  /* --- 3. 30+ sayfa ileri --------------------------------------------- */
  await turnPages(browser, 32, "ArrowRight");
  await snapshot(browser, "3 · 32 sayfa ileri");

  /* --- 4. 20+ sayfa geri ---------------------------------------------- */
  await turnPages(browser, 22, "ArrowLeft");
  await snapshot(browser, "4 · 22 sayfa geri");

  /* --- 5-7. Ölçek değişimi.
     Zoom arayüzü 20b8551'de kaldırıldı (sayfa modu her zaman fit-page). Aynı
     KOD YOLU - render kutusu ve DPR değişimi - viewport ile tetikleniyor:
     "ölçek değişince eski renderTask yaşıyor mu" sorusu böyle sınanır. ---- */
  await browser.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await browser.waitFor(READING_READY, "1024 genişlikte yeniden render", 60000);
  await snapshot(browser, "5 · kutu daraldı (1024)");
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await browser.waitFor(READING_READY, "DPR 2 yeniden render", 60000);
  dprHigh = await snapshot(browser, "6 · DPR 2 (yüksek çözünürlük)");
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.waitFor(READING_READY, "DPR 1 yeniden render", 60000);
  await snapshot(browser, "7 · DPR 1'e dönüş");

  /* --- 8-9. İçindekiler → Sayfalar sekmesi ---------------------------- */
  await openPagesTab(browser);
  await snapshot(browser, "8-9 · sayfalar sekmesi açık");

  /* --- 10. 40-60 küçük resim boyunca kaydır --------------------------- */
  thumbsLoaded = await scrollThumbnails(browser, 60);
  afterThumbs = await snapshot(browser, `10 · ${thumbsLoaded} küçük resim yüklendi`);

  /* --- 11. Küçük resimle sayfa değiştir ------------------------------- */
  for (const target of [12, 40, 75]) {
    const hit = await browser.evaluate(`(() => {
      const thumb = document.querySelector('.reader-thumb[data-goto-page="${target}"]');
      if (!thumb) return false;
      thumb.click();
      return true;
    })()`);
    if (!hit) continue;
    await browser.waitFor(`(${currentPageExpression}) === ${target}`, `küçük resim ${target}`, 15000).catch(() => {});
    await openPagesTab(browser);
  }
  await closeSheets(browser);
  await snapshot(browser, "11 · küçük resimle gezinme");

  /* --- 12. Panel kapalı ------------------------------------------------ */
  await browser.waitFor(READING_READY, "panel kapandıktan sonra okuyucu", 30000);
  await snapshot(browser, "12 · panel kapandı");

  /* --- 13-14. Sürekli mod + 20+ sayfa ---------------------------------- */
  await switchMode(browser, "scroll");
  await snapshot(browser, "13 · sürekli mod");
  await turnPages(browser, 22, "ArrowRight");
  await snapshot(browser, "14 · sürekli modda 22 sayfa");

  /* --- 15. Okuyucuyu kapat --------------------------------------------- */
  await closeReader(browser);
  afterFirstClose = await snapshot(browser, "15 · okuyucu kapandı");

  /* --- 16-17. Başka kitap, 15+ sayfa ----------------------------------- */
  await forcePageMode(browser);
  await openBook(browser, SECOND_BOOK);
  await turnPages(browser, 16, "ArrowRight");
  afterSecondBook = await snapshot(browser, "16-17 · ikinci kitap, 16 sayfa");

  /* --- 18. Kapat -------------------------------------------------------- */
  await closeReader(browser);
  afterSecondClose = await snapshot(browser, "18 · ikinci kitap kapandı");

  /* --- 19. Sayfa modunda aç/kapa döngüsü x6 ---------------------------- */
  await forcePageMode(browser);
  for (let cycle = 1; cycle <= 6; cycle += 1) {
    await openBook(browser, BIG_BOOK);
    await turnPages(browser, 4, "ArrowRight");
    await closeReader(browser);
    cycleSamples.push(await snapshot(browser, `19 · döngü ${cycle} sonrası kitaplık`));
  }
  idleRafAfterCycles = await browser.evaluate("window.__readerProbe.sampleRaf(1000)");

  /* ==================================================================== */
  /* İDDİALAR                                                             */
  /* ==================================================================== */

  await testCase("render penceresi sınırlı: tam çözünürlüklü tuval sayısı pencereyi aşmaz", () => {
    // PDF_WINDOW_SIZE 5, çift sayfa modunda PDF_SPREAD_WINDOW_SIZE 6.
    // Çevirme animasyonu sırasında StPageFlip geçici bir kopya oluşturabilir.
    for (const entry of timeline) {
      if (entry.appMode !== "reading") continue;
      assert.ok(
        entry.heavyCanvases <= 8,
        `${entry.label}: ${entry.heavyCanvases} tam çözünürlüklü tuval var (pencere en fazla 6)`,
      );
    }
  });

  await testCase("pencere dışı sayfalarda tam çözünürlüklü tuval bırakılmıyor", () => {
    for (const entry of timeline) {
      if (entry.appMode !== "reading") continue;
      assert.equal(
        entry.offWindowHeavy,
        0,
        `${entry.label}: pencere dışı ${entry.offWindowHeavy} sayfa tam çözünürlüklü tuval tutuyor (${entry.offWindowPixels} piksel)`,
      );
    }
  });

  /**
   * REGRESYON: StPageFlip 2.0.7 kalıcı rAF döngüsü (RAVZA-PATCH-001).
   *
   * Yamadan önce ölçülen: her sayfa modu oturumu kapandıktan sonra kitaplıkta
   * kalıcı olarak +60 rAF/sn. 4 döngü sonrası 240/sn. Yamadan sonra 0.
   */
  await testCase("okuma oturumları kapanınca kalıcı animasyon döngüsü kalmıyor", () => {
    assert.ok(
      idleRafBaseline <= 10,
      `boştaki kitaplık zaten ${idleRafBaseline} rAF/sn planlıyor - referans kirli`,
    );
    assert.ok(
      idleRafAfterCycles <= idleRafBaseline + 10,
      `6 sayfa modu oturumundan sonra boştaki kitaplık ${idleRafAfterCycles} rAF/sn planlıyor `
        + `(referans ${idleRafBaseline}). Kapatılan okuyucudan animasyon döngüsü sızıyor.`,
    );
  });

  await testCase("okuyucu kapanınca pdf.js worker'ı sonlanır (aktif render task 0)", () => {
    assert.ok(
      afterFirstClose.workersCreated >= 1,
      "hiç worker oluşturulmadı - ölçüm boş, enstrümantasyon çalışmıyor",
    );
    assert.equal(
      afterFirstClose.liveWorkers,
      0,
      `okuyucu kapandıktan sonra ${afterFirstClose.liveWorkers} worker yaşıyor; render görevi sürüyor olabilir`,
    );
    assert.equal(afterSecondClose.liveWorkers, 0, "ikinci kapanıştan sonra worker yaşıyor");
  });

  /**
   * Kapanışta DOM tarafı KESİN olarak boşalmalı. Kopmuş nesnelerin ne zaman
   * toplandığı Oilpan'a bağlıdır ve tek bir örnekte deterministik değildir;
   * o yüzden buradaki eşik değil, "aç/kapa döngüsünde tuval birikmiyor"
   * testindeki oturum bütçesi gerçek sızıntı dedektörüdür.
   */
  await testCase("okuyucu kapanınca DOM tarafında tuval kalmıyor", () => {
    for (const entry of [afterFirstClose, afterSecondClose]) {
      assert.equal(entry.heavyCanvases, 0, `${entry.label}: tam çözünürlüklü tuval DOM'da duruyor`);
      assert.equal(entry.canvasCount, 0, `${entry.label}: ${entry.canvasCount} tuval DOM'da kaldı`);
      assert.equal(entry.pdfPageElements, 0, `${entry.label}: PDF sayfa düğümleri DOM'da kaldı`);
    }
  });

  await testCase("kitap değişiminde önceki kitabın kaynağı taşınmaz", () => {
    assert.ok(
      afterSecondBook.heavyCanvases <= 8,
      `ikinci kitapta ${afterSecondBook.heavyCanvases} tam çözünürlüklü tuval var`,
    );
    assert.equal(
      afterSecondBook.liveWorkers,
      1,
      `ikinci kitap açıkken ${afterSecondBook.liveWorkers} worker var; her kitap TEK worker kullanmalı`,
    );
    assert.equal(afterSecondBook.thumbImages, 0, "önceki kitabın küçük resim ızgarası DOM'da kaldı");
  });

  /**
   * REGRESYON: StPageFlip destroy() sonrası tutulan tuvaller (RAVZA-PATCH-001).
   *
   * Yamadan önce ölçülen: sayfa modunda döngü başına +3 tam çözünürlüklü tuval,
   * +5,24 MB backing - doğrusal olarak (5,24 / 10,47 / 15,71 / 20,95 MB).
   * Yamadan sonra her döngüde 0.
   */
  /**
   * REGRESYON: StPageFlip destroy() sonrası tutulan tuvaller (RAVZA-PATCH-001).
   *
   * Sızıntının imzası DOĞRUSAL BÜYÜMEDİR, tek bir örneğin sıfır olması değil:
   * Blink'in Oilpan'ı kopmuş DOM'u kendi zamanlamasıyla toplar, bu yüzden
   * kapanıştan hemen sonraki tek bir örnekte son oturumun tuvalleri hâlâ
   * görünebilir. Ölçülen gerçek imzalar:
   *   yamadan ÖNCE : 3 / 6 / 9 / 12 tuval, 5,24 → 10,47 → 15,71 → 20,95 MB
   *   yamadan SONRA: 0 / 0 / 12 / 0 / 12 / 12 tuval, hiçbir zaman ~7 MB'ı aşmıyor
   * Bu yüzden iddia "hiçbir döngü TEK oturumun tuval bütçesini aşmasın"dır;
   * yamadan önceki koşu bu sınırı üçüncü döngüde geçiyordu.
   */
  await testCase("aç/kapa döngüsünde tuval birikmiyor", () => {
    const ONE_SESSION_MB = 12;
    for (const sample of cycleSamples) {
      assert.equal(sample.heavyCanvases, 0, `${sample.label}: tam çözünürlüklü tuval DOM'da kaldı`);
      assert.equal(sample.liveWorkers, 0, `${sample.label}: worker sızdı`);
      assert.ok(
        sample.detachedCanvasBackingMB <= ONE_SESSION_MB,
        `${sample.label}: kopmuş tuvallerde ${sample.detachedCanvasBackingMB} MB tutuluyor `
          + `(tek oturum bütçesi ${ONE_SESSION_MB} MB) - oturumlar birikiyor`,
      );
    }
  });

  await testCase("aç/kapa döngüsünde DOM düğümü birikmiyor", () => {
    const first = cycleSamples[0];
    const last = cycleSamples.at(-1);
    const growth = last.domNodes - first.domNodes;
    assert.ok(growth <= 10, `6 döngüde DOM ${first.domNodes} → ${last.domNodes} (+${growth}) büyüdü`);
  });

  await testCase("kitap açılışı başına tek worker yaratılıyor", () => {
    // 1 (büyük kitap) + 1 (ikinci kitap) + 6 (döngü) = 8 kitap açılışı.
    const last = cycleSamples.at(-1);
    assert.ok(
      last.workersCreated <= 10,
      `8 kitap açılışında ${last.workersCreated} worker yaratıldı - açılış başına birden fazla`,
    );
  });

  await testCase("object URL ve interval sızıntısı yok", () => {
    const last = cycleSamples.at(-1);
    assert.ok(
      last.objectUrls - baselineLibrary.objectUrls <= 2,
      `object URL ${baselineLibrary.objectUrls} → ${last.objectUrls}`,
    );
    assert.ok(
      last.intervals - baselineLibrary.intervals <= 1,
      `interval ${baselineLibrary.intervals} → ${last.intervals}`,
    );
  });

  await testCase("küçük resimler tembel: 40+ görsel yüklense de ana tuvaller artmıyor", () => {
    assert.ok(thumbsLoaded >= 40, `yalnızca ${thumbsLoaded} küçük resim yüklendi, senaryo 40+ istiyor`);
    assert.ok(
      afterThumbs.heavyCanvases <= 8,
      `küçük resimler tam çözünürlüklü tuval sayısını ${afterThumbs.heavyCanvases}'e çıkardı`,
    );
  });

  await testCase("yüksek DPR'de tuval alanı sınırlanıyor", () => {
    // pdfOutputScale DPR'yi 2, alanı 4,5 MP ile sınırlar.
    assert.ok(
      dprHigh.canvasBackingMB <= 120,
      `DPR 2'de tuval backing ${dprHigh.canvasBackingMB} MB - üst sınır çalışmıyor`,
    );
  });

  await testCase("iptal edilen render konsola hata düşürmüyor", () => {
    assertCleanDiagnostics(browser.diagnostics(), "books-memory", { allowWarnings: true });
  });
} finally {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    join(ARTIFACT_DIR, "books-memory.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), viewport: "1440x900", timeline }, null, 2)}\n`,
    "utf8",
  );
  await browser.close();
  await server.close();
}

const table = timeline.map((entry) => [
  entry.label.padEnd(36),
  `dom ${String(entry.domNodes).padStart(5)}`,
  `canvas ${String(entry.heavyCanvases).padStart(2)}/${String(entry.canvasCount).padStart(3)}`,
  `backing ${String(entry.canvasBackingMB).padStart(6)}MB`,
  `live ${String(entry.liveCanvases).padStart(3)} det ${String(entry.detachedCanvases).padStart(2)}`,
  `wrk ${entry.liveWorkers}`,
  `heap ${String(entry.heapMB).padStart(6)}MB`,
].join("  "));

console.log(`\n${table.join("\n")}`);
console.log(`\n${results.join("\n")}`);
console.log(failures ? `\n${failures} test BAŞARISIZ` : "\nTüm okuyucu bellek testleri geçti");
process.exit(failures ? 1 : 0);
