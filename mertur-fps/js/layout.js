// Mertur Tatil Köyü yerleşimi — 1/500 vaziyet planından uyarlanmıştır:
// S tipi (26 adet) apart dubleks: köşegen sınır boyunca yay çizen 13 ikiz blok,
// E tipi (14 adet) apart: kuzeydoğuda ikinci havuzun çevresinde 7 blok,
// M tipi (20 oda) motel: resepsiyondan kıyıya kademeli inen sıra,
// G gazino/çarşı, D demontabl podyum-bar, R resepsiyon, K disko, T umuma açık alanlar,
// bekçi-kabul, büfe, şarap çeşmesi, çiçek serası, çocuk bahçesi, çay bahçesi, deniz sporları.
import { diagPoint, DIAG, DIAG_N, DIAG_ROT, SITE_WALL_Z, SW_CORNER, APEX, SE_CORNER, accessRoadCenter } from './terrain.js';
import { mulberry32 } from './util.js';

const deg = Math.PI / 180;
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

export const GARDEN_S = [-14, -4]; // S iç bahçe merkezi (pinpon)

export const BUILDINGS = [];
// S sırası: köşegen boyunca 7 ikiz blok (S1-2 … S13-14)
for (let k = 0; k < 7; k++) {
  const t = 30 + k * 13.6;
  const [x, z] = diagPoint(t, 11.5);
  BUILDINGS.push({ type: 'S', x, z, rot: DIAG_ROT, w: 9, d: 8.4, h: 6.1, label: `S${k * 2 + 1}-${k * 2 + 2}` });
}
// S yayı: bahçeye dönük 6 blok (S15-16 … S25-26)
[[6, -38], [17.5, -29.5], [24, -18], [26, -6], [25, 6], [20, 17]].forEach(([x, z], k) => {
  BUILDINGS.push({ type: 'S', x, z, rot: faceTo(x, z, GARDEN_S[0], GARDEN_S[1]), w: 9, d: 8.4, h: 6.1, label: `S${15 + k * 2}-${16 + k * 2}` });
});
// M motel: kademeli sıra (batıya, bahçeye bakar)
[[44, -27], [47.5, -18.5], [51, -10], [54.5, -1.5], [58, 7]].forEach(([x, z], k) => {
  BUILDINGS.push({ type: 'M', x, z, rot: -90 * deg + 22 * deg, w: 11, d: 5.8, h: 3.3, label: `M${k * 4 + 1}-${k * 4 + 4}` });
});
// R resepsiyon (otoparka bakar)
BUILDINGS.push({ type: 'R', x: 36, z: -44, rot: faceTo(36, -44, 18, -58), w: 13, d: 8, h: 3.7, label: 'R' });
// G gazino / çarşı
BUILDINGS.push({ type: 'G', x: 72, z: -24, rot: -115 * deg, w: 17, d: 11, h: 6.9, label: 'G' });
// D demontabl podyum-bar (teras)
BUILDINGS.push({ type: 'D', x: 72, z: 12, rot: 180 * deg + 8 * deg, w: 14, d: 10, h: 0.55, label: 'D' });
// K disko
BUILDINGS.push({ type: 'K', x: 88, z: 0, rot: -90 * deg, w: 11, d: 9, h: 4.2, label: 'K' });
// E kümesi: E havuzu çevresinde 7 blok
export const E_POOL = { x: 64, z: -62 };
for (let k = 0; k < 7; k++) {
  const a = (-150 + k * 48) * deg;
  const x = E_POOL.x + Math.sin(a) * 17, z = E_POOL.z + Math.cos(a) * 17;
  BUILDINGS.push({ type: 'E', x, z, rot: faceTo(x, z, E_POOL.x, E_POOL.z), w: 10.8, d: 6.6, h: 3.4, label: `E${k * 2 + 1}-${k * 2 + 2}` });
}
// küçük yapılar
BUILDINGS.push({ type: 'BEKCI', x: -84, z: 25.5, rot: 0, w: 2.8, d: 2.8, h: 2.7, label: 'Bekçi-Kabul' });
BUILDINGS.push({ type: 'BUFE', x: 40, z: 25, rot: 0, w: 4.4, d: 3.2, h: 2.9, label: 'Büfe' });
BUILDINGS.push({ type: 'SERA', x: 38, z: -82, rot: DIAG_ROT - 90 * deg, w: 11, d: 5, h: 3.2, label: 'Çiçek serası' });
BUILDINGS.push({ type: 'HUT', x: 22, z: 49, rot: 0, w: 4.5, d: 3.2, h: 2.6, label: 'Deniz sporları' });
BUILDINGS.push({ type: 'PUMP', x: 58, z: -96, rot: DIAG_ROT, w: 4, d: 3, h: 2.6, label: 'Hidrofor' });

