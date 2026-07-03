export async function initKahoot() {
  await window.ensureQuestionBankLoaded?.();
  window.renderKahootHome?.();
}
