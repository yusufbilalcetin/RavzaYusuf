import { useEffect, useMemo, useRef, useState } from "react";
import { IN_GAME_BOOSTERS } from "../game/core/BoosterManager.js";
import { blockerLabel, colorLabel, getGoalLabel } from "../game/core/LevelManager.js";
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
  const reducedMotion = Boolean(progress.settings?.reducedMotion);

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
    let cancelled = false;
    let game = null;
    setResult(null);
    setStats(null);
    sceneRef.current = null;

    // Phaser (~1.4MB) is only needed once a level actually opens, so it is
    // fetched lazily instead of bundled into the Home/Map screens' chunk.
    Promise.all([import("phaser"), import("../game/scenes/GameScene.js")]).then(
      ([{ default: Phaser }, { default: GameScene }]) => {
        if (cancelled || !hostRef.current) return;
        game = new Phaser.Game({
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
        game.scene.start("GameScene", { level, callbacks, reducedMotion });
      }
    );

    return () => {
      cancelled = true;
      sceneRef.current = null;
      game?.destroy(true);
    };
  }, [callbacks, level, reducedMotion]);

  const progressItems = stats?.goalProgress || [];
  const earnedStars = stats?.stars || 0;
  const meterPct = Math.min(100, Math.max(4, ((stats?.score || 0) / (level.moves * 180)) * 100));

  return (
    <main className="game-screen screen">
      <header className="game-hud candy-game-hud">
        <div className="hud-left-stack">
          <span className="hud-lives">{level.level}/ ♥{progress.lives}</span>
          <strong className="hud-moves">{stats?.moves ?? level.moves}</strong>
        </div>
        <div className="hud-star-meter" aria-label={`Seviye yildizlari: ${earnedStars}/3`}>
          <span className="meter-fill" style={{ "--meter": `${meterPct}%` }} />
          {[1, 2, 3].map((star) => (
            <i key={star} className={earnedStars >= star ? "lit" : ""}>★</i>
          ))}
        </div>
        <div className="hud-target-candy" aria-label="Kalan hedefler">
          {(progressItems.length ? progressItems : [{ key: "sapphire", current: 0, target: 0 }]).slice(0, 3).map((item) => {
            const remaining = Math.max(0, item.target - item.current);
            return (
              <span className="hud-goal-item" key={item.key}>
                <span className={`mini-candy ${item.key}`} />
                {remaining > 0
                  ? <strong>{remaining}</strong>
                  : <strong className="goal-done">✓</strong>}
              </span>
            );
          })}
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
          <p className="scene-message">{stats?.message || level.tutorial || "Seker hedeflerini tamamla."}</p>
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
