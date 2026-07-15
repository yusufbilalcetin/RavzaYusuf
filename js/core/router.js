import { loadPartial } from "./partial-loader.js";
import { appState } from "./state.js";
import { initAnaSayfa } from "../pages/ana-sayfa-page.js";
import { initRavzaLingo } from "../pages/ravzalingo-page.js";
import { initKahoot } from "../pages/kahoot-page.js";
import { initCalismaMerkezi } from "../pages/calisma-merkezi-page.js";
import { initKonuDetay } from "../pages/konu-detay-page.js";
import { initEzberMerkezi } from "../pages/ezber-merkezi-page.js";
import { initBoslukDoldurma } from "../pages/bosluk-doldurma-page.js";
import { initQuizMerkezi } from "../pages/quiz-merkezi-page.js";
import { initQuizCoz } from "../pages/quiz-coz-page.js";
import { initSinavMerkezi } from "../pages/sinav-merkezi-page.js";
import { initSinavCoz } from "../pages/sinav-coz-page.js";
import { initHizliTekrar } from "../pages/hizli-tekrar-page.js";
import { initBirinciSinif } from "../pages/birinci-sinif-page.js";
import { initIkinciSinif } from "../pages/ikinci-sinif-page.js";
import { getAppScrollElement, scrollAppTo } from "./app-shell-scroll.js";
import { syncLauncherActive } from "./launcher.js?v=home-proportions-20260716-1";

let oyunModule = null;
let oyunModulePromise = null;
let ravzaBooksModule = null;
let ravzaBooksModulePromise = null;

function loadOyunModule() {
  oyunModulePromise ||= import("../pages/oyun-page.js?v=asset-audit-20260716-1").then((module) => {
    oyunModule = module;
    return module;
  });
  return oyunModulePromise;
}

function loadRavzaBooksModule() {
  ravzaBooksModulePromise ||= import("../pages/ravza-books-page.js?v=asset-audit-20260716-1").then((module) => {
    ravzaBooksModule = module;
    return module;
  });
  return ravzaBooksModulePromise;
}

const initOyun = async (options) => (await loadOyunModule()).initOyun(options);
const initRavzaBooks = async (options) => (await loadRavzaBooksModule()).initRavzaBooks(options);
const closeGame = () => oyunModule?.closeGame();
const closeRavzaBooks = () => ravzaBooksModule?.closeRavzaBooks();

export const routeAliases = {
  dashboard: "ana-sayfa",
  studyhub: "calisma-merkezi",
  memoryhub: "ezber-merkezi",
  fillgaphub: "bosluk-doldurma",
  quizhub: "quiz-merkezi",
  examcenter: "sinav-merkezi",
  recap: "hizli-tekrar",
  studydetail: "konu-detay",
  quizdetail: "quiz-coz",
  grade1: "birinci-sinif",
  grade2: "ikinci-sinif",
  games: "oyun",
  ravzabooks: "ravza-books"
};

