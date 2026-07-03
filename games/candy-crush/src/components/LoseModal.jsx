export default function LoseModal({ status, lives, onMap, onRetry }) {
  const remaining = (status.goalProgress || [])
    .map((item) => `${Math.max(0, item.target - item.current)} ${item.key}`)
    .join(", ");

  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="loseTitle">
      <div className="result-card candy-result lose">
        <p className="eyebrow">Hamle bitti</p>
        <h2 id="loseTitle">Az kaldi!</h2>
        <div className="result-stats">
          <p>Kalan hedef <strong>{remaining || "tamamlanmadi"}</strong></p>
          <p>Can <strong>♥ {lives}/5</strong></p>
          <p>Skor <strong>{status.score}</strong></p>
        </div>
        <div className="result-actions">
          <button className="secondary-action" type="button" onClick={onMap}>Harita</button>
          <button className="primary-action" type="button" onClick={onRetry} disabled={lives <= 0}>
            Tekrar dene
          </button>
        </div>
      </div>
    </div>
  );
}
