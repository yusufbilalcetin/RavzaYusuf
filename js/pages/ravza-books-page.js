import { RAVZA_BOOKS } from '../../data/ravza-books.js?v=books-pipeline-20260716-1';
import { createPageEntry, flattenTextContent, searchBookIndex, isSearchableQuery } from './ravza-books-search.js';
import { claimOverlay, OVERLAY_IDS } from '../core/overlay-manager.js';

const PAGE_FLIP_SRC = new URL('../../assets/vendor/page-flip/page-flip.browser.js', import.meta.url).href;
const PDFJS_MODULE_URL = new URL('../../assets/vendor/pdfjs/pdf.js', import.meta.url).href;
const PDFJS_WORKER_URL = new URL('../../assets/vendor/pdfjs/pdf.worker.js', import.meta.url).href;
const PDFJS_ASSET_ROOT = new URL('../../assets/vendor/pdfjs/', import.meta.url).href;
const PDF_PROGRESS_PREFIX = 'ravzaBooksProgress:';
/** Aynı anda tuvali ayrılmış (canlı) PDF sayfası sayısı. */
const PDF_WINDOW_SIZE = 5;
/**
 * Çift sayfa modunda canlı tutulan sayfa sayısı.
 *
 * Neden 6 ve neden AYRI bir sabit: çift sayfada okuma birimi tek sayfa değil
 * SPREAD'dir. "Önceki + geçerli + sonraki spread" üç spread, yani altı sayfa
 * eder. Beşle sınırlıyken sonraki spread'in ikinci sayfası pencereye hiç
 * girmiyordu (ölçüm: ~915ms boş sayfa). Üst sınır bilinçli: bütün kitap
 * değil, yalnızca komşu iki spread hazır tutulur - uzun PDF'te bellek
 * sınırsız büyümez. Tuval kopyaları ayrıca pdfBitmapCacheLimit() ile sınırlı.
 */
const PDF_SPREAD_WINDOW_SIZE = 6;
/** SPEKÜLATİF komşu ön yüklemesi bu kadar sakinlikten sonra başlar. */
const PDF_NEIGHBOUR_DELAY_MS = 220;
/**
 * ACİL komşu sayısı: pencere sırasındaki ilk iki komşu.
 *
 * Tek sayfada bu "sonraki + önceki", çift sayfada "sonraki spread"tir -
 * pdfWindowPages sırayı zaten önceliğe göre veriyor.
 *
 * Neden ayrı: bütün komşular PDF_NEIGHBOUR_DELAY_MS + requestIdleCallback
 * arkasında bekliyordu. Sakinlik beklemek HIZLI ÇEVİRMEDE doğru (boşa render
 * başlatmaz) ama kitap yeni açıldığında kullanıcı hareketsizdir ve o gecikme
 * doğrudan bekleme süresine dönüşüyordu: açılıştan 0-100ms sonra "sonraki"ye
 * basan kullanıcı ölçümde 219-343ms bekliyordu. Açılıştan 300ms sonra basan
 * ise 0ms. Acil komşu, GÖRÜNÜR sayfa bittikten SONRA başlar; yani görünür
 * render'la yarışmaz, yalnızca boşuna beklemez.
 */
const PDF_URGENT_NEIGHBOURS = 2;
const APP_MODES = new Set(['library', 'loading-book', 'reading', 'error']);
const COVER_CACHE_NAME = 'ravza-books-covers-v1';
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const lowPowerDevice = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
/** Düşük bellek / veri tasarrufu sinyalleri: zorunlu değil, yalnızca ön yükleme miktarını kısar. */
const lowMemoryDevice = (Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4)
  || Boolean(navigator.connection?.saveData);
const PAGE_CURL_CONFIG = Object.freeze({
  edgeGrabRatio: 0.24,
  minimumEdgePx: 54,
  maximumEdgePx: 124,
  snapThreshold: 0.28,
  flickVelocity: 0.42,
  minimumDragPx: 6,
  sampleWindowMs: 90,
  flipDuration: reducedMotionQuery.matches ? 180 : (lowPowerDevice ? 470 : 620),
  shadowOpacity: reducedMotionQuery.matches ? 0.2 : (lowPowerDevice ? 0.55 : 0.76),
  overshootPx: 8,
});

const STORAGE = {
  prefs: 'ravza-books-prefs',
  bookmarks: 'ravza-books-bookmarks',
  progress: 'ravza-books-progress',
  importedBook: 'ravza-books-imported-book',
  lastBook: 'ravza-books-last-book',
  /**
   * SON OKUNAN KONUM - YER İMİNDEN AYRI BİR KAVRAM.
   *
   * İki ayrı şey saklanır ve BİRBİRİNİ EZMEZ:
   *
   *   ravzaBooksProgress:<id>   YER İMİ / "kaydettiğim sayfa"
   *     Yalnızca kullanıcı yer imi düğmesine bastığında yazılır.
   *     Gezinmek, arama sonucuna atlamak, ilerleme barını sürüklemek bunu
   *     DEĞİŞTİRMEZ. Fiziksel bir kitap ayracı gibi davranır.
   *
   *   ravza-books-last-read     SON OKUNAN SAYFA / "kaldığım yer"
   *     Okurken otomatik güncellenir. Kitabı yeniden açınca buraya dönülür.
   *
   * Örnek: 25'i yer imlersin, 48'e kadar okursun, kapatıp açarsın ->
   * kitap 48'de açılır, yer imi hâlâ 25'i gösterir.
   */
  lastRead: 'ravza-books-last-read',
};

/** Okuma temaları. Global uygulama temasından BAĞIMSIZDIR (bkz. §26 kararı). */
const READER_THEMES = Object.freeze(['light', 'sepia', 'dark', 'black']);
/** Okuma modları. PDF sabit sayfa düzeni olduğu için ikisi de gerçek sayfadır. */
const READER_MODES = Object.freeze(['page', 'scroll']);

/**
 * YAKINLASTIRMA - NEDEN YALNIZCA SUREKLI MODDA.
 *
 * Sayfa modunda sayfa, sahnenin icine ZATEN tam sigdirilmis durumda
 * (fitPdfBookToStage). Oradan buyutmek, sayfayi sahnenin disina tasirir ve
 * kaydirma/pan katmani gerektirir; ama sayfa modunda yuzey sayfa kivirma
 * jestinin (`touch-action: none`) tekelinde. Ustune pan eklemek ya jesti
 * bozar ya da bir jest hakemligi katmani ister. Telefonda ayrica FIT WIDTH ile
 * FIT PAGE ayni sonucu verir (390x668 alanda 3:4 sayfa zaten genislige
 * sigiyor), yani sayfa modunda yakinlastirma gercek bir kazanc da saglamaz.
 *
 * Surekli modda ise kaydirici gercek: genisleyen sayfa yatayda da dikeyde de
 * dogal olarak pan edilir. Yakinlastirma bu yuzden orada uygulanir ve sayfa
 * modunda DURUSTCE "kullanilamaz" olarak gosterilir - sahte bir kontrol degil.
 *
 * %100 kavrami: sabit sayfa duzenli bir okuyucuda cihazdan bagimsiz "%100"
 * yoktur (595pt'lik A4, 390px telefonda neye esittir?). Bu yuzden oranlar
 * GENISLIGE SIGDIR temel alinarak verilir: %100 === Genisliğe Sığdır, o da
 * ayri bir secenek olarak zaten listede.
 */
/** Kontroller bu kadar hareketsizlikten sonra kaybolur (iOS oynatıcı hissi). */
const CONTROLS_HIDE_MS = 4000;
/** Kabuk sönme süresi (--controls-ease 220ms) + küçük pay. Bu süre boyunca
 *  kontroller hâlâ görünür olduğu için tıklanabilir de kalır. */
const CONTROLS_FADE_MS = 260;
/** Arama indeksi bu büyüklükte parçalar hâlinde kurulur; ana iş parçacığı boğulmasın. */
const SEARCH_INDEX_CHUNK = 8;
/** Listelenecek en fazla sonuç. Tavana dayanildiginda sayi "80+" gosterilir. */
const SEARCH_RESULT_LIMIT = 80;

const state = {
  mode: 'library',
  bookId: null,
  bookType: 'text',
  chapterId: null,
  pageNum: 1,
  currentIndex: 0,
  currentPage: 1,
  savedPage: 1,
  fontSize: 17,
  lineHeight: 1.4,
  theme: 'light',
  readerMode: 'page',
  keepAwake: false,
  accessible: false,
  pageSound: true,
  controlsVisible: true,
  bookmarks: {},
  readingProgress: {},
};

/** Açık kitabın içindekiler tablosu; PDF outline'ı yoksa null kalır. */
let tableOfContents = null;
/** Kitap içi arama indeksi: [{pageNumber, text, norm, collapsed, collapsedMap}] */
let searchIndex = [];
let searchIndexBookId = null;
let searchIndexPromise = null;
let searchIndexAbort = false;
let searchDebounceTimer = 0;
/** Sürekli kaydırma modunun gözlemcisi. */
let scrollObserver = null;
let scrollSyncFrame = 0;
/** Programatik kaydırma sürerken scroll dinleyicisi konumu ezmesin. */
let suppressScrollSync = false;

let BOOKS = [];
let importedBook = null;
let readerPages = [];
let pageFlip = null;
let readerAbort = null;
/** Araç çubuğu delegasyonu: kabuk basıldığı anda kurulur, PDF'i beklemez. */
let readerShellAbort = null;
let controlsFadeTimer = 0;
/** Yeniden sayfalama kabugu bastan basarken tasinan arama sorgusu. */
let pendingSearchRestore = null;
let layoutObserver = null;
let controlsTimer = 0;
let repaginateTimer = 0;
let toastTimer = 0;
let lugatTimer = 0;
let renderGeneration = 0;
let lastLayoutKey = '';
let lastFlipIndex = -1;
let audioContext = null;
let pageSoundBuffer = null;
let pageFlipScriptPromise = null;
let removeDirectPageCurl = null;
let prepareMobilePdfPreviousBackside = null;
let clearMobilePdfPreviousBackside = null;
let curlDragging = false;
let resizePending = false;
let originalThemeColor = null;
let libraryAbort = null;
let pdfjsLib = null;
let pdfFetchController = null;
let pdfLoadingTask = null;
let pdfDocument = null;
let pdfBookId = null;
let pdfPageAspectRatio = 3 / 4;
let pdfRenderGeneration = 0;
let pdfRenderBox = { width: 1, height: 1 };
let pdfRenderDrain = Promise.resolve();
const pdfRenderPromises = new Map();
const pdfRenderTasks = new Map();
const pdfPageCache = new Map();
/** Render sonucunun bitmap kopyası: pencereden çıkan sayfa geri geldiğinde PDF yeniden render edilmez. */
const pdfBitmapCache = new Map();
let pdfActivePages = new Set();
let pdfIdleHandle = 0;
let pdfWindowTimer = 0;
let pdfNeighbourTimer = 0;
let pendingRenderIndex = -1;
let lastCradleSize = '';
const coverObjectUrls = new Set();
const coverGenerationJobs = new Map();

/**
 * SAYFA GEÇİŞİ SAYAÇLARI - ölçüm içindir, davranışı etkilemez.
 *
 * Yalnızca tamsayı artırma: PDF render milisaniyelerle ölçülürken bunun
 * maliyeti ölçülemez. Ayrıntılı `performance.measure` kaydı ise pahalıdır ve
 * timeline'ı kirletir; o yüzden `?readerperf=1` ile açılır (pbn-debug ile
 * aynı desen). Sayaçlar test tarafından window üzerinden okunur.
 */
