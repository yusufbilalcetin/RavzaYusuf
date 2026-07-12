import { firestoreDocUrl } from "../../../js/config/firebase-rest.js";
import { imageDocumentPathFor } from "./couples-config.js";

const DATA_URL_PREFIX = "data:image/webp;base64,";
const cache = new Map();
let pendingController = null;
let requestGeneration = 0;

function validateWebPDataUrl(value) {
  if (typeof value !== "string" || !value.startsWith(DATA_URL_PREFIX) || /\s/.test(value)) {
    throw new Error("Görsel verisi geçersiz.");
  }
  const encoded = value.slice(DATA_URL_PREFIX.length);
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error("Görsel verisi geçersiz.");
  }
  let decoded;
  try {
    decoded = globalThis.atob(encoded);
  } catch {
    throw new Error("Görsel verisi geçersiz.");
  }
  if (globalThis.btoa(decoded) !== encoded
      || decoded.length < 12
      || decoded.slice(0, 4) !== "RIFF"
      || decoded.slice(8, 12) !== "WEBP") {
    throw new Error("Görsel verisi geçersiz.");
  }
  return value;
}

export function cancelPendingImageRequest() {
  requestGeneration += 1;
  pendingController?.abort();
  pendingController = null;
}

export function clearPrivateImageCache() {
  cancelPendingImageRequest();
  cache.clear();
}

export async function fetchPrivateImage(code, fetcher = globalThis.fetch) {
  const normalizedCode = String(code);
  const path = imageDocumentPathFor(normalizedCode);
  if (!path) return null;
  if (cache.has(normalizedCode)) return cache.get(normalizedCode);
  if (typeof fetcher !== "function") throw new Error("Görsel alınamadı.");

  cancelPendingImageRequest();
  const generation = requestGeneration;
  const controller = new AbortController();
  pendingController = controller;
  try {
    const response = await fetcher(firestoreDocUrl(path), { signal: controller.signal });
    if (!response?.ok) throw new Error("request-failed");
    const image = validateWebPDataUrl((await response.json())?.fields?.image?.stringValue);
    if (generation !== requestGeneration || controller.signal.aborted) throw new Error("stale-request");
    cache.set(normalizedCode, image);
    return image;
  } catch {
    throw new Error("Görsel alınamadı.");
  } finally {
    if (pendingController === controller) pendingController = null;
  }
}
