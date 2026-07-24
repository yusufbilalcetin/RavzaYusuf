const GLASS_SURFACE_SELECTOR = [
  ".glass-surface",
  ".launcher-dialog",
  ".exam-cancel-dialog",
  ".exam-history-modal",
  ".kahoot-modal",
  ".pbn-modal"
].join(",");

const clampPercent = (value) => Math.min(100, Math.max(0, value));

export function getLiquidGlassLightPosition(rect, clientX, clientY) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 50, y: 0 };
  return {
    x: clampPercent(((clientX - rect.left) / rect.width) * 100),
    y: clampPercent(((clientY - rect.top) / rect.height) * 100)
  };
}

export function initLiquidGlassSurfaceSystem() {
  const root = document.documentElement;
  if (root.dataset.liquidGlassReady === "true") return;
  root.dataset.liquidGlassReady = "true";

  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let activeSurface = null;
  let focusedSurface = null;
  let pointerFrame = 0;
  let latestPointer = null;

  const deactivateSurface = (surface) => {
    if (!surface) return;
    surface.classList.remove("is-glass-lit");
  };

  const renderPointerLight = () => {
    pointerFrame = 0;
    if (!latestPointer || !activeSurface?.isConnected) return;
    const position = getLiquidGlassLightPosition(
      activeSurface.getBoundingClientRect(),
      latestPointer.clientX,
      latestPointer.clientY
    );
    activeSurface.style.setProperty("--glass-light-x", `${position.x.toFixed(2)}%`);
    activeSurface.style.setProperty("--glass-light-y", `${position.y.toFixed(2)}%`);
    activeSurface.classList.add("is-glass-lit");
  };

  document.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || reducedMotion.matches) return;
    const nextSurface = event.target.closest?.(GLASS_SURFACE_SELECTOR) || null;
    if (nextSurface !== activeSurface) {
      deactivateSurface(activeSurface);
      activeSurface = nextSurface;
    }
    if (!activeSurface) return;
    latestPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!pointerFrame) pointerFrame = requestAnimationFrame(renderPointerLight);
  }, { passive: true });

  document.addEventListener("pointerout", (event) => {
    if (!activeSurface || activeSurface.contains(event.relatedTarget)) return;
    deactivateSurface(activeSurface);
    activeSurface = null;
    latestPointer = null;
  }, { passive: true });

  document.addEventListener("focusin", (event) => {
    const surface = event.target.closest?.(GLASS_SURFACE_SELECTOR);
    if (!surface) return;
    if (focusedSurface && focusedSurface !== surface) deactivateSurface(focusedSurface);
    focusedSurface = surface;
    surface.style.setProperty("--glass-light-x", "50%");
    surface.style.setProperty("--glass-light-y", "0%");
    surface.classList.add("is-glass-lit");
  });

  document.addEventListener("focusout", (event) => {
    if (!focusedSurface || focusedSurface.contains(event.relatedTarget)) return;
    deactivateSurface(focusedSurface);
    focusedSurface = null;
  });

  reducedMotion.addEventListener?.("change", (event) => {
    if (!event.matches) return;
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    deactivateSurface(activeSurface);
    activeSurface = null;
    latestPointer = null;
  });
}