const readerPerf = {
  enabled: (() => {
    try {
      return new URLSearchParams(location.search).get('readerperf') === '1'
        || localStorage.getItem('readerPerf') === '1';
    } catch (_) { return false; }
  })(),
  renderStarts: 0,      // PDF.js render() gerçekten çalıştı
  cacheHits: 0,         // bitmap cache'ten boyandı
  alreadyRendered: 0,   // tuval zaten doğru renderKey ile duruyordu
  inflightJoins: 0,     // devam eden render'a bağlanıldı (duplicate önlendi)
  canvasResizes: 0,     // canvas.width/height gerçekten değişti
  canvasResizeSkips: 0, // aynı ölçü, yeniden ayırma yapılmadı
  peakInflight: 0,
  marks: [],
};
window.__readerPerf = readerPerf;
const perfMark = (name, detail) => {
  if (!readerPerf.enabled) return;
  // Bayrak localStorage'da unutulursa dizi sınırsız büyümesin.
  if (readerPerf.marks.length > 2000) readerPerf.marks.splice(0, 1000);
  readerPerf.marks.push({ name, detail, t: performance.now() });
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const supportsIdleCallback = typeof window.requestIdleCallback === 'function';
const runWhenIdle = callback => (supportsIdleCallback
  ? window.requestIdleCallback(callback, { timeout: 400 })
  : window.setTimeout(callback, 32));
const cancelIdle = handle => {
  if (!handle) return;
  if (supportsIdleCallback) window.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
};
const escapeHTML = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const SVG = (paths, fill = 'none') =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICON = {
  back: SVG('<path d="m15 18-6-6 6-6"/>'),
  bookmark: SVG('<path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4V4.8Z"/>'),
  bookmarkFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4V4.8Z"/></svg>',
  contents: SVG('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  close: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: SVG('<path d="m5 13 4 4 10-10"/>'),
};

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function isPlainRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readStoredRecord(key) {
  const value = readStoredJson(key, {});
  return isPlainRecord(value) ? value : {};
}

function loadStorage() {
  const prefs = readStoredRecord(STORAGE.prefs);
  state.fontSize = clamp(Number(prefs.fontSize) || 17, 16, 24);
  state.lineHeight = [1.35, 1.4, 1.45].includes(Number(prefs.lineHeight))
    ? Number(prefs.lineHeight)
    : 1.4;
  state.theme = READER_THEMES.includes(prefs.theme) ? prefs.theme : 'light';
  state.readerMode = READER_MODES.includes(prefs.readerMode) ? prefs.readerMode : 'page';
  state.keepAwake = Boolean(prefs.keepAwake) && wakeLockSupported;
  state.accessible = Boolean(prefs.accessible);
  state.pageSound = prefs.pageSound !== false;
  state.bookmarks = readStoredRecord(STORAGE.bookmarks);
  state.readingProgress = readStoredRecord(STORAGE.progress);
  const storedImportedBook = readStoredJson(STORAGE.importedBook, null);
  importedBook = isPlainRecord(storedImportedBook) ? storedImportedBook : null;
}

function savePrefs() {
  localStorage.setItem(STORAGE.prefs, JSON.stringify({
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    theme: state.theme,
    readerMode: state.readerMode,
    keepAwake: state.keepAwake,
    accessible: state.accessible,
    pageSound: state.pageSound,
  }));
}

function saveBookmarks() {
  localStorage.setItem(STORAGE.bookmarks, JSON.stringify(state.bookmarks));
}

function saveCurrentPage(page, index) {
  if (!page || !state.bookId) return;
  const book = getBook(state.bookId);
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  if (state.bookType === 'pdf') {
    const pdfPage = clamp(Number(page.pdfPage) || Math.min(index + 1, pdfDocument?.numPages || 1), 1, pdfDocument?.numPages || 1);
    const pageCount = Math.max(1, pdfDocument?.numPages || Number(book?.totalPages) || readerPages.length - 1);
    state.currentPage = pdfPage;
    state.savedPage = state.currentPage;
    const record = {
      bookId: state.bookId,
      pdfPage,
      pageIndex: index,
      savedPage: state.savedPage,
      totalPages: pageCount,
      progress: Number(clamp((pdfPage / pageCount) * 100, 0, 100).toFixed(1)),
      bookmark: isBookmarked(page) ? pdfPage : null,
      completed: pdfPage >= pageCount,
      lastOpenedAt: now,
      updatedAt,
    };
    state.readingProgress[state.bookId] = record;
    try { localStorage.setItem(`${PDF_PROGRESS_PREFIX}${state.bookId}`, JSON.stringify(record)); } catch (_) {}
    const root = document.getElementById('reader-inner');
    if (root) root.dataset.savedPage = String(state.savedPage);
    return;
  }
  const pagesInChapter = readerPages.filter(item => item.chapterId === page.chapterId);
  const chapterPageIndex = pagesInChapter.findIndex(item => item === page);
  const pageCount = Math.max(1, readerPages.length);
  state.currentPage = index + 1;
  state.savedPage = state.currentPage;
  const record = {
    bookId: state.bookId,
    pdfPage: null,
    pageIndex: index,
    savedPage: state.savedPage,
    totalPages: pageCount,
    progress: Number(clamp(((index + 1) / pageCount) * 100, 0, 100).toFixed(1)),
    bookmark: isBookmarked(page) ? index + 1 : null,
    completed: index >= pageCount - 1,
    lastOpenedAt: now,
    updatedAt,
    chapterId: page.chapterId,
    pageNum: chapterPageIndex + 1,
    offset: page.sourceOffset,
    absIndex: index,
  };
  state.readingProgress[state.bookId] = record;
  try { localStorage.setItem(`${PDF_PROGRESS_PREFIX}${state.bookId}`, JSON.stringify(record)); } catch (_) {}
  const root = document.getElementById('reader-inner');
  if (root) root.dataset.savedPage = String(state.savedPage);
}

/**
 * OKUMA KONUMU MODELİ - BİLİNÇLİ OLARAK "ELLE KAYDET".
 *
 * Bu projede konum, sayfa çevirdikçe OTOMATİK kaydedilmez. Kayıt yalnızca
 * kullanıcı yer imi/kaydet düğmesine bastığında oluşur ("Kaldığın sayfa
 * kaydedildi"). Yani kitapta gezinmek, ilerleme barını sürüklemek veya
 * içindekilerden atlamak kaydedilmiş sayfayı DEĞİŞTİRMEZ; kitap yeniden
 * açıldığında kullanıcının kendi işaretlediği sayfaya döner.
 *
 * Bu bir eksiklik değil, test edilmiş bir üründür - scripts/test-ravza-books.mjs
 * içinde en az beş ayrı iddia bu davranışı savunuyor:
 *   "Sayfa kıvırma kayıtlı sayfayı otomatik oluşturdu"
 *   "Sayfa barı kaydetmeden ilerleme kaydı oluşturdu"
 *   "Kaydetmeden 10. sayfaya gitmek savedPage değerini değiştirdi"
 *   "Yeniden açılışta savedPage korunmadı"
 *   "Son sayfaya gitmek kitabı kaydetmeden tamamlandı yaptı"
 *
 * Fiziksel bir kitap ayracı gibi davranır: sayfaları karıştırmak ayracı
 * yerinden oynatmaz. Otomatik kayda geçmek istenirse bu bir ÜRÜN kararıdır ve
 * yukarıdaki iddiaların da birlikte güncellenmesi gerekir - sessizce
 * değiştirilmemelidir.
 */

/* ------------------------------------------------------------------------ */
/* SON OKUNAN KONUM (yer iminden bağımsız)                                    */
/* ------------------------------------------------------------------------ */

let lastReadSaveTimer = 0;

/** Tüm kitapların son okunan konumları. Bozuk kayıt tüm haritayı düşürmez. */
function readLastReadMap() {
  return readStoredRecord(STORAGE.lastRead);
}

/**
 * Bir kitabın son okunan konumu; doğrulanmış hâlde döner.
 * Geçersiz/bozuk değer (NaN, 0, negatif, sayfa sayısını aşan) null verir -
 * §41 gereği çökme değil, güvenli geri dönüş.
 */
function readLastRead(bookId, totalPages = Infinity) {
  const entry = readLastReadMap()[bookId];
  if (!isPlainRecord(entry)) return null;
  const page = Number(entry.page);
  if (!Number.isFinite(page) || page < 1) return null;
  const limit = Number.isFinite(totalPages) ? totalPages : page;
  return {
    page: clamp(Math.floor(page), 1, Math.max(1, limit)),
    mode: READER_MODES.includes(entry.mode) ? entry.mode : null,
    at: Number(entry.at) || 0,
  };
}

/** Yazma. Yer imi kaydına (ravzaBooksProgress:*) ASLA dokunmaz. */
function writeLastRead(bookId, page) {
  if (!bookId || !Number.isFinite(page)) return;
  try {
    const map = readLastReadMap();
    map[bookId] = { page: Math.floor(page), mode: state.readerMode, at: Date.now() };
    localStorage.setItem(STORAGE.lastRead, JSON.stringify(map));
  } catch (_) {
    // Kota dolu veya depolama kapalı: okuma devam etmeli (§37).
  }
}

/**
 * Gecikmeli kayıt. Her kaydırma pikselinde localStorage'a yazmak yerine
 * kullanıcı durunca bir kez yazılır (§4).
 */
function scheduleLastReadSave() {
  clearTimeout(lastReadSaveTimer);
  const bookId = state.bookId;
  const page = state.currentPage;
  lastReadSaveTimer = window.setTimeout(() => {
    lastReadSaveTimer = 0;
    writeLastRead(bookId, page);
  }, 600);
}

/** Bekleyen yazımı hemen diske düşürür (kapanış / sekme gizlenmesi). */
function flushLastReadSave() {
  if (!lastReadSaveTimer) return;
  clearTimeout(lastReadSaveTimer);
  lastReadSaveTimer = 0;
  if (state.bookId) writeLastRead(state.bookId, state.currentPage);
}

function normalizeProgress(book, progress) {
  if (!book || !progress || progress.bookId && progress.bookId !== book.id) return null;
  const rawPageIndex = Math.max(0, Number(progress.pageIndex ?? progress.absIndex) || 0);
  const inferredTotal = book.type === 'pdf'
    ? Number(book.totalPages) || Number(progress.totalPages) || 1
    : Number(progress.totalPages) || rawPageIndex + 1;
  const totalPages = Math.max(1, inferredTotal);
  const pageIndex = book.type === 'pdf'
    ? clamp(rawPageIndex, 0, totalPages)
    : rawPageIndex;
  const pdfPage = book.type === 'pdf'
    ? clamp(Number(progress.savedPage) || Number(progress.pdfPage) || pageIndex + 1, 1, totalPages)
    : null;
  const savedPage = book.type === 'pdf'
    ? pdfPage
    : clamp(Number(progress.savedPage) || pageIndex + 1, 1, totalPages);
  let percentage = Number(progress.progress);
  if (Number.isFinite(percentage) && percentage > 0 && percentage <= 1 && progress.updatedAt) percentage *= 100;
  if (!Number.isFinite(percentage)) {
    const currentPage = book.type === 'pdf' ? pdfPage : pageIndex + 1;
    percentage = (currentPage / totalPages) * 100;
  }
  const lastOpenedAt = Number(progress.lastOpenedAt)
    || (progress.updatedAt ? Date.parse(progress.updatedAt) : 0)
    || 0;
  let bookmark = progress.bookmark;
  if (bookmark === true) bookmark = book.type === 'pdf' ? pdfPage : pageIndex + 1;
  if (bookmark === false || bookmark === undefined) bookmark = null;
  return {
    ...progress,
    bookId: book.id,
    pdfPage,
    pageIndex,
    savedPage,
    totalPages,
    progress: Number(clamp(percentage, 0, 100).toFixed(1)),
    bookmark: Number.isFinite(Number(bookmark)) ? Number(bookmark) : null,
    completed: Boolean(progress.completed) || percentage >= 99.95,
    lastOpenedAt,
  };
}

function readBookProgress(bookId) {
  try {
    const progress = JSON.parse(localStorage.getItem(`${PDF_PROGRESS_PREFIX}${bookId}`) || 'null');
    return normalizeProgress(getBook(bookId), progress);
  } catch (_) {
    return null;
  }
}

function buildSampleContent() {
  // Bellekteki deger baska bir eski kod yolu tarafindan degistirilmis olsa da
  // kitaplik acilisi koleksiyon erisimi sirasinda cokmemeli.
  if (!isPlainRecord(state.bookmarks)) state.bookmarks = {};
  if (!isPlainRecord(state.readingProgress)) state.readingProgress = {};
  const validImported = importedBook
    && importedBook.id
    && Array.isArray(importedBook.chapters)
    && importedBook.chapters.length;
  if (validImported) importedBook.type = 'text';
  BOOKS = validImported ? [...RAVZA_BOOKS, importedBook] : [...RAVZA_BOOKS];
  for (const book of BOOKS) {
    const scopedProgress = readBookProgress(book.id);
    const legacyProgress = normalizeProgress(book, state.readingProgress[book.id]);
    const progress = scopedProgress || legacyProgress;
    if (!progress) continue;
    state.readingProgress[book.id] = progress;
    try { localStorage.setItem(`${PDF_PROGRESS_PREFIX}${book.id}`, JSON.stringify(progress)); } catch (_) {}
  }
}

/** Okuma temasının sahne rengi; adres çubuğu da bu rengi alır. */
const READER_THEME_COLOR = Object.freeze({
  light: '#F4EAD7',
  sepia: '#ddc8a5',
  dark: '#171614',
  black: '#000000',
});

function applyTheme(theme) {
  if (!READER_THEMES.includes(theme)) return;
  state.theme = theme;
  document.getElementById('ravzabooks')?.setAttribute('data-reader-theme', theme);
  document.querySelectorAll('#reader-inner .theme-btn, .reader-sheet .theme-btn').forEach(button => {
    const selected = button.dataset.theme === theme;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', READER_THEME_COLOR[theme] || READER_THEME_COLOR.light);
}

function applyTypography() {
  const root = document.getElementById('ravzabooks');
  root?.style.setProperty('--rd-size', `${state.fontSize}px`);
  root?.style.setProperty('--rd-lh', String(state.lineHeight));
}

function getBook(bookId) {
  return BOOKS.find(book => book.id === bookId) || null;
}

function shouldUsePortrait() {
  return window.innerWidth <= 700
    || (window.matchMedia('(orientation: portrait)').matches && window.innerWidth <= 1100);
}

/**
 * Telefon portresi + sayfa modu + PDF: fiziksel yaprak sahnenin tamamini
 * kaplar, gercek PDF icerigi yapragin icinde contain edilir.
 *
 * Kosul, ayni ayrimi yapan CSS media query'siyle birebir ayni tutulur:
 * (max-width: 767px) and (orientation: portrait).
 */
function shouldUseMobileFullSheet() {
  return state.bookType === 'pdf'
    && state.readerMode === 'page'
    && window.innerWidth < 768
    && window.matchMedia('(orientation: portrait)').matches;
}

function getCurrentPosition() {
  const page = readerPages[state.currentIndex];
  if (page) {
    if (state.bookType === 'pdf') {
      return {
        pdfPage: page.pdfPage,
        pageIndex: state.currentIndex,
      };
    }
    return {
      chapterId: page.chapterId,
      pageNum: 1,
      offset: page.sourceOffset,
      absIndex: state.currentIndex,
    };
  }
  return state.readingProgress[state.bookId] || null;
}

/**
 * Kitap hangi sayfadan açılacak?
 *
 * Öncelik sırası:
 *   1. Çağıranın açıkça verdiği konum (arama sonucu, "baştan başla", mod
 *      değişiminde mevcut konum) - kullanıcı niyeti her şeyin üstünde.
 *   2. SON OKUNAN sayfa - "kaldığım yerden devam".
 *   3. YER İMİ kaydı - hiç okunmamışsa ama yer imi varsa.
 *   4. İlk sayfa.
 *
 * 2. ve 3. AYRI kavramlardır (§3): son okunan sayfaya dönmek yer imini
 * oynatmaz, yer imi düğmesi hâlâ kullanıcının işaretlediği sayfayı gösterir.
 */
/**
 * Spotlight'tan gelen kitap istegi. sessionStorage bilincli: tek seferlik bir
 * niyet, kalici tercih degil - okundugu anda silinir ki yeniden acilista
 * kullanicinin kendi son kitabi ezilmesin.
 */
function takeRequestedBookId() {
  try {
    const id = sessionStorage.getItem('ravza-books-open-book');
    if (id) sessionStorage.removeItem('ravza-books-open-book');
    return id || null;
  } catch (_) {
    return null;
  }
}

function resolveStartIndex(book, explicitPosition, totalPages) {
  if (explicitPosition) return findStartIndex(readerPages, explicitPosition);
  const lastRead = readLastRead(book.id, totalPages);
  if (lastRead) return clamp(lastRead.page - 1, 0, Math.max(0, totalPages - 1));
  return findStartIndex(readerPages, readBookProgress(book.id));
}

function findStartIndex(pages, progress) {
  if (!pages.length || !progress) return 0;
  if (pages[0]?.type === 'pdf') {
    const savedPage = Number(progress.savedPage);
    if (Number.isFinite(savedPage) && savedPage > 0) return clamp(savedPage - 1, 0, pages.length - 1);
    const byIndex = Number(progress.pageIndex);
    if (Number.isFinite(byIndex)) return clamp(byIndex, 0, pages.length - 1);
    return clamp((Number(progress.pdfPage) || 1) - 1, 0, pages.length - 1);
  }
  const chapterPages = pages
    .map((page, index) => ({ page, index }))
    .filter(item => item.page.chapterId === progress.chapterId);
  if (!chapterPages.length) return clamp(Number(progress.absIndex) || 0, 0, pages.length - 1);

  if (Number.isFinite(Number(progress.offset))) {
    const offset = Number(progress.offset);
    let match = chapterPages[0].index;
    for (const item of chapterPages) {
      if (item.page.sourceOffset <= offset) match = item.index;
      else break;
    }
    return match;
  }

  const chapterIndex = clamp((Number(progress.pageNum) || 1) - 1, 0, chapterPages.length - 1);
  return chapterPages[chapterIndex].index;
}

function cleanupReader() {
  void releaseWakeLock();
  renderGeneration += 1;
  pdfRenderGeneration += 1;
  lastCradleSize = '';
  cancelPdfRenders();
  teardownScrollReader();
  removeDirectPageCurl?.();
  removeDirectPageCurl = null;
  curlDragging = false;
  resizePending = false;
  readerAbort?.abort();
  readerAbort = null;
  layoutObserver?.disconnect();
  layoutObserver = null;
  readerShellAbort?.abort();
  readerShellAbort = null;
  clearTimeout(controlsTimer);
  clearTimeout(controlsFadeTimer);
  clearTimeout(repaginateTimer);
  clearTimeout(toastTimer);
  clearTimeout(lugatTimer);
  clearTimeout(searchDebounceTimer);
  // Bekleyen "son okunan sayfa" yazımı okuyucu kapanmadan diske düşer,
  // yoksa son çevrilen sayfa kaybolurdu. Yer imi kaydına dokunmaz.
  flushLastReadSave();
  if (pageFlip) {
    const pageFlipUI = pageFlip.getUI?.();
    if (typeof pageFlipUI?.removeHandlers === 'function') pageFlipUI.removeHandlers();
    try { pageFlip.destroy(); } catch (_) {}
    pageFlip = null;
  }
}

function cancelPdfRenders() {
  pdfActivePages = new Set();
  cancelIdle(pdfIdleHandle);
  pdfIdleHandle = 0;
  clearTimeout(pdfWindowTimer);
  pdfWindowTimer = 0;
  clearTimeout(pdfNeighbourTimer);
  pdfNeighbourTimer = 0;
  pendingRenderIndex = -1;
  const pending = [...pdfRenderPromises.values()];
  const cachedPages = [...pdfPageCache.values()];
  for (const task of pdfRenderTasks.values()) {
    try { task.cancel(); } catch (_) {}
  }
  pdfRenderTasks.clear();
  pdfRenderPromises.clear();
  pdfPageCache.clear();
  clearPdfBitmapCache();
  pdfRenderDrain = Promise.allSettled(pending).then(() => {
    for (const page of cachedPages) {
      try { page.cleanup(); } catch (_) {}
    }
  });
}

/** Cache'lenmiş bitmap sayısı: mobilde daha az bellek tutulur. */
function pdfBitmapCacheLimit() {
  if (lowMemoryDevice) return 4;
  return shouldUsePortrait() ? 6 : 10;
}

function disposePdfBitmap(entry) {
  if (!entry) return;
  try { entry.bitmap?.close?.(); } catch (_) {}
  if (entry.canvas) {
    entry.canvas.width = 0;
    entry.canvas.height = 0;
  }
}

function clearPdfBitmapCache() {
  for (const entry of pdfBitmapCache.values()) disposePdfBitmap(entry);
  pdfBitmapCache.clear();
}

/** LRU: en eski kayıt önce düşer (Map ekleme sırasını korur). */
function trimPdfBitmapCache() {
  const limit = pdfBitmapCacheLimit();
  while (pdfBitmapCache.size > limit) {
    const oldestKey = pdfBitmapCache.keys().next().value;
    disposePdfBitmap(pdfBitmapCache.get(oldestKey));
    pdfBitmapCache.delete(oldestKey);
  }
}

async function rememberPdfBitmap(pageNumber, canvas, renderKey) {
  // GECIKMIS YAZIM KORUMASI: createImageBitmap beklenirken okuyucu kapanabilir
  // ya da baska bir kitap acilabilir. O sirada cancelPdfRenders() onbellegi
  // bosaltmis olur; guard olmadan bu yazim onbellegi TEKRAR doldurur. Sonraki
  // kitap ayni olcude acilirsa renderKey de ayni cikar ve paintFromPdfBitmapCache
  // ONCEKI kitabin sayfasini yeni kitabin tuvaline boyar.
  const generation = pdfRenderGeneration;
  const previous = pdfBitmapCache.get(pageNumber);
  if (previous) {
    disposePdfBitmap(previous);
    pdfBitmapCache.delete(pageNumber);
  }
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(canvas);
      if (generation !== pdfRenderGeneration) {
        try { bitmap.close?.(); } catch (_) { /* kapatilamayan bitmap GC'ye kalir */ }
        return;
      }
      pdfBitmapCache.set(pageNumber, { bitmap, renderKey, width: canvas.width, height: canvas.height });
    } else {
      // Safari'nin eski sürümleri: canvas kopyası da işi görür.
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext('2d', { alpha: false })?.drawImage(canvas, 0, 0);
      pdfBitmapCache.set(pageNumber, { canvas: copy, renderKey, width: copy.width, height: copy.height });
    }
  } catch (_) {
    return;
  }
  trimPdfBitmapCache();
}

/** Cache'teki bitmap aynı ölçüdeyse PDF'i yeniden render etmeden geri boyar. */
function paintFromPdfBitmapCache(pageNumber, canvas, renderKey) {
  const entry = pdfBitmapCache.get(pageNumber);
  if (!entry || entry.renderKey !== renderKey) return false;
  const source = entry.bitmap || entry.canvas;
  if (!source) return false;
  canvas.width = entry.width;
  canvas.height = entry.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return false;
  try {
    context.drawImage(source, 0, 0);
  } catch (_) {
    return false;
  }
  // LRU tazeleme: en son kullanılan sona alınır.
  pdfBitmapCache.delete(pageNumber);
  pdfBitmapCache.set(pageNumber, entry);
  return true;
}

async function destroyPdfDocument() {
  pdfRenderGeneration += 1;
  cancelPdfRenders();
  clearThumbnailWork();
  thumbnailCache.clear();
  resetSearchIndex();
  tableOfContents = null;
  pdfFetchController?.abort();
  pdfFetchController = null;
  const loadingTask = pdfLoadingTask;
  const documentToDestroy = pdfDocument;
  pdfLoadingTask = null;
  pdfDocument = null;
  pdfBookId = null;
  pdfPageAspectRatio = 3 / 4;
  if (documentToDestroy) {
    try { await documentToDestroy.destroy(); } catch (_) {}
  } else if (loadingTask) {
    try { await loadingTask.destroy(); } catch (_) {}
  }
}

async function ensurePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    const module = await import(PDFJS_MODULE_URL);
    module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    pdfjsLib = module;
    return module;
  } catch (_) {
    throw new Error('PDF.js yüklenemedi. Yerel kütüphane dosyalarını kontrol edin.');
  }
}

function setAppMode(mode) {
  if (!APP_MODES.has(mode)) return;
  // Ekran kilidi yalnizca GERCEKTEN okurken tutulur; kitapliga donunce birakilir.
  if (mode === 'reading') void requestWakeLock();
  else void releaseWakeLock();
  state.mode = mode;
  const page = document.getElementById('ravzabooks');
  const screen = document.getElementById('screen-reader');
  if (page) page.dataset.appMode = mode;
  if (screen) {
    screen.setAttribute('aria-busy', String(mode === 'loading-book'));
    screen.setAttribute('aria-label', mode === 'library' ? 'Ravza Books kitaplığı' : 'Kitap okuma ekranı');
  }
  document.body.dataset.ravzaBooksMode = mode;
}

function cleanupLibrary() {
  libraryAbort?.abort();
  libraryAbort = null;
  for (const job of coverGenerationJobs.values()) {
    try { job.renderTask?.cancel(); } catch (_) {}
    try { job.loadingTask?.destroy(); } catch (_) {}
    try { job.document?.destroy(); } catch (_) {}
  }
  coverGenerationJobs.clear();
  for (const objectUrl of coverObjectUrls) URL.revokeObjectURL(objectUrl);
  coverObjectUrls.clear();
}

function bookLibraryState(book) {
  const progress = readBookProgress(book.id) || state.readingProgress[book.id] || null;
  const totalPages = Number(book.totalPages) || Number(progress?.totalPages) || Infinity;
  // Son okunan sayfa yer iminden bağımsız; kitaplıkta "Devam Et" bunu izler.
  const lastRead = readLastRead(book.id, totalPages);

  if (!progress?.lastOpenedAt && !lastRead) {
    return { progress: null, lastRead: null, percentage: 0, label: 'Henüz açılmadı', action: 'Okumaya Başla', completed: false };
  }
  if (progress?.completed) {
    return { progress, lastRead, percentage: 100, label: 'Tamamlandı', action: 'Tekrar Oku', completed: true };
  }

  // Yüzde, gerçekten görülen en son sayfadan türetilir; yer imi kaydı yoksa
  // bile "Devam Et" doğru yüzdeyi gösterir.
  const percentage = lastRead && Number.isFinite(totalPages)
    ? clamp((lastRead.page / totalPages) * 100, 0, 100)
    : clamp(Number(progress?.progress) || 0, 0, 100);

  return {
    progress,
    lastRead,
    percentage,
    label: lastRead
      ? `Sayfa ${lastRead.page} · %${percentage.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} okundu`
      : `%${percentage.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} okundu`,
    action: 'Devam Et',
    completed: false,
  };
}

function textCoverMarkup(book) {
  const colors = Array.isArray(book.coverGradient) ? book.coverGradient : ['#5d3d29', '#9b704d'];
  return `
    <span class="library-text-cover" style="--cover-top:${escapeHTML(colors[0])};--cover-bottom:${escapeHTML(colors[1])}" aria-hidden="true">
      <span class="library-text-cover-mark">R</span>
      <strong>${escapeHTML(book.title)}</strong>
      <i></i>
      <small>${escapeHTML(book.author)}</small>
    </span>`;
}

function libraryCoverMarkup(book, index = 0) {
  if (book.type !== 'pdf') return textCoverMarkup(book);
  const source = book.cover ? ` src="${escapeHTML(book.cover)}"` : '';
  const sourceSet = book.coverSrcSet ? ` srcset="${escapeHTML(book.coverSrcSet)}" sizes="(max-width: 520px) 42vw, 220px"` : '';
  const dimensions = Number(book.coverWidth) > 0 && Number(book.coverHeight) > 0
    ? ` width="${Number(book.coverWidth)}" height="${Number(book.coverHeight)}"`
    : '';
  // İlk sıradaki kapaklar hemen, alttakiler tembel yüklenir.
  const priority = index < 4
    ? ' loading="eager" fetchpriority="high"'
    : ' loading="lazy" fetchpriority="low"';
  return `<img class="library-cover-image" data-book-cover="${escapeHTML(book.id)}"${source}${sourceSet}${dimensions}${priority} alt="${escapeHTML(book.title)} kitap kapağı" decoding="async" />`;
}

function renderLibrary() {
  const root = document.getElementById('reader-inner');
  if (!root) return;
  cleanupLibrary();
  setAppMode('library');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  themeMeta?.setAttribute('content', '#efe3d0');
  root.className = 'reader-root library-root';
  root.innerHTML = `
    <main class="library-view" id="ravza-library-main">
      <header class="library-header">
        <button class="library-exit" id="library-exit" type="button" aria-label="Ana sayfaya dön">${ICON.back}<span>Ana sayfa</span></button>
        <div class="library-brand">
          <img src="./assets/branding/ravza-books-logo-256.webp" width="256" height="256" alt="Ravza Books" />
          <div>
            <span>Ravza Books</span>
            <h1>Kitaplığım</h1>
          </div>
        </div>
      </header>

      <section class="library-collection" aria-labelledby="library-collection-title">
        <div class="library-section-heading">
          <h2 id="library-collection-title">Kitaplar</h2>
          <span>${BOOKS.length} kitap</span>
        </div>
        <ul class="library-grid" role="list">
          ${BOOKS.map((book, index) => {
            const status = bookLibraryState(book);
            return `
              <li class="library-book-slot">
                <button class="library-book-card" type="button" data-book-id="${escapeHTML(book.id)}" data-open-position="${status.completed ? 'restart' : 'resume'}" aria-label="${escapeHTML(book.title)}, ${escapeHTML(book.author)}. ${escapeHTML(status.label)}. ${escapeHTML(status.action)}">
                  <span class="library-cover-wrap">
                    ${libraryCoverMarkup(book, index)}
                    <span class="library-cover-shine" aria-hidden="true"></span>
                  </span>
                  <span class="library-shelf" aria-hidden="true"></span>
                  <span class="library-book-copy">
                    <strong>${escapeHTML(book.title)}</strong>
                    <small>${escapeHTML(book.author)}</small>
                    <span class="library-reading-state${status.completed ? ' is-complete' : ''}">
                      <span>${escapeHTML(status.label)}</span>
                      <b>${escapeHTML(status.action)}</b>
                    </span>
                    <span class="library-progress-track" aria-hidden="true"><i style="--book-progress:${status.percentage}%"></i></span>
                  </span>
                </button>
              </li>`;
          }).join('')}
        </ul>
      </section>
    </main>`;

  libraryAbort = new AbortController();
  const { signal } = libraryAbort;
  root.querySelector('#library-exit')?.addEventListener('click', () => window.navigate?.('ana-sayfa'), { signal });
  root.querySelectorAll('.library-book-card').forEach(card => {
    card.addEventListener('click', async () => {
      const book = getBook(card.dataset.bookId);
      if (!book || state.mode !== 'library') return;
      // "restart" -> açık konum verilir; "resume" -> null verilir ve
      // resolveStartIndex son okunan sayfayı seçer (§3/§5).
      const position = card.dataset.openPosition === 'restart'
        ? (book.type === 'pdf' ? { pageIndex: 0, pdfPage: 1 } : { absIndex: 0 })
        : null;
      await openBook(book, position);
    }, { signal });
  });
  root.querySelectorAll('img[data-book-cover]').forEach(image => bindLibraryCover(image, signal));
}

function coverCacheRequest(book) {
  return new Request(new URL(`./assets/books/.cover-cache/${encodeURIComponent(book.id)}.webp`, document.baseURI).href);
}

async function canvasToWebp(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.88));
}

