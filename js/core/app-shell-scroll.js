let installed = false;
let nativeScrollTo = null;
let nativeScrollBy = null;
let nativeScrollIntoView = null;
let relayScheduled = false;

export function getAppScrollElement() {
  return document.querySelector(".main-content");
}

export function getAppScrollTop() {
  const scroller = getAppScrollElement();
  if (scroller) return scroller.scrollTop;
  return document.documentElement.scrollTop || document.body?.scrollTop || 0;
}

export function getAppScrollLeft() {
  const scroller = getAppScrollElement();
  if (scroller) return scroller.scrollLeft;
  return document.documentElement.scrollLeft || document.body?.scrollLeft || 0;
}

function relayWindowScroll() {
  if (relayScheduled) return;
  relayScheduled = true;
  requestAnimationFrame(() => {
    relayScheduled = false;
    window.dispatchEvent(new Event("scroll"));
  });
}

function normalizeScrollArgs(args, scroller, isRelative = false) {
  const currentTop = scroller?.scrollTop || 0;
  const currentLeft = scroller?.scrollLeft || 0;
  const first = args[0];

  if (typeof first === "object" && first !== null) {
    const top = Number.isFinite(first.top) ? first.top : currentTop;
    const left = Number.isFinite(first.left) ? first.left : currentLeft;
    return {
      top: isRelative ? currentTop + top : top,
      left: isRelative ? currentLeft + left : left,
      behavior: first.behavior || "auto"
    };
  }

  const left = Number.isFinite(args[0]) ? Number(args[0]) : currentLeft;
  const top = Number.isFinite(args[1]) ? Number(args[1]) : currentTop;
  return {
    top: isRelative ? currentTop + top : top,
    left: isRelative ? currentLeft + left : left,
    behavior: "auto"
  };
}

function normalizeScrollIntoViewOptions(arg) {
  if (arg === false) {
    return { behavior: "auto", block: "end", inline: "nearest" };
  }

  if (typeof arg === "object" && arg !== null) {
    return {
      behavior: arg.behavior || "auto",
      block: arg.block || "start",
      inline: arg.inline || "nearest"
    };
  }

  return { behavior: "auto", block: "start", inline: "nearest" };
}

function clampScroll(value, max) {
  return Math.max(0, Math.min(value, Math.max(0, max)));
}

function getAxisTarget(current, viewportStart, viewportEnd, targetStart, targetEnd, align) {
  const targetSize = targetEnd - targetStart;
  const viewportSize = viewportEnd - viewportStart;
  const startTarget = current + targetStart - viewportStart;
  const endTarget = current + targetEnd - viewportEnd;

  if (align === "center") {
    return current + targetStart - viewportStart - ((viewportSize - targetSize) / 2);
  }

  if (align === "end") {
    return endTarget;
  }

  if (align === "nearest") {
    const isFullyVisible = targetStart >= viewportStart && targetEnd <= viewportEnd;
    if (isFullyVisible) return current;
    if (targetSize > viewportSize || targetStart < viewportStart) return startTarget;
    return endTarget;
  }

  return startTarget;
}

function scrollElementIntoAppView(element, arg) {
  const scroller = getAppScrollElement();
  if (!scroller || !scroller.contains(element)) return false;

  const options = normalizeScrollIntoViewOptions(arg);
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();
  const maxTop = scroller.scrollHeight - scroller.clientHeight;
  const maxLeft = scroller.scrollWidth - scroller.clientWidth;

  const top = getAxisTarget(
    scroller.scrollTop,
    scrollerRect.top,
    scrollerRect.bottom,
    targetRect.top,
    targetRect.bottom,
    options.block
  );

  const left = getAxisTarget(
    scroller.scrollLeft,
    scrollerRect.left,
    scrollerRect.right,
    targetRect.left,
    targetRect.right,
    options.inline
  );

  scroller.scrollTo({
    top: clampScroll(top, maxTop),
    left: clampScroll(left, maxLeft),
    behavior: options.behavior
  });
  relayWindowScroll();
  return true;
}

export function scrollAppTo(...args) {
  const scroller = getAppScrollElement();
  if (!scroller) {
    nativeScrollTo?.(...args);
    return;
  }
  scroller.scrollTo(normalizeScrollArgs(args, scroller));
  relayWindowScroll();
}

export function scrollAppBy(...args) {
  const scroller = getAppScrollElement();
  if (!scroller) {
    nativeScrollBy?.(...args);
    return;
  }
  scroller.scrollTo(normalizeScrollArgs(args, scroller, true));
  relayWindowScroll();
}

function defineWindowScrollGetter(name, getter) {
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      get: getter
    });
  } catch {
    // Some browsers may keep native scroll properties locked.
  }
}

function bindMainScroller() {
  const scroller = getAppScrollElement();
  if (!scroller || scroller.dataset.appScrollBridge === "ready") return;
  scroller.dataset.appScrollBridge = "ready";
  scroller.addEventListener("scroll", relayWindowScroll, { passive: true });
}

function installScrollIntoViewBridge() {
  const elementPrototype = window.Element?.prototype;
  if (!elementPrototype?.scrollIntoView || elementPrototype.scrollIntoView.__appShellBridge) return;

  nativeScrollIntoView = elementPrototype.scrollIntoView;

  const bridgedScrollIntoView = function bridgedScrollIntoView(arg) {
    if (scrollElementIntoAppView(this, arg)) return;
    nativeScrollIntoView.call(this, arg);
  };

  try {
    Object.defineProperty(bridgedScrollIntoView, "__appShellBridge", {
      configurable: false,
      value: true
    });
    elementPrototype.scrollIntoView = bridgedScrollIntoView;
  } catch {
    nativeScrollIntoView = null;
  }
}

export function installAppShellScrollBridge() {
  if (installed) return;
  installed = true;

  nativeScrollTo = window.scrollTo?.bind(window);
  nativeScrollBy = window.scrollBy?.bind(window);

  defineWindowScrollGetter("scrollY", getAppScrollTop);
  defineWindowScrollGetter("pageYOffset", getAppScrollTop);
  defineWindowScrollGetter("scrollX", getAppScrollLeft);
  defineWindowScrollGetter("pageXOffset", getAppScrollLeft);

  window.scrollTo = (...args) => scrollAppTo(...args);
  window.scrollBy = (...args) => scrollAppBy(...args);

  window.__getAppScrollElement = getAppScrollElement;
  window.__scrollAppToTop = (behavior = "smooth") => scrollAppTo({ top: 0, left: 0, behavior });

  installScrollIntoViewBridge();
  bindMainScroller();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindMainScroller, { once: true });
  } else {
    requestAnimationFrame(bindMainScroller);
  }
}
