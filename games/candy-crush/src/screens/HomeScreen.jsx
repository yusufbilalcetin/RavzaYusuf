export default function HomeScreen({
  progress,
  dailyAvailable,
  dailyMessage,
  onPlay,
  onDailyReward,
  onSettings
}) {
  return (
    <main className="home-screen screen">
      <section className="home-hero candy-home-hero">
        <div className="cloud cloud-a" aria-hidden="true" />
        <div className="cloud cloud-b" aria-hidden="true" />
        <div className="cloud cloud-c" aria-hidden="true" />

        <button className="settings-fab" type="button" onClick={onSettings} aria-label="Ayarlar">⚙</button>
        <div className="candy-logo-wrap" aria-label="Candy Crush">
          <span className="logo-string" aria-hidden="true" />
          <div className="candy-logo-tag">
            <h1>Candy<br />Crush</h1>
            <span className="logo-heart" aria-hidden="true">♥</span>
          </div>
        </div>

        <div className="candy-land candy-land-back" aria-hidden="true" />
        <div className="candy-land candy-land-front" aria-hidden="true" />
        <div className="candy-road" aria-hidden="true" />
        <div className="candy-house" aria-hidden="true" />
        <div className="candy-pile pile-left" aria-hidden="true">
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className="candy-pile pile-right" aria-hidden="true">
          <span /><span /><span /><span />
        </div>

        <div className="home-actions candy-home-actions">
          <button className="primary-action candy-play-button" type="button" onClick={onPlay}>Play</button>
          <button className="secondary-action candy-progress-button" type="button" onClick={onDailyReward}>
            {dailyAvailable ? "Retrieve My Progress" : "Progress Retrieved"}
          </button>
        </div>

        {dailyMessage && <p className="reward-message">{dailyMessage}</p>}
      </section>

      <aside className="home-panel" aria-label="Oyuncu durumu">
        <div className="home-actions">
          <button className="primary-action" type="button" onClick={onPlay}>Oyna</button>
          <button className="secondary-action" type="button" onClick={onDailyReward}>
            {dailyAvailable ? "Gunluk odul" : "Odul alindi"}
          </button>
        </div>
        <div><span>Can</span><strong>{progress.lives}/5</strong></div>
        <div><span>Seker Parasi</span><strong>{progress.coins}</strong></div>
        <div><span>Acik seviye</span><strong>{progress.maxUnlocked}</strong></div>
        <div><span>Posta kutusu</span><strong>{progress.mailboxLives}/200</strong></div>
      </aside>
    </main>
  );
}