async function generatePdfCover(book) {
  if (coverGenerationJobs.has(book.id)) return coverGenerationJobs.get(book.id).promise;
  const job = { loadingTask: null, renderTask: null, document: null, promise: null };
  job.promise = (async () => {
    const request = coverCacheRequest(book);
    try {
      const cached = await caches.open(COVER_CACHE_NAME).then(cache => cache.match(request));
      if (cached) return cached.blob();
    } catch (_) {}

    const pdfjs = await ensurePdfJs();
    job.loadingTask = pdfjs.getDocument({
      url: new URL(book.file || book.pdfUrl, document.baseURI).href,
      cMapUrl: `${PDFJS_ASSET_ROOT}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ASSET_ROOT}standard_fonts/`,
      wasmUrl: `${PDFJS_ASSET_ROOT}wasm/`,
      iccUrl: `${PDFJS_ASSET_ROOT}iccs/`,
      verbosity: 0,
    });
    job.document = await job.loadingTask.promise;
    const page = await job.document.getPage(Number(book.coverPage) || 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 720 / baseViewport.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    job.renderTask = page.render({ canvas, canvasContext: context, viewport, background: 'rgb(255,255,255)' });
    await job.renderTask.promise;
    const blob = await canvasToWebp(canvas);
    page.cleanup();
    canvas.width = 1;
    canvas.height = 1;
    if (!blob) throw new Error('Kapak görseli üretilemedi.');
    try {
      const cache = await caches.open(COVER_CACHE_NAME);
      await cache.put(request, new Response(blob, { headers: { 'Content-Type': 'image/webp' } }));
    } catch (_) {}
    return blob;
  })().finally(async () => {
    if (job.document) {
      try { await job.document.destroy(); } catch (_) {}
    }
    if (coverGenerationJobs.get(book.id) === job) coverGenerationJobs.delete(book.id);
  });
  coverGenerationJobs.set(book.id, job);
  return job.promise;
}

function bindLibraryCover(image, signal) {
  const book = getBook(image.dataset.bookCover);
  if (!book) return;
  const generate = async () => {
    image.classList.add('is-generating');
    try {
      const blob = await generatePdfCover(book);
      if (signal.aborted || !image.isConnected) return;
      const objectUrl = URL.createObjectURL(blob);
      coverObjectUrls.add(objectUrl);
      // Responsive source candidates keep winning over `src` after the
      // original cover request fails. Remove them so the generated PDF cover
      // is the image the browser actually paints.
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      image.src = objectUrl;
      image.classList.remove('is-generating', 'is-missing');
    } catch (_) {
      if (!signal.aborted) image.classList.add('is-missing');
    }
  };
  image.addEventListener('error', generate, { once: true, signal });
  if (!image.getAttribute('src')) void generate();
}

async function showLibrary() {
  cleanupReader();
  await destroyPdfDocument();
  readerPages = [];
  state.bookId = null;
  state.chapterId = null;
  state.currentIndex = 0;
  state.currentPage = 1;
  state.savedPage = 1;
  renderLibrary();
}

function showReaderLoading(message, progress = null) {
  setAppMode('loading-book');
  const root = document.getElementById('reader-inner');
  if (!root) return;
  const percent = Number.isFinite(progress) ? clamp(Math.round(progress), 0, 100) : null;

  // İndirme ilerlerken tüm ekranı yeniden kurmak yerine yalnızca değişen
  // parçaları güncelle: aksi hâlde her akış parçasında innerHTML yazılıyordu.
  const existing = root.querySelector('.reader-loading');
  if (existing) {
    const text = existing.querySelector('p');
    if (text && text.textContent !== message) text.textContent = message;
    existing.querySelector('.reader-loading-track i')
      ?.style.setProperty('--loading-progress', `${percent ?? 18}%`);
    const label = existing.querySelector('.reader-loading-percent');
    if (percent === null) {
      label?.remove();
    } else if (label) {
      const next = `%${percent}`;
      if (label.textContent !== next) label.textContent = next;
    } else {
      const span = document.createElement('span');
      span.className = 'reader-loading-percent';
      span.textContent = `%${percent}`;
      existing.appendChild(span);
    }
    return;
  }

  // Yeniden sayfalama (döndürme/boyut değişimi) kabuğu baştan basar; açık
  // arama sayfası bu satırda yok oluyor ve sorgu sessizce kayboluyordu.
  // Sorguyu taşı, kitap hazır olunca resumeSearchSheetWhenReady geri yükler.
  if (document.getElementById('rdr-search-sheet')?.open) {
    pendingSearchRestore = document.getElementById('rdr-search-input')?.value ?? '';
  }
  root.className = 'reader-root';
  root.innerHTML = `
    <div class="reader-loading" role="status" aria-live="polite">
      <img class="reader-loading-logo" src="./assets/branding/ravza-books-logo-256.webp" width="256" height="256" alt="Ravza Books" />
      <p>${escapeHTML(message)}</p>
      <span class="reader-loading-track" aria-hidden="true"><i style="--loading-progress:${percent ?? 18}%"></i></span>
      ${percent === null ? '' : `<span class="reader-loading-percent">%${percent}</span>`}
    </div>`;
}

function showReaderError(message, options = {}) {
  setAppMode('error');
  const root = document.getElementById('reader-inner');
  if (!root) return;
  const actionLabel = options.actionLabel || 'Kitaplığa dön';
  const action = typeof options.action === 'function' ? options.action : () => void showLibrary();
  root.className = 'reader-root';
  root.innerHTML = `
    <div class="reader-error" role="alert">
      <img class="reader-error-logo" src="./assets/branding/ravza-books-logo-256.webp" width="256" height="256" alt="Ravza Books" />
      <strong>Kitap açılamadı</strong>
      <p>${escapeHTML(message)}</p>
      <button type="button" id="rdr-error-back">${escapeHTML(actionLabel)}</button>
    </div>`;
  root.querySelector('#rdr-error-back')?.addEventListener('click', action, { once: true });
  document.getElementById('screen-reader')?.setAttribute('aria-busy', 'false');
}

function ensurePageFlip() {
  if (window.St?.PageFlip) return Promise.resolve(true);
  if (pageFlipScriptPromise) return pageFlipScriptPromise;

  pageFlipScriptPromise = new Promise(resolve => {
    const existing = document.querySelector('script[data-ravza-page-flip]');
    const script = existing || document.createElement('script');
    const complete = () => {
      const loaded = Boolean(window.St?.PageFlip);
      if (!loaded) pageFlipScriptPromise = null;
      resolve(loaded);
    };
    const fail = () => {
      script.remove();
      pageFlipScriptPromise = null;
      resolve(false);
    };
    script.addEventListener('load', complete, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existing) {
      script.dataset.ravzaPageFlip = '2.0.7';
      script.src = PAGE_FLIP_SRC;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.St?.PageFlip) {
      complete();
    }
  });
  return pageFlipScriptPromise;
}

function buildReaderShell(book) {
  const root = document.getElementById('reader-inner');
  const isPdf = book.type === 'pdf';
  const progress = readBookProgress(book.id) || state.readingProgress[book.id] || null;
  state.savedPage = progress?.savedPage || (book.type === 'pdf' ? progress?.pdfPage : Number(progress?.pageIndex) + 1) || 1;
  const bookmarked = Boolean(progress?.bookmark);
  root.className = `reader-root${state.accessible ? ' accessible' : ''}`;
  root.dataset.bookType = isPdf ? 'pdf' : 'text';
  root.dataset.spread = shouldUsePortrait() ? 'single' : 'double';
  // CSS sürekli/sayfa modunu bu öznitelikten okur.
  root.dataset.readerMode = isPdf ? state.readerMode : 'page';
  root.innerHTML = `
    <div id="rdr-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>

    <article class="reader-stage" id="rdr-stage" aria-label="${escapeHTML(book.title)} okuma alanı">
      <div class="book-cradle" id="book-cradle">
        <div id="rdr-flipbook"></div>
      </div>
    </article>

    <header class="reader-topbar" aria-label="Okuyucu üst şeridi">
      <button class="reader-back" id="rdr-back" type="button">${ICON.back}<span>Kitaplar</span></button>
      <p class="reader-status" id="rdr-status" aria-live="polite"></p>
    </header>

    <nav class="reader-dock" id="rdr-dock" aria-label="Okuyucu kontrolleri">
      <div class="reader-dock-actions">
        <button class="reader-action reader-dock-row glass-surface" id="rdr-contents-open" type="button" aria-haspopup="dialog" aria-label="İçindekiler">${ICON.contents}<span>Bölümler</span></button>
        <button class="reader-action reader-dock-row glass-surface" id="rdr-search-open" type="button" aria-haspopup="dialog" aria-label="Kitapta ara">${ICON.search}<span>Ara</span></button>
        <button class="reader-action glass-surface${bookmarked ? ' is-active' : ''}" id="rdr-bookmark" type="button" aria-label="Yer imi" aria-pressed="${bookmarked}">${bookmarked ? ICON.bookmarkFill : ICON.bookmark}<span>Yer imi</span></button>
        <button class="reader-action reader-dock-row glass-surface" id="rdr-settings-open" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Temalar ve ayarlar"><span class="reader-dock-aa" aria-hidden="true">Aa</span><span>Ayarlar</span></button>
      </div>

      <!-- Surukleme onizlemesi. Yalnizca ZATEN onbellekte olan kucuk resmi
           gosterir; surukleme sirasinda YENI render tetiklenmez (§2.8).
           Kabugun DISINDA, dock'un ustunde durur: scrubber'in hemen ustune
           konumlandirildiginda aksiyon dugmelerinin uzerine biniyordu. -->
      <span class="reader-scrub-preview" id="rdr-scrub-bubble" aria-hidden="true" hidden>
        <img id="rdr-scrub-thumb" alt="" decoding="async" hidden />
        <span id="rdr-scrub-text"></span>
      </span>

      <label class="reader-scrubber">
        <span class="sr-only">Okuma ilerlemesi</span>
        <input class="progress-range" id="rdr-progress" type="range" min="0" max="0" value="0" step="1" />
      </label>
      <p class="reader-position" id="rdr-progress-label">1 / 1</p>
    </nav>

    ${readerSheetsMarkup(book, isPdf)}

    <div class="lugat-popover" id="rdr-lugat" role="tooltip" aria-hidden="true">
      <p class="lugat-word" id="lugat-word"></p>
      <p class="lugat-meaning" id="lugat-meaning"></p>
    </div>
    <div class="reader-toast" id="rdr-toast" role="status" aria-live="polite"></div>
  `;
  // Araç çubuğu basıldığı ANDA sahibini alır: PDF'in yüklenmesini beklemez,
  // aksi hâlde görünür ama ölü düğmeler oluşuyordu.
  bindReaderShellControls();
  return root;
}

/**
 * Üç okuyucu sayfası (içindekiler / arama / ayarlar).
 *
 * NEDEN <dialog>: js/ui/sheet.js ile aynı gerekçe - "top layer"a çizilir, bu
 * sayfa z-index 9100'de dururken bile üstünde kalır ve z-index yarışına
 * girilmez (§48). Odak tuzağı, Escape ve arka planın inert olması tarayıcıdan
 * gelir. Kapalıyken display:none olduğu için test-launcher'ın "görünür her
 * buton >= 44px" taramasına da hiç görünmez.
 */
function readerSheetsMarkup(book, isPdf) {
  const themeNames = { light: 'Beyaz', sepia: 'Kâğıt', dark: 'Koyu', black: 'Siyah' };
  return `
    <dialog class="reader-sheet ui-dialog--large" id="rdr-contents-sheet" aria-labelledby="rdr-contents-title">
      <div class="reader-sheet-panel glass-surface glass-surface--overlay">
        <header class="reader-sheet-head">
          <h2 id="rdr-contents-title">İçindekiler</h2>
          <button class="reader-sheet-close" type="button" data-close-sheet aria-label="Kapat">${ICON.close}</button>
        </header>
        <div class="reader-sheet-body" id="rdr-contents-body"></div>
      </div>
    </dialog>

    <dialog class="reader-sheet reader-sheet--search ui-dialog--large" id="rdr-search-sheet" aria-labelledby="rdr-search-title">
      <div class="reader-sheet-panel glass-surface glass-surface--overlay">
        <header class="reader-sheet-head">
          <h2 id="rdr-search-title">Kitapta Ara</h2>
          <button class="reader-sheet-close" type="button" data-close-sheet aria-label="Kapat">${ICON.close}</button>
        </header>
        <div class="reader-search-field">
          ${ICON.search}
          <input id="rdr-search-input" type="search" inputmode="search" autocomplete="off"
                 enterkeyhint="search" placeholder="${escapeHTML(book.title)} içinde ara"
                 aria-describedby="rdr-search-state" data-clearable-search />
        </div>
        <p class="reader-search-state" id="rdr-search-state" role="status" aria-live="polite"></p>
        <div class="reader-sheet-body" id="rdr-search-results"></div>
      </div>
    </dialog>

    <dialog class="reader-sheet ui-dialog--medium" id="rdr-settings-sheet" aria-labelledby="rdr-settings-title">
      <div class="reader-sheet-panel glass-surface glass-surface--overlay">
        <header class="reader-sheet-head">
          <h2 id="rdr-settings-title">Temalar ve Ayarlar</h2>
          <button class="reader-sheet-close" type="button" data-close-sheet aria-label="Kapat">${ICON.close}</button>
        </header>
        <div class="reader-sheet-body">
          <section class="reader-settings-group">
            <p class="reader-settings-label">Okuma teması</p>
            <div class="theme-controls" role="group" aria-label="Okuma teması">
              ${READER_THEMES.map(theme => `<button class="theme-btn theme-btn--${theme}${state.theme === theme ? ' selected' : ''}" type="button" data-theme="${theme}" aria-pressed="${state.theme === theme}"><span>${themeNames[theme]}</span></button>`).join('')}
            </div>
            <p class="reader-settings-note">Okuma teması uygulamanın genel temasından bağımsızdır.</p>
          </section>

          <section class="reader-settings-group">
            <p class="reader-settings-label">Okuma modu</p>
            <div class="segmented" role="group" aria-label="Okuma modu">
              <button class="setting-btn mode-btn${state.readerMode === 'page' ? ' selected' : ''}" type="button" data-mode="page" aria-pressed="${state.readerMode === 'page'}">Sayfa</button>
              <button class="setting-btn mode-btn${state.readerMode === 'scroll' ? ' selected' : ''}" type="button" data-mode="scroll" aria-pressed="${state.readerMode === 'scroll'}">Kaydırma</button>
            </div>
          </section>

          ${isPdf ? `
          <section class="reader-settings-group">
            <p class="reader-settings-label">Açık kitap</p>
            <p class="pdf-book-title">${escapeHTML(book.title)}</p>
            <p class="pdf-book-meta">${escapeHTML(book.author)}${book.translator ? ` · ${escapeHTML(book.translator)}` : ''}</p>
            <p class="pdf-book-meta">Orijinal PDF · ${Number(book.totalPages) || 0} sayfa</p>
            <p class="reader-settings-note">Bu kitap sabit sayfa düzenli bir PDF'tir; yazı tipi ve punto kitabın kendi dizgisine aittir, değiştirilemez.</p>
          </section>` : `
          <section class="reader-settings-group">
            <p class="reader-settings-label">Yazı</p>
            <div class="settings-row">
              <span class="setting-name">Yazı boyutu</span>
              <div class="font-controls">
                <button class="setting-btn" id="font-dec" type="button" aria-label="Yazıyı küçült">−</button>
                <span class="font-value" id="font-value">${state.fontSize}px</span>
                <button class="setting-btn" id="font-inc" type="button" aria-label="Yazıyı büyüt">+</button>
              </div>
            </div>
            <div class="settings-row">
              <span class="setting-name">Satır aralığı</span>
              <div class="segmented" aria-label="Satır aralığı seçenekleri">
                ${[1.35, 1.4, 1.45].map(value => `<button class="setting-btn line-height-btn${state.lineHeight === value ? ' selected' : ''}" type="button" data-line-height="${value}">${value === 1.35 ? 'Dar' : value === 1.4 ? 'Normal' : 'Geniş'}</button>`).join('')}
              </div>
            </div>
            <div class="settings-row">
              <span class="setting-name">Erişilebilir okuma</span>
              <label class="switch">
                <input id="accessible-toggle" type="checkbox" ${state.accessible ? 'checked' : ''} />
                <span class="switch-track" aria-hidden="true"></span>
                <span class="sr-only">Erişilebilir okuma</span>
              </label>
            </div>
          </section>`}

          <section class="reader-settings-group">
            <p class="reader-settings-label">Geri bildirim</p>
            <div class="settings-row">
              <span class="setting-name">Sayfa sesi</span>
              <label class="switch">
                <input id="sound-toggle" type="checkbox" ${state.pageSound ? 'checked' : ''} />
                <span class="switch-track" aria-hidden="true"></span>
                <span class="sr-only">Sayfa sesi</span>
              </label>
            </div>
          </section>

          <section class="reader-settings-group">
            <p class="reader-settings-label">Okuma ekranı</p>
            <div class="settings-row${wakeLockSupported ? '' : ' is-unavailable'}">
              <span class="setting-name">Ekranı Açık Tut</span>
              <label class="switch">
                <input id="wake-lock-toggle" type="checkbox" ${state.keepAwake && wakeLockSupported ? 'checked' : ''} ${wakeLockSupported ? '' : 'disabled'} />
                <span class="switch-track" aria-hidden="true"></span>
                <span class="sr-only">Ekranı açık tut</span>
              </label>
            </div>
            ${wakeLockSupported ? '' : '<p class="reader-settings-note">Bu tarayıcı ekranı açık tutmayı desteklemiyor.</p>'}
            ${fullscreenSupported ? `
            <div class="settings-row">
              <span class="setting-name">Tam Ekran</span>
              <label class="switch">
                <input id="fullscreen-toggle" type="checkbox" />
                <span class="switch-track" aria-hidden="true"></span>
                <span class="sr-only">Tam ekran</span>
              </label>
            </div>` : ''}
          </section>

          <section class="reader-settings-group">
            <p class="reader-settings-label">Kitap</p>
            <label class="file-btn" for="txt-book-input">TXT kitap seç</label>
            <input class="file-input" id="txt-book-input" type="file" accept=".txt,text/plain" />
          </section>
        </div>
      </div>
    </dialog>`;
}

function fitPdfBookToStage(aspectRatio = pdfPageAspectRatio) {
  if (state.bookType !== 'pdf') return true;
  // Sürekli modda beşik sabit ölçüye kilitlenmez; sayfalar CSS en-boy oranıyla
  // akar ve kaydırıcı sahnenin tamamını kaplar.
  if (state.readerMode === 'scroll') return readerStageHasPositiveSize();
  const stage = document.getElementById('rdr-stage');
  const cradle = document.getElementById('book-cradle');
  const root = document.getElementById('reader-inner');
  if (!stage || !cradle) return false;

  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 3 / 4;
  const stageStyle = getComputedStyle(stage);
  const horizontalPadding = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const verticalPadding = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
  const availableWidth = stage.clientWidth - (Number.isFinite(horizontalPadding) ? horizontalPadding : 0);
  const availableHeight = stage.clientHeight - (Number.isFinite(verticalPadding) ? verticalPadding : 0);
  // Hidden->visible gecisinde 0x0 olcuyu 1x1'e clamp etmek kitap motorunu bu
  // sahte boyutta kilitliyordu. Parent gercek olcu almadan cradle'a yazma.
  if (availableWidth < 2 || availableHeight < 2) return false;
  const portrait = shouldUsePortrait();
  const pagesAcross = portrait ? 1 : 2;
  // "Sayfaya sigdir" TEK anlama gelir: CONTAIN. Sayfanin dort kenari da
  // sahnenin icinde kalir. Olcek, genislik ve yukseklik olceklerinin
  // KUCUGUdur; boylece hicbir yonde kirpma olmaz. Buyuk olceni secmek
  // (height-first) sayfayi yatayda tasirip metni kesiyordu.
  const scale = Math.min(availableWidth / pagesAcross / ratio, availableHeight);
  const pageHeight = scale;
  const pageWidth = pageHeight * ratio;

  // TELEFON PORTRESI: FIZIKSEL YAPRAK != PDF ICERIGI.
  //
  // Masaustunde yaprak ile PDF ayni dikdortgendir ve bu dogrudur. Telefonda
  // ise 0.75 oranli sayfa 0.46 oranli ekrana sigdirilinca yaprak ekranin
  // yalnizca ortasinda kaliyor; cevirme animasyonu da yalnizca o kucuk
  // dikdortgeni kivirip ust/alt seridi yerinde birakiyordu.
  //
  // Bu yuzden telefonda BESIK sahnenin tamamini alir: St.PageFlip'in fiziksel
  // sayfasi = tam boy yaprak, dolayisiyla kivrilma, golge ve arka yuz butun
  // yuksekligi kullanir. Gercek PDF ise bu yapragin ICINDE contain edilir -
  // .pdf-canvas-frame tuvali kendi orani ile ortalar, tuvalin CSS ve backing
  // olculeri DEGISMEZ (bkz. renderPdfPage'deki Math.min olcegi). Yani tam boy
  // yaprak icin dev bir tuval uretilmez.
  const fullSheet = shouldUseMobileFullSheet();
  const width = fullSheet ? availableWidth : pageWidth * pagesAcross;
  const height = fullSheet ? availableHeight : pageHeight;
  if (width < 2 || height < 2) return false;
  // Yalnızca gerçekten değiştiyse yaz: aksi hâlde bu yazım, cradle'ı gözleyen
  // ResizeObserver'ı yeniden tetikleyip oku-yaz döngüsü kuruyor.
  const size = `${Math.round(width)}x${Math.round(height)}x${ratio.toFixed(4)}`;
  if (size !== lastCradleSize) {
    lastCradleSize = size;
    cradle.style.width = `${width}px`;
    cradle.style.height = `${height}px`;
    cradle.style.setProperty('--pdf-page-aspect', String(ratio));
  }
  if (root) root.dataset.spread = portrait ? 'single' : 'double';
  return true;
}

/**
 * Yakinlastirma carpani. TABAN "genislige sigdir" (sayfa kaydiricinin
 * genisligini kaplar) = 1.
 *
 *   fit-width -> 1
 *   fit-page  -> sayfanin YUKSEKLIGI de kaydiriciya sigsin diye kucultme
 *                orani; hicbir zaman 1'i asmaz (fit-page buyutme degildir).
 *   sayisal   -> dogrudan carpan (1.25 / 1.5 / 2).
 *
 * §2.2 formulunun surekli moddaki karsiligi: sayfa kutusunun EN-BOY orani
 * zaten gercek PDF oranidir (--pdf-page-aspect), bu yuzden
 * min(scaleByWidth, scaleByHeight) tek bir genislik carpanina indirgenir ve
 * en-boy orani hicbir kosulda bozulmaz.
 */
function zoomFactor() {
  // Surekli mod TEK bir olcek kullanir: SAYFAYA SIGDIR.
  // Sayfa, gorunur acikliga (kaydirici yuksekligi eksi kabuk payi) tam sigar;
  // sigmasi icin gereken carpan 1'i asamaz, yani hicbir kosulda kirpma olmaz
  // ve yatay tasma cikmaz. En-boy orani tek carpanla korunur (gerilme yok).
  const scroller = document.getElementById('rdr-flipbook');
  const root = document.getElementById('reader-inner');
  if (!scroller || !root) return 1;
  const width = scroller.clientWidth;
  const style = getComputedStyle(root);
  const chrome = (parseFloat(style.getPropertyValue('--reader-chrome-top')) || 0)
    + (parseFloat(style.getPropertyValue('--reader-chrome-bottom')) || 0);
  const height = scroller.clientHeight - chrome;
  const ratio = Number.isFinite(pdfPageAspectRatio) && pdfPageAspectRatio > 0 ? pdfPageAspectRatio : 3 / 4;
  if (width < 2 || height < 2) return 1;
  return clamp((height * ratio) / width, 0.2, 1);
}

/**
 * Carpani CSS'e yazar. GOSTERIM olcusu buradan gelir; RENDER cozunurlugu
 * degismez - onu renderPdfPage, olculen kutu x devicePixelRatio ile ayrica
 * hesaplar. Ikisi bilincli olarak ayri kalir (§2.1).
 */
function applyReaderZoom() {
  const root = document.getElementById('reader-inner');
  if (!root) return;
  const scrollMode = state.bookType === 'pdf' && state.readerMode === 'scroll';
  root.style.setProperty('--reader-zoom', String(Number((scrollMode ? zoomFactor() : 1).toFixed(4))));
}

function readerStageHasPositiveSize() {
  const stage = document.getElementById('rdr-stage');
  if (!stage) return false;
  const style = getComputedStyle(stage);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const width = stage.clientWidth - (Number.isFinite(horizontalPadding) ? horizontalPadding : 0);
  const height = stage.clientHeight - (Number.isFinite(verticalPadding) ? verticalPadding : 0);
  return width >= 2 && height >= 2;
}

function waitForReaderStageSize(generation, timeout = 5000) {
  if (generation !== renderGeneration) return Promise.resolve(false);
  if (readerStageHasPositiveSize()) return Promise.resolve(true);
  const stage = document.getElementById('rdr-stage');
  if (!stage || typeof ResizeObserver !== 'function') return Promise.resolve(false);

  return new Promise(resolveReady => {
    let settled = false;
    let timer = 0;
    const observer = new ResizeObserver(() => finish(readerStageHasPositiveSize()));
    const finish = ready => {
      if (settled || (!ready && generation === renderGeneration)) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolveReady(Boolean(ready && generation === renderGeneration));
    };
    observer.observe(stage);
    timer = window.setTimeout(() => {
      settled = true;
      observer.disconnect();
      resolveReady(false);
    }, timeout);
    requestAnimationFrame(() => finish(readerStageHasPositiveSize()));
  });
}

/**
 * Canvas render kutusunu bir kez ölçer. Render sırasında DOM ölçmek, animasyon
 * boyunca değişen değerler yüzünden aynı sayfanın tekrar tekrar render
 * edilmesine yol açıyordu; bu yüzden ölçüm yalnızca açılışta ve resize
 * bittikten sonra yapılır.
 */
/**
 * Render kutusunun TEK KAYNAĞI.
 *
 * Kutu, tuvalin gerçekte içine sığacağı kutudur: sayfa çerçevesinin İÇERİK
 * kutusu (border-box eksi dolgu).
 *
 * NEDEN TEK FONKSİYON: Daha önce iki mod iki ayrı ölçüm kullanıyordu.
 * Sayfa modu dolguyu çıkarıyordu (doğru), sürekli mod ise
 * getBoundingClientRect()'i olduğu gibi alıyordu (yanlış). Sonuç 390px'lik
 * telefonda ölçülebilir bir hataydı:
 *   pdfRenderBox.width = 390  ->  canvas.style.width = "390px"
 *   ama çerçevenin içerik kutusu 378px  ->  canvas max-width:100% ile 378'e
 *   sıkışıyor.
 * Yani tuval, bildirdiğinden %3 dar gösteriliyor ve çözünürlüğü (780px)
 * YANLIŞ görüntü genişliğine göre hesaplanıyordu: hem geometri kayması hem
 * gereksiz yumuşama. Artık iki mod da bu fonksiyonu kullanır.
 */
/**
 * Okuyucu kabuğunun kapladığı dikey alanı ölçüp CSS'e bildirir.
 *
 * SORUN: Yüzen kontrol yığını 390x844 telefonda 270px yüksekliğinde ve
 * sayfanın üstünde duruyordu; sayfa 162-682 arasındayken dock 564'ten
 * başlıyor, yani her sayfanın alt ~%23'ü cam panellerin arkasında kalıyordu.
 * "İçerik yuvarlak panellerin arkasına giriyor" görüntüsünün kaynağı buydu.
 *
 * ÇÖZÜM: Sahne, kabuk kadar alanı BAŞTAN ayırır; sayfa da bu küçültülmüş
 * alana sığdırılır. Ölçü sabit kodlanmaz, gerçek kabuktan okunur - dock'un
 * içeriği değişirse ayrılan alan da kendiliğinden değişir.
 *
 * ÖNEMLİ (§26): Kabuk gizlendiğinde yalnızca opacity/transform değişir,
 * düzen yüksekliği değişmez. Bu yüzden ayrılan alan sabittir ve kontroller
 * kaybolurken sayfa ölçeği ZIPLAMAZ.
 */
function measureReaderChrome() {
  const root = document.getElementById('reader-inner');
  if (!root) return;
  const topbar = root.querySelector('.reader-topbar');
  const dock = root.querySelector('.reader-dock');
  // getBoundingClientRect, opacity:0 olsa bile gerçek düzen ölçüsünü verir.
  const top = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 0;
  const bottom = dock ? Math.ceil(dock.getBoundingClientRect().height) : 0;
  // 8px nefes payı: sayfa kenarı kontrolün tam dibine yapışmasın.
  root.style.setProperty('--reader-chrome-top', `${top + 8}px`);
  root.style.setProperty('--reader-chrome-bottom', `${bottom + 8}px`);
}

function measureRenderBox(fallbackMetrics = null) {
  const frame = document.querySelector('.pdf-canvas-frame');
  if (frame) {
    const style = getComputedStyle(frame);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const rect = frame.getBoundingClientRect();
    const width = rect.width - (Number.isFinite(paddingX) ? paddingX : 0);
    const height = rect.height - (Number.isFinite(paddingY) ? paddingY : 0);
    if (width >= 2 && height >= 2) {
      pdfRenderBox = { width, height };
      return true;
    }
  }
  // Çerçeve henüz ölçülemiyorsa (ilk boyamadan önce) düzen ölçüsüne düş.
  if (fallbackMetrics) {
    pdfRenderBox = {
      width: Math.max(1, fallbackMetrics.pageWidth),
      height: Math.max(1, fallbackMetrics.pageHeight),
    };
    return true;
  }
  return false;
}

function getLayoutMetrics() {
  if (state.bookType === 'pdf' && !fitPdfBookToStage()) return null;
  const cradle = document.getElementById('book-cradle');
  if (!cradle) return null;
  const rect = cradle.getBoundingClientRect();
  const portrait = shouldUsePortrait();
  const pageWidth = Math.floor(rect.width / (portrait ? 1 : 2));
  const pageHeight = Math.floor(rect.height);
  if (pageWidth < 1 || pageHeight < 1) return null;
  return {
    portrait,
    pageWidth,
    pageHeight,
    key: `${pageWidth}x${pageHeight}:${portrait ? 'single' : 'double'}:${state.bookType}:${state.fontSize}:${state.lineHeight}:${state.accessible}`,
  };
}

function chapterSourceHTML(chapter) {
  return chapter.pages
    .map(page => page.html || page.contentHtml || '')
    .filter(Boolean)
    .join('\n');
}

function normalizeSourceBlocks(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.childNodes]
    .filter(node => node.nodeType === Node.ELEMENT_NODE || node.textContent.trim())
    .map(node => {
      if (node.nodeType === Node.ELEMENT_NODE) return node;
      const paragraph = document.createElement('p');
      paragraph.textContent = node.textContent.trim();
      return paragraph;
    });
}

