export default function LoadingScreen() {
  return (
    <main className="loading-screen screen" aria-label="Oyun yukleniyor">
      <div className="loading-logo-wrap" aria-label="Candy Crush">
        <span className="loading-logo-string" aria-hidden="true" />
        <div className="loading-logo-tag">
          <h1>Candy<br />Crush</h1>
          <span aria-hidden="true">♥</span>
        </div>
      </div>
      <div className="loading-candy-stage" aria-hidden="true">
        <div className="loading-candy-ball">
          {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
        </div>
      </div>
      <strong className="loading-copy">Loading...</strong>
    </main>
  );
}