// Havuzlar (yerel eksenlerde; ana havuz fotoğraftaki gibi dikdörtgen + tuğla döşeme)
export const POOLS = [
  { id: 'main', x: -24, z: 9, rot: 0, w: 21, d: 9.5, depth: 1.7, shape: 'rect', deck: 4.5 },
  { id: 'E', x: E_POOL.x, z: E_POOL.z, rot: 20 * deg, w: 12, d: 7, depth: 1.5, shape: 'kidney', deck: 3 },
];
// Havuz kenarı kameriye (kırmızı kiremitli yuvarlak çardak)
export const GAZEBO = { x: -6.5, z: 16.5, r: 3.4 };

// Duvarlar: [x1,z1,x2,z2,yükseklik,kalınlık]
export const WALLS = [];
function wall(a, b, h = 1.0, t = 0.3, gaps = []) {
  // gaps: [t0,t1] oranları
  let segs = [[0, 1]];
  for (const g of gaps) {
    segs = segs.flatMap(([s, e]) => (g[1] <= s || g[0] >= e) ? [[s, e]] : [[s, g[0]], [g[1], e]].filter(([p, q]) => q - p > 0.01));
  }
  for (const [s, e] of segs) {
    WALLS.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, h, t]);
  }
}
// güney (sahil yolu) duvarı: kapılar
{
  const L = SE_CORNER[0] - SW_CORNER[0];
  const g = (x, w) => [(x - w / 2 - SW_CORNER[0]) / L, (x + w / 2 - SW_CORNER[0]) / L];
  wall([SW_CORNER[0], SITE_WALL_Z], [SE_CORNER[0], SITE_WALL_Z], 1.05, 0.35, [g(-88, 5), g(-30, 3), g(8, 3), g(60, 3)]);
}
// batı (köşegen) duvarı — otopark girişi boşluğu
wall(SW_CORNER, APEX, 1.6, 0.35, [[0.02, 0.06], [0.6, 0.66]]);
// doğu duvarı
wall(APEX, SE_CORNER, 1.6, 0.35, []);

// S bloklarının ön bahçe duvarları (alçak siper)
for (const b of BUILDINGS.filter((b) => b.type === 'S')) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const L = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  const fz = b.d / 2 + 3.2;
  wall(L(-b.w / 2, b.d / 2), L(-b.w / 2, fz), 0.9, 0.25);
  wall(L(b.w / 2, b.d / 2), L(b.w / 2, fz), 0.9, 0.25);
  wall(L(-b.w / 2, fz), L(b.w / 2, fz), 0.9, 0.25, [[0.18, 0.3], [0.7, 0.82]]);
  wall(L(-0.05, b.d / 2), L(-0.05, fz), 0.9, 0.2);
}

// Yollar: [[x,z], ...], genişlik
export const PATHS = [];
{
  const p = [];
  for (let t = 18; t <= 128; t += 10) p.push(diagPoint(t, 22));
  PATHS.push({ pts: p, w: 2.2 });
}
PATHS.push({ pts: [[-86, 30], [-84, 22], diagPoint(18, 22)], w: 2.4 });
for (const b of BUILDINGS.filter((b) => b.type === 'S')) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const fx = b.x + (b.d / 2 + 3.2) * s, fz = b.z + (b.d / 2 + 3.2) * c;
  PATHS.push({ pts: [[fx, fz], [(fx + GARDEN_S[0]) / 2 + 2, (fz + GARDEN_S[1]) / 2 - 1], GARDEN_S], w: 1.5 });
}
PATHS.push({ pts: [[-30, 30.5], [-30, 21], [-24, 17], [-6, 22], [8, 30.5]], w: 2.0 });
PATHS.push({ pts: [[8, 30.5], [14, 24], [32, 22], [40, 21], [60, 30.5]], w: 2.0 });
PATHS.push({ pts: [GARDEN_S, [-4, 4], [-6, 13]], w: 1.6 });
PATHS.push({ pts: [[34, 21], [36, 8], [36, -8], [34, -24], [36, -38]], w: 2.2 });
PATHS.push({ pts: [[36, -38], [46, -44], [52, -50], [E_POOL.x - 8, E_POOL.z + 6]], w: 2.0 });
PATHS.push({ pts: [[40, 21], [56, 20], [66, 16]], w: 2.0 });
PATHS.push({ pts: [[36, -8], [50, -14], [62, -22]], w: 1.8 });
PATHS.push({ pts: [[62, 16], [76, 6], [82, 0]], w: 1.8 });
PATHS.push({ pts: [[28, -50], [36, -44]], w: 2.4 });
// E çevre yolu
{
  const p = [];
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    p.push([E_POOL.x + Math.sin(a) * 11.5, E_POOL.z + Math.cos(a) * 11.5]);
  }
  PATHS.push({ pts: p, w: 1.6 });
}

