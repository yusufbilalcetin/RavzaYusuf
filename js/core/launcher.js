import {
  LAUNCHER_GROUPS,
  findLauncherGroup,
  findLauncherItem,
  launcherItems,
  registerLauncherEntry,
  unregisterLauncherEntry
} from "../data/launcher-navigation.js";
import { KONU_LISTESI } from "../../data/konu-listesi.js";
import { createSearchIndex, matchesSearchIndex, normalizeSearchText } from "../utils/search.js";
import {
  LAUNCHER_LAYOUT_KEY,
  LAUNCHER_WIDGETS,
  cleanTrailingEmptyPages,
  createCustomFolder,
  createLauncherPage,
  launcherDeviceMode,
  launcherOrientation,
  launcherRegistryEntries,
  readLauncherLayout,
  resetLauncherLayout,
  resolveCustomFolder,
  saveLauncherLayout
} from "./launcher-layout.js";

const RECENT_KEY = "ravzaLauncherRecent";
const OVERLAY_TRANSITION_MS = 210;
const EDGE_DWELL_MS = 540;
const FOLDER_DWELL_MS = 600;
const EDIT_LONG_PRESS_MS = 560;
const EDGE_ZONE_PX = 36;
const SWIPE_THRESHOLD_PX = 48;
const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

let initialized = false;
let folderTrigger = null;
let searchTrigger = null;
let editorTrigger = null;
let closingTimer = null;

const savedLauncherLayouts = readLauncherLayout();
const initialDevice = launcherDeviceMode();

const launcherState = {
  isEditing: false,
  layouts: savedLauncherLayouts,
  device: initialDevice,
  orientation: launcherOrientation(),
  layout: savedLauncherLayouts[initialDevice],
  drag: null,
  keyboardMove: null,
  swipe: null,
  resizeTimer: 0,
  wheelPagingAt: 0,
  viewportWidth: globalThis.innerWidth || 1200,
  longPress: null,
  openFolderId: null,
  pendingRemove: null
};

const TOPIC_SEARCH_ENTRIES = KONU_LISTESI.map((topic) => ({
  id: `topic-${topic.id}`,
  title: topic.title,
  subtitle: `${topic.unit} · ${topic.time} dk`,
  topicId: topic.id,
  icon: "book",
  tone: "teal",
  resultType: "Ders",
  searchIndex: createSearchIndex(topic.title, topic.unit, topic.category, topic.keywords, "ders")
}));

function isDesktopLauncher() {
  return launcherState.device === "desktop";
}

function resolveLauncherItem(itemId) {
  return findLauncherItem(itemId) || resolveCustomFolder(launcherState.layouts, itemId);
}

function resolveLauncherGroup(groupId) {
  return findLauncherGroup(groupId) || resolveCustomFolder(launcherState.layouts, groupId);
}

function persistLayouts() {
  launcherState.layouts[launcherState.device] = launcherState.layout;
  launcherState.layouts = saveLauncherLayout(launcherState.layouts);
  launcherState.layout = launcherState.layouts[launcherState.device];
  return launcherState.layout;
}

function syncDeviceAttributes() {
  document.documentElement.dataset.launcherDevice = launcherState.device;
  document.documentElement.dataset.launcherOrientation = launcherState.orientation;
}