function getTextNodes(element) {
  const nodes = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function locateTextOffset(nodes, offset) {
  let traversed = 0;
  for (const node of nodes) {
    const end = traversed + node.data.length;
    if (offset <= end) return { node, offset: clamp(offset - traversed, 0, node.data.length) };
    traversed = end;
  }
  const last = nodes[nodes.length - 1];
  return last ? { node: last, offset: last.data.length } : null;
}

function cloneElementRange(source, start, end) {
  const total = source.textContent.length;
  if (start <= 0 && end >= total) return source.cloneNode(true);
  const textNodes = getTextNodes(source);
  const startPoint = locateTextOffset(textNodes, start);
  const endPoint = locateTextOffset(textNodes, end);
  if (!startPoint || !endPoint) return source.cloneNode(true);

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  const clone = source.cloneNode(false);
  clone.appendChild(range.cloneContents());
  if (start > 0 && clone.tagName === 'P') clone.classList.add('rd-continuation');
  return clone;
}

function getWordBoundaries(text, start) {
  const boundaries = [];
  const expression = /\S+\s*/g;
  let match;
  while ((match = expression.exec(text))) {
    const end = match.index + match[0].length;
    if (end > start) boundaries.push(end);
  }
  if (text.length > start && boundaries.at(-1) !== text.length) boundaries.push(text.length);
  return boundaries;
}

function createPaginationProbe(book, chapter, metrics) {
  const probe = document.createElement('div');
  probe.className = 'pagination-probe';
  probe.style.width = `${metrics.pageWidth}px`;
  probe.style.height = `${metrics.pageHeight}px`;
  probe.innerHTML = `
    <div class="rd-page page-right">
      <div class="rd-page-inner">
        <header class="rd-running-head">
          <p class="rd-book-name">${escapeHTML(book.title)}</p>
          <h1 class="rd-chapter-title">${escapeHTML(chapter.title)}</h1>
        </header>
        <div class="rd-content rd-text" lang="tr"></div>
        <div class="rd-page-num">1</div>
      </div>
    </div>`;
  document.getElementById('reader-inner').appendChild(probe);
  return probe;
}

function paginateChapter(book, chapter, metrics) {
  const probe = createPaginationProbe(book, chapter, metrics);
  const content = probe.querySelector('.rd-content');
  const pages = [];
  let pageStartOffset = null;
  let chapterOffset = 0;

  const fits = () => content.scrollHeight <= content.clientHeight + 1;
  const appendIfFits = node => {
    content.appendChild(node);
    if (fits()) return true;
    node.remove();
    return false;
  };
  const flushPage = () => {
    if (!content.childNodes.length) return;
    pages.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sourceOffset: pageStartOffset ?? 0,
      html: content.innerHTML,
    });
    content.replaceChildren();
    pageStartOffset = null;
  };

  for (const block of normalizeSourceBlocks(chapterSourceHTML(chapter))) {
    const text = block.textContent || '';
    const total = text.length;
    if (!total) {
      if (!appendIfFits(block.cloneNode(true))) {
        flushPage();
        appendIfFits(block.cloneNode(true));
      }
      continue;
    }

    let consumed = 0;
    while (consumed < total) {
      const remainder = cloneElementRange(block, consumed, total);
      if (appendIfFits(remainder)) {
        if (pageStartOffset === null) pageStartOffset = chapterOffset + consumed;
        consumed = total;
        continue;
      }

      const boundaries = getWordBoundaries(text, consumed);
      let low = 0;
      let high = boundaries.length - 1;
      let bestEnd = consumed;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const end = boundaries[middle];
        const candidate = cloneElementRange(block, consumed, end);
        if (appendIfFits(candidate)) {
          bestEnd = end;
          candidate.remove();
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }

      if (bestEnd > consumed) {
        const piece = cloneElementRange(block, consumed, bestEnd);
        content.appendChild(piece);
        if (pageStartOffset === null) pageStartOffset = chapterOffset + consumed;
        consumed = bestEnd;
        flushPage();
        continue;
      }

      if (content.childNodes.length) {
        flushPage();
        continue;
      }

      const forcedEnd = boundaries[0] || total;
      content.appendChild(cloneElementRange(block, consumed, forcedEnd));
      pageStartOffset = chapterOffset + consumed;
      consumed = forcedEnd;
      flushPage();
    }
    chapterOffset += total + 2;
  }

  flushPage();
  probe.remove();
  return pages;
}

function paginateBook(book, metrics) {
  const pages = book.chapters.flatMap(chapter => paginateChapter(book, chapter, metrics));
  if (!pages.length) {
    pages.push({
      chapterId: book.chapters[0]?.id || 'book',
      chapterTitle: book.chapters[0]?.title || 'Kitap',
      sourceOffset: 0,
      html: '<p>Bu kitapta gösterilecek metin bulunamadı.</p>',
    });
  }
  return pages.map((page, index) => ({ ...page, absPageNum: index + 1 }));
}

function renderPageElements(book, pages) {
  const flipbook = document.getElementById('rdr-flipbook');
  flipbook.replaceChildren();
  pages.forEach((page, index) => {
    const element = document.createElement('section');
    element.className = `rd-page ${index % 2 === 0 ? 'page-left' : 'page-right'}`;
    element.dataset.flipIndex = String(index);
    element.setAttribute('aria-label', `Sayfa ${index + 1}`);
    element.innerHTML = `
      <div class="rd-page-inner">
        <header class="rd-running-head">
          <p class="rd-book-name">${escapeHTML(book.title)}</p>
          <h1 class="rd-chapter-title">${escapeHTML(page.chapterTitle)}</h1>
        </header>
        <div class="rd-content rd-text" lang="tr">${page.html}</div>
        <div class="rd-page-num">${index + 1}</div>
      </div>`;
    flipbook.appendChild(element);
  });
}

async function openTextReader(book, position = null) {
  if (!book?.chapters?.length) return;
  if (pdfDocument || pdfLoadingTask) await destroyPdfDocument();
  cleanupReader();
  const generation = renderGeneration;
  state.bookId = book.id;
  state.bookType = 'text';
  localStorage.setItem(STORAGE.lastBook, book.id);
  buildReaderShell(book);
  applyTheme(state.theme);
  applyTypography();
  document.getElementById('screen-reader')?.setAttribute('aria-busy', 'true');

  if (document.fonts?.ready) await document.fonts.ready;
  await nextFrame();
  if (generation !== renderGeneration) return;
  if (!await waitForReaderStageSize(generation)) {
    if (generation === renderGeneration) showReaderError('Okuma alanı hazırlanamadı. Pencereyi görünür tutup yeniden deneyin.');
    return;
  }

  const metrics = getLayoutMetrics();
  if (!metrics || metrics.pageWidth < 1 || metrics.pageHeight < 1) return;
  lastLayoutKey = metrics.key;
  readerPages = paginateBook(book, metrics);
  const startIndex = findStartIndex(readerPages, position || state.readingProgress[book.id]);
  state.currentIndex = startIndex;
  state.chapterId = readerPages[startIndex]?.chapterId || book.chapters[0].id;
  state.pageNum = startIndex + 1;
  renderPageElements(book, readerPages);
  updateReaderUI(startIndex);

  const available = await ensurePageFlip();
  if (generation !== renderGeneration) return;
  if (!available) {
    showReaderError('Yerel sayfa çevirme motoru yüklenemedi. Uygulama dosyalarını kontrol edip kitabı yeniden açın.');
    return;
  }

  const flipbook = document.getElementById('rdr-flipbook');
  pageFlip = new window.St.PageFlip(flipbook, {
    width: metrics.pageWidth,
    height: metrics.pageHeight,
    size: 'fixed',
    startPage: startIndex,
    drawShadow: true,
    flippingTime: PAGE_CURL_CONFIG.flipDuration,
    usePortrait: metrics.portrait,
    startZIndex: 0,
    autoSize: true,
    maxShadowOpacity: state.theme === 'dark'
      ? Math.min(0.78, PAGE_CURL_CONFIG.shadowOpacity)
      : Math.min(0.62, PAGE_CURL_CONFIG.shadowOpacity),
    showCover: false,
    mobileScrollSupport: false,
    clickEventForward: true,
    useMouseEvents: false,
    showPageCorners: false,
    disableFlipByClick: true,
  });

  lastFlipIndex = startIndex;
  pageFlip.on('flip', event => {
    const index = clamp(Number(event.data) || 0, 0, readerPages.length - 1);
    if (index !== lastFlipIndex) playPageSound();
    lastFlipIndex = index;
    updateReaderUI(index);
    scheduleLastReadSave();
  });
  pageFlip.on('changeState', event => {
    const readerRoot = document.getElementById('reader-inner');
    if (readerRoot) readerRoot.dataset.pageFlipState = String(event.data || 'read');
    const flipping = event.data === 'user_fold' || event.data === 'flipping';
    setFlipCompositing(flipping);
    if (flipping) hideControls();
  });
  pageFlip.loadFromHTML(flipbook.querySelectorAll('.rd-page'));

  bindReaderEvents(book);
  installDirectPageCurl();
  document.getElementById('screen-reader')?.setAttribute('aria-busy', 'false');
  setAppMode('reading');
  resumeSearchSheetWhenReady();
  showControls(true);
}

function pdfErrorMessage(error, phase = 'document', bookTitle = 'Kitap') {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '');
  if (phase === 'render') return 'Bu PDF sayfası render edilemedi. Sayfayı yeniden açmayı deneyin.';
  if (/worker|fake worker/i.test(`${name} ${message}`)) return 'PDF worker başlatılamadı. Yerel worker dosyasını kontrol edin.';
  if (/MissingPDF|ResponseException|404|Failed to fetch/i.test(`${name} ${message}`)) return `${bookTitle} PDF dosyası bulunamadı.`;
  if (/InvalidPDF|FormatError|invalid pdf|corrupt/i.test(`${name} ${message}`)) return 'PDF dosyası bozuk veya desteklenmeyen bir yapıda.';
  return `${bookTitle} yüklenemedi. PDF dosyasını ve yerel PDF.js dosyalarını kontrol edin.`;
}

async function fetchPdfBytes(book) {
  const pdfUrl = new URL(book.file || book.pdfUrl, document.baseURI).href;
  const controller = new AbortController();
  pdfFetchController = controller;
  let response;
  try {
    response = await fetch(pdfUrl, {
      signal: controller.signal,
      cache: 'default',
      credentials: 'same-origin',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`${book.title} PDF dosyası indirilemedi.`);
  }
  if (!response.ok) {
    throw new Error(response.status === 404
      ? `${book.title} PDF dosyası bulunamadı.`
      : `${book.title} PDF dosyası indirilemedi (${response.status}).`);
  }

  const total = Math.max(0, Number(response.headers.get('content-length')) || 0);
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    showReaderLoading(`${book.title} hazırlanıyor…`, 100);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastPercent = -1;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      chunks.push(value);
      loaded += value.byteLength;
      // Yüzde gerçekten değiştiyse arayüze dokun.
      const percent = total > 0 ? Math.round((loaded / total) * 100) : null;
      if (percent === null || percent !== lastPercent) {
        lastPercent = percent ?? lastPercent;
        showReaderLoading(`${book.title} hazırlanıyor…`, percent);
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  showReaderLoading(`${book.title} hazırlanıyor…`, 100);
  return bytes;
}

async function loadPdfDocument(book) {
  if (pdfDocument && pdfBookId === book.id) return pdfDocument;
  await destroyPdfDocument();
  const pdfjs = await ensurePdfJs();
  pdfBookId = book.id;
  try {
    const data = await fetchPdfBytes(book);
    if (pdfBookId !== book.id) throw new DOMException('PDF yüklemesi iptal edildi.', 'AbortError');
    pdfFetchController = null;
    pdfLoadingTask = pdfjs.getDocument({
      data,
      cMapUrl: `${PDFJS_ASSET_ROOT}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ASSET_ROOT}standard_fonts/`,
      wasmUrl: `${PDFJS_ASSET_ROOT}wasm/`,
      iccUrl: `${PDFJS_ASSET_ROOT}iccs/`,
      verbosity: 0,
    });
    pdfDocument = await pdfLoadingTask.promise;
    return pdfDocument;
  } catch (error) {
    pdfFetchController = null;
    pdfBookId = null;
    pdfLoadingTask = null;
    if (error?.name === 'AbortError') throw error;
    if (error instanceof Error && /PDF dosyası/.test(error.message)) throw error;
    throw new Error(pdfErrorMessage(error, 'document', book.title));
  }
}

async function readPdfPageAspectRatio(document) {
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const ratio = viewport.width / viewport.height;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 3 / 4;
  } catch (_) {
    return 3 / 4;
  }
}

/* ------------------------------------------------------------------------ */
/* İÇİNDEKİLER (PDF outline)                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Outline hedefini sayfa numarasına çevirir.
 * dest ya adlandırılmış bir hedef (string) ya da doğrudan referans dizisidir.
 */
async function resolveOutlineDestination(document, dest) {
  try {
    const resolved = typeof dest === 'string' ? await document.getDestination(dest) : dest;
    const ref = Array.isArray(resolved) ? resolved[0] : null;
    if (!ref) return null;
    const index = await document.getPageIndex(ref);
    return Number.isInteger(index) ? index + 1 : null;
  } catch (_) {
    return null;
  }
}

/**
 * Outline'ın kullanılabilir olup olmadığı.
 *
 * NEDEN GEREKLİ: Ateşten Gömlek'in PDF outline'ı 5 girdiden oluşuyor ve
 * HEPSİNİN başlığı "Boş Sayfa". Böyle bir listeyi "içindekiler" diye sunmak
 * kullanıcıya yalan söylemek olurdu. Kural özel-durum değil geneldir: anlamlı
 * biçimde ayrışan başlık yoksa outline yok sayılır ve arayüz içindekiler
 * yerine yer imleri/sayfa atlama sunar.
 */
function isUsableOutline(entries) {
  if (!entries || entries.length < 2) return false;
  const titles = new Set(entries.map(entry => entry.title.trim().toLocaleLowerCase('tr-TR')));
  // Tek benzersiz başlık = taşıyıcı bilgi sıfır.
  if (titles.size < 2) return false;
  // Girdilerin yarısından fazlası aynı başlıksa da güvenilmez.
  return titles.size > entries.length / 2;
}

/** Outline ağacını düz listeye indirger (en fazla 2 seviye; daha derini UI'da gürültü). */
async function flattenOutline(document, nodes, level, out) {
  for (const node of nodes) {
    const title = String(node?.title ?? '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const page = await resolveOutlineDestination(document, node.dest);
    if (page) out.push({ title, page, level });
    if (level < 1 && Array.isArray(node.items) && node.items.length) {
      await flattenOutline(document, node.items, level + 1, out);
    }
  }
  return out;
}

/**
 * Kitabın içindekiler tablosu. Outline yoksa veya kullanılamazsa null.
 * Bölüm bilgisi UYDURULMAZ - null dönmek doğru cevaptır.
 */
async function buildTableOfContents(document) {
  let outline;
  try {
    outline = await document.getOutline();
  } catch (_) {
    return null;
  }
  if (!Array.isArray(outline) || !outline.length) return null;

  const entries = await flattenOutline(document, outline, 0, []);
  if (!isUsableOutline(entries)) return null;
  // Sayfaya göre sırala: bazı PDF'lerde outline sırası fiziksel sırayla uyuşmuyor.
  entries.sort((a, b) => a.page - b.page);
  return entries;
}

/** Verilen sayfanın içinde bulunduğu bölüm ve o bölümdeki ilerleme. */
function chapterContextFor(pageNumber, totalPages) {
  if (!tableOfContents?.length) return null;
  let index = -1;
  for (let cursor = 0; cursor < tableOfContents.length; cursor += 1) {
    if (tableOfContents[cursor].page <= pageNumber) index = cursor;
    else break;
  }
  if (index < 0) return null;
  const entry = tableOfContents[index];
  const nextPage = tableOfContents[index + 1]?.page ?? totalPages + 1;
  const chapterLength = Math.max(1, nextPage - entry.page);
  const readInChapter = clamp(pageNumber - entry.page, 0, chapterLength);
  return {
    index,
    title: entry.title,
    startPage: entry.page,
    remainingPages: Math.max(0, nextPage - 1 - pageNumber),
    percent: Math.round((readInChapter / chapterLength) * 100),
  };
}

/**
 * Üst şeritteki bölüm/ilerleme cümlesi.
 * Bölüm bilgisi yoksa kitap geneli yüzdesi gösterilir - ikisi de GERÇEK veri.
 */
function readingStatusText(pageNumber, totalPages) {
  const chapter = chapterContextFor(pageNumber, totalPages);
  if (chapter) {
    if (chapter.remainingPages <= 0) return 'Bölümün sonu';
    return `Bölümde ${chapter.remainingPages} sayfa kaldı`;
  }
  const percent = Math.round((pageNumber / Math.max(1, totalPages)) * 100);
  return `%${percent} tamamlandı`;
}

/* ------------------------------------------------------------------------ */
/* KİTAP İÇİ ARAMA İNDEKSİ                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Metin indeksini parça parça kurar.
 *
 * Neden tembel ve parçalı: 224 sayfalık bir kitabın tüm metnini tek seferde
 * çekmek ana iş parçacığını saniyelerce kilitliyor. İndeks yalnızca kullanıcı
 * aramayı AÇTIĞINDA kurulur ve her SEARCH_INDEX_CHUNK sayfada bir kontrolü
 * tarayıcıya geri verir. Böylece §56'daki "her tuşta DOM'u tarama" yasağı da
 * kendiliğinden sağlanır: arama hazır bir dizide çalışır.
 */
function ensureSearchIndex(bookId, onProgress) {
  // PDF henüz hazır DEĞİLSE önbelleğe alma. Eskiden boş bir indeks kurulup
  // hatırlanıyordu; kitap yüklendikten sonra bile arama "sonuç yok" demeye
  // devam ediyordu ve bu durumdan çıkış yoktu (§128). null = "henüz hazır
  // değil", [] = "gerçekten boş" - çağıran ikisini ayırt edebilmeli.
  if (!pdfDocument) return Promise.resolve(null);
  if (searchIndexBookId === bookId && searchIndexPromise) return searchIndexPromise;
  searchIndexAbort = false;
  searchIndexBookId = bookId;
  searchIndex = [];

  const document_ = pdfDocument;
  // Girdiler ÖNCE yerel diziye toplanır. Modül dizisine doğrudan yazmak,
  // indeksleme sürerken kitap değişirse eski oturumun sayfalarını yeni
  // kitabın indeksine sızdırıyordu (§16).
  const entries = [];
  searchIndexPromise = (async () => {
    const total = document_.numPages;
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      if (searchIndexAbort || pdfDocument !== document_) break;
      try {
        const page = await document_.getPage(pageNumber);
        const textContent = await page.getTextContent();
        entries.push(createPageEntry(pageNumber, flattenTextContent(textContent)));
        // Sayfa nesnesini indeksleme için tutma: render cache'i ayrı yönetiliyor.
        if (!pdfPageCache.has(pageNumber)) page.cleanup();
      } catch (_) {
        // Tek sayfanın metni çıkmadıysa arama o sayfayı atlar; kitap açık kalır.
      }
      if (pageNumber % SEARCH_INDEX_CHUNK === 0) {
        // Sonlanmış oturumun ilerlemesi arayüze yazılmamalı (§130).
        if (searchIndexBookId === bookId && pdfDocument === document_) onProgress?.(pageNumber, total);
        await new Promise(resolve => runWhenIdle(resolve));
      }
    }
    if (searchIndexBookId !== bookId || pdfDocument !== document_) return entries;
    searchIndex = entries;
    onProgress?.(total, total);
    return entries;
  })();
  return searchIndexPromise;
}

function resetSearchIndex() {
  searchIndexAbort = true;
  searchIndexPromise = null;
  searchIndexBookId = null;
  searchIndex = [];
  clearTimeout(searchDebounceTimer);
}

function createPdfPageModels(pageCount) {
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    type: 'pdf',
    pdfPage: index + 1,
    chapterId: `pdf-page-${index + 1}`,
    chapterTitle: `Sayfa ${index + 1}`,
    sourceOffset: index,
    absPageNum: index + 1,
  }));
  pages.push({
    type: 'pdf-back-cover',
    pdfPage: pageCount,
    chapterId: 'pdf-back-cover',
    chapterTitle: 'Arka kapak',
    sourceOffset: pageCount,
    absPageNum: pageCount + 1,
  });
  return pages;
}

