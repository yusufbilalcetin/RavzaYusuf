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
const browser = await ThemeTestBrowser.launch("reader-page-transition");
const artifactDir = join(ROOT, "test-artifacts", "reader-page-transition");
await mkdir(artifactDir, { recursive: true });

const mouse = (type, x, y) => browser.command("Input.dispatchMouseEvent", {
  type,
  x: Math.round(x),
  y: Math.round(y),
  button: "left",
  buttons: type === "mouseReleased" ? 0 : 1,
  clickCount: 1,
  pointerType: "mouse",
});

const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 2, radiusY: 2 }],
});

const transitionProbe = (durationMs) => `new Promise(resolve => {
  const started = performance.now();
  const samples = [];
  const sample = now => {
    const items = [...document.querySelectorAll('.stf__item')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      })
      .map(element => {
        const style = getComputedStyle(element);
        return [element.className, style.transform, style.clipPath, style.translate].join('|');
      });
    const visibleShadows = [...document.querySelectorAll('[class*="Shadow"], [class*="shadow"]')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== 'none'
          && style.visibility !== 'hidden' && Number(style.opacity) > 0.01;
      })
      .map(element => ({ className: element.className, opacity: Number(getComputedStyle(element).opacity) }));
    samples.push({
      at: now - started,
      flipping: document.getElementById('rdr-stage')?.classList.contains('is-flipping') || false,
      curling: document.getElementById('rdr-stage')?.classList.contains('is-page-curling') || false,
      page: Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
      pageFlipState: document.getElementById('reader-inner')?.dataset.pageFlipState || '',
      items,
      visibleShadows,
    });
    if (now - started < ${durationMs}) requestAnimationFrame(sample);
    else resolve(samples);
  };
  requestAnimationFrame(sample);
})`;

async function setReducedMotion(reduced) {
  await browser.command("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }],
  });
}

