import { RAVZA_BOOKS } from '../../data/ravza-books.js?v=books-pipeline-20260716-1';

const PAGE_FLIP_SRC = 'https://unpkg.com/page-flip@2.0.7/dist/js/page-flip.browser.js';
const PDFJS_MODULE_URL = new URL('../../assets/vendor/pdfjs/pdf.js', import.meta.url).href;
const PDFJS_WORKER_URL = new URL('../../assets/vendor/pdfjs/pdf.worker.js', import.meta.url).href;
const PDFJS_ASSET_ROOT = new URL('../../assets/vendor/pdfjs/', import.meta.url).href;
const PDF_PROGRESS_PREFIX = 'ravzaBooksProgress:';
const PDF_RENDER_RADIUS = 2;
const APP_MODES = new Set(['library', 'loading-book', 'reading', 'error']);
const COVER_CACHE_NAME = 'ravza-books-covers-v1';
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const lowPowerDevice = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
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
};

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
  accessible: false,
  pageSound: true,
  controlsVisible: true,
  bookmarks: {},
  readingProgress: {},
};

let BOOKS = [];
let importedBook = null;
let readerPages = [];
let pageFlip = null;
let readerAbort = null;
let layoutObserver = null;
let controlsTimer = 0;
let repaginateTimer = 0;
let toastTimer = 0;
let lugatTimer = 0;
let renderGeneration = 0;
let lastLayoutKey = '';
let lastFlipIndex = -1;
let audioContext = null;
let pageFlipScriptPromise = null;
let removeDirectPageCurl = null;
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
let pdfActivePages = new Set();
const coverObjectUrls = new Set();
const coverGenerationJobs = new Map();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const escapeHTML = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4V4.8Z"/></svg>',
  bookmarkFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4V4.8Z"/></svg>',
};

function loadStorage() {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE.prefs) || '{}');
    state.fontSize = clamp(Number(prefs.fontSize) || 17, 16, 24);
    state.lineHeight = [1.35, 1.4, 1.45].includes(Number(prefs.lineHeight))
      ? Number(prefs.lineHeight)
      : 1.4;
    state.theme = ['light', 'sepia', 'dark'].includes(prefs.theme) ? prefs.theme : 'light';
    state.accessible = Boolean(prefs.accessible);
    state.pageSound = prefs.pageSound !== false;
    state.bookmarks = JSON.parse(localStorage.getItem(STORAGE.bookmarks) || '{}');
    state.readingProgress = JSON.parse(localStorage.getItem(STORAGE.progress) || '{}');
    importedBook = JSON.parse(localStorage.getItem(STORAGE.importedBook) || 'null');
  } catch (_) {
    state.bookmarks = {};
    state.readingProgress = {};
    importedBook = null;
  }
}

