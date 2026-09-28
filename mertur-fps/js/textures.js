// Prosedürel dokular (albedo + normal). Hepsi döşenebilir; dünya ölçeğinde UV ile kullanılır.
import * as THREE from 'three';
import { tfbm, tfbm2, worley, hash2, mulberry32, clamp, lerp, nextFrame } from './util.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// fn(u,v,out) → out[0..2] renk (0..1 sRGB), out[3] yükseklik (0..1)
function generate(size, fn, normalStrength = 2.0, alpha = false) {
  const col = canvas(size);
  const ctx = col.getContext('2d');
  const img = ctx.createImageData(size, size);
  const H = new Float32Array(size * size);
  const out = [0, 0, 0, 0, 1];
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      out[4] = 1;
      fn(u, v, out);
      const i = (y * size + x) * 4;
      img.data[i] = clamp(out[0], 0, 1) * 255;
      img.data[i + 1] = clamp(out[1], 0, 1) * 255;
      img.data[i + 2] = clamp(out[2], 0, 1) * 255;
      img.data[i + 3] = alpha ? clamp(out[4], 0, 1) * 255 : 255;
      H[y * size + x] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  let nrm = null;
  if (normalStrength > 0) nrm = normalFromHeight(H, size, normalStrength);
  return { color: col, normal: nrm, height: H };
}

function normalFromHeight(H, size, s) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * s;
      const dy = (at(x, y + 1) - at(x, y - 1)) * s;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, srgb = true, repeat = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function pair(g, aniso) {
  return { map: tex(g.color, true, true, aniso), normal: g.normal ? tex(g.normal, false, true, aniso) : null, canvas: g.color, ncanvas: g.normal };
}

const mix3 = (a, b, t, o) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); };

// ---------- tek tek dokular ----------
function plaster(u, v, o) {
  const b = tfbm(u, v, 3, 4) * 0.5;
  const f = tfbm(u, v, 48, 3);
  const s = tfbm(u * 1, v * 1, 24, 2);
  const streak = Math.max(0, tfbm2(u, v, 40, 3, 3)) * 0.07;
  const w = 0.93 + b * 0.05 + f * 0.025 - streak;
  o[0] = w * 1.0; o[1] = w * 0.985; o[2] = w * 0.945;
  o[3] = f * 0.55 + s * 0.45;
}

function tiles(u, v, o) {
  const cols = 6, rows = 8;
  const cx = u * cols, cy = v * rows;
  const ci = Math.floor(cx), xf = cx - ci;
  const shift = (ci % 2) * 0.5;
  const ry = cy + shift;
  const ri = Math.floor(ry), yf = ry - ri;
  const h = hash2(ci, ((ri % rows) + rows) % rows, 3);
  const barrel = Math.sqrt(Math.max(0, 1 - Math.pow(xf * 2 - 1, 2)));
  const up = ci % 2 === 0;
  let hh = up ? barrel : 0.55 - barrel * 0.35;
  hh += (1 - yf) * 0.25; // bindirme
  const edge = yf < 0.06 ? yf / 0.06 : 1;
  const base = [0.70 + h[0] * 0.12, 0.30 + h[1] * 0.1, 0.17 + h[0] * 0.06];
  const aged = tfbm(u, v, 8, 3) * 0.5 + 0.5;
  const lichen = Math.max(0, tfbm(u + 0.3, v, 12, 3) - 0.25) * 1.2;
  const sh = (up ? 0.75 + barrel * 0.3 : 0.62 + barrel * 0.15) * (0.55 + 0.45 * edge);
  o[0] = (base[0] * (0.85 + aged * 0.2) * (1 - lichen) + 0.62 * lichen) * sh;
  o[1] = (base[1] * (0.85 + aged * 0.2) * (1 - lichen) + 0.6 * lichen) * sh;
  o[2] = (base[2] * (0.85 + aged * 0.2) * (1 - lichen) + 0.5 * lichen) * sh;
  o[3] = hh * 0.8 * edge + tfbm(u, v, 64, 2) * 0.05;
}

