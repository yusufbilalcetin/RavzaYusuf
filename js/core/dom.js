export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

export function setHtml(target, html) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (el) el.innerHTML = html;
  return el;
}
