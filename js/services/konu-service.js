import { KONU_LISTESI } from "../../data-js/konu-listesi.js";
import { loadTopicHtml } from "../core/html-loader.js";

export function getKonuListesi() {
  return KONU_LISTESI;
}

export function getKonuById(topicId) {
  return KONU_LISTESI.find((topic) => topic.id === topicId);
}

export function loadKonuHtml(topicId) {
  const topic = getKonuById(topicId);
  if (!topic) throw new Error("Konu bulunamadı");
  return loadTopicHtml(topic);
}