function pavers(u, v, o) {
  // sepet örgüsü kırmızı parke (fotoğraftaki havuz başı)
  const N = 16; // birim
  const X = u * N, Y = v * N;
  const cx = Math.floor(X / 2), cy = Math.floor(Y / 2);
  const lx = X - cx * 2, ly = Y - cy * 2;
  const horiz = (cx + cy) % 2 === 0;
  const bi = horiz ? Math.floor(ly) : Math.floor(lx);
  const bx = horiz ? lx / 2 : lx - bi;
  const by = horiz ? ly - bi : ly / 2;
  const ex = Math.min(bx, 1 - bx) * (horiz ? 2 : 1), ey = Math.min(by, 1 - by) * (horiz ? 1 : 2);
  const e = Math.min(ex, ey);
  const h = hash2(cx * 3 + bi, cy, 5);
  const pal = [[0.60, 0.29, 0.21], [0.66, 0.34, 0.24], [0.53, 0.25, 0.19], [0.70, 0.40, 0.29]];
  const c = pal[Math.floor(h[0] * 4)];
  const n = tfbm(u, v, 32, 3) * 0.08 + tfbm(u, v, 4, 2) * 0.06;
  const joint = e < 0.06;
  if (joint) { o[0] = 0.42; o[1] = 0.37; o[2] = 0.3; o[3] = 0; }
  else {
    const bev = clamp(e / 0.14, 0, 1);
    const k = (0.85 + h[1] * 0.2 + n) * (0.8 + 0.2 * bev);
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[3] = 0.6 + bev * 0.4 + n;
  }
}

function flagstone(u, v, o) {
  const [f1, f2, id] = worley(u, v, 6, 11);
  const e = f2 - f1;
  const pal = [[0.76, 0.72, 0.64], [0.68, 0.66, 0.62], [0.8, 0.74, 0.62], [0.62, 0.60, 0.57], [0.72, 0.66, 0.56]];
  const c = pal[Math.floor(id * 5)];
  const n = tfbm(u, v, 24, 4);
  if (e < 0.09) {
    const g = tfbm(u, v, 40, 2) * 0.5 + 0.5;
    o[0] = 0.44 + g * 0.06; o[1] = 0.42 + g * 0.08; o[2] = 0.36; o[3] = 0.05;
  } else {
    const k = 0.9 + n * 0.12 + (id - 0.5) * 0.08;
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    o[3] = 0.55 + clamp((e - 0.09) * 5, 0, 0.35) + n * 0.12;
  }
}

function grass(u, v, o) {
  const low = tfbm(u, v, 3, 4) * 0.5 + 0.5;
  const blades = tfbm(u * 1.0, v * 1.0, 96, 3);
  const mid = tfbm(u, v, 16, 3);
  const dry = clamp((tfbm(u + 0.7, v + 0.1, 4, 4) - 0.1) * 2.2, 0, 1) * 0.55;
  const g1 = [0.25, 0.37, 0.12], g2 = [0.36, 0.45, 0.17], d = [0.56, 0.52, 0.30];
  const t = [0, 0, 0];
  mix3(g1, g2, clamp(low + mid * 0.3, 0, 1), t);
  mix3(t, d, dry, t);
  const k = 0.82 + blades * 0.3;
  o[0] = t[0] * k; o[1] = t[1] * k; o[2] = t[2] * k;
  o[3] = blades * 0.6 + mid * 0.3 + 0.5;
}

function dryGround(u, v, o) {
  const n = tfbm(u, v, 4, 5) * 0.5 + 0.5;
  const tuft = clamp(tfbm(u, v, 24, 3) * 1.6 + 0.2, 0, 1);
  const [f1, , id] = worley(u, v, 22, 4);
  const stone = f1 < 0.28 && id > 0.6;
  const soil = [0.52, 0.42, 0.30], grassD = [0.63, 0.57, 0.37], needles = [0.40, 0.29, 0.19];
  const t = [0, 0, 0];
  mix3(soil, grassD, tuft, t);
  mix3(t, needles, clamp(tfbm(u + 0.4, v, 8, 3) * 1.5 - 0.3, 0, 0.6), t);
  let k = 0.85 + n * 0.25;
  if (stone) { t[0] = 0.66; t[1] = 0.63; t[2] = 0.58; k = 0.9 + (0.28 - f1) * 0.8; }
  o[0] = t[0] * k; o[1] = t[1] * k; o[2] = t[2] * k;
  o[3] = tuft * 0.4 + (stone ? 0.6 + (0.28 - f1) : 0) + tfbm(u, v, 64, 2) * 0.15;
}

