import Phaser from "phaser";
import { useEffect, useMemo, useRef, useState } from "react";
import { IN_GAME_BOOSTERS } from "../game/core/BoosterManager.js";
import { blockerLabel, colorLabel, getGoalLabel } from "../game/core/LevelManager.js";
import GameScene from "../game/scenes/GameScene.js";
import BoosterButton from "../components/BoosterButton.jsx";
import WinModal from "../components/WinModal.jsx";
import LoseModal from "../components/LoseModal.jsx";

export default function GameScreen({
  level,
  progress,
  onSpendBooster,
  onWin,
  onLose,
  onBack,
  onNext
}) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [result, setResult] = useState(null);

  const callbacks = useMemo(() => ({
    onSceneReady: (scene) => { sceneRef.current = scene; },
    onStatsChange: setStats,
    onSpendBooster,
    onWin: (status) => {
      setResult({ type: "win", status });
      onWin(level, status);
    },
    onLose: (status) => {
      setResult({ type: "lose", status });
      onLose(level, status);
    }
  }), [level, onLose, onSpendBooster, onWin]);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    setResult(null);
    setStats(null);
    sceneRef.current = null;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: hostRef.current.clientWidth,
      height: hostRef.current.clientHeight,
      transparent: true,
      scene: [GameScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    });

    game.scene.start("GameScene", { level, callbacks });

    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, [callbacks, level]);

  const progressItems = stats?.goalProgress || [];
  const primaryTarget = progressItems[0];

  return (
    <main className="game-screen screen">
      <header className="game-hud candy-game-hud">
        <div className="hud-left-stack">
          <span className="hud-lives">{progress.lives} ♥ 5</span>
          <strong className="hud-moves">{stats?.moves ?? level.moves}</strong>
        </div>
        <div className="hud-star-meter" aria-label="Seviye yildizlari">
          <span className="meter-fill" style={{ "--meter": `${Math.min(100, Math.max(8, ((stats?.score || 0) / 600) * 100))}%` }} />
          <i>★</i><i>★</i><i>★</i>
        </div>
        <div className="hud-target-candy">
          <span className={`mini-candy ${primaryTarget?.key || "sapphire"}`} />
          <strong>{primaryTarget ? Math.max(0, primaryTarget.target - primaryTarget.current) : 0}</strong>
        </div>
        <div className="hud-helper-face" aria-hidden="true">☺</div>
      </header>

      <section className="game-layout">
        <aside className="goal-card">
          <p className="eyebrow">Hedef</p>
          <h2>{getGoalLabel(level)}</h2>
          <div className="goal-progress-list">
            {progressItems.map((item) => (
              <div className="goal-progress" key={item.key}>
                <span>{colorLabel(item.key) === item.key ? blockerLabel(item.key) : colorLabel(item.key)}</span>
                <strong>{item.current}/{item.target}</strong>
              </div>
            ))}
          </div>
          <p className="scene-message">{stats?.message || level.tutorial || "Kristal hedeflerini tamamla."}</p>
        </aside>

        <div className="phaser-shell" ref={hostRef} aria-label="Candy Crush oyun tahtasi" />

        <aside className="booster-card candy-booster-dock">
          <p className="eyebrow">Booster</p>
          <div className="booster-grid">
            {IN_GAME_BOOSTERS.map((booster) => (
              <BoosterButton
                key={booster.id}
                booster={booster}
                count={progress.boosters[booster.id] || 0}
                disabled={(progress.boosters[booster.id] || 0) <= 0 || Boolean(result)}
                onClick={() => sceneRef.current?.activateBooster(booster.id)}
              />
            ))}
          </div>
        </aside>
      </section>

      <button className="settings-fab game-settings" type="button" onClick={onBack} aria-label="Haritaya don">⚙</button>

      {result?.type === "win" && (
        <WinModal
          status={result.status}
          level={level}
          onMap={onBack}
          onNext={() => onNext(level.level + 1)}
        />
      )}

      {result?.type === "lose" && (
        <LoseModal
          status={result.status}
          lives={progress.lives}
          onMap={onBack}
          onRetry={() => onNext(level.level)}
        />
      )}
    </main>
  );
}
