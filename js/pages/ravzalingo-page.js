export async function initRavzaLingo() {
  await window.ensureQuestionBankLoaded?.();
  if (typeof window.refreshRavzaLingoContent === "function") {
    window.refreshRavzaLingoContent();
  } else {
    window.renderRavzaLingo?.();
  }
}
