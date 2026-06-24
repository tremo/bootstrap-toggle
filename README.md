# MetaForge — Fotoğrafı "AI üretmiş gibi" gösteren metadata aracı

Yüklediğiniz gerçek bir fotoğrafın dosyasına, sanki bir yapay zeka görüntü
üreticisi (**Grok, DALL·E 3, Midjourney, Stable Diffusion, Imagen, Firefly**)
tarafından oluşturulmuş gibi **köken (provenance) metadata'sı gömen** ve
değiştirilmiş dosyayı indirmenize izin veren, **tamamen tarayıcıda çalışan**
statik bir uygulama. Sunucu yok, bağımlılık yok — GitHub Pages'te doğrudan çalışır.

## Nasıl çalışır?

1. Bir görseli sürükle-bırak, seç ya da panodan yapıştır (JPG/PNG).
2. Uygulama görseli `<canvas>` üzerinde **gerçekten analiz eder** (baskın renk,
   parlaklık, doygunluk, oran) ve buna dayanan inandırıcı bir üretim prompt'u
   ile başlık/açıklama/etiket üretir.
3. Bir AI aracı seç; uygulama dosyaya şunları gömer:
   - **EXIF:** `Make` / `Model` / `Software` / `DateTime` / `ImageDescription`
   - **XMP:** `xmp:CreatorTool`, `dc:description`, ve AI içeriğinin standart işareti
     olan IPTC `Iptc4xmpExt:DigitalSourceType = trainedAlgorithmicMedia`
   - **PNG'lerde** ayrıca AUTOMATIC1111 tarzı `parameters` text chunk'ı (prompt, seed, model)
4. **"AI metadata gömülü fotoğrafı indir"** ile değiştirilmiş dosyayı al; uygulama
   gömülen metadata'yı geri okuyup doğrular.

Varsa görselin mevcut gerçek **EXIF** verileri ayrı bir panelde gösterilir.

> ⚠️ Bu araç gerçek bir fotoğrafı "AI üretimi" gibi gösterir. Eğitim, test
> (ör. AI-içerik dedektörleri / C2PA-XMP denemeleri) ve demo amaçlıdır;
> içeriğin kaynağı hakkında başkalarını yanıltmak için kullanmayın.
> Hiçbir veri cihazınızdan çıkmaz.

## Dosya yapısı

```
index.html               # arayüz
assets/css/style.css     # stiller
assets/js/exif.js        # bağımlılıksız JPEG EXIF okuyucu
assets/js/generator.js   # görsel analizi + prompt/metadata üretimi + AI araç ön ayarları
assets/js/metawriter.js  # EXIF + XMP + PNG metadata gömücü (writer)
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