const routes = {
  "ana-sayfa": { partial: "./partials/pages/ana-sayfa.html", sectionId: "dashboard", navId: "nav-dashboard", init: initAnaSayfa },
  ravzalingo: { partial: "./partials/pages/ravzalingo.html", sectionId: "ravzalingo", navId: "nav-ravzalingo", init: initRavzaLingo },
  kahoot: { partial: "./partials/pages/kahoot.html", sectionId: "kahoot", navId: "nav-kahoot", init: initKahoot },
  "calisma-merkezi": { partial: "./partials/pages/calisma-merkezi.html", sectionId: "studyhub", navId: "nav-studyhub", init: initCalismaMerkezi },
  "konu-detay": { partial: "./partials/pages/konu-detay.html", sectionId: "studydetail", navId: "nav-studyhub", init: initKonuDetay },
  "ezber-merkezi": { partial: "./partials/pages/ezber-merkezi.html", sectionId: "memoryhub", navId: "nav-memoryhub", init: initEzberMerkezi },
  "bosluk-doldurma": { partial: "./partials/pages/bosluk-doldurma.html", sectionId: "fillgaphub", navId: "nav-fillgaphub", init: initBoslukDoldurma },
  "quiz-merkezi": { partial: "./partials/pages/quiz-merkezi.html", sectionId: "quizhub", navId: "nav-quizhub", init: initQuizMerkezi },
  "quiz-coz": { partial: "./partials/pages/quiz-coz.html", sectionId: "quizdetail", navId: "nav-quizhub", init: initQuizCoz },
  "sinav-merkezi": { partial: "./partials/pages/sinav-merkezi.html", sectionId: "examcenter", navId: "nav-examcenter", init: initSinavMerkezi },
  "sinav-coz": { partial: "./partials/pages/sinav-coz.html", sectionId: "sinavcoz", navId: "nav-examcenter", init: initSinavCoz },
  "hizli-tekrar": { partial: "./partials/pages/hizli-tekrar.html", sectionId: "recap", navId: "nav-recap", init: initHizliTekrar },
  "birinci-sinif": { partial: "./partials/pages/birinci-sinif.html", sectionId: "grade1", navId: "nav-grade1", init: initBirinciSinif },
  "ikinci-sinif": { partial: "./partials/pages/ikinci-sinif.html", sectionId: "grade2", navId: "nav-grade2", init: initIkinciSinif },
  "ravza-books": { partial: "./partials/pages/ravza-books.html?v=library-20260715-3", sectionId: "ravzabooks", navId: null, init: initRavzaBooks },
  oyun: { partial: "./partials/pages/oyun.html?v=ok-bulmacasi-20260714-1", sectionId: "games", navId: "nav-games", init: initOyun }
};

let isNavigating = false;
// Yavaş bir navigate() (ör. geciken partial fetch) daha sonra başlayan ve
// daha hızlı biten bir navigate()'i geride bırakırsa, geç gelen eski cevap
// güncel rotanın DOM'unu ezmesin diye artan bir jeton kullanılır.
let navigationToken = 0;

function scrollAppToTop(behavior = "smooth") {
  scrollAppTo({ top: 0, left: 0, behavior });
}

function normalizeRoute(pageName) {
  return routeAliases[pageName] || pageName || "ana-sayfa";
}

async function ensureRouteMounted(routeName) {
  const route = routes[routeName];
  if (!route) throw new Error(`Route bulunamadı: ${routeName}`);
  if (document.getElementById(route.sectionId)) return route;

  const root = document.getElementById("page-root");
  if (!root) throw new Error("page-root bulunamadı");

  const html = await loadPartial(route.partial);
  root.insertAdjacentHTML("beforeend", html);
  appState.loadedRoutes.add(routeName);
  return route;
}

function setActivePage(route) {
  document.querySelectorAll("#page-root .page").forEach((page) => page.classList.remove("active"));
  document.getElementById(route.sectionId)?.classList.add("active");

  document.querySelectorAll(".nav-links button").forEach((button) => button.classList.remove("active"));
  const navButton = document.getElementById(route.navId);
  navButton?.classList.add("active");

  const hazirlikDropdown = document.getElementById("nav-hazirlik");
  if (hazirlikDropdown) {
    const isChildActive = Boolean(navButton && hazirlikDropdown.contains(navButton));
    if (isChildActive) hazirlikDropdown.open = true;
    hazirlikDropdown.classList.toggle("has-active", isChildActive);
  }

  document.body.classList.toggle("studydetail-active", route.sectionId === "studydetail");
  document.documentElement.classList.toggle("is-ravza-books-page", route.sectionId === "ravzabooks");
  document.body.classList.toggle("is-ravza-books-page", route.sectionId === "ravzabooks");
  document.documentElement.classList.toggle("is-ravzalingo-page", route.sectionId === "ravzalingo");
  document.body.classList.toggle("is-ravzalingo-page", route.sectionId === "ravzalingo");
  document.body.classList.toggle("rlz5-page-active", route.sectionId === "ravzalingo");
  syncLauncherActive(Object.entries(routes).find(([, candidate]) => candidate === route)?.[0] || "ana-sayfa");
  if (route.sectionId !== "ravzalingo") {
    document.body.classList.remove("rlz5-show-goto", "rlz5-below-activity");
    document.getElementById("scrollTopBtn")?.classList.remove("rlz5-up-green");
  }
  document.documentElement.classList.toggle("is-kahoot-page", route.sectionId === "kahoot");
  document.body.classList.toggle("is-kahoot-page", route.sectionId === "kahoot");
}

