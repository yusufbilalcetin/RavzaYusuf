export default function LoseModal({ status, lives, onMap, onRetry }) {
  const remaining = (status.goalProgress || [])
    .map((item) => `${Math.max(0, item.target - item.current)} ${item.key}`)
    .join(", ");

  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="loseTitle">
      <div className="result-card lose">
        <p className="eyebrow">Hamle bitti</p>
        <h2 id="loseTitle">Hedef kaldi</h2>
        <p>Kalan: <strong>{remaining || "hedef tamamlanmadi"}</strong></p>
        <p>Kalan can: <strong>{lives}/5</strong></p>
        <p>Skor: <strong>{status.score}</strong></p>
        <div className="result-actions">
          <button className="secondary-action" type="button" onClick={onMap}>Haritaya don</button>
          <button className="primary-action" type="button" onClick={onRetry} disabled={lives <= 0}>
            Tekrar dene
          </button>
        </div>
      </div>
    </div>
  );
}
