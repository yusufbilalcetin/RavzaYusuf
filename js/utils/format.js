export function formatPercent(score, total) {
  return total === 0 ? 0 : Math.round((score / total) * 100);
}
