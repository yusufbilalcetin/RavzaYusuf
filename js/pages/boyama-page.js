import { createPbnEngine } from "../utils/pbn-canvas.js?v=pbn-manual-resume-20260706-1";
import { buildRegionMapAndOutline } from "../utils/pbn-grid.js?v=fit-visible-20260704";
import {
  readIndex, saveProject, loadProject, deleteProject,
  saveCompleted, readCompletedIndex, loadCompleted, deleteCompleted
} from "../utils/pbn-store.js?v=pbn-manual-resume-20260706-1";
import { pbnLog } from "../utils/pbn-debug.js?v=pbn-manual-resume-20260706-1";

// Eski detay oranı korunur: 128 -> 5000px. Diğer seviyeler de aynı
// oranla büyütülür: 32 -> 1250px, 56 -> 2188px, 88 -> 3438px.
const DETAIL_WIDTH_SCALE = 5000 / 128;

// iOS Safari, çok büyük tuvalleri (özellikle pinch sırasında CSS scale ile
// büyütülünce) bellek baskısıyla öldürüp sekmeyi reload edebiliyor. Bu yüzden
// piksel tuvali güvenli bir tavana indirilir. DETAY (gridCols = width/cellSize)
// DEĞİŞMEZ: yalnız her hücrenin piksel boyutu düşürülür, region/renk sayısı aynı.
const MAX_CANVAS_DIM = 2560;       // en büyük kenar (px)
const MAX_CANVAS_AREA = 4_000_000; // toplam alan (~4 MP)

function scaledDetailWidth(baseCols) {
  return Math.round(baseCols * DETAIL_WIDTH_SCALE);
}

// pbnActiveProjectId/pbnActiveRoute are save/snapshot markers only.
// They must not be used by boot code to reopen Boyama automatically.
function markActiveProject(id) {
  try {
    localStorage.setItem("pbnActiveProjectId", id);
    localStorage.setItem("pbnActiveRoute", "oyun:boyama");
  } catch { /* private mode */ }
}

function clearActiveProject() {
  try {
    localStorage.removeItem("pbnActiveProjectId");
    localStorage.removeItem("pbnActiveRoute");
  } catch { /* private mode */ }
}

const EMERGENCY_SNAPSHOT_PREFIX = "pbnEmergencySnapshot:";

function emergencySnapshotKey(id) {
  return `${EMERGENCY_SNAPSHOT_PREFIX}${id}`;
}

function clearEmergencySnapshot(id) {
  if (!id) return;
  try {
    localStorage.removeItem(emergencySnapshotKey(id));
  } catch { /* private mode */ }
}

function writeEmergencySnapshot(project) {
  if (!project?.id || project.completed) return;
  try {
    localStorage.setItem(emergencySnapshotKey(project.id), JSON.stringify({
      id: project.id,
      paintedRegionIds: Array.isArray(project.paintedRegionIds) ? project.paintedRegionIds : [],
      updatedAt: Number(project.updatedAt) || Date.now(),
      progress: Number(project.progress ?? 0),
      selectedNumber: project.selectedNumber ?? null,
      activeRoute: localStorage.getItem("pbnActiveRoute") || "oyun:boyama"
    }));
  } catch (error) {
    console.warn("[PBN SAVE] emergency snapshot failed", error);
  }
}

function readEmergencySnapshot(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(emergencySnapshotKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id !== id || !Array.isArray(parsed.paintedRegionIds)) return null;
    return {
      id,
      paintedRegionIds: [...new Set(parsed.paintedRegionIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0))],
      updatedAt: Number(parsed.updatedAt) || 0,
      progress: Number(parsed.progress ?? 0),
      selectedNumber: parsed.selectedNumber ?? null,
      activeRoute: parsed.activeRoute || null
    };
  } catch (error) {
    console.warn("[PBN SAVE] emergency snapshot ignored", error);
    clearEmergencySnapshot(id);
    return null;
  }
}

function mergeEmergencySnapshot(record) {
  if (!record?.id || record.completed) return { record, merged: false };
  const snapshot = readEmergencySnapshot(record.id);
  if (!snapshot) return { record, merged: false };

  const snapshotCount = snapshot.paintedRegionIds?.length || 0;
  const recordCount = record.paintedRegionIds?.length || 0;
  const snapshotUpdatedAt = Number(snapshot.updatedAt) || 0;
  const recordUpdatedAt = Number(record.updatedAt) || 0;
  const shouldUseSnapshot = snapshotUpdatedAt > recordUpdatedAt || snapshotCount > recordCount;

  if (!shouldUseSnapshot) return { record, merged: false };

  return {
    record: {
      ...record,
      paintedRegionIds: snapshot.paintedRegionIds,
      updatedAt: snapshotUpdatedAt || record.updatedAt,
      progress: Number.isFinite(snapshot.progress) ? snapshot.progress : record.progress,
      selectedNumber: snapshot.selectedNumber ?? record.selectedNumber ?? null
    },
    merged: true
  };
}

const DIFFICULTY_PRESETS = {
  kolay: { baseCols: 32, targetWidth: scaledDetailWidth(32), k: 16, cell: 10, mergeDeltaE: 10 },
  normal: { baseCols: 56, targetWidth: scaledDetailWidth(56), k: 24, cell: 10, mergeDeltaE: 9 },
  zor: { baseCols: 88, targetWidth: scaledDetailWidth(88), k: 32, cell: 10, mergeDeltaE: 8 },
  pro: { baseCols: 128, targetWidth: scaledDetailWidth(128), k: 56, cell: 10, mergeDeltaE: 6.5 }
};

const KMEANS_ITERATIONS = 14;

