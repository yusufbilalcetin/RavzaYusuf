/**
 * Dokunsal geri bildirim.
 *
 * GERÇEK TARAYICI DURUMU (uydurma yok):
 *   - Web'de Taptic Engine'e ERİŞİM YOKTUR. Apple bunu web'e açmadı.
 *   - iOS Safari navigator.vibrate'i DESTEKLEMEZ. Yani iPhone'da bu modül
 *     bilinçli olarak sessizdir; "iOS'ta haptik var" demek yalan olurdu.
 *   - Android Chrome/Firefox navigator.vibrate'i destekler ve gerçekten titrer.
 *   - Titreşim yalnızca kullanıcı jestinden sonra ve sayfa görünürken çalışır;
 *     tarayıcı aksi hâlde sessizce yok sayar (hata atmaz).
 *
 * Bu yüzden isSupported() "cihaz titreyecek mi" sorusunun DÜRÜST cevabıdır ve
 * arayüz kontrolü buna göre kapatılır/açıklanır - sahte bir anahtar gösterilmez.
 *
 * Desenler iOS'un UIFeedbackGenerator anlamlarına karşılık gelir; süreler kısa
 * tutuldu çünkü uzun titreşim "bildirim" gibi hissettiriyor, "dokunuş" gibi değil.
 */

const PATTERNS = Object.freeze({
  selection: 6,
  light: 10,
  medium: 18,
  success: [12, 40, 12],
  warning: [18, 60, 18],
  error: [26, 50, 26, 50, 26],
});

let enabled = true;

/**
 * Tarayıcı, gerçek bir kullanıcı jesti gerçekleşmeden navigator.vibrate()
 * çağrısını engeller VE konsola HATA yazar:
 *   "Blocked call to navigator.vibrate because user hasn't tapped on the
 *    frame or any embedded frame yet"
 * Yani jest öncesi çağrı hem işe yaramaz hem de gürültü üretir. İlk gerçek
 * dokunuş/tuşa kadar sessiz kalmak §41'in "no errors" şartını karşılar.
 * Dinleyiciler `once` olduğu için maliyeti tek seferliktir.
 */
let userHasInteracted = false;

if (typeof window !== "undefined") {
  const TYPES = ["pointerdown", "touchstart", "keydown"];
  // isTrusted ŞART: script'in ürettiği (isTrusted === false) olaylar tarayıcı
  // nezdinde kullanıcı etkinliği SAYILMAZ. Onları jest sayarsak vibrate yine
  // engellenir ve konsola hata düşer - tam kaçınmak istediğimiz şey.
  const markInteracted = (event) => {
    if (!event.isTrusted) return;
    userHasInteracted = true;
    for (const type of TYPES) window.removeEventListener(type, markInteracted, true);
  };
  for (const type of TYPES) {
    window.addEventListener(type, markInteracted, { passive: true, capture: true });
  }
}

/** Cihaz gerçekten titreyebiliyor mu. iOS'ta false döner - bu doğrudur. */
export function isSupported() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Kullanıcı tercihi. Ayarlar ve Kontrol Merkezi aynı bu değeri kullanır. */
export function setEnabled(value) {
  enabled = Boolean(value);
}

export function isEnabled() {
  return enabled;
}

/**
 * Deseni çalar. Desteklenmeyen cihazda ve kapalıyken sessizce hiçbir şey yapmaz;
 * ASLA throw etmez - çağrı yerlerinin try/catch sarmasına gerek kalmasın.
 */
/**
 * Titreşimin GERÇEKTEN izinli olup olmadığı.
 *
 * Tarayıcı, kullanıcı etkinliği olmadan vibrate() çağrısını engeller ve
 * konsola HATA yazar. Bunun standart yordayıcısı User Activation API'sidir:
 *   navigator.userActivation.isActive -> "şu an geçici kullanıcı etkinliği var"
 * Programatik bir .click() bu bayrağı KURMAZ; gerçek dokunuş kurar. Yani
 * doğru cevabı zaten tarayıcı veriyor, tahmin etmemize gerek yok.
 *
 * API yoksa (eski Safari) kendi "güvenilir jest görüldü" bayrağımıza düşeriz.
 */
function activationAllowsVibration() {
  const activation = navigator.userActivation;
  if (activation && typeof activation.isActive === "boolean") return activation.isActive;
  return userHasInteracted;
}

function play(pattern) {
  if (!enabled || !isSupported() || !activationAllowsVibration()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export const haptics = Object.freeze({
  selection: () => play(PATTERNS.selection),
  light: () => play(PATTERNS.light),
  medium: () => play(PATTERNS.medium),
  success: () => play(PATTERNS.success),
  warning: () => play(PATTERNS.warning),
  error: () => play(PATTERNS.error),
  isSupported,
  isEnabled,
  setEnabled,
});

export default haptics;
