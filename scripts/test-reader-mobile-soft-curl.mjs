/**
 * MOBIL YUMUSAK KIVRIM GEOMETRISI.
 *
 * Dogrulanan sozlesme:
 *   1. Icerik sayfalari SOFT yogunlukta (sert kart degil).
 *   2. Fizik sinirlari FIZIKSEL YAPRAKLA ayni (tam boy), PDF icerik
 *      kutusuyla degil.
 *   3. Kivrim parmakla SUREKLI buyur - ani sicrama yok.
 *   4. Kivrim baslangic Y'sine duyarli (ust/orta/alt farkli geometri).
 *   5. Onceki/sonraki yonleri yaklasik simetrik.
 *   6. Arka yuz gorunur alani kademeli buyur; kucuk suruklemede sayfayi
 *      kaplamaz.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, assertCleanDiagnostics, delay, ensureTestServer } from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-mobile-soft-curl");
const artifactDir = join(ROOT, "test-artifacts", "reader-mobile-soft-curl");
await mkdir(artifactDir, { recursive: true });

const shot = async (name) => {
  const { data } = await browser.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(data, "base64"));
};
const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4 }],
});

const probe = () => browser.evaluate(`JSON.stringify((() => {
  const onscreen = e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.right > 0 && r.left < window.innerWidth; };
  const moving = [...document.querySelectorAll('.stf__item')].filter(e => {
    const t = getComputedStyle(e).transform;
    return onscreen(e) && t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
  });
  const m = moving[0];
  const matrix = m ? new DOMMatrix(getComputedStyle(m).transform) : null;
  const backWidths = [...document.querySelectorAll('.pdf-backside-print')].filter(onscreen).map(e => {
    const r = e.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)));
  });
  const rect = m ? m.getBoundingClientRect?.() : null;
  return {
    folding: moving.length,
    angle: matrix ? +(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI).toFixed(1) : null,
    tx: matrix ? +matrix.e.toFixed(1) : null,
    ty: matrix ? +matrix.f.toFixed(1) : null,
    top: m ? Math.round(m.getBoundingClientRect().top) : null,
    density: m ? (m.dataset.density || null) : null,
    backWidth: backWidths[0] ?? 0,
    flipState: document.getElementById('reader-inner')?.dataset.pageFlipState || '',
    page: Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
  };
})())`).then((raw) => JSON.parse(raw));

const geometry = () => browser.evaluate(`JSON.stringify((() => {
  const r = sel => { const el = document.querySelector(sel); if (!el) return null;
    const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
  const item = [...document.querySelectorAll('.stf__item')].find(e => e.getBoundingClientRect().width > 1);
  const ib = item?.getBoundingClientRect();
  // GORUNUR tuval: gizli/sifir boyutlu dugumler olcumu anlamsizlastiriyordu.
  const liveCanvas = [...document.querySelectorAll('.pdf-page canvas')]
    .find(c => c.getBoundingClientRect().width > 1 && !c.closest('.pdf-backside-print'));
  const cb = liveCanvas?.getBoundingClientRect();
  return {
    stage: r('#rdr-stage'), cradle: r('#book-cradle'), block: r('.stf__block'),
    item: ib ? [Math.round(ib.width), Math.round(ib.height)] : null,
    canvas: cb ? [Math.round(cb.width), Math.round(cb.height)] : null,
    contentDensities: [...document.querySelectorAll('.stf__item[data-density]')].map(e => e.dataset.density),
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

/** Parmak yolunu adim adim ilerlet, her adimda geometriyi kaydet. */
async function sweep({ x, y, dirSign, travels, name }) {
  await touch("touchStart", x, y);
  const rows = [];
  for (const travel of travels) {
    await touch("touchMove", x + dirSign * travel, y);
    await delay(45);
    rows.push({ travel, ...(await probe()) });
    if (name && [40, 120, 220].includes(travel)) await shot(`${name}-${travel}px`);
  }
  await touch("touchEnd", x + dirSign * travels.at(-1), y);
  await delay(2400);
  return rows;
}

