import { createPbnEngine } from "../utils/pbn-canvas.js";
import { buildRegionMapAndOutline } from "../utils/pbn-grid.js";
import { readIndex, saveProject, loadProject, deleteProject } from "../utils/pbn-store.js";

const DIFFICULTY_PRESETS = {
  kolay: { k: 12, cols: 16 },
  normal: { k: 20, cols: 26 },
  zor: { k: 30, cols: 40 },
  pro: { k: 48, cols: 56 }
};

const CELL_RENDER = 24;

const PRESET_IMAGES = [
  { src: "./assets/home-bg-desktop.png", name: "Orman Masalı" },
  { src: "./assets/ravzalingo-background.png", name: "Yeşil Bahçe" },
  { src: "./assets/study-hub-bg-desktop.png", name: "Çalışma Köşesi" },
  { src: "./assets/quiz-hub-bg-desktop.png", name: "Bilgi Yarışı" }
];

const TEMPLATE = `
  <div class="pbn-app">
    <div class="pbn-screen pbn-screen-home is-active" data-pbn-screen="home">
      <div class="pbn-hero">
        <span class="unit-badge">YENİ NESİL</span>
        <h2>Numaraya Göre Boyama</h2>
        <p>Fotoğrafını yükle; sistem renklerini analiz edip resme özel numaralı bir palet çıkarsın, sen de piksel piksel boya.</p>
        <label class="pbn-upload-btn" for="pbnFileInput">
          <span class="pbn-upload-icon" aria-hidden="true">📷</span>
          Fotoğraf Yükle
        </label>
        <input type="file" id="pbnFileInput" accept="image/*" hidden />
      </div>

      <div class="pbn-diff-picker" id="pbnDiffPicker">
        <p class="pbn-diff-label">Zorluk seç (piksel boyutu):</p>
        <div class="pbn-diff-options">
          <button type="button" class="pbn-diff-chip" data-diff="kolay">
            <strong>Kolay</strong><span>Büyük piksel</span>
          </button>
          <button type="button" class="pbn-diff-chip is-selected" data-diff="normal">
            <strong>Normal</strong><span>Orta piksel</span>
          </button>
          <button type="button" class="pbn-diff-chip" data-diff="zor">
            <strong>Zor</strong><span>Küçük piksel</span>
          </button>
          <button type="button" class="pbn-diff-chip" data-diff="pro">
            <strong>Profesyonel</strong><span>Çok küçük piksel</span>
          </button>
        </div>
      </div>

      <div class="pbn-presets">
        <h3>Hazır Görseller</h3>
        <p class="pbn-presets-hint">Her görsel kendi renklerine göre farklı bir palet üretir.</p>
        <div class="pbn-preset-grid" id="pbnPresetGrid">
          ${PRESET_IMAGES.map((item) => `
            <button type="button" class="pbn-preset-item" data-src="${item.src}" data-name="${item.name}">
              <img src="${item.src}" alt="${item.name}" loading="lazy" />
              <span>${item.name}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="pbn-recent" id="pbnRecentSection" hidden>
        <h3>Son Çalışmalarım</h3>
        <div class="pbn-recent-grid" id="pbnRecentGrid"></div>
      </div>
    </div>

    <div class="pbn-screen pbn-screen-analysis" data-pbn-screen="analysis">
      <div class="pbn-analysis-card">
        <div class="pbn-analysis-preview">
          <img id="pbnAnalysisPreview" alt="Yüklenen fotoğraf" />
        </div>
        <h3 id="pbnAnalysisTitle">Fotoğraf analiz ediliyor…</h3>
        <div class="pbn-progress-bar">
          <div class="pbn-progress-fill" id="pbnAnalysisFill"></div>
        </div>
        <p class="pbn-analysis-percent" id="pbnAnalysisPercent">0%</p>
        <ul class="pbn-analysis-steps" id="pbnAnalysisSteps">
          <li data-step="downscale">Fotoğraf optimize ediliyor</li>
          <li data-step="colors">Baskın renkler çıkarılıyor</li>
          <li data-step="labels">Benzer renkler birleştiriliyor</li>
          <li data-step="regions">Pikseller numaralandırılıyor</li>
          <li data-step="finalize">Boyama şablonu hazırlanıyor</li>
        </ul>
      </div>
    </div>

    <div class="pbn-screen pbn-screen-paint" data-pbn-screen="paint">
      <div class="pbn-paint-topbar">
        <div class="pbn-progress-pill">
          <div class="pbn-progress-pill-track">
            <div class="pbn-progress-pill-fill" id="pbnPaintProgressFill"></div>
          </div>
          <span id="pbnPaintProgressText">0%</span>
        </div>
        <div class="pbn-paint-toolbar">
          <button type="button" class="pbn-tool-btn is-active" id="pbnModeBtn" title="Boyama / Kaydırma modu">🖌</button>
          <button type="button" class="pbn-tool-btn" id="pbnUndoBtn" title="Geri al">↩</button>
          <button type="button" class="pbn-tool-btn" id="pbnRedoBtn" title="İleri al">↪</button>
          <button type="button" class="pbn-tool-btn" id="pbnHintBtn" title="İpucu">💡</button>
          <button type="button" class="pbn-tool-btn" id="pbnZoomInBtn" title="Yakınlaştır">＋</button>
          <button type="button" class="pbn-tool-btn" id="pbnZoomOutBtn" title="Uzaklaştır">－</button>
          <button type="button" class="pbn-tool-btn" id="pbnZoomResetBtn" title="Görünümü sıfırla">⤢</button>
          <button type="button" class="pbn-tool-btn" id="pbnResetBtn" title="Boyamayı sıfırla">⟲</button>
          <button type="button" class="pbn-tool-btn pbn-tool-btn--danger" id="pbnNewPhotoBtn" title="Yeni fotoğraf ekle">🖼</button>
        </div>
      </div>

      <div class="pbn-canvas-viewport is-paint-mode" id="pbnCanvasViewport">
        <div class="pbn-canvas-stage" id="pbnCanvasStage">
          <canvas id="pbnCanvas"></canvas>
        </div>
      </div>

      <div class="pbn-palette-strip" id="pbnPaletteStrip"></div>
    </div>

    <div class="pbn-screen pbn-screen-result" data-pbn-screen="result">
      <div class="pbn-result-card">
        <div class="pbn-confetti-layer" id="pbnConfettiLayer"></div>
        <span class="unit-badge">TAMAMLANDI</span>
        <h2>Tebrikler, eserin hazır! 🎉</h2>
        <p>Fotoğrafın artık gerçek bir sanat eserine dönüştü.</p>
        <div class="pbn-result-preview">
          <img id="pbnResultImage" alt="Boyanmış sonuç" />
        </div>
        <div class="pbn-result-actions">
          <button type="button" class="pbn-upload-btn" id="pbnDownloadPaintedBtn">İndir (Boyalı)</button>
          <button type="button" class="pbn-secondary-btn" id="pbnDownloadTemplateBtn">Numaralı Şablonu İndir</button>
        </div>
        <div class="pbn-result-actions pbn-result-actions--secondary">
          <button type="button" class="pbn-text-btn" id="pbnEditAgainBtn">Tekrar Düzenle</button>
          <button type="button" class="pbn-text-btn" id="pbnNewFromResultBtn">Yeni Fotoğraf Yükle</button>
        </div>
      </div>
    </div>
  </div>