const ICONS = {
  fallback: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v10h11V10"/><path d="M10 20v-5h4v5"/>',
  preparation: '<path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z"/><path d="M6 11v5c0 1.6 2.7 3 6 3s6-1.4 6-3v-5"/><path d="M21 9v6"/>',
  grade1: '<path d="M6 4.5A2.5 2.5 0 0 1 8.5 2H19v18H8.5A2.5 2.5 0 0 0 6 22Z"/><path d="M6 19.5A2.5 2.5 0 0 1 8.5 17H19"/><path d="M11 7h4M11 11h4"/>',
  grade2: '<path d="M5 3h14v18l-7-4-7 4Z"/><path d="M9 8h6M9 12h6"/>',
  games: '<path d="M7 8h10a5 5 0 0 1 5 5v2a3 3 0 0 1-5.4 1.8L15 15H9l-1.6 1.8A3 3 0 0 1 2 15v-2a5 5 0 0 1 5-5Z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".7" fill="currentColor" stroke="none"/><circle cx="17.5" cy="13.5" r=".7" fill="currentColor" stroke="none"/>',
  language: '<path d="M4 5h8v12H7l-3 3Z"/><path d="M12 8h8v10h-3l-3 3v-4h-2"/><path d="M7 9h2M7 12h3M15 12h2M15 15h2"/>',
  kahoot: '<path d="M6 4v16M6 12l7-8M7 11l7 9"/><path d="M17 5v8M17 17v.1"/>',
  book: '<path d="M12 6c-2-1.5-5-2-8-1v13c3-1 6-.5 8 1 2-1.5 5-2 8-1V5c-3-1-6-.5-8 1Z"/><path d="M12 6v14"/>',
  reader: '<path d="M4 5.5c3.2-1.1 5.9-.5 8 1.5v12.5c-2.1-2-4.8-2.6-8-1.5Z"/><path d="M20 5.5c-3.2-1.1-5.9-.5-8 1.5v12.5c2.1-2 4.8-2.6 8-1.5Z"/><path d="M12 7v12.5"/>',
  memory: '<path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"/>',
  puzzle: '<path d="M10 4h4a1 1 0 0 1 1 1v2.2a1.8 1.8 0 1 0 0 3.6V13a1 1 0 0 1-1 1h-2.2a1.8 1.8 0 1 1-3.6 0H6a1 1 0 0 1-1-1V9a1.8 1.8 0 1 0 0-3.6V5a1 1 0 0 1 1-1h2.2a1.8 1.8 0 0 1 3.6 0Z"/>',
  quiz: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" stroke="none"/>',
  sudoku: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>',
  wheel: '<circle cx="12" cy="13" r="8"/><path d="m12 5 2.2 3.8 4.3.2-2.1 3.8 2 3.8-4.3.1L12 20l-2.1-3.3-4.3-.1 2-3.8L5.5 9l4.3-.2Z"/><path d="m12 2 1.5 3h-3Z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  arrows: '<path d="M12 3v8M12 3l-3.5 3.5M12 3l3.5 3.5"/><path d="M12 21v-8M12 21l-3.5-3.5M12 21l3.5-3.5"/><path d="M3 12h8M3 12l3.5-3.5M3 12l3.5 3.5"/><path d="M21 12h-8M21 12l-3.5-3.5M21 12l-3.5 3.5"/>'
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function iconMarkup(item, compact = false) {
  if (item.asset) {
    const prioritized = compact || item.id === "ravza-books";
    const srcset = item.asset2x ? ` srcset="${escapeHtml(item.asset)} 1x, ${escapeHtml(item.asset2x)} 2x"` : "";
    const width = Number(item.assetWidth) || 128;
    const height = Number(item.assetHeight) || 128;
    return `<img src="${escapeHtml(item.asset)}"${srcset} width="${width}" height="${height}" alt="" loading="${prioritized ? "eager" : "lazy"}" decoding="async" fetchpriority="${prioritized ? "high" : "low"}">`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[item.icon] || ICONS.fallback}</svg>`;
}

function itemActionAttributes(item) {
  if (item.type === "folder") return `data-launcher-folder="${escapeHtml(item.id)}" aria-haspopup="dialog" aria-expanded="false"`;
  return `data-launcher-item="${escapeHtml(item.id)}"${item.route ? ` data-launcher-route="${escapeHtml(item.route)}"` : ""}`;
}

function folderPreview(group) {
  return (group.items || []).slice(0, 4).map((item) => (
    `<span class="launcher-folder-preview-item launcher-tone-${escapeHtml(item.tone || "home")}">${iconMarkup(item, true)}</span>`
  )).join("");
}

function appButton(item, context = "grid") {
  const isFolder = item.type === "folder";
  const art = isFolder
    ? `<span class="launcher-folder-preview" aria-hidden="true">${folderPreview(item)}</span>`
    : iconMarkup(item);
  return `
    <button class="launcher-app launcher-app--${context}" type="button" ${itemActionAttributes(item)} aria-label="${escapeHtml(item.title)}">
      <span class="launcher-app-icon launcher-tone-${escapeHtml(item.tone || "home")}">${art}</span>
      <span class="launcher-app-label">${escapeHtml(item.title)}</span>
      ${item.status ? `<span class="launcher-app-status">${escapeHtml(item.status)}</span>` : ""}
    </button>`;
}

function removeButton(label, type) {
  return `<button class="launcher-remove-control" type="button" data-launcher-remove aria-label="${escapeHtml(label)} ${type === "widget" ? "widget'ını" : "uygulamasını"} ana ekrandan kaldır"><span aria-hidden="true">−</span></button>`;
}

function folderEditButton(item) {
  if (!launcherState.layouts.folders.some((folder) => folder.id === item.id)) return "";
  return `<button class="launcher-folder-edit-control" type="button" data-launcher-folder-edit="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} klasörünü düzenle"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>`;
}

function editableAppSlot(item, pageIndex, itemIndex, layoutItem, placement = null) {
  const source = launcherState.drag;
  const isDraggedSource = source?.sourceContext === "page" && source.sourcePage === pageIndex && source.itemId === item.id;
  const desktopStyle = placement ? ` style="grid-column:${placement.gridX} / span ${placement.columns || 1};grid-row:${placement.gridY} / span ${placement.rows || 1}"` : "";
  return `<div class="launcher-slot launcher-slot--app${placement ? " launcher-slot--desktop" : ""}${isDraggedSource ? " is-drag-placeholder" : ""}" data-launcher-slot data-launcher-context="page" data-launcher-page="${pageIndex}" data-launcher-index="${itemIndex}" data-launcher-type="${layoutItem.type}" data-launcher-id="${escapeHtml(item.id)}"${desktopStyle}>
    ${isDraggedSource ? "" : appButton(item)}
    ${launcherState.isEditing && item.removable !== false ? removeButton(item.title, item.type) : ""}
    ${launcherState.isEditing && item.type === "folder" ? folderEditButton(item) : ""}
  </div>`;
}

function safeJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function studySnapshot() {
  const studies = KONU_LISTESI.filter((topic) => localStorage.getItem(`eul_study_${topic.id}`) === "true");
  const quizzes = KONU_LISTESI.filter((topic) => localStorage.getItem(`eul_quiz_${topic.id}`) === "true");
  const exams = safeJson("eul_exam_history", []);
  const favorites = safeJson("eul_favorite_words", []);
  const dailyPlan = safeJson("eul_daily_plan", []);
  return {
    studies,
    quizzes,
    exams: Array.isArray(exams) ? exams : [],
    favorites: Array.isArray(favorites) ? favorites : [],
    dailyPlan: Array.isArray(dailyPlan) ? dailyPlan : [],
    bestExam: Number(localStorage.getItem("eul_best_exam") || 0),
    total: KONU_LISTESI.length
  };
}

function mainStudyWidget() {
  return `<article class="launcher-widget launcher-widget--study glass-surface" aria-labelledby="launcherWidgetTitle"${launcherState.isEditing ? ' tabindex="0" aria-label="Çalışma Özeti widget’ını taşı"' : ""}>
    <div class="launcher-widget-heading">
      <div><span class="launcher-eyebrow">Ravza'nın çalışma alanı</span><h1 id="launcherWidgetTitle">Bugün nereden devam edelim?</h1></div>
      <span class="launcher-widget-date" id="launcherWidgetDate" aria-label="Bugünün tarihi"></span>
    </div>
    <div class="launcher-widget-stats" aria-label="Çalışma özeti">
      <div class="launcher-widget-stat"><span>Çalışma</span><strong id="stat-study-complete">—</strong></div>
      <div class="launcher-widget-stat"><span>Quiz</span><strong id="stat-quiz-complete">—</strong></div>
      <div class="launcher-widget-stat"><span>En iyi sınav</span><strong id="stat-best-exam">—</strong></div>
    </div>
    <div class="launcher-widget-progress">
      <div><span id="study-progress-text">Bugün henüz çalışma kaydı yok.</span><strong id="study-progress-label">0%</strong></div>
      <span class="launcher-progress-track" aria-hidden="true"><i id="study-progress-fill"></i></span>
    </div>
    <div class="launcher-widget-footer">
      <p id="latest-exam-box">Son çalışma bulunamadı.</p>
      <button type="button" data-launcher-widget-route="calisma-merkezi"><span>İlk çalışmanı başlat</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg></button>
    </div>
  </article>`;
}

function smallWidget(widgetId) {
  const data = studySnapshot();
  const percent = data.total ? Math.round((data.studies.length / data.total) * 100) : 0;
  const latestExam = data.exams[0];
  const lastStudy = data.studies.at(-1);
  const streak = safeJson("eul_study_streak", null);
  const nextPlan = data.dailyPlan.find((entry) => entry && !entry.completed);
  const definitions = {
    "daily-goal": { eyebrow: "Günlük hedef", value: `${percent}%`, text: data.studies.length ? `${data.studies.length}/${data.total} konu tamamlandı` : "Henüz çalışma kaydı yok.", route: "calisma-merkezi" },
    "last-quiz": { eyebrow: "Son quiz", value: data.quizzes.length ? `${data.quizzes.length}/${data.total}` : "—", text: data.quizzes.length ? "Quiz ilerlemen kaydedildi." : "Henüz tamamlanan quiz yok.", route: "quiz-merkezi" },
    "study-streak": { eyebrow: "Çalışma serisi", value: Number(streak?.current || streak || 0) ? `${Number(streak?.current || streak)} gün` : "—", text: Number(streak?.current || streak || 0) ? "Seri devam ediyor." : "Seri verisi oluştuğunda burada görünür.", route: "calisma-merkezi" },
    "recent-lesson": { eyebrow: "Son çalışılan ders", value: lastStudy?.title || "Kayıt yok", text: lastStudy ? `${lastStudy.unit || "Ders"} · tamamlandı` : "Bir dersi tamamladığında burada görünür.", route: "calisma-merkezi" },
    "day-plan": { eyebrow: "Günün planı", value: nextPlan?.title || nextPlan?.lesson || "Plan yok", text: nextPlan ? (nextPlan.note || "Sıradaki kayıtlı çalışma") : "Bugün için kaydedilmiş plan yok.", route: "calisma-merkezi" },
    "exam-summary": { eyebrow: "Sınav özeti", value: data.bestExam ? `%${data.bestExam}` : "—", text: latestExam ? `Son sınav: ${latestExam.score}/${latestExam.total}` : "Henüz sınav sonucu yok.", route: "sinav-merkezi" },
    "favorite-apps": { eyebrow: "Favori uygulamalar", value: `${launcherState.layout.dock.length} kısayol`, text: launcherState.layout.dock.length ? launcherState.layout.dock.map((id) => resolveLauncherItem(id)?.title).filter(Boolean).join(" · ") : "Dock'a uygulama ekleyebilirsin.", route: null }
  };
  const content = definitions[widgetId] || definitions["daily-goal"];
  const widgetTitle = LAUNCHER_WIDGETS.find((widget) => widget.id === widgetId)?.title || content.eyebrow;
  return `<article class="launcher-widget launcher-mini-widget glass-surface"${launcherState.isEditing ? ` tabindex="0" aria-label="${escapeHtml(widgetTitle)} widget’ını taşı"` : ""}>
    <span class="launcher-eyebrow">${escapeHtml(content.eyebrow)}</span>
    <strong>${escapeHtml(content.value)}</strong>
    <p>${escapeHtml(content.text)}</p>
    ${content.route ? `<button type="button" data-launcher-widget-route="${escapeHtml(content.route)}">Aç <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg></button>` : ""}
  </article>`;
}

function widgetSlot(item, pageIndex, itemIndex, placement = null) {
  const definition = LAUNCHER_WIDGETS.find((widget) => widget.id === item.id);
  const source = launcherState.drag;
  const isDraggedSource = source?.sourceContext === "page" && source.sourcePage === pageIndex && source.itemId === item.id;
  const desktopStyle = placement ? ` style="grid-column:${placement.gridX} / span ${placement.columns || 1};grid-row:${placement.gridY} / span ${placement.rows || 1}"` : "";
  return `<div class="launcher-slot launcher-slot--widget launcher-slot--${escapeHtml(item.size || definition?.size || "small")}${placement ? " launcher-slot--desktop" : ""}${isDraggedSource ? " is-drag-placeholder" : ""}" data-launcher-slot data-launcher-context="page" data-launcher-page="${pageIndex}" data-launcher-index="${itemIndex}" data-launcher-type="widget" data-launcher-id="${escapeHtml(item.id)}"${desktopStyle}>
    ${isDraggedSource ? "" : (item.id === "study-summary" ? mainStudyWidget() : smallWidget(item.id))}
    ${launcherState.isEditing ? removeButton(definition?.title || item.id, "widget") : ""}
  </div>`;
}

function pagedAppCapacity(page) {
  const hasWidget = page.items.some((item) => item.type === "widget");
  if (launcherState.device === "mobile") {
    const rows = hasWidget ? (innerHeight < 1000 ? 1 : 2) : Math.max(2, Math.min(5, Math.floor((innerHeight - 210) / 112)));
    return rows * 4;
  }
  const landscape = launcherState.orientation === "landscape";
  const columns = landscape ? (innerWidth >= 1120 ? 7 : 6) : 5;
  const availableHeight = innerHeight - (landscape ? 190 : hasWidget ? 440 : 230);
  const rows = Math.max(2, Math.min(4, Math.floor(availableHeight / 124)));
  return columns * rows;
}

function distributePagedOverflow() {
  if (isDesktopLauncher()) return false;
  let changed = false;
  for (let pageIndex = 0; pageIndex < launcherState.layout.pages.length; pageIndex += 1) {
    const page = launcherState.layout.pages[pageIndex];
    const capacity = pagedAppCapacity(page);
    let appCount = 0;
    const overflow = [];
    page.items = page.items.filter((item) => {
      if (item.type === "widget") return true;
      appCount += 1;
      if (appCount <= capacity) return true;
      overflow.push(item);
      return false;
    });
    if (!overflow.length) continue;
    if (!launcherState.layout.pages[pageIndex + 1]) launcherState.layout.pages.push(createLauncherPage());
    const destination = launcherState.layout.pages[pageIndex + 1];
    const widgetEnd = destination.items.findLastIndex((item) => item.type === "widget") + 1;
    destination.items.splice(widgetEnd, 0, ...overflow);
    changed = true;
  }
  if (changed) persistLayouts();
  return changed;
}

function desktopGridMetrics() {
  return {
    columns: 13,
    rows: Math.max(4, Math.min(12, Math.floor((innerHeight - 206) / 118)))
  };
}

function placementCells(record) {
  const cells = [];
  for (let y = 0; y < (record.rows || 1); y += 1) {
    for (let x = 0; x < (record.columns || 1); x += 1) cells.push(`${record.gridX + x}:${record.gridY + y}`);
  }
  return cells;
}

function syncDesktopPlacements() {
  if (!isDesktopLauncher()) return;
  const { columns, rows } = desktopGridMetrics();
  const pageItems = launcherState.layout.pages[0]?.items || [];
  const appRecords = new Map((launcherState.layout.items || []).map((item) => [item.id, item]));
  const widgetRecords = new Map((launcherState.layout.widgets || []).map((item) => [item.id, item]));
  const occupied = new Set();

  function fit(record) {
    record.columns = Math.max(1, Math.min(record.columns || 1, columns));
    record.rows = Math.max(1, Math.min(record.rows || 1, rows));
    record.gridX = Math.max(1, Math.min(record.gridX || 1, columns - record.columns + 1));
    record.gridY = Math.max(1, Math.min(record.gridY || 1, rows - record.rows + 1));
    const free = () => placementCells(record).every((cell) => !occupied.has(cell));
    if (!free()) {
      let found = false;
      for (let y = 1; y <= rows - record.rows + 1 && !found; y += 1) {
        for (let x = 1; x <= columns - record.columns + 1; x += 1) {
          record.gridX = x;
          record.gridY = y;
          if (free()) { found = true; break; }
        }
      }
    }
    placementCells(record).forEach((cell) => occupied.add(cell));
    return record;
  }

  const nextWidgets = pageItems.filter((item) => item.type === "widget").map((item) => {
    const definition = LAUNCHER_WIDGETS.find((widget) => widget.id === item.id);
    const prior = widgetRecords.get(item.id) || {};
    return fit({ ...item, ...prior, columns: prior.columns || definition?.span?.columns || 2, rows: prior.rows || definition?.span?.rows || 1 });
  });
  const nextApps = pageItems.filter((item) => item.type !== "widget").map((item, index) => fit({
    ...item,
    ...(appRecords.get(item.id) || {}),
    gridX: appRecords.get(item.id)?.gridX || 1 + (index % columns),
    gridY: appRecords.get(item.id)?.gridY || 1 + Math.floor(index / columns),
    columns: 1,
    rows: 1
  }));
  launcherState.layout.widgets = nextWidgets;
  launcherState.layout.items = nextApps;
}

function renderDesktopWorkspace() {
  syncDesktopPlacements();
  const page = launcherState.layout.pages[0] || createLauncherPage();
  const appPositions = new Map(launcherState.layout.items.map((item) => [item.id, item]));
  const widgetPositions = new Map(launcherState.layout.widgets.map((item) => [item.id, item]));
  const slots = page.items.map((item, itemIndex) => {
    if (item.type === "widget") return widgetSlot(item, 0, itemIndex, widgetPositions.get(item.id));
    const definition = resolveLauncherItem(item.id);
    return definition ? editableAppSlot(definition, 0, itemIndex, item, appPositions.get(item.id)) : "";
  }).join("");
  const { columns, rows } = desktopGridMetrics();
  return `<section class="launcher-page launcher-page--desktop is-active" data-launcher-page="0" aria-label="Masaüstü çalışma alanı">
    <section class="launcher-desktop-workspace">
      <div class="launcher-grid launcher-desktop-grid" id="launcherGrid" style="--desktop-columns:${columns};--desktop-rows:${rows}" aria-label="Masaüstü uygulamaları ve widget’ları">${slots}</div>
    </section>
  </section>`;
}

function renderPage(page, pageIndex) {
  const widgets = [];
  const apps = [];
  page.items.forEach((item, itemIndex) => {
    if (item.type === "widget") widgets.push(widgetSlot(item, pageIndex, itemIndex));
    else {
      const definition = resolveLauncherItem(item.id);
      if (definition) apps.push(editableAppSlot(definition, pageIndex, itemIndex, item));
    }
  });
  const empty = !widgets.length && !apps.length;
  const active = pageIndex === launcherState.layout.activePage;
  return `<section class="launcher-page${active ? " is-active" : ""}${widgets.length ? " has-widgets" : ""}" data-launcher-page="${pageIndex}" aria-label="${pageIndex + 1}. sayfa, ${launcherState.layout.pages.length} sayfadan"${active ? "" : " inert"}>
    <div class="launcher-page-layout">
      ${widgets.length ? `<div class="launcher-widget-zone">${widgets.join("")}</div>` : ""}
      <section class="launcher-apps" aria-labelledby="launcherAppsTitle-${pageIndex}">
        <div class="launcher-section-head">
          <div><span class="launcher-eyebrow">Uygulamalar</span><h2 id="launcherAppsTitle-${pageIndex}">${pageIndex ? `${pageIndex + 1}. sayfa` : "Çalışma masan"}</h2></div>
          <button class="launcher-inline-search" type="button" data-launcher-search-inline aria-label="Uygulama ve ders ara"${launcherState.isEditing ? " disabled" : ""}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><span>Ara</span><kbd>⌘ K</kbd>
          </button>
        </div>
        <div class="launcher-grid"${pageIndex === 0 ? ' id="launcherGrid"' : ""} aria-label="${pageIndex + 1}. sayfadaki uygulamalar">${apps.join("")}</div>
        ${empty ? `<div class="launcher-empty-page"><strong>Bu sayfa boş</strong><span>${launcherState.isEditing ? "Buraya bir uygulama veya widget ekleyebilirsin." : "Düzenleme modunda bu sayfaya öğe ekleyebilirsin."}</span></div>` : ""}
      </section>
    </div>
  </section>`;
}

function renderPages() {
  const track = document.getElementById("launcherPagesTrack");
  if (!track) return;
  if (isDesktopLauncher()) {
    track.innerHTML = renderDesktopWorkspace();
  } else {
    distributePagedOverflow();
    track.innerHTML = launcherState.layout.pages.map(renderPage).join("");
  }
  updatePagePosition(false);
  const date = document.getElementById("launcherWidgetDate");
  if (date) {
    const now = new Date();
    date.textContent = new Intl.DateTimeFormat("tr-TR", { weekday: "short", day: "numeric", month: "short" }).format(now);
    date.dateTime = now.toISOString().slice(0, 10);
  }
  requestAnimationFrame(() => window.updateDashboardStats?.());
}

function renderPageControls() {
  const controls = document.getElementById("launcherPageControls");
  if (!controls) return;
  controls.hidden = isDesktopLauncher() || (!launcherState.isEditing && launcherState.layout.pages.length <= 1);
  if (isDesktopLauncher()) {
    controls.innerHTML = "";
    controls.setAttribute("aria-label", "Tek masaüstü çalışma alanı");
    return;
  }
  controls.innerHTML = launcherState.layout.pages.map((_, index) => {
    const active = index === launcherState.layout.activePage;
    return `<button class="launcher-page-dot${active ? " is-active" : ""}" type="button" data-launcher-page-go="${index}" aria-label="${index + 1}. sayfaya git"${active ? ' aria-current="page"' : ""}><span aria-hidden="true"></span></button>`;
  }).join("");
  controls.setAttribute("aria-label", `${launcherState.layout.activePage + 1}. sayfa, ${launcherState.layout.pages.length} sayfadan`);
}

function renderDock() {
  const dock = document.getElementById("launcherDock");
  if (!dock) return;
  const source = launcherState.drag;
  dock.innerHTML = launcherState.layout.dock.map((id, index) => {
    const item = resolveLauncherItem(id);
    if (!item) return "";
    const isDraggedSource = source?.sourceContext === "dock" && source.itemId === id;
    return `<div class="launcher-slot launcher-slot--dock${isDraggedSource ? " is-drag-placeholder" : ""}" data-launcher-slot data-launcher-context="dock" data-launcher-index="${index}" data-launcher-type="app" data-launcher-id="${escapeHtml(id)}">
      ${isDraggedSource ? "" : appButton(item, "dock")}
      ${launcherState.isEditing && item.removable !== false ? removeButton(item.title, "app") : ""}
    </div>`;
  }).join("");
  dock.classList.toggle("is-editing", launcherState.isEditing);
}

function updatePagePosition(animate = true) {
  const track = document.getElementById("launcherPagesTrack");
  if (track) {
    track.classList.toggle("is-instant", !animate);
    track.style.transform = isDesktopLauncher() ? "translate3d(0, 0, 0)" : `translate3d(${-launcherState.layout.activePage * 100}%, 0, 0)`;
    requestAnimationFrame(() => track.classList.remove("is-instant"));
  }
  document.querySelectorAll(".launcher-page").forEach((page, index) => {
    const active = index === launcherState.layout.activePage;
    page.classList.toggle("is-active", active);
    if (active) page.removeAttribute("inert");
    else page.setAttribute("inert", "");
  });
  renderPageControls();
  updatePageArrows();
}

function updatePageArrows() {
  document.querySelectorAll("[data-launcher-page-step]").forEach((button) => {
    const direction = Number(button.dataset.launcherPageStep);
    button.hidden = !launcherState.isEditing || isDesktopLauncher();
    button.disabled = direction < 0 ? launcherState.layout.activePage === 0 : false;
  });
}

function setActivePage(index, { save = true, animate = true } = {}) {
  if (isDesktopLauncher()) return;
  const next = Math.max(0, Math.min(index, launcherState.layout.pages.length - 1));
  launcherState.layout.activePage = next;
  if (save) persistLayouts();
  updatePagePosition(animate);
}

export function renderLauncherHome() {
  renderPages();
  renderDock();
  renderPageControls();
  syncLauncherActive(document.body.dataset.currentRoute || "ana-sayfa");
  syncEditingUi();
}

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function remember(itemId) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([itemId, ...readRecent().filter((id) => id !== itemId)].slice(0, 6)));
  } catch {
    // Depolama kullanılamazsa launcher yine çalışır.
  }
}

