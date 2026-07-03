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
├── assets/                 # Görseller (sayfa arka planları, oyun ikonları)
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
