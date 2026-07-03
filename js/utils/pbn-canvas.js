const OUTLINE_RGB = [70, 70, 78];
const OUTLINE_CSS = `rgb(${OUTLINE_RGB[0]},${OUTLINE_RGB[1]},${OUTLINE_RGB[2]})`;
const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const TINT_MIX = 0.14;
const HIGHLIGHT_MIX = 0.34;

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
  let palette = [];
  let paletteByNumber = new Map();
  let totalPixels = 0;
  let cellSize = 0;
  let maxRegionId = 0;
  let regionNumberLut = null;

  const paintedSet = new Set();
  let paintOrder = [];
  let redoStack = [];
  let selectedNumber = null;
  let numberTotals = new Map();
  let numberPainted = new Map();

  let scale = 1, offsetX = 0, offsetY = 0, fitScale = 1;
  let mode = "paint";
  let dragState = null;
  let pinchState = null;
  let paintDragActive = false;
  let onChange = () => {};

  let resizeSettleTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(() => fitToView(), 80);
  });
  resizeObserver.observe(viewport);

  // ResizeObserver bazı ortamlarda tetiklenmiyor; düzen oturana kadar
  // kademeli yeniden sığdırma ile garantiye alınır.
  let settleTimers = [];
  function settleFit() {
    settleTimers.forEach(clearTimeout);
    settleTimers = [];
    requestAnimationFrame(() => requestAnimationFrame(() => fitToView()));
    settleTimers.push(setTimeout(fitToView, 220));
    settleTimers.push(setTimeout(fitToView, 800));
  }

  function setOnChange(handler) {
    onChange = handler;
  }

  function setData(payload) {
    ({ width, height, regionMap, outline, regions, palette } = payload);
    cellSize = payload.cellSize || 0;
    regionById = new Map(regions.map((r) => [r.id, r]));
    paletteByNumber = new Map(palette.map((p) => [p.number, p]));
    maxRegionId = regions.reduce((max, r) => Math.max(max, r.id), 0);
    regionNumberLut = new Int32Array(maxRegionId + 1).fill(-1);
    for (const r of regions) regionNumberLut[r.id] = r.paletteNumber;

    numberTotals = new Map();
    numberPainted = new Map();
    for (const p of palette) { numberTotals.set(p.number, 0); numberPainted.set(p.number, 0); }
    for (const r of regions) numberTotals.set(r.paletteNumber, (numberTotals.get(r.paletteNumber) || 0) + 1);

    totalPixels = width * height;
    canvas.width = width;
    canvas.height = height;
    paintedSet.clear();
    paintOrder = [];
    redoStack = [];
    selectedNumber = palette[0]?.number ?? null;
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
    paintOrder = ids.filter((id) => regionById.has(id));
    redoStack = [];
    render();
  }

  /* ---------- view / transform ---------- */

  function snapScale(value, roundFn = Math.round) {
    if (!cellSize) return value;
    const cellPx = Math.max(3, roundFn(value * cellSize));
    return cellPx / cellSize;
  }

  function fitToView() {
    if (!width || !height || !viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return;
    fitScale = Math.min(vw / width, vh / height) * 0.96;
    scale = snapScale(Math.min(fitScale, MAX_SCALE), Math.floor);
    offsetX = (vw - width * scale) / 2;
    offsetY = (vh - height * scale) / 2;
    applyTransform();
  }

  function minZoom() {
    return Math.min(MIN_SCALE, fitScale);
  }

  function applyTransform() {
    if (stage) stage.style.transform = `translate(${Math.round(offsetX)}px, ${Math.round(offsetY)}px) scale(${scale})`;
  }

  function zoomBy(factor, centerX, centerY) {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const cx = centerX ?? vw / 2;
    const cy = centerY ?? vh / 2;
    const prevScale = scale;
    scale = snapScale(Math.min(Math.max(scale * factor, minZoom()), MAX_SCALE));
    const ratio = scale / prevScale;
    offsetX = cx - (cx - offsetX) * ratio;
    offsetY = cy - (cy - offsetY) * ratio;
    applyTransform();
  }

  /* ---------- selection / mode ---------- */

  function selectNumber(number) {
    if (number === selectedNumber) return;
    selectedNumber = number;
    render();
  }

  function getSelectedNumber() {
    return selectedNumber;
  }

  function setMode(next) {
    mode = next === "pan" ? "pan" : "paint";
  }

  function getMode() {
    return mode;
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

  function tryPaintAt(clientX, clientY, { silent = false } = {}) {
    const { imgX, imgY } = screenToImagePoint(clientX, clientY);
    const region = regionAtImagePoint(imgX, imgY);
    if (!region || paintedSet.has(region.id)) return false;

    if (region.paletteNumber === selectedNumber) {
      markPainted(region.id);
      paintOrder.push(region.id);
      redoStack = [];
      paintCellVisual(region, true);
      onChange({ type: "paint", region });
      return true;
    }
    if (!silent) onChange({ type: "wrong", region });
    return false;
  }

  function undo() {
    if (!paintOrder.length) return;
    const id = paintOrder.pop();
    markUnpainted(id);
    redoStack.push(id);
    paintCellVisual(regionById.get(id), false);
    onChange({ type: "undo" });
  }

  function redo() {
    if (!redoStack.length) return;
    const id = redoStack.pop();
    markPainted(id);
    paintOrder.push(id);
    paintCellVisual(regionById.get(id), true);
    onChange({ type: "redo" });
  }

  function resetPainting() {
    paintedSet.clear();
    for (const number of numberPainted.keys()) numberPainted.set(number, 0);
    paintOrder = [];
    redoStack = [];
    render();
    onChange({ type: "reset" });
  }

  function findHintRegion() {
    for (const region of regions) {
      if (!paintedSet.has(region.id)) return region;
    }
    return null;
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

  /* ---------- rendering ---------- */

  function numberFont() {
    const size = cellSize ? Math.max(8, Math.round(cellSize * 0.55)) : 13;
    return `600 ${size}px 'Segoe UI', Arial, sans-serif`;
  }

  function drawCellNumber(region) {
    ctx.font = numberFont();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(70,70,78,0.85)";
    ctx.fillText(String(region.paletteNumber), region.labelX, region.labelY);
  }

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
    ctx.fillRect(x0, y0, cs, cs);

    ctx.fillStyle = OUTLINE_CSS;
    ctx.fillRect(x0, y0, cs, 1);
    ctx.fillRect(x0, y0, 1, cs);
    if (x0 + cs >= width) ctx.fillRect(width - 1, y0, 1, cs);
    if (y0 + cs >= height) ctx.fillRect(x0, height - 1, cs, 1);

    if (!painted) drawCellNumber(region);
  }

  function buildComposite({ numbers = true, tint = true, highlight = true } = {}) {
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

    for (let i = 0; i < totalPixels; i++) {
      const px = i * 4;
      let packed;
      if (outline[i]) {
        buf[px] = OUTLINE_RGB[0]; buf[px + 1] = OUTLINE_RGB[1]; buf[px + 2] = OUTLINE_RGB[2]; buf[px + 3] = 255;
        continue;
      }
      const id = regionMap[i];
      packed = lutPaint[id];
      if (packed < 0) packed = lutBase[id];
      buf[px] = (packed >> 16) & 0xff;
      buf[px + 1] = (packed >> 8) & 0xff;
      buf[px + 2] = packed & 0xff;
      buf[px + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    if (numbers) {
      ctx.font = numberFont();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(70,70,78,0.85)";
      for (const region of regions) {
        if (paintedSet.has(region.id)) continue;
        ctx.fillText(String(region.paletteNumber), region.labelX, region.labelY);
      }
    }
  }

  function render() {
    if (!width || !height) return;
    buildComposite({ numbers: true, tint: true, highlight: true });
  }

  function exportPaintedDataUrl(mime = "image/png") {
    buildComposite({ numbers: false, tint: false, highlight: false });
    const url = canvas.toDataURL(mime, 0.95);
    render();
    return url;
  }

  function exportTemplateDataUrl(mime = "image/png") {
    const saved = new Set(paintedSet);
    paintedSet.clear();
    buildComposite({ numbers: true, tint: false, highlight: false });
    const url = canvas.toDataURL(mime, 0.95);
    for (const id of saved) paintedSet.add(id);
    render();
    return url;
  }

  /* ---------- pointer interaction ---------- */

  const activePointers = new Map();

  function pointerDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  let lastPointerDownAt = 0;

  function onPointerDown(event) {
    lastPointerDownAt = Date.now();
    activePointers.set(event.pointerId, event);

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
      dragState = null;
      paintDragActive = false;
      return;
    }

    if (mode === "pan") {
      dragState = { startX: event.clientX, startY: event.clientY, startOffsetX: offsetX, startOffsetY: offsetY };
    } else {
      paintDragActive = true;
      tryPaintAt(event.clientX, event.clientY, { silent: false });
    }
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
      const newScale = snapScale(Math.min(Math.max(pinchState.startScale * (dist / pinchState.startDist), minZoom()), MAX_SCALE));
      const ratio = newScale / pinchState.startScale;
      offsetX = midX - (pinchState.startMidX - pinchState.startOffsetX) * ratio;
      offsetY = midY - (pinchState.startMidY - pinchState.startOffsetY) * ratio;
      scale = newScale;
      applyTransform();
      return;
    }

    if (dragState) {
      offsetX = dragState.startOffsetX + (event.clientX - dragState.startX);
      offsetY = dragState.startOffsetY + (event.clientY - dragState.startY);
      applyTransform();
      return;
    }

    if (paintDragActive && mode === "paint") {
      tryPaintAt(event.clientX, event.clientY, { silent: true });
    }
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchState = null;
    if (activePointers.size === 0) {
      dragState = null;
      paintDragActive = false;
    }
  }

  viewport.addEventListener("pointerdown", (e) => {
    try { viewport.setPointerCapture(e.pointerId); } catch { /* sentetik/eski pointer olayları */ }
    onPointerDown(e);
  });
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);
  // Güvenlik ağı: pointer olayları (eklenti vb. nedeniyle) sayfaya ulaşmazsa
  // tıklama yine de boyasın. Normal akışta pointerdown zaten işlediği için atlanır.
  viewport.addEventListener("click", (event) => {
    if (mode !== "paint") return;
    if (Date.now() - lastPointerDownAt < 400) return;
    tryPaintAt(event.clientX, event.clientY, { silent: false });
  });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  function showHintPing(region) {
    if (!stage) return;
    const ping = document.createElement("div");
    ping.className = "pbn-hint-ping";
    ping.style.left = `${region.labelX}px`;
    ping.style.top = `${region.labelY}px`;
    stage.appendChild(ping);
    setTimeout(() => ping.remove(), 2200);
  }

  return {
    setData,
    setPaintedRegions,
    setOnChange,
    selectNumber,
    getSelectedNumber,
    setMode,
    getMode,
    undo,
    redo,
    resetPainting,
    findHintRegion,
    showHintPing,
    getNumberStats,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
    zoomReset: fitToView,
    getProgress,
    isComplete,
    getPaintedRegionIds,
    exportPaintedDataUrl,
    exportTemplateDataUrl,
    render,
    destroy() {
      clearTimeout(resizeSettleTimer);
      settleTimers.forEach(clearTimeout);
      resizeObserver.disconnect();
    }
  };
}
