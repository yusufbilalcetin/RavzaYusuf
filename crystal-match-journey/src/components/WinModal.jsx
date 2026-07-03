import { getWinCoinReward } from "../game/core/EconomyManager.js";

export default function WinModal({ status, level, onMap, onNext }) {
  const reward = getWinCoinReward(level, status.stars);

  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="winTitle">
      <div className="result-card candy-result win">
        <p className="eyebrow">Level {level.level}</p>
        <h2 id="winTitle">Tatli Zafer!</h2>
        <div className="big-stars" aria-label={`${status.stars} yildiz`}>
          {[1, 2, 3].map((star) => (
            <span key={star} className={`result-star ${status.stars >= star ? "earned" : ""}`}>★</span>
          ))}
        </div>
        <div className="result-stats">
          <p>Skor <strong>{status.score}</strong></p>
          <p>Coin <strong>+{reward}</strong></p>
        </div>
        <div className="result-actions">
          <button className="secondary-action" type="button" onClick={onMap}>Harita</button>
          <button className="primary-action" type="button" onClick={onNext}>Sonraki</button>
        </div>
      </div>
    </div>
  );
}
