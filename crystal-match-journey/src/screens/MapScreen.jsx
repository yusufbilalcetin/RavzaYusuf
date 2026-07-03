import { useEffect, useRef } from "react";
import TopBar from "../components/TopBar.jsx";
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

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <main className="map-screen screen">
      <header className="screen-topbar">
        <button className="ghost-action compact" type="button" onClick={onBack}>Ana menu</button>
        <TopBar progress={progress} onSettings={onSettings} />
      </header>

      <section className="map-heading">
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

      <section className="island-map" aria-label="Seviye haritasi">
        {levels.map((level, index) => {
          const unlocked = level.level <= progress.maxUnlocked;
          const completed = Number(progress.stars[level.level] || 0) > 0;
          const stars = Number(progress.stars[level.level] || 0);
          const isCurrent = level.level === progress.maxUnlocked;
          const offset = index % 4 === 0 ? -36 : index % 4 === 1 ? 18 : index % 4 === 2 ? 46 : -8;
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
    </main>
  );
}
