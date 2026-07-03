const htmlCache = new Map();

export async function loadHtml(path) {
  if (htmlCache.has(path)) return htmlCache.get(path);

  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} yüklenemedi`);

  const html = await response.text();
  htmlCache.set(path, html);
  return html;
}

export function loadTopicHtml(topic) {
  if (!topic?.contentPath) throw new Error("Konu içerik yolu bulunamadı");
  return loadHtml(topic.contentPath);
}

export function clearHtmlCache() {
  htmlCache.clear();
}
