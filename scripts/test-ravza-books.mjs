import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PORT = 8784;
const BASE_URL = (process.env.RAVZA_BOOKS_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const READER_OVERRIDE = process.env.RAVZA_BOOKS_OVERRIDE_READER === '1'
  ? await readFile(join(ROOT, 'js', 'pages', 'ravza-books-page.js'))
  : null;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = resolve(tmpdir(), `ravza-books-test-${Date.now()}`);
const VIEWPORTS = [
  [320, 568, 2],
  [375, 812, 2],
  [390, 844, 2],
  [430, 932, 2],
  [768, 1024, 4],
  [1024, 768, 4],
  [1366, 768, 5],
  [1920, 1080, 6],
];
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

assert.ok(existsSync(CHROME), 'Google Chrome bulunamadı');
assert.ok(PROFILE.startsWith(`${resolve(tmpdir())}${sep}`), 'Geçici Chrome profili güvenli dizinde değil');

const missingLocalAssets = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${PORT}`).pathname);
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

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
await new Promise(resolveListen => server.listen(PORT, '127.0.0.1', resolveListen));

const browser = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--disable-extensions',
  '--remote-debugging-port=9384',
  `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: 'ignore' });

async function findPageTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetch('http://127.0.0.1:9384/json/list').then(response => response.json());
      const page = targets.find(target => target.type === 'page');
      if (page) return page;
    } catch {}
    await delay(100);
  }
  throw new Error('Chrome test hedefi açılamadı');
}

const target = await findPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', rejectOpen, { once: true });
});

