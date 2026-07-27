/**
 * Ravza Books okuyucu performans testi.
 *
 * Gerçek Chrome'da (headless) kitaplık → Küçük Prens → 20 ileri → 10 geri →
 * hızlı swipe → mobil → orientation → kitaplığa dön → tekrar aç akışını koşar ve
 * kare bloklayan uzun görevleri, canlı canvas sayısını, tekrar render sayısını,
 * sayfa sırasını ve heap büyümesini ölçer.
 *
 * Ölçüm sonuçları test-artifacts/ravza-books-performance.json dosyasına yazılır;
 * RAVZA_PERF_BASELINE=1 ile çalıştırıldığında dosya "baseline" olarak işaretlenir.
 *
 * Repo'daki diğer testlerle aynı ham CDP desenini kullanır (Playwright gerekmez).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PORT = 8788;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = 9388;
const BOOK_ID = 'kucuk-prens';
const ARTIFACT_DIR = join(ROOT, 'test-artifacts');
const ARTIFACT_FILE = join(ARTIFACT_DIR, 'ravza-books-performance.json');
const IS_BASELINE = process.env.RAVZA_PERF_BASELINE === '1';
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const CHROME = CHROME_CANDIDATES.find(path => existsSync(path));
const PROFILE = resolve(tmpdir(), `ravza-books-perf-${Date.now()}`);

/** Kabul sınırları — 26. maddedeki hedef değerler. */
const LIMITS = {
  desktopCanvases: 10,
  mobileCanvases: 7,
  longTaskMs: 50,
  /** Dokunulan sayfa başına tamamlanmış PDF render sayısı (dizi bazı sayfaları iki kez ziyaret eder). */
  completedRendersPerPage: 1.6,
  /** 30 geçiş sonrası heap büyümesi bu oranı aşmamalı. */
  heapGrowthRatio: 1.6,
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
};

assert.ok(CHROME, 'Chromium tabanlı tarayıcı bulunamadı');
assert.ok(PROFILE.startsWith(`${resolve(tmpdir())}${sep}`), 'Geçici profil güvenli dizinde değil');

const missingLocalAssets = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, BASE_URL).pathname);
    let filePath = resolve(ROOT, `.${pathname}`);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) throw new Error('Geçersiz yol');
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream' });
    response.end(body);
  } catch {
    missingLocalAssets.push(request.url);
    response.writeHead(404).end('Not found');
  }
});

const delay = ms => new Promise(done => setTimeout(done, ms));
await new Promise(done => server.listen(PORT, '127.0.0.1', done));

const browser = spawn(CHROME, [
  '--headless=new',
  '--no-first-run',
  '--disable-extensions',
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--js-flags=--expose-gc',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: 'ignore' });

async function findPageTarget() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(response => response.json());
      const page = targets.find(target => target.type === 'page');
      if (page) return page;
    } catch { /* tarayıcı açılıyor */ }
    await delay(100);
  }
  throw new Error('Chrome test hedefi açılamadı');
}

const target = await findPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => {
  socket.addEventListener('open', done, { once: true });
  socket.addEventListener('error', fail, { once: true });
});

let commandId = 0;
const pendingCommands = new Map();
const consoleIssues = [];
const failedRequests = [];
const requestUrls = new Map();

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    consoleIssues.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text || 'JavaScript hatası');
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleIssues.push(message.params.entry.text);
  }
  if (message.method === 'Network.requestWillBeSent') {
    requestUrls.set(message.params.requestId, message.params.request.url);
  }
  if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
    failedRequests.push(`${message.params.errorText}: ${requestUrls.get(message.params.requestId) || 'bilinmeyen istek'}`);
  }
  if (!message.id || !pendingCommands.has(message.id)) return;
  const handlers = pendingCommands.get(message.id);
  pendingCommands.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((done, fail) => pendingCommands.set(id, { resolve: done, reject: fail }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(60);
  }
  throw new Error(`Zaman aşımı: ${expression}\nKonsol: ${consoleIssues.join(' | ')}`);
}

