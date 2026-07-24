import assert from "node:assert/strict";
import {
  buildCombinedRoute, buildCumulativeLengths, calculatePolylineLength, createExitExtension,
  getAnimatedArrowPath, getPointAtDistance, segmentLength, slicePolylineByDistance
} from "../js/polyline.js";
import { createArrowRenderGeometry, getDirectionFromLastSegment } from "../js/arrow-render.js";

const board = { rows: 12, cols: 12 };
const lShape = { id: 1, exitDir: 0, points: [{ x: 2, y: 9 }, { x: 6, y: 9 }, { x: 6, y: 3 }], lineWidth: 0.1 };
const uShape = { id: 2, exitDir: 1, points: [{ x: 2, y: 3 }, { x: 2, y: 8 }, { x: 7, y: 8 }, { x: 7, y: 3 }], lineWidth: 0.1 };
const zigzag = { id: 3, exitDir: 0, points: [{ x: 1, y: 10 }, { x: 4, y: 10 }, { x: 4, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 3 }], lineWidth: 0.1 };

assert.equal(segmentLength({ x: 1, y: 2 }, { x: 6, y: 2 }), 5, "Yatay segment uzunluğu doğru olmalı");
assert.equal(segmentLength({ x: 3, y: 1 }, { x: 3, y: 8 }), 7, "Dikey segment uzunluğu doğru olmalı");
assert.equal(calculatePolylineLength(lShape.points), 10, "L polyline uzunluğu doğru olmalı");
assert.deepEqual(buildCumulativeLengths(lShape.points).map((item) => item.distance), [0, 4, 10], "Kümülatif mesafeler doğru olmalı");

const corner = getPointAtDistance(lShape.points, 4);
assert.deepEqual({ x: corner.x, y: corner.y }, { x: 6, y: 9 }, "Köşe mesafeden bulunmalı");
const vertical = getPointAtDistance(lShape.points, 7);
assert.deepEqual({ x: vertical.x, y: vertical.y }, { x: 6, y: 6 }, "Segment içi örnekleme doğru olmalı");
assert.deepEqual(vertical.tangent, { x: 0, y: -1 }, "Baş tangent yönü korunmalı");

const slice = slicePolylineByDistance(lShape.points, 2, 8);
assert.deepEqual(slice.map(({ x, y }) => [x, y]), [[4, 9], [6, 9], [6, 5]], "Polyline dilimi köşeyi diagonal kesmeden izlemeli");
assert.equal(calculatePolylineLength(slice), 6, "Dilim uzunluğu istenen aralıkla aynı olmalı");

for (const piece of [lShape, uShape, zigzag]) {
  const combined = buildCombinedRoute(piece, board);
  const extension = createExitExtension(piece, board);
  assert.ok(combined.totalLength > combined.originalLength, `Ok ${piece.id} için çıkış uzantısı bulunmalı`);
  assert.deepEqual(combined.points.at(-1), extension, `Ok ${piece.id} combined route uzantıyla bitmeli`);
  const travel = combined.totalLength - combined.originalLength;
  for (const ratio of [0, 0.2, 0.5, 0.8, 1]) {
    const frame = getAnimatedArrowPath(piece, board, travel * ratio);
    assert.ok(Math.abs(calculatePolylineLength(frame.visible) - combined.originalLength) < 1e-8, `Ok ${piece.id} gövde uzunluğu kare boyunca sabit kalmalı`);
    assert.ok(frame.visible.every((point, index, points) => index === 0 || point.x === points[index - 1].x || point.y === points[index - 1].y), `Ok ${piece.id} diagonal kestirme yapmamalı`);
  }
  const final = getAnimatedArrowPath(piece, board, travel);
  assert.ok(final.tail.x < 0 || final.tail.x > board.cols || final.tail.y < 0 || final.tail.y > board.rows, `Ok ${piece.id} yalnızca kuyruk board dışına çıktığında bitmeli`);
}

const directionCases = [
  ["right", [{ x: 1, y: 1 }, { x: 4, y: 1 }], { x: 1, y: 0 }],
  ["left", [{ x: 4, y: 1 }, { x: 1, y: 1 }], { x: -1, y: 0 }],
  ["down", [{ x: 1, y: 1 }, { x: 1, y: 4 }], { x: 0, y: 1 }],
  ["up", [{ x: 1, y: 4 }, { x: 1, y: 1 }], { x: 0, y: -1 }]
];
for (const [direction, points, tangent] of directionCases) {
  assert.equal(getDirectionFromLastSegment(points), direction, `${direction} son segmentten türetilmeli`);
  const geometry = createArrowRenderGeometry({ visiblePath: points, lineWidth: 0.1 });
  assert.deepEqual(geometry.tip, points.at(-1), `${direction} ok tip'i visible path sonunda olmalı`);
  assert.deepEqual(geometry.tangent, tangent, `${direction} polygon tangent'i doğru olmalı`);
  assert.deepEqual(geometry.headPolygon[0], geometry.tip, `${direction} polygon sivri ucu tip olmalı`);
  assert.ok(calculatePolylineLength(geometry.bodyPath) < geometry.visibleLength, `${direction} gövde sivri uca kadar uzamamalı`);
  assert.ok(calculatePolylineLength(geometry.bodyPath) > geometry.visibleLength - geometry.headLength, `${direction} gövde baş tabanına bindirilmeli ve boşluk bırakmamalı`);
}

const shortFinal = createArrowRenderGeometry({ visiblePath: [{ x: 1, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 2.9 }], lineWidth: 0.1 });
assert.ok(shortFinal && shortFinal.bodyPath.every((point, index, points) => index === 0 || point.x === points[index - 1].x || point.y === points[index - 1].y), "Kısa son segment gövdeyi diagonal kesmemeli");

console.log("Kuyruk takip motoru doğrulandı: L, U ve zikzak oklar sabit uzunlukla rotayı izliyor.");
