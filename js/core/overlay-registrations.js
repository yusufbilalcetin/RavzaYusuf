/**
 * Mevcut overlay'leri koordinatore BAGLAR.
 *
 * Burada hicbir panel yeniden yazilmaz. Her kayit yalnizca uc soruya cevap
 * verir: "acik misin?", "kapan", "kapanirken odagi geri alma".
 *
 * Kapatma fonksiyonlarinin hepsi zaten `restoreFocus` parametresi tasiyordu
 * (closeThemeSheet, closeLauncherSearch, closeLauncherFolder,
 * closeLauncherEditor); degistirme sirasinda odagin yeni panelden calinmamasi
 * icin bu parametre kullanilir - yeni bir mekanizma icat edilmedi.
 */
import { registerOverlay, claimOverlay, OVERLAY_IDS } from "./overlay-manager.js";
import { isThemeSheetOpen, closeThemeSheet } from "./theme.js";

export { OVERLAY_IDS };

/** Launcher katmani gorunur mu? `hidden` niteligi tek dogruluk kaynagi. */
function layerOpen(id) {
  const layer = document.getElementById(id);
  return Boolean(layer && !layer.hidden);
}

/** Okuyucu sayfalarindan herhangi biri acik mi? */
function readerSheetOpen() {
  return ["rdr-contents-sheet", "rdr-search-sheet", "rdr-settings-sheet"]
    .some((id) => document.getElementById(id)?.open === true);
}

export function registerCoreOverlays() {
  registerOverlay({
    id: OVERLAY_IDS.themePanel,
    isOpen: isThemeSheetOpen,
    close: ({ replacing }) => closeThemeSheet({ restoreFocus: !replacing }),
  });

  registerOverlay({
    id: OVERLAY_IDS.launcherSearch,
    isOpen: () => layerOpen("launcherSearchLayer"),
    // useHistory=false: degistirme bir gezinme degil, gecmise kayit dusmemeli.
    close: ({ replacing }) => window.closeLauncherSearch?.(!replacing, !replacing),
  });

  registerOverlay({
    id: OVERLAY_IDS.launcherFolder,
    isOpen: () => layerOpen("launcherFolderLayer"),
    close: ({ replacing }) => window.closeLauncherFolder?.(!replacing, !replacing),
  });

  registerOverlay({
    id: OVERLAY_IDS.launcherEditor,
    isOpen: () => layerOpen("launcherEditorLayer"),
    close: ({ replacing }) => window.closeLauncherEditor?.(!replacing),
  });

  registerOverlay({
    id: OVERLAY_IDS.readerSheet,
    isOpen: readerSheetOpen,
    close: () => {
      // Okuyucu sayfalari native <dialog>; kendi close() yollari odagi zaten
      // dogru yonetiyor, burada yalnizca kapatilir.
      for (const id of ["rdr-contents-sheet", "rdr-search-sheet", "rdr-settings-sheet"]) {
        const sheet = document.getElementById(id);
        if (sheet?.open) { try { sheet.close(); } catch (_) {} }
      }
    },
  });
}

/**
 * Ozelliklerin acilis yolundan cagrilir. Ayri bir "open" API'si dayatmak yerine
 * sahiplik devri yapilir: panel kendi acilisini yine kendisi yurutur.
 */
export function claimForOverlay(id) {
  return claimOverlay(id);
}
