import { getNextLifeText } from "../game/core/ProgressManager.js";

export default function HeartLives({ progress }) {
  return (
    <div className="heart-lives" aria-label="Can">
      <strong>♥ {progress.lives}/5</strong>
      <small>{getNextLifeText(progress)}</small>
    </div>
  );
}
