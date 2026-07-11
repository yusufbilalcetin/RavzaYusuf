# Ravza | EUL Study System

İngilizce çalışma platformu: konu anlatımları, quizler, sınavlar, ezber araçları (RavzaLingo, flashcard, Kahoot) ve mini oyunlar. Vanilla JS ile yazılmış bir SPA olarak çalışır, Vercel üzerinde statik site olarak yayınlanır.

- **Canlı adres:** https://ravza-yusuf63.vercel.app/
- **Yönetim paneli:** `/admin.html` (içerikler Firebase Firestore üzerinden yönetilir)

## Proje Yapısı

```
RavzaYusuf/
├── index.html              # Ana uygulama girişi (SPA)
├── admin.html              # Yönetim paneli girişi
├── vercel.json             # SPA rewrite kuralı
│
├── assets/                 # Kategorilere ayrılmış görseller
│   ├── ana-sayfa/          # Ana sayfa masaüstü ve mobil arka planları
│   ├── calisma-bolumu/     # Çalışma, quiz ve RavzaLingo arka planları
│   ├── oyun-bolumu/        # Oyun Alanı kart ikonları ve logoları
│   └── oyun-ici/           # Oyunların kendi içinde kullandığı görseller
│
├── css/
│   ├── style.css           # Ana stil girişi — alttaki tüm dosyaları @import eder
│   ├── admin.css           # Yönetim paneli stilleri
│   ├── base/               # Reset, değişkenler, tipografi, animasyonlar
│   ├── components/         # Buton, kart, modal, toast vb. bileşen stilleri
│   ├── layout/             # Sidebar, topbar, ana yerleşim
│   ├── pages/              # Sayfa bazlı stiller
│   ├── responsive/         # Mobil ve tablet kırılımları
│   └── themes/             # Tema varyantları
│
├── js/
│   ├── main.js             # Uygulama girişi (index.html buradan başlar)
│   ├── admin/              # Yönetim paneli scriptleri (admin.js, admin-guard.js)
│   ├── config/             # Firebase yapılandırması
│   ├── core/               # Router, state, DOM yardımcıları, partial yükleyici
│   ├── features/           # Quiz, sınav, flashcard, kahoot vb. motorlar
│   ├── pages/              # Sayfa init fonksiyonları
│   ├── services/           # Veri servisleri (konu, quiz, sınav, tema, storage)
│   ├── utils/              # Genel yardımcılar
│   └── legacy/             # Eski monolitik uygulama kodu (aşamalı taşınıyor)
│
├── data/                   # Statik veri modülleri
│   ├── konu-listesi.js     # Konu tanımları
│   ├── quizzes/            # Konu bazlı quiz soruları
│   └── content-defaults.js # Admin paneli için varsayılan içerik seti
│
├── partials/               # Runtime'da yüklenen HTML parçaları
│   ├── layout/             # Sidebar, topbar, tema paneli
│   ├── pages/              # Sayfa şablonları
│   └── components/         # Kart, modal, toast vb. parçalar
│
├── content/
│   └── topics/             # Konu anlatım HTML içerikleri
│
├── games/
│   ├── candy-crush/            # Candy Crush match-3 oyunu (Vite + React + Phaser).
│   │                           # dist/ çıktısı oyun sayfasına iframe ile gömülür.
│   └── oyun-platformu/         # Bağımsız mini oyun platformu (Flappy, Sudoku).
│                               # Oyunlar ana uygulamaya taşındı; bu klasör
│                               # bağımsız sürüm olarak korunuyor.
│
└── docs/
    └── references/         # Tasarım referans görselleri
```

## Geliştirme

Ana site derleme gerektirmez; herhangi bir statik sunucu ile çalıştırılabilir:

```bash
npx serve .
# veya
python -m http.server 8000
```

### Candy Crush oyununu derlemek

```bash
cd games/candy-crush
npm install
npm run dev      # geliştirme sunucusu (127.0.0.1:5174)
npm run build    # dist/ çıktısını üretir (repoya commit edilir)
```

> **Not:** `dist/` klasörü ana site tarafından iframe ile kullanıldığı için
> repoya dahildir. Oyunda değişiklik yaptıktan sonra `npm run build` çalıştırıp
> yeni `dist/` çıktısını commit etmeyi unutma.

## Ana Sayfa Hero Görselleri

Ana sayfadaki hero görseli, her yenilemede rastgele bir tema (Fantastik / Paris /
Yunanistan …) arasından seçilir. Görseller otomatik bir pipeline ile optimize edilir:
kaynak bir `desktop`+`mobile` çifti eklediğinde sistem içerik-hash'li WebP/AVIF varyantları,
bir placeholder ve `data/ana-sayfa-gorselleri.generated.js` manifestini otomatik üretir.

- Kaynaklar: `assets/ana-sayfa/original/` — **Git'e eklenmez** (`.gitignore`).
- Çıktılar: `assets/ana-sayfa/optimized/` — hash'li, immutable cache ile deploy edilir (**Git'e eklenir**).
- Manifest: `data/ana-sayfa-gorselleri.generated.js` — otomatik üretilir, elle düzenlenmez (**Git'e eklenir**).
- Tema adı/alt-metni/konumu: `data/ana-sayfa-tema-ayarlari.json` (isteğe bağlı; yoksa güvenli varsayılan).

> ⚠️ **Veri kaybı riski:** `assets/ana-sayfa/original/` klasörü yalnızca senin bilgisayarında
> durur, repoya gitmez. Orijinal görselleri Google Drive vb. harici bir yerde **yedekle** —
> bilgisayar kaybında yeniden optimize edecek kaynak kalmaz.

### Komutlar

```bash
npm run hero:optimize        # eksik/değişmiş temaları optimize et + manifesti güncelle
npm run hero:watch           # original/ klasörünü izle, ekleme/değişiklikte otomatik üret
npm run hero:check           # değişiklik yapmadan bütünlük doğrula (CI/hook için, exit 0/1)
npm run hero:install-hooks   # opt-in: commit öncesi otomatik hero:check (git config core.hooksPath)
```

### Yeni Ana Sayfa Görseli Ekleme

1. Dosyaları `ulke-desktop.png` ve `ulke-mobile.png` biçiminde hazırla (jpg/webp/avif de olur;
   Türkçe karakter ve boşluklar otomatik güvenli ada çevrilir).
2. İkisini birden `assets/ana-sayfa/original/` klasörüne koy.
3. `npm run hero:watch` çalışıyorsa otomatik üretilir; değilse: `npm run hero:optimize`.
4. Doğrula: `npm run hero:check` (exit 0 olmalı).
5. (İsteğe bağlı) `data/ana-sayfa-tema-ayarlari.json` içine doğru `name`/`alt`/konum ekle.
6. Git'e ekle:
   ```bash
   git add assets/ana-sayfa/optimized data/ana-sayfa-gorselleri.generated.js data/ana-sayfa-tema-ayarlari.json
   ```
   `assets/ana-sayfa/original/` Git tarafından yok sayılır — commit'e girmez.