function rock(u, v, o) {
  let r = 0, a = 0.5, f = 4;
  for (let i = 0; i < 5; i++) { r += a * (1 - Math.abs(tfbm(u, v, f, 1))); a *= 0.5; f *= 2; }
  const n = tfbm(u, v, 6, 4);
  const lich = clamp(tfbm(u + 0.2, v + 0.5, 10, 3) * 2 - 0.4, 0, 1);
  const base = 0.55 + n * 0.12 + r * 0.12;
  o[0] = base * (1 - lich * 0.2) + lich * 0.14; o[1] = base * 0.97 * (1 - lich * 0.2) + lich * 0.13; o[2] = base * 0.92 * (1 - lich * 0.3) + lich * 0.06;
  o[3] = r * 0.8 + n * 0.2;
}

function pebbles(u, v, o) {
  const [f1, f2, id] = worley(u, v, 34, 21);
  const [g1, , id2] = worley(u + 0.13, v + 0.37, 70, 22);
  const sand = [0.72, 0.66, 0.55];
  const pal = [[0.62, 0.60, 0.57], [0.74, 0.71, 0.66], [0.55, 0.50, 0.45], [0.80, 0.77, 0.70], [0.48, 0.47, 0.46], [0.69, 0.62, 0.52]];
  const n = tfbm(u, v, 48, 2) * 0.06;
  const r1 = 0.36 + id * 0.12;
  if (f1 < r1) {
    const c = pal[Math.floor(id * 6)];
    const dome = Math.sqrt(1 - (f1 / r1) ** 2);
    const k = 0.72 + dome * 0.35 + n;
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[3] = 0.4 + dome * 0.6;
  } else if (g1 < 0.3) {
    const c = pal[Math.floor(id2 * 6)];
    const dome = Math.sqrt(1 - (g1 / 0.3) ** 2);
    const k = 0.75 + dome * 0.3 + n;
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[3] = 0.25 + dome * 0.35;
  } else {
    const k = 0.9 + n * 2;
    o[0] = sand[0] * k; o[1] = sand[1] * k; o[2] = sand[2] * k; o[3] = 0.15 + n;
  }
  void f2;
}

function asphalt(u, v, o) {
  const n = tfbm(u, v, 6, 4);
  const sp = tfbm(u, v, 180, 1);
  const agg = sp > 0.35 ? 0.12 : sp < -0.4 ? -0.05 : 0;
  const patch = clamp(tfbm(u + 0.5, v, 3, 3) * 3 - 0.8, 0, 1) * 0.06;
  const crack = Math.abs(tfbm(u, v, 5, 4)) < 0.012 ? -0.08 : 0;
  const k = 0.23 + n * 0.035 + agg + patch + crack;
  o[0] = k; o[1] = k * 1.0; o[2] = k * 1.04;
  o[3] = 0.5 + agg * 2 + crack * 3 + sp * 0.1;
}

function wood(u, v, o) {
  const plank = Math.floor(u * 4);
  const h = hash2(plank, 0, 8);
  const grain = Math.sin((v * 40 + tfbm(u, v, 8, 3) * 6 + h[0] * 10) * Math.PI) * 0.5 + 0.5;
  const gap = (u * 4 - plank) < 0.04 ? 0.5 : 1;
  const k = (0.75 + grain * 0.25 + h[1] * 0.1) * gap;
  o[0] = 0.55 * k; o[1] = 0.36 * k; o[2] = 0.22 * k; o[3] = grain * 0.3 + gap * 0.7;
}

function roofTop(u, v, o) {
  const n = tfbm(u, v, 32, 3), m = tfbm(u, v, 3, 3);
  const k = 0.66 + n * 0.05 + m * 0.06;
  o[0] = k; o[1] = k * 0.99; o[2] = k * 0.96; o[3] = n * 0.5 + 0.5;
}

