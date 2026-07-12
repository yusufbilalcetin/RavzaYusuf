// Çark matematiği: "ibrenin gösterdiği dilim = duyurulan kazanan" iddiasının ispatı.
// indexAtPointer(), drawWheel'in çizim formülünün tersidir; targetRotationFor() ise spin()'in
// kullandığı hedef açıdır. İkisinin her koşulda birbirini götürmesi gerekir.
import assert from "node:assert/strict";
import { selectOption, createWheel, deleteOption } from "../js/model.js";
import {
  POINTER_ANGLE,
  TAU,
  indexAtPointer,
  normalizeAngle,
  sliceAngle,
  targetRotationFor
} from "../js/wheel-math.js";

function test(name, callback) {
  try {
    callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const COUNTS = [1, 2, 4, 6, 12, 50, 100, 200];

// 1 · İbre saat 12'de ————————————————————————————————————————————————

test("ibre saat 12 yönünde sabit", () => {
  assert.equal(POINTER_ANGLE, -Math.PI / 2);
});

// 2 · Asıl ispat: hedef açı ↔ ibrenin altındaki dilim ————————————————

test("her dilim sayısında, her dilim için ibre kazananı gösterir", () => {
  for (const count of COUNTS) {
    for (let index = 0; index < count; index += 1) {
      const rotation = targetRotationFor(index, count, 0);
      assert.equal(indexAtPointer(rotation, count), index,
        `count=${count} index=${index}: ibre yanlış dilimi gösteriyor`);
    }
  }
});

test("başlangıç açısı ne olursa olsun (0, 2π, negatif, sınır) ibre kazananı gösterir", () => {
  for (const count of COUNTS) {
    const slice = sliceAngle(count);
    const starts = [
      0,                       // 0° sınırı
      TAU,                     // 360° sınırı
      -TAU,                    // negatif tam tur
      -slice * 0.5,            // negatif, dilim ortası
      -12.3456,                // keyfi negatif
      slice,                   // tam dilim sınırı
      slice * (count - 1),     // son dilimin sınırı
      TAU * 7 + slice / 3,     // çok turlu birikmiş açı
      Number.EPSILON           // sıfıra çok yakın
    ];
    for (const from of starts) {
      for (const index of [0, Math.floor(count / 2), count - 1]) {
        const rotation = targetRotationFor(index, count, from);
        assert.equal(indexAtPointer(rotation, count), index,
          `count=${count} index=${index} from=${from}: ibre yanlış dilimi gösteriyor`);
      }
    }
  }
});

// 3 · Dönüş yönü ve tur sayısı ————————————————————————————————————————

test("çark daima ileri (saat yönünde) ve en az istenen tur kadar döner", () => {
  for (const from of [0, 3.7, -12.5, TAU * 4]) {
    for (const count of COUNTS) {
      for (let index = 0; index < Math.min(count, 8); index += 1) {
        const delta = targetRotationFor(index, count, from, 6) - from;
        assert.ok(delta >= 6 * TAU, `count=${count}: dönüş 6 turdan az (${delta})`);
        assert.ok(delta < 7 * TAU, `count=${count}: dönüş 7 turu aştı (${delta})`);
      }
      // reduced-motion: tek tur
      const short = targetRotationFor(0, count, from, 1) - from;
      assert.ok(short >= TAU && short < 2 * TAU);
    }
  }
});

// 4 · Açı normalizasyonu ————————————————————————————————————————————

test("negatif ve 2π üstü açılar [0, 2π) aralığına iner", () => {
  assert.equal(normalizeAngle(0), 0);
  assert.equal(normalizeAngle(TAU), 0);
  assert.equal(normalizeAngle(-TAU), 0);
  assert.ok(Math.abs(normalizeAngle(-Math.PI) - Math.PI) < 1e-12);
  assert.ok(normalizeAngle(-0.0001) > 6.28 && normalizeAngle(-0.0001) < TAU);
  assert.ok(normalizeAngle(TAU * 9 + 1) > 0.99 && normalizeAngle(TAU * 9 + 1) < 1.01);
});

// 5 · Dilim sınırı: ibre tam sınırdayken tek bir dilim seçilir ———————

test("dilim sınırındaki açıda ibre daima tek ve tutarlı bir dilim gösterir", () => {
  // İbrenin dilim içindeki konumu: offset = normalizeAngle(-rotation) → rotation = -offset.
  // Dilim `index` tam olarak offset = index*slice noktasında başlar.
  for (const count of [2, 6, 50]) {
    const slice = sliceAngle(count);
    for (let index = 0; index < count; index += 1) {
      // Sınırın tam üstünde: yeni dilim (`index`) başlar.
      assert.equal(indexAtPointer(-index * slice, count), index,
        `count=${count}: ${index}. sınırda yanlış dilim`);
      // Sınırın kıl payı öncesinde: hâlâ bir önceki dilim. Hiçbir açıda "arada kalma" yok.
      assert.equal(indexAtPointer(-(index * slice - 1e-7), count), (index - 1 + count) % count,
        `count=${count}: ${index}. sınırın hemen öncesinde yanlış dilim`);
      // Dilim ortası: her zaman kendi dilimi.
      assert.equal(indexAtPointer(-(index + 0.5) * slice, count), index);
    }
  }
});

// 6 · Geçersiz girdiler ————————————————————————————————————————————

test("geçersiz dilim sayısı ve indeks reddedilir", () => {
  assert.throws(() => sliceAngle(0), /pozitif tam sayı/);
  assert.throws(() => sliceAngle(-3), /pozitif tam sayı/);
  assert.throws(() => sliceAngle(2.5), /pozitif tam sayı/);
  assert.throws(() => targetRotationFor(6, 6, 0), /Geçersiz dilim/);
  assert.throws(() => targetRotationFor(-1, 6, 0), /Geçersiz dilim/);
});

// 7 · Modelle uçtan uca: seçilen indeks ↔ ibre ————————————————————————

test("selectOption'ın verdiği indeks ile ibrenin gösterdiği dilim aynı", () => {
  for (const count of [2, 6, 50, 200]) {
    const wheel = createWheel("t", Array.from({ length: count }, (_, i) => `Seçenek ${i + 1}`));
    let rotation = 0;
    for (let spin = 0; spin < count; spin += 1) {
      const remaining = wheel.availableOptions.length;
      const selection = selectOption(wheel);
      rotation = targetRotationFor(selection.selectedIndex, remaining, rotation);
      assert.equal(indexAtPointer(rotation, remaining), selection.selectedIndex,
        `count=${count} spin=${spin}: ibre kazananı göstermiyor`);
      assert.equal(selection.available[indexAtPointer(rotation, remaining)].label, selection.option.label,
        "ibrenin altındaki etiket kazananın etiketi olmalı");
    }
  }
});

test("seçenek silindikten sonra indeksler kaymaz, ibre yine kazananı gösterir", () => {
  const wheel = createWheel("t", ["A", "B", "C", "D", "E", "F"]);
  deleteOption(wheel, wheel.allOptions[2].id); // "C" silinir → 5 seçenek
  deleteOption(wheel, wheel.allOptions[0].id); // "A" silinir → 4 seçenek
  assert.deepEqual(wheel.allOptions.map((o) => o.label), ["B", "D", "E", "F"]);

  let rotation = 0;
  for (let spin = 0; spin < 4; spin += 1) {
    const remaining = wheel.availableOptions.length;
    const selection = selectOption(wheel);
    rotation = targetRotationFor(selection.selectedIndex, remaining, rotation);
    assert.equal(indexAtPointer(rotation, remaining), selection.selectedIndex);
    assert.equal(selection.available[indexAtPointer(rotation, remaining)].label, selection.option.label);
  }
});

// 8 · Tek seçenek ————————————————————————————————————————————————————

test("tek seçenekte ibre daima o seçeneği gösterir", () => {
  for (const from of [0, TAU, -5, 123.456]) {
    assert.equal(indexAtPointer(targetRotationFor(0, 1, from), 1), 0);
  }
  assert.equal(indexAtPointer(0, 1), 0);
  assert.equal(indexAtPointer(-1, 1), 0);
});

console.log("\nTüm çark matematiği testleri geçti.");