let commandId = 0;
const pendingCommands = new Map();
const consoleIssues = [];
const failedRequests = [];
const requestUrls = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Fetch.requestPaused') {
    if (READER_OVERRIDE && /\/js\/pages\/ravza-books-page\.js(?:\?|$)/.test(message.params.request.url)) {
      void command('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/javascript; charset=utf-8' }],
        body: READER_OVERRIDE.toString('base64'),
      });
    } else {
      void command('Fetch.continueRequest', { requestId: message.params.requestId });
    }
    return;
  }
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
  return new Promise((resolveCommand, rejectCommand) => {
    pendingCommands.set(id, { resolve: resolveCommand, reject: rejectCommand });
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  let snapshot = null;
  try {
    snapshot = await evaluate(`(() => ({
      mode: document.querySelector('#ravzabooks')?.dataset.appMode,
      error: document.querySelector('.reader-error p')?.textContent,
      loading: document.querySelector('.reader-loading p')?.textContent,
      loadingPercent: document.querySelector('.reader-loading-percent')?.textContent,
      sheets: document.querySelectorAll('.book-sheet').length,
      rendered: document.querySelectorAll('.pdf-page.is-rendered').length,
      pageFlipGlobal: Boolean(window.St?.PageFlip),
      resources: performance.getEntriesByType('resource')
        .filter(entry => /page-flip|kucuk-prens|pdf\.worker|pdf\.js/.test(entry.name))
        .map(entry => ({ name: entry.name, duration: Math.round(entry.duration), transferSize: entry.transferSize })),
    }))()`);
  } catch {}
  throw new Error(`Zaman aşımı: ${expression}\nDurum: ${JSON.stringify(snapshot)}\nKonsol: ${consoleIssues.join(' | ')}`);
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
  await delay(220);
}

try {
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Log.enable');
  await command('Network.enable');
  if (READER_OVERRIDE) {
    await command('Fetch.enable', { patterns: [{ urlPattern: '*js/pages/ravza-books-page.js*', requestStage: 'Request' }] });
  }
  await setViewport(390, 844);
  await command('Page.navigate', { url: `${BASE_URL}/?page=ravza-books` });
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')");
  await evaluate("localStorage.removeItem('ravzaBooksProgress:kucuk-prens'); location.reload()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')");

  for (const [width, height, columns] of VIEWPORTS) {
    await setViewport(width, height);
    const probe = await evaluate(`(() => {
      const view = document.querySelector('.library-view');
      const grid = document.querySelector('.library-grid');
      const card = document.querySelector('.library-book-card');
      const exit = document.querySelector('.library-exit');
      const cardRect = card.getBoundingClientRect();
      const exitRect = exit.getBoundingClientRect();
      return {
        viewport: [innerWidth, innerHeight],
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        libraryOverflow: view.scrollWidth - view.clientWidth,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
        cardInside: cardRect.left >= -0.5 && cardRect.right <= innerWidth + 0.5,
        exitInside: exitRect.left >= -0.5 && exitRect.right <= innerWidth + 0.5,
        coverFit: getComputedStyle(card.querySelector('.library-cover-image')).objectFit,
        pdfCanvasCount: document.querySelectorAll('.pdf-page canvas').length,
        pageFlipLoaded: Boolean(window.St?.PageFlip),
      };
    })()`);
    assert.deepEqual(probe.viewport, [width, height], `${width}x${height}: viewport ölçüsü yanlış`);
    assert.ok(probe.documentOverflow <= 0 && probe.libraryOverflow <= 0, `${width}x${height}: yatay taşma var`);
    assert.equal(probe.columns, columns, `${width}x${height}: kolon sayısı yanlış`);
    assert.equal(probe.cardInside && probe.exitInside, true, `${width}x${height}: kitaplık öğesi ekran dışında`);
    assert.equal(probe.coverFit, 'cover', `${width}x${height}: kapak object-fit cover değil`);
    assert.equal(probe.pdfCanvasCount, 0, `${width}x${height}: kitaplıkta PDF canvas çalışıyor`);
    assert.equal(probe.pageFlipLoaded, false, `${width}x${height}: kitaplıkta PageFlip erken yüklendi`);
  }

  await setViewport(390, 844);
  assert.equal(await evaluate("document.querySelectorAll('.library-book-card').length"), 5, 'Beş PDF kitabın tamamı kitaplıkta görünmüyor');
  assert.equal(
    [...requestUrls.values()].filter(url => /page-flip/i.test(url)).length,
    0,
    'PageFlip okuyucu açılmadan istendi',
  );
  await command('Network.emulateNetworkConditions', {
    offline: false,
    latency: 350,
    downloadThroughput: 1_500_000,
    uploadThroughput: 750_000,
  });
  await evaluate("document.querySelector('.library-book-card[data-book-id=\"dede-korkut-hikayeleri\"]').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"reading\"] .pdf-page.is-rendered')", 30000);
  await command('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const pageFlipRequests = [...requestUrls.values()].filter(url => /page-flip/i.test(url));
  assert.equal(pageFlipRequests.length, 1, `PageFlip bir kez yerine ${pageFlipRequests.length} kez istendi`);
  assert.match(pageFlipRequests[0], /\/assets\/vendor\/page-flip\/page-flip\.browser\.js$/);
  assert.equal(pageFlipRequests.some(url => /unpkg\.com/i.test(url)), false, 'PageFlip için unpkg isteği kaldı');
  assert.equal(
    await evaluate("document.querySelectorAll('script[data-ravza-page-flip=\"2.0.7\"]').length"),
    1,
    'StPageFlip script etiketi bir kez yerine birden fazla yüklendi',
  );
  const dedeKorkutProbe = await evaluate(`(() => ({
    title: document.querySelector('#rdr-control-title')?.textContent,
    pdfPages: document.querySelectorAll('.book-sheet.pdf-page').length,
    allSheets: document.querySelectorAll('.book-sheet').length,
  }))()`);
  assert.equal(dedeKorkutProbe.title, 'Dede Korkut Hikâyeleri', 'Dede Korkut başlığı yanlış');
  assert.equal(dedeKorkutProbe.pdfPages, 200, 'Dede Korkut PDF sayfaları eksik');
  assert.equal(dedeKorkutProbe.allSheets, 201, 'Dede Korkut arka kapağı oluşturulmadı');
  await evaluate("document.querySelector('#rdr-back').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card[data-book-id=\"dede-korkut-hikayeleri\"]')");

  await evaluate("document.querySelector('.library-book-card').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"reading\"] .pdf-page.is-rendered')", 30000);
  const readerProbe = await evaluate(`(() => {
    const pages = [...document.querySelectorAll('.book-sheet')];
    const canvases = [...document.querySelectorAll('.pdf-page canvas')];
    return {
      pageCount: pages.length,
      pdfPageCount: document.querySelectorAll('.book-sheet.pdf-page').length,
      rendered: document.querySelectorAll('.pdf-page.is-rendered').length,
      allocated: canvases.filter(canvas => canvas.width > 1 && canvas.height > 1).length,
      firstDensity: pages[0]?.dataset.density,
      secondDensity: pages[1]?.dataset.density,
      lastDensity: pages.at(-1)?.dataset.density,
      hasDirectionButtons: Boolean(document.querySelector('[id*=next], [id*=prev], .next-page, .prev-page')),
      spread: document.querySelector('#reader-inner')?.dataset.spread,
    };
  })()`);
  assert.equal(readerProbe.pageCount, 167, '166 PDF sayfası ve arka kapak oluşturulmadı');
  assert.equal(readerProbe.pdfPageCount, 166, 'PDF sayfa sırası eksik');
  assert.ok(readerProbe.rendered <= 5 && readerProbe.allocated <= 5, 'Tembel PDF render penceresi 5 sayfayı aşıyor');
  assert.deepEqual([readerProbe.firstDensity, readerProbe.secondDensity, readerProbe.lastDensity], ['hard', 'soft', 'hard'], 'Kapak yoğunlukları yanlış');
  assert.equal(readerProbe.hasDirectionButtons, false, 'Okuyucuda yön düğmesi bulunuyor');
  assert.equal(readerProbe.spread, 'single', 'Mobil okuyucu tek sayfa değil');

  const mobilePdfFit = await evaluate(`(() => {
    const cradle = document.querySelector('#book-cradle').getBoundingClientRect();
    const canvas = document.querySelector('.pdf-page.is-rendered canvas').getBoundingClientRect();
    return {
      bookRatio: cradle.width / cradle.height,
      canvasWidthFill: canvas.width / cradle.width,
      canvasHeightFill: canvas.height / cradle.height,
      overflow: Math.max(0, cradle.right - innerWidth) + Math.max(0, -cradle.left),
    };
  })()`);
  assert.ok(Math.abs(mobilePdfFit.bookRatio - 0.75) < 0.01, 'Mobil PDF alanı sayfa oranına uymuyor');
  assert.ok(mobilePdfFit.canvasWidthFill > 0.95 && mobilePdfFit.canvasHeightFill > 0.95, 'Mobil PDF tuvali sayfa alanını doldurmuyor');
  assert.equal(mobilePdfFit.overflow, 0, 'Mobil PDF yatay taşıyor');

  await evaluate("document.querySelector('.theme-btn[data-theme=\"sepia\"]').click()");
  await delay(240);
  const sepiaTheme = await evaluate(`(() => {
    const canvas = document.querySelector('.pdf-page.is-rendered canvas');
    const frame = canvas.closest('.pdf-canvas-frame');
    const button = document.querySelector('.theme-btn[data-theme="sepia"]');
    return {
      theme: document.querySelector('#ravzabooks').dataset.readerTheme,
      filter: getComputedStyle(canvas).filter,
      background: getComputedStyle(frame).backgroundColor,
      selected: button.classList.contains('selected'),
      pressed: button.getAttribute('aria-pressed'),
    };
  })()`);
  assert.equal(sepiaTheme.theme, 'sepia', 'Sepya tema köke uygulanmadı');
  assert.match(sepiaTheme.filter, /sepia/, 'Sepya görünüm PDF canvasına uygulanmadı');
  assert.notEqual(sepiaTheme.background, 'rgb(255, 255, 255)', 'Sepya görünüm PDF zeminini değiştirmedi');
  assert.equal(sepiaTheme.selected && sepiaTheme.pressed === 'true', true, 'Sepya tema düğmesi seçili görünmüyor');

  await evaluate("document.querySelector('.theme-btn[data-theme=\"dark\"]').click()");
  await delay(240);
  const darkTheme = await evaluate(`(() => {
    const canvas = document.querySelector('.pdf-page.is-rendered canvas');
    const button = document.querySelector('.theme-btn[data-theme="dark"]');
    return {
      theme: document.querySelector('#ravzabooks').dataset.readerTheme,
      filter: getComputedStyle(canvas).filter,
      selected: button.classList.contains('selected'),
      pressed: button.getAttribute('aria-pressed'),
    };
  })()`);
  assert.equal(darkTheme.theme, 'dark', 'Koyu tema köke uygulanmadı');
  assert.match(darkTheme.filter, /invert/, 'Koyu görünüm PDF canvasına uygulanmadı');
  assert.equal(darkTheme.selected && darkTheme.pressed === 'true', true, 'Koyu tema düğmesi seçili görünmüyor');

  await evaluate("document.querySelector('.theme-btn[data-theme=\"light\"]').click()");
  await delay(240);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.pdf-page.is-rendered canvas')).filter"), 'none', 'Açık tema PDF filtresini temizlemedi');
  assert.equal(await evaluate("localStorage.getItem('ravzaBooksProgress:kucuk-prens')"), null, 'Tema değişimi kayıtlı sayfayı değiştirdi');

  await setViewport(1024, 768);
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"reading\"] #reader-inner')?.dataset.spread === 'double'", 30000);
  assert.ok(await evaluate("document.querySelectorAll('.pdf-page canvas[data-render-key]').length <= 5"), 'Yatay tablette PDF render penceresi 5 sayfayı aşıyor');
  const desktopPdfFit = await evaluate(`(() => {
    const cradle = document.querySelector('#book-cradle').getBoundingClientRect();
    return {
      bookRatio: cradle.width / cradle.height,
      leftMargin: cradle.left,
      rightMargin: innerWidth - cradle.right,
      overflow: Math.max(0, cradle.right - innerWidth) + Math.max(0, -cradle.left),
    };
  })()`);
  assert.ok(Math.abs(desktopPdfFit.bookRatio - 1.5) < 0.01, 'Çift sayfa PDF alanı kitap oranına uymuyor');
  assert.ok(Math.abs(desktopPdfFit.leftMargin - desktopPdfFit.rightMargin) < 1, 'Çift sayfa PDF ekranda ortalanmıyor');
  assert.equal(desktopPdfFit.overflow, 0, 'Çift sayfa PDF yatay taşıyor');
  await setViewport(390, 844);
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"reading\"] #reader-inner')?.dataset.spread === 'single'", 30000);

  const stage = await evaluate(`(() => { const r = document.querySelector('#book-cradle').getBoundingClientRect(); return { left:r.left, right:r.right, y:r.top+r.height/2 }; })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: stage.right - 3, y: stage.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 6; step += 1) {
    await command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: stage.right - ((stage.right - stage.left) * step / 7),
      y: stage.y,
      button: 'left',
      buttons: 1,
    });
    await delay(35);
  }
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: stage.left + 20, y: stage.y, button: 'left', buttons: 0, clickCount: 1 });
  await waitFor("Number(document.querySelector('#reader-inner')?.dataset.currentPage) > 1");
  assert.equal(await evaluate("localStorage.getItem('ravzaBooksProgress:kucuk-prens')"), null, 'Sayfa kıvırma kayıtlı sayfayı otomatik oluşturdu');

  await evaluate(`(() => {
    const range = document.querySelector('#rdr-progress');
    range.value = '4';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('#reader-inner')?.dataset.currentPage === '5'");
  assert.equal(await evaluate("localStorage.getItem('ravzaBooksProgress:kucuk-prens')"), null, 'Sayfa barı kaydetmeden ilerleme kaydı oluşturdu');
  await evaluate("document.querySelector('#rdr-bookmark').click()");
  const saved = await evaluate("JSON.parse(localStorage.getItem('ravzaBooksProgress:kucuk-prens'))");
  assert.equal(saved.bookId, 'kucuk-prens');
  assert.equal(saved.savedPage, 5, 'Kaydet düğmesi savedPage değerini 5 yapmadı');
  assert.equal(saved.pdfPage, 5, 'Kaydet düğmesi PDF sayfasını 5 olarak kaydetmedi');
  assert.equal(saved.pageIndex, 4, 'Kaydet düğmesi sayfa indeksini doğru kaydetmedi');
  assert.equal(saved.totalPages, 166);
  assert.ok(saved.progress > 0 && saved.progress < 100);
  assert.ok(Number.isInteger(saved.bookmark), 'Yer imi sayfa numarası olarak kaydedilmedi');
  assert.ok(saved.lastOpenedAt > 0, 'lastOpenedAt kaydedilmedi');

  await evaluate(`(() => {
    const range = document.querySelector('#rdr-progress');
    range.value = '9';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('#reader-inner')?.dataset.currentPage === '10'");
  const afterUnsavedNavigation = await evaluate("JSON.parse(localStorage.getItem('ravzaBooksProgress:kucuk-prens'))");
  assert.equal(afterUnsavedNavigation.savedPage, 5, 'Kaydetmeden 10. sayfaya gitmek savedPage değerini değiştirdi');
  assert.equal(afterUnsavedNavigation.pdfPage, 5, 'Kaydetmeden 10. sayfaya gitmek PDF kaydını değiştirdi');
  assert.equal(afterUnsavedNavigation.updatedAt, saved.updatedAt, 'Normal gezinme kayıt zamanını değiştirdi');

  await command('Page.navigate', { url: 'about:blank' });
  await waitFor("location.href === 'about:blank'");
  await command('Page.navigate', { url: `${BASE_URL}/?page=ravza-books` });
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')");
  await evaluate("document.querySelector('.library-book-card').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"reading\"] #reader-inner')?.dataset.currentPage === '5'", 30000);
  const reopened = await evaluate(`(() => ({
    currentPage: Number(document.querySelector('#reader-inner').dataset.currentPage),
    savedPage: Number(document.querySelector('#reader-inner').dataset.savedPage),
    sliderIndex: Number(document.querySelector('#rdr-progress').value),
    stored: JSON.parse(localStorage.getItem('ravzaBooksProgress:kucuk-prens')),
  }))()`);
  assert.equal(reopened.currentPage, 5, 'Uygulama son görüntülenen 10. sayfada açıldı');
  assert.equal(reopened.savedPage, 5, 'Yeniden açılışta savedPage korunmadı');
  assert.equal(reopened.sliderIndex, 4, 'Sayfa barı kaydedilen 5. sayfayı göstermiyor');
  assert.equal(reopened.stored.savedPage, 5, 'Kalıcı kayıt yeniden açılışta değişti');

  await evaluate("document.querySelector('#rdr-back').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')");
  const returned = await evaluate(`(() => ({
    canvases: document.querySelectorAll('canvas').length,
    flipbook: Boolean(document.querySelector('#rdr-flipbook')),
    status: document.querySelector('.library-reading-state')?.textContent,
  }))()`);
  assert.equal(returned.canvases, 0, 'Kitaplığa dönünce canvas belleği temizlenmedi');
  assert.equal(returned.flipbook, false, 'Kitaplığa dönünce PageFlip DOM’u temizlenmedi');
  assert.match(returned.status, /okundu.*Devam Et/s, 'Kitaplık ilerleme durumunu güncellemedi');

  const firstRecordBeforeIsolation = await evaluate("localStorage.getItem('ravzaBooksProgress:kucuk-prens')");
  await evaluate(`localStorage.setItem('ravzaBooksProgress:ikinci-kitap-testi', JSON.stringify({ bookId:'ikinci-kitap-testi', pageIndex:4, progress:20 }))`);
  const isolated = await evaluate(`({
    first: localStorage.getItem('ravzaBooksProgress:kucuk-prens'),
    second: JSON.parse(localStorage.getItem('ravzaBooksProgress:ikinci-kitap-testi')).bookId,
  })`);
  assert.equal(isolated.first, firstRecordBeforeIsolation, 'İkinci kitap kaydı ilk kitabın ilerlemesini değiştirdi');
  assert.equal(isolated.second, 'ikinci-kitap-testi', 'İkinci kitap ayrı anahtarda saklanmadı');
  await evaluate("localStorage.removeItem('ravzaBooksProgress:ikinci-kitap-testi')");

  await evaluate('location.reload()');
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')");
  assert.match(await evaluate("document.querySelector('.library-reading-state').textContent"), /okundu.*Devam Et/s, 'Yenilemede kitaplık ilerlemesi kayboldu');
  await evaluate("document.querySelector('.library-book-card').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"reading\"] .pdf-page.is-rendered')", 30000);
  const resumedPage = await evaluate("JSON.parse(localStorage.getItem('ravzaBooksProgress:kucuk-prens')).pageIndex");
  assert.ok(resumedPage >= saved.pageIndex, 'Kitap kaldığı sayfadan devam etmedi');

  await evaluate(`(() => {
    const range = document.querySelector('#rdr-progress');
    range.value = '165';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('#reader-inner')?.dataset.currentPage === '166'");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('ravzaBooksProgress:kucuk-prens')).completed"), false, 'Son sayfaya gitmek kitabı kaydetmeden tamamlandı yaptı');
  await evaluate("document.querySelector('#rdr-bookmark').click()");
  await waitFor("JSON.parse(localStorage.getItem('ravzaBooksProgress:kucuk-prens')).completed === true");
  await evaluate("document.querySelector('#rdr-back').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-reading-state.is-complete')");
  assert.match(await evaluate("document.querySelector('.library-reading-state').textContent"), /Tamamlandı.*Tekrar Oku/s);

  const normalConsoleIssues = [...consoleIssues];
  const normalFailedRequests = failedRequests.filter(message => /kucuk-prens|page-flip|assets\/vendor\/pdfjs|127\.0\.0\.1:8784/i.test(message));
  assert.deepEqual(normalConsoleIssues, [], `Normal akışta console hatası var: ${normalConsoleIssues.join(' | ')}`);
  assert.deepEqual(normalFailedRequests, [], `Normal akışta ağ hatası var: ${normalFailedRequests.join(' | ')}`);
  assert.equal(missingLocalAssets.filter(url => /assets\/(books|branding|vendor)/.test(url)).length, 0, 'Yerel kitap varlığı 404 döndü');

  await command('Network.setCacheDisabled', { cacheDisabled: true });
  await command('Network.setBlockedURLs', { urls: ['*kucuk-prens.pdf*'] });
  await evaluate("document.querySelector('.library-book-card').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"error\"] #rdr-error-back')", 20000);
  assert.match(await evaluate("document.querySelector('.reader-error p').textContent"), /PDF/);
  await evaluate("document.querySelector('#rdr-error-back').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')");

  await command('Network.setBlockedURLs', { urls: [] });
  await command('Network.setCacheDisabled', { cacheDisabled: true });
  await evaluate('location.reload()');
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"library\"] .library-book-card')");
  await command('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await evaluate("document.querySelector('.library-book-card').click()");
  await waitFor("document.querySelector('#ravzabooks[data-app-mode=\"error\"] #rdr-error-back')", 20000);
  assert.ok(
    (await evaluate("document.querySelector('.reader-error p').textContent")).trim().length > 0,
    'Çevrimdışı açılışta anlaşılır hata gösterilmedi',
  );
  await command('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  process.stdout.write(`Ravza Books: ${VIEWPORTS.length} viewport, açık/sepya/koyu PDF görünümü, 5'i kaydet → 10'a git → 5'te aç, curl ve hata durumu doğrulandı.\n`);
} finally {
  try { socket.close(); } catch {}
  browser.kill();
  server.close();
  await delay(250);
  await rm(PROFILE, { recursive: true, force: true });
}
