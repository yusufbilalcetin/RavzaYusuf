export function normalizeSearchText(value = "") {
  return String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
