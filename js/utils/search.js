const TURKISH_ASCII_MAP = Object.freeze({
  "ş": "s",
  "Ş": "s",
  "ç": "c",
  "Ç": "c",
  "ğ": "g",
  "Ğ": "g",
  "ü": "u",
  "Ü": "u",
  "ö": "o",
  "Ö": "o",
  "ı": "i",
  "İ": "i"
});

export function normalizeSearchText(value = "") {
  return String(value)
    .replace(/[şŞçÇğĞüÜöÖıİ]/g, (letter) => TURKISH_ASCII_MAP[letter] || letter)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function createSearchIndex(...values) {
  return normalizeSearchText(values.flat(Infinity).filter(Boolean).join(" "));
}

export function matchesSearchIndex(searchIndex, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const words = normalizedQuery.split(" ");
  return words.every((word) => String(searchIndex || "").includes(word));
}

/* =========================================================================
   SIRALAMA (Spotlight)

   matchesSearchIndex "eslesti mi?" sorusunu cevapliyor ama SIRA vermiyordu;
   sonuclar kayit sirasina gore geliyordu. Asagidaki puanlayici ayni
   normalizasyonu kullanir (yeni bir metin isleme yolu ACILMAZ) ve yalnizca
   siralama ekler.

   Basamaklar (yuksekten dusuge):
     1 tam eslesme                 "sinav"      -> "sinav"
     2 normalize tam eslesme       "sinav"      -> "Sınav"
     3 basligin basi (prefix)      "sin"        -> "Sınav Merkezi"
     4 kelime basi                 "merk"       -> "Sınav Merkezi"
     5 baslikta gecme (substring)
     6 anahtar kelime/indekste gecme
     7 hafif harf-sirasi (fuzzy) - yalnizca kisa sorgularda, en son care

   Buyuk bir arama bagimliligi eklenmez; hepsi indexOf ve tek gecisli tarama.
   ========================================================================= */

const RANK = Object.freeze({
  exact: 100,
  normalizedExact: 90,
  prefix: 75,
  wordPrefix: 60,
  substring: 45,
  keyword: 30,
  fuzzy: 12,
});

/** Sorgu harfleri baslikta SIRAYLA geciyor mu? (hafif fuzzy) */
function fuzzyOrdered(haystack, needle) {
  let cursor = 0;
  for (const character of needle) {
    cursor = haystack.indexOf(character, cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

/**
 * Tek bir kaydin puani. 0 = eslesme yok.
 * @param {{title?: string, searchIndex?: string}} entry
 * @param {string} rawQuery
 */
export function scoreSearchEntry(entry, rawQuery) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 0;
  const title = normalizeSearchText(entry?.title || "");
  const index = String(entry?.searchIndex || "");

  if (title === query) return RANK.exact;
  // Ham baslik da normalize edildiginde esitse (ör. "Sınav" <- "sinav").
  if (title && title === normalizeSearchText(entry?.title)) {
    if (title === query) return RANK.normalizedExact;
  }
  if (title.startsWith(query)) return RANK.prefix;
  if (title.split(" ").some((word) => word.startsWith(query))) return RANK.wordPrefix;
  if (title.includes(query)) return RANK.substring;

  // Cok kelimeli sorgu: TUM kelimeler indekste gecmeli (mevcut sozlesme).
  const words = query.split(" ").filter(Boolean);
  if (words.length > 1) {
    return words.every((word) => index.includes(word)) ? RANK.keyword : 0;
  }
  if (index.includes(query)) return RANK.keyword;
  // Fuzzy yalnizca kisa sorgularda: uzun sorgularda gurultu uretiyor.
  if (query.length >= 3 && query.length <= 8 && fuzzyOrdered(title, query)) return RANK.fuzzy;
  return 0;
}

/**
 * Kayitlari puanlayip siralar. Esit puanda ORIJINAL sira korunur, boylece
 * ayni alakadaki sonuclar her tuslamada yer degistirmez.
 */
export function rankSearchEntries(entries, rawQuery) {
  return entries
    .map((entry, position) => ({ entry, position, score: scoreSearchEntry(entry, rawQuery) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.position - b.position))
    .map((row) => row.entry);
}
