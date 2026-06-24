/* Görsel dosyasına "AI üretmiş gibi" köken (provenance) metadata GÖMER.
 * Spec tabanlı: her AI aracı kendi alan düzenini (generator.js) tarif eder.
 * - JPEG: EXIF (TIFF: IFD0 + ExifIFD) + isteğe bağlı XMP + IPTC (APP13)
 * - PNG : iTXt chunk'ları
 * Tamamen tarayıcıda, bağımlılıksız. */
(function (global) {
  "use strict";

  function ascii(s) {
    return String(s)
      .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
      .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
      .replace(/[^\x20-\x7e]/g, "");
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function xmlEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function dt(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + ":" + p(d.getMonth() + 1) + ":" + p(d.getDate()) + " " +
      p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  // UserComment (EXIF type 7) için ASCII başlıklı bayt dizisi
  function userComment(text) {
    var head = [0x41, 0x53, 0x43, 0x49, 0x49, 0, 0, 0]; // "ASCII\0\0\0"
    var body = ascii(text).split("").map(function (c) { return c.charCodeAt(0); });
    return Uint8Array.from(head.concat(body));
  }

  // ---------- EXIF (TIFF) oluşturucu — IFD0 + isteğe bağlı ExifIFD ----------
  function encVal(type, value) {
    var u, dv, i;
    if (type === 2) { // ASCII
      var s = ascii(value), arr = [];
      for (i = 0; i < s.length; i++) arr.push(s.charCodeAt(i));
      arr.push(0);
      return { bytes: Uint8Array.from(arr), count: s.length + 1 };
    }
    if (type === 3) { // SHORT
      var v3 = Array.isArray(value) ? value : [value];
      u = new Uint8Array(v3.length * 2); dv = new DataView(u.buffer);
      v3.forEach(function (x, j) { dv.setUint16(j * 2, x, true); });
      return { bytes: u, count: v3.length };
    }
    if (type === 4) { // LONG
      var v4 = Array.isArray(value) ? value : [value];
      u = new Uint8Array(v4.length * 4); dv = new DataView(u.buffer);
      v4.forEach(function (x, j) { dv.setUint32(j * 4, x, true); });
      return { bytes: u, count: v4.length };
    }
    if (type === 5) { // RATIONAL [num,den] veya [[n,d],...]
      var pairs = Array.isArray(value[0]) ? value : [value];
      u = new Uint8Array(pairs.length * 8); dv = new DataView(u.buffer);
      pairs.forEach(function (p, j) { dv.setUint32(j * 8, p[0], true); dv.setUint32(j * 8 + 4, p[1], true); });
      return { bytes: u, count: pairs.length };
    }
    // type 7 / UNDEFINED
    var raw = value instanceof Uint8Array ? value : Uint8Array.from(value);
    return { bytes: raw, count: raw.length };
  }

  function pad2(n) { return n % 2 ? n + 1 : n; }

  function buildTIFF(ifd0, exifSub) {
    var hasSub = exifSub && exifSub.length;
    var e0 = ifd0.map(function (x) {
      var e = encVal(x.type, x.value); e.tag = x.tag; e.type = x.type; return e;
    });
    if (hasSub) e0.push({ tag: 0x8769, type: 4, bytes: new Uint8Array(4), count: 1, _ptr: true });
    e0.sort(function (a, b) { return a.tag - b.tag; });

    var n0 = e0.length;
    var ifd0DataStart = 8 + 2 + n0 * 12 + 4;
    var p = ifd0DataStart;
    e0.forEach(function (en) { if (en.bytes.length > 4) { en._off = p; p += pad2(en.bytes.length); } });

    var exifDirStart = p, e1 = [], n1 = 0, total = p;
    if (hasSub) {
      e1 = exifSub.map(function (x) { var e = encVal(x.type, x.value); e.tag = x.tag; e.type = x.type; return e; })
        .sort(function (a, b) { return a.tag - b.tag; });
      n1 = e1.length;
      var exifDataStart = exifDirStart + 2 + n1 * 12 + 4;
      var q = exifDataStart;
      e1.forEach(function (en) { if (en.bytes.length > 4) { en._off = q; q += pad2(en.bytes.length); } });
      total = q;
    }

    var buf = new ArrayBuffer(total);
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    dv.setUint16(0, 0x4949, false);   // "II"
    dv.setUint16(2, 0x002a, true);
    dv.setUint32(4, 8, true);

    function writeDir(entries, dirStart, ptrTarget) {
      dv.setUint16(dirStart, entries.length, true);
      entries.forEach(function (en, i) {
        var entry = dirStart + 2 + i * 12;
        dv.setUint16(entry, en.tag, true);
        dv.setUint16(entry + 2, en.type, true);
        dv.setUint32(entry + 4, en.count, true);
        if (en._ptr) dv.setUint32(entry + 8, ptrTarget, true);
        else if (en.bytes.length <= 4) u8.set(en.bytes, entry + 8);
        else { dv.setUint32(entry + 8, en._off, true); u8.set(en.bytes, en._off); }
      });
      dv.setUint32(dirStart + 2 + entries.length * 12, 0, true); // sonraki IFD yok
    }

    writeDir(e0, 8, exifDirStart);
    if (hasSub) writeDir(e1, exifDirStart, 0);
    return u8;
  }

  function wrapExifAPP1(tiff) {
    var head = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
    var len = 2 + head.length + tiff.length;
    var out = new Uint8Array(2 + len);
    out[0] = 0xff; out[1] = 0xe1;
    out[2] = (len >> 8) & 0xff; out[3] = len & 0xff;
    out.set(head, 4); out.set(tiff, 4 + head.length);
    return out;
  }

  // ---------- XMP (APP1) ----------
  function buildXmpPacket(p) {
    var aiUri = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
    return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="MetaForge">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about=""' +
      ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">' +
      '<xmp:CreatorTool>' + xmlEsc(p.software) + '</xmp:CreatorTool>' +
      '<Iptc4xmpExt:DigitalSourceType>' + aiUri + '</Iptc4xmpExt:DigitalSourceType>' +
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">' + xmlEsc(p.prompt) +
      '</rdf:li></rdf:Alt></dc:description>' +
      '<dc:creator><rdf:Seq><rdf:li>' + xmlEsc(p.tool) + '</rdf:li></rdf:Seq></dc:creator>' +
      '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  }
  function buildXmpAPP1(p) {
    var headStr = "http://ns.adobe.com/xap/1.0/ ", head = [], i;
    for (i = 0; i < headStr.length; i++) head.push(headStr.charCodeAt(i));
    var body = utf8(buildXmpPacket(p));
    var len = 2 + head.length + body.length;
    var out = new Uint8Array(2 + len);
    out[0] = 0xff; out[1] = 0xe1; out[2] = (len >> 8) & 0xff; out[3] = len & 0xff;
    out.set(head, 4); out.set(body, 4 + head.length);
    return out;
  }

  // ---------- IPTC / Photoshop (APP13) — caption alanı ----------
  function buildApp13(caption) {
    var cap = ascii(caption);
    var iptc = [];
    function ds(rec, set, bytes) {
      iptc.push(0x1c, rec, set, (bytes.length >> 8) & 0xff, bytes.length & 0xff);
      for (var i = 0; i < bytes.length; i++) iptc.push(bytes[i]);
    }
    ds(2, 0, [0, 2]);                                   // record version
    ds(2, 120, cap.split("").map(function (c) { return c.charCodeAt(0); })); // caption/abstract

    var headStr = "Photoshop 3.0\0", head = [], i;
    for (i = 0; i < headStr.length; i++) head.push(headStr.charCodeAt(i));

    var size = iptc.length;
    var block = head.concat(
      [0x38, 0x42, 0x49, 0x4d, 0x04, 0x04, 0x00, 0x00], // "8BIM" + 0x0404 + empty name
      [(size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff],
      iptc
    );
    if (block.length % 2) block.push(0);

    var len = 2 + block.length;
    var out = new Uint8Array(2 + len);
    out[0] = 0xff; out[1] = 0xed; out[2] = (len >> 8) & 0xff; out[3] = len & 0xff;
    out.set(block, 4);
    return out;
  }

  // ---------- JPEG enjeksiyonu (spec tabanlı) ----------
  function injectJpeg(buf, spec) {
    var src = new Uint8Array(buf);
    if (src[0] !== 0xff || src[1] !== 0xd8) throw new Error("Geçerli JPEG değil");

    var parts = [wrapExifAPP1(buildTIFF(spec.exif, spec.exifSub))];
    if (spec.xmp) parts.push(buildXmpAPP1(spec.xmp));
    if (spec.iptcCaption) parts.push(buildApp13(spec.iptcCaption));

    var off = 2, kept = [];
    while (off < src.length - 1) {
      if (src[off] !== 0xff) break;
      var marker = src[off + 1];
      if (marker === 0xda || marker === 0xd9) break;
      var segLen = (src[off + 2] << 8) | src[off + 3];
      var seg = src.subarray(off, off + 2 + segLen);
      if (marker !== 0xe1 && marker !== 0xed) kept.push(seg); // eski EXIF/XMP/IPTC at
      off += 2 + segLen;
    }
    var tail = src.subarray(off);

    var total = 2 + tail.length;
    parts.forEach(function (s) { total += s.length; });
    kept.forEach(function (s) { total += s.length; });
    var out = new Uint8Array(total), pos = 0;
    out[pos++] = 0xff; out[pos++] = 0xd8;
    parts.forEach(function (s) { out.set(s, pos); pos += s.length; });
    kept.forEach(function (s) { out.set(s, pos); pos += s.length; });
    out.set(tail, pos);
    return out;
  }

  // ---------- PNG enjeksiyonu ----------
  var CRC = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { var c = 0xffffffff; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function makeChunk(typeStr, data) {
    var type = utf8(typeStr);
    var chunk = new Uint8Array(8 + data.length + 4), dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length, false);
    chunk.set(type, 4); chunk.set(data, 8);
    var crcIn = new Uint8Array(4 + data.length); crcIn.set(type, 0); crcIn.set(data, 4);
    dv.setUint32(8 + data.length, crc32(crcIn), false);
    return chunk;
  }
  function itxtChunk(keyword, text) {
    var kw = utf8(keyword), tx = utf8(text);
    var data = new Uint8Array(kw.length + 5 + tx.length), i = 0, j;
    for (j = 0; j < kw.length; j++) data[i++] = kw[j];
    data[i++] = 0; data[i++] = 0; data[i++] = 0; data[i++] = 0; data[i++] = 0;
    for (j = 0; j < tx.length; j++) data[i++] = tx[j];
    return makeChunk("iTXt", data);
  }
  function injectPng(buf, spec) {
    var src = new Uint8Array(buf);
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (var s = 0; s < 8; s++) if (src[s] !== sig[s]) throw new Error("Geçerli PNG değil");
    var dv = new DataView(buf), off = 8, ihdrEnd = 8;
    while (off < src.length) {
      var len = dv.getUint32(off, false);
      var type = String.fromCharCode(src[off + 4], src[off + 5], src[off + 6], src[off + 7]);
      var end = off + 12 + len;
      if (type === "IHDR") { ihdrEnd = end; break; }
      off = end;
    }
    var chunks = [];
    // PNG'de native EXIF yok; EXIF akışını standart eXIf chunk'ı içine göm
    // (JPEG ile birebir aynı TIFF: Grok imzası, Artist UUID, UserComment...)
    if (spec.exif && spec.exif.length) chunks.push(makeChunk("eXIf", buildTIFF(spec.exif, spec.exifSub)));
    (spec.pngText || []).forEach(function (t) { chunks.push(itxtChunk(t.k, t.v)); });
    if (spec.xmp) chunks.push(itxtChunk("XML:com.adobe.xmp", buildXmpPacket(spec.xmp)));
    var add = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(src.length + add);
    out.set(src.subarray(0, ihdrEnd), 0);
    var pos = ihdrEnd;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    out.set(src.subarray(ihdrEnd), pos);
    return out;
  }

  function embed(arrayBuffer, mime, spec) {
    var u8 = new Uint8Array(arrayBuffer);
    if (u8[0] === 0xff && u8[1] === 0xd8) return { bytes: injectJpeg(arrayBuffer, spec), type: "image/jpeg", ext: "jpg" };
    if (u8[0] === 0x89 && u8[1] === 0x50) return { bytes: injectPng(arrayBuffer, spec), type: "image/png", ext: "png" };
    throw new Error("Yalnızca JPEG ve PNG'ye gömülebilir. Görseli JPG/PNG kaydedip tekrar dene.");
  }

  global.MetaWriter = { embed: embed, ascii: ascii, userComment: userComment, dt: dt };
})(window);
