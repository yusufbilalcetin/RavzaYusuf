import { useEffect, useMemo, useRef, useState } from "react";
import gameIcon from "../../../assets/icons/games/meyve-eslestirme.png";

const STORAGE_KEY = "meyve_mahjong_progress_v2";
const TOTAL_LEVELS = 30;

const SYMBOLS = [
  { id: "apple", icon: "🍎", name: "Elma" },
  { id: "pear", icon: "🍐", name: "Armut" },
  { id: "strawberry", icon: "🍓", name: "Çilek" },
  { id: "cherry", icon: "🍒", name: "Kiraz" },
  { id: "grape", icon: "🍇", name: "Üzüm" },
  { id: "banana", icon: "🍌", name: "Muz" },
  { id: "orange", icon: "🍊", name: "Portakal" },
  { id: "watermelon", icon: "🍉", name: "Karpuz" },
  { id: "pineapple", icon: "🍍", name: "Ananas" },
  { id: "blueberry", icon: "🫐", name: "Yaban Mersini" },
  { id: "mushroom", icon: "🍄", name: "Mantar" },
  { id: "flower", icon: "🌼", name: "Çiçek" },
  { id: "leaf", icon: "🍃", name: "Yaprak" },
  { id: "cone", icon: "🌰", name: "Kozalak" },
  { id: "garlic", icon: "🧄", name: "Sarımsak" },
  { id: "vegetable", icon: "🥕", name: "Sebze" }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createRng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffleArray(items, rng) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Her düzen bir dizi katman tanımı olarak tutulur. Her katman bir dikdörtgen
// bölge (x aralığı, y aralığı) ya da özel bir hücre listesidir.
function rect(x0, x1, y0, y1, layer) {
  const cells = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) cells.push({ x, y, layer });
  }
  return cells;
}

function pyramidLayout() {
  // Klasik piramit: her katman bir öncekinden küçük ve ortalanmış.
  const layers = [];
  layers.push(rect(0, 9, 0, 6, 0));
  layers.push(rect(1, 8, 1, 5, 1));
  layers.push(rect(2, 7, 2, 4, 2));
  layers.push(rect(3, 6, 3, 3, 3));
  return layers.flat();
}

function turtleLayout() {
  const layers = [];
  const base = [];
  [8, 9, 10, 10, 10, 10, 9, 8].forEach((len, y) => {
    const startX = Math.floor((10 - len) / 2);
    for (let x = startX; x < startX + len; x += 1) base.push({ x, y, layer: 0 });
  });
  layers.push(base);
  layers.push(rect(3, 6, 2, 5, 1));
  layers.push(rect(4, 5, 3, 4, 2));
  layers.push([{ x: 4, y: 3, layer: 3 }, { x: 5, y: 3, layer: 3 }]);
  return layers.flat();
}

function towerLayout() {
  const layers = [];
  layers.push(rect(0, 7, 0, 5, 0));
  layers.push(rect(2, 5, 1, 4, 1));
  layers.push(rect(2, 5, 1, 4, 2));
  layers.push(rect(3, 4, 2, 3, 3));
  return layers.flat();
}

function fanLayout() {
  const layers = [];
  layers.push(rect(0, 8, 0, 4, 0));
  layers.push(rect(1, 7, 0, 3, 1));
  return layers.flat();
}

// Referans görsellerdeki gibi hafif düzensiz/kaydırmalı ilk bölüm dizilimi:
// tam bir dikdörtgen yerine kenarlardan girintili, "blob" hissi veren bir şekil.
// Üstüne ikinci ve üçüncü bir katman eklenir ki taşlar referans görseldeki gibi
// üst üste binsin; alttaki taşlar üstü kapalıyken dokunulamaz kalır.
function staggeredLayout(width, height) {
  const base = [];
  for (let y = 0; y < height; y += 1) {
    const indent = (y === 0 || y === height - 1) ? 1 : 0;
    for (let x = indent; x < width - indent; x += 1) {
      if ((x + y) % 7 === 0 && x !== indent && x !== width - indent - 1) continue;
      base.push({ x, y, layer: 0 });
    }
  }
  const midInset = 1;
  const mid = rect(midInset + 1, width - midInset - 2, 1, height - 2, 1);
  const top = rect(midInset + 2, width - midInset - 3, 2, height - 3, 2);
  return [...base, ...mid, ...top];
}

