export default function DailyRewardModal({ reward, onClose }) {
  if (!reward) return null;

  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="dailyTitle">
      <div className="result-card">
        <p className="eyebrow">Gunluk odul</p>
        <h2 id="dailyTitle">{reward.label}</h2>
        <p>Seri devam ettikce 7. gunde buyuk sandik acilir.</p>
        <div className="result-actions">
          <button className="primary-action" type="button" onClick={onClose}>Tamam</button>
        </div>
      </div>
    </div>
  );
}
