import { useCallback, useEffect, useRef, useState } from "react";
import HomeScreen from "./screens/HomeScreen.jsx";
import MapScreen from "./screens/MapScreen.jsx";
import LevelStartScreen from "./screens/LevelStartScreen.jsx";
import GameScreen from "./screens/GameScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import DailyRewardModal from "./components/DailyRewardModal.jsx";
import { getLevel, getLevels } from "./game/core/LevelManager.js";
import { getBoosterPrice } from "./game/core/BoosterManager.js";
import {
  acceptMailboxLife,
  applyLifeRefill,
  buyBooster,
  buyLife,
  canClaimDailyReward,
  claimDailyReward,
  grantAdLife,
  loadProgress,
  recordLoss,
  recordWin,
  requestFriendLife,
  resetProgress,
  spendBooster,
  updateSettings
} from "./game/core/ProgressManager.js";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [previousScreen, setPreviousScreen] = useState("home");
  const [progress, setProgress] = useState(() => loadProgress());
  const [selectedLevel, setSelectedLevel] = useState(() => getLevel(1));
  const [dailyMessage, setDailyMessage] = useState("");
  const [dailyReward, setDailyReward] = useState(null);
  const progressRef = useRef(progress);
  const levels = getLevels();

  const updateProgress = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = applyLifeRefill(progressRef.current);
      if (JSON.stringify(next) !== JSON.stringify(progressRef.current)) updateProgress(next);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [updateProgress]);

  const openSettings = useCallback(() => {
    setPreviousScreen(screen);
    setScreen("settings");
  }, [screen]);

  const startLevel = useCallback((levelNumber) => {
    const refreshed = applyLifeRefill(progressRef.current);
    updateProgress(refreshed);
    const level = getLevel(levelNumber);
    if (level.level > refreshed.maxUnlocked) return;
    setSelectedLevel(level);
    setScreen("level-start");
  }, [updateProgress]);

  const playSelectedLevel = useCallback((preBoosters = []) => {
    let nextProgress = progressRef.current;
    const usableBoosters = [];
    preBoosters.forEach((boosterId) => {
      const result = spendBooster(nextProgress, boosterId);
      if (result.ok) {
        nextProgress = result.progress;
        usableBoosters.push(boosterId);
      }
    });
    updateProgress(nextProgress);
    setSelectedLevel({ ...selectedLevel, preBoosters: usableBoosters });
    setScreen("game");
  }, [selectedLevel, updateProgress]);

  const handleWin = useCallback((level, status) => {
    const result = recordWin(progressRef.current, level, status.stars);
    updateProgress(result.progress);
  }, [updateProgress]);

  const handleLose = useCallback(() => {
    const next = recordLoss(progressRef.current);
    updateProgress(next);
  }, [updateProgress]);

  const handleSpendBooster = useCallback((boosterId) => {
    const result = spendBooster(progressRef.current, boosterId);
    if (result.ok) updateProgress(result.progress);
    return result.ok;
  }, [updateProgress]);

  const handleDailyReward = useCallback(() => {
    const result = claimDailyReward(progressRef.current);
    updateProgress(result.progress);
    if (result.claimed) {
      setDailyReward(result.reward);
      setDailyMessage(`Odul alindi: ${result.reward.label}.`);
    } else {
      setDailyMessage("Bugunun odulu zaten alindi.");
    }
  }, [updateProgress]);

  const handleReset = useCallback(() => {
    const next = resetProgress();
    updateProgress(next);
    setSelectedLevel(getLevel(1));
    setScreen("home");
    setDailyMessage("Ilerleme sifirlandi.");
  }, [updateProgress]);

  const handleBuyBooster = useCallback((booster) => {
    const result = buyBooster(progressRef.current, booster.id, booster.price || getBoosterPrice(booster.id));
    updateProgress(result.progress);
    setDailyMessage(result.ok ? `${booster.name} alindi.` : "Yeterli coin yok.");
  }, [updateProgress]);

  const lifeActions = {
    onBuyLife: () => {
      const result = buyLife(progressRef.current);
      updateProgress(result.progress);
      setDailyMessage(result.ok ? "1 can alindi." : "Can alinamadi.");
    },
    onAdLife: () => {
      updateProgress(grantAdLife(progressRef.current));
      setDailyMessage("Reklam simulasyonu ile 1 can eklendi.");
    },
    onRequestLife: () => {
      updateProgress(requestFriendLife(progressRef.current));
      setDailyMessage("Arkadas can istegi simule edildi. Posta kutusuna 3 can geldi.");
    },
    onAcceptLife: () => {
      const result = acceptMailboxLife(progressRef.current);
      updateProgress(result.progress);
      setDailyMessage(result.ok ? "Posta kutusundan 1 can kabul edildi." : "Posta kutusundan can alinamadi.");
    }
  };

  const handleSettingsChange = useCallback((patch) => {
    updateProgress(updateSettings(progressRef.current, patch));
  }, [updateProgress]);

  return (
    <div className="app-shell">
      {screen === "home" && (
        <HomeScreen
          progress={progress}
          dailyAvailable={canClaimDailyReward(progress)}
          dailyMessage={dailyMessage}
          onPlay={() => setScreen("map")}
          onDailyReward={handleDailyReward}
          onReset={handleReset}
          onSettings={openSettings}
        />
      )}

      {screen === "map" && (
        <MapScreen
          levels={levels}
          progress={progress}
          dailyMessage={dailyMessage}
          onBack={() => setScreen("home")}
          onStartLevel={startLevel}
          onSettings={openSettings}
          {...lifeActions}
        />
      )}

      {screen === "level-start" && (
        <LevelStartScreen
          level={selectedLevel}
          progress={progress}
          onBack={() => setScreen("map")}
          onPlay={playSelectedLevel}
          onBuyBooster={handleBuyBooster}
        />
      )}

      {screen === "game" && (
        <GameScreen
          level={selectedLevel}
          progress={progress}
          onSpendBooster={handleSpendBooster}
          onWin={handleWin}
          onLose={handleLose}
          onBack={() => setScreen("map")}
          onNext={(levelNumber) => startLevel(Math.min(levelNumber, levels.length))}
        />
      )}

      {screen === "settings" && (
        <SettingsScreen
          progress={progress}
          onBack={() => setScreen(previousScreen)}
          onChange={handleSettingsChange}
        />
      )}

      <DailyRewardModal reward={dailyReward} onClose={() => setDailyReward(null)} />
    </div>
  );
}
