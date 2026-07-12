// Spark uyumlu özel alan kapısı: PIN yapılandırması Firestore'dan okunur ve PBKDF2 ile
// tarayıcıda doğrulanır. Bu yalnızca istemci taraflı bir gizleme katmanıdır; public statik
// görseller için gerçek dosya erişim güvenliği sağlamaz.

import { firestoreDocUrl } from "../../../js/config/firebase-rest.js";

const PIN_DOCUMENT = "privateConfig/couplesWheel";
const ALGORITHMS = new Set(["SHA-256", "SHA-512"]);

let pinConfig = null;
let pendingLoad = null;
let pendingController = null;
let resetVersion = 0;

function hexToBytes(value) {
  if (typeof value !== "string" || value.length % 2 || !/^[0-9a-f]+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (part) => Number.parseInt(part, 16));
}

function readConfig(payload) {
  const fields = payload?.fields;
  const salt = hexToBytes(fields?.pinSalt?.stringValue);
  const hash = hexToBytes(fields?.pinHash?.stringValue);
  const iterations = Number(fields?.iterations?.integerValue);
  const algorithm = fields?.hashAlgorithm?.stringValue || "SHA-256";
  const expectedHashBytes = algorithm === "SHA-512" ? 64 : 32;

  if (!salt?.length || hash?.length !== expectedHashBytes || !Number.isSafeInteger(iterations)
      || iterations < 1 || !ALGORITHMS.has(algorithm)) {
    throw new Error("PIN bilgisi geçersiz. Yöneticiyle iletişime geçin.");
  }
  return { salt, hash, iterations, algorithm };
}

/** Firestore'daki public hash/salt yapılandırmasını belleğe alır. */
export function loadPinConfig(fetcher = globalThis.fetch) {
  if (pinConfig) return Promise.resolve(pinConfig);
  if (pendingLoad) return pendingLoad;
  if (typeof fetcher !== "function") {
    return Promise.reject(new Error("PIN bilgisi alınamadı. İnternet bağlantınızı kontrol edin."));
  }

  const version = resetVersion;
  const controller = new AbortController();
  pendingController = controller;

  const request = (async () => {
    try {
      const response = await fetcher(firestoreDocUrl(PIN_DOCUMENT), { signal: controller.signal });
      if (!response?.ok) throw new Error("request-failed");
      const parsed = readConfig(await response.json());
      if (version !== resetVersion || controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      pinConfig = parsed;
      return parsed;
    } catch (error) {
      if (error?.message === "PIN bilgisi geçersiz. Yöneticiyle iletişime geçin.") throw error;
      throw new Error("PIN bilgisi alınamadı. İnternet bağlantınızı kontrol edin.");
    } finally {
      if (pendingController === controller) pendingController = null;
      if (pendingLoad === request) pendingLoad = null;
    }
  })();

  pendingLoad = request;
  return request;
}

/** Girilen PIN'i yalnızca bellekteki Firestore hash'iyle karşılaştırır. */
export async function verifyPin(value, cryptoApi = globalThis.crypto) {
  const pin = String(value ?? "").trim();
  if (!pin) return false;
  if (!pinConfig) throw new Error("PIN bilgisi henüz yüklenmedi.");
  if (!cryptoApi?.subtle) throw new Error("Bu tarayıcı güvenli PIN doğrulamasını desteklemiyor.");

  const key = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = new Uint8Array(await cryptoApi.subtle.deriveBits({
    name: "PBKDF2",
    salt: pinConfig.salt,
    iterations: pinConfig.iterations,
    hash: pinConfig.algorithm
  }, key, pinConfig.hash.length * 8));

  let difference = derived.length ^ pinConfig.hash.length;
  for (let index = 0; index < pinConfig.hash.length; index += 1) {
    difference |= (derived[index] ?? 0) ^ pinConfig.hash[index];
  }
  return difference === 0;
}

/** PIN değerinin form alanında kalmasını engeller. */
export function clearPinInput(input) {
  if (!input) return;
  input.value = "";
  input.classList?.remove("is-shaking");
}

/** Hash/salt belleğini temizler ve sürmekte olan Firestore isteğini iptal eder. */
export function resetPrivateAccess() {
  resetVersion += 1;
  pendingController?.abort();
  pendingController = null;
  pendingLoad = null;
  pinConfig = null;
}