`;

export function renderBoyamaApp(target) {
  target.innerHTML = TEMPLATE;

  const root = target;
  let engine = null;
  let currentDifficulty = "normal";
  let currentProject = null;
  let saveTimer = null;
  let activeWorker = null;

  wireHome();
  wirePaintScreen();
  wireResultScreen();
  renderRecentGrid();

  function showScreen(name) {
    root.querySelectorAll(".pbn-screen").forEach((el) => el.classList.remove("is-active"));
    root.querySelector(`[data-pbn-screen="${name}"]`)?.classList.add("is-active");
  }

  /* ---------- home ---------- */

  function wireHome() {
    const fileInput = root.querySelector("#pbnFileInput");
    const diffPicker = root.querySelector("#pbnDiffPicker");

    fileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        startAnalysisFromUrl(url, file.name, true);
      }
      fileInput.value = "";
    });

    diffPicker.querySelectorAll(".pbn-diff-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        diffPicker.querySelectorAll(".pbn-diff-chip").forEach((c) => c.classList.remove("is-selected"));
        chip.classList.add("is-selected");
        currentDifficulty = chip.dataset.diff;
      });
    });

    root.querySelectorAll(".pbn-preset-item").forEach((item) => {
      item.addEventListener("click", () => {
        startAnalysisFromUrl(item.dataset.src, item.dataset.name, false);
      });
    });
  }

  function renderRecentGrid() {
    const section = root.querySelector("#pbnRecentSection");
    const grid = root.querySelector("#pbnRecentGrid");
    const items = readIndex();
    if (!items.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    grid.innerHTML = items.map((item) => `
      <div class="pbn-recent-item" data-id="${item.id}">
        <img src="${item.thumbnail}" alt="${item.name || "Çalışma"}" />
        <button type="button" class="pbn-recent-delete" data-delete-id="${item.id}" aria-label="Sil">✕</button>
      </div>
    `).join("");

    grid.querySelectorAll(".pbn-recent-item").forEach((el) => {
      el.addEventListener("click", (event) => {
        if (event.target.closest("[data-delete-id]")) return;
        resumeProject(el.dataset.id);
      });
    });
    grid.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await deleteProject(btn.dataset.deleteId);
        renderRecentGrid();
      });
    });
  }

  async function resumeProject(id) {
    const record = await loadProject(id);
    if (!record) return;
    currentProject = record;
    showScreen("paint");

    let regionMap, outline;
    if (record.cellSize) {
      ({ regionMap, outline } = buildRegionMapAndOutline(record.width, record.height, record.cellSize));
    } else {
      regionMap = new Uint32Array(record.regionMapBuffer);
      outline = new Uint8Array(record.outlineBuffer);
    }

    engine.setData({
      width: record.width,
      height: record.height,
      regionMap,
      outline,
      regions: record.regions,
      palette: record.palette,
      cellSize: record.cellSize || 0
    });
    engine.setPaintedRegions(record.paintedRegionIds || []);
    renderPalette(record.palette);
    updatePaletteChips();
    updateProgressUi();
    requestAnimationFrame(() => requestAnimationFrame(() => engine.zoomReset()));
  }

  /* ---------- analysis pipeline ---------- */

  function startAnalysisFromUrl(url, name, revokeAfterLoad) {
    showScreen("analysis");
    const steps = root.querySelectorAll("#pbnAnalysisSteps li");
    steps.forEach((li) => li.classList.remove("is-done", "is-active"));
    root.querySelector("#pbnAnalysisFill").style.width = "0%";
    root.querySelector("#pbnAnalysisPercent").textContent = "0%";
    root.querySelector("#pbnAnalysisPreview").src = url;

    const img = new Image();
    img.onload = () => {
      processImage(img, name);
      if (revokeAfterLoad) URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      alert("Görsel yüklenemedi. Lütfen başka bir görsel deneyin.");
      showScreen("home");
      if (revokeAfterLoad) URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function processImage(img, fileName) {
    const preset = DIFFICULTY_PRESETS[currentDifficulty] || DIFFICULTY_PRESETS.normal;
    const cols = preset.cols;
    const srcW = img.naturalWidth || 1;
    const srcH = img.naturalHeight || 1;
    const rows = Math.min(Math.max(Math.round(cols * (srcH / srcW)), 6), cols * 2);
    const w = cols * CELL_RENDER;
    const h = rows * CELL_RENDER;

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    setStepState("downscale", "is-done");
    setStepState("colors", "is-active");

    if (activeWorker) activeWorker.terminate();
    const worker = new Worker(new URL("../workers/pbn-worker.js", import.meta.url), { type: "module" });
    activeWorker = worker;

    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "progress") {
        setStepState(msg.stage, msg.progress >= 100 ? "is-done" : "is-active");
        const stageWeights = { downscale: 10, colors: 45, labels: 15, regions: 20, finalize: 10 };
        const stageOrder = ["downscale", "colors", "labels", "regions", "finalize"];
        let overall = 0;
        const currentIdx = stageOrder.indexOf(msg.stage);
        for (let i = 0; i < currentIdx; i++) overall += stageWeights[stageOrder[i]];
        overall += (stageWeights[msg.stage] * msg.progress) / 100;
        root.querySelector("#pbnAnalysisFill").style.width = `${overall}%`;
        root.querySelector("#pbnAnalysisPercent").textContent = `${Math.round(overall)}%`;
        const nextIdx = currentIdx + 1;
        if (msg.progress >= 100 && stageOrder[nextIdx]) setStepState(stageOrder[nextIdx], "is-active");
      } else if (msg.type === "done") {
        root.querySelector("#pbnAnalysisFill").style.width = "100%";
        root.querySelector("#pbnAnalysisPercent").textContent = "100%";
        root.querySelectorAll("#pbnAnalysisSteps li").forEach((li) => { li.classList.add("is-done"); li.classList.remove("is-active"); });
        onProcessingDone(msg, fileName);
        worker.terminate();
        if (activeWorker === worker) activeWorker = null;
      } else if (msg.type === "error") {
        console.error("PBN worker error:", msg.message);
        alert("Fotoğraf işlenirken bir hata oluştu. Lütfen başka bir fotoğraf deneyin.");
        showScreen("home");
        worker.terminate();
        if (activeWorker === worker) activeWorker = null;
      }
    };

    worker.postMessage({
      data: imageData.data.buffer,
      width: w, height: h,
      k: preset.k, cellSize: CELL_RENDER
    }, [imageData.data.buffer]);
  }

  function setStepState(stage, state) {
    const li = root.querySelector(`#pbnAnalysisSteps li[data-step="${stage}"]`);
    if (!li) return;
    if (state === "is-done") { li.classList.add("is-done"); li.classList.remove("is-active"); }
    else { li.classList.add("is-active"); }
  }

  function onProcessingDone(msg, fileName) {
    const regionMap = new Uint32Array(msg.regionMapBuffer);
    const outline = new Uint8Array(msg.outlineBuffer);

    showScreen("paint");
    engine.setData({
      width: msg.width, height: msg.height,
      regionMap, outline,
      regions: msg.regions, palette: msg.palette,
      cellSize: msg.cellSize
    });

    const id = (crypto.randomUUID?.() || `pbn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    currentProject = {
      id,
      name: fileName || "Boyama Çalışması",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      width: msg.width, height: msg.height,
      cellSize: msg.cellSize,
      palette: msg.palette,
      regions: msg.regions,
      paintedRegionIds: [],
      thumbnail: makeThumbnail()
    };

    renderPalette(msg.palette);
    updatePaletteChips();
    updateProgressUi();
    persistProject(true);
    requestAnimationFrame(() => requestAnimationFrame(() => engine.zoomReset()));
  }

  /* ---------- persistence ---------- */

  function makeThumbnail() {
    const sourceCanvas = root.querySelector("#pbnCanvas");
    const maxDim = 160;
    const scale = Math.min(1, maxDim / Math.max(sourceCanvas.width, sourceCanvas.height));
    const tw = Math.max(1, Math.round(sourceCanvas.width * scale));
    const th = Math.max(1, Math.round(sourceCanvas.height * scale));
    const tmp = document.createElement("canvas");
    tmp.width = tw; tmp.height = th;
    tmp.getContext("2d").drawImage(sourceCanvas, 0, 0, tw, th);
    return tmp.toDataURL("image/jpeg", 0.72);
  }

  function persistProject(regenThumbnail) {
    if (!currentProject) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      currentProject.paintedRegionIds = engine.getPaintedRegionIds();
      currentProject.updatedAt = Date.now();
      if (regenThumbnail) currentProject.thumbnail = makeThumbnail();
      try {
        await saveProject(currentProject);
      } catch (error) {
        console.error("Boyama kaydedilemedi:", error);
      }
    }, 350);
  }

  /* ---------- palette strip ---------- */

  function renderPalette(palette) {
    const strip = root.querySelector("#pbnPaletteStrip");
    strip.innerHTML = palette.map((p) => `
      <button type="button" class="pbn-palette-chip" data-number="${p.number}" style="--chip-color: rgb(${p.r},${p.g},${p.b})">
        <span class="pbn-palette-swatch"><span class="pbn-palette-check" aria-hidden="true">✓</span></span>
        <span class="pbn-palette-num">${p.number}</span>
        <span class="pbn-palette-count"></span>
      </button>
    `).join("");

    strip.querySelectorAll(".pbn-palette-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        engine.selectNumber(Number(chip.dataset.number));
        highlightPaletteNumber(Number(chip.dataset.number));
      });
    });

    const firstNumber = palette[0]?.number;
    if (firstNumber != null) highlightPaletteNumber(firstNumber);
  }

  function highlightPaletteNumber(number) {
    const strip = root.querySelector("#pbnPaletteStrip");
    strip.querySelectorAll(".pbn-palette-chip").forEach((c) => c.classList.remove("is-selected"));
    const chip = strip.querySelector(`[data-number="${number}"]`);
    chip?.classList.add("is-selected");
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function updatePaletteChips() {
    const strip = root.querySelector("#pbnPaletteStrip");
    const stats = engine.getNumberStats();
    for (const stat of stats) {
      const chip = strip.querySelector(`[data-number="${stat.number}"]`);
      if (!chip) continue;
      chip.classList.toggle("is-complete", stat.complete);
      const countEl = chip.querySelector(".pbn-palette-count");
      if (countEl) countEl.textContent = stat.complete ? "" : String(stat.total - stat.painted);
    }
  }

  function autoAdvanceIfComplete() {
    const current = engine.getSelectedNumber();
    const stats = engine.getNumberStats();
    const currentStat = stats.find((s) => s.number === current);
    if (!currentStat || !currentStat.complete) return;

    const ordered = stats.filter((s) => !s.complete);
    if (!ordered.length) return;
    const next = ordered.find((s) => s.number > current) || ordered[0];
    engine.selectNumber(next.number);
    highlightPaletteNumber(next.number);
  }

  /* ---------- paint screen ---------- */

  function updateProgressUi() {
    const progress = engine.getProgress();
    root.querySelector("#pbnPaintProgressFill").style.width = `${progress}%`;
    root.querySelector("#pbnPaintProgressText").textContent = `${progress}%`;
  }

  function wirePaintScreen() {
    const canvas = root.querySelector("#pbnCanvas");
    const viewport = root.querySelector("#pbnCanvasViewport");
    const stage = root.querySelector("#pbnCanvasStage");
    const modeBtn = root.querySelector("#pbnModeBtn");

    engine = createPbnEngine({ canvas, viewport, stage });
    viewport.__pbnEngine = engine;
    engine.setOnChange((event) => {
      if (event.type === "paint") {
        updateProgressUi();
        updatePaletteChips();
        autoAdvanceIfComplete();
        persistProject(false);
        if (engine.isComplete()) showResultScreen();
      } else if (event.type === "wrong") {
        viewport.classList.add("is-shaking");
        setTimeout(() => viewport.classList.remove("is-shaking"), 320);
      } else {
        updateProgressUi();
        updatePaletteChips();
        persistProject(false);
      }
    });

    modeBtn.addEventListener("click", () => {
      const nextMode = engine.getMode() === "paint" ? "pan" : "paint";
      engine.setMode(nextMode);
      modeBtn.textContent = nextMode === "paint" ? "🖌" : "✋";
      modeBtn.classList.toggle("is-active", nextMode === "paint");
      viewport.classList.toggle("is-paint-mode", nextMode === "paint");
      viewport.classList.toggle("is-pan-mode", nextMode === "pan");
    });

    root.querySelector("#pbnUndoBtn").addEventListener("click", () => engine.undo());
    root.querySelector("#pbnRedoBtn").addEventListener("click", () => engine.redo());
    root.querySelector("#pbnZoomInBtn").addEventListener("click", () => engine.zoomIn());
    root.querySelector("#pbnZoomOutBtn").addEventListener("click", () => engine.zoomOut());
    root.querySelector("#pbnZoomResetBtn").addEventListener("click", () => engine.zoomReset());
    root.querySelector("#pbnResetBtn").addEventListener("click", () => {
      if (confirm("Tüm boyama ilerlemen sıfırlanacak. Emin misin?")) engine.resetPainting();
    });
    root.querySelector("#pbnNewPhotoBtn").addEventListener("click", () => {
      root.querySelector("#pbnFileInput").click();
    });
    root.querySelector("#pbnHintBtn").addEventListener("click", () => {
      const region = engine.findHintRegion();
      if (!region) return;
      engine.selectNumber(region.paletteNumber);
      highlightPaletteNumber(region.paletteNumber);
      engine.showHintPing(region);
    });
  }

  /* ---------- result ---------- */

  function showResultScreen() {
    const resultImg = root.querySelector("#pbnResultImage");
    resultImg.src = engine.exportPaintedDataUrl();
    spawnConfetti();
    showScreen("result");
  }

  function spawnConfetti() {
    const layer = root.querySelector("#pbnConfettiLayer");
    layer.innerHTML = "";
    const colors = ["#e879a0", "#d4669c", "#7c3aed", "#10b981", "#f59e0b", "#31449c"];
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement("span");
      piece.className = "pbn-confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.6}s`;
      piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
      layer.appendChild(piece);
    }
    setTimeout(() => { layer.innerHTML = ""; }, 3200);
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function wireResultScreen() {
    root.querySelector("#pbnDownloadPaintedBtn").addEventListener("click", () => {
      downloadDataUrl(engine.exportPaintedDataUrl(), `boyama-${Date.now()}.png`);
    });
    root.querySelector("#pbnDownloadTemplateBtn").addEventListener("click", () => {
      downloadDataUrl(engine.exportTemplateDataUrl(), `boyama-sablon-${Date.now()}.png`);
    });
    root.querySelector("#pbnEditAgainBtn").addEventListener("click", () => showScreen("paint"));
    root.querySelector("#pbnNewFromResultBtn").addEventListener("click", () => {
      showScreen("home");
      renderRecentGrid();
      root.querySelector("#pbnFileInput").click();
    });
  }

  return {
    cleanup() {
      engine?.destroy();
      if (activeWorker) { activeWorker.terminate(); activeWorker = null; }
      clearTimeout(saveTimer);
    }
  };
}
