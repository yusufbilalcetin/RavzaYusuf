/**
 * ARAMA YARIŞLARI — belirlenimci olmalı.
 *
 * Buradaki senaryolar "bazen çalışıyor" şikâyetinin arkasındaki zamanlama
 * pencerelerini bilerek tetikler: kitap daha açılırken, indeksleme sürerken,
 * kitap/tema/viewport değişirken ve sayfa çevirme animasyonunun ortasında.
 */
import assert from "node:assert/strict";
import {
  ThemeTestBrowser,
  assertCleanDiagnostics,
  delay,
  ensureTestServer,
} from "./lib/theme-test-runtime.mjs";

const MOBILE = { width: 440, height: 956, deviceScaleFactor: 3, mobile: true };
const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-search-races");

const isOpen = () => browser.evaluate("Boolean(document.getElementById('rdr-search-sheet')?.open)");
const searchState = () => browser.evaluate("document.getElementById('rdr-search-state')?.textContent || ''");
const currentPage = () => browser.evaluate("Number(document.getElementById('reader-inner')?.dataset.currentPage || 0)");

async function until(predicate, label, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await delay(30);
  }
  throw new Error(`timeout: ${label}`);
}

async function openBook(bookId, { mode = "page", theme = "light", waitReady = true } = {}) {
  await browser.setViewport(MOBILE);
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:${JSON.stringify(mode)},pageSound:false,theme:${JSON.stringify(theme)}}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'${bookId}':{page:24}}));
    location.reload();`);
  await browser.waitFor("document.querySelector('.library-book-card')", "library", 30000);
  await browser.evaluate(`window.__rejections = []; addEventListener('unhandledrejection', e => window.__rejections.push(String(e.reason?.message || e.reason)));`);
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="${bookId}"]').click()`);
  if (waitReady) {
    await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "reader ready", 60000);
    await delay(400);
  } else {
    await browser.waitFor("document.getElementById('rdr-search-open')", "toolbar", 30000);
  }
}

