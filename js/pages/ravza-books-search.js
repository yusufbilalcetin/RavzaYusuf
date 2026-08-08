/**
 * Kitap içi arama indeksi.
 *
 * Neden ayrı dosya: burası saf metin işidir - DOM'a, pdf.js'e ve okuyucu
 * durumuna hiç dokunmaz. Böylece Node içinde doğrudan test edilebiliyor
 * (scripts/test-ravza-books-reader.mjs), tarayıcı açmaya gerek kalmıyor.
 *
 * NEDEN "collapsed" (boşluksuz) İKİNCİ BİR VARYANT VAR:
 * Kitapların PDF metin katmanı temiz değil. Gerçek örnekler:
 *   Ateşten Gömlek s.1   -> "H a l id e E d îb A d iv a r"
 *   Perili Köşk    s.6   -> "Bu ra da otu ra maz sınız efendim"
 * Kullanıcı "Halide" veya "oturamazsınız" yazdığında boşluklu arama bunları
 * ASLA bulamaz. Bu yüzden her sayfa iki biçimde saklanır:
 *   1) norm      - katlanmış, boşluklar yerinde  (birincil, daha isabetli)
 *   2) collapsed - katlanmış, tüm boşluklar atılmış (kurtarma, daha gürültülü)
 * Collapsed eşleşme kelime sınırlarını yok saydığı için kasten daha DÜŞÜK
 * sıralanır; yoksa "ata" gibi kısa sorgular "kanat atı"yı öne çıkarırdı.
 *
 * norm.length === text.length OLMAK ZORUNDA: eşleşme ofseti doğrudan orijinal
 * metne uygulanıp snippet çıkarılıyor. Bu yüzden katlama karakter karakter
 * yapılır ve String.prototype.normalize("NFD") KULLANILMAZ - NFD uzunluğu
 * değiştirip tüm ofsetleri kaydırırdı.
 */

/**
 * Türkçe harf katlama. Amaç arama toleransı: "sinav" -> "sınav",
 * "hazirlik" -> "hazırlık", "İ/I/ı/i" hepsi aynı kovaya düşer.
 * Her giriş TEK karaktere eşlenir (yukarıdaki uzunluk sözleşmesi).
 */
const FOLD = Object.freeze({
  I: "i", "İ": "i", "ı": "i",
  "Ş": "s", "ş": "s",
  "Ğ": "g", "ğ": "g",
  "Ü": "u", "ü": "u",
  "Ö": "o", "ö": "o",
  "Ç": "c", "ç": "c",
  // Osmanlıca/eski imlâ düzeltme işaretleri kitaplarda sık: "Edîb", "kâğıt".
  "Â": "a", "â": "a",
  "Î": "i", "î": "i",
  "Û": "u", "û": "u",
  "Ê": "e", "ê": "e",
  "Ô": "o", "ô": "o",
});

function foldChar(character) {
  const mapped = FOLD[character];
  if (mapped) return mapped;
  const lower = character.toLowerCase();
  // "İ".toLowerCase() iki karakter döner (i + birleşen nokta). FOLD onu zaten
  // yakalıyor ama başka bir genişleyen karakter gelirse uzunluk sözleşmesini
  // bozmasına izin verme.
  return lower.length === 1 ? lower : character;
}

/** Katlanmış metin. Uzunluk girdiyle birebir aynıdır. */
export function foldTurkish(value) {
  let out = "";
  for (const character of String(value ?? "")) out += foldChar(character);
  return out;
}

/**
 * Boşluksuz varyant + "boşluksuz ofset -> orijinal ofset" haritası.
 * Harita olmadan snippet'i orijinal metinden kesemezdik.
 */
function collapseWhitespace(normalized) {
  let text = "";
  const map = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === " " || character === "\n" || character === "\t" || character === "\r") continue;
    text += character;
    map.push(index);
  }
  return { text, map };
}

/**
 * pdf.js getTextContent() çıktısını tek bir metne indirger.
 * hasEOL satır sonlarını korur; aksi hâlde satır sonundaki kelime bir
 * sonrakine yapışıp sahte eşleşme üretiyor.
 */
export function flattenTextContent(textContent) {
  let out = "";
  for (const item of textContent?.items ?? []) {
    if (typeof item?.str !== "string") continue;
    out += item.str;
    if (item.hasEOL) out += "\n";
  }
  return out;
}

/**
 * Tek sayfanın indeks kaydı. Ham metin snippet için saklanır; norm ve
 * collapsed arama için.
 */
export function createPageEntry(pageNumber, rawText) {
  const text = String(rawText ?? "");
  const norm = foldTurkish(text);
  const { text: collapsed, map } = collapseWhitespace(norm);
  return { pageNumber, text, norm, collapsed, collapsedMap: map };
}

/** Snippet kenarlarını kelime ortasında kesmemek için en yakın boşluğa çek. */
function snapToWord(text, index, direction) {
  const limit = direction < 0 ? 0 : text.length;
  for (let cursor = index; cursor !== limit; cursor += direction) {
    if (/\s/.test(text[cursor])) return direction < 0 ? cursor + 1 : cursor;
  }
  return limit;
}

