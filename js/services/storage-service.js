export function getStorageValue(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setStorageValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
