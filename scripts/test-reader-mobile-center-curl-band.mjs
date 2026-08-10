/**
 * MOBIL MERKEZ KIVRIM BANDI.
 *
 * Bu test ekran goruntusunu bir pass/fail piksel referansi olarak kullanmaz.
 * Gorsel QA karelerini parmak hala asagidayken uretir; otomatik sozlesmeyi ise
 * gercek curl dugumlerinin DOM geometrisi ve yasam dongusu uzerinden kurar.
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

const VIEWPORT = { width: 440, height: 956 };
const CAPTURE_PROGRESS = [0.10, 0.25, 0.50, 0.75, 0.90];
const BAND_MIN_RATIO = 0.08;
const BAND_MAX_RATIO = 0.15;
const BAND_TOLERANCE_PX = 1.5;
const FINGER_LOCK_PX = 8;
const EXPECTED_SLICES = 12;
const MIN_PROFILE_SAMPLES = 9;
const SOAK_GESTURES = 50;
const FRAME_MEDIAN_TARGET_MS = 20.5;
const FRAME_P95_TARGET_MS = 34;
const HEAP_GROWTH_RATIO_LIMIT = 1.5;
const MAX_SLICE_OVERLAP_PX = 2.25;

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-mobile-center-curl-band");
const artifactDir = join(ROOT, "test-artifacts", "page-curl", "after");
await mkdir(artifactDir, { recursive: true });

const touch = (type, x, y) => browser.command("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" || type === "touchCancel"
    ? []
    : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4 }],
});

const twoFrames = () => browser.evaluate(
  "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
);

async function screenshot(name) {
  const shot = await browser.command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(shot.data, "base64"));
}

async function openReader(page = 12) {
  await browser.setViewport({ ...VIEWPORT, mobile: true, deviceScaleFactor: 2 });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`
    localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'page',pageSound:false,theme:'light'}));
    localStorage.setItem('ravza-books-last-read', JSON.stringify({'kucuk-prens':{page:${page}}}));
    location.reload();`);
  await delay(700);
  await browser.waitFor(
    "document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]')",
    "kitaplik",
    45000,
  );
  await browser.evaluate("document.querySelector('.library-book-card[data-book-id=\"kucuk-prens\"]').click()");
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "okuyucu", 60000);
  await browser.waitFor(
    "document.querySelector('.stf__block') && document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'",
    "PageFlip read",
    30000,
  );
  await delay(1600);
}

const currentPage = () => browser.evaluate(
  "Number(document.getElementById('reader-inner')?.dataset.currentPage || 0)",
);

async function installCanonicalFlipProbe() {
  const installed = await browser.evaluate(`(() => {
    const prototype = window.St?.PageFlip?.prototype;
    if (!prototype || typeof prototype.trigger !== 'function') return false;
    const current = prototype.trigger;
    if (!current.__centerCurlFlipProbeWrapped) {
      const wrapped = function(name, object, data = null) {
        if (name === 'flip' && window.__centerCurlFlipProbe) {
          window.__centerCurlFlipProbe.events.push({ data:Number(data), at:performance.now() });
        }
        return current.call(this, name, object, data);
      };
      Object.defineProperty(wrapped, '__centerCurlFlipProbeWrapped', { value:true });
      prototype.trigger = wrapped;
    }
    window.__centerCurlFlipProbe = { events:[] };
    return true;
  })()`);
  assert.equal(installed, true, "could not install canonical PageFlip event probe");
}

const resetCanonicalFlipProbe = () => browser.evaluate(
  "window.__centerCurlFlipProbe && (window.__centerCurlFlipProbe.events = [])",
);

const canonicalFlipEvents = () => browser.evaluate(
  "JSON.stringify(window.__centerCurlFlipProbe?.events || [])",
).then(raw => JSON.parse(raw));

async function assertCanonicalFlipEvents(expectedCount, label, expectedPage = null) {
  const events = await canonicalFlipEvents();
  assert.equal(events.length, expectedCount, `${label}: emitted ${events.length} canonical flip events, expected ${expectedCount}`);
  if (expectedCount === 1 && expectedPage !== null) {
    const expectedIndex = expectedPage - 1;
    assert.equal(events[0].data, expectedIndex, `${label}: canonical flip event targeted index ${events[0].data}, expected ${expectedIndex}`);
  }
}

const stageGeometry = () => browser.evaluate(`JSON.stringify((() => {
  const stage = document.getElementById('rdr-stage');
  const block = document.querySelector('.stf__block');
  if (!stage || !block) return null;
  const r = stage.getBoundingClientRect();
  const b = block.getBoundingClientRect();
  return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height,
    block:{ left:b.left, top:b.top, right:b.right, bottom:b.bottom, width:b.width, height:b.height } };
})())`).then((raw) => JSON.parse(raw));

function normalizedDirection(value) {
  if (["forward", "next"].includes(value)) return "forward";
  if (["back", "previous", "prev"].includes(value)) return "back";
  return value || "";
}

const centerSnapshot = () => browser.evaluate(`JSON.stringify((() => {
  const root = document.querySelector('[data-reader-center-curl]');
  if (!root) return { exists:false };
  const visible = element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.01 && rect.width > 0.5 && rect.height > 0.5;
  };
  const isFlat = element => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === 'none') return true;
    try {
      const matrix = new DOMMatrix(transform);
      return Math.abs(matrix.b) < 0.002 && Math.abs(matrix.c) < 0.002
        && Math.abs(matrix.m13) < 0.002 && Math.abs(matrix.m23) < 0.002;
    } catch (_) {
      return false;
    }
  };
  const role = name => [...root.querySelectorAll('[data-curl-role="' + name + '"]')];
  const back = role('back');
  const backPrint = back[0]?.querySelector('.center-curl__print');
  const currentPrint = role('current')[0]?.querySelector('.center-curl__print');
  const currentContentWidth = Number.parseFloat(currentPrint?.style.backgroundSize);
  const currentContentLeft = Number.parseFloat(currentPrint?.style.backgroundPosition);
  const telemetryXs = String(root.dataset.curlFoldXs || '')
    .split(',').map(Number).filter(Number.isFinite);
  const crease = root.querySelector('[data-curl-crease]');
  const clipXs = (crease?.style.clipPath.match(/-?[0-9.]+px/g) || []).map(Number.parseFloat);
  const half = Math.floor(clipXs.length / 2);
  const creaseLeft = Number.parseFloat(crease?.style.left) || 0;
  const foldXs = Array.from({ length:half }, (_, index) => (
    creaseLeft + (clipXs[index] + clipXs[clipXs.length - 1 - index]) / 2
  ));
  const telemetryDelta = foldXs.length === telemetryXs.length
    ? Math.max(...foldXs.map((value, index) => Math.abs(value - telemetryXs[index])))
    : Infinity;
  const curveCenter = Number.parseFloat(root.dataset.curlCurveCenter);
  const contactIndex = foldXs.length
    ? Math.round(Math.max(0, Math.min(1, curveCenter)) * (foldXs.length - 1))
    : -1;
  const sliceDetails = [...root.querySelectorAll('[data-curl-slice]')]
    .sort((left, right) => Number(left.dataset.curlSlice) - Number(right.dataset.curlSlice))
    .map(element => {
      const print = element.querySelector('.center-curl__print');
      const sliceClipXs = (element.style.clipPath.match(/-?[0-9.]+px/g) || []).map(Number.parseFloat);
      const sliceHalf = Math.floor(sliceClipXs.length / 2);
      const clipLefts = sliceClipXs.slice(0, sliceHalf);
      const clipRights = Array.from(
        { length:sliceHalf },
        (_, index) => sliceClipXs[sliceClipXs.length - 1 - index],
      );
      const backgroundSizeX = Number.parseFloat(print?.style.backgroundSize);
      const backgroundPositionX = Number.parseFloat(print?.style.backgroundPosition);
      const scale = backgroundSizeX / currentContentWidth;
      const mid = Math.floor(clipLefts.length / 2);
      const actualSourceX = Number.isFinite(scale) && Math.abs(scale) > 0.0001
        ? currentContentLeft + (clipLefts[mid] - backgroundPositionX) / scale
        : NaN;
      return {
        index:Number(element.dataset.curlSlice),
        role:element.dataset.curlRole || '',
        sourceX:Number.parseFloat(element.dataset.curlSourceX),
        actualSourceX,
        left:Number.parseFloat(element.style.left),
        width:Number.parseFloat(element.style.width),
        clipLefts,
        clipRights,
        printTransform:print?.style.transform || '',
      };
    });
  return {
    exists:true,
    mode:root.dataset.curlMode || '',
    direction:root.dataset.curlDirection || '',
    bandWidth:Number.parseFloat(root.dataset.curlBandWidth),
    creaseX:Number.parseFloat(root.dataset.curlCreaseX),
    fingerX:Number.parseFloat(root.dataset.curlFingerX),
    progress:Number.parseFloat(root.dataset.curlProgress),
    foldXs,
    telemetryDelta,
    renderedContactX:contactIndex >= 0 ? foldXs[contactIndex] : NaN,
    slices:root.querySelectorAll('[data-curl-slice]').length,
    sliceDetails,
    currentCount:role('current').length,
    targetCount:role('target').length,
    backCount:back.length,
    flatCurrent:role('current').every(isFlat),
    flatTarget:role('target').every(isFlat),
    visibleBack:back.some(element => visible(element) || [...element.querySelectorAll('*')].some(visible)),
    theme:document.getElementById('ravzabooks')?.dataset.readerTheme || '',
    paperColor:getComputedStyle(root).backgroundColor,
    backPrintOpacity:backPrint ? Number(getComputedStyle(backPrint).opacity) : NaN,
    textureCurrentPage:Number(root.dataset.curlCurrentPage),
    textureTargetPage:Number(root.dataset.curlTargetPage),
    canonicalPage:Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
    pageFlipState:document.getElementById('reader-inner')?.dataset.pageFlipState || '',
  };
})())`).then((raw) => JSON.parse(raw));

function assertSliceContract(snapshot, label, direction) {
  const slices = snapshot.sliceDetails || [];
  assert.equal(slices.length, EXPECTED_SLICES, `${label}: actual slice detail count is ${slices.length}`);
  const midpoint = EXPECTED_SLICES / 2;
  const allVisibleWidths = [];

  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index];
    const expectedRole = direction === "forward"
      ? (index < midpoint ? "front" : "back")
      : (index < midpoint ? "back" : "front");
    assert.equal(slice.index, index, `${label}: slice order/index mismatch at ${index}`);
    assert.equal(slice.role, expectedRole, `${label}: slice ${index} is ${slice.role}, expected ${expectedRole}`);
    assert.ok(Number.isFinite(slice.left) && Number.isFinite(slice.width) && slice.width > 0.5, `${label}: slice ${index} has invalid box geometry`);
    assert.ok(slice.clipLefts.length >= MIN_PROFILE_SAMPLES, `${label}: slice ${index} has only ${slice.clipLefts.length} clip samples`);
    assert.equal(slice.clipRights.length, slice.clipLefts.length, `${label}: slice ${index} clip polygon is incomplete`);
    assert.ok(Number.isFinite(slice.sourceX), `${label}: slice ${index} source X is missing`);
    assert.ok(Number.isFinite(slice.actualSourceX), `${label}: slice ${index} rendered background source X is unreadable`);
    assert.ok(
      Math.abs(slice.actualSourceX - slice.sourceX) <= 1,
      `${label}: slice ${index} rendered source differs from its material source by ${Math.abs(slice.actualSourceX - slice.sourceX).toFixed(2)}px`,
    );
    assert.equal(slice.printTransform === "scaleX(-1)", expectedRole === "back", `${label}: slice ${index} mirror state does not match ${expectedRole} face`);
    for (let sample = 0; sample < slice.clipLefts.length; sample += 1) {
      const visibleWidth = slice.clipRights[sample] - slice.clipLefts[sample];
      assert.ok(visibleWidth > 0.5, `${label}: slice ${index} collapses at Y sample ${sample}`);
      allVisibleWidths.push(visibleWidth);
    }
  }

  for (let index = 0; index < slices.length - 1; index += 1) {
    const current = slices[index];
    const next = slices[index + 1];
    for (let sample = 0; sample < current.clipLefts.length; sample += 1) {
      const currentRight = current.left + current.clipRights[sample];
      const nextLeft = next.left + next.clipLefts[sample];
      const gap = nextLeft - currentRight;
      assert.ok(gap <= 0.25, `${label}: ${gap.toFixed(2)}px transparent gap between slices ${index}/${index + 1}`);
      assert.ok(gap >= -MAX_SLICE_OVERLAP_PX, `${label}: ${Math.abs(gap).toFixed(2)}px overlap between slices ${index}/${index + 1}`);
    }
  }

  assert.ok(
    Math.max(...allVisibleWidths) - Math.min(...allVisibleWidths) >= snapshot.bandWidth * 0.04,
    `${label}: all slice widths are effectively flat/equal`,
  );
  const frontSources = slices.filter(slice => slice.role === "front").map(slice => slice.sourceX);
  const backSources = slices.filter(slice => slice.role === "back").map(slice => slice.sourceX);
  assert.ok(frontSources.slice(1).every((value, index) => value > frontSources[index] + 0.5), `${label}: front material X is not strictly continuous/forward`);
  assert.ok(backSources.slice(1).every((value, index) => value < backSources[index] - 0.5), `${label}: backside material X is not strictly reversed`);
  assert.ok(
    Math.abs(slices[midpoint].sourceX - slices[midpoint - 1].sourceX) <= 1,
    `${label}: front/back material mapping jumps at the face seam`,
  );
}

const edgeSnapshot = () => browser.evaluate(`JSON.stringify((() => {
  const moving = [...document.querySelectorAll('.stf__item')].filter(element => {
    const rect = element.getBoundingClientRect();
    const transform = getComputedStyle(element).transform;
    return rect.width > 1 && rect.height > 1 && transform && transform !== 'none'
      && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
  });
  return {
    centerRoot:Boolean(document.querySelector('[data-reader-center-curl]')),
    moving:moving.length,
    pageFlipState:document.getElementById('reader-inner')?.dataset.pageFlipState || '',
  };
})())`).then((raw) => JSON.parse(raw));

function assertCenterContract(snapshot, label, expectedDirection, options = {}) {
  assert.equal(snapshot.exists, true, `${label}: custom center curl root missing`);
  assert.equal(snapshot.mode, "band", `${label}: renderer mode is ${snapshot.mode || "empty"}`);
  assert.equal(normalizedDirection(snapshot.direction), expectedDirection, `${label}: wrong direction ${snapshot.direction}`);
  assert.equal(snapshot.slices, EXPECTED_SLICES, `${label}: ${snapshot.slices} curl slices, expected ${EXPECTED_SLICES}`);
  assertSliceContract(snapshot, label, expectedDirection);
  assert.ok(snapshot.currentCount >= 1, `${label}: flat current surface missing`);
  assert.ok(snapshot.targetCount >= 1, `${label}: flat target surface missing`);
  assert.ok(snapshot.backCount >= 1, `${label}: backside surface missing`);
  assert.equal(snapshot.flatCurrent, true, `${label}: broad current surface is transformed/rotated`);
  assert.equal(snapshot.flatTarget, true, `${label}: broad target surface is transformed/rotated`);
  assert.equal(snapshot.textureCurrentPage, snapshot.canonicalPage, `${label}: current texture/page mapping is wrong`);
  assert.equal(
    snapshot.textureTargetPage,
    snapshot.textureCurrentPage + (expectedDirection === "forward" ? 1 : -1),
    `${label}: target texture/page mapping is wrong`,
  );
  for (const [name, value] of Object.entries({
    bandWidth: snapshot.bandWidth,
    creaseX: snapshot.creaseX,
    fingerX: snapshot.fingerX,
    progress: snapshot.progress,
  })) {
    assert.ok(Number.isFinite(value), `${label}: data-curl-${name} is not numeric`);
  }
  assert.ok(snapshot.foldXs.length >= MIN_PROFILE_SAMPLES, `${label}: fold profile has only ${snapshot.foldXs.length} Y samples`);
  assert.ok(snapshot.telemetryDelta <= 1, `${label}: telemetry differs from rendered crease by ${snapshot.telemetryDelta.toFixed(2)}px`);
  assert.ok(
    Math.abs(snapshot.renderedContactX - snapshot.fingerX) <= FINGER_LOCK_PX,
    `${label}: rendered crease/finger drift ${Math.abs(snapshot.renderedContactX - snapshot.fingerX).toFixed(1)}px exceeds ${FINGER_LOCK_PX}px`,
  );
  if (options.medium) {
    assert.ok(snapshot.visibleBack, `${label}: backside is not visible at medium curl`);
    assert.ok(
      snapshot.bandWidth >= VIEWPORT.width * BAND_MIN_RATIO - BAND_TOLERANCE_PX,
      `${label}: band ${snapshot.bandWidth}px is below ${(BAND_MIN_RATIO * 100).toFixed(0)}%`,
    );
    assert.ok(
      snapshot.bandWidth <= VIEWPORT.width * BAND_MAX_RATIO + BAND_TOLERANCE_PX,
      `${label}: band ${snapshot.bandWidth}px exceeds ${(BAND_MAX_RATIO * 100).toFixed(0)}%`,
    );
    const verticalRange = Math.max(...snapshot.foldXs) - Math.min(...snapshot.foldXs);
    assert.ok(
      verticalRange <= Math.max(snapshot.bandWidth * 1.1, VIEWPORT.width * BAND_MAX_RATIO),
      `${label}: fold spans ${verticalRange.toFixed(1)}px horizontally and no longer reads as a vertical band`,
    );
  }
}

async function startDrag({ startRatio, yRatio = 0.5, direction, progress = 0.1 }) {
  const stage = await stageGeometry();
  assert.ok(stage?.width > 100 && stage?.height > 100, "reader stage geometry missing");
  const startX = stage.left + stage.width * startRatio;
  const y = stage.top + stage.height * yRatio;
  const sign = direction === "forward" ? -1 : 1;
  const effectiveTravel = direction === "forward"
    ? startX - stage.left
    : stage.left + stage.width - startX;
  const session = { stage, startX, y, sign, direction, effectiveTravel, currentX:startX, progress:0 };
  await touch("touchStart", startX, y);
  await moveDrag(session, progress, 8);
  return session;
}

async function moveDrag(session, progress, steps = 5) {
  const fromX = session.currentX;
  const targetX = session.startX + session.sign * session.effectiveTravel * progress;
  for (let step = 1; step <= steps; step += 1) {
    await touch("touchMove", fromX + (targetX - fromX) * step / steps, session.y);
    await delay(24);
  }
  session.currentX = targetX;
  session.progress = progress;
  await twoFrames();
}

async function cancelDrag(session, expectedPage, label) {
  await resetCanonicalFlipProbe();
  await moveDrag(session, 0.04, 5);
  // Keep the last sample old enough that returning to the start is not a flick.
  await delay(150);
  await touch("touchEnd", session.currentX, session.y);
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", `${label} root cleanup`, 10000);
  await browser.waitFor(
    "document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'",
    `${label} read cleanup`,
    10000,
  );
  await delay(120);
  assert.equal(await currentPage(), expectedPage, `${label}: cancel changed canonical page`);
  await assertCanonicalFlipEvents(0, label);
}

async function commitDrag(session, expectedPage, label) {
  await resetCanonicalFlipProbe();
  if (session.progress < 0.62) await moveDrag(session, 0.62, 5);
  await delay(150);
  await touch("touchEnd", session.currentX, session.y);
  await browser.waitFor(`Number(document.getElementById('reader-inner')?.dataset.currentPage || 0) === ${expectedPage}`, `${label} page commit`, 15000);
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", `${label} root cleanup`, 15000);
  await browser.waitFor(
    "document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'",
    `${label} read cleanup`,
    15000,
  );
  await delay(120);
  await assertCanonicalFlipEvents(1, label, expectedPage);
}

async function assertFrontClean(label) {
  const bad = JSON.parse(await browser.evaluate(`JSON.stringify((() => {
    const onscreen = element => {
      const r = element.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && r.right > 2 && r.left < innerWidth - 2;
    };
    const effectiveScaleX = node => {
      let matrix = new DOMMatrix();
      for (let current = node; current && current !== document.body; current = current.parentElement) {
        const transform = getComputedStyle(current).transform;
        if (transform && transform !== 'none') matrix = new DOMMatrix(transform).multiply(matrix);
      }
      return matrix.a;
    };
    const failures = [];
    for (const page of document.querySelectorAll('.pdf-page')) {
      if (!onscreen(page) || page.closest('[data-reader-center-curl]')) continue;
      const canvas = [...page.querySelectorAll('canvas')].find(node => !node.closest('.pdf-backside-print'));
      if (!canvas) continue;
      const scaleX = effectiveScaleX(canvas);
      const opacity = Number(getComputedStyle(canvas).opacity);
      if (!(scaleX > 0) || opacity !== 1) failures.push({ page:page.dataset.pdfPage, scaleX, opacity });
    }
    return failures;
  })())`));
  assert.deepEqual(bad, [], `${label}: real front canvas is mirrored/faded: ${JSON.stringify(bad)}`);
}

async function installMoveMutationProbe() {
  return browser.evaluate(`(() => {
    const root = document.querySelector('[data-reader-center-curl]');
    if (!root) return null;
    const state = {
      childList:0,
      rootCanvases:root.querySelectorAll('canvas').length,
      renderStarts:Number(window.__readerPerf?.renderStarts || 0),
    };
    const observer = new MutationObserver(records => {
      state.childList += records.filter(record => record.type === 'childList')
        .reduce((sum, record) => sum + record.addedNodes.length + record.removedNodes.length, 0);
    });
    observer.observe(root, { childList:true, subtree:true });
    window.__centerCurlMoveProbe = { state, observer };
    return state;
  })()`);
}

async function finishMoveMutationProbe() {
  return browser.evaluate(`(() => {
    const probe = window.__centerCurlMoveProbe;
    if (!probe) return null;
    probe.observer.takeRecords().forEach(record => {
      if (record.type === 'childList') probe.state.childList += record.addedNodes.length + record.removedNodes.length;
    });
    probe.observer.disconnect();
    const root = document.querySelector('[data-reader-center-curl]');
    const result = {
      ...probe.state,
      rootCanvasesAfter:root?.querySelectorAll('canvas').length ?? 0,
      renderStartsAfter:Number(window.__readerPerf?.renderStarts || 0),
    };
    delete window.__centerCurlMoveProbe;
    return result;
  })()`);
}

async function installRafFrameProbe() {
  return browser.evaluate(`(() => {
    const previous = window.__centerCurlRafProbe;
    if (previous?.frameId) cancelAnimationFrame(previous.frameId);
    const state = { active:true, frameId:0, previousTime:null, intervals:[] };
    const sample = timestamp => {
      if (!state.active) return;
      if (state.previousTime != null) state.intervals.push(timestamp - state.previousTime);
      state.previousTime = timestamp;
      state.frameId = requestAnimationFrame(sample);
    };
    state.frameId = requestAnimationFrame(sample);
    window.__centerCurlRafProbe = state;
    return true;
  })()`);
}

async function finishRafFrameProbe() {
  return browser.evaluate(`(() => {
    const state = window.__centerCurlRafProbe;
    if (!state) return null;
    state.active = false;
    if (state.frameId) cancelAnimationFrame(state.frameId);
    const intervals = state.intervals.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    const percentile = ratio => intervals.length
      ? intervals[Math.min(intervals.length - 1, Math.max(0, Math.ceil(intervals.length * ratio) - 1))]
      : null;
    const metrics = {
      samples:intervals.length,
      medianMs:percentile(0.5),
      p95Ms:percentile(0.95),
      maxMs:intervals.length ? intervals[intervals.length - 1] : null,
      over33_3:intervals.filter(value => value > 33.3).length,
      over50:intervals.filter(value => value > 50).length,
    };
    delete window.__centerCurlRafProbe;
    return metrics;
  })()`);
}

async function runtimeFootprint() {
  return browser.evaluate(`(() => ({
    centerRoots:document.querySelectorAll('[data-reader-center-curl]').length,
    centerSlices:document.querySelectorAll('[data-reader-center-curl] [data-curl-slice]').length,
    centerCanvases:document.querySelectorAll('[data-reader-center-curl] canvas').length,
    canvases:document.querySelectorAll('canvas').length,
    domNodes:document.querySelectorAll('*').length,
  }))()`);
}

async function collectHeapAfterGc() {
  try {
    await browser.command("HeapProfiler.enable");
    await browser.command("HeapProfiler.collectGarbage");
    await twoFrames();
    await browser.command("HeapProfiler.collectGarbage");
    const usage = await browser.command("Runtime.getHeapUsage");
    return {
      available:true,
      usedSize:Number(usage.usedSize),
      totalSize:Number(usage.totalSize),
      embedderHeapUsedSize:Number(usage.embedderHeapUsedSize),
      backingStorageSize:Number(usage.backingStorageSize),
    };
  } catch (error) {
    return { available:false, reason:String(error?.message || error) };
  }
}

function roundedMetrics(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [
    key,
    typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)) : value,
  ]));
}

let frameMetrics = null;
let soakMetrics = null;
let firstActivationMs = null;

try {
  await openReader(12);
  await installCanonicalFlipProbe();

  // Measure the user's first interaction after reader idle/prefetch warmup as
  // well as steady-state rAF. If warmup missed readiness, this also includes
  // the synchronous validated fallback texture capture.
  const activationPage = await currentPage();
  const activationStage = await stageGeometry();
  const activationX = activationStage.left + activationStage.width / 2;
  const activationY = activationStage.top + activationStage.height / 2;
  await resetCanonicalFlipProbe();
  await touch("touchStart", activationX, activationY);
  const activationStarted = performance.now();
  await touch("touchMove", activationX - 12, activationY);
  firstActivationMs = performance.now() - activationStarted;
  await browser.waitFor("document.querySelector('[data-reader-center-curl]')", "first center activation", 8000);
  await delay(150);
  await touch("touchEnd", activationX - 12, activationY);
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", "first activation cleanup", 12000);
  await browser.waitFor("document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'", "first activation read", 12000);
  assert.equal(await currentPage(), activationPage, "first activation changed page");
  await assertCanonicalFlipEvents(0, "first activation cancel");
  assert.ok(firstActivationMs <= 100, `first center activation took ${firstActivationMs.toFixed(1)}ms`);

  /* 1. Origin routing: inner 20%-80% is custom; edge zones stay PageFlip. */
  const routingPage = await currentPage();
  for (const ratio of [0.21, 0.50, 0.79]) {
    const session = await startDrag({ startRatio:ratio, direction:"forward", progress:0.14 });
    await browser.waitFor("document.querySelector('[data-reader-center-curl][data-curl-mode=\"band\"]')", `inner ${ratio} custom route`, 8000);
    const snapshot = await centerSnapshot();
    assertCenterContract(snapshot, `inner x=${Math.round(ratio * 100)}%`, "forward");
    assert.equal(snapshot.canonicalPage, routingPage, `inner x=${ratio}: canonical page changed during drag`);
    await cancelDrag(session, routingPage, `inner x=${ratio}`);
  }

  for (const testCase of [
    { ratio:0.08, direction:"back" },
    { ratio:0.92, direction:"forward" },
  ]) {
    const session = await startDrag({ startRatio:testCase.ratio, direction:testCase.direction, progress:0.18 });
    await browser.waitFor(
      "document.getElementById('reader-inner')?.dataset.pageFlipState === 'user_fold'",
      `edge ${testCase.direction} PageFlip route`,
      8000,
    );
    const edge = await edgeSnapshot();
    assert.equal(edge.centerRoot, false, `edge ${testCase.direction}: custom center root was created`);
    assert.ok(edge.moving > 0, `edge ${testCase.direction}: St.PageFlip surface did not move`);
    await cancelDrag(session, routingPage, `edge ${testCase.direction}`);
  }

  /* 2. Mandatory held-progress captures and band/finger/backside contract. */
  for (const direction of ["forward", "back"]) {
    const pageBefore = await currentPage();
    const session = await startDrag({ startRatio:0.5, direction, progress:CAPTURE_PROGRESS[0] });
    const lockErrors = [];
    for (const progress of CAPTURE_PROGRESS) {
      if (progress !== CAPTURE_PROGRESS[0]) await moveDrag(session, progress);
      const snapshot = await centerSnapshot();
      const pct = Math.round(progress * 100);
      assertCenterContract(snapshot, `${direction} ${pct}%`, direction, { medium:progress === 0.5 });
      assert.equal(snapshot.canonicalPage, pageBefore, `${direction} ${pct}%: page committed before release`);
      assert.ok(
        Math.abs(snapshot.progress - progress) <= 0.08,
        `${direction} ${pct}%: reported progress ${snapshot.progress.toFixed(3)}`,
      );
      lockErrors.push(snapshot.creaseX - snapshot.fingerX);
      await screenshot(`center-${direction === "forward" ? "forward" : "back"}-${pct}pct`);
    }
    assert.ok(
      Math.max(...lockErrors) - Math.min(...lockErrors) <= FINGER_LOCK_PX,
      `${direction}: finger-lock error is unstable (${lockErrors.map(value => value.toFixed(1)).join(", ")})`,
    );
    await cancelDrag(session, pageBefore, `${direction} capture sequence`);
    await assertFrontClean(`${direction} capture cleanup`);
  }

  /* 3. Once-created slices stay stable and no PDF render starts per move. */
  const perfPage = await currentPage();
  const perfSession = await startDrag({ startRatio:0.5, direction:"forward", progress:0.25 });
  await browser.waitFor(
    `document.querySelectorAll('[data-reader-center-curl] [data-curl-slice]').length === ${EXPECTED_SLICES}`,
    "center curl slice pool",
    8000,
  );
  const mutationStart = await installMoveMutationProbe();
  assert.ok(mutationStart, "move mutation probe could not attach");
  assert.equal(await installRafFrameProbe(), true, "rAF frame probe could not attach");
  for (const progress of [0.34, 0.43, 0.52, 0.61]) await moveDrag(perfSession, progress, 4);
  frameMetrics = await finishRafFrameProbe();
  const mutationEnd = await finishMoveMutationProbe();
  assert.equal(mutationEnd.childList, 0, `pointer moves created/removed ${mutationEnd.childList} curl nodes`);
  assert.equal(mutationEnd.rootCanvasesAfter, mutationEnd.rootCanvases, "pointer moves changed curl canvas count");
  assert.equal(mutationEnd.renderStartsAfter, mutationEnd.renderStarts, "pointer moves started a PDF.js render");
  assert.ok(frameMetrics?.samples >= 20, `rAF probe captured only ${frameMetrics?.samples || 0} frame intervals`);
  assert.ok(
    frameMetrics.medianMs <= FRAME_MEDIAN_TARGET_MS,
    `rAF median ${frameMetrics.medianMs.toFixed(2)}ms exceeds ${FRAME_MEDIAN_TARGET_MS}ms`,
  );
  assert.ok(
    frameMetrics.p95Ms <= FRAME_P95_TARGET_MS,
    `rAF p95 ${frameMetrics.p95Ms.toFixed(2)}ms exceeds ${FRAME_P95_TARGET_MS}ms`,
  );
  assert.ok(
    frameMetrics.over50 <= Math.max(1, Math.ceil(frameMetrics.samples * 0.03)),
    `${frameMetrics.over50}/${frameMetrics.samples} rAF intervals exceeded 50ms`,
  );
  await cancelDrag(perfSession, perfPage, "move mutation probe");

  /* 4. Canonical page commits only after the visual completes, exactly +/-1. */
  const beforeNext = await currentPage();
  const nextSession = await startDrag({ startRatio:0.5, direction:"forward", progress:0.62 });
  const heldNext = await centerSnapshot();
  assert.equal(heldNext.canonicalPage, beforeNext, "NEXT committed while finger was still down");
  await commitDrag(nextSession, beforeNext + 1, "center NEXT");
  await assertFrontClean("center NEXT cleanup");

  const beforePrevious = await currentPage();
  const previousSession = await startDrag({ startRatio:0.5, direction:"back", progress:0.62 });
  const heldPrevious = await centerSnapshot();
  assert.equal(heldPrevious.canonicalPage, beforePrevious, "PREVIOUS committed while finger was still down");
  await commitDrag(previousSession, beforePrevious - 1, "center PREVIOUS");
  await assertFrontClean("center PREVIOUS cleanup");

  // The locked direction must unwind when the finger crosses its origin; an
  // absolute-distance progress function would incorrectly grow and commit the
  // original direction on the opposite side.
  const reversalPage = await currentPage();
  await resetCanonicalFlipProbe();
  const reversalSession = await startDrag({ startRatio:0.5, direction:"forward", progress:0.35 });
  await moveDrag(reversalSession, -0.30, 6);
  const reversed = await centerSnapshot();
  assert.ok(reversed.progress <= 0.001, `direction reversal kept progress ${reversed.progress}`);
  await delay(150);
  await touch("touchEnd", reversalSession.currentX, reversalSession.y);
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", "direction reversal cleanup", 12000);
  await browser.waitFor("document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'", "direction reversal read", 12000);
  assert.equal(await currentPage(), reversalPage, "direction reversal committed the locked NEXT direction");
  await assertCanonicalFlipEvents(0, "direction reversal");

  // A native pointer cancellation must unwind without advancing PageFlip.
  const pointerCancelPage = await currentPage();
  await resetCanonicalFlipProbe();
  const pointerCancelSession = await startDrag({ startRatio:0.5, direction:"forward", progress:0.35 });
  await touch("touchCancel", pointerCancelSession.currentX, pointerCancelSession.y);
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", "pointer cancel cleanup", 12000);
  await browser.waitFor("document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'", "pointer cancel read", 12000);
  assert.equal(await currentPage(), pointerCancelPage, "pointer cancel changed canonical page");
  await assertCanonicalFlipEvents(0, "pointer cancel");

  // Near the inner-band boundaries a full destination-edge drag still commits
  // because center progress is based on the remaining effective travel.
  const boundaryNextPage = await currentPage();
  const boundaryNext = await startDrag({ startRatio:0.21, direction:"forward", progress:0.95 });
  await commitDrag(boundaryNext, boundaryNextPage + 1, "inner-boundary NEXT");
  const boundaryBack = await startDrag({ startRatio:0.79, direction:"back", progress:0.95 });
  await commitDrag(boundaryBack, boundaryNextPage, "inner-boundary PREVIOUS");

  // Blur after pointerup must not replace the already accepted completion with
  // a second cancel settle.
  const blurPage = await currentPage();
  await resetCanonicalFlipProbe();
  const blurCommit = await startDrag({ startRatio:0.5, direction:"forward", progress:0.62 });
  await delay(150);
  await touch("touchEnd", blurCommit.currentX, blurCommit.y);
  await browser.evaluate("window.dispatchEvent(new Event('blur'))");
  await browser.waitFor(`Number(document.getElementById('reader-inner')?.dataset.currentPage || 0) === ${blurPage + 1}`, "blur commit preserved", 15000);
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", "blur commit cleanup", 15000);
  await assertCanonicalFlipEvents(1, "blur-after-release commit", blurPage + 1);
  const blurRestore = await startDrag({ startRatio:0.5, direction:"back", progress:0.62 });
  await commitDrag(blurRestore, blurPage, "blur test restore");

  // All reading themes use the same curved geometry and the existing 0.22
  // mirrored-print contract, with a theme-specific opaque paper surface.
  const themePaperColors = new Set();
  for (const theme of ["light", "sepia", "dark", "black"]) {
    await browser.evaluate(`document.querySelector('.theme-btn[data-theme="${theme}"]')?.click()`);
    await browser.waitFor(`document.getElementById('ravzabooks')?.dataset.readerTheme === '${theme}'`, `${theme} theme`, 8000);
    const themePage = await currentPage();
    const themeSession = await startDrag({ startRatio:0.5, direction:"forward", progress:0.5 });
    const themed = await centerSnapshot();
    assertCenterContract(themed, `${theme} theme`, "forward", { medium:true });
    assert.equal(themed.theme, theme, `${theme}: center curl kept ${themed.theme} theme`);
    assert.ok(themed.paperColor && themed.paperColor !== "rgba(0, 0, 0, 0)", `${theme}: curl paper is transparent`);
    assert.ok(Math.abs(themed.backPrintOpacity - 0.22) <= 0.01, `${theme}: backside opacity ${themed.backPrintOpacity}`);
    themePaperColors.add(themed.paperColor);
    await screenshot(`center-theme-${theme}-50pct`);
    await cancelDrag(themeSession, themePage, `${theme} theme`);
  }
  assert.ok(themePaperColors.size >= 3, `theme paper colors collapsed to ${[...themePaperColors].join(", ")}`);
  await browser.evaluate("document.querySelector('.theme-btn[data-theme=\"light\"]')?.click()");
  await browser.waitFor("document.getElementById('ravzabooks')?.dataset.readerTheme === 'light'", "restore light theme", 8000);

  /* 5. Fifty mixed NEXT/PREV commit/cancel curls leave no temporary DOM/canvas/heap growth. */
  await delay(300);
  const soakStartPage = await currentPage();
  const footprintBefore = await runtimeFootprint();
  const heapBefore = await collectHeapAfterGc();
  const domNodeLimit = Math.ceil(footprintBefore.domNodes * 1.02) + 4;
  const operations = { commits:0, cancels:0, forward:0, back:0 };
  const maxCleanup = { centerRoots:0, centerSlices:0, centerCanvases:0, canvases:0, domNodes:0 };

  for (let index = 0; index < SOAK_GESTURES; index += 1) {
    let direction;
    let shouldCommit;
    if (index >= 48) {
      direction = index === 48 ? "forward" : "back";
      shouldCommit = false;
    } else {
      const phase = index % 4;
      direction = phase === 0 || phase === 3 ? "forward" : "back";
      shouldCommit = phase === 0 || phase === 2;
    }
    const originOptions = direction === "forward" ? [0.50, 0.62, 0.70] : [0.50, 0.38, 0.30];
    const pageBefore = await currentPage();
    const session = await startDrag({
      startRatio:originOptions[index % originOptions.length],
      yRatio:[0.32, 0.50, 0.68][index % 3],
      direction,
      progress:shouldCommit ? 0.62 : 0.18,
    });
    const label = `soak ${index + 1}/${SOAK_GESTURES} ${direction} ${shouldCommit ? "commit" : "cancel"}`;
    if (shouldCommit) {
      const expectedPage = pageBefore + (direction === "forward" ? 1 : -1);
      await commitDrag(session, expectedPage, label);
      operations.commits += 1;
    } else {
      await cancelDrag(session, pageBefore, label);
      operations.cancels += 1;
    }
    operations[direction] += 1;

    const footprint = await runtimeFootprint();
    for (const key of Object.keys(maxCleanup)) maxCleanup[key] = Math.max(maxCleanup[key], footprint[key]);
    assert.equal(footprint.centerRoots, 0, `${label}: temporary center root leaked`);
    assert.equal(footprint.centerSlices, 0, `${label}: temporary center slices leaked`);
    assert.equal(footprint.centerCanvases, 0, `${label}: temporary center canvas leaked`);
    assert.equal(
      footprint.canvases,
      footprintBefore.canvases,
      `${label}: canvas count ${footprint.canvases}, baseline ${footprintBefore.canvases}`,
    );
    assert.ok(
      footprint.domNodes <= domNodeLimit,
      `${label}: DOM count ${footprint.domNodes} exceeds bounded limit ${domNodeLimit}`,
    );
  }

  await twoFrames();
  await delay(300);
  const footprintAfter = await runtimeFootprint();
  const heapAfter = await collectHeapAfterGc();
  assert.equal(await currentPage(), soakStartPage, "50-curl soak did not return to its starting page");
  assert.deepEqual(
    {
      centerRoots:footprintAfter.centerRoots,
      centerSlices:footprintAfter.centerSlices,
      centerCanvases:footprintAfter.centerCanvases,
    },
    { centerRoots:0, centerSlices:0, centerCanvases:0 },
    "50-curl soak left temporary center-curl nodes",
  );
  assert.equal(
    footprintAfter.canvases,
    footprintBefore.canvases,
    `50-curl soak canvas count ${footprintAfter.canvases}, baseline ${footprintBefore.canvases}`,
  );
  assert.ok(
    footprintAfter.domNodes <= domNodeLimit,
    `50-curl soak DOM count ${footprintAfter.domNodes} exceeds bounded limit ${domNodeLimit}`,
  );

  let heap = { before:heapBefore, after:heapAfter, growthRatio:null, deltaBytes:null };
  if (heapBefore.available && heapAfter.available && heapBefore.usedSize > 0) {
    heap = {
      before:heapBefore,
      after:heapAfter,
      growthRatio:heapAfter.usedSize / heapBefore.usedSize,
      deltaBytes:heapAfter.usedSize - heapBefore.usedSize,
    };
    assert.ok(
      heap.growthRatio <= HEAP_GROWTH_RATIO_LIMIT,
      `post-GC JS heap grew ${(heap.growthRatio * 100).toFixed(1)}% of baseline; limit is ${(HEAP_GROWTH_RATIO_LIMIT * 100).toFixed(0)}%`,
    );
  }

  soakMetrics = {
    gestures:SOAK_GESTURES,
    operations,
    startPage:soakStartPage,
    endPage:await currentPage(),
    domNodeLimit,
    footprintBefore,
    footprintAfter,
    maxCleanup,
    heap,
  };
  await writeFile(
    join(artifactDir, "center-curl-performance.json"),
    `${JSON.stringify({ viewport:VIEWPORT, firstActivationMs, frameIntervals:roundedMetrics(frameMetrics), soak:soakMetrics }, null, 2)}\n`,
    "utf8",
  );

  /* 6. A narrow tablet remains on the existing St.PageFlip path. */
  await browser.setViewport({ width:744, height:1133, mobile:true, deviceScaleFactor:2 });
  await browser.waitFor("innerWidth === 744", "tablet viewport", 10000);
  await browser.waitFor(
    "document.querySelector('.stf__block') && document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'",
    "tablet repagination",
    30000,
  );
  await delay(1200);
  const tabletPage = await currentPage();
  const tabletStage = await stageGeometry();
  const tabletX = tabletStage.left + tabletStage.width / 2;
  const tabletY = tabletStage.top + tabletStage.height / 2;
  await resetCanonicalFlipProbe();
  await touch("touchStart", tabletX, tabletY);
  for (let step = 1; step <= 6; step += 1) {
    await touch("touchMove", tabletX - 14 * step, tabletY);
    await delay(24);
  }
  assert.equal(
    await browser.evaluate("Boolean(document.querySelector('[data-reader-center-curl]'))"),
    false,
    "744px tablet incorrectly used the phone center renderer",
  );
  for (let step = 1; step <= 6; step += 1) {
    await touch("touchMove", tabletX - 84 + 14 * step, tabletY);
    await delay(24);
  }
  await delay(150);
  await touch("touchEnd", tabletX, tabletY);
  await browser.waitFor("document.getElementById('reader-inner')?.dataset.pageFlipState === 'read'", "tablet curl cleanup", 12000);
  assert.equal(await currentPage(), tabletPage, "tablet cancel changed page");
  await assertCanonicalFlipEvents(0, "tablet cancel");

  assert.equal(await browser.evaluate("document.querySelectorAll('[data-reader-center-curl]').length"), 0, "stale center curl root after all gestures");
  assertCleanDiagnostics(browser, "reader mobile center curl band");
  console.log(`PERF center curl rAF ${JSON.stringify(roundedMetrics(frameMetrics))}`);
  console.log(`PERF center curl first activation ${firstActivationMs.toFixed(1)}ms`);
  console.log(`SOAK center curl ${JSON.stringify({
    gestures:soakMetrics.gestures,
    operations:soakMetrics.operations,
    footprintBefore:soakMetrics.footprintBefore,
    footprintAfter:soakMetrics.footprintAfter,
    maxCleanup:soakMetrics.maxCleanup,
    heap:soakMetrics.heap,
  })}`);
  console.log("PASS center curl band: inner/edge routing, 8-15% band, finger lock, surfaces, lifecycle, rAF performance, no per-move DOM/PDF work, 50-curl cleanup soak");
} finally {
  await browser.close();
  await server.close();
}
