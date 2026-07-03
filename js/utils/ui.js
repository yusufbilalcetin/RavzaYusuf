export function showInlineError(targetId, message) {
  const target = document.getElementById(targetId);
  if (target) target.innerHTML = `<div class="empty-grid">${message}</div>`;
}

export function showToast(message) {
  console.warn(message);
}