async function openPdf({ width, height, mobile, reduced = false, page = 24 }) {
  await setReducedMotion(reduced);
  await browser.setViewport({ width, height, mobile, deviceScaleFactor: 1 });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'page',pageSound:false}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'kucuk-prens':{page:${page}}}));
    location.reload();
  `);
  await browser.waitFor("document.querySelector('.library-book-card')", "preferences reload", 30000);
  await browser.evaluate("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]').click()");
  await browser.waitFor(
    "document.querySelector('.pdf-page.is-rendered') && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
    "PDF reader",
    60000,
  );
  await delay(900);
}

async function stableState() {
  return browser.evaluate(`(() => {
    const root = document.getElementById('reader-inner');
    const pages = [...document.querySelectorAll('.pdf-page')]
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(item => item.rect.width > 1 && item.rect.height > 1)
      .sort((a, b) => a.rect.left - b.rect.left);
    const gap = pages.length === 2 ? pages[1].rect.left - pages[0].rect.right : null;
    const visibleShadows = [...document.querySelectorAll('[class*="Shadow"], [class*="shadow"]')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && Number(style.opacity) > 0.01;
      }).map(element => element.className);
    return {
      page: Number(root.dataset.currentPage),
      spread: root.dataset.spread,
      gap,
      flipping: document.getElementById('rdr-stage').classList.contains('is-flipping'),
      visibleShadows,
      fullscreen: Boolean(document.fullscreenElement || document.webkitFullscreenElement),
      pageFlipState: root.dataset.pageFlipState || '',
      block: (() => {
        const element = document.querySelector('.stf__block');
        const rect = element?.getBoundingClientRect();
        const seam = element ? getComputedStyle(element, '::after') : null;
        return rect ? {
          left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height,
          seam: seam ? { content: seam.content, width: parseFloat(seam.width) || 0, background: seam.backgroundColor } : null,
        } : null;
      })(),
      parent: (() => {
        const rect = document.querySelector('.stf__parent')?.getBoundingClientRect();
        return rect ? { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height } : null;
      })(),
      wrapper: (() => {
        const rect = document.querySelector('.stf__wrapper')?.getBoundingClientRect();
        return rect ? { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height } : null;
      })(),
      pages: pages.map(({ element, rect }) => ({
        page: Number(element.dataset.pdfPage),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        translate: getComputedStyle(element.closest('.stf__item')).translate,
      })),
    };
  })()`);
}

async function capture(name) {
  const screenshot = await browser.command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
}

async function runTransition(key, { durationMs = 900, artifactPrefix = null } = {}) {
  const before = await stableState();
  const watch = browser.evaluate(transitionProbe(durationMs));
  await delay(40);
  await browser.key(key);
  if (artifactPrefix) {
    await capture(`${artifactPrefix}-000`);
    await delay(160);
    await capture(`${artifactPrefix}-160`);
    await delay(200);
    await capture(`${artifactPrefix}-360`);
  }
  const samples = await watch;
  await delay(120);
  const after = await stableState();
  const flippingSamples = samples.filter(sample => sample.flipping);
  const motionSignatures = new Set(flippingSamples.flatMap(sample => sample.items));
  const visibleShadowSamples = flippingSamples.filter(sample => sample.visibleShadows.length > 0);
  return { before, after, samples, flippingSamples, motionSignatures, visibleShadowSamples };
}

async function runEdgeDrag({ direction = "forward", distanceRatio = 0.5, pointer = "mouse", durationMs = 1000 }) {
  const before = await stableState();
  const rect = before.block;
  assert.ok(rect?.width > 100 && rect?.height > 100, "PageFlip interaction surface is not measurable");
  const pageWidth = before.spread === "double" ? rect.width / 2 : rect.width;
  const forward = direction === "forward";
  const startX = forward ? rect.right - 18 : rect.left + 18;
  const endX = startX + (forward ? -1 : 1) * pageWidth * distanceRatio;
  const y = rect.top + rect.height * 0.42;
  const watch = browser.evaluate(transitionProbe(durationMs));
  const send = pointer === "touch" ? touch : mouse;
  await send(pointer === "touch" ? "touchStart" : "mousePressed", startX, y);
  await delay(50);
  for (let step = 1; step <= 8; step += 1) {
    await send(pointer === "touch" ? "touchMove" : "mouseMoved", startX + (endX - startX) * step / 8, y);
    await delay(24);
  }
  // Keep the last sample old enough that a short drag cannot be mistaken for a flick.
  await delay(130);
  await send(pointer === "touch" ? "touchEnd" : "mouseReleased", endX, y);
  const samples = await watch;
  await delay(150);
  const after = await stableState();
  return {
    before,
    after,
    samples,
    userFoldSamples: samples.filter(sample => sample.flipping && sample.curling),
    flippingSamples: samples.filter(sample => sample.flipping),
  };
}

function assertDragLifecycle(result, label, { committed }) {
  assert.ok(result.userFoldSamples.length > 1, `${label}: user_fold was not observable during edge drag`);
  assert.ok(result.userFoldSamples.some(sample => sample.pageFlipState === 'user_fold'), `${label}: StPageFlip user_fold state missing`);
  const motionSignatures = new Set(result.flippingSamples.flatMap(sample => sample.items));
  assert.ok(motionSignatures.size > 2, `${label}: generated PageFlip transforms did not change`);
  assert.equal(result.after.flipping, false, `${label}: stale is-flipping state`);
  assert.equal(result.after.pageFlipState, "read", `${label}: StPageFlip did not return to read state`);
  assert.equal(result.samples.at(-1)?.curling, false, `${label}: stale is-page-curling state`);
  const delta = result.after.page - result.before.page;
  if (committed) assert.notEqual(delta, 0, `${label}: committed drag did not change the page`);
  else assert.equal(delta, 0, `${label}: short drag unexpectedly changed the page`);
}

function assertTransitionLifecycle(result, label, { reduced = false } = {}) {
  assert.ok(result.flippingSamples.length > 1, `${label}: is-flipping state was never observable`);
  assert.ok(result.motionSignatures.size > 2, `${label}: page transforms did not change`);
  assert.ok(
    result.visibleShadowSamples.length > 1,
    `${label}: historical PageFlip transition cue is absent even though transforms are running`,
  );
  assert.equal(result.after.flipping, false, `${label}: stale is-flipping class`);
  assert.equal(result.after.pageFlipState, "read", `${label}: StPageFlip did not return to read state`);
  assert.deepEqual(result.after.visibleShadows, [], `${label}: shadow remained visible after transition`);
  const lastFlipping = result.flippingSamples.at(-1)?.at || Infinity;
  if (reduced) {
    assert.ok(lastFlipping < 380, `${label}: reduced-motion transition lasted ${lastFlipping.toFixed(0)}ms`);
  } else {
    assert.ok(lastFlipping >= 350, `${label}: 620/470ms StPageFlip duration collapsed to ${lastFlipping.toFixed(0)}ms`);
  }
}

try {
  await openPdf({ width: 1440, height: 900, mobile: false });
  const desktopStart = await stableState();
  assert.equal(desktopStart.spread, "double", "desktop must use a spread");
  assert.ok(Math.abs(desktopStart.gap) <= 1, `PageFlip page geometry must remain contiguous, got ${desktopStart.gap}`);
  assert.ok(desktopStart.block.seam.width >= 6 && desktopStart.block.seam.width <= 12, `initial visual seam ${desktopStart.block.seam.width}`);

  const next = await runTransition("ArrowRight", { artifactPrefix: "before-after-next" });
  assertTransitionLifecycle(next, "desktop next");
  assert.equal(next.after.page, next.before.page + 2, "desktop next direction/page convention changed");
  assert.ok(next.after.block.seam.width >= 6 && next.after.block.seam.width <= 12, `next visual seam ${next.after.block.seam.width}`);

  const previous = await runTransition("ArrowLeft");
  assertTransitionLifecycle(previous, "desktop previous");
  assert.equal(previous.after.page, previous.before.page - 2, "desktop previous direction/page convention changed");
  assert.ok(previous.after.block.seam.width >= 6 && previous.after.block.seam.width <= 12, `previous visual seam ${previous.after.block.seam.width}`);

  const shortMouseDrag = await runEdgeDrag({ distanceRatio: 0.08, pointer: "mouse" });
  assertDragLifecycle(shortMouseDrag, "desktop short mouse drag", { committed: false });
  const committedMouseDrag = await runEdgeDrag({ distanceRatio: 0.52, pointer: "mouse" });
  assertDragLifecycle(committedMouseDrag, "desktop committed mouse drag", { committed: true });

  // StPageFlip owns transform/clip/z-index on these generated elements. An
  // author-level translate creates a second coordinate system during folding.
  const authorTranslate = committedMouseDrag.flippingSamples
    .flatMap(sample => sample.items)
    .find(signature => !signature.endsWith('|none'));

  const rapidStart = await stableState();
  await browser.key("ArrowRight");
  await delay(55);
  await browser.key("ArrowRight");
  await delay(55);
  await browser.key("ArrowLeft");
  await delay(900);
  const rapidEnd = await stableState();
  assert.equal(rapidEnd.page, rapidStart.page + 2, "rapid navigation guard changed current spread unexpectedly");
  assert.equal(rapidEnd.flipping, false, "rapid navigation left a stale transition state");

  await browser.evaluate("document.getElementById('rdr-settings-open').click()");
  await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open === true", "reader settings");
  const hasFullscreen = await browser.evaluate("Boolean(document.getElementById('fullscreen-toggle'))");
  if (hasFullscreen) {
    await browser.click("#fullscreen-toggle + .switch-track");
    await browser.waitFor("Boolean(document.fullscreenElement || document.webkitFullscreenElement)", "fullscreen enter");
    await browser.evaluate("document.querySelector('#rdr-settings-sheet [data-close-sheet]').click()");
    const fullscreenNext = await runTransition("ArrowRight");
    assertTransitionLifecycle(fullscreenNext, "fullscreen next");
    assert.equal(fullscreenNext.after.fullscreen, true, "fullscreen exited during transition");
    await browser.evaluate("document.exitFullscreen?.() || document.webkitExitFullscreen?.()");
    await browser.waitFor("!document.fullscreenElement && !document.webkitFullscreenElement", "fullscreen exit");
  } else {
    await browser.evaluate("document.querySelector('#rdr-settings-sheet [data-close-sheet]').click()");
  }

  await openPdf({ width: 390, height: 844, mobile: true });
  const mobileStart = await stableState();
  assert.equal(mobileStart.spread, "single", "mobile must use single-page mode");
  const mobileNext = await runTransition("ArrowRight");
  assertTransitionLifecycle(mobileNext, "mobile next");
  assert.equal(mobileNext.after.page, mobileNext.before.page + 1, "mobile next did not advance one page");
  const mobilePrevious = await runTransition("ArrowLeft");
  assertTransitionLifecycle(mobilePrevious, "mobile previous");
  assert.equal(mobilePrevious.after.page, mobilePrevious.before.page - 1, "mobile previous did not reverse one page");
  const shortTouchDrag = await runEdgeDrag({ distanceRatio: 0.08, pointer: "touch" });
  assertDragLifecycle(shortTouchDrag, "mobile short touch drag", { committed: false });
  const committedTouchDrag = await runEdgeDrag({ distanceRatio: 0.52, pointer: "touch" });
  assertDragLifecycle(committedTouchDrag, "mobile committed touch drag", { committed: true });
  assert.equal(authorTranslate, undefined, `PageFlip-managed item has external translate: ${authorTranslate}`);

  await openPdf({ width: 390, height: 844, mobile: true, reduced: true });
  const reducedNext = await runTransition("ArrowRight", { durationMs: 500 });
  assertTransitionLifecycle(reducedNext, "reduced-motion next", { reduced: true });
  assert.equal(reducedNext.after.page, reducedNext.before.page + 1, "reduced-motion next did not advance");

  assertCleanDiagnostics(browser, "reader page transition");
  console.log("PASS reader page transition: keyboard, mouse/touch edge drag, cancel/commit, spread/single, fullscreen, reduced motion, cleanup");
} finally {
  await browser.close();
  await server.close();
}
