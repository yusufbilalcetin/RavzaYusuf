import assert from "node:assert/strict";
import { randomBytes, webcrypto } from "node:crypto";
import {
  clearPinInput,
  loadPinConfig,
  resetPrivateAccess,
  verifyPin
} from "../js/private-pin.js";

async function test(name, callback) {
  try {
    await callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  } finally {
    resetPrivateAccess();
  }
}

const toHex = (value) => [...new Uint8Array(value)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

async function pinDocument(pin, algorithm = "SHA-256") {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iterations = 120000;
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const length = algorithm === "SHA-512" ? 512 : 256;
  const hash = await webcrypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: algorithm }, key, length);
  return {
    fields: {
      pinHash: { stringValue: toHex(hash) },
      pinSalt: { stringValue: toHex(salt) },
      iterations: { integerValue: String(iterations) },
      hashAlgorithm: { stringValue: algorithm }
    }
  };
}

const mockFirestore = (document, onRequest = () => {}) => async (url, options) => {
  onRequest(url, options);
  return { ok: true, json: async () => document };
};

await test("doğru PIN mock Firestore hash'iyle doğrulanır", async () => {
  const pin = randomBytes(18).toString("base64url");
  const document = await pinDocument(pin);
  let requestedUrl = "";
  await loadPinConfig(mockFirestore(document, (url) => { requestedUrl = url; }));
  assert.match(requestedUrl, /privateConfig%2FcouplesWheel|privateConfig\/couplesWheel/);
  assert.equal(await verifyPin(pin, webcrypto), true);
});

await test("yanlış ve boş PIN erişim sağlamaz", async () => {
  const pin = randomBytes(18).toString("base64url");
  await loadPinConfig(mockFirestore(await pinDocument(pin, "SHA-512")));
  assert.equal(await verifyPin(randomBytes(18).toString("base64url"), webcrypto), false);
  assert.equal(await verifyPin("", webcrypto), false);
  assert.equal(await verifyPin("   ", webcrypto), false);
});

await test("PIN input'u doğrulama sonrasında temizlenebilir", () => {
  const classes = new Set(["is-shaking"]);
  const input = { value: randomBytes(8).toString("hex"), classList: { remove: (name) => classes.delete(name) } };
  clearPinInput(input);
  assert.equal(input.value, "");
  assert.equal(classes.has("is-shaking"), false);
});

await test("PIN akışı localStorage veya sessionStorage kullanmaz", async () => {
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const blocked = { configurable: true, get: () => { throw new Error("storage kullanılmamalı"); } };
  Object.defineProperty(globalThis, "localStorage", blocked);
  Object.defineProperty(globalThis, "sessionStorage", blocked);
  try {
    const pin = randomBytes(18).toString("base64url");
    await loadPinConfig(mockFirestore(await pinDocument(pin)));
    assert.equal(await verifyPin(pin, webcrypto), true);
  } finally {
    if (localDescriptor) Object.defineProperty(globalThis, "localStorage", localDescriptor);
    else delete globalThis.localStorage;
    if (sessionDescriptor) Object.defineProperty(globalThis, "sessionStorage", sessionDescriptor);
    else delete globalThis.sessionStorage;
  }
});

await test("kilitleme temizliği sürmekte olan Firestore isteğini iptal eder", async () => {
  let aborted = false;
  const pending = loadPinConfig((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }));
  resetPrivateAccess();
  await assert.rejects(pending, /PIN bilgisi alınamadı/);
  assert.equal(aborted, true);
});

await test("Firestore ve yapılandırma hataları genel Türkçe mesaj verir", async () => {
  await assert.rejects(
    loadPinConfig(async () => ({ ok: false, json: async () => ({}) })),
    /PIN bilgisi alınamadı/
  );
});

console.log("\nTüm private PIN testleri geçti.");
