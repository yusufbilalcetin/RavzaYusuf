// SVG render + zoom/pan hareketi. Sadece state okur, kural hesaplamaz.
import { DIRECTIONS } from "./engine.js";
import { DEFAULT_LINE_WIDTH, distanceToPiece, pointsOf } from "./geometry.js";
import { buildCombinedRoute, getAnimatedArrowPath } from "./polyline.js";
import { createArrowRenderGeometry } from "./arrow-render.js";

const SVG_NS = "http://www.w3.org/2000/svg";
export const CELL = 64;

const LINE_WIDTH = CELL * 0.07;  // referanstaki ince lacivert cizgi
const HIT_WIDTH = CELL * 0.9;    // gorunmez dokunma hatti - parmak icin genis
const ARROW_BASE = CELL * 0.12;  // ok ucunun govdeye degdigi nokta
const ARROW_TIP = CELL * 0.42;   // ok ucu, kafa hucresinin sinirinda biter
const ARROW_HALF = CELL * 0.13;  // ok ucu yari genisligi
const MARGIN = CELL * 0.25;      // ok uclari kirpilmasin diye viewBox payi
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const TAP_SLOP = 8;              // bu mesafenin altindaki hareket "dokunus" sayilir
const DIRECTION_LABELS = ["yukarı", "sağa", "aşağı", "sola"];

function toPointsAttr(points) {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildPieceElement(piece) {
  const visiblePath = pointsOf(piece);
  const geometry = createArrowRenderGeometry({ visiblePath, lineWidth: piece.lineWidth || DEFAULT_LINE_WIDTH });
  const bodyPoints = toPointsAttr(geometry.bodyPath.map((point) => [point.x * CELL, point.y * CELL]));
  const hitPoints = toPointsAttr(visiblePath.map((point) => [point.x * CELL, point.y * CELL]));

  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "piece");
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", "0");
  group.setAttribute("aria-label", `${DIRECTION_LABELS[piece.exitDir]} yönlü ok`);
  group.dataset.pieceId = String(piece.id);

  // Gorunmez genis dokunma hatti: parmak hedefi, ince cizgiden bagimsiz buyuktur.
  const hit = document.createElementNS(SVG_NS, "polyline");
  hit.setAttribute("class", "piece-hit");
  hit.setAttribute("points", hitPoints);
  hit.setAttribute("stroke-width", String(HIT_WIDTH));

  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("class", "piece-line");
  line.setAttribute("points", bodyPoints);
  line.setAttribute("stroke-width", String(LINE_WIDTH));

  const arrow = document.createElementNS(SVG_NS, "polygon");
  arrow.setAttribute("class", "piece-arrow");
  arrow.setAttribute("points", toPointsAttr(geometry.headPolygon.map((point) => [point.x * CELL, point.y * CELL])));

  group.append(hit, line, arrow);
  return group;
}

export class BoardRenderer {
  constructor(svg) {
    this.svg = svg;
    this.viewport = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.onPieceTap = null;
    this.animations = new Map();
    this.#bindGestures();
  }

  render(game) {
    this.cancelAnimations();
    this.game = game;
    const allPoints = game.pieces.flatMap(pointsOf);
    const fitPadding = CELL * 0.28;
    const minX = Math.min(...allPoints.map((point) => point.x * CELL)) - fitPadding;
    const maxX = Math.max(...allPoints.map((point) => point.x * CELL)) + fitPadding;
    const minY = Math.min(...allPoints.map((point) => point.y * CELL)) - fitPadding;
    const maxY = Math.max(...allPoints.map((point) => point.y * CELL)) + fitPadding;
    this.svg.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    this.svg.innerHTML = "";
    this.resetView();

    // Tum icerik tek bir <g> icinde - zoom/pan bu grubun transform'u ile yapilir.
    this.viewport = document.createElementNS(SVG_NS, "g");
    this.viewport.setAttribute("class", "viewport");
    game.pieces.forEach((piece) => this.viewport.appendChild(buildPieceElement(piece)));
    this.svg.appendChild(this.viewport);
    this.#applyTransform();
  }

