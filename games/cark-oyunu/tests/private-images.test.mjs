import assert from "node:assert/strict";
import {
  cancelPendingImageRequest,
  clearPrivateImageCache,
  fetchPrivateImage
} from "../js/private-images.js";

const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
]);
const WEBP_DATA_URL = `data:image/webp;base64,${WEBP_BYTES.toString("base64")}`;

const responseFor = (image = WEBP_DATA_URL) => ({
  ok: true,
  json: async () => ({ fields: { image: { stringValue: image } } })
});

async function test(name, callback) {
  clearPrivateImageCache();
  try {
    await callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  } finally {
    clearPrivateImageCache();
  }
}

await test("01-28 kodu doğru Firestore belge URL'sine gider; 29 reddedilir", async () => {
  let requestedUrl = "";
  const image = await fetchPrivateImage("01", async (url) => {
    requestedUrl = url;
    return responseFor();
  });
  assert.equal(image, WEBP_DATA_URL);
  assert.match(requestedUrl, /\/documents\/couplesWheelImages\/01(?:\?|$)/);
  assert.equal(await fetchPrivateImage("29", async () => { throw new Error("çağrılmamalı"); }), null);
});

await test("geçerli WebP Data URL kabul edilir", async () => {
  assert.equal(await fetchPrivateImage("02", async () => responseFor()), WEBP_DATA_URL);
});

await test("JPEG, bozuk Base64 ve eksik image alanı reddedilir", async () => {
  const jpeg = `data:image/jpeg;base64,${WEBP_BYTES.toString("base64")}`;
  await assert.rejects(fetchPrivateImage("03", async () => responseFor(jpeg)), /Görsel alınamadı/);
  await assert.rejects(fetchPrivateImage("03", async () => responseFor("data:image/webp;base64,%%%")), /Görsel alınamadı/);
  await assert.rejects(fetchPrivateImage("03", async () => ({ ok: true, json: async () => ({ fields: {} }) })), /Görsel alınamadı/);
});

await test("eski istek iptal edilir ve yeni cevap önbelleğe alınır", async () => {
  let rejectFirst;
  const first = fetchPrivateImage("04", (_url, { signal }) => new Promise((_resolve, reject) => {
    rejectFirst = reject;
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  await Promise.resolve();
  let calls = 0;
  const second = fetchPrivateImage("05", async () => {
    calls += 1;
    return responseFor();
  });
  rejectFirst ??= () => {};
  await assert.rejects(first, /Görsel alınamadı/);
  assert.equal(await second, WEBP_DATA_URL);
  assert.equal(await fetchPrivateImage("05", async () => { calls += 1; return responseFor(); }), WEBP_DATA_URL);
  assert.equal(calls, 1, "aynı görsel bellek önbelleğinden dönmeli");
});

await test("iptal ve cache temizliği sonraki isteği yeniden çalıştırır", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return responseFor(); };
  await fetchPrivateImage("06", fetcher);
  cancelPendingImageRequest();
  clearPrivateImageCache();
  await fetchPrivateImage("06", fetcher);
  assert.equal(calls, 2);
});

console.log("\nTüm özel görsel birim testleri geçti.");
