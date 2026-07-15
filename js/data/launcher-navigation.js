import { createSearchIndex } from "../utils/search.js";
import { ACTIVE_GAMES } from "../../data/games.js";

const runtimeRegistry = new Map();

export function createLauncherRegistryEntry(entry = {}) {
  if (!entry.id || !entry.title) throw new TypeError("Launcher kaydı id ve title alanlarını içermelidir.");
  const actionable = Boolean(entry.route || entry.href || entry.gameId || entry.type === "folder");
  const keywords = Array.isArray(entry.keywords) ? entry.keywords.filter(Boolean) : [];
  const normalized = {
    ...entry,
    id: String(entry.id),
    title: String(entry.title),
    route: entry.route || null,
    icon: entry.icon || "fallback",
    category: entry.category || (entry.type === "game" ? "Oyunlar" : "Uygulamalar"),
    removable: entry.removable !== false,
    searchable: entry.searchable !== false,
    keywords,
    defaultPage: Number.isFinite(entry.defaultPage) ? entry.defaultPage : 0,
    defaultDockEligible: entry.defaultDockEligible !== false,
    ...(actionable || entry.status ? {} : { status: "Yakında" })
  };
  normalized.searchIndex = createSearchIndex(
    normalized.title,
    normalized.category,
    normalized.keywords,
    normalized.route,
    normalized.gameId
  );
  return Object.freeze(normalized);
}

function app(entry) {
  return createLauncherRegistryEntry(entry);
}

const preparationItems = Object.freeze([
  app({ id: "ravzalingo", title: "RavzaLingo", type: "route", route: "ravzalingo", icon: "language", tone: "green", category: "Hazırlık", keywords: ["dil", "kelime"] }),
  app({ id: "kahoot", title: "Kahoot", type: "route", route: "kahoot", icon: "kahoot", tone: "violet", category: "Hazırlık", keywords: ["yarışma", "soru"] }),
  app({ id: "studyhub", title: "Çalışma Merkezi", type: "route", route: "calisma-merkezi", icon: "book", tone: "teal", category: "Hazırlık", keywords: ["çalışma", "ders", "konu"] }),
  app({ id: "memoryhub", title: "Ezber Merkezi", type: "route", route: "ezber-merkezi", icon: "memory", tone: "rose", category: "Hazırlık", keywords: ["ezber", "kart"] }),
  app({ id: "fillgaphub", title: "Boşluk Doldurma", type: "route", route: "bosluk-doldurma", icon: "puzzle", tone: "amber", category: "Hazırlık", keywords: ["boşluk", "doldurma"] }),
  app({ id: "quizhub", title: "Quiz Merkezi", type: "route", route: "quiz-merkezi", icon: "quiz", tone: "blue", category: "Hazırlık", keywords: ["quiz", "test"] }),
  app({ id: "examcenter", title: "Sınav Merkezi", type: "route", route: "sinav-merkezi", icon: "target", tone: "red", category: "Hazırlık", keywords: ["sınav", "deneme"] }),
  app({ id: "recap", title: "Hızlı Tekrar", type: "route", route: "hizli-tekrar", icon: "bolt", tone: "indigo", category: "Hazırlık", keywords: ["hızlı", "tekrar"] })
]);

const gameItems = Object.freeze(ACTIVE_GAMES.map((game) => app({
  id: game.launcherId || game.id,
  title: game.name,
  type: game.launchMode === "link" ? "link" : "game",
  ...(game.launchMode === "link"
    ? { href: `./${game.path}` }
    : { route: "oyun", gameId: game.handlerId || game.id }),
  asset: `./${game.icon}`,
  assetWidth: 1024,
  assetHeight: 1024,
  tone: game.tone || "game",
  category: "Oyunlar",
  keywords: game.keywords
})));

export const LAUNCHER_GROUPS = Object.freeze([
  app({ id: "preparation", title: "Hazırlık", type: "folder", icon: "preparation", tone: "preparation", category: "Klasörler", keywords: ["ders", "çalışma"], defaultDockEligible: false, items: preparationItems }),
  app({ id: "ravza-books", title: "Ravza Books", type: "route", route: "ravza-books", icon: "reader", asset: "./assets/branding/ravza-books-logo-128.webp", asset2x: "./assets/branding/ravza-books-logo-256.webp", tone: "amber", category: "Uygulamalar", keywords: ["kitap", "okuma", "hikâye", "sayfa"], defaultDockEligible: true }),
  app({ id: "grade1", title: "1. Sınıf", type: "route", route: "birinci-sinif", icon: "grade1", tone: "grade1", status: "Yakında", category: "Sınıflar", keywords: ["birinci sınıf"], defaultDockEligible: false }),
  app({ id: "grade2", title: "2. Sınıf", type: "route", route: "ikinci-sinif", icon: "grade2", tone: "grade2", status: "Yakında", category: "Sınıflar", keywords: ["ikinci sınıf"], defaultDockEligible: false }),
  app({ id: "games", title: "Oyun Alanı", type: "folder", icon: "games", tone: "games", category: "Klasörler", keywords: ["oyun", "eğlence"], defaultDockEligible: false, items: gameItems })
]);

export const QUICK_ACCESS_IDS = Object.freeze(["ravzalingo", "kahoot", "studyhub", "quizhub"]);

export function launcherItems() {
  const production = LAUNCHER_GROUPS.flatMap((group) => group.items || [group]);
  return [...production, ...runtimeRegistry.values()];
}

export function launcherRegistryEntries() {
  const byId = new Map();
  for (const item of [...LAUNCHER_GROUPS, ...launcherItems()]) byId.set(item.id, item);
  return [...byId.values()];
}

export function findLauncherItem(itemId) {
  return runtimeRegistry.get(itemId)
    || launcherItems().find((item) => item.id === itemId)
    || LAUNCHER_GROUPS.find((group) => group.id === itemId)
    || null;
}

export function findLauncherGroup(groupId) {
  return LAUNCHER_GROUPS.find((group) => group.id === groupId) || null;
}

export function registerLauncherEntry(entry) {
  const normalized = createLauncherRegistryEntry(entry);
  if (findLauncherItem(normalized.id)) throw new Error(`Launcher kaydı zaten var: ${normalized.id}`);
  runtimeRegistry.set(normalized.id, normalized);
  return normalized;
}

export function unregisterLauncherEntry(itemId) {
  return runtimeRegistry.delete(itemId);
}