function focusableWithin(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => !node.hidden && node.offsetParent !== null);
}

function trapDialogFocus(event, dialog) {
  if (event.key !== "Tab" || !dialog) return;
  const focusable = focusableWithin(dialog);
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showLayer(layer, dialog, trigger) {
  if (closingTimer) clearTimeout(closingTimer);
  layer.hidden = false;
  document.body.classList.add("launcher-overlay-open");
  requestAnimationFrame(() => {
    layer.classList.add("is-open");
    requestAnimationFrame(() => dialog.focus({ preventScroll: true }));
  });
  return trigger;
}

function hideLayer(layer, trigger, restoreFocus = true) {
  layer.classList.remove("is-open");
  document.body.classList.remove("launcher-overlay-open");
  closingTimer = setTimeout(() => {
    layer.hidden = true;
    if (restoreFocus) trigger?.focus?.({ preventScroll: true });
  }, OVERLAY_TRANSITION_MS);
}

function pushOverlayHistory(kind, id = "") {
  history.pushState({ ...(history.state || {}), launcherOverlay: kind, launcherOverlayId: id }, "", location.href);
}

export function openLauncherFolder(groupId, trigger = document.activeElement, pushHistory = true) {
  const group = resolveLauncherGroup(groupId);
  const isCustom = launcherState.layouts.folders.some((folder) => folder.id === groupId);
  if (launcherState.isEditing && !isCustom) return;
  const layer = document.getElementById("launcherFolderLayer");
  const dialog = document.getElementById("launcherFolderDialog");
  const grid = document.getElementById("launcherFolderGrid");
  const title = document.getElementById("launcherFolderTitle");
  if (!group?.items || !layer || !dialog || !grid || !title) return;
  closeLauncherSearch(false, false);
  closeLauncherEditor(false);
  folderTrigger = showLayer(layer, dialog, trigger);
  launcherState.openFolderId = groupId;
  title.textContent = group.title;
  grid.innerHTML = launcherState.isEditing && isCustom
    ? `<label class="launcher-folder-name-field"><span>Klasör adı</span><input type="text" maxlength="40" value="${escapeHtml(group.title)}" data-launcher-folder-name="${escapeHtml(groupId)}"></label>${group.items.map((item) => `<div class="launcher-folder-edit-item">${appButton(item, "folder")}<button type="button" class="launcher-folder-item-remove" data-launcher-folder-remove="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} uygulamasını klasörden çıkar">−</button></div>`).join("")}`
    : group.items.map((item) => appButton(item, "folder")).join("");
  document.querySelectorAll(`[data-launcher-folder="${groupId}"]`).forEach((button) => button.setAttribute("aria-expanded", "true"));
  if (pushHistory) pushOverlayHistory("folder", groupId);
}

export function closeLauncherFolder(useHistory = true, restoreFocus = true) {
  const layer = document.getElementById("launcherFolderLayer");
  if (!layer || layer.hidden) return;
  document.querySelectorAll("[data-launcher-folder]").forEach((button) => button.setAttribute("aria-expanded", "false"));
  if (useHistory && history.state?.launcherOverlay === "folder") {
    history.back();
    return;
  }
  launcherState.openFolderId = null;
  hideLayer(layer, folderTrigger, restoreFocus);
}

function searchEntries(query = "") {
  const normalized = normalizeSearchText(query);
  const customFolders = launcherState.layouts.folders.map((folder) => ({ ...folder, searchIndex: createSearchIndex(folder.title, "klasör") }));
  const apps = launcherRegistryEntries(customFolders)
    .filter((item) => item.searchable !== false)
    .map((item) => ({ ...item, resultType: item.type === "game" || item.type === "link" ? "Oyun" : item.type === "folder" ? "Klasör" : "Uygulama", searchIndex: item.searchIndex || createSearchIndex(item.title, item.category, item.keywords) }));
  const all = [...apps, ...TOPIC_SEARCH_ENTRIES];
  if (!normalized) {
    const recent = readRecent().map(findLauncherItem).filter(Boolean);
    return (recent.length ? recent : apps.slice(0, 8)).map((item) => ({ ...item, resultType: item.resultType || (item.type === "game" || item.type === "link" ? "Oyun" : "Uygulama") }));
  }
  return all.filter((item) => matchesSearchIndex(item.searchIndex || createSearchIndex(item.title, item.subtitle, item.resultType), normalized)).slice(0, 16);
}

function renderSearchResults(query = "") {
  const root = document.getElementById("launcherSearchResults");
  if (!root) return;
  const results = searchEntries(query);
  if (!results.length) {
    root.innerHTML = '<p class="launcher-search-empty">Bu aramaya uygun uygulama, oyun veya ders bulunamadı.</p>';
    return;
  }
  root.innerHTML = results.map((item) => `<button class="launcher-search-result" type="button" ${item.topicId ? `data-launcher-topic="${escapeHtml(item.topicId)}"` : itemActionAttributes(item)}>
    <span class="launcher-search-result-icon launcher-tone-${escapeHtml(item.tone || "home")}">${iconMarkup(item, true)}</span>
    <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle || item.resultType)}</small></span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>
  </button>`).join("");
}

export function openLauncherSearch(trigger = document.activeElement, pushHistory = true) {
  if (launcherState.isEditing) return;
  const layer = document.getElementById("launcherSearchLayer");
  const dialog = document.getElementById("launcherSearchDialog");
  const input = document.getElementById("launcherSearchInput");
  if (!layer || !dialog || !input) return;
  closeLauncherFolder(false, false);
  closeLauncherEditor(false);
  searchTrigger = showLayer(layer, dialog, trigger);
  input.value = "";
  renderSearchResults();
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
  if (pushHistory) pushOverlayHistory("search");
}

export function closeLauncherSearch(useHistory = true, restoreFocus = true) {
  const layer = document.getElementById("launcherSearchLayer");
  if (!layer || layer.hidden) return;
  if (useHistory && history.state?.launcherOverlay === "search") {
    history.back();
    return;
  }
  hideLayer(layer, searchTrigger, restoreFocus);
}

function pageSelectMarkup() {
  if (isDesktopLauncher()) return '<p class="launcher-editor-workspace-label">Öğe masaüstü çalışma alanına eklenecek.</p>';
  return `<label class="launcher-editor-page-select"><span>Eklenecek sayfa</span><select id="launcherEditorTargetPage">${launcherState.layout.pages.map((_, index) => `<option value="${index}"${index === launcherState.layout.activePage ? " selected" : ""}>${index + 1}. sayfa</option>`).join("")}</select></label>`;
}

function editorAppsMarkup() {
  const placed = new Set(launcherState.layout.pages.flatMap((page) => page.items.filter((item) => item.type !== "widget").map((item) => item.id)));
  const customFolders = launcherState.layouts.folders.map((folder) => resolveLauncherGroup(folder.id)).filter(Boolean);
  const entries = launcherRegistryEntries(customFolders).filter((item) => !placed.has(item.id) || launcherState.layout.hiddenApps.includes(item.id));
  return `${pageSelectMarkup()}<label class="launcher-editor-filter"><span class="sr-only">Uygulamalarda ara</span><input type="search" placeholder="Uygulama ara" autocomplete="off" data-launcher-editor-filter></label><div class="launcher-editor-grid">${entries.length ? entries.map((item) => `<button class="launcher-editor-choice" type="button" data-search-index="${escapeHtml(item.searchIndex || createSearchIndex(item.title, item.category, item.keywords))}" data-launcher-add-app="${escapeHtml(item.id)}">
    <span class="launcher-search-result-icon launcher-tone-${escapeHtml(item.tone || "home")}">${item.type === "folder" ? folderPreview(item) : iconMarkup(item, true)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${item.type === "folder" ? "Klasör" : "Uygulama"}</small></span><span aria-hidden="true">＋</span>
  </button>`).join("") : '<p class="launcher-editor-empty">Eklenebilecek başka bir uygulama yok.</p>'}</div>`;
}

function editorWidgetsMarkup() {
  const placed = new Set(launcherState.layout.pages.flatMap((page) => page.items.filter((item) => item.type === "widget").map((item) => item.id)));
  const available = LAUNCHER_WIDGETS.filter((widget) => !placed.has(widget.id));
  return `${pageSelectMarkup()}<label class="launcher-editor-filter"><span class="sr-only">Widget'larda ara</span><input type="search" placeholder="Widget ara" autocomplete="off" data-launcher-editor-filter></label><div class="launcher-widget-gallery">${available.length ? available.map((widget) => `<button class="launcher-widget-choice" type="button" data-search-index="${escapeHtml(widget.searchIndex)}" data-launcher-add-widget="${escapeHtml(widget.id)}">
    <span><small>${escapeHtml(widget.size)}</small><strong>${escapeHtml(widget.title)}</strong><em>${escapeHtml(widget.description)}</em></span><span aria-hidden="true">＋</span>
  </button>`).join("") : '<p class="launcher-editor-empty">Tüm widget’lar ana ekranda bulunuyor.</p>'}</div>`;
}

function editorResetMarkup() {
  return `<div class="launcher-reset-confirm"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/></svg><p><strong>Varsayılan düzen geri yüklensin mi?</strong><span>Uygulama, çalışma, oyun ve Firebase verileri silinmeyecek. Yalnız ana ekran yerleşimi sıfırlanacak.</span></p><div><button type="button" data-launcher-editor-close>İptal</button><button class="launcher-danger-action" type="button" data-launcher-reset-confirm>Yalnız düzeni sıfırla</button></div></div>`;
}

function editorRemoveMarkup() {
  return `<div class="launcher-reset-confirm"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg><p><strong>Ana ekrandan kaldırılsın mı?</strong><span>Uygulama ve kayıtlar silinmeyecek.</span></p><div><button type="button" data-launcher-editor-close>İptal</button><button class="launcher-danger-action" type="button" data-launcher-remove-confirm>Kaldır</button></div></div>`;
}

function openLauncherEditor(kind, trigger = document.activeElement) {
  if (!launcherState.isEditing) return;
  const layer = document.getElementById("launcherEditorLayer");
  const dialog = document.getElementById("launcherEditorDialog");
  const title = document.getElementById("launcherEditorTitle");
  const content = document.getElementById("launcherEditorContent");
  const kicker = document.getElementById("launcherEditorKicker");
  if (!layer || !dialog || !title || !content || !kicker) return;
  closeLauncherFolder(false, false);
  closeLauncherSearch(false, false);
  const views = {
    apps: ["Uygulama ekle", "Launcher uygulamaları", editorAppsMarkup()],
    widgets: ["Widget ekle", "Gerçek çalışma verileri", editorWidgetsMarkup()],
    reset: ["Düzeni geri yükle", "Yalnız ana ekran", editorResetMarkup()],
    remove: ["Ana ekrandan kaldır", "Veriler korunur", editorRemoveMarkup()]
  };
  const [heading, label, markup] = views[kind] || views.apps;
  title.textContent = heading;
  kicker.textContent = label;
  content.innerHTML = markup;
  editorTrigger = showLayer(layer, dialog, trigger);
}

function closeLauncherEditor(restoreFocus = true) {
  const layer = document.getElementById("launcherEditorLayer");
  if (!layer || layer.hidden) return;
  launcherState.pendingRemove = null;
  hideLayer(layer, editorTrigger, restoreFocus);
}

function filterEditorChoices(query) {
  const normalized = normalizeSearchText(query);
  const content = document.getElementById("launcherEditorContent");
  content?.querySelectorAll("[data-search-index]").forEach((choice) => {
    choice.hidden = !matchesSearchIndex(choice.dataset.searchIndex, normalized);
  });
}

function selectedEditorPage() {
  const select = document.getElementById("launcherEditorTargetPage");
  return Math.max(0, Math.min(Number(select?.value ?? launcherState.layout.activePage), launcherState.layout.pages.length - 1));
}

function addAppToPage(itemId) {
  const item = resolveLauncherItem(itemId);
  if (!item) return;
  const alreadyPlaced = launcherState.layout.pages.some((page) => page.items.some((entry) => entry.type !== "widget" && entry.id === itemId));
  if (alreadyPlaced) return announce(`${item.title} zaten ana ekranda.`);
  const pageIndex = selectedEditorPage();
  launcherState.layout.pages[pageIndex].items.push({ type: item.type === "folder" ? "folder" : "app", id: itemId });
  launcherState.layout.hiddenApps = launcherState.layout.hiddenApps.filter((id) => id !== itemId);
  launcherState.layout.activePage = pageIndex;
  persistAndRender();
  closeLauncherEditor(false);
  announce(`${item.title}, ${pageIndex + 1}. sayfaya eklendi.`);
}

function addWidgetToPage(widgetId) {
  const definition = LAUNCHER_WIDGETS.find((widget) => widget.id === widgetId);
  if (!definition) return;
  const exists = launcherState.layout.pages.some((page) => page.items.some((item) => item.type === "widget" && item.id === widgetId));
  if (exists) return announce(`${definition.title} zaten ana ekranda.`);
  const pageIndex = selectedEditorPage();
  launcherState.layout.pages[pageIndex].items.unshift({ type: "widget", id: widgetId, size: definition.size });
  launcherState.layout.activePage = pageIndex;
  persistAndRender();
  closeLauncherEditor(false);
  announce(`${definition.title}, ${pageIndex + 1}. sayfaya eklendi.`);
}

function openRemoveConfirmation(slot) {
  if (!slot) return;
  launcherState.pendingRemove = {
    context: slot.dataset.launcherContext,
    itemId: slot.dataset.launcherId,
    pageIndex: Number(slot.dataset.launcherPage),
    itemType: slot.dataset.launcherType
  };
  openLauncherEditor("remove", slot.querySelector("[data-launcher-remove]") || slot);
}

function removeLauncherItemNow(removal = launcherState.pendingRemove) {
  if (!removal) return;
  const { context, itemId, pageIndex } = removal;
  if (context === "dock") {
    launcherState.layout.dock = launcherState.layout.dock.filter((id) => id !== itemId);
    announce(`${resolveLauncherItem(itemId)?.title || itemId} dock'tan kaldırıldı.`);
  } else {
    const page = launcherState.layout.pages[pageIndex];
    const entry = page?.items.find((item) => item.id === itemId);
    if (!entry) return;
    page.items = page.items.filter((item) => !(item.id === itemId && item.type === entry.type));
    if (entry.type !== "widget" && !launcherState.layout.hiddenApps.includes(itemId)) launcherState.layout.hiddenApps.push(itemId);
    const label = entry.type === "widget" ? LAUNCHER_WIDGETS.find((widget) => widget.id === itemId)?.title : resolveLauncherItem(itemId)?.title;
    announce(`${label || itemId} ana ekrandan kaldırıldı. Verileri korunuyor.`);
  }
  launcherState.pendingRemove = null;
  closeLauncherEditor(false);
  persistAndRender();
}

function removeAppFromCustomFolder(itemId) {
  const folderId = launcherState.openFolderId;
  const folder = launcherState.layouts.folders.find((entry) => entry.id === folderId);
  if (!folder || !folder.items.includes(itemId)) return;
  folder.items = folder.items.filter((id) => id !== itemId);
  for (const page of launcherState.layout.pages) {
    const folderIndex = page.items.findIndex((entry) => entry.id === folderId);
    if (folderIndex < 0) continue;
    const additions = [];
    if (folder.items.length < 2) {
      additions.push(...folder.items.map((id) => ({ type: "app", id })));
      page.items.splice(folderIndex, 1, ...additions);
      launcherState.layouts.folders = launcherState.layouts.folders.filter((entry) => entry.id !== folderId);
    }
    if (!page.items.some((entry) => entry.id === itemId)) {
      const insertAt = folder.items.length < 2 ? folderIndex + additions.length : folderIndex + 1;
      page.items.splice(insertAt, 0, { type: "app", id: itemId });
    }
    break;
  }
  const survives = folder.items.length >= 2;
  closeLauncherFolder(false, false);
  persistAndRender();
  announce(survives ? `${resolveLauncherItem(itemId)?.title || itemId} klasörden çıkarıldı.` : "İki uygulamadan az kaldığı için klasör kaldırıldı.");
  if (survives) requestAnimationFrame(() => openLauncherFolder(folderId, document.querySelector(`[data-launcher-folder="${CSS.escape(folderId)}"]`), false));
}

function renameCustomFolder(folderId, value) {
  const folder = launcherState.layouts.folders.find((entry) => entry.id === folderId);
  const title = String(value || "").trim().slice(0, 40);
  if (!folder || !title || title === folder.title) return;
  folder.title = title;
  const heading = document.getElementById("launcherFolderTitle");
  if (heading) heading.textContent = title;
  persistLayouts();
  announce(`Klasör adı ${title} olarak değiştirildi.`);
}

function addPage({ focus = true } = {}) {
  if (isDesktopLauncher()) return announce("Masaüstü düzeni tek çalışma alanı kullanır.");
  launcherState.layout.pages.push(createLauncherPage());
  launcherState.layout.activePage = launcherState.layout.pages.length - 1;
  persistAndRender();
  announce(`${launcherState.layout.pages.length}. sayfa eklendi.`);
  if (focus) requestAnimationFrame(() => document.querySelector(`[data-launcher-page-go="${launcherState.layout.activePage}"]`)?.focus());
}

function persistAndRender() {
  persistLayouts();
  renderLauncherHome();
}

function syncEditingUi() {
  document.body.classList.toggle("launcher-editing", launcherState.isEditing);
  document.documentElement.classList.toggle("launcher-editing", launcherState.isEditing);
  const toolbar = document.getElementById("launcherEditToolbar");
  if (toolbar) toolbar.hidden = !launcherState.isEditing;
  const toggle = document.getElementById("launcherEditToggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(launcherState.isEditing));
    toggle.setAttribute("aria-label", launcherState.isEditing ? "Düzenlemeyi bitir" : "Ana ekranı düzenle");
  }
  document.querySelectorAll("[data-launcher-page-step]").forEach((button) => { button.hidden = !launcherState.isEditing; });
  document.querySelectorAll("[data-launcher-add-page]").forEach((button) => { button.hidden = isDesktopLauncher(); });
  const search = document.getElementById("launcherSearchOpen");
  if (search) search.disabled = launcherState.isEditing;
  updatePageArrows();
}

function setEditing(value, { restoreFocus = false } = {}) {
  const next = Boolean(value);
  if (next === launcherState.isEditing) return;
  if (next) {
    closeLauncherFolder(false, false);
    closeLauncherSearch(false, false);
    launcherState.isEditing = true;
    syncEditingUi();
    renderLauncherHome();
    announce("Düzenleme modu açıldı. Öğeleri sürükleyebilir veya klavyeyle taşıyabilirsin.");
  } else {
    cancelPointerDrag();
    cancelKeyboardMove(false);
    closeLauncherEditor(false);
    cleanTrailingEmptyPages(launcherState.layout);
    persistLayouts();
    launcherState.isEditing = false;
    renderLauncherHome();
    syncEditingUi();
    announce("Düzenleme tamamlandı.");
    if (restoreFocus) requestAnimationFrame(() => document.getElementById("launcherEditToggle")?.focus());
  }
}

function announce(message) {
  const region = document.getElementById("launcherLiveRegion");
  if (!region) return;
  region.textContent = "";
  requestAnimationFrame(() => { region.textContent = message; });
}

async function activateTopic(topicId) {
  closeLauncherSearch(false, false);
  await window.navigate?.("calisma-merkezi");
  requestAnimationFrame(() => window.openStudyTopic?.(topicId));
}

async function activateItem(item, trigger) {
  if (!item || launcherState.isEditing) return;
  if (item.type === "folder") return openLauncherFolder(item.id, trigger);
  remember(item.id);
  closeLauncherFolder(false, false);
  closeLauncherSearch(false, false);
  if (item.type === "link" && item.href) return location.assign(item.href);
  if (item.type === "game") {
    await window.navigate?.("oyun");
    requestAnimationFrame(() => document.querySelector(`[data-game="${item.gameId}"]`)?.click());
    return;
  }
  if (item.route) await window.navigate?.(item.route);
}

function handleLauncherClick(event) {
  const editToggle = event.target.closest("#launcherEditToggle");
  if (editToggle) return setEditing(!launcherState.isEditing, { restoreFocus: true });
  if (event.target.closest("[data-launcher-done]")) return setEditing(false, { restoreFocus: true });
  const editorOpen = event.target.closest("[data-launcher-editor]");
  if (editorOpen) return openLauncherEditor(editorOpen.dataset.launcherEditor, editorOpen);
  if (event.target.closest("[data-launcher-editor-close]")) return closeLauncherEditor();
  if (event.target.closest("[data-launcher-reset-confirm]")) {
    launcherState.layouts = resetLauncherLayout();
    launcherState.layout = launcherState.layouts[launcherState.device];
    closeLauncherEditor(false);
    renderLauncherHome();
    return announce("Varsayılan ana ekran düzeni geri yüklendi.");
  }
  if (event.target.closest("[data-launcher-remove-confirm]")) return removeLauncherItemNow();
  const addApp = event.target.closest("[data-launcher-add-app]");
  if (addApp) return addAppToPage(addApp.dataset.launcherAddApp);
  const addWidget = event.target.closest("[data-launcher-add-widget]");
  if (addWidget) return addWidgetToPage(addWidget.dataset.launcherAddWidget);
  if (event.target.closest("[data-launcher-add-page]")) return addPage();
  const remove = event.target.closest("[data-launcher-remove]");
  if (remove) return openRemoveConfirmation(remove.closest("[data-launcher-slot]"));
  const folderRemove = event.target.closest("[data-launcher-folder-remove]");
  if (folderRemove) return removeAppFromCustomFolder(folderRemove.dataset.launcherFolderRemove);
  const folderEdit = event.target.closest("[data-launcher-folder-edit]");
  if (folderEdit) return openLauncherFolder(folderEdit.dataset.launcherFolderEdit, folderEdit);
  const pageGo = event.target.closest("[data-launcher-page-go]");
  if (pageGo) return setActivePage(Number(pageGo.dataset.launcherPageGo));
  const pageStep = event.target.closest("[data-launcher-page-step]");
  if (pageStep) {
    const direction = Number(pageStep.dataset.launcherPageStep);
    if (direction > 0 && launcherState.layout.activePage === launcherState.layout.pages.length - 1 && launcherState.isEditing) return addPage();
    return setActivePage(launcherState.layout.activePage + direction);
  }
  const inlineSearch = event.target.closest("[data-launcher-search-inline]");
  if (inlineSearch) return openLauncherSearch(inlineSearch);
  const widgetRoute = event.target.closest("[data-launcher-widget-route]");
  if (widgetRoute) {
    if (!launcherState.isEditing) window.navigate?.(widgetRoute.dataset.launcherWidgetRoute);
    return;
  }
  const folderButton = event.target.closest("[data-launcher-folder]");
  if (folderButton) {
    const isCustom = launcherState.layouts.folders.some((folder) => folder.id === folderButton.dataset.launcherFolder);
    return launcherState.isEditing && !isCustom ? undefined : openLauncherFolder(folderButton.dataset.launcherFolder, folderButton);
  }
  const topicButton = event.target.closest("[data-launcher-topic]");
  if (topicButton) return launcherState.isEditing ? undefined : activateTopic(topicButton.dataset.launcherTopic);
  const itemButton = event.target.closest("[data-launcher-item]");
  if (itemButton) return activateItem(resolveLauncherItem(itemButton.dataset.launcherItem), itemButton);
}

function dragElementForSlot(slot) {
  return slot.querySelector(":scope > .launcher-app, :scope > .launcher-widget");
}

function pointerDragStart(event, slot) {
  if (!launcherState.isEditing || launcherState.drag || event.button > 0) return;
  const element = dragElementForSlot(slot);
  const layer = document.getElementById("launcherDragLayer");
  if (!element || !layer) return;
  event.preventDefault();
  const rect = element.getBoundingClientRect();
  element.setPointerCapture?.(event.pointerId);
  launcherState.drag = {
    pointerId: event.pointerId,
    itemId: slot.dataset.launcherId,
    itemType: slot.dataset.launcherType,
    sourceContext: slot.dataset.launcherContext,
    sourcePage: Number(slot.dataset.launcherPage),
    sourceIndex: Number(slot.dataset.launcherIndex),
    element,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    rect,
    frame: 0,
    target: null,
    edgeDirection: 0,
    edgeTimer: 0,
    folderTimer: 0,
    folderTargetId: null,
    folderReadyId: null
  };
  slot.classList.add("is-drag-placeholder");
  element.classList.add("is-dragging");
  Object.assign(element.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    zIndex: "1",
    pointerEvents: "none"
  });
  layer.append(element);
  document.body.classList.add("launcher-dragging");
  announce(`${resolveLauncherItem(slot.dataset.launcherId)?.title || LAUNCHER_WIDGETS.find((widget) => widget.id === slot.dataset.launcherId)?.title || slot.dataset.launcherId} taşınmaya başladı.`);
}

function scheduleDragFrame() {
  const drag = launcherState.drag;
  if (!drag || drag.frame) return;
  drag.frame = requestAnimationFrame(() => {
    drag.frame = 0;
    const dx = drag.x - drag.startX;
    const dy = drag.y - drag.startY;
    drag.element.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.035)`;
  });
}

function clearDropTarget() {
  document.querySelectorAll(".is-drop-target, .is-folder-ready").forEach((node) => node.classList.remove("is-drop-target", "is-folder-ready"));
}

function dragTargetAt(x, y) {
  const node = document.elementFromPoint(x, y);
  const slot = node?.closest?.("[data-launcher-slot]");
  if (slot) return slot;
  const dock = node?.closest?.("#launcherDock");
  if (dock) return dock;
  return node?.closest?.(".launcher-page.is-active") || document.querySelector(".launcher-page.is-active");
}

function armEdgeDwell(direction) {
  const drag = launcherState.drag;
  if (!drag) return;
  if (drag.edgeDirection === direction && drag.edgeTimer) return;
  if (drag.edgeTimer) clearTimeout(drag.edgeTimer);
  drag.edgeDirection = direction;
  drag.edgeTimer = direction ? setTimeout(() => {
    const current = launcherState.drag;
    if (!current || current.edgeDirection !== direction) return;
    let next = launcherState.layout.activePage + direction;
    if (direction > 0 && next >= launcherState.layout.pages.length) {
      launcherState.layout.pages.push(createLauncherPage());
      persistLayouts();
      renderPages();
      renderPageControls();
      next = launcherState.layout.pages.length - 1;
      announce(`${next + 1}. sayfa otomatik oluşturuldu.`);
    }
    if (next >= 0 && next < launcherState.layout.pages.length) setActivePage(next, { animate: true });
    current.edgeTimer = 0;
    current.edgeDirection = 0;
  }, EDGE_DWELL_MS) : 0;
}

function armFolderDwell(target) {
  const drag = launcherState.drag;
  if (!drag) return;
  const targetId = target?.dataset?.launcherId || null;
  const eligible = target?.dataset?.launcherContext === "page"
    && drag.sourceContext === "page"
    && drag.itemType !== "widget"
    && target?.dataset?.launcherType !== "widget"
    && targetId
    && targetId !== drag.itemId;
  const nextTargetId = eligible ? targetId : null;
  if (drag.folderTargetId === nextTargetId) {
    if (drag.folderReadyId === nextTargetId) target?.classList.add("is-folder-ready");
    return;
  }
  if (drag.folderTimer) clearTimeout(drag.folderTimer);
  drag.folderTimer = 0;
  drag.folderTargetId = nextTargetId;
  drag.folderReadyId = null;
  if (!nextTargetId) return;
  drag.folderTimer = setTimeout(() => {
    const current = launcherState.drag;
    if (!current || current.folderTargetId !== nextTargetId) return;
    current.folderTimer = 0;
    current.folderReadyId = nextTargetId;
    current.target?.classList?.add("is-folder-ready");
    announce("Klasör hedefi hazır. Bırakarak klasöre ekleyebilirsin.");
  }, FOLDER_DWELL_MS);
}

function handlePointerMove(event) {
  const longPress = launcherState.longPress;
  if (longPress?.pointerId === event.pointerId && Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y) > 10) cancelEditLongPress();
  const drag = launcherState.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (event.cancelable) event.preventDefault();
  drag.x = event.clientX;
  drag.y = event.clientY;
  scheduleDragFrame();
  clearDropTarget();
  drag.target = dragTargetAt(drag.x, drag.y);
  drag.target?.classList?.add("is-drop-target");
  armFolderDwell(drag.target);
  const direction = drag.x <= EDGE_ZONE_PX ? -1 : drag.x >= innerWidth - EDGE_ZONE_PX ? 1 : 0;
  armEdgeDwell(direction);
}

function dockCapacity() {
  if (launcherState.device === "mobile") return 4;
  if (launcherState.device === "desktop") return 10;
  return launcherState.orientation === "landscape" ? 8 : 6;
}

function pageItemIndex(page, drag) {
  return page.items.findIndex((item) => item.id === drag.itemId && item.type === drag.itemType);
}

function removePageEntry(page, itemId) {
  const index = page?.items.findIndex((item) => item.id === itemId) ?? -1;
  if (index < 0) return null;
  return page.items.splice(index, 1)[0];
}

function tryFolderDrop(drag, target, targetPage) {
  if (drag.itemType === "widget" || target?.dataset?.launcherContext !== "page") return false;
  const targetId = target.dataset.launcherId;
  const targetType = target.dataset.launcherType;
  if (!targetId || targetId === drag.itemId || targetType === "widget" || drag.folderReadyId !== targetId) return false;
  const sourcePage = launcherState.layout.pages[drag.sourcePage];
  const destinationPage = launcherState.layout.pages[targetPage];
  if (!sourcePage || !destinationPage) return false;

  const existingFolder = launcherState.layouts.folders.find((folder) => folder.id === targetId);
  if (existingFolder) {
    if (!existingFolder.items.includes(drag.itemId)) existingFolder.items.push(drag.itemId);
    removePageEntry(sourcePage, drag.itemId);
    launcherState.layout.activePage = targetPage;
    announce(`${resolveLauncherItem(drag.itemId)?.title || drag.itemId}, ${existingFolder.title} klasörüne eklendi.`);
    return true;
  }
  if (targetType !== "app") return false;
  const targetIndex = destinationPage.items.findIndex((item) => item.id === targetId);
  const folder = createCustomFolder(launcherState.layouts, [targetId, drag.itemId]);
  if (!folder) return false;
  removePageEntry(sourcePage, drag.itemId);
  removePageEntry(destinationPage, targetId);
  destinationPage.items.splice(Math.max(0, targetIndex), 0, { type: "folder", id: folder.id });
  launcherState.layout.activePage = targetPage;
  announce(`${resolveLauncherItem(targetId)?.title || targetId} ve ${resolveLauncherItem(drag.itemId)?.title || drag.itemId} için yeni klasör oluşturuldu.`);
  return true;
}

function positionDesktopDrop(drag) {
  if (!isDesktopLauncher()) return;
  const grid = document.querySelector(".launcher-desktop-grid");
  const rect = grid?.getBoundingClientRect();
  if (!rect?.width || !rect?.height) return;
  const { columns, rows } = desktopGridMetrics();
  const records = drag.itemType === "widget" ? launcherState.layout.widgets : launcherState.layout.items;
  const record = records.find((item) => item.id === drag.itemId);
  if (!record) return;
  const spanColumns = record.columns || 1;
  const spanRows = record.rows || 1;
  record.gridX = Math.max(1, Math.min(columns - spanColumns + 1, Math.floor((drag.x - rect.left) / (rect.width / columns)) + 1));
  record.gridY = Math.max(1, Math.min(rows - spanRows + 1, Math.floor((drag.y - rect.top) / (rect.height / rows)) + 1));
}

function applyPointerDrop(drag) {
  const target = drag.target;
  const targetContext = target?.dataset?.launcherContext || (target?.id === "launcherDock" ? "dock" : "page");
  const targetPage = Number(target?.dataset?.launcherPage ?? launcherState.layout.activePage);
  const targetIndex = Number(target?.dataset?.launcherIndex);
  if (drag.sourceContext === "dock") {
    const sourceDockIndex = launcherState.layout.dock.indexOf(drag.itemId);
    if (sourceDockIndex >= 0) launcherState.layout.dock.splice(sourceDockIndex, 1);
    if (targetContext === "dock") {
      const insertAt = Number.isFinite(targetIndex) ? Math.min(targetIndex, launcherState.layout.dock.length) : launcherState.layout.dock.length;
      launcherState.layout.dock.splice(insertAt, 0, drag.itemId);
      announce(`${resolveLauncherItem(drag.itemId)?.title || drag.itemId} dock içinde taşındı.`);
    } else {
      const exists = launcherState.layout.pages.some((page) => page.items.some((item) => item.type !== "widget" && item.id === drag.itemId));
      if (!exists) {
        const page = launcherState.layout.pages[targetPage];
        const insertAt = Number.isFinite(targetIndex) ? Math.min(targetIndex, page.items.length) : page.items.length;
        page.items.splice(insertAt, 0, { type: "app", id: drag.itemId });
      }
      announce(`${resolveLauncherItem(drag.itemId)?.title || drag.itemId} dock'tan ${targetPage + 1}. sayfaya taşındı.`);
    }
    return;
  }
  if (targetContext === "dock") {
    if (drag.itemType === "widget") return announce("Widget dock'a eklenemez.");
    if (!launcherState.layout.dock.includes(drag.itemId)) {
      if (launcherState.layout.dock.length >= dockCapacity()) return announce(`Dock kapasitesi ${dockCapacity()} uygulama.`);
      launcherState.layout.dock.push(drag.itemId);
    }
    return announce(`${resolveLauncherItem(drag.itemId)?.title || drag.itemId} dock'a eklendi.`);
  }
  if (tryFolderDrop(drag, target, targetPage)) return;
  const sourcePage = launcherState.layout.pages[drag.sourcePage];
  const destinationPage = launcherState.layout.pages[targetPage];
  if (!sourcePage || !destinationPage) return;
  const sourceIndex = pageItemIndex(sourcePage, drag);
  if (sourceIndex < 0) return;
  const [entry] = sourcePage.items.splice(sourceIndex, 1);
  let insertAt = Number.isFinite(targetIndex) ? targetIndex : destinationPage.items.length;
  if (sourcePage === destinationPage && sourceIndex < insertAt) insertAt -= 1;
  destinationPage.items.splice(Math.max(0, Math.min(insertAt, destinationPage.items.length)), 0, entry);
  launcherState.layout.activePage = targetPage;
  positionDesktopDrop(drag);
  announce(`${resolveLauncherItem(drag.itemId)?.title || LAUNCHER_WIDGETS.find((widget) => widget.id === drag.itemId)?.title || drag.itemId}, ${isDesktopLauncher() ? "masaüstünde yeni konumuna" : `${targetPage + 1}. sayfaya`} taşındı.`);
}

