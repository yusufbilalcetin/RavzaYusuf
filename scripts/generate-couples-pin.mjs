import { randomBytes, timingSafeEqual, webcrypto } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import {
  loadPinConfig,
  resetPrivateAccess,
  verifyPin
} from "../games/cark-oyunu/js/private-pin.js";

// games/cark-oyunu/js/private-pin.js ile aynı doğrulama biçimi:
// UTF-8 PIN + PBKDF2/SHA-256 + 256 bit çıktı; salt ve hash küçük harfli hex.
const ITERATIONS = 150000;
const HASH_ALGORITHM = "SHA-256";
const HASH_BITS = 256;
const SALT_BYTES = 16;

function readHidden(prompt) {
  const input = process.stdin;
  const output = process.stderr;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("PIN yalnızca etkileşimli bir terminalden girilebilir."));
  }

  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let value = "";
    let settled = false;

    function cleanup() {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of decoder.write(chunk)) {
        if (character === "\u0003") {
          finish(new Error("İşlem iptal edildi."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\b" || character === "\u007f") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (character >= " " && character !== "\u007f") value += character;
      }
    }

    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function derive(pin, salt) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return Buffer.from(await webcrypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: ITERATIONS,
    hash: HASH_ALGORITHM
  }, key, HASH_BITS));
}

function sameBytes(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error("Bu script komut satırı argümanı kabul etmez.");
  }

  let pin = (await readHidden("PIN: ")).trim();
  let confirmation = (await readHidden("PIN tekrar: ")).trim();
  if (!pin) throw new Error("PIN boş olamaz.");

  const pinBytes = Buffer.from(pin, "utf8");
  const confirmationBytes = Buffer.from(confirmation, "utf8");
  const matches = sameBytes(pinBytes, confirmationBytes);
  confirmation = "";
  confirmationBytes.fill(0);
  if (!matches) {
    pin = "";
    pinBytes.fill(0);
    throw new Error("Girilen PIN değerleri eşleşmiyor.");
  }

  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(pin, salt);
  const result = {
    pinHash: hash.toString("hex"),
    pinSalt: salt.toString("hex"),
    iterations: ITERATIONS,
    hashAlgorithm: HASH_ALGORITHM
  };

  let verified = false;
  try {
    await loadPinConfig(async () => ({
      ok: true,
      json: async () => ({
        fields: {
          pinHash: { stringValue: result.pinHash },
          pinSalt: { stringValue: result.pinSalt },
          iterations: { integerValue: String(result.iterations) },
          hashAlgorithm: { stringValue: result.hashAlgorithm }
        }
      })
    }));
    verified = await verifyPin(pin, webcrypto);
  } finally {
    resetPrivateAccess();
    pin = "";
    pinBytes.fill(0);
  }
  if (!verified) {
    hash.fill(0);
    salt.fill(0);
    throw new Error("Üretilen PIN hash'i doğrulanamadı.");
  }

  hash.fill(0);
  salt.fill(0);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
