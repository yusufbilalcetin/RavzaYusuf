/**
 * SAYFA GEÇİŞİ PERFORMANSI.
 *
 * Ölçtüğü tek şey: kullanıcı sayfa çevirdiğinde HEDEF SAYFA HAZIR MI.
 *
 * "Hazır" = o sayfanın tuvali doğru renderKey ile çizilmiş ve `is-rendered`.
 * Navigasyon anında hazırsa bekleme SIFIRDIR; değilse PDF.js render'ı
 * beklenir ve geçen süre `readyWaitMs` olarak yazılır. Yani ölçüm animasyon
 * süresinden bağımsızdır - PageFlip'in flippingTime'ı sonuca karışmaz ve
 * onu kısaltarak sonuç "iyileştirilemez".
 *
 * Sayaçlar sayfanın kendi `window.__readerPerf` nesnesinden okunur:
 * renderStarts (gerçek PDF.js render), cacheHits, inflightJoins (önlenen
 * duplicate), canvasResizeSkips.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ROOT,
  ThemeTestBrowser,
  assertCleanDiagnostics,
  delay,
  ensureTestServer,
} from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-page-turn-performance");
const artifactDir = join(ROOT, "test-artifacts", "reader-page-turn-performance");
await mkdir(artifactDir, { recursive: true });

const LABEL = process.env.READER_PERF_LABEL || "current";
const report = { label: LABEL, generatedAt: new Date().toISOString(), scenarios: {} };

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
};
const median = (values) => percentile(values, 50);
const round = (value) => Math.round(value * 10) / 10;

async function openBook(viewport, { bookId = "kucuk-prens", page = 6, mode = "page", theme = "light" } = {}) {
  const mobile = viewport.mobile ?? viewport.width < 768;
  await browser.setViewport({
    width: viewport.width,
    height: viewport.height,
    mobile,
    deviceScaleFactor: viewport.deviceScaleFactor ?? (mobile ? 3 : 1),
  });
  await browser.navigate("/?page=ravza-books&readerperf=1", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:${JSON.stringify(mode)},pageSound:false,theme:${JSON.stringify(theme)}}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({${JSON.stringify(bookId)}:{page:${page}}}));
    location.reload();
  `);
  await browser.waitFor("document.querySelector('.library-book-card')", "library reload", 30000);
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id=${JSON.stringify(bookId)}]').click()`);
  await browser.waitFor(
    "document.querySelector('.pdf-page.is-rendered') && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
    `${bookId} reader`,
    60000,
  );
}

/** Sayfanın gerçekten çizili olup olmadığı - DOM'un kendi gerçeği. */
const readyExpr = (pageNumber) => `(() => {
  const el = document.querySelector('.pdf-page[data-pdf-page="${pageNumber}"]');
  if (!el) return false;
  const canvas = el.querySelector('canvas');
  return Boolean(el.classList.contains('is-rendered') && canvas && canvas.dataset.renderKey && canvas.width > 1);
})()`;

const isReady = (pageNumber) => browser.evaluate(readyExpr(pageNumber)).then(Boolean);
const currentIndex = () => browser.evaluate(
  "Number(document.getElementById('ravzabooks')?.dataset.currentPage ?? document.querySelector('.rdr-page-current')?.textContent ?? 0)",
);
const perfCounters = () => browser.evaluate("JSON.stringify(window.__readerPerf || {})").then((raw) => JSON.parse(raw || "{}"));

