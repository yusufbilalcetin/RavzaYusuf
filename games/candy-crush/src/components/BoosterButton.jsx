const BOOSTER_ICONS = {
  startLine: "⚡",
  startBomb: "💣",
  startRainbow: "🌈",
  startMoves: "+3",
  hammer: "🍭",
  freeSwap: "🧤",
  colorBlast: "🎯",
  targetFly: "🚀",
  extraMoves: "+5"
};

export default function BoosterButton({ booster, count = 0, selected = false, disabled = false, onClick }) {
  const locked = count <= 0;
  return (
    <button
      type="button"
      className={`booster-button ${selected ? "selected" : ""} ${locked ? "locked" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={booster.description}
    >
      <span>{BOOSTER_ICONS[booster.id] || "★"}</span>
      <strong>{booster.name}</strong>
      <small>{count}</small>
      {locked
        ? <em className="booster-lock" aria-hidden="true">🔒</em>
        : <em className="booster-count">{count}</em>}
    </button>
  );
}