function getLevelConfig(levelNumber) {
  const n = clamp(levelNumber, 1, TOTAL_LEVELS);
  let cells;
  let layoutName;

  if (n <= 3) {
    const size = 5 + n; // 6,7,8 genişlik
    cells = staggeredLayout(size, 5);
    layoutName = "Basit Dizilim";
  } else if (n <= 8) {
    cells = fanLayout();
    layoutName = "Yelpaze Düzeni";
  } else if (n <= 14) {
    cells = towerLayout();
    layoutName = "Kule Düzeni";
  } else if (n <= 22) {
    cells = pyramidLayout();
    layoutName = "Piramit Düzeni";
  } else {
    cells = turtleLayout();
    layoutName = "Kaplumbağa Düzeni";
  }

  // Taş sayısını çifte tamamla (her sembol 2'nin katları halinde kullanılacak).
  let positions = cells.map((cell, index) => ({ id: `p${index}`, x: cell.x, y: cell.y, layer: cell.layer }));
  if (positions.length % 2 !== 0) positions = positions.slice(0, -1);

  const symbolCount = clamp(3 + Math.floor(n / 3), 3, SYMBOLS.length);
  const hintCount = n <= 10 ? 3 : n <= 20 ? 2 : 1;
  const shuffleCount = n <= 10 ? 3 : n <= 20 ? 2 : 1;

  return {
    levelNumber: n,
    positions,
    layoutName,
    symbolCount,
    hintCount,
    shuffleCount,
    pairCount: positions.length / 2
  };
}

function isTileOpen(tile, activeSet, byCoord) {
  const above = byCoord.get(`${tile.x},${tile.y},${tile.layer + 1}`);
  if (above && activeSet.has(above)) return false;
  const left = byCoord.get(`${tile.x - 1},${tile.y},${tile.layer}`);
  const right = byCoord.get(`${tile.x + 1},${tile.y},${tile.layer}`);
  const leftBlocked = Boolean(left && activeSet.has(left));
  const rightBlocked = Boolean(right && activeSet.has(right));
  return !leftBlocked || !rightBlocked;
}

function buildIndexes(positions) {
  const byCoord = new Map();
  positions.forEach((tile) => byCoord.set(`${tile.x},${tile.y},${tile.layer}`, tile.id));
  return byCoord;
}

function getOpenIds(positions, byCoord, removedIds) {
  const activeSet = new Set(positions.filter((t) => !removedIds.has(t.id)).map((t) => t.id));
  const open = new Set();
  positions.forEach((tile) => {
    if (!activeSet.has(tile.id)) return;
    if (isTileOpen(tile, activeSet, byCoord)) open.add(tile.id);
  });
  return open;
}

// Tahtayı geriye doğru inşa ederek her zaman çözülebilir bir dizilim üretir:
// taşları "en son kalkacaklardan en önce kalkacaklara" doğru sırayla, o anda
// açık olan pozisyon çiftlerine sembol atayarak dolduruyoruz.
function assignSolvableSymbols(positions, symbolCount, rng) {
  const byCoord = buildIndexes(positions);
  const remaining = new Set(positions.map((t) => t.id));
  const removalOrder = [];

  while (remaining.size > 0) {
    const openIds = getOpenIds(positions, byCoord, new Set(
      positions.filter((t) => !remaining.has(t.id)).map((t) => t.id)
    ));
    const openList = positions.filter((t) => openIds.has(t.id) && remaining.has(t.id));
    if (openList.length < 2) {
      // Güvenlik: teorik olarak olmamalı ama olursa kalanları rastgele çiftle.
      const rest = [...remaining];
      for (let i = 0; i + 1 < rest.length; i += 2) {
        removalOrder.push([rest[i], rest[i + 1]]);
      }
      remaining.clear();
      break;
    }
    const shuffledOpen = shuffleArray(openList, rng);
    const a = shuffledOpen[0];
    const b = shuffledOpen[1];
    removalOrder.push([a.id, b.id]);
    remaining.delete(a.id);
    remaining.delete(b.id);
  }

  const pool = SYMBOLS.slice(0, symbolCount);
  const symbolById = new Map();
  removalOrder.forEach(([idA, idB], index) => {
    const symbol = pool[index % pool.length];
    symbolById.set(idA, symbol);
    symbolById.set(idB, symbol);
  });

  return positions.map((tile) => ({ ...tile, symbolId: symbolById.get(tile.id).id, symbolIcon: symbolById.get(tile.id).icon, symbolName: symbolById.get(tile.id).name }));
}

