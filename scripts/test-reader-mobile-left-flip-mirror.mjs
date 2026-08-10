/**
 * MOBIL GERI CEVIRMEDE ON YUZ AYNA REGRESYONU.
 *
 * Sozlesme:
 *   ON YUZ   -> hicbir zaman aynali, hicbir zaman hayalet. Sayfanin KENDI
 *               tuvali (arka yuz katmaninin icindeki tuval degil) her zaman
 *               yatayda pozitif olcekli ve opaklik 1 olmali.
 *   ARKA YUZ -> aynali + soluk + opak kagit. Bu KORUNUR.
 *
 * Yakalanan hata: geri cevirme, birazdan ON YUZ olacak gercek sayfanin
 * tuvaline scaleX(-1) + opacity .22 uyguluyordu ve bunu ancak durum 'read'
 * olunca asenkron bir MutationObserver ile geri aliyordu. Olculdu: acik
 * temada durum 'read' olduktan SONRA on sayfa hala opacity .22 idi.
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
const browser = await ThemeTestBrowser.launch("reader-mobile-left-flip-mirror");
const artifactDir = join(ROOT, "test-artifacts", "reader-mobile-left-flip-mirror");
await mkdir(artifactDir, { recursive: true });

const screenshot = async (name) => {
  const { data } = await browser.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(data, "base64"));
};

const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 2, radiusY: 2 }],
});

/**
 * Her gorunur sayfa icin: KENDI tuvalinin etkin yatay olcegi ve opakligi,
 * ayrica arka yuz katmaninin durumu.
 */
const probe = () => browser.evaluate(`JSON.stringify((() => {
  const onscreen = element => {
    const r = element.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.right > 2 && r.left < window.innerWidth - 2
      && r.bottom > 2 && r.top < window.innerHeight - 2;
  };
  const effectiveScaleX = node => {
    let matrix = new DOMMatrix();
    let current = node;
    while (current && current !== document.body) {
      const transform = getComputedStyle(current).transform;
      if (transform && transform !== 'none') matrix = new DOMMatrix(transform).multiply(matrix);
      current = current.parentElement;
    }
    return matrix.a;
  };
  const pages = [];
  for (const page of document.querySelectorAll('.pdf-page')) {
    if (!onscreen(page)) continue;
    const layer = page.querySelector('.pdf-backside-print');
    // Sayfanin KENDI tuvali: arka yuz katmaninin icindekiler haric.
    const own = [...page.querySelectorAll('canvas')].find(c => !c.closest('.pdf-backside-print'));
    const backCanvas = layer?.querySelector('canvas') || null;
    pages.push({
      pdfPage: Number(page.dataset.pdfPage),
      marker: page.dataset.mobileFlipBacksidePage ?? null,
      duplicate: document.querySelectorAll('.pdf-page[data-pdf-page="' + page.dataset.pdfPage + '"]').length > 1,
      own: own ? {
        scaleX: +effectiveScaleX(own).toFixed(3),
        cssTransform: own.style.transform || 'none',
        opacity: Number(getComputedStyle(own).opacity),
      } : null,
      backside: backCanvas ? {
        cssTransform: getComputedStyle(backCanvas).transform,
        opacity: Number(getComputedStyle(backCanvas).opacity),
        paperAlpha: (() => {
          const parts = String(getComputedStyle(layer).backgroundColor).match(/[\\d.]+/g) || [];
          return parts.length >= 4 ? Number(parts[3]) : 1;
        })(),
      } : null,
    });
  }
  return {
    state: document.getElementById('reader-inner')?.dataset.pageFlipState || '',
    currentPage: Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
    pages,
  };
})())`).then((raw) => JSON.parse(raw));