function finishPointerDrag(commit) {
  const drag = launcherState.drag;
  if (!drag) return;
  if (drag.frame) cancelAnimationFrame(drag.frame);
  if (drag.edgeTimer) clearTimeout(drag.edgeTimer);
  if (drag.folderTimer) clearTimeout(drag.folderTimer);
  clearDropTarget();
  if (commit) applyPointerDrop(drag);
  drag.element.releasePointerCapture?.(drag.pointerId);
  drag.element.remove();
  launcherState.drag = null;
  document.body.classList.remove("launcher-dragging");
  if (commit) persistLayouts();
  renderLauncherHome();
}

function cancelPointerDrag() {
  cancelEditLongPress();
  if (!launcherState.drag) return;
  announce("Taşıma iptal edildi.");
  finishPointerDrag(false);
}

function handlePointerUp(event) {
  if (launcherState.longPress?.pointerId === event.pointerId) cancelEditLongPress();
  if (launcherState.drag?.pointerId === event.pointerId) finishPointerDrag(true);
}

function startKeyboardMove(slot) {
  launcherState.keyboardMove = {
    itemId: slot.dataset.launcherId,
    itemType: slot.dataset.launcherType,
    context: slot.dataset.launcherContext,
    page: Number(slot.dataset.launcherPage),
    snapshot: JSON.parse(JSON.stringify(launcherState.layout))
  };
  slot.classList.add("is-keyboard-moving");
  const label = resolveLauncherItem(slot.dataset.launcherId)?.title || LAUNCHER_WIDGETS.find((widget) => widget.id === slot.dataset.launcherId)?.title || slot.dataset.launcherId;
  announce(`${label} taşınmaya başladı. Ok tuşlarıyla taşı, Enter ile bırak, Escape ile iptal et.`);
}

