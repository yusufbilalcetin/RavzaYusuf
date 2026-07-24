import assert from "node:assert/strict";
import {
  distanceToPiece, findArrowCollision, getArrowBounds, getExitTranslation, getSegments,
  getSweptRectangles, pointToSegmentDistance, rectanglesIntersect
} from "../js/geometry.js";
import { calculateDifficulty, validateArrow, validateLevel } from "../js/validation.js";

const board = { rows: 10, cols: 10 };
const arrow = (id, points, direction = "right") => ({ id, points, direction, lineWidth: 0.1, removed: false });

assert.equal(getSegments([{ x: 1, y: 1 }, { x: 4, y: 1 }])[0].horizontal, true, "Yatay segment tanınmalı");
assert.equal(getSegments([{ x: 1, y: 1 }, { x: 1, y: 4 }])[0].vertical, true, "Dikey segment tanınmalı");
assert.equal(getSegments([{ x: 1, y: 1 }, { x: 1, y: 4 }, { x: 4, y: 4 }]).length, 2, "Kıvrımlı ok segmentlere ayrılmalı");

assert.equal(validateArrow(arrow(1, [{ x: 1, y: 1 }, { x: 2, y: 2 }]), board).valid, false, "Çapraz segment reddedilmeli");
assert.equal(validateArrow(arrow(1, [{ x: 1, y: 1 }, { x: 1, y: 1 }]), board).valid, false, "Sıfır segment reddedilmeli");
assert.equal(validateArrow(arrow(1, [{ x: -1, y: 1 }, { x: 1, y: 1 }]), board).valid, false, "Tahta dışı nokta reddedilmeli");

const duplicateLevel = { id: 1, ...board, pieces: [arrow(1, [{ x: 1, y: 1 }, { x: 2, y: 1 }]), arrow(1, [{ x: 3, y: 3 }, { x: 4, y: 3 }])] };
assert.equal(validateLevel(duplicateLevel).valid, false, "Yinelenen ok kimliği reddedilmeli");

const moving = arrow(1, [{ x: 1, y: 1 }, { x: 1, y: 4 }, { x: 3, y: 4 }], "right");
const rearBlocker = arrow(2, [{ x: 4, y: 3.5 }, { x: 4, y: 4.5 }], "up");
const collision = findArrowCollision(moving, [moving, rearBlocker], board);
assert.equal(collision.canMove, false, "Başın birleşik çıkış rotasındaki engel bulunmalı");
assert.equal(collision.blockingArrowId, 2, "Engelleyen ok kimliği dönmeli");
assert.ok(collision.collisionPoint, "Çarpışma noktası dönmeli");

const far = arrow(3, [{ x: 4, y: 7 }, { x: 4, y: 8 }], "up");
assert.equal(findArrowCollision(moving, [moving, far], board).canMove, true, "Temas etmeyen paralel alan açık kalmalı");
far.removed = true;
assert.equal(findArrowCollision(moving, [moving, rearBlocker, far], board).blockingArrowId, 2, "Kaldırılmış ok sonucu etkilememeli");

assert.equal(rectanglesIntersect({ minX: 0, maxX: 1, minY: 0, maxY: 1 }, { minX: 1, maxX: 2, minY: 0, maxY: 1 }), true, "Sınır teması çarpışma sayılmalı");
assert.equal(rectanglesIntersect({ minX: 0, maxX: 1, minY: 0, maxY: 1 }, { minX: 1.01, maxX: 2, minY: 0, maxY: 1 }, 0.001), false, "Epsilon dışındaki boşluk açık kalmalı");

for (const direction of ["up", "right", "down", "left"]) {
  const candidate = arrow(direction, [{ x: 4, y: 4 }, { x: 5, y: 4 }], direction);
  const translation = getExitTranslation(candidate, board);
  assert.ok(Number.isFinite(translation.x) && Number.isFinite(translation.y), `${direction} çıkış mesafesi hesaplanmalı`);
  assert.ok(getSweptRectangles(candidate, board).length > 0, `${direction} swept rectangle üretmeli`);
}

assert.deepEqual(getArrowBounds(arrow(1, [{ x: 1, y: 1 }, { x: 3, y: 1 }])).minX, 0.95, "Çizgi kalınlığı bounds'a katılmalı");
assert.equal(pointToSegmentDistance({ x: 2, y: 2 }, getSegments([{ x: 1, y: 1 }, { x: 3, y: 1 }])[0]), 1, "Nokta-segment mesafesi doğru olmalı");
assert.equal(distanceToPiece({ x: 1, y: 2 }, moving), 0, "Hit test çizgi üzerindeki noktayı bulmalı");

const difficulty = calculateDifficulty({ id: 2, ...board, pieces: [moving, rearBlocker] }, { initialSafe: [1] });
assert.ok(difficulty.score > 0 && ["easy", "medium", "hard", "expert"].includes(difficulty.label), "Zorluk hesaplanmalı");

console.log("Geometri doğrulandı: segmentler, swept-area, epsilon, hit-test ve şema kontrolleri geçti.");
