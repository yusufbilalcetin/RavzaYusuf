# Ravza Books PDF hazırlama

PDF içeriği yeniden kodlanmaz; orijinal metin, çizim ve sayfa düzeni korunur. Pipeline PDF'yi doğrular, gerçek sayfa sayısını okur, ilk sayfadan 320/640 px WebP kapaklar üretir ve kitap manifestini günceller.

1. PDF dosyasını doğrudan `assets/books/` klasörüne bırakın. `books:optimize` dosyayı otomatik olarak `original/` klasörüne taşır. İsterseniz doğrudan `assets/books/original/` içine de ekleyebilirsiniz. Dosya adı kitap kimliğine dönüşür: `Yeni Kitap.pdf` → `yeni-kitap`.
2. İsterseniz `data/ravza-books-metadata.json` içine aynı kimlikle başlık, yazar, çevirmen, açıklama, kapak sayfası ve sıra bilgilerini ekleyin.
3. `npm run books:optimize` çalıştırın.

Komutlar:

```bash
npm run books:optimize        # eksik/değişmiş PDF'leri hazırla, kapakları ve manifesti güncelle
npm run books:watch           # PDF/metadata değişikliklerini izle ve otomatik hazırla
npm run books:check           # dosya değiştirmeden PDF, sayfa, kapak ve manifest bütünlüğünü doğrula
npm run books:install-hooks   # commit öncesi books:check ve varsa hero:check kontrollerini etkinleştir
```

`data/ravza-books.generated.js` ve `assets/books/optimized/` çıktıları otomatik üretilir; elle düzenlenmemelidir.
