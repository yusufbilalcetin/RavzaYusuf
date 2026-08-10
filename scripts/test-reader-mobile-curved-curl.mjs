/**
 * MOBIL MERKEZ KIVRIMI - GERCEK EGRILIK METRIGI.
 *
 * Piksel karsilastirmasi yerine renderer'in gercek 12 satirli fold profilini
 * olcer. Tek bir dogru/diagonal, tek segment veya tek sivri kirik bu testi
 * gecemez. Ekran goruntuleri yalnizca insan tarafindan gorsel QA icindir.
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
const EXPECTED_SLICES = 12;
const MIN_PROFILE_SAMPLES = 9;
// Calibrate these dimensionless values if the accepted visual is retuned.
// A straight St.PageFlip fold measures ~0 after linear detrending. The target
// must retain at least 0.3% RMS and 0.6% peak nonlinear displacement while its
// entire predominantly-vertical silhouette remains inside 15% of page width.
// The center profile has a stronger 0.6% RMS / 0.9% peak requirement.
const MIN_CURVE_RMSE_RATIO = 0.003;
const MIN_CURVE_PEAK_RATIO = 0.006;
const MIN_CENTER_CURVE_RMSE_RATIO = 0.006;
const MIN_CENTER_CURVE_PEAK_RATIO = 0.009;
const MIN_ACTIVE_RESIDUAL_RATIO = 0.003;
const MAX_VERTICAL_RANGE_RATIO = 0.15;
const MAX_SECOND_DIFFERENCE_RATIO = 0.05;
const MAX_SYMMETRY_RMSE_RATIO = 0.025;

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-mobile-curved-curl");
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

const stageGeometry = () => browser.evaluate(`JSON.stringify((() => {
  const stage = document.getElementById('rdr-stage');
  if (!stage) return null;
  const r = stage.getBoundingClientRect();
  return { left:r.left, top:r.top, width:r.width, height:r.height };
})())`).then((raw) => JSON.parse(raw));

const curlSnapshot = () => browser.evaluate(`JSON.stringify((() => {
  const root = document.querySelector('[data-reader-center-curl]');
  if (!root) return { exists:false };
  const telemetryXs=String(root.dataset.curlFoldXs || '').split(',').map(Number).filter(Number.isFinite);
  const crease=root.querySelector('[data-curl-crease]');
  const clipXs=(crease?.style.clipPath.match(/-?[0-9.]+px/g) || []).map(Number.parseFloat);
  const half=Math.floor(clipXs.length/2);
  const creaseLeft=Number.parseFloat(crease?.style.left) || 0;
  const foldXs=Array.from({length:half},(_,index)=>(
    creaseLeft+(clipXs[index]+clipXs[clipXs.length-1-index])/2
  ));
  const slices=[...root.querySelectorAll('[data-curl-slice]')]
    .sort((left,right)=>Number(left.dataset.curlSlice)-Number(right.dataset.curlSlice));
  const seamIndex=Math.floor(slices.length/2);
  const surfaceEdges=element=>{
    const values=(element?.style.clipPath.match(/-?[0-9.]+px/g) || []).map(Number.parseFloat);
    const count=Math.floor(values.length/2);
    const left=Number.parseFloat(element?.style.left) || 0;
    return {
      lefts:Array.from({length:count},(_,index)=>left+values[index]),
      rights:Array.from({length:count},(_,index)=>left+values[values.length-1-index]),
    };
  };
  const nearSurface=surfaceEdges(slices[seamIndex-1]);
  const farSurface=surfaceEdges(slices[seamIndex]);
  const surfaceXs=nearSurface.rights.length===farSurface.lefts.length
    ? nearSurface.rights.map((value,index)=>(value+farSurface.lefts[index])/2)
    : [];
  const telemetryDelta=foldXs.length===telemetryXs.length
    ? Math.max(...foldXs.map((value,index)=>Math.abs(value-telemetryXs[index])))
    : Infinity;
  const surfaceDelta=surfaceXs.length===foldXs.length
    ? Math.max(...surfaceXs.map((value,index)=>Math.abs(value-foldXs[index])))
    : Infinity;
  const surfaceTelemetryDelta=surfaceXs.length===telemetryXs.length
    ? Math.max(...surfaceXs.map((value,index)=>Math.abs(value-telemetryXs[index])))
    : Infinity;
  return {
    exists:true,
    mode:root.dataset.curlMode || '',
    direction:root.dataset.curlDirection || '',
    progress:Number.parseFloat(root.dataset.curlProgress),
    bandWidth:Number.parseFloat(root.dataset.curlBandWidth),
    creaseX:Number.parseFloat(root.dataset.curlCreaseX),
    fingerX:Number.parseFloat(root.dataset.curlFingerX),
    foldXs,
    surfaceXs,
    telemetryDelta,
    surfaceDelta,
    surfaceTelemetryDelta,
    slices:slices.length,
    page:Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
  };
})())`).then((raw) => JSON.parse(raw));

function fitLine(xs) {
  const count = xs.length;
  const ys = xs.map((_, index) => count === 1 ? 0 : index / (count - 1));
  const meanY = ys.reduce((sum, value) => sum + value, 0) / count;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    numerator += (ys[index] - meanY) * (xs[index] - meanX);
    denominator += (ys[index] - meanY) ** 2;
  }
  const slope = denominator > 0 ? numerator / denominator : 0;
  const intercept = meanX - slope * meanY;
  const residuals = xs.map((value, index) => value - (slope * ys[index] + intercept));
  return { ys, slope, intercept, residuals };
}

function profileMetrics(xs, pageWidth) {
  const { ys, slope, intercept, residuals } = fitLine(xs);
  const rmse = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length);
  const maxResidual = Math.max(...residuals.map(Math.abs));
  const firstDifferences = xs.slice(1).map((value, index) => value - xs[index]);
  const secondDifferences = firstDifferences.slice(1).map((value, index) => value - firstDifferences[index]);
  const residualWeights = residuals.map(value => value ** 2);
  const weightTotal = residualWeights.reduce((sum, value) => sum + value, 0);
  const peakY = weightTotal > 0
    ? residualWeights.reduce((sum, value, index) => sum + value * ys[index], 0) / weightTotal
    : 0.5;
  return {
    slope,
    intercept,
    residuals,
    rmse,
    rmseRatio:rmse / pageWidth,
    maxResidual,
    maxResidualRatio:maxResidual / pageWidth,
    range:Math.max(...xs) - Math.min(...xs),
    rangeRatio:(Math.max(...xs) - Math.min(...xs)) / pageWidth,
    maxSecondDifference:secondDifferences.length ? Math.max(...secondDifferences.map(Math.abs)) : Infinity,
    maxSecondDifferenceRatio:secondDifferences.length
      ? Math.max(...secondDifferences.map(Math.abs)) / pageWidth
      : Infinity,
    activeResiduals:residuals.filter(value => Math.abs(value) >= pageWidth * MIN_ACTIVE_RESIDUAL_RATIO).length,
    peakY,
  };
}

function assertCurvedProfile(xs, pageWidth, label, options = {}) {
  assert.ok(xs.length >= MIN_PROFILE_SAMPLES, `${label}: at least ${MIN_PROFILE_SAMPLES} real silhouette samples required, got ${xs.length}`);
  assert.ok(xs.every(Number.isFinite), `${label}: silhouette contains a non-numeric sample`);
  const metrics = profileMetrics(xs, pageWidth);
  const minimumRmse = options.centerStrength ? MIN_CENTER_CURVE_RMSE_RATIO : MIN_CURVE_RMSE_RATIO;
  const minimumPeak = options.centerStrength ? MIN_CENTER_CURVE_PEAK_RATIO : MIN_CURVE_PEAK_RATIO;
  assert.ok(
    metrics.rmseRatio >= minimumRmse,
    `${label}: linear-fit RMSE ${(metrics.rmseRatio * 100).toFixed(3)}% is straight/flat`,
  );
  assert.ok(
    metrics.maxResidualRatio >= minimumPeak,
    `${label}: nonlinear peak ${(metrics.maxResidualRatio * 100).toFixed(3)}% is not visibly curved`,
  );
  assert.ok(
    metrics.activeResiduals >= 3,
    `${label}: curvature is carried by only ${metrics.activeResiduals} samples (single kink/outlier)`,
  );
  assert.ok(
    metrics.rangeRatio <= MAX_VERTICAL_RANGE_RATIO,
    `${label}: fold spans ${(metrics.rangeRatio * 100).toFixed(1)}% of page width instead of a vertical band`,
  );
  assert.ok(
    metrics.maxSecondDifferenceRatio <= MAX_SECOND_DIFFERENCE_RATIO,
    `${label}: adjacent segment derivative jumps ${(metrics.maxSecondDifferenceRatio * 100).toFixed(1)}%`,
  );
  return metrics;
}

function assertRenderedProfile(snapshot, pageWidth, label, options = {}) {
  assert.ok(
    snapshot.telemetryDelta <= 1,
    `${label}: exported profile differs from rendered clip by ${snapshot.telemetryDelta.toFixed(2)}px`,
  );
  assert.ok(
    snapshot.surfaceDelta <= 1,
    `${label}: actual slice seam differs from rendered crease by ${snapshot.surfaceDelta.toFixed(2)}px`,
  );
  assert.ok(
    snapshot.surfaceTelemetryDelta <= 1,
    `${label}: actual slice seam differs from material profile by ${snapshot.surfaceTelemetryDelta.toFixed(2)}px`,
  );
  return assertCurvedProfile(snapshot.surfaceXs, pageWidth, label, options);
}

function rmsDifference(left, right) {
  assert.equal(left.length, right.length, "profile length mismatch");
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0) / left.length);
}

function normalizeDirection(value) {
  if (["forward", "next"].includes(value)) return "forward";
  if (["back", "previous", "prev"].includes(value)) return "back";
  return value || "";
}

// Mutation sentinels run on every invocation. They prove the assertion itself
// rejects the two mandatory negative controls even before browser integration.
assert.throws(
  () => assertCurvedProfile(Array.from({ length:11 }, (_, index) => 80 + index * 3), VIEWPORT.width, "straight mutation"),
  /straight\/flat/,
  "straight-fold mutation control unexpectedly passed",
);
assert.throws(
  () => assertCurvedProfile([120], VIEWPORT.width, "one-segment mutation"),
  new RegExp(`at least ${MIN_PROFILE_SAMPLES}`),
  "one-segment mutation control unexpectedly passed",
);

async function startDrag({ yRatio = 0.5, direction = "forward", progress = 0.1 }) {
  const stage = await stageGeometry();
  assert.ok(stage?.width > 100 && stage?.height > 100, "reader stage geometry missing");
  const startX = stage.left + stage.width / 2;
  const y = stage.top + stage.height * yRatio;
  const sign = direction === "forward" ? -1 : 1;
  const effectiveTravel = direction === "forward"
    ? startX - stage.left
    : stage.left + stage.width - startX;
  const session = { stage, startX, y, sign, direction, effectiveTravel, currentX:startX, progress:0 };
  await touch("touchStart", startX, y);
  await moveDrag(session, progress, 8);
  await browser.waitFor(
    "document.querySelector('[data-reader-center-curl][data-curl-mode=\"band\"]')",
    `${direction} center curl`,
    8000,
  );
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
  await moveDrag(session, 0.04, 5);
  await delay(150);
  await touch("touchEnd", session.currentX, session.y);
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", `${label} cleanup`, 12000);
  await delay(120);
  assert.equal(await currentPage(), expectedPage, `${label}: cancel changed page`);
}

const frameWatcher = durationMs => browser.evaluate(`new Promise(resolve => {
  const started = performance.now();
  const samples = [];
  const frame = now => {
    const root = document.querySelector('[data-reader-center-curl]');
    samples.push({
      at:now - started,
      active:Boolean(root),
      mode:root?.dataset.curlMode || '',
      progress:Number.parseFloat(root?.dataset.curlProgress),
      xs:root ? String(root.dataset.curlFoldXs || '').split(',').map(Number).filter(Number.isFinite) : [],
      page:Number(document.getElementById('reader-inner')?.dataset.currentPage || 0),
    });
    if (now - started < ${durationMs}) requestAnimationFrame(frame);
    else resolve(samples);
  };
  requestAnimationFrame(frame);
})`);

function assertContinuousFrames(samples, label) {
  const active = samples.filter(sample => sample.active);
  assert.ok(active.length >= 2, `${label}: curved renderer was not observable after release`);
  assert.ok(active.every(sample => sample.mode === "band"), `${label}: renderer mode changed during handoff`);
  assert.ok(
    active.every(sample => sample.xs.length >= MIN_PROFILE_SAMPLES),
    `${label}: silhouette sample count changed during handoff`,
  );
  const steps = [];
  for (let index = 1; index < active.length; index += 1) {
    steps.push(rmsDifference(active[index - 1].xs, active[index].xs) / VIEWPORT.width);
  }
  if (steps.length) {
    const sorted = [...steps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const maximum = Math.max(...steps);
    assert.ok(
      maximum <= Math.max(0.09, median * 4 + 0.01),
      `${label}: one-frame silhouette jump ${(maximum * 100).toFixed(1)}% (median ${(median * 100).toFixed(1)}%)`,
    );
  }
  return active;
}

async function assertFrontClean(label) {
  const failures = JSON.parse(await browser.evaluate(`JSON.stringify((() => {
    const bad = [];
    for (const page of document.querySelectorAll('.pdf-page')) {
      const rect = page.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2 || page.closest('[data-reader-center-curl]')) continue;
      const canvas = [...page.querySelectorAll('canvas')].find(node => !node.closest('.pdf-backside-print'));
      if (!canvas) continue;
      const transform = getComputedStyle(canvas).transform;
      const matrix = !transform || transform === 'none'
        ? new DOMMatrix()
        : new DOMMatrix(transform);
      const opacity = Number(getComputedStyle(canvas).opacity);
      if (!(matrix.a > 0) || opacity !== 1) bad.push({ page:page.dataset.pdfPage, scaleX:matrix.a, opacity });
    }
    return bad;
  })())`));
  assert.deepEqual(failures, [], `${label}: stable front canvas mirrored/faded: ${JSON.stringify(failures)}`);
}

try {
  await openReader(12);
  const metricsReport = {
    thresholds: {
      minCurveRmseRatio:MIN_CURVE_RMSE_RATIO,
      minCurvePeakRatio:MIN_CURVE_PEAK_RATIO,
      minCenterCurveRmseRatio:MIN_CENTER_CURVE_RMSE_RATIO,
      minCenterCurvePeakRatio:MIN_CENTER_CURVE_PEAK_RATIO,
      maxVerticalRangeRatio:MAX_VERTICAL_RANGE_RATIO,
      maxSecondDifferenceRatio:MAX_SECOND_DIFFERENCE_RATIO,
    },
    profiles:[],
  };

  /* 1. Medium curl is nonlinear and its shape evolves with progress. */
  const shapePage = await currentPage();
  const shapeSession = await startDrag({ yRatio:0.5, direction:"forward", progress:0.25 });
  const progressProfiles = [];
  for (const progress of [0.25, 0.50, 0.75]) {
    if (progress !== 0.25) await moveDrag(shapeSession, progress);
    const snapshot = await curlSnapshot();
    assert.equal(snapshot.slices, EXPECTED_SLICES, `${progress}: renderer does not expose 12 real slices`);
    assert.equal(normalizeDirection(snapshot.direction), "forward", `${progress}: wrong direction ${snapshot.direction}`);
    assert.equal(snapshot.page, shapePage, `${progress}: canonical page changed while dragging`);
    const metrics = assertRenderedProfile(
      snapshot,
      shapeSession.stage.width,
      `center NEXT ${Math.round(progress * 100)}%`,
      { centerStrength:progress === 0.5 },
    );
    progressProfiles.push({ progress, snapshot, metrics });
    metricsReport.profiles.push({ name:`center-next-${Math.round(progress * 100)}`, ...metrics, foldXs:snapshot.surfaceXs });
  }
  const shapeSignatures = new Set(progressProfiles.map(({ metrics }) => (
    metrics.residuals.map(value => (value / VIEWPORT.width).toFixed(3)).join(",")
  )));
  assert.ok(shapeSignatures.size >= 2, "25/50/75% use an invariant fold silhouette");
  await cancelDrag(shapeSession, shapePage, "progress profile");

  /* 2. Pointer Y moves the nonlinear bend peak upward/center/downward. */
  const yProfiles = [];
  for (const yRatio of [0.2, 0.5, 0.8]) {
    const pageBefore = await currentPage();
    const session = await startDrag({ yRatio, direction:"forward", progress:0.5 });
    const snapshot = await curlSnapshot();
    const metrics = assertRenderedProfile(
      snapshot,
      session.stage.width,
      `pointer y=${Math.round(yRatio * 100)}%`,
      { centerStrength:yRatio === 0.5 },
    );
    yProfiles.push({ yRatio, snapshot, metrics });
    metricsReport.profiles.push({ name:`y-${Math.round(yRatio * 100)}`, ...metrics, foldXs:snapshot.surfaceXs });
    if (yRatio !== 0.5) {
      const shot = await browser.command("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
      await writeFile(join(artifactDir, `curved-y-${Math.round(yRatio * 100)}-50pct.png`), Buffer.from(shot.data, "base64"));
    }
    await cancelDrag(session, pageBefore, `pointer y=${yRatio}`);
  }
  const [top, middle, bottom] = yProfiles.map(entry => entry.metrics.peakY);
  assert.ok(Math.abs(top - 0.2) <= 0.23, `top bend peak stayed at ${(top * 100).toFixed(1)}%`);
  assert.ok(Math.abs(middle - 0.5) <= 0.23, `center bend peak stayed at ${(middle * 100).toFixed(1)}%`);
  assert.ok(Math.abs(bottom - 0.8) <= 0.23, `bottom bend peak stayed at ${(bottom * 100).toFixed(1)}%`);
  assert.ok(top + 0.08 < middle && middle + 0.08 < bottom, `bend peak did not migrate: ${top.toFixed(3)} -> ${middle.toFixed(3)} -> ${bottom.toFixed(3)}`);

  /* 3. Mirrored NEXT/PREVIOUS trajectories produce mirrored profiles. */
  const symmetryPage = await currentPage();
  const nextSession = await startDrag({ yRatio:0.5, direction:"forward", progress:0.5 });
  const nextSnapshot = await curlSnapshot();
  const nextMetrics = assertRenderedProfile(nextSnapshot, nextSession.stage.width, "NEXT symmetry profile", { centerStrength:true });
  await cancelDrag(nextSession, symmetryPage, "NEXT symmetry");

  const previousSession = await startDrag({ yRatio:0.5, direction:"back", progress:0.5 });
  const previousSnapshot = await curlSnapshot();
  const previousMetrics = assertRenderedProfile(previousSnapshot, previousSession.stage.width, "PREVIOUS symmetry profile", { centerStrength:true });
  const mirroredPrevious = previousMetrics.residuals.map(value => -value);
  const symmetryRmse = rmsDifference(nextMetrics.residuals, mirroredPrevious);
  assert.ok(
    symmetryRmse / previousSession.stage.width <= MAX_SYMMETRY_RMSE_RATIO,
    `NEXT/PREV curvature differs by ${((symmetryRmse / previousSession.stage.width) * 100).toFixed(2)}%`,
  );
  assert.ok(
    Math.abs(nextMetrics.rmseRatio - previousMetrics.rmseRatio) <= 0.01,
    `NEXT/PREV curve strength differs (${nextMetrics.rmseRatio.toFixed(4)} / ${previousMetrics.rmseRatio.toFixed(4)})`,
  );
  metricsReport.symmetryRmseRatio = symmetryRmse / previousSession.stage.width;
  await cancelDrag(previousSession, symmetryPage, "PREVIOUS symmetry");

  /* 4. Release continues with the same curved renderer until canonical commit. */
  const commitStart = await currentPage();
  const commitSession = await startDrag({ yRatio:0.5, direction:"forward", progress:0.62 });
  await delay(120);
  const commitWatch = frameWatcher(1200);
  await touch("touchEnd", commitSession.currentX, commitSession.y);
  const commitFrames = await commitWatch;
  const activeCommit = assertContinuousFrames(commitFrames, "completion handoff");
  const committedFrame = commitFrames.findIndex(sample => sample.page === commitStart + 1);
  assert.ok(committedFrame >= 0, "completion handoff never committed the next page");
  assert.ok(
    commitFrames.slice(0, committedFrame).every(sample => sample.active),
    "curved layer disappeared before canonical page commit",
  );
  assert.ok(
    activeCommit.at(-1).progress >= activeCommit[0].progress - 0.02,
    "completion animation first unwound/snapped back before advancing",
  );
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", "completion cleanup", 10000);
  await assertFrontClean("completion cleanup");

  /* 5. Cancel unwinds through the same 12-sample renderer and leaves no page change. */
  const cancelStart = await currentPage();
  const cancelSession = await startDrag({ yRatio:0.5, direction:"back", progress:0.5 });
  await moveDrag(cancelSession, 0.12, 5);
  await delay(150);
  const cancelWatch = frameWatcher(1000);
  await touch("touchEnd", cancelSession.currentX, cancelSession.y);
  const cancelFrames = await cancelWatch;
  const activeCancel = assertContinuousFrames(cancelFrames, "cancel handoff");
  assert.ok(
    activeCancel.at(-1).progress <= activeCancel[0].progress + 0.02,
    "cancel animation advanced instead of unwinding",
  );
  assert.ok(cancelFrames.every(sample => sample.page === cancelStart), "cancel handoff changed canonical page");
  await browser.waitFor("!document.querySelector('[data-reader-center-curl]')", "cancel cleanup", 10000);
  await assertFrontClean("cancel cleanup");

  metricsReport.peakMigration = { top, middle, bottom };
  metricsReport.releaseFrames = {
    completion:commitFrames.length,
    cancellation:cancelFrames.length,
  };
  await writeFile(join(artifactDir, "curved-curl-metrics.json"), `${JSON.stringify(metricsReport, null, 2)}\n`);

  assert.equal(await browser.evaluate("document.querySelectorAll('[data-reader-center-curl]').length"), 0, "stale curved-curl layer");
  assertCleanDiagnostics(browser, "reader mobile curved curl");
  console.table(metricsReport.profiles.map(profile => ({
    profile:profile.name,
    rmsePct:(profile.rmseRatio * 100).toFixed(2),
    peakPct:(profile.maxResidualRatio * 100).toFixed(2),
    rangePct:(profile.rangeRatio * 100).toFixed(2),
    peakY:`${(profile.peakY * 100).toFixed(1)}%`,
  })));
  console.log("PASS curved curl: nonlinear RMSE, smooth 12-sample silhouette, Y peak migration, symmetry, continuous release/cancel");
} finally {
  await browser.close();
  await server.close();
}
