import { getWinCoinReward } from "../game/core/EconomyManager.js";

export default function WinModal({ status, level, onMap, onNext }) {
  const reward = getWinCoinReward(level, status.stars);
  const stars = "\u2605".repeat(status.stars) + "\u2606".repeat(3 - status.stars);

  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="winTitle">
      <div className="result-card win">
        <p className="eyebrow">Bolum tamamlandi</p>
        <h2 id="winTitle">Ada yolu acildi</h2>
        <div className="big-stars">{stars}</div>
        <p>Skor: <strong>{status.score}</strong></p>
        <p>Kazanilan coin: <strong>{reward}</strong></p>
        <div className="result-actions">
          <button className="secondary-action" type="button" onClick={onMap}>Haritaya don</button>
          <button className="primary-action" type="button" onClick={onNext}>Sonraki bolum</button>
        </div>
      </div>
    </div>
  );
}
