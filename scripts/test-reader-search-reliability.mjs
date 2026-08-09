/**
 * ARAMA GÜVENİLİRLİĞİ — sıfır tolerans.
 *
 * Bu suite iki gerçek hatayı kalıcı olarak kilitler:
 *
 *  1. Araç çubuğu, PDF yüklenmeden ÖNCE basılıyor ama dinleyicileri ancak
 *     PDF çözüldükten sonra bağlanıyordu. Arada düğmeler görünür ama ölüydü.
 *  2. Kontroller sönerken (~220ms) hâlâ EKRANDA olmasına rağmen
 *     pointer-events kapanıyordu; kullanıcının gördüğü düğmeye dokunuşu
 *     sahnenin altına düşüyordu.
 *
 * Her iki durum da "Ara'ya bastım, hiçbir şey olmadı" şikâyetini üretiyordu.
 */
import assert from "node:assert/strict";
import {
  ThemeTestBrowser,
  assertCleanDiagnostics,
  delay,
  ensureTestServer,
} from "./lib/theme-test-runtime.mjs";
import { RAVZA_BOOKS } from "../data/ravza-books.generated.js";

const MOBILE = { width: 440, height: 956, deviceScaleFactor: 3, mobile: true };
const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-search-reliability");

const isOpen = () => browser.evaluate("Boolean(document.getElementById('rdr-search-sheet')?.open)");

async function waitFor(predicate, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await delay(30);
  }
  throw new Error(`timeout: ${label}`);
}

async function openBook(bookId, { viewport = MOBILE, mode = "page", theme = "light", waitReady = true } = {}) {
  await browser.setViewport(viewport);
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:${JSON.stringify(mode)},pageSound:false,theme:${JSON.stringify(theme)}}));
    location.reload();`);
  await browser.waitFor("document.querySelector('.library-book-card')", "library", 30000);
  await browser.evaluate(`window.__rejections = []; addEventListener('unhandledrejection', e => window.__rejections.push(String(e.reason?.message || e.reason)));`);
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="${bookId}"]').click()`);
  if (waitReady) {
    await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "reader ready", 60000);
    await delay(500);
  } else {
    await browser.waitFor("document.getElementById('rdr-search-open')", "toolbar", 30000);
  }
}

