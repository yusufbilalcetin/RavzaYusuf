const OUTLINE_RGB = [70, 70, 78];
const OUTLINE_CSS = `rgb(${OUTLINE_RGB[0]},${OUTLINE_RGB[1]},${OUTLINE_RGB[2]})`;
const MIN_SCALE = 0.5;
const TINT_MIX = 0.14;
const HIGHLIGHT_MIX = 0.34;

// Zoom üst sınırı gride göre dinamiktir: her presette hücre ekranda
// ~56px'e ulaşabilsin diye hücre boyutundan türetilir.
const MAX_CELL_SCREEN_PX = 56;

// Zoom'da pan payı: görsel viewport kenarına kilitlenmesin, kenar/köşe
// bölgeleri boyarken viewport'un ~%8'i kadar boş çalışma alanı kalsın.
const PAN_MARGIN_RATIO = 0.08;

// Overlay LOD eşikleri (ekrandaki hücre boyutu, px)
const LOD_BOUNDARY_PX = 5;   // bölge sınırları bu boyuttan itibaren çizilir
const LOD_NUMBER_PX = 12;    // numaralar bu boyuttan itibaren çizilir
const LOD_NUMBER_BUDGET = 3500; // görünür boyanmamış hücre bütçesi
const LOD_NUMBER_PX_BUSY = 16;  // bütçe aşılırsa numara eşiği
const GESTURE_NUMBER_BUDGET = 2000; // jest sırasında numara çizim bütçesi
const HINT_DURATION_MS = 2400; // ipucu parlamasının ekranda kalma süresi

function mixWithWhite(p, mix) {
  return [
    Math.round(255 - (255 - p.r) * mix),
    Math.round(255 - (255 - p.g) * mix),
    Math.round(255 - (255 - p.b) * mix)
  ];
}