function poolTile(u, v, o) {
  const N = 40;
  const X = u * N, Y = v * N;
  const fx = X - Math.floor(X), fy = Y - Math.floor(Y);
  const h = hash2(Math.floor(X), Math.floor(Y), 17);
  const e = Math.min(fx, 1 - fx, fy, 1 - fy);
  if (e < 0.07) { o[0] = 0.86; o[1] = 0.9; o[2] = 0.9; o[3] = 0; return; }
  const k = 0.9 + h[0] * 0.12;
  const band = Math.floor(Y) % 20 === 0 ? 1 : 0;
  o[0] = (band ? 0.12 : 0.55) * k; o[1] = (band ? 0.36 : 0.83) * k; o[2] = (band ? 0.62 : 0.9) * k; o[3] = 1;
}

function camo(u, v, o) {
  // Türk Kara Kuvvetleri tarzı pikselli desen
  const q = 64;
  const qu = Math.floor(u * q) / q, qv = Math.floor(v * q) / q;
  const a = tfbm(qu, qv, 4, 3), b = tfbm(qu + 0.5, qv + 0.2, 6, 3), c = tfbm(qu + 0.1, qv + 0.7, 8, 2);
  let col = [0.47, 0.44, 0.32]; // haki
  if (a > 0.08) col = [0.33, 0.35, 0.22]; // zeytin
  if (b > 0.18) col = [0.38, 0.28, 0.19]; // kahve
  if (c > 0.3) col = [0.15, 0.15, 0.12]; // siyah
  o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = tfbm(u, v, 64, 2) * 0.5 + 0.5;
}

function pineBark(u, v, o) {
  const [f1, f2, id] = worley(u, v, 8, 31);
  const e = f2 - f1;
  const k = e < 0.08 ? 0.35 : 0.75 + id * 0.25;
  o[0] = 0.45 * k; o[1] = 0.28 * k; o[2] = 0.2 * k; o[3] = e < 0.08 ? 0 : 0.6 + tfbm(u, v, 32, 2) * 0.2;
}
function palmBark(u, v, o) {
  const ring = (v * 18) % 1;
  const n = tfbm(u, v, 16, 3);
  const k = 0.62 + (ring < 0.25 ? -0.2 : 0) + n * 0.1;
  o[0] = 0.52 * k; o[1] = 0.44 * k; o[2] = 0.34 * k; o[3] = ring < 0.25 ? 0.2 : 0.7 + n * 0.2;
}

// ---------- 2D çizimle yapılan alfa dokular ----------
function leafCluster(kind) {
  const S = 256;
  const c = canvas(S), g = c.getContext('2d');
  const r = mulberry32(kind.length * 31 + 7);
  const pals = {
    olive: ['#6b7550', '#57643f', '#7c8663', '#4b5838', '#8a9277'],
    pine: ['#2f4520', '#3a5227', '#26391a', '#46602e'],
    shrub: ['#2e4a22', '#3b5a2a', '#27401c', '#4a6a33'],
    bougain: ['#c21e78', '#d8358e', '#a8155f', '#e05aa3', '#3f6a2a', '#35591f'],
    oleander: ['#e27aa0', '#f3a6c0', '#3f6a2a', '#35591f', '#4b7a31'],
    palm: ['#3f6128', '#4d722f', '#355420'],
  };
  const p = pals[kind];
  if (kind === 'pine') {
    for (let k = 0; k < 70; k++) {
      const cx = S * (0.15 + r() * 0.7), cy = S * (0.15 + r() * 0.7);
      g.strokeStyle = p[Math.floor(r() * p.length)];
      g.lineWidth = 1.3;
      for (let n = 0; n < 16; n++) {
        const a = r() * Math.PI * 2, L = 10 + r() * 16;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
      }
    }
  } else {
    const n = kind === 'olive' ? 260 : 220;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * S * 0.42;
      const x = S / 2 + Math.cos(a) * rad, y = S / 2 + Math.sin(a) * rad;
      const col = p[Math.floor(r() * p.length)];
      const flower = (kind === 'bougain' || kind === 'oleander') && k % 3 !== 0;
      g.fillStyle = flower ? p[Math.floor(r() * (p.length - 2))] : col;
      g.save(); g.translate(x, y); g.rotate(r() * Math.PI);
      g.beginPath();
      if (kind === 'olive') g.ellipse(0, 0, 11, 2.6, 0, 0, Math.PI * 2);
      else if (flower) g.ellipse(0, 0, 5, 4.5, 0, 0, Math.PI * 2);
      else g.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
      g.fill(); g.restore();
    }
  }
  return c;
}

