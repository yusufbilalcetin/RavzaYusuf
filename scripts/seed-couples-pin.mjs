// Özel çarkın şifresini Firestore'a yazar (düz metin DEĞİL: rastgele salt + PBKDF2-SHA256 hash).
// Kullanım: node scripts/seed-couples-pin.mjs 0609
//
// Not: Firestore kuralları admin_meta'ya herkese açık erişim veriyor. Yani hash okunabilir ve
// 4 haneli bir şifre kaba kuvvetle çözülebilir. Bu kilit "ev halkından gizleme" seviyesindedir,
// gerçek bir güvenlik sınırı değildir — asıl koruma için Firebase Auth gerekir.
import { webcrypto } from "node:crypto";
import { firestoreDocUrl } from "../js/config/firebase-rest.js";

const PIN = process.argv[2];
if (!PIN || PIN.length < 4) {
  console.error("Kullanım: node scripts/seed-couples-pin.mjs <en az 4 karakter>");
  process.exit(1);
}

const PIN_DOC = "admin_meta/couples-wheel";
const ITERATIONS = 150000;

const toHex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(PIN), "PBKDF2", false, ["deriveBits"]);
const bits = await webcrypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);

const response = await fetch(firestoreDocUrl(PIN_DOC), {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    fields: {
      salt: { stringValue: toHex(salt) },
      hash: { stringValue: toHex(bits) },
      iterations: { integerValue: String(ITERATIONS) },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  })
});

if (!response.ok) {
  console.error(`Firestore yazma başarısız (${response.status}):`, (await response.text()).slice(0, 300));
  process.exit(1);
}
console.log(`✓ Şifre ${PIN_DOC} belgesine yazıldı (salt + PBKDF2 hash, düz metin yok).`);
