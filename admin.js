import { db } from "./firebase-config.js";
import { ensureAdminAccess, clearAdminSession } from "./admin-guard.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const BLOCK_TYPES = [
  { value: "paragraph", label: "Paragraf" },
  { value: "heading", label: "Alt Başlık" },
  { value: "info", label: "Bilgi Kutusu (mavi)" },
  { value: "warning", label: "Uyarı (sarı)" },
  { value: "formula", label: "Formül (pembe)" },
  { value: "customHTML", label: "Özel HTML" }
];

const ID_PATTERN = /^[a-z0-9_-]+$/i;

const state = {
  general: {},
  dashboard: { stats: [], cards: [] },
  nav: [],
  pages: [],
  quizzes: {},
  visits: [],
  filteredVisits: [],
  activePageIndex: null,
  deletedPageIds: new Set(),
  deletedQuizIds: new Set(),
  pendingRenames: {},
  unsaved: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function setStatus(text, type = "normal") {
  const badge = $("#statusBadge");
  if (!badge) return;
  badge.textContent = text;
  badge.className = `status-badge ${type === "normal" ? "" : type}`.trim();
}

function showToast(message, type = "info") {
  const host = $("#toastHost");
  if (!host) return;
  const node = document.createElement("div");
  node.className = `toast toast-${type}`;
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => node.classList.add("toast-out"), 2400);
  setTimeout(() => node.remove(), 2900);
}

function markUnsaved() {
  state.unsaved = true;
  setStatus("Kaydedilmemiş değişiklik var", "warning");
}

function safe(value = "") {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[char]);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") return new Date(value);
  if (value.seconds) return new Date(value.seconds * 1000);
  return null;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function formatRelative(value) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  return `${days} gün önce`;
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getVisitDateKey(visit) {
  const date = toDate(visit.createdAt) || toDate(visit.clientCreatedAt);
  return date ? todayKey(date) : "";
}

