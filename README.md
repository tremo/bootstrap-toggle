# MetaForge — AI Foto Metadata Üretici

Yüklediğiniz bir fotoğraf için **yapay zeka tarafından üretilmiş gibi** metadata
(başlık, açıklama, alt metin, etiketler, renk paleti, ruh hali ve teknik bilgi)
oluşturan, **tamamen tarayıcıda çalışan** statik bir uygulama. Sunucu yok,
bağımlılık yok, kurulum yok — GitHub Pages üzerinde doğrudan çalışır.

## Nasıl çalışır?

1. Bir görseli sürükle-bırak, seç ya da panodan yapıştır.
2. Uygulama görseli `<canvas>` üzerinde **gerçekten analiz eder**: baskın renk
   paleti, parlaklık, doygunluk, en-boy oranı ve detay yoğunluğu.
3. Bu özellikler kelime bankalarıyla birleştirilerek inandırıcı, "AI çıktısı"
   görünümlü metadata üretilir (yazım animasyonu, güven skorları, model adı vb.).
4. Sonuçları tek tek veya tümünü JSON olarak kopyalayıp indirebilirsin.

Varsa görselin gerçek **EXIF** verileri (kamera, lens, ISO, diyafram, pozlama)
ayrı bir panelde, sıfır bağımlılıkla okunup gösterilir.

> ⚠️ Üretilen metinler gerçek bir bulut AI servisine gitmez; görsel analizine
> dayanan tarayıcı içi bir motorla _yapay zeka üretmiş gibi_ oluşturulur.
> Eğlence/demo amaçlıdır. Hiçbir veri cihazından çıkmaz.

## Dosya yapısı

```
index.html              # arayüz
assets/css/style.css    # stiller
assets/js/exif.js       # bağımlılıksız JPEG EXIF okuyucu
assets/js/generator.js  # görsel analizi + metadata üretim motoru
assets/js/app.js         # UI akışı
```

## Yerel çalıştırma

Statik bir site olduğundan herhangi bir HTTP sunucusu yeterli:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## GitHub Pages'te yayınlama

Bu repo bir GitHub Actions workflow'u (`.github/workflows/pages.yml`) içerir;
ilgili branch'e push yapıldığında siteyi otomatik olarak Pages'e dağıtır.
Alternatif olarak repo ayarlarından **Settings → Pages → Branch** seçerek de
kök dizinden yayınlayabilirsiniz.
