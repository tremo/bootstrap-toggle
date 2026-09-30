// three.js'i yerel kopyalar; uygulama çevrimdışı çalışsın diye
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules', 'three');
if (!fs.existsSync(src)) { console.error('three bulunamadı. Önce `npm install` çalıştırın.'); process.exit(1); }
const dst = path.join(root, 'vendor', 'three');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.join(dst, 'build'), { recursive: true });
fs.copyFileSync(path.join(src, 'build', 'three.module.js'), path.join(dst, 'build', 'three.module.js'));
fs.cpSync(path.join(src, 'examples', 'jsm'), path.join(dst, 'examples', 'jsm'), { recursive: true });
console.log('vendor/three hazır');