function savePrefs() {
  localStorage.setItem(STORAGE.prefs, JSON.stringify({
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    theme: state.theme,
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

function applyTheme(theme) {
  if (!['light', 'sepia', 'dark'].includes(theme)) return;
  state.theme = theme;
  document.getElementById('ravzabooks')?.setAttribute('data-reader-theme', theme);
  document.querySelectorAll('#reader-inner .theme-btn').forEach(button => {
    const selected = button.dataset.theme === theme;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const color = theme === 'dark' ? '#171614' : theme === 'sepia' ? '#ddc8a5' : '#F4EAD7';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
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
  renderGeneration += 1;
  pdfRenderGeneration += 1;
  cancelPdfRenders();
  removeDirectPageCurl?.();
  removeDirectPageCurl = null;
  curlDragging = false;
  resizePending = false;
  readerAbort?.abort();
  readerAbort = null;
  layoutObserver?.disconnect();
  layoutObserver = null;
  clearTimeout(controlsTimer);
  clearTimeout(repaginateTimer);
  clearTimeout(toastTimer);
  clearTimeout(lugatTimer);
  if (pageFlip) {
    const pageFlipUI = pageFlip.getUI?.();
    if (typeof pageFlipUI?.removeHandlers === 'function') pageFlipUI.removeHandlers();
    try { pageFlip.destroy(); } catch (_) {}
    pageFlip = null;
  }
}

function cancelPdfRenders() {
  pdfActivePages = new Set();
  const pending = [...pdfRenderPromises.values()];
  const cachedPages = [...pdfPageCache.values()];
  for (const task of pdfRenderTasks.values()) {
    try { task.cancel(); } catch (_) {}
  }
  pdfRenderTasks.clear();
  pdfRenderPromises.clear();
  pdfPageCache.clear();
  pdfRenderDrain = Promise.allSettled(pending).then(() => {
    for (const page of cachedPages) {
      try { page.cleanup(); } catch (_) {}
    }
  });
}

async function destroyPdfDocument() {
  pdfRenderGeneration += 1;
  cancelPdfRenders();
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
  if (!progress || !progress.lastOpenedAt) {
    return { progress: null, percentage: 0, label: 'Henüz açılmadı', action: 'Okumaya Başla', completed: false };
  }
  const percentage = clamp(Number(progress.progress) || 0, 0, 100);
  if (progress.completed) {
    return { progress, percentage: 100, label: 'Tamamlandı', action: 'Tekrar Oku', completed: true };
  }
  return {
    progress,
    percentage,
    label: `%${percentage.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} okundu`,
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

function libraryCoverMarkup(book) {
  if (book.type !== 'pdf') return textCoverMarkup(book);
  const source = book.cover ? ` src="${escapeHTML(book.cover)}"` : '';
  const sourceSet = book.coverSrcSet ? ` srcset="${escapeHTML(book.coverSrcSet)}" sizes="(max-width: 520px) 42vw, 220px"` : '';
  const dimensions = Number(book.coverWidth) > 0 && Number(book.coverHeight) > 0
    ? ` width="${Number(book.coverWidth)}" height="${Number(book.coverHeight)}"`
    : '';
  return `<img class="library-cover-image" data-book-cover="${escapeHTML(book.id)}"${source}${sourceSet}${dimensions} alt="${escapeHTML(book.title)} kitap kapağı" decoding="async" />`;
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
          ${BOOKS.map(book => {
            const status = bookLibraryState(book);
            return `
              <li class="library-book-slot">
                <button class="library-book-card" type="button" data-book-id="${escapeHTML(book.id)}" data-open-position="${status.completed ? 'restart' : 'resume'}" aria-label="${escapeHTML(book.title)}, ${escapeHTML(book.author)}. ${escapeHTML(status.label)}. ${escapeHTML(status.action)}">
                  <span class="library-cover-wrap">
                    ${libraryCoverMarkup(book)}
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
      const status = bookLibraryState(book);
      const position = card.dataset.openPosition === 'restart'
        ? (book.type === 'pdf' ? { pageIndex: 0, pdfPage: 1 } : { absIndex: 0 })
        : status.progress;
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
  root.className = 'reader-root';
  root.innerHTML = `
    <div class="reader-loading" role="status" aria-live="polite">
      <img class="reader-loading-logo" src="./assets/branding/ravza-books-logo-256.webp" width="256" height="256" alt="Ravza Books" />
      <p>${escapeHTML(message)}</p>
      <span class="reader-loading-track" aria-hidden="true"><i style="--loading-progress:${percent ?? 18}%"></i></span>
      ${percent === null ? '' : `<span class="reader-loading-percent">%${percent}</span>`}
    </div>`;
}

function showReaderError(message) {
  setAppMode('error');
  const root = document.getElementById('reader-inner');
  if (!root) return;
  root.className = 'reader-root';
  root.innerHTML = `
    <div class="reader-error" role="alert">
      <img class="reader-error-logo" src="./assets/branding/ravza-books-logo-256.webp" width="256" height="256" alt="Ravza Books" />
      <strong>Kitap açılamadı</strong>
      <p>${escapeHTML(message)}</p>
      <button type="button" id="rdr-error-back">Kitaplığa dön</button>
    </div>`;
  root.querySelector('#rdr-error-back')?.addEventListener('click', () => void showLibrary(), { once: true });
  document.getElementById('screen-reader')?.setAttribute('aria-busy', 'false');
}

function ensurePageFlip() {
  if (window.St?.PageFlip) return Promise.resolve(true);
  if (pageFlipScriptPromise) return pageFlipScriptPromise;

  pageFlipScriptPromise = new Promise(resolve => {
    const existing = document.querySelector(`script[src="${PAGE_FLIP_SRC}"]`);
    const script = existing || document.createElement('script');
    const complete = () => resolve(Boolean(window.St?.PageFlip));
    script.addEventListener('load', complete, { once: true });
    script.addEventListener('error', () => resolve(false), { once: true });
    if (!existing) {
      script.src = PAGE_FLIP_SRC;
      script.async = true;
      script.crossOrigin = 'anonymous';
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
  root.innerHTML = `
    <div id="rdr-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>

    <article class="reader-stage" id="rdr-stage" aria-label="${escapeHTML(book.title)} okuma alanı">
      <div class="book-cradle" id="book-cradle">
        <div id="rdr-flipbook"></div>
      </div>
    </article>

    <header class="reader-controls-top" aria-label="Üst okuyucu kontrolleri">
      <button class="control-btn" id="rdr-back" type="button" aria-label="Geri">${ICON.back}</button>
      <div class="control-title" id="rdr-control-title">${escapeHTML(book.title)}</div>
      <div class="control-actions">
        <button class="control-btn${bookmarked ? ' active' : ''}" id="rdr-bookmark" type="button" aria-label="Kaldığım sayfayı kaydet ve yer imini değiştir" aria-pressed="${bookmarked}">${bookmarked ? ICON.bookmarkFill : ICON.bookmark}</button>
        <button class="control-btn control-aa" id="rdr-settings-open" type="button" aria-label="Okuma ayarları" aria-expanded="false">Aa</button>
      </div>
    </header>

    <nav class="reader-controls-bottom" aria-label="Sayfa kontrolleri">
      <input class="progress-range" id="rdr-progress" type="range" min="0" max="0" value="0" step="1" aria-label="Okuma ilerlemesi" />
      <div class="bottom-control-row">
        <span class="progress-label" id="rdr-progress-label">1 / 1</span>
      </div>
    </nav>

    <div class="settings-layer" id="rdr-settings" aria-hidden="true">
      <button class="settings-scrim" id="rdr-settings-close" type="button" aria-label="Okuma ayarlarını kapat"></button>
      <aside class="settings-popover" role="dialog" aria-modal="false" aria-labelledby="settings-title">
        <h2 class="settings-title" id="settings-title">Okuma ayarları</h2>

        ${isPdf ? `
        <section class="settings-section pdf-book-information">
          <p class="settings-label">Açık kitap</p>
          <p class="pdf-book-title">${escapeHTML(book.title)}</p>
          <p class="pdf-book-meta">${escapeHTML(book.author)} · ${escapeHTML(book.translator)}</p>
          <p class="pdf-book-meta">Orijinal PDF · ${Number(book.totalPages) || 0} sayfa</p>
        </section>` : `
        <section class="settings-section">
          <p class="settings-label">Yazı</p>
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
        </section>`}

        <section class="settings-section">
          <p class="settings-label">Tema</p>
          <div class="settings-row">
            <span class="setting-name">Sayfa görünümü</span>
            <div class="theme-controls">
              ${['light', 'sepia', 'dark'].map(theme => `<button class="theme-btn${state.theme === theme ? ' selected' : ''}" type="button" data-theme="${theme}" aria-label="${theme === 'light' ? 'Açık' : theme === 'sepia' ? 'Sepya' : 'Koyu'} tema" aria-pressed="${state.theme === theme}"></button>`).join('')}
            </div>
          </div>
        </section>

        <section class="settings-section">
          <p class="settings-label">Okuma</p>
          ${isPdf ? '' : `<div class="settings-row">
            <span class="setting-name">Erişilebilir okuma</span>
            <label class="switch">
              <input id="accessible-toggle" type="checkbox" ${state.accessible ? 'checked' : ''} />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="sr-only">Erişilebilir okuma</span>
            </label>
          </div>`}
          <div class="settings-row">
            <span class="setting-name">Sayfa sesi</span>
            <label class="switch">
              <input id="sound-toggle" type="checkbox" ${state.pageSound ? 'checked' : ''} />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="sr-only">Sayfa sesi</span>
            </label>
          </div>
        </section>

        <section class="settings-section">
          <p class="settings-label">Kitap</p>
          <label class="file-btn" for="txt-book-input">TXT kitap seç</label>
          <input class="file-input" id="txt-book-input" type="file" accept=".txt,text/plain" />
        </section>
      </aside>
    </div>

    <div class="lugat-popover" id="rdr-lugat" role="tooltip" aria-hidden="true">
      <p class="lugat-word" id="lugat-word"></p>
      <p class="lugat-meaning" id="lugat-meaning"></p>
    </div>
    <div class="reader-toast" id="rdr-toast" role="status" aria-live="polite"></div>
  `;
  return root;
}

function fitPdfBookToStage(aspectRatio = pdfPageAspectRatio) {
  if (state.bookType !== 'pdf') return;
  const stage = document.getElementById('rdr-stage');
  const cradle = document.getElementById('book-cradle');
  const root = document.getElementById('reader-inner');
  if (!stage || !cradle) return;

  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 3 / 4;
  const stageStyle = getComputedStyle(stage);
  const horizontalPadding = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const verticalPadding = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
  const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
  const availableHeight = Math.max(1, stage.clientHeight - verticalPadding);
  const portrait = shouldUsePortrait();
  const pagesAcross = portrait ? 1 : 2;
  const pageWidth = Math.min(availableWidth / pagesAcross, availableHeight * ratio);
  const pageHeight = pageWidth / ratio;

  cradle.style.width = `${Math.max(1, pageWidth * pagesAcross)}px`;
  cradle.style.height = `${Math.max(1, pageHeight)}px`;
  cradle.style.setProperty('--pdf-page-aspect', String(ratio));
  if (root) root.dataset.spread = portrait ? 'single' : 'double';
}

function getLayoutMetrics() {
  if (state.bookType === 'pdf') fitPdfBookToStage();
  const cradle = document.getElementById('book-cradle');
  if (!cradle) return null;
  const rect = cradle.getBoundingClientRect();
  const portrait = shouldUsePortrait();
  const pageWidth = Math.max(1, Math.floor(rect.width / (portrait ? 1 : 2)));
  const pageHeight = Math.max(1, Math.floor(rect.height));
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
    showReaderError('Sayfa çevirme motoru yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.');
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
  });
  pageFlip.on('changeState', event => {
    if (event.data === 'user_fold' || event.data === 'flipping') hideControls();
  });
  pageFlip.loadFromHTML(flipbook.querySelectorAll('.rd-page'));

  bindReaderEvents(book);
  installDirectPageCurl();
  document.getElementById('screen-reader')?.setAttribute('aria-busy', 'false');
  setAppMode('reading');
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
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      chunks.push(value);
      loaded += value.byteLength;
      showReaderLoading(`${book.title} hazırlanıyor…`, total > 0 ? (loaded / total) * 100 : null);
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
  flipbook.replaceChildren();
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
    flipbook.appendChild(element);
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
  flipbook.appendChild(backCover);
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
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = '';
    canvas.style.height = '';
    delete canvas.dataset.renderKey;
  }
  element?.classList.remove('is-rendered', 'has-render-error');
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
    void pending.finally(() => {
      if (pdfActivePages.has(pageNumber)) {
        setTimeout(() => void renderPdfPage(pageNumber), 0);
      } else {
        releasePdfPageCanvas(pageNumber);
      }
    });
    return;
  }
  releasePdfPageCanvas(pageNumber);
}

async function renderPdfPage(pageNumber) {
  if (!pdfDocument || !pdfActivePages.has(pageNumber)) return false;
  const existing = pdfRenderPromises.get(pageNumber);
  if (existing) return existing;
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
      const frameStyle = getComputedStyle(frame);
      const horizontalPadding = parseFloat(frameStyle.paddingLeft) + parseFloat(frameStyle.paddingRight);
      const verticalPadding = parseFloat(frameStyle.paddingTop) + parseFloat(frameStyle.paddingBottom);
      const availableWidth = Math.max(1, (frame.clientWidth || pdfRenderBox.width) - horizontalPadding);
      const availableHeight = Math.max(1, (frame.clientHeight || pdfRenderBox.height) - verticalPadding);
      const cssScale = Math.min(availableWidth / unscaledViewport.width, availableHeight / unscaledViewport.height);
      const viewport = pdfPage.getViewport({ scale: cssScale });
      const outputScale = clamp(window.devicePixelRatio || 1, 1, 2.5);
      const renderKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}@${outputScale}`;
      if (canvas.dataset.renderKey === renderKey && element.classList.contains('is-rendered')) return true;

      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const canvasContext = canvas.getContext('2d', { alpha: false });
      const renderTask = pdfPage.render({
        canvas,
        canvasContext,
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        background: 'rgb(255, 255, 255)',
      });
      pdfRenderTasks.set(pageNumber, renderTask);
      await renderTask.promise;
      if (generation !== pdfRenderGeneration || !pdfActivePages.has(pageNumber)) return false;
      canvas.dataset.renderKey = renderKey;
      element.classList.remove('has-render-error');
      element.classList.add('is-rendered');
      status?.setAttribute('aria-hidden', 'true');
      return true;
    } catch (error) {
      if (String(error?.name) === 'RenderingCancelledException') return false;
      element.classList.add('has-render-error');
      if (status) {
        status.textContent = pdfErrorMessage(error, 'render');
        status.setAttribute('aria-hidden', 'false');
      }
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

async function updatePdfRenderWindow(pageIndex, waitForCurrent = false) {
  if (!pdfDocument) return;
  const currentPage = clamp(pageIndex + 1, 1, pdfDocument.numPages);
  const needed = new Set();
  for (let offset = -PDF_RENDER_RADIUS; offset <= PDF_RENDER_RADIUS; offset += 1) {
    const pageNumber = currentPage + offset;
    if (pageNumber >= 1 && pageNumber <= pdfDocument.numPages) needed.add(pageNumber);
  }
  pdfActivePages = needed;
  for (const pageNumber of new Set([...pdfPageCache.keys(), ...pdfRenderPromises.keys()])) {
    if (!needed.has(pageNumber)) clearPdfPage(pageNumber);
  }
  const currentPromise = renderPdfPage(currentPage);
  for (const pageNumber of needed) {
    if (pageNumber !== currentPage) void renderPdfPage(pageNumber);
  }
  if (waitForCurrent) await currentPromise;
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
    showReaderError('Sayfa çevirme motoru yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.');
    return;
  }

  pdfPageAspectRatio = await readPdfPageAspectRatio(pdfDocument);
  if (generation !== renderGeneration || !pdfDocument) return;

  buildReaderShell(book);
  applyTheme(state.theme);
  applyTypography();
  await nextFrame();
  if (generation !== renderGeneration || !pdfDocument) return;
  const metrics = getLayoutMetrics();
  if (!metrics || metrics.pageWidth < 1 || metrics.pageHeight < 1) {
    showReaderError('Okuma alanı hazırlanamadı. Ekran yönünü değiştirip yeniden deneyin.');
    return;
  }
  lastLayoutKey = metrics.key;
  pdfRenderBox = { width: metrics.pageWidth, height: metrics.pageHeight };
  readerPages = createPdfPageModels(pdfDocument.numPages);
  const savedPosition = position || readBookProgress(book.id);
  const startIndex = findStartIndex(readerPages, savedPosition);
  state.currentIndex = startIndex;
  state.pageNum = Math.min(startIndex + 1, pdfDocument.numPages);
  renderPdfPageElements(book, pdfDocument.numPages);
  updateReaderUI(startIndex);

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
    maxShadowOpacity: Math.min(0.7, PAGE_CURL_CONFIG.shadowOpacity),
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
    void updatePdfRenderWindow(index);
  });
  pageFlip.on('changeState', event => {
    if (event.data === 'user_fold' || event.data === 'flipping') hideControls();
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
    bookmark.classList.toggle('active', active);
    bookmark.setAttribute('aria-pressed', String(active));
    bookmark.innerHTML = active ? ICON.bookmarkFill : ICON.bookmark;
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

function showControls(autoHide = true) {
  const root = document.getElementById('reader-inner');
  if (!root) return;
  state.controlsVisible = true;
  root.classList.add('controls-visible');
  clearTimeout(controlsTimer);
  if (autoHide && !document.getElementById('rdr-settings')?.classList.contains('open')) {
    controlsTimer = window.setTimeout(hideControls, 3000);
  }
}

function hideControls() {
  clearTimeout(controlsTimer);
  state.controlsVisible = false;
  document.getElementById('reader-inner')?.classList.remove('controls-visible');
}

function toggleControls() {
  if (state.controlsVisible) hideControls();
  else showControls(true);
}

function openSettings() {
  const layer = document.getElementById('rdr-settings');
  if (!layer) return;
  clearTimeout(controlsTimer);
  showControls(false);
  layer.classList.add('open');
  layer.setAttribute('aria-hidden', 'false');
  document.getElementById('rdr-settings-open')?.setAttribute('aria-expanded', 'true');
}

function closeSettings() {
  const layer = document.getElementById('rdr-settings');
  if (!layer?.classList.contains('open')) return false;
  layer.classList.remove('open');
  layer.setAttribute('aria-hidden', 'true');
  document.getElementById('rdr-settings-open')?.setAttribute('aria-expanded', 'false');
  showControls(true);
  return true;
}

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
  if (!pageFlip || pageFlip.getState() !== 'read') return;
  const index = state.currentIndex;
  if (direction === 'next' && index < readerPages.length - 1) pageFlip.flipNext(corner);
  if (direction === 'prev' && index > 0) flipPrevious(corner);
}

function flipPrevious(corner = 'top') {
  if (!pageFlip) return;
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
  if (!surface) return;

  try { ui.removeHandlers?.(); } catch (_) {}
  surface.style.touchAction = 'none';
  surface.style.overscrollBehavior = 'none';
  surface.style.webkitUserSelect = 'none';
  surface.style.webkitTouchCallout = 'none';

  let gesture = null;
  let centerTap = null;
  let queuedPoint = null;
  let moveFrame = 0;
  let suppressClickUntil = 0;

  const getMetrics = () => {
    const surfaceRect = surface.getBoundingClientRect();
    const bounds = pageFlip.getBoundsRect();
    const pageWidth = Math.max(1, bounds?.pageWidth || (shouldUsePortrait() ? surfaceRect.width : surfaceRect.width / 2));
    const edgePx = Math.min(
      PAGE_CURL_CONFIG.maximumEdgePx,
      Math.max(PAGE_CURL_CONFIG.minimumEdgePx, pageWidth * PAGE_CURL_CONFIG.edgeGrabRatio),
    );
    return { surfaceRect, bounds, pageWidth, edgePx };
  };

  const localPoint = (event, metrics = getMetrics()) => ({
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

  const resetGesture = () => {
    if (moveFrame) cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    queuedPoint = null;
    gesture = null;
    curlDragging = false;
    document.getElementById('rdr-stage')?.classList.remove('is-touching', 'is-page-curling');
    if (resizePending) {
      resizePending = false;
      scheduleRepagination(40);
    }
  };

  const releaseCapture = pointerId => {
    try {
      if (surface.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId);
    } catch (_) {}
  };

  const onPointerDown = event => {
    if (!pageFlip || gesture || centerTap || event.isPrimary === false || isInteractiveTarget(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pageFlip.getState() !== 'read') return;

    const metrics = getMetrics();
    const point = localPoint(event, metrics);
    const direction = detectDirection(point, metrics);
    if (!direction) {
      centerTap = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
      try { surface.setPointerCapture(event.pointerId); } catch (_) {}
      return;
    }

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
      centerTap.moved ||= Math.hypot(event.clientX - centerTap.startX, event.clientY - centerTap.startY) >= PAGE_CURL_CONFIG.minimumDragPx;
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
      centerTap = null;
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
        if (commit) navigator.vibrate?.(7);
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
    if (centerTap?.pointerId === event.pointerId) centerTap = null;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    try { pageFlip.userStop(gesture.current, true); } catch (_) {}
    resetGesture();
  };
  const onClick = event => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onContextMenu = event => event.preventDefault();

  surface.addEventListener('pointerdown', onPointerDown, { passive: false });
  surface.addEventListener('pointermove', onPointerMove, { passive: false });
  surface.addEventListener('pointerup', onPointerUp, { passive: false });
  surface.addEventListener('pointercancel', onPointerCancel, { passive: false });
  surface.addEventListener('lostpointercapture', onLostCapture);
  surface.addEventListener('click', onClick, true);
  surface.addEventListener('contextmenu', onContextMenu);

  removeDirectPageCurl = () => {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', onPointerUp);
    surface.removeEventListener('pointercancel', onPointerCancel);
    surface.removeEventListener('lostpointercapture', onLostCapture);
    surface.removeEventListener('click', onClick, true);
    surface.removeEventListener('contextmenu', onContextMenu);
    if (gesture) {
      try { pageFlip?.userStop(gesture.current, true); } catch (_) {}
    }
    centerTap = null;
    resetGesture();
  };
}

function bindReaderEvents(book) {
  readerAbort?.abort();
  readerAbort = new AbortController();
  const { signal } = readerAbort;
  const stage = document.getElementById('rdr-stage');

  document.getElementById('rdr-back')?.addEventListener('click', () => {
    void showLibrary();
  }, { signal });
  document.getElementById('rdr-bookmark')?.addEventListener('click', toggleBookmark, { signal });
  document.getElementById('rdr-settings-open')?.addEventListener('click', openSettings, { signal });
  document.getElementById('rdr-settings-close')?.addEventListener('click', closeSettings, { signal });
  const progress = document.getElementById('rdr-progress');
  progress?.addEventListener('input', event => {
    const value = Number(event.target.value);
    const label = document.getElementById('rdr-progress-label');
    if (label) label.textContent = formatPageLabel(value);
    const pct = readerPages.length <= 1 ? 100 : (value / (readerPages.length - 1)) * 100;
    event.target.style.setProperty('--progress', `${pct}%`);
  }, { signal });
  progress?.addEventListener('change', event => {
    if (pageFlip?.getState() === 'read') pageFlip.turnToPage(Number(event.target.value));
    showControls(true);
  }, { signal });

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
    }
  }, { signal });
  document.addEventListener('click', event => {
    if (!event.target.closest('.rd-accent, .lugat-popover')) hideLugat();
  }, { capture: true, signal });

  document.addEventListener('keydown', event => readerKeyHandler(event), { signal });
  window.addEventListener('resize', () => {
    if (curlDragging) {
      resizePending = true;
      return;
    }
    clearTimeout(repaginateTimer);
    repaginateTimer = window.setTimeout(() => {
      const metrics = getLayoutMetrics();
      if (metrics && metrics.key !== lastLayoutKey) scheduleRepagination(0);
    }, 320);
  }, { signal });

  layoutObserver = new ResizeObserver(() => {
    if (curlDragging) {
      resizePending = true;
      return;
    }
    const metrics = getLayoutMetrics();
    if (metrics && metrics.key !== lastLayoutKey) scheduleRepagination(320);
  });
  const cradle = document.getElementById('book-cradle');
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
  if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault();
    safeFlip('next');
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    safeFlip('prev');
  } else if (event.key === 'Home' && pageFlip) {
    event.preventDefault();
    pageFlip.turnToPage(0);
  } else if (event.key === 'End' && pageFlip) {
    event.preventDefault();
    pageFlip.turnToPage(readerPages.length - 1);
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
    const duration = 0.13;
    const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) {
      const envelope = Math.sin(Math.PI * (i / channel.length));
      channel[i] = (Math.random() * 2 - 1) * envelope * 0.22;
    }
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
    document.getElementById('reader-inner').innerHTML = '<p class="reader-error" role="alert">Okunacak kitap bulunamadı.</p>';
    return;
  }
  renderLibrary();
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
  }
}
