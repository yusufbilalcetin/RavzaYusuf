export default function BoosterButton({ booster, count = 0, selected = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      className={`booster-button ${selected ? "selected" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={booster.description}
    >
      <span>{booster.id === "hammer" ? "H" : booster.id === "freeSwap" ? "<>" : booster.id === "colorBlast" ? "C" : booster.id === "targetFly" ? "^" : booster.id === "extraMoves" ? "+5" : "*"}</span>
      <strong>{booster.name}</strong>
      <small>{count}</small>
    </button>
  );
}
