export function safeText(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Zaman aşımı ile gerçek çözüm değeri aynı şey olabileceğinden (ör. `null`),
// fallback verilmediğinde ayırt edilebilir bir işaretçi kullanılır.
export const TIMEOUT = Symbol("withTimeout:timeout");

// Ağ isteklerinin (ör. Firestore okuma) süresiz askıda kalmasını engeller.
// Zaman aşımında reddetmek yerine fallback ile çözülür; çağıran taraf normal
// "veri yok" akışını izleyebilir. Asıl promise reddederse o hata olduğu gibi
// yukarı yayılır — yalnızca zaman aşımı yutulur. Kazanan taraf ne olursa
// olsun zamanlayıcı temizlenir (asılı timer/bellek sızıntısı bırakmaz).
export function withTimeout(promise, ms, fallback = TIMEOUT) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => clearTimeout(timer));
}