function palmFrond() {
  const W = 128, H = 512;
  const c = canvas(W, H), g = c.getContext('2d');
  const r = mulberry32(5);
  g.lineCap = 'round';
  // hurma (Phoenix) yaprağı: ince, sık, uca doğru sarkan yaprakçıklar
  for (let i = 0; i < 150; i++) {
    const t = i / 150;
    const y = H * (0.06 + t * 0.92);
    const L = Math.sin(Math.min(1, t * 1.4 + 0.08) * Math.PI * 0.95) * W * 0.47 * (0.8 + r() * 0.25);
    for (const s of [-1, 1]) {
      g.strokeStyle = ['#34521f', '#3e6026', '#2b461a', '#4b7030', '#58793a'][Math.floor(r() * 5)];
      g.lineWidth = 2.6 - t * 1.2;
      g.beginPath();
      g.moveTo(W / 2 + s * 2, y);
      g.quadraticCurveTo(W / 2 + s * L * 0.55, y + 6, W / 2 + s * L, y + 26 + r() * 10);
      g.stroke();
    }
  }
  g.strokeStyle = '#6e6a3c'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  return c;
}

function sprite(size, draw) {
  const c = canvas(size), g = c.getContext('2d');
  draw(g, size);
  return c;
}

function radial(g, S, stops) {
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
}

export function makeTextCanvas(text, { w = 512, h = 128, bg = '#1f4e8c', fg = '#ffffff', font = 'bold 64px sans-serif', border = null } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  return c;
}