const PRESET_IMAGES = [
  {
    src: "./assets/home-bg-desktop.png",
    thumb: "./assets/pbn-preset-orman-masali.jpeg",
    name: "Orman Masalı",
    tag: "Masal",
    note: "Sıcak ışık, yoğun detay"
  },
  {
    src: "./assets/ravzalingo-background.png",
    thumb: "./assets/pbn-preset-yesil-bahce.jpeg",
    name: "Yeşil Bahçe",
    tag: "Doğa",
    note: "Yumuşak geçişler"
  },
  {
    src: "./assets/study-hub-bg-desktop.png",
    thumb: "./assets/pbn-preset-calisma-kosesi.jpeg",
    name: "Çalışma Köşesi",
    tag: "Sakin",
    note: "Dengeli renk alanları"
  },
  {
    src: "./assets/quiz-hub-bg-desktop.png",
    thumb: "./assets/pbn-preset-bilgi-yarisi.jpeg",
    name: "Bilgi Yarışı",
    tag: "Canlı",
    note: "Kontrast ve parlak tonlar"
  },
  {
    src: "./assets/study-detail-bg-desktop.png",
    thumb: "./assets/pbn-preset-sakin-vadi.jpeg",
    name: "Sakin Vadi",
    tag: "Manzara",
    note: "Geniş gölge paleti"
  }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function sortByUpdatedAt(items) {
  return [...items].sort((a, b) => {
    const bTime = b.updatedAt || b.createdAt || 0;
    const aTime = a.updatedAt || a.createdAt || 0;
    return bTime - aTime;
  });
}

function formatRecentTime(value) {
  if (!value) return "Kaydedildi";
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Tamamlanma tarihi kartlarda "06.07.2026" biçiminde gösterilir.
function formatCompletedDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function getPhoneSaveCopy() {
  const ua = navigator.userAgent || "";
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const isIos = /iPad|iPhone|iPod/i.test(ua)
    || (/Mac/i.test(platform) && Number(navigator.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/i.test(ua) || /Android/i.test(platform);

  if (isIos) {
    return {
      label: "Fotoğraflara Kaydet (PNG)",
      fallbackMessage: "iPhone bu tarayıcıda paylaşım ekranını açamadı. PNG indirildi; Dosyalar veya İndirilenler içinden paylaş menüsünü açıp 'Görseli Kaydet' seçeneğiyle Fotoğraflar'a ekleyebilirsin."
    };
  }

  if (isAndroid) {
    return {
      label: "Galeriye Kaydet (PNG)",
      fallbackMessage: "Android bu tarayıcıda paylaşım ekranını açamadı. PNG indirildi; İndirilenler veya Dosyalar içinden Fotoğraflar/Galeri'ye taşıyabilirsin."
    };
  }

  return {
    label: "Telefona Kaydet (PNG)",
    fallbackMessage: "Bu tarayıcı paylaşım ekranını açamadı. PNG indirildi; dosyayı cihazındaki galeri veya fotoğraf uygulamasına ekleyebilirsin."
  };
}

const TEMPLATE = `
  <div class="pbn-app">
    <div class="pbn-inline-toast pbn-app-error-toast" id="pbnAppErrorToast"></div>
    <div class="pbn-screen pbn-screen-home is-active" data-pbn-screen="home">
      <div class="pbn-hero">
        <img class="pbn-brand-logo" src="./assets/game-icon-boyama.jpeg" alt="Boyama logosu" loading="eager" decoding="async" />
        <div class="pbn-hero-copy">
          <span class="unit-badge">Boyama stüdyosu</span>
          <h2>Numaraya Göre Boyama</h2>
          <p>Fotoğraf yükle veya hazır görsel seç. Sistem paleti çıkarır, sen piksel piksel boya.</p>
        </div>
        <div class="pbn-hero-actions">
          <label class="pbn-upload-btn" for="pbnFileInput">
            Fotoğraf Yükle
          </label>
        </div>
        <input type="file" id="pbnFileInput" accept="image/*" hidden />
      </div>

      <div class="pbn-diff-picker" id="pbnDiffPicker">
        <div class="pbn-section-head">
          <div>
            <h3>Detay seviyesi</h3>
            <p>Hız ve ayrıntı dengesini seç.</p>
          </div>
          <span>Normal önerilir</span>
        </div>
        <div class="pbn-diff-options">
          <button type="button" class="pbn-diff-chip" data-diff="kolay">
            <span class="pbn-diff-main"><strong>Kolay</strong><small>Hızlı başlangıç</small></span>
            <span class="pbn-diff-meta">${DIFFICULTY_PRESETS.kolay.targetWidth}px · ${DIFFICULTY_PRESETS.kolay.k} renk</span>
          </button>
          <button type="button" class="pbn-diff-chip is-selected" data-diff="normal">
            <span class="pbn-diff-main"><strong>Normal</strong><small>Dengeli seçim</small></span>
            <span class="pbn-diff-meta">${DIFFICULTY_PRESETS.normal.targetWidth}px · ${DIFFICULTY_PRESETS.normal.k} renk</span>
          </button>
          <button type="button" class="pbn-diff-chip" data-diff="zor">
            <span class="pbn-diff-main"><strong>Zor</strong><small>Daha ince alanlar</small></span>
            <span class="pbn-diff-meta">${DIFFICULTY_PRESETS.zor.targetWidth}px · ${DIFFICULTY_PRESETS.zor.k} renk</span>
          </button>
          <button type="button" class="pbn-diff-chip" data-diff="pro">
            <span class="pbn-diff-main"><strong>Profesyonel</strong><small>Maksimum detay</small></span>
            <span class="pbn-diff-meta">${DIFFICULTY_PRESETS.pro.targetWidth}px · ${DIFFICULTY_PRESETS.pro.k} renk</span>
          </button>
        </div>
      </div>

      <div class="pbn-presets">
        <div class="pbn-section-head">
          <div>
            <h3>Hazır görseller</h3>
            <p>Farklı ışık, kontrast ve renk dengeleri için seçilmiş örnekler.</p>
          </div>
          <span>${PRESET_IMAGES.length} seçenek</span>
        </div>
        <div class="pbn-preset-grid" id="pbnPresetGrid">
          ${PRESET_IMAGES.map((item) => `
            <button type="button" class="pbn-preset-item" data-src="${item.src}" data-name="${item.name}">
              <img src="${item.thumb}" alt="${item.name}" loading="lazy" />
              <span class="pbn-preset-copy">
                <strong>${item.name}</strong>
                <small>${item.note}</small>
              </span>
              <span class="pbn-preset-tag">${item.tag}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="pbn-recent" id="pbnRecentSection" hidden>
        <div class="pbn-section-head">
          <div>
            <h3>Son çalışmalar</h3>
            <p>En son düzenlediğin çalışma en başta görünür.</p>
          </div>
        </div>
        <div class="pbn-recent-grid" id="pbnRecentGrid"></div>
      </div>

      <div class="pbn-completed" id="pbnCompletedSection" hidden>
        <div class="pbn-section-head">
          <div>
            <h3>Tamamlanan Boyamalar</h3>
            <p>%100 bitirdiğin eserler burada saklanır. İstediğin zaman görüntüle, indir veya sil.</p>
          </div>
          <span id="pbnCompletedCount"></span>
        </div>
        <div class="pbn-completed-grid" id="pbnCompletedGrid"></div>
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
          <img src="./assets/game-icon-boyama.jpeg" alt="" loading="eager" decoding="async" />
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
          <button type="button" class="pbn-menu-item pbn-menu-item--primary" id="pbnMenuSaveGallery" data-phone-save-label>Telefona Kaydet (PNG)</button>
          <button type="button" class="pbn-menu-item" id="pbnMenuZoomReset">⤢ Görünümü Sıfırla</button>
          <button type="button" class="pbn-menu-item" id="pbnMenuNewPhoto">🖼 Yeni Fotoğraf</button>
        </div>
      </div>

      <div class="pbn-canvas-viewport" id="pbnCanvasViewport">
        <div class="pbn-canvas-stage" id="pbnCanvasStage">
          <canvas id="pbnCanvas"></canvas>
        </div>
        <div class="pbn-inline-toast" id="pbnInlineToast"></div>
      </div>

      <div class="pbn-palette-dock" id="pbnPaletteStrip"></div>
    </div>

    <div class="pbn-screen pbn-screen-result" data-pbn-screen="result">
      <div class="pbn-result-card">
        <div class="pbn-confetti-layer" id="pbnConfettiLayer"></div>
        <span class="unit-badge">TAMAMLANDI</span>
        <h2>Eser hazır</h2>
        <p>Eserin PNG kalitesinde hazır. Telefonda paylaşım sayfasından Fotoğraflar veya Galeri'ye kaydedebilirsin.</p>
        <div class="pbn-result-preview">
          <img id="pbnResultImage" alt="Boyanmış sonuç" />
        </div>
        <div class="pbn-result-actions">
          <button type="button" class="pbn-upload-btn" id="pbnShareResultBtn" data-phone-save-label>Telefona Kaydet (PNG)</button>
          <button type="button" class="pbn-text-btn" id="pbnNewFromResultBtn">Yeni Fotoğraf Yükle</button>
        </div>
      </div>
    </div>

    <div class="pbn-modal-backdrop" id="pbnDeleteModal" hidden>
      <div class="pbn-modal" role="dialog" aria-modal="true" aria-labelledby="pbnDeleteTitle" aria-describedby="pbnDeleteDesc">
        <span class="pbn-modal-icon" aria-hidden="true">🗑️</span>
        <h3 id="pbnDeleteTitle">G&ouml;rseli Sil?</h3>
        <p id="pbnDeleteDesc">Bu g&ouml;rsel kalıcı olarak silinecek. Bu işlem geri alınamaz. Silmek istediğine emin misin?</p>
        <div class="pbn-modal-actions">
          <button type="button" class="pbn-modal-btn pbn-modal-btn--ghost" id="pbnDeleteCancel">İptal</button>
          <button type="button" class="pbn-modal-btn pbn-modal-btn--danger" id="pbnDeleteConfirm">Evet, Sil</button>
        </div>
      </div>
    </div>
  </div>
`;

export function renderBoyamaApp(target, options = {}) {
  target.innerHTML = TEMPLATE;
  pbnLog("boyama.render", { resume: options.resumeProjectId || null });

  const root = target;
  let engine = null;
  let currentDifficulty = "normal";
  let currentProject = null;
  let saveTimer = null;
  let activeWorker = null;
  let resultBlob = null;
  let resultBlobPromise = null;
  let resultScreenOpening = false;
  // Tamamlanan bir boyamayı "Görüntüle" ile açtığımızda true olur: bu modda
  // eser tekrar "Son çalışmalar" (yarım işler) listesine yazılmaz.
  let viewingCompleted = false;
  // Delete confirmation state for recent and completed cards.
  let pendingDeleteId = null;
  let pendingDeleteType = null;
  let pendingDeleteName = "";
  // Silme modalı, oyun tam-ekran üst barının (.game-stage-head, z-index 9020)
  // arkasında kalmasın diye document.body'ye taşınır: böylece oyun sahnesinin
  // (.game-stage-body 9001) stacking context'inin dışına çıkar ve her şeyin
  // üstünde görünür. (Aksi hâlde modalın kendi z-index'i ne olursa olsun üst
  // bar onu örter.)
  const deleteModalEl = root.querySelector("#pbnDeleteModal");
  if (deleteModalEl) document.body.appendChild(deleteModalEl);
  const phoneSaveCopy = getPhoneSaveCopy();

  let appErrorTimer = null;
  function showAppError(message) {
    const toast = root.querySelector("#pbnAppErrorToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(appErrorTimer);
    appErrorTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

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
  wireDeleteModal();
  applyPhoneSaveLabels();
  renderRecentGrid();
  renderCompletedGrid();

  function showScreen(name, reason = "") {
    pbnLog("showScreen", name, "reason:", reason);
    closePaintMenu();
    root.querySelectorAll(".pbn-screen").forEach((el) => el.classList.remove("is-active"));
    root.querySelector(`[data-pbn-screen="${name}"]`)?.classList.add("is-active");
    // Paint ekranındayken otomatik-devam işaretle; ayrılınca temizle.
    if (name === "paint" && currentProject) markActiveProject(currentProject.id);
    else if (name === "home" || name === "result") clearActiveProject();
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
    const items = sortByUpdatedAt(readIndex()).filter((item) => item.completed !== true);
    if (!items.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    grid.innerHTML = items.map((item) => {
      const snapshot = readEmergencySnapshot(item.id);
      const progress = Math.max(0, Math.min(100, Math.round(Number(item.progress ?? snapshot?.progress ?? 0))));
      return `
      <div class="pbn-recent-item" data-id="${item.id}">
        <img src="${item.thumbnail}" alt="${escapeHtml(item.name || "Çalışma")}" />
        <span class="pbn-recent-copy">
          <strong>${escapeHtml(item.name || "Boyama çalışması")}</strong>
          <small>${formatRecentTime(item.updatedAt || item.createdAt)}</small>
          <span class="pbn-recent-progress">${progress}% tamamlandı</span>
        </span>
        <button type="button" class="pbn-recent-continue" data-continue-id="${item.id}">Devam Et</button>
        <button type="button" class="pbn-recent-delete" data-delete-id="${item.id}" data-name="${escapeHtml(item.name || "Boyama çalışması")}" aria-label="Çalışmayı sil">✕</button>
      </div>
    `;
    }).join("");

    grid.querySelectorAll(".pbn-recent-item").forEach((el) => {
      el.addEventListener("click", (event) => {
        if (event.target.closest("[data-delete-id], [data-continue-id]")) return;
        resumeProject(el.dataset.id);
      });
    });
    grid.querySelectorAll("[data-continue-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        resumeProject(btn.dataset.continueId);
      });
    });
    grid.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        openDeleteModal(btn.dataset.deleteId, "recent", btn.dataset.name);
      });
    });
  }

  async function resumeProject(id) {
    const loadedRecord = await loadProject(id);
    if (!loadedRecord) {
      pbnLog("resumeProject.missing", { id });
      clearActiveProject();
      return false;
    }
    const { record, merged } = mergeEmergencySnapshot(loadedRecord);
    console.warn("[PBN SAVE DEBUG] resume loaded", {
      projectId: record?.id,
      paintedCount: record?.paintedRegionIds?.length
    });
    currentProject = record;
    resultScreenOpening = false;
    viewingCompleted = false;
    showScreen("paint", "resume");
    markActiveProject(record.id);

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
    if (merged) await saveProjectNow("resume-emergency-merge");
    requestAnimationFrame(() => requestAnimationFrame(() => engine.zoomReset()));
    return true;
  }

  /* ---------- tamamlanan boyamalar ---------- */

  function renderCompletedGrid() {
    const section = root.querySelector("#pbnCompletedSection");
    const grid = root.querySelector("#pbnCompletedGrid");
    const count = root.querySelector("#pbnCompletedCount");
    if (!section || !grid) return;
    const items = readCompletedIndex();
    if (!items.length) {
      section.hidden = true;
      grid.innerHTML = "";
      return;
    }
    section.hidden = false;
    if (count) count.textContent = `${items.length} eser`;
    grid.innerHTML = items.map((item) => {
      const name = escapeHtml(item.name || "Boyama çalışması");
      return `
      <article class="pbn-completed-card" data-id="${item.id}">
        <div class="pbn-completed-thumb">
          <img src="${item.thumbnail}" alt="${name}" loading="lazy" />
          <span class="pbn-completed-badge">%100</span>
        </div>
        <div class="pbn-completed-body">
          <strong class="pbn-completed-name">${name}</strong>
          <span class="pbn-completed-meta">%100 tamamlandı · ${formatCompletedDate(item.completedAt)}</span>
        </div>
        <div class="pbn-completed-actions">
          <button type="button" class="pbn-completed-btn pbn-completed-btn--view" data-view-id="${item.id}">Görüntüle</button>
          <button type="button" class="pbn-completed-btn pbn-completed-btn--download" data-download-id="${item.id}">İndir</button>
          <button type="button" class="pbn-completed-btn pbn-completed-btn--delete" data-delete-id="${item.id}" data-name="${name}">Sil</button>
        </div>
      </article>`;
    }).join("");

    grid.querySelectorAll("[data-view-id]").forEach((btn) => {
      btn.addEventListener("click", () => openCompleted(btn.dataset.viewId));
    });
    grid.querySelectorAll("[data-download-id]").forEach((btn) => {
      btn.addEventListener("click", () => downloadCompleted(btn.dataset.downloadId));
    });
    grid.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.deleteId, "completed", btn.dataset.name));
    });
  }

  async function openCompleted(id) {
    const record = await loadCompleted(id);
    if (!record) {
      pbnLog("openCompleted.missing", { id });
      renderCompletedGrid();
      return false;
    }
    currentProject = record;
    resultScreenOpening = false;
    viewingCompleted = true;
    showScreen("paint", "open-completed");
    // Tamamlanan eser bir "yarım iş" değildir: reload'da devam hedefi yapılmaz.
    clearActiveProject();

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
    return true;
  }

  async function downloadCompleted(id) {
    const record = await loadCompleted(id);
    if (!record) {
      renderCompletedGrid();
      return;
    }
    let blob = record.resultBlob || null;
    if (!blob && record.thumbnail) {
      // Eski/eksik kayıt için düşük çözünürlüklü thumbnail'den blob üret.
      try { blob = await (await fetch(record.thumbnail)).blob(); } catch { blob = null; }
    }
    if (!blob) {
      showAppError("Bu boyama indirilemedi.");
      return;
    }
    await shareOrDownloadBlob(blob, createPngFilename("tamamlanan-boyama"), { galleryIntent: true });
  }

  /* ---------- silme onay pop-up'ı ---------- */

  const deleteModalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDeleteModal();
    }
  };

  const deleteCopy = {
    recent: {
      title: "\u00c7al\u0131\u015fmay\u0131 Sil?",
      desc: "Bu yar\u0131m kalan boyama kal\u0131c\u0131 olarak silinecek. Bu i\u015flem geri al\u0131namaz. Silmek istedi\u011fine emin misin?",
      error: "G\u00f6rsel silinemedi. L\u00fctfen tekrar dene."
    },
    completed: {
      title: "Tamamlanan Boyamay\u0131 Sil?",
      desc: "Bu tamamlanan boyama kal\u0131c\u0131 olarak silinecek. Bu i\u015flem geri al\u0131namaz. Silmek istedi\u011fine emin misin?",
      error: "G\u00f6rsel silinemedi. L\u00fctfen tekrar dene."
    },
    visual: {
      title: "G\u00f6rseli Sil?",
      desc: "Bu g\u00f6rsel kal\u0131c\u0131 olarak silinecek. Bu i\u015flem geri al\u0131namaz. Silmek istedi\u011fine emin misin?",
      error: "G\u00f6rsel silinemedi. L\u00fctfen tekrar dene."
    }
  };

  function clearActiveProjectIfMatches(id) {
    if (!id) return;
    let activeId = null;
    try { activeId = localStorage.getItem("pbnActiveProjectId"); } catch { /* private mode */ }
    if (currentProject?.id === id || activeId === id) clearActiveProject();
  }

  function openDeleteModal(id, type = "visual", name = "") {
    if (!id) return;
    pendingDeleteId = id;
    pendingDeleteType = deleteCopy[type] ? type : "visual";
    pendingDeleteName = name || "";
    if (!deleteModalEl) return;
    const copy = deleteCopy[pendingDeleteType] || deleteCopy.visual;
    const title = deleteModalEl.querySelector("#pbnDeleteTitle");
    const desc = deleteModalEl.querySelector("#pbnDeleteDesc");
    if (title) title.textContent = copy.title;
    if (desc) desc.textContent = pendingDeleteName ? `"${pendingDeleteName}" - ${copy.desc}` : copy.desc;
    deleteModalEl.hidden = false;
    // Modal açıkken arka plan (tamamlananlar listesi) kaymasın.
    document.body.classList.add("pbn-modal-open");
    document.addEventListener("keydown", deleteModalKeydownHandler);
    // Yanlışlıkla silmeyi zorlaştır: odak "İptal" butonunda başlar.
    requestAnimationFrame(() => deleteModalEl.querySelector("#pbnDeleteCancel")?.focus());
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    pendingDeleteType = null;
    pendingDeleteName = "";
    if (deleteModalEl) deleteModalEl.hidden = true;
    document.body.classList.remove("pbn-modal-open");
    document.removeEventListener("keydown", deleteModalKeydownHandler);
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    const type = pendingDeleteType;
    const copy = deleteCopy[type] || deleteCopy.visual;
    closeDeleteModal();
    if (!id) return;
    try {
      if (type === "recent") {
        await deleteProject(id);
      } else if (type === "completed") {
        await deleteCompleted(id);
      } else {
        throw new Error(`Bilinmeyen silme tipi: ${type || "none"}`);
      }
      clearEmergencySnapshot(id);
      clearActiveProjectIfMatches(id);
      renderRecentGrid();
      renderCompletedGrid();
    } catch (error) {
      console.error("Görsel silinemedi:", error);
      showAppError(copy.error);
    }
  }

  function wireDeleteModal() {
    if (!deleteModalEl) return;
    // Dışarı (backdrop) tıklama = iptal; yanlışlıkla silme yapmaz.
    deleteModalEl.addEventListener("click", (event) => {
      if (event.target === deleteModalEl) closeDeleteModal();
    });
    deleteModalEl.querySelector("#pbnDeleteCancel")?.addEventListener("click", closeDeleteModal);
    deleteModalEl.querySelector("#pbnDeleteConfirm")?.addEventListener("click", confirmDelete);
  }

  /* ---------- analysis pipeline ---------- */

  function startAnalysisFromUrl(url, name, revokeAfterLoad) {
    showScreen("analysis", "start-analysis");
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
      pbnLog("img.onerror", { hasProject: Boolean(currentProject) });
      // Aktif/kaydedilmiş bir proje varken kullanıcıyı ekrandan atma (istek #3).
      if (currentProject) {
        showScreen("paint", "img-error-stay");
      } else {
        showScreen("home", "img-error");
      }
      showAppError("Görsel yüklenemedi. Lütfen başka bir görsel deneyin.");
      if (revokeAfterLoad) URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function processImage(img, fileName) {
    const preset = DIFFICULTY_PRESETS[currentDifficulty] || DIFFICULTY_PRESETS.normal;
    const targetWidth = preset.targetWidth || Math.round((preset.baseCols || 56) * DETAIL_WIDTH_SCALE);
    let cellSize = preset.cell;
    const srcW = img.naturalWidth || 1;
    const srcH = img.naturalHeight || 1;
    let w = targetWidth;
    let h = Math.min(
      Math.max(Math.round(targetWidth * (srcH / srcW)), cellSize * 8),
      Math.round(targetWidth * 1.5)
    );

    // iOS-güvenli tavan: DETAY (grid hücre sayısı) sabit kalır; yalnız her
    // hücrenin piksel boyutu (cellSize) küçültülür. Böylece region/renk sayısı
    // aynı kalırken tuval belleği düşer ve Safari sekmeyi öldürmez.
    const gridCols = Math.ceil(w / cellSize);
    const gridRows = Math.ceil(h / cellSize);
    const shrink = Math.min(
      1,
      MAX_CANVAS_DIM / Math.max(w, h),
      Math.sqrt(MAX_CANVAS_AREA / (w * h))
    );
    if (shrink < 1) {
      cellSize = Math.max(3, Math.floor(cellSize * shrink));
      w = gridCols * cellSize;
      h = gridRows * cellSize;
      pbnLog("processImage.shrink", { difficulty: currentDifficulty, cellSize, w, h, gridCols, gridRows });
    }

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
        pbnLog("worker.error", msg.message, { hasProject: Boolean(currentProject) });
        // Aktif proje varken ekrandan atma (istek #3).
        if (currentProject) {
          showScreen("paint", "worker-error-stay");
        } else {
          showScreen("home", "worker-error");
        }
        showAppError("Fotoğraf işlenirken bir hata oluştu. Lütfen başka bir fotoğraf deneyin.");
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

    showScreen("paint", "processing-done");
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
      progress: 0,
      selectedNumber: msg.palette[0]?.number ?? null,
      thumbnail: makeThumbnail()
    };
    resultScreenOpening = false;
    viewingCompleted = false;

    markActiveProject(id);
    renderPalette(msg.palette);
    updatePaletteChips();
    updateProgressUi();
    persistProject(true, "initial-project");
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

  let saveErrorShown = false;
  function doPersist(regenThumbnail) {
    // Tamamlanan eseri "Görüntüle" ile izlerken yarım işler deposuna yazma.
    if (!currentProject || viewingCompleted) return Promise.resolve();
    currentProject.paintedRegionIds = engine.getPaintedRegionIds();
    currentProject.updatedAt = Date.now();
    if (regenThumbnail) currentProject.thumbnail = makeThumbnail();
    return saveProject(currentProject).then(() => {
      pbnLog("doPersist.ok", { id: currentProject.id, painted: currentProject.paintedRegionIds.length });
    }).catch((error) => {
      console.error("Boyama kaydedilemedi:", error);
      pbnLog("doPersist.error", error);
      // Kayıt gerçekten başarısızsa kullanıcıyı bir kez uyar (sessiz veri kaybı olmasın).
      if (!saveErrorShown) {
        saveErrorShown = true;
        showAppError("İlerleme kaydedilemedi. Depolama dolu veya kapalı olabilir.");
      }
    });
  }

  // Her boya vuruşundan hemen sonra kaydedilir; setTimeout(0) sadece
  // aynı senkron tik içindeki ardışık çağrıları tek kayda birleştirir.
  function persistProject(regenThumbnail) {
    if (!currentProject) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => doPersist(regenThumbnail), 0);
  }

  // Koşulsuz son kayıt: bekleyen timer olmasa da güncel durumu yaz. iOS'ta
  // pagehide/visibilitychange, sekme öldürülmeden önceki tek garanti fırsat.
  function flushPersist() {
    if (!currentProject) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    pbnLog("flushPersist");
    doPersist(false);
  }
  const visibilityHandler = () => {
    if (document.visibilityState === "hidden") {
      pbnLog("visibilitychange", "hidden");
      flushPersist();
    }
  };
  const pageHideHandler = () => {
    pbnLog("pagehide");
    flushPersist();
  };
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("pagehide", pageHideHandler);

  let saveInFlight = false;
  let saveAgainAfterCurrent = false;
  let lastSavePromise = Promise.resolve(false);
  let lastProjectUpdatedAt = 0;

  function nextProjectUpdatedAt() {
    const currentUpdatedAt = Number(currentProject?.updatedAt) || 0;
    lastProjectUpdatedAt = Math.max(Date.now(), currentUpdatedAt, lastProjectUpdatedAt + 1);
    return lastProjectUpdatedAt;
  }

  function getCurrentProgressPercent() {
    return Number(engine?.getProgress?.() ?? currentProject?.progress ?? 0);
  }

  function buildProjectSaveRecord({ regenThumbnail = false } = {}) {
    if (!currentProject || !engine || viewingCompleted || currentProject.completed) return null;
    const paintedRegionIds = engine.getPaintedRegionIds();
    currentProject.paintedRegionIds = paintedRegionIds;
    currentProject.updatedAt = nextProjectUpdatedAt();
    currentProject.progress = getCurrentProgressPercent();
    currentProject.selectedNumber = engine.getSelectedNumber?.() ?? currentProject.selectedNumber ?? null;
    if (regenThumbnail) currentProject.thumbnail = makeThumbnail();

    return {
      ...currentProject,
      paintedRegionIds: [...paintedRegionIds]
    };
  }

  async function verifyProjectSaved(record) {
    const saved = await loadProject(record.id);
    const savedCount = saved?.paintedRegionIds?.length || 0;
    const expectedCount = record.paintedRegionIds?.length || 0;
    if (!saved || saved.updatedAt !== record.updatedAt || savedCount !== expectedCount) {
      throw new Error(`IndexedDB verification failed for ${record.id}`);
    }
  }

  async function runSaveQueue(reason, firstRecord) {
    let nextReason = reason;
    let record = firstRecord;
    try {
      while (record) {
        saveAgainAfterCurrent = false;
        console.warn("[PBN SAVE DEBUG] save start", {
          projectId: record?.id,
          paintedCount: record?.paintedRegionIds?.length
        });
        await saveProject(record);
        await verifyProjectSaved(record);
        console.warn("[PBN SAVE DEBUG] save success", {
          projectId: record?.id,
          paintedCount: record?.paintedRegionIds?.length
        });
        pbnLog("saveProjectNow.ok", { reason: nextReason, id: record.id, painted: record.paintedRegionIds.length });

        if (!saveAgainAfterCurrent) return true;
        nextReason = "queued-after-current";
        record = buildProjectSaveRecord({ regenThumbnail: false });
        if (record) writeEmergencySnapshot(record);
      }
      return false;
    } catch (error) {
      console.error("[PBN SAVE] failed", nextReason, error);
      pbnLog("saveProjectNow.error", { reason: nextReason, error });
      if (!saveErrorShown) {
        saveErrorShown = true;
        showAppError("Ilerleme kaydedilemedi. Lutfen sayfayi kapatmadan tekrar deneyin.");
      }
      return false;
    } finally {
      saveInFlight = false;
    }
  }

  function saveProjectNow(reason = "unknown", options = {}) {
    if (!currentProject || !engine || viewingCompleted || currentProject.completed) return Promise.resolve(false);
    clearTimeout(saveTimer);
    saveTimer = null;

    const record = buildProjectSaveRecord({ regenThumbnail: Boolean(options.regenThumbnail) });
    if (!record) return Promise.resolve(false);
    writeEmergencySnapshot(record);

    if (saveInFlight) {
      saveAgainAfterCurrent = true;
      return lastSavePromise;
    }

    saveInFlight = true;
    lastSavePromise = runSaveQueue(reason, record);
    return lastSavePromise;
  }

  function persistProject(regenThumbnail, reason = "persist") {
    return saveProjectNow(reason, { regenThumbnail });
  }

  function doPersist(regenThumbnail) {
    return saveProjectNow("legacy-doPersist", { regenThumbnail });
  }

  function saveLight(reason = "light") {
    return saveProjectNow(reason, { regenThumbnail: false });
  }

  function flushSaveImmediately(reason = "flush", options = {}) {
    pbnLog("flushSaveImmediately", { reason });
    return saveProjectNow(reason, options);
  }

  function flushPersist() {
    return flushSaveImmediately("legacy-flush");
  }

  const beforeUnloadHandler = () => {
    pbnLog("beforeunload");
    flushSaveImmediately("beforeunload");
  };
  const blurHandler = () => {
    pbnLog("blur");
    flushSaveImmediately("blur");
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);
  window.addEventListener("blur", blurHandler);

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
        const selected = Number(chip.dataset.number);
        engine.selectNumber(selected);
        highlightPaletteNumber(selected);
        if (currentProject && !viewingCompleted) {
          currentProject.selectedNumber = selected;
          saveLight("color-select");
        }
      });
    });

    const firstNumber = palette[0]?.number;
    const savedNumber = Number(currentProject?.selectedNumber);
    const selectedNumber = palette.some((item) => item.number === savedNumber) ? savedNumber : firstNumber;
    if (selectedNumber != null) {
      engine.selectNumber(selectedNumber);
      highlightPaletteNumber(selectedNumber);
    }
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

  let inlineToastTimer = null;
  function showInlinePaintToast(message) {
    const toast = root.querySelector("#pbnInlineToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(inlineToastTimer);
    inlineToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
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
        console.warn("[PBN SAVE DEBUG] paint event", {
          projectId: currentProject?.id,
          paintedCount: engine?.getPaintedRegionIds?.().length
        });
        updateProgressUi();
        updatePaletteChips();
        autoAdvanceIfComplete();
        if (engine.isComplete()) {
          showResultScreen();
        } else {
          persistProject(false, "paint");
        }
      } else if (event.type === "wrong") {
        viewport.classList.add("is-shaking");
        setTimeout(() => viewport.classList.remove("is-shaking"), 320);
      } else if (event.type === "redo") {
        updateProgressUi();
        updatePaletteChips();
        autoAdvanceIfComplete();
        if (engine.isComplete()) {
          showResultScreen();
        } else {
          persistProject(false, "redo");
        }
      } else {
        updateProgressUi();
        updatePaletteChips();
        persistProject(false, event.type || "change");
      }
    });

    root.querySelector("#pbnBackBtn").addEventListener("click", () => {
      // Küçük resmi tazeleyerek son durumu hemen (senkron) yaz.
      // (viewingCompleted iken doPersist erken döner, tekrar yazmaz.)
      clearTimeout(saveTimer);
      saveTimer = null;
      if (currentProject) doPersist(true);
      clearActiveProject();
      viewingCompleted = false;
      showScreen("home", "back-button");
      renderRecentGrid();
      renderCompletedGrid();
    });
    root.querySelector("#pbnUndoBtn").addEventListener("click", () => engine.undo());
    root.querySelector("#pbnRedoBtn").addEventListener("click", () => engine.redo());
    root.querySelector(".pbn-screen-paint").addEventListener("wheel", (event) => {
      if (!root.querySelector(".pbn-screen-paint.is-active")) return;
      if (event.target?.closest?.(".pbn-canvas-viewport")) return;
      if (event.target?.closest?.(".pbn-paint-header, .pbn-palette-dock, .pbn-paint-menu, button, input, select, textarea")) return;
      engine.handleWheelZoom(event);
    }, { passive: false, capture: true });
    root.querySelector("#pbnHintBtn").addEventListener("click", () => {
      const selected = engine.getSelectedNumber();
      if (selected == null) {
        showInlinePaintToast("Önce bir renk seç");
        return;
      }
      const result = engine.showColorHint(selected);
      if (!result.ok) {
        showInlinePaintToast(
          result.reason === "complete" ? "Bu renk zaten tamamlandı" : "Önce bir renk seç"
        );
      }
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
    root.querySelector("#pbnMenuSaveGallery").addEventListener("click", async () => {
      closePaintMenu();
      // Mobil tarayıcılar galeriye doğrudan yazamaz; PNG dosyası sistem paylaşımına verilir.
      const blob = await engine.exportPaintedBlob();
      await shareOrDownloadBlob(blob, createPngFilename("boyama-galeri"), { galleryIntent: true });
    });
    root.querySelector("#pbnMenuNewPhoto").addEventListener("click", () => {
      closePaintMenu();
      flushSaveImmediately("new-photo", { regenThumbnail: true });
      root.querySelector("#pbnFileInput").click();
    });
  }

  /* ---------- result ---------- */

  async function showResultScreen(completionSavePromise = null) {
    if (resultScreenOpening) return;
    resultScreenOpening = true;
    clearTimeout(saveTimer); // bekleyen proje kaydı iptal — eser tamamlandı
    saveTimer = null;
    const completionSave = completionSavePromise || flushSaveImmediately("complete-before-result");
    const resultImg = root.querySelector("#pbnResultImage");
    resultImg.src = engine.exportPaintedDataUrl();
    resultBlob = null;
    resultBlobPromise = null;
    const shareBtn = root.querySelector("#pbnShareResultBtn");
    if (shareBtn) {
      shareBtn.disabled = true;
      shareBtn.textContent = "PNG hazırlanıyor...";
    }
    spawnConfetti();
    clearActiveProject();
    showScreen("result", "complete");

    // Blob ekrana girerken hazırlanır: paylaş butonunda iOS'un kullanıcı
    // jesti süresi dolmadan navigator.share çağrılabilsin.
    resultBlobPromise = engine.exportPaintedBlob();
    resultBlob = await resultBlobPromise;
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.textContent = phoneSaveCopy.label;
    }

    if (currentProject) {
      try {
        // Eser %100 bitti: "Tamamlanan Boyamalar" kategorisine arşivle.
        await completionSave;
        const completedProjectId = currentProject.id;
        currentProject.paintedRegionIds = engine.getPaintedRegionIds();
        currentProject.completed = true;
        currentProject.completedAt = Date.now();
        currentProject.progress = 100;
        const completedRecord = {
          ...currentProject,
          // Kart için boyanmış (bitmiş) küçük resim; tuval şu an tam boyalı.
          thumbnail: makeThumbnail(),
          // Doğrudan tekrar indirme için tam çözünürlüklü boyanmış PNG.
          resultBlob: resultBlob || null
        };
        await saveCompleted(completedRecord);
        // Tamamlanan iş artık yarım işler (Son çalışmalar) listesinde durmaz.
        await deleteProject(completedProjectId);
        clearEmergencySnapshot(completedProjectId);
        currentProject = null;
        renderRecentGrid();
        renderCompletedGrid();
      } catch (error) {
        console.error("Tamamlanan çalışma arşivlenemedi:", error);
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

  function createPngFilename(prefix) {
    return `${prefix}-${Date.now()}.png`;
  }

  function applyPhoneSaveLabels() {
    root.querySelectorAll("[data-phone-save-label]").forEach((item) => {
      item.textContent = phoneSaveCopy.label;
    });
  }

  // Paylaşım zinciri: dosyalı navigator.share (mobil paylaşım sayfasından
  // "Fotoğraflara kaydet" çıkar) → desteklenmiyorsa indirme.
  async function shareOrDownloadBlob(blob, filename, options = {}) {
    if (!blob) return false;
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Boyama Eserim",
          text: "PNG kalitesinde boyama eserim"
        });
        return true;
      } catch (error) {
        if (error?.name === "AbortError") return false; // kullanıcı vazgeçti
        console.warn("PNG paylaşımı açılamadı, indirme fallback'i kullanılıyor:", error);
      }
    }
    downloadBlob(blob, filename);
    if (options.galleryIntent) {
      alert(phoneSaveCopy.fallbackMessage);
    }
    return false;
  }

  function wireResultScreen() {
    root.querySelector("#pbnShareResultBtn").addEventListener("click", async () => {
      const blob = resultBlob || await resultBlobPromise;
      await shareOrDownloadBlob(blob, createPngFilename("boyama-galeri"), { galleryIntent: true });
    });
    root.querySelector("#pbnNewFromResultBtn").addEventListener("click", () => {
      viewingCompleted = false;
      showScreen("home", "new-from-result");
      renderRecentGrid();
      renderCompletedGrid();
      root.querySelector("#pbnFileInput").click();
    });
  }

  // Manual resume: oyun-page passes resumeProjectId after the user clicks Devam Et.
  // resumeReady resolves when that manual resume attempt finishes.
  let resolveResumeReady;
  const resumeReady = new Promise((resolve) => { resolveResumeReady = resolve; });
  if (options.resumeProjectId) {
    resumeProject(options.resumeProjectId)
      .then((ok) => { pbnLog("boyama.resumeDone", { id: options.resumeProjectId, ok }); resolveResumeReady(Boolean(ok)); })
      .catch((error) => { pbnLog("boyama.resumeFail", error); resolveResumeReady(false); });
  } else {
    resolveResumeReady(false);
  }
  // Kept as a local page-level resume hook while the Boyama view is mounted.
  window.__pbnResumeProject = (id) => resumeProject(id);

  return {
    resumeReady,
    cleanup() {
      pbnLog("boyama.cleanup");
      const cleanupSave = flushSaveImmediately("cleanup-before-destroy", { regenThumbnail: true });
      engine?.destroy();
      if (activeWorker) { activeWorker.terminate(); activeWorker = null; }
      clearTimeout(saveTimer);
      clearTimeout(inlineToastTimer);
      document.removeEventListener("click", documentClickHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      document.removeEventListener("keydown", deleteModalKeydownHandler);
      // Body'ye taşınan modal düğümünü ve scroll-lock'u temizle (sızıntı olmasın).
      document.body.classList.remove("pbn-modal-open");
      deleteModalEl?.remove();
      window.removeEventListener("pagehide", pageHideHandler);
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      window.removeEventListener("blur", blurHandler);
      if (window.__pbnResumeProject) delete window.__pbnResumeProject;
      return cleanupSave;
    }
  };
}