try {
  const VP = { width: 440, height: 956 };
  const CY = VP.height / 2;
  const LEFT_EDGE = 8;
  const RIGHT_EDGE = VP.width - 8;
  const TRAVELS = [4, 8, 12, 20, 30, 45, 70, 110, 160, 220];

  /* ---- 1. FIZIK SINIRLARI = FIZIKSEL YAPRAK ---- */
  const geoMatrix = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 393, height: 852 }, { width: 430, height: 932 }, { width: 440, height: 956 }]) {
    await openReader(viewport);
    const g = await geometry();
    geoMatrix.push({ vp: `${viewport.width}x${viewport.height}`, stage: g.stage.join("x"), item: g.item.join("x"), canvas: g.canvas.join("x"), density: g.contentDensities.join(",") });
    assert.deepEqual(g.item, g.stage, `${viewport.width}: kıvrım fiziği yaprağı değil ${g.item} kutusunu kullanıyor (yaprak ${g.stage})`);
    assert.deepEqual(g.block, g.stage, `${viewport.width}: PageFlip bloğu yaprakla eşleşmiyor`);
    /* 2. ICERIK sayfalari SOFT olmali.
       Ilk ve son yaprak KAPAKTIR ve `showCover: true` ile bilerek hard'dir;
       aradaki her sayfa yumusak kagit gibi davranmali. */
    const interior = g.contentDensities.slice(1, -1);
    const hardInterior = interior.filter((d) => d !== "soft").length;
    assert.ok(interior.length > 10, `${viewport.width}: içerik sayfası bulunamadı`);
    assert.equal(hardInterior, 0, `${viewport.width}: ${hardInterior} içerik sayfası sert kart (hard)`);
    assert.equal(g.contentDensities[0], "hard", `${viewport.width}: kapak beklenmedik şekilde soft`);
    // PDF icerigi yapraktan KUCUK kalir (contain) - fizik onu kullanmamali
    assert.ok(g.canvas[1] < g.stage[1], `${viewport.width}: PDF içeriği yaprakla aynı yükseklikte, contain bozulmuş`);
  }
  console.table(geoMatrix);

  /* ---- 3. SUREKLI ILERLEME, ANI SICRAMA YOK ---- */
  await openReader(VP);
  // The inner 20%-80% route now belongs to the custom vertical-band renderer.
  // This legacy suite remains the St.PageFlip SOFT regression by entering from
  // the real page edges; custom-center geometry has two dedicated suites.
  const back = await sweep({ x: LEFT_EDGE, y: CY, dirSign: +1, travels: TRAVELS, name: "edge-previous" });
  const folded = back.filter((r) => r.folding > 0);
  assert.ok(folded.length >= 6, `kıvrım yeterince erken başlamadı (${folded.length}/${TRAVELS.length} örnekte)`);
  const firstFold = back.find((r) => r.folding > 0);
  assert.ok(firstFold.travel <= 16, `ölü bölge: ilk kıvrım ${firstFold.travel}px parmak yolundan sonra göründü`);

  // Arka yuz genisligi monoton buyumeli
  const widths = folded.map((r) => r.backWidth);
  for (let i = 1; i < widths.length; i += 1) {
    assert.ok(widths[i] >= widths[i - 1] - 2, `arka yüz alanı geri gitti: ${widths.join(" -> ")}`);
  }
  // Kucuk suruklemede sayfayi kaplamamali
  const early = folded.find((r) => r.travel <= 20);
  assert.ok(
    early.backWidth <= VP.width * 0.15,
    `küçük sürüklemede (${early.travel}px) arka yüz zaten ${early.backWidth}px - dev poligon`,
  );
  // Ardisik adimlar arasinda dev sicrama olmamali
  for (let i = 1; i < folded.length; i += 1) {
    const jump = folded[i].backWidth - folded[i - 1].backWidth;
    const travelStep = folded[i].travel - folded[i - 1].travel;
    assert.ok(
      jump <= travelStep + VP.width * 0.08,
      `%${Math.round((jump / VP.width) * 100)} ani sıçrama: ${folded[i - 1].travel}px -> ${folded[i].travel}px arasında arka yüz ${folded[i - 1].backWidth} -> ${folded[i].backWidth}`,
    );
  }
  console.table(folded.map((r) => ({ travel: r.travel, angle: r.angle, backWidth: r.backWidth, density: r.density })));

  /* ---- 4. Y DUYARLILIGI ---- */
  const yShapes = [];
  for (const ratio of [0.2, 0.5, 0.8]) {
    await openReader(VP);
    const rows = await sweep({ x: LEFT_EDGE, y: VP.height * ratio, dirSign: +1, travels: [12, 40, 80], name: `y${Math.round(ratio * 100)}` });
    const at80 = rows.at(-1);
    yShapes.push({ y: `%${ratio * 100}`, angle: at80.angle, top: at80.top, ty: at80.ty });
  }
  console.table(yShapes);
  const signature = (s) => `${s.angle}|${s.ty}`;
  assert.notEqual(signature(yShapes[0]), signature(yShapes[1]), "y=%20 ve y=%50 aynı kıvrım geometrisini üretti");
  assert.notEqual(signature(yShapes[1]), signature(yShapes[2]), "y=%50 ve y=%80 aynı kıvrım geometrisini üretti");
  assert.notEqual(signature(yShapes[0]), signature(yShapes[2]), "y=%20 ve y=%80 aynı kıvrım geometrisini üretti");

  /* ---- 5. ONCEKI / SONRAKI SIMETRISI ---- */
  await openReader(VP);
  const fwd = await sweep({ x: RIGHT_EDGE, y: CY, dirSign: -1, travels: TRAVELS });
  const fwdFolded = fwd.filter((r) => r.folding > 0);
  assert.ok(fwdFolded.length >= 6, "SONRAKI yönünde kıvrım oluşmadı");
  const fwdFirst = fwd.find((r) => r.folding > 0);
  assert.ok(
    Math.abs(fwdFirst.travel - firstFold.travel) <= 8,
    `yönler arasında aktivasyon eşiği asimetrik: ileri ${fwdFirst.travel}px, geri ${firstFold.travel}px`,
  );
  // Aci ilerlemesi her iki yonde de kademeli olmali
  const fwdSpan = Math.abs(fwdFolded.at(-1).angle - fwdFolded[0].angle);
  const backSpan = Math.abs(folded.at(-1).angle - folded[0].angle);
  assert.ok(fwdSpan > 5, `SONRAKI kıvrımı ilerlemiyor (açı değişimi ${fwdSpan}°)`);
  assert.ok(backSpan > 5, `ÖNCEKİ kıvrımı ilerlemiyor (açı değişimi ${backSpan}°)`);
  console.log(`açı değişimi: ileri ${fwdSpan.toFixed(1)}° · geri ${backSpan.toFixed(1)}°`);

  /* ---- 6. AYNA DUZELTMESI KORUNUYOR ---- */
  /* Ileri cevirmede PageFlip'in gecici KOPYASI bilerek aynalidir; olcut
     gercek sayfalardir (test-reader-mobile-left-flip-mirror ile ayni kural). */
  const frontClean = await browser.evaluate(`(() => {
    const onscreen = e => { const r = e.getBoundingClientRect();
      return r.width > 2 && r.right > 2 && r.left < window.innerWidth - 2; };
    for (const page of document.querySelectorAll('.pdf-page')) {
      if (!onscreen(page)) continue;
      const dup = document.querySelectorAll('.pdf-page[data-pdf-page="' + page.dataset.pdfPage + '"]').length > 1;
      const clone = dup && page.dataset.mobileFlipBacksidePage != null && !page.querySelector('.pdf-backside-print');
      if (clone) continue;
      const own = [...page.querySelectorAll('canvas')].find(c => !c.closest('.pdf-backside-print'));
      if (!own) continue;
      const m = new DOMMatrix(getComputedStyle(own).transform);
      if (!(m.a > 0) || Number(getComputedStyle(own).opacity) !== 1) return false;
    }
    return true;
  })()`);
  assert.ok(frontClean, "ön yüz aynalı/hayalet - ayna düzeltmesi bozulmuş");

  assertCleanDiagnostics(browser, "reader mobile soft curl");
  console.log("PASS mobile soft curl: soft yoğunluk, yaprakla eşleşen fizik, sürekli ve Y-duyarlı kıvrım");
} finally {
  await browser.close();
  await server.close();
}