function renderPdfPageElements(book, pageCount) {
  const flipbook = document.getElementById('rdr-flipbook');
  // Tüm sayfalar önce fragment'te kurulur; DOM'a tek seferde eklenince
  // 167 ayrı layout geçersizleştirmesi yerine bir tane olur.
  const fragment = document.createDocumentFragment();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const element = document.createElement('section');
    const isCover = pageNumber === 1;
    element.className = `rd-page book-sheet pdf-page${isCover ? ' pdf-cover' : ''}`;
    element.dataset.flipIndex = String(pageNumber - 1);
    element.dataset.pdfPage = String(pageNumber);
    element.dataset.density = isCover ? 'hard' : 'soft';
    element.setAttribute('aria-label', `${book.title}, PDF sayfası ${pageNumber}`);
    element.innerHTML = `
      <div class="pdf-canvas-frame">
        <canvas width="1" height="1" aria-hidden="true"></canvas>
        <p class="pdf-page-status" role="status">Sayfa ${pageNumber} hazırlanıyor…</p>
      </div>`;
    fragment.appendChild(element);
  }

  const backCover = document.createElement('section');
  backCover.className = 'rd-page book-sheet pdf-back-cover';
  backCover.dataset.flipIndex = String(pageCount);
  backCover.dataset.density = 'hard';
  backCover.setAttribute('aria-label', `${book.title}, arka kapak`);
  backCover.innerHTML = `
    <div class="pdf-back-cover-inner">
      <img src="./assets/branding/ravza-books-logo-256.webp" width="256" height="256" alt="Ravza Books" />
      <p>${escapeHTML(book.title)}</p>
      <span>${escapeHTML(book.author)}</span>
    </div>`;
  fragment.appendChild(backCover);
  flipbook.replaceChildren(fragment);
}

function releasePdfPageCanvas(pageNumber) {
  if (pdfActivePages.has(pageNumber)) return;
  const page = pdfPageCache.get(pageNumber);
  if (page) {
    try { page.cleanup(); } catch (_) {}
    pdfPageCache.delete(pageNumber);
  }
  const element = document.querySelector(`.pdf-page[data-pdf-page="${pageNumber}"]`);
  const canvas = element?.querySelector('canvas');
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = '';
    canvas.style.height = '';
    delete canvas.dataset.renderKey;
  }
  element?.classList.remove('is-rendered', 'has-render-error');
  element?.querySelector('[data-page-retry]')?.remove();
  const status = element?.querySelector('.pdf-page-status');
  if (status) {
    status.textContent = `Sayfa ${pageNumber} hazırlanıyor…`;
    status.setAttribute('aria-hidden', 'false');
  }
}

function clearPdfPage(pageNumber) {
  const task = pdfRenderTasks.get(pageNumber);
  if (task) {
    try { task.cancel(); } catch (_) {}
  }
  const pending = pdfRenderPromises.get(pageNumber);
  if (pending) {
    // İptal edilen render bitince yalnızca temizlik yapılır. Sayfa bu arada
    // tekrar pencereye girdiyse render'ı updatePdfRenderWindow zaten kuyruğa
    // alır; buradan yeniden tetiklemek iptal/başlat sarmalına yol açıyordu.
    void pending.finally(() => releasePdfPageCanvas(pageNumber));
    return;
  }
  releasePdfPageCanvas(pageNumber);
}

/** DPR tavanı 2; çok büyük ekranlarda tuval piksel alanı da sınırlanır. */
function pdfOutputScale(viewport) {
  const base = Math.min(window.devicePixelRatio || 1, 2);
  const maxPixels = lowMemoryDevice ? 2_200_000 : 4_500_000;
  const area = Math.max(1, viewport.width * viewport.height);
  if (area * base * base <= maxPixels) return base;
  return Math.max(1, Number(Math.sqrt(maxPixels / area).toFixed(3)));
}

/**
 * Basarisiz sayfaya kendi kurtarma dugmesini ekler.
 *
 * Dugme sayfanin ICINDE durur, global bir hata ekrani acilmaz: 224 sayfalik
 * bir kitapta tek bir sayfanin cizilememesi butun okumayi bitirmemeli.
 * Yeniden deneme, o sayfanin onbellegini temizleyip normal render yolunu
 * yeniden cagirir - ayri bir render yolu YAZILMAZ.
 */
