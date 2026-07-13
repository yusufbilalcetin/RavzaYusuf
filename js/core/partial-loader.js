const partialCache = new Map();

export async function loadPartial(path) {
  if (partialCache.has(path)) return partialCache.get(path);

  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} yüklenemedi`);

  const html = await response.text();
  partialCache.set(path, html);
  return html;
}

export async function mountPartial(targetId, path) {
  const target = document.getElementById(targetId);
  if (!target) throw new Error(`${targetId} bulunamadı`);

  target.innerHTML = await loadPartial(path);
  return target;
}

export async function loadLayoutPartials() {
  await Promise.all([
    mountPartial("topbar-root", "./partials/layout/topbar.html"),
    mountPartial("tema-panel-root", "./partials/layout/tema-paneli.html"),
    mountPartial("launcher-shell-root", "./partials/layout/launcher-shell.html")
  ]);
}