function createBoard(config, seedSalt) {
  const rng = createRng(config.levelNumber * 7919 + seedSalt * 104729 + 17);
  return assignSolvableSymbols(config.positions, config.symbolCount, rng);
}

function findAvailablePair(tiles, removedIds) {
  const byCoord = buildIndexes(tiles);
  const openIds = getOpenIds(tiles, byCoord, removedIds);
  const bySymbol = new Map();
  for (const tile of tiles) {
    if (removedIds.has(tile.id) || !openIds.has(tile.id)) continue;
    const existing = bySymbol.get(tile.symbolId);
    if (existing) return [existing, tile];
    bySymbol.set(tile.symbolId, tile);
  }
  return null;
}

function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    return {
      maxUnlocked: clamp(Number(parsed.maxUnlocked) || 1, 1, TOTAL_LEVELS),
      stars: parsed.stars && typeof parsed.stars === "object" ? parsed.stars : {}
    };
  } catch {
    return { maxUnlocked: 1, stars: {} };
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* localStorage kapalı olabilir. */
  }
}

function getBoardMetrics(tiles) {
  const xs = tiles.map((t) => t.x);
  const ys = tiles.map((t) => t.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const maxLayer = Math.max(...tiles.map((t) => t.layer));
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;
  const tileW = clamp(88 / (spanX + 1), 8, 15);
  const tileH = tileW * 1.12;
  const stepX = (94 - tileW) / Math.max(1, spanX - 1 + 0.35);
  const stepY = (90 - tileH) / Math.max(1, spanY - 1 + 0.35);
  return { minX, minY, maxLayer, tileW, tileH, stepX, stepY };
}

export default function App() {
  const [progress, setProgress] = useState(() => loadProgress());
  const [levelNumber, setLevelNumber] = useState(() => loadProgress().maxUnlocked || 1);
  const [seedSalt, setSeedSalt] = useState(0);

  const config = useMemo(() => getLevelConfig(levelNumber), [levelNumber]);
  const [tiles, setTiles] = useState(() => createBoard(config, seedSalt));
  const [removedIds, setRemovedIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [lockedId, setLockedId] = useState(null);
  const [hintIds, setHintIds] = useState(() => new Set());
  const [sparkleIds, setSparkleIds] = useState(() => new Set());
  const [moves, setMoves] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const [hintsLeft, setHintsLeft] = useState(config.hintCount);
  const [shufflesLeft, setShufflesLeft] = useState(config.shuffleCount);
  const [message, setMessage] = useState("Üstü boş, yanı açık iki aynı taşı seç.");
  const [completed, setCompleted] = useState(null);
  const [blocked, setBlocked] = useState(false);

  const hintTimer = useRef(null);
  const lockTimer = useRef(null);
  const sparkleTimer = useRef(null);

  const byCoord = useMemo(() => buildIndexes(tiles), [tiles]);
  const openIds = useMemo(() => getOpenIds(tiles, byCoord, removedIds), [tiles, byCoord, removedIds]);
  const metrics = useMemo(() => getBoardMetrics(tiles), [tiles]);
  const removedCount = removedIds.size;
  const progressPercent = Math.round((removedCount / Math.max(1, tiles.length)) * 100);

  useEffect(() => saveProgress(progress), [progress]);

  function startLevel(nextLevelNumber, salt) {
    const safe = clamp(nextLevelNumber, 1, TOTAL_LEVELS);
    const nextConfig = getLevelConfig(safe);
    const board = createBoard(nextConfig, salt);
    setLevelNumber(safe);
    setSeedSalt(salt);
    setTiles(board);
    setRemovedIds(new Set());
    setSelectedId(null);
    setLockedId(null);
    setHintIds(new Set());
    setSparkleIds(new Set());
    setMoves(0);
    setUndoStack([]);
    setHintsLeft(nextConfig.hintCount);
    setShufflesLeft(nextConfig.shuffleCount);
    setCompleted(null);
    setBlocked(false);
    setMessage("Üstü boş, yanı açık iki aynı taşı seç.");
  }

  function completeLevel() {
    const stars = shufflesLeft > 0 && hintsLeft > 0 ? 3 : hintsLeft > 0 || shufflesLeft > 0 ? 2 : 1;
    setCompleted({ stars });
    setProgress((prev) => ({
      maxUnlocked: Math.max(prev.maxUnlocked, Math.min(TOTAL_LEVELS, levelNumber + 1)),
      stars: { ...prev.stars, [levelNumber]: Math.max(Number(prev.stars[levelNumber] || 0), stars) }
    }));
  }

  function handleTileClick(tile) {
    if (removedIds.has(tile.id) || completed || blocked) return;

    if (!openIds.has(tile.id)) {
      window.clearTimeout(lockTimer.current);
      setLockedId(tile.id);
      setMessage("Bu taş kapalı: üstü dolu ya da iki yanı da kapalı.");
      lockTimer.current = window.setTimeout(() => setLockedId(null), 320);
      return;
    }

    if (!selectedId) {
      setSelectedId(tile.id);
      setMessage(`${tile.symbolName} seçildi. Eşini bul.`);
      return;
    }

    if (selectedId === tile.id) {
      setSelectedId(null);
      setMessage("Seçim iptal edildi.");
      return;
    }

    const selected = tiles.find((t) => t.id === selectedId);
    if (!selected) return;

    if (selected.symbolId !== tile.symbolId) {
      setSelectedId(tile.id);
      setMessage("Bu taş eş değil. Yeni taş seçildi.");
      return;
    }

    const nextRemoved = new Set(removedIds);
    nextRemoved.add(selected.id);
    nextRemoved.add(tile.id);

    setUndoStack((stack) => [...stack.slice(-9), new Set(removedIds)]);
    setRemovedIds(nextRemoved);
    setSelectedId(null);
    setMoves((m) => m + 1);
    setMessage("Eşleşme bulundu!");

    window.clearTimeout(sparkleTimer.current);
    setSparkleIds(new Set([selected.id, tile.id]));
    sparkleTimer.current = window.setTimeout(() => setSparkleIds(new Set()), 480);

    if (nextRemoved.size >= tiles.length) {
      window.setTimeout(() => completeLevel(), 420);
    } else if (!findAvailablePair(tiles, nextRemoved)) {
      if (shufflesLeft > 0) {
        setMessage("Açık eşleşme kalmadı. Karıştır butonunu kullanabilirsin.");
      } else {
        setBlocked(true);
        setMessage("Hamle kalmadı. Karıştırma hakkın yok, yeniden başlatabilirsin.");
      }
    }
  }

  function useHint() {
    if (hintsLeft <= 0 || completed || blocked) return;
    const pair = findAvailablePair(tiles, removedIds);
    if (!pair) return;
    window.clearTimeout(hintTimer.current);
    setHintsLeft((v) => v - 1);
    setHintIds(new Set(pair.map((t) => t.id)));
    setMessage(`İpucu: ${pair[0].symbolName} çifti.`);
    hintTimer.current = window.setTimeout(() => setHintIds(new Set()), 1500);
  }

  function shuffleRemaining() {
    if (shufflesLeft <= 0 || completed || blocked) return;
    const remainingTiles = tiles.filter((t) => !removedIds.has(t.id));
    const symbols = remainingTiles.map((t) => ({ symbolId: t.symbolId, symbolIcon: t.symbolIcon, symbolName: t.symbolName }));
    const rng = createRng(levelNumber * 733 + moves * 91 + shufflesLeft * 17 + 3);

    let nextTiles = tiles;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const shuffled = shuffleArray(symbols, rng);
      let cursor = 0;
      nextTiles = tiles.map((tile) => {
        if (removedIds.has(tile.id)) return tile;
        const symbol = shuffled[cursor];
        cursor += 1;
        return { ...tile, ...symbol };
      });
      if (findAvailablePair(nextTiles, removedIds)) break;
    }

    setTiles(nextTiles);
    setSelectedId(null);
    setHintIds(new Set());
    setShufflesLeft((v) => Math.max(0, v - 1));

    if (findAvailablePair(nextTiles, removedIds)) {
      setBlocked(false);
      setMessage("Taşlar karıştırıldı.");
    } else if (shufflesLeft - 1 > 0) {
      setMessage("Yine açık eşleşme çıkmadı. Kalan karıştırma hakkını dene.");
    } else {
      setBlocked(true);
      setMessage("Karıştırmadan sonra da hamle kalmadı.");
    }
  }

  function undoLastMove() {
    if (!undoStack.length || completed) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRemovedIds(new Set(previous));
    setSelectedId(null);
    setLockedId(null);
    setHintIds(new Set());
    setBlocked(false);
    setMoves((m) => Math.max(0, m - 1));
    setMessage("Son hamle geri alındı.");
  }

  function restartLevel() {
    startLevel(levelNumber, seedSalt + 1);
  }

  function goToNextLevel() {
    if (!completed || levelNumber >= TOTAL_LEVELS) return;
    startLevel(levelNumber + 1, 0);
  }

  return (
    <main className="fruit-app">
      <header className="app-header">
        <div className="brand">
            <img src={gameIcon} alt="" width="1024" height="1024" />
          <div>
            <span className="kicker">Meyve Mahjong</span>
            <h1>Bölüm {levelNumber} / {TOTAL_LEVELS}</h1>
          </div>
          <button type="button" className="gear-btn" onClick={restartLevel} aria-label="Bölümü yeniden başlat">⚙</button>
        </div>
        <div className="header-stats">
          <span>{config.layoutName}</span>
          <span>{removedCount / 2}/{config.pairCount} çift</span>
        </div>
        <div className="progress-track">
          <i style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="message-pill">{message}</div>
      </header>

      <section className="board-wrap" aria-label="Meyve taşı tahtası">
        <div className="mahjong-board">
          {tiles.map((tile) => {
            const removed = removedIds.has(tile.id);
            const isOpen = openIds.has(tile.id);
            const isSelected = selectedId === tile.id;
            const isLocked = lockedId === tile.id;
            const isHint = hintIds.has(tile.id);
            const isSparkle = sparkleIds.has(tile.id);
            const left = 3 + (tile.x - metrics.minX) * metrics.stepX + tile.layer * 2.4;
            const top = 3 + (tile.y - metrics.minY) * metrics.stepY - tile.layer * 2.4;
            return (
              <button
                key={tile.id}
                type="button"
                className={[
                  "fruit-tile",
                  removed ? "is-removed" : "",
                  isOpen ? "is-open" : "is-closed",
                  isSelected ? "is-selected" : "",
                  isLocked ? "is-locked" : "",
                  isHint ? "is-hint" : "",
                  isSparkle ? "is-sparkle" : ""
                ].filter(Boolean).join(" ")}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${metrics.tileW}%`,
                  height: `${metrics.tileH}%`,
                  zIndex: tile.layer * 1000 + tile.y * 10 + tile.x
                }}
                onClick={() => handleTileClick(tile)}
                aria-label={`${tile.symbolName} taşı${isOpen ? "" : " kapalı"}`}
              >
                <span className="tile-shine" aria-hidden="true" />
                <span className="tile-icon" aria-hidden="true">{tile.symbolIcon}</span>
                {isSparkle && (
                  <span className="tile-sparkle" aria-hidden="true">
                    <i /><i /><i /><i /><i /><i />
                  </span>
                )}
              </button>
            );
          })}

          {completed && (
            <div className="overlay">
              <div className="overlay-card">
                <span>Bölüm {levelNumber}</span>
                <h2>Tebrikler!</h2>
                <div className="stars">{"★".repeat(completed.stars)}{"☆".repeat(3 - completed.stars)}</div>
                <p>Tüm taşları temizledin.</p>
                {levelNumber < TOTAL_LEVELS ? (
                  <button className="primary-btn" type="button" onClick={goToNextLevel}>Sonraki Bölüm</button>
                ) : (
                  <button className="primary-btn" type="button" onClick={() => startLevel(1, 0)}>Baştan Oyna</button>
                )}
              </div>
            </div>
          )}

          {blocked && !completed && (
            <div className="overlay">
              <div className="overlay-card is-blocked">
                <span>Bölüm {levelNumber}</span>
                <h2>Hamle Kalmadı</h2>
                <p>Açık eşleşme yok. Yeniden başlatabilirsin.</p>
                <button className="primary-btn" type="button" onClick={restartLevel}>Yeniden Başlat</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="control-bar">
        <div className="control-dock">
          <button type="button" className="control-btn" onClick={undoLastMove} disabled={!undoStack.length || Boolean(completed)} aria-label="Geri al">
            <span className="control-icon">↶</span>
          </button>
          <button type="button" className="control-btn" onClick={shuffleRemaining} disabled={shufflesLeft <= 0 || Boolean(completed) || blocked} aria-label="Karıştır">
            <span className="control-icon">🔀</span>
            <em>{shufflesLeft}</em>
          </button>
          <button type="button" className="control-btn" onClick={useHint} disabled={hintsLeft <= 0 || Boolean(completed) || blocked} aria-label="İpucu">
            <span className="control-icon">💡</span>
            <em>{hintsLeft}</em>
          </button>
        </div>
      </footer>
    </main>
  );
}
