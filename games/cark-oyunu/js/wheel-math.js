// Çarkın açı matematiği — saf fonksiyonlar, DOM yok. Böylece "ibrenin gösterdiği dilim,
// sonuç olarak duyurulan dilimdir" iddiası testte kanıtlanabilir (tests/wheel-math.test.mjs).
//
// Canvas açı sistemi: 0 rad = saat 3 yönü, pozitif yön saat yönünde.
// Dilim i, [POINTER_ANGLE + rotation + i*slice, +slice] aralığını kaplar (drawWheel ile aynı formül).
// İbre POINTER_ANGLE yönünde sabit durur; dönen çarktır.

export const POINTER_ANGLE = -Math.PI / 2; // saat 12
export const TAU = Math.PI * 2;

/** Açıyı [0, 2π) aralığına indirger — negatif ve 2π üstü değerler dahil. */
export function normalizeAngle(value) {
  return ((value % TAU) + TAU) % TAU;
}

export function sliceAngle(count) {
  if (!Number.isInteger(count) || count <= 0) throw new Error("Dilim sayısı pozitif tam sayı olmalı.");
  return TAU / count;
}

/**
 * `index` numaralı dilimin ortasını ibrenin altına getiren MUTLAK bitiş açısı.
 * `from`'dan daima ileri (saat yönünde) gidilir ve en az `turns` tam tur atılır.
 * Animasyonun ihtiyaç duyduğu fark: targetRotationFor(...) - from.
 */
export function targetRotationFor(index, count, from = 0, turns = 6) {
  const slice = sliceAngle(count);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`Geçersiz dilim indeksi: ${index}`);
  }
  const desired = normalizeAngle(-(index + 0.5) * slice);
  return from + normalizeAngle(desired - normalizeAngle(from)) + turns * TAU;
}

/**
 * targetRotationFor'un TERSİ: verilen dönüşte ibrenin altında hangi dilim var?
 * drawWheel'in çizim formülünden türetilir — dilim i, POINTER_ANGLE + rotation + i*slice'ta başlar,
 * yani ibre (POINTER_ANGLE) dilim i'nin üstündeyse: i = floor(-rotation / slice).
 */
export function indexAtPointer(rotation, count) {
  const slice = sliceAngle(count);
  const offset = normalizeAngle(-rotation);
  // Kayan nokta hatası dilim sınırında yanlış tarafa düşürmesin: sınıra çok yakınsa yukarı yuvarla.
  const raw = offset / slice;
  const index = Math.floor(raw + 1e-9);
  return index % count;
}
