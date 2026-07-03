import { useState } from "react";
import { PRE_LEVEL_BOOSTERS } from "../game/core/BoosterManager.js";
import { getDifficultyLabel, getGoalLabel } from "../game/core/LevelManager.js";
import BoosterButton from "../components/BoosterButton.jsx";

export default function LevelStartScreen({ level, progress, onBack, onPlay, onBuyBooster }) {
  const [selected, setSelected] = useState([]);
  const noLives = progress.lives <= 0;

  function toggleBooster(id) {
    if ((progress.boosters[id] || 0) <= 0) return;
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  return (
    <main className="level-start-screen screen">
      <section className={`level-start-card ${level.difficulty}`}>
        <button className="ghost-action compact" type="button" onClick={onBack}>Harita</button>
        <p className="eyebrow">{level.world}</p>
        <h1>Seviye {level.level}</h1>
        <div className="level-meta-row">
          <span>{getDifficultyLabel(level.difficulty)}</span>
          <span>{level.moves} hamle</span>
          <span>{level.rows}x{level.cols}</span>
        </div>
        <h2>{getGoalLabel(level)}</h2>
        {level.tutorial && <p className="tutorial-callout">{level.tutorial}</p>}

        <div className="pre-booster-list">
          {PRE_LEVEL_BOOSTERS.map((booster) => (
            <div className="pre-booster-card" key={booster.id}>
              <BoosterButton
                booster={booster}
                count={progress.boosters[booster.id] || 0}
                selected={selected.includes(booster.id)}
                disabled={(progress.boosters[booster.id] || 0) <= 0}
                onClick={() => toggleBooster(booster.id)}
              />
              <button className="mini-buy" type="button" onClick={() => onBuyBooster(booster)}>
                {booster.price} coin
              </button>
            </div>
          ))}
        </div>

        {noLives && (
          <div className="no-lives-panel">
            <strong>Can bitti</strong>
            <p>Bekle, reklam simule et, coin ile can al veya posta kutusundan can kabul et.</p>
          </div>
        )}

        <button className="primary-action play-level-button" type="button" disabled={noLives} onClick={() => onPlay(selected)}>
          Oyna
        </button>
      </section>
    </main>
  );
}
