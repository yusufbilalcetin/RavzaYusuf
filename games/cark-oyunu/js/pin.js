// Özel alanın şifresi Firestore'da tutulur: admin_meta/couples-wheel
// Düz metin YOK — rastgele salt + PBKDF2-SHA256 hash saklanır, karşılaştırma tarayıcıda yapılır.
// Şifre koda, localStorage'a veya bundle'a hiçbir zaman yazılmaz.
//
// Belgeyi yazmak/değiştirmek için: node scripts/seed-couples-pin.mjs 0609
//
// GÜVENLİK SINIRI: admin_meta koleksiyonu Firestore kurallarında herkese açık. Yani hash
// okunabilir ve kısa bir şifre kaba kuvvetle çözülebilir; kırpılmış görseller de public
// klasörde duruyor. Bu kilit "sıradan kullanıcıdan gizleme" seviyesindedir, gerçek bir
// erişim sınırı değildir. Gerçek koruma için Firebase Auth + Storage kuralları gerekir.
//
// Firestore'a REST ile erişilir: Firebase SDK'sını sayfaya yüklemeye gerek kalmıyor.

import { firestoreDocUrl } from "../../../js/config/firebase-rest.js";

const PIN_PATH = "admin_meta/couples-wheel";
const SETTINGS_KEY = "ravza-couples-lock-v1";    // {persist} — localStorage
const UNLOCK_KEY = "ravza-couples-unlocked-v1";  // açık kilit işareti (şifre değil)

const ITERATIONS = 150000;
const PERSIST_MODES = new Set(["memory", "session", "device"]);

let memoryUnlocked = false; // "memory" modunda kilit yalnızca sekme ömrü boyunca RAM'de durur
let record = null;          // {salt, hash, iterations} — Firestore'dan bir kez çekilir

const encoder = new TextEncoder();
const toHex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => Uint8Array.from(hex.match(/.{1,2}/g) || [], (byte) => parseInt(byte, 16));

function subtle() {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error("Bu tarayıcı güvenli şifre kontrolünü desteklemiyor (HTTPS veya localhost gerekir).");
  return api;
}

async function derive(pin, salt, iterations = ITERATIONS) {
  const key = await subtle().importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return toHex(bits);
}

/** Zamanlama sızıntısını azaltmak için sabit süreli karşılaştırma. */
function equals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** Firestore'daki şifre kaydını çeker (bir kez; sonrası bellekten). */
export async function loadPinRecord(fetcher = globalThis.fetch) {
  if (record) return record;
  const response = await fetcher(firestoreDocUrl(PIN_PATH));
  if (!response.ok) throw new Error("Şifre bilgisi alınamadı. İnternet bağlantını kontrol et.");
  const fields = (await response.json())?.fields;
  if (!fields?.salt?.stringValue || !fields?.hash?.stringValue) {
    throw new Error("Şifre henüz belirlenmemiş (scripts/seed-couples-pin.mjs).");
  }
  record = {
    salt: fields.salt.stringValue,
    hash: fields.hash.stringValue,
    iterations: Number(fields.iterations?.integerValue) || ITERATIONS
  };
  return record;
}

export function hasPin() {
  return Boolean(record);
}

export function normalizePin(value) {
  return String(value ?? "").trim();
}

export async function verifyPin(pin) {
  if (!record) return false;
  const hash = await derive(normalizePin(pin), fromHex(record.salt), record.iterations);
  return equals(hash, record.hash);
}

/** Şifreyi Firestore'da günceller (yeni salt üretilir). */
export async function changePin(currentPin, nextPin, fetcher = globalThis.fetch) {
  if (!(await verifyPin(currentPin))) throw new Error("Mevcut şifre hatalı.");
  const clean = normalizePin(nextPin);
  if (clean.length < 4) throw new Error("Yeni şifre en az 4 karakter olmalı.");

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(clean, salt);
  const response = await fetcher(firestoreDocUrl(PIN_PATH), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        salt: { stringValue: toHex(salt) },
        hash: { stringValue: hash },
        iterations: { integerValue: String(ITERATIONS) },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    })
  });
  if (!response.ok) throw new Error("Şifre güncellenemedi.");
  record = { salt: toHex(salt), hash, iterations: ITERATIONS };
  return true;
}

/** persist: "memory" (yenilenince kilitle) · "session" (sekme kapanınca) · "device" (bu cihazda açık tut) */
export function getPersistMode(storage = globalThis.localStorage) {
  try {
    const mode = JSON.parse(storage?.getItem(SETTINGS_KEY) || "null")?.persist;
    return PERSIST_MODES.has(mode) ? mode : "session";
  } catch {
    return "session";
  }
}

export function setPersistMode(mode, storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  if (!PERSIST_MODES.has(mode)) return false;
  const wasUnlocked = isUnlocked(storage, session);
  storage?.setItem(SETTINGS_KEY, JSON.stringify({ persist: mode }));
  lock(storage, session);
  if (wasUnlocked) markUnlocked(storage, session); // açık oturumu yeni moda taşı
  return true;
}

export function isUnlocked(storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  const mode = getPersistMode(storage);
  if (mode === "device") return storage?.getItem(UNLOCK_KEY) === "1";
  if (mode === "session") return session?.getItem(UNLOCK_KEY) === "1";
  return memoryUnlocked;
}

export function markUnlocked(storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  const mode = getPersistMode(storage);
  memoryUnlocked = true;
  if (mode === "device") storage?.setItem(UNLOCK_KEY, "1");
  else if (mode === "session") session?.setItem(UNLOCK_KEY, "1");
}

export function lock(storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  memoryUnlocked = false;
  storage?.removeItem(UNLOCK_KEY);
  session?.removeItem(UNLOCK_KEY);
}

/** Testler için: bellekteki kaydı sıfırla. */
export function resetCache() {
  record = null;
}
