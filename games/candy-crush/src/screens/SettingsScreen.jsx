export default function SettingsScreen({ progress, onBack, onChange, onReset }) {
  const settings = progress.settings || {};

  return (
    <main className="settings-screen screen">
      <section className="settings-card">
        <button className="ghost-action compact" type="button" onClick={onBack}>Geri</button>
        <p className="eyebrow">Ayarlar</p>
        <h1>Oyun ayarlari</h1>
        <label className="settings-row">
          <span>Ses efektleri</span>
          <input type="checkbox" checked={settings.sound !== false} onChange={(event) => onChange({ sound: event.target.checked })} />
        </label>
        <label className="settings-row">
          <span>Muzik</span>
          <input type="checkbox" checked={Boolean(settings.music)} onChange={(event) => onChange({ music: event.target.checked })} />
        </label>
        <label className="settings-row">
          <span>Az hareket</span>
          <input type="checkbox" checked={Boolean(settings.reducedMotion)} onChange={(event) => onChange({ reducedMotion: event.target.checked })} />
        </label>
        {onReset && (
          <button
            className="ghost-action settings-reset"
            type="button"
            onClick={() => { if (window.confirm("Tum ilerleme silinecek. Emin misin?")) onReset(); }}
          >
            Ilerlemeyi sifirla
          </button>
        )}
      </section>
    </main>
  );
}
