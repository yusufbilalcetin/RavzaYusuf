import assert from "node:assert/strict";
import { PHYSICS, findContinuousArrowCollision, segmentToSegmentDistance } from "../js/continuous-collision.js";
import { getSegments } from "../js/geometry.js";
import { SpatialGridIndex } from "../js/spatial-index.js";

const segment = (a, b) => getSegments([a, b])[0];
assert.equal(segmentToSegmentDistance(segment({x:0,y:0},{x:3,y:0}), segment({x:1,y:-1},{x:1,y:1})), 0, "Kesisen segment mesafesi sifir olmali");
assert.ok(segmentToSegmentDistance(segment({x:0,y:0},{x:3,y:0}), segment({x:0,y:0.12},{x:3,y:0.12})) > PHYSICS.physicalBodyRadius * 2, "Yakin paralel yollar fiziksel olarak ayrilabilmeli");

const index = new SpatialGridIndex(1);
index.insert("a", {minX:0,maxX:1,minY:0,maxY:1}, {id:"a"});
index.insert("b", {minX:4,maxX:5,minY:4,maxY:5}, {id:"b"});
assert.deepEqual(index.query({minX:.5,maxX:1.5,minY:.5,maxY:1.5}).map(x=>x.id), ["a"], "Spatial index yalniz yakin adayi dondurmeli");
index.remove("a"); assert.equal(index.query({minX:0,maxX:2,minY:0,maxY:2}).length, 0, "Kaldirilan ok indexten dusmeli");

const moving = { id:1, points:[{x:1,y:2},{x:2,y:2}], direction:"right", exitDir:1, lineWidth:.07 };
const blocker = { id:2, points:[{x:3,y:1},{x:3,y:3}], direction:"up", exitDir:0, lineWidth:.07 };
const level = { rows:5, cols:5, pieces:[moving,blocker] };
const collision = findContinuousArrowCollision(moving, [moving, blocker], level);
assert.equal(collision.canMove, false, "Hareket sirasindaki govde/bas carpismasi bulunmali");
assert.equal(collision.blockingArrowId, 2);
assert.ok(collision.progressDistance >= 0);
blocker.removed = true;
assert.equal(findContinuousArrowCollision(moving, [moving, blocker], level).canMove, true, "Removed ok collision hesabina girmemeli");

console.log("Engine v2 dogrulandi: spatial index, fiziksel yaricap ve surekli collision calisiyor.");