/** ON YUZ SOZLESMESI: hicbir gercek sayfa tuvali aynali/hayalet olamaz. */
function assertFrontClean(snapshot, label) {
  for (const page of snapshot.pages) {
    if (!page.own) continue;
    // Ileri cevirmede PageFlip'in gecici KOPYASI bir arka yuzdur; onun kendi
    // tuvali bilerek aynalidir. Kopya = ayni sayfadan iki dugum + isaretli.
    const isForwardClone = page.duplicate && page.marker !== null && !page.backside;
    if (isForwardClone) continue;
    assert.ok(
      page.own.scaleX > 0,
      `${label}: sayfa ${page.pdfPage} ON YUZU aynalanmis (etkin scaleX ${page.own.scaleX}, css "${page.own.cssTransform}")`,
    );
    assert.equal(
      page.own.opacity, 1,
      `${label}: sayfa ${page.pdfPage} ON YUZU hayalet opaklikta (${page.own.opacity})`,
    );
  }
}

async function openReader(viewport, theme, page) {
  await browser.setViewport({ width: viewport.width, height: viewport.height, mobile: true, deviceScaleFactor: 2 });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'page',pageSound:false,theme:${JSON.stringify(theme)}}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'kucuk-prens':{page:${page}}}));
    location.reload();`);
  await delay(700);
  await browser.waitFor("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]')", "kitaplık", 45000);
  await browser.evaluate("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]').click()");
  await browser.waitFor(
    "document.querySelector('.pdf-page.is-rendered') && document.getElementById('ravzabooks')?.dataset.appMode === 'reading'",
    "okuyucu", 60000,
  );
  await delay(1500);
}

const stageBox = () => browser.evaluate(
  "JSON.stringify((() => { const r = document.getElementById('rdr-stage').getBoundingClientRect(); return { left:r.left, right:r.right, y:r.top + r.height/2 }; })())",
).then(JSON.parse);

/** Kenardan surukle; her adimda on yuz sozlesmesini dogrula. */
async function dragFrom(edge, { commit, label }) {
  const box = await stageBox();
  const startX = edge === "left" ? box.left + 6 : box.right - 6;
  const endX = commit
    ? (edge === "left" ? box.right - 24 : box.left + 24)
    : (edge === "left" ? box.left + 44 : box.right - 44);
  await touch("touchStart", startX, box.y);
  let sawBackside = false;
  for (let step = 1; step <= 8; step += 1) {
    await touch("touchMove", startX + ((endX - startX) * step) / 8, box.y);
    await delay(55);
    const snapshot = await probe();
    assertFrontClean(snapshot, `${label} sürükleme %${Math.round((step / 8) * 100)}`);
    if (snapshot.pages.some((p) => p.backside)) sawBackside = true;
  }
  await touch("touchEnd", endX, box.y);
  return sawBackside;
}

try {
  /* ---- 1. KARARLI ON YUZ ---- */
  await openReader({ width: 440, height: 956 }, "black", 12);
  assertFrontClean(await probe(), "başlangıç");
  await screenshot("440x956-black-00-stable");

  /* ---- 2-4. SOL KENAR: SURUKLE, IPTAL ET ---- */
  await dragFrom("left", { commit: false, label: "sol iptal" });
  await delay(2000);
  const cancelled = await probe();
  assertFrontClean(cancelled, "sol sürükleme iptal sonrası");
  assert.equal(cancelled.state, "read", "iptal sonrası okuma durumuna dönülmedi");
  assert.equal(
    await browser.evaluate("document.querySelectorAll('.pdf-backside-print').length"), 0,
    "iptal sonrası arka yüz katmanı DOM'da kaldı",
  );
  await screenshot("440x956-black-01-left-cancelled");

  /* ---- 5. SOL KENAR: TAMAMLA ---- */
  const before = (await probe()).currentPage;
  await dragFrom("left", { commit: true, label: "sol tamamla" });
  await delay(2400);
  const completed = await probe();
  assertFrontClean(completed, "sol çevirme tamamlandıktan sonra");
  assert.ok(completed.currentPage < before, `geri çevirme sayfayı geriye almadı (${before} -> ${completed.currentPage})`);
  assert.equal(
    await browser.evaluate("document.querySelectorAll('.pdf-backside-print').length"), 0,
    "tamamlanan çevirme sonrası arka yüz katmanı DOM'da kaldı",
  );
  await screenshot("440x956-black-02-left-completed");

  /* ---- 3. GERCEK ARKA YUZ HALA AYNALI VE SOLUK ---- */
  await browser.evaluate("document.querySelector('#rdr-stage')");
  const box = await stageBox();
  await touch("touchStart", box.left + 6, box.y);
  for (let step = 1; step <= 4; step += 1) {
    await touch("touchMove", box.left + 6 + (box.right - box.left) * 0.45 * (step / 4), box.y);
    await delay(60);
  }
  const midFlip = await probe();
  assertFrontClean(midFlip, "sol sürükleme ortası");
  await screenshot("440x956-black-03-left-midflip");
  const backside = midFlip.pages.find((p) => p.backside)?.backside;
  assert.ok(backside, "geri çevirmede arka yüz baskısı hiç oluşmadı (arka yüz efekti kaybolmuş)");
  assert.match(
    backside.cssTransform, /matrix\(-1(?:\.0+)?, 0, 0, 1(?:\.0+)?, 0, 0\)/,
    `arka yüz yatay ters değil (${backside.cssTransform})`,
  );
  assert.ok(
    backside.opacity >= 0.12 && backside.opacity <= 0.28,
    `arka yüz baskısı doğal şekilde soluk değil (${backside.opacity})`,
  );
  assert.ok(backside.paperAlpha >= 0.99, `arka yüz kağıdı saydam (${backside.paperAlpha})`);
  await touch("touchEnd", box.left + 6, box.y);
  await delay(2000);
  assertFrontClean(await probe(), "arka yüz kontrolü sonrası");

  /* ---- 6. SAG KENAR (ileri) DAVRANISI BOZULMADI ---- */
  await dragFrom("right", { commit: true, label: "sağ tamamla" });
  await delay(2400);
  const forward = await probe();
  assertFrontClean(forward, "sağ çevirme tamamlandıktan sonra");
  await screenshot("440x956-black-04-right-completed");

  /* ---- HIZLI YON DEGISIMI: BAYAT AYNA KALMASIN ---- */
  for (const sequence of [["left", false], ["right", true], ["left", true], ["right", false]]) {
    await dragFrom(sequence[0], { commit: sequence[1], label: `hızlı ${sequence[0]}` });
    await delay(1600);
    assertFrontClean(await probe(), `hızlı ${sequence[0]} sonrası`);
  }
  assert.equal(
    await browser.evaluate("document.querySelectorAll('.pdf-backside-print').length"), 0,
    "hızlı yön değişimi sonrası bayat arka yüz katmanı",
  );

  /* ---- TUM VIEWPORT VE TEMALAR ---- */
  const matrix = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 393, height: 852 }, { width: 430, height: 932 }, { width: 440, height: 956 }]) {
    for (const theme of ["light", "sepia", "dark", "black"]) {
      await openReader(viewport, theme, 12);
      assertFrontClean(await probe(), `${viewport.width} ${theme} başlangıç`);
      await dragFrom("left", { commit: true, label: `${viewport.width} ${theme} sol` });
      await delay(2200);
      assertFrontClean(await probe(), `${viewport.width} ${theme} sol tamamlandı`);
      await dragFrom("right", { commit: true, label: `${viewport.width} ${theme} sağ` });
      await delay(2200);
      const end = await probe();
      assertFrontClean(end, `${viewport.width} ${theme} sağ tamamlandı`);
      matrix.push({ viewport: `${viewport.width}x${viewport.height}`, theme, page: end.currentPage, layers: 0 });
    }
  }
  console.table(matrix);

  /* ---- KLAVYE ILE GERI CEVIRME: OTURAN ON SAYFA HAYALET OLMAMALI ---- */
  await openReader({ width: 440, height: 956 }, "light", 12);
  await browser.key("ArrowLeft");
  for (let i = 0; i < 12; i += 1) {
    assertFrontClean(await probe(), `klavye geri t${i}`);
    await delay(60);
  }
  await delay(1500);
  assertFrontClean(await probe(), "klavye geri son");

  assertCleanDiagnostics(browser, "reader mobile left flip mirror");
  console.log("PASS mobile left-flip mirror: ön yüz hiçbir durumda aynalı/hayalet değil, gerçek arka yüz baskısı korunuyor");
} finally {
  await browser.close();
  await server.close();
}