function activateTab(tabId) {
  $$(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tabId}`));
  const activeBtn = $(`.tab-btn[data-tab="${tabId}"]`);
  $("#panelTitle").textContent = activeBtn ? activeBtn.textContent.trim() : "Panel";
  closeMobileSidebar();
}

function openMobileSidebar() {
  if (window.innerWidth > 900) return;
  $("#adminSidebar")?.classList.add("is-open");
  const scrim = $("#sidebarScrim");
  if (scrim) scrim.hidden = false;
  document.body.classList.add("no-scroll");
}

function closeMobileSidebar() {
  $("#adminSidebar")?.classList.remove("is-open");
  const scrim = $("#sidebarScrim");
  if (scrim) scrim.hidden = true;
  document.body.classList.remove("no-scroll");
}

async function loadAdminData() {
  setStatus("Veriler yükleniyor…", "warning");
  try {
    const [generalSnap, dashboardSnap, navSnap, pagesSnap, quizzesSnap, visitsSnap] = await Promise.all([
      getDoc(doc(db, "system", "general")),
      getDoc(doc(db, "system", "dashboard")),
      getDoc(doc(db, "system", "navigation")),
      getDocs(collection(db, "pages")),
      getDocs(collection(db, "quizzes")),
      getDocs(query(collection(db, "user_visits"), orderBy("createdAt", "desc"), limit(250)))
    ]);

    state.general = generalSnap.exists() ? generalSnap.data() : {};
    state.dashboard = dashboardSnap.exists() ? dashboardSnap.data() : { stats: [], cards: [] };
    state.nav = navSnap.exists() ? (navSnap.data().items || []) : [];
    state.pages = [];
    pagesSnap.forEach((snap) => state.pages.push({ id: snap.id, ...snap.data() }));
    state.pages.sort((a, b) => (a.order || 0) - (b.order || 0));
    state.quizzes = {};
    quizzesSnap.forEach((snap) => { state.quizzes[snap.id] = snap.data().questions || []; });
    state.visits = [];
    visitsSnap.forEach((snap) => state.visits.push({ firestoreId: snap.id, ...snap.data() }));

    state.deletedPageIds.clear();
    state.deletedQuizIds.clear();
    state.pendingRenames = {};
    state.unsaved = false;
    state.activePageIndex = null;

    renderAll();
    setStatus("Veriler yüklendi", "success");
  } catch (error) {
    console.error(error);
    setStatus("Veri yükleme hatası", "error");
    showToast("Veri yüklenemedi. Konsolu kontrol et.", "error");
  }
}

function renderAll() {
  populateSettings();
  renderOverview();
  renderVisitTable();
  renderPagesList();
  renderEmptyEditor();
  renderDashboardEditor();
}

function renderEmptyEditor() {
  $("#emptyEditor").hidden = state.activePageIndex !== null;
  $("#pageEditor").hidden = state.activePageIndex === null;
}

function populateSettings() {
  const g = state.general || {};
  $("#generalSiteTitle").value = g.siteTitle || "";
  $("#generalSubtitle").value = g.siteSubtitle || "";
  $("#generalBadge").value = g.topbarBadge || "";
  $("#generalFooter").value = g.footerText || "";
  $("#generalHeroTitle").value = g.heroTitle || "";
  $("#generalHeroDesc").value = g.heroDesc || "";
  const t = g.themeTokens || {};
  $("#themeNavy").value = t.navy || "#1a2850";
  $("#themePink").value = t.pink || "#d4669c";
  $("#themePinkBright").value = t["pink-bright"] || "#e879a0";
  $("#themeBg").value = t.bg || "#f6f4fb";
}

function renderOverview() {
  const visits = state.visits || [];
  const today = todayKey();
  const todayVisits = visits.filter((v) => getVisitDateKey(v) === today).length;
  const mobileCount = visits.filter((v) => ["Mobil", "Tablet"].includes(v.deviceType)).length;
  const rate = visits.length ? Math.round((mobileCount / visits.length) * 100) : 0;
  const deviceCounts = countBy(visits, (v) => v.deviceModel || v.os || "Bilinmeyen");
  const topDevice = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  $("#metricTotalVisits").textContent = visits.length;
  $("#metricTodayVisits").textContent = todayVisits;
  $("#metricMobileRate").textContent = `${rate}%`;
  $("#metricTopDevice").textContent = topDevice;

  $("#latestVisits").innerHTML = visits.slice(0, 6).map((v) => `
    <div class="latest-item">
      <div class="latest-item-main">
        <strong>${safe(v.deviceModel || v.os || "Bilinmeyen cihaz")}</strong>
        <span>${safe(v.os || "-")} • ${safe(v.browser || "-")} • ${safe(v.deviceType || "-")}</span>
      </div>
      <div class="latest-item-meta">
        <span>${safe(formatDate(v.createdAt || v.clientCreatedAt))}</span>
        <small>${safe(formatRelative(v.createdAt || v.clientCreatedAt))}</small>
      </div>
    </div>
  `).join("") || `<div class="latest-item empty"><span>Henüz giriş kaydı yok. Site açıldığında otomatik düşer.</span></div>`;

  const typeCounts = countBy(visits, (v) => v.deviceType || "Bilinmeyen");
  const total = visits.length || 1;
  $("#deviceBreakdown").innerHTML = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => {
      const pct = Math.round((count / total) * 100);
      return `<div class="breakdown-item">
        <div><strong>${safe(type)}</strong> <span>${count} kayıt • ${pct}%</span></div>
        <div class="breakdown-bar"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join("") || `<div class="breakdown-item empty"><span>Veri bekleniyor.</span></div>`;
}

