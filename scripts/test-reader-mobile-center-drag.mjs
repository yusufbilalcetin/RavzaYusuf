/**
 * MOBIL GENIS ALAN SURUKLEME.
 *
 * Sozlesme: sayfa yalnizca kenardan degil GOVDESINDEN de cevrilebilir.
 *   - x=%50 y=%50'den sola surukleme  -> SONRAKI, etkilesimli kivrimla
 *   - x=%50 y=%50'den saga surukleme  -> ONCEKI, etkilesimli kivrimla
 *   - tek dokunus                      -> sayfa DEGISMEZ
 *   - dikey surukleme                  -> sayfa DEGISMEZ
 *   - iptal                            -> sayfa DEGISMEZ, durum 'read'
 *
 * "Etkilesimli" olmak zorunlu: parmak hareket ederken kivrim GORUNUR olmali.
 * Yalnizca "sayfa numarasi degisti" demek yeterli degildir - eski kod da
 * kenardan bunu yapiyordu; kirilan sey govdeden baslatabilmekti.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, assertCleanDiagnostics, delay, ensureTestServer } from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-mobile-center-drag");
const artifactDir = join(ROOT, "test-artifacts", "reader-mobile-center-drag");
await mkdir(artifactDir, { recursive: true });

const shot = async (name) => {
  const { data } = await browser.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(data, "base64"));
};
const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4 }],
});

const state = () => browser.evaluate(`JSON.stringify((() => {
  const onscreen = e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.right > 0 && r.left < window.innerWidth; };
  const moving = [...document.querySelectorAll('.stf__item')].filter(e => {
    const t = getComputedStyle(e).transform;
    return onscreen(e) && t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
  });
  return {
    page: Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
    flipState: document.getElementById('reader-inner')?.dataset.pageFlipState || '',
    folding: moving.length,
  };
})())`).then((raw) => JSON.parse(raw));

async function openReader(viewport, page = 12) {
  await browser.setViewport({ width: viewport.width, height: viewport.height, mobile: true, deviceScaleFactor: 2 });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'page',pageSound:false,theme:'light'}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'kucuk-prens':{page:${page}}}));
    location.reload();`);
  await delay(700);
  await browser.waitFor("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]')", "kitaplık", 45000);
  await browser.evaluate("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]').click()");
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "okuyucu", 60000);
  await delay(1600);
}

/** Surukle; yol boyunca kivrimin GORUNUR oldugunu dogrula. */
async function drag({ x, y, dx, steps = 10, commit = true, vertical = 0 }) {
  await touch("touchStart", x, y);
  let sawFold = 0;
  for (let step = 1; step <= steps; step += 1) {
    await touch("touchMove", x + (dx * step) / steps, y + (vertical * step) / steps);
    await delay(45);
    if ((await state()).folding > 0) sawFold += 1;
  }
  const endX = commit ? x + dx : x;
  if (!commit) {
    // Parmagi baslangica geri getir: iptal
    for (let step = 1; step <= 5; step += 1) {
      await touch("touchMove", x + dx - (dx * step) / 5, y);
      await delay(45);
    }
  }
  await touch("touchEnd", endX, y + vertical);
  await delay(2400);
  return { sawFold, ...(await state()) };
}

