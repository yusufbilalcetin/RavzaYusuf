import { useState } from "react";
import { PRE_LEVEL_BOOSTERS } from "../game/core/BoosterManager.js";
import { getDifficultyLabel, getGoalLabel } from "../game/core/LevelManager.js";
import BoosterButton from "../components/BoosterButton.jsx";

export default function LevelStartScreen({ level, progress, onBack, onPlay, onBuyBooster }) {
  const [selected, setSelected] = useState([]);
  const noLives = progress.lives <= 0;
  const target = getPrimaryTarget(level);

  function toggleBooster(id) {
    if ((progress.boosters[id] || 0) <= 0) return;
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  return (
    <main className="level-start-screen screen">
      <section className={`level-start-card ${level.difficulty}`}>
        <span className="level-card-string" aria-hidden="true" />
        <button className="level-close-button" type="button" onClick={onBack} aria-label="Haritaya don">X</button>
        <h1>Level {level.level}</h1>
        <div className="level-order-row">
          <span className={`target-medallion ${target.key}`} aria-hidden="true" />
          <div>
            <strong>Collect all orders</strong>
            <small>{target.count} {target.label}</small>
          </div>
        </div>
        <div className="level-meta-row">
          <span>{getDifficultyLabel(level.difficulty)}</span>
          <span>{level.moves} hamle</span>
          <span>{level.rows}x{level.cols}</span>
        </div>
        {level.tutorial && <p className="tutorial-callout">{level.tutorial}</p>}

        <div className="level-card-divider" />
        <h2>Select boosters:</h2>
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
          Play!
        </button>
      </section>
    </main>
  );
}

function getPrimaryTarget(level) {
  const goal = level.goal || {};
  if (goal.type === "collect") {
    const [key, count] = Object.entries(goal.targets || {})[0] || ["sapphire", 0];
    return { key, count, label: getGoalLabel({ goal: { type: "collect", targets: { [key]: count } } }).replace(`${count} `, "") };
  }
  if (goal.type === "clear_ice") return { key: "ice", count: goal.count || 0, label: "frosting" };
  if (goal.type === "break_chains") return { key: "chain", count: goal.count || 0, label: "chain" };
  if (goal.type === "break_crates") return { key: "crate", count: goal.count || 0, label: "crate" };
  if (goal.type === "drop_relic") return { key: "relic", count: goal.count || 0, label: "drop" };
  if (goal.type === "mixed") {
    const clear = Object.entries(goal.clear || {})[0];
    if (clear) return { key: clear[0], count: clear[1], label: clear[0] };
    const target = Object.entries(goal.targets || {})[0];
    if (target) return { key: target[0], count: target[1], label: target[0] };
  }
  return { key: "sapphire", count: 0, label: "orders" };
}
