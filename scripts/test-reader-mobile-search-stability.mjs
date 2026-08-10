/**
 * MOBIL ARAMA KARARLILIGI.
 *
 * Kullanici sikayeti: "Ara'ya basiyorum, acilio sonra kendi kendine
 * kapaniyor / beni atiyor."
 *
 * Olculen kok neden: sanal klavye YALNIZCA yuksekligi kucultuyor,
 * getLayoutMetrics().key yuksekligi de icerdigi icin bu bir DUZEN
 * DEGISIKLIGI sayiliyor ve tam okuyucu yeniden kurulumu tetikleniyordu.
 * Kabuk yeniden kurulunca #rdr-search-sheet DOM'dan siliniyor:
 *
 *     13ms  resize 440x620
 *    221ms  sheet DOM'dan silindi
 *    300ms  display:none        <- kullanici "atildim" diyor
 *    600ms  geri yukleme aciyor
 *
 * Sozlesme: arama dialogu, KULLANICI kapatana veya bir sonuca gidene kadar
 * acik kalir. Yeniden dizme genel olarak KALDIRILMAZ - yalnizca klavye
 * kaynakli yukseklik degisimi haric tutulur.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, assertCleanDiagnostics, delay, ensureTestServer } from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-mobile-search-stability");
const artifactDir = join(ROOT, "test-artifacts", "reader-mobile-search-stability");
await mkdir(artifactDir, { recursive: true });

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 440, height: 956 },
];
const MARKS = [50, 250, 500, 1000, 2000];

const shot = async (name) => {
  const { data } = await browser.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(data, "base64"));
};
const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 8, radiusY: 8 }],
});

/** ACIK sayilmak icin: bagli, gorunur olcude, opak, etkilesime acik. */
const sheetState = () => browser.evaluate(`JSON.stringify((() => {
  const el = document.querySelector('#rdr-search-sheet');
  if (!el) return { open: false, present: false };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const open = el.isConnected && r.width > 1 && r.height > 1
    && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5;
  return {
    open, present: true, connected: el.isConnected, node: el.dataset.__stabilityId || null,
    width: Math.round(r.width), display: cs.display, opacity: Number(cs.opacity),
    query: document.getElementById('rdr-search-input')?.value ?? null,
    results: document.querySelectorAll('.reader-search-item[data-goto-page]').length,
    stateText: document.getElementById('rdr-search-state')?.textContent || '',
    page: Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
  };
})())`).then((raw) => JSON.parse(raw));

/** Dialog dugumune kimlik ver: yok olup yeniden yaratilmayi yakalamak icin. */
const tagSheet = () => browser.evaluate(`(() => {
  const el = document.querySelector('#rdr-search-sheet');
  if (el && !el.dataset.__stabilityId) el.dataset.__stabilityId = 'n' + Date.now();
  return el?.dataset.__stabilityId || null;
})()`);

async function openReader(viewport, { book = "kucuk-prens", page = 12, theme = "light", mode = "page" } = {}) {
  await browser.setViewport({ width: viewport.width, height: viewport.height, mobile: true, deviceScaleFactor: 3 });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:${JSON.stringify(mode)},pageSound:false,theme:${JSON.stringify(theme)}}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({${JSON.stringify(book)}:{page:${page}}}));
    location.reload();`);
  await delay(700);
  await browser.waitFor(`document.querySelector('.library-book-card[data-book-id=${JSON.stringify(book)}]')`, "kitaplık", 45000);
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id=${JSON.stringify(book)}]').click()`);
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "okuyucu", 60000);
  await delay(1400);
}

/** Ara dugmesine GERCEK dokunusla bas. */
async function tapSearch() {
  const box = await browser.evaluate(`JSON.stringify((() => {
    const b = document.getElementById('rdr-search-open');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })())`).then((raw) => JSON.parse(raw));
  assert.ok(box, "Ara düğmesi bulunamadı");
  await touch("touchStart", box.x, box.y);
  await delay(40);
  await touch("touchEnd", box.x, box.y);
}

const closeSearch = () => browser.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1");