/** Görünen sayfa numarası: ilerleme göstergesi kaynaktır ("6 / 166"). */
async function visiblePage() {
  const raw = await browser.evaluate("document.getElementById('rdr-progress-label')?.textContent || ''");
  const match = String(raw || "").match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function totalPages() {
  const raw = await browser.evaluate("document.getElementById('rdr-progress-label')?.textContent || ''");
  const match = String(raw || "").match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number(match[2]) : 0;
}

/**
 * Tek bir sayfa çevirme ölçümü.
 * prefetched: navigasyon ANINDA hedef hazır mıydı.
 * readyWaitMs: hazır değilse hazır olana kadar geçen gerçek süre.
 */
async function turn(targetPage, key, { settleMs = 1400 } = {}) {
  const prefetched = await isReady(targetPage);
  const started = Date.now();
  await browser.key(key);
  let readyWaitMs = 0;
  if (!prefetched) {
    await browser.waitFor(readyExpr(targetPage), `page ${targetPage} ready`, 20000);
    readyWaitMs = Date.now() - started;
  }
  await delay(settleMs);
  return { targetPage, prefetched, readyWaitMs };
}

async function runSequence(name, viewport, options = {}) {
  const { bookId = "kucuk-prens", startPage = 6, forward = 20, backward = 10, mode = "page" } = options;
  await openBook(viewport, { bookId, page: startPage, mode });
  // İlk yerleşme: ölçüm "soğuk açılış"ı değil sayfa geçişini hedefliyor.
  await delay(2000);
  await browser.evaluate("Object.assign(window.__readerPerf, {renderStarts:0,cacheHits:0,alreadyRendered:0,inflightJoins:0,canvasResizes:0,canvasResizeSkips:0,peakInflight:0})");

  const spread = await browser.evaluate("!document.getElementById('reader-inner')?.dataset.portrait && window.innerWidth >= 768");
  const step = spread ? 2 : 1;
  const total = await totalPages();

  let page = await visiblePage();
  const forwardTurns = [];
  for (let i = 0; i < forward; i += 1) {
    const target = page + step;
    // Arka kapağa çarpma: ölçüm yalnız gerçek sayfa geçişlerini sayar.
    if (target > total) break;
    const result = await turn(target, "ArrowRight");
    forwardTurns.push(result);
    page = await visiblePage();
  }
  const backwardTurns = [];
  for (let i = 0; i < backward; i += 1) {
    const target = page - step;
    if (target < 1) break;
    const result = await turn(target, "ArrowLeft");
    backwardTurns.push(result);
    page = await visiblePage();
  }

  const counters = await perfCounters();
  const canvases = await browser.evaluate("document.querySelectorAll('.pdf-page canvas').length");
  const liveCanvases = await browser.evaluate("[...document.querySelectorAll('.pdf-page canvas')].filter(c => c.width > 1).length");
  const heap = await browser.evaluate("Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)");

  const forwardWaits = forwardTurns.map((t) => t.readyWaitMs);
  const backwardWaits = backwardTurns.map((t) => t.readyWaitMs);
  const hitRate = forwardTurns.length
    ? (forwardTurns.filter((t) => t.prefetched).length / forwardTurns.length) * 100
    : 0;
  const backHitRate = backwardTurns.length
    ? (backwardTurns.filter((t) => t.prefetched).length / backwardTurns.length) * 100
    : 0;

  const scenario = {
    viewport: `${viewport.width}x${viewport.height}`,
    bookId,
    mode,
    spread,
    forwardTurns: forwardTurns.length,
    backwardTurns: backwardTurns.length,
    forwardHitRatePct: round(hitRate),
    backwardHitRatePct: round(backHitRate),
    forwardMedianWaitMs: round(median(forwardWaits)),
    forwardP95WaitMs: round(percentile(forwardWaits, 95)),
    forwardMaxWaitMs: Math.max(0, ...forwardWaits),
    backwardMedianWaitMs: round(median(backwardWaits)),
    backwardMaxWaitMs: Math.max(0, ...backwardWaits),
    renderStarts: counters.renderStarts ?? 0,
    cacheHits: counters.cacheHits ?? 0,
    inflightJoins: counters.inflightJoins ?? 0,
    canvasResizeSkips: counters.canvasResizeSkips ?? 0,
    peakInflight: counters.peakInflight ?? 0,
    canvases,
    liveCanvases,
    heapMiB: heap,
  };
  report.scenarios[name] = scenario;
  return scenario;
}

const results = [];
try {
  /* ---- 1. MOBİL SIRALI OKUMA (ana senaryo) ---- */
  const mobile440 = await runSequence("mobile-440x956", { width: 440, height: 956 });
  results.push({ scenario: "mobile 440x956", ...pick(mobile440) });

  /* ---- 2. MOBİL 390 ---- */
  const mobile390 = await runSequence("mobile-390x844", { width: 390, height: 844 }, { forward: 12, backward: 6 });
  results.push({ scenario: "mobile 390x844", ...pick(mobile390) });

  /* ---- 3. MASAÜSTÜ SPREAD ---- */
  const desktop = await runSequence("desktop-1440x900", { width: 1440, height: 900 }, { forward: 12, backward: 6 });
  results.push({ scenario: "desktop 1440x900", ...pick(desktop) });

  /* ---- 4. İKİNCİ KİTAP: optimizasyon kitaba özel olmamalı.
     Ateşten Gömlek en ağır PDF (6.9 MB) - kolay kitapla ölçüm şişirilmez. ---- */
  const second = await runSequence("second-book-440x956", { width: 440, height: 956 }, {
    bookId: "atesten-gomlek", startPage: 20, forward: 12, backward: 6,
  });
  results.push({ scenario: "atesten-gomlek 440x956", ...pick(second) });

  console.table(results);

  /* ---- 5. İLK ÇEVİRME: kullanıcı açılıştan 100ms sonra basarsa ---- */
  await openBook({ width: 440, height: 956 }, { page: 6 });
  await delay(100);
  const fastUserPrefetched = await isReady(7);
  const fastStart = Date.now();
  await browser.key("ArrowRight");
  await browser.waitFor(readyExpr(7), "fast-user first turn", 20000);
  const fastUserMs = fastUserPrefetched ? 0 : Date.now() - fastStart;
  await delay(800);
  const fastUserPage = await visiblePage();

  /* ---- 6. YAVAŞ KULLANICI: 2sn sonra basarsa hedef kesin hazır olmalı ---- */
  await openBook({ width: 440, height: 956 }, { page: 6 });
  await delay(2000);
  const slowPrefetched = await isReady(7);

  report.firstTurn = { fastUserMs, fastUserPrefetched, fastUserPage, slowUserPrefetched: slowPrefetched };
  console.log(`first turn: fast user prefetched=${fastUserPrefetched} wait=${fastUserMs}ms -> page ${fastUserPage} · slow user prefetched=${slowPrefetched}`);

  /* ---- 7. HIZLI ARDIŞIK ÇEVİRME: kuyruk patlamamalı, sayfa doğru olmalı ---- */
  await openBook({ width: 440, height: 956 }, { page: 6 });
  await delay(1800);
  await browser.evaluate("Object.assign(window.__readerPerf, {renderStarts:0,peakInflight:0,inflightJoins:0})");
  const rapidStart = await visiblePage();
  for (let i = 0; i < 5; i += 1) {
    await browser.key("ArrowRight");
    await delay(120);
  }
  await delay(3000);
  const rapidPage = await visiblePage();
  const rapidCounters = await perfCounters();
  report.rapid = {
    from: rapidStart,
    to: rapidPage,
    renderStarts: rapidCounters.renderStarts,
    peakInflight: rapidCounters.peakInflight,
  };
  console.log(`rapid next x5: ${rapidStart} -> ${rapidPage} · renderStarts=${rapidCounters.renderStarts} peakInflight=${rapidCounters.peakInflight}`);
  assert.ok(rapidPage > rapidStart, `Hızlı çevirmede sayfa ilerlemedi: ${rapidStart} -> ${rapidPage}`);

  /* ---- 8. YÖN DEĞİŞİMİ: her seferinde doğru sayfa ---- */
  await openBook({ width: 440, height: 956 }, { page: 10 });
  await delay(1800);
  const directionStart = await visiblePage();
  const directionSteps = [];
  for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowRight", "ArrowLeft"]) {
    await browser.key(key);
    await delay(1200);
    directionSteps.push(await visiblePage());
  }
  const expected = [directionStart + 1, directionStart + 2, directionStart + 1, directionStart + 2, directionStart + 1];
  report.directionChange = { start: directionStart, observed: directionSteps, expected };
  console.log(`direction change: start=${directionStart} observed=${directionSteps.join(",")} expected=${expected.join(",")}`);
  assert.deepEqual(directionSteps, expected, "Yön değişiminde sayfa numarası sapmış");

  /* ---- 9. GERİ DÖNÜŞTE AYNI SAYFA YENİDEN RENDER OLMAMALI (5 -> 6 -> 5) ----
     Ölçüt SAYFA 5'in kendisidir. Genel renderStarts sayacı burada yanıltır:
     ileri gidince pencereye YENİ bir sayfa (8) girer ve onun render'ı meşrudur.
     Bu yüzden marks'tan yalnız 5 numaralı sayfanın render'ı sayılır. */
  await openBook({ width: 440, height: 956 }, { page: 5 });
  await delay(2000);
  await browser.evaluate("window.__readerPerf.marks.length = 0; Object.assign(window.__readerPerf, {renderStarts:0,cacheHits:0,alreadyRendered:0})");
  await browser.key("ArrowRight");
  await delay(1600);
  await browser.key("ArrowLeft");
  await delay(1600);
  const backCounters = await perfCounters();
  const page5Renders = (backCounters.marks || [])
    .filter((m) => m.name === "render:start" && m.detail === 5).length;
  report.backReuse = { ...backCounters, marks: undefined, page5Renders };
  console.log(`back reuse 5->6->5: page5Renders=${page5Renders} totalRenderStarts=${backCounters.renderStarts} cacheHits=${backCounters.cacheHits} alreadyRendered=${backCounters.alreadyRendered}`);

  /* ---- 10. 50 ÇEVİRME SONRASI BELLEK SINIRI ---- */
  await openBook({ width: 440, height: 956 }, { page: 4 });
  await delay(1800);
  for (let i = 0; i < 50; i += 1) {
    await browser.key("ArrowRight");
    await delay(260);
  }
  await delay(2500);
  const soak = {
    page: await visiblePage(),
    liveCanvases: await browser.evaluate("[...document.querySelectorAll('.pdf-page canvas')].filter(c => c.width > 1).length"),
    heapMiB: await browser.evaluate("Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)"),
    blank: await browser.evaluate("[...document.querySelectorAll('.pdf-page')].filter(e => e.getBoundingClientRect().width > 1 && !e.classList.contains('is-rendered')).length"),
    errors: await browser.evaluate("document.querySelectorAll('.pdf-page.has-render-error').length"),
  };
  report.soak = soak;
  console.log(`soak 50 next: page=${soak.page} liveCanvases=${soak.liveCanvases} heap=${soak.heapMiB}MiB blank=${soak.blank} errors=${soak.errors}`);

  /* ================= ASSERT ================= */
  assert.ok(
    mobile440.forwardHitRatePct >= 95,
    `Mobil sıralı okumada ön yükleme isabeti %95 altında: %${mobile440.forwardHitRatePct}`,
  );
  assert.ok(
    desktop.forwardHitRatePct >= 95,
    `Masaüstü spread ön yükleme isabeti %95 altında: %${desktop.forwardHitRatePct}`,
  );
  assert.ok(
    second.forwardHitRatePct >= 95,
    `İkinci kitapta ön yükleme isabeti %95 altında: %${second.forwardHitRatePct}`,
  );
  assert.ok(
    mobile440.backwardHitRatePct >= 95,
    `Geri dönüşte cache isabeti düşük: %${mobile440.backwardHitRatePct}`,
  );
  assert.equal(mobile440.forwardP95WaitMs, 0, `p95 bekleme sıfır değil: ${mobile440.forwardP95WaitMs}ms`);
  // Aynı sayfa için aynı anda birden fazla PDF render task'i açılmamalı.
  assert.ok(
    (mobile440.peakInflight ?? 0) <= 2,
    `Aynı anda çok fazla PDF render task'i: ${mobile440.peakInflight}`,
  );
  assert.equal(page5Renders, 0, `Geri dönülen sayfa yeniden render edildi: ${page5Renders} kez`);
  assert.equal(soak.blank, 0, "50 çevirme sonrası boş görünür sayfa var");
  assert.equal(soak.errors, 0, "50 çevirme sonrası render hatası var");
  assert.ok(soak.liveCanvases <= 8, `Canlı tuval sayısı sınırsız büyümüş: ${soak.liveCanvases}`);
  assert.equal(fastUserPage > 6, true, "Hızlı kullanıcı ilk çevirmede ilerleyemedi");
  // Açılıştan 100ms sonra basan kullanıcı da beklememeli: acil komşu ön
  // yüklemesi görünür sayfa biter bitmez başlar (ölçüm öncesi 219-343ms).
  assert.ok(fastUserPrefetched, "Açılış sonrası ilk 'sonraki' sayfası hazır değildi");
  assert.ok(slowPrefetched, "2sn bekleyen kullanıcı için sonraki sayfa hazır değildi");

  await writeFile(join(artifactDir, `${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);
  assertCleanDiagnostics(browser, "reader page turn performance");
  console.log(`Rapor: ${join(artifactDir, `${LABEL}.json`)}`);
  console.log("PASS reader page turn performance: prefetch hit >=95%, no duplicate renders, bounded canvases, correct pages");
} finally {
  await browser.close();
  await server.close();
}

function pick(scenario) {
  return {
    hit: `%${scenario.forwardHitRatePct}`,
    back: `%${scenario.backwardHitRatePct}`,
    medianWait: `${scenario.forwardMedianWaitMs}ms`,
    p95: `${scenario.forwardP95WaitMs}ms`,
    max: `${scenario.forwardMaxWaitMs}ms`,
    renders: scenario.renderStarts,
    cache: scenario.cacheHits,
    live: scenario.liveCanvases,
    heap: `${scenario.heapMiB}MiB`,
  };
}