function cancelKeyboardMove(announceCancel = true) {
  const movement = launcherState.keyboardMove;
  if (!movement) return;
  launcherState.layout = movement.snapshot;
  launcherState.keyboardMove = null;
  renderLauncherHome();
  if (announceCancel) announce("Taşıma iptal edildi.");
}

function moveKeyboardWithinPage(direction) {
  const movement = launcherState.keyboardMove;
  if (isDesktopLauncher()) {
    const records = movement.itemType === "widget" ? launcherState.layout.widgets : launcherState.layout.items;
    const record = records.find((item) => item.id === movement.itemId);
    if (!record) return;
    const { columns, rows } = desktopGridMetrics();
    if (direction === "left") record.gridX = Math.max(1, record.gridX - 1);
    if (direction === "right") record.gridX = Math.min(columns - (record.columns || 1) + 1, record.gridX + 1);
    if (direction === "up") record.gridY = Math.max(1, record.gridY - 1);
    if (direction === "down") record.gridY = Math.min(rows - (record.rows || 1) + 1, record.gridY + 1);
    renderLauncherHome();
    announce("Masaüstünde bir ızgara adımı taşındı.");
    return;
  }
  const page = launcherState.layout.pages[movement.page];
  const index = pageItemIndex(page, { itemId: movement.itemId, itemType: movement.itemType });
  if (index < 0) return;
  const columns = launcherState.device === "mobile" ? 4 : launcherState.orientation === "portrait" ? 5 : innerWidth >= 1120 ? 7 : 6;
  const delta = direction === "left" ? -1 : direction === "right" ? 1 : direction === "up" ? -columns : columns;
  const next = Math.max(0, Math.min(index + delta, page.items.length - 1));
  if (next === index) return;
  const [entry] = page.items.splice(index, 1);
  page.items.splice(next, 0, entry);
  renderLauncherHome();
  requestAnimationFrame(() => document.querySelector(`[data-launcher-context="page"][data-launcher-page="${movement.page}"][data-launcher-id="${CSS.escape(movement.itemId)}"] .launcher-app, [data-launcher-context="page"][data-launcher-page="${movement.page}"][data-launcher-id="${CSS.escape(movement.itemId)}"] .launcher-widget`)?.focus?.());
  announce(`${movement.page + 1}. sayfa, ${next + 1}. konuma taşındı.`);
}

