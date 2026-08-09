import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  ROOT,
  ThemeTestBrowser,
  assertCleanDiagnostics,
  delay,
  ensureTestServer,
} from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-mobile-full-sheet");
const artifactDir = join(ROOT, "test-artifacts", "reader-mobile-full-sheet");
await mkdir(artifactDir, { recursive: true });

const viewports = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 440, height: 956 },
];

const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd"
    ? []
    : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 2, radiusY: 2 }],
});

async function screenshot(name) {
  const shot = await browser.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(shot.data, "base64"));
}

async function openPdf(viewport, page = 24, mode = 'page', theme = 'light') {
  const mobile = viewport.mobile ?? viewport.width < 768;
  const deviceScaleFactor = viewport.deviceScaleFactor ?? (mobile ? 3 : 1);
  await browser.setViewport({ width:viewport.width, height:viewport.height, mobile, deviceScaleFactor });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:${JSON.stringify(mode)},pageSound:false,theme:${JSON.stringify(theme)}}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'kucuk-prens':{page:${page}}}));
    location.reload();
  `);
  await browser.waitFor("document.querySelector('.library-book-card')", "library reload", 30000);
  await browser.evaluate("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]').click()");
  await browser.waitFor(
    "document.querySelector('.pdf-page.is-rendered') && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
    "mobile PDF reader",
    60000,
  );
  await delay(900);
}

async function measure() {
  return browser.evaluate(`(() => {
    const shell = document.getElementById('screen-reader');
    const root = document.getElementById('reader-inner');
    const stage = document.getElementById('rdr-stage');
    const cradle = document.getElementById('book-cradle');
    const page = document.querySelector('.stf__block');
    if (!shell || !root || !stage || !cradle || !page) return null;
    const rect = element => {
      const value = element.getBoundingClientRect();
      return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
    };
    const stageRect = rect(stage);
    const style = getComputedStyle(stage);
    const padding = {
      left: parseFloat(style.paddingLeft) || 0,
      right: parseFloat(style.paddingRight) || 0,
      top: parseFloat(style.paddingTop) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
    };
    const usable = {
      left: stageRect.left + padding.left,
      right: stageRect.right - padding.right,
      top: stageRect.top + padding.top,
      bottom: stageRect.bottom - padding.bottom,
      width: stageRect.width - padding.left - padding.right,
      height: stageRect.height - padding.top - padding.bottom,
    };
    const vv = window.visualViewport;
    const pageRect = rect(page);
    // Gercek katmanlar: PageFlip'in fiziksel sayfasi, PDF sarmalayici ve tuval.
    // Aralarindaki ic bosluk sayfa YUZEYININ ICINDEKI bos kagit bantlarini olcer.
    const onscreen = element => element && element.getBoundingClientRect().width > 1;
    const item = [...document.querySelectorAll('.stf__item')].find(onscreen);
    const pdfWrapper = [...document.querySelectorAll('.pdf-page.is-rendered')].find(onscreen);
    const frame = pdfWrapper?.querySelector('.pdf-canvas-frame');
    const canvas = pdfWrapper?.querySelector('canvas');
    const alphaOf = value => {
      const parts = String(value).match(/[\d.]+/g) || [];
      return parts.length >= 4 ? Number(parts[3]) : 1;
    };
    return {
      item: item ? rect(item) : null,
      pdfWrapper: pdfWrapper ? rect(pdfWrapper) : null,
      frame: frame ? rect(frame) : null,
      canvas: canvas ? rect(canvas) : null,
      paper: {
        itemBg: item ? getComputedStyle(item).backgroundColor : null,
        itemAlpha: item ? alphaOf(getComputedStyle(item).backgroundColor) : null,
        frameAlpha: frame ? alphaOf(getComputedStyle(frame).backgroundColor) : null,
        stageBg: getComputedStyle(stage).backgroundColor,
        stageAlpha: alphaOf(getComputedStyle(stage).backgroundColor),
        itemOpacity: item ? Number(getComputedStyle(item).opacity) : null,
        wrapperOpacity: pdfWrapper ? Number(getComputedStyle(pdfWrapper).opacity) : null,
        canvasOpacity: canvas ? Number(getComputedStyle(canvas).opacity) : null,
      },
      theme: document.getElementById('ravzabooks')?.dataset.readerTheme,
      app: rect(document.getElementById('ravzabooks')),
      shell: rect(shell),
      root: rect(root),
      stage: stageRect,
      cradle: rect(cradle),
      page: pageRect,
      usable,
      padding,
      pdfAspect: parseFloat(getComputedStyle(cradle).getPropertyValue('--pdf-page-aspect')),
      spread: root.dataset.spread || 'single',
      pageHeightRatio: pageRect.height / Math.max(1, usable.height),
      pageWidthRatio: pageRect.width / Math.max(1, usable.width),
      leftInset: pageRect.left - usable.left,
      rightInset: usable.right - pageRect.right,
      topInset: pageRect.top - usable.top,
      bottomInset: usable.bottom - pageRect.bottom,
      cradleTransform: getComputedStyle(cradle).transform,
      panDataset: { x: root.dataset.mobilePdfPanX ?? null, limit: root.dataset.mobilePdfPanLimit ?? null },
      pannableClass: root.classList.contains('is-mobile-pannable'),
      controlsVisible: root.classList.contains('controls-visible'),
      state: root.dataset.pageFlipState || 'read',
      curling: stage.classList.contains('is-page-curling'),
      flipping: stage.classList.contains('is-flipping'),
      currentPage: Number(root.dataset.currentPage || 0),
      vv: vv ? { width:vv.width, height:vv.height, left:vv.offsetLeft, top:vv.offsetTop } : { width:innerWidth, height:innerHeight, left:0, top:0 },
      windowScroll: { x:scrollX, y:scrollY },
      doc: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
      },
    };
  })()`);
}

/**
 * FIT PAGE = CONTAIN. Sayfanin dort kenari da kullanilabilir alanin
 * icinde kalir, en-boy orani korunur ve olcek mumkun olan EN BUYUK
 * contain olcegidir (yani "tam gorunur ama minicik" de degildir).
 */
function assertFitPage(result, label, { fullViewport = false, fullSheet = false } = {}) {
  assert.ok(result, `${label}: reader geometry missing`);

  if (fullViewport) {
    for (const [name, rect] of Object.entries({app:result.app,shell:result.shell,root:result.root,stage:result.stage})) {
      assert.ok(Math.abs(rect.left - result.vv.left) <= 1, `${label}: ${name} left ${rect.left}/${result.vv.left}`);
      assert.ok(Math.abs(rect.top - result.vv.top) <= 1, `${label}: ${name} top ${rect.top}/${result.vv.top}`);
      assert.ok(Math.abs(rect.width - result.vv.width) <= 1, `${label}: ${name} width ${rect.width}/${result.vv.width}`);
      assert.ok(Math.abs(rect.height - result.vv.height) <= 1, `${label}: ${name} height ${rect.height}/${result.vv.height}`);
    }
  }
  assert.ok(Math.abs(result.stage.width - result.root.width) <= 1, `${label}: stage/root width mismatch`);
  assert.ok(Math.abs(result.stage.height - result.root.height) <= 1, `${label}: stage/root height mismatch`);

  // FIZIKSEL YAPRAK (.stf__item) ile PDF ICERIGI (canvas) ayri iki
  // dikdortgendir. Telefon portresinde yaprak sahnenin tamamini kaplar;
  // masaustunde ise yaprak = icerik (mevcut spread sozlesmesi).
  const sheet = result.item;
  const content = result.canvas;
  const pagesAcross = result.spread === 'double' ? 2 : 1;
  assert.ok(sheet && content, `${label}: sheet/content rect missing`);

  // 1. FIZIKSEL YAPRAK OLCUSU.
  if (fullSheet) {
    assert.ok(Math.abs(sheet.width - result.usable.width / pagesAcross) <= 3, `${label}: sheet width ${sheet.width} != stage ${result.usable.width}`);
    assert.ok(Math.abs(sheet.height - result.usable.height) <= 3, `${label}: physical sheet height ${sheet.height} != stage height ${result.usable.height} - the whole sheet must be the page`);
  } else {
    assert.ok(Math.abs(sheet.height - content.height) <= 2, `${label}: non-mobile sheet must equal the PDF content rect (${sheet.height} vs ${content.height})`);
    assert.ok(Math.abs(sheet.width - content.width) <= 2, `${label}: non-mobile sheet width mismatch (${sheet.width} vs ${content.width})`);
  }

  // 2. ICERIK YAPRAGIN ICINDE TAMAMEN GORUNUR: hicbir yazi kirpilmaz.
  assert.ok(content.left >= sheet.left - 2, `${label}: PDF content clipped on the LEFT`);
  assert.ok(content.right <= sheet.right + 2, `${label}: PDF content clipped on the RIGHT`);
  assert.ok(content.top >= sheet.top - 2, `${label}: PDF content clipped on the TOP`);
  assert.ok(content.bottom <= sheet.bottom + 2, `${label}: PDF content clipped on the BOTTOM`);
  // Sahne sinirlari icinde de tamamen gorunur olmali.
  assert.ok(content.left >= result.usable.left - 2 && content.right <= result.usable.right + 2, `${label}: PDF content outside the stage horizontally`);
  assert.ok(content.top >= result.usable.top - 2 && content.bottom <= result.usable.bottom + 2, `${label}: PDF content outside the stage vertically`);

  // 3. EN-BOY ORANI: gerilme/ezilme yok.
  const contentAspect = content.width / content.height;
  assert.ok(Math.abs(contentAspect - result.pdfAspect) <= 0.006, `${label}: PDF aspect distorted ${contentAspect.toFixed(4)} vs ${result.pdfAspect.toFixed(4)}`);

  // 4. MAKSIMUM contain: icerik yapragin icinde olabilecek en buyuk olcekte.
  const expectedContentHeight = Math.min(sheet.height, sheet.width / result.pdfAspect);
  const expectedContentWidth = expectedContentHeight * result.pdfAspect;
  assert.ok(Math.abs(content.height - expectedContentHeight) <= 2, `${label}: content height ${content.height.toFixed(1)} is not the max contain height ${expectedContentHeight.toFixed(1)}`);
  assert.ok(Math.abs(content.width - expectedContentWidth) <= 2, `${label}: content width ${content.width.toFixed(1)} is not the max contain width ${expectedContentWidth.toFixed(1)}`);

  // 5. ICERIK YAPRAK ICINDE ORTALI.
  const insetLeft = content.left - sheet.left;
  const insetRight = sheet.right - content.right;
  const insetTop = content.top - sheet.top;
  const insetBottom = sheet.bottom - content.bottom;
  assert.ok(Math.abs(insetLeft - insetRight) <= 2, `${label}: content not horizontally centered in the sheet (${insetLeft.toFixed(1)}/${insetRight.toFixed(1)})`);
  assert.ok(Math.abs(insetTop - insetBottom) <= 2, `${label}: content not vertically centered in the sheet (${insetTop.toFixed(1)}/${insetBottom.toFixed(1)})`);

  // 6. Pan yok: stale transform/pan state kalmamali.
  assert.ok(result.cradleTransform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(result.cradleTransform), `${label}: stale pan transform ${result.cradleTransform}`);
  assert.equal(result.panDataset.limit, null, `${label}: pan state leaked in`);
  assert.equal(result.pannableClass, false, `${label}: reader still marked pannable`);

  // 7. KAGIT OPAK (§J/§K): saydamlik yalnizca arka yuz BASKISINDA olabilir,
  //    yaprak yuzeyinde asla.
  assert.ok(result.paper.itemAlpha >= 0.99, `${label}: page sheet background is translucent (alpha ${result.paper.itemAlpha})`);
  assert.ok(result.paper.frameAlpha >= 0.99, `${label}: PDF frame background is translucent (alpha ${result.paper.frameAlpha})`);
  assert.ok(result.paper.itemOpacity >= 0.99, `${label}: whole sheet opacity lowered (${result.paper.itemOpacity})`);
  assert.ok(result.paper.wrapperOpacity >= 0.99, `${label}: PDF wrapper opacity lowered (${result.paper.wrapperOpacity})`);
  assert.ok(result.paper.canvasOpacity >= 0.99, `${label}: front-face PDF canvas is faded (${result.paper.canvasOpacity})`);

  // 8. Belge tasmasi / scroll sizintisi yok.
  assert.ok(result.doc.width <= result.vv.width + 1 && result.doc.bodyWidth <= result.vv.width + 1, `${label}: document horizontal overflow`);
  assert.deepEqual(result.windowScroll, {x:0,y:0}, `${label}: document viewport moved`);
}

/**
 * GORSEL SUREKLILIK SOZLESMESI (§27/§31).
 * Contain sonrasi PDF'in ustunde/altinda kalan alan geometrik olarak kalir,
 * ama AYRI RENKTE BIR BANT olarak gorunmemelidir. Bunu DOM'dan degil gercek
 * piksellerden dogrularız: sayfa sinirinin hemen ustu ile hemen alti ayni
 * x'te ayni tonda olmali.
 */
async function assertNoPaperSeam(label, artifactName) {
  const geometry = await measure();
  const shot = await browser.command("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
  const buffer = Buffer.from(shot.data, "base64");
  if (artifactName) await writeFile(join(artifactDir, `${artifactName}.png`), buffer);
  const image = await loadImage(buffer);
  const scale = image.width / geometry.stage.width;
  const surface = createCanvas(image.width, image.height);
  const context = surface.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixel = (x, y) => {
    const px = Math.min(image.width - 1, Math.max(0, Math.round(x * scale)));
    const py = Math.min(image.height - 1, Math.max(0, Math.round(y * scale)));
    return [...context.getImageData(px, py, 1, 1).data].slice(0, 3);
  };

  // Yaprak artik sahnenin tamamini kapladigi icin "bant" siniri kalmadi.
  // Anlamli dikis testi su an ICERIK ile KAGIT UZANTISI arasindadir (§10):
  // kullanici "PDF burada basliyor" diyebilecegi bir cizgi gormemeli.
  let worstDelta = 0;
  let worstAt = "";
  for (const edgeY of [geometry.canvas.top, geometry.canvas.bottom]) {
    if (edgeY < 6 || edgeY > geometry.stage.height - 6) continue;
    for (let x = 30; x < geometry.stage.width - 30; x += 10) {
      const outside = pixel(x, edgeY === geometry.canvas.top ? edgeY - 4 : edgeY + 4);
      const inside = pixel(x, edgeY === geometry.canvas.top ? edgeY + 4 : edgeY - 4);
      const delta = Math.max(...outside.map((value, index) => Math.abs(value - inside[index])));
      if (delta > worstDelta) { worstDelta = delta; worstAt = `x=${x} y=${Math.round(edgeY)} ${outside} vs ${inside}`; }
    }
  }
  // 4/255: gozle secilemez. Duzeltmeden once bu deger light'ta 42, sepia'da 84'tu.
  assert.ok(worstDelta <= 4, `${label}: visible band seam at the page edge (delta ${worstDelta}, ${worstAt})`);
  return worstDelta;
}

async function tapReaderCenter() {
  const current = await measure();
  const x = current.stage.left + current.stage.width / 2;
  const y = current.stage.top + current.stage.height / 2;
  await touch('touchStart', x, y);
  await delay(35);
  await touch('touchEnd', x, y);
  await delay(280);
}

async function edgeDrag({ direction, ratio, commit, screenshotName }) {
  const before = await measure();
  const forward = direction === "forward";
  const x = forward ? before.page.right - 10 : before.page.left + 10;
  const y = before.page.top + before.page.height * 0.42;
  const distance = before.page.width * ratio;
  const endX = x + (forward ? -distance : distance);
  await touch("touchStart", x, y);
  for (let step = 1; step <= 9; step += 1) {
    await touch("touchMove", x + (endX - x) * step / 9, y);
    await delay(26);
  }
  await browser.waitFor(
    "document.getElementById('reader-inner')?.dataset.pageFlipState === 'user_fold'",
    `${direction} user_fold`,
  );
  const folded = await measure();
  const backside = await browser.evaluate(`(() => {
    const element=document.querySelector('[data-mobile-flip-backside-page]');
    const canvas=element?.querySelector('canvas');
    if(!element||!canvas) return null;
    const probe=document.createElement('canvas');
    probe.width=24; probe.height=24;
    const context=probe.getContext('2d',{willReadFrequently:true});
    try{context.drawImage(canvas,0,0,24,24);}catch(_){}
    const pixels=context.getImageData(0,0,24,24).data;
    let opaque=0; const colors=new Set();
    for(let offset=0;offset<pixels.length;offset+=4){
      if(pixels[offset+3]>0) opaque+=1;
      colors.add([pixels[offset],pixels[offset+1],pixels[offset+2],pixels[offset+3]].join(','));
    }
    const style=getComputedStyle(canvas);
    const frame=element.querySelector('.pdf-canvas-frame');
    const alphaOf=value=>{const p=String(value).match(/[\\d.]+/g)||[];return p.length>=4?Number(p[3]):1;};
    const source=[...document.querySelectorAll('.pdf-page[data-pdf-page="'+element.dataset.mobileFlipBacksidePage+'"]')]
      .find(page=>page!==element&&page.classList.contains('is-rendered'))?.querySelector('canvas');
    return {
      page:Number(element.dataset.mobileFlipBacksidePage), pdfPage:Number(element.dataset.pdfPage),
      width:canvas.width, height:canvas.height,
      // Kivrilma sirasinda sayfa DONDURULUR; getBoundingClientRect donmus
      // AABB verir. Gercek yerlesim kutusu icin offset* kullanilir (§55).
      cssWidth:element.offsetWidth, cssHeight:element.offsetHeight,
      // Aynalanan BASKI yalnizca gercek PDF icerik dikdortgeni kadar olmali.
      printWidth:canvas.offsetWidth, printHeight:canvas.offsetHeight,
      // Kivrilan katmanlarin en buyuk YERLESIM yuksekligi: fiziksel yaprak
      // yuksekligine esit olmali, PDF icerigine degil (§54).
      maxFlippingHeight:Math.max(0, ...[...document.querySelectorAll('.stf__item')]
        .filter(el => el.getBoundingClientRect().width > 1)
        .map(el => el.offsetHeight)),
      sourceWidth:source?.width||0, sourceHeight:source?.height||0,
      renderKey:canvas.dataset.renderKey||'', opaque, colors:colors.size,
      opacity:Number(style.opacity), transform:style.transform,
      // Arka yuz KAGIDI opak mi, yoksa alttaki sayfa iceri mi siziyor?
      pageBgAlpha:alphaOf(getComputedStyle(element).backgroundColor),
      frameBgAlpha:frame?alphaOf(getComputedStyle(frame).backgroundColor):null,
      pageOpacity:Number(getComputedStyle(element).opacity)
    };
  })()`);
  assert.ok(backside?.width > 1 && backside?.height > 1, `${direction}: real backside canvas missing`);
  assert.ok(backside.opaque > 400, `${direction}: backside is transparent/blank (${backside.opaque}/576)`);
  assert.ok(backside.colors > 4, `${direction}: backside is a flat fill (${backside.colors} colors)`);
  assert.ok(backside.renderKey, `${direction}: backside lost PDF render identity`);
  assert.equal(backside.page, direction === 'forward' ? before.currentPage : before.currentPage - 1, `${direction}: wrong backside PDF mapping`);
  if (backside.sourceWidth) {
    assert.equal(backside.width, backside.sourceWidth, `${direction}: backside backing width differs from source`);
    assert.equal(backside.height, backside.sourceHeight, `${direction}: backside backing height differs from source`);
  }
  assert.match(backside.transform, /matrix\(-1/, `${direction}: backside mirror lost`);
  // KAGIT opak, BASKI soluk. Ikisi ayri katman (§A2/§D3).
  assert.ok(backside.pageBgAlpha >= 0.99, `${direction}: backside paper is translucent (alpha ${backside.pageBgAlpha}) - underlying page bleeds through`);
  assert.ok(backside.frameBgAlpha >= 0.99, `${direction}: backside frame is translucent (alpha ${backside.frameBgAlpha})`);
  assert.ok(backside.pageOpacity >= 0.99, `${direction}: whole backside sheet faded (${backside.pageOpacity}) - use the print layer instead`);
  assert.ok(backside.opacity >= 0.10 && backside.opacity <= 0.30, `${direction}: backside print strength ${backside.opacity} outside the 0.10-0.30 ghost-print range`);
  // Fold sirasinda on yuz geometrisi degismemeli.
  assert.ok(Math.abs(folded.page.width - before.page.width) <= 1 && Math.abs(folded.page.height - before.page.height) <= 1, `${direction}: fold changed the sheet geometry`);

  // §54 EN KRITIK: kivrilan yuzey FIZIKSEL YAPRAK yuksekliginde olmali.
  // Eskiden yalnizca PDF icerigi (586px) kivriliyor, ust/alt serit yerinde
  // kaliyordu; artik butun yaprak (956px) tek kagit gibi doner.
  assert.ok(
    Math.abs(backside.maxFlippingHeight - before.item.height) <= 3,
    `${direction}: flipping surface is ${backside.maxFlippingHeight}px but the physical sheet is ${before.item.height}px - only part of the sheet is curling`,
  );

  // §55 arka yuz: YAPRAK tam boy, aynalanan BASKI ise icerik dikdortgeni.
  assert.ok(Math.abs(backside.cssHeight - before.item.height) <= 2, `${direction}: backside sheet height ${backside.cssHeight} != physical sheet ${before.item.height}`);
  assert.ok(Math.abs(backside.cssWidth - before.item.width) <= 2, `${direction}: backside sheet width ${backside.cssWidth} != physical sheet ${before.item.width}`);
  assert.ok(Math.abs(backside.printHeight - before.canvas.height) <= 2, `${direction}: mirrored print height ${backside.printHeight} != PDF content ${before.canvas.height}`);
  assert.ok(Math.abs(backside.printWidth - before.canvas.width) <= 2, `${direction}: mirrored print width ${backside.printWidth} != PDF content ${before.canvas.width}`);
  if (screenshotName) await screenshot(screenshotName);
  if (!commit) await delay(180);
  await touch("touchEnd", endX, y);
  await browser.waitFor(
    "document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'",
    `${direction} cleanup`,
  );
  await delay(120);
  const after = await measure();
  assert.equal(
    after.currentPage,
    before.currentPage + (commit ? (forward ? 1 : -1) : 0),
    `${direction}: wrong commit/cancel result`,
  );
  assertFitPage(after, `${direction} after ${commit ? 'commit' : 'cancel'}`, { fullViewport:true, fullSheet:true });
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-mobile-flip-backside-page]').length"), 0, `${direction}: stale backside layer`);
}

async function canvasMemoryProbe() {
  return browser.evaluate(`(() => {
    const canvases=[...document.querySelectorAll('.pdf-page canvas')]
      .filter(canvas=>canvas.width>1&&canvas.height>1)
      .map(canvas=>{
        const rect=canvas.getBoundingClientRect();
        const cssWidth=rect.width||parseFloat(canvas.style.width)||canvas.width;
        const cssHeight=rect.height||parseFloat(canvas.style.height)||canvas.height;
        return {width:canvas.width,height:canvas.height,cssWidth,cssHeight,bytes:canvas.width*canvas.height*4};
      });
    return {
      dpr:devicePixelRatio,
      count:canvases.length,
      bytes:canvases.reduce((sum,item)=>sum+item.bytes,0),
      maxScale:Math.max(0,...canvases.map(item=>item.width/Math.max(1,item.cssWidth))),
      maxCssHeight:Math.max(0,...canvases.map(item=>item.cssHeight)),
    };
  })()`);
}

async function captureBrowserFullscreen(viewport) {
  await browser.evaluate("document.getElementById('rdr-settings-open').click()");
  await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open === true", "reader settings");
  if (!await browser.evaluate("Boolean(document.getElementById('fullscreen-toggle'))")) {
    await browser.evaluate("document.querySelector('#rdr-settings-sheet [data-close-sheet]').click()");
    return false;
  }
  await browser.click("#fullscreen-toggle + .switch-track");
  await browser.waitFor("Boolean(document.fullscreenElement || document.webkitFullscreenElement)", "fullscreen enter");
  await browser.evaluate("document.querySelector('#rdr-settings-sheet [data-close-sheet]').click()");
  await delay(500);
  assertFitPage(await measure(), `${viewport.width}x${viewport.height} browser fullscreen`, { fullViewport:true, fullSheet:true });
  await screenshot(`${viewport.width}x${viewport.height}-browser-fullscreen`);
  await browser.evaluate("document.exitFullscreen?.() || document.webkitExitFullscreen?.()");
  await browser.waitFor("!document.fullscreenElement && !document.webkitFullscreenElement", "fullscreen exit");
  await delay(500);
  assertFitPage(await measure(), `${viewport.width}x${viewport.height} fullscreen exit`, { fullViewport:true, fullSheet:true });
  return true;
}

const results = [];
const themeResults = [];

try {
  for (const viewport of viewports) {
    const label = `${viewport.width}x${viewport.height}`;
    await openPdf(viewport);
    const visible = await measure();
    assertFitPage(visible, `${label} controls visible`, { fullViewport:true, fullSheet:true });
    assert.equal(visible.controlsVisible, true, `${label}: controls should start visible`);
    await screenshot(`${label}-controls-visible`);

    await tapReaderCenter();
    const hidden = await measure();
    assertFitPage(hidden, `${label} controls hidden`, { fullViewport:true, fullSheet:true });
    assert.equal(hidden.controlsVisible, false, `${label}: real center tap did not hide controls`);
    assert.ok(Math.abs(hidden.page.width - visible.page.width) <= 1 && Math.abs(hidden.page.height - visible.page.height) <= 1, `${label}: controls changed PDF geometry`);
    const seam = await assertNoPaperSeam(`${label} controls hidden`, `${label}-controls-hidden`);
    await captureBrowserFullscreen(viewport);

    // Merkezden surukleme artik pan DEGIL: sayfa kaymamali, sadece tap/curl semantigi.
    const centerX = hidden.stage.left + hidden.stage.width / 2;
    const centerY = hidden.stage.top + hidden.stage.height / 2;
    await touch('touchStart', centerX, centerY);
    for (let step = 1; step <= 6; step += 1) {
      await touch('touchMove', centerX - 18 * step, centerY);
      await delay(24);
    }
    await touch('touchEnd', centerX - 108, centerY);
    await delay(220);
    const afterCenterDrag = await measure();
    assertFitPage(afterCenterDrag, `${label} after center drag`, { fullViewport:true, fullSheet:true });
    assert.equal(afterCenterDrag.currentPage, hidden.currentPage, `${label}: center drag changed the page`);

    await edgeDrag({ direction:"forward", ratio:0.16, commit:false, screenshotName:`${label}-mid-flip` });

    results.push({
      viewport: label,
      stage: `${Math.round(hidden.stage.width)}x${Math.round(hidden.stage.height)}`,
      sheet: `${Math.round(hidden.item.width)}x${Math.round(hidden.item.height)}`,
      content: `${Math.round(hidden.canvas.width)}x${Math.round(hidden.canvas.height)}`,
      contentAspect: Number((hidden.canvas.width / hidden.canvas.height).toFixed(3)),
      paperTop: Math.round(hidden.canvas.top - hidden.item.top),
      paperBottom: Math.round(hidden.item.bottom - hidden.canvas.bottom),
      seamDelta: seam,
    });
  }

  // Sayfa cevirme: ileri + geri, Fit Page geometrisi altinda.
  await openPdf({ width:440, height:956 });
  await edgeDrag({ direction:"forward", ratio:0.42, commit:true });
  await edgeDrag({ direction:"previous", ratio:0.42, commit:true });

  // TEMA MATRISI (§G/§A7): dort okuma temasinin hepsinde kagit opak kalmali;
  // beyaz temayi duzeltirken digerleri bozulmamali.
  for (const theme of ['light', 'sepia', 'dark', 'black']) {
    await openPdf({ width:440, height:956 }, 24, 'page', theme);
    const themed = await measure();
    assert.equal(themed.theme, theme, `theme ${theme} not applied`);
    assertFitPage(themed, `440x956 ${theme} normal`, { fullViewport:true, fullSheet:true });

    // Kagit yuzeyi sahnenin TAMAMINI kaplar ve yaprakla AYNI tondadir:
    // boylece sayfanin disinda kalan alan ayri bir arka plan bandi olmaz.
    assert.ok(themed.paper.stageAlpha >= 0.99, `${theme}: reader stage paper surface is not opaque (${themed.paper.stageBg})`);
    assert.equal(themed.paper.stageBg, themed.paper.itemBg, `${theme}: paper surface ${themed.paper.stageBg} differs from sheet ${themed.paper.itemBg}`);

    await tapReaderCenter();
    const seamDelta = await assertNoPaperSeam(`440x956 ${theme}`, `440x956-${theme}-normal`);
    themeResults.push({
      theme,
      surface: themed.paper.stageBg,
      sheet: themed.paper.itemBg,
      sheetAlpha: themed.paper.itemAlpha,
      seamDelta,
      sheet: `${Math.round(themed.item.width)}x${Math.round(themed.item.height)}`,
      content: `${Math.round(themed.canvas.width)}x${Math.round(themed.canvas.height)}`,
    });
    // %50 surukleme dogal olarak commit esigini gecer; ekran goruntusu fold
    // ANINDA alinir, birakis ise sayfayi ilerletir.
    await edgeDrag({ direction:"forward", ratio:0.5, commit:true, screenshotName:`440x956-${theme}-midflip` });
  }

  const memory = await canvasMemoryProbe();
  // §60/§61: tam boy yaprak, tam boy TUVAL demek DEGIL. Tuval hala yalnizca
  // gercek PDF icerigi kadar; yaprak uzantisi saf CSS yuzeyi.
  const contentNow = await measure();
  assert.ok(
    memory.maxCssHeight <= contentNow.canvas.height + 4,
    `live canvas CSS height ${memory.maxCssHeight} exceeds the PDF content rect ${contentNow.canvas.height} - a full-sheet canvas was rendered`,
  );
  assert.ok(memory.count >= 1 && memory.count <= 5, `mobile live canvas window escaped its bound (${memory.count})`);
  assert.ok(memory.maxScale >= 1.5 && memory.maxScale <= 2.01, `unexpected DPR render scale ${memory.maxScale}`);
  assert.ok(memory.bytes < 64 * 1024 * 1024, `live PDF canvas backing stores exceed 64 MiB (${memory.bytes})`);

  // Safe-area: yalnizca gercek inset kadar pay, sonra yine tam contain.
  await browser.command("Emulation.setSafeAreaInsetsOverride", { insets:{ top:47, right:0, bottom:34, left:0 } });
  try {
    await openPdf({ width:440, height:956 });
    const safeArea = await measure();
    assertFitPage(safeArea, "440x956 safe area", { fullViewport:true, fullSheet:true });
    assert.ok(safeArea.padding.top >= 46 && safeArea.padding.bottom >= 33, `safe-area insets not applied (${safeArea.padding.top}/${safeArea.padding.bottom})`);
    await screenshot("440x956-safe-area");
  } finally {
    await browser.command("Emulation.setSafeAreaInsetsOverride", { insets:{ top:0, right:0, bottom:0, left:0 } });
  }

  // Yon degisimi: portrait -> landscape -> portrait, stale olcu kalmamali.
  await openPdf({ width:440, height:956 });
  const rotationPage = (await measure()).currentPage;
  await browser.setViewport({ width:956, height:440, mobile:true, deviceScaleFactor:3 });
  await browser.waitFor(`(() => {
    const root=document.getElementById('reader-inner');
    const stage=document.getElementById('rdr-stage')?.getBoundingClientRect();
    const page=document.querySelector('.stf__block')?.getBoundingClientRect();
    return innerWidth===956 && root?.dataset.pageFlipState!=='user_fold' && stage && page && page.width<=stage.width+2 && page.height<=stage.height+2;
  })()`, "landscape repagination", 30000);
  await delay(500);
  const landscape = await measure();
  assertFitPage(landscape, "956x440 landscape", { fullViewport:true });
  assert.equal(landscape.currentPage, rotationPage, "portrait to landscape lost reading position");
  await screenshot("956x440-landscape");

  await browser.setViewport({ width:440, height:956, mobile:true, deviceScaleFactor:3 });
  await browser.waitFor(`(() => {
    const stage=document.getElementById('rdr-stage')?.getBoundingClientRect();
    const page=document.querySelector('.stf__block')?.getBoundingClientRect();
    return innerWidth===440 && stage && page && page.width<=stage.width+2 && page.height<=stage.height+2;
  })()`, "portrait repagination", 30000);
  await delay(500);
  const portraitAgain = await measure();
  assertFitPage(portraitAgain, "landscape to portrait", { fullViewport:true, fullSheet:true });
  assert.equal(portraitAgain.currentPage, rotationPage, "landscape to portrait lost reading position");

  // Mod turu: sayfa -> kaydirma -> sayfa. Geri donuste stale transform/olcu olmamali.
  await browser.evaluate("document.getElementById('rdr-settings-open').click()");
  await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open === true", "settings for mode switch");
  await browser.evaluate("document.querySelector('#rdr-settings-sheet .mode-btn[data-mode=\"scroll\"]').click()");
  await delay(900);
  await browser.evaluate("document.querySelector('#rdr-settings-sheet .mode-btn[data-mode=\"page\"]').click()");
  await delay(1200);
  await browser.evaluate("document.querySelector('#rdr-settings-sheet [data-close-sheet]').click()");
  await browser.waitFor("document.querySelector('.stf__block')", "page mode restored", 30000);
  await delay(600);
  assertFitPage(await measure(), "scroll -> page round trip", { fullViewport:true, fullSheet:true });

  // Tablet + masaustu: mobil kural sizmamali, mevcut contain/spread korunmali.
  for (const viewport of [
    {width:768,height:1024,mobile:false},
    {width:1024,height:768,mobile:false},
    {width:1440,height:900,mobile:false},
    {width:1920,height:1080,mobile:false},
  ]) {
    await openPdf(viewport);
    const desktop = await measure();
    assertFitPage(desktop, `${viewport.width}x${viewport.height} non-mobile`);
    assert.equal(desktop.spread, viewport.width >= 1024 ? 'double' : 'single', `${viewport.width}: spread mode changed`);
  }

  // Kaydirma modu bu duzeltmeden etkilenmemeli.
  await openPdf({width:440,height:956}, 24, 'scroll');
  const scrollMode = await browser.evaluate(`(() => {
    const root=document.getElementById('reader-inner');
    const scroller=document.getElementById('rdr-flipbook');
    return {
      mode:root?.dataset.readerMode,
      pageFlipBlocks:document.querySelectorAll('.stf__block').length,
      scrollHeight:scroller?.scrollHeight||0,
      clientHeight:scroller?.clientHeight||0,
      doc:{width:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth},
      viewport:{width:innerWidth}
    };
  })()`);
  assert.equal(scrollMode.mode, 'scroll', "continuous mode preference was not preserved");
  assert.equal(scrollMode.pageFlipBlocks, 0, "continuous mode unexpectedly initialized St.PageFlip");
  assert.ok(scrollMode.scrollHeight > scrollMode.clientHeight, "continuous reader lost vertical scrolling");
  assert.ok(scrollMode.doc.width <= scrollMode.viewport.width + 1 && scrollMode.doc.bodyWidth <= scrollMode.viewport.width + 1, "continuous reader leaked horizontal document scroll");

  assertCleanDiagnostics(browser, "reader mobile fit page");
  console.table(results);
  console.table(themeResults);
  console.log("Mobile PDF canvas memory", {
    liveCanvases: memory.count,
    liveBackingMiB: Number((memory.bytes/1024/1024).toFixed(1)),
    outputScale: Number(memory.maxScale.toFixed(3)),
  });
  console.log("PASS mobile full sheet: sheet = stage, PDF contained + centered + uncropped, whole sheet curls, backside full-height with content-sized ghost print");
} finally {
  await browser.close();
  await server.close();
}
