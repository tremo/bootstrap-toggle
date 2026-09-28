// Palamutbükü arazi modeli. Koordinatlar: x = doğu, z = güney (deniz +z), y = yukarı, metre.
// Tesis alanı plandaki gibi kıyıdan ~2–3 m kotta düz; batıda bağlantı yolunun ötesinde dik yamaç,
// kuzeyde Datça yarımadasının sırtı, açıkta Palamutbükü adacığı.
import { smoothstep, fbm2, clamp, noise2 } from './util.js';

export const SW_CORNER = [-98, 30.5];
export const APEX = [88, -122];
export const SE_CORNER = [104, 30.5];
const dx = APEX[0] - SW_CORNER[0], dz = APEX[1] - SW_CORNER[1];
const dl = Math.hypot(dx, dz);
export const DIAG = [dx / dl, dz / dl]; // batı sınırı boyunca (kuzeydoğuya)
export const DIAG_N = [-DIAG[1], DIAG[0]]; // içeri bakan normal (güneydoğuya)
export const DIAG_ROT = Math.atan2(DIAG_N[0], DIAG_N[1]);
export const DIAG_LEN = dl;

export const ROAD_Z0 = 33, ROAD_Z1 = 40; // sahil yolu
export const SITE_WALL_Z = 30.5;

export function shoreZ(x) {
  const ax = Math.abs(x);
  return 66 + 3.5 * Math.sin(x * 0.0125 + 0.4) + 2 * Math.sin(x * 0.041)
    + 430 * smoothstep(380, 1250, ax) * (x < 0 ? 1 : 0.8);
}

// Batı (köşegen) sınırına işaretli uzaklık: + dışarı (batı/kuzeybatı)
export function westDist(x, z) {
  return -((x - SW_CORNER[0]) * DIAG_N[0] + (z - SW_CORNER[1]) * DIAG_N[1]);
}
export function diagPoint(t, off) {
  return [SW_CORNER[0] + DIAG[0] * t + DIAG_N[0] * off, SW_CORNER[1] + DIAG[1] * t + DIAG_N[1] * off];
}

// Bağlantı yolu (köşegenin 7 m dışında, sahil yolundan kuzeye tırmanır)
export function accessRoadCenter(t) { return diagPoint(t, -7); }

function ridge(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < 5; o++) {
    const n = 1 - Math.abs(noise2(x * f + o * 31.7, z * f - o * 11.3));
    s += a * n * n; a *= 0.5; f *= 2.03;
  }
  return s;
}

export function heightAt(x, z) {
  const sz = shoreZ(x);
  const d = sz - z; // karaya doğru uzaklık
  let h;
  if (d < 0) {
    const o = -d;
    h = -(o * 0.08 + Math.max(0, o - 15) * 0.2 + Math.max(0, o - 120) * 0.2);
    h += fbm2(x * 0.012, z * 0.012, 3) * 1.6 * smoothstep(0, 40, o);
  } else {
    const b = clamp(d / 24, 0, 1);
    h = 2.0 * (1 - Math.pow(1 - b, 1.7));
    if (d > 24) h = 2.0 + (d - 24) * 0.0032;
  }
  // tesis dışı hafif dalgalanma
  const site = siteMask(x, z);
  if (d > 30) h += (1 - site) * fbm2(x * 0.02, z * 0.02, 3) * 0.6 * smoothstep(30, 70, d);

  // batı yamacı (bağlantı yolunun ötesi)
  const w = westDist(x, z) - 14;
  if (w > 0) {
    const coast = smoothstep(26, 46, d);
    const hill = (Math.min(w, 70) * 0.55 + Math.max(0, w - 70) * 0.25) * (0.85 + 0.35 * fbm2(x * 0.008, z * 0.008, 3));
    h += hill * coast * smoothstep(0, 10, w);
  }
  // kuzey sırtı
  const north = -z - 150;
  if (north > 0) {
    const k = 540 * Math.pow(smoothstep(0, 2400, north), 0.9) * (1 - 0.85 * smoothstep(3200, 6200, north)) * (0.75 + 0.5 * fbm2(x * 0.0011 + 3, z * 0.0011, 4));
    const r = ridge(x * 0.0022, z * 0.0022) * 22 * smoothstep(0, 300, north);
    h += (k + r) * smoothstep(0, 120, north);
  }
  // burunlar (koyun iki ucu)
  const ax = Math.abs(x);
  if (ax > 300 && d > 0) {
    const cap = smoothstep(300, 950, ax) * (110 + 70 * fbm2(x * 0.004, z * 0.004, 4)) * smoothstep(0, 70, d);
    h += cap;
  }
  // Palamutbükü adacığı
  const ix = x - 560, iz = z - 1180;
  const r2 = (ix * ix) / (95 * 95) + (iz * iz) / (55 * 55);
  if (r2 < 4) h = Math.max(h, 26 * Math.exp(-r2 * 1.6) - 5 + fbm2(x * 0.05, z * 0.05, 3) * 3);
  // uzak kenarlar denize iner (ızgara sınırı görünmesin)
  const edge = Math.max(Math.abs(x), Math.abs(z + 600) * 1.15);
  if (edge > 5200) h = h + (Math.min(h, -25) - h) * smoothstep(5200, 7600, edge);
  return h;
}

