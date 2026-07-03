import TopBar from "../components/TopBar.jsx";

export default function HomeScreen({
  progress,
  dailyAvailable,
  dailyMessage,
  onPlay,
  onDailyReward,
  onReset,
  onSettings
}) {
  return (
    <main className="home-screen screen">
      <section className="home-hero">
        <TopBar progress={progress} onSettings={onSettings} />
        <div className="brand-orb" aria-hidden="true">◇</div>
        <p className="eyebrow">Buyulu kristal adasi</p>
        <h1>Candy Crush</h1>
        <p className="home-copy">
          Renkli kristalleri eslestir, engelleri kir, bolumleri ac ve adalar boyunca ilerle.
          Oyun sistemi match-3 turundedir; gorsel dil tamamen ozgun kristal temasidir.
        </p>

        <div className="home-actions">
          <button className="primary-action" type="button" onClick={onPlay}>Oyna</button>
          <button className="secondary-action" type="button" onClick={onDailyReward}>
            {dailyAvailable ? "Gunluk odul" : "Odul alindi"}
          </button>
          <button className="ghost-action" type="button" onClick={onReset}>Sifirla</button>
        </div>

        {dailyMessage && <p className="reward-message">{dailyMessage}</p>}
      </section>

      <aside className="home-panel" aria-label="Oyuncu durumu">
        <div><span>Can</span><strong>{progress.lives}/5</strong></div>
        <div><span>Crystal Coin</span><strong>{progress.coins}</strong></div>
        <div><span>Acik seviye</span><strong>{progress.maxUnlocked}</strong></div>
        <div><span>Posta kutusu</span><strong>{progress.mailboxLives}/200</strong></div>
      </aside>
    </main>
  );
}
