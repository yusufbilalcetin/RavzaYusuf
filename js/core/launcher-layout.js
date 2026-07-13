import {
  LAUNCHER_GROUPS,
  QUICK_ACCESS_IDS,
  findLauncherItem,
  launcherRegistryEntries as navigationRegistryEntries
} from "../data/launcher-navigation.js";
import { createSearchIndex } from "../utils/search.js";

export const LAUNCHER_LAYOUT_KEY = "ravzaders.launcher.layout.v4";
export const LEGACY_LAUNCHER_LAYOUT_V3_KEY = "ravzaders.launcher.layout.v3";
export const LEGACY_LAUNCHER_LAYOUT_KEY = "ravzaders.launcher.layout.v1";
export const LAUNCHER_LAYOUT_VERSION = 4;
export const LAUNCHER_BREAKPOINTS = Object.freeze({ mobile: 768, desktop: 1200 });

export const LAUNCHER_WIDGETS = Object.freeze([
  { id: "study-summary", title: "Çalışma Özeti", description: "Tamamlanan çalışma, quiz ve sınav sonucunu birlikte gösterir.", size: "large", span: { columns: 4, rows: 3 }, route: "calisma-merkezi", keywords: ["çalışma", "özet"] },
  { id: "daily-goal", title: "Günlük Hedef", description: "Bugünkü gerçek çalışma ilerlemesini gösterir.", size: "small", span: { columns: 2, rows: 1 }, route: "calisma-merkezi", keywords: ["günlük", "hedef"] },
  { id: "last-quiz", title: "Son Quiz", description: "Tamamlanan quiz sayısını ve son durumu gösterir.", size: "small", span: { columns: 2, rows: 1 }, route: "quiz-merkezi", keywords: ["quiz", "test"] },
  { id: "study-streak", title: "Çalışma Serisi", description: "Kaydedilmiş çalışma serisini gösterir.", size: "small", span: { columns: 2, rows: 1 }, route: "calisma-merkezi", keywords: ["çalışma", "seri"] },
  { id: "recent-lesson", title: "Son Çalışılan Ders", description: "Son tamamlanan gerçek ders kaydını gösterir.", size: "medium", span: { columns: 3, rows: 2 }, route: "calisma-merkezi", keywords: ["son", "ders"] },
  { id: "day-plan", title: "Günün Planı", description: "Kaydedilmiş günlük plandaki sıradaki çalışmayı gösterir.", size: "medium", span: { columns: 3, rows: 2 }, route: "calisma-merkezi", keywords: ["gün", "plan"] },
  { id: "exam-summary", title: "Sınav Özeti", description: "En iyi ve son sınav sonucunu gösterir.", size: "medium", span: { columns: 3, rows: 2 }, route: "sinav-merkezi", keywords: ["sınav", "özet"] },
  { id: "favorite-apps", title: "Favori Uygulamalar", description: "Dock'taki hızlı erişim uygulamalarını gösterir.", size: "medium", span: { columns: 3, rows: 2 }, route: null, keywords: ["favori", "uygulama", "dock"] }
].map((widget) => Object.freeze({ ...widget, searchIndex: createSearchIndex(widget.title, widget.description, widget.keywords) })));

const WIDGET_IDS = new Set(LAUNCHER_WIDGETS.map((widget) => widget.id));
const TABLET_DOCK_DEFAULTS = [...QUICK_ACCESS_IDS, "recap", "examcenter"];
const DESKTOP_DOCK_DEFAULTS = [...TABLET_DOCK_DEFAULTS, "memoryhub", "fillgaphub"];

function registryIds() {
  return new Set(navigationRegistryEntries().map((entry) => entry.id));
}