// Tesis parseli üçgeni (0..1 yumuşak maske)
export const SITE_POLY = [SW_CORNER, APEX, SE_CORNER];
export function siteMask(x, z) {
  const w = westDist(x, z); // + dışarı
  const s = z - SITE_WALL_Z; // + güney (dışarı)
  // doğu sınırı
  const ex = APEX[0] + (z - APEX[1]) / (SE_CORNER[1] - APEX[1]) * (SE_CORNER[0] - APEX[0]);
  const e = x - ex;
  const m = Math.max(w, s, e);
  return 1 - smoothstep(-2, 6, m);
}

// Yüzey türü (ayak sesi / mermi izi): 'water','sand','grass','stone','asphalt','dirt'
export function surfaceAt(x, z, groundY) {
  if (groundY < 0.05) return 'water';
  const d = shoreZ(x) - z;
  if (z > ROAD_Z0 && z < ROAD_Z1 && Math.abs(x) < 600) return 'asphalt';
  if (d < 25 && z > ROAD_Z1) return 'sand';
  if (siteMask(x, z) > 0.5) return 'grass';
  return 'dirt';
}

// ---- Değişken çözünürlüklü arazi ızgarası (merkezde ~1 m, kenarda ~90 m) ----
export const GRID = {
  N: 400, // bölüm
  S: 8000, // yarı genişlik
  a: 0.025,
  p: 7,
  cx: 0, cz: -10,
};
export function gridCoord(u) { // u ∈ [-1,1] → metre
  const { S, a, p } = GRID;
  const s = Math.sign(u), au = Math.abs(u);
  return s * S * (a * au + (1 - a) * Math.pow(au, p));
}
let INV_LUT = null; const LUT_STEP = 0.25, LUT_MAX = 900;
function buildInvLut() {
  const n = Math.ceil(LUT_MAX / LUT_STEP) + 1;
  INV_LUT = new Float32Array(n);
  for (let i = 0; i < n; i++) INV_LUT[i] = gridInverseNewton(i * LUT_STEP);
}
export function gridInverse(x) {
  const ax = Math.abs(x);
  if (INV_LUT && ax < LUT_MAX - 1) {
    const f = ax / LUT_STEP, i = Math.floor(f), t = f - i;
    const u = INV_LUT[i] + (INV_LUT[i + 1] - INV_LUT[i]) * t;
    return x < 0 ? -u : u;
  }
  return gridInverseNewton(x);
}
function gridInverseNewton(x) { // metre → u (Newton)
  const { S, a, p } = GRID;
  const s = Math.sign(x), ax = Math.min(Math.abs(x) / S, 1);
  let u = Math.min(ax / a, Math.pow(ax, 1 / p));
  for (let i = 0; i < 20; i++) {
    const f = a * u + (1 - a) * Math.pow(u, p) - ax;
    const df = a + p * (1 - a) * Math.pow(u, p - 1);
    u -= f / df;
    u = clamp(u, 0, 1);
  }
  return s * u;
}

let HGRID = null, XS = null;
export function buildHeightGrid() {
  const { N, cx, cz } = GRID;
  buildInvLut();
  XS = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) XS[i] = gridCoord(i / N * 2 - 1);
  HGRID = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) {
    const z = XS[j] + cz;
    for (let i = 0; i <= N; i++) HGRID[j * (N + 1) + i] = heightAt(XS[i] + cx, z);
  }
  return { XS, HGRID };
}

// Mesh üçgenlemesiyle birebir uyumlu zemin yüksekliği
export function groundAt(x, z) {
  if (!HGRID) return heightAt(x, z);
  const { N, cx, cz } = GRID;
  const u = (gridInverse(x - cx) + 1) * 0.5 * N;
  const v = (gridInverse(z - cz) + 1) * 0.5 * N;
  let i = Math.floor(u), j = Math.floor(v);
  if (i < 0 || j < 0 || i >= N || j >= N) return heightAt(x, z);
  const x0 = XS[i], x1 = XS[i + 1], z0 = XS[j], z1 = XS[j + 1];
  const fx = (x - cx - x0) / (x1 - x0), fz = (z - cz - z0) / (z1 - z0);
  const W = N + 1;
  const h00 = HGRID[j * W + i], h10 = HGRID[j * W + i + 1], h01 = HGRID[(j + 1) * W + i], h11 = HGRID[(j + 1) * W + i + 1];
  // PlaneGeometry üçgenleri: (a=i,j  b=i,j+1  d=i+1,j) ve (b, c=i+1,j+1, d)
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

export function slopeAt(x, z) {
  const e = 0.8;
  const hx = groundAt(x + e, z) - groundAt(x - e, z);
  const hz = groundAt(x, z + e) - groundAt(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}
