// Bolum secme ekraninin markup'i. Saf fonksiyonlar - olay baglama main.js'te.
import { TIERS, chapterRange } from "./levels.js";
import { isCompleted } from "./storage.js";

export function renderChapterTabs(activeChapter, progress) {
  return TIERS.map((tier, index) => {
    const chapter = index + 1;
    const classes = ["chapter-tab", chapter === activeChapter ? "is-active" : ""]
      .filter(Boolean).join(" ");
    return `<button class="${classes}" type="button" data-chapter="${chapter}">
      ${tier.name}
    </button>`;
  }).join("");
}

export function renderChapterCaption(chapter) {
  const tier = TIERS[chapter - 1];
  return `${tier.name} · ${tier.first}-${tier.last}`;
}

export function renderLevelGrid(chapter, progress) {
  const { first, last } = chapterRange(chapter);
  const cells = [];
  for (let id = first; id <= last; id += 1) {
    const done = isCompleted(progress, id);
    const perfect = Boolean(progress.best?.[id]?.perfect);
    const active = id === progress.currentLevel;
    const classes = ["level-cell", active ? "is-active" : "", done ? "is-complete" : ""]
      .filter(Boolean).join(" ");
    cells.push(`<button class="${classes}" type="button" data-level="${id}"
      aria-label="Bölüm ${id}${done ? ", tamamlandı" : ""}">
      <span class="level-cell-id">${id}</span>
      ${done ? `<span class="level-cell-mark" aria-hidden="true">${perfect ? "★" : "✓"}</span>` : ""}
    </button>`);
  }
  return cells.join("");
}
