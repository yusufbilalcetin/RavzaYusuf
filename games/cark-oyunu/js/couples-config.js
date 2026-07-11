// Bizim Çarkımız — elle yazılmış, doğrulanabilir katalog tanımı.
// Buradaki numaralar kaynak görsellerde KIRMIZI ile işaretlenmiş pozisyonlardır.
// Çalışma zamanında renk algılama / görsel analiz YOK; havuz yalnızca bu listeden kurulur.
//
// grid: kaynak sayfadaki hücre geometrisi (yalnızca scripts/build-couples-crops.mjs kullanır).
//   cols/rows  : sayfadaki sütun/satır sayısı
//   x/y/w/h    : ızgaranın sol-üst köşesi ve hücre ölçüsü (piksel)
//   crop       : hücre içinden alınacak alan (0-1 oran) — numara/kırmızı işaret şeridini dışarıda bırakır

export const couplesWheelCatalogs = [
  {
    id: "catalog-a",
    code: "A",
    name: "Katalog A",
    sourceImage: "assets/ciftler-carki/sources/catalog-a.jpg",
    selectedNumbers: [
      1, 2, 3, 4, 5, 6, 7,
      8, 9, 10, 11, 12, 13, 14,
      15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28
    ],
    grid: { cols: 4, rows: 7, x: 0, y: 0, w: 170, h: 146.3, crop: { x: 0.01, y: 0.02, w: 0.98, h: 0.96 } }
  },
  {
    id: "catalog-b",
    code: "B",
    name: "Katalog B",
    sourceImage: "assets/ciftler-carki/sources/catalog-b.jpg",
    selectedNumbers: [
      2, 7, 8, 10, 11, 12, 14,
      16, 17, 20, 24, 25, 35, 41,
      46, 50, 51, 52, 55, 99, 100
    ],
    grid: { cols: 10, rows: 10, x: 0, y: 4, w: 69, h: 65.6, crop: { x: 0.01, y: 0.02, w: 0.98, h: 0.96 } }
  },
  {
    id: "catalog-c",
    code: "C",
    name: "Katalog C",
    sourceImage: "assets/ciftler-carki/sources/catalog-c.jpg",
    selectedNumbers: [
      7, 8, 11, 15, 19, 22, 31,
      34, 36, 41, 44, 46, 50
    ],
    grid: { cols: 5, rows: 11, x: 20, y: 6, w: 126, h: 108, crop: { x: 0.01, y: 0.02, w: 0.98, h: 0.96 } }
  }
];

export const CODE_PATTERN = /^([ABC])-(\d{2,3})$/;

/** "A-01" gibi kısa kod üretir. */
export function optionCode(catalog, number) {
  return `${catalog.code}-${String(number).padStart(2, "0")}`;
}

/** Config'te kırmızı ile işaretli TÜM pozisyonların kodları (tek doğruluk kaynağı). */
export function allowedCodes() {
  return couplesWheelCatalogs.flatMap((catalog) =>
    catalog.selectedNumbers.map((number) => optionCode(catalog, number)));
}

const ALLOWED = new Set(allowedCodes());

/** Kırmızı ile işaretlenmemiş hiçbir numara sisteme giremez. */
export function isAllowedCode(code) {
  return ALLOWED.has(String(code));
}

/** Depolamadan/dış kaynaktan gelen listeleri config'e göre süzer. */
export function filterAllowed(codes) {
  return [...new Set(Array.isArray(codes) ? codes : [])].filter(isAllowedCode);
}

export function catalogOf(code) {
  const match = CODE_PATTERN.exec(String(code));
  if (!match) return null;
  return couplesWheelCatalogs.find((catalog) => catalog.code === match[1]) || null;
}

export function numberOf(code) {
  const match = CODE_PATTERN.exec(String(code));
  return match ? Number(match[2]) : null;
}

/** Kırpılmış pozisyon görselinin yolu. İzin verilmeyen kod için görsel yoktur. */
export function imagePathFor(code, base = "../../assets/ciftler-carki") {
  if (!isAllowedCode(code)) return null;
  const catalog = catalogOf(code);
  const number = numberOf(code);
  return `${base}/${catalog.id}/${String(number).padStart(2, "0")}.webp`;
}

/** Config kendi kendini doğrular: beklenen adetler ve tekrar/aralık kontrolü. */
export function validateCatalogs(catalogs = couplesWheelCatalogs) {
  const expected = { "catalog-a": 28, "catalog-b": 21, "catalog-c": 13 };
  const errors = [];
  for (const catalog of catalogs) {
    const numbers = catalog.selectedNumbers;
    if (new Set(numbers).size !== numbers.length) errors.push(`${catalog.id}: tekrar eden numara var.`);
    if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > catalog.grid.cols * catalog.grid.rows)) {
      errors.push(`${catalog.id}: geçersiz numara (sayfa dışı).`);
    }
    if (numbers.length !== expected[catalog.id]) {
      errors.push(`${catalog.id}: ${numbers.length} seçenek, beklenen ${expected[catalog.id]}.`);
    }
  }
  const total = catalogs.reduce((sum, catalog) => sum + catalog.selectedNumbers.length, 0);
  if (total !== 62) errors.push(`Toplam ${total} seçenek, beklenen 62.`);
  return errors;
}

export const TOTAL_OPTIONS = 62;
