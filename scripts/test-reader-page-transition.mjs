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
      page: Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
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

function assertTransitionLifecycle(result, label, { reduced = false } = {}) {
  assert.ok(result.flippingSamples.length > 1, `${label}: is-flipping state was never observable`);
  assert.ok(result.motionSignatures.size > 2, `${label}: page transforms did not change`);
  assert.ok(
    result.visibleShadowSamples.length > 1,
    `${label}: historical PageFlip transition cue is absent even though transforms are running`,
  );
  assert.equal(result.after.flipping, false, `${label}: stale is-flipping class`);
  assert.deepEqual(result.after.visibleShadows, [], `${label}: shadow remained visible after transition`);
  if (reduced) {
    const lastFlipping = result.flippingSamples.at(-1)?.at || Infinity;
    assert.ok(lastFlipping < 380, `${label}: reduced-motion transition lasted ${lastFlipping.toFixed(0)}ms`);
  }
}

try {
  await openPdf({ width: 1440, height: 900, mobile: false });
  const desktopStart = await stableState();
  assert.equal(desktopStart.spread, "double", "desktop must use a spread");
  assert.ok(desktopStart.gap >= 6 && desktopStart.gap <= 12, `initial spread gap ${desktopStart.gap}`);

  const next = await runTransition("ArrowRight", { artifactPrefix: "before-after-next" });
  assertTransitionLifecycle(next, "desktop next");
  assert.equal(next.after.page, next.before.page + 2, "desktop next direction/page convention changed");
  assert.ok(next.after.gap >= 6 && next.after.gap <= 12, `next spread gap ${next.after.gap}`);

  const previous = await runTransition("ArrowLeft");
  assertTransitionLifecycle(previous, "desktop previous");
  assert.equal(previous.after.page, previous.before.page - 2, "desktop previous direction/page convention changed");
  assert.ok(previous.after.gap >= 6 && previous.after.gap <= 12, `previous spread gap ${previous.after.gap}`);

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

  await openPdf({ width: 390, height: 844, mobile: true, reduced: true });
  const reducedNext = await runTransition("ArrowRight", { durationMs: 500 });
  assertTransitionLifecycle(reducedNext, "reduced-motion next", { reduced: true });
  assert.equal(reducedNext.after.page, reducedNext.before.page + 1, "reduced-motion next did not advance");

  assertCleanDiagnostics(browser, "reader page transition");
  console.log("PASS reader page transition: next/previous, spread/single, rapid guard, fullscreen, reduced motion, cleanup");
} finally {
  await browser.close();
  await server.close();
}
