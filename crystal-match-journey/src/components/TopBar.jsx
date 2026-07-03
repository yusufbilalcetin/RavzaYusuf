import HeartLives from "./HeartLives.jsx";

export default function TopBar({ progress, onSettings }) {
  return (
    <header className="top-resource-bar">
      <HeartLives progress={progress} />
      <div className="coin-pill">
        <strong>◆ {progress.coins}</strong>
        <small>Crystal Coin</small>
      </div>
      <button className="ghost-action compact" type="button" onClick={onSettings} aria-label="Ayarlar">Ayarlar</button>
    </header>
  );
}