export function createPbnEngine({ canvas, viewport, stage }) {
  const ctx = canvas.getContext("2d");

  let width = 0, height = 0;
  let regionMap = null;
  let outline = null;
  let regions = [];
  let regionById = new Map();
  let regionsByNumber = new Map();
  let palette = [];
  let paletteByNumber = new Map();
  let totalPixels = 0;
  let cellSize = 0;
  let gridCols = 0;
  let gridRows = 0;
  let maxRegionId = 0;
  let regionNumberLut = null;

  const paintedSet = new Set();
  let paintOrder = []; // fırça darbesi (stroke) dizileri: her eleman bir id dizisi
  let redoStack = [];
  let selectedNumber = null;
  let numberTotals = new Map();
  let numberPainted = new Map();

  let scale = 1, offsetX = 0, offsetY = 0, fitScale = 1;
  let onChange = () => {};

  let hintIds = new Set();
  let hintRafId = null;
  let hintExpireAt = 0;

  /* ---------- overlay canvas (grid + numaralar, ekran uzayında) ---------- */

  const overlay = document.createElement("canvas");
  overlay.className = "pbn-overlay-canvas";
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  viewport.appendChild(overlay);
  const octx = overlay.getContext("2d");

  let overlayRafId = null;
  let gestureActive = false;
  let gestureSettleTimer = null;

  function scheduleOverlayDraw() {
    if (overlayRafId != null) return;
    overlayRafId = requestAnimationFrame(() => {
      overlayRafId = null;
      drawOverlay();
    });
  }

  function drawOverlay() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(vw * dpr);
    const bh = Math.round(vh * dpr);
    if (overlay.width !== bw || overlay.height !== bh) {
      overlay.width = bw;
      overlay.height = bh;
    }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, vw, vh);
    if (!width || !height) return;

    const imgLeft = offsetX;
    const imgTop = offsetY;
    const imgRight = offsetX + width * scale;
    const imgBottom = offsetY + height * scale;

    drawHintOverlay(vw, vh, imgLeft, imgTop, imgRight, imgBottom);

    if (!cellSize || !gridCols || !gridRows) {
      // Eski kayıt (cellSize yok): grid kompozite gömülü kalır, overlay yalnız numaraları çizer.
      drawOverlayNumbersLegacy(vw, vh);
      return;
    }

    const cellScreen = cellSize * scale;
    if (cellScreen < LOD_BOUNDARY_PX) return; // fit görünümü: temiz mozaik

    const col0 = Math.max(0, Math.floor((0 - offsetX) / cellScreen));
    const row0 = Math.max(0, Math.floor((0 - offsetY) / cellScreen));
    const col1 = Math.min(gridCols - 1, Math.floor((vw - offsetX) / cellScreen));
    const row1 = Math.min(gridRows - 1, Math.floor((vh - offsetY) / cellScreen));
    if (col1 < col0 || row1 < row0) return;

    const fullGrid = cellScreen >= LOD_NUMBER_PX;

    // Çizgiler: boyanmış alanlar temiz görünsün diye çizgi yalnız en az bir
    // tarafı boyanmamış kenarlara çizilir. Numara farkı = bölge sınırı (koyu),
    // aynı numara = ince grid çizgisi (yalnız fullGrid modunda).
    const hairPath = new Path2D();
    const boundPath = new Path2D();
    let visibleUnpainted = 0;

    for (let row = row0; row <= row1; row++) {
      const yTop = offsetY + row * cellScreen;
      const yBottom = Math.min(yTop + cellScreen, imgBottom);
      for (let col = col0; col <= col1; col++) {
        const id = row * gridCols + col;
        const n0 = regionNumberLut[id];
        const p0 = paintedSet.has(id);
        if (!p0) visibleUnpainted++;

        const xLeft = offsetX + col * cellScreen;
        const xRight = Math.min(xLeft + cellScreen, imgRight);

        if (col + 1 < gridCols) {
          const id2 = id + 1;
          const p1 = paintedSet.has(id2);
          if (!p0 || !p1) {
            if (n0 !== regionNumberLut[id2]) {
              boundPath.moveTo(xRight, yTop);
              boundPath.lineTo(xRight, yBottom);
            } else if (fullGrid) {
              hairPath.moveTo(xRight, yTop);
              hairPath.lineTo(xRight, yBottom);
            }
          }
        }
        if (row + 1 < gridRows) {
          const id2 = id + gridCols;
          const p1 = paintedSet.has(id2);
          if (!p0 || !p1) {
            if (n0 !== regionNumberLut[id2]) {
              boundPath.moveTo(xLeft, yBottom);
              boundPath.lineTo(xRight, yBottom);
            } else if (fullGrid) {
              hairPath.moveTo(xLeft, yBottom);
              hairPath.lineTo(xRight, yBottom);
            }
          }
        }
      }
    }

    octx.lineWidth = 1;
    if (fullGrid) {
      octx.strokeStyle = "rgba(70,70,78,0.16)";
      octx.stroke(hairPath);
      octx.strokeStyle = "rgba(70,70,78,0.45)";
    } else {
      octx.strokeStyle = "rgba(70,70,78,0.35)";
    }
    octx.stroke(boundPath);

    /* numaralar */
    const numberThreshold = visibleUnpainted > LOD_NUMBER_BUDGET ? LOD_NUMBER_PX_BUSY : LOD_NUMBER_PX;
    if (cellScreen < numberThreshold) return;
    if (gestureActive && visibleUnpainted > GESTURE_NUMBER_BUDGET) return;

    const fontSize = Math.max(9, Math.min(Math.round(cellScreen * 0.42), 15));
    octx.font = `600 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillStyle = "rgba(70,70,78,0.85)";

    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const id = row * gridCols + col;
        if (paintedSet.has(id)) continue;
        const n = regionNumberLut[id];
        if (n < 0) continue;
        const cx = offsetX + (col + 0.5) * cellScreen;
        const cy = offsetY + (row + 0.5) * cellScreen;
        if (cx > imgRight || cy > imgBottom) continue;
        octx.fillText(String(n), cx, cy);
      }
    }
  }

  function drawOverlayNumbersLegacy(vw, vh) {
    const fontSize = Math.max(9, Math.min(Math.round(24 * scale * 0.42), 15));
    octx.font = `600 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillStyle = "rgba(70,70,78,0.85)";
    for (const region of regions) {
      if (paintedSet.has(region.id)) continue;
      const cx = offsetX + region.labelX * scale;
      const cy = offsetY + region.labelY * scale;
      if (cx < -20 || cy < -20 || cx > vw + 20 || cy > vh + 20) continue;
      octx.fillText(String(region.paletteNumber), cx, cy);
    }
  }

  /* ---------- yeniden sığdırma ---------- */

  let resizeSettleTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(() => fitToView(), 80);
  });
  resizeObserver.observe(viewport);

  // ResizeObserver bazı ortamlarda tetiklenmiyor; düzen oturana kadar
  // kademeli yeniden sığdırma ile garantiye alınır. Mobilde svh/dvh
  // adres çubuğu animasyonuyla geç oturabildiği için viewport boyutu
  // > 0 olana kadar rAF ile poll edilir (sabit checkpoint'ler yetmeyebilir).
  let settleTimers = [];
  let settlePollId = null;
  function pollUntilSized(deadline) {
    if (settlePollId !== null) return;
    const step = () => {
      settlePollId = null;
      const sized = fitToView();
      if (!sized && performance.now() < deadline) {
        settlePollId = requestAnimationFrame(step);
      }
    };
    settlePollId = requestAnimationFrame(step);
  }
  function settleFit() {
    settleTimers.forEach(clearTimeout);
    settleTimers = [];
    if (settlePollId !== null) {
      cancelAnimationFrame(settlePollId);
      settlePollId = null;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => fitToView()));
    settleTimers.push(setTimeout(fitToView, 220));
    settleTimers.push(setTimeout(fitToView, 800));
    // Ekstra güvence: 2sn boyunca viewport boyut alana dek denemeye devam et.
    pollUntilSized(performance.now() + 2000);
  }

  function setOnChange(handler) {
    onChange = handler;
  }

  function setData(payload) {
    ({ width, height, regionMap, outline, regions, palette } = payload);
    cellSize = payload.cellSize || 0;
    gridCols = cellSize ? Math.ceil(width / cellSize) : 0;
    gridRows = cellSize ? Math.ceil(height / cellSize) : 0;
    regionById = new Map(regions.map((r) => [r.id, r]));
    paletteByNumber = new Map(palette.map((p) => [p.number, p]));
    maxRegionId = regions.reduce((max, r) => Math.max(max, r.id), 0);
    regionNumberLut = new Int32Array(maxRegionId + 1).fill(-1);
    for (const r of regions) regionNumberLut[r.id] = r.paletteNumber;

    regionsByNumber = new Map();
    for (const r of regions) {
      let list = regionsByNumber.get(r.paletteNumber);
      if (!list) { list = []; regionsByNumber.set(r.paletteNumber, list); }
      list.push(r);
    }

    numberTotals = new Map();
    numberPainted = new Map();
    for (const p of palette) { numberTotals.set(p.number, 0); numberPainted.set(p.number, 0); }
    for (const r of regions) numberTotals.set(r.paletteNumber, (numberTotals.get(r.paletteNumber) || 0) + 1);

    totalPixels = width * height;
    canvas.width = width;
    canvas.height = height;
    // Overlay hizası, tuvalin 1:1 piksel boyutunda görüntülenmesine dayanır.
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    paintedSet.clear();
    paintOrder = [];
    redoStack = [];
    selectedNumber = palette[0]?.number ?? null;
    clearColorHint();
    // Yeni veri = temiz giriş durumu: önceki ekrandan takılı jest kalmasın.
    resetPointerState();
    fitToView();
    settleFit();
    render();
  }

  function setPaintedRegions(ids) {
    paintedSet.clear();
    for (const number of numberPainted.keys()) numberPainted.set(number, 0);
    for (const id of ids) {
      if (!regionById.has(id)) continue;
      paintedSet.add(id);
      const number = regionNumberLut[id];
      numberPainted.set(number, (numberPainted.get(number) || 0) + 1);
    }
    // Devam edilen projede fırça geçmişi boş başlar.
    paintOrder = [];
    redoStack = [];
    render();
  }

  /* ---------- view / transform ---------- */

  function snapScale(value, roundFn = Math.round) {
    if (!cellSize) return value;
    const rawCellPx = value * cellSize;
    if (rawCellPx < 3) return value;
    const cellPx = Math.max(3, roundFn(rawCellPx));
    return cellPx / cellSize;
  }

  function maxZoom() {
    if (!cellSize) return 5;
    return Math.min(8, Math.max(2, MAX_CELL_SCREEN_PX / cellSize));
  }

  function fitToView() {
    if (!width || !height || !viewport) return true;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return false;
    fitScale = Math.min(vw / width, vh / height) * 0.95;
    scale = Math.min(fitScale, maxZoom());
    offsetX = (vw - width * scale) / 2;
    offsetY = (vh - height * scale) / 2;
    applyTransform();
    return true;
  }

  function constrainOffsets() {
    if (!width || !height || !viewport) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const displayW = width * scale;
    const displayH = height * scale;

    const marginX = vw * PAN_MARGIN_RATIO;
    const marginY = vh * PAN_MARGIN_RATIO;

    if (displayW <= vw) {
      offsetX = (vw - displayW) / 2;
    } else {
      offsetX = Math.min(marginX, Math.max(vw - displayW - marginX, offsetX));
    }

    if (displayH <= vh) {
      offsetY = (vh - displayH) / 2;
    } else {
      offsetY = Math.min(marginY, Math.max(vh - displayH - marginY, offsetY));
    }
  }

  function minZoom() {
    return Math.min(MIN_SCALE, fitScale);
  }

  function applyTransform() {
    constrainOffsets();
    if (stage) stage.style.transform = `translate(${Math.round(offsetX)}px, ${Math.round(offsetY)}px) scale(${scale})`;
    canvas.classList.toggle("pbn-canvas--crisp", scale >= 1);
    scheduleOverlayDraw();
  }

  function zoomBy(factor, centerX, centerY) {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const cx = centerX ?? vw / 2;
    const cy = centerY ?? vh / 2;
    const prevScale = scale;
    scale = snapScale(Math.min(Math.max(scale * factor, minZoom()), maxZoom()));
    const ratio = scale / prevScale;
    offsetX = cx - (cx - offsetX) * ratio;
    offsetY = cy - (cy - offsetY) * ratio;
    applyTransform();
  }

  function zoomAtClientPoint(clientX, clientY, factor) {
    const rect = viewport.getBoundingClientRect();
    const cx = Math.max(0, Math.min(clientX - rect.left, rect.width || viewport.clientWidth));
    const cy = Math.max(0, Math.min(clientY - rect.top, rect.height || viewport.clientHeight));
    zoomBy(factor, cx, cy);
  }

  function normalizeWheelDelta(event) {
    const modeScale = event.deltaMode === 1
      ? 32
      : event.deltaMode === 2
        ? Math.max(1, viewport.clientHeight)
        : 1;
    return Math.max(-240, Math.min(240, event.deltaY * modeScale));
  }

  function handleWheelZoom(event) {
    if (!width || !height) return;
    if (event.target?.closest?.(".pbn-zoom-pill")) return;

    event.preventDefault();
    event.stopPropagation();

    const delta = normalizeWheelDelta(event);
    if (!delta) return;

    const factor = Math.exp(-delta * 0.002);
    setGestureActive(true);
    zoomAtClientPoint(event.clientX, event.clientY, factor);
    setGestureActive(false);
  }

  /* ---------- selection ---------- */

  function repaintNumberCells(number) {
    if (number == null) return;
    const list = regionsByNumber.get(number);
    if (!list) return;
    for (const region of list) {
      if (!paintedSet.has(region.id)) paintCellVisual(region, false);
    }
  }

  function selectNumber(number) {
    if (number === selectedNumber) return;
    const previous = selectedNumber;
    selectedNumber = number;
    if (cellSize) {
      // Yalnız eski ve yeni numaranın hücreleri yeniden boyanır (tam render yerine).
      repaintNumberCells(previous);
      repaintNumberCells(number);
    } else {
      render();
    }
  }

  function getSelectedNumber() {
    return selectedNumber;
  }

  /* ---------- hit testing / painting ---------- */

  function screenToImagePoint(clientX, clientY) {
    // Tuvalin kendi görsel dikdörtgeni üzerinden orantısal eşleme:
    // kenarlık, ofset yuvarlama, tarayıcı zoom'u ve üst katman
    // dönüşümlerinden bağımsız olarak her zaman doğru hücreyi bulur.
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { imgX: -1, imgY: -1 };
    const imgX = Math.floor(((clientX - rect.left) / rect.width) * width);
    const imgY = Math.floor(((clientY - rect.top) / rect.height) * height);
    return { imgX, imgY };
  }

  function regionAtImagePoint(imgX, imgY) {
    if (imgX < 0 || imgY < 0 || imgX >= width || imgY >= height) return null;
    const id = regionMap[imgY * width + imgX];
    return regionById.get(id) || null;
  }

  function markPainted(id) {
    paintedSet.add(id);
    const number = regionNumberLut[id];
    numberPainted.set(number, (numberPainted.get(number) || 0) + 1);
  }

  function markUnpainted(id) {
    paintedSet.delete(id);
    const number = regionNumberLut[id];
    numberPainted.set(number, Math.max(0, (numberPainted.get(number) || 0) - 1));
  }

  // Boyama olayları rAF başına tek sefer yayınlanır: hızlı sürüklemede
  // ilerleme/palet/persist hücre başına değil kare başına güncellenir.
  let pendingPaintCount = 0;
  let paintEmitRafId = null;

  function emitPaintBatched() {
    pendingPaintCount++;
    if (paintEmitRafId != null) return;
    paintEmitRafId = requestAnimationFrame(flushPaintEvents);
  }

  function flushPaintEvents() {
    paintEmitRafId = null;
    if (!pendingPaintCount) return;
    const count = pendingPaintCount;
    pendingPaintCount = 0;
    onChange({ type: "paint", count });
  }

  function paintRegionIntoStroke(region, stroke) {
    markPainted(region.id);
    stroke.push(region.id);
    paintCellVisual(region, true);
    emitPaintBatched();
  }

  function tryPaintAt(clientX, clientY) {
    const { imgX, imgY } = screenToImagePoint(clientX, clientY);
    const region = regionAtImagePoint(imgX, imgY);
    if (!region || paintedSet.has(region.id)) return false;
    if (region.paletteNumber !== selectedNumber) return false;
    const stroke = [];
    paintRegionIntoStroke(region, stroke);
    paintOrder.push(stroke);
    redoStack = [];
    scheduleOverlayDraw();
    return true;
  }

  function undo() {
    if (!paintOrder.length) return;
    const stroke = paintOrder.pop();
    for (const id of stroke) {
      markUnpainted(id);
      paintCellVisual(regionById.get(id), false);
    }
    redoStack.push(stroke);
    scheduleOverlayDraw();
    onChange({ type: "undo" });
  }

  function redo() {
    if (!redoStack.length) return;
    const stroke = redoStack.pop();
    for (const id of stroke) {
      markPainted(id);
      paintCellVisual(regionById.get(id), true);
    }
    paintOrder.push(stroke);
    scheduleOverlayDraw();
    onChange({ type: "redo" });
  }

  function resetPainting() {
    paintedSet.clear();
    for (const number of numberPainted.keys()) numberPainted.set(number, 0);
    paintOrder = [];
    redoStack = [];
    clearColorHint();
    render();
    onChange({ type: "reset" });
  }

  function getNumberStats() {
    return palette.map((p) => {
      const total = numberTotals.get(p.number) || 0;
      const painted = numberPainted.get(p.number) || 0;
      return { number: p.number, r: p.r, g: p.g, b: p.b, total, painted, complete: total > 0 && painted >= total };
    });
  }

  function getProgress() {
    if (!regions.length) return 0;
    return Math.min(100, Math.round((paintedSet.size / regions.length) * 100));
  }

  function isComplete() {
    return regions.length > 0 && paintedSet.size >= regions.length;
  }

  function getPaintedRegionIds() {
    return Array.from(paintedSet);
  }

  /* ---------- rendering (temel tuval: yalnız renkler) ---------- */

  function paintCellVisual(region, painted) {
    if (!region) return;
    if (!cellSize) { render(); return; }

    const cs = cellSize;
    const x0 = Math.floor(region.labelX / cs) * cs;
    const y0 = Math.floor(region.labelY / cs) * cs;
    const p = paletteByNumber.get(region.paletteNumber);

    if (painted && p) {
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
    } else {
      const mix = region.paletteNumber === selectedNumber ? HIGHLIGHT_MIX : TINT_MIX;
      const c = p ? mixWithWhite(p, mix) : [255, 255, 255];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    ctx.fillRect(x0, y0, Math.min(cs, width - x0), Math.min(cs, height - y0));
  }

  function buildComposite({ tint = true, highlight = true, lines = true } = {}) {
    const imageData = ctx.createImageData(width, height);
    const buf = imageData.data;

    const lutPaint = new Int32Array(maxRegionId + 1).fill(-1);
    for (const id of paintedSet) {
      const p = paletteByNumber.get(regionNumberLut[id]);
      if (p) lutPaint[id] = (p.r << 16) | (p.g << 8) | p.b;
    }

    const lutBase = new Int32Array(maxRegionId + 1).fill(0xffffff);
    if (tint) {
      for (const r of regions) {
        const p = paletteByNumber.get(r.paletteNumber);
        if (!p) continue;
        const mix = highlight && r.paletteNumber === selectedNumber ? HIGHLIGHT_MIX : TINT_MIX;
        const c = mixWithWhite(p, mix);
        lutBase[r.id] = (c[0] << 16) | (c[1] << 8) | c[2];
      }
    }

    // Grid overlay katmanında çizilir; yalnız eski kayıtlarda (cellSize yok)
    // outline kompozite gömülür. Dışa aktarmada (lines: false) hiç gömülmez;
    // final görselde çizgi veya numara bulunmaz.
    const bakeOutline = lines && !cellSize && outline;

    for (let i = 0; i < totalPixels; i++) {
      const px = i * 4;
      if (bakeOutline && outline[i]) {
        buf[px] = OUTLINE_RGB[0]; buf[px + 1] = OUTLINE_RGB[1]; buf[px + 2] = OUTLINE_RGB[2]; buf[px + 3] = 255;
        continue;
      }
      const id = regionMap[i];
      let packed = lutPaint[id];
      if (packed < 0) packed = lutBase[id];
      buf[px] = (packed >> 16) & 0xff;
      buf[px + 1] = (packed >> 8) & 0xff;
      buf[px + 2] = packed & 0xff;
      buf[px + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function render() {
    if (!width || !height) return;
    buildComposite({ tint: true, highlight: true });
    scheduleOverlayDraw();
  }

  // PNG kayıpsızdır; quality parametresi yalnız jpeg/webp için geçerlidir,
  // bu yüzden dışa aktarımda hiç verilmez — eser her zaman tam kalitede iner.
  function exportPaintedDataUrl(mime = "image/png") {
    buildComposite({ tint: false, highlight: false, lines: false });
    const url = canvas.toDataURL(mime);
    render();
    return url;
  }

  function exportPaintedBlob(mime = "image/png") {
    buildComposite({ tint: false, highlight: false, lines: false });
    return new Promise((resolve) => {
      // toBlob çağrı anındaki bitmap'i yakalar; render hemen geri alınabilir.
      canvas.toBlob((blob) => resolve(blob), mime);
      render();
    });
  }

  function exportTemplateDataUrl(mime = "image/png") {
    // Numaralı boş şablon tek seferlik geçici tuvale çizilir.
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tctx = tmp.getContext("2d");
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, width, height);

    tctx.strokeStyle = OUTLINE_CSS;
    tctx.lineWidth = 1;
    if (cellSize) {
      tctx.beginPath();
      for (let x = 0; x <= width; x += cellSize) {
        const lx = Math.min(x, width - 1) + 0.5;
        tctx.moveTo(lx, 0); tctx.lineTo(lx, height);
      }
      for (let y = 0; y <= height; y += cellSize) {
        const ly = Math.min(y, height - 1) + 0.5;
        tctx.moveTo(0, ly); tctx.lineTo(width, ly);
      }
      tctx.stroke();
    } else if (outline) {
      for (let i = 0; i < totalPixels; i++) {
        if (outline[i]) tctx.fillRect(i % width, Math.floor(i / width), 1, 1);
      }
    }

    const fontSize = Math.max(9, Math.round((cellSize || 24) * 0.6));
    tctx.font = `600 ${fontSize}px 'Segoe UI', Arial, sans-serif`;
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.fillStyle = "rgba(70,70,78,0.85)";
    for (const region of regions) {
      tctx.fillText(String(region.paletteNumber), region.labelX, region.labelY);
    }
    return tmp.toDataURL(mime);
  }

  /* ---------- pointer interaction ---------- */

  const activePointers = new Map();
  let pinchState = null;
  // gesture: tek parmak jesti — "paint" (fırça) veya "pan" (kaydırma)
  let gesture = null;
  let lastPointerDownAt = 0;

  function pointerDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function setGestureActive(active) {
    clearTimeout(gestureSettleTimer);
    if (active) {
      gestureActive = true;
      return;
    }
    // Jest bitiminden kısa süre sonra numaralar geri çizilir.
    gestureSettleTimer = setTimeout(() => {
      gestureActive = false;
      scheduleOverlayDraw();
    }, 120);
  }

  function resetPointerState() {
    activePointers.clear();
    pinchState = null;
    gesture = null;
    clearTimeout(gestureSettleTimer);
    gestureActive = false;
  }

  function onPointerDown(event) {
    // Viewport içindeki kontrol katmanları (zoom hapı vb.) boyama/pan başlatmaz.
    if (event.target?.closest?.(".pbn-zoom-pill")) return;
    lastPointerDownAt = Date.now();
    activePointers.set(event.pointerId, event);
    setGestureActive(true);

    if (activePointers.size === 2) {
      const rect = viewport.getBoundingClientRect();
      const [a, b] = Array.from(activePointers.values());
      pinchState = {
        startDist: pointerDistance(a, b),
        startScale: scale,
        startOffsetX: offsetX,
        startOffsetY: offsetY,
        startMidX: (a.clientX + b.clientX) / 2 - rect.left,
        startMidY: (a.clientY + b.clientY) / 2 - rect.top
      };
      // Pinch başlarsa tek parmak fırçası iptal olur; o ana kadarki boyama kalır.
      if (gesture?.mode === "paint" && gesture.stroke.length) {
        paintOrder.push(gesture.stroke);
        redoStack = [];
      }
      gesture = null;
      return;
    }

    const { imgX, imgY } = screenToImagePoint(event.clientX, event.clientY);
    const region = regionAtImagePoint(imgX, imgY);
    const paintable = region && !paintedSet.has(region.id) && region.paletteNumber === selectedNumber;

    if (paintable) {
      gesture = {
        mode: "paint",
        stroke: [],
        lastImgX: imgX,
        lastImgY: imgY,
        downTime: Date.now(),
        downX: event.clientX,
        downY: event.clientY,
        maxMove: 0
      };
      paintRegionIntoStroke(region, gesture.stroke);
      scheduleOverlayDraw();
    } else {
      gesture = {
        mode: "pan",
        lastX: event.clientX,
        lastY: event.clientY,
        downTime: Date.now(),
        downX: event.clientX,
        downY: event.clientY,
        maxMove: 0,
        downRegion: region
      };
    }
  }

  function paintAlongSegment(x0, y0, x1, y1, stroke) {
    // Görüntü uzayında yarım hücre adımlarla interpolasyon: hızlı
    // kaydırmada arada hücre atlanmaz.
    const step = Math.max(1, cellSize / 2 || 4);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / step));
    let paintedAny = false;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const region = regionAtImagePoint(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
      if (!region || paintedSet.has(region.id)) continue;
      if (region.paletteNumber !== selectedNumber) continue;
      paintRegionIntoStroke(region, stroke);
      paintedAny = true;
    }
    return paintedAny;
  }

  function onPointerMove(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, event);

    if (activePointers.size === 2 && pinchState) {
      const rect = viewport.getBoundingClientRect();
      const [a, b] = Array.from(activePointers.values());
      const dist = pointerDistance(a, b);
      const midX = (a.clientX + b.clientX) / 2 - rect.left;
      const midY = (a.clientY + b.clientY) / 2 - rect.top;
      const newScale = snapScale(Math.min(Math.max(pinchState.startScale * (dist / pinchState.startDist), minZoom()), maxZoom()));
      const ratio = newScale / pinchState.startScale;
      offsetX = midX - (pinchState.startMidX - pinchState.startOffsetX) * ratio;
      offsetY = midY - (pinchState.startMidY - pinchState.startOffsetY) * ratio;
      scale = newScale;
      applyTransform();
      return;
    }

    if (!gesture) return;
    gesture.maxMove = Math.max(gesture.maxMove, Math.hypot(event.clientX - gesture.downX, event.clientY - gesture.downY));

    if (gesture.mode === "paint") {
      const { imgX, imgY } = screenToImagePoint(event.clientX, event.clientY);
      if (imgX >= 0 && imgY >= 0) {
        const paintedAny = paintAlongSegment(gesture.lastImgX, gesture.lastImgY, imgX, imgY, gesture.stroke);
        gesture.lastImgX = imgX;
        gesture.lastImgY = imgY;
        if (paintedAny) scheduleOverlayDraw();
      }
      return;
    }

    // pan
    offsetX += event.clientX - gesture.lastX;
    offsetY += event.clientY - gesture.lastY;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    applyTransform();
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchState = null;
    if (activePointers.size !== 0) return;

    if (gesture) {
      const isTap = Date.now() - gesture.downTime < 250 && gesture.maxMove < 6;
      if (gesture.mode === "paint") {
        if (gesture.stroke.length) {
          paintOrder.push(gesture.stroke);
          redoStack = [];
        }
        flushPaintEvents();
      } else if (isTap && gesture.downRegion && !paintedSet.has(gesture.downRegion.id)
        && gesture.downRegion.paletteNumber !== selectedNumber) {
        onChange({ type: "wrong", region: gesture.downRegion });
      }
      gesture = null;
    }
    setGestureActive(false);
  }

  viewport.addEventListener("pointerdown", (e) => {
    try { viewport.setPointerCapture(e.pointerId); } catch { /* sentetik/eski pointer olayları */ }
    onPointerDown(e);
  });
  viewport.addEventListener("pointermove", onPointerMove);
  // pointerup pencere düzeyinde dinlenir: tamamlanma anında ekran değişip
  // viewport gizlenirse bile jest güvenle kapanır (takılı fırça olmaz).
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  // Güvenlik ağı: pointer olayları (eklenti vb. nedeniyle) sayfaya ulaşmazsa
  // tıklama yine de boyasın. Normal akışta pointerdown zaten işlediği için atlanır.
  viewport.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    if (event.target?.closest?.(".pbn-zoom-pill")) return;
    if (Date.now() - lastPointerDownAt < 400) return;
    tryPaintAt(event.clientX, event.clientY);
  });
  viewport.addEventListener("wheel", handleWheelZoom, { passive: false, capture: true });

  // Safari'nin native iki parmak pinch-zoom'u (gesturestart/gesturechange), stage'in
  // kendi pointer-tabanli zoom'uyla çakışıp sayfayı zoomlayarak sabit konumlu oyun
  // katmanının bozulmasına ("oyundan atılma" hissi) yol açabiliyor; burada bastırılır.
  function preventNativeGesture(e) { e.preventDefault(); }
  document.addEventListener("gesturestart", preventNativeGesture, { passive: false });
  document.addEventListener("gesturechange", preventNativeGesture, { passive: false });

  // Ek güvenlik ağı: bazı iOS Safari sürümlerinde gesturestart/gesturechange
  // hiç tetiklenmeden çok dokunuşlu touchmove doğrudan sayfa zoom'u
  // uygulayabiliyor. touch-action:none çoğu durumda yeterli olsa da, iki+
  // parmaklı hareket viewport üzerindeyse burada da engellenir. touchstart'ta
  // da aynısı yapılır ki pinch algılanmadan önce jest hiç başlamasın.
  function preventMultiTouchScroll(e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }
  viewport.addEventListener("touchstart", preventMultiTouchScroll, { passive: false });
  viewport.addEventListener("touchmove", preventMultiTouchScroll, { passive: false });

  // iOS Safari'de canvas/görsel üzerine uzun basma "Fotoğrafı Kaydet/Kopyala"
  // bağlam menüsünü açabiliyor; bu, boyama tuvalini native image gibi
  // davranışa sokup kullanıcıyı yanlışlıkla galeri/önizleme akışına sürükleyebilir.
  function preventCanvasContextMenu(e) { e.preventDefault(); }
  viewport.addEventListener("contextmenu", preventCanvasContextMenu);

  // Seçili renk numarasına ait, henüz boyanmamış tüm hücreleri bulup
  // ekranda kısa süreliğine parlatır. Hedef hücrelerin hiçbiri görünür
  // alanda değilse görünüm ilk hedefe ortalanır.
  function showColorHint(number) {
    if (number == null) return { ok: false, reason: "no-selection" };
    const candidates = regionsByNumber.get(number) || [];
    const targets = candidates.filter((r) => !paintedSet.has(r.id));
    if (!targets.length) return { ok: false, reason: "complete" };

    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const pad = 28;
    const anyVisible = targets.some((r) => {
      const sx = r.labelX * scale + offsetX;
      const sy = r.labelY * scale + offsetY;
      return sx >= pad && sx <= vw - pad && sy >= pad && sy <= vh - pad;
    });
    if (!anyVisible) {
      const target = targets[0];
      offsetX = vw / 2 - target.labelX * scale;
      offsetY = vh / 2 - target.labelY * scale;
      applyTransform();
    }

    hintIds = new Set(targets.map((r) => r.id));
    hintExpireAt = performance.now() + HINT_DURATION_MS;
    runHintLoop();
    return { ok: true, count: hintIds.size };
  }

  function runHintLoop() {
    if (hintRafId != null) return;
    const step = () => {
      drawOverlay();
      if (performance.now() >= hintExpireAt) {
        hintIds.clear();
        hintRafId = null;
        drawOverlay();
        return;
      }
      hintRafId = requestAnimationFrame(step);
    };
    hintRafId = requestAnimationFrame(step);
  }

  function clearColorHint() {
    hintIds.clear();
    hintExpireAt = 0;
    if (hintRafId != null) {
      cancelAnimationFrame(hintRafId);
      hintRafId = null;
    }
  }

  function drawHintOverlay(vw, vh, imgLeft, imgTop, imgRight, imgBottom) {
    if (!hintIds.size) return;

    const shapes = [];
    if (cellSize && gridCols && gridRows) {
      const cellScreen = cellSize * scale;
      for (const id of hintIds) {
        if (paintedSet.has(id)) continue;
        const row = Math.floor(id / gridCols);
        const col = id % gridCols;
        const x0 = offsetX + col * cellScreen;
        const y0 = offsetY + row * cellScreen;
        if (x0 + cellScreen < 0 || y0 + cellScreen < 0 || x0 > vw || y0 > vh) continue;
        shapes.push({ x0, y0, w: cellScreen, h: cellScreen });
      }
    } else {
      for (const id of hintIds) {
        if (paintedSet.has(id)) continue;
        const region = regionById.get(id);
        if (!region) continue;
        const cx = offsetX + region.labelX * scale;
        const cy = offsetY + region.labelY * scale;
        if (cx < -20 || cy < -20 || cx > vw + 20 || cy > vh + 20) continue;
        const r = Math.max(6, 10 * scale);
        shapes.push({ cx, cy, r, isCircle: true });
      }
    }
    if (!shapes.length) return;

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 170);

    octx.save();
    octx.fillStyle = "rgba(8, 10, 18, 0.34)";
    const dimX = Math.max(0, imgLeft);
    const dimY = Math.max(0, imgTop);
    octx.fillRect(dimX, dimY, Math.min(vw, imgRight) - dimX, Math.min(vh, imgBottom) - dimY);
    octx.restore();

    const path = new Path2D();
    for (const s of shapes) {
      if (s.isCircle) {
        path.moveTo(s.cx + s.r, s.cy);
        path.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      } else {
        path.rect(s.x0, s.y0, s.w, s.h);
      }
    }

    octx.save();
    octx.shadowColor = "rgba(255, 210, 60, 0.95)";
    octx.shadowBlur = 10 + 10 * pulse;
    octx.fillStyle = `rgba(255, 221, 90, ${0.5 + 0.35 * pulse})`;
    octx.fill(path);
    octx.shadowBlur = 0;
    octx.lineWidth = Math.max(1.5, 2.5 * pulse);
    octx.strokeStyle = `rgba(255,255,255,${0.65 + 0.35 * pulse})`;
    octx.stroke(path);
    octx.restore();
  }

  return {
    setData,
    setPaintedRegions,
    setOnChange,
    selectNumber,
    getSelectedNumber,
    undo,
    redo,
    resetPainting,
    showColorHint,
    getNumberStats,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
    zoomReset: fitToView,
    handleWheelZoom,
    getProgress,
    isComplete,
    getPaintedRegionIds,
    exportPaintedDataUrl,
    exportPaintedBlob,
    exportTemplateDataUrl,
    render,
    destroy() {
      clearTimeout(resizeSettleTimer);
      clearTimeout(gestureSettleTimer);
      settleTimers.forEach(clearTimeout);
      if (overlayRafId != null) cancelAnimationFrame(overlayRafId);
      if (paintEmitRafId != null) cancelAnimationFrame(paintEmitRafId);
      if (hintRafId != null) cancelAnimationFrame(hintRafId);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      viewport.removeEventListener("wheel", handleWheelZoom, true);
      viewport.removeEventListener("touchstart", preventMultiTouchScroll);
      viewport.removeEventListener("touchmove", preventMultiTouchScroll);
      viewport.removeEventListener("contextmenu", preventCanvasContextMenu);
      document.removeEventListener("gesturestart", preventNativeGesture);
      document.removeEventListener("gesturechange", preventNativeGesture);
      resizeObserver.disconnect();
      overlay.remove();
    }
  };
}
