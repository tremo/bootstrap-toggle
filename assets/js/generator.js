/* "AI üretmiş gibi" metadata motoru.
 * Görseli canvas üzerinde gerçekten analiz eder (renk, parlaklık, doygunluk,
 * en-boy oranı, detay yoğunluğu) ve bu özellikleri kelime bankalarıyla
 * birleştirerek inandırıcı, yapay zeka çıktısı görünümlü metadata üretir. */
(function (global) {
  "use strict";

  // --- Tohumlu RNG (aynı görsel + aynı tohum => aynı çıktı) ---
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function pickN(rng, arr, n) {
    var copy = arr.slice(), out = [];
    while (out.length < n && copy.length) {
      out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    }
    return out;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // --- Görsel analizi ---
  function analyze(img) {
    var W = 64;
    var ratio = img.naturalHeight / img.naturalWidth || 1;
    var H = Math.max(1, Math.round(W * ratio));
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    var data;
    try { data = ctx.getImageData(0, 0, W, H).data; }
    catch (e) { data = null; }

    var lumSum = 0, satSum = 0, count = 0, prevLum = 0, edge = 0;
    var warm = 0, cool = 0;
    var buckets = {};
    var seed = 2166136261;

    if (data) {
      for (var i = 0; i < data.length; i += 4) {
        var r = data[i], g = data[i + 1], b = data[i + 2];
        seed ^= r + g * 3 + b * 7; seed = Math.imul(seed, 16777619);
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        var sat = max === 0 ? 0 : (max - min) / max;
        lumSum += lum; satSum += sat; count++;
        if (count > 1) edge += Math.abs(lum - prevLum);
        prevLum = lum;
        if (r > b + 12) warm++; else if (b > r + 12) cool++;
        // renk paleti için kabaca kümele
        var key = (r >> 5) + "," + (g >> 5) + "," + (b >> 5);
        if (!buckets[key]) buckets[key] = { n: 0, r: 0, g: 0, b: 0 };
        buckets[key].n++; buckets[key].r += r; buckets[key].g += g; buckets[key].b += b;
      }
    }

    var palette = Object.keys(buckets)
      .map(function (k) {
        var bk = buckets[k];
        return { n: bk.n, r: Math.round(bk.r / bk.n), g: Math.round(bk.g / bk.n), b: Math.round(bk.b / bk.n) };
      })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 5)
      .map(function (p) { return rgbToHex(p.r, p.g, p.b); });

    return {
      brightness: count ? lumSum / count : 0.5,
      saturation: count ? satSum / count : 0.3,
      detail: count ? edge / count : 0.2,
      temp: warm > cool ? "warm" : (cool > warm ? "cool" : "neutral"),
      aspect: img.naturalWidth >= img.naturalHeight * 1.2 ? "landscape"
        : (img.naturalHeight >= img.naturalWidth * 1.2 ? "portrait" : "square"),
      width: img.naturalWidth,
      height: img.naturalHeight,
      palette: palette.length ? palette : ["#888888"],
      seed: seed >>> 0,
    };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (x) {
      var h = Math.max(0, Math.min(255, x)).toString(16);
      return h.length === 1 ? "0" + h : h;
    }).join("");
  }

  function colorName(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var l = (max + min) / 2 / 255;
    if (d < 24) return l < 0.18 ? "kömür siyahı" : l < 0.42 ? "antrasit" : l < 0.7 ? "gri" : "kırık beyaz";
    var h;
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h < 20 || h >= 345) return "kızıl";
    if (h < 45) return "turuncu";
    if (h < 70) return "altın sarısı";
    if (h < 160) return "yeşil";
    if (h < 200) return "turkuaz";
    if (h < 255) return "mavi";
    if (h < 290) return "mor";
    return "magenta";
  }

  // --- Kelime bankaları ---
  var SCENES = {
    bright: ["açık hava", "gün ışığı", "ferah kompozisyon", "yüksek anahtarlı sahne"],
    dark: ["düşük anahtarlı sahne", "gece atmosferi", "loş ortam", "gölgeli kompozisyon"],
    mid: ["dengeli ışık", "doğal gün ortası", "yumuşak aydınlatma"],
  };
  var SUBJECTS = ["manzara", "portre", "şehir dokusu", "natürmort", "mimari detay",
    "doğa", "minimal kompozisyon", "soyut form", "günlük yaşam anı", "yakın çekim"];
  var MOODS_WARM = ["sıcak", "nostaljik", "samimi", "huzurlu", "altın saati hissi"];
  var MOODS_COOL = ["sakin", "serin", "dingin", "melankolik", "modern"];
  var MOODS_NEUTRAL = ["dengeli", "doğal", "sade", "zamansız"];
  var STYLES = ["editöryel", "belgesel", "fine-art", "lifestyle", "minimalist", "sinematik", "vintage", "kontrastlı"];
  var ADJ = ["çarpıcı", "zarif", "atmosferik", "detaylı", "etkileyici", "incelikli", "canlı", "dingin"];
  var VERBS = ["yakalıyor", "öne çıkarıyor", "vurguluyor", "ortaya koyuyor", "betimliyor"];
  var TAG_POOL = ["fotoğrafçılık", "kompozisyon", "ışık", "renk", "doku", "perspektif",
    "an", "atmosfer", "detay", "kontrast", "derinlik", "form", "estetik"];
  var KW_POOL = ["photography", "visualart", "moodyphoto", "composition", "colorpalette",
    "lightandshadow", "minimalism", "aesthetic", "framing", "storytelling", "tones", "texture"];

  function generate(features, exif, regenSeed) {
    var rng = mulberry32((features.seed ^ (regenSeed || 0)) >>> 0);

    var lightBank = features.brightness > 0.62 ? SCENES.bright
      : features.brightness < 0.32 ? SCENES.dark : SCENES.mid;
    var light = pick(rng, lightBank);
    var subject = pick(rng, SUBJECTS);
    var style = pick(rng, STYLES);
    var moodBank = features.temp === "warm" ? MOODS_WARM
      : features.temp === "cool" ? MOODS_COOL : MOODS_NEUTRAL;
    var mood = pick(rng, moodBank);
    var adj = pick(rng, ADJ);
    var verb = pick(rng, VERBS);
    var domName = colorName(features.palette[0]);
    var accentName = colorName(features.palette[Math.min(1, features.palette.length - 1)]);

    var detailWord = features.detail > 0.12 ? "yoğun detaylı"
      : features.detail < 0.05 ? "sade ve temiz" : "dengeli detaylı";
    var satWord = features.saturation > 0.45 ? "canlı renkler"
      : features.saturation < 0.2 ? "soluk, az doygun tonlar" : "doğal renkler";

    var title = cap(adj) + " " + subject + " — " + style;

    var desc = cap(adj) + " bir " + subject + " kompozisyonu; " + light +
      " içinde " + satWord + " ve " + detailWord + " bir görünüm sunuyor. Kare, " +
      domName + " tonlarının hâkim olduğu, " + accentName + " vurgularla zenginleşen " +
      mood + " bir atmosferi " + verb + ". " + cap(style) + " bir yaklaşımla ele alınmış " +
      (features.aspect === "portrait" ? "dikey" : features.aspect === "landscape" ? "yatay" : "kare") +
      " formatlı bir " + (features.brightness < 0.32 ? "düşük anahtarlı" : "iyi aydınlatılmış") + " çerçeve.";

    var alt = cap(domName) + " tonların baskın olduğu " + style + " " + subject +
      ", " + mood + " atmosfer";

    var tags = pickN(rng, TAG_POOL, 5).concat([subject, style]);
    var keywords = pickN(rng, KW_POOL, 6).map(function (k) { return "#" + k; });

    var palette = features.palette.map(function (h) {
      return { hex: h, name: colorName(h) };
    });

    var moodLine = cap(mood) + " · " + style + " · " + satWord;

    // dosya adı
    var slug = (subject + "-" + style + "-" + domName)
      .toLowerCase()
      .replace(/[çğıöşü]/g, function (m) { return { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[m]; })
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    var filename = slug + "-" + (1000 + Math.floor(rng() * 9000)) + ".jpg";

    // tahmini çekim bilgisi (EXIF yoksa AI "tahmini")
    var shot;
    if (exif && (exif.FNumber || exif.ExposureTime || exif.ISO || exif.FocalLength)) {
      shot = formatShot(exif) + " (EXIF'ten)";
    } else {
      var f = pick(rng, ["f/1.8", "f/2.8", "f/4", "f/5.6", "f/8"]);
      var ss = pick(rng, ["1/60s", "1/125s", "1/250s", "1/500s", "1/1000s"]);
      var iso = pick(rng, [100, 200, 400, 800]);
      var fl = pick(rng, [24, 35, 50, 85, 135]);
      shot = f + " · " + ss + " · ISO " + iso + " · " + fl + "mm (AI tahmini)";
    }

    var confDesc = (88 + Math.floor(rng() * 11)) + "%";

    return {
      title: title,
      description: desc,
      alt_text: alt,
      detected: tags,
      keywords: keywords,
      palette: palette,
      mood: moodLine,
      filename: filename,
      shot: shot,
      confidence: confDesc,
      _features: features,
    };
  }

  function formatShot(exif) {
    var parts = [];
    if (exif.FNumber) parts.push("f/" + (Math.round(exif.FNumber * 10) / 10));
    if (exif.ExposureTime) {
      parts.push(exif.ExposureTime >= 1 ? exif.ExposureTime + "s" : "1/" + Math.round(1 / exif.ExposureTime) + "s");
    }
    if (exif.ISO) parts.push("ISO " + exif.ISO);
    if (exif.FocalLength) parts.push(Math.round(exif.FocalLength) + "mm");
    return parts.join(" · ");
  }

  // --- AI araç ön ayarları (gömülecek köken bilgisi) ---
  var TOOLS = {
    grok: { tool: "Grok Imagine (xAI)", make: "xAI", model: "Aurora", software: "Grok Imagine v2 (xAI)" },
    dalle: { tool: "DALL·3 (OpenAI)", make: "OpenAI", model: "dall-e-3", software: "OpenAI DALL-E 3" },
    midjourney: { tool: "Midjourney", make: "Midjourney Inc.", model: "v6.1", software: "Midjourney v6.1" },
    sd: { tool: "Stable Diffusion", make: "Stability AI", model: "SDXL 1.0", software: "AUTOMATIC1111 / Stable Diffusion" },
    imagen: { tool: "Google Imagen", make: "Google", model: "imagen-3.0", software: "Google Imagen 3" },
    firefly: { tool: "Adobe Firefly", make: "Adobe", model: "Firefly Image 3", software: "Adobe Firefly" },
  };

  // analiz + seçilen araçtan "AI üretmiş gibi" köken parametreleri üretir
  function provenance(features, toolKey, regenSeed) {
    var t = TOOLS[toolKey] || TOOLS.grok;
    var rng = mulberry32((features.seed ^ (regenSeed || 0) ^ 0x9e3779b9) >>> 0);

    var subject = pick(rng, SUBJECTS);
    var style = pick(rng, STYLES);
    var adj = pick(rng, ADJ);
    var moodBank = features.temp === "warm" ? MOODS_WARM
      : features.temp === "cool" ? MOODS_COOL : MOODS_NEUTRAL;
    var mood = pick(rng, moodBank);
    var domName = colorName(features.palette[0]);
    var lightWord = features.brightness > 0.62 ? "soft natural light"
      : features.brightness < 0.32 ? "dramatic low-key lighting" : "balanced lighting";

    // İnandırıcı bir generatif prompt (İngilizce, araçların tipik dili)
    var prompt = adj + " " + subject + ", " + style + " style, " + mood + " atmosphere, " +
      domName + " color tones, " + lightWord + ", highly detailed, sharp focus, 8k, " +
      "professional composition";

    var seed = (features.seed ^ (regenSeed || 0)) >>> 0;

    return {
      toolKey: toolKey,
      tool: t.tool,
      make: t.make,
      model: t.model,
      software: t.software,
      prompt: prompt,
      seed: String(seed),
      iso: null, // app.js içinde tarih ISO'su eklenir
    };
  }

  global.MetaGen = { analyze: analyze, generate: generate, provenance: provenance, TOOLS: TOOLS };
})(window);
