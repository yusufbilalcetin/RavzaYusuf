export function initQuizMerkezi() {
  window.renderQuizHub?.(document.getElementById("quizFilter")?.value || "");
}
