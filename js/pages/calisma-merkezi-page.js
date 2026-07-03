export function initCalismaMerkezi() {
  window.renderStudyHub?.(document.getElementById("studyFilter")?.value || "");
}