/**
 * Snippet'i üç parçaya böler: eşleşme öncesi, eşleşme, eşleşme sonrası.
 *
 * SINIR BOŞLUĞU KORUNUR - ÖNEMLİ.
 * Parçalar arayüzde `before + <mark>match</mark> + after` biçiminde YAN YANA
 * birleştiriliyor. Her parça ayrı ayrı trim edilirse, eşleşmeyi komşu
 * kelimeden ayıran boşluk yok olur ve sonuç yapışık çıkar. Gerçek örnek
 * (Perili Köşk s.6): ham metin
 *     "...efendim\nSermet Bey, gözünü..."
 * üç parçaya bölününce before "…efendim\n", after " Bey, gözünü…" oluyor;
 * ikisi de trim edilince ekranda
 *     "efendimSermetBey, gözünü…"
 * görünüyordu. Aynı hata "PERİLİKÖŞKÖMER SEYFETTİN" ve "PeriliKöşk9" gibi
 * bütün sonuçları okunmaz yapıyordu.
 *
 * Bu yüzden yalnızca snippet'in DIŞ kenarları kırpılır; iç sınırlardaki tek
 * boşluk olduğu gibi bırakılır.
 */
function buildSnippet(text, start, end, radius) {
  const rawFrom = Math.max(0, start - radius);
  const rawTo = Math.min(text.length, end + radius);
  const from = rawFrom === 0 ? 0 : snapToWord(text, rawFrom, 1);
  const to = rawTo === text.length ? text.length : snapToWord(text, rawTo, -1);
  // Çok boşluklu PDF metnini tek boşluğa indir: snippet tek satırda okunur
  // kalsın. Ofsetler bu noktadan sonra kullanılmıyor, güvenli.
  const collapse = (value) => value.replace(/\s+/g, " ");

  let before = collapse(text.slice(from, start)).replace(/^ /, "");
  let match = collapse(text.slice(start, end));
  let after = collapse(text.slice(end, to)).replace(/ $/, "");

  // Vurgunun kenarındaki boşluk komşusuna devredilir: <mark> boşluk boyamasın,
  // ama boşluk da kaybolmasın.
  if (match.startsWith(" ")) {
    match = match.slice(1);
    if (!before.endsWith(" ")) before += " ";
  }
  if (match.endsWith(" ")) {
    match = match.slice(0, -1);
    if (!after.startsWith(" ")) after = ` ${after}`;
  }

  return {
    before,
    match,
    after,
    truncatedStart: from > 0,
    truncatedEnd: to < text.length,
  };
}

/**
 * Bir sayfada sorguyu arar.
 * Önce boşluklu (isabetli), bulunamazsa boşluksuz (kurtarma) eşleşme.
 * @returns {{index:number, length:number, exact:boolean}|null}
 */
function matchInEntry(entry, normalizedQuery, collapsedQuery) {
  const direct = entry.norm.indexOf(normalizedQuery);
  if (direct >= 0) return { index: direct, length: normalizedQuery.length, exact: true };
  if (!collapsedQuery) return null;

  const loose = entry.collapsed.indexOf(collapsedQuery);
  if (loose < 0) return null;
  const start = entry.collapsedMap[loose];
  // Bitiş, eşleşmenin SON karakterinin orijinal ofsetinin bir fazlası. Doğrudan
  // start + length demek yanlış olurdu: aradaki boşluklar sayılmaz.
  const lastCollapsed = loose + collapsedQuery.length - 1;
  const end = entry.collapsedMap[lastCollapsed] + 1;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  return { index: start, length: end - start, exact: false };
}

/**
 * Tüm indekste arama.
 *
 * Sıralama: önce boşluklu (exact) eşleşmeler, sonra boşluksuz kurtarma
 * eşleşmeleri; her grup içinde sayfa sırası korunur - kitapta ileri giderken
 * sonuçların geri zıplamaması için.
 *
 * @param {Array} entries createPageEntry çıktıları
 * @param {string} query kullanıcı sorgusu
 * @param {{limit?: number, snippetRadius?: number}} options
 */
export function searchBookIndex(entries, query, { limit = 80, snippetRadius = 48 } = {}) {
  const trimmed = String(query ?? "").trim();
  // Tek karakterde arama yapma: her sayfa eşleşir, sonuç listesi anlamsız olur.
  if (trimmed.length < 2) return [];

  const normalizedQuery = foldTurkish(trimmed);
  const collapsedQuery = collapseWhitespace(normalizedQuery).text;
  const exact = [];
  const loose = [];

  for (const entry of entries) {
    if (!entry) continue;
    const found = matchInEntry(entry, normalizedQuery, collapsedQuery);
    if (!found) continue;
    const result = {
      pageNumber: entry.pageNumber,
      exact: found.exact,
      snippet: buildSnippet(entry.text, found.index, found.index + found.length, snippetRadius),
    };
    (found.exact ? exact : loose).push(result);
    if (exact.length >= limit) break;
  }

  return [...exact, ...loose].slice(0, limit);
}

/** Sorgunun indekslemeye değip değmediği. UI bunu debounce'tan önce sorar. */
export function isSearchableQuery(query) {
  return String(query ?? "").trim().length >= 2;
}