// Otopark (O.P.) — plandaki gibi köşegene bitişik
export const PARKING = { x: 0, z: 0, rot: DIAG_ROT, w: 32, d: 13 };
{
  const [x, z] = diagPoint(150, 10);
  PARKING.x = x; PARKING.z = z;
}
export const ACCESS_ROAD = [];
for (let t = -14; t <= 330; t += 8) ACCESS_ROAD.push(accessRoadCenter(t));

// Açık alanlar (T): çocuk bahçesi, çay bahçesi, deniz sporları; şarap çeşmesi; kahvaltı tenteleri
export const PLAYGROUND = { x: -48, z: 21 };
export const TEA_GARDEN = { x: 4, z: 23 };
export const WINE_FOUNTAIN = { x: 52, z: 15 };
export const BREAKFAST = { x: 64, z: 24 };
export const PINGPONG = { x: GARDEN_S[0] + 3, z: GARDEN_S[1] - 3, rot: 25 * deg };

// Park etmiş araçlar (sahil yolu kenarı + otopark)
export const CARS = [];
{
  const r = mulberry32(99);
  for (let x = -92; x < 100; x += 5.4 + r() * 6) {
    if (Math.abs(x - 22) < 5) continue;
    if (r() < 0.25) continue;
    CARS.push({ x, z: 42.2, rot: Math.PI / 2 + (r() - 0.5) * 0.05, kind: Math.floor(r() * 3), color: Math.floor(r() * 7) });
  }
  const c = Math.cos(PARKING.rot), s = Math.sin(PARKING.rot);
  for (let k = 0; k < 10; k++) {
    if (r() < 0.3) continue;
    const lx = -13.5 + k * 3, lz = k % 2 ? -3.5 : -3.5;
    CARS.push({ x: PARKING.x + lx * c + lz * s, z: PARKING.z - lx * s + lz * c, rot: PARKING.rot + Math.PI, kind: Math.floor(r() * 3), color: Math.floor(r() * 7) });
  }
}

// Sabit ağaçlar tesis içinde: tür, x, z, ölçek
export const SITE_TREES = [];
{
  const r = mulberry32(7);
  // havuz çevresi palmiyeler
  [[-37, 2], [-37, 17], [-11, 2.5], [-9, 20], [-28, 18], [2, 10], [30, 26], [-44, 26], [14, 28]].forEach(([x, z]) => SITE_TREES.push({ kind: 'palm', x, z, s: 0.85 + r() * 0.4 }));
  // büyük kızılçamlar
  [[-22, -8], [-2, -16], [8, -4], [-30, -30], [2, -48], [30, -56], [48, -38], [80, -40], [86, -12], [60, -86], [20, -70], [70, -100], [-60, 28], [-70, 5], [-4, 30], [48, 28], [80, 26], [12, -20]].forEach(([x, z]) => SITE_TREES.push({ kind: 'pine', x, z, s: 0.8 + r() * 0.45 }));
  // zeytinler
  [[-10, -14], [14, 4], [40, -18], [42, 4], [64, -38], [48, -70], [70, -80], [30, -96], [50, -108], [74, -112], [-18, 22], [22, -46]].forEach(([x, z]) => SITE_TREES.push({ kind: 'olive', x, z, s: 0.8 + r() * 0.5 }));
}

// Pusu / saklanma noktaları (dalga başında gizlenen düşmanlar için)
export function roofSpots() {
  return BUILDINGS.filter((b) => b.type === 'S' || b.type === 'G').map((b) => ({ x: b.x, z: b.z, y: b.h, rot: b.rot, b }));
}

export const PLAY_BOUNDS = { x0: -150, x1: 150, z0: -160, z1: 95 };

export const LABELS = [
  ...BUILDINGS.map((b) => ({ t: b.label, x: b.x, z: b.z })),
  { t: 'HAVUZ', x: POOLS[0].x, z: POOLS[0].z },
  { t: 'HAVUZ', x: POOLS[1].x, z: POOLS[1].z },
];
