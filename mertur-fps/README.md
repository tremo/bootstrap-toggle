# Mertur Savunması

Palamutbükü Koyu'ndaki (Datça, Muğla) Mertur Tatil Köyü'nde geçen, tarayıcıda çalışan birinci şahıs nişancı oyunu. Yunan özel harekât timleri (ΕΚΑΜ) denizden botla, sahil yolundan minibüsle ve yamaçtan sızarak köye giriyor; nişancılar damlara, operatörler çalı ve duvar diplerine saklanıyor.

## Çalıştırma

ES modülleri kullandığı için dosyayı doğrudan açmak yerine bir yerel sunucu gerekir:

```sh
cd mertur-fps
python3 -m http.server 8080
# tarayıcıda http://localhost:8080
```

three.js (r160) jsDelivr üzerinden yüklenir; ilk açılışta internet bağlantısı gerekir. WebGL2 destekleyen güncel bir tarayıcı (Chrome, Edge, Firefox, Safari 16+) önerilir.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| W A S D | Hareket |
| Shift | Koş (dürbünde: nefes tut) |
| Boşluk | Zıpla |
| C / Ctrl | Çömel |
| Q / E | Sola / sağa eğil |
| Sol tık / Sağ tık | Ateş / nişan al |
| 1 2 3 4, fare tekeri | Canik TP9 SF · MKE MPT-76 · Akdal MKA 1919 · MKE Bora-12 |
| R | Şarjör değiştir |
| B | Atış modu (MPT-76: otomatik / tek atış) |
| G | El bombası |
| N | Gece görüş gözlüğü |
| F | Silah feneri |
| H | Sargı (sağlık) |
| T | Saati 1,5 saat ilerlet |
| M | Vaziyet planı |
| Esc | Duraklat / ayarlar |

Dokunmatik cihazlarda ekran üstü kumanda açılır; en iyi deneyim klavye ve fareyle.

## Neler var

- **Yerleşim, 1/500 vaziyet planından:** köşegen parsel sınırı boyunca dizilen 13 S tipi ikiz dubleks (S1-2 … S25-26), ikinci havuz çevresinde 7 E tipi blok, kademeli M tipi motel, G gazino/çarşı, D podyum-bar, R resepsiyon, K disko, bekçi-kabul, büfe, çiçek serası, şarap çeşmesi, çocuk ve çay bahçeleri, otopark (O.P.) ve "yeni yapılan bağlantı yolu". Menüdeki ve M tuşundaki plan bu verilerden çizilir.
- **Fotoğraflardaki görünüm:** kırmızı alaturka kiremit saçaklı beyaz badanalı bloklar, kemerli kapılar, koyu kahve panjurlar, damlarda güneş enerjili su ısıtıcıları, tuğla döşemeli havuz başı, kırmızı kiremitli yuvarlak havuz barı, begonviller, palmiyeler, kızılçamlar, zeytinler; sahil yolunda park etmiş araçlar, hasır şemsiyeli çakıllı plaj, turkuazdan laciverte dönen berrak deniz, Palamutbükü adacığı ve ufukta İleryos (Tilos), İncirli (Nisyros), Sömbeki (Simi).
- **Gerçek güneş konumu:** 36,67°K 27,50°D, UTC+3, 20 Temmuz için hesaplanan güneş yüksekliği ve azimutu; şafak, gündüz, gün batımı, ay ışıklı gece ve isteğe bağlı akan zaman.
- **Gece:** bahçe babaları, sokak lambaları, havuz içi aydınlatma, yanan pencereler, yıldızlar; fosfor yeşili gece görüş (grenli, tüp maskeli), düşman silah fenerleri ve yalnızca gece görüşte görülen IR lazerler.
- **Silahlar:** mermi hızı ve düşüşü olan balistik, cam ve plastikten geçen mermiler, mesafeye göre hasar düşümü, geri tepme, yayılım, nişan alma, holografik nişangâh, 8× mil-dot dürbün, sürgülü mekanizma, kovan atımı, şarjör animasyonu.
- **Düşman yapay zekâsı:** görüş/işitme/ışık koşullarına göre fark etme, siper noktası seçimi, siperden gözetleme ve atış, kuşatma, bastırma ateşine tepki, şok bombası ve el bombası, damdaki nişancılar, Yunanca telsiz çağrıları ve Türkçe altyazıları.
- **Ses:** Web Audio ile sentez; ses hızı gecikmesi ve mesafe süzgeci, tepelerden yankı, mermi vızıltısı, yüzeye göre ayak sesleri, gündüz ağustos böcekleri, gece cırcır böcekleri, dalga sesi, bot ve minibüs motorları.

## Dosyalar

- `index.html`: arayüz, menü, HUD
- `js/terrain.js`, `js/layout.js`: arazi modeli ve vaziyet planı verisi
- `js/world.js`, `js/builder.js`, `js/props.js`, `js/surroundings.js`, `js/vegetation.js`: sahne üretimi
- `js/textures.js`: prosedürel dokular (sıva, kiremit, kayrak taşı, parke, çakıl…)
- `js/sky.js`, `js/water.js`, `js/post.js`: gökyüzü/ışık, deniz ve havuz, son işlem
- `js/player.js`, `js/weapons.js`, `js/enemies.js`, `js/soldier.js`, `js/nav.js`: oynanış
- `js/audio.js`, `js/fx.js`, `js/hud.js`, `js/input.js`, `js/game.js`, `js/main.js`

## Kaynaklar

- `assets/Soldier.glb` ve `assets/waternormals.jpg`: three.js örnek varlıkları (MIT lisanslı depo; asker modeli ve animasyonları Mixamo kaynaklı).
- Diğer tüm dokular, modeller ve sesler kod içinde üretilir.

Senaryo tamamen kurgusaldır.