try {
  const VP = { width: 440, height: 956 };
  const CX = VP.width / 2;
  const CY = VP.height / 2;

  /* ---- 1. TAM MERKEZDEN SONRAKI ---- */
  await openReader(VP);
  const beforeNext = (await state()).page;
  await shot("center-next-before");
  const next = await drag({ x: CX, y: CY, dx: -Math.round(VP.width * 0.6) });
  await shot("center-next-after");
  assert.ok(next.sawFold > 0, "tam merkezden SONRAKI: sürükleme sırasında kıvrım hiç görünmedi (etkileşimli değil)");
  assert.equal(next.page, beforeNext + 1, `tam merkezden SONRAKI çalışmadı (${beforeNext} -> ${next.page})`);
  assert.equal(next.flipState, "read", "SONRAKI sonrası okuma durumuna dönülmedi");

  /* ---- 2. TAM MERKEZDEN ONCEKI ---- */
  const beforePrev = (await state()).page;
  const prev = await drag({ x: CX, y: CY, dx: Math.round(VP.width * 0.6) });
  await shot("center-previous-after");
  assert.ok(prev.sawFold > 0, "tam merkezden ÖNCEKİ: sürükleme sırasında kıvrım hiç görünmedi");
  assert.equal(prev.page, beforePrev - 1, `tam merkezden ÖNCEKİ çalışmadı (${beforePrev} -> ${prev.page})`);
  assert.equal(prev.flipState, "read", "ÖNCEKİ sonrası okuma durumuna dönülmedi");

  /* ---- 3. TEK DOKUNUS SAYFAYI CEVIRMEZ ---- */
  const beforeTap = (await state()).page;
  await touch("touchStart", CX, CY);
  await delay(90);
  await touch("touchEnd", CX, CY);
  await delay(1200);
  const afterTap = await state();
  assert.equal(afterTap.page, beforeTap, `merkez dokunuşu sayfayı çevirdi (${beforeTap} -> ${afterTap.page})`);

  /* ---- 4. DIKEY SURUKLEME SAYFAYI CEVIRMEZ ---- */
  const beforeVertical = (await state()).page;
  const verticalDrag = await drag({ x: CX, y: CY, dx: 6, vertical: 220 });
  assert.equal(verticalDrag.page, beforeVertical, `dikey sürükleme sayfayı çevirdi (${beforeVertical} -> ${verticalDrag.page})`);
  assert.equal(verticalDrag.folding === 0, true, "dikey sürüklemede kıvrım başladı");

  /* ---- 5. IPTAL ---- */
  const beforeCancel = (await state()).page;
  const cancelled = await drag({ x: CX, y: CY, dx: -Math.round(VP.width * 0.18), commit: false });
  await shot("center-cancelled");
  assert.ok(cancelled.sawFold > 0, "iptal senaryosunda kıvrım hiç oluşmadı (test anlamsız olurdu)");
  assert.equal(cancelled.page, beforeCancel, `iptal edilen sürükleme sayfayı çevirdi (${beforeCancel} -> ${cancelled.page})`);
  assert.equal(cancelled.flipState, "read", "iptal sonrası okuma durumuna dönülmedi");

  /* ---- 6. X VARYASYONU: %25 / %50 / %75 ---- */
  const xMatrix = [];
  for (const ratio of [0.25, 0.5, 0.75]) {
    await openReader(VP);
    const start = (await state()).page;
    const result = await drag({ x: VP.width * ratio, y: CY, dx: -Math.round(VP.width * 0.6) });
    xMatrix.push({ startX: `%${ratio * 100}`, folded: result.sawFold > 0, page: `${start}->${result.page}` });
    assert.ok(result.sawFold > 0, `x=%${ratio * 100}: kıvrım görünmedi`);
    assert.equal(result.page, start + 1, `x=%${ratio * 100}: sayfa ilerlemedi`);
  }
  console.table(xMatrix);

  /* ---- 7. DIGER MOBIL VIEWPORT'LAR ---- */
  const vpMatrix = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 393, height: 852 }, { width: 430, height: 932 }]) {
    await openReader(viewport);
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const start = (await state()).page;
    const fwd = await drag({ x: cx, y: cy, dx: -Math.round(viewport.width * 0.6) });
    assert.ok(fwd.sawFold > 0, `${viewport.width}: merkez SONRAKI kıvrımı yok`);
    assert.equal(fwd.page, start + 1, `${viewport.width}: merkez SONRAKI çalışmadı`);
    const back = await drag({ x: cx, y: cy, dx: Math.round(viewport.width * 0.6) });
    assert.ok(back.sawFold > 0, `${viewport.width}: merkez ÖNCEKİ kıvrımı yok`);
    assert.equal(back.page, start, `${viewport.width}: merkez ÖNCEKİ çalışmadı`);
    // Kenar davranisi da korunmali
    const edge = await drag({ x: viewport.width - 8, y: cy, dx: -Math.round(viewport.width * 0.6) });
    assert.equal(edge.page, start + 1, `${viewport.width}: kenar SONRAKI bozuldu`);
    vpMatrix.push({ viewport: `${viewport.width}x${viewport.height}`, center: "OK", edge: "OK" });
  }
  console.table(vpMatrix);

  assertCleanDiagnostics(browser, "reader mobile center drag");
  console.log("PASS mobile center drag: gövdeden sürükleme etkileşimli çalışıyor, dokunuş/dikey sayfa çevirmiyor");
} finally {
  await browser.close();
  await server.close();
}
