/**
 * TEMA SÖZLEŞMESİ: kâğıt ve GERÇEK PDF METNİ temalanır, GÖRSELLER ASLA.
 *
 * Eskiden tema tuvalin tamamına filtre uyguluyordu (invert/sepia), bu da
 * metin + fotoğraf + vektör çizimi birlikte boyuyordu. Artık PDF.js'in
 * resmî `operationsFilter` kancasıyla iki geçiş yapılır: görsel geçişi
 * (metin boyama atlanır) ve metin geçişi (görsel boyama atlanır), metin
 * maskesi tema rengine boyanır.
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
import { RAVZA_BOOKS } from "../data/ravza-books.generated.js";

const THEMES = ["light", "sepia", "dark", "black"];
const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-theme-artwork");
const artifactDir = join(ROOT, "test-artifacts", "reader-theme-artwork");
await mkdir(artifactDir, { recursive: true });

async function open(bookId, page, theme, viewport = { width: 440, height: 956, deviceScaleFactor: 3, mobile: true }) {
  await browser.setViewport(viewport);
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'page',pageSound:false,theme:${JSON.stringify(theme)}}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'${bookId}':{page:${page}}}));
    location.reload();`);
  await browser.waitFor("document.querySelector('.library-book-card')", "library", 30000);
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="${bookId}"]').click()`);
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "reader", 60000);
  await delay(1000);
}

/** Görünen sayfanın tuvalinden ölçüm: filtre, baskın renk, doygun (görsel) pikseller. */
const sample = () => browser.evaluate(`(() => {
  const canvas = [...document.querySelectorAll('.pdf-page.is-rendered canvas')].find(c => c.getBoundingClientRect().width > 1);
  if (!canvas) return null;
  const tmp=document.createElement('canvas'); tmp.width=canvas.width; tmp.height=canvas.height; const tctx=tmp.getContext('2d',{willReadFrequently:true}); tctx.drawImage(canvas,0,0); const d = tctx.getImageData(0,0,tmp.width,tmp.height).data;
  const sat = (r,g,b) => Math.max(r,g,b)-Math.min(r,g,b);
  const lum = (r,g,b) => 0.2126*r+0.7152*g+0.0722*b;
  const buckets = new Map();
  let artR=0,artG=0,artB=0,artN=0;
  for (let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    // GÖRSEL: doygun renkli pikseller (metin/kâğıt nötrdür)
    if (sat(r,g,b) >= 60 && lum(r,g,b) > 25 && lum(r,g,b) < 235) { artR+=r; artG+=g; artB+=b; artN++; }
    const key = (r>>4)<<8 | (g>>4)<<4 | (b>>4);
    buckets.set(key, (buckets.get(key)||0)+1);
  }
  let topKey=0, topCount=0;
  for (const [k,c] of buckets) if (c>topCount) { topCount=c; topKey=k; }
  const dominant = [((topKey>>8)&15)*17, ((topKey>>4)&15)*17, (topKey&15)*17];
  return JSON.stringify({
    filter: getComputedStyle(canvas).filter,
    dominant, dominantLum: +(0.2126*dominant[0]+0.7152*dominant[1]+0.0722*dominant[2]).toFixed(1),
    artMean: artN ? [Math.round(artR/artN), Math.round(artG/artN), Math.round(artB/artN)] : null,
    artCount: artN,
    size: [canvas.width, canvas.height],
  });
})()`);

// Registry'den PDF kitaplar; başlık/kimlik sabit yazılmaz.
const PDF_BOOKS = RAVZA_BOOKS.filter(book => book.type === "pdf" || book.pdf || book.file);
// Görselli temsilî sayfalar (içerik tipine göre seçilir, kitaba özel mantık yok).
const ILLUSTRATED = [
  { id: "kucuk-prens", page: 5 },
  { id: "perili-kosk", page: 1 },
];
const TEXT_PAGE = { id: "kucuk-prens", page: 24 };