function showPageRetry(element, pageNumber) {
  if (!element || element.querySelector('[data-page-retry]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pdf-page-retry';
  button.dataset.pageRetry = String(pageNumber);
  button.textContent = 'Tekrar Dene';
  button.addEventListener('click', async event => {
    event.stopPropagation();
    button.disabled = true;
    button.textContent = 'Deneniyor…';
    const status = element.querySelector('.pdf-page-status');
    // Onbellekteki bozuk sayfa nesnesini birak ki yeniden istensin.
    const cached = pdfPageCache.get(pageNumber);
    if (cached) {
      try { cached.cleanup(); } catch (_) {}
      pdfPageCache.delete(pageNumber);
    }
    pdfBitmapCache.delete(pageNumber);
    const canvas = element.querySelector('canvas');
    if (canvas) delete canvas.dataset.renderKey;
    element.classList.remove('has-render-error');
    pdfActivePages.add(pageNumber);
    const ok = await renderPdfPage(pageNumber);
    if (ok) {
      button.remove();
      return;
    }
    button.disabled = false;
    button.textContent = 'Tekrar Dene';
    if (status) status.setAttribute('aria-hidden', 'false');
  });
  element.querySelector('.pdf-canvas-frame')?.appendChild(button);
}

async function renderPdfPage(pageNumber) {
  if (!pdfDocument || !pdfActivePages.has(pageNumber)) return false;
  const existing = pdfRenderPromises.get(pageNumber);
  if (existing) {
    readerPerf.inflightJoins += 1;
    return existing;
  }
  const generation = pdfRenderGeneration;
  let operation;
  operation = (async () => {
    const element = document.querySelector(`.pdf-page[data-pdf-page="${pageNumber}"]`);
    const canvas = element?.querySelector('canvas');
    const frame = element?.querySelector('.pdf-canvas-frame');
    const status = element?.querySelector('.pdf-page-status');
    if (!element || !canvas || !frame) return false;

    try {
      const pdfPage = pdfPageCache.get(pageNumber) || await pdfDocument.getPage(pageNumber);
      if (generation !== pdfRenderGeneration || !pdfActivePages.has(pageNumber)) {
        try { pdfPage.cleanup(); } catch (_) {}
        return false;
      }
      pdfPageCache.set(pageNumber, pdfPage);
      const unscaledViewport = pdfPage.getViewport({ scale: 1 });
      // Ölçüm DOM'dan değil, önceden hesaplanmış kutudan gelir: animasyon
      // sırasında değişen clientWidth değerleri render anahtarını oynatıyordu.
      const cssScale = Math.min(
        pdfRenderBox.width / unscaledViewport.width,
        pdfRenderBox.height / unscaledViewport.height,
      );
      const viewport = pdfPage.getViewport({ scale: cssScale });
      const outputScale = pdfOutputScale(viewport);
      const renderKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}@${outputScale}`;
      if (canvas.dataset.renderKey === renderKey && element.classList.contains('is-rendered')) {
        readerPerf.alreadyRendered += 1;
        return true;
      }

      // Yakın geçmişte render edilmiş sayfa: PDF'i yeniden çizmeden geri boya.
      if (paintFromPdfBitmapCache(pageNumber, canvas, renderKey)) {
        readerPerf.cacheHits += 1;
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.dataset.renderKey = renderKey;
        element.classList.remove('has-render-error');
        element.classList.add('is-rendered');
        status?.setAttribute('aria-hidden', 'true');
        return true;
      }

      const backingWidth = Math.max(1, Math.floor(viewport.width * outputScale));
      const backingHeight = Math.max(1, Math.floor(viewport.height * outputScale));
      if (canvas.width === backingWidth && canvas.height === backingHeight) {
        readerPerf.canvasResizeSkips += 1;
      } else {
        readerPerf.canvasResizes += 1;
      }
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const canvasContext = canvas.getContext('2d', { alpha: false });
      readerPerf.renderStarts += 1;
      readerPerf.peakInflight = Math.max(readerPerf.peakInflight, pdfRenderTasks.size + 1);
      perfMark('render:start', pageNumber);
      const renderTask = pdfPage.render({
        canvas,
        canvasContext,
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        background: 'rgb(255, 255, 255)',
      });
      pdfRenderTasks.set(pageNumber, renderTask);
      await renderTask.promise;
      perfMark('render:end', pageNumber);
      if (generation !== pdfRenderGeneration || !pdfActivePages.has(pageNumber)) return false;
      canvas.dataset.renderKey = renderKey;
      element.classList.remove('has-render-error');
      element.classList.add('is-rendered');
      status?.setAttribute('aria-hidden', 'true');
      void rememberPdfBitmap(pageNumber, canvas, renderKey);
      return true;
    } catch (error) {
      if (String(error?.name) === 'RenderingCancelledException') return false;
      // TEK SAYFA HATASI OKUYUCUYU DUSURMEZ (§2.11): yalnizca o sayfa hata
      // durumuna gecer ve kendi "Tekrar Dene" dugmesini gosterir. Kitap,
      // gezinme, arama ve diger sayfalar calismaya devam eder.
      element.classList.add('has-render-error');
      if (status) {
        status.textContent = pdfErrorMessage(error, 'render');
        status.setAttribute('aria-hidden', 'false');
      }
      showPageRetry(element, pageNumber);
      return false;
    } finally {
      pdfRenderTasks.delete(pageNumber);
    }
  })();
  pdfRenderPromises.set(pageNumber, operation);
  try {
    return await operation;
  } finally {
    if (pdfRenderPromises.get(pageNumber) === operation) pdfRenderPromises.delete(pageNumber);
  }
}

/**
 * Görünen sayfalar ve komşuları. Çift sayfa modunda yan yana duran iki sayfa da
 * "görünür" sayılır; pencere toplamı PDF_WINDOW_SIZE ile sınırlıdır.
 */
function pdfWindowPages(pageIndex) {
  const total = pdfDocument.numPages;
  const current = clamp(pageIndex + 1, 1, total);
  const visible = [current];
  // Sürekli modda sayfalar alt alta; "yan sayfa" kavramı yok.
  const spread = !shouldUsePortrait() && state.readerMode === 'page';
  if (spread) {
    /* EŞ SAYFA YÖNÜ - ÖLÇÜLDÜ, VARSAYILMADI.
       PageFlip `showCover: true` ile kapağı (indeks 0) TEK gösterir; sonraki
       spread'ler TEK indeksten başlar: (1,2), (3,4), ... yani sayfa çiftleri
       (2,3), (4,5) ... (20,21), (22,23).
       Tarayıcıda ölçülen gerçek görünüm de bunu doğruluyor:
         currentPage 20 -> [20,21],  22 -> [22,23],  24 -> [24,25]
       Yani TEK indeks = SOL sayfa, eşi bir SONRAKİ sayfadır.
       Eski koşul (`pageIndex % 2 === 0 ? current + 1 : current - 1`) tam
       tersini söylüyordu: 20. sayfa için eşi 21 yerine 19 sayıyordu. Sonuç,
       ön yüklemenin YANLIŞ komşuyu hazırlaması ve ileri geçildiğinde sağdaki
       sayfanın ~900ms boş kalmasıydı. */
    const partner = pageIndex % 2 === 0 ? current - 1 : current + 1;
    if (partner >= 1 && partner <= total && partner !== current) visible.push(partner);
  }

  const ordered = [...visible];
  const lowest = Math.min(...visible);
  const highest = Math.max(...visible);
  const push = pageNumber => {
    if (pageNumber >= 1 && pageNumber <= total && !ordered.includes(pageNumber)) ordered.push(pageNumber);
  };

  /* ÖN YÜKLEME KOMŞU SPREAD'İ BÜTÜN OLARAK ALIR.
     Ölçülen kusur: pencere 5 sayfayla sınırlıyken çift sayfa modunda
     20-21 açıkken sıra [20,21,22,19,18] oluyor ve SONRAKİ spread'in ikinci
     sayfası (23) hiç hazırlanmıyordu. Kullanıcı ileri geçince 23 numaralı
     sayfa ~915ms boyunca boş kalıyor, "Sayfa hazırlanıyor…" görünüyordu.
     Çift sayfada birim SAYFA değil SPREAD'dir: üç spread (önceki, geçerli,
     sonraki) altı sayfa eder, bu yüzden pencere de o modda altıya çıkar. */
  const limit = spread ? PDF_SPREAD_WINDOW_SIZE : PDF_WINDOW_SIZE;

  if (spread) {
    // Öncelik sırası: geçerli spread (zaten `visible`), sonra SONRAKİ spread,
    // sonra ÖNCEKİ spread. updatePdfRenderWindow bu sırayı koruyarak kuyruğa alır.
    push(highest + 1);
    push(highest + 2);
    push(lowest - 2);
    push(lowest - 1);
  } else {
    const neighbourReach = lowMemoryDevice ? 1 : total;
    for (let offset = 1; offset <= neighbourReach && ordered.length < limit; offset += 1) {
      push(highest + offset);
      if (ordered.length >= limit) break;
      push(lowest - offset);
      if (highest + offset > total && lowest - offset < 1) break;
    }
  }
  return { visible, ordered: ordered.slice(0, limit) };
}

async function updatePdfRenderWindow(pageIndex, waitForCurrent = false) {
  if (!pdfDocument) return;
  const { visible, ordered } = pdfWindowPages(pageIndex);
  pdfActivePages = new Set(ordered);
  for (const pageNumber of new Set([...pdfPageCache.keys(), ...pdfRenderPromises.keys()])) {
    if (!pdfActivePages.has(pageNumber)) clearPdfPage(pageNumber);
  }

  const visiblePromises = visible.map(pageNumber => renderPdfPage(pageNumber));
  const neighbours = ordered.filter(pageNumber => !visible.includes(pageNumber));
  // İKİ KADEMELİ ÖN YÜKLEME. Sıra pdfWindowPages'ten gelir; ilk iki komşu
  // kullanıcının bir sonraki hamlesinde neredeyse kesin gerekecek olandır.
  const urgent = neighbours.slice(0, PDF_URGENT_NEIGHBOURS);
  const speculative = neighbours.slice(PDF_URGENT_NEIGHBOURS);
  cancelIdle(pdfIdleHandle);
  pdfIdleHandle = 0;
  clearTimeout(pdfNeighbourTimer);
  // ACİL: görünür sayfa bittiği anda, gecikme/idle beklemeden. Görünür
  // sayfanın arkasına zincirlenir - hiçbir zaman onunla yarışmaz.
  if (urgent.length) {
    void Promise.all(visiblePromises).then(() => {
      for (const pageNumber of urgent) {
        if (pdfActivePages.has(pageNumber)) void renderPdfPage(pageNumber);
      }
    });
  }
  if (speculative.length) {
    // SPEKÜLATİF: uzak komşular. Hemen başlatmak, kullanıcı çevirmeye devam
    // ettiğinde yarıda kesilen render'lara yol açıyor - okuyucu kısa süre
    // sakinleşene kadar bekle, sonra boş ana yerleştir.
    pdfNeighbourTimer = window.setTimeout(() => {
      pdfNeighbourTimer = 0;
      pdfIdleHandle = runWhenIdle(() => {
        pdfIdleHandle = 0;
        for (const pageNumber of speculative) {
          if (pdfActivePages.has(pageNumber)) void renderPdfPage(pageNumber);
        }
      });
    }, PDF_NEIGHBOUR_DELAY_MS);
  }
  // Açılış GÖRÜNÜR sayfayı bekler, acil komşuyu beklemez: okuyucuyu daha geç
  // açmak açılış süresine yazılırdı. Komşu render'ı ~17ms sürüyor, kullanıcı
  // tuşa basana kadar (>100ms) hazır oluyor.
  if (waitForCurrent) await Promise.all(visiblePromises);
}

/**
 * Sayfa geçişi sırasında render penceresini güncellemeyi erteler: çevirme
 * animasyonu bitmeden ağır iş başlatmak kare düşmesine yol açıyor.
 */
function schedulePdfRenderWindow(pageIndex) {
  if (state.bookType !== 'pdf') return;
  pendingRenderIndex = pageIndex;
  clearTimeout(pdfWindowTimer);
  pdfWindowTimer = window.setTimeout(flushPdfRenderWindow, 80);
}

function flushPdfRenderWindow() {
  clearTimeout(pdfWindowTimer);
  pdfWindowTimer = 0;
  if (pendingRenderIndex < 0 || state.bookType !== 'pdf') return;
  const index = pendingRenderIndex;
  pendingRenderIndex = -1;
  void updatePdfRenderWindow(index);
}

/* ------------------------------------------------------------------------ */
/* SÜREKLİ KAYDIRMA MODU                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Sürekli mod, sayfa çevirme motorunu HİÇ kurmaz; aynı .pdf-page DOM'unu
 * dikey bir kaydırıcıya yerleştirir. renderPdfPage() ve render penceresi
 * mantığı olduğu gibi yeniden kullanılır - ikinci bir render motoru yazılmaz.
 */
function teardownScrollReader() {
  scrollObserver?.disconnect();
  scrollObserver = null;
  if (scrollSyncFrame) cancelAnimationFrame(scrollSyncFrame);
  scrollSyncFrame = 0;
  suppressScrollSync = false;
}

/**
 * Kaydırıcıda ekranın ortasına en yakın sayfa "geçerli sayfa"dır.
 *
 * Ölçüm getBoundingClientRect ile yapılır, offsetTop ile DEĞİL: offsetTop en
 * yakın konumlanmış ataya göredir (burada .book-cradle), oysa scrollTop
 * kaydırıcıya aittir. İkisini karıştırmak sayfa dolgusu + ızgara boşluğu
 * kadar kayma üretiyordu ve mod değişiminde okuma konumu sapıyordu.
 */
function activeScrollPage(scroller) {
  const box = scroller.getBoundingClientRect();
  const middle = box.top + box.height / 2;
  let best = 1;
  let bestDistance = Infinity;
  for (const element of scroller.querySelectorAll('.pdf-page')) {
    const rect = element.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = Number(element.dataset.pdfPage) || 1;
    }
  }
  return best;
}

/** Sayfanın üstünü kaydırıcının üstüne hizalar. */
function scrollToPdfPage(scroller, pageNumber, smooth = false) {
  const target = scroller.querySelector(`.pdf-page[data-pdf-page="${pageNumber}"]`);
  if (!target) return;
  const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTo({
    top: scroller.scrollTop + delta,
    behavior: smooth && !reducedMotionQuery.matches ? 'smooth' : 'auto',
  });
}

function setupScrollReader(startIndex) {
  const scroller = document.getElementById('rdr-flipbook');
  const cradle = document.getElementById('book-cradle');
  if (!scroller) return;
  teardownScrollReader();
  cradle?.removeAttribute('style');
  cradle?.style.setProperty('--pdf-page-aspect', String(pdfPageAspectRatio));
  // Olcek, sayfalar olculmeden ONCE yazilmali: measureRenderBox zoomlu kutuyu
  // gormezse tuval yanlis cozunurlukte cizilir.
  applyReaderZoom();

  const onScroll = () => {
    // Programatik kaydırma sırasında geri besleme yapma: aksi hâlde hedef
    // sayfaya giderken aradan geçilen sayfalar konumu ezerdi.
    if (scrollSyncFrame || suppressScrollSync) return;
    scrollSyncFrame = requestAnimationFrame(() => {
      scrollSyncFrame = 0;
      const index = activeScrollPage(scroller) - 1;
      if (index === state.currentIndex) return;
      updateReaderUI(index);
      schedulePdfRenderWindow(index);
      scheduleLastReadSave();
    });
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  scrollObserver = {
    disconnect: () => scroller.removeEventListener('scroll', onScroll),
  };

  // Başlangıç konumu, düzen oturduktan SONRA yazılır: canvas'lar en-boy
  // oranına göre boyutlanmadan ölçmek yanlış ofset veriyordu.
  suppressScrollSync = true;
  requestAnimationFrame(() => {
    scrollToPdfPage(scroller, startIndex + 1, false);
    // Snap'in yerleşmesi için bir kare daha bekle, sonra dinlemeyi aç.
    requestAnimationFrame(() => { suppressScrollSync = false; });
  });
}

/**
 * Okuma modunu değiştirir ve okuma konumunu KORUR (§20: gereksiz yere bölüm
 * başına atlama yok).
 */
function switchReaderMode(mode) {
  if (!READER_MODES.includes(mode) || mode === state.readerMode) return;
  state.readerMode = mode;
  savePrefs();
  document.querySelectorAll('.mode-btn').forEach(item => {
    const selected = item.dataset.mode === mode;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  // Kitabı mevcut konumdan yeniden aç: iki mod farklı sahne kurulumu istiyor.
  const book = getBook(state.bookId);
  if (book) void openBook(book, getCurrentPosition());
}

async function openPdfReader(book, position = null) {
  cleanupReader();
  const generation = renderGeneration;
  state.bookId = book.id;
  state.bookType = 'pdf';
  state.chapterId = 'pdf';
  document.getElementById('screen-reader')?.setAttribute('aria-busy', 'true');
  showReaderLoading(`${book.title} hazırlanıyor…`);

  let available;
  try {
    const results = await Promise.all([loadPdfDocument(book), ensurePageFlip()]);
    available = results[1];
  } catch (error) {
    if (generation === renderGeneration) showReaderError(error.message || pdfErrorMessage(error));
    return;
  }
  if (generation !== renderGeneration) return;
  if (!available) {
    showReaderError('Yerel sayfa çevirme motoru yüklenemedi. Uygulama dosyalarını kontrol edip kitabı yeniden açın.');
    return;
  }

  pdfPageAspectRatio = await readPdfPageAspectRatio(pdfDocument);
  if (generation !== renderGeneration || !pdfDocument) return;

  // İçindekiler PDF outline'ından gelir; yoksa null kalır ve arayüz bunu
  // dürüstçe söyler. Kitap açılışını bloklamaması için hatası yutulur.
  tableOfContents = await buildTableOfContents(pdfDocument).catch(() => null);
  if (generation !== renderGeneration || !pdfDocument) return;

  buildReaderShell(book);
  applyTheme(state.theme);
  applyTypography();
  applyReaderZoom();
  await nextFrame();
  if (generation !== renderGeneration || !pdfDocument) return;
  // Sahne olcusunu ALMADAN ONCE kabuk alanini ayir: aksi halde sayfa,
  // dock'un arkasinda kalacak sekilde buyuk hesaplanir.
  measureReaderChrome();
  await nextFrame();
  if (generation !== renderGeneration || !pdfDocument) return;
  if (!await waitForReaderStageSize(generation)) {
    if (generation === renderGeneration) showReaderError('Okuma alanı hazırlanamadı. Pencereyi görünür tutup yeniden deneyin.');
    return;
  }
  const metrics = getLayoutMetrics();
  if (!metrics || metrics.pageWidth < 1 || metrics.pageHeight < 1) {
    showReaderError('Okuma alanı hazırlanamadı. Ekran yönünü değiştirip yeniden deneyin.');
    return;
  }
  lastLayoutKey = metrics.key;
  readerPages = createPdfPageModels(pdfDocument.numPages);
  const startIndex = resolveStartIndex(book, position, pdfDocument.numPages);
  state.currentIndex = startIndex;
  state.pageNum = Math.min(startIndex + 1, pdfDocument.numPages);
  renderPdfPageElements(book, pdfDocument.numPages);
  measureRenderBox(metrics);
  updateReaderUI(startIndex);

  // Sürekli mod: sayfa çevirme motoru hiç kurulmaz.
  if (state.readerMode === 'scroll') {
    setupScrollReader(startIndex);
    await nextFrame();
    if (generation !== renderGeneration) return;
    // Sayfa modu ile AYNI ölçüm: çerçevenin içerik kutusu.
    measureRenderBox(metrics);
    bindReaderEvents(book);
    await pdfRenderDrain;
    await updatePdfRenderWindow(startIndex, true);
    document.getElementById('screen-reader')?.setAttribute('aria-busy', 'false');
    setAppMode('reading');
    resumeSearchSheetWhenReady();
    showControls(true);
    return;
  }

  const flipbook = document.getElementById('rdr-flipbook');
  pageFlip = new window.St.PageFlip(flipbook, {
    width: metrics.pageWidth,
    height: metrics.pageHeight,
    size: 'fixed',
    startPage: startIndex,
    drawShadow: true,
    flippingTime: PAGE_CURL_CONFIG.flipDuration,
    usePortrait: metrics.portrait,
    startZIndex: 0,
    autoSize: true,
    maxShadowOpacity: state.theme === 'dark'
      ? Math.min(0.78, PAGE_CURL_CONFIG.shadowOpacity)
      : Math.min(0.62, PAGE_CURL_CONFIG.shadowOpacity),
    showCover: true,
    mobileScrollSupport: false,
    clickEventForward: true,
    useMouseEvents: false,
    showPageCorners: false,
    disableFlipByClick: true,
  });
  lastFlipIndex = startIndex;
  pageFlip.on('flip', event => {
    const index = clamp(Number(event.data) || 0, 0, readerPages.length - 1);
    if (index !== lastFlipIndex) playPageSound();
    lastFlipIndex = index;
    updateReaderUI(index);
    scheduleLastReadSave();
    // Arka yuz katmani BURADA, PageFlip'in kendi geri cagrisinda kaldirilir.
    // Durum niteligini izleyen MutationObserver asenkron calisiyor ve oturmus
    // on sayfanin bir kare boyunca hayalet kalmasina yol aciyordu.
    clearMobilePdfPreviousBackside?.();
    // Ağır render işi çevirme animasyonu bittikten sonra yapılır.
    schedulePdfRenderWindow(index);
  });
  pageFlip.on('changeState', event => {
    const readerRoot = document.getElementById('reader-inner');
    if (readerRoot) readerRoot.dataset.pageFlipState = String(event.data || 'read');
    const flipping = event.data === 'user_fold' || event.data === 'flipping';
    setFlipCompositing(flipping);
    if (flipping) hideControls();
    else flushPdfRenderWindow();
  });
  pageFlip.loadFromHTML(flipbook.querySelectorAll('.book-sheet'));
  bindReaderEvents(book);
  installDirectPageCurl();
  await nextFrame();
  if (generation !== renderGeneration) return;
  await pdfRenderDrain;
  await updatePdfRenderWindow(startIndex, true);
  document.getElementById('screen-reader')?.setAttribute('aria-busy', 'false');
  setAppMode('reading');
  resumeSearchSheetWhenReady();
  showControls(true);
}

async function openBook(book, position = null) {
  cleanupLibrary();
  setAppMode('loading-book');
  showReaderLoading(`${book?.title || 'Kitap'} hazırlanıyor…`);
  if (book?.type === 'pdf') return openPdfReader(book, position);
  return openTextReader(book, position);
}

function bookmarkKey(page) {
  if (page?.type === 'pdf') return `pdf:${page.pdfPage}`;
  if (page?.type === 'pdf-back-cover') return 'pdf:back-cover';
  return page ? `${page.chapterId}:${page.sourceOffset}` : '';
}

function isBookmarked(page, fallbackIndex = state.currentIndex) {
  const entries = state.bookmarks[state.bookId] || [];
  return entries.includes(bookmarkKey(page)) || entries.includes(fallbackIndex);
}

function toggleBookmark() {
  const page = readerPages[state.currentIndex];
  if (!page) return;
  const key = bookmarkKey(page);
  const entries = state.bookmarks[state.bookId] || [];
  const existingIndex = entries.findIndex(entry => entry === key || entry === state.currentIndex);
  if (existingIndex >= 0) entries.splice(existingIndex, 1);
  else entries.push(key);
  state.bookmarks[state.bookId] = entries;
  saveBookmarks();
  updateReaderUI(state.currentIndex);
  saveCurrentPage(page, state.currentIndex);
  showToast(existingIndex >= 0 ? 'Yer imi kaldırıldı · kaldığın sayfa kaydedildi' : 'Kaldığın sayfa kaydedildi');
}

function formatPageLabel(index) {
  const page = readerPages[clamp(index, 0, Math.max(0, readerPages.length - 1))];
  if (state.bookType === 'pdf') {
    if (page?.type === 'pdf-back-cover') return 'Arka kapak';
    return `${page?.pdfPage || 1} / ${pdfDocument?.numPages || 1}`;
  }
  return `${clamp(index, 0, Math.max(0, readerPages.length - 1)) + 1} / ${readerPages.length}`;
}

/* ------------------------------------------------------------------------ */
/* EKRANI ACIK TUT (Screen Wake Lock API)                                     */
/* ------------------------------------------------------------------------ */

/**
 * Wake Lock, okurken ekranin sonmesini engeller.
 *
 * DESTEK DURUMU (yetenek tespiti, tarayici adi tahmini DEGIL): Chrome/Edge ve
 * Safari 16.4+ `navigator.wakeLock.request('screen')` destekliyor; Firefox
 * desteklemiyor. Bu yuzden tek dogru test `navigator.wakeLock` varliginin
 * kendisidir - desteklenmeyen tarayicida ayar satiri DURUSTCE kullanilamaz
 * gorunur, sahte bir anahtar gosterilmez.
 *
 * Kilit, sekme gizlenince tarayici tarafindan kendiliginden birakilir; geri
 * donuldugunde tercih hala aciksa yeniden istenir.
 */
const wakeLockSupported = typeof navigator !== 'undefined'
  && 'wakeLock' in navigator
  && typeof navigator.wakeLock?.request === 'function';
let wakeLockSentinel = null;

async function requestWakeLock() {
  if (!wakeLockSupported || !state.keepAwake || wakeLockSentinel) return;
  // Yalnizca sayfa gorunurken istenebilir; aksi halde tarayici reddeder.
  if (document.visibilityState !== 'visible') return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener?.('release', () => { wakeLockSentinel = null; });
  } catch (_) {
    // Izin/politika reddi okumayi bolmemeli; sessizce vazgec.
    wakeLockSentinel = null;
  }
}

async function releaseWakeLock() {
  const sentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  if (!sentinel) return;
  try { await sentinel.release(); } catch (_) {}
}

function handleWakeLockVisibility() {
  if (document.visibilityState === 'visible') void requestWakeLock();
  else void releaseWakeLock();
}

/* ------------------------------------------------------------------------ */
/* TAM EKRAN (Fullscreen API)                                                 */
/* ------------------------------------------------------------------------ */

/**
 * iOS Safari'de iPhone'da `requestFullscreen` YOKTUR (iPad'de vardir). Bu
 * yuzden destek, element uzerindeki metodun varligiyla olculur; yoksa kontrol
 * hic gosterilmez - calismayan bir dugme koymaktansa hic koymamak dogru
 * davranis. PWA "standalone" kurulumu bu platformlarda zaten tam ekran verir.
 */
const fullscreenSupported = typeof document !== 'undefined'
  && (typeof document.documentElement.requestFullscreen === 'function'
    || typeof document.documentElement.webkitRequestFullscreen === 'function');

async function toggleFullscreen() {
  if (!fullscreenSupported) return;
  const root = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
    } else {
      await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    }
  } catch (_) {
    // Kullanici jesti olmadan reddedilebilir; okuma etkilenmez.
  }
  syncFullscreenToggle();
}

function syncFullscreenToggle() {
  const toggle = document.getElementById('fullscreen-toggle');
  if (toggle) toggle.checked = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

/**
 * SCRUBBER ONIZLEMESI (§2.8).
 *
 * Surukleme sirasinda "Sayfa 74 / 224" gosterir. Kucuk resim YALNIZCA
 * thumbnailCache'te hazir varsa cizilir - surukleme sirasinda pdf.js'e tek bir
 * yeni render istegi bile gitmez. Boylece slider hicbir kosulda ana is
 * parcacigini kilitlemez; kullanici Sayfalar sekmesini acmissa onizleme
 * "bedava" gelir, acmamissa yalnizca sayfa numarasi gorunur.
 */
function showScrubPreview(index, percent) {
  const preview = document.getElementById('rdr-scrub-bubble');
  if (!preview) return;
  const page = readerPages[clamp(index, 0, Math.max(0, readerPages.length - 1))];
  const text = document.getElementById('rdr-scrub-text');
  const thumb = document.getElementById('rdr-scrub-thumb');
  if (text) {
    text.textContent = page?.type === 'pdf-back-cover'
      ? 'Arka kapak'
      : `Sayfa ${formatPageLabel(index)}`;
  }
  if (thumb) {
    const cached = state.bookType === 'pdf' && page?.pdfPage
      ? thumbnailCache.get(page.pdfPage)
      : null;
    if (cached) {
      thumb.src = cached;
      thumb.hidden = false;
    } else {
      thumb.removeAttribute('src');
      thumb.hidden = true;
    }
  }
  preview.style.setProperty('--scrub-pct', `${clamp(percent, 0, 100)}%`);
  preview.hidden = false;
}

function hideScrubPreview() {
  const preview = document.getElementById('rdr-scrub-bubble');
  if (preview) preview.hidden = true;
}

function updateReaderUI(index) {
  if (!readerPages.length) return;
  state.currentIndex = clamp(index, 0, readerPages.length - 1);
  const page = readerPages[state.currentIndex];
  state.currentPage = state.bookType === 'pdf'
    ? clamp(Number(page.pdfPage) || pdfDocument?.numPages || 1, 1, pdfDocument?.numPages || 1)
    : state.currentIndex + 1;
  state.chapterId = page.chapterId;
  state.pageNum = state.currentIndex + 1;
  const label = document.getElementById('rdr-progress-label');
  const range = document.getElementById('rdr-progress');
  const bookmark = document.getElementById('rdr-bookmark');
  const live = document.getElementById('rdr-live');
  const progressPct = readerPages.length <= 1
    ? 100
    : (state.currentIndex / (readerPages.length - 1)) * 100;

  if (label) label.textContent = formatPageLabel(state.currentIndex);
  if (range) {
    range.max = String(Math.max(0, readerPages.length - 1));
    range.value = String(state.currentIndex);
    range.style.setProperty('--progress', `${progressPct}%`);
  }
  if (bookmark) {
    const active = isBookmarked(page);
    bookmark.classList.toggle('is-active', active);
    bookmark.setAttribute('aria-pressed', String(active));
    // SVG'yi yalnızca durum değiştiğinde yeniden ayrıştır.
    const iconState = active ? 'on' : 'off';
    if (bookmark.dataset.iconState !== iconState) {
      bookmark.dataset.iconState = iconState;
      bookmark.innerHTML = `${active ? ICON.bookmarkFill : ICON.bookmark}<span>Yer imi</span>`;
    }
  }

  // Üst şerit: yalnızca gerçek veriden türetilmiş tek cümle.
  const totalPages = state.bookType === 'pdf'
    ? (pdfDocument?.numPages || readerPages.length)
    : readerPages.length;
  const status = document.getElementById('rdr-status');
  if (status) status.textContent = readingStatusText(state.currentPage, totalPages);
  const contentsValue = document.getElementById('rdr-contents-value');
  if (contentsValue) {
    const chapter = chapterContextFor(state.currentPage, totalPages);
    contentsValue.textContent = chapter
      ? chapter.title
      : `%${Math.round((state.currentPage / Math.max(1, totalPages)) * 100)}`;
  }
  if (live) live.textContent = state.bookType === 'pdf'
    ? `${page.type === 'pdf-back-cover' ? 'Arka kapak' : `PDF sayfası ${page.pdfPage} / ${pdfDocument?.numPages || 1}`}`
    : `Sayfa ${state.currentIndex + 1} / ${readerPages.length}, ${page.chapterTitle}`;
  const root = document.getElementById('reader-inner');
  if (root) {
    root.dataset.currentPage = String(state.currentPage);
    root.dataset.savedPage = String(state.savedPage);
  }
}

/**
 * Çevirme sürerken sahneye geçici bir sınıf ekler. CSS bu sınıfla yalnızca
 * çevrilen katmana `will-change` verir ve tuval filtrelerini durdurur; sınıf
 * kalkınca GPU katmanları da serbest bırakılır.
 */
function setFlipCompositing(active) {
  document.getElementById('rdr-stage')?.classList.toggle('is-flipping', active);
}

/**
 * Kontrolleri kilitleyen durumlar. Bunlar varken otomatik gizleme ÇALIŞMAZ
 * (§23): açık bir sayfa, kontroller içindeki klavye odağı veya aktif arama.
 */
function controlsAreLocked() {
  if (openSheets().length) return true;
  const active = document.activeElement;
  return Boolean(active && active !== document.body
    && active.closest?.('.reader-dock, .reader-topbar, .reader-sheet'));
}

function showControls(autoHide = true) {
  const root = document.getElementById('reader-inner');
  if (!root) return;
  state.controlsVisible = true;
  root.classList.add('controls-visible');
  clearTimeout(controlsFadeTimer);
  root.classList.remove('controls-fading');
  clearTimeout(controlsTimer);
  if (autoHide && !controlsAreLocked()) {
    controlsTimer = window.setTimeout(hideControls, CONTROLS_HIDE_MS);
  }
}

function hideControls() {
  clearTimeout(controlsTimer);
  // Kullanıcı hâlâ kontrollerle etkileşimdeyse gizleme.
  if (controlsAreLocked()) return;
  state.controlsVisible = false;
  const root = document.getElementById('reader-inner');
  if (!root) return;
  root.classList.remove('controls-visible');
  // GÖRÜNÜRKEN TIKLANABİLİR KALSIN.
  //
  // Sınıf kalkar kalkmaz pointer-events kapanıyordu, ama kabuk sönme
  // animasyonu boyunca ~220ms daha EKRANDA duruyordu. Ölçüldü: opacity
  // 0.27 iken elementFromPoint "Ara" düğmesini değil altındaki
  // .pdf-canvas-frame'i veriyordu. Kullanıcı gördüğü düğmeye basıyor,
  // dokunuş sahneye düşüyor ve yalnızca kontroller geri geliyordu -
  // "bazen çalışıyor" şikâyetinin doğrudan kaynağı buydu.
  root.classList.add('controls-fading');
  clearTimeout(controlsFadeTimer);
  controlsFadeTimer = window.setTimeout(() => {
    document.getElementById('reader-inner')?.classList.remove('controls-fading');
  }, CONTROLS_FADE_MS);
}

function toggleControls() {
  if (state.controlsVisible) hideControls();
  else showControls(true);
}

/* ------------------------------------------------------------------------ */
/* OKUYUCU SAYFALARI (dialog)                                                 */
/* ------------------------------------------------------------------------ */

const SHEET_IDS = Object.freeze(['rdr-contents-sheet', 'rdr-search-sheet', 'rdr-settings-sheet']);

/** Sayfayı açan denetim; kapanışta odak buraya döner. */
let sheetOpener = null;

function openSheets() {
  return SHEET_IDS
    .map(id => document.getElementById(id))
    .filter(sheet => sheet?.open);
}

/**
 * Bir sayfa açar. Aynı anda yalnızca bir tanesi açık kalır (§29/§48: tek
 * sahiplik, üst üste binen overlay yok).
 */
function openSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet || sheet.open) return false;
  // Global koordinator: tema paneli / launcher katmani aciksa kapanir.
  claimOverlay(OVERLAY_IDS.readerSheet);
  for (const other of openSheets()) closeSheet(other);
  // Sayfa açıkken kontroller kaybolmamalı: kullanıcı hâlâ etkileşimde.
  clearTimeout(controlsTimer);
  showControls(false);
  // Odağı ELLE geri veriyoruz. <dialog> kapanışta odağı kendi geri
  // yüklemeye çalışır ama açılış programatik olduğunda (ör. bir sonuç
  // satırından açılan sayfa) güvenilir değil; açanı biz saklıyoruz.
  sheetOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try { sheet.showModal(); } catch (_) { return false; }
  document.getElementById('rdr-settings-open')
    ?.setAttribute('aria-expanded', String(id === 'rdr-settings-sheet'));
  return true;
}

function closeSheet(sheet) {
  if (!sheet?.open) return false;
  try { sheet.close(); } catch (_) {}
  return true;
}

/** Açık olan her sayfayı kapatır. @returns {boolean} bir şey kapandı mı */
function closeSettings() {
  // Kullanıcı KAPATTIYSA bekleyen geri yükleme iptal olur; aksi hâlde sırada
  // bekleyen bir yeniden sayfalama arama sayfasını geri diriltiyordu.
  pendingSearchRestore = null;
  const open = openSheets();
  if (!open.length) return false;
  for (const sheet of open) closeSheet(sheet);
  document.getElementById('rdr-settings-open')?.setAttribute('aria-expanded', 'false');
  // Odağı açan denetime geri ver (§57). Kontroller o sırada gizlenmiş
  // olabileceği için önce görünür yapılır, yoksa odak görünmez bir düğmeye gider.
  showControls(true);
  const opener = sheetOpener;
  sheetOpener = null;
  if (opener?.isConnected) {
    try { opener.focus({ preventScroll: true }); } catch (_) {}
  }
  return true;
}

function openSettings() {
  openSheet('rdr-settings-sheet');
}

/* ------------------------------------------------------------------------ */
/* İÇİNDEKİLER SAYFASI                                                        */
/* ------------------------------------------------------------------------ */

function bookmarkedPagesForCurrentBook() {
  const entries = state.bookmarks[state.bookId] || [];
  return entries
    .map(entry => {
      const match = /^pdf:(\d+)$/.exec(String(entry));
      if (match) return Number(match[1]);
      return Number.isFinite(Number(entry)) ? Number(entry) + 1 : null;
    })
    .filter(page => Number.isFinite(page))
    .sort((a, b) => a - b);
}

/* ------------------------------------------------------------------------ */
/* SAYFA KÜÇÜK RESİMLERİ (thumbnail navigator)                                */
/* ------------------------------------------------------------------------ */

/** Küçük resim genişliği (CSS px). Küçük tutulur: 224 sayfa da olsa ucuz. */
const THUMBNAIL_WIDTH = 108;
/** LRU sınırı. Kapaklar dataURL olarak tutulur, bellek burada sınırlanır. */
const THUMBNAIL_CACHE_LIMIT = 80;
const thumbnailCache = new Map();
const thumbnailTasks = new Map();
let thumbnailObserver = null;

function clearThumbnailWork() {
  thumbnailObserver?.disconnect();
  thumbnailObserver = null;
  for (const task of thumbnailTasks.values()) {
    try { task.cancel(); } catch (_) {}
  }
  thumbnailTasks.clear();
}

function rememberThumbnail(pageNumber, dataUrl) {
  thumbnailCache.delete(pageNumber);
  thumbnailCache.set(pageNumber, dataUrl);
  while (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    thumbnailCache.delete(thumbnailCache.keys().next().value);
  }
}

/**
 * Tek bir küçük resmi üretir.
 *
 * Ana okuma render'ından TAMAMEN ayrı bir yol: kendi tuvali, kendi ölçeği.
 * pdf.js "aynı tuval üzerinde eşzamanlı render" hatasını ancak aynı CANVAS
 * için verir; aynı sayfayı farklı tuvallere çizmek güvenlidir. Bu yüzden
 * burada page.cleanup() ÇAĞRILMAZ - ana render o sayfayı kullanıyor olabilir.
 */
async function renderThumbnail(pageNumber, image) {
  if (!pdfDocument) return;
  const cached = thumbnailCache.get(pageNumber);
  if (cached) {
    image.src = cached;
    image.closest('.reader-thumb')?.classList.add('is-loaded');
    return;
  }
  if (thumbnailTasks.has(pageNumber)) return;

  const generation = pdfRenderGeneration;
  try {
    const page = await pdfDocument.getPage(pageNumber);
    if (generation !== pdfRenderGeneration) return;
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMBNAIL_WIDTH / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const canvasContext = canvas.getContext('2d', { alpha: false });
    const task = page.render({ canvas, canvasContext, viewport, background: 'rgb(255,255,255)' });
    thumbnailTasks.set(pageNumber, task);
    await task.promise;
    if (generation !== pdfRenderGeneration) return;
    const dataUrl = canvas.toDataURL('image/webp', 0.72);
    // Tuvali hemen serbest bırak: 224 sayfalık kitapta bu fark yaratır.
    canvas.width = 0;
    canvas.height = 0;
    rememberThumbnail(pageNumber, dataUrl);
    if (!image.isConnected) return;
    image.src = dataUrl;
    image.closest('.reader-thumb')?.classList.add('is-loaded');
  } catch (error) {
    if (String(error?.name) === 'RenderingCancelledException') return;
    // Tek küçük resmin düşmesi gezinmeyi engellemez (§39).
    image.closest('.reader-thumb')?.classList.add('has-error');
  } finally {
    thumbnailTasks.delete(pageNumber);
  }
}

/** Küçük resim ızgarası. Yalnızca görünür hücreler render edilir (§6). */
function renderThumbnailGrid(container, total) {
  const current = state.currentPage;
  container.innerHTML = `
    <ul class="reader-thumb-grid" role="list">
      ${Array.from({ length: total }, (_, index) => {
        const page = index + 1;
        return `
          <li>
            <button class="reader-thumb${page === current ? ' is-current' : ''}" type="button"
                    data-goto-page="${page}" ${page === current ? 'aria-current="true"' : ''}
                    aria-label="Sayfa ${page}">
              <span class="reader-thumb-frame"><img alt="" data-thumb-page="${page}" decoding="async" /></span>
              <span class="reader-thumb-number">${page}</span>
            </button>
          </li>`;
      }).join('')}
    </ul>`;

  container.querySelectorAll('[data-goto-page]').forEach(button => {
    button.addEventListener('click', () => {
      goToPdfPage(Number(button.dataset.gotoPage));
      closeSettings();
    });
  });

  // Tembel render: yalnızca görünür küçük resimler üretilir.
  clearThumbnailWork();
  thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const image = entry.target;
      thumbnailObserver?.unobserve(image);
      void renderThumbnail(Number(image.dataset.thumbPage), image);
    }
  }, { root: container, rootMargin: '240px 0px' });
  container.querySelectorAll('img[data-thumb-page]').forEach(image => thumbnailObserver.observe(image));

  // Geçerli sayfa görünür olsun.
  container.querySelector('.reader-thumb.is-current')?.scrollIntoView({ block: 'center' });
}

function renderContentsSheet() {
  const body = document.getElementById('rdr-contents-body');
  if (!body) return;
  const total = pdfDocument?.numPages || readerPages.length || 1;
  const currentPage = state.currentPage;
  const chapter = chapterContextFor(currentPage, total);
  const bookmarks = bookmarkedPagesForCurrentBook();

  const hasChapters = Boolean(tableOfContents?.length);

  const chapterList = hasChapters
    ? `<ul class="reader-toc" role="list">
        ${tableOfContents.map((entry, index) => `
          <li>
            <button class="reader-toc-item${index === chapter?.index ? ' is-current' : ''}" type="button"
                    data-goto-page="${entry.page}" data-level="${entry.level}"
                    ${index === chapter?.index ? 'aria-current="true"' : ''}>
              <span class="reader-toc-title">${escapeHTML(entry.title)}</span>
              <span class="reader-toc-page">${entry.page}</span>
            </button>
          </li>`).join('')}
      </ul>`
    : '';

  const bookmarkList = bookmarks.length
    ? `<ul class="reader-toc" role="list">
        ${bookmarks.map(page => `
          <li>
            <button class="reader-toc-item" type="button" data-goto-page="${page}">
              <span class="reader-toc-title">Sayfa ${page}</span>
              <span class="reader-toc-page">${ICON.bookmarkFill}</span>
            </button>
          </li>`).join('')}
      </ul>`
    : '<p class="reader-sheet-empty">Henüz yer imi eklemedin. Okurken yer imi düğmesine basarak bu sayfayı işaretleyebilirsin.</p>';

  // Sekmeler. Bölüm verisi olmayan kitapta ÖLÜ bir "Bölümler" sekmesi
  // gösterilmez (§7); doğrudan Sayfalar açılır.
  const tabs = [
    hasChapters ? { id: 'chapters', label: 'Bölümler' } : null,
    { id: 'pages', label: 'Sayfalar' },
    { id: 'bookmarks', label: 'Yer İmleri' },
  ].filter(Boolean);
  const activeTab = hasChapters ? 'chapters' : 'pages';

  body.innerHTML = `
    <p class="reader-sheet-progress">${escapeHTML(readingStatusText(currentPage, total))} · ${currentPage} / ${total}</p>

    <div class="reader-tabs" role="tablist" aria-label="Gezinme">
      ${tabs.map(tab => `
        <button class="reader-tab${tab.id === activeTab ? ' is-active' : ''}" type="button" role="tab"
                id="rdr-tab-${tab.id}" data-tab="${tab.id}"
                aria-selected="${tab.id === activeTab}" aria-controls="rdr-panel-${tab.id}">${tab.label}</button>`).join('')}
    </div>

    ${hasChapters ? `
    <section class="reader-tab-panel" id="rdr-panel-chapters" role="tabpanel" aria-labelledby="rdr-tab-chapters">
      ${chapterList}
    </section>` : `
    <p class="reader-sheet-empty" id="rdr-no-outline">Bu kitabın PDF dosyasında bölüm bilgisi yok, bu yüzden içindekiler listesi oluşturulamıyor. Sayfalardan veya yer imlerinden gezinebilirsin.</p>`}

    <section class="reader-tab-panel${activeTab === 'pages' ? '' : ' is-hidden'}" id="rdr-panel-pages" role="tabpanel" aria-labelledby="rdr-tab-pages">
      <div class="reader-thumbs" id="rdr-thumbs"></div>
    </section>

    <section class="reader-tab-panel is-hidden" id="rdr-panel-bookmarks" role="tabpanel" aria-labelledby="rdr-tab-bookmarks">
      ${bookmarkList}
    </section>

    <section class="reader-sheet-section">
      <h3 class="reader-sheet-subtitle">Sayfaya git</h3>
      <form class="reader-goto" id="rdr-goto-form">
        <label class="sr-only" for="rdr-goto-input">Sayfa numarası</label>
        <input id="rdr-goto-input" type="number" min="1" max="${total}" inputmode="numeric" placeholder="1 – ${total}" />
        <button type="submit">Git</button>
      </form>
      <p class="reader-goto-error" id="rdr-goto-error" role="alert" hidden></p>
      <button class="reader-restart" type="button" id="rdr-restart">Baştan başla</button>
    </section>`;

  const showTab = tabId => {
    body.querySelectorAll('.reader-tab').forEach(tab => {
      const active = tab.dataset.tab === tabId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    for (const id of ['chapters', 'pages', 'bookmarks']) {
      body.querySelector(`#rdr-panel-${id}`)?.classList.toggle('is-hidden', id !== tabId);
    }
    // Küçük resimler ancak sekme açıldığında üretilir: 224 sayfalık kitapta
    // sayfa açılışında hepsini render etmek kabul edilemez (§59).
    if (tabId === 'pages') {
      const host = body.querySelector('#rdr-thumbs');
      if (host && !host.dataset.ready) {
        host.dataset.ready = '1';
        renderThumbnailGrid(host, total);
      }
    }
  };

  body.querySelectorAll('.reader-tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });
  showTab(activeTab);

  body.querySelectorAll('.reader-toc-item[data-goto-page]').forEach(button => {
    button.addEventListener('click', () => {
      goToPdfPage(Number(button.dataset.gotoPage));
      closeSettings();
    });
  });
  body.querySelector('#rdr-goto-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = body.querySelector('#rdr-goto-input');
    const error = body.querySelector('#rdr-goto-error');
    const raw = String(input?.value ?? '').trim();
    const page = Number(raw);
    // Satır içi doğrulama; alert() KULLANILMAZ (§53).
    if (!raw || !Number.isFinite(page) || !Number.isInteger(page) || page < 1 || page > total) {
      if (error) {
        error.textContent = `1 ile ${total} arasında bir sayfa numarası gir.`;
        error.hidden = false;
      }
      input?.focus();
      return;
    }
    if (error) error.hidden = true;
    goToPdfPage(page);
    closeSettings();
  });
  body.querySelector('#rdr-goto-input')?.addEventListener('input', () => {
    const error = body.querySelector('#rdr-goto-error');
    if (error) error.hidden = true;
  });
  body.querySelector('#rdr-restart')?.addEventListener('click', () => {
    goToPdfPage(1);
    closeSettings();
  });
}

/**
 * Sayfa numarasına gider. Her iki okuma modunda da çalışır ve okuma
 * konumunu kaydeder.
 */
function goToPdfPage(pageNumber) {
  const total = pdfDocument?.numPages || readerPages.length || 1;
  const page = clamp(Number(pageNumber) || 1, 1, total);
  const index = page - 1;
  if (state.readerMode === 'scroll') {
    const scroller = document.getElementById('rdr-flipbook');
    if (scroller) {
      // Hedefe giderken aradaki sayfalar konumu ezmesin.
      suppressScrollSync = true;
      scrollToPdfPage(scroller, page, true);
      window.setTimeout(() => { suppressScrollSync = false; }, 600);
    }
    updateReaderUI(index);
    schedulePdfRenderWindow(index);
  } else if (pageFlip?.getState() === 'read') {
    pageFlip.turnToPage(index);
  } else {
    updateReaderUI(index);
    schedulePdfRenderWindow(index);
  }
  scheduleLastReadSave();
  // YER İMİ bilerek kaydedilmez: içindekilerden/aramadan/ilerleme barından
  // atlamak kullanıcının işaretlediği sayfayı oynatmamalı (yukarıdaki
  // "elle kaydet" modeli). Kaydetmek için yer imi düğmesi kullanılır.
}

/* ------------------------------------------------------------------------ */
/* KİTAP İÇİ ARAMA SAYFASI                                                    */
/* ------------------------------------------------------------------------ */

function setSearchState(message) {
  const element = document.getElementById('rdr-search-state');
  if (element) element.textContent = message;
}

function renderSearchResults(results, query) {
  const container = document.getElementById('rdr-search-results');
  if (!container) return;
  if (!results.length) {
    container.innerHTML = `<p class="reader-sheet-empty">“${escapeHTML(query)}” için sonuç bulunamadı.</p>`;
    return;
  }
  container.innerHTML = `
    <ul class="reader-search-list" role="list">
      ${results.map(result => `
        <li>
          <button class="reader-search-item" type="button" data-goto-page="${result.pageNumber}">
            <span class="reader-search-snippet">${result.snippet.truncatedStart ? '…' : ''}${escapeHTML(result.snippet.before)}<mark>${escapeHTML(result.snippet.match)}</mark>${escapeHTML(result.snippet.after)}${result.snippet.truncatedEnd ? '…' : ''}</span>
            <span class="reader-search-page">Sayfa ${result.pageNumber}</span>
          </button>
        </li>`).join('')}
    </ul>`;
  container.querySelectorAll('[data-goto-page]').forEach(button => {
    button.addEventListener('click', () => {
      goToPdfPage(Number(button.dataset.gotoPage));
      closeSettings();
    });
  });
}

async function runBookSearch(query) {
  if (!isSearchableQuery(query)) {
    setSearchState('En az 2 karakter yaz.');
    const container = document.getElementById('rdr-search-results');
    if (container) container.innerHTML = '';
    return;
  }
  setSearchState('Aranıyor…');
  const bookId = state.bookId;
  const index = await ensureSearchIndex(bookId, (done, total) => {
    setSearchState(done < total ? `Kitap taranıyor… %${Math.round((done / total) * 100)}` : 'Aranıyor…');
  });
  // Kitap henüz açılmadıysa sessizce "sonuç yok" deme; durumu dürüst söyle.
  if (index === null) {
    setSearchState('Kitap hazırlanıyor…');
    return;
  }
  // Arama sürerken kullanıcı başka bir kitaba geçmiş olabilir: eski sonucu
  // yeni kitabın arayüzüne yazma (§73).
  if (state.bookId !== bookId) return;
  // İndeksleme sürerken kullanıcı sorguyu değiştirmiş olabilir.
  const input = document.getElementById('rdr-search-input');
  if (input && input.value.trim() !== String(query).trim()) return;
  const results = searchBookIndex(index, query, { limit: SEARCH_RESULT_LIMIT });
  // Liste tavana dayandiysa "80 sonuç" demek yaniltici olur - kitapta daha
  // fazlasi olabilir. Tavanda "80+" denir.
  const capped = results.length >= SEARCH_RESULT_LIMIT;
  setSearchState(results.length
    ? `${results.length}${capped ? '+' : ''} sonuç`
    : 'Sonuç yok');
  renderSearchResults(results, query);
}

function openSearchSheet() {
  // Zaten açıksa ikinci bir dialog açılmaz; kapalıysa HER ZAMAN açılır (§139).
  const sheet = document.getElementById('rdr-search-sheet');
  if (sheet?.open) { document.getElementById('rdr-search-input')?.focus(); return; }
  if (!openSheet('rdr-search-sheet')) return;
  const input = document.getElementById('rdr-search-input');
  const bookId = state.bookId;
  // Kitap hâlâ yükleniyorsa dialog yine AÇILIR (§11): kullanıcı yazabilir,
  // indeks hazır olduğunda sorgu kendiliğinden çalışır.
  if (!pdfDocument) setSearchState('Kitap hazırlanıyor…');
  else {
    setSearchState('');
    // İndeksi arka planda şimdiden kur: kullanıcı yazarken hazır olsun.
    void ensureSearchIndex(bookId, (done, total) => {
      if (state.bookId !== bookId) return;
      if (done < total) setSearchState(`Kitap taranıyor… %${Math.round((done / total) * 100)}`);
    });
  }
  input?.focus();
}

/**
 * Kitap yüklenmeden Ara açıldıysa, hazır olur olmaz indekslemeyi başlat ve
 * kullanıcının o sırada yazdığı sorguyu çalıştır - tekrar yazmasın (§20).
 */
function resumeSearchSheetWhenReady() {
  if (!pdfDocument) return;
  const sheet = document.getElementById('rdr-search-sheet');
  // Yeniden sayfalama arama sayfasını kapattıysa aynı sorguyla geri getir.
  if (pendingSearchRestore !== null) {
    const restore = pendingSearchRestore;
    pendingSearchRestore = null;
    openSearchSheet();
    const input = document.getElementById('rdr-search-input');
    if (input && restore) {
      input.value = restore;
      void runBookSearch(restore);
    }
    return;
  }
  if (!sheet?.open) return;
  const input = document.getElementById('rdr-search-input');
  const pending = input?.value.trim() || '';
  if (pending) void runBookSearch(pending);
  else openSearchSheet();
}

/* ------------------------------------------------------------------------ */
/* PAYLAŞ                                                                     */
/* ------------------------------------------------------------------------ */

function scheduleRepagination(delay = 260) {
  clearTimeout(repaginateTimer);
  const position = getCurrentPosition();
  const bookId = state.bookId;
  repaginateTimer = window.setTimeout(() => {
    const book = getBook(bookId);
    if (book) openBook(book, position);
  }, delay);
}

function safeFlip(direction, corner = 'top') {
  // Sürekli modda "çevirme" yok; komşu sayfaya kaydırılır.
  if (state.readerMode === 'scroll') {
    const next = state.currentIndex + (direction === 'next' ? 1 : -1);
    if (next < 0 || next >= readerPages.length) return;
    goToPdfPage(next + 1);
    return;
  }
  if (!pageFlip || pageFlip.getState() !== 'read') return;
  const index = state.currentIndex;
  if (direction === 'next' && index < readerPages.length - 1) pageFlip.flipNext(corner);
  if (direction === 'prev' && index > 0) flipPrevious(corner);
}

function flipPrevious(corner = 'top') {
  if (!pageFlip) return;
  prepareMobilePdfPreviousBackside?.();
  const rect = pageFlip.getBoundsRect();
  pageFlip.getFlipController().flip({
    x: rect.left + 10,
    y: corner === 'bottom' ? rect.height - 2 : 1,
  });
}

function installDirectPageCurl() {
  removeDirectPageCurl?.();
  removeDirectPageCurl = null;
  if (!pageFlip) return;

  const ui = pageFlip.getUI?.();
  const surface = ui?.getDistElement?.();
  const interactionOwner = document.getElementById('rdr-stage');
  if (!surface || !interactionOwner) return;

  try { ui.removeHandlers?.(); } catch (_) {}
  surface.style.touchAction = 'none';
  surface.style.overscrollBehavior = 'none';
  surface.style.webkitUserSelect = 'none';
  surface.style.webkitTouchCallout = 'none';

  // St.PageFlip portre/ileri harekette gorunen sayfayi cloneNode(true) ile
  // gecici olarak kopyalar. Canvas dugumu kopyalansa da piksel tamponu
  // kopyalanmadigi icin kivrimin arka yuzu bos gorunur. Mobil PDF sayfa
  // modunda bu tek gecici canvas'i ayni fiziksel sayfanin mevcut bitmap'iyle
  // bir kez boyar, yatay ters cevirir ve soluklastiririz. Boylece goruntu,
  // sayfanin arkasindan gorulen baski gibi davranir. Animasyon karelerinde
  // hicbir PDF render'i, bitmap kopyasi veya piksel okuma yoktur.
  const shouldHydrateMobilePdfBackside = state.bookType === 'pdf'
    && state.readerMode === 'page'
    && window.innerWidth < 768
    && shouldUsePortrait();

  const styleAsPrintedBackside = (page, canvas, pageNumber) => {
    canvas.style.transformOrigin = 'center center';
    canvas.style.transform = 'scaleX(-1)';
    // Arka yuz baskisi: yaprak ARTIK opak oldugu icin bu opaklik alttaki
    // sayfayla degil kagitla harmanlanir. 0.52 iki okunur metin katmani
    // uretiyordu; hayalet baski icin dogru aralik 0.12-0.28.
    canvas.style.opacity = '0.22';
    page.dataset.mobileFlipBacksidePage = String(pageNumber);
  };

  const hydrateMobilePdfBackside = temporaryPage => {
    if (!shouldHydrateMobilePdfBackside
      || !(temporaryPage instanceof Element)
      || !temporaryPage.matches('.pdf-page[data-pdf-page]')) return;

    const frontPageNumber = Number(temporaryPage.dataset.pdfPage);
    if (!Number.isInteger(frontPageNumber)
      || frontPageNumber < 1
      || frontPageNumber > (pdfDocument?.numPages || 0)) return;

    // Observer yalnizca sonradan eklenen dugumleri gorur; yine de ayni PDF
    // sayfasindan iki tane bulunmasini isteyerek normal sayfayi degistirmeyiz.
    const frontCopies = surface.querySelectorAll(`.pdf-page[data-pdf-page="${frontPageNumber}"]`);
    if (frontCopies.length < 2) return;

    const sourcePage = [...surface.querySelectorAll(`.pdf-page[data-pdf-page="${frontPageNumber}"]`)]
      .find(element => element !== temporaryPage && element.classList.contains('is-rendered'));
    const sourceCanvas = sourcePage?.querySelector('canvas');
    const cached = pdfBitmapCache.get(frontPageNumber);
    const cachedSource = cached?.bitmap || cached?.canvas;
    const source = sourceCanvas?.width > 1 && sourceCanvas?.height > 1
      ? sourceCanvas
      : cachedSource;
    const width = sourceCanvas?.width > 1 ? sourceCanvas.width : cached?.width;
    const height = sourceCanvas?.height > 1 ? sourceCanvas.height : cached?.height;
    const targetCanvas = temporaryPage.querySelector('canvas');
    if (!source || !targetCanvas || !(width > 1) || !(height > 1)) return;

    targetCanvas.width = width;
    targetCanvas.height = height;
    if (sourceCanvas) {
      targetCanvas.style.width = sourceCanvas.style.width;
      targetCanvas.style.height = sourceCanvas.style.height;
    }
    const context = targetCanvas.getContext('2d', { alpha: false });
    if (!context) return;
    try {
      context.drawImage(source, 0, 0);
    } catch (_) {
      return;
    }

    targetCanvas.dataset.renderKey = sourceCanvas?.dataset.renderKey || cached?.renderKey || '';
    styleAsPrintedBackside(temporaryPage, targetCanvas, frontPageNumber);
    temporaryPage.setAttribute('aria-hidden', 'true');
    temporaryPage.classList.add('is-rendered');
    temporaryPage.querySelector('.pdf-page-status')?.setAttribute('aria-hidden', 'true');
  };

  const mobilePdfBacksideObserver = shouldHydrateMobilePdfBackside
    ? new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) hydrateMobilePdfBackside(node);
      }
    })
    : null;
  mobilePdfBacksideObserver?.observe(surface, { childList: true });

  /* GERI CEVIRMEDE ARKA YUZ - AYRI YUZEY, GERCEK SAYFA DEGIL.
     Ileri cevirmede St.PageFlip sayfayi KOPYALIYOR ve arka yuz o kopyaya
     boyaniyor; gercek sayfalar temiz kaliyor. Geri cevirmede kopya YOKTUR ve
     eski kod arka yuzu, birazdan ON YUZ olacak gercek sayfanin tuvaline
     uyguluyordu (scaleX(-1) + opacity .22), sonra durum 'read' olunca geri
     aliyordu. Olculdu: 440x956'da geri cevirme sirasinda aynalanmis sayfa
     ekranda 274px genisliginde gorunuyor ve acik temada durum 'read' olduktan
     SONRA bile on sayfa bir kare boyunca opacity .22 kaliyordu (yani ters/
     hayalet gorunum on yuze sizyordu).
     Cozum, ileri yoldaki sozlesmenin aynisi: arka yuz KENDI yuzeyine cizilir.
     Katman opak kagit (div zemini) + aynalanmis soluk baski (tuval) olarak
     kurulur - bugunku gorunumun birebir ayni bilesimi. Gercek tuvale hicbir
     zaman dokunulmaz, dolayisiyla temizlik gecikse bile ON YUZ AYNALANAMAZ. */
  let previousBackside = null;
  const restorePreviousBackside = () => {
    if (!previousBackside) return;
    previousBackside.layer.remove();
    const { page, marker } = previousBackside;
    if (marker === null) delete page.dataset.mobileFlipBacksidePage;
    else page.dataset.mobileFlipBacksidePage = marker;
    previousBackside = null;
  };
  const preparePreviousBackside = () => {
    if (!shouldHydrateMobilePdfBackside || previousBackside || !pageFlip) return;
    const previousIndex = pageFlip.getCurrentPageIndex() - 1;
    if (previousIndex < 0) return;
    const page = pageFlip.getPage(previousIndex)?.getElement?.();
    const frame = page?.querySelector?.('.pdf-canvas-frame');
    const source = page?.querySelector?.('canvas');
    const pageNumber = Number(page?.dataset?.pdfPage);
    if (!frame || !source || source.width < 2 || source.height < 2 || !Number.isInteger(pageNumber)) return;

    const print = document.createElement('canvas');
    print.width = source.width;
    print.height = source.height;
    print.style.width = source.style.width;
    print.style.height = source.style.height;
    const context = print.getContext('2d', { alpha: false });
    if (!context) return;
    // HAM pikseller kopyalanir: tema filtresi CSS'te, tuvalde degil. Boylece
    // katman da gercek sayfayla ayni filtre yolundan gecer.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, print.width, print.height);
    try {
      context.drawImage(source, 0, 0);
    } catch (_) {
      return;
    }

    // Baskinin hangi render'dan geldigi katmanda da izlenebilir kalir.
    print.dataset.renderKey = source.dataset.renderKey || '';
    const layer = document.createElement('div');
    layer.className = 'pdf-backside-print';
    layer.setAttribute('aria-hidden', 'true');
    // Opak kagit: alttaki gercek tuvali TAMAMEN orter. Zemin zaten temanin
    // kagit rengidir; div oldugu icin tuval filtresi ikinci kez uygulanmaz.
    layer.style.background = getComputedStyle(frame).backgroundColor;
    layer.appendChild(print);
    frame.appendChild(layer);

    previousBackside = { page, layer, marker: page.getAttribute('data-mobile-flip-backside-page') };
    page.dataset.mobileFlipBacksidePage = String(pageNumber);
  };
  prepareMobilePdfPreviousBackside = preparePreviousBackside;
  clearMobilePdfPreviousBackside = restorePreviousBackside;

  const readerRoot = document.getElementById('reader-inner');
  const pageFlipStateObserver = shouldHydrateMobilePdfBackside && readerRoot
    ? new MutationObserver(() => {
      if (readerRoot.dataset.pageFlipState === 'read') restorePreviousBackside();
    })
    : null;
  pageFlipStateObserver?.observe(readerRoot, { attributes: true, attributeFilter: ['data-page-flip-state'] });

  let gesture = null;
  let centerTap = null;
  let queuedPoint = null;
  let moveFrame = 0;
  let suppressClickUntil = 0;

  const getMetrics = () => {
    const surfaceRect = surface.getBoundingClientRect();
    const stageRect = interactionOwner.getBoundingClientRect();
    const bounds = pageFlip.getBoundsRect();
    const pageWidth = Math.max(1, bounds?.pageWidth || (shouldUsePortrait() ? surfaceRect.width : surfaceRect.width / 2));
    const edgeBasis = Math.min(pageWidth, stageRect.width);
    const edgePx = Math.min(
      PAGE_CURL_CONFIG.maximumEdgePx,
      Math.max(PAGE_CURL_CONFIG.minimumEdgePx, edgeBasis * PAGE_CURL_CONFIG.edgeGrabRatio),
    );
    return { surfaceRect, stageRect, bounds, pageWidth, edgePx };
  };

  // Ölçüm yalnızca pointerdown'da alınır; hareket sırasında layout okunmaz.
  const localPoint = (event, metrics) => ({
    x: clamp(event.clientX - metrics.surfaceRect.left, -metrics.pageWidth, metrics.surfaceRect.width + metrics.pageWidth),
    y: clamp(event.clientY - metrics.surfaceRect.top, 0, metrics.surfaceRect.height),
  });

  const isInteractiveTarget = target => Boolean(
    target instanceof Element
      && target.closest('a, button, input, textarea, select, label, [contenteditable="true"], .rd-accent'),
  );

  const detectDirection = (point, metrics) => {
    const count = pageFlip.getPageCount();
    const current = pageFlip.getCurrentPageIndex();
    const nearLeft = point.x <= metrics.edgePx;
    const nearRight = point.x >= metrics.surfaceRect.width - metrics.edgePx;
    if (nearRight && current < count - 1) return 'forward';
    if (nearLeft && current > 0) return 'back';
    return null;
  };

  const pushSample = (point, time) => {
    if (!gesture) return;
    gesture.samples.push({ x: point.x, time });
    const cutoff = time - PAGE_CURL_CONFIG.sampleWindowMs;
    while (gesture.samples.length > 2 && gesture.samples[0].time < cutoff) gesture.samples.shift();
  };

  const velocityX = () => {
    if (!gesture || gesture.samples.length < 2) return 0;
    const first = gesture.samples[0];
    const last = gesture.samples.at(-1);
    return (last.x - first.x) / Math.max(1, last.time - first.time);
  };

  const flushQueuedMove = () => {
    moveFrame = 0;
    if (!gesture || !queuedPoint) return;
    const point = queuedPoint;
    queuedPoint = null;
    try { pageFlip.userMove(point, true); } catch (_) {}
  };

  const scheduleMove = point => {
    queuedPoint = point;
    if (!moveFrame) moveFrame = requestAnimationFrame(flushQueuedMove);
  };

  const releaseLayoutLock = () => {
    curlDragging = false;
    if (resizePending) {
      resizePending = false;
      scheduleRepagination(40);
    }
  };

  const resetCenterGesture = () => {
    centerTap = null;
    interactionOwner.classList.remove('is-touching');
    releaseLayoutLock();
  };

  const resetGesture = () => {
    if (moveFrame) cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    queuedPoint = null;
    gesture = null;
    document.getElementById('rdr-stage')?.classList.remove('is-touching', 'is-page-curling');
    releaseLayoutLock();
  };

  const releaseCapture = pointerId => {
    try {
      if (surface.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId);
    } catch (_) {}
  };

  const onPointerDown = event => {
    if (!surface.contains(event.target)) return;
    if (!pageFlip || gesture || centerTap || event.isPrimary === false || isInteractiveTarget(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pageFlip.getState() !== 'read') return;

    const metrics = getMetrics();
    const point = localPoint(event, metrics);
    const direction = detectDirection(point, metrics);
    if (!direction) {
      centerTap = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      try { surface.setPointerCapture(event.pointerId); } catch (_) {}
      return;
    }
    if (direction === 'back') preparePreviousBackside();

    gesture = {
      pointerId: event.pointerId,
      direction,
      start: point,
      current: point,
      metrics,
      samples: [{ x: point.x, time: performance.now() }],
      moved: false,
    };
    curlDragging = true;
    closeSettings();
    hideControls();
    hideLugat();
    document.getElementById('rdr-stage')?.classList.add('is-touching', 'is-page-curling');
    try { surface.setPointerCapture(event.pointerId); } catch (_) {}
    try { pageFlip.startUserTouch(point); } catch (_) { resetGesture(); return; }
    event.preventDefault();
  };

  const onPointerMove = event => {
    if (centerTap && event.pointerId === centerTap.pointerId) {
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
      const sampleEvent = events.length ? events.at(-1) : event;
      const deltaX = sampleEvent.clientX - centerTap.startX;
      const deltaY = sampleEvent.clientY - centerTap.startY;
      centerTap.moved ||= Math.hypot(deltaX, deltaY) >= PAGE_CURL_CONFIG.minimumDragPx;
      return;
    }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    const sampleEvent = events.length ? events.at(-1) : event;
    const point = localPoint(sampleEvent, gesture.metrics);
    gesture.current = point;
    const drag = gesture.direction === 'forward' ? gesture.start.x - point.x : point.x - gesture.start.x;
    if (drag >= PAGE_CURL_CONFIG.minimumDragPx) gesture.moved = true;
    pushSample(point, performance.now());
    scheduleMove(point);
    event.preventDefault();
  };

  const finishPointer = (event, cancelled = false) => {
    if (centerTap && event.pointerId === centerTap.pointerId) {
      const tap = centerTap;
      resetCenterGesture();
      releaseCapture(event.pointerId);
      const distance = Math.hypot(event.clientX - tap.startX, event.clientY - tap.startY);
      if (!cancelled && !tap.moved && distance < PAGE_CURL_CONFIG.minimumDragPx) toggleControls();
      return;
    }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const active = gesture;
    const point = localPoint(event, active.metrics);
    active.current = point;
    pushSample(point, performance.now());
    flushQueuedMove();

    const drag = active.direction === 'forward' ? active.start.x - point.x : point.x - active.start.x;
    const progress = Math.max(0, drag / active.metrics.pageWidth);
    const vx = velocityX();
    const flick = active.direction === 'forward'
      ? vx <= -PAGE_CURL_CONFIG.flickVelocity
      : vx >= PAGE_CURL_CONFIG.flickVelocity;
    const commit = !cancelled && active.moved && (progress >= PAGE_CURL_CONFIG.snapThreshold || flick);
    const bounds = active.metrics.bounds || pageFlip.getBoundsRect();
    const foldLine = bounds.left + bounds.width / 2;
    const forcePoint = {
      x: active.direction === 'forward' ? foldLine - PAGE_CURL_CONFIG.overshootPx : foldLine + PAGE_CURL_CONFIG.overshootPx,
      y: point.y,
    };
    const returnPoint = {
      x: active.direction === 'forward'
        ? foldLine + active.metrics.pageWidth * 0.92
        : foldLine - active.metrics.pageWidth * 0.92,
      y: point.y,
    };

    try {
      if (!active.moved || cancelled) {
        pageFlip.userStop(point, true);
      } else {
        const releasePoint = commit ? forcePoint : returnPoint;
        pageFlip.userMove(releasePoint, true);
        pageFlip.userStop(releasePoint, false);
      }
    } catch (_) {}

    suppressClickUntil = Date.now() + 450;
    releaseCapture(event.pointerId);
    resetGesture();
    event.preventDefault();
  };

  const onPointerUp = event => finishPointer(event, false);
  const onPointerCancel = event => finishPointer(event, true);
  const onLostCapture = event => {
    if (centerTap?.pointerId === event.pointerId) resetCenterGesture();
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    try { pageFlip.userStop(gesture.current, true); } catch (_) {}
    resetGesture();
  };
  const onWindowBlur = () => {
    if (centerTap) {
      const pointerId = centerTap.pointerId;
      resetCenterGesture();
      releaseCapture(pointerId);
    }
    if (!gesture) return;
    const pointerId = gesture.pointerId;
    try { pageFlip.userStop(gesture.current, true); } catch (_) {}
    releaseCapture(pointerId);
    resetGesture();
  };
  const onClick = event => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onContextMenu = event => event.preventDefault();

  surface.addEventListener('pointerdown', onPointerDown, { passive: false });
  interactionOwner.addEventListener('pointermove', onPointerMove, { passive: false });
  interactionOwner.addEventListener('pointerup', onPointerUp, { passive: false });
  interactionOwner.addEventListener('pointercancel', onPointerCancel, { passive: false });
  // lostpointercapture capture'i alan dugumde teslim edilir; yasam dongusunun
  // diger olaylari stage'e ait olsa da bu cleanup capture sahibinde kalmalidir.
  surface.addEventListener('lostpointercapture', onLostCapture);
  window.addEventListener('blur', onWindowBlur);
  surface.addEventListener('click', onClick, true);
  surface.addEventListener('contextmenu', onContextMenu);

  removeDirectPageCurl = () => {
    mobilePdfBacksideObserver?.disconnect();
    pageFlipStateObserver?.disconnect();
    restorePreviousBackside();
    if (prepareMobilePdfPreviousBackside === preparePreviousBackside) {
      prepareMobilePdfPreviousBackside = null;
    }
    if (clearMobilePdfPreviousBackside === restorePreviousBackside) {
      clearMobilePdfPreviousBackside = null;
    }
    surface.removeEventListener('pointerdown', onPointerDown);
    interactionOwner.removeEventListener('pointermove', onPointerMove);
    interactionOwner.removeEventListener('pointerup', onPointerUp);
    interactionOwner.removeEventListener('pointercancel', onPointerCancel);
    surface.removeEventListener('lostpointercapture', onLostCapture);
    window.removeEventListener('blur', onWindowBlur);
    surface.removeEventListener('click', onClick, true);
    surface.removeEventListener('contextmenu', onContextMenu);
    if (gesture) {
      try { pageFlip?.userStop(gesture.current, true); } catch (_) {}
    }
    resetCenterGesture();
    resetGesture();
  };
}