const clickSearch = () => browser.evaluate("document.getElementById('rdr-search-open')?.click()");
const type = (value) => browser.evaluate(`(() => { const i=document.getElementById('rdr-search-input'); i.value=${JSON.stringify(value)}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
async function closeSearch(label = "") {
  await browser.evaluate("document.querySelector('#rdr-search-sheet [data-close-sheet]')?.click()");
  await until(async () => !(await isOpen()), `close ${label}`);
}

const results = [];
const record = (name, detail = "") => results.push({ scenario: name, detail });

try {
  // A) kitap açılır açılmaz
  await openBook("kucuk-prens", { waitReady: false });
  await clickSearch();
  await until(isOpen, "A: opens immediately after book open");
  // Kabuk yükleme bitince yeniden basılıyor; kapatmadan önce okuyucunun
  // gerçekten hazır olmasını bekle, yoksa test kendi yarışını ölçer.
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "A: reader ready", 60000);
  await delay(700);
  record("A immediately-after-open", (await isOpen()) ? "stayed open" : "reopened after load");
  if (await isOpen()) await closeSearch("A");

  // B) indeksleme sürerken yazmak — sorgu kaybolmamalı
  await openBook("kralin-donusu-jrr-tolkien");
  await clickSearch();
  await until(isOpen, "B: open");
  await type("the");
  await until(async () => /sonuç|Sonuç/.test(await searchState()), "B: query typed during indexing resolves", 60000);
  record("B typed-during-indexing", (await searchState()).slice(0, 24));
  await closeSearch("B");

  // C) indeksleme sürerken kapat, hemen yeniden aç
  await openBook("kralin-donusu-jrr-tolkien");
  await clickSearch();
  await until(isOpen, "C: open");
  await type("the");
  await delay(120);
  await closeSearch("C1");
  await clickSearch();
  await until(isOpen, "C: reopen right after closing mid-indexing");
  record("C close-then-reopen-during-indexing");
  await closeSearch("C2");

  // D) indeksleme sürerken kitap değiştir — eski sonuç yeni kitaba yazılmamalı
  await openBook("kralin-donusu-jrr-tolkien");
  await clickSearch();
  await until(isOpen, "D: open");
  await type("the");
  await delay(150);
  await closeSearch("D-pre");
  await browser.evaluate("window.navigate && window.navigate('ravza-books')");
  await browser.waitFor("document.querySelector('.library-book-card')", "library back", 20000);
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="kucuk-prens"]').click()`);
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "second book", 60000);
  await delay(400);
  await clickSearch();
  await until(isOpen, "D: search after book switch");
  await type("prens");
  await until(async () => /sonuç|Sonuç/.test(await searchState()), "D: results for the new book", 60000);
  const pages = await browser.evaluate(`JSON.stringify([...document.querySelectorAll('#rdr-search-results [data-goto-page]')].map(b => Number(b.dataset.gotoPage)))`);
  const parsed = JSON.parse(pages);
  assert.ok(parsed.length > 0, "D: new book produced no results");
  const total = await browser.evaluate("Number(document.getElementById('reader-inner')?.dataset.totalPages || 0) || document.querySelectorAll('.book-sheet').length");
  assert.ok(parsed.every(page => page >= 1 && page <= total + 1), `D: stale result pages leaked from the previous book (${pages}, total ${total})`);
  record("D book-switch-during-indexing", `${parsed.length} results`);
  await closeSearch("D");

  // E) indeksleme sürerken tema değişimi — indeks bozulmamalı (§90)
  await openBook("kucuk-prens");
  await clickSearch();
  await until(isOpen, "E: open");
  await type("prens");
  await delay(120);
  for (const theme of ["sepia", "dark", "black", "light"]) {
    await browser.evaluate(`document.querySelector('.theme-btn[data-theme="${theme}"]')?.click()`);
    await delay(120);
  }
  await until(async () => /sonuç|Sonuç/.test(await searchState()), "E: results survive theme changes", 60000);
  assert.equal(await isOpen(), true, "E: theme change closed the search dialog");
  record("E theme-change-during-indexing", (await searchState()).slice(0, 24));
  await closeSearch("E");

  // F) indeksleme sürerken viewport değişimi
  await openBook("kucuk-prens");
  await clickSearch();
  await until(isOpen, "F: open");
  await type("prens");
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 440, height: 956 }]) {
    await browser.setViewport({ ...viewport, deviceScaleFactor: 3, mobile: true });
    await delay(200);
  }
  await until(async () => /sonuç|Sonuç/.test(await searchState()), "F: results survive resizes", 60000);
  record("F resize-during-indexing");
  await closeSearch("F");

  // G) sonuç tıklama -> doğru sayfa, sonra sayfa çevirme hâlâ çalışıyor
  await openBook("kucuk-prens");
  await clickSearch();
  await until(isOpen, "G: open");
  await type("prens");
  await until(async () => Number(await browser.evaluate("document.querySelectorAll('#rdr-search-results [data-goto-page]').length")) > 0, "G: results", 60000);
  const target = await browser.evaluate(`(() => { const b=document.querySelector('#rdr-search-results [data-goto-page]'); const p=Number(b.dataset.gotoPage); b.click(); return p; })()`);
  await until(async () => (await currentPage()) === target, `G: navigate to page ${target}`);
  // §93 tam boy yaprak korunmalı
  const geometry = await browser.evaluate(`(() => {
    const stage = document.getElementById('rdr-stage').getBoundingClientRect();
    const sheet = [...document.querySelectorAll('.stf__item')].find(el => el.getBoundingClientRect().width > 1)?.getBoundingClientRect();
    return JSON.stringify({ stageH: stage.height, sheetH: sheet ? sheet.height : 0 });
  })()`);
  const geo = JSON.parse(geometry);
  assert.ok(Math.abs(geo.sheetH - geo.stageH) <= 3, `G: search navigation broke the full-height sheet (${geo.sheetH} vs ${geo.stageH})`);
  record("G result-click + full-sheet intact", `page ${target}`);

  // H) sonuç sonrası sayfa çevirme — okuyucuda yön düğmesi YOK, klavye ile.
  const before = await currentPage();
  await browser.command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await browser.command("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await until(async () => (await currentPage()) !== before, "H: page turn after search navigation");
  record("H page-turn-after-search", `${before} -> ${await currentPage()}`);

  // I) sürekli modda arama
  await openBook("kucuk-prens", { mode: "scroll" });
  await clickSearch();
  await until(isOpen, "I: search opens in continuous mode");
  await type("prens");
  await until(async () => /sonuç|Sonuç/.test(await searchState()), "I: continuous results", 60000);
  record("I continuous-mode-search", (await searchState()).slice(0, 24));
  await closeSearch("I");

  // J) Page <-> Continuous turları
  for (let i = 0; i < 5; i += 1) {
    const mode = i % 2 ? "page" : "scroll";
    await openBook("kucuk-prens", { mode });
    await clickSearch();
    await until(isOpen, `J: cycle ${i} (${mode})`);
    await closeSearch();
  }
  record("J mode-switch-cycles", "5 cycles");

  const rejections = JSON.parse(await browser.evaluate("JSON.stringify(window.__rejections || [])"));
  assert.deepEqual(rejections, [], `unhandled rejections: ${rejections.join(" | ")}`);
  assertCleanDiagnostics(browser, "reader search races");
  console.table(results);
  console.log("PASS search races: open-during-load, typing/close/book-switch/theme/resize during indexing, result navigation, continuous mode");
} finally {
  await browser.close();
  await server.close();
}
