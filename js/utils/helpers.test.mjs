import assert from "node:assert/strict";
import { safeParse, withTimeout, TIMEOUT } from "./helpers.js";

let rejections = 0;
process.on("unhandledRejection", () => { rejections += 1; });

// 1) Asıl promise zaman aşımından önce çözülürse gerçek değer döner.
{
  const value = await withTimeout(Promise.resolve("gercek-deger"), 50);
  assert.equal(value, "gercek-deger");
}

// 2) Asıl promise hiç çözülmezse (askıda kalırsa) zaman aşımında fallback döner.
{
  const neverResolves = new Promise(() => {});
  const value = await withTimeout(neverResolves, 30, "fallback-deger");
  assert.equal(value, "fallback-deger");
}

// 3) fallback verilmezse gerçek "undefined" ile zaman aşımı ayırt edilebilir (TIMEOUT sembolü).
{
  const value = await withTimeout(new Promise(() => {}), 30);
  assert.equal(value, TIMEOUT);
  assert.notEqual(TIMEOUT, undefined, "TIMEOUT gerçek bir undefined çözünümüyle karışmamalı");
}

// 4) Asıl promise reddederse (zaman aşımından önce) reddetme olduğu gibi yukarı yayılır.
{
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error("gercek-hata")), 50),
    /gercek-hata/
  );
}

// 5) Zaman aşımı kazandıktan SONRA asıl promise reddederse unhandled rejection üretilmemeli.
{
  let rejectLate;
  const lateRejecting = new Promise((_, reject) => { rejectLate = reject; });
  const value = await withTimeout(lateRejecting, 20, "fallback");
  assert.equal(value, "fallback");
  rejectLate(new Error("gec-gelen-hata"));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(rejections, 0, "Zaman aşımından sonra geç reddeden promise unhandled rejection üretmemeli");
}

// 6) Zamanlayıcı, asıl promise timeout'tan ÖNCE çözülünce temizlenir (sızıntı yok).
// Node'un aktif timer sayısını process._getActiveHandles ile dolaylı kontrol ederiz:
// aynı ms ile çok sayıda çağrı yapılıp hepsi hızlıca çözülünce bekleyen timer kalmamalı.
{
  const before = process._getActiveHandles().length;
  await Promise.all(Array.from({ length: 25 }, (_, i) => withTimeout(Promise.resolve(i), 5000)));
  await new Promise((r) => setTimeout(r, 10));
  const after = process._getActiveHandles().length;
  assert.ok(after <= before + 2, `withTimeout timer'ları temizlemiyor olabilir (önce: ${before}, sonra: ${after})`);
}

console.log("✓ withTimeout: gerçek değer, fallback, TIMEOUT sembolü, rejection yayılımı, geç-rejection güvenliği, timer temizliği");

// safeParse: legacy-app.js ve features/kahoot.js'teki iki ayrı kopya burada
// birleştirildi. Kritik nokta, geçerli "falsy" değerlerin fallback'e
// düşmemesidir — eski kahoot kopyası `|| fallback` kullandığı için 0/false/""
// değerlerini yutuyordu.
{
  assert.deepEqual(safeParse('{"xp":265}', {}), { xp: 265 });
  assert.deepEqual(safeParse("[1,2]", []), [1, 2]);

  // Bozuk, boş ve null kayıtlar fallback döner.
  assert.deepEqual(safeParse("{bozuk-json", { a: 1 }), { a: 1 });
  assert.deepEqual(safeParse("", { a: 1 }), { a: 1 });
  assert.deepEqual(safeParse(null, { a: 1 }), { a: 1 });
  assert.equal(safeParse("null", "fallback"), "fallback");

  // Geçerli falsy değerler korunur (`||` ile sadeleştirilirse bu satırlar kırılır).
  assert.equal(safeParse("0", "fallback"), 0);
  assert.equal(safeParse("false", "fallback"), false);
  assert.equal(safeParse('""', "fallback"), "");
}

console.log("✓ safeParse: geçerli JSON, bozuk/boş/null kayıt, falsy değerlerin korunması");