  clear() {
    this.svg.innerHTML = "";
    this.viewport = null;
  }

  pieceElement(id) {
    return this.svg.querySelector(`[data-piece-id="${id}"]`);
  }

  // Parca state'ten zaten dusmustur; burada yalnizca cikis animasyonu oynatilir.
  animateOut(piece, level, onComplete) {
    const element = this.pieceElement(piece.id);
    if (!element) { onComplete?.(); return; }
    element.style.pointerEvents = "none";
    element.classList.add("is-leaving-tail");
    const line = element.querySelector(".piece-line");
    const hit = element.querySelector(".piece-hit");
    const arrow = element.querySelector(".piece-arrow");
    const route = getAnimatedArrowPath(piece, level, 0);
    const travel = route.totalLength - route.originalLength;
    const duration = Math.min(900, Math.max(300, travel * 34));
    const started = performance.now();

    const frame = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const animated = getAnimatedArrowPath(piece, level, travel * eased);
      const geometry = createArrowRenderGeometry({ visiblePath: animated.visible, lineWidth: piece.lineWidth || DEFAULT_LINE_WIDTH });
      line.setAttribute("points", toPointsAttr(geometry.bodyPath.map((point) => [point.x * CELL, point.y * CELL])));
      hit.setAttribute("points", toPointsAttr(animated.visible.map((point) => [point.x * CELL, point.y * CELL])));
      arrow.setAttribute("points", toPointsAttr(geometry.headPolygon.map((point) => [point.x * CELL, point.y * CELL])));
      if (t < 1) {
        this.animations.set(piece.id, requestAnimationFrame(frame));
      } else {
        this.animations.delete(piece.id);
        element.remove();
        onComplete?.();
      }
    };
    this.animations.set(piece.id, requestAnimationFrame(frame));
  }

  cancelAnimations() {
    this.animations.forEach((frameId) => cancelAnimationFrame(frameId));
    this.animations.clear();
  }

  shake(pieceId) {
    const element = this.pieceElement(pieceId);
    if (!element) return;
    element.classList.add("is-shaking");
    setTimeout(() => element.classList.remove("is-shaking"), 260);
  }

  hint(pieceId) {
    const element = this.pieceElement(pieceId);
    if (!element) return;
    this.svg.querySelectorAll(".is-hinted").forEach((item) => item.classList.remove("is-hinted"));
    element.classList.add("is-hinted");
    setTimeout(() => element.classList.remove("is-hinted"), 1800);
  }

  renderDebug(game, safeIds = []) {
    this.viewport?.querySelectorAll(".debug-artifact").forEach((item) => item.remove());
    const safe = new Set(safeIds);
    game.pieces.forEach((piece) => {
      const element = this.pieceElement(piece.id);
      element?.classList.toggle("debug-safe", safe.has(piece.id));
      element?.classList.toggle("debug-blocked", !safe.has(piece.id));
      const cell = piece.cells.at(-1);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("class", "debug-label debug-artifact");
      label.setAttribute("x", String(cell.col * CELL + CELL / 2));
      label.setAttribute("y", String(cell.row * CELL + CELL / 2));
      label.textContent = String(piece.id);
      this.viewport?.appendChild(label);
      const route = buildCombinedRoute(piece, game.level);
      const guide = document.createElementNS(SVG_NS, "polyline");
      guide.setAttribute("class", "debug-route debug-artifact");
      guide.setAttribute("points", toPointsAttr(route.points.map((point) => [point.x * CELL, point.y * CELL])));
      this.viewport?.prepend(guide);
    });
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.#applyTransform();
  }

  #applyTransform() {
    if (!this.viewport) return;
    this.viewport.setAttribute("transform", `translate(${this.panX} ${this.panY}) scale(${this.zoom})`);
  }

  // Pan sinirlari: tahta kenari gorunur alanin icine kaymaz. viewBox sol/ust
  // kosesi -MARGIN oldugu icin sinirlar buna gore hesaplanir; 1x'te aralik
  // sifira iner, yani yakinlastirmadan pan yapilamaz.
  #clampPan() {
    const box = this.svg.viewBox.baseVal;
    const z = this.zoom;
    this.panX = clamp(this.panX, (box.width - MARGIN) * (1 - z), MARGIN * (z - 1));
    this.panY = clamp(this.panY, (box.height - MARGIN) * (1 - z), MARGIN * (z - 1));
  }

  #bindGestures() {
    const pointers = new Map();
    let startDistance = 0;
    let startZoom = 1;
    let moved = 0;
    let last = null;

    const svgDelta = (dx, dy) => {
      const box = this.svg.viewBox.baseVal;
      const rect = this.svg.getBoundingClientRect();
      return { x: (dx / rect.width) * box.width, y: (dy / rect.height) * box.height };
    };

    this.svg.addEventListener("pointerdown", (event) => {
      const matrix = this.viewport?.getScreenCTM();
      let pieceId = null;
      if (matrix && this.game) {
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const logical = { x: point.x / CELL, y: point.y / CELL };
        const nearest = this.game.pieces
          .map((piece) => ({ piece, distance: distanceToPiece(logical, piece) }))
          .filter((item) => item.distance <= HIT_WIDTH / CELL / 2)
          .sort((a, b) => a.distance - b.distance || b.piece.id - a.piece.id)[0];
        pieceId = nearest?.piece.id ?? null;
      }
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        pieceId
      });
      this.svg.setPointerCapture?.(event.pointerId);
      if (pointers.size === 1) {
        moved = 0;
        last = { x: event.clientX, y: event.clientY };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        startDistance = Math.hypot(a.x - b.x, a.y - b.y);
        startZoom = this.zoom;
      }
    });

    this.svg.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      const pointer = pointers.get(event.pointerId);
      pointers.set(event.pointerId, { ...pointer, x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (startDistance > 0) {
          this.zoom = clamp(startZoom * (distance / startDistance), MIN_ZOOM, MAX_ZOOM);
          this.#clampPan();
          this.#applyTransform();
        }
        moved = Infinity; // pinch asla dokunus sayilmaz
        return;
      }

      if (pointers.size === 1 && last) {
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        moved += Math.hypot(dx, dy);
        last = { x: event.clientX, y: event.clientY };
        // 1x'te pan yok; tahta zaten ekrana sigiyor.
        if (this.zoom > 1) {
          const delta = svgDelta(dx, dy);
          this.panX += delta.x;
          this.panY += delta.y;
          this.#clampPan();
          this.#applyTransform();
        }
      }
    });

    this.svg.addEventListener("pointerup", (event) => {
      if (!pointers.has(event.pointerId)) return;
      const pointer = pointers.get(event.pointerId);
      const wasSingle = pointers.size === 1;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) startDistance = 0;

      // Sadece parmak kaymadiysa dokunus sayilir - pan/pinch yanlislikla can goturmez.
      // Pointer capture, pointerup hedefini SVG'ye cevirir. Bu nedenle parcayi
      // pointerdown aninda saklar ve dokunus bitince o kimligi kullaniriz.
      if (wasSingle && moved <= TAP_SLOP && pointer?.pieceId !== null) {
        const target = this.pieceElement(pointer.pieceId);
        if (target && !target.classList.contains("is-leaving")) this.onPieceTap?.(pointer.pieceId);
      }
      last = null;
    });

    this.svg.addEventListener("pointercancel", (event) => {
      pointers.delete(event.pointerId);
      last = null;
    });

    this.svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoom = clamp(this.zoom * (event.deltaY < 0 ? 1.12 : 0.89), MIN_ZOOM, MAX_ZOOM);
      this.#clampPan();
      this.#applyTransform();
    }, { passive: false });

    this.svg.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target.closest?.("[data-piece-id]");
      if (!target || target.classList.contains("is-leaving")) return;
      event.preventDefault();
      this.onPieceTap?.(Number(target.dataset.pieceId));
    });
  }
}
