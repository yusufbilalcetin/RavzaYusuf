/**
 * Mobile, center-origin paper curl renderer.
 *
 * St.PageFlip models a page turn as one corner-anchored line and one rigid
 * clip polygon. That geometry is intentionally kept for edge gestures. An
 * inner-page drag needs a different visual primitive: a narrow vertical band
 * whose crease stays under the finger while its cross-section bends.
 *
 * The renderer owns visuals only. Canonical page state remains in the reader
 * and is committed after the overlay reaches its destination.
 */

export const CENTER_CURL = Object.freeze({
  innerStartRatio: 0.2,
  innerEndRatio: 0.8,
  maxViewportWidth: 480,
  sliceCount: 12,
  profileSamples: 11,
  minBandPx: 30,
  maxBandPx: 62,
  minBandRatio: 0.078,
  breatheRatio: 0.043,
  curveRatio: 0.019,
  maxCurvePx: 8.5,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / Math.max(0.0001, to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = value => (value < 0.5
  ? 4 * value * value * value
  : 1 - ((-2 * value + 2) ** 3) / 2);

function createElement(className, attributes = {}) {
  const element = document.createElement('div');
  element.className = className;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function applyTexture(element, texture, positionX = texture.contentLeft) {
  element.style.backgroundImage = `url(${JSON.stringify(texture.url)})`;
  element.style.backgroundSize = `${texture.contentWidth}px ${texture.contentHeight}px`;
  element.style.backgroundPosition = `${positionX}px ${texture.contentTop}px`;
}

function createFlatSurface(role, texture, paperColor) {
  const surface = createElement(`center-curl__flat center-curl__flat--${role}`, {
    'data-curl-role': role,
  });
  surface.style.backgroundColor = paperColor;
  const print = createElement('center-curl__print');
  applyTexture(print, texture);
  surface.appendChild(print);
  return { element: surface, print };
}

function createSlice(index, paperColor, texture) {
  const element = createElement('center-curl__slice', {
    'data-curl-slice': index,
  });
  element.style.backgroundColor = paperColor;
  const print = createElement('center-curl__print');
  applyTexture(print, texture);
  const shade = createElement('center-curl__slice-shade');
  element.append(print, shade);
  return { element, print, shade };
}

function polygonForStrip(offsets, yValues, pad, stripWidth, overlap = 0.8) {
  const left = offsets.map((offset, index) => `${(pad + offset).toFixed(3)}px ${(yValues[index] * 100).toFixed(3)}%`);
  const right = offsets.map((offset, index) => `${(pad + offset + stripWidth + overlap).toFixed(3)}px ${(yValues[index] * 100).toFixed(3)}%`).reverse();
  return `polygon(${left.concat(right).join(',')})`;
}

function polygonForSide(side, width, boundaryXs, yValues) {
  if (side === 'left') {
    const edge = boundaryXs.map((x, index) => `${clamp(x, 0, width).toFixed(3)}px ${(yValues[index] * 100).toFixed(3)}%`);
    return `polygon(0 0,${edge.join(',')},0 100%)`;
  }
  const edge = boundaryXs.map((x, index) => `${clamp(x, 0, width).toFixed(3)}px ${(yValues[index] * 100).toFixed(3)}%`);
  return `polygon(${edge.join(',')},${width.toFixed(3)}px 100%,${width.toFixed(3)}px 0)`;
}

function projectedBoundary(index, count) {
  const angle = -Math.PI / 2 + (Math.PI * index) / count;
  return (Math.sin(angle) + 1) / 2;
}

function frameBandWidth(width, progress) {
  const base = Math.max(CENTER_CURL.minBandPx, width * CENTER_CURL.minBandRatio);
  const breath = Math.sin(Math.PI * clamp(progress, 0, 1));
  return clamp(base + width * CENTER_CURL.breatheRatio * breath, CENTER_CURL.minBandPx, Math.min(CENTER_CURL.maxBandPx, width * 0.15));
}

function lightingAt(phase) {
  const t = clamp(phase, 0, 1);
  return t <= 0.5
    ? 0.062 * Math.sin(Math.PI * t * 2)
    : -0.072 * Math.sin(Math.PI * (t - 0.5) * 2);
}

function lightingColor(value) {
  if (value >= 0) return `rgba(255,255,255,${value.toFixed(4)})`;
  return `rgba(22,17,14,${Math.abs(value).toFixed(4)})`;
}

/**
 * Create one bounded visual session. No nodes are created after this call.
 * Pointer frames only change style/data properties on these nodes.
 */
export function createCenterCurlSession({
  host,
  width,
  height,
  startX,
  startY,
  direction,
  currentTexture,
  targetTexture,
  paperColor,
}) {
  if (!(host instanceof Element)) throw new TypeError('Center curl host is required');
  if (!['forward', 'back'].includes(direction)) throw new TypeError('Invalid center curl direction');

  const root = createElement('center-curl', {
    'aria-hidden': 'true',
    'data-reader-center-curl': '',
    'data-curl-mode': 'band',
    'data-curl-direction': direction,
    'data-curl-slice-count': CENTER_CURL.sliceCount,
  });
  root.style.setProperty('--center-curl-paper', paperColor);

  const target = createFlatSurface('target', targetTexture, paperColor);
  const current = createFlatSurface('current', currentTexture, paperColor);
  const currentShadow = createElement('center-curl__shadow center-curl__shadow--current');
  const targetShadow = createElement('center-curl__shadow center-curl__shadow--target');
  const band = createElement('center-curl__band', { 'data-curl-band': '' });
  const slices = Array.from(
    { length: CENTER_CURL.sliceCount },
    (_, index) => createSlice(index, paperColor, currentTexture),
  );
  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index];
    const backFacing = direction === 'forward'
      ? index >= slices.length / 2
      : index < slices.length / 2;
    const from = index / slices.length;
    const to = (index + 1) / slices.length;
    const lightFrom = lightingAt(direction === 'forward' ? from : 1 - from);
    const lightTo = lightingAt(direction === 'forward' ? to : 1 - to);
    slice.element.dataset.curlRole = backFacing ? 'back' : 'front';
    slice.element.dataset.curlFace = backFacing ? 'back' : 'front';
    slice.element.classList.toggle('is-back', backFacing);
    slice.print.classList.toggle('pdf-backside-print', backFacing);
    slice.print.setAttribute('data-curl-role', backFacing ? 'back' : 'front');
    // One continuous lighting phase spans the whole cylinder. Adjacent slices
    // share the same endpoint color, so the paper reads as a single surface
    // instead of twelve repeated black-white-black ribs.
    slice.shade.style.background = `linear-gradient(90deg,${lightingColor(lightFrom)},${lightingColor(lightTo)})`;
    band.appendChild(slice.element);
  }
  const crease = createElement('center-curl__crease', { 'data-curl-crease': '' });
  root.append(target.element, current.element, currentShadow, targetShadow, band, crease);
  host.appendChild(root);

  const yValues = Array.from(
    { length: CENTER_CURL.profileSamples },
    (_, index) => index / (CENTER_CURL.profileSamples - 1),
  );
  const curveCenter = clamp(startY / Math.max(1, height), 0.08, 0.92);
  const curvePad = Math.ceil(CENTER_CURL.maxCurvePx) + 2;
  const effectiveTravel = Math.max(1, direction === 'forward' ? startX : width - startX);
  let destroyed = false;
  let animationFrame = 0;
  let animationResolve = null;
  let currentX = startX;
  let currentProgress = 0;

  const profileFor = progress => {
    const strength = Math.min(CENTER_CURL.maxCurvePx, width * CENTER_CURL.curveRatio)
      * (0.34 + 0.66 * Math.sin(Math.PI * clamp(progress, 0, 1)));
    const sign = direction === 'forward' ? 1 : -1;
    const sigma = 0.205;
    return yValues.map(y => {
      const distance = (y - curveCenter) / sigma;
      const weight = Math.exp(-0.5 * distance * distance);
      // The material point under the finger is the contact point, so its
      // displacement is zero. The rest of the vertical crease eases away from
      // it, retaining the same nonlinear silhouette without an 8px contact
      // offset at maximum bend.
      return sign * strength * (weight - 1);
    });
  };

  const placeCurvedStrip = (element, left, stripWidth, offsets) => {
    const boxLeft = left - curvePad;
    element.style.left = `${boxLeft.toFixed(3)}px`;
    element.style.width = `${(stripWidth + curvePad * 2).toFixed(3)}px`;
    element.style.clipPath = polygonForStrip(offsets, yValues, curvePad, stripWidth);
  };

  const render = ({ x, progress, fingerX = x }) => {
    if (destroyed) return;
    currentX = clamp(x, 0, width);
    currentProgress = clamp(progress, 0, 1);
    const bandWidth = frameBandWidth(width, currentProgress);
    const offsets = profileFor(currentProgress);
    const reveal = smoothstep(0.018, 0.10, currentProgress);
    const alpha = smoothstep(0.008, 0.07, currentProgress);
    const bandLeft = currentX - bandWidth / 2;
    const bandRight = currentX + bandWidth / 2;
    const targetBoundaries = offsets.map(offset => (
      direction === 'forward' ? bandRight + offset : bandLeft + offset
    ));

    // The current sheet remains a full, flat base. The target is clipped to
    // the far edge of the curl and fades in during the first few pixels. This
    // keeps the page/curl topology attached even at 10% without popping half
    // the target page into view on the activation frame.
    current.element.style.clipPath = 'none';
    target.element.style.clipPath = polygonForSide(
      direction === 'forward' ? 'right' : 'left',
      width,
      targetBoundaries,
      yValues,
    );
    target.element.style.opacity = reveal.toFixed(4);
    band.style.opacity = alpha.toFixed(4);
    currentShadow.style.opacity = (alpha * (0.24 + currentProgress * 0.18)).toFixed(4);
    targetShadow.style.opacity = (alpha * (0.2 + currentProgress * 0.2)).toFixed(4);
    crease.style.opacity = (alpha * (0.42 + currentProgress * 0.18)).toFixed(4);

    const currentEdge = direction === 'forward' ? bandLeft : bandRight;
    const targetEdge = direction === 'forward' ? bandRight : bandLeft;
    placeCurvedStrip(currentShadow, currentEdge - (direction === 'forward' ? 13 : 1), 14, offsets);
    placeCurvedStrip(targetShadow, targetEdge - (direction === 'forward' ? 1 : 13), 14, offsets);
    placeCurvedStrip(crease, currentX - 0.55, 1.1, offsets);

    const sourceBandWidth = bandWidth * 1.08;
    const sourceSliceWidth = sourceBandWidth / slices.length;
    const sourceLeft = clamp(currentX - sourceBandWidth / 2, -sourceBandWidth, width);
    for (let index = 0; index < slices.length; index += 1) {
      const slice = slices[index];
      const from = projectedBoundary(index, slices.length);
      const to = projectedBoundary(index + 1, slices.length);
      const outputLeft = bandLeft + bandWidth * from;
      const outputWidth = Math.max(0.7, bandWidth * (to - from));
      const sourceFrom = index / slices.length;
      const sourceTo = (index + 1) / slices.length;
      const backFacing = direction === 'forward'
        ? index >= slices.length / 2
        : index < slices.length / 2;
      const sourceRatio = backFacing ? 1 - sourceTo : sourceFrom;
      const sourceX = sourceLeft + sourceBandWidth * sourceRatio;
      const localMid = curvePad + offsets[Math.floor(offsets.length / 2)];
      const projectedScale = outputWidth / Math.max(0.01, sourceSliceWidth);
      slice.element.dataset.curlSourceX = sourceX.toFixed(3);
      slice.element.style.left = `${(outputLeft - curvePad - 0.55).toFixed(3)}px`;
      slice.element.style.width = `${(outputWidth + curvePad * 2 + 1.1).toFixed(3)}px`;
      slice.element.style.clipPath = polygonForStrip(offsets, yValues, curvePad, outputWidth, 1.1);
      const textureLeft = localMid - (sourceX - currentTexture.contentLeft) * projectedScale;
      slice.print.style.backgroundSize = `${(currentTexture.contentWidth * projectedScale).toFixed(3)}px ${currentTexture.contentHeight}px`;
      slice.print.style.backgroundPosition = `${textureLeft.toFixed(3)}px ${currentTexture.contentTop}px`;
      // Mirror each backside crop around its own visible center. Mirroring
      // around the right edge advanced the first back crop by one whole slice,
      // producing a visible text/image jump at the front/back seam.
      slice.print.style.transformOrigin = `${(localMid + outputWidth / 2).toFixed(3)}px center`;
      slice.print.style.transform = backFacing ? 'scaleX(-1)' : 'none';

    }

    const foldXs = offsets.map(offset => currentX + offset);
    root.dataset.curlBandWidth = bandWidth.toFixed(3);
    root.dataset.curlCreaseX = currentX.toFixed(3);
    root.dataset.curlFingerX = Number(fingerX).toFixed(3);
    root.dataset.curlProgress = currentProgress.toFixed(5);
    root.dataset.curlCurveCenter = curveCenter.toFixed(5);
    root.dataset.curlFoldXs = foldXs.map(value => value.toFixed(3)).join(',');
    root.style.setProperty('--center-curl-band-width', `${bandWidth}px`);
  };

  const update = ({ x, fingerX = x }) => {
    const signedTravel = direction === 'forward' ? startX - x : x - startX;
    const progress = Math.max(0, signedTravel) / effectiveTravel;
    render({ x, fingerX, progress });
  };

  const animateTo = ({ x, progress, duration }) => new Promise(resolve => {
    if (destroyed) { resolve(false); return; }
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (animationResolve) animationResolve(false);
    animationResolve = resolve;
    const fromX = currentX;
    const fromProgress = currentProgress;
    const startedAt = performance.now();
    const span = Math.max(1, duration);
    const tick = now => {
      if (destroyed) return;
      const elapsed = clamp((now - startedAt) / span, 0, 1);
      const eased = easeInOutCubic(elapsed);
      render({
        x: mix(fromX, x, eased),
        fingerX: mix(fromX, x, eased),
        progress: mix(fromProgress, progress, eased),
      });
      if (elapsed < 1) {
        animationFrame = requestAnimationFrame(tick);
        return;
      }
      animationFrame = 0;
      const done = animationResolve;
      animationResolve = null;
      done?.(true);
    };
    animationFrame = requestAnimationFrame(tick);
  });

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    const done = animationResolve;
    animationResolve = null;
    done?.(false);
    root.remove();
    for (const slice of slices) {
      slice.print.style.backgroundImage = '';
      slice.element.remove();
    }
    current.print.style.backgroundImage = '';
    target.print.style.backgroundImage = '';
  };

  render({ x: startX, fingerX: startX, progress: 0 });
  return {
    root,
    update,
    animateTo,
    destroy,
    getState: () => ({ x: currentX, progress: currentProgress }),
  };
}