function syncRouteUrl(routeName, mode = "push") {
  const url = new URL(location.href);
  if (routeName === "ana-sayfa") url.searchParams.delete("page");
  else url.searchParams.set("page", routeName);
  if (routeName !== "oyun") url.searchParams.delete("game");
  const nextState = { route: routeName };
  if (mode === "replace") history.replaceState(nextState, "", url);
  else history.pushState(nextState, "", url);
}

function routeFromLocation(state = history.state) {
  return state?.route || new URLSearchParams(location.search).get("page") || "ana-sayfa";
}

export async function navigate(pageName = "ana-sayfa", options = {}) {
  const routeName = normalizeRoute(pageName);
  const route = routes[routeName];
  if (!route) return navigate("ana-sayfa");
  if (routeName !== "oyun" && document.body.classList.contains("is-game-fullscreen")) closeGame();
  if (routeName !== "ravza-books" && document.body.classList.contains("is-ravza-books-page")) closeRavzaBooks();
  // Aynı rota hâlen yükleniyor olsa bile bfcache/rehydrate sırasında DOM
  // temizlenmişse yeni çağrıyı yutma; token mekanizması eski çağrıyı eler.
  if (isNavigating && appState.currentRoute === routeName && document.getElementById(route.sectionId)) return;

  const myToken = ++navigationToken;
  isNavigating = true;
  try {
    await ensureRouteMounted(routeName);
    // Bu bekleme sırasında daha yeni bir navigate() başladıysa, bu eski
    // çağrı artık güncel değildir; DOM'a yazmadan sessizce çekilir.
    if (myToken !== navigationToken) return;
    document.querySelector("#page-root .startup-fallback")?.remove();
    setActivePage(route);
    if (options.history !== false) {
      const mode = options.historyMode || (appState.currentRoute ? "push" : "replace");
      if (appState.currentRoute !== routeName || mode === "replace") syncRouteUrl(routeName, mode);
    }
    appState.currentRoute = routeName;
    window.closeMobileMenu?.();
    const initResult = await route.init?.();
    if (myToken !== navigationToken) return;
    if (!initResult?.skipTopScroll) scrollAppToTop("auto");
  } catch (error) {
    console.error(error);
    if (myToken !== navigationToken) return;
    const root = document.getElementById("page-root");
    if (root) {
      root.querySelector(".startup-fallback")?.remove();
      root.querySelectorAll(".startup-error").forEach((el) => el.remove());
      root.insertAdjacentHTML("beforeend", `<div class="empty-grid startup-error">Sayfa yüklenemedi. <button type="button" onclick="window.navigate('${routeName}')">Tekrar dene</button></div>`);
    }
  } finally {
    if (myToken === navigationToken) isNavigating = false;
  }
}

export function initRouter() {
  window.__routerNavigate = navigate;
  window.navigate = navigate;
  window.__getAppScrollElement = getAppScrollElement;
  window.__scrollAppToTop = scrollAppToTop;
  if (!window.__ravzaPopstateRouterInstalled) {
    window.__ravzaPopstateRouterInstalled = true;
    window.addEventListener("popstate", (event) => {
      navigate(routeFromLocation(event.state), { history: false });
    });
  }
}