/** Gerçek dokunuş: hit-test sorunlarını da yakalar (sentetik .click() yakalamaz). */
async function tapSearchButton() {
  const box = await browser.evaluate(`(() => {
    const b = document.getElementById('rdr-search-open');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (r.width < 1) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  assert.ok(box, "search button is not present/measurable");
  assert.ok(box.w >= 44 && box.h >= 44, `search hit target too small: ${box.w}x${box.h}`);
  await browser.command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(box.x), y: Math.round(box.y), id: 1, radiusX: 2, radiusY: 2 }] });
  await delay(25);
  await browser.command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function closeSearch() {
  await browser.evaluate("document.querySelector('#rdr-search-sheet [data-close-sheet]')?.click()");
  await waitFor(async () => !(await isOpen()), "search close");
}

try {
  // ---------------------------------------------------------------- §69 soak
  await openBook("kucuk-prens");
  for (let i = 1; i <= 50; i += 1) {
    await tapSearchButton();
    await waitFor(isOpen, `open #${i}`);
    await closeSearch();
  }

  // ------------------------------------------- tek sahiplik: 1 tıklama 1 niyet
  const listeners = await browser.evaluate(`(() => {
    // Araç çubuğu eylemleri TEK bir delege dinleyiciye aittir; düğme başına
    // dinleyici bağlanmaz, dolayısıyla yeniden basımda mükerrer sahip oluşmaz.
    const btn = document.getElementById('rdr-search-open');
    return JSON.stringify({ hasInlineOnClick: Boolean(btn.onclick) });
  })()`);
  assert.equal(JSON.parse(listeners).hasInlineOnClick, false, "search button must not carry an inline onclick owner");

  await browser.evaluate("for (let i=0;i<20;i++) document.getElementById('rdr-search-open').click();");
  await delay(500);
  assert.equal(await browser.evaluate("document.querySelectorAll('dialog[open]').length"), 1, "20 rapid clicks must yield exactly one open dialog");
  await closeSearch();

  // ------------------------------- §109 kitap yüklenirken Ara ölü olmamalı
  //
  // Burada bilerek SENTETİK click kullanılır: sınanan şey hit-testing değil,
  // SAHİPLİK. Araç çubuğu kabukla birlikte basılıyor ama dinleyiciler eskiden
  // ancak PDF çözüldükten sonra bağlanıyordu; o aralıkta düğmenin sahibi
  // yoktu. (Hit-testing ayrıca aşağıdaki sönme-penceresi testinde gerçek
  // dokunuşla sınanır.)
  await openBook("kucuk-prens", { waitReady: false });
  await browser.evaluate("document.getElementById('rdr-search-open').click()");
  await waitFor(isOpen, "search opens while the book is still loading");
  // Yükleme sırasında yazılan sorgu kaybolmamalı ve kitap hazır olunca
  // kullanıcı tekrar yazmadan çalışmalı (§20/§128): sonsuz sessizlik yok.
  await browser.evaluate(`(() => { const i=document.getElementById('rdr-search-input'); i.value='prens'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "reader ready", 60000);
  await delay(600);
  assert.equal(await isOpen(), true, "search dialog must stay open once the book becomes ready");
  await waitFor(
    async () => /sonuç|Sonuç/.test(await browser.evaluate("document.getElementById('rdr-search-state')?.textContent || ''")),
    "query typed while loading resolves once the index is ready",
    60000,
  );
  assert.equal(
    await browser.evaluate("document.getElementById('rdr-search-input').value"),
    "prens",
    "the query typed during loading must not be lost",
  );
  await closeSearch();

  // ------------------------- sönme penceresi: görünürken tıklanabilir olmalı
  await openBook("kucuk-prens");
  const tapCentre = async () => {
    await browser.command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 220, y: 478, id: 1, radiusX: 2, radiusY: 2 }] });
    await delay(25);
    await browser.command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await delay(300);
  };
  const controlsShown = () => browser.evaluate("document.getElementById('reader-inner').classList.contains('controls-visible')");
  // Kontroller GÖRÜNÜR olmalı ki sonraki otomatik gizlenme penceresi ölçülebilsin.
  await browser.evaluate("document.activeElement?.blur?.();");
  await tapCentre();
  if (!(await controlsShown())) await tapCentre();
  assert.equal(await controlsShown(), true, "could not bring the controls up for the fade test");
  // Odak kabuğun içindeyse otomatik gizlenme kilitlenir (controlsAreLocked).
  await browser.evaluate("document.activeElement?.blur?.();");
  let fadeSample = null;
  const fadeDeadline = Date.now() + 9000;
  while (Date.now() < fadeDeadline) {
    const raw = await browser.evaluate(`(() => {
      const root = document.getElementById('reader-inner');
      const b = document.getElementById('rdr-search-open');
      const dock = b.closest('.reader-dock');
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return JSON.stringify({
        visible: root.classList.contains('controls-visible'),
        opacity: Number(getComputedStyle(dock).opacity),
        hitIsButton: Boolean(hit && (hit === b || b.contains(hit))),
      });
    })()`);
    const sample = JSON.parse(raw);
    if (!sample.visible && sample.opacity > 0.05) { fadeSample = sample; break; }
    await delay(20);
  }
  assert.ok(fadeSample, "auto-hide fade window was never observed");
  assert.equal(fadeSample.hitIsButton, true, `controls are visible (opacity ${fadeSample.opacity}) but not hit-testable - taps fall through to the page`);

  // ------------------------------------------------ tüm kitaplarda smoke test
  const searchable = RAVZA_BOOKS.filter(book => book.type === "pdf" || book.pdf || book.file);
  assert.ok(searchable.length >= 5, "registry should expose several PDF books");
  const bookReport = [];
  for (const book of searchable) {
    await openBook(book.id);
    await tapSearchButton();
    await waitFor(isOpen, `${book.id}: search opens`);
    await browser.evaluate(`(() => { const i=document.getElementById('rdr-search-input'); i.value='a'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await delay(1200);
    const state = await browser.evaluate("document.getElementById('rdr-search-state')?.textContent || ''");
    assert.ok(state.trim().length > 0, `${book.id}: search must never sit in a blank/silent state`);
    bookReport.push({ book: book.id, state: state.slice(0, 28) });
    await closeSearch();
  }

  const rejections = JSON.parse(await browser.evaluate("JSON.stringify(window.__rejections || [])"));
  assert.deepEqual(rejections, [], `unhandled rejections: ${rejections.join(" | ")}`);
  assertCleanDiagnostics(browser, "reader search reliability");
  console.table(bookReport);
  console.log(`PASS search reliability: 50/50 open+close, 20 rapid clicks -> 1 dialog, loading-state search, fade-window hit test, ${searchable.length} books smoke`);
} finally {
  await browser.close();
  await server.close();
}
