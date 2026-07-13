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