function moveKeyboardPage(direction) {
  const movement = launcherState.keyboardMove;
  if (movement.context === "dock" || isDesktopLauncher()) return;
  let nextPage = movement.page + direction;
  if (nextPage >= launcherState.layout.pages.length) launcherState.layout.pages.push(createLauncherPage());
  nextPage = Math.max(0, Math.min(nextPage, launcherState.layout.pages.length - 1));
  if (nextPage === movement.page) return;
  const source = launcherState.layout.pages[movement.page];
  const index = pageItemIndex(source, { itemId: movement.itemId, itemType: movement.itemType });
  if (index < 0) return;
  const [entry] = source.items.splice(index, 1);
  launcherState.layout.pages[nextPage].items.push(entry);
  movement.page = nextPage;
  launcherState.layout.activePage = nextPage;
  renderLauncherHome();
  announce(`${nextPage + 1}. sayfaya taşındı.`);
}

function handleKeyboardMove(event, slot) {
  const movement = launcherState.keyboardMove;
  if (!movement) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      startKeyboardMove(slot);
      return true;
    }
    return false;
  }
  if (movement.itemId !== slot.dataset.launcherId || movement.context !== slot.dataset.launcherContext) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    cancelKeyboardMove();
    return true;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    launcherState.keyboardMove = null;
    persistAndRender();
    announce("Öğe yeni konumuna bırakıldı.");
    return true;
  }
  if (event.key === "PageUp" || event.key === "PageDown" || ((event.ctrlKey || event.metaKey) && (event.key === "ArrowLeft" || event.key === "ArrowRight"))) {
    event.preventDefault();
    moveKeyboardPage(event.key === "PageUp" || event.key === "ArrowLeft" ? -1 : 1);
    return true;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    if (movement.context === "dock") {
      const index = launcherState.layout.dock.indexOf(movement.itemId);
      const next = Math.max(0, Math.min(index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1), launcherState.layout.dock.length - 1));
      launcherState.layout.dock.splice(index, 1);
      launcherState.layout.dock.splice(next, 0, movement.itemId);
      renderDock();
      announce(`Dock'ta ${next + 1}. konuma taşındı.`);
    } else moveKeyboardWithinPage(event.key.replace("Arrow", "").toLowerCase());
    return true;
  }
  return false;
}

