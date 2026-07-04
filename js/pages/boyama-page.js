import { createPbnEngine } from "../utils/pbn-canvas.js?v=fit-visible-20260704";
import { buildRegionMapAndOutline } from "../utils/pbn-grid.js?v=fit-visible-20260704";
import {
  readIndex, saveProject, loadProject, deleteProject,
  saveGalleryItem, listGalleryItems, getGalleryItem, deleteGalleryItem
} from "../utils/pbn-store.js";

// Eski detay oranı korunur: 128 -> 5000px. Diğer seviyeler de aynı
// oranla büyütülür: 32 -> 1250px, 56 -> 2188px, 88 -> 3438px.
const DETAIL_WIDTH_SCALE = 5000 / 128;

function scaledDetailWidth(baseCols) {
  return Math.round(baseCols * DETAIL_WIDTH_SCALE);
}

const DIFFICULTY_PRESETS = {
  kolay: { baseCols: 32, targetWidth: scaledDetailWidth(32), k: 16, cell: 10, mergeDeltaE: 10 },
  normal: { baseCols: 56, targetWidth: scaledDetailWidth(56), k: 24, cell: 10, mergeDeltaE: 9 },
  zor: { baseCols: 88, targetWidth: scaledDetailWidth(88), k: 32, cell: 10, mergeDeltaE: 8 },
  pro: { baseCols: 128, targetWidth: scaledDetailWidth(128), k: 56, cell: 10, mergeDeltaE: 6.5 }
};

const KMEANS_ITERATIONS = 14;