async function setViewport(width, height) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 768,
    screenWidth: width,
    screenHeight: height,
  });
  await delay(240);
}

async function pressKey(key, code) {
  const base = { key, code, windowsVirtualKeyCode: code === 'ArrowRight' ? 39 : 37, nativeVirtualKeyCode: code === 'ArrowRight' ? 39 : 37 };
  await command('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/**
 * Sayfa içi ölçüm: uzun görevler ve canvas render başlangıçları.
 * Ürün kodunda hiçbir iz bırakmaz — yalnızca test oturumuna enjekte edilir.
 */
const INSTRUMENTATION = `
  (() => {
    const perf = {
      longTasks: [],
      renderStarts: new Map(),
      startedAt: performance.now(),
    };
    window.__ravzaPerf = perf;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) perf.longTasks.push(Math.round(entry.duration));
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* longtask desteklenmiyor */ }

    // Başlatılan boyamalar (iptal edilenler dâhil). Bir sayfanın tuvaline
    // getContext çağrılması, o sayfa için boyama başlatıldığı anlamına gelir.
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const page = this.closest?.('.pdf-page')?.dataset?.pdfPage;
      if (page) {
        perf.renderStarts.set(page, (perf.renderStarts.get(page) || 0) + 1);
        this.dataset.perfPage = page;
      }
      return originalGetContext.apply(this, args);
    };

    // Tamamlanan boyamalar: data-render-key yalnızca render veya cache boyaması
    // başarıyla bittiğinde yazılır. Böylece "başlatılan" ile "tamamlanan"
    // ayrışır; aradaki fark iptal edilmiş (boşa giden) render sayısıdır.
    perf.completions = new Map();
    perf.distinctKeys = new Map();
    const observeCompletions = () => {
      new MutationObserver(records => {
        for (const record of records) {
          const canvas = record.target;
          const page = canvas.dataset?.perfPage;
          const key = canvas.dataset?.renderKey;
          if (!page || !key) continue;
          perf.completions.set(page, (perf.completions.get(page) || 0) + 1);
          const seen = perf.distinctKeys.get(page) || new Set();
          seen.add(key);
          perf.distinctKeys.set(page, seen);
        }
      }).observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-render-key'],
      });
    };
    if (document.documentElement) observeCompletions();
    else document.addEventListener('readystatechange', observeCompletions, { once: true });

    perf.snapshot = () => ({
      completions: [...perf.completions.entries()].map(([page, count]) => [Number(page), count]),
      distinctKeys: [...perf.distinctKeys.entries()].map(([page, keys]) => [Number(page), keys.size]),
      longTasks: perf.longTasks.slice(),
      renderStarts: [...perf.renderStarts.entries()].map(([page, count]) => [Number(page), count]),
    });
    perf.reset = () => {
      perf.longTasks.length = 0;
      perf.renderStarts.clear();
      perf.completions.clear();
      perf.distinctKeys.clear();
    };
  })();
`;

const readState = `(() => {
  const root = document.querySelector('#reader-inner');
  const canvases = [...document.querySelectorAll('.pdf-page canvas')];
  return {
    mode: document.querySelector('#ravzabooks')?.dataset.appMode || null,
    currentPage: Number(root?.dataset.currentPage) || 0,
    savedPage: Number(root?.dataset.savedPage) || 0,
    spread: root?.dataset.spread || null,
    liveCanvases: canvases.filter(canvas => canvas.width > 1 && canvas.height > 1).length,
    renderedPages: document.querySelectorAll('.pdf-page.is-rendered').length,
    flipbooks: document.querySelectorAll('#rdr-flipbook').length,
    pageFlipRoots: document.querySelectorAll('.stf__parent').length,
  };
})()`;

async function heapUsed() {
  await evaluate('typeof gc === "function" ? gc() : undefined');
  await delay(120);
  const metrics = await command('Performance.getMetrics');
  return metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value || 0;
}

/** Bir sayfa geçişini tetikler ve sayfa numarası değişene kadar geçen süreyi ölçer. */
async function flipAndMeasure(direction) {
  const before = await evaluate('Number(document.querySelector("#reader-inner")?.dataset.currentPage) || 0');
  const startedAt = Date.now();
  await pressKey(direction === 'next' ? 'ArrowRight' : 'ArrowLeft', direction === 'next' ? 'ArrowRight' : 'ArrowLeft');
  let changed = false;
  while (Date.now() - startedAt < 6000) {
    const now = await evaluate('Number(document.querySelector("#reader-inner")?.dataset.currentPage) || 0');
    if (now !== before) {
      changed = true;
      break;
    }
    await delay(25);
  }
  return { changed, duration: Date.now() - startedAt, before };
}

const report = {
  generatedAt: new Date().toISOString(),
  kind: IS_BASELINE ? 'baseline' : 'current',
  desktop: {},
  mobile: {},
  orientation: {},
  reopen: {},
};

try {
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Log.enable');
  await command('Network.enable');
  await command('Performance.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENTATION });

  // ---------------------------------------------------------------- masaüstü
  await setViewport(1280, 800);
  await command('Page.navigate', { url: `${BASE_URL}/?page=ravza-books` });
  await waitFor(`document.querySelector('#ravzabooks[data-app-mode="library"] .library-book-card[data-book-id="${BOOK_ID}"]')`);
  await evaluate(`localStorage.removeItem('ravzaBooksProgress:${BOOK_ID}')`);

  const libraryHeap = await heapUsed();
  const openStartedAt = Date.now();
  await evaluate(`document.querySelector('.library-book-card[data-book-id="${BOOK_ID}"]').click()`);
  await waitFor('document.querySelector(\'#ravzabooks[data-app-mode="reading"] .pdf-page.is-rendered\')');
  report.desktop.openMs = Date.now() - openStartedAt;

  const opened = await evaluate(readState);
  assert.equal(opened.flipbooks, 1, 'Kitap açılışında tek flipbook olmalı');
  assert.equal(opened.pageFlipRoots, 1, 'Birden fazla PageFlip instance var');
  assert.ok(opened.liveCanvases <= LIMITS.desktopCanvases, `Açılışta canlı canvas sayısı ${opened.liveCanvases} > ${LIMITS.desktopCanvases}`);

  await evaluate('window.__ravzaPerf.reset()');
  const heapBefore = await heapUsed();

  const forward = [];
  const pageSequence = [opened.currentPage];
  for (let step = 0; step < 20; step += 1) {
    const result = await flipAndMeasure('next');
    assert.equal(result.changed, true, `${step + 1}. ileri geçiş gerçekleşmedi`);
    forward.push(result.duration);
    pageSequence.push(await evaluate('Number(document.querySelector("#reader-inner").dataset.currentPage)'));
    await delay(60);
  }

  const backward = [];
  for (let step = 0; step < 10; step += 1) {
    const result = await flipAndMeasure('prev');
    assert.equal(result.changed, true, `${step + 1}. geri geçiş gerçekleşmedi`);
    backward.push(result.duration);
    pageSequence.push(await evaluate('Number(document.querySelector("#reader-inner").dataset.currentPage)'));
    await delay(60);
  }

  // Sayfa sırası bozulmamalı: ileri giderken artan, geri gelirken azalan.
  const forwardPages = pageSequence.slice(0, 21);
  const backwardPages = pageSequence.slice(20);
  assert.ok(
    forwardPages.every((page, index) => index === 0 || page >= forwardPages[index - 1]),
    `İleri geçişlerde sayfa sırası bozuldu: ${forwardPages.join(',')}`,
  );
  assert.ok(
    backwardPages.every((page, index) => index === 0 || page <= backwardPages[index - 1]),
    `Geri geçişlerde sayfa sırası bozuldu: ${backwardPages.join(',')}`,
  );

  const afterFlips = await evaluate(readState);
  const perfAfterFlips = await evaluate('window.__ravzaPerf.snapshot()');
  const heapAfter = await heapUsed();

  const visitedPages = new Set(pageSequence).size;
  const paintStarts = perfAfterFlips.renderStarts.reduce((sum, [, count]) => sum + count, 0);
  const completedPaints = perfAfterFlips.completions.reduce((sum, [, count]) => sum + count, 0);
  const abandonedPaints = Math.max(0, paintStarts - completedPaints);
  const touchedPages = perfAfterFlips.renderStarts.length;
  /** Sayfa dizisindeki her ziyaret bir "render fırsatı"dır; ideal olan her fırsata en fazla bir tamamlanmış render. */
  const pageVisits = pageSequence.length;
  const worstPage = perfAfterFlips.renderStarts.slice().sort((a, b) => b[1] - a[1])[0] || [0, 0];
  const longTasks = perfAfterFlips.longTasks.filter(duration => duration >= LIMITS.longTaskMs);

  report.desktop = {
    ...report.desktop,
    flipCount: forward.length + backward.length,
    forwardMedianMs: median(forward),
    forwardMaxMs: Math.max(...forward),
    backwardMedianMs: median(backward),
    backwardMaxMs: Math.max(...backward),
    longTaskCount: longTasks.length,
    longTaskMaxMs: longTasks.length ? Math.max(...longTasks) : 0,
    longTaskTotalMs: longTasks.reduce((sum, value) => sum + value, 0),
    visitedPages,
    touchedPages,
    pageVisits,
    paintStarts,
    completedPaints,
    abandonedPaints,
    completedPerTouchedPage: Number((completedPaints / Math.max(1, touchedPages)).toFixed(2)),
    worstPagePaintCount: worstPage[1],
    topPaintedPages: perfAfterFlips.renderStarts
      .slice()
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([page, count]) => `s${page}:${count}`),
    pageSequence: pageSequence.join(','),
    maxDistinctRenderKeys: Math.max(0, ...perfAfterFlips.distinctKeys.map(([, count]) => count)),
    liveCanvases: afterFlips.liveCanvases,
    heapBeforeMb: toMb(heapBefore),
    heapAfterMb: toMb(heapAfter),
    heapGrowthRatio: Number((heapAfter / Math.max(1, heapBefore)).toFixed(2)),
    libraryHeapMb: toMb(libraryHeap),
  };

  assert.ok(
    afterFlips.liveCanvases <= LIMITS.desktopCanvases,
    `Masaüstünde canlı canvas sayısı ${afterFlips.liveCanvases} > ${LIMITS.desktopCanvases}`,
  );
  assert.equal(afterFlips.pageFlipRoots, 1, '30 geçiş sonrası PageFlip instance sayısı 1 değil');

  // ------------------------------------------------------- hızlı art arda swipe
  await evaluate('window.__ravzaPerf.reset()');
  const beforeRush = await evaluate('Number(document.querySelector("#reader-inner").dataset.currentPage)');
  for (let step = 0; step < 10; step += 1) {
    await pressKey('ArrowRight', 'ArrowRight');
    await delay(45);
  }
  await delay(1600);
  const afterRush = await evaluate(readState);
  const rushPerf = await evaluate('window.__ravzaPerf.snapshot()');
  report.desktop.rushFromPage = beforeRush;
  report.desktop.rushToPage = afterRush.currentPage;
  report.desktop.rushPaintStarts = rushPerf.renderStarts.reduce((sum, [, count]) => sum + count, 0);
  report.desktop.rushCompletedPaints = rushPerf.completions.reduce((sum, [, count]) => sum + count, 0);
  report.desktop.rushLiveCanvases = afterRush.liveCanvases;
  assert.ok(afterRush.currentPage >= beforeRush, 'Hızlı geçişte sayfa geri gitti');
  assert.ok(
    afterRush.liveCanvases <= LIMITS.desktopCanvases,
    `Hızlı geçiş sonrası canvas sayısı ${afterRush.liveCanvases} > ${LIMITS.desktopCanvases}`,
  );

  // ------------------------------------------------------------------- mobil
  await setViewport(390, 844);
  await waitFor('document.querySelector(\'#reader-inner\')?.dataset.spread === "single"');
  await waitFor('document.querySelector(\'.pdf-page.is-rendered\')');
  await evaluate('window.__ravzaPerf.reset()');

  const mobileFlips = [];
  for (let step = 0; step < 8; step += 1) {
    const result = await flipAndMeasure('next');
    assert.equal(result.changed, true, `Mobilde ${step + 1}. geçiş gerçekleşmedi`);
    mobileFlips.push(result.duration);
    await delay(60);
  }
  const mobileState = await evaluate(readState);
  const mobilePerf = await evaluate('window.__ravzaPerf.snapshot()');
  const mobileLongTasks = mobilePerf.longTasks.filter(duration => duration >= LIMITS.longTaskMs);
  report.mobile = {
    flipCount: mobileFlips.length,
    medianMs: median(mobileFlips),
    maxMs: Math.max(...mobileFlips),
    longTaskCount: mobileLongTasks.length,
    longTaskMaxMs: mobileLongTasks.length ? Math.max(...mobileLongTasks) : 0,
    liveCanvases: mobileState.liveCanvases,
    spread: mobileState.spread,
  };
  assert.equal(mobileState.spread, 'single', 'Mobilde tek sayfa modu etkin değil');
  assert.ok(
    mobileState.liveCanvases <= LIMITS.mobileCanvases,
    `Mobilde canlı canvas sayısı ${mobileState.liveCanvases} > ${LIMITS.mobileCanvases}`,
  );

  // ------------------------------------------------------------ orientation
  const pageBeforeRotation = mobileState.currentPage;
  const rotationStartedAt = Date.now();
  await setViewport(844, 390);
  await waitFor('document.querySelector(\'#ravzabooks[data-app-mode="reading"] .pdf-page.is-rendered\')');
  const rotated = await evaluate(readState);
  report.orientation = {
    ms: Date.now() - rotationStartedAt,
    pageBefore: pageBeforeRotation,
    pageAfter: rotated.currentPage,
    liveCanvases: rotated.liveCanvases,
    pageFlipRoots: rotated.pageFlipRoots,
  };
  assert.equal(rotated.pageFlipRoots, 1, 'Orientation sonrası birden fazla PageFlip instance var');
  assert.ok(
    Math.abs(rotated.currentPage - pageBeforeRotation) <= 1,
    `Orientation değişince sayfa kaydı: ${pageBeforeRotation} → ${rotated.currentPage}`,
  );
  assert.ok(
    rotated.liveCanvases <= LIMITS.desktopCanvases,
    `Orientation sonrası canvas sayısı ${rotated.liveCanvases} > ${LIMITS.desktopCanvases}`,
  );

  // -------------------------------------------------- kitaplığa dön / tekrar aç
  await setViewport(390, 844);
  await delay(400);
  await evaluate('document.querySelector(\'#rdr-back\').click()');
  await waitFor('document.querySelector(\'#ravzabooks[data-app-mode="library"] .library-book-card\')');
  const libraryAfter = await evaluate(`(() => ({
    canvases: document.querySelectorAll('canvas').length,
    flipbook: Boolean(document.querySelector('#rdr-flipbook')),
    pageFlipRoots: document.querySelectorAll('.stf__parent').length,
  }))()`);
  assert.equal(libraryAfter.canvases, 0, 'Kitaplığa dönünce canvas belleği temizlenmedi');
  assert.equal(libraryAfter.flipbook, false, 'Kitaplığa dönünce flipbook DOM temizlenmedi');
  assert.equal(libraryAfter.pageFlipRoots, 0, 'Kitaplığa dönünce PageFlip instance kaldı');

  const reopenStartedAt = Date.now();
  await evaluate(`document.querySelector('.library-book-card[data-book-id="${BOOK_ID}"]').click()`);
  await waitFor('document.querySelector(\'#ravzabooks[data-app-mode="reading"] .pdf-page.is-rendered\')');
  const reopened = await evaluate(readState);
  const heapReopened = await heapUsed();
  report.reopen = {
    ms: Date.now() - reopenStartedAt,
    pageFlipRoots: reopened.pageFlipRoots,
    liveCanvases: reopened.liveCanvases,
    heapMb: toMb(heapReopened),
  };
  assert.equal(reopened.pageFlipRoots, 1, 'Tekrar açılışta çift PageFlip instance oluştu');
  assert.ok(
    heapReopened / Math.max(1, heapBefore) <= LIMITS.heapGrowthRatio,
    `Heap kontrolsüz büyüdü: ${toMb(heapBefore)} MB → ${toMb(heapReopened)} MB`,
  );

  // ------------------------------------------------------------------ hijyen
  const relevantFailures = failedRequests.filter(message => /kucuk-prens|page-flip|assets\/vendor|127\.0\.0\.1:8788/i.test(message));
  assert.deepEqual(consoleIssues, [], `Konsol hatası: ${consoleIssues.join(' | ')}`);
  assert.deepEqual(relevantFailures, [], `Ağ hatası: ${relevantFailures.join(' | ')}`);
  assert.equal(
    missingLocalAssets.filter(url => /assets\/(books|branding|vendor)/.test(url)).length,
    0,
    `Yerel varlık 404: ${missingLocalAssets.join(' | ')}`,
  );

  // Rapor eşik denetiminden ÖNCE yazılır: başarısız koşuda da ölçüm elde kalsın.
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(ARTIFACT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `[ravza-books-perf] ${report.kind}\n` +
    `  Masaüstü : açılış ${report.desktop.openMs} ms · 30 geçiş · medyan ${report.desktop.forwardMedianMs} ms (max ${report.desktop.forwardMaxMs} ms)\n` +
    `  Uzun görev: ${report.desktop.longTaskCount} adet ≥${LIMITS.longTaskMs} ms (en uzun ${report.desktop.longTaskMaxMs} ms, toplam ${report.desktop.longTaskTotalMs} ms)\n` +
    `  Boyama    : ${report.desktop.completedPaints} tamamlanan (+${report.desktop.abandonedPaints} iptal edilen) ` +
      `/ ${report.desktop.touchedPages} sayfa = ${report.desktop.completedPerTouchedPage}× · ` +
      `farklı render anahtarı (max) ${report.desktop.maxDistinctRenderKeys}\n` +
    `  Canvas    : masaüstü ${report.desktop.liveCanvases} · mobil ${report.mobile.liveCanvases} · orientation ${report.orientation.liveCanvases}\n` +
    `  Bellek    : ${report.desktop.heapBeforeMb} MB → ${report.desktop.heapAfterMb} MB (${report.desktop.heapGrowthRatio}×) · tekrar açılış ${report.reopen.heapMb} MB\n` +
    `  Mobil     : medyan ${report.mobile.medianMs} ms · uzun görev ${report.mobile.longTaskCount}\n` +
    `  Rapor     : ${ARTIFACT_FILE}\n`,
  );

  // Dizi bazı sayfaları iki kez ziyaret ediyor (ileri + geri), bu yüzden ölçüt
  // "dokunulan sayfa başına tamamlanmış render" olarak alınır.
  assert.ok(
    report.desktop.completedPerTouchedPage <= LIMITS.completedRendersPerPage,
    `Aynı sayfa tekrar tekrar render ediliyor: sayfa başına ${report.desktop.completedPerTouchedPage} tamamlanmış render`,
  );
  assert.ok(
    report.desktop.maxDistinctRenderKeys <= 1,
    `Aynı sayfa farklı ölçülerle render edildi (ölçüm kararsız): ${report.desktop.maxDistinctRenderKeys} farklı anahtar`,
  );
  assert.ok(
    report.desktop.heapGrowthRatio <= LIMITS.heapGrowthRatio,
    `30 geçişte heap ${report.desktop.heapGrowthRatio}× büyüdü`,
  );
} finally {
  try { socket.close(); } catch { /* kapalı */ }
  browser.kill();
  server.close();
  await delay(250);
  await rm(PROFILE, { recursive: true, force: true });
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function toMb(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(1));
}