const rows = [];
try {
  // ---------------------------------------------- GÖRSEL KORUNUMU (§61-§65)
  for (const target of ILLUSTRATED) {
    let reference = null;
    for (const theme of THEMES) {
      await open(target.id, target.page, theme);
      const data = JSON.parse(await sample());
      assert.ok(data, `${target.id}: canvas not measurable`);
      // §74: tuvale tema filtresi UYGULANMAZ.
      assert.equal(data.filter, "none", `${target.id}/${theme}: whole-canvas theme filter is back (${data.filter})`);
      assert.ok(data.artCount > 200, `${target.id}/${theme}: no saturated artwork pixels found (${data.artCount})`);
      if (theme === "light") reference = data;
      else {
        const delta = Math.max(...data.artMean.map((v, i) => Math.abs(v - reference.artMean[i])));
        assert.ok(delta <= 12, `${target.id}/${theme}: ARTWORK RECOLOURED - mean ${JSON.stringify(data.artMean)} vs white reference ${JSON.stringify(reference.artMean)} (Δ${delta})`);
        rows.push({ book: target.id, page: target.page, theme, artMean: JSON.stringify(data.artMean), artDelta: delta, paperLum: data.dominantLum });
      }
      if (theme !== "light") continue;
      rows.push({ book: target.id, page: target.page, theme, artMean: JSON.stringify(data.artMean), artDelta: 0, paperLum: data.dominantLum });
      const shot = await browser.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(artifactDir, `${target.id}-p${target.page}-light.png`), Buffer.from(shot.data, "base64"));
    }
  }

  // ------------------------------- KÂĞIT + GERÇEK PDF METNİ TEMALANIYOR MU
  const paperLum = {};
  for (const theme of THEMES) {
    await open(TEXT_PAGE.id, TEXT_PAGE.page, theme);
    const data = JSON.parse(await sample());
    assert.equal(data.filter, "none", `text page/${theme}: whole-canvas filter present`);
    paperLum[theme] = data.dominantLum;
    const shot = await browser.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(artifactDir, `text-page-${theme}.png`), Buffer.from(shot.data, "base64"));
  }
  // Metin sayfasında baskın renk KAĞITTIR.
  assert.ok(paperLum.light > 200, `white theme paper is not light (lum ${paperLum.light})`);
  assert.ok(paperLum.sepia > 180, `paper theme paper is not warm-light (lum ${paperLum.sepia})`);
  assert.ok(paperLum.dark < 80, `DARK theme paper is not dark (lum ${paperLum.dark})`);
  assert.ok(paperLum.black < 60, `BLACK theme paper is not black (lum ${paperLum.black})`);

  // Gerçek PDF metni koyu temada AÇIK renkte mi? (kâğıdın tersi)
  await open(TEXT_PAGE.id, TEXT_PAGE.page, "dark");
  const darkText = JSON.parse(await browser.evaluate(`(() => {
    const canvas = [...document.querySelectorAll('.pdf-page.is-rendered canvas')].find(c => c.getBoundingClientRect().width > 1);
    const tmp=document.createElement('canvas'); tmp.width=canvas.width; tmp.height=canvas.height; const tctx=tmp.getContext('2d',{willReadFrequently:true}); tctx.drawImage(canvas,0,0); const d = tctx.getImageData(0,0,tmp.width,tmp.height).data;
    const lum = (r,g,b) => 0.2126*r+0.7152*g+0.0722*b;
    let light=0, dark=0;
    for (let i=0;i<d.length;i+=4){ const L=lum(d[i],d[i+1],d[i+2]); if (L>150) light++; else if (L<60) dark++; }
    return JSON.stringify({ light, dark, total: d.length/4 });
  })()`));
  assert.ok(darkText.light > 500, `dark theme: real PDF text is not light (${darkText.light} light px)`);
  assert.ok(darkText.dark > darkText.light, "dark theme: page is not predominantly dark paper");

  // ÇİFT METİN YOK (§19/§29). Görsel geçişinde metin kalırsa orijinal SİYAH
  // gliflerin kenarları temalı gliflerin altından taşar. Kâğıt #1b1b1b
  // (lum 27) olduğu için kâğıttan belirgin KOYU pikseller ancak sızmış
  // orijinal metinden gelebilir.
  const bleed = JSON.parse(await browser.evaluate(`(() => {
    const canvas = [...document.querySelectorAll('.pdf-page.is-rendered canvas')].find(c => c.getBoundingClientRect().width > 1);
    const tmp=document.createElement('canvas'); tmp.width=canvas.width; tmp.height=canvas.height; const tctx=tmp.getContext('2d',{willReadFrequently:true}); tctx.drawImage(canvas,0,0); const d = tctx.getImageData(0,0,tmp.width,tmp.height).data;
    const lum = (r,g,b) => 0.2126*r+0.7152*g+0.0722*b;
    let belowPaper = 0;
    for (let i=0;i<d.length;i+=4){ if (lum(d[i],d[i+1],d[i+2]) < 10) belowPaper++; }
    return JSON.stringify({ belowPaper, total: d.length/4 });
  })()`));
  const bleedRatio = bleed.belowPaper / bleed.total;
  assert.ok(
    bleedRatio < 0.005,
    `dark theme: original dark text bled through the artwork pass - ${bleed.belowPaper} px darker than paper (${(bleedRatio * 100).toFixed(2)}%). Layer separation is broken.`,
  );

  // ------------------------------------------------ TÜM KİTAPLAR SMOKE
  for (const book of PDF_BOOKS) {
    await open(book.id, 2, "dark");
    const data = JSON.parse(await sample());
    assert.equal(data.filter, "none", `${book.id}: whole-canvas theme filter present`);
  }

  assertCleanDiagnostics(browser, "reader theme artwork");
  console.table(rows);
  console.log("paper luminance by theme:", JSON.stringify(paperLum));
  console.log(`PASS theme artwork preservation: artwork identical across 4 themes (${ILLUSTRATED.length} illustrated pages), paper+text themed, no canvas filter, ${PDF_BOOKS.length} books smoke`);
} finally {
  await browser.close();
  await server.close();
}