function countBy(list, getter) {
  return list.reduce((acc, item) => {
    const key = getter(item) || "Bilinmeyen";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getAccuracyLabel(visit) {
  const value = visit.modelAccuracy || "";
  if (value === "browser-provided" || value === "automatic-exact-or-browser-provided") return "Tarayıcı verdi";
  if (value === "estimated-screen-group" || value === "estimated") return "Ekran/DPR tahmini";
  if (value === "user-agent-estimated") return "User-Agent tahmini";
  if (value === "automatic") return "Otomatik";
  if (value === "confirmed-by-user") return "Kullanıcı seçmiş";
  return value || "Otomatik";
}

function getAccuracyClass(visit) {
  const value = visit.modelAccuracy || "";
  if (value === "browser-provided" || value === "automatic-exact-or-browser-provided" || value === "confirmed-by-user") return "confirmed";
  if (value === "estimated-screen-group" || value === "estimated" || value === "user-agent-estimated") return "estimated";
  return "auto";
}

function getFilteredVisits() {
  const search = ($("#visitSearch")?.value || "").toLowerCase().trim();
  const type = $("#visitTypeFilter")?.value || "all";
  return (state.visits || []).filter((visit) => {
    const blob = [
      visit.deviceModel, visit.confirmedModel, visit.automaticDeviceModel,
      visit.os, visit.browser, visit.deviceType, visit.modelAccuracy,
      visit.pagePath, visit.userAgent, visit.visitorId, visit.sessionId
    ].join(" ").toLowerCase();
    const matchesSearch = !search || blob.includes(search);
    const matchesType = type === "all" || visit.deviceType === type;
    return matchesSearch && matchesType;
  });
}

function renderVisitTable() {
  const body = $("#visitTableBody");
  if (!body) return;
  const visits = getFilteredVisits();
  state.filteredVisits = visits;

  const meta = $("#visitsMeta");
  if (meta) {
    meta.textContent = `${visits.length} kayıt gösteriliyor (toplam ${state.visits.length})`;
  }

  body.innerHTML = visits.map((v, index) => {
    const screen = v.screen ? `${v.screen.width || "?"}×${v.screen.height || "?"} <small>DPR ${v.screen.dpr || 1}</small>` : "-";
    const autoModel = v.automaticDeviceModel && v.automaticDeviceModel !== v.deviceModel
      ? `<small>Otomatik: ${safe(v.automaticDeviceModel)}</small>`
      : `<small>Otomatik analiz</small>`;
    return `
    <tr>
      <td data-label="Tarih">${safe(formatDate(v.createdAt || v.clientCreatedAt))}<small>${safe(formatRelative(v.createdAt || v.clientCreatedAt))}</small></td>
      <td data-label="Cihaz"><strong>${safe(v.deviceModel || "Bilinmeyen")}</strong>${autoModel}</td>
      <td data-label="Doğruluk"><span class="accuracy-pill ${getAccuracyClass(v)}">${safe(getAccuracyLabel(v))}</span></td>
      <td data-label="Tür"><span class="table-pill">${safe(v.deviceType || "-")}</span></td>
      <td data-label="OS">${safe(v.os || "-")}</td>
      <td data-label="Tarayıcı">${safe(v.browser || "-")}</td>
      <td data-label="Ekran">${screen}</td>
      <td data-label="Sayfa"><span class="path-cell">${safe(v.pagePath || "-")}</span></td>
      <td data-label="Detay"><button class="detail-link" data-visit-index="${index}" type="button">Detayı Aç</button></td>
    </tr>
  `;
  }).join("") || `<tr><td colspan="9" class="empty-row">Kayıt bulunamadı. Filtre temizle veya site açılana kadar bekle.</td></tr>`;
}

function renderPagesList() {
  const list = $("#pagesList");
  if (!list) return;
  list.innerHTML = state.pages.map((page, index) => `
    <div class="page-item ${index === state.activePageIndex ? "active" : ""}" data-page-index="${index}">
      <button class="page-item-main" data-page-index="${index}" type="button">
        <strong>${safe(page.icon || "📄")} ${safe(page.title || "Başlıksız")}</strong>
        <small>${safe(page.id || "-")} ${page.unitBadge ? `• ${safe(page.unitBadge)}` : ""}</small>
      </button>
      <div class="page-item-tools">
        <button class="icon-btn" data-page-move="up" data-page-index="${index}" type="button" aria-label="Yukarı taşı" title="Yukarı taşı">↑</button>
        <button class="icon-btn" data-page-move="down" data-page-index="${index}" type="button" aria-label="Aşağı taşı" title="Aşağı taşı">↓</button>
      </div>
    </div>
  `).join("") || `<div class="page-item empty"><span><strong>Sayfa yok</strong><small>+ Yeni butonu ile ilk konuyu ekle.</small></span></div>`;
}

function openPageEditor(index) {
  saveEditorToState();
  state.activePageIndex = index;
  renderPagesList();
  const page = state.pages[index];
  if (!page) {
    renderEmptyEditor();
    return;
  }
  page.blocks = page.blocks || [];
  if (!state.quizzes[page.id]) state.quizzes[page.id] = page.quiz || [];
  $("#emptyEditor").hidden = true;
  $("#pageEditor").hidden = false;
  $("#pageIdInput").value = page.id || "";
  $("#pageTitleInput").value = page.title || "";
  $("#pageIconInput").value = page.icon || "";
  $("#pageBadgeInput").value = page.unitBadge || page.unit || "";
  $("#pageDescInput").value = page.desc || page.subtitle || "";
  renderBlocks(page.blocks);
  renderQuiz(state.quizzes[page.id]);
}

function renderBlocks(blocks = []) {
  $("#blocksContainer").innerHTML = blocks.map((block, index) => {
    const typeOptions = BLOCK_TYPES.map((bt) =>
      `<option value="${bt.value}" ${block.type === bt.value ? "selected" : ""}>${bt.label}</option>`
    ).join("");
    return `
    <div class="block-item editor-block" data-block-index="${index}">
      <div class="block-head">
        <span class="block-index">#${index + 1}</span>
        <label class="block-type-label">
          <span>Blok türü</span>
          <select class="block-type">${typeOptions}</select>
        </label>
        <div class="block-tools">
          <button class="icon-btn" data-block-move="up" data-block-index="${index}" type="button" aria-label="Yukarı taşı" title="Yukarı">↑</button>
          <button class="icon-btn" data-block-move="down" data-block-index="${index}" type="button" aria-label="Aşağı taşı" title="Aşağı">↓</button>
          <button class="block-remove" data-remove-block="${index}" type="button">Sil</button>
        </div>
      </div>
      <label class="block-content-label">
        <span>İçerik</span>
        <textarea class="block-content" rows="4" placeholder="Bu bloğun metni veya HTML içeriği">${safe(block.content || "")}</textarea>
      </label>
    </div>
  `;
  }).join("") || `<div class="block-item empty"><span>Henüz blok yok. <strong>+ Blok</strong> ile ekle.</span></div>`;
}

function renderQuiz(questions = []) {
  $("#quizContainer").innerHTML = questions.map((q, index) => {
    const opts = q.options || [q.a || "", q.b || "", q.c || ""];
    const correct = typeof q.answer === "number"
      ? q.answer
      : (q.correct === "c" ? 2 : q.correct === "b" ? 1 : 0);
    return `
      <div class="block-item editor-quiz" data-quiz-index="${index}">
        <div class="block-head">
          <span class="block-index">Soru ${index + 1}</span>
          <label class="block-type-label">
            <span>Doğru cevap</span>
            <select class="quiz-answer">
              <option value="0" ${correct === 0 ? "selected" : ""}>A doğru</option>
              <option value="1" ${correct === 1 ? "selected" : ""}>B doğru</option>
              <option value="2" ${correct === 2 ? "selected" : ""}>C doğru</option>
            </select>
          </label>
          <div class="block-tools">
            <button class="icon-btn" data-quiz-move="up" data-quiz-index="${index}" type="button" aria-label="Yukarı taşı" title="Yukarı">↑</button>
            <button class="icon-btn" data-quiz-move="down" data-quiz-index="${index}" type="button" aria-label="Aşağı taşı" title="Aşağı">↓</button>
            <button class="block-remove" data-remove-quiz="${index}" type="button">Sil</button>
          </div>
        </div>
        <div class="quiz-grid">
          <label class="form-field full">Soru
            <input class="quiz-question" type="text" value="${safe(q.question || "")}" placeholder="Soru metni">
          </label>
          <label class="form-field">A şıkkı
            <input class="quiz-opt-a" type="text" value="${safe(opts[0] || "")}" placeholder="A">
          </label>
          <label class="form-field">B şıkkı
            <input class="quiz-opt-b" type="text" value="${safe(opts[1] || "")}" placeholder="B">
          </label>
          <label class="form-field">C şıkkı (opsiyonel)
            <input class="quiz-opt-c" type="text" value="${safe(opts[2] || "")}" placeholder="C — boş bırakılabilir">
          </label>
          <label class="form-field full">Açıklama
            <input class="quiz-explanation" type="text" value="${safe(q.explanation || "")}" placeholder="Doğru cevap sonrası gösterilecek açıklama">
          </label>
        </div>
      </div>
    `;
  }).join("") || `<div class="block-item empty"><span>Henüz soru yok. <strong>+ Soru</strong> ile ekle.</span></div>`;
}

function saveEditorToState() {
  if (state.activePageIndex === null || !state.pages[state.activePageIndex] || $("#pageEditor")?.hidden) return;
  const page = state.pages[state.activePageIndex];
  const oldId = page.id;
  const newIdRaw = $("#pageIdInput").value.trim();
  const newId = newIdRaw || oldId;

  if (newId !== oldId) {
    if (!ID_PATTERN.test(newId)) {
      showToast(`Geçersiz sayfa ID: "${newId}". Sadece harf/rakam/-/_ kullan.`, "error");
      $("#pageIdInput").value = oldId;
    } else if (state.pages.some((p, i) => i !== state.activePageIndex && p.id === newId)) {
      showToast(`"${newId}" ID'si zaten başka bir sayfada kullanılıyor.`, "error");
      $("#pageIdInput").value = oldId;
    } else {
      state.pendingRenames[oldId] = newId;
      page.id = newId;
      if (state.quizzes[oldId]) {
        state.quizzes[newId] = state.quizzes[oldId];
        delete state.quizzes[oldId];
      }
    }
  }

  page.title = $("#pageTitleInput").value.trim();
  page.icon = $("#pageIconInput").value.trim();
  page.unitBadge = $("#pageBadgeInput").value.trim();
  page.desc = $("#pageDescInput").value.trim();
  page.order = state.activePageIndex;

  page.blocks = $$("#blocksContainer .editor-block").map((el) => ({
    type: el.querySelector(".block-type")?.value || "paragraph",
    content: el.querySelector(".block-content")?.value || ""
  }));

  state.quizzes[page.id] = $$("#quizContainer .editor-quiz").map((el) => ({
    question: el.querySelector(".quiz-question")?.value || "",
    options: [
      el.querySelector(".quiz-opt-a")?.value || "",
      el.querySelector(".quiz-opt-b")?.value || "",
      el.querySelector(".quiz-opt-c")?.value || ""
    ].filter(Boolean),
    answer: Number(el.querySelector(".quiz-answer")?.value || 0),
    explanation: el.querySelector(".quiz-explanation")?.value || ""
  }));
}

function renderDashboardEditor() {
  const stats = state.dashboard.stats || [];
  $("#statsContainer").innerHTML = stats.map((stat, index) => `
    <div class="block-item editor-block" data-stat-index="${index}">
      <div class="block-head">
        <span class="block-index">İstatistik ${index + 1}</span>
        <div class="block-tools">
          <button class="block-remove" data-remove-stat="${index}" type="button">Sil</button>
        </div>
      </div>
      <div class="quiz-grid">
        <label class="form-field">Değer
          <input class="stat-value" value="${safe(stat.value || "0")}" placeholder="örn: 120+">
        </label>
        <label class="form-field">Etiket
          <input class="stat-label" value="${safe(stat.label || "Etiket")}" placeholder="örn: Aktif Öğrenci">
        </label>
      </div>
    </div>
  `).join("") || `<div class="block-item empty"><span>Henüz istatistik yok. <strong>+ İstatistik</strong> ekle.</span></div>`;

  const cards = state.dashboard.cards || [];
  $("#dashCardsContainer").innerHTML = cards.map((card, index) => `
    <div class="block-item editor-block" data-card-index="${index}">
      <div class="block-head">
        <span class="block-index">Kart ${index + 1}</span>
        <div class="block-tools">
          <button class="block-remove" data-remove-card="${index}" type="button">Sil</button>
        </div>
      </div>
      <div class="quiz-grid">
        <label class="form-field">Bağlı pageId
          <input class="dash-page" value="${safe(card.pageId || "")}" placeholder="örn: unit1a">
        </label>
        <label class="form-field">İkon
          <input class="dash-icon" value="${safe(card.icon || "✨")}" placeholder="✨" maxlength="4">
        </label>
        <label class="form-field full">Başlık
          <input class="dash-title" value="${safe(card.title || "Başlık")}" placeholder="Kart başlığı">
        </label>
        <label class="form-field full">Açıklama
          <input class="dash-desc" value="${safe(card.desc || "")}" placeholder="Kart altındaki kısa açıklama">
        </label>
      </div>
    </div>
  `).join("") || `<div class="block-item empty"><span>Henüz yönlendirme kartı yok.</span></div>`;
}

function saveDashboardEditorToState() {
  state.dashboard.stats = $$("#statsContainer [data-stat-index]").map((el) => ({
    value: el.querySelector(".stat-value")?.value || "0",
    label: el.querySelector(".stat-label")?.value || "Etiket"
  }));
  state.dashboard.cards = $$("#dashCardsContainer [data-card-index]").map((el) => ({
    pageId: el.querySelector(".dash-page")?.value || "",
    icon: el.querySelector(".dash-icon")?.value || "✨",
    title: el.querySelector(".dash-title")?.value || "Başlık",
    desc: el.querySelector(".dash-desc")?.value || ""
  }));
}

async function saveAll() {
  setStatus("Kaydediliyor…", "warning");
  saveEditorToState();
  saveDashboardEditorToState();

  state.general.siteTitle = $("#generalSiteTitle").value;
  state.general.siteSubtitle = $("#generalSubtitle").value;
  state.general.topbarBadge = $("#generalBadge").value;
  state.general.footerText = $("#generalFooter").value;
  state.general.heroTitle = $("#generalHeroTitle").value;
  state.general.heroDesc = $("#generalHeroDesc").value;
  state.general.themeTokens = {
    navy: $("#themeNavy").value,
    pink: $("#themePink").value,
    "pink-bright": $("#themePinkBright").value,
    bg: $("#themeBg").value
  };
  state.general.updatedAt = serverTimestamp();
  state.nav = state.pages.map((page, index) => ({
    pageId: page.id,
    title: page.title,
    icon: page.icon,
    visible: true,
    order: index
  }));

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "system", "general"), state.general, { merge: true });
    batch.set(doc(db, "system", "dashboard"), state.dashboard, { merge: true });
    batch.set(doc(db, "system", "navigation"), { items: state.nav, updatedAt: serverTimestamp() }, { merge: true });

    state.pages.forEach((page, index) => {
      batch.set(doc(db, "pages", page.id), { ...page, order: index, updatedAt: serverTimestamp() }, { merge: true });
    });

    Object.keys(state.quizzes).forEach((id) => {
      batch.set(doc(db, "quizzes", id), { questions: state.quizzes[id], updatedAt: serverTimestamp() }, { merge: true });
    });

    Object.entries(state.pendingRenames).forEach(([oldId, newId]) => {
      if (oldId && oldId !== newId) {
        batch.delete(doc(db, "pages", oldId));
        batch.delete(doc(db, "quizzes", oldId));
      }
    });

    state.deletedPageIds.forEach((id) => {
      batch.delete(doc(db, "pages", id));
    });
    state.deletedQuizIds.forEach((id) => {
      batch.delete(doc(db, "quizzes", id));
    });

    await batch.commit();

    state.deletedPageIds.clear();
    state.deletedQuizIds.clear();
    state.pendingRenames = {};
    state.unsaved = false;

    setStatus("Kaydedildi", "success");
    showToast("Tüm değişiklikler kaydedildi.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Kayıt hatası", "error");
    showToast(`Kayıt başarısız: ${error.message || error}`, "error");
  }
}