function groupIds() {
  return new Set(LAUNCHER_GROUPS.map((group) => group.id));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createLauncherPage(items = []) {
  return { id: newId("page"), items: clone(items) };
}

export function launcherDeviceMode(width = globalThis.innerWidth || 1200) {
  if (width < LAUNCHER_BREAKPOINTS.mobile) return "mobile";
  if (width < LAUNCHER_BREAKPOINTS.desktop) return "tablet";
  return "desktop";
}

export function launcherOrientation(width = globalThis.innerWidth || 1200, height = globalThis.innerHeight || 800) {
  return width > height ? "landscape" : "portrait";
}

function defaultItems() {
  return [
    { type: "folder", id: "preparation" },
    { type: "app", id: "grade1" },
    { type: "app", id: "grade2" },
    { type: "folder", id: "games" }
  ];
}

function createPagedLayout(dock) {
  return {
    pages: [{ id: "page-1", items: defaultItems() }],
    dock: [...dock],
    hiddenApps: [],
    activePage: 0
  };
}

function createDesktopLayout() {
  return {
    pages: [{ id: "desktop-workspace", items: defaultItems() }],
    items: [
      { id: "preparation", type: "folder", gridX: 5, gridY: 1 },
      { id: "grade1", type: "app", gridX: 6, gridY: 1 },
      { id: "grade2", type: "app", gridX: 7, gridY: 1 },
      { id: "games", type: "folder", gridX: 8, gridY: 1 }
    ],
    widgets: [],
    dock: [...DESKTOP_DOCK_DEFAULTS],
    hiddenApps: [],
    activePage: 0
  };
}

export function createDefaultLauncherLayout() {
  return {
    version: LAUNCHER_LAYOUT_VERSION,
    iconAppearance: "standard",
    themePreference: "system",
    mobile: createPagedLayout(QUICK_ACCESS_IDS),
    tablet: createPagedLayout(TABLET_DOCK_DEFAULTS),
    desktop: createDesktopLayout(),
    folders: []
  };
}

function normalizedFolders(candidate) {
  const folders = [];
  const seen = new Set();
  const allowedIds = registryIds();
  for (const folder of Array.isArray(candidate) ? candidate : []) {
    if (!folder || typeof folder.id !== "string" || !folder.id.startsWith("custom-folder-") || seen.has(folder.id)) continue;
    const items = [...new Set(Array.isArray(folder.items) ? folder.items : [])]
      .filter((id) => typeof id === "string" && allowedIds.has(id));
    if (items.length < 2) continue;
    seen.add(folder.id);
    folders.push({
      id: folder.id,
      title: typeof folder.title === "string" && folder.title.trim() ? folder.title.trim().slice(0, 40) : "Yeni Klasör",
      type: "folder",
      icon: "preparation",
      tone: "preparation",
      items
    });
  }
  return folders.slice(0, 24);
}

function normalizePageItem(item, seenApps, seenWidgets, customIds) {
  if (!item || typeof item !== "object" || typeof item.id !== "string") return null;
  if (item.type === "widget") {
    if (!WIDGET_IDS.has(item.id) || seenWidgets.has(item.id)) return null;
    seenWidgets.add(item.id);
    const definition = LAUNCHER_WIDGETS.find((widget) => widget.id === item.id);
    return { type: "widget", id: item.id, size: definition?.size || item.size || "small" };
  }
  const allowedIds = registryIds();
  if ((!allowedIds.has(item.id) && !customIds.has(item.id)) || seenApps.has(item.id)) return null;
  seenApps.add(item.id);
  const definition = findLauncherItem(item.id);
  const type = customIds.has(item.id) || (groupIds().has(item.id) && definition?.type === "folder") ? "folder" : "app";
  return { type, id: item.id };
}

function normalizePagedLayout(candidate, fallback, maxDock, customIds) {
  const seenApps = new Set();
  const seenWidgets = new Set();
  const pages = (Array.isArray(candidate?.pages) ? candidate.pages : fallback.pages).slice(0, 16).map((page, index) => ({
    id: typeof page?.id === "string" && page.id ? page.id : `page-${index + 1}`,
    items: (Array.isArray(page?.items) ? page.items : []).map((item) => normalizePageItem(item, seenApps, seenWidgets, customIds)).filter(Boolean)
  }));
  if (!pages.length) pages.push(createLauncherPage());

  const dock = [];
  for (const id of Array.isArray(candidate?.dock) ? candidate.dock : fallback.dock) {
    const item = findLauncherItem(id);
    if (!item || item.type === "folder" || dock.includes(id)) continue;
    dock.push(id);
    if (dock.length === maxDock) break;
  }
  const allowedHidden = new Set([...registryIds(), ...customIds]);
  const hiddenApps = [...new Set(Array.isArray(candidate?.hiddenApps) ? candidate.hiddenApps : [])]
    .filter((id) => typeof id === "string" && allowedHidden.has(id));
  return {
    pages,
    dock,
    hiddenApps,
    activePage: Math.max(0, Math.min(Number(candidate?.activePage) || 0, pages.length - 1))
  };
}

function desktopRecord(item, pageItem, fallbackRecord, isWidget = false) {
  const definition = isWidget ? LAUNCHER_WIDGETS.find((widget) => widget.id === item.id) : null;
  const span = definition?.span || { columns: 1, rows: 1 };
  return {
    id: item.id,
    type: pageItem?.type || (isWidget ? "widget" : "app"),
    ...(isWidget ? { size: definition?.size || pageItem?.size || "small" } : {}),
    gridX: Math.max(1, Number(item.gridX || fallbackRecord?.gridX) || 1),
    gridY: Math.max(1, Number(item.gridY || fallbackRecord?.gridY) || 1),
    ...(isWidget ? {
      columns: Math.max(1, Number(item.columns || fallbackRecord?.columns) || span.columns),
      rows: Math.max(1, Number(item.rows || fallbackRecord?.rows) || span.rows)
    } : {})
  };
}

function normalizeDesktopLayout(candidate, fallback, customIds) {
  const paged = normalizePagedLayout(candidate, fallback, 10, customIds);
  const pageItems = paged.pages.flatMap((page) => page.items);
  const appItems = pageItems.filter((item) => item.type !== "widget");
  const widgetItems = pageItems.filter((item) => item.type === "widget");
  const candidateApps = new Map((Array.isArray(candidate?.items) ? candidate.items : []).map((item) => [item?.id, item]));
  const candidateWidgets = new Map((Array.isArray(candidate?.widgets) ? candidate.widgets : []).map((item) => [item?.id, item]));
  const fallbackApps = new Map(fallback.items.map((item) => [item.id, item]));
  const fallbackWidgets = new Map(fallback.widgets.map((item) => [item.id, item]));
  return {
    ...paged,
    pages: [{ id: "desktop-workspace", items: pageItems }],
    activePage: 0,
    items: appItems.map((item, index) => desktopRecord(candidateApps.get(item.id) || {}, item, fallbackApps.get(item.id) || { gridX: 5 + index, gridY: 1 })),
    widgets: widgetItems.map((item) => desktopRecord(candidateWidgets.get(item.id) || {}, item, fallbackWidgets.get(item.id), true))
  };
}

function migrateV1(candidate, fallback) {
  const noFolders = new Set();
  const legacy = normalizePagedLayout(candidate, fallback.mobile, 6, noFolders);
  const mobile = clone(legacy);
  mobile.dock = mobile.dock.slice(0, 4);
  const tablet = clone(legacy);
  const desktopSource = { ...clone(legacy), items: [], widgets: [] };
  return {
    ...fallback,
    mobile,
    tablet,
    desktop: normalizeDesktopLayout(desktopSource, fallback.desktop, noFolders)
  };
}

function normalizedPreference(value) {
  return ["system", "light", "dark"].includes(value) ? value : "system";
}

export function normalizeLauncherLayout(candidate) {
  const fallback = createDefaultLauncherLayout();
  if (candidate?.version === 1 && Array.isArray(candidate.pages)) return migrateV1(candidate, fallback);
  if (!candidate || typeof candidate !== "object" || ![3, LAUNCHER_LAYOUT_VERSION].includes(candidate.version)) return fallback;
  const folders = normalizedFolders(candidate.folders || candidate.customFolders);
  const customIds = new Set(folders.map((folder) => folder.id));
  return {
    version: LAUNCHER_LAYOUT_VERSION,
    iconAppearance: typeof candidate.iconAppearance === "string" ? candidate.iconAppearance.slice(0, 32) : fallback.iconAppearance,
    themePreference: normalizedPreference(candidate.themePreference),
    mobile: normalizePagedLayout(candidate.mobile, fallback.mobile, 4, customIds),
    tablet: normalizePagedLayout(candidate.tablet, fallback.tablet, 8, customIds),
    desktop: normalizeDesktopLayout(candidate.desktop, fallback.desktop, customIds),
    folders
  };
}

export function readLauncherLayout() {
  try {
    for (const key of [LAUNCHER_LAYOUT_KEY, LEGACY_LAUNCHER_LAYOUT_V3_KEY, LEGACY_LAUNCHER_LAYOUT_KEY]) {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      const normalized = normalizeLauncherLayout(JSON.parse(stored));
      if (key !== LAUNCHER_LAYOUT_KEY) saveLauncherLayout(normalized);
      return normalized;
    }
  } catch {
    return saveLauncherLayout(createDefaultLauncherLayout());
  }
  return createDefaultLauncherLayout();
}

export function saveLauncherLayout(layout) {
  const normalized = normalizeLauncherLayout(layout);
  try {
    localStorage.setItem(LAUNCHER_LAYOUT_KEY, JSON.stringify(normalized));
  } catch {
    // Gizli mod veya dolu depolamada launcher oturum boyunca çalışmaya devam eder.
  }
  return normalized;
}

export function resetLauncherLayout() {
  try {
    localStorage.removeItem(LAUNCHER_LAYOUT_KEY);
    localStorage.removeItem(LEGACY_LAUNCHER_LAYOUT_V3_KEY);
    localStorage.removeItem(LEGACY_LAUNCHER_LAYOUT_KEY);
  } catch {
    // Depolama kapalıysa varsayılan model yine bellekte kullanılabilir.
  }
  return createDefaultLauncherLayout();
}

export function launcherRegistryEntries(folders = []) {
  const byId = new Map();
  for (const item of [...navigationRegistryEntries(), ...folders]) byId.set(item.id, item);
  return [...byId.values()];
}

export function resolveCustomFolder(layout, folderId) {
  const folder = layout?.folders?.find((entry) => entry.id === folderId);
  if (!folder) return null;
  return { ...folder, items: folder.items.map(findLauncherItem).filter(Boolean) };
}

export function createCustomFolder(layout, itemIds, title = "Yeni Klasör") {
  const allowedIds = registryIds();
  const valid = [...new Set(itemIds)].filter((id) => allowedIds.has(id));
  if (valid.length < 2) return null;
  const folder = { id: newId("custom-folder"), title, type: "folder", icon: "preparation", tone: "preparation", items: valid };
  layout.folders.push(folder);
  return folder;
}

export function cleanTrailingEmptyPages(layout) {
  while (layout.pages.length > 1 && layout.pages.at(-1)?.items.length === 0) layout.pages.pop();
  layout.activePage = Math.min(layout.activePage, layout.pages.length - 1);
  return layout;
}
