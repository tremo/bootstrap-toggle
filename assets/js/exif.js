/* Minimal bağımlılıksız EXIF okuyucu (JPEG APP1 / TIFF IFD).
 * Yaygın etiketleri çıkarır: kamera, lens, pozlama, ISO, odak, tarih, GPS.
 * Eksik/desteklenmeyen formatlarda sessizce boş döner. */
(function (global) {
  "use strict";

  var TAGS = {
    0x010e: "ImageDescription",
    0x010f: "Make",
    0x0110: "Model",
    0x0112: "Orientation",
    0x011a: "XResolution",
    0x0131: "Software",
    0x0132: "DateTime",
    0x013b: "Artist",
    0x829a: "ExposureTime",
    0x829d: "FNumber",
    0x8827: "ISO",
    0x8769: "ExifIFDPointer",
    0x8825: "GPSInfoIFDPointer",
    0x9003: "DateTimeOriginal",
    0x920a: "FocalLength",
    0xa002: "PixelXDimension",
    0xa003: "PixelYDimension",
    0xa405: "FocalLengthIn35mm",
    0xa432: "LensInfo",
    0xa434: "LensModel",
  };

  var GPS_TAGS = {
    0x0001: "GPSLatitudeRef",
    0x0002: "GPSLatitude",
    0x0003: "GPSLongitudeRef",
    0x0004: "GPSLongitude",
    0x0006: "GPSAltitude",
  };

  function readTags(view, dirStart, tiffStart, little, tagSet, out) {
    var entries = view.getUint16(dirStart, little);
    for (var i = 0; i < entries; i++) {
      var entry = dirStart + 2 + i * 12;
      var tag = view.getUint16(entry, little);
      var name = tagSet[tag];
      if (!name && tag !== 0x8769 && tag !== 0x8825) continue;
      var val = readValue(view, entry, tiffStart, little);
      if (name) out[name] = val;
      if (tag === 0x8769 && val) out._exifPtr = tiffStart + val;
      if (tag === 0x8825 && val) out._gpsPtr = tiffStart + val;
    }
  }

  function readValue(view, entry, tiffStart, little) {
    var type = view.getUint16(entry + 2, little);
    var count = view.getUint32(entry + 4, little);
    var sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    var size = (sizes[type] || 1) * count;
    var offset = size > 4 ? tiffStart + view.getUint32(entry + 8, little) : entry + 8;

    try {
      switch (type) {
        case 2: { // ASCII
          var s = "";
          for (var i = 0; i < count - 1; i++) {
            var c = view.getUint8(offset + i);
            if (c === 0) break;
            s += String.fromCharCode(c);
          }
          return s.trim();
        }
        case 3: return view.getUint16(offset, little);
        case 4: return view.getUint32(offset, little);
        case 5: { // rational
          if (count === 1) {
            var n = view.getUint32(offset, little);
            var d = view.getUint32(offset + 4, little);
            return d ? n / d : 0;
          }
          var arr = [];
          for (var j = 0; j < count; j++) {
            var nn = view.getUint32(offset + j * 8, little);
            var dd = view.getUint32(offset + j * 8 + 4, little);
            arr.push(dd ? nn / dd : 0);
          }
          return arr;
        }
        default: return view.getUint16(offset, little);
      }
    } catch (e) { return null; }
  }

  // JPEG APP1 ("Exif\0\0") veya PNG ("eXIf" chunk) içinden TIFF başlangıcını bul
  function findTiff(view) {
    var len = view.byteLength;
    if (view.getUint16(0) === 0xffd8) { // JPEG
      var offset = 2;
      while (offset < len - 1) {
        if (view.getUint8(offset) !== 0xff) break;
        var marker = view.getUint8(offset + 1);
        var segLen = view.getUint16(offset + 2);
        if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) return offset + 10; // "Exif\0\0"
        offset += 2 + segLen;
      }
      return -1;
    }
    if (view.getUint32(0) === 0x89504e47) { // PNG
      var p = 8;
      while (p < len) {
        var clen = view.getUint32(p, false);
        if (view.getUint32(p + 4, false) === 0x65584966) return p + 8; // "eXIf"
        p += 12 + clen;
      }
      return -1;
    }
    return -1;
  }

  function parse(arrayBuffer) {
    var out = {};
    try {
      var view = new DataView(arrayBuffer);
      var tiff = findTiff(view);
      if (tiff < 0) return out;
      var byteOrder = view.getUint16(tiff);
      var little = byteOrder === 0x4949;

      var ifd0 = tiff + view.getUint32(tiff + 4, little);
      readTags(view, ifd0, tiff, little, TAGS, out);
      if (out._exifPtr) readTags(view, out._exifPtr, tiff, little, TAGS, out);
      if (out._gpsPtr) {
        var gps = {};
        readTags(view, out._gpsPtr, tiff, little, GPS_TAGS, gps);
        out._gps = gps;
      }
    } catch (e) { /* yut */ }
    delete out._exifPtr;
    delete out._gpsPtr;
    return out;
  }

  global.SimpleEXIF = { parse: parse };
})(window);