function exportVisitsCsv() {
  const rows = getFilteredVisits();
  if (!rows.length) {
    showToast("Dışa aktarılacak kayıt yok.", "info");
    return;
  }
  const headers = ["Tarih", "Cihaz Modeli", "Otomatik Model", "Doğruluk", "Tür", "OS", "Tarayıcı", "Ekran (WxH)", "DPR", "Sayfa", "Visitor ID", "Session ID", "User Agent"];
  const csvRows = [headers, ...rows.map((v) => [
    formatDate(v.createdAt || v.clientCreatedAt),
    v.deviceModel || "",
    v.automaticDeviceModel || "",
    getAccuracyLabel(v),
    v.deviceType || "",
    v.os || "",
    v.browser || "",
    v.screen ? `${v.screen.width || ""}x${v.screen.height || ""}` : "",
    v.screen?.dpr || "",
    v.pagePath || "",
    v.visitorId || "",
    v.sessionId || "",
    v.userAgent || ""
  ])];
  const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kullanici-girisleri-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${rows.length} kayıt CSV olarak indirildi.`, "success");
}

function showVisitDetail(visit) {
  if (!visit) return;
  const fields = [
    ["Tarih", formatDate(visit.createdAt || visit.clientCreatedAt)],
    ["Göreceli", formatRelative(visit.createdAt || visit.clientCreatedAt)],
    ["Cihaz Modeli", visit.deviceModel || "-"],
    ["Otomatik Tahmin", visit.automaticDeviceModel || "-"],
    ["Kullanıcı Onayı", visit.confirmedModel || "-"],
    ["Doğruluk", getAccuracyLabel(visit)],
    ["Tür", visit.deviceType || "-"],
    ["İşletim Sistemi", visit.os || "-"],
    ["Tarayıcı", visit.browser || "-"],
    ["Ekran Genişlik", visit.screen?.width || "-"],
    ["Ekran Yükseklik", visit.screen?.height || "-"],
    ["DPR", visit.screen?.dpr || "-"],
    ["Sayfa Yolu", visit.pagePath || "-"],
    ["Visitor ID", visit.visitorId || "-"],
    ["Session ID", visit.sessionId || "-"],
    ["User Agent", visit.userAgent || "-"],
    ["Firestore ID", visit.firestoreId || "-"]
  ];
  $("#visitDetailFields").innerHTML = fields.map(([label, value]) => `
    <div class="detail-field">
      <span class="detail-label">${safe(label)}</span>
      <span class="detail-value">${safe(value)}</span>
    </div>
  `).join("");
  $("#visitDetailPre").textContent = JSON.stringify(visit, null, 2);
  const dialog = $("#visitDetailDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeVisitDialog() {
  const dialog = $("#visitDetailDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function moveItem(arr, fromIndex, direction) {
  const toIndex = fromIndex + direction;
  if (toIndex < 0 || toIndex >= arr.length) return false;
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
  return true;
}

function bindEvents() {
  $$(".tab-btn").forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));
  $("#refreshBtn").addEventListener("click", () => {
    if (state.unsaved && !confirm("Kaydedilmemiş değişiklikler kaybolacak. Yine de yenilensin mi?")) return;
    loadAdminData();
  });
  $("#saveAllBtn").addEventListener("click", saveAll);
  $("#visitSearch").addEventListener("input", renderVisitTable);
  $("#visitTypeFilter").addEventListener("change", renderVisitTable);
  $("#exportVisitsBtn").addEventListener("click", exportVisitsCsv);
  $("#mobileMenuBtn").addEventListener("click", () => {
    if ($("#adminSidebar").classList.contains("is-open")) closeMobileSidebar();
    else openMobileSidebar();
  });
  $("#sidebarScrim").addEventListener("click", closeMobileSidebar);

  $("#logoutBtn").addEventListener("click", () => {
    if (state.unsaved && !confirm("Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?")) return;
    clearAdminSession();
    location.reload();
  });

  document.addEventListener("click", (event) => {
    const tabJump = event.target.closest("[data-tab-jump]");
    if (tabJump) { activateTab(tabJump.dataset.tabJump); return; }

    const pageMove = event.target.closest("[data-page-move]");
    if (pageMove) {
      saveEditorToState();
      const idx = Number(pageMove.dataset.pageIndex);
      const dir = pageMove.dataset.pageMove === "up" ? -1 : 1;
      if (moveItem(state.pages, idx, dir)) {
        if (state.activePageIndex === idx) state.activePageIndex = idx + dir;
        else if (state.activePageIndex === idx + dir) state.activePageIndex = idx;
        markUnsaved();
        renderPagesList();
      }
      return;
    }

    const pageBtn = event.target.closest(".page-item-main[data-page-index]");
    if (pageBtn) { openPageEditor(Number(pageBtn.dataset.pageIndex)); return; }

    const visitBtn = event.target.closest("[data-visit-index]");
    if (visitBtn) {
      const visit = state.filteredVisits[Number(visitBtn.dataset.visitIndex)];
      showVisitDetail(visit);
      return;
    }

    const blockMove = event.target.closest("[data-block-move]");
    if (blockMove) {
      saveEditorToState();
      const idx = Number(blockMove.dataset.blockIndex);
      const dir = blockMove.dataset.blockMove === "up" ? -1 : 1;
      if (moveItem(state.pages[state.activePageIndex].blocks, idx, dir)) {
        markUnsaved();
        renderBlocks(state.pages[state.activePageIndex].blocks);
      }
      return;
    }

    const removeBlock = event.target.closest("[data-remove-block]");
    if (removeBlock) {
      saveEditorToState();
      state.pages[state.activePageIndex].blocks.splice(Number(removeBlock.dataset.removeBlock), 1);
      markUnsaved();
      renderBlocks(state.pages[state.activePageIndex].blocks);
      return;
    }

    const quizMove = event.target.closest("[data-quiz-move]");
    if (quizMove) {
      saveEditorToState();
      const id = state.pages[state.activePageIndex].id;
      const idx = Number(quizMove.dataset.quizIndex);
      const dir = quizMove.dataset.quizMove === "up" ? -1 : 1;
      if (moveItem(state.quizzes[id], idx, dir)) {
        markUnsaved();
        renderQuiz(state.quizzes[id]);
      }
      return;
    }

    const removeQuiz = event.target.closest("[data-remove-quiz]");
    if (removeQuiz) {
      saveEditorToState();
      const id = state.pages[state.activePageIndex].id;
      state.quizzes[id].splice(Number(removeQuiz.dataset.removeQuiz), 1);
      markUnsaved();
      renderQuiz(state.quizzes[id]);
      return;
    }

    const removeStat = event.target.closest("[data-remove-stat]");
    if (removeStat) {
      saveDashboardEditorToState();
      state.dashboard.stats.splice(Number(removeStat.dataset.removeStat), 1);
      markUnsaved();
      renderDashboardEditor();
      return;
    }

    const removeCard = event.target.closest("[data-remove-card]");
    if (removeCard) {
      saveDashboardEditorToState();
      state.dashboard.cards.splice(Number(removeCard.dataset.removeCard), 1);
      markUnsaved();
      renderDashboardEditor();
      return;
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.closest(".admin-card, .admin-dialog")) markUnsaved();
  });

  $("#closeVisitDialog").addEventListener("click", closeVisitDialog);
  $("#visitDetailDialog").addEventListener("click", (event) => {
    const rect = event.target.getBoundingClientRect();
    const inside =
      rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
    if (!inside) closeVisitDialog();
  });

  $("#addPageBtn").addEventListener("click", () => {
    saveEditorToState();
    const id = `konu_${Date.now()}`;
    state.pages.push({
      id,
      title: "Yeni Konu",
      icon: "📄",
      unitBadge: "NEW",
      desc: "",
      order: state.pages.length,
      blocks: []
    });
    state.quizzes[id] = [];
    markUnsaved();
    openPageEditor(state.pages.length - 1);
  });

  $("#deletePageBtn").addEventListener("click", () => {
    if (state.activePageIndex === null) return;
    const page = state.pages[state.activePageIndex];
    if (!confirm(`"${page.title || page.id}" sayfasını silmek istediğine emin misin? Kaydet bastığında Firestore'dan da kaldırılır.`)) return;
    state.deletedPageIds.add(page.id);
    state.deletedQuizIds.add(page.id);
    Object.entries(state.pendingRenames).forEach(([oldId, newId]) => {
      if (newId === page.id) state.deletedPageIds.add(oldId);
    });
    state.pages.splice(state.activePageIndex, 1);
    delete state.quizzes[page.id];
    state.activePageIndex = null;
    markUnsaved();
    renderPagesList();
    renderEmptyEditor();
    showToast(`"${page.title || page.id}" silinmek üzere işaretlendi. Kaydet'e bas.`, "info");
  });

  $("#addBlockBtn").addEventListener("click", () => {
    if (state.activePageIndex === null) return;
    saveEditorToState();
    state.pages[state.activePageIndex].blocks.push({ type: "paragraph", content: "Yeni içerik…" });
    markUnsaved();
    renderBlocks(state.pages[state.activePageIndex].blocks);
  });

  $("#addQuizBtn").addEventListener("click", () => {
    if (state.activePageIndex === null) return;
    saveEditorToState();
    const id = state.pages[state.activePageIndex].id;
    if (!state.quizzes[id]) state.quizzes[id] = [];
    state.quizzes[id].push({
      question: "Yeni soru?",
      options: ["A şıkkı", "B şıkkı", ""],
      answer: 0,
      explanation: ""
    });
    markUnsaved();
    renderQuiz(state.quizzes[id]);
  });

  $("#addStatBtn").addEventListener("click", () => {
    saveDashboardEditorToState();
    if (!state.dashboard.stats) state.dashboard.stats = [];
    state.dashboard.stats.push({ value: "0", label: "Yeni istatistik" });
    markUnsaved();
    renderDashboardEditor();
  });

  $("#addDashCardBtn").addEventListener("click", () => {
    saveDashboardEditorToState();
    if (!state.dashboard.cards) state.dashboard.cards = [];
    state.dashboard.cards.push({ pageId: "", icon: "✨", title: "Yeni Kart", desc: "" });
    markUnsaved();
    renderDashboardEditor();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.unsaved) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMobileSidebar();
  });
}

async function bootstrap() {
  const ok = await ensureAdminAccess({ db });
  if (!ok) return;
  bindEvents();
  await loadAdminData();
}

bootstrap();
