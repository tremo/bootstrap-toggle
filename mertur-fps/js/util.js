// Ortak yardımcılar: tohumlu RNG, periyodik gürültü, matematik.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (r, a, b) => a + (b - a) * r();
export const DEG = Math.PI / 180;

// Periyodik (döşenebilir) gradyan gürültüsü — doku üretimi için.
const PERM = new Uint8Array(512);
const GRAD = new Float32Array(512 * 2);
{
  const r = mulberry32(1337);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    const a = r() * Math.PI * 2;
    GRAD[i * 2] = Math.cos(a);
    GRAD[i * 2 + 1] = Math.sin(a);
  }
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function pnoise2(x, y, px = 256, py = 256) {
  let xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const g = (ix, iy, dx, dy) => {
    const h = PERM[(PERM[ix & 255] + iy) & 511] * 2;
    return GRAD[h] * dx + GRAD[h + 1] * dy;
  };
  const n00 = g(x0, y0, xf, yf), n10 = g(x1, y0, xf - 1, yf);
  const n01 = g(x0, y1, xf, yf - 1), n11 = g(x1, y1, xf - 1, yf - 1);
  const u = fade(xf), v = fade(yf);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.414;
}

// Döşenebilir fbm: (x,y) 0..1 aralığında, taban frekansı f (tamsayı).
export function tfbm(x, y, f = 4, oct = 5, gain = 0.5) {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * pnoise2(x * f, y * f, f, f);
    n += a; a *= gain; f *= 2;
  }
  return s / n;
}

// Anizotropik döşenebilir fbm (fx, fy tamsayı)
export function tfbm2(x, y, fx, fy, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * pnoise2(x * fx, y * fy, fx, fy);
    n += a; a *= 0.5; fx *= 2; fy *= 2;
  }
  return s / n;
}

// Periyodik olmayan dünya gürültüsü (arazi).
export function noise2(x, y) { return pnoise2(x, y, 256, 256); }
export function fbm2(x, y, oct = 5, gain = 0.5, lac = 2.0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * noise2(x * f + o * 17.3, y * f - o * 9.1);
    n += a; a *= gain; f *= lac;
  }
  return s / n;
}

// Döşenebilir Worley (hücresel) gürültü: F1, F2 ve hücre kimliği.
export function worley(x, y, cells, seed = 0) {
  const cx = Math.floor(x * cells), cy = Math.floor(y * cells);
  let f1 = 9, f2 = 9, id = 0;
  const fx = x * cells, fy = y * cells;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells;
      const h = hash2(wx, wy, seed);
      const px = gx + h[0], py = gy + h[1];
      const d = Math.hypot(px - fx, py - fy);
      if (d < f1) { f2 = f1; f1 = d; id = h[2]; } else if (d < f2) f2 = d;
    }
  }
  return [f1, f2, id];
}
const _h = [0, 0, 0];
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const a = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  h = Math.imul(h ^ 0x5bd1e995, 1540483477);
  const b = ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  h = Math.imul(h ^ 0x27d4eb2d, 668265263);
  const c = ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  _h[0] = a; _h[1] = b; _h[2] = c;
  return _h;
}

// 2B nokta-çokgen testi
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
