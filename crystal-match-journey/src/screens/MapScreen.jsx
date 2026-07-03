import { useEffect, useRef } from "react";
import { getDifficultyLabel, getGoalLabel } from "../game/core/LevelManager.js";

export default function MapScreen({
  levels,
  progress,
  dailyMessage,
  onBack,
  onStartLevel,
  onSettings,
  onBuyLife,
  onAdLife,
  onRequestLife,
  onAcceptLife
}) {
  const currentRef = useRef(null);
  const rowHeight = 126;
  const mapRoadHeight = levels.length * rowHeight + 180;
  const getNodeOffset = (index) => index % 4 === 0 ? -36 : index % 4 === 1 ? 18 : index % 4 === 2 ? 46 : -8;
  const roadPoints = levels.map((level, index) => ({
    x: 215 + getNodeOffset(index),
    y: 84 + index * rowHeight
  }));
  const roadPath = roadPoints.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y - 72}`;
    const previous = roadPoints[index - 1];
    const midY = (previous.y + point.y) / 2;
    return `${path} C ${previous.x} ${midY}, ${point.x} ${midY}, ${point.x} ${point.y}`;
  }, "");

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <main className="map-screen screen">
      <header className="screen-topbar candy-map-topbar">
        <button className="map-mail-button" type="button" onClick={onAcceptLife} aria-label="Posta">✉</button>
        <div className="map-life-pill"><strong>♥ {progress.lives}</strong><span>Full</span></div>
        <div className="map-avatar" aria-hidden="true">☺</div>
        <div className="map-coin-pill"><strong>▰</strong><span>{progress.coins}</span></div>
        <button className="settings-fab map-settings" type="button" onClick={onSettings} aria-label="Ayarlar">⚙</button>
      </header>

      <section className="map-heading candy-map-heading">
        <p className="eyebrow">Buyulu ada yolu</p>
        <h2>Harita</h2>
        <p>Yuvarlak bolum noktalarini takip et. Eski bolumleri tekrar oynayabilir, siradaki acik bolumu ilerletebilirsin.</p>
        {dailyMessage && <p className="reward-message">{dailyMessage}</p>}
      </section>

      {progress.lives <= 0 && (
        <section className="life-empty-panel">
          <strong>Can bitti</strong>
          <div className="life-actions">
            <button type="button" className="secondary-action" onClick={onAdLife}>Reklam simule et</button>
            <button type="button" className="secondary-action" onClick={onBuyLife}>80 coin ile can al</button>
            <button type="button" className="secondary-action" onClick={onRequestLife}>Arkadaslardan iste</button>
            <button type="button" className="secondary-action" onClick={onAcceptLife}>Postadan kabul et</button>
          </div>
        </section>
      )}

      <section className="island-map candy-island-map" aria-label="Seviye haritasi">
        <svg
          className="candy-map-road"
          viewBox={`0 0 430 ${mapRoadHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <pattern id="candy-road-stripe" patternUnits="userSpaceOnUse" width="42" height="42" patternTransform="rotate(28)">
              <rect width="42" height="42" fill="#fff4cf" />
              <rect width="21" height="42" fill="#ff73ba" />
            </pattern>
          </defs>
          <path className="candy-map-road-border" d={roadPath} />
          <path className="candy-map-road-fill" d={roadPath} stroke="url(#candy-road-stripe)" />
        </svg>
        <div className="map-character map-character-left" aria-hidden="true">☁</div>
        <div className="map-character map-character-right" aria-hidden="true">♧</div>
        {levels.map((level, index) => {
          const unlocked = level.level <= progress.maxUnlocked;
          const completed = Number(progress.stars[level.level] || 0) > 0;
          const stars = Number(progress.stars[level.level] || 0);
          const isCurrent = level.level === progress.maxUnlocked;
          const offset = getNodeOffset(index);
          return (
            <article className={`map-row ${level.difficulty}`} key={level.level}>
              {(level.level === 1 || (level.level - 1) % 20 === 0) && (
                <div className="world-banner">
                  <span>{level.world}</span>
                </div>
              )}
              <button
                ref={isCurrent ? currentRef : null}
                className={`level-node ${unlocked ? "unlocked" : "locked"} ${completed ? "completed" : ""} ${level.difficulty}`}
                type="button"
                disabled={!unlocked}
                style={{ "--offset": `${offset}px` }}
                onClick={() => onStartLevel(level.level)}
              >
                <span className="level-number">{unlocked ? level.level : "L"}</span>
                <strong>{getDifficultyLabel(level.difficulty)}</strong>
                <small>{getGoalLabel(level)}</small>
                <span className="node-stars">{"★".repeat(stars)}{"☆".repeat(3 - stars)}</span>
              </button>
            </article>
          );
        })}
      </section>

      <nav className="map-bottom-nav" aria-label="Harita menusu">
        <button type="button" className="active" onClick={onBack}><span>🗺</span>Map</button>
        <button type="button"><span>✓</span>Tasks</button>
        <button type="button" onClick={onRequestLife}><span>👥</span>Friends</button>
        <button type="button" onClick={onAdLife}><span>★</span>Boost</button>
        <button type="button" onClick={onBuyLife}><span>🏪</span>Shop</button>
      </nav>
    </main>
  );
}