function handleGlobalKeydown(event) {
  const folderLayer = document.getElementById("launcherFolderLayer");
  const searchLayer = document.getElementById("launcherSearchLayer");
  const editorLayer = document.getElementById("launcherEditorLayer");
  if (event.key === "Escape") {
    if (editorLayer && !editorLayer.hidden) { event.preventDefault(); closeLauncherEditor(); return; }
    if (searchLayer && !searchLayer.hidden) { event.preventDefault(); closeLauncherSearch(); return; }
    if (folderLayer && !folderLayer.hidden) { event.preventDefault(); closeLauncherFolder(); return; }
    if (launcherState.drag) { event.preventDefault(); cancelPointerDrag(); return; }
  }
  if (folderLayer && !folderLayer.hidden) trapDialogFocus(event, document.getElementById("launcherFolderDialog"));
  if (searchLayer && !searchLayer.hidden) trapDialogFocus(event, document.getElementById("launcherSearchDialog"));
  if (editorLayer && !editorLayer.hidden) trapDialogFocus(event, document.getElementById("launcherEditorDialog"));

  const slot = event.target.closest?.("[data-launcher-slot]");
  if (launcherState.isEditing && slot && handleKeyboardMove(event, slot)) return;
  if (launcherState.isEditing && !isDesktopLauncher() && !slot && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    if (direction > 0 && launcherState.layout.activePage === launcherState.layout.pages.length - 1) addPage({ focus: false });
    else setActivePage(launcherState.layout.activePage + direction);
    return;
  }
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  const shortcut = (event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k");
  if (shortcut && !launcherState.isEditing) {
    event.preventDefault();
    openLauncherSearch(document.getElementById("launcherSearchOpen"));
  }
}

function handleDocumentPointerDown(event) {
  if (!launcherState.isEditing || event.target.closest("[data-launcher-remove], [data-launcher-folder-edit], .launcher-edit-toolbar, .launcher-page-controls, .launcher-page-arrow")) return;
  const slot = event.target.closest("[data-launcher-slot]");
  if (slot) pointerDragStart(event, slot);
}

function cancelEditLongPress() {
  if (!launcherState.longPress) return;
  clearTimeout(launcherState.longPress.timer);
  launcherState.longPress = null;
}

function startEditLongPress(event) {
  cancelEditLongPress();
  if (launcherState.isEditing || document.body.dataset.currentRoute !== "ana-sayfa" || event.button > 0) return;
  if (!event.target.closest("#launcherPagesViewport") || event.target.closest("button, a, input, select, textarea, [data-launcher-slot], .launcher-widget")) return;
  const record = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: 0 };
  record.timer = setTimeout(() => {
    if (launcherState.longPress !== record) return;
    launcherState.longPress = null;
    launcherState.swipe = null;
    navigator.vibrate?.(18);
    setEditing(true);
  }, EDIT_LONG_PRESS_MS);
  launcherState.longPress = record;
}

