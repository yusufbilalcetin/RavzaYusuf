// Bizim Çarkımız — pozisyon tanımı. Havuz yalnızca buradaki kodlardan kurulur:
// "01".."28", her kod Firestore couplesWheelImages collection'ındaki bir belgeye karşılık gelir.
// Çalışma zamanında dış kaynaktan seçenek gelmez; depodan okunan her kod buradan süzülür.

export const TOTAL_OPTIONS = 28;

export const CODE_PATTERN = /^\d{2}$/;

/** İzin verilen tüm pozisyon kodları (tek doğruluk kaynağı). */
export function allowedCodes() {
  return Array.from({ length: TOTAL_OPTIONS }, (_, index) => String(index + 1).padStart(2, "0"));
}

const ALLOWED = new Set(allowedCodes());

/** Listede olmayan hiçbir kod sisteme giremez. */
export function isAllowedCode(code) {
  return ALLOWED.has(String(code));
}

/** Depolamadan/dış kaynaktan gelen listeleri config'e göre süzer. */
export function filterAllowed(codes) {
  return [...new Set(Array.isArray(codes) ? codes : [])].filter(isAllowedCode);
}

export function numberOf(code) {
  return CODE_PATTERN.test(String(code)) ? Number(code) : null;
}

/** Firestore görsel belgesinin allowlist yolu. İzin verilmeyen kod için istek yolu yoktur. */
export function imageDocumentPathFor(code) {
  if (!isAllowedCode(code)) return null;
  return `couplesWheelImages/${String(code)}`;
}
