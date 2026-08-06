import { getAppScrollElement } from "./app-shell-scroll.js";
import { prefersReducedMotion } from "./motion.js";

// Basliklar zaten .page girisiyle kademeli geliyor (bkz. base/animasyonlar.css),
// ikinci kez gizlenmemeli.
const SKIPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);
const SKIPPED_SELECTOR = ".page-header, .page-header + *";
// Tam ekran uygulamalar kendi giris/hareket sistemlerine sahip. Bunlarin tek
// ve cok uzun uygulama kokunu reveal hedefi yapmak, IntersectionObserver
// oranini viewportta hic ulasilamayacak kadar kucultur ve tum uygulamayi
// opacity:0'da birakabilir.
const SELF_ANIMATED_PAGE_SELECTOR = ".launcher-home, .ravzalingo-page, .ravza-books-page";

// Ust siniri var: cok uzun sayfalarda yuzlerce gozlemci kaydi acmanin
// gorsel bir karsiligi yok, kullanici o kadar asagiyi zaten kademeli gormez.
const MAX_REVEALED = 24;

// Sayfalarin cogu icerigini tek bir kabuk div'ine sarar (#examcenter ->
// .exam-pro-shell gibi). Kabugun kendisini acmak hicbir sey yapmaz; acilmasi
// gereken onun icindeki bolumlerdir. Tek cocuklu her kabuk seviyesi asilir.
const MAX_SHELL_DEPTH = 3;

// Emniyet agi. Gozlemci hic raporlamazsa (sayfa arka plan sekmesinde acilirsa
// tarayici IntersectionObserver'i askiya alir) icerik opacity:0'da kalir ve
// kullanici bos sayfa gorur. Sayfanin tepesi her zaman goruntudedir, yani
// calisan bir gozlemci bu sure dolmadan MUTLAKA en az bir kez raporlar -
// hic rapor gelmemesi gozlemcinin olu oldugu anlamina gelir.
const LIVENESS_TIMEOUT_MS = 1600;

let observer = null;
let livenessTimer = 0;
let watchedElements = [];

function revealAllNow() {
  for (const element of watchedElements) element.classList.add("is-revealed");
  disconnect();
}

function disconnect() {
  observer?.disconnect();
  observer = null;
  clearTimeout(livenessTimer);
  livenessTimer = 0;
  watchedElements = [];
}

function contentContainer(page) {
  let container = page;
  for (let depth = 0; depth < MAX_SHELL_DEPTH; depth += 1) {
    if (container.children.length !== 1) break;
    const onlyChild = container.children[0];
    if (SKIPPED.has(onlyChild.tagName) || onlyChild.children.length < 2) break;
    container = onlyChild;
  }
  return container;
}

function revealTargets(page) {
  return Array.from(contentContainer(page).children).filter((element) => (
    !SKIPPED.has(element.tagName)
    && !element.matches(SKIPPED_SELECTOR)
    && !element.hasAttribute("hidden")
    && !element.hasAttribute("data-reveal-skip")
  )).slice(0, MAX_REVEALED);
}

/**
 * Aktif sayfanin govde bloklarini gorunur alana girdikce acar.
 *
 * Her navigasyonda cagrilir ve onceki gozlemciyi kapatir - eski sayfanin
 * ogeleri bellekte tutulmaz. Az hareket tercihinde hic kurulmaz ve isaretler
 * temizlenir, yani icerik her kosulda gorunur kalir.
 */
export function initScrollReveal() {
  disconnect();

  const page = document.querySelector("#page-root .page.active");
  const root = getAppScrollElement();
  // Ana ekran kaydirilan bir icerik sayfasi degil: tam ekran duvar kagidi ve
  // ikon grid'i. Kendi kademeli girisi var (bkz. layout/launcher.css).
  if (!page || page.matches(SELF_ANIMATED_PAGE_SELECTOR)) {
    document.documentElement.classList.remove("has-scroll-reveal");
    return;
  }

  const targets = revealTargets(page);
  for (const element of targets) element.removeAttribute("data-reveal");

  if (prefersReducedMotion() || typeof IntersectionObserver !== "function" || !targets.length) {
    document.documentElement.classList.remove("has-scroll-reveal");
    return;
  }

  document.documentElement.classList.add("has-scroll-reveal");

  observer = new IntersectionObserver((entries, self) => {
    let revealedAny = false;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-revealed");
      self.unobserve(entry.target);
      revealedAny = true;
    }
    // Ilk callback yalnizca hedeflerin henuz esigi gecmedigini bildirebilir.
    // O durumda timer'i iptal etmek, icerigi kalici opacity:0'da birakirdi.
    // Emniyet agi ancak gozlemci gercekten en az bir hedef actiginda gereksizdir.
    if (revealedAny) {
      clearTimeout(livenessTimer);
      livenessTimer = 0;
    }
  }, { root, rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  watchedElements = targets;
  targets.forEach((element, index) => {
    element.setAttribute("data-reveal", "");
    element.classList.remove("is-revealed");
    // Kademe yalnizca ayni anda goruntuye giren ilk bloklar icin anlamli;
    // asagidaki bloklar zaten kaydirmayla teker teker geliyor.
    element.style.setProperty("--reveal-index", String(Math.min(index, 4)));
    observer.observe(element);
  });

  livenessTimer = setTimeout(revealAllNow, LIVENESS_TIMEOUT_MS);
}