const PRESET_IMAGES = [
  { src: "./assets/home-bg-desktop.png", name: "Orman Masalı" },
  { src: "./assets/ravzalingo-background.png", name: "Yeşil Bahçe" },
  { src: "./assets/study-hub-bg-desktop.png", name: "Çalışma Köşesi" },
  { src: "./assets/quiz-hub-bg-desktop.png", name: "Bilgi Yarışı" }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const TEMPLATE = `
  <div class="pbn-app">
    <div class="pbn-screen pbn-screen-home is-active" data-pbn-screen="home">
      <div class="pbn-hero">
        <img class="pbn-brand-logo" src="./assets/game-icon-boyama.png" alt="Boyama logosu" loading="lazy" />
        <span class="unit-badge">YENİ NESİL</span>
        <h2>Numaraya Göre Boyama</h2>
        <p>Fotoğrafını yükle; sistem renklerini analiz edip resme özel numaralı bir palet çıkarsın, sen de piksel piksel boya.</p>
        <label class="pbn-upload-btn" for="pbnFileInput">
          <span class="pbn-upload-icon" aria-hidden="true">📷</span>
          Fotoğraf Yükle
        </label>
        <button type="button" class="pbn-secondary-btn" id="pbnGalleryHomeBtn">🖼 Galerim</button>
        <input type="file" id="pbnFileInput" accept="image/*" hidden />
      </div>

      <div class="pbn-diff-picker" id="pbnDiffPicker">
        <p class="pbn-diff-label">Zorluk seç (detay seviyesi):</p>
        <div class="pbn-diff-options">
          <button type="button" class="pbn-diff-chip" data-diff="kolay">
            <strong>Kolay</strong><span>${DIFFICULTY_PRESETS.kolay.targetWidth}px detay · ~${DIFFICULTY_PRESETS.kolay.k} renk</span>
          </button>
          <button type="button" class="pbn-diff-chip is-selected" data-diff="normal">
            <strong>Normal</strong><span>${DIFFICULTY_PRESETS.normal.targetWidth}px detay · ~${DIFFICULTY_PRESETS.normal.k} renk</span>
          </button>
          <button type="button" class="pbn-diff-chip" data-diff="zor">
            <strong>Zor</strong><span>${DIFFICULTY_PRESETS.zor.targetWidth}px detay · ~${DIFFICULTY_PRESETS.zor.k} renk</span>
          </button>
          <button type="button" class="pbn-diff-chip" data-diff="pro">
            <strong>Profesyonel</strong><span>${DIFFICULTY_PRESETS.pro.targetWidth}px detay · ~${DIFFICULTY_PRESETS.pro.k} renk</span>
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
      <div class="pbn-paint-header">
        <button type="button" class="pbn-tool-btn" id="pbnBackBtn" title="Ana ekrana dön">←</button>
        <span class="pbn-paint-logo" aria-hidden="true">
          <img src="./assets/game-icon-boyama.png" alt="" loading="lazy" />
        </span>
        <div class="pbn-paint-progress">
          <div class="pbn-paint-progress-track">
            <div class="pbn-paint-progress-fill" id="pbnPaintProgressFill"></div>
          </div>
          <span id="pbnPaintProgressText">0%</span>
        </div>
        <div class="pbn-paint-tools">
          <button type="button" class="pbn-tool-btn" id="pbnUndoBtn" title="Geri al">↩</button>
          <button type="button" class="pbn-tool-btn" id="pbnRedoBtn" title="İleri al">↪</button>
          <button type="button" class="pbn-tool-btn" id="pbnHintBtn" title="İpucu">💡</button>
          <button type="button" class="pbn-tool-btn" id="pbnMenuBtn" title="Diğer seçenekler" aria-haspopup="true" aria-expanded="false">⋯</button>
        </div>
        <div class="pbn-paint-menu" id="pbnPaintMenu" hidden>
          <button type="button" class="pbn-menu-item" id="pbnMenuZoomReset">⤢ Görünümü Sıfırla</button>
          <button type="button" class="pbn-menu-item" id="pbnMenuTemplate">🗒 Şablonu İndir</button>
          <button type="button" class="pbn-menu-item pbn-menu-item--danger" id="pbnMenuReset">⟲ Boyamayı Sıfırla</button>
          <button type="button" class="pbn-menu-item" id="pbnMenuNewPhoto">🖼 Yeni Fotoğraf</button>
        </div>
      </div>

      <div class="pbn-canvas-viewport" id="pbnCanvasViewport">
        <div class="pbn-canvas-stage" id="pbnCanvasStage">
          <canvas id="pbnCanvas"></canvas>
        </div>
        <div class="pbn-zoom-pill">
          <button type="button" class="pbn-zoom-btn" id="pbnZoomInBtn" title="Yakınlaştır">＋</button>
          <button type="button" class="pbn-zoom-btn" id="pbnZoomResetBtn" title="Görünümü sıfırla">⌂</button>
          <button type="button" class="pbn-zoom-btn" id="pbnZoomOutBtn" title="Uzaklaştır">－</button>
        </div>
      </div>

      <div class="pbn-palette-dock" id="pbnPaletteStrip"></div>
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
        <p class="pbn-saved-chip" id="pbnGallerySavedChip" hidden>✓ Galerine kaydedildi</p>
        <div class="pbn-result-actions">
          <button type="button" class="pbn-upload-btn" id="pbnViewGalleryBtn">Galeride Gör</button>
          <button type="button" class="pbn-secondary-btn" id="pbnShareResultBtn">Paylaş / Cihaza Kaydet</button>
        </div>
        <div class="pbn-result-actions pbn-result-actions--secondary">
          <button type="button" class="pbn-text-btn" id="pbnDownloadTemplateBtn">Numaralı Şablonu İndir</button>
          <button type="button" class="pbn-text-btn" id="pbnNewFromResultBtn">Yeni Fotoğraf Yükle</button>
        </div>
      </div>
    </div>

    <div class="pbn-screen pbn-screen-gallery" data-pbn-screen="gallery">
      <div class="pbn-gallery-head">
        <button type="button" class="pbn-tool-btn" id="pbnGalleryBackBtn" title="Ana ekrana dön">←</button>
        <h3>Galerim</h3>
        <span class="pbn-gallery-count" id="pbnGalleryCount"></span>
      </div>
      <div class="pbn-gallery-empty" id="pbnGalleryEmpty" hidden>
        <p>Galerin şimdilik boş. Tamamladığın her boyama buraya otomatik kaydedilir.</p>
        <button type="button" class="pbn-upload-btn" id="pbnGalleryEmptyCta">İlk boyamana başla</button>
      </div>
      <div class="pbn-gallery-grid" id="pbnGalleryGrid"></div>
    </div>

    <div class="pbn-gallery-viewer" id="pbnGalleryViewer" hidden>
      <div class="pbn-gallery-viewer-card">
        <img id="pbnViewerImage" alt="Boyama eseri" />
        <div class="pbn-gallery-viewer-actions">
          <button type="button" class="pbn-upload-btn" id="pbnViewerShareBtn">Paylaş / Cihaza Kaydet</button>
          <button type="button" class="pbn-secondary-btn" id="pbnViewerDownloadBtn">İndir</button>
        </div>
        <div class="pbn-gallery-viewer-actions pbn-gallery-viewer-actions--secondary">
          <button type="button" class="pbn-text-btn pbn-text-btn--danger" id="pbnViewerDeleteBtn">Sil</button>
          <button type="button" class="pbn-text-btn" id="pbnViewerCloseBtn">Kapat</button>
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

  // Tamamlanan eserin galeri durumu
  let gallerySavedForId = null;
  let resultBlob = null;

  // Galeri görüntüleyici durumu
  let viewerItem = null;
  let viewerObjectUrl = null;

  const documentClickHandler = (event) => {
    const menu = root.querySelector("#pbnPaintMenu");
    if (!menu || menu.hidden) return;
    if (event.target.closest("#pbnPaintMenu") || event.target.closest("#pbnMenuBtn")) return;
    closePaintMenu();
  };
  document.addEventListener("click", documentClickHandler);

  wireHome();
  wirePaintScreen();
  wireResultScreen();
  wireGalleryScreen();
  renderRecentGrid();

  function showScreen(name) {
    closePaintMenu();
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

    root.querySelector("#pbnGalleryHomeBtn").addEventListener("click", () => {
      showScreen("gallery");
      renderGalleryGrid();
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
        <img src="${item.thumbnail}" alt="${escapeHtml(item.name || "Çalışma")}" />
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
    const targetWidth = preset.targetWidth || Math.round((preset.baseCols || 56) * DETAIL_WIDTH_SCALE);
    const cellSize = preset.cell;
    const srcW = img.naturalWidth || 1;
    const srcH = img.naturalHeight || 1;
    const w = targetWidth;
    const h = Math.min(
      Math.max(Math.round(targetWidth * (srcH / srcW)), cellSize * 8),
      Math.round(targetWidth * 1.5)
    );

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    setStepState("downscale", "is-done");
    setStepState("colors", "is-active");

    if (activeWorker) activeWorker.terminate();
    const worker = new Worker(new URL("../workers/pbn-worker.js?v=fit-visible-20260704", import.meta.url), { type: "module" });
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
      k: preset.k, cellSize,
      mergeDeltaE: preset.mergeDeltaE,
      iterations: KMEANS_ITERATIONS
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
      difficulty: currentDifficulty,
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

  function makeThumbnail(maxDim = 160) {
    const sourceCanvas = root.querySelector("#pbnCanvas");
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
    // Tamamlanıp galeriye taşınan proje yeniden kaydedilmez.
    if (gallerySavedForId === currentProject.id) return;
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
    }, 500);
  }

  /* ---------- palette dock ---------- */

  function renderPalette(palette) {
    const strip = root.querySelector("#pbnPaletteStrip");
    strip.innerHTML = palette.map((p) => {
      const luma = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
      const inkClass = luma > 150 ? " pbn-swatch--dark-ink" : "";
      return `
      <button type="button" class="pbn-swatch${inkClass}" data-number="${p.number}" style="--chip-color: rgb(${p.r},${p.g},${p.b})" title="Renk ${p.number}">
        <span class="pbn-swatch-num">${p.number}</span>
        <span class="pbn-swatch-count"></span>
        <span class="pbn-swatch-check" aria-hidden="true">✓</span>
      </button>`;
    }).join("");

    strip.querySelectorAll(".pbn-swatch").forEach((chip) => {
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
    strip.querySelectorAll(".pbn-swatch").forEach((c) => c.classList.remove("is-selected"));
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
      const countEl = chip.querySelector(".pbn-swatch-count");
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

  function closePaintMenu() {
    const menu = root.querySelector("#pbnPaintMenu");
    const btn = root.querySelector("#pbnMenuBtn");
    if (menu) menu.hidden = true;
    btn?.setAttribute("aria-expanded", "false");
  }

  function wirePaintScreen() {
    const canvas = root.querySelector("#pbnCanvas");
    const viewport = root.querySelector("#pbnCanvasViewport");
    const stage = root.querySelector("#pbnCanvasStage");

    engine = createPbnEngine({ canvas, viewport, stage });
    viewport.__pbnEngine = engine;
    engine.setOnChange((event) => {
      if (event.type === "paint") {
        updateProgressUi();
        updatePaletteChips();
        autoAdvanceIfComplete();
        if (engine.isComplete()) {
          showResultScreen();
        } else {
          persistProject(false);
        }
      } else if (event.type === "wrong") {
        viewport.classList.add("is-shaking");
        setTimeout(() => viewport.classList.remove("is-shaking"), 320);
      } else {
        updateProgressUi();
        updatePaletteChips();
        persistProject(false);
      }
    });

    root.querySelector("#pbnBackBtn").addEventListener("click", () => {
      persistProject(true);
      showScreen("home");
      renderRecentGrid();
    });
    root.querySelector("#pbnUndoBtn").addEventListener("click", () => engine.undo());
    root.querySelector("#pbnRedoBtn").addEventListener("click", () => engine.redo());
    root.querySelector("#pbnZoomInBtn").addEventListener("click", () => engine.zoomIn());
    root.querySelector("#pbnZoomOutBtn").addEventListener("click", () => engine.zoomOut());
    root.querySelector("#pbnZoomResetBtn").addEventListener("click", () => engine.zoomReset());
    root.querySelector(".pbn-screen-paint").addEventListener("wheel", (event) => {
      if (!root.querySelector(".pbn-screen-paint.is-active")) return;
      if (event.target?.closest?.(".pbn-canvas-viewport")) return;
      if (event.target?.closest?.(".pbn-paint-header, .pbn-palette-dock, .pbn-paint-menu, button, input, select, textarea")) return;
      engine.handleWheelZoom(event);
    }, { passive: false, capture: true });
    root.querySelector("#pbnHintBtn").addEventListener("click", () => {
      const region = engine.findHintRegion();
      if (!region) return;
      engine.selectNumber(region.paletteNumber);
      highlightPaletteNumber(region.paletteNumber);
      engine.showHintPing(region);
    });

    const menuBtn = root.querySelector("#pbnMenuBtn");
    const menu = root.querySelector("#pbnPaintMenu");
    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    root.querySelector("#pbnMenuZoomReset").addEventListener("click", () => {
      engine.zoomReset();
      closePaintMenu();
    });
    root.querySelector("#pbnMenuTemplate").addEventListener("click", () => {
      downloadDataUrl(engine.exportTemplateDataUrl(), `boyama-sablon-${Date.now()}.png`);
      closePaintMenu();
    });
    root.querySelector("#pbnMenuReset").addEventListener("click", () => {
      closePaintMenu();
      if (confirm("Tüm boyama ilerlemen sıfırlanacak. Emin misin?")) engine.resetPainting();
    });
    root.querySelector("#pbnMenuNewPhoto").addEventListener("click", () => {
      closePaintMenu();
      root.querySelector("#pbnFileInput").click();
    });
  }

  /* ---------- result ---------- */

  async function showResultScreen() {
    clearTimeout(saveTimer); // bekleyen proje kaydı iptal — eser galeriye taşınıyor
    const resultImg = root.querySelector("#pbnResultImage");
    resultImg.src = engine.exportPaintedDataUrl();
    spawnConfetti();
    showScreen("result");

    const chip = root.querySelector("#pbnGallerySavedChip");

    // Blob ekrana girerken hazırlanır: paylaş butonunda iOS'un kullanıcı
    // jesti süresi dolmadan navigator.share çağrılabilsin.
    resultBlob = await engine.exportPaintedBlob();

    if (currentProject && gallerySavedForId !== currentProject.id && resultBlob) {
      try {
        await saveGalleryItem({
          id: currentProject.id,
          name: currentProject.name,
          createdAt: Date.now(),
          width: currentProject.width,
          height: currentProject.height,
          difficulty: currentProject.difficulty || currentDifficulty,
          paletteSize: currentProject.palette?.length || 0,
          imageBlob: resultBlob,
          thumbnail: makeThumbnail(220)
        });
        gallerySavedForId = currentProject.id;
        chip.hidden = false;
        // Biten iş artık galeride; yarım işler listesinden çıkarılır.
        await deleteProject(currentProject.id);
        renderRecentGrid();
      } catch (error) {
        console.error("Eser galeriye kaydedilemedi:", error);
        chip.hidden = true;
      }
    }
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

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Paylaşım zinciri: dosyalı navigator.share (mobil paylaşım sayfasından
  // "Fotoğraflara kaydet" çıkar) → desteklenmiyorsa indirme.
  async function shareOrDownloadBlob(blob, filename) {
    if (!blob) return;
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Boyama Eserim" });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return; // kullanıcı vazgeçti
      }
    }
    downloadBlob(blob, filename);
  }

  function wireResultScreen() {
    root.querySelector("#pbnViewGalleryBtn").addEventListener("click", () => {
      showScreen("gallery");
      renderGalleryGrid();
    });
    root.querySelector("#pbnShareResultBtn").addEventListener("click", () => {
      shareOrDownloadBlob(resultBlob, `boyama-${Date.now()}.png`);
    });
    root.querySelector("#pbnDownloadTemplateBtn").addEventListener("click", () => {
      downloadDataUrl(engine.exportTemplateDataUrl(), `boyama-sablon-${Date.now()}.png`);
    });
    root.querySelector("#pbnNewFromResultBtn").addEventListener("click", () => {
      showScreen("home");
      renderRecentGrid();
      root.querySelector("#pbnFileInput").click();
    });
  }

  /* ---------- gallery ---------- */

  async function renderGalleryGrid() {
    const grid = root.querySelector("#pbnGalleryGrid");
    const empty = root.querySelector("#pbnGalleryEmpty");
    const count = root.querySelector("#pbnGalleryCount");

    let items = [];
    try {
      items = await listGalleryItems();
    } catch (error) {
      console.error("Galeri okunamadı:", error);
    }

    count.textContent = items.length ? `${items.length} eser` : "";
    empty.hidden = items.length > 0;
    grid.hidden = !items.length;
    grid.innerHTML = items.map((item) => `
      <button type="button" class="pbn-gallery-item" data-id="${item.id}">
        <img src="${item.thumbnail}" alt="${escapeHtml(item.name || "Boyama eseri")}" loading="lazy" />
        <span>${new Date(item.createdAt || Date.now()).toLocaleDateString("tr-TR")}</span>
      </button>
    `).join("");

    grid.querySelectorAll(".pbn-gallery-item").forEach((el) => {
      el.addEventListener("click", () => openGalleryViewer(el.dataset.id));
    });
  }

  async function openGalleryViewer(id) {
    let item = null;
    try {
      item = await getGalleryItem(id);
    } catch (error) {
      console.error("Eser açılamadı:", error);
    }
    if (!item || !item.imageBlob) return;

    viewerItem = item;
    if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
    viewerObjectUrl = URL.createObjectURL(item.imageBlob);
    root.querySelector("#pbnViewerImage").src = viewerObjectUrl;
    root.querySelector("#pbnGalleryViewer").hidden = false;
  }

  function closeGalleryViewer() {
    root.querySelector("#pbnGalleryViewer").hidden = true;
    root.querySelector("#pbnViewerImage").removeAttribute("src");
    if (viewerObjectUrl) {
      URL.revokeObjectURL(viewerObjectUrl);
      viewerObjectUrl = null;
    }
    viewerItem = null;
  }

  function wireGalleryScreen() {
    root.querySelector("#pbnGalleryBackBtn").addEventListener("click", () => {
      showScreen("home");
      renderRecentGrid();
    });
    root.querySelector("#pbnGalleryEmptyCta").addEventListener("click", () => {
      showScreen("home");
      root.querySelector("#pbnFileInput").click();
    });

    const viewer = root.querySelector("#pbnGalleryViewer");
    viewer.addEventListener("click", (event) => {
      if (event.target === viewer) closeGalleryViewer();
    });
    root.querySelector("#pbnViewerCloseBtn").addEventListener("click", closeGalleryViewer);
    root.querySelector("#pbnViewerShareBtn").addEventListener("click", () => {
      if (viewerItem) shareOrDownloadBlob(viewerItem.imageBlob, `boyama-${viewerItem.id}.png`);
    });
    root.querySelector("#pbnViewerDownloadBtn").addEventListener("click", () => {
      if (viewerItem) downloadBlob(viewerItem.imageBlob, `boyama-${viewerItem.id}.png`);
    });
    root.querySelector("#pbnViewerDeleteBtn").addEventListener("click", async () => {
      if (!viewerItem) return;
      if (!confirm("Bu eser galeriden silinecek. Emin misin?")) return;
      try {
        await deleteGalleryItem(viewerItem.id);
      } catch (error) {
        console.error("Eser silinemedi:", error);
      }
      closeGalleryViewer();
      renderGalleryGrid();
    });
  }

  return {
    cleanup() {
      engine?.destroy();
      if (activeWorker) { activeWorker.terminate(); activeWorker = null; }
      clearTimeout(saveTimer);
      document.removeEventListener("click", documentClickHandler);
      if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
    }
  };
}
