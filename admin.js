import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const state = {
  general: {},
  dashboard: { stats: [], cards: [] },
  nav: [],
  pages: [],
  quizzes: {},
  visits: [],
  filteredVisits: [],
  activePageIndex: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setStatus(text, type = "normal") {
  const badge = $("#statusBadge");
  if (!badge) return;
  badge.textContent = text;
  badge.className = `status-badge ${type === "normal" ? "" : type}`.trim();
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
}

async function loadAdminData() {
  setStatus("Veriler yükleniyor...", "warning");
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
    quizzesSnap.forEach((snap) => state.quizzes[snap.id] = snap.data().questions || []);
    state.visits = [];
    visitsSnap.forEach((snap) => state.visits.push({ firestoreId: snap.id, ...snap.data() }));

    renderAll();
    setStatus("Veriler yüklendi", "success");
  } catch (error) {
    console.error(error);
    setStatus("Veri yükleme hatası", "error");
  }
}

function renderAll() {
  populateSettings();
  renderOverview();
  renderVisitTable();
  renderPagesList();
  renderDashboardEditor();
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
  $("#themeBg").value = t.bg || "#f5f4fb";
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
      <div><strong>${safe(v.deviceModel || "Bilinmeyen cihaz")}</strong><br><span>${safe(v.os || "-")} • ${safe(v.browser || "-")}</span></div>
      <span>${formatDate(v.createdAt || v.clientCreatedAt)}</span>
    </div>
  `).join("") || `<div class="latest-item"><span>Henüz giriş kaydı yok.</span></div>`;

  const typeCounts = countBy(visits, (v) => v.deviceType || "Bilinmeyen");
  const total = visits.length || 1;
  $("#deviceBreakdown").innerHTML = Object.entries(typeCounts).map(([type, count]) => {
    const pct = Math.round((count / total) * 100);
    return `<div class="breakdown-item"><div><strong>${safe(type)}</strong> <span>${count} kayıt • ${pct}%</span></div><div class="breakdown-bar"><i style="width:${pct}%"></i></div></div>`;
  }).join("") || `<div class="breakdown-item"><span>Veri bekleniyor.</span></div>`;
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
  if (value === "confirmed-by-user") return "Eski kayıt / kullanıcı seçmiş";
  return value || "Otomatik";
}

function getAccuracyClass(visit) {
  const value = visit.modelAccuracy || "";
  if (value === "browser-provided" || value === "automatic-exact-or-browser-provided") return "confirmed";
  if (value === "estimated-screen-group" || value === "estimated" || value === "user-agent-estimated") return "estimated";
  return "auto";
}

function getFilteredVisits() {
  const search = ($("#visitSearch")?.value || "").toLowerCase().trim();
  const type = $("#visitTypeFilter")?.value || "all";
  return (state.visits || []).filter((visit) => {
    const blob = [visit.deviceModel, visit.confirmedModel, visit.automaticDeviceModel, visit.os, visit.browser, visit.deviceType, visit.modelAccuracy, visit.pagePath, visit.userAgent].join(" ").toLowerCase();
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
  body.innerHTML = visits.map((v, index) => `
    <tr>
      <td>${formatDate(v.createdAt || v.clientCreatedAt)}</td>
      <td><strong>${safe(v.deviceModel || "Bilinmeyen")}</strong><br><small>${safe(v.automaticDeviceModel || "Otomatik analiz")}</small></td>
      <td><span class="accuracy-pill ${getAccuracyClass(v)}">${safe(getAccuracyLabel(v))}</span></td>
      <td><span class="table-pill">${safe(v.deviceType || "-")}</span></td>
      <td>${safe(v.os || "-")}</td>
      <td>${safe(v.browser || "-")}</td>
      <td>${safe(v.screen ? `${v.screen.width || "?"}×${v.screen.height || "?"} / DPR ${v.screen.dpr || 1}` : "-")}</td>
      <td>${safe(v.pagePath || "-")}</td>
      <td><button class="detail-link" data-visit-index="${index}">Aç</button></td>
    </tr>
  `).join("") || `<tr><td colspan="9">Kayıt bulunamadı. Kullanıcı cihaz analiz izni verirse user_visits koleksiyonuna kayıt düşer.</td></tr>`;
}

function renderPagesList() {
  const list = $("#pagesList");
  if (!list) return;
  list.innerHTML = state.pages.map((page, index) => `
    <button class="page-item ${index === state.activePageIndex ? "active" : ""}" data-page-index="${index}" type="button">
      <span><strong>${safe(page.icon || "📄")} ${safe(page.title || "Başlıksız")}</strong><small>${safe(page.id || "-")}</small></span>
      <small>${safe(page.unitBadge || page.unit || "")}</small>
    </button>
  `).join("") || `<div class="page-item"><span><strong>Sayfa yok</strong><small>Yeni konu ekleyebilirsin.</small></span></div>`;
}

function openPageEditor(index) {
  saveEditorToState();
  state.activePageIndex = index;
  renderPagesList();
  const page = state.pages[index];
  $("#emptyEditor").hidden = true;
  $("#pageEditor").hidden = false;
  $("#pageIdInput").value = page.id || "";
  $("#pageTitleInput").value = page.title || "";
  $("#pageIconInput").value = page.icon || "";
  $("#pageBadgeInput").value = page.unitBadge || page.unit || "";
  $("#pageDescInput").value = page.desc || page.subtitle || "";
  renderBlocks(page.blocks || []);
  renderQuiz(state.quizzes[page.id] || page.quiz || []);
}

function renderBlocks(blocks = []) {
  $("#blocksContainer").innerHTML = blocks.map((block, index) => `
    <div class="block-item" data-block-index="${index}">
      <div class="row">
        <select class="block-type">
          ${["paragraph", "heading", "info", "warning", "formula", "customHTML"].map((type) => `<option value="${type}" ${block.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
        <textarea class="block-content" rows="4">${safe(block.content || "")}</textarea>
        <button class="block-remove" data-remove-block="${index}" type="button">Sil</button>
      </div>
    </div>
  `).join("");
}

function renderQuiz(questions = []) {
  $("#quizContainer").innerHTML = questions.map((q, index) => {
    const opts = q.options || [q.a || "", q.b || ""];
    const correct = typeof q.answer === "number" ? q.answer : (q.correct === "b" ? 1 : 0);
    return `
      <div class="block-item" data-quiz-index="${index}">
        <div class="row">
          <select class="quiz-answer"><option value="0" ${correct === 0 ? "selected" : ""}>A doğru</option><option value="1" ${correct === 1 ? "selected" : ""}>B doğru</option><option value="2" ${correct === 2 ? "selected" : ""}>C doğru</option></select>
          <div class="form-grid">
            <input class="quiz-question" type="text" value="${safe(q.question || "Soru?")}" placeholder="Soru metni">
            <input class="quiz-opt-a" type="text" value="${safe(opts[0] || "")}" placeholder="A şıkkı">
            <input class="quiz-opt-b" type="text" value="${safe(opts[1] || "")}" placeholder="B şıkkı">
            <input class="quiz-opt-c" type="text" value="${safe(opts[2] || "")}" placeholder="C şıkkı">
            <input class="quiz-explanation full" type="text" value="${safe(q.explanation || "")}" placeholder="Açıklama">
          </div>
          <button class="block-remove" data-remove-quiz="${index}" type="button">Sil</button>
        </div>
      </div>
    `;
  }).join("");
}

function saveEditorToState() {
  if (state.activePageIndex === null || !state.pages[state.activePageIndex] || $("#pageEditor")?.hidden) return;
  const page = state.pages[state.activePageIndex];
  const oldId = page.id;
  page.id = $("#pageIdInput").value.trim() || oldId;
  page.title = $("#pageTitleInput").value.trim();
  page.icon = $("#pageIconInput").value.trim();
  page.unitBadge = $("#pageBadgeInput").value.trim();
  page.desc = $("#pageDescInput").value.trim();
  page.order = state.activePageIndex;

  if (oldId && oldId !== page.id && state.quizzes[oldId]) {
    state.quizzes[page.id] = state.quizzes[oldId];
    delete state.quizzes[oldId];
  }

  page.blocks = $$("#blocksContainer .block-item").map((el) => ({
    type: el.querySelector(".block-type")?.value || "paragraph",
    content: el.querySelector(".block-content")?.value || ""
  }));

  state.quizzes[page.id] = $$("#quizContainer .block-item").map((el) => ({
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
    <div class="block-item" data-stat-index="${index}"><div class="row"><input class="stat-value" value="${safe(stat.value || "0")}" placeholder="Değer"><input class="stat-label" value="${safe(stat.label || "Etiket")}" placeholder="Etiket"><button class="block-remove" data-remove-stat="${index}">Sil</button></div></div>
  `).join("");

  const cards = state.dashboard.cards || [];
  $("#dashCardsContainer").innerHTML = cards.map((card, index) => `
    <div class="block-item" data-card-index="${index}"><div class="form-grid"><input class="dash-page" value="${safe(card.pageId || "")}" placeholder="pageId"><input class="dash-icon" value="${safe(card.icon || "✨")}" placeholder="ikon"><input class="dash-title" value="${safe(card.title || "Başlık")}" placeholder="başlık"><input class="dash-desc" value="${safe(card.desc || "")}" placeholder="açıklama"><button class="block-remove" data-remove-card="${index}">Sil</button></div></div>
  `).join("");
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
  setStatus("Kaydediliyor...", "warning");
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
  state.nav = state.pages.map((page, index) => ({ pageId: page.id, title: page.title, icon: page.icon, visible: true, order: index }));

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "system", "general"), state.general, { merge: true });
    batch.set(doc(db, "system", "dashboard"), state.dashboard, { merge: true });
    batch.set(doc(db, "system", "navigation"), { items: state.nav, updatedAt: serverTimestamp() }, { merge: true });
    state.pages.forEach((page, index) => batch.set(doc(db, "pages", page.id), { ...page, order: index, updatedAt: serverTimestamp() }, { merge: true }));
    Object.keys(state.quizzes).forEach((id) => batch.set(doc(db, "quizzes", id), { questions: state.quizzes[id], updatedAt: serverTimestamp() }, { merge: true }));
    await batch.commit();
    setStatus("Kaydedildi", "success");
  } catch (error) {
    console.error(error);
    setStatus("Kayıt hatası", "error");
  }
}

function exportVisitsCsv() {
  const rows = getFilteredVisits();
  const headers = ["Tarih", "Cihaz Modeli", "Doğruluk", "Otomatik Model", "Tür", "OS", "Tarayıcı", "Ekran", "Sayfa", "Visitor ID", "Session ID", "User Agent"];
  const csvRows = [headers, ...rows.map((v) => [
    formatDate(v.createdAt || v.clientCreatedAt), v.deviceModel || "", getAccuracyLabel(v), v.automaticDeviceModel || "", v.deviceType || "", v.os || "", v.browser || "",
    v.screen ? `${v.screen.width}x${v.screen.height} DPR ${v.screen.dpr}` : "", v.pagePath || "", v.visitorId || "", v.sessionId || "", v.userAgent || ""
  ])];
  const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kullanici-girisleri-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  $$(".tab-btn").forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));
  $$('[data-tab-jump]').forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tabJump)));
  $("#refreshBtn").addEventListener("click", loadAdminData);
  $("#saveAllBtn").addEventListener("click", saveAll);
  $("#visitSearch").addEventListener("input", renderVisitTable);
  $("#visitTypeFilter").addEventListener("change", renderVisitTable);
  $("#exportVisitsBtn").addEventListener("click", exportVisitsCsv);

  document.addEventListener("click", (event) => {
    const pageBtn = event.target.closest("[data-page-index]");
    if (pageBtn) openPageEditor(Number(pageBtn.dataset.pageIndex));

    const visitBtn = event.target.closest("[data-visit-index]");
    if (visitBtn) {
      const visit = state.filteredVisits[Number(visitBtn.dataset.visitIndex)];
      $("#visitDetailPre").textContent = JSON.stringify(visit, null, 2);
      $("#visitDetailDialog").showModal();
    }

    const removeBlock = event.target.closest("[data-remove-block]");
    if (removeBlock) { saveEditorToState(); state.pages[state.activePageIndex].blocks.splice(Number(removeBlock.dataset.removeBlock), 1); renderBlocks(state.pages[state.activePageIndex].blocks); }

    const removeQuiz = event.target.closest("[data-remove-quiz]");
    if (removeQuiz) { saveEditorToState(); const id = state.pages[state.activePageIndex].id; state.quizzes[id].splice(Number(removeQuiz.dataset.removeQuiz), 1); renderQuiz(state.quizzes[id]); }

    const removeStat = event.target.closest("[data-remove-stat]");
    if (removeStat) { saveDashboardEditorToState(); state.dashboard.stats.splice(Number(removeStat.dataset.removeStat), 1); renderDashboardEditor(); }

    const removeCard = event.target.closest("[data-remove-card]");
    if (removeCard) { saveDashboardEditorToState(); state.dashboard.cards.splice(Number(removeCard.dataset.removeCard), 1); renderDashboardEditor(); }
  });

  $("#closeVisitDialog").addEventListener("click", () => $("#visitDetailDialog").close());
  $("#addPageBtn").addEventListener("click", () => {
    saveEditorToState();
    const id = `konu_${Date.now()}`;
    state.pages.push({ id, title: "Yeni Konu", icon: "📄", unitBadge: "NEW", desc: "", order: state.pages.length, blocks: [] });
    state.quizzes[id] = [];
    openPageEditor(state.pages.length - 1);
  });
  $("#deletePageBtn").addEventListener("click", () => {
    if (state.activePageIndex === null) return;
    if (!confirm("Bu sayfayı panelden kaldırmak istediğine emin misin?")) return;
    const id = state.pages[state.activePageIndex].id;
    state.pages.splice(state.activePageIndex, 1);
    delete state.quizzes[id];
    state.activePageIndex = null;
    $("#pageEditor").hidden = true;
    $("#emptyEditor").hidden = false;
    renderPagesList();
  });
  $("#addBlockBtn").addEventListener("click", () => {
    if (state.activePageIndex === null) return;
    saveEditorToState();
    state.pages[state.activePageIndex].blocks.push({ type: "paragraph", content: "Yeni içerik..." });
    renderBlocks(state.pages[state.activePageIndex].blocks);
  });
  $("#addQuizBtn").addEventListener("click", () => {
    if (state.activePageIndex === null) return;
    saveEditorToState();
    const id = state.pages[state.activePageIndex].id;
    if (!state.quizzes[id]) state.quizzes[id] = [];
    state.quizzes[id].push({ question: "Yeni soru?", options: ["A", "B", "C"], answer: 0, explanation: "" });
    renderQuiz(state.quizzes[id]);
  });
  $("#addStatBtn").addEventListener("click", () => { saveDashboardEditorToState(); if (!state.dashboard.stats) state.dashboard.stats = []; state.dashboard.stats.push({ value: "0", label: "Yeni istatistik" }); renderDashboardEditor(); });
  $("#addDashCardBtn").addEventListener("click", () => { saveDashboardEditorToState(); if (!state.dashboard.cards) state.dashboard.cards = []; state.dashboard.cards.push({ pageId: "", icon: "✨", title: "Yeni Kart", desc: "" }); renderDashboardEditor(); });
}

bindEvents();
loadAdminData();
