export function initEzberMerkezi() {
  window.renderMemorizationHub?.(document.getElementById("memoryFilter")?.value || "");
  window.renderMemoryPractice?.();
  window.setMemoryTab?.("practice");
}