export async function buildTextures(renderer, progress = () => {}) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const T = {};
  const steps = [
    ['plaster', () => pair(generate(512, plaster, 3), aniso)],
    ['tile', () => pair(generate(512, tiles, 4), aniso)],
    ['pavers', () => pair(generate(512, pavers, 3), aniso)],
    ['flag', () => pair(generate(512, flagstone, 3), aniso)],
    ['grass', () => pair(generate(512, grass, 2), aniso)],
    ['dry', () => pair(generate(512, dryGround, 2.5), aniso)],
    ['rock', () => pair(generate(512, rock, 4), aniso)],
    ['sand', () => pair(generate(512, pebbles, 4), aniso)],
    ['asphalt', () => pair(generate(512, asphalt, 1.5), aniso)],
    ['wood', () => pair(generate(256, wood, 2), aniso)],
    ['roof', () => pair(generate(256, roofTop, 1.5), aniso)],
    ['poolTile', () => pair(generate(512, poolTile, 1.5), aniso)],
    ['camo', () => { const g = generate(256, camo, 1); const t = pair(g, aniso); t.map.magFilter = THREE.NearestFilter; return t; }],
    ['pineBark', () => pair(generate(256, pineBark, 3), aniso)],
    ['palmBark', () => pair(generate(256, palmBark, 3), aniso)],
  ];
  let k = 0;
  for (const [name, fn] of steps) {
    T[name] = fn();
    progress((++k) / (steps.length + 4), name);
    await nextFrame();
  }
  const leaf = (kind) => { const t = tex(leafCluster(kind), true, false, aniso); return t; };
  T.leaves = { olive: leaf('olive'), pine: leaf('pine'), shrub: leaf('shrub'), bougain: leaf('bougain'), oleander: leaf('oleander') };
  T.palmFrond = tex(palmFrond(), true, false, aniso);
  progress((++k) / (steps.length + 4), 'yapraklar');
  await nextFrame();

  // makro gürültü (arazi çeşitlemesi)
  {
    const S = 256;
    const c = canvas(S), g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = (y * S + x) * 4;
      img.data[i] = (tfbm(u, v, 2, 5) * 0.5 + 0.5) * 255;
      img.data[i + 1] = (tfbm(u + 0.3, v, 8, 4) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (tfbm(u, v + 0.6, 32, 3) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    T.macro = tex(c, false, true, aniso);
  }
  // sprite ve çıkartmalar
  T.flash = tex(sprite(128, (g, S) => {
    g.translate(S / 2, S / 2);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3 + (i % 2) * 0.2);
      const gr = g.createLinearGradient(0, 0, S / 2, 0);
      gr.addColorStop(0, 'rgba(255,245,200,1)'); gr.addColorStop(0.4, 'rgba(255,170,60,0.8)'); gr.addColorStop(1, 'rgba(255,90,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -S * 0.06); g.lineTo(S / 2, 0); g.lineTo(0, S * 0.06); g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    radial(g, S, [[0, 'rgba(255,255,230,1)'], [0.18, 'rgba(255,210,120,0.9)'], [0.45, 'rgba(255,120,30,0.25)'], [1, 'rgba(255,80,0,0)']]);
  }), true, false);
  T.smoke = tex(sprite(128, (g, S) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x / S - 0.5, dy = y / S - 0.5;
      const d = Math.hypot(dx, dy) * 2;
      const n = tfbm(x / S, y / S, 4, 4) * 0.5 + 0.5;
      const a = clamp((1 - d) * 1.4, 0, 1) * n;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 200 + n * 55;
      img.data[i + 3] = a * a * 255;
    }
    g.putImageData(img, 0, 0);
  }), true, false);
  T.glow = tex(sprite(64, (g, S) => radial(g, S, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']])), true, false);
  T.spark = tex(sprite(32, (g, S) => radial(g, S, [[0, 'rgba(255,255,220,1)'], [0.4, 'rgba(255,200,80,0.7)'], [1, 'rgba(255,120,0,0)']])), true, false);
  T.hole = tex(sprite(64, (g, S) => {
    radial(g, S, [[0, 'rgba(10,8,6,1)'], [0.16, 'rgba(25,20,16,0.95)'], [0.3, 'rgba(70,60,50,0.55)'], [0.5, 'rgba(120,110,95,0.2)'], [1, 'rgba(0,0,0,0)']]);
    const r = mulberry32(3);
    g.strokeStyle = 'rgba(30,25,20,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) { const a = r() * 6.28; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * 0.36, S / 2 + Math.sin(a) * S * 0.36); g.stroke(); }
  }), true, false);
  T.blood = tex(sprite(128, (g, S) => {
    const r = mulberry32(9);
    g.fillStyle = 'rgba(90,6,6,0.9)';
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.16, 0, 6.28); g.fill();
    for (let i = 0; i < 30; i++) {
      const a = r() * 6.28, d = S * (0.1 + r() * 0.35), rr = S * (0.01 + r() * 0.05);
      g.fillStyle = `rgba(${80 + r() * 40},${4 + r() * 8},${4 + r() * 8},${0.6 + r() * 0.35})`;
      g.beginPath(); g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rr, 0, 6.28); g.fill();
    }
  }), true, false);
  T.scorch = tex(sprite(128, (g, S) => radial(g, S, [[0, 'rgba(10,10,10,0.95)'], [0.4, 'rgba(25,22,20,0.7)'], [1, 'rgba(0,0,0,0)']])), true, false);
  T.flagGR = tex(sprite(64, (g) => {
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#0d5eaf'; g.fillRect(0, i * (42 / 9), 64, 42 / 9 + 0.5); }
    g.fillStyle = '#0d5eaf'; g.fillRect(0, 0, 24, 23);
    g.fillStyle = '#fff'; g.fillRect(9.5, 0, 5, 23); g.fillRect(0, 9, 24, 5);
  }), true, false);
  T.ekam = tex(makeTextCanvas('ΕΚΑΜ', { w: 256, h: 64, bg: '#111317', fg: '#d9d9d9', font: 'bold 44px sans-serif' }), true, false);
  T.moon = tex(sprite(128, (g, S) => {
    radial(g, S, [[0, 'rgba(255,252,240,1)'], [0.42, 'rgba(240,238,225,1)'], [0.47, 'rgba(230,228,215,0.6)'], [0.5, 'rgba(200,200,190,0)'], [1, 'rgba(0,0,0,0)']]);
    const r = mulberry32(12);
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.28, d = r() * S * 0.3;
      g.fillStyle = `rgba(150,150,140,${0.15 + r() * 0.2})`;
      g.beginPath(); g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 3 + r() * 9, 0, 6.28); g.fill();
    }
  }), true, false);
  progress(1, 'tamam');
  return T;
}