function swipePointerDown(event) {
  if (isDesktopLauncher() || launcherState.drag || event.target.closest("button, a, input, select, [data-launcher-slot]")) return;
  launcherState.swipe = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), locked: false };
}

function swipePointerMove(event) {
  const swipe = launcherState.swipe;
  if (!swipe || swipe.pointerId !== event.pointerId || launcherState.drag) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (!swipe.locked && Math.hypot(dx, dy) > 10) swipe.locked = Math.abs(dx) > Math.abs(dy) * 1.25 ? "horizontal" : "vertical";
  if (swipe.locked === "horizontal" && event.cancelable) event.preventDefault();
}

function swipePointerUp(event) {
  const swipe = launcherState.swipe;
  if (!swipe || swipe.pointerId !== event.pointerId) return;
  launcherState.swipe = null;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  const velocity = Math.abs(dx) / Math.max(1, performance.now() - swipe.time);
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX && velocity < .45) return;
  if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;
  const direction = dx < 0 ? 1 : -1;
  if (direction > 0 && launcherState.layout.activePage === launcherState.layout.pages.length - 1) return;
  setActivePage(launcherState.layout.activePage + direction);
}

function handleTabletTrackpad(event) {
  if (launcherState.device !== "tablet" || launcherState.isEditing || launcherState.drag || !event.target.closest?.("#launcherPagesViewport")) return;
  if (Math.abs(event.deltaX) < 20 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
  const now = performance.now();
  if (now - launcherState.wheelPagingAt < 280) return;
  launcherState.wheelPagingAt = now;
  if (event.cancelable) event.preventDefault();
  setActivePage(launcherState.layout.activePage + (event.deltaX > 0 ? 1 : -1));
}

function handleViewportResize() {
  clearTimeout(launcherState.resizeTimer);
  launcherState.resizeTimer = setTimeout(() => {
    const nextDevice = launcherDeviceMode();
    const nextOrientation = launcherOrientation();
    const widthChanged = Math.abs(innerWidth - launcherState.viewportWidth) > 1;
    if (nextDevice === launcherState.device && nextOrientation === launcherState.orientation && !widthChanged) return;
    cancelPointerDrag();
    cancelKeyboardMove(false);
    closeLauncherFolder(false, false);
    closeLauncherSearch(false, false);
    closeLauncherEditor(false);
    persistLayouts();
    launcherState.device = nextDevice;
    launcherState.orientation = nextOrientation;
    launcherState.viewportWidth = innerWidth;
    launcherState.layout = launcherState.layouts[nextDevice];
    syncDeviceAttributes();
    renderLauncherHome();
    announce(`${nextDevice === "mobile" ? "Mobil" : nextDevice === "tablet" ? "Tablet" : "Masaüstü"} yerleşimine geçildi.`);
  }, 180);
}

export function syncLauncherActive(routeName) {
  document.body.dataset.currentRoute = routeName || "ana-sayfa";
  const activeDefinition = launcherItems().find((item) => item.route === routeName);
  const activeLabel = document.querySelector(".launcher-brand .love-brand-sub");
  if (activeLabel) activeLabel.textContent = routeName === "ana-sayfa" ? "Ana ekran" : activeDefinition?.title || "Öğrenme yolculuğu";
  if (routeName !== "ana-sayfa" && launcherState.isEditing) setEditing(false);
  document.querySelectorAll("[data-launcher-route]").forEach((button) => {
    const active = button.dataset.launcherRoute === routeName;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function setLauncherThemePreference(preference) {
  if (!["system", "light", "dark"].includes(preference)) return launcherState.layouts.themePreference;
  launcherState.layouts.themePreference = preference;
  persistLayouts();
  return preference;
}

function registerLauncherApp(entry) {
  const registered = registerLauncherEntry(entry);
  launcherState.layouts = saveLauncherLayout(launcherState.layouts);
  launcherState.layout = launcherState.layouts[launcherState.device];
  renderLauncherHome();
  return registered;
}

function unregisterLauncherApp(itemId) {
  if (!unregisterLauncherEntry(itemId)) return false;
  for (const mode of ["mobile", "tablet", "desktop"]) {
    const layout = launcherState.layouts[mode];
    layout.pages.forEach((page) => { page.items = page.items.filter((item) => item.id !== itemId); });
    layout.dock = layout.dock.filter((id) => id !== itemId);
    layout.hiddenApps = layout.hiddenApps.filter((id) => id !== itemId);
    if (mode === "desktop") {
      layout.items = layout.items.filter((item) => item.id !== itemId);
      layout.widgets = layout.widgets.filter((item) => item.id !== itemId);
    }
  }
  launcherState.layouts.folders.forEach((folder) => { folder.items = folder.items.filter((id) => id !== itemId); });
  launcherState.layouts.folders = launcherState.layouts.folders.filter((folder) => folder.items.length >= 2);
  launcherState.layouts = saveLauncherLayout(launcherState.layouts);
  launcherState.layout = launcherState.layouts[launcherState.device];
  renderLauncherHome();
  return true;
}

export function initLauncher() {
  if (initialized) return;
  initialized = true;
  syncDeviceAttributes();
  renderLauncherHome();
  document.addEventListener("click", handleLauncherClick);
  document.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.addEventListener("pointermove", handlePointerMove, { passive: false });
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", cancelPointerDrag);
  document.querySelectorAll("[data-launcher-close]").forEach((button) => button.addEventListener("click", () => closeLauncherFolder()));
  document.querySelectorAll("[data-launcher-search-close]").forEach((button) => button.addEventListener("click", () => closeLauncherSearch()));
  document.getElementById("launcherSearchInput")?.addEventListener("input", (event) => renderSearchResults(event.currentTarget.value));
  document.addEventListener("input", (event) => {
    if (event.target.matches?.("[data-launcher-editor-filter]")) filterEditorChoices(event.target.value);
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-launcher-folder-name]")) renameCustomFolder(event.target.dataset.launcherFolderName, event.target.value);
  });
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest("#launcherPagesViewport")) {
      startEditLongPress(event);
      swipePointerDown(event);
    }
  });
  document.addEventListener("pointermove", swipePointerMove, { passive: false });
  document.addEventListener("pointerup", swipePointerUp);
  document.addEventListener("wheel", handleTabletTrackpad, { passive: false });
  window.addEventListener("resize", handleViewportResize, { passive: true });
  window.addEventListener("popstate", (event) => {
    const folderLayer = document.getElementById("launcherFolderLayer");
    const searchLayer = document.getElementById("launcherSearchLayer");
    if (folderLayer && !folderLayer.hidden && event.state?.launcherOverlay !== "folder") closeLauncherFolder(false);
    if (searchLayer && !searchLayer.hidden && event.state?.launcherOverlay !== "search") closeLauncherSearch(false);
  });
  Object.assign(window, {
    openLauncherSearch,
    closeLauncherSearch,
    openLauncherFolder,
    closeLauncherFolder,
    openLauncherEditor,
    closeLauncherEditor,
    launcherEditMode: setEditing,
    registerLauncherApp,
    unregisterLauncherApp,
    setLauncherThemePreference,
    __LAUNCHER_STATE__: launcherState,
    __LAUNCHER_LAYOUT_KEY__: LAUNCHER_LAYOUT_KEY
  });
}