/**
 * ARAÇ ÇUBUĞU EYLEMLERİNİN TEK SAHİBİ.
 *
 * NEDEN: Kabuk (araç çubuğu dâhil) PDF yüklenmeden ÖNCE basılıyor,
 * dinleyiciler ise ancak PDF çözüldükten sonra bağlanıyordu. Aradaki
 * sürede - büyük bir kitapta saniyeler - düğmeler görünür ama ÖLÜYDÜ:
 * kullanıcı "Ara"ya basıyor, hiçbir şey olmuyordu. Ölçüldü: appMode
 * "loading-book" iken düğme 99x52px, click çalışıyor, sahip yok.
 *
 * Delegasyon sahipliği tek bir düğüme (okuyucu kökü) taşır: araç çubuğu
 * yeniden basılsa da sahiplik korunur, düğme başına mükerrer dinleyici
 * birikmez ve kabuk göründüğü andan itibaren tıklanabilir.
 */
function bindReaderShellControls() {
  readerShellAbort?.abort();
  readerShellAbort = new AbortController();
  const root = document.getElementById('reader-inner');
  if (!root) return;
  root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('#rdr-back, #rdr-search-open, #rdr-contents-open, #rdr-settings-open, #rdr-bookmark');
    if (!action) return;
    switch (action.id) {
      case 'rdr-back': void showLibrary(); break;
      case 'rdr-search-open': openSearchSheet(); break;
      case 'rdr-contents-open': renderContentsSheet(); openSheet('rdr-contents-sheet'); break;
      case 'rdr-settings-open': openSettings(); break;
      case 'rdr-bookmark': toggleBookmark(); break;
      default: break;
    }
  }, { signal: readerShellAbort.signal });
}

