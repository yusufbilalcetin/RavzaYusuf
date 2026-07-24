import { findArrowCollision, getSegments, pointToSegmentDistance, pointsOf } from "./geometry.js";
import { getAnimatedArrowPath } from "./polyline.js";
import { createArrowRenderGeometry } from "./arrow-render.js";
import { SpatialGridIndex } from "./spatial-index.js";

export const PHYSICS = Object.freeze({ visualStrokeWidth: 0.07, physicalBodyRadius: 0.045, collisionPadding: 0.018, touchHitRadius: 0.45 });

function orientation(a, b, c) { return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)); }
function crosses(a, b) { const p={x:a.x1,y:a.y1},q={x:a.x2,y:a.y2},r={x:b.x1,y:b.y1},s={x:b.x2,y:b.y2}; return orientation(p,q,r)!==orientation(p,q,s)&&orientation(r,s,p)!==orientation(r,s,q); }
export function segmentToSegmentDistance(a, b) {
  if (crosses(a, b)) return 0;
  return Math.min(
    pointToSegmentDistance({ x: a.x1, y: a.y1 }, b), pointToSegmentDistance({ x: a.x2, y: a.y2 }, b),
    pointToSegmentDistance({ x: b.x1, y: b.y1 }, a), pointToSegmentDistance({ x: b.x2, y: b.y2 }, a)
  );
}
function boundsOf(piece, padding = 0) { const p=pointsOf(piece); return {minX:Math.min(...p.map(x=>x.x))-padding,maxX:Math.max(...p.map(x=>x.x))+padding,minY:Math.min(...p.map(x=>x.y))-padding,maxY:Math.max(...p.map(x=>x.y))+padding}; }
function collisionBetween(movingPath, blocker, threshold) {
  const movingSegments = getSegments(movingPath); const blockerSegments = getSegments(pointsOf(blocker));
  for (const a of movingSegments) for (const b of blockerSegments) if (segmentToSegmentDistance(a,b) < threshold) return { movingSegmentIndex:a.index, blockingSegmentIndex:b.index, collisionPoint:{x:(a.x2+b.x1)/2,y:(a.y2+b.y1)/2} };
  const geometry = createArrowRenderGeometry({ visiblePath: movingPath, lineWidth: PHYSICS.visualStrokeWidth });
  if (geometry && blockerSegments.some((segment)=>geometry.headPolygon.some((point)=>pointToSegmentDistance(point,segment)<threshold))) return { movingSegmentIndex:movingSegments.length-1, blockingSegmentIndex:0, collisionPoint:geometry.tip, head:true };
  return null;
}

export function findContinuousArrowCollision(piece, active, level) {
  const activePieces = active.filter((item)=>!item.removed);
  const broadPhase = findArrowCollision(piece, activePieces, level);
  if (broadPhase.canMove) return { ...broadPhase, reason:"no-collision" };
  // Swept koridorun en yakin adayi ayrintili visible-path simulasyonuna girer.
  // Bu, yogun solver'da her frame tum board'u yeniden karsilastirmayi onler.
  const blockers = activePieces.filter((item)=>item.id===broadPhase.blockingArrowId);
  const index = new SpatialGridIndex(2);
  blockers.forEach((item)=>index.insert(item.id,boundsOf(item,0.2),item));
  const route = getAnimatedArrowPath(piece, level, 0);
  const travel = route.totalLength-route.originalLength;
  const threshold = PHYSICS.physicalBodyRadius*2+PHYSICS.collisionPadding;
  // Grid tabanli production levellarda 0.16, fiziksel capin altinda ve koridor
  // araligindan cok kucuk kalirken solver maliyetini kontrol eder.
  const step = Math.min(0.16, Math.max(0.08, PHYSICS.physicalBodyRadius * 2));
  for(let progress=0;progress<=travel+step/2;progress+=step){
    const frame=getAnimatedArrowPath(piece,level,Math.min(travel,progress));
    const frameBounds={minX:Math.min(...frame.visible.map(p=>p.x))-threshold,maxX:Math.max(...frame.visible.map(p=>p.x))+threshold,minY:Math.min(...frame.visible.map(p=>p.y))-threshold,maxY:Math.max(...frame.visible.map(p=>p.y))+threshold};
    for(const blocker of index.query(frameBounds)){ const hit=collisionBetween(frame.visible,blocker,threshold); if(hit) return {canMove:false,movingArrowId:piece.id,blockingArrowId:blocker.id,reason:hit.head?"moving-head-collision":"moving-body-collision",progressDistance:Math.min(travel,progress),...hit}; }
  }
  return {canMove:true,movingArrowId:piece.id,blockingArrowId:null,reason:"no-collision",collisionPoint:null};
}
