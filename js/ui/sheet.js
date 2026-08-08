/**
 * iOS tarzi bildirim ve diyalog ilkelleri.
 *
 * Projede daha once paylasilan bir toast/dialog yardimcisi yoktu: 3 ayri
 * ad-hoc toast ve 6 uyumsuz modal sistemi vardi, geri kalan her sey native
 * alert()/confirm() kullaniyordu. Bu dosya native olanlarin yerini alir.
 *
 * NEDEN <dialog> + showModal():
 *   - "top layer"a cizilir; z-index yarisina hic girmez. Projede 999999'a
 *     kadar cikan z-index'ler var, yeni UI o yarisa katilmamali.
 *   - Odak tuzagi, Escape (cancel olayi), arka planin inert olmasi ve
 *     ::backdrop tarayicidan gelir - elle yazilmasi gerekmez.
 *   - Kapali <dialog> display:none'dir, yani offsetParent === null olur ve
 *     test-launcher.mjs'in "gorunur her butonun >= 44px olmali" taramasina
 *     hic gorunmez. Elle yazilan bir overlay'de bu her seferinde hatirlanmali.
 *   showModal() Safari 15.4'te geldi; build hedefi safari16.4, sorun yok.
 *
 * Popover API bilerek KULLANILMADI: Safari 17.0 gerektiriyor, hedefin ustunde.
 *
 * Her cagri kendi <dialog>'unu olusturup kapaninca siler. Tek bir elemani
 * paylasmak, acikken ikinci kez showModal() cagrilmasi durumunda exception
 * atardi; ust uste diyalog nadir oldugu icin bu en ucuz dogru cozum.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Kapanma animasyonunun suresi. CSS ile ayni olmali (components/modal.css). */
const CLOSE_ANIM_MS = 200;

function prefersReducedMotion() {
  return globalThis.matchMedia?.(REDUCED_MOTION).matches === true;
}

/**
 * Metni guvenle bir elemana yazar. innerHTML KULLANILMAZ: bu fonksiyonlara
 * gelen mesajlar Firebase hata metni gibi kontrol edilmeyen kaynaklardan
 * gelebiliyor (ornegin kahoot-room.js "Oda olusturulamadi: " + error.message).
 * Satir sonlari korunur.
 */
function setText(element, value) {
  element.textContent = String(value ?? "");
}

function makeButton(label, { variant = "normal", value = "" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ui-sheet-btn ui-sheet-btn--${variant}`;
  button.dataset.uiValue = value;
  setText(button, label);
  return button;
}

/**
 * Ortak diyalog iskeleti. buildBody, dialoga eklenecek icerigi kurar ve
 * "kapanis degeri -> cozulen deger" donusumunu belirler.
 */
function openDialog({ title, message, buttons, initialFocus = "last" }) {
  return new Promise((resolvePromise) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ui-sheet";

    const panel = document.createElement("div");
    panel.className = "ui-sheet-panel";

    if (title) {
      const heading = document.createElement("h2");
      heading.className = "ui-sheet-title";
      setText(heading, title);
      panel.append(heading);
      dialog.setAttribute("aria-labelledby", heading.id = `uiSheetTitle-${Date.now()}`);
    }

    if (message) {
      const body = document.createElement("p");
      body.className = "ui-sheet-message";
      setText(body, message);
      panel.append(body);
    }

    const actions = document.createElement("div");
    actions.className = "ui-sheet-actions";
    for (const button of buttons) actions.append(button);
    panel.append(actions);
    dialog.append(panel);
    document.body.append(dialog);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      const remove = () => {
        dialog.remove();
        resolvePromise(value);
      };
      dialog.classList.add("is-closing");
      if (prefersReducedMotion()) {
        dialog.close();
        remove();
        return;
      }
      setTimeout(() => {
        dialog.close();
        remove();
      }, CLOSE_ANIM_MS);
    };

    actions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ui-value]");
      if (button) finish(button.dataset.uiValue);
    });

    // Escape ve tarayici iptali. preventDefault: kapatmayi biz yonetiyoruz ki
    // cikis animasyonu ve temizlik tek yerden gecsin.
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish("");
    });

    // ::backdrop tiklamasi. Backdrop, dialog elemaninin kendisine denk gelir;
    // panel icine yapilan tiklamalar target olarak paneli verir.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish("");
    });

    dialog.showModal();

    // Yikici islemlerde odak guvenli butona gider (iOS davranisi): kullanicinin
    // Enter'a refleksle basmasi silmeye degil vazgecmeye yol acsin.
    const focusTarget = initialFocus === "first" ? buttons[0] : buttons[buttons.length - 1];
    focusTarget?.focus();
  });
}

/**
 * Tek butonlu bilgilendirme. window.alert() yerine.
 * @returns {Promise<void>}
 */
export async function uiAlert(message, { title = "", okLabel = "Tamam" } = {}) {
  await openDialog({
    title,
    message,
    buttons: [makeButton(okLabel, { variant: "primary", value: "ok" })],
  });
}

/**
 * Onay diyalogu. window.confirm() yerine.
 * @returns {Promise<boolean>} Escape/backdrop/iptal -> false
 */
export async function uiConfirm(message, {
  title = "",
  okLabel = "Tamam",
  cancelLabel = "İptal",
  destructive = false,
} = {}) {
  const cancel = makeButton(cancelLabel, { variant: "cancel", value: "" });
  const confirmButton = makeButton(okLabel, {
    variant: destructive ? "destructive" : "primary",
    value: "ok",
  });
  const value = await openDialog({
    title,
    message,
    buttons: [cancel, confirmButton],
    initialFocus: destructive ? "first" : "last",
  });
  return value === "ok";
}

/**
 * iOS action sheet. Birden fazla islemden birini sectirir.
 * @param {string} title
 * @param {Array<{label: string, value: string, destructive?: boolean}>} choices
 * @returns {Promise<string|null>} iptal -> null
 */
export async function uiActionSheet(title, choices) {
  const buttons = choices.map((choice) => makeButton(choice.label, {
    variant: choice.destructive ? "destructive" : "normal",
    value: choice.value,
  }));
  buttons.push(makeButton("İptal", { variant: "cancel", value: "" }));
  const value = await openDialog({ title, buttons, initialFocus: "first" });
  return value === "" ? null : value;
}

/* ------------------------------------------------------------------------ */
/* Toast                                                                     */
/* ------------------------------------------------------------------------ */

let toastHost = null;

function ensureToastHost() {
  if (toastHost?.isConnected) return toastHost;
  toastHost = document.createElement("div");
  toastHost.className = "ui-toast-host";
  // role=status + aria-live=polite: ekran okuyucu odagi calmadan duyurur.
  toastHost.setAttribute("role", "status");
  toastHost.setAttribute("aria-live", "polite");
  document.body.append(toastHost);
  return toastHost;
}

/**
 * Kisa, engellemeyen bildirim. Basari/bilgi mesajlari icin alert() yerine.
 * Buton icermez, dolayisiyla dokunma hedefi testlerine takilmaz.
 */
export function showToast(message, { duration = 2400 } = {}) {
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = "ui-toast";
  setText(toast, message);
  host.append(toast);

  // Giris animasyonunu tetiklemek icin bir frame bekle.
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), prefersReducedMotion() ? 0 : CLOSE_ANIM_MS);
  }, duration);
}