function bindReaderEvents(book) {
  readerAbort?.abort();
  readerAbort = new AbortController();
  const { signal } = readerAbort;
  const stage = document.getElementById('rdr-stage');
  // Araç çubuğu eylemleri bindReaderShellControls'ün sahipliğinde; burada
  // TEKRAR bağlanmaz, yoksa her yeniden bağlamada ikinci bir sahip olurdu.

  // Sayfa kapatma: başlıktaki düğme, backdrop tıklaması ve Escape.
  for (const id of SHEET_IDS) {
    const sheet = document.getElementById(id);
    if (!sheet) continue;
    sheet.querySelector('[data-close-sheet]')?.addEventListener('click', () => closeSettings(), { signal });
    sheet.addEventListener('click', event => {
      // Backdrop, dialog elemanının kendisidir; panel içi tıklamalar paneli verir.
      if (event.target === sheet) closeSettings();
    }, { signal });
    sheet.addEventListener('cancel', event => {
      event.preventDefault();
      closeSettings();
    }, { signal });
    // Sayfa kapanınca kontroller yeniden görünür ve otomatik gizleme yeniden kurulur.
    sheet.addEventListener('close', () => showControls(true), { signal });
  }

  const searchInput = document.getElementById('rdr-search-input');
  searchInput?.addEventListener('input', event => {
    // Her tuşta arama YAPILMAZ; hazır indekste debounce ile çalışılır (§56).
    clearTimeout(searchDebounceTimer);
    const query = event.target.value;
    searchDebounceTimer = window.setTimeout(() => void runBookSearch(query), 220);
  }, { signal });
  searchInput?.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearTimeout(searchDebounceTimer);
    void runBookSearch(event.target.value);
  }, { signal });

  document.querySelectorAll('.mode-btn').forEach(button => {
    button.addEventListener('click', () => switchReaderMode(button.dataset.mode), { signal });
  });
  document.getElementById('wake-lock-toggle')?.addEventListener('change', event => {
    state.keepAwake = event.target.checked && wakeLockSupported;
    savePrefs();
    if (state.keepAwake) void requestWakeLock();
    else void releaseWakeLock();
  }, { signal });
  document.getElementById('fullscreen-toggle')?.addEventListener('change', () => {
    void toggleFullscreen();
  }, { signal });
  document.addEventListener('visibilitychange', handleWakeLockVisibility, { signal });
  const progress = document.getElementById('rdr-progress');
  progress?.addEventListener('input', event => {
    const value = Number(event.target.value);
    const label = document.getElementById('rdr-progress-label');
    if (label) label.textContent = formatPageLabel(value);
    const pct = readerPages.length <= 1 ? 100 : (value / (readerPages.length - 1)) * 100;
    event.target.style.setProperty('--progress', `${pct}%`);
    showScrubPreview(value, pct);
  }, { signal });
  progress?.addEventListener('change', event => {
    hideScrubPreview();
    // Range değeri sayfa DİZİNİ; goToPdfPage sayfa NUMARASI bekler.
    goToPdfPage(Number(event.target.value) + 1);
    showControls(true);
  }, { signal });
  // Klavye/dokunma birakilinca da onizleme kapanmali.
  for (const eventName of ['pointerup', 'pointercancel', 'blur']) {
    progress?.addEventListener(eventName, hideScrubPreview, { signal });
  }

  const readerRoot = document.getElementById('reader-inner');
  readerRoot?.querySelectorAll('.theme-btn').forEach(button => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.theme);
      savePrefs();
    }, { signal });
  });

  document.getElementById('font-dec')?.addEventListener('click', () => changeFontSize(-1), { signal });
  document.getElementById('font-inc')?.addEventListener('click', () => changeFontSize(1), { signal });
  readerRoot?.querySelectorAll('.line-height-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.lineHeight = Number(button.dataset.lineHeight);
      applyTypography();
      savePrefs();
      readerRoot.querySelectorAll('.line-height-btn').forEach(item => item.classList.toggle('selected', item === button));
      scheduleRepagination();
    }, { signal });
  });

  document.getElementById('accessible-toggle')?.addEventListener('change', event => {
    state.accessible = event.target.checked;
    document.getElementById('reader-inner')?.classList.toggle('accessible', state.accessible);
    savePrefs();
    scheduleRepagination();
  }, { signal });
  document.getElementById('sound-toggle')?.addEventListener('change', event => {
    state.pageSound = event.target.checked;
    savePrefs();
  }, { signal });
  document.getElementById('txt-book-input')?.addEventListener('change', handleTxtBook, { signal });

  stage?.addEventListener('click', event => {
    const word = event.target.closest('.rd-accent');
    if (word) {
      event.stopPropagation();
      showLugat(word);
      return;
    }
    // Sürekli modda sayfa çevirme jesti yok; kabuk açma/kapama dokunuşu
    // buradan gelir. Sayfa modunda aynı işi installDirectPageCurl yapar.
    if (state.readerMode === 'scroll' && !event.target.closest('button, a, input, label')) {
      toggleControls();
    }
  }, { signal });

  // Sürekli modda kaydırma başlayınca kabuk çekilsin: metin görünürlüğü öncelikli.
  if (state.readerMode === 'scroll') {
    document.getElementById('rdr-flipbook')?.addEventListener('scroll', () => {
      if (state.controlsVisible && !controlsAreLocked()) hideControls();
    }, { signal, passive: true });
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('.rd-accent, .lugat-popover')) hideLugat();
  }, { capture: true, signal });

  document.addEventListener('keydown', event => readerKeyHandler(event), { signal });

  // Sekme gizlenirse/ kapanırsa son okunan sayfa kaybolmasın (§4).
  // visibilitychange mobilde "uygulamadan çıkma"nın tek güvenilir sinyalidir;
  // beforeunload iOS Safari'de tetiklenmeyebiliyor.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLastReadSave();
  }, { signal });
  window.addEventListener('pagehide', flushLastReadSave, { signal });

  // Tek bir debounce: resize ve ResizeObserver aynı yolu kullanır, böylece
  // yeniden kurulum en fazla bir kez tetiklenir.
  const onLayoutChange = () => {
    if (curlDragging) {
      resizePending = true;
      return;
    }
    clearTimeout(repaginateTimer);
    repaginateTimer = window.setTimeout(() => {
      const metrics = getLayoutMetrics();
      if (!metrics || metrics.key === lastLayoutKey) return;
      scheduleRepagination(0);
    }, 200);
  };

  window.addEventListener('resize', onLayoutChange, { signal, passive: true });
  const onFullscreenChange = () => {
    syncFullscreenToggle();
    onLayoutChange();
  };
  document.addEventListener('fullscreenchange', onFullscreenChange, { signal });
  document.addEventListener('webkitfullscreenchange', onFullscreenChange, { signal });
  layoutObserver = new ResizeObserver(onLayoutChange);
  const cradle = document.getElementById('book-cradle');
  if (stage) layoutObserver.observe(stage);
  if (cradle) layoutObserver.observe(cradle);
}

function changeFontSize(delta) {
  const next = clamp(state.fontSize + delta, 16, 24);
  if (next === state.fontSize) return;
  state.fontSize = next;
  applyTypography();
  savePrefs();
  const value = document.getElementById('font-value');
  if (value) value.textContent = `${state.fontSize}px`;
  scheduleRepagination();
}

function readerKeyHandler(event) {
  if (event.key === 'Escape') {
    if (!closeSettings()) hideControls();
    return;
  }
  if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  // Bir sayfa açıkken kitap gezinme kısayolları devrede olmamalı.
  if (openSheets().length) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault();
    safeFlip('next');
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    safeFlip('prev');
  } else if (event.key === 'Home') {
    event.preventDefault();
    goToPdfPage(1);
  } else if (event.key === 'End') {
    event.preventDefault();
    goToPdfPage(readerPages.length);
  } else if (event.key.toLowerCase() === 'b') {
    event.preventDefault();
    toggleBookmark();
  } else if (event.key.toLowerCase() === 'a') {
    event.preventDefault();
    openSettings();
  }
}

async function handleTxtBook(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 1_500_000) {
    showToast('TXT dosyası 1,5 MB sınırını aşıyor');
    event.target.value = '';
    return;
  }

  try {
    const text = (await file.text()).replace(/\r\n?/g, '\n').trim();
    if (!text) {
      showToast('Seçilen TXT dosyası boş');
      return;
    }
    const title = file.name.replace(/\.txt$/i, '').trim() || 'Yüklenen kitap';
    const rawParagraphs = text.includes('\n\n')
      ? text.split(/\n\s*\n/)
      : text.split('\n').filter(Boolean);
    const html = rawParagraphs
      .map(paragraph => `<p>${escapeHTML(paragraph.trim()).replaceAll('\n', '<br>')}</p>`)
      .join('');
    importedBook = {
      id: 'imported-txt-book',
      type: 'text',
      title,
      author: 'TXT kitap',
      chapters: [{
        id: 'txt-content',
        title: 'Metin',
        pages: [{ pageNumber: 1, html }],
      }],
    };
    try { localStorage.setItem(STORAGE.importedBook, JSON.stringify(importedBook)); } catch (_) {}
    BOOKS = [importedBook, ...BOOKS.filter(item => item.id !== importedBook.id)];
    closeSettings();
    await openBook(importedBook, readBookProgress(importedBook.id) || state.readingProgress[importedBook.id] || null);
    showToast(`${title} yüklendi`);
  } catch (_) {
    showToast('TXT dosyası okunamadı');
  } finally {
    event.target.value = '';
  }
}

function showLugat(element) {
  const word = element.dataset.word;
  const meaning = element.dataset.meaning;
  const popover = document.getElementById('rdr-lugat');
  if (!word || !meaning || !popover) return;
  document.getElementById('lugat-word').textContent = word;
  document.getElementById('lugat-meaning').textContent = meaning;

  const rect = element.getBoundingClientRect();
  const width = Math.min(270, window.innerWidth - 24);
  const left = clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12);
  const placeAbove = rect.top > 150;
  popover.style.width = `${width}px`;
  popover.style.left = `${left}px`;
  popover.style.top = placeAbove ? 'auto' : `${rect.bottom + 10}px`;
  popover.style.bottom = placeAbove ? `${window.innerHeight - rect.top + 10}px` : 'auto';
  popover.classList.add('visible');
  popover.setAttribute('aria-hidden', 'false');
  clearTimeout(lugatTimer);
  lugatTimer = window.setTimeout(hideLugat, 5000);
}

function hideLugat() {
  clearTimeout(lugatTimer);
  const popover = document.getElementById('rdr-lugat');
  popover?.classList.remove('visible');
  popover?.setAttribute('aria-hidden', 'true');
}

function showToast(message) {
  const toast = document.getElementById('rdr-toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400);
}

function playPageSound() {
  if (!state.pageSound) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext ||= new AudioCtor();
    if (audioContext.state === 'suspended') audioContext.resume();
    // Gürültü buffer'ı bir kez üretilir; her çevirmede yeniden doldurmak
    // ana iş parçacığında gereksiz yük oluşturuyordu.
    if (!pageSoundBuffer) {
      const duration = 0.13;
      pageSoundBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
      const channel = pageSoundBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) {
        const envelope = Math.sin(Math.PI * (i / channel.length));
        channel[i] = (Math.random() * 2 - 1) * envelope * 0.22;
      }
    }
    const buffer = pageSoundBuffer;
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1250;
    filter.Q.value = 0.65;
    gain.gain.value = 0.06;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audioContext.destination);
    source.start();
  } catch (_) {}
}

export async function initRavzaBooks() {
  cleanupReader();
  document.documentElement.classList.add('is-ravza-books-page');
  document.body.classList.add('is-ravza-books-page');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (originalThemeColor === null) originalThemeColor = themeMeta?.getAttribute('content') ?? '';
  loadStorage();
  buildSampleContent();
  applyTheme(state.theme);
  applyTypography();
  if (!BOOKS.length) {
    showReaderError('Okunacak kitap bulunamadı.', {
      actionLabel: 'Ana sayfaya dön',
      action: () => window.navigate?.('ana-sayfa'),
    });
    return { skipTopScroll: true };
  }
  renderLibrary();
  // Spotlight bir kitap istediyse dogrudan onu ac. Gecersiz/eski kimlik
  // sessizce yok sayilir; kitaplik acik kalir.
  const requested = takeRequestedBookId();
  if (requested) {
    const book = getBook(requested);
    if (book) void openBook(book);
  }
  return { skipTopScroll: true };
}

export function closeRavzaBooks() {
  cleanupReader();
  cleanupLibrary();
  void destroyPdfDocument();
  document.documentElement.classList.remove('is-ravza-books-page');
  document.body.classList.remove('is-ravza-books-page');
  delete document.body.dataset.ravzaBooksMode;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && originalThemeColor !== null) themeMeta.setAttribute('content', originalThemeColor);
  originalThemeColor = null;
  if (audioContext) {
    try { audioContext.close(); } catch (_) {}
    audioContext = null;
    pageSoundBuffer = null;
  }
}
