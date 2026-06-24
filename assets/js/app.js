/* UI akışı: yükleme → analiz animasyonu → AI metadata gösterimi → kopyala/indir */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var dropzone = $("dropzone");
  var fileInput = $("fileInput");
  var workspace = $("workspace");
  var previewImg = $("previewImg");
  var scanline = $("scanline");
  var analyzing = $("analyzing");
  var result = $("result");
  var progBar = $("progBar");
  var logList = $("logList");

  var current = { features: null, exif: null, meta: null, prov: null, fileName: "", buffer: null, mime: "" };
  var regenCount = 0;

  // ---- Yükleme olayları ----
  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove("dragover"); });
  });
  dropzone.addEventListener("drop", function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  // sayfaya yapıştırma
  window.addEventListener("paste", function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") === 0) { handleFile(items[i].getAsFile()); break; }
    }
  });

  $("resetBtn").addEventListener("click", function () {
    workspace.classList.add("hidden");
    dropzone.classList.remove("hidden");
    fileInput.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  function handleFile(file) {
    if (!file.type || file.type.indexOf("image") !== 0) {
      toast("Lütfen bir görsel dosyası seç.");
      return;
    }
    current.fileName = file.name || "image";
    current.mime = file.type || "";
    dropzone.classList.add("hidden");
    workspace.classList.remove("hidden");
    result.classList.add("hidden");

    // Dosyanın ham baytları (hem EXIF okuma hem de metadata gömme için saklanır)
    var efr = new FileReader();
    efr.onload = function () {
      current.buffer = efr.result;
      current.exif = window.SimpleEXIF ? SimpleEXIF.parse(efr.result) : {};
      renderExif(current.exif, file);
    };
    efr.readAsArrayBuffer(file);

    // Önizleme + analiz
    var url = URL.createObjectURL(file);
    previewImg.onload = function () {
      URL.revokeObjectURL(url);
      current.features = MetaGen.analyze(previewImg);
      regenCount = 0;
      runAnalysis();
    };
    previewImg.src = url;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Sahte analiz animasyonu ----
  function runAnalysis() {
    result.classList.add("hidden");
    analyzing.classList.remove("hidden");
    scanline.classList.remove("hidden");
    progBar.style.width = "0%";
    logList.innerHTML = "";

    var steps = [
      "görsel tensörü yükleniyor… " + current.features.width + "×" + current.features.height,
      "renk uzayı analizi (RGB→HSL)",
      "baskın palet çıkarılıyor (k-means, k=5)",
      "parlaklık & kontrast haritalanıyor",
      "sahne & nesne sınıflandırması",
      "forge-vision-2.1 ile metin üretimi",
      "metadata derleniyor",
    ];

    var i = 0;
    (function next() {
      if (i >= steps.length) {
        scanline.classList.add("hidden");
        analyzing.classList.add("hidden");
        showResult();
        return;
      }
      var li = document.createElement("li");
      li.innerHTML = "<span class='ok'>✓</span> " + steps[i];
      logList.appendChild(li);
      i++;
      progBar.style.width = Math.round((i / steps.length) * 100) + "%";
      setTimeout(next, 230 + Math.random() * 220);
    })();
  }

  // ---- Sonuç gösterimi ----
  function showResult() {
    current.meta = MetaGen.generate(current.features, current.exif, regenCount);
    var m = current.meta;

    $("outTitle").textContent = m.title;
    $("confDesc").textContent = "· güven " + m.confidence;
    typewriter($("outDesc"), m.description);
    $("outAlt").textContent = m.alt_text;
    $("outMood").textContent = m.mood;
    $("outFilename").textContent = m.filename;
    $("outShot").textContent = m.shot;

    chips($("outTags"), m.detected, "chip");
    chips($("outKeywords"), m.keywords, "chip kw");

    var pal = $("outPalette");
    pal.innerHTML = "";
    m.palette.forEach(function (p) {
      var sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = p.hex;
      sw.title = p.name + " " + p.hex;
      sw.innerHTML = "<span>" + p.hex + "</span>";
      sw.addEventListener("click", function () { copyText(p.hex); });
      pal.appendChild(sw);
    });

    renderProvenance();

    $("jsonOut").textContent = JSON.stringify(toExport(m), null, 2);
    result.classList.remove("hidden");
  }

  // seçilen AI aracına göre köken (provenance) alanlarını üret + göster
  function renderProvenance() {
    var toolKey = $("toolSelect").value;
    current.prov = MetaGen.provenance(current.features, toolKey, regenCount);
    var p = current.prov;
    $("provTool").textContent = p.tool;
    $("provPrompt").textContent = p.prompt;

    var fields = $("provFields");
    fields.innerHTML = "";
    p.fields.forEach(function (f) {
      var d = document.createElement("div");
      d.innerHTML = "<label>" + f.label + "</label><span" +
        (f.mono ? ' class="mono"' : "") + "></span>";
      d.querySelector("span").textContent = f.value;
      fields.appendChild(d);
    });

    $("provNote").innerHTML = p.real
      ? "✓ <strong>Grok yapısının birebir taklidi:</strong> EXIF <code>ImageDescription</code> + " +
        "<code>UserComment</code> + IPTC alanına <code>Signature: …</code>, <code>Artist</code>'e UUID gömülür. " +
        "İmza rastgeledir; görüntüleyicide Grok çıktısıyla aynı görünür ama xAI anahtarıyla doğrulanmaz."
      : "Yaklaşık yapı: EXIF (Make/Model/Software) + XMP <code>DigitalSourceType=trainedAlgorithmicMedia</code>" +
        ", PNG'lerde <code>parameters</code> chunk'ı.";
    $("verifyBox").classList.add("hidden");
  }

  $("toolSelect").addEventListener("change", function () {
    if (current.features) renderProvenance();
  });

  // ---- AI metadata'yı gerçek dosyaya göm + indir ----
  $("embedBtn").addEventListener("click", function () {
    if (!current.buffer || !current.prov) return;
    var res;
    try {
      res = MetaWriter.embed(current.buffer, current.mime, current.prov.spec);
    } catch (e) {
      toast(e.message || "Gömme başarısız");
      return;
    }
    var blob = new Blob([res.bytes], { type: res.type });
    var base = current.fileName.replace(/\.[^.]+$/, "");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = base + ".ai-meta." + res.ext;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Gömüldü ve indirildi ✓");
    verifyEmbedded(res.bytes);
  });

  // indirilen baytları geri okuyup gömülen metadata'yı doğrula
  function verifyEmbedded(bytes) {
    var ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    var p = current.prov, lines = [];
    var exif = window.SimpleEXIF ? SimpleEXIF.parse(ab) : {};
    var txt = "", u8 = new Uint8Array(ab);
    for (var i = 0; i < u8.length; i++) txt += String.fromCharCode(u8[i]);

    if (p.real) {
      lines.push("EXIF.ImageDescription = " + (exif.ImageDescription || "—"));
      lines.push("EXIF.Artist (UUID)    = " + (exif.Artist || "—"));
      lines.push("UserComment imzası    = " + (txt.indexOf(p.signature.slice(0, 24)) !== -1 ? "✓ var" : "yok"));
      lines.push("IPTC (APP13) imzası   = " + ((txt.match(/Signature: /g) || []).length >= 2 ? "✓ var" : "yok"));
      lines.push("");
      lines.push("⚠ İmza rastgeledir — xAI açık anahtarıyla doğrulanmaz.");
    } else {
      lines.push("EXIF.Make     = " + (exif.Make || "—"));
      lines.push("EXIF.Model    = " + (exif.Model || "—"));
      lines.push("EXIF.Software = " + (exif.Software || "—"));
      lines.push("XMP DigitalSourceType    = " + (txt.indexOf("DigitalSourceType") !== -1 ? "✓ var" : "yok"));
      lines.push("trainedAlgorithmicMedia  = " + (txt.indexOf("trainedAlgorithmicMedia") !== -1 ? "✓ var" : "yok"));
    }
    $("verifyOut").textContent = lines.join("\n");
    $("verifyBox").classList.remove("hidden");
  }

  function toExport(m) {
    var prov = current.prov || {};
    var ai = prov.real
      ? { tool: prov.tool, method: "cryptographic signature (EXIF/UserComment/IPTC)",
          signature: prov.signature, generation_uuid: prov.uuid, prompt: prov.prompt }
      : { tool: prov.tool, model: prov.model, software: prov.software,
          prompt: prov.prompt, seed: prov.seed, digital_source_type: "trainedAlgorithmicMedia" };
    return {
      generator: "MetaForge",
      ai_provenance: ai,
      generated_at: new Date().toISOString(),
      source_file: current.fileName,
      title: m.title,
      description: m.description,
      alt_text: m.alt_text,
      detected_content: m.detected,
      keywords: m.keywords,
      color_palette: m.palette,
      mood_and_style: m.mood,
      suggested_filename: m.filename,
      capture_info: m.shot,
      confidence: m.confidence,
      dimensions: { width: m._features.width, height: m._features.height },
    };
  }

  // ---- EXIF tablosu ----
  function renderExif(exif, file) {
    var list = $("exifList");
    list.innerHTML = "";
    var rows = [];
    rows.push(["Dosya", file.name]);
    rows.push(["Tür", file.type || "—"]);
    rows.push(["Boyut", (file.size / 1024).toFixed(1) + " KB"]);
    if (current.features) rows.push(["Çözünürlük", current.features.width + " × " + current.features.height + " px"]);

    var map = [
      ["Make", "Üretici"], ["Model", "Kamera"], ["LensModel", "Lens"],
      ["DateTimeOriginal", "Çekim tarihi"], ["DateTime", "Tarih"],
      ["ISO", "ISO"], ["Software", "Yazılım"],
    ];
    map.forEach(function (pair) {
      if (exif && exif[pair[0]]) rows.push([pair[1], String(exif[pair[0]])]);
    });
    if (exif && exif.FNumber) rows.push(["Diyafram", "f/" + (Math.round(exif.FNumber * 10) / 10)]);
    if (exif && exif.ExposureTime) {
      rows.push(["Pozlama", exif.ExposureTime >= 1 ? exif.ExposureTime + "s" : "1/" + Math.round(1 / exif.ExposureTime) + "s"]);
    }
    if (exif && exif.FocalLength) rows.push(["Odak", Math.round(exif.FocalLength) + " mm"]);

    var hasCam = exif && (exif.Make || exif.Model);
    rows.forEach(function (r) {
      var dt = document.createElement("dt"); dt.textContent = r[0];
      var dd = document.createElement("dd"); dd.textContent = r[1];
      list.appendChild(dt); list.appendChild(dd);
    });
    if (!hasCam) {
      var note = document.createElement("dd");
      note.className = "muted";
      note.style.gridColumn = "1 / -1";
      note.textContent = "Gömülü kamera EXIF'i bulunamadı — teknik veriler AI tarafından tahmin edilecek.";
      list.appendChild(note);
    }
  }

  // ---- Yardımcılar ----
  function chips(el, arr, cls) {
    el.innerHTML = "";
    arr.forEach(function (t) {
      var s = document.createElement("span");
      s.className = cls;
      s.textContent = t;
      el.appendChild(s);
    });
  }

  function typewriter(el, text) {
    el.textContent = "";
    var i = 0;
    (function step() {
      if (i > text.length) return;
      el.textContent = text.slice(0, i);
      i += 3;
      if (i <= text.length) setTimeout(step, 12);
      else el.textContent = text;
    })();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Kopyalandı ✓"); },
        function () { fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Kopyalandı ✓"); } catch (e) { toast("Kopyalanamadı"); }
    document.body.removeChild(ta);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".copy");
    if (btn) {
      var el = $(btn.getAttribute("data-target"));
      if (el) copyText(el.textContent);
    }
  });

  $("regenBtn").addEventListener("click", function () { regenCount++; runAnalysis(); });
  $("copyJsonBtn").addEventListener("click", function () {
    copyText(JSON.stringify(toExport(current.meta), null, 2));
  });
  $("downloadBtn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(toExport(current.meta), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (current.meta.filename || "metadata").replace(/\.jpg$/, "") + ".metadata.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("JSON indirildi ✓");
  });

  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
})();