try {
  let opens = 0;
  let involuntary = 0;
  const matrix = [];

  /* ---- 1. DORT VIEWPORT x 20 ACILIS x 5 ZAMAN NOKTASI ---- */
  for (const viewport of VIEWPORTS) {
    await openReader(viewport);
    let stable = 0;
    for (let i = 0; i < 20; i += 1) {
      await tapSearch();
      await delay(60);
      await tagSheet();
      let ok = true;
      let waited = 0;
      for (const mark of MARKS) {
        await delay(mark - waited);
        waited = mark;
        const s = await sheetState();
        if (!s.open) ok = false;
      }
      opens += 1;
      if (ok) stable += 1; else involuntary += 1;
      await closeSearch();
      await delay(320);
    }
    matrix.push({ viewport: `${viewport.width}x${viewport.height}`, stable: `${stable}/20` });
    assert.equal(stable, 20, `${viewport.width}: 20 açılışın ${20 - stable} tanesi kendiliğinden kapandı`);
  }
  console.table(matrix);

  /* ---- 2. SANAL KLAVYE REGRESYONU (asil kok neden) ---- */
  const keyboardMatrix = [];
  for (const viewport of VIEWPORTS) {
    await openReader(viewport);
    await tapSearch();
    await delay(500);
    await tagSheet();
    await browser.evaluate("document.getElementById('rdr-search-input')?.focus(); 1");
    await delay(200);
    const before = await sheetState();
    assert.ok(before.open, `${viewport.width}: klavye testi için arama açılamadı`);
    // Klavye: SADECE yükseklik küçülür, genişlik aynı kalır.
    await browser.setViewport({ width: viewport.width, height: viewport.height - 336, mobile: true, deviceScaleFactor: 3 });
    let survived = true;
    let waited = 0;
    for (const mark of [100, 300, 600, 1200, 2400]) {
      await delay(mark - waited);
      waited = mark;
      const s = await sheetState();
      if (!s.open || s.node !== before.node) survived = false;
    }
    const after = await sheetState();
    keyboardMatrix.push({ viewport: `${viewport.width}x${viewport.height}`, survived, node: after.node === before.node ? "aynı" : "YENİ" });
    assert.ok(survived, `${viewport.width}: sanal klavye arama dialogunu kapattı`);
    assert.equal(after.node, before.node, `${viewport.width}: dialog düğümü yeniden yaratıldı (kabuk yeniden kuruldu)`);
    // Klavye kapanınca da hayatta kalmalı
    await browser.setViewport({ width: viewport.width, height: viewport.height, mobile: true, deviceScaleFactor: 3 });
    await delay(2200);
    assert.ok((await sheetState()).open, `${viewport.width}: klavye kapanınca arama kapandı`);
  }
  console.table(keyboardMatrix);

  /* ---- 3. YAZARKEN VE KLAVYEYLE BIRLIKTE ---- */
  await openReader({ width: 440, height: 956 });
  await tapSearch();
  await delay(400);
  await tagSheet();
  await shot("440-01-opened");
  await browser.evaluate("(() => { const i = document.getElementById('rdr-search-input'); i.focus(); i.value='prens'; i.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await browser.setViewport({ width: 440, height: 620, mobile: true, deviceScaleFactor: 3 });
  await delay(2400);
  const typed = await sheetState();
  await shot("440-02-typed-with-keyboard");
  assert.ok(typed.open, "yazarken + klavye açıkken arama kapandı");
  assert.equal(typed.query, "prens", `sorgu korunmadı ("${typed.query}")`);
  await browser.waitFor("document.querySelectorAll('.reader-search-item[data-goto-page]').length > 0", "sonuçlar", 90000);
  const withResults = await sheetState();
  await shot("440-03-results");
  assert.ok(withResults.open, "sonuçlar gelince arama kapandı");
  assert.ok(withResults.results > 0, "sonuç yok");

  /* ---- 4. SONUC NAVIGASYONU = KASITLI KAPANIS ---- */
  const target = await browser.evaluate("Number(document.querySelector('.reader-search-item[data-goto-page]').dataset.gotoPage)");
  await browser.evaluate("document.querySelector('.reader-search-item[data-goto-page]').click()");
  await delay(2400);
  const afterNav = await sheetState();
  await shot("440-04-after-result-navigation");
  assert.equal(afterNav.open, false, "sonuca tıklandığında arama kapanmalıydı (kasıtlı kapanış)");
  assert.equal(afterNav.page, target, `sonuç navigasyonu yanlış sayfaya gitti (${afterNav.page} != ${target})`);

  /* ---- 5. SOGUK INDEKS: buyuk kitapta indeksleme boyunca acik kalmali ---- */
  await browser.setViewport({ width: 440, height: 956, mobile: true, deviceScaleFactor: 3 });
  await openReader({ width: 440, height: 956 }, { book: "ask-i-memnu", page: 40 });
  await tapSearch();
  await delay(200);
  await tagSheet();
  await browser.evaluate("(() => { const i = document.getElementById('rdr-search-input'); i.focus(); i.value='bihter'; i.dispatchEvent(new Event('input',{bubbles:true})); })()");
  let indexingSeen = false;
  for (let i = 0; i < 12; i += 1) {
    await delay(200);
    const s = await sheetState();
    assert.ok(s.open, `indeksleme sırasında arama kapandı (${i * 200}ms, durum "${s.stateText}")`);
    if (/taran/i.test(s.stateText)) indexingSeen = true;
  }
  await browser.waitFor("document.querySelectorAll('.reader-search-item[data-goto-page]').length > 0", "soğuk indeks sonuçları", 120000);
  assert.ok((await sheetState()).open, "indeks bitince arama kapandı");
  console.log(`soğuk indeks: indeksleme durumu görüldü=${indexingSeen}`);

  /* ---- 6. HIZLI 20 TIKLAMA -> TEK DIALOG, ACIK KALIR ----
     Dugmenin KENDISINE tiklanir (mevcut hardening testiyle ayni semantik).
     Koordinatla dokunmak anlamsiz olurdu: showModal() sonrasi ayni nokta
     artik backdrop'tur ve orada kapanmak MESRU davranistir. */
  await openReader({ width: 440, height: 956 });
  for (let i = 0; i < 20; i += 1) {
    await browser.evaluate("document.getElementById('rdr-search-open').click()");
    await delay(45);
  }
  await delay(1400);
  const rapid = await sheetState();
  const dialogCount = await browser.evaluate("document.querySelectorAll('#rdr-search-sheet').length");
  assert.equal(dialogCount, 1, `20 hızlı dokunuş ${dialogCount} dialog üretti`);
  assert.ok(rapid.open, "20 hızlı dokunuştan sonra arama kapalı");

  /* ---- 7. KAPAT / YENIDEN AC ---- */
  await closeSearch();
  await delay(600);
  assert.equal((await sheetState()).open, false, "kasıtlı kapatma çalışmadı");
  await tapSearch();
  await delay(700);
  assert.ok((await sheetState()).open, "yeniden açma çalışmadı");
  await closeSearch();
  await delay(400);

  /* ---- 8. SUREKLI MOD ---- */
  await openReader({ width: 440, height: 956 }, { mode: "scroll" });
  await tapSearch();
  await delay(300);
  let waited = 0;
  for (const mark of MARKS) {
    await delay(mark - waited); waited = mark;
    assert.ok((await sheetState()).open, `sürekli modda arama ${mark}ms'de kapandı`);
  }

  /* ---- 9. DORT TEMA ---- */
  for (const theme of ["light", "sepia", "dark", "black"]) {
    await openReader({ width: 440, height: 956 }, { theme });
    await tapSearch();
    await delay(1200);
    assert.ok((await sheetState()).open, `${theme} temasında arama kapandı`);
    await closeSearch();
    await delay(300);
  }

  const involuntaryRate = ((involuntary / opens) * 100).toFixed(1);
  console.log(`\naçılış=${opens} · istemsiz kapanma=${involuntary} (%${involuntaryRate}) · açılış başarısı %${(((opens - involuntary) / opens) * 100).toFixed(1)}`);
  assert.equal(involuntary, 0, `${involuntary} istemsiz kapanma`);

  assertCleanDiagnostics(browser, "reader mobile search stability");
  console.log("PASS mobile search stability: 80 açılış kararlı, sanal klavye dialogu kapatmıyor, sorgu korunuyor");
} finally {
  await browser.close();
  await server.close();
}
