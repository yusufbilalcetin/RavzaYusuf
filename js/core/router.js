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
import { initOyun } from "../pages/oyun-page.js";

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
  games: "oyun"
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
  oyun: { partial: "./partials/pages/oyun.html", sectionId: "games", navId: "nav-games", init: initOyun }
};

let isNavigating = false;

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
  document.documentElement.classList.toggle("is-ravzalingo-page", route.sectionId === "ravzalingo");
  document.body.classList.toggle("is-ravzalingo-page", route.sectionId === "ravzalingo");
  document.body.classList.toggle("rlz5-page-active", route.sectionId === "ravzalingo");
  document.documentElement.classList.toggle("is-kahoot-page", route.sectionId === "kahoot");
  document.body.classList.toggle("is-kahoot-page", route.sectionId === "kahoot");
}

export async function navigate(pageName = "ana-sayfa") {
  const routeName = normalizeRoute(pageName);
  const route = routes[routeName];
  if (!route) return navigate("ana-sayfa");
  if (isNavigating && appState.currentRoute === routeName) return;

  isNavigating = true;
  try {
    await ensureRouteMounted(routeName);
    setActivePage(route);
    appState.currentRoute = routeName;
    window.closeMobileMenu?.();
    const initResult = await route.init?.();
    if (!initResult?.skipTopScroll) window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    const root = document.getElementById("page-root");
    if (root) root.insertAdjacentHTML("beforeend", `<div class="empty-grid">Sayfa yüklenemedi. Lütfen tekrar deneyin.</div>`);
  } finally {
    isNavigating = false;
  }
}

export function initRouter() {
  window.__routerNavigate = navigate;
  window.navigate = navigate;
}
