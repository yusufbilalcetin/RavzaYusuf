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
const browser = await ThemeTestBrowser.launch("reader-mobile-flip-backside");
const artifactDir = join(ROOT, "test-artifacts", "reader-mobile-flip-backside");
await mkdir(artifactDir, { recursive: true });
const mobileFillResults = [];

const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 2, radiusY: 2 }],
});

async function openPdf({ width, height, page = 24, mode = "page" }) {
  await browser.setViewport({ width, height, mobile: width < 768, deviceScaleFactor: width < 768 ? 3 : 1 });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:${JSON.stringify(mode)},pageSound:false}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'kucuk-prens':{page:${page}}}));
    location.reload();
  `);
  await browser.waitFor("document.querySelector('.library-book-card')", "preferences reload", 30000);
  await browser.evaluate("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]').click()");
  const readySelector = mode === "page"
    ? "document.querySelector('.pdf-page.is-rendered') && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'"
    : "document.querySelector('.pdf-page.is-rendered') && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'";
  await browser.waitFor(readySelector, "PDF reader", 60000);
  await delay(900);
}

async function geometry() {
  return browser.evaluate(`(() => {
    const rect = document.querySelector('.stf__block')?.getBoundingClientRect();
    return rect ? {left:rect.left,right:rect.right,top:rect.top,width:rect.width,height:rect.height} : null;
  })()`);
}

async function screenshot(name) {
  const shot = await browser.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(shot.data, "base64"));
}

async function assertMaximumMobilePageFill(viewport) {
  const metrics = await browser.evaluate(`(() => {
    const stage = document.getElementById('rdr-stage');
    const surface = document.querySelector('.stf__block');
    const cradle = document.getElementById('book-cradle');
    if (!stage || !surface || !cradle) return null;
    const stageRect = stage.getBoundingClientRect();
    const pageRect = surface.getBoundingClientRect();
    const stageStyle = getComputedStyle(stage);
    const padding = {
      left: parseFloat(stageStyle.paddingLeft) || 0,
      right: parseFloat(stageStyle.paddingRight) || 0,
      top: parseFloat(stageStyle.paddingTop) || 0,
      bottom: parseFloat(stageStyle.paddingBottom) || 0,
    };
    const availableWidth = stage.clientWidth - padding.left - padding.right;
    const availableHeight = stage.clientHeight - padding.top - padding.bottom;
    const ratio = parseFloat(getComputedStyle(cradle).getPropertyValue('--pdf-page-aspect'));
    const expectedWidth = Math.min(availableWidth, availableHeight * ratio);
    const expectedHeight = expectedWidth / ratio;
    const topGap = pageRect.top - (stageRect.top + padding.top);
    const bottomGap = stageRect.bottom - padding.bottom - pageRect.bottom;
    return {
      availableWidth, availableHeight, ratio, expectedWidth, expectedHeight,
      pageWidth: pageRect.width, pageHeight: pageRect.height, topGap, bottomGap,
    };
  })()`);
  assert.ok(metrics, `${viewport.width}x${viewport.height}: mobile page geometry missing`);
  assert.ok(Math.abs(metrics.pageWidth - metrics.expectedWidth) <= 2, `${viewport.width}x${viewport.height}: page does not use maximum contain width`);
  assert.ok(Math.abs(metrics.pageHeight - metrics.expectedHeight) <= 2, `${viewport.width}x${viewport.height}: page does not use maximum contain height`);
  assert.ok(Math.abs(metrics.pageWidth / metrics.pageHeight - metrics.ratio) <= 0.005, `${viewport.width}x${viewport.height}: PDF aspect ratio distorted`);
  assert.ok(metrics.pageWidth <= metrics.availableWidth + 1 && metrics.pageHeight <= metrics.availableHeight + 1, `${viewport.width}x${viewport.height}: PDF page is cropped`);
  assert.ok(Math.abs(metrics.topGap - metrics.bottomGap) <= 2, `${viewport.width}x${viewport.height}: unavoidable vertical remainder is not balanced`);
  const unavoidableGap = Math.max(0, (metrics.availableHeight - metrics.expectedHeight) / 2);
  assert.ok(Math.abs(metrics.topGap - unavoidableGap) <= 2, `${viewport.width}x${viewport.height}: avoidable top/bottom space remains`);
  mobileFillResults.push({ viewport: `${viewport.width}x${viewport.height}`, ...metrics });
}

async function backsideProbe({ currentPage, direction }) {
  return browser.evaluate(`(() => {
    const pageStats = element => {
      const canvas = element?.querySelector('canvas');
      if (!canvas) return null;
      const probe = document.createElement('canvas');
      probe.width = 24; probe.height = 24;
      const context = probe.getContext('2d', { willReadFrequently: true });
      try { context.drawImage(canvas, 0, 0, 24, 24); } catch (_) {}
      const pixels = context.getImageData(0, 0, 24, 24).data;
      let opaque = 0; const colors = new Set();
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] > 0) opaque += 1;
        colors.add([pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]].join(','));
      }
      const style = getComputedStyle(element);
      const canvasStyle = getComputedStyle(canvas);
      return {
        pdfPage: Number(element.dataset.pdfPage || 0),
        backsidePage: Number(element.dataset.mobileFlipBacksidePage || 0),
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        renderKey: canvas.dataset.renderKey || '',
        opaque,
        colors: colors.size,
        canvasOpacity: Number(canvasStyle.opacity),
        canvasTransform: canvasStyle.transform,
        transform: style.transform,
        clipPath: style.clipPath,
        classes: element.className,
      };
    };
    const expected = ${direction === "forward" ? currentPage : currentPage - 1};
    const current = ${currentPage};
    const candidates = [...document.querySelectorAll('.pdf-page[data-pdf-page="' + (${direction === "forward" ? currentPage : currentPage - 1}) + '"]')];
    const target = ${direction === "forward"
      ? "candidates.length > 1 ? candidates.at(-1) : null"
      : "candidates.find(element => { const style=getComputedStyle(element); return style.display !== 'none' && style.clipPath !== 'none'; }) || candidates[0]"};
    return {
      expected,
      current,
      state: document.getElementById('reader-inner')?.dataset.pageFlipState || '',
      duplicateCount: candidates.length,
      target: pageStats(target),
      sources: [...document.querySelectorAll('.pdf-page[data-pdf-page="' + expected + '"]')].map(pageStats),
      allBacksides: [...document.querySelectorAll('[data-mobile-flip-backside-page]')].map(pageStats),
    };
  })()`);
}

async function beginDrag({ direction, ratio }) {
  const rect = await geometry();
  assert.ok(rect, "PageFlip surface missing");
  const forward = direction === "forward";
  const startX = forward ? rect.right - 14 : rect.left + 14;
  const endX = startX + (forward ? -1 : 1) * rect.width * ratio;
  const y = rect.top + rect.height * 0.38;
  await touch("touchStart", startX, y);
  await delay(45);
  for (let step = 1; step <= 8; step += 1) {
    await touch("touchMove", startX + (endX - startX) * step / 8, y);
    await delay(28);
  }
  await browser.waitFor(
    "document.getElementById('reader-inner')?.dataset.pageFlipState === 'user_fold'",
    `${direction} user_fold`,
  );
  return { endX, y };
}

async function finishDrag(point, { commit }) {
  if (!commit) await delay(140);
  await touch("touchEnd", point.endX, point.y);
  await browser.waitFor(
    "document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'",
    "PageFlip read cleanup",
  );
  await delay(120);
}

function assertRealBackside(probe, label) {
  assert.ok(probe.target, `${label}: flipping backside element missing`);
  assert.ok(probe.target.canvasWidth > 1 && probe.target.canvasHeight > 1, `${label}: canvas has no bitmap dimensions`);
  assert.ok(probe.target.opaque > 400, `${label}: backside canvas is transparent/blank (${probe.target.opaque}/576 opaque)`);
  assert.ok(probe.target.colors > 4, `${label}: backside canvas is a solid color (${probe.target.colors} colors)`);
  assert.equal(probe.target.backsidePage || probe.target.pdfPage, probe.expected, `${label}: wrong PDF page mapping`);
  assert.match(probe.target.canvasTransform, /matrix\(-1(?:\.0+)?, 0, 0, 1(?:\.0+)?, 0, 0\)/, `${label}: backside is not horizontally reversed`);
  assert.ok(probe.target.canvasOpacity >= 0.4 && probe.target.canvasOpacity <= 0.65, `${label}: backside print is not naturally muted (${probe.target.canvasOpacity})`);
}

try {
  await openPdf({ width: 440, height: 956, page: 24 });
  await assertMaximumMobilePageFill({ width: 440, height: 956 });
  await screenshot("440x956-normal");
  const startPage = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");

  const forward25 = await beginDrag({ direction: "forward", ratio: 0.25 });
  await screenshot("440x956-forward-25");
  const forwardProbe = await backsideProbe({ currentPage: startPage, direction: "forward" });
  assert.equal(forwardProbe.duplicateCount, 2, "portrait forward must use StPageFlip temporary copy");
  assertRealBackside(forwardProbe, "forward 25%");
  await finishDrag(forward25, { commit: false });
  assert.equal(await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)"), startPage, "cancel changed page");
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-mobile-flip-backside-page]').length"), 0, "cancel left temporary backside");

  const forward50 = await beginDrag({ direction: "forward", ratio: 0.5 });
  await screenshot("440x956-forward-50");
  assertRealBackside(await backsideProbe({ currentPage: startPage, direction: "forward" }), "forward 50%");
  await touch("touchMove", forward50.endX - 440 * 0.25, forward50.y);
  await delay(80);
  await screenshot("440x956-forward-75");
  assertRealBackside(await backsideProbe({ currentPage: startPage, direction: "forward" }), "forward 75%");
  await finishDrag({ endX: forward50.endX - 440 * 0.25, y: forward50.y }, { commit: true });
  const nextPage = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
  assert.equal(nextPage, startPage + 1, "forward commit mapping");

  const previous50 = await beginDrag({ direction: "previous", ratio: 0.5 });
  await screenshot("440x956-previous-50");
  assertRealBackside(await backsideProbe({ currentPage: nextPage, direction: "previous" }), "previous 50%");
  await finishDrag(previous50, { commit: true });
  assert.equal(await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)"), startPage, "previous commit mapping");

  await browser.key("ArrowRight");
  await delay(55);
  await browser.key("ArrowRight");
  await browser.key("ArrowLeft");
  await browser.waitFor(
    "document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'",
    "rapid turn cleanup",
  );
  await delay(120);
  const rapidPage = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
  assert.ok(rapidPage >= startPage && rapidPage <= startPage + 2, "rapid turns produced an invalid page");
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-mobile-flip-backside-page]').length"), 0, "rapid turns left temporary backside");

  await openPdf({ width: 390, height: 844, page: 24 });
  await assertMaximumMobilePageFill({ width: 390, height: 844 });
  await screenshot("390x844-normal");
  const smallStartPage = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
  const smallForward25 = await beginDrag({ direction: "forward", ratio: 0.25 });
  await screenshot("390x844-forward-25");
  assertRealBackside(await backsideProbe({ currentPage: smallStartPage, direction: "forward" }), "390x844 forward 25%");
  await finishDrag(smallForward25, { commit: false });

  const smallForward50 = await beginDrag({ direction: "forward", ratio: 0.5 });
  await screenshot("390x844-forward-50");
  assertRealBackside(await backsideProbe({ currentPage: smallStartPage, direction: "forward" }), "390x844 forward 50%");
  await touch("touchMove", smallForward50.endX - 390 * 0.25, smallForward50.y);
  await delay(80);
  await screenshot("390x844-forward-75");
  assertRealBackside(await backsideProbe({ currentPage: smallStartPage, direction: "forward" }), "390x844 forward 75%");
  await finishDrag({ endX: smallForward50.endX - 390 * 0.25, y: smallForward50.y }, { commit: true });

  const smallNextPage = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
  const smallPrevious50 = await beginDrag({ direction: "previous", ratio: 0.5 });
  await screenshot("390x844-previous-50");
  assertRealBackside(await backsideProbe({ currentPage: smallNextPage, direction: "previous" }), "390x844 previous 50%");
  await finishDrag(smallPrevious50, { commit: true });

  for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
    await openPdf({ ...viewport, page: 24 });
    await assertMaximumMobilePageFill(viewport);
    await screenshot(`${viewport.width}x${viewport.height}-normal`);
    const current = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    const point = await beginDrag({ direction: "forward", ratio: 0.5 });
    assertRealBackside(await backsideProbe({ currentPage: current, direction: "forward" }), `${viewport.width}x${viewport.height}`);
    await finishDrag(point, { commit: false });
  }

  await openPdf({ width: 440, height: 956, page: 1 });
  await browser.key("ArrowLeft");
  await delay(250);
  assert.equal(await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)"), 1, "first page previous unsafe");

  await openPdf({ width: 440, height: 956, page: 166 });
  await browser.key("ArrowRight");
  await delay(250);
  assert.ok(await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage) >= 166"), "last page next unsafe");

  await openPdf({ width: 1440, height: 900, page: 24 });
  await browser.key("ArrowRight");
  await delay(250);
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-mobile-flip-backside-page]').length"), 0, "desktop created mobile backside layer");

  await openPdf({ width: 440, height: 956, page: 24, mode: "scroll" });
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-mobile-flip-backside-page]').length"), 0, "scroll mode created backside layer");

  assertCleanDiagnostics(browser, "reader mobile flip backside");
  console.table(mobileFillResults.map(result => ({
    viewport: result.viewport,
    page: `${Math.round(result.pageWidth)}x${Math.round(result.pageHeight)}`,
    topGap: Math.round(result.topGap),
    bottomGap: Math.round(result.bottomGap),
    avoidableGap: Math.round(result.topGap - Math.max(0, (result.availableHeight - result.expectedHeight) / 2)),
  })));
  console.log("PASS mobile PDF flip backside: real canvas, forward/previous mapping, cancel cleanup, 390-440 portrait only");
} finally {
  await browser.close();
  await server.close();
}
